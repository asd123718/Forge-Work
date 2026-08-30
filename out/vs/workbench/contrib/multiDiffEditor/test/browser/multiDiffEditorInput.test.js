import assert from "assert";
import { DeferredPromise } from "../../../../../base/common/async.js";
import { CancellationError } from "../../../../../base/common/errors.js";
import { Event, ValueWithChangeEvent } from "../../../../../base/common/event.js";
import { observableValue, ValueWithChangeEventFromObservable } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { MultiDiffEditorInput } from "../../browser/multiDiffEditorInput.js";
import { MultiDiffEditorItem } from "../../browser/multiDiffSourceResolverService.js";
suite("MultiDiffEditorInput", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("updates its name from the resolved source label", async () => {
    const sourceLabel = observableValue("sourceLabel", "Current Turn Changes");
    const sourceResolverService = new class extends mock() {
      resolve() {
        return Promise.resolve({
          resources: ValueWithChangeEvent.const([]),
          label: new ValueWithChangeEventFromObservable(sourceLabel)
        });
      }
    }();
    const textFileService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.files = new class extends mock() {
          constructor() {
            super(...arguments);
            this.onDidChangeDirty = Event.None;
          }
        }();
      }
    }();
    const input = disposables.add(new MultiDiffEditorInput(
      URI.parse("multi-diff-editor:test"),
      "Fallback",
      void 0,
      false,
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      sourceResolverService,
      textFileService
    ));
    await input.getViewModel();
    const names = [input.getName()];
    disposables.add(input.onDidChangeLabel(() => names.push(input.getName())));
    sourceLabel.set("Last Turn Changes", void 0);
    assert.deepStrictEqual(names, [
      "Current Turn Changes (0 files)",
      "Last Turn Changes (0 files)"
    ]);
  });
  test("disposes models that finish resolving after input disposal", async () => {
    const referenceRequested = new DeferredPromise();
    const referenceResult = new DeferredPromise();
    let referenceDisposed = false;
    const textModelService = new class extends mock() {
      createModelReference() {
        void referenceRequested.complete();
        return referenceResult.p;
      }
    }();
    const textFileService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.files = new class extends mock() {
          constructor() {
            super(...arguments);
            this.onDidChangeDirty = Event.None;
          }
        }();
      }
    }();
    const input = disposables.add(new MultiDiffEditorInput(
      URI.parse("multi-diff-editor:test"),
      "Test",
      [new MultiDiffEditorItem(void 0, URI.parse("file:///modified.ts"), void 0)],
      false,
      textModelService,
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      textFileService
    ));
    const viewModelPromise = input.getViewModel();
    await referenceRequested.p;
    input.dispose();
    await referenceResult.complete({
      object: new class extends mock() {
      }(),
      dispose: () => referenceDisposed = true
    });
    await assert.rejects(viewModelPromise, CancellationError);
    assert.strictEqual(referenceDisposed, true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG11bHRpRGlmZkVkaXRvclxcdGVzdFxcYnJvd3NlclxcbXVsdGlEaWZmRWRpdG9ySW5wdXQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50LCBWYWx1ZVdpdGhDaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlLCBWYWx1ZVdpdGhDaGFuZ2VFdmVudEZyb21PYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbCwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXIsIElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IE11bHRpRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tdWx0aURpZmZFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJTXVsdGlEaWZmU291cmNlUmVzb2x2ZXJTZXJ2aWNlLCBNdWx0aURpZmZFZGl0b3JJdGVtIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tdWx0aURpZmZTb3VyY2VSZXNvbHZlclNlcnZpY2UuanMnO1xuXG5zdWl0ZSgnTXVsdGlEaWZmRWRpdG9ySW5wdXQnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCd1cGRhdGVzIGl0cyBuYW1lIGZyb20gdGhlIHJlc29sdmVkIHNvdXJjZSBsYWJlbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzb3VyY2VMYWJlbCA9IG9ic2VydmFibGVWYWx1ZSgnc291cmNlTGFiZWwnLCAnQ3VycmVudCBUdXJuIENoYW5nZXMnKTtcblx0XHRjb25zdCBzb3VyY2VSZXNvbHZlclNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNdWx0aURpZmZTb3VyY2VSZXNvbHZlclNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVzb2x2ZSgpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRcdFx0cmVzb3VyY2VzOiBWYWx1ZVdpdGhDaGFuZ2VFdmVudC5jb25zdChbXSksXG5cdFx0XHRcdFx0bGFiZWw6IG5ldyBWYWx1ZVdpdGhDaGFuZ2VFdmVudEZyb21PYnNlcnZhYmxlKHNvdXJjZUxhYmVsKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSgpO1xuXHRcdGNvbnN0IHRleHRGaWxlU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHRGaWxlU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBmaWxlcyA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VEaXJ0eSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHR9KCk7XG5cdFx0fSgpO1xuXHRcdGNvbnN0IGlucHV0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNdWx0aURpZmZFZGl0b3JJbnB1dChcblx0XHRcdFVSSS5wYXJzZSgnbXVsdGktZGlmZi1lZGl0b3I6dGVzdCcpLFxuXHRcdFx0J0ZhbGxiYWNrJyxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGZhbHNlLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVGV4dE1vZGVsU2VydmljZT4oKSB7IH0oKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlPigpIHsgfSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJSW5zdGFudGlhdGlvblNlcnZpY2U+KCkgeyB9KCksXG5cdFx0XHRzb3VyY2VSZXNvbHZlclNlcnZpY2UsXG5cdFx0XHR0ZXh0RmlsZVNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0YXdhaXQgaW5wdXQuZ2V0Vmlld01vZGVsKCk7XG5cblx0XHRjb25zdCBuYW1lcyA9IFtpbnB1dC5nZXROYW1lKCldO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChpbnB1dC5vbkRpZENoYW5nZUxhYmVsKCgpID0+IG5hbWVzLnB1c2goaW5wdXQuZ2V0TmFtZSgpKSkpO1xuXHRcdHNvdXJjZUxhYmVsLnNldCgnTGFzdCBUdXJuIENoYW5nZXMnLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuYW1lcywgW1xuXHRcdFx0J0N1cnJlbnQgVHVybiBDaGFuZ2VzICgwIGZpbGVzKScsXG5cdFx0XHQnTGFzdCBUdXJuIENoYW5nZXMgKDAgZmlsZXMpJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZXMgbW9kZWxzIHRoYXQgZmluaXNoIHJlc29sdmluZyBhZnRlciBpbnB1dCBkaXNwb3NhbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWZlcmVuY2VSZXF1ZXN0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgcmVmZXJlbmNlUmVzdWx0ID0gbmV3IERlZmVycmVkUHJvbWlzZTxJUmVmZXJlbmNlPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4+KCk7XG5cdFx0bGV0IHJlZmVyZW5jZURpc3Bvc2VkID0gZmFsc2U7XG5cdFx0Y29uc3QgdGV4dE1vZGVsU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHRNb2RlbFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgY3JlYXRlTW9kZWxSZWZlcmVuY2UoKSB7XG5cdFx0XHRcdHZvaWQgcmVmZXJlbmNlUmVxdWVzdGVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdHJldHVybiByZWZlcmVuY2VSZXN1bHQucDtcblx0XHRcdH1cblx0XHR9KCk7XG5cdFx0Y29uc3QgdGV4dEZpbGVTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVGV4dEZpbGVTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGZpbGVzID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXI+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZURpcnR5ID0gRXZlbnQuTm9uZTtcblx0XHRcdH0oKTtcblx0XHR9KCk7XG5cdFx0Y29uc3QgaW5wdXQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE11bHRpRGlmZkVkaXRvcklucHV0KFxuXHRcdFx0VVJJLnBhcnNlKCdtdWx0aS1kaWZmLWVkaXRvcjp0ZXN0JyksXG5cdFx0XHQnVGVzdCcsXG5cdFx0XHRbbmV3IE11bHRpRGlmZkVkaXRvckl0ZW0odW5kZWZpbmVkLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vbW9kaWZpZWQudHMnKSwgdW5kZWZpbmVkKV0sXG5cdFx0XHRmYWxzZSxcblx0XHRcdHRleHRNb2RlbFNlcnZpY2UsXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZT4oKSB7IH0oKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUluc3RhbnRpYXRpb25TZXJ2aWNlPigpIHsgfSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTXVsdGlEaWZmU291cmNlUmVzb2x2ZXJTZXJ2aWNlPigpIHsgfSgpLFxuXHRcdFx0dGV4dEZpbGVTZXJ2aWNlLFxuXHRcdCkpO1xuXG5cdFx0Y29uc3Qgdmlld01vZGVsUHJvbWlzZSA9IGlucHV0LmdldFZpZXdNb2RlbCgpO1xuXHRcdGF3YWl0IHJlZmVyZW5jZVJlcXVlc3RlZC5wO1xuXHRcdGlucHV0LmRpc3Bvc2UoKTtcblx0XHRhd2FpdCByZWZlcmVuY2VSZXN1bHQuY29tcGxldGUoe1xuXHRcdFx0b2JqZWN0OiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4oKSB7IH0oKSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHJlZmVyZW5jZURpc3Bvc2VkID0gdHJ1ZSxcblx0XHR9KTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHZpZXdNb2RlbFByb21pc2UsIENhbmNlbGxhdGlvbkVycm9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVmZXJlbmNlRGlzcG9zZWQsIHRydWUpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsT0FBTyw0QkFBNEI7QUFFNUMsU0FBUyxpQkFBaUIsMENBQTBDO0FBQ3BFLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFLeEQsU0FBUyw0QkFBNEI7QUFDckMsU0FBMEMsMkJBQTJCO0FBRXJFLE1BQU0sd0JBQXdCLE1BQU07QUFFbkMsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxPQUFLLG1EQUFtRCxZQUFZO0FBQ25FLFVBQU0sY0FBYyxnQkFBZ0IsZUFBZSxzQkFBc0I7QUFDekUsVUFBTSx3QkFBd0IsSUFBSSxjQUFjLEtBQXNDLEVBQUU7QUFBQSxNQUM5RSxVQUFVO0FBQ2xCLGVBQU8sUUFBUSxRQUFRO0FBQUEsVUFDdEIsV0FBVyxxQkFBcUIsTUFBTSxDQUFDLENBQUM7QUFBQSxVQUN4QyxPQUFPLElBQUksbUNBQW1DLFdBQVc7QUFBQSxRQUMxRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsRUFBRTtBQUNGLFVBQU0sa0JBQWtCLElBQUksY0FBYyxLQUF1QixFQUFFO0FBQUEsTUFBdkM7QUFBQTtBQUMzQixhQUFrQixRQUFRLElBQUksY0FBYyxLQUFrQyxFQUFFO0FBQUEsVUFBbEQ7QUFBQTtBQUM3QixpQkFBa0IsbUJBQW1CLE1BQU07QUFBQTtBQUFBLFFBQzVDLEVBQUU7QUFBQTtBQUFBLElBQ0gsRUFBRTtBQUNGLFVBQU0sUUFBUSxZQUFZLElBQUksSUFBSTtBQUFBLE1BQ2pDLElBQUksTUFBTSx3QkFBd0I7QUFBQSxNQUNsQztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxJQUFJLGNBQWMsS0FBd0IsRUFBRTtBQUFBLE1BQUUsRUFBRTtBQUFBLE1BQ2hELElBQUksY0FBYyxLQUF3QyxFQUFFO0FBQUEsTUFBRSxFQUFFO0FBQUEsTUFDaEUsSUFBSSxjQUFjLEtBQTRCLEVBQUU7QUFBQSxNQUFFLEVBQUU7QUFBQSxNQUNwRDtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLE1BQU0sYUFBYTtBQUV6QixVQUFNLFFBQVEsQ0FBQyxNQUFNLFFBQVEsQ0FBQztBQUM5QixnQkFBWSxJQUFJLE1BQU0saUJBQWlCLE1BQU0sTUFBTSxLQUFLLE1BQU0sUUFBUSxDQUFDLENBQUMsQ0FBQztBQUN6RSxnQkFBWSxJQUFJLHFCQUFxQixNQUFTO0FBRTlDLFdBQU8sZ0JBQWdCLE9BQU87QUFBQSxNQUM3QjtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDhEQUE4RCxZQUFZO0FBQzlFLFVBQU0scUJBQXFCLElBQUksZ0JBQXNCO0FBQ3JELFVBQU0sa0JBQWtCLElBQUksZ0JBQXNEO0FBQ2xGLFFBQUksb0JBQW9CO0FBQ3hCLFVBQU0sbUJBQW1CLElBQUksY0FBYyxLQUF3QixFQUFFO0FBQUEsTUFDM0QsdUJBQXVCO0FBQy9CLGFBQUssbUJBQW1CLFNBQVM7QUFDakMsZUFBTyxnQkFBZ0I7QUFBQSxNQUN4QjtBQUFBLElBQ0QsRUFBRTtBQUNGLFVBQU0sa0JBQWtCLElBQUksY0FBYyxLQUF1QixFQUFFO0FBQUEsTUFBdkM7QUFBQTtBQUMzQixhQUFrQixRQUFRLElBQUksY0FBYyxLQUFrQyxFQUFFO0FBQUEsVUFBbEQ7QUFBQTtBQUM3QixpQkFBa0IsbUJBQW1CLE1BQU07QUFBQTtBQUFBLFFBQzVDLEVBQUU7QUFBQTtBQUFBLElBQ0gsRUFBRTtBQUNGLFVBQU0sUUFBUSxZQUFZLElBQUksSUFBSTtBQUFBLE1BQ2pDLElBQUksTUFBTSx3QkFBd0I7QUFBQSxNQUNsQztBQUFBLE1BQ0EsQ0FBQyxJQUFJLG9CQUFvQixRQUFXLElBQUksTUFBTSxxQkFBcUIsR0FBRyxNQUFTLENBQUM7QUFBQSxNQUNoRjtBQUFBLE1BQ0E7QUFBQSxNQUNBLElBQUksY0FBYyxLQUF3QyxFQUFFO0FBQUEsTUFBRSxFQUFFO0FBQUEsTUFDaEUsSUFBSSxjQUFjLEtBQTRCLEVBQUU7QUFBQSxNQUFFLEVBQUU7QUFBQSxNQUNwRCxJQUFJLGNBQWMsS0FBc0MsRUFBRTtBQUFBLE1BQUUsRUFBRTtBQUFBLE1BQzlEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxtQkFBbUIsTUFBTSxhQUFhO0FBQzVDLFVBQU0sbUJBQW1CO0FBQ3pCLFVBQU0sUUFBUTtBQUNkLFVBQU0sZ0JBQWdCLFNBQVM7QUFBQSxNQUM5QixRQUFRLElBQUksY0FBYyxLQUErQixFQUFFO0FBQUEsTUFBRSxFQUFFO0FBQUEsTUFDL0QsU0FBUyxNQUFNLG9CQUFvQjtBQUFBLElBQ3BDLENBQUM7QUFFRCxVQUFNLE9BQU8sUUFBUSxrQkFBa0IsaUJBQWlCO0FBQ3hELFdBQU8sWUFBWSxtQkFBbUIsSUFBSTtBQUFBLEVBQzNDLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
