import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Mimes } from "../../../../../base/common/mime.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { CellKind, CellUri, diff, MimeTypeDisplayOrder, NotebookWorkingCopyTypeIdentifier } from "../../common/notebookCommon.js";
import { cellIndexesToRanges, cellRangesToIndexes, reduceCellRanges } from "../../common/notebookRange.js";
import { setupInstantiationService, TestCell } from "./testNotebookEditor.js";
suite("NotebookCommon", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  let disposables;
  let instantiationService;
  let languageService;
  setup(() => {
    disposables = new DisposableStore();
    instantiationService = setupInstantiationService(disposables);
    languageService = instantiationService.get(ILanguageService);
  });
  test("sortMimeTypes default orders", function() {
    assert.deepStrictEqual(
      new MimeTypeDisplayOrder().sort(
        [
          "application/json",
          "application/javascript",
          "text/html",
          "image/svg+xml",
          Mimes.latex,
          Mimes.markdown,
          "image/png",
          "image/jpeg",
          Mimes.text
        ]
      ),
      [
        "application/json",
        "application/javascript",
        "text/html",
        "image/svg+xml",
        Mimes.latex,
        Mimes.markdown,
        "image/png",
        "image/jpeg",
        Mimes.text
      ]
    );
    assert.deepStrictEqual(
      new MimeTypeDisplayOrder().sort(
        [
          "application/json",
          Mimes.latex,
          Mimes.markdown,
          "application/javascript",
          "text/html",
          Mimes.text,
          "image/png",
          "image/jpeg",
          "image/svg+xml"
        ]
      ),
      [
        "application/json",
        "application/javascript",
        "text/html",
        "image/svg+xml",
        Mimes.latex,
        Mimes.markdown,
        "image/png",
        "image/jpeg",
        Mimes.text
      ]
    );
    assert.deepStrictEqual(
      new MimeTypeDisplayOrder().sort(
        [
          Mimes.markdown,
          "application/json",
          Mimes.text,
          "image/jpeg",
          "application/javascript",
          "text/html",
          "image/png",
          "image/svg+xml"
        ]
      ),
      [
        "application/json",
        "application/javascript",
        "text/html",
        "image/svg+xml",
        Mimes.markdown,
        "image/png",
        "image/jpeg",
        Mimes.text
      ]
    );
    disposables.dispose();
  });
  test("sortMimeTypes user orders", function() {
    assert.deepStrictEqual(
      new MimeTypeDisplayOrder([
        "image/png",
        Mimes.text,
        Mimes.markdown,
        "text/html",
        "application/json"
      ]).sort(
        [
          "application/json",
          "application/javascript",
          "text/html",
          "image/svg+xml",
          Mimes.markdown,
          "image/png",
          "image/jpeg",
          Mimes.text
        ]
      ),
      [
        "image/png",
        Mimes.text,
        Mimes.markdown,
        "text/html",
        "application/json",
        "application/javascript",
        "image/svg+xml",
        "image/jpeg"
      ]
    );
    assert.deepStrictEqual(
      new MimeTypeDisplayOrder([
        "application/json",
        "text/html",
        "text/html",
        Mimes.markdown,
        "application/json"
      ]).sort([
        Mimes.markdown,
        "application/json",
        Mimes.text,
        "application/javascript",
        "text/html",
        "image/svg+xml",
        "image/jpeg",
        "image/png"
      ]),
      [
        "application/json",
        "text/html",
        Mimes.markdown,
        "application/javascript",
        "image/svg+xml",
        "image/png",
        "image/jpeg",
        Mimes.text
      ]
    );
    disposables.dispose();
  });
  test("prioritizes mimetypes", () => {
    const m = new MimeTypeDisplayOrder([
      Mimes.markdown,
      "text/html",
      "application/json"
    ]);
    assert.deepStrictEqual(m.toArray(), [Mimes.markdown, "text/html", "application/json"]);
    m.prioritize("text/html", ["application/json"]);
    assert.deepStrictEqual(m.toArray(), [Mimes.markdown, "text/html", "application/json"]);
    m.prioritize("text/html", ["application/json", Mimes.markdown]);
    assert.deepStrictEqual(m.toArray(), ["text/html", Mimes.markdown, "application/json"]);
    m.prioritize("text/plain", ["application/json", Mimes.markdown]);
    assert.deepStrictEqual(m.toArray(), ["text/plain", "text/html", Mimes.markdown, "application/json"]);
    m.prioritize(Mimes.markdown, ["text/plain", "application/json", Mimes.markdown]);
    assert.deepStrictEqual(m.toArray(), ["text/html", Mimes.markdown, "text/plain", "application/json"]);
    m.prioritize("text/plain", ["text/plain", "text/html", Mimes.markdown]);
    assert.deepStrictEqual(m.toArray(), ["text/plain", "text/html", Mimes.markdown, "application/json"]);
    const m2 = new MimeTypeDisplayOrder(["a", "b"]);
    m2.prioritize("b", ["a", "b", "a", "q"]);
    assert.deepStrictEqual(m2.toArray(), ["b", "a"]);
    disposables.dispose();
  });
  test("prioritizes mimetypes with 10+ entries (numeric index sort)", () => {
    const mimes = Array.from({ length: 12 }, (_, i) => `type/${i}`);
    const m = new MimeTypeDisplayOrder(mimes);
    assert.deepStrictEqual(m.toArray(), mimes);
    m.prioritize("type/11", ["type/2", "type/10"]);
    assert.deepStrictEqual(m.toArray(), [
      "type/0",
      "type/1",
      "type/3",
      "type/4",
      "type/5",
      "type/6",
      "type/7",
      "type/8",
      "type/9",
      "type/11",
      "type/2",
      "type/10"
    ]);
    disposables.dispose();
  });
  test("sortMimeTypes glob", function() {
    assert.deepStrictEqual(
      new MimeTypeDisplayOrder([
        "application/vnd-vega*",
        Mimes.markdown,
        "text/html",
        "application/json"
      ]).sort(
        [
          "application/json",
          "application/javascript",
          "text/html",
          "application/vnd-plot.json",
          "application/vnd-vega.json"
        ]
      ),
      [
        "application/vnd-vega.json",
        "text/html",
        "application/json",
        "application/vnd-plot.json",
        "application/javascript"
      ],
      "glob *"
    );
    disposables.dispose();
  });
  test("diff cells", function() {
    const cells = [];
    for (let i = 0; i < 5; i++) {
      cells.push(
        disposables.add(new TestCell("notebook", i, `var a = ${i};`, "javascript", CellKind.Code, [], languageService))
      );
    }
    assert.deepStrictEqual(
      diff(cells, [], (cell) => {
        return cells.indexOf(cell) > -1;
      }),
      [
        {
          start: 0,
          deleteCount: 5,
          toInsert: []
        }
      ]
    );
    assert.deepStrictEqual(
      diff([], cells, (cell) => {
        return false;
      }),
      [
        {
          start: 0,
          deleteCount: 0,
          toInsert: cells
        }
      ]
    );
    const cellA = disposables.add(new TestCell("notebook", 6, "var a = 6;", "javascript", CellKind.Code, [], languageService));
    const cellB = disposables.add(new TestCell("notebook", 7, "var a = 7;", "javascript", CellKind.Code, [], languageService));
    const modifiedCells = [
      cells[0],
      cells[1],
      cellA,
      cells[3],
      cellB,
      cells[4]
    ];
    const splices = diff(cells, modifiedCells, (cell) => {
      return cells.indexOf(cell) > -1;
    });
    assert.deepStrictEqual(
      splices,
      [
        {
          start: 2,
          deleteCount: 1,
          toInsert: [cellA]
        },
        {
          start: 4,
          deleteCount: 0,
          toInsert: [cellB]
        }
      ]
    );
    disposables.dispose();
  });
});
suite("CellUri", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("parse, generate (file-scheme)", function() {
    const nb = URI.parse("file:///bar/f\xF8lder/file.nb");
    const id = 17;
    const data = CellUri.generate(nb, id);
    const actual = CellUri.parse(data);
    assert.ok(Boolean(actual));
    assert.strictEqual(actual?.handle, id);
    assert.strictEqual(actual?.notebook.toString(), nb.toString());
  });
  test("parse, generate (foo-scheme)", function() {
    const nb = URI.parse("foo:///bar/f\xF8lder/file.nb");
    const id = 17;
    const data = CellUri.generate(nb, id);
    const actual = CellUri.parse(data);
    assert.ok(Boolean(actual));
    assert.strictEqual(actual?.handle, id);
    assert.strictEqual(actual?.notebook.toString(), nb.toString());
  });
  test("stable order", function() {
    const nb = URI.parse("foo:///bar/f\xF8lder/file.nb");
    const handles = [1, 2, 9, 10, 88, 100, 666666, 7777777];
    const uris = handles.map((h) => CellUri.generate(nb, h)).sort();
    const strUris = uris.map(String).sort();
    const parsedUris = strUris.map((s) => URI.parse(s));
    const actual = parsedUris.map((u) => CellUri.parse(u)?.handle);
    assert.deepStrictEqual(actual, handles);
  });
});
suite("CellRange", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Cell range to index", function() {
    assert.deepStrictEqual(cellRangesToIndexes([]), []);
    assert.deepStrictEqual(cellRangesToIndexes([{ start: 0, end: 0 }]), []);
    assert.deepStrictEqual(cellRangesToIndexes([{ start: 0, end: 1 }]), [0]);
    assert.deepStrictEqual(cellRangesToIndexes([{ start: 0, end: 2 }]), [0, 1]);
    assert.deepStrictEqual(cellRangesToIndexes([{ start: 0, end: 2 }, { start: 2, end: 3 }]), [0, 1, 2]);
    assert.deepStrictEqual(cellRangesToIndexes([{ start: 0, end: 2 }, { start: 3, end: 4 }]), [0, 1, 3]);
  });
  test("Cell index to range", function() {
    assert.deepStrictEqual(cellIndexesToRanges([]), []);
    assert.deepStrictEqual(cellIndexesToRanges([0]), [{ start: 0, end: 1 }]);
    assert.deepStrictEqual(cellIndexesToRanges([0, 1]), [{ start: 0, end: 2 }]);
    assert.deepStrictEqual(cellIndexesToRanges([0, 1, 2]), [{ start: 0, end: 3 }]);
    assert.deepStrictEqual(cellIndexesToRanges([0, 1, 3]), [{ start: 0, end: 2 }, { start: 3, end: 4 }]);
    assert.deepStrictEqual(cellIndexesToRanges([1, 0]), [{ start: 0, end: 2 }]);
    assert.deepStrictEqual(cellIndexesToRanges([1, 2, 0]), [{ start: 0, end: 3 }]);
    assert.deepStrictEqual(cellIndexesToRanges([3, 1, 0]), [{ start: 0, end: 2 }, { start: 3, end: 4 }]);
    assert.deepStrictEqual(cellIndexesToRanges([9, 10]), [{ start: 9, end: 11 }]);
    assert.deepStrictEqual(cellIndexesToRanges([10, 9]), [{ start: 9, end: 11 }]);
  });
  test("Reduce ranges", function() {
    assert.deepStrictEqual(reduceCellRanges([{ start: 0, end: 1 }, { start: 1, end: 2 }]), [{ start: 0, end: 2 }]);
    assert.deepStrictEqual(reduceCellRanges([{ start: 0, end: 2 }, { start: 1, end: 3 }]), [{ start: 0, end: 3 }]);
    assert.deepStrictEqual(reduceCellRanges([{ start: 1, end: 3 }, { start: 0, end: 2 }]), [{ start: 0, end: 3 }]);
    assert.deepStrictEqual(reduceCellRanges([{ start: 0, end: 2 }, { start: 4, end: 5 }]), [{ start: 0, end: 2 }, { start: 4, end: 5 }]);
    assert.deepStrictEqual(reduceCellRanges([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 4, end: 6 }
    ]), [
      { start: 0, end: 2 },
      { start: 4, end: 6 }
    ]);
    assert.deepStrictEqual(reduceCellRanges([
      { start: 0, end: 1 },
      { start: 1, end: 3 },
      { start: 3, end: 4 }
    ]), [
      { start: 0, end: 4 }
    ]);
  });
  test("Reduce ranges 2, empty ranges", function() {
    assert.deepStrictEqual(reduceCellRanges([{ start: 0, end: 0 }, { start: 0, end: 0 }]), [{ start: 0, end: 0 }]);
    assert.deepStrictEqual(reduceCellRanges([{ start: 0, end: 0 }, { start: 1, end: 2 }]), [{ start: 1, end: 2 }]);
    assert.deepStrictEqual(reduceCellRanges([{ start: 2, end: 2 }]), [{ start: 2, end: 2 }]);
  });
});
suite("NotebookWorkingCopyTypeIdentifier", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("supports notebook type only", function() {
    const viewType = "testViewType";
    const type = NotebookWorkingCopyTypeIdentifier.create(viewType);
    assert.deepEqual(NotebookWorkingCopyTypeIdentifier.parse(type), { notebookType: viewType, viewType });
    assert.strictEqual(NotebookWorkingCopyTypeIdentifier.parse("something"), void 0);
  });
  test("supports different viewtype", function() {
    const notebookType = { notebookType: "testNotebookType", viewType: "testViewType" };
    const type = NotebookWorkingCopyTypeIdentifier.create(notebookType.notebookType, notebookType.viewType);
    assert.deepEqual(NotebookWorkingCopyTypeIdentifier.parse(type), notebookType);
    assert.strictEqual(NotebookWorkingCopyTypeIdentifier.parse("something"), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxub3RlYm9va0NvbW1vbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1pbWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQsIENlbGxVcmksIGRpZmYsIE1pbWVUeXBlRGlzcGxheU9yZGVyLCBOb3RlYm9va1dvcmtpbmdDb3B5VHlwZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgY2VsbEluZGV4ZXNUb1JhbmdlcywgY2VsbFJhbmdlc1RvSW5kZXhlcywgcmVkdWNlQ2VsbFJhbmdlcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va1JhbmdlLmpzJztcbmltcG9ydCB7IHNldHVwSW5zdGFudGlhdGlvblNlcnZpY2UsIFRlc3RDZWxsIH0gZnJvbSAnLi90ZXN0Tm90ZWJvb2tFZGl0b3IuanMnO1xuXG5zdWl0ZSgnTm90ZWJvb2tDb21tb24nLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBzZXR1cEluc3RhbnRpYXRpb25TZXJ2aWNlKGRpc3Bvc2FibGVzKTtcblx0XHRsYW5ndWFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NvcnRNaW1lVHlwZXMgZGVmYXVsdCBvcmRlcnMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXcgTWltZVR5cGVEaXNwbGF5T3JkZXIoKS5zb3J0KFxuXHRcdFx0W1xuXHRcdFx0XHQnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdCdhcHBsaWNhdGlvbi9qYXZhc2NyaXB0Jyxcblx0XHRcdFx0J3RleHQvaHRtbCcsXG5cdFx0XHRcdCdpbWFnZS9zdmcreG1sJyxcblx0XHRcdFx0TWltZXMubGF0ZXgsXG5cdFx0XHRcdE1pbWVzLm1hcmtkb3duLFxuXHRcdFx0XHQnaW1hZ2UvcG5nJyxcblx0XHRcdFx0J2ltYWdlL2pwZWcnLFxuXHRcdFx0XHRNaW1lcy50ZXh0XG5cdFx0XHRdKSxcblx0XHRcdFtcblx0XHRcdFx0J2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHQnYXBwbGljYXRpb24vamF2YXNjcmlwdCcsXG5cdFx0XHRcdCd0ZXh0L2h0bWwnLFxuXHRcdFx0XHQnaW1hZ2Uvc3ZnK3htbCcsXG5cdFx0XHRcdE1pbWVzLmxhdGV4LFxuXHRcdFx0XHRNaW1lcy5tYXJrZG93bixcblx0XHRcdFx0J2ltYWdlL3BuZycsXG5cdFx0XHRcdCdpbWFnZS9qcGVnJyxcblx0XHRcdFx0TWltZXMudGV4dFxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ldyBNaW1lVHlwZURpc3BsYXlPcmRlcigpLnNvcnQoXG5cdFx0XHRbXG5cdFx0XHRcdCdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0TWltZXMubGF0ZXgsXG5cdFx0XHRcdE1pbWVzLm1hcmtkb3duLFxuXHRcdFx0XHQnYXBwbGljYXRpb24vamF2YXNjcmlwdCcsXG5cdFx0XHRcdCd0ZXh0L2h0bWwnLFxuXHRcdFx0XHRNaW1lcy50ZXh0LFxuXHRcdFx0XHQnaW1hZ2UvcG5nJyxcblx0XHRcdFx0J2ltYWdlL2pwZWcnLFxuXHRcdFx0XHQnaW1hZ2Uvc3ZnK3htbCdcblx0XHRcdF0pLFxuXHRcdFx0W1xuXHRcdFx0XHQnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdCdhcHBsaWNhdGlvbi9qYXZhc2NyaXB0Jyxcblx0XHRcdFx0J3RleHQvaHRtbCcsXG5cdFx0XHRcdCdpbWFnZS9zdmcreG1sJyxcblx0XHRcdFx0TWltZXMubGF0ZXgsXG5cdFx0XHRcdE1pbWVzLm1hcmtkb3duLFxuXHRcdFx0XHQnaW1hZ2UvcG5nJyxcblx0XHRcdFx0J2ltYWdlL2pwZWcnLFxuXHRcdFx0XHRNaW1lcy50ZXh0XG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3IE1pbWVUeXBlRGlzcGxheU9yZGVyKCkuc29ydChcblx0XHRcdFtcblx0XHRcdFx0TWltZXMubWFya2Rvd24sXG5cdFx0XHRcdCdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0TWltZXMudGV4dCxcblx0XHRcdFx0J2ltYWdlL2pwZWcnLFxuXHRcdFx0XHQnYXBwbGljYXRpb24vamF2YXNjcmlwdCcsXG5cdFx0XHRcdCd0ZXh0L2h0bWwnLFxuXHRcdFx0XHQnaW1hZ2UvcG5nJyxcblx0XHRcdFx0J2ltYWdlL3N2Zyt4bWwnXG5cdFx0XHRdKSxcblx0XHRcdFtcblx0XHRcdFx0J2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHQnYXBwbGljYXRpb24vamF2YXNjcmlwdCcsXG5cdFx0XHRcdCd0ZXh0L2h0bWwnLFxuXHRcdFx0XHQnaW1hZ2Uvc3ZnK3htbCcsXG5cdFx0XHRcdE1pbWVzLm1hcmtkb3duLFxuXHRcdFx0XHQnaW1hZ2UvcG5nJyxcblx0XHRcdFx0J2ltYWdlL2pwZWcnLFxuXHRcdFx0XHRNaW1lcy50ZXh0XG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblxuXG5cdHRlc3QoJ3NvcnRNaW1lVHlwZXMgdXNlciBvcmRlcnMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdG5ldyBNaW1lVHlwZURpc3BsYXlPcmRlcihbXG5cdFx0XHRcdCdpbWFnZS9wbmcnLFxuXHRcdFx0XHRNaW1lcy50ZXh0LFxuXHRcdFx0XHRNaW1lcy5tYXJrZG93bixcblx0XHRcdFx0J3RleHQvaHRtbCcsXG5cdFx0XHRcdCdhcHBsaWNhdGlvbi9qc29uJ1xuXHRcdFx0XSkuc29ydChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0XHQnYXBwbGljYXRpb24vamF2YXNjcmlwdCcsXG5cdFx0XHRcdFx0J3RleHQvaHRtbCcsXG5cdFx0XHRcdFx0J2ltYWdlL3N2Zyt4bWwnLFxuXHRcdFx0XHRcdE1pbWVzLm1hcmtkb3duLFxuXHRcdFx0XHRcdCdpbWFnZS9wbmcnLFxuXHRcdFx0XHRcdCdpbWFnZS9qcGVnJyxcblx0XHRcdFx0XHRNaW1lcy50ZXh0XG5cdFx0XHRcdF1cblx0XHRcdCksXG5cdFx0XHRbXG5cdFx0XHRcdCdpbWFnZS9wbmcnLFxuXHRcdFx0XHRNaW1lcy50ZXh0LFxuXHRcdFx0XHRNaW1lcy5tYXJrZG93bixcblx0XHRcdFx0J3RleHQvaHRtbCcsXG5cdFx0XHRcdCdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0J2FwcGxpY2F0aW9uL2phdmFzY3JpcHQnLFxuXHRcdFx0XHQnaW1hZ2Uvc3ZnK3htbCcsXG5cdFx0XHRcdCdpbWFnZS9qcGVnJyxcblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdG5ldyBNaW1lVHlwZURpc3BsYXlPcmRlcihbXG5cdFx0XHRcdCdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0J3RleHQvaHRtbCcsXG5cdFx0XHRcdCd0ZXh0L2h0bWwnLFxuXHRcdFx0XHRNaW1lcy5tYXJrZG93bixcblx0XHRcdFx0J2FwcGxpY2F0aW9uL2pzb24nXG5cdFx0XHRdKS5zb3J0KFtcblx0XHRcdFx0TWltZXMubWFya2Rvd24sXG5cdFx0XHRcdCdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0TWltZXMudGV4dCxcblx0XHRcdFx0J2FwcGxpY2F0aW9uL2phdmFzY3JpcHQnLFxuXHRcdFx0XHQndGV4dC9odG1sJyxcblx0XHRcdFx0J2ltYWdlL3N2Zyt4bWwnLFxuXHRcdFx0XHQnaW1hZ2UvanBlZycsXG5cdFx0XHRcdCdpbWFnZS9wbmcnXG5cdFx0XHRdKSxcblx0XHRcdFtcblx0XHRcdFx0J2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHQndGV4dC9odG1sJyxcblx0XHRcdFx0TWltZXMubWFya2Rvd24sXG5cdFx0XHRcdCdhcHBsaWNhdGlvbi9qYXZhc2NyaXB0Jyxcblx0XHRcdFx0J2ltYWdlL3N2Zyt4bWwnLFxuXHRcdFx0XHQnaW1hZ2UvcG5nJyxcblx0XHRcdFx0J2ltYWdlL2pwZWcnLFxuXHRcdFx0XHRNaW1lcy50ZXh0XG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncHJpb3JpdGl6ZXMgbWltZXR5cGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG0gPSBuZXcgTWltZVR5cGVEaXNwbGF5T3JkZXIoW1xuXHRcdFx0TWltZXMubWFya2Rvd24sXG5cdFx0XHQndGV4dC9odG1sJyxcblx0XHRcdCdhcHBsaWNhdGlvbi9qc29uJ1xuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS50b0FycmF5KCksIFtNaW1lcy5tYXJrZG93biwgJ3RleHQvaHRtbCcsICdhcHBsaWNhdGlvbi9qc29uJ10pO1xuXG5cdFx0Ly8gbm8tb3AgaWYgYWxyZWFkeSBpbiB0aGUgcmlnaHQgb3JkZXJcblx0XHRtLnByaW9yaXRpemUoJ3RleHQvaHRtbCcsIFsnYXBwbGljYXRpb24vanNvbiddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udG9BcnJheSgpLCBbTWltZXMubWFya2Rvd24sICd0ZXh0L2h0bWwnLCAnYXBwbGljYXRpb24vanNvbiddKTtcblxuXHRcdC8vIHNvcnRzIHRvIGhpZ2hlc3QgcHJpb3JpdHlcblx0XHRtLnByaW9yaXRpemUoJ3RleHQvaHRtbCcsIFsnYXBwbGljYXRpb24vanNvbicsIE1pbWVzLm1hcmtkb3duXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnRvQXJyYXkoKSwgWyd0ZXh0L2h0bWwnLCBNaW1lcy5tYXJrZG93biwgJ2FwcGxpY2F0aW9uL2pzb24nXSk7XG5cblx0XHQvLyBhZGRzIGluIG5ldyB0eXBlXG5cdFx0bS5wcmlvcml0aXplKCd0ZXh0L3BsYWluJywgWydhcHBsaWNhdGlvbi9qc29uJywgTWltZXMubWFya2Rvd25dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udG9BcnJheSgpLCBbJ3RleHQvcGxhaW4nLCAndGV4dC9odG1sJywgTWltZXMubWFya2Rvd24sICdhcHBsaWNhdGlvbi9qc29uJ10pO1xuXG5cdFx0Ly8gbW92ZXMgbXVsdGlwbGUsIHByZXNlcnZlcyBvcmRlclxuXHRcdG0ucHJpb3JpdGl6ZShNaW1lcy5tYXJrZG93biwgWyd0ZXh0L3BsYWluJywgJ2FwcGxpY2F0aW9uL2pzb24nLCBNaW1lcy5tYXJrZG93bl0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS50b0FycmF5KCksIFsndGV4dC9odG1sJywgTWltZXMubWFya2Rvd24sICd0ZXh0L3BsYWluJywgJ2FwcGxpY2F0aW9uL2pzb24nXSk7XG5cblx0XHQvLyBkZWxldGVzIG11bHRpcGxlXG5cdFx0bS5wcmlvcml0aXplKCd0ZXh0L3BsYWluJywgWyd0ZXh0L3BsYWluJywgJ3RleHQvaHRtbCcsIE1pbWVzLm1hcmtkb3duXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnRvQXJyYXkoKSwgWyd0ZXh0L3BsYWluJywgJ3RleHQvaHRtbCcsIE1pbWVzLm1hcmtkb3duLCAnYXBwbGljYXRpb24vanNvbiddKTtcblxuXHRcdC8vIGhhbmRsZXMgbXVsdGlwbGUgbWltZXR5cGVzLCB1bmtub3duIG1pbWV0eXBlXG5cdFx0Y29uc3QgbTIgPSBuZXcgTWltZVR5cGVEaXNwbGF5T3JkZXIoWydhJywgJ2InXSk7XG5cdFx0bTIucHJpb3JpdGl6ZSgnYicsIFsnYScsICdiJywgJ2EnLCAncSddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0yLnRvQXJyYXkoKSwgWydiJywgJ2EnXSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByaW9yaXRpemVzIG1pbWV0eXBlcyB3aXRoIDEwKyBlbnRyaWVzIChudW1lcmljIGluZGV4IHNvcnQpJywgKCkgPT4ge1xuXHRcdC8vIFJlZ3Jlc3Npb24gZm9yIHRoZSBjYXNlIHdoZXJlIGBBcnJheS5mcm9tKHVuaXF1ZUluZGljZXMpLnNvcnQoKWAgZGlkIGFcblx0XHQvLyBsZXhpY29ncmFwaGljIHNvcnQgb24gbnVtZXJpYyBpbmRpY2VzLCBzbyBgWzIsIDEwXWAgYmVjYW1lIGBbMTAsIDJdYFxuXHRcdC8vIGFuZCB0aGUgcmV2ZXJzZS1zcGxpY2UgbG9vcCByZW1vdmVkIHRoZSB3cm9uZyBlbnRyaWVzLlxuXHRcdGNvbnN0IG1pbWVzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMTIgfSwgKF8sIGkpID0+IGB0eXBlLyR7aX1gKTtcblx0XHRjb25zdCBtID0gbmV3IE1pbWVUeXBlRGlzcGxheU9yZGVyKG1pbWVzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udG9BcnJheSgpLCBtaW1lcyk7XG5cblx0XHRtLnByaW9yaXRpemUoJ3R5cGUvMTEnLCBbJ3R5cGUvMicsICd0eXBlLzEwJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS50b0FycmF5KCksIFtcblx0XHRcdCd0eXBlLzAnLCAndHlwZS8xJywgJ3R5cGUvMycsICd0eXBlLzQnLCAndHlwZS81Jyxcblx0XHRcdCd0eXBlLzYnLCAndHlwZS83JywgJ3R5cGUvOCcsICd0eXBlLzknLCAndHlwZS8xMScsXG5cdFx0XHQndHlwZS8yJywgJ3R5cGUvMTAnLFxuXHRcdF0pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzb3J0TWltZVR5cGVzIGdsb2InLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdG5ldyBNaW1lVHlwZURpc3BsYXlPcmRlcihbXG5cdFx0XHRcdCdhcHBsaWNhdGlvbi92bmQtdmVnYSonLFxuXHRcdFx0XHRNaW1lcy5tYXJrZG93bixcblx0XHRcdFx0J3RleHQvaHRtbCcsXG5cdFx0XHRcdCdhcHBsaWNhdGlvbi9qc29uJ1xuXHRcdFx0XSkuc29ydChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0XHQnYXBwbGljYXRpb24vamF2YXNjcmlwdCcsXG5cdFx0XHRcdFx0J3RleHQvaHRtbCcsXG5cdFx0XHRcdFx0J2FwcGxpY2F0aW9uL3ZuZC1wbG90Lmpzb24nLFxuXHRcdFx0XHRcdCdhcHBsaWNhdGlvbi92bmQtdmVnYS5qc29uJ1xuXHRcdFx0XHRdXG5cdFx0XHQpLFxuXHRcdFx0W1xuXHRcdFx0XHQnYXBwbGljYXRpb24vdm5kLXZlZ2EuanNvbicsXG5cdFx0XHRcdCd0ZXh0L2h0bWwnLFxuXHRcdFx0XHQnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdCdhcHBsaWNhdGlvbi92bmQtcGxvdC5qc29uJyxcblx0XHRcdFx0J2FwcGxpY2F0aW9uL2phdmFzY3JpcHQnLFxuXHRcdFx0XSxcblx0XHRcdCdnbG9iIConXG5cdFx0KTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZiBjZWxscycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjZWxsczogVGVzdENlbGxbXSA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1OyBpKyspIHtcblx0XHRcdGNlbGxzLnB1c2goXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdENlbGwoJ25vdGVib29rJywgaSwgYHZhciBhID0gJHtpfTtgLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCBsYW5ndWFnZVNlcnZpY2UpKVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpZmY8VGVzdENlbGw+KGNlbGxzLCBbXSwgKGNlbGwpID0+IHtcblx0XHRcdHJldHVybiBjZWxscy5pbmRleE9mKGNlbGwpID4gLTE7XG5cdFx0fSksIFtcblx0XHRcdHtcblx0XHRcdFx0c3RhcnQ6IDAsXG5cdFx0XHRcdGRlbGV0ZUNvdW50OiA1LFxuXHRcdFx0XHR0b0luc2VydDogW11cblx0XHRcdH1cblx0XHRdXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlmZjxUZXN0Q2VsbD4oW10sIGNlbGxzLCAoY2VsbCkgPT4ge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0pLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHN0YXJ0OiAwLFxuXHRcdFx0XHRkZWxldGVDb3VudDogMCxcblx0XHRcdFx0dG9JbnNlcnQ6IGNlbGxzXG5cdFx0XHR9XG5cdFx0XVxuXHRcdCk7XG5cblx0XHRjb25zdCBjZWxsQSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdENlbGwoJ25vdGVib29rJywgNiwgJ3ZhciBhID0gNjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCBsYW5ndWFnZVNlcnZpY2UpKTtcblx0XHRjb25zdCBjZWxsQiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdENlbGwoJ25vdGVib29rJywgNywgJ3ZhciBhID0gNzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCBsYW5ndWFnZVNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IG1vZGlmaWVkQ2VsbHMgPSBbXG5cdFx0XHRjZWxsc1swXSxcblx0XHRcdGNlbGxzWzFdLFxuXHRcdFx0Y2VsbEEsXG5cdFx0XHRjZWxsc1szXSxcblx0XHRcdGNlbGxCLFxuXHRcdFx0Y2VsbHNbNF1cblx0XHRdO1xuXG5cdFx0Y29uc3Qgc3BsaWNlcyA9IGRpZmY8VGVzdENlbGw+KGNlbGxzLCBtb2RpZmllZENlbGxzLCAoY2VsbCkgPT4ge1xuXHRcdFx0cmV0dXJuIGNlbGxzLmluZGV4T2YoY2VsbCkgPiAtMTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3BsaWNlcyxcblx0XHRcdFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHN0YXJ0OiAyLFxuXHRcdFx0XHRcdGRlbGV0ZUNvdW50OiAxLFxuXHRcdFx0XHRcdHRvSW5zZXJ0OiBbY2VsbEFdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzdGFydDogNCxcblx0XHRcdFx0XHRkZWxldGVDb3VudDogMCxcblx0XHRcdFx0XHR0b0luc2VydDogW2NlbGxCXVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cbn0pO1xuXG5cbnN1aXRlKCdDZWxsVXJpJywgZnVuY3Rpb24gKCkge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3BhcnNlLCBnZW5lcmF0ZSAoZmlsZS1zY2hlbWUpJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgbmIgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vYmFyL2ZcdTAwRjhsZGVyL2ZpbGUubmInKTtcblx0XHRjb25zdCBpZCA9IDE3O1xuXG5cdFx0Y29uc3QgZGF0YSA9IENlbGxVcmkuZ2VuZXJhdGUobmIsIGlkKTtcblx0XHRjb25zdCBhY3R1YWwgPSBDZWxsVXJpLnBhcnNlKGRhdGEpO1xuXHRcdGFzc2VydC5vayhCb29sZWFuKGFjdHVhbCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWw/LmhhbmRsZSwgaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWw/Lm5vdGVib29rLnRvU3RyaW5nKCksIG5iLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZSwgZ2VuZXJhdGUgKGZvby1zY2hlbWUpJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgbmIgPSBVUkkucGFyc2UoJ2ZvbzovLy9iYXIvZlx1MDBGOGxkZXIvZmlsZS5uYicpO1xuXHRcdGNvbnN0IGlkID0gMTc7XG5cblx0XHRjb25zdCBkYXRhID0gQ2VsbFVyaS5nZW5lcmF0ZShuYiwgaWQpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IENlbGxVcmkucGFyc2UoZGF0YSk7XG5cdFx0YXNzZXJ0Lm9rKEJvb2xlYW4oYWN0dWFsKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbD8uaGFuZGxlLCBpZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbD8ubm90ZWJvb2sudG9TdHJpbmcoKSwgbmIudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YWJsZSBvcmRlcicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IG5iID0gVVJJLnBhcnNlKCdmb286Ly8vYmFyL2ZcdTAwRjhsZGVyL2ZpbGUubmInKTtcblx0XHRjb25zdCBoYW5kbGVzID0gWzEsIDIsIDksIDEwLCA4OCwgMTAwLCA2NjY2NjYsIDc3Nzc3NzddO1xuXG5cdFx0Y29uc3QgdXJpcyA9IGhhbmRsZXMubWFwKGggPT4gQ2VsbFVyaS5nZW5lcmF0ZShuYiwgaCkpLnNvcnQoKTtcblxuXHRcdGNvbnN0IHN0clVyaXMgPSB1cmlzLm1hcChTdHJpbmcpLnNvcnQoKTtcblx0XHRjb25zdCBwYXJzZWRVcmlzID0gc3RyVXJpcy5tYXAocyA9PiBVUkkucGFyc2UocykpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VkVXJpcy5tYXAodSA9PiBDZWxsVXJpLnBhcnNlKHUpPy5oYW5kbGUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGhhbmRsZXMpO1xuXHR9KTtcbn0pO1xuXG5cbnN1aXRlKCdDZWxsUmFuZ2UnLCBmdW5jdGlvbiAoKSB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnQ2VsbCByYW5nZSB0byBpbmRleCcsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxSYW5nZXNUb0luZGV4ZXMoW10pLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsUmFuZ2VzVG9JbmRleGVzKFt7IHN0YXJ0OiAwLCBlbmQ6IDAgfV0pLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsUmFuZ2VzVG9JbmRleGVzKFt7IHN0YXJ0OiAwLCBlbmQ6IDEgfV0pLCBbMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbFJhbmdlc1RvSW5kZXhlcyhbeyBzdGFydDogMCwgZW5kOiAyIH1dKSwgWzAsIDFdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxSYW5nZXNUb0luZGV4ZXMoW3sgc3RhcnQ6IDAsIGVuZDogMiB9LCB7IHN0YXJ0OiAyLCBlbmQ6IDMgfV0pLCBbMCwgMSwgMl0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbFJhbmdlc1RvSW5kZXhlcyhbeyBzdGFydDogMCwgZW5kOiAyIH0sIHsgc3RhcnQ6IDMsIGVuZDogNCB9XSksIFswLCAxLCAzXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NlbGwgaW5kZXggdG8gcmFuZ2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsSW5kZXhlc1RvUmFuZ2VzKFtdKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbEluZGV4ZXNUb1JhbmdlcyhbMF0pLCBbeyBzdGFydDogMCwgZW5kOiAxIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxJbmRleGVzVG9SYW5nZXMoWzAsIDFdKSwgW3sgc3RhcnQ6IDAsIGVuZDogMiB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsSW5kZXhlc1RvUmFuZ2VzKFswLCAxLCAyXSksIFt7IHN0YXJ0OiAwLCBlbmQ6IDMgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbEluZGV4ZXNUb1JhbmdlcyhbMCwgMSwgM10pLCBbeyBzdGFydDogMCwgZW5kOiAyIH0sIHsgc3RhcnQ6IDMsIGVuZDogNCB9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxJbmRleGVzVG9SYW5nZXMoWzEsIDBdKSwgW3sgc3RhcnQ6IDAsIGVuZDogMiB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsSW5kZXhlc1RvUmFuZ2VzKFsxLCAyLCAwXSksIFt7IHN0YXJ0OiAwLCBlbmQ6IDMgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbEluZGV4ZXNUb1JhbmdlcyhbMywgMSwgMF0pLCBbeyBzdGFydDogMCwgZW5kOiAyIH0sIHsgc3RhcnQ6IDMsIGVuZDogNCB9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxJbmRleGVzVG9SYW5nZXMoWzksIDEwXSksIFt7IHN0YXJ0OiA5LCBlbmQ6IDExIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxJbmRleGVzVG9SYW5nZXMoWzEwLCA5XSksIFt7IHN0YXJ0OiA5LCBlbmQ6IDExIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnUmVkdWNlIHJhbmdlcycsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZHVjZUNlbGxSYW5nZXMoW3sgc3RhcnQ6IDAsIGVuZDogMSB9LCB7IHN0YXJ0OiAxLCBlbmQ6IDIgfV0pLCBbeyBzdGFydDogMCwgZW5kOiAyIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZHVjZUNlbGxSYW5nZXMoW3sgc3RhcnQ6IDAsIGVuZDogMiB9LCB7IHN0YXJ0OiAxLCBlbmQ6IDMgfV0pLCBbeyBzdGFydDogMCwgZW5kOiAzIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZHVjZUNlbGxSYW5nZXMoW3sgc3RhcnQ6IDEsIGVuZDogMyB9LCB7IHN0YXJ0OiAwLCBlbmQ6IDIgfV0pLCBbeyBzdGFydDogMCwgZW5kOiAzIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZHVjZUNlbGxSYW5nZXMoW3sgc3RhcnQ6IDAsIGVuZDogMiB9LCB7IHN0YXJ0OiA0LCBlbmQ6IDUgfV0pLCBbeyBzdGFydDogMCwgZW5kOiAyIH0sIHsgc3RhcnQ6IDQsIGVuZDogNSB9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZHVjZUNlbGxSYW5nZXMoW1xuXHRcdFx0eyBzdGFydDogMCwgZW5kOiAxIH0sXG5cdFx0XHR7IHN0YXJ0OiAxLCBlbmQ6IDIgfSxcblx0XHRcdHsgc3RhcnQ6IDQsIGVuZDogNiB9XG5cdFx0XSksIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGVuZDogMiB9LFxuXHRcdFx0eyBzdGFydDogNCwgZW5kOiA2IH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVkdWNlQ2VsbFJhbmdlcyhbXG5cdFx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDEgfSxcblx0XHRcdHsgc3RhcnQ6IDEsIGVuZDogMyB9LFxuXHRcdFx0eyBzdGFydDogMywgZW5kOiA0IH1cblx0XHRdKSwgW1xuXHRcdFx0eyBzdGFydDogMCwgZW5kOiA0IH1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnUmVkdWNlIHJhbmdlcyAyLCBlbXB0eSByYW5nZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWR1Y2VDZWxsUmFuZ2VzKFt7IHN0YXJ0OiAwLCBlbmQ6IDAgfSwgeyBzdGFydDogMCwgZW5kOiAwIH1dKSwgW3sgc3RhcnQ6IDAsIGVuZDogMCB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWR1Y2VDZWxsUmFuZ2VzKFt7IHN0YXJ0OiAwLCBlbmQ6IDAgfSwgeyBzdGFydDogMSwgZW5kOiAyIH1dKSwgW3sgc3RhcnQ6IDEsIGVuZDogMiB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWR1Y2VDZWxsUmFuZ2VzKFt7IHN0YXJ0OiAyLCBlbmQ6IDIgfV0pLCBbeyBzdGFydDogMiwgZW5kOiAyIH1dKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ05vdGVib29rV29ya2luZ0NvcHlUeXBlSWRlbnRpZmllcicsIGZ1bmN0aW9uICgpIHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc3VwcG9ydHMgbm90ZWJvb2sgdHlwZSBvbmx5JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHZpZXdUeXBlID0gJ3Rlc3RWaWV3VHlwZSc7XG5cdFx0Y29uc3QgdHlwZSA9IE5vdGVib29rV29ya2luZ0NvcHlUeXBlSWRlbnRpZmllci5jcmVhdGUodmlld1R5cGUpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwoTm90ZWJvb2tXb3JraW5nQ29weVR5cGVJZGVudGlmaWVyLnBhcnNlKHR5cGUpLCB7IG5vdGVib29rVHlwZTogdmlld1R5cGUsIHZpZXdUeXBlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChOb3RlYm9va1dvcmtpbmdDb3B5VHlwZUlkZW50aWZpZXIucGFyc2UoJ3NvbWV0aGluZycpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdXBwb3J0cyBkaWZmZXJlbnQgdmlld3R5cGUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgbm90ZWJvb2tUeXBlID0geyBub3RlYm9va1R5cGU6ICd0ZXN0Tm90ZWJvb2tUeXBlJywgdmlld1R5cGU6ICd0ZXN0Vmlld1R5cGUnIH07XG5cdFx0Y29uc3QgdHlwZSA9IE5vdGVib29rV29ya2luZ0NvcHlUeXBlSWRlbnRpZmllci5jcmVhdGUobm90ZWJvb2tUeXBlLm5vdGVib29rVHlwZSwgbm90ZWJvb2tUeXBlLnZpZXdUeXBlKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKE5vdGVib29rV29ya2luZ0NvcHlUeXBlSWRlbnRpZmllci5wYXJzZSh0eXBlKSwgbm90ZWJvb2tUeXBlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoTm90ZWJvb2tXb3JraW5nQ29weVR5cGVJZGVudGlmaWVyLnBhcnNlKCdzb21ldGhpbmcnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsVUFBVSxTQUFTLE1BQU0sc0JBQXNCLHlDQUF5QztBQUNqRyxTQUFTLHFCQUFxQixxQkFBcUIsd0JBQXdCO0FBQzNFLFNBQVMsMkJBQTJCLGdCQUFnQjtBQUVwRCxNQUFNLGtCQUFrQixNQUFNO0FBQzdCLDBDQUF3QztBQUV4QyxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCxrQkFBYyxJQUFJLGdCQUFnQjtBQUNsQywyQkFBdUIsMEJBQTBCLFdBQVc7QUFDNUQsc0JBQWtCLHFCQUFxQixJQUFJLGdCQUFnQjtBQUFBLEVBQzVELENBQUM7QUFFRCxPQUFLLGdDQUFnQyxXQUFZO0FBQ2hELFdBQU87QUFBQSxNQUFnQixJQUFJLHFCQUFxQixFQUFFO0FBQUEsUUFDakQ7QUFBQSxVQUNDO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQSxNQUFNO0FBQUEsVUFDTixNQUFNO0FBQUEsVUFDTjtBQUFBLFVBQ0E7QUFBQSxVQUNBLE1BQU07QUFBQSxRQUNQO0FBQUEsTUFBQztBQUFBLE1BQ0Q7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTjtBQUFBLFFBQ0E7QUFBQSxRQUNBLE1BQU07QUFBQSxNQUNQO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFB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
