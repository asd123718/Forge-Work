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
import { generateUuid } from "../../../../base/common/uuid.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { IEnvironmentService } from "../../../environment/common/environment.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { ILogService } from "../../../log/common/log.js";
import { IProductService } from "../../../product/common/productService.js";
import { ISandboxHelperService } from "../../../sandbox/common/sandboxHelperService.js";
import { TerminalClaimKind } from "../../common/state/protocol/state.js";
import { isZsh } from "../agentHostShellUtils.js";
import { IAgentHostTerminalManager } from "../agentHostTerminalManager.js";
import { createAgentHostSandboxEngine } from "./agentHostSandboxEngine.js";
import { IAgentConfigurationService } from "../agentConfigurationService.js";
import { DEFAULT_SHELL_COMMAND_TIMEOUT_MS, executeShellCommand, isMultilineCommand, prefixForHistorySuppression, prepareOutputForModel, shellTypeForExecutable } from "../shared/shellCommandExecution.js";
const ALT_BUFFER_MESSAGE = "The command opened the alternate buffer and is still running in the terminal. It likely launched an interactive terminal UI. Use write_bash/write_powershell to interact with it, or shutdown the shell to stop it.";
let ShellManager = class extends Disposable {
  constructor(_sessionUri, workingDirectory, _terminalManager, _logService, _instantiationService, _environmentService, _productService, _agentConfigurationService, _sandboxHelper) {
    super();
    this._sessionUri = _sessionUri;
    this.workingDirectory = workingDirectory;
    this._terminalManager = _terminalManager;
    this._logService = _logService;
    this._instantiationService = _instantiationService;
    this._environmentService = _environmentService;
    this._productService = _productService;
    this._agentConfigurationService = _agentConfigurationService;
    this._sandboxHelper = _sandboxHelper;
    this._shells = /* @__PURE__ */ new Map();
    this._toolCallShells = /* @__PURE__ */ new Map();
    /** Set of shell ids currently executing a command and unsafe to share. */
    this._busyShellIds = /* @__PURE__ */ new Set();
    /** Release listeners for shells held after a tool returns while the command is still running. */
    this._heldShellReleaseListeners = /* @__PURE__ */ new Map();
    this._onDidAssociateTerminal = this._register(new Emitter());
    this.onDidAssociateTerminal = this._onDidAssociateTerminal.event;
    this._register(toDisposable(() => {
      for (const store of this._heldShellReleaseListeners.values()) {
        store.dispose();
      }
      this._heldShellReleaseListeners.clear();
      for (const shell of this._shells.values()) {
        if (this._terminalManager.hasTerminal(shell.terminalUri)) {
          this._terminalManager.disposeTerminal(shell.terminalUri);
        }
      }
      this._shells.clear();
      this._toolCallShells.clear();
      this._busyShellIds.clear();
    }));
  }
  /**
   * Resolves the session's shell executable via {@link IAgentHostTerminalManager.getDefaultShell}
   * and caches it so every tool call in the session uses the same binary
   * (keeps `shellType`, sentinel format, and history suppression consistent).
   */
  getResolvedExecutable() {
    if (!this._resolvedExecutable) {
      this._resolvedExecutable = this._terminalManager.getDefaultShell();
    }
    return this._resolvedExecutable;
  }
  /**
   * Lazily constructs the per-session {@link TerminalSandboxEngine}. The engine
   * is registered for disposal alongside the {@link ShellManager}; its temp dir
   * is cleaned up best-effort on dispose.
   */
  getOrCreateSandboxEngine() {
    if (!this._sandboxEngine) {
      const sessionId = this._sessionUri.path.split("/").pop() ?? generateUuid();
      const engine = createAgentHostSandboxEngine(
        this._instantiationService,
        this._environmentService,
        this._productService,
        this._agentConfigurationService,
        this._sandboxHelper,
        sessionId,
        this.workingDirectory
      );
      this._register(engine);
      this._register(toDisposable(() => {
        void engine.cleanupTempDir().catch((err) => this._logService.warn("[ShellManager] Sandbox temp dir cleanup failed", err));
      }));
      this._sandboxEngine = engine;
    }
    return this._sandboxEngine;
  }
  /**
   * Acquire a shell of the given type for executing a single command. The
   * returned reference holds the shell exclusively — its terminal will not
   * be handed out to another concurrent caller until the reference is
   * disposed. If no idle shell of the requested type exists, a new one is
   * created.
   */
  async getOrCreateShell(shellType, turnId, toolCallId, cwd) {
    for (const shell2 of this._shells.values()) {
      if (shell2.shellType !== shellType || !this._terminalManager.hasTerminal(shell2.terminalUri)) {
        continue;
      }
      const exitCode = this._terminalManager.getExitCode(shell2.terminalUri);
      if (exitCode !== void 0) {
        this._shells.delete(shell2.id);
        continue;
      }
      if (this._busyShellIds.has(shell2.id)) {
        continue;
      }
      this._busyShellIds.add(shell2.id);
      this._trackToolCall(toolCallId, shell2.id);
      return this._makeReference(shell2);
    }
    const id = generateUuid();
    const terminalUri = `agenthost-terminal://shell/${id}`;
    const claim = {
      kind: TerminalClaimKind.Session,
      session: this._sessionUri.toString(),
      turnId,
      toolCallId
    };
    const shellDisplayName = shellType === "bash" ? "Bash" : "PowerShell";
    const executable = await this.getResolvedExecutable();
    await this._terminalManager.createTerminal({
      channel: terminalUri,
      claim,
      name: shellDisplayName,
      cwd: cwd ?? this.workingDirectory?.fsPath
    }, { shell: executable, preventShellHistory: true, nonInteractive: true });
    const shell = { id, terminalUri, shellType, executable };
    this._shells.set(id, shell);
    this._busyShellIds.add(id);
    this._trackToolCall(toolCallId, id);
    this._logService.info(`[ShellManager] Created ${shellType} shell ${id} (terminal=${terminalUri},  executable=${executable})`);
    return this._makeReference(shell);
  }
  _makeReference(shell) {
    let disposed = false;
    return {
      object: shell,
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        this._busyShellIds.delete(shell.id);
      }
    };
  }
  holdShellUntilCommandFinishes(shell) {
    if (this._heldShellReleaseListeners.has(shell.id)) {
      return;
    }
    const store = new DisposableStore();
    const release = () => {
      this._busyShellIds.delete(shell.id);
      this._heldShellReleaseListeners.delete(shell.id);
      store.dispose();
    };
    store.add(this._terminalManager.onCommandFinished(shell.terminalUri, release));
    store.add(this._terminalManager.onExit(shell.terminalUri, release));
    this._heldShellReleaseListeners.set(shell.id, store);
  }
  _trackToolCall(toolCallId, shellId) {
    this._toolCallShells.set(toolCallId, shellId);
    const shell = this._shells.get(shellId);
    if (shell) {
      const displayName = shell.shellType === "bash" ? "Bash" : "PowerShell";
      this._onDidAssociateTerminal.fire({ toolCallId, terminalUri: shell.terminalUri, displayName });
    }
  }
  getTerminalUriForToolCall(toolCallId) {
    const shellId = this._toolCallShells.get(toolCallId);
    if (!shellId) {
      return void 0;
    }
    return this._shells.get(shellId)?.terminalUri;
  }
  getShell(id) {
    return this._shells.get(id);
  }
  listShells() {
    const result = [];
    for (const shell of this._shells.values()) {
      if (this._terminalManager.hasTerminal(shell.terminalUri)) {
        result.push(shell);
      }
    }
    return result;
  }
  shutdownShell(id) {
    const shell = this._shells.get(id);
    if (!shell) {
      return false;
    }
    this._heldShellReleaseListeners.get(id)?.dispose();
    this._heldShellReleaseListeners.delete(id);
    this._terminalManager.disposeTerminal(shell.terminalUri);
    this._shells.delete(id);
    this._busyShellIds.delete(id);
    this._logService.info(`[ShellManager] Shut down shell ${id}`);
    return true;
  }
};
ShellManager = __decorateClass([
  __decorateParam(2, IAgentHostTerminalManager),
  __decorateParam(3, ILogService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IEnvironmentService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IAgentConfigurationService),
  __decorateParam(8, ISandboxHelperService)
], ShellManager);
function makeSuccessResult(text) {
  return { textResultForLlm: text, resultType: "success" };
}
function makeFailureResult(text, error) {
  return { textResultForLlm: text, resultType: "failure", error };
}
function makeExecutionResult(toolResult, options) {
  return { toolResult, keepShellBusy: options?.keepShellBusy };
}
function shellCommandResultToExecutionResult(result, timeoutMs) {
  switch (result.status) {
    case "completed": {
      const exitCode = result.exitCode ?? 0;
      const text = `Exit code: ${exitCode}
${result.output}`;
      return makeExecutionResult(exitCode === 0 ? makeSuccessResult(text) : makeFailureResult(text));
    }
    case "shellExited":
      return makeExecutionResult(makeFailureResult(`Shell exited with code ${result.exitCode}
${result.output}`));
    case "timeout":
      return makeExecutionResult(makeFailureResult(
        `Command timed out after ${Math.round(timeoutMs / 1e3)}s. Partial output:
${result.output}`,
        "timeout"
      ));
    case "background":
      return makeExecutionResult(
        makeSuccessResult("The user chose to continue this command in the background. The terminal is still running."),
        { keepShellBusy: true }
      );
    case "altBuffer":
      return makeExecutionResult(makeFailureResult(ALT_BUFFER_MESSAGE, "alternateBuffer"), { keepShellBusy: true });
  }
}
async function executeCommandInShell(shell, command, timeoutMs, terminalManager, logService) {
  const result = shellCommandResultToExecutionResult(
    await executeShellCommand(shell, command, timeoutMs, terminalManager, logService),
    timeoutMs
  );
  return {
    ...result,
    toolResult: {
      ...result.toolResult,
      textResultForLlm: `Shell ID: ${shell.id}
${result.toolResult.textResultForLlm}`
    }
  };
}
async function createShellTools(shellManager, terminalManager, logService, confirmUnsandboxedExecution) {
  const executable = await shellManager.getResolvedExecutable();
  const shellType = shellTypeForExecutable(executable);
  const engine = shellManager.getOrCreateSandboxEngine();
  const sandboxEnabled = await engine.isEnabled();
  const networkDomains = sandboxEnabled ? engine.getResolvedNetworkDomains() : void 0;
  const primaryTool = {
    name: shellType,
    description: shellType === "bash" ? isZsh(executable) ? createZshModelDescription(sandboxEnabled, networkDomains) : createBashModelDescription(sandboxEnabled, networkDomains) : createPowerShellModelDescription(shellType, executable, sandboxEnabled, networkDomains),
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The command to execute" },
        timeout: { type: "number", description: "Timeout in milliseconds (default 120000)" },
        ...sandboxEnabled ? {
          requestUnsandboxedExecution: {
            type: "boolean",
            description: "Request that this command run outside the sandbox. Only set this after first executing the command in the sandbox and observing that sandboxing caused the failure. The user will be prompted before the command runs unsandboxed."
          },
          requestUnsandboxedExecutionReason: {
            type: "string",
            description: "A short explanation of the sandboxed execution failure or blocked-domain requirement that justifies retrying outside the sandbox. Only provide this when requestUnsandboxedExecution is true."
          }
        } : {}
      },
      required: ["command"]
    },
    overridesBuiltInTool: true,
    handler: async (args, invocation) => {
      const timeoutMs = args.timeout ?? DEFAULT_SHELL_COMMAND_TIMEOUT_MS;
      const ref = await shellManager.getOrCreateShell(
        shellType,
        invocation.toolCallId,
        invocation.toolCallId
      );
      let shouldReleaseShell = true;
      try {
        let commandToRun = args.command;
        if (sandboxEnabled) {
          if (args.requestUnsandboxedExecution && !engine.areUnsandboxedCommandsAllowed()) {
            return makeFailureResult(
              "Unsandboxed execution is disabled by the chat.agent.sandbox.allowUnsandboxedCommands setting.",
              "unsandboxed_disabled"
            );
          }
          const requestUnsandboxedConfirmation = async (blockedDomains) => {
            if (!confirmUnsandboxedExecution) {
              const blocked = blockedDomains?.join(", ") ?? "(unknown)";
              return makeFailureResult(
                `Command requires approval to run outside the sandbox. Blocked domains: ${blocked}. Re-run with requestUnsandboxedExecution=true and requestUnsandboxedExecutionReason explaining why unsandboxed access is required.`,
                "sandbox_blocked"
              );
            }
            const approved = await confirmUnsandboxedExecution({
              toolCallId: invocation.toolCallId,
              toolName: invocation.toolName,
              shellExecutable: executable,
              command: args.command,
              reason: args.requestUnsandboxedExecutionReason,
              blockedDomains
            });
            return approved;
          };
          let wrapped = await engine.wrapCommand(
            args.command,
            args.requestUnsandboxedExecution,
            executable,
            ref.object.shellType === "bash" ? shellManager.workingDirectory : void 0
          );
          if (args.requestUnsandboxedExecution && !wrapped.isSandboxWrapped) {
            const decision = await requestUnsandboxedConfirmation(wrapped.blockedDomains);
            if (typeof decision !== "boolean") {
              return decision;
            }
            if (!decision) {
              const blocked = wrapped.blockedDomains?.join(", ") ?? "(none)";
              return makeFailureResult(
                `User declined to run command outside the sandbox. Blocked domains: ${blocked}.`,
                "sandbox_blocked"
              );
            }
          }
          if (wrapped.requiresUnsandboxConfirmation) {
            const decision = await requestUnsandboxedConfirmation(wrapped.blockedDomains);
            if (typeof decision !== "boolean") {
              return decision;
            }
            if (!decision) {
              const blocked = wrapped.blockedDomains?.join(", ") ?? "(unknown)";
              return makeFailureResult(
                `User declined to run command outside the sandbox. Blocked domains: ${blocked}.`,
                "sandbox_blocked"
              );
            }
            wrapped = await engine.wrapCommand(
              args.command,
              true,
              executable,
              ref.object.shellType === "bash" ? shellManager.workingDirectory : void 0
            );
          }
          commandToRun = wrapped.command;
        }
        const result = await executeCommandInShell(ref.object, commandToRun, timeoutMs, terminalManager, logService);
        if (result.keepShellBusy) {
          shouldReleaseShell = false;
          shellManager.holdShellUntilCommandFinishes(ref.object);
        }
        return result.toolResult;
      } finally {
        if (shouldReleaseShell) {
          ref.dispose();
        }
      }
    }
  };
  const readTool = {
    name: `read_${shellType}`,
    description: `Read the latest output from a running ${shellType} shell.`,
    parameters: {
      type: "object",
      properties: {
        shell_id: { type: "string", description: "Shell ID to read from (optional; uses latest shell if omitted)" }
      }
    },
    overridesBuiltInTool: true,
    skipPermission: true,
    handler: (args) => {
      const shells = shellManager.listShells();
      const shell = args.shell_id ? shellManager.getShell(args.shell_id) : shells[shells.length - 1];
      if (!shell) {
        return makeFailureResult("No active shell found.", "no_shell");
      }
      const content = terminalManager.getContent(shell.terminalUri);
      if (!content) {
        return makeSuccessResult("(no output)");
      }
      return makeSuccessResult(prepareOutputForModel(content));
    }
  };
  const writeTool = {
    name: `write_${shellType}`,
    description: `Send input to a running ${shellType} shell (e.g. answering a prompt, sending Ctrl+C).`,
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Text to write to the shell stdin" }
      },
      required: ["command"]
    },
    overridesBuiltInTool: true,
    skipPermission: true,
    handler: async (args) => {
      const shells = shellManager.listShells();
      const shell = shells[shells.length - 1];
      if (!shell) {
        return makeFailureResult("No active shell found.", "no_shell");
      }
      await terminalManager.sendText(shell.terminalUri, args.command, { shouldExecute: false });
      return makeSuccessResult("Input sent to shell.");
    }
  };
  const shutdownTool = {
    name: shellType === "bash" ? "bash_shutdown" : `${shellType}_shutdown`,
    description: `Stop a ${shellType} shell.`,
    parameters: {
      type: "object",
      properties: {
        shell_id: { type: "string", description: "Shell ID to stop (optional; stops latest shell if omitted)" }
      }
    },
    overridesBuiltInTool: true,
    skipPermission: true,
    handler: (args) => {
      if (args.shell_id) {
        const success = shellManager.shutdownShell(args.shell_id);
        return success ? makeSuccessResult("Shell stopped.") : makeFailureResult("Shell not found.", "not_found");
      }
      const shells = shellManager.listShells();
      const shell = shells[shells.length - 1];
      if (!shell) {
        return makeFailureResult("No active shell to stop.", "no_shell");
      }
      shellManager.shutdownShell(shell.id);
      return makeSuccessResult("Shell stopped.");
    }
  };
  const listTool = {
    name: `list_${shellType}`,
    description: `List active ${shellType} shell instances.`,
    parameters: { type: "object", properties: {} },
    overridesBuiltInTool: true,
    skipPermission: true,
    handler: () => {
      const shells = shellManager.listShells();
      if (shells.length === 0) {
        return makeSuccessResult("No active shells.");
      }
      const descriptions = shells.map((s) => {
        const exitCode = terminalManager.getExitCode(s.terminalUri);
        const status = exitCode !== void 0 ? `exited (${exitCode})` : "running";
        return `- ${s.id}: ${s.shellType} [${status}]`;
      });
      return makeSuccessResult(descriptions.join("\n"));
    }
  };
  const otherShellType = shellType === "bash" ? "powershell" : "bash";
  const redirectMessage = `This tool is disabled because the configured shell is ${executable}. Use the \`${shellType}\` tool instead.`;
  const redirectTool = {
    name: otherShellType,
    description: redirectMessage,
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The command to execute" },
        timeout: { type: "number", description: "Timeout in milliseconds (default 120000)" }
      },
      required: ["command"]
    },
    overridesBuiltInTool: true,
    skipPermission: true,
    handler: () => {
      return makeFailureResult(redirectMessage, "wrong_shell");
    }
  };
  return [primaryTool, readTool, writeTool, shutdownTool, listTool, redirectTool];
}
function isWindowsPowerShell(envShell) {
  return envShell.endsWith("System32\\WindowsPowerShell\\v1.0\\powershell.exe");
}
function createPowerShellModelDescription(shellType, shellPath, isSandboxEnabled, networkDomains) {
  const isWinPwsh = isWindowsPowerShell(shellPath);
  const parts = [
    `This tool allows you to execute ${isWinPwsh ? "Windows PowerShell 5.1" : "PowerShell"} commands in a persistent terminal session, preserving environment variables, working directory, and other context across multiple commands.`,
    "",
    "Command Execution:",
    // IMPORTANT: PowerShell 5 does not support `&&` so always re-write them to `;`. Note that
    // the behavior of `&&` differs a little from `;` but in general it's fine
    isWinPwsh ? "- Use semicolons ; to chain commands on one line, NEVER use && even when asked explicitly" : "- Prefer ; when chaining commands on one line",
    "- Prefer pipelines | for object-based data flow",
    '- Never create a sub-shell (eg. powershell -c "command") unless explicitly asked',
    "",
    "Directory Management:",
    "- Prefer relative paths when navigating directories, only use absolute when the path is far away or the current cwd is not expected",
    "- By default (mode=sync), shell and cwd are reused by subsequent sync commands",
    "- Use $PWD or Get-Location for current directory",
    "- Use Push-Location/Pop-Location for directory stack",
    "",
    "Program Execution:",
    "- Supports .NET, Python, Node.js, and other executables",
    "- Install modules via Install-Module, Install-Package",
    "- Use Get-Command to verify cmdlet/function availability",
    "",
    "Async Mode:",
    "- For long-running tasks (e.g., servers), use mode=async",
    "- Returns a terminal ID for checking status and runtime later",
    "- Use Start-Job for background PowerShell jobs",
    "",
    `Use write_${shellType} to send commands or input to a terminal session.`
  ];
  if (isSandboxEnabled) {
    parts.push(...createSandboxLines(networkDomains));
  }
  parts.push(
    "",
    "Output Management:",
    "- Output is automatically truncated if longer than 60KB to prevent context overflow",
    "- Use Select-Object, Where-Object, Format-Table to filter output",
    "- Use -First/-Last parameters to limit results",
    "- For pager commands, add | Out-String or | Format-List",
    "",
    "Best Practices:",
    "- Use proper cmdlet names instead of aliases in scripts",
    '- Quote paths with spaces: "C:\\Path With Spaces"',
    "- Prefer PowerShell cmdlets over external commands when available",
    "- Prefer idiomatic PowerShell like Get-ChildItem instead of dir or ls for file listings",
    "- Use Test-Path to check file/directory existence",
    "- Be specific with Select-Object properties to avoid excessive output",
    "- Avoid printing credentials unless absolutely required",
    "",
    "Interactive Input Handling:",
    "- When a terminal command is waiting for interactive input, do NOT suggest alternatives or ask the user whether to proceed. Instead, use the ask_user tool to collect the needed values from the user, then send them.",
    `- Send exactly one answer per prompt using write_${shellType}. Never send multiple answers in a single send.`,
    `- After each send, call read_${shellType} to read the next prompt before sending the next answer.`,
    "- Continue one prompt at a time until the command finishes."
  );
  return parts.join("\n");
}
function createSandboxLines(networkDomains) {
  const lines = [
    "",
    "Sandboxing:",
    "- ATTENTION: Terminal sandboxing is enabled, commands run in a sandbox by default",
    "- When executing commands within the sandboxed environment, all operations requiring a temporary directory must utilize the $TMPDIR environment variable. The /tmp directory is not guaranteed to be accessible or writable and must be avoided",
    "- Tools and scripts should respect the TMPDIR environment variable, which is automatically set to an appropriate path within the sandbox",
    "- When a command fails due to sandbox restrictions, immediately re-run it with requestUnsandboxedExecution=true. Do NOT ask the user for permission \u2014 setting this flag automatically shows a confirmation prompt to the user",
    "- Only set requestUnsandboxedExecution=true when there is evidence of failures caused by the sandbox, e.g. 'Operation not permitted' errors, network failures, or file access errors, etc",
    "- Do NOT set requestUnsandboxedExecution=true without first executing the command in sandbox mode. Always try the command in the sandbox first, and only set requestUnsandboxedExecution=true when retrying after that sandboxed execution failed due to sandbox restrictions.",
    "- When setting requestUnsandboxedExecution=true, also provide requestUnsandboxedExecutionReason explaining why the command needs unsandboxed access"
  ];
  if (networkDomains) {
    const deniedSet = new Set(networkDomains.deniedDomains);
    const effectiveAllowed = networkDomains.allowedDomains.filter((d) => !deniedSet.has(d));
    if (effectiveAllowed.length === 0) {
      lines.push("- All network access is blocked in the sandbox");
    } else {
      lines.push(`- Only the following domains are accessible in the sandbox (all other network access is blocked): ${effectiveAllowed.join(", ")}`);
    }
    if (networkDomains.deniedDomains.length > 0) {
      lines.push(`- The following domains are explicitly blocked in the sandbox: ${networkDomains.deniedDomains.join(", ")}`);
    }
  }
  return lines;
}
function createGenericDescription(shellType, isSandboxEnabled, networkDomains) {
  const parts = [`
Command Execution:
- Use && to chain simple commands on one line
- Prefer pipelines | over temporary files for data flow
- Never create a sub-shell (eg. bash -c "command") unless explicitly asked

Directory Management:
- Prefer relative paths when navigating directories, only use absolute when the path is far away or the current cwd is not expected
- By default (mode=sync), shell and cwd are reused by subsequent sync commands
- Use $PWD for current directory references
- Consider using pushd/popd for directory stack management
- Supports directory shortcuts like ~ and -

Program Execution:
- Supports Python, Node.js, and other executables
- Install packages via package managers (brew, apt, etc.)
- Use which or command -v to verify command availability

Async Mode:
- For long-running tasks (e.g., servers), use mode=async
- Returns a terminal ID for checking status and runtime later

Use write_${shellType} to send commands or input to a terminal session.`];
  if (isSandboxEnabled) {
    parts.push(createSandboxLines(networkDomains).join("\n"));
  }
  parts.push(`

Output Management:
- Output is automatically truncated if longer than 60KB to prevent context overflow
- Use head, tail, grep, awk to filter and limit output size
- For pager commands, disable paging: git --no-pager or add | cat
- Use wc -l to count lines before displaying large outputs

Best Practices:
- Quote variables: "$var" instead of $var to handle spaces
- Use find with -exec or xargs for file operations
- Be specific with commands to avoid excessive output
- Avoid printing credentials unless absolutely required
- NEVER run sleep or similar wait commands in a terminal. You will be automatically notified on your next turn when async terminal commands or timed-out sync commands complete or need input. Do NOT poll for completion.

Interactive Input Handling:
- When a terminal command is waiting for interactive input, do NOT suggest alternatives or ask the user whether to proceed. Instead, use the ask_user tool to collect the needed values from the user, then send them.
- Send exactly one answer per prompt using write_${shellType}. Never send multiple answers in a single send.
- After each send, call read_${shellType} to read the next prompt before sending the next answer.
- Continue one prompt at a time until the command finishes.`);
  return parts.join("");
}
function createBashModelDescription(isSandboxEnabled, networkDomains) {
  return [
    "This tool allows you to execute shell commands in a persistent bash terminal session, preserving environment variables, working directory, and other context across multiple commands.",
    createGenericDescription("bash", isSandboxEnabled, networkDomains),
    "- Use [[ ]] for conditional tests instead of [ ]",
    "- Prefer $() over backticks for command substitution",
    "- Use set -e at start of complex commands to exit on errors"
  ].join("\n");
}
function createZshModelDescription(isSandboxEnabled, networkDomains) {
  return [
    "This tool allows you to execute shell commands in a persistent zsh terminal session, preserving environment variables, working directory, and other context across multiple commands.",
    createGenericDescription("bash", isSandboxEnabled, networkDomains),
    "- Use type to check command type (builtin, function, alias)",
    "- Use jobs, fg, bg for job control",
    "- Use [[ ]] for conditional tests instead of [ ]",
    "- Prefer $() over backticks for command substitution",
    "- Take advantage of zsh globbing features (**, extended globs). Note: unmatched globs fail by default (zsh: no matches found) - use a glob qualifier like *(N) or quote the glob if it should be literal",
    "",
    "zsh pitfalls - these WILL cause errors or hangs:",
    "- NEVER use bare == or === as separators (e.g. echo === triggers zsh equals expansion). Quote them: echo '==='",
    "- NEVER use status as a variable name (it is read-only in zsh). Use exit_code or ret instead"
  ].join("\n");
}
export {
  ShellManager,
  createShellTools,
  isMultilineCommand,
  prefixForHistorySuppression,
  shellTypeForExecutable
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjb3BpbG90XFxjb3BpbG90U2hlbGxUb29scy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgVG9vbCwgVG9vbFJlc3VsdE9iamVjdCB9IGZyb20gJ0BnaXRodWIvY29waWxvdC1zZGsnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0eXBlIElSZWZlcmVuY2UsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTYW5kYm94SGVscGVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NhbmRib3gvY29tbW9uL3NhbmRib3hIZWxwZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSVRlcm1pbmFsU2FuZGJveFJlc29sdmVkTmV0d29ya0RvbWFpbnMgfSBmcm9tICcuLi8uLi8uLi9zYW5kYm94L2NvbW1vbi90ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsU2FuZGJveEVuZ2luZSB9IGZyb20gJy4uLy4uLy4uL3NhbmRib3gvY29tbW9uL3Rlcm1pbmFsU2FuZGJveEVuZ2luZS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENsYWltS2luZCwgdHlwZSBUZXJtaW5hbFNlc3Npb25DbGFpbSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBpc1pzaCB9IGZyb20gJy4uL2FnZW50SG9zdFNoZWxsVXRpbHMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciB9IGZyb20gJy4uL2FnZW50SG9zdFRlcm1pbmFsTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBZ2VudEhvc3RTYW5kYm94RW5naW5lIH0gZnJvbSAnLi9hZ2VudEhvc3RTYW5kYm94RW5naW5lLmpzJztcbmltcG9ydCB7IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX1NIRUxMX0NPTU1BTkRfVElNRU9VVF9NUywgZXhlY3V0ZVNoZWxsQ29tbWFuZCwgaXNNdWx0aWxpbmVDb21tYW5kLCBwcmVmaXhGb3JIaXN0b3J5U3VwcHJlc3Npb24sIHByZXBhcmVPdXRwdXRGb3JNb2RlbCwgc2hlbGxUeXBlRm9yRXhlY3V0YWJsZSwgdHlwZSBJU2hlbGxDb21tYW5kUmVzdWx0LCB0eXBlIFNoZWxsVHlwZSB9IGZyb20gJy4uL3NoYXJlZC9zaGVsbENvbW1hbmRFeGVjdXRpb24uanMnO1xuXG4vLyBSZS1leHBvcnRlZCBmb3IgY29uc3VtZXJzIChhbmQgdGVzdHMpIHRoYXQgaGlzdG9yaWNhbGx5IGltcG9ydGVkIHRoZXNlXG4vLyBzaGVsbCBoZWxwZXJzIGZyb20gdGhpcyBtb2R1bGUuIFRoZWlyIGNhbm9uaWNhbCBob21lIGlzIHRoZSBzaGFyZWQsXG4vLyBhZ2VudC1hZ25vc3RpYyBzaGVsbENvbW1hbmRFeGVjdXRpb24gbW9kdWxlLlxuZXhwb3J0IHsgaXNNdWx0aWxpbmVDb21tYW5kLCBwcmVmaXhGb3JIaXN0b3J5U3VwcHJlc3Npb24sIHNoZWxsVHlwZUZvckV4ZWN1dGFibGUgfTtcbmV4cG9ydCB0eXBlIHsgU2hlbGxUeXBlIH07XG5cbi8qKlxuICogTWVzc2FnZSByZXR1cm5lZCB0byB0aGUgbW9kZWwgd2hlbiBhIGNvbW1hbmQgc3dpdGNoZXMgdG8gdGhlIHRlcm1pbmFsJ3NcbiAqIGFsdGVybmF0ZSBidWZmZXIgKHR5cGljYWxseSBhbiBpbnRlcmFjdGl2ZSBmdWxsLXNjcmVlbiBVSSkuXG4gKi9cbmNvbnN0IEFMVF9CVUZGRVJfTUVTU0FHRSA9ICdUaGUgY29tbWFuZCBvcGVuZWQgdGhlIGFsdGVybmF0ZSBidWZmZXIgYW5kIGlzIHN0aWxsIHJ1bm5pbmcgaW4gdGhlIHRlcm1pbmFsLiBJdCBsaWtlbHkgbGF1bmNoZWQgYW4gaW50ZXJhY3RpdmUgdGVybWluYWwgVUkuIFVzZSB3cml0ZV9iYXNoL3dyaXRlX3Bvd2Vyc2hlbGwgdG8gaW50ZXJhY3Qgd2l0aCBpdCwgb3Igc2h1dGRvd24gdGhlIHNoZWxsIHRvIHN0b3AgaXQuJztcblxuLyoqXG4gKiBUcmFja3MgYSBzaW5nbGUgcGVyc2lzdGVudCBzaGVsbCBpbnN0YW5jZSBiYWNrZWQgYnkgYSBtYW5hZ2VkIFBUWSB0ZXJtaW5hbC5cbiAqL1xuaW50ZXJmYWNlIElNYW5hZ2VkU2hlbGwge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSB0ZXJtaW5hbFVyaTogc3RyaW5nO1xuXHRyZWFkb25seSBzaGVsbFR5cGU6IFNoZWxsVHlwZTtcblx0cmVhZG9ubHkgZXhlY3V0YWJsZTogc3RyaW5nO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFNoZWxsTWFuYWdlclxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogUGVyLXNlc3Npb24gbWFuYWdlciBmb3IgcGVyc2lzdGVudCBzaGVsbCBpbnN0YW5jZXMuIEVhY2ggc2hlbGwgaXMgYmFja2VkIGJ5XG4gKiBhIHtAbGluayBJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyfSB0ZXJtaW5hbCBhbmQgcGFydGljaXBhdGVzIGluIEFIUCB0ZXJtaW5hbFxuICogY2xhaW0gc2VtYW50aWNzLlxuICpcbiAqIENyZWF0ZWQgdmlhIHtAbGluayBJSW5zdGFudGlhdGlvblNlcnZpY2V9IG9uY2UgcGVyIHNlc3Npb24gYW5kIGRpc3Bvc2VkIHdoZW5cbiAqIHRoZSBzZXNzaW9uIGVuZHMuXG4gKi9cbmV4cG9ydCBjbGFzcyBTaGVsbE1hbmFnZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zaGVsbHMgPSBuZXcgTWFwPHN0cmluZywgSU1hbmFnZWRTaGVsbD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9vbENhbGxTaGVsbHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRwcml2YXRlIF9yZXNvbHZlZEV4ZWN1dGFibGU6IFByb21pc2U8c3RyaW5nPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2FuZGJveEVuZ2luZTogVGVybWluYWxTYW5kYm94RW5naW5lIHwgdW5kZWZpbmVkO1xuXHQvKiogU2V0IG9mIHNoZWxsIGlkcyBjdXJyZW50bHkgZXhlY3V0aW5nIGEgY29tbWFuZCBhbmQgdW5zYWZlIHRvIHNoYXJlLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9idXN5U2hlbGxJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0LyoqIFJlbGVhc2UgbGlzdGVuZXJzIGZvciBzaGVsbHMgaGVsZCBhZnRlciBhIHRvb2wgcmV0dXJucyB3aGlsZSB0aGUgY29tbWFuZCBpcyBzdGlsbCBydW5uaW5nLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oZWxkU2hlbGxSZWxlYXNlTGlzdGVuZXJzID0gbmV3IE1hcDxzdHJpbmcsIERpc3Bvc2FibGVTdG9yZT4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFzc29jaWF0ZVRlcm1pbmFsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyB0b29sQ2FsbElkOiBzdHJpbmc7IHRlcm1pbmFsVXJpOiBzdHJpbmc7IGRpc3BsYXlOYW1lOiBzdHJpbmcgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQXNzb2NpYXRlVGVybWluYWw6IEV2ZW50PHsgdG9vbENhbGxJZDogc3RyaW5nOyB0ZXJtaW5hbFVyaTogc3RyaW5nOyBkaXNwbGF5TmFtZTogc3RyaW5nIH0+ID0gdGhpcy5fb25EaWRBc3NvY2lhdGVUZXJtaW5hbC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uVXJpOiBVUkksXG5cdFx0cHVibGljIHJlYWRvbmx5IHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRASUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbE1hbmFnZXI6IElBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVNhbmRib3hIZWxwZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3NhbmRib3hIZWxwZXI6IElTYW5kYm94SGVscGVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHN0b3JlIG9mIHRoaXMuX2hlbGRTaGVsbFJlbGVhc2VMaXN0ZW5lcnMudmFsdWVzKCkpIHtcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5faGVsZFNoZWxsUmVsZWFzZUxpc3RlbmVycy5jbGVhcigpO1xuXHRcdFx0Zm9yIChjb25zdCBzaGVsbCBvZiB0aGlzLl9zaGVsbHMudmFsdWVzKCkpIHtcblx0XHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsTWFuYWdlci5oYXNUZXJtaW5hbChzaGVsbC50ZXJtaW5hbFVyaSkpIHtcblx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbE1hbmFnZXIuZGlzcG9zZVRlcm1pbmFsKHNoZWxsLnRlcm1pbmFsVXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2hlbGxzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl90b29sQ2FsbFNoZWxscy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fYnVzeVNoZWxsSWRzLmNsZWFyKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBzZXNzaW9uJ3Mgc2hlbGwgZXhlY3V0YWJsZSB2aWEge0BsaW5rIElBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIuZ2V0RGVmYXVsdFNoZWxsfVxuXHQgKiBhbmQgY2FjaGVzIGl0IHNvIGV2ZXJ5IHRvb2wgY2FsbCBpbiB0aGUgc2Vzc2lvbiB1c2VzIHRoZSBzYW1lIGJpbmFyeVxuXHQgKiAoa2VlcHMgYHNoZWxsVHlwZWAsIHNlbnRpbmVsIGZvcm1hdCwgYW5kIGhpc3Rvcnkgc3VwcHJlc3Npb24gY29uc2lzdGVudCkuXG5cdCAqL1xuXHRnZXRSZXNvbHZlZEV4ZWN1dGFibGUoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRpZiAoIXRoaXMuX3Jlc29sdmVkRXhlY3V0YWJsZSkge1xuXHRcdFx0dGhpcy5fcmVzb2x2ZWRFeGVjdXRhYmxlID0gdGhpcy5fdGVybWluYWxNYW5hZ2VyLmdldERlZmF1bHRTaGVsbCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZWRFeGVjdXRhYmxlO1xuXHR9XG5cblx0LyoqXG5cdCAqIExhemlseSBjb25zdHJ1Y3RzIHRoZSBwZXItc2Vzc2lvbiB7QGxpbmsgVGVybWluYWxTYW5kYm94RW5naW5lfS4gVGhlIGVuZ2luZVxuXHQgKiBpcyByZWdpc3RlcmVkIGZvciBkaXNwb3NhbCBhbG9uZ3NpZGUgdGhlIHtAbGluayBTaGVsbE1hbmFnZXJ9OyBpdHMgdGVtcCBkaXJcblx0ICogaXMgY2xlYW5lZCB1cCBiZXN0LWVmZm9ydCBvbiBkaXNwb3NlLlxuXHQgKi9cblx0Z2V0T3JDcmVhdGVTYW5kYm94RW5naW5lKCk6IFRlcm1pbmFsU2FuZGJveEVuZ2luZSB7XG5cdFx0aWYgKCF0aGlzLl9zYW5kYm94RW5naW5lKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLl9zZXNzaW9uVXJpLnBhdGguc3BsaXQoJy8nKS5wb3AoKSA/PyBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdGNvbnN0IGVuZ2luZSA9IGNyZWF0ZUFnZW50SG9zdFNhbmRib3hFbmdpbmUoXG5cdFx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLl9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLl9zYW5kYm94SGVscGVyLFxuXHRcdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHRcdHRoaXMud29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdCk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihlbmdpbmUpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0dm9pZCBlbmdpbmUuY2xlYW51cFRlbXBEaXIoKS5jYXRjaChlcnIgPT4gdGhpcy5fbG9nU2VydmljZS53YXJuKCdbU2hlbGxNYW5hZ2VyXSBTYW5kYm94IHRlbXAgZGlyIGNsZWFudXAgZmFpbGVkJywgZXJyKSk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9zYW5kYm94RW5naW5lID0gZW5naW5lO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2FuZGJveEVuZ2luZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBY3F1aXJlIGEgc2hlbGwgb2YgdGhlIGdpdmVuIHR5cGUgZm9yIGV4ZWN1dGluZyBhIHNpbmdsZSBjb21tYW5kLiBUaGVcblx0ICogcmV0dXJuZWQgcmVmZXJlbmNlIGhvbGRzIHRoZSBzaGVsbCBleGNsdXNpdmVseSBcdTIwMTQgaXRzIHRlcm1pbmFsIHdpbGwgbm90XG5cdCAqIGJlIGhhbmRlZCBvdXQgdG8gYW5vdGhlciBjb25jdXJyZW50IGNhbGxlciB1bnRpbCB0aGUgcmVmZXJlbmNlIGlzXG5cdCAqIGRpc3Bvc2VkLiBJZiBubyBpZGxlIHNoZWxsIG9mIHRoZSByZXF1ZXN0ZWQgdHlwZSBleGlzdHMsIGEgbmV3IG9uZSBpc1xuXHQgKiBjcmVhdGVkLlxuXHQgKi9cblx0YXN5bmMgZ2V0T3JDcmVhdGVTaGVsbChcblx0XHRzaGVsbFR5cGU6IFNoZWxsVHlwZSxcblx0XHR0dXJuSWQ6IHN0cmluZyxcblx0XHR0b29sQ2FsbElkOiBzdHJpbmcsXG5cdFx0Y3dkPzogc3RyaW5nLFxuXHQpOiBQcm9taXNlPElSZWZlcmVuY2U8SU1hbmFnZWRTaGVsbD4+IHtcblx0XHRmb3IgKGNvbnN0IHNoZWxsIG9mIHRoaXMuX3NoZWxscy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHNoZWxsLnNoZWxsVHlwZSAhPT0gc2hlbGxUeXBlIHx8ICF0aGlzLl90ZXJtaW5hbE1hbmFnZXIuaGFzVGVybWluYWwoc2hlbGwudGVybWluYWxVcmkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZXhpdENvZGUgPSB0aGlzLl90ZXJtaW5hbE1hbmFnZXIuZ2V0RXhpdENvZGUoc2hlbGwudGVybWluYWxVcmkpO1xuXHRcdFx0aWYgKGV4aXRDb2RlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fc2hlbGxzLmRlbGV0ZShzaGVsbC5pZCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2J1c3lTaGVsbElkcy5oYXMoc2hlbGwuaWQpKSB7XG5cdFx0XHRcdC8vIFNraXAgXHUyMDE0IGEgY29tbWFuZCBpcyBhbHJlYWR5IHJ1bm5pbmcgb24gdGhpcyB0ZXJtaW5hbC4gU2hhcmluZ1xuXHRcdFx0XHQvLyBpdCB3b3VsZCBpbnRlcmxlYXZlIGlucHV0L291dHB1dCBhbmQgZ2FyYmxlIGJvdGggY29tbWFuZHMuXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fYnVzeVNoZWxsSWRzLmFkZChzaGVsbC5pZCk7XG5cdFx0XHR0aGlzLl90cmFja1Rvb2xDYWxsKHRvb2xDYWxsSWQsIHNoZWxsLmlkKTtcblx0XHRcdHJldHVybiB0aGlzLl9tYWtlUmVmZXJlbmNlKHNoZWxsKTtcblx0XHR9XG5cblx0XHRjb25zdCBpZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHRlcm1pbmFsVXJpID0gYGFnZW50aG9zdC10ZXJtaW5hbDovL3NoZWxsLyR7aWR9YDtcblxuXHRcdGNvbnN0IGNsYWltOiBUZXJtaW5hbFNlc3Npb25DbGFpbSA9IHtcblx0XHRcdGtpbmQ6IFRlcm1pbmFsQ2xhaW1LaW5kLlNlc3Npb24sXG5cdFx0XHRzZXNzaW9uOiB0aGlzLl9zZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHR0b29sQ2FsbElkLFxuXHRcdH07XG5cblx0XHRjb25zdCBzaGVsbERpc3BsYXlOYW1lID0gc2hlbGxUeXBlID09PSAnYmFzaCcgPyAnQmFzaCcgOiAnUG93ZXJTaGVsbCc7XG5cdFx0Y29uc3QgZXhlY3V0YWJsZSA9IGF3YWl0IHRoaXMuZ2V0UmVzb2x2ZWRFeGVjdXRhYmxlKCk7XG5cblx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbE1hbmFnZXIuY3JlYXRlVGVybWluYWwoe1xuXHRcdFx0Y2hhbm5lbDogdGVybWluYWxVcmksXG5cdFx0XHRjbGFpbSxcblx0XHRcdG5hbWU6IHNoZWxsRGlzcGxheU5hbWUsXG5cdFx0XHRjd2Q6IGN3ZCA/PyB0aGlzLndvcmtpbmdEaXJlY3Rvcnk/LmZzUGF0aCxcblx0XHR9LCB7IHNoZWxsOiBleGVjdXRhYmxlLCBwcmV2ZW50U2hlbGxIaXN0b3J5OiB0cnVlLCBub25JbnRlcmFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGNvbnN0IHNoZWxsOiBJTWFuYWdlZFNoZWxsID0geyBpZCwgdGVybWluYWxVcmksIHNoZWxsVHlwZSwgZXhlY3V0YWJsZSB9O1xuXHRcdHRoaXMuX3NoZWxscy5zZXQoaWQsIHNoZWxsKTtcblx0XHR0aGlzLl9idXN5U2hlbGxJZHMuYWRkKGlkKTtcblx0XHR0aGlzLl90cmFja1Rvb2xDYWxsKHRvb2xDYWxsSWQsIGlkKTtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1NoZWxsTWFuYWdlcl0gQ3JlYXRlZCAke3NoZWxsVHlwZX0gc2hlbGwgJHtpZH0gKHRlcm1pbmFsPSR7dGVybWluYWxVcml9LCAgZXhlY3V0YWJsZT0ke2V4ZWN1dGFibGV9KWApO1xuXHRcdHJldHVybiB0aGlzLl9tYWtlUmVmZXJlbmNlKHNoZWxsKTtcblx0fVxuXG5cdHByaXZhdGUgX21ha2VSZWZlcmVuY2Uoc2hlbGw6IElNYW5hZ2VkU2hlbGwpOiBJUmVmZXJlbmNlPElNYW5hZ2VkU2hlbGw+IHtcblx0XHRsZXQgZGlzcG9zZWQgPSBmYWxzZTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b2JqZWN0OiBzaGVsbCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0aWYgKGRpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fYnVzeVNoZWxsSWRzLmRlbGV0ZShzaGVsbC5pZCk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRob2xkU2hlbGxVbnRpbENvbW1hbmRGaW5pc2hlcyhzaGVsbDogSU1hbmFnZWRTaGVsbCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9oZWxkU2hlbGxSZWxlYXNlTGlzdGVuZXJzLmhhcyhzaGVsbC5pZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCByZWxlYXNlID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5fYnVzeVNoZWxsSWRzLmRlbGV0ZShzaGVsbC5pZCk7XG5cdFx0XHR0aGlzLl9oZWxkU2hlbGxSZWxlYXNlTGlzdGVuZXJzLmRlbGV0ZShzaGVsbC5pZCk7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fTtcblx0XHRzdG9yZS5hZGQodGhpcy5fdGVybWluYWxNYW5hZ2VyLm9uQ29tbWFuZEZpbmlzaGVkKHNoZWxsLnRlcm1pbmFsVXJpLCByZWxlYXNlKSk7XG5cdFx0c3RvcmUuYWRkKHRoaXMuX3Rlcm1pbmFsTWFuYWdlci5vbkV4aXQoc2hlbGwudGVybWluYWxVcmksIHJlbGVhc2UpKTtcblx0XHR0aGlzLl9oZWxkU2hlbGxSZWxlYXNlTGlzdGVuZXJzLnNldChzaGVsbC5pZCwgc3RvcmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdHJhY2tUb29sQ2FsbCh0b29sQ2FsbElkOiBzdHJpbmcsIHNoZWxsSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3Rvb2xDYWxsU2hlbGxzLnNldCh0b29sQ2FsbElkLCBzaGVsbElkKTtcblx0XHRjb25zdCBzaGVsbCA9IHRoaXMuX3NoZWxscy5nZXQoc2hlbGxJZCk7XG5cdFx0aWYgKHNoZWxsKSB7XG5cdFx0XHRjb25zdCBkaXNwbGF5TmFtZSA9IHNoZWxsLnNoZWxsVHlwZSA9PT0gJ2Jhc2gnID8gJ0Jhc2gnIDogJ1Bvd2VyU2hlbGwnO1xuXHRcdFx0dGhpcy5fb25EaWRBc3NvY2lhdGVUZXJtaW5hbC5maXJlKHsgdG9vbENhbGxJZCwgdGVybWluYWxVcmk6IHNoZWxsLnRlcm1pbmFsVXJpLCBkaXNwbGF5TmFtZSB9KTtcblx0XHR9XG5cdH1cblxuXHRnZXRUZXJtaW5hbFVyaUZvclRvb2xDYWxsKHRvb2xDYWxsSWQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2hlbGxJZCA9IHRoaXMuX3Rvb2xDYWxsU2hlbGxzLmdldCh0b29sQ2FsbElkKTtcblx0XHRpZiAoIXNoZWxsSWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9zaGVsbHMuZ2V0KHNoZWxsSWQpPy50ZXJtaW5hbFVyaTtcblx0fVxuXG5cdGdldFNoZWxsKGlkOiBzdHJpbmcpOiBJTWFuYWdlZFNoZWxsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2hlbGxzLmdldChpZCk7XG5cdH1cblxuXHRsaXN0U2hlbGxzKCk6IElNYW5hZ2VkU2hlbGxbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJTWFuYWdlZFNoZWxsW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHNoZWxsIG9mIHRoaXMuX3NoZWxscy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsTWFuYWdlci5oYXNUZXJtaW5hbChzaGVsbC50ZXJtaW5hbFVyaSkpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goc2hlbGwpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0c2h1dGRvd25TaGVsbChpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2hlbGwgPSB0aGlzLl9zaGVsbHMuZ2V0KGlkKTtcblx0XHRpZiAoIXNoZWxsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX2hlbGRTaGVsbFJlbGVhc2VMaXN0ZW5lcnMuZ2V0KGlkKT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2hlbGRTaGVsbFJlbGVhc2VMaXN0ZW5lcnMuZGVsZXRlKGlkKTtcblx0XHR0aGlzLl90ZXJtaW5hbE1hbmFnZXIuZGlzcG9zZVRlcm1pbmFsKHNoZWxsLnRlcm1pbmFsVXJpKTtcblx0XHR0aGlzLl9zaGVsbHMuZGVsZXRlKGlkKTtcblx0XHR0aGlzLl9idXN5U2hlbGxJZHMuZGVsZXRlKGlkKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtTaGVsbE1hbmFnZXJdIFNodXQgZG93biBzaGVsbCAke2lkfWApO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gVG9vbCBpbXBsZW1lbnRhdGlvbnNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5pbnRlcmZhY2UgSVNoZWxsRXhlY3V0aW9uUmVzdWx0IHtcblx0cmVhZG9ubHkgdG9vbFJlc3VsdDogVG9vbFJlc3VsdE9iamVjdDtcblx0cmVhZG9ubHkga2VlcFNoZWxsQnVzeT86IGJvb2xlYW47XG59XG5cbmZ1bmN0aW9uIG1ha2VTdWNjZXNzUmVzdWx0KHRleHQ6IHN0cmluZyk6IFRvb2xSZXN1bHRPYmplY3Qge1xuXHRyZXR1cm4geyB0ZXh0UmVzdWx0Rm9yTGxtOiB0ZXh0LCByZXN1bHRUeXBlOiAnc3VjY2VzcycgfTtcbn1cblxuZnVuY3Rpb24gbWFrZUZhaWx1cmVSZXN1bHQodGV4dDogc3RyaW5nLCBlcnJvcj86IHN0cmluZyk6IFRvb2xSZXN1bHRPYmplY3Qge1xuXHRyZXR1cm4geyB0ZXh0UmVzdWx0Rm9yTGxtOiB0ZXh0LCByZXN1bHRUeXBlOiAnZmFpbHVyZScsIGVycm9yIH07XG59XG5cbmZ1bmN0aW9uIG1ha2VFeGVjdXRpb25SZXN1bHQodG9vbFJlc3VsdDogVG9vbFJlc3VsdE9iamVjdCwgb3B0aW9ucz86IHsga2VlcFNoZWxsQnVzeT86IGJvb2xlYW4gfSk6IElTaGVsbEV4ZWN1dGlvblJlc3VsdCB7XG5cdHJldHVybiB7IHRvb2xSZXN1bHQsIGtlZXBTaGVsbEJ1c3k6IG9wdGlvbnM/LmtlZXBTaGVsbEJ1c3kgfTtcbn1cblxuLyoqXG4gKiBNYXBzIHRoZSBuZXV0cmFsIHtAbGluayBJU2hlbGxDb21tYW5kUmVzdWx0fSBwcm9kdWNlZCBieSB0aGUgc2hhcmVkIHNoZWxsXG4gKiBleGVjdXRvciB0byB0aGUgQ29waWxvdCBTREsge0BsaW5rIFRvb2xSZXN1bHRPYmplY3R9IHNoYXBlIGV4cGVjdGVkIGJ5IHRoZVxuICogc2hlbGwgdG9vbHMuXG4gKi9cbmZ1bmN0aW9uIHNoZWxsQ29tbWFuZFJlc3VsdFRvRXhlY3V0aW9uUmVzdWx0KHJlc3VsdDogSVNoZWxsQ29tbWFuZFJlc3VsdCwgdGltZW91dE1zOiBudW1iZXIpOiBJU2hlbGxFeGVjdXRpb25SZXN1bHQge1xuXHRzd2l0Y2ggKHJlc3VsdC5zdGF0dXMpIHtcblx0XHRjYXNlICdjb21wbGV0ZWQnOiB7XG5cdFx0XHRjb25zdCBleGl0Q29kZSA9IHJlc3VsdC5leGl0Q29kZSA/PyAwO1xuXHRcdFx0Y29uc3QgdGV4dCA9IGBFeGl0IGNvZGU6ICR7ZXhpdENvZGV9XFxuJHtyZXN1bHQub3V0cHV0fWA7XG5cdFx0XHRyZXR1cm4gbWFrZUV4ZWN1dGlvblJlc3VsdChleGl0Q29kZSA9PT0gMCA/IG1ha2VTdWNjZXNzUmVzdWx0KHRleHQpIDogbWFrZUZhaWx1cmVSZXN1bHQodGV4dCkpO1xuXHRcdH1cblx0XHRjYXNlICdzaGVsbEV4aXRlZCc6XG5cdFx0XHRyZXR1cm4gbWFrZUV4ZWN1dGlvblJlc3VsdChtYWtlRmFpbHVyZVJlc3VsdChgU2hlbGwgZXhpdGVkIHdpdGggY29kZSAke3Jlc3VsdC5leGl0Q29kZX1cXG4ke3Jlc3VsdC5vdXRwdXR9YCkpO1xuXHRcdGNhc2UgJ3RpbWVvdXQnOlxuXHRcdFx0cmV0dXJuIG1ha2VFeGVjdXRpb25SZXN1bHQobWFrZUZhaWx1cmVSZXN1bHQoXG5cdFx0XHRcdGBDb21tYW5kIHRpbWVkIG91dCBhZnRlciAke01hdGgucm91bmQodGltZW91dE1zIC8gMTAwMCl9cy4gUGFydGlhbCBvdXRwdXQ6XFxuJHtyZXN1bHQub3V0cHV0fWAsXG5cdFx0XHRcdCd0aW1lb3V0Jyxcblx0XHRcdCkpO1xuXHRcdGNhc2UgJ2JhY2tncm91bmQnOlxuXHRcdFx0cmV0dXJuIG1ha2VFeGVjdXRpb25SZXN1bHQoXG5cdFx0XHRcdG1ha2VTdWNjZXNzUmVzdWx0KCdUaGUgdXNlciBjaG9zZSB0byBjb250aW51ZSB0aGlzIGNvbW1hbmQgaW4gdGhlIGJhY2tncm91bmQuIFRoZSB0ZXJtaW5hbCBpcyBzdGlsbCBydW5uaW5nLicpLFxuXHRcdFx0XHR7IGtlZXBTaGVsbEJ1c3k6IHRydWUgfSxcblx0XHRcdCk7XG5cdFx0Y2FzZSAnYWx0QnVmZmVyJzpcblx0XHRcdHJldHVybiBtYWtlRXhlY3V0aW9uUmVzdWx0KG1ha2VGYWlsdXJlUmVzdWx0KEFMVF9CVUZGRVJfTUVTU0FHRSwgJ2FsdGVybmF0ZUJ1ZmZlcicpLCB7IGtlZXBTaGVsbEJ1c3k6IHRydWUgfSk7XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZUNvbW1hbmRJblNoZWxsKFxuXHRzaGVsbDogSU1hbmFnZWRTaGVsbCxcblx0Y29tbWFuZDogc3RyaW5nLFxuXHR0aW1lb3V0TXM6IG51bWJlcixcblx0dGVybWluYWxNYW5hZ2VyOiBJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcbik6IFByb21pc2U8SVNoZWxsRXhlY3V0aW9uUmVzdWx0PiB7XG5cdGNvbnN0IHJlc3VsdCA9IHNoZWxsQ29tbWFuZFJlc3VsdFRvRXhlY3V0aW9uUmVzdWx0KFxuXHRcdGF3YWl0IGV4ZWN1dGVTaGVsbENvbW1hbmQoc2hlbGwsIGNvbW1hbmQsIHRpbWVvdXRNcywgdGVybWluYWxNYW5hZ2VyLCBsb2dTZXJ2aWNlKSxcblx0XHR0aW1lb3V0TXMsXG5cdCk7XG5cdHJldHVybiB7XG5cdFx0Li4ucmVzdWx0LFxuXHRcdHRvb2xSZXN1bHQ6IHtcblx0XHRcdC4uLnJlc3VsdC50b29sUmVzdWx0LFxuXHRcdFx0dGV4dFJlc3VsdEZvckxsbTogYFNoZWxsIElEOiAke3NoZWxsLmlkfVxcbiR7cmVzdWx0LnRvb2xSZXN1bHQudGV4dFJlc3VsdEZvckxsbX1gLFxuXHRcdH0sXG5cdH07XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gUHVibGljIGZhY3Rvcnlcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5pbnRlcmZhY2UgSVNoZWxsVG9vbEFyZ3Mge1xuXHRjb21tYW5kOiBzdHJpbmc7XG5cdHRpbWVvdXQ/OiBudW1iZXI7XG5cdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbj86IGJvb2xlYW47XG5cdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbj86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVW5zYW5kYm94ZWRDb21tYW5kQ29uZmlybWF0aW9uUmVxdWVzdCB7XG5cdHJlYWRvbmx5IHRvb2xDYWxsSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdG9vbE5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgc2hlbGxFeGVjdXRhYmxlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbW1hbmQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmVhc29uPzogc3RyaW5nO1xuXHRyZWFkb25seSBibG9ja2VkRG9tYWlucz86IHJlYWRvbmx5IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgdHlwZSBVbnNhbmRib3hlZENvbW1hbmRDb25maXJtYXRpb25IYW5kbGVyID0gKHJlcXVlc3Q6IElVbnNhbmRib3hlZENvbW1hbmRDb25maXJtYXRpb25SZXF1ZXN0KSA9PiBQcm9taXNlPGJvb2xlYW4+O1xuXG5pbnRlcmZhY2UgSVdyaXRlU2hlbGxBcmdzIHtcblx0Y29tbWFuZDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVJlYWRTaGVsbEFyZ3Mge1xuXHRzaGVsbF9pZD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElTaHV0ZG93blNoZWxsQXJncyB7XG5cdHNoZWxsX2lkPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIEJ1aWxkcyB0aGUgU0RLIHtAbGluayBUb29sfSBzZXQgdGhhdCBvdmVycmlkZXMgdGhlIENvcGlsb3QgU0RLJ3MgdHdvXG4gKiBidWlsdC1pbiBzaGVsbHMgKGBiYXNoYCBhbmQgYHBvd2Vyc2hlbGxgKSB3aXRoIFBUWS1iYWNrZWQgaW1wbGVtZW50YXRpb25zLFxuICogcGx1cyBjb21wYW5pb24gdG9vbHMgKHJlYWQsIHdyaXRlLCBzaHV0ZG93biwgbGlzdCkuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjcmVhdGVTaGVsbFRvb2xzKFxuXHRzaGVsbE1hbmFnZXI6IFNoZWxsTWFuYWdlcixcblx0dGVybWluYWxNYW5hZ2VyOiBJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0Y29uZmlybVVuc2FuZGJveGVkRXhlY3V0aW9uPzogVW5zYW5kYm94ZWRDb21tYW5kQ29uZmlybWF0aW9uSGFuZGxlcixcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbik6IFByb21pc2U8VG9vbDxhbnk+W10+IHtcblx0Y29uc3QgZXhlY3V0YWJsZSA9IGF3YWl0IHNoZWxsTWFuYWdlci5nZXRSZXNvbHZlZEV4ZWN1dGFibGUoKTtcblx0Y29uc3Qgc2hlbGxUeXBlID0gc2hlbGxUeXBlRm9yRXhlY3V0YWJsZShleGVjdXRhYmxlKTtcblx0Y29uc3QgZW5naW5lID0gc2hlbGxNYW5hZ2VyLmdldE9yQ3JlYXRlU2FuZGJveEVuZ2luZSgpO1xuXHRjb25zdCBzYW5kYm94RW5hYmxlZCA9IGF3YWl0IGVuZ2luZS5pc0VuYWJsZWQoKTtcblx0Y29uc3QgbmV0d29ya0RvbWFpbnMgPSBzYW5kYm94RW5hYmxlZCA/IGVuZ2luZS5nZXRSZXNvbHZlZE5ldHdvcmtEb21haW5zKCkgOiB1bmRlZmluZWQ7XG5cblx0Y29uc3QgcHJpbWFyeVRvb2w6IFRvb2w8SVNoZWxsVG9vbEFyZ3M+ID0ge1xuXHRcdG5hbWU6IHNoZWxsVHlwZSxcblx0XHRkZXNjcmlwdGlvbjogc2hlbGxUeXBlID09PSAnYmFzaCdcblx0XHRcdD8gKGlzWnNoKGV4ZWN1dGFibGUpID8gY3JlYXRlWnNoTW9kZWxEZXNjcmlwdGlvbihzYW5kYm94RW5hYmxlZCwgbmV0d29ya0RvbWFpbnMpIDogY3JlYXRlQmFzaE1vZGVsRGVzY3JpcHRpb24oc2FuZGJveEVuYWJsZWQsIG5ldHdvcmtEb21haW5zKSlcblx0XHRcdDogY3JlYXRlUG93ZXJTaGVsbE1vZGVsRGVzY3JpcHRpb24oc2hlbGxUeXBlLCBleGVjdXRhYmxlLCBzYW5kYm94RW5hYmxlZCwgbmV0d29ya0RvbWFpbnMpLFxuXHRcdHBhcmFtZXRlcnM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRjb21tYW5kOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ1RoZSBjb21tYW5kIHRvIGV4ZWN1dGUnIH0sXG5cdFx0XHRcdHRpbWVvdXQ6IHsgdHlwZTogJ251bWJlcicsIGRlc2NyaXB0aW9uOiAnVGltZW91dCBpbiBtaWxsaXNlY29uZHMgKGRlZmF1bHQgMTIwMDAwKScgfSxcblx0XHRcdFx0Li4uKHNhbmRib3hFbmFibGVkID8ge1xuXHRcdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdSZXF1ZXN0IHRoYXQgdGhpcyBjb21tYW5kIHJ1biBvdXRzaWRlIHRoZSBzYW5kYm94LiBPbmx5IHNldCB0aGlzIGFmdGVyIGZpcnN0IGV4ZWN1dGluZyB0aGUgY29tbWFuZCBpbiB0aGUgc2FuZGJveCBhbmQgb2JzZXJ2aW5nIHRoYXQgc2FuZGJveGluZyBjYXVzZWQgdGhlIGZhaWx1cmUuIFRoZSB1c2VyIHdpbGwgYmUgcHJvbXB0ZWQgYmVmb3JlIHRoZSBjb21tYW5kIHJ1bnMgdW5zYW5kYm94ZWQuJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbjoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0Egc2hvcnQgZXhwbGFuYXRpb24gb2YgdGhlIHNhbmRib3hlZCBleGVjdXRpb24gZmFpbHVyZSBvciBibG9ja2VkLWRvbWFpbiByZXF1aXJlbWVudCB0aGF0IGp1c3RpZmllcyByZXRyeWluZyBvdXRzaWRlIHRoZSBzYW5kYm94LiBPbmx5IHByb3ZpZGUgdGhpcyB3aGVuIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiBpcyB0cnVlLicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSA6IHt9KSxcblx0XHRcdH0sXG5cdFx0XHRyZXF1aXJlZDogWydjb21tYW5kJ10sXG5cdFx0fSxcblx0XHRvdmVycmlkZXNCdWlsdEluVG9vbDogdHJ1ZSxcblx0XHRoYW5kbGVyOiBhc3luYyAoYXJncywgaW52b2NhdGlvbikgPT4ge1xuXHRcdFx0Y29uc3QgdGltZW91dE1zID0gYXJncy50aW1lb3V0ID8/IERFRkFVTFRfU0hFTExfQ09NTUFORF9USU1FT1VUX01TO1xuXHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgc2hlbGxNYW5hZ2VyLmdldE9yQ3JlYXRlU2hlbGwoXG5cdFx0XHRcdHNoZWxsVHlwZSxcblx0XHRcdFx0aW52b2NhdGlvbi50b29sQ2FsbElkLFxuXHRcdFx0XHRpbnZvY2F0aW9uLnRvb2xDYWxsSWQsXG5cdFx0XHQpO1xuXHRcdFx0bGV0IHNob3VsZFJlbGVhc2VTaGVsbCA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRsZXQgY29tbWFuZFRvUnVuID0gYXJncy5jb21tYW5kO1xuXHRcdFx0XHRpZiAoc2FuZGJveEVuYWJsZWQpIHtcblx0XHRcdFx0XHRpZiAoYXJncy5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gJiYgIWVuZ2luZS5hcmVVbnNhbmRib3hlZENvbW1hbmRzQWxsb3dlZCgpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbWFrZUZhaWx1cmVSZXN1bHQoXG5cdFx0XHRcdFx0XHRcdCdVbnNhbmRib3hlZCBleGVjdXRpb24gaXMgZGlzYWJsZWQgYnkgdGhlIGNoYXQuYWdlbnQuc2FuZGJveC5hbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMgc2V0dGluZy4nLFxuXHRcdFx0XHRcdFx0XHQndW5zYW5kYm94ZWRfZGlzYWJsZWQnXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHJlcXVlc3RVbnNhbmRib3hlZENvbmZpcm1hdGlvbiA9IGFzeW5jIChibG9ja2VkRG9tYWlucz86IHJlYWRvbmx5IHN0cmluZ1tdKTogUHJvbWlzZTxib29sZWFuIHwgVG9vbFJlc3VsdE9iamVjdD4gPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFjb25maXJtVW5zYW5kYm94ZWRFeGVjdXRpb24pIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgYmxvY2tlZCA9IGJsb2NrZWREb21haW5zPy5qb2luKCcsICcpID8/ICcodW5rbm93biknO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbWFrZUZhaWx1cmVSZXN1bHQoXG5cdFx0XHRcdFx0XHRcdFx0YENvbW1hbmQgcmVxdWlyZXMgYXBwcm92YWwgdG8gcnVuIG91dHNpZGUgdGhlIHNhbmRib3guIEJsb2NrZWQgZG9tYWluczogJHtibG9ja2VkfS4gUmUtcnVuIHdpdGggcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uPXRydWUgYW5kIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbiBleHBsYWluaW5nIHdoeSB1bnNhbmRib3hlZCBhY2Nlc3MgaXMgcmVxdWlyZWQuYCxcblx0XHRcdFx0XHRcdFx0XHQnc2FuZGJveF9ibG9ja2VkJ1xuXHRcdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCBhcHByb3ZlZCA9IGF3YWl0IGNvbmZpcm1VbnNhbmRib3hlZEV4ZWN1dGlvbih7XG5cdFx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGludm9jYXRpb24udG9vbENhbGxJZCxcblx0XHRcdFx0XHRcdFx0dG9vbE5hbWU6IGludm9jYXRpb24udG9vbE5hbWUsXG5cdFx0XHRcdFx0XHRcdHNoZWxsRXhlY3V0YWJsZTogZXhlY3V0YWJsZSxcblx0XHRcdFx0XHRcdFx0Y29tbWFuZDogYXJncy5jb21tYW5kLFxuXHRcdFx0XHRcdFx0XHRyZWFzb246IGFyZ3MucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uLFxuXHRcdFx0XHRcdFx0XHRibG9ja2VkRG9tYWlucyxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGFwcHJvdmVkO1xuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRsZXQgd3JhcHBlZCA9IGF3YWl0IGVuZ2luZS53cmFwQ29tbWFuZChcblx0XHRcdFx0XHRcdGFyZ3MuY29tbWFuZCxcblx0XHRcdFx0XHRcdGFyZ3MucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uLFxuXHRcdFx0XHRcdFx0ZXhlY3V0YWJsZSxcblx0XHRcdFx0XHRcdHJlZi5vYmplY3Quc2hlbGxUeXBlID09PSAnYmFzaCcgPyBzaGVsbE1hbmFnZXIud29ya2luZ0RpcmVjdG9yeSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0aWYgKGFyZ3MucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uICYmICF3cmFwcGVkLmlzU2FuZGJveFdyYXBwZWQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGRlY2lzaW9uID0gYXdhaXQgcmVxdWVzdFVuc2FuZGJveGVkQ29uZmlybWF0aW9uKHdyYXBwZWQuYmxvY2tlZERvbWFpbnMpO1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiBkZWNpc2lvbiAhPT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBkZWNpc2lvbjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICghZGVjaXNpb24pIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgYmxvY2tlZCA9IHdyYXBwZWQuYmxvY2tlZERvbWFpbnM/LmpvaW4oJywgJykgPz8gJyhub25lKSc7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBtYWtlRmFpbHVyZVJlc3VsdChcblx0XHRcdFx0XHRcdFx0XHRgVXNlciBkZWNsaW5lZCB0byBydW4gY29tbWFuZCBvdXRzaWRlIHRoZSBzYW5kYm94LiBCbG9ja2VkIGRvbWFpbnM6ICR7YmxvY2tlZH0uYCxcblx0XHRcdFx0XHRcdFx0XHQnc2FuZGJveF9ibG9ja2VkJ1xuXHRcdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICh3cmFwcGVkLnJlcXVpcmVzVW5zYW5kYm94Q29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkZWNpc2lvbiA9IGF3YWl0IHJlcXVlc3RVbnNhbmRib3hlZENvbmZpcm1hdGlvbih3cmFwcGVkLmJsb2NrZWREb21haW5zKTtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgZGVjaXNpb24gIT09ICdib29sZWFuJykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZGVjaXNpb247XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoIWRlY2lzaW9uKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGJsb2NrZWQgPSB3cmFwcGVkLmJsb2NrZWREb21haW5zPy5qb2luKCcsICcpID8/ICcodW5rbm93biknO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbWFrZUZhaWx1cmVSZXN1bHQoXG5cdFx0XHRcdFx0XHRcdFx0YFVzZXIgZGVjbGluZWQgdG8gcnVuIGNvbW1hbmQgb3V0c2lkZSB0aGUgc2FuZGJveC4gQmxvY2tlZCBkb21haW5zOiAke2Jsb2NrZWR9LmAsXG5cdFx0XHRcdFx0XHRcdFx0J3NhbmRib3hfYmxvY2tlZCdcblx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0d3JhcHBlZCA9IGF3YWl0IGVuZ2luZS53cmFwQ29tbWFuZChcblx0XHRcdFx0XHRcdFx0YXJncy5jb21tYW5kLFxuXHRcdFx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdFx0XHRleGVjdXRhYmxlLFxuXHRcdFx0XHRcdFx0XHRyZWYub2JqZWN0LnNoZWxsVHlwZSA9PT0gJ2Jhc2gnID8gc2hlbGxNYW5hZ2VyLndvcmtpbmdEaXJlY3RvcnkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb21tYW5kVG9SdW4gPSB3cmFwcGVkLmNvbW1hbmQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZUNvbW1hbmRJblNoZWxsKHJlZi5vYmplY3QsIGNvbW1hbmRUb1J1biwgdGltZW91dE1zLCB0ZXJtaW5hbE1hbmFnZXIsIGxvZ1NlcnZpY2UpO1xuXHRcdFx0XHRpZiAocmVzdWx0LmtlZXBTaGVsbEJ1c3kpIHtcblx0XHRcdFx0XHRzaG91bGRSZWxlYXNlU2hlbGwgPSBmYWxzZTtcblx0XHRcdFx0XHRzaGVsbE1hbmFnZXIuaG9sZFNoZWxsVW50aWxDb21tYW5kRmluaXNoZXMocmVmLm9iamVjdCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlc3VsdC50b29sUmVzdWx0O1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aWYgKHNob3VsZFJlbGVhc2VTaGVsbCkge1xuXHRcdFx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHR9O1xuXG5cdGNvbnN0IHJlYWRUb29sOiBUb29sPElSZWFkU2hlbGxBcmdzPiA9IHtcblx0XHRuYW1lOiBgcmVhZF8ke3NoZWxsVHlwZX1gLFxuXHRcdGRlc2NyaXB0aW9uOiBgUmVhZCB0aGUgbGF0ZXN0IG91dHB1dCBmcm9tIGEgcnVubmluZyAke3NoZWxsVHlwZX0gc2hlbGwuYCxcblx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0c2hlbGxfaWQ6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnU2hlbGwgSUQgdG8gcmVhZCBmcm9tIChvcHRpb25hbDsgdXNlcyBsYXRlc3Qgc2hlbGwgaWYgb21pdHRlZCknIH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0b3ZlcnJpZGVzQnVpbHRJblRvb2w6IHRydWUsXG5cdFx0c2tpcFBlcm1pc3Npb246IHRydWUsXG5cdFx0aGFuZGxlcjogKGFyZ3MpID0+IHtcblx0XHRcdGNvbnN0IHNoZWxscyA9IHNoZWxsTWFuYWdlci5saXN0U2hlbGxzKCk7XG5cdFx0XHRjb25zdCBzaGVsbCA9IGFyZ3Muc2hlbGxfaWRcblx0XHRcdFx0PyBzaGVsbE1hbmFnZXIuZ2V0U2hlbGwoYXJncy5zaGVsbF9pZClcblx0XHRcdFx0OiBzaGVsbHNbc2hlbGxzLmxlbmd0aCAtIDFdO1xuXHRcdFx0aWYgKCFzaGVsbCkge1xuXHRcdFx0XHRyZXR1cm4gbWFrZUZhaWx1cmVSZXN1bHQoJ05vIGFjdGl2ZSBzaGVsbCBmb3VuZC4nLCAnbm9fc2hlbGwnKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSB0ZXJtaW5hbE1hbmFnZXIuZ2V0Q29udGVudChzaGVsbC50ZXJtaW5hbFVyaSk7XG5cdFx0XHRpZiAoIWNvbnRlbnQpIHtcblx0XHRcdFx0cmV0dXJuIG1ha2VTdWNjZXNzUmVzdWx0KCcobm8gb3V0cHV0KScpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1ha2VTdWNjZXNzUmVzdWx0KHByZXBhcmVPdXRwdXRGb3JNb2RlbChjb250ZW50KSk7XG5cdFx0fSxcblx0fTtcblxuXHRjb25zdCB3cml0ZVRvb2w6IFRvb2w8SVdyaXRlU2hlbGxBcmdzPiA9IHtcblx0XHRuYW1lOiBgd3JpdGVfJHtzaGVsbFR5cGV9YCxcblx0XHRkZXNjcmlwdGlvbjogYFNlbmQgaW5wdXQgdG8gYSBydW5uaW5nICR7c2hlbGxUeXBlfSBzaGVsbCAoZS5nLiBhbnN3ZXJpbmcgYSBwcm9tcHQsIHNlbmRpbmcgQ3RybCtDKS5gLFxuXHRcdHBhcmFtZXRlcnM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRjb21tYW5kOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ1RleHQgdG8gd3JpdGUgdG8gdGhlIHNoZWxsIHN0ZGluJyB9LFxuXHRcdFx0fSxcblx0XHRcdHJlcXVpcmVkOiBbJ2NvbW1hbmQnXSxcblx0XHR9LFxuXHRcdG92ZXJyaWRlc0J1aWx0SW5Ub29sOiB0cnVlLFxuXHRcdHNraXBQZXJtaXNzaW9uOiB0cnVlLFxuXHRcdGhhbmRsZXI6IGFzeW5jIChhcmdzKSA9PiB7XG5cdFx0XHRjb25zdCBzaGVsbHMgPSBzaGVsbE1hbmFnZXIubGlzdFNoZWxscygpO1xuXHRcdFx0Y29uc3Qgc2hlbGwgPSBzaGVsbHNbc2hlbGxzLmxlbmd0aCAtIDFdO1xuXHRcdFx0aWYgKCFzaGVsbCkge1xuXHRcdFx0XHRyZXR1cm4gbWFrZUZhaWx1cmVSZXN1bHQoJ05vIGFjdGl2ZSBzaGVsbCBmb3VuZC4nLCAnbm9fc2hlbGwnKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRlcm1pbmFsTWFuYWdlci5zZW5kVGV4dChzaGVsbC50ZXJtaW5hbFVyaSwgYXJncy5jb21tYW5kLCB7IHNob3VsZEV4ZWN1dGU6IGZhbHNlIH0pO1xuXHRcdFx0cmV0dXJuIG1ha2VTdWNjZXNzUmVzdWx0KCdJbnB1dCBzZW50IHRvIHNoZWxsLicpO1xuXHRcdH0sXG5cdH07XG5cblx0Y29uc3Qgc2h1dGRvd25Ub29sOiBUb29sPElTaHV0ZG93blNoZWxsQXJncz4gPSB7XG5cdFx0bmFtZTogc2hlbGxUeXBlID09PSAnYmFzaCcgPyAnYmFzaF9zaHV0ZG93bicgOiBgJHtzaGVsbFR5cGV9X3NodXRkb3duYCxcblx0XHRkZXNjcmlwdGlvbjogYFN0b3AgYSAke3NoZWxsVHlwZX0gc2hlbGwuYCxcblx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0c2hlbGxfaWQ6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnU2hlbGwgSUQgdG8gc3RvcCAob3B0aW9uYWw7IHN0b3BzIGxhdGVzdCBzaGVsbCBpZiBvbWl0dGVkKScgfSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRvdmVycmlkZXNCdWlsdEluVG9vbDogdHJ1ZSxcblx0XHRza2lwUGVybWlzc2lvbjogdHJ1ZSxcblx0XHRoYW5kbGVyOiAoYXJncykgPT4ge1xuXHRcdFx0aWYgKGFyZ3Muc2hlbGxfaWQpIHtcblx0XHRcdFx0Y29uc3Qgc3VjY2VzcyA9IHNoZWxsTWFuYWdlci5zaHV0ZG93blNoZWxsKGFyZ3Muc2hlbGxfaWQpO1xuXHRcdFx0XHRyZXR1cm4gc3VjY2Vzc1xuXHRcdFx0XHRcdD8gbWFrZVN1Y2Nlc3NSZXN1bHQoJ1NoZWxsIHN0b3BwZWQuJylcblx0XHRcdFx0XHQ6IG1ha2VGYWlsdXJlUmVzdWx0KCdTaGVsbCBub3QgZm91bmQuJywgJ25vdF9mb3VuZCcpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2hlbGxzID0gc2hlbGxNYW5hZ2VyLmxpc3RTaGVsbHMoKTtcblx0XHRcdGNvbnN0IHNoZWxsID0gc2hlbGxzW3NoZWxscy5sZW5ndGggLSAxXTtcblx0XHRcdGlmICghc2hlbGwpIHtcblx0XHRcdFx0cmV0dXJuIG1ha2VGYWlsdXJlUmVzdWx0KCdObyBhY3RpdmUgc2hlbGwgdG8gc3RvcC4nLCAnbm9fc2hlbGwnKTtcblx0XHRcdH1cblx0XHRcdHNoZWxsTWFuYWdlci5zaHV0ZG93blNoZWxsKHNoZWxsLmlkKTtcblx0XHRcdHJldHVybiBtYWtlU3VjY2Vzc1Jlc3VsdCgnU2hlbGwgc3RvcHBlZC4nKTtcblx0XHR9LFxuXHR9O1xuXG5cdGNvbnN0IGxpc3RUb29sOiBUb29sPFJlY29yZDxzdHJpbmcsIG5ldmVyPj4gPSB7XG5cdFx0bmFtZTogYGxpc3RfJHtzaGVsbFR5cGV9YCxcblx0XHRkZXNjcmlwdGlvbjogYExpc3QgYWN0aXZlICR7c2hlbGxUeXBlfSBzaGVsbCBpbnN0YW5jZXMuYCxcblx0XHRwYXJhbWV0ZXJzOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdG92ZXJyaWRlc0J1aWx0SW5Ub29sOiB0cnVlLFxuXHRcdHNraXBQZXJtaXNzaW9uOiB0cnVlLFxuXHRcdGhhbmRsZXI6ICgpID0+IHtcblx0XHRcdGNvbnN0IHNoZWxscyA9IHNoZWxsTWFuYWdlci5saXN0U2hlbGxzKCk7XG5cdFx0XHRpZiAoc2hlbGxzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gbWFrZVN1Y2Nlc3NSZXN1bHQoJ05vIGFjdGl2ZSBzaGVsbHMuJyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkZXNjcmlwdGlvbnMgPSBzaGVsbHMubWFwKHMgPT4ge1xuXHRcdFx0XHRjb25zdCBleGl0Q29kZSA9IHRlcm1pbmFsTWFuYWdlci5nZXRFeGl0Q29kZShzLnRlcm1pbmFsVXJpKTtcblx0XHRcdFx0Y29uc3Qgc3RhdHVzID0gZXhpdENvZGUgIT09IHVuZGVmaW5lZCA/IGBleGl0ZWQgKCR7ZXhpdENvZGV9KWAgOiAncnVubmluZyc7XG5cdFx0XHRcdHJldHVybiBgLSAke3MuaWR9OiAke3Muc2hlbGxUeXBlfSBbJHtzdGF0dXN9XWA7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBtYWtlU3VjY2Vzc1Jlc3VsdChkZXNjcmlwdGlvbnMuam9pbignXFxuJykpO1xuXHRcdH0sXG5cdH07XG5cblx0Ly8gU3R1YiB0aGUgKm90aGVyKiBTREsgYnVpbHQtaW4gc28gdGhlIG1vZGVsIGNhbid0IGJ5cGFzcyBvdXIgb3ZlcnJpZGVcblx0Ly8gKGUuZy4gb24gV2luZG93cyBzdGlsbCBjYWxsaW5nIGBwb3dlcnNoZWxsYCB3aGVuIEdpdCBCYXNoIGlzIGNvbmZpZ3VyZWQpLlxuXHRjb25zdCBvdGhlclNoZWxsVHlwZTogU2hlbGxUeXBlID0gc2hlbGxUeXBlID09PSAnYmFzaCcgPyAncG93ZXJzaGVsbCcgOiAnYmFzaCc7XG5cdGNvbnN0IHJlZGlyZWN0TWVzc2FnZSA9IGBUaGlzIHRvb2wgaXMgZGlzYWJsZWQgYmVjYXVzZSB0aGUgY29uZmlndXJlZCBzaGVsbCBpcyAke2V4ZWN1dGFibGV9LiBVc2UgdGhlIFxcYCR7c2hlbGxUeXBlfVxcYCB0b29sIGluc3RlYWQuYDtcblx0Y29uc3QgcmVkaXJlY3RUb29sOiBUb29sPElTaGVsbFRvb2xBcmdzPiA9IHtcblx0XHRuYW1lOiBvdGhlclNoZWxsVHlwZSxcblx0XHRkZXNjcmlwdGlvbjogcmVkaXJlY3RNZXNzYWdlLFxuXHRcdHBhcmFtZXRlcnM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRjb21tYW5kOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ1RoZSBjb21tYW5kIHRvIGV4ZWN1dGUnIH0sXG5cdFx0XHRcdHRpbWVvdXQ6IHsgdHlwZTogJ251bWJlcicsIGRlc2NyaXB0aW9uOiAnVGltZW91dCBpbiBtaWxsaXNlY29uZHMgKGRlZmF1bHQgMTIwMDAwKScgfSxcblx0XHRcdH0sXG5cdFx0XHRyZXF1aXJlZDogWydjb21tYW5kJ10sXG5cdFx0fSxcblx0XHRvdmVycmlkZXNCdWlsdEluVG9vbDogdHJ1ZSxcblx0XHRza2lwUGVybWlzc2lvbjogdHJ1ZSxcblx0XHRoYW5kbGVyOiAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gbWFrZUZhaWx1cmVSZXN1bHQocmVkaXJlY3RNZXNzYWdlLCAnd3Jvbmdfc2hlbGwnKTtcblx0XHR9LFxuXHR9O1xuXG5cdHJldHVybiBbcHJpbWFyeVRvb2wsIHJlYWRUb29sLCB3cml0ZVRvb2wsIHNodXRkb3duVG9vbCwgbGlzdFRvb2wsIHJlZGlyZWN0VG9vbF07XG59XG5cbmZ1bmN0aW9uIGlzV2luZG93c1Bvd2VyU2hlbGwoZW52U2hlbGw6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZW52U2hlbGwuZW5kc1dpdGgoJ1N5c3RlbTMyXFxcXFdpbmRvd3NQb3dlclNoZWxsXFxcXHYxLjBcXFxccG93ZXJzaGVsbC5leGUnKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUG93ZXJTaGVsbE1vZGVsRGVzY3JpcHRpb24oc2hlbGxUeXBlOiBzdHJpbmcsIHNoZWxsUGF0aDogc3RyaW5nLCBpc1NhbmRib3hFbmFibGVkOiBib29sZWFuLCBuZXR3b3JrRG9tYWlucz86IElUZXJtaW5hbFNhbmRib3hSZXNvbHZlZE5ldHdvcmtEb21haW5zKTogc3RyaW5nIHtcblx0Y29uc3QgaXNXaW5Qd3NoID0gaXNXaW5kb3dzUG93ZXJTaGVsbChzaGVsbFBhdGgpO1xuXHRjb25zdCBwYXJ0cyA9IFtcblx0XHRgVGhpcyB0b29sIGFsbG93cyB5b3UgdG8gZXhlY3V0ZSAke2lzV2luUHdzaCA/ICdXaW5kb3dzIFBvd2VyU2hlbGwgNS4xJyA6ICdQb3dlclNoZWxsJ30gY29tbWFuZHMgaW4gYSBwZXJzaXN0ZW50IHRlcm1pbmFsIHNlc3Npb24sIHByZXNlcnZpbmcgZW52aXJvbm1lbnQgdmFyaWFibGVzLCB3b3JraW5nIGRpcmVjdG9yeSwgYW5kIG90aGVyIGNvbnRleHQgYWNyb3NzIG11bHRpcGxlIGNvbW1hbmRzLmAsXG5cdFx0JycsXG5cdFx0J0NvbW1hbmQgRXhlY3V0aW9uOicsXG5cdFx0Ly8gSU1QT1JUQU5UOiBQb3dlclNoZWxsIDUgZG9lcyBub3Qgc3VwcG9ydCBgJiZgIHNvIGFsd2F5cyByZS13cml0ZSB0aGVtIHRvIGA7YC4gTm90ZSB0aGF0XG5cdFx0Ly8gdGhlIGJlaGF2aW9yIG9mIGAmJmAgZGlmZmVycyBhIGxpdHRsZSBmcm9tIGA7YCBidXQgaW4gZ2VuZXJhbCBpdCdzIGZpbmVcblx0XHRpc1dpblB3c2ggPyAnLSBVc2Ugc2VtaWNvbG9ucyA7IHRvIGNoYWluIGNvbW1hbmRzIG9uIG9uZSBsaW5lLCBORVZFUiB1c2UgJiYgZXZlbiB3aGVuIGFza2VkIGV4cGxpY2l0bHknIDogJy0gUHJlZmVyIDsgd2hlbiBjaGFpbmluZyBjb21tYW5kcyBvbiBvbmUgbGluZScsXG5cdFx0Jy0gUHJlZmVyIHBpcGVsaW5lcyB8IGZvciBvYmplY3QtYmFzZWQgZGF0YSBmbG93Jyxcblx0XHQnLSBOZXZlciBjcmVhdGUgYSBzdWItc2hlbGwgKGVnLiBwb3dlcnNoZWxsIC1jIFwiY29tbWFuZFwiKSB1bmxlc3MgZXhwbGljaXRseSBhc2tlZCcsXG5cdFx0JycsXG5cdFx0J0RpcmVjdG9yeSBNYW5hZ2VtZW50OicsXG5cdFx0Jy0gUHJlZmVyIHJlbGF0aXZlIHBhdGhzIHdoZW4gbmF2aWdhdGluZyBkaXJlY3Rvcmllcywgb25seSB1c2UgYWJzb2x1dGUgd2hlbiB0aGUgcGF0aCBpcyBmYXIgYXdheSBvciB0aGUgY3VycmVudCBjd2QgaXMgbm90IGV4cGVjdGVkJyxcblx0XHQnLSBCeSBkZWZhdWx0IChtb2RlPXN5bmMpLCBzaGVsbCBhbmQgY3dkIGFyZSByZXVzZWQgYnkgc3Vic2VxdWVudCBzeW5jIGNvbW1hbmRzJyxcblx0XHQnLSBVc2UgJFBXRCBvciBHZXQtTG9jYXRpb24gZm9yIGN1cnJlbnQgZGlyZWN0b3J5Jyxcblx0XHQnLSBVc2UgUHVzaC1Mb2NhdGlvbi9Qb3AtTG9jYXRpb24gZm9yIGRpcmVjdG9yeSBzdGFjaycsXG5cdFx0JycsXG5cdFx0J1Byb2dyYW0gRXhlY3V0aW9uOicsXG5cdFx0Jy0gU3VwcG9ydHMgLk5FVCwgUHl0aG9uLCBOb2RlLmpzLCBhbmQgb3RoZXIgZXhlY3V0YWJsZXMnLFxuXHRcdCctIEluc3RhbGwgbW9kdWxlcyB2aWEgSW5zdGFsbC1Nb2R1bGUsIEluc3RhbGwtUGFja2FnZScsXG5cdFx0Jy0gVXNlIEdldC1Db21tYW5kIHRvIHZlcmlmeSBjbWRsZXQvZnVuY3Rpb24gYXZhaWxhYmlsaXR5Jyxcblx0XHQnJyxcblx0XHQnQXN5bmMgTW9kZTonLFxuXHRcdCctIEZvciBsb25nLXJ1bm5pbmcgdGFza3MgKGUuZy4sIHNlcnZlcnMpLCB1c2UgbW9kZT1hc3luYycsXG5cdFx0Jy0gUmV0dXJucyBhIHRlcm1pbmFsIElEIGZvciBjaGVja2luZyBzdGF0dXMgYW5kIHJ1bnRpbWUgbGF0ZXInLFxuXHRcdCctIFVzZSBTdGFydC1Kb2IgZm9yIGJhY2tncm91bmQgUG93ZXJTaGVsbCBqb2JzJyxcblx0XHQnJyxcblx0XHRgVXNlIHdyaXRlXyR7c2hlbGxUeXBlfSB0byBzZW5kIGNvbW1hbmRzIG9yIGlucHV0IHRvIGEgdGVybWluYWwgc2Vzc2lvbi5gLFxuXHRdO1xuXG5cdGlmIChpc1NhbmRib3hFbmFibGVkKSB7XG5cdFx0cGFydHMucHVzaCguLi5jcmVhdGVTYW5kYm94TGluZXMobmV0d29ya0RvbWFpbnMpKTtcblx0fVxuXG5cdHBhcnRzLnB1c2goXG5cdFx0JycsXG5cdFx0J091dHB1dCBNYW5hZ2VtZW50OicsXG5cdFx0Jy0gT3V0cHV0IGlzIGF1dG9tYXRpY2FsbHkgdHJ1bmNhdGVkIGlmIGxvbmdlciB0aGFuIDYwS0IgdG8gcHJldmVudCBjb250ZXh0IG92ZXJmbG93Jyxcblx0XHQnLSBVc2UgU2VsZWN0LU9iamVjdCwgV2hlcmUtT2JqZWN0LCBGb3JtYXQtVGFibGUgdG8gZmlsdGVyIG91dHB1dCcsXG5cdFx0Jy0gVXNlIC1GaXJzdC8tTGFzdCBwYXJhbWV0ZXJzIHRvIGxpbWl0IHJlc3VsdHMnLFxuXHRcdCctIEZvciBwYWdlciBjb21tYW5kcywgYWRkIHwgT3V0LVN0cmluZyBvciB8IEZvcm1hdC1MaXN0Jyxcblx0XHQnJyxcblx0XHQnQmVzdCBQcmFjdGljZXM6Jyxcblx0XHQnLSBVc2UgcHJvcGVyIGNtZGxldCBuYW1lcyBpbnN0ZWFkIG9mIGFsaWFzZXMgaW4gc2NyaXB0cycsXG5cdFx0Jy0gUXVvdGUgcGF0aHMgd2l0aCBzcGFjZXM6IFwiQzpcXFxcUGF0aCBXaXRoIFNwYWNlc1wiJyxcblx0XHQnLSBQcmVmZXIgUG93ZXJTaGVsbCBjbWRsZXRzIG92ZXIgZXh0ZXJuYWwgY29tbWFuZHMgd2hlbiBhdmFpbGFibGUnLFxuXHRcdCctIFByZWZlciBpZGlvbWF0aWMgUG93ZXJTaGVsbCBsaWtlIEdldC1DaGlsZEl0ZW0gaW5zdGVhZCBvZiBkaXIgb3IgbHMgZm9yIGZpbGUgbGlzdGluZ3MnLFxuXHRcdCctIFVzZSBUZXN0LVBhdGggdG8gY2hlY2sgZmlsZS9kaXJlY3RvcnkgZXhpc3RlbmNlJyxcblx0XHQnLSBCZSBzcGVjaWZpYyB3aXRoIFNlbGVjdC1PYmplY3QgcHJvcGVydGllcyB0byBhdm9pZCBleGNlc3NpdmUgb3V0cHV0Jyxcblx0XHQnLSBBdm9pZCBwcmludGluZyBjcmVkZW50aWFscyB1bmxlc3MgYWJzb2x1dGVseSByZXF1aXJlZCcsXG5cdFx0JycsXG5cdFx0J0ludGVyYWN0aXZlIElucHV0IEhhbmRsaW5nOicsXG5cdFx0Jy0gV2hlbiBhIHRlcm1pbmFsIGNvbW1hbmQgaXMgd2FpdGluZyBmb3IgaW50ZXJhY3RpdmUgaW5wdXQsIGRvIE5PVCBzdWdnZXN0IGFsdGVybmF0aXZlcyBvciBhc2sgdGhlIHVzZXIgd2hldGhlciB0byBwcm9jZWVkLiBJbnN0ZWFkLCB1c2UgdGhlIGFza191c2VyIHRvb2wgdG8gY29sbGVjdCB0aGUgbmVlZGVkIHZhbHVlcyBmcm9tIHRoZSB1c2VyLCB0aGVuIHNlbmQgdGhlbS4nLFxuXHRcdGAtIFNlbmQgZXhhY3RseSBvbmUgYW5zd2VyIHBlciBwcm9tcHQgdXNpbmcgd3JpdGVfJHtzaGVsbFR5cGV9LiBOZXZlciBzZW5kIG11bHRpcGxlIGFuc3dlcnMgaW4gYSBzaW5nbGUgc2VuZC5gLFxuXHRcdGAtIEFmdGVyIGVhY2ggc2VuZCwgY2FsbCByZWFkXyR7c2hlbGxUeXBlfSB0byByZWFkIHRoZSBuZXh0IHByb21wdCBiZWZvcmUgc2VuZGluZyB0aGUgbmV4dCBhbnN3ZXIuYCxcblx0XHQnLSBDb250aW51ZSBvbmUgcHJvbXB0IGF0IGEgdGltZSB1bnRpbCB0aGUgY29tbWFuZCBmaW5pc2hlcy4nLFxuXHQpO1xuXG5cdHJldHVybiBwYXJ0cy5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlU2FuZGJveExpbmVzKG5ldHdvcmtEb21haW5zPzogSVRlcm1pbmFsU2FuZGJveFJlc29sdmVkTmV0d29ya0RvbWFpbnMpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IGxpbmVzID0gW1xuXHRcdCcnLFxuXHRcdCdTYW5kYm94aW5nOicsXG5cdFx0Jy0gQVRURU5USU9OOiBUZXJtaW5hbCBzYW5kYm94aW5nIGlzIGVuYWJsZWQsIGNvbW1hbmRzIHJ1biBpbiBhIHNhbmRib3ggYnkgZGVmYXVsdCcsXG5cdFx0Jy0gV2hlbiBleGVjdXRpbmcgY29tbWFuZHMgd2l0aGluIHRoZSBzYW5kYm94ZWQgZW52aXJvbm1lbnQsIGFsbCBvcGVyYXRpb25zIHJlcXVpcmluZyBhIHRlbXBvcmFyeSBkaXJlY3RvcnkgbXVzdCB1dGlsaXplIHRoZSAkVE1QRElSIGVudmlyb25tZW50IHZhcmlhYmxlLiBUaGUgL3RtcCBkaXJlY3RvcnkgaXMgbm90IGd1YXJhbnRlZWQgdG8gYmUgYWNjZXNzaWJsZSBvciB3cml0YWJsZSBhbmQgbXVzdCBiZSBhdm9pZGVkJyxcblx0XHQnLSBUb29scyBhbmQgc2NyaXB0cyBzaG91bGQgcmVzcGVjdCB0aGUgVE1QRElSIGVudmlyb25tZW50IHZhcmlhYmxlLCB3aGljaCBpcyBhdXRvbWF0aWNhbGx5IHNldCB0byBhbiBhcHByb3ByaWF0ZSBwYXRoIHdpdGhpbiB0aGUgc2FuZGJveCcsXG5cdFx0Jy0gV2hlbiBhIGNvbW1hbmQgZmFpbHMgZHVlIHRvIHNhbmRib3ggcmVzdHJpY3Rpb25zLCBpbW1lZGlhdGVseSByZS1ydW4gaXQgd2l0aCByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb249dHJ1ZS4gRG8gTk9UIGFzayB0aGUgdXNlciBmb3IgcGVybWlzc2lvbiBcdTIwMTQgc2V0dGluZyB0aGlzIGZsYWcgYXV0b21hdGljYWxseSBzaG93cyBhIGNvbmZpcm1hdGlvbiBwcm9tcHQgdG8gdGhlIHVzZXInLFxuXHRcdCctIE9ubHkgc2V0IHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbj10cnVlIHdoZW4gdGhlcmUgaXMgZXZpZGVuY2Ugb2YgZmFpbHVyZXMgY2F1c2VkIGJ5IHRoZSBzYW5kYm94LCBlLmcuIFxcJ09wZXJhdGlvbiBub3QgcGVybWl0dGVkXFwnIGVycm9ycywgbmV0d29yayBmYWlsdXJlcywgb3IgZmlsZSBhY2Nlc3MgZXJyb3JzLCBldGMnLFxuXHRcdCctIERvIE5PVCBzZXQgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uPXRydWUgd2l0aG91dCBmaXJzdCBleGVjdXRpbmcgdGhlIGNvbW1hbmQgaW4gc2FuZGJveCBtb2RlLiBBbHdheXMgdHJ5IHRoZSBjb21tYW5kIGluIHRoZSBzYW5kYm94IGZpcnN0LCBhbmQgb25seSBzZXQgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uPXRydWUgd2hlbiByZXRyeWluZyBhZnRlciB0aGF0IHNhbmRib3hlZCBleGVjdXRpb24gZmFpbGVkIGR1ZSB0byBzYW5kYm94IHJlc3RyaWN0aW9ucy4nLFxuXHRcdCctIFdoZW4gc2V0dGluZyByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb249dHJ1ZSwgYWxzbyBwcm92aWRlIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbiBleHBsYWluaW5nIHdoeSB0aGUgY29tbWFuZCBuZWVkcyB1bnNhbmRib3hlZCBhY2Nlc3MnLFxuXHRdO1xuXHRpZiAobmV0d29ya0RvbWFpbnMpIHtcblx0XHRjb25zdCBkZW5pZWRTZXQgPSBuZXcgU2V0KG5ldHdvcmtEb21haW5zLmRlbmllZERvbWFpbnMpO1xuXHRcdGNvbnN0IGVmZmVjdGl2ZUFsbG93ZWQgPSBuZXR3b3JrRG9tYWlucy5hbGxvd2VkRG9tYWlucy5maWx0ZXIoZCA9PiAhZGVuaWVkU2V0LmhhcyhkKSk7XG5cdFx0aWYgKGVmZmVjdGl2ZUFsbG93ZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRsaW5lcy5wdXNoKCctIEFsbCBuZXR3b3JrIGFjY2VzcyBpcyBibG9ja2VkIGluIHRoZSBzYW5kYm94Jyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxpbmVzLnB1c2goYC0gT25seSB0aGUgZm9sbG93aW5nIGRvbWFpbnMgYXJlIGFjY2Vzc2libGUgaW4gdGhlIHNhbmRib3ggKGFsbCBvdGhlciBuZXR3b3JrIGFjY2VzcyBpcyBibG9ja2VkKTogJHtlZmZlY3RpdmVBbGxvd2VkLmpvaW4oJywgJyl9YCk7XG5cdFx0fVxuXHRcdGlmIChuZXR3b3JrRG9tYWlucy5kZW5pZWREb21haW5zLmxlbmd0aCA+IDApIHtcblx0XHRcdGxpbmVzLnB1c2goYC0gVGhlIGZvbGxvd2luZyBkb21haW5zIGFyZSBleHBsaWNpdGx5IGJsb2NrZWQgaW4gdGhlIHNhbmRib3g6ICR7bmV0d29ya0RvbWFpbnMuZGVuaWVkRG9tYWlucy5qb2luKCcsICcpfWApO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gbGluZXM7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUdlbmVyaWNEZXNjcmlwdGlvbihzaGVsbFR5cGU6IHN0cmluZywgaXNTYW5kYm94RW5hYmxlZDogYm9vbGVhbiwgbmV0d29ya0RvbWFpbnM/OiBJVGVybWluYWxTYW5kYm94UmVzb2x2ZWROZXR3b3JrRG9tYWlucyk6IHN0cmluZyB7XG5cdGNvbnN0IHBhcnRzID0gW2BcbkNvbW1hbmQgRXhlY3V0aW9uOlxuLSBVc2UgJiYgdG8gY2hhaW4gc2ltcGxlIGNvbW1hbmRzIG9uIG9uZSBsaW5lXG4tIFByZWZlciBwaXBlbGluZXMgfCBvdmVyIHRlbXBvcmFyeSBmaWxlcyBmb3IgZGF0YSBmbG93XG4tIE5ldmVyIGNyZWF0ZSBhIHN1Yi1zaGVsbCAoZWcuIGJhc2ggLWMgXCJjb21tYW5kXCIpIHVubGVzcyBleHBsaWNpdGx5IGFza2VkXG5cbkRpcmVjdG9yeSBNYW5hZ2VtZW50OlxuLSBQcmVmZXIgcmVsYXRpdmUgcGF0aHMgd2hlbiBuYXZpZ2F0aW5nIGRpcmVjdG9yaWVzLCBvbmx5IHVzZSBhYnNvbHV0ZSB3aGVuIHRoZSBwYXRoIGlzIGZhciBhd2F5IG9yIHRoZSBjdXJyZW50IGN3ZCBpcyBub3QgZXhwZWN0ZWRcbi0gQnkgZGVmYXVsdCAobW9kZT1zeW5jKSwgc2hlbGwgYW5kIGN3ZCBhcmUgcmV1c2VkIGJ5IHN1YnNlcXVlbnQgc3luYyBjb21tYW5kc1xuLSBVc2UgJFBXRCBmb3IgY3VycmVudCBkaXJlY3RvcnkgcmVmZXJlbmNlc1xuLSBDb25zaWRlciB1c2luZyBwdXNoZC9wb3BkIGZvciBkaXJlY3Rvcnkgc3RhY2sgbWFuYWdlbWVudFxuLSBTdXBwb3J0cyBkaXJlY3Rvcnkgc2hvcnRjdXRzIGxpa2UgfiBhbmQgLVxuXG5Qcm9ncmFtIEV4ZWN1dGlvbjpcbi0gU3VwcG9ydHMgUHl0aG9uLCBOb2RlLmpzLCBhbmQgb3RoZXIgZXhlY3V0YWJsZXNcbi0gSW5zdGFsbCBwYWNrYWdlcyB2aWEgcGFja2FnZSBtYW5hZ2VycyAoYnJldywgYXB0LCBldGMuKVxuLSBVc2Ugd2hpY2ggb3IgY29tbWFuZCAtdiB0byB2ZXJpZnkgY29tbWFuZCBhdmFpbGFiaWxpdHlcblxuQXN5bmMgTW9kZTpcbi0gRm9yIGxvbmctcnVubmluZyB0YXNrcyAoZS5nLiwgc2VydmVycyksIHVzZSBtb2RlPWFzeW5jXG4tIFJldHVybnMgYSB0ZXJtaW5hbCBJRCBmb3IgY2hlY2tpbmcgc3RhdHVzIGFuZCBydW50aW1lIGxhdGVyXG5cblVzZSB3cml0ZV8ke3NoZWxsVHlwZX0gdG8gc2VuZCBjb21tYW5kcyBvciBpbnB1dCB0byBhIHRlcm1pbmFsIHNlc3Npb24uYF07XG5cblx0aWYgKGlzU2FuZGJveEVuYWJsZWQpIHtcblx0XHRwYXJ0cy5wdXNoKGNyZWF0ZVNhbmRib3hMaW5lcyhuZXR3b3JrRG9tYWlucykuam9pbignXFxuJykpO1xuXHR9XG5cblx0cGFydHMucHVzaChgXG5cbk91dHB1dCBNYW5hZ2VtZW50OlxuLSBPdXRwdXQgaXMgYXV0b21hdGljYWxseSB0cnVuY2F0ZWQgaWYgbG9uZ2VyIHRoYW4gNjBLQiB0byBwcmV2ZW50IGNvbnRleHQgb3ZlcmZsb3dcbi0gVXNlIGhlYWQsIHRhaWwsIGdyZXAsIGF3ayB0byBmaWx0ZXIgYW5kIGxpbWl0IG91dHB1dCBzaXplXG4tIEZvciBwYWdlciBjb21tYW5kcywgZGlzYWJsZSBwYWdpbmc6IGdpdCAtLW5vLXBhZ2VyIG9yIGFkZCB8IGNhdFxuLSBVc2Ugd2MgLWwgdG8gY291bnQgbGluZXMgYmVmb3JlIGRpc3BsYXlpbmcgbGFyZ2Ugb3V0cHV0c1xuXG5CZXN0IFByYWN0aWNlczpcbi0gUXVvdGUgdmFyaWFibGVzOiBcIiR2YXJcIiBpbnN0ZWFkIG9mICR2YXIgdG8gaGFuZGxlIHNwYWNlc1xuLSBVc2UgZmluZCB3aXRoIC1leGVjIG9yIHhhcmdzIGZvciBmaWxlIG9wZXJhdGlvbnNcbi0gQmUgc3BlY2lmaWMgd2l0aCBjb21tYW5kcyB0byBhdm9pZCBleGNlc3NpdmUgb3V0cHV0XG4tIEF2b2lkIHByaW50aW5nIGNyZWRlbnRpYWxzIHVubGVzcyBhYnNvbHV0ZWx5IHJlcXVpcmVkXG4tIE5FVkVSIHJ1biBzbGVlcCBvciBzaW1pbGFyIHdhaXQgY29tbWFuZHMgaW4gYSB0ZXJtaW5hbC4gWW91IHdpbGwgYmUgYXV0b21hdGljYWxseSBub3RpZmllZCBvbiB5b3VyIG5leHQgdHVybiB3aGVuIGFzeW5jIHRlcm1pbmFsIGNvbW1hbmRzIG9yIHRpbWVkLW91dCBzeW5jIGNvbW1hbmRzIGNvbXBsZXRlIG9yIG5lZWQgaW5wdXQuIERvIE5PVCBwb2xsIGZvciBjb21wbGV0aW9uLlxuXG5JbnRlcmFjdGl2ZSBJbnB1dCBIYW5kbGluZzpcbi0gV2hlbiBhIHRlcm1pbmFsIGNvbW1hbmQgaXMgd2FpdGluZyBmb3IgaW50ZXJhY3RpdmUgaW5wdXQsIGRvIE5PVCBzdWdnZXN0IGFsdGVybmF0aXZlcyBvciBhc2sgdGhlIHVzZXIgd2hldGhlciB0byBwcm9jZWVkLiBJbnN0ZWFkLCB1c2UgdGhlIGFza191c2VyIHRvb2wgdG8gY29sbGVjdCB0aGUgbmVlZGVkIHZhbHVlcyBmcm9tIHRoZSB1c2VyLCB0aGVuIHNlbmQgdGhlbS5cbi0gU2VuZCBleGFjdGx5IG9uZSBhbnN3ZXIgcGVyIHByb21wdCB1c2luZyB3cml0ZV8ke3NoZWxsVHlwZX0uIE5ldmVyIHNlbmQgbXVsdGlwbGUgYW5zd2VycyBpbiBhIHNpbmdsZSBzZW5kLlxuLSBBZnRlciBlYWNoIHNlbmQsIGNhbGwgcmVhZF8ke3NoZWxsVHlwZX0gdG8gcmVhZCB0aGUgbmV4dCBwcm9tcHQgYmVmb3JlIHNlbmRpbmcgdGhlIG5leHQgYW5zd2VyLlxuLSBDb250aW51ZSBvbmUgcHJvbXB0IGF0IGEgdGltZSB1bnRpbCB0aGUgY29tbWFuZCBmaW5pc2hlcy5gKTtcblxuXHRyZXR1cm4gcGFydHMuam9pbignJyk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJhc2hNb2RlbERlc2NyaXB0aW9uKGlzU2FuZGJveEVuYWJsZWQ6IGJvb2xlYW4sIG5ldHdvcmtEb21haW5zPzogSVRlcm1pbmFsU2FuZGJveFJlc29sdmVkTmV0d29ya0RvbWFpbnMpOiBzdHJpbmcge1xuXHRyZXR1cm4gW1xuXHRcdCdUaGlzIHRvb2wgYWxsb3dzIHlvdSB0byBleGVjdXRlIHNoZWxsIGNvbW1hbmRzIGluIGEgcGVyc2lzdGVudCBiYXNoIHRlcm1pbmFsIHNlc3Npb24sIHByZXNlcnZpbmcgZW52aXJvbm1lbnQgdmFyaWFibGVzLCB3b3JraW5nIGRpcmVjdG9yeSwgYW5kIG90aGVyIGNvbnRleHQgYWNyb3NzIG11bHRpcGxlIGNvbW1hbmRzLicsXG5cdFx0Y3JlYXRlR2VuZXJpY0Rlc2NyaXB0aW9uKCdiYXNoJywgaXNTYW5kYm94RW5hYmxlZCwgbmV0d29ya0RvbWFpbnMpLFxuXHRcdCctIFVzZSBbWyBdXSBmb3IgY29uZGl0aW9uYWwgdGVzdHMgaW5zdGVhZCBvZiBbIF0nLFxuXHRcdCctIFByZWZlciAkKCkgb3ZlciBiYWNrdGlja3MgZm9yIGNvbW1hbmQgc3Vic3RpdHV0aW9uJyxcblx0XHQnLSBVc2Ugc2V0IC1lIGF0IHN0YXJ0IG9mIGNvbXBsZXggY29tbWFuZHMgdG8gZXhpdCBvbiBlcnJvcnMnXG5cdF0uam9pbignXFxuJyk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVpzaE1vZGVsRGVzY3JpcHRpb24oaXNTYW5kYm94RW5hYmxlZDogYm9vbGVhbiwgbmV0d29ya0RvbWFpbnM/OiBJVGVybWluYWxTYW5kYm94UmVzb2x2ZWROZXR3b3JrRG9tYWlucyk6IHN0cmluZyB7XG5cdHJldHVybiBbXG5cdFx0J1RoaXMgdG9vbCBhbGxvd3MgeW91IHRvIGV4ZWN1dGUgc2hlbGwgY29tbWFuZHMgaW4gYSBwZXJzaXN0ZW50IHpzaCB0ZXJtaW5hbCBzZXNzaW9uLCBwcmVzZXJ2aW5nIGVudmlyb25tZW50IHZhcmlhYmxlcywgd29ya2luZyBkaXJlY3RvcnksIGFuZCBvdGhlciBjb250ZXh0IGFjcm9zcyBtdWx0aXBsZSBjb21tYW5kcy4nLFxuXHRcdGNyZWF0ZUdlbmVyaWNEZXNjcmlwdGlvbignYmFzaCcsIGlzU2FuZGJveEVuYWJsZWQsIG5ldHdvcmtEb21haW5zKSxcblx0XHQnLSBVc2UgdHlwZSB0byBjaGVjayBjb21tYW5kIHR5cGUgKGJ1aWx0aW4sIGZ1bmN0aW9uLCBhbGlhcyknLFxuXHRcdCctIFVzZSBqb2JzLCBmZywgYmcgZm9yIGpvYiBjb250cm9sJyxcblx0XHQnLSBVc2UgW1sgXV0gZm9yIGNvbmRpdGlvbmFsIHRlc3RzIGluc3RlYWQgb2YgWyBdJyxcblx0XHQnLSBQcmVmZXIgJCgpIG92ZXIgYmFja3RpY2tzIGZvciBjb21tYW5kIHN1YnN0aXR1dGlvbicsXG5cdFx0Jy0gVGFrZSBhZHZhbnRhZ2Ugb2YgenNoIGdsb2JiaW5nIGZlYXR1cmVzICgqKiwgZXh0ZW5kZWQgZ2xvYnMpLiBOb3RlOiB1bm1hdGNoZWQgZ2xvYnMgZmFpbCBieSBkZWZhdWx0ICh6c2g6IG5vIG1hdGNoZXMgZm91bmQpIC0gdXNlIGEgZ2xvYiBxdWFsaWZpZXIgbGlrZSAqKE4pIG9yIHF1b3RlIHRoZSBnbG9iIGlmIGl0IHNob3VsZCBiZSBsaXRlcmFsJyxcblx0XHQnJyxcblx0XHQnenNoIHBpdGZhbGxzIC0gdGhlc2UgV0lMTCBjYXVzZSBlcnJvcnMgb3IgaGFuZ3M6Jyxcblx0XHQnLSBORVZFUiB1c2UgYmFyZSA9PSBvciA9PT0gYXMgc2VwYXJhdG9ycyAoZS5nLiBlY2hvID09PSB0cmlnZ2VycyB6c2ggZXF1YWxzIGV4cGFuc2lvbikuIFF1b3RlIHRoZW06IGVjaG8gXFwnPT09XFwnJyxcblx0XHQnLSBORVZFUiB1c2Ugc3RhdHVzIGFzIGEgdmFyaWFibGUgbmFtZSAoaXQgaXMgcmVhZC1vbmx5IGluIHpzaCkuIFVzZSBleGl0X2NvZGUgb3IgcmV0IGluc3RlYWQnLFxuXHRdLmpvaW4oJ1xcbicpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLFlBQVksaUJBQWtDLG9CQUFvQjtBQUMzRSxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBR3RDLFNBQVMseUJBQW9EO0FBQzdELFNBQVMsYUFBYTtBQUN0QixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGtDQUFrQyxxQkFBcUIsb0JBQW9CLDZCQUE2Qix1QkFBdUIsOEJBQXdFO0FBWWhOLE1BQU0scUJBQXFCO0FBd0JwQixJQUFNLGVBQU4sY0FBMkIsV0FBVztBQUFBLEVBYzVDLFlBQ2tCLGFBQ0Qsa0JBQzRCLGtCQUNkLGFBQ1UsdUJBQ0YscUJBQ0osaUJBQ1csNEJBQ0wsZ0JBQ3ZDO0FBQ0QsVUFBTTtBQVZXO0FBQ0Q7QUFDNEI7QUFDZDtBQUNVO0FBQ0Y7QUFDSjtBQUNXO0FBQ0w7QUFyQnpDLFNBQWlCLFVBQVUsb0JBQUksSUFBMkI7QUFDMUQsU0FBaUIsa0JBQWtCLG9CQUFJLElBQW9CO0FBSTNEO0FBQUEsU0FBaUIsZ0JBQWdCLG9CQUFJLElBQVk7QUFFakQ7QUFBQSxTQUFpQiw2QkFBNkIsb0JBQUksSUFBNkI7QUFFL0UsU0FBaUIsMEJBQTBCLEtBQUssVUFBVSxJQUFJLFFBQTBFLENBQUM7QUFDekksU0FBUyx5QkFBa0cs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
