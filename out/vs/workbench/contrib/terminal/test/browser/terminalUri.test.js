import { deepStrictEqual, strictEqual } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { getInstanceFromResource, getTerminalResourcesFromDragEvent, getTerminalUri } from "../../browser/terminalUri.js";
function fakeDragEvent(data) {
  return {
    dataTransfer: {
      getData: () => {
        return data;
      }
    }
  };
}
suite("terminalUri", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getTerminalResourcesFromDragEvent", () => {
    test("should give undefined when no terminal resources is in event", () => {
      deepStrictEqual(
        getTerminalResourcesFromDragEvent(fakeDragEvent(""))?.map((e) => e.toString()),
        void 0
      );
    });
    test("should give undefined when an empty terminal resources array is in event", () => {
      deepStrictEqual(
        getTerminalResourcesFromDragEvent(fakeDragEvent("[]"))?.map((e) => e.toString()),
        void 0
      );
    });
    test("should return terminal resource when event contains one", () => {
      deepStrictEqual(
        getTerminalResourcesFromDragEvent(fakeDragEvent('["vscode-terminal:/1626874386474/3"]'))?.map((e) => e.toString()),
        ["vscode-terminal:/1626874386474/3"]
      );
    });
    test("should return multiple terminal resources when event contains multiple", () => {
      deepStrictEqual(
        getTerminalResourcesFromDragEvent(fakeDragEvent('["vscode-terminal:/foo/1","vscode-terminal:/bar/2"]'))?.map((e) => e.toString()),
        ["vscode-terminal:/foo/1", "vscode-terminal:/bar/2"]
      );
    });
  });
  suite("getInstanceFromResource", () => {
    test("should return undefined if there is no match", () => {
      strictEqual(
        getInstanceFromResource([
          { resource: getTerminalUri("workspace", 2, "title") }
        ], getTerminalUri("workspace", 1, "title")),
        void 0
      );
    });
    test("should return a result if there is a match", () => {
      const instance = { resource: getTerminalUri("workspace", 2, "title") };
      strictEqual(
        getInstanceFromResource([
          { resource: getTerminalUri("workspace", 1, "title") },
          instance,
          { resource: getTerminalUri("workspace", 3, "title") }
        ], getTerminalUri("workspace", 2, "title")),
        instance
      );
    });
    test("should ignore the fragment", () => {
      const instance = { resource: getTerminalUri("workspace", 2, "title") };
      strictEqual(
        getInstanceFromResource([
          { resource: getTerminalUri("workspace", 1, "title") },
          instance,
          { resource: getTerminalUri("workspace", 3, "title") }
        ], getTerminalUri("workspace", 2, "does not match!")),
        instance
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFx0ZXN0XFxicm93c2VyXFx0ZXJtaW5hbFVyaS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGdldEluc3RhbmNlRnJvbVJlc291cmNlLCBnZXRUZXJtaW5hbFJlc291cmNlc0Zyb21EcmFnRXZlbnQsIGdldFRlcm1pbmFsVXJpLCBJUGFydGlhbERyYWdFdmVudCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWxVcmkuanMnO1xuXG5mdW5jdGlvbiBmYWtlRHJhZ0V2ZW50KGRhdGE6IHN0cmluZyk6IElQYXJ0aWFsRHJhZ0V2ZW50IHtcblx0cmV0dXJuIHtcblx0XHRkYXRhVHJhbnNmZXI6IHtcblx0XHRcdGdldERhdGE6ICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIGRhdGE7XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xufVxuXG5zdWl0ZSgndGVybWluYWxVcmknLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdnZXRUZXJtaW5hbFJlc291cmNlc0Zyb21EcmFnRXZlbnQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGdpdmUgdW5kZWZpbmVkIHdoZW4gbm8gdGVybWluYWwgcmVzb3VyY2VzIGlzIGluIGV2ZW50JywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRUZXJtaW5hbFJlc291cmNlc0Zyb21EcmFnRXZlbnQoZmFrZURyYWdFdmVudCgnJykpPy5tYXAoZSA9PiBlLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIGdpdmUgdW5kZWZpbmVkIHdoZW4gYW4gZW1wdHkgdGVybWluYWwgcmVzb3VyY2VzIGFycmF5IGlzIGluIGV2ZW50JywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRUZXJtaW5hbFJlc291cmNlc0Zyb21EcmFnRXZlbnQoZmFrZURyYWdFdmVudCgnW10nKSk/Lm1hcChlID0+IGUudG9TdHJpbmcoKSksXG5cdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHRlcm1pbmFsIHJlc291cmNlIHdoZW4gZXZlbnQgY29udGFpbnMgb25lJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRUZXJtaW5hbFJlc291cmNlc0Zyb21EcmFnRXZlbnQoZmFrZURyYWdFdmVudCgnW1widnNjb2RlLXRlcm1pbmFsOi8xNjI2ODc0Mzg2NDc0LzNcIl0nKSk/Lm1hcChlID0+IGUudG9TdHJpbmcoKSksXG5cdFx0XHRcdFsndnNjb2RlLXRlcm1pbmFsOi8xNjI2ODc0Mzg2NDc0LzMnXVxuXHRcdFx0KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIG11bHRpcGxlIHRlcm1pbmFsIHJlc291cmNlcyB3aGVuIGV2ZW50IGNvbnRhaW5zIG11bHRpcGxlJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRUZXJtaW5hbFJlc291cmNlc0Zyb21EcmFnRXZlbnQoZmFrZURyYWdFdmVudCgnW1widnNjb2RlLXRlcm1pbmFsOi9mb28vMVwiLFwidnNjb2RlLXRlcm1pbmFsOi9iYXIvMlwiXScpKT8ubWFwKGUgPT4gZS50b1N0cmluZygpKSxcblx0XHRcdFx0Wyd2c2NvZGUtdGVybWluYWw6L2Zvby8xJywgJ3ZzY29kZS10ZXJtaW5hbDovYmFyLzInXVxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cdHN1aXRlKCdnZXRJbnN0YW5jZUZyb21SZXNvdXJjZScsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBpZiB0aGVyZSBpcyBubyBtYXRjaCcsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRJbnN0YW5jZUZyb21SZXNvdXJjZShbXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogZ2V0VGVybWluYWxVcmkoJ3dvcmtzcGFjZScsIDIsICd0aXRsZScpIH1cblx0XHRcdFx0XSwgZ2V0VGVybWluYWxVcmkoJ3dvcmtzcGFjZScsIDEsICd0aXRsZScpKSxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gYSByZXN1bHQgaWYgdGhlcmUgaXMgYSBtYXRjaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0geyByZXNvdXJjZTogZ2V0VGVybWluYWxVcmkoJ3dvcmtzcGFjZScsIDIsICd0aXRsZScpIH07XG5cdFx0XHRzdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0SW5zdGFuY2VGcm9tUmVzb3VyY2UoW1xuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IGdldFRlcm1pbmFsVXJpKCd3b3Jrc3BhY2UnLCAxLCAndGl0bGUnKSB9LFxuXHRcdFx0XHRcdGluc3RhbmNlLFxuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IGdldFRlcm1pbmFsVXJpKCd3b3Jrc3BhY2UnLCAzLCAndGl0bGUnKSB9XG5cdFx0XHRcdF0sIGdldFRlcm1pbmFsVXJpKCd3b3Jrc3BhY2UnLCAyLCAndGl0bGUnKSksXG5cdFx0XHRcdGluc3RhbmNlXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBpZ25vcmUgdGhlIGZyYWdtZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSB7IHJlc291cmNlOiBnZXRUZXJtaW5hbFVyaSgnd29ya3NwYWNlJywgMiwgJ3RpdGxlJykgfTtcblx0XHRcdHN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRJbnN0YW5jZUZyb21SZXNvdXJjZShbXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogZ2V0VGVybWluYWxVcmkoJ3dvcmtzcGFjZScsIDEsICd0aXRsZScpIH0sXG5cdFx0XHRcdFx0aW5zdGFuY2UsXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogZ2V0VGVybWluYWxVcmkoJ3dvcmtzcGFjZScsIDMsICd0aXRsZScpIH1cblx0XHRcdFx0XSwgZ2V0VGVybWluYWxVcmkoJ3dvcmtzcGFjZScsIDIsICdkb2VzIG5vdCBtYXRjaCEnKSksXG5cdFx0XHRcdGluc3RhbmNlXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUIsbUJBQW1CO0FBQzdDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMseUJBQXlCLG1DQUFtQyxzQkFBeUM7QUFFOUcsU0FBUyxjQUFjLE1BQWlDO0FBQ3ZELFNBQU87QUFBQSxJQUNOLGNBQWM7QUFBQSxNQUNiLFNBQVMsTUFBTTtBQUNkLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0sZUFBZSxNQUFNO0FBQzFCLDBDQUF3QztBQUV4QyxRQUFNLHFDQUFxQyxNQUFNO0FBQ2hELFNBQUssZ0VBQWdFLE1BQU07QUFDMUU7QUFBQSxRQUNDLGtDQUFrQyxjQUFjLEVBQUUsQ0FBQyxHQUFHLElBQUksT0FBSyxFQUFFLFNBQVMsQ0FBQztBQUFBLFFBQzNFO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUNELFNBQUssNEVBQTRFLE1BQU07QUFDdEY7QUFBQSxRQUNDLGtDQUFrQyxjQUFjLElBQUksQ0FBQyxHQUFHLElBQUksT0FBSyxFQUFFLFNBQVMsQ0FBQztBQUFBLFFBQzdFO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUNELFNBQUssMkRBQTJELE1BQU07QUFDckU7QUFBQSxRQUNDLGtDQUFrQyxjQUFjLHNDQUFzQyxDQUFDLEdBQUcsSUFBSSxPQUFLLEVBQUUsU0FBUyxDQUFDO0FBQUEsUUFDL0csQ0FBQyxrQ0FBa0M7QUFBQSxNQUNwQztBQUFBLElBQ0QsQ0FBQztBQUNELFNBQUssMEVBQTBFLE1BQU07QUFDcEY7QUFBQSxRQUNDLGtDQUFrQyxjQUFjLHFEQUFxRCxDQUFDLEdBQUcsSUFBSSxPQUFLLEVBQUUsU0FBUyxDQUFDO0FBQUEsUUFDOUgsQ0FBQywwQkFBMEIsd0JBQXdCO0FBQUEsTUFDcEQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRCxRQUFNLDJCQUEyQixNQUFNO0FBQ3RDLFNBQUssZ0RBQWdELE1BQU07QUFDMUQ7QUFBQSxRQUNDLHdCQUF3QjtBQUFBLFVBQ3ZCLEVBQUUsVUFBVSxlQUFlLGFBQWEsR0FBRyxPQUFPLEVBQUU7QUFBQSxRQUNyRCxHQUFHLGVBQWUsYUFBYSxHQUFHLE9BQU8sQ0FBQztBQUFBLFFBQzFDO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUNELFNBQUssOENBQThDLE1BQU07QUFDeEQsWUFBTSxXQUFXLEVBQUUsVUFBVSxlQUFlLGFBQWEsR0FBRyxPQUFPLEVBQUU7QUFDckU7QUFBQSxRQUNDLHdCQUF3QjtBQUFBLFVBQ3ZCLEVBQUUsVUFBVSxlQUFlLGFBQWEsR0FBRyxPQUFPLEVBQUU7QUFBQSxVQUNwRDtBQUFBLFVBQ0EsRUFBRSxVQUFVLGVBQWUsYUFBYSxHQUFHLE9BQU8sRUFBRTtBQUFBLFFBQ3JELEdBQUcsZUFBZSxhQUFhLEdBQUcsT0FBTyxDQUFDO0FBQUEsUUFDMUM7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQ0QsU0FBSyw4QkFBOEIsTUFBTTtBQUN4QyxZQUFNLFdBQVcsRUFBRSxVQUFVLGVBQWUsYUFBYSxHQUFHLE9BQU8sRUFBRTtBQUNyRTtBQUFBLFFBQ0Msd0JBQXdCO0FBQUEsVUFDdkIsRUFBRSxVQUFVLGVBQWUsYUFBYSxHQUFHLE9BQU8sRUFBRTtBQUFBLFVBQ3BEO0FBQUEsVUFDQSxFQUFFLFVBQVUsZUFBZSxhQUFhLEdBQUcsT0FBTyxFQUFFO0FBQUEsUUFDckQsR0FBRyxlQUFlLGFBQWEsR0FBRyxpQkFBaUIsQ0FBQztBQUFBLFFBQ3BEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
