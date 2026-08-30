var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { localize, localize2 } from "../../../../nls.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { hasWorkspaceFileExtension, IWorkspaceContextService, WorkbenchState, WORKSPACE_SUFFIX } from "../../../../platform/workspace/common/workspace.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { INotificationService, NeverShowAgainScope, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { isEqual, joinPath } from "../../../../base/common/resources.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope } from "../../../../platform/storage/common/storage.js";
import { isVirtualWorkspace } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ActiveEditorContext, IsSessionsWindowContext, ResourceContextKey, TemporaryWorkspaceContext } from "../../../common/contextkeys.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { TEXT_FILE_EDITOR_ID } from "../../files/common/files.js";
import "./recentRemoteFolderPruner.js";
let WorkspacesFinderContribution = class extends Disposable {
  constructor(contextService, notificationService, fileService, quickInputService, hostService, storageService) {
    super();
    this.contextService = contextService;
    this.notificationService = notificationService;
    this.fileService = fileService;
    this.quickInputService = quickInputService;
    this.hostService = hostService;
    this.storageService = storageService;
    this.findWorkspaces();
  }
  async findWorkspaces() {
    const folder = this.contextService.getWorkspace().folders[0];
    if (!folder || this.contextService.getWorkbenchState() !== WorkbenchState.FOLDER || isVirtualWorkspace(this.contextService.getWorkspace())) {
      return;
    }
    const rootFileNames = (await this.fileService.resolve(folder.uri)).children?.map((child) => child.name);
    if (Array.isArray(rootFileNames)) {
      const workspaceFiles = rootFileNames.filter(hasWorkspaceFileExtension);
      if (workspaceFiles.length > 0) {
        this.doHandleWorkspaceFiles(folder.uri, workspaceFiles);
      }
    }
  }
  doHandleWorkspaceFiles(folder, workspaces) {
    const neverShowAgain = { id: "workspaces.dontPromptToOpen", scope: NeverShowAgainScope.WORKSPACE, isSecondary: true };
    if (workspaces.length === 1) {
      const workspaceFile = workspaces[0];
      this.notificationService.prompt(Severity.Info, localize(
        {
          key: "foundWorkspace",
          comment: ['{Locked="]({1})"}']
        },
        "This folder contains a workspace file '{0}'. Do you want to open it? [Learn more]({1}) about workspace files.",
        workspaceFile,
        "https://go.microsoft.com/fwlink/?linkid=2025315"
      ), [{
        label: localize("openWorkspace", "Open Workspace"),
        run: () => this.hostService.openWindow([{ workspaceUri: joinPath(folder, workspaceFile) }])
      }], {
        neverShowAgain,
        priority: !this.storageService.isNew(StorageScope.WORKSPACE) ? NotificationPriority.SILENT : NotificationPriority.OPTIONAL
        // https://github.com/microsoft/vscode/issues/125315
      });
    } else if (workspaces.length > 1) {
      this.notificationService.prompt(Severity.Info, localize({
        key: "foundWorkspaces",
        comment: ['{Locked="]({0})"}']
      }, "This folder contains multiple workspace files. Do you want to open one? [Learn more]({0}) about workspace files.", "https://go.microsoft.com/fwlink/?linkid=2025315"), [{
        label: localize("selectWorkspace", "Select Workspace"),
        run: () => {
          this.quickInputService.pick(
            workspaces.map((workspace) => ({ label: workspace })),
            { placeHolder: localize("selectToOpen", "Select a workspace to open") }
          ).then((pick) => {
            if (pick) {
              this.hostService.openWindow([{ workspaceUri: joinPath(folder, pick.label) }]);
            }
          });
        }
      }], {
        neverShowAgain,
        priority: !this.storageService.isNew(StorageScope.WORKSPACE) ? NotificationPriority.SILENT : NotificationPriority.OPTIONAL
        // https://github.com/microsoft/vscode/issues/125315
      });
    }
  }
};
WorkspacesFinderContribution = __decorateClass([
  __decorateParam(0, IWorkspaceContextService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, IHostService),
  __decorateParam(5, IStorageService)
], WorkspacesFinderContribution);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspacesFinderContribution, LifecyclePhase.Eventually);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.openWorkspaceFromEditor",
      title: localize2("openWorkspace", "Open Workspace"),
      f1: false,
      menu: {
        id: MenuId.EditorContent,
        when: ContextKeyExpr.and(
          ResourceContextKey.Extension.isEqualTo(WORKSPACE_SUFFIX),
          ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID),
          TemporaryWorkspaceContext.toNegated(),
          IsSessionsWindowContext.toNegated()
        )
      }
    });
  }
  async run(accessor, uri) {
    const hostService = accessor.get(IHostService);
    const contextService = accessor.get(IWorkspaceContextService);
    const notificationService = accessor.get(INotificationService);
    if (contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      const workspaceConfiguration = contextService.getWorkspace().configuration;
      if (workspaceConfiguration && isEqual(workspaceConfiguration, uri)) {
        notificationService.info(localize("alreadyOpen", "This workspace is already open."));
        return;
      }
    }
    return hostService.openWindow([{ workspaceUri: uri }]);
  }
});
export {
  WorkspacesFinderContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHdvcmtzcGFjZXNcXGJyb3dzZXJcXHdvcmtzcGFjZXMuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMsIElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGhhc1dvcmtzcGFjZUZpbGVFeHRlbnNpb24sIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUsIFdPUktTUEFDRV9TVUZGSVggfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTmV2ZXJTaG93QWdhaW5PcHRpb25zLCBJTm90aWZpY2F0aW9uU2VydmljZSwgTmV2ZXJTaG93QWdhaW5TY29wZSwgTm90aWZpY2F0aW9uUHJpb3JpdHksIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGlzRXF1YWwsIGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBpc1ZpcnR1YWxXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3ZpcnR1YWxXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEFjdGl2ZUVkaXRvckNvbnRleHQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LCBSZXNvdXJjZUNvbnRleHRLZXksIFRlbXBvcmFyeVdvcmtzcGFjZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFRFWFRfRklMRV9FRElUT1JfSUQgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0ICcuL3JlY2VudFJlbW90ZUZvbGRlclBydW5lci5qcyc7XG5cbi8qKlxuICogQSB3b3JrYmVuY2ggY29udHJpYnV0aW9uIHRoYXQgd2lsbCBsb29rIGZvciBgLmNvZGUtd29ya3NwYWNlYCBmaWxlcyBpbiB0aGUgcm9vdCBvZiB0aGVcbiAqIHdvcmtzcGFjZSBmb2xkZXIgYW5kIG9wZW4gYSBub3RpZmljYXRpb24gdG8gc3VnZ2VzdCB0byBvcGVuIG9uZSBvZiB0aGUgd29ya3NwYWNlcy5cbiAqL1xuZXhwb3J0IGNsYXNzIFdvcmtzcGFjZXNGaW5kZXJDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZmluZFdvcmtzcGFjZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZmluZFdvcmtzcGFjZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZm9sZGVyID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzWzBdO1xuXHRcdGlmICghZm9sZGVyIHx8IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRk9MREVSIHx8IGlzVmlydHVhbFdvcmtzcGFjZSh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKSkge1xuXHRcdFx0cmV0dXJuOyAvLyByZXF1aXJlIGEgc2luZ2xlIChub24gdmlydHVhbCkgcm9vdCBmb2xkZXJcblx0XHR9XG5cblx0XHRjb25zdCByb290RmlsZU5hbWVzID0gKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShmb2xkZXIudXJpKSkuY2hpbGRyZW4/Lm1hcChjaGlsZCA9PiBjaGlsZC5uYW1lKTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShyb290RmlsZU5hbWVzKSkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRmlsZXMgPSByb290RmlsZU5hbWVzLmZpbHRlcihoYXNXb3Jrc3BhY2VGaWxlRXh0ZW5zaW9uKTtcblx0XHRcdGlmICh3b3Jrc3BhY2VGaWxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuZG9IYW5kbGVXb3Jrc3BhY2VGaWxlcyhmb2xkZXIudXJpLCB3b3Jrc3BhY2VGaWxlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb0hhbmRsZVdvcmtzcGFjZUZpbGVzKGZvbGRlcjogVVJJLCB3b3Jrc3BhY2VzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGNvbnN0IG5ldmVyU2hvd0FnYWluOiBJTmV2ZXJTaG93QWdhaW5PcHRpb25zID0geyBpZDogJ3dvcmtzcGFjZXMuZG9udFByb21wdFRvT3BlbicsIHNjb3BlOiBOZXZlclNob3dBZ2FpblNjb3BlLldPUktTUEFDRSwgaXNTZWNvbmRhcnk6IHRydWUgfTtcblxuXHRcdC8vIFByb21wdCB0byBvcGVuIG9uZSB3b3Jrc3BhY2Vcblx0XHRpZiAod29ya3NwYWNlcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZpbGUgPSB3b3Jrc3BhY2VzWzBdO1xuXG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFNldmVyaXR5LkluZm8sIGxvY2FsaXplKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2V5OiAnZm91bmRXb3Jrc3BhY2UnLFxuXHRcdFx0XHRcdGNvbW1lbnQ6IFsne0xvY2tlZD1cIl0oezF9KVwifSddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdFwiVGhpcyBmb2xkZXIgY29udGFpbnMgYSB3b3Jrc3BhY2UgZmlsZSAnezB9Jy4gRG8geW91IHdhbnQgdG8gb3BlbiBpdD8gW0xlYXJuIG1vcmVdKHsxfSkgYWJvdXQgd29ya3NwYWNlIGZpbGVzLlwiLFxuXHRcdFx0XHR3b3Jrc3BhY2VGaWxlLFxuXHRcdFx0XHQnaHR0cHM6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/bGlua2lkPTIwMjUzMTUnXG5cdFx0XHQpLCBbe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ29wZW5Xb3Jrc3BhY2UnLCBcIk9wZW4gV29ya3NwYWNlXCIpLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMuaG9zdFNlcnZpY2Uub3BlbldpbmRvdyhbeyB3b3Jrc3BhY2VVcmk6IGpvaW5QYXRoKGZvbGRlciwgd29ya3NwYWNlRmlsZSkgfV0pXG5cdFx0XHR9XSwge1xuXHRcdFx0XHRuZXZlclNob3dBZ2Fpbixcblx0XHRcdFx0cHJpb3JpdHk6ICF0aGlzLnN0b3JhZ2VTZXJ2aWNlLmlzTmV3KFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpID8gTm90aWZpY2F0aW9uUHJpb3JpdHkuU0lMRU5UIDogTm90aWZpY2F0aW9uUHJpb3JpdHkuT1BUSU9OQUwgLy8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyNTMxNVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gUHJvbXB0IHRvIHNlbGVjdCBhIHdvcmtzcGFjZSBmcm9tIG1hbnlcblx0XHRlbHNlIGlmICh3b3Jrc3BhY2VzLmxlbmd0aCA+IDEpIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuSW5mbywgbG9jYWxpemUoe1xuXHRcdFx0XHRrZXk6ICdmb3VuZFdvcmtzcGFjZXMnLFxuXHRcdFx0XHRjb21tZW50OiBbJ3tMb2NrZWQ9XCJdKHswfSlcIn0nXVxuXHRcdFx0fSwgXCJUaGlzIGZvbGRlciBjb250YWlucyBtdWx0aXBsZSB3b3Jrc3BhY2UgZmlsZXMuIERvIHlvdSB3YW50IHRvIG9wZW4gb25lPyBbTGVhcm4gbW9yZV0oezB9KSBhYm91dCB3b3Jrc3BhY2UgZmlsZXMuXCIsICdodHRwczovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9saW5raWQ9MjAyNTMxNScpLCBbe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NlbGVjdFdvcmtzcGFjZScsIFwiU2VsZWN0IFdvcmtzcGFjZVwiKSxcblx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5xdWlja0lucHV0U2VydmljZS5waWNrKFxuXHRcdFx0XHRcdFx0d29ya3NwYWNlcy5tYXAod29ya3NwYWNlID0+ICh7IGxhYmVsOiB3b3Jrc3BhY2UgfSBzYXRpc2ZpZXMgSVF1aWNrUGlja0l0ZW0pKSxcblx0XHRcdFx0XHRcdHsgcGxhY2VIb2xkZXI6IGxvY2FsaXplKCdzZWxlY3RUb09wZW4nLCBcIlNlbGVjdCBhIHdvcmtzcGFjZSB0byBvcGVuXCIpIH0pLnRoZW4ocGljayA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChwaWNrKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5ob3N0U2VydmljZS5vcGVuV2luZG93KFt7IHdvcmtzcGFjZVVyaTogam9pblBhdGgoZm9sZGVyLCBwaWNrLmxhYmVsKSB9XSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XSwge1xuXHRcdFx0XHRuZXZlclNob3dBZ2Fpbixcblx0XHRcdFx0cHJpb3JpdHk6ICF0aGlzLnN0b3JhZ2VTZXJ2aWNlLmlzTmV3KFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpID8gTm90aWZpY2F0aW9uUHJpb3JpdHkuU0lMRU5UIDogTm90aWZpY2F0aW9uUHJpb3JpdHkuT1BUSU9OQUwgLy8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyNTMxNVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihXb3Jrc3BhY2VzRmluZGVyQ29udHJpYnV0aW9uLCBMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KTtcblxuLy8gUmVuZGVyIFwiT3BlbiBXb3Jrc3BhY2VcIiBidXR0b24gaW4gKi5jb2RlLXdvcmtzcGFjZSBmaWxlc1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5Xb3Jrc3BhY2VGcm9tRWRpdG9yJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW5Xb3Jrc3BhY2UnLCBcIk9wZW4gV29ya3NwYWNlXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvckNvbnRlbnQsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRSZXNvdXJjZUNvbnRleHRLZXkuRXh0ZW5zaW9uLmlzRXF1YWxUbyhXT1JLU1BBQ0VfU1VGRklYKSxcblx0XHRcdFx0XHRBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhURVhUX0ZJTEVfRURJVE9SX0lEKSxcblx0XHRcdFx0XHRUZW1wb3JhcnlXb3Jrc3BhY2VDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpXG5cdFx0XHRcdClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdXJpOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBob3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJSG9zdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRleHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cblx0XHRpZiAoY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VDb25maWd1cmF0aW9uID0gY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuY29uZmlndXJhdGlvbjtcblx0XHRcdGlmICh3b3Jrc3BhY2VDb25maWd1cmF0aW9uICYmIGlzRXF1YWwod29ya3NwYWNlQ29uZmlndXJhdGlvbiwgdXJpKSkge1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obG9jYWxpemUoJ2FscmVhZHlPcGVuJywgXCJUaGlzIHdvcmtzcGFjZSBpcyBhbHJlYWR5IG9wZW4uXCIpKTtcblxuXHRcdFx0XHRyZXR1cm47IC8vIHdvcmtzcGFjZSBhbHJlYWR5IG9wZW5lZFxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBob3N0U2VydmljZS5vcGVuV2luZG93KFt7IHdvcmtzcGFjZVVyaTogdXJpIH1dKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUFjLDJCQUFvRjtBQUMzRyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQiwwQkFBMEIsZ0JBQWdCLHdCQUF3QjtBQUN0RyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG9CQUFvQjtBQUM3QixTQUFpQyxzQkFBc0IscUJBQXFCLHNCQUFzQixnQkFBZ0I7QUFFbEgsU0FBUyxTQUFTLGdCQUFnQjtBQUNsQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDBCQUEwQztBQUNuRCxTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBRWpELFNBQVMscUJBQXFCLHlCQUF5Qixv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
