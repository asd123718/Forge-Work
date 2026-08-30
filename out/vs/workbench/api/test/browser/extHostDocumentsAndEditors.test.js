import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ExtHostDocumentsAndEditors } from "../../common/extHostDocumentsAndEditors.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("ExtHostDocumentsAndEditors", () => {
  let editors;
  setup(function() {
    editors = new ExtHostDocumentsAndEditors(new TestRPCProtocol(), new NullLogService());
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("The value of TextDocument.isClosed is incorrect when a text document is closed, #27949", () => {
    editors.$acceptDocumentsAndEditorsDelta({
      addedDocuments: [{
        EOL: "\n",
        isDirty: true,
        languageId: "fooLang",
        uri: URI.parse("foo:bar"),
        versionId: 1,
        lines: [
          "first",
          "second"
        ],
        encoding: "utf8"
      }]
    });
    return new Promise((resolve, reject) => {
      const d = editors.onDidRemoveDocuments((e) => {
        try {
          for (const data of e) {
            assert.strictEqual(data.document.isClosed, true);
          }
          resolve(void 0);
        } catch (e2) {
          reject(e2);
        } finally {
          d.dispose();
        }
      });
      editors.$acceptDocumentsAndEditorsDelta({
        removedDocuments: [URI.parse("foo:bar")]
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy5qcyc7XG5pbXBvcnQgeyBUZXN0UlBDUHJvdG9jb2wgfSBmcm9tICcuLi9jb21tb24vdGVzdFJQQ1Byb3RvY29sLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycycsICgpID0+IHtcblxuXHRsZXQgZWRpdG9yczogRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnM7XG5cblx0c2V0dXAoZnVuY3Rpb24gKCkge1xuXHRcdGVkaXRvcnMgPSBuZXcgRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMobmV3IFRlc3RSUENQcm90b2NvbCgpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ1RoZSB2YWx1ZSBvZiBUZXh0RG9jdW1lbnQuaXNDbG9zZWQgaXMgaW5jb3JyZWN0IHdoZW4gYSB0ZXh0IGRvY3VtZW50IGlzIGNsb3NlZCwgIzI3OTQ5JywgKCkgPT4ge1xuXG5cdFx0ZWRpdG9ycy4kYWNjZXB0RG9jdW1lbnRzQW5kRWRpdG9yc0RlbHRhKHtcblx0XHRcdGFkZGVkRG9jdW1lbnRzOiBbe1xuXHRcdFx0XHRFT0w6ICdcXG4nLFxuXHRcdFx0XHRpc0RpcnR5OiB0cnVlLFxuXHRcdFx0XHRsYW5ndWFnZUlkOiAnZm9vTGFuZycsXG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdmb286YmFyJyksXG5cdFx0XHRcdHZlcnNpb25JZDogMSxcblx0XHRcdFx0bGluZXM6IFtcblx0XHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHRcdCdzZWNvbmQnXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGVuY29kaW5nOiAndXRmOCdcblx0XHRcdH1dXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXG5cdFx0XHRjb25zdCBkID0gZWRpdG9ycy5vbkRpZFJlbW92ZURvY3VtZW50cyhlID0+IHtcblx0XHRcdFx0dHJ5IHtcblxuXHRcdFx0XHRcdGZvciAoY29uc3QgZGF0YSBvZiBlKSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5kb2N1bWVudC5pc0Nsb3NlZCwgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdHJlamVjdChlKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGVkaXRvcnMuJGFjY2VwdERvY3VtZW50c0FuZEVkaXRvcnNEZWx0YSh7XG5cdFx0XHRcdHJlbW92ZWREb2N1bWVudHM6IFtVUkkucGFyc2UoJ2ZvbzpiYXInKV1cblx0XHRcdH0pO1xuXG5cdFx0fSk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSw4QkFBOEIsTUFBTTtBQUV6QyxNQUFJO0FBRUosUUFBTSxXQUFZO0FBQ2pCLGNBQVUsSUFBSSwyQkFBMkIsSUFBSSxnQkFBZ0IsR0FBRyxJQUFJLGVBQWUsQ0FBQztBQUFBLEVBQ3JGLENBQUM7QUFFRCwwQ0FBd0M7QUFFeEMsT0FBSywwRkFBMEYsTUFBTTtBQUVwRyxZQUFRLGdDQUFnQztBQUFBLE1BQ3ZDLGdCQUFnQixDQUFDO0FBQUEsUUFDaEIsS0FBSztBQUFBLFFBQ0wsU0FBUztBQUFBLFFBQ1QsWUFBWTtBQUFBLFFBQ1osS0FBSyxJQUFJLE1BQU0sU0FBUztBQUFBLFFBQ3hCLFdBQVc7QUFBQSxRQUNYLE9BQU87QUFBQSxVQUNOO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxRQUNBLFVBQVU7QUFBQSxNQUNYLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxXQUFPLElBQUksUUFBUSxDQUFDLFNBQVMsV0FBVztBQUV2QyxZQUFNLElBQUksUUFBUSxxQkFBcUIsT0FBSztBQUMzQyxZQUFJO0FBRUgscUJBQVcsUUFBUSxHQUFHO0FBQ3JCLG1CQUFPLFlBQVksS0FBSyxTQUFTLFVBQVUsSUFBSTtBQUFBLFVBQ2hEO0FBQ0Esa0JBQVEsTUFBUztBQUFBLFFBQ2xCLFNBQVNBLElBQUc7QUFDWCxpQkFBT0EsRUFBQztBQUFBLFFBQ1QsVUFBRTtBQUNELFlBQUUsUUFBUTtBQUFBLFFBQ1g7QUFBQSxNQUNELENBQUM7QUFFRCxjQUFRLGdDQUFnQztBQUFBLFFBQ3ZDLGtCQUFrQixDQUFDLElBQUksTUFBTSxTQUFTLENBQUM7QUFBQSxNQUN4QyxDQUFDO0FBQUEsSUFFRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUYsQ0FBQzsiLAogICJuYW1lcyI6IFsiZSJdCn0K
