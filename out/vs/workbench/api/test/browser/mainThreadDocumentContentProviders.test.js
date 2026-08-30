import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { MainThreadDocumentContentProviders } from "../../browser/mainThreadDocumentContentProviders.js";
import { createTextModel } from "../../../../editor/test/common/testTextModel.js";
import { mock } from "../../../../base/test/common/mock.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("MainThreadDocumentContentProviders", function() {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("events are processed properly", function() {
    const uri = URI.parse("test:uri");
    const model = createTextModel("1", void 0, void 0, uri);
    const providers = new MainThreadDocumentContentProviders(
      new TestRPCProtocol(),
      null,
      null,
      new class extends mock() {
        getModel(_uri) {
          assert.strictEqual(uri.toString(), _uri.toString());
          return model;
        }
      }(),
      new class extends mock() {
        computeMoreMinimalEdits(_uri, data) {
          assert.strictEqual(model.getValue(), "1");
          return Promise.resolve(data);
        }
      }()
    );
    store.add(model);
    store.add(providers);
    return new Promise((resolve, reject) => {
      let expectedEvents = 1;
      store.add(model.onDidChangeContent((e) => {
        expectedEvents -= 1;
        try {
          assert.ok(expectedEvents >= 0);
        } catch (err) {
          reject(err);
        }
        if (model.getValue() === "1\n2\n3") {
          model.dispose();
          resolve();
        }
      }));
      providers.$onVirtualDocumentChange(uri, "1\n2");
      providers.$onVirtualDocumentChange(uri, "1\n2\n3");
    });
  });
  test("model disposed during async operation", async function() {
    const uri = URI.parse("test:disposed");
    const model = createTextModel("initial", void 0, void 0, uri);
    let disposeModelDuringEdit = false;
    const providers = new MainThreadDocumentContentProviders(
      new TestRPCProtocol(),
      null,
      null,
      new class extends mock() {
        getModel(_uri) {
          assert.strictEqual(uri.toString(), _uri.toString());
          return model;
        }
      }(),
      new class extends mock() {
        async computeMoreMinimalEdits(_uri, data) {
          await new Promise((resolve) => setTimeout(resolve, 10));
          if (disposeModelDuringEdit) {
            model.dispose();
          }
          return data;
        }
      }()
    );
    store.add(model);
    store.add(providers);
    await providers.$onVirtualDocumentChange(uri, "updated");
    assert.strictEqual(model.getValue(), "updated");
    disposeModelDuringEdit = true;
    await providers.$onVirtualDocumentChange(uri, "should not apply");
    assert.ok(model.isDisposed());
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcbWFpblRocmVhZERvY3VtZW50Q29udGVudFByb3ZpZGVycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWREb2N1bWVudENvbnRlbnRQcm92aWRlcnMgfSBmcm9tICcuLi8uLi9icm93c2VyL21haW5UaHJlYWREb2N1bWVudENvbnRlbnRQcm92aWRlcnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZWRpdG9yV29ya2VyLmpzJztcbmltcG9ydCB7IFRlc3RSUENQcm90b2NvbCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ01haW5UaHJlYWREb2N1bWVudENvbnRlbnRQcm92aWRlcnMnLCBmdW5jdGlvbiAoKSB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdldmVudHMgYXJlIHByb2Nlc3NlZCBwcm9wZXJseScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgndGVzdDp1cmknKTtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnMScsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1cmkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXJzID0gbmV3IE1haW5UaHJlYWREb2N1bWVudENvbnRlbnRQcm92aWRlcnMobmV3IFRlc3RSUENQcm90b2NvbCgpLCBudWxsISwgbnVsbCEsXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNb2RlbFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBnZXRNb2RlbChfdXJpOiBVUkkpIHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnRvU3RyaW5nKCksIF91cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0cmV0dXJuIG1vZGVsO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yV29ya2VyU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGNvbXB1dGVNb3JlTWluaW1hbEVkaXRzKF91cmk6IFVSSSwgZGF0YTogVGV4dEVkaXRbXSB8IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnMScpO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZGF0YSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0KTtcblxuXHRcdHN0b3JlLmFkZChtb2RlbCk7XG5cdFx0c3RvcmUuYWRkKHByb3ZpZGVycyk7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0bGV0IGV4cGVjdGVkRXZlbnRzID0gMTtcblx0XHRcdHN0b3JlLmFkZChtb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoZSA9PiB7XG5cdFx0XHRcdGV4cGVjdGVkRXZlbnRzIC09IDE7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGV4cGVjdGVkRXZlbnRzID49IDApO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRyZWplY3QoZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobW9kZWwuZ2V0VmFsdWUoKSA9PT0gJzFcXG4yXFxuMycpIHtcblx0XHRcdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRwcm92aWRlcnMuJG9uVmlydHVhbERvY3VtZW50Q2hhbmdlKHVyaSwgJzFcXG4yJyk7XG5cdFx0XHRwcm92aWRlcnMuJG9uVmlydHVhbERvY3VtZW50Q2hhbmdlKHVyaSwgJzFcXG4yXFxuMycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCBkaXNwb3NlZCBkdXJpbmcgYXN5bmMgb3BlcmF0aW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgndGVzdDpkaXNwb3NlZCcpO1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdpbml0aWFsJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVyaSk7XG5cblx0XHRsZXQgZGlzcG9zZU1vZGVsRHVyaW5nRWRpdCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXJzID0gbmV3IE1haW5UaHJlYWREb2N1bWVudENvbnRlbnRQcm92aWRlcnMobmV3IFRlc3RSUENQcm90b2NvbCgpLCBudWxsISwgbnVsbCEsXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNb2RlbFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBnZXRNb2RlbChfdXJpOiBVUkkpIHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnRvU3RyaW5nKCksIF91cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0cmV0dXJuIG1vZGVsO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yV29ya2VyU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGNvbXB1dGVNb3JlTWluaW1hbEVkaXRzKF91cmk6IFVSSSwgZGF0YTogVGV4dEVkaXRbXSB8IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdC8vIFNpbXVsYXRlIGFzeW5jIG9wZXJhdGlvblxuXHRcdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMCkpO1xuXG5cdFx0XHRcdFx0Ly8gRGlzcG9zZSBtb2RlbCBkdXJpbmcgdGhlIGFzeW5jIG9wZXJhdGlvbiBpZiBmbGFnIGlzIHNldFxuXHRcdFx0XHRcdGlmIChkaXNwb3NlTW9kZWxEdXJpbmdFZGl0KSB7XG5cdFx0XHRcdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIGRhdGE7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0KTtcblxuXHRcdHN0b3JlLmFkZChtb2RlbCk7XG5cdFx0c3RvcmUuYWRkKHByb3ZpZGVycyk7XG5cblx0XHQvLyBGaXJzdCBjYWxsIHNob3VsZCB3b3JrIG5vcm1hbGx5XG5cdFx0YXdhaXQgcHJvdmlkZXJzLiRvblZpcnR1YWxEb2N1bWVudENoYW5nZSh1cmksICd1cGRhdGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICd1cGRhdGVkJyk7XG5cblx0XHQvLyBTZWNvbmQgY2FsbCBzaG91bGQgbm90IHRocm93IGV2ZW4gdGhvdWdoIG1vZGVsIGdldHMgZGlzcG9zZWQgZHVyaW5nIGFzeW5jIG9wZXJhdGlvblxuXHRcdGRpc3Bvc2VNb2RlbER1cmluZ0VkaXQgPSB0cnVlO1xuXHRcdGF3YWl0IHByb3ZpZGVycy4kb25WaXJ0dWFsRG9jdW1lbnRDaGFuZ2UodXJpLCAnc2hvdWxkIG5vdCBhcHBseScpO1xuXG5cdFx0Ly8gTW9kZWwgc2hvdWxkIGJlIGRpc3Bvc2VkIGFuZCB2YWx1ZSB1bmNoYW5nZWRcblx0XHRhc3NlcnQub2sobW9kZWwuaXNEaXNwb3NlZCgpKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxZQUFZO0FBR3JCLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sc0NBQXNDLFdBQVk7QUFFdkQsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxPQUFLLGlDQUFpQyxXQUFZO0FBRWpELFVBQU0sTUFBTSxJQUFJLE1BQU0sVUFBVTtBQUNoQyxVQUFNLFFBQVEsZ0JBQWdCLEtBQUss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
