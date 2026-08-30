import assert from "assert";
import { CellKind } from "../../common/notebookCommon.js";
import { withTestNotebook } from "./testNotebookEditor.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Event } from "../../../../../base/common/event.js";
suite("CellDecorations", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Add and remove a cell decoration", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel) => {
        const cell = viewModel.cellAt(0);
        assert.ok(cell);
        let added = false;
        Event.once(cell.onCellDecorationsChanged)((e) => added = !!e.added.find((decoration) => decoration.className === "style1"));
        const decorationIds = cell.deltaCellDecorations([], [{ className: "style1" }]);
        assert.ok(cell.getCellDecorations().find((dec) => dec.className === "style1"));
        let removed = false;
        Event.once(cell.onCellDecorationsChanged)((e) => removed = !!e.removed.find((decoration) => decoration.className === "style1"));
        cell.deltaCellDecorations(decorationIds, []);
        assert.ok(!cell.getCellDecorations().find((dec) => dec.className === "style1"));
        assert.ok(added);
        assert.ok(removed);
      }
    );
  });
  test("Removing one cell decoration should not remove all", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel) => {
        const cell = viewModel.cellAt(0);
        assert.ok(cell);
        const decorationIds = cell.deltaCellDecorations([], [{ className: "style1", outputClassName: "style1" }]);
        cell.deltaCellDecorations([], [{ className: "style1" }]);
        let styleRemoved = false;
        let outputStyleRemoved = false;
        Event.once(cell.onCellDecorationsChanged)((e) => {
          styleRemoved = !!e.removed.find((decoration) => decoration.className === "style1");
          outputStyleRemoved = !!e.removed.find((decoration) => decoration.outputClassName === "style1");
        });
        cell.deltaCellDecorations(decorationIds, []);
        assert.ok(!cell.getCellDecorations().find((dec) => dec.outputClassName === "style1"));
        assert.ok(cell.getCellDecorations().find((dec) => dec.className === "style1"));
        assert.ok(!styleRemoved);
        assert.ok(outputStyleRemoved);
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxjZWxsRGVjb3JhdGlvbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENlbGxLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IHdpdGhUZXN0Tm90ZWJvb2sgfSBmcm9tICcuL3Rlc3ROb3RlYm9va0VkaXRvci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuXG5zdWl0ZSgnQ2VsbERlY29yYXRpb25zJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdBZGQgYW5kIHJlbW92ZSBhIGNlbGwgZGVjb3JhdGlvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIGEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSB2aWV3TW9kZWwuY2VsbEF0KDApO1xuXHRcdFx0XHRhc3NlcnQub2soY2VsbCk7XG5cblx0XHRcdFx0bGV0IGFkZGVkID0gZmFsc2U7XG5cdFx0XHRcdEV2ZW50Lm9uY2UoY2VsbC5vbkNlbGxEZWNvcmF0aW9uc0NoYW5nZWQpKGUgPT4gYWRkZWQgPSAhIWUuYWRkZWQuZmluZChkZWNvcmF0aW9uID0+IGRlY29yYXRpb24uY2xhc3NOYW1lID09PSAnc3R5bGUxJykpO1xuXG5cdFx0XHRcdGNvbnN0IGRlY29yYXRpb25JZHMgPSBjZWxsLmRlbHRhQ2VsbERlY29yYXRpb25zKFtdLCBbeyBjbGFzc05hbWU6ICdzdHlsZTEnIH1dKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGNlbGwuZ2V0Q2VsbERlY29yYXRpb25zKCkuZmluZChkZWMgPT4gZGVjLmNsYXNzTmFtZSA9PT0gJ3N0eWxlMScpKTtcblxuXHRcdFx0XHRsZXQgcmVtb3ZlZCA9IGZhbHNlO1xuXHRcdFx0XHRFdmVudC5vbmNlKGNlbGwub25DZWxsRGVjb3JhdGlvbnNDaGFuZ2VkKShlID0+IHJlbW92ZWQgPSAhIWUucmVtb3ZlZC5maW5kKGRlY29yYXRpb24gPT4gZGVjb3JhdGlvbi5jbGFzc05hbWUgPT09ICdzdHlsZTEnKSk7XG5cdFx0XHRcdGNlbGwuZGVsdGFDZWxsRGVjb3JhdGlvbnMoZGVjb3JhdGlvbklkcywgW10pO1xuXG5cdFx0XHRcdGFzc2VydC5vayghY2VsbC5nZXRDZWxsRGVjb3JhdGlvbnMoKS5maW5kKGRlYyA9PiBkZWMuY2xhc3NOYW1lID09PSAnc3R5bGUxJykpO1xuXHRcdFx0XHRhc3NlcnQub2soYWRkZWQpO1xuXHRcdFx0XHRhc3NlcnQub2socmVtb3ZlZCk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnUmVtb3Zpbmcgb25lIGNlbGwgZGVjb3JhdGlvbiBzaG91bGQgbm90IHJlbW92ZSBhbGwnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjZWxsID0gdmlld01vZGVsLmNlbGxBdCgwKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGNlbGwpO1xuXG5cdFx0XHRcdGNvbnN0IGRlY29yYXRpb25JZHMgPSBjZWxsLmRlbHRhQ2VsbERlY29yYXRpb25zKFtdLCBbeyBjbGFzc05hbWU6ICdzdHlsZTEnLCBvdXRwdXRDbGFzc05hbWU6ICdzdHlsZTEnIH1dKTtcblx0XHRcdFx0Y2VsbC5kZWx0YUNlbGxEZWNvcmF0aW9ucyhbXSwgW3sgY2xhc3NOYW1lOiAnc3R5bGUxJyB9XSk7XG5cblx0XHRcdFx0bGV0IHN0eWxlUmVtb3ZlZCA9IGZhbHNlO1xuXHRcdFx0XHRsZXQgb3V0cHV0U3R5bGVSZW1vdmVkID0gZmFsc2U7XG5cdFx0XHRcdEV2ZW50Lm9uY2UoY2VsbC5vbkNlbGxEZWNvcmF0aW9uc0NoYW5nZWQpKGUgPT4ge1xuXHRcdFx0XHRcdHN0eWxlUmVtb3ZlZCA9ICEhZS5yZW1vdmVkLmZpbmQoZGVjb3JhdGlvbiA9PiBkZWNvcmF0aW9uLmNsYXNzTmFtZSA9PT0gJ3N0eWxlMScpO1xuXHRcdFx0XHRcdG91dHB1dFN0eWxlUmVtb3ZlZCA9ICEhZS5yZW1vdmVkLmZpbmQoZGVjb3JhdGlvbiA9PiBkZWNvcmF0aW9uLm91dHB1dENsYXNzTmFtZSA9PT0gJ3N0eWxlMScpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Ly8gcmVtb3ZlIHRoZSBmaXJzdCBzdHlsZSBhZGRlZCwgd2hpY2ggc2hvdWxkIG9ubHkgcmVtb3ZlIHRoZSBvdXRwdXQgY2xhc3Ncblx0XHRcdFx0Y2VsbC5kZWx0YUNlbGxEZWNvcmF0aW9ucyhkZWNvcmF0aW9uSWRzLCBbXSk7XG5cblx0XHRcdFx0YXNzZXJ0Lm9rKCFjZWxsLmdldENlbGxEZWNvcmF0aW9ucygpLmZpbmQoZGVjID0+IGRlYy5vdXRwdXRDbGFzc05hbWUgPT09ICdzdHlsZTEnKSk7XG5cdFx0XHRcdGFzc2VydC5vayhjZWxsLmdldENlbGxEZWNvcmF0aW9ucygpLmZpbmQoZGVjID0+IGRlYy5jbGFzc05hbWUgPT09ICdzdHlsZTEnKSk7XG5cdFx0XHRcdGFzc2VydC5vayghc3R5bGVSZW1vdmVkKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKG91dHB1dFN0eWxlUmVtb3ZlZCk7XG5cdFx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWE7QUFFdEIsTUFBTSxtQkFBbUIsTUFBTTtBQUM5QiwwQ0FBd0M7QUFFeEMsT0FBSyxvQ0FBb0MsaUJBQWtCO0FBQzFELFVBQU07QUFBQSxNQUNMO0FBQUEsUUFDQyxDQUFDLGNBQWMsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ25EO0FBQUEsTUFDQSxPQUFPLFFBQVEsY0FBYztBQUM1QixjQUFNLE9BQU8sVUFBVSxPQUFPLENBQUM7QUFDL0IsZUFBTyxHQUFHLElBQUk7QUFFZCxZQUFJLFFBQVE7QUFDWixjQUFNLEtBQUssS0FBSyx3QkFBd0IsRUFBRSxPQUFLLFFBQVEsQ0FBQyxDQUFDLEVBQUUsTUFBTSxLQUFLLGdCQUFjLFdBQVcsY0FBYyxRQUFRLENBQUM7QUFFdEgsY0FBTSxnQkFBZ0IsS0FBSyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsRUFBRSxXQUFXLFNBQVMsQ0FBQyxDQUFDO0FBQzdFLGVBQU8sR0FBRyxLQUFLLG1CQUFtQixFQUFFLEtBQUssU0FBTyxJQUFJLGNBQWMsUUFBUSxDQUFDO0FBRTNFLFlBQUksVUFBVTtBQUNkLGNBQU0sS0FBSyxLQUFLLHdCQUF3QixFQUFFLE9BQUssVUFBVSxDQUFDLENBQUMsRUFBRSxRQUFRLEtBQUssZ0JBQWMsV0FBVyxjQUFjLFFBQVEsQ0FBQztBQUMxSCxhQUFLLHFCQUFxQixlQUFlLENBQUMsQ0FBQztBQUUzQyxlQUFPLEdBQUcsQ0FBQyxLQUFLLG1CQUFtQixFQUFFLEtBQUssU0FBTyxJQUFJLGNBQWMsUUFBUSxDQUFDO0FBQzVFLGVBQU8sR0FBRyxLQUFLO0FBQ2YsZUFBTyxHQUFHLE9BQU87QUFBQSxNQUNsQjtBQUFBLElBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxPQUFLLHNEQUFzRCxpQkFBa0I7QUFDNUUsVUFBTTtBQUFBLE1BQ0w7QUFBQSxRQUNDLENBQUMsY0FBYyxZQUFZLFNBQVMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDbkQ7QUFBQSxNQUNBLE9BQU8sUUFBUSxjQUFjO0FBQzVCLGNBQU0sT0FBTyxVQUFVLE9BQU8sQ0FBQztBQUMvQixlQUFPLEdBQUcsSUFBSTtBQUVkLGNBQU0sZ0JBQWdCLEtBQUsscUJBQXFCLENBQUMsR0FBRyxDQUFDLEVBQUUsV0FBVyxVQUFVLGlCQUFpQixTQUFTLENBQUMsQ0FBQztBQUN4RyxhQUFLLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxFQUFFLFdBQVcsU0FBUyxDQUFDLENBQUM7QUFFdkQsWUFBSSxlQUFlO0FBQ25CLFlBQUkscUJBQXFCO0FBQ3pCLGNBQU0sS0FBSyxLQUFLLHdCQUF3QixFQUFFLE9BQUs7QUFDOUMseUJBQWUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxLQUFLLGdCQUFjLFdBQVcsY0FBYyxRQUFRO0FBQy9FLCtCQUFxQixDQUFDLENBQUMsRUFBRSxRQUFRLEtBQUssZ0JBQWMsV0FBVyxvQkFBb0IsUUFBUTtBQUFBLFFBQzVGLENBQUM7QUFFRCxhQUFLLHFCQUFxQixlQUFlLENBQUMsQ0FBQztBQUUzQyxlQUFPLEdBQUcsQ0FBQyxLQUFLLG1CQUFtQixFQUFFLEtBQUssU0FBTyxJQUFJLG9CQUFvQixRQUFRLENBQUM7QUFDbEYsZUFBTyxHQUFHLEtBQUssbUJBQW1CLEVBQUUsS0FBSyxTQUFPLElBQUksY0FBYyxRQUFRLENBQUM7QUFDM0UsZUFBTyxHQUFHLENBQUMsWUFBWTtBQUN2QixlQUFPLEdBQUcsa0JBQWtCO0FBQUEsTUFDN0I7QUFBQSxJQUFDO0FBQUEsRUFDSCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
