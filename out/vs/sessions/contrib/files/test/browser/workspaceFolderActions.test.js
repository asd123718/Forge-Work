import assert from "assert";
import { constObservable } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IViewsService } from "../../../../../workbench/services/views/common/viewsService.js";
import { IAgentWorkbenchLayoutService } from "../../../../browser/workbench.js";
import { NEW_FILE_TAB_COMMAND_ID } from "../../../../common/sessionCommands.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { OpenFilesViewAction } from "../../browser/workspaceFolderActions.js";
import { SESSIONS_FILES_VIEW_ID } from "../../browser/filesView.js";
suite("Sessions - Workspace Folder Actions", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("folder pill opens the managed Files editor and Files view in single-pane layout", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    const calls = [];
    const commandCalls = [];
    const viewCalls = [];
    const session = new class extends mock() {
      constructor() {
        super(...arguments);
        this.resource = URI.parse("test-session://folder-pill");
        this.workspace = constObservable(void 0);
      }
    }();
    instantiationService.stub(ISessionsService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = constObservable(session);
      }
    }());
    instantiationService.stub(IAgentWorkbenchLayoutService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.isSinglePaneLayoutEnabled = true;
      }
    }());
    instantiationService.stub(ICommandService, new class extends mock() {
      async executeCommand(commandId, ...args) {
        calls.push("openFilesEditor");
        commandCalls.push({ commandId, args });
        return void 0;
      }
    }());
    instantiationService.stub(IViewsService, new class extends mock() {
      async openView(id, focus) {
        calls.push("openFilesView");
        viewCalls.push({ id, focus });
        return null;
      }
    }());
    await new OpenFilesViewAction().run(instantiationService, session);
    assert.deepStrictEqual({
      calls,
      commandCalls: commandCalls.map((call) => ({
        commandId: call.commandId,
        args: call.args
      })),
      viewCalls
    }, {
      calls: ["openFilesEditor", "openFilesView"],
      commandCalls: [{
        commandId: NEW_FILE_TAB_COMMAND_ID,
        args: []
      }],
      viewCalls: [{
        id: SESSIONS_FILES_VIEW_ID,
        focus: false
      }]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcZmlsZXNcXHRlc3RcXGJyb3dzZXJcXHdvcmtzcGFjZUZvbGRlckFjdGlvbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSVZpZXcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93b3JrYmVuY2guanMnO1xuaW1wb3J0IHsgTkVXX0ZJTEVfVEFCX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2Vzc2lvbkNvbW1hbmRzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgT3BlbkZpbGVzVmlld0FjdGlvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvd29ya3NwYWNlRm9sZGVyQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTRVNTSU9OU19GSUxFU19WSUVXX0lEIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9maWxlc1ZpZXcuanMnO1xuXG5zdWl0ZSgnU2Vzc2lvbnMgLSBXb3Jrc3BhY2UgRm9sZGVyIEFjdGlvbnMnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZm9sZGVyIHBpbGwgb3BlbnMgdGhlIG1hbmFnZWQgRmlsZXMgZWRpdG9yIGFuZCBGaWxlcyB2aWV3IGluIHNpbmdsZS1wYW5lIGxheW91dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbW1hbmRDYWxsczogeyByZWFkb25seSBjb21tYW5kSWQ6IHN0cmluZzsgcmVhZG9ubHkgYXJnczogcmVhZG9ubHkgdW5rbm93bltdIH1bXSA9IFtdO1xuXHRcdGNvbnN0IHZpZXdDYWxsczogeyByZWFkb25seSBpZDogc3RyaW5nOyByZWFkb25seSBmb2N1czogYm9vbGVhbiB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWN0aXZlU2Vzc2lvbj4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSByZXNvdXJjZSA9IFVSSS5wYXJzZSgndGVzdC1zZXNzaW9uOi8vZm9sZGVyLXBpbGwnKTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHdvcmtzcGFjZSA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRcdH07XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uID0gY29uc3RPYnNlcnZhYmxlKHNlc3Npb24pO1xuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzU2luZ2xlUGFuZUxheW91dEVuYWJsZWQgPSB0cnVlO1xuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDb21tYW5kU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBleGVjdXRlQ29tbWFuZDxUID0gdW5rbm93bj4oY29tbWFuZElkOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8VCB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKCdvcGVuRmlsZXNFZGl0b3InKTtcblx0XHRcdFx0Y29tbWFuZENhbGxzLnB1c2goeyBjb21tYW5kSWQsIGFyZ3MgfSk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVmlld3NTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElWaWV3c1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgb3BlblZpZXc8VCBleHRlbmRzIElWaWV3PihpZDogc3RyaW5nLCBmb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPFQgfCBudWxsPiB7XG5cdFx0XHRcdGNhbGxzLnB1c2goJ29wZW5GaWxlc1ZpZXcnKTtcblx0XHRcdFx0dmlld0NhbGxzLnB1c2goeyBpZCwgZm9jdXMgfSk7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgbmV3IE9wZW5GaWxlc1ZpZXdBY3Rpb24oKS5ydW4oaW5zdGFudGlhdGlvblNlcnZpY2UsIHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjYWxscyxcblx0XHRcdGNvbW1hbmRDYWxsczogY29tbWFuZENhbGxzLm1hcChjYWxsID0+ICh7XG5cdFx0XHRcdGNvbW1hbmRJZDogY2FsbC5jb21tYW5kSWQsXG5cdFx0XHRcdGFyZ3M6IGNhbGwuYXJnc1xuXHRcdFx0fSkpLFxuXHRcdFx0dmlld0NhbGxzXG5cdFx0fSwge1xuXHRcdFx0Y2FsbHM6IFsnb3BlbkZpbGVzRWRpdG9yJywgJ29wZW5GaWxlc1ZpZXcnXSxcblx0XHRcdGNvbW1hbmRDYWxsczogW3tcblx0XHRcdFx0Y29tbWFuZElkOiBORVdfRklMRV9UQUJfQ09NTUFORF9JRCxcblx0XHRcdFx0YXJnczogW11cblx0XHRcdH1dLFxuXHRcdFx0dmlld0NhbGxzOiBbe1xuXHRcdFx0XHRpZDogU0VTU0lPTlNfRklMRVNfVklFV19JRCxcblx0XHRcdFx0Zm9jdXM6IGZhbHNlXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx3QkFBd0I7QUFFakMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw4QkFBOEI7QUFFdkMsTUFBTSx1Q0FBdUMsTUFBTTtBQUNsRCxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELE9BQUssbUZBQW1GLFlBQVk7QUFDbkcsVUFBTSx1QkFBdUIsTUFBTSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDckUsVUFBTSxRQUFrQixDQUFDO0FBQ3pCLFVBQU0sZUFBb0YsQ0FBQztBQUMzRixVQUFNLFlBQTRFLENBQUM7QUFDbkYsVUFBTSxVQUFVLElBQUksY0FBYyxLQUFxQixFQUFFO0FBQUEsTUFBckM7QUFBQTtBQUNuQixhQUFrQixXQUFXLElBQUksTUFBTSw0QkFBNEI7QUFDbkUsYUFBa0IsWUFBWSxnQkFBZ0IsTUFBUztBQUFBO0FBQUEsSUFDeEQ7QUFFQSx5QkFBcUIsS0FBSyxrQkFBa0IsSUFBSSxjQUFjLEtBQXVCLEVBQUU7QUFBQSxNQUF2QztBQUFBO0FBQy9DLGFBQWtCLGdCQUFnQixnQkFBZ0IsT0FBTztBQUFBO0FBQUEsSUFDMUQsR0FBQztBQUNELHlCQUFxQixLQUFLLDhCQUE4QixJQUFJLGNBQWMsS0FBbUMsRUFBRTtBQUFBLE1BQW5EO0FBQUE7QUFDM0QsYUFBa0IsNEJBQTRCO0FBQUE7QUFBQSxJQUMvQyxHQUFDO0FBQ0QseUJBQXFCLEtBQUssaUJBQWlCLElBQUksY0FBYyxLQUFzQixFQUFFO0FBQUEsTUFDcEYsTUFBZSxlQUE0QixjQUFzQixNQUF5QztBQUN6RyxjQUFNLEtBQUssaUJBQWlCO0FBQzVCLHFCQUFhLEtBQUssRUFBRSxXQUFXLEtBQUssQ0FBQztBQUNyQyxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsR0FBQztBQUNELHlCQUFxQixLQUFLLGVBQWUsSUFBSSxjQUFjLEtBQW9CLEVBQUU7QUFBQSxNQUNoRixNQUFlLFNBQTBCLElBQVksT0FBb0M7QUFDeEYsY0FBTSxLQUFLLGVBQWU7QUFDMUIsa0JBQVUsS0FBSyxFQUFFLElBQUksTUFBTSxDQUFDO0FBQzVCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxHQUFDO0FBRUQsVUFBTSxJQUFJLG9CQUFvQixFQUFFLElBQUksc0JBQXNCLE9BQU87QUFFakUsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QjtBQUFBLE1BQ0EsY0FBYyxhQUFhLElBQUksV0FBUztBQUFBLFFBQ3ZDLFdBQVcsS0FBSztBQUFBLFFBQ2hCLE1BQU0sS0FBSztBQUFBLE1BQ1osRUFBRTtBQUFBLE1BQ0Y7QUFBQSxJQUNELEdBQUc7QUFBQSxNQUNGLE9BQU8sQ0FBQyxtQkFBbUIsZUFBZTtBQUFBLE1BQzFDLGNBQWMsQ0FBQztBQUFBLFFBQ2QsV0FBVztBQUFBLFFBQ1gsTUFBTSxDQUFDO0FBQUEsTUFDUixDQUFDO0FBQUEsTUFDRCxXQUFXLENBQUM7QUFBQSxRQUNYLElBQUk7QUFBQSxRQUNKLE9BQU87QUFBQSxNQUNSLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
