import assert from "assert";
import { observableValue } from "../../../../../base/common/observable.js";
import { basename, extUri } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { WorkspaceFolder } from "../../../../../platform/workspace/common/workspace.js";
import { SessionsWorkspaceFolderLabelService } from "../../browser/workspaceFolderLabelService.js";
suite("Sessions - Workspace Folder Label Service", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("uses repository identity for plain and verbose worktree labels", () => {
    const repository = URI.file("/repos/vscode-tools");
    const workingDirectory = URI.file("/worktrees/add-sandeep-to-readme-26eb9789");
    const session = new class extends mock() {
      constructor() {
        super(...arguments);
        this.workspace = observableValue(this, {
          uri: repository,
          label: "vscode-tools",
          icon: { id: "folder" },
          folders: [{
            root: repository,
            workingDirectory,
            name: "microsoft/vscode-tools",
            description: void 0,
            gitRepository: {
              uri: repository,
              workTreeUri: workingDirectory,
              branchName: "add-sandeep-to-readme-26eb9789",
              baseBranchName: void 0,
              gitHubInfo: observableValue(this, void 0)
            }
          }],
          requiresWorkspaceTrust: false,
          isVirtualWorkspace: false
        });
      }
    }();
    const sessionsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = observableValue(this, new class extends mock() {
          constructor() {
            super(...arguments);
            this.workspace = session.workspace;
          }
        }());
      }
    }();
    const uriIdentityService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.extUri = extUri;
      }
    }();
    const labelService = new class extends mock() {
      getUriBasenameLabel(resource) {
        return basename(resource);
      }
    }();
    const sessionsManagementService = new class extends mock() {
      getSessions() {
        return [session];
      }
    }();
    const service = new SessionsWorkspaceFolderLabelService(sessionsService, sessionsManagementService, uriIdentityService, labelService);
    const workspaceFolder = new WorkspaceFolder({ uri: workingDirectory, name: "vscode-tools (add-sandeep-to-readme-26eb9789)", index: 0 });
    assert.deepStrictEqual({
      plain: service.getWorkspaceFolderLabel(workspaceFolder),
      verbose: service.getWorkspaceFolderLabel(workspaceFolder, true)
    }, {
      plain: "microsoft/vscode-tools",
      verbose: "microsoft/vscode-tools (add-sandeep-to-readme-26eb9789)"
    });
  });
  test("falls back to a managed session when the active session does not own the folder", () => {
    const repository = URI.file("/repos/vscode-tools");
    const workingDirectory = URI.file("/worktrees/feature");
    const session = new class extends mock() {
      constructor() {
        super(...arguments);
        this.workspace = observableValue(this, {
          uri: repository,
          label: "vscode-tools",
          icon: { id: "folder" },
          folders: [{ root: repository, workingDirectory, name: "vscode-tools", description: void 0 }],
          requiresWorkspaceTrust: false,
          isVirtualWorkspace: false
        });
      }
    }();
    const sessionsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = observableValue(this, void 0);
      }
    }();
    const sessionsManagementService = new class extends mock() {
      getSessions() {
        return [session];
      }
    }();
    const uriIdentityService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.extUri = extUri;
      }
    }();
    const labelService = new class extends mock() {
      getUriBasenameLabel(resource) {
        return basename(resource);
      }
    }();
    const service = new SessionsWorkspaceFolderLabelService(sessionsService, sessionsManagementService, uriIdentityService, labelService);
    assert.strictEqual(service.getWorkspaceFolderLabel(new WorkspaceFolder({ uri: workingDirectory, name: "feature", index: 0 })), "vscode-tools");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcc2VydmljZXNcXHdvcmtzcGFjZUZvbGRlckxhYmVsXFx0ZXN0XFxicm93c2VyXFx3b3Jrc3BhY2VGb2xkZXJMYWJlbFNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGV4dFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uLCBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25zV29ya3NwYWNlRm9sZGVyTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci93b3Jrc3BhY2VGb2xkZXJMYWJlbFNlcnZpY2UuanMnO1xuXG5zdWl0ZSgnU2Vzc2lvbnMgLSBXb3Jrc3BhY2UgRm9sZGVyIExhYmVsIFNlcnZpY2UnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3VzZXMgcmVwb3NpdG9yeSBpZGVudGl0eSBmb3IgcGxhaW4gYW5kIHZlcmJvc2Ugd29ya3RyZWUgbGFiZWxzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSBVUkkuZmlsZSgnL3JlcG9zL3ZzY29kZS10b29scycpO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkuZmlsZSgnL3dvcmt0cmVlcy9hZGQtc2FuZGVlcC10by1yZWFkbWUtMjZlYjk3ODknKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbj4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSB3b3Jrc3BhY2UgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywge1xuXHRcdFx0XHR1cmk6IHJlcG9zaXRvcnksXG5cdFx0XHRcdGxhYmVsOiAndnNjb2RlLXRvb2xzJyxcblx0XHRcdFx0aWNvbjogeyBpZDogJ2ZvbGRlcicgfSxcblx0XHRcdFx0Zm9sZGVyczogW3tcblx0XHRcdFx0XHRyb290OiByZXBvc2l0b3J5LFxuXHRcdFx0XHRcdHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdFx0bmFtZTogJ21pY3Jvc29mdC92c2NvZGUtdG9vbHMnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Z2l0UmVwb3NpdG9yeToge1xuXHRcdFx0XHRcdFx0dXJpOiByZXBvc2l0b3J5LFxuXHRcdFx0XHRcdFx0d29ya1RyZWVVcmk6IHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdFx0XHRicmFuY2hOYW1lOiAnYWRkLXNhbmRlZXAtdG8tcmVhZG1lLTI2ZWI5Nzg5Jyxcblx0XHRcdFx0XHRcdGJhc2VCcmFuY2hOYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRnaXRIdWJJbmZvOiBvYnNlcnZhYmxlVmFsdWUodGhpcywgdW5kZWZpbmVkKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiBmYWxzZSxcblx0XHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH07XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KHRoaXMsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjdGl2ZVNlc3Npb24+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSB3b3Jrc3BhY2UgPSBzZXNzaW9uLndvcmtzcGFjZTtcblx0XHRcdH0pO1xuXHRcdH07XG5cdFx0Y29uc3QgdXJpSWRlbnRpdHlTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVXJpSWRlbnRpdHlTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGV4dFVyaSA9IGV4dFVyaTtcblx0XHR9O1xuXHRcdGNvbnN0IGxhYmVsU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhYmVsU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRVcmlCYXNlbmFtZUxhYmVsKHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRcdFx0XHRyZXR1cm4gYmFzZW5hbWUocmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3Qgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7XG5cdFx0XHRcdHJldHVybiBbc2Vzc2lvbl07XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFNlc3Npb25zV29ya3NwYWNlRm9sZGVyTGFiZWxTZXJ2aWNlKHNlc3Npb25zU2VydmljZSwgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IG5ldyBXb3Jrc3BhY2VGb2xkZXIoeyB1cmk6IHdvcmtpbmdEaXJlY3RvcnksIG5hbWU6ICd2c2NvZGUtdG9vbHMgKGFkZC1zYW5kZWVwLXRvLXJlYWRtZS0yNmViOTc4OSknLCBpbmRleDogMCB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGxhaW46IHNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyTGFiZWwod29ya3NwYWNlRm9sZGVyKSxcblx0XHRcdHZlcmJvc2U6IHNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyTGFiZWwod29ya3NwYWNlRm9sZGVyLCB0cnVlKSxcblx0XHR9LCB7XG5cdFx0XHRwbGFpbjogJ21pY3Jvc29mdC92c2NvZGUtdG9vbHMnLFxuXHRcdFx0dmVyYm9zZTogJ21pY3Jvc29mdC92c2NvZGUtdG9vbHMgKGFkZC1zYW5kZWVwLXRvLXJlYWRtZS0yNmViOTc4OSknLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIGEgbWFuYWdlZCBzZXNzaW9uIHdoZW4gdGhlIGFjdGl2ZSBzZXNzaW9uIGRvZXMgbm90IG93biB0aGUgZm9sZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSBVUkkuZmlsZSgnL3JlcG9zL3ZzY29kZS10b29scycpO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkuZmlsZSgnL3dvcmt0cmVlcy9mZWF0dXJlJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb24+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgd29ya3NwYWNlID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHtcblx0XHRcdFx0dXJpOiByZXBvc2l0b3J5LFxuXHRcdFx0XHRsYWJlbDogJ3ZzY29kZS10b29scycsXG5cdFx0XHRcdGljb246IHsgaWQ6ICdmb2xkZXInIH0sXG5cdFx0XHRcdGZvbGRlcnM6IFt7IHJvb3Q6IHJlcG9zaXRvcnksIHdvcmtpbmdEaXJlY3RvcnksIG5hbWU6ICd2c2NvZGUtdG9vbHMnLCBkZXNjcmlwdGlvbjogdW5kZWZpbmVkIH1dLFxuXHRcdFx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiBmYWxzZSxcblx0XHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH07XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdFx0fTtcblx0XHRjb25zdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHtcblx0XHRcdFx0cmV0dXJuIFtzZXNzaW9uXTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHVyaUlkZW50aXR5U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVVyaUlkZW50aXR5U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBleHRVcmkgPSBleHRVcmk7XG5cdFx0fTtcblx0XHRjb25zdCBsYWJlbFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYWJlbFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0VXJpQmFzZW5hbWVMYWJlbChyZXNvdXJjZTogVVJJKTogc3RyaW5nIHtcblx0XHRcdFx0cmV0dXJuIGJhc2VuYW1lKHJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgU2Vzc2lvbnNXb3Jrc3BhY2VGb2xkZXJMYWJlbFNlcnZpY2Uoc2Vzc2lvbnNTZXJ2aWNlLCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIGxhYmVsU2VydmljZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXJMYWJlbChuZXcgV29ya3NwYWNlRm9sZGVyKHsgdXJpOiB3b3JraW5nRGlyZWN0b3J5LCBuYW1lOiAnZmVhdHVyZScsIGluZGV4OiAwIH0pKSwgJ3ZzY29kZS10b29scycpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsVUFBVSxjQUFjO0FBQ2pDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLFlBQVk7QUFHckIsU0FBUyx1QkFBdUI7QUFJaEMsU0FBUywyQ0FBMkM7QUFFcEQsTUFBTSw2Q0FBNkMsTUFBTTtBQUN4RCwwQ0FBd0M7QUFFeEMsT0FBSyxrRUFBa0UsTUFBTTtBQUM1RSxVQUFNLGFBQWEsSUFBSSxLQUFLLHFCQUFxQjtBQUNqRCxVQUFNLG1CQUFtQixJQUFJLEtBQUssMkNBQTJDO0FBQzdFLFVBQU0sVUFBVSxJQUFJLGNBQWMsS0FBZSxFQUFFO0FBQUEsTUFBL0I7QUFBQTtBQUNuQixhQUFrQixZQUFZLGdCQUFnQixNQUFNO0FBQUEsVUFDbkQsS0FBSztBQUFBLFVBQ0wsT0FBTztBQUFBLFVBQ1AsTUFBTSxFQUFFLElBQUksU0FBUztBQUFBLFVBQ3JCLFNBQVMsQ0FBQztBQUFBLFlBQ1QsTUFBTTtBQUFBLFlBQ047QUFBQSxZQUNBLE1BQU07QUFBQSxZQUNOLGFBQWE7QUFBQSxZQUNiLGVBQWU7QUFBQSxjQUNkLEtBQUs7QUFBQSxjQUNMLGFBQWE7QUFBQSxjQUNiLFlBQVk7QUFBQSxjQUNaLGdCQUFnQjtBQUFBLGNBQ2hCLFlBQVksZ0JBQWdCLE1BQU0sTUFBUztBQUFBLFlBQzVDO0FBQUEsVUFDRCxDQUFDO0FBQUEs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
