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
import { timeout } from "../../../../../../../base/common/async.js";
import { localize } from "../../../../../../../nls.js";
import { ITelemetryService } from "../../../../../../../platform/telemetry/common/telemetry.js";
import { ToolDataSource } from "../../../../../chat/common/tools/languageModelToolsService.js";
import { ITaskService } from "../../../../../tasks/common/taskService.js";
import { TaskRunSource } from "../../../../../tasks/common/tasks.js";
import { ITerminalService } from "../../../../../terminal/browser/terminal.js";
import { collectTerminalResults, getTaskDefinition, getTaskForTool, resolveDependencyTasks, tasksMatch } from "../../taskHelpers.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { toolResultDetailsFromResponse, toolResultMessageFromResponse } from "./taskHelpers.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { TerminalToolId } from "../toolIds.js";
let RunTaskTool = class {
  constructor(_tasksService, _telemetryService, _terminalService, _configurationService, _instantiationService) {
    this._tasksService = _tasksService;
    this._telemetryService = _telemetryService;
    this._terminalService = _terminalService;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const args = invocation.parameters;
    if (!invocation.context) {
      return { content: [{ kind: "text", value: `No invocation context` }], toolResultMessage: `No invocation context` };
    }
    const taskDefinition = getTaskDefinition(args.id);
    const task = await getTaskForTool(args.id, taskDefinition, args.workspaceFolder, this._configurationService, this._tasksService, true);
    if (!task) {
      return { content: [{ kind: "text", value: `Task not found: ${args.id}` }], toolResultMessage: new MarkdownString(localize("chat.taskNotFound", "Task not found: `{0}`", args.id)) };
    }
    const taskLabel = task._label;
    const activeTasks = await this._tasksService.getActiveTasks();
    if (activeTasks.includes(task)) {
      return { content: [{ kind: "text", value: `The task ${taskLabel} is already running.` }], toolResultMessage: new MarkdownString(localize("chat.taskAlreadyRunning", "The task `{0}` is already running.", taskLabel)) };
    }
    const dependencyTasks = await resolveDependencyTasks(task, args.workspaceFolder, this._configurationService, this._tasksService);
    const startMarkersByTerminalInstanceId = /* @__PURE__ */ new Map();
    const startMarkersDisposableStore = new DisposableStore();
    for (const terminal of this._terminalService.instances) {
      const marker = terminal.registerMarker();
      startMarkersByTerminalInstanceId.set(terminal.instanceId, marker);
      if (marker) {
        startMarkersDisposableStore.add(marker);
      }
    }
    try {
      const raceResult = await Promise.race([this._tasksService.run(task, void 0, TaskRunSource.ChatAgent), timeout(3e3)]);
      const result = raceResult && typeof raceResult === "object" ? raceResult : void 0;
      const resources = this._tasksService.getTerminalsForTasks(dependencyTasks ?? task);
      if (!resources || resources.length === 0) {
        return { content: [{ kind: "text", value: `Task started but no terminal was found for: ${taskLabel}` }], toolResultMessage: new MarkdownString(localize("chat.noTerminal", "Task started but no terminal was found for: `{0}`", taskLabel)) };
      }
      const terminals = this._terminalService.instances.filter((t) => resources.some((r) => r.path === t.resource.path && r.scheme === t.resource.scheme));
      if (terminals.length === 0) {
        return { content: [{ kind: "text", value: `Task started but no terminal was found for: ${taskLabel}` }], toolResultMessage: new MarkdownString(localize("chat.noTerminal", "Task started but no terminal was found for: `{0}`", taskLabel)) };
      }
      const store = new DisposableStore();
      let terminalResults = [];
      try {
        terminalResults = await collectTerminalResults(
          terminals,
          task,
          this._instantiationService,
          invocation.context,
          _progress,
          token,
          store,
          (terminalTask) => this._isTaskActive(terminalTask),
          dependencyTasks,
          this._tasksService,
          startMarkersByTerminalInstanceId
        );
      } finally {
        store.dispose();
      }
      for (const r of terminalResults) {
        this._telemetryService.publicLog2?.("copilotChat.runTaskTool.run", {
          taskId: args.id,
          bufferLength: r.output.length ?? 0,
          pollDurationMs: r.pollDurationMs ?? 0,
          inputToolManualAcceptCount: r.inputToolManualAcceptCount ?? 0,
          inputToolManualRejectCount: r.inputToolManualRejectCount ?? 0,
          inputToolManualChars: r.inputToolManualChars ?? 0,
          inputToolManualShownCount: r.inputToolManualShownCount ?? 0,
          inputToolFreeFormInputShownCount: r.inputToolFreeFormInputShownCount ?? 0,
          inputToolFreeFormInputCount: r.inputToolFreeFormInputCount ?? 0
        });
      }
      const details = terminalResults.map((r) => `Terminal: ${r.name}
Output:
${r.output}`);
      const uniqueDetails = Array.from(new Set(details)).join("\n\n");
      const toolResultDetails = toolResultDetailsFromResponse(terminalResults);
      const toolResultMessage = toolResultMessageFromResponse(result, taskLabel, toolResultDetails, terminalResults, void 0, task.configurationProperties.isBackground);
      return {
        content: [{ kind: "text", value: uniqueDetails }],
        toolResultMessage,
        toolResultDetails
      };
    } finally {
      startMarkersDisposableStore.dispose();
    }
  }
  async _isTaskActive(task) {
    const busyTasks = await this._tasksService.getBusyTasks();
    return busyTasks?.some((t) => tasksMatch(t, task)) ?? false;
  }
  async prepareToolInvocation(context, token) {
    const args = context.parameters;
    const taskDefinition = getTaskDefinition(args.id);
    const task = await getTaskForTool(args.id, taskDefinition, args.workspaceFolder, this._configurationService, this._tasksService, true);
    if (!task) {
      return { invocationMessage: new MarkdownString(localize("chat.taskNotFound", "Task not found: `{0}`", args.id)) };
    }
    const taskLabel = task._label;
    const activeTasks = await this._tasksService.getActiveTasks();
    if (task && activeTasks.includes(task)) {
      return { invocationMessage: new MarkdownString(localize("chat.taskAlreadyActive", "The task is already running.")) };
    }
    if (await this._isTaskActive(task)) {
      return {
        invocationMessage: new MarkdownString(localize("chat.taskIsAlreadyRunning", "`{0}` is already running.", taskLabel)),
        pastTenseMessage: new MarkdownString(localize("chat.taskWasAlreadyRunning", "`{0}` was already running.", taskLabel)),
        confirmationMessages: void 0
      };
    }
    return {
      invocationMessage: new MarkdownString(localize("chat.runningTask", "Running `{0}`", taskLabel)),
      pastTenseMessage: new MarkdownString(task?.configurationProperties.isBackground ? localize("chat.startedTask", "Started `{0}`", taskLabel) : localize("chat.ranTask", "Ran `{0}`", taskLabel)),
      confirmationMessages: task ? { title: localize("chat.allowTaskRunTitle", "Allow task run?"), message: localize("chat.allowTaskRunMsg", "Allow to run the task `{0}`?", taskLabel) } : void 0
    };
  }
};
RunTaskTool = __decorateClass([
  __decorateParam(0, ITaskService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, ITerminalService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService)
], RunTaskTool);
const RunTaskToolData = {
  id: TerminalToolId.RunTask,
  toolReferenceName: "runTask",
  legacyToolReferenceFullNames: ["runTasks/runTask"],
  displayName: localize("runInTerminalTool.displayName", "Run Task"),
  modelDescription: `Runs a VS Code task.

- If you see that an appropriate task exists for building or running code, prefer to use this tool to run the task instead of using the ${TerminalToolId.RunInTerminal} tool.
- Make sure that any appropriate build or watch task is running before trying to run tests or execute code.
- If the user asks to run a task, use this tool to do so.`,
  userDescription: localize("runInTerminalTool.userDescription", "Run tasks in the workspace"),
  icon: Codicon.tools,
  source: ToolDataSource.Internal,
  inputSchema: {
    "type": "object",
    "properties": {
      "workspaceFolder": {
        "type": "string",
        "description": "The workspace folder path containing the task"
      },
      "id": {
        "type": "string",
        "description": "The task ID to run."
      }
    },
    "required": [
      "workspaceFolder",
      "id"
    ]
  }
};
export {
  RunTaskTool,
  RunTaskToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGJyb3dzZXJcXHRvb2xzXFx0YXNrXFxydW5UYXNrVG9vbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IENvdW50VG9rZW5zQ2FsbGJhY2ssIElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLCBJVG9vbERhdGEsIElUb29sSW1wbCwgSVRvb2xJbnZvY2F0aW9uLCBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIElUb29sUmVzdWx0LCBUb29sRGF0YVNvdXJjZSwgVG9vbFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGFza1NlcnZpY2UsIElUYXNrU3VtbWFyeSwgVGFzayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rhc2tzL2NvbW1vbi90YXNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUYXNrUnVuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGFza3MvY29tbW9uL3Rhc2tzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBjb2xsZWN0VGVybWluYWxSZXN1bHRzLCBnZXRUYXNrRGVmaW5pdGlvbiwgZ2V0VGFza0ZvclRvb2wsIHJlc29sdmVEZXBlbmRlbmN5VGFza3MsIHRhc2tzTWF0Y2ggfSBmcm9tICcuLi8uLi90YXNrSGVscGVycy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHRvb2xSZXN1bHREZXRhaWxzRnJvbVJlc3BvbnNlLCB0b29sUmVzdWx0TWVzc2FnZUZyb21SZXNwb25zZSB9IGZyb20gJy4vdGFza0hlbHBlcnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGFza1Rvb2xDbGFzc2lmaWNhdGlvbiwgVGFza1Rvb2xFdmVudCB9IGZyb20gJy4vdGFza1Rvb2xzVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsVG9vbElkIH0gZnJvbSAnLi4vdG9vbElkcy5qcyc7XG5cbmludGVyZmFjZSBJUnVuVGFza1Rvb2xJbnB1dCBleHRlbmRzIElUb29sSW52b2NhdGlvbiB7XG5cdGlkOiBzdHJpbmc7XG5cdHdvcmtzcGFjZUZvbGRlcjogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgUnVuVGFza1Rvb2wgaW1wbGVtZW50cyBJVG9vbEltcGwge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGFza1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGFza3NTZXJ2aWNlOiBJVGFza1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkgeyB9XG5cblx0YXN5bmMgaW52b2tlKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgX2NvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBfcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IGFyZ3MgPSBpbnZvY2F0aW9uLnBhcmFtZXRlcnMgYXMgSVJ1blRhc2tUb29sSW5wdXQ7XG5cblx0XHRpZiAoIWludm9jYXRpb24uY29udGV4dCkge1xuXHRcdFx0cmV0dXJuIHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogYE5vIGludm9jYXRpb24gY29udGV4dGAgfV0sIHRvb2xSZXN1bHRNZXNzYWdlOiBgTm8gaW52b2NhdGlvbiBjb250ZXh0YCB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhc2tEZWZpbml0aW9uID0gZ2V0VGFza0RlZmluaXRpb24oYXJncy5pZCk7XG5cdFx0Y29uc3QgdGFzayA9IGF3YWl0IGdldFRhc2tGb3JUb29sKGFyZ3MuaWQsIHRhc2tEZWZpbml0aW9uLCBhcmdzLndvcmtzcGFjZUZvbGRlciwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX3Rhc2tzU2VydmljZSwgdHJ1ZSk7XG5cdFx0aWYgKCF0YXNrKSB7XG5cdFx0XHRyZXR1cm4geyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBgVGFzayBub3QgZm91bmQ6ICR7YXJncy5pZH1gIH1dLCB0b29sUmVzdWx0TWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdjaGF0LnRhc2tOb3RGb3VuZCcsICdUYXNrIG5vdCBmb3VuZDogXFxgezB9XFxgJywgYXJncy5pZCkpIH07XG5cdFx0fVxuXHRcdGNvbnN0IHRhc2tMYWJlbCA9IHRhc2suX2xhYmVsO1xuXHRcdGNvbnN0IGFjdGl2ZVRhc2tzID0gYXdhaXQgdGhpcy5fdGFza3NTZXJ2aWNlLmdldEFjdGl2ZVRhc2tzKCk7XG5cdFx0aWYgKGFjdGl2ZVRhc2tzLmluY2x1ZGVzKHRhc2spKSB7XG5cdFx0XHRyZXR1cm4geyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBgVGhlIHRhc2sgJHt0YXNrTGFiZWx9IGlzIGFscmVhZHkgcnVubmluZy5gIH1dLCB0b29sUmVzdWx0TWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdjaGF0LnRhc2tBbHJlYWR5UnVubmluZycsICdUaGUgdGFzayBcXGB7MH1cXGAgaXMgYWxyZWFkeSBydW5uaW5nLicsIHRhc2tMYWJlbCkpIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVwZW5kZW5jeVRhc2tzID0gYXdhaXQgcmVzb2x2ZURlcGVuZGVuY3lUYXNrcyh0YXNrLCBhcmdzLndvcmtzcGFjZUZvbGRlciwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX3Rhc2tzU2VydmljZSk7XG5cdFx0Y29uc3Qgc3RhcnRNYXJrZXJzQnlUZXJtaW5hbEluc3RhbmNlSWQgPSBuZXcgTWFwPG51bWJlciwgUmV0dXJuVHlwZTxJVGVybWluYWxJbnN0YW5jZVsncmVnaXN0ZXJNYXJrZXInXT4+KCk7XG5cdFx0Y29uc3Qgc3RhcnRNYXJrZXJzRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGZvciAoY29uc3QgdGVybWluYWwgb2YgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmluc3RhbmNlcykge1xuXHRcdFx0Y29uc3QgbWFya2VyID0gdGVybWluYWwucmVnaXN0ZXJNYXJrZXIoKTtcblx0XHRcdHN0YXJ0TWFya2Vyc0J5VGVybWluYWxJbnN0YW5jZUlkLnNldCh0ZXJtaW5hbC5pbnN0YW5jZUlkLCBtYXJrZXIpO1xuXHRcdFx0aWYgKG1hcmtlcikge1xuXHRcdFx0XHRzdGFydE1hcmtlcnNEaXNwb3NhYmxlU3RvcmUuYWRkKG1hcmtlcik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByYWNlUmVzdWx0ID0gYXdhaXQgUHJvbWlzZS5yYWNlKFt0aGlzLl90YXNrc1NlcnZpY2UucnVuKHRhc2ssIHVuZGVmaW5lZCwgVGFza1J1blNvdXJjZS5DaGF0QWdlbnQpLCB0aW1lb3V0KDMwMDApXSk7XG5cdFx0XHRjb25zdCByZXN1bHQ6IElUYXNrU3VtbWFyeSB8IHVuZGVmaW5lZCA9IHJhY2VSZXN1bHQgJiYgdHlwZW9mIHJhY2VSZXN1bHQgPT09ICdvYmplY3QnID8gcmFjZVJlc3VsdCBhcyBJVGFza1N1bW1hcnkgOiB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IHJlc291cmNlcyA9IHRoaXMuX3Rhc2tzU2VydmljZS5nZXRUZXJtaW5hbHNGb3JUYXNrcyhkZXBlbmRlbmN5VGFza3MgPz8gdGFzayk7XG5cdFx0XHRpZiAoIXJlc291cmNlcyB8fCByZXNvdXJjZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IGBUYXNrIHN0YXJ0ZWQgYnV0IG5vIHRlcm1pbmFsIHdhcyBmb3VuZCBmb3I6ICR7dGFza0xhYmVsfWAgfV0sIHRvb2xSZXN1bHRNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2NoYXQubm9UZXJtaW5hbCcsICdUYXNrIHN0YXJ0ZWQgYnV0IG5vIHRlcm1pbmFsIHdhcyBmb3VuZCBmb3I6IFxcYHswfVxcYCcsIHRhc2tMYWJlbCkpIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0ZXJtaW5hbHMgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuaW5zdGFuY2VzLmZpbHRlcih0ID0+IHJlc291cmNlcy5zb21lKHIgPT4gci5wYXRoID09PSB0LnJlc291cmNlLnBhdGggJiYgci5zY2hlbWUgPT09IHQucmVzb3VyY2Uuc2NoZW1lKSk7XG5cdFx0XHRpZiAodGVybWluYWxzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4geyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBgVGFzayBzdGFydGVkIGJ1dCBubyB0ZXJtaW5hbCB3YXMgZm91bmQgZm9yOiAke3Rhc2tMYWJlbH1gIH1dLCB0b29sUmVzdWx0TWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdjaGF0Lm5vVGVybWluYWwnLCAnVGFzayBzdGFydGVkIGJ1dCBubyB0ZXJtaW5hbCB3YXMgZm91bmQgZm9yOiBcXGB7MH1cXGAnLCB0YXNrTGFiZWwpKSB9O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGxldCB0ZXJtaW5hbFJlc3VsdHM6IEF3YWl0ZWQ8UmV0dXJuVHlwZTx0eXBlb2YgY29sbGVjdFRlcm1pbmFsUmVzdWx0cz4+ID0gW107XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0ZXJtaW5hbFJlc3VsdHMgPSBhd2FpdCBjb2xsZWN0VGVybWluYWxSZXN1bHRzKFxuXHRcdFx0XHRcdHRlcm1pbmFscyxcblx0XHRcdFx0XHR0YXNrLFxuXHRcdFx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHRcdGludm9jYXRpb24uY29udGV4dCEsXG5cdFx0XHRcdFx0X3Byb2dyZXNzLFxuXHRcdFx0XHRcdHRva2VuLFxuXHRcdFx0XHRcdHN0b3JlLFxuXHRcdFx0XHRcdCh0ZXJtaW5hbFRhc2spID0+IHRoaXMuX2lzVGFza0FjdGl2ZSh0ZXJtaW5hbFRhc2spLFxuXHRcdFx0XHRcdGRlcGVuZGVuY3lUYXNrcyxcblx0XHRcdFx0XHR0aGlzLl90YXNrc1NlcnZpY2UsXG5cdFx0XHRcdFx0c3RhcnRNYXJrZXJzQnlUZXJtaW5hbEluc3RhbmNlSWRcblx0XHRcdFx0KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgciBvZiB0ZXJtaW5hbFJlc3VsdHMpIHtcblx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPy48VGFza1Rvb2xFdmVudCwgVGFza1Rvb2xDbGFzc2lmaWNhdGlvbj4oJ2NvcGlsb3RDaGF0LnJ1blRhc2tUb29sLnJ1bicsIHtcblx0XHRcdFx0XHR0YXNrSWQ6IGFyZ3MuaWQsXG5cdFx0XHRcdFx0YnVmZmVyTGVuZ3RoOiByLm91dHB1dC5sZW5ndGggPz8gMCxcblx0XHRcdFx0XHRwb2xsRHVyYXRpb25Nczogci5wb2xsRHVyYXRpb25NcyA/PyAwLFxuXHRcdFx0XHRcdGlucHV0VG9vbE1hbnVhbEFjY2VwdENvdW50OiByLmlucHV0VG9vbE1hbnVhbEFjY2VwdENvdW50ID8/IDAsXG5cdFx0XHRcdFx0aW5wdXRUb29sTWFudWFsUmVqZWN0Q291bnQ6IHIuaW5wdXRUb29sTWFudWFsUmVqZWN0Q291bnQgPz8gMCxcblx0XHRcdFx0XHRpbnB1dFRvb2xNYW51YWxDaGFyczogci5pbnB1dFRvb2xNYW51YWxDaGFycyA/PyAwLFxuXHRcdFx0XHRcdGlucHV0VG9vbE1hbnVhbFNob3duQ291bnQ6IHIuaW5wdXRUb29sTWFudWFsU2hvd25Db3VudCA/PyAwLFxuXHRcdFx0XHRcdGlucHV0VG9vbEZyZWVGb3JtSW5wdXRTaG93bkNvdW50OiByLmlucHV0VG9vbEZyZWVGb3JtSW5wdXRTaG93bkNvdW50ID8/IDAsXG5cdFx0XHRcdFx0aW5wdXRUb29sRnJlZUZvcm1JbnB1dENvdW50OiByLmlucHV0VG9vbEZyZWVGb3JtSW5wdXRDb3VudCA/PyAwXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZXRhaWxzID0gdGVybWluYWxSZXN1bHRzLm1hcChyID0+IGBUZXJtaW5hbDogJHtyLm5hbWV9XFxuT3V0cHV0OlxcbiR7ci5vdXRwdXR9YCk7XG5cdFx0XHRjb25zdCB1bmlxdWVEZXRhaWxzID0gQXJyYXkuZnJvbShuZXcgU2V0KGRldGFpbHMpKS5qb2luKCdcXG5cXG4nKTtcblx0XHRcdGNvbnN0IHRvb2xSZXN1bHREZXRhaWxzID0gdG9vbFJlc3VsdERldGFpbHNGcm9tUmVzcG9uc2UodGVybWluYWxSZXN1bHRzKTtcblx0XHRcdGNvbnN0IHRvb2xSZXN1bHRNZXNzYWdlID0gdG9vbFJlc3VsdE1lc3NhZ2VGcm9tUmVzcG9uc2UocmVzdWx0LCB0YXNrTGFiZWwsIHRvb2xSZXN1bHREZXRhaWxzLCB0ZXJtaW5hbFJlc3VsdHMsIHVuZGVmaW5lZCwgdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQpO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiB1bmlxdWVEZXRhaWxzIH1dLFxuXHRcdFx0XHR0b29sUmVzdWx0TWVzc2FnZSxcblx0XHRcdFx0dG9vbFJlc3VsdERldGFpbHNcblx0XHRcdH07XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHN0YXJ0TWFya2Vyc0Rpc3Bvc2FibGVTdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaXNUYXNrQWN0aXZlKHRhc2s6IFRhc2spOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBidXN5VGFza3MgPSBhd2FpdCB0aGlzLl90YXNrc1NlcnZpY2UuZ2V0QnVzeVRhc2tzKCk7XG5cdFx0cmV0dXJuIGJ1c3lUYXNrcz8uc29tZSh0ID0+IHRhc2tzTWF0Y2godCwgdGFzaykpID8/IGZhbHNlO1xuXHR9XG5cblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGFyZ3MgPSBjb250ZXh0LnBhcmFtZXRlcnMgYXMgSVJ1blRhc2tUb29sSW5wdXQ7XG5cdFx0Y29uc3QgdGFza0RlZmluaXRpb24gPSBnZXRUYXNrRGVmaW5pdGlvbihhcmdzLmlkKTtcblxuXHRcdGNvbnN0IHRhc2sgPSBhd2FpdCBnZXRUYXNrRm9yVG9vbChhcmdzLmlkLCB0YXNrRGVmaW5pdGlvbiwgYXJncy53b3Jrc3BhY2VGb2xkZXIsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl90YXNrc1NlcnZpY2UsIHRydWUpO1xuXHRcdGlmICghdGFzaykge1xuXHRcdFx0cmV0dXJuIHsgaW52b2NhdGlvbk1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnY2hhdC50YXNrTm90Rm91bmQnLCAnVGFzayBub3QgZm91bmQ6IFxcYHswfVxcYCcsIGFyZ3MuaWQpKSB9O1xuXHRcdH1cblx0XHRjb25zdCB0YXNrTGFiZWwgPSB0YXNrLl9sYWJlbDtcblx0XHRjb25zdCBhY3RpdmVUYXNrcyA9IGF3YWl0IHRoaXMuX3Rhc2tzU2VydmljZS5nZXRBY3RpdmVUYXNrcygpO1xuXHRcdGlmICh0YXNrICYmIGFjdGl2ZVRhc2tzLmluY2x1ZGVzKHRhc2spKSB7XG5cdFx0XHRyZXR1cm4geyBpbnZvY2F0aW9uTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdjaGF0LnRhc2tBbHJlYWR5QWN0aXZlJywgJ1RoZSB0YXNrIGlzIGFscmVhZHkgcnVubmluZy4nKSkgfTtcblx0XHR9XG5cblx0XHRpZiAoYXdhaXQgdGhpcy5faXNUYXNrQWN0aXZlKHRhc2spKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdjaGF0LnRhc2tJc0FscmVhZHlSdW5uaW5nJywgJ1xcYHswfVxcYCBpcyBhbHJlYWR5IHJ1bm5pbmcuJywgdGFza0xhYmVsKSksXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnY2hhdC50YXNrV2FzQWxyZWFkeVJ1bm5pbmcnLCAnXFxgezB9XFxgIHdhcyBhbHJlYWR5IHJ1bm5pbmcuJywgdGFza0xhYmVsKSksXG5cdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB1bmRlZmluZWRcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2NoYXQucnVubmluZ1Rhc2snLCAnUnVubmluZyBcXGB7MH1cXGAnLCB0YXNrTGFiZWwpKSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyh0YXNrPy5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmRcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5zdGFydGVkVGFzaycsICdTdGFydGVkIFxcYHswfVxcYCcsIHRhc2tMYWJlbClcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5yYW5UYXNrJywgJ1JhbiBcXGB7MH1cXGAnLCB0YXNrTGFiZWwpKSxcblx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB0YXNrXG5cdFx0XHRcdD8geyB0aXRsZTogbG9jYWxpemUoJ2NoYXQuYWxsb3dUYXNrUnVuVGl0bGUnLCAnQWxsb3cgdGFzayBydW4/JyksIG1lc3NhZ2U6IGxvY2FsaXplKCdjaGF0LmFsbG93VGFza1J1bk1zZycsICdBbGxvdyB0byBydW4gdGhlIHRhc2sgXFxgezB9XFxgPycsIHRhc2tMYWJlbCkgfVxuXHRcdFx0XHQ6IHVuZGVmaW5lZFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IFJ1blRhc2tUb29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRpZDogVGVybWluYWxUb29sSWQuUnVuVGFzayxcblx0dG9vbFJlZmVyZW5jZU5hbWU6ICdydW5UYXNrJyxcblx0bGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lczogWydydW5UYXNrcy9ydW5UYXNrJ10sXG5cdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbFRvb2wuZGlzcGxheU5hbWUnLCAnUnVuIFRhc2snKSxcblx0bW9kZWxEZXNjcmlwdGlvbjogYFJ1bnMgYSBWUyBDb2RlIHRhc2suXFxuXFxuLSBJZiB5b3Ugc2VlIHRoYXQgYW4gYXBwcm9wcmlhdGUgdGFzayBleGlzdHMgZm9yIGJ1aWxkaW5nIG9yIHJ1bm5pbmcgY29kZSwgcHJlZmVyIHRvIHVzZSB0aGlzIHRvb2wgdG8gcnVuIHRoZSB0YXNrIGluc3RlYWQgb2YgdXNpbmcgdGhlICR7VGVybWluYWxUb29sSWQuUnVuSW5UZXJtaW5hbH0gdG9vbC5cXG4tIE1ha2Ugc3VyZSB0aGF0IGFueSBhcHByb3ByaWF0ZSBidWlsZCBvciB3YXRjaCB0YXNrIGlzIHJ1bm5pbmcgYmVmb3JlIHRyeWluZyB0byBydW4gdGVzdHMgb3IgZXhlY3V0ZSBjb2RlLlxcbi0gSWYgdGhlIHVzZXIgYXNrcyB0byBydW4gYSB0YXNrLCB1c2UgdGhpcyB0b29sIHRvIGRvIHNvLmAsXG5cdHVzZXJEZXNjcmlwdGlvbjogbG9jYWxpemUoJ3J1bkluVGVybWluYWxUb29sLnVzZXJEZXNjcmlwdGlvbicsICdSdW4gdGFza3MgaW4gdGhlIHdvcmtzcGFjZScpLFxuXHRpY29uOiBDb2RpY29uLnRvb2xzLFxuXHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRpbnB1dFNjaGVtYToge1xuXHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHQnd29ya3NwYWNlRm9sZGVyJzoge1xuXHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb24nOiAnVGhlIHdvcmtzcGFjZSBmb2xkZXIgcGF0aCBjb250YWluaW5nIHRoZSB0YXNrJ1xuXHRcdFx0fSxcblx0XHRcdCdpZCc6IHtcblx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ1RoZSB0YXNrIElEIHRvIHJ1bi4nXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQncmVxdWlyZWQnOiBbXG5cdFx0XHQnd29ya3NwYWNlRm9sZGVyJyxcblx0XHRcdCdpZCdcblx0XHRdXG5cdH1cbn07XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUV4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUE4SSxzQkFBb0M7QUFDbEwsU0FBUyxvQkFBd0M7QUFDakQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBNEIsd0JBQXdCO0FBQ3BELFNBQVMsd0JBQXdCLG1CQUFtQixnQkFBZ0Isd0JBQXdCLGtCQUFrQjtBQUM5RyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGVBQWU7QUFDeEIsU0FBUywrQkFBK0IscUNBQXFDO0FBQzdFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsc0JBQXNCO0FBT3hCLElBQU0sY0FBTixNQUF1QztBQUFBLEVBRTdDLFlBQ2dDLGVBQ0ssbUJBQ0Qsa0JBQ0ssdUJBQ0EsdUJBQ3ZDO0FBTDhCO0FBQ0s7QUFDRDtBQUNLO0FBQ0E7QUFBQSxFQUNyQztBQUFBLEVBRUosTUFBTSxPQUFPLFlBQTZCLGNBQW1DLFdBQXlCLE9BQWdEO0FBQ3JKLFVBQU0sT0FBTyxXQUFXO0FBRXhCLFFBQUksQ0FBQyxXQUFXLFNBQVM7QUFDeEIsYUFBTyxFQUFFLFNBQVMsQ0FBQyxFQUFFLE1BQU0sUUFBUSxPQUFPLHdCQUF3QixDQUFDLEdBQUcsbUJBQW1CLHdCQUF3QjtBQUFBLElBQ2xIO0FBRUEsVUFBTSxpQkFBaUIsa0JBQWtCLEtBQUssRUFBRTtBQUNoRCxVQUFNLE9BQU8sTUFBTSxlQUFlLEtBQUssSUFBSSxnQkFBZ0IsS0FBSyxpQkFBaUIsS0FBSyx1QkFBdUIsS0FBSyxlQUFlLElBQUk7QUFDckksUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPLEVBQUUsU0FBUyxDQUFDLEVBQUUsTUFBTSxRQUFRLE9BQU8sbUJBQW1CLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRyxtQkFBbUIsSUFBSSxlQUFlLFNBQVMscUJBQXFCLHlCQUEyQixLQUFLLEVBQUUsQ0FBQyxFQUFFO0FBQUEsSUFDckw7QUFDQSxVQUFNLFlBQVksS0FBSztBQUN2QixVQUFNLGNBQWMsTUFBTSxLQUFLLGNBQWMsZUFBZTtBQUM1RCxRQUFJLFlBQVksU0FBUyxJQUFJLEdBQUc7QUFDL0IsYUFBTyxFQUFFLFNBQVMsQ0FBQyxFQUFFLE1BQU0sUUFBUSxPQUFPLFlBQVksU0FBUyx1QkFBdUIsQ0FBQyxHQUFHLG1CQUFtQixJQUFJLGVBQWUsU0FBUywyQkFBMkIsc0NBQXdDLFNBQVMsQ0FBQyxFQUFFO0FBQUEsSUFDek47QUFFQSxVQUFNLGtCQUFrQixNQUFNLHVCQUF1QixNQUFNLEtBQUssaUJBQWlCLEtBQUssdUJBQXVCLEtBQUssYUFBYTtBQUMvSCxVQUFNLG1DQUFtQyxvQkFBSSxJQUE2RDtBQUMxRyxVQUFNLDhCQUE4QixJQUFJLGdCQUFnQjtBQUN4RCxlQUFXLFlBQVksS0FBSyxpQkFBaUIsV0FBVztBQUN2RCxZQUFNLFNBQVMsU0FBUyxlQUFlO0FBQ3ZDLHVDQUFpQyxJQUFJLFNBQVMsWUFBWSxNQUFNO0FBQ2hFLFVBQUksUUFBUTtBQUNYLG9DQUE0QixJQUFJLE1BQU07QUFBQSxNQUN2QztBQUFBLElBQ0Q7QUFDQSxRQUFJO0FBQ0gsWUFBTSxhQUFhLE1BQU0sUUFBUSxLQUFLLENBQUMsS0FBSyxjQUFjLElBQUksTUFBTSxRQUFXLGNBQWMsU0FBUyxHQUFHLFFBQVEsR0FBSSxDQUFDLENBQUM7QUFDdkgsWUFBTSxTQUFtQyxjQUFjLE9BQU8sZUFBZSxXQUFXLGFBQTZCO0FBRXJILFlBQU0sWUFBWSxLQUFLLGNBQWMscUJBQXFCLG1CQUFtQixJQUFJO0FBQ2pGLFVBQUksQ0FBQyxhQUFhLFVBQVUsV0FBVyxHQUFHO0FBQ3pDLGVBQU8sRUFBRSxTQUFTLENBQUMsRUFBRSxNQUFNLFFBQVEsT0FBTywrQ0FBK0MsU0FBUyxHQUFHLENBQUMsR0FBRyxtQkFBbUIsSUFBSSxlQUFlLFNBQVMsbUJBQW1CLHFEQUF1RCxTQUFTLENBQUMsRUFBRTtBQUFBLE1BQy9PO0FBQ0EsWUFBTSxZQUFZLEtBQUssaUJBQWlCLFVBQVUsT0FBTyxPQUFLLFVBQVUsS0FBSyxPQUFLLEVBQUUsU0FBUyxFQUFFLFNBQVMsUUFBUSxFQUFFLFdBQVcsRUFBRSxTQUFTLE1BQU0sQ0FBQztBQUMvSSxVQUFJLFVBQVUsV0FBVyxHQUFHO0FBQzNCLGVBQU8sRUFBRSxTQUFTLENBQUMsRUFBRSxNQUFNLFFBQVEsT0FBTywrQ0FBK0MsU0FBUyxHQUFHLENBQUMsR0FBRyxtQkFBbUIsSUFBSSxlQUFlLFNBQVMsbUJBQW1CLHFEQUF1RCxTQUFTLENBQUMsRUFBRTtBQUFBLE1BQy9PO0FBRUEsWUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLFVBQUksa0JBQXNFLENBQUM7QUFDM0UsVUFBSTtBQUNILDBCQUFrQixNQUFNO0FBQUEsVUFDdkI7QUFBQSxVQUNBO0FBQUEsVUFDQSxLQUFLO0FBQUEsVUFDTCxXQUFXO0FBQUEsVUFDWDtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQSxDQUFDLGlCQUFpQixLQUFLLGNBQWMsWUFBWTtBQUFBLFVBQ2pEO0FBQUEsVUFDQSxLQUFLO0FBQUEsVUFDTDtBQUFBLFFBQ0Q7QUFBQSxNQUNELFVBQUU7QUFDRCxjQUFNLFFBQVE7QUFBQSxNQUNmO0FBQ0EsaUJBQVcsS0FBSyxpQkFBaUI7QUFDaEMsYUFBSyxrQkFBa0IsYUFBb0QsK0JBQStCO0FBQUEsVUFDekcsUUFBUSxLQUFLO0FBQUEsVUFDYixjQUFjLEVBQUUsT0FBTyxVQUFVO0FBQUEsVUFDakMsZ0JBQWdCLEVBQUUsa0JBQWtCO0FBQUEsVUFDcEMsNEJBQTRCLEVBQUUsOEJBQThCO0FBQUEsVUFDNUQsNEJBQTRCLEVBQUUsOEJBQThCO0FBQUEsVUFDNUQsc0JBQXNCLEVBQUUsd0JBQXdCO0FBQUEsVUFDaEQsMkJBQTJCLEVBQUUsNkJBQTZCO0FBQUEsVUFDMUQsa0NBQWtDLEVBQUUsb0NBQW9DO0FBQUEsVUFDeEUsNkJBQTZCLEVBQUUsK0JBQStCO0FBQUEsUUFDL0QsQ0FBQztBQUFBLE1BQ0Y7QUFFQSxZQUFNLFVBQVUsZ0JBQWdCLElBQUksT0FBSyxhQUFhLEVBQUUsSUFBSTtBQUFBO0FBQUEsRUFBYyxFQUFFLE1BQU0sRUFBRTtBQUNwRixZQUFNLGdCQUFnQixNQUFNLEtBQUssSUFBSSxJQUFJLE9BQU8sQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUM5RCxZQUFNLG9CQUFvQiw4QkFBOEIsZUFBZTtBQUN2RSxZQUFNLG9CQUFvQiw4QkFBOEIsUUFBUSxXQUFXLG1CQUFtQixpQkFBaUIsUUFBVyxLQUFLLHdCQUF3QixZQUFZO0FBRW5LLGFBQU87QUFBQSxRQUNOLFNBQVMsQ0FBQyxFQUFFLE1BQU0sUUFBUSxPQUFPLGNBQWMsQ0FBQztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNELFVBQUU7QUFDRCxrQ0FBNEIsUUFBUTtBQUFBLElBQ3JDO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxjQUFjLE1BQThCO0FBQ3pELFVBQU0sWUFBWSxNQUFNLEtBQUssY0FBYyxhQUFhO0FBQ3hELFdBQU8sV0FBVyxLQUFLLE9BQUssV0FBVyxHQUFHLElBQUksQ0FBQyxLQUFLO0FBQUEsRUFDckQ7QUFBQSxFQUVBLE1BQU0sc0JBQXNCLFNBQTRDLE9BQXdFO0FBQy9JLFVBQU0sT0FBTyxRQUFRO0FBQ3JCLFVBQU0saUJBQWlCLGtCQUFrQixLQUFLLEVBQUU7QUFFaEQsVUFBTSxPQUFPLE1BQU0sZUFBZSxLQUFLLElBQUksZ0JBQWdCLEtBQUssaUJBQWlCLEtBQUssdUJBQXVCLEtBQUssZUFBZSxJQUFJO0FBQ3JJLFFBQUksQ0FBQyxNQUFNO0FBQ1YsYUFBTyxFQUFFLG1CQUFtQixJQUFJLGVBQWUsU0FBUyxxQkFBcUIseUJBQTJCLEtBQUssRUFBRSxDQUFDLEVBQUU7QUFBQSxJQUNuSDtBQUNBLFVBQU0sWUFBWSxLQUFLO0FBQ3ZCLFVBQU0sY0FBYyxNQUFNLEtBQUssY0FBYyxlQUFlO0FBQzVELFFBQUksUUFBUSxZQUFZLFNBQVMsSUFBSSxHQUFHO0FBQ3ZDLGFBQU8sRUFBRSxtQkFBbUIsSUFBSSxlQUFlLFNBQVMsMEJBQTBCLDhCQUE4QixDQUFDLEVBQUU7QUFBQSxJQUNwSDtBQUVBLFFBQUksTUFBTSxLQUFLLGNBQWMsSUFBSSxHQUFHO0FBQ25DLGFBQU87QUFBQSxRQUNOLG1CQUFtQixJQUFJLGVBQWUsU0FBUyw2QkFBNkIsNkJBQStCLFNBQVMsQ0FBQztBQUFBLFFBQ3JILGtCQUFrQixJQUFJLGVBQWUsU0FBUyw4QkFBOEIsOEJBQWdDLFNBQVMsQ0FBQztBQUFBLFFBQ3RILHNCQUFzQjtBQUFBLE1BQ3ZCO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxNQUNOLG1CQUFtQixJQUFJLGVBQWUsU0FBUyxvQkFBb0IsaUJBQW1CLFNBQVMsQ0FBQztBQUFBLE1BQ2hHLGtCQUFrQixJQUFJLGVBQWUsTUFBTSx3QkFBd0IsZUFDaEUsU0FBUyxvQkFBb0IsaUJBQW1CLFNBQVMsSUFDekQsU0FBUyxnQkFBZ0IsYUFBZSxTQUFTLENBQUM7QUFBQSxNQUNyRCxzQkFBc0IsT0FDbkIsRUFBRSxPQUFPLFNBQVMsMEJBQTBCLGlCQUFpQixHQUFHLFNBQVMsU0FBUyx3QkFBd0IsZ0NBQWtDLFNBQVMsRUFBRSxJQUN2SjtBQUFBLElBQ0o7QUFBQSxFQUNEO0FBQ0Q7QUF4SWEsY0FBTjtBQUFBLEVBR0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FQVTtBQTBJTixNQUFNLGtCQUE2QjtBQUFBLEVBQ3pDLElBQUksZUFBZTtBQUFBLEVBQ25CLG1CQUFtQjtBQUFBLEVBQ25CLDhCQUE4QixDQUFDLGtCQUFrQjtBQUFBLEVBQ2pELGFBQWEsU0FBUyxpQ0FBaUMsVUFBVTtBQUFBLEVBQ2pFLGtCQUFrQjtBQUFBO0FBQUEsMElBQW1LLGVBQWUsYUFBYTtBQUFBO0FBQUE7QUFBQSxFQUNqTixpQkFBaUIsU0FBUyxxQ0FBcUMsNEJBQTRCO0FBQUEsRUFDM0YsTUFBTSxRQUFRO0FBQUEsRUFDZCxRQUFRLGVBQWU7QUFBQSxFQUN2QixhQUFhO0FBQUEsSUFDWixRQUFRO0FBQUEsSUFDUixjQUFjO0FBQUEsTUFDYixtQkFBbUI7QUFBQSxRQUNsQixRQUFRO0FBQUEsUUFDUixlQUFlO0FBQUEsTUFDaEI7QUFBQSxNQUNBLE1BQU07QUFBQSxRQUNMLFFBQVE7QUFBQSxRQUNSLGVBQWU7QUFBQSxNQUNoQjtBQUFBLElBQ0Q7QUFBQSxJQUNBLFlBQVk7QUFBQSxNQUNYO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
