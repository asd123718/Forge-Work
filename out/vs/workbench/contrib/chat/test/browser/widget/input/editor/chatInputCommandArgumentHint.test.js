import assert from "assert";
import { DisposableStore } from "../../../../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../../../editor/common/core/range.js";
import { withTestCodeEditor } from "../../../../../../../../editor/test/browser/testCodeEditor.js";
import { ChatWidget } from "../../../../../browser/widget/chatWidget.js";
import { ChatDynamicVariableModel } from "../../../../../browser/attachments/chatDynamicVariables.js";
import "../../../../../browser/widget/input/editor/chatInputCommandArgumentHint.js";
suite("InputEditorCommandArgumentHint", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function getCtor() {
    const ctor = ChatWidget.CONTRIBS.find((contrib) => contrib.name === "InputEditorCommandArgumentHint");
    assert.ok(ctor, "InputEditorCommandArgumentHint should be registered as a chat widget contribution");
    return ctor;
  }
  function commandReference(range, argumentHint) {
    return {
      id: "agent-host-command:plan",
      range,
      data: { $mid: "agentHostCompletion", kind: "command" },
      _meta: { command: "plan", ...argumentHint !== void 0 ? { argumentHint } : {} }
    };
  }
  function run(value, variables, trigger = "parsedInput") {
    let captured = [];
    withTestCodeEditor(value, {}, (editor, _vm, instantiationService) => {
      const store = new DisposableStore();
      try {
        const realSet = editor.setDecorationsByType.bind(editor);
        editor.setDecorationsByType = ((desc, key, opts) => {
          if (key === "chat-command-argument-hint") {
            captured = opts;
          }
          return realSet(desc, key, opts);
        });
        const parsedInputEmitter = store.add(new Emitter());
        const referencesEmitter = store.add(new Emitter());
        const dynamicVariableModel = { variables, onDidChangeReferences: referencesEmitter.event };
        const widget = {
          inputEditor: editor,
          onDidChangeParsedInput: parsedInputEmitter.event,
          getContrib: (id) => id === ChatDynamicVariableModel.ID ? dynamicVariableModel : void 0
        };
        store.add(instantiationService.createInstance(getCtor(), widget));
        (trigger === "references" ? referencesEmitter : parsedInputEmitter).fire();
      } finally {
        store.dispose();
      }
    });
    return captured;
  }
  test("renders ghost text after a command with a trailing space and an argument hint", () => {
    const decorations = run("/plan ", [commandReference(new Range(1, 1, 1, 6), "task")]);
    assert.deepStrictEqual(decorations, [{
      range: { startLineNumber: 1, endLineNumber: 1, startColumn: 7, endColumn: 1e3 },
      renderOptions: { after: { contentText: "task", color: void 0 } }
    }]);
  });
  test("renders ghost text when only the references change (accepted completion, no parsed-input change)", () => {
    const decorations = run("/plan ", [commandReference(new Range(1, 1, 1, 6), "task")], "references");
    assert.deepStrictEqual(decorations, [{
      range: { startLineNumber: 1, endLineNumber: 1, startColumn: 7, endColumn: 1e3 },
      renderOptions: { after: { contentText: "task", color: void 0 } }
    }]);
  });
  test("renders nothing without an argument hint, once an argument is typed, or with leading text", () => {
    assert.deepStrictEqual(run("/plan ", [commandReference(new Range(1, 1, 1, 6), void 0)]), []);
    assert.deepStrictEqual(run("/plan task", [commandReference(new Range(1, 1, 1, 6), "task")]), []);
    assert.deepStrictEqual(run("hi /plan ", [commandReference(new Range(1, 4, 1, 9), "task")]), []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGVkaXRvclxcY2hhdElucHV0Q29tbWFuZEFyZ3VtZW50SGludC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElEZWNvcmF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IHdpdGhUZXN0Q29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2Jyb3dzZXIvdGVzdENvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUR5bmFtaWNWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVzLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0V2lkZ2V0LmpzJztcbmltcG9ydCB7IENoYXREeW5hbWljVmFyaWFibGVNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvYXR0YWNobWVudHMvY2hhdER5bmFtaWNWYXJpYWJsZXMuanMnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9pbnB1dC9lZGl0b3IvY2hhdElucHV0Q29tbWFuZEFyZ3VtZW50SGludC5qcyc7XG5cbnN1aXRlKCdJbnB1dEVkaXRvckNvbW1hbmRBcmd1bWVudEhpbnQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gZ2V0Q3RvcigpIHtcblx0XHRjb25zdCBjdG9yID0gQ2hhdFdpZGdldC5DT05UUklCUy5maW5kKGNvbnRyaWIgPT4gY29udHJpYi5uYW1lID09PSAnSW5wdXRFZGl0b3JDb21tYW5kQXJndW1lbnRIaW50Jyk7XG5cdFx0YXNzZXJ0Lm9rKGN0b3IsICdJbnB1dEVkaXRvckNvbW1hbmRBcmd1bWVudEhpbnQgc2hvdWxkIGJlIHJlZ2lzdGVyZWQgYXMgYSBjaGF0IHdpZGdldCBjb250cmlidXRpb24nKTtcblx0XHRyZXR1cm4gY3RvciE7XG5cdH1cblxuXHRmdW5jdGlvbiBjb21tYW5kUmVmZXJlbmNlKHJhbmdlOiBSYW5nZSwgYXJndW1lbnRIaW50OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJRHluYW1pY1ZhcmlhYmxlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6ICdhZ2VudC1ob3N0LWNvbW1hbmQ6cGxhbicsXG5cdFx0XHRyYW5nZSxcblx0XHRcdGRhdGE6IHsgJG1pZDogJ2FnZW50SG9zdENvbXBsZXRpb24nLCBraW5kOiAnY29tbWFuZCcgfSxcblx0XHRcdF9tZXRhOiB7IGNvbW1hbmQ6ICdwbGFuJywgLi4uKGFyZ3VtZW50SGludCAhPT0gdW5kZWZpbmVkID8geyBhcmd1bWVudEhpbnQgfSA6IHt9KSB9LFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBydW4odmFsdWU6IHN0cmluZywgdmFyaWFibGVzOiBJRHluYW1pY1ZhcmlhYmxlW10sIHRyaWdnZXI6ICdwYXJzZWRJbnB1dCcgfCAncmVmZXJlbmNlcycgPSAncGFyc2VkSW5wdXQnKTogSURlY29yYXRpb25PcHRpb25zW10ge1xuXHRcdGxldCBjYXB0dXJlZDogSURlY29yYXRpb25PcHRpb25zW10gPSBbXTtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IodmFsdWUsIHt9LCAoZWRpdG9yLCBfdm0sIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlYWxTZXQgPSBlZGl0b3Iuc2V0RGVjb3JhdGlvbnNCeVR5cGUuYmluZChlZGl0b3IpO1xuXHRcdFx0XHRlZGl0b3Iuc2V0RGVjb3JhdGlvbnNCeVR5cGUgPSAoKGRlc2M6IHN0cmluZywga2V5OiBzdHJpbmcsIG9wdHM6IElEZWNvcmF0aW9uT3B0aW9uc1tdKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGtleSA9PT0gJ2NoYXQtY29tbWFuZC1hcmd1bWVudC1oaW50Jykge1xuXHRcdFx0XHRcdFx0Y2FwdHVyZWQgPSBvcHRzO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gcmVhbFNldChkZXNjLCBrZXksIG9wdHMpO1xuXHRcdFx0XHR9KSBhcyB0eXBlb2YgZWRpdG9yLnNldERlY29yYXRpb25zQnlUeXBlO1xuXG5cdFx0XHRcdGNvbnN0IHBhcnNlZElucHV0RW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlc0VtaXR0ZXIgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0XHRcdGNvbnN0IGR5bmFtaWNWYXJpYWJsZU1vZGVsID0geyB2YXJpYWJsZXMsIG9uRGlkQ2hhbmdlUmVmZXJlbmNlczogcmVmZXJlbmNlc0VtaXR0ZXIuZXZlbnQgfSBhcyB1bmtub3duIGFzIENoYXREeW5hbWljVmFyaWFibGVNb2RlbDtcblx0XHRcdFx0Y29uc3Qgd2lkZ2V0ID0ge1xuXHRcdFx0XHRcdGlucHV0RWRpdG9yOiBlZGl0b3IsXG5cdFx0XHRcdFx0b25EaWRDaGFuZ2VQYXJzZWRJbnB1dDogcGFyc2VkSW5wdXRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRcdGdldENvbnRyaWI6IChpZDogc3RyaW5nKSA9PiBpZCA9PT0gQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsLklEID8gZHluYW1pY1ZhcmlhYmxlTW9kZWwgOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFdpZGdldDtcblxuXHRcdFx0XHRzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoZ2V0Q3RvcigpLCB3aWRnZXQpKTtcblx0XHRcdFx0KHRyaWdnZXIgPT09ICdyZWZlcmVuY2VzJyA/IHJlZmVyZW5jZXNFbWl0dGVyIDogcGFyc2VkSW5wdXRFbWl0dGVyKS5maXJlKCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGNhcHR1cmVkO1xuXHR9XG5cblx0dGVzdCgncmVuZGVycyBnaG9zdCB0ZXh0IGFmdGVyIGEgY29tbWFuZCB3aXRoIGEgdHJhaWxpbmcgc3BhY2UgYW5kIGFuIGFyZ3VtZW50IGhpbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSBydW4oJy9wbGFuICcsIFtjb21tYW5kUmVmZXJlbmNlKG5ldyBSYW5nZSgxLCAxLCAxLCA2KSwgJ3Rhc2snKV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVjb3JhdGlvbnMsIFt7XG5cdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIGVuZExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiA3LCBlbmRDb2x1bW46IDEwMDAgfSxcblx0XHRcdHJlbmRlck9wdGlvbnM6IHsgYWZ0ZXI6IHsgY29udGVudFRleHQ6ICd0YXNrJywgY29sb3I6IHVuZGVmaW5lZCB9IH1cblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmRlcnMgZ2hvc3QgdGV4dCB3aGVuIG9ubHkgdGhlIHJlZmVyZW5jZXMgY2hhbmdlIChhY2NlcHRlZCBjb21wbGV0aW9uLCBubyBwYXJzZWQtaW5wdXQgY2hhbmdlKScsICgpID0+IHtcblx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IHJ1bignL3BsYW4gJywgW2NvbW1hbmRSZWZlcmVuY2UobmV3IFJhbmdlKDEsIDEsIDEsIDYpLCAndGFzaycpXSwgJ3JlZmVyZW5jZXMnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRlY29yYXRpb25zLCBbe1xuXHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogNywgZW5kQ29sdW1uOiAxMDAwIH0sXG5cdFx0XHRyZW5kZXJPcHRpb25zOiB7IGFmdGVyOiB7IGNvbnRlbnRUZXh0OiAndGFzaycsIGNvbG9yOiB1bmRlZmluZWQgfSB9XG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5kZXJzIG5vdGhpbmcgd2l0aG91dCBhbiBhcmd1bWVudCBoaW50LCBvbmNlIGFuIGFyZ3VtZW50IGlzIHR5cGVkLCBvciB3aXRoIGxlYWRpbmcgdGV4dCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJ1bignL3BsYW4gJywgW2NvbW1hbmRSZWZlcmVuY2UobmV3IFJhbmdlKDEsIDEsIDEsIDYpLCB1bmRlZmluZWQpXSksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJ1bignL3BsYW4gdGFzaycsIFtjb21tYW5kUmVmZXJlbmNlKG5ldyBSYW5nZSgxLCAxLCAxLCA2KSwgJ3Rhc2snKV0pLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChydW4oJ2hpIC9wbGFuICcsIFtjb21tYW5kUmVmZXJlbmNlKG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgJ3Rhc2snKV0pLCBbXSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsYUFBYTtBQUV0QixTQUFTLDBCQUEwQjtBQUduQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdDQUFnQztBQUN6QyxPQUFPO0FBRVAsTUFBTSxrQ0FBa0MsTUFBTTtBQUU3QywwQ0FBd0M7QUFFeEMsV0FBUyxVQUFVO0FBQ2xCLFVBQU0sT0FBTyxXQUFXLFNBQVMsS0FBSyxhQUFXLFFBQVEsU0FBUyxnQ0FBZ0M7QUFDbEcsV0FBTyxHQUFHLE1BQU0sbUZBQW1GO0FBQ25HLFdBQU87QUFBQSxFQUNSO0FBRUEsV0FBUyxpQkFBaUIsT0FBYyxjQUFvRDtBQUMzRixXQUFPO0FBQUEsTUFDTixJQUFJO0FBQUEsTUFD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
