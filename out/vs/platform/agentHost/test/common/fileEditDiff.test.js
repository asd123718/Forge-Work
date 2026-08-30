import assert from "assert";
import { encodeHex, VSBuffer } from "../../../../base/common/buffer.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { URI } from "../../../../base/common/uri.js";
import { FileEditKind } from "../../common/state/sessionState.js";
import { normalizeFileEdit } from "../../common/fileEditDiff.js";
suite("fileEditDiff", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const fileA = URI.file("/repo/a.ts").toString();
  const fileB = URI.file("/repo/b.ts").toString();
  const beforeContent = "git-blob://before";
  const afterContent = "git-blob://after";
  test("normalizes added, modified, deleted, and renamed edits", () => {
    const created = { after: { uri: fileA, content: { uri: afterContent } } };
    const modified = { before: { uri: fileA, content: { uri: beforeContent } }, after: { uri: fileA, content: { uri: afterContent } } };
    const deleted = { before: { uri: fileA, content: { uri: beforeContent } } };
    const renamed = { before: { uri: fileA, content: { uri: beforeContent } }, after: { uri: fileB, content: { uri: afterContent } } };
    const summarize = (edit) => {
      const n = normalizeFileEdit(edit);
      return n && {
        kind: n.kind,
        resource: n.resource.toString(),
        beforeUri: n.beforeUri?.toString(),
        afterUri: n.afterUri?.toString(),
        beforeContentUri: n.beforeContentUri?.toString(),
        afterContentUri: n.afterContentUri?.toString()
      };
    };
    assert.deepStrictEqual(
      [created, modified, deleted, renamed].map(summarize),
      [
        { kind: FileEditKind.Create, resource: fileA, beforeUri: void 0, afterUri: fileA, beforeContentUri: void 0, afterContentUri: afterContent },
        { kind: FileEditKind.Edit, resource: fileA, beforeUri: fileA, afterUri: fileA, beforeContentUri: beforeContent, afterContentUri: afterContent },
        { kind: FileEditKind.Delete, resource: fileA, beforeUri: fileA, afterUri: void 0, beforeContentUri: beforeContent, afterContentUri: void 0 },
        { kind: FileEditKind.Rename, resource: fileB, beforeUri: fileA, afterUri: fileB, beforeContentUri: beforeContent, afterContentUri: afterContent }
      ]
    );
  });
  test("returns undefined when no usable URI is present", () => {
    assert.strictEqual(normalizeFileEdit({}), void 0);
  });
  test("canonicalizes legacy session-db content URIs so their path is the edited file", () => {
    const hex = (value) => encodeHex(VSBuffer.fromString(value)).toString();
    const legacy = (part) => URI.from({
      scheme: "session-db",
      authority: hex("copilot:/s1"),
      path: `/call_1/${hex("/repo/a.ts")}/${part}/a.ts`
    }).toString();
    const normalized = normalizeFileEdit({
      before: { uri: fileA, content: { uri: legacy("before") } },
      after: { uri: fileA, content: { uri: legacy("after") } }
    });
    assert.deepStrictEqual(
      [normalized?.beforeContentUri?.path, normalized?.afterContentUri?.path],
      ["/repo/a.ts", "/repo/a.ts"]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXGZpbGVFZGl0RGlmZi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5jb2RlSGV4LCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgdHlwZSB7IEZpbGVFZGl0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IEZpbGVFZGl0S2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgbm9ybWFsaXplRmlsZUVkaXQgfSBmcm9tICcuLi8uLi9jb21tb24vZmlsZUVkaXREaWZmLmpzJztcblxuc3VpdGUoJ2ZpbGVFZGl0RGlmZicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBmaWxlQSA9IFVSSS5maWxlKCcvcmVwby9hLnRzJykudG9TdHJpbmcoKTtcblx0Y29uc3QgZmlsZUIgPSBVUkkuZmlsZSgnL3JlcG8vYi50cycpLnRvU3RyaW5nKCk7XG5cdGNvbnN0IGJlZm9yZUNvbnRlbnQgPSAnZ2l0LWJsb2I6Ly9iZWZvcmUnO1xuXHRjb25zdCBhZnRlckNvbnRlbnQgPSAnZ2l0LWJsb2I6Ly9hZnRlcic7XG5cblx0dGVzdCgnbm9ybWFsaXplcyBhZGRlZCwgbW9kaWZpZWQsIGRlbGV0ZWQsIGFuZCByZW5hbWVkIGVkaXRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNyZWF0ZWQ6IEZpbGVFZGl0ID0geyBhZnRlcjogeyB1cmk6IGZpbGVBLCBjb250ZW50OiB7IHVyaTogYWZ0ZXJDb250ZW50IH0gfSB9O1xuXHRcdGNvbnN0IG1vZGlmaWVkOiBGaWxlRWRpdCA9IHsgYmVmb3JlOiB7IHVyaTogZmlsZUEsIGNvbnRlbnQ6IHsgdXJpOiBiZWZvcmVDb250ZW50IH0gfSwgYWZ0ZXI6IHsgdXJpOiBmaWxlQSwgY29udGVudDogeyB1cmk6IGFmdGVyQ29udGVudCB9IH0gfTtcblx0XHRjb25zdCBkZWxldGVkOiBGaWxlRWRpdCA9IHsgYmVmb3JlOiB7IHVyaTogZmlsZUEsIGNvbnRlbnQ6IHsgdXJpOiBiZWZvcmVDb250ZW50IH0gfSB9O1xuXHRcdGNvbnN0IHJlbmFtZWQ6IEZpbGVFZGl0ID0geyBiZWZvcmU6IHsgdXJpOiBmaWxlQSwgY29udGVudDogeyB1cmk6IGJlZm9yZUNvbnRlbnQgfSB9LCBhZnRlcjogeyB1cmk6IGZpbGVCLCBjb250ZW50OiB7IHVyaTogYWZ0ZXJDb250ZW50IH0gfSB9O1xuXG5cdFx0Y29uc3Qgc3VtbWFyaXplID0gKGVkaXQ6IEZpbGVFZGl0KSA9PiB7XG5cdFx0XHRjb25zdCBuID0gbm9ybWFsaXplRmlsZUVkaXQoZWRpdCk7XG5cdFx0XHRyZXR1cm4gbiAmJiB7XG5cdFx0XHRcdGtpbmQ6IG4ua2luZCxcblx0XHRcdFx0cmVzb3VyY2U6IG4ucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0YmVmb3JlVXJpOiBuLmJlZm9yZVVyaT8udG9TdHJpbmcoKSxcblx0XHRcdFx0YWZ0ZXJVcmk6IG4uYWZ0ZXJVcmk/LnRvU3RyaW5nKCksXG5cdFx0XHRcdGJlZm9yZUNvbnRlbnRVcmk6IG4uYmVmb3JlQ29udGVudFVyaT8udG9TdHJpbmcoKSxcblx0XHRcdFx0YWZ0ZXJDb250ZW50VXJpOiBuLmFmdGVyQ29udGVudFVyaT8udG9TdHJpbmcoKSxcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbY3JlYXRlZCwgbW9kaWZpZWQsIGRlbGV0ZWQsIHJlbmFtZWRdLm1hcChzdW1tYXJpemUpLFxuXHRcdFx0W1xuXHRcdFx0XHR7IGtpbmQ6IEZpbGVFZGl0S2luZC5DcmVhdGUsIHJlc291cmNlOiBmaWxlQSwgYmVmb3JlVXJpOiB1bmRlZmluZWQsIGFmdGVyVXJpOiBmaWxlQSwgYmVmb3JlQ29udGVudFVyaTogdW5kZWZpbmVkLCBhZnRlckNvbnRlbnRVcmk6IGFmdGVyQ29udGVudCB9LFxuXHRcdFx0XHR7IGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LCByZXNvdXJjZTogZmlsZUEsIGJlZm9yZVVyaTogZmlsZUEsIGFmdGVyVXJpOiBmaWxlQSwgYmVmb3JlQ29udGVudFVyaTogYmVmb3JlQ29udGVudCwgYWZ0ZXJDb250ZW50VXJpOiBhZnRlckNvbnRlbnQgfSxcblx0XHRcdFx0eyBraW5kOiBGaWxlRWRpdEtpbmQuRGVsZXRlLCByZXNvdXJjZTogZmlsZUEsIGJlZm9yZVVyaTogZmlsZUEsIGFmdGVyVXJpOiB1bmRlZmluZWQsIGJlZm9yZUNvbnRlbnRVcmk6IGJlZm9yZUNvbnRlbnQsIGFmdGVyQ29udGVudFVyaTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdHsga2luZDogRmlsZUVkaXRLaW5kLlJlbmFtZSwgcmVzb3VyY2U6IGZpbGVCLCBiZWZvcmVVcmk6IGZpbGVBLCBhZnRlclVyaTogZmlsZUIsIGJlZm9yZUNvbnRlbnRVcmk6IGJlZm9yZUNvbnRlbnQsIGFmdGVyQ29udGVudFVyaTogYWZ0ZXJDb250ZW50IH0sXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBubyB1c2FibGUgVVJJIGlzIHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZUZpbGVFZGl0KHt9KSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY2Fub25pY2FsaXplcyBsZWdhY3kgc2Vzc2lvbi1kYiBjb250ZW50IFVSSXMgc28gdGhlaXIgcGF0aCBpcyB0aGUgZWRpdGVkIGZpbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGV4ID0gKHZhbHVlOiBzdHJpbmcpID0+IGVuY29kZUhleChWU0J1ZmZlci5mcm9tU3RyaW5nKHZhbHVlKSkudG9TdHJpbmcoKTtcblx0XHRjb25zdCBsZWdhY3kgPSAocGFydDogc3RyaW5nKSA9PiBVUkkuZnJvbSh7XG5cdFx0XHRzY2hlbWU6ICdzZXNzaW9uLWRiJyxcblx0XHRcdGF1dGhvcml0eTogaGV4KCdjb3BpbG90Oi9zMScpLFxuXHRcdFx0cGF0aDogYC9jYWxsXzEvJHtoZXgoJy9yZXBvL2EudHMnKX0vJHtwYXJ0fS9hLnRzYCxcblx0XHR9KS50b1N0cmluZygpO1xuXG5cdFx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZUZpbGVFZGl0KHtcblx0XHRcdGJlZm9yZTogeyB1cmk6IGZpbGVBLCBjb250ZW50OiB7IHVyaTogbGVnYWN5KCdiZWZvcmUnKSB9IH0sXG5cdFx0XHRhZnRlcjogeyB1cmk6IGZpbGVBLCBjb250ZW50OiB7IHVyaTogbGVnYWN5KCdhZnRlcicpIH0gfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbbm9ybWFsaXplZD8uYmVmb3JlQ29udGVudFVyaT8ucGF0aCwgbm9ybWFsaXplZD8uYWZ0ZXJDb250ZW50VXJpPy5wYXRoXSxcblx0XHRcdFsnL3JlcG8vYS50cycsICcvcmVwby9hLnRzJ10sXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVcsZ0JBQWdCO0FBQ3BDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsV0FBVztBQUVwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHlCQUF5QjtBQUVsQyxNQUFNLGdCQUFnQixNQUFNO0FBRTNCLDBDQUF3QztBQUV4QyxRQUFNLFFBQVEsSUFBSSxLQUFLLFlBQVksRUFBRSxTQUFTO0FBQzlDLFFBQU0sUUFBUSxJQUFJLEtBQUssWUFBWSxFQUFFLFNBQVM7QUFDOUMsUUFBTSxnQkFBZ0I7QUFDdEIsUUFBTSxlQUFlO0FBRXJCLE9BQUssMERBQTBELE1BQU07QUFDcEUsVUFBTSxVQUFvQixFQUFFLE9BQU8sRUFBRSxLQUFLLE9BQU8sU0FBUyxFQUFFLEtBQUssYUFBYSxFQUFFLEVBQUU7QUFDbEYsVUFBTSxXQUFxQixFQUFFLFFBQVEsRUFBRSxLQUFLLE9BQU8sU0FBUyxFQUFFLEtBQUssY0FBYyxFQUFFLEdBQUcsT0FBTyxFQUFFLEtBQUssT0FBTyxTQUFTLEVBQUUsS0FBSyxhQUFhLEVBQUUsRUFBRTtBQUM1SSxVQUFNLFVBQW9CLEVBQUUsUUFBUSxFQUFFLEtBQUssT0FBTyxTQUFTLEVBQUUsS0FBSyxjQUFjLEVBQUUsRUFBRTtBQUNwRixVQUFNLFVBQW9CLEVBQUUsUUFBUSxFQUFFLEtBQUssT0FBTyxTQUFTLEVBQUUsS0FBSyxjQUFjLEVBQUUsR0FBRyxPQUFPLEVBQUUsS0FBSyxPQUFPLFNBQVMsRUFBRSxLQUFLLGFBQWEsRUFBRSxFQUFFO0FBRTNJLFVBQU0sWUFBWSxDQUFDLFNBQW1CO0FBQ3JDLFlBQU0sSUFBSSxrQkFBa0IsSUFBSTtBQUNoQyxhQUFPLEtBQUs7QUFBQSxRQUNYLE1BQU0sRUFBRTtBQUFBLFFBQ1IsVUFBVSxFQUFFLFNBQVMsU0FBUztBQUFBLFFBQzlCLFdBQVcsRUFBRSxXQUFXLFNBQVM7QUFBQSxRQUNqQyxVQUFVLEVBQUUsVUFBVSxTQUFTO0FBQUEsUUFDL0Isa0JBQWtCLEVBQUUsa0JBQWtCLFNBQVM7QUFBQSxRQUMvQyxpQkFBaUIsRUFBRSxpQkFBaUIsU0FBUztBQUFBLE1BQzlDO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxNQUNOLENBQUMsU0FBUyxVQUFVLFNBQVMsT0FBTyxFQUFFLElBQUksU0FBUztBQUFBLE1BQ25EO0FBQUEsUUFDQyxFQUFFLE1BQU0sYUFBYSxRQUFRLFVBQVUsT0FBTyxXQUFXLFFBQVcsVUFBVSxPQUFPLGtCQUFrQixRQUFXLGlCQUFpQixhQUFhO0FBQUEsUUFDaEosRUFBRSxNQUFNLGFBQWEsTUFBTSxVQUFVLE9BQU8sV0FBVyxPQUFPLFVBQVUsT0FBTyxrQkFBa0IsZUFBZSxpQkFBaUIsYUFBYTtBQUFBLFFBQzlJLEVBQUUsTUFBTSxhQUFhLFFBQVEsVUFBVSxPQUFPLFdBQVcsT0FBTyxVQUFVLFFBQVcsa0JBQWtCLGVBQWUsaUJBQWlCLE9BQVU7QUFBQSxRQUNqSixFQUFFLE1BQU0sYUFBYSxRQUFRLFVBQVUsT0FBTyxXQUFXLE9BQU8sVUFBVSxPQUFPLGtCQUFrQixlQUFlLGlCQUFpQixhQUFhO0FBQUEsTUFDako7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxtREFBbUQsTUFBTTtBQUM3RCxXQUFPLFlBQVksa0JBQWtCLENBQUMsQ0FBQyxHQUFHLE1BQVM7QUFBQSxFQUNwRCxDQUFDO0FBRUQsT0FBSyxpRkFBaUYsTUFBTTtBQUMzRixVQUFNLE1BQU0sQ0FBQyxVQUFrQixVQUFVLFNBQVMsV0FBVyxLQUFLLENBQUMsRUFBRSxTQUFTO0FBQzlFLFVBQU0sU0FBUyxDQUFDLFNBQWlCLElBQUksS0FBSztBQUFBLE1BQ3pDLFFBQVE7QUFBQSxNQUNSLFdBQVcsSUFBSSxhQUFhO0FBQUEsTUFDNUIsTUFBTSxXQUFXLElBQUksWUFBWSxDQUFDLElBQUksSUFBSTtBQUFBLElBQzNDLENBQUMsRUFBRSxTQUFTO0FBRVosVUFBTSxhQUFhLGtCQUFrQjtBQUFBLE1BQ3BDLFFBQVEsRUFBRSxLQUFLLE9BQU8sU0FBUyxFQUFFLEtBQUssT0FBTyxRQUFRLEVBQUUsRUFBRTtBQUFBLE1BQ3pELE9BQU8sRUFBRSxLQUFLLE9BQU8sU0FBUyxFQUFFLEtBQUssT0FBTyxPQUFPLEVBQUUsRUFBRTtBQUFBLElBQ3hELENBQUM7QUFFRCxXQUFPO0FBQUEsTUFDTixDQUFDLFlBQVksa0JBQWtCLE1BQU0sWUFBWSxpQkFBaUIsSUFBSTtBQUFBLE1BQ3RFLENBQUMsY0FBYyxZQUFZO0FBQUEsSUFDNUI7QUFBQSxFQUNELENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
