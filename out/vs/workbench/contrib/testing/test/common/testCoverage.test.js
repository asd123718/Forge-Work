import assert from "assert";
import { createSandbox } from "sinon";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { onObservableChange } from "../../common/observableUtils.js";
import { TestCoverage } from "../../common/testCoverage.js";
import { upcastDeepPartial, upcastPartial } from "../../../../../base/test/common/mock.js";
suite("TestCoverage", () => {
  let sandbox;
  let coverageAccessor;
  let testCoverage;
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    sandbox = createSandbox();
    coverageAccessor = {
      getCoverageDetails: sandbox.stub().resolves([])
    };
    testCoverage = new TestCoverage({}, "taskId", upcastDeepPartial({ extUri: upcastPartial({ ignorePathCasing: () => true }) }), coverageAccessor);
  });
  teardown(() => {
    sandbox.restore();
  });
  function addTests() {
    const raw1 = {
      id: "1",
      uri: URI.file("/path/to/file"),
      statement: { covered: 10, total: 20 },
      branch: { covered: 5, total: 10 },
      declaration: { covered: 2, total: 5 }
    };
    testCoverage.append(raw1, void 0);
    const raw2 = {
      id: "1",
      uri: URI.file("/path/to/file2"),
      statement: { covered: 5, total: 10 },
      branch: { covered: 1, total: 5 }
    };
    testCoverage.append(raw2, void 0);
    return { raw1, raw2 };
  }
  test("should look up file coverage", async () => {
    const { raw1 } = addTests();
    const fileCoverage = testCoverage.getUri(raw1.uri);
    assert.equal(fileCoverage?.id, raw1.id);
    assert.deepEqual(fileCoverage?.statement, raw1.statement);
    assert.deepEqual(fileCoverage?.branch, raw1.branch);
    assert.deepEqual(fileCoverage?.declaration, raw1.declaration);
    assert.strictEqual(testCoverage.getComputedForUri(raw1.uri), testCoverage.getUri(raw1.uri));
    assert.strictEqual(testCoverage.getComputedForUri(URI.file("/path/to/x")), void 0);
    assert.strictEqual(testCoverage.getUri(URI.file("/path/to/x")), void 0);
  });
  test("should compute coverage for directories", async () => {
    const { raw1 } = addTests();
    const dirCoverage = testCoverage.getComputedForUri(URI.file("/path/to"));
    assert.deepEqual(dirCoverage?.statement, { covered: 15, total: 30 });
    assert.deepEqual(dirCoverage?.branch, { covered: 6, total: 15 });
    assert.deepEqual(dirCoverage?.declaration, raw1.declaration);
  });
  test("should incrementally diff updates to existing files", async () => {
    addTests();
    const raw3 = {
      id: "1",
      uri: URI.file("/path/to/file"),
      statement: { covered: 12, total: 24 },
      branch: { covered: 7, total: 10 },
      declaration: { covered: 2, total: 5 }
    };
    testCoverage.append(raw3, void 0);
    const fileCoverage = testCoverage.getUri(raw3.uri);
    assert.deepEqual(fileCoverage?.statement, raw3.statement);
    assert.deepEqual(fileCoverage?.branch, raw3.branch);
    assert.deepEqual(fileCoverage?.declaration, raw3.declaration);
    const dirCoverage = testCoverage.getComputedForUri(URI.file("/path/to"));
    assert.deepEqual(dirCoverage?.statement, { covered: 17, total: 34 });
    assert.deepEqual(dirCoverage?.branch, { covered: 8, total: 15 });
    assert.deepEqual(dirCoverage?.declaration, raw3.declaration);
  });
  test("should emit changes", async () => {
    const changes = [];
    ds.add(onObservableChange(testCoverage.didAddCoverage, (value) => changes.push(value.map((v) => v.value.uri.toString()))));
    addTests();
    assert.deepStrictEqual(changes, [
      [
        "file:///",
        "file:///",
        "file:///",
        "file:///path",
        "file:///path/to",
        "file:///path/to/file"
      ],
      [
        "file:///",
        "file:///",
        "file:///",
        "file:///path",
        "file:///path/to",
        "file:///path/to/file2"
      ]
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXHRlc3RcXGNvbW1vblxcdGVzdENvdmVyYWdlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBTaW5vblNhbmRib3gsIGNyZWF0ZVNhbmRib3ggfSBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBvbk9ic2VydmFibGVDaGFuZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vb2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IElDb3ZlcmFnZUFjY2Vzc29yLCBUZXN0Q292ZXJhZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdENvdmVyYWdlLmpzJztcbmltcG9ydCB7IExpdmVUZXN0UmVzdWx0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlc3RSZXN1bHQuanMnO1xuaW1wb3J0IHsgSUZpbGVDb3ZlcmFnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0VHlwZXMuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyB1cGNhc3REZWVwUGFydGlhbCwgdXBjYXN0UGFydGlhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5cbnN1aXRlKCdUZXN0Q292ZXJhZ2UnLCAoKSA9PiB7XG5cdGxldCBzYW5kYm94OiBTaW5vblNhbmRib3g7XG5cdGxldCBjb3ZlcmFnZUFjY2Vzc29yOiBJQ292ZXJhZ2VBY2Nlc3Nvcjtcblx0bGV0IHRlc3RDb3ZlcmFnZTogVGVzdENvdmVyYWdlO1xuXG5cdGNvbnN0IGRzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHNhbmRib3ggPSBjcmVhdGVTYW5kYm94KCk7XG5cdFx0Y292ZXJhZ2VBY2Nlc3NvciA9IHtcblx0XHRcdGdldENvdmVyYWdlRGV0YWlsczogc2FuZGJveC5zdHViKCkucmVzb2x2ZXMoW10pLFxuXHRcdH07XG5cdFx0dGVzdENvdmVyYWdlID0gbmV3IFRlc3RDb3ZlcmFnZSh7fSBhcyBMaXZlVGVzdFJlc3VsdCwgJ3Rhc2tJZCcsIHVwY2FzdERlZXBQYXJ0aWFsPElVcmlJZGVudGl0eVNlcnZpY2U+KHsgZXh0VXJpOiB1cGNhc3RQYXJ0aWFsKHsgaWdub3JlUGF0aENhc2luZzogKCkgPT4gdHJ1ZSB9KSB9KSwgY292ZXJhZ2VBY2Nlc3Nvcik7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRzYW5kYm94LnJlc3RvcmUoKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gYWRkVGVzdHMoKSB7XG5cdFx0Y29uc3QgcmF3MTogSUZpbGVDb3ZlcmFnZSA9IHtcblx0XHRcdGlkOiAnMScsXG5cdFx0XHR1cmk6IFVSSS5maWxlKCcvcGF0aC90by9maWxlJyksXG5cdFx0XHRzdGF0ZW1lbnQ6IHsgY292ZXJlZDogMTAsIHRvdGFsOiAyMCB9LFxuXHRcdFx0YnJhbmNoOiB7IGNvdmVyZWQ6IDUsIHRvdGFsOiAxMCB9LFxuXHRcdFx0ZGVjbGFyYXRpb246IHsgY292ZXJlZDogMiwgdG90YWw6IDUgfSxcblx0XHR9O1xuXG5cdFx0dGVzdENvdmVyYWdlLmFwcGVuZChyYXcxLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgcmF3MjogSUZpbGVDb3ZlcmFnZSA9IHtcblx0XHRcdGlkOiAnMScsXG5cdFx0XHR1cmk6IFVSSS5maWxlKCcvcGF0aC90by9maWxlMicpLFxuXHRcdFx0c3RhdGVtZW50OiB7IGNvdmVyZWQ6IDUsIHRvdGFsOiAxMCB9LFxuXHRcdFx0YnJhbmNoOiB7IGNvdmVyZWQ6IDEsIHRvdGFsOiA1IH0sXG5cdFx0fTtcblxuXHRcdHRlc3RDb3ZlcmFnZS5hcHBlbmQocmF3MiwgdW5kZWZpbmVkKTtcblxuXHRcdHJldHVybiB7IHJhdzEsIHJhdzIgfTtcblx0fVxuXG5cdHRlc3QoJ3Nob3VsZCBsb29rIHVwIGZpbGUgY292ZXJhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyByYXcxIH0gPSBhZGRUZXN0cygpO1xuXG5cdFx0Y29uc3QgZmlsZUNvdmVyYWdlID0gdGVzdENvdmVyYWdlLmdldFVyaShyYXcxLnVyaSk7XG5cdFx0YXNzZXJ0LmVxdWFsKGZpbGVDb3ZlcmFnZT8uaWQsIHJhdzEuaWQpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwoZmlsZUNvdmVyYWdlPy5zdGF0ZW1lbnQsIHJhdzEuc3RhdGVtZW50KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKGZpbGVDb3ZlcmFnZT8uYnJhbmNoLCByYXcxLmJyYW5jaCk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChmaWxlQ292ZXJhZ2U/LmRlY2xhcmF0aW9uLCByYXcxLmRlY2xhcmF0aW9uKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0Q292ZXJhZ2UuZ2V0Q29tcHV0ZWRGb3JVcmkocmF3MS51cmkpLCB0ZXN0Q292ZXJhZ2UuZ2V0VXJpKHJhdzEudXJpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RDb3ZlcmFnZS5nZXRDb21wdXRlZEZvclVyaShVUkkuZmlsZSgnL3BhdGgvdG8veCcpKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdENvdmVyYWdlLmdldFVyaShVUkkuZmlsZSgnL3BhdGgvdG8veCcpKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGNvbXB1dGUgY292ZXJhZ2UgZm9yIGRpcmVjdG9yaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcmF3MSB9ID0gYWRkVGVzdHMoKTtcblx0XHRjb25zdCBkaXJDb3ZlcmFnZSA9IHRlc3RDb3ZlcmFnZS5nZXRDb21wdXRlZEZvclVyaShVUkkuZmlsZSgnL3BhdGgvdG8nKSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChkaXJDb3ZlcmFnZT8uc3RhdGVtZW50LCB7IGNvdmVyZWQ6IDE1LCB0b3RhbDogMzAgfSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChkaXJDb3ZlcmFnZT8uYnJhbmNoLCB7IGNvdmVyZWQ6IDYsIHRvdGFsOiAxNSB9KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKGRpckNvdmVyYWdlPy5kZWNsYXJhdGlvbiwgcmF3MS5kZWNsYXJhdGlvbik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBpbmNyZW1lbnRhbGx5IGRpZmYgdXBkYXRlcyB0byBleGlzdGluZyBmaWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRhZGRUZXN0cygpO1xuXG5cdFx0Y29uc3QgcmF3MzogSUZpbGVDb3ZlcmFnZSA9IHtcblx0XHRcdGlkOiAnMScsXG5cdFx0XHR1cmk6IFVSSS5maWxlKCcvcGF0aC90by9maWxlJyksXG5cdFx0XHRzdGF0ZW1lbnQ6IHsgY292ZXJlZDogMTIsIHRvdGFsOiAyNCB9LFxuXHRcdFx0YnJhbmNoOiB7IGNvdmVyZWQ6IDcsIHRvdGFsOiAxMCB9LFxuXHRcdFx0ZGVjbGFyYXRpb246IHsgY292ZXJlZDogMiwgdG90YWw6IDUgfSxcblx0XHR9O1xuXG5cdFx0dGVzdENvdmVyYWdlLmFwcGVuZChyYXczLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgZmlsZUNvdmVyYWdlID0gdGVzdENvdmVyYWdlLmdldFVyaShyYXczLnVyaSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChmaWxlQ292ZXJhZ2U/LnN0YXRlbWVudCwgcmF3My5zdGF0ZW1lbnQpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwoZmlsZUNvdmVyYWdlPy5icmFuY2gsIHJhdzMuYnJhbmNoKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKGZpbGVDb3ZlcmFnZT8uZGVjbGFyYXRpb24sIHJhdzMuZGVjbGFyYXRpb24pO1xuXG5cdFx0Y29uc3QgZGlyQ292ZXJhZ2UgPSB0ZXN0Q292ZXJhZ2UuZ2V0Q29tcHV0ZWRGb3JVcmkoVVJJLmZpbGUoJy9wYXRoL3RvJykpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwoZGlyQ292ZXJhZ2U/LnN0YXRlbWVudCwgeyBjb3ZlcmVkOiAxNywgdG90YWw6IDM0IH0pO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwoZGlyQ292ZXJhZ2U/LmJyYW5jaCwgeyBjb3ZlcmVkOiA4LCB0b3RhbDogMTUgfSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChkaXJDb3ZlcmFnZT8uZGVjbGFyYXRpb24sIHJhdzMuZGVjbGFyYXRpb24pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZW1pdCBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYW5nZXM6IHN0cmluZ1tdW10gPSBbXTtcblx0XHRkcy5hZGQob25PYnNlcnZhYmxlQ2hhbmdlKHRlc3RDb3ZlcmFnZS5kaWRBZGRDb3ZlcmFnZSwgdmFsdWUgPT5cblx0XHRcdGNoYW5nZXMucHVzaCh2YWx1ZS5tYXAodiA9PiB2LnZhbHVlIS51cmkudG9TdHJpbmcoKSkpKSk7XG5cblx0XHRhZGRUZXN0cygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGFuZ2VzLCBbXG5cdFx0XHRbXG5cdFx0XHRcdCdmaWxlOi8vLycsXG5cdFx0XHRcdCdmaWxlOi8vLycsXG5cdFx0XHRcdCdmaWxlOi8vLycsXG5cdFx0XHRcdCdmaWxlOi8vL3BhdGgnLFxuXHRcdFx0XHQnZmlsZTovLy9wYXRoL3RvJyxcblx0XHRcdFx0J2ZpbGU6Ly8vcGF0aC90by9maWxlJyxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdmaWxlOi8vLycsXG5cdFx0XHRcdCdmaWxlOi8vLycsXG5cdFx0XHRcdCdmaWxlOi8vLycsXG5cdFx0XHRcdCdmaWxlOi8vL3BhdGgnLFxuXHRcdFx0XHQnZmlsZTovLy9wYXRoL3RvJyxcblx0XHRcdFx0J2ZpbGU6Ly8vcGF0aC90by9maWxlMicsXG5cdFx0XHRdLFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQXVCLHFCQUFxQjtBQUM1QyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBNEIsb0JBQW9CO0FBSWhELFNBQVMsbUJBQW1CLHFCQUFxQjtBQUVqRCxNQUFNLGdCQUFnQixNQUFNO0FBQzNCLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUVKLFFBQU0sS0FBSyx3Q0FBd0M7QUFFbkQsUUFBTSxNQUFNO0FBQ1gsY0FBVSxjQUFjO0FBQ3hCLHVCQUFtQjtBQUFBLE1BQ2xCLG9CQUFvQixRQUFRLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztBQUFBLElBQy9DO0FBQ0EsbUJBQWUsSUFBSSxhQUFhLENBQUMsR0FBcUIsVUFBVSxrQkFBdUMsRUFBRSxR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
