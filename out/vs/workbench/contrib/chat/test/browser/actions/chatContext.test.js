import assert from "assert";
import { extUri } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { getSessionWorkspaceName, isSameSessionWorkspace, shouldShowOpenEditorsContext } from "../../../browser/actions/chatContext.js";
function widget(overrides) {
  return {
    viewModel: void 0,
    lockedAgentId: void 0,
    ...overrides
  };
}
function widgetWithSession(sessionResource) {
  return widget({
    viewModel: { sessionResource }
  });
}
suite("ChatContext", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("shows Open Editors for regular Copilot CLI sessions with eligible editors", () => {
    assert.strictEqual(
      shouldShowOpenEditorsContext(widgetWithSession(URI.parse("copilotcli:/session-1")), true),
      true
    );
  });
  test("hides Open Editors for Agent Host sessions with eligible editors", () => {
    assert.strictEqual(
      shouldShowOpenEditorsContext(widgetWithSession(URI.parse("agent-host-copilotcli:/session-1")), true),
      false
    );
  });
  test("hides Open Editors for locked Agent Host ids without a session resource", () => {
    assert.strictEqual(
      shouldShowOpenEditorsContext(widget({ lockedAgentId: "agent-host-copilotcli" }), true),
      false
    );
  });
  test("hides Open Editors when there are no eligible editors", () => {
    assert.strictEqual(
      shouldShowOpenEditorsContext(widgetWithSession(URI.parse("copilotcli:/session-1")), false),
      false
    );
  });
  test("matches session workspaces by repository before cwd", () => {
    assert.deepStrictEqual({
      sameFolder: isSameSessionWorkspace(
        { cwd: "/Users/megan/repo/", repo: "microsoft/vscode" },
        { cwd: "/users/megan/repo", repo: "microsoft/vscode" }
      ),
      sameRepositoryWorktree: isSameSessionWorkspace(
        { cwd: "/Users/megan/repo", repo: "microsoft/vscode" },
        { cwd: "/Users/megan/repo-worktree", repo: "microsoft/vscode" }
      ),
      caseInsensitiveRepository: isSameSessionWorkspace(
        { repo: "Microsoft/VSCode" },
        { repo: "microsoft/vscode" }
      ),
      differentRepository: isSameSessionWorkspace(
        { cwd: "/Users/megan/repo", repo: "microsoft/vscode" },
        { cwd: "/Users/megan/repo", repo: "microsoft/typescript" }
      ),
      caseSensitiveCwd: isSameSessionWorkspace(
        { cwd: "/work/Foo" },
        { cwd: "/work/foo" },
        extUri
      )
    }, {
      sameFolder: true,
      sameRepositoryWorktree: true,
      caseInsensitiveRepository: true,
      differentRepository: false,
      caseSensitiveCwd: false
    });
  });
  test("labels a session workspace by repository or folder name", () => {
    assert.deepStrictEqual({
      repository: getSessionWorkspaceName({ repo: "microsoft/vscode", cwd: "/Users/megan/repo-worktree" }),
      folder: getSessionWorkspaceName({ cwd: "/Users/megan/Repos/typescript/" })
    }, {
      repository: "vscode",
      folder: "typescript"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXRDb250ZXh0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBleHRVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgZ2V0U2Vzc2lvbldvcmtzcGFjZU5hbWUsIGlzU2FtZVNlc3Npb25Xb3Jrc3BhY2UsIHNob3VsZFNob3dPcGVuRWRpdG9yc0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvY2hhdENvbnRleHQuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NoYXQuanMnO1xuXG5mdW5jdGlvbiB3aWRnZXQob3ZlcnJpZGVzOiBQYXJ0aWFsPFBpY2s8SUNoYXRXaWRnZXQsICd2aWV3TW9kZWwnIHwgJ2xvY2tlZEFnZW50SWQnPj4pOiBQaWNrPElDaGF0V2lkZ2V0LCAndmlld01vZGVsJyB8ICdsb2NrZWRBZ2VudElkJz4ge1xuXHRyZXR1cm4ge1xuXHRcdHZpZXdNb2RlbDogdW5kZWZpbmVkLFxuXHRcdGxvY2tlZEFnZW50SWQ6IHVuZGVmaW5lZCxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH0gYXMgUGljazxJQ2hhdFdpZGdldCwgJ3ZpZXdNb2RlbCcgfCAnbG9ja2VkQWdlbnRJZCc+O1xufVxuXG5mdW5jdGlvbiB3aWRnZXRXaXRoU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFBpY2s8SUNoYXRXaWRnZXQsICd2aWV3TW9kZWwnIHwgJ2xvY2tlZEFnZW50SWQnPiB7XG5cdHJldHVybiB3aWRnZXQoe1xuXHRcdHZpZXdNb2RlbDogeyBzZXNzaW9uUmVzb3VyY2UgfSBhcyBJQ2hhdFdpZGdldFsndmlld01vZGVsJ10sXG5cdH0pO1xufVxuXG5zdWl0ZSgnQ2hhdENvbnRleHQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc2hvd3MgT3BlbiBFZGl0b3JzIGZvciByZWd1bGFyIENvcGlsb3QgQ0xJIHNlc3Npb25zIHdpdGggZWxpZ2libGUgZWRpdG9ycycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzaG91bGRTaG93T3BlbkVkaXRvcnNDb250ZXh0KHdpZGdldFdpdGhTZXNzaW9uKFVSSS5wYXJzZSgnY29waWxvdGNsaTovc2Vzc2lvbi0xJykpLCB0cnVlKSxcblx0XHRcdHRydWVcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoaWRlcyBPcGVuIEVkaXRvcnMgZm9yIEFnZW50IEhvc3Qgc2Vzc2lvbnMgd2l0aCBlbGlnaWJsZSBlZGl0b3JzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHNob3VsZFNob3dPcGVuRWRpdG9yc0NvbnRleHQod2lkZ2V0V2l0aFNlc3Npb24oVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6L3Nlc3Npb24tMScpKSwgdHJ1ZSksXG5cdFx0XHRmYWxzZVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGVzIE9wZW4gRWRpdG9ycyBmb3IgbG9ja2VkIEFnZW50IEhvc3QgaWRzIHdpdGhvdXQgYSBzZXNzaW9uIHJlc291cmNlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHNob3VsZFNob3dPcGVuRWRpdG9yc0NvbnRleHQod2lkZ2V0KHsgbG9ja2VkQWdlbnRJZDogJ2FnZW50LWhvc3QtY29waWxvdGNsaScgfSksIHRydWUpLFxuXHRcdFx0ZmFsc2Vcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoaWRlcyBPcGVuIEVkaXRvcnMgd2hlbiB0aGVyZSBhcmUgbm8gZWxpZ2libGUgZWRpdG9ycycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzaG91bGRTaG93T3BlbkVkaXRvcnNDb250ZXh0KHdpZGdldFdpdGhTZXNzaW9uKFVSSS5wYXJzZSgnY29waWxvdGNsaTovc2Vzc2lvbi0xJykpLCBmYWxzZSksXG5cdFx0XHRmYWxzZVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hdGNoZXMgc2Vzc2lvbiB3b3Jrc3BhY2VzIGJ5IHJlcG9zaXRvcnkgYmVmb3JlIGN3ZCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNhbWVGb2xkZXI6IGlzU2FtZVNlc3Npb25Xb3Jrc3BhY2UoXG5cdFx0XHRcdHsgY3dkOiAnL1VzZXJzL21lZ2FuL3JlcG8vJywgcmVwbzogJ21pY3Jvc29mdC92c2NvZGUnIH0sXG5cdFx0XHRcdHsgY3dkOiAnL3VzZXJzL21lZ2FuL3JlcG8nLCByZXBvOiAnbWljcm9zb2Z0L3ZzY29kZScgfSxcblx0XHRcdCksXG5cdFx0XHRzYW1lUmVwb3NpdG9yeVdvcmt0cmVlOiBpc1NhbWVTZXNzaW9uV29ya3NwYWNlKFxuXHRcdFx0XHR7IGN3ZDogJy9Vc2Vycy9tZWdhbi9yZXBvJywgcmVwbzogJ21pY3Jvc29mdC92c2NvZGUnIH0sXG5cdFx0XHRcdHsgY3dkOiAnL1VzZXJzL21lZ2FuL3JlcG8td29ya3RyZWUnLCByZXBvOiAnbWljcm9zb2Z0L3ZzY29kZScgfSxcblx0XHRcdCksXG5cdFx0XHRjYXNlSW5zZW5zaXRpdmVSZXBvc2l0b3J5OiBpc1NhbWVTZXNzaW9uV29ya3NwYWNlKFxuXHRcdFx0XHR7IHJlcG86ICdNaWNyb3NvZnQvVlNDb2RlJyB9LFxuXHRcdFx0XHR7IHJlcG86ICdtaWNyb3NvZnQvdnNjb2RlJyB9LFxuXHRcdFx0KSxcblx0XHRcdGRpZmZlcmVudFJlcG9zaXRvcnk6IGlzU2FtZVNlc3Npb25Xb3Jrc3BhY2UoXG5cdFx0XHRcdHsgY3dkOiAnL1VzZXJzL21lZ2FuL3JlcG8nLCByZXBvOiAnbWljcm9zb2Z0L3ZzY29kZScgfSxcblx0XHRcdFx0eyBjd2Q6ICcvVXNlcnMvbWVnYW4vcmVwbycsIHJlcG86ICdtaWNyb3NvZnQvdHlwZXNjcmlwdCcgfSxcblx0XHRcdCksXG5cdFx0XHRjYXNlU2Vuc2l0aXZlQ3dkOiBpc1NhbWVTZXNzaW9uV29ya3NwYWNlKFxuXHRcdFx0XHR7IGN3ZDogJy93b3JrL0ZvbycgfSxcblx0XHRcdFx0eyBjd2Q6ICcvd29yay9mb28nIH0sXG5cdFx0XHRcdGV4dFVyaSxcblx0XHRcdCksXG5cdFx0fSwge1xuXHRcdFx0c2FtZUZvbGRlcjogdHJ1ZSxcblx0XHRcdHNhbWVSZXBvc2l0b3J5V29ya3RyZWU6IHRydWUsXG5cdFx0XHRjYXNlSW5zZW5zaXRpdmVSZXBvc2l0b3J5OiB0cnVlLFxuXHRcdFx0ZGlmZmVyZW50UmVwb3NpdG9yeTogZmFsc2UsXG5cdFx0XHRjYXNlU2Vuc2l0aXZlQ3dkOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGFiZWxzIGEgc2Vzc2lvbiB3b3Jrc3BhY2UgYnkgcmVwb3NpdG9yeSBvciBmb2xkZXIgbmFtZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlcG9zaXRvcnk6IGdldFNlc3Npb25Xb3Jrc3BhY2VOYW1lKHsgcmVwbzogJ21pY3Jvc29mdC92c2NvZGUnLCBjd2Q6ICcvVXNlcnMvbWVnYW4vcmVwby13b3JrdHJlZScgfSksXG5cdFx0XHRmb2xkZXI6IGdldFNlc3Npb25Xb3Jrc3BhY2VOYW1lKHsgY3dkOiAnL1VzZXJzL21lZ2FuL1JlcG9zL3R5cGVzY3JpcHQvJyB9KSxcblx0XHR9LCB7XG5cdFx0XHRyZXBvc2l0b3J5OiAndnNjb2RlJyxcblx0XHRcdGZvbGRlcjogJ3R5cGVzY3JpcHQnLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsY0FBYztBQUN2QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx5QkFBeUIsd0JBQXdCLG9DQUFvQztBQUc5RixTQUFTLE9BQU8sV0FBd0g7QUFDdkksU0FBTztBQUFBLElBQ04sV0FBVztBQUFBLElBQ1gsZUFBZTtBQUFBLElBQ2YsR0FBRztBQUFBLEVBQ0o7QUFDRDtBQUVBLFNBQVMsa0JBQWtCLGlCQUF3RTtBQUNsRyxTQUFPLE9BQU87QUFBQSxJQUNiLFdBQVcsRUFBRSxnQkFBZ0I7QUFBQSxFQUM5QixDQUFDO0FBQ0Y7QUFFQSxNQUFNLGVBQWUsTUFBTTtBQUUxQiwwQ0FBd0M7QUFFeEMsT0FBSyw2RUFBNkUsTUFBTTtBQUN2RixXQUFPO0FBQUEsTUFDTiw2QkFBNkIsa0JBQWtCLElBQUksTUFBTSx1QkFBdUIsQ0FBQyxHQUFHLElBQUk7QUFBQSxNQUN4RjtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLG9FQUFvRSxNQUFNO0FBQzlFLFdBQU87QUFBQSxNQUNOLDZCQUE2QixrQkFBa0IsSUFBSSxNQUFNLGtDQUFrQyxDQUFDLEdBQUcsSUFBSTtBQUFBLE1BQ25HO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssMkVBQTJFLE1BQU07QUFDckYsV0FBTztBQUFBLE1BQ04sNkJBQTZCLE9BQU8sRUFBRSxlQUFlLHdCQUF3QixDQUFDLEdBQUcsSUFBSTtBQUFBLE1BQ3JGO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsseURBQXlELE1BQU07QUFDbkUsV0FBTztBQUFBLE1BQ04sNkJBQTZCLGtCQUFrQixJQUFJLE1BQU0sdUJBQXVCLENBQUMsR0FBRyxLQUFLO0FBQUEsTUFDekY7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyx1REFBdUQsTUFBTTtBQUNqRSxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFlBQVk7QUFBQSxRQUNYLEVBQUUsS0FBSyxzQkFBc0IsTUFBTSxtQkFBbUI7QUFBQSxRQUN0RCxFQUFFLEtBQUsscUJBQXFCLE1BQU0sbUJBQW1CO0FBQUEsTUFDdEQ7QUFBQSxNQUNBLHdCQUF3QjtBQUFBLFFBQ3ZCLEVBQUUsS0FBSyxxQkFBcUIsTUFBTSxtQkFBbUI7QUFBQSxRQUNyRCxFQUFFLEtBQUssOEJBQThCLE1BQU0sbUJBQW1CO0FBQUEsTUFDL0Q7QUFBQSxNQUNBLDJCQUEyQjtBQUFBLFFBQzFCLEVBQUUsTUFBTSxtQkFBbUI7QUFBQSxRQUMzQixFQUFFLE1BQU0sbUJBQW1CO0FBQUEsTUFDNUI7QUFBQSxNQUNBLHFCQUFxQjtBQUFBLFFBQ3BCLEVBQUUsS0FBSyxxQkFBcUIsTUFBTSxtQkFBbUI7QUFBQSxRQUNyRCxFQUFFLEtBQUsscUJBQXFCLE1BQU0sdUJBQXVCO0FBQUEsTUFDMUQ7QUFBQSxNQUNBLGtCQUFrQjtBQUFBLFFBQ2pCLEVBQUUsS0FBSyxZQUFZO0FBQUEsUUFDbkIsRUFBRSxLQUFLLFlBQVk7QUFBQSxRQUNuQjtBQUFBLE1BQ0Q7QUFBQSxJQUNELEdBQUc7QUFBQSxNQUNGLFlBQVk7QUFBQSxNQUNaLHdCQUF3QjtBQUFBLE1BQ3hCLDJCQUEyQjtBQUFBLE1BQzNCLHFCQUFxQjtBQUFBLE1BQ3JCLGtCQUFrQjtBQUFBLElBQ25CLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDJEQUEyRCxNQUFNO0FBQ3JFLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsWUFBWSx3QkFBd0IsRUFBRSxNQUFNLG9CQUFvQixLQUFLLDZCQUE2QixDQUFDO0FBQUEsTUFDbkcsUUFBUSx3QkFBd0IsRUFBRSxLQUFLLGlDQUFpQyxDQUFDO0FBQUEsSUFDMUUsR0FBRztBQUFBLE1BQ0YsWUFBWTtBQUFBLE1BQ1osUUFBUTtBQUFBLElBQ1QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
