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
import { collectTerminalResults, resolveDependencyTasks, tasksMatch } from "../../taskHelpers.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { IFileService } from "../../../../../../../platform/files/common/files.js";
import { VSBuffer } from "../../../../../../../base/common/buffer.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { toolResultDetailsFromResponse, toolResultMessageFromResponse } from "./taskHelpers.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { TerminalToolId } from "../toolIds.js";
let CreateAndRunTaskTool = class {
  constructor(_tasksService, _telemetryService, _terminalService, _fileService, _configurationService, _instantiationService) {
    this._tasksService = _tasksService;
    this._telemetryService = _telemetryService;
    this._terminalService = _terminalService;
    this._fileService = _fileService;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const args = invocation.parameters;
    if (!invocation.context) {
      return { content: [{ kind: "text", value: `No invocation context` }], toolResultMessage: `No invocation context` };
    }
    const tasksJsonUri = URI.file(args.workspaceFolder).with({ path: `${args.workspaceFolder}/.vscode/tasks.json` });
    const exists = await this._fileService.exists(tasksJsonUri);
    const newTask = {
      label: args.task.label,
      type: args.task.type,
      command: args.task.command,
      args: args.task.args,
      isBackground: args.task.isBackground,
      problemMatcher: args.task.problemMatcher,
      group: args.task.group
    };
    const tasksJsonContent = JSON.stringify({
      version: "2.0.0",
      tasks: [newTask]
    }, null, "	");
    if (!exists) {
      await this._fileService.createFile(tasksJsonUri, VSBuffer.fromString(tasksJsonContent), { overwrite: true });
      _progress.report({ message: "Created tasks.json file" });
    } else {
      const content = await this._fileService.readFile(tasksJsonUri);
      const tasksJson = JSON.parse(content.value.toString());
      tasksJson.tasks.push(newTask);
      await this._fileService.writeFile(tasksJsonUri, VSBuffer.fromString(JSON.stringify(tasksJson, null, "	")));
      _progress.report({ message: "Updated tasks.json file" });
    }
    _progress.report({ message: new MarkdownString(localize("copilotChat.fetchingTask", "Resolving the task")) });
    let task;
    const start = Date.now();
    while (Date.now() - start < 5e3 && !token.isCancellationRequested) {
      task = (await this._tasksService.tasks())?.find((t) => t._label === args.task.label);
      if (task) {
        break;
      }
      await timeout(100);
    }
    if (!task) {
      return { content: [{ kind: "text", value: `Task not found: ${args.task.label}` }], toolResultMessage: new MarkdownString(localize("copilotChat.taskNotFound", "Task not found: `{0}`", args.task.label)) };
    }
    const preRunMarkersStore = new DisposableStore();
    let result;
    let terminalResults = [];
    try {
      const dependencyTasks = await resolveDependencyTasks(task, args.workspaceFolder, this._configurationService, this._tasksService);
      const startMarkersByTerminalInstanceId = /* @__PURE__ */ new Map();
      for (const terminal of this._terminalService.instances) {
        const marker = terminal.registerMarker();
        startMarkersByTerminalInstanceId.set(terminal.instanceId, marker);
        if (marker) {
          preRunMarkersStore.add(marker);
        }
      }
      _progress.report({ message: new MarkdownString(localize("copilotChat.runningTask", "Running task `{0}`", args.task.label)) });
      const raceResult = await Promise.race([this._tasksService.run(task, void 0, TaskRunSource.ChatAgent), timeout(3e3)]);
      result = raceResult && typeof raceResult === "object" ? raceResult : void 0;
      const resources = this._tasksService.getTerminalsForTasks(dependencyTasks ?? task);
      const terminals = resources?.map((resource) => this._terminalService.instances.find((t) => t.resource.path === resource?.path && t.resource.scheme === resource.scheme)).filter(Boolean);
      if (!terminals || terminals.length === 0) {
        return { content: [{ kind: "text", value: `Task started but no terminal was found for: ${args.task.label}` }], toolResultMessage: new MarkdownString(localize("copilotChat.noTerminal", "Task started but no terminal was found for: `{0}`", args.task.label)) };
      }
      const store = new DisposableStore();
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
    } finally {
      preRunMarkersStore.dispose();
    }
    for (const r of terminalResults) {
      this._telemetryService.publicLog2?.("copilotChat.runTaskTool.createAndRunTask", {
        taskId: args.task.label,
        bufferLength: r.output.length ?? 0,
        pollDurationMs: r.pollDurationMs ?? 0,
        inputToolManualAcceptCount: r.inputToolManualAcceptCount ?? 0,
        inputToolManualRejectCount: r.inputToolManualRejectCount ?? 0,
        inputToolManualChars: r.inputToolManualChars ?? 0,
        inputToolManualShownCount: r.inputToolManualShownCount ?? 0,
        inputToolFreeFormInputCount: r.inputToolFreeFormInputCount ?? 0,
        inputToolFreeFormInputShownCount: r.inputToolFreeFormInputShownCount ?? 0
      });
    }
    const details = terminalResults.map((r) => `Terminal: ${r.name}
Output:
${r.output}`);
    const uniqueDetails = Array.from(new Set(details)).join("\n\n");
    const toolResultDetails = toolResultDetailsFromResponse(terminalResults);
    const toolResultMessage = toolResultMessageFromResponse(result, args.task.label, toolResultDetails, terminalResults, void 0, task.configurationProperties.isBackground);
    return {
      content: [{ kind: "text", value: uniqueDetails }],
      toolResultMessage,
      toolResultDetails
    };
  }
  async _isTaskActive(task) {
    const busyTasks = await this._tasksService.getBusyTasks();
    return busyTasks?.some((t) => tasksMatch(t, task)) ?? false;
  }
  async prepareToolInvocation(context, token) {
    const args = context.parameters;
    const task = args.task;
    const allTasks = await this._tasksService.tasks();
    if (allTasks?.find((t) => t._label === task.label)) {
      return {
        invocationMessage: new MarkdownString(localize("taskExists", "Task `{0}` already exists.", task.label)),
        pastTenseMessage: new MarkdownString(localize("taskExistsPast", "Task `{0}` already exists.", task.label)),
        confirmationMessages: void 0
      };
    }
    const activeTasks = await this._tasksService.getActiveTasks();
    if (activeTasks.find((t) => t._label === task.label)) {
      return {
        invocationMessage: new MarkdownString(localize("alreadyRunning", "Task `{0}` is already running.", task.label)),
        pastTenseMessage: new MarkdownString(localize("alreadyRunning", "Task `{0}` is already running.", task.label)),
        confirmationMessages: void 0
      };
    }
    return {
      invocationMessage: new MarkdownString(localize("createdTask", "Created task `{0}`", task.label)),
      pastTenseMessage: new MarkdownString(localize("createdTaskPast", "Created task `{0}`", task.label)),
      confirmationMessages: {
        title: localize("allowTaskCreationExecution", "Allow task creation and execution?"),
        message: new MarkdownString(
          localize(
            "createTask",
            "A task `{0}` with command `{1}`{2} will be created.",
            task.label,
            task.command,
            task.args?.length ? ` and args \`${task.args.join(" ")}\`` : ""
          )
        )
      }
    };
  }
};
CreateAndRunTaskTool = __decorateClass([
  __decorateParam(0, ITaskService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, ITerminalService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInstantiationService)
], CreateAndRunTaskTool);
const CreateAndRunTaskToolData = {
  id: TerminalToolId.CreateAndRunTask,
  toolReferenceName: "createAndRunTask",
  legacyToolReferenceFullNames: ["runTasks/createAndRunTask"],
  displayName: localize("createAndRunTask.displayName", "Create and run Task"),
  modelDescription: "Creates and runs a build, run, or custom task for the workspace by generating or adding to a tasks.json file based on the project structure (such as package.json or README.md). If the user asks to build, run, launch and they have no tasks.json file, use this tool. If they ask to create or add a task, use this tool.",
  userDescription: localize("createAndRunTask.userDescription", "Create and run a task in the workspace"),
  source: ToolDataSource.Internal,
  inputSchema: {
    "type": "object",
    "properties": {
      "workspaceFolder": {
        "type": "string",
        "description": "The absolute path of the workspace folder where the tasks.json file will be created."
      },
      "task": {
        "type": "object",
        "description": "The task to add to the new tasks.json file.",
        "properties": {
          "label": {
            "type": "string",
            "description": "The label of the task."
          },
          "type": {
            "type": "string",
            "description": `The type of the task. The only supported value is 'shell'.`,
            "enum": [
              "shell"
            ]
          },
          "command": {
            "type": "string",
            "description": "The shell command to run for the task. Use this to specify commands for building or running the application."
          },
          "args": {
            "type": "array",
            "description": "The arguments to pass to the command.",
            "items": {
              "type": "string"
            }
          },
          "isBackground": {
            "type": "boolean",
            "description": "Whether the task runs in the background without blocking the UI or other tasks. Set to true for long-running processes like watch tasks or servers that should continue executing without requiring user attention. When false, the task will block the terminal until completion."
          },
          "problemMatcher": {
            "type": "array",
            "description": `The problem matcher to use to parse task output for errors and warnings. Can be a predefined matcher like '$tsc' (TypeScript), '$eslint - stylish', '$gcc', etc., or a custom pattern defined in tasks.json. This helps VS Code display errors in the Problems panel and enables quick navigation to error locations.`,
            "items": {
              "type": "string"
            }
          },
          "group": {
            "type": "string",
            "description": "The group to which the task belongs."
          }
        },
        "required": [
          "label",
          "type",
          "command"
        ]
      }
    },
    "required": [
      "task",
      "workspaceFolder"
    ]
  }
};
export {
  CreateAndRunTaskTool,
  CreateAndRunTaskToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGJyb3dzZXJcXHRvb2xzXFx0YXNrXFxjcmVhdGVBbmRSdW5UYXNrVG9vbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IENvdW50VG9rZW5zQ2FsbGJhY2ssIElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLCBJVG9vbERhdGEsIElUb29sSW1wbCwgSVRvb2xJbnZvY2F0aW9uLCBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIElUb29sUmVzdWx0LCBUb29sRGF0YVNvdXJjZSwgVG9vbFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGFza1NlcnZpY2UsIElUYXNrU3VtbWFyeSwgVGFzayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rhc2tzL2NvbW1vbi90YXNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUYXNrUnVuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGFza3MvY29tbW9uL3Rhc2tzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBjb2xsZWN0VGVybWluYWxSZXN1bHRzLCBJQ29uZmlndXJlZFRhc2ssIHJlc29sdmVEZXBlbmRlbmN5VGFza3MsIHRhc2tzTWF0Y2ggfSBmcm9tICcuLi8uLi90YXNrSGVscGVycy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyB0b29sUmVzdWx0RGV0YWlsc0Zyb21SZXNwb25zZSwgdG9vbFJlc3VsdE1lc3NhZ2VGcm9tUmVzcG9uc2UgfSBmcm9tICcuL3Rhc2tIZWxwZXJzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRhc2tUb29sRXZlbnQsIFRhc2tUb29sQ2xhc3NpZmljYXRpb24gfSBmcm9tICcuL3Rhc2tUb29sc1RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFRvb2xJZCB9IGZyb20gJy4uL3Rvb2xJZHMuanMnO1xuXG5pbnRlcmZhY2UgSUNyZWF0ZUFuZFJ1blRhc2tUb29sSW5wdXQge1xuXHR3b3Jrc3BhY2VGb2xkZXI6IHN0cmluZztcblx0dGFzazoge1xuXHRcdGxhYmVsOiBzdHJpbmc7XG5cdFx0dHlwZTogc3RyaW5nO1xuXHRcdGNvbW1hbmQ6IHN0cmluZztcblx0XHRhcmdzPzogc3RyaW5nW107XG5cdFx0aXNCYWNrZ3JvdW5kPzogYm9vbGVhbjtcblx0XHRwcm9ibGVtTWF0Y2hlcj86IHN0cmluZ1tdO1xuXHRcdGdyb3VwPzogc3RyaW5nO1xuXHR9O1xufVxuXG5leHBvcnQgY2xhc3MgQ3JlYXRlQW5kUnVuVGFza1Rvb2wgaW1wbGVtZW50cyBJVG9vbEltcGwge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGFza1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGFza3NTZXJ2aWNlOiBJVGFza1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHsgfVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIF9jb3VudFRva2VuczogQ291bnRUb2tlbnNDYWxsYmFjaywgX3Byb2dyZXNzOiBUb29sUHJvZ3Jlc3MsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCBhcmdzID0gaW52b2NhdGlvbi5wYXJhbWV0ZXJzIGFzIElDcmVhdGVBbmRSdW5UYXNrVG9vbElucHV0O1xuXG5cdFx0aWYgKCFpbnZvY2F0aW9uLmNvbnRleHQpIHtcblx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IGBObyBpbnZvY2F0aW9uIGNvbnRleHRgIH1dLCB0b29sUmVzdWx0TWVzc2FnZTogYE5vIGludm9jYXRpb24gY29udGV4dGAgfTtcblx0XHR9XG5cblx0XHRjb25zdCB0YXNrc0pzb25VcmkgPSBVUkkuZmlsZShhcmdzLndvcmtzcGFjZUZvbGRlcikud2l0aCh7IHBhdGg6IGAke2FyZ3Mud29ya3NwYWNlRm9sZGVyfS8udnNjb2RlL3Rhc2tzLmpzb25gIH0pO1xuXHRcdGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyh0YXNrc0pzb25VcmkpO1xuXG5cdFx0Y29uc3QgbmV3VGFzazogSUNvbmZpZ3VyZWRUYXNrID0ge1xuXHRcdFx0bGFiZWw6IGFyZ3MudGFzay5sYWJlbCxcblx0XHRcdHR5cGU6IGFyZ3MudGFzay50eXBlLFxuXHRcdFx0Y29tbWFuZDogYXJncy50YXNrLmNvbW1hbmQsXG5cdFx0XHRhcmdzOiBhcmdzLnRhc2suYXJncyxcblx0XHRcdGlzQmFja2dyb3VuZDogYXJncy50YXNrLmlzQmFja2dyb3VuZCxcblx0XHRcdHByb2JsZW1NYXRjaGVyOiBhcmdzLnRhc2sucHJvYmxlbU1hdGNoZXIsXG5cdFx0XHRncm91cDogYXJncy50YXNrLmdyb3VwXG5cdFx0fTtcblxuXHRcdGNvbnN0IHRhc2tzSnNvbkNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHR2ZXJzaW9uOiAnMi4wLjAnLFxuXHRcdFx0dGFza3M6IFtuZXdUYXNrXVxuXHRcdH0sIG51bGwsICdcXHQnKTtcblx0XHRpZiAoIWV4aXN0cykge1xuXHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlRmlsZSh0YXNrc0pzb25VcmksIFZTQnVmZmVyLmZyb21TdHJpbmcodGFza3NKc29uQ29udGVudCksIHsgb3ZlcndyaXRlOiB0cnVlIH0pO1xuXHRcdFx0X3Byb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6ICdDcmVhdGVkIHRhc2tzLmpzb24gZmlsZScgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGFkZCB0byB0aGUgZXhpc3RpbmcgdGFza3MuanNvbiBmaWxlXG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUodGFza3NKc29uVXJpKTtcblx0XHRcdGNvbnN0IHRhc2tzSnNvbiA9IEpTT04ucGFyc2UoY29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHRcdHRhc2tzSnNvbi50YXNrcy5wdXNoKG5ld1Rhc2spO1xuXHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRhc2tzSnNvblVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh0YXNrc0pzb24sIG51bGwsICdcXHQnKSkpO1xuXHRcdFx0X3Byb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6ICdVcGRhdGVkIHRhc2tzLmpzb24gZmlsZScgfSk7XG5cdFx0fVxuXHRcdF9wcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2NvcGlsb3RDaGF0LmZldGNoaW5nVGFzaycsICdSZXNvbHZpbmcgdGhlIHRhc2snKSkgfSk7XG5cblx0XHRsZXQgdGFzazogVGFzayB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG5cdFx0d2hpbGUgKERhdGUubm93KCkgLSBzdGFydCA8IDUwMDAgJiYgIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0YXNrID0gKGF3YWl0IHRoaXMuX3Rhc2tzU2VydmljZS50YXNrcygpKT8uZmluZCh0ID0+IHQuX2xhYmVsID09PSBhcmdzLnRhc2subGFiZWwpO1xuXHRcdFx0aWYgKHRhc2spIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEwMCk7XG5cdFx0fVxuXHRcdGlmICghdGFzaykge1xuXHRcdFx0cmV0dXJuIHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogYFRhc2sgbm90IGZvdW5kOiAke2FyZ3MudGFzay5sYWJlbH1gIH1dLCB0b29sUmVzdWx0TWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdjb3BpbG90Q2hhdC50YXNrTm90Rm91bmQnLCAnVGFzayBub3QgZm91bmQ6IGB7MH1gJywgYXJncy50YXNrLmxhYmVsKSkgfTtcblx0XHR9XG5cblx0XHRjb25zdCBwcmVSdW5NYXJrZXJzU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bGV0IHJlc3VsdDogSVRhc2tTdW1tYXJ5IHwgdW5kZWZpbmVkO1xuXHRcdGxldCB0ZXJtaW5hbFJlc3VsdHM6IEF3YWl0ZWQ8UmV0dXJuVHlwZTx0eXBlb2YgY29sbGVjdFRlcm1pbmFsUmVzdWx0cz4+ID0gW107XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRlcGVuZGVuY3lUYXNrcyA9IGF3YWl0IHJlc29sdmVEZXBlbmRlbmN5VGFza3ModGFzaywgYXJncy53b3Jrc3BhY2VGb2xkZXIsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl90YXNrc1NlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgc3RhcnRNYXJrZXJzQnlUZXJtaW5hbEluc3RhbmNlSWQgPSBuZXcgTWFwPG51bWJlciwgUmV0dXJuVHlwZTxJVGVybWluYWxJbnN0YW5jZVsncmVnaXN0ZXJNYXJrZXInXT4+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IHRlcm1pbmFsIG9mIHRoaXMuX3Rlcm1pbmFsU2VydmljZS5pbnN0YW5jZXMpIHtcblx0XHRcdFx0Y29uc3QgbWFya2VyID0gdGVybWluYWwucmVnaXN0ZXJNYXJrZXIoKTtcblx0XHRcdFx0c3RhcnRNYXJrZXJzQnlUZXJtaW5hbEluc3RhbmNlSWQuc2V0KHRlcm1pbmFsLmluc3RhbmNlSWQsIG1hcmtlcik7XG5cdFx0XHRcdGlmIChtYXJrZXIpIHtcblx0XHRcdFx0XHRwcmVSdW5NYXJrZXJzU3RvcmUuYWRkKG1hcmtlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0X3Byb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnY29waWxvdENoYXQucnVubmluZ1Rhc2snLCAnUnVubmluZyB0YXNrIGB7MH1gJywgYXJncy50YXNrLmxhYmVsKSkgfSk7XG5cdFx0XHRjb25zdCByYWNlUmVzdWx0ID0gYXdhaXQgUHJvbWlzZS5yYWNlKFt0aGlzLl90YXNrc1NlcnZpY2UucnVuKHRhc2ssIHVuZGVmaW5lZCwgVGFza1J1blNvdXJjZS5DaGF0QWdlbnQpLCB0aW1lb3V0KDMwMDApXSk7XG5cdFx0XHRyZXN1bHQgPSByYWNlUmVzdWx0ICYmIHR5cGVvZiByYWNlUmVzdWx0ID09PSAnb2JqZWN0JyA/IHJhY2VSZXN1bHQgYXMgSVRhc2tTdW1tYXJ5IDogdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCByZXNvdXJjZXMgPSB0aGlzLl90YXNrc1NlcnZpY2UuZ2V0VGVybWluYWxzRm9yVGFza3MoZGVwZW5kZW5jeVRhc2tzID8/IHRhc2spO1xuXHRcdFx0Y29uc3QgdGVybWluYWxzID0gcmVzb3VyY2VzPy5tYXAocmVzb3VyY2UgPT4gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmluc3RhbmNlcy5maW5kKHQgPT4gdC5yZXNvdXJjZS5wYXRoID09PSByZXNvdXJjZT8ucGF0aCAmJiB0LnJlc291cmNlLnNjaGVtZSA9PT0gcmVzb3VyY2Uuc2NoZW1lKSkuZmlsdGVyKEJvb2xlYW4pIGFzIElUZXJtaW5hbEluc3RhbmNlW107XG5cdFx0XHRpZiAoIXRlcm1pbmFscyB8fCB0ZXJtaW5hbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IGBUYXNrIHN0YXJ0ZWQgYnV0IG5vIHRlcm1pbmFsIHdhcyBmb3VuZCBmb3I6ICR7YXJncy50YXNrLmxhYmVsfWAgfV0sIHRvb2xSZXN1bHRNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2NvcGlsb3RDaGF0Lm5vVGVybWluYWwnLCAnVGFzayBzdGFydGVkIGJ1dCBubyB0ZXJtaW5hbCB3YXMgZm91bmQgZm9yOiBgezB9YCcsIGFyZ3MudGFzay5sYWJlbCkpIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRlcm1pbmFsUmVzdWx0cyA9IGF3YWl0IGNvbGxlY3RUZXJtaW5hbFJlc3VsdHMoXG5cdFx0XHRcdFx0dGVybWluYWxzLFxuXHRcdFx0XHRcdHRhc2ssXG5cdFx0XHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRcdFx0aW52b2NhdGlvbi5jb250ZXh0ISxcblx0XHRcdFx0XHRfcHJvZ3Jlc3MsXG5cdFx0XHRcdFx0dG9rZW4sXG5cdFx0XHRcdFx0c3RvcmUsXG5cdFx0XHRcdFx0KHRlcm1pbmFsVGFzaykgPT4gdGhpcy5faXNUYXNrQWN0aXZlKHRlcm1pbmFsVGFzayksXG5cdFx0XHRcdFx0ZGVwZW5kZW5jeVRhc2tzLFxuXHRcdFx0XHRcdHRoaXMuX3Rhc2tzU2VydmljZSxcblx0XHRcdFx0XHRzdGFydE1hcmtlcnNCeVRlcm1pbmFsSW5zdGFuY2VJZFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRwcmVSdW5NYXJrZXJzU3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHIgb2YgdGVybWluYWxSZXN1bHRzKSB7XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI/LjxUYXNrVG9vbEV2ZW50LCBUYXNrVG9vbENsYXNzaWZpY2F0aW9uPignY29waWxvdENoYXQucnVuVGFza1Rvb2wuY3JlYXRlQW5kUnVuVGFzaycsIHtcblx0XHRcdFx0dGFza0lkOiBhcmdzLnRhc2subGFiZWwsXG5cdFx0XHRcdGJ1ZmZlckxlbmd0aDogci5vdXRwdXQubGVuZ3RoID8/IDAsXG5cdFx0XHRcdHBvbGxEdXJhdGlvbk1zOiByLnBvbGxEdXJhdGlvbk1zID8/IDAsXG5cdFx0XHRcdGlucHV0VG9vbE1hbnVhbEFjY2VwdENvdW50OiByLmlucHV0VG9vbE1hbnVhbEFjY2VwdENvdW50ID8/IDAsXG5cdFx0XHRcdGlucHV0VG9vbE1hbnVhbFJlamVjdENvdW50OiByLmlucHV0VG9vbE1hbnVhbFJlamVjdENvdW50ID8/IDAsXG5cdFx0XHRcdGlucHV0VG9vbE1hbnVhbENoYXJzOiByLmlucHV0VG9vbE1hbnVhbENoYXJzID8/IDAsXG5cdFx0XHRcdGlucHV0VG9vbE1hbnVhbFNob3duQ291bnQ6IHIuaW5wdXRUb29sTWFudWFsU2hvd25Db3VudCA/PyAwLFxuXHRcdFx0XHRpbnB1dFRvb2xGcmVlRm9ybUlucHV0Q291bnQ6IHIuaW5wdXRUb29sRnJlZUZvcm1JbnB1dENvdW50ID8/IDAsXG5cdFx0XHRcdGlucHV0VG9vbEZyZWVGb3JtSW5wdXRTaG93bkNvdW50OiByLmlucHV0VG9vbEZyZWVGb3JtSW5wdXRTaG93bkNvdW50ID8/IDBcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRldGFpbHMgPSB0ZXJtaW5hbFJlc3VsdHMubWFwKHIgPT4gYFRlcm1pbmFsOiAke3IubmFtZX1cXG5PdXRwdXQ6XFxuJHtyLm91dHB1dH1gKTtcblx0XHRjb25zdCB1bmlxdWVEZXRhaWxzID0gQXJyYXkuZnJvbShuZXcgU2V0KGRldGFpbHMpKS5qb2luKCdcXG5cXG4nKTtcblx0XHRjb25zdCB0b29sUmVzdWx0RGV0YWlscyA9IHRvb2xSZXN1bHREZXRhaWxzRnJvbVJlc3BvbnNlKHRlcm1pbmFsUmVzdWx0cyk7XG5cdFx0Y29uc3QgdG9vbFJlc3VsdE1lc3NhZ2UgPSB0b29sUmVzdWx0TWVzc2FnZUZyb21SZXNwb25zZShyZXN1bHQsIGFyZ3MudGFzay5sYWJlbCwgdG9vbFJlc3VsdERldGFpbHMsIHRlcm1pbmFsUmVzdWx0cywgdW5kZWZpbmVkLCB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlzQmFja2dyb3VuZCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IHVuaXF1ZURldGFpbHMgfV0sXG5cdFx0XHR0b29sUmVzdWx0TWVzc2FnZSxcblx0XHRcdHRvb2xSZXN1bHREZXRhaWxzXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2lzVGFza0FjdGl2ZSh0YXNrOiBUYXNrKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgYnVzeVRhc2tzID0gYXdhaXQgdGhpcy5fdGFza3NTZXJ2aWNlLmdldEJ1c3lUYXNrcygpO1xuXHRcdHJldHVybiBidXN5VGFza3M/LnNvbWUodCA9PiB0YXNrc01hdGNoKHQsIHRhc2spKSA/PyBmYWxzZTtcblx0fVxuXG5cdGFzeW5jIHByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhcmdzID0gY29udGV4dC5wYXJhbWV0ZXJzIGFzIElDcmVhdGVBbmRSdW5UYXNrVG9vbElucHV0O1xuXHRcdGNvbnN0IHRhc2sgPSBhcmdzLnRhc2s7XG5cblx0XHRjb25zdCBhbGxUYXNrcyA9IGF3YWl0IHRoaXMuX3Rhc2tzU2VydmljZS50YXNrcygpO1xuXHRcdGlmIChhbGxUYXNrcz8uZmluZCh0ID0+IHQuX2xhYmVsID09PSB0YXNrLmxhYmVsKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgndGFza0V4aXN0cycsICdUYXNrIFxcYHswfVxcYCBhbHJlYWR5IGV4aXN0cy4nLCB0YXNrLmxhYmVsKSksXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgndGFza0V4aXN0c1Bhc3QnLCAnVGFzayBcXGB7MH1cXGAgYWxyZWFkeSBleGlzdHMuJywgdGFzay5sYWJlbCkpLFxuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogdW5kZWZpbmVkXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZVRhc2tzID0gYXdhaXQgdGhpcy5fdGFza3NTZXJ2aWNlLmdldEFjdGl2ZVRhc2tzKCk7XG5cdFx0aWYgKGFjdGl2ZVRhc2tzLmZpbmQodCA9PiB0Ll9sYWJlbCA9PT0gdGFzay5sYWJlbCkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2FscmVhZHlSdW5uaW5nJywgJ1Rhc2sgXFxgezB9XFxgIGlzIGFscmVhZHkgcnVubmluZy4nLCB0YXNrLmxhYmVsKSksXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYWxyZWFkeVJ1bm5pbmcnLCAnVGFzayBcXGB7MH1cXGAgaXMgYWxyZWFkeSBydW5uaW5nLicsIHRhc2subGFiZWwpKSxcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHVuZGVmaW5lZFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnY3JlYXRlZFRhc2snLCAnQ3JlYXRlZCB0YXNrIFxcYHswfVxcYCcsIHRhc2subGFiZWwpKSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnY3JlYXRlZFRhc2tQYXN0JywgJ0NyZWF0ZWQgdGFzayBcXGB7MH1cXGAnLCB0YXNrLmxhYmVsKSksXG5cdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczoge1xuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FsbG93VGFza0NyZWF0aW9uRXhlY3V0aW9uJywgJ0FsbG93IHRhc2sgY3JlYXRpb24gYW5kIGV4ZWN1dGlvbj8nKSxcblx0XHRcdFx0bWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0XHRcdGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0J2NyZWF0ZVRhc2snLFxuXHRcdFx0XHRcdFx0J0EgdGFzayBcXGB7MH1cXGAgd2l0aCBjb21tYW5kIFxcYHsxfVxcYHsyfSB3aWxsIGJlIGNyZWF0ZWQuJyxcblx0XHRcdFx0XHRcdHRhc2subGFiZWwsXG5cdFx0XHRcdFx0XHR0YXNrLmNvbW1hbmQsXG5cdFx0XHRcdFx0XHR0YXNrLmFyZ3M/Lmxlbmd0aCA/IGAgYW5kIGFyZ3MgXFxgJHt0YXNrLmFyZ3Muam9pbignICcpfVxcYGAgOiAnJ1xuXHRcdFx0XHRcdClcblx0XHRcdFx0KVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IENyZWF0ZUFuZFJ1blRhc2tUb29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRpZDogVGVybWluYWxUb29sSWQuQ3JlYXRlQW5kUnVuVGFzayxcblx0dG9vbFJlZmVyZW5jZU5hbWU6ICdjcmVhdGVBbmRSdW5UYXNrJyxcblx0bGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lczogWydydW5UYXNrcy9jcmVhdGVBbmRSdW5UYXNrJ10sXG5cdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgnY3JlYXRlQW5kUnVuVGFzay5kaXNwbGF5TmFtZScsICdDcmVhdGUgYW5kIHJ1biBUYXNrJyksXG5cdG1vZGVsRGVzY3JpcHRpb246ICdDcmVhdGVzIGFuZCBydW5zIGEgYnVpbGQsIHJ1biwgb3IgY3VzdG9tIHRhc2sgZm9yIHRoZSB3b3Jrc3BhY2UgYnkgZ2VuZXJhdGluZyBvciBhZGRpbmcgdG8gYSB0YXNrcy5qc29uIGZpbGUgYmFzZWQgb24gdGhlIHByb2plY3Qgc3RydWN0dXJlIChzdWNoIGFzIHBhY2thZ2UuanNvbiBvciBSRUFETUUubWQpLiBJZiB0aGUgdXNlciBhc2tzIHRvIGJ1aWxkLCBydW4sIGxhdW5jaCBhbmQgdGhleSBoYXZlIG5vIHRhc2tzLmpzb24gZmlsZSwgdXNlIHRoaXMgdG9vbC4gSWYgdGhleSBhc2sgdG8gY3JlYXRlIG9yIGFkZCBhIHRhc2ssIHVzZSB0aGlzIHRvb2wuJyxcblx0dXNlckRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY3JlYXRlQW5kUnVuVGFzay51c2VyRGVzY3JpcHRpb24nLCBcIkNyZWF0ZSBhbmQgcnVuIGEgdGFzayBpbiB0aGUgd29ya3NwYWNlXCIpLFxuXHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRpbnB1dFNjaGVtYToge1xuXHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHQnd29ya3NwYWNlRm9sZGVyJzoge1xuXHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb24nOiAnVGhlIGFic29sdXRlIHBhdGggb2YgdGhlIHdvcmtzcGFjZSBmb2xkZXIgd2hlcmUgdGhlIHRhc2tzLmpzb24gZmlsZSB3aWxsIGJlIGNyZWF0ZWQuJ1xuXHRcdFx0fSxcblx0XHRcdCd0YXNrJzoge1xuXHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb24nOiAnVGhlIHRhc2sgdG8gYWRkIHRvIHRoZSBuZXcgdGFza3MuanNvbiBmaWxlLicsXG5cdFx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHRcdCdsYWJlbCc6IHtcblx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiAnVGhlIGxhYmVsIG9mIHRoZSB0YXNrLidcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCd0eXBlJzoge1xuXHRcdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGBUaGUgdHlwZSBvZiB0aGUgdGFzay4gVGhlIG9ubHkgc3VwcG9ydGVkIHZhbHVlIGlzICdzaGVsbCcuYCxcblx0XHRcdFx0XHRcdCdlbnVtJzogW1xuXHRcdFx0XHRcdFx0XHQnc2hlbGwnXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQnY29tbWFuZCc6IHtcblx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiAnVGhlIHNoZWxsIGNvbW1hbmQgdG8gcnVuIGZvciB0aGUgdGFzay4gVXNlIHRoaXMgdG8gc3BlY2lmeSBjb21tYW5kcyBmb3IgYnVpbGRpbmcgb3IgcnVubmluZyB0aGUgYXBwbGljYXRpb24uJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J2FyZ3MnOiB7XG5cdFx0XHRcdFx0XHQndHlwZSc6ICdhcnJheScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiAnVGhlIGFyZ3VtZW50cyB0byBwYXNzIHRvIHRoZSBjb21tYW5kLicsXG5cdFx0XHRcdFx0XHQnaXRlbXMnOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCdpc0JhY2tncm91bmQnOiB7XG5cdFx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6ICdXaGV0aGVyIHRoZSB0YXNrIHJ1bnMgaW4gdGhlIGJhY2tncm91bmQgd2l0aG91dCBibG9ja2luZyB0aGUgVUkgb3Igb3RoZXIgdGFza3MuIFNldCB0byB0cnVlIGZvciBsb25nLXJ1bm5pbmcgcHJvY2Vzc2VzIGxpa2Ugd2F0Y2ggdGFza3Mgb3Igc2VydmVycyB0aGF0IHNob3VsZCBjb250aW51ZSBleGVjdXRpbmcgd2l0aG91dCByZXF1aXJpbmcgdXNlciBhdHRlbnRpb24uIFdoZW4gZmFsc2UsIHRoZSB0YXNrIHdpbGwgYmxvY2sgdGhlIHRlcm1pbmFsIHVudGlsIGNvbXBsZXRpb24uJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J3Byb2JsZW1NYXRjaGVyJzoge1xuXHRcdFx0XHRcdFx0J3R5cGUnOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogYFRoZSBwcm9ibGVtIG1hdGNoZXIgdG8gdXNlIHRvIHBhcnNlIHRhc2sgb3V0cHV0IGZvciBlcnJvcnMgYW5kIHdhcm5pbmdzLiBDYW4gYmUgYSBwcmVkZWZpbmVkIG1hdGNoZXIgbGlrZSAnJHRzYycgKFR5cGVTY3JpcHQpLCAnJGVzbGludCAtIHN0eWxpc2gnLCAnJGdjYycsIGV0Yy4sIG9yIGEgY3VzdG9tIHBhdHRlcm4gZGVmaW5lZCBpbiB0YXNrcy5qc29uLiBUaGlzIGhlbHBzIFZTIENvZGUgZGlzcGxheSBlcnJvcnMgaW4gdGhlIFByb2JsZW1zIHBhbmVsIGFuZCBlbmFibGVzIHF1aWNrIG5hdmlnYXRpb24gdG8gZXJyb3IgbG9jYXRpb25zLmAsXG5cdFx0XHRcdFx0XHQnaXRlbXMnOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCdncm91cCc6IHtcblx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiAnVGhlIGdyb3VwIHRvIHdoaWNoIHRoZSB0YXNrIGJlbG9uZ3MuJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0J3JlcXVpcmVkJzogW1xuXHRcdFx0XHRcdCdsYWJlbCcsXG5cdFx0XHRcdFx0J3R5cGUnLFxuXHRcdFx0XHRcdCdjb21tYW5kJ1xuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQncmVxdWlyZWQnOiBbXG5cdFx0XHQndGFzaycsXG5cdFx0XHQnd29ya3NwYWNlRm9sZGVyJ1xuXHRcdF1cblx0fSxcbn07XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUV4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUE4SSxzQkFBb0M7QUFDbEwsU0FBUyxvQkFBd0M7QUFDakQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBNEIsd0JBQXdCO0FBQ3BELFNBQVMsd0JBQXlDLHdCQUF3QixrQkFBa0I7QUFDNUYsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FB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
