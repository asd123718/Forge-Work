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
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { getErrorMessage } from "../../../../../base/common/errors.js";
import { Disposable, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { joinPath } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Categories } from "../../../../../platform/action/common/actionCommonCategories.js";
import { Action2 } from "../../../../../platform/actions/common/actions.js";
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from "../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { IAgentHostService } from "../../../../../platform/agentHost/common/agentService.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { createDecorator } from "../../../../../platform/instantiation/common/instantiation.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { INotificationService, Severity } from "../../../../../platform/notification/common/notification.js";
import { IV8InspectProfilingService, Utils } from "../../../../../platform/profiling/common/profiling.js";
import { IsSessionsWindowContext } from "../../../../common/contextkeys.js";
import { IStatusbarService, StatusbarAlignment } from "../../../../services/statusbar/browser/statusbar.js";
import { IEditorService, SIDE_GROUP } from "../../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../../services/environment/common/environmentService.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
var AgentHostProfileState = /* @__PURE__ */ ((AgentHostProfileState2) => {
  AgentHostProfileState2["None"] = "none";
  AgentHostProfileState2["Starting"] = "starting";
  AgentHostProfileState2["Running"] = "running";
  AgentHostProfileState2["Stopping"] = "stopping";
  return AgentHostProfileState2;
})(AgentHostProfileState || {});
const CONTEXT_AGENT_HOST_PROFILE_STATE = new RawContextKey("agentHostProfileState", "none" /* None */);
const IAgentHostProfileService = createDecorator("agentHostProfileService");
let AgentHostProfileService = class extends Disposable {
  constructor(agentHostService, profilingService, contextKeyService, statusbarService, fileDialogService, fileService, editorService, environmentService, notificationService, logService) {
    super();
    this.agentHostService = agentHostService;
    this.profilingService = profilingService;
    this.contextKeyService = contextKeyService;
    this.statusbarService = statusbarService;
    this.fileDialogService = fileDialogService;
    this.fileService = fileService;
    this.editorService = editorService;
    this.environmentService = environmentService;
    this.notificationService = notificationService;
    this.logService = logService;
    this.statusbarEntry = this._register(new MutableDisposable());
    this.profilingNotification = this._register(new MutableDisposable());
    this.isDisposed = false;
    this.profileState = CONTEXT_AGENT_HOST_PROFILE_STATE.bindTo(contextKeyService);
    this._register(toDisposable(() => {
      this.isDisposed = true;
      const sessionId = this.sessionId;
      this.sessionId = void 0;
      this.profileState.set("none" /* None */);
      if (sessionId) {
        void this.profilingService.stopProfiling(sessionId).catch((error) => {
          this.logService.error("Failed to stop the agent host profiling session during disposal", error);
        });
      }
    }));
  }
  startProfiling() {
    if (this.startPromise) {
      return this.startPromise;
    }
    if (this.sessionId) {
      return Promise.resolve();
    }
    this.profileState.set("starting" /* Starting */);
    this.startPromise = this.doStartProfiling().finally(() => this.startPromise = void 0);
    return this.startPromise;
  }
  async doStartProfiling() {
    try {
      const inspectInfo = await this.agentHostService.getInspectInfo(true);
      if (this.isDisposed) {
        return;
      }
      if (!inspectInfo) {
        this.notificationService.warn(localize("profileAgentHost.noInspectPort", "Could not enable the Node.js inspector for the agent host process."));
        this.profileState.set("none" /* None */);
        return;
      }
      const sessionId = await this.profilingService.startProfiling({ host: inspectInfo.host, port: inspectInfo.port });
      if (this.isDisposed) {
        try {
          await this.profilingService.stopProfiling(sessionId);
        } catch (error) {
          this.logService.error("Failed to stop the agent host profiling session during disposal", error);
        }
        return;
      }
      this.sessionId = sessionId;
      this.profileState.set("running" /* Running */);
      this.statusbarEntry.value = this.statusbarService.addEntry({
        name: localize("profileAgentHost.statusName", "Agent Host Profiler"),
        text: localize("profileAgentHost.statusText", "Profiling Agent Host"),
        ariaLabel: localize("profileAgentHost.statusAriaLabel", "Profiling Agent Host. Activate to stop profiling."),
        tooltip: localize("profileAgentHost.statusTooltip", "Click to stop profiling."),
        command: StopAgentHostProfileAction.ID,
        showProgress: true
      }, "status.agentHostProfiler", StatusbarAlignment.RIGHT);
      if (this.contextKeyService.contextMatchesRules(IsSessionsWindowContext)) {
        const handle = this.notificationService.prompt(
          Severity.Info,
          localize("profileAgentHost.notification", "Profiling the local agent host process."),
          [{
            label: localize("profileAgentHost.stop", "Stop"),
            run: () => void this.stopProfiling()
          }],
          {
            sticky: true,
            onCancel: () => void this.stopProfiling()
          }
        );
        this.profilingNotification.value = toDisposable(() => handle.close());
      }
    } catch (error) {
      const sessionId = this.sessionId;
      this.sessionId = void 0;
      this.statusbarEntry.clear();
      this.profilingNotification.clear();
      if (sessionId) {
        try {
          await this.profilingService.stopProfiling(sessionId);
        } catch (stopError) {
          this.logService.error("Failed to clean up the agent host profiling session", stopError);
        }
      }
      if (this.isDisposed) {
        this.logService.error("Failed to start profiling the agent host during disposal", error);
        return;
      }
      this.profileState.set("none" /* None */);
      this.notificationService.error(localize("profileAgentHost.startFailed", "Failed to start profiling the agent host: {0}", getErrorMessage(error)));
    }
  }
  async stopProfiling() {
    const sessionId = this.sessionId;
    if (!sessionId) {
      return;
    }
    this.sessionId = void 0;
    this.profileState.set("stopping" /* Stopping */);
    this.statusbarEntry.clear();
    this.profilingNotification.clear();
    let profile;
    try {
      profile = await this.profilingService.stopProfiling(sessionId);
    } catch (error) {
      this.profileState.set("none" /* None */);
      this.notificationService.error(localize("profileAgentHost.stopFailed", "Failed to stop profiling the agent host: {0}", getErrorMessage(error)));
      return;
    }
    if (this.isDisposed) {
      return;
    }
    try {
      const profileUri = await this.saveProfile(profile);
      if (profileUri) {
        const editor = {
          resource: profileUri,
          options: {
            revealIfOpened: true,
            override: "jsProfileVisualizer.cpuprofile.table"
          }
        };
        if (this.contextKeyService.contextMatchesRules(IsSessionsWindowContext)) {
          await this.editorService.openEditor(editor);
        } else {
          await this.editorService.openEditor(editor, SIDE_GROUP);
        }
      }
    } catch (error) {
      this.notificationService.error(localize("profileAgentHost.saveFailed", "Failed to save or open the agent host profile: {0}", getErrorMessage(error)));
    } finally {
      this.profileState.set("none" /* None */);
    }
  }
  async saveProfile(profile) {
    let profileUri = await this.fileDialogService.showSaveDialog({
      title: localize("profileAgentHost.saveDialogTitle", "Save Agent Host Profile"),
      availableFileSystems: [Schemas.file],
      defaultUri: joinPath(await this.fileDialogService.defaultFilePath(), `AgentHost-CPU-${(/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "")}.cpuprofile`),
      filters: [{
        name: localize("profileAgentHost.cpuProfiles", "CPU Profiles"),
        extensions: ["cpuprofile", "txt"]
      }]
    });
    if (!profileUri) {
      return void 0;
    }
    let dataToWrite = profile;
    if (this.environmentService.isBuilt) {
      dataToWrite = Utils.rewriteAbsolutePaths(dataToWrite, "piiRemoved");
      profileUri = URI.file(`${profileUri.fsPath}.txt`);
    }
    await this.fileService.writeFile(profileUri, VSBuffer.fromString(JSON.stringify(dataToWrite, void 0, "	")));
    return profileUri;
  }
};
AgentHostProfileService = __decorateClass([
  __decorateParam(0, IAgentHostService),
  __decorateParam(1, IV8InspectProfilingService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IStatusbarService),
  __decorateParam(4, IFileDialogService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, IWorkbenchEnvironmentService),
  __decorateParam(8, INotificationService),
  __decorateParam(9, ILogService)
], AgentHostProfileService);
const _ProfileAgentHostAction = class _ProfileAgentHostAction extends Action2 {
  constructor() {
    super({
      id: _ProfileAgentHostAction.ID,
      title: localize2("profileAgentHost", "Profile Local Agent Host Process"),
      category: Categories.Developer,
      f1: true,
      icon: Codicon.circleFilled,
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.or(
          IsSessionsWindowContext,
          ContextKeyExpr.and(
            ChatContextKeys.enabled,
            AGENT_HOST_ENABLED_CONTEXT_KEY
          )
        ),
        CONTEXT_AGENT_HOST_PROFILE_STATE.notEqualsTo("starting" /* Starting */),
        CONTEXT_AGENT_HOST_PROFILE_STATE.notEqualsTo("running" /* Running */),
        CONTEXT_AGENT_HOST_PROFILE_STATE.notEqualsTo("stopping" /* Stopping */)
      )
    });
  }
  run(accessor) {
    return accessor.get(IAgentHostProfileService).startProfiling();
  }
};
_ProfileAgentHostAction.ID = "workbench.action.chat.profileAgentHost";
let ProfileAgentHostAction = _ProfileAgentHostAction;
const _StopAgentHostProfileAction = class _StopAgentHostProfileAction extends Action2 {
  constructor() {
    super({
      id: _StopAgentHostProfileAction.ID,
      title: localize2("stopAgentHostProfile", "Stop Local Agent Host Profile"),
      category: Categories.Developer,
      f1: true,
      icon: Codicon.debugStop,
      precondition: CONTEXT_AGENT_HOST_PROFILE_STATE.isEqualTo("running" /* Running */)
    });
  }
  run(accessor) {
    return accessor.get(IAgentHostProfileService).stopProfiling();
  }
};
_StopAgentHostProfileAction.ID = "workbench.action.chat.stopAgentHostProfile";
let StopAgentHostProfileAction = _StopAgentHostProfileAction;
registerSingleton(IAgentHostProfileService, AgentHostProfileService, InstantiationType.Delayed);
export {
  ProfileAgentHostAction,
  StopAgentHostProfileAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGVsZWN0cm9uLWJyb3dzZXJcXGFjdGlvbnNcXHByb2ZpbGVBZ2VudEhvc3RBY3Rpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9FTkFCTEVEX0NPTlRFWFRfS0VZIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVjhJbnNwZWN0UHJvZmlsaW5nU2VydmljZSwgSVY4UHJvZmlsZSwgVXRpbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9maWxpbmcvY29tbW9uL3Byb2ZpbGluZy5qcyc7XG5pbXBvcnQgeyBJc1Nlc3Npb25zV2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciwgSVN0YXR1c2JhclNlcnZpY2UsIFN0YXR1c2JhckFsaWdubWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuXG5jb25zdCBlbnVtIEFnZW50SG9zdFByb2ZpbGVTdGF0ZSB7XG5cdE5vbmUgPSAnbm9uZScsXG5cdFN0YXJ0aW5nID0gJ3N0YXJ0aW5nJyxcblx0UnVubmluZyA9ICdydW5uaW5nJyxcblx0U3RvcHBpbmcgPSAnc3RvcHBpbmcnLFxufVxuXG5jb25zdCBDT05URVhUX0FHRU5UX0hPU1RfUFJPRklMRV9TVEFURSA9IG5ldyBSYXdDb250ZXh0S2V5PEFnZW50SG9zdFByb2ZpbGVTdGF0ZT4oJ2FnZW50SG9zdFByb2ZpbGVTdGF0ZScsIEFnZW50SG9zdFByb2ZpbGVTdGF0ZS5Ob25lKTtcblxuY29uc3QgSUFnZW50SG9zdFByb2ZpbGVTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElBZ2VudEhvc3RQcm9maWxlU2VydmljZT4oJ2FnZW50SG9zdFByb2ZpbGVTZXJ2aWNlJyk7XG5cbmludGVyZmFjZSBJQWdlbnRIb3N0UHJvZmlsZVNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0c3RhcnRQcm9maWxpbmcoKTogUHJvbWlzZTx2b2lkPjtcblx0c3RvcFByb2ZpbGluZygpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5jbGFzcyBBZ2VudEhvc3RQcm9maWxlU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWdlbnRIb3N0UHJvZmlsZVNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHByb2ZpbGVTdGF0ZTogSUNvbnRleHRLZXk8QWdlbnRIb3N0UHJvZmlsZVN0YXRlPjtcblx0cHJpdmF0ZSByZWFkb25seSBzdGF0dXNiYXJFbnRyeSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJU3RhdHVzYmFyRW50cnlBY2Nlc3Nvcj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvZmlsaW5nTm90aWZpY2F0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSBzZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzdGFydFByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaXNEaXNwb3NlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWdlbnRIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50SG9zdFNlcnZpY2U6IElBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdEBJVjhJbnNwZWN0UHJvZmlsaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2ZpbGluZ1NlcnZpY2U6IElWOEluc3BlY3RQcm9maWxpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJU3RhdHVzYmFyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0YXR1c2JhclNlcnZpY2U6IElTdGF0dXNiYXJTZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5wcm9maWxlU3RhdGUgPSBDT05URVhUX0FHRU5UX0hPU1RfUFJPRklMRV9TVEFURS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmlzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gdGhpcy5zZXNzaW9uSWQ7XG5cdFx0XHR0aGlzLnNlc3Npb25JZCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMucHJvZmlsZVN0YXRlLnNldChBZ2VudEhvc3RQcm9maWxlU3RhdGUuTm9uZSk7XG5cdFx0XHRpZiAoc2Vzc2lvbklkKSB7XG5cdFx0XHRcdHZvaWQgdGhpcy5wcm9maWxpbmdTZXJ2aWNlLnN0b3BQcm9maWxpbmcoc2Vzc2lvbklkKS5jYXRjaChlcnJvciA9PiB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gc3RvcCB0aGUgYWdlbnQgaG9zdCBwcm9maWxpbmcgc2Vzc2lvbiBkdXJpbmcgZGlzcG9zYWwnLCBlcnJvcik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHN0YXJ0UHJvZmlsaW5nKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLnN0YXJ0UHJvbWlzZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc3RhcnRQcm9taXNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5zZXNzaW9uSWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHR0aGlzLnByb2ZpbGVTdGF0ZS5zZXQoQWdlbnRIb3N0UHJvZmlsZVN0YXRlLlN0YXJ0aW5nKTtcblx0XHR0aGlzLnN0YXJ0UHJvbWlzZSA9IHRoaXMuZG9TdGFydFByb2ZpbGluZygpLmZpbmFsbHkoKCkgPT4gdGhpcy5zdGFydFByb21pc2UgPSB1bmRlZmluZWQpO1xuXHRcdHJldHVybiB0aGlzLnN0YXJ0UHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TdGFydFByb2ZpbGluZygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaW5zcGVjdEluZm8gPSBhd2FpdCB0aGlzLmFnZW50SG9zdFNlcnZpY2UuZ2V0SW5zcGVjdEluZm8odHJ1ZSk7XG5cdFx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghaW5zcGVjdEluZm8pIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obG9jYWxpemUoJ3Byb2ZpbGVBZ2VudEhvc3Qubm9JbnNwZWN0UG9ydCcsIFwiQ291bGQgbm90IGVuYWJsZSB0aGUgTm9kZS5qcyBpbnNwZWN0b3IgZm9yIHRoZSBhZ2VudCBob3N0IHByb2Nlc3MuXCIpKTtcblx0XHRcdFx0dGhpcy5wcm9maWxlU3RhdGUuc2V0KEFnZW50SG9zdFByb2ZpbGVTdGF0ZS5Ob25lKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSBhd2FpdCB0aGlzLnByb2ZpbGluZ1NlcnZpY2Uuc3RhcnRQcm9maWxpbmcoeyBob3N0OiBpbnNwZWN0SW5mby5ob3N0LCBwb3J0OiBpbnNwZWN0SW5mby5wb3J0IH0pO1xuXHRcdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucHJvZmlsaW5nU2VydmljZS5zdG9wUHJvZmlsaW5nKHNlc3Npb25JZCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gc3RvcCB0aGUgYWdlbnQgaG9zdCBwcm9maWxpbmcgc2Vzc2lvbiBkdXJpbmcgZGlzcG9zYWwnLCBlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNlc3Npb25JZCA9IHNlc3Npb25JZDtcblx0XHRcdHRoaXMucHJvZmlsZVN0YXRlLnNldChBZ2VudEhvc3RQcm9maWxlU3RhdGUuUnVubmluZyk7XG5cdFx0XHR0aGlzLnN0YXR1c2JhckVudHJ5LnZhbHVlID0gdGhpcy5zdGF0dXNiYXJTZXJ2aWNlLmFkZEVudHJ5KHtcblx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ3Byb2ZpbGVBZ2VudEhvc3Quc3RhdHVzTmFtZScsIFwiQWdlbnQgSG9zdCBQcm9maWxlclwiKSxcblx0XHRcdFx0dGV4dDogbG9jYWxpemUoJ3Byb2ZpbGVBZ2VudEhvc3Quc3RhdHVzVGV4dCcsIFwiUHJvZmlsaW5nIEFnZW50IEhvc3RcIiksXG5cdFx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ3Byb2ZpbGVBZ2VudEhvc3Quc3RhdHVzQXJpYUxhYmVsJywgXCJQcm9maWxpbmcgQWdlbnQgSG9zdC4gQWN0aXZhdGUgdG8gc3RvcCBwcm9maWxpbmcuXCIpLFxuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgncHJvZmlsZUFnZW50SG9zdC5zdGF0dXNUb29sdGlwJywgXCJDbGljayB0byBzdG9wIHByb2ZpbGluZy5cIiksXG5cdFx0XHRcdGNvbW1hbmQ6IFN0b3BBZ2VudEhvc3RQcm9maWxlQWN0aW9uLklELFxuXHRcdFx0XHRzaG93UHJvZ3Jlc3M6IHRydWUsXG5cdFx0XHR9LCAnc3RhdHVzLmFnZW50SG9zdFByb2ZpbGVyJywgU3RhdHVzYmFyQWxpZ25tZW50LlJJR0hUKTtcblx0XHRcdGlmICh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQpKSB7XG5cdFx0XHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFx0U2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRsb2NhbGl6ZSgncHJvZmlsZUFnZW50SG9zdC5ub3RpZmljYXRpb24nLCBcIlByb2ZpbGluZyB0aGUgbG9jYWwgYWdlbnQgaG9zdCBwcm9jZXNzLlwiKSxcblx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwcm9maWxlQWdlbnRIb3N0LnN0b3AnLCBcIlN0b3BcIiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHZvaWQgdGhpcy5zdG9wUHJvZmlsaW5nKCksXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c3RpY2t5OiB0cnVlLFxuXHRcdFx0XHRcdFx0b25DYW5jZWw6ICgpID0+IHZvaWQgdGhpcy5zdG9wUHJvZmlsaW5nKCksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0KTtcblx0XHRcdFx0dGhpcy5wcm9maWxpbmdOb3RpZmljYXRpb24udmFsdWUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4gaGFuZGxlLmNsb3NlKCkpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLnNlc3Npb25JZDtcblx0XHRcdHRoaXMuc2Vzc2lvbklkID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5zdGF0dXNiYXJFbnRyeS5jbGVhcigpO1xuXHRcdFx0dGhpcy5wcm9maWxpbmdOb3RpZmljYXRpb24uY2xlYXIoKTtcblx0XHRcdGlmIChzZXNzaW9uSWQpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnByb2ZpbGluZ1NlcnZpY2Uuc3RvcFByb2ZpbGluZyhzZXNzaW9uSWQpO1xuXHRcdFx0XHR9IGNhdGNoIChzdG9wRXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBjbGVhbiB1cCB0aGUgYWdlbnQgaG9zdCBwcm9maWxpbmcgc2Vzc2lvbicsIHN0b3BFcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gc3RhcnQgcHJvZmlsaW5nIHRoZSBhZ2VudCBob3N0IGR1cmluZyBkaXNwb3NhbCcsIGVycm9yKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5wcm9maWxlU3RhdGUuc2V0KEFnZW50SG9zdFByb2ZpbGVTdGF0ZS5Ob25lKTtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgncHJvZmlsZUFnZW50SG9zdC5zdGFydEZhaWxlZCcsIFwiRmFpbGVkIHRvIHN0YXJ0IHByb2ZpbGluZyB0aGUgYWdlbnQgaG9zdDogezB9XCIsIGdldEVycm9yTWVzc2FnZShlcnJvcikpKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzdG9wUHJvZmlsaW5nKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHRoaXMuc2Vzc2lvbklkO1xuXHRcdGlmICghc2Vzc2lvbklkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXNzaW9uSWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5wcm9maWxlU3RhdGUuc2V0KEFnZW50SG9zdFByb2ZpbGVTdGF0ZS5TdG9wcGluZyk7XG5cdFx0dGhpcy5zdGF0dXNiYXJFbnRyeS5jbGVhcigpO1xuXHRcdHRoaXMucHJvZmlsaW5nTm90aWZpY2F0aW9uLmNsZWFyKCk7XG5cblx0XHRsZXQgcHJvZmlsZTogSVY4UHJvZmlsZTtcblx0XHR0cnkge1xuXHRcdFx0cHJvZmlsZSA9IGF3YWl0IHRoaXMucHJvZmlsaW5nU2VydmljZS5zdG9wUHJvZmlsaW5nKHNlc3Npb25JZCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMucHJvZmlsZVN0YXRlLnNldChBZ2VudEhvc3RQcm9maWxlU3RhdGUuTm9uZSk7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ3Byb2ZpbGVBZ2VudEhvc3Quc3RvcEZhaWxlZCcsIFwiRmFpbGVkIHRvIHN0b3AgcHJvZmlsaW5nIHRoZSBhZ2VudCBob3N0OiB7MH1cIiwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcHJvZmlsZVVyaSA9IGF3YWl0IHRoaXMuc2F2ZVByb2ZpbGUocHJvZmlsZSk7XG5cdFx0XHRpZiAocHJvZmlsZVVyaSkge1xuXHRcdFx0XHRjb25zdCBlZGl0b3IgPSB7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IHByb2ZpbGVVcmksXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0cmV2ZWFsSWZPcGVuZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRvdmVycmlkZTogJ2pzUHJvZmlsZVZpc3VhbGl6ZXIuY3B1cHJvZmlsZS50YWJsZScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhJc1Nlc3Npb25zV2luZG93Q29udGV4dCkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihlZGl0b3IpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGVkaXRvciwgU0lERV9HUk9VUCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdwcm9maWxlQWdlbnRIb3N0LnNhdmVGYWlsZWQnLCBcIkZhaWxlZCB0byBzYXZlIG9yIG9wZW4gdGhlIGFnZW50IGhvc3QgcHJvZmlsZTogezB9XCIsIGdldEVycm9yTWVzc2FnZShlcnJvcikpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5wcm9maWxlU3RhdGUuc2V0KEFnZW50SG9zdFByb2ZpbGVTdGF0ZS5Ob25lKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNhdmVQcm9maWxlKHByb2ZpbGU6IElWOFByb2ZpbGUpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBwcm9maWxlVXJpID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93U2F2ZURpYWxvZyh7XG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3Byb2ZpbGVBZ2VudEhvc3Quc2F2ZURpYWxvZ1RpdGxlJywgXCJTYXZlIEFnZW50IEhvc3QgUHJvZmlsZVwiKSxcblx0XHRcdGF2YWlsYWJsZUZpbGVTeXN0ZW1zOiBbU2NoZW1hcy5maWxlXSxcblx0XHRcdGRlZmF1bHRVcmk6IGpvaW5QYXRoKGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UuZGVmYXVsdEZpbGVQYXRoKCksIGBBZ2VudEhvc3QtQ1BVLSR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnJlcGxhY2UoL1stOl0vZywgJycpfS5jcHVwcm9maWxlYCksXG5cdFx0XHRmaWx0ZXJzOiBbe1xuXHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgncHJvZmlsZUFnZW50SG9zdC5jcHVQcm9maWxlcycsIFwiQ1BVIFByb2ZpbGVzXCIpLFxuXHRcdFx0XHRleHRlbnNpb25zOiBbJ2NwdXByb2ZpbGUnLCAndHh0J10sXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0XHRpZiAoIXByb2ZpbGVVcmkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IGRhdGFUb1dyaXRlID0gcHJvZmlsZTtcblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCkge1xuXHRcdFx0ZGF0YVRvV3JpdGUgPSBVdGlscy5yZXdyaXRlQWJzb2x1dGVQYXRocyhkYXRhVG9Xcml0ZSwgJ3BpaVJlbW92ZWQnKTtcblx0XHRcdHByb2ZpbGVVcmkgPSBVUkkuZmlsZShgJHtwcm9maWxlVXJpLmZzUGF0aH0udHh0YCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUocHJvZmlsZVVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShkYXRhVG9Xcml0ZSwgdW5kZWZpbmVkLCAnXFx0JykpKTtcblx0XHRyZXR1cm4gcHJvZmlsZVVyaTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUHJvZmlsZUFnZW50SG9zdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnByb2ZpbGVBZ2VudEhvc3QnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBQcm9maWxlQWdlbnRIb3N0QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncHJvZmlsZUFnZW50SG9zdCcsIFwiUHJvZmlsZSBMb2NhbCBBZ2VudCBIb3N0IFByb2Nlc3NcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGljb246IENvZGljb24uY2lyY2xlRmlsbGVkLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRcdFx0QUdFTlRfSE9TVF9FTkFCTEVEX0NPTlRFWFRfS0VZLFxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdCksXG5cdFx0XHRcdENPTlRFWFRfQUdFTlRfSE9TVF9QUk9GSUxFX1NUQVRFLm5vdEVxdWFsc1RvKEFnZW50SG9zdFByb2ZpbGVTdGF0ZS5TdGFydGluZyksXG5cdFx0XHRcdENPTlRFWFRfQUdFTlRfSE9TVF9QUk9GSUxFX1NUQVRFLm5vdEVxdWFsc1RvKEFnZW50SG9zdFByb2ZpbGVTdGF0ZS5SdW5uaW5nKSxcblx0XHRcdFx0Q09OVEVYVF9BR0VOVF9IT1NUX1BST0ZJTEVfU1RBVEUubm90RXF1YWxzVG8oQWdlbnRIb3N0UHJvZmlsZVN0YXRlLlN0b3BwaW5nKSxcblx0XHRcdCksXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElBZ2VudEhvc3RQcm9maWxlU2VydmljZSkuc3RhcnRQcm9maWxpbmcoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3RvcEFnZW50SG9zdFByb2ZpbGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5zdG9wQWdlbnRIb3N0UHJvZmlsZSc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFN0b3BBZ2VudEhvc3RQcm9maWxlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc3RvcEFnZW50SG9zdFByb2ZpbGUnLCBcIlN0b3AgTG9jYWwgQWdlbnQgSG9zdCBQcm9maWxlXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRpY29uOiBDb2RpY29uLmRlYnVnU3RvcCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9BR0VOVF9IT1NUX1BST0ZJTEVfU1RBVEUuaXNFcXVhbFRvKEFnZW50SG9zdFByb2ZpbGVTdGF0ZS5SdW5uaW5nKSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSUFnZW50SG9zdFByb2ZpbGVTZXJ2aWNlKS5zdG9wUHJvZmlsaW5nKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUFnZW50SG9zdFByb2ZpbGVTZXJ2aWNlLCBBZ2VudEhvc3RQcm9maWxlU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQXlCLG1CQUFtQixvQkFBb0I7QUFDekUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNDQUFzQztBQUMvQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUE2QixvQkFBb0IscUJBQXFCO0FBQy9FLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsdUJBQXlDO0FBQ2xELFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHNCQUFzQixnQkFBZ0I7QUFDL0MsU0FBUyw0QkFBd0MsYUFBYTtBQUM5RCxTQUFTLCtCQUErQjtBQUN4QyxTQUFrQyxtQkFBbUIsMEJBQTBCO0FBQy9FLFNBQVMsZ0JBQWdCLGtCQUFrQjtBQUMzQyxTQUFTLG9DQUFv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
