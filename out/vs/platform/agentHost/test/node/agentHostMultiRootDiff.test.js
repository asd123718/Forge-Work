import assert from "assert";
import { isLinux } from "../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { dedupeSessionFileDiffs, evaluateMultiRootDiffSources } from "../../node/agentHostMultiRootDiff.js";
function created(uri) {
  return { after: { uri, content: { uri } } };
}
function deleted(uri) {
  return { before: { uri, content: { uri } } };
}
function renamed(fromUri, toUri) {
  return { before: { uri: fromUri, content: { uri: fromUri } }, after: { uri: toUri, content: { uri: toUri } } };
}
suite("agentHostMultiRootDiff", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("dedupeSessionFileDiffs", () => {
    test("keeps the first (git) occurrence of a duplicated file across lists", () => {
      const gitDiff = created("file:///repo/a.ts");
      const dbDiff = created("file:///repo/a.ts");
      const merged = dedupeSessionFileDiffs([[gitDiff], [dbDiff]]);
      assert.deepStrictEqual(merged, [gitDiff]);
    });
    test("keeps genuinely distinct files and preserves order", () => {
      const a = created("file:///repo/a.ts");
      const b = created("file:///repo/b.ts");
      const c = deleted("file:///repo/c.ts");
      const merged = dedupeSessionFileDiffs([[a, b], [c]]);
      assert.deepStrictEqual(merged, [a, b, c]);
    });
    test("keys renames on their destination and deletions on their source", () => {
      const rename = renamed("file:///repo/old.ts", "file:///repo/new.ts");
      const dbEditOfDestination = created("file:///repo/new.ts");
      const deletion = deleted("file:///repo/gone.ts");
      const merged = dedupeSessionFileDiffs([[rename, deletion], [dbEditOfDestination]]);
      assert.deepStrictEqual(merged, [rename, deletion]);
    });
    test("same-repo case-variant file: URIs collapse only on case-insensitive platforms", () => {
      const upper = created("file:///repo/File.ts");
      const lower = created("file:///repo/file.ts");
      const merged = dedupeSessionFileDiffs([[upper, lower]]);
      assert.strictEqual(merged.length, isLinux ? 2 : 1);
    });
    test("non-file scheme URIs keep exact identity (no case folding)", () => {
      const upper = created("vscode-notebook-cell:///nb.ipynb#Ch0");
      const lower = created("vscode-notebook-cell:///nb.ipynb#ch0");
      const merged = dedupeSessionFileDiffs([[upper, lower]]);
      assert.deepStrictEqual(merged, [upper, lower]);
    });
    test("ignores diffs without any URI", () => {
      const empty = {};
      const real = created("file:///repo/a.ts");
      const merged = dedupeSessionFileDiffs([[empty, real]]);
      assert.deepStrictEqual(merged, [real]);
    });
  });
  suite("evaluateMultiRootDiffSources", () => {
    test("all sources available => complete", () => {
      const a = [created("file:///repo/a.ts")];
      const b = [];
      assert.deepStrictEqual(evaluateMultiRootDiffSources([a, b]), {
        outcome: "complete",
        availableSources: [a, b]
      });
    });
    test("some sources unavailable => partial, availables preserved in order", () => {
      const a = [created("file:///repo/a.ts")];
      const c = [created("file:///repo/c.ts")];
      assert.deepStrictEqual(evaluateMultiRootDiffSources([a, void 0, c]), {
        outcome: "partial",
        availableSources: [a, c]
      });
    });
    test("no source available => failed", () => {
      assert.deepStrictEqual(evaluateMultiRootDiffSources([void 0, void 0]), {
        outcome: "failed",
        availableSources: []
      });
    });
    test("zero sources => failed (degenerate no-target case)", () => {
      assert.deepStrictEqual(evaluateMultiRootDiffSources([]), {
        outcome: "failed",
        availableSources: []
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RNdWx0aVJvb3REaWZmLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBpc0xpbnV4IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgdHlwZSB7IElTZXNzaW9uRmlsZURpZmYgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGRlZHVwZVNlc3Npb25GaWxlRGlmZnMsIGV2YWx1YXRlTXVsdGlSb290RGlmZlNvdXJjZXMgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdE11bHRpUm9vdERpZmYuanMnO1xuXG5mdW5jdGlvbiBjcmVhdGVkKHVyaTogc3RyaW5nKTogSVNlc3Npb25GaWxlRGlmZiB7XG5cdHJldHVybiB7IGFmdGVyOiB7IHVyaSwgY29udGVudDogeyB1cmkgfSB9IH07XG59XG5cbmZ1bmN0aW9uIGRlbGV0ZWQodXJpOiBzdHJpbmcpOiBJU2Vzc2lvbkZpbGVEaWZmIHtcblx0cmV0dXJuIHsgYmVmb3JlOiB7IHVyaSwgY29udGVudDogeyB1cmkgfSB9IH07XG59XG5cbmZ1bmN0aW9uIHJlbmFtZWQoZnJvbVVyaTogc3RyaW5nLCB0b1VyaTogc3RyaW5nKTogSVNlc3Npb25GaWxlRGlmZiB7XG5cdHJldHVybiB7IGJlZm9yZTogeyB1cmk6IGZyb21VcmksIGNvbnRlbnQ6IHsgdXJpOiBmcm9tVXJpIH0gfSwgYWZ0ZXI6IHsgdXJpOiB0b1VyaSwgY29udGVudDogeyB1cmk6IHRvVXJpIH0gfSB9O1xufVxuXG5zdWl0ZSgnYWdlbnRIb3N0TXVsdGlSb290RGlmZicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2RlZHVwZVNlc3Npb25GaWxlRGlmZnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgna2VlcHMgdGhlIGZpcnN0IChnaXQpIG9jY3VycmVuY2Ugb2YgYSBkdXBsaWNhdGVkIGZpbGUgYWNyb3NzIGxpc3RzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2l0RGlmZiA9IGNyZWF0ZWQoJ2ZpbGU6Ly8vcmVwby9hLnRzJyk7XG5cdFx0XHRjb25zdCBkYkRpZmYgPSBjcmVhdGVkKCdmaWxlOi8vL3JlcG8vYS50cycpO1xuXG5cdFx0XHRjb25zdCBtZXJnZWQgPSBkZWR1cGVTZXNzaW9uRmlsZURpZmZzKFtbZ2l0RGlmZl0sIFtkYkRpZmZdXSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVyZ2VkLCBbZ2l0RGlmZl0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2VlcHMgZ2VudWluZWx5IGRpc3RpbmN0IGZpbGVzIGFuZCBwcmVzZXJ2ZXMgb3JkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBhID0gY3JlYXRlZCgnZmlsZTovLy9yZXBvL2EudHMnKTtcblx0XHRcdGNvbnN0IGIgPSBjcmVhdGVkKCdmaWxlOi8vL3JlcG8vYi50cycpO1xuXHRcdFx0Y29uc3QgYyA9IGRlbGV0ZWQoJ2ZpbGU6Ly8vcmVwby9jLnRzJyk7XG5cblx0XHRcdGNvbnN0IG1lcmdlZCA9IGRlZHVwZVNlc3Npb25GaWxlRGlmZnMoW1thLCBiXSwgW2NdXSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVyZ2VkLCBbYSwgYiwgY10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2V5cyByZW5hbWVzIG9uIHRoZWlyIGRlc3RpbmF0aW9uIGFuZCBkZWxldGlvbnMgb24gdGhlaXIgc291cmNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVuYW1lID0gcmVuYW1lZCgnZmlsZTovLy9yZXBvL29sZC50cycsICdmaWxlOi8vL3JlcG8vbmV3LnRzJyk7XG5cdFx0XHRjb25zdCBkYkVkaXRPZkRlc3RpbmF0aW9uID0gY3JlYXRlZCgnZmlsZTovLy9yZXBvL25ldy50cycpO1xuXHRcdFx0Y29uc3QgZGVsZXRpb24gPSBkZWxldGVkKCdmaWxlOi8vL3JlcG8vZ29uZS50cycpO1xuXG5cdFx0XHRjb25zdCBtZXJnZWQgPSBkZWR1cGVTZXNzaW9uRmlsZURpZmZzKFtbcmVuYW1lLCBkZWxldGlvbl0sIFtkYkVkaXRPZkRlc3RpbmF0aW9uXV0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lcmdlZCwgW3JlbmFtZSwgZGVsZXRpb25dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NhbWUtcmVwbyBjYXNlLXZhcmlhbnQgZmlsZTogVVJJcyBjb2xsYXBzZSBvbmx5IG9uIGNhc2UtaW5zZW5zaXRpdmUgcGxhdGZvcm1zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXBwZXIgPSBjcmVhdGVkKCdmaWxlOi8vL3JlcG8vRmlsZS50cycpO1xuXHRcdFx0Y29uc3QgbG93ZXIgPSBjcmVhdGVkKCdmaWxlOi8vL3JlcG8vZmlsZS50cycpO1xuXG5cdFx0XHRjb25zdCBtZXJnZWQgPSBkZWR1cGVTZXNzaW9uRmlsZURpZmZzKFtbdXBwZXIsIGxvd2VyXV0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWVyZ2VkLmxlbmd0aCwgaXNMaW51eCA/IDIgOiAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vbi1maWxlIHNjaGVtZSBVUklzIGtlZXAgZXhhY3QgaWRlbnRpdHkgKG5vIGNhc2UgZm9sZGluZyknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cHBlciA9IGNyZWF0ZWQoJ3ZzY29kZS1ub3RlYm9vay1jZWxsOi8vL25iLmlweW5iI0NoMCcpO1xuXHRcdFx0Y29uc3QgbG93ZXIgPSBjcmVhdGVkKCd2c2NvZGUtbm90ZWJvb2stY2VsbDovLy9uYi5pcHluYiNjaDAnKTtcblxuXHRcdFx0Y29uc3QgbWVyZ2VkID0gZGVkdXBlU2Vzc2lvbkZpbGVEaWZmcyhbW3VwcGVyLCBsb3dlcl1dKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXJnZWQsIFt1cHBlciwgbG93ZXJdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lnbm9yZXMgZGlmZnMgd2l0aG91dCBhbnkgVVJJJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW1wdHk6IElTZXNzaW9uRmlsZURpZmYgPSB7fTtcblx0XHRcdGNvbnN0IHJlYWwgPSBjcmVhdGVkKCdmaWxlOi8vL3JlcG8vYS50cycpO1xuXG5cdFx0XHRjb25zdCBtZXJnZWQgPSBkZWR1cGVTZXNzaW9uRmlsZURpZmZzKFtbZW1wdHksIHJlYWxdXSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVyZ2VkLCBbcmVhbF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZXZhbHVhdGVNdWx0aVJvb3REaWZmU291cmNlcycsICgpID0+IHtcblx0XHR0ZXN0KCdhbGwgc291cmNlcyBhdmFpbGFibGUgPT4gY29tcGxldGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBhID0gW2NyZWF0ZWQoJ2ZpbGU6Ly8vcmVwby9hLnRzJyldO1xuXHRcdFx0Y29uc3QgYjogcmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdID0gW107XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZhbHVhdGVNdWx0aVJvb3REaWZmU291cmNlcyhbYSwgYl0pLCB7XG5cdFx0XHRcdG91dGNvbWU6ICdjb21wbGV0ZScsXG5cdFx0XHRcdGF2YWlsYWJsZVNvdXJjZXM6IFthLCBiXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc29tZSBzb3VyY2VzIHVuYXZhaWxhYmxlID0+IHBhcnRpYWwsIGF2YWlsYWJsZXMgcHJlc2VydmVkIGluIG9yZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYSA9IFtjcmVhdGVkKCdmaWxlOi8vL3JlcG8vYS50cycpXTtcblx0XHRcdGNvbnN0IGMgPSBbY3JlYXRlZCgnZmlsZTovLy9yZXBvL2MudHMnKV07XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZhbHVhdGVNdWx0aVJvb3REaWZmU291cmNlcyhbYSwgdW5kZWZpbmVkLCBjXSksIHtcblx0XHRcdFx0b3V0Y29tZTogJ3BhcnRpYWwnLFxuXHRcdFx0XHRhdmFpbGFibGVTb3VyY2VzOiBbYSwgY10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vIHNvdXJjZSBhdmFpbGFibGUgPT4gZmFpbGVkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmFsdWF0ZU11bHRpUm9vdERpZmZTb3VyY2VzKFt1bmRlZmluZWQsIHVuZGVmaW5lZF0pLCB7XG5cdFx0XHRcdG91dGNvbWU6ICdmYWlsZWQnLFxuXHRcdFx0XHRhdmFpbGFibGVTb3VyY2VzOiBbXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnemVybyBzb3VyY2VzID0+IGZhaWxlZCAoZGVnZW5lcmF0ZSBuby10YXJnZXQgY2FzZSknLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2YWx1YXRlTXVsdGlSb290RGlmZlNvdXJjZXMoW10pLCB7XG5cdFx0XHRcdG91dGNvbWU6ICdmYWlsZWQnLFxuXHRcdFx0XHRhdmFpbGFibGVTb3VyY2VzOiBbXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtDQUErQztBQUV4RCxTQUFTLHdCQUF3QixvQ0FBb0M7QUFFckUsU0FBUyxRQUFRLEtBQStCO0FBQy9DLFNBQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxTQUFTLEVBQUUsSUFBSSxFQUFFLEVBQUU7QUFDM0M7QUFFQSxTQUFTLFFBQVEsS0FBK0I7QUFDL0MsU0FBTyxFQUFFLFFBQVEsRUFBRSxLQUFLLFNBQVMsRUFBRSxJQUFJLEVBQUUsRUFBRTtBQUM1QztBQUVBLFNBQVMsUUFBUSxTQUFpQixPQUFpQztBQUNsRSxTQUFPLEVBQUUsUUFBUSxFQUFFLEtBQUssU0FBUyxTQUFTLEVBQUUsS0FBSyxRQUFRLEVBQUUsR0FBRyxPQUFPLEVBQUUsS0FBSyxPQUFPLFNBQVMsRUFBRSxLQUFLLE1BQU0sRUFBRSxFQUFFO0FBQzlHO0FBRUEsTUFBTSwwQkFBMEIsTUFBTTtBQUNyQywwQ0FBd0M7QUFFeEMsUUFBTSwwQkFBMEIsTUFBTTtBQUNyQyxTQUFLLHNFQUFzRSxNQUFNO0FBQ2hGLFlBQU0sVUFBVSxRQUFRLG1CQUFtQjtBQUMzQyxZQUFNLFNBQVMsUUFBUSxtQkFBbUI7QUFFMUMsWUFBTSxTQUFTLHVCQUF1QixDQUFDLENBQUMsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7QUFFM0QsYUFBTyxnQkFBZ0IsUUFBUSxDQUFDLE9BQU8sQ0FBQztBQUFBLElBQ3pDLENBQUM7QUFFRCxTQUFLLHNEQUFzRCxNQUFNO0FBQ2hFLFlBQU0sSUFBSSxRQUFR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
