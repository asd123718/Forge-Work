import assert from "assert";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Range } from "../../../common/core/range.js";
import { InternalModelContentChangeEvent, RawContentChangedType } from "../../../common/textModelEvents.js";
import { createTextModel } from "../testTextModel.js";
suite("Editor Model - Injected Text Events", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("Basic", () => {
    const thisModel = store.add(createTextModel("First Line\nSecond Line"));
    const recordedChanges = new Array();
    const spyViewModel = new class extends mock() {
      onDidChangeContentOrInjectedText(e) {
        const changes = e instanceof InternalModelContentChangeEvent ? e.rawContentChangedEvent.changes : e.changes;
        for (const change of changes) {
          recordedChanges.push(mapChange(change));
        }
      }
      emitContentChangeEvent(_e) {
      }
    }();
    thisModel.registerViewModel(spyViewModel);
    let decorations = thisModel.deltaDecorations([], [{
      options: {
        after: { content: "injected1" },
        description: "test1",
        showIfCollapsed: true
      },
      range: new Range(1, 1, 1, 1)
    }]);
    assert.deepStrictEqual(recordedChanges.splice(0), [
      {
        kind: "lineChanged",
        lineNumber: 1,
        lineNumberPostEdit: 1
      }
    ]);
    decorations = thisModel.deltaDecorations(decorations, [{
      options: {
        after: { content: "injected1" },
        description: "test1",
        showIfCollapsed: true
      },
      range: new Range(2, 1, 2, 1)
    }, {
      options: {
        after: { content: "injected2" },
        description: "test2",
        showIfCollapsed: true
      },
      range: new Range(2, 2, 2, 2)
    }]);
    assert.deepStrictEqual(recordedChanges.splice(0), [
      {
        kind: "lineChanged",
        lineNumber: 1,
        lineNumberPostEdit: 1
      },
      {
        kind: "lineChanged",
        lineNumber: 2,
        lineNumberPostEdit: 2
      }
    ]);
    thisModel.applyEdits([EditOperation.replace(new Range(2, 2, 2, 2), "Hello")]);
    assert.deepStrictEqual(recordedChanges.splice(0), [
      {
        kind: "lineChanged",
        lineNumber: 2,
        lineNumberPostEdit: 2
      }
    ]);
    thisModel.pushEditOperations(null, [EditOperation.replace(new Range(2, 2, 2, 2), "\n\n\n")], null);
    assert.deepStrictEqual(thisModel.getAllDecorations(void 0).map((d) => ({ description: d.options.description, range: d.range.toString() })), [
      {
        "description": "test1",
        "range": "[2,1 -> 2,1]"
      },
      {
        "description": "test2",
        "range": "[2,2 -> 5,6]"
      }
    ]);
    assert.deepStrictEqual(recordedChanges.splice(0), [
      {
        kind: "lineChanged",
        lineNumber: 2,
        lineNumberPostEdit: 2
      },
      {
        kind: "linesInserted",
        fromLineNumber: 3,
        count: 3
      }
    ]);
    thisModel.pushEditOperations(null, [EditOperation.replace(new Range(3, 1, 5, 1), "\n\n\n\n\n\n\n\n\n\n\n\n\n")], null);
    assert.deepStrictEqual(recordedChanges.splice(0), [
      {
        kind: "lineChanged",
        lineNumber: 5,
        lineNumberPostEdit: 5
      },
      {
        kind: "lineChanged",
        lineNumber: 4,
        lineNumberPostEdit: 4
      },
      {
        kind: "lineChanged",
        lineNumber: 3,
        lineNumberPostEdit: 3
      },
      {
        kind: "linesInserted",
        fromLineNumber: 6,
        count: 11
      }
    ]);
    assert.strictEqual(thisModel.undo(), void 0);
    assert.deepStrictEqual(recordedChanges.splice(0), [
      {
        kind: "lineChanged",
        lineNumber: 2,
        lineNumberPostEdit: 2
      },
      {
        kind: "linesDeleted"
      }
    ]);
    thisModel.unregisterViewModel(spyViewModel);
  });
});
function mapChange(change) {
  if (change.changeType === RawContentChangedType.LineChanged) {
    return {
      kind: "lineChanged",
      lineNumber: change.lineNumber,
      lineNumberPostEdit: change.lineNumberPostEdit
    };
  } else if (change.changeType === RawContentChangedType.LinesInserted) {
    return {
      kind: "linesInserted",
      fromLineNumber: change.fromLineNumber,
      count: change.count
    };
  } else if (change.changeType === RawContentChangedType.LinesDeleted) {
    return {
      kind: "linesDeleted"
    };
  } else if (change.changeType === RawContentChangedType.EOLChanged) {
    return {
      kind: "eolChanged"
    };
  } else if (change.changeType === RawContentChangedType.Flush) {
    return {
      kind: "flush"
    };
  }
  return { kind: "unknown" };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZWxcXG1vZGVsSW5qZWN0ZWRUZXh0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJbnRlcm5hbE1vZGVsQ29udGVudENoYW5nZUV2ZW50LCBNb2RlbEluamVjdGVkVGV4dENoYW5nZWRFdmVudCwgTW9kZWxSYXdDaGFuZ2UsIFJhd0NvbnRlbnRDaGFuZ2VkVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90ZXh0TW9kZWxFdmVudHMuanMnO1xuaW1wb3J0IHsgSVZpZXdNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vdGVzdFRleHRNb2RlbC5qcyc7XG5cbnN1aXRlKCdFZGl0b3IgTW9kZWwgLSBJbmplY3RlZCBUZXh0IEV2ZW50cycsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdCYXNpYycsICgpID0+IHtcblx0XHRjb25zdCB0aGlzTW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCdGaXJzdCBMaW5lXFxuU2Vjb25kIExpbmUnKSk7XG5cblx0XHRjb25zdCByZWNvcmRlZENoYW5nZXMgPSBuZXcgQXJyYXk8dW5rbm93bj4oKTtcblxuXHRcdGNvbnN0IHNweVZpZXdNb2RlbCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZpZXdNb2RlbD4oKSB7XG5cdFx0XHRvdmVycmlkZSBvbkRpZENoYW5nZUNvbnRlbnRPckluamVjdGVkVGV4dChlOiBJbnRlcm5hbE1vZGVsQ29udGVudENoYW5nZUV2ZW50IHwgTW9kZWxJbmplY3RlZFRleHRDaGFuZ2VkRXZlbnQpIHtcblx0XHRcdFx0Y29uc3QgY2hhbmdlcyA9IChlIGluc3RhbmNlb2YgSW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VFdmVudCA/IGUucmF3Q29udGVudENoYW5nZWRFdmVudC5jaGFuZ2VzIDogZS5jaGFuZ2VzKTtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgY2hhbmdlcykge1xuXHRcdFx0XHRcdHJlY29yZGVkQ2hhbmdlcy5wdXNoKG1hcENoYW5nZShjaGFuZ2UpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZW1pdENvbnRlbnRDaGFuZ2VFdmVudChfZTogSW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VFdmVudCB8IE1vZGVsSW5qZWN0ZWRUZXh0Q2hhbmdlZEV2ZW50KTogdm9pZCB7IH1cblx0XHR9O1xuXHRcdHRoaXNNb2RlbC5yZWdpc3RlclZpZXdNb2RlbChzcHlWaWV3TW9kZWwpO1xuXG5cdFx0Ly8gSW5pdGlhbCBkZWNvcmF0aW9uXG5cdFx0bGV0IGRlY29yYXRpb25zID0gdGhpc01vZGVsLmRlbHRhRGVjb3JhdGlvbnMoW10sIFt7XG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdGFmdGVyOiB7IGNvbnRlbnQ6ICdpbmplY3RlZDEnIH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdDEnLFxuXHRcdFx0XHRzaG93SWZDb2xsYXBzZWQ6IHRydWVcblx0XHRcdH0sXG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLFxuXHRcdH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlY29yZGVkQ2hhbmdlcy5zcGxpY2UoMCksIFtcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2xpbmVDaGFuZ2VkJyxcblx0XHRcdFx0bGluZU51bWJlcjogMSxcblx0XHRcdFx0bGluZU51bWJlclBvc3RFZGl0OiAxLFxuXHRcdFx0fVxuXHRcdF0pO1xuXG5cdFx0Ly8gRGVjb3JhdGlvbiBjaGFuZ2Vcblx0XHRkZWNvcmF0aW9ucyA9IHRoaXNNb2RlbC5kZWx0YURlY29yYXRpb25zKGRlY29yYXRpb25zLCBbe1xuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRhZnRlcjogeyBjb250ZW50OiAnaW5qZWN0ZWQxJyB9LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QxJyxcblx0XHRcdFx0c2hvd0lmQ29sbGFwc2VkOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAyLCAxKSxcblx0XHR9LCB7XG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdGFmdGVyOiB7IGNvbnRlbnQ6ICdpbmplY3RlZDInIH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdDInLFxuXHRcdFx0XHRzaG93SWZDb2xsYXBzZWQ6IHRydWVcblx0XHRcdH0sXG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKDIsIDIsIDIsIDIpLFxuXHRcdH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlY29yZGVkQ2hhbmdlcy5zcGxpY2UoMCksIFtcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2xpbmVDaGFuZ2VkJyxcblx0XHRcdFx0bGluZU51bWJlcjogMSxcblx0XHRcdFx0bGluZU51bWJlclBvc3RFZGl0OiAxLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2xpbmVDaGFuZ2VkJyxcblx0XHRcdFx0bGluZU51bWJlcjogMixcblx0XHRcdFx0bGluZU51bWJlclBvc3RFZGl0OiAyLFxuXHRcdFx0fVxuXHRcdF0pO1xuXG5cdFx0Ly8gU2ltcGxlIEluc2VydFxuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLnJlcGxhY2UobmV3IFJhbmdlKDIsIDIsIDIsIDIpLCAnSGVsbG8nKV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVjb3JkZWRDaGFuZ2VzLnNwbGljZSgwKSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAnbGluZUNoYW5nZWQnLFxuXHRcdFx0XHRsaW5lTnVtYmVyOiAyLFxuXHRcdFx0XHRsaW5lTnVtYmVyUG9zdEVkaXQ6IDIsXG5cdFx0XHR9XG5cdFx0XSk7XG5cblx0XHQvLyBNdWx0aS1MaW5lIEluc2VydFxuXHRcdHRoaXNNb2RlbC5wdXNoRWRpdE9wZXJhdGlvbnMobnVsbCwgW0VkaXRPcGVyYXRpb24ucmVwbGFjZShuZXcgUmFuZ2UoMiwgMiwgMiwgMiksICdcXG5cXG5cXG4nKV0sIG51bGwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGhpc01vZGVsLmdldEFsbERlY29yYXRpb25zKHVuZGVmaW5lZCkubWFwKGQgPT4gKHsgZGVzY3JpcHRpb246IGQub3B0aW9ucy5kZXNjcmlwdGlvbiwgcmFuZ2U6IGQucmFuZ2UudG9TdHJpbmcoKSB9KSksIFt7XG5cdFx0XHQnZGVzY3JpcHRpb24nOiAndGVzdDEnLFxuXHRcdFx0J3JhbmdlJzogJ1syLDEgLT4gMiwxXSdcblx0XHR9LFxuXHRcdHtcblx0XHRcdCdkZXNjcmlwdGlvbic6ICd0ZXN0MicsXG5cdFx0XHQncmFuZ2UnOiAnWzIsMiAtPiA1LDZdJ1xuXHRcdH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlY29yZGVkQ2hhbmdlcy5zcGxpY2UoMCksIFtcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2xpbmVDaGFuZ2VkJyxcblx0XHRcdFx0bGluZU51bWJlcjogMixcblx0XHRcdFx0bGluZU51bWJlclBvc3RFZGl0OiAyLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2xpbmVzSW5zZXJ0ZWQnLFxuXHRcdFx0XHRmcm9tTGluZU51bWJlcjogMyxcblx0XHRcdFx0Y291bnQ6IDMsXG5cdFx0XHR9XG5cdFx0XSk7XG5cblxuXHRcdC8vIE11bHRpLUxpbmUgUmVwbGFjZVxuXHRcdHRoaXNNb2RlbC5wdXNoRWRpdE9wZXJhdGlvbnMobnVsbCwgW0VkaXRPcGVyYXRpb24ucmVwbGFjZShuZXcgUmFuZ2UoMywgMSwgNSwgMSksICdcXG5cXG5cXG5cXG5cXG5cXG5cXG5cXG5cXG5cXG5cXG5cXG5cXG4nKV0sIG51bGwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVjb3JkZWRDaGFuZ2VzLnNwbGljZSgwKSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAnbGluZUNoYW5nZWQnLFxuXHRcdFx0XHRsaW5lTnVtYmVyOiA1LFxuXHRcdFx0XHRsaW5lTnVtYmVyUG9zdEVkaXQ6IDUsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAnbGluZUNoYW5nZWQnLFxuXHRcdFx0XHRsaW5lTnVtYmVyOiA0LFxuXHRcdFx0XHRsaW5lTnVtYmVyUG9zdEVkaXQ6IDQsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAnbGluZUNoYW5nZWQnLFxuXHRcdFx0XHRsaW5lTnVtYmVyOiAzLFxuXHRcdFx0XHRsaW5lTnVtYmVyUG9zdEVkaXQ6IDMsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAnbGluZXNJbnNlcnRlZCcsXG5cdFx0XHRcdGZyb21MaW5lTnVtYmVyOiA2LFxuXHRcdFx0XHRjb3VudDogMTEsXG5cdFx0XHR9XG5cdFx0XSk7XG5cblx0XHQvLyBNdWx0aS1MaW5lIFJlcGxhY2UgdW5kb1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwudW5kbygpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVjb3JkZWRDaGFuZ2VzLnNwbGljZSgwKSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAnbGluZUNoYW5nZWQnLFxuXHRcdFx0XHRsaW5lTnVtYmVyOiAyLFxuXHRcdFx0XHRsaW5lTnVtYmVyUG9zdEVkaXQ6IDIsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAnbGluZXNEZWxldGVkJyxcblx0XHRcdH1cblx0XHRdKTtcblxuXHRcdHRoaXNNb2RlbC51bnJlZ2lzdGVyVmlld01vZGVsKHNweVZpZXdNb2RlbCk7XG5cdH0pO1xufSk7XG5cbmZ1bmN0aW9uIG1hcENoYW5nZShjaGFuZ2U6IE1vZGVsUmF3Q2hhbmdlKTogdW5rbm93biB7XG5cdGlmIChjaGFuZ2UuY2hhbmdlVHlwZSA9PT0gUmF3Q29udGVudENoYW5nZWRUeXBlLkxpbmVDaGFuZ2VkKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdsaW5lQ2hhbmdlZCcsXG5cdFx0XHRsaW5lTnVtYmVyOiBjaGFuZ2UubGluZU51bWJlcixcblx0XHRcdGxpbmVOdW1iZXJQb3N0RWRpdDogY2hhbmdlLmxpbmVOdW1iZXJQb3N0RWRpdCxcblx0XHR9O1xuXHR9IGVsc2UgaWYgKGNoYW5nZS5jaGFuZ2VUeXBlID09PSBSYXdDb250ZW50Q2hhbmdlZFR5cGUuTGluZXNJbnNlcnRlZCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnbGluZXNJbnNlcnRlZCcsXG5cdFx0XHRmcm9tTGluZU51bWJlcjogY2hhbmdlLmZyb21MaW5lTnVtYmVyLFxuXHRcdFx0Y291bnQ6IGNoYW5nZS5jb3VudCxcblx0XHR9O1xuXHR9IGVsc2UgaWYgKGNoYW5nZS5jaGFuZ2VUeXBlID09PSBSYXdDb250ZW50Q2hhbmdlZFR5cGUuTGluZXNEZWxldGVkKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdsaW5lc0RlbGV0ZWQnLFxuXHRcdH07XG5cdH0gZWxzZSBpZiAoY2hhbmdlLmNoYW5nZVR5cGUgPT09IFJhd0NvbnRlbnRDaGFuZ2VkVHlwZS5FT0xDaGFuZ2VkKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdlb2xDaGFuZ2VkJ1xuXHRcdH07XG5cdH0gZWxzZSBpZiAoY2hhbmdlLmNoYW5nZVR5cGUgPT09IFJhd0NvbnRlbnRDaGFuZ2VkVHlwZS5GbHVzaCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnZmx1c2gnXG5cdFx0fTtcblx0fVxuXHRyZXR1cm4geyBraW5kOiAndW5rbm93bicgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUNBQWdGLDZCQUE2QjtBQUV0SCxTQUFTLHVCQUF1QjtBQUVoQyxNQUFNLHVDQUF1QyxNQUFNO0FBQ2xELFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsT0FBSyxTQUFTLE1BQU07QUFDbkIsVUFBTSxZQUFZLE1BQU0sSUFBSSxnQkFBZ0IseUJBQXlCLENBQUM7QUFFdEUsVUFBTSxrQkFBa0IsSUFBSSxNQUFlO0FBRTNDLFVBQU0sZUFBZSxJQUFJ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
