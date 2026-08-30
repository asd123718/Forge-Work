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
import { DeferredPromise } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { derived, waitForState } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IAutomationService } from "../../../../workbench/contrib/chat/common/automations/automationService.js";
import { publishAutomationRun, publishAutomationRunError } from "../../../../workbench/contrib/chat/common/automations/automationTelemetry.js";
import { SessionStatus } from "../../../services/sessions/common/session.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
let AutomationRunner = class {
  constructor(automationService, sessionsManagementService, logService, telemetryService, notificationService) {
    this.automationService = automationService;
    this.sessionsManagementService = sessionsManagementService;
    this.logService = logService;
    this.telemetryService = telemetryService;
    this.notificationService = notificationService;
  }
  runOnce(automation, trigger, leaderWindowId, token = CancellationToken.None) {
    const dispatched = new DeferredPromise();
    return {
      whenDispatched: dispatched.p,
      whenCompleted: this._runOnce(automation, trigger, leaderWindowId, token, dispatched)
    };
  }
  async _runOnce(automation, trigger, leaderWindowId, token, dispatched) {
    try {
      await this._runOnceInner(automation, trigger, leaderWindowId, token, dispatched);
    } catch (err) {
      this.logService.error(`[AutomationRunner] unexpected error in runOnce for ${automation.id}`, err);
    } finally {
      await dispatched.complete({ kind: "notStarted", reason: "error" });
    }
  }
  async _runOnceInner(automation, trigger, leaderWindowId, token, dispatched) {
    const startTimeMs = Date.now();
    let runId;
    try {
      if (!this.automationService.getAutomation(automation.id)) {
        this.logService.trace(`[AutomationRunner] skipping ${automation.id}: automation was deleted.`);
        await dispatched.complete({ kind: "notStarted", reason: "deleted" });
        return;
      }
      const target = automation.target;
      const isolationMode = target.kind === "workspace" ? target.isolation.kind === "folder" ? "workspace" : target.isolation.kind === "worktree" ? "worktree" : void 0 : void 0;
      const branch = target.kind === "workspace" && target.isolation.kind === "worktree" ? target.isolation.branch : void 0;
      const createOptions = target.providerId !== void 0 || target.sessionTypeId !== void 0 || automation.modelId !== void 0 || automation.mode !== void 0 || automation.permissionLevel !== void 0 || isolationMode !== void 0 || branch !== void 0 ? {
        providerId: target.providerId,
        sessionTypeId: target.sessionTypeId,
        modelId: automation.modelId,
        modeId: automation.mode,
        permissionLevel: automation.permissionLevel,
        isolationMode,
        branch
      } : void 0;
      const targetAvailable = target.kind === "quickChat" ? this.sessionsManagementService.isQuickChatTargetAvailable(createOptions) : this.sessionsManagementService.isNewSessionTargetAvailable(target.folderUri, createOptions);
      if (!targetAvailable) {
        this.logService.trace(`[AutomationRunner] deferring ${automation.id}: target is not yet advertised.`);
        if (trigger === "manual") {
          this.notificationService.info(localize("automationTargetUnavailable", "Automation '{0}' cannot start until its agent becomes available.", automation.name));
        }
        await dispatched.complete({ kind: "notStarted", reason: "targetUnavailable" });
        return;
      }
      const claim = await this.automationService.recordRunStart(automation.id, trigger, leaderWindowId);
      if (!claim.claimed) {
        this.logService.trace(`[AutomationRunner] skipping ${automation.id}: active run already exists.`);
        await dispatched.complete({ kind: "alreadyRunning", activeRun: claim.run });
        return;
      }
      runId = claim.run.id;
      const run = await this.automationService.updateRun(runId, { status: "running" }) ?? claim.run;
      this.logService.info(`[AutomationRunner] claimed run ${runId} for automation ${automation.id}: trigger=${trigger}, leaderWindowId=${leaderWindowId}.`);
      if (token.isCancellationRequested) {
        await dispatched.complete({ kind: "notStarted", reason: "cancelled", run });
        await this._markCancelled(runId, trigger, automation, startTimeMs);
        return;
      }
      const options = {
        query: automation.prompt,
        background: true,
        title: automation.name?.substring(0, 100)
      };
      this.logService.trace(`[AutomationRunner] running ${automation.id}: target=${target.kind}, provider=${createOptions?.providerId ?? "(default)"}, sessionType=${createOptions?.sessionTypeId ?? "(default)"}, model=${createOptions?.modelId ?? "(default)"}, mode=${createOptions?.modeId ?? "(default)"}, permissionLevel=${createOptions?.permissionLevel ?? "(default)"}`);
      this.logService.info(`[AutomationRunner] creating a session for run ${runId} (automation ${automation.id}).`);
      let session;
      if (target.kind === "quickChat") {
        session = await this.sessionsManagementService.createAndSendQuickChatRequest(options, createOptions, token);
      } else {
        session = await this.sessionsManagementService.createAndSendNewChatRequest(target.folderUri, options, createOptions, token);
      }
      if (session) {
        const sessionResource = session.resource;
        let updatedRun;
        try {
          updatedRun = await this.automationService.updateRun(runId, { sessionResource });
        } catch (err) {
          this.logService.warn(`[AutomationRunner] session ${sessionResource.toString()} was created for run ${runId} (automation ${automation.id}), but persisting the session link failed.`, err);
          throw err;
        }
        if (updatedRun) {
          this.logService.info(`[AutomationRunner] linked run ${runId} for automation ${automation.id} to session ${sessionResource.toString()}.`);
        } else {
          this.logService.warn(`[AutomationRunner] session ${sessionResource.toString()} was created for run ${runId} (automation ${automation.id}), but the run no longer exists and the session link was not persisted.`);
        }
        const dispatchedRun = updatedRun ?? run;
        await dispatched.complete({ kind: "started", run: dispatchedRun, sessionResource });
      } else {
        this.logService.warn(`[AutomationRunner] session creation returned no session for run ${runId} (automation ${automation.id}): cancelled=${token.isCancellationRequested}.`);
        await dispatched.complete({ kind: "notStarted", reason: token.isCancellationRequested ? "cancelled" : "error", run });
      }
      if (token.isCancellationRequested) {
        await this._markCancelled(runId, trigger, automation, startTimeMs);
        return;
      }
      const terminalStatus = session ? await waitForState(
        derived((reader) => session.mainChat.read(reader).status.read(reader)),
        (status) => status === SessionStatus.Completed || status === SessionStatus.Error,
        void 0,
        token
      ) : SessionStatus.Completed;
      if (token.isCancellationRequested) {
        await this._markCancelled(runId, trigger, automation, startTimeMs);
        return;
      }
      if (terminalStatus === SessionStatus.Error) {
        throw new Error(localize("automationRunner.sessionFailed", "Agent session failed."));
      }
      await this.automationService.updateRun(runId, {
        status: "completed",
        completedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      publishAutomationRun(this.telemetryService, { trigger, automation, success: true, durationMs: Date.now() - startTimeMs });
    } catch (err) {
      if (runId && token.isCancellationRequested) {
        await dispatched.complete({ kind: "notStarted", reason: "cancelled" });
        await this._markCancelled(runId, trigger, automation, startTimeMs);
        return;
      }
      this.logService.error(`[AutomationRunner] run for ${automation.id} failed`, err);
      try {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.notificationService.error(localize("automationRunFailed", "Automation '{0}' failed: {1}", automation.name, errorMessage));
        let failedRun;
        if (runId) {
          failedRun = await this.automationService.updateRun(runId, {
            status: "failed",
            completedAt: (/* @__PURE__ */ new Date()).toISOString(),
            errorMessage
          });
        }
        await dispatched.complete({ kind: "notStarted", reason: "error", run: failedRun });
        publishAutomationRun(this.telemetryService, { trigger, automation, success: false, durationMs: Date.now() - startTimeMs });
        publishAutomationRunError(this.telemetryService, { trigger, automation });
      } catch (innerErr) {
        this.logService.error(`[AutomationRunner] error recording failure for ${automation.id}`, innerErr);
      }
    }
  }
  async _markCancelled(runId, trigger, automation, startTimeMs) {
    try {
      if (this.automationService.getActiveRunFor(automation.id)?.id === runId) {
        await this.automationService.updateRun(runId, {
          status: "failed",
          completedAt: (/* @__PURE__ */ new Date()).toISOString(),
          errorMessage: localize("automationRunner.cancelled", "Cancelled")
        });
      }
      publishAutomationRun(this.telemetryService, { trigger, automation, success: false, durationMs: Date.now() - startTimeMs });
    } catch (err) {
      this.logService.error(`[AutomationRunner] error recording cancellation for ${automation.id}`, err);
    }
  }
};
AutomationRunner = __decorateClass([
  __decorateParam(0, IAutomationService),
  __decorateParam(1, ISessionsManagementService),
  __decorateParam(2, ILogService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, INotificationService)
], AutomationRunner);
export {
  AutomationRunner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYXV0b21hdGlvbnNcXGJyb3dzZXJcXGF1dG9tYXRpb25SdW5uZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkLCB3YWl0Rm9yU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IEF1dG9tYXRpb25SdW5UcmlnZ2VyLCBJQXV0b21hdGlvbkRlc2NyaXB0b3IsIElBdXRvbWF0aW9uUnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbi5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvblJ1bkRpc3BhdGNoLCBJQXV0b21hdGlvblJ1bm5lciwgSUF1dG9tYXRpb25SdW5PcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uUnVubmVyLmpzJztcbmltcG9ydCB7IElBdXRvbWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IHB1Ymxpc2hBdXRvbWF0aW9uUnVuLCBwdWJsaXNoQXV0b21hdGlvblJ1bkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvblRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbiwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucywgSVNlbmRSZXF1ZXN0T3B0aW9ucywgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcblxuLyoqIFNlc3Npb25zLWxheWVyIHJ1bm5lci4gTmV2ZXIgdGhyb3dzOyBmYWlsdXJlcyBhcmUgcmVjb3JkZWQgb24gdGhlIHJ1biByb3cuICovXG5leHBvcnQgY2xhc3MgQXV0b21hdGlvblJ1bm5lciBpbXBsZW1lbnRzIElBdXRvbWF0aW9uUnVubmVyIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUF1dG9tYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV0b21hdGlvblNlcnZpY2U6IElBdXRvbWF0aW9uU2VydmljZSxcblx0XHRASVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRydW5PbmNlKFxuXHRcdGF1dG9tYXRpb246IElBdXRvbWF0aW9uRGVzY3JpcHRvcixcblx0XHR0cmlnZ2VyOiBBdXRvbWF0aW9uUnVuVHJpZ2dlcixcblx0XHRsZWFkZXJXaW5kb3dJZDogbnVtYmVyLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdCk6IElBdXRvbWF0aW9uUnVuT3BlcmF0aW9uIHtcblx0XHRjb25zdCBkaXNwYXRjaGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTxJQXV0b21hdGlvblJ1bkRpc3BhdGNoPigpO1xuXHRcdHJldHVybiB7XG5cdFx0XHR3aGVuRGlzcGF0Y2hlZDogZGlzcGF0Y2hlZC5wLFxuXHRcdFx0d2hlbkNvbXBsZXRlZDogdGhpcy5fcnVuT25jZShhdXRvbWF0aW9uLCB0cmlnZ2VyLCBsZWFkZXJXaW5kb3dJZCwgdG9rZW4sIGRpc3BhdGNoZWQpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5PbmNlKFxuXHRcdGF1dG9tYXRpb246IElBdXRvbWF0aW9uRGVzY3JpcHRvcixcblx0XHR0cmlnZ2VyOiBBdXRvbWF0aW9uUnVuVHJpZ2dlcixcblx0XHRsZWFkZXJXaW5kb3dJZDogbnVtYmVyLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0XHRkaXNwYXRjaGVkOiBEZWZlcnJlZFByb21pc2U8SUF1dG9tYXRpb25SdW5EaXNwYXRjaD4sXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIE11c3Qgbm90IHRocm93IHBlciBJQXV0b21hdGlvblJ1bm5lciBjb250cmFjdC4gVW5leHBlY3RlZCBlcnJvcnMgYXJlIHN3YWxsb3dlZCBoZXJlLlxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9ydW5PbmNlSW5uZXIoYXV0b21hdGlvbiwgdHJpZ2dlciwgbGVhZGVyV2luZG93SWQsIHRva2VuLCBkaXNwYXRjaGVkKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW0F1dG9tYXRpb25SdW5uZXJdIHVuZXhwZWN0ZWQgZXJyb3IgaW4gcnVuT25jZSBmb3IgJHthdXRvbWF0aW9uLmlkfWAsIGVycik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdC8vIE5vLW9wIG9uY2UgYW4gZXhpdCBwYXRoIGFib3ZlIGhhcyBhbHJlYWR5IHJlcG9ydGVkIGl0cyBvdXRjb21lLlxuXHRcdFx0YXdhaXQgZGlzcGF0Y2hlZC5jb21wbGV0ZSh7IGtpbmQ6ICdub3RTdGFydGVkJywgcmVhc29uOiAnZXJyb3InIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3J1bk9uY2VJbm5lcihcblx0XHRhdXRvbWF0aW9uOiBJQXV0b21hdGlvbkRlc2NyaXB0b3IsXG5cdFx0dHJpZ2dlcjogQXV0b21hdGlvblJ1blRyaWdnZXIsXG5cdFx0bGVhZGVyV2luZG93SWQ6IG51bWJlcixcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdFx0ZGlzcGF0Y2hlZDogRGVmZXJyZWRQcm9taXNlPElBdXRvbWF0aW9uUnVuRGlzcGF0Y2g+LFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzdGFydFRpbWVNcyA9IERhdGUubm93KCk7XG5cdFx0bGV0IHJ1bklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghdGhpcy5hdXRvbWF0aW9uU2VydmljZS5nZXRBdXRvbWF0aW9uKGF1dG9tYXRpb24uaWQpKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0F1dG9tYXRpb25SdW5uZXJdIHNraXBwaW5nICR7YXV0b21hdGlvbi5pZH06IGF1dG9tYXRpb24gd2FzIGRlbGV0ZWQuYCk7XG5cdFx0XHRcdGF3YWl0IGRpc3BhdGNoZWQuY29tcGxldGUoeyBraW5kOiAnbm90U3RhcnRlZCcsIHJlYXNvbjogJ2RlbGV0ZWQnIH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRhcmdldCA9IGF1dG9tYXRpb24udGFyZ2V0O1xuXHRcdFx0Y29uc3QgaXNvbGF0aW9uTW9kZSA9IHRhcmdldC5raW5kID09PSAnd29ya3NwYWNlJ1xuXHRcdFx0XHQ/IHRhcmdldC5pc29sYXRpb24ua2luZCA9PT0gJ2ZvbGRlcicgPyAnd29ya3NwYWNlJyA6IHRhcmdldC5pc29sYXRpb24ua2luZCA9PT0gJ3dvcmt0cmVlJyA/ICd3b3JrdHJlZScgOiB1bmRlZmluZWRcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBicmFuY2ggPSB0YXJnZXQua2luZCA9PT0gJ3dvcmtzcGFjZScgJiYgdGFyZ2V0Lmlzb2xhdGlvbi5raW5kID09PSAnd29ya3RyZWUnID8gdGFyZ2V0Lmlzb2xhdGlvbi5icmFuY2ggOiB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IGNyZWF0ZU9wdGlvbnM6IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucyB8IHVuZGVmaW5lZCA9IHRhcmdldC5wcm92aWRlcklkICE9PSB1bmRlZmluZWQgfHwgdGFyZ2V0LnNlc3Npb25UeXBlSWQgIT09IHVuZGVmaW5lZCB8fCBhdXRvbWF0aW9uLm1vZGVsSWQgIT09IHVuZGVmaW5lZCB8fCBhdXRvbWF0aW9uLm1vZGUgIT09IHVuZGVmaW5lZCB8fCBhdXRvbWF0aW9uLnBlcm1pc3Npb25MZXZlbCAhPT0gdW5kZWZpbmVkIHx8IGlzb2xhdGlvbk1vZGUgIT09IHVuZGVmaW5lZCB8fCBicmFuY2ggIT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IHtcblx0XHRcdFx0XHRwcm92aWRlcklkOiB0YXJnZXQucHJvdmlkZXJJZCxcblx0XHRcdFx0XHRzZXNzaW9uVHlwZUlkOiB0YXJnZXQuc2Vzc2lvblR5cGVJZCxcblx0XHRcdFx0XHRtb2RlbElkOiBhdXRvbWF0aW9uLm1vZGVsSWQsXG5cdFx0XHRcdFx0bW9kZUlkOiBhdXRvbWF0aW9uLm1vZGUsXG5cdFx0XHRcdFx0cGVybWlzc2lvbkxldmVsOiBhdXRvbWF0aW9uLnBlcm1pc3Npb25MZXZlbCxcblx0XHRcdFx0XHRpc29sYXRpb25Nb2RlLFxuXHRcdFx0XHRcdGJyYW5jaCxcblx0XHRcdFx0fVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgdGFyZ2V0QXZhaWxhYmxlID0gdGFyZ2V0LmtpbmQgPT09ICdxdWlja0NoYXQnXG5cdFx0XHRcdD8gdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmlzUXVpY2tDaGF0VGFyZ2V0QXZhaWxhYmxlKGNyZWF0ZU9wdGlvbnMpXG5cdFx0XHRcdDogdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmlzTmV3U2Vzc2lvblRhcmdldEF2YWlsYWJsZSh0YXJnZXQuZm9sZGVyVXJpLCBjcmVhdGVPcHRpb25zKTtcblx0XHRcdGlmICghdGFyZ2V0QXZhaWxhYmxlKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0F1dG9tYXRpb25SdW5uZXJdIGRlZmVycmluZyAke2F1dG9tYXRpb24uaWR9OiB0YXJnZXQgaXMgbm90IHlldCBhZHZlcnRpc2VkLmApO1xuXHRcdFx0XHRpZiAodHJpZ2dlciA9PT0gJ21hbnVhbCcpIHtcblx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhsb2NhbGl6ZSgnYXV0b21hdGlvblRhcmdldFVuYXZhaWxhYmxlJywgXCJBdXRvbWF0aW9uICd7MH0nIGNhbm5vdCBzdGFydCB1bnRpbCBpdHMgYWdlbnQgYmVjb21lcyBhdmFpbGFibGUuXCIsIGF1dG9tYXRpb24ubmFtZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IGRpc3BhdGNoZWQuY29tcGxldGUoeyBraW5kOiAnbm90U3RhcnRlZCcsIHJlYXNvbjogJ3RhcmdldFVuYXZhaWxhYmxlJyB9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBdG9taWNhbGx5IGNsYWltcyB0aGUgYXV0b21hdGlvbidzIHNpbmdsZSBhY3RpdmUtcnVuIHNsb3Q7IGEgbG9zaW5nIHJhY2VyXG5cdFx0XHQvLyBnZXRzIHRoZSB3aW5uZXIncyBydW4gYmFjayBpbnN0ZWFkIG9mIGRpc3BhdGNoaW5nIGEgZHVwbGljYXRlIHNlc3Npb24uXG5cdFx0XHRjb25zdCBjbGFpbSA9IGF3YWl0IHRoaXMuYXV0b21hdGlvblNlcnZpY2UucmVjb3JkUnVuU3RhcnQoYXV0b21hdGlvbi5pZCwgdHJpZ2dlciwgbGVhZGVyV2luZG93SWQpO1xuXHRcdFx0aWYgKCFjbGFpbS5jbGFpbWVkKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0F1dG9tYXRpb25SdW5uZXJdIHNraXBwaW5nICR7YXV0b21hdGlvbi5pZH06IGFjdGl2ZSBydW4gYWxyZWFkeSBleGlzdHMuYCk7XG5cdFx0XHRcdGF3YWl0IGRpc3BhdGNoZWQuY29tcGxldGUoeyBraW5kOiAnYWxyZWFkeVJ1bm5pbmcnLCBhY3RpdmVSdW46IGNsYWltLnJ1biB9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cnVuSWQgPSBjbGFpbS5ydW4uaWQ7XG5cdFx0XHRjb25zdCBydW4gPSBhd2FpdCB0aGlzLmF1dG9tYXRpb25TZXJ2aWNlLnVwZGF0ZVJ1bihydW5JZCwgeyBzdGF0dXM6ICdydW5uaW5nJyB9KSA/PyBjbGFpbS5ydW47XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgW0F1dG9tYXRpb25SdW5uZXJdIGNsYWltZWQgcnVuICR7cnVuSWR9IGZvciBhdXRvbWF0aW9uICR7YXV0b21hdGlvbi5pZH06IHRyaWdnZXI9JHt0cmlnZ2VyfSwgbGVhZGVyV2luZG93SWQ9JHtsZWFkZXJXaW5kb3dJZH0uYCk7XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRhd2FpdCBkaXNwYXRjaGVkLmNvbXBsZXRlKHsga2luZDogJ25vdFN0YXJ0ZWQnLCByZWFzb246ICdjYW5jZWxsZWQnLCBydW4gfSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX21hcmtDYW5jZWxsZWQocnVuSWQsIHRyaWdnZXIsIGF1dG9tYXRpb24sIHN0YXJ0VGltZU1zKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zID0ge1xuXHRcdFx0XHRxdWVyeTogYXV0b21hdGlvbi5wcm9tcHQsXG5cdFx0XHRcdGJhY2tncm91bmQ6IHRydWUsXG5cdFx0XHRcdHRpdGxlOiBhdXRvbWF0aW9uLm5hbWU/LnN1YnN0cmluZygwLCAxMDApLFxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQXV0b21hdGlvblJ1bm5lcl0gcnVubmluZyAke2F1dG9tYXRpb24uaWR9OiB0YXJnZXQ9JHt0YXJnZXQua2luZH0sIHByb3ZpZGVyPSR7Y3JlYXRlT3B0aW9ucz8ucHJvdmlkZXJJZCA/PyAnKGRlZmF1bHQpJ30sIHNlc3Npb25UeXBlPSR7Y3JlYXRlT3B0aW9ucz8uc2Vzc2lvblR5cGVJZCA/PyAnKGRlZmF1bHQpJ30sIG1vZGVsPSR7Y3JlYXRlT3B0aW9ucz8ubW9kZWxJZCA/PyAnKGRlZmF1bHQpJ30sIG1vZGU9JHtjcmVhdGVPcHRpb25zPy5tb2RlSWQgPz8gJyhkZWZhdWx0KSd9LCBwZXJtaXNzaW9uTGV2ZWw9JHtjcmVhdGVPcHRpb25zPy5wZXJtaXNzaW9uTGV2ZWwgPz8gJyhkZWZhdWx0KSd9YCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgW0F1dG9tYXRpb25SdW5uZXJdIGNyZWF0aW5nIGEgc2Vzc2lvbiBmb3IgcnVuICR7cnVuSWR9IChhdXRvbWF0aW9uICR7YXV0b21hdGlvbi5pZH0pLmApO1xuXG5cdFx0XHRsZXQgc2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodGFyZ2V0LmtpbmQgPT09ICdxdWlja0NoYXQnKSB7XG5cdFx0XHRcdHNlc3Npb24gPSBhd2FpdCB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuY3JlYXRlQW5kU2VuZFF1aWNrQ2hhdFJlcXVlc3Qob3B0aW9ucywgY3JlYXRlT3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2Vzc2lvbiA9IGF3YWl0IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5jcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QodGFyZ2V0LmZvbGRlclVyaSwgb3B0aW9ucywgY3JlYXRlT3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uLnJlc291cmNlO1xuXHRcdFx0XHRsZXQgdXBkYXRlZFJ1bjogSUF1dG9tYXRpb25SdW4gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0dXBkYXRlZFJ1biA9IGF3YWl0IHRoaXMuYXV0b21hdGlvblNlcnZpY2UudXBkYXRlUnVuKHJ1bklkLCB7IHNlc3Npb25SZXNvdXJjZSB9KTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFtBdXRvbWF0aW9uUnVubmVyXSBzZXNzaW9uICR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9IHdhcyBjcmVhdGVkIGZvciBydW4gJHtydW5JZH0gKGF1dG9tYXRpb24gJHthdXRvbWF0aW9uLmlkfSksIGJ1dCBwZXJzaXN0aW5nIHRoZSBzZXNzaW9uIGxpbmsgZmFpbGVkLmAsIGVycik7XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh1cGRhdGVkUnVuKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFtBdXRvbWF0aW9uUnVubmVyXSBsaW5rZWQgcnVuICR7cnVuSWR9IGZvciBhdXRvbWF0aW9uICR7YXV0b21hdGlvbi5pZH0gdG8gc2Vzc2lvbiAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfS5gKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0F1dG9tYXRpb25SdW5uZXJdIHNlc3Npb24gJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0gd2FzIGNyZWF0ZWQgZm9yIHJ1biAke3J1bklkfSAoYXV0b21hdGlvbiAke2F1dG9tYXRpb24uaWR9KSwgYnV0IHRoZSBydW4gbm8gbG9uZ2VyIGV4aXN0cyBhbmQgdGhlIHNlc3Npb24gbGluayB3YXMgbm90IHBlcnNpc3RlZC5gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBkaXNwYXRjaGVkUnVuID0gdXBkYXRlZFJ1biA/PyBydW47XG5cdFx0XHRcdGF3YWl0IGRpc3BhdGNoZWQuY29tcGxldGUoeyBraW5kOiAnc3RhcnRlZCcsIHJ1bjogZGlzcGF0Y2hlZFJ1biwgc2Vzc2lvblJlc291cmNlIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gRGlzcGF0Y2ggZW5kZWQgd2l0aG91dCBhIHNlc3Npb24sIGUuZy4gdGhlIHNlc3Npb25zIHNlcnZpY2Ugd2FzIGRpc3Bvc2VkIG1pZC1zZW5kLlxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0F1dG9tYXRpb25SdW5uZXJdIHNlc3Npb24gY3JlYXRpb24gcmV0dXJuZWQgbm8gc2Vzc2lvbiBmb3IgcnVuICR7cnVuSWR9IChhdXRvbWF0aW9uICR7YXV0b21hdGlvbi5pZH0pOiBjYW5jZWxsZWQ9JHt0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZH0uYCk7XG5cdFx0XHRcdGF3YWl0IGRpc3BhdGNoZWQuY29tcGxldGUoeyBraW5kOiAnbm90U3RhcnRlZCcsIHJlYXNvbjogdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgPyAnY2FuY2VsbGVkJyA6ICdlcnJvcicsIHJ1biB9KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX21hcmtDYW5jZWxsZWQocnVuSWQsIHRyaWdnZXIsIGF1dG9tYXRpb24sIHN0YXJ0VGltZU1zKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0ZXJtaW5hbFN0YXR1cyA9IHNlc3Npb25cblx0XHRcdFx0PyBhd2FpdCB3YWl0Rm9yU3RhdGUoXG5cdFx0XHRcdFx0ZGVyaXZlZChyZWFkZXIgPT4gc2Vzc2lvbi5tYWluQ2hhdC5yZWFkKHJlYWRlcikuc3RhdHVzLnJlYWQocmVhZGVyKSksXG5cdFx0XHRcdFx0c3RhdHVzID0+IHN0YXR1cyA9PT0gU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQgfHwgc3RhdHVzID09PSBTZXNzaW9uU3RhdHVzLkVycm9yLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0b2tlbixcblx0XHRcdFx0KVxuXHRcdFx0XHQ6IFNlc3Npb25TdGF0dXMuQ29tcGxldGVkO1xuXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fbWFya0NhbmNlbGxlZChydW5JZCwgdHJpZ2dlciwgYXV0b21hdGlvbiwgc3RhcnRUaW1lTXMpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0ZXJtaW5hbFN0YXR1cyA9PT0gU2Vzc2lvblN0YXR1cy5FcnJvcikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2F1dG9tYXRpb25SdW5uZXIuc2Vzc2lvbkZhaWxlZCcsIFwiQWdlbnQgc2Vzc2lvbiBmYWlsZWQuXCIpKTtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy5hdXRvbWF0aW9uU2VydmljZS51cGRhdGVSdW4ocnVuSWQsIHtcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyxcblx0XHRcdFx0Y29tcGxldGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdH0pO1xuXHRcdFx0cHVibGlzaEF1dG9tYXRpb25SdW4odGhpcy50ZWxlbWV0cnlTZXJ2aWNlLCB7IHRyaWdnZXIsIGF1dG9tYXRpb24sIHN1Y2Nlc3M6IHRydWUsIGR1cmF0aW9uTXM6IERhdGUubm93KCkgLSBzdGFydFRpbWVNcyB9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChydW5JZCAmJiB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRhd2FpdCBkaXNwYXRjaGVkLmNvbXBsZXRlKHsga2luZDogJ25vdFN0YXJ0ZWQnLCByZWFzb246ICdjYW5jZWxsZWQnIH0pO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9tYXJrQ2FuY2VsbGVkKHJ1bklkLCB0cmlnZ2VyLCBhdXRvbWF0aW9uLCBzdGFydFRpbWVNcyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW0F1dG9tYXRpb25SdW5uZXJdIHJ1biBmb3IgJHthdXRvbWF0aW9uLmlkfSBmYWlsZWRgLCBlcnIpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpO1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ2F1dG9tYXRpb25SdW5GYWlsZWQnLCBcIkF1dG9tYXRpb24gJ3swfScgZmFpbGVkOiB7MX1cIiwgYXV0b21hdGlvbi5uYW1lLCBlcnJvck1lc3NhZ2UpKTtcblx0XHRcdFx0bGV0IGZhaWxlZFJ1bjogSUF1dG9tYXRpb25SdW4gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChydW5JZCkge1xuXHRcdFx0XHRcdGZhaWxlZFJ1biA9IGF3YWl0IHRoaXMuYXV0b21hdGlvblNlcnZpY2UudXBkYXRlUnVuKHJ1bklkLCB7XG5cdFx0XHRcdFx0XHRzdGF0dXM6ICdmYWlsZWQnLFxuXHRcdFx0XHRcdFx0Y29tcGxldGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0XHRcdGVycm9yTWVzc2FnZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBOby1vcCB3aGVuIHRoZSBzZXNzaW9uIHdhcyBhbHJlYWR5IGRpc3BhdGNoZWQgYW5kIGZhaWxlZCBsYXRlciBpbiBpdHMgbGlmZWN5Y2xlLlxuXHRcdFx0XHRhd2FpdCBkaXNwYXRjaGVkLmNvbXBsZXRlKHsga2luZDogJ25vdFN0YXJ0ZWQnLCByZWFzb246ICdlcnJvcicsIHJ1bjogZmFpbGVkUnVuIH0pO1xuXHRcdFx0XHRwdWJsaXNoQXV0b21hdGlvblJ1bih0aGlzLnRlbGVtZXRyeVNlcnZpY2UsIHsgdHJpZ2dlciwgYXV0b21hdGlvbiwgc3VjY2VzczogZmFsc2UsIGR1cmF0aW9uTXM6IERhdGUubm93KCkgLSBzdGFydFRpbWVNcyB9KTtcblx0XHRcdFx0cHVibGlzaEF1dG9tYXRpb25SdW5FcnJvcih0aGlzLnRlbGVtZXRyeVNlcnZpY2UsIHsgdHJpZ2dlciwgYXV0b21hdGlvbiB9KTtcblx0XHRcdH0gY2F0Y2ggKGlubmVyRXJyKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW0F1dG9tYXRpb25SdW5uZXJdIGVycm9yIHJlY29yZGluZyBmYWlsdXJlIGZvciAke2F1dG9tYXRpb24uaWR9YCwgaW5uZXJFcnIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX21hcmtDYW5jZWxsZWQocnVuSWQ6IHN0cmluZywgdHJpZ2dlcjogQXV0b21hdGlvblJ1blRyaWdnZXIsIGF1dG9tYXRpb246IElBdXRvbWF0aW9uRGVzY3JpcHRvciwgc3RhcnRUaW1lTXM6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGhpcy5hdXRvbWF0aW9uU2VydmljZS5nZXRBY3RpdmVSdW5Gb3IoYXV0b21hdGlvbi5pZCk/LmlkID09PSBydW5JZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmF1dG9tYXRpb25TZXJ2aWNlLnVwZGF0ZVJ1bihydW5JZCwge1xuXHRcdFx0XHRcdHN0YXR1czogJ2ZhaWxlZCcsXG5cdFx0XHRcdFx0Y29tcGxldGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0XHRlcnJvck1lc3NhZ2U6IGxvY2FsaXplKCdhdXRvbWF0aW9uUnVubmVyLmNhbmNlbGxlZCcsIFwiQ2FuY2VsbGVkXCIpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHB1Ymxpc2hBdXRvbWF0aW9uUnVuKHRoaXMudGVsZW1ldHJ5U2VydmljZSwgeyB0cmlnZ2VyLCBhdXRvbWF0aW9uLCBzdWNjZXNzOiBmYWxzZSwgZHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHN0YXJ0VGltZU1zIH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbQXV0b21hdGlvblJ1bm5lcl0gZXJyb3IgcmVjb3JkaW5nIGNhbmNlbGxhdGlvbiBmb3IgJHthdXRvbWF0aW9uLmlkfWAsIGVycik7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxvQkFBb0I7QUFDdEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFHbEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0IsaUNBQWlDO0FBQ2hFLFNBQW1CLHFCQUFxQjtBQUN4QyxTQUF3RCxrQ0FBa0M7QUFHbkYsSUFBTSxtQkFBTixNQUFvRDtBQUFBLEVBSTFELFlBQ3NDLG1CQUNRLDJCQUNmLFlBQ00sa0JBQ0cscUJBQ3RDO0FBTG9DO0FBQ1E7QUFDZjtBQUNNO0FBQ0c7QUFBQSxFQUNwQztBQUFBLEVBRUosUUFDQyxZQUNBLFNBQ0EsZ0JBQ0EsUUFBMkIsa0JBQWtCLE1BQ25CO0FBQzFCLFVBQU0sYUFBYSxJQUFJLGdCQUF3QztBQUMvRCxXQUFPO0FBQUEsTUFDTixnQkFBZ0IsV0FBVztBQUFBLE1BQzNCLGVBQWUsS0FBSyxTQUFTLFlBQVksU0FBUyxnQkFBZ0IsT0FBTyxVQUFVO0FBQUEsSUFDcEY7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLFNBQ2IsWUFDQSxTQUNBLGdCQUNBLE9BQ0EsWUFDZ0I7QUFFaEIsUUFBSTtBQUNILFlBQU0sS0FBSyxjQUFjLFlBQVksU0FBUyxnQkFBZ0IsT0FBTyxVQUFVO0FBQUEsSUFDaEYsU0FBUyxLQUFLO0FBQ2IsV0FBSyxXQUFXLE1BQU0sc0RB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V0FBVyxFQUFFLFdBQVcsR0FBRztBQUMvRSxVQUFJO0FBQ0gsY0FBTSxlQUFlLGVBQWUsUUFBUSxJQUFJLFVBQVUsT0FBTyxHQUFHO0FBQ3BFLGFBQUssb0JBQW9CLE1BQU0sU0FBUyx1QkFBdUIsZ0NBQWdDLFdBQVcsTUFBTSxZQUFZLENBQUM7QUFDN0gsWUFBSTtBQUNKLFlBQUksT0FBTztBQUNWLHNCQUFZLE1BQU0sS0FBSyxrQkFBa0IsVUFBVSxPQUFPO0FBQUEsWUFDekQsUUFBUTtBQUFBLFlBQ1IsY0FBYSxvQkFBSSxLQUFLLEdBQUUsWUFBWTtBQUFBLFlBQ3BDO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRjtBQUVBLGNBQU0sV0FBVyxTQUFTLEVBQUUsTUFBTSxjQUFjLFFBQVEsU0FBUyxLQUFLLFVBQVUsQ0FBQztBQUNqRiw2QkFBcUIsS0FBSyxrQkFBa0IsRUFBRSxTQUFTLFlBQVksU0FBUyxPQUFPLFlBQVksS0FBSyxJQUFJLElBQUksWUFBWSxDQUFDO0FBQ3pILGtDQUEwQixLQUFLLGtCQUFrQixFQUFFLFNBQVMsV0FBVyxDQUFDO0FBQUEsTUFDekUsU0FBUyxVQUFVO0FBQ2xCLGFBQUssV0FBVyxNQUFNLGtEQUFrRCxXQUFXLEVBQUUsSUFBSSxRQUFRO0FBQUEsTUFDbEc7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxlQUFlLE9BQWUsU0FBK0IsWUFBbUMsYUFBb0M7QUFDakosUUFBSTtBQUNILFVBQUksS0FBSyxrQkFBa0IsZ0JBQWdCLFdBQVcsRUFBRSxHQUFHLE9BQU8sT0FBTztBQUN4RSxjQUFNLEtBQUssa0JBQWtCLFVBQVUsT0FBTztBQUFBLFVBQzdDLFFBQVE7QUFBQSxVQUNSLGNBQWEsb0JBQUksS0FBSyxHQUFFLFlBQVk7QUFBQSxVQUNwQyxjQUFjLFNBQVMsOEJBQThCLFdBQVc7QUFBQSxRQUNqRSxDQUFDO0FBQUEsTUFDRjtBQUNBLDJCQUFxQixLQUFLLGtCQUFrQixFQUFFLFNBQVMsWUFBWSxTQUFTLE9BQU8sWUFBWSxLQUFLLElBQUksSUFBSSxZQUFZLENBQUM7QUFBQSxJQUMxSCxTQUFTLEtBQUs7QUFDYixXQUFLLFdBQVcsTUFBTSx1REFBdUQsV0FBVyxFQUFFLElBQUksR0FBRztBQUFBLElBQ2xHO0FBQUEsRUFDRDtBQUNEO0FBdk5hLG1CQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVRVOyIsCiAgIm5hbWVzIjogW10KfQo=
