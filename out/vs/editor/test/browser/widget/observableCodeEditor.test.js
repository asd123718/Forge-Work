import * as assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { derivedHandleChanges } from "../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { observableCodeEditor } from "../../../browser/observableCodeEditor.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { withTestCodeEditor } from "../testCodeEditor.js";
suite("CodeEditorWidget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function withTestFixture(cb) {
    withEditorSetupTestFixture(void 0, cb);
  }
  function withEditorSetupTestFixture(preSetupCallback, cb) {
    withTestCodeEditor("hello world", {}, (editor, viewModel) => {
      const disposables = new DisposableStore();
      preSetupCallback?.(editor, disposables);
      const obsEditor = observableCodeEditor(editor);
      const log = new Log();
      const derived = derivedHandleChanges(
        {
          changeTracker: {
            createChangeSummary: () => void 0,
            handleChange: (context) => {
              const obsName = observableName(context.changedObservable, obsEditor);
              log.log(`handle change: ${obsName} ${formatChange(context.change)}`);
              return true;
            }
          }
        },
        (reader) => {
          const versionId = obsEditor.versionId.read(reader);
          const selection = obsEditor.selections.read(reader)?.map((s) => s.toString()).join(", ");
          obsEditor.onDidType.read(reader);
          const str = `running derived: selection: ${selection}, value: ${versionId}`;
          log.log(str);
          return str;
        }
      );
      derived.recomputeInitiallyAndOnChange(disposables);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "running derived: selection: [1,1 -> 1,1], value: 1"
      ]);
      cb({ editor, viewModel, log, derived });
      disposables.dispose();
    });
  }
  test("setPosition", () => withTestFixture(({ editor, log }) => {
    editor.setPosition(new Position(1, 2));
    assert.deepStrictEqual(log.getAndClearEntries(), [
      'handle change: editor.selections {"selection":"[1,2 -> 1,2]","modelVersionId":1,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"api","reason":0}',
      "running derived: selection: [1,2 -> 1,2], value: 1"
    ]);
  }));
  test("keyboard.type", () => withTestFixture(({ editor, log }) => {
    editor.trigger("keyboard", "type", { text: "abc" });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      'handle change: editor.onDidType "abc"',
      'handle change: editor.versionId {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
      'handle change: editor.versionId {"changes":[{"range":"[1,2 -> 1,2]","rangeLength":0,"text":"b","rangeOffset":1}],"eol":"\\n","versionId":3,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
      'handle change: editor.versionId {"changes":[{"range":"[1,3 -> 1,3]","rangeLength":0,"text":"c","rangeOffset":2}],"eol":"\\n","versionId":4,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
      'handle change: editor.selections {"selection":"[1,4 -> 1,4]","modelVersionId":4,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
      "running derived: selection: [1,4 -> 1,4], value: 4"
    ]);
  }));
  test("keyboard.type and set position", () => withTestFixture(({ editor, log }) => {
    editor.trigger("keyboard", "type", { text: "abc" });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      'handle change: editor.onDidType "abc"',
      'handle change: editor.versionId {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
      'handle change: editor.versionId {"changes":[{"range":"[1,2 -> 1,2]","rangeLength":0,"text":"b","rangeOffset":1}],"eol":"\\n","versionId":3,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
      'handle change: editor.versionId {"changes":[{"range":"[1,3 -> 1,3]","rangeLength":0,"text":"c","rangeOffset":2}],"eol":"\\n","versionId":4,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
      'handle change: editor.selections {"selection":"[1,4 -> 1,4]","modelVersionId":4,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
      "running derived: selection: [1,4 -> 1,4], value: 4"
    ]);
    editor.setPosition(new Position(1, 5), "test");
    assert.deepStrictEqual(log.getAndClearEntries(), [
      'handle change: editor.selections {"selection":"[1,5 -> 1,5]","modelVersionId":4,"oldSelections":["[1,4 -> 1,4]"],"oldModelVersionId":4,"source":"test","reason":0}',
      "running derived: selection: [1,5 -> 1,5], value: 4"
    ]);
  }));
  test("listener interaction (unforced)", () => {
    let derived;
    let log;
    withEditorSetupTestFixture(
      (editor, disposables) => {
        disposables.add(
          editor.onDidChangeModelContent(() => {
            log.log(">>> before get");
            derived.get();
            log.log("<<< after get");
          })
        );
      },
      (args) => {
        const editor = args.editor;
        derived = args.derived;
        log = args.log;
        editor.trigger("keyboard", "type", { text: "a" });
        assert.deepStrictEqual(log.getAndClearEntries(), [
          ">>> before get",
          "<<< after get",
          'handle change: editor.onDidType "a"',
          'handle change: editor.versionId {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
          'handle change: editor.selections {"selection":"[1,2 -> 1,2]","modelVersionId":2,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
          "running derived: selection: [1,2 -> 1,2], value: 2"
        ]);
      }
    );
  });
  test("listener interaction ()", () => {
    let derived;
    let log;
    withEditorSetupTestFixture(
      (editor, disposables) => {
        disposables.add(
          editor.onDidChangeModelContent(() => {
            log.log(">>> before forceUpdate");
            observableCodeEditor(editor).forceUpdate();
            log.log(">>> before get");
            derived.get();
            log.log("<<< after get");
          })
        );
      },
      (args) => {
        const editor = args.editor;
        derived = args.derived;
        log = args.log;
        editor.trigger("keyboard", "type", { text: "a" });
        assert.deepStrictEqual(log.getAndClearEntries(), [
          ">>> before forceUpdate",
          ">>> before get",
          "handle change: editor.versionId undefined",
          "running derived: selection: [1,2 -> 1,2], value: 2",
          "<<< after get",
          'handle change: editor.onDidType "a"',
          'handle change: editor.versionId {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
          'handle change: editor.selections {"selection":"[1,2 -> 1,2]","modelVersionId":2,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
          "running derived: selection: [1,2 -> 1,2], value: 2"
        ]);
      }
    );
  });
});
class Log {
  constructor() {
    this.entries = [];
  }
  log(message) {
    this.entries.push(message);
  }
  getAndClearEntries() {
    const entries = [...this.entries];
    this.entries.length = 0;
    return entries;
  }
}
function formatChange(change) {
  return JSON.stringify(
    change,
    (key, value) => {
      if (value instanceof Range) {
        return value.toString();
      }
      if (value === false || Array.isArray(value) && value.length === 0) {
        return void 0;
      }
      return value;
    }
  );
}
function observableName(obs, obsEditor) {
  switch (obs) {
    case obsEditor.selections:
      return "editor.selections";
    case obsEditor.versionId:
      return "editor.versionId";
    case obsEditor.onDidType:
      return "editor.onDidType";
    default:
      return "unknown";
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcb2JzZXJ2YWJsZUNvZGVFZGl0b3IudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBkZXJpdmVkSGFuZGxlQ2hhbmdlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBPYnNlcnZhYmxlQ29kZUVkaXRvciwgb2JzZXJ2YWJsZUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL29ic2VydmFibGVDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdNb2RlbEltcGwuanMnO1xuaW1wb3J0IHsgd2l0aFRlc3RDb2RlRWRpdG9yIH0gZnJvbSAnLi4vdGVzdENvZGVFZGl0b3IuanMnO1xuXG5zdWl0ZSgnQ29kZUVkaXRvcldpZGdldCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gd2l0aFRlc3RGaXh0dXJlKFxuXHRcdGNiOiAoYXJnczogeyBlZGl0b3I6IElDb2RlRWRpdG9yOyB2aWV3TW9kZWw6IFZpZXdNb2RlbDsgbG9nOiBMb2c7IGRlcml2ZWQ6IElPYnNlcnZhYmxlPHN0cmluZz4gfSkgPT4gdm9pZFxuXHQpIHtcblx0XHR3aXRoRWRpdG9yU2V0dXBUZXN0Rml4dHVyZSh1bmRlZmluZWQsIGNiKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHdpdGhFZGl0b3JTZXR1cFRlc3RGaXh0dXJlKFxuXHRcdHByZVNldHVwQ2FsbGJhY2s6XG5cdFx0XHR8ICgoZWRpdG9yOiBJQ29kZUVkaXRvciwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSkgPT4gdm9pZClcblx0XHRcdHwgdW5kZWZpbmVkLFxuXHRcdGNiOiAoYXJnczogeyBlZGl0b3I6IElDb2RlRWRpdG9yOyB2aWV3TW9kZWw6IFZpZXdNb2RlbDsgbG9nOiBMb2c7IGRlcml2ZWQ6IElPYnNlcnZhYmxlPHN0cmluZz4gfSkgPT4gdm9pZFxuXHQpIHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoJ2hlbGxvIHdvcmxkJywge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRwcmVTZXR1cENhbGxiYWNrPy4oZWRpdG9yLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRjb25zdCBvYnNFZGl0b3IgPSBvYnNlcnZhYmxlQ29kZUVkaXRvcihlZGl0b3IpO1xuXHRcdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXG5cdFx0XHRjb25zdCBkZXJpdmVkID0gZGVyaXZlZEhhbmRsZUNoYW5nZXMoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjaGFuZ2VUcmFja2VyOiB7XG5cdFx0XHRcdFx0XHRjcmVhdGVDaGFuZ2VTdW1tYXJ5OiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRoYW5kbGVDaGFuZ2U6IChjb250ZXh0KSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9ic05hbWUgPSBvYnNlcnZhYmxlTmFtZShjb250ZXh0LmNoYW5nZWRPYnNlcnZhYmxlLCBvYnNFZGl0b3IpO1xuXG5cdFx0XHRcdFx0XHRcdGxvZy5sb2coYGhhbmRsZSBjaGFuZ2U6ICR7b2JzTmFtZX0gJHtmb3JtYXRDaGFuZ2UoY29udGV4dC5jaGFuZ2UpfWApO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0KHJlYWRlcikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHZlcnNpb25JZCA9IG9ic0VkaXRvci52ZXJzaW9uSWQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IG9ic0VkaXRvci5zZWxlY3Rpb25zLnJlYWQocmVhZGVyKT8ubWFwKChzKSA9PiBzLnRvU3RyaW5nKCkpLmpvaW4oJywgJyk7XG5cdFx0XHRcdFx0b2JzRWRpdG9yLm9uRGlkVHlwZS5yZWFkKHJlYWRlcik7XG5cblx0XHRcdFx0XHRjb25zdCBzdHIgPSBgcnVubmluZyBkZXJpdmVkOiBzZWxlY3Rpb246ICR7c2VsZWN0aW9ufSwgdmFsdWU6ICR7dmVyc2lvbklkfWA7XG5cdFx0XHRcdFx0bG9nLmxvZyhzdHIpO1xuXHRcdFx0XHRcdHJldHVybiBzdHI7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdGRlcml2ZWQucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UoZGlzcG9zYWJsZXMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J3J1bm5pbmcgZGVyaXZlZDogc2VsZWN0aW9uOiBbMSwxIC0+IDEsMV0sIHZhbHVlOiAxJyxcblx0XHRcdF0pO1xuXG5cdFx0XHRjYih7IGVkaXRvciwgdmlld01vZGVsLCBsb2csIGRlcml2ZWQgfSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdHRlc3QoJ3NldFBvc2l0aW9uJywgKCkgPT5cblx0XHR3aXRoVGVzdEZpeHR1cmUoKHsgZWRpdG9yLCBsb2cgfSkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAyKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoW1xuXHRcdFx0XHQnaGFuZGxlIGNoYW5nZTogZWRpdG9yLnNlbGVjdGlvbnMge1wic2VsZWN0aW9uXCI6XCJbMSwyIC0+IDEsMl1cIixcIm1vZGVsVmVyc2lvbklkXCI6MSxcIm9sZFNlbGVjdGlvbnNcIjpbXCJbMSwxIC0+IDEsMV1cIl0sXCJvbGRNb2RlbFZlcnNpb25JZFwiOjEsXCJzb3VyY2VcIjpcImFwaVwiLFwicmVhc29uXCI6MH0nLFxuXHRcdFx0XHQncnVubmluZyBkZXJpdmVkOiBzZWxlY3Rpb246IFsxLDIgLT4gMSwyXSwgdmFsdWU6IDEnXG5cdFx0XHRdKSk7XG5cdFx0fSkpO1xuXG5cdHRlc3QoJ2tleWJvYXJkLnR5cGUnLCAoKSA9PlxuXHRcdHdpdGhUZXN0Rml4dHVyZSgoeyBlZGl0b3IsIGxvZyB9KSA9PiB7XG5cdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCAndHlwZScsIHsgdGV4dDogJ2FiYycgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoW1xuXHRcdFx0XHQnaGFuZGxlIGNoYW5nZTogZWRpdG9yLm9uRGlkVHlwZSBcImFiY1wiJyxcblx0XHRcdFx0J2hhbmRsZSBjaGFuZ2U6IGVkaXRvci52ZXJzaW9uSWQge1wiY2hhbmdlc1wiOlt7XCJyYW5nZVwiOlwiWzEsMSAtPiAxLDFdXCIsXCJyYW5nZUxlbmd0aFwiOjAsXCJ0ZXh0XCI6XCJhXCIsXCJyYW5nZU9mZnNldFwiOjB9XSxcImVvbFwiOlwiXFxcXG5cIixcInZlcnNpb25JZFwiOjIsXCJkZXRhaWxlZFJlYXNvbnNcIjpbe1wibWV0YWRhdGFcIjp7XCJzb3VyY2VcIjpcImN1cnNvclwiLFwia2luZFwiOlwidHlwZVwiLFwiZGV0YWlsZWRTb3VyY2VcIjpcImtleWJvYXJkXCJ9fV0sXCJkZXRhaWxlZFJlYXNvbnNDaGFuZ2VMZW5ndGhzXCI6WzFdfScsXG5cdFx0XHRcdCdoYW5kbGUgY2hhbmdlOiBlZGl0b3IudmVyc2lvbklkIHtcImNoYW5nZXNcIjpbe1wicmFuZ2VcIjpcIlsxLDIgLT4gMSwyXVwiLFwicmFuZ2VMZW5ndGhcIjowLFwidGV4dFwiOlwiYlwiLFwicmFuZ2VPZmZzZXRcIjoxfV0sXCJlb2xcIjpcIlxcXFxuXCIsXCJ2ZXJzaW9uSWRcIjozLFwiZGV0YWlsZWRSZWFzb25zXCI6W3tcIm1ldGFkYXRhXCI6e1wic291cmNlXCI6XCJjdXJzb3JcIixcImtpbmRcIjpcInR5cGVcIixcImRldGFpbGVkU291cmNlXCI6XCJrZXlib2FyZFwifX1dLFwiZGV0YWlsZWRSZWFzb25zQ2hhbmdlTGVuZ3Roc1wiOlsxXX0nLFxuXHRcdFx0XHQnaGFuZGxlIGNoYW5nZTogZWRpdG9yLnZlcnNpb25JZCB7XCJjaGFuZ2VzXCI6W3tcInJhbmdlXCI6XCJbMSwzIC0+IDEsM11cIixcInJhbmdlTGVuZ3RoXCI6MCxcInRleHRcIjpcImNcIixcInJhbmdlT2Zmc2V0XCI6Mn1dLFwiZW9sXCI6XCJcXFxcblwiLFwidmVyc2lvbklkXCI6NCxcImRldGFpbGVkUmVhc29uc1wiOlt7XCJtZXRhZGF0YVwiOntcInNvdXJjZVwiOlwiY3Vyc29yXCIsXCJraW5kXCI6XCJ0eXBlXCIsXCJkZXRhaWxlZFNvdXJjZVwiOlwia2V5Ym9hcmRcIn19XSxcImRldGFpbGVkUmVhc29uc0NoYW5nZUxlbmd0aHNcIjpbMV19Jyxcblx0XHRcdFx0J2hhbmRsZSBjaGFuZ2U6IGVkaXRvci5zZWxlY3Rpb25zIHtcInNlbGVjdGlvblwiOlwiWzEsNCAtPiAxLDRdXCIsXCJtb2RlbFZlcnNpb25JZFwiOjQsXCJvbGRTZWxlY3Rpb25zXCI6W1wiWzEsMSAtPiAxLDFdXCJdLFwib2xkTW9kZWxWZXJzaW9uSWRcIjoxLFwic291cmNlXCI6XCJrZXlib2FyZFwiLFwicmVhc29uXCI6MH0nLFxuXHRcdFx0XHQncnVubmluZyBkZXJpdmVkOiBzZWxlY3Rpb246IFsxLDQgLT4gMSw0XSwgdmFsdWU6IDQnXG5cdFx0XHRdKSk7XG5cdFx0fSkpO1xuXG5cdHRlc3QoJ2tleWJvYXJkLnR5cGUgYW5kIHNldCBwb3NpdGlvbicsICgpID0+XG5cdFx0d2l0aFRlc3RGaXh0dXJlKCh7IGVkaXRvciwgbG9nIH0pID0+IHtcblx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsICd0eXBlJywgeyB0ZXh0OiAnYWJjJyB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbXG5cdFx0XHRcdCdoYW5kbGUgY2hhbmdlOiBlZGl0b3Iub25EaWRUeXBlIFwiYWJjXCInLFxuXHRcdFx0XHQnaGFuZGxlIGNoYW5nZTogZWRpdG9yLnZlcnNpb25JZCB7XCJjaGFuZ2VzXCI6W3tcInJhbmdlXCI6XCJbMSwxIC0+IDEsMV1cIixcInJhbmdlTGVuZ3RoXCI6MCxcInRleHRcIjpcImFcIixcInJhbmdlT2Zmc2V0XCI6MH1dLFwiZW9sXCI6XCJcXFxcblwiLFwidmVyc2lvbklkXCI6MixcImRldGFpbGVkUmVhc29uc1wiOlt7XCJtZXRhZGF0YVwiOntcInNvdXJjZVwiOlwiY3Vyc29yXCIsXCJraW5kXCI6XCJ0eXBlXCIsXCJkZXRhaWxlZFNvdXJjZVwiOlwia2V5Ym9hcmRcIn19XSxcImRldGFpbGVkUmVhc29uc0NoYW5nZUxlbmd0aHNcIjpbMV19Jyxcblx0XHRcdFx0J2hhbmRsZSBjaGFuZ2U6IGVkaXRvci52ZXJzaW9uSWQge1wiY2hhbmdlc1wiOlt7XCJyYW5nZVwiOlwiWzEsMiAtPiAxLDJdXCIsXCJyYW5nZUxlbmd0aFwiOjAsXCJ0ZXh0XCI6XCJiXCIsXCJyYW5nZU9mZnNldFwiOjF9XSxcImVvbFwiOlwiXFxcXG5cIixcInZlcnNpb25JZFwiOjMsXCJkZXRhaWxlZFJlYXNvbnNcIjpbe1wibWV0YWRhdGFcIjp7XCJzb3VyY2VcIjpcImN1cnNvclwiLFwia2luZFwiOlwidHlwZVwiLFwiZGV0YWlsZWRTb3VyY2VcIjpcImtleWJvYXJkXCJ9fV0sXCJkZXRhaWxlZFJlYXNvbnNDaGFuZ2VMZW5ndGhzXCI6WzFdfScsXG5cdFx0XHRcdCdoYW5kbGUgY2hhbmdlOiBlZGl0b3IudmVyc2lvbklkIHtcImNoYW5nZXNcIjpbe1wicmFuZ2VcIjpcIlsxLDMgLT4gMSwzXVwiLFwicmFuZ2VMZW5ndGhcIjowLFwidGV4dFwiOlwiY1wiLFwicmFuZ2VPZmZzZXRcIjoyfV0sXCJlb2xcIjpcIlxcXFxuXCIsXCJ2ZXJzaW9uSWRcIjo0LFwiZGV0YWlsZWRSZWFzb25zXCI6W3tcIm1ldGFkYXRhXCI6e1wic291cmNlXCI6XCJjdXJzb3JcIixcImtpbmRcIjpcInR5cGVcIixcImRldGFpbGVkU291cmNlXCI6XCJrZXlib2FyZFwifX1dLFwiZGV0YWlsZWRSZWFzb25zQ2hhbmdlTGVuZ3Roc1wiOlsxXX0nLFxuXHRcdFx0XHQnaGFuZGxlIGNoYW5nZTogZWRpdG9yLnNlbGVjdGlvbnMge1wic2VsZWN0aW9uXCI6XCJbMSw0IC0+IDEsNF1cIixcIm1vZGVsVmVyc2lvbklkXCI6NCxcIm9sZFNlbGVjdGlvbnNcIjpbXCJbMSwxIC0+IDEsMV1cIl0sXCJvbGRNb2RlbFZlcnNpb25JZFwiOjEsXCJzb3VyY2VcIjpcImtleWJvYXJkXCIsXCJyZWFzb25cIjowfScsXG5cdFx0XHRcdCdydW5uaW5nIGRlcml2ZWQ6IHNlbGVjdGlvbjogWzEsNCAtPiAxLDRdLCB2YWx1ZTogNCdcblx0XHRcdF0pKTtcblxuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA1KSwgJ3Rlc3QnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbXG5cdFx0XHRcdCdoYW5kbGUgY2hhbmdlOiBlZGl0b3Iuc2VsZWN0aW9ucyB7XCJzZWxlY3Rpb25cIjpcIlsxLDUgLT4gMSw1XVwiLFwibW9kZWxWZXJzaW9uSWRcIjo0LFwib2xkU2VsZWN0aW9uc1wiOltcIlsxLDQgLT4gMSw0XVwiXSxcIm9sZE1vZGVsVmVyc2lvbklkXCI6NCxcInNvdXJjZVwiOlwidGVzdFwiLFwicmVhc29uXCI6MH0nLFxuXHRcdFx0XHQncnVubmluZyBkZXJpdmVkOiBzZWxlY3Rpb246IFsxLDUgLT4gMSw1XSwgdmFsdWU6IDQnXG5cdFx0XHRdKSk7XG5cdFx0fSkpO1xuXG5cdHRlc3QoJ2xpc3RlbmVyIGludGVyYWN0aW9uICh1bmZvcmNlZCknLCAoKSA9PiB7XG5cdFx0bGV0IGRlcml2ZWQ6IElPYnNlcnZhYmxlPHN0cmluZz47XG5cdFx0bGV0IGxvZzogTG9nO1xuXHRcdHdpdGhFZGl0b3JTZXR1cFRlc3RGaXh0dXJlKFxuXHRcdFx0KGVkaXRvciwgZGlzcG9zYWJsZXMpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKFxuXHRcdFx0XHRcdGVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRsb2cubG9nKCc+Pj4gYmVmb3JlIGdldCcpO1xuXHRcdFx0XHRcdFx0ZGVyaXZlZC5nZXQoKTtcblx0XHRcdFx0XHRcdGxvZy5sb2coJzw8PCBhZnRlciBnZXQnKTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHQpO1xuXHRcdFx0fSxcblx0XHRcdChhcmdzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IGFyZ3MuZWRpdG9yO1xuXHRcdFx0XHRkZXJpdmVkID0gYXJncy5kZXJpdmVkO1xuXHRcdFx0XHRsb2cgPSBhcmdzLmxvZztcblxuXHRcdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCAndHlwZScsIHsgdGV4dDogJ2EnIH0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFtcblx0XHRcdFx0XHQnPj4+IGJlZm9yZSBnZXQnLFxuXHRcdFx0XHRcdCc8PDwgYWZ0ZXIgZ2V0Jyxcblx0XHRcdFx0XHQnaGFuZGxlIGNoYW5nZTogZWRpdG9yLm9uRGlkVHlwZSBcImFcIicsXG5cdFx0XHRcdFx0J2hhbmRsZSBjaGFuZ2U6IGVkaXRvci52ZXJzaW9uSWQge1wiY2hhbmdlc1wiOlt7XCJyYW5nZVwiOlwiWzEsMSAtPiAxLDFdXCIsXCJyYW5nZUxlbmd0aFwiOjAsXCJ0ZXh0XCI6XCJhXCIsXCJyYW5nZU9mZnNldFwiOjB9XSxcImVvbFwiOlwiXFxcXG5cIixcInZlcnNpb25JZFwiOjIsXCJkZXRhaWxlZFJlYXNvbnNcIjpbe1wibWV0YWRhdGFcIjp7XCJzb3VyY2VcIjpcImN1cnNvclwiLFwia2luZFwiOlwidHlwZVwiLFwiZGV0YWlsZWRTb3VyY2VcIjpcImtleWJvYXJkXCJ9fV0sXCJkZXRhaWxlZFJlYXNvbnNDaGFuZ2VMZW5ndGhzXCI6WzFdfScsXG5cdFx0XHRcdFx0J2hhbmRsZSBjaGFuZ2U6IGVkaXRvci5zZWxlY3Rpb25zIHtcInNlbGVjdGlvblwiOlwiWzEsMiAtPiAxLDJdXCIsXCJtb2RlbFZlcnNpb25JZFwiOjIsXCJvbGRTZWxlY3Rpb25zXCI6W1wiWzEsMSAtPiAxLDFdXCJdLFwib2xkTW9kZWxWZXJzaW9uSWRcIjoxLFwic291cmNlXCI6XCJrZXlib2FyZFwiLFwicmVhc29uXCI6MH0nLFxuXHRcdFx0XHRcdCdydW5uaW5nIGRlcml2ZWQ6IHNlbGVjdGlvbjogWzEsMiAtPiAxLDJdLCB2YWx1ZTogMidcblx0XHRcdFx0XSkpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpc3RlbmVyIGludGVyYWN0aW9uICgpJywgKCkgPT4ge1xuXHRcdGxldCBkZXJpdmVkOiBJT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXHRcdGxldCBsb2c6IExvZztcblx0XHR3aXRoRWRpdG9yU2V0dXBUZXN0Rml4dHVyZShcblx0XHRcdChlZGl0b3IsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChcblx0XHRcdFx0XHRlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0bG9nLmxvZygnPj4+IGJlZm9yZSBmb3JjZVVwZGF0ZScpO1xuXHRcdFx0XHRcdFx0b2JzZXJ2YWJsZUNvZGVFZGl0b3IoZWRpdG9yKS5mb3JjZVVwZGF0ZSgpO1xuXG5cdFx0XHRcdFx0XHRsb2cubG9nKCc+Pj4gYmVmb3JlIGdldCcpO1xuXHRcdFx0XHRcdFx0ZGVyaXZlZC5nZXQoKTtcblx0XHRcdFx0XHRcdGxvZy5sb2coJzw8PCBhZnRlciBnZXQnKTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHQpO1xuXHRcdFx0fSxcblx0XHRcdChhcmdzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IGFyZ3MuZWRpdG9yO1xuXHRcdFx0XHRkZXJpdmVkID0gYXJncy5kZXJpdmVkO1xuXHRcdFx0XHRsb2cgPSBhcmdzLmxvZztcblxuXHRcdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCAndHlwZScsIHsgdGV4dDogJ2EnIH0pO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoW1xuXHRcdFx0XHRcdCc+Pj4gYmVmb3JlIGZvcmNlVXBkYXRlJyxcblx0XHRcdFx0XHQnPj4+IGJlZm9yZSBnZXQnLFxuXHRcdFx0XHRcdCdoYW5kbGUgY2hhbmdlOiBlZGl0b3IudmVyc2lvbklkIHVuZGVmaW5lZCcsXG5cdFx0XHRcdFx0J3J1bm5pbmcgZGVyaXZlZDogc2VsZWN0aW9uOiBbMSwyIC0+IDEsMl0sIHZhbHVlOiAyJyxcblx0XHRcdFx0XHQnPDw8IGFmdGVyIGdldCcsXG5cdFx0XHRcdFx0J2hhbmRsZSBjaGFuZ2U6IGVkaXRvci5vbkRpZFR5cGUgXCJhXCInLFxuXHRcdFx0XHRcdCdoYW5kbGUgY2hhbmdlOiBlZGl0b3IudmVyc2lvbklkIHtcImNoYW5nZXNcIjpbe1wicmFuZ2VcIjpcIlsxLDEgLT4gMSwxXVwiLFwicmFuZ2VMZW5ndGhcIjowLFwidGV4dFwiOlwiYVwiLFwicmFuZ2VPZmZzZXRcIjowfV0sXCJlb2xcIjpcIlxcXFxuXCIsXCJ2ZXJzaW9uSWRcIjoyLFwiZGV0YWlsZWRSZWFzb25zXCI6W3tcIm1ldGFkYXRhXCI6e1wic291cmNlXCI6XCJjdXJzb3JcIixcImtpbmRcIjpcInR5cGVcIixcImRldGFpbGVkU291cmNlXCI6XCJrZXlib2FyZFwifX1dLFwiZGV0YWlsZWRSZWFzb25zQ2hhbmdlTGVuZ3Roc1wiOlsxXX0nLFxuXHRcdFx0XHRcdCdoYW5kbGUgY2hhbmdlOiBlZGl0b3Iuc2VsZWN0aW9ucyB7XCJzZWxlY3Rpb25cIjpcIlsxLDIgLT4gMSwyXVwiLFwibW9kZWxWZXJzaW9uSWRcIjoyLFwib2xkU2VsZWN0aW9uc1wiOltcIlsxLDEgLT4gMSwxXVwiXSxcIm9sZE1vZGVsVmVyc2lvbklkXCI6MSxcInNvdXJjZVwiOlwia2V5Ym9hcmRcIixcInJlYXNvblwiOjB9Jyxcblx0XHRcdFx0XHQncnVubmluZyBkZXJpdmVkOiBzZWxlY3Rpb246IFsxLDIgLT4gMSwyXSwgdmFsdWU6IDInXG5cdFx0XHRcdF0pKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcbn0pO1xuXG5jbGFzcyBMb2cge1xuXHRwcml2YXRlIHJlYWRvbmx5IGVudHJpZXM6IHN0cmluZ1tdID0gW107XG5cdHB1YmxpYyBsb2cobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5lbnRyaWVzLnB1c2gobWVzc2FnZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QW5kQ2xlYXJFbnRyaWVzKCk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBlbnRyaWVzID0gWy4uLnRoaXMuZW50cmllc107XG5cdFx0dGhpcy5lbnRyaWVzLmxlbmd0aCA9IDA7XG5cdFx0cmV0dXJuIGVudHJpZXM7XG5cdH1cbn1cblxuZnVuY3Rpb24gZm9ybWF0Q2hhbmdlKGNoYW5nZTogdW5rbm93bikge1xuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoXG5cdFx0Y2hhbmdlLFxuXHRcdChrZXksIHZhbHVlKSA9PiB7XG5cdFx0XHRpZiAodmFsdWUgaW5zdGFuY2VvZiBSYW5nZSkge1xuXHRcdFx0XHRyZXR1cm4gdmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdH1cblx0XHRcdGlmIChcblx0XHRcdFx0dmFsdWUgPT09IGZhbHNlIHx8XG5cdFx0XHRcdChBcnJheS5pc0FycmF5KHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDApXG5cdFx0XHQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9XG5cdCk7XG59XG5cbmZ1bmN0aW9uIG9ic2VydmFibGVOYW1lKG9iczogSU9ic2VydmFibGU8YW55Piwgb2JzRWRpdG9yOiBPYnNlcnZhYmxlQ29kZUVkaXRvcik6IHN0cmluZyB7XG5cdHN3aXRjaCAob2JzKSB7XG5cdFx0Y2FzZSBvYnNFZGl0b3Iuc2VsZWN0aW9uczpcblx0XHRcdHJldHVybiAnZWRpdG9yLnNlbGVjdGlvbnMnO1xuXHRcdGNhc2Ugb2JzRWRpdG9yLnZlcnNpb25JZDpcblx0XHRcdHJldHVybiAnZWRpdG9yLnZlcnNpb25JZCc7XG5cdFx0Y2FzZSBvYnNFZGl0b3Iub25EaWRUeXBlOlxuXHRcdFx0cmV0dXJuICdlZGl0b3Iub25EaWRUeXBlJztcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuICd1bmtub3duJztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQXNCLDRCQUE0QjtBQUNsRCxTQUFTLCtDQUErQztBQUV4RCxTQUErQiw0QkFBNEI7QUFDM0QsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBRXRCLFNBQVMsMEJBQTBCO0FBRW5DLE1BQU0sb0JBQW9CLE1BQU07QUFDL0IsMENBQXdDO0FBRXhDLFdBQVMsZ0JBQ1IsSUFDQztBQUNELCtCQUEyQixRQUFXLEVBQUU7QUFBQSxFQUN6QztBQUVBLFdBQVMsMkJBQ1Isa0JBR0EsSUFDQztBQUNELHVCQUFtQixlQUFlLENBQUMsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUM1RCxZQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMseUJBQW1CLFFBQVEsV0FBVztBQUN0QyxZQUFNLFlBQVkscUJBQXFCLE1BQU07QUFDN0MsWUFBTSxNQUFNLElBQUksSUFBSTtBQUVwQixZQUFNLFVBQVU7QUFBQSxRQUNmO0FBQUEsVUFDQyxlQUFlO0FBQUEsWUFDZCxxQkFBcUIsTUFBTTtBQUFBLFlBQzNCLGNBQWMsQ0FBQyxZQUFZO0FBQzFCLG9CQUFNLFVBQVUsZUFBZSxRQUFRLG1CQUFtQixTQUFTO0FBRW5FLGtCQUFJLElBQUksa0JBQWtCLE9BQU8sSUFBSSxhQUFhLFFBQVEsTUFBTSxDQUFDLEVBQUU7QUFDbkUscUJBQU87QUFBQSxZQUNSO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBLENBQUMsV0FBVztBQUNYLGdCQUFNLFlBQVksVUFB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
