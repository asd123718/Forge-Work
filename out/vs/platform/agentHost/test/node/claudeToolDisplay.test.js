import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import {
  getClaudeConfirmationTitle,
  getClaudeInvocationMessage,
  getClaudePastTenseMessage,
  getClaudePermissionKind,
  getClaudeStreamingInvocationMessage,
  getClaudeToolDisplayName,
  getClaudeToolInputString,
  getClaudeToolKind,
  getClaudeToolPath,
  INTERACTIVE_CLAUDE_TOOLS,
  buildClaudeToolMeta,
  isClaudeFileEditTool
} from "../../node/claude/claudeToolDisplay.js";
suite("claudeToolDisplay \u2014 \xA74 mapping table", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("mapping snapshot covers every Phase 7 \xA74 row", () => {
    const TOOLS = [
      "Bash",
      "BashOutput",
      "KillBash",
      "Read",
      "Glob",
      "Grep",
      "LS",
      "NotebookRead",
      "Write",
      "Edit",
      "MultiEdit",
      "NotebookEdit",
      "TodoWrite",
      "WebFetch",
      "Task",
      "ExitPlanMode",
      "AskUserQuestion",
      "Skill",
      "TaskCreate",
      "TaskUpdate",
      "TaskList",
      "TaskGet"
    ];
    const snapshot = TOOLS.map((t) => [t, getClaudePermissionKind(t), getClaudeToolDisplayName(t)]);
    assert.deepStrictEqual(snapshot, [
      ["Bash", "shell", "Run shell command"],
      ["BashOutput", "shell", "Read shell output"],
      ["KillBash", "shell", "Kill shell command"],
      ["Read", "read", "Read file"],
      ["Glob", "read", "Find files"],
      ["Grep", "read", "Search files"],
      ["LS", "read", "List directory"],
      ["NotebookRead", "read", "Read notebook"],
      ["Write", "write", "Write file"],
      ["Edit", "write", "Edit file"],
      ["MultiEdit", "write", "Edit file"],
      ["NotebookEdit", "write", "Edit notebook"],
      ["TodoWrite", "write", "Update todo list"],
      ["WebFetch", "url", "Fetch URL"],
      ["Task", "custom-tool", "Run subagent task"],
      ["ExitPlanMode", "custom-tool", "Ready to code?"],
      ["AskUserQuestion", "custom-tool", "Ask user a question"],
      ["Skill", "skill", "Run skill"],
      ["TaskCreate", "custom-tool", "Create task"],
      ["TaskUpdate", "custom-tool", "Update task"],
      ["TaskList", "custom-tool", "List tasks"],
      ["TaskGet", "custom-tool", "Read task"]
    ]);
  });
  test("mcp__-prefixed tool maps to mcp / strips prefix in displayName", () => {
    assert.deepStrictEqual(
      [
        getClaudePermissionKind("mcp__github__listIssues"),
        getClaudeToolDisplayName("mcp__github__listIssues")
      ],
      ["mcp", "Run MCP tool github__listIssues"]
    );
  });
  test("unknown tool defaults to custom-tool / toolName", () => {
    assert.deepStrictEqual(
      [
        getClaudePermissionKind("SomeNewTool"),
        getClaudeToolDisplayName("SomeNewTool")
      ],
      ["custom-tool", "SomeNewTool"]
    );
  });
  test("getClaudeToolPath snapshot for path-bearing tools", () => {
    assert.deepStrictEqual(
      {
        read: getClaudeToolPath("Read", { file_path: "/tmp/a" }),
        write: getClaudeToolPath("Write", { file_path: "/tmp/b" }),
        edit: getClaudeToolPath("Edit", { file_path: "/tmp/c" }),
        multiEdit: getClaudeToolPath("MultiEdit", { file_path: "/tmp/d" }),
        notebookRead: getClaudeToolPath("NotebookRead", { notebook_path: "/tmp/e.ipynb" }),
        notebookEdit: getClaudeToolPath("NotebookEdit", { notebook_path: "/tmp/f.ipynb" }),
        glob: getClaudeToolPath("Glob", { path: "/tmp/g", pattern: "*" }),
        grep: getClaudeToolPath("Grep", { path: "/tmp/h", pattern: "foo" }),
        ls: getClaudeToolPath("LS", { path: "/tmp/i" }),
        webFetch: getClaudeToolPath("WebFetch", { url: "https://example.com" }),
        bash: getClaudeToolPath("Bash", { command: "ls" }),
        todoWrite: getClaudeToolPath("TodoWrite", { todos: [] }),
        wrongTypeRead: getClaudeToolPath("Read", { file_path: 42 }),
        missingRead: getClaudeToolPath("Read", {}),
        nonObject: getClaudeToolPath("Write", null),
        unknownTool: getClaudeToolPath("SomeNewTool", { file_path: "/tmp/x" })
      },
      {
        read: "/tmp/a",
        write: "/tmp/b",
        edit: "/tmp/c",
        multiEdit: "/tmp/d",
        notebookRead: "/tmp/e.ipynb",
        notebookEdit: "/tmp/f.ipynb",
        glob: "/tmp/g",
        grep: "/tmp/h",
        ls: "/tmp/i",
        webFetch: "https://example.com",
        bash: void 0,
        todoWrite: void 0,
        wrongTypeRead: void 0,
        missingRead: void 0,
        nonObject: void 0,
        unknownTool: void 0
      }
    );
  });
  test("INTERACTIVE_CLAUDE_TOOLS contains exactly the user-input round-trip tools", () => {
    assert.deepStrictEqual(
      [...INTERACTIVE_CLAUDE_TOOLS].sort(),
      ["AskUserQuestion", "ExitPlanMode"]
    );
  });
  test("getClaudeConfirmationTitle returns per-permissionKind localized title", () => {
    assert.deepStrictEqual(
      {
        shell: getClaudeConfirmationTitle("Bash"),
        write: getClaudeConfirmationTitle("Write"),
        read: getClaudeConfirmationTitle("Read"),
        url: getClaudeConfirmationTitle("WebFetch"),
        mcpWithServer: getClaudeConfirmationTitle("mcp__github__listIssues"),
        custom: getClaudeConfirmationTitle("Task"),
        skill: getClaudeConfirmationTitle("Skill"),
        unknown: getClaudeConfirmationTitle("SomeNewTool")
      },
      {
        shell: "Run in terminal?",
        write: "Edit file?",
        read: "Read file?",
        url: "Fetch URL?",
        mcpWithServer: "Allow tool from github?",
        custom: "Allow tool call?",
        skill: "Run skill?",
        unknown: "Allow tool call?"
      }
    );
  });
  test("Phase 8 \u2014 isClaudeFileEditTool covers Write/Edit/MultiEdit/NotebookEdit, excludes TodoWrite/Bash/others", () => {
    assert.deepStrictEqual(
      {
        Write: isClaudeFileEditTool("Write"),
        Edit: isClaudeFileEditTool("Edit"),
        MultiEdit: isClaudeFileEditTool("MultiEdit"),
        NotebookEdit: isClaudeFileEditTool("NotebookEdit"),
        TodoWrite: isClaudeFileEditTool("TodoWrite"),
        Read: isClaudeFileEditTool("Read"),
        Bash: isClaudeFileEditTool("Bash"),
        unknown: isClaudeFileEditTool("SomeNewTool"),
        mcp: isClaudeFileEditTool("mcp__server__edit")
      },
      {
        Write: true,
        Edit: true,
        MultiEdit: true,
        NotebookEdit: true,
        TodoWrite: false,
        Read: false,
        Bash: false,
        unknown: false,
        mcp: false
      }
    );
  });
  test("streams rich file and line-count messages for Claude edit tools", () => {
    assert.deepStrictEqual({
      write: getClaudeStreamingInvocationMessage("Write", {
        file_path: "/src/new.ts",
        content: "one\r\ntwo\r\nthree"
      }),
      edit: getClaudeStreamingInvocationMessage("Edit", {
        file_path: "/src/foo.ts",
        old_string: "one",
        new_string: "one\ntwo"
      }),
      multiEdit: getClaudeStreamingInvocationMessage("MultiEdit", {
        file_path: "/src/foo.ts",
        edits: [
          { old_string: "one", new_string: "one\ntwo" },
          { old_string: "three\nfour", new_string: "updated" }
        ]
      }),
      notebookEdit: getClaudeStreamingInvocationMessage("NotebookEdit", {
        notebook_path: "/src/notebook.ipynb",
        new_source: "one\ntwo"
      }),
      read: getClaudeStreamingInvocationMessage("Read", { file_path: "/src/foo.ts" })
    }, {
      write: { markdown: "Creating [new.ts](file:///src/new.ts) (3 lines)" },
      edit: { markdown: "Replacing 1 line with 2 lines in [foo.ts](file:///src/foo.ts)" },
      multiEdit: { markdown: "Replacing 3 lines with 3 lines in [foo.ts](file:///src/foo.ts)" },
      notebookEdit: { markdown: "Editing 2 lines in [notebook.ipynb](file:///src/notebook.ipynb)" },
      read: void 0
    });
  });
  test("Phase 8.5 \u2014 rich rendering snapshot covers every tool row", () => {
    const SAMPLE_INPUT = {
      Bash: { command: "git status" },
      BashOutput: { bash_id: "b1" },
      KillBash: { bash_id: "b1" },
      Read: { file_path: "/src/foo.ts" },
      Glob: { pattern: "**/*.ts" },
      Grep: { pattern: "IClaudeAgentSession" },
      LS: { path: "/src" },
      NotebookRead: { notebook_path: "/nb.ipynb" },
      Write: { file_path: "/src/foo.ts", content: "..." },
      Edit: { file_path: "/src/foo.ts", old_string: "a", new_string: "b" },
      MultiEdit: { file_path: "/src/foo.ts", edits: [] },
      NotebookEdit: { notebook_path: "/nb.ipynb" },
      TodoWrite: { todos: [] },
      WebFetch: { url: "https://example.com" },
      Task: { description: "find the bug", subagent_type: "Explore" },
      ExitPlanMode: { plan: "..." },
      AskUserQuestion: { question: "why?" },
      Skill: { skill: "deep-research", args: "foo" },
      TaskCreate: { subject: "Fix auth bug", description: "..." },
      TaskUpdate: { taskId: "1", status: "completed" },
      TaskList: {},
      TaskGet: { taskId: "1" }
    };
    const TOOLS = Object.keys(SAMPLE_INPUT);
    const snapshot = TOOLS.map((t) => {
      const input = SAMPLE_INPUT[t];
      const displayName = getClaudeToolDisplayName(t);
      return [
        t,
        getClaudeToolKind(t),
        buildClaudeToolMeta(t),
        getClaudeInvocationMessage(t, displayName, input),
        getClaudePastTenseMessage(t, displayName, input, true),
        getClaudePastTenseMessage(t, displayName, input, false),
        getClaudeToolInputString(t, input)
      ];
    });
    assert.deepStrictEqual(snapshot, [
      ["Bash", "terminal", { toolKind: "terminal" }, { markdown: "Running `git status`" }, { markdown: "Ran `git status`" }, '"Run shell command" failed', "git status"],
      ["BashOutput", "terminal", { toolKind: "terminal" }, "Reading shell output", "Read shell output", '"Read shell output" failed', '{\n  "bash_id": "b1"\n}'],
      ["KillBash", "terminal", { toolKind: "terminal" }, "Kill shell command", "Kill shell command", '"Kill shell command" failed', '{\n  "bash_id": "b1"\n}'],
      ["Read", "read", { toolKind: "read" }, { markdown: "Read [foo.ts](file:///src/foo.ts)" }, { markdown: "Read [foo.ts](file:///src/foo.ts)" }, '"Read file" failed', '{\n  "file_path": "/src/foo.ts"\n}'],
      ["Glob", "search", { toolKind: "search" }, { markdown: "Find files matching `**/*.ts`" }, { markdown: "Find files matching `**/*.ts`" }, '"Find files" failed', "**/*.ts"],
      ["Grep", "search", { toolKind: "search" }, { markdown: "Search for `IClaudeAgentSession`" }, { markdown: "Search for `IClaudeAgentSession`" }, '"Search files" failed', "IClaudeAgentSession"],
      ["LS", void 0, void 0, { markdown: "List [src](file:///src)" }, { markdown: "List [src](file:///src)" }, '"List directory" failed', '{\n  "path": "/src"\n}'],
      ["NotebookRead", "read", { toolKind: "read" }, { markdown: "Read [nb.ipynb](file:///nb.ipynb)" }, { markdown: "Read [nb.ipynb](file:///nb.ipynb)" }, '"Read notebook" failed', '{\n  "notebook_path": "/nb.ipynb"\n}'],
      ["Write", void 0, void 0, { markdown: "Edit [foo.ts](file:///src/foo.ts)" }, { markdown: "Edit [foo.ts](file:///src/foo.ts)" }, '"Write file" failed', '{\n  "file_path": "/src/foo.ts",\n  "content": "..."\n}'],
      ["Edit", void 0, void 0, { markdown: "Edit [foo.ts](file:///src/foo.ts)" }, { markdown: "Edit [foo.ts](file:///src/foo.ts)" }, '"Edit file" failed', '{\n  "file_path": "/src/foo.ts",\n  "old_string": "a",\n  "new_string": "b"\n}'],
      ["MultiEdit", void 0, void 0, { markdown: "Edit [foo.ts](file:///src/foo.ts)" }, { markdown: "Edit [foo.ts](file:///src/foo.ts)" }, '"Edit file" failed', '{\n  "file_path": "/src/foo.ts",\n  "edits": []\n}'],
      ["NotebookEdit", void 0, void 0, { markdown: "Edit [nb.ipynb](file:///nb.ipynb)" }, { markdown: "Edit [nb.ipynb](file:///nb.ipynb)" }, '"Edit notebook" failed', '{\n  "notebook_path": "/nb.ipynb"\n}'],
      ["TodoWrite", void 0, void 0, "Update todo list", "Update todo list", '"Update todo list" failed', '{\n  "todos": []\n}'],
      ["WebFetch", void 0, void 0, { markdown: "Fetching [https://example.com](https://example.com)" }, { markdown: "Fetched [https://example.com](https://example.com)" }, '"Fetch URL" failed', '{\n  "url": "https://example.com"\n}'],
      ["Task", "subagent", { toolKind: "subagent" }, "find the bug", "Ran subagent", '"Run subagent task" failed', '{\n  "description": "find the bug",\n  "subagent_type": "Explore"\n}'],
      ["ExitPlanMode", void 0, void 0, "Ready to code?", "Ready to code?", '"Ready to code?" failed', '{\n  "plan": "..."\n}'],
      ["AskUserQuestion", void 0, void 0, "Ask user a question", "Ask user a question", '"Ask user a question" failed', '{\n  "question": "why?"\n}'],
      ["Skill", void 0, void 0, { markdown: "Running skill `deep-research`" }, { markdown: "Ran skill `deep-research`" }, '"Run skill" failed', '{\n  "skill": "deep-research",\n  "args": "foo"\n}'],
      ["TaskCreate", void 0, void 0, "Create task: Fix auth bug", "Create task: Fix auth bug", '"Create task" failed', '{\n  "subject": "Fix auth bug",\n  "description": "..."\n}'],
      ["TaskUpdate", void 0, void 0, "Complete task", "Complete task", '"Update task" failed', '{\n  "taskId": "1",\n  "status": "completed"\n}'],
      ["TaskList", void 0, void 0, "Read task list", "Read task list", '"List tasks" failed', "{}"],
      ["TaskGet", void 0, void 0, "Read task", "Read task", '"Read task" failed', '{\n  "taskId": "1"\n}']
    ]);
  });
  test("Phase 8.5 \u2014 TaskUpdate message varies by status", () => {
    const invoke = (status) => getClaudeInvocationMessage("TaskUpdate", "Update task", status ? { taskId: "1", status } : { taskId: "1" });
    const past = (status) => getClaudePastTenseMessage("TaskUpdate", "Update task", status ? { taskId: "1", status } : { taskId: "1" }, true);
    assert.deepStrictEqual(
      {
        startInvoke: invoke("in_progress"),
        startPast: past("in_progress"),
        completeInvoke: invoke("completed"),
        completePast: past("completed"),
        deleteInvoke: invoke("deleted"),
        deletePast: past("deleted"),
        noStatusInvoke: invoke(),
        noStatusPast: past(),
        unknownStatusInvoke: invoke("bogus")
      },
      {
        startInvoke: "Start task",
        startPast: "Start task",
        completeInvoke: "Complete task",
        completePast: "Complete task",
        deleteInvoke: "Delete task",
        deletePast: "Delete task",
        noStatusInvoke: "Update task",
        noStatusPast: "Update task",
        unknownStatusInvoke: "Update task"
      }
    );
  });
  test("Phase 8.5 \u2014 defensive input handling falls back to static display strings", () => {
    assert.deepStrictEqual(
      {
        bashNoCommand: getClaudeInvocationMessage("Bash", "Run shell command", {}),
        bashWrongType: getClaudeInvocationMessage("Bash", "Run shell command", { command: 42 }),
        readMissingPath: getClaudeInvocationMessage("Read", "Read file", {}),
        grepMissingPattern: getClaudeInvocationMessage("Grep", "Search files", {}),
        nonObjectInput: getClaudeInvocationMessage("Bash", "Run shell command", null),
        undefinedInput: getClaudeInvocationMessage("Bash", "Run shell command", void 0),
        taskNoDescription: getClaudeInvocationMessage("Task", "Run subagent task", {}),
        bashFailed: getClaudePastTenseMessage("Bash", "Run shell command", { command: "x" }, false),
        inputStringUndefined: getClaudeToolInputString("Bash", void 0),
        inputStringBashNoCommand: getClaudeToolInputString("Bash", {})
      },
      {
        bashNoCommand: "Running shell command",
        bashWrongType: "Running shell command",
        readMissingPath: "Read file",
        grepMissingPattern: "Search files",
        nonObjectInput: "Running shell command",
        undefinedInput: "Running shell command",
        taskNoDescription: "Run subagent task",
        bashFailed: '"Run shell command" failed',
        inputStringUndefined: void 0,
        inputStringBashNoCommand: "{}"
      }
    );
  });
  test("Phase 8.5 \u2014 Agent row mirrors Task (subagent kind, same display name)", () => {
    assert.deepStrictEqual(
      [
        getClaudeToolKind("Agent"),
        buildClaudeToolMeta("Agent"),
        getClaudeToolDisplayName("Agent"),
        getClaudePermissionKind("Agent"),
        getClaudeInvocationMessage("Agent", getClaudeToolDisplayName("Agent"), { description: "review this" })
      ],
      [
        "subagent",
        { toolKind: "subagent" },
        "Run subagent task",
        "custom-tool",
        "review this"
      ]
    );
  });
  test("Phase 8.5 \u2014 MCP tools have no toolKind, JSON input fallback", () => {
    assert.deepStrictEqual(
      {
        kind: getClaudeToolKind("mcp__github__listIssues"),
        meta: buildClaudeToolMeta("mcp__github__listIssues"),
        inputString: getClaudeToolInputString("mcp__github__listIssues", { owner: "microsoft", repo: "vscode" }),
        invocation: getClaudeInvocationMessage("mcp__github__listIssues", "Run MCP tool github__listIssues", { owner: "microsoft" })
      },
      {
        kind: void 0,
        meta: void 0,
        inputString: '{\n  "owner": "microsoft",\n  "repo": "vscode"\n}',
        invocation: "Run MCP tool github__listIssues"
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGF1ZGVUb29sRGlzcGxheS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQge1xuXHRnZXRDbGF1ZGVDb25maXJtYXRpb25UaXRsZSxcblx0Z2V0Q2xhdWRlSW52b2NhdGlvbk1lc3NhZ2UsXG5cdGdldENsYXVkZVBhc3RUZW5zZU1lc3NhZ2UsXG5cdGdldENsYXVkZVBlcm1pc3Npb25LaW5kLFxuXHRnZXRDbGF1ZGVTdHJlYW1pbmdJbnZvY2F0aW9uTWVzc2FnZSxcblx0Z2V0Q2xhdWRlVG9vbERpc3BsYXlOYW1lLFxuXHRnZXRDbGF1ZGVUb29sSW5wdXRTdHJpbmcsXG5cdGdldENsYXVkZVRvb2xLaW5kLFxuXHRnZXRDbGF1ZGVUb29sUGF0aCxcblx0SU5URVJBQ1RJVkVfQ0xBVURFX1RPT0xTLFxuXHRidWlsZENsYXVkZVRvb2xNZXRhLFxuXHRpc0NsYXVkZUZpbGVFZGl0VG9vbCxcbn0gZnJvbSAnLi4vLi4vbm9kZS9jbGF1ZGUvY2xhdWRlVG9vbERpc3BsYXkuanMnO1xuXG4vKipcbiAqIFB1cmUtZGF0YSBzbmFwc2hvdCB0ZXN0cyBmb3IgW2NsYXVkZVRvb2xEaXNwbGF5LnRzXSguLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVUb29sRGlzcGxheS50cykuXG4gKiBQaGFzZSA3IHBsYW4gXHUwMEE3NDogZXZlcnkgY2VsbCBvZiB0aGUgbWFwcGluZyB0YWJsZSBtdXN0IGJlIHJlYWNoYWJsZVxuICogZnJvbSBvbmUgYXNzZXJ0aW9uLiBUaGUgc25hcHNob3QgbGl2ZXMgaGVyZSwgbm90IGluIGEgZml4dHVyZSBmaWxlLFxuICogc28gZnV0dXJlIHJlbmFtZXMgZmxvdyB0aHJvdWdoIGNvbXBpbGUtY2hlY2tzLlxuICovXG5zdWl0ZSgnY2xhdWRlVG9vbERpc3BsYXkgXHUyMDE0IFx1MDBBNzQgbWFwcGluZyB0YWJsZScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtYXBwaW5nIHNuYXBzaG90IGNvdmVycyBldmVyeSBQaGFzZSA3IFx1MDBBNzQgcm93JywgKCkgPT4ge1xuXHRcdGNvbnN0IFRPT0xTID0gW1xuXHRcdFx0J0Jhc2gnLCAnQmFzaE91dHB1dCcsICdLaWxsQmFzaCcsXG5cdFx0XHQnUmVhZCcsICdHbG9iJywgJ0dyZXAnLCAnTFMnLCAnTm90ZWJvb2tSZWFkJyxcblx0XHRcdCdXcml0ZScsICdFZGl0JywgJ011bHRpRWRpdCcsICdOb3RlYm9va0VkaXQnLCAnVG9kb1dyaXRlJyxcblx0XHRcdCdXZWJGZXRjaCcsICdUYXNrJyxcblx0XHRcdCdFeGl0UGxhbk1vZGUnLCAnQXNrVXNlclF1ZXN0aW9uJyxcblx0XHRcdCdTa2lsbCcsICdUYXNrQ3JlYXRlJywgJ1Rhc2tVcGRhdGUnLCAnVGFza0xpc3QnLCAnVGFza0dldCcsXG5cdFx0XSBhcyBjb25zdDtcblxuXHRcdGNvbnN0IHNuYXBzaG90ID0gVE9PTFMubWFwKHQgPT4gW3QsIGdldENsYXVkZVBlcm1pc3Npb25LaW5kKHQpLCBnZXRDbGF1ZGVUb29sRGlzcGxheU5hbWUodCldIGFzIGNvbnN0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QsIFtcblx0XHRcdFsnQmFzaCcsICdzaGVsbCcsICdSdW4gc2hlbGwgY29tbWFuZCddLFxuXHRcdFx0WydCYXNoT3V0cHV0JywgJ3NoZWxsJywgJ1JlYWQgc2hlbGwgb3V0cHV0J10sXG5cdFx0XHRbJ0tpbGxCYXNoJywgJ3NoZWxsJywgJ0tpbGwgc2hlbGwgY29tbWFuZCddLFxuXHRcdFx0WydSZWFkJywgJ3JlYWQnLCAnUmVhZCBmaWxlJ10sXG5cdFx0XHRbJ0dsb2InLCAncmVhZCcsICdGaW5kIGZpbGVzJ10sXG5cdFx0XHRbJ0dyZXAnLCAncmVhZCcsICdTZWFyY2ggZmlsZXMnXSxcblx0XHRcdFsnTFMnLCAncmVhZCcsICdMaXN0IGRpcmVjdG9yeSddLFxuXHRcdFx0WydOb3RlYm9va1JlYWQnLCAncmVhZCcsICdSZWFkIG5vdGVib29rJ10sXG5cdFx0XHRbJ1dyaXRlJywgJ3dyaXRlJywgJ1dyaXRlIGZpbGUnXSxcblx0XHRcdFsnRWRpdCcsICd3cml0ZScsICdFZGl0IGZpbGUnXSxcblx0XHRcdFsnTXVsdGlFZGl0JywgJ3dyaXRlJywgJ0VkaXQgZmlsZSddLFxuXHRcdFx0WydOb3RlYm9va0VkaXQnLCAnd3JpdGUnLCAnRWRpdCBub3RlYm9vayddLFxuXHRcdFx0WydUb2RvV3JpdGUnLCAnd3JpdGUnLCAnVXBkYXRlIHRvZG8gbGlzdCddLFxuXHRcdFx0WydXZWJGZXRjaCcsICd1cmwnLCAnRmV0Y2ggVVJMJ10sXG5cdFx0XHRbJ1Rhc2snLCAnY3VzdG9tLXRvb2wnLCAnUnVuIHN1YmFnZW50IHRhc2snXSxcblx0XHRcdFsnRXhpdFBsYW5Nb2RlJywgJ2N1c3RvbS10b29sJywgJ1JlYWR5IHRvIGNvZGU/J10sXG5cdFx0XHRbJ0Fza1VzZXJRdWVzdGlvbicsICdjdXN0b20tdG9vbCcsICdBc2sgdXNlciBhIHF1ZXN0aW9uJ10sXG5cdFx0XHRbJ1NraWxsJywgJ3NraWxsJywgJ1J1biBza2lsbCddLFxuXHRcdFx0WydUYXNrQ3JlYXRlJywgJ2N1c3RvbS10b29sJywgJ0NyZWF0ZSB0YXNrJ10sXG5cdFx0XHRbJ1Rhc2tVcGRhdGUnLCAnY3VzdG9tLXRvb2wnLCAnVXBkYXRlIHRhc2snXSxcblx0XHRcdFsnVGFza0xpc3QnLCAnY3VzdG9tLXRvb2wnLCAnTGlzdCB0YXNrcyddLFxuXHRcdFx0WydUYXNrR2V0JywgJ2N1c3RvbS10b29sJywgJ1JlYWQgdGFzayddLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtY3BfXy1wcmVmaXhlZCB0b29sIG1hcHMgdG8gbWNwIC8gc3RyaXBzIHByZWZpeCBpbiBkaXNwbGF5TmFtZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W1xuXHRcdFx0XHRnZXRDbGF1ZGVQZXJtaXNzaW9uS2luZCgnbWNwX19naXRodWJfX2xpc3RJc3N1ZXMnKSxcblx0XHRcdFx0Z2V0Q2xhdWRlVG9vbERpc3BsYXlOYW1lKCdtY3BfX2dpdGh1Yl9fbGlzdElzc3VlcycpLFxuXHRcdFx0XSxcblx0XHRcdFsnbWNwJywgJ1J1biBNQ1AgdG9vbCBnaXRodWJfX2xpc3RJc3N1ZXMnXSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmtub3duIHRvb2wgZGVmYXVsdHMgdG8gY3VzdG9tLXRvb2wgLyB0b29sTmFtZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W1xuXHRcdFx0XHRnZXRDbGF1ZGVQZXJtaXNzaW9uS2luZCgnU29tZU5ld1Rvb2wnKSxcblx0XHRcdFx0Z2V0Q2xhdWRlVG9vbERpc3BsYXlOYW1lKCdTb21lTmV3VG9vbCcpLFxuXHRcdFx0XSxcblx0XHRcdFsnY3VzdG9tLXRvb2wnLCAnU29tZU5ld1Rvb2wnXSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRDbGF1ZGVUb29sUGF0aCBzbmFwc2hvdCBmb3IgcGF0aC1iZWFyaW5nIHRvb2xzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHJlYWQ6IGdldENsYXVkZVRvb2xQYXRoKCdSZWFkJywgeyBmaWxlX3BhdGg6ICcvdG1wL2EnIH0pLFxuXHRcdFx0XHR3cml0ZTogZ2V0Q2xhdWRlVG9vbFBhdGgoJ1dyaXRlJywgeyBmaWxlX3BhdGg6ICcvdG1wL2InIH0pLFxuXHRcdFx0XHRlZGl0OiBnZXRDbGF1ZGVUb29sUGF0aCgnRWRpdCcsIHsgZmlsZV9wYXRoOiAnL3RtcC9jJyB9KSxcblx0XHRcdFx0bXVsdGlFZGl0OiBnZXRDbGF1ZGVUb29sUGF0aCgnTXVsdGlFZGl0JywgeyBmaWxlX3BhdGg6ICcvdG1wL2QnIH0pLFxuXHRcdFx0XHRub3RlYm9va1JlYWQ6IGdldENsYXVkZVRvb2xQYXRoKCdOb3RlYm9va1JlYWQnLCB7IG5vdGVib29rX3BhdGg6ICcvdG1wL2UuaXB5bmInIH0pLFxuXHRcdFx0XHRub3RlYm9va0VkaXQ6IGdldENsYXVkZVRvb2xQYXRoKCdOb3RlYm9va0VkaXQnLCB7IG5vdGVib29rX3BhdGg6ICcvdG1wL2YuaXB5bmInIH0pLFxuXHRcdFx0XHRnbG9iOiBnZXRDbGF1ZGVUb29sUGF0aCgnR2xvYicsIHsgcGF0aDogJy90bXAvZycsIHBhdHRlcm46ICcqJyB9KSxcblx0XHRcdFx0Z3JlcDogZ2V0Q2xhdWRlVG9vbFBhdGgoJ0dyZXAnLCB7IHBhdGg6ICcvdG1wL2gnLCBwYXR0ZXJuOiAnZm9vJyB9KSxcblx0XHRcdFx0bHM6IGdldENsYXVkZVRvb2xQYXRoKCdMUycsIHsgcGF0aDogJy90bXAvaScgfSksXG5cdFx0XHRcdHdlYkZldGNoOiBnZXRDbGF1ZGVUb29sUGF0aCgnV2ViRmV0Y2gnLCB7IHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20nIH0pLFxuXHRcdFx0XHRiYXNoOiBnZXRDbGF1ZGVUb29sUGF0aCgnQmFzaCcsIHsgY29tbWFuZDogJ2xzJyB9KSxcblx0XHRcdFx0dG9kb1dyaXRlOiBnZXRDbGF1ZGVUb29sUGF0aCgnVG9kb1dyaXRlJywgeyB0b2RvczogW10gfSksXG5cdFx0XHRcdHdyb25nVHlwZVJlYWQ6IGdldENsYXVkZVRvb2xQYXRoKCdSZWFkJywgeyBmaWxlX3BhdGg6IDQyIH0pLFxuXHRcdFx0XHRtaXNzaW5nUmVhZDogZ2V0Q2xhdWRlVG9vbFBhdGgoJ1JlYWQnLCB7fSksXG5cdFx0XHRcdG5vbk9iamVjdDogZ2V0Q2xhdWRlVG9vbFBhdGgoJ1dyaXRlJywgbnVsbCksXG5cdFx0XHRcdHVua25vd25Ub29sOiBnZXRDbGF1ZGVUb29sUGF0aCgnU29tZU5ld1Rvb2wnLCB7IGZpbGVfcGF0aDogJy90bXAveCcgfSksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRyZWFkOiAnL3RtcC9hJyxcblx0XHRcdFx0d3JpdGU6ICcvdG1wL2InLFxuXHRcdFx0XHRlZGl0OiAnL3RtcC9jJyxcblx0XHRcdFx0bXVsdGlFZGl0OiAnL3RtcC9kJyxcblx0XHRcdFx0bm90ZWJvb2tSZWFkOiAnL3RtcC9lLmlweW5iJyxcblx0XHRcdFx0bm90ZWJvb2tFZGl0OiAnL3RtcC9mLmlweW5iJyxcblx0XHRcdFx0Z2xvYjogJy90bXAvZycsXG5cdFx0XHRcdGdyZXA6ICcvdG1wL2gnLFxuXHRcdFx0XHRsczogJy90bXAvaScsXG5cdFx0XHRcdHdlYkZldGNoOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRcdGJhc2g6IHVuZGVmaW5lZCxcblx0XHRcdFx0dG9kb1dyaXRlOiB1bmRlZmluZWQsXG5cdFx0XHRcdHdyb25nVHlwZVJlYWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0bWlzc2luZ1JlYWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0bm9uT2JqZWN0OiB1bmRlZmluZWQsXG5cdFx0XHRcdHVua25vd25Ub29sOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0lOVEVSQUNUSVZFX0NMQVVERV9UT09MUyBjb250YWlucyBleGFjdGx5IHRoZSB1c2VyLWlucHV0IHJvdW5kLXRyaXAgdG9vbHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFsuLi5JTlRFUkFDVElWRV9DTEFVREVfVE9PTFNdLnNvcnQoKSxcblx0XHRcdFsnQXNrVXNlclF1ZXN0aW9uJywgJ0V4aXRQbGFuTW9kZSddLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENsYXVkZUNvbmZpcm1hdGlvblRpdGxlIHJldHVybnMgcGVyLXBlcm1pc3Npb25LaW5kIGxvY2FsaXplZCB0aXRsZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRzaGVsbDogZ2V0Q2xhdWRlQ29uZmlybWF0aW9uVGl0bGUoJ0Jhc2gnKSxcblx0XHRcdFx0d3JpdGU6IGdldENsYXVkZUNvbmZpcm1hdGlvblRpdGxlKCdXcml0ZScpLFxuXHRcdFx0XHRyZWFkOiBnZXRDbGF1ZGVDb25maXJtYXRpb25UaXRsZSgnUmVhZCcpLFxuXHRcdFx0XHR1cmw6IGdldENsYXVkZUNvbmZpcm1hdGlvblRpdGxlKCdXZWJGZXRjaCcpLFxuXHRcdFx0XHRtY3BXaXRoU2VydmVyOiBnZXRDbGF1ZGVDb25maXJtYXRpb25UaXRsZSgnbWNwX19naXRodWJfX2xpc3RJc3N1ZXMnKSxcblx0XHRcdFx0Y3VzdG9tOiBnZXRDbGF1ZGVDb25maXJtYXRpb25UaXRsZSgnVGFzaycpLFxuXHRcdFx0XHRza2lsbDogZ2V0Q2xhdWRlQ29uZmlybWF0aW9uVGl0bGUoJ1NraWxsJyksXG5cdFx0XHRcdHVua25vd246IGdldENsYXVkZUNvbmZpcm1hdGlvblRpdGxlKCdTb21lTmV3VG9vbCcpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0c2hlbGw6ICdSdW4gaW4gdGVybWluYWw/Jyxcblx0XHRcdFx0d3JpdGU6ICdFZGl0IGZpbGU/Jyxcblx0XHRcdFx0cmVhZDogJ1JlYWQgZmlsZT8nLFxuXHRcdFx0XHR1cmw6ICdGZXRjaCBVUkw/Jyxcblx0XHRcdFx0bWNwV2l0aFNlcnZlcjogJ0FsbG93IHRvb2wgZnJvbSBnaXRodWI/Jyxcblx0XHRcdFx0Y3VzdG9tOiAnQWxsb3cgdG9vbCBjYWxsPycsXG5cdFx0XHRcdHNraWxsOiAnUnVuIHNraWxsPycsXG5cdFx0XHRcdHVua25vd246ICdBbGxvdyB0b29sIGNhbGw/Jyxcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnUGhhc2UgOCBcdTIwMTQgaXNDbGF1ZGVGaWxlRWRpdFRvb2wgY292ZXJzIFdyaXRlL0VkaXQvTXVsdGlFZGl0L05vdGVib29rRWRpdCwgZXhjbHVkZXMgVG9kb1dyaXRlL0Jhc2gvb3RoZXJzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdFdyaXRlOiBpc0NsYXVkZUZpbGVFZGl0VG9vbCgnV3JpdGUnKSxcblx0XHRcdFx0RWRpdDogaXNDbGF1ZGVGaWxlRWRpdFRvb2woJ0VkaXQnKSxcblx0XHRcdFx0TXVsdGlFZGl0OiBpc0NsYXVkZUZpbGVFZGl0VG9vbCgnTXVsdGlFZGl0JyksXG5cdFx0XHRcdE5vdGVib29rRWRpdDogaXNDbGF1ZGVGaWxlRWRpdFRvb2woJ05vdGVib29rRWRpdCcpLFxuXHRcdFx0XHRUb2RvV3JpdGU6IGlzQ2xhdWRlRmlsZUVkaXRUb29sKCdUb2RvV3JpdGUnKSxcblx0XHRcdFx0UmVhZDogaXNDbGF1ZGVGaWxlRWRpdFRvb2woJ1JlYWQnKSxcblx0XHRcdFx0QmFzaDogaXNDbGF1ZGVGaWxlRWRpdFRvb2woJ0Jhc2gnKSxcblx0XHRcdFx0dW5rbm93bjogaXNDbGF1ZGVGaWxlRWRpdFRvb2woJ1NvbWVOZXdUb29sJyksXG5cdFx0XHRcdG1jcDogaXNDbGF1ZGVGaWxlRWRpdFRvb2woJ21jcF9fc2VydmVyX19lZGl0JyksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRXcml0ZTogdHJ1ZSxcblx0XHRcdFx0RWRpdDogdHJ1ZSxcblx0XHRcdFx0TXVsdGlFZGl0OiB0cnVlLFxuXHRcdFx0XHROb3RlYm9va0VkaXQ6IHRydWUsXG5cdFx0XHRcdFRvZG9Xcml0ZTogZmFsc2UsXG5cdFx0XHRcdFJlYWQ6IGZhbHNlLFxuXHRcdFx0XHRCYXNoOiBmYWxzZSxcblx0XHRcdFx0dW5rbm93bjogZmFsc2UsXG5cdFx0XHRcdG1jcDogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmVhbXMgcmljaCBmaWxlIGFuZCBsaW5lLWNvdW50IG1lc3NhZ2VzIGZvciBDbGF1ZGUgZWRpdCB0b29scycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdyaXRlOiBnZXRDbGF1ZGVTdHJlYW1pbmdJbnZvY2F0aW9uTWVzc2FnZSgnV3JpdGUnLCB7XG5cdFx0XHRcdGZpbGVfcGF0aDogJy9zcmMvbmV3LnRzJyxcblx0XHRcdFx0Y29udGVudDogJ29uZVxcclxcbnR3b1xcclxcbnRocmVlJyxcblx0XHRcdH0pLFxuXHRcdFx0ZWRpdDogZ2V0Q2xhdWRlU3RyZWFtaW5nSW52b2NhdGlvbk1lc3NhZ2UoJ0VkaXQnLCB7XG5cdFx0XHRcdGZpbGVfcGF0aDogJy9zcmMvZm9vLnRzJyxcblx0XHRcdFx0b2xkX3N0cmluZzogJ29uZScsXG5cdFx0XHRcdG5ld19zdHJpbmc6ICdvbmVcXG50d28nLFxuXHRcdFx0fSksXG5cdFx0XHRtdWx0aUVkaXQ6IGdldENsYXVkZVN0cmVhbWluZ0ludm9jYXRpb25NZXNzYWdlKCdNdWx0aUVkaXQnLCB7XG5cdFx0XHRcdGZpbGVfcGF0aDogJy9zcmMvZm9vLnRzJyxcblx0XHRcdFx0ZWRpdHM6IFtcblx0XHRcdFx0XHR7IG9sZF9zdHJpbmc6ICdvbmUnLCBuZXdfc3RyaW5nOiAnb25lXFxudHdvJyB9LFxuXHRcdFx0XHRcdHsgb2xkX3N0cmluZzogJ3RocmVlXFxuZm91cicsIG5ld19zdHJpbmc6ICd1cGRhdGVkJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSksXG5cdFx0XHRub3RlYm9va0VkaXQ6IGdldENsYXVkZVN0cmVhbWluZ0ludm9jYXRpb25NZXNzYWdlKCdOb3RlYm9va0VkaXQnLCB7XG5cdFx0XHRcdG5vdGVib29rX3BhdGg6ICcvc3JjL25vdGVib29rLmlweW5iJyxcblx0XHRcdFx0bmV3X3NvdXJjZTogJ29uZVxcbnR3bycsXG5cdFx0XHR9KSxcblx0XHRcdHJlYWQ6IGdldENsYXVkZVN0cmVhbWluZ0ludm9jYXRpb25NZXNzYWdlKCdSZWFkJywgeyBmaWxlX3BhdGg6ICcvc3JjL2Zvby50cycgfSksXG5cdFx0fSwge1xuXHRcdFx0d3JpdGU6IHsgbWFya2Rvd246ICdDcmVhdGluZyBbbmV3LnRzXShmaWxlOi8vL3NyYy9uZXcudHMpICgzIGxpbmVzKScgfSxcblx0XHRcdGVkaXQ6IHsgbWFya2Rvd246ICdSZXBsYWNpbmcgMSBsaW5lIHdpdGggMiBsaW5lcyBpbiBbZm9vLnRzXShmaWxlOi8vL3NyYy9mb28udHMpJyB9LFxuXHRcdFx0bXVsdGlFZGl0OiB7IG1hcmtkb3duOiAnUmVwbGFjaW5nIDMgbGluZXMgd2l0aCAzIGxpbmVzIGluIFtmb28udHNdKGZpbGU6Ly8vc3JjL2Zvby50cyknIH0sXG5cdFx0XHRub3RlYm9va0VkaXQ6IHsgbWFya2Rvd246ICdFZGl0aW5nIDIgbGluZXMgaW4gW25vdGVib29rLmlweW5iXShmaWxlOi8vL3NyYy9ub3RlYm9vay5pcHluYiknIH0sXG5cdFx0XHRyZWFkOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1BoYXNlIDguNSBcdTIwMTQgcmljaCByZW5kZXJpbmcgc25hcHNob3QgY292ZXJzIGV2ZXJ5IHRvb2wgcm93JywgKCkgPT4ge1xuXHRcdGNvbnN0IFNBTVBMRV9JTlBVVDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7XG5cdFx0XHRCYXNoOiB7IGNvbW1hbmQ6ICdnaXQgc3RhdHVzJyB9LFxuXHRcdFx0QmFzaE91dHB1dDogeyBiYXNoX2lkOiAnYjEnIH0sXG5cdFx0XHRLaWxsQmFzaDogeyBiYXNoX2lkOiAnYjEnIH0sXG5cdFx0XHRSZWFkOiB7IGZpbGVfcGF0aDogJy9zcmMvZm9vLnRzJyB9LFxuXHRcdFx0R2xvYjogeyBwYXR0ZXJuOiAnKiovKi50cycgfSxcblx0XHRcdEdyZXA6IHsgcGF0dGVybjogJ0lDbGF1ZGVBZ2VudFNlc3Npb24nIH0sXG5cdFx0XHRMUzogeyBwYXRoOiAnL3NyYycgfSxcblx0XHRcdE5vdGVib29rUmVhZDogeyBub3RlYm9va19wYXRoOiAnL25iLmlweW5iJyB9LFxuXHRcdFx0V3JpdGU6IHsgZmlsZV9wYXRoOiAnL3NyYy9mb28udHMnLCBjb250ZW50OiAnLi4uJyB9LFxuXHRcdFx0RWRpdDogeyBmaWxlX3BhdGg6ICcvc3JjL2Zvby50cycsIG9sZF9zdHJpbmc6ICdhJywgbmV3X3N0cmluZzogJ2InIH0sXG5cdFx0XHRNdWx0aUVkaXQ6IHsgZmlsZV9wYXRoOiAnL3NyYy9mb28udHMnLCBlZGl0czogW10gfSxcblx0XHRcdE5vdGVib29rRWRpdDogeyBub3RlYm9va19wYXRoOiAnL25iLmlweW5iJyB9LFxuXHRcdFx0VG9kb1dyaXRlOiB7IHRvZG9zOiBbXSB9LFxuXHRcdFx0V2ViRmV0Y2g6IHsgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScgfSxcblx0XHRcdFRhc2s6IHsgZGVzY3JpcHRpb246ICdmaW5kIHRoZSBidWcnLCBzdWJhZ2VudF90eXBlOiAnRXhwbG9yZScgfSxcblx0XHRcdEV4aXRQbGFuTW9kZTogeyBwbGFuOiAnLi4uJyB9LFxuXHRcdFx0QXNrVXNlclF1ZXN0aW9uOiB7IHF1ZXN0aW9uOiAnd2h5PycgfSxcblx0XHRcdFNraWxsOiB7IHNraWxsOiAnZGVlcC1yZXNlYXJjaCcsIGFyZ3M6ICdmb28nIH0sXG5cdFx0XHRUYXNrQ3JlYXRlOiB7IHN1YmplY3Q6ICdGaXggYXV0aCBidWcnLCBkZXNjcmlwdGlvbjogJy4uLicgfSxcblx0XHRcdFRhc2tVcGRhdGU6IHsgdGFza0lkOiAnMScsIHN0YXR1czogJ2NvbXBsZXRlZCcgfSxcblx0XHRcdFRhc2tMaXN0OiB7fSxcblx0XHRcdFRhc2tHZXQ6IHsgdGFza0lkOiAnMScgfSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgVE9PTFMgPSBPYmplY3Qua2V5cyhTQU1QTEVfSU5QVVQpIGFzIHJlYWRvbmx5IChrZXlvZiB0eXBlb2YgU0FNUExFX0lOUFVUKVtdO1xuXG5cdFx0Y29uc3Qgc25hcHNob3QgPSBUT09MUy5tYXAodCA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFNBTVBMRV9JTlBVVFt0XTtcblx0XHRcdGNvbnN0IGRpc3BsYXlOYW1lID0gZ2V0Q2xhdWRlVG9vbERpc3BsYXlOYW1lKHQpO1xuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0dCxcblx0XHRcdFx0Z2V0Q2xhdWRlVG9vbEtpbmQodCksXG5cdFx0XHRcdGJ1aWxkQ2xhdWRlVG9vbE1ldGEodCksXG5cdFx0XHRcdGdldENsYXVkZUludm9jYXRpb25NZXNzYWdlKHQsIGRpc3BsYXlOYW1lLCBpbnB1dCksXG5cdFx0XHRcdGdldENsYXVkZVBhc3RUZW5zZU1lc3NhZ2UodCwgZGlzcGxheU5hbWUsIGlucHV0LCB0cnVlKSxcblx0XHRcdFx0Z2V0Q2xhdWRlUGFzdFRlbnNlTWVzc2FnZSh0LCBkaXNwbGF5TmFtZSwgaW5wdXQsIGZhbHNlKSxcblx0XHRcdFx0Z2V0Q2xhdWRlVG9vbElucHV0U3RyaW5nKHQsIGlucHV0KSxcblx0XHRcdF0gYXMgY29uc3Q7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90LCBbXG5cdFx0XHRbJ0Jhc2gnLCAndGVybWluYWwnLCB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sIHsgbWFya2Rvd246ICdSdW5uaW5nIGBnaXQgc3RhdHVzYCcgfSwgeyBtYXJrZG93bjogJ1JhbiBgZ2l0IHN0YXR1c2AnIH0sICdcIlJ1biBzaGVsbCBjb21tYW5kXCIgZmFpbGVkJywgJ2dpdCBzdGF0dXMnXSxcblx0XHRcdFsnQmFzaE91dHB1dCcsICd0ZXJtaW5hbCcsIHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSwgJ1JlYWRpbmcgc2hlbGwgb3V0cHV0JywgJ1JlYWQgc2hlbGwgb3V0cHV0JywgJ1wiUmVhZCBzaGVsbCBvdXRwdXRcIiBmYWlsZWQnLCAne1xcbiAgXCJiYXNoX2lkXCI6IFwiYjFcIlxcbn0nXSxcblx0XHRcdFsnS2lsbEJhc2gnLCAndGVybWluYWwnLCB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sICdLaWxsIHNoZWxsIGNvbW1hbmQnLCAnS2lsbCBzaGVsbCBjb21tYW5kJywgJ1wiS2lsbCBzaGVsbCBjb21tYW5kXCIgZmFpbGVkJywgJ3tcXG4gIFwiYmFzaF9pZFwiOiBcImIxXCJcXG59J10sXG5cdFx0XHRbJ1JlYWQnLCAncmVhZCcsIHsgdG9vbEtpbmQ6ICdyZWFkJyB9LCB7IG1hcmtkb3duOiAnUmVhZCBbZm9vLnRzXShmaWxlOi8vL3NyYy9mb28udHMpJyB9LCB7IG1hcmtkb3duOiAnUmVhZCBbZm9vLnRzXShmaWxlOi8vL3NyYy9mb28udHMpJyB9LCAnXCJSZWFkIGZpbGVcIiBmYWlsZWQnLCAne1xcbiAgXCJmaWxlX3BhdGhcIjogXCIvc3JjL2Zvby50c1wiXFxufSddLFxuXHRcdFx0WydHbG9iJywgJ3NlYXJjaCcsIHsgdG9vbEtpbmQ6ICdzZWFyY2gnIH0sIHsgbWFya2Rvd246ICdGaW5kIGZpbGVzIG1hdGNoaW5nIGAqKi8qLnRzYCcgfSwgeyBtYXJrZG93bjogJ0ZpbmQgZmlsZXMgbWF0Y2hpbmcgYCoqLyoudHNgJyB9LCAnXCJGaW5kIGZpbGVzXCIgZmFpbGVkJywgJyoqLyoudHMnXSxcblx0XHRcdFsnR3JlcCcsICdzZWFyY2gnLCB7IHRvb2xLaW5kOiAnc2VhcmNoJyB9LCB7IG1hcmtkb3duOiAnU2VhcmNoIGZvciBgSUNsYXVkZUFnZW50U2Vzc2lvbmAnIH0sIHsgbWFya2Rvd246ICdTZWFyY2ggZm9yIGBJQ2xhdWRlQWdlbnRTZXNzaW9uYCcgfSwgJ1wiU2VhcmNoIGZpbGVzXCIgZmFpbGVkJywgJ0lDbGF1ZGVBZ2VudFNlc3Npb24nXSxcblx0XHRcdFsnTFMnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgeyBtYXJrZG93bjogJ0xpc3QgW3NyY10oZmlsZTovLy9zcmMpJyB9LCB7IG1hcmtkb3duOiAnTGlzdCBbc3JjXShmaWxlOi8vL3NyYyknIH0sICdcIkxpc3QgZGlyZWN0b3J5XCIgZmFpbGVkJywgJ3tcXG4gIFwicGF0aFwiOiBcIi9zcmNcIlxcbn0nXSxcblx0XHRcdFsnTm90ZWJvb2tSZWFkJywgJ3JlYWQnLCB7IHRvb2xLaW5kOiAncmVhZCcgfSwgeyBtYXJrZG93bjogJ1JlYWQgW25iLmlweW5iXShmaWxlOi8vL25iLmlweW5iKScgfSwgeyBtYXJrZG93bjogJ1JlYWQgW25iLmlweW5iXShmaWxlOi8vL25iLmlweW5iKScgfSwgJ1wiUmVhZCBub3RlYm9va1wiIGZhaWxlZCcsICd7XFxuICBcIm5vdGVib29rX3BhdGhcIjogXCIvbmIuaXB5bmJcIlxcbn0nXSxcblx0XHRcdFsnV3JpdGUnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgeyBtYXJrZG93bjogJ0VkaXQgW2Zvby50c10oZmlsZTovLy9zcmMvZm9vLnRzKScgfSwgeyBtYXJrZG93bjogJ0VkaXQgW2Zvby50c10oZmlsZTovLy9zcmMvZm9vLnRzKScgfSwgJ1wiV3JpdGUgZmlsZVwiIGZhaWxlZCcsICd7XFxuICBcImZpbGVfcGF0aFwiOiBcIi9zcmMvZm9vLnRzXCIsXFxuICBcImNvbnRlbnRcIjogXCIuLi5cIlxcbn0nXSxcblx0XHRcdFsnRWRpdCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB7IG1hcmtkb3duOiAnRWRpdCBbZm9vLnRzXShmaWxlOi8vL3NyYy9mb28udHMpJyB9LCB7IG1hcmtkb3duOiAnRWRpdCBbZm9vLnRzXShmaWxlOi8vL3NyYy9mb28udHMpJyB9LCAnXCJFZGl0IGZpbGVcIiBmYWlsZWQnLCAne1xcbiAgXCJmaWxlX3BhdGhcIjogXCIvc3JjL2Zvby50c1wiLFxcbiAgXCJvbGRfc3RyaW5nXCI6IFwiYVwiLFxcbiAgXCJuZXdfc3RyaW5nXCI6IFwiYlwiXFxufSddLFxuXHRcdFx0WydNdWx0aUVkaXQnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgeyBtYXJrZG93bjogJ0VkaXQgW2Zvby50c10oZmlsZTovLy9zcmMvZm9vLnRzKScgfSwgeyBtYXJrZG93bjogJ0VkaXQgW2Zvby50c10oZmlsZTovLy9zcmMvZm9vLnRzKScgfSwgJ1wiRWRpdCBmaWxlXCIgZmFpbGVkJywgJ3tcXG4gIFwiZmlsZV9wYXRoXCI6IFwiL3NyYy9mb28udHNcIixcXG4gIFwiZWRpdHNcIjogW11cXG59J10sXG5cdFx0XHRbJ05vdGVib29rRWRpdCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB7IG1hcmtkb3duOiAnRWRpdCBbbmIuaXB5bmJdKGZpbGU6Ly8vbmIuaXB5bmIpJyB9LCB7IG1hcmtkb3duOiAnRWRpdCBbbmIuaXB5bmJdKGZpbGU6Ly8vbmIuaXB5bmIpJyB9LCAnXCJFZGl0IG5vdGVib29rXCIgZmFpbGVkJywgJ3tcXG4gIFwibm90ZWJvb2tfcGF0aFwiOiBcIi9uYi5pcHluYlwiXFxufSddLFxuXHRcdFx0WydUb2RvV3JpdGUnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ1VwZGF0ZSB0b2RvIGxpc3QnLCAnVXBkYXRlIHRvZG8gbGlzdCcsICdcIlVwZGF0ZSB0b2RvIGxpc3RcIiBmYWlsZWQnLCAne1xcbiAgXCJ0b2Rvc1wiOiBbXVxcbn0nXSxcblx0XHRcdFsnV2ViRmV0Y2gnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgeyBtYXJrZG93bjogJ0ZldGNoaW5nIFtodHRwczovL2V4YW1wbGUuY29tXShodHRwczovL2V4YW1wbGUuY29tKScgfSwgeyBtYXJrZG93bjogJ0ZldGNoZWQgW2h0dHBzOi8vZXhhbXBsZS5jb21dKGh0dHBzOi8vZXhhbXBsZS5jb20pJyB9LCAnXCJGZXRjaCBVUkxcIiBmYWlsZWQnLCAne1xcbiAgXCJ1cmxcIjogXCJodHRwczovL2V4YW1wbGUuY29tXCJcXG59J10sXG5cdFx0XHRbJ1Rhc2snLCAnc3ViYWdlbnQnLCB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnIH0sICdmaW5kIHRoZSBidWcnLCAnUmFuIHN1YmFnZW50JywgJ1wiUnVuIHN1YmFnZW50IHRhc2tcIiBmYWlsZWQnLCAne1xcbiAgXCJkZXNjcmlwdGlvblwiOiBcImZpbmQgdGhlIGJ1Z1wiLFxcbiAgXCJzdWJhZ2VudF90eXBlXCI6IFwiRXhwbG9yZVwiXFxufSddLFxuXHRcdFx0WydFeGl0UGxhbk1vZGUnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ1JlYWR5IHRvIGNvZGU/JywgJ1JlYWR5IHRvIGNvZGU/JywgJ1wiUmVhZHkgdG8gY29kZT9cIiBmYWlsZWQnLCAne1xcbiAgXCJwbGFuXCI6IFwiLi4uXCJcXG59J10sXG5cdFx0XHRbJ0Fza1VzZXJRdWVzdGlvbicsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAnQXNrIHVzZXIgYSBxdWVzdGlvbicsICdBc2sgdXNlciBhIHF1ZXN0aW9uJywgJ1wiQXNrIHVzZXIgYSBxdWVzdGlvblwiIGZhaWxlZCcsICd7XFxuICBcInF1ZXN0aW9uXCI6IFwid2h5P1wiXFxufSddLFxuXHRcdFx0WydTa2lsbCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB7IG1hcmtkb3duOiAnUnVubmluZyBza2lsbCBgZGVlcC1yZXNlYXJjaGAnIH0sIHsgbWFya2Rvd246ICdSYW4gc2tpbGwgYGRlZXAtcmVzZWFyY2hgJyB9LCAnXCJSdW4gc2tpbGxcIiBmYWlsZWQnLCAne1xcbiAgXCJza2lsbFwiOiBcImRlZXAtcmVzZWFyY2hcIixcXG4gIFwiYXJnc1wiOiBcImZvb1wiXFxufSddLFxuXHRcdFx0WydUYXNrQ3JlYXRlJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsICdDcmVhdGUgdGFzazogRml4IGF1dGggYnVnJywgJ0NyZWF0ZSB0YXNrOiBGaXggYXV0aCBidWcnLCAnXCJDcmVhdGUgdGFza1wiIGZhaWxlZCcsICd7XFxuICBcInN1YmplY3RcIjogXCJGaXggYXV0aCBidWdcIixcXG4gIFwiZGVzY3JpcHRpb25cIjogXCIuLi5cIlxcbn0nXSxcblx0XHRcdFsnVGFza1VwZGF0ZScsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAnQ29tcGxldGUgdGFzaycsICdDb21wbGV0ZSB0YXNrJywgJ1wiVXBkYXRlIHRhc2tcIiBmYWlsZWQnLCAne1xcbiAgXCJ0YXNrSWRcIjogXCIxXCIsXFxuICBcInN0YXR1c1wiOiBcImNvbXBsZXRlZFwiXFxufSddLFxuXHRcdFx0WydUYXNrTGlzdCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAnUmVhZCB0YXNrIGxpc3QnLCAnUmVhZCB0YXNrIGxpc3QnLCAnXCJMaXN0IHRhc2tzXCIgZmFpbGVkJywgJ3t9J10sXG5cdFx0XHRbJ1Rhc2tHZXQnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ1JlYWQgdGFzaycsICdSZWFkIHRhc2snLCAnXCJSZWFkIHRhc2tcIiBmYWlsZWQnLCAne1xcbiAgXCJ0YXNrSWRcIjogXCIxXCJcXG59J10sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1BoYXNlIDguNSBcdTIwMTQgVGFza1VwZGF0ZSBtZXNzYWdlIHZhcmllcyBieSBzdGF0dXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW52b2tlID0gKHN0YXR1cz86IHN0cmluZykgPT5cblx0XHRcdGdldENsYXVkZUludm9jYXRpb25NZXNzYWdlKCdUYXNrVXBkYXRlJywgJ1VwZGF0ZSB0YXNrJywgc3RhdHVzID8geyB0YXNrSWQ6ICcxJywgc3RhdHVzIH0gOiB7IHRhc2tJZDogJzEnIH0pO1xuXHRcdGNvbnN0IHBhc3QgPSAoc3RhdHVzPzogc3RyaW5nKSA9PlxuXHRcdFx0Z2V0Q2xhdWRlUGFzdFRlbnNlTWVzc2FnZSgnVGFza1VwZGF0ZScsICdVcGRhdGUgdGFzaycsIHN0YXR1cyA/IHsgdGFza0lkOiAnMScsIHN0YXR1cyB9IDogeyB0YXNrSWQ6ICcxJyB9LCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRzdGFydEludm9rZTogaW52b2tlKCdpbl9wcm9ncmVzcycpLFxuXHRcdFx0XHRzdGFydFBhc3Q6IHBhc3QoJ2luX3Byb2dyZXNzJyksXG5cdFx0XHRcdGNvbXBsZXRlSW52b2tlOiBpbnZva2UoJ2NvbXBsZXRlZCcpLFxuXHRcdFx0XHRjb21wbGV0ZVBhc3Q6IHBhc3QoJ2NvbXBsZXRlZCcpLFxuXHRcdFx0XHRkZWxldGVJbnZva2U6IGludm9rZSgnZGVsZXRlZCcpLFxuXHRcdFx0XHRkZWxldGVQYXN0OiBwYXN0KCdkZWxldGVkJyksXG5cdFx0XHRcdG5vU3RhdHVzSW52b2tlOiBpbnZva2UoKSxcblx0XHRcdFx0bm9TdGF0dXNQYXN0OiBwYXN0KCksXG5cdFx0XHRcdHVua25vd25TdGF0dXNJbnZva2U6IGludm9rZSgnYm9ndXMnKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHN0YXJ0SW52b2tlOiAnU3RhcnQgdGFzaycsXG5cdFx0XHRcdHN0YXJ0UGFzdDogJ1N0YXJ0IHRhc2snLFxuXHRcdFx0XHRjb21wbGV0ZUludm9rZTogJ0NvbXBsZXRlIHRhc2snLFxuXHRcdFx0XHRjb21wbGV0ZVBhc3Q6ICdDb21wbGV0ZSB0YXNrJyxcblx0XHRcdFx0ZGVsZXRlSW52b2tlOiAnRGVsZXRlIHRhc2snLFxuXHRcdFx0XHRkZWxldGVQYXN0OiAnRGVsZXRlIHRhc2snLFxuXHRcdFx0XHRub1N0YXR1c0ludm9rZTogJ1VwZGF0ZSB0YXNrJyxcblx0XHRcdFx0bm9TdGF0dXNQYXN0OiAnVXBkYXRlIHRhc2snLFxuXHRcdFx0XHR1bmtub3duU3RhdHVzSW52b2tlOiAnVXBkYXRlIHRhc2snLFxuXHRcdFx0fSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdQaGFzZSA4LjUgXHUyMDE0IGRlZmVuc2l2ZSBpbnB1dCBoYW5kbGluZyBmYWxscyBiYWNrIHRvIHN0YXRpYyBkaXNwbGF5IHN0cmluZ3MnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0YmFzaE5vQ29tbWFuZDogZ2V0Q2xhdWRlSW52b2NhdGlvbk1lc3NhZ2UoJ0Jhc2gnLCAnUnVuIHNoZWxsIGNvbW1hbmQnLCB7fSksXG5cdFx0XHRcdGJhc2hXcm9uZ1R5cGU6IGdldENsYXVkZUludm9jYXRpb25NZXNzYWdlKCdCYXNoJywgJ1J1biBzaGVsbCBjb21tYW5kJywgeyBjb21tYW5kOiA0MiB9KSxcblx0XHRcdFx0cmVhZE1pc3NpbmdQYXRoOiBnZXRDbGF1ZGVJbnZvY2F0aW9uTWVzc2FnZSgnUmVhZCcsICdSZWFkIGZpbGUnLCB7fSksXG5cdFx0XHRcdGdyZXBNaXNzaW5nUGF0dGVybjogZ2V0Q2xhdWRlSW52b2NhdGlvbk1lc3NhZ2UoJ0dyZXAnLCAnU2VhcmNoIGZpbGVzJywge30pLFxuXHRcdFx0XHRub25PYmplY3RJbnB1dDogZ2V0Q2xhdWRlSW52b2NhdGlvbk1lc3NhZ2UoJ0Jhc2gnLCAnUnVuIHNoZWxsIGNvbW1hbmQnLCBudWxsKSxcblx0XHRcdFx0dW5kZWZpbmVkSW5wdXQ6IGdldENsYXVkZUludm9jYXRpb25NZXNzYWdlKCdCYXNoJywgJ1J1biBzaGVsbCBjb21tYW5kJywgdW5kZWZpbmVkKSxcblx0XHRcdFx0dGFza05vRGVzY3JpcHRpb246IGdldENsYXVkZUludm9jYXRpb25NZXNzYWdlKCdUYXNrJywgJ1J1biBzdWJhZ2VudCB0YXNrJywge30pLFxuXHRcdFx0XHRiYXNoRmFpbGVkOiBnZXRDbGF1ZGVQYXN0VGVuc2VNZXNzYWdlKCdCYXNoJywgJ1J1biBzaGVsbCBjb21tYW5kJywgeyBjb21tYW5kOiAneCcgfSwgZmFsc2UpLFxuXHRcdFx0XHRpbnB1dFN0cmluZ1VuZGVmaW5lZDogZ2V0Q2xhdWRlVG9vbElucHV0U3RyaW5nKCdCYXNoJywgdW5kZWZpbmVkKSxcblx0XHRcdFx0aW5wdXRTdHJpbmdCYXNoTm9Db21tYW5kOiBnZXRDbGF1ZGVUb29sSW5wdXRTdHJpbmcoJ0Jhc2gnLCB7fSksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRiYXNoTm9Db21tYW5kOiAnUnVubmluZyBzaGVsbCBjb21tYW5kJyxcblx0XHRcdFx0YmFzaFdyb25nVHlwZTogJ1J1bm5pbmcgc2hlbGwgY29tbWFuZCcsXG5cdFx0XHRcdHJlYWRNaXNzaW5nUGF0aDogJ1JlYWQgZmlsZScsXG5cdFx0XHRcdGdyZXBNaXNzaW5nUGF0dGVybjogJ1NlYXJjaCBmaWxlcycsXG5cdFx0XHRcdG5vbk9iamVjdElucHV0OiAnUnVubmluZyBzaGVsbCBjb21tYW5kJyxcblx0XHRcdFx0dW5kZWZpbmVkSW5wdXQ6ICdSdW5uaW5nIHNoZWxsIGNvbW1hbmQnLFxuXHRcdFx0XHR0YXNrTm9EZXNjcmlwdGlvbjogJ1J1biBzdWJhZ2VudCB0YXNrJyxcblx0XHRcdFx0YmFzaEZhaWxlZDogJ1wiUnVuIHNoZWxsIGNvbW1hbmRcIiBmYWlsZWQnLFxuXHRcdFx0XHRpbnB1dFN0cmluZ1VuZGVmaW5lZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRpbnB1dFN0cmluZ0Jhc2hOb0NvbW1hbmQ6ICd7fScsXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1BoYXNlIDguNSBcdTIwMTQgQWdlbnQgcm93IG1pcnJvcnMgVGFzayAoc3ViYWdlbnQga2luZCwgc2FtZSBkaXNwbGF5IG5hbWUpJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbXG5cdFx0XHRcdGdldENsYXVkZVRvb2xLaW5kKCdBZ2VudCcpLFxuXHRcdFx0XHRidWlsZENsYXVkZVRvb2xNZXRhKCdBZ2VudCcpLFxuXHRcdFx0XHRnZXRDbGF1ZGVUb29sRGlzcGxheU5hbWUoJ0FnZW50JyksXG5cdFx0XHRcdGdldENsYXVkZVBlcm1pc3Npb25LaW5kKCdBZ2VudCcpLFxuXHRcdFx0XHRnZXRDbGF1ZGVJbnZvY2F0aW9uTWVzc2FnZSgnQWdlbnQnLCBnZXRDbGF1ZGVUb29sRGlzcGxheU5hbWUoJ0FnZW50JyksIHsgZGVzY3JpcHRpb246ICdyZXZpZXcgdGhpcycgfSksXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnc3ViYWdlbnQnLFxuXHRcdFx0XHR7IHRvb2xLaW5kOiAnc3ViYWdlbnQnIH0sXG5cdFx0XHRcdCdSdW4gc3ViYWdlbnQgdGFzaycsXG5cdFx0XHRcdCdjdXN0b20tdG9vbCcsXG5cdFx0XHRcdCdyZXZpZXcgdGhpcycsXG5cdFx0XHRdLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1BoYXNlIDguNSBcdTIwMTQgTUNQIHRvb2xzIGhhdmUgbm8gdG9vbEtpbmQsIEpTT04gaW5wdXQgZmFsbGJhY2snLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0a2luZDogZ2V0Q2xhdWRlVG9vbEtpbmQoJ21jcF9fZ2l0aHViX19saXN0SXNzdWVzJyksXG5cdFx0XHRcdG1ldGE6IGJ1aWxkQ2xhdWRlVG9vbE1ldGEoJ21jcF9fZ2l0aHViX19saXN0SXNzdWVzJyksXG5cdFx0XHRcdGlucHV0U3RyaW5nOiBnZXRDbGF1ZGVUb29sSW5wdXRTdHJpbmcoJ21jcF9fZ2l0aHViX19saXN0SXNzdWVzJywgeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnIH0pLFxuXHRcdFx0XHRpbnZvY2F0aW9uOiBnZXRDbGF1ZGVJbnZvY2F0aW9uTWVzc2FnZSgnbWNwX19naXRodWJfX2xpc3RJc3N1ZXMnLCAnUnVuIE1DUCB0b29sIGdpdGh1Yl9fbGlzdElzc3VlcycsIHsgb3duZXI6ICdtaWNyb3NvZnQnIH0pLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0a2luZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRtZXRhOiB1bmRlZmluZWQsXG5cdFx0XHRcdGlucHV0U3RyaW5nOiAne1xcbiAgXCJvd25lclwiOiBcIm1pY3Jvc29mdFwiLFxcbiAgXCJyZXBvXCI6IFwidnNjb2RlXCJcXG59Jyxcblx0XHRcdFx0aW52b2NhdGlvbjogJ1J1biBNQ1AgdG9vbCBnaXRo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
