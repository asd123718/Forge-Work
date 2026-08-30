import assert from "assert";
import { Emitter, Event } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../platform/configuration/test/common/testConfigurationService.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { GroupModelChangeKind } from "../../../common/editor.js";
import { TestEditorInput } from "../../../test/browser/workbenchTestServices.js";
import { MainThreadEditorTabs } from "../../browser/mainThreadEditorTabs.js";
import { SingleProxyRPCProtocol } from "../common/testRPCProtocol.js";
suite("MainThreadEditorTabs", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("ignores only missing modal editor label changes", async () => {
    const modalGroup = new class extends mock() {
      constructor() {
        super(...arguments);
        this.id = 2;
      }
    }();
    const modalEditorPart = new class extends mock() {
      constructor() {
        super(...arguments);
        this.groups = [modalGroup];
      }
    }();
    let groupsReadCount = 0;
    const editorGroupsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeModalEditorPart = modalEditorPart;
        this.onDidAddGroup = Event.None;
        this.onDidRemoveGroup = Event.None;
        this.whenReady = Promise.resolve();
      }
      getGroup() {
        return void 0;
      }
      get groups() {
        groupsReadCount++;
        return [];
      }
    }();
    const editorChanges = disposables.add(new Emitter());
    const editorService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidEditorsChange = editorChanges.event;
      }
    }();
    const input = disposables.add(new TestEditorInput(URI.parse("test:modal"), "testEditor"));
    disposables.add(new MainThreadEditorTabs(
      SingleProxyRPCProtocol({}),
      editorGroupsService,
      new TestConfigurationService(),
      new NullLogService(),
      editorService
    ));
    await Promise.resolve();
    groupsReadCount = 0;
    editorChanges.fire({
      groupId: modalGroup.id,
      event: {
        kind: GroupModelChangeKind.EDITOR_LABEL,
        editor: input,
        editorIndex: 0
      }
    });
    const rebuildsAfterLabelChange = groupsReadCount;
    editorChanges.fire({
      groupId: modalGroup.id,
      event: {
        kind: GroupModelChangeKind.EDITOR_OPEN,
        editor: input,
        editorIndex: 0
      }
    });
    assert.deepStrictEqual({
      rebuildsAfterLabelChange,
      rebuildsAfterOpen: groupsReadCount
    }, {
      rebuildsAfterLabelChange: 0,
      rebuildsAfterOpen: 1
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcbWFpblRocmVhZEVkaXRvclRhYnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEdyb3VwTW9kZWxDaGFuZ2VLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cHNTZXJ2aWNlLCBJTW9kYWxFZGl0b3JQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JzQ2hhbmdlRXZlbnQsIElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZEVkaXRvclRhYnMgfSBmcm9tICcuLi8uLi9icm93c2VyL21haW5UaHJlYWRFZGl0b3JUYWJzLmpzJztcbmltcG9ydCB7IFNpbmdsZVByb3h5UlBDUHJvdG9jb2wgfSBmcm9tICcuLi9jb21tb24vdGVzdFJQQ1Byb3RvY29sLmpzJztcblxuc3VpdGUoJ01haW5UaHJlYWRFZGl0b3JUYWJzJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaWdub3JlcyBvbmx5IG1pc3NpbmcgbW9kYWwgZWRpdG9yIGxhYmVsIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kYWxHcm91cCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvckdyb3VwPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlkID0gMjtcblx0XHR9KCk7XG5cdFx0Y29uc3QgbW9kYWxFZGl0b3JQYXJ0ID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTW9kYWxFZGl0b3JQYXJ0PigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGdyb3VwcyA9IFttb2RhbEdyb3VwXTtcblx0XHR9KCk7XG5cdFx0bGV0IGdyb3Vwc1JlYWRDb3VudCA9IDA7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvckdyb3Vwc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlTW9kYWxFZGl0b3JQYXJ0ID0gbW9kYWxFZGl0b3JQYXJ0O1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRBZGRHcm91cCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFJlbW92ZUdyb3VwID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHdoZW5SZWFkeSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0b3ZlcnJpZGUgZ2V0R3JvdXAoKTogSUVkaXRvckdyb3VwIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGdldCBncm91cHMoKTogcmVhZG9ubHkgSUVkaXRvckdyb3VwW10ge1xuXHRcdFx0XHRncm91cHNSZWFkQ291bnQrKztcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdH0oKTtcblx0XHRjb25zdCBlZGl0b3JDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElFZGl0b3JzQ2hhbmdlRXZlbnQ+KCkpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkRWRpdG9yc0NoYW5nZSA9IGVkaXRvckNoYW5nZXMuZXZlbnQ7XG5cdFx0fSgpO1xuXHRcdGNvbnN0IGlucHV0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0RWRpdG9ySW5wdXQoVVJJLnBhcnNlKCd0ZXN0Om1vZGFsJyksICd0ZXN0RWRpdG9yJykpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgTWFpblRocmVhZEVkaXRvclRhYnMoXG5cdFx0XHRTaW5nbGVQcm94eVJQQ1Byb3RvY29sKHt9KSxcblx0XHRcdGVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdGVkaXRvclNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0Z3JvdXBzUmVhZENvdW50ID0gMDtcblxuXHRcdGVkaXRvckNoYW5nZXMuZmlyZSh7XG5cdFx0XHRncm91cElkOiBtb2RhbEdyb3VwLmlkLFxuXHRcdFx0ZXZlbnQ6IHtcblx0XHRcdFx0a2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0xBQkVMLFxuXHRcdFx0XHRlZGl0b3I6IGlucHV0LFxuXHRcdFx0XHRlZGl0b3JJbmRleDogMCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVidWlsZHNBZnRlckxhYmVsQ2hhbmdlID0gZ3JvdXBzUmVhZENvdW50O1xuXHRcdGVkaXRvckNoYW5nZXMuZmlyZSh7XG5cdFx0XHRncm91cElkOiBtb2RhbEdyb3VwLmlkLFxuXHRcdFx0ZXZlbnQ6IHtcblx0XHRcdFx0a2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX09QRU4sXG5cdFx0XHRcdGVkaXRvcjogaW5wdXQsXG5cdFx0XHRcdGVkaXRvckluZGV4OiAwLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVidWlsZHNBZnRlckxhYmVsQ2hhbmdlLFxuXHRcdFx0cmVidWlsZHNBZnRlck9wZW46IGdyb3Vwc1JlYWRDb3VudCxcblx0XHR9LCB7XG5cdFx0XHRyZWJ1aWxkc0FmdGVyTGFiZWxDaGFuZ2U6IDAsXG5cdFx0XHRyZWJ1aWxkc0FmdGVyT3BlbjogMSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNEJBQTRCO0FBR3JDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsOEJBQThCO0FBRXZDLE1BQU0sd0JBQXdCLE1BQU07QUFFbkMsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxPQUFLLG1EQUFtRCxZQUFZO0FBQ25FLFVBQU0sYUFBYSxJQUFJLGNBQWMsS0FBbUIsRUFBRTtBQUFBLE1BQW5DO0FBQUE7QUFDdEIsYUFBa0IsS0FBSztBQUFBO0FBQUEsSUFDeEIsRUFBRTtBQUNGLFVBQU0sa0JBQWtCLElBQUksY0FBYyxLQUF1QixFQUFFO0FBQUEsTUFBdkM7QUFBQTtBQUMzQixhQUFrQixTQUFTLENBQUMsVUFBVTtBQUFBO0FBQUEsSUFDdkMsRUFBRTtBQUNGLFFBQUksa0JBQWtCO0FBQ3RCLFVBQU0sc0JBQXNCLElBQUksY0FBYyxLQUEyQixFQUFFO0FBQUEsTUFBM0M7QUFBQTtBQUMvQixhQUFrQix3QkFBd0I7QUFDMUMsYUFBa0IsZ0JBQWdCLE1BQU07QUFDeEMsYUFBa0IsbUJBQW1CLE1BQU07QUFDM0MsYUFBa0IsWUFBWSxRQUFRLFFBQVE7QUFBQTtBQUFBLE1BQ3JDLFdBQXFDO0FBQzdDLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxJQUFhLFNBQWtDO0FBQzlDO0FBQ0EsZUFBTyxDQUFDO0FBQUEsTUFDVDtBQUFBLElBQ0QsRUFBRTtBQUNGLFVBQU0sZ0JBQWdCLFlBQVksSUFBSSxJQUFJLFFBQTZCLENBQUM7QUFDeEUsVUFBTSxnQkFBZ0IsSUFBSSxjQUFjLEtBQXFCLEVBQUU7QUFBQSxNQUFyQztBQUFBO0FBQ3pCLGFBQWtCLHFCQUFxQixjQUFjO0FBQUE7QUFBQSxJQUN0RCxFQUFFO0FBQ0YsVUFBTSxRQUFRLFlBQVksSUFBSSxJQUFJLGdCQUFnQixJQUFJLE1BQU0sWUFBWSxHQUFHLFlBQVksQ0FBQztBQUN4RixnQkFBWSxJQUFJLElBQUk7QUFBQSxNQUNuQix1QkFBdUIsQ0FBQyxDQUFDO0FBQUEsTUFDekI7QUFBQSxNQUNBLElBQUkseUJBQXlCO0FBQUEsTUFDN0IsSUFBSSxlQUFlO0FBQUEsTUFDbkI7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFFBQVEsUUFBUTtBQUN0QixzQkFBa0I7QUFFbEIsa0JBQWMsS0FBSztBQUFBLE1BQ2xCLFNBQVMsV0FBVztBQUFBLE1BQ3BCLE9BQU87QUFBQSxRQUNOLE1BQU0scUJBQXFCO0FBQUEsUUFDM0IsUUFBUTtBQUFBLFFBQ1IsYUFBYTtBQUFBLE1BQ2Q7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLDJCQUEyQjtBQUNqQyxrQkFBYyxLQUFLO0FBQUEsTUFDbEIsU0FBUyxXQUFXO0FBQUEsTUFDcEIsT0FBTztBQUFBLFFBQ04sTUFBTSxxQkFBcUI7QUFBQSxRQUMzQixRQUFRO0FBQUEsUUFDUixhQUFhO0FBQUEsTUFDZDtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxNQUNBLG1CQUFtQjtBQUFBLElBQ3BCLEdBQUc7QUFBQSxNQUNGLDBCQUEwQjtBQUFBLE1BQzFCLG1CQUFtQjtBQUFBLElBQ3BCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
