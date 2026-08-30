import { localize } from "../../../../nls.js";
import { appendEscapedMarkdownInlineCode, escapeMarkdownLinkLabel } from "../../../../base/common/htmlContent.js";
import { basename } from "../../../../base/common/resources.js";
import { truncate } from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { getStreamingCreateMessage, getStreamingEditMessage, getStreamingReplaceMessage, streamingToolTextLineCount } from "../../common/streamingToolCallDisplay.js";
import { toToolCallMeta } from "../../common/meta/agentToolCallMeta.js";
import { getServerToolDisplay } from "../shared/serverToolGroups.js";
const TOOL_ROWS = {
  // shell tools — no `language` is carried: the workbench picks
  // `'shellscript'` from the tool name (it only special-cases
  // `'powershell'`), and the SDK's `Bash` tool is the generic shell
  // entry point (bash on POSIX, Git Bash on Windows), so claiming a
  // specific dialect here would be misleading and unused.
  Bash: { permissionKind: "shell", toolKind: "terminal" },
  BashOutput: { permissionKind: "shell", toolKind: "terminal" },
  KillBash: { permissionKind: "shell", toolKind: "terminal" },
  // read tools
  Read: { permissionKind: "read", pathField: "file_path", toolKind: "read" },
  Glob: { permissionKind: "read", pathField: "path", toolKind: "search" },
  Grep: { permissionKind: "read", pathField: "path", toolKind: "search" },
  LS: { permissionKind: "read", pathField: "path" },
  NotebookRead: { permissionKind: "read", pathField: "notebook_path", toolKind: "read" },
  // write tools
  Write: { permissionKind: "write", pathField: "file_path", isFileEdit: true },
  Edit: { permissionKind: "write", pathField: "file_path", isFileEdit: true },
  MultiEdit: { permissionKind: "write", pathField: "file_path", isFileEdit: true },
  NotebookEdit: { permissionKind: "write", pathField: "notebook_path", isFileEdit: true },
  TodoWrite: { permissionKind: "write" },
  // network tools
  WebFetch: { permissionKind: "url", pathField: "url" },
  // host-routed / custom
  Task: { permissionKind: "custom-tool", toolKind: "subagent" },
  Agent: { permissionKind: "custom-tool", toolKind: "subagent" },
  ExitPlanMode: { permissionKind: "custom-tool", interactive: true },
  AskUserQuestion: { permissionKind: "custom-tool", interactive: true },
  // skill + task-list family — host-routed custom tools that render in the
  // generic tool renderer (no `toolKind`) but carry rich invocation /
  // past-tense messages so their collapsed row is self-explanatory.
  Skill: { permissionKind: "skill" },
  TaskCreate: { permissionKind: "custom-tool" },
  TaskUpdate: { permissionKind: "custom-tool" },
  TaskList: { permissionKind: "custom-tool" },
  TaskGet: { permissionKind: "custom-tool" }
};
const MCP_TOOL_PREFIX = "mcp__";
function getClaudePermissionKind(toolName) {
  const row = TOOL_ROWS[toolName];
  if (row) {
    return row.permissionKind;
  }
  if (toolName.startsWith(MCP_TOOL_PREFIX)) {
    return "mcp";
  }
  return "custom-tool";
}
function getClaudeToolDisplayName(toolName) {
  const serverDisplay = getServerToolDisplay(toolName, void 0)?.displayName;
  if (serverDisplay !== void 0) {
    return serverDisplay;
  }
  switch (toolName) {
    case "Bash":
      return localize("claude.tool.bash", "Run shell command");
    case "BashOutput":
      return localize("claude.tool.bashOutput", "Read shell output");
    case "KillBash":
      return localize("claude.tool.killBash", "Kill shell command");
    case "Read":
      return localize("claude.tool.read", "Read file");
    case "Glob":
      return localize("claude.tool.glob", "Find files");
    case "Grep":
      return localize("claude.tool.grep", "Search files");
    case "LS":
      return localize("claude.tool.ls", "List directory");
    case "NotebookRead":
      return localize("claude.tool.notebookRead", "Read notebook");
    case "Write":
      return localize("claude.tool.write", "Write file");
    case "Edit":
      return localize("claude.tool.edit", "Edit file");
    case "MultiEdit":
      return localize("claude.tool.multiEdit", "Edit file");
    case "NotebookEdit":
      return localize("claude.tool.notebookEdit", "Edit notebook");
    case "TodoWrite":
      return localize("claude.tool.todoWrite", "Update todo list");
    case "WebFetch":
      return localize("claude.tool.webFetch", "Fetch URL");
    case "Task":
    case "Agent":
      return localize("claude.tool.task", "Run subagent task");
    case "ExitPlanMode":
      return localize("claude.tool.exitPlanMode", "Ready to code?");
    case "AskUserQuestion":
      return localize("claude.tool.askUserQuestion", "Ask user a question");
    case "Skill":
      return localize("claude.tool.skill", "Run skill");
    case "TaskCreate":
      return localize("claude.tool.taskCreate", "Create task");
    case "TaskUpdate":
      return localize("claude.tool.taskUpdate", "Update task");
    case "TaskList":
      return localize("claude.tool.taskList", "List tasks");
    case "TaskGet":
      return localize("claude.tool.taskGet", "Read task");
  }
  if (toolName.startsWith(MCP_TOOL_PREFIX)) {
    return localize("claude.tool.mcp", "Run MCP tool {0}", toolName.slice(MCP_TOOL_PREFIX.length));
  }
  return toolName;
}
function getClaudeToolPath(toolName, input) {
  const row = TOOL_ROWS[toolName];
  if (!row?.pathField || typeof input !== "object" || input === null) {
    return void 0;
  }
  const value = input[row.pathField];
  return typeof value === "string" ? value : void 0;
}
function isClaudeFileEditTool(toolName) {
  return TOOL_ROWS[toolName]?.isFileEdit === true;
}
const INTERACTIVE_CLAUDE_TOOLS = new Set(
  Object.entries(TOOL_ROWS).filter(([, row]) => row.interactive).map(([name]) => name)
);
function getClaudeConfirmationTitle(toolName) {
  switch (getClaudePermissionKind(toolName)) {
    case "shell":
      return localize("claude.permission.shell.title", "Run in terminal?");
    case "write":
      return localize("claude.permission.write.title", "Edit file?");
    case "read":
      return localize("claude.permission.read.title", "Read file?");
    case "url":
      return localize("claude.permission.url.title", "Fetch URL?");
    case "skill":
      return localize("claude.permission.skill.title", "Run skill?");
    case "mcp": {
      const serverName = toolName.startsWith(MCP_TOOL_PREFIX) ? toolName.slice(MCP_TOOL_PREFIX.length).split("__")[0] : void 0;
      return serverName ? localize("claude.permission.mcp.title", "Allow tool from {0}?", serverName) : localize("claude.permission.default.title", "Allow tool call?");
    }
    case "custom-tool":
    default:
      return localize("claude.permission.default.title", "Allow tool call?");
  }
}
function getClaudeToolKind(toolName) {
  return TOOL_ROWS[toolName]?.toolKind;
}
function buildClaudeToolMeta(toolName) {
  const meta = buildClaudeToolCallMeta(toolName);
  return meta ? toToolCallMeta(meta) : void 0;
}
function buildClaudeToolCallMeta(toolName) {
  const row = TOOL_ROWS[toolName];
  if (!row?.toolKind) {
    return void 0;
  }
  return { toolKind: row.toolKind };
}
function md(value) {
  return { markdown: value };
}
function formatPathAsMarkdownLink(path) {
  const uri = URI.file(path);
  return `[${escapeMarkdownLinkLabel(basename(uri))}](${uri})`;
}
function readStringField(input, field) {
  if (input === null || typeof input !== "object") {
    return void 0;
  }
  const value = input[field];
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function firstShellLine(input) {
  const command = readStringField(input, "command");
  return command ? command.split("\n")[0] : void 0;
}
function readTaskUpdateStatus(input) {
  const status = readStringField(input, "status");
  return status === "in_progress" || status === "completed" || status === "deleted" ? status : void 0;
}
function getClaudeInvocationMessage(toolName, displayName, input) {
  const serverDisplay = getServerToolDisplay(toolName, input)?.invocationMessage;
  if (serverDisplay !== void 0) {
    return serverDisplay;
  }
  switch (toolName) {
    case "Bash": {
      const firstLine = firstShellLine(input);
      if (firstLine) {
        return md(localize("claude.toolInvoke.bashCmd", "Running {0}", appendEscapedMarkdownInlineCode(truncate(firstLine, 80))));
      }
      return localize("claude.toolInvoke.bash", "Running shell command");
    }
    case "BashOutput":
      return localize("claude.toolInvoke.bashOutput", "Reading shell output");
    case "KillBash":
      return localize("claude.toolInvoke.killBash", "Kill shell command");
    case "Read":
    case "NotebookRead": {
      const path = getClaudeToolPath(toolName, input);
      if (path) {
        return md(localize("claude.toolInvoke.readFile", "Read {0}", formatPathAsMarkdownLink(path)));
      }
      return localize("claude.toolInvoke.read", "Read file");
    }
    case "LS": {
      const path = getClaudeToolPath(toolName, input);
      if (path) {
        return md(localize("claude.toolInvoke.lsPath", "List {0}", formatPathAsMarkdownLink(path)));
      }
      return localize("claude.toolInvoke.ls", "List directory");
    }
    case "Write":
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit": {
      const path = getClaudeToolPath(toolName, input);
      if (path) {
        return md(localize("claude.toolInvoke.editFile", "Edit {0}", formatPathAsMarkdownLink(path)));
      }
      return localize("claude.toolInvoke.edit", "Edit file");
    }
    case "TodoWrite":
      return localize("claude.toolInvoke.todoWrite", "Update todo list");
    case "Grep": {
      const pattern = readStringField(input, "pattern");
      if (pattern) {
        return md(localize("claude.toolInvoke.grepPattern", "Search for {0}", appendEscapedMarkdownInlineCode(truncate(pattern, 80))));
      }
      return localize("claude.toolInvoke.grep", "Search files");
    }
    case "Glob": {
      const pattern = readStringField(input, "pattern");
      if (pattern) {
        return md(localize("claude.toolInvoke.globPattern", "Find files matching {0}", appendEscapedMarkdownInlineCode(truncate(pattern, 80))));
      }
      return localize("claude.toolInvoke.glob", "Find files");
    }
    case "WebFetch": {
      const url = readStringField(input, "url");
      if (url) {
        return md(localize("claude.toolInvoke.webFetch", "Fetching {0}", `[${escapeMarkdownLinkLabel(truncate(url, 80))}](${url})`));
      }
      return localize("claude.toolInvoke.webFetchGeneric", "Fetching URL");
    }
    case "Task":
    case "Agent": {
      const description = readStringField(input, "description");
      if (description) {
        return description;
      }
      return displayName;
    }
    case "Skill": {
      const skill = readStringField(input, "skill");
      if (skill) {
        return md(localize("claude.toolInvoke.skillNamed", "Running skill {0}", appendEscapedMarkdownInlineCode(truncate(skill, 80))));
      }
      return localize("claude.toolInvoke.skill", "Running skill");
    }
    case "TaskCreate": {
      const subject = readStringField(input, "subject");
      if (subject) {
        return localize("claude.toolInvoke.taskCreateNamed", "Create task: {0}", truncate(subject, 80));
      }
      return localize("claude.toolInvoke.taskCreate", "Create task");
    }
    case "TaskUpdate":
      switch (readTaskUpdateStatus(input)) {
        case "in_progress":
          return localize("claude.toolInvoke.taskStart", "Start task");
        case "completed":
          return localize("claude.toolInvoke.taskComplete", "Complete task");
        case "deleted":
          return localize("claude.toolInvoke.taskDelete", "Delete task");
        default:
          return localize("claude.toolInvoke.taskUpdate", "Update task");
      }
    case "TaskList":
      return localize("claude.toolInvoke.taskList", "Read task list");
    case "TaskGet":
      return localize("claude.toolInvoke.taskGet", "Read task");
    default:
      return displayName;
  }
}
function getClaudeStreamingInvocationMessage(toolName, input) {
  switch (toolName) {
    case "Write":
      return getStreamingCreateMessage(input?.["file_path"], streamingToolTextLineCount(input?.["content"]));
    case "Edit":
      return getStreamingReplaceMessage(
        input?.["file_path"],
        streamingToolTextLineCount(input?.["old_string"]),
        streamingToolTextLineCount(input?.["new_string"])
      );
    case "MultiEdit": {
      const edits = Array.isArray(input?.["edits"]) ? input["edits"] : [];
      let oldLineCount;
      let newLineCount;
      for (const edit of edits) {
        if (!edit || typeof edit !== "object" || Array.isArray(edit)) {
          continue;
        }
        const oldLines = streamingToolTextLineCount(edit["old_string"]);
        const newLines = streamingToolTextLineCount(edit["new_string"]);
        if (oldLines !== void 0) {
          oldLineCount = (oldLineCount ?? 0) + oldLines;
        }
        if (newLines !== void 0) {
          newLineCount = (newLineCount ?? 0) + newLines;
        }
      }
      return getStreamingReplaceMessage(input?.["file_path"], oldLineCount, newLineCount);
    }
    case "NotebookEdit":
      return getStreamingEditMessage(input?.["notebook_path"], streamingToolTextLineCount(input?.["new_source"]));
    default:
      return void 0;
  }
}
function getClaudePastTenseMessage(toolName, displayName, input, success, resultText) {
  if (!success) {
    return localize("claude.toolComplete.failed", '"{0}" failed', displayName);
  }
  const serverDisplay = getServerToolDisplay(toolName, input, { text: resultText, success })?.pastTenseMessage;
  if (serverDisplay !== void 0) {
    return serverDisplay;
  }
  switch (toolName) {
    case "Bash": {
      const firstLine = firstShellLine(input);
      if (firstLine) {
        return md(localize("claude.toolComplete.bashCmd", "Ran {0}", appendEscapedMarkdownInlineCode(truncate(firstLine, 80))));
      }
      return localize("claude.toolComplete.bash", "Ran shell command");
    }
    case "BashOutput":
      return localize("claude.toolComplete.bashOutput", "Read shell output");
    case "WebFetch": {
      const url = readStringField(input, "url");
      if (url) {
        return md(localize("claude.toolComplete.webFetch", "Fetched {0}", `[${escapeMarkdownLinkLabel(truncate(url, 80))}](${url})`));
      }
      return localize("claude.toolComplete.webFetchGeneric", "Fetched URL");
    }
    case "Task":
    case "Agent":
      return localize("claude.toolComplete.task", "Ran subagent");
    case "Skill": {
      const skill = readStringField(input, "skill");
      if (skill) {
        return md(localize("claude.toolComplete.skillNamed", "Ran skill {0}", appendEscapedMarkdownInlineCode(truncate(skill, 80))));
      }
      return localize("claude.toolComplete.skill", "Ran skill");
    }
    default:
      return getClaudeInvocationMessage(toolName, displayName, input);
  }
}
function getClaudeToolInputString(toolName, input) {
  if (input === void 0) {
    return void 0;
  }
  if (toolName === "Bash" || toolName === "BashOutput" || toolName === "KillBash") {
    const command = readStringField(input, "command");
    if (command) {
      return command;
    }
  }
  if (toolName === "Grep" || toolName === "Glob") {
    const pattern = readStringField(input, "pattern");
    if (pattern) {
      return pattern;
    }
  }
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return void 0;
  }
}
export {
  INTERACTIVE_CLAUDE_TOOLS,
  buildClaudeToolCallMeta,
  buildClaudeToolMeta,
  getClaudeConfirmationTitle,
  getClaudeInvocationMessage,
  getClaudePastTenseMessage,
  getClaudePermissionKind,
  getClaudeStreamingInvocationMessage,
  getClaudeToolDisplayName,
  getClaudeToolInputString,
  getClaudeToolKind,
  getClaudeToolPath,
  isClaudeFileEditTool
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjbGF1ZGVcXGNsYXVkZVRvb2xEaXNwbGF5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSwgZXNjYXBlTWFya2Rvd25MaW5rTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyB0cnVuY2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdldFN0cmVhbWluZ0NyZWF0ZU1lc3NhZ2UsIGdldFN0cmVhbWluZ0VkaXRNZXNzYWdlLCBnZXRTdHJlYW1pbmdSZXBsYWNlTWVzc2FnZSwgc3RyZWFtaW5nVG9vbFRleHRMaW5lQ291bnQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RyZWFtaW5nVG9vbENhbGxEaXNwbGF5LmpzJztcbmltcG9ydCB7IHRvVG9vbENhbGxNZXRhLCB0eXBlIElUb29sQ2FsbE1ldGEsIHR5cGUgVG9vbEtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vbWV0YS9hZ2VudFRvb2xDYWxsTWV0YS5qcyc7XG5pbXBvcnQgdHlwZSB7IFN0cmluZ09yTWFya2Rvd24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgZ2V0U2VydmVyVG9vbERpc3BsYXkgfSBmcm9tICcuLi9zaGFyZWQvc2VydmVyVG9vbEdyb3Vwcy5qcyc7XG5cbi8qKlxuICogUGhhc2UgNyBTNCBcdTIwMTQgcHVyZSB0b29sLW5hbWUgXHUyMTkyIGRpc3BsYXkvcGVybWlzc2lvbiBoZWxwZXJzIGZvciBDbGF1ZGUuXG4gKlxuICogTWlycm9ycyB0aGUgc2hhcGUgb2YgW2NvcGlsb3RUb29sRGlzcGxheS50c10oLi4vY29waWxvdC9jb3BpbG90VG9vbERpc3BsYXkudHMpXG4gKiBidXQgaXMga2V5ZWQgb2ZmIHRoZSBTREsncyBidWlsdC1pbiB0b29sIGxpc3QuIFRoZSBtYXBwaW5nIHRhYmxlIGxpdmVzXG4gKiBoZXJlIChhbmQgaXMgc25hcHNob3QtdGVzdGVkIGluXG4gKiBbY2xhdWRlVG9vbERpc3BsYXkudGVzdC50c10oLi4vLi4vdGVzdC9ub2RlL2NsYXVkZVRvb2xEaXNwbGF5LnRlc3QudHMpKVxuICogc28gcmVuYW1lcyBvZiBlaXRoZXIgdGhlIFNESyB0b29sIG5hbWVzIG9yIHRoZSBob3N0J3MgYHBlcm1pc3Npb25LaW5kYFxuICogdW5pb24gZmxvdyB0aHJvdWdoIGNvbXBpbGUtY2hlY2tzIGFuZCB0aGUgc25hcHNob3QgZGlmZi5cbiAqXG4gKiBObyBJL08sIG5vIERJOyBzYWZlIHRvIGltcG9ydCBmcm9tIGFueSBsYXllciBvZiBgYWdlbnRIb3N0YC5cbiAqL1xuXG4vKipcbiAqIEF1dG8tYXBwcm92YWwga2luZCByZXBvcnRlZCBhbG9uZ3NpZGUgYHBlbmRpbmdfY29uZmlybWF0aW9uYCBzaWduYWxzXG4gKiAoc2VlIGBJQWdlbnRUb29sUGVuZGluZ0NvbmZpcm1hdGlvblNpZ25hbC5wZXJtaXNzaW9uS2luZGAgaW5cbiAqIFthZ2VudFNlcnZpY2UudHM6MzE3XSguLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLnRzI0wzMTcpKS5cbiAqXG4gKiBQaGFzZSA3IG9ubHkgZW1pdHMgdGhlIHN1YnNldCByZWxldmFudCB0byBDbGF1ZGUncyBidWlsdC1pbiB0b29scyBcdTIwMTRcbiAqIGBob29rYCBhbmQgYG1lbW9yeWAgYXJlIHJlc2VydmVkIGZvciBsYXRlciBwaGFzZXMuXG4gKi9cbmV4cG9ydCB0eXBlIENsYXVkZVBlcm1pc3Npb25LaW5kID1cblx0fCAnc2hlbGwnXG5cdHwgJ3dyaXRlJ1xuXHR8ICdtY3AnXG5cdHwgJ3JlYWQnXG5cdHwgJ3VybCdcblx0fCAnc2tpbGwnXG5cdHwgJ2N1c3RvbS10b29sJztcblxuLyoqXG4gKiBQaGFzZSA4LjUgXHUyMDE0IHJlbmRlcmluZyBoaW50IGZvciB0aGUgd29ya2JlbmNoLiBEcml2ZXMgdGVybWluYWwgL1xuICogc2VhcmNoIC8gc3ViYWdlbnQgcmVuZGVyZXJzICh0aGUgd29ya2JlbmNoIHBpY2tzIGEgcmVuZGVyZXIgb2ZmXG4gKiBgX21ldGEudG9vbEtpbmRgOyB1bmtub3duIHZhbHVlcyBmYWxsIHRocm91Z2ggdG8gdGhlIGdlbmVyaWMgdG9vbFxuICogcmVuZGVyZXIpLiBNaXJyb3Igb2ZcbiAqIFtgY29waWxvdFRvb2xEaXNwbGF5LmdldFRvb2xLaW5kYF0oLi4vY29waWxvdC9jb3BpbG90VG9vbERpc3BsYXkudHMpLlxuICovXG5leHBvcnQgdHlwZSBDbGF1ZGVUb29sS2luZCA9IFRvb2xLaW5kO1xuXG4vKipcbiAqIFdoaWNoIGZpZWxkIG9uIHRoZSBTREsncyBgdG9vbF9pbnB1dGAgY2FycmllcyB0aGUgcGF0aC91cmwgc3VyZmFjZWRcbiAqIHRvIHRoZSB1c2VyIChhbmQgdHJhY2tlZCBieSBQaGFzZSA4IGZvciBmaWxlLWVkaXQgdG9vbHMpLiBPbmUgZmllbGRcbiAqIHBlciB0b29sIFx1MjAxNCB0b29scyB3aXRob3V0IGEgcGF0aC1iZWFyaW5nIGZpZWxkIG9taXQgdGhpcy5cbiAqL1xudHlwZSBDbGF1ZGVUb29sUGF0aEZpZWxkID0gJ2ZpbGVfcGF0aCcgfCAnbm90ZWJvb2tfcGF0aCcgfCAncGF0aCcgfCAndXJsJztcblxuLyoqXG4gKiBTaW5nbGUgc291cmNlLW9mLXRydXRoIHJvdyBmb3Igb25lIG9mIENsYXVkZSdzIGJ1aWx0LWluIHRvb2xzLiBFdmVyeVxuICogc3RydWN0dXJhbCBmYWN0IHRoZSBob3N0IG5lZWRzIGFib3V0IHRoZSB0b29sIHNpdHMgaW4gdGhpcyByb3c7IHRoZVxuICogZXhwb3J0ZWQgaGVscGVycyBiZWxvdyBhcmUgb25lLWxpbmVycyBvdmVyIHRoZSB0YWJsZS4gQWRkaW5nIGEgbmV3XG4gKiBTREsgdG9vbCBtZWFucyBhZGRpbmcgb25lIHJvdyBhbmQgb25lIGBkaXNwbGF5TmFtZWAgYXJtLiBUaGVcbiAqIHNuYXBzaG90IHRlc3QgaW4gW2NsYXVkZVRvb2xEaXNwbGF5LnRlc3QudHNdKC4uLy4uL3Rlc3Qvbm9kZS9jbGF1ZGVUb29sRGlzcGxheS50ZXN0LnRzKVxuICogZmFpbHMgdW50aWwgYm90aCB0aGlzIG1hcCBhbmQgdGhlIHNuYXBzaG90IGFyZSB1cGRhdGVkIHRvZ2V0aGVyLlxuICpcbiAqIGBkaXNwbGF5TmFtZWAgaXMgaW50ZW50aW9uYWxseSBOT1Qgb24gdGhlIHJvdyBcdTIwMTQgaXQgaXMgdXNlci1mYWNpbmdcbiAqIGFuZCBtdXN0IGJlIGBsb2NhbGl6ZSgpYC1kLCB3aGljaCB3ZSBjYW5ub3QgZG8gYXQgbW9kdWxlLWluaXQgdGltZVxuICogd2l0aG91dCBmcmVlemluZyB0aGUgYnVuZGxlJ3MgbG9jYWxlLiBMb29rdXAgbGl2ZXMgaW5cbiAqIHtAbGluayBnZXRDbGF1ZGVUb29sRGlzcGxheU5hbWV9LlxuICovXG5pbnRlcmZhY2UgQ2xhdWRlVG9vbFJvdyB7XG5cdHJlYWRvbmx5IHBlcm1pc3Npb25LaW5kOiBDbGF1ZGVQZXJtaXNzaW9uS2luZDtcblx0LyoqIEZpZWxkIG9uIGB0b29sX2lucHV0YCBjYXJyeWluZyB0aGUgcGF0aC91cmwgZm9yIHRoaXMgdG9vbCwgaWYgYW55LiAqL1xuXHRyZWFkb25seSBwYXRoRmllbGQ/OiBDbGF1ZGVUb29sUGF0aEZpZWxkO1xuXHQvKiogVHJ1ZSBmb3IgdG9vbHMgd2hvc2UgZXhlY3V0aW9uIHdyaXRlcyB0byBkaXNrIGFuZCBpcyB0cmFja2VkIGJ5IGBGaWxlRWRpdFRyYWNrZXJgIChQaGFzZSA4KS4gKi9cblx0cmVhZG9ubHkgaXNGaWxlRWRpdD86IHRydWU7XG5cdC8qKlxuXHQgKiBUcnVlIGZvciB0b29scyB0aGUgU0RLIG5ldmVyIGF1dG8tYXBwcm92ZXMgdW5kZXIgYW55XG5cdCAqIGBwZXJtaXNzaW9uTW9kZWAgKHNvIHRoZXkgYWx3YXlzIHJlYWNoIGBjYW5Vc2VUb29sYCkuIERyaXZlc1xuXHQgKiB7QGxpbmsgSU5URVJBQ1RJVkVfQ0xBVURFX1RPT0xTfS5cblx0ICovXG5cdHJlYWRvbmx5IGludGVyYWN0aXZlPzogdHJ1ZTtcblx0LyoqXG5cdCAqIFBoYXNlIDguNSBcdTIwMTQgcmVuZGVyaW5nIGhpbnQgZm9yIHRoZSB3b3JrYmVuY2guIE9taXQgZm9yIHRvb2xzIHRoYXRcblx0ICogdXNlIHRoZSBnZW5lcmljIHJlbmRlcmVyIHdpdGhvdXQgc3BlY2lhbGl6ZWQgc3RyZWFtaW5nIGJlaGF2aW9yLlxuXHQgKi9cblx0cmVhZG9ubHkgdG9vbEtpbmQ/OiBDbGF1ZGVUb29sS2luZDtcbn1cblxuY29uc3QgVE9PTF9ST1dTOiB7IHJlYWRvbmx5IFt0b29sTmFtZTogc3RyaW5nXTogQ2xhdWRlVG9vbFJvdyB9ID0ge1xuXHQvLyBzaGVsbCB0b29scyBcdTIwMTQgbm8gYGxhbmd1YWdlYCBpcyBjYXJyaWVkOiB0aGUgd29ya2JlbmNoIHBpY2tzXG5cdC8vIGAnc2hlbGxzY3JpcHQnYCBmcm9tIHRoZSB0b29sIG5hbWUgKGl0IG9ubHkgc3BlY2lhbC1jYXNlc1xuXHQvLyBgJ3Bvd2Vyc2hlbGwnYCksIGFuZCB0aGUgU0RLJ3MgYEJhc2hgIHRvb2wgaXMgdGhlIGdlbmVyaWMgc2hlbGxcblx0Ly8gZW50cnkgcG9pbnQgKGJhc2ggb24gUE9TSVgsIEdpdCBCYXNoIG9uIFdpbmRvd3MpLCBzbyBjbGFpbWluZyBhXG5cdC8vIHNwZWNpZmljIGRpYWxlY3QgaGVyZSB3b3VsZCBiZSBtaXNsZWFkaW5nIGFuZCB1bnVzZWQuXG5cdEJhc2g6IHsgcGVybWlzc2lvbktpbmQ6ICdzaGVsbCcsIHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdEJhc2hPdXRwdXQ6IHsgcGVybWlzc2lvbktpbmQ6ICdzaGVsbCcsIHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdEtpbGxCYXNoOiB7IHBlcm1pc3Npb25LaW5kOiAnc2hlbGwnLCB0b29sS2luZDogJ3Rlcm1pbmFsJyB9LFxuXG5cdC8vIHJlYWQgdG9vbHNcblx0UmVhZDogeyBwZXJtaXNzaW9uS2luZDogJ3JlYWQnLCBwYXRoRmllbGQ6ICdmaWxlX3BhdGgnLCB0b29sS2luZDogJ3JlYWQnIH0sXG5cdEdsb2I6IHsgcGVybWlzc2lvbktpbmQ6ICdyZWFkJywgcGF0aEZpZWxkOiAncGF0aCcsIHRvb2xLaW5kOiAnc2VhcmNoJyB9LFxuXHRHcmVwOiB7IHBlcm1pc3Npb25LaW5kOiAncmVhZCcsIHBhdGhGaWVsZDogJ3BhdGgnLCB0b29sS2luZDogJ3NlYXJjaCcgfSxcblx0TFM6IHsgcGVybWlzc2lvbktpbmQ6ICdyZWFkJywgcGF0aEZpZWxkOiAncGF0aCcgfSxcblx0Tm90ZWJvb2tSZWFkOiB7IHBlcm1pc3Npb25LaW5kOiAncmVhZCcsIHBhdGhGaWVsZDogJ25vdGVib29rX3BhdGgnLCB0b29sS2luZDogJ3JlYWQnIH0sXG5cblx0Ly8gd3JpdGUgdG9vbHNcblx0V3JpdGU6IHsgcGVybWlzc2lvbktpbmQ6ICd3cml0ZScsIHBhdGhGaWVsZDogJ2ZpbGVfcGF0aCcsIGlzRmlsZUVkaXQ6IHRydWUgfSxcblx0RWRpdDogeyBwZXJtaXNzaW9uS2luZDogJ3dyaXRlJywgcGF0aEZpZWxkOiAnZmlsZV9wYXRoJywgaXNGaWxlRWRpdDogdHJ1ZSB9LFxuXHRNdWx0aUVkaXQ6IHsgcGVybWlzc2lvbktpbmQ6ICd3cml0ZScsIHBhdGhGaWVsZDogJ2ZpbGVfcGF0aCcsIGlzRmlsZUVkaXQ6IHRydWUgfSxcblx0Tm90ZWJvb2tFZGl0OiB7IHBlcm1pc3Npb25LaW5kOiAnd3JpdGUnLCBwYXRoRmllbGQ6ICdub3RlYm9va19wYXRoJywgaXNGaWxlRWRpdDogdHJ1ZSB9LFxuXHRUb2RvV3JpdGU6IHsgcGVybWlzc2lvbktpbmQ6ICd3cml0ZScgfSxcblxuXHQvLyBuZXR3b3JrIHRvb2xzXG5cdFdlYkZldGNoOiB7IHBlcm1pc3Npb25LaW5kOiAndXJsJywgcGF0aEZpZWxkOiAndXJsJyB9LFxuXG5cdC8vIGhvc3Qtcm91dGVkIC8gY3VzdG9tXG5cdFRhc2s6IHsgcGVybWlzc2lvbktpbmQ6ICdjdXN0b20tdG9vbCcsIHRvb2xLaW5kOiAnc3ViYWdlbnQnIH0sXG5cdEFnZW50OiB7IHBlcm1pc3Npb25LaW5kOiAnY3VzdG9tLXRvb2wnLCB0b29sS2luZDogJ3N1YmFnZW50JyB9LFxuXHRFeGl0UGxhbk1vZGU6IHsgcGVybWlzc2lvbktpbmQ6ICdjdXN0b20tdG9vbCcsIGludGVyYWN0aXZlOiB0cnVlIH0sXG5cdEFza1VzZXJRdWVzdGlvbjogeyBwZXJtaXNzaW9uS2luZDogJ2N1c3RvbS10b29sJywgaW50ZXJhY3RpdmU6IHRydWUgfSxcblxuXHQvLyBza2lsbCArIHRhc2stbGlzdCBmYW1pbHkgXHUyMDE0IGhvc3Qtcm91dGVkIGN1c3RvbSB0b29scyB0aGF0IHJlbmRlciBpbiB0aGVcblx0Ly8gZ2VuZXJpYyB0b29sIHJlbmRlcmVyIChubyBgdG9vbEtpbmRgKSBidXQgY2FycnkgcmljaCBpbnZvY2F0aW9uIC9cblx0Ly8gcGFzdC10ZW5zZSBtZXNzYWdlcyBzbyB0aGVpciBjb2xsYXBzZWQgcm93IGlzIHNlbGYtZXhwbGFuYXRvcnkuXG5cdFNraWxsOiB7IHBlcm1pc3Npb25LaW5kOiAnc2tpbGwnIH0sXG5cdFRhc2tDcmVhdGU6IHsgcGVybWlzc2lvbktpbmQ6ICdjdXN0b20tdG9vbCcgfSxcblx0VGFza1VwZGF0ZTogeyBwZXJtaXNzaW9uS2luZDogJ2N1c3RvbS10b29sJyB9LFxuXHRUYXNrTGlzdDogeyBwZXJtaXNzaW9uS2luZDogJ2N1c3RvbS10b29sJyB9LFxuXHRUYXNrR2V0OiB7IHBlcm1pc3Npb25LaW5kOiAnY3VzdG9tLXRvb2wnIH0sXG59O1xuXG5jb25zdCBNQ1BfVE9PTF9QUkVGSVggPSAnbWNwX18nO1xuXG4vKipcbiAqIFM0IHJvdyBsb29rdXAuIEZhbGxzIGJhY2sgdG8gYCdjdXN0b20tdG9vbCdgIGZvciB1bmtub3duIHRvb2xzIHNvXG4gKiBDbGF1ZGUncyBncm93aW5nIGJ1aWx0LWluIGxpc3QgbmV2ZXIgYnJlYWtzIHRoZSBob3N0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2xhdWRlUGVybWlzc2lvbktpbmQodG9vbE5hbWU6IHN0cmluZyk6IENsYXVkZVBlcm1pc3Npb25LaW5kIHtcblx0Y29uc3Qgcm93ID0gVE9PTF9ST1dTW3Rvb2xOYW1lXTtcblx0aWYgKHJvdykge1xuXHRcdHJldHVybiByb3cucGVybWlzc2lvbktpbmQ7XG5cdH1cblx0aWYgKHRvb2xOYW1lLnN0YXJ0c1dpdGgoTUNQX1RPT0xfUFJFRklYKSkge1xuXHRcdHJldHVybiAnbWNwJztcblx0fVxuXHRyZXR1cm4gJ2N1c3RvbS10b29sJztcbn1cblxuLyoqXG4gKiBMb2NhbGl6ZWQgZGlzcGxheSBuYW1lIGZvciB0aGUgU0RLJ3MgYnVpbHQtaW4gdG9vbHMgKFM0KS4gRmFsbHMgYmFja1xuICogdG8gdGhlIHJhdyB0b29sIG5hbWUgc28gdW5rbm93biB0b29scyBzdGlsbCByZW5kZXIgc29tZXRoaW5nXG4gKiBzZW5zaWJsZS4gRm9yIGBtY3BfX3NlcnZlcl9fdG9vbGAgdGhlIHByZWZpeCBpcyBzdHJpcHBlZCB0byBzdXJmYWNlXG4gKiB0aGUgc2VydmVyL3Rvb2wgcGFpci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldENsYXVkZVRvb2xEaXNwbGF5TmFtZSh0b29sTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3Qgc2VydmVyRGlzcGxheSA9IGdldFNlcnZlclRvb2xEaXNwbGF5KHRvb2xOYW1lLCB1bmRlZmluZWQpPy5kaXNwbGF5TmFtZTtcblx0aWYgKHNlcnZlckRpc3BsYXkgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBzZXJ2ZXJEaXNwbGF5O1xuXHR9XG5cdHN3aXRjaCAodG9vbE5hbWUpIHtcblx0XHRjYXNlICdCYXNoJzogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbC5iYXNoJywgXCJSdW4gc2hlbGwgY29tbWFuZFwiKTtcblx0XHRjYXNlICdCYXNoT3V0cHV0JzogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbC5iYXNoT3V0cHV0JywgXCJSZWFkIHNoZWxsIG91dHB1dFwiKTtcblx0XHRjYXNlICdLaWxsQmFzaCc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2wua2lsbEJhc2gnLCBcIktpbGwgc2hlbGwgY29tbWFuZFwiKTtcblx0XHRjYXNlICdSZWFkJzogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbC5yZWFkJywgXCJSZWFkIGZpbGVcIik7XG5cdFx0Y2FzZSAnR2xvYic6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2wuZ2xvYicsIFwiRmluZCBmaWxlc1wiKTtcblx0XHRjYXNlICdHcmVwJzogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbC5ncmVwJywgXCJTZWFyY2ggZmlsZXNcIik7XG5cdFx0Y2FzZSAnTFMnOiByZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sLmxzJywgXCJMaXN0IGRpcmVjdG9yeVwiKTtcblx0XHRjYXNlICdOb3RlYm9va1JlYWQnOiByZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sLm5vdGVib29rUmVhZCcsIFwiUmVhZCBub3RlYm9va1wiKTtcblx0XHRjYXNlICdXcml0ZSc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2wud3JpdGUnLCBcIldyaXRlIGZpbGVcIik7XG5cdFx0Y2FzZSAnRWRpdCc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2wuZWRpdCcsIFwiRWRpdCBmaWxlXCIpO1xuXHRcdGNhc2UgJ011bHRpRWRpdCc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2wubXVsdGlFZGl0JywgXCJFZGl0IGZpbGVcIik7XG5cdFx0Y2FzZSAnTm90ZWJvb2tFZGl0JzogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbC5ub3RlYm9va0VkaXQnLCBcIkVkaXQgbm90ZWJvb2tcIik7XG5cdFx0Y2FzZSAnVG9kb1dyaXRlJzogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbC50b2RvV3JpdGUnLCBcIlVwZGF0ZSB0b2RvIGxpc3RcIik7XG5cdFx0Y2FzZSAnV2ViRmV0Y2gnOiByZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sLndlYkZldGNoJywgXCJGZXRjaCBVUkxcIik7XG5cdFx0Y2FzZSAnVGFzayc6XG5cdFx0Y2FzZSAnQWdlbnQnOiByZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sLnRhc2snLCBcIlJ1biBzdWJhZ2VudCB0YXNrXCIpO1xuXHRcdGNhc2UgJ0V4aXRQbGFuTW9kZSc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2wuZXhpdFBsYW5Nb2RlJywgXCJSZWFkeSB0byBjb2RlP1wiKTtcblx0XHRjYXNlICdBc2tVc2VyUXVlc3Rpb24nOiByZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sLmFza1VzZXJRdWVzdGlvbicsIFwiQXNrIHVzZXIgYSBxdWVzdGlvblwiKTtcblx0XHRjYXNlICdTa2lsbCc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2wuc2tpbGwnLCBcIlJ1biBza2lsbFwiKTtcblx0XHRjYXNlICdUYXNrQ3JlYXRlJzogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbC50YXNrQ3JlYXRlJywgXCJDcmVhdGUgdGFza1wiKTtcblx0XHRjYXNlICdUYXNrVXBkYXRlJzogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbC50YXNrVXBkYXRlJywgXCJVcGRhdGUgdGFza1wiKTtcblx0XHRjYXNlICdUYXNrTGlzdCc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2wudGFza0xpc3QnLCBcIkxpc3QgdGFza3NcIik7XG5cdFx0Y2FzZSAnVGFza0dldCc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2wudGFza0dldCcsIFwiUmVhZCB0YXNrXCIpO1xuXHR9XG5cdGlmICh0b29sTmFtZS5zdGFydHNXaXRoKE1DUF9UT09MX1BSRUZJWCkpIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sLm1jcCcsIFwiUnVuIE1DUCB0b29sIHswfVwiLCB0b29sTmFtZS5zbGljZShNQ1BfVE9PTF9QUkVGSVgubGVuZ3RoKSk7XG5cdH1cblx0cmV0dXJuIHRvb2xOYW1lO1xufVxuXG4vKipcbiAqIFJlYWQgdGhlIGBwYXRoRmllbGRgIG5hbWVkIG9uIHRoZSB0b29sJ3Mgcm93IGZyb20gYGlucHV0YC4gUmV0dXJuc1xuICogYHVuZGVmaW5lZGAgZm9yIHRvb2xzIHdpdGhvdXQgYSBwYXRoIGZpZWxkLCBmb3IgbWlzc2luZyBmaWVsZHMsIG9yXG4gKiBmb3Igd3JvbmctdHlwZWQgZmllbGRzIChkZWZlbnNpdmUgYWdhaW5zdCBtYWxmb3JtZWQgU0RLIGlucHV0KS5cbiAqXG4gKiBVc2VkIGJvdGggZm9yIGBwZW5kaW5nX2NvbmZpcm1hdGlvbi5wZXJtaXNzaW9uUGF0aGAgKFM0KSBhbmQgUGhhc2UgOFxuICogZmlsZS1lZGl0IHRyYWNraW5nIFx1MjAxNCBjYWxsZXJzIHRoYXQgb25seSBjYXJlIGFib3V0IGVkaXRzIGdhdGUgd2l0aFxuICoge0BsaW5rIGlzQ2xhdWRlRmlsZUVkaXRUb29sfSBmaXJzdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldENsYXVkZVRvb2xQYXRoKHRvb2xOYW1lOiBzdHJpbmcsIGlucHV0OiB1bmtub3duKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgcm93ID0gVE9PTF9ST1dTW3Rvb2xOYW1lXTtcblx0aWYgKCFyb3c/LnBhdGhGaWVsZCB8fCB0eXBlb2YgaW5wdXQgIT09ICdvYmplY3QnIHx8IGlucHV0ID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB2YWx1ZSA9IChpbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbcm93LnBhdGhGaWVsZF07XG5cdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUgOiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogUGhhc2UgOCBcdTIwMTQgdHJ1ZSBmb3IgdG9vbHMgdGhhdCBwcm9kdWNlIG9uLWRpc2sgZmlsZSBlZGl0cyB0cmFja2VkIGJ5XG4gKiBgRmlsZUVkaXRUcmFja2VyYC4gRXhjbHVkZXMgYFRvZG9Xcml0ZWAgKGluLW1lbW9yeSkgYW5kIGBCYXNoYCAoZWRpdHNcbiAqIG5vdCBzdXJmYWNlZCBhcyBjYW5vbmljYWwgU0RLIGB0b29sX3VzZWAgYmxvY2tzIHRoZSBob3N0IGNhbiBwYWlyXG4gKiB3aXRoIGB0b29sX3Jlc3VsdGApLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNDbGF1ZGVGaWxlRWRpdFRvb2wodG9vbE5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gVE9PTF9ST1dTW3Rvb2xOYW1lXT8uaXNGaWxlRWRpdCA9PT0gdHJ1ZTtcbn1cblxuLyoqXG4gKiBQaGFzZSA3IFMzLjUuIFRvb2xzIHdob3NlIGBjYW5Vc2VUb29sYCBpbnZvY2F0aW9uIGlzIHNhdGlzZmllZCBieSBhXG4gKiBob3N0LWRyaXZlbiByb3VuZC10cmlwIHJhdGhlciB0aGFuIHRoZSBTREsncyBhdXRvLWFwcHJvdmFsOlxuICogLSBgQXNrVXNlclF1ZXN0aW9uYCBcdTIwMTQgY2Fyb3VzZWwgKFMzLjVhKS5cbiAqIC0gYEV4aXRQbGFuTW9kZWAgXHUyMDE0IGBwZW5kaW5nX2NvbmZpcm1hdGlvbmAgd2l0aCBjdXN0b20gQXBwcm92ZS9EZW55XG4gKiAgIGxhYmVscyBhbmQgdGhlIHBsYW4gYm9keSBhcyBgaW52b2NhdGlvbk1lc3NhZ2VgIChTMy41YikuXG4gKlxuICogTWVtYmVyc2hpcCBvbmx5IHNpZ25hbHMgdGhhdCB0aGUgU0RLIGRvZXMgbm90IGF1dG8tYXBwcm92ZSB1bmRlciBhbnlcbiAqIGBwZXJtaXNzaW9uTW9kZWAsIGVuc3VyaW5nIHRoZSBjYWxsIGFsd2F5cyByZWFjaGVzIHRoZSBob3N0LlxuICogYF9oYW5kbGVDYW5Vc2VUb29sYCBkaXNwYXRjaGVzIHZpYSBgSU5URVJBQ1RJVkVfQ0xBVURFX1RPT0xTLmhhcyh0b29sTmFtZSlgLlxuICpcbiAqIERlcml2ZWQgZnJvbSB0aGUgYGludGVyYWN0aXZlOiB0cnVlYCByb3dzIGFib3ZlIHNvIHRoZSB0YWJsZSBzdGF5c1xuICogdGhlIHNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGguXG4gKi9cbmV4cG9ydCBjb25zdCBJTlRFUkFDVElWRV9DTEFVREVfVE9PTFM6IFJlYWRvbmx5U2V0PHN0cmluZz4gPSBuZXcgU2V0KFxuXHRPYmplY3QuZW50cmllcyhUT09MX1JPV1MpXG5cdFx0LmZpbHRlcigoWywgcm93XSkgPT4gcm93LmludGVyYWN0aXZlKVxuXHRcdC5tYXAoKFtuYW1lXSkgPT4gbmFtZSksXG4pO1xuXG4vKipcbiAqIENvbmZpcm1hdGlvbi1jYXJkIHRpdGxlIHNob3duIHdoZW4gYSB0b29sIG5lZWRzIGV4cGxpY2l0IHVzZXJcbiAqIGFwcHJvdmFsIChTMy40IGBwZW5kaW5nX2NvbmZpcm1hdGlvbmAgZmxvdykuIE1pcnJvcnMgdGhlIHBlci1raW5kXG4gKiB0aXRsZXMgaW4ge0BsaW5rIGdldFBlcm1pc3Npb25EaXNwbGF5fSBmb3IgQ29waWxvdEFnZW50IHNvIGJvdGhcbiAqIGFnZW50cyByZW5kZXIgaWRlbnRpY2FsIHdvcmRpbmcuIFRoZSB3b3JrYmVuY2gga2V5cyBvZmZcbiAqIGBjb25maXJtYXRpb25UaXRsZWAgdG8gcmVuZGVyIHRoZSBBcHByb3ZlL0RlbnkgYnV0dG9ucyBcdTIwMTQgd2hlbiBpdFxuICogaXMgYWJzZW50LCB0aGUgdG9vbCBjYXJkIHNpbGVudGx5IGZsaXBzIHRvIFwiYXV0by1hcHByb3ZlZFwiIHN0YXRlXG4gKiBldmVuIHRob3VnaCB0aGUgYWdlbnQgaXMgcGFya2VkLiBTZWUgYHNlc3Npb25QZXJtaXNzaW9ucy50c2Anc1xuICogYGNyZWF0ZVRvb2xSZWFkeUFjdGlvbmAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbGF1ZGVDb25maXJtYXRpb25UaXRsZSh0b29sTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0c3dpdGNoIChnZXRDbGF1ZGVQZXJtaXNzaW9uS2luZCh0b29sTmFtZSkpIHtcblx0XHRjYXNlICdzaGVsbCc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS5wZXJtaXNzaW9uLnNoZWxsLnRpdGxlJywgXCJSdW4gaW4gdGVybWluYWw/XCIpO1xuXHRcdGNhc2UgJ3dyaXRlJzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnBlcm1pc3Npb24ud3JpdGUudGl0bGUnLCBcIkVkaXQgZmlsZT9cIik7XG5cdFx0Y2FzZSAncmVhZCc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS5wZXJtaXNzaW9uLnJlYWQudGl0bGUnLCBcIlJlYWQgZmlsZT9cIik7XG5cdFx0Y2FzZSAndXJsJzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnBlcm1pc3Npb24udXJsLnRpdGxlJywgXCJGZXRjaCBVUkw/XCIpO1xuXHRcdGNhc2UgJ3NraWxsJzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnBlcm1pc3Npb24uc2tpbGwudGl0bGUnLCBcIlJ1biBza2lsbD9cIik7XG5cdFx0Y2FzZSAnbWNwJzoge1xuXHRcdFx0Y29uc3Qgc2VydmVyTmFtZSA9IHRvb2xOYW1lLnN0YXJ0c1dpdGgoTUNQX1RPT0xfUFJFRklYKVxuXHRcdFx0XHQ/IHRvb2xOYW1lLnNsaWNlKE1DUF9UT09MX1BSRUZJWC5sZW5ndGgpLnNwbGl0KCdfXycpWzBdXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHNlcnZlck5hbWVcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2xhdWRlLnBlcm1pc3Npb24ubWNwLnRpdGxlJywgXCJBbGxvdyB0b29sIGZyb20gezB9P1wiLCBzZXJ2ZXJOYW1lKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjbGF1ZGUucGVybWlzc2lvbi5kZWZhdWx0LnRpdGxlJywgXCJBbGxvdyB0b29sIGNhbGw/XCIpO1xuXHRcdH1cblx0XHRjYXNlICdjdXN0b20tdG9vbCc6XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnBlcm1pc3Npb24uZGVmYXVsdC50aXRsZScsIFwiQWxsb3cgdG9vbCBjYWxsP1wiKTtcblx0fVxufVxuXG4vLyAjcmVnaW9uIFBoYXNlIDguNSBcdTIwMTQgcmljaCB0b29sLWNhbGwgcmVuZGVyaW5nIGhlbHBlcnNcblxuLyoqXG4gKiBQaGFzZSA4LjUgXHUyMDE0IHdvcmtiZW5jaCByZW5kZXJpbmcgaGludC4gT25lLWxpbmVyIG92ZXIgYFRPT0xfUk9XU2AuXG4gKiBSZXR1cm5zIGAndGVybWluYWwnYCBmb3Igc2hlbGwgdG9vbHMgKGRyaXZlcyB0aGUgdGVybWluYWwgcmVuZGVyZXIpLFxuICogYCdzZWFyY2gnYCBmb3IgYEdyZXBgIC8gYEdsb2JgIChkcml2ZXMgdGhlIHNlYXJjaCByZW5kZXJlciksXG4gKiBgJ3N1YmFnZW50J2AgZm9yIGBUYXNrYCAvIGBBZ2VudGAgKGRyaXZlcyB0aGUgc3ViYWdlbnQgcmVuZGVyZXIpLCBhbmRcbiAqIGAncmVhZCdgIGZvciBmaWxlIHJlYWRzIChkZWZlcnMgaW5jb21wbGV0ZSByZXNvdXJjZSBhcmd1bWVudHMpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2xhdWRlVG9vbEtpbmQodG9vbE5hbWU6IHN0cmluZyk6IENsYXVkZVRvb2xLaW5kIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIFRPT0xfUk9XU1t0b29sTmFtZV0/LnRvb2xLaW5kO1xufVxuXG4vKipcbiAqIFBoYXNlIDguNSBcdTIwMTQgYnVpbGQgdGhlIGBfbWV0YWAgYmFnIHN0YW1wZWQgYXQgdGhlIHRvb2wtb3BlbiBzZWFtLlxuICogUmV0dXJucyBgdW5kZWZpbmVkYCBmb3IgdG9vbHMgdGhhdCBoYXZlIG5vIGB0b29sS2luZGAgaGludCBzbyB0aGVcbiAqIHJlc3VsdGluZyBlbnZlbG9wZSBzdGF5cyBtaW5pbWFsLiBNaXJyb3JzIENvcGlsb3Qnc1xuICogW2BtYXBTZXNzaW9uRXZlbnRzLnRzOjE5N2BdKC4uL2NvcGlsb3QvbWFwU2Vzc2lvbkV2ZW50cy50cyNMMTk3KVxuICogc2luZ2xlLXdyaXRlIHBhdHRlcm4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZENsYXVkZVRvb2xNZXRhKHRvb2xOYW1lOiBzdHJpbmcpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG1ldGEgPSBidWlsZENsYXVkZVRvb2xDYWxsTWV0YSh0b29sTmFtZSk7XG5cdHJldHVybiBtZXRhID8gdG9Ub29sQ2FsbE1ldGEobWV0YSkgOiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogVHlwZWQgdmFyaWFudCBvZiB7QGxpbmsgYnVpbGRDbGF1ZGVUb29sTWV0YX0gdGhhdCByZXR1cm5zIHRoZVxuICoge0BsaW5rIElUb29sQ2FsbE1ldGF9IGRpcmVjdGx5LCBmb3IgY2FsbGVycyB0aGF0IGNvbnN1bWUgdGhlIHR5cGVkIHZpZXdcbiAqIHJhdGhlciB0aGFuIHRoZSBzZXJpYWxpemVkIGBfbWV0YWAgYmFnLiBSZXR1cm5zIGB1bmRlZmluZWRgIGZvciB0b29scyB0aGF0XG4gKiBoYXZlIG5vIGB0b29sS2luZGAgaGludC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkQ2xhdWRlVG9vbENhbGxNZXRhKHRvb2xOYW1lOiBzdHJpbmcpOiBJVG9vbENhbGxNZXRhIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgcm93ID0gVE9PTF9ST1dTW3Rvb2xOYW1lXTtcblx0aWYgKCFyb3c/LnRvb2xLaW5kKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4geyB0b29sS2luZDogcm93LnRvb2xLaW5kIH07XG59XG5cbmZ1bmN0aW9uIG1kKHZhbHVlOiBzdHJpbmcpOiBTdHJpbmdPck1hcmtkb3duIHtcblx0cmV0dXJuIHsgbWFya2Rvd246IHZhbHVlIH07XG59XG5cbmZ1bmN0aW9uIGZvcm1hdFBhdGhBc01hcmtkb3duTGluayhwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCB1cmkgPSBVUkkuZmlsZShwYXRoKTtcblx0cmV0dXJuIGBbJHtlc2NhcGVNYXJrZG93bkxpbmtMYWJlbChiYXNlbmFtZSh1cmkpKX1dKCR7dXJpfSlgO1xufVxuXG4vKipcbiAqIERlZmVuc2l2ZSBzdHJpbmctZmllbGQgYWNjZXNzLiBSZXR1cm5zIHRoZSBmaWVsZCB2YWx1ZSB3aGVuIGl0IGlzXG4gKiBhIG5vbi1lbXB0eSBzdHJpbmcsIG90aGVyd2lzZSBgdW5kZWZpbmVkYC5cbiAqL1xuZnVuY3Rpb24gcmVhZFN0cmluZ0ZpZWxkKGlucHV0OiB1bmtub3duLCBmaWVsZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKGlucHV0ID09PSBudWxsIHx8IHR5cGVvZiBpbnB1dCAhPT0gJ29iamVjdCcpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHZhbHVlID0gKGlucHV0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtmaWVsZF07XG5cdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIHZhbHVlLmxlbmd0aCA+IDAgPyB2YWx1ZSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBQaGFzZSA4LjUgXHUyMDE0IGZpcnN0LWxpbmUgY29tbWFuZCBleHRyYWN0b3IgZm9yIHNoZWxsIHRvb2xzLiBNaXJyb3JzXG4gKiBDb3BpbG90J3MgYGNvbW1hbmQuc3BsaXQoJ1xcbicpWzBdYCBwYXR0ZXJuLlxuICovXG5mdW5jdGlvbiBmaXJzdFNoZWxsTGluZShpbnB1dDogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGNvbW1hbmQgPSByZWFkU3RyaW5nRmllbGQoaW5wdXQsICdjb21tYW5kJyk7XG5cdHJldHVybiBjb21tYW5kID8gY29tbWFuZC5zcGxpdCgnXFxuJylbMF0gOiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogTmFycm93cyBhIGBUYXNrVXBkYXRlYCBjYWxsJ3MgYHN0YXR1c2AgdG8gdGhlIHZhbHVlcyB0aGF0IGNoYW5nZSB0aGUgcmVuZGVyZWRcbiAqIHZlcmI7IGFueSBvdGhlciBvciBhYnNlbnQgdmFsdWUgeWllbGRzIGB1bmRlZmluZWRgIChnZW5lcmljIFwiVXBkYXRpbmdcIiB2ZXJiKS5cbiAqL1xuZnVuY3Rpb24gcmVhZFRhc2tVcGRhdGVTdGF0dXMoaW5wdXQ6IHVua25vd24pOiAnaW5fcHJvZ3Jlc3MnIHwgJ2NvbXBsZXRlZCcgfCAnZGVsZXRlZCcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBzdGF0dXMgPSByZWFkU3RyaW5nRmllbGQoaW5wdXQsICdzdGF0dXMnKTtcblx0cmV0dXJuIHN0YXR1cyA9PT0gJ2luX3Byb2dyZXNzJyB8fCBzdGF0dXMgPT09ICdjb21wbGV0ZWQnIHx8IHN0YXR1cyA9PT0gJ2RlbGV0ZWQnID8gc3RhdHVzIDogdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFBoYXNlIDguNSBcdTIwMTQgcmljaCBpbnZvY2F0aW9uIG1lc3NhZ2UgZm9yIGEgYHBlbmRpbmdfY29uZmlybWF0aW9uYFxuICogY2FyZCBvciBhIHN0cmVhbWluZyBgQ2hhdFRvb2xDYWxsU3RhcnRgIGFjdGlvbi4gUmVhZHMgdGhlXG4gKiBTREsncyBgdG9vbF91c2UuaW5wdXRgIGRlZmVuc2l2ZWx5IGFuZCBmYWxscyBiYWNrIHRvIHRoZSBzdGF0aWNcbiAqIGBkaXNwbGF5TmFtZWAgb24gYW55IHNoYXBlIG1pc21hdGNoLiBNaXJyb3Igb2ZcbiAqIFtgY29waWxvdFRvb2xEaXNwbGF5LmdldEludm9jYXRpb25NZXNzYWdlYF0oLi4vY29waWxvdC9jb3BpbG90VG9vbERpc3BsYXkudHMjTDQ3MykuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbGF1ZGVJbnZvY2F0aW9uTWVzc2FnZShcblx0dG9vbE5hbWU6IHN0cmluZyxcblx0ZGlzcGxheU5hbWU6IHN0cmluZyxcblx0aW5wdXQ6IHVua25vd24sXG4pOiBTdHJpbmdPck1hcmtkb3duIHtcblx0Y29uc3Qgc2VydmVyRGlzcGxheSA9IGdldFNlcnZlclRvb2xEaXNwbGF5KHRvb2xOYW1lLCBpbnB1dCk/Lmludm9jYXRpb25NZXNzYWdlO1xuXHRpZiAoc2VydmVyRGlzcGxheSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHNlcnZlckRpc3BsYXk7XG5cdH1cblx0c3dpdGNoICh0b29sTmFtZSkge1xuXHRcdGNhc2UgJ0Jhc2gnOiB7XG5cdFx0XHRjb25zdCBmaXJzdExpbmUgPSBmaXJzdFNoZWxsTGluZShpbnB1dCk7XG5cdFx0XHRpZiAoZmlyc3RMaW5lKSB7XG5cdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2UuYmFzaENtZCcsIFwiUnVubmluZyB7MH1cIiwgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSh0cnVuY2F0ZShmaXJzdExpbmUsIDgwKSkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2UuYmFzaCcsIFwiUnVubmluZyBzaGVsbCBjb21tYW5kXCIpO1xuXHRcdH1cblx0XHRjYXNlICdCYXNoT3V0cHV0Jzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2UuYmFzaE91dHB1dCcsIFwiUmVhZGluZyBzaGVsbCBvdXRwdXRcIik7XG5cdFx0Y2FzZSAnS2lsbEJhc2gnOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS5raWxsQmFzaCcsIFwiS2lsbCBzaGVsbCBjb21tYW5kXCIpO1xuXHRcdGNhc2UgJ1JlYWQnOlxuXHRcdGNhc2UgJ05vdGVib29rUmVhZCc6IHtcblx0XHRcdGNvbnN0IHBhdGggPSBnZXRDbGF1ZGVUb29sUGF0aCh0b29sTmFtZSwgaW5wdXQpO1xuXHRcdFx0aWYgKHBhdGgpIHtcblx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS5yZWFkRmlsZScsIFwiUmVhZCB7MH1cIiwgZm9ybWF0UGF0aEFzTWFya2Rvd25MaW5rKHBhdGgpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sSW52b2tlLnJlYWQnLCBcIlJlYWQgZmlsZVwiKTtcblx0XHR9XG5cdFx0Y2FzZSAnTFMnOiB7XG5cdFx0XHRjb25zdCBwYXRoID0gZ2V0Q2xhdWRlVG9vbFBhdGgodG9vbE5hbWUsIGlucHV0KTtcblx0XHRcdGlmIChwYXRoKSB7XG5cdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2UubHNQYXRoJywgXCJMaXN0IHswfVwiLCBmb3JtYXRQYXRoQXNNYXJrZG93bkxpbmsocGF0aCkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2UubHMnLCBcIkxpc3QgZGlyZWN0b3J5XCIpO1xuXHRcdH1cblx0XHRjYXNlICdXcml0ZSc6XG5cdFx0Y2FzZSAnRWRpdCc6XG5cdFx0Y2FzZSAnTXVsdGlFZGl0Jzpcblx0XHRjYXNlICdOb3RlYm9va0VkaXQnOiB7XG5cdFx0XHRjb25zdCBwYXRoID0gZ2V0Q2xhdWRlVG9vbFBhdGgodG9vbE5hbWUsIGlucHV0KTtcblx0XHRcdGlmIChwYXRoKSB7XG5cdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2UuZWRpdEZpbGUnLCBcIkVkaXQgezB9XCIsIGZvcm1hdFBhdGhBc01hcmtkb3duTGluayhwYXRoKSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS5lZGl0JywgXCJFZGl0IGZpbGVcIik7XG5cdFx0fVxuXHRcdGNhc2UgJ1RvZG9Xcml0ZSc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sSW52b2tlLnRvZG9Xcml0ZScsIFwiVXBkYXRlIHRvZG8gbGlzdFwiKTtcblx0XHRjYXNlICdHcmVwJzoge1xuXHRcdFx0Y29uc3QgcGF0dGVybiA9IHJlYWRTdHJpbmdGaWVsZChpbnB1dCwgJ3BhdHRlcm4nKTtcblx0XHRcdGlmIChwYXR0ZXJuKSB7XG5cdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2UuZ3JlcFBhdHRlcm4nLCBcIlNlYXJjaCBmb3IgezB9XCIsIGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUodHJ1bmNhdGUocGF0dGVybiwgODApKSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS5ncmVwJywgXCJTZWFyY2ggZmlsZXNcIik7XG5cdFx0fVxuXHRcdGNhc2UgJ0dsb2InOiB7XG5cdFx0XHRjb25zdCBwYXR0ZXJuID0gcmVhZFN0cmluZ0ZpZWxkKGlucHV0LCAncGF0dGVybicpO1xuXHRcdFx0aWYgKHBhdHRlcm4pIHtcblx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS5nbG9iUGF0dGVybicsIFwiRmluZCBmaWxlcyBtYXRjaGluZyB7MH1cIiwgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSh0cnVuY2F0ZShwYXR0ZXJuLCA4MCkpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sSW52b2tlLmdsb2InLCBcIkZpbmQgZmlsZXNcIik7XG5cdFx0fVxuXHRcdGNhc2UgJ1dlYkZldGNoJzoge1xuXHRcdFx0Y29uc3QgdXJsID0gcmVhZFN0cmluZ0ZpZWxkKGlucHV0LCAndXJsJyk7XG5cdFx0XHRpZiAodXJsKSB7XG5cdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2Uud2ViRmV0Y2gnLCBcIkZldGNoaW5nIHswfVwiLCBgWyR7ZXNjYXBlTWFya2Rvd25MaW5rTGFiZWwodHJ1bmNhdGUodXJsLCA4MCkpfV0oJHt1cmx9KWApKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2Uud2ViRmV0Y2hHZW5lcmljJywgXCJGZXRjaGluZyBVUkxcIik7XG5cdFx0fVxuXHRcdGNhc2UgJ1Rhc2snOlxuXHRcdGNhc2UgJ0FnZW50Jzoge1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSByZWFkU3RyaW5nRmllbGQoaW5wdXQsICdkZXNjcmlwdGlvbicpO1xuXHRcdFx0aWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBkZXNjcmlwdGlvbjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBkaXNwbGF5TmFtZTtcblx0XHR9XG5cdFx0Y2FzZSAnU2tpbGwnOiB7XG5cdFx0XHRjb25zdCBza2lsbCA9IHJlYWRTdHJpbmdGaWVsZChpbnB1dCwgJ3NraWxsJyk7XG5cdFx0XHRpZiAoc2tpbGwpIHtcblx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS5za2lsbE5hbWVkJywgXCJSdW5uaW5nIHNraWxsIHswfVwiLCBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKHRydW5jYXRlKHNraWxsLCA4MCkpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sSW52b2tlLnNraWxsJywgXCJSdW5uaW5nIHNraWxsXCIpO1xuXHRcdH1cblx0XHRjYXNlICdUYXNrQ3JlYXRlJzoge1xuXHRcdFx0Y29uc3Qgc3ViamVjdCA9IHJlYWRTdHJpbmdGaWVsZChpbnB1dCwgJ3N1YmplY3QnKTtcblx0XHRcdGlmIChzdWJqZWN0KSB7XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2UudGFza0NyZWF0ZU5hbWVkJywgXCJDcmVhdGUgdGFzazogezB9XCIsIHRydW5jYXRlKHN1YmplY3QsIDgwKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sSW52b2tlLnRhc2tDcmVhdGUnLCBcIkNyZWF0ZSB0YXNrXCIpO1xuXHRcdH1cblx0XHRjYXNlICdUYXNrVXBkYXRlJzpcblx0XHRcdHN3aXRjaCAocmVhZFRhc2tVcGRhdGVTdGF0dXMoaW5wdXQpKSB7XG5cdFx0XHRcdGNhc2UgJ2luX3Byb2dyZXNzJzogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS50YXNrU3RhcnQnLCBcIlN0YXJ0IHRhc2tcIik7XG5cdFx0XHRcdGNhc2UgJ2NvbXBsZXRlZCc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2UudGFza0NvbXBsZXRlJywgXCJDb21wbGV0ZSB0YXNrXCIpO1xuXHRcdFx0XHRjYXNlICdkZWxldGVkJzogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS50YXNrRGVsZXRlJywgXCJEZWxldGUgdGFza1wiKTtcblx0XHRcdFx0ZGVmYXVsdDogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS50YXNrVXBkYXRlJywgXCJVcGRhdGUgdGFza1wiKTtcblx0XHRcdH1cblx0XHRjYXNlICdUYXNrTGlzdCc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sSW52b2tlLnRhc2tMaXN0JywgXCJSZWFkIHRhc2sgbGlzdFwiKTtcblx0XHRjYXNlICdUYXNrR2V0Jzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2UudGFza0dldCcsIFwiUmVhZCB0YXNrXCIpO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gZGlzcGxheU5hbWU7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENsYXVkZVN0cmVhbWluZ0ludm9jYXRpb25NZXNzYWdlKHRvb2xOYW1lOiBzdHJpbmcsIGlucHV0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IFN0cmluZ09yTWFya2Rvd24gfCB1bmRlZmluZWQge1xuXHRzd2l0Y2ggKHRvb2xOYW1lKSB7XG5cdFx0Y2FzZSAnV3JpdGUnOlxuXHRcdFx0cmV0dXJuIGdldFN0cmVhbWluZ0NyZWF0ZU1lc3NhZ2UoaW5wdXQ/LlsnZmlsZV9wYXRoJ10sIHN0cmVhbWluZ1Rvb2xUZXh0TGluZUNvdW50KGlucHV0Py5bJ2NvbnRlbnQnXSkpO1xuXHRcdGNhc2UgJ0VkaXQnOlxuXHRcdFx0cmV0dXJuIGdldFN0cmVhbWluZ1JlcGxhY2VNZXNzYWdlKFxuXHRcdFx0XHRpbnB1dD8uWydmaWxlX3BhdGgnXSxcblx0XHRcdFx0c3RyZWFtaW5nVG9vbFRleHRMaW5lQ291bnQoaW5wdXQ/Llsnb2xkX3N0cmluZyddKSxcblx0XHRcdFx0c3RyZWFtaW5nVG9vbFRleHRMaW5lQ291bnQoaW5wdXQ/LlsnbmV3X3N0cmluZyddKSxcblx0XHRcdCk7XG5cdFx0Y2FzZSAnTXVsdGlFZGl0Jzoge1xuXHRcdFx0Y29uc3QgZWRpdHMgPSBBcnJheS5pc0FycmF5KGlucHV0Py5bJ2VkaXRzJ10pID8gaW5wdXRbJ2VkaXRzJ10gOiBbXTtcblx0XHRcdGxldCBvbGRMaW5lQ291bnQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBuZXdMaW5lQ291bnQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdGZvciAoY29uc3QgZWRpdCBvZiBlZGl0cykge1xuXHRcdFx0XHRpZiAoIWVkaXQgfHwgdHlwZW9mIGVkaXQgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkoZWRpdCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBvbGRMaW5lcyA9IHN0cmVhbWluZ1Rvb2xUZXh0TGluZUNvdW50KChlZGl0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVsnb2xkX3N0cmluZyddKTtcblx0XHRcdFx0Y29uc3QgbmV3TGluZXMgPSBzdHJlYW1pbmdUb29sVGV4dExpbmVDb3VudCgoZWRpdCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbJ25ld19zdHJpbmcnXSk7XG5cdFx0XHRcdGlmIChvbGRMaW5lcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0b2xkTGluZUNvdW50ID0gKG9sZExpbmVDb3VudCA/PyAwKSArIG9sZExpbmVzO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChuZXdMaW5lcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0bmV3TGluZUNvdW50ID0gKG5ld0xpbmVDb3VudCA/PyAwKSArIG5ld0xpbmVzO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZ2V0U3RyZWFtaW5nUmVwbGFjZU1lc3NhZ2UoaW5wdXQ/LlsnZmlsZV9wYXRoJ10sIG9sZExpbmVDb3VudCwgbmV3TGluZUNvdW50KTtcblx0XHR9XG5cdFx0Y2FzZSAnTm90ZWJvb2tFZGl0Jzpcblx0XHRcdHJldHVybiBnZXRTdHJlYW1pbmdFZGl0TWVzc2FnZShpbnB1dD8uWydub3RlYm9va19wYXRoJ10sIHN0cmVhbWluZ1Rvb2xUZXh0TGluZUNvdW50KGlucHV0Py5bJ25ld19zb3VyY2UnXSkpO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogUGhhc2UgOC41IFx1MjAxNCBzdWNjZXNzLWF3YXJlIHJpY2ggcGFzdC10ZW5zZSBtZXNzYWdlLiBNaXJyb3Igb2ZcbiAqIFtgY29waWxvdFRvb2xEaXNwbGF5LmdldFBhc3RUZW5zZU1lc3NhZ2VgXSguLi9jb3BpbG90L2NvcGlsb3RUb29sRGlzcGxheS50cyNMNTcyKS5cbiAqIEZhaWx1cmUgcGF0aCByZXR1cm5zIGEgZ2VuZXJpYyBcImZhaWxlZFwiIG1lc3NhZ2U7IHN1Y2Nlc3MgcGF0aFxuICogbWlycm9ycyB0aGUge0BsaW5rIGdldENsYXVkZUludm9jYXRpb25NZXNzYWdlfSBzdHJ1Y3R1cmUgd2l0aFxuICogcGFzdC10ZW5zZSB2ZXJicy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldENsYXVkZVBhc3RUZW5zZU1lc3NhZ2UoXG5cdHRvb2xOYW1lOiBzdHJpbmcsXG5cdGRpc3BsYXlOYW1lOiBzdHJpbmcsXG5cdGlucHV0OiB1bmtub3duLFxuXHRzdWNjZXNzOiBib29sZWFuLFxuXHRyZXN1bHRUZXh0Pzogc3RyaW5nLFxuKTogU3RyaW5nT3JNYXJrZG93biB7XG5cdGlmICghc3VjY2Vzcykge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xDb21wbGV0ZS5mYWlsZWQnLCBcIlxcXCJ7MH1cXFwiIGZhaWxlZFwiLCBkaXNwbGF5TmFtZSk7XG5cdH1cblx0Y29uc3Qgc2VydmVyRGlzcGxheSA9IGdldFNlcnZlclRvb2xEaXNwbGF5KHRvb2xOYW1lLCBpbnB1dCwgeyB0ZXh0OiByZXN1bHRUZXh0LCBzdWNjZXNzIH0pPy5wYXN0VGVuc2VNZXNzYWdlO1xuXHRpZiAoc2VydmVyRGlzcGxheSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHNlcnZlckRpc3BsYXk7XG5cdH1cblx0c3dpdGNoICh0b29sTmFtZSkge1xuXHRcdGNhc2UgJ0Jhc2gnOiB7XG5cdFx0XHRjb25zdCBmaXJzdExpbmUgPSBmaXJzdFNoZWxsTGluZShpbnB1dCk7XG5cdFx0XHRpZiAoZmlyc3RMaW5lKSB7XG5cdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgnY2xhdWRlLnRvb2xDb21wbGV0ZS5iYXNoQ21kJywgXCJSYW4gezB9XCIsIGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUodHJ1bmNhdGUoZmlyc3RMaW5lLCA4MCkpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sQ29tcGxldGUuYmFzaCcsIFwiUmFuIHNoZWxsIGNvbW1hbmRcIik7XG5cdFx0fVxuXHRcdGNhc2UgJ0Jhc2hPdXRwdXQnOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbENvbXBsZXRlLmJhc2hPdXRwdXQnLCBcIlJlYWQgc2hlbGwgb3V0cHV0XCIpO1xuXHRcdGNhc2UgJ1dlYkZldGNoJzoge1xuXHRcdFx0Y29uc3QgdXJsID0gcmVhZFN0cmluZ0ZpZWxkKGlucHV0LCAndXJsJyk7XG5cdFx0XHRpZiAodXJsKSB7XG5cdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgnY2xhdWRlLnRvb2xDb21wbGV0ZS53ZWJGZXRjaCcsIFwiRmV0Y2hlZCB7MH1cIiwgYFske2VzY2FwZU1hcmtkb3duTGlua0xhYmVsKHRydW5jYXRlKHVybCwgODApKX1dKCR7dXJsfSlgKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sQ29tcGxldGUud2ViRmV0Y2hHZW5lcmljJywgXCJGZXRjaGVkIFVSTFwiKTtcblx0XHR9XG5cdFx0Y2FzZSAnVGFzayc6XG5cdFx0Y2FzZSAnQWdlbnQnOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbENvbXBsZXRlLnRhc2snLCBcIlJhbiBzdWJhZ2VudFwiKTtcblx0XHRjYXNlICdTa2lsbCc6IHtcblx0XHRcdGNvbnN0IHNraWxsID0gcmVhZFN0cmluZ0ZpZWxkKGlucHV0LCAnc2tpbGwnKTtcblx0XHRcdGlmIChza2lsbCkge1xuXHRcdFx0XHRyZXR1cm4gbWQobG9jYWxpemUoJ2NsYXVkZS50b29sQ29tcGxldGUuc2tpbGxOYW1lZCcsIFwiUmFuIHNraWxsIHswfVwiLCBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKHRydW5jYXRlKHNraWxsLCA4MCkpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sQ29tcGxldGUuc2tpbGwnLCBcIlJhbiBza2lsbFwiKTtcblx0XHR9XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBnZXRDbGF1ZGVJbnZvY2F0aW9uTWVzc2FnZSh0b29sTmFtZSwgZGlzcGxheU5hbWUsIGlucHV0KTtcblx0fVxufVxuXG4vKipcbiAqIFBoYXNlIDguNSBcdTIwMTQgY2Fub25pY2FsIFwiaW5wdXQgYXMgY29kZVwiIHN0cmluZyByZW5kZXJlZCB1bmRlciB0aGVcbiAqIHRvb2wtY2FsbCByb3cuIFNoZWxsIHRvb2xzIHN1cmZhY2UgdGhlIHJhdyBgY29tbWFuZGA7IHNlYXJjaCB0b29sc1xuICogc3VyZmFjZSB0aGUgYHBhdHRlcm5gOyBldmVyeXRoaW5nIGVsc2UgZmFsbHMgYmFjayB0byBwcmV0dHktcHJpbnRlZFxuICogSlNPTi4gUmV0dXJucyBgdW5kZWZpbmVkYCBvbmx5IHdoZW4gdGhlIGlucHV0IGlzIGl0c2VsZiBhYnNlbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbGF1ZGVUb29sSW5wdXRTdHJpbmcodG9vbE5hbWU6IHN0cmluZywgaW5wdXQ6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoaW5wdXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHRvb2xOYW1lID09PSAnQmFzaCcgfHwgdG9vbE5hbWUgPT09ICdCYXNoT3V0cHV0JyB8fCB0b29sTmFtZSA9PT0gJ0tpbGxCYXNoJykge1xuXHRcdGNvbnN0IGNvbW1hbmQgPSByZWFkU3RyaW5nRmllbGQoaW5wdXQsICdjb21tYW5kJyk7XG5cdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdHJldHVybiBjb21tYW5kO1xuXHRcdH1cblx0fVxuXHRpZiAodG9vbE5hbWUgPT09ICdHcmVwJyB8fCB0b29sTmFtZSA9PT0gJ0dsb2InKSB7XG5cdFx0Y29uc3QgcGF0dGVybiA9IHJlYWRTdHJpbmdGaWVsZChpbnB1dCwgJ3BhdHRlcm4nKTtcblx0XHRpZiAocGF0dGVybikge1xuXHRcdFx0cmV0dXJuIHBhdHRlcm47XG5cdFx0fVxuXHR9XG5cdHRyeSB7XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KGlucHV0LCBudWxsLCAyKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vLyAjZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlDQUFpQywrQkFBK0I7QUFDekUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsMkJBQTJCLHlCQUF5Qiw0QkFBNEIsa0NBQWtDO0FBQzNILFNBQVMsc0JBQXlEO0FBRWxFLFNBQVMsNEJBQTRCO0FBZ0ZyQyxNQUFNLFlBQTREO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTWpFLE1BQU0sRUFBRSxnQkFBZ0IsU0FBUyxVQUFVLFdBQVc7QUFBQSxFQUN0RCxZQUFZLEVBQUUsZ0JBQWdCLFNBQVMsVUFBVSxXQUFXO0FBQUEsRUFDNUQsVUFBVSxFQUFFLGdCQUFnQixTQUFTLFVBQVUsV0FBVztBQUFBO0FBQUEsRUFHMUQsTUFBTSxFQUFFLGdCQUFnQixRQUFRLFdBQVcsYUFBYSxVQUFVLE9BQU87QUFBQSxFQUN6RSxNQUFNLEVBQUUsZ0JBQWdCLFFBQVEsV0FBVyxRQUFRLFVBQVUsU0FBUztBQUFBLEVBQ3RFLE1BQU0sRUFBRSxnQkFBZ0IsUUFBUSxXQUFXLFFBQVEsVUFBVSxTQUFTO0FBQUEsRUFDdEUsSUFBSSxFQUFFLGdCQUFnQixRQUFRLFdBQVcsT0FBTztBQUFBLEVBQ2hELGNBQWMsRUFBRSxnQkFBZ0IsUUFBUSxXQUFXLGlCQUFpQixVQUFVLE9BQU87QUFBQTtBQUFBLEVBR3JG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
