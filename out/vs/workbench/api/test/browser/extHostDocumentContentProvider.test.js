import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ExtHostDocumentsAndEditors } from "../../common/extHostDocumentsAndEditors.js";
import { SingleProxyRPCProtocol } from "../common/testRPCProtocol.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ExtHostDocumentContentProvider } from "../../common/extHostDocumentContentProviders.js";
import { Emitter } from "../../../../base/common/event.js";
import { timeout } from "../../../../base/common/async.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
suite("ExtHostDocumentContentProvider", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const resource = URI.parse("foo:bar");
  let documentContentProvider;
  let mainThreadContentProvider;
  const changes = [];
  setup(() => {
    changes.length = 0;
    mainThreadContentProvider = new class {
      $registerTextContentProvider(handle, scheme) {
      }
      $unregisterTextContentProvider(handle) {
      }
      async $onVirtualDocumentChange(uri, value) {
        await timeout(10);
        changes.push([uri, value]);
      }
      dispose() {
        throw new Error("Method not implemented.");
      }
    }();
    const ehContext = SingleProxyRPCProtocol(mainThreadContentProvider);
    const documentsAndEditors = new ExtHostDocumentsAndEditors(ehContext, new NullLogService());
    documentsAndEditors.$acceptDocumentsAndEditorsDelta({
      addedDocuments: [{
        isDirty: false,
        languageId: "foo",
        uri: resource,
        versionId: 1,
        lines: ["foo"],
        EOL: "\n",
        encoding: "utf8"
      }]
    });
    documentContentProvider = new ExtHostDocumentContentProvider(ehContext, documentsAndEditors, new NullLogService());
  });
  test("TextDocumentContentProvider drops onDidChange events when they happen quickly #179711", async () => {
    await runWithFakedTimers({}, async function() {
      const emitter = new Emitter();
      const contents = ["X", "Y"];
      let counter = 0;
      let stack = 0;
      const d = documentContentProvider.registerTextDocumentContentProvider(resource.scheme, {
        onDidChange: emitter.event,
        async provideTextDocumentContent(_uri) {
          assert.strictEqual(stack, 0);
          stack++;
          try {
            await timeout(0);
            return contents[counter++ % contents.length];
          } finally {
            stack--;
          }
        }
      });
      emitter.fire(resource);
      emitter.fire(resource);
      await timeout(100);
      assert.strictEqual(changes.length, 2);
      assert.strictEqual(changes[0][1], "X");
      assert.strictEqual(changes[1][1], "Y");
      d.dispose();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcZXh0SG9zdERvY3VtZW50Q29udGVudFByb3ZpZGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMuanMnO1xuaW1wb3J0IHsgU2luZ2xlUHJveHlSUENQcm90b2NvbCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudENvbnRlbnRQcm92aWRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RG9jdW1lbnRDb250ZW50UHJvdmlkZXJzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkRG9jdW1lbnRDb250ZW50UHJvdmlkZXJzU2hhcGUgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcblxuc3VpdGUoJ0V4dEhvc3REb2N1bWVudENvbnRlbnRQcm92aWRlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgnZm9vOmJhcicpO1xuXHRsZXQgZG9jdW1lbnRDb250ZW50UHJvdmlkZXI6IEV4dEhvc3REb2N1bWVudENvbnRlbnRQcm92aWRlcjtcblx0bGV0IG1haW5UaHJlYWRDb250ZW50UHJvdmlkZXI6IE1haW5UaHJlYWREb2N1bWVudENvbnRlbnRQcm92aWRlcnNTaGFwZTtcblx0Y29uc3QgY2hhbmdlczogW3VyaTogVXJpQ29tcG9uZW50cywgdmFsdWU6IHN0cmluZ11bXSA9IFtdO1xuXG5cdHNldHVwKCgpID0+IHtcblxuXHRcdGNoYW5nZXMubGVuZ3RoID0gMDtcblxuXHRcdG1haW5UaHJlYWRDb250ZW50UHJvdmlkZXIgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBNYWluVGhyZWFkRG9jdW1lbnRDb250ZW50UHJvdmlkZXJzU2hhcGUge1xuXHRcdFx0JHJlZ2lzdGVyVGV4dENvbnRlbnRQcm92aWRlcihoYW5kbGU6IG51bWJlciwgc2NoZW1lOiBzdHJpbmcpOiB2b2lkIHtcblxuXHRcdFx0fVxuXHRcdFx0JHVucmVnaXN0ZXJUZXh0Q29udGVudFByb3ZpZGVyKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cblx0XHRcdH1cblx0XHRcdGFzeW5jICRvblZpcnR1YWxEb2N1bWVudENoYW5nZSh1cmk6IFVyaUNvbXBvbmVudHMsIHZhbHVlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0XHRcdGNoYW5nZXMucHVzaChbdXJpLCB2YWx1ZV0pO1xuXHRcdFx0fVxuXHRcdFx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBlaENvbnRleHQgPSBTaW5nbGVQcm94eVJQQ1Byb3RvY29sKG1haW5UaHJlYWRDb250ZW50UHJvdmlkZXIpO1xuXHRcdGNvbnN0IGRvY3VtZW50c0FuZEVkaXRvcnMgPSBuZXcgRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMoZWhDb250ZXh0LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0ZG9jdW1lbnRzQW5kRWRpdG9ycy4kYWNjZXB0RG9jdW1lbnRzQW5kRWRpdG9yc0RlbHRhKHtcblx0XHRcdGFkZGVkRG9jdW1lbnRzOiBbe1xuXHRcdFx0XHRpc0RpcnR5OiBmYWxzZSxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogJ2ZvbycsXG5cdFx0XHRcdHVyaTogcmVzb3VyY2UsXG5cdFx0XHRcdHZlcnNpb25JZDogMSxcblx0XHRcdFx0bGluZXM6IFsnZm9vJ10sXG5cdFx0XHRcdEVPTDogJ1xcbicsXG5cdFx0XHRcdGVuY29kaW5nOiAndXRmOCdcblx0XHRcdH1dXG5cdFx0fSk7XG5cdFx0ZG9jdW1lbnRDb250ZW50UHJvdmlkZXIgPSBuZXcgRXh0SG9zdERvY3VtZW50Q29udGVudFByb3ZpZGVyKGVoQ29udGV4dCwgZG9jdW1lbnRzQW5kRWRpdG9ycywgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXh0RG9jdW1lbnRDb250ZW50UHJvdmlkZXIgZHJvcHMgb25EaWRDaGFuZ2UgZXZlbnRzIHdoZW4gdGhleSBoYXBwZW4gcXVpY2tseSAjMTc5NzExJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8VVJJPigpO1xuXHRcdFx0Y29uc3QgY29udGVudHMgPSBbJ1gnLCAnWSddO1xuXHRcdFx0bGV0IGNvdW50ZXIgPSAwO1xuXG5cdFx0XHRsZXQgc3RhY2sgPSAwO1xuXG5cdFx0XHRjb25zdCBkID0gZG9jdW1lbnRDb250ZW50UHJvdmlkZXIucmVnaXN0ZXJUZXh0RG9jdW1lbnRDb250ZW50UHJvdmlkZXIocmVzb3VyY2Uuc2NoZW1lLCB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlOiBlbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRhc3luYyBwcm92aWRlVGV4dERvY3VtZW50Q29udGVudChfdXJpKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YWNrLCAwKTtcblx0XHRcdFx0XHRzdGFjaysrO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGNvbnRlbnRzW2NvdW50ZXIrKyAlIGNvbnRlbnRzLmxlbmd0aF07XG5cdFx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRcdHN0YWNrLS07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0ZW1pdHRlci5maXJlKHJlc291cmNlKTtcblx0XHRcdGVtaXR0ZXIuZmlyZShyZXNvdXJjZSk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VzWzBdWzFdLCAnWCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXNbMV1bMV0sICdZJyk7XG5cblx0XHRcdGQuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQTBCO0FBQ25DLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsZUFBZTtBQUV4QixTQUFTLGVBQWU7QUFDeEIsU0FBUywwQkFBMEI7QUFFbkMsTUFBTSxrQ0FBa0MsTUFBTTtBQUU3QywwQ0FBd0M7QUFFeEMsUUFBTSxXQUFXLElBQUksTUFBTSxTQUFTO0FBQ3BDLE1BQUk7QUFDSixNQUFJO0FBQ0osUUFBTSxVQUFpRCxDQUFDO0FBRXhELFFBQU0sTUFBTTtBQUVYLFlBQVEsU0FBUztBQUVqQixnQ0FBNEIsSUFBSSxNQUF5RDtBQUFBLE1BQ3hGLDZCQUE2QixRQUFnQixRQUFzQjtBQUFBLE1BRW5FO0FBQUEsTUFDQSwrQkFBK0IsUUFBc0I7QUFBQSxNQUVyRDtBQUFBLE1BQ0EsTUFBTSx5QkFBeUIsS0FBb0IsT0FBOEI7QUFDaEYsY0FBTSxRQUFRLEVBQUU7QUFDaEIsZ0JBQVEsS0FBSyxDQUFDLEtBQUssS0FBSyxDQUFDO0FBQUEsTUFDMUI7QUFBQSxNQUNBLFVBQWdCO0FBQ2YsY0FBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsTUFDMUM7QUFBQSxJQUNEO0FBRUEsVUFBTSxZQUFZLHVCQUF1Qix5QkFBeUI7QUFDbEUsVUFBTSxzQkFBc0IsSUFBSSwyQkFBMkIsV0FBVyxJQUFJLGVBQWUsQ0FBQztBQUMxRix3QkFBb0IsZ0NBQWdDO0FBQUEsTUFDbkQsZ0JBQWdCLENBQUM7QUFBQSxRQUNoQixTQUFTO0FBQUEsUUFDVCxZQUFZO0FBQUEsUUFDWixLQUFLO0FBQUEsUUFDTCxXQUFXO0FBQUEsUUFDWCxPQUFPLENBQUMsS0FBSztBQUFBLFFBQ2IsS0FBSztBQUFBLFFBQ0wsVUFBVTtBQUFBLE1BQ1gsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUNELDhCQUEwQixJQUFJLCtCQUErQixXQUFXLHFCQUFxQixJQUFJLGVBQWUsQ0FBQztBQUFBLEVBQ2xILENBQUM7QUFFRCxPQUFLLHlGQUF5RixZQUFZO0FBQ3pHLFVBQU0sbUJBQW1CLENBQUMsR0FBRyxpQkFBa0I7QUFFOUMsWUFBTSxVQUFVLElBQUksUUFBYTtBQUNqQyxZQUFNLFdBQVcsQ0FBQyxLQUFLLEdBQUc7QUFDMUIsVUFBSSxVQUFVO0FBRWQsVUFBSSxRQUFRO0FBRVosWUFBTSxJQUFJLHdCQUF3QixvQ0FBb0MsU0FBUyxRQUFRO0FBQUEsUUFDdEYsYUFBYSxRQUFRO0FBQUEsUUFDckIsTUFBTSwyQkFBMkIsTUFBTTtBQUN0QyxpQkFBTyxZQUFZLE9BQU8sQ0FBQztBQUMzQjtBQUNBLGNBQUk7QUFDSCxrQkFBTSxRQUFRLENBQUM7QUFDZixtQkFBTyxTQUFTLFlBQVksU0FBUyxNQUFNO0FBQUEsVUFDNUMsVUFBRTtBQUNEO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxjQUFRLEtBQUssUUFBUTtBQUNyQixjQUFRLEtBQUssUUFBUTtBQUVyQixZQUFNLFFBQVEsR0FBRztBQUVqQixhQUFPLFlBQVksUUFBUSxRQUFRLENBQUM7QUFDcEMsYUFBTyxZQUFZLFFBQVEsQ0FBQyxFQUFFLENBQUMsR0FBRyxHQUFHO0FBQ3JDLGFBQU8sWUFBWSxRQUFRLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRztBQUVyQyxRQUFFLFFBQVE7QUFBQSxJQUNYLENBQUM7QUFBQSxFQUNGLENBQUM7QUFHRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
