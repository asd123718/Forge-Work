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
import { localize } from "../../../../nls.js";
import { Disposable, dispose, DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { INotificationService, Severity, NeverShowAgainScope, NotificationPriority } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { isAbsolute } from "../../../../base/common/path.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
let WorkspaceWatcher = class extends Disposable {
  constructor(fileService, configurationService, contextService, notificationService, openerService, uriIdentityService, hostService, telemetryService) {
    super();
    this.fileService = fileService;
    this.configurationService = configurationService;
    this.contextService = contextService;
    this.notificationService = notificationService;
    this.openerService = openerService;
    this.uriIdentityService = uriIdentityService;
    this.hostService = hostService;
    this.telemetryService = telemetryService;
    this.watchedWorkspaces = new ResourceMap((resource) => this.uriIdentityService.extUri.getComparisonKey(resource));
    this.registerListeners();
    this.refresh();
  }
  registerListeners() {
    this._register(this.contextService.onDidChangeWorkspaceFolders((e) => this.onDidChangeWorkspaceFolders(e)));
    this._register(this.contextService.onDidChangeWorkbenchState(() => this.onDidChangeWorkbenchState()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onDidChangeConfiguration(e)));
    this._register(this.fileService.onDidWatchError((error) => this.onDidWatchError(error)));
  }
  onDidChangeWorkspaceFolders(e) {
    for (const removed of e.removed) {
      this.unwatchWorkspace(removed);
    }
    for (const added of e.added) {
      this.watchWorkspace(added);
    }
  }
  onDidChangeWorkbenchState() {
    this.refresh();
  }
  onDidChangeConfiguration(e) {
    if (e.affectsConfiguration("files.watcherExclude") || e.affectsConfiguration("files.watcherInclude")) {
      this.refresh();
    }
  }
  onDidWatchError(error) {
    const msg = error.toString();
    let reason = void 0;
    if (msg.indexOf("ENOSPC") >= 0) {
      reason = "ENOSPC";
      this.notificationService.prompt(
        Severity.Warning,
        localize("enospcError", "Unable to watch for file changes. Please follow the instructions link to resolve this issue."),
        [{
          label: localize("learnMore", "Instructions"),
          run: () => this.openerService.open(URI.parse("https://go.microsoft.com/fwlink/?linkid=867693"))
        }],
        {
          sticky: true,
          neverShowAgain: { id: "ignoreEnospcError", isSecondary: true, scope: NeverShowAgainScope.WORKSPACE }
        }
      );
    } else if (msg.indexOf("EUNKNOWN") >= 0) {
      reason = "EUNKNOWN";
      this.notificationService.prompt(
        Severity.Warning,
        localize("eshutdownError", "File changes watcher stopped unexpectedly. A reload of the window may enable the watcher again unless the workspace cannot be watched for file changes."),
        [{
          label: localize("reload", "Reload"),
          run: () => this.hostService.reload()
        }],
        {
          sticky: true,
          priority: NotificationPriority.SILENT
          // reduce potential spam since we don't really know how often this fires
        }
      );
    } else if (msg.indexOf("ETERM") >= 0) {
      reason = "ETERM";
    }
    if (reason) {
      this.telemetryService.publicLog2("fileWatcherError", { reason });
    }
  }
  watchWorkspace(workspace) {
    const excludes = [];
    const config = this.configurationService.getValue({ resource: workspace.uri });
    if (config.files?.watcherExclude) {
      for (const key in config.files.watcherExclude) {
        if (key && config.files.watcherExclude[key] === true) {
          excludes.push(key);
        }
      }
    }
    const pathsToWatch = new ResourceMap((uri) => this.uriIdentityService.extUri.getComparisonKey(uri));
    pathsToWatch.set(workspace.uri, workspace.uri);
    if (config.files?.watcherInclude) {
      for (const includePath of config.files.watcherInclude) {
        if (!includePath) {
          continue;
        }
        if (isAbsolute(includePath)) {
          const candidate = URI.file(includePath).with({ scheme: workspace.uri.scheme });
          if (this.uriIdentityService.extUri.isEqualOrParent(candidate, workspace.uri)) {
            pathsToWatch.set(candidate, candidate);
          }
        } else {
          const candidate = workspace.toResource(includePath);
          pathsToWatch.set(candidate, candidate);
        }
      }
    }
    const disposables = new DisposableStore();
    for (const [, pathToWatch] of pathsToWatch) {
      disposables.add(this.fileService.watch(pathToWatch, { recursive: true, excludes }));
    }
    this.watchedWorkspaces.set(workspace.uri, disposables);
  }
  unwatchWorkspace(workspace) {
    if (this.watchedWorkspaces.has(workspace.uri)) {
      dispose(this.watchedWorkspaces.get(workspace.uri));
      this.watchedWorkspaces.delete(workspace.uri);
    }
  }
  refresh() {
    this.unwatchWorkspaces();
    for (const folder of this.contextService.getWorkspace().folders) {
      this.watchWorkspace(folder);
    }
  }
  unwatchWorkspaces() {
    for (const [, disposable] of this.watchedWorkspaces) {
      disposable.dispose();
    }
    this.watchedWorkspaces.clear();
  }
  dispose() {
    super.dispose();
    this.unwatchWorkspaces();
  }
};
WorkspaceWatcher.ID = "workbench.contrib.workspaceWatcher";
WorkspaceWatcher = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, IUriIdentityService),
  __decorateParam(6, IHostService),
  __decorateParam(7, ITelemetryService)
], WorkspaceWatcher);
export {
  WorkspaceWatcher
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFxicm93c2VyXFx3b3Jrc3BhY2VXYXRjaGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIERpc3Bvc2FibGUsIGRpc3Bvc2UsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UsIElGaWxlc0NvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyLCBJV29ya3NwYWNlRm9sZGVyc0NoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5LCBOZXZlclNob3dBZ2FpblNjb3BlLCBOb3RpZmljYXRpb25Qcmlvcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgaXNBYnNvbHV0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcblxuZXhwb3J0IGNsYXNzIFdvcmtzcGFjZVdhdGNoZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIud29ya3NwYWNlV2F0Y2hlcic7XG5cblx0cHJpdmF0ZSByZWFkb25seSB3YXRjaGVkV29ya3NwYWNlcyA9IG5ldyBSZXNvdXJjZU1hcDxJRGlzcG9zYWJsZT4ocmVzb3VyY2UgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmdldENvbXBhcmlzb25LZXkocmVzb3VyY2UpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXG5cdFx0dGhpcy5yZWZyZXNoKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKGUgPT4gdGhpcy5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUoKCkgPT4gdGhpcy5vbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHRoaXMub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZFdhdGNoRXJyb3IoZXJyb3IgPT4gdGhpcy5vbkRpZFdhdGNoRXJyb3IoZXJyb3IpKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyhlOiBJV29ya3NwYWNlRm9sZGVyc0NoYW5nZUV2ZW50KTogdm9pZCB7XG5cblx0XHQvLyBSZW1vdmVkIHdvcmtzcGFjZTogVW53YXRjaFxuXHRcdGZvciAoY29uc3QgcmVtb3ZlZCBvZiBlLnJlbW92ZWQpIHtcblx0XHRcdHRoaXMudW53YXRjaFdvcmtzcGFjZShyZW1vdmVkKTtcblx0XHR9XG5cblx0XHQvLyBBZGRlZCB3b3Jrc3BhY2U6IFdhdGNoXG5cdFx0Zm9yIChjb25zdCBhZGRlZCBvZiBlLmFkZGVkKSB7XG5cdFx0XHR0aGlzLndhdGNoV29ya3NwYWNlKGFkZGVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5yZWZyZXNoKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlOiBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2ZpbGVzLndhdGNoZXJFeGNsdWRlJykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZmlsZXMud2F0Y2hlckluY2x1ZGUnKSkge1xuXHRcdFx0dGhpcy5yZWZyZXNoKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFdhdGNoRXJyb3IoZXJyb3I6IEVycm9yKTogdm9pZCB7XG5cdFx0Y29uc3QgbXNnID0gZXJyb3IudG9TdHJpbmcoKTtcblx0XHRsZXQgcmVhc29uOiAnRU5PU1BDJyB8ICdFVU5LTk9XTicgfCAnRVRFUk0nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gRGV0ZWN0IGlmIHdlIHJ1biBpbnRvIEVOT1NQQyBpc3N1ZXNcblx0XHRpZiAobXNnLmluZGV4T2YoJ0VOT1NQQycpID49IDApIHtcblx0XHRcdHJlYXNvbiA9ICdFTk9TUEMnO1xuXG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0XHRTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRsb2NhbGl6ZSgnZW5vc3BjRXJyb3InLCBcIlVuYWJsZSB0byB3YXRjaCBmb3IgZmlsZSBjaGFuZ2VzLiBQbGVhc2UgZm9sbG93IHRoZSBpbnN0cnVjdGlvbnMgbGluayB0byByZXNvbHZlIHRoaXMgaXNzdWUuXCIpLFxuXHRcdFx0XHRbe1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbGVhcm5Nb3JlJywgXCJJbnN0cnVjdGlvbnNcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UoJ2h0dHBzOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP2xpbmtpZD04Njc2OTMnKSlcblx0XHRcdFx0fV0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzdGlja3k6IHRydWUsXG5cdFx0XHRcdFx0bmV2ZXJTaG93QWdhaW46IHsgaWQ6ICdpZ25vcmVFbm9zcGNFcnJvcicsIGlzU2Vjb25kYXJ5OiB0cnVlLCBzY29wZTogTmV2ZXJTaG93QWdhaW5TY29wZS5XT1JLU1BBQ0UgfVxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdC8vIERldGVjdCB3aGVuIHRoZSB3YXRjaGVyIHRocm93cyBhbiBlcnJvciB1bmV4cGVjdGVkbHlcblx0XHRlbHNlIGlmIChtc2cuaW5kZXhPZignRVVOS05PV04nKSA+PSAwKSB7XG5cdFx0XHRyZWFzb24gPSAnRVVOS05PV04nO1xuXG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0XHRTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRsb2NhbGl6ZSgnZXNodXRkb3duRXJyb3InLCBcIkZpbGUgY2hhbmdlcyB3YXRjaGVyIHN0b3BwZWQgdW5leHBlY3RlZGx5LiBBIHJlbG9hZCBvZiB0aGUgd2luZG93IG1heSBlbmFibGUgdGhlIHdhdGNoZXIgYWdhaW4gdW5sZXNzIHRoZSB3b3Jrc3BhY2UgY2Fubm90IGJlIHdhdGNoZWQgZm9yIGZpbGUgY2hhbmdlcy5cIiksXG5cdFx0XHRcdFt7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdyZWxvYWQnLCBcIlJlbG9hZFwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuaG9zdFNlcnZpY2UucmVsb2FkKClcblx0XHRcdFx0fV0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzdGlja3k6IHRydWUsXG5cdFx0XHRcdFx0cHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5LlNJTEVOVCAvLyByZWR1Y2UgcG90ZW50aWFsIHNwYW0gc2luY2Ugd2UgZG9uJ3QgcmVhbGx5IGtub3cgaG93IG9mdGVuIHRoaXMgZmlyZXNcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHQvLyBEZXRlY3QgdW5leHBlY3RlZCB0ZXJtaW5hdGlvblxuXHRcdGVsc2UgaWYgKG1zZy5pbmRleE9mKCdFVEVSTScpID49IDApIHtcblx0XHRcdHJlYXNvbiA9ICdFVEVSTSc7XG5cdFx0fVxuXG5cdFx0Ly8gTG9nIHRlbGVtZXRyeSBpZiB3ZSBnYXRoZXJlZCBhIHJlYXNvbiAobG9nZ2luZyBpdCBmcm9tIHRoZSByZW5kZXJlclxuXHRcdC8vIGFsbG93cyB1cyB0byBpbnZlc3RpZ2F0ZSB0aGlzIHNpdHVhdGlvbiBpbiBjb250ZXh0IG9mIGV4cGVyaW1lbnRzKVxuXHRcdGlmIChyZWFzb24pIHtcblx0XHRcdHR5cGUgV2F0Y2hFcnJvckNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRvd25lcjogJ2JwYXNlcm8nO1xuXHRcdFx0XHRjb21tZW50OiAnQW4gZXZlbnQgdGhhdCBmaXJlcyB3aGVuIGEgd2F0Y2hlciBlcnJvcnMnO1xuXHRcdFx0XHRyZWFzb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgd2F0Y2hlciBlcnJvciByZWFzb24uJyB9O1xuXHRcdFx0fTtcblx0XHRcdHR5cGUgV2F0Y2hFcnJvckV2ZW50ID0ge1xuXHRcdFx0XHRyZWFzb246IHN0cmluZztcblx0XHRcdH07XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXYXRjaEVycm9yRXZlbnQsIFdhdGNoRXJyb3JDbGFzc2lmaWNhdGlvbj4oJ2ZpbGVXYXRjaGVyRXJyb3InLCB7IHJlYXNvbiB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHdhdGNoV29ya3NwYWNlKHdvcmtzcGFjZTogSVdvcmtzcGFjZUZvbGRlcik6IHZvaWQge1xuXG5cdFx0Ly8gQ29tcHV0ZSB0aGUgd2F0Y2hlciBleGNsdWRlIHJ1bGVzIGZyb20gY29uZmlndXJhdGlvblxuXHRcdGNvbnN0IGV4Y2x1ZGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUZpbGVzQ29uZmlndXJhdGlvbj4oeyByZXNvdXJjZTogd29ya3NwYWNlLnVyaSB9KTtcblx0XHRpZiAoY29uZmlnLmZpbGVzPy53YXRjaGVyRXhjbHVkZSkge1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gY29uZmlnLmZpbGVzLndhdGNoZXJFeGNsdWRlKSB7XG5cdFx0XHRcdGlmIChrZXkgJiYgY29uZmlnLmZpbGVzLndhdGNoZXJFeGNsdWRlW2tleV0gPT09IHRydWUpIHtcblx0XHRcdFx0XHRleGNsdWRlcy5wdXNoKGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBwYXRoc1RvV2F0Y2ggPSBuZXcgUmVzb3VyY2VNYXA8VVJJPih1cmkgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmdldENvbXBhcmlzb25LZXkodXJpKSk7XG5cblx0XHQvLyBBZGQgdGhlIHdvcmtzcGFjZSBhcyBwYXRoIHRvIHdhdGNoXG5cdFx0cGF0aHNUb1dhdGNoLnNldCh3b3Jrc3BhY2UudXJpLCB3b3Jrc3BhY2UudXJpKTtcblxuXHRcdC8vIENvbXB1dGUgYWRkaXRpb25hbCBpbmNsdWRlcyBmcm9tIGNvbmZpZ3VyYXRpb25cblx0XHRpZiAoY29uZmlnLmZpbGVzPy53YXRjaGVySW5jbHVkZSkge1xuXHRcdFx0Zm9yIChjb25zdCBpbmNsdWRlUGF0aCBvZiBjb25maWcuZmlsZXMud2F0Y2hlckluY2x1ZGUpIHtcblx0XHRcdFx0aWYgKCFpbmNsdWRlUGF0aCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQWJzb2x1dGU6IHZlcmlmeSBhIGNoaWxkIG9mIHRoZSB3b3Jrc3BhY2Vcblx0XHRcdFx0aWYgKGlzQWJzb2x1dGUoaW5jbHVkZVBhdGgpKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2FuZGlkYXRlID0gVVJJLmZpbGUoaW5jbHVkZVBhdGgpLndpdGgoeyBzY2hlbWU6IHdvcmtzcGFjZS51cmkuc2NoZW1lIH0pO1xuXHRcdFx0XHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbE9yUGFyZW50KGNhbmRpZGF0ZSwgd29ya3NwYWNlLnVyaSkpIHtcblx0XHRcdFx0XHRcdHBhdGhzVG9XYXRjaC5zZXQoY2FuZGlkYXRlLCBjYW5kaWRhdGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlbGF0aXZlOiBqb2luIGFnYWluc3Qgd29ya3NwYWNlIGZvbGRlclxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBjYW5kaWRhdGUgPSB3b3Jrc3BhY2UudG9SZXNvdXJjZShpbmNsdWRlUGF0aCk7XG5cdFx0XHRcdFx0cGF0aHNUb1dhdGNoLnNldChjYW5kaWRhdGUsIGNhbmRpZGF0ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBXYXRjaCBhbGwgcGF0aHMgYXMgaW5zdHJ1Y3RlZFxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGZvciAoY29uc3QgWywgcGF0aFRvV2F0Y2hdIG9mIHBhdGhzVG9XYXRjaCkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuZmlsZVNlcnZpY2Uud2F0Y2gocGF0aFRvV2F0Y2gsIHsgcmVjdXJzaXZlOiB0cnVlLCBleGNsdWRlcyB9KSk7XG5cdFx0fVxuXHRcdHRoaXMud2F0Y2hlZFdvcmtzcGFjZXMuc2V0KHdvcmtzcGFjZS51cmksIGRpc3Bvc2FibGVzKTtcblx0fVxuXG5cdHByaXZhdGUgdW53YXRjaFdvcmtzcGFjZSh3b3Jrc3BhY2U6IElXb3Jrc3BhY2VGb2xkZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy53YXRjaGVkV29ya3NwYWNlcy5oYXMod29ya3NwYWNlLnVyaSkpIHtcblx0XHRcdGRpc3Bvc2UodGhpcy53YXRjaGVkV29ya3NwYWNlcy5nZXQod29ya3NwYWNlLnVyaSkpO1xuXHRcdFx0dGhpcy53YXRjaGVkV29ya3NwYWNlcy5kZWxldGUod29ya3NwYWNlLnVyaSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoKCk6IHZvaWQge1xuXG5cdFx0Ly8gVW53YXRjaCBhbGwgZmlyc3Rcblx0XHR0aGlzLnVud2F0Y2hXb3Jrc3BhY2VzKCk7XG5cblx0XHQvLyBXYXRjaCBlYWNoIHdvcmtzcGFjZSBmb2xkZXJcblx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMpIHtcblx0XHRcdHRoaXMud2F0Y2hXb3Jrc3BhY2UoZm9sZGVyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVud2F0Y2hXb3Jrc3BhY2VzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgWywgZGlzcG9zYWJsZV0gb2YgdGhpcy53YXRjaGVkV29ya3NwYWNlcykge1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMud2F0Y2hlZFdvcmtzcGFjZXMuY2xlYXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy51bndhdGNoV29ya3NwYWNlcygpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQXNCLFlBQVksU0FBUyx1QkFBdUI7QUFDbEUsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsNkJBQXdEO0FBQ2pFLFNBQVMsb0JBQXlDO0FBQ2xELFNBQVMsZ0NBQWdGO0FBQ3pGLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCLFVBQVUscUJBQXFCLDRCQUE0QjtBQUMxRixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHlCQUF5QjtBQUUzQixJQUFNLG1CQUFOLGNBQStCLFdBQVc7QUFBQSxFQU1oRCxZQUNnQyxhQUNTLHNCQUNHLGdCQUNKLHFCQUNOLGVB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
