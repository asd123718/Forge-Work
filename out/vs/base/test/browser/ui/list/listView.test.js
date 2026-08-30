import assert from "assert";
import { CachedListVirtualDelegate } from "../../../../browser/ui/list/list.js";
import { ListView } from "../../../../browser/ui/list/listView.js";
import { range } from "../../../../common/arrays.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../common/utils.js";
suite("ListView", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("all rows get disposed", function() {
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
    const listView = new ListView(element, delegate, [renderer]);
    listView.layout(200);
    assert.strictEqual(templatesCount, 0, "no templates have been allocated");
    listView.splice(0, 0, range(100));
    assert.strictEqual(templatesCount, 10, "some templates have been allocated");
    listView.dispose();
    assert.strictEqual(templatesCount, 0, "all templates have been disposed");
  });
  test("batches horizontal width measurements", function() {
    const element = document.createElement("div");
    element.style.height = "100px";
    element.style.width = "200px";
    document.body.appendChild(element);
    const delegate = {
      getHeight() {
        return 20;
      },
      getTemplateId() {
        return "template";
      }
    };
    const rows = [];
    const widthReads = [];
    const renderer = {
      templateId: "template",
      renderTemplate(container) {
        const rowIndex = rows.length;
        const paddingLeft = rowIndex;
        const paddingRight = rowIndex * 2;
        rows.push(container);
        container.style.paddingLeft = `${paddingLeft}px`;
        container.style.paddingRight = `${paddingRight}px`;
        container.style.borderLeft = "1px solid";
        container.style.borderRight = "2px solid";
        Object.defineProperty(container, "offsetWidth", {
          configurable: true,
          get: () => {
            widthReads.push({
              renderedRows: rows.length,
              fitContentRows: rows.filter((row) => row.style.width === "fit-content").length
            });
            return 100 + rowIndex + paddingLeft + paddingRight + 3;
          }
        });
      },
      renderElement() {
      },
      disposeTemplate() {
      }
    };
    const listView = new ListView(element, delegate, [renderer], { horizontalScrolling: true });
    try {
      const expectedBatch = range(5).map(() => ({ renderedRows: 5, fitContentRows: 5 }));
      const results = [];
      listView.layout(100, 200);
      listView.splice(0, 0, range(10));
      results.push({
        phase: "splice",
        widthReads: widthReads.slice(),
        contentWidth: listView.contentWidth,
        rowWidths: rows.map((row) => row.style.width)
      });
      widthReads.length = 0;
      listView.setScrollTop(100);
      results.push({
        phase: "scroll",
        widthReads: widthReads.slice(),
        contentWidth: listView.contentWidth,
        rowWidths: rows.map((row) => row.style.width)
      });
      widthReads.length = 0;
      listView.updateOptions({ horizontalScrolling: false });
      listView.updateOptions({ horizontalScrolling: true });
      results.push({
        phase: "enable",
        widthReads: widthReads.slice(),
        contentWidth: listView.contentWidth,
        rowWidths: rows.map((row) => row.style.width)
      });
      assert.deepStrictEqual(results, [
        { phase: "splice", widthReads: expectedBatch, contentWidth: 0, rowWidths: ["", "", "", "", ""] },
        { phase: "scroll", widthReads: expectedBatch, contentWidth: 0, rowWidths: ["", "", "", "", ""] },
        { phase: "enable", widthReads: expectedBatch, contentWidth: 116, rowWidths: ["", "", "", "", ""] }
      ]);
    } finally {
      listView.dispose();
      element.remove();
    }
  });
  test("publishes freshly measured dynamic heights", function() {
    const element = document.createElement("div");
    element.style.height = "200px";
    element.style.width = "200px";
    document.body.appendChild(element);
    const delegate = new class extends CachedListVirtualDelegate {
      estimateHeight() {
        return 100;
      }
      getTemplateId() {
        return "template";
      }
      hasDynamicHeight() {
        return true;
      }
      getMeasuredHeight(element2) {
        return this.getCachedHeight(element2);
      }
    }();
    const renderer = {
      templateId: "template",
      renderTemplate(container) {
        const content = document.createElement("div");
        container.appendChild(content);
        return content;
      },
      renderElement(element2, _index, templateData) {
        templateData.style.height = `${element2.height}px`;
      },
      disposeTemplate() {
      }
    };
    const elements = [{ height: 40 }, { height: 100 }, { height: 160 }];
    const listView = new ListView(element, delegate, [renderer], { supportDynamicHeights: true });
    try {
      listView.layout(200, 200);
      listView.splice(0, 0, elements);
      assert.deepStrictEqual(elements.map((element2) => delegate.getMeasuredHeight(element2)), [40, 100, 160]);
    } finally {
      listView.dispose();
      element.remove();
    }
  });
  test("publishes positive delegate-provided dynamic heights", function() {
    const publishedHeights = /* @__PURE__ */ new Map();
    const delegate = {
      getHeight() {
        return 100;
      },
      getTemplateId() {
        return "template";
      },
      getDynamicHeight(element) {
        return element.height;
      },
      setDynamicHeight(element, height) {
        publishedHeights.set(element, height);
      }
    };
    const renderer = {
      templateId: "template",
      renderTemplate() {
      },
      renderElement() {
      },
      disposeTemplate() {
      }
    };
    const elements = [{ height: 0 }, { height: 40 }, { height: 100 }, { height: 160 }];
    const listView = new ListView(document.createElement("div"), delegate, [renderer], { supportDynamicHeights: true });
    try {
      listView.layout(400, 200);
      listView.splice(0, 0, elements);
      assert.deepStrictEqual(elements.map((element) => publishedHeights.get(element)), [void 0, 40, 100, 160]);
    } finally {
      listView.dispose();
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxicm93c2VyXFx1aVxcbGlzdFxcbGlzdFZpZXcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhY2hlZExpc3RWaXJ0dWFsRGVsZWdhdGUsIElMaXN0UmVuZGVyZXIsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgTGlzdFZpZXcgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3VpL2xpc3QvbGlzdFZpZXcuanMnO1xuaW1wb3J0IHsgcmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdMaXN0VmlldycsIGZ1bmN0aW9uICgpIHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYWxsIHJvd3MgZ2V0IGRpc3Bvc2VkJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRlbGVtZW50LnN0eWxlLmhlaWdodCA9ICcyMDBweCc7XG5cdFx0ZWxlbWVudC5zdHlsZS53aWR0aCA9ICcyMDBweCc7XG5cblx0XHRjb25zdCBkZWxlZ2F0ZTogSUxpc3RWaXJ0dWFsRGVsZWdhdGU8bnVtYmVyPiA9IHtcblx0XHRcdGdldEhlaWdodCgpIHsgcmV0dXJuIDIwOyB9LFxuXHRcdFx0Z2V0VGVtcGxhdGVJZCgpIHsgcmV0dXJuICd0ZW1wbGF0ZSc7IH1cblx0XHR9O1xuXG5cdFx0bGV0IHRlbXBsYXRlc0NvdW50ID0gMDtcblxuXHRcdGNvbnN0IHJlbmRlcmVyOiBJTGlzdFJlbmRlcmVyPG51bWJlciwgdm9pZD4gPSB7XG5cdFx0XHR0ZW1wbGF0ZUlkOiAndGVtcGxhdGUnLFxuXHRcdFx0cmVuZGVyVGVtcGxhdGUoKSB7IHRlbXBsYXRlc0NvdW50Kys7IH0sXG5cdFx0XHRyZW5kZXJFbGVtZW50KCkgeyB9LFxuXHRcdFx0ZGlzcG9zZVRlbXBsYXRlKCkgeyB0ZW1wbGF0ZXNDb3VudC0tOyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGxpc3RWaWV3ID0gbmV3IExpc3RWaWV3PG51bWJlcj4oZWxlbWVudCwgZGVsZWdhdGUsIFtyZW5kZXJlcl0pO1xuXHRcdGxpc3RWaWV3LmxheW91dCgyMDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlbXBsYXRlc0NvdW50LCAwLCAnbm8gdGVtcGxhdGVzIGhhdmUgYmVlbiBhbGxvY2F0ZWQnKTtcblx0XHRsaXN0Vmlldy5zcGxpY2UoMCwgMCwgcmFuZ2UoMTAwKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlbXBsYXRlc0NvdW50LCAxMCwgJ3NvbWUgdGVtcGxhdGVzIGhhdmUgYmVlbiBhbGxvY2F0ZWQnKTtcblx0XHRsaXN0Vmlldy5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlbXBsYXRlc0NvdW50LCAwLCAnYWxsIHRlbXBsYXRlcyBoYXZlIGJlZW4gZGlzcG9zZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnYmF0Y2hlcyBob3Jpem9udGFsIHdpZHRoIG1lYXN1cmVtZW50cycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZWxlbWVudC5zdHlsZS5oZWlnaHQgPSAnMTAwcHgnO1xuXHRcdGVsZW1lbnQuc3R5bGUud2lkdGggPSAnMjAwcHgnO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZWxlbWVudCk7XG5cblx0XHRjb25zdCBkZWxlZ2F0ZTogSUxpc3RWaXJ0dWFsRGVsZWdhdGU8bnVtYmVyPiA9IHtcblx0XHRcdGdldEhlaWdodCgpIHsgcmV0dXJuIDIwOyB9LFxuXHRcdFx0Z2V0VGVtcGxhdGVJZCgpIHsgcmV0dXJuICd0ZW1wbGF0ZSc7IH1cblx0XHR9O1xuXG5cdFx0Y29uc3Qgcm93czogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRcdGNvbnN0IHdpZHRoUmVhZHM6IHsgcmVuZGVyZWRSb3dzOiBudW1iZXI7IGZpdENvbnRlbnRSb3dzOiBudW1iZXIgfVtdID0gW107XG5cdFx0Y29uc3QgcmVuZGVyZXI6IElMaXN0UmVuZGVyZXI8bnVtYmVyLCB2b2lkPiA9IHtcblx0XHRcdHRlbXBsYXRlSWQ6ICd0ZW1wbGF0ZScsXG5cdFx0XHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXIpIHtcblx0XHRcdFx0Y29uc3Qgcm93SW5kZXggPSByb3dzLmxlbmd0aDtcblx0XHRcdFx0Y29uc3QgcGFkZGluZ0xlZnQgPSByb3dJbmRleDtcblx0XHRcdFx0Y29uc3QgcGFkZGluZ1JpZ2h0ID0gcm93SW5kZXggKiAyO1xuXHRcdFx0XHRyb3dzLnB1c2goY29udGFpbmVyKTtcblx0XHRcdFx0Y29udGFpbmVyLnN0eWxlLnBhZGRpbmdMZWZ0ID0gYCR7cGFkZGluZ0xlZnR9cHhgO1xuXHRcdFx0XHRjb250YWluZXIuc3R5bGUucGFkZGluZ1JpZ2h0ID0gYCR7cGFkZGluZ1JpZ2h0fXB4YDtcblx0XHRcdFx0Y29udGFpbmVyLnN0eWxlLmJvcmRlckxlZnQgPSAnMXB4IHNvbGlkJztcblx0XHRcdFx0Y29udGFpbmVyLnN0eWxlLmJvcmRlclJpZ2h0ID0gJzJweCBzb2xpZCc7XG5cdFx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShjb250YWluZXIsICdvZmZzZXRXaWR0aCcsIHtcblx0XHRcdFx0XHRjb25maWd1cmFibGU6IHRydWUsXG5cdFx0XHRcdFx0Z2V0OiAoKSA9PiB7XG5cdFx0XHRcdFx0XHR3aWR0aFJlYWRzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRyZW5kZXJlZFJvd3M6IHJvd3MubGVuZ3RoLFxuXHRcdFx0XHRcdFx0XHRmaXRDb250ZW50Um93czogcm93cy5maWx0ZXIocm93ID0+IHJvdy5zdHlsZS53aWR0aCA9PT0gJ2ZpdC1jb250ZW50JykubGVuZ3RoXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHJldHVybiAxMDAgKyByb3dJbmRleCArIHBhZGRpbmdMZWZ0ICsgcGFkZGluZ1JpZ2h0ICsgMztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdHJlbmRlckVsZW1lbnQoKSB7IH0sXG5cdFx0XHRkaXNwb3NlVGVtcGxhdGUoKSB7IH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbGlzdFZpZXcgPSBuZXcgTGlzdFZpZXc8bnVtYmVyPihlbGVtZW50LCBkZWxlZ2F0ZSwgW3JlbmRlcmVyXSwgeyBob3Jpem9udGFsU2Nyb2xsaW5nOiB0cnVlIH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBleHBlY3RlZEJhdGNoID0gcmFuZ2UoNSkubWFwKCgpID0+ICh7IHJlbmRlcmVkUm93czogNSwgZml0Q29udGVudFJvd3M6IDUgfSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0czogeyBwaGFzZTogc3RyaW5nOyB3aWR0aFJlYWRzOiB0eXBlb2Ygd2lkdGhSZWFkczsgY29udGVudFdpZHRoOiBudW1iZXI7IHJvd1dpZHRoczogc3RyaW5nW10gfVtdID0gW107XG5cdFx0XHRsaXN0Vmlldy5sYXlvdXQoMTAwLCAyMDApO1xuXHRcdFx0bGlzdFZpZXcuc3BsaWNlKDAsIDAsIHJhbmdlKDEwKSk7XG5cdFx0XHRyZXN1bHRzLnB1c2goe1xuXHRcdFx0XHRwaGFzZTogJ3NwbGljZScsXG5cdFx0XHRcdHdpZHRoUmVhZHM6IHdpZHRoUmVhZHMuc2xpY2UoKSxcblx0XHRcdFx0Y29udGVudFdpZHRoOiBsaXN0Vmlldy5jb250ZW50V2lkdGgsXG5cdFx0XHRcdHJvd1dpZHRoczogcm93cy5tYXAocm93ID0+IHJvdy5zdHlsZS53aWR0aClcblx0XHRcdH0pO1xuXG5cdFx0XHR3aWR0aFJlYWRzLmxlbmd0aCA9IDA7XG5cdFx0XHRsaXN0Vmlldy5zZXRTY3JvbGxUb3AoMTAwKTtcblx0XHRcdHJlc3VsdHMucHVzaCh7XG5cdFx0XHRcdHBoYXNlOiAnc2Nyb2xsJyxcblx0XHRcdFx0d2lkdGhSZWFkczogd2lkdGhSZWFkcy5zbGljZSgpLFxuXHRcdFx0XHRjb250ZW50V2lkdGg6IGxpc3RWaWV3LmNvbnRlbnRXaWR0aCxcblx0XHRcdFx0cm93V2lkdGhzOiByb3dzLm1hcChyb3cgPT4gcm93LnN0eWxlLndpZHRoKVxuXHRcdFx0fSk7XG5cblx0XHRcdHdpZHRoUmVhZHMubGVuZ3RoID0gMDtcblx0XHRcdGxpc3RWaWV3LnVwZGF0ZU9wdGlvbnMoeyBob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSB9KTtcblx0XHRcdGxpc3RWaWV3LnVwZGF0ZU9wdGlvbnMoeyBob3Jpem9udGFsU2Nyb2xsaW5nOiB0cnVlIH0pO1xuXHRcdFx0cmVzdWx0cy5wdXNoKHtcblx0XHRcdFx0cGhhc2U6ICdlbmFibGUnLFxuXHRcdFx0XHR3aWR0aFJlYWRzOiB3aWR0aFJlYWRzLnNsaWNlKCksXG5cdFx0XHRcdGNvbnRlbnRXaWR0aDogbGlzdFZpZXcuY29udGVudFdpZHRoLFxuXHRcdFx0XHRyb3dXaWR0aHM6IHJvd3MubWFwKHJvdyA9PiByb3cuc3R5bGUud2lkdGgpXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRzLCBbXG5cdFx0XHRcdHsgcGhhc2U6ICdzcGxpY2UnLCB3aWR0aFJlYWRzOiBleHBlY3RlZEJhdGNoLCBjb250ZW50V2lkdGg6IDAsIHJvd1dpZHRoczogWycnLCAnJywgJycsICcnLCAnJ10gfSxcblx0XHRcdFx0eyBwaGFzZTogJ3Njcm9sbCcsIHdpZHRoUmVhZHM6IGV4cGVjdGVkQmF0Y2gsIGNvbnRlbnRXaWR0aDogMCwgcm93V2lkdGhzOiBbJycsICcnLCAnJywgJycsICcnXSB9LFxuXHRcdFx0XHR7IHBoYXNlOiAnZW5hYmxlJywgd2lkdGhSZWFkczogZXhwZWN0ZWRCYXRjaCwgY29udGVudFdpZHRoOiAxMTYsIHJvd1dpZHRoczogWycnLCAnJywgJycsICcnLCAnJ10gfVxuXHRcdFx0XSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGxpc3RWaWV3LmRpc3Bvc2UoKTtcblx0XHRcdGVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdwdWJsaXNoZXMgZnJlc2hseSBtZWFzdXJlZCBkeW5hbWljIGhlaWdodHMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gJzIwMHB4Jztcblx0XHRlbGVtZW50LnN0eWxlLndpZHRoID0gJzIwMHB4Jztcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVsZW1lbnQpO1xuXG5cdFx0dHlwZSBUZXN0RWxlbWVudCA9IHsgaGVpZ2h0OiBudW1iZXIgfTtcblx0XHRjb25zdCBkZWxlZ2F0ZSA9IG5ldyBjbGFzcyBleHRlbmRzIENhY2hlZExpc3RWaXJ0dWFsRGVsZWdhdGU8VGVzdEVsZW1lbnQ+IHtcblx0XHRcdHByb3RlY3RlZCBlc3RpbWF0ZUhlaWdodCgpIHsgcmV0dXJuIDEwMDsgfVxuXHRcdFx0Z2V0VGVtcGxhdGVJZCgpIHsgcmV0dXJuICd0ZW1wbGF0ZSc7IH1cblx0XHRcdGhhc0R5bmFtaWNIZWlnaHQoKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0XHRnZXRNZWFzdXJlZEhlaWdodChlbGVtZW50OiBUZXN0RWxlbWVudCkgeyByZXR1cm4gdGhpcy5nZXRDYWNoZWRIZWlnaHQoZWxlbWVudCk7IH1cblx0XHR9O1xuXHRcdGNvbnN0IHJlbmRlcmVyOiBJTGlzdFJlbmRlcmVyPFRlc3RFbGVtZW50LCBIVE1MRWxlbWVudD4gPSB7XG5cdFx0XHR0ZW1wbGF0ZUlkOiAndGVtcGxhdGUnLFxuXHRcdFx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGNvbnRlbnQpO1xuXHRcdFx0XHRyZXR1cm4gY29udGVudDtcblx0XHRcdH0sXG5cdFx0XHRyZW5kZXJFbGVtZW50KGVsZW1lbnQsIF9pbmRleCwgdGVtcGxhdGVEYXRhKSB7IHRlbXBsYXRlRGF0YS5zdHlsZS5oZWlnaHQgPSBgJHtlbGVtZW50LmhlaWdodH1weGA7IH0sXG5cdFx0XHRkaXNwb3NlVGVtcGxhdGUoKSB7IH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgZWxlbWVudHM6IFRlc3RFbGVtZW50W10gPSBbeyBoZWlnaHQ6IDQwIH0sIHsgaGVpZ2h0OiAxMDAgfSwgeyBoZWlnaHQ6IDE2MCB9XTtcblx0XHRjb25zdCBsaXN0VmlldyA9IG5ldyBMaXN0VmlldzxUZXN0RWxlbWVudD4oZWxlbWVudCwgZGVsZWdhdGUsIFtyZW5kZXJlcl0sIHsgc3VwcG9ydER5bmFtaWNIZWlnaHRzOiB0cnVlIH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRsaXN0Vmlldy5sYXlvdXQoMjAwLCAyMDApO1xuXHRcdFx0bGlzdFZpZXcuc3BsaWNlKDAsIDAsIGVsZW1lbnRzKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWxlbWVudHMubWFwKGVsZW1lbnQgPT4gZGVsZWdhdGUuZ2V0TWVhc3VyZWRIZWlnaHQoZWxlbWVudCkpLCBbNDAsIDEwMCwgMTYwXSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGxpc3RWaWV3LmRpc3Bvc2UoKTtcblx0XHRcdGVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdwdWJsaXNoZXMgcG9zaXRpdmUgZGVsZWdhdGUtcHJvdmlkZWQgZHluYW1pYyBoZWlnaHRzJywgZnVuY3Rpb24gKCkge1xuXHRcdHR5cGUgVGVzdEVsZW1lbnQgPSB7IGhlaWdodDogbnVtYmVyIH07XG5cdFx0Y29uc3QgcHVibGlzaGVkSGVpZ2h0cyA9IG5ldyBNYXA8VGVzdEVsZW1lbnQsIG51bWJlcj4oKTtcblx0XHRjb25zdCBkZWxlZ2F0ZTogSUxpc3RWaXJ0dWFsRGVsZWdhdGU8VGVzdEVsZW1lbnQ+ID0ge1xuXHRcdFx0Z2V0SGVpZ2h0KCkgeyByZXR1cm4gMTAwOyB9LFxuXHRcdFx0Z2V0VGVtcGxhdGVJZCgpIHsgcmV0dXJuICd0ZW1wbGF0ZSc7IH0sXG5cdFx0XHRnZXREeW5hbWljSGVpZ2h0KGVsZW1lbnQpIHsgcmV0dXJuIGVsZW1lbnQuaGVpZ2h0OyB9LFxuXHRcdFx0c2V0RHluYW1pY0hlaWdodChlbGVtZW50LCBoZWlnaHQpIHsgcHVibGlzaGVkSGVpZ2h0cy5zZXQoZWxlbWVudCwgaGVpZ2h0KTsgfVxuXHRcdH07XG5cdFx0Y29uc3QgcmVuZGVyZXI6IElMaXN0UmVuZGVyZXI8VGVzdEVsZW1lbnQsIHZvaWQ+ID0ge1xuXHRcdFx0dGVtcGxhdGVJZDogJ3RlbXBsYXRlJyxcblx0XHRcdHJlbmRlclRlbXBsYXRlKCkgeyB9LFxuXHRcdFx0cmVuZGVyRWxlbWVudCgpIHsgfSxcblx0XHRcdGRpc3Bvc2VUZW1wbGF0ZSgpIHsgfVxuXHRcdH07XG5cblx0XHRjb25zdCBlbGVtZW50czogVGVzdEVsZW1lbnRbXSA9IFt7IGhlaWdodDogMCB9LCB7IGhlaWdodDogNDAgfSwgeyBoZWlnaHQ6IDEwMCB9LCB7IGhlaWdodDogMTYwIH1dO1xuXHRcdGNvbnN0IGxpc3RWaWV3ID0gbmV3IExpc3RWaWV3PFRlc3RFbGVtZW50Pihkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSwgZGVsZWdhdGUsIFtyZW5kZXJlcl0sIHsgc3VwcG9ydER5bmFtaWNIZWlnaHRzOiB0cnVlIH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRsaXN0Vmlldy5sYXlvdXQoNDAwLCAyMDApO1xuXHRcdFx0bGlzdFZpZXcuc3BsaWNlKDAsIDAsIGVsZW1lbnRzKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWxlbWVudHMubWFwKGVsZW1lbnQgPT4gcHVibGlzaGVkSGVpZ2h0cy5nZXQoZWxlbWVudCkpLCBbdW5kZWZpbmVkLCA0MCwgMTAwLCAxNjBdKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0bGlzdFZpZXcuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGlDQUFzRTtBQUMvRSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxZQUFZLFdBQVk7QUFDN0IsMENBQXdDO0FBRXhDLE9BQUsseUJBQXlCLFdBQVk7QUFDekMsVUFBTSxVQUFVLFNBQVMsY0FBYyxLQUFLO0FBQzVDLFlBQVEsTUFBTSxTQUFTO0FBQ3ZCLFlBQVEsTUFBTSxRQUFRO0FBRXRCLFVBQU0sV0FBeUM7QUFBQSxNQUM5QyxZQUFZO0FBQUUsZUFBTztBQUFBLE1BQUk7QUFBQSxNQUN6QixnQkFBZ0I7QUFBRSxlQUFPO0FBQUEsTUFBWTtBQUFBLElBQ3RDO0FBRUEsUUFBSSxpQkFBaUI7QUFFckIsVUFBTSxX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
