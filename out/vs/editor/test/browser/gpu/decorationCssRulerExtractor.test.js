import { deepStrictEqual } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { DecorationCssRuleExtractor } from "../../../browser/gpu/css/decorationCssRuleExtractor.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { $, getActiveDocument } from "../../../../base/browser/dom.js";
function randomClass() {
  return "test-class-" + generateUuid();
}
suite("DecorationCssRulerExtractor", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let doc;
  let container;
  let extractor;
  let testClassName;
  function addStyleElement(content) {
    const styleElement = $("style");
    styleElement.textContent = content;
    container.append(styleElement);
  }
  function assertStyles(className, expectedCssText) {
    deepStrictEqual(extractor.getStyleRules(container, className).map((e) => e.cssText), expectedCssText);
  }
  setup(() => {
    doc = getActiveDocument();
    extractor = store.add(new DecorationCssRuleExtractor());
    testClassName = randomClass();
    container = $("div");
    doc.body.append(container);
  });
  teardown(() => {
    container.remove();
  });
  test("unknown class should give no styles", () => {
    assertStyles(randomClass(), []);
  });
  test("single style should be picked up", () => {
    addStyleElement(`.${testClassName} { color: red; }`);
    assertStyles(testClassName, [
      `.${testClassName} { color: red; }`
    ]);
  });
  test("multiple styles from the same selector should be picked up", () => {
    addStyleElement(`.${testClassName} { color: red; opacity: 0.5; }`);
    assertStyles(testClassName, [
      `.${testClassName} { color: red; opacity: 0.5; }`
    ]);
  });
  test("multiple styles from  different selectors should be picked up", () => {
    addStyleElement([
      `.${testClassName} { color: red; opacity: 0.5; }`,
      `.${testClassName}:hover { opacity: 1; }`
    ].join("\n"));
    assertStyles(testClassName, [
      `.${testClassName} { color: red; opacity: 0.5; }`,
      `.${testClassName}:hover { opacity: 1; }`
    ]);
  });
  test("multiple styles from the different stylesheets should be picked up", () => {
    addStyleElement(`.${testClassName} { color: red; opacity: 0.5; }`);
    addStyleElement(`.${testClassName}:hover { opacity: 1; }`);
    assertStyles(testClassName, [
      `.${testClassName} { color: red; opacity: 0.5; }`,
      `.${testClassName}:hover { opacity: 1; }`
    ]);
  });
  test("should not pick up styles from selectors where the prefix is the class", () => {
    addStyleElement([
      `.${testClassName} { color: red; }`,
      `.${testClassName}-ignoreme { opacity: 1; }`,
      `.${testClassName}fake { opacity: 1; }`
    ].join("\n"));
    assertStyles(testClassName, [
      `.${testClassName} { color: red; }`
    ]);
  });
  test("should pick up styles with pseudo-class selectors", () => {
    addStyleElement(`.${testClassName} { background-color: green; }`);
    addStyleElement(`.${testClassName}:not(.other) { color: blue; }`);
    const rules = extractor.getStyleRules(container, testClassName);
    deepStrictEqual(rules.length, 2);
    deepStrictEqual(rules[0].style.backgroundColor, "green");
    deepStrictEqual(rules[1].style.color, "blue");
  });
  test("should pick up styles when className has multiple space-separated classes", () => {
    const secondClassName = randomClass();
    addStyleElement([
      `.${testClassName} { color: red; }`,
      `.${secondClassName} { opacity: 0.5; }`,
      `.${testClassName}.${secondClassName} { font-weight: bold; }`
    ].join("\n"));
    const rules = extractor.getStyleRules(container, `${testClassName} ${secondClassName}`);
    deepStrictEqual(rules.length, 3);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGJyb3dzZXJcXGdwdVxcZGVjb3JhdGlvbkNzc1J1bGVyRXh0cmFjdG9yLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWVwU3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBEZWNvcmF0aW9uQ3NzUnVsZUV4dHJhY3RvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZ3B1L2Nzcy9kZWNvcmF0aW9uQ3NzUnVsZUV4dHJhY3Rvci5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7ICQsIGdldEFjdGl2ZURvY3VtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5cbmZ1bmN0aW9uIHJhbmRvbUNsYXNzKCk6IHN0cmluZyB7XG5cdHJldHVybiAndGVzdC1jbGFzcy0nICsgZ2VuZXJhdGVVdWlkKCk7XG59XG5cbnN1aXRlKCdEZWNvcmF0aW9uQ3NzUnVsZXJFeHRyYWN0b3InLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGRvYzogRG9jdW1lbnQ7XG5cdGxldCBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRsZXQgZXh0cmFjdG9yOiBEZWNvcmF0aW9uQ3NzUnVsZUV4dHJhY3Rvcjtcblx0bGV0IHRlc3RDbGFzc05hbWU6IHN0cmluZztcblxuXHRmdW5jdGlvbiBhZGRTdHlsZUVsZW1lbnQoY29udGVudDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3R5bGVFbGVtZW50ID0gJCgnc3R5bGUnKTtcblx0XHRzdHlsZUVsZW1lbnQudGV4dENvbnRlbnQgPSBjb250ZW50O1xuXHRcdGNvbnRhaW5lci5hcHBlbmQoc3R5bGVFbGVtZW50KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydFN0eWxlcyhjbGFzc05hbWU6IHN0cmluZywgZXhwZWN0ZWRDc3NUZXh0OiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGRlZXBTdHJpY3RFcXVhbChleHRyYWN0b3IuZ2V0U3R5bGVSdWxlcyhjb250YWluZXIsIGNsYXNzTmFtZSkubWFwKGUgPT4gZS5jc3NUZXh0KSwgZXhwZWN0ZWRDc3NUZXh0KTtcblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkb2MgPSBnZXRBY3RpdmVEb2N1bWVudCgpO1xuXHRcdGV4dHJhY3RvciA9IHN0b3JlLmFkZChuZXcgRGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3IoKSk7XG5cdFx0dGVzdENsYXNzTmFtZSA9IHJhbmRvbUNsYXNzKCk7XG5cdFx0Y29udGFpbmVyID0gJCgnZGl2Jyk7XG5cdFx0ZG9jLmJvZHkuYXBwZW5kKGNvbnRhaW5lcik7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRjb250YWluZXIucmVtb3ZlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Vua25vd24gY2xhc3Mgc2hvdWxkIGdpdmUgbm8gc3R5bGVzJywgKCkgPT4ge1xuXHRcdGFzc2VydFN0eWxlcyhyYW5kb21DbGFzcygpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZSBzdHlsZSBzaG91bGQgYmUgcGlja2VkIHVwJywgKCkgPT4ge1xuXHRcdGFkZFN0eWxlRWxlbWVudChgLiR7dGVzdENsYXNzTmFtZX0geyBjb2xvcjogcmVkOyB9YCk7XG5cdFx0YXNzZXJ0U3R5bGVzKHRlc3RDbGFzc05hbWUsIFtcblx0XHRcdGAuJHt0ZXN0Q2xhc3NOYW1lfSB7IGNvbG9yOiByZWQ7IH1gXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIHN0eWxlcyBmcm9tIHRoZSBzYW1lIHNlbGVjdG9yIHNob3VsZCBiZSBwaWNrZWQgdXAnLCAoKSA9PiB7XG5cdFx0YWRkU3R5bGVFbGVtZW50KGAuJHt0ZXN0Q2xhc3NOYW1lfSB7IGNvbG9yOiByZWQ7IG9wYWNpdHk6IDAuNTsgfWApO1xuXHRcdGFzc2VydFN0eWxlcyh0ZXN0Q2xhc3NOYW1lLCBbXG5cdFx0XHRgLiR7dGVzdENsYXNzTmFtZX0geyBjb2xvcjogcmVkOyBvcGFjaXR5OiAwLjU7IH1gXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIHN0eWxlcyBmcm9tICBkaWZmZXJlbnQgc2VsZWN0b3JzIHNob3VsZCBiZSBwaWNrZWQgdXAnLCAoKSA9PiB7XG5cdFx0YWRkU3R5bGVFbGVtZW50KFtcblx0XHRcdGAuJHt0ZXN0Q2xhc3NOYW1lfSB7IGNvbG9yOiByZWQ7IG9wYWNpdHk6IDAuNTsgfWAsXG5cdFx0XHRgLiR7dGVzdENsYXNzTmFtZX06aG92ZXIgeyBvcGFjaXR5OiAxOyB9YCxcblx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHRhc3NlcnRTdHlsZXModGVzdENsYXNzTmFtZSwgW1xuXHRcdFx0YC4ke3Rlc3RDbGFzc05hbWV9IHsgY29sb3I6IHJlZDsgb3BhY2l0eTogMC41OyB9YCxcblx0XHRcdGAuJHt0ZXN0Q2xhc3NOYW1lfTpob3ZlciB7IG9wYWNpdHk6IDE7IH1gLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBzdHlsZXMgZnJvbSB0aGUgZGlmZmVyZW50IHN0eWxlc2hlZXRzIHNob3VsZCBiZSBwaWNrZWQgdXAnLCAoKSA9PiB7XG5cdFx0YWRkU3R5bGVFbGVtZW50KGAuJHt0ZXN0Q2xhc3NOYW1lfSB7IGNvbG9yOiByZWQ7IG9wYWNpdHk6IDAuNTsgfWApO1xuXHRcdGFkZFN0eWxlRWxlbWVudChgLiR7dGVzdENsYXNzTmFtZX06aG92ZXIgeyBvcGFjaXR5OiAxOyB9YCk7XG5cdFx0YXNzZXJ0U3R5bGVzKHRlc3RDbGFzc05hbWUsIFtcblx0XHRcdGAuJHt0ZXN0Q2xhc3NOYW1lfSB7IGNvbG9yOiByZWQ7IG9wYWNpdHk6IDAuNTsgfWAsXG5cdFx0XHRgLiR7dGVzdENsYXNzTmFtZX06aG92ZXIgeyBvcGFjaXR5OiAxOyB9YCxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIG5vdCBwaWNrIHVwIHN0eWxlcyBmcm9tIHNlbGVjdG9ycyB3aGVyZSB0aGUgcHJlZml4IGlzIHRoZSBjbGFzcycsICgpID0+IHtcblx0XHRhZGRTdHlsZUVsZW1lbnQoW1xuXHRcdFx0YC4ke3Rlc3RDbGFzc05hbWV9IHsgY29sb3I6IHJlZDsgfWAsXG5cdFx0XHRgLiR7dGVzdENsYXNzTmFtZX0taWdub3JlbWUgeyBvcGFjaXR5OiAxOyB9YCxcblx0XHRcdGAuJHt0ZXN0Q2xhc3NOYW1lfWZha2UgeyBvcGFjaXR5OiAxOyB9YCxcblx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHRhc3NlcnRTdHlsZXModGVzdENsYXNzTmFtZSwgW1xuXHRcdFx0YC4ke3Rlc3RDbGFzc05hbWV9IHsgY29sb3I6IHJlZDsgfWAsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBwaWNrIHVwIHN0eWxlcyB3aXRoIHBzZXVkby1jbGFzcyBzZWxlY3RvcnMnLCAoKSA9PiB7XG5cdFx0YWRkU3R5bGVFbGVtZW50KGAuJHt0ZXN0Q2xhc3NOYW1lfSB7IGJhY2tncm91bmQtY29sb3I6IGdyZWVuOyB9YCk7XG5cdFx0YWRkU3R5bGVFbGVtZW50KGAuJHt0ZXN0Q2xhc3NOYW1lfTpub3QoLm90aGVyKSB7IGNvbG9yOiBibHVlOyB9YCk7XG5cdFx0Y29uc3QgcnVsZXMgPSBleHRyYWN0b3IuZ2V0U3R5bGVSdWxlcyhjb250YWluZXIsIHRlc3RDbGFzc05hbWUpO1xuXHRcdGRlZXBTdHJpY3RFcXVhbChydWxlcy5sZW5ndGgsIDIpO1xuXHRcdGRlZXBTdHJpY3RFcXVhbChydWxlc1swXS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IsICdncmVlbicpO1xuXHRcdGRlZXBTdHJpY3RFcXVhbChydWxlc1sxXS5zdHlsZS5jb2xvciwgJ2JsdWUnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHBpY2sgdXAgc3R5bGVzIHdoZW4gY2xhc3NOYW1lIGhhcyBtdWx0aXBsZSBzcGFjZS1zZXBhcmF0ZWQgY2xhc3NlcycsICgpID0+IHtcblx0XHRjb25zdCBzZWNvbmRDbGFzc05hbWUgPSByYW5kb21DbGFzcygpO1xuXHRcdGFkZFN0eWxlRWxlbWVudChbXG5cdFx0XHRgLiR7dGVzdENsYXNzTmFtZX0geyBjb2xvcjogcmVkOyB9YCxcblx0XHRcdGAuJHtzZWNvbmRDbGFzc05hbWV9IHsgb3BhY2l0eTogMC41OyB9YCxcblx0XHRcdGAuJHt0ZXN0Q2xhc3NOYW1lfS4ke3NlY29uZENsYXNzTmFtZX0geyBmb250LXdlaWdodDogYm9sZDsgfWAsXG5cdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0Ly8gUGFzcyBzcGFjZS1zZXBhcmF0ZWQgY2xhc3NlcyBsaWtlICdjbGFzczEgY2xhc3MyJ1xuXHRcdGNvbnN0IHJ1bGVzID0gZXh0cmFjdG9yLmdldFN0eWxlUnVsZXMoY29udGFpbmVyLCBgJHt0ZXN0Q2xhc3NOYW1lfSAke3NlY29uZENsYXNzTmFtZX1gKTtcblx0XHQvLyBTaG91bGQgZmluZCBydWxlcyBmb3IgYm90aCBjbGFzc2VzIGFuZCB0aGUgY2hhaW5lZCBzZWxlY3RvclxuXHRcdGRlZXBTdHJpY3RFcXVhbChydWxlcy5sZW5ndGgsIDMpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxHQUFHLHlCQUF5QjtBQUVyQyxTQUFTLGNBQXNCO0FBQzlCLFNBQU8sZ0JBQWdCLGFBQWE7QUFDckM7QUFFQSxNQUFNLCtCQUErQixNQUFNO0FBQzFDLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUVKLFdBQVMsZ0JBQWdCLFNBQXVCO0FBQy9DLFVBQU0sZUFBZSxFQUFFLE9BQU87QUFDOUIsaUJBQWEsY0FBYztBQUMzQixjQUFVLE9BQU8sWUFBWTtBQUFBLEVBQzlCO0FBRUEsV0FBUyxhQUFhLFdBQW1CLGlCQUFpQztBQUN6RSxvQkFBZ0IsVUFBVSxjQUFjLFdBQVcsU0FBUyxFQUFFLElBQUksT0FBSyxFQUFFLE9BQU8sR0FBRyxlQUFlO0FBQUEsRUFDbkc7QUFFQSxRQUFNLE1BQU07QUFDWCxVQUFNLGtCQUFrQjtBQUN4QixnQkFBWSxNQUFNLElBQUksSUFBSSwyQkFBMkIsQ0FBQztBQUN0RCxvQkFBZ0IsWUFBWTtBQUM1QixnQkFBWSxFQUFFLEtBQUs7QUFDbkIsUUFBSSxLQUFLLE9BQU8sU0FBUztBQUFBLEVBQzFCLENBQUM7QUFFRCxXQUFTLE1BQU07QUFDZCxjQUFVLE9BQU87QUFBQSxFQUNsQixDQUFDO0FBRUQsT0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxpQkFBYSxZQUFZLEdBQUcsQ0FBQyxDQUFDO0FBQUEsRUFDL0IsQ0FBQztBQUVELE9BQUssb0NBQW9DLE1BQU07QUFDOUMsb0JBQWdCLElBQUksYUFBYSxrQkFBa0I7QUFDbkQsaUJBQWEsZUFBZTtBQUFBLE1BQzNCLElBQUksYUFBYTtBQUFBLElBQ2xCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDhEQUE4RCxNQUFNO0FBQ3hFLG9CQUFnQixJQUFJLGFBQWEsZ0NBQWdDO0FBQ2pFLGlCQUFhLGVBQWU7QUFBQSxNQUMzQixJQUFJLGFBQWE7QUFBQSxJQUNsQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxpRUFBaUUsTUFBTTtBQUMzRSxvQkFBZ0I7QUFBQSxNQUNmLElBQUksYUFBYTtBQUFBLE1BQ2pCLElBQUksYUFBYTtBQUFBLElBQ2xCLEVBQUUsS0FBSyxJQUFJLENBQUM7QUFDWixpQkFBYSxlQUFlO0FBQUEsTUFDM0IsSUFBSSxhQUFhO0FBQUEsTUFDakIsSUFBSSxhQUFhO0FBQUEsSUFDbEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssc0VBQXNFLE1BQU07QUFDaEYsb0JBQWdCLElBQUksYUFBYSxnQ0FBZ0M7QUFDakUsb0JBQWdCLElBQUksYUFBYSx3QkFBd0I7QUFDekQsaUJBQWEsZUFBZTtBQUFBLE1BQzNCLElBQUksYUFBYTtBQUFBLE1BQ2pCLElBQUksYUFBYTtBQUFBLElBQ2xCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDBFQUEwRSxNQUFNO0FBQ3BGLG9CQUFnQjtBQUFBLE1BQ2YsSUFBSSxhQUFhO0FBQUEsTUFDakIsSUFBSSxhQUFhO0FBQUEsTUFDakIsSUFBSSxhQUFhO0FBQUEsSUFDbEIsRUFBRSxLQUFLLElBQUksQ0FBQztBQUNaLGlCQUFhLGVBQWU7QUFBQSxNQUMzQixJQUFJLGFBQWE7QUFBQSxJQUNsQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxREFBcUQsTUFBTTtBQUMvRCxvQkFBZ0IsSUFBSSxhQUFhLCtCQUErQjtBQUNoRSxvQkFBZ0IsSUFBSSxhQUFhLCtCQUErQjtBQUNoRSxVQUFNLFFBQVEsVUFBVSxjQUFjLFdBQVcsYUFBYTtBQUM5RCxvQkFBZ0IsTUFBTSxRQUFRLENBQUM7QUFDL0Isb0JBQWdCLE1BQU0sQ0FBQyxFQUFFLE1BQU0saUJBQWlCLE9BQU87QUFDdkQsb0JBQWdCLE1BQU0sQ0FBQyxFQUFFLE1BQU0sT0FBTyxNQUFNO0FBQUEsRUFDN0MsQ0FBQztBQUVELE9BQUssNkVBQTZFLE1BQU07QUFDdkYsVUFBTSxrQkFBa0IsWUFBWTtBQUNwQyxvQkFBZ0I7QUFBQSxNQUNmLElBQUksYUFBYTtBQUFBLE1BQ2pCLElBQUksZUFBZTtBQUFBLE1BQ25CLElBQUksYUFBYSxJQUFJLGVBQWU7QUFBQSxJQUNyQyxFQUFFLEtBQUssSUFBSSxDQUFDO0FBRVosVUFBTSxRQUFRLFVBQVUsY0FBYyxXQUFXLEdBQUcsYUFBYSxJQUFJLGVBQWUsRUFBRTtBQUV0RixvQkFBZ0IsTUFBTSxRQUFRLENBQUM7QUFBQSxFQUNoQyxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
