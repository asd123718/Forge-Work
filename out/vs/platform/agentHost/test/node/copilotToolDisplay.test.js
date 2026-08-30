import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { getEditFilePath, getEditFilePaths, getInvocationMessage, getPastTenseMessage, getPermissionDisplay, getShellIntention, getShellLanguage, getStreamingInvocationMessage, getToolDisplayName, getToolInputString, getToolKind, getToolMarkdownContent, isEditTool, isHiddenTool, isMarkdownRenderedTool, synthesizeSkillToolCall } from "../../node/copilot/copilotToolDisplay.js";
function shellPermissionRequest(fullCommandText, requestSandboxBypass) {
  return {
    kind: "shell",
    canOfferSessionApproval: false,
    commands: [],
    fullCommandText,
    hasWriteFileRedirection: false,
    intention: "",
    possiblePaths: [],
    possibleUrls: [],
    requestSandboxBypass
  };
}
function customToolPermissionRequest(toolName, args) {
  return {
    kind: "custom-tool",
    toolName,
    toolDescription: "",
    args
  };
}
suite("copilotToolDisplay \u2014 friendly tool names", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("mirrors internal Copilot CLI friendly labels for representative tools", () => {
    const cases = [
      ["bash", "Run Shell Command"],
      ["powershell", "Run Shell Command"],
      ["read_bash", "Read Terminal"],
      ["read_powershell", "Read Terminal"],
      ["write_bash", "Write to Bash"],
      ["write_powershell", "Write to PowerShell"],
      ["stop_bash", "Stop Terminal Session"],
      ["stop_powershell", "Stop Terminal Session"],
      ["bash_shutdown", "Stop Terminal Session"],
      ["powershell_shutdown", "Stop Terminal Session"],
      ["list_bash", "List Shell Sessions"],
      ["list_powershell", "List Shell Sessions"],
      ["view", "Read"],
      ["edit", "Edit File"],
      ["str_replace_editor", "Edit File"],
      ["str_replace", "Edit File"],
      ["insert", "Edit File"],
      ["create", "Create File"],
      ["grep", "Search"],
      ["rg", "Search"],
      ["glob", "Search"],
      ["search_code_subagent", "Search Code"],
      ["reply_to_comment", "Reply to Comment"],
      ["code_review", "Code Review"],
      ["think", "Thinking"],
      ["report_intent", "Report Intent"],
      ["report_progress", "Progress update"],
      ["web_fetch", "Fetch Web Content"],
      ["web_search", "Web Search"],
      ["update_todo", "Update Todo"],
      ["show_file", "Show File"],
      ["fetch_copilot_cli_documentation", "Fetch Documentation"],
      ["propose_work", "Propose Work"],
      ["task_complete", "Task Complete"],
      ["ask_user", "Ask User"],
      ["skill", "Invoke Skill"],
      ["task", "Delegate Task"],
      ["list_agents", "List Agents"],
      ["read_agent", "Read Agent"],
      ["exit_plan_mode", "Exit Plan Mode"],
      ["sql", "Execute SQL"],
      ["lsp", "Language Server"],
      ["create_pull_request", "Create Pull Request"],
      ["gh-advisory-database", "Check Dependencies"],
      ["store_memory", "Store Memory"],
      ["apply_patch", "Apply Patch"],
      ["write_agent", "Write to Agent"],
      ["mcp_reload", "Reload MCP Config"],
      ["mcp_validate", "Validate MCP Config"],
      ["tool_search_tool_regex", "Search Tools"],
      ["parallel_validation", "Validate Changes"],
      ["codeql_checker", "CodeQL Security Scan"],
      ["addComment", "Add Comment"],
      ["listComments", "List Comments"],
      ["deleteComments", "Delete Comments"],
      ["resolveComments", "Resolve Comments"],
      ["viewUnreviewedComments", "View Comments"]
    ];
    for (const [toolName, displayName] of cases) {
      assert.strictEqual(getToolDisplayName(toolName), displayName, toolName);
    }
  });
  test("falls back to the raw tool name for unknown tools", () => {
    assert.strictEqual(getToolDisplayName("some_new_tool"), "some_new_tool");
  });
});
suite("copilotToolDisplay \u2014 edit tool classification", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("classifies direct file edit tools", () => {
    for (const toolName of ["edit", "str_replace", "insert", "create", "apply_patch", "git_apply_patch"]) {
      assert.strictEqual(isEditTool(toolName), true, toolName);
    }
  });
  test("classifies str_replace_editor by command", () => {
    for (const command of ["edit", "str_replace", "insert", "create"]) {
      assert.strictEqual(isEditTool("str_replace_editor", command), true, command);
    }
    assert.strictEqual(isEditTool("str_replace_editor", "view"), false);
    assert.strictEqual(isEditTool("str_replace_editor", "unknown"), false);
    assert.strictEqual(isEditTool("str_replace_editor"), false);
  });
});
suite("copilotToolDisplay \u2014 markdown-rendered tools", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("task_complete renders as markdown, other tools do not", () => {
    assert.strictEqual(isMarkdownRenderedTool("task_complete"), true);
    assert.strictEqual(isMarkdownRenderedTool("bash"), false);
    assert.strictEqual(isMarkdownRenderedTool("report_intent"), false);
  });
  test("getToolMarkdownContent returns the task_complete summary when present", () => {
    assert.strictEqual(getToolMarkdownContent("task_complete", { summary: "All tests pass." }), "\n\n**Task completed:** All tests pass.");
  });
  test("getToolMarkdownContent returns undefined for empty, missing, or non-string summaries", () => {
    assert.strictEqual(getToolMarkdownContent("task_complete", { summary: "" }), void 0);
    assert.strictEqual(getToolMarkdownContent("task_complete", {}), void 0);
    assert.strictEqual(getToolMarkdownContent("task_complete", void 0), void 0);
    assert.strictEqual(getToolMarkdownContent("task_complete", { summary: 42 }), void 0);
  });
  test("getToolMarkdownContent returns undefined for non-markdown tools", () => {
    assert.strictEqual(getToolMarkdownContent("bash", { summary: "ignored" }), void 0);
  });
});
suite("getPermissionDisplay \u2014 cd-prefix stripping", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const wd = URI.file("/repo/project");
  test("strips redundant cd from shell permission request fullCommandText", () => {
    const request = shellPermissionRequest("cd /repo/project && npm test");
    const display = getPermissionDisplay(request, wd);
    assert.strictEqual(display.toolInput, "npm test");
    assert.strictEqual(display.permissionKind, "shell");
  });
  test("leaves shell command alone when cd target differs from working directory", () => {
    const request = shellPermissionRequest("cd /tmp && ls");
    const display = getPermissionDisplay(request, wd);
    assert.strictEqual(display.toolInput, "cd /tmp && ls");
  });
  test("leaves shell command alone when no working directory provided", () => {
    const request = shellPermissionRequest("cd /repo/project && npm test");
    const display = getPermissionDisplay(request, void 0);
    assert.strictEqual(display.toolInput, "cd /repo/project && npm test");
  });
  test("strips redundant cd from custom-tool shell permission request", () => {
    const request = customToolPermissionRequest("bash", { command: "cd /repo/project && echo hi" });
    const display = getPermissionDisplay(request, wd);
    assert.strictEqual(display.toolInput, "echo hi");
    assert.strictEqual(display.permissionKind, "shell");
  });
  test("does not affect non-shell custom-tool requests", () => {
    const request = customToolPermissionRequest("some_other_tool", { command: "cd /repo/project && echo hi" });
    const display = getPermissionDisplay(request, wd);
    assert.ok(display.toolInput?.includes("cd /repo/project"), `expected unrewritten args, got: ${display.toolInput}`);
    assert.strictEqual(display.permissionKind, "custom-tool");
  });
  test("handles powershell custom-tool with semicolon separator", () => {
    const request = customToolPermissionRequest("powershell", { command: "cd /repo/project; dir" });
    const display = getPermissionDisplay(request, wd);
    assert.strictEqual(display.toolInput, "dir");
  });
  test("confirmation title reflects sandbox bypass for shell requests", () => {
    const sandboxed = getPermissionDisplay(shellPermissionRequest("npm test"), wd);
    const bypass = getPermissionDisplay(shellPermissionRequest("npm test", true), wd);
    assert.notStrictEqual(bypass.confirmationTitle, sandboxed.confirmationTitle);
    assert.ok(/sandbox/i.test(bypass.confirmationTitle), `expected title to mention the sandbox, got: ${bypass.confirmationTitle}`);
  });
});
suite("getPermissionDisplay \u2014 read permission display", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("uses the view-tool invocation message for read permissions", () => {
    const display = getPermissionDisplay({
      kind: "read",
      path: "/Users/connor/Downloads/context7-copilot-debug-main.json",
      intention: "Read file: /Users/connor/Downloads/context7-copilot-debug-main.json"
    }, URI.file("/repo/project"));
    assert.deepStrictEqual({
      invocationMessage: display.invocationMessage,
      toolInput: display.toolInput,
      permissionKind: display.permissionKind,
      permissionPath: display.permissionPath
    }, {
      invocationMessage: { markdown: "Read [context7-copilot-debug-main.json](file:///Users/connor/Downloads/context7-copilot-debug-main.json)" },
      toolInput: void 0,
      permissionKind: "read",
      permissionPath: "/Users/connor/Downloads/context7-copilot-debug-main.json"
    });
  });
});
suite("getPermissionDisplay \u2014 write permission display", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("distinguishes creating a file from editing one", () => {
    const request = {
      kind: "write",
      canOfferSessionApproval: false,
      diff: "",
      fileName: "/repo/project/package.json",
      intention: ""
    };
    assert.deepStrictEqual({
      create: getPermissionDisplay(request, URI.file("/repo/project"), true),
      edit: getPermissionDisplay(request, URI.file("/repo/project"), false)
    }, {
      create: {
        confirmationTitle: "Create file?",
        invocationMessage: { markdown: "Create [package.json](file:///repo/project/package.json)" },
        toolInput: '{"path":"/repo/project/package.json"}',
        permissionKind: "write",
        permissionPath: "/repo/project/package.json"
      },
      edit: {
        confirmationTitle: "Write file?",
        invocationMessage: { markdown: "Edit [package.json](file:///repo/project/package.json)" },
        toolInput: '{"path":"/repo/project/package.json"}',
        permissionKind: "write",
        permissionPath: "/repo/project/package.json"
      }
    });
  });
});
suite("view tool \u2014 view_range display", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function invocation(parameters) {
    const result = getInvocationMessage("view", "View File", parameters);
    return typeof result === "string" ? result : result.markdown;
  }
  function pastTense(parameters) {
    const result = getPastTenseMessage("view", "View File", parameters, true);
    return typeof result === "string" ? result : result.markdown;
  }
  test("renders path-only when view_range is absent", () => {
    assert.ok(invocation({ path: "/repo/file.ts" }).startsWith("Read ["));
    assert.ok(pastTense({ path: "/repo/file.ts" }).startsWith("Read ["));
  });
  test("renders Copilot SDK tool-output reads without exposing the temp path", () => {
    const paths = [
      "/tmp/1786468439523-copilot-tool-output-d115e2.txt",
      "/tmp/1786499016779-copilot-tool-output-44600-1a0a63b8-4548-4fb8-a507-da72473e0556.txt",
      "C:\\Temp\\copilot-tool-output-1786468439523-d115e2.txt",
      "C:\\Temp\\copilot-tool-output-1786499172415-297.txt"
    ];
    assert.deepStrictEqual(
      paths.map((path) => ({
        invocation: invocation({ path, view_range: [107, 119] }),
        pastTense: pastTense({ path, view_range: [107, 119] })
      })),
      [
        { invocation: "Read tool output", pastTense: "Read tool output" },
        { invocation: "Read tool output", pastTense: "Read tool output" },
        { invocation: "Read tool output", pastTense: "Read tool output" },
        { invocation: "Read tool output", pastTense: "Read tool output" }
      ]
    );
  });
  test('renders "lines X to Y" for a valid two-element range', () => {
    assert.ok(invocation({ path: "/repo/file.ts", view_range: [10, 20] }).endsWith(", lines 10 to 20"));
    assert.ok(pastTense({ path: "/repo/file.ts", view_range: [10, 20] }).endsWith(", lines 10 to 20"));
  });
  test('renders "line X" when start === end', () => {
    assert.ok(invocation({ path: "/repo/file.ts", view_range: [10, 10] }).endsWith(", line 10"));
    assert.ok(pastTense({ path: "/repo/file.ts", view_range: [10, 10] }).endsWith(", line 10"));
  });
  test('renders "line X to the end" for the -1 EOF sentinel', () => {
    assert.ok(invocation({ path: "/repo/file.ts", view_range: [10, -1] }).endsWith(", line 10 to the end"));
    assert.ok(pastTense({ path: "/repo/file.ts", view_range: [10, -1] }).endsWith(", line 10 to the end"));
  });
  test("falls back to path-only for invalid ranges", () => {
    assert.ok(!invocation({ path: "/repo/file.ts", view_range: [20, 10] }).includes(","));
    assert.ok(!invocation({ path: "/repo/file.ts", view_range: [-5, 10] }).includes(","));
    assert.ok(!invocation({ path: "/repo/file.ts", view_range: [1.5, 10] }).includes(","));
    assert.ok(!invocation({ path: "/repo/file.ts", view_range: [10] }).includes(","));
    assert.ok(!invocation({ path: "/repo/file.ts", view_range: [10, 20, 30] }).includes(","));
    assert.ok(!invocation({ path: "/repo/file.ts", view_range: "whatever" }).includes(","));
  });
});
suite("copilotToolDisplay \u2014 built-in tool invocation/past-tense messages", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function invocation(toolName, parameters) {
    const result = getInvocationMessage(toolName, getToolDisplayName(toolName), parameters);
    return typeof result === "string" ? result : result.markdown;
  }
  function pastTense(toolName, parameters) {
    const result = getPastTenseMessage(toolName, getToolDisplayName(toolName), parameters, true);
    return typeof result === "string" ? result : result.markdown;
  }
  test("agent-coordination tools use a single message for both invocation and completion", () => {
    assert.strictEqual(invocation("read_agent", { agent_id: "math-helper" }), "Read agent `math-helper`");
    assert.strictEqual(pastTense("read_agent", { agent_id: "math-helper" }), "Read agent `math-helper`");
    assert.strictEqual(invocation("write_agent", { agent_id: "math-helper", message: "hi" }), "Write to agent `math-helper`");
    assert.strictEqual(pastTense("write_agent", { agent_id: "math-helper", message: "hi" }), "Write to agent `math-helper`");
  });
  test("agent tools fall back to a generic phrase without an agent id", () => {
    assert.strictEqual(invocation("read_agent", {}), "Read agent");
    assert.strictEqual(pastTense("write_agent", void 0), "Write to agent");
  });
  test("agent tools ignore a malformed (non-string) agent id instead of throwing", () => {
    assert.strictEqual(invocation("read_agent", { agent_id: 123 }), "Read agent");
    assert.strictEqual(pastTense("write_agent", { agent_id: "" }), "Write to agent");
  });
  test("list_agents shares one message; task keeps distinct present/past phrases", () => {
    assert.strictEqual(invocation("list_agents", {}), "List agents");
    assert.strictEqual(pastTense("list_agents", {}), "List agents");
    assert.strictEqual(invocation("task", {}), "Delegating task");
    assert.strictEqual(pastTense("task", {}), "Delegated task");
  });
  test("unhandled tools fall back to just the display name", () => {
    assert.strictEqual(invocation("store_memory", {}), "Store Memory");
    assert.strictEqual(pastTense("store_memory", {}), "Store Memory");
    assert.strictEqual(invocation("some_new_tool", {}), "some_new_tool");
    assert.strictEqual(pastTense("some_new_tool", {}), "some_new_tool");
  });
});
suite("copilotToolDisplay \u2014 streaming edit messages", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function streaming(toolName, parameters, resolvePath) {
    const result = getStreamingInvocationMessage(toolName, getToolDisplayName(toolName), parameters, resolvePath);
    return typeof result === "string" ? result : result.markdown;
  }
  function invocation(toolName, parameters) {
    const result = getInvocationMessage(toolName, getToolDisplayName(toolName), parameters);
    return typeof result === "string" ? result : result.markdown;
  }
  function completed(toolName, parameters) {
    const result = getPastTenseMessage(toolName, getToolDisplayName(toolName), parameters, true);
    return typeof result === "string" ? result : result.markdown;
  }
  test("streams replacement line counts and the target file", () => {
    assert.deepStrictEqual([
      streaming("edit", { path: "/repo/file.ts" }),
      streaming("edit", { path: "/repo/file.ts", old_str: "one\ntwo" }),
      streaming("edit", { path: "/repo/file.ts", old_str: "one\ntwo", new_str: "one\nupdated\nthree" })
    ], [
      "Editing [file.ts](file:///repo/file.ts)",
      "Replacing 2 lines in [file.ts](file:///repo/file.ts)",
      "Replacing 2 lines with 3 lines in [file.ts](file:///repo/file.ts)"
    ]);
  });
  test("streams create and insert line counts", () => {
    assert.deepStrictEqual([
      streaming("create", { path: "/repo/new.ts", file_text: "one\r\ntwo\r\nthree" }),
      streaming("insert", { path: "/repo/file.ts", new_str: "one\rtwo" })
    ], [
      "Creating [new.ts](file:///repo/new.ts) (3 lines)",
      "Inserting 2 lines in [file.ts](file:///repo/file.ts)"
    ]);
  });
  test("uses the str_replace_editor command shape", () => {
    assert.deepStrictEqual([
      streaming("str_replace_editor", { command: "create", path: "/repo/new.ts", file_text: "one\ntwo" }),
      streaming("str_replace_editor", { command: "str_replace", path: "/repo/file.ts", old_str: "old", new_str: "new\nvalue" }),
      streaming("str_replace_editor", { command: "view", path: "/repo/file.ts" })
    ], [
      "Creating [new.ts](file:///repo/new.ts) (2 lines)",
      "Replacing 1 line with 2 lines in [file.ts](file:///repo/file.ts)",
      "Read [file.ts](file:///repo/file.ts)"
    ]);
  });
  test("preserves file context after streaming aliases become ready and complete", () => {
    const cases = [
      ["str_replace", { path: "/repo/file.ts" }, "Edit [file.ts](file:///repo/file.ts)", "Edit [file.ts](file:///repo/file.ts)"],
      ["insert", { path: "/repo/file.ts" }, "Insert text in [file.ts](file:///repo/file.ts)", "Insert text in [file.ts](file:///repo/file.ts)"],
      ["str_replace_editor", { command: "create", path: "/repo/new.ts" }, "Create [new.ts](file:///repo/new.ts)", "Create [new.ts](file:///repo/new.ts)"],
      ["str_replace_editor", { command: "str_replace", path: "/repo/file.ts" }, "Edit [file.ts](file:///repo/file.ts)", "Edit [file.ts](file:///repo/file.ts)"]
    ];
    assert.deepStrictEqual(cases.map(([toolName, parameters]) => ({
      ready: invocation(toolName, parameters),
      complete: completed(toolName, parameters)
    })), cases.map(([, , ready, complete]) => ({ ready, complete })));
  });
  test("streams raw patch line counts and resolves discovered file paths", () => {
    const patch = [
      "*** Begin Patch",
      "*** Update File: src/file.ts",
      "@@",
      "-old",
      "+new",
      "*** End Patch"
    ].join("\n");
    assert.strictEqual(
      streaming("apply_patch", patch, (path) => `/workspace/${path}`),
      "Generating patch (6 lines) in [file.ts](file:///workspace/src/file.ts)"
    );
  });
  test("ignores malformed partial paths", () => {
    assert.strictEqual(
      streaming("edit", { path: 42, old_str: "one" }),
      "Replacing 1 line"
    );
  });
  test("falls back to the normal invocation formatter for non-edit tools", () => {
    assert.strictEqual(
      streaming("bash", { command: "npm test" }),
      "Running `npm test`"
    );
  });
});
suite("copilotToolDisplay \u2014 write_/read_ shell tools", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getToolKind", () => {
    test("returns terminal for bash", () => {
      assert.strictEqual(getToolKind("bash"), "terminal");
    });
    test("returns terminal for powershell", () => {
      assert.strictEqual(getToolKind("powershell"), "terminal");
    });
    test("returns undefined for write_bash (sending input to a running program, not launching a terminal)", () => {
      assert.strictEqual(getToolKind("write_bash"), void 0);
    });
    test("returns undefined for write_powershell", () => {
      assert.strictEqual(getToolKind("write_powershell"), void 0);
    });
    test("returns undefined for read_bash (reading output, not launching a terminal)", () => {
      assert.strictEqual(getToolKind("read_bash"), void 0);
    });
    test("returns undefined for read_powershell", () => {
      assert.strictEqual(getToolKind("read_powershell"), void 0);
    });
    test("returns subagent for task", () => {
      assert.strictEqual(getToolKind("task"), "subagent");
    });
    test("returns read for file reads", () => {
      assert.deepStrictEqual([
        getToolKind("view"),
        getToolKind("str_replace_editor", { command: "view" }),
        getToolKind("str_replace_editor", { command: "str_replace" })
      ], [
        "read",
        "read",
        void 0
      ]);
    });
    test("returns search for glob", () => {
      assert.strictEqual(getToolKind("glob"), "search");
    });
  });
  suite("getShellLanguage", () => {
    test("bash returns shellscript", () => {
      assert.strictEqual(getShellLanguage("bash"), "shellscript");
    });
    test("powershell returns powershell", () => {
      assert.strictEqual(getShellLanguage("powershell"), "powershell");
    });
    test("write_bash returns shellscript", () => {
      assert.strictEqual(getShellLanguage("write_bash"), "shellscript");
    });
    test("write_powershell returns powershell", () => {
      assert.strictEqual(getShellLanguage("write_powershell"), "powershell");
    });
    test("read_bash returns shellscript", () => {
      assert.strictEqual(getShellLanguage("read_bash"), "shellscript");
    });
    test("read_powershell returns powershell", () => {
      assert.strictEqual(getShellLanguage("read_powershell"), "powershell");
    });
  });
  suite("getInvocationMessage", () => {
    function getText(msg) {
      return typeof msg === "string" ? msg : msg.markdown;
    }
    test("write_bash with command includes the command text", () => {
      const msg = getInvocationMessage("write_bash", "Write Shell Input", { command: "echo hello" });
      assert.ok(getText(msg).includes("echo hello"), `expected 'echo hello' in: ${getText(msg)}`);
    });
    test("write_bash without command returns a non-empty fallback message", () => {
      const msg = getInvocationMessage("write_bash", "Write Shell Input", void 0);
      assert.ok(getText(msg).length > 0);
      assert.ok(!getText(msg).includes("undefined"));
    });
    test("write_powershell with command includes the command text", () => {
      const msg = getInvocationMessage("write_powershell", "Write Shell Input", { command: "Get-Date" });
      assert.ok(getText(msg).includes("Get-Date"), `expected 'Get-Date' in: ${getText(msg)}`);
    });
    test("read_bash returns a non-empty message", () => {
      const msg = getInvocationMessage("read_bash", "Read Shell Output", void 0);
      assert.strictEqual(getText(msg), "Reading Terminal");
    });
    test("read_powershell returns a non-empty message", () => {
      const msg = getInvocationMessage("read_powershell", "Read Shell Output", void 0);
      assert.strictEqual(getText(msg), "Reading Terminal");
    });
    test("write_bash message differs from bash message (distinct wording)", () => {
      const writeBashMsg = getText(getInvocationMessage("write_bash", "Write Shell Input", { command: "echo hi" }));
      const bashMsg = getText(getInvocationMessage("bash", "Bash", { command: "echo hi" }));
      assert.notStrictEqual(writeBashMsg, bashMsg);
    });
  });
  suite("getPastTenseMessage", () => {
    function getText(msg) {
      return typeof msg === "string" ? msg : msg.markdown;
    }
    test("write_bash with command includes the command text", () => {
      const msg = getPastTenseMessage("write_bash", "Write Shell Input", { command: "echo hello" }, true);
      assert.ok(getText(msg).includes("echo hello"), `expected 'echo hello' in: ${getText(msg)}`);
    });
    test("write_bash without command returns a non-empty fallback message", () => {
      const msg = getPastTenseMessage("write_bash", "Write Shell Input", void 0, true);
      assert.ok(getText(msg).length > 0);
    });
    test("write_powershell with command includes the command text", () => {
      const msg = getPastTenseMessage("write_powershell", "Write Shell Input", { command: "Get-Date" }, true);
      assert.ok(getText(msg).includes("Get-Date"), `expected 'Get-Date' in: ${getText(msg)}`);
    });
    test("read_bash success returns a non-empty message", () => {
      const msg = getPastTenseMessage("read_bash", "Read Shell Output", void 0, true);
      assert.strictEqual(getText(msg), "Read Terminal");
    });
    test("write_bash failure returns a non-empty error message", () => {
      const msg = getPastTenseMessage("write_bash", "Write Shell Input", { command: "echo hello" }, false);
      assert.ok(getText(msg).length > 0);
    });
  });
  suite("feedback comment tools (delegated to the shared server-tool group)", () => {
    function text(msg) {
      return typeof msg === "string" ? msg : msg.markdown;
    }
    test("Copilot display delegates to the shared group", () => {
      const listResult = JSON.stringify({ comments: [{ id: "a" }, { id: "b" }] });
      assert.deepStrictEqual({
        displayName: getToolDisplayName("listComments"),
        invoke: text(getInvocationMessage("listComments", "List Comments", void 0)),
        past: text(getPastTenseMessage("listComments", "List Comments", void 0, true, listResult))
      }, {
        displayName: "List Comments",
        invoke: "List comments",
        past: "List comments"
      });
    });
    test("failed feedback tool still uses the generic failure message", () => {
      assert.strictEqual(text(getPastTenseMessage("listComments", "List Comments", void 0, false)), '"List Comments" failed');
    });
  });
  suite("getToolInputString", () => {
    test("write_bash extracts command field", () => {
      assert.strictEqual(getToolInputString("write_bash", { command: "echo hello" }, void 0), "echo hello");
    });
    test("write_powershell extracts command field", () => {
      assert.strictEqual(getToolInputString("write_powershell", { command: "Get-Date" }, void 0), "Get-Date");
    });
    test("write_bash falls back to rawArguments when no command field", () => {
      assert.strictEqual(getToolInputString("write_bash", {}, '{"command":"echo hello"}'), '{"command":"echo hello"}');
    });
    test("write_bash returns undefined when both parameters and rawArguments are absent", () => {
      assert.strictEqual(getToolInputString("write_bash", void 0, void 0), void 0);
    });
    test("read_bash with no parameters returns undefined", () => {
      assert.strictEqual(getToolInputString("read_bash", void 0, void 0), void 0);
    });
  });
});
suite("skill events", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("hides the raw `skill` tool call and synthesizes a tool-start/complete pair from `skill.invoked`", () => {
    const withPath = synthesizeSkillToolCall(
      { name: "plan", path: "/abs/repo/skills/plan/SKILL.md", content: "" },
      "evt-123"
    );
    const withoutEventId = synthesizeSkillToolCall(
      { name: "plan", path: "/abs/repo/skills/plan/SKILL.md", content: "" },
      void 0
    );
    assert.deepStrictEqual({
      skillIsHidden: isHiddenTool("skill"),
      withPathToolCallId: withPath.toolCallId,
      withPathToolName: withPath.toolName,
      withPathDisplayName: withPath.displayName,
      withPathInvocation: withPath.invocationMessage,
      withPathPastTense: withPath.pastTenseMessage,
      withoutEventIdToolCallId: withoutEventId.toolCallId,
      withoutEventIdInvocation: withoutEventId.invocationMessage,
      withoutEventIdPastTense: withoutEventId.pastTenseMessage
    }, {
      skillIsHidden: true,
      withPathToolCallId: "synth-skill-evt-123",
      withPathToolName: "skill",
      withPathDisplayName: "Read Skill",
      withPathInvocation: { markdown: "Read skill [plan](file:///abs/repo/skills/plan/SKILL.md)" },
      withPathPastTense: { markdown: "Read skill [plan](file:///abs/repo/skills/plan/SKILL.md)" },
      withoutEventIdToolCallId: "synth-skill--15753539",
      withoutEventIdInvocation: { markdown: "Read skill [plan](file:///abs/repo/skills/plan/SKILL.md)" },
      withoutEventIdPastTense: { markdown: "Read skill [plan](file:///abs/repo/skills/plan/SKILL.md)" }
    });
  });
});
suite("rg / grep search tool display", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function text(msg) {
    return typeof msg === "string" ? msg : msg.markdown;
  }
  test("rg uses one stable search message", () => {
    const inv = text(getInvocationMessage("rg", "Search", { pattern: "foo" }));
    const past = text(getPastTenseMessage("rg", "Search", { pattern: "foo" }, true));
    assert.deepStrictEqual({ inv, past }, {
      inv: "Search for `foo`",
      past: "Search for `foo`"
    });
  });
  test("rg without a pattern falls back to a generic search message (not the raw tool name)", () => {
    const inv = text(getInvocationMessage("rg", "Search", void 0));
    assert.strictEqual(inv, "Search files");
  });
  test("grep uses one stable search message", () => {
    const inv = text(getInvocationMessage("grep", "Search", { pattern: "bar" }));
    const past = text(getPastTenseMessage("grep", "Search", { pattern: "bar" }, true));
    assert.deepStrictEqual({ inv, past }, {
      inv: "Search for `bar`",
      past: "Search for `bar`"
    });
  });
  test("getToolInputString returns pattern for both grep and rg", () => {
    assert.strictEqual(getToolInputString("grep", { pattern: "abc" }, void 0), "abc");
    assert.strictEqual(getToolInputString("rg", { pattern: "abc" }, void 0), "abc");
  });
});
suite("web_fetch tool display", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function text(msg) {
    return typeof msg === "string" ? msg : msg.markdown;
  }
  test("uses the fetched URL for invocation and completion messages", () => {
    const parameters = { url: "https://example.com/docs" };
    assert.deepStrictEqual({
      invocation: text(getInvocationMessage("web_fetch", "Fetch Web Content", parameters)),
      pastTense: text(getPastTenseMessage("web_fetch", "Fetch Web Content", parameters, true)),
      input: getToolInputString("web_fetch", parameters, void 0)
    }, {
      invocation: "Fetching [https://example.com/docs](https://example.com/docs)",
      pastTense: "Fetched [https://example.com/docs](https://example.com/docs)",
      input: "https://example.com/docs"
    });
  });
  test("falls back to generic URL wording when the URL is absent", () => {
    assert.deepStrictEqual({
      invocation: text(getInvocationMessage("web_fetch", "Fetch Web Content", void 0)),
      pastTense: text(getPastTenseMessage("web_fetch", "Fetch Web Content", void 0, true)),
      failure: text(getPastTenseMessage("web_fetch", "Fetch Web Content", { url: "https://example.com/docs" }, false))
    }, {
      invocation: "Fetching URL",
      pastTense: "Fetched URL",
      failure: '"Fetch Web Content" failed'
    });
  });
});
suite("search tool display", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function text(msg) {
    return typeof msg === "string" ? msg : msg.markdown;
  }
  test("web search has progress wording while code search stays stable", () => {
    assert.deepStrictEqual({
      webInvocation: text(getInvocationMessage("web_search", "Web Search", { query: "VS Code tests" })),
      webComplete: text(getPastTenseMessage("web_search", "Web Search", { query: "VS Code tests" }, true)),
      codeInvocation: text(getInvocationMessage("search_code_subagent", "Search Code", { query: "tool display mapping" })),
      codeComplete: text(getPastTenseMessage("search_code_subagent", "Search Code", { query: "tool display mapping" }, true))
    }, {
      webInvocation: "Searching the web for `VS Code tests`",
      webComplete: "Searched the web for `VS Code tests`",
      codeInvocation: "Search code for `tool display mapping`",
      codeComplete: "Search code for `tool display mapping`"
    });
  });
});
suite("sql tool display", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function text(msg) {
    return typeof msg === "string" ? msg : msg.markdown;
  }
  test("uses the SQL description for invocation and completion messages", () => {
    const parameters = { description: "Insert agent host study todos", query: "INSERT INTO todos (title) VALUES ('Read terminal activation docs')" };
    assert.strictEqual(text(getInvocationMessage("sql", "Execute SQL", parameters)), "Insert agent host study todos");
    assert.strictEqual(text(getPastTenseMessage("sql", "Execute SQL", parameters, true)), "Insert agent host study todos");
  });
  test("falls back to generic SQL wording when description is absent", () => {
    assert.strictEqual(text(getInvocationMessage("sql", "Execute SQL", { query: "SELECT 1" })), "Execute SQL query");
    assert.strictEqual(text(getPastTenseMessage("sql", "Execute SQL", { query: "SELECT 1" }, true)), "Execute SQL query");
  });
});
suite("apply_patch tool display", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function text(msg) {
    return typeof msg === "string" ? msg : msg.markdown;
  }
  const singleFilePatch = [
    "*** Begin Patch",
    "*** Update File: /repo/src/foo.ts",
    "@@",
    "-old",
    "+new",
    "*** End Patch"
  ].join("\n");
  const multiFilePatch = [
    "*** Begin Patch",
    "*** Update File: /repo/src/foo.ts",
    "@@",
    "-old",
    "+new",
    "*** Add File: /repo/src/bar.ts",
    "+hello",
    "*** Delete File: /repo/src/baz.ts",
    "*** End Patch"
  ].join("\n");
  test("renders a clickable file link for a single-file patch", () => {
    const inv = text(getInvocationMessage("apply_patch", "Patch", { input: singleFilePatch }));
    const past = text(getPastTenseMessage("apply_patch", "Patch", { input: singleFilePatch }, true));
    assert.deepStrictEqual({ inv, past }, {
      inv: "Edit [foo.ts](file:///repo/src/foo.ts)",
      past: "Edit [foo.ts](file:///repo/src/foo.ts)"
    });
  });
  test("lists every affected file for a multi-file patch", () => {
    const inv = text(getInvocationMessage("apply_patch", "Patch", { input: multiFilePatch }));
    const past = text(getPastTenseMessage("apply_patch", "Patch", { input: multiFilePatch }, true));
    assert.deepStrictEqual({ inv, past }, {
      inv: "Edit [foo.ts](file:///repo/src/foo.ts), [bar.ts](file:///repo/src/bar.ts), [baz.ts](file:///repo/src/baz.ts)",
      past: "Edit [foo.ts](file:///repo/src/foo.ts), [bar.ts](file:///repo/src/bar.ts), [baz.ts](file:///repo/src/baz.ts)"
    });
  });
  test("falls back to a generic message when the patch body is missing or unparseable", () => {
    assert.strictEqual(getInvocationMessage("apply_patch", "Patch", void 0), "Edit files");
    assert.strictEqual(getInvocationMessage("apply_patch", "Patch", { input: "not a patch" }), "Edit files");
    assert.strictEqual(getPastTenseMessage("apply_patch", "Patch", void 0, true), "Edit files");
  });
  test("also accepts the patch text under the `patch` parameter (CLI shape)", () => {
    const inv = text(getInvocationMessage("apply_patch", "Patch", { patch: singleFilePatch }));
    assert.strictEqual(inv, "Edit [foo.ts](file:///repo/src/foo.ts)");
  });
  test("git_apply_patch shares the same display path", () => {
    const inv = text(getInvocationMessage("git_apply_patch", "Patch", { input: singleFilePatch }));
    const past = text(getPastTenseMessage("git_apply_patch", "Patch", { input: singleFilePatch }, true));
    assert.deepStrictEqual({ inv, past }, {
      inv: "Edit [foo.ts](file:///repo/src/foo.ts)",
      past: "Edit [foo.ts](file:///repo/src/foo.ts)"
    });
  });
  test("failure still routes through the generic failed message", () => {
    assert.strictEqual(getPastTenseMessage("apply_patch", "Patch", { input: singleFilePatch }, false), '"Patch" failed');
  });
  test("getEditFilePath returns the first affected file from a patch body", () => {
    assert.strictEqual(getEditFilePath({ input: singleFilePatch }), "/repo/src/foo.ts");
    assert.strictEqual(getEditFilePath({ input: multiFilePatch }), "/repo/src/foo.ts");
    assert.strictEqual(getEditFilePath({ patch: singleFilePatch }), "/repo/src/foo.ts");
    assert.strictEqual(getEditFilePath(JSON.stringify({ input: singleFilePatch })), "/repo/src/foo.ts");
    assert.strictEqual(getEditFilePath({ input: "not a patch" }), void 0);
  });
  test("getEditFilePaths returns every affected file from a patch body", () => {
    assert.deepStrictEqual(getEditFilePaths({ input: singleFilePatch }), ["/repo/src/foo.ts"]);
    assert.deepStrictEqual(getEditFilePaths({ input: multiFilePatch }), ["/repo/src/foo.ts", "/repo/src/bar.ts", "/repo/src/baz.ts"]);
    assert.deepStrictEqual(getEditFilePaths({ patch: multiFilePatch }), ["/repo/src/foo.ts", "/repo/src/bar.ts", "/repo/src/baz.ts"]);
    assert.deepStrictEqual(getEditFilePaths(JSON.stringify({ input: multiFilePatch })), ["/repo/src/foo.ts", "/repo/src/bar.ts", "/repo/src/baz.ts"]);
    assert.deepStrictEqual(getEditFilePaths({ path: "/repo/src/edit.ts" }), ["/repo/src/edit.ts"]);
    assert.deepStrictEqual(getEditFilePaths({ input: "not a patch" }), []);
    assert.deepStrictEqual(getEditFilePaths(void 0), []);
    assert.deepStrictEqual(getEditFilePaths(multiFilePatch), ["/repo/src/foo.ts", "/repo/src/bar.ts", "/repo/src/baz.ts"]);
    assert.deepStrictEqual(getEditFilePaths(singleFilePatch), ["/repo/src/foo.ts"]);
  });
});
suite("getShellIntention", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("reads the description argument of shell tools, and ignores non-shell tools", () => {
    assert.deepStrictEqual({
      bash: getShellIntention("bash", { command: "ls", description: "List files" }),
      powershell: getShellIntention("powershell", { command: "Get-ChildItem", description: "List files" }),
      shellNoDescription: getShellIntention("bash", { command: "ls" }),
      shellEmptyDescription: getShellIntention("bash", { command: "ls", description: "" }),
      // The `task` (subagent) tool also has a `description` argument, but it is
      // the subagent task description, not a shell intention — must be ignored.
      taskTool: getShellIntention("task", { description: "Explore the codebase" }),
      viewTool: getShellIntention("view", { path: "/repo/file.ts", description: "why" }),
      noArgs: getShellIntention("bash", void 0)
    }, {
      bash: "List files",
      powershell: "List files",
      shellNoDescription: void 0,
      shellEmptyDescription: void 0,
      taskTool: void 0,
      viewTool: void 0,
      noArgs: void 0
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb3BpbG90VG9vbERpc3BsYXkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB0eXBlIHsgSnNvblZhbHVlLCBQZXJtaXNzaW9uUmVxdWVzdCB9IGZyb20gJ0BnaXRodWIvY29waWxvdC1zZGsnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgZ2V0RWRpdEZpbGVQYXRoLCBnZXRFZGl0RmlsZVBhdGhzLCBnZXRJbnZvY2F0aW9uTWVzc2FnZSwgZ2V0UGFzdFRlbnNlTWVzc2FnZSwgZ2V0UGVybWlzc2lvbkRpc3BsYXksIGdldFNoZWxsSW50ZW50aW9uLCBnZXRTaGVsbExhbmd1YWdlLCBnZXRTdHJlYW1pbmdJbnZvY2F0aW9uTWVzc2FnZSwgZ2V0VG9vbERpc3BsYXlOYW1lLCBnZXRUb29sSW5wdXRTdHJpbmcsIGdldFRvb2xLaW5kLCBnZXRUb29sTWFya2Rvd25Db250ZW50LCBpc0VkaXRUb29sLCBpc0hpZGRlblRvb2wsIGlzTWFya2Rvd25SZW5kZXJlZFRvb2wsIHN5bnRoZXNpemVTa2lsbFRvb2xDYWxsIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L2NvcGlsb3RUb29sRGlzcGxheS5qcyc7XG5cbnR5cGUgQ29waWxvdFNoZWxsUGVybWlzc2lvblJlcXVlc3QgPSBFeHRyYWN0PFBlcm1pc3Npb25SZXF1ZXN0LCB7IGtpbmQ6ICdzaGVsbCcgfT47XG50eXBlIENvcGlsb3RDdXN0b21Ub29sUGVybWlzc2lvblJlcXVlc3QgPSBFeHRyYWN0PFBlcm1pc3Npb25SZXF1ZXN0LCB7IGtpbmQ6ICdjdXN0b20tdG9vbCcgfT47XG5cbmZ1bmN0aW9uIHNoZWxsUGVybWlzc2lvblJlcXVlc3QoZnVsbENvbW1hbmRUZXh0OiBzdHJpbmcsIHJlcXVlc3RTYW5kYm94QnlwYXNzPzogYm9vbGVhbik6IENvcGlsb3RTaGVsbFBlcm1pc3Npb25SZXF1ZXN0IHtcblx0cmV0dXJuIHtcblx0XHRraW5kOiAnc2hlbGwnLFxuXHRcdGNhbk9mZmVyU2Vzc2lvbkFwcHJvdmFsOiBmYWxzZSxcblx0XHRjb21tYW5kczogW10sXG5cdFx0ZnVsbENvbW1hbmRUZXh0LFxuXHRcdGhhc1dyaXRlRmlsZVJlZGlyZWN0aW9uOiBmYWxzZSxcblx0XHRpbnRlbnRpb246ICcnLFxuXHRcdHBvc3NpYmxlUGF0aHM6IFtdLFxuXHRcdHBvc3NpYmxlVXJsczogW10sXG5cdFx0cmVxdWVzdFNhbmRib3hCeXBhc3MsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGN1c3RvbVRvb2xQZXJtaXNzaW9uUmVxdWVzdCh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBKc29uVmFsdWUpOiBDb3BpbG90Q3VzdG9tVG9vbFBlcm1pc3Npb25SZXF1ZXN0IHtcblx0cmV0dXJuIHtcblx0XHRraW5kOiAnY3VzdG9tLXRvb2wnLFxuXHRcdHRvb2xOYW1lLFxuXHRcdHRvb2xEZXNjcmlwdGlvbjogJycsXG5cdFx0YXJncyxcblx0fTtcbn1cblxuc3VpdGUoJ2NvcGlsb3RUb29sRGlzcGxheSBcdTIwMTQgZnJpZW5kbHkgdG9vbCBuYW1lcycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtaXJyb3JzIGludGVybmFsIENvcGlsb3QgQ0xJIGZyaWVuZGx5IGxhYmVscyBmb3IgcmVwcmVzZW50YXRpdmUgdG9vbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2FzZXM6IEFycmF5PFt0b29sTmFtZTogc3RyaW5nLCBkaXNwbGF5TmFtZTogc3RyaW5nXT4gPSBbXG5cdFx0XHRbJ2Jhc2gnLCAnUnVuIFNoZWxsIENvbW1hbmQnXSxcblx0XHRcdFsncG93ZXJzaGVsbCcsICdSdW4gU2hlbGwgQ29tbWFuZCddLFxuXHRcdFx0WydyZWFkX2Jhc2gnLCAnUmVhZCBUZXJtaW5hbCddLFxuXHRcdFx0WydyZWFkX3Bvd2Vyc2hlbGwnLCAnUmVhZCBUZXJtaW5hbCddLFxuXHRcdFx0Wyd3cml0ZV9iYXNoJywgJ1dyaXRlIHRvIEJhc2gnXSxcblx0XHRcdFsnd3JpdGVfcG93ZXJzaGVsbCcsICdXcml0ZSB0byBQb3dlclNoZWxsJ10sXG5cdFx0XHRbJ3N0b3BfYmFzaCcsICdTdG9wIFRlcm1pbmFsIFNlc3Npb24nXSxcblx0XHRcdFsnc3RvcF9wb3dlcnNoZWxsJywgJ1N0b3AgVGVybWluYWwgU2Vzc2lvbiddLFxuXHRcdFx0WydiYXNoX3NodXRkb3duJywgJ1N0b3AgVGVybWluYWwgU2Vzc2lvbiddLFxuXHRcdFx0Wydwb3dlcnNoZWxsX3NodXRkb3duJywgJ1N0b3AgVGVybWluYWwgU2Vzc2lvbiddLFxuXHRcdFx0WydsaXN0X2Jhc2gnLCAnTGlzdCBTaGVsbCBTZXNzaW9ucyddLFxuXHRcdFx0WydsaXN0X3Bvd2Vyc2hlbGwnLCAnTGlzdCBTaGVsbCBTZXNzaW9ucyddLFxuXHRcdFx0Wyd2aWV3JywgJ1JlYWQnXSxcblx0XHRcdFsnZWRpdCcsICdFZGl0IEZpbGUnXSxcblx0XHRcdFsnc3RyX3JlcGxhY2VfZWRpdG9yJywgJ0VkaXQgRmlsZSddLFxuXHRcdFx0WydzdHJfcmVwbGFjZScsICdFZGl0IEZpbGUnXSxcblx0XHRcdFsnaW5zZXJ0JywgJ0VkaXQgRmlsZSddLFxuXHRcdFx0WydjcmVhdGUnLCAnQ3JlYXRlIEZpbGUnXSxcblx0XHRcdFsnZ3JlcCcsICdTZWFyY2gnXSxcblx0XHRcdFsncmcnLCAnU2VhcmNoJ10sXG5cdFx0XHRbJ2dsb2InLCAnU2VhcmNoJ10sXG5cdFx0XHRbJ3NlYXJjaF9jb2RlX3N1YmFnZW50JywgJ1NlYXJjaCBDb2RlJ10sXG5cdFx0XHRbJ3JlcGx5X3RvX2NvbW1lbnQnLCAnUmVwbHkgdG8gQ29tbWVudCddLFxuXHRcdFx0Wydjb2RlX3JldmlldycsICdDb2RlIFJldmlldyddLFxuXHRcdFx0Wyd0aGluaycsICdUaGlua2luZyddLFxuXHRcdFx0WydyZXBvcnRfaW50ZW50JywgJ1JlcG9ydCBJbnRlbnQnXSxcblx0XHRcdFsncmVwb3J0X3Byb2dyZXNzJywgJ1Byb2dyZXNzIHVwZGF0ZSddLFxuXHRcdFx0Wyd3ZWJfZmV0Y2gnLCAnRmV0Y2ggV2ViIENvbnRlbnQnXSxcblx0XHRcdFsnd2ViX3NlYXJjaCcsICdXZWIgU2VhcmNoJ10sXG5cdFx0XHRbJ3VwZGF0ZV90b2RvJywgJ1VwZGF0ZSBUb2RvJ10sXG5cdFx0XHRbJ3Nob3dfZmlsZScsICdTaG93IEZpbGUnXSxcblx0XHRcdFsnZmV0Y2hfY29waWxvdF9jbGlfZG9jdW1lbnRhdGlvbicsICdGZXRjaCBEb2N1bWVudGF0aW9uJ10sXG5cdFx0XHRbJ3Byb3Bvc2Vfd29yaycsICdQcm9wb3NlIFdvcmsnXSxcblx0XHRcdFsndGFza19jb21wbGV0ZScsICdUYXNrIENvbXBsZXRlJ10sXG5cdFx0XHRbJ2Fza191c2VyJywgJ0FzayBVc2VyJ10sXG5cdFx0XHRbJ3NraWxsJywgJ0ludm9rZSBTa2lsbCddLFxuXHRcdFx0Wyd0YXNrJywgJ0RlbGVnYXRlIFRhc2snXSxcblx0XHRcdFsnbGlzdF9hZ2VudHMnLCAnTGlzdCBBZ2VudHMnXSxcblx0XHRcdFsncmVhZF9hZ2VudCcsICdSZWFkIEFnZW50J10sXG5cdFx0XHRbJ2V4aXRfcGxhbl9tb2RlJywgJ0V4aXQgUGxhbiBNb2RlJ10sXG5cdFx0XHRbJ3NxbCcsICdFeGVjdXRlIFNRTCddLFxuXHRcdFx0Wydsc3AnLCAnTGFuZ3VhZ2UgU2VydmVyJ10sXG5cdFx0XHRbJ2NyZWF0ZV9wdWxsX3JlcXVlc3QnLCAnQ3JlYXRlIFB1bGwgUmVxdWVzdCddLFxuXHRcdFx0WydnaC1hZHZpc29yeS1kYXRhYmFzZScsICdDaGVjayBEZXBlbmRlbmNpZXMnXSxcblx0XHRcdFsnc3RvcmVfbWVtb3J5JywgJ1N0b3JlIE1lbW9yeSddLFxuXHRcdFx0WydhcHBseV9wYXRjaCcsICdBcHBseSBQYXRjaCddLFxuXHRcdFx0Wyd3cml0ZV9hZ2VudCcsICdXcml0ZSB0byBBZ2VudCddLFxuXHRcdFx0WydtY3BfcmVsb2FkJywgJ1JlbG9hZCBNQ1AgQ29uZmlnJ10sXG5cdFx0XHRbJ21jcF92YWxpZGF0ZScsICdWYWxpZGF0ZSBNQ1AgQ29uZmlnJ10sXG5cdFx0XHRbJ3Rvb2xfc2VhcmNoX3Rvb2xfcmVnZXgnLCAnU2VhcmNoIFRvb2xzJ10sXG5cdFx0XHRbJ3BhcmFsbGVsX3ZhbGlkYXRpb24nLCAnVmFsaWRhdGUgQ2hhbmdlcyddLFxuXHRcdFx0Wydjb2RlcWxfY2hlY2tlcicsICdDb2RlUUwgU2VjdXJpdHkgU2NhbiddLFxuXHRcdFx0WydhZGRDb21tZW50JywgJ0FkZCBDb21tZW50J10sXG5cdFx0XHRbJ2xpc3RDb21tZW50cycsICdMaXN0IENvbW1lbnRzJ10sXG5cdFx0XHRbJ2RlbGV0ZUNvbW1lbnRzJywgJ0RlbGV0ZSBDb21tZW50cyddLFxuXHRcdFx0WydyZXNvbHZlQ29tbWVudHMnLCAnUmVzb2x2ZSBDb21tZW50cyddLFxuXHRcdFx0Wyd2aWV3VW5yZXZpZXdlZENvbW1lbnRzJywgJ1ZpZXcgQ29tbWVudHMnXSxcblx0XHRdO1xuXG5cdFx0Zm9yIChjb25zdCBbdG9vbE5hbWUsIGRpc3BsYXlOYW1lXSBvZiBjYXNlcykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xEaXNwbGF5TmFtZSh0b29sTmFtZSksIGRpc3BsYXlOYW1lLCB0b29sTmFtZSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIHRoZSByYXcgdG9vbCBuYW1lIGZvciB1bmtub3duIHRvb2xzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sRGlzcGxheU5hbWUoJ3NvbWVfbmV3X3Rvb2wnKSwgJ3NvbWVfbmV3X3Rvb2wnKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2NvcGlsb3RUb29sRGlzcGxheSBcdTIwMTQgZWRpdCB0b29sIGNsYXNzaWZpY2F0aW9uJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NsYXNzaWZpZXMgZGlyZWN0IGZpbGUgZWRpdCB0b29scycsICgpID0+IHtcblx0XHRmb3IgKGNvbnN0IHRvb2xOYW1lIG9mIFsnZWRpdCcsICdzdHJfcmVwbGFjZScsICdpbnNlcnQnLCAnY3JlYXRlJywgJ2FwcGx5X3BhdGNoJywgJ2dpdF9hcHBseV9wYXRjaCddKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNFZGl0VG9vbCh0b29sTmFtZSksIHRydWUsIHRvb2xOYW1lKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2NsYXNzaWZpZXMgc3RyX3JlcGxhY2VfZWRpdG9yIGJ5IGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0Zm9yIChjb25zdCBjb21tYW5kIG9mIFsnZWRpdCcsICdzdHJfcmVwbGFjZScsICdpbnNlcnQnLCAnY3JlYXRlJ10pIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0VkaXRUb29sKCdzdHJfcmVwbGFjZV9lZGl0b3InLCBjb21tYW5kKSwgdHJ1ZSwgY29tbWFuZCk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0VkaXRUb29sKCdzdHJfcmVwbGFjZV9lZGl0b3InLCAndmlldycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRWRpdFRvb2woJ3N0cl9yZXBsYWNlX2VkaXRvcicsICd1bmtub3duJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNFZGl0VG9vbCgnc3RyX3JlcGxhY2VfZWRpdG9yJyksIGZhbHNlKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2NvcGlsb3RUb29sRGlzcGxheSBcdTIwMTQgbWFya2Rvd24tcmVuZGVyZWQgdG9vbHMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndGFza19jb21wbGV0ZSByZW5kZXJzIGFzIG1hcmtkb3duLCBvdGhlciB0b29scyBkbyBub3QnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWFya2Rvd25SZW5kZXJlZFRvb2woJ3Rhc2tfY29tcGxldGUnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWFya2Rvd25SZW5kZXJlZFRvb2woJ2Jhc2gnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01hcmtkb3duUmVuZGVyZWRUb29sKCdyZXBvcnRfaW50ZW50JyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0VG9vbE1hcmtkb3duQ29udGVudCByZXR1cm5zIHRoZSB0YXNrX2NvbXBsZXRlIHN1bW1hcnkgd2hlbiBwcmVzZW50JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sTWFya2Rvd25Db250ZW50KCd0YXNrX2NvbXBsZXRlJywgeyBzdW1tYXJ5OiAnQWxsIHRlc3RzIHBhc3MuJyB9KSwgJ1xcblxcbioqVGFzayBjb21wbGV0ZWQ6KiogQWxsIHRlc3RzIHBhc3MuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFRvb2xNYXJrZG93bkNvbnRlbnQgcmV0dXJucyB1bmRlZmluZWQgZm9yIGVtcHR5LCBtaXNzaW5nLCBvciBub24tc3RyaW5nIHN1bW1hcmllcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VG9vbE1hcmtkb3duQ29udGVudCgndGFza19jb21wbGV0ZScsIHsgc3VtbWFyeTogJycgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xNYXJrZG93bkNvbnRlbnQoJ3Rhc2tfY29tcGxldGUnLCB7fSksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xNYXJrZG93bkNvbnRlbnQoJ3Rhc2tfY29tcGxldGUnLCB1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sTWFya2Rvd25Db250ZW50KCd0YXNrX2NvbXBsZXRlJywgeyBzdW1tYXJ5OiA0MiB9KSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0VG9vbE1hcmtkb3duQ29udGVudCByZXR1cm5zIHVuZGVmaW5lZCBmb3Igbm9uLW1hcmtkb3duIHRvb2xzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sTWFya2Rvd25Db250ZW50KCdiYXNoJywgeyBzdW1tYXJ5OiAnaWdub3JlZCcgfSksIHVuZGVmaW5lZCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdnZXRQZXJtaXNzaW9uRGlzcGxheSBcdTIwMTQgY2QtcHJlZml4IHN0cmlwcGluZycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCB3ZCA9IFVSSS5maWxlKCcvcmVwby9wcm9qZWN0Jyk7XG5cblx0dGVzdCgnc3RyaXBzIHJlZHVuZGFudCBjZCBmcm9tIHNoZWxsIHBlcm1pc3Npb24gcmVxdWVzdCBmdWxsQ29tbWFuZFRleHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHNoZWxsUGVybWlzc2lvblJlcXVlc3QoJ2NkIC9yZXBvL3Byb2plY3QgJiYgbnBtIHRlc3QnKTtcblx0XHRjb25zdCBkaXNwbGF5ID0gZ2V0UGVybWlzc2lvbkRpc3BsYXkocmVxdWVzdCwgd2QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwbGF5LnRvb2xJbnB1dCwgJ25wbSB0ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3BsYXkucGVybWlzc2lvbktpbmQsICdzaGVsbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdsZWF2ZXMgc2hlbGwgY29tbWFuZCBhbG9uZSB3aGVuIGNkIHRhcmdldCBkaWZmZXJzIGZyb20gd29ya2luZyBkaXJlY3RvcnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHNoZWxsUGVybWlzc2lvblJlcXVlc3QoJ2NkIC90bXAgJiYgbHMnKTtcblx0XHRjb25zdCBkaXNwbGF5ID0gZ2V0UGVybWlzc2lvbkRpc3BsYXkocmVxdWVzdCwgd2QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwbGF5LnRvb2xJbnB1dCwgJ2NkIC90bXAgJiYgbHMnKTtcblx0fSk7XG5cblx0dGVzdCgnbGVhdmVzIHNoZWxsIGNvbW1hbmQgYWxvbmUgd2hlbiBubyB3b3JraW5nIGRpcmVjdG9yeSBwcm92aWRlZCcsICgpID0+IHtcblx0XHRjb25zdCByZXF1ZXN0ID0gc2hlbGxQZXJtaXNzaW9uUmVxdWVzdCgnY2QgL3JlcG8vcHJvamVjdCAmJiBucG0gdGVzdCcpO1xuXHRcdGNvbnN0IGRpc3BsYXkgPSBnZXRQZXJtaXNzaW9uRGlzcGxheShyZXF1ZXN0LCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwbGF5LnRvb2xJbnB1dCwgJ2NkIC9yZXBvL3Byb2plY3QgJiYgbnBtIHRlc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIHJlZHVuZGFudCBjZCBmcm9tIGN1c3RvbS10b29sIHNoZWxsIHBlcm1pc3Npb24gcmVxdWVzdCcsICgpID0+IHtcblx0XHRjb25zdCByZXF1ZXN0ID0gY3VzdG9tVG9vbFBlcm1pc3Npb25SZXF1ZXN0KCdiYXNoJywgeyBjb21tYW5kOiAnY2QgL3JlcG8vcHJvamVjdCAmJiBlY2hvIGhpJyB9KTtcblx0XHRjb25zdCBkaXNwbGF5ID0gZ2V0UGVybWlzc2lvbkRpc3BsYXkocmVxdWVzdCwgd2QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwbGF5LnRvb2xJbnB1dCwgJ2VjaG8gaGknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcGxheS5wZXJtaXNzaW9uS2luZCwgJ3NoZWxsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGFmZmVjdCBub24tc2hlbGwgY3VzdG9tLXRvb2wgcmVxdWVzdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IGN1c3RvbVRvb2xQZXJtaXNzaW9uUmVxdWVzdCgnc29tZV9vdGhlcl90b29sJywgeyBjb21tYW5kOiAnY2QgL3JlcG8vcHJvamVjdCAmJiBlY2hvIGhpJyB9KTtcblx0XHRjb25zdCBkaXNwbGF5ID0gZ2V0UGVybWlzc2lvbkRpc3BsYXkocmVxdWVzdCwgd2QpO1xuXHRcdC8vIEZhbGxzIHRocm91Z2ggdG8gdGhlIGdlbmVyaWMgYnJhbmNoIFx1MjAxNCB0b29sSW5wdXQgaXMgdGhlIEpTT04tc3RyaW5naWZpZWQgYXJncy5cblx0XHRhc3NlcnQub2soZGlzcGxheS50b29sSW5wdXQ/LmluY2x1ZGVzKCdjZCAvcmVwby9wcm9qZWN0JyksIGBleHBlY3RlZCB1bnJld3JpdHRlbiBhcmdzLCBnb3Q6ICR7ZGlzcGxheS50b29sSW5wdXR9YCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3BsYXkucGVybWlzc2lvbktpbmQsICdjdXN0b20tdG9vbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIHBvd2Vyc2hlbGwgY3VzdG9tLXRvb2wgd2l0aCBzZW1pY29sb24gc2VwYXJhdG9yJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBjdXN0b21Ub29sUGVybWlzc2lvblJlcXVlc3QoJ3Bvd2Vyc2hlbGwnLCB7IGNvbW1hbmQ6ICdjZCAvcmVwby9wcm9qZWN0OyBkaXInIH0pO1xuXHRcdGNvbnN0IGRpc3BsYXkgPSBnZXRQZXJtaXNzaW9uRGlzcGxheShyZXF1ZXN0LCB3ZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3BsYXkudG9vbElucHV0LCAnZGlyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpcm1hdGlvbiB0aXRsZSByZWZsZWN0cyBzYW5kYm94IGJ5cGFzcyBmb3Igc2hlbGwgcmVxdWVzdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2FuZGJveGVkID0gZ2V0UGVybWlzc2lvbkRpc3BsYXkoc2hlbGxQZXJtaXNzaW9uUmVxdWVzdCgnbnBtIHRlc3QnKSwgd2QpO1xuXHRcdGNvbnN0IGJ5cGFzcyA9IGdldFBlcm1pc3Npb25EaXNwbGF5KHNoZWxsUGVybWlzc2lvblJlcXVlc3QoJ25wbSB0ZXN0JywgdHJ1ZSksIHdkKTtcblxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChieXBhc3MuY29uZmlybWF0aW9uVGl0bGUsIHNhbmRib3hlZC5jb25maXJtYXRpb25UaXRsZSk7XG5cdFx0YXNzZXJ0Lm9rKC9zYW5kYm94L2kudGVzdChieXBhc3MuY29uZmlybWF0aW9uVGl0bGUpLCBgZXhwZWN0ZWQgdGl0bGUgdG8gbWVudGlvbiB0aGUgc2FuZGJveCwgZ290OiAke2J5cGFzcy5jb25maXJtYXRpb25UaXRsZX1gKTtcblx0fSk7XG5cbn0pO1xuXG5zdWl0ZSgnZ2V0UGVybWlzc2lvbkRpc3BsYXkgXHUyMDE0IHJlYWQgcGVybWlzc2lvbiBkaXNwbGF5JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3VzZXMgdGhlIHZpZXctdG9vbCBpbnZvY2F0aW9uIG1lc3NhZ2UgZm9yIHJlYWQgcGVybWlzc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcGxheSA9IGdldFBlcm1pc3Npb25EaXNwbGF5KHtcblx0XHRcdGtpbmQ6ICdyZWFkJyxcblx0XHRcdHBhdGg6ICcvVXNlcnMvY29ubm9yL0Rvd25sb2Fkcy9jb250ZXh0Ny1jb3BpbG90LWRlYnVnLW1haW4uanNvbicsXG5cdFx0XHRpbnRlbnRpb246ICdSZWFkIGZpbGU6IC9Vc2Vycy9jb25ub3IvRG93bmxvYWRzL2NvbnRleHQ3LWNvcGlsb3QtZGVidWctbWFpbi5qc29uJyxcblx0XHR9LCBVUkkuZmlsZSgnL3JlcG8vcHJvamVjdCcpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGRpc3BsYXkuaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHR0b29sSW5wdXQ6IGRpc3BsYXkudG9vbElucHV0LFxuXHRcdFx0cGVybWlzc2lvbktpbmQ6IGRpc3BsYXkucGVybWlzc2lvbktpbmQsXG5cdFx0XHRwZXJtaXNzaW9uUGF0aDogZGlzcGxheS5wZXJtaXNzaW9uUGF0aCxcblx0XHR9LCB7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogeyBtYXJrZG93bjogJ1JlYWQgW2NvbnRleHQ3LWNvcGlsb3QtZGVidWctbWFpbi5qc29uXShmaWxlOi8vL1VzZXJzL2Nvbm5vci9Eb3dubG9hZHMvY29udGV4dDctY29waWxvdC1kZWJ1Zy1tYWluLmpzb24pJyB9LFxuXHRcdFx0dG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRwZXJtaXNzaW9uS2luZDogJ3JlYWQnLFxuXHRcdFx0cGVybWlzc2lvblBhdGg6ICcvVXNlcnMvY29ubm9yL0Rvd25sb2Fkcy9jb250ZXh0Ny1jb3BpbG90LWRlYnVnLW1haW4uanNvbicsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdnZXRQZXJtaXNzaW9uRGlzcGxheSBcdTIwMTQgd3JpdGUgcGVybWlzc2lvbiBkaXNwbGF5JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2Rpc3Rpbmd1aXNoZXMgY3JlYXRpbmcgYSBmaWxlIGZyb20gZWRpdGluZyBvbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHtcblx0XHRcdGtpbmQ6ICd3cml0ZScsXG5cdFx0XHRjYW5PZmZlclNlc3Npb25BcHByb3ZhbDogZmFsc2UsXG5cdFx0XHRkaWZmOiAnJyxcblx0XHRcdGZpbGVOYW1lOiAnL3JlcG8vcHJvamVjdC9wYWNrYWdlLmpzb24nLFxuXHRcdFx0aW50ZW50aW9uOiAnJyxcblx0XHR9IHNhdGlzZmllcyBQZXJtaXNzaW9uUmVxdWVzdDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3JlYXRlOiBnZXRQZXJtaXNzaW9uRGlzcGxheShyZXF1ZXN0LCBVUkkuZmlsZSgnL3JlcG8vcHJvamVjdCcpLCB0cnVlKSxcblx0XHRcdGVkaXQ6IGdldFBlcm1pc3Npb25EaXNwbGF5KHJlcXVlc3QsIFVSSS5maWxlKCcvcmVwby9wcm9qZWN0JyksIGZhbHNlKSxcblx0XHR9LCB7XG5cdFx0XHRjcmVhdGU6IHtcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdDcmVhdGUgZmlsZT8nLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogeyBtYXJrZG93bjogJ0NyZWF0ZSBbcGFja2FnZS5qc29uXShmaWxlOi8vL3JlcG8vcHJvamVjdC9wYWNrYWdlLmpzb24pJyB9LFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJwYXRoXCI6XCIvcmVwby9wcm9qZWN0L3BhY2thZ2UuanNvblwifScsXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAnd3JpdGUnLFxuXHRcdFx0XHRwZXJtaXNzaW9uUGF0aDogJy9yZXBvL3Byb2plY3QvcGFja2FnZS5qc29uJyxcblx0XHRcdH0sXG5cdFx0XHRlZGl0OiB7XG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnV3JpdGUgZmlsZT8nLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogeyBtYXJrZG93bjogJ0VkaXQgW3BhY2thZ2UuanNvbl0oZmlsZTovLy9yZXBvL3Byb2plY3QvcGFja2FnZS5qc29uKScgfSxcblx0XHRcdFx0dG9vbElucHV0OiAne1wicGF0aFwiOlwiL3JlcG8vcHJvamVjdC9wYWNrYWdlLmpzb25cIn0nLFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ3dyaXRlJyxcblx0XHRcdFx0cGVybWlzc2lvblBhdGg6ICcvcmVwby9wcm9qZWN0L3BhY2thZ2UuanNvbicsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgndmlldyB0b29sIFx1MjAxNCB2aWV3X3JhbmdlIGRpc3BsYXknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gaW52b2NhdGlvbihwYXJhbWV0ZXJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0SW52b2NhdGlvbk1lc3NhZ2UoJ3ZpZXcnLCAnVmlldyBGaWxlJywgcGFyYW1ldGVycyk7XG5cdFx0cmV0dXJuIHR5cGVvZiByZXN1bHQgPT09ICdzdHJpbmcnID8gcmVzdWx0IDogcmVzdWx0Lm1hcmtkb3duO1xuXHR9XG5cblx0ZnVuY3Rpb24gcGFzdFRlbnNlKHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRjb25zdCByZXN1bHQgPSBnZXRQYXN0VGVuc2VNZXNzYWdlKCd2aWV3JywgJ1ZpZXcgRmlsZScsIHBhcmFtZXRlcnMsIHRydWUpO1xuXHRcdHJldHVybiB0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJyA/IHJlc3VsdCA6IHJlc3VsdC5tYXJrZG93bjtcblx0fVxuXG5cdHRlc3QoJ3JlbmRlcnMgcGF0aC1vbmx5IHdoZW4gdmlld19yYW5nZSBpcyBhYnNlbnQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0Lm9rKGludm9jYXRpb24oeyBwYXRoOiAnL3JlcG8vZmlsZS50cycgfSkuc3RhcnRzV2l0aCgnUmVhZCBbJykpO1xuXHRcdGFzc2VydC5vayhwYXN0VGVuc2UoeyBwYXRoOiAnL3JlcG8vZmlsZS50cycgfSkuc3RhcnRzV2l0aCgnUmVhZCBbJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5kZXJzIENvcGlsb3QgU0RLIHRvb2wtb3V0cHV0IHJlYWRzIHdpdGhvdXQgZXhwb3NpbmcgdGhlIHRlbXAgcGF0aCcsICgpID0+IHtcblx0XHRjb25zdCBwYXRocyA9IFtcblx0XHRcdCcvdG1wLzE3ODY0Njg0Mzk1MjMtY29waWxvdC10b29sLW91dHB1dC1kMTE1ZTIudHh0Jyxcblx0XHRcdCcvdG1wLzE3ODY0OTkwMTY3NzktY29waWxvdC10b29sLW91dHB1dC00NDYwMC0xYTBhNjNiOC00NTQ4LTRmYjgtYTUwNy1kYTcyNDczZTA1NTYudHh0Jyxcblx0XHRcdCdDOlxcXFxUZW1wXFxcXGNvcGlsb3QtdG9vbC1vdXRwdXQtMTc4NjQ2ODQzOTUyMy1kMTE1ZTIudHh0Jyxcblx0XHRcdCdDOlxcXFxUZW1wXFxcXGNvcGlsb3QtdG9vbC1vdXRwdXQtMTc4NjQ5OTE3MjQxNS0yOTcudHh0Jyxcblx0XHRdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwYXRocy5tYXAocGF0aCA9PiAoe1xuXHRcdFx0XHRpbnZvY2F0aW9uOiBpbnZvY2F0aW9uKHsgcGF0aCwgdmlld19yYW5nZTogWzEwNywgMTE5XSB9KSxcblx0XHRcdFx0cGFzdFRlbnNlOiBwYXN0VGVuc2UoeyBwYXRoLCB2aWV3X3JhbmdlOiBbMTA3LCAxMTldIH0pLFxuXHRcdFx0fSkpLFxuXHRcdFx0W1xuXHRcdFx0XHR7IGludm9jYXRpb246ICdSZWFkIHRvb2wgb3V0cHV0JywgcGFzdFRlbnNlOiAnUmVhZCB0b29sIG91dHB1dCcgfSxcblx0XHRcdFx0eyBpbnZvY2F0aW9uOiAnUmVhZCB0b29sIG91dHB1dCcsIHBhc3RUZW5zZTogJ1JlYWQgdG9vbCBvdXRwdXQnIH0sXG5cdFx0XHRcdHsgaW52b2NhdGlvbjogJ1JlYWQgdG9vbCBvdXRwdXQnLCBwYXN0VGVuc2U6ICdSZWFkIHRvb2wgb3V0cHV0JyB9LFxuXHRcdFx0XHR7IGludm9jYXRpb246ICdSZWFkIHRvb2wgb3V0cHV0JywgcGFzdFRlbnNlOiAnUmVhZCB0b29sIG91dHB1dCcgfSxcblx0XHRcdF0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVuZGVycyBcImxpbmVzIFggdG8gWVwiIGZvciBhIHZhbGlkIHR3by1lbGVtZW50IHJhbmdlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5vayhpbnZvY2F0aW9uKHsgcGF0aDogJy9yZXBvL2ZpbGUudHMnLCB2aWV3X3JhbmdlOiBbMTAsIDIwXSB9KS5lbmRzV2l0aCgnLCBsaW5lcyAxMCB0byAyMCcpKTtcblx0XHRhc3NlcnQub2socGFzdFRlbnNlKHsgcGF0aDogJy9yZXBvL2ZpbGUudHMnLCB2aWV3X3JhbmdlOiBbMTAsIDIwXSB9KS5lbmRzV2l0aCgnLCBsaW5lcyAxMCB0byAyMCcpKTtcblx0fSk7XG5cblx0dGVzdCgncmVuZGVycyBcImxpbmUgWFwiIHdoZW4gc3RhcnQgPT09IGVuZCcsICgpID0+IHtcblx0XHRhc3NlcnQub2soaW52b2NhdGlvbih7IHBhdGg6ICcvcmVwby9maWxlLnRzJywgdmlld19yYW5nZTogWzEwLCAxMF0gfSkuZW5kc1dpdGgoJywgbGluZSAxMCcpKTtcblx0XHRhc3NlcnQub2socGFzdFRlbnNlKHsgcGF0aDogJy9yZXBvL2ZpbGUudHMnLCB2aWV3X3JhbmdlOiBbMTAsIDEwXSB9KS5lbmRzV2l0aCgnLCBsaW5lIDEwJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5kZXJzIFwibGluZSBYIHRvIHRoZSBlbmRcIiBmb3IgdGhlIC0xIEVPRiBzZW50aW5lbCcsICgpID0+IHtcblx0XHRhc3NlcnQub2soaW52b2NhdGlvbih7IHBhdGg6ICcvcmVwby9maWxlLnRzJywgdmlld19yYW5nZTogWzEwLCAtMV0gfSkuZW5kc1dpdGgoJywgbGluZSAxMCB0byB0aGUgZW5kJykpO1xuXHRcdGFzc2VydC5vayhwYXN0VGVuc2UoeyBwYXRoOiAnL3JlcG8vZmlsZS50cycsIHZpZXdfcmFuZ2U6IFsxMCwgLTFdIH0pLmVuZHNXaXRoKCcsIGxpbmUgMTAgdG8gdGhlIGVuZCcpKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBwYXRoLW9ubHkgZm9yIGludmFsaWQgcmFuZ2VzJywgKCkgPT4ge1xuXHRcdC8vIGVuZCA8IHN0YXJ0IChhbmQgbm90IC0xKVxuXHRcdGFzc2VydC5vayghaW52b2NhdGlvbih7IHBhdGg6ICcvcmVwby9maWxlLnRzJywgdmlld19yYW5nZTogWzIwLCAxMF0gfSkuaW5jbHVkZXMoJywnKSk7XG5cdFx0Ly8gbmVnYXRpdmUgc3RhcnRcblx0XHRhc3NlcnQub2soIWludm9jYXRpb24oeyBwYXRoOiAnL3JlcG8vZmlsZS50cycsIHZpZXdfcmFuZ2U6IFstNSwgMTBdIH0pLmluY2x1ZGVzKCcsJykpO1xuXHRcdC8vIG5vbi1pbnRlZ2VyXG5cdFx0YXNzZXJ0Lm9rKCFpbnZvY2F0aW9uKHsgcGF0aDogJy9yZXBvL2ZpbGUudHMnLCB2aWV3X3JhbmdlOiBbMS41LCAxMF0gfSkuaW5jbHVkZXMoJywnKSk7XG5cdFx0Ly8gd3JvbmcgYXJpdHlcblx0XHRhc3NlcnQub2soIWludm9jYXRpb24oeyBwYXRoOiAnL3JlcG8vZmlsZS50cycsIHZpZXdfcmFuZ2U6IFsxMF0gfSkuaW5jbHVkZXMoJywnKSk7XG5cdFx0YXNzZXJ0Lm9rKCFpbnZvY2F0aW9uKHsgcGF0aDogJy9yZXBvL2ZpbGUudHMnLCB2aWV3X3JhbmdlOiBbMTAsIDIwLCAzMF0gfSkuaW5jbHVkZXMoJywnKSk7XG5cdFx0Ly8gbm9uLWFycmF5XG5cdFx0YXNzZXJ0Lm9rKCFpbnZvY2F0aW9uKHsgcGF0aDogJy9yZXBvL2ZpbGUudHMnLCB2aWV3X3JhbmdlOiAnd2hhdGV2ZXInIH0pLmluY2x1ZGVzKCcsJykpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnY29waWxvdFRvb2xEaXNwbGF5IFx1MjAxNCBidWlsdC1pbiB0b29sIGludm9jYXRpb24vcGFzdC10ZW5zZSBtZXNzYWdlcycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBpbnZvY2F0aW9uKHRvb2xOYW1lOiBzdHJpbmcsIHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRjb25zdCByZXN1bHQgPSBnZXRJbnZvY2F0aW9uTWVzc2FnZSh0b29sTmFtZSwgZ2V0VG9vbERpc3BsYXlOYW1lKHRvb2xOYW1lKSwgcGFyYW1ldGVycyk7XG5cdFx0cmV0dXJuIHR5cGVvZiByZXN1bHQgPT09ICdzdHJpbmcnID8gcmVzdWx0IDogcmVzdWx0Lm1hcmtkb3duO1xuXHR9XG5cblx0ZnVuY3Rpb24gcGFzdFRlbnNlKHRvb2xOYW1lOiBzdHJpbmcsIHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRjb25zdCByZXN1bHQgPSBnZXRQYXN0VGVuc2VNZXNzYWdlKHRvb2xOYW1lLCBnZXRUb29sRGlzcGxheU5hbWUodG9vbE5hbWUpLCBwYXJhbWV0ZXJzLCB0cnVlKTtcblx0XHRyZXR1cm4gdHlwZW9mIHJlc3VsdCA9PT0gJ3N0cmluZycgPyByZXN1bHQgOiByZXN1bHQubWFya2Rvd247XG5cdH1cblxuXHR0ZXN0KCdhZ2VudC1jb29yZGluYXRpb24gdG9vbHMgdXNlIGEgc2luZ2xlIG1lc3NhZ2UgZm9yIGJvdGggaW52b2NhdGlvbiBhbmQgY29tcGxldGlvbicsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbigncmVhZF9hZ2VudCcsIHsgYWdlbnRfaWQ6ICdtYXRoLWhlbHBlcicgfSksICdSZWFkIGFnZW50IGBtYXRoLWhlbHBlcmAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFzdFRlbnNlKCdyZWFkX2FnZW50JywgeyBhZ2VudF9pZDogJ21hdGgtaGVscGVyJyB9KSwgJ1JlYWQgYWdlbnQgYG1hdGgtaGVscGVyYCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uKCd3cml0ZV9hZ2VudCcsIHsgYWdlbnRfaWQ6ICdtYXRoLWhlbHBlcicsIG1lc3NhZ2U6ICdoaScgfSksICdXcml0ZSB0byBhZ2VudCBgbWF0aC1oZWxwZXJgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhc3RUZW5zZSgnd3JpdGVfYWdlbnQnLCB7IGFnZW50X2lkOiAnbWF0aC1oZWxwZXInLCBtZXNzYWdlOiAnaGknIH0pLCAnV3JpdGUgdG8gYWdlbnQgYG1hdGgtaGVscGVyYCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZ2VudCB0b29scyBmYWxsIGJhY2sgdG8gYSBnZW5lcmljIHBocmFzZSB3aXRob3V0IGFuIGFnZW50IGlkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uKCdyZWFkX2FnZW50Jywge30pLCAnUmVhZCBhZ2VudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXN0VGVuc2UoJ3dyaXRlX2FnZW50JywgdW5kZWZpbmVkKSwgJ1dyaXRlIHRvIGFnZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FnZW50IHRvb2xzIGlnbm9yZSBhIG1hbGZvcm1lZCAobm9uLXN0cmluZykgYWdlbnQgaWQgaW5zdGVhZCBvZiB0aHJvd2luZycsICgpID0+IHtcblx0XHQvLyBhZ2VudF9pZCBjb21lcyBmcm9tIHVudHJ1c3RlZCBKU09OLCBzbyBhIG5vbi1zdHJpbmcgbXVzdCBub3QgcmVhY2ggdGhlXG5cdFx0Ly8gbWFya2Rvd24gaW5saW5lLWNvZGUgZm9ybWF0dGVyICh3aGljaCB3b3VsZCB0aHJvdykuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24oJ3JlYWRfYWdlbnQnLCB7IGFnZW50X2lkOiAxMjMgfSksICdSZWFkIGFnZW50Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhc3RUZW5zZSgnd3JpdGVfYWdlbnQnLCB7IGFnZW50X2lkOiAnJyB9KSwgJ1dyaXRlIHRvIGFnZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpc3RfYWdlbnRzIHNoYXJlcyBvbmUgbWVzc2FnZTsgdGFzayBrZWVwcyBkaXN0aW5jdCBwcmVzZW50L3Bhc3QgcGhyYXNlcycsICgpID0+IHtcblx0XHQvLyBsaXN0X2FnZW50cyBpcyBhIGZhc3QgYWdlbnQtY29vcmRpbmF0aW9uIHRvb2w6IG9uZSBtZXNzYWdlLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uKCdsaXN0X2FnZW50cycsIHt9KSwgJ0xpc3QgYWdlbnRzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhc3RUZW5zZSgnbGlzdF9hZ2VudHMnLCB7fSksICdMaXN0IGFnZW50cycpO1xuXHRcdC8vIHRhc2sgZGVsZWdhdGVzIHRvIGEgKHBvc3NpYmx5IHNsb3cpIHN1YmFnZW50LCBzbyBpdCBrZWVwcyBhIHByZXNlbnQtdGVuc2UgaW52b2NhdGlvbi5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbigndGFzaycsIHt9KSwgJ0RlbGVnYXRpbmcgdGFzaycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXN0VGVuc2UoJ3Rhc2snLCB7fSksICdEZWxlZ2F0ZWQgdGFzaycpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmhhbmRsZWQgdG9vbHMgZmFsbCBiYWNrIHRvIGp1c3QgdGhlIGRpc3BsYXkgbmFtZScsICgpID0+IHtcblx0XHQvLyBLbm93biB0b29sIHdpdGggbm8gdGFpbG9yZWQgbWVzc2FnZTogdXNlcyBpdHMgZnJpZW5kbHkgZGlzcGxheSBuYW1lLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uKCdzdG9yZV9tZW1vcnknLCB7fSksICdTdG9yZSBNZW1vcnknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFzdFRlbnNlKCdzdG9yZV9tZW1vcnknLCB7fSksICdTdG9yZSBNZW1vcnknKTtcblx0XHQvLyBVbmtub3duIHRvb2w6IGRpc3BsYXkgbmFtZSBpcyB0aGUgcmF3IHRvb2wgbmFtZS5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbignc29tZV9uZXdfdG9vbCcsIHt9KSwgJ3NvbWVfbmV3X3Rvb2wnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFzdFRlbnNlKCdzb21lX25ld190b29sJywge30pLCAnc29tZV9uZXdfdG9vbCcpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnY29waWxvdFRvb2xEaXNwbGF5IFx1MjAxNCBzdHJlYW1pbmcgZWRpdCBtZXNzYWdlcycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBzdHJlYW1pbmcodG9vbE5hbWU6IHN0cmluZywgcGFyYW1ldGVyczogdW5rbm93biwgcmVzb2x2ZVBhdGg/OiAocGF0aDogc3RyaW5nKSA9PiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldFN0cmVhbWluZ0ludm9jYXRpb25NZXNzYWdlKHRvb2xOYW1lLCBnZXRUb29sRGlzcGxheU5hbWUodG9vbE5hbWUpLCBwYXJhbWV0ZXJzLCByZXNvbHZlUGF0aCk7XG5cdFx0cmV0dXJuIHR5cGVvZiByZXN1bHQgPT09ICdzdHJpbmcnID8gcmVzdWx0IDogcmVzdWx0Lm1hcmtkb3duO1xuXHR9XG5cblx0ZnVuY3Rpb24gaW52b2NhdGlvbih0b29sTmFtZTogc3RyaW5nLCBwYXJhbWV0ZXJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHN0cmluZyB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0SW52b2NhdGlvbk1lc3NhZ2UodG9vbE5hbWUsIGdldFRvb2xEaXNwbGF5TmFtZSh0b29sTmFtZSksIHBhcmFtZXRlcnMpO1xuXHRcdHJldHVybiB0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJyA/IHJlc3VsdCA6IHJlc3VsdC5tYXJrZG93bjtcblx0fVxuXG5cdGZ1bmN0aW9uIGNvbXBsZXRlZCh0b29sTmFtZTogc3RyaW5nLCBwYXJhbWV0ZXJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHN0cmluZyB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0UGFzdFRlbnNlTWVzc2FnZSh0b29sTmFtZSwgZ2V0VG9vbERpc3BsYXlOYW1lKHRvb2xOYW1lKSwgcGFyYW1ldGVycywgdHJ1ZSk7XG5cdFx0cmV0dXJuIHR5cGVvZiByZXN1bHQgPT09ICdzdHJpbmcnID8gcmVzdWx0IDogcmVzdWx0Lm1hcmtkb3duO1xuXHR9XG5cblx0dGVzdCgnc3RyZWFtcyByZXBsYWNlbWVudCBsaW5lIGNvdW50cyBhbmQgdGhlIHRhcmdldCBmaWxlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0c3RyZWFtaW5nKCdlZGl0JywgeyBwYXRoOiAnL3JlcG8vZmlsZS50cycgfSksXG5cdFx0XHRzdHJlYW1pbmcoJ2VkaXQnLCB7IHBhdGg6ICcvcmVwby9maWxlLnRzJywgb2xkX3N0cjogJ29uZVxcbnR3bycgfSksXG5cdFx0XHRzdHJlYW1pbmcoJ2VkaXQnLCB7IHBhdGg6ICcvcmVwby9maWxlLnRzJywgb2xkX3N0cjogJ29uZVxcbnR3bycsIG5ld19zdHI6ICdvbmVcXG51cGRhdGVkXFxudGhyZWUnIH0pLFxuXHRcdF0sIFtcblx0XHRcdCdFZGl0aW5nIFtmaWxlLnRzXShmaWxlOi8vL3JlcG8vZmlsZS50cyknLFxuXHRcdFx0J1JlcGxhY2luZyAyIGxpbmVzIGluIFtmaWxlLnRzXShmaWxlOi8vL3JlcG8vZmlsZS50cyknLFxuXHRcdFx0J1JlcGxhY2luZyAyIGxpbmVzIHdpdGggMyBsaW5lcyBpbiBbZmlsZS50c10oZmlsZTovLy9yZXBvL2ZpbGUudHMpJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc3RyZWFtcyBjcmVhdGUgYW5kIGluc2VydCBsaW5lIGNvdW50cycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHN0cmVhbWluZygnY3JlYXRlJywgeyBwYXRoOiAnL3JlcG8vbmV3LnRzJywgZmlsZV90ZXh0OiAnb25lXFxyXFxudHdvXFxyXFxudGhyZWUnIH0pLFxuXHRcdFx0c3RyZWFtaW5nKCdpbnNlcnQnLCB7IHBhdGg6ICcvcmVwby9maWxlLnRzJywgbmV3X3N0cjogJ29uZVxccnR3bycgfSksXG5cdFx0XSwgW1xuXHRcdFx0J0NyZWF0aW5nIFtuZXcudHNdKGZpbGU6Ly8vcmVwby9uZXcudHMpICgzIGxpbmVzKScsXG5cdFx0XHQnSW5zZXJ0aW5nIDIgbGluZXMgaW4gW2ZpbGUudHNdKGZpbGU6Ly8vcmVwby9maWxlLnRzKScsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgdGhlIHN0cl9yZXBsYWNlX2VkaXRvciBjb21tYW5kIHNoYXBlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0c3RyZWFtaW5nKCdzdHJfcmVwbGFjZV9lZGl0b3InLCB7IGNvbW1hbmQ6ICdjcmVhdGUnLCBwYXRoOiAnL3JlcG8vbmV3LnRzJywgZmlsZV90ZXh0OiAnb25lXFxudHdvJyB9KSxcblx0XHRcdHN0cmVhbWluZygnc3RyX3JlcGxhY2VfZWRpdG9yJywgeyBjb21tYW5kOiAnc3RyX3JlcGxhY2UnLCBwYXRoOiAnL3JlcG8vZmlsZS50cycsIG9sZF9zdHI6ICdvbGQnLCBuZXdfc3RyOiAnbmV3XFxudmFsdWUnIH0pLFxuXHRcdFx0c3RyZWFtaW5nKCdzdHJfcmVwbGFjZV9lZGl0b3InLCB7IGNvbW1hbmQ6ICd2aWV3JywgcGF0aDogJy9yZXBvL2ZpbGUudHMnIH0pLFxuXHRcdF0sIFtcblx0XHRcdCdDcmVhdGluZyBbbmV3LnRzXShmaWxlOi8vL3JlcG8vbmV3LnRzKSAoMiBsaW5lcyknLFxuXHRcdFx0J1JlcGxhY2luZyAxIGxpbmUgd2l0aCAyIGxpbmVzIGluIFtmaWxlLnRzXShmaWxlOi8vL3JlcG8vZmlsZS50cyknLFxuXHRcdFx0J1JlYWQgW2ZpbGUudHNdKGZpbGU6Ly8vcmVwby9maWxlLnRzKScsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBmaWxlIGNvbnRleHQgYWZ0ZXIgc3RyZWFtaW5nIGFsaWFzZXMgYmVjb21lIHJlYWR5IGFuZCBjb21wbGV0ZScsICgpID0+IHtcblx0XHRjb25zdCBjYXNlczogQXJyYXk8W3Rvb2xOYW1lOiBzdHJpbmcsIHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCByZWFkeTogc3RyaW5nLCBjb21wbGV0ZTogc3RyaW5nXT4gPSBbXG5cdFx0XHRbJ3N0cl9yZXBsYWNlJywgeyBwYXRoOiAnL3JlcG8vZmlsZS50cycgfSwgJ0VkaXQgW2ZpbGUudHNdKGZpbGU6Ly8vcmVwby9maWxlLnRzKScsICdFZGl0IFtmaWxlLnRzXShmaWxlOi8vL3JlcG8vZmlsZS50cyknXSxcblx0XHRcdFsnaW5zZXJ0JywgeyBwYXRoOiAnL3JlcG8vZmlsZS50cycgfSwgJ0luc2VydCB0ZXh0IGluIFtmaWxlLnRzXShmaWxlOi8vL3JlcG8vZmlsZS50cyknLCAnSW5zZXJ0IHRleHQgaW4gW2ZpbGUudHNdKGZpbGU6Ly8vcmVwby9maWxlLnRzKSddLFxuXHRcdFx0WydzdHJfcmVwbGFjZV9lZGl0b3InLCB7IGNvbW1hbmQ6ICdjcmVhdGUnLCBwYXRoOiAnL3JlcG8vbmV3LnRzJyB9LCAnQ3JlYXRlIFtuZXcudHNdKGZpbGU6Ly8vcmVwby9uZXcudHMpJywgJ0NyZWF0ZSBbbmV3LnRzXShmaWxlOi8vL3JlcG8vbmV3LnRzKSddLFxuXHRcdFx0WydzdHJfcmVwbGFjZV9lZGl0b3InLCB7IGNvbW1hbmQ6ICdzdHJfcmVwbGFjZScsIHBhdGg6ICcvcmVwby9maWxlLnRzJyB9LCAnRWRpdCBbZmlsZS50c10oZmlsZTovLy9yZXBvL2ZpbGUudHMpJywgJ0VkaXQgW2ZpbGUudHNdKGZpbGU6Ly8vcmVwby9maWxlLnRzKSddLFxuXHRcdF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYXNlcy5tYXAoKFt0b29sTmFtZSwgcGFyYW1ldGVyc10pID0+ICh7XG5cdFx0XHRyZWFkeTogaW52b2NhdGlvbih0b29sTmFtZSwgcGFyYW1ldGVycyksXG5cdFx0XHRjb21wbGV0ZTogY29tcGxldGVkKHRvb2xOYW1lLCBwYXJhbWV0ZXJzKSxcblx0XHR9KSksIGNhc2VzLm1hcCgoWywgLCByZWFkeSwgY29tcGxldGVdKSA9PiAoeyByZWFkeSwgY29tcGxldGUgfSkpKTtcblx0fSk7XG5cblx0dGVzdCgnc3RyZWFtcyByYXcgcGF0Y2ggbGluZSBjb3VudHMgYW5kIHJlc29sdmVzIGRpc2NvdmVyZWQgZmlsZSBwYXRocycsICgpID0+IHtcblx0XHRjb25zdCBwYXRjaCA9IFtcblx0XHRcdCcqKiogQmVnaW4gUGF0Y2gnLFxuXHRcdFx0JyoqKiBVcGRhdGUgRmlsZTogc3JjL2ZpbGUudHMnLFxuXHRcdFx0J0BAJyxcblx0XHRcdCctb2xkJyxcblx0XHRcdCcrbmV3Jyxcblx0XHRcdCcqKiogRW5kIFBhdGNoJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmVhbWluZygnYXBwbHlfcGF0Y2gnLCBwYXRjaCwgcGF0aCA9PiBgL3dvcmtzcGFjZS8ke3BhdGh9YCksXG5cdFx0XHQnR2VuZXJhdGluZyBwYXRjaCAoNiBsaW5lcykgaW4gW2ZpbGUudHNdKGZpbGU6Ly8vd29ya3NwYWNlL3NyYy9maWxlLnRzKScsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBtYWxmb3JtZWQgcGFydGlhbCBwYXRocycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJlYW1pbmcoJ2VkaXQnLCB7IHBhdGg6IDQyLCBvbGRfc3RyOiAnb25lJyB9KSxcblx0XHRcdCdSZXBsYWNpbmcgMSBsaW5lJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIHRoZSBub3JtYWwgaW52b2NhdGlvbiBmb3JtYXR0ZXIgZm9yIG5vbi1lZGl0IHRvb2xzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmVhbWluZygnYmFzaCcsIHsgY29tbWFuZDogJ25wbSB0ZXN0JyB9KSxcblx0XHRcdCdSdW5uaW5nIGBucG0gdGVzdGAnLFxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbi8vIC0tLS0gd3JpdGVfL3JlYWRfIHNoZWxsIHRvb2wgZGlzcGxheSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vXG4vLyBDb3ZlcmFnZSBmb3IgdGhlIHNlY29uZGFyeSBzaGVsbCBoZWxwZXJzICh3cml0ZV9iYXNoLCByZWFkX2Jhc2gsIGFuZCB0aGVpclxuLy8gcG93ZXJzaGVsbCBzaWJsaW5ncykuIFRoZXNlIG5ldmVyIGFwcGVhciBpbiBhIHBlcm1pc3Npb24gZGlhbG9nICh0aGV5J3JlXG4vLyByZWdpc3RlcmVkIHdpdGggYHNraXBQZXJtaXNzaW9uOiB0cnVlYCBcdTIwMTQgc2VlIGNvcGlsb3RTaGVsbFRvb2xzLnRzKSwgYnV0IHRoZXlcbi8vIHN0aWxsIGZsb3cgdGhyb3VnaCB0aGUgdG9vbC1leGVjdXRpb24gZGlzcGxheSBwaXBlbGluZS5cblxuc3VpdGUoJ2NvcGlsb3RUb29sRGlzcGxheSBcdTIwMTQgd3JpdGVfL3JlYWRfIHNoZWxsIHRvb2xzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdnZXRUb29sS2luZCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgdGVybWluYWwgZm9yIGJhc2gnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VG9vbEtpbmQoJ2Jhc2gnKSwgJ3Rlcm1pbmFsJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRlcm1pbmFsIGZvciBwb3dlcnNoZWxsJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xLaW5kKCdwb3dlcnNoZWxsJyksICd0ZXJtaW5hbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIHdyaXRlX2Jhc2ggKHNlbmRpbmcgaW5wdXQgdG8gYSBydW5uaW5nIHByb2dyYW0sIG5vdCBsYXVuY2hpbmcgYSB0ZXJtaW5hbCknLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VG9vbEtpbmQoJ3dyaXRlX2Jhc2gnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciB3cml0ZV9wb3dlcnNoZWxsJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xLaW5kKCd3cml0ZV9wb3dlcnNoZWxsJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgcmVhZF9iYXNoIChyZWFkaW5nIG91dHB1dCwgbm90IGxhdW5jaGluZyBhIHRlcm1pbmFsKScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sS2luZCgncmVhZF9iYXNoJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgcmVhZF9wb3dlcnNoZWxsJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xLaW5kKCdyZWFkX3Bvd2Vyc2hlbGwnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgc3ViYWdlbnQgZm9yIHRhc2snLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VG9vbEtpbmQoJ3Rhc2snKSwgJ3N1YmFnZW50Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHJlYWQgZm9yIGZpbGUgcmVhZHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0Z2V0VG9vbEtpbmQoJ3ZpZXcnKSxcblx0XHRcdFx0Z2V0VG9vbEtpbmQoJ3N0cl9yZXBsYWNlX2VkaXRvcicsIHsgY29tbWFuZDogJ3ZpZXcnIH0pLFxuXHRcdFx0XHRnZXRUb29sS2luZCgnc3RyX3JlcGxhY2VfZWRpdG9yJywgeyBjb21tYW5kOiAnc3RyX3JlcGxhY2UnIH0pLFxuXHRcdFx0XSwgW1xuXHRcdFx0XHQncmVhZCcsXG5cdFx0XHRcdCdyZWFkJyxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHNlYXJjaCBmb3IgZ2xvYicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sS2luZCgnZ2xvYicpLCAnc2VhcmNoJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRTaGVsbExhbmd1YWdlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnYmFzaCByZXR1cm5zIHNoZWxsc2NyaXB0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNoZWxsTGFuZ3VhZ2UoJ2Jhc2gnKSwgJ3NoZWxsc2NyaXB0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwb3dlcnNoZWxsIHJldHVybnMgcG93ZXJzaGVsbCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTaGVsbExhbmd1YWdlKCdwb3dlcnNoZWxsJyksICdwb3dlcnNoZWxsJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3cml0ZV9iYXNoIHJldHVybnMgc2hlbGxzY3JpcHQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2hlbGxMYW5ndWFnZSgnd3JpdGVfYmFzaCcpLCAnc2hlbGxzY3JpcHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dyaXRlX3Bvd2Vyc2hlbGwgcmV0dXJucyBwb3dlcnNoZWxsJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNoZWxsTGFuZ3VhZ2UoJ3dyaXRlX3Bvd2Vyc2hlbGwnKSwgJ3Bvd2Vyc2hlbGwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRfYmFzaCByZXR1cm5zIHNoZWxsc2NyaXB0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNoZWxsTGFuZ3VhZ2UoJ3JlYWRfYmFzaCcpLCAnc2hlbGxzY3JpcHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRfcG93ZXJzaGVsbCByZXR1cm5zIHBvd2Vyc2hlbGwnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2hlbGxMYW5ndWFnZSgncmVhZF9wb3dlcnNoZWxsJyksICdwb3dlcnNoZWxsJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRJbnZvY2F0aW9uTWVzc2FnZScsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGdldFRleHQobXNnOiBSZXR1cm5UeXBlPHR5cGVvZiBnZXRJbnZvY2F0aW9uTWVzc2FnZT4pOiBzdHJpbmcge1xuXHRcdFx0cmV0dXJuIHR5cGVvZiBtc2cgPT09ICdzdHJpbmcnID8gbXNnIDogbXNnLm1hcmtkb3duO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3dyaXRlX2Jhc2ggd2l0aCBjb21tYW5kIGluY2x1ZGVzIHRoZSBjb21tYW5kIHRleHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtc2cgPSBnZXRJbnZvY2F0aW9uTWVzc2FnZSgnd3JpdGVfYmFzaCcsICdXcml0ZSBTaGVsbCBJbnB1dCcsIHsgY29tbWFuZDogJ2VjaG8gaGVsbG8nIH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKGdldFRleHQobXNnKS5pbmNsdWRlcygnZWNobyBoZWxsbycpLCBgZXhwZWN0ZWQgJ2VjaG8gaGVsbG8nIGluOiAke2dldFRleHQobXNnKX1gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dyaXRlX2Jhc2ggd2l0aG91dCBjb21tYW5kIHJldHVybnMgYSBub24tZW1wdHkgZmFsbGJhY2sgbWVzc2FnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1zZyA9IGdldEludm9jYXRpb25NZXNzYWdlKCd3cml0ZV9iYXNoJywgJ1dyaXRlIFNoZWxsIElucHV0JywgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5vayhnZXRUZXh0KG1zZykubGVuZ3RoID4gMCk7XG5cdFx0XHRhc3NlcnQub2soIWdldFRleHQobXNnKS5pbmNsdWRlcygndW5kZWZpbmVkJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd3JpdGVfcG93ZXJzaGVsbCB3aXRoIGNvbW1hbmQgaW5jbHVkZXMgdGhlIGNvbW1hbmQgdGV4dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1zZyA9IGdldEludm9jYXRpb25NZXNzYWdlKCd3cml0ZV9wb3dlcnNoZWxsJywgJ1dyaXRlIFNoZWxsIElucHV0JywgeyBjb21tYW5kOiAnR2V0LURhdGUnIH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKGdldFRleHQobXNnKS5pbmNsdWRlcygnR2V0LURhdGUnKSwgYGV4cGVjdGVkICdHZXQtRGF0ZScgaW46ICR7Z2V0VGV4dChtc2cpfWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZF9iYXNoIHJldHVybnMgYSBub24tZW1wdHkgbWVzc2FnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1zZyA9IGdldEludm9jYXRpb25NZXNzYWdlKCdyZWFkX2Jhc2gnLCAnUmVhZCBTaGVsbCBPdXRwdXQnLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRleHQobXNnKSwgJ1JlYWRpbmcgVGVybWluYWwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRfcG93ZXJzaGVsbCByZXR1cm5zIGEgbm9uLWVtcHR5IG1lc3NhZ2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtc2cgPSBnZXRJbnZvY2F0aW9uTWVzc2FnZSgncmVhZF9wb3dlcnNoZWxsJywgJ1JlYWQgU2hlbGwgT3V0cHV0JywgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUZXh0KG1zZyksICdSZWFkaW5nIFRlcm1pbmFsJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3cml0ZV9iYXNoIG1lc3NhZ2UgZGlmZmVycyBmcm9tIGJhc2ggbWVzc2FnZSAoZGlzdGluY3Qgd29yZGluZyknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB3cml0ZUJhc2hNc2cgPSBnZXRUZXh0KGdldEludm9jYXRpb25NZXNzYWdlKCd3cml0ZV9iYXNoJywgJ1dyaXRlIFNoZWxsIElucHV0JywgeyBjb21tYW5kOiAnZWNobyBoaScgfSkpO1xuXHRcdFx0Y29uc3QgYmFzaE1zZyA9IGdldFRleHQoZ2V0SW52b2NhdGlvbk1lc3NhZ2UoJ2Jhc2gnLCAnQmFzaCcsIHsgY29tbWFuZDogJ2VjaG8gaGknIH0pKTtcblx0XHRcdC8vIEJvdGggaW5jbHVkZSB0aGUgY29tbWFuZCwgYnV0IHRoZSBzdXJyb3VuZGluZyB0ZXh0IHNob3VsZCBkaWZmZXJcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh3cml0ZUJhc2hNc2csIGJhc2hNc2cpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0UGFzdFRlbnNlTWVzc2FnZScsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGdldFRleHQobXNnOiBSZXR1cm5UeXBlPHR5cGVvZiBnZXRQYXN0VGVuc2VNZXNzYWdlPik6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gdHlwZW9mIG1zZyA9PT0gJ3N0cmluZycgPyBtc2cgOiBtc2cubWFya2Rvd247XG5cdFx0fVxuXG5cdFx0dGVzdCgnd3JpdGVfYmFzaCB3aXRoIGNvbW1hbmQgaW5jbHVkZXMgdGhlIGNvbW1hbmQgdGV4dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1zZyA9IGdldFBhc3RUZW5zZU1lc3NhZ2UoJ3dyaXRlX2Jhc2gnLCAnV3JpdGUgU2hlbGwgSW5wdXQnLCB7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyB9LCB0cnVlKTtcblx0XHRcdGFzc2VydC5vayhnZXRUZXh0KG1zZykuaW5jbHVkZXMoJ2VjaG8gaGVsbG8nKSwgYGV4cGVjdGVkICdlY2hvIGhlbGxvJyBpbjogJHtnZXRUZXh0KG1zZyl9YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3cml0ZV9iYXNoIHdpdGhvdXQgY29tbWFuZCByZXR1cm5zIGEgbm9uLWVtcHR5IGZhbGxiYWNrIG1lc3NhZ2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtc2cgPSBnZXRQYXN0VGVuc2VNZXNzYWdlKCd3cml0ZV9iYXNoJywgJ1dyaXRlIFNoZWxsIElucHV0JywgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5vayhnZXRUZXh0KG1zZykubGVuZ3RoID4gMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3cml0ZV9wb3dlcnNoZWxsIHdpdGggY29tbWFuZCBpbmNsdWRlcyB0aGUgY29tbWFuZCB0ZXh0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbXNnID0gZ2V0UGFzdFRlbnNlTWVzc2FnZSgnd3JpdGVfcG93ZXJzaGVsbCcsICdXcml0ZSBTaGVsbCBJbnB1dCcsIHsgY29tbWFuZDogJ0dldC1EYXRlJyB9LCB0cnVlKTtcblx0XHRcdGFzc2VydC5vayhnZXRUZXh0KG1zZykuaW5jbHVkZXMoJ0dldC1EYXRlJyksIGBleHBlY3RlZCAnR2V0LURhdGUnIGluOiAke2dldFRleHQobXNnKX1gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRfYmFzaCBzdWNjZXNzIHJldHVybnMgYSBub24tZW1wdHkgbWVzc2FnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1zZyA9IGdldFBhc3RUZW5zZU1lc3NhZ2UoJ3JlYWRfYmFzaCcsICdSZWFkIFNoZWxsIE91dHB1dCcsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGV4dChtc2cpLCAnUmVhZCBUZXJtaW5hbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd3JpdGVfYmFzaCBmYWlsdXJlIHJldHVybnMgYSBub24tZW1wdHkgZXJyb3IgbWVzc2FnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1zZyA9IGdldFBhc3RUZW5zZU1lc3NhZ2UoJ3dyaXRlX2Jhc2gnLCAnV3JpdGUgU2hlbGwgSW5wdXQnLCB7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyB9LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQub2soZ2V0VGV4dChtc2cpLmxlbmd0aCA+IDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmVlZGJhY2sgY29tbWVudCB0b29scyAoZGVsZWdhdGVkIHRvIHRoZSBzaGFyZWQgc2VydmVyLXRvb2wgZ3JvdXApJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gdGV4dChtc2c6IFJldHVyblR5cGU8dHlwZW9mIGdldEludm9jYXRpb25NZXNzYWdlPiB8IFJldHVyblR5cGU8dHlwZW9mIGdldFBhc3RUZW5zZU1lc3NhZ2U+KTogc3RyaW5nIHtcblx0XHRcdHJldHVybiB0eXBlb2YgbXNnID09PSAnc3RyaW5nJyA/IG1zZyA6IG1zZy5tYXJrZG93bjtcblx0XHR9XG5cblx0XHQvLyBFeGhhdXN0aXZlIHBlci10b29sL2NvdW50IGNvdmVyYWdlIGxpdmVzIGluIHNlcnZlclRvb2xHcm91cHMudGVzdC50cy5cblx0XHQvLyBUaGVzZSBzbW9rZSBjaGVja3Mgb25seSBhc3NlcnQgdGhhdCB0aGUgQ29waWxvdCBkaXNwbGF5IGZ1bmN0aW9uc1xuXHRcdC8vIGRlbGVnYXRlIHRvIHRoZSBzaGFyZWQgZ3JvdXAgaW5zdGVhZCBvZiBmYWxsaW5nIHRocm91Z2ggdG8gdGhlXG5cdFx0Ly8gZ2VuZXJpYyBgVXNpbmcvVXNlZCBcIjx0b29sPlwiYCBmYWxsYmFjay5cblx0XHR0ZXN0KCdDb3BpbG90IGRpc3BsYXkgZGVsZWdhdGVzIHRvIHRoZSBzaGFyZWQgZ3JvdXAnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsaXN0UmVzdWx0ID0gSlNPTi5zdHJpbmdpZnkoeyBjb21tZW50czogW3sgaWQ6ICdhJyB9LCB7IGlkOiAnYicgfV0gfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZGlzcGxheU5hbWU6IGdldFRvb2xEaXNwbGF5TmFtZSgnbGlzdENvbW1lbnRzJyksXG5cdFx0XHRcdGludm9rZTogdGV4dChnZXRJbnZvY2F0aW9uTWVzc2FnZSgnbGlzdENvbW1lbnRzJywgJ0xpc3QgQ29tbWVudHMnLCB1bmRlZmluZWQpKSxcblx0XHRcdFx0cGFzdDogdGV4dChnZXRQYXN0VGVuc2VNZXNzYWdlKCdsaXN0Q29tbWVudHMnLCAnTGlzdCBDb21tZW50cycsIHVuZGVmaW5lZCwgdHJ1ZSwgbGlzdFJlc3VsdCkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0xpc3QgQ29tbWVudHMnLFxuXHRcdFx0XHRpbnZva2U6ICdMaXN0IGNvbW1lbnRzJyxcblx0XHRcdFx0cGFzdDogJ0xpc3QgY29tbWVudHMnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWlsZWQgZmVlZGJhY2sgdG9vbCBzdGlsbCB1c2VzIHRoZSBnZW5lcmljIGZhaWx1cmUgbWVzc2FnZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0KGdldFBhc3RUZW5zZU1lc3NhZ2UoJ2xpc3RDb21tZW50cycsICdMaXN0IENvbW1lbnRzJywgdW5kZWZpbmVkLCBmYWxzZSkpLCAnXCJMaXN0IENvbW1lbnRzXCIgZmFpbGVkJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRUb29sSW5wdXRTdHJpbmcnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCd3cml0ZV9iYXNoIGV4dHJhY3RzIGNvbW1hbmQgZmllbGQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VG9vbElucHV0U3RyaW5nKCd3cml0ZV9iYXNoJywgeyBjb21tYW5kOiAnZWNobyBoZWxsbycgfSwgdW5kZWZpbmVkKSwgJ2VjaG8gaGVsbG8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dyaXRlX3Bvd2Vyc2hlbGwgZXh0cmFjdHMgY29tbWFuZCBmaWVsZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sSW5wdXRTdHJpbmcoJ3dyaXRlX3Bvd2Vyc2hlbGwnLCB7IGNvbW1hbmQ6ICdHZXQtRGF0ZScgfSwgdW5kZWZpbmVkKSwgJ0dldC1EYXRlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3cml0ZV9iYXNoIGZhbGxzIGJhY2sgdG8gcmF3QXJndW1lbnRzIHdoZW4gbm8gY29tbWFuZCBmaWVsZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sSW5wdXRTdHJpbmcoJ3dyaXRlX2Jhc2gnLCB7fSwgJ3tcImNvbW1hbmRcIjpcImVjaG8gaGVsbG9cIn0nKSwgJ3tcImNvbW1hbmRcIjpcImVjaG8gaGVsbG9cIn0nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dyaXRlX2Jhc2ggcmV0dXJucyB1bmRlZmluZWQgd2hlbiBib3RoIHBhcmFtZXRlcnMgYW5kIHJhd0FyZ3VtZW50cyBhcmUgYWJzZW50JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xJbnB1dFN0cmluZygnd3JpdGVfYmFzaCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRfYmFzaCB3aXRoIG5vIHBhcmFtZXRlcnMgcmV0dXJucyB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VG9vbElucHV0U3RyaW5nKCdyZWFkX2Jhc2gnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdza2lsbCBldmVudHMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaGlkZXMgdGhlIHJhdyBgc2tpbGxgIHRvb2wgY2FsbCBhbmQgc3ludGhlc2l6ZXMgYSB0b29sLXN0YXJ0L2NvbXBsZXRlIHBhaXIgZnJvbSBgc2tpbGwuaW52b2tlZGAnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd2l0aFBhdGggPSBzeW50aGVzaXplU2tpbGxUb29sQ2FsbChcblx0XHRcdHsgbmFtZTogJ3BsYW4nLCBwYXRoOiAnL2Ficy9yZXBvL3NraWxscy9wbGFuL1NLSUxMLm1kJywgY29udGVudDogJycgfSxcblx0XHRcdCdldnQtMTIzJyxcblx0XHQpO1xuXHRcdGNvbnN0IHdpdGhvdXRFdmVudElkID0gc3ludGhlc2l6ZVNraWxsVG9vbENhbGwoXG5cdFx0XHR7IG5hbWU6ICdwbGFuJywgcGF0aDogJy9hYnMvcmVwby9za2lsbHMvcGxhbi9TS0lMTC5tZCcsIGNvbnRlbnQ6ICcnIH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2tpbGxJc0hpZGRlbjogaXNIaWRkZW5Ub29sKCdza2lsbCcpLFxuXHRcdFx0d2l0aFBhdGhUb29sQ2FsbElkOiB3aXRoUGF0aC50b29sQ2FsbElkLFxuXHRcdFx0d2l0aFBhdGhUb29sTmFtZTogd2l0aFBhdGgudG9vbE5hbWUsXG5cdFx0XHR3aXRoUGF0aERpc3BsYXlOYW1lOiB3aXRoUGF0aC5kaXNwbGF5TmFtZSxcblx0XHRcdHdpdGhQYXRoSW52b2NhdGlvbjogd2l0aFBhdGguaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHR3aXRoUGF0aFBhc3RUZW5zZTogd2l0aFBhdGgucGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdHdpdGhvdXRFdmVudElkVG9vbENhbGxJZDogd2l0aG91dEV2ZW50SWQudG9vbENhbGxJZCxcblx0XHRcdHdpdGhvdXRFdmVudElkSW52b2NhdGlvbjogd2l0aG91dEV2ZW50SWQuaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHR3aXRob3V0RXZlbnRJZFBhc3RUZW5zZTogd2l0aG91dEV2ZW50SWQucGFzdFRlbnNlTWVzc2FnZSxcblx0XHR9LCB7XG5cdFx0XHRza2lsbElzSGlkZGVuOiB0cnVlLFxuXHRcdFx0d2l0aFBhdGhUb29sQ2FsbElkOiAnc3ludGgtc2tpbGwtZXZ0LTEyMycsXG5cdFx0XHR3aXRoUGF0aFRvb2xOYW1lOiAnc2tpbGwnLFxuXHRcdFx0d2l0aFBhdGhEaXNwbGF5TmFtZTogJ1JlYWQgU2tpbGwnLFxuXHRcdFx0d2l0aFBhdGhJbnZvY2F0aW9uOiB7IG1hcmtkb3duOiAnUmVhZCBza2lsbCBbcGxhbl0oZmlsZTovLy9hYnMvcmVwby9za2lsbHMvcGxhbi9TS0lMTC5tZCknIH0sXG5cdFx0XHR3aXRoUGF0aFBhc3RUZW5zZTogeyBtYXJrZG93bjogJ1JlYWQgc2tpbGwgW3BsYW5dKGZpbGU6Ly8vYWJzL3JlcG8vc2tpbGxzL3BsYW4vU0tJTEwubWQpJyB9LFxuXHRcdFx0d2l0aG91dEV2ZW50SWRUb29sQ2FsbElkOiAnc3ludGgtc2tpbGwtLTE1NzUzNTM5Jyxcblx0XHRcdHdpdGhvdXRFdmVudElkSW52b2NhdGlvbjogeyBtYXJrZG93bjogJ1JlYWQgc2tpbGwgW3BsYW5dKGZpbGU6Ly8vYWJzL3JlcG8vc2tpbGxzL3BsYW4vU0tJTEwubWQpJyB9LFxuXHRcdFx0d2l0aG91dEV2ZW50SWRQYXN0VGVuc2U6IHsgbWFya2Rvd246ICdSZWFkIHNraWxsIFtwbGFuXShmaWxlOi8vL2Ficy9yZXBvL3NraWxscy9wbGFuL1NLSUxMLm1kKScgfSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3JnIC8gZ3JlcCBzZWFyY2ggdG9vbCBkaXNwbGF5JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHRleHQobXNnOiBSZXR1cm5UeXBlPHR5cGVvZiBnZXRJbnZvY2F0aW9uTWVzc2FnZT4pOiBzdHJpbmcge1xuXHRcdHJldHVybiB0eXBlb2YgbXNnID09PSAnc3RyaW5nJyA/IG1zZyA6IG1zZy5tYXJrZG93bjtcblx0fVxuXG5cdHRlc3QoJ3JnIHVzZXMgb25lIHN0YWJsZSBzZWFyY2ggbWVzc2FnZScsICgpID0+IHtcblx0XHRjb25zdCBpbnYgPSB0ZXh0KGdldEludm9jYXRpb25NZXNzYWdlKCdyZycsICdTZWFyY2gnLCB7IHBhdHRlcm46ICdmb28nIH0pKTtcblx0XHRjb25zdCBwYXN0ID0gdGV4dChnZXRQYXN0VGVuc2VNZXNzYWdlKCdyZycsICdTZWFyY2gnLCB7IHBhdHRlcm46ICdmb28nIH0sIHRydWUpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgaW52LCBwYXN0IH0sIHtcblx0XHRcdGludjogJ1NlYXJjaCBmb3IgYGZvb2AnLFxuXHRcdFx0cGFzdDogJ1NlYXJjaCBmb3IgYGZvb2AnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZyB3aXRob3V0IGEgcGF0dGVybiBmYWxscyBiYWNrIHRvIGEgZ2VuZXJpYyBzZWFyY2ggbWVzc2FnZSAobm90IHRoZSByYXcgdG9vbCBuYW1lKScsICgpID0+IHtcblx0XHRjb25zdCBpbnYgPSB0ZXh0KGdldEludm9jYXRpb25NZXNzYWdlKCdyZycsICdTZWFyY2gnLCB1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52LCAnU2VhcmNoIGZpbGVzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dyZXAgdXNlcyBvbmUgc3RhYmxlIHNlYXJjaCBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGludiA9IHRleHQoZ2V0SW52b2NhdGlvbk1lc3NhZ2UoJ2dyZXAnLCAnU2VhcmNoJywgeyBwYXR0ZXJuOiAnYmFyJyB9KSk7XG5cdFx0Y29uc3QgcGFzdCA9IHRleHQoZ2V0UGFzdFRlbnNlTWVzc2FnZSgnZ3JlcCcsICdTZWFyY2gnLCB7IHBhdHRlcm46ICdiYXInIH0sIHRydWUpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgaW52LCBwYXN0IH0sIHtcblx0XHRcdGludjogJ1NlYXJjaCBmb3IgYGJhcmAnLFxuXHRcdFx0cGFzdDogJ1NlYXJjaCBmb3IgYGJhcmAnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRUb29sSW5wdXRTdHJpbmcgcmV0dXJucyBwYXR0ZXJuIGZvciBib3RoIGdyZXAgYW5kIHJnJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sSW5wdXRTdHJpbmcoJ2dyZXAnLCB7IHBhdHRlcm46ICdhYmMnIH0sIHVuZGVmaW5lZCksICdhYmMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VG9vbElucHV0U3RyaW5nKCdyZycsIHsgcGF0dGVybjogJ2FiYycgfSwgdW5kZWZpbmVkKSwgJ2FiYycpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnd2ViX2ZldGNoIHRvb2wgZGlzcGxheScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiB0ZXh0KG1zZzogUmV0dXJuVHlwZTx0eXBlb2YgZ2V0SW52b2NhdGlvbk1lc3NhZ2U+IHwgUmV0dXJuVHlwZTx0eXBlb2YgZ2V0UGFzdFRlbnNlTWVzc2FnZT4pOiBzdHJpbmcge1xuXHRcdHJldHVybiB0eXBlb2YgbXNnID09PSAnc3RyaW5nJyA/IG1zZyA6IG1zZy5tYXJrZG93bjtcblx0fVxuXG5cdHRlc3QoJ3VzZXMgdGhlIGZldGNoZWQgVVJMIGZvciBpbnZvY2F0aW9uIGFuZCBjb21wbGV0aW9uIG1lc3NhZ2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcmFtZXRlcnMgPSB7IHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vZG9jcycgfTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGludm9jYXRpb246IHRleHQoZ2V0SW52b2NhdGlvbk1lc3NhZ2UoJ3dlYl9mZXRjaCcsICdGZXRjaCBXZWIgQ29udGVudCcsIHBhcmFtZXRlcnMpKSxcblx0XHRcdHBhc3RUZW5zZTogdGV4dChnZXRQYXN0VGVuc2VNZXNzYWdlKCd3ZWJfZmV0Y2gnLCAnRmV0Y2ggV2ViIENvbnRlbnQnLCBwYXJhbWV0ZXJzLCB0cnVlKSksXG5cdFx0XHRpbnB1dDogZ2V0VG9vbElucHV0U3RyaW5nKCd3ZWJfZmV0Y2gnLCBwYXJhbWV0ZXJzLCB1bmRlZmluZWQpLFxuXHRcdH0sIHtcblx0XHRcdGludm9jYXRpb246ICdGZXRjaGluZyBbaHR0cHM6Ly9leGFtcGxlLmNvbS9kb2NzXShodHRwczovL2V4YW1wbGUuY29tL2RvY3MpJyxcblx0XHRcdHBhc3RUZW5zZTogJ0ZldGNoZWQgW2h0dHBzOi8vZXhhbXBsZS5jb20vZG9jc10oaHR0cHM6Ly9leGFtcGxlLmNvbS9kb2NzKScsXG5cdFx0XHRpbnB1dDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vZG9jcycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gZ2VuZXJpYyBVUkwgd29yZGluZyB3aGVuIHRoZSBVUkwgaXMgYWJzZW50JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aW52b2NhdGlvbjogdGV4dChnZXRJbnZvY2F0aW9uTWVzc2FnZSgnd2ViX2ZldGNoJywgJ0ZldGNoIFdlYiBDb250ZW50JywgdW5kZWZpbmVkKSksXG5cdFx0XHRwYXN0VGVuc2U6IHRleHQoZ2V0UGFzdFRlbnNlTWVzc2FnZSgnd2ViX2ZldGNoJywgJ0ZldGNoIFdlYiBDb250ZW50JywgdW5kZWZpbmVkLCB0cnVlKSksXG5cdFx0XHRmYWlsdXJlOiB0ZXh0KGdldFBhc3RUZW5zZU1lc3NhZ2UoJ3dlYl9mZXRjaCcsICdGZXRjaCBXZWIgQ29udGVudCcsIHsgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9kb2NzJyB9LCBmYWxzZSkpLFxuXHRcdH0sIHtcblx0XHRcdGludm9jYXRpb246ICdGZXRjaGluZyBVUkwnLFxuXHRcdFx0cGFzdFRlbnNlOiAnRmV0Y2hlZCBVUkwnLFxuXHRcdFx0ZmFpbHVyZTogJ1wiRmV0Y2ggV2ViIENvbnRlbnRcIiBmYWlsZWQnLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnc2VhcmNoIHRvb2wgZGlzcGxheScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiB0ZXh0KG1zZzogUmV0dXJuVHlwZTx0eXBlb2YgZ2V0SW52b2NhdGlvbk1lc3NhZ2U+IHwgUmV0dXJuVHlwZTx0eXBlb2YgZ2V0UGFzdFRlbnNlTWVzc2FnZT4pOiBzdHJpbmcge1xuXHRcdHJldHVybiB0eXBlb2YgbXNnID09PSAnc3RyaW5nJyA/IG1zZyA6IG1zZy5tYXJrZG93bjtcblx0fVxuXG5cdHRlc3QoJ3dlYiBzZWFyY2ggaGFzIHByb2dyZXNzIHdvcmRpbmcgd2hpbGUgY29kZSBzZWFyY2ggc3RheXMgc3RhYmxlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0d2ViSW52b2NhdGlvbjogdGV4dChnZXRJbnZvY2F0aW9uTWVzc2FnZSgnd2ViX3NlYXJjaCcsICdXZWIgU2VhcmNoJywgeyBxdWVyeTogJ1ZTIENvZGUgdGVzdHMnIH0pKSxcblx0XHRcdHdlYkNvbXBsZXRlOiB0ZXh0KGdldFBhc3RUZW5zZU1lc3NhZ2UoJ3dlYl9zZWFyY2gnLCAnV2ViIFNlYXJjaCcsIHsgcXVlcnk6ICdWUyBDb2RlIHRlc3RzJyB9LCB0cnVlKSksXG5cdFx0XHRjb2RlSW52b2NhdGlvbjogdGV4dChnZXRJbnZvY2F0aW9uTWVzc2FnZSgnc2VhcmNoX2NvZGVfc3ViYWdlbnQnLCAnU2VhcmNoIENvZGUnLCB7IHF1ZXJ5OiAndG9vbCBkaXNwbGF5IG1hcHBpbmcnIH0pKSxcblx0XHRcdGNvZGVDb21wbGV0ZTogdGV4dChnZXRQYXN0VGVuc2VNZXNzYWdlKCdzZWFyY2hfY29kZV9zdWJhZ2VudCcsICdTZWFyY2ggQ29kZScsIHsgcXVlcnk6ICd0b29sIGRpc3BsYXkgbWFwcGluZycgfSwgdHJ1ZSkpLFxuXHRcdH0sIHtcblx0XHRcdHdlYkludm9jYXRpb246ICdTZWFyY2hpbmcgdGhlIHdlYiBmb3IgYFZTIENvZGUgdGVzdHNgJyxcblx0XHRcdHdlYkNvbXBsZXRlOiAnU2VhcmNoZWQgdGhlIHdlYiBmb3IgYFZTIENvZGUgdGVzdHNgJyxcblx0XHRcdGNvZGVJbnZvY2F0aW9uOiAnU2VhcmNoIGNvZGUgZm9yIGB0b29sIGRpc3BsYXkgbWFwcGluZ2AnLFxuXHRcdFx0Y29kZUNvbXBsZXRlOiAnU2VhcmNoIGNvZGUgZm9yIGB0b29sIGRpc3BsYXkgbWFwcGluZ2AnLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnc3FsIHRvb2wgZGlzcGxheScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiB0ZXh0KG1zZzogUmV0dXJuVHlwZTx0eXBlb2YgZ2V0SW52b2NhdGlvbk1lc3NhZ2U+IHwgUmV0dXJuVHlwZTx0eXBlb2YgZ2V0UGFzdFRlbnNlTWVzc2FnZT4pOiBzdHJpbmcge1xuXHRcdHJldHVybiB0eXBlb2YgbXNnID09PSAnc3RyaW5nJyA/IG1zZyA6IG1zZy5tYXJrZG93bjtcblx0fVxuXG5cdHRlc3QoJ3VzZXMgdGhlIFNRTCBkZXNjcmlwdGlvbiBmb3IgaW52b2NhdGlvbiBhbmQgY29tcGxldGlvbiBtZXNzYWdlcycsICgpID0+IHtcblx0XHRjb25zdCBwYXJhbWV0ZXJzID0geyBkZXNjcmlwdGlvbjogJ0luc2VydCBhZ2VudCBob3N0IHN0dWR5IHRvZG9zJywgcXVlcnk6ICdJTlNFUlQgSU5UTyB0b2RvcyAodGl0bGUpIFZBTFVFUyAoXFwnUmVhZCB0ZXJtaW5hbCBhY3RpdmF0aW9uIGRvY3NcXCcpJyB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0KGdldEludm9jYXRpb25NZXNzYWdlKCdzcWwnLCAnRXhlY3V0ZSBTUUwnLCBwYXJhbWV0ZXJzKSksICdJbnNlcnQgYWdlbnQgaG9zdCBzdHVkeSB0b2RvcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0KGdldFBhc3RUZW5zZU1lc3NhZ2UoJ3NxbCcsICdFeGVjdXRlIFNRTCcsIHBhcmFtZXRlcnMsIHRydWUpKSwgJ0luc2VydCBhZ2VudCBob3N0IHN0dWR5IHRvZG9zJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gZ2VuZXJpYyBTUUwgd29yZGluZyB3aGVuIGRlc2NyaXB0aW9uIGlzIGFic2VudCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dChnZXRJbnZvY2F0aW9uTWVzc2FnZSgnc3FsJywgJ0V4ZWN1dGUgU1FMJywgeyBxdWVyeTogJ1NFTEVDVCAxJyB9KSksICdFeGVjdXRlIFNRTCBxdWVyeScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0KGdldFBhc3RUZW5zZU1lc3NhZ2UoJ3NxbCcsICdFeGVjdXRlIFNRTCcsIHsgcXVlcnk6ICdTRUxFQ1QgMScgfSwgdHJ1ZSkpLCAnRXhlY3V0ZSBTUUwgcXVlcnknKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2FwcGx5X3BhdGNoIHRvb2wgZGlzcGxheScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiB0ZXh0KG1zZzogUmV0dXJuVHlwZTx0eXBlb2YgZ2V0SW52b2NhdGlvbk1lc3NhZ2U+KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdHlwZW9mIG1zZyA9PT0gJ3N0cmluZycgPyBtc2cgOiBtc2cubWFya2Rvd247XG5cdH1cblxuXHRjb25zdCBzaW5nbGVGaWxlUGF0Y2ggPSBbXG5cdFx0JyoqKiBCZWdpbiBQYXRjaCcsXG5cdFx0JyoqKiBVcGRhdGUgRmlsZTogL3JlcG8vc3JjL2Zvby50cycsXG5cdFx0J0BAJyxcblx0XHQnLW9sZCcsXG5cdFx0JytuZXcnLFxuXHRcdCcqKiogRW5kIFBhdGNoJyxcblx0XS5qb2luKCdcXG4nKTtcblxuXHRjb25zdCBtdWx0aUZpbGVQYXRjaCA9IFtcblx0XHQnKioqIEJlZ2luIFBhdGNoJyxcblx0XHQnKioqIFVwZGF0ZSBGaWxlOiAvcmVwby9zcmMvZm9vLnRzJyxcblx0XHQnQEAnLFxuXHRcdCctb2xkJyxcblx0XHQnK25ldycsXG5cdFx0JyoqKiBBZGQgRmlsZTogL3JlcG8vc3JjL2Jhci50cycsXG5cdFx0JytoZWxsbycsXG5cdFx0JyoqKiBEZWxldGUgRmlsZTogL3JlcG8vc3JjL2Jhei50cycsXG5cdFx0JyoqKiBFbmQgUGF0Y2gnLFxuXHRdLmpvaW4oJ1xcbicpO1xuXG5cdHRlc3QoJ3JlbmRlcnMgYSBjbGlja2FibGUgZmlsZSBsaW5rIGZvciBhIHNpbmdsZS1maWxlIHBhdGNoJywgKCkgPT4ge1xuXHRcdGNvbnN0IGludiA9IHRleHQoZ2V0SW52b2NhdGlvbk1lc3NhZ2UoJ2FwcGx5X3BhdGNoJywgJ1BhdGNoJywgeyBpbnB1dDogc2luZ2xlRmlsZVBhdGNoIH0pKTtcblx0XHRjb25zdCBwYXN0ID0gdGV4dChnZXRQYXN0VGVuc2VNZXNzYWdlKCdhcHBseV9wYXRjaCcsICdQYXRjaCcsIHsgaW5wdXQ6IHNpbmdsZUZpbGVQYXRjaCB9LCB0cnVlKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGludiwgcGFzdCB9LCB7XG5cdFx0XHRpbnY6ICdFZGl0IFtmb28udHNdKGZpbGU6Ly8vcmVwby9zcmMvZm9vLnRzKScsXG5cdFx0XHRwYXN0OiAnRWRpdCBbZm9vLnRzXShmaWxlOi8vL3JlcG8vc3JjL2Zvby50cyknLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0cyBldmVyeSBhZmZlY3RlZCBmaWxlIGZvciBhIG11bHRpLWZpbGUgcGF0Y2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW52ID0gdGV4dChnZXRJbnZvY2F0aW9uTWVzc2FnZSgnYXBwbHlfcGF0Y2gnLCAnUGF0Y2gnLCB7IGlucHV0OiBtdWx0aUZpbGVQYXRjaCB9KSk7XG5cdFx0Y29uc3QgcGFzdCA9IHRleHQoZ2V0UGFzdFRlbnNlTWVzc2FnZSgnYXBwbHlfcGF0Y2gnLCAnUGF0Y2gnLCB7IGlucHV0OiBtdWx0aUZpbGVQYXRjaCB9LCB0cnVlKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGludiwgcGFzdCB9LCB7XG5cdFx0XHRpbnY6ICdFZGl0IFtmb28udHNdKGZpbGU6Ly8vcmVwby9zcmMvZm9vLnRzKSwgW2Jhci50c10oZmlsZTovLy9yZXBvL3NyYy9iYXIudHMpLCBbYmF6LnRzXShmaWxlOi8vL3JlcG8vc3JjL2Jhei50cyknLFxuXHRcdFx0cGFzdDogJ0VkaXQgW2Zvby50c10oZmlsZTovLy9yZXBvL3NyYy9mb28udHMpLCBbYmFyLnRzXShmaWxlOi8vL3JlcG8vc3JjL2Jhci50cyksIFtiYXoudHNdKGZpbGU6Ly8vcmVwby9zcmMvYmF6LnRzKScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gYSBnZW5lcmljIG1lc3NhZ2Ugd2hlbiB0aGUgcGF0Y2ggYm9keSBpcyBtaXNzaW5nIG9yIHVucGFyc2VhYmxlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRJbnZvY2F0aW9uTWVzc2FnZSgnYXBwbHlfcGF0Y2gnLCAnUGF0Y2gnLCB1bmRlZmluZWQpLCAnRWRpdCBmaWxlcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRJbnZvY2F0aW9uTWVzc2FnZSgnYXBwbHlfcGF0Y2gnLCAnUGF0Y2gnLCB7IGlucHV0OiAnbm90IGEgcGF0Y2gnIH0pLCAnRWRpdCBmaWxlcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQYXN0VGVuc2VNZXNzYWdlKCdhcHBseV9wYXRjaCcsICdQYXRjaCcsIHVuZGVmaW5lZCwgdHJ1ZSksICdFZGl0IGZpbGVzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Fsc28gYWNjZXB0cyB0aGUgcGF0Y2ggdGV4dCB1bmRlciB0aGUgYHBhdGNoYCBwYXJhbWV0ZXIgKENMSSBzaGFwZSknLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW52ID0gdGV4dChnZXRJbnZvY2F0aW9uTWVzc2FnZSgnYXBwbHlfcGF0Y2gnLCAnUGF0Y2gnLCB7IHBhdGNoOiBzaW5nbGVGaWxlUGF0Y2ggfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnYsICdFZGl0IFtmb28udHNdKGZpbGU6Ly8vcmVwby9zcmMvZm9vLnRzKScpO1xuXHR9KTtcblxuXHR0ZXN0KCdnaXRfYXBwbHlfcGF0Y2ggc2hhcmVzIHRoZSBzYW1lIGRpc3BsYXkgcGF0aCcsICgpID0+IHtcblx0XHRjb25zdCBpbnYgPSB0ZXh0KGdldEludm9jYXRpb25NZXNzYWdlKCdnaXRfYXBwbHlfcGF0Y2gnLCAnUGF0Y2gnLCB7IGlucHV0OiBzaW5nbGVGaWxlUGF0Y2ggfSkpO1xuXHRcdGNvbnN0IHBhc3QgPSB0ZXh0KGdldFBhc3RUZW5zZU1lc3NhZ2UoJ2dpdF9hcHBseV9wYXRjaCcsICdQYXRjaCcsIHsgaW5wdXQ6IHNpbmdsZUZpbGVQYXRjaCB9LCB0cnVlKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGludiwgcGFzdCB9LCB7XG5cdFx0XHRpbnY6ICdFZGl0IFtmb28udHNdKGZpbGU6Ly8vcmVwby9zcmMvZm9vLnRzKScsXG5cdFx0XHRwYXN0OiAnRWRpdCBbZm9vLnRzXShmaWxlOi8vL3JlcG8vc3JjL2Zvby50cyknLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWlsdXJlIHN0aWxsIHJvdXRlcyB0aHJvdWdoIHRoZSBnZW5lcmljIGZhaWxlZCBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQYXN0VGVuc2VNZXNzYWdlKCdhcHBseV9wYXRjaCcsICdQYXRjaCcsIHsgaW5wdXQ6IHNpbmdsZUZpbGVQYXRjaCB9LCBmYWxzZSksICdcIlBhdGNoXCIgZmFpbGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEVkaXRGaWxlUGF0aCByZXR1cm5zIHRoZSBmaXJzdCBhZmZlY3RlZCBmaWxlIGZyb20gYSBwYXRjaCBib2R5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRFZGl0RmlsZVBhdGgoeyBpbnB1dDogc2luZ2xlRmlsZVBhdGNoIH0pLCAnL3JlcG8vc3JjL2Zvby50cycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRFZGl0RmlsZVBhdGgoeyBpbnB1dDogbXVsdGlGaWxlUGF0Y2ggfSksICcvcmVwby9zcmMvZm9vLnRzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEVkaXRGaWxlUGF0aCh7IHBhdGNoOiBzaW5nbGVGaWxlUGF0Y2ggfSksICcvcmVwby9zcmMvZm9vLnRzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEVkaXRGaWxlUGF0aChKU09OLnN0cmluZ2lmeSh7IGlucHV0OiBzaW5nbGVGaWxlUGF0Y2ggfSkpLCAnL3JlcG8vc3JjL2Zvby50cycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRFZGl0RmlsZVBhdGgoeyBpbnB1dDogJ25vdCBhIHBhdGNoJyB9KSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RWRpdEZpbGVQYXRocyByZXR1cm5zIGV2ZXJ5IGFmZmVjdGVkIGZpbGUgZnJvbSBhIHBhdGNoIGJvZHknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRFZGl0RmlsZVBhdGhzKHsgaW5wdXQ6IHNpbmdsZUZpbGVQYXRjaCB9KSwgWycvcmVwby9zcmMvZm9vLnRzJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RWRpdEZpbGVQYXRocyh7IGlucHV0OiBtdWx0aUZpbGVQYXRjaCB9KSwgWycvcmVwby9zcmMvZm9vLnRzJywgJy9yZXBvL3NyYy9iYXIudHMnLCAnL3JlcG8vc3JjL2Jhei50cyddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEVkaXRGaWxlUGF0aHMoeyBwYXRjaDogbXVsdGlGaWxlUGF0Y2ggfSksIFsnL3JlcG8vc3JjL2Zvby50cycsICcvcmVwby9zcmMvYmFyLnRzJywgJy9yZXBvL3NyYy9iYXoudHMnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRFZGl0RmlsZVBhdGhzKEpTT04uc3RyaW5naWZ5KHsgaW5wdXQ6IG11bHRpRmlsZVBhdGNoIH0pKSwgWycvcmVwby9zcmMvZm9vLnRzJywgJy9yZXBvL3NyYy9iYXIudHMnLCAnL3JlcG8vc3JjL2Jhei50cyddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEVkaXRGaWxlUGF0aHMoeyBwYXRoOiAnL3JlcG8vc3JjL2VkaXQudHMnIH0pLCBbJy9yZXBvL3NyYy9lZGl0LnRzJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RWRpdEZpbGVQYXRocyh7IGlucHV0OiAnbm90IGEgcGF0Y2gnIH0pLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRFZGl0RmlsZVBhdGhzKHVuZGVmaW5lZCksIFtdKTtcblx0XHQvLyBTREsgY3VzdG9tLXRvb2wgZm9ybWF0OiBhcmd1bWVudHMgYXJyaXZlIGFzIGEgcmF3IFY0QSBwYXRjaCBzdHJpbmcsXG5cdFx0Ly8gbm90IGFzIGEgSlNPTiBvYmplY3QgXHUyMDE0IGV4ZXJjaXNlIHRoZSBzdHJpbmcgZmFsbGJhY2sgcGF0aC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEVkaXRGaWxlUGF0aHMobXVsdGlGaWxlUGF0Y2gpLCBbJy9yZXBvL3NyYy9mb28udHMnLCAnL3JlcG8vc3JjL2Jhci50cycsICcvcmVwby9zcmMvYmF6LnRzJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RWRpdEZpbGVQYXRocyhzaW5nbGVGaWxlUGF0Y2gpLCBbJy9yZXBvL3NyYy9mb28udHMnXSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdnZXRTaGVsbEludGVudGlvbicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVhZHMgdGhlIGRlc2NyaXB0aW9uIGFyZ3VtZW50IG9mIHNoZWxsIHRvb2xzLCBhbmQgaWdub3JlcyBub24tc2hlbGwgdG9vbHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiYXNoOiBnZXRTaGVsbEludGVudGlvbignYmFzaCcsIHsgY29tbWFuZDogJ2xzJywgZGVzY3JpcHRpb246ICdMaXN0IGZpbGVzJyB9KSxcblx0XHRcdHBvd2Vyc2hlbGw6IGdldFNoZWxsSW50ZW50aW9uKCdwb3dlcnNoZWxsJywgeyBjb21tYW5kOiAnR2V0LUNoaWxkSXRlbScsIGRlc2NyaXB0aW9uOiAnTGlzdCBmaWxlcycgfSksXG5cdFx0XHRzaGVsbE5vRGVzY3JpcHRpb246IGdldFNoZWxsSW50ZW50aW9uKCdiYXNoJywgeyBjb21tYW5kOiAnbHMnIH0pLFxuXHRcdFx0c2hlbGxFbXB0eURlc2NyaXB0aW9uOiBnZXRTaGVsbEludGVudGlvbignYmFzaCcsIHsgY29tbWFuZDogJ2xzJywgZGVzY3JpcHRpb246ICcnIH0pLFxuXHRcdFx0Ly8gVGhlIGB0YXNrYCAoc3ViYWdlbnQpIHRvb2wgYWxzbyBoYXMgYSBgZGVzY3JpcHRpb25gIGFyZ3VtZW50LCBidXQgaXQgaXNcblx0XHRcdC8vIHRoZSBzdWJhZ2VudCB0YXNrIGRlc2NyaXB0aW9uLCBub3QgYSBzaGVsbCBpbnRlbnRpb24gXHUyMDE0IG11c3QgYmUgaWdub3JlZC5cblx0XHRcdHRhc2tUb29sOiBnZXRTaGVsbEludGVudGlvbigndGFzaycsIHsgZGVzY3JpcHRpb246ICdFeHBsb3JlIHRoZSBjb2RlYmFzZScgfSksXG5cdFx0XHR2aWV3VG9vbDogZ2V0U2hlbGxJbnRlbnRpb24oJ3ZpZXcnLCB7IHBhdGg6ICcvcmVwby9maWxlLnRzJywgZGVzY3JpcHRpb246ICd3aHknIH0pLFxuXHRcdFx0bm9BcmdzOiBnZXRTaGVsbEludGVudGlvbignYmFzaCcsIHVuZGVmaW5lZCksXG5cdFx0fSwge1xuXHRcdFx0YmFzaDogJ0xpc3QgZmlsZXMnLFxuXHRcdFx0cG93ZXJzaGVsbDogJ0xpc3QgZmlsZXMnLFxuXHRcdFx0c2hlbGxOb0Rlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRzaGVsbEVtcHR5RGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdHRhc2tUb29sOiB1bmRlZmluZWQsXG5cdFx0XHR2aWV3VG9vbDogdW5kZWZpbmVkLFxuXHRcdFx0bm9BcmdzOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFFbkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsaUJBQWlCLGtCQUFrQixzQkFBc0IscUJBQXFCLHNCQUFzQixtQkFBbUIsa0JBQWtCLCtCQUErQixvQkFBb0Isb0JBQW9CLGFBQWEsd0JBQXdCLFlBQVksY0FBYyx3QkFBd0IsK0JBQStCO0FBSy9VLFNBQVMsdUJBQXVCLGlCQUF5QixzQkFBK0Q7QUFDdkgsU0FBTztBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04seUJBQXlCO0FBQUEsSUFDekIsVUFBVSxDQUFDO0FBQUEsSUFDWDtBQUFBLElBQ0EseUJBQXlCO0FBQUEsSUFDekIsV0FBVztBQUFBLElBQ1gsZUFBZSxDQUFDO0FBQUEsSUFDaEIsY0FBYyxDQUFDO0FBQUEsSUFDZjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLFNBQVMsNEJBQTRCLFVBQWtCLE1BQXFEO0FBQzNHLFNBQU87QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOO0FBQUEsSUFDQSxpQkFBaUI7QUFBQSxJQUNqQjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0saURBQTRDLE1BQU07QUFFdkQsMENBQXdDO0FBRXhDLE9BQUsseUVBQXlFLE1BQU07QUFDbkYsVUFBTSxRQUF3RDtBQUFBLE1BQzdELENBQUMsUUFBUSxtQkFBbUI7QUFBQSxNQUM1QixDQUFDLGNBQWMsbUJBQW1CO0FBQUEsTUFDbEMsQ0FBQyxhQUFhLGVBQWU7QUFBQSxNQUM3QixDQUFDLG1CQUFtQixlQUFlO0FBQUEsTUFDbkMsQ0FBQyxjQUFjLGVBQWU7QUFBQSxNQUM5QixDQUFDLG9CQUFvQixxQkFBcUI7QUFBQSxNQUMxQyxDQUFDLGFBQWEsdUJBQXVCO0FBQUEsTUFDckMsQ0FBQyxtQkFBbUIsdUJBQXVCO0FBQUEsTUFDM0MsQ0FBQyxpQkFBaUIsdUJBQXVCO0FBQUEsTUFDekMsQ0FBQyx1QkFBdUIsdUJBQXVCO0FBQUEsTUFDL0MsQ0FBQyxhQUFhLHFCQUFxQjtBQUFBLE1BQ25DLENBQUMsbUJBQW1CLHFCQUFxQjtBQUFBLE1BQ3pDLENBQUMsUUFBUSxNQUFNO0FBQUEsTUFDZixDQUFDLFFBQVEsV0FBVztBQUFBLE1BQ3BCLENBQUMsc0JBQXNCLFdBQVc7QUFBQSxNQUNsQyxDQUFDLGVBQWUsV0FBVztBQUFBLE1BQzNCLENBQUMsVUFBVSxXQUFXO0FBQUEsTUFDdEIsQ0FBQyxVQUFVLGFBQWE7QUFBQSxNQUN4QixDQUFDLFFBQVEsUUFBUTtBQUFBLE1BQ2pCLENBQUMsTUFBTSxRQUFRO0FBQUEsTUFDZixDQUFDLFFBQVEsUUFBUTtBQUFBLE1BQ2pCLENBQUMsd0JBQXdCLGFBQWE7QUFBQSxNQUN0QyxDQUFDLG9CQUFvQixrQkFBa0I7QUFBQSxNQUN2QyxDQUFDLGVBQWUsYUFBYTtBQUFBLE1BQzdCLENBQUMsU0FBUyxVQUFVO0FBQUEsTUFDcEIsQ0FBQyxpQkFBaUIsZUFBZTtBQUFBLE1BQ2pDLENBQUMsbUJBQW1CLGlCQUFpQjtBQUFBLE1BQ3JDLENBQUMsYUFBYSxtQkFBbUI7QUFBQSxNQUNqQyxDQUFDLGNBQWMsWUFBWTtBQUFBLE1BQzNCLENBQUMsZUFBZSxhQUFhO0FBQUEsTUFDN0IsQ0FBQyxhQUFhLFdBQVc7QUFBQSxNQUN6QixDQUFDLG1DQUFtQyxxQkFBcUI7QUFBQSxNQUN6RCxDQUFDLGdCQUFnQixjQUFjO0FBQUEsTUFDL0IsQ0FBQyxpQkFBaUIsZUFBZTtBQUFBLE1BQ2pDLENBQUMsWUFBWSxVQUFVO0FBQUEsTUFDdkIsQ0FBQyxTQUFTLGNBQWM7QUFBQSxNQUN4QixDQUFDLFFBQVEsZUFBZTtBQUFBLE1BQ3hCLENBQUMsZUFBZSxhQUFhO0FBQUEsTUFDN0IsQ0FBQyxjQUFjLFlBQVk7QUFBQSxNQUMzQixDQUFDLGtCQUFrQixnQkFBZ0I7QUFBQSxNQUNuQyxDQUFDLE9BQU8sYUFBYTtBQUFBLE1BQ3JCLENBQUMsT0FBTyxpQkFBaUI7QUFBQSxNQUN6QixDQUFDLHVCQUF1QixxQkFBcUI7QUFBQSxNQUM3QyxDQUFDLHdCQUF3QixvQkFBb0I7QUFBQSxNQUM3QyxDQUFDLGdCQUFnQixjQUFjO0FBQUEsTUFDL0IsQ0FBQyxlQUFlLGFBQWE7QUFBQSxNQUM3QixDQUFDLGVBQWUsZ0JBQWdCO0FBQUEsTUFDaEMsQ0FBQyxjQUFjLG1CQUFtQjtBQUFBLE1BQ2xDLENBQUMsZ0JBQWdCLHFCQUFxQjtBQUFBLE1BQ3RDLENBQUMsMEJBQTBCLGNBQWM7QUFBQSxNQUN6QyxDQUFDLHVCQUF1QixrQkFBa0I7QUFBQSxNQUMxQyxDQUFDLGtCQUFrQixzQkFBc0I7QUFBQSxNQUN6QyxDQUFDLGNBQWMsYUFBYTtBQUFBLE1BQzVCLENBQUMsZ0JBQWdCLGVBQWU7QUFBQSxNQUNoQyxDQUFDLGtCQUFrQixpQkFBaUI7QUFBQSxNQUNwQyxDQUFDLG1CQUFtQixrQkFBa0I7QUFBQSxNQUN0QyxDQUFDLDBCQUEwQixlQUFlO0FBQUEsSUFDM0M7QUFFQSxlQUFXLENBQUMsVUFBVSxXQUFXLEtBQUssT0FBTztBQUM1QyxhQUFPLFlBQVksbUJBQW1CLFFBQVEsR0FBRyxhQUFhLFFBQVE7QUFBQSxJQUN2RTtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsscURBQXFELE1BQU07QUFDL0QsV0FBTyxZQUFZLG1CQUFtQixlQUFlLEdBQUcsZUFBZTtBQUFBLEVBQ3hFLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSxzREFBaUQsTUFBTTtBQUU1RCwwQ0FBd0M7QUFFeEMsT0FBSyxxQ0FBcUMsTUFBTTtBQUMvQyxlQUFXLFlBQVksQ0FBQyxRQUFRLGVBQWUsVUFBVSxVQUFVLGVBQWUsaUJBQWlCLEdBQUc7QUFDckcsYUFBTyxZQUFZLFdBQVcsUUFBUSxHQUFHLE1BQU0sUUFBUTtBQUFBLElBQ3hEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw0Q0FBNEMsTUFBTTtBQUN0RCxlQUFXLFdBQVcsQ0FBQyxRQUFRLGVBQWUsVUFBVSxRQUFRLEdBQUc7QUFDbEUsYUFBTyxZQUFZLFdBQVcsc0JBQXNCLE9BQU8sR0FBRyxNQUFNLE9BQU87QUFBQSxJQUM1RTtBQUNBLFdBQU8sWUFBWSxXQUFXLHNCQUFzQixNQUFNLEdBQUcsS0FBSztBQUNsRSxXQUFPLFlBQVksV0FBVyxzQkFBc0IsU0FBUyxHQUFHLEtBQUs7QUFDckUsV0FBTyxZQUFZLFdBQVcsb0JBQW9CLEdBQUcsS0FBSztBQUFBLEVBQzNELENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSxxREFBZ0QsTUFBTTtBQUUzRCwwQ0FBd0M7QUFFeEMsT0FBSyx5REFBeUQsTUFBTTtBQUNuRSxXQUFPLFlBQVksdUJBQXVCLGVBQWUsR0FBRyxJQUFJO0FBQ2hFLFdBQU8sWUFBWSx1QkFBdUIsTUFBTSxHQUFHLEtBQUs7QUFDeEQsV0FBTyxZQUFZLHVCQUF1QixlQUFlLEdBQUcsS0FBSztBQUFBLEVBQ2xFLENBQUM7QUFFRCxPQUFLLHlFQUF5RSxNQUFNO0FBQ25GLFdBQU8sWUFBWSx1QkFBdUIsaUJBQWlCLEVBQUUsU0FBUyxrQkFBa0IsQ0FBQyxHQUFHLHlDQUF5QztBQUFBLEVBQ3RJLENBQUM7QUFFRCxPQUFLLHdGQUF3RixNQUFNO0FBQ2xHLFdBQU8sWUFBWSx1QkFBdUIsaUJBQWlCLEVBQUUsU0FBUyxHQUFHLENBQUMsR0FBRyxNQUFTO0FBQ3RGLFdBQU8sWUFBWSx1QkFBdUIsaUJBQWlCLENBQUMsQ0FBQyxHQUFHLE1BQVM7QUFDekUsV0FBTyxZQUFZLHVCQUF1QixpQkFBaUIsTUFBUyxHQUFHLE1BQVM7QUFDaEYsV0FBTyxZQUFZLHVCQUF1QixpQkFBaUIsRUFBRSxTQUFTLEdBQUcsQ0FBQyxHQUFHLE1BQVM7QUFBQSxFQUN2RixDQUFDO0FBRUQsT0FBSyxtRUFBbUUsTUFBTTtBQUM3RSxXQUFPLFlBQVksdUJBQXVCLFFBQVEsRUFBRSxTQUFTLFVBQVUsQ0FBQyxHQUFHLE1BQVM7QUFBQSxFQUNyRixDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sbURBQThDLE1BQU07QUFFekQsMENBQXdDO0FBRXhDLFFBQU0sS0FBSyxJQUFJLEtBQUssZUFBZTtBQUVuQyxPQUFLLHFFQUFxRSxNQUFNO0FBQy9FLFVBQU0sVUFBVSx1QkFBdUIsOEJBQThCO0FBQ3JFLFVBQU0sVUFBVSxxQkFBcUIsU0FBUyxFQUFFO0FBQ2hELFdBQU8sWUFBWSxRQUFRLFdBQVcsVUFBVTtBQUNoRCxXQUFPLFlBQVksUUFBUSxnQkFBZ0IsT0FBTztBQUFBLEVBQ25ELENBQUM7QUFFRCxPQUFLLDRFQUE0RSxNQUFNO0FBQ3RGLFVBQU0sVUFBVSx1QkFBdUIsZUFBZTtBQUN0RCxVQUFNLFVBQVUscUJBQXFCLFNBQVMsRUFBRTtBQUNoRCxXQUFPLFlBQVksUUFBUSxXQUFXLGVBQWU7QUFBQSxFQUN0RCxDQUFDO0FBRUQsT0FBSyxpRUFBaUUsTUFBTTtBQUMzRSxVQUFNLFVBQVUsdUJBQXVCLDhCQUE4QjtBQUNyRSxVQUFNLFVBQVUscUJBQXFCLFNBQVMsTUFBUztBQUN2RCxXQUFPLFlBQVksUUFBUSxXQUFXLDhCQUE4QjtBQUFBLEVBQ3JFLENBQUM7QUFFRCxPQUFLLGlFQUFpRSxNQUFNO0FBQzNFLFVBQU0sVUFBVSw0QkFBNEIsUUFBUSxFQUFFLFNBQVMsOEJBQThCLENBQUM7QUFDOUYsVUFBTSxVQUFVLHFCQUFxQixTQUFTLEVBQUU7QUFDaEQsV0FBTyxZQUFZLFFBQVEsV0FBVyxTQUFTO0FBQy9DLFdBQU8sWUFBWSxRQUFRLGdCQUFnQixPQUFPO0FBQUEsRUFDbkQsQ0FBQztBQUVELE9BQUssa0RBQWtELE1BQU07QUFDNUQsVUFBTSxVQUFVLDRCQUE0QixtQkFBbUIsRUFBRSxTQUFTLDhCQUE4QixDQUFDO0FBQ3pHLFVBQU0sVUFBVSxxQkFBcUIsU0FBUyxFQUFFO0FBRWhELFdBQU8sR0FBRyxRQUFRLFdBQVcsU0FBUyxrQkFBa0IsR0FBRyxtQ0FBbUMsUUFBUSxTQUFTLEVBQUU7QUFDakgsV0FBTyxZQUFZLFFBQVEsZ0JBQWdCLGFBQWE7QUFBQSxFQUN6RCxDQUFDO0FBRUQsT0FBSywyREFBMkQsTUFBTTtBQUNyRSxVQUFNLFVBQVUsNEJBQTRCLGNBQWMsRUFBRSxTQUFTLHdCQUF3QixDQUFDO0FBQzlGLFVBQU0sVUFBVSxxQkFBcUIsU0FBUyxFQUFFO0FBQ2hELFdBQU8sWUFBWSxRQUFRLFdBQVcsS0FBSztBQUFBLEVBQzVDLENBQUM7QUFFRCxPQUFLLGlFQUFpRSxNQUFNO0FBQzNFLFVBQU0sWUFBWSxxQkFBcUIsdUJBQXVCLFVBQVUsR0FBRyxFQUFFO0FBQzdFLFVBQU0sU0FBUyxxQkFBcUIsdUJBQXVCLFlBQVksSUFBSSxHQUFHLEVBQUU7QUFFaEYsV0FBTyxlQUFlLE9BQU8sbUJBQW1CLFVBQVUsaUJBQWlCO0FBQzNFLFdBQU8sR0FBRyxXQUFXLEtBQUssT0FBTyxpQkFBaUIsR0FBRywrQ0FBK0MsT0FBTyxpQkFBaUIsRUFBRTtBQUFBLEVBQy9ILENBQUM7QUFFRixDQUFDO0FBRUQsTUFBTSx1REFBa0QsTUFBTTtBQUU3RCwwQ0FBd0M7QUFFeEMsT0FBSyw4REFBOEQsTUFBTTtBQUN4RSxVQUFNLFVBQVUscUJBQXFCO0FBQUEsTUFDcEMsTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sV0FBVztBQUFBLElBQ1osR0FBRyxJQUFJLEtBQUssZUFBZSxDQUFDO0FBRTVCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsbUJBQW1CLFFBQVE7QUFBQSxNQUMzQixXQUFXLFFBQVE7QUFBQSxNQUNuQixnQkFBZ0IsUUFBUTtBQUFBLE1BQ3hCLGdCQUFnQixRQUFRO0FBQUEsSUFDekIsR0FBRztBQUFBLE1BQ0YsbUJBQW1CLEVBQUUsVUFBVSwyR0FBMkc7QUFBQSxNQUMxSSxXQUFXO0FBQUEsTUFDWCxnQkFBZ0I7QUFBQSxNQUNoQixnQkFBZ0I7QUFBQSxJQUNqQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sd0RBQW1ELE1BQU07QUFFOUQsMENBQXdDO0FBRXhDLE9BQUssa0RBQWtELE1BQU07QUFDNUQsVUFBTSxVQUFVO0FBQUEsTUFDZixNQUFNO0FBQUEsTUFDTix5QkFBeUI7QUFBQSxNQUN6QixNQUFNO0FBQUEsTUFDTixVQUFVO0FBQUEsTUFDVixXQUFXO0FBQUEsSUFDWjtBQUVBLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsUUFBUSxxQkFBcUIsU0FBUyxJQUFJLEtBQUssZUFBZSxHQUFHLElBQUk7QUFBQSxNQUNyRSxNQUFNLHFCQUFxQixTQUFTLElBQUksS0FBSyxlQUFlLEdBQUcsS0FBSztBQUFBLElBQ3JFLEdBQUc7QUFBQSxNQUNGLFFBQVE7QUFBQSxRQUNQLG1CQUFtQjtBQUFBLFFBQ25CLG1CQUFtQixFQUFFLFVBQVUsMkRBQTJEO0FBQUEsUUFDMUYsV0FBVztBQUFBLFFBQ1gsZ0JBQWdCO0FBQUEsUUFDaEIsZ0JBQWdCO0FBQUEsTUFDakI7QUFBQSxNQUNBLE1BQU07QUFBQSxRQUNMLG1CQUFtQjtBQUFBLFFBQ25CLG1CQUFtQixFQUFFLFVBQVUseURBQXlEO0FBQUEsUUFDeEYsV0FBVztBQUFBLFFBQ1gsZ0JBQWdCO0FBQUEsUUFDaEIsZ0JBQWdCO0FBQUEsTUFDakI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSx1Q0FBa0MsTUFBTTtBQUU3QywwQ0FBd0M7QUFFeEMsV0FBUyxXQUFXLFlBQXlEO0FBQzVFLFVBQU0sU0FBUyxxQkFBcUIsUUFBUSxhQUFhLFVBQVU7QUFDbkUsV0FBTyxPQUFPLFdBQVcsV0FBVyxTQUFTLE9BQU87QUFBQSxFQUNyRDtBQUVBLFdBQVMsVUFBVSxZQUF5RDtBQUMzRSxVQUFNLFNBQVMsb0JBQW9CLFFBQVEsYUFBYSxZQUFZLElBQUk7QUFDeEUsV0FBTyxPQUFPLFdBQVcsV0FBVyxTQUFTLE9BQU87QUFBQSxFQUNyRDtBQUVBLE9BQUssK0NBQStDLE1BQU07QUFDekQsV0FBTyxHQUFHLFdBQVcsRUFBRSxNQUFNLGdCQUFnQixDQUFDLEVBQUUsV0FBVyxRQUFRLENBQUM7QUFDcEUsV0FBTyxHQUFHLFVBQVUsRUFBRSxNQUFNLGdCQUFnQixDQUFDLEVBQUUsV0FBVyxRQUFRLENBQUM7QUFBQSxFQUNwRSxDQUFDO0FBRUQsT0FBSyx3RUFBd0UsTUFBTTtBQUNsRixVQUFNLFFBQVE7QUFBQSxNQUNiO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxNQUNOLE1BQU0sSUFBSSxXQUFTO0FBQUEsUUFDbEIsWUFBWSxXQUFXLEVBQUUsTUFBTSxZQUFZLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQztBQUFBLFFBQ3ZELFdBQVcsVUFBVSxFQUFFLE1BQU0sWUFBWSxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUM7QUFBQSxNQUN0RCxFQUFFO0FBQUEsTUFDRjtBQUFBLFFBQ0MsRUFBRSxZQUFZLG9CQUFvQixXQUFXLG1CQUFtQjtBQUFBLFFBQ2hFLEVBQUUsWUFBWSxvQkFBb0IsV0FBVyxtQkFBbUI7QUFBQSxRQUNoRSxFQUFFLFlBQVksb0JBQW9CLFdBQVcsbUJBQW1CO0FBQUEsUUFDaEUsRUFBRSxZQUFZLG9CQUFvQixXQUFXLG1CQUFtQjtBQUFBLE1BQ2pFO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssd0RBQXdELE1BQU07QUFDbEUsV0FBTyxHQUFHLFdBQVcsRUFBRSxNQUFNLGlCQUFpQixZQUFZLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxFQUFFLFNBQVMsa0JBQWtCLENBQUM7QUFDbEcsV0FBTyxHQUFHLFVBQVUsRUFBRSxNQUFNLGlCQUFpQixZQUFZLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxFQUFFLFNBQVMsa0JBQWtCLENBQUM7QUFBQSxFQUNsRyxDQUFDO0FBRUQsT0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxXQUFPLEdBQUcsV0FBVyxFQUFFLE1BQU0saUJBQWlCLFlBQVksQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLEVBQUUsU0FBUyxXQUFXLENBQUM7QUFDM0YsV0FBTyxHQUFHLFVBQVUsRUFBRSxNQUFNLGlCQUFpQixZQUFZLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxFQUFFLFNBQVMsV0FBVyxDQUFDO0FBQUEsRUFDM0YsQ0FBQztBQUVELE9BQUssdURBQXVELE1BQU07QUFDakUsV0FBTyxHQUFHLFdBQVcsRUFBRSxNQUFNLGlCQUFpQixZQUFZLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxFQUFFLFNBQVMsc0JBQXNCLENBQUM7QUFDdEcsV0FBTyxHQUFHLFVBQVUsRUFBRSxNQUFNLGlCQUFpQixZQUFZLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxFQUFFLFNBQVMsc0JBQXNCLENBQUM7QUFBQSxFQUN0RyxDQUFDO0FBRUQsT0FBSyw4Q0FBOEMsTUFBTTtBQUV4RCxXQUFPLEdBQUcsQ0FBQyxXQUFXLEVBQUUsTUFBTSxpQkFBaUIsWUFBWSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsRUFBRSxTQUFTLEdBQUcsQ0FBQztBQUVwRixXQUFPLEdBQUcsQ0FBQyxXQUFXLEVBQUUsTUFBTSxpQkFBaUIsWUFBWSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsRUFBRSxTQUFTLEdBQUcsQ0FBQztBQUVwRixXQUFPLEdBQUcsQ0FBQyxXQUFXLEVBQUUsTUFBTSxpQkFBaUIsWUFBWSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxTQUFTLEdBQUcsQ0FBQztBQUVyRixXQUFPLEdBQUcsQ0FBQyxXQUFXLEVBQUUsTUFBTSxpQkFBaUIsWUFBWSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsU0FBUyxHQUFHLENBQUM7QUFDaEYsV0FBTyxHQUFHLENBQUMsV0FBVyxFQUFFLE1BQU0saUJBQWlCLFlBQVksQ0FBQyxJQUFJLElBQUksRUFBRSxFQUFFLENBQUMsRUFBRSxTQUFTLEdBQUcsQ0FBQztBQUV4RixXQUFPLEdBQUcsQ0FBQyxXQUFXLEVBQUUsTUFBTSxpQkFBaUIsWUFBWSxXQUFXLENBQUMsRUFBRSxTQUFTLEdBQUcsQ0FBQztBQUFBLEVBQ3ZGLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSwwRUFBcUUsTUFBTTtBQUVoRiwwQ0FBd0M7QUFFeEMsV0FBUyxXQUFXLFVBQWtCLFlBQXlEO0FBQzlGLFVBQU0sU0FBUyxxQkFBcUIsVUFBVSxtQkFBbUIsUUFBUSxHQUFHLFVBQVU7QUFDdEYsV0FBTyxPQUFPLFdBQVcsV0FBVyxTQUFTLE9BQU87QUFBQSxFQUNyRDtBQUVBLFdBQVMsVUFBVSxVQUFrQixZQUF5RDtBQUM3RixVQUFNLFNBQVMsb0JBQW9CLFVBQVUsbUJBQW1CLFFBQVEsR0FBRyxZQUFZLElBQUk7QUFDM0YsV0FBTyxPQUFPLFdBQVcsV0FBVyxTQUFTLE9BQU87QUFBQSxFQUNyRDtBQUVBLE9BQUssb0ZBQW9GLE1BQU07QUFDOUYsV0FBTyxZQUFZLFdBQVcsY0FBYyxFQUFFLFVBQVUsY0FBYyxDQUFDLEdBQUcsMEJBQTBCO0FBQ3BHLFdBQU8sWUFBWSxVQUFVLGNBQWMsRUFBRSxVQUFVLGNBQWMsQ0FBQyxHQUFHLDBCQUEwQjtBQUNuRyxXQUFPLFlBQVksV0FBVyxlQUFlLEVBQUUsVUFBVSxlQUFlLFNBQVMsS0FBSyxDQUFDLEdBQUcsOEJBQThCO0FBQ3hILFdBQU8sWUFBWSxVQUFVLGVBQWUsRUFBRSxVQUFVLGVBQWUsU0FBUyxLQUFLLENBQUMsR0FBRyw4QkFBOEI7QUFBQSxFQUN4SCxDQUFDO0FBRUQsT0FBSyxpRUFBaUUsTUFBTTtBQUMzRSxXQUFPLFlBQVksV0FBVyxjQUFjLENBQUMsQ0FBQyxHQUFHLFlBQVk7QUFDN0QsV0FBTyxZQUFZLFVBQVUsZUFBZSxNQUFTLEdBQUcsZ0JBQWdCO0FBQUEsRUFDekUsQ0FBQztBQUVELE9BQUssNEVBQTRFLE1BQU07QUFHdEYsV0FBTyxZQUFZLFdBQVcsY0FBYyxFQUFFLFVBQVUsSUFBSSxDQUFDLEdBQUcsWUFBWTtBQUM1RSxXQUFPLFlBQVksVUFBVSxlQUFlLEVBQUUsVUFBVSxHQUFHLENBQUMsR0FBRyxnQkFBZ0I7QUFBQSxFQUNoRixDQUFDO0FBRUQsT0FBSyw0RUFBNEUsTUFBTTtBQUV0RixXQUFPLFlBQVksV0FBVyxlQUFlLENBQUMsQ0FBQyxHQUFHLGFBQWE7QUFDL0QsV0FBTyxZQUFZLFVBQVUsZUFBZSxDQUFDLENBQUMsR0FBRyxhQUFhO0FBRTlELFdBQU8sWUFBWSxXQUFXLFFBQVEsQ0FBQyxDQUFDLEdBQUcsaUJBQWlCO0FBQzVELFdBQU8sWUFBWSxVQUFVLFFBQVEsQ0FBQyxDQUFDLEdBQUcsZ0JBQWdCO0FBQUEsRUFDM0QsQ0FBQztBQUVELE9BQUssc0RBQXNELE1BQU07QUFFaEUsV0FBTyxZQUFZLFdBQVcsZ0JBQWdCLENBQUMsQ0FBQyxHQUFHLGNBQWM7QUFDakUsV0FBTyxZQUFZLFVBQVUsZ0JBQWdCLENBQUMsQ0FBQyxHQUFHLGNBQWM7QUFFaEUsV0FBTyxZQUFZLFdBQVcsaUJBQWlCLENBQUMsQ0FBQyxHQUFHLGVBQWU7QUFDbkUsV0FBTyxZQUFZLFVBQVUsaUJBQWlCLENBQUMsQ0FBQyxHQUFHLGVBQWU7QUFBQSxFQUNuRSxDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0scURBQWdELE1BQU07QUFFM0QsMENBQXdDO0FBRXhDLFdBQVMsVUFBVSxVQUFrQixZQUFxQixhQUFnRDtBQUN6RyxVQUFNLFNBQVMsOEJBQThCLFVBQVUsbUJBQW1CLFFBQVEsR0FBRyxZQUFZLFdBQVc7QUFDNUcsV0FBTyxPQUFPLFdBQVcsV0FBVyxTQUFTLE9BQU87QUFBQSxFQUNyRDtBQUVBLFdBQVMsV0FBVyxVQUFrQixZQUE2QztBQUNsRixVQUFNLFNBQVMscUJBQXFCLFVBQVUsbUJBQW1CLFFBQVEsR0FBRyxVQUFVO0FBQ3RGLFdBQU8sT0FBTyxXQUFXLFdBQVcsU0FBUyxPQUFPO0FBQUEsRUFDckQ7QUFFQSxXQUFTLFVBQVUsVUFBa0IsWUFBNkM7QUFDakYsVUFBTSxTQUFTLG9CQUFvQixVQUFVLG1CQUFtQixRQUFRLEdBQUcsWUFBWSxJQUFJO0FBQzNGLFdBQU8sT0FBTyxXQUFXLFdBQVcsU0FBUyxPQUFPO0FBQUEsRUFDckQ7QUFFQSxPQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsVUFBVSxRQUFRLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUFBLE1BQzNDLFVBQVUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLFNBQVMsV0FBVyxDQUFDO0FBQUEsTUFDaEUsVUFBVSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsU0FBUyxZQUFZLFNBQVMsc0JBQXNCLENBQUM7QUFBQSxJQUNqRyxHQUFHO0FBQUEsTUFDRjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx5Q0FBeUMsTUFBTTtBQUNuRCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFVBQVUsVUFBVSxFQUFFLE1BQU0sZ0JBQWdCLFdBQVcsc0JBQXNCLENBQUM7QUFBQSxNQUM5RSxVQUFVLFVBQVUsRUFBRSxNQUFNLGlCQUFpQixTQUFTLFdBQVcsQ0FBQztBQUFBLElBQ25FLEdBQUc7QUFBQSxNQUNGO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkNBQTZDLE1BQU07QUFDdkQsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixVQUFVLHNCQUFzQixFQUFFLFNBQVMsVUFBVSxNQUFNLGdCQUFnQixXQUFXLFdBQVcsQ0FBQztBQUFBLE1BQ2xHLFVBQVUsc0JBQXNCLEVBQUUsU0FBUyxlQUFlLE1BQU0saUJBQWlCLFNBQVMsT0FBTyxTQUFTLGFBQWEsQ0FBQztBQUFBLE1BQ3hILFVBQVUsc0JBQXNCLEVBQUUsU0FBUyxRQUFRLE1BQU0sZ0JBQWdCLENBQUM7QUFBQSxJQUMzRSxHQUFHO0FBQUEsTUFDRjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw0RUFBNEUsTUFBTTtBQUN0RixVQUFNLFFBQXlHO0FBQUEsTUFDOUcsQ0FBQyxlQUFlLEVBQUUsTUFBTSxnQkFBZ0IsR0FBRyx3Q0FBd0Msc0NBQXNDO0FBQUEsTUFDekgsQ0FBQyxVQUFVLEVBQUUsTUFBTSxnQkFBZ0IsR0FBRyxrREFBa0QsZ0RBQWdEO0FBQUEsTUFDeEksQ0FBQyxzQkFBc0IsRUFBRSxTQUFTLFVBQVUsTUFBTSxlQUFlLEdBQUcsd0NBQXdDLHNDQUFzQztBQUFBLE1BQ2xKLENBQUMsc0JBQXNCLEVBQUUsU0FBUyxlQUFlLE1BQU0sZ0JBQWdCLEdBQUcsd0NBQXdDLHNDQUFzQztBQUFBLElBQ3pKO0FBQ0EsV0FBTyxnQkFBZ0IsTUFBTSxJQUFJLENBQUMsQ0FBQyxVQUFVLFVBQVUsT0FBTztBQUFBLE1BQzdELE9BQU8sV0FBVyxVQUFVLFVBQVU7QUFBQSxNQUN0QyxVQUFVLFVBQVUsVUFBVSxVQUFVO0FBQUEsSUFDekMsRUFBRSxHQUFHLE1BQU0sSUFBSSxDQUFDLENBQUMsRUFBRSxFQUFFLE9BQU8sUUFBUSxPQUFPLEVBQUUsT0FBTyxTQUFTLEVBQUUsQ0FBQztBQUFBLEVBQ2pFLENBQUM7QUFFRCxPQUFLLG9FQUFvRSxNQUFNO0FBQzlFLFVBQU0sUUFBUTtBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsRUFBRSxLQUFLLElBQUk7QUFDWCxXQUFPO0FBQUEsTUFDTixVQUFVLGVBQWUsT0FBTyxVQUFRLGNBQWMsSUFBSSxFQUFFO0FBQUEsTUFDNUQ7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxtQ0FBbUMsTUFBTTtBQUM3QyxXQUFPO0FBQUEsTUFDTixVQUFVLFFBQVEsRUFBRSxNQUFNLElBQUksU0FBUyxNQUFNLENBQUM7QUFBQSxNQUM5QztBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLG9FQUFvRSxNQUFNO0FBQzlFLFdBQU87QUFBQSxNQUNOLFVBQVUsUUFBUSxFQUFFLFNBQVMsV0FBVyxDQUFDO0FBQUEsTUFDekM7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBQ0YsQ0FBQztBQVNELE1BQU0sc0RBQWlELE1BQU07QUFFNUQsMENBQXdDO0FBRXhDLFFBQU0sZUFBZSxNQUFNO0FBRTFCLFNBQUssNkJBQTZCLE1BQU07QUFDdkMsYUFBTyxZQUFZLFlBQVksTUFBTSxHQUFHLFVBQVU7QUFBQSxJQUNuRCxDQUFDO0FBRUQsU0FBSyxtQ0FBbUMsTUFBTTtBQUM3QyxhQUFPLFlBQVksWUFBWSxZQUFZLEdBQUcsVUFBVTtBQUFBLElBQ3pELENBQUM7QUFFRCxTQUFLLG1HQUFtRyxNQUFNO0FBQzdHLGFBQU8sWUFBWSxZQUFZLFlBQVksR0FBRyxNQUFTO0FBQUEsSUFDeEQsQ0FBQztBQUVELFNBQUssMENBQTBDLE1BQU07QUFDcEQsYUFBTyxZQUFZLFlBQVksa0JBQWtCLEdBQUcsTUFBUztBQUFBLElBQzlELENBQUM7QUFFRCxTQUFLLDhFQUE4RSxNQUFNO0FBQ3hGLGFBQU8sWUFBWSxZQUFZLFdBQVcsR0FBRyxNQUFTO0FBQUEsSUFDdkQsQ0FBQztBQUVELFNBQUsseUNBQXlDLE1BQU07QUFDbkQsYUFBTyxZQUFZLFlBQVksaUJBQWlCLEdBQUcsTUFBUztBQUFBLElBQzdELENBQUM7QUFFRCxTQUFLLDZCQUE2QixNQUFNO0FBQ3ZDLGFBQU8sWUFBWSxZQUFZLE1BQU0sR0FBRyxVQUFVO0FBQUEsSUFDbkQsQ0FBQztBQUVELFNBQUssK0JBQStCLE1BQU07QUFDekMsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixZQUFZLE1BQU07QUFBQSxRQUNsQixZQUFZLHNCQUFzQixFQUFFLFNBQVMsT0FBTyxDQUFDO0FBQUEsUUFDckQsWUFBWSxzQkFBc0IsRUFBRSxTQUFTLGNBQWMsQ0FBQztBQUFBLE1BQzdELEdBQUc7QUFBQSxRQUNGO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDJCQUEyQixNQUFNO0FBQ3JDLGFBQU8sWUFBWSxZQUFZLE1BQU0sR0FBRyxRQUFRO0FBQUEsSUFDakQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sb0JBQW9CLE1BQU07QUFFL0IsU0FBSyw0QkFBNEIsTUFBTTtBQUN0QyxhQUFPLFlBQVksaUJBQWlCLE1BQU0sR0FBRyxhQUFhO0FBQUEsSUFDM0QsQ0FBQztBQUVELFNBQUssaUNBQWlDLE1BQU07QUFDM0MsYUFBTyxZQUFZLGlCQUFpQixZQUFZLEdBQUcsWUFBWTtBQUFBLElBQ2hFLENBQUM7QUFFRCxTQUFLLGtDQUFrQyxNQUFNO0FBQzVDLGFBQU8sWUFBWSxpQkFBaUIsWUFBWSxHQUFHLGFBQWE7QUFBQSxJQUNqRSxDQUFDO0FBRUQsU0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxhQUFPLFlBQVksaUJBQWlCLGtCQUFrQixHQUFHLFlBQVk7QUFBQSxJQUN0RSxDQUFDO0FBRUQsU0FBSyxpQ0FBaUMsTUFBTTtBQUMzQyxhQUFPLFlBQVksaUJBQWlCLFdBQVcsR0FBRyxhQUFhO0FBQUEsSUFDaEUsQ0FBQztBQUVELFNBQUssc0NBQXNDLE1BQU07QUFDaEQsYUFBTyxZQUFZLGlCQUFpQixpQkFBaUIsR0FBRyxZQUFZO0FBQUEsSUFDckUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sd0JBQXdCLE1BQU07QUFFbkMsYUFBUyxRQUFRLEtBQXNEO0FBQ3RFLGFBQU8sT0FBTyxRQUFRLFdBQVcsTUFBTSxJQUFJO0FBQUEsSUFDNUM7QUFFQSxTQUFLLHFEQUFxRCxNQUFNO0FBQy9ELFlBQU0sTUFBTSxxQkFBcUIsY0FBYyxxQkFBcUIsRUFBRSxTQUFTLGFBQWEsQ0FBQztBQUM3RixhQUFPLEdBQUcsUUFBUSxHQUFHLEVBQUUsU0FBUyxZQUFZLEdBQUcsNkJBQTZCLFFBQVEsR0FBRyxDQUFDLEVBQUU7QUFBQSxJQUMzRixDQUFDO0FBRUQsU0FBSyxtRUFBbUUsTUFBTTtBQUM3RSxZQUFNLE1BQU0scUJBQXFCLGNBQWMscUJBQXFCLE1BQVM7QUFDN0UsYUFBTyxHQUFHLFFBQVEsR0FBRyxFQUFFLFNBQVMsQ0FBQztBQUNqQyxhQUFPLEdBQUcsQ0FBQyxRQUFRLEdBQUcsRUFBRSxTQUFTLFdBQVcsQ0FBQztBQUFBLElBQzlDLENBQUM7QUFFRCxTQUFLLDJEQUEyRCxNQUFNO0FBQ3JFLFlBQU0sTUFBTSxxQkFBcUIsb0JBQW9CLHFCQUFxQixFQUFFLFNBQVMsV0FBVyxDQUFDO0FBQ2pHLGFBQU8sR0FBRyxRQUFRLEdBQUcsRUFBRSxTQUFTLFVBQVUsR0FBRywyQkFBMkIsUUFBUSxHQUFHLENBQUMsRUFBRTtBQUFBLElBQ3ZGLENBQUM7QUFFRCxTQUFLLHlDQUF5QyxNQUFNO0FBQ25ELFlBQU0sTUFBTSxxQkFBcUIsYUFBYSxxQkFBcUIsTUFBUztBQUM1RSxhQUFPLFlBQVksUUFBUSxHQUFHLEdBQUcsa0JBQWtCO0FBQUEsSUFDcEQsQ0FBQztBQUVELFNBQUssK0NBQStDLE1BQU07QUFDekQsWUFBTSxNQUFNLHFCQUFxQixtQkFBbUIscUJBQXFCLE1BQVM7QUFDbEYsYUFBTyxZQUFZLFFBQVEsR0FBRyxHQUFHLGtCQUFrQjtBQUFBLElBQ3BELENBQUM7QUFFRCxTQUFLLG1FQUFtRSxNQUFNO0FBQzdFLFlBQU0sZUFBZSxRQUFRLHFCQUFxQixjQUFjLHFCQUFxQixFQUFFLFNBQVMsVUFBVSxDQUFDLENBQUM7QUFDNUcsWUFBTSxVQUFVLFFBQVEscUJBQXFCLFFBQVEsUUFBUSxFQUFFLFNBQVMsVUFBVSxDQUFDLENBQUM7QUFFcEYsYUFBTyxlQUFlLGNBQWMsT0FBTztBQUFBLElBQzVDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHVCQUF1QixNQUFNO0FBRWxDLGFBQVMsUUFBUSxLQUFxRDtBQUNyRSxhQUFPLE9BQU8sUUFBUSxXQUFXLE1BQU0sSUFBSTtBQUFBLElBQzVDO0FBRUEsU0FBSyxxREFBcUQsTUFBTTtBQUMvRCxZQUFNLE1BQU0sb0JBQW9CLGNBQWMscUJBQXFCLEVBQUUsU0FBUyxhQUFhLEdBQUcsSUFBSTtBQUNsRyxhQUFPLEdBQUcsUUFBUSxHQUFHLEVBQUUsU0FBUyxZQUFZLEdBQUcsNkJBQTZCLFFBQVEsR0FBRyxDQUFDLEVBQUU7QUFBQSxJQUMzRixDQUFDO0FBRUQsU0FBSyxtRUFBbUUsTUFBTTtBQUM3RSxZQUFNLE1BQU0sb0JBQW9CLGNBQWMscUJBQXFCLFFBQVcsSUFBSTtBQUNsRixhQUFPLEdBQUcsUUFBUSxHQUFHLEVBQUUsU0FBUyxDQUFDO0FBQUEsSUFDbEMsQ0FBQztBQUVELFNBQUssMkRBQTJELE1BQU07QUFDckUsWUFBTSxNQUFNLG9CQUFvQixvQkFBb0IscUJBQXFCLEVBQUUsU0FBUyxXQUFXLEdBQUcsSUFBSTtBQUN0RyxhQUFPLEdBQUcsUUFBUSxHQUFHLEVBQUUsU0FBUyxVQUFVLEdBQUcsMkJBQTJCLFFBQVEsR0FBRyxDQUFDLEVBQUU7QUFBQSxJQUN2RixDQUFDO0FBRUQsU0FBSyxpREFBaUQsTUFBTTtBQUMzRCxZQUFNLE1BQU0sb0JBQW9CLGFBQWEscUJBQXFCLFFBQVcsSUFBSTtBQUNqRixhQUFPLFlBQVksUUFBUSxHQUFHLEdBQUcsZUFBZTtBQUFBLElBQ2pELENBQUM7QUFFRCxTQUFLLHdEQUF3RCxNQUFNO0FBQ2xFLFlBQU0sTUFBTSxvQkFBb0IsY0FBYyxxQkFBcUIsRUFBRSxTQUFTLGFBQWEsR0FBRyxLQUFLO0FBQ25HLGFBQU8sR0FBRyxRQUFRLEdBQUcsRUFBRSxTQUFTLENBQUM7QUFBQSxJQUNsQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxzRUFBc0UsTUFBTTtBQUVqRixhQUFTLEtBQUssS0FBK0Y7QUFDNUcsYUFBTyxPQUFPLFFBQVEsV0FBVyxNQUFNLElBQUk7QUFBQSxJQUM1QztBQU1BLFNBQUssaURBQWlELE1BQU07QUFDM0QsWUFBTSxhQUFhLEtBQUssVUFBVSxFQUFFLFVBQVUsQ0FBQyxFQUFFLElBQUksSUFBSSxHQUFHLEVBQUUsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDO0FBQzFFLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsYUFBYSxtQkFBbUIsY0FBYztBQUFBLFFBQzlDLFFBQVEsS0FBSyxxQkFBcUIsZ0JBQWdCLGlCQUFpQixNQUFTLENBQUM7QUFBQSxRQUM3RSxNQUFNLEtBQUssb0JBQW9CLGdCQUFnQixpQkFBaUIsUUFBVyxNQUFNLFVBQVUsQ0FBQztBQUFBLE1BQzdGLEdBQUc7QUFBQSxRQUNGLGFBQWE7QUFBQSxRQUNiLFFBQVE7QUFBQSxRQUNSLE1BQU07QUFBQSxNQUNQLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLCtEQUErRCxNQUFNO0FBQ3pFLGFBQU8sWUFBWSxLQUFLLG9CQUFvQixnQkFBZ0IsaUJBQWlCLFFBQVcsS0FBSyxDQUFDLEdBQUcsd0JBQXdCO0FBQUEsSUFDMUgsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sc0JBQXNCLE1BQU07QUFFakMsU0FBSyxxQ0FBcUMsTUFBTTtBQUMvQyxhQUFPLFlBQVksbUJBQW1CLGNBQWMsRUFBRSxTQUFTLGFBQWEsR0FBRyxNQUFTLEdBQUcsWUFBWTtBQUFBLElBQ3hHLENBQUM7QUFFRCxTQUFLLDJDQUEyQyxNQUFNO0FBQ3JELGFBQU8sWUFBWSxtQkFBbUIsb0JBQW9CLEVBQUUsU0FBUyxXQUFXLEdBQUcsTUFBUyxHQUFHLFVBQVU7QUFBQSxJQUMxRyxDQUFDO0FBRUQsU0FBSywrREFBK0QsTUFBTTtBQUN6RSxhQUFPLFlBQVksbUJBQW1CLGNBQWMsQ0FBQyxHQUFHLDBCQUEwQixHQUFHLDBCQUEwQjtBQUFBLElBQ2hILENBQUM7QUFFRCxTQUFLLGlGQUFpRixNQUFNO0FBQzNGLGFBQU8sWUFBWSxtQkFBbUIsY0FBYyxRQUFXLE1BQVMsR0FBRyxNQUFTO0FBQUEsSUFDckYsQ0FBQztBQUVELFNBQUssa0RBQWtELE1BQU07QUFDNUQsYUFBTyxZQUFZLG1CQUFtQixhQUFhLFFBQVcsTUFBUyxHQUFHLE1BQVM7QUFBQSxJQUNwRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sZ0JBQWdCLE1BQU07QUFFM0IsMENBQXdDO0FBRXhDLE9BQUssbUdBQW1HLE1BQU07QUFDN0csVUFBTSxXQUFXO0FBQUEsTUFDaEIsRUFBRSxNQUFNLFFBQVEsTUFBTSxrQ0FBa0MsU0FBUyxHQUFHO0FBQUEsTUFDcEU7QUFBQSxJQUNEO0FBQ0EsVUFBTSxpQkFBaUI7QUFBQSxNQUN0QixFQUFFLE1BQU0sUUFBUSxNQUFNLGtDQUFrQyxTQUFTLEdBQUc7QUFBQSxNQUNwRTtBQUFBLElBQ0Q7QUFFQSxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLGVBQWUsYUFBYSxPQUFPO0FBQUEsTUFDbkMsb0JBQW9CLFNBQVM7QUFBQSxNQUM3QixrQkFBa0IsU0FBUztBQUFBLE1BQzNCLHFCQUFxQixTQUFTO0FBQUEsTUFDOUIsb0JBQW9CLFNBQVM7QUFBQSxNQUM3QixtQkFBbUIsU0FBUztBQUFBLE1BQzVCLDBCQUEwQixlQUFlO0FBQUEsTUFDekMsMEJBQTBCLGVBQWU7QUFBQSxNQUN6Qyx5QkFBeUIsZUFBZTtBQUFBLElBQ3pDLEdBQUc7QUFBQSxNQUNGLGVBQWU7QUFBQSxNQUNmLG9CQUFvQjtBQUFBLE1BQ3BCLGtCQUFrQjtBQUFBLE1BQ2xCLHFCQUFxQjtBQUFBLE1BQ3JCLG9CQUFvQixFQUFFLFVBQVUsMkRBQTJEO0FBQUEsTUFDM0YsbUJBQW1CLEVBQUUsVUFBVSwyREFBMkQ7QUFBQSxNQUMxRiwwQkFBMEI7QUFBQSxNQUMxQiwwQkFBMEIsRUFBRSxVQUFVLDJEQUEyRDtBQUFBLE1BQ2pHLHlCQUF5QixFQUFFLFVBQVUsMkRBQTJEO0FBQUEsSUFDakcsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLGlDQUFpQyxNQUFNO0FBRTVDLDBDQUF3QztBQUV4QyxXQUFTLEtBQUssS0FBc0Q7QUFDbkUsV0FBTyxPQUFPLFFBQVEsV0FBVyxNQUFNLElBQUk7QUFBQSxFQUM1QztBQUVBLE9BQUsscUNBQXFDLE1BQU07QUFDL0MsVUFBTSxNQUFNLEtBQUsscUJBQXFCLE1BQU0sVUFBVSxFQUFFLFNBQVMsTUFBTSxDQUFDLENBQUM7QUFDekUsVUFBTSxPQUFPLEtBQUssb0JBQW9CLE1BQU0sVUFBVSxFQUFFLFNBQVMsTUFBTSxHQUFHLElBQUksQ0FBQztBQUMvRSxXQUFPLGdCQUFnQixFQUFFLEtBQUssS0FBSyxHQUFHO0FBQUEsTUFDckMsS0FBSztBQUFBLE1BQ0wsTUFBTTtBQUFBLElBQ1AsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssdUZBQXVGLE1BQU07QUFDakcsVUFBTSxNQUFNLEtBQUsscUJBQXFCLE1BQU0sVUFBVSxNQUFTLENBQUM7QUFDaEUsV0FBTyxZQUFZLEtBQUssY0FBYztBQUFBLEVBQ3ZDLENBQUM7QUFFRCxPQUFLLHVDQUF1QyxNQUFNO0FBQ2pELFVBQU0sTUFBTSxLQUFLLHFCQUFxQixRQUFRLFVBQVUsRUFBRSxTQUFTLE1BQU0sQ0FBQyxDQUFDO0FBQzNFLFVBQU0sT0FBTyxLQUFLLG9CQUFvQixRQUFRLFVBQVUsRUFBRSxTQUFTLE1BQU0sR0FBRyxJQUFJLENBQUM7QUFDakYsV0FBTyxnQkFBZ0IsRUFBRSxLQUFLLEtBQUssR0FBRztBQUFBLE1BQ3JDLEtBQUs7QUFBQSxNQUNMLE1BQU07QUFBQSxJQUNQLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDJEQUEyRCxNQUFNO0FBQ3JFLFdBQU8sWUFBWSxtQkFBbUIsUUFBUSxFQUFFLFNBQVMsTUFBTSxHQUFHLE1BQVMsR0FBRyxLQUFLO0FBQ25GLFdBQU8sWUFBWSxtQkFBbUIsTUFBTSxFQUFFLFNBQVMsTUFBTSxHQUFHLE1BQVMsR0FBRyxLQUFLO0FBQUEsRUFDbEYsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLDBCQUEwQixNQUFNO0FBRXJDLDBDQUF3QztBQUV4QyxXQUFTLEtBQUssS0FBK0Y7QUFDNUcsV0FBTyxPQUFPLFFBQVEsV0FBVyxNQUFNLElBQUk7QUFBQSxFQUM1QztBQUVBLE9BQUssK0RBQStELE1BQU07QUFDekUsVUFBTSxhQUFhLEVBQUUsS0FBSywyQkFBMkI7QUFDckQsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixZQUFZLEtBQUsscUJBQXFCLGFBQWEscUJBQXFCLFVBQVUsQ0FBQztBQUFBLE1BQ25GLFdBQVcsS0FBSyxvQkFBb0IsYUFBYSxxQkFBcUIsWUFBWSxJQUFJLENBQUM7QUFBQSxNQUN2RixPQUFPLG1CQUFtQixhQUFhLFlBQVksTUFBUztBQUFBLElBQzdELEdBQUc7QUFBQSxNQUNGLFlBQVk7QUFBQSxNQUNaLFdBQVc7QUFBQSxNQUNYLE9BQU87QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDREQUE0RCxNQUFNO0FBQ3RFLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsWUFBWSxLQUFLLHFCQUFxQixhQUFhLHFCQUFxQixNQUFTLENBQUM7QUFBQSxNQUNsRixXQUFXLEtBQUssb0JBQW9CLGFBQWEscUJBQXFCLFFBQVcsSUFBSSxDQUFDO0FBQUEsTUFDdEYsU0FBUyxLQUFLLG9CQUFvQixhQUFhLHFCQUFxQixFQUFFLEtBQUssMkJBQTJCLEdBQUcsS0FBSyxDQUFDO0FBQUEsSUFDaEgsR0FBRztBQUFBLE1BQ0YsWUFBWTtBQUFBLE1BQ1osV0FBVztBQUFBLE1BQ1gsU0FBUztBQUFBLElBQ1YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLHVCQUF1QixNQUFNO0FBRWxDLDBDQUF3QztBQUV4QyxXQUFTLEtBQUssS0FBK0Y7QUFDNUcsV0FBTyxPQUFPLFFBQVEsV0FBVyxNQUFNLElBQUk7QUFBQSxFQUM1QztBQUVBLE9BQUssa0VBQWtFLE1BQU07QUFDNUUsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixlQUFlLEtBQUsscUJBQXFCLGNBQWMsY0FBYyxFQUFFLE9BQU8sZ0JBQWdCLENBQUMsQ0FBQztBQUFBLE1BQ2hHLGFBQWEsS0FBSyxvQkFBb0IsY0FBYyxjQUFjLEVBQUUsT0FBTyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7QUFBQSxNQUNuRyxnQkFBZ0IsS0FBSyxxQkFBcUIsd0JBQXdCLGVBQWUsRUFBRSxPQUFPLHVCQUF1QixDQUFDLENBQUM7QUFBQSxNQUNuSCxjQUFjLEtBQUssb0JBQW9CLHdCQUF3QixlQUFlLEVBQUUsT0FBTyx1QkFBdUIsR0FBRyxJQUFJLENBQUM7QUFBQSxJQUN2SCxHQUFHO0FBQUEsTUFDRixlQUFlO0FBQUEsTUFDZixhQUFhO0FBQUEsTUFDYixnQkFBZ0I7QUFBQSxNQUNoQixjQUFjO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sb0JBQW9CLE1BQU07QUFFL0IsMENBQXdDO0FBRXhDLFdBQVMsS0FBSyxLQUErRjtBQUM1RyxXQUFPLE9BQU8sUUFBUSxXQUFXLE1BQU0sSUFBSTtBQUFBLEVBQzVDO0FBRUEsT0FBSyxtRUFBbUUsTUFBTTtBQUM3RSxVQUFNLGFBQWEsRUFBRSxhQUFhLGlDQUFpQyxPQUFPLHFFQUF1RTtBQUNqSixXQUFPLFlBQVksS0FBSyxxQkFBcUIsT0FBTyxlQUFlLFVBQVUsQ0FBQyxHQUFHLCtCQUErQjtBQUNoSCxXQUFPLFlBQVksS0FBSyxvQkFBb0IsT0FBTyxlQUFlLFlBQVksSUFBSSxDQUFDLEdBQUcsK0JBQStCO0FBQUEsRUFDdEgsQ0FBQztBQUVELE9BQUssZ0VBQWdFLE1BQU07QUFDMUUsV0FBTyxZQUFZLEtBQUsscUJBQXFCLE9BQU8sZUFBZSxFQUFFLE9BQU8sV0FBVyxDQUFDLENBQUMsR0FBRyxtQkFBbUI7QUFDL0csV0FBTyxZQUFZLEtBQUssb0JBQW9CLE9BQU8sZUFBZSxFQUFFLE9BQU8sV0FBVyxHQUFHLElBQUksQ0FBQyxHQUFHLG1CQUFtQjtBQUFBLEVBQ3JILENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSw0QkFBNEIsTUFBTTtBQUV2QywwQ0FBd0M7QUFFeEMsV0FBUyxLQUFLLEtBQXNEO0FBQ25FLFdBQU8sT0FBTyxRQUFRLFdBQVcsTUFBTSxJQUFJO0FBQUEsRUFDNUM7QUFFQSxRQUFNLGtCQUFrQjtBQUFBLElBQ3ZCO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxFQUNELEVBQUUsS0FBSyxJQUFJO0FBRVgsUUFBTSxpQkFBaUI7QUFBQSxJQUN0QjtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRCxFQUFFLEtBQUssSUFBSTtBQUVYLE9BQUsseURBQXlELE1BQU07QUFDbkUsVUFBTSxNQUFNLEtBQUsscUJBQXFCLGVBQWUsU0FBUyxFQUFFLE9BQU8sZ0JBQWdCLENBQUMsQ0FBQztBQUN6RixVQUFNLE9BQU8sS0FBSyxvQkFBb0IsZUFBZSxTQUFTLEVBQUUsT0FBTyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7QUFDL0YsV0FBTyxnQkFBZ0IsRUFBRSxLQUFLLEtBQUssR0FBRztBQUFBLE1BQ3JDLEtBQUs7QUFBQSxNQUNMLE1BQU07QUFBQSxJQUNQLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG9EQUFvRCxNQUFNO0FBQzlELFVBQU0sTUFBTSxLQUFLLHFCQUFxQixlQUFlLFNBQVMsRUFBRSxPQUFPLGVBQWUsQ0FBQyxDQUFDO0FBQ3hGLFVBQU0sT0FBTyxLQUFLLG9CQUFvQixlQUFlLFNBQVMsRUFBRSxPQUFPLGVBQWUsR0FBRyxJQUFJLENBQUM7QUFDOUYsV0FBTyxnQkFBZ0IsRUFBRSxLQUFLLEtBQUssR0FBRztBQUFBLE1BQ3JDLEtBQUs7QUFBQSxNQUNMLE1BQU07QUFBQSxJQUNQLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGlGQUFpRixNQUFNO0FBQzNGLFdBQU8sWUFBWSxxQkFBcUIsZUFBZSxTQUFTLE1BQVMsR0FBRyxZQUFZO0FBQ3hGLFdBQU8sWUFBWSxxQkFBcUIsZUFBZSxTQUFTLEVBQUUsT0FBTyxjQUFjLENBQUMsR0FBRyxZQUFZO0FBQ3ZHLFdBQU8sWUFBWSxvQkFBb0IsZUFBZSxTQUFTLFFBQVcsSUFBSSxHQUFHLFlBQVk7QUFBQSxFQUM5RixDQUFDO0FBRUQsT0FBSyx1RUFBdUUsTUFBTTtBQUNqRixVQUFNLE1BQU0sS0FBSyxxQkFBcUIsZUFBZSxTQUFTLEVBQUUsT0FBTyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQ3pGLFdBQU8sWUFBWSxLQUFLLHdDQUF3QztBQUFBLEVBQ2pFLENBQUM7QUFFRCxPQUFLLGdEQUFnRCxNQUFNO0FBQzFELFVBQU0sTUFBTSxLQUFLLHFCQUFxQixtQkFBbUIsU0FBUyxFQUFFLE9BQU8sZ0JBQWdCLENBQUMsQ0FBQztBQUM3RixVQUFNLE9BQU8sS0FBSyxvQkFBb0IsbUJBQW1CLFNBQVMsRUFBRSxPQUFPLGdCQUFnQixHQUFHLElBQUksQ0FBQztBQUNuRyxXQUFPLGdCQUFnQixFQUFFLEtBQUssS0FBSyxHQUFHO0FBQUEsTUFDckMsS0FBSztBQUFBLE1BQ0wsTUFBTTtBQUFBLElBQ1AsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMkRBQTJELE1BQU07QUFDckUsV0FBTyxZQUFZLG9CQUFvQixlQUFlLFNBQVMsRUFBRSxPQUFPLGdCQUFnQixHQUFHLEtBQUssR0FBRyxnQkFBZ0I7QUFBQSxFQUNwSCxDQUFDO0FBRUQsT0FBSyxxRUFBcUUsTUFBTTtBQUMvRSxXQUFPLFlBQVksZ0JBQWdCLEVBQUUsT0FBTyxnQkFBZ0IsQ0FBQyxHQUFHLGtCQUFrQjtBQUNsRixXQUFPLFlBQVksZ0JBQWdCLEVBQUUsT0FBTyxlQUFlLENBQUMsR0FBRyxrQkFBa0I7QUFDakYsV0FBTyxZQUFZLGdCQUFnQixFQUFFLE9BQU8sZ0JBQWdCLENBQUMsR0FBRyxrQkFBa0I7QUFDbEYsV0FBTyxZQUFZLGdCQUFnQixLQUFLLFVBQVUsRUFBRSxPQUFPLGdCQUFnQixDQUFDLENBQUMsR0FBRyxrQkFBa0I7QUFDbEcsV0FBTyxZQUFZLGdCQUFnQixFQUFFLE9BQU8sY0FBYyxDQUFDLEdBQUcsTUFBUztBQUFBLEVBQ3hFLENBQUM7QUFFRCxPQUFLLGtFQUFrRSxNQUFNO0FBQzVFLFdBQU8sZ0JBQWdCLGlCQUFpQixFQUFFLE9BQU8sZ0JBQWdCLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDO0FBQ3pGLFdBQU8sZ0JBQWdCLGlCQUFpQixFQUFFLE9BQU8sZUFBZSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0Isb0JBQW9CLGtCQUFrQixDQUFDO0FBQ2hJLFdBQU8sZ0JBQWdCLGlCQUFpQixFQUFFLE9BQU8sZUFBZSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0Isb0JBQW9CLGtCQUFrQixDQUFDO0FBQ2hJLFdBQU8sZ0JBQWdCLGlCQUFpQixLQUFLLFVBQVUsRUFBRSxPQUFPLGVBQWUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0Isb0JBQW9CLGtCQUFrQixDQUFDO0FBQ2hKLFdBQU8sZ0JBQWdCLGlCQUFpQixFQUFFLE1BQU0sb0JBQW9CLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDO0FBQzdGLFdBQU8sZ0JBQWdCLGlCQUFpQixFQUFFLE9BQU8sY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ3JFLFdBQU8sZ0JBQWdCLGlCQUFpQixNQUFTLEdBQUcsQ0FBQyxDQUFDO0FBR3RELFdBQU8sZ0JBQWdCLGlCQUFpQixjQUFjLEdBQUcsQ0FBQyxvQkFBb0Isb0JBQW9CLGtCQUFrQixDQUFDO0FBQ3JILFdBQU8sZ0JBQWdCLGlCQUFpQixlQUFlLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQztBQUFBLEVBQy9FLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSxxQkFBcUIsTUFBTTtBQUNoQywwQ0FBd0M7QUFFeEMsT0FBSyw4RUFBOEUsTUFBTTtBQUN4RixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLE1BQU0sa0JBQWtCLFFBQVEsRUFBRSxTQUFTLE1BQU0sYUFBYSxhQUFhLENBQUM7QUFBQSxNQUM1RSxZQUFZLGtCQUFrQixjQUFjLEVBQUUsU0FBUyxpQkFBaUIsYUFBYSxhQUFhLENBQUM7QUFBQSxNQUNuRyxvQkFBb0Isa0JBQWtCLFFBQVEsRUFBRSxTQUFTLEtBQUssQ0FBQztBQUFBLE1BQy9ELHVCQUF1QixrQkFBa0IsUUFBUSxFQUFFLFNBQVMsTUFBTSxhQUFhLEdBQUcsQ0FBQztBQUFBO0FBQUE7QUFBQSxNQUduRixVQUFVLGtCQUFrQixRQUFRLEVBQUUsYUFBYSx1QkFBdUIsQ0FBQztBQUFBLE1BQzNFLFVBQVUsa0JBQWtCLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixhQUFhLE1BQU0sQ0FBQztBQUFBLE1BQ2pGLFFBQVEsa0JBQWtCLFFBQVEsTUFBUztBQUFBLElBQzVDLEdBQUc7QUFBQSxNQUNGLE1BQU07QUFBQSxNQUNOLFlBQVk7QUFBQSxNQUNaLG9CQUFvQjtBQUFBLE1BQ3BCLHVCQUF1QjtBQUFBLE1BQ3ZCLFVBQVU7QUFBQSxNQUNWLFVBQVU7QUFBQSxNQUNWLFFBQVE7QUFBQSxJQUNULENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
