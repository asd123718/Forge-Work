import assert from "assert";
import { constObservable } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { isResourceMultiDiffEditorInput } from "../../../../common/editor.js";
import { EditorChatResponseFileChangesService } from "../../browser/editorChatResponseFileChangesService.js";
suite("EditorChatResponseFileChangesService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("opens request changes in a standalone multi-diff editor", () => {
    let opened;
    const editorService = new class extends mock() {
      async openEditor(...args) {
        opened = args[0];
        return void 0;
      }
    }();
    const service = disposables.add(new EditorChatResponseFileChangesService(editorService));
    disposables.add(service.registerProvider("test", {
      getChangesForRequest: (_sessionResource, requestId) => requestId === "request" ? constObservable([{
        originalURI: URI.file("/before.ts"),
        modifiedURI: URI.file("/after.ts"),
        added: 2,
        removed: 1,
        quitEarly: false,
        identical: false,
        isFinal: true,
        isBusy: false
      }, {
        originalURI: URI.file("/deleted-before.ts"),
        modifiedURI: URI.file("/deleted.ts"),
        isDeleted: true,
        added: 0,
        removed: 3,
        quitEarly: false,
        identical: false,
        isFinal: true,
        isBusy: false
      }]) : void 0
    }));
    service.openChangesForRequest(URI.parse("test:session"), "request", { isLastTurn: false });
    service.openChangesForRequest(URI.parse("test:session"), "missing", { isLastTurn: true });
    assert.ok(isResourceMultiDiffEditorInput(opened));
    assert.deepStrictEqual({
      label: opened.label,
      resources: opened.resources?.map((resource) => ({
        original: resource.original.resource?.toString(),
        modified: resource.modified.resource?.toString()
      }))
    }, {
      label: "Turn File Changes",
      resources: [{
        original: "file:///before.ts",
        modified: "file:///after.ts"
      }, {
        original: "file:///deleted-before.ts",
        modified: void 0
      }]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGlzUmVzb3VyY2VNdWx0aURpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9lZGl0b3JDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UuanMnO1xuXG5zdWl0ZSgnRWRpdG9yQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ29wZW5zIHJlcXVlc3QgY2hhbmdlcyBpbiBhIHN0YW5kYWxvbmUgbXVsdGktZGlmZiBlZGl0b3InLCAoKSA9PiB7XG5cdFx0bGV0IG9wZW5lZDogdW5rbm93bjtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBvcGVuRWRpdG9yKC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dW5kZWZpbmVkPiB7XG5cdFx0XHRcdG9wZW5lZCA9IGFyZ3NbMF07XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSgpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVkaXRvckNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZShlZGl0b3JTZXJ2aWNlKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcigndGVzdCcsIHtcblx0XHRcdGdldENoYW5nZXNGb3JSZXF1ZXN0OiAoX3Nlc3Npb25SZXNvdXJjZSwgcmVxdWVzdElkKSA9PiByZXF1ZXN0SWQgPT09ICdyZXF1ZXN0J1xuXHRcdFx0XHQ/IGNvbnN0T2JzZXJ2YWJsZShbe1xuXHRcdFx0XHRcdG9yaWdpbmFsVVJJOiBVUkkuZmlsZSgnL2JlZm9yZS50cycpLFxuXHRcdFx0XHRcdG1vZGlmaWVkVVJJOiBVUkkuZmlsZSgnL2FmdGVyLnRzJyksXG5cdFx0XHRcdFx0YWRkZWQ6IDIsXG5cdFx0XHRcdFx0cmVtb3ZlZDogMSxcblx0XHRcdFx0XHRxdWl0RWFybHk6IGZhbHNlLFxuXHRcdFx0XHRcdGlkZW50aWNhbDogZmFsc2UsXG5cdFx0XHRcdFx0aXNGaW5hbDogdHJ1ZSxcblx0XHRcdFx0XHRpc0J1c3k6IGZhbHNlLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0b3JpZ2luYWxVUkk6IFVSSS5maWxlKCcvZGVsZXRlZC1iZWZvcmUudHMnKSxcblx0XHRcdFx0XHRtb2RpZmllZFVSSTogVVJJLmZpbGUoJy9kZWxldGVkLnRzJyksXG5cdFx0XHRcdFx0aXNEZWxldGVkOiB0cnVlLFxuXHRcdFx0XHRcdGFkZGVkOiAwLFxuXHRcdFx0XHRcdHJlbW92ZWQ6IDMsXG5cdFx0XHRcdFx0cXVpdEVhcmx5OiBmYWxzZSxcblx0XHRcdFx0XHRpZGVudGljYWw6IGZhbHNlLFxuXHRcdFx0XHRcdGlzRmluYWw6IHRydWUsXG5cdFx0XHRcdFx0aXNCdXN5OiBmYWxzZSxcblx0XHRcdFx0fV0pXG5cdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdH0pKTtcblxuXHRcdHNlcnZpY2Uub3BlbkNoYW5nZXNGb3JSZXF1ZXN0KFVSSS5wYXJzZSgndGVzdDpzZXNzaW9uJyksICdyZXF1ZXN0JywgeyBpc0xhc3RUdXJuOiBmYWxzZSB9KTtcblx0XHRzZXJ2aWNlLm9wZW5DaGFuZ2VzRm9yUmVxdWVzdChVUkkucGFyc2UoJ3Rlc3Q6c2Vzc2lvbicpLCAnbWlzc2luZycsIHsgaXNMYXN0VHVybjogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5vayhpc1Jlc291cmNlTXVsdGlEaWZmRWRpdG9ySW5wdXQob3BlbmVkKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsYWJlbDogb3BlbmVkLmxhYmVsLFxuXHRcdFx0cmVzb3VyY2VzOiBvcGVuZWQucmVzb3VyY2VzPy5tYXAocmVzb3VyY2UgPT4gKHtcblx0XHRcdFx0b3JpZ2luYWw6IHJlc291cmNlLm9yaWdpbmFsLnJlc291cmNlPy50b1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZDogcmVzb3VyY2UubW9kaWZpZWQucmVzb3VyY2U/LnRvU3RyaW5nKCksXG5cdFx0XHR9KSksXG5cdFx0fSwge1xuXHRcdFx0bGFiZWw6ICdUdXJuIEZpbGUgQ2hhbmdlcycsXG5cdFx0XHRyZXNvdXJjZXM6IFt7XG5cdFx0XHRcdG9yaWdpbmFsOiAnZmlsZTovLy9iZWZvcmUudHMnLFxuXHRcdFx0XHRtb2RpZmllZDogJ2ZpbGU6Ly8vYWZ0ZXIudHMnLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRvcmlnaW5hbDogJ2ZpbGU6Ly8vZGVsZXRlZC1iZWZvcmUudHMnLFxuXHRcdFx0XHRtb2RpZmllZDogdW5kZWZpbmVkLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNDQUFzQztBQUUvQyxTQUFTLDRDQUE0QztBQUVyRCxNQUFNLHdDQUF3QyxNQUFNO0FBQ25ELFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsT0FBSywyREFBMkQsTUFBTTtBQUNyRSxRQUFJO0FBQ0osVUFBTSxnQkFBZ0IsSUFBSSxjQUFjLEtBQXFCLEVBQUU7QUFBQSxNQUM5RCxNQUFlLGNBQWMsTUFBcUM7QUFDakUsaUJBQVMsS0FBSyxDQUFDO0FBQ2YsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELEVBQUU7QUFDRixVQUFNLFVBQVUsWUFBWSxJQUFJLElBQUkscUNBQXFDLGFBQWEsQ0FBQztBQUN2RixnQkFBWSxJQUFJLFFBQVEsaUJBQWlCLFFBQVE7QUFBQSxNQUNoRCxzQkFBc0IsQ0FBQyxrQkFBa0IsY0FBYyxjQUFjLFlBQ2xFLGdCQUFnQixDQUFDO0FBQUEsUUFDbEIsYUFBYSxJQUFJLEtBQUssWUFBWTtBQUFBLFFBQ2xDLGFBQWEsSUFBSSxLQUFLLFdBQVc7QUFBQSxRQUNqQyxPQUFPO0FBQUEsUUFDUCxTQUFTO0FBQUEsUUFDVCxXQUFXO0FBQUEsUUFDWCxXQUFXO0FBQUEsUUFDWCxTQUFTO0FBQUEsUUFDVCxRQUFRO0FBQUEsTUFDVCxHQUFHO0FBQUEsUUFDRixhQUFhLElBQUksS0FBSyxvQkFBb0I7QUFBQSxRQUMxQyxhQUFhLElBQUksS0FBSyxhQUFhO0FBQUEsUUFDbkMsV0FBVztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsU0FBUztBQUFBLFFBQ1QsV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsU0FBUztBQUFBLFFBQ1QsUUFBUTtBQUFBLE1BQ1QsQ0FBQyxDQUFDLElBQ0E7QUFBQSxJQUNKLENBQUMsQ0FBQztBQUVGLFlBQVEsc0JBQXNCLElBQUksTUFBTSxjQUFjLEdBQUcsV0FBVyxFQUFFLFlBQVksTUFBTSxDQUFDO0FBQ3pGLFlBQVEsc0JBQXNCLElBQUksTUFBTSxjQUFjLEdBQUcsV0FBVyxFQUFFLFlBQVksS0FBSyxDQUFDO0FBRXhGLFdBQU8sR0FBRywrQkFBK0IsTUFBTSxDQUFDO0FBQ2hELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsT0FBTyxPQUFPO0FBQUEsTUFDZCxXQUFXLE9BQU8sV0FBVyxJQUFJLGVBQWE7QUFBQSxRQUM3QyxVQUFVLFNBQVMsU0FBUyxVQUFVLFNBQVM7QUFBQSxRQUMvQyxVQUFVLFNBQVMsU0FBUyxVQUFVLFNBQVM7QUFBQSxNQUNoRCxFQUFFO0FBQUEsSUFDSCxHQUFHO0FBQUEsTUFDRixPQUFPO0FBQUEsTUFDUCxXQUFXLENBQUM7QUFBQSxRQUNYLFVBQVU7QUFBQSxRQUNWLFVBQVU7QUFBQSxNQUNYLEdBQUc7QUFBQSxRQUNGLFVBQVU7QUFBQSxRQUNWLFVBQVU7QUFBQSxNQUNYLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
