import assert from "assert";
import { DisposableStore } from "../../../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../../../editor/common/core/range.js";
import { withTestCodeEditor } from "../../../../../../../../editor/test/browser/testCodeEditor.js";
import { ChatWidget } from "../../../../../browser/widget/chatWidget.js";
import "../../../../../browser/widget/input/editor/chatInputEditorContrib.js";
suite("ChatTokenDeleter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function getChatTokenDeleterCtor() {
    const ctor = ChatWidget.CONTRIBS.find((contrib) => contrib.name === "ChatTokenDeleter");
    assert.ok(ctor, "ChatTokenDeleter should be registered as a chat widget contribution");
    return ctor;
  }
  function createWidget(editor, onRefreshParsedInput) {
    return {
      inputEditor: editor,
      refreshParsedInput: onRefreshParsedInput
    };
  }
  test("deletes inserted slash, agent, and variable tokens on immediate backspace", () => {
    const testCases = [
      { initialValue: "/", insertedText: "/fix ", deleteRange: new Range(1, 5, 1, 6) },
      { initialValue: "@", insertedText: "@workspace ", deleteRange: new Range(1, 11, 1, 12) },
      { initialValue: "#", insertedText: "#selection", deleteRange: new Range(1, 10, 1, 11) }
    ];
    for (const testCase of testCases) {
      withTestCodeEditor(testCase.initialValue, {}, (editor) => {
        let refreshCount = 0;
        const store = new DisposableStore();
        try {
          const widget = createWidget(editor, () => {
            refreshCount++;
          });
          const ChatTokenDeleterCtor = getChatTokenDeleterCtor();
          store.add(new ChatTokenDeleterCtor(widget));
          editor.executeEdits("test", [{ range: new Range(1, 1, 1, 2), text: testCase.insertedText }]);
          assert.strictEqual(editor.getValue(), testCase.insertedText);
          editor.executeEdits("test", [{ range: testCase.deleteRange, text: "" }]);
          assert.strictEqual(editor.getValue(), "");
          assert.strictEqual(refreshCount, 1);
        } finally {
          store.dispose();
        }
      });
    }
  });
  test("does not delete the whole token when backspacing inside the inserted token", () => {
    withTestCodeEditor("@", {}, (editor) => {
      let refreshCount = 0;
      const store = new DisposableStore();
      try {
        const widget = createWidget(editor, () => {
          refreshCount++;
        });
        const ChatTokenDeleterCtor = getChatTokenDeleterCtor();
        store.add(new ChatTokenDeleterCtor(widget));
        editor.executeEdits("test", [{ range: new Range(1, 1, 1, 2), text: "@workspace " }]);
        editor.executeEdits("test", [{ range: new Range(1, 5, 1, 6), text: "" }]);
        assert.strictEqual(editor.getValue(), "@worspace ");
        assert.strictEqual(refreshCount, 0);
      } finally {
        store.dispose();
      }
    });
  });
  test("only deletes on the immediate next backspace after token insertion", () => {
    withTestCodeEditor("@", {}, (editor) => {
      let refreshCount = 0;
      const store = new DisposableStore();
      try {
        const widget = createWidget(editor, () => {
          refreshCount++;
        });
        const ChatTokenDeleterCtor = getChatTokenDeleterCtor();
        store.add(new ChatTokenDeleterCtor(widget));
        editor.executeEdits("test", [{ range: new Range(1, 1, 1, 2), text: "@workspace " }]);
        editor.executeEdits("test", [{ range: new Range(1, 11, 1, 11), text: "x" }]);
        editor.executeEdits("test", [{ range: new Range(1, 11, 1, 12), text: "" }]);
        assert.strictEqual(editor.getValue(), "@workspace ");
        assert.strictEqual(refreshCount, 0);
      } finally {
        store.dispose();
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGVkaXRvclxcY2hhdElucHV0RWRpdG9yQ29udHJpYi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgd2l0aFRlc3RDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvYnJvd3Nlci90ZXN0Q29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0V2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdFdpZGdldC5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2VkaXRvci9jaGF0SW5wdXRFZGl0b3JDb250cmliLmpzJztcblxuc3VpdGUoJ0NoYXRUb2tlbkRlbGV0ZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gZ2V0Q2hhdFRva2VuRGVsZXRlckN0b3IoKSB7XG5cdFx0Y29uc3QgY3RvciA9IENoYXRXaWRnZXQuQ09OVFJJQlMuZmluZChjb250cmliID0+IGNvbnRyaWIubmFtZSA9PT0gJ0NoYXRUb2tlbkRlbGV0ZXInKTtcblx0XHRhc3NlcnQub2soY3RvciwgJ0NoYXRUb2tlbkRlbGV0ZXIgc2hvdWxkIGJlIHJlZ2lzdGVyZWQgYXMgYSBjaGF0IHdpZGdldCBjb250cmlidXRpb24nKTtcblx0XHRyZXR1cm4gY3Rvcjtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVdpZGdldChlZGl0b3I6IElDaGF0V2lkZ2V0WydpbnB1dEVkaXRvciddLCBvblJlZnJlc2hQYXJzZWRJbnB1dDogKCkgPT4gdm9pZCk6IElDaGF0V2lkZ2V0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW5wdXRFZGl0b3I6IGVkaXRvcixcblx0XHRcdHJlZnJlc2hQYXJzZWRJbnB1dDogb25SZWZyZXNoUGFyc2VkSW5wdXQsXG5cdFx0fSBhcyB1bmtub3duIGFzIElDaGF0V2lkZ2V0O1xuXHR9XG5cblx0dGVzdCgnZGVsZXRlcyBpbnNlcnRlZCBzbGFzaCwgYWdlbnQsIGFuZCB2YXJpYWJsZSB0b2tlbnMgb24gaW1tZWRpYXRlIGJhY2tzcGFjZScsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0Q2FzZXMgPSBbXG5cdFx0XHR7IGluaXRpYWxWYWx1ZTogJy8nLCBpbnNlcnRlZFRleHQ6ICcvZml4ICcsIGRlbGV0ZVJhbmdlOiBuZXcgUmFuZ2UoMSwgNSwgMSwgNikgfSxcblx0XHRcdHsgaW5pdGlhbFZhbHVlOiAnQCcsIGluc2VydGVkVGV4dDogJ0B3b3Jrc3BhY2UgJywgZGVsZXRlUmFuZ2U6IG5ldyBSYW5nZSgxLCAxMSwgMSwgMTIpIH0sXG5cdFx0XHR7IGluaXRpYWxWYWx1ZTogJyMnLCBpbnNlcnRlZFRleHQ6ICcjc2VsZWN0aW9uJywgZGVsZXRlUmFuZ2U6IG5ldyBSYW5nZSgxLCAxMCwgMSwgMTEpIH0sXG5cdFx0XTtcblxuXHRcdGZvciAoY29uc3QgdGVzdENhc2Ugb2YgdGVzdENhc2VzKSB7XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IodGVzdENhc2UuaW5pdGlhbFZhbHVlLCB7fSwgZWRpdG9yID0+IHtcblx0XHRcdFx0bGV0IHJlZnJlc2hDb3VudCA9IDA7XG5cdFx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZVdpZGdldChlZGl0b3IsICgpID0+IHtcblx0XHRcdFx0XHRcdHJlZnJlc2hDb3VudCsrO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGNvbnN0IENoYXRUb2tlbkRlbGV0ZXJDdG9yID0gZ2V0Q2hhdFRva2VuRGVsZXRlckN0b3IoKTtcblx0XHRcdFx0XHRzdG9yZS5hZGQobmV3IENoYXRUb2tlbkRlbGV0ZXJDdG9yKHdpZGdldCkpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLmV4ZWN1dGVFZGl0cygndGVzdCcsIFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMiksIHRleHQ6IHRlc3RDYXNlLmluc2VydGVkVGV4dCB9XSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRWYWx1ZSgpLCB0ZXN0Q2FzZS5pbnNlcnRlZFRleHQpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLmV4ZWN1dGVFZGl0cygndGVzdCcsIFt7IHJhbmdlOiB0ZXN0Q2FzZS5kZWxldGVSYW5nZSwgdGV4dDogJycgfV0pO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0VmFsdWUoKSwgJycpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWZyZXNoQ291bnQsIDEpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBkZWxldGUgdGhlIHdob2xlIHRva2VuIHdoZW4gYmFja3NwYWNpbmcgaW5zaWRlIHRoZSBpbnNlcnRlZCB0b2tlbicsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoJ0AnLCB7fSwgZWRpdG9yID0+IHtcblx0XHRcdGxldCByZWZyZXNoQ291bnQgPSAwO1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVXaWRnZXQoZWRpdG9yLCAoKSA9PiB7XG5cdFx0XHRcdFx0cmVmcmVzaENvdW50Kys7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBDaGF0VG9rZW5EZWxldGVyQ3RvciA9IGdldENoYXRUb2tlbkRlbGV0ZXJDdG9yKCk7XG5cdFx0XHRcdHN0b3JlLmFkZChuZXcgQ2hhdFRva2VuRGVsZXRlckN0b3Iod2lkZ2V0KSk7XG5cblx0XHRcdFx0ZWRpdG9yLmV4ZWN1dGVFZGl0cygndGVzdCcsIFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMiksIHRleHQ6ICdAd29ya3NwYWNlICcgfV0pO1xuXHRcdFx0XHRlZGl0b3IuZXhlY3V0ZUVkaXRzKCd0ZXN0JywgW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCA1LCAxLCA2KSwgdGV4dDogJycgfV0pO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0VmFsdWUoKSwgJ0B3b3JzcGFjZSAnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnJlc2hDb3VudCwgMCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29ubHkgZGVsZXRlcyBvbiB0aGUgaW1tZWRpYXRlIG5leHQgYmFja3NwYWNlIGFmdGVyIHRva2VuIGluc2VydGlvbicsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoJ0AnLCB7fSwgZWRpdG9yID0+IHtcblx0XHRcdGxldCByZWZyZXNoQ291bnQgPSAwO1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVXaWRnZXQoZWRpdG9yLCAoKSA9PiB7XG5cdFx0XHRcdFx0cmVmcmVzaENvdW50Kys7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBDaGF0VG9rZW5EZWxldGVyQ3RvciA9IGdldENoYXRUb2tlbkRlbGV0ZXJDdG9yKCk7XG5cdFx0XHRcdHN0b3JlLmFkZChuZXcgQ2hhdFRva2VuRGVsZXRlckN0b3Iod2lkZ2V0KSk7XG5cblx0XHRcdFx0ZWRpdG9yLmV4ZWN1dGVFZGl0cygndGVzdCcsIFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMiksIHRleHQ6ICdAd29ya3NwYWNlICcgfV0pO1xuXHRcdFx0XHRlZGl0b3IuZXhlY3V0ZUVkaXRzKCd0ZXN0JywgW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxMSwgMSwgMTEpLCB0ZXh0OiAneCcgfV0pO1xuXHRcdFx0XHRlZGl0b3IuZXhlY3V0ZUVkaXRzKCd0ZXN0JywgW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxMSwgMSwgMTIpLCB0ZXh0OiAnJyB9XSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRWYWx1ZSgpLCAnQHdvcmtzcGFjZSAnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnJlc2hDb3VudCwgMCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsa0JBQWtCO0FBQzNCLE9BQU87QUFFUCxNQUFNLG9CQUFvQixNQUFNO0FBRS9CLDBDQUF3QztBQUV4QyxXQUFTLDBCQUEwQjtBQUNsQyxVQUFNLE9BQU8sV0FBVyxTQUFTLEtBQUssYUFBVyxRQUFRLFNBQVMsa0JBQWtCO0FBQ3BGLFdBQU8sR0FBRyxNQUFNLHFFQUFxRTtBQUNyRixXQUFPO0FBQUEsRUFDUjtBQUVBLFdBQVMsYUFBYSxRQUFvQyxzQkFBK0M7QUFDeEcsV0FBTztBQUFBLE1BQ04sYUFBYTtBQUFBLE1BQ2Isb0JBQW9CO0FBQUEsSUFDckI7QUFBQSxFQUNEO0FBRUEsT0FBSyw2RUFBNkUsTUFBTTtBQUN2RixVQUFNLFlBQVk7QUFBQSxNQUNqQixFQUFFLGNBQWMsS0FBSyxjQUFjLFNBQVMsYUFBYSxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxFQUFFO0FBQUEsTUFDL0UsRUFBRSxjQUFjLEtBQUssY0FBYyxlQUFlLGFBQWEsSUFBSSxNQUFNLEdBQUcsSUFBSSxHQUFHLEVBQUUsRUFBRTtBQUFBLE1BQ3ZGLEVBQUUsY0FBYyxLQUFLLGNBQWMsY0FBYyxhQUFhLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLEVBQUU7QUFBQSxJQUN2RjtBQUVBLGVBQVcsWUFB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
