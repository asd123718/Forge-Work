import * as assert from "assert";
import { Lazy } from "../../../../../../base/common/lazy.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { wrapTablesWithScrollable } from "../../../browser/widget/chatContentParts/chatMarkdownTableScrolling.js";
function buildContainer(tables) {
  const container = document.createElement("div");
  for (const rows of tables) {
    const table = document.createElement("table");
    rows.forEach((rowData, rowIndex) => {
      const section = rowIndex === 0 ? table.createTHead() : table.tBodies[0] ?? table.createTBody();
      const tr = section.insertRow();
      for (const text of rowData) {
        const cell = rowIndex === 0 ? document.createElement("th") : tr.insertCell();
        cell.textContent = text;
        if (rowIndex === 0) {
          tr.appendChild(cell);
        }
      }
    });
    container.appendChild(table);
  }
  return container;
}
suite("wrapTablesWithScrollable", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function wrap(container) {
    const layoutParticipants = /* @__PURE__ */ new Set();
    store.add(wrapTablesWithScrollable(container, new Lazy(() => layoutParticipants)));
    return { layoutParticipants };
  }
  test("replaces each table with a scroll wrapper in the DOM", () => {
    const container = buildContainer([[
      ["ID", "Name"],
      ["001", "Alice"]
    ]]);
    assert.strictEqual(container.children[0].tagName, "TABLE");
    wrap(container);
    const wrapper = container.children[0];
    assert.ok(
      wrapper.classList.contains("rendered-markdown-table-scroll-wrapper"),
      "outer node should have the scroll wrapper class"
    );
  });
  test("table is preserved inside the scroll wrapper", () => {
    const container = buildContainer([[["A", "BB"], ["C", "DD"]]]);
    wrap(container);
    const table = container.querySelector("table");
    assert.ok(table, "table should still exist in DOM");
    assert.ok(container.contains(table), "table should be inside container");
    assert.ok(!container.children[0].isSameNode(table), "table should not be a direct child anymore");
  });
  test("registers a layout participant for each table", () => {
    const container = buildContainer([
      [["H1", "H2"], ["a", "bb"]],
      [["X", "YY"], ["c", "dd"]]
    ]);
    const { layoutParticipants } = wrap(container);
    assert.strictEqual(layoutParticipants.size, 2, "one layout participant registered per table");
  });
  test("sets column min-width capped at 3ch", () => {
    const container = buildContainer([[
      ["ID", "Name"],
      ["001", "Alice"],
      ["002", "Longer Name"]
    ]]);
    wrap(container);
    const table = container.querySelector("table");
    assert.deepStrictEqual(
      Array.from(table.rows[0].cells).map((cell) => cell.style.minWidth),
      ["3ch", "3ch"]
    );
    assert.deepStrictEqual(
      Array.from(table.rows[1].cells).map((cell) => cell.style.minWidth),
      ["", ""]
    );
  });
  test("uses actual char count when below the 3ch cap", () => {
    const container = buildContainer([[["AB", "C"], ["DE", "F"]]]);
    wrap(container);
    const table = container.querySelector("table");
    assert.strictEqual(table.rows[0].cells[0].style.minWidth, "2ch");
    assert.strictEqual(table.rows[0].cells[1].style.minWidth, "");
  });
  test("does not set min-width on single-character columns", () => {
    const container = buildContainer([[["X", "hello"], ["Y", "world"]]]);
    wrap(container);
    const table = container.querySelector("table");
    assert.strictEqual(table.rows[0].cells[0].style.minWidth, "", "single-char column should have no min-width");
  });
  test("handles multiple tables independently", () => {
    const container = buildContainer([
      [["AB", "C"], ["DE", "F"]],
      [["X", "YYY"], ["Z", "WWW"]]
    ]);
    wrap(container);
    const tables = container.querySelectorAll("table");
    assert.strictEqual(tables.length, 2);
    assert.strictEqual(tables[0].rows[0].cells[0].style.minWidth, "2ch");
    assert.strictEqual(tables[0].rows[0].cells[1].style.minWidth, "");
    assert.strictEqual(tables[1].rows[0].cells[0].style.minWidth, "");
    assert.strictEqual(tables[1].rows[0].cells[1].style.minWidth, "3ch");
  });
  test("no-ops on a container with no tables", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>hello</p>";
    const { layoutParticipants } = wrap(container);
    assert.strictEqual(layoutParticipants.size, 0);
    assert.strictEqual(container.querySelector("table"), null);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdE1hcmtkb3duVGFibGVTY3JvbGxpbmcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyB3cmFwVGFibGVzV2l0aFNjcm9sbGFibGUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRNYXJrZG93blRhYmxlU2Nyb2xsaW5nLmpzJztcblxuLyoqIEJ1aWxkcyBhbiBIVE1MRWxlbWVudCBjb250YWluaW5nIG9uZSBvciBtb3JlIHRhYmxlcyBmcm9tIG1hcmtkb3duLXN0eWxlIDItRCBhcnJheXMuICovXG5mdW5jdGlvbiBidWlsZENvbnRhaW5lcih0YWJsZXM6IHN0cmluZ1tdW11bXSk6IEhUTUxEaXZFbGVtZW50IHtcblx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdGZvciAoY29uc3Qgcm93cyBvZiB0YWJsZXMpIHtcblx0XHRjb25zdCB0YWJsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RhYmxlJyk7XG5cdFx0cm93cy5mb3JFYWNoKChyb3dEYXRhLCByb3dJbmRleCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VjdGlvbiA9IHJvd0luZGV4ID09PSAwXG5cdFx0XHRcdD8gdGFibGUuY3JlYXRlVEhlYWQoKVxuXHRcdFx0XHQ6ICh0YWJsZS50Qm9kaWVzWzBdID8/IHRhYmxlLmNyZWF0ZVRCb2R5KCkpO1xuXHRcdFx0Y29uc3QgdHIgPSBzZWN0aW9uLmluc2VydFJvdygpO1xuXHRcdFx0Zm9yIChjb25zdCB0ZXh0IG9mIHJvd0RhdGEpIHtcblx0XHRcdFx0Y29uc3QgY2VsbCA9IHJvd0luZGV4ID09PSAwID8gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndGgnKSA6IHRyLmluc2VydENlbGwoKTtcblx0XHRcdFx0Y2VsbC50ZXh0Q29udGVudCA9IHRleHQ7XG5cdFx0XHRcdGlmIChyb3dJbmRleCA9PT0gMCkge1xuXHRcdFx0XHRcdHRyLmFwcGVuZENoaWxkKGNlbGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRhYmxlKTtcblx0fVxuXHRyZXR1cm4gY29udGFpbmVyO1xufVxuXG5zdWl0ZSgnd3JhcFRhYmxlc1dpdGhTY3JvbGxhYmxlJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHdyYXAoY29udGFpbmVyOiBIVE1MRGl2RWxlbWVudCk6IHsgbGF5b3V0UGFydGljaXBhbnRzOiBTZXQ8KCkgPT4gdm9pZD4gfSB7XG5cdFx0Y29uc3QgbGF5b3V0UGFydGljaXBhbnRzID0gbmV3IFNldDwoKSA9PiB2b2lkPigpO1xuXHRcdHN0b3JlLmFkZCh3cmFwVGFibGVzV2l0aFNjcm9sbGFibGUoY29udGFpbmVyLCBuZXcgTGF6eSgoKSA9PiBsYXlvdXRQYXJ0aWNpcGFudHMpKSk7XG5cdFx0cmV0dXJuIHsgbGF5b3V0UGFydGljaXBhbnRzIH07XG5cdH1cblxuXHR0ZXN0KCdyZXBsYWNlcyBlYWNoIHRhYmxlIHdpdGggYSBzY3JvbGwgd3JhcHBlciBpbiB0aGUgRE9NJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGJ1aWxkQ29udGFpbmVyKFtbXG5cdFx0XHRbJ0lEJywgJ05hbWUnXSxcblx0XHRcdFsnMDAxJywgJ0FsaWNlJ10sXG5cdFx0XV0pO1xuXHRcdC8vIEJlZm9yZTogZGlyZWN0IGNoaWxkIGlzIDx0YWJsZT5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGFpbmVyLmNoaWxkcmVuWzBdLnRhZ05hbWUsICdUQUJMRScpO1xuXG5cdFx0d3JhcChjb250YWluZXIpO1xuXG5cdFx0Ly8gQWZ0ZXI6IGRpcmVjdCBjaGlsZCBpcyB0aGUgbW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCB3cmFwcGVyXG5cdFx0Y29uc3Qgd3JhcHBlciA9IGNvbnRhaW5lci5jaGlsZHJlblswXTtcblx0XHRhc3NlcnQub2sod3JhcHBlci5jbGFzc0xpc3QuY29udGFpbnMoJ3JlbmRlcmVkLW1hcmtkb3duLXRhYmxlLXNjcm9sbC13cmFwcGVyJyksXG5cdFx0XHQnb3V0ZXIgbm9kZSBzaG91bGQgaGF2ZSB0aGUgc2Nyb2xsIHdyYXBwZXIgY2xhc3MnKTtcblx0fSk7XG5cblx0dGVzdCgndGFibGUgaXMgcHJlc2VydmVkIGluc2lkZSB0aGUgc2Nyb2xsIHdyYXBwZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gYnVpbGRDb250YWluZXIoW1tbJ0EnLCAnQkInXSwgWydDJywgJ0REJ11dXSk7XG5cdFx0d3JhcChjb250YWluZXIpO1xuXG5cdFx0Ly8gVGhlIHRhYmxlIG11c3Qgc3RpbGwgYmUgaW4gdGhlIGRvY3VtZW50LCBuZXN0ZWQgaW5zaWRlIHRoZSB3cmFwcGVyXG5cdFx0Y29uc3QgdGFibGUgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcigndGFibGUnKTtcblx0XHRhc3NlcnQub2sodGFibGUsICd0YWJsZSBzaG91bGQgc3RpbGwgZXhpc3QgaW4gRE9NJyk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRhaW5lci5jb250YWlucyh0YWJsZSksICd0YWJsZSBzaG91bGQgYmUgaW5zaWRlIGNvbnRhaW5lcicpO1xuXHRcdGFzc2VydC5vayghY29udGFpbmVyLmNoaWxkcmVuWzBdLmlzU2FtZU5vZGUodGFibGUpLCAndGFibGUgc2hvdWxkIG5vdCBiZSBhIGRpcmVjdCBjaGlsZCBhbnltb3JlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZ2lzdGVycyBhIGxheW91dCBwYXJ0aWNpcGFudCBmb3IgZWFjaCB0YWJsZScsICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBidWlsZENvbnRhaW5lcihbXG5cdFx0XHRbWydIMScsICdIMiddLCBbJ2EnLCAnYmInXV0sXG5cdFx0XHRbWydYJywgJ1lZJ10sIFsnYycsICdkZCddXSxcblx0XHRdKTtcblx0XHRjb25zdCB7IGxheW91dFBhcnRpY2lwYW50cyB9ID0gd3JhcChjb250YWluZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXlvdXRQYXJ0aWNpcGFudHMuc2l6ZSwgMiwgJ29uZSBsYXlvdXQgcGFydGljaXBhbnQgcmVnaXN0ZXJlZCBwZXIgdGFibGUnKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0cyBjb2x1bW4gbWluLXdpZHRoIGNhcHBlZCBhdCAzY2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gYnVpbGRDb250YWluZXIoW1tcblx0XHRcdFsnSUQnLCAnTmFtZSddLFxuXHRcdFx0WycwMDEnLCAnQWxpY2UnXSxcblx0XHRcdFsnMDAyJywgJ0xvbmdlciBOYW1lJ10sXG5cdFx0XV0pO1xuXHRcdHdyYXAoY29udGFpbmVyKTtcblxuXHRcdGNvbnN0IHRhYmxlID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ3RhYmxlJykhO1xuXHRcdC8vIG1pbi13aWR0aCBpcyBzZXQgb25seSBvbiB0aGUgZmlyc3Qgcm93OyBvdGhlciByb3dzIGFyZSB1bnRvdWNoZWRcblx0XHQvLyBjb2wgMCBtYXggPSAzIGNoYXJzIC0+IDNjaDsgY29sIDEgbWF4ID0gMTEgY2hhcnMgLT4gY2FwcGVkIGF0IDNjaFxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRBcnJheS5mcm9tKHRhYmxlLnJvd3NbMF0uY2VsbHMpLm1hcChjZWxsID0+IGNlbGwuc3R5bGUubWluV2lkdGgpLFxuXHRcdFx0WyczY2gnLCAnM2NoJ11cblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRBcnJheS5mcm9tKHRhYmxlLnJvd3NbMV0uY2VsbHMpLm1hcChjZWxsID0+IGNlbGwuc3R5bGUubWluV2lkdGgpLFxuXHRcdFx0WycnLCAnJ11cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGFjdHVhbCBjaGFyIGNvdW50IHdoZW4gYmVsb3cgdGhlIDNjaCBjYXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gYnVpbGRDb250YWluZXIoW1tbJ0FCJywgJ0MnXSwgWydERScsICdGJ11dXSk7XG5cdFx0d3JhcChjb250YWluZXIpO1xuXG5cdFx0Y29uc3QgdGFibGUgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcigndGFibGUnKSE7XG5cdFx0Ly8gY29sIDAgbWF4PTIgLT4gMmNoOyBjb2wgMSBtYXg9MSAtPiBubyBtaW4td2lkdGhcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFibGUucm93c1swXS5jZWxsc1swXS5zdHlsZS5taW5XaWR0aCwgJzJjaCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YWJsZS5yb3dzWzBdLmNlbGxzWzFdLnN0eWxlLm1pbldpZHRoLCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHNldCBtaW4td2lkdGggb24gc2luZ2xlLWNoYXJhY3RlciBjb2x1bW5zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGJ1aWxkQ29udGFpbmVyKFtbWydYJywgJ2hlbGxvJ10sIFsnWScsICd3b3JsZCddXV0pO1xuXHRcdHdyYXAoY29udGFpbmVyKTtcblxuXHRcdGNvbnN0IHRhYmxlID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ3RhYmxlJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YWJsZS5yb3dzWzBdLmNlbGxzWzBdLnN0eWxlLm1pbldpZHRoLCAnJywgJ3NpbmdsZS1jaGFyIGNvbHVtbiBzaG91bGQgaGF2ZSBubyBtaW4td2lkdGgnKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBtdWx0aXBsZSB0YWJsZXMgaW5kZXBlbmRlbnRseScsICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBidWlsZENvbnRhaW5lcihbXG5cdFx0XHRbWydBQicsICdDJ10sIFsnREUnLCAnRiddXSxcblx0XHRcdFtbJ1gnLCAnWVlZJ10sIFsnWicsICdXV1cnXV0sXG5cdFx0XSk7XG5cdFx0d3JhcChjb250YWluZXIpO1xuXG5cdFx0Y29uc3QgdGFibGVzID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJ3RhYmxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhYmxlcy5sZW5ndGgsIDIpO1xuXG5cdFx0Ly8gVGFibGUgMTogY29sIDAgbWF4PTIsIGNvbCAxIG1heD0xIC0+IG9ubHkgY29sIDAgZ2V0cyBtaW4td2lkdGhcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFibGVzWzBdLnJvd3NbMF0uY2VsbHNbMF0uc3R5bGUubWluV2lkdGgsICcyY2gnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFibGVzWzBdLnJvd3NbMF0uY2VsbHNbMV0uc3R5bGUubWluV2lkdGgsICcnKTtcblxuXHRcdC8vIFRhYmxlIDI6IGNvbCAwIG1heD0xLCBjb2wgMSBtYXg9MyAtPiBvbmx5IGNvbCAxIGdldHMgbWluLXdpZHRoXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhYmxlc1sxXS5yb3dzWzBdLmNlbGxzWzBdLnN0eWxlLm1pbldpZHRoLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhYmxlc1sxXS5yb3dzWzBdLmNlbGxzWzFdLnN0eWxlLm1pbldpZHRoLCAnM2NoJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vLW9wcyBvbiBhIGNvbnRhaW5lciB3aXRoIG5vIHRhYmxlcycsICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb250YWluZXIuaW5uZXJIVE1MID0gJzxwPmhlbGxvPC9wPic7XG5cdFx0Y29uc3QgeyBsYXlvdXRQYXJ0aWNpcGFudHMgfSA9IHdyYXAoY29udGFpbmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGF5b3V0UGFydGljaXBhbnRzLnNpemUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250YWluZXIucXVlcnlTZWxlY3RvcigndGFibGUnKSwgbnVsbCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFDeEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBR3pDLFNBQVMsZUFBZSxRQUFzQztBQUM3RCxRQUFNLFlBQVksU0FBUyxjQUFjLEtBQUs7QUFDOUMsYUFBVyxRQUFRLFFBQVE7QUFDMUIsVUFBTSxRQUFRLFNBQVMsY0FBYyxPQUFPO0FBQzVDLFNBQUssUUFBUSxDQUFDLFNBQVMsYUFBYTtBQUNuQyxZQUFNLFVBQVUsYUFBYSxJQUMxQixNQUFNLFlBQVksSUFD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
