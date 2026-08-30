import assert from "assert";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { DiffEditorHeightCalculatorService } from "../../../browser/diff/editorHeightCalculator.js";
import { URI } from "../../../../../../base/common/uri.js";
import { createTextModel as createTextModelWithText } from "../../../../../../editor/test/common/testTextModel.js";
import { DefaultLinesDiffComputer } from "../../../../../../editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer.js";
import { getEditorPadding } from "../../../browser/diff/diffCellEditorOptions.js";
import { HeightOfHiddenLinesRegionInDiffEditor } from "../../../browser/diff/diffElementViewModel.js";
suite("NotebookDiff EditorHeightCalculator", () => {
  ["Hide Unchanged Regions", "Show Unchanged Regions"].forEach((suiteTitle) => {
    suite(suiteTitle, () => {
      const fontInfo = { lineHeight: 18, fontSize: 18 };
      let disposables;
      let textModelResolver;
      let editorWorkerService;
      const original = URI.parse("original");
      const modified = URI.parse("modified");
      let originalModel;
      let modifiedModel;
      const diffComputer = new DefaultLinesDiffComputer();
      let calculator;
      const hideUnchangedRegions = suiteTitle.startsWith("Hide");
      const configurationService = new TestConfigurationService({
        notebook: { diff: { ignoreMetadata: true } },
        diffEditor: {
          hideUnchangedRegions: {
            enabled: hideUnchangedRegions,
            minimumLineCount: 3,
            contextLineCount: 3
          }
        }
      });
      function createTextModel(lines) {
        return createTextModelWithText(lines.join("\n"));
      }
      teardown(() => disposables.dispose());
      ensureNoDisposablesAreLeakedInTestSuite();
      setup(() => {
        disposables = new DisposableStore();
        textModelResolver = new class extends mock() {
          async createModelReference(resource) {
            return {
              dispose: () => {
              },
              object: {
                textEditorModel: resource === original ? originalModel : modifiedModel,
                getLanguageId: () => "javascript"
              }
            };
          }
        }();
        editorWorkerService = new class extends mock() {
          async computeDiff(_original, _modified, options, _algorithm) {
            const originalLines = new Array(originalModel.getLineCount()).fill(0).map((_, i) => originalModel.getLineContent(i + 1));
            const modifiedLines = new Array(modifiedModel.getLineCount()).fill(0).map((_, i) => modifiedModel.getLineContent(i + 1));
            const result = diffComputer.computeDiff(originalLines, modifiedLines, options);
            const identical = originalLines.join("") === modifiedLines.join("");
            return {
              identical,
              quitEarly: result.hitTimeout,
              changes: result.changes,
              moves: result.moves
            };
          }
        }();
        calculator = new DiffEditorHeightCalculatorService(fontInfo.lineHeight, textModelResolver, editorWorkerService, configurationService);
      });
      test("1 original line with change in same line", async () => {
        originalModel = disposables.add(createTextModel(["Hello World"]));
        modifiedModel = disposables.add(createTextModel(["Foo Bar"]));
        const height = await calculator.diffAndComputeHeight(original, modified);
        const expectedHeight = getExpectedHeight(1, 0);
        assert.strictEqual(height, expectedHeight);
      });
      test("1 original line with insertion of a new line", async () => {
        originalModel = disposables.add(createTextModel(["Hello World"]));
        modifiedModel = disposables.add(createTextModel(["Hello World", "Foo Bar"]));
        const height = await calculator.diffAndComputeHeight(original, modified);
        const expectedHeight = getExpectedHeight(2, 0);
        assert.strictEqual(height, expectedHeight);
      });
      test("1 line with update to a line and insert of a new line", async () => {
        originalModel = disposables.add(createTextModel(["Hello World"]));
        modifiedModel = disposables.add(createTextModel(["Foo Bar", "Bar Baz"]));
        const height = await calculator.diffAndComputeHeight(original, modified);
        const expectedHeight = getExpectedHeight(2, 0);
        assert.strictEqual(height, expectedHeight);
      });
      test("10 line with update to a line and insert of a new line", async () => {
        originalModel = disposables.add(createTextModel(createLines(10)));
        modifiedModel = disposables.add(createTextModel(createLines(10).concat("Foo Bar")));
        const height = await calculator.diffAndComputeHeight(original, modified);
        const expectedHeight = getExpectedHeight(hideUnchangedRegions ? 4 : 11, hideUnchangedRegions ? 1 : 0);
        assert.strictEqual(height, expectedHeight);
      });
      test("50 lines with updates, deletions and inserts", async () => {
        originalModel = disposables.add(createTextModel(createLines(60)));
        const modifiedLines = createLines(60);
        modifiedLines[3] = "Foo Bar";
        modifiedLines.splice(7, 3);
        modifiedLines.splice(10, 0, "Foo Bar1", "Foo Bar2", "Foo Bar3");
        modifiedLines.splice(30, 0, "", "");
        modifiedLines.splice(40, 4);
        modifiedLines.splice(50, 0, "1", "2", "3", "4", "5");
        modifiedModel = disposables.add(createTextModel(modifiedLines));
        const height = await calculator.diffAndComputeHeight(original, modified);
        const expectedHeight = getExpectedHeight(hideUnchangedRegions ? 50 : 70, hideUnchangedRegions ? 3 : 0);
        assert.strictEqual(height, expectedHeight);
      });
      function getExpectedHeight(visibleLineCount, unchangeRegionsHeight) {
        return visibleLineCount * fontInfo.lineHeight + getEditorPadding(visibleLineCount).top + getEditorPadding(visibleLineCount).bottom + unchangeRegionsHeight * HeightOfHiddenLinesRegionInDiffEditor;
      }
      function createLines(count, linePrefix = "Hello World") {
        return new Array(count).fill(0).map((_, i) => `${linePrefix} ${i}`);
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxkaWZmXFxlZGl0b3JIZWlnaHRDYWxjdWxhdG9yLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JIZWlnaHRDYWxjdWxhdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZGlmZi9lZGl0b3JIZWlnaHRDYWxjdWxhdG9yLmpzJztcbmltcG9ydCB7IEZvbnRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZm9udEluZm8uanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgYXMgY3JlYXRlVGV4dE1vZGVsV2l0aFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0TGluZXNEaWZmQ29tcHV0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2RpZmYvZGVmYXVsdExpbmVzRGlmZkNvbXB1dGVyL2RlZmF1bHRMaW5lc0RpZmZDb21wdXRlci5qcyc7XG5pbXBvcnQgeyBEaWZmQWxnb3JpdGhtTmFtZSwgSUVkaXRvcldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2VkaXRvcldvcmtlci5qcyc7XG5pbXBvcnQgeyBJRG9jdW1lbnREaWZmUHJvdmlkZXJPcHRpb25zLCBJRG9jdW1lbnREaWZmIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9kaWZmL2RvY3VtZW50RGlmZlByb3ZpZGVyLmpzJztcbmltcG9ydCB7IGdldEVkaXRvclBhZGRpbmcgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2RpZmYvZGlmZkNlbGxFZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEhlaWdodE9mSGlkZGVuTGluZXNSZWdpb25JbkRpZmZFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2RpZmYvZGlmZkVsZW1lbnRWaWV3TW9kZWwuanMnO1xuXG5zdWl0ZSgnTm90ZWJvb2tEaWZmIEVkaXRvckhlaWdodENhbGN1bGF0b3InLCAoKSA9PiB7XG5cdFsnSGlkZSBVbmNoYW5nZWQgUmVnaW9ucycsICdTaG93IFVuY2hhbmdlZCBSZWdpb25zJ10uZm9yRWFjaChzdWl0ZVRpdGxlID0+IHtcblx0XHRzdWl0ZShzdWl0ZVRpdGxlLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmb250SW5mbzogRm9udEluZm8gPSB7IGxpbmVIZWlnaHQ6IDE4LCBmb250U2l6ZTogMTggfSBhcyBGb250SW5mbztcblx0XHRcdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRcdFx0bGV0IHRleHRNb2RlbFJlc29sdmVyOiBJVGV4dE1vZGVsU2VydmljZTtcblx0XHRcdGxldCBlZGl0b3JXb3JrZXJTZXJ2aWNlOiBJRWRpdG9yV29ya2VyU2VydmljZTtcblx0XHRcdGNvbnN0IG9yaWdpbmFsOiBVUkkgPSBVUkkucGFyc2UoJ29yaWdpbmFsJyk7XG5cdFx0XHRjb25zdCBtb2RpZmllZDogVVJJID0gVVJJLnBhcnNlKCdtb2RpZmllZCcpO1xuXHRcdFx0bGV0IG9yaWdpbmFsTW9kZWw6IElUZXh0TW9kZWw7XG5cdFx0XHRsZXQgbW9kaWZpZWRNb2RlbDogSVRleHRNb2RlbDtcblx0XHRcdGNvbnN0IGRpZmZDb21wdXRlciA9IG5ldyBEZWZhdWx0TGluZXNEaWZmQ29tcHV0ZXIoKTtcblx0XHRcdGxldCBjYWxjdWxhdG9yOiBEaWZmRWRpdG9ySGVpZ2h0Q2FsY3VsYXRvclNlcnZpY2U7XG5cdFx0XHRjb25zdCBoaWRlVW5jaGFuZ2VkUmVnaW9ucyA9IHN1aXRlVGl0bGUuc3RhcnRzV2l0aCgnSGlkZScpO1xuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0bm90ZWJvb2s6IHsgZGlmZjogeyBpZ25vcmVNZXRhZGF0YTogdHJ1ZSB9IH0sIGRpZmZFZGl0b3I6IHtcblx0XHRcdFx0XHRoaWRlVW5jaGFuZ2VkUmVnaW9uczoge1xuXHRcdFx0XHRcdFx0ZW5hYmxlZDogaGlkZVVuY2hhbmdlZFJlZ2lvbnMsIG1pbmltdW1MaW5lQ291bnQ6IDMsIGNvbnRleHRMaW5lQ291bnQ6IDNcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRmdW5jdGlvbiBjcmVhdGVUZXh0TW9kZWwobGluZXM6IHN0cmluZ1tdKTogSVRleHRNb2RlbCB7XG5cdFx0XHRcdHJldHVybiBjcmVhdGVUZXh0TW9kZWxXaXRoVGV4dChsaW5lcy5qb2luKCdcXG4nKSk7XG5cdFx0XHR9XG5cblx0XHRcdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cdFx0XHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRcdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0dGV4dE1vZGVsUmVzb2x2ZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElUZXh0TW9kZWxTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSBhc3luYyBjcmVhdGVNb2RlbFJlZmVyZW5jZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJUmVmZXJlbmNlPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4+IHtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdFx0XHRcdFx0b2JqZWN0OiB7XG5cdFx0XHRcdFx0XHRcdFx0dGV4dEVkaXRvck1vZGVsOiByZXNvdXJjZSA9PT0gb3JpZ2luYWwgPyBvcmlnaW5hbE1vZGVsIDogbW9kaWZpZWRNb2RlbCxcblx0XHRcdFx0XHRcdFx0XHRnZXRMYW5ndWFnZUlkOiAoKSA9PiAnamF2YXNjcmlwdCcsXG5cdFx0XHRcdFx0XHRcdH0gYXMgSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0ZWRpdG9yV29ya2VyU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvcldvcmtlclNlcnZpY2U+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGNvbXB1dGVEaWZmKF9vcmlnaW5hbDogVVJJLCBfbW9kaWZpZWQ6IFVSSSwgb3B0aW9uczogSURvY3VtZW50RGlmZlByb3ZpZGVyT3B0aW9ucywgX2FsZ29yaXRobTogRGlmZkFsZ29yaXRobU5hbWUpOiBQcm9taXNlPElEb2N1bWVudERpZmYgfCBudWxsPiB7XG5cdFx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbExpbmVzID0gbmV3IEFycmF5KG9yaWdpbmFsTW9kZWwuZ2V0TGluZUNvdW50KCkpLmZpbGwoMCkubWFwKChfLCBpKSA9PiBvcmlnaW5hbE1vZGVsLmdldExpbmVDb250ZW50KGkgKyAxKSk7XG5cdFx0XHRcdFx0XHRjb25zdCBtb2RpZmllZExpbmVzID0gbmV3IEFycmF5KG1vZGlmaWVkTW9kZWwuZ2V0TGluZUNvdW50KCkpLmZpbGwoMCkubWFwKChfLCBpKSA9PiBtb2RpZmllZE1vZGVsLmdldExpbmVDb250ZW50KGkgKyAxKSk7XG5cdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBkaWZmQ29tcHV0ZXIuY29tcHV0ZURpZmYob3JpZ2luYWxMaW5lcywgbW9kaWZpZWRMaW5lcywgb3B0aW9ucyk7XG5cdFx0XHRcdFx0XHRjb25zdCBpZGVudGljYWwgPSBvcmlnaW5hbExpbmVzLmpvaW4oJycpID09PSBtb2RpZmllZExpbmVzLmpvaW4oJycpO1xuXG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRpZGVudGljYWwsXG5cdFx0XHRcdFx0XHRcdHF1aXRFYXJseTogcmVzdWx0LmhpdFRpbWVvdXQsXG5cdFx0XHRcdFx0XHRcdGNoYW5nZXM6IHJlc3VsdC5jaGFuZ2VzLFxuXHRcdFx0XHRcdFx0XHRtb3ZlczogcmVzdWx0Lm1vdmVzLFxuXHRcdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0Y2FsY3VsYXRvciA9IG5ldyBEaWZmRWRpdG9ySGVpZ2h0Q2FsY3VsYXRvclNlcnZpY2UoZm9udEluZm8ubGluZUhlaWdodCwgdGV4dE1vZGVsUmVzb2x2ZXIsIGVkaXRvcldvcmtlclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCcxIG9yaWdpbmFsIGxpbmUgd2l0aCBjaGFuZ2UgaW4gc2FtZSBsaW5lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRvcmlnaW5hbE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChbJ0hlbGxvIFdvcmxkJ10pKTtcblx0XHRcdFx0bW9kaWZpZWRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoWydGb28gQmFyJ10pKTtcblxuXHRcdFx0XHRjb25zdCBoZWlnaHQgPSBhd2FpdCBjYWxjdWxhdG9yLmRpZmZBbmRDb21wdXRlSGVpZ2h0KG9yaWdpbmFsLCBtb2RpZmllZCk7XG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkSGVpZ2h0ID0gZ2V0RXhwZWN0ZWRIZWlnaHQoMSwgMCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlaWdodCwgZXhwZWN0ZWRIZWlnaHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJzEgb3JpZ2luYWwgbGluZSB3aXRoIGluc2VydGlvbiBvZiBhIG5ldyBsaW5lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRvcmlnaW5hbE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChbJ0hlbGxvIFdvcmxkJ10pKTtcblx0XHRcdFx0bW9kaWZpZWRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoWydIZWxsbyBXb3JsZCcsICdGb28gQmFyJ10pKTtcblxuXHRcdFx0XHRjb25zdCBoZWlnaHQgPSBhd2FpdCBjYWxjdWxhdG9yLmRpZmZBbmRDb21wdXRlSGVpZ2h0KG9yaWdpbmFsLCBtb2RpZmllZCk7XG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkSGVpZ2h0ID0gZ2V0RXhwZWN0ZWRIZWlnaHQoMiwgMCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlaWdodCwgZXhwZWN0ZWRIZWlnaHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJzEgbGluZSB3aXRoIHVwZGF0ZSB0byBhIGxpbmUgYW5kIGluc2VydCBvZiBhIG5ldyBsaW5lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRvcmlnaW5hbE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChbJ0hlbGxvIFdvcmxkJ10pKTtcblx0XHRcdFx0bW9kaWZpZWRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoWydGb28gQmFyJywgJ0JhciBCYXonXSkpO1xuXG5cdFx0XHRcdGNvbnN0IGhlaWdodCA9IGF3YWl0IGNhbGN1bGF0b3IuZGlmZkFuZENvbXB1dGVIZWlnaHQob3JpZ2luYWwsIG1vZGlmaWVkKTtcblx0XHRcdFx0Y29uc3QgZXhwZWN0ZWRIZWlnaHQgPSBnZXRFeHBlY3RlZEhlaWdodCgyLCAwKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVpZ2h0LCBleHBlY3RlZEhlaWdodCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnMTAgbGluZSB3aXRoIHVwZGF0ZSB0byBhIGxpbmUgYW5kIGluc2VydCBvZiBhIG5ldyBsaW5lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRvcmlnaW5hbE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChjcmVhdGVMaW5lcygxMCkpKTtcblx0XHRcdFx0bW9kaWZpZWRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoY3JlYXRlTGluZXMoMTApLmNvbmNhdCgnRm9vIEJhcicpKSk7XG5cblx0XHRcdFx0Y29uc3QgaGVpZ2h0ID0gYXdhaXQgY2FsY3VsYXRvci5kaWZmQW5kQ29tcHV0ZUhlaWdodChvcmlnaW5hbCwgbW9kaWZpZWQpO1xuXHRcdFx0XHRjb25zdCBleHBlY3RlZEhlaWdodCA9IGdldEV4cGVjdGVkSGVpZ2h0KGhpZGVVbmNoYW5nZWRSZWdpb25zID8gNCA6IDExLCBoaWRlVW5jaGFuZ2VkUmVnaW9ucyA/IDEgOiAwKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVpZ2h0LCBleHBlY3RlZEhlaWdodCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnNTAgbGluZXMgd2l0aCB1cGRhdGVzLCBkZWxldGlvbnMgYW5kIGluc2VydHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdG9yaWdpbmFsTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKGNyZWF0ZUxpbmVzKDYwKSkpO1xuXHRcdFx0XHRjb25zdCBtb2RpZmllZExpbmVzID0gY3JlYXRlTGluZXMoNjApO1xuXHRcdFx0XHRtb2RpZmllZExpbmVzWzNdID0gJ0ZvbyBCYXInO1xuXHRcdFx0XHRtb2RpZmllZExpbmVzLnNwbGljZSg3LCAzKTtcblx0XHRcdFx0bW9kaWZpZWRMaW5lcy5zcGxpY2UoMTAsIDAsICdGb28gQmFyMScsICdGb28gQmFyMicsICdGb28gQmFyMycpO1xuXHRcdFx0XHRtb2RpZmllZExpbmVzLnNwbGljZSgzMCwgMCwgJycsICcnKTtcblx0XHRcdFx0bW9kaWZpZWRMaW5lcy5zcGxpY2UoNDAsIDQpO1xuXHRcdFx0XHRtb2RpZmllZExpbmVzLnNwbGljZSg1MCwgMCwgJzEnLCAnMicsICczJywgJzQnLCAnNScpO1xuXG5cdFx0XHRcdG1vZGlmaWVkTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKG1vZGlmaWVkTGluZXMpKTtcblxuXHRcdFx0XHRjb25zdCBoZWlnaHQgPSBhd2FpdCBjYWxjdWxhdG9yLmRpZmZBbmRDb21wdXRlSGVpZ2h0KG9yaWdpbmFsLCBtb2RpZmllZCk7XG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkSGVpZ2h0ID0gZ2V0RXhwZWN0ZWRIZWlnaHQoaGlkZVVuY2hhbmdlZFJlZ2lvbnMgPyA1MCA6IDcwLCBoaWRlVW5jaGFuZ2VkUmVnaW9ucyA/IDMgOiAwKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVpZ2h0LCBleHBlY3RlZEhlaWdodCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0ZnVuY3Rpb24gZ2V0RXhwZWN0ZWRIZWlnaHQodmlzaWJsZUxpbmVDb3VudDogbnVtYmVyLCB1bmNoYW5nZVJlZ2lvbnNIZWlnaHQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0XHRcdHJldHVybiAodmlzaWJsZUxpbmVDb3VudCAqIGZvbnRJbmZvLmxpbmVIZWlnaHQpICsgZ2V0RWRpdG9yUGFkZGluZyh2aXNpYmxlTGluZUNvdW50KS50b3AgKyBnZXRFZGl0b3JQYWRkaW5nKHZpc2libGVMaW5lQ291bnQpLmJvdHRvbSArICh1bmNoYW5nZVJlZ2lvbnNIZWlnaHQgKiBIZWlnaHRPZkhpZGRlbkxpbmVzUmVnaW9uSW5EaWZmRWRpdG9yKTtcblx0XHRcdH1cblxuXHRcdFx0ZnVuY3Rpb24gY3JlYXRlTGluZXMoY291bnQ6IG51bWJlciwgbGluZVByZWZpeCA9ICdIZWxsbyBXb3JsZCcpOiBzdHJpbmdbXSB7XG5cdFx0XHRcdHJldHVybiBuZXcgQXJyYXkoY291bnQpLmZpbGwoMCkubWFwKChfLCBpKSA9PiBgJHtsaW5lUHJlZml4fSAke2l9YCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBbUM7QUFDNUMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUNBQXlDO0FBR2xELFNBQVMsV0FBVztBQUNwQixTQUFTLG1CQUFtQiwrQkFBK0I7QUFFM0QsU0FBUyxnQ0FBZ0M7QUFHekMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2Q0FBNkM7QUFFdEQsTUFBTSx1Q0FBdUMsTUFBTTtBQUNsRCxHQUFDLDBCQUEwQix3QkFBd0IsRUFBRSxRQUFRLGdCQUFjO0FBQzFFLFVBQU0sWUFBWSxNQUFNO0FBQ3ZCLFlBQU0sV0FBcUIsRUFBRSxZQUFZLElBQUksVUFBVSxHQUFHO0FBQzFELFVBQUk7QUFDSixVQUFJO0FBQ0osVUFBSTtBQUNKLFlBQU0sV0FBZ0IsSUFBSSxNQUFNLFVBQVU7QUFDMUMsWUFBTSxXQUFnQixJQUFJLE1BQU0sVUFBVTtBQUMxQyxVQUFJO0FBQ0osVUFBSTtBQUNKLFlBQU0sZUFBZSxJQUFJLHlCQUF5QjtBQUNsRCxVQUFJO0FBQ0osWUFBTSx1QkFBdUIsV0FBVyxXQUFXLE1BQU07QUFDekQsWUFBTSx1QkFBdUIsSUFBSSx5QkFBeUI7QUFBQSxRQUN6RCxVQUFVLEVBQUUsTUFBTSxFQUFFLGdCQUFnQixLQUFLLEVBQUU7QUFBQSxRQUFHLFlBQVk7QUFBQSxVQUN6RCxzQkFBc0I7QUFBQSxZQUNyQixTQUFTO0FBQUEsWUFBc0Isa0JBQWtCO0FBQUEsWUFBRyxrQkFBa0I7QUFBQSxVQUN2RTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxlQUFTLGdCQUFnQixPQUE2QjtBQUNyRCxlQUFPLHdCQUF3QixNQUFNLEtBQUssSUFBSSxDQUFDO0FBQUEsTUFDaEQ7QUFFQSxlQUFT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
