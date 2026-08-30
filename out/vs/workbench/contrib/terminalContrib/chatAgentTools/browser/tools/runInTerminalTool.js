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
import { DeferredPromise, RunOnceScheduler, timeout } from "../../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { CancellationError } from "../../../../../../base/common/errors.js";
import { Event } from "../../../../../../base/common/event.js";
import { appendEscapedMarkdownInlineCode, escapeMarkdownSyntaxTokens, MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { getMediaMime } from "../../../../../../base/common/mime.js";
import { basename, posix, win32 } from "../../../../../../base/common/path.js";
import { OperatingSystem, OS } from "../../../../../../base/common/platform.js";
import { count } from "../../../../../../base/common/strings.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { localize } from "../../../../../../nls.js";
import { ConfirmationOptionKind } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { AgentSandboxSettingId } from "../../../../../../platform/sandbox/common/settings.js";
import { TerminalCapability } from "../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { ITerminalLogService, TerminalExitReason } from "../../../../../../platform/terminal/common/terminal.js";
import { IRemoteAgentService } from "../../../../../services/remote/common/remoteAgentService.js";
import { TerminalToolConfirmationStorageKeys } from "../../../../chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js";
import { IChatService, ChatRequestQueueKind, ElicitationState } from "../../../../chat/common/chatService/chatService.js";
import { autorun, constObservable } from "../../../../../../base/common/observable.js";
import { ChatModel } from "../../../../chat/common/model/chatModel.js";
import { ChatConfiguration, ChatModeKind, isAutoApproveLevel } from "../../../../chat/common/constants.js";
import { ILanguageModelToolsService, ToolDataSource, ToolInvocationPresentation } from "../../../../chat/common/tools/languageModelToolsService.js";
import { ITerminalChatService, ITerminalService } from "../../../../terminal/browser/terminal.js";
import { ITerminalProfileResolverService } from "../../../../terminal/common/terminal.js";
import { DEFAULT_IDLE_SILENCE_TIMEOUT_MS, TerminalChatAgentToolsSettingId } from "../../common/terminalChatAgentToolsConfiguration.js";
import { getRecommendedToolsOverRunInTerminal } from "../alternativeRecommendation.js";
import { BasicExecuteStrategy } from "../executeStrategy/basicExecuteStrategy.js";
import { NoneExecuteStrategy } from "../executeStrategy/noneExecuteStrategy.js";
import { RichExecuteStrategy } from "../executeStrategy/richExecuteStrategy.js";
import { getOutput } from "../outputHelpers.js";
import { LargeOutputFileWriter } from "../largeOutputFileWriter.js";
import { buildCommandDisplayText, extractCdPrefix, isFish, isPowerShell, isWindowsPowerShell, isZsh, normalizeTerminalCommandForDisplay } from "../runInTerminalHelpers.js";
import { NodeCommandLinePresenter } from "./commandLinePresenter/nodeCommandLinePresenter.js";
import { PythonCommandLinePresenter } from "./commandLinePresenter/pythonCommandLinePresenter.js";
import { RubyCommandLinePresenter } from "./commandLinePresenter/rubyCommandLinePresenter.js";
import { SandboxedCommandLinePresenter } from "./commandLinePresenter/sandboxedCommandLinePresenter.js";
import { RunInTerminalToolTelemetry } from "../runInTerminalToolTelemetry.js";
import { ShellIntegrationQuality, ToolTerminalCreator } from "../toolTerminalCreator.js";
import { TreeSitterCommandParser, TreeSitterCommandParserLanguage } from "../treeSitterCommandParser.js";
import { CommandLineAutoApproveAnalyzer } from "./commandLineAnalyzer/commandLineAutoApproveAnalyzer.js";
import { CommandLineFileWriteAnalyzer } from "./commandLineAnalyzer/commandLineFileWriteAnalyzer.js";
import { CommandLineSandboxAnalyzer } from "./commandLineAnalyzer/commandLineSandboxAnalyzer.js";
import { OutputMonitor } from "./monitoring/outputMonitor.js";
import { OutputMonitorState } from "./monitoring/types.js";
import { ChatQuestionCarouselData } from "../../../../chat/common/model/chatProgressTypes/chatQuestionCarouselData.js";
import { chatSessionResourceToId, LocalChatSessionUri } from "../../../../chat/common/model/chatUri.js";
import { TerminalToolId } from "./toolIds.js";
import { URI } from "../../../../../../base/common/uri.js";
import { CommandLineCdPrefixRewriter } from "./commandLineRewriter/commandLineCdPrefixRewriter.js";
import { CommandLinePreventHistoryRewriter } from "./commandLineRewriter/commandLinePreventHistoryRewriter.js";
import { CommandLinePwshChainOperatorRewriter } from "./commandLineRewriter/commandLinePwshChainOperatorRewriter.js";
import { CommandLineBackgroundDetachRewriter } from "./commandLineRewriter/commandLineBackgroundDetachRewriter.js";
import { CommandLineSandboxRewriter } from "./commandLineRewriter/commandLineSandboxRewriter.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IHistoryService } from "../../../../../services/history/common/history.js";
import { ILifecycleService } from "../../../../../services/lifecycle/common/lifecycle.js";
import { TerminalCommandArtifactCollector } from "./terminalCommandArtifactCollector.js";
import { isNumber, isString } from "../../../../../../base/common/types.js";
import { IChatWidgetService } from "../../../../chat/browser/chat.js";
import { TerminalChatCommandId } from "../../../chat/browser/terminalChat.js";
import { clamp } from "../../../../../../base/common/numbers.js";
import { SandboxOutputAnalyzer, outputLooksSandboxBlocked, outputLooksSandboxNetworkBlocked } from "./sandboxOutputAnalyzer.js";
import { IAgentSessionsService } from "../../../../chat/browser/agentSessions/agentSessionsService.js";
import { ITerminalSandboxService, TerminalSandboxPrerequisiteCheck } from "../../common/terminalSandboxService.js";
import { LanguageModelPartAudience } from "../../../../chat/common/languageModels.js";
import { isSessionAutoApproveLevel, isTerminalAutoApproveAllowed, isToolEligibleForTerminalAutoApproval } from "./terminalToolAutoApprove.js";
import { ChatElicitationRequestPart } from "../../../../chat/common/model/chatProgressTypes/chatElicitationRequestPart.js";
import { getSandboxPrecheckInputsForToolInvocation } from "../../../../chat/browser/tools/toolHelpers.js";
import { compact } from "./consoleCompactor/consoleCompactor.js";
import { IChatSessionsService } from "../../../../chat/common/chatSessionsService.js";
const TERMINAL_SANDBOX_DOCUMENTATION_URL = "https://aka.ms/vscode-sandboxing";
const TOOL_REFERENCE_NAME = "runInTerminal";
const LEGACY_TOOL_REFERENCE_FULL_NAMES = ["runCommands/runInTerminal"];
const INPUT_NEEDED_NOTIFICATION_THROTTLE_MS = 5e3;
function createPowerShellModelDescription(shell, sandboxingOptions, includeElevationGuidance) {
  const isWinPwsh = isWindowsPowerShell(shell);
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
    "Execution Mode:",
    "- For ALL one-shot commands (builds, tests, installs, compilation, linting, downloads, scripts), use mode=sync and omit timeout. The tool waits for the command to complete and returns full output inline. This is the default and strongly preferred mode.",
    `- Use mode=async ONLY for processes that must keep running indefinitely while you do other work (servers, watchers, dev daemons). Async waits for an initial idle/output signal, then returns a terminal ID and output snapshot while the process continues running.`,
    `- In sync mode, the full output is returned when the command completes \u2014 you do NOT need to call ${TerminalToolId.GetTerminalOutput} afterward. Only use ${TerminalToolId.GetTerminalOutput} if the tool result explicitly says the command was moved to background, timed out, or needs input.`,
    "- Returns a terminal ID for checking status and runtime later",
    "- Use Start-Job for background PowerShell jobs",
    "",
    `Use ${TerminalToolId.SendToTerminal} to send commands or input to a terminal session.`
  ];
  if (sandboxingOptions.sandboxMode !== "off") {
    parts.push(...createSandboxLines(sandboxingOptions));
  }
  parts.push(
    "",
    "Output Management:",
    "- Output exceeding 20KB is saved to a temp file; the result includes the file path so you can read the full output with readFile or search it with grep",
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
    ...includeElevationGuidance ? [
      "- Avoid commands that trigger an interactive elevation prompt, such as Start-Process -Verb RunAs or runas.exe. They block on a UAC/password prompt that cannot be answered in this mode, and secrets must never be routed through the model. If elevated privileges are required, tell the user to run the command themselves and stop \u2014 do NOT retry the command with variations."
    ] : [],
    `- NEVER run Start-Sleep or similar wait commands. You will be automatically notified on your next turn when async terminal commands or timed-out sync commands complete or need input. Do NOT poll for completion.`,
    "- NEVER pipe interactive commands through Select-Object, Where-Object, or other filters \u2014 this hides prompts and prevents the terminal from detecting when input is needed. Run interactive commands without pipes.",
    "",
    "Interactive Input Handling:",
    "- When a terminal command is waiting for interactive input, do NOT suggest alternatives or ask the user whether to proceed. Instead, use the vscode_askQuestions tool to collect the needed values from the user, then send them.",
    `- NEVER use vscode_askQuestions to request sensitive input such as passwords, passphrases, API keys, tokens, or other secrets \u2014 answers to that tool are sent through the model. If the prompt requires a secret, tell the user to type it directly into the terminal and stop; do not call vscode_askQuestions or ${TerminalToolId.SendToTerminal} for that prompt.`,
    `- Send exactly one answer per prompt using ${TerminalToolId.SendToTerminal}. Never send multiple answers in a single send.`,
    `- After each send, call ${TerminalToolId.GetTerminalOutput} to read the next prompt before sending the next answer.`,
    "- Continue one prompt at a time until the command finishes."
  );
  return parts.join("\n");
}
function createSandboxLines(sandboxingOptions) {
  const isNetworkAvailable = sandboxingOptions.sandboxMode === "on-network-available";
  const lines = [
    "",
    "Sandboxing:",
    isNetworkAvailable ? "- Commands run inside a sandbox by default. The sandbox keeps the filesystem mostly read-only." : "- Commands run inside a sandbox by default. The sandbox restricts two things independently: the filesystem and the network.",
    "- Filesystem: read-only outside the workspace and $TMPDIR, which stay read-write. Parts of $HOME are hidden for privacy, but common developer tools (git, package managers, language toolchains) still work because their $HOME config and cache paths are automatically made readable.",
    "- Use $TMPDIR for temporary files; /tmp may not be writable. On macOS and Linux the TMPDIR env var is set to a writable path.",
    "- If a command needs sandboxed write access to specific file paths outside workspace, pass requestFileValidationCheck with those paths. VS Code checks sandbox access before execution and returns Access Denied without running the command when access is unavailable."
  ];
  if (!isNetworkAvailable) {
    const deniedDomains = sandboxingOptions.networkDomains?.deniedDomains ?? [];
    const allowedDomains = sandboxingOptions.networkDomains?.allowedDomains ?? [];
    const deniedSet = new Set(deniedDomains);
    const effectiveAllowed = allowedDomains.filter((d) => !deniedSet.has(d));
    const retrySuffix = sandboxingOptions.retryWithAllowNetworkRequests ? " unless requestAllowNetwork=true is set" : "";
    if (effectiveAllowed.length === 0) {
      lines.push(`- Network: blocked in the sandbox; commands that need the network fail${retrySuffix}.`);
    } else {
      lines.push(`- Network: only these domains are reachable in the sandbox: ${effectiveAllowed.join(", ")}. Other domains fail${retrySuffix}.`);
    }
    if (deniedDomains.length > 0) {
      lines.push(`- These domains are explicitly blocked in the sandbox: ${deniedDomains.join(", ")}`);
    }
  }
  if (sandboxingOptions.retryWithAllowNetworkRequests || sandboxingOptions.allowToRunUnsandboxedCommands) {
    lines.push("- To get more access (each prompts the user \u2014 never ask the user for permission yourself):");
    if (sandboxingOptions.retryWithAllowNetworkRequests) {
      lines.push(
        "  - Need a blocked domain? Set requestAllowNetwork=true and provide requestAllowNetworkReason. This keeps the filesystem sandbox in place and only relaxes the network, so prefer it for network-only needs. Do this proactively when network use is obvious (git fetch/pull/push/clone; npm/yarn/pnpm/pip/cargo/go/brew installs; curl; wget), or reactively after a network failure (e.g. 'Network request failed', HTTP code 403)."
      );
    }
    if (sandboxingOptions.allowToRunUnsandboxedCommands) {
      const removesAllClause = sandboxingOptions.retryWithAllowNetworkRequests ? "This grants full filesystem AND network access by removing all sandbox protection, so for network-only needs prefer requestAllowNetwork and use this only when filesystem (or other non-network) access is also blocked." : "This grants full filesystem and network access by removing all sandbox protection, so use it only when the command truly needs it.";
      lines.push(
        `  - Need filesystem or other access the sandbox blocks? Set requestUnsandboxedExecution=true and provide requestUnsandboxedExecutionReason. ${removesAllClause} Do this proactively when it clearly needs it (writing/deleting files outside the workspace and $TMPDIR like $HOME, /usr, /etc; installing to system locations; elevated privileges), or reactively after a sandbox failure (e.g. 'Operation not permitted').`
      );
    }
  }
  if (!sandboxingOptions.allowToRunUnsandboxedCommands) {
    lines.push("- Running commands outside the sandbox is disabled by chat.agent.sandbox.allowUnsandboxedCommands. Do not set requestUnsandboxedExecution=true.");
  }
  return lines;
}
function createSandboxProperties(sandboxingOptions) {
  const isNetworkAvailable = sandboxingOptions.sandboxMode === "on-network-available";
  return {
    ...sandboxingOptions.allowToRunUnsandboxedCommands ? {
      requestUnsandboxedExecution: {
        type: "boolean",
        description: "Request that this command run outside the terminal sandbox. Only set this when the command clearly needs unsandboxed access. The user will be prompted before the command runs unsandboxed."
      },
      requestUnsandboxedExecutionReason: {
        type: "string",
        description: "A short explanation of why this command must run outside the terminal sandbox. Only provide this when requestUnsandboxedExecution is true."
      }
    } : {},
    ...isNetworkAvailable || !sandboxingOptions.retryWithAllowNetworkRequests ? {} : {
      requestAllowNetwork: {
        type: "boolean",
        description: "Request that this command remain in the terminal sandbox but run with unrestricted network access. Only set this when the command clearly needs network access but the required network access was blocked. The user will be prompted before network restrictions are relaxed."
      },
      requestAllowNetworkReason: {
        type: "string",
        description: "A short explanation of why this sandboxed command needs unrestricted network access. Only provide this when requestAllowNetwork is true."
      }
    },
    requestFileValidationCheck: {
      type: "array",
      description: "Sandbox write access checks to perform before running the command. Provide the file paths that the command needs to write.",
      items: {
        type: "string"
      }
    },
    requestFileValidationCheckReason: {
      type: "string",
      description: "A short explanation of why this sandboxed command needs these file paths. Only provide this when requestFileValidationCheck is not empty."
    }
  };
}
function createGenericDescription(sandboxingOptions, includeElevationGuidance) {
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

Execution Mode:
- For ALL one-shot commands (builds, tests, installs, compilation, linting, downloads, scripts), use mode='sync' and omit timeout. The tool waits for the command to complete and returns full output inline. This is the default and strongly preferred mode.
- Use mode='async' ONLY for processes that must keep running indefinitely while you do other work (servers, watchers, dev daemons). Async waits for an initial idle/output signal, then returns a terminal ID and output snapshot while the process continues running.
- In sync mode, the full output is returned when the command completes \u2014 you do NOT need to call ${TerminalToolId.GetTerminalOutput} afterward. Only use ${TerminalToolId.GetTerminalOutput} if the tool result explicitly says the command was moved to background, timed out, or needs input.

Use ${TerminalToolId.SendToTerminal} to send commands or input to a terminal session.`];
  if (sandboxingOptions.sandboxMode !== "off") {
    parts.push(createSandboxLines(sandboxingOptions).join("\n"));
  }
  parts.push(`

Output Management:
- Output exceeding 20KB is saved to a temp file; the result includes the file path so you can read the full output with readFile or search it with grep
- Use head, tail, grep, awk to filter and limit output size
- For pager commands, disable paging: git --no-pager or add | cat
- Use wc -l to count lines before displaying large outputs

Best Practices:
- Quote variables: "$var" instead of $var to handle spaces
- Use find with -exec or xargs for file operations
- Be specific with commands to avoid excessive output
- Avoid printing credentials unless absolutely required
${includeElevationGuidance ? "- Avoid commands that require interactive privilege escalation, such as sudo/su/doas without a non-interactive flag (e.g. sudo -n). They block on a password prompt that cannot be answered in this mode, and secrets must never be routed through the model. If a command needs elevated privileges, tell the user to run it themselves in the terminal and stop \u2014 do NOT retry the command with variations.\n" : ""}- NEVER run sleep or similar wait commands in a terminal. You will be automatically notified on your next turn when async terminal commands or timed-out sync commands complete or need input. Do NOT poll for completion.
- NEVER pipe interactive commands through tail, head, grep, or other filters \u2014 this hides prompts and prevents the terminal from detecting when input is needed. Run interactive commands without pipes.

Interactive Input Handling:
- When a terminal command is waiting for interactive input, do NOT suggest alternatives or ask the user whether to proceed. Instead, use the vscode_askQuestions tool to collect the needed values from the user, then send them.
- NEVER use vscode_askQuestions to request sensitive input such as passwords, passphrases, API keys, tokens, or other secrets \u2014 answers to that tool are sent through the model. If the prompt requires a secret, tell the user to type it directly into the terminal and stop; do not call vscode_askQuestions or send_to_terminal for that prompt.
- Send exactly one answer per prompt using ${TerminalToolId.SendToTerminal}. Never send multiple answers in a single send.
- After each send, call ${TerminalToolId.GetTerminalOutput} to read the next prompt before sending the next answer.
- Continue one prompt at a time until the command finishes.`);
  return parts.join("");
}
function createBashModelDescription(sandboxingOptions, includeElevationGuidance) {
  return [
    "This tool allows you to execute shell commands in a persistent bash terminal session, preserving environment variables, working directory, and other context across multiple commands.",
    createGenericDescription(sandboxingOptions, includeElevationGuidance),
    "- Use [[ ]] for conditional tests instead of [ ]",
    "- Prefer $() over backticks for command substitution"
  ].join("\n");
}
function createZshModelDescription(sandboxingOptions, includeElevationGuidance) {
  return [
    "This tool allows you to execute shell commands in a persistent zsh terminal session, preserving environment variables, working directory, and other context across multiple commands.",
    createGenericDescription(sandboxingOptions, includeElevationGuidance),
    "- Use type to check command type (builtin, function, alias)",
    "- Use jobs, fg, bg for job control",
    "- Use [[ ]] for conditional tests instead of [ ]",
    "- Prefer $() over backticks for command substitution",
    "- Take advantage of zsh globbing features (**, extended globs). Note: unmatched globs fail by default (zsh: no matches found) \u2014 use a glob qualifier like *(N) or quote the glob if it should be literal",
    "",
    "zsh pitfalls \u2014 these WILL cause errors or hangs:",
    "- NEVER use bare == or === as separators (e.g. echo === triggers zsh equals expansion). Quote them: echo '==='",
    "- NEVER use status as a variable name (it is read-only in zsh). Use exit_code or ret instead"
  ].join("\n");
}
function createFishModelDescription(sandboxingOptions, includeElevationGuidance) {
  return [
    "This tool allows you to execute shell commands in a persistent fish terminal session, preserving environment variables, working directory, and other context across multiple commands.",
    createGenericDescription(sandboxingOptions, includeElevationGuidance),
    "- Use type to check command type (builtin, function, alias)",
    "- Use jobs, fg, bg for job control",
    "- Use test expressions for conditionals (no [[ ]] syntax)",
    "- Prefer command substitution with () syntax",
    "- Variables are arrays by default, use $var[1] for first element",
    "- Take advantage of fish's autosuggestions and completions"
  ].join("\n");
}
async function createRunInTerminalToolData(accessor) {
  const instantiationService = accessor.get(IInstantiationService);
  const terminalSandboxService = accessor.get(ITerminalSandboxService);
  const configurationService = accessor.get(IConfigurationService);
  const allowToRunUnsandboxedCommands = configurationService.getValue(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands) === true;
  const retryWithAllowNetworkRequestsSetting = configurationService.getValue(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests) === true;
  const defaultPermissionLevel = configurationService.getValue(ChatConfiguration.DefaultPermissionLevel);
  const includeElevationGuidance = configurationService.getValue(TerminalChatAgentToolsSettingId.EnableAutoApprove) === true || configurationService.getValue(ChatConfiguration.GlobalAutoApprove) === true || isAutoApproveLevel(defaultPermissionLevel);
  const profileFetcher = instantiationService.createInstance(TerminalProfileFetcher);
  const [shell, os, isSandboxEnabled, isSandboxAllowNetworkEnabled] = await Promise.all([
    profileFetcher.getCopilotShell(),
    profileFetcher.osBackend,
    terminalSandboxService.isEnabled(),
    terminalSandboxService.isSandboxAllowNetworkEnabled()
  ]);
  const sandboxingOptions = isSandboxEnabled ? isSandboxAllowNetworkEnabled ? {
    sandboxMode: "on-network-available",
    allowToRunUnsandboxedCommands,
    retryWithAllowNetworkRequests: false,
    networkDomains: void 0
  } : {
    sandboxMode: "on-network-restricted",
    allowToRunUnsandboxedCommands,
    retryWithAllowNetworkRequests: retryWithAllowNetworkRequestsSetting,
    networkDomains: terminalSandboxService.getResolvedNetworkDomains()
  } : {
    sandboxMode: "off"
  };
  let modelDescription;
  if (shell && os && isPowerShell(shell, os)) {
    modelDescription = createPowerShellModelDescription(shell, sandboxingOptions, includeElevationGuidance);
  } else if (shell && os && isZsh(shell, os)) {
    modelDescription = createZshModelDescription(sandboxingOptions, includeElevationGuidance);
  } else if (shell && os && isFish(shell, os)) {
    modelDescription = createFishModelDescription(sandboxingOptions, includeElevationGuidance);
  } else {
    modelDescription = createBashModelDescription(sandboxingOptions, includeElevationGuidance);
  }
  const sharedProperties = {
    command: {
      type: "string",
      description: "The command to run in the terminal."
    },
    explanation: {
      type: "string",
      description: "A one-sentence description of what the command does. This will be shown to the user before the command is run."
    },
    goal: {
      type: "string",
      description: 'A short description of the goal or purpose of the command (e.g., "Install dependencies", "Start development server").'
    }
  };
  const sandboxProperties = sandboxingOptions.sandboxMode === "off" ? {} : createSandboxProperties(sandboxingOptions);
  return {
    id: TerminalToolId.RunInTerminal,
    toolReferenceName: TOOL_REFERENCE_NAME,
    legacyToolReferenceFullNames: LEGACY_TOOL_REFERENCE_FULL_NAMES,
    displayName: localize("runInTerminalTool.displayName", "Run in Terminal"),
    modelDescription: `${modelDescription}

Execution mode:
- mode='sync' (strongly preferred): waits for the command to complete and returns full output inline. Use for ALL one-shot commands (builds, tests, installs, compilation, scripts). Omit timeout to let the command run to completion \u2014 the tool handles idle detection and input prompts automatically.
- mode='async': waits for an initial idle/output signal from the command, then returns a terminal ID and output snapshot while the process continues running. Use ONLY for processes that must keep running indefinitely (servers, watchers, daemons). Timeout caps how long to wait for the initial idle/output signal.

Timeout parameter: Usually omit timeout entirely for sync commands \u2014 the tool returns automatically on completion, input-needed, or cancellation. Only set a timeout as a safety net for commands you suspect might hang. Use 0 to explicitly indicate no timeout.

Sync output is final: When a sync command completes, the full output is returned inline \u2014 do NOT call ${TerminalToolId.GetTerminalOutput} afterward. Only use ${TerminalToolId.GetTerminalOutput} if the tool result explicitly indicates the command was moved to background, timed out, or needs input. Do NOT tell the user to check the terminal panel \u2014 all command output is already included in the tool result.

Terminal notifications: When an async command finishes or a sync command times out, you will be automatically notified on your next turn with the exit code and terminal output. You will also be notified if the terminal needs input. Do NOT poll or sleep to wait for completion.`,
    userDescription: localize("runInTerminalTool.userDescription", "Run commands in the terminal"),
    source: ToolDataSource.Internal,
    icon: Codicon.terminal,
    inputSchema: {
      type: "object",
      properties: {
        ...sharedProperties,
        ...sandboxProperties,
        mode: {
          type: "string",
          enum: ["sync", "async"],
          enumDescriptions: [
            "Wait for command completion and return full output inline. Strongly preferred for all one-shot commands (builds, tests, installs, scripts).",
            "Wait for an initial idle/output signal, then return a terminal ID and output snapshot while the process continues running. Timeout caps how long to wait for the initial signal. Use ONLY for processes that must keep running indefinitely (servers, watchers, daemons)."
          ],
          description: "Execution mode for this command. Use sync (default) for nearly all commands."
        },
        isBackground: {
          type: "boolean",
          description: 'Legacy execution mode flag. Deprecated in favor of "mode". If true, equivalent to mode=async. If false, equivalent to mode=sync.'
        },
        timeout: {
          type: "number",
          description: "Optional. Usually omit entirely for sync commands \u2014 the tool waits for completion automatically. Only set a timeout (in milliseconds) as a safety net if you suspect the command might hang. If the timeout elapses, the command continues in the background and you get a terminal ID to check output later. Use 0 to explicitly indicate no timeout."
        }
      },
      required: ["command", "explanation", "goal", "mode"]
    }
  };
}
var TerminalToolStorageKeysInternal = /* @__PURE__ */ ((TerminalToolStorageKeysInternal2) => {
  TerminalToolStorageKeysInternal2["TerminalSession"] = "chat.terminalSessions";
  return TerminalToolStorageKeysInternal2;
})(TerminalToolStorageKeysInternal || {});
function shouldAutomaticallyRetrySandbox(options) {
  return options.retryAllowed && options.didSandboxWrapCommand && options.retryAlreadyRequested !== true && !options.isPersistentSession && !options.isBackgroundExecution && !options.didTimeout && options.exitCode !== 0 && options.outputLooksRetryable(options.output);
}
function shouldAutomaticallyRetryUnsandboxed(options) {
  return shouldAutomaticallyRetrySandbox({
    retryAllowed: options.allowUnsandboxedCommands,
    retryAlreadyRequested: options.requestUnsandboxedExecution,
    didSandboxWrapCommand: options.didSandboxWrapCommand,
    isPersistentSession: options.isPersistentSession,
    isBackgroundExecution: options.isBackgroundExecution,
    didTimeout: options.didTimeout,
    exitCode: options.exitCode,
    output: options.output,
    // Network failures are handled by shouldAutomaticallyRetryAllowNetworkInSandboxed; do not automatically leave the sandbox for them.
    outputLooksRetryable: (output) => outputLooksSandboxBlocked(output) && !outputLooksSandboxNetworkBlocked(output)
  });
}
function shouldAutomaticallyRetryAllowNetworkInSandboxed(options) {
  return shouldAutomaticallyRetrySandbox({
    retryAllowed: options.retryWithAllowNetworkRequests,
    retryAlreadyRequested: options.requestUnsandboxedExecution || options.requestAllowNetwork,
    didSandboxWrapCommand: options.didSandboxWrapCommand,
    isPersistentSession: options.isPersistentSession,
    isBackgroundExecution: options.isBackgroundExecution,
    didTimeout: options.didTimeout,
    exitCode: options.exitCode,
    output: options.output,
    outputLooksRetryable: outputLooksSandboxNetworkBlocked
  });
}
function outputLooksBubblewrapHostRestricted(output) {
  return /bwrap:\s*No permissions to create new namespace/i.test(output.replace(/\s+/g, " "));
}
const telemetryIgnoredSequences = [
  "\x1B[I",
  // Focus in
  "\x1B[O"
  // Focus out
];
const altBufferMessage = "\n" + localize("runInTerminalTool.altBufferMessage", "The command opened the alternate buffer.");
function buildCompletionNotificationCommand(command) {
  const firstNewline = command.search(/\r|\n/);
  const hasMoreLines = firstNewline !== -1;
  const firstLine = hasMoreLines ? command.substring(0, firstNewline) : command;
  const normalized = normalizeTerminalCommandForDisplay(firstLine);
  if (normalized.length > 80) {
    return normalized.substring(0, 79) + "\u2026";
  }
  return hasMoreLines ? normalized + "\u2026" : normalized;
}
let RunInTerminalTool = class extends Disposable {
  constructor(_chatService, _configurationService, _fileService, _historyService, _instantiationService, _labelService, _languageModelToolsService, _remoteAgentService, _storageService, _terminalChatService, _logService, _terminalService, _terminalSandboxService, _workspaceContextService, _chatWidgetService, _agentSessionsService, _chatSessionsService, lifecycleService) {
    super();
    this._chatService = _chatService;
    this._configurationService = _configurationService;
    this._fileService = _fileService;
    this._historyService = _historyService;
    this._instantiationService = _instantiationService;
    this._labelService = _labelService;
    this._languageModelToolsService = _languageModelToolsService;
    this._remoteAgentService = _remoteAgentService;
    this._storageService = _storageService;
    this._terminalChatService = _terminalChatService;
    this._logService = _logService;
    this._terminalService = _terminalService;
    this._terminalSandboxService = _terminalSandboxService;
    this._workspaceContextService = _workspaceContextService;
    this._chatWidgetService = _chatWidgetService;
    this._agentSessionsService = _agentSessionsService;
    this._chatSessionsService = _chatSessionsService;
    this._archivedSessionListener = this._register(new MutableDisposable());
    this._sessionTerminalAssociations = new ResourceMap();
    this._sessionTerminalInstances = new ResourceMap();
    this._terminalsBeingDisposedBySessionCleanup = /* @__PURE__ */ new Set();
    /**
     * Tracks active background completion notifications per terminal instance ID.
     * When a new notification is registered for a terminal that already has one,
     * the previous notification (and its OutputMonitor) is disposed first to
     * prevent listener accumulation on the terminal's onDidInputData emitter.
     *
     * Keyed by `ITerminalInstance.instanceId` (stable per terminal) rather than
     * the per-invocation `termId` so that reusing the same foreground terminal
     * after an `inputNeeded` race disposes the prior OutputMonitor.
     */
    this._backgroundNotifications = this._register(new DisposableMap());
    /**
     * Set when VS Code is shutting down. Suppresses "terminal exited"
     * notifications that would otherwise be generated when background
     * terminals are disposed during shutdown and then persist as
     * undeliverable steering messages after restart.
     */
    this._isShuttingDown = false;
    /**
     * Per-instance disposables that unregister `_activeExecutions` entries from the
     * `ITerminalChatService` execution-id map. Keyed by the same `termId` as `_activeExecutions`
     * so registrations and active executions share a lifecycle.
     */
    this._executionRegistrations = this._register(new DisposableMap());
    this._register(lifecycleService.onWillShutdown(() => {
      this._isShuttingDown = true;
    }));
    this._osBackend = this._remoteAgentService.getEnvironment().then((remoteEnv) => remoteEnv?.os ?? OS);
    this._terminalToolCreator = this._instantiationService.createInstance(ToolTerminalCreator);
    this._treeSitterCommandParser = this._register(this._instantiationService.createInstance(TreeSitterCommandParser));
    this._telemetry = this._instantiationService.createInstance(RunInTerminalToolTelemetry);
    this._commandArtifactCollector = this._instantiationService.createInstance(TerminalCommandArtifactCollector);
    this._profileFetcher = this._instantiationService.createInstance(TerminalProfileFetcher);
    this._largeOutputFileWriter = this._register(this._instantiationService.createInstance(LargeOutputFileWriter));
    this._commandLineRewriters = [
      this._register(this._instantiationService.createInstance(CommandLineCdPrefixRewriter)),
      this._register(this._instantiationService.createInstance(CommandLinePwshChainOperatorRewriter, this._treeSitterCommandParser))
    ];
    if (this._enableCommandLineSandboxRewriting) {
      this._commandLineRewriters.push(this._register(this._instantiationService.createInstance(CommandLineSandboxRewriter, this._treeSitterCommandParser)));
    }
    this._commandLineRewriters.push(this._register(this._instantiationService.createInstance(CommandLineBackgroundDetachRewriter)));
    this._commandLineRewriters.push(this._register(this._instantiationService.createInstance(CommandLinePreventHistoryRewriter)));
    this._commandLineAnalyzers = [
      this._register(this._instantiationService.createInstance(CommandLineFileWriteAnalyzer, this._treeSitterCommandParser, (message, args) => this._logService.info(`RunInTerminalTool#CommandLineFileWriteAnalyzer: ${message}`, args))),
      this._register(this._instantiationService.createInstance(CommandLineAutoApproveAnalyzer, this._treeSitterCommandParser, this._telemetry, (message, args) => this._logService.info(`RunInTerminalTool#CommandLineAutoApproveAnalyzer: ${message}`, args)))
    ];
    if (this._enableCommandLineSandboxRewriting) {
      this._commandLineAnalyzers.push(this._register(this._instantiationService.createInstance(CommandLineSandboxAnalyzer)));
    }
    this._commandLinePresenters = [
      this._instantiationService.createInstance(SandboxedCommandLinePresenter),
      new NodeCommandLinePresenter(),
      new PythonCommandLinePresenter(),
      new RubyCommandLinePresenter()
    ];
    this._outputAnalyzers = [
      this._register(this._instantiationService.createInstance(SandboxOutputAnalyzer))
    ];
    this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, (e) => {
      if (!e || e.affectsConfiguration(TerminalChatAgentToolsSettingId.EnableAutoApprove)) {
        if (this._configurationService.getValue(TerminalChatAgentToolsSettingId.EnableAutoApprove) !== true) {
          this._storageService.remove(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, StorageScope.APPLICATION);
        }
      }
    }));
    this._restoreTerminalAssociations();
    this._register(this._terminalService.onDidDisposeInstance((e) => {
      this._removeTerminalAssociations(e);
    }));
    this._register(this._chatService.onDidDisposeSession((e) => {
      for (const resource of e.sessionResources) {
        this._cleanupSessionTerminals(resource);
      }
      this._largeOutputFileWriter.cleanup();
    }));
  }
  _setActiveExecution(termId, execution) {
    RunInTerminalTool._activeExecutions.set(termId, execution);
    this._executionRegistrations.set(termId, this._terminalChatService.registerTerminalInstanceWithExecutionId(termId, execution.instance));
  }
  _deleteActiveExecution(termId) {
    this._executionRegistrations.deleteAndDispose(termId);
    return RunInTerminalTool._activeExecutions.delete(termId);
  }
  static getBackgroundOutput(id) {
    const execution = RunInTerminalTool._activeExecutions.get(id);
    if (!execution) {
      throw new Error("Invalid terminal ID");
    }
    return execution.getOutput();
  }
  /**
   * Gets an active terminal execution by ID. Returns undefined if not found.
   * Can be used to await the completion of a background terminal command.
   */
  static getExecution(id) {
    return RunInTerminalTool._activeExecutions.get(id);
  }
  /**
   * Removes an active terminal execution by ID and disposes it.
   * @returns true if the execution was found and removed, false otherwise.
   */
  static removeExecution(id) {
    const execution = RunInTerminalTool._activeExecutions.get(id);
    if (!execution) {
      return false;
    }
    execution.dispose();
    RunInTerminalTool._activeExecutions.delete(id);
    return true;
  }
  /**
   * Marks a terminal ID as being killed by the `kill_terminal` tool so that
   * the `onDisposed` handler in `_registerCompletionNotification` skips the
   * redundant steering message.
   */
  static markKilledByTool(id) {
    RunInTerminalTool._killedByTool.add(id);
  }
  _resolveExecutionOptions(args) {
    const mode = args.mode ?? (args.isBackground ? "async" : "sync");
    switch (mode) {
      case "async":
        return { mode: "async", persistentSession: true, waitStrategy: "idle" };
      case "sync":
      default:
        return { mode: "sync", persistentSession: false, waitStrategy: "completion" };
    }
  }
  get _allowUnsandboxedCommands() {
    return this._configurationService.getValue(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands) === true;
  }
  get _retryWithAllowNetworkRequests() {
    return this._configurationService.getValue(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests) === true;
  }
  get _allowSandboxAutoApprove() {
    return this._configurationService.getValue(AgentSandboxSettingId.AgentSandboxAllowAutoApprove) === true;
  }
  _getAllowToRunUnsandboxedCommands(args) {
    return (args.allowToRunUnsandboxedCommands ?? this._allowUnsandboxedCommands) === true && this._allowUnsandboxedCommands;
  }
  _shouldRejectUnsandboxedExecutionRequest(isSandboxEnabled, allowUnsandboxedCommands, args) {
    return isSandboxEnabled && args.requestUnsandboxedExecution === true && !allowUnsandboxedCommands;
  }
  _shouldRejectAllowNetworkRequest(isSandboxEnabled, isSandboxAllowNetworkEnabled, args) {
    return isSandboxEnabled && !isSandboxAllowNetworkEnabled && args.requestAllowNetwork === true && !this._retryWithAllowNetworkRequests;
  }
  _getUnsandboxedExecutionDisabledMessage() {
    return localize(
      "runInTerminal.unsandboxed.disabled.result",
      "The command was not executed because it requested to run outside the terminal sandbox, but running commands outside the sandbox is disabled by chat.agent.sandbox.allowUnsandboxedCommands. Run the command in the sandbox instead, or enable the setting to allow unsandboxed execution."
    );
  }
  _getAllowNetworkRequestDisabledMessage() {
    return localize(
      "runInTerminal.allowNetwork.disabled.result",
      "The command was not executed because it requested unrestricted network access in the terminal sandbox, but per-command network access is disabled by chat.agent.sandbox.retryWithAllowNetworkRequests. Run the command with restricted network access instead, or enable the setting to allow network access requests."
    );
  }
  async _getDeniedSandboxFileAccess(paths, sandboxPrecheckInputs) {
    if (!paths?.length) {
      return [];
    }
    const result = await this._terminalSandboxService.checkFileAccess("write", paths, sandboxPrecheckInputs);
    return result.denied;
  }
  _buildSandboxFileAccessDeniedMessage(deniedPaths) {
    const deniedPathsMessage = deniedPaths.map((path) => `write: ${path}`).join("\n");
    return localize(
      "runInTerminal.sandbox.fileAccessDenied",
      "Access Denied: The command was not executed because the terminal sandbox does not allow access to the requested file paths:\n{0}",
      deniedPathsMessage
    );
  }
  /**
   * Controls whether this tool wires up sandbox-specific command-line
   * behavior, including both the {@link CommandLineSandboxRewriter} and the
   * {@link CommandLineSandboxAnalyzer}. This is separate from
   * ITerminalSandboxService.isEnabled(), which reports the current terminal
   * sandboxing enablement for the running window.
   */
  get _enableCommandLineSandboxRewriting() {
    return true;
  }
  async handleToolStream(context, _token) {
    const partialInput = context.rawInput;
    if (partialInput && typeof partialInput === "object" && partialInput.command) {
      const truncatedCommand = buildCommandDisplayText(partialInput.command);
      const invocationMessage = new MarkdownString(localize("runInTerminal.streaming", "Running `{0}`", escapeMarkdownSyntaxTokens(truncatedCommand)));
      return { invocationMessage };
    }
    return { invocationMessage: localize("runInTerminal.streaming.default", "Running command") };
  }
  async prepareToolInvocation(context, token) {
    const args = context.parameters;
    const executionOptions = this._resolveExecutionOptions(args);
    const chatSessionResource = context.chatSessionResource;
    const sandboxPrecheckInputs = this._getSandboxPrecheckInputs(chatSessionResource, context.chatRequestId);
    let instance;
    if (chatSessionResource) {
      const toolTerminal = this._sessionTerminalAssociations.get(chatSessionResource);
      if (toolTerminal && !toolTerminal.isBackground) {
        instance = toolTerminal.instance;
      }
    }
    const [os, shell, cwd, sandboxPrereqs] = await Promise.all([
      this._osBackend,
      this._profileFetcher.getCopilotShell(),
      (async () => {
        let cwd2 = await instance?.getCwdResource();
        if (!cwd2) {
          const sessionModel = chatSessionResource ? this._chatService.getSession(chatSessionResource) : void 0;
          if (sessionModel?.workingDirectory) {
            cwd2 = sessionModel.workingDirectory;
          } else {
            const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot();
            const workspaceFolder = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? void 0 : void 0;
            cwd2 = workspaceFolder?.uri;
          }
        }
        return cwd2;
      })(),
      this._terminalSandboxService.checkForSandboxingPrereqs(false, sandboxPrecheckInputs)
    ]);
    const language = os === OperatingSystem.Windows ? "pwsh" : "sh";
    const isSandboxEnabled = sandboxPrereqs.enabled;
    const isSandboxAllowNetworkEnabled = isSandboxEnabled && await this._terminalSandboxService.isSandboxAllowNetworkEnabled();
    const allowUnsandboxedCommands = this._getAllowToRunUnsandboxedCommands(args);
    const explicitUnsandboxRequest = isSandboxEnabled && allowUnsandboxedCommands && args.requestUnsandboxedExecution === true;
    const explicitAllowNetworkRequest = isSandboxEnabled && !isSandboxAllowNetworkEnabled && this._retryWithAllowNetworkRequests && !explicitUnsandboxRequest && args.requestAllowNetwork === true;
    let requiresUnsandboxConfirmation = explicitUnsandboxRequest;
    let requestUnsandboxedExecutionReason = explicitUnsandboxRequest ? args.requestUnsandboxedExecutionReason : void 0;
    let requiresAllowNetworkConfirmation = explicitAllowNetworkRequest;
    let requestAllowNetworkReason = explicitAllowNetworkRequest ? args.requestAllowNetworkReason : void 0;
    const missingDependencies = sandboxPrereqs.failedCheck === TerminalSandboxPrerequisiteCheck.Dependencies && sandboxPrereqs.missingDependencies?.length ? sandboxPrereqs.missingDependencies : void 0;
    const canInstallMissingDependencies = !!missingDependencies && sandboxPrereqs.canInstallMissingDependencies === true;
    const sandboxRemediations = sandboxPrereqs.failedCheck === TerminalSandboxPrerequisiteCheck.Bubblewrap && sandboxPrereqs.remediations?.length ? [...sandboxPrereqs.remediations] : void 0;
    const sandboxPrerequisiteFailure = sandboxPrereqs.failedCheck === TerminalSandboxPrerequisiteCheck.Bubblewrap && !sandboxRemediations ? localize("runInTerminal.bubblewrap.unusable", "Bubblewrap is installed but cannot create the required sandbox namespace on this system. The command was not executed.") : missingDependencies && !canInstallMissingDependencies ? localize("runInTerminal.missingDeps.unsupportedInstaller", "The following dependencies required for sandboxed execution are not installed: {0}. Install them using your system package manager, then run the command again.", missingDependencies.join(", ")) : void 0;
    const terminalToolSessionId = generateUuid();
    const terminalCommandId = `tool-${generateUuid()}`;
    if (this._shouldRejectUnsandboxedExecutionRequest(isSandboxEnabled, allowUnsandboxedCommands, args)) {
      const commandToDisplay2 = normalizeTerminalCommandForDisplay(args.command);
      return {
        invocationMessage: new MarkdownString(localize("runInTerminal.unsandboxed.disabled.invocation", "Not running `{0}` because unsandboxed execution is disabled", escapeMarkdownSyntaxTokens(buildCommandDisplayText(commandToDisplay2)))),
        icon: Codicon.error,
        confirmationMessages: void 0,
        toolSpecificData: {
          kind: "terminal",
          terminalToolSessionId,
          terminalCommandId,
          commandLine: {
            original: args.command,
            forDisplay: commandToDisplay2
          },
          cwd,
          language,
          isBackground: executionOptions.persistentSession,
          requestUnsandboxedExecution: false,
          requestUnsandboxedExecutionReason: void 0
        }
      };
    }
    if (this._shouldRejectAllowNetworkRequest(isSandboxEnabled, isSandboxAllowNetworkEnabled, args)) {
      const commandToDisplay2 = normalizeTerminalCommandForDisplay(args.command);
      return {
        invocationMessage: new MarkdownString(localize("runInTerminal.allowNetwork.disabled.invocation", "Not running `{0}` because unrestricted network access in the sandbox is disabled", escapeMarkdownSyntaxTokens(buildCommandDisplayText(commandToDisplay2)))),
        icon: Codicon.error,
        confirmationMessages: void 0,
        toolSpecificData: {
          kind: "terminal",
          terminalToolSessionId,
          terminalCommandId,
          commandLine: {
            original: args.command,
            forDisplay: commandToDisplay2
          },
          cwd,
          language,
          isBackground: executionOptions.persistentSession,
          requestAllowNetwork: false,
          requestAllowNetworkReason: void 0
        }
      };
    }
    const rewriteResult = await this._rewriteCommandLine(args.command, {
      cwd,
      shell,
      os,
      isBackground: executionOptions.persistentSession,
      requestUnsandboxedExecution: allowUnsandboxedCommands ? requiresUnsandboxConfirmation : false,
      requestUnsandboxedExecutionReason,
      requestAllowNetwork: explicitAllowNetworkRequest,
      requestAllowNetworkReason,
      sandboxPrecheckInputs
    });
    const rewrittenCommand = rewriteResult.rewrittenCommand;
    const forDisplayCommand = rewriteResult.forDisplayCommand;
    const isSandboxWrapped = rewriteResult.isSandboxWrapped;
    requiresUnsandboxConfirmation = rewriteResult.requiresUnsandboxConfirmation;
    requestUnsandboxedExecutionReason = rewriteResult.requestUnsandboxedExecutionReason;
    requiresAllowNetworkConfirmation = rewriteResult.requiresAllowNetworkConfirmation;
    requestAllowNetworkReason = rewriteResult.requestAllowNetworkReason;
    const blockedDomains = rewriteResult.blockedDomains;
    const toolSpecificData = {
      kind: "terminal",
      terminalToolSessionId,
      terminalCommandId,
      commandLine: {
        original: args.command,
        toolEdited: rewrittenCommand === args.command ? void 0 : rewrittenCommand,
        forDisplay: forDisplayCommand ?? normalizeTerminalCommandForDisplay(rewrittenCommand ?? args.command),
        isSandboxWrapped
      },
      cwd,
      language,
      isBackground: executionOptions.persistentSession,
      requestUnsandboxedExecution: requiresUnsandboxConfirmation,
      requestUnsandboxedExecutionReason,
      requestAllowNetwork: requiresAllowNetworkConfirmation,
      requestAllowNetworkReason,
      missingSandboxDependencies: missingDependencies,
      sandboxRemediations,
      sandboxPrerequisiteFailure
    };
    let sandboxPrerequisiteConfirmation = void 0;
    if (missingDependencies && canInstallMissingDependencies) {
      const depsList = missingDependencies.join(", ");
      sandboxPrerequisiteConfirmation = {
        title: localize("runInTerminal.missingDeps.title", "Missing Sandbox Dependencies"),
        message: new MarkdownString(localize(
          "runInTerminal.missingDeps.message",
          "The following dependencies required for sandboxed execution are not installed: {0}. Would you like to install them?",
          depsList
        )),
        customOptions: [
          { id: "install", label: localize("runInTerminal.missingDeps.install", "Install"), kind: ConfirmationOptionKind.Approve },
          { id: "cancel", label: localize("runInTerminal.missingDeps.cancel", "Cancel"), kind: ConfirmationOptionKind.Deny }
        ]
      };
    }
    const alternativeRecommendation = getRecommendedToolsOverRunInTerminal(args.command, this._languageModelToolsService);
    if (alternativeRecommendation) {
      toolSpecificData.alternativeRecommendation = alternativeRecommendation;
      return {
        confirmationMessages: void 0,
        presentation: ToolInvocationPresentation.Hidden,
        toolSpecificData
      };
    }
    const commandLine = forDisplayCommand ?? rewrittenCommand ?? args.command;
    const isEligibleForAutoApproval = () => isToolEligibleForTerminalAutoApproval(TOOL_REFERENCE_NAME, this._configurationService, LEGACY_TOOL_REFERENCE_FULL_NAMES);
    const isAutoApproveEnabled = this._configurationService.getValue(TerminalChatAgentToolsSettingId.EnableAutoApprove) === true;
    const isAutoApproveAllowed = isTerminalAutoApproveAllowed(TOOL_REFERENCE_NAME, this._configurationService, this._storageService, LEGACY_TOOL_REFERENCE_FULL_NAMES);
    const commandLineAnalyzerOptions = {
      commandLine,
      cwd,
      os,
      shell,
      treeSitterLanguage: isPowerShell(shell, os) ? TreeSitterCommandParserLanguage.PowerShell : TreeSitterCommandParserLanguage.Bash,
      terminalToolSessionId,
      chatSessionResource,
      requiresUnsandboxConfirmation,
      requiresAllowNetworkConfirmation,
      hasSessionAutoApproval: !!chatSessionResource && this._terminalChatService.hasChatSessionAutoApproval(chatSessionResource)
    };
    const isSessionAutoApproved = chatSessionResource && isSessionAutoApproveLevel(chatSessionResource, this._configurationService, this._chatWidgetService, this._chatService);
    const commandLineAnalyzers = isSessionAutoApproved ? this._commandLineAnalyzers.filter((e) => !(e instanceof CommandLineAutoApproveAnalyzer)) : this._commandLineAnalyzers;
    const commandLineAnalyzerResults = await Promise.all(commandLineAnalyzers.map((e) => e.analyze(commandLineAnalyzerOptions)));
    const disclaimersRaw = commandLineAnalyzerResults.map((e) => e.disclaimers).filter((e) => !!e).flatMap((e) => e);
    let disclaimer;
    if (disclaimersRaw.length > 0) {
      const disclaimerTexts = disclaimersRaw.map((d) => typeof d === "string" ? d : d.value);
      const hasMarkdownDisclaimer = disclaimersRaw.some((d) => typeof d !== "string");
      const mdOptions = hasMarkdownDisclaimer ? { supportThemeIcons: true, isTrusted: { enabledCommands: [TerminalChatCommandId.OpenTerminalSettingsLink] } } : { supportThemeIcons: true };
      disclaimer = new MarkdownString(`$(${Codicon.info.id}) ` + disclaimerTexts.join(" "), mdOptions);
    }
    const analyzersIsAutoApproveAllowed = commandLineAnalyzerResults.every((e) => e.isAutoApproveAllowed);
    const customActions = isEligibleForAutoApproval() && analyzersIsAutoApproveAllowed ? commandLineAnalyzerResults.map((e) => e.customActions ?? []).flat() : void 0;
    let shellType = basename(shell, ".exe");
    if (shellType === "powershell") {
      shellType = "pwsh";
    }
    const wouldBeAutoApproved = (
      // Does at least one analyzer auto approve
      commandLineAnalyzerResults.some((e) => e.isAutoApproved) && // No analyzer denies auto approval
      commandLineAnalyzerResults.every((e) => e.isAutoApproved !== false) && // All analyzers allow auto approval
      analyzersIsAutoApproveAllowed
    );
    const isAutoApprovedByRules = (
      // Is the setting enabled and the user has opted-in
      isAutoApproveAllowed && // Would be auto-approved based on rules
      wouldBeAutoApproved
    );
    const isSandboxAutoApproved = isSandboxEnabled && toolSpecificData.commandLine.isSandboxWrapped === true && !requiresAllowNetworkConfirmation && this._allowSandboxAutoApprove;
    const isFinalAutoApproved = isSandboxAutoApproved || isAutoApprovedByRules || commandLineAnalyzerResults.some((e) => e.forceAutoApproval);
    if (isFinalAutoApproved || isAutoApproveEnabled && commandLineAnalyzerResults.some((e) => e.autoApproveInfo)) {
      toolSpecificData.autoApproveInfo = commandLineAnalyzerResults.find((e) => e.autoApproveInfo)?.autoApproveInfo;
    }
    const commandToDisplay = (toolSpecificData.commandLine.forDisplay ?? toolSpecificData.commandLine.userEdited ?? toolSpecificData.commandLine.toolEdited ?? toolSpecificData.commandLine.original).trimStart();
    const extractedCd = extractCdPrefix(commandToDisplay, shell, os);
    let confirmationTitle;
    if (extractedCd && cwd) {
      const isAbsolutePath = os === OperatingSystem.Windows ? win32.isAbsolute(extractedCd.directory) : posix.isAbsolute(extractedCd.directory);
      const directoryUri = isAbsolutePath ? URI.from({ scheme: cwd.scheme, authority: cwd.authority, path: extractedCd.directory }) : URI.joinPath(cwd, extractedCd.directory);
      const directoryLabel = this._labelService.getUriLabel(directoryUri);
      const cdPrefix = commandToDisplay.substring(0, commandToDisplay.length - extractedCd.command.length);
      toolSpecificData.confirmation = {
        commandLine: extractedCd.command,
        cwdLabel: directoryLabel,
        cdPrefix
      };
      confirmationTitle = localize("runInTerminal.inDirectory", "Run `{0}` command within `{1}`?", shellType, directoryLabel);
    } else {
      toolSpecificData.confirmation = {
        commandLine: commandToDisplay
      };
      confirmationTitle = localize("runInTerminal", "Run `{0}` command?", shellType);
    }
    const commandForPresenter = extractedCd?.command ?? commandToDisplay;
    let presenterInput = commandForPresenter;
    for (const presenter of this._commandLinePresenters) {
      const presenterResult = await presenter.present({ commandLine: { original: args.command, forDisplay: presenterInput }, shell, os });
      if (presenterResult) {
        toolSpecificData.presentationOverrides = {
          commandLine: presenterResult.commandLine,
          language: presenterResult.language ?? void 0
        };
        if (extractedCd && toolSpecificData.confirmation?.cwdLabel) {
          if (presenterResult.languageDisplayName) {
            confirmationTitle = localize("runInTerminal.presentationOverride.inDirectory", "Run `{0}` command in `{1}` within `{2}`?", presenterResult.languageDisplayName, shellType, toolSpecificData.confirmation.cwdLabel);
          } else {
            confirmationTitle = localize("runInTerminal.presentationOverride.inDirectory.withoutLanguage", "Run command in `{0}` within `{1}`?", shellType, toolSpecificData.confirmation.cwdLabel);
          }
        } else {
          if (presenterResult.languageDisplayName) {
            confirmationTitle = localize("runInTerminal.presentationOverride", "Run `{0}` command in `{1}`?", presenterResult.languageDisplayName, shellType);
          } else {
            confirmationTitle = localize("runInTerminal.presentationOverride.withoutLanguage", "Run command in `{0}`?", shellType);
          }
        }
        if (!presenterResult.processOtherPresenters) {
          break;
        }
        presenterInput = presenterResult.commandLine;
      }
    }
    if (requiresUnsandboxConfirmation) {
      confirmationTitle = blockedDomains?.length ? localize("runInTerminal.unsandboxed.domain", "Run `{0}` command outside the [sandbox]({1}) to access {2}?", shellType, TERMINAL_SANDBOX_DOCUMENTATION_URL, this._formatBlockedDomainsForTitle(blockedDomains)) : localize("runInTerminal.unsandboxed", "Run `{0}` command outside the [sandbox]({1})?", shellType, TERMINAL_SANDBOX_DOCUMENTATION_URL);
    } else if (requiresAllowNetworkConfirmation) {
      confirmationTitle = localize("runInTerminal.allowNetwork", "Allow {0} command to access the network?", shellType);
    }
    const shouldShowConfirmation = !isFinalAutoApproved && (!isSessionAutoApproved || requiresAllowNetworkConfirmation) || context.forceConfirmationReason !== void 0;
    const explanation = args.explanation || localize("runInTerminal.defaultExplanation", "No explanation provided");
    const goal = args.goal || localize("runInTerminal.defaultGoal", "No goal provided");
    const confirmationMessage = requiresUnsandboxConfirmation ? new MarkdownString(localize(
      "runInTerminal.unsandboxed.confirmationMessage",
      "Explanation: {0}\n\nGoal: {1}\n\nReason for leaving the sandbox: {2}",
      explanation,
      goal,
      requestUnsandboxedExecutionReason || localize("runInTerminal.unsandboxed.confirmationMessage.defaultReason", "The model indicated that this command needs unsandboxed access.")
    )) : requiresAllowNetworkConfirmation ? new MarkdownString(localize(
      "runInTerminal.allowNetwork.confirmationMessage",
      "Explanation: {0}\n\nGoal: {1}\n\nReason for allowing unrestricted network access in the sandbox: {2}",
      explanation,
      goal,
      requestAllowNetworkReason || localize("runInTerminal.allowNetwork.confirmationMessage.defaultReason", "The model indicated that this sandboxed command needs unrestricted network access.")
    )) : new MarkdownString(localize("runInTerminal.confirmationMessage", "Explanation: {0}\n\nGoal: {1}", explanation, goal));
    const confirmationMessages = shouldShowConfirmation ? {
      title: confirmationTitle,
      message: confirmationMessage,
      disclaimer,
      allowAutoConfirm: void 0,
      terminalCustomActions: customActions
    } : void 0;
    const rawDisplayCommand = toolSpecificData.commandLine.forDisplay ?? toolSpecificData.commandLine.toolEdited ?? toolSpecificData.commandLine.original;
    const displayCommand = rawDisplayCommand.length > 80 ? rawDisplayCommand.substring(0, 77) + "..." : rawDisplayCommand;
    const invocationMessage = toolSpecificData.commandLine.isSandboxWrapped ? new MarkdownString(localize("runInTerminal.invocation.sandbox", "Running `{0}` in sandbox", escapeMarkdownSyntaxTokens(displayCommand))) : new MarkdownString(localize("runInTerminal.invocation", "Running `{0}`", escapeMarkdownSyntaxTokens(displayCommand)));
    return {
      invocationMessage,
      icon: toolSpecificData.commandLine.isSandboxWrapped ? Codicon.terminalSecure : Codicon.terminal,
      confirmationMessages: sandboxPrerequisiteConfirmation ?? confirmationMessages,
      toolSpecificData
    };
  }
  _formatBlockedDomainsForTitle(blockedDomains) {
    if (blockedDomains.length === 1) {
      return `\`${blockedDomains[0]}\``;
    }
    return localize("runInTerminal.unsandboxed.domain.summary", "`{0}` and {1} more domains", blockedDomains[0], blockedDomains.length - 1);
  }
  _getBlockedDomainReason(blockedDomains, deniedDomains = []) {
    if (deniedDomains.length === blockedDomains.length && deniedDomains.length > 0) {
      if (blockedDomains.length === 1) {
        return localize("runInTerminal.unsandboxed.domain.reason.denied.single", "This command accesses {0}, which is blocked by chat.agent.deniedNetworkDomains.", blockedDomains[0]);
      }
      return localize("runInTerminal.unsandboxed.domain.reason.denied.multi", "This command accesses {0} and {1} more domains that are blocked by chat.agent.deniedNetworkDomains.", blockedDomains[0], blockedDomains.length - 1);
    }
    if (deniedDomains.length > 0) {
      if (blockedDomains.length === 1) {
        return localize("runInTerminal.unsandboxed.domain.reason.mixed.single", "This command accesses {0}, which is blocked by chat.agent.deniedNetworkDomains or not added to chat.agent.allowedNetworkDomains.", blockedDomains[0]);
      }
      return localize("runInTerminal.unsandboxed.domain.reason.mixed.multi", "This command accesses {0} and {1} more domains that are blocked by chat.agent.deniedNetworkDomains or not added to chat.agent.allowedNetworkDomains.", blockedDomains[0], blockedDomains.length - 1);
    }
    if (blockedDomains.length === 1) {
      return localize("runInTerminal.unsandboxed.domain.reason.single", "This command accesses {0}, which is not permitted by the current chat.agent.sandbox configuration.", blockedDomains[0]);
    }
    return localize("runInTerminal.unsandboxed.domain.reason.multi", "This command accesses {0} and {1} more domains that are not permitted by the current chat.agent.sandbox configuration.", blockedDomains[0], blockedDomains.length - 1);
  }
  async _rewriteCommandLine(commandLine, options) {
    let rewrittenCommand = commandLine;
    let forDisplayCommand = void 0;
    let isSandboxWrapped = false;
    let requiresUnsandboxConfirmation = options.requestUnsandboxedExecution;
    let requestUnsandboxedExecutionReason = options.requestUnsandboxedExecution ? options.requestUnsandboxedExecutionReason : void 0;
    let requiresAllowNetworkConfirmation = false;
    let requestAllowNetworkReason = options.requestAllowNetwork ? options.requestAllowNetworkReason : void 0;
    let blockedDomains;
    for (const rewriter of this._commandLineRewriters) {
      const rewriteResult = await rewriter.rewrite({
        commandLine: rewrittenCommand,
        cwd: options.cwd,
        shell: options.shell,
        os: options.os,
        isBackground: options.isBackground,
        requestUnsandboxedExecution: requiresUnsandboxConfirmation,
        requestAllowNetwork: options.requestAllowNetwork,
        sandboxPrecheckInputs: options.sandboxPrecheckInputs
      });
      if (rewriteResult) {
        rewrittenCommand = rewriteResult.rewritten;
        forDisplayCommand = forDisplayCommand ?? rewriteResult.forDisplay;
        if (rewriteResult.isSandboxWrapped) {
          isSandboxWrapped = true;
        } else if (rewriteResult.isSandboxWrapped === false) {
          isSandboxWrapped = false;
        }
        if (rewriteResult.requiresUnsandboxConfirmation) {
          requiresUnsandboxConfirmation = true;
        }
        if (rewriteResult.requiresAllowNetworkConfirmation) {
          requiresAllowNetworkConfirmation = true;
        }
        if (rewriteResult.blockedDomains?.length) {
          blockedDomains = rewriteResult.blockedDomains;
          const blockedDomainReason = this._getBlockedDomainReason(rewriteResult.blockedDomains, rewriteResult.deniedDomains);
          if (rewriteResult.requiresAllowNetworkConfirmation) {
            requestAllowNetworkReason = blockedDomainReason;
          } else {
            requestUnsandboxedExecutionReason = blockedDomainReason;
          }
        }
        this._logService.info(`RunInTerminalTool: Command rewritten by ${rewriter.constructor.name}: ${rewriteResult.reasoning}`);
      }
    }
    return {
      rewrittenCommand,
      forDisplayCommand,
      isSandboxWrapped,
      requiresUnsandboxConfirmation,
      requestUnsandboxedExecutionReason,
      requiresAllowNetworkConfirmation,
      requestAllowNetworkReason: requiresAllowNetworkConfirmation ? requestAllowNetworkReason : void 0,
      blockedDomains
    };
  }
  _getSandboxPrecheckInputs(chatSessionResource, chatRequestId) {
    return getSandboxPrecheckInputsForToolInvocation(chatSessionResource, chatRequestId, this._chatWidgetService, this._chatService);
  }
  async _confirmAutomaticSandboxRetry(retryKind, sessionResource, command, shell, blockedDomains, riskAssessment, token) {
    const chatModel = sessionResource && this._chatService.getSession(sessionResource);
    if (!(chatModel instanceof ChatModel)) {
      return false;
    }
    if (sessionResource && isSessionAutoApproveLevel(sessionResource, this._configurationService, this._chatWidgetService, this._chatService)) {
      return true;
    }
    const request = chatModel.getRequests().at(-1);
    if (!request) {
      return false;
    }
    let shellType = basename(shell, ".exe");
    if (shellType === "powershell") {
      shellType = "pwsh";
    }
    const store = new DisposableStore();
    return new Promise((resolve) => {
      let resolved = false;
      const resolveOnce = (value) => {
        if (resolved) {
          return;
        }
        resolved = true;
        store.dispose();
        resolve(value);
      };
      const confirmationMessage = retryKind === "allowNetwork" ? new MarkdownString(localize(
        "runInTerminal.allowNetwork.autoRetry.confirmationMessage",
        "`{0}`",
        escapeMarkdownSyntaxTokens(buildCommandDisplayText(command))
      )) : new MarkdownString(localize(
        "runInTerminal.unsandboxed.autoRetry.confirmationMessage",
        "`{0}`",
        escapeMarkdownSyntaxTokens(buildCommandDisplayText(command))
      ));
      const part = new ChatElicitationRequestPart(
        this._getAutomaticSandboxRetryTitle(retryKind, shellType, blockedDomains),
        confirmationMessage,
        "",
        localize("allow", "Allow"),
        localize("skip", "Skip"),
        async () => {
          resolveOnce(true);
          part.hide();
          return ElicitationState.Accepted;
        },
        async () => {
          resolveOnce(false);
          part.hide();
          return ElicitationState.Rejected;
        },
        void 0,
        void 0,
        () => resolveOnce(false),
        riskAssessment
      );
      chatModel.acceptResponseProgress(request, part);
      store.add(token.onCancellationRequested(() => resolveOnce(false)));
      store.add({ dispose: () => part.hide() });
    });
  }
  _getAutomaticSandboxRetryTitle(retryKind, shellType, blockedDomains) {
    if (retryKind === "allowNetwork") {
      return blockedDomains?.length ? new MarkdownString(localize("runInTerminal.allowNetwork.autoRetry.domain", "Retry `{0}` command in the sandbox by allowing network access to {1}?", shellType, this._formatBlockedDomainsForTitle(blockedDomains))) : new MarkdownString(localize("runInTerminal.allowNetwork.autoRetry", "Retry `{0}` command in the sandbox by allowing network access?", shellType));
    }
    return blockedDomains?.length ? new MarkdownString(localize("runInTerminal.unsandboxed.autoRetry.domain", "Run `{0}` command outside the sandbox to access {1}?", shellType, this._formatBlockedDomainsForTitle(blockedDomains))) : new MarkdownString(localize("runInTerminal.unsandboxed.autoRetry", "Run `{0}` command outside the sandbox?", shellType));
  }
  /**
   * Surface a confirmation dialog when the terminal is detected to be waiting
   * for sensitive input (password, passphrase, OTP, …). Sensitive prompts must
   * never be routed through the model — the user types the secret directly
   * into the terminal. The "Focus terminal" action reveals and focuses the
   * terminal; the "Cancel" action cancels the running command.
   *
   * Returns a disposable that hides any pending elicitation. The handler
   * itself dedupes concurrent elicitations so repeated polling cycles don't
   * spam the chat session.
   */
  _registerSensitiveInputElicitation(chatSessionResource, terminalInstance, outputMonitor, cancelExecution, onAutoCancelled) {
    const store = new DisposableStore();
    let pending;
    let autoCancelled = false;
    store.add(outputMonitor.onDidDetectSensitiveInputNeeded(() => {
      if (pending || autoCancelled) {
        return;
      }
      const isAutoApproved = chatSessionResource && isSessionAutoApproveLevel(chatSessionResource, this._configurationService, this._chatWidgetService, this._chatService);
      const chatModel = chatSessionResource && this._chatService.getSession(chatSessionResource);
      if (isAutoApproved) {
        autoCancelled = true;
        if (chatModel instanceof ChatModel) {
          const request2 = chatModel.getRequests().at(-1);
          if (request2) {
            const infoPart = new ChatElicitationRequestPart(
              new MarkdownString(localize("runInTerminal.sensitiveInput.autoCancelTitle", "Terminal command cancelled \u2014 sensitive input required")),
              new MarkdownString(localize("runInTerminal.sensitiveInput.autoCancelMessage", "The terminal command was prompting for a password or other secret. Auto-approve / autopilot mode cannot safely supply secrets, so the command was cancelled. Run the command interactively if you want to provide the secret.")),
              "",
              localize("runInTerminal.sensitiveInput.dismiss", "Dismiss"),
              "",
              async () => {
                infoPart.hide();
                return ElicitationState.Accepted;
              },
              async () => {
                infoPart.hide();
                return ElicitationState.Rejected;
              },
              void 0,
              void 0,
              void 0,
              void 0
            );
            chatModel.acceptResponseProgress(request2, infoPart);
          }
        }
        onAutoCancelled?.();
        cancelExecution();
        return;
      }
      if (!(chatModel instanceof ChatModel)) {
        this._terminalService.setActiveInstance(terminalInstance);
        this._terminalService.revealTerminal(terminalInstance, true).catch(() => {
        });
        terminalInstance.focus();
        return;
      }
      const request = chatModel.getRequests().at(-1);
      if (!request) {
        return;
      }
      const part = new ChatElicitationRequestPart(
        new MarkdownString(localize("runInTerminal.sensitiveInput.title", "Terminal is waiting for sensitive input")),
        new MarkdownString(localize("runInTerminal.sensitiveInput.message", "The terminal command appears to be prompting for a password or other sensitive value. Focus the terminal to type it directly \u2014 secrets must not be sent through chat.")),
        "",
        localize("runInTerminal.sensitiveInput.focus", "Focus Terminal"),
        localize("runInTerminal.sensitiveInput.cancel", "Cancel Command"),
        async () => {
          pending = void 0;
          part.hide();
          try {
            this._terminalService.setActiveInstance(terminalInstance);
            await this._terminalService.revealTerminal(terminalInstance, true);
            terminalInstance.focus();
          } catch (err) {
            this._logService.warn(`RunInTerminalTool: failed to reveal terminal for sensitive input`, err);
          }
          return ElicitationState.Accepted;
        },
        async () => {
          pending = void 0;
          part.hide();
          cancelExecution();
          return ElicitationState.Rejected;
        },
        void 0,
        void 0,
        () => {
          pending = void 0;
        },
        void 0
      );
      pending = part;
      chatModel.acceptResponseProgress(request, part);
    }));
    return store;
  }
  _acceptAutomaticSandboxRetryToolInvocationUpdate(retryKind, sessionResource, toolCallId, toolSpecificData, isComplete, toolResultMessage) {
    const chatModel = sessionResource && this._chatService.getSession(sessionResource);
    if (!(chatModel instanceof ChatModel)) {
      return;
    }
    const request = chatModel.getRequests().at(-1);
    if (!request) {
      return;
    }
    const displayCommand = buildCommandDisplayText(toolSpecificData.commandLine.forDisplay ?? toolSpecificData.commandLine.toolEdited ?? toolSpecificData.commandLine.original);
    const progress = {
      kind: "externalToolInvocationUpdate",
      toolCallId,
      toolName: localize("runInTerminalTool.displayName", "Run in Terminal"),
      isComplete,
      invocationMessage: retryKind === "allowNetwork" ? new MarkdownString(localize("runInTerminal.allowNetwork.autoRetry.invocation", "Running `{0}` in the sandbox with unrestricted network access", escapeMarkdownSyntaxTokens(displayCommand))) : new MarkdownString(localize("runInTerminal.unsandboxed.autoRetry.invocation", "Running `{0}` outside the sandbox", escapeMarkdownSyntaxTokens(displayCommand))),
      pastTenseMessage: toolResultMessage,
      toolSpecificData
    };
    chatModel.acceptResponseProgress(request, progress);
  }
  async _runAutomaticSandboxRetry(options) {
    const requestAllowNetwork = options.retryKind === "allowNetwork";
    const requestUnsandboxedExecution = options.retryKind === "unsandboxed" && options.allowUnsandboxedCommands;
    const [os, shell] = await Promise.all([
      this._osBackend,
      this._profileFetcher.getCopilotShell()
    ]);
    const retryRewriteResult = await this._rewriteCommandLine(options.args.command, {
      cwd: options.toolSpecificData.cwd ? URI.revive(options.toolSpecificData.cwd) : void 0,
      shell,
      os,
      isBackground: options.isBackground,
      requestUnsandboxedExecution,
      requestUnsandboxedExecutionReason: requestUnsandboxedExecution ? options.retryReason : void 0,
      requestAllowNetwork,
      requestAllowNetworkReason: requestAllowNetwork ? options.retryReason : void 0
    });
    const rewrittenRetryReason = (requestAllowNetwork ? retryRewriteResult.requestAllowNetworkReason : retryRewriteResult.requestUnsandboxedExecutionReason) ?? options.retryReason;
    const retryParameters = {
      ...options.args,
      command: options.args.command,
      allowToRunUnsandboxedCommands: options.allowUnsandboxedCommands,
      requestUnsandboxedExecution,
      requestUnsandboxedExecutionReason: requestUnsandboxedExecution ? rewrittenRetryReason : void 0,
      requestAllowNetwork,
      requestAllowNetworkReason: requestAllowNetwork ? rewrittenRetryReason : void 0
    };
    const retryRiskAssessment = {
      toolId: TerminalToolId.RunInTerminal,
      parameters: {
        ...retryParameters,
        command: retryRewriteResult.rewrittenCommand
      }
    };
    const retryConfirmationCommand = options.toolSpecificData.presentationOverrides?.commandLine ?? options.command;
    const shouldRetry = await this._confirmAutomaticSandboxRetry(options.retryKind, options.invocation.context?.sessionResource, retryConfirmationCommand, shell, retryRewriteResult.blockedDomains, retryRiskAssessment, options.token);
    if (!shouldRetry) {
      return void 0;
    }
    const retryToolSpecificData = {
      ...options.toolSpecificData,
      terminalCommandId: `tool-${generateUuid()}`,
      commandLine: {
        original: options.args.command,
        toolEdited: retryRewriteResult.rewrittenCommand === options.args.command ? void 0 : retryRewriteResult.rewrittenCommand,
        forDisplay: retryRewriteResult.forDisplayCommand ?? normalizeTerminalCommandForDisplay(retryRewriteResult.rewrittenCommand ?? options.args.command),
        isSandboxWrapped: retryRewriteResult.isSandboxWrapped
      },
      requestUnsandboxedExecution: requestUnsandboxedExecution || (requestAllowNetwork ? false : void 0),
      requestUnsandboxedExecutionReason: requestUnsandboxedExecution ? rewrittenRetryReason : void 0,
      requestAllowNetwork: requestAllowNetwork || void 0,
      requestAllowNetworkReason: requestAllowNetwork ? rewrittenRetryReason : void 0,
      terminalCommandUri: void 0,
      terminalCommandOutput: void 0,
      terminalTheme: void 0,
      terminalCommandState: void 0,
      didContinueInBackground: void 0
    };
    const retryToolCallId = `automatic-${options.retryKind === "allowNetwork" ? "allow-network" : "unsandbox"}-retry-${generateUuid()}`;
    this._acceptAutomaticSandboxRetryToolInvocationUpdate(options.retryKind, options.invocation.context?.sessionResource, retryToolCallId, retryToolSpecificData, false);
    return await this.invoke({
      ...options.invocation,
      parameters: retryParameters,
      toolSpecificData: retryToolSpecificData
    }, options.countTokens, options.progress, options.token);
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const toolSpecificData = invocation.toolSpecificData;
    if (!toolSpecificData) {
      throw new Error("toolSpecificData must be provided for this tool");
    }
    if (!invocation.context) {
      throw new Error("Invocation context must be provided for this tool");
    }
    const commandId = toolSpecificData.terminalCommandId;
    if (toolSpecificData.alternativeRecommendation) {
      return {
        content: [{
          kind: "text",
          value: toolSpecificData.alternativeRecommendation
        }]
      };
    }
    const args = invocation.parameters;
    const allowUnsandboxedCommands = this._getAllowToRunUnsandboxedCommands(args);
    const sandboxPrecheckInputs = this._getSandboxPrecheckInputs(invocation.context.sessionResource, invocation.chatRequestId);
    const isSandboxEnabled = await this._terminalSandboxService.isEnabled(sandboxPrecheckInputs);
    if (this._shouldRejectUnsandboxedExecutionRequest(isSandboxEnabled, allowUnsandboxedCommands, args)) {
      const message = this._getUnsandboxedExecutionDisabledMessage();
      return {
        toolResultError: message,
        toolResultDetails: {
          input: args.command,
          output: [{ type: "embed", isText: true, value: message }],
          isError: true
        },
        content: [{
          kind: "text",
          value: message
        }]
      };
    }
    const sandboxPrerequisiteTerminalOptions = {
      createTerminal: async () => this._terminalService.createTerminal({}),
      focusTerminal: async (terminal) => {
        this._terminalService.setActiveInstance(terminal);
        await this._terminalService.revealTerminal(terminal, true);
        terminal.focus();
      }
    };
    if (toolSpecificData.sandboxPrerequisiteFailure) {
      return {
        content: [{ kind: "text", value: toolSpecificData.sandboxPrerequisiteFailure }]
      };
    }
    const isSandboxAllowNetworkEnabled = isSandboxEnabled && await this._terminalSandboxService.isSandboxAllowNetworkEnabled();
    if (this._shouldRejectAllowNetworkRequest(isSandboxEnabled, isSandboxAllowNetworkEnabled, args)) {
      const message = this._getAllowNetworkRequestDisabledMessage();
      return {
        toolResultError: message,
        toolResultDetails: {
          input: args.command,
          output: [{ type: "embed", isText: true, value: message }],
          isError: true
        },
        content: [{
          kind: "text",
          value: message
        }]
      };
    }
    if (toolSpecificData.missingSandboxDependencies?.length) {
      if (invocation.selectedCustomButton === "install") {
        const sessionResource = invocation.context.sessionResource;
        const { exitCode: exitCode2 } = await this._terminalSandboxService.installMissingSandboxDependencies(toolSpecificData.missingSandboxDependencies, sessionResource, token, sandboxPrerequisiteTerminalOptions);
        if (exitCode2 !== void 0 && exitCode2 !== 0) {
          return {
            content: [{
              kind: "text",
              value: localize(
                "runInTerminal.missingDeps.failed",
                "Sandbox dependency installation failed (exit code {0}). The command was not executed.",
                exitCode2
              )
            }]
          };
        }
        if (exitCode2 === void 0) {
          return {
            content: [{
              kind: "text",
              value: localize(
                "runInTerminal.missingDeps.unknown",
                "Could not determine whether sandbox dependency installation succeeded. The command was not executed."
              )
            }]
          };
        }
        const refreshedPrereqs = await this._terminalSandboxService.checkForSandboxingPrereqs(true, sandboxPrecheckInputs);
        if (refreshedPrereqs.failedCheck !== void 0) {
          return {
            content: [{
              kind: "text",
              value: refreshedPrereqs.failedCheck === TerminalSandboxPrerequisiteCheck.Bubblewrap && refreshedPrereqs.remediations?.length ? localize("runInTerminal.missingDeps.bubblewrapFailed", "Sandbox dependencies were installed, but bubblewrap cannot create the required sandbox namespace. Run the command again to choose an available repair option.") : refreshedPrereqs.failedCheck === TerminalSandboxPrerequisiteCheck.Bubblewrap ? localize("runInTerminal.missingDeps.bubblewrapFailedNoRepair", "Sandbox dependencies were installed, but bubblewrap cannot create the required sandbox namespace on this system. The command was not executed.") : localize("runInTerminal.missingDeps.recheckFailed", "Sandbox prerequisites are still not satisfied after installation. The command was not executed.")
            }]
          };
        }
        this._logService.info("RunInTerminalTool: Sandbox dependency installation succeeded");
        return {
          content: [{
            kind: "text",
            value: localize(
              "runInTerminal.missingDeps.installed",
              "Sandbox dependencies were installed successfully. If the issue persists, reload the window and try running the command again."
            )
          }]
        };
      } else {
        this._logService.info("RunInTerminalTool: User cancelled sandbox dependency installation");
        return {
          content: [{
            kind: "text",
            value: localize(
              "runInTerminal.missingDeps.cancelled",
              "Sandbox dependency installation was cancelled by the user."
            )
          }]
        };
      }
    }
    if (toolSpecificData.sandboxRemediations?.length) {
      const selectedRemediation = toolSpecificData.sandboxRemediations[0];
      const { exitCode: exitCode2 } = await this._terminalSandboxService.runSandboxRemediation(selectedRemediation, invocation.context.sessionResource, token, sandboxPrerequisiteTerminalOptions);
      if (exitCode2 !== 0) {
        return this._getBubblewrapUnsupportedResult();
      }
      const refreshedPrereqs = await this._terminalSandboxService.checkForSandboxingPrereqs(true, sandboxPrecheckInputs);
      if (refreshedPrereqs.failedCheck !== void 0) {
        return this._getBubblewrapUnsupportedResult();
      }
      this._logService.info("RunInTerminalTool: Bubblewrap remediation and capability recheck succeeded, proceeding with command execution");
    }
    const executionOptions = this._resolveExecutionOptions(args);
    this._logService.debug(`RunInTerminalTool: Invoking with options ${JSON.stringify(args)}`);
    let toolResultMessage;
    if (args.timeout !== void 0 && (Number.isNaN(args.timeout) || args.timeout < 0)) {
      return {
        content: [{
          kind: "text",
          value: "Error: timeout must be a non-negative number of milliseconds (use 0 for no timeout)."
        }]
      };
    }
    if (executionOptions.mode === "sync" && args.timeout === void 0) {
      args.timeout = 0;
    }
    const chatSessionResource = invocation.context.sessionResource;
    const shouldSendNotifications = !invocation.subAgentInvocationId;
    const command = toolSpecificData.commandLine.userEdited ?? toolSpecificData.commandLine.toolEdited ?? toolSpecificData.commandLine.original;
    const didUserEditCommand = toolSpecificData.commandLine.userEdited !== void 0 && toolSpecificData.commandLine.userEdited !== toolSpecificData.commandLine.original;
    const didToolEditCommand = !didUserEditCommand && toolSpecificData.commandLine.toolEdited !== void 0 && toolSpecificData.commandLine.toolEdited !== toolSpecificData.commandLine.original && // Only consider it a meaningful edit if the display form also differs from the
    // original. Cosmetic rewrites like prepending a space to prevent shell history
    // should not trigger the "tool simplified the command" note.
    normalizeTerminalCommandForDisplay(toolSpecificData.commandLine.toolEdited).trim() !== normalizeTerminalCommandForDisplay(toolSpecificData.commandLine.original).trim();
    const didSandboxWrapCommand = toolSpecificData.commandLine.isSandboxWrapped === true;
    const commandLineForMetadata = isSandboxEnabled ? toolSpecificData.commandLine.forDisplay ?? toolSpecificData.commandLine.original : void 0;
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    if (didSandboxWrapCommand) {
      const deniedAccess = await this._getDeniedSandboxFileAccess(args.requestFileValidationCheck, sandboxPrecheckInputs);
      if (deniedAccess.length > 0) {
        const message = this._buildSandboxFileAccessDeniedMessage(deniedAccess);
        return {
          toolResultError: message,
          toolResultDetails: {
            input: args.command,
            output: [{ type: "embed", isText: true, value: message }],
            isError: true
          },
          content: [{
            kind: "text",
            value: message
          }]
        };
      }
    }
    let error;
    const automaticUnsandboxRetryReason = localize("runInTerminal.unsandboxed.autoRetry.reason", "The sandboxed execution output indicated the sandbox blocked the command.");
    const automaticAllowNetworkRetryReason = localize("runInTerminal.allowNetwork.autoRetry.reason", "The sandboxed execution output indicated the sandbox blocked required network access.");
    const isNewSession = !executionOptions.persistentSession && !this._sessionTerminalAssociations.has(chatSessionResource);
    const timingStart = Date.now();
    const termId = generateUuid();
    const terminalToolSessionId = toolSpecificData.terminalToolSessionId;
    const store = new DisposableStore();
    this._logService.debug(`RunInTerminalTool: Creating ${executionOptions.persistentSession ? "background" : "foreground"} terminal. termId=${termId}, chatSessionResource=${chatSessionResource}`);
    const toolTerminal = await this._initTerminal(chatSessionResource, termId, terminalToolSessionId, executionOptions.persistentSession, token);
    this._handleTerminalVisibility(toolTerminal, chatSessionResource);
    const timingConnectMs = Date.now() - timingStart;
    const xterm = await toolTerminal.instance.xtermReadyPromise;
    if (!xterm) {
      throw new Error("Instance was disposed before xterm.js was ready");
    }
    const commandDetection = toolTerminal.instance.capabilities.get(TerminalCapability.CommandDetection);
    let inputUserChars = 0;
    let inputUserSigint = false;
    store.add(xterm.raw.onData((data) => {
      if (!telemetryIgnoredSequences.includes(data)) {
        inputUserChars += data.length;
      }
      inputUserSigint ||= data === "";
    }));
    let terminalResult = "";
    let outputLineCount = -1;
    let exitCode;
    let altBufferResult;
    let didTimeout = false;
    let didIdleSilence = false;
    let didInputNeeded = false;
    let didSensitiveAutoCancelled = false;
    let isBackgroundExecution = executionOptions.persistentSession;
    let timeoutPromise;
    let timeoutRacePromise;
    let outputMonitor;
    let pollingResult;
    const executeCancellation = store.add(new CancellationTokenSource(token));
    const timeoutValue = args.timeout !== void 0 ? clamp(args.timeout, 0, Number.MAX_SAFE_INTEGER) : void 0;
    if (timeoutValue !== void 0 && timeoutValue > 0) {
      const shouldEnforceTimeout = executionOptions.waitStrategy === "idle" || this._configurationService.getValue(TerminalChatAgentToolsSettingId.EnforceTimeoutFromModel) === true;
      if (shouldEnforceTimeout) {
        timeoutPromise = timeout(timeoutValue);
        timeoutRacePromise = timeoutPromise.then(
          () => ({ type: "timeout" })
        ).catch(() => ({ type: "timeout" }));
      }
    }
    let continueInBackgroundResolve;
    const continueInBackgroundPromise = new Promise((resolve) => {
      continueInBackgroundResolve = resolve;
    });
    if (terminalToolSessionId) {
      store.add(this._terminalChatService.onDidContinueInBackground((sessionId) => {
        if (sessionId === terminalToolSessionId) {
          const execution = RunInTerminalTool._activeExecutions.get(termId);
          execution?.setBackground?.();
          isBackgroundExecution = true;
          continueInBackgroundResolve?.();
        }
      }));
    }
    let executionPromise;
    try {
      const execution = this._instantiationService.createInstance(
        ActiveTerminalExecution,
        chatSessionResource,
        termId,
        toolTerminal,
        commandDetection,
        executionOptions.persistentSession
      );
      this._logService.info(`RunInTerminalTool: Using \`${execution.strategy.type}\` execute strategy for command \`${command}\``);
      store.add(execution);
      this._setActiveExecution(termId, execution);
      const startMarkerPromise = Event.toPromise(execution.strategy.onDidCreateStartMarker);
      const outputMonitorPollFn = executionOptions.persistentSession ? async (executionForPoll) => ({
        output: executionForPoll.getOutput(),
        state: OutputMonitorState.Idle
      }) : void 0;
      store.add(execution.strategy.onDidCreateStartMarker((startMarker) => {
        if (!outputMonitor) {
          outputMonitor = this._instantiationService.createInstance(
            OutputMonitor,
            {
              instance: toolTerminal.instance,
              sessionResource: chatSessionResource,
              getOutput: (marker) => execution.getOutput(marker ?? startMarker)
            },
            outputMonitorPollFn,
            invocation.context,
            token,
            command
          );
        }
      }));
      executionPromise = execution.start(command, executeCancellation.token, commandId, commandLineForMetadata);
      if (executionOptions.waitStrategy === "idle") {
        this._logService.debug(`RunInTerminalTool: Starting persistent execution with idle wait strategy \`${command}\``);
        await startMarkerPromise;
        let idleTimedOut = false;
        if (outputMonitor) {
          if (timeoutRacePromise) {
            const idleRace = await Promise.race([
              Event.toPromise(outputMonitor.onDidFinishCommand).then(() => ({ type: "idle" })),
              timeoutRacePromise
            ]);
            if (idleRace.type === "timeout") {
              idleTimedOut = true;
              this._logService.debug(`RunInTerminalTool: Timeout reached waiting for idle signal, returning output collected so far`);
            } else {
              pollingResult = outputMonitor.pollingResult;
            }
          } else {
            await Event.toPromise(outputMonitor.onDidFinishCommand);
            pollingResult = outputMonitor.pollingResult;
          }
        }
        await this._commandArtifactCollector.capture(toolSpecificData, toolTerminal.instance, commandId);
        if (token.isCancellationRequested) {
          throw new CancellationError();
        }
        const state = toolSpecificData.terminalCommandState ?? {};
        state.timestamp = state.timestamp ?? timingStart;
        toolSpecificData.terminalCommandState = state;
        let resultText2 = didSandboxWrapCommand ? `Command is now running in terminal with ID=${termId}` : didUserEditCommand ? `Note: The user manually edited the command to \`${command}\`, and that command is now running in terminal with ID=${termId}` : didToolEditCommand ? `Note: The tool simplified the command to \`${command}\`, and that command is now running in terminal with ID=${termId}` : `Command is running in terminal with ID=${termId}`;
        const backgroundOutput = pollingResult?.output ?? (idleTimedOut ? execution.getOutput() : void 0);
        const outputAnalyzerMessage2 = backgroundOutput ? await this._getOutputAnalyzerMessage(void 0, backgroundOutput, command, didSandboxWrapCommand) : void 0;
        if (idleTimedOut) {
          resultText2 += `
 Timed out waiting for the command to become idle. The command is still running, with output:
`;
          if (outputAnalyzerMessage2) {
            resultText2 += `${outputAnalyzerMessage2}
`;
          }
          resultText2 += backgroundOutput ?? "";
        } else if (pollingResult && pollingResult.state === OutputMonitorState.Idle) {
          resultText2 += `
 The command became idle with output:
`;
          if (outputAnalyzerMessage2) {
            resultText2 += `${outputAnalyzerMessage2}
`;
          }
          resultText2 += pollingResult.output;
          resultText2 += `
${this._buildInputNeededSteeringText(chatSessionResource, termId, "none")}`;
        } else if (pollingResult) {
          resultText2 += `
 The command is still running, with output:
`;
          if (outputAnalyzerMessage2) {
            resultText2 += `${outputAnalyzerMessage2}
`;
          }
          resultText2 += pollingResult.output;
        }
        const endCwd2 = await toolTerminal.instance.getCwdResource();
        return {
          toolMetadata: {
            exitCode: void 0,
            id: termId,
            terminalId: toolTerminal.instance.instanceId,
            cwd: endCwd2?.toString()
          },
          content: [{
            kind: "text",
            value: resultText2
          }]
        };
      } else {
        const raceCleanup = new DisposableStore();
        startMarkerPromise.then(() => {
          if (outputMonitor && !raceCleanup.isDisposed) {
            raceCleanup.add(this._registerSensitiveInputElicitation(
              chatSessionResource,
              toolTerminal.instance,
              outputMonitor,
              () => executeCancellation.cancel(),
              () => {
                didSensitiveAutoCancelled = true;
              }
            ));
          }
        });
        const raceCandidates = [
          executionPromise.then((result) => ({ type: "completed", result })),
          continueInBackgroundPromise.then(() => ({ type: "background" })),
          new Promise((resolve) => {
            startMarkerPromise.then(() => {
              if (outputMonitor && !raceCleanup.isDisposed) {
                raceCleanup.add(outputMonitor.onDidDetectInputNeeded(() => resolve({ type: "inputNeeded" })));
              }
            });
          })
        ];
        if (timeoutRacePromise) {
          raceCandidates.push(timeoutRacePromise);
        }
        const idleSilenceMs = this._configurationService.getValue(TerminalChatAgentToolsSettingId.IdleSilenceTimeoutMs) ?? DEFAULT_IDLE_SILENCE_TIMEOUT_MS;
        if (idleSilenceMs > 0) {
          const idleSilenceDeferred = new DeferredPromise();
          const idleSilenceScheduler = raceCleanup.add(new RunOnceScheduler(() => idleSilenceDeferred.complete({ type: "idleSilence" }), idleSilenceMs));
          raceCleanup.add(toolTerminal.instance.onData(() => idleSilenceScheduler.schedule()));
          idleSilenceScheduler.schedule();
          raceCandidates.push(idleSilenceDeferred.p);
        }
        let raceResult;
        try {
          raceResult = await Promise.race(raceCandidates);
        } finally {
          raceCleanup.dispose();
        }
        if (raceResult.type === "inputNeeded") {
          this._logService.debug(`RunInTerminalTool: Output monitor detected input needed in foreground terminal, returning output to agent`);
          error = "inputNeeded";
          didInputNeeded = true;
          const idleOutput = execution.getOutput();
          outputLineCount = idleOutput ? count(idleOutput.trim(), "\n") + 1 : 0;
          terminalResult = idleOutput ?? "";
        } else if (raceResult.type === "background") {
          this._logService.debug(`RunInTerminalTool: Continue in background triggered, returning output collected so far`);
          error = "continueInBackground";
          const backgroundOutput = execution.getOutput();
          outputLineCount = backgroundOutput ? count(backgroundOutput.trim(), "\n") + 1 : 0;
          terminalResult = backgroundOutput;
        } else if (raceResult.type === "timeout") {
          this._logService.debug(`RunInTerminalTool: Timeout reached, returning output collected so far`);
          error = "timeout";
          didTimeout = true;
          isBackgroundExecution = true;
          toolTerminal.isBackground = true;
          toolSpecificData.didContinueInBackground = true;
          this._sessionTerminalAssociations.delete(chatSessionResource);
          await this._associateProcessIdWithSession(toolTerminal.instance, chatSessionResource, termId, toolTerminal.shellIntegrationQuality, true);
          const timeoutOutput = execution.getOutput();
          outputLineCount = timeoutOutput ? count(timeoutOutput.trim(), "\n") + 1 : 0;
          terminalResult = timeoutOutput ?? "";
        } else if (raceResult.type === "idleSilence") {
          this._logService.debug(`RunInTerminalTool: Idle silence reached (${idleSilenceMs}ms), promoting to background`);
          error = "idleSilence";
          didIdleSilence = true;
          isBackgroundExecution = true;
          toolTerminal.isBackground = true;
          toolSpecificData.didContinueInBackground = true;
          this._sessionTerminalAssociations.delete(chatSessionResource);
          await this._associateProcessIdWithSession(toolTerminal.instance, chatSessionResource, termId, toolTerminal.shellIntegrationQuality, true);
          const idleSilenceOutput = execution.getOutput();
          outputLineCount = idleSilenceOutput ? count(idleSilenceOutput.trim(), "\n") + 1 : 0;
          terminalResult = idleSilenceOutput ?? "";
        } else {
          const executeResult = raceResult.result;
          toolTerminal.receivedUserInput = false;
          if (token.isCancellationRequested) {
            throw new CancellationError();
          }
          if (executeResult.didEnterAltBuffer) {
            const state = toolSpecificData.terminalCommandState ?? {};
            state.timestamp = state.timestamp ?? timingStart;
            toolSpecificData.terminalCommandState = state;
            toolResultMessage = altBufferMessage;
            outputLineCount = 0;
            error = executeResult.error ?? "alternateBuffer";
            const altBufferCwd = await toolTerminal.instance.getCwdResource();
            altBufferResult = {
              toolResultMessage,
              toolMetadata: {
                exitCode: void 0,
                id: termId,
                terminalId: toolTerminal.instance.instanceId,
                cwd: altBufferCwd?.toString()
              },
              content: [{
                kind: "text",
                value: altBufferMessage
              }]
            };
          } else {
            await this._commandArtifactCollector.capture(toolSpecificData, toolTerminal.instance, commandId);
            {
              const state = toolSpecificData.terminalCommandState ?? {};
              state.timestamp = state.timestamp ?? timingStart;
              if (executeResult.exitCode !== void 0) {
                state.exitCode = executeResult.exitCode;
                if (state.timestamp !== void 0) {
                  state.duration = state.duration ?? Math.max(0, Date.now() - state.timestamp);
                }
              }
              toolSpecificData.terminalCommandState = state;
            }
            this._logService.info(`RunInTerminalTool: Finished \`${execution.strategy.type}\` execute strategy with exitCode \`${executeResult.exitCode}\`, result.length \`${executeResult.output?.length}\`, error \`${executeResult.error}\``);
            outputLineCount = executeResult.output === void 0 ? 0 : count(executeResult.output.trim(), "\n") + 1;
            exitCode = executeResult.exitCode;
            error = executeResult.error;
            const resultArr = [];
            if (executeResult.output !== void 0) {
              resultArr.push(executeResult.output);
            }
            if (executeResult.additionalInformation) {
              resultArr.push(executeResult.additionalInformation);
            }
            terminalResult = resultArr.join("\n\n");
          }
        }
      }
    } catch (e) {
      if (didTimeout && e instanceof CancellationError) {
        this._logService.debug(`RunInTerminalTool: Timeout reached, returning output collected so far`);
        error = "timeout";
        isBackgroundExecution = true;
        toolTerminal.isBackground = true;
        toolSpecificData.didContinueInBackground = true;
        this._sessionTerminalAssociations.delete(chatSessionResource);
        const timeoutOutput = getOutput(toolTerminal.instance, void 0);
        outputLineCount = timeoutOutput ? count(timeoutOutput.trim(), "\n") + 1 : 0;
        terminalResult = timeoutOutput ?? "";
      } else {
        this._logService.debug(`RunInTerminalTool: Threw exception`);
        if (e instanceof CancellationError) {
          await this._commandArtifactCollector.capture(toolSpecificData, toolTerminal.instance, commandId);
          const state = toolSpecificData.terminalCommandState ?? {};
          if (state.exitCode === void 0) {
            state.exitCode = -1;
            state.timestamp = state.timestamp ?? timingStart;
            state.duration = state.duration ?? Math.max(0, Date.now() - state.timestamp);
          }
          toolSpecificData.terminalCommandState = state;
        }
        RunInTerminalTool._activeExecutions.get(termId)?.dispose();
        this._deleteActiveExecution(termId);
        toolTerminal.instance.dispose();
        error = e instanceof CancellationError ? "canceled" : "unexpectedException";
        throw e;
      }
    } finally {
      timeoutPromise?.cancel();
      if ((isBackgroundExecution || didInputNeeded) && executionPromise) {
        executionPromise.catch((e) => {
          if (!(e instanceof CancellationError)) {
            this._logService.error(`RunInTerminalTool: Background execution error`, e);
          }
        });
        if (shouldSendNotifications) {
          const alreadyNotifiedInputNeededOutput = didInputNeeded ? terminalResult : void 0;
          this._registerCompletionNotification(toolTerminal.instance, termId, chatSessionResource, command, toolSpecificData, outputMonitor, alreadyNotifiedInputNeededOutput);
        } else {
          outputMonitor?.dispose();
        }
      } else {
        RunInTerminalTool._activeExecutions.get(termId)?.dispose();
        this._deleteActiveExecution(termId);
        outputMonitor?.dispose();
      }
      store.dispose();
      const timingExecuteMs = Date.now() - timingStart;
      this._telemetry.logInvoke(toolTerminal.instance, {
        terminalToolSessionId: toolSpecificData.terminalToolSessionId,
        didUserEditCommand,
        didToolEditCommand,
        isBackground: executionOptions.persistentSession,
        isSandboxWrapped: toolSpecificData.commandLine.isSandboxWrapped === true,
        requestUnsandboxedExecutionReason: args.requestUnsandboxedExecutionReason,
        shellIntegrationQuality: toolTerminal.shellIntegrationQuality,
        error,
        isNewSession,
        outputLineCount,
        exitCode,
        timingExecuteMs,
        timingConnectMs,
        inputUserChars,
        inputUserSigint,
        terminalExecutionIdleBeforeTimeout: pollingResult?.state === OutputMonitorState.Idle,
        pollDurationMs: pollingResult?.pollDurationMs,
        inputToolManualAcceptCount: outputMonitor?.outputMonitorTelemetryCounters?.inputToolManualAcceptCount,
        inputToolManualRejectCount: outputMonitor?.outputMonitorTelemetryCounters?.inputToolManualRejectCount,
        inputToolManualChars: outputMonitor?.outputMonitorTelemetryCounters?.inputToolManualChars,
        inputToolAutoAcceptCount: outputMonitor?.outputMonitorTelemetryCounters?.inputToolAutoAcceptCount,
        inputToolAutoChars: outputMonitor?.outputMonitorTelemetryCounters?.inputToolAutoChars,
        inputToolManualShownCount: outputMonitor?.outputMonitorTelemetryCounters?.inputToolManualShownCount,
        inputToolFreeFormInputCount: outputMonitor?.outputMonitorTelemetryCounters?.inputToolFreeFormInputCount,
        inputToolFreeFormInputShownCount: outputMonitor?.outputMonitorTelemetryCounters?.inputToolFreeFormInputShownCount
      });
    }
    if (altBufferResult) {
      return altBufferResult;
    }
    if (didSandboxWrapCommand && outputLooksBubblewrapHostRestricted(terminalResult)) {
      return this._getBubblewrapHostRestrictedResult();
    }
    const shouldAutoRetryUnsandboxed = shouldAutomaticallyRetryUnsandboxed({
      allowUnsandboxedCommands,
      didSandboxWrapCommand,
      requestUnsandboxedExecution: args.requestUnsandboxedExecution === true,
      isPersistentSession: executionOptions.persistentSession,
      isBackgroundExecution: isBackgroundExecution || didInputNeeded,
      didTimeout,
      exitCode,
      output: terminalResult
    });
    const shouldAutoRetryAllowNetwork = shouldAutomaticallyRetryAllowNetworkInSandboxed({
      retryWithAllowNetworkRequests: isSandboxEnabled && !isSandboxAllowNetworkEnabled && this._retryWithAllowNetworkRequests,
      didSandboxWrapCommand,
      requestUnsandboxedExecution: args.requestUnsandboxedExecution === true,
      requestAllowNetwork: args.requestAllowNetwork === true,
      isPersistentSession: executionOptions.persistentSession,
      isBackgroundExecution: isBackgroundExecution || didInputNeeded,
      didTimeout,
      exitCode,
      output: terminalResult
    });
    const automaticSandboxRetry = shouldAutoRetryAllowNetwork ? { retryKind: "allowNetwork", retryReason: automaticAllowNetworkRetryReason } : shouldAutoRetryUnsandboxed ? { retryKind: "unsandboxed", retryReason: automaticUnsandboxRetryReason } : void 0;
    if (automaticSandboxRetry) {
      const retryResult = await this._runAutomaticSandboxRetry({
        ...automaticSandboxRetry,
        invocation,
        countTokens: _countTokens,
        progress: _progress,
        token,
        args,
        toolSpecificData,
        command,
        allowUnsandboxedCommands,
        isBackground: executionOptions.persistentSession
      });
      if (retryResult) {
        return retryResult;
      }
    }
    this._terminalToolCreator.refreshShellIntegrationQuality(toolTerminal);
    this._logService.info(`RunInTerminalTool: shellIntegrationQuality=${toolTerminal.shellIntegrationQuality} at banner decision time`);
    if (!toolResultMessage && toolTerminal.shellIntegrationQuality === ShellIntegrationQuality.None) {
      toolResultMessage = "$(info) Enable [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration) to improve command detection";
    }
    const resultText = [];
    if (!didSandboxWrapCommand) {
      if (didUserEditCommand) {
        resultText.push(`Note: The user manually edited the command to \`${command}\` (terminal ID=${termId}), and this is the output of running that command instead:
`);
      } else if (didToolEditCommand) {
        const wasDetachedToBackground = /(^|\s)nohup\s|Start-Process\b/.test(command);
        const stdinHint = wasDetachedToBackground ? ' Note that stdin is closed for detached background processes; do not try to send input via send_to_terminal \u2014 re-run with mode="sync" instead if interactive input is required.' : "";
        resultText.push(`Note: The tool simplified the command to \`${command}\` (terminal ID=${termId}).${stdinHint} This is the output of running that command instead:
`);
      }
      if (isBackgroundExecution && !executionOptions.persistentSession) {
        resultText.push(`Note: This terminal execution was moved to the background using the ID ${termId}
`);
      }
    }
    if (didSensitiveAutoCancelled) {
      resultText.push(`Note: The command in terminal ID ${termId} was prompting for a password, passphrase, or other secret. The user is unavailable (auto-approve / autopilot mode is on, so no human can focus the terminal to type a secret) and the command has been cancelled. Stop, do NOT retry the command, do NOT call ${TerminalToolId.SendToTerminal}, and do NOT call vscode_askQuestions for the secret. Tell the user to run the command interactively when they are available.

`);
    } else if (didInputNeeded) {
      resultText.push(`Note: The command is running in terminal ID ${termId} and may be waiting for input.
${this._buildInputNeededSteeringText(chatSessionResource, termId, "none")}

`);
    } else if (didTimeout && timeoutValue !== void 0 && timeoutValue > 0) {
      const notificationHint = shouldSendNotifications ? " You will be automatically notified on your next turn when it completes." : "";
      resultText.push(`Note: Command timed out after ${timeoutValue}ms. The command may still be running in terminal ID ${termId}.${notificationHint}
${this._buildInputNeededSteeringText(chatSessionResource, termId, "timeout")}

`);
    } else if (didIdleSilence) {
      const notificationHint = shouldSendNotifications ? " You will be automatically notified on your next turn when it completes." : "";
      resultText.push(`Note: The command produced no new output for an extended period and was moved to background terminal ID ${termId}; the process is still running and has not been killed.${notificationHint}
${this._buildInputNeededSteeringText(chatSessionResource, termId, "idleSilence")}

`);
    }
    const outputAnalyzerMessage = await this._getOutputAnalyzerMessage(exitCode, terminalResult, command, didSandboxWrapCommand);
    if (outputAnalyzerMessage) {
      resultText.push(`${outputAnalyzerMessage}
`);
    }
    let outputForResult = terminalResult;
    if (this._configurationService.getValue(TerminalChatAgentToolsSettingId.OutputCompaction) === true) {
      try {
        const commandForCompaction = toolSpecificData.commandLine.forDisplay ?? command;
        const report = compact(commandForCompaction, terminalResult);
        this._telemetry.logCompaction(report);
        if (report.applied) {
          outputForResult = report.compactedOutput;
        }
      } catch {
        this._telemetry.logCompactionFailed();
      }
    }
    const processedOutput = await this._largeOutputFileWriter.processOutput(outputForResult);
    resultText.push(processedOutput);
    const isError = exitCode !== void 0 && exitCode !== 0;
    const endCwd = await toolTerminal.instance.getCwdResource();
    const imageContent = await this._extractImagesFromOutput(terminalResult, endCwd);
    return {
      toolResultMessage,
      toolMetadata: {
        exitCode,
        id: termId,
        terminalId: toolTerminal.instance.instanceId,
        cwd: endCwd?.toString(),
        timedOut: didTimeout || void 0,
        timeoutMs: didTimeout ? timeoutValue : void 0,
        inputNeeded: didInputNeeded || void 0
      },
      toolResultDetails: isError ? {
        input: command,
        output: [{ type: "embed", isText: true, value: outputForResult }],
        isError: true
      } : void 0,
      content: [
        {
          kind: "text",
          value: resultText.join("")
        },
        ...imageContent
      ]
    };
  }
  _getBubblewrapUnsupportedResult() {
    const settingId = AgentSandboxSettingId.AgentSandboxEnabled;
    const message = localize(
      "runInTerminal.bubblewrap.unsupportedEnvironment",
      "Sandboxing is not supported in this environment. To disable sandboxing, set `{0}` to `off`. The command was not executed.",
      settingId
    );
    const settingsCommandArgs = encodeURIComponent(JSON.stringify([`@id:${settingId}`]));
    const toolResultMessage = new MarkdownString(localize(
      "runInTerminal.bubblewrap.unsupportedEnvironmentWithSettingsLink",
      'Sandboxing is not supported in this environment. [Open the `{0}` setting](command:workbench.action.openSettings?{1} "Open Settings") and set it to `off`. The command was not executed.',
      settingId,
      settingsCommandArgs
    ), { isTrusted: { enabledCommands: ["workbench.action.openSettings"] } });
    return {
      content: [{ kind: "text", value: message }],
      toolResultMessage
    };
  }
  _getBubblewrapHostRestrictedResult() {
    const settingId = AgentSandboxSettingId.AgentSandboxEnabled;
    const message = localize(
      "runInTerminal.bubblewrap.hostRestriction",
      "Sandbox creation failed due to host restrictions. Sandboxing can be disabled by setting `{0}` to `off`.",
      settingId
    );
    return {
      content: [{ kind: "text", value: message }],
      toolResultMessage: message
    };
  }
  /**
   * Builds the steering text the model sees when the terminal tool suspects
   * the command may be waiting for input. The heuristic that triggers this
   * note can false-positive on long-running compute commands or shells sitting
   * on a secondary prompt (e.g. heredoc continuation `> `), so the text
   * explicitly:
   *   1. Tells the model this note is NOT a signal to end the turn.
   *   2. In auto-approve mode, leads with `send_to_terminal` for non-secret
   *      prompts to minimize round-trips, with a `get_terminal_output` fallback.
   *   3. In default mode, leads with `get_terminal_output` as the safe
   *      recovery action and offers `vscode_askQuestions` only for real
   *      non-secret prompts. Secret prompts (passwords, passphrases,
   *      tokens) must never be routed through `vscode_askQuestions`
   *      because answers to that tool are sent through the model — the
   *      user is told to type those values directly into the terminal.
   * `kill_terminal` is only advertised when the command may be hung
   * (`'timeout'` or `'idleSilence'`) — suggesting it in the general case
   * leads the model to terminate valid interactive sessions (e.g.
   * `npm init`) instead of driving them.
   */
  _buildInputNeededSteeringText(chatSessionResource, termId, hungHint) {
    const isAutoApproved = isSessionAutoApproveLevel(chatSessionResource, this._configurationService, this._chatWidgetService, this._chatService);
    const lines = [];
    lines.push(`This note is not a signal to end the turn \u2014 pick one of the actions below and continue.`);
    if (isAutoApproved) {
      lines.push(`  1. If the output clearly ends with a non-secret input prompt (Continue? (y/n), Enter selection, etc. \u2014 a normal shell prompt like \`$\` or \`#\` does NOT count), determine the answer and immediately call ${TerminalToolId.SendToTerminal} with id="${termId}" (which returns the next few lines of output). Repeat one prompt at a time. Never guess passwords, passphrases, tokens, or other secrets \u2014 if the prompt requires a secret you do not have, inform the user and stop.`);
      lines.push(`  2. If the command may still be producing output or the shell prompt has not returned, call ${TerminalToolId.GetTerminalOutput} with id="${termId}" to continue polling.`);
    } else {
      lines.push(`  1. If the command may still be producing output or the shell prompt has not returned, call ${TerminalToolId.GetTerminalOutput} with id="${termId}" to continue polling. This is the default and safest action when unsure.`);
      lines.push(`  2. Only if the output clearly ends with a real non-secret input prompt (Continue? (y/n), Enter selection, etc. \u2014 a normal shell prompt like \`$\` or \`#\` does NOT count), call the vscode_askQuestions tool to ask the user, then send each answer using ${TerminalToolId.SendToTerminal} with id="${termId}" (which returns the next few lines of output). Repeat one prompt at a time. NEVER route secret prompts (passwords, passphrases, tokens, API keys, etc.) through vscode_askQuestions \u2014 answers to that tool are sent through the model. For secret prompts, tell the user to type the value directly into the terminal and stop.`);
    }
    if (hungHint === "timeout") {
      lines.push(`  3. A timeout does not mean the command failed \u2014 call ${TerminalToolId.GetTerminalOutput} with id="${termId}" to continue polling. Only call ${TerminalToolId.KillTerminal} if the command is genuinely hung and you need to retry with a different approach.`);
    } else if (hungHint === "idleSilence") {
      lines.push(`  3. Producing no output for an extended period does not mean the command failed \u2014 call ${TerminalToolId.GetTerminalOutput} with id="${termId}" to continue polling. Only call ${TerminalToolId.KillTerminal} if the command is genuinely hung and you need to retry with a different approach.`);
    }
    return lines.join("\n");
  }
  async _getOutputAnalyzerMessage(exitCode, exitResult, commandLine, isSandboxWrapped) {
    for (const analyzer of this._outputAnalyzers) {
      const message = await analyzer.analyze({ exitCode, exitResult, commandLine, isSandboxWrapped });
      if (message) {
        return message;
      }
    }
    return void 0;
  }
  /**
   * Scans terminal output for file paths that point to images and reads them.
   * Returns data content parts for any found images that exist on disk.
   */
  async _extractImagesFromOutput(output, cwd) {
    const pathPattern = /[^\s/\\]*(?:[/\\][^\s/\\]*)+\.(?:png|jpe?g|gif|webp|bmp)/gi;
    const matches = /* @__PURE__ */ new Set();
    for (const line of output.split(/\r?\n/)) {
      if (line.length > 1e4) {
        continue;
      }
      for (const match of line.matchAll(pathPattern)) {
        matches.add(match[0]);
      }
    }
    if (matches.size === 0) {
      return [];
    }
    const results = [];
    for (const filePath of matches) {
      try {
        const mimeType = getMediaMime(filePath);
        if (!mimeType || !mimeType.startsWith("image/")) {
          continue;
        }
        let fileUri;
        if (/^\/|^[A-Za-z]:[\\\/]/.test(filePath)) {
          fileUri = URI.file(filePath);
        } else if (cwd) {
          fileUri = URI.joinPath(cwd, filePath);
        } else {
          continue;
        }
        const stat = await this._fileService.stat(fileUri).catch(() => void 0);
        if (!stat || stat.isDirectory || stat.size > RunInTerminalTool._maxImageFileSize) {
          continue;
        }
        const fileContent = await this._fileService.readFile(fileUri);
        results.push({
          kind: "data",
          value: {
            mimeType,
            data: fileContent.value
          },
          audience: [LanguageModelPartAudience.User]
        });
      } catch {
      }
    }
    return results;
  }
  _handleTerminalVisibility(toolTerminal, chatSessionResource) {
    const chatSessionOpenInWidget = !!this._chatWidgetService.getWidgetBySessionResource(chatSessionResource);
    if (this._configurationService.getValue(TerminalChatAgentToolsSettingId.OutputLocation) === "terminal" && chatSessionOpenInWidget) {
      this._terminalService.setActiveInstance(toolTerminal.instance);
      this._terminalService.revealTerminal(toolTerminal.instance, true);
    }
  }
  // #region Terminal init
  /**
   * Initializes a terminal for command execution. For foreground mode, reuses existing cached
   * terminal from the session. For background mode, always creates a new terminal to allow
   * parallel execution.
   */
  async _initTerminal(chatSessionResource, termId, terminalToolSessionId, isBackground, token) {
    if (!isBackground) {
      const cachedTerminal = this._sessionTerminalAssociations.get(chatSessionResource);
      if (cachedTerminal && !cachedTerminal.isBackground && !cachedTerminal.instance.isDisposed) {
        if (cachedTerminal.instance.exitCode !== void 0) {
          this._logService.info(`RunInTerminalTool: Cached terminal shell has exited (code=${cachedTerminal.instance.exitCode}), creating a new terminal`);
          this._sessionTerminalAssociations.delete(chatSessionResource);
        } else {
          this._logService.debug(`RunInTerminalTool: Using cached terminal with session resource \`${chatSessionResource}\``);
          this._terminalToolCreator.refreshShellIntegrationQuality(cachedTerminal);
          this._terminalChatService.registerTerminalInstanceWithToolSession(terminalToolSessionId, cachedTerminal.instance);
          this._backgroundNotifications.deleteAndDispose(cachedTerminal.instance.instanceId);
          return cachedTerminal;
        }
      }
    }
    this._logService.debug(`RunInTerminalTool: Creating ${isBackground ? "background" : "foreground"} terminal with ID=${termId}`);
    const profile = await this._profileFetcher.getCopilotProfile();
    const os = await this._osBackend;
    const toolTerminal = await this._terminalToolCreator.createTerminal(profile, os, token);
    toolTerminal.isBackground = isBackground;
    this._terminalChatService.registerTerminalInstanceWithToolSession(terminalToolSessionId, toolTerminal.instance);
    this._terminalChatService.registerTerminalInstanceWithChatSession(chatSessionResource, toolTerminal.instance);
    this._registerInputListener(toolTerminal);
    this._addSessionTerminalAssociation(chatSessionResource, toolTerminal);
    if (token.isCancellationRequested) {
      toolTerminal.instance.dispose();
      throw new CancellationError();
    }
    await this._setupProcessIdAssociation(toolTerminal, chatSessionResource, termId, isBackground);
    return toolTerminal;
  }
  _registerInputListener(toolTerminal) {
    const disposable = toolTerminal.instance.onData((data) => {
      if (!telemetryIgnoredSequences.includes(data)) {
        toolTerminal.receivedUserInput = data.length > 0;
      }
    });
    Event.once(toolTerminal.instance.onDisposed)(() => disposable.dispose());
  }
  // #endregion
  // #region Session management
  _restoreTerminalAssociations() {
    const storedAssociations = this._storageService.get("chat.terminalSessions" /* TerminalSession */, StorageScope.WORKSPACE, "{}");
    try {
      const associations = JSON.parse(storedAssociations);
      for (const instance of this._terminalService.instances) {
        if (instance.processId) {
          const association = associations[instance.processId];
          if (association) {
            const chatSessionResource = LocalChatSessionUri.forSession(association.sessionId);
            this._logService.debug(`RunInTerminalTool: Restored terminal association for PID ${instance.processId}, session ${association.sessionId}`);
            const toolTerminal = {
              instance,
              shellIntegrationQuality: association.shellIntegrationQuality,
              isBackground: association.isBackground
            };
            this._addSessionTerminalAssociation(chatSessionResource, toolTerminal);
            this._terminalChatService.registerTerminalInstanceWithChatSession(chatSessionResource, instance);
            if (association.id) {
              this._setActiveExecution(association.id, this._register(new RestoredTerminalExecution(instance)));
            }
            Event.once(instance.onDisposed)(() => {
              this._removeProcessIdAssociation(instance.processId);
              this._removeExecutionAssociations(instance);
            });
          }
        }
      }
    } catch (error) {
      this._logService.debug(`RunInTerminalTool: Failed to restore terminal associations: ${error}`);
    }
  }
  async _setupProcessIdAssociation(toolTerminal, chatSessionResource, termId, isBackground) {
    await this._associateProcessIdWithSession(toolTerminal.instance, chatSessionResource, termId, toolTerminal.shellIntegrationQuality, isBackground);
    Event.once(toolTerminal.instance.onDisposed)(() => {
      if (toolTerminal.instance.processId) {
        this._removeProcessIdAssociation(toolTerminal.instance.processId);
      }
    });
  }
  async _associateProcessIdWithSession(terminal, chatSessionResource, id, shellIntegrationQuality, isBackground) {
    try {
      const pid = await Promise.race([
        terminal.processReady.then(() => terminal.processId),
        timeout(5e3).then(() => {
          throw new Error("Timeout");
        })
      ]);
      if (isNumber(pid)) {
        const storedAssociations = this._storageService.get("chat.terminalSessions" /* TerminalSession */, StorageScope.WORKSPACE, "{}");
        const associations = JSON.parse(storedAssociations);
        const sessionId = chatSessionResourceToId(chatSessionResource);
        const existingAssociation = associations[pid] || {};
        associations[pid] = {
          ...existingAssociation,
          sessionId,
          shellIntegrationQuality,
          id,
          isBackground
        };
        this._storageService.store("chat.terminalSessions" /* TerminalSession */, JSON.stringify(associations), StorageScope.WORKSPACE, StorageTarget.USER);
        this._logService.debug(`RunInTerminalTool: Associated terminal PID ${pid} with session ${sessionId}`);
      }
    } catch (error) {
      this._logService.debug(`RunInTerminalTool: Failed to associate terminal with session: ${error}`);
    }
  }
  async _removeProcessIdAssociation(pid) {
    try {
      const storedAssociations = this._storageService.get("chat.terminalSessions" /* TerminalSession */, StorageScope.WORKSPACE, "{}");
      const associations = JSON.parse(storedAssociations);
      if (associations[pid]) {
        delete associations[pid];
        this._storageService.store("chat.terminalSessions" /* TerminalSession */, JSON.stringify(associations), StorageScope.WORKSPACE, StorageTarget.USER);
        this._logService.debug(`RunInTerminalTool: Removed terminal association for PID ${pid}`);
      }
    } catch (error) {
      this._logService.debug(`RunInTerminalTool: Failed to remove terminal association: ${error}`);
    }
  }
  _cleanupSessionTerminals(chatSessionResource) {
    const sessionTerminals = this._sessionTerminalInstances.get(chatSessionResource);
    const toolTerminal = this._sessionTerminalAssociations.get(chatSessionResource);
    const terminalsToDispose = sessionTerminals ?? (toolTerminal ? /* @__PURE__ */ new Set([toolTerminal.instance]) : void 0);
    if (!terminalsToDispose || terminalsToDispose.size === 0) {
      return;
    }
    const shouldPreserveTerminalsForOutputLocation = this._configurationService.getValue(TerminalChatAgentToolsSettingId.OutputLocation) === "terminal";
    this._logService.debug(`RunInTerminalTool: Cleaning up ${terminalsToDispose.size} terminal(s) for ended chat session ${chatSessionResource}`);
    this._sessionTerminalAssociations.delete(chatSessionResource);
    this._sessionTerminalInstances.delete(chatSessionResource);
    for (const terminal of terminalsToDispose) {
      if (this._terminalService.foregroundInstances.includes(terminal) || shouldPreserveTerminalsForOutputLocation) {
        this._logService.debug(`RunInTerminalTool: Skipping disposal of preserved terminal ${terminal.instanceId} for session ${chatSessionResource}`);
        continue;
      }
      this._terminalsBeingDisposedBySessionCleanup.add(terminal);
      terminal.dispose();
    }
    const terminalToRemove = [];
    for (const [termId, execution] of RunInTerminalTool._activeExecutions.entries()) {
      if (terminalsToDispose.has(execution.instance)) {
        if (this._terminalService.foregroundInstances.includes(execution.instance) || shouldPreserveTerminalsForOutputLocation) {
          continue;
        }
        execution.dispose();
        terminalToRemove.push(termId);
      }
    }
    for (const termId of terminalToRemove) {
      this._deleteActiveExecution(termId);
    }
  }
  _addSessionTerminalAssociation(chatSessionResource, toolTerminal) {
    this._ensureArchivedSessionListener();
    let sessionTerminals = this._sessionTerminalInstances.get(chatSessionResource);
    if (!sessionTerminals) {
      sessionTerminals = /* @__PURE__ */ new Set();
      this._sessionTerminalInstances.set(chatSessionResource, sessionTerminals);
    }
    sessionTerminals.add(toolTerminal.instance);
    if (!toolTerminal.isBackground) {
      this._sessionTerminalAssociations.set(chatSessionResource, toolTerminal);
    }
  }
  _ensureArchivedSessionListener() {
    if (this._archivedSessionListener.value) {
      return;
    }
    this._archivedSessionListener.value = this._agentSessionsService.onDidChangeSessionArchivedState((session) => {
      if (session.isArchived()) {
        this._cleanupSessionTerminals(session.resource);
      }
    });
  }
  _removeTerminalAssociations(terminal) {
    if (this._terminalsBeingDisposedBySessionCleanup.delete(terminal)) {
      this._removeExecutionAssociations(terminal);
      return;
    }
    for (const [sessionResource, toolTerminal] of this._sessionTerminalAssociations.entries()) {
      if (terminal === toolTerminal.instance) {
        this._sessionTerminalAssociations.delete(sessionResource);
      }
    }
    for (const [sessionResource, sessionTerminals] of this._sessionTerminalInstances.entries()) {
      if (!sessionTerminals.delete(terminal)) {
        continue;
      }
      if (sessionTerminals.size === 0) {
        this._sessionTerminalInstances.delete(sessionResource);
      }
    }
    this._removeExecutionAssociations(terminal);
  }
  _removeExecutionAssociations(terminal) {
    const executionIdsToRemove = [];
    for (const [termId, execution] of RunInTerminalTool._activeExecutions.entries()) {
      if (execution.instance === terminal) {
        execution.dispose();
        executionIdsToRemove.push(termId);
      }
    }
    for (const termId of executionIdsToRemove) {
      this._deleteActiveExecution(termId);
    }
  }
  /**
   * Registers a listener for command completion on a background terminal.
   * When a command finishes, sends a steering message to the chat session
   * so the agent is notified on its next turn.
   *
   * If an output monitor is provided, it is continued in background mode
   * to detect prompts-for-input while the terminal runs in the background.
   * The output monitor is cancelled and disposed when a command finishes.
   */
  _registerCompletionNotification(terminalInstance, termId, chatSessionResource, commandName, toolSpecificData, outputMonitor, alreadyNotifiedInputNeededOutput) {
    const notificationKey = terminalInstance.instanceId;
    this._backgroundNotifications.deleteAndDispose(notificationKey);
    const commandDetection = terminalInstance.capabilities.get(TerminalCapability.CommandDetection);
    if (!commandDetection) {
      outputMonitor?.dispose();
      return;
    }
    const commandDisplay = appendEscapedMarkdownInlineCode(buildCompletionNotificationCommand(commandName));
    const sessionRef = this._chatService.acquireExistingSession(chatSessionResource, "RunInTerminalTool#completionNotification");
    if (!sessionRef) {
      this._logService.warn(`RunInTerminalTool: Cannot register completion notification for terminal ${termId} - session already disposed`);
      outputMonitor?.dispose();
      return;
    }
    const lastRequest = sessionRef.object.lastRequest;
    const sendOptions = {};
    if (lastRequest) {
      sendOptions.userSelectedModelId = lastRequest.modelId;
      sendOptions.modeInfo = lastRequest.modeInfo;
      const previousAgentId = lastRequest.response?.agent?.id;
      sendOptions.agentIdSilent = previousAgentId;
      const contribution = previousAgentId ? this._chatSessionsService.getChatSessionContribution(previousAgentId) : void 0;
      const autoAttachEnabled = contribution ? contribution.autoAttachReferences === true : true;
      if (autoAttachEnabled) {
        sendOptions.instructionContext = {
          modeKind: lastRequest.modeInfo?.kind ?? ChatModeKind.Agent,
          enabledTools: lastRequest.userSelectedTools
        };
      }
      if (lastRequest.userSelectedTools) {
        sendOptions.userSelectedTools = constObservable(lastRequest.userSelectedTools);
      }
    }
    const store = new DisposableStore();
    let userIsReplyingDirectly = false;
    const disposeNotification = () => this._backgroundNotifications.deleteAndDispose(notificationKey);
    const handleSessionCancelled = () => {
      if (sessionRef.object.lastRequest?.response?.isCanceled) {
        disposeNotification();
        return true;
      }
      return false;
    };
    store.add(autorun((reader) => {
      const request = sessionRef.object.lastRequestObs.read(reader);
      if (!request?.response) {
        return;
      }
      reader.store.add(request.response.onDidChange((ev) => {
        if (ev.reason === "completedRequest" && request.response.isCanceled) {
          disposeNotification();
        }
      }));
    }));
    if (outputMonitor) {
      let lastInputNeededOutput = alreadyNotifiedInputNeededOutput ?? "";
      let lastInputNeededNotificationTime = alreadyNotifiedInputNeededOutput !== void 0 ? Date.now() : 0;
      const bgCts = new CancellationTokenSource();
      store.add(toDisposable(() => {
        bgCts.cancel();
        bgCts.dispose();
      }));
      store.add(outputMonitor);
      outputMonitor.continueMonitoringAsync(bgCts.token);
      store.add(this._registerSensitiveInputElicitation(
        chatSessionResource,
        terminalInstance,
        outputMonitor,
        () => {
          const execution = RunInTerminalTool._activeExecutions.get(termId);
          execution?.dispose();
        }
      ));
      store.add(outputMonitor.onDidDetectInputNeeded(() => {
        if (userIsReplyingDirectly) {
          this._logService.debug(`RunInTerminalTool: Suppressing input-needed notification for terminal ${termId} because user is replying directly`);
          return;
        }
        if (terminalInstance.isDisposed) {
          this._logService.debug(`RunInTerminalTool: Suppressing input-needed notification for terminal ${termId} because the terminal is disposed`);
          return;
        }
        if (handleSessionCancelled()) {
          return;
        }
        const execution = RunInTerminalTool._activeExecutions.get(termId);
        if (!execution) {
          return;
        }
        const currentOutput = execution.getOutput();
        const now = Date.now();
        const isDuplicate = currentOutput === lastInputNeededOutput && now - lastInputNeededNotificationTime < INPUT_NEEDED_NOTIFICATION_THROTTLE_MS;
        if (isDuplicate) {
          return;
        }
        lastInputNeededOutput = currentOutput;
        lastInputNeededNotificationTime = now;
        const inputAction = this._buildInputNeededSteeringText(chatSessionResource, termId, "none");
        const message = `[Terminal ${termId} notification: command may be waiting for input \u2014 assess the output below.]
${inputAction}
Terminal output:
${currentOutput}`;
        this._logService.debug(`RunInTerminalTool: Input needed in background terminal ${termId}, notifying chat session`);
        this._chatService.sendRequest(chatSessionResource, message, {
          ...sendOptions,
          queue: ChatRequestQueueKind.Steering,
          isSystemInitiated: true,
          systemInitiatedLabel: localize("terminalAssessingOutput", "{0} may need input", commandDisplay),
          terminalExecutionId: termId
        }).catch((e) => {
          this._logService.warn(`RunInTerminalTool: Failed to send input-needed notification for terminal ${termId}`, e);
        });
      }));
    }
    store.add(terminalInstance.onDidInputData(() => {
      if (userIsReplyingDirectly) {
        return;
      }
      userIsReplyingDirectly = true;
      this._dismissPendingCarouselsForTerminal(chatSessionResource, termId);
    }));
    store.add(sessionRef);
    store.add(commandDetection.onCommandFinished((command) => {
      const execution = RunInTerminalTool._activeExecutions.get(termId);
      if (!execution) {
        disposeNotification();
        return;
      }
      if (handleSessionCancelled()) {
        return;
      }
      disposeNotification();
      const exitCode = command.exitCode;
      const exitCodeText = exitCode !== void 0 && exitCode !== 0 ? ` with exit code ${exitCode}` : "";
      const currentOutput = execution.getOutput();
      const isUserVisible = this._terminalService.foregroundInstances.includes(terminalInstance);
      const message = isUserVisible ? `[Terminal ${termId} notification: command completed${exitCodeText}. Use send_to_terminal to send another command or kill_terminal to stop it.]
Terminal output:
${currentOutput}` : `[Terminal ${termId} notification: command completed${exitCodeText}. The terminal has been cleaned up.]
Terminal output:
${currentOutput}`;
      this._logService.debug(`RunInTerminalTool: Command completed in background terminal ${termId}, notifying chat session`);
      this._chatService.sendRequest(chatSessionResource, message, {
        ...sendOptions,
        queue: ChatRequestQueueKind.Steering,
        isSystemInitiated: true,
        systemInitiatedLabel: localize("terminalCommandCompleted", "{0} completed", commandDisplay),
        terminalExecutionId: termId
      }).catch((e) => {
        this._logService.warn(`RunInTerminalTool: Failed to send completion notification for terminal ${termId}`, e);
      });
      this._commandArtifactCollector.capture(toolSpecificData, terminalInstance, command.id).then(() => {
        if (this._terminalService.foregroundInstances.includes(terminalInstance)) {
          this._logService.debug(`RunInTerminalTool: Background terminal ${termId} was revealed by user, skipping disposal`);
          return;
        }
        this._logService.debug(`RunInTerminalTool: Disposing finished background terminal ${termId}`);
        RunInTerminalTool._killedByTool.add(termId);
        execution.dispose();
        this._deleteActiveExecution(termId);
        terminalInstance.dispose();
      });
    }));
    const executionForDisposal = RunInTerminalTool._activeExecutions.get(termId);
    store.add(terminalInstance.onDisposed(() => {
      if (RunInTerminalTool._killedByTool.has(termId)) {
        disposeNotification();
        return;
      }
      if (this._isShuttingDown) {
        disposeNotification();
        return;
      }
      if (terminalInstance.exitReason === TerminalExitReason.User) {
        this._logService.debug(`RunInTerminalTool: Background terminal ${termId} closed by user, suppressing steering message`);
        disposeNotification();
        return;
      }
      if (handleSessionCancelled()) {
        return;
      }
      const currentOutput = executionForDisposal?.getOutput() ?? "";
      const exitCode = terminalInstance.exitCode;
      const exitCodeText = exitCode !== void 0 && exitCode !== 0 ? ` with exit code ${exitCode}` : "";
      disposeNotification();
      const message = `[Terminal ${termId} notification: terminal exited${exitCodeText}. The terminal process ended before the command could complete normally; further commands cannot be sent to this terminal ID.]
Terminal output:
${currentOutput}`;
      this._logService.debug(`RunInTerminalTool: Background terminal ${termId} disposed${exitCodeText}, notifying chat session`);
      this._chatService.sendRequest(chatSessionResource, message, {
        ...sendOptions,
        queue: ChatRequestQueueKind.Steering,
        isSystemInitiated: true,
        systemInitiatedLabel: localize("terminalProcessExited", "{0} terminal exited", commandDisplay),
        terminalExecutionId: termId
      }).catch((e) => {
        this._logService.warn(`RunInTerminalTool: Failed to send terminal-exited notification for terminal ${termId}`, e);
      });
    }));
    store.add(sessionRef.object.onDidChange((e) => {
      if (e.kind === "removeRequest") {
        this._logService.debug(`RunInTerminalTool: Request removed from session, cleaning up background terminal ${termId}`);
        RunInTerminalTool._activeExecutions.get(termId)?.dispose();
        this._deleteActiveExecution(termId);
        disposeNotification();
        terminalInstance.dispose();
      }
    }));
    this._backgroundNotifications.set(notificationKey, store);
  }
  /**
   * Find and dismiss any pending (not yet answered) question carousels that
   * are associated with the given terminal. This is called when the user
   * types directly into the terminal, bypassing the carousel UI.
   */
  _dismissPendingCarouselsForTerminal(chatSessionResource, termId) {
    const model = this._chatService.getSession(chatSessionResource);
    if (!model) {
      return;
    }
    const requests = model.getRequests();
    for (let i = requests.length - 1; i >= 0; i--) {
      const response = requests[i].response;
      if (!response) {
        continue;
      }
      const parts = response.response.value;
      for (let j = parts.length - 1; j >= 0; j--) {
        const part = parts[j];
        if (part instanceof ChatQuestionCarouselData && part.terminalId === termId && !part.isUsed) {
          this._logService.debug(`RunInTerminalTool: Dismissing pending carousel for terminal ${termId} because user typed directly in terminal`);
          part.data = {};
          part.isUsed = true;
          part.dismissedByTerminalInput = true;
          part.completion.complete({ answers: void 0 });
          return;
        }
      }
    }
  }
  // #endregion
};
RunInTerminalTool._activeExecutions = /* @__PURE__ */ new Map();
/**
 * Terminal IDs being programmatically disposed (by `kill_terminal` or
 * automatic background-terminal cleanup). Used to suppress the redundant
 * "terminal exited" steering message in `_registerCompletionNotification`'s
 * `onDisposed` handler.
 */
RunInTerminalTool._killedByTool = /* @__PURE__ */ new Set();
RunInTerminalTool._maxImageFileSize = 5 * 1024 * 1024;
RunInTerminalTool = __decorateClass([
  __decorateParam(0, IChatService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IHistoryService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, ILanguageModelToolsService),
  __decorateParam(7, IRemoteAgentService),
  __decorateParam(8, IStorageService),
  __decorateParam(9, ITerminalChatService),
  __decorateParam(10, ITerminalLogService),
  __decorateParam(11, ITerminalService),
  __decorateParam(12, ITerminalSandboxService),
  __decorateParam(13, IWorkspaceContextService),
  __decorateParam(14, IChatWidgetService),
  __decorateParam(15, IAgentSessionsService),
  __decorateParam(16, IChatSessionsService),
  __decorateParam(17, ILifecycleService)
], RunInTerminalTool);
let ActiveTerminalExecution = class extends Disposable {
  constructor(sessionResource, termId, toolTerminal, commandDetection, isBackground, _instantiationService) {
    super();
    this.sessionResource = sessionResource;
    this.termId = termId;
    this._instantiationService = _instantiationService;
    this._toolTerminal = toolTerminal;
    this._isBackground = isBackground;
    this._completionDeferred = new DeferredPromise();
    this.strategy = this._register(this._createStrategy(commandDetection));
    this._register(this.strategy.onDidCreateStartMarker((marker) => {
      if (marker) {
        this._startMarker = marker;
      }
    }));
  }
  /**
   * The promise that resolves when the execute strategy completes. Can be awaited to get the
   * full result with exit code.
   */
  get completionPromise() {
    return this._completionDeferred.p;
  }
  get isBackground() {
    return this._isBackground;
  }
  get startMarker() {
    return this._startMarker;
  }
  get instance() {
    return this._toolTerminal.instance;
  }
  _createStrategy(commandDetection) {
    const isSyncMode = !this._isBackground;
    switch (this._toolTerminal.shellIntegrationQuality) {
      case ShellIntegrationQuality.None:
        return this._instantiationService.createInstance(NoneExecuteStrategy, this._toolTerminal.instance, () => this._toolTerminal.receivedUserInput ?? false);
      case ShellIntegrationQuality.Basic:
        return this._instantiationService.createInstance(BasicExecuteStrategy, this._toolTerminal.instance, () => this._toolTerminal.receivedUserInput ?? false, commandDetection);
      case ShellIntegrationQuality.Rich:
        return this._instantiationService.createInstance(RichExecuteStrategy, this._toolTerminal.instance, commandDetection, isSyncMode);
    }
  }
  /**
   * Starts the command execution using the execute strategy.
   * @param commandLine The command to execute
   * @param token Cancellation token
   * @param commandId Optional command ID for linking
   * @returns The execution result
   */
  async start(commandLine, token, commandId, commandLineForMetadata) {
    try {
      const result = await this.strategy.execute(commandLine, token, commandId, commandLineForMetadata);
      this._completionDeferred.complete(result);
      return result;
    } catch (e) {
      this._completionDeferred.error(e);
      throw e;
    }
  }
  /**
   * Switches this execution to foreground mode, meaning callers will await its completion.
   */
  setForeground() {
    this._isBackground = false;
  }
  /**
   * Switches this execution to background mode.
   */
  setBackground() {
    this._isBackground = true;
  }
  /**
   * Gets the current output from the terminal.
   */
  getOutput(marker) {
    return getOutput(this.instance, marker ?? this._startMarker);
  }
};
ActiveTerminalExecution = __decorateClass([
  __decorateParam(5, IInstantiationService)
], ActiveTerminalExecution);
class RestoredTerminalExecution extends Disposable {
  constructor(instance) {
    super();
    this.instance = instance;
    this.completionPromise = Promise.resolve({ output: void 0, error: "restoredTerminalExecutionNotAwaitable" });
  }
  getOutput(marker) {
    return getOutput(this.instance, marker);
  }
}
let TerminalProfileFetcher = class {
  constructor(_configurationService, _terminalProfileResolverService, _remoteAgentService, _fileService, _logService) {
    this._configurationService = _configurationService;
    this._terminalProfileResolverService = _terminalProfileResolverService;
    this._remoteAgentService = _remoteAgentService;
    this._fileService = _fileService;
    this._logService = _logService;
    this.osBackend = this._remoteAgentService.getEnvironment().then((remoteEnv) => remoteEnv?.os ?? OS);
  }
  async getCopilotProfile() {
    const os = await this.osBackend;
    const customChatAgentProfile = this._getChatTerminalProfile(os);
    if (customChatAgentProfile) {
      return customChatAgentProfile;
    }
    const defaultProfile = await this._terminalProfileResolverService.getDefaultProfile({
      os,
      remoteAuthority: this._remoteAgentService.getConnection()?.remoteAuthority
    });
    if (basename(defaultProfile.path) === "cmd.exe") {
      return {
        ...defaultProfile,
        path: "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        profileName: "PowerShell"
      };
    }
    if (defaultProfile.path === "/bin/sh") {
      return {
        ...defaultProfile,
        path: "/bin/bash",
        profileName: "bash"
      };
    }
    if (os !== OperatingSystem.Windows) {
      const shellExists = await this._shellExists(defaultProfile.path);
      if (!shellExists) {
        const fallbackPath = await this._findFallbackShell();
        if (fallbackPath) {
          this._logService.warn(`TerminalProfileFetcher: resolved shell "${defaultProfile.path}" does not exist, falling back to "${fallbackPath}"`);
          return {
            ...defaultProfile,
            path: fallbackPath,
            profileName: basename(fallbackPath),
            icon: void 0
          };
        }
      }
    }
    return { ...defaultProfile, icon: void 0 };
  }
  async _shellExists(shellPath) {
    try {
      const remoteAuthority = this._remoteAgentService.getConnection()?.remoteAuthority;
      const resource = remoteAuthority ? URI.file(shellPath).with({ scheme: "vscode-remote", authority: remoteAuthority }) : URI.file(shellPath);
      return await this._fileService.exists(resource);
    } catch {
      return false;
    }
  }
  async _findFallbackShell() {
    for (const candidate of TerminalProfileFetcher._posixShellFallbacks) {
      if (await this._shellExists(candidate)) {
        return candidate;
      }
    }
    return void 0;
  }
  async getCopilotShell() {
    return (await this.getCopilotProfile()).path;
  }
  _getChatTerminalProfile(os) {
    let profileSetting;
    switch (os) {
      case OperatingSystem.Windows:
        profileSetting = TerminalChatAgentToolsSettingId.TerminalProfileWindows;
        break;
      case OperatingSystem.Macintosh:
        profileSetting = TerminalChatAgentToolsSettingId.TerminalProfileMacOs;
        break;
      case OperatingSystem.Linux:
      default:
        profileSetting = TerminalChatAgentToolsSettingId.TerminalProfileLinux;
        break;
    }
    const profile = this._configurationService.getValue(profileSetting);
    if (this._isValidChatAgentTerminalProfile(profile)) {
      return profile;
    }
    return void 0;
  }
  _isValidChatAgentTerminalProfile(profile) {
    if (profile === null || profile === void 0 || typeof profile !== "object") {
      return false;
    }
    if ("path" in profile && isString(profile.path)) {
      return true;
    }
    return false;
  }
};
TerminalProfileFetcher._posixShellFallbacks = ["/bin/bash", "/usr/bin/bash", "/bin/sh"];
TerminalProfileFetcher = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ITerminalProfileResolverService),
  __decorateParam(2, IRemoteAgentService),
  __decorateParam(3, IFileService),
  __decorateParam(4, ITerminalLogService)
], TerminalProfileFetcher);
export {
  RunInTerminalTool,
  TerminalProfileFetcher,
  buildCompletionNotificationCommand,
  createRunInTerminalToolData,
  createSandboxLines,
  createSandboxProperties,
  outputLooksBubblewrapHostRestricted,
  shouldAutomaticallyRetryAllowNetworkInSandboxed,
  shouldAutomaticallyRetryUnsandboxed
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGJyb3dzZXJcXHRvb2xzXFxydW5JblRlcm1pbmFsVG9vbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgSU1hcmtlciBhcyBJWHRlcm1NYXJrZXIgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCBSdW5PbmNlU2NoZWR1bGVyLCB0aW1lb3V0LCB0eXBlIENhbmNlbGFibGVQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUsIGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zLCBNYXJrZG93blN0cmluZywgdHlwZSBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGdldE1lZGlhTWltZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIHBvc2l4LCB3aW4zMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtLCBPUyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGNvdW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbmZpcm1hdGlvbk9wdGlvbktpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgdHlwZSBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNhbmRib3hTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zYW5kYm94L2NvbW1vbi9zZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHksIFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbExvZ1NlcnZpY2UsIElUZXJtaW5hbFByb2ZpbGUsIFRlcm1pbmFsRXhpdFJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVybWluYWxUb29sQ29uZmlybWF0aW9uU3RvcmFnZUtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0VGVybWluYWxUb29sQ29uZmlybWF0aW9uU3ViUGFydC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UsIENoYXRSZXF1ZXN0UXVldWVLaW5kLCBFbGljaXRhdGlvblN0YXRlLCB0eXBlIElDaGF0RXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZSwgdHlwZSBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucywgdHlwZSBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgY29uc3RPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCwgQ2hhdFBlcm1pc3Npb25MZXZlbCwgaXNBdXRvQXBwcm92ZUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IENvdW50VG9rZW5zQ2FsbGJhY2ssIElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgSVRvb2xDb25maXJtYXRpb25NZXNzYWdlcywgSVN0cmVhbWVkVG9vbEludm9jYXRpb24sIElUb29sRGF0YSwgSVRvb2xJbXBsLCBJVG9vbEludm9jYXRpb24sIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgSVRvb2xJbnZvY2F0aW9uU3RyZWFtQ29udGV4dCwgSVRvb2xSZXN1bHQsIFRvb2xEYXRhU291cmNlLCBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbiwgVG9vbFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDaGF0U2VydmljZSwgSVRlcm1pbmFsU2VydmljZSwgdHlwZSBJVGVybWluYWxJbnN0YW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0lETEVfU0lMRU5DRV9USU1FT1VUX01TLCBUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGdldFJlY29tbWVuZGVkVG9vbHNPdmVyUnVuSW5UZXJtaW5hbCB9IGZyb20gJy4uL2FsdGVybmF0aXZlUmVjb21tZW5kYXRpb24uanMnO1xuaW1wb3J0IHsgQmFzaWNFeGVjdXRlU3RyYXRlZ3kgfSBmcm9tICcuLi9leGVjdXRlU3RyYXRlZ3kvYmFzaWNFeGVjdXRlU3RyYXRlZ3kuanMnO1xuaW1wb3J0IHR5cGUgeyBJVGVybWluYWxFeGVjdXRlU3RyYXRlZ3ksIElUZXJtaW5hbEV4ZWN1dGVTdHJhdGVneVJlc3VsdCB9IGZyb20gJy4uL2V4ZWN1dGVTdHJhdGVneS9leGVjdXRlU3RyYXRlZ3kuanMnO1xuaW1wb3J0IHsgTm9uZUV4ZWN1dGVTdHJhdGVneSB9IGZyb20gJy4uL2V4ZWN1dGVTdHJhdGVneS9ub25lRXhlY3V0ZVN0cmF0ZWd5LmpzJztcbmltcG9ydCB7IFJpY2hFeGVjdXRlU3RyYXRlZ3kgfSBmcm9tICcuLi9leGVjdXRlU3RyYXRlZ3kvcmljaEV4ZWN1dGVTdHJhdGVneS5qcyc7XG5pbXBvcnQgeyBnZXRPdXRwdXQgfSBmcm9tICcuLi9vdXRwdXRIZWxwZXJzLmpzJztcbmltcG9ydCB7IExhcmdlT3V0cHV0RmlsZVdyaXRlciB9IGZyb20gJy4uL2xhcmdlT3V0cHV0RmlsZVdyaXRlci5qcyc7XG5pbXBvcnQgeyBidWlsZENvbW1hbmREaXNwbGF5VGV4dCwgZXh0cmFjdENkUHJlZml4LCBpc0Zpc2gsIGlzUG93ZXJTaGVsbCwgaXNXaW5kb3dzUG93ZXJTaGVsbCwgaXNac2gsIG5vcm1hbGl6ZVRlcm1pbmFsQ29tbWFuZEZvckRpc3BsYXkgfSBmcm9tICcuLi9ydW5JblRlcm1pbmFsSGVscGVycy5qcyc7XG5pbXBvcnQgdHlwZSB7IElDb21tYW5kTGluZVByZXNlbnRlciB9IGZyb20gJy4vY29tbWFuZExpbmVQcmVzZW50ZXIvY29tbWFuZExpbmVQcmVzZW50ZXIuanMnO1xuaW1wb3J0IHsgTm9kZUNvbW1hbmRMaW5lUHJlc2VudGVyIH0gZnJvbSAnLi9jb21tYW5kTGluZVByZXNlbnRlci9ub2RlQ29tbWFuZExpbmVQcmVzZW50ZXIuanMnO1xuaW1wb3J0IHsgUHl0aG9uQ29tbWFuZExpbmVQcmVzZW50ZXIgfSBmcm9tICcuL2NvbW1hbmRMaW5lUHJlc2VudGVyL3B5dGhvbkNvbW1hbmRMaW5lUHJlc2VudGVyLmpzJztcbmltcG9ydCB7IFJ1YnlDb21tYW5kTGluZVByZXNlbnRlciB9IGZyb20gJy4vY29tbWFuZExpbmVQcmVzZW50ZXIvcnVieUNvbW1hbmRMaW5lUHJlc2VudGVyLmpzJztcbmltcG9ydCB7IFNhbmRib3hlZENvbW1hbmRMaW5lUHJlc2VudGVyIH0gZnJvbSAnLi9jb21tYW5kTGluZVByZXNlbnRlci9zYW5kYm94ZWRDb21tYW5kTGluZVByZXNlbnRlci5qcyc7XG5pbXBvcnQgeyBSdW5JblRlcm1pbmFsVG9vbFRlbGVtZXRyeSB9IGZyb20gJy4uL3J1bkluVGVybWluYWxUb29sVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFNoZWxsSW50ZWdyYXRpb25RdWFsaXR5LCBUb29sVGVybWluYWxDcmVhdG9yLCB0eXBlIElUb29sVGVybWluYWwgfSBmcm9tICcuLi90b29sVGVybWluYWxDcmVhdG9yLmpzJztcbmltcG9ydCB7IFRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyLCBUcmVlU2l0dGVyQ29tbWFuZFBhcnNlckxhbmd1YWdlIH0gZnJvbSAnLi4vdHJlZVNpdHRlckNvbW1hbmRQYXJzZXIuanMnO1xuaW1wb3J0IHsgdHlwZSBJQ29tbWFuZExpbmVBbmFseXplciwgdHlwZSBJQ29tbWFuZExpbmVBbmFseXplck9wdGlvbnMgfSBmcm9tICcuL2NvbW1hbmRMaW5lQW5hbHl6ZXIvY29tbWFuZExpbmVBbmFseXplci5qcyc7XG5pbXBvcnQgeyBDb21tYW5kTGluZUF1dG9BcHByb3ZlQW5hbHl6ZXIgfSBmcm9tICcuL2NvbW1hbmRMaW5lQW5hbHl6ZXIvY29tbWFuZExpbmVBdXRvQXBwcm92ZUFuYWx5emVyLmpzJztcbmltcG9ydCB7IENvbW1hbmRMaW5lRmlsZVdyaXRlQW5hbHl6ZXIgfSBmcm9tICcuL2NvbW1hbmRMaW5lQW5hbHl6ZXIvY29tbWFuZExpbmVGaWxlV3JpdGVBbmFseXplci5qcyc7XG5pbXBvcnQgeyBDb21tYW5kTGluZVNhbmRib3hBbmFseXplciB9IGZyb20gJy4vY29tbWFuZExpbmVBbmFseXplci9jb21tYW5kTGluZVNhbmRib3hBbmFseXplci5qcyc7XG5pbXBvcnQgeyBPdXRwdXRNb25pdG9yIH0gZnJvbSAnLi9tb25pdG9yaW5nL291dHB1dE1vbml0b3IuanMnO1xuaW1wb3J0IHsgSVBvbGxpbmdSZXN1bHQsIE91dHB1dE1vbml0b3JTdGF0ZSB9IGZyb20gJy4vbW9uaXRvcmluZy90eXBlcy5qcyc7XG5pbXBvcnQgeyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEuanMnO1xuaW1wb3J0IHsgY2hhdFNlc3Npb25SZXNvdXJjZVRvSWQsIExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsVG9vbElkIH0gZnJvbSAnLi90b29sSWRzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgdHlwZSB7IElDb21tYW5kTGluZVJld3JpdGVyIH0gZnJvbSAnLi9jb21tYW5kTGluZVJld3JpdGVyL2NvbW1hbmRMaW5lUmV3cml0ZXIuanMnO1xuaW1wb3J0IHsgQ29tbWFuZExpbmVDZFByZWZpeFJld3JpdGVyIH0gZnJvbSAnLi9jb21tYW5kTGluZVJld3JpdGVyL2NvbW1hbmRMaW5lQ2RQcmVmaXhSZXdyaXRlci5qcyc7XG5pbXBvcnQgeyBDb21tYW5kTGluZVByZXZlbnRIaXN0b3J5UmV3cml0ZXIgfSBmcm9tICcuL2NvbW1hbmRMaW5lUmV3cml0ZXIvY29tbWFuZExpbmVQcmV2ZW50SGlzdG9yeVJld3JpdGVyLmpzJztcbmltcG9ydCB7IENvbW1hbmRMaW5lUHdzaENoYWluT3BlcmF0b3JSZXdyaXRlciB9IGZyb20gJy4vY29tbWFuZExpbmVSZXdyaXRlci9jb21tYW5kTGluZVB3c2hDaGFpbk9wZXJhdG9yUmV3cml0ZXIuanMnO1xuaW1wb3J0IHsgQ29tbWFuZExpbmVCYWNrZ3JvdW5kRGV0YWNoUmV3cml0ZXIgfSBmcm9tICcuL2NvbW1hbmRMaW5lUmV3cml0ZXIvY29tbWFuZExpbmVCYWNrZ3JvdW5kRGV0YWNoUmV3cml0ZXIuanMnO1xuaW1wb3J0IHsgQ29tbWFuZExpbmVTYW5kYm94UmV3cml0ZXIgfSBmcm9tICcuL2NvbW1hbmRMaW5lUmV3cml0ZXIvY29tbWFuZExpbmVTYW5kYm94UmV3cml0ZXIuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvaGlzdG9yeS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29tbWFuZEFydGlmYWN0Q29sbGVjdG9yIH0gZnJvbSAnLi90ZXJtaW5hbENvbW1hbmRBcnRpZmFjdENvbGxlY3Rvci5qcyc7XG5pbXBvcnQgeyBpc051bWJlciwgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENoYXRDb21tYW5kSWQgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2Jyb3dzZXIvdGVybWluYWxDaGF0LmpzJztcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyBJT3V0cHV0QW5hbHl6ZXIgfSBmcm9tICcuL291dHB1dEFuYWx5emVyLmpzJztcbmltcG9ydCB7IFNhbmRib3hPdXRwdXRBbmFseXplciwgb3V0cHV0TG9va3NTYW5kYm94QmxvY2tlZCwgb3V0cHV0TG9va3NTYW5kYm94TmV0d29ya0Jsb2NrZWQgfSBmcm9tICcuL3NhbmRib3hPdXRwdXRBbmFseXplci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxTYW5kYm94U2VydmljZSwgVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2ssIFRlcm1pbmFsU2FuZGJveFByZUNoZWNrUmVtZWRpYXRpb24sIHR5cGUgSVRlcm1pbmFsU2FuZGJveFByZWNoZWNrSW5wdXRzLCB0eXBlIElUZXJtaW5hbFNhbmRib3hSZXNvbHZlZE5ldHdvcmtEb21haW5zIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsU2FuZGJveFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VNb2RlbFBhcnRBdWRpZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IGlzU2Vzc2lvbkF1dG9BcHByb3ZlTGV2ZWwsIGlzVGVybWluYWxBdXRvQXBwcm92ZUFsbG93ZWQsIGlzVG9vbEVsaWdpYmxlRm9yVGVybWluYWxBdXRvQXBwcm92YWwgfSBmcm9tICcuL3Rlcm1pbmFsVG9vbEF1dG9BcHByb3ZlLmpzJztcbmltcG9ydCB0eXBlIHsgSUpTT05TY2hlbWFNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IENoYXRFbGljaXRhdGlvblJlcXVlc3RQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdEVsaWNpdGF0aW9uUmVxdWVzdFBhcnQuanMnO1xuaW1wb3J0IHsgZ2V0U2FuZGJveFByZWNoZWNrSW5wdXRzRm9yVG9vbEludm9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2Jyb3dzZXIvdG9vbHMvdG9vbEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgY29tcGFjdCB9IGZyb20gJy4vY29uc29sZUNvbXBhY3Rvci9jb25zb2xlQ29tcGFjdG9yLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5cbi8vICNyZWdpb24gVG9vbCBkYXRhXG5cbmNvbnN0IFRFUk1JTkFMX1NBTkRCT1hfRE9DVU1FTlRBVElPTl9VUkwgPSAnaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXNhbmRib3hpbmcnO1xuY29uc3QgVE9PTF9SRUZFUkVOQ0VfTkFNRSA9ICdydW5JblRlcm1pbmFsJztcbmNvbnN0IExFR0FDWV9UT09MX1JFRkVSRU5DRV9GVUxMX05BTUVTID0gWydydW5Db21tYW5kcy9ydW5JblRlcm1pbmFsJ107XG5jb25zdCBJTlBVVF9ORUVERURfTk9USUZJQ0FUSU9OX1RIUk9UVExFX01TID0gNTAwMDtcblxuZXhwb3J0IGludGVyZmFjZSBJU2FuZGJveGluZ09uTmV0d29ya1Jlc3RyaWN0ZWRPcHRpb25zIHtcblx0c2FuZGJveE1vZGU6ICdvbi1uZXR3b3JrLXJlc3RyaWN0ZWQnO1xuXHRhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kczogYm9vbGVhbjtcblx0cmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHM6IGJvb2xlYW47XG5cdG5ldHdvcmtEb21haW5zPzogSVRlcm1pbmFsU2FuZGJveFJlc29sdmVkTmV0d29ya0RvbWFpbnM7XG59XG5leHBvcnQgaW50ZXJmYWNlIElTYW5kYm94aW5nT25OZXR3b3JrQXZhaWxhYmxlT3B0aW9ucyB7XG5cdHNhbmRib3hNb2RlOiAnb24tbmV0d29yay1hdmFpbGFibGUnO1xuXHRhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kczogYm9vbGVhbjtcblx0cmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHM6IGZhbHNlO1xuXHRuZXR3b3JrRG9tYWluczogdW5kZWZpbmVkO1xufVxuZXhwb3J0IHR5cGUgSVNhbmRib3hpbmdPbk9wdGlvbnMgPSBJU2FuZGJveGluZ09uTmV0d29ya1Jlc3RyaWN0ZWRPcHRpb25zIHwgSVNhbmRib3hpbmdPbk5ldHdvcmtBdmFpbGFibGVPcHRpb25zO1xuZXhwb3J0IGludGVyZmFjZSBJU2FuZGJveGluZ0Rpc2FibGVkT3B0aW9ucyB7XG5cdHNhbmRib3hNb2RlOiAnb2ZmJztcbn1cbmV4cG9ydCB0eXBlIElTYW5kYm94aW5nT3B0aW9ucyA9IElTYW5kYm94aW5nT25PcHRpb25zIHwgSVNhbmRib3hpbmdEaXNhYmxlZE9wdGlvbnM7XG5cbmZ1bmN0aW9uIGNyZWF0ZVBvd2VyU2hlbGxNb2RlbERlc2NyaXB0aW9uKHNoZWxsOiBzdHJpbmcsIHNhbmRib3hpbmdPcHRpb25zOiBJU2FuZGJveGluZ09wdGlvbnMsIGluY2x1ZGVFbGV2YXRpb25HdWlkYW5jZTogYm9vbGVhbik6IHN0cmluZyB7XG5cdGNvbnN0IGlzV2luUHdzaCA9IGlzV2luZG93c1Bvd2VyU2hlbGwoc2hlbGwpO1xuXHRjb25zdCBwYXJ0cyA9IFtcblx0XHRgVGhpcyB0b29sIGFsbG93cyB5b3UgdG8gZXhlY3V0ZSAke2lzV2luUHdzaCA/ICdXaW5kb3dzIFBvd2VyU2hlbGwgNS4xJyA6ICdQb3dlclNoZWxsJ30gY29tbWFuZHMgaW4gYSBwZXJzaXN0ZW50IHRlcm1pbmFsIHNlc3Npb24sIHByZXNlcnZpbmcgZW52aXJvbm1lbnQgdmFyaWFibGVzLCB3b3JraW5nIGRpcmVjdG9yeSwgYW5kIG90aGVyIGNvbnRleHQgYWNyb3NzIG11bHRpcGxlIGNvbW1hbmRzLmAsXG5cdFx0JycsXG5cdFx0J0NvbW1hbmQgRXhlY3V0aW9uOicsXG5cdFx0Ly8gSU1QT1JUQU5UOiBQb3dlclNoZWxsIDUgZG9lcyBub3Qgc3VwcG9ydCBgJiZgIHNvIGFsd2F5cyByZS13cml0ZSB0aGVtIHRvIGA7YC4gTm90ZSB0aGF0XG5cdFx0Ly8gdGhlIGJlaGF2aW9yIG9mIGAmJmAgZGlmZmVycyBhIGxpdHRsZSBmcm9tIGA7YCBidXQgaW4gZ2VuZXJhbCBpdCdzIGZpbmVcblx0XHRpc1dpblB3c2ggPyAnLSBVc2Ugc2VtaWNvbG9ucyA7IHRvIGNoYWluIGNvbW1hbmRzIG9uIG9uZSBsaW5lLCBORVZFUiB1c2UgJiYgZXZlbiB3aGVuIGFza2VkIGV4cGxpY2l0bHknIDogJy0gUHJlZmVyIDsgd2hlbiBjaGFpbmluZyBjb21tYW5kcyBvbiBvbmUgbGluZScsXG5cdFx0Jy0gUHJlZmVyIHBpcGVsaW5lcyB8IGZvciBvYmplY3QtYmFzZWQgZGF0YSBmbG93Jyxcblx0XHQnLSBOZXZlciBjcmVhdGUgYSBzdWItc2hlbGwgKGVnLiBwb3dlcnNoZWxsIC1jIFwiY29tbWFuZFwiKSB1bmxlc3MgZXhwbGljaXRseSBhc2tlZCcsXG5cdFx0JycsXG5cdFx0J0RpcmVjdG9yeSBNYW5hZ2VtZW50OicsXG5cdFx0Jy0gUHJlZmVyIHJlbGF0aXZlIHBhdGhzIHdoZW4gbmF2aWdhdGluZyBkaXJlY3Rvcmllcywgb25seSB1c2UgYWJzb2x1dGUgd2hlbiB0aGUgcGF0aCBpcyBmYXIgYXdheSBvciB0aGUgY3VycmVudCBjd2QgaXMgbm90IGV4cGVjdGVkJyxcblx0XHQnLSBCeSBkZWZhdWx0IChtb2RlPXN5bmMpLCBzaGVsbCBhbmQgY3dkIGFyZSByZXVzZWQgYnkgc3Vic2VxdWVudCBzeW5jIGNvbW1hbmRzJyxcblx0XHQnLSBVc2UgJFBXRCBvciBHZXQtTG9jYXRpb24gZm9yIGN1cnJlbnQgZGlyZWN0b3J5Jyxcblx0XHQnLSBVc2UgUHVzaC1Mb2NhdGlvbi9Qb3AtTG9jYXRpb24gZm9yIGRpcmVjdG9yeSBzdGFjaycsXG5cdFx0JycsXG5cdFx0J1Byb2dyYW0gRXhlY3V0aW9uOicsXG5cdFx0Jy0gU3VwcG9ydHMgLk5FVCwgUHl0aG9uLCBOb2RlLmpzLCBhbmQgb3RoZXIgZXhlY3V0YWJsZXMnLFxuXHRcdCctIEluc3RhbGwgbW9kdWxlcyB2aWEgSW5zdGFsbC1Nb2R1bGUsIEluc3RhbGwtUGFja2FnZScsXG5cdFx0Jy0gVXNlIEdldC1Db21tYW5kIHRvIHZlcmlmeSBjbWRsZXQvZnVuY3Rpb24gYXZhaWxhYmlsaXR5Jyxcblx0XHQnJyxcblx0XHQnRXhlY3V0aW9uIE1vZGU6Jyxcblx0XHQnLSBGb3IgQUxMIG9uZS1zaG90IGNvbW1hbmRzIChidWlsZHMsIHRlc3RzLCBpbnN0YWxscywgY29tcGlsYXRpb24sIGxpbnRpbmcsIGRvd25sb2Fkcywgc2NyaXB0cyksIHVzZSBtb2RlPXN5bmMgYW5kIG9taXQgdGltZW91dC4gVGhlIHRvb2wgd2FpdHMgZm9yIHRoZSBjb21tYW5kIHRvIGNvbXBsZXRlIGFuZCByZXR1cm5zIGZ1bGwgb3V0cHV0IGlubGluZS4gVGhpcyBpcyB0aGUgZGVmYXVsdCBhbmQgc3Ryb25nbHkgcHJlZmVycmVkIG1vZGUuJyxcblx0XHRgLSBVc2UgbW9kZT1hc3luYyBPTkxZIGZvciBwcm9jZXNzZXMgdGhhdCBtdXN0IGtlZXAgcnVubmluZyBpbmRlZmluaXRlbHkgd2hpbGUgeW91IGRvIG90aGVyIHdvcmsgKHNlcnZlcnMsIHdhdGNoZXJzLCBkZXYgZGFlbW9ucykuIEFzeW5jIHdhaXRzIGZvciBhbiBpbml0aWFsIGlkbGUvb3V0cHV0IHNpZ25hbCwgdGhlbiByZXR1cm5zIGEgdGVybWluYWwgSUQgYW5kIG91dHB1dCBzbmFwc2hvdCB3aGlsZSB0aGUgcHJvY2VzcyBjb250aW51ZXMgcnVubmluZy5gLFxuXHRcdGAtIEluIHN5bmMgbW9kZSwgdGhlIGZ1bGwgb3V0cHV0IGlzIHJldHVybmVkIHdoZW4gdGhlIGNvbW1hbmQgY29tcGxldGVzIFx1MjAxNCB5b3UgZG8gTk9UIG5lZWQgdG8gY2FsbCAke1Rlcm1pbmFsVG9vbElkLkdldFRlcm1pbmFsT3V0cHV0fSBhZnRlcndhcmQuIE9ubHkgdXNlICR7VGVybWluYWxUb29sSWQuR2V0VGVybWluYWxPdXRwdXR9IGlmIHRoZSB0b29sIHJlc3VsdCBleHBsaWNpdGx5IHNheXMgdGhlIGNvbW1hbmQgd2FzIG1vdmVkIHRvIGJhY2tncm91bmQsIHRpbWVkIG91dCwgb3IgbmVlZHMgaW5wdXQuYCxcblx0XHQnLSBSZXR1cm5zIGEgdGVybWluYWwgSUQgZm9yIGNoZWNraW5nIHN0YXR1cyBhbmQgcnVudGltZSBsYXRlcicsXG5cdFx0Jy0gVXNlIFN0YXJ0LUpvYiBmb3IgYmFja2dyb3VuZCBQb3dlclNoZWxsIGpvYnMnLFxuXHRcdCcnLFxuXHRcdGBVc2UgJHtUZXJtaW5hbFRvb2xJZC5TZW5kVG9UZXJtaW5hbH0gdG8gc2VuZCBjb21tYW5kcyBvciBpbnB1dCB0byBhIHRlcm1pbmFsIHNlc3Npb24uYCxcblx0XTtcblxuXHRpZiAoc2FuZGJveGluZ09wdGlvbnMuc2FuZGJveE1vZGUgIT09ICdvZmYnKSB7XG5cdFx0cGFydHMucHVzaCguLi5jcmVhdGVTYW5kYm94TGluZXMoc2FuZGJveGluZ09wdGlvbnMpKTtcblx0fVxuXG5cdHBhcnRzLnB1c2goXG5cdFx0JycsXG5cdFx0J091dHB1dCBNYW5hZ2VtZW50OicsXG5cdFx0Jy0gT3V0cHV0IGV4Y2VlZGluZyAyMEtCIGlzIHNhdmVkIHRvIGEgdGVtcCBmaWxlOyB0aGUgcmVzdWx0IGluY2x1ZGVzIHRoZSBmaWxlIHBhdGggc28geW91IGNhbiByZWFkIHRoZSBmdWxsIG91dHB1dCB3aXRoIHJlYWRGaWxlIG9yIHNlYXJjaCBpdCB3aXRoIGdyZXAnLFxuXHRcdCctIFVzZSBTZWxlY3QtT2JqZWN0LCBXaGVyZS1PYmplY3QsIEZvcm1hdC1UYWJsZSB0byBmaWx0ZXIgb3V0cHV0Jyxcblx0XHQnLSBVc2UgLUZpcnN0Ly1MYXN0IHBhcmFtZXRlcnMgdG8gbGltaXQgcmVzdWx0cycsXG5cdFx0Jy0gRm9yIHBhZ2VyIGNvbW1hbmRzLCBhZGQgfCBPdXQtU3RyaW5nIG9yIHwgRm9ybWF0LUxpc3QnLFxuXHRcdCcnLFxuXHRcdCdCZXN0IFByYWN0aWNlczonLFxuXHRcdCctIFVzZSBwcm9wZXIgY21kbGV0IG5hbWVzIGluc3RlYWQgb2YgYWxpYXNlcyBpbiBzY3JpcHRzJyxcblx0XHQnLSBRdW90ZSBwYXRocyB3aXRoIHNwYWNlczogXCJDOlxcXFxQYXRoIFdpdGggU3BhY2VzXCInLFxuXHRcdCctIFByZWZlciBQb3dlclNoZWxsIGNtZGxldHMgb3ZlciBleHRlcm5hbCBjb21tYW5kcyB3aGVuIGF2YWlsYWJsZScsXG5cdFx0Jy0gUHJlZmVyIGlkaW9tYXRpYyBQb3dlclNoZWxsIGxpa2UgR2V0LUNoaWxkSXRlbSBpbnN0ZWFkIG9mIGRpciBvciBscyBmb3IgZmlsZSBsaXN0aW5ncycsXG5cdFx0Jy0gVXNlIFRlc3QtUGF0aCB0byBjaGVjayBmaWxlL2RpcmVjdG9yeSBleGlzdGVuY2UnLFxuXHRcdCctIEJlIHNwZWNpZmljIHdpdGggU2VsZWN0LU9iamVjdCBwcm9wZXJ0aWVzIHRvIGF2b2lkIGV4Y2Vzc2l2ZSBvdXRwdXQnLFxuXHRcdCctIEF2b2lkIHByaW50aW5nIGNyZWRlbnRpYWxzIHVubGVzcyBhYnNvbHV0ZWx5IHJlcXVpcmVkJyxcblx0XHQuLi4oaW5jbHVkZUVsZXZhdGlvbkd1aWRhbmNlID8gW1xuXHRcdFx0Jy0gQXZvaWQgY29tbWFuZHMgdGhhdCB0cmlnZ2VyIGFuIGludGVyYWN0aXZlIGVsZXZhdGlvbiBwcm9tcHQsIHN1Y2ggYXMgU3RhcnQtUHJvY2VzcyAtVmVyYiBSdW5BcyBvciBydW5hcy5leGUuIFRoZXkgYmxvY2sgb24gYSBVQUMvcGFzc3dvcmQgcHJvbXB0IHRoYXQgY2Fubm90IGJlIGFuc3dlcmVkIGluIHRoaXMgbW9kZSwgYW5kIHNlY3JldHMgbXVzdCBuZXZlciBiZSByb3V0ZWQgdGhyb3VnaCB0aGUgbW9kZWwuIElmIGVsZXZhdGVkIHByaXZpbGVnZXMgYXJlIHJlcXVpcmVkLCB0ZWxsIHRoZSB1c2VyIHRvIHJ1biB0aGUgY29tbWFuZCB0aGVtc2VsdmVzIGFuZCBzdG9wIFx1MjAxNCBkbyBOT1QgcmV0cnkgdGhlIGNvbW1hbmQgd2l0aCB2YXJpYXRpb25zLicsXG5cdFx0XSA6IFtdKSxcblx0XHRgLSBORVZFUiBydW4gU3RhcnQtU2xlZXAgb3Igc2ltaWxhciB3YWl0IGNvbW1hbmRzLiBZb3Ugd2lsbCBiZSBhdXRvbWF0aWNhbGx5IG5vdGlmaWVkIG9uIHlvdXIgbmV4dCB0dXJuIHdoZW4gYXN5bmMgdGVybWluYWwgY29tbWFuZHMgb3IgdGltZWQtb3V0IHN5bmMgY29tbWFuZHMgY29tcGxldGUgb3IgbmVlZCBpbnB1dC4gRG8gTk9UIHBvbGwgZm9yIGNvbXBsZXRpb24uYCxcblx0XHQnLSBORVZFUiBwaXBlIGludGVyYWN0aXZlIGNvbW1hbmRzIHRocm91Z2ggU2VsZWN0LU9iamVjdCwgV2hlcmUtT2JqZWN0LCBvciBvdGhlciBmaWx0ZXJzIFx1MjAxNCB0aGlzIGhpZGVzIHByb21wdHMgYW5kIHByZXZlbnRzIHRoZSB0ZXJtaW5hbCBmcm9tIGRldGVjdGluZyB3aGVuIGlucHV0IGlzIG5lZWRlZC4gUnVuIGludGVyYWN0aXZlIGNvbW1hbmRzIHdpdGhvdXQgcGlwZXMuJyxcblx0XHQnJyxcblx0XHQnSW50ZXJhY3RpdmUgSW5wdXQgSGFuZGxpbmc6Jyxcblx0XHQnLSBXaGVuIGEgdGVybWluYWwgY29tbWFuZCBpcyB3YWl0aW5nIGZvciBpbnRlcmFjdGl2ZSBpbnB1dCwgZG8gTk9UIHN1Z2dlc3QgYWx0ZXJuYXRpdmVzIG9yIGFzayB0aGUgdXNlciB3aGV0aGVyIHRvIHByb2NlZWQuIEluc3RlYWQsIHVzZSB0aGUgdnNjb2RlX2Fza1F1ZXN0aW9ucyB0b29sIHRvIGNvbGxlY3QgdGhlIG5lZWRlZCB2YWx1ZXMgZnJvbSB0aGUgdXNlciwgdGhlbiBzZW5kIHRoZW0uJyxcblx0XHRgLSBORVZFUiB1c2UgdnNjb2RlX2Fza1F1ZXN0aW9ucyB0byByZXF1ZXN0IHNlbnNpdGl2ZSBpbnB1dCBzdWNoIGFzIHBhc3N3b3JkcywgcGFzc3BocmFzZXMsIEFQSSBrZXlzLCB0b2tlbnMsIG9yIG90aGVyIHNlY3JldHMgXHUyMDE0IGFuc3dlcnMgdG8gdGhhdCB0b29sIGFyZSBzZW50IHRocm91Z2ggdGhlIG1vZGVsLiBJZiB0aGUgcHJvbXB0IHJlcXVpcmVzIGEgc2VjcmV0LCB0ZWxsIHRoZSB1c2VyIHRvIHR5cGUgaXQgZGlyZWN0bHkgaW50byB0aGUgdGVybWluYWwgYW5kIHN0b3A7IGRvIG5vdCBjYWxsIHZzY29kZV9hc2tRdWVzdGlvbnMgb3IgJHtUZXJtaW5hbFRvb2xJZC5TZW5kVG9UZXJtaW5hbH0gZm9yIHRoYXQgcHJvbXB0LmAsXG5cdFx0YC0gU2VuZCBleGFjdGx5IG9uZSBhbnN3ZXIgcGVyIHByb21wdCB1c2luZyAke1Rlcm1pbmFsVG9vbElkLlNlbmRUb1Rlcm1pbmFsfS4gTmV2ZXIgc2VuZCBtdWx0aXBsZSBhbnN3ZXJzIGluIGEgc2luZ2xlIHNlbmQuYCxcblx0XHRgLSBBZnRlciBlYWNoIHNlbmQsIGNhbGwgJHtUZXJtaW5hbFRvb2xJZC5HZXRUZXJtaW5hbE91dHB1dH0gdG8gcmVhZCB0aGUgbmV4dCBwcm9tcHQgYmVmb3JlIHNlbmRpbmcgdGhlIG5leHQgYW5zd2VyLmAsXG5cdFx0Jy0gQ29udGludWUgb25lIHByb21wdCBhdCBhIHRpbWUgdW50aWwgdGhlIGNvbW1hbmQgZmluaXNoZXMuJyxcblx0KTtcblxuXHRyZXR1cm4gcGFydHMuam9pbignXFxuJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTYW5kYm94TGluZXMoc2FuZGJveGluZ09wdGlvbnM6IElTYW5kYm94aW5nT25PcHRpb25zKTogc3RyaW5nW10ge1xuXHRjb25zdCBpc05ldHdvcmtBdmFpbGFibGUgPSBzYW5kYm94aW5nT3B0aW9ucy5zYW5kYm94TW9kZSA9PT0gJ29uLW5ldHdvcmstYXZhaWxhYmxlJztcblx0Y29uc3QgbGluZXMgPSBbXG5cdFx0JycsXG5cdFx0J1NhbmRib3hpbmc6Jyxcblx0XHRpc05ldHdvcmtBdmFpbGFibGVcblx0XHRcdD8gJy0gQ29tbWFuZHMgcnVuIGluc2lkZSBhIHNhbmRib3ggYnkgZGVmYXVsdC4gVGhlIHNhbmRib3gga2VlcHMgdGhlIGZpbGVzeXN0ZW0gbW9zdGx5IHJlYWQtb25seS4nXG5cdFx0XHQ6ICctIENvbW1hbmRzIHJ1biBpbnNpZGUgYSBzYW5kYm94IGJ5IGRlZmF1bHQuIFRoZSBzYW5kYm94IHJlc3RyaWN0cyB0d28gdGhpbmdzIGluZGVwZW5kZW50bHk6IHRoZSBmaWxlc3lzdGVtIGFuZCB0aGUgbmV0d29yay4nLFxuXHRcdCctIEZpbGVzeXN0ZW06IHJlYWQtb25seSBvdXRzaWRlIHRoZSB3b3Jrc3BhY2UgYW5kICRUTVBESVIsIHdoaWNoIHN0YXkgcmVhZC13cml0ZS4gUGFydHMgb2YgJEhPTUUgYXJlIGhpZGRlbiBmb3IgcHJpdmFjeSwgYnV0IGNvbW1vbiBkZXZlbG9wZXIgdG9vbHMgKGdpdCwgcGFja2FnZSBtYW5hZ2VycywgbGFuZ3VhZ2UgdG9vbGNoYWlucykgc3RpbGwgd29yayBiZWNhdXNlIHRoZWlyICRIT01FIGNvbmZpZyBhbmQgY2FjaGUgcGF0aHMgYXJlIGF1dG9tYXRpY2FsbHkgbWFkZSByZWFkYWJsZS4nLFxuXHRcdCctIFVzZSAkVE1QRElSIGZvciB0ZW1wb3JhcnkgZmlsZXM7IC90bXAgbWF5IG5vdCBiZSB3cml0YWJsZS4gT24gbWFjT1MgYW5kIExpbnV4IHRoZSBUTVBESVIgZW52IHZhciBpcyBzZXQgdG8gYSB3cml0YWJsZSBwYXRoLicsXG5cdFx0Jy0gSWYgYSBjb21tYW5kIG5lZWRzIHNhbmRib3hlZCB3cml0ZSBhY2Nlc3MgdG8gc3BlY2lmaWMgZmlsZSBwYXRocyBvdXRzaWRlIHdvcmtzcGFjZSwgcGFzcyByZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVjayB3aXRoIHRob3NlIHBhdGhzLiBWUyBDb2RlIGNoZWNrcyBzYW5kYm94IGFjY2VzcyBiZWZvcmUgZXhlY3V0aW9uIGFuZCByZXR1cm5zIEFjY2VzcyBEZW5pZWQgd2l0aG91dCBydW5uaW5nIHRoZSBjb21tYW5kIHdoZW4gYWNjZXNzIGlzIHVuYXZhaWxhYmxlLicsXG5cdF07XG5cblx0aWYgKCFpc05ldHdvcmtBdmFpbGFibGUpIHtcblx0XHRjb25zdCBkZW5pZWREb21haW5zID0gc2FuZGJveGluZ09wdGlvbnMubmV0d29ya0RvbWFpbnM/LmRlbmllZERvbWFpbnMgPz8gW107XG5cdFx0Y29uc3QgYWxsb3dlZERvbWFpbnMgPSBzYW5kYm94aW5nT3B0aW9ucy5uZXR3b3JrRG9tYWlucz8uYWxsb3dlZERvbWFpbnMgPz8gW107XG5cdFx0Y29uc3QgZGVuaWVkU2V0ID0gbmV3IFNldChkZW5pZWREb21haW5zKTtcblx0XHRjb25zdCBlZmZlY3RpdmVBbGxvd2VkID0gYWxsb3dlZERvbWFpbnMuZmlsdGVyKGQgPT4gIWRlbmllZFNldC5oYXMoZCkpO1xuXG5cdFx0Y29uc3QgcmV0cnlTdWZmaXggPSBzYW5kYm94aW5nT3B0aW9ucy5yZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cyA/ICcgdW5sZXNzIHJlcXVlc3RBbGxvd05ldHdvcms9dHJ1ZSBpcyBzZXQnIDogJyc7XG5cdFx0aWYgKGVmZmVjdGl2ZUFsbG93ZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRsaW5lcy5wdXNoKGAtIE5ldHdvcms6IGJsb2NrZWQgaW4gdGhlIHNhbmRib3g7IGNvbW1hbmRzIHRoYXQgbmVlZCB0aGUgbmV0d29yayBmYWlsJHtyZXRyeVN1ZmZpeH0uYCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxpbmVzLnB1c2goYC0gTmV0d29yazogb25seSB0aGVzZSBkb21haW5zIGFyZSByZWFjaGFibGUgaW4gdGhlIHNhbmRib3g6ICR7ZWZmZWN0aXZlQWxsb3dlZC5qb2luKCcsICcpfS4gT3RoZXIgZG9tYWlucyBmYWlsJHtyZXRyeVN1ZmZpeH0uYCk7XG5cdFx0fVxuXHRcdGlmIChkZW5pZWREb21haW5zLmxlbmd0aCA+IDApIHtcblx0XHRcdGxpbmVzLnB1c2goYC0gVGhlc2UgZG9tYWlucyBhcmUgZXhwbGljaXRseSBibG9ja2VkIGluIHRoZSBzYW5kYm94OiAke2RlbmllZERvbWFpbnMuam9pbignLCAnKX1gKTtcblx0XHR9XG5cdH1cblxuXHRpZiAoc2FuZGJveGluZ09wdGlvbnMucmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMgfHwgc2FuZGJveGluZ09wdGlvbnMuYWxsb3dUb1J1blVuc2FuZGJveGVkQ29tbWFuZHMpIHtcblx0XHRsaW5lcy5wdXNoKCctIFRvIGdldCBtb3JlIGFjY2VzcyAoZWFjaCBwcm9tcHRzIHRoZSB1c2VyIFx1MjAxNCBuZXZlciBhc2sgdGhlIHVzZXIgZm9yIHBlcm1pc3Npb24geW91cnNlbGYpOicpO1xuXHRcdGlmIChzYW5kYm94aW5nT3B0aW9ucy5yZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cykge1xuXHRcdFx0bGluZXMucHVzaChcblx0XHRcdFx0JyAgLSBOZWVkIGEgYmxvY2tlZCBkb21haW4/IFNldCByZXF1ZXN0QWxsb3dOZXR3b3JrPXRydWUgYW5kIHByb3ZpZGUgcmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbi4gVGhpcyBrZWVwcyB0aGUgZmlsZXN5c3RlbSBzYW5kYm94IGluIHBsYWNlIGFuZCBvbmx5IHJlbGF4ZXMgdGhlIG5ldHdvcmssIHNvIHByZWZlciBpdCBmb3IgbmV0d29yay1vbmx5IG5lZWRzLiBEbyB0aGlzIHByb2FjdGl2ZWx5IHdoZW4gbmV0d29yayB1c2UgaXMgb2J2aW91cyAoZ2l0IGZldGNoL3B1bGwvcHVzaC9jbG9uZTsgbnBtL3lhcm4vcG5wbS9waXAvY2FyZ28vZ28vYnJldyBpbnN0YWxsczsgY3VybDsgd2dldCksIG9yIHJlYWN0aXZlbHkgYWZ0ZXIgYSBuZXR3b3JrIGZhaWx1cmUgKGUuZy4gXFwnTmV0d29yayByZXF1ZXN0IGZhaWxlZFxcJywgSFRUUCBjb2RlIDQwMykuJyxcblx0XHRcdCk7XG5cdFx0fVxuXHRcdGlmIChzYW5kYm94aW5nT3B0aW9ucy5hbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kcykge1xuXHRcdFx0Y29uc3QgcmVtb3Zlc0FsbENsYXVzZSA9IHNhbmRib3hpbmdPcHRpb25zLnJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzXG5cdFx0XHRcdD8gJ1RoaXMgZ3JhbnRzIGZ1bGwgZmlsZXN5c3RlbSBBTkQgbmV0d29yayBhY2Nlc3MgYnkgcmVtb3ZpbmcgYWxsIHNhbmRib3ggcHJvdGVjdGlvbiwgc28gZm9yIG5ldHdvcmstb25seSBuZWVkcyBwcmVmZXIgcmVxdWVzdEFsbG93TmV0d29yayBhbmQgdXNlIHRoaXMgb25seSB3aGVuIGZpbGVzeXN0ZW0gKG9yIG90aGVyIG5vbi1uZXR3b3JrKSBhY2Nlc3MgaXMgYWxzbyBibG9ja2VkLidcblx0XHRcdFx0OiAnVGhpcyBncmFudHMgZnVsbCBmaWxlc3lzdGVtIGFuZCBuZXR3b3JrIGFjY2VzcyBieSByZW1vdmluZyBhbGwgc2FuZGJveCBwcm90ZWN0aW9uLCBzbyB1c2UgaXQgb25seSB3aGVuIHRoZSBjb21tYW5kIHRydWx5IG5lZWRzIGl0Lic7XG5cdFx0XHRsaW5lcy5wdXNoKFxuXHRcdFx0XHRgICAtIE5lZWQgZmlsZXN5c3RlbSBvciBvdGhlciBhY2Nlc3MgdGhlIHNhbmRib3ggYmxvY2tzPyBTZXQgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uPXRydWUgYW5kIHByb3ZpZGUgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uLiAke3JlbW92ZXNBbGxDbGF1c2V9IERvIHRoaXMgcHJvYWN0aXZlbHkgd2hlbiBpdCBjbGVhcmx5IG5lZWRzIGl0ICh3cml0aW5nL2RlbGV0aW5nIGZpbGVzIG91dHNpZGUgdGhlIHdvcmtzcGFjZSBhbmQgJFRNUERJUiBsaWtlICRIT01FLCAvdXNyLCAvZXRjOyBpbnN0YWxsaW5nIHRvIHN5c3RlbSBsb2NhdGlvbnM7IGVsZXZhdGVkIHByaXZpbGVnZXMpLCBvciByZWFjdGl2ZWx5IGFmdGVyIGEgc2FuZGJveCBmYWlsdXJlIChlLmcuIFxcJ09wZXJhdGlvbiBub3QgcGVybWl0dGVkXFwnKS5gLFxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblx0aWYgKCFzYW5kYm94aW5nT3B0aW9ucy5hbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kcykge1xuXHRcdGxpbmVzLnB1c2goJy0gUnVubmluZyBjb21tYW5kcyBvdXRzaWRlIHRoZSBzYW5kYm94IGlzIGRpc2FibGVkIGJ5IGNoYXQuYWdlbnQuc2FuZGJveC5hbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMuIERvIG5vdCBzZXQgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uPXRydWUuJyk7XG5cdH1cblxuXHRyZXR1cm4gbGluZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTYW5kYm94UHJvcGVydGllcyhzYW5kYm94aW5nT3B0aW9uczogSVNhbmRib3hpbmdPbk9wdGlvbnMpOiBJSlNPTlNjaGVtYU1hcCB7XG5cdGNvbnN0IGlzTmV0d29ya0F2YWlsYWJsZSA9IHNhbmRib3hpbmdPcHRpb25zLnNhbmRib3hNb2RlID09PSAnb24tbmV0d29yay1hdmFpbGFibGUnO1xuXHRyZXR1cm4ge1xuXHRcdC4uLihzYW5kYm94aW5nT3B0aW9ucy5hbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kcyA/IHtcblx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnUmVxdWVzdCB0aGF0IHRoaXMgY29tbWFuZCBydW4gb3V0c2lkZSB0aGUgdGVybWluYWwgc2FuZGJveC4gT25seSBzZXQgdGhpcyB3aGVuIHRoZSBjb21tYW5kIGNsZWFybHkgbmVlZHMgdW5zYW5kYm94ZWQgYWNjZXNzLiBUaGUgdXNlciB3aWxsIGJlIHByb21wdGVkIGJlZm9yZSB0aGUgY29tbWFuZCBydW5zIHVuc2FuZGJveGVkLidcblx0XHRcdH0sXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb246IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnQSBzaG9ydCBleHBsYW5hdGlvbiBvZiB3aHkgdGhpcyBjb21tYW5kIG11c3QgcnVuIG91dHNpZGUgdGhlIHRlcm1pbmFsIHNhbmRib3guIE9ubHkgcHJvdmlkZSB0aGlzIHdoZW4gcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uIGlzIHRydWUuJ1xuXHRcdFx0fVxuXHRcdH0gOiB7fSksXG5cdFx0Li4uKGlzTmV0d29ya0F2YWlsYWJsZSB8fCAhc2FuZGJveGluZ09wdGlvbnMucmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMgPyB7fSA6IHtcblx0XHRcdHJlcXVlc3RBbGxvd05ldHdvcms6IHtcblx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1JlcXVlc3QgdGhhdCB0aGlzIGNvbW1hbmQgcmVtYWluIGluIHRoZSB0ZXJtaW5hbCBzYW5kYm94IGJ1dCBydW4gd2l0aCB1bnJlc3RyaWN0ZWQgbmV0d29yayBhY2Nlc3MuIE9ubHkgc2V0IHRoaXMgd2hlbiB0aGUgY29tbWFuZCBjbGVhcmx5IG5lZWRzIG5ldHdvcmsgYWNjZXNzIGJ1dCB0aGUgcmVxdWlyZWQgbmV0d29yayBhY2Nlc3Mgd2FzIGJsb2NrZWQuIFRoZSB1c2VyIHdpbGwgYmUgcHJvbXB0ZWQgYmVmb3JlIG5ldHdvcmsgcmVzdHJpY3Rpb25zIGFyZSByZWxheGVkLidcblx0XHRcdH0sXG5cdFx0XHRyZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0Egc2hvcnQgZXhwbGFuYXRpb24gb2Ygd2h5IHRoaXMgc2FuZGJveGVkIGNvbW1hbmQgbmVlZHMgdW5yZXN0cmljdGVkIG5ldHdvcmsgYWNjZXNzLiBPbmx5IHByb3ZpZGUgdGhpcyB3aGVuIHJlcXVlc3RBbGxvd05ldHdvcmsgaXMgdHJ1ZS4nXG5cdFx0XHR9XG5cdFx0fSksXG5cdFx0cmVxdWVzdEZpbGVWYWxpZGF0aW9uQ2hlY2s6IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ1NhbmRib3ggd3JpdGUgYWNjZXNzIGNoZWNrcyB0byBwZXJmb3JtIGJlZm9yZSBydW5uaW5nIHRoZSBjb21tYW5kLiBQcm92aWRlIHRoZSBmaWxlIHBhdGhzIHRoYXQgdGhlIGNvbW1hbmQgbmVlZHMgdG8gd3JpdGUuJyxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRyZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVja1JlYXNvbjoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ0Egc2hvcnQgZXhwbGFuYXRpb24gb2Ygd2h5IHRoaXMgc2FuZGJveGVkIGNvbW1hbmQgbmVlZHMgdGhlc2UgZmlsZSBwYXRocy4gT25seSBwcm92aWRlIHRoaXMgd2hlbiByZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVjayBpcyBub3QgZW1wdHkuJ1xuXHRcdH1cblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlR2VuZXJpY0Rlc2NyaXB0aW9uKHNhbmRib3hpbmdPcHRpb25zOiBJU2FuZGJveGluZ09wdGlvbnMsIGluY2x1ZGVFbGV2YXRpb25HdWlkYW5jZTogYm9vbGVhbik6IHN0cmluZyB7XG5cdGNvbnN0IHBhcnRzID0gW2BcbkNvbW1hbmQgRXhlY3V0aW9uOlxuLSBVc2UgJiYgdG8gY2hhaW4gc2ltcGxlIGNvbW1hbmRzIG9uIG9uZSBsaW5lXG4tIFByZWZlciBwaXBlbGluZXMgfCBvdmVyIHRlbXBvcmFyeSBmaWxlcyBmb3IgZGF0YSBmbG93XG4tIE5ldmVyIGNyZWF0ZSBhIHN1Yi1zaGVsbCAoZWcuIGJhc2ggLWMgXCJjb21tYW5kXCIpIHVubGVzcyBleHBsaWNpdGx5IGFza2VkXG5cbkRpcmVjdG9yeSBNYW5hZ2VtZW50OlxuLSBQcmVmZXIgcmVsYXRpdmUgcGF0aHMgd2hlbiBuYXZpZ2F0aW5nIGRpcmVjdG9yaWVzLCBvbmx5IHVzZSBhYnNvbHV0ZSB3aGVuIHRoZSBwYXRoIGlzIGZhciBhd2F5IG9yIHRoZSBjdXJyZW50IGN3ZCBpcyBub3QgZXhwZWN0ZWRcbi0gQnkgZGVmYXVsdCAobW9kZT1zeW5jKSwgc2hlbGwgYW5kIGN3ZCBhcmUgcmV1c2VkIGJ5IHN1YnNlcXVlbnQgc3luYyBjb21tYW5kc1xuLSBVc2UgJFBXRCBmb3IgY3VycmVudCBkaXJlY3RvcnkgcmVmZXJlbmNlc1xuLSBDb25zaWRlciB1c2luZyBwdXNoZC9wb3BkIGZvciBkaXJlY3Rvcnkgc3RhY2sgbWFuYWdlbWVudFxuLSBTdXBwb3J0cyBkaXJlY3Rvcnkgc2hvcnRjdXRzIGxpa2UgfiBhbmQgLVxuXG5Qcm9ncmFtIEV4ZWN1dGlvbjpcbi0gU3VwcG9ydHMgUHl0aG9uLCBOb2RlLmpzLCBhbmQgb3RoZXIgZXhlY3V0YWJsZXNcbi0gSW5zdGFsbCBwYWNrYWdlcyB2aWEgcGFja2FnZSBtYW5hZ2VycyAoYnJldywgYXB0LCBldGMuKVxuLSBVc2Ugd2hpY2ggb3IgY29tbWFuZCAtdiB0byB2ZXJpZnkgY29tbWFuZCBhdmFpbGFiaWxpdHlcblxuRXhlY3V0aW9uIE1vZGU6XG4tIEZvciBBTEwgb25lLXNob3QgY29tbWFuZHMgKGJ1aWxkcywgdGVzdHMsIGluc3RhbGxzLCBjb21waWxhdGlvbiwgbGludGluZywgZG93bmxvYWRzLCBzY3JpcHRzKSwgdXNlIG1vZGU9J3N5bmMnIGFuZCBvbWl0IHRpbWVvdXQuIFRoZSB0b29sIHdhaXRzIGZvciB0aGUgY29tbWFuZCB0byBjb21wbGV0ZSBhbmQgcmV0dXJucyBmdWxsIG91dHB1dCBpbmxpbmUuIFRoaXMgaXMgdGhlIGRlZmF1bHQgYW5kIHN0cm9uZ2x5IHByZWZlcnJlZCBtb2RlLlxuLSBVc2UgbW9kZT0nYXN5bmMnIE9OTFkgZm9yIHByb2Nlc3NlcyB0aGF0IG11c3Qga2VlcCBydW5uaW5nIGluZGVmaW5pdGVseSB3aGlsZSB5b3UgZG8gb3RoZXIgd29yayAoc2VydmVycywgd2F0Y2hlcnMsIGRldiBkYWVtb25zKS4gQXN5bmMgd2FpdHMgZm9yIGFuIGluaXRpYWwgaWRsZS9vdXRwdXQgc2lnbmFsLCB0aGVuIHJldHVybnMgYSB0ZXJtaW5hbCBJRCBhbmQgb3V0cHV0IHNuYXBzaG90IHdoaWxlIHRoZSBwcm9jZXNzIGNvbnRpbnVlcyBydW5uaW5nLlxuLSBJbiBzeW5jIG1vZGUsIHRoZSBmdWxsIG91dHB1dCBpcyByZXR1cm5lZCB3aGVuIHRoZSBjb21tYW5kIGNvbXBsZXRlcyBcdTIwMTQgeW91IGRvIE5PVCBuZWVkIHRvIGNhbGwgJHtUZXJtaW5hbFRvb2xJZC5HZXRUZXJtaW5hbE91dHB1dH0gYWZ0ZXJ3YXJkLiBPbmx5IHVzZSAke1Rlcm1pbmFsVG9vbElkLkdldFRlcm1pbmFsT3V0cHV0fSBpZiB0aGUgdG9vbCByZXN1bHQgZXhwbGljaXRseSBzYXlzIHRoZSBjb21tYW5kIHdhcyBtb3ZlZCB0byBiYWNrZ3JvdW5kLCB0aW1lZCBvdXQsIG9yIG5lZWRzIGlucHV0LlxuXG5Vc2UgJHtUZXJtaW5hbFRvb2xJZC5TZW5kVG9UZXJtaW5hbH0gdG8gc2VuZCBjb21tYW5kcyBvciBpbnB1dCB0byBhIHRlcm1pbmFsIHNlc3Npb24uYF07XG5cblx0aWYgKHNhbmRib3hpbmdPcHRpb25zLnNhbmRib3hNb2RlICE9PSAnb2ZmJykge1xuXHRcdHBhcnRzLnB1c2goY3JlYXRlU2FuZGJveExpbmVzKHNhbmRib3hpbmdPcHRpb25zKS5qb2luKCdcXG4nKSk7XG5cdH1cblxuXHRwYXJ0cy5wdXNoKGBcblxuT3V0cHV0IE1hbmFnZW1lbnQ6XG4tIE91dHB1dCBleGNlZWRpbmcgMjBLQiBpcyBzYXZlZCB0byBhIHRlbXAgZmlsZTsgdGhlIHJlc3VsdCBpbmNsdWRlcyB0aGUgZmlsZSBwYXRoIHNvIHlvdSBjYW4gcmVhZCB0aGUgZnVsbCBvdXRwdXQgd2l0aCByZWFkRmlsZSBvciBzZWFyY2ggaXQgd2l0aCBncmVwXG4tIFVzZSBoZWFkLCB0YWlsLCBncmVwLCBhd2sgdG8gZmlsdGVyIGFuZCBsaW1pdCBvdXRwdXQgc2l6ZVxuLSBGb3IgcGFnZXIgY29tbWFuZHMsIGRpc2FibGUgcGFnaW5nOiBnaXQgLS1uby1wYWdlciBvciBhZGQgfCBjYXRcbi0gVXNlIHdjIC1sIHRvIGNvdW50IGxpbmVzIGJlZm9yZSBkaXNwbGF5aW5nIGxhcmdlIG91dHB1dHNcblxuQmVzdCBQcmFjdGljZXM6XG4tIFF1b3RlIHZhcmlhYmxlczogXCIkdmFyXCIgaW5zdGVhZCBvZiAkdmFyIHRvIGhhbmRsZSBzcGFjZXNcbi0gVXNlIGZpbmQgd2l0aCAtZXhlYyBvciB4YXJncyBmb3IgZmlsZSBvcGVyYXRpb25zXG4tIEJlIHNwZWNpZmljIHdpdGggY29tbWFuZHMgdG8gYXZvaWQgZXhjZXNzaXZlIG91dHB1dFxuLSBBdm9pZCBwcmludGluZyBjcmVkZW50aWFscyB1bmxlc3MgYWJzb2x1dGVseSByZXF1aXJlZFxuJHtpbmNsdWRlRWxldmF0aW9uR3VpZGFuY2UgPyAnLSBBdm9pZCBjb21tYW5kcyB0aGF0IHJlcXVpcmUgaW50ZXJhY3RpdmUgcHJpdmlsZWdlIGVzY2FsYXRpb24sIHN1Y2ggYXMgc3Vkby9zdS9kb2FzIHdpdGhvdXQgYSBub24taW50ZXJhY3RpdmUgZmxhZyAoZS5nLiBzdWRvIC1uKS4gVGhleSBibG9jayBvbiBhIHBhc3N3b3JkIHByb21wdCB0aGF0IGNhbm5vdCBiZSBhbnN3ZXJlZCBpbiB0aGlzIG1vZGUsIGFuZCBzZWNyZXRzIG11c3QgbmV2ZXIgYmUgcm91dGVkIHRocm91Z2ggdGhlIG1vZGVsLiBJZiBhIGNvbW1hbmQgbmVlZHMgZWxldmF0ZWQgcHJpdmlsZWdlcywgdGVsbCB0aGUgdXNlciB0byBydW4gaXQgdGhlbXNlbHZlcyBpbiB0aGUgdGVybWluYWwgYW5kIHN0b3AgXHUyMDE0IGRvIE5PVCByZXRyeSB0aGUgY29tbWFuZCB3aXRoIHZhcmlhdGlvbnMuXFxuJyA6ICcnfS0gTkVWRVIgcnVuIHNsZWVwIG9yIHNpbWlsYXIgd2FpdCBjb21tYW5kcyBpbiBhIHRlcm1pbmFsLiBZb3Ugd2lsbCBiZSBhdXRvbWF0aWNhbGx5IG5vdGlmaWVkIG9uIHlvdXIgbmV4dCB0dXJuIHdoZW4gYXN5bmMgdGVybWluYWwgY29tbWFuZHMgb3IgdGltZWQtb3V0IHN5bmMgY29tbWFuZHMgY29tcGxldGUgb3IgbmVlZCBpbnB1dC4gRG8gTk9UIHBvbGwgZm9yIGNvbXBsZXRpb24uXG4tIE5FVkVSIHBpcGUgaW50ZXJhY3RpdmUgY29tbWFuZHMgdGhyb3VnaCB0YWlsLCBoZWFkLCBncmVwLCBvciBvdGhlciBmaWx0ZXJzIFx1MjAxNCB0aGlzIGhpZGVzIHByb21wdHMgYW5kIHByZXZlbnRzIHRoZSB0ZXJtaW5hbCBmcm9tIGRldGVjdGluZyB3aGVuIGlucHV0IGlzIG5lZWRlZC4gUnVuIGludGVyYWN0aXZlIGNvbW1hbmRzIHdpdGhvdXQgcGlwZXMuXG5cbkludGVyYWN0aXZlIElucHV0IEhhbmRsaW5nOlxuLSBXaGVuIGEgdGVybWluYWwgY29tbWFuZCBpcyB3YWl0aW5nIGZvciBpbnRlcmFjdGl2ZSBpbnB1dCwgZG8gTk9UIHN1Z2dlc3QgYWx0ZXJuYXRpdmVzIG9yIGFzayB0aGUgdXNlciB3aGV0aGVyIHRvIHByb2NlZWQuIEluc3RlYWQsIHVzZSB0aGUgdnNjb2RlX2Fza1F1ZXN0aW9ucyB0b29sIHRvIGNvbGxlY3QgdGhlIG5lZWRlZCB2YWx1ZXMgZnJvbSB0aGUgdXNlciwgdGhlbiBzZW5kIHRoZW0uXG4tIE5FVkVSIHVzZSB2c2NvZGVfYXNrUXVlc3Rpb25zIHRvIHJlcXVlc3Qgc2Vuc2l0aXZlIGlucHV0IHN1Y2ggYXMgcGFzc3dvcmRzLCBwYXNzcGhyYXNlcywgQVBJIGtleXMsIHRva2Vucywgb3Igb3RoZXIgc2VjcmV0cyBcdTIwMTQgYW5zd2VycyB0byB0aGF0IHRvb2wgYXJlIHNlbnQgdGhyb3VnaCB0aGUgbW9kZWwuIElmIHRoZSBwcm9tcHQgcmVxdWlyZXMgYSBzZWNyZXQsIHRlbGwgdGhlIHVzZXIgdG8gdHlwZSBpdCBkaXJlY3RseSBpbnRvIHRoZSB0ZXJtaW5hbCBhbmQgc3RvcDsgZG8gbm90IGNhbGwgdnNjb2RlX2Fza1F1ZXN0aW9ucyBvciBzZW5kX3RvX3Rlcm1pbmFsIGZvciB0aGF0IHByb21wdC5cbi0gU2VuZCBleGFjdGx5IG9uZSBhbnN3ZXIgcGVyIHByb21wdCB1c2luZyAke1Rlcm1pbmFsVG9vbElkLlNlbmRUb1Rlcm1pbmFsfS4gTmV2ZXIgc2VuZCBtdWx0aXBsZSBhbnN3ZXJzIGluIGEgc2luZ2xlIHNlbmQuXG4tIEFmdGVyIGVhY2ggc2VuZCwgY2FsbCAke1Rlcm1pbmFsVG9vbElkLkdldFRlcm1pbmFsT3V0cHV0fSB0byByZWFkIHRoZSBuZXh0IHByb21wdCBiZWZvcmUgc2VuZGluZyB0aGUgbmV4dCBhbnN3ZXIuXG4tIENvbnRpbnVlIG9uZSBwcm9tcHQgYXQgYSB0aW1lIHVudGlsIHRoZSBjb21tYW5kIGZpbmlzaGVzLmApO1xuXG5cdHJldHVybiBwYXJ0cy5qb2luKCcnKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQmFzaE1vZGVsRGVzY3JpcHRpb24oc2FuZGJveGluZ09wdGlvbnM6IElTYW5kYm94aW5nT3B0aW9ucywgaW5jbHVkZUVsZXZhdGlvbkd1aWRhbmNlOiBib29sZWFuKTogc3RyaW5nIHtcblx0cmV0dXJuIFtcblx0XHQnVGhpcyB0b29sIGFsbG93cyB5b3UgdG8gZXhlY3V0ZSBzaGVsbCBjb21tYW5kcyBpbiBhIHBlcnNpc3RlbnQgYmFzaCB0ZXJtaW5hbCBzZXNzaW9uLCBwcmVzZXJ2aW5nIGVudmlyb25tZW50IHZhcmlhYmxlcywgd29ya2luZyBkaXJlY3RvcnksIGFuZCBvdGhlciBjb250ZXh0IGFjcm9zcyBtdWx0aXBsZSBjb21tYW5kcy4nLFxuXHRcdGNyZWF0ZUdlbmVyaWNEZXNjcmlwdGlvbihzYW5kYm94aW5nT3B0aW9ucywgaW5jbHVkZUVsZXZhdGlvbkd1aWRhbmNlKSxcblx0XHQnLSBVc2UgW1sgXV0gZm9yIGNvbmRpdGlvbmFsIHRlc3RzIGluc3RlYWQgb2YgWyBdJyxcblx0XHQnLSBQcmVmZXIgJCgpIG92ZXIgYmFja3RpY2tzIGZvciBjb21tYW5kIHN1YnN0aXR1dGlvbidcblx0XS5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlWnNoTW9kZWxEZXNjcmlwdGlvbihzYW5kYm94aW5nT3B0aW9uczogSVNhbmRib3hpbmdPcHRpb25zLCBpbmNsdWRlRWxldmF0aW9uR3VpZGFuY2U6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRyZXR1cm4gW1xuXHRcdCdUaGlzIHRvb2wgYWxsb3dzIHlvdSB0byBleGVjdXRlIHNoZWxsIGNvbW1hbmRzIGluIGEgcGVyc2lzdGVudCB6c2ggdGVybWluYWwgc2Vzc2lvbiwgcHJlc2VydmluZyBlbnZpcm9ubWVudCB2YXJpYWJsZXMsIHdvcmtpbmcgZGlyZWN0b3J5LCBhbmQgb3RoZXIgY29udGV4dCBhY3Jvc3MgbXVsdGlwbGUgY29tbWFuZHMuJyxcblx0XHRjcmVhdGVHZW5lcmljRGVzY3JpcHRpb24oc2FuZGJveGluZ09wdGlvbnMsIGluY2x1ZGVFbGV2YXRpb25HdWlkYW5jZSksXG5cdFx0Jy0gVXNlIHR5cGUgdG8gY2hlY2sgY29tbWFuZCB0eXBlIChidWlsdGluLCBmdW5jdGlvbiwgYWxpYXMpJyxcblx0XHQnLSBVc2Ugam9icywgZmcsIGJnIGZvciBqb2IgY29udHJvbCcsXG5cdFx0Jy0gVXNlIFtbIF1dIGZvciBjb25kaXRpb25hbCB0ZXN0cyBpbnN0ZWFkIG9mIFsgXScsXG5cdFx0Jy0gUHJlZmVyICQoKSBvdmVyIGJhY2t0aWNrcyBmb3IgY29tbWFuZCBzdWJzdGl0dXRpb24nLFxuXHRcdCctIFRha2UgYWR2YW50YWdlIG9mIHpzaCBnbG9iYmluZyBmZWF0dXJlcyAoKiosIGV4dGVuZGVkIGdsb2JzKS4gTm90ZTogdW5tYXRjaGVkIGdsb2JzIGZhaWwgYnkgZGVmYXVsdCAoenNoOiBubyBtYXRjaGVzIGZvdW5kKSBcdTIwMTQgdXNlIGEgZ2xvYiBxdWFsaWZpZXIgbGlrZSAqKE4pIG9yIHF1b3RlIHRoZSBnbG9iIGlmIGl0IHNob3VsZCBiZSBsaXRlcmFsJyxcblx0XHQnJyxcblx0XHQnenNoIHBpdGZhbGxzIFx1MjAxNCB0aGVzZSBXSUxMIGNhdXNlIGVycm9ycyBvciBoYW5nczonLFxuXHRcdCctIE5FVkVSIHVzZSBiYXJlID09IG9yID09PSBhcyBzZXBhcmF0b3JzIChlLmcuIGVjaG8gPT09IHRyaWdnZXJzIHpzaCBlcXVhbHMgZXhwYW5zaW9uKS4gUXVvdGUgdGhlbTogZWNobyBcXCc9PT1cXCcnLFxuXHRcdCctIE5FVkVSIHVzZSBzdGF0dXMgYXMgYSB2YXJpYWJsZSBuYW1lIChpdCBpcyByZWFkLW9ubHkgaW4genNoKS4gVXNlIGV4aXRfY29kZSBvciByZXQgaW5zdGVhZCcsXG5cdF0uam9pbignXFxuJyk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUZpc2hNb2RlbERlc2NyaXB0aW9uKHNhbmRib3hpbmdPcHRpb25zOiBJU2FuZGJveGluZ09wdGlvbnMsIGluY2x1ZGVFbGV2YXRpb25HdWlkYW5jZTogYm9vbGVhbik6IHN0cmluZyB7XG5cdHJldHVybiBbXG5cdFx0J1RoaXMgdG9vbCBhbGxvd3MgeW91IHRvIGV4ZWN1dGUgc2hlbGwgY29tbWFuZHMgaW4gYSBwZXJzaXN0ZW50IGZpc2ggdGVybWluYWwgc2Vzc2lvbiwgcHJlc2VydmluZyBlbnZpcm9ubWVudCB2YXJpYWJsZXMsIHdvcmtpbmcgZGlyZWN0b3J5LCBhbmQgb3RoZXIgY29udGV4dCBhY3Jvc3MgbXVsdGlwbGUgY29tbWFuZHMuJyxcblx0XHRjcmVhdGVHZW5lcmljRGVzY3JpcHRpb24oc2FuZGJveGluZ09wdGlvbnMsIGluY2x1ZGVFbGV2YXRpb25HdWlkYW5jZSksXG5cdFx0Jy0gVXNlIHR5cGUgdG8gY2hlY2sgY29tbWFuZCB0eXBlIChidWlsdGluLCBmdW5jdGlvbiwgYWxpYXMpJyxcblx0XHQnLSBVc2Ugam9icywgZmcsIGJnIGZvciBqb2IgY29udHJvbCcsXG5cdFx0Jy0gVXNlIHRlc3QgZXhwcmVzc2lvbnMgZm9yIGNvbmRpdGlvbmFscyAobm8gW1sgXV0gc3ludGF4KScsXG5cdFx0Jy0gUHJlZmVyIGNvbW1hbmQgc3Vic3RpdHV0aW9uIHdpdGggKCkgc3ludGF4Jyxcblx0XHQnLSBWYXJpYWJsZXMgYXJlIGFycmF5cyBieSBkZWZhdWx0LCB1c2UgJHZhclsxXSBmb3IgZmlyc3QgZWxlbWVudCcsXG5cdFx0Jy0gVGFrZSBhZHZhbnRhZ2Ugb2YgZmlzaFxcJ3MgYXV0b3N1Z2dlc3Rpb25zIGFuZCBjb21wbGV0aW9ucydcblx0XS5qb2luKCdcXG4nKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVJ1bkluVGVybWluYWxUb29sRGF0YShcblx0YWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3Jcbik6IFByb21pc2U8SVRvb2xEYXRhPiB7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdGNvbnN0IHRlcm1pbmFsU2FuZGJveFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsU2FuZGJveFNlcnZpY2UpO1xuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kcyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMpID09PSB0cnVlO1xuXHRjb25zdCByZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0c1NldHRpbmcgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94UmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMpID09PSB0cnVlO1xuXHQvLyBPbmx5IHN0ZWVyIHRoZSBtb2RlbCBhd2F5IGZyb20gaW50ZXJhY3RpdmUgcHJpdmlsZWdlLWVzY2FsYXRpb24gY29tbWFuZHMgd2hlbiB0aGUgc2Vzc2lvbiBpc1xuXHQvLyAob3IgZGVmYXVsdHMgdG8pIGFuIGF1dG8tYXBwcm92aW5nIG1vZGUuIEluIGludGVyYWN0aXZlIG1vZGUgdGhlIHVzZXIgY2FuIGZvY3VzIHRoZSB0ZXJtaW5hbCBhbmRcblx0Ly8gdHlwZSBhIHBhc3N3b3JkL1VBQyBwcm9tcHQgZGlyZWN0bHkgKGJ5cGFzc2luZyB0aGUgbW9kZWwpLCB3aGljaCBpcyBhIHN1cHBvcnRlZCBmbG93OyBpblxuXHQvLyBhdXRvLWFwcHJvdmUvQnlwYXNzIEFwcHJvdmFscy9BdXRvcGlsb3QgbW9kZSBzdWNoIHByb21wdHMgYXJlIGNhbmNlbGxlZCBzaW5jZSBubyBodW1hbiBpc1xuXHQvLyBhdmFpbGFibGUgdG8gYW5zd2VyIHRoZW0uXG5cdC8vXG5cdC8vIE5vdGU6IHRoZSB0b29sIGRlc2NyaXB0aW9uIGlzIGNvbXB1dGVkIG9uY2UgYXQgcmVnaXN0cmF0aW9uLCBzbyBpdCBjYW5ub3Qgb2JzZXJ2ZSB0aGUgbGl2ZSxcblx0Ly8gcGVyLXNlc3Npb24gcGVybWlzc2lvbiBsZXZlbCAod2hpY2ggY2FuIGNoYW5nZSBtaWQtc2Vzc2lvbiB2aWEgdGhlIHBpY2tlcikuIFdlIHRoZXJlZm9yZSB1c2UgdGhlXG5cdC8vIGJlc3QgYXZhaWxhYmxlIHN0YXRpYyBzaWduYWxzOiB0aGUgdGVybWluYWwgYXV0by1hcHByb3ZlIHNldHRpbmcsIHRoZSBnbG9iYWwgYXV0by1hcHByb3ZlXG5cdC8vIHNldHRpbmcsIGFuZCB0aGUgZGVmYXVsdCBwZXJtaXNzaW9uIGxldmVsIGZvciBuZXcgc2Vzc2lvbnMuIFNlc3Npb25zIHN3aXRjaGVkIGludG8gQnlwYXNzXG5cdC8vIEFwcHJvdmFscy9BdXRvcGlsb3QgbWlkLXNlc3Npb24gZnJvbSBhbiBvdGhlcndpc2UtaW50ZXJhY3RpdmUgZGVmYXVsdCBhcmUgbm90IGNvdmVyZWQgYnkgdGhpc1xuXHQvLyBzdGF0aWMgZGVzY3JpcHRpb24uXG5cdGNvbnN0IGRlZmF1bHRQZXJtaXNzaW9uTGV2ZWwgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxDaGF0UGVybWlzc2lvbkxldmVsIHwgdW5kZWZpbmVkPihDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0UGVybWlzc2lvbkxldmVsKTtcblx0Y29uc3QgaW5jbHVkZUVsZXZhdGlvbkd1aWRhbmNlID1cblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkVuYWJsZUF1dG9BcHByb3ZlKSA9PT0gdHJ1ZSB8fFxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlKSA9PT0gdHJ1ZSB8fFxuXHRcdGlzQXV0b0FwcHJvdmVMZXZlbChkZWZhdWx0UGVybWlzc2lvbkxldmVsKTtcblxuXHRjb25zdCBwcm9maWxlRmV0Y2hlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsUHJvZmlsZUZldGNoZXIpO1xuXHRjb25zdCBbc2hlbGwsIG9zLCBpc1NhbmRib3hFbmFibGVkLCBpc1NhbmRib3hBbGxvd05ldHdvcmtFbmFibGVkXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRwcm9maWxlRmV0Y2hlci5nZXRDb3BpbG90U2hlbGwoKSxcblx0XHRwcm9maWxlRmV0Y2hlci5vc0JhY2tlbmQsXG5cdFx0dGVybWluYWxTYW5kYm94U2VydmljZS5pc0VuYWJsZWQoKSxcblx0XHR0ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQoKSxcblx0XSk7XG5cblx0Y29uc3Qgc2FuZGJveGluZ09wdGlvbnM6IElTYW5kYm94aW5nT3B0aW9ucyA9IChcblx0XHRpc1NhbmRib3hFbmFibGVkXG5cdFx0XHQ/IChpc1NhbmRib3hBbGxvd05ldHdvcmtFbmFibGVkID8ge1xuXHRcdFx0XHRzYW5kYm94TW9kZTogJ29uLW5ldHdvcmstYXZhaWxhYmxlJyxcblx0XHRcdFx0YWxsb3dUb1J1blVuc2FuZGJveGVkQ29tbWFuZHMsXG5cdFx0XHRcdHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzOiBmYWxzZSxcblx0XHRcdFx0bmV0d29ya0RvbWFpbnM6IHVuZGVmaW5lZFxuXHRcdFx0fSA6IHtcblx0XHRcdFx0c2FuZGJveE1vZGU6ICdvbi1uZXR3b3JrLXJlc3RyaWN0ZWQnLFxuXHRcdFx0XHRhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kcyxcblx0XHRcdFx0cmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHM6IHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzU2V0dGluZyxcblx0XHRcdFx0bmV0d29ya0RvbWFpbnM6IHRlcm1pbmFsU2FuZGJveFNlcnZpY2UuZ2V0UmVzb2x2ZWROZXR3b3JrRG9tYWlucygpXG5cdFx0XHR9KSA6IHtcblx0XHRcdFx0c2FuZGJveE1vZGU6ICdvZmYnXG5cdFx0XHR9XG5cdCk7XG5cblx0bGV0IG1vZGVsRGVzY3JpcHRpb246IHN0cmluZztcblx0aWYgKHNoZWxsICYmIG9zICYmIGlzUG93ZXJTaGVsbChzaGVsbCwgb3MpKSB7XG5cdFx0bW9kZWxEZXNjcmlwdGlvbiA9IGNyZWF0ZVBvd2VyU2hlbGxNb2RlbERlc2NyaXB0aW9uKHNoZWxsLCBzYW5kYm94aW5nT3B0aW9ucywgaW5jbHVkZUVsZXZhdGlvbkd1aWRhbmNlKTtcblx0fSBlbHNlIGlmIChzaGVsbCAmJiBvcyAmJiBpc1pzaChzaGVsbCwgb3MpKSB7XG5cdFx0bW9kZWxEZXNjcmlwdGlvbiA9IGNyZWF0ZVpzaE1vZGVsRGVzY3JpcHRpb24oc2FuZGJveGluZ09wdGlvbnMsIGluY2x1ZGVFbGV2YXRpb25HdWlkYW5jZSk7XG5cdH0gZWxzZSBpZiAoc2hlbGwgJiYgb3MgJiYgaXNGaXNoKHNoZWxsLCBvcykpIHtcblx0XHRtb2RlbERlc2NyaXB0aW9uID0gY3JlYXRlRmlzaE1vZGVsRGVzY3JpcHRpb24oc2FuZGJveGluZ09wdGlvbnMsIGluY2x1ZGVFbGV2YXRpb25HdWlkYW5jZSk7XG5cdH0gZWxzZSB7XG5cdFx0bW9kZWxEZXNjcmlwdGlvbiA9IGNyZWF0ZUJhc2hNb2RlbERlc2NyaXB0aW9uKHNhbmRib3hpbmdPcHRpb25zLCBpbmNsdWRlRWxldmF0aW9uR3VpZGFuY2UpO1xuXHR9XG5cblx0Y29uc3Qgc2hhcmVkUHJvcGVydGllczogSUpTT05TY2hlbWFNYXAgPSB7XG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ1RoZSBjb21tYW5kIHRvIHJ1biBpbiB0aGUgdGVybWluYWwuJ1xuXHRcdH0sXG5cdFx0ZXhwbGFuYXRpb246IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdBIG9uZS1zZW50ZW5jZSBkZXNjcmlwdGlvbiBvZiB3aGF0IHRoZSBjb21tYW5kIGRvZXMuIFRoaXMgd2lsbCBiZSBzaG93biB0byB0aGUgdXNlciBiZWZvcmUgdGhlIGNvbW1hbmQgaXMgcnVuLidcblx0XHR9LFxuXHRcdGdvYWw6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdBIHNob3J0IGRlc2NyaXB0aW9uIG9mIHRoZSBnb2FsIG9yIHB1cnBvc2Ugb2YgdGhlIGNvbW1hbmQgKGUuZy4sIFwiSW5zdGFsbCBkZXBlbmRlbmNpZXNcIiwgXCJTdGFydCBkZXZlbG9wbWVudCBzZXJ2ZXJcIikuJ1xuXHRcdH0sXG5cdH07XG5cdGNvbnN0IHNhbmRib3hQcm9wZXJ0aWVzOiBJSlNPTlNjaGVtYU1hcCA9IHNhbmRib3hpbmdPcHRpb25zLnNhbmRib3hNb2RlID09PSAnb2ZmJyA/IHt9IDogY3JlYXRlU2FuZGJveFByb3BlcnRpZXMoc2FuZGJveGluZ09wdGlvbnMpO1xuXG5cdHJldHVybiB7XG5cdFx0aWQ6IFRlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWwsXG5cdFx0dG9vbFJlZmVyZW5jZU5hbWU6IFRPT0xfUkVGRVJFTkNFX05BTUUsXG5cdFx0bGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lczogTEVHQUNZX1RPT0xfUkVGRVJFTkNFX0ZVTExfTkFNRVMsXG5cdFx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCdydW5JblRlcm1pbmFsVG9vbC5kaXNwbGF5TmFtZScsICdSdW4gaW4gVGVybWluYWwnKSxcblx0XHRtb2RlbERlc2NyaXB0aW9uOiBgJHttb2RlbERlc2NyaXB0aW9ufVxcblxcbkV4ZWN1dGlvbiBtb2RlOlxcbi0gbW9kZT0nc3luYycgKHN0cm9uZ2x5IHByZWZlcnJlZCk6IHdhaXRzIGZvciB0aGUgY29tbWFuZCB0byBjb21wbGV0ZSBhbmQgcmV0dXJucyBmdWxsIG91dHB1dCBpbmxpbmUuIFVzZSBmb3IgQUxMIG9uZS1zaG90IGNvbW1hbmRzIChidWlsZHMsIHRlc3RzLCBpbnN0YWxscywgY29tcGlsYXRpb24sIHNjcmlwdHMpLiBPbWl0IHRpbWVvdXQgdG8gbGV0IHRoZSBjb21tYW5kIHJ1biB0byBjb21wbGV0aW9uIFx1MjAxNCB0aGUgdG9vbCBoYW5kbGVzIGlkbGUgZGV0ZWN0aW9uIGFuZCBpbnB1dCBwcm9tcHRzIGF1dG9tYXRpY2FsbHkuXFxuLSBtb2RlPSdhc3luYyc6IHdhaXRzIGZvciBhbiBpbml0aWFsIGlkbGUvb3V0cHV0IHNpZ25hbCBmcm9tIHRoZSBjb21tYW5kLCB0aGVuIHJldHVybnMgYSB0ZXJtaW5hbCBJRCBhbmQgb3V0cHV0IHNuYXBzaG90IHdoaWxlIHRoZSBwcm9jZXNzIGNvbnRpbnVlcyBydW5uaW5nLiBVc2UgT05MWSBmb3IgcHJvY2Vzc2VzIHRoYXQgbXVzdCBrZWVwIHJ1bm5pbmcgaW5kZWZpbml0ZWx5IChzZXJ2ZXJzLCB3YXRjaGVycywgZGFlbW9ucykuIFRpbWVvdXQgY2FwcyBob3cgbG9uZyB0byB3YWl0IGZvciB0aGUgaW5pdGlhbCBpZGxlL291dHB1dCBzaWduYWwuXFxuXFxuVGltZW91dCBwYXJhbWV0ZXI6IFVzdWFsbHkgb21pdCB0aW1lb3V0IGVudGlyZWx5IGZvciBzeW5jIGNvbW1hbmRzIFx1MjAxNCB0aGUgdG9vbCByZXR1cm5zIGF1dG9tYXRpY2FsbHkgb24gY29tcGxldGlvbiwgaW5wdXQtbmVlZGVkLCBvciBjYW5jZWxsYXRpb24uIE9ubHkgc2V0IGEgdGltZW91dCBhcyBhIHNhZmV0eSBuZXQgZm9yIGNvbW1hbmRzIHlvdSBzdXNwZWN0IG1pZ2h0IGhhbmcuIFVzZSAwIHRvIGV4cGxpY2l0bHkgaW5kaWNhdGUgbm8gdGltZW91dC5cXG5cXG5TeW5jIG91dHB1dCBpcyBmaW5hbDogV2hlbiBhIHN5bmMgY29tbWFuZCBjb21wbGV0ZXMsIHRoZSBmdWxsIG91dHB1dCBpcyByZXR1cm5lZCBpbmxpbmUgXHUyMDE0IGRvIE5PVCBjYWxsICR7VGVybWluYWxUb29sSWQuR2V0VGVybWluYWxPdXRwdXR9IGFmdGVyd2FyZC4gT25seSB1c2UgJHtUZXJtaW5hbFRvb2xJZC5HZXRUZXJtaW5hbE91dHB1dH0gaWYgdGhlIHRvb2wgcmVzdWx0IGV4cGxpY2l0bHkgaW5kaWNhdGVzIHRoZSBjb21tYW5kIHdhcyBtb3ZlZCB0byBiYWNrZ3JvdW5kLCB0aW1lZCBvdXQsIG9yIG5lZWRzIGlucHV0LiBEbyBOT1QgdGVsbCB0aGUgdXNlciB0byBjaGVjayB0aGUgdGVybWluYWwgcGFuZWwgXHUyMDE0IGFsbCBjb21tYW5kIG91dHB1dCBpcyBhbHJlYWR5IGluY2x1ZGVkIGluIHRoZSB0b29sIHJlc3VsdC5cXG5cXG5UZXJtaW5hbCBub3RpZmljYXRpb25zOiBXaGVuIGFuIGFzeW5jIGNvbW1hbmQgZmluaXNoZXMgb3IgYSBzeW5jIGNvbW1hbmQgdGltZXMgb3V0LCB5b3Ugd2lsbCBiZSBhdXRvbWF0aWNhbGx5IG5vdGlmaWVkIG9uIHlvdXIgbmV4dCB0dXJuIHdpdGggdGhlIGV4aXQgY29kZSBhbmQgdGVybWluYWwgb3V0cHV0LiBZb3Ugd2lsbCBhbHNvIGJlIG5vdGlmaWVkIGlmIHRoZSB0ZXJtaW5hbCBuZWVkcyBpbnB1dC4gRG8gTk9UIHBvbGwgb3Igc2xlZXAgdG8gd2FpdCBmb3IgY29tcGxldGlvbi5gLFxuXHRcdHVzZXJEZXNjcmlwdGlvbjogbG9jYWxpemUoJ3J1bkluVGVybWluYWxUb29sLnVzZXJEZXNjcmlwdGlvbicsICdSdW4gY29tbWFuZHMgaW4gdGhlIHRlcm1pbmFsJyksXG5cdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsLFxuXHRcdGlucHV0U2NoZW1hOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0Li4uc2hhcmVkUHJvcGVydGllcyxcblx0XHRcdFx0Li4uc2FuZGJveFByb3BlcnRpZXMsXG5cdFx0XHRcdG1vZGU6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ3N5bmMnLCAnYXN5bmMnXSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHQnV2FpdCBmb3IgY29tbWFuZCBjb21wbGV0aW9uIGFuZCByZXR1cm4gZnVsbCBvdXRwdXQgaW5saW5lLiBTdHJvbmdseSBwcmVmZXJyZWQgZm9yIGFsbCBvbmUtc2hvdCBjb21tYW5kcyAoYnVpbGRzLCB0ZXN0cywgaW5zdGFsbHMsIHNjcmlwdHMpLicsXG5cdFx0XHRcdFx0XHQnV2FpdCBmb3IgYW4gaW5pdGlhbCBpZGxlL291dHB1dCBzaWduYWwsIHRoZW4gcmV0dXJuIGEgdGVybWluYWwgSUQgYW5kIG91dHB1dCBzbmFwc2hvdCB3aGlsZSB0aGUgcHJvY2VzcyBjb250aW51ZXMgcnVubmluZy4gVGltZW91dCBjYXBzIGhvdyBsb25nIHRvIHdhaXQgZm9yIHRoZSBpbml0aWFsIHNpZ25hbC4gVXNlIE9OTFkgZm9yIHByb2Nlc3NlcyB0aGF0IG11c3Qga2VlcCBydW5uaW5nIGluZGVmaW5pdGVseSAoc2VydmVycywgd2F0Y2hlcnMsIGRhZW1vbnMpLidcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRXhlY3V0aW9uIG1vZGUgZm9yIHRoaXMgY29tbWFuZC4gVXNlIHN5bmMgKGRlZmF1bHQpIGZvciBuZWFybHkgYWxsIGNvbW1hbmRzLidcblx0XHRcdFx0fSxcblx0XHRcdFx0aXNCYWNrZ3JvdW5kOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnTGVnYWN5IGV4ZWN1dGlvbiBtb2RlIGZsYWcuIERlcHJlY2F0ZWQgaW4gZmF2b3Igb2YgXCJtb2RlXCIuIElmIHRydWUsIGVxdWl2YWxlbnQgdG8gbW9kZT1hc3luYy4gSWYgZmFsc2UsIGVxdWl2YWxlbnQgdG8gbW9kZT1zeW5jLidcblx0XHRcdFx0fSxcblx0XHRcdFx0dGltZW91dDoge1xuXHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnT3B0aW9uYWwuIFVzdWFsbHkgb21pdCBlbnRpcmVseSBmb3Igc3luYyBjb21tYW5kcyBcdTIwMTQgdGhlIHRvb2wgd2FpdHMgZm9yIGNvbXBsZXRpb24gYXV0b21hdGljYWxseS4gT25seSBzZXQgYSB0aW1lb3V0IChpbiBtaWxsaXNlY29uZHMpIGFzIGEgc2FmZXR5IG5ldCBpZiB5b3Ugc3VzcGVjdCB0aGUgY29tbWFuZCBtaWdodCBoYW5nLiBJZiB0aGUgdGltZW91dCBlbGFwc2VzLCB0aGUgY29tbWFuZCBjb250aW51ZXMgaW4gdGhlIGJhY2tncm91bmQgYW5kIHlvdSBnZXQgYSB0ZXJtaW5hbCBJRCB0byBjaGVjayBvdXRwdXQgbGF0ZXIuIFVzZSAwIHRvIGV4cGxpY2l0bHkgaW5kaWNhdGUgbm8gdGltZW91dC4nLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHJlcXVpcmVkOiBbJ2NvbW1hbmQnLCAnZXhwbGFuYXRpb24nLCAnZ29hbCcsICdtb2RlJ11cblx0XHR9XG5cdH07XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBUb29sIGltcGxlbWVudGF0aW9uXG5cbmNvbnN0IGVudW0gVGVybWluYWxUb29sU3RvcmFnZUtleXNJbnRlcm5hbCB7XG5cdFRlcm1pbmFsU2Vzc2lvbiA9ICdjaGF0LnRlcm1pbmFsU2Vzc2lvbnMnXG59XG5cbmludGVyZmFjZSBJU3RvcmVkVGVybWluYWxBc3NvY2lhdGlvbiB7XG5cdHNlc3Npb25JZDogc3RyaW5nO1xuXHRpZDogc3RyaW5nO1xuXHRzaGVsbEludGVncmF0aW9uUXVhbGl0eTogU2hlbGxJbnRlZ3JhdGlvblF1YWxpdHk7XG5cdGlzQmFja2dyb3VuZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtcyB7XG5cdGNvbW1hbmQ6IHN0cmluZztcblx0ZXhwbGFuYXRpb246IHN0cmluZztcblx0Z29hbDogc3RyaW5nO1xuXHRtb2RlPzogJ3N5bmMnIHwgJ2FzeW5jJztcblx0LyoqXG5cdCAqIEBkZXByZWNhdGVkIFVzZSBgbW9kZWAgaW5zdGVhZC5cblx0ICovXG5cdGlzQmFja2dyb3VuZD86IGJvb2xlYW47XG5cdHRpbWVvdXQ/OiBudW1iZXI7XG5cdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbj86IGJvb2xlYW47XG5cdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbj86IHN0cmluZztcblx0cmVxdWVzdEFsbG93TmV0d29yaz86IGJvb2xlYW47XG5cdHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24/OiBzdHJpbmc7XG5cdHJlcXVlc3RGaWxlVmFsaWRhdGlvbkNoZWNrPzogc3RyaW5nW107XG5cdHJlcXVlc3RGaWxlVmFsaWRhdGlvbkNoZWNrUmVhc29uPzogc3RyaW5nO1xuXHRhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kcz86IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJUmVzb2x2ZWRFeGVjdXRpb25PcHRpb25zIHtcblx0cGVyc2lzdGVudFNlc3Npb246IGJvb2xlYW47XG5cdHdhaXRTdHJhdGVneTogJ2NvbXBsZXRpb24nIHwgJ2lkbGUnO1xuXHRtb2RlOiAnc3luYycgfCAnYXN5bmMnO1xufVxuXG50eXBlIEF1dG9tYXRpY1NhbmRib3hSZXRyeUtpbmQgPSAndW5zYW5kYm94ZWQnIHwgJ2FsbG93TmV0d29yayc7XG5cbmludGVyZmFjZSBJQXV0b21hdGljU2FuZGJveFJldHJ5UHJlZGljYXRlT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHJldHJ5QWxsb3dlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgcmV0cnlBbHJlYWR5UmVxdWVzdGVkOiBib29sZWFuO1xuXHRyZWFkb25seSBkaWRTYW5kYm94V3JhcENvbW1hbmQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzUGVyc2lzdGVudFNlc3Npb246IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzQmFja2dyb3VuZEV4ZWN1dGlvbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgZGlkVGltZW91dDogYm9vbGVhbjtcblx0cmVhZG9ubHkgZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb3V0cHV0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG91dHB1dExvb2tzUmV0cnlhYmxlOiAob3V0cHV0OiBzdHJpbmcpID0+IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUF1dG9tYXRpY1Vuc2FuZGJveFJldHJ5T3B0aW9ucyB7XG5cdHJlYWRvbmx5IGFsbG93VW5zYW5kYm94ZWRDb21tYW5kczogYm9vbGVhbjtcblx0cmVhZG9ubHkgZGlkU2FuZGJveFdyYXBDb21tYW5kOiBib29sZWFuO1xuXHRyZWFkb25seSByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzUGVyc2lzdGVudFNlc3Npb246IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzQmFja2dyb3VuZEV4ZWN1dGlvbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgZGlkVGltZW91dDogYm9vbGVhbjtcblx0cmVhZG9ubHkgZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb3V0cHV0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUF1dG9tYXRpY0FsbG93TmV0d29ya1JldHJ5T3B0aW9ucyB7XG5cdHJlYWRvbmx5IHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzOiBib29sZWFuO1xuXHRyZWFkb25seSBkaWRTYW5kYm94V3JhcENvbW1hbmQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgcmVxdWVzdEFsbG93TmV0d29yazogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNQZXJzaXN0ZW50U2Vzc2lvbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNCYWNrZ3JvdW5kRXhlY3V0aW9uOiBib29sZWFuO1xuXHRyZWFkb25seSBkaWRUaW1lb3V0OiBib29sZWFuO1xuXHRyZWFkb25seSBleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBvdXRwdXQ6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gc2hvdWxkQXV0b21hdGljYWxseVJldHJ5U2FuZGJveChvcHRpb25zOiBJQXV0b21hdGljU2FuZGJveFJldHJ5UHJlZGljYXRlT3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gb3B0aW9ucy5yZXRyeUFsbG93ZWRcblx0XHQmJiBvcHRpb25zLmRpZFNhbmRib3hXcmFwQ29tbWFuZFxuXHRcdCYmIG9wdGlvbnMucmV0cnlBbHJlYWR5UmVxdWVzdGVkICE9PSB0cnVlXG5cdFx0JiYgIW9wdGlvbnMuaXNQZXJzaXN0ZW50U2Vzc2lvblxuXHRcdCYmICFvcHRpb25zLmlzQmFja2dyb3VuZEV4ZWN1dGlvblxuXHRcdCYmICFvcHRpb25zLmRpZFRpbWVvdXRcblx0XHQmJiBvcHRpb25zLmV4aXRDb2RlICE9PSAwXG5cdFx0JiYgb3B0aW9ucy5vdXRwdXRMb29rc1JldHJ5YWJsZShvcHRpb25zLm91dHB1dCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRBdXRvbWF0aWNhbGx5UmV0cnlVbnNhbmRib3hlZChvcHRpb25zOiBJQXV0b21hdGljVW5zYW5kYm94UmV0cnlPcHRpb25zKTogYm9vbGVhbiB7XG5cdHJldHVybiBzaG91bGRBdXRvbWF0aWNhbGx5UmV0cnlTYW5kYm94KHtcblx0XHRyZXRyeUFsbG93ZWQ6IG9wdGlvbnMuYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzLFxuXHRcdHJldHJ5QWxyZWFkeVJlcXVlc3RlZDogb3B0aW9ucy5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24sXG5cdFx0ZGlkU2FuZGJveFdyYXBDb21tYW5kOiBvcHRpb25zLmRpZFNhbmRib3hXcmFwQ29tbWFuZCxcblx0XHRpc1BlcnNpc3RlbnRTZXNzaW9uOiBvcHRpb25zLmlzUGVyc2lzdGVudFNlc3Npb24sXG5cdFx0aXNCYWNrZ3JvdW5kRXhlY3V0aW9uOiBvcHRpb25zLmlzQmFja2dyb3VuZEV4ZWN1dGlvbixcblx0XHRkaWRUaW1lb3V0OiBvcHRpb25zLmRpZFRpbWVvdXQsXG5cdFx0ZXhpdENvZGU6IG9wdGlvbnMuZXhpdENvZGUsXG5cdFx0b3V0cHV0OiBvcHRpb25zLm91dHB1dCxcblx0XHQvLyBOZXR3b3JrIGZhaWx1cmVzIGFyZSBoYW5kbGVkIGJ5IHNob3VsZEF1dG9tYXRpY2FsbHlSZXRyeUFsbG93TmV0d29ya0luU2FuZGJveGVkOyBkbyBub3QgYXV0b21hdGljYWxseSBsZWF2ZSB0aGUgc2FuZGJveCBmb3IgdGhlbS5cblx0XHRvdXRwdXRMb29rc1JldHJ5YWJsZTogb3V0cHV0ID0+IG91dHB1dExvb2tzU2FuZGJveEJsb2NrZWQob3V0cHV0KSAmJiAhb3V0cHV0TG9va3NTYW5kYm94TmV0d29ya0Jsb2NrZWQob3V0cHV0KSxcblx0fSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRBdXRvbWF0aWNhbGx5UmV0cnlBbGxvd05ldHdvcmtJblNhbmRib3hlZChvcHRpb25zOiBJQXV0b21hdGljQWxsb3dOZXR3b3JrUmV0cnlPcHRpb25zKTogYm9vbGVhbiB7XG5cdHJldHVybiBzaG91bGRBdXRvbWF0aWNhbGx5UmV0cnlTYW5kYm94KHtcblx0XHRyZXRyeUFsbG93ZWQ6IG9wdGlvbnMucmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMsXG5cdFx0cmV0cnlBbHJlYWR5UmVxdWVzdGVkOiBvcHRpb25zLnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiB8fCBvcHRpb25zLnJlcXVlc3RBbGxvd05ldHdvcmssXG5cdFx0ZGlkU2FuZGJveFdyYXBDb21tYW5kOiBvcHRpb25zLmRpZFNhbmRib3hXcmFwQ29tbWFuZCxcblx0XHRpc1BlcnNpc3RlbnRTZXNzaW9uOiBvcHRpb25zLmlzUGVyc2lzdGVudFNlc3Npb24sXG5cdFx0aXNCYWNrZ3JvdW5kRXhlY3V0aW9uOiBvcHRpb25zLmlzQmFja2dyb3VuZEV4ZWN1dGlvbixcblx0XHRkaWRUaW1lb3V0OiBvcHRpb25zLmRpZFRpbWVvdXQsXG5cdFx0ZXhpdENvZGU6IG9wdGlvbnMuZXhpdENvZGUsXG5cdFx0b3V0cHV0OiBvcHRpb25zLm91dHB1dCxcblx0XHRvdXRwdXRMb29rc1JldHJ5YWJsZTogb3V0cHV0TG9va3NTYW5kYm94TmV0d29ya0Jsb2NrZWQsXG5cdH0pO1xufVxuXG5cblxuZXhwb3J0IGZ1bmN0aW9uIG91dHB1dExvb2tzQnViYmxld3JhcEhvc3RSZXN0cmljdGVkKG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAvYndyYXA6XFxzKk5vIHBlcm1pc3Npb25zIHRvIGNyZWF0ZSBuZXcgbmFtZXNwYWNlL2kudGVzdChvdXRwdXQucmVwbGFjZSgvXFxzKy9nLCAnICcpKTtcbn1cblxuLyoqXG4gKiBJbnRlcmZhY2UgZm9yIGFjY2Vzc2luZyBhIHJ1bm5pbmcgdGVybWluYWwgZXhlY3V0aW9uLlxuICogVXNlZCBieSB0b29scyB0aGF0IG5lZWQgdG8gYXdhaXQgb3IgaW50ZXJhY3Qgd2l0aCBiYWNrZ3JvdW5kIHRlcm1pbmFsIGNvbW1hbmRzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBY3RpdmVUZXJtaW5hbEV4ZWN1dGlvbiB7XG5cdC8qKlxuXHQgKiBQcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiB0aGUgdGVybWluYWwgY29tbWFuZCBjb21wbGV0ZXMuXG5cdCAqL1xuXHRyZWFkb25seSBjb21wbGV0aW9uUHJvbWlzZTogUHJvbWlzZTxJVGVybWluYWxFeGVjdXRlU3RyYXRlZ3lSZXN1bHQ+O1xuXG5cdC8qKlxuXHQgKiBUaGUgdGVybWluYWwgaW5zdGFuY2UgYXNzb2NpYXRlZCB3aXRoIHRoaXMgZXhlY3V0aW9uLlxuXHQgKi9cblx0cmVhZG9ubHkgaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlO1xuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBjdXJyZW50IG91dHB1dCBmcm9tIHRoZSB0ZXJtaW5hbC5cblx0ICovXG5cdGdldE91dHB1dCgpOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFN3aXRjaGVzIHRoaXMgZXhlY3V0aW9uIHRvIGJhY2tncm91bmQgbW9kZSwgaWYgc3VwcG9ydGVkLlxuXHQgKi9cblx0c2V0QmFja2dyb3VuZD8oKTogdm9pZDtcbn1cblxuLyoqXG4gKiBBIHNldCBvZiBjaGFyYWN0ZXJzIHRvIGlnbm9yZSB3aGVuIHJlcG9ydGluZyB0ZWxlbWV0cnlcbiAqL1xuY29uc3QgdGVsZW1ldHJ5SWdub3JlZFNlcXVlbmNlcyA9IFtcblx0J1xceDFiW0knLCAvLyBGb2N1cyBpblxuXHQnXFx4MWJbTycsIC8vIEZvY3VzIG91dFxuXTtcblxuY29uc3QgYWx0QnVmZmVyTWVzc2FnZSA9ICdcXG4nICsgbG9jYWxpemUoJ3J1bkluVGVybWluYWxUb29sLmFsdEJ1ZmZlck1lc3NhZ2UnLCBcIlRoZSBjb21tYW5kIG9wZW5lZCB0aGUgYWx0ZXJuYXRlIGJ1ZmZlci5cIik7XG5cbi8qKlxuICogQnVpbGRzIHRoZSBzaG9ydCwgc2luZ2xlLWxpbmUgY29tbWFuZCBzdHJpbmcgdXNlZCBpbiB0aGUgU1lTVEVNIE5PVElGSUNBVElPTlxuICogbGFiZWwgZm9yIGJhY2tncm91bmQgdGVybWluYWwgY29tcGxldGlvbiAoIzMxODYwMSkuIEtlZXBzIG9ubHkgdGhlIGZpcnN0IGxpbmVcbiAqIG9mIHRoZSBjb21tYW5kIChzdHJpcHBpbmcgY29tbW9uIGVzY2FwZSBhcnRpZmFjdHMpIGFuZCBhcHBlbmRzIGEgaG9yaXpvbnRhbFxuICogZWxsaXBzaXMgKGBcdTIwMjZgKSB3aGVuIGNvbnRlbnQgaXMgZHJvcHBlZCBcdTIwMTQgZWl0aGVyIGJlY2F1c2UgdGhlIGNvbW1hbmQgc3BhbnNcbiAqIG11bHRpcGxlIGxpbmVzIG9yIHRoZSBmaXJzdCBsaW5lIGl0c2VsZiBpcyBsb25nZXIgdGhhbiA4MCBjaGFyYWN0ZXJzLlxuICpcbiAqIE11bHRpLWxpbmUgY29tbWFuZHMgKHdpdGggYmxhbmsgbGluZXMpIHVzZWQgdG8gYnJlYWsgdGhlIHN1cnJvdW5kaW5nIGlubGluZVxuICogY29kZSBzcGFuOyBjYWxsZXJzIG11c3QgYWRkaXRpb25hbGx5IHdyYXAgdGhlIHJlc3VsdCB3aXRoXG4gKiB7QGxpbmsgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZX0gd2hlbiBpbnRlcnBvbGF0aW5nIGludG8gbWFya2Rvd24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZENvbXBsZXRpb25Ob3RpZmljYXRpb25Db21tYW5kKGNvbW1hbmQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IGZpcnN0TmV3bGluZSA9IGNvbW1hbmQuc2VhcmNoKC9cXHJ8XFxuLyk7XG5cdGNvbnN0IGhhc01vcmVMaW5lcyA9IGZpcnN0TmV3bGluZSAhPT0gLTE7XG5cdGNvbnN0IGZpcnN0TGluZSA9IGhhc01vcmVMaW5lcyA/IGNvbW1hbmQuc3Vic3RyaW5nKDAsIGZpcnN0TmV3bGluZSkgOiBjb21tYW5kO1xuXHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplVGVybWluYWxDb21tYW5kRm9yRGlzcGxheShmaXJzdExpbmUpO1xuXHRpZiAobm9ybWFsaXplZC5sZW5ndGggPiA4MCkge1xuXHRcdHJldHVybiBub3JtYWxpemVkLnN1YnN0cmluZygwLCA3OSkgKyAnXHUyMDI2Jztcblx0fVxuXHRyZXR1cm4gaGFzTW9yZUxpbmVzID8gbm9ybWFsaXplZCArICdcdTIwMjYnIDogbm9ybWFsaXplZDtcbn1cblxuXG5leHBvcnQgY2xhc3MgUnVuSW5UZXJtaW5hbFRvb2wgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFRvb2xDcmVhdG9yOiBUb29sVGVybWluYWxDcmVhdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmVlU2l0dGVyQ29tbWFuZFBhcnNlcjogVHJlZVNpdHRlckNvbW1hbmRQYXJzZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeTogUnVuSW5UZXJtaW5hbFRvb2xUZWxlbWV0cnk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRBcnRpZmFjdENvbGxlY3RvcjogVGVybWluYWxDb21tYW5kQXJ0aWZhY3RDb2xsZWN0b3I7XG5cdHByb3RlY3RlZCByZWFkb25seSBfcHJvZmlsZUZldGNoZXI6IFRlcm1pbmFsUHJvZmlsZUZldGNoZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhcmdlT3V0cHV0RmlsZVdyaXRlcjogTGFyZ2VPdXRwdXRGaWxlV3JpdGVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRMaW5lUmV3cml0ZXJzOiBJQ29tbWFuZExpbmVSZXdyaXRlcltdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kTGluZUFuYWx5emVyczogSUNvbW1hbmRMaW5lQW5hbHl6ZXJbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZExpbmVQcmVzZW50ZXJzOiBJQ29tbWFuZExpbmVQcmVzZW50ZXJbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfb3V0cHV0QW5hbHl6ZXJzOiBJT3V0cHV0QW5hbHl6ZXJbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfYXJjaGl2ZWRTZXNzaW9uTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMgPSBuZXcgUmVzb3VyY2VNYXA8SVRvb2xUZXJtaW5hbD4oKTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9zZXNzaW9uVGVybWluYWxJbnN0YW5jZXMgPSBuZXcgUmVzb3VyY2VNYXA8U2V0PElUZXJtaW5hbEluc3RhbmNlPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxzQmVpbmdEaXNwb3NlZEJ5U2Vzc2lvbkNsZWFudXAgPSBuZXcgU2V0PElUZXJtaW5hbEluc3RhbmNlPigpO1xuXG5cdC8qKlxuXHQgKiBUcmFja3MgYWN0aXZlIGJhY2tncm91bmQgY29tcGxldGlvbiBub3RpZmljYXRpb25zIHBlciB0ZXJtaW5hbCBpbnN0YW5jZSBJRC5cblx0ICogV2hlbiBhIG5ldyBub3RpZmljYXRpb24gaXMgcmVnaXN0ZXJlZCBmb3IgYSB0ZXJtaW5hbCB0aGF0IGFscmVhZHkgaGFzIG9uZSxcblx0ICogdGhlIHByZXZpb3VzIG5vdGlmaWNhdGlvbiAoYW5kIGl0cyBPdXRwdXRNb25pdG9yKSBpcyBkaXNwb3NlZCBmaXJzdCB0b1xuXHQgKiBwcmV2ZW50IGxpc3RlbmVyIGFjY3VtdWxhdGlvbiBvbiB0aGUgdGVybWluYWwncyBvbkRpZElucHV0RGF0YSBlbWl0dGVyLlxuXHQgKlxuXHQgKiBLZXllZCBieSBgSVRlcm1pbmFsSW5zdGFuY2UuaW5zdGFuY2VJZGAgKHN0YWJsZSBwZXIgdGVybWluYWwpIHJhdGhlciB0aGFuXG5cdCAqIHRoZSBwZXItaW52b2NhdGlvbiBgdGVybUlkYCBzbyB0aGF0IHJldXNpbmcgdGhlIHNhbWUgZm9yZWdyb3VuZCB0ZXJtaW5hbFxuXHQgKiBhZnRlciBhbiBgaW5wdXROZWVkZWRgIHJhY2UgZGlzcG9zZXMgdGhlIHByaW9yIE91dHB1dE1vbml0b3IuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9iYWNrZ3JvdW5kTm90aWZpY2F0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlcj4oKSk7XG5cblx0LyoqXG5cdCAqIFNldCB3aGVuIFZTIENvZGUgaXMgc2h1dHRpbmcgZG93bi4gU3VwcHJlc3NlcyBcInRlcm1pbmFsIGV4aXRlZFwiXG5cdCAqIG5vdGlmaWNhdGlvbnMgdGhhdCB3b3VsZCBvdGhlcndpc2UgYmUgZ2VuZXJhdGVkIHdoZW4gYmFja2dyb3VuZFxuXHQgKiB0ZXJtaW5hbHMgYXJlIGRpc3Bvc2VkIGR1cmluZyBzaHV0ZG93biBhbmQgdGhlbiBwZXJzaXN0IGFzXG5cdCAqIHVuZGVsaXZlcmFibGUgc3RlZXJpbmcgbWVzc2FnZXMgYWZ0ZXIgcmVzdGFydC5cblx0ICovXG5cdHByaXZhdGUgX2lzU2h1dHRpbmdEb3duID0gZmFsc2U7XG5cblx0Ly8gSW1tdXRhYmxlIHdpbmRvdyBzdGF0ZVxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29zQmFja2VuZDogUHJvbWlzZTxPcGVyYXRpbmdTeXN0ZW0+O1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9hY3RpdmVFeGVjdXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIElBY3RpdmVUZXJtaW5hbEV4ZWN1dGlvbiAmIHsgZGlzcG9zZSgpOiB2b2lkIH0+KCk7XG5cblx0LyoqXG5cdCAqIFBlci1pbnN0YW5jZSBkaXNwb3NhYmxlcyB0aGF0IHVucmVnaXN0ZXIgYF9hY3RpdmVFeGVjdXRpb25zYCBlbnRyaWVzIGZyb20gdGhlXG5cdCAqIGBJVGVybWluYWxDaGF0U2VydmljZWAgZXhlY3V0aW9uLWlkIG1hcC4gS2V5ZWQgYnkgdGhlIHNhbWUgYHRlcm1JZGAgYXMgYF9hY3RpdmVFeGVjdXRpb25zYFxuXHQgKiBzbyByZWdpc3RyYXRpb25zIGFuZCBhY3RpdmUgZXhlY3V0aW9ucyBzaGFyZSBhIGxpZmVjeWNsZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4ZWN1dGlvblJlZ2lzdHJhdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPigpKTtcblxuXHRwcml2YXRlIF9zZXRBY3RpdmVFeGVjdXRpb24odGVybUlkOiBzdHJpbmcsIGV4ZWN1dGlvbjogSUFjdGl2ZVRlcm1pbmFsRXhlY3V0aW9uICYgeyBkaXNwb3NlKCk6IHZvaWQgfSk6IHZvaWQge1xuXHRcdFJ1bkluVGVybWluYWxUb29sLl9hY3RpdmVFeGVjdXRpb25zLnNldCh0ZXJtSWQsIGV4ZWN1dGlvbik7XG5cdFx0dGhpcy5fZXhlY3V0aW9uUmVnaXN0cmF0aW9ucy5zZXQodGVybUlkLCB0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLnJlZ2lzdGVyVGVybWluYWxJbnN0YW5jZVdpdGhFeGVjdXRpb25JZCh0ZXJtSWQsIGV4ZWN1dGlvbi5pbnN0YW5jZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVsZXRlQWN0aXZlRXhlY3V0aW9uKHRlcm1JZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fZXhlY3V0aW9uUmVnaXN0cmF0aW9ucy5kZWxldGVBbmREaXNwb3NlKHRlcm1JZCk7XG5cdFx0cmV0dXJuIFJ1bkluVGVybWluYWxUb29sLl9hY3RpdmVFeGVjdXRpb25zLmRlbGV0ZSh0ZXJtSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlcm1pbmFsIElEcyBiZWluZyBwcm9ncmFtbWF0aWNhbGx5IGRpc3Bvc2VkIChieSBga2lsbF90ZXJtaW5hbGAgb3Jcblx0ICogYXV0b21hdGljIGJhY2tncm91bmQtdGVybWluYWwgY2xlYW51cCkuIFVzZWQgdG8gc3VwcHJlc3MgdGhlIHJlZHVuZGFudFxuXHQgKiBcInRlcm1pbmFsIGV4aXRlZFwiIHN0ZWVyaW5nIG1lc3NhZ2UgaW4gYF9yZWdpc3RlckNvbXBsZXRpb25Ob3RpZmljYXRpb25gJ3Ncblx0ICogYG9uRGlzcG9zZWRgIGhhbmRsZXIuXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfa2lsbGVkQnlUb29sID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHB1YmxpYyBzdGF0aWMgZ2V0QmFja2dyb3VuZE91dHB1dChpZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBleGVjdXRpb24gPSBSdW5JblRlcm1pbmFsVG9vbC5fYWN0aXZlRXhlY3V0aW9ucy5nZXQoaWQpO1xuXHRcdGlmICghZXhlY3V0aW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdGVybWluYWwgSUQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIGV4ZWN1dGlvbi5nZXRPdXRwdXQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIGFuIGFjdGl2ZSB0ZXJtaW5hbCBleGVjdXRpb24gYnkgSUQuIFJldHVybnMgdW5kZWZpbmVkIGlmIG5vdCBmb3VuZC5cblx0ICogQ2FuIGJlIHVzZWQgdG8gYXdhaXQgdGhlIGNvbXBsZXRpb24gb2YgYSBiYWNrZ3JvdW5kIHRlcm1pbmFsIGNvbW1hbmQuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGdldEV4ZWN1dGlvbihpZDogc3RyaW5nKTogSUFjdGl2ZVRlcm1pbmFsRXhlY3V0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gUnVuSW5UZXJtaW5hbFRvb2wuX2FjdGl2ZUV4ZWN1dGlvbnMuZ2V0KGlkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1vdmVzIGFuIGFjdGl2ZSB0ZXJtaW5hbCBleGVjdXRpb24gYnkgSUQgYW5kIGRpc3Bvc2VzIGl0LlxuXHQgKiBAcmV0dXJucyB0cnVlIGlmIHRoZSBleGVjdXRpb24gd2FzIGZvdW5kIGFuZCByZW1vdmVkLCBmYWxzZSBvdGhlcndpc2UuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIHJlbW92ZUV4ZWN1dGlvbihpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZXhlY3V0aW9uID0gUnVuSW5UZXJtaW5hbFRvb2wuX2FjdGl2ZUV4ZWN1dGlvbnMuZ2V0KGlkKTtcblx0XHRpZiAoIWV4ZWN1dGlvbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRleGVjdXRpb24uZGlzcG9zZSgpO1xuXHRcdFJ1bkluVGVybWluYWxUb29sLl9hY3RpdmVFeGVjdXRpb25zLmRlbGV0ZShpZCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogTWFya3MgYSB0ZXJtaW5hbCBJRCBhcyBiZWluZyBraWxsZWQgYnkgdGhlIGBraWxsX3Rlcm1pbmFsYCB0b29sIHNvIHRoYXRcblx0ICogdGhlIGBvbkRpc3Bvc2VkYCBoYW5kbGVyIGluIGBfcmVnaXN0ZXJDb21wbGV0aW9uTm90aWZpY2F0aW9uYCBza2lwcyB0aGVcblx0ICogcmVkdW5kYW50IHN0ZWVyaW5nIG1lc3NhZ2UuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIG1hcmtLaWxsZWRCeVRvb2woaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdFJ1bkluVGVybWluYWxUb29sLl9raWxsZWRCeVRvb2wuYWRkKGlkKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVFeGVjdXRpb25PcHRpb25zKGFyZ3M6IElSdW5JblRlcm1pbmFsSW5wdXRQYXJhbXMpOiBJUmVzb2x2ZWRFeGVjdXRpb25PcHRpb25zIHtcblx0XHRjb25zdCBtb2RlID0gYXJncy5tb2RlID8/IChhcmdzLmlzQmFja2dyb3VuZCA/ICdhc3luYycgOiAnc3luYycpO1xuXHRcdHN3aXRjaCAobW9kZSkge1xuXHRcdFx0Y2FzZSAnYXN5bmMnOlxuXHRcdFx0XHRyZXR1cm4geyBtb2RlOiAnYXN5bmMnLCBwZXJzaXN0ZW50U2Vzc2lvbjogdHJ1ZSwgd2FpdFN0cmF0ZWd5OiAnaWRsZScgfTtcblx0XHRcdGNhc2UgJ3N5bmMnOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHsgbW9kZTogJ3N5bmMnLCBwZXJzaXN0ZW50U2Vzc2lvbjogZmFsc2UsIHdhaXRTdHJhdGVneTogJ2NvbXBsZXRpb24nIH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX2FsbG93VW5zYW5kYm94ZWRDb21tYW5kcygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93VW5zYW5kYm94ZWRDb21tYW5kcykgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfcmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hSZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cykgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfYWxsb3dTYW5kYm94QXV0b0FwcHJvdmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd0F1dG9BcHByb3ZlKSA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEFsbG93VG9SdW5VbnNhbmRib3hlZENvbW1hbmRzKGFyZ3M6IElSdW5JblRlcm1pbmFsSW5wdXRQYXJhbXMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKGFyZ3MuYWxsb3dUb1J1blVuc2FuZGJveGVkQ29tbWFuZHMgPz8gdGhpcy5fYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzKSA9PT0gdHJ1ZSAmJiB0aGlzLl9hbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHM7XG5cdH1cblxuXHRwcml2YXRlIF9zaG91bGRSZWplY3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlcXVlc3QoaXNTYW5kYm94RW5hYmxlZDogYm9vbGVhbiwgYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzOiBib29sZWFuLCBhcmdzOiBJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzU2FuZGJveEVuYWJsZWQgJiYgYXJncy5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gPT09IHRydWUgJiYgIWFsbG93VW5zYW5kYm94ZWRDb21tYW5kcztcblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZFJlamVjdEFsbG93TmV0d29ya1JlcXVlc3QoaXNTYW5kYm94RW5hYmxlZDogYm9vbGVhbiwgaXNTYW5kYm94QWxsb3dOZXR3b3JrRW5hYmxlZDogYm9vbGVhbiwgYXJnczogSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtcyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc1NhbmRib3hFbmFibGVkICYmICFpc1NhbmRib3hBbGxvd05ldHdvcmtFbmFibGVkICYmIGFyZ3MucmVxdWVzdEFsbG93TmV0d29yayA9PT0gdHJ1ZSAmJiAhdGhpcy5fcmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHM7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRVbnNhbmRib3hlZEV4ZWN1dGlvbkRpc2FibGVkTWVzc2FnZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZShcblx0XHRcdCdydW5JblRlcm1pbmFsLnVuc2FuZGJveGVkLmRpc2FibGVkLnJlc3VsdCcsXG5cdFx0XHRcIlRoZSBjb21tYW5kIHdhcyBub3QgZXhlY3V0ZWQgYmVjYXVzZSBpdCByZXF1ZXN0ZWQgdG8gcnVuIG91dHNpZGUgdGhlIHRlcm1pbmFsIHNhbmRib3gsIGJ1dCBydW5uaW5nIGNvbW1hbmRzIG91dHNpZGUgdGhlIHNhbmRib3ggaXMgZGlzYWJsZWQgYnkgY2hhdC5hZ2VudC5zYW5kYm94LmFsbG93VW5zYW5kYm94ZWRDb21tYW5kcy4gUnVuIHRoZSBjb21tYW5kIGluIHRoZSBzYW5kYm94IGluc3RlYWQsIG9yIGVuYWJsZSB0aGUgc2V0dGluZyB0byBhbGxvdyB1bnNhbmRib3hlZCBleGVjdXRpb24uXCJcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QWxsb3dOZXR3b3JrUmVxdWVzdERpc2FibGVkTWVzc2FnZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZShcblx0XHRcdCdydW5JblRlcm1pbmFsLmFsbG93TmV0d29yay5kaXNhYmxlZC5yZXN1bHQnLFxuXHRcdFx0XCJUaGUgY29tbWFuZCB3YXMgbm90IGV4ZWN1dGVkIGJlY2F1c2UgaXQgcmVxdWVzdGVkIHVucmVzdHJpY3RlZCBuZXR3b3JrIGFjY2VzcyBpbiB0aGUgdGVybWluYWwgc2FuZGJveCwgYnV0IHBlci1jb21tYW5kIG5ldHdvcmsgYWNjZXNzIGlzIGRpc2FibGVkIGJ5IGNoYXQuYWdlbnQuc2FuZGJveC5yZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cy4gUnVuIHRoZSBjb21tYW5kIHdpdGggcmVzdHJpY3RlZCBuZXR3b3JrIGFjY2VzcyBpbnN0ZWFkLCBvciBlbmFibGUgdGhlIHNldHRpbmcgdG8gYWxsb3cgbmV0d29yayBhY2Nlc3MgcmVxdWVzdHMuXCJcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0RGVuaWVkU2FuZGJveEZpbGVBY2Nlc3MocGF0aHM6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCBzYW5kYm94UHJlY2hlY2tJbnB1dHM6IElUZXJtaW5hbFNhbmRib3hQcmVjaGVja0lucHV0cyB8IHVuZGVmaW5lZCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRpZiAoIXBhdGhzPy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmNoZWNrRmlsZUFjY2Vzcygnd3JpdGUnLCBwYXRocywgc2FuZGJveFByZWNoZWNrSW5wdXRzKTtcblx0XHRyZXR1cm4gcmVzdWx0LmRlbmllZDtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkU2FuZGJveEZpbGVBY2Nlc3NEZW5pZWRNZXNzYWdlKGRlbmllZFBhdGhzOiByZWFkb25seSBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZGVuaWVkUGF0aHNNZXNzYWdlID0gZGVuaWVkUGF0aHMubWFwKHBhdGggPT4gYHdyaXRlOiAke3BhdGh9YCkuam9pbignXFxuJyk7XG5cdFx0cmV0dXJuIGxvY2FsaXplKFxuXHRcdFx0J3J1bkluVGVybWluYWwuc2FuZGJveC5maWxlQWNjZXNzRGVuaWVkJyxcblx0XHRcdFwiQWNjZXNzIERlbmllZDogVGhlIGNvbW1hbmQgd2FzIG5vdCBleGVjdXRlZCBiZWNhdXNlIHRoZSB0ZXJtaW5hbCBzYW5kYm94IGRvZXMgbm90IGFsbG93IGFjY2VzcyB0byB0aGUgcmVxdWVzdGVkIGZpbGUgcGF0aHM6XFxuezB9XCIsXG5cdFx0XHRkZW5pZWRQYXRoc01lc3NhZ2Vcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhpcyB0b29sIHdpcmVzIHVwIHNhbmRib3gtc3BlY2lmaWMgY29tbWFuZC1saW5lXG5cdCAqIGJlaGF2aW9yLCBpbmNsdWRpbmcgYm90aCB0aGUge0BsaW5rIENvbW1hbmRMaW5lU2FuZGJveFJld3JpdGVyfSBhbmQgdGhlXG5cdCAqIHtAbGluayBDb21tYW5kTGluZVNhbmRib3hBbmFseXplcn0uIFRoaXMgaXMgc2VwYXJhdGUgZnJvbVxuXHQgKiBJVGVybWluYWxTYW5kYm94U2VydmljZS5pc0VuYWJsZWQoKSwgd2hpY2ggcmVwb3J0cyB0aGUgY3VycmVudCB0ZXJtaW5hbFxuXHQgKiBzYW5kYm94aW5nIGVuYWJsZW1lbnQgZm9yIHRoZSBydW5uaW5nIHdpbmRvdy5cblx0ICovXG5cdHByb3RlY3RlZCBnZXQgX2VuYWJsZUNvbW1hbmRMaW5lU2FuZGJveFJld3JpdGluZygpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJSGlzdG9yeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaGlzdG9yeVNlcnZpY2U6IElIaXN0b3J5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbENoYXRTZXJ2aWNlOiBJVGVybWluYWxDaGF0U2VydmljZSxcblx0XHRASVRlcm1pbmFsTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJVGVybWluYWxMb2dTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0XHRASVRlcm1pbmFsU2FuZGJveFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTYW5kYm94U2VydmljZTogSVRlcm1pbmFsU2FuZGJveFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUFnZW50U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50U2Vzc2lvbnNTZXJ2aWNlOiBJQWdlbnRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGxpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24oKCkgPT4ge1xuXHRcdFx0dGhpcy5faXNTaHV0dGluZ0Rvd24gPSB0cnVlO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX29zQmFja2VuZCA9IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpLnRoZW4ocmVtb3RlRW52ID0+IHJlbW90ZUVudj8ub3MgPz8gT1MpO1xuXG5cdFx0dGhpcy5fdGVybWluYWxUb29sQ3JlYXRvciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRvb2xUZXJtaW5hbENyZWF0b3IpO1xuXHRcdHRoaXMuX3RyZWVTaXR0ZXJDb21tYW5kUGFyc2VyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVHJlZVNpdHRlckNvbW1hbmRQYXJzZXIpKTtcblx0XHR0aGlzLl90ZWxlbWV0cnkgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSdW5JblRlcm1pbmFsVG9vbFRlbGVtZXRyeSk7XG5cdFx0dGhpcy5fY29tbWFuZEFydGlmYWN0Q29sbGVjdG9yID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxDb21tYW5kQXJ0aWZhY3RDb2xsZWN0b3IpO1xuXHRcdHRoaXMuX3Byb2ZpbGVGZXRjaGVyID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxQcm9maWxlRmV0Y2hlcik7XG5cdFx0dGhpcy5fbGFyZ2VPdXRwdXRGaWxlV3JpdGVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGFyZ2VPdXRwdXRGaWxlV3JpdGVyKSk7XG5cblx0XHR0aGlzLl9jb21tYW5kTGluZVJld3JpdGVycyA9IFtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbW1hbmRMaW5lQ2RQcmVmaXhSZXdyaXRlcikpLFxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tbWFuZExpbmVQd3NoQ2hhaW5PcGVyYXRvclJld3JpdGVyLCB0aGlzLl90cmVlU2l0dGVyQ29tbWFuZFBhcnNlcikpLFxuXHRcdF07XG5cdFx0aWYgKHRoaXMuX2VuYWJsZUNvbW1hbmRMaW5lU2FuZGJveFJld3JpdGluZykge1xuXHRcdFx0dGhpcy5fY29tbWFuZExpbmVSZXdyaXRlcnMucHVzaCh0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21tYW5kTGluZVNhbmRib3hSZXdyaXRlciwgdGhpcy5fdHJlZVNpdHRlckNvbW1hbmRQYXJzZXIpKSk7XG5cdFx0fVxuXHRcdC8vIEJhY2tncm91bmREZXRhY2hSZXdyaXRlciBtdXN0IGNvbWUgYWZ0ZXIgU2FuZGJveFJld3JpdGVyIHNvIHRoYXQgbm9odXAvU3RhcnQtUHJvY2Vzc1xuXHRcdC8vIHdyYXBzIHRoZSBlbnRpcmUgc2FuZGJveCBydW50aW1lLCBrZWVwaW5nIGJvdGggdGhlIHNhbmRib3ggYW5kIHRoZSBjaGlsZCBwcm9jZXNzIGFsaXZlXG5cdFx0Ly8gdGhyb3VnaCBWUyBDb2RlIHNodXRkb3duLlxuXHRcdHRoaXMuX2NvbW1hbmRMaW5lUmV3cml0ZXJzLnB1c2godGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tbWFuZExpbmVCYWNrZ3JvdW5kRGV0YWNoUmV3cml0ZXIpKSk7XG5cdFx0Ly8gUHJldmVudEhpc3RvcnlSZXdyaXRlciBtdXN0IGJlIGxhc3Qgc28gdGhlIGxlYWRpbmcgc3BhY2UgaXMgYXBwbGllZCB0byB0aGUgZmluYWxcblx0XHQvLyBjb21tYW5kLCBpbmNsdWRpbmcgYW55IHNhbmRib3ggd3JhcHBpbmcuXG5cdFx0dGhpcy5fY29tbWFuZExpbmVSZXdyaXRlcnMucHVzaCh0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21tYW5kTGluZVByZXZlbnRIaXN0b3J5UmV3cml0ZXIpKSk7XG5cdFx0dGhpcy5fY29tbWFuZExpbmVBbmFseXplcnMgPSBbXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21tYW5kTGluZUZpbGVXcml0ZUFuYWx5emVyLCB0aGlzLl90cmVlU2l0dGVyQ29tbWFuZFBhcnNlciwgKG1lc3NhZ2UsIGFyZ3MpID0+IHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgUnVuSW5UZXJtaW5hbFRvb2wjQ29tbWFuZExpbmVGaWxlV3JpdGVBbmFseXplcjogJHttZXNzYWdlfWAsIGFyZ3MpKSksXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21tYW5kTGluZUF1dG9BcHByb3ZlQW5hbHl6ZXIsIHRoaXMuX3RyZWVTaXR0ZXJDb21tYW5kUGFyc2VyLCB0aGlzLl90ZWxlbWV0cnksIChtZXNzYWdlLCBhcmdzKSA9PiB0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFJ1bkluVGVybWluYWxUb29sI0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVBbmFseXplcjogJHttZXNzYWdlfWAsIGFyZ3MpKSksXG5cdFx0XTtcblx0XHRpZiAodGhpcy5fZW5hYmxlQ29tbWFuZExpbmVTYW5kYm94UmV3cml0aW5nKSB7XG5cdFx0XHR0aGlzLl9jb21tYW5kTGluZUFuYWx5emVycy5wdXNoKHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbW1hbmRMaW5lU2FuZGJveEFuYWx5emVyKSkpO1xuXHRcdH1cblx0XHR0aGlzLl9jb21tYW5kTGluZVByZXNlbnRlcnMgPSBbXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTYW5kYm94ZWRDb21tYW5kTGluZVByZXNlbnRlciksXG5cdFx0XHRuZXcgTm9kZUNvbW1hbmRMaW5lUHJlc2VudGVyKCksXG5cdFx0XHRuZXcgUHl0aG9uQ29tbWFuZExpbmVQcmVzZW50ZXIoKSxcblx0XHRcdG5ldyBSdWJ5Q29tbWFuZExpbmVQcmVzZW50ZXIoKSxcblx0XHRdO1xuXHRcdHRoaXMuX291dHB1dEFuYWx5emVycyA9IFtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNhbmRib3hPdXRwdXRBbmFseXplcikpLFxuXHRcdF07XG5cblx0XHQvLyBDbGVhciBvdXQgd2FybmluZyBhY2NlcHRlZCBzdGF0ZSBpZiB0aGUgc2V0dGluZyBpcyBkaXNhYmxlZFxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4ge1xuXHRcdFx0aWYgKCFlIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5FbmFibGVBdXRvQXBwcm92ZSkpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuRW5hYmxlQXV0b0FwcHJvdmUpICE9PSB0cnVlKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKFRlcm1pbmFsVG9vbENvbmZpcm1hdGlvblN0b3JhZ2VLZXlzLlRlcm1pbmFsQXV0b0FwcHJvdmVXYXJuaW5nQWNjZXB0ZWQsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZXN0b3JlIHRlcm1pbmFsIGFzc29jaWF0aW9ucyBmcm9tIHN0b3JhZ2Vcblx0XHR0aGlzLl9yZXN0b3JlVGVybWluYWxBc3NvY2lhdGlvbnMoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25EaWREaXNwb3NlSW5zdGFuY2UoZSA9PiB7XG5cdFx0XHR0aGlzLl9yZW1vdmVUZXJtaW5hbEFzc29jaWF0aW9ucyhlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIGNoYXQgc2Vzc2lvbiBkaXNwb3NhbCB0byBjbGVhbiB1cCBhc3NvY2lhdGVkIHRlcm1pbmFscyBhbmQgdGVtcCBmaWxlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRTZXJ2aWNlLm9uRGlkRGlzcG9zZVNlc3Npb24oZSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIGUuc2Vzc2lvblJlc291cmNlcykge1xuXHRcdFx0XHR0aGlzLl9jbGVhbnVwU2Vzc2lvblRlcm1pbmFscyhyZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sYXJnZU91dHB1dEZpbGVXcml0ZXIuY2xlYW51cCgpO1xuXHRcdH0pKTtcblxuXHR9XG5cblx0YXN5bmMgaGFuZGxlVG9vbFN0cmVhbShjb250ZXh0OiBJVG9vbEludm9jYXRpb25TdHJlYW1Db250ZXh0LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU3RyZWFtZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBhcnRpYWxJbnB1dCA9IGNvbnRleHQucmF3SW5wdXQgYXMgUGFydGlhbDxJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zPiB8IHVuZGVmaW5lZDtcblx0XHRpZiAocGFydGlhbElucHV0ICYmIHR5cGVvZiBwYXJ0aWFsSW5wdXQgPT09ICdvYmplY3QnICYmIHBhcnRpYWxJbnB1dC5jb21tYW5kKSB7XG5cdFx0XHRjb25zdCB0cnVuY2F0ZWRDb21tYW5kID0gYnVpbGRDb21tYW5kRGlzcGxheVRleHQocGFydGlhbElucHV0LmNvbW1hbmQpO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbk1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3J1bkluVGVybWluYWwuc3RyZWFtaW5nJywgXCJSdW5uaW5nIGB7MH1gXCIsIGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKHRydW5jYXRlZENvbW1hbmQpKSk7XG5cdFx0XHRyZXR1cm4geyBpbnZvY2F0aW9uTWVzc2FnZSB9O1xuXHRcdH1cblx0XHRyZXR1cm4geyBpbnZvY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3J1bkluVGVybWluYWwuc3RyZWFtaW5nLmRlZmF1bHQnLCBcIlJ1bm5pbmcgY29tbWFuZFwiKSB9O1xuXHR9XG5cblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGFyZ3MgPSBjb250ZXh0LnBhcmFtZXRlcnMgYXMgSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtcztcblx0XHRjb25zdCBleGVjdXRpb25PcHRpb25zID0gdGhpcy5fcmVzb2x2ZUV4ZWN1dGlvbk9wdGlvbnMoYXJncyk7XG5cblx0XHRjb25zdCBjaGF0U2Vzc2lvblJlc291cmNlID0gY29udGV4dC5jaGF0U2Vzc2lvblJlc291cmNlO1xuXHRcdGNvbnN0IHNhbmRib3hQcmVjaGVja0lucHV0cyA9IHRoaXMuX2dldFNhbmRib3hQcmVjaGVja0lucHV0cyhjaGF0U2Vzc2lvblJlc291cmNlLCBjb250ZXh0LmNoYXRSZXF1ZXN0SWQpO1xuXHRcdGxldCBpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGNoYXRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdGNvbnN0IHRvb2xUZXJtaW5hbCA9IHRoaXMuX3Nlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5nZXQoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAodG9vbFRlcm1pbmFsICYmICF0b29sVGVybWluYWwuaXNCYWNrZ3JvdW5kKSB7XG5cdFx0XHRcdGluc3RhbmNlID0gdG9vbFRlcm1pbmFsLmluc3RhbmNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBbb3MsIHNoZWxsLCBjd2QsIHNhbmRib3hQcmVyZXFzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuX29zQmFja2VuZCxcblx0XHRcdHRoaXMuX3Byb2ZpbGVGZXRjaGVyLmdldENvcGlsb3RTaGVsbCgpLFxuXHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0bGV0IGN3ZCA9IGF3YWl0IGluc3RhbmNlPy5nZXRDd2RSZXNvdXJjZSgpO1xuXHRcdFx0XHRpZiAoIWN3ZCkge1xuXHRcdFx0XHRcdC8vIFByZWZlciB0aGUgc2Vzc2lvbidzIHdvcmtpbmcgZGlyZWN0b3J5IChhZ2VudHMgd2luZG93KSBvdmVyIHRoZVxuXHRcdFx0XHRcdC8vIGxhc3QgYWN0aXZlIHdvcmtzcGFjZSByb290LCB3aGljaCBtYXkgcG9pbnQgdG8gYSBkaWZmZXJlbnQgc2Vzc2lvbidzIGZvbGRlci5cblx0XHRcdFx0XHRjb25zdCBzZXNzaW9uTW9kZWwgPSBjaGF0U2Vzc2lvblJlc291cmNlID8gdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihjaGF0U2Vzc2lvblJlc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAoc2Vzc2lvbk1vZGVsPy53b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0XHRjd2QgPSBzZXNzaW9uTW9kZWwud29ya2luZ0RpcmVjdG9yeTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgYWN0aXZlV29ya3NwYWNlUm9vdFVyaSA9IHRoaXMuX2hpc3RvcnlTZXJ2aWNlLmdldExhc3RBY3RpdmVXb3Jrc3BhY2VSb290KCk7XG5cdFx0XHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSBhY3RpdmVXb3Jrc3BhY2VSb290VXJpID8gdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKGFjdGl2ZVdvcmtzcGFjZVJvb3RVcmkpID8/IHVuZGVmaW5lZCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdGN3ZCA9IHdvcmtzcGFjZUZvbGRlcj8udXJpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gY3dkO1xuXHRcdFx0fSkoKSxcblx0XHRcdHRoaXMuX3Rlcm1pbmFsU2FuZGJveFNlcnZpY2UuY2hlY2tGb3JTYW5kYm94aW5nUHJlcmVxcyhmYWxzZSwgc2FuZGJveFByZWNoZWNrSW5wdXRzKVxuXHRcdF0pO1xuXHRcdGNvbnN0IGxhbmd1YWdlID0gb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gJ3B3c2gnIDogJ3NoJztcblx0XHRjb25zdCBpc1NhbmRib3hFbmFibGVkID0gc2FuZGJveFByZXJlcXMuZW5hYmxlZDtcblx0XHRjb25zdCBpc1NhbmRib3hBbGxvd05ldHdvcmtFbmFibGVkID0gaXNTYW5kYm94RW5hYmxlZCAmJiBhd2FpdCB0aGlzLl90ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQoKTtcblx0XHRjb25zdCBhbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMgPSB0aGlzLl9nZXRBbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kcyhhcmdzKTtcblx0XHRjb25zdCBleHBsaWNpdFVuc2FuZGJveFJlcXVlc3QgPSBpc1NhbmRib3hFbmFibGVkICYmIGFsbG93VW5zYW5kYm94ZWRDb21tYW5kcyAmJiBhcmdzLnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiA9PT0gdHJ1ZTtcblx0XHRjb25zdCBleHBsaWNpdEFsbG93TmV0d29ya1JlcXVlc3QgPSBpc1NhbmRib3hFbmFibGVkICYmICFpc1NhbmRib3hBbGxvd05ldHdvcmtFbmFibGVkICYmIHRoaXMuX3JldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzICYmICFleHBsaWNpdFVuc2FuZGJveFJlcXVlc3QgJiYgYXJncy5yZXF1ZXN0QWxsb3dOZXR3b3JrID09PSB0cnVlO1xuXHRcdGxldCByZXF1aXJlc1Vuc2FuZGJveENvbmZpcm1hdGlvbiA9IGV4cGxpY2l0VW5zYW5kYm94UmVxdWVzdDtcblx0XHRsZXQgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uID0gZXhwbGljaXRVbnNhbmRib3hSZXF1ZXN0ID8gYXJncy5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24gOiB1bmRlZmluZWQ7XG5cdFx0bGV0IHJlcXVpcmVzQWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uID0gZXhwbGljaXRBbGxvd05ldHdvcmtSZXF1ZXN0O1xuXHRcdGxldCByZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uID0gZXhwbGljaXRBbGxvd05ldHdvcmtSZXF1ZXN0ID8gYXJncy5yZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uIDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgbWlzc2luZ0RlcGVuZGVuY2llcyA9IHNhbmRib3hQcmVyZXFzLmZhaWxlZENoZWNrID09PSBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjay5EZXBlbmRlbmNpZXMgJiYgc2FuZGJveFByZXJlcXMubWlzc2luZ0RlcGVuZGVuY2llcz8ubGVuZ3RoXG5cdFx0XHQ/IHNhbmRib3hQcmVyZXFzLm1pc3NpbmdEZXBlbmRlbmNpZXNcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNhbkluc3RhbGxNaXNzaW5nRGVwZW5kZW5jaWVzID0gISFtaXNzaW5nRGVwZW5kZW5jaWVzICYmIHNhbmRib3hQcmVyZXFzLmNhbkluc3RhbGxNaXNzaW5nRGVwZW5kZW5jaWVzID09PSB0cnVlO1xuXHRcdGNvbnN0IHNhbmRib3hSZW1lZGlhdGlvbnMgPSBzYW5kYm94UHJlcmVxcy5mYWlsZWRDaGVjayA9PT0gVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2suQnViYmxld3JhcCAmJiBzYW5kYm94UHJlcmVxcy5yZW1lZGlhdGlvbnM/Lmxlbmd0aFxuXHRcdFx0PyBbLi4uc2FuZGJveFByZXJlcXMucmVtZWRpYXRpb25zXVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2FuZGJveFByZXJlcXVpc2l0ZUZhaWx1cmUgPSBzYW5kYm94UHJlcmVxcy5mYWlsZWRDaGVjayA9PT0gVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2suQnViYmxld3JhcCAmJiAhc2FuZGJveFJlbWVkaWF0aW9uc1xuXHRcdFx0PyBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5idWJibGV3cmFwLnVudXNhYmxlJywgXCJCdWJibGV3cmFwIGlzIGluc3RhbGxlZCBidXQgY2Fubm90IGNyZWF0ZSB0aGUgcmVxdWlyZWQgc2FuZGJveCBuYW1lc3BhY2Ugb24gdGhpcyBzeXN0ZW0uIFRoZSBjb21tYW5kIHdhcyBub3QgZXhlY3V0ZWQuXCIpXG5cdFx0XHQ6IG1pc3NpbmdEZXBlbmRlbmNpZXMgJiYgIWNhbkluc3RhbGxNaXNzaW5nRGVwZW5kZW5jaWVzXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3J1bkluVGVybWluYWwubWlzc2luZ0RlcHMudW5zdXBwb3J0ZWRJbnN0YWxsZXInLCBcIlRoZSBmb2xsb3dpbmcgZGVwZW5kZW5jaWVzIHJlcXVpcmVkIGZvciBzYW5kYm94ZWQgZXhlY3V0aW9uIGFyZSBub3QgaW5zdGFsbGVkOiB7MH0uIEluc3RhbGwgdGhlbSB1c2luZyB5b3VyIHN5c3RlbSBwYWNrYWdlIG1hbmFnZXIsIHRoZW4gcnVuIHRoZSBjb21tYW5kIGFnYWluLlwiLCBtaXNzaW5nRGVwZW5kZW5jaWVzLmpvaW4oJywgJykpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgdGVybWluYWxUb29sU2Vzc2lvbklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Ly8gR2VuZXJhdGUgYSBjdXN0b20gY29tbWFuZCBJRCB0byBsaW5rIHRoZSBjb21tYW5kIGJldHdlZW4gcmVuZGVyZXIgYW5kIHB0eSBob3N0XG5cdFx0Y29uc3QgdGVybWluYWxDb21tYW5kSWQgPSBgdG9vbC0ke2dlbmVyYXRlVXVpZCgpfWA7XG5cblx0XHRpZiAodGhpcy5fc2hvdWxkUmVqZWN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZXF1ZXN0KGlzU2FuZGJveEVuYWJsZWQsIGFsbG93VW5zYW5kYm94ZWRDb21tYW5kcywgYXJncykpIHtcblx0XHRcdGNvbnN0IGNvbW1hbmRUb0Rpc3BsYXkgPSBub3JtYWxpemVUZXJtaW5hbENvbW1hbmRGb3JEaXNwbGF5KGFyZ3MuY29tbWFuZCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnVuc2FuZGJveGVkLmRpc2FibGVkLmludm9jYXRpb24nLCBcIk5vdCBydW5uaW5nIGB7MH1gIGJlY2F1c2UgdW5zYW5kYm94ZWQgZXhlY3V0aW9uIGlzIGRpc2FibGVkXCIsIGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKGJ1aWxkQ29tbWFuZERpc3BsYXlUZXh0KGNvbW1hbmRUb0Rpc3BsYXkpKSkpLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmVycm9yLFxuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogdW5kZWZpbmVkLFxuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3Rlcm1pbmFsJyxcblx0XHRcdFx0XHR0ZXJtaW5hbFRvb2xTZXNzaW9uSWQsXG5cdFx0XHRcdFx0dGVybWluYWxDb21tYW5kSWQsXG5cdFx0XHRcdFx0Y29tbWFuZExpbmU6IHtcblx0XHRcdFx0XHRcdG9yaWdpbmFsOiBhcmdzLmNvbW1hbmQsXG5cdFx0XHRcdFx0XHRmb3JEaXNwbGF5OiBjb21tYW5kVG9EaXNwbGF5LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y3dkLFxuXHRcdFx0XHRcdGxhbmd1YWdlLFxuXHRcdFx0XHRcdGlzQmFja2dyb3VuZDogZXhlY3V0aW9uT3B0aW9ucy5wZXJzaXN0ZW50U2Vzc2lvbixcblx0XHRcdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IGZhbHNlLFxuXHRcdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fc2hvdWxkUmVqZWN0QWxsb3dOZXR3b3JrUmVxdWVzdChpc1NhbmRib3hFbmFibGVkLCBpc1NhbmRib3hBbGxvd05ldHdvcmtFbmFibGVkLCBhcmdzKSkge1xuXHRcdFx0Y29uc3QgY29tbWFuZFRvRGlzcGxheSA9IG5vcm1hbGl6ZVRlcm1pbmFsQ29tbWFuZEZvckRpc3BsYXkoYXJncy5jb21tYW5kKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3J1bkluVGVybWluYWwuYWxsb3dOZXR3b3JrLmRpc2FibGVkLmludm9jYXRpb24nLCBcIk5vdCBydW5uaW5nIGB7MH1gIGJlY2F1c2UgdW5yZXN0cmljdGVkIG5ldHdvcmsgYWNjZXNzIGluIHRoZSBzYW5kYm94IGlzIGRpc2FibGVkXCIsIGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKGJ1aWxkQ29tbWFuZERpc3BsYXlUZXh0KGNvbW1hbmRUb0Rpc3BsYXkpKSkpLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmVycm9yLFxuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogdW5kZWZpbmVkLFxuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3Rlcm1pbmFsJyxcblx0XHRcdFx0XHR0ZXJtaW5hbFRvb2xTZXNzaW9uSWQsXG5cdFx0XHRcdFx0dGVybWluYWxDb21tYW5kSWQsXG5cdFx0XHRcdFx0Y29tbWFuZExpbmU6IHtcblx0XHRcdFx0XHRcdG9yaWdpbmFsOiBhcmdzLmNvbW1hbmQsXG5cdFx0XHRcdFx0XHRmb3JEaXNwbGF5OiBjb21tYW5kVG9EaXNwbGF5LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y3dkLFxuXHRcdFx0XHRcdGxhbmd1YWdlLFxuXHRcdFx0XHRcdGlzQmFja2dyb3VuZDogZXhlY3V0aW9uT3B0aW9ucy5wZXJzaXN0ZW50U2Vzc2lvbixcblx0XHRcdFx0XHRyZXF1ZXN0QWxsb3dOZXR3b3JrOiBmYWxzZSxcblx0XHRcdFx0XHRyZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJld3JpdGVSZXN1bHQgPSBhd2FpdCB0aGlzLl9yZXdyaXRlQ29tbWFuZExpbmUoYXJncy5jb21tYW5kLCB7XG5cdFx0XHRjd2QsXG5cdFx0XHRzaGVsbCxcblx0XHRcdG9zLFxuXHRcdFx0aXNCYWNrZ3JvdW5kOiBleGVjdXRpb25PcHRpb25zLnBlcnNpc3RlbnRTZXNzaW9uLFxuXHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uOiBhbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMgPyByZXF1aXJlc1Vuc2FuZGJveENvbmZpcm1hdGlvbiA6IGZhbHNlLFxuXHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uLFxuXHRcdFx0cmVxdWVzdEFsbG93TmV0d29yazogZXhwbGljaXRBbGxvd05ldHdvcmtSZXF1ZXN0LFxuXHRcdFx0cmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbixcblx0XHRcdHNhbmRib3hQcmVjaGVja0lucHV0cyxcblx0XHR9KTtcblx0XHRjb25zdCByZXdyaXR0ZW5Db21tYW5kOiBzdHJpbmcgfCB1bmRlZmluZWQgPSByZXdyaXRlUmVzdWx0LnJld3JpdHRlbkNvbW1hbmQ7XG5cdFx0Y29uc3QgZm9yRGlzcGxheUNvbW1hbmQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHJld3JpdGVSZXN1bHQuZm9yRGlzcGxheUNvbW1hbmQ7XG5cdFx0Y29uc3QgaXNTYW5kYm94V3JhcHBlZCA9IHJld3JpdGVSZXN1bHQuaXNTYW5kYm94V3JhcHBlZDtcblx0XHRyZXF1aXJlc1Vuc2FuZGJveENvbmZpcm1hdGlvbiA9IHJld3JpdGVSZXN1bHQucmVxdWlyZXNVbnNhbmRib3hDb25maXJtYXRpb247XG5cdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uID0gcmV3cml0ZVJlc3VsdC5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb247XG5cdFx0cmVxdWlyZXNBbGxvd05ldHdvcmtDb25maXJtYXRpb24gPSByZXdyaXRlUmVzdWx0LnJlcXVpcmVzQWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uO1xuXHRcdHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24gPSByZXdyaXRlUmVzdWx0LnJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb247XG5cdFx0Y29uc3QgYmxvY2tlZERvbWFpbnMgPSByZXdyaXRlUmVzdWx0LmJsb2NrZWREb21haW5zO1xuXG5cdFx0Y29uc3QgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHR0ZXJtaW5hbFRvb2xTZXNzaW9uSWQsXG5cdFx0XHR0ZXJtaW5hbENvbW1hbmRJZCxcblx0XHRcdGNvbW1hbmRMaW5lOiB7XG5cdFx0XHRcdG9yaWdpbmFsOiBhcmdzLmNvbW1hbmQsXG5cdFx0XHRcdHRvb2xFZGl0ZWQ6IHJld3JpdHRlbkNvbW1hbmQgPT09IGFyZ3MuY29tbWFuZCA/IHVuZGVmaW5lZCA6IHJld3JpdHRlbkNvbW1hbmQsXG5cdFx0XHRcdGZvckRpc3BsYXk6IGZvckRpc3BsYXlDb21tYW5kID8/IG5vcm1hbGl6ZVRlcm1pbmFsQ29tbWFuZEZvckRpc3BsYXkocmV3cml0dGVuQ29tbWFuZCA/PyBhcmdzLmNvbW1hbmQpLFxuXHRcdFx0XHRpc1NhbmRib3hXcmFwcGVkLFxuXHRcdFx0fSxcblx0XHRcdGN3ZCxcblx0XHRcdGxhbmd1YWdlLFxuXHRcdFx0aXNCYWNrZ3JvdW5kOiBleGVjdXRpb25PcHRpb25zLnBlcnNpc3RlbnRTZXNzaW9uLFxuXHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uOiByZXF1aXJlc1Vuc2FuZGJveENvbmZpcm1hdGlvbixcblx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbixcblx0XHRcdHJlcXVlc3RBbGxvd05ldHdvcms6IHJlcXVpcmVzQWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uLFxuXHRcdFx0cmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbixcblx0XHRcdG1pc3NpbmdTYW5kYm94RGVwZW5kZW5jaWVzOiBtaXNzaW5nRGVwZW5kZW5jaWVzLFxuXHRcdFx0c2FuZGJveFJlbWVkaWF0aW9ucyxcblx0XHRcdHNhbmRib3hQcmVyZXF1aXNpdGVGYWlsdXJlLFxuXHRcdH07XG5cblx0XHRsZXQgc2FuZGJveFByZXJlcXVpc2l0ZUNvbmZpcm1hdGlvbjogSVRvb2xDb25maXJtYXRpb25NZXNzYWdlcyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHQvLyBJZiBzYW5kYm94IGRlcGVuZGVuY2llcyBhcmUgbWlzc2luZywgc2hvdyBhIGNvbmZpcm1hdGlvbiBhc2tpbmcgdGhlIHVzZXIgdG8gaW5zdGFsbCB0aGVtLlxuXHRcdC8vIFRoaXMgaXMgaGFuZGxlZCBiZWZvcmUgdGhlIHRvb2wgaXMgaW52b2tlZCBzbyB0aGUgbW9kZWwgbmV2ZXIgc2VlcyB0aGUgZGVwZW5kZW5jeSBlcnJvci5cblx0XHRpZiAobWlzc2luZ0RlcGVuZGVuY2llcyAmJiBjYW5JbnN0YWxsTWlzc2luZ0RlcGVuZGVuY2llcykge1xuXHRcdFx0Y29uc3QgZGVwc0xpc3QgPSBtaXNzaW5nRGVwZW5kZW5jaWVzLmpvaW4oJywgJyk7XG5cdFx0XHRzYW5kYm94UHJlcmVxdWlzaXRlQ29uZmlybWF0aW9uID0ge1xuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3J1bkluVGVybWluYWwubWlzc2luZ0RlcHMudGl0bGUnLCBcIk1pc3NpbmcgU2FuZGJveCBEZXBlbmRlbmNpZXNcIiksXG5cdFx0XHRcdG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZShcblx0XHRcdFx0XHQncnVuSW5UZXJtaW5hbC5taXNzaW5nRGVwcy5tZXNzYWdlJyxcblx0XHRcdFx0XHRcIlRoZSBmb2xsb3dpbmcgZGVwZW5kZW5jaWVzIHJlcXVpcmVkIGZvciBzYW5kYm94ZWQgZXhlY3V0aW9uIGFyZSBub3QgaW5zdGFsbGVkOiB7MH0uIFdvdWxkIHlvdSBsaWtlIHRvIGluc3RhbGwgdGhlbT9cIixcblx0XHRcdFx0XHRkZXBzTGlzdFxuXHRcdFx0XHQpKSxcblx0XHRcdFx0Y3VzdG9tT3B0aW9uczogW1xuXHRcdFx0XHRcdHsgaWQ6ICdpbnN0YWxsJywgbGFiZWw6IGxvY2FsaXplKCdydW5JblRlcm1pbmFsLm1pc3NpbmdEZXBzLmluc3RhbGwnLCBcIkluc3RhbGxcIiksIGtpbmQ6IENvbmZpcm1hdGlvbk9wdGlvbktpbmQuQXBwcm92ZSB9LFxuXHRcdFx0XHRcdHsgaWQ6ICdjYW5jZWwnLCBsYWJlbDogbG9jYWxpemUoJ3J1bkluVGVybWluYWwubWlzc2luZ0RlcHMuY2FuY2VsJywgXCJDYW5jZWxcIiksIGtpbmQ6IENvbmZpcm1hdGlvbk9wdGlvbktpbmQuRGVueSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBIQUNLOiBFeGl0IGVhcmx5IGlmIHRoZXJlJ3MgYW4gYWx0ZXJuYXRpdmUgcmVjb21tZW5kYXRpb24sIHRoaXMgaXMgYSBsaXR0bGUgaGFja3kgYnV0XG5cdFx0Ly8gaXQncyB0aGUgY3VycmVudCBtZWNoYW5pc20gZm9yIHJlLXJvdXRpbmcgdGVybWluYWwgdG9vbCBjYWxscyB0byBzb21ldGhpbmcgZWxzZS5cblx0XHRjb25zdCBhbHRlcm5hdGl2ZVJlY29tbWVuZGF0aW9uID0gZ2V0UmVjb21tZW5kZWRUb29sc092ZXJSdW5JblRlcm1pbmFsKGFyZ3MuY29tbWFuZCwgdGhpcy5fbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSk7XG5cdFx0aWYgKGFsdGVybmF0aXZlUmVjb21tZW5kYXRpb24pIHtcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEuYWx0ZXJuYXRpdmVSZWNvbW1lbmRhdGlvbiA9IGFsdGVybmF0aXZlUmVjb21tZW5kYXRpb247XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogdW5kZWZpbmVkLFxuXHRcdFx0XHRwcmVzZW50YXRpb246IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbixcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdC8vIERldGVybWluZSBhdXRvIGFwcHJvdmFsLCB0aGlzIGhhcHBlbnMgZXZlbiB3aGVuIGF1dG8gYXBwcm92ZSBpcyBvZmYgdG8gdGhhdCByZWFzb25pbmdcblx0XHQvLyBjYW4gYmUgcmV2aWV3ZWQgaW4gdGhlIHRlcm1pbmFsIGNoYW5uZWwuIEl0IGFsc28gYWxsb3dzIGdhdWdpbmcgdGhlIGVmZmVjdGl2ZSBzZXQgb2Zcblx0XHQvLyBjb21tYW5kcyB0aGF0IHdvdWxkIGJlIGF1dG8gYXBwcm92ZWQgaWYgaXQgd2VyZSBlbmFibGVkLlxuXHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gZm9yRGlzcGxheUNvbW1hbmQgPz8gcmV3cml0dGVuQ29tbWFuZCA/PyBhcmdzLmNvbW1hbmQ7XG5cblx0XHRjb25zdCBpc0VsaWdpYmxlRm9yQXV0b0FwcHJvdmFsID0gKCkgPT4gaXNUb29sRWxpZ2libGVGb3JUZXJtaW5hbEF1dG9BcHByb3ZhbChUT09MX1JFRkVSRU5DRV9OQU1FLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgTEVHQUNZX1RPT0xfUkVGRVJFTkNFX0ZVTExfTkFNRVMpO1xuXHRcdGNvbnN0IGlzQXV0b0FwcHJvdmVFbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5FbmFibGVBdXRvQXBwcm92ZSkgPT09IHRydWU7XG5cdFx0Y29uc3QgaXNBdXRvQXBwcm92ZUFsbG93ZWQgPSBpc1Rlcm1pbmFsQXV0b0FwcHJvdmVBbGxvd2VkKFRPT0xfUkVGRVJFTkNFX05BTUUsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9zdG9yYWdlU2VydmljZSwgTEVHQUNZX1RPT0xfUkVGRVJFTkNFX0ZVTExfTkFNRVMpO1xuXG5cdFx0Y29uc3QgY29tbWFuZExpbmVBbmFseXplck9wdGlvbnM6IElDb21tYW5kTGluZUFuYWx5emVyT3B0aW9ucyA9IHtcblx0XHRcdGNvbW1hbmRMaW5lLFxuXHRcdFx0Y3dkLFxuXHRcdFx0b3MsXG5cdFx0XHRzaGVsbCxcblx0XHRcdHRyZWVTaXR0ZXJMYW5ndWFnZTogaXNQb3dlclNoZWxsKHNoZWxsLCBvcykgPyBUcmVlU2l0dGVyQ29tbWFuZFBhcnNlckxhbmd1YWdlLlBvd2VyU2hlbGwgOiBUcmVlU2l0dGVyQ29tbWFuZFBhcnNlckxhbmd1YWdlLkJhc2gsXG5cdFx0XHR0ZXJtaW5hbFRvb2xTZXNzaW9uSWQsXG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlLFxuXHRcdFx0cmVxdWlyZXNVbnNhbmRib3hDb25maXJtYXRpb24sXG5cdFx0XHRyZXF1aXJlc0FsbG93TmV0d29ya0NvbmZpcm1hdGlvbixcblx0XHRcdGhhc1Nlc3Npb25BdXRvQXBwcm92YWw6ICEhY2hhdFNlc3Npb25SZXNvdXJjZSAmJiB0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLmhhc0NoYXRTZXNzaW9uQXV0b0FwcHJvdmFsKGNoYXRTZXNzaW9uUmVzb3VyY2UpLFxuXHRcdH07XG5cblx0XHQvLyBJbiBBdXRvcGlsb3QvQnlwYXNzIEFwcHJvdmFscyBtb2RlcywgZG8gbm90IGludGVyYWN0IHdpdGggdGVybWluYWwgYXV0by1hcHByb3ZlIHJ1bGVzLlxuXHRcdC8vIENvbW1hbmRzIHNob3VsZCBmbG93IHRocm91Z2ggZGlyZWN0bHkgYmFzZWQgb24gdGhlIGNoYXQgcGVybWlzc2lvbiBsZXZlbC5cblx0XHRjb25zdCBpc1Nlc3Npb25BdXRvQXBwcm92ZWQgPSBjaGF0U2Vzc2lvblJlc291cmNlICYmIGlzU2Vzc2lvbkF1dG9BcHByb3ZlTGV2ZWwoY2hhdFNlc3Npb25SZXNvdXJjZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLCB0aGlzLl9jaGF0U2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZExpbmVBbmFseXplcnMgPSBpc1Nlc3Npb25BdXRvQXBwcm92ZWRcblx0XHRcdD8gdGhpcy5fY29tbWFuZExpbmVBbmFseXplcnMuZmlsdGVyKGUgPT4gIShlIGluc3RhbmNlb2YgQ29tbWFuZExpbmVBdXRvQXBwcm92ZUFuYWx5emVyKSlcblx0XHRcdDogdGhpcy5fY29tbWFuZExpbmVBbmFseXplcnM7XG5cdFx0Y29uc3QgY29tbWFuZExpbmVBbmFseXplclJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChjb21tYW5kTGluZUFuYWx5emVycy5tYXAoZSA9PiBlLmFuYWx5emUoY29tbWFuZExpbmVBbmFseXplck9wdGlvbnMpKSk7XG5cblx0XHRjb25zdCBkaXNjbGFpbWVyc1JhdyA9IGNvbW1hbmRMaW5lQW5hbHl6ZXJSZXN1bHRzLm1hcChlID0+IGUuZGlzY2xhaW1lcnMpLmZpbHRlcihlID0+ICEhZSkuZmxhdE1hcChlID0+IGUpO1xuXHRcdGxldCBkaXNjbGFpbWVyOiBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGRpc2NsYWltZXJzUmF3Lmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGRpc2NsYWltZXJUZXh0cyA9IGRpc2NsYWltZXJzUmF3Lm1hcChkID0+IHR5cGVvZiBkID09PSAnc3RyaW5nJyA/IGQgOiBkLnZhbHVlKTtcblx0XHRcdGNvbnN0IGhhc01hcmtkb3duRGlzY2xhaW1lciA9IGRpc2NsYWltZXJzUmF3LnNvbWUoZCA9PiB0eXBlb2YgZCAhPT0gJ3N0cmluZycpO1xuXHRcdFx0Y29uc3QgbWRPcHRpb25zID0gaGFzTWFya2Rvd25EaXNjbGFpbWVyXG5cdFx0XHRcdD8geyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSwgaXNUcnVzdGVkOiB7IGVuYWJsZWRDb21tYW5kczogW1Rlcm1pbmFsQ2hhdENvbW1hbmRJZC5PcGVuVGVybWluYWxTZXR0aW5nc0xpbmtdIH0gfVxuXHRcdFx0XHQ6IHsgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfTtcblx0XHRcdGRpc2NsYWltZXIgPSBuZXcgTWFya2Rvd25TdHJpbmcoYCQoJHtDb2RpY29uLmluZm8uaWR9KSBgICsgZGlzY2xhaW1lclRleHRzLmpvaW4oJyAnKSwgbWRPcHRpb25zKTtcblx0XHR9XG5cblx0XHRjb25zdCBhbmFseXplcnNJc0F1dG9BcHByb3ZlQWxsb3dlZCA9IGNvbW1hbmRMaW5lQW5hbHl6ZXJSZXN1bHRzLmV2ZXJ5KGUgPT4gZS5pc0F1dG9BcHByb3ZlQWxsb3dlZCk7XG5cdFx0Y29uc3QgY3VzdG9tQWN0aW9ucyA9IGlzRWxpZ2libGVGb3JBdXRvQXBwcm92YWwoKSAmJiBhbmFseXplcnNJc0F1dG9BcHByb3ZlQWxsb3dlZCA/IGNvbW1hbmRMaW5lQW5hbHl6ZXJSZXN1bHRzLm1hcChlID0+IGUuY3VzdG9tQWN0aW9ucyA/PyBbXSkuZmxhdCgpIDogdW5kZWZpbmVkO1xuXG5cdFx0bGV0IHNoZWxsVHlwZSA9IGJhc2VuYW1lKHNoZWxsLCAnLmV4ZScpO1xuXHRcdGlmIChzaGVsbFR5cGUgPT09ICdwb3dlcnNoZWxsJykge1xuXHRcdFx0c2hlbGxUeXBlID0gJ3B3c2gnO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoZSBjb21tYW5kIHdvdWxkIGJlIGF1dG8tYXBwcm92ZWQgYmFzZWQgb24gcnVsZXMgKGlnbm9yaW5nIHdhcm5pbmcgc3RhdGUpXG5cdFx0Y29uc3Qgd291bGRCZUF1dG9BcHByb3ZlZCA9IChcblx0XHRcdC8vIERvZXMgYXQgbGVhc3Qgb25lIGFuYWx5emVyIGF1dG8gYXBwcm92ZVxuXHRcdFx0Y29tbWFuZExpbmVBbmFseXplclJlc3VsdHMuc29tZShlID0+IGUuaXNBdXRvQXBwcm92ZWQpICYmXG5cdFx0XHQvLyBObyBhbmFseXplciBkZW5pZXMgYXV0byBhcHByb3ZhbFxuXHRcdFx0Y29tbWFuZExpbmVBbmFseXplclJlc3VsdHMuZXZlcnkoZSA9PiBlLmlzQXV0b0FwcHJvdmVkICE9PSBmYWxzZSkgJiZcblx0XHRcdC8vIEFsbCBhbmFseXplcnMgYWxsb3cgYXV0byBhcHByb3ZhbFxuXHRcdFx0YW5hbHl6ZXJzSXNBdXRvQXBwcm92ZUFsbG93ZWRcblx0XHQpO1xuXG5cdFx0Y29uc3QgaXNBdXRvQXBwcm92ZWRCeVJ1bGVzID0gKFxuXHRcdFx0Ly8gSXMgdGhlIHNldHRpbmcgZW5hYmxlZCBhbmQgdGhlIHVzZXIgaGFzIG9wdGVkLWluXG5cdFx0XHRpc0F1dG9BcHByb3ZlQWxsb3dlZCAmJlxuXHRcdFx0Ly8gV291bGQgYmUgYXV0by1hcHByb3ZlZCBiYXNlZCBvbiBydWxlc1xuXHRcdFx0d291bGRCZUF1dG9BcHByb3ZlZFxuXHRcdCk7XG5cdFx0Y29uc3QgaXNTYW5kYm94QXV0b0FwcHJvdmVkID0gaXNTYW5kYm94RW5hYmxlZCAmJiB0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLmlzU2FuZGJveFdyYXBwZWQgPT09IHRydWUgJiYgIXJlcXVpcmVzQWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uICYmIHRoaXMuX2FsbG93U2FuZGJveEF1dG9BcHByb3ZlO1xuXHRcdGNvbnN0IGlzRmluYWxBdXRvQXBwcm92ZWQgPSBpc1NhbmRib3hBdXRvQXBwcm92ZWQgfHwgaXNBdXRvQXBwcm92ZWRCeVJ1bGVzIHx8IGNvbW1hbmRMaW5lQW5hbHl6ZXJSZXN1bHRzLnNvbWUoZSA9PiBlLmZvcmNlQXV0b0FwcHJvdmFsKTtcblxuXHRcdC8vIFBhc3MgYXV0byBhcHByb3ZlIGluZm8gaWYgdGhlIGNvbW1hbmQ6XG5cdFx0Ly8gLSBXYXMgYXV0byBhcHByb3ZlZFxuXHRcdC8vIC0gV291bGQgaGF2ZSBiZSBhdXRvIGFwcHJvdmVkLCBidXQgdGhlIG9wdC1pbiB3YXJuaW5nIHdhcyBub3QgYWNjZXB0ZWRcblx0XHQvLyAtIFdhcyBkZW5pZWQgZXhwbGljaXRseSBieSBhIHJ1bGVcblx0XHQvL1xuXHRcdC8vIFRoaXMgYWxsb3dzIHN1cmZhY2luZyB0aGlzIGluZm9ybWF0aW9uIHRvIHRoZSB1c2VyLlxuXHRcdGlmIChpc0ZpbmFsQXV0b0FwcHJvdmVkIHx8IChpc0F1dG9BcHByb3ZlRW5hYmxlZCAmJiBjb21tYW5kTGluZUFuYWx5emVyUmVzdWx0cy5zb21lKGUgPT4gZS5hdXRvQXBwcm92ZUluZm8pKSkge1xuXHRcdFx0dG9vbFNwZWNpZmljRGF0YS5hdXRvQXBwcm92ZUluZm8gPSBjb21tYW5kTGluZUFuYWx5emVyUmVzdWx0cy5maW5kKGUgPT4gZS5hdXRvQXBwcm92ZUluZm8pPy5hdXRvQXBwcm92ZUluZm87XG5cdFx0fVxuXG5cdFx0Ly8gRXh0cmFjdCBjZCBwcmVmaXggZm9yIGRpc3BsYXkgLSBzaG93IGRpcmVjdG9yeSBpbiB0aXRsZSwgY29tbWFuZCBzdWZmaXggaW4gZWRpdG9yXG5cdFx0Y29uc3QgY29tbWFuZFRvRGlzcGxheSA9ICh0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLmZvckRpc3BsYXkgPz8gdG9vbFNwZWNpZmljRGF0YS5jb21tYW5kTGluZS51c2VyRWRpdGVkID8/IHRvb2xTcGVjaWZpY0RhdGEuY29tbWFuZExpbmUudG9vbEVkaXRlZCA/PyB0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLm9yaWdpbmFsKS50cmltU3RhcnQoKTtcblx0XHRjb25zdCBleHRyYWN0ZWRDZCA9IGV4dHJhY3RDZFByZWZpeChjb21tYW5kVG9EaXNwbGF5LCBzaGVsbCwgb3MpO1xuXHRcdGxldCBjb25maXJtYXRpb25UaXRsZTogc3RyaW5nO1xuXHRcdGlmIChleHRyYWN0ZWRDZCAmJiBjd2QpIHtcblx0XHRcdC8vIENvbnN0cnVjdCB0aGUgZnVsbCBkaXJlY3RvcnkgcGF0aCB1c2luZyB0aGUgY3dkJ3Mgc2NoZW1lL2F1dGhvcml0eVxuXHRcdFx0Y29uc3QgaXNBYnNvbHV0ZVBhdGggPSBvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3Ncblx0XHRcdFx0PyB3aW4zMi5pc0Fic29sdXRlKGV4dHJhY3RlZENkLmRpcmVjdG9yeSlcblx0XHRcdFx0OiBwb3NpeC5pc0Fic29sdXRlKGV4dHJhY3RlZENkLmRpcmVjdG9yeSk7XG5cdFx0XHRjb25zdCBkaXJlY3RvcnlVcmkgPSBpc0Fic29sdXRlUGF0aFxuXHRcdFx0XHQ/IFVSSS5mcm9tKHsgc2NoZW1lOiBjd2Quc2NoZW1lLCBhdXRob3JpdHk6IGN3ZC5hdXRob3JpdHksIHBhdGg6IGV4dHJhY3RlZENkLmRpcmVjdG9yeSB9KVxuXHRcdFx0XHQ6IFVSSS5qb2luUGF0aChjd2QsIGV4dHJhY3RlZENkLmRpcmVjdG9yeSk7XG5cdFx0XHRjb25zdCBkaXJlY3RvcnlMYWJlbCA9IHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChkaXJlY3RvcnlVcmkpO1xuXHRcdFx0Y29uc3QgY2RQcmVmaXggPSBjb21tYW5kVG9EaXNwbGF5LnN1YnN0cmluZygwLCBjb21tYW5kVG9EaXNwbGF5Lmxlbmd0aCAtIGV4dHJhY3RlZENkLmNvbW1hbmQubGVuZ3RoKTtcblxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YS5jb25maXJtYXRpb24gPSB7XG5cdFx0XHRcdGNvbW1hbmRMaW5lOiBleHRyYWN0ZWRDZC5jb21tYW5kLFxuXHRcdFx0XHRjd2RMYWJlbDogZGlyZWN0b3J5TGFiZWwsXG5cdFx0XHRcdGNkUHJlZml4LFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uZmlybWF0aW9uVGl0bGUgPSBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5pbkRpcmVjdG9yeScsIFwiUnVuIGB7MH1gIGNvbW1hbmQgd2l0aGluIGB7MX1gP1wiLCBzaGVsbFR5cGUsIGRpcmVjdG9yeUxhYmVsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dG9vbFNwZWNpZmljRGF0YS5jb25maXJtYXRpb24gPSB7XG5cdFx0XHRcdGNvbW1hbmRMaW5lOiBjb21tYW5kVG9EaXNwbGF5LFxuXHRcdFx0fTtcblx0XHRcdGNvbmZpcm1hdGlvblRpdGxlID0gbG9jYWxpemUoJ3J1bkluVGVybWluYWwnLCBcIlJ1biBgezB9YCBjb21tYW5kP1wiLCBzaGVsbFR5cGUpO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBwcmVzZW50YXRpb24gb3ZlcnJpZGVzIChlLmcuLCBQeXRob24gLWMgY29tbWFuZCBleHRyYWN0aW9uKVxuXHRcdC8vIFVzZSB0aGUgY29tbWFuZCBhZnRlciBjZCBwcmVmaXggZXh0cmFjdGlvbiBpZiBhdmFpbGFibGUsIHNpbmNlIHRoYXQncyB3aGF0J3MgZGlzcGxheWVkIGluIHRoZSBlZGl0b3Jcblx0XHRjb25zdCBjb21tYW5kRm9yUHJlc2VudGVyID0gZXh0cmFjdGVkQ2Q/LmNvbW1hbmQgPz8gY29tbWFuZFRvRGlzcGxheTtcblx0XHRsZXQgcHJlc2VudGVySW5wdXQgPSBjb21tYW5kRm9yUHJlc2VudGVyO1xuXHRcdGZvciAoY29uc3QgcHJlc2VudGVyIG9mIHRoaXMuX2NvbW1hbmRMaW5lUHJlc2VudGVycykge1xuXHRcdFx0Y29uc3QgcHJlc2VudGVyUmVzdWx0ID0gYXdhaXQgcHJlc2VudGVyLnByZXNlbnQoeyBjb21tYW5kTGluZTogeyBvcmlnaW5hbDogYXJncy5jb21tYW5kLCBmb3JEaXNwbGF5OiBwcmVzZW50ZXJJbnB1dCB9LCBzaGVsbCwgb3MgfSk7XG5cdFx0XHRpZiAocHJlc2VudGVyUmVzdWx0KSB7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGEucHJlc2VudGF0aW9uT3ZlcnJpZGVzID0ge1xuXHRcdFx0XHRcdGNvbW1hbmRMaW5lOiBwcmVzZW50ZXJSZXN1bHQuY29tbWFuZExpbmUsXG5cdFx0XHRcdFx0bGFuZ3VhZ2U6IHByZXNlbnRlclJlc3VsdC5sYW5ndWFnZSA/PyB1bmRlZmluZWQsXG5cdFx0XHRcdH07XG5cdFx0XHRcdGlmIChleHRyYWN0ZWRDZCAmJiB0b29sU3BlY2lmaWNEYXRhLmNvbmZpcm1hdGlvbj8uY3dkTGFiZWwpIHtcblx0XHRcdFx0XHRpZiAocHJlc2VudGVyUmVzdWx0Lmxhbmd1YWdlRGlzcGxheU5hbWUpIHtcblx0XHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlID0gbG9jYWxpemUoJ3J1bkluVGVybWluYWwucHJlc2VudGF0aW9uT3ZlcnJpZGUuaW5EaXJlY3RvcnknLCBcIlJ1biBgezB9YCBjb21tYW5kIGluIGB7MX1gIHdpdGhpbiBgezJ9YD9cIiwgcHJlc2VudGVyUmVzdWx0Lmxhbmd1YWdlRGlzcGxheU5hbWUsIHNoZWxsVHlwZSwgdG9vbFNwZWNpZmljRGF0YS5jb25maXJtYXRpb24uY3dkTGFiZWwpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZSA9IGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnByZXNlbnRhdGlvbk92ZXJyaWRlLmluRGlyZWN0b3J5LndpdGhvdXRMYW5ndWFnZScsIFwiUnVuIGNvbW1hbmQgaW4gYHswfWAgd2l0aGluIGB7MX1gP1wiLCBzaGVsbFR5cGUsIHRvb2xTcGVjaWZpY0RhdGEuY29uZmlybWF0aW9uLmN3ZExhYmVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKHByZXNlbnRlclJlc3VsdC5sYW5ndWFnZURpc3BsYXlOYW1lKSB7XG5cdFx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZSA9IGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnByZXNlbnRhdGlvbk92ZXJyaWRlJywgXCJSdW4gYHswfWAgY29tbWFuZCBpbiBgezF9YD9cIiwgcHJlc2VudGVyUmVzdWx0Lmxhbmd1YWdlRGlzcGxheU5hbWUsIHNoZWxsVHlwZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlID0gbG9jYWxpemUoJ3J1bkluVGVybWluYWwucHJlc2VudGF0aW9uT3ZlcnJpZGUud2l0aG91dExhbmd1YWdlJywgXCJSdW4gY29tbWFuZCBpbiBgezB9YD9cIiwgc2hlbGxUeXBlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFwcmVzZW50ZXJSZXN1bHQucHJvY2Vzc090aGVyUHJlc2VudGVycykge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHByZXNlbnRlcklucHV0ID0gcHJlc2VudGVyUmVzdWx0LmNvbW1hbmRMaW5lO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChyZXF1aXJlc1Vuc2FuZGJveENvbmZpcm1hdGlvbikge1xuXHRcdFx0Y29uZmlybWF0aW9uVGl0bGUgPSBibG9ja2VkRG9tYWlucz8ubGVuZ3RoXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3J1bkluVGVybWluYWwudW5zYW5kYm94ZWQuZG9tYWluJywgXCJSdW4gYHswfWAgY29tbWFuZCBvdXRzaWRlIHRoZSBbc2FuZGJveF0oezF9KSB0byBhY2Nlc3MgezJ9P1wiLCBzaGVsbFR5cGUsIFRFUk1JTkFMX1NBTkRCT1hfRE9DVU1FTlRBVElPTl9VUkwsIHRoaXMuX2Zvcm1hdEJsb2NrZWREb21haW5zRm9yVGl0bGUoYmxvY2tlZERvbWFpbnMpKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnVuc2FuZGJveGVkJywgXCJSdW4gYHswfWAgY29tbWFuZCBvdXRzaWRlIHRoZSBbc2FuZGJveF0oezF9KT9cIiwgc2hlbGxUeXBlLCBURVJNSU5BTF9TQU5EQk9YX0RPQ1VNRU5UQVRJT05fVVJMKTtcblx0XHR9IGVsc2UgaWYgKHJlcXVpcmVzQWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRjb25maXJtYXRpb25UaXRsZSA9IGxvY2FsaXplKCdydW5JblRlcm1pbmFsLmFsbG93TmV0d29yaycsIFwiQWxsb3cgezB9IGNvbW1hbmQgdG8gYWNjZXNzIHRoZSBuZXR3b3JrP1wiLCBzaGVsbFR5cGUpO1xuXHRcdH1cblxuXHRcdC8vIElmIGZvcmNlQ29uZmlybWF0aW9uUmVhc29uIGlzIHNldCwgYWx3YXlzIHNob3cgY29uZmlybWF0aW9uIHJlZ2FyZGxlc3Mgb2YgYXV0by1hcHByb3ZhbFxuXHRcdGNvbnN0IHNob3VsZFNob3dDb25maXJtYXRpb24gPSAoIWlzRmluYWxBdXRvQXBwcm92ZWQgJiYgKCFpc1Nlc3Npb25BdXRvQXBwcm92ZWQgfHwgcmVxdWlyZXNBbGxvd05ldHdvcmtDb25maXJtYXRpb24pKSB8fCBjb250ZXh0LmZvcmNlQ29uZmlybWF0aW9uUmVhc29uICE9PSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZXhwbGFuYXRpb24gPSBhcmdzLmV4cGxhbmF0aW9uIHx8IGxvY2FsaXplKCdydW5JblRlcm1pbmFsLmRlZmF1bHRFeHBsYW5hdGlvbicsIFwiTm8gZXhwbGFuYXRpb24gcHJvdmlkZWRcIik7XG5cdFx0Y29uc3QgZ29hbCA9IGFyZ3MuZ29hbCB8fCBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5kZWZhdWx0R29hbCcsIFwiTm8gZ29hbCBwcm92aWRlZFwiKTtcblx0XHRjb25zdCBjb25maXJtYXRpb25NZXNzYWdlID0gcmVxdWlyZXNVbnNhbmRib3hDb25maXJtYXRpb25cblx0XHRcdD8gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKFxuXHRcdFx0XHQncnVuSW5UZXJtaW5hbC51bnNhbmRib3hlZC5jb25maXJtYXRpb25NZXNzYWdlJyxcblx0XHRcdFx0XCJFeHBsYW5hdGlvbjogezB9XFxuXFxuR29hbDogezF9XFxuXFxuUmVhc29uIGZvciBsZWF2aW5nIHRoZSBzYW5kYm94OiB7Mn1cIixcblx0XHRcdFx0ZXhwbGFuYXRpb24sXG5cdFx0XHRcdGdvYWwsXG5cdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbiB8fCBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC51bnNhbmRib3hlZC5jb25maXJtYXRpb25NZXNzYWdlLmRlZmF1bHRSZWFzb24nLCBcIlRoZSBtb2RlbCBpbmRpY2F0ZWQgdGhhdCB0aGlzIGNvbW1hbmQgbmVlZHMgdW5zYW5kYm94ZWQgYWNjZXNzLlwiKVxuXHRcdFx0KSlcblx0XHRcdDogcmVxdWlyZXNBbGxvd05ldHdvcmtDb25maXJtYXRpb25cblx0XHRcdFx0PyBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoXG5cdFx0XHRcdFx0J3J1bkluVGVybWluYWwuYWxsb3dOZXR3b3JrLmNvbmZpcm1hdGlvbk1lc3NhZ2UnLFxuXHRcdFx0XHRcdFwiRXhwbGFuYXRpb246IHswfVxcblxcbkdvYWw6IHsxfVxcblxcblJlYXNvbiBmb3IgYWxsb3dpbmcgdW5yZXN0cmljdGVkIG5ldHdvcmsgYWNjZXNzIGluIHRoZSBzYW5kYm94OiB7Mn1cIixcblx0XHRcdFx0XHRleHBsYW5hdGlvbixcblx0XHRcdFx0XHRnb2FsLFxuXHRcdFx0XHRcdHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24gfHwgbG9jYWxpemUoJ3J1bkluVGVybWluYWwuYWxsb3dOZXR3b3JrLmNvbmZpcm1hdGlvbk1lc3NhZ2UuZGVmYXVsdFJlYXNvbicsIFwiVGhlIG1vZGVsIGluZGljYXRlZCB0aGF0IHRoaXMgc2FuZGJveGVkIGNvbW1hbmQgbmVlZHMgdW5yZXN0cmljdGVkIG5ldHdvcmsgYWNjZXNzLlwiKVxuXHRcdFx0XHQpKVxuXHRcdFx0XHQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5jb25maXJtYXRpb25NZXNzYWdlJywgXCJFeHBsYW5hdGlvbjogezB9XFxuXFxuR29hbDogezF9XCIsIGV4cGxhbmF0aW9uLCBnb2FsKSk7XG5cdFx0Y29uc3QgY29uZmlybWF0aW9uTWVzc2FnZXMgPSBzaG91bGRTaG93Q29uZmlybWF0aW9uID8ge1xuXHRcdFx0dGl0bGU6IGNvbmZpcm1hdGlvblRpdGxlLFxuXHRcdFx0bWVzc2FnZTogY29uZmlybWF0aW9uTWVzc2FnZSxcblx0XHRcdGRpc2NsYWltZXIsXG5cdFx0XHRhbGxvd0F1dG9Db25maXJtOiB1bmRlZmluZWQsXG5cdFx0XHR0ZXJtaW5hbEN1c3RvbUFjdGlvbnM6IGN1c3RvbUFjdGlvbnMsXG5cdFx0fSA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHJhd0Rpc3BsYXlDb21tYW5kID0gdG9vbFNwZWNpZmljRGF0YS5jb21tYW5kTGluZS5mb3JEaXNwbGF5ID8/IHRvb2xTcGVjaWZpY0RhdGEuY29tbWFuZExpbmUudG9vbEVkaXRlZCA/PyB0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLm9yaWdpbmFsO1xuXHRcdGNvbnN0IGRpc3BsYXlDb21tYW5kID0gcmF3RGlzcGxheUNvbW1hbmQubGVuZ3RoID4gODBcblx0XHRcdD8gcmF3RGlzcGxheUNvbW1hbmQuc3Vic3RyaW5nKDAsIDc3KSArICcuLi4nXG5cdFx0XHQ6IHJhd0Rpc3BsYXlDb21tYW5kO1xuXHRcdGNvbnN0IGludm9jYXRpb25NZXNzYWdlID0gdG9vbFNwZWNpZmljRGF0YS5jb21tYW5kTGluZS5pc1NhbmRib3hXcmFwcGVkXG5cdFx0XHQ/IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5pbnZvY2F0aW9uLnNhbmRib3gnLCBcIlJ1bm5pbmcgYHswfWAgaW4gc2FuZGJveFwiLCBlc2NhcGVNYXJrZG93blN5bnRheFRva2VucyhkaXNwbGF5Q29tbWFuZCkpKVxuXHRcdFx0OiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3J1bkluVGVybWluYWwuaW52b2NhdGlvbicsIFwiUnVubmluZyBgezB9YFwiLCBlc2NhcGVNYXJrZG93blN5bnRheFRva2VucyhkaXNwbGF5Q29tbWFuZCkpKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdGljb246IHRvb2xTcGVjaWZpY0RhdGEuY29tbWFuZExpbmUuaXNTYW5kYm94V3JhcHBlZCA/IENvZGljb24udGVybWluYWxTZWN1cmUgOiBDb2RpY29uLnRlcm1pbmFsLFxuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHNhbmRib3hQcmVyZXF1aXNpdGVDb25maXJtYXRpb24gPz8gY29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9mb3JtYXRCbG9ja2VkRG9tYWluc0ZvclRpdGxlKGJsb2NrZWREb21haW5zOiBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdFx0aWYgKGJsb2NrZWREb21haW5zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIGBcXGAke2Jsb2NrZWREb21haW5zWzBdfVxcYGA7XG5cdFx0fVxuXHRcdHJldHVybiBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC51bnNhbmRib3hlZC5kb21haW4uc3VtbWFyeScsIFwiYHswfWAgYW5kIHsxfSBtb3JlIGRvbWFpbnNcIiwgYmxvY2tlZERvbWFpbnNbMF0sIGJsb2NrZWREb21haW5zLmxlbmd0aCAtIDEpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QmxvY2tlZERvbWFpblJlYXNvbihibG9ja2VkRG9tYWluczogc3RyaW5nW10sIGRlbmllZERvbWFpbnM6IHN0cmluZ1tdID0gW10pOiBzdHJpbmcge1xuXHRcdGlmIChkZW5pZWREb21haW5zLmxlbmd0aCA9PT0gYmxvY2tlZERvbWFpbnMubGVuZ3RoICYmIGRlbmllZERvbWFpbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKGJsb2NrZWREb21haW5zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3J1bkluVGVybWluYWwudW5zYW5kYm94ZWQuZG9tYWluLnJlYXNvbi5kZW5pZWQuc2luZ2xlJywgXCJUaGlzIGNvbW1hbmQgYWNjZXNzZXMgezB9LCB3aGljaCBpcyBibG9ja2VkIGJ5IGNoYXQuYWdlbnQuZGVuaWVkTmV0d29ya0RvbWFpbnMuXCIsIGJsb2NrZWREb21haW5zWzBdKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC51bnNhbmRib3hlZC5kb21haW4ucmVhc29uLmRlbmllZC5tdWx0aScsIFwiVGhpcyBjb21tYW5kIGFjY2Vzc2VzIHswfSBhbmQgezF9IG1vcmUgZG9tYWlucyB0aGF0IGFyZSBibG9ja2VkIGJ5IGNoYXQuYWdlbnQuZGVuaWVkTmV0d29ya0RvbWFpbnMuXCIsIGJsb2NrZWREb21haW5zWzBdLCBibG9ja2VkRG9tYWlucy5sZW5ndGggLSAxKTtcblx0XHR9XG5cdFx0aWYgKGRlbmllZERvbWFpbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKGJsb2NrZWREb21haW5zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3J1bkluVGVybWluYWwudW5zYW5kYm94ZWQuZG9tYWluLnJlYXNvbi5taXhlZC5zaW5nbGUnLCBcIlRoaXMgY29tbWFuZCBhY2Nlc3NlcyB7MH0sIHdoaWNoIGlzIGJsb2NrZWQgYnkgY2hhdC5hZ2VudC5kZW5pZWROZXR3b3JrRG9tYWlucyBvciBub3QgYWRkZWQgdG8gY2hhdC5hZ2VudC5hbGxvd2VkTmV0d29ya0RvbWFpbnMuXCIsIGJsb2NrZWREb21haW5zWzBdKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC51bnNhbmRib3hlZC5kb21haW4ucmVhc29uLm1peGVkLm11bHRpJywgXCJUaGlzIGNvbW1hbmQgYWNjZXNzZXMgezB9IGFuZCB7MX0gbW9yZSBkb21haW5zIHRoYXQgYXJlIGJsb2NrZWQgYnkgY2hhdC5hZ2VudC5kZW5pZWROZXR3b3JrRG9tYWlucyBvciBub3QgYWRkZWQgdG8gY2hhdC5hZ2VudC5hbGxvd2VkTmV0d29ya0RvbWFpbnMuXCIsIGJsb2NrZWREb21haW5zWzBdLCBibG9ja2VkRG9tYWlucy5sZW5ndGggLSAxKTtcblx0XHR9XG5cdFx0aWYgKGJsb2NrZWREb21haW5zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnVuc2FuZGJveGVkLmRvbWFpbi5yZWFzb24uc2luZ2xlJywgXCJUaGlzIGNvbW1hbmQgYWNjZXNzZXMgezB9LCB3aGljaCBpcyBub3QgcGVybWl0dGVkIGJ5IHRoZSBjdXJyZW50IGNoYXQuYWdlbnQuc2FuZGJveCBjb25maWd1cmF0aW9uLlwiLCBibG9ja2VkRG9tYWluc1swXSk7XG5cdFx0fVxuXHRcdHJldHVybiBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC51bnNhbmRib3hlZC5kb21haW4ucmVhc29uLm11bHRpJywgXCJUaGlzIGNvbW1hbmQgYWNjZXNzZXMgezB9IGFuZCB7MX0gbW9yZSBkb21haW5zIHRoYXQgYXJlIG5vdCBwZXJtaXR0ZWQgYnkgdGhlIGN1cnJlbnQgY2hhdC5hZ2VudC5zYW5kYm94IGNvbmZpZ3VyYXRpb24uXCIsIGJsb2NrZWREb21haW5zWzBdLCBibG9ja2VkRG9tYWlucy5sZW5ndGggLSAxKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jld3JpdGVDb21tYW5kTGluZShjb21tYW5kTGluZTogc3RyaW5nLCBvcHRpb25zOiB7XG5cdFx0Y3dkOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0c2hlbGw6IHN0cmluZztcblx0XHRvczogT3BlcmF0aW5nU3lzdGVtO1xuXHRcdGlzQmFja2dyb3VuZDogYm9vbGVhbjtcblx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IGJvb2xlYW47XG5cdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uPzogc3RyaW5nO1xuXHRcdHJlcXVlc3RBbGxvd05ldHdvcms6IGJvb2xlYW47XG5cdFx0cmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbj86IHN0cmluZztcblx0XHRzYW5kYm94UHJlY2hlY2tJbnB1dHM/OiBJVGVybWluYWxTYW5kYm94UHJlY2hlY2tJbnB1dHM7XG5cdH0pOiBQcm9taXNlPHtcblx0XHRyZXdyaXR0ZW5Db21tYW5kOiBzdHJpbmc7XG5cdFx0Zm9yRGlzcGxheUNvbW1hbmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpc1NhbmRib3hXcmFwcGVkOiBib29sZWFuO1xuXHRcdHJlcXVpcmVzVW5zYW5kYm94Q29uZmlybWF0aW9uOiBib29sZWFuO1xuXHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdHJlcXVpcmVzQWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uOiBib29sZWFuO1xuXHRcdHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRibG9ja2VkRG9tYWluczogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdH0+IHtcblx0XHRsZXQgcmV3cml0dGVuQ29tbWFuZCA9IGNvbW1hbmRMaW5lO1xuXHRcdGxldCBmb3JEaXNwbGF5Q29tbWFuZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBpc1NhbmRib3hXcmFwcGVkID0gZmFsc2U7XG5cdFx0bGV0IHJlcXVpcmVzVW5zYW5kYm94Q29uZmlybWF0aW9uID0gb3B0aW9ucy5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb247XG5cdFx0bGV0IHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbiA9IG9wdGlvbnMucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uID8gb3B0aW9ucy5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24gOiB1bmRlZmluZWQ7XG5cdFx0bGV0IHJlcXVpcmVzQWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uID0gZmFsc2U7XG5cdFx0bGV0IHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24gPSBvcHRpb25zLnJlcXVlc3RBbGxvd05ldHdvcmsgPyBvcHRpb25zLnJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24gOiB1bmRlZmluZWQ7XG5cdFx0bGV0IGJsb2NrZWREb21haW5zOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblxuXHRcdGZvciAoY29uc3QgcmV3cml0ZXIgb2YgdGhpcy5fY29tbWFuZExpbmVSZXdyaXRlcnMpIHtcblx0XHRcdGNvbnN0IHJld3JpdGVSZXN1bHQgPSBhd2FpdCByZXdyaXRlci5yZXdyaXRlKHtcblx0XHRcdFx0Y29tbWFuZExpbmU6IHJld3JpdHRlbkNvbW1hbmQsXG5cdFx0XHRcdGN3ZDogb3B0aW9ucy5jd2QsXG5cdFx0XHRcdHNoZWxsOiBvcHRpb25zLnNoZWxsLFxuXHRcdFx0XHRvczogb3B0aW9ucy5vcyxcblx0XHRcdFx0aXNCYWNrZ3JvdW5kOiBvcHRpb25zLmlzQmFja2dyb3VuZCxcblx0XHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uOiByZXF1aXJlc1Vuc2FuZGJveENvbmZpcm1hdGlvbixcblx0XHRcdFx0cmVxdWVzdEFsbG93TmV0d29yazogb3B0aW9ucy5yZXF1ZXN0QWxsb3dOZXR3b3JrLFxuXHRcdFx0XHRzYW5kYm94UHJlY2hlY2tJbnB1dHM6IG9wdGlvbnMuc2FuZGJveFByZWNoZWNrSW5wdXRzLFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAocmV3cml0ZVJlc3VsdCkge1xuXHRcdFx0XHRyZXdyaXR0ZW5Db21tYW5kID0gcmV3cml0ZVJlc3VsdC5yZXdyaXR0ZW47XG5cdFx0XHRcdGZvckRpc3BsYXlDb21tYW5kID0gZm9yRGlzcGxheUNvbW1hbmQgPz8gcmV3cml0ZVJlc3VsdC5mb3JEaXNwbGF5O1xuXHRcdFx0XHRpZiAocmV3cml0ZVJlc3VsdC5pc1NhbmRib3hXcmFwcGVkKSB7XG5cdFx0XHRcdFx0aXNTYW5kYm94V3JhcHBlZCA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAocmV3cml0ZVJlc3VsdC5pc1NhbmRib3hXcmFwcGVkID09PSBmYWxzZSkge1xuXHRcdFx0XHRcdGlzU2FuZGJveFdyYXBwZWQgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmV3cml0ZVJlc3VsdC5yZXF1aXJlc1Vuc2FuZGJveENvbmZpcm1hdGlvbikge1xuXHRcdFx0XHRcdHJlcXVpcmVzVW5zYW5kYm94Q29uZmlybWF0aW9uID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmV3cml0ZVJlc3VsdC5yZXF1aXJlc0FsbG93TmV0d29ya0NvbmZpcm1hdGlvbikge1xuXHRcdFx0XHRcdHJlcXVpcmVzQWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmV3cml0ZVJlc3VsdC5ibG9ja2VkRG9tYWlucz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0YmxvY2tlZERvbWFpbnMgPSByZXdyaXRlUmVzdWx0LmJsb2NrZWREb21haW5zO1xuXHRcdFx0XHRcdGNvbnN0IGJsb2NrZWREb21haW5SZWFzb24gPSB0aGlzLl9nZXRCbG9ja2VkRG9tYWluUmVhc29uKHJld3JpdGVSZXN1bHQuYmxvY2tlZERvbWFpbnMsIHJld3JpdGVSZXN1bHQuZGVuaWVkRG9tYWlucyk7XG5cdFx0XHRcdFx0aWYgKHJld3JpdGVSZXN1bHQucmVxdWlyZXNBbGxvd05ldHdvcmtDb25maXJtYXRpb24pIHtcblx0XHRcdFx0XHRcdHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24gPSBibG9ja2VkRG9tYWluUmVhc29uO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24gPSBibG9ja2VkRG9tYWluUmVhc29uO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFJ1bkluVGVybWluYWxUb29sOiBDb21tYW5kIHJld3JpdHRlbiBieSAke3Jld3JpdGVyLmNvbnN0cnVjdG9yLm5hbWV9OiAke3Jld3JpdGVSZXN1bHQucmVhc29uaW5nfWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRyZXdyaXR0ZW5Db21tYW5kLFxuXHRcdFx0Zm9yRGlzcGxheUNvbW1hbmQsXG5cdFx0XHRpc1NhbmRib3hXcmFwcGVkLFxuXHRcdFx0cmVxdWlyZXNVbnNhbmRib3hDb25maXJtYXRpb24sXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24sXG5cdFx0XHRyZXF1aXJlc0FsbG93TmV0d29ya0NvbmZpcm1hdGlvbixcblx0XHRcdHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb246IHJlcXVpcmVzQWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uID8gcmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbiA6IHVuZGVmaW5lZCxcblx0XHRcdGJsb2NrZWREb21haW5zLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTYW5kYm94UHJlY2hlY2tJbnB1dHMoY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBjaGF0UmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJVGVybWluYWxTYW5kYm94UHJlY2hlY2tJbnB1dHMgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBnZXRTYW5kYm94UHJlY2hlY2tJbnB1dHNGb3JUb29sSW52b2NhdGlvbihjaGF0U2Vzc2lvblJlc291cmNlLCBjaGF0UmVxdWVzdElkLCB0aGlzLl9jaGF0V2lkZ2V0U2VydmljZSwgdGhpcy5fY2hhdFNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29uZmlybUF1dG9tYXRpY1NhbmRib3hSZXRyeShyZXRyeUtpbmQ6IEF1dG9tYXRpY1NhbmRib3hSZXRyeUtpbmQsIHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBjb21tYW5kOiBzdHJpbmcsIHNoZWxsOiBzdHJpbmcsIGJsb2NrZWREb21haW5zOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCwgcmlza0Fzc2Vzc21lbnQ6IHsgdG9vbElkOiBzdHJpbmc7IHBhcmFtZXRlcnM6IHVua25vd24gfSB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gc2Vzc2lvblJlc291cmNlICYmIHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIShjaGF0TW9kZWwgaW5zdGFuY2VvZiBDaGF0TW9kZWwpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIEluIEF1dG9waWxvdC9CeXBhc3MgQXBwcm92YWxzIG1vZGVzLCBmb2xsb3cgdGhlIHBpY2tlclxuXHRcdGlmIChzZXNzaW9uUmVzb3VyY2UgJiYgaXNTZXNzaW9uQXV0b0FwcHJvdmVMZXZlbChzZXNzaW9uUmVzb3VyY2UsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9jaGF0V2lkZ2V0U2VydmljZSwgdGhpcy5fY2hhdFNlcnZpY2UpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgcmVxdWVzdCA9IGNoYXRNb2RlbC5nZXRSZXF1ZXN0cygpLmF0KC0xKTtcblx0XHRpZiAoIXJlcXVlc3QpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRsZXQgc2hlbGxUeXBlID0gYmFzZW5hbWUoc2hlbGwsICcuZXhlJyk7XG5cdFx0aWYgKHNoZWxsVHlwZSA9PT0gJ3Bvd2Vyc2hlbGwnKSB7XG5cdFx0XHRzaGVsbFR5cGUgPSAncHdzaCc7XG5cdFx0fVxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IHtcblx0XHRcdGxldCByZXNvbHZlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZU9uY2UgPSAodmFsdWU6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0aWYgKHJlc29sdmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc29sdmVkID0gdHJ1ZTtcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXNvbHZlKHZhbHVlKTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGNvbmZpcm1hdGlvbk1lc3NhZ2UgPSByZXRyeUtpbmQgPT09ICdhbGxvd05ldHdvcmsnXG5cdFx0XHRcdD8gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKFxuXHRcdFx0XHRcdCdydW5JblRlcm1pbmFsLmFsbG93TmV0d29yay5hdXRvUmV0cnkuY29uZmlybWF0aW9uTWVzc2FnZScsXG5cdFx0XHRcdFx0XCJgezB9YFwiLFxuXHRcdFx0XHRcdGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKGJ1aWxkQ29tbWFuZERpc3BsYXlUZXh0KGNvbW1hbmQpKVxuXHRcdFx0XHQpKVxuXHRcdFx0XHQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZShcblx0XHRcdFx0XHQncnVuSW5UZXJtaW5hbC51bnNhbmRib3hlZC5hdXRvUmV0cnkuY29uZmlybWF0aW9uTWVzc2FnZScsXG5cdFx0XHRcdFx0XCJgezB9YFwiLFxuXHRcdFx0XHRcdGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKGJ1aWxkQ29tbWFuZERpc3BsYXlUZXh0KGNvbW1hbmQpKVxuXHRcdFx0XHQpKTtcblx0XHRcdGNvbnN0IHBhcnQgPSBuZXcgQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdFBhcnQoXG5cdFx0XHRcdHRoaXMuX2dldEF1dG9tYXRpY1NhbmRib3hSZXRyeVRpdGxlKHJldHJ5S2luZCwgc2hlbGxUeXBlLCBibG9ja2VkRG9tYWlucyksXG5cdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHRsb2NhbGl6ZSgnYWxsb3cnLCAnQWxsb3cnKSxcblx0XHRcdFx0bG9jYWxpemUoJ3NraXAnLCAnU2tpcCcpLFxuXHRcdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0cmVzb2x2ZU9uY2UodHJ1ZSk7XG5cdFx0XHRcdFx0cGFydC5oaWRlKCk7XG5cdFx0XHRcdFx0cmV0dXJuIEVsaWNpdGF0aW9uU3RhdGUuQWNjZXB0ZWQ7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRyZXNvbHZlT25jZShmYWxzZSk7XG5cdFx0XHRcdFx0cGFydC5oaWRlKCk7XG5cdFx0XHRcdFx0cmV0dXJuIEVsaWNpdGF0aW9uU3RhdGUuUmVqZWN0ZWQ7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHQoKSA9PiByZXNvbHZlT25jZShmYWxzZSksXG5cdFx0XHRcdHJpc2tBc3Nlc3NtZW50LFxuXHRcdFx0KTtcblxuXHRcdFx0Y2hhdE1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgcGFydCk7XG5cdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gcmVzb2x2ZU9uY2UoZmFsc2UpKSk7XG5cdFx0XHRzdG9yZS5hZGQoeyBkaXNwb3NlOiAoKSA9PiBwYXJ0LmhpZGUoKSB9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEF1dG9tYXRpY1NhbmRib3hSZXRyeVRpdGxlKHJldHJ5S2luZDogQXV0b21hdGljU2FuZGJveFJldHJ5S2luZCwgc2hlbGxUeXBlOiBzdHJpbmcsIGJsb2NrZWREb21haW5zOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IE1hcmtkb3duU3RyaW5nIHtcblx0XHRpZiAocmV0cnlLaW5kID09PSAnYWxsb3dOZXR3b3JrJykge1xuXHRcdFx0cmV0dXJuIGJsb2NrZWREb21haW5zPy5sZW5ndGhcblx0XHRcdFx0PyBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3J1bkluVGVybWluYWwuYWxsb3dOZXR3b3JrLmF1dG9SZXRyeS5kb21haW4nLCBcIlJldHJ5IGB7MH1gIGNvbW1hbmQgaW4gdGhlIHNhbmRib3ggYnkgYWxsb3dpbmcgbmV0d29yayBhY2Nlc3MgdG8gezF9P1wiLCBzaGVsbFR5cGUsIHRoaXMuX2Zvcm1hdEJsb2NrZWREb21haW5zRm9yVGl0bGUoYmxvY2tlZERvbWFpbnMpKSlcblx0XHRcdFx0OiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3J1bkluVGVybWluYWwuYWxsb3dOZXR3b3JrLmF1dG9SZXRyeScsIFwiUmV0cnkgYHswfWAgY29tbWFuZCBpbiB0aGUgc2FuZGJveCBieSBhbGxvd2luZyBuZXR3b3JrIGFjY2Vzcz9cIiwgc2hlbGxUeXBlKSk7XG5cdFx0fVxuXHRcdHJldHVybiBibG9ja2VkRG9tYWlucz8ubGVuZ3RoXG5cdFx0XHQ/IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC51bnNhbmRib3hlZC5hdXRvUmV0cnkuZG9tYWluJywgXCJSdW4gYHswfWAgY29tbWFuZCBvdXRzaWRlIHRoZSBzYW5kYm94IHRvIGFjY2VzcyB7MX0/XCIsIHNoZWxsVHlwZSwgdGhpcy5fZm9ybWF0QmxvY2tlZERvbWFpbnNGb3JUaXRsZShibG9ja2VkRG9tYWlucykpKVxuXHRcdFx0OiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3J1bkluVGVybWluYWwudW5zYW5kYm94ZWQuYXV0b1JldHJ5JywgXCJSdW4gYHswfWAgY29tbWFuZCBvdXRzaWRlIHRoZSBzYW5kYm94P1wiLCBzaGVsbFR5cGUpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdXJmYWNlIGEgY29uZmlybWF0aW9uIGRpYWxvZyB3aGVuIHRoZSB0ZXJtaW5hbCBpcyBkZXRlY3RlZCB0byBiZSB3YWl0aW5nXG5cdCAqIGZvciBzZW5zaXRpdmUgaW5wdXQgKHBhc3N3b3JkLCBwYXNzcGhyYXNlLCBPVFAsIFx1MjAyNikuIFNlbnNpdGl2ZSBwcm9tcHRzIG11c3Rcblx0ICogbmV2ZXIgYmUgcm91dGVkIHRocm91Z2ggdGhlIG1vZGVsIFx1MjAxNCB0aGUgdXNlciB0eXBlcyB0aGUgc2VjcmV0IGRpcmVjdGx5XG5cdCAqIGludG8gdGhlIHRlcm1pbmFsLiBUaGUgXCJGb2N1cyB0ZXJtaW5hbFwiIGFjdGlvbiByZXZlYWxzIGFuZCBmb2N1c2VzIHRoZVxuXHQgKiB0ZXJtaW5hbDsgdGhlIFwiQ2FuY2VsXCIgYWN0aW9uIGNhbmNlbHMgdGhlIHJ1bm5pbmcgY29tbWFuZC5cblx0ICpcblx0ICogUmV0dXJucyBhIGRpc3Bvc2FibGUgdGhhdCBoaWRlcyBhbnkgcGVuZGluZyBlbGljaXRhdGlvbi4gVGhlIGhhbmRsZXJcblx0ICogaXRzZWxmIGRlZHVwZXMgY29uY3VycmVudCBlbGljaXRhdGlvbnMgc28gcmVwZWF0ZWQgcG9sbGluZyBjeWNsZXMgZG9uJ3Rcblx0ICogc3BhbSB0aGUgY2hhdCBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVnaXN0ZXJTZW5zaXRpdmVJbnB1dEVsaWNpdGF0aW9uKFxuXHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHR0ZXJtaW5hbEluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSxcblx0XHRvdXRwdXRNb25pdG9yOiB7IG9uRGlkRGV0ZWN0U2Vuc2l0aXZlSW5wdXROZWVkZWQ6IEV2ZW50PHZvaWQ+IH0sXG5cdFx0Y2FuY2VsRXhlY3V0aW9uOiAoKSA9PiB2b2lkLFxuXHRcdG9uQXV0b0NhbmNlbGxlZD86ICgpID0+IHZvaWQsXG5cdCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRsZXQgcGVuZGluZzogeyBoaWRlOiAoKSA9PiB2b2lkIH0gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGF1dG9DYW5jZWxsZWQgPSBmYWxzZTtcblxuXHRcdHN0b3JlLmFkZChvdXRwdXRNb25pdG9yLm9uRGlkRGV0ZWN0U2Vuc2l0aXZlSW5wdXROZWVkZWQoKCkgPT4ge1xuXHRcdFx0aWYgKHBlbmRpbmcgfHwgYXV0b0NhbmNlbGxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpc0F1dG9BcHByb3ZlZCA9IGNoYXRTZXNzaW9uUmVzb3VyY2UgJiYgaXNTZXNzaW9uQXV0b0FwcHJvdmVMZXZlbChjaGF0U2Vzc2lvblJlc291cmNlLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UsIHRoaXMuX2NoYXRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNoYXRNb2RlbCA9IGNoYXRTZXNzaW9uUmVzb3VyY2UgJiYgdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChpc0F1dG9BcHByb3ZlZCkge1xuXHRcdFx0XHQvLyBBdXRvcGlsb3QgLyBhdXRvLWFwcHJvdmU6IG5vIGh1bWFuIGlzIGluIHRoZSBsb29wIHRvIHR5cGUgdGhlXG5cdFx0XHRcdC8vIHNlY3JldCwgYW5kIHRoZSB0ZXJtaW5hbCBjYW4ndCByZWxpYWJseSBiZSBmb2N1c2VkIGFmdGVyIHRoZVxuXHRcdFx0XHQvLyB0b29sIHJldHVybnMuIENhbmNlbCB0aGUgY29tbWFuZCBhbmQgbGV0IHRoZSBjYWxsZXIgZW1pdCBhXG5cdFx0XHRcdC8vIHN0ZWVyaW5nIG5vdGUgdGhhdCB0ZWxscyB0aGUgYWdlbnQgdGhlIHVzZXIgaXMgdW5hdmFpbGFibGUuXG5cdFx0XHRcdC8vIFdlIGFsc28gc3VyZmFjZSBhIHNtYWxsIGRpc21pc3Mtb25seSBjaGF0IHBhcnQgc28gdGhlIHVzZXJcblx0XHRcdFx0Ly8gY2FuIHNlZSB3aGF0IGhhcHBlbmVkIGV2ZW4gaWYgdGhlIGFnZW50IGRvZXNuJ3QgZm9sbG93IHVwXG5cdFx0XHRcdC8vIHdpdGggYSBtZXNzYWdlIG9mIGl0cyBvd24uXG5cdFx0XHRcdGF1dG9DYW5jZWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRpZiAoY2hhdE1vZGVsIGluc3RhbmNlb2YgQ2hhdE1vZGVsKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVxdWVzdCA9IGNoYXRNb2RlbC5nZXRSZXF1ZXN0cygpLmF0KC0xKTtcblx0XHRcdFx0XHRpZiAocmVxdWVzdCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgaW5mb1BhcnQgPSBuZXcgQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdFBhcnQoXG5cdFx0XHRcdFx0XHRcdG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5zZW5zaXRpdmVJbnB1dC5hdXRvQ2FuY2VsVGl0bGUnLCBcIlRlcm1pbmFsIGNvbW1hbmQgY2FuY2VsbGVkIFx1MjAxNCBzZW5zaXRpdmUgaW5wdXQgcmVxdWlyZWRcIikpLFxuXHRcdFx0XHRcdFx0XHRuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3J1bkluVGVybWluYWwuc2Vuc2l0aXZlSW5wdXQuYXV0b0NhbmNlbE1lc3NhZ2UnLCBcIlRoZSB0ZXJtaW5hbCBjb21tYW5kIHdhcyBwcm9tcHRpbmcgZm9yIGEgcGFzc3dvcmQgb3Igb3RoZXIgc2VjcmV0LiBBdXRvLWFwcHJvdmUgLyBhdXRvcGlsb3QgbW9kZSBjYW5ub3Qgc2FmZWx5IHN1cHBseSBzZWNyZXRzLCBzbyB0aGUgY29tbWFuZCB3YXMgY2FuY2VsbGVkLiBSdW4gdGhlIGNvbW1hbmQgaW50ZXJhY3RpdmVseSBpZiB5b3Ugd2FudCB0byBwcm92aWRlIHRoZSBzZWNyZXQuXCIpKSxcblx0XHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnNlbnNpdGl2ZUlucHV0LmRpc21pc3MnLCBcIkRpc21pc3NcIiksXG5cdFx0XHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdFx0XHRhc3luYyAoKSA9PiB7IGluZm9QYXJ0LmhpZGUoKTsgcmV0dXJuIEVsaWNpdGF0aW9uU3RhdGUuQWNjZXB0ZWQ7IH0sXG5cdFx0XHRcdFx0XHRcdGFzeW5jICgpID0+IHsgaW5mb1BhcnQuaGlkZSgpOyByZXR1cm4gRWxpY2l0YXRpb25TdGF0ZS5SZWplY3RlZDsgfSxcblx0XHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdGNoYXRNb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIGluZm9QYXJ0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0b25BdXRvQ2FuY2VsbGVkPy4oKTtcblx0XHRcdFx0Y2FuY2VsRXhlY3V0aW9uKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghKGNoYXRNb2RlbCBpbnN0YW5jZW9mIENoYXRNb2RlbCkpIHtcblx0XHRcdFx0Ly8gTm8gY2hhdCBzdXJmYWNlIHRvIGF0dGFjaCB0byBcdTIwMTQgZmFsbCBiYWNrIHRvIGZvY3VzaW5nIHRoZVxuXHRcdFx0XHQvLyB0ZXJtaW5hbCBkaXJlY3RseSBzbyB0aGUgdXNlciBpcyBhdCBsZWFzdCBub3QgbGVmdCBibG9ja2VkLlxuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UodGVybWluYWxJbnN0YW5jZSk7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5yZXZlYWxUZXJtaW5hbCh0ZXJtaW5hbEluc3RhbmNlLCB0cnVlKS5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdFx0XHR0ZXJtaW5hbEluc3RhbmNlLmZvY3VzKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBjaGF0TW9kZWwuZ2V0UmVxdWVzdHMoKS5hdCgtMSk7XG5cdFx0XHRpZiAoIXJlcXVlc3QpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwYXJ0ID0gbmV3IENoYXRFbGljaXRhdGlvblJlcXVlc3RQYXJ0KFxuXHRcdFx0XHRuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3J1bkluVGVybWluYWwuc2Vuc2l0aXZlSW5wdXQudGl0bGUnLCBcIlRlcm1pbmFsIGlzIHdhaXRpbmcgZm9yIHNlbnNpdGl2ZSBpbnB1dFwiKSksXG5cdFx0XHRcdG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5zZW5zaXRpdmVJbnB1dC5tZXNzYWdlJywgXCJUaGUgdGVybWluYWwgY29tbWFuZCBhcHBlYXJzIHRvIGJlIHByb21wdGluZyBmb3IgYSBwYXNzd29yZCBvciBvdGhlciBzZW5zaXRpdmUgdmFsdWUuIEZvY3VzIHRoZSB0ZXJtaW5hbCB0byB0eXBlIGl0IGRpcmVjdGx5IFx1MjAxNCBzZWNyZXRzIG11c3Qgbm90IGJlIHNlbnQgdGhyb3VnaCBjaGF0LlwiKSksXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHRsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5zZW5zaXRpdmVJbnB1dC5mb2N1cycsIFwiRm9jdXMgVGVybWluYWxcIiksXG5cdFx0XHRcdGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnNlbnNpdGl2ZUlucHV0LmNhbmNlbCcsIFwiQ2FuY2VsIENvbW1hbmRcIiksXG5cdFx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRwZW5kaW5nID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHBhcnQuaGlkZSgpO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UodGVybWluYWxJbnN0YW5jZSk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbFNlcnZpY2UucmV2ZWFsVGVybWluYWwodGVybWluYWxJbnN0YW5jZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHR0ZXJtaW5hbEluc3RhbmNlLmZvY3VzKCk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFJ1bkluVGVybWluYWxUb29sOiBmYWlsZWQgdG8gcmV2ZWFsIHRlcm1pbmFsIGZvciBzZW5zaXRpdmUgaW5wdXRgLCBlcnIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gRWxpY2l0YXRpb25TdGF0ZS5BY2NlcHRlZDtcblx0XHRcdFx0fSxcblx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHBlbmRpbmcgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0cGFydC5oaWRlKCk7XG5cdFx0XHRcdFx0Y2FuY2VsRXhlY3V0aW9uKCk7XG5cdFx0XHRcdFx0cmV0dXJuIEVsaWNpdGF0aW9uU3RhdGUuUmVqZWN0ZWQ7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHQoKSA9PiB7IHBlbmRpbmcgPSB1bmRlZmluZWQ7IH0sXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCk7XG5cblx0XHRcdHBlbmRpbmcgPSBwYXJ0O1xuXHRcdFx0Y2hhdE1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgcGFydCk7XG5cdFx0XHQvLyBJbnRlbnRpb25hbGx5IGRvIE5PVCByZWdpc3RlciBhIGRpc3Bvc2FibGUgdGhhdCBoaWRlcyB0aGUgcGFydCBvbiBzdG9yZVxuXHRcdFx0Ly8gZGlzcG9zZTogdGhlIGVsaWNpdGF0aW9uIG11c3QgcGVyc2lzdCBwYXN0IHRoZSB0b29sIGNhbGwgcmV0dXJuaW5nIHNvIHRoZVxuXHRcdFx0Ly8gdXNlciBjYW4gc3RpbGwgZm9jdXMgdGhlIHRlcm1pbmFsIChhbmQgdHlwZSB0aGVpciBzZWNyZXQpIGFmdGVyIHRoZVxuXHRcdFx0Ly8gYWdlbnQgaGFzIHN1cnJlbmRlcmVkIGl0cyB0dXJuLiBUaGUgcGFydCBoaWRlcyBpdHNlbGYgb24gYWNjZXB0L3JlamVjdC5cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gc3RvcmU7XG5cdH1cblxuXHRwcml2YXRlIF9hY2NlcHRBdXRvbWF0aWNTYW5kYm94UmV0cnlUb29sSW52b2NhdGlvblVwZGF0ZShyZXRyeUtpbmQ6IEF1dG9tYXRpY1NhbmRib3hSZXRyeUtpbmQsIHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCB0b29sQ2FsbElkOiBzdHJpbmcsIHRvb2xTcGVjaWZpY0RhdGE6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEsIGlzQ29tcGxldGU6IGJvb2xlYW4sIHRvb2xSZXN1bHRNZXNzYWdlPzogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gc2Vzc2lvblJlc291cmNlICYmIHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIShjaGF0TW9kZWwgaW5zdGFuY2VvZiBDaGF0TW9kZWwpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IGNoYXRNb2RlbC5nZXRSZXF1ZXN0cygpLmF0KC0xKTtcblx0XHRpZiAoIXJlcXVlc3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwbGF5Q29tbWFuZCA9IGJ1aWxkQ29tbWFuZERpc3BsYXlUZXh0KHRvb2xTcGVjaWZpY0RhdGEuY29tbWFuZExpbmUuZm9yRGlzcGxheSA/PyB0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLnRvb2xFZGl0ZWQgPz8gdG9vbFNwZWNpZmljRGF0YS5jb21tYW5kTGluZS5vcmlnaW5hbCk7XG5cdFx0Y29uc3QgcHJvZ3Jlc3M6IElDaGF0RXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZSA9IHtcblx0XHRcdGtpbmQ6ICdleHRlcm5hbFRvb2xJbnZvY2F0aW9uVXBkYXRlJyxcblx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHR0b29sTmFtZTogbG9jYWxpemUoJ3J1bkluVGVybWluYWxUb29sLmRpc3BsYXlOYW1lJywgJ1J1biBpbiBUZXJtaW5hbCcpLFxuXHRcdFx0aXNDb21wbGV0ZSxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiByZXRyeUtpbmQgPT09ICdhbGxvd05ldHdvcmsnXG5cdFx0XHRcdD8gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdydW5JblRlcm1pbmFsLmFsbG93TmV0d29yay5hdXRvUmV0cnkuaW52b2NhdGlvbicsIFwiUnVubmluZyBgezB9YCBpbiB0aGUgc2FuZGJveCB3aXRoIHVucmVzdHJpY3RlZCBuZXR3b3JrIGFjY2Vzc1wiLCBlc2NhcGVNYXJrZG93blN5bnRheFRva2VucyhkaXNwbGF5Q29tbWFuZCkpKVxuXHRcdFx0XHQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC51bnNhbmRib3hlZC5hdXRvUmV0cnkuaW52b2NhdGlvbicsIFwiUnVubmluZyBgezB9YCBvdXRzaWRlIHRoZSBzYW5kYm94XCIsIGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKGRpc3BsYXlDb21tYW5kKSkpLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogdG9vbFJlc3VsdE1lc3NhZ2UsXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhLFxuXHRcdH07XG5cdFx0Y2hhdE1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgcHJvZ3Jlc3MpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcnVuQXV0b21hdGljU2FuZGJveFJldHJ5KG9wdGlvbnM6IHtcblx0XHRyZXRyeUtpbmQ6IEF1dG9tYXRpY1NhbmRib3hSZXRyeUtpbmQ7XG5cdFx0aW52b2NhdGlvbjogSVRvb2xJbnZvY2F0aW9uO1xuXHRcdGNvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrO1xuXHRcdHByb2dyZXNzOiBUb29sUHJvZ3Jlc3M7XG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuO1xuXHRcdGFyZ3M6IElSdW5JblRlcm1pbmFsSW5wdXRQYXJhbXM7XG5cdFx0dG9vbFNwZWNpZmljRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YTtcblx0XHRjb21tYW5kOiBzdHJpbmc7XG5cdFx0YWxsb3dVbnNhbmRib3hlZENvbW1hbmRzOiBib29sZWFuO1xuXHRcdGlzQmFja2dyb3VuZDogYm9vbGVhbjtcblx0XHRyZXRyeVJlYXNvbjogc3RyaW5nO1xuXHR9KTogUHJvbWlzZTxJVG9vbFJlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlcXVlc3RBbGxvd05ldHdvcmsgPSBvcHRpb25zLnJldHJ5S2luZCA9PT0gJ2FsbG93TmV0d29yayc7XG5cdFx0Y29uc3QgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uID0gb3B0aW9ucy5yZXRyeUtpbmQgPT09ICd1bnNhbmRib3hlZCcgJiYgb3B0aW9ucy5hbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHM7XG5cdFx0Y29uc3QgW29zLCBzaGVsbF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR0aGlzLl9vc0JhY2tlbmQsXG5cdFx0XHR0aGlzLl9wcm9maWxlRmV0Y2hlci5nZXRDb3BpbG90U2hlbGwoKSxcblx0XHRdKTtcblx0XHRjb25zdCByZXRyeVJld3JpdGVSZXN1bHQgPSBhd2FpdCB0aGlzLl9yZXdyaXRlQ29tbWFuZExpbmUob3B0aW9ucy5hcmdzLmNvbW1hbmQsIHtcblx0XHRcdGN3ZDogb3B0aW9ucy50b29sU3BlY2lmaWNEYXRhLmN3ZCA/IFVSSS5yZXZpdmUob3B0aW9ucy50b29sU3BlY2lmaWNEYXRhLmN3ZCkgOiB1bmRlZmluZWQsXG5cdFx0XHRzaGVsbCxcblx0XHRcdG9zLFxuXHRcdFx0aXNCYWNrZ3JvdW5kOiBvcHRpb25zLmlzQmFja2dyb3VuZCxcblx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbixcblx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbjogcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uID8gb3B0aW9ucy5yZXRyeVJlYXNvbiA6IHVuZGVmaW5lZCxcblx0XHRcdHJlcXVlc3RBbGxvd05ldHdvcmssXG5cdFx0XHRyZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uOiByZXF1ZXN0QWxsb3dOZXR3b3JrID8gb3B0aW9ucy5yZXRyeVJlYXNvbiA6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRjb25zdCByZXdyaXR0ZW5SZXRyeVJlYXNvbiA9IChyZXF1ZXN0QWxsb3dOZXR3b3JrID8gcmV0cnlSZXdyaXRlUmVzdWx0LnJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24gOiByZXRyeVJld3JpdGVSZXN1bHQucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uKSA/PyBvcHRpb25zLnJldHJ5UmVhc29uO1xuXHRcdGNvbnN0IHJldHJ5UGFyYW1ldGVyczogSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtcyA9IHtcblx0XHRcdC4uLm9wdGlvbnMuYXJncyxcblx0XHRcdGNvbW1hbmQ6IG9wdGlvbnMuYXJncy5jb21tYW5kLFxuXHRcdFx0YWxsb3dUb1J1blVuc2FuZGJveGVkQ29tbWFuZHM6IG9wdGlvbnMuYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzLFxuXHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uLFxuXHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uOiByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gPyByZXdyaXR0ZW5SZXRyeVJlYXNvbiA6IHVuZGVmaW5lZCxcblx0XHRcdHJlcXVlc3RBbGxvd05ldHdvcmssXG5cdFx0XHRyZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uOiByZXF1ZXN0QWxsb3dOZXR3b3JrID8gcmV3cml0dGVuUmV0cnlSZWFzb24gOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0XHRjb25zdCByZXRyeVJpc2tBc3Nlc3NtZW50ID0ge1xuXHRcdFx0dG9vbElkOiBUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsLFxuXHRcdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0XHQuLi5yZXRyeVBhcmFtZXRlcnMsXG5cdFx0XHRcdGNvbW1hbmQ6IHJldHJ5UmV3cml0ZVJlc3VsdC5yZXdyaXR0ZW5Db21tYW5kLFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IHJldHJ5Q29uZmlybWF0aW9uQ29tbWFuZCA9IG9wdGlvbnMudG9vbFNwZWNpZmljRGF0YS5wcmVzZW50YXRpb25PdmVycmlkZXM/LmNvbW1hbmRMaW5lID8/IG9wdGlvbnMuY29tbWFuZDtcblx0XHRjb25zdCBzaG91bGRSZXRyeSA9IGF3YWl0IHRoaXMuX2NvbmZpcm1BdXRvbWF0aWNTYW5kYm94UmV0cnkob3B0aW9ucy5yZXRyeUtpbmQsIG9wdGlvbnMuaW52b2NhdGlvbi5jb250ZXh0Py5zZXNzaW9uUmVzb3VyY2UsIHJldHJ5Q29uZmlybWF0aW9uQ29tbWFuZCwgc2hlbGwsIHJldHJ5UmV3cml0ZVJlc3VsdC5ibG9ja2VkRG9tYWlucywgcmV0cnlSaXNrQXNzZXNzbWVudCwgb3B0aW9ucy50b2tlbik7XG5cdFx0aWYgKCFzaG91bGRSZXRyeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByZXRyeVRvb2xTcGVjaWZpY0RhdGE6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHQuLi5vcHRpb25zLnRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0XHR0ZXJtaW5hbENvbW1hbmRJZDogYHRvb2wtJHtnZW5lcmF0ZVV1aWQoKX1gLFxuXHRcdFx0Y29tbWFuZExpbmU6IHtcblx0XHRcdFx0b3JpZ2luYWw6IG9wdGlvbnMuYXJncy5jb21tYW5kLFxuXHRcdFx0XHR0b29sRWRpdGVkOiByZXRyeVJld3JpdGVSZXN1bHQucmV3cml0dGVuQ29tbWFuZCA9PT0gb3B0aW9ucy5hcmdzLmNvbW1hbmQgPyB1bmRlZmluZWQgOiByZXRyeVJld3JpdGVSZXN1bHQucmV3cml0dGVuQ29tbWFuZCxcblx0XHRcdFx0Zm9yRGlzcGxheTogcmV0cnlSZXdyaXRlUmVzdWx0LmZvckRpc3BsYXlDb21tYW5kID8/IG5vcm1hbGl6ZVRlcm1pbmFsQ29tbWFuZEZvckRpc3BsYXkocmV0cnlSZXdyaXRlUmVzdWx0LnJld3JpdHRlbkNvbW1hbmQgPz8gb3B0aW9ucy5hcmdzLmNvbW1hbmQpLFxuXHRcdFx0XHRpc1NhbmRib3hXcmFwcGVkOiByZXRyeVJld3JpdGVSZXN1bHQuaXNTYW5kYm94V3JhcHBlZCxcblx0XHRcdH0sXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiB8fCAocmVxdWVzdEFsbG93TmV0d29yayA/IGZhbHNlIDogdW5kZWZpbmVkKSxcblx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbjogcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uID8gcmV3cml0dGVuUmV0cnlSZWFzb24gOiB1bmRlZmluZWQsXG5cdFx0XHRyZXF1ZXN0QWxsb3dOZXR3b3JrOiByZXF1ZXN0QWxsb3dOZXR3b3JrIHx8IHVuZGVmaW5lZCxcblx0XHRcdHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb246IHJlcXVlc3RBbGxvd05ldHdvcmsgPyByZXdyaXR0ZW5SZXRyeVJlYXNvbiA6IHVuZGVmaW5lZCxcblx0XHRcdHRlcm1pbmFsQ29tbWFuZFVyaTogdW5kZWZpbmVkLFxuXHRcdFx0dGVybWluYWxDb21tYW5kT3V0cHV0OiB1bmRlZmluZWQsXG5cdFx0XHR0ZXJtaW5hbFRoZW1lOiB1bmRlZmluZWQsXG5cdFx0XHR0ZXJtaW5hbENvbW1hbmRTdGF0ZTogdW5kZWZpbmVkLFxuXHRcdFx0ZGlkQ29udGludWVJbkJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdGNvbnN0IHJldHJ5VG9vbENhbGxJZCA9IGBhdXRvbWF0aWMtJHtvcHRpb25zLnJldHJ5S2luZCA9PT0gJ2FsbG93TmV0d29yaycgPyAnYWxsb3ctbmV0d29yaycgOiAndW5zYW5kYm94J30tcmV0cnktJHtnZW5lcmF0ZVV1aWQoKX1gO1xuXHRcdHRoaXMuX2FjY2VwdEF1dG9tYXRpY1NhbmRib3hSZXRyeVRvb2xJbnZvY2F0aW9uVXBkYXRlKG9wdGlvbnMucmV0cnlLaW5kLCBvcHRpb25zLmludm9jYXRpb24uY29udGV4dD8uc2Vzc2lvblJlc291cmNlLCByZXRyeVRvb2xDYWxsSWQsIHJldHJ5VG9vbFNwZWNpZmljRGF0YSwgZmFsc2UpO1xuXG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuaW52b2tlKHtcblx0XHRcdC4uLm9wdGlvbnMuaW52b2NhdGlvbixcblx0XHRcdHBhcmFtZXRlcnM6IHJldHJ5UGFyYW1ldGVycyxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHJldHJ5VG9vbFNwZWNpZmljRGF0YSxcblx0XHR9LCBvcHRpb25zLmNvdW50VG9rZW5zLCBvcHRpb25zLnByb2dyZXNzLCBvcHRpb25zLnRva2VuKTtcblx0fVxuXHRhc3luYyBpbnZva2UoaW52b2NhdGlvbjogSVRvb2xJbnZvY2F0aW9uLCBfY291bnRUb2tlbnM6IENvdW50VG9rZW5zQ2FsbGJhY2ssIF9wcm9ncmVzczogVG9vbFByb2dyZXNzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb29sUmVzdWx0PiB7XG5cdFx0Y29uc3QgdG9vbFNwZWNpZmljRGF0YSA9IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIHwgdW5kZWZpbmVkO1xuXHRcdGlmICghdG9vbFNwZWNpZmljRGF0YSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCd0b29sU3BlY2lmaWNEYXRhIG11c3QgYmUgcHJvdmlkZWQgZm9yIHRoaXMgdG9vbCcpO1xuXHRcdH1cblx0XHRpZiAoIWludm9jYXRpb24uY29udGV4dCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZvY2F0aW9uIGNvbnRleHQgbXVzdCBiZSBwcm92aWRlZCBmb3IgdGhpcyB0b29sJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbWFuZElkID0gdG9vbFNwZWNpZmljRGF0YS50ZXJtaW5hbENvbW1hbmRJZDtcblx0XHRpZiAodG9vbFNwZWNpZmljRGF0YS5hbHRlcm5hdGl2ZVJlY29tbWVuZGF0aW9uKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogdG9vbFNwZWNpZmljRGF0YS5hbHRlcm5hdGl2ZVJlY29tbWVuZGF0aW9uXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGFyZ3MgPSBpbnZvY2F0aW9uLnBhcmFtZXRlcnMgYXMgSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtcztcblx0XHRjb25zdCBhbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMgPSB0aGlzLl9nZXRBbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kcyhhcmdzKTtcblx0XHRjb25zdCBzYW5kYm94UHJlY2hlY2tJbnB1dHMgPSB0aGlzLl9nZXRTYW5kYm94UHJlY2hlY2tJbnB1dHMoaW52b2NhdGlvbi5jb250ZXh0LnNlc3Npb25SZXNvdXJjZSwgaW52b2NhdGlvbi5jaGF0UmVxdWVzdElkKTtcblx0XHRjb25zdCBpc1NhbmRib3hFbmFibGVkID0gYXdhaXQgdGhpcy5fdGVybWluYWxTYW5kYm94U2VydmljZS5pc0VuYWJsZWQoc2FuZGJveFByZWNoZWNrSW5wdXRzKTtcblx0XHRpZiAodGhpcy5fc2hvdWxkUmVqZWN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZXF1ZXN0KGlzU2FuZGJveEVuYWJsZWQsIGFsbG93VW5zYW5kYm94ZWRDb21tYW5kcywgYXJncykpIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSB0aGlzLl9nZXRVbnNhbmRib3hlZEV4ZWN1dGlvbkRpc2FibGVkTWVzc2FnZSgpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dG9vbFJlc3VsdEVycm9yOiBtZXNzYWdlLFxuXHRcdFx0XHR0b29sUmVzdWx0RGV0YWlsczoge1xuXHRcdFx0XHRcdGlucHV0OiBhcmdzLmNvbW1hbmQsXG5cdFx0XHRcdFx0b3V0cHV0OiBbeyB0eXBlOiAnZW1iZWQnLCBpc1RleHQ6IHRydWUsIHZhbHVlOiBtZXNzYWdlIH1dLFxuXHRcdFx0XHRcdGlzRXJyb3I6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdHZhbHVlOiBtZXNzYWdlLFxuXHRcdFx0XHR9XSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2FuZGJveFByZXJlcXVpc2l0ZVRlcm1pbmFsT3B0aW9ucyA9IHtcblx0XHRcdGNyZWF0ZVRlcm1pbmFsOiBhc3luYyAoKSA9PiB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuY3JlYXRlVGVybWluYWwoe30pLFxuXHRcdFx0Zm9jdXNUZXJtaW5hbDogYXN5bmMgKHRlcm1pbmFsOiB7IGZvY3VzKCk6IHZvaWQgfSkgPT4ge1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UodGVybWluYWwgYXMgSVRlcm1pbmFsSW5zdGFuY2UpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbFNlcnZpY2UucmV2ZWFsVGVybWluYWwodGVybWluYWwgYXMgSVRlcm1pbmFsSW5zdGFuY2UsIHRydWUpO1xuXHRcdFx0XHR0ZXJtaW5hbC5mb2N1cygpO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0aWYgKHRvb2xTcGVjaWZpY0RhdGEuc2FuZGJveFByZXJlcXVpc2l0ZUZhaWx1cmUpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IHRvb2xTcGVjaWZpY0RhdGEuc2FuZGJveFByZXJlcXVpc2l0ZUZhaWx1cmUgfV0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQgPSBpc1NhbmRib3hFbmFibGVkICYmIGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2FuZGJveFNlcnZpY2UuaXNTYW5kYm94QWxsb3dOZXR3b3JrRW5hYmxlZCgpO1xuXHRcdGlmICh0aGlzLl9zaG91bGRSZWplY3RBbGxvd05ldHdvcmtSZXF1ZXN0KGlzU2FuZGJveEVuYWJsZWQsIGlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQsIGFyZ3MpKSB7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gdGhpcy5fZ2V0QWxsb3dOZXR3b3JrUmVxdWVzdERpc2FibGVkTWVzc2FnZSgpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dG9vbFJlc3VsdEVycm9yOiBtZXNzYWdlLFxuXHRcdFx0XHR0b29sUmVzdWx0RGV0YWlsczoge1xuXHRcdFx0XHRcdGlucHV0OiBhcmdzLmNvbW1hbmQsXG5cdFx0XHRcdFx0b3V0cHV0OiBbeyB0eXBlOiAnZW1iZWQnLCBpc1RleHQ6IHRydWUsIHZhbHVlOiBtZXNzYWdlIH1dLFxuXHRcdFx0XHRcdGlzRXJyb3I6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdHZhbHVlOiBtZXNzYWdlLFxuXHRcdFx0XHR9XSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIG1pc3Npbmcgc2FuZGJveCBkZXBlbmRlbmNpZXMgaW5zdGFsbCBmbG93LlxuXHRcdC8vIFRoZSB1c2VyIHdhcyBzaG93biBhIGNvbmZpcm1hdGlvbiB3aW5kb3cgaW4gcHJlcGFyZVRvb2xJbnZvY2F0aW9uLlxuXHRcdGlmICh0b29sU3BlY2lmaWNEYXRhLm1pc3NpbmdTYW5kYm94RGVwZW5kZW5jaWVzPy5sZW5ndGgpIHtcblx0XHRcdGlmIChpbnZvY2F0aW9uLnNlbGVjdGVkQ3VzdG9tQnV0dG9uID09PSAnaW5zdGFsbCcpIHtcblx0XHRcdFx0Ly8gSW5zdGFsbCBkZXBlbmRlbmNpZXMsIGZvY3VzIHRlcm1pbmFsIGZvciBzdWRvIHBhc3N3b3JkLCB3YWl0IGZvciBjb21wbGV0aW9uXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGludm9jYXRpb24uY29udGV4dC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRcdGNvbnN0IHsgZXhpdENvZGUgfSA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2FuZGJveFNlcnZpY2UuaW5zdGFsbE1pc3NpbmdTYW5kYm94RGVwZW5kZW5jaWVzKHRvb2xTcGVjaWZpY0RhdGEubWlzc2luZ1NhbmRib3hEZXBlbmRlbmNpZXMsIHNlc3Npb25SZXNvdXJjZSwgdG9rZW4sIHNhbmRib3hQcmVyZXF1aXNpdGVUZXJtaW5hbE9wdGlvbnMpO1xuXHRcdFx0XHRpZiAoZXhpdENvZGUgIT09IHVuZGVmaW5lZCAmJiBleGl0Q29kZSAhPT0gMCkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZShcblx0XHRcdFx0XHRcdFx0XHQncnVuSW5UZXJtaW5hbC5taXNzaW5nRGVwcy5mYWlsZWQnLFxuXHRcdFx0XHRcdFx0XHRcdFwiU2FuZGJveCBkZXBlbmRlbmN5IGluc3RhbGxhdGlvbiBmYWlsZWQgKGV4aXQgY29kZSB7MH0pLiBUaGUgY29tbWFuZCB3YXMgbm90IGV4ZWN1dGVkLlwiLFxuXHRcdFx0XHRcdFx0XHRcdGV4aXRDb2RlXG5cdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChleGl0Q29kZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0XHRcdCdydW5JblRlcm1pbmFsLm1pc3NpbmdEZXBzLnVua25vd24nLFxuXHRcdFx0XHRcdFx0XHRcdFwiQ291bGQgbm90IGRldGVybWluZSB3aGV0aGVyIHNhbmRib3ggZGVwZW5kZW5jeSBpbnN0YWxsYXRpb24gc3VjY2VlZGVkLiBUaGUgY29tbWFuZCB3YXMgbm90IGV4ZWN1dGVkLlwiXG5cdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlZnJlc2hlZFByZXJlcXMgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmNoZWNrRm9yU2FuZGJveGluZ1ByZXJlcXModHJ1ZSwgc2FuZGJveFByZWNoZWNrSW5wdXRzKTtcblx0XHRcdFx0aWYgKHJlZnJlc2hlZFByZXJlcXMuZmFpbGVkQ2hlY2sgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiByZWZyZXNoZWRQcmVyZXFzLmZhaWxlZENoZWNrID09PSBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjay5CdWJibGV3cmFwICYmIHJlZnJlc2hlZFByZXJlcXMucmVtZWRpYXRpb25zPy5sZW5ndGhcblx0XHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdydW5JblRlcm1pbmFsLm1pc3NpbmdEZXBzLmJ1YmJsZXdyYXBGYWlsZWQnLCBcIlNhbmRib3ggZGVwZW5kZW5jaWVzIHdlcmUgaW5zdGFsbGVkLCBidXQgYnViYmxld3JhcCBjYW5ub3QgY3JlYXRlIHRoZSByZXF1aXJlZCBzYW5kYm94IG5hbWVzcGFjZS4gUnVuIHRoZSBjb21tYW5kIGFnYWluIHRvIGNob29zZSBhbiBhdmFpbGFibGUgcmVwYWlyIG9wdGlvbi5cIilcblx0XHRcdFx0XHRcdFx0XHQ6IHJlZnJlc2hlZFByZXJlcXMuZmFpbGVkQ2hlY2sgPT09IFRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrLkJ1YmJsZXdyYXBcblx0XHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3J1bkluVGVybWluYWwubWlzc2luZ0RlcHMuYnViYmxld3JhcEZhaWxlZE5vUmVwYWlyJywgXCJTYW5kYm94IGRlcGVuZGVuY2llcyB3ZXJlIGluc3RhbGxlZCwgYnV0IGJ1YmJsZXdyYXAgY2Fubm90IGNyZWF0ZSB0aGUgcmVxdWlyZWQgc2FuZGJveCBuYW1lc3BhY2Ugb24gdGhpcyBzeXN0ZW0uIFRoZSBjb21tYW5kIHdhcyBub3QgZXhlY3V0ZWQuXCIpXG5cdFx0XHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdydW5JblRlcm1pbmFsLm1pc3NpbmdEZXBzLnJlY2hlY2tGYWlsZWQnLCBcIlNhbmRib3ggcHJlcmVxdWlzaXRlcyBhcmUgc3RpbGwgbm90IHNhdGlzZmllZCBhZnRlciBpbnN0YWxsYXRpb24uIFRoZSBjb21tYW5kIHdhcyBub3QgZXhlY3V0ZWQuXCIpLFxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1J1bkluVGVybWluYWxUb29sOiBTYW5kYm94IGRlcGVuZGVuY3kgaW5zdGFsbGF0aW9uIHN1Y2NlZWRlZCcpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdCdydW5JblRlcm1pbmFsLm1pc3NpbmdEZXBzLmluc3RhbGxlZCcsXG5cdFx0XHRcdFx0XHRcdFwiU2FuZGJveCBkZXBlbmRlbmNpZXMgd2VyZSBpbnN0YWxsZWQgc3VjY2Vzc2Z1bGx5LiBJZiB0aGUgaXNzdWUgcGVyc2lzdHMsIHJlbG9hZCB0aGUgd2luZG93IGFuZCB0cnkgcnVubmluZyB0aGUgY29tbWFuZCBhZ2Fpbi5cIlxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFVzZXIgY2hvc2UgdG8gY2FuY2VsIFx1MjAxNCBkbyBub3QgcnVuIHRoZSBjb21tYW5kXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnUnVuSW5UZXJtaW5hbFRvb2w6IFVzZXIgY2FuY2VsbGVkIHNhbmRib3ggZGVwZW5kZW5jeSBpbnN0YWxsYXRpb24nKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0XHQncnVuSW5UZXJtaW5hbC5taXNzaW5nRGVwcy5jYW5jZWxsZWQnLFxuXHRcdFx0XHRcdFx0XHRcIlNhbmRib3ggZGVwZW5kZW5jeSBpbnN0YWxsYXRpb24gd2FzIGNhbmNlbGxlZCBieSB0aGUgdXNlci5cIlxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodG9vbFNwZWNpZmljRGF0YS5zYW5kYm94UmVtZWRpYXRpb25zPy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHNlbGVjdGVkUmVtZWRpYXRpb24gPSB0b29sU3BlY2lmaWNEYXRhLnNhbmRib3hSZW1lZGlhdGlvbnNbMF0gYXMgVGVybWluYWxTYW5kYm94UHJlQ2hlY2tSZW1lZGlhdGlvbjtcblx0XHRcdGNvbnN0IHsgZXhpdENvZGUgfSA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2FuZGJveFNlcnZpY2UucnVuU2FuZGJveFJlbWVkaWF0aW9uKHNlbGVjdGVkUmVtZWRpYXRpb24sIGludm9jYXRpb24uY29udGV4dC5zZXNzaW9uUmVzb3VyY2UsIHRva2VuLCBzYW5kYm94UHJlcmVxdWlzaXRlVGVybWluYWxPcHRpb25zKTtcblx0XHRcdGlmIChleGl0Q29kZSAhPT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZ2V0QnViYmxld3JhcFVuc3VwcG9ydGVkUmVzdWx0KCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZWZyZXNoZWRQcmVyZXFzID0gYXdhaXQgdGhpcy5fdGVybWluYWxTYW5kYm94U2VydmljZS5jaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzKHRydWUsIHNhbmRib3hQcmVjaGVja0lucHV0cyk7XG5cdFx0XHRpZiAocmVmcmVzaGVkUHJlcmVxcy5mYWlsZWRDaGVjayAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9nZXRCdWJibGV3cmFwVW5zdXBwb3J0ZWRSZXN1bHQoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnUnVuSW5UZXJtaW5hbFRvb2w6IEJ1YmJsZXdyYXAgcmVtZWRpYXRpb24gYW5kIGNhcGFiaWxpdHkgcmVjaGVjayBzdWNjZWVkZWQsIHByb2NlZWRpbmcgd2l0aCBjb21tYW5kIGV4ZWN1dGlvbicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4ZWN1dGlvbk9wdGlvbnMgPSB0aGlzLl9yZXNvbHZlRXhlY3V0aW9uT3B0aW9ucyhhcmdzKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogSW52b2tpbmcgd2l0aCBvcHRpb25zICR7SlNPTi5zdHJpbmdpZnkoYXJncyl9YCk7XG5cdFx0bGV0IHRvb2xSZXN1bHRNZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGFyZ3MudGltZW91dCAhPT0gdW5kZWZpbmVkICYmIChOdW1iZXIuaXNOYU4oYXJncy50aW1lb3V0KSB8fCBhcmdzLnRpbWVvdXQgPCAwKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0dmFsdWU6ICdFcnJvcjogdGltZW91dCBtdXN0IGJlIGEgbm9uLW5lZ2F0aXZlIG51bWJlciBvZiBtaWxsaXNlY29uZHMgKHVzZSAwIGZvciBubyB0aW1lb3V0KS4nXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRpZiAoZXhlY3V0aW9uT3B0aW9ucy5tb2RlID09PSAnc3luYycgJiYgYXJncy50aW1lb3V0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIFRpbWVvdXQgaXMgb3B0aW9uYWwgZm9yIG1vZGU9c3luYzogd2hlbiBvbWl0dGVkLCB0aGUgdG9vbCB3YWl0cyBmb3Jcblx0XHRcdC8vIHRoZSBjb21tYW5kIHRvIGNvbXBsZXRlIHdpdGggbm8gaGFyZCBjYXAuIE1vZGVscyBmcmVxdWVudGx5IHBpY2tcblx0XHRcdC8vIHRpbWVvdXRzIHRoYXQgYXJlIHRvbyBzaG9ydCBmb3IgcGFja2FnZSBpbnN0YWxscywgYnVpbGRzLCBhbmRcblx0XHRcdC8vIGxvbmctcnVubmluZyBzY3JpcHRzLCB3aGljaCBjYXVzZXMgdGhlIGNvbW1hbmQgdG8gYmUgbW92ZWQgdG8gdGhlXG5cdFx0XHQvLyBiYWNrZ3JvdW5kIHVubmVjZXNzYXJpbHkuXG5cdFx0XHRhcmdzLnRpbWVvdXQgPSAwO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXRTZXNzaW9uUmVzb3VyY2UgPSBpbnZvY2F0aW9uLmNvbnRleHQuc2Vzc2lvblJlc291cmNlO1xuXHRcdC8vIFN1YmFnZW50LWluaXRpYXRlZCB0ZXJtaW5hbHMgY2Fubm90IHJlY2VpdmUgc3RlZXJpbmcgbWVzc2FnZXM7IHRoZSBzdWJhZ2VudFxuXHRcdC8vIHJ1bnMgaW4gaXRzIG93biB0b29sLWNhbGxpbmcgbG9vcCBhbmQgc2hvdWxkIHBvbGwgd2l0aCBnZXRfdGVybWluYWxfb3V0cHV0LlxuXHRcdGNvbnN0IHNob3VsZFNlbmROb3RpZmljYXRpb25zID0gIWludm9jYXRpb24uc3ViQWdlbnRJbnZvY2F0aW9uSWQ7XG5cdFx0Y29uc3QgY29tbWFuZCA9IHRvb2xTcGVjaWZpY0RhdGEuY29tbWFuZExpbmUudXNlckVkaXRlZCA/PyB0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLnRvb2xFZGl0ZWQgPz8gdG9vbFNwZWNpZmljRGF0YS5jb21tYW5kTGluZS5vcmlnaW5hbDtcblx0XHRjb25zdCBkaWRVc2VyRWRpdENvbW1hbmQgPSAoXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLnVzZXJFZGl0ZWQgIT09IHVuZGVmaW5lZCAmJlxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YS5jb21tYW5kTGluZS51c2VyRWRpdGVkICE9PSB0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLm9yaWdpbmFsXG5cdFx0KTtcblx0XHRjb25zdCBkaWRUb29sRWRpdENvbW1hbmQgPSAoXG5cdFx0XHQhZGlkVXNlckVkaXRDb21tYW5kICYmXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLnRvb2xFZGl0ZWQgIT09IHVuZGVmaW5lZCAmJlxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YS5jb21tYW5kTGluZS50b29sRWRpdGVkICE9PSB0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLm9yaWdpbmFsICYmXG5cdFx0XHQvLyBPbmx5IGNvbnNpZGVyIGl0IGEgbWVhbmluZ2Z1bCBlZGl0IGlmIHRoZSBkaXNwbGF5IGZvcm0gYWxzbyBkaWZmZXJzIGZyb20gdGhlXG5cdFx0XHQvLyBvcmlnaW5hbC4gQ29zbWV0aWMgcmV3cml0ZXMgbGlrZSBwcmVwZW5kaW5nIGEgc3BhY2UgdG8gcHJldmVudCBzaGVsbCBoaXN0b3J5XG5cdFx0XHQvLyBzaG91bGQgbm90IHRyaWdnZXIgdGhlIFwidG9vbCBzaW1wbGlmaWVkIHRoZSBjb21tYW5kXCIgbm90ZS5cblx0XHRcdG5vcm1hbGl6ZVRlcm1pbmFsQ29tbWFuZEZvckRpc3BsYXkodG9vbFNwZWNpZmljRGF0YS5jb21tYW5kTGluZS50b29sRWRpdGVkKS50cmltKCkgIT09IG5vcm1hbGl6ZVRlcm1pbmFsQ29tbWFuZEZvckRpc3BsYXkodG9vbFNwZWNpZmljRGF0YS5jb21tYW5kTGluZS5vcmlnaW5hbCkudHJpbSgpXG5cdFx0KTtcblxuXHRcdGNvbnN0IGRpZFNhbmRib3hXcmFwQ29tbWFuZCA9IHRvb2xTcGVjaWZpY0RhdGEuY29tbWFuZExpbmUuaXNTYW5kYm94V3JhcHBlZCA9PT0gdHJ1ZTtcblx0XHRjb25zdCBjb21tYW5kTGluZUZvck1ldGFkYXRhID0gaXNTYW5kYm94RW5hYmxlZFxuXHRcdFx0PyB0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLmZvckRpc3BsYXkgPz8gdG9vbFNwZWNpZmljRGF0YS5jb21tYW5kTGluZS5vcmlnaW5hbFxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblxuXHRcdGlmIChkaWRTYW5kYm94V3JhcENvbW1hbmQpIHtcblx0XHRcdGNvbnN0IGRlbmllZEFjY2VzcyA9IGF3YWl0IHRoaXMuX2dldERlbmllZFNhbmRib3hGaWxlQWNjZXNzKGFyZ3MucmVxdWVzdEZpbGVWYWxpZGF0aW9uQ2hlY2ssIHNhbmRib3hQcmVjaGVja0lucHV0cyk7XG5cdFx0XHRpZiAoZGVuaWVkQWNjZXNzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IHRoaXMuX2J1aWxkU2FuZGJveEZpbGVBY2Nlc3NEZW5pZWRNZXNzYWdlKGRlbmllZEFjY2Vzcyk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dG9vbFJlc3VsdEVycm9yOiBtZXNzYWdlLFxuXHRcdFx0XHRcdHRvb2xSZXN1bHREZXRhaWxzOiB7XG5cdFx0XHRcdFx0XHRpbnB1dDogYXJncy5jb21tYW5kLFxuXHRcdFx0XHRcdFx0b3V0cHV0OiBbeyB0eXBlOiAnZW1iZWQnLCBpc1RleHQ6IHRydWUsIHZhbHVlOiBtZXNzYWdlIH1dLFxuXHRcdFx0XHRcdFx0aXNFcnJvcjogdHJ1ZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbWVzc2FnZSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgZXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhdXRvbWF0aWNVbnNhbmRib3hSZXRyeVJlYXNvbiA9IGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnVuc2FuZGJveGVkLmF1dG9SZXRyeS5yZWFzb24nLCAnVGhlIHNhbmRib3hlZCBleGVjdXRpb24gb3V0cHV0IGluZGljYXRlZCB0aGUgc2FuZGJveCBibG9ja2VkIHRoZSBjb21tYW5kLicpO1xuXHRcdGNvbnN0IGF1dG9tYXRpY0FsbG93TmV0d29ya1JldHJ5UmVhc29uID0gbG9jYWxpemUoJ3J1bkluVGVybWluYWwuYWxsb3dOZXR3b3JrLmF1dG9SZXRyeS5yZWFzb24nLCAnVGhlIHNhbmRib3hlZCBleGVjdXRpb24gb3V0cHV0IGluZGljYXRlZCB0aGUgc2FuZGJveCBibG9ja2VkIHJlcXVpcmVkIG5ldHdvcmsgYWNjZXNzLicpO1xuXHRcdGNvbnN0IGlzTmV3U2Vzc2lvbiA9ICFleGVjdXRpb25PcHRpb25zLnBlcnNpc3RlbnRTZXNzaW9uICYmICF0aGlzLl9zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuaGFzKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0Y29uc3QgdGltaW5nU3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IHRlcm1JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHRlcm1pbmFsVG9vbFNlc3Npb25JZCA9ICh0b29sU3BlY2lmaWNEYXRhIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEpLnRlcm1pbmFsVG9vbFNlc3Npb25JZDtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gVW5pZmllZCB0ZXJtaW5hbCBpbml0aWFsaXphdGlvblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBDcmVhdGluZyAke2V4ZWN1dGlvbk9wdGlvbnMucGVyc2lzdGVudFNlc3Npb24gPyAnYmFja2dyb3VuZCcgOiAnZm9yZWdyb3VuZCd9IHRlcm1pbmFsLiB0ZXJtSWQ9JHt0ZXJtSWR9LCBjaGF0U2Vzc2lvblJlc291cmNlPSR7Y2hhdFNlc3Npb25SZXNvdXJjZX1gKTtcblx0XHRjb25zdCB0b29sVGVybWluYWwgPSBhd2FpdCB0aGlzLl9pbml0VGVybWluYWwoY2hhdFNlc3Npb25SZXNvdXJjZSwgdGVybUlkLCB0ZXJtaW5hbFRvb2xTZXNzaW9uSWQsIGV4ZWN1dGlvbk9wdGlvbnMucGVyc2lzdGVudFNlc3Npb24sIHRva2VuKTtcblxuXHRcdHRoaXMuX2hhbmRsZVRlcm1pbmFsVmlzaWJpbGl0eSh0b29sVGVybWluYWwsIGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0Y29uc3QgdGltaW5nQ29ubmVjdE1zID0gRGF0ZS5ub3coKSAtIHRpbWluZ1N0YXJ0O1xuXG5cdFx0Y29uc3QgeHRlcm0gPSBhd2FpdCB0b29sVGVybWluYWwuaW5zdGFuY2UueHRlcm1SZWFkeVByb21pc2U7XG5cdFx0aWYgKCF4dGVybSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnN0YW5jZSB3YXMgZGlzcG9zZWQgYmVmb3JlIHh0ZXJtLmpzIHdhcyByZWFkeScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmREZXRlY3Rpb24gPSB0b29sVGVybWluYWwuaW5zdGFuY2UuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cblx0XHRsZXQgaW5wdXRVc2VyQ2hhcnMgPSAwO1xuXHRcdGxldCBpbnB1dFVzZXJTaWdpbnQgPSBmYWxzZTtcblx0XHRzdG9yZS5hZGQoeHRlcm0ucmF3Lm9uRGF0YShkYXRhID0+IHtcblx0XHRcdGlmICghdGVsZW1ldHJ5SWdub3JlZFNlcXVlbmNlcy5pbmNsdWRlcyhkYXRhKSkge1xuXHRcdFx0XHRpbnB1dFVzZXJDaGFycyArPSBkYXRhLmxlbmd0aDtcblx0XHRcdH1cblx0XHRcdGlucHV0VXNlclNpZ2ludCB8fD0gZGF0YSA9PT0gJ1xceDAzJztcblx0XHR9KSk7XG5cblx0XHQvLyBVbmlmaWVkIGV4ZWN1dGlvbjogYWx3YXlzIHVzZSBleGVjdXRlIHN0cmF0ZWd5IGZvciBib3RoIGJhY2tncm91bmQgYW5kIGZvcmVncm91bmRcblx0XHRsZXQgdGVybWluYWxSZXN1bHQgPSAnJztcblx0XHRsZXQgb3V0cHV0TGluZUNvdW50ID0gLTE7XG5cdFx0bGV0IGV4aXRDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGFsdEJ1ZmZlclJlc3VsdDogSVRvb2xSZXN1bHQgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGRpZFRpbWVvdXQgPSBmYWxzZTtcblx0XHRsZXQgZGlkSWRsZVNpbGVuY2UgPSBmYWxzZTtcblx0XHRsZXQgZGlkSW5wdXROZWVkZWQgPSBmYWxzZTtcblx0XHRsZXQgZGlkU2Vuc2l0aXZlQXV0b0NhbmNlbGxlZCA9IGZhbHNlO1xuXHRcdC8vIENvdmVycyBib3RoIHRlcm1pbmFscyB0aGF0IHN0YXJ0IGFzIGJhY2tncm91bmQgKHBlcnNpc3RlbnRTZXNzaW9uKSBhbmRcblx0XHQvLyBmb3JlZ3JvdW5kIHRlcm1pbmFscyB0aGF0IGxhdGVyIG1vdmUgdG8gYmFja2dyb3VuZCAodGltZW91dC9jb250aW51ZS1pbi1iZykuXG5cdFx0bGV0IGlzQmFja2dyb3VuZEV4ZWN1dGlvbiA9IGV4ZWN1dGlvbk9wdGlvbnMucGVyc2lzdGVudFNlc3Npb247XG5cdFx0bGV0IHRpbWVvdXRQcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgdGltZW91dFJhY2VQcm9taXNlOiBQcm9taXNlPHsgdHlwZTogJ3RpbWVvdXQnIH0+IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBvdXRwdXRNb25pdG9yOiBPdXRwdXRNb25pdG9yIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBwb2xsaW5nUmVzdWx0OiBJUG9sbGluZ1Jlc3VsdCAmIHsgcG9sbER1cmF0aW9uTXM6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGV4ZWN1dGVDYW5jZWxsYXRpb24gPSBzdG9yZS5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKSk7XG5cblx0XHQvLyBTZXQgdXAgdGltZW91dCBmb3IgYm90aCBzeW5jIChjb21wbGV0aW9uKSBhbmQgYXN5bmMgKGlkbGUpIHdhaXQgc3RyYXRlZ2llcy5cblx0XHRjb25zdCB0aW1lb3V0VmFsdWUgPSBhcmdzLnRpbWVvdXQgIT09IHVuZGVmaW5lZCA/IGNsYW1wKGFyZ3MudGltZW91dCwgMCwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpIDogdW5kZWZpbmVkO1xuXHRcdGlmICh0aW1lb3V0VmFsdWUgIT09IHVuZGVmaW5lZCAmJiB0aW1lb3V0VmFsdWUgPiAwKSB7XG5cdFx0XHRjb25zdCBzaG91bGRFbmZvcmNlVGltZW91dCA9IGV4ZWN1dGlvbk9wdGlvbnMud2FpdFN0cmF0ZWd5ID09PSAnaWRsZScgfHwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5FbmZvcmNlVGltZW91dEZyb21Nb2RlbCkgPT09IHRydWU7XG5cdFx0XHRpZiAoc2hvdWxkRW5mb3JjZVRpbWVvdXQpIHtcblx0XHRcdFx0dGltZW91dFByb21pc2UgPSB0aW1lb3V0KHRpbWVvdXRWYWx1ZSk7XG5cdFx0XHRcdHRpbWVvdXRSYWNlUHJvbWlzZSA9IHRpbWVvdXRQcm9taXNlLnRoZW4oXG5cdFx0XHRcdFx0KCkgPT4gKHsgdHlwZTogJ3RpbWVvdXQnIGFzIGNvbnN0IH0pXG5cdFx0XHRcdCkuY2F0Y2goKCkgPT4gKHsgdHlwZTogJ3RpbWVvdXQnIGFzIGNvbnN0IH0pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTZXQgdXAgY29udGludWUgaW4gYmFja2dyb3VuZCBsaXN0ZW5lciAtIHVzZXMgYSByYWNlIHByb21pc2UgaW5zdGVhZCBvZiBjYW5jZWxsYXRpb25cblx0XHQvLyB0byBhbGxvdyB0aGUgZXhlY3V0aW9uIHN0cmF0ZWd5IHRvIGNvbnRpbnVlIHJ1bm5pbmcgYW5kIHByZXNlcnZlIGl0cyBtYXJrZXJcblx0XHRsZXQgY29udGludWVJbkJhY2tncm91bmRSZXNvbHZlOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY29udGludWVJbkJhY2tncm91bmRQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb250aW51ZUluQmFja2dyb3VuZFJlc29sdmUgPSByZXNvbHZlO1xuXHRcdH0pO1xuXHRcdGlmICh0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpIHtcblx0XHRcdHN0b3JlLmFkZCh0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLm9uRGlkQ29udGludWVJbkJhY2tncm91bmQoc2Vzc2lvbklkID0+IHtcblx0XHRcdFx0aWYgKHNlc3Npb25JZCA9PT0gdGVybWluYWxUb29sU2Vzc2lvbklkKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXhlY3V0aW9uID0gUnVuSW5UZXJtaW5hbFRvb2wuX2FjdGl2ZUV4ZWN1dGlvbnMuZ2V0KHRlcm1JZCk7XG5cdFx0XHRcdFx0ZXhlY3V0aW9uPy5zZXRCYWNrZ3JvdW5kPy4oKTtcblx0XHRcdFx0XHRpc0JhY2tncm91bmRFeGVjdXRpb24gPSB0cnVlO1xuXHRcdFx0XHRcdC8vIFJlc29sdmUgdGhlIHJhY2UgcHJvbWlzZSBpbnN0ZWFkIG9mIGNhbmNlbGxpbmcgLSB0aGlzIGFsbG93cyB0aGUgZXhlY3V0aW9uXG5cdFx0XHRcdFx0Ly8gdG8gY29udGludWUgcnVubmluZyBzbyBpdCBjYW4gYmUgYXdhaXRlZCBsYXRlclxuXHRcdFx0XHRcdGNvbnRpbnVlSW5CYWNrZ3JvdW5kUmVzb2x2ZT8uKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRsZXQgZXhlY3V0aW9uUHJvbWlzZTogUHJvbWlzZTxJVGVybWluYWxFeGVjdXRlU3RyYXRlZ3lSZXN1bHQ+IHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBDcmVhdGUgdW5pZmllZCBBY3RpdmVUZXJtaW5hbEV4ZWN1dGlvbiAoY3JlYXRlcyBhbmQgb3ducyB0aGUgc3RyYXRlZ3kpXG5cdFx0XHRjb25zdCBleGVjdXRpb24gPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0QWN0aXZlVGVybWluYWxFeGVjdXRpb24sXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdHRlcm1JZCxcblx0XHRcdFx0dG9vbFRlcm1pbmFsLFxuXHRcdFx0XHRjb21tYW5kRGV0ZWN0aW9uISxcblx0XHRcdFx0ZXhlY3V0aW9uT3B0aW9ucy5wZXJzaXN0ZW50U2Vzc2lvblxuXHRcdFx0KTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgUnVuSW5UZXJtaW5hbFRvb2w6IFVzaW5nIFxcYCR7ZXhlY3V0aW9uLnN0cmF0ZWd5LnR5cGV9XFxgIGV4ZWN1dGUgc3RyYXRlZ3kgZm9yIGNvbW1hbmQgXFxgJHtjb21tYW5kfVxcYGApO1xuXHRcdFx0c3RvcmUuYWRkKGV4ZWN1dGlvbik7XG5cdFx0XHR0aGlzLl9zZXRBY3RpdmVFeGVjdXRpb24odGVybUlkLCBleGVjdXRpb24pO1xuXG5cdFx0XHQvLyBTZXQgdXAgT3V0cHV0TW9uaXRvciB3aGVuIHN0YXJ0IG1hcmtlciBpcyBjcmVhdGVkXG5cdFx0XHRjb25zdCBzdGFydE1hcmtlclByb21pc2UgPSBFdmVudC50b1Byb21pc2UoZXhlY3V0aW9uLnN0cmF0ZWd5Lm9uRGlkQ3JlYXRlU3RhcnRNYXJrZXIpO1xuXHRcdFx0Y29uc3Qgb3V0cHV0TW9uaXRvclBvbGxGbiA9IGV4ZWN1dGlvbk9wdGlvbnMucGVyc2lzdGVudFNlc3Npb25cblx0XHRcdFx0PyBhc3luYyAoZXhlY3V0aW9uRm9yUG9sbDogeyBnZXRPdXRwdXQ6ICgpID0+IHN0cmluZyB9KTogUHJvbWlzZTxJUG9sbGluZ1Jlc3VsdCB8IHVuZGVmaW5lZD4gPT4gKHtcblx0XHRcdFx0XHRvdXRwdXQ6IGV4ZWN1dGlvbkZvclBvbGwuZ2V0T3V0cHV0KCksXG5cdFx0XHRcdFx0c3RhdGU6IE91dHB1dE1vbml0b3JTdGF0ZS5JZGxlLFxuXHRcdFx0XHR9KVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdHN0b3JlLmFkZChleGVjdXRpb24uc3RyYXRlZ3kub25EaWRDcmVhdGVTdGFydE1hcmtlcihzdGFydE1hcmtlciA9PiB7XG5cdFx0XHRcdGlmICghb3V0cHV0TW9uaXRvcikge1xuXHRcdFx0XHRcdG91dHB1dE1vbml0b3IgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRcdE91dHB1dE1vbml0b3IsXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGluc3RhbmNlOiB0b29sVGVybWluYWwuaW5zdGFuY2UsXG5cdFx0XHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogY2hhdFNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0Z2V0T3V0cHV0OiAobWFya2VyPzogSVh0ZXJtTWFya2VyKSA9PiBleGVjdXRpb24uZ2V0T3V0cHV0KG1hcmtlciA/PyBzdGFydE1hcmtlcilcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRvdXRwdXRNb25pdG9yUG9sbEZuLFxuXHRcdFx0XHRcdFx0aW52b2NhdGlvbi5jb250ZXh0LFxuXHRcdFx0XHRcdFx0dG9rZW4sXG5cdFx0XHRcdFx0XHRjb21tYW5kXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBTdGFydCBleGVjdXRpb24gKG5vbi1ibG9ja2luZyAtIHJ1bnMgaW4gYmFja2dyb3VuZClcblx0XHRcdGV4ZWN1dGlvblByb21pc2UgPSBleGVjdXRpb24uc3RhcnQoY29tbWFuZCwgZXhlY3V0ZUNhbmNlbGxhdGlvbi50b2tlbiwgY29tbWFuZElkLCBjb21tYW5kTGluZUZvck1ldGFkYXRhKTtcblxuXHRcdFx0aWYgKGV4ZWN1dGlvbk9wdGlvbnMud2FpdFN0cmF0ZWd5ID09PSAnaWRsZScpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IFN0YXJ0aW5nIHBlcnNpc3RlbnQgZXhlY3V0aW9uIHdpdGggaWRsZSB3YWl0IHN0cmF0ZWd5IFxcYCR7Y29tbWFuZH1cXGBgKTtcblx0XHRcdFx0YXdhaXQgc3RhcnRNYXJrZXJQcm9taXNlO1xuXHRcdFx0XHRsZXQgaWRsZVRpbWVkT3V0ID0gZmFsc2U7XG5cdFx0XHRcdGlmIChvdXRwdXRNb25pdG9yKSB7XG5cdFx0XHRcdFx0aWYgKHRpbWVvdXRSYWNlUHJvbWlzZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgaWRsZVJhY2UgPSBhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0XHRcdFx0XHRFdmVudC50b1Byb21pc2Uob3V0cHV0TW9uaXRvci5vbkRpZEZpbmlzaENvbW1hbmQpLnRoZW4oKCkgPT4gKHsgdHlwZTogJ2lkbGUnIGFzIGNvbnN0IH0pKSxcblx0XHRcdFx0XHRcdFx0dGltZW91dFJhY2VQcm9taXNlXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdGlmIChpZGxlUmFjZS50eXBlID09PSAndGltZW91dCcpIHtcblx0XHRcdFx0XHRcdFx0aWRsZVRpbWVkT3V0ID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IFRpbWVvdXQgcmVhY2hlZCB3YWl0aW5nIGZvciBpZGxlIHNpZ25hbCwgcmV0dXJuaW5nIG91dHB1dCBjb2xsZWN0ZWQgc28gZmFyYCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRwb2xsaW5nUmVzdWx0ID0gb3V0cHV0TW9uaXRvci5wb2xsaW5nUmVzdWx0O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2Uob3V0cHV0TW9uaXRvci5vbkRpZEZpbmlzaENvbW1hbmQpO1xuXHRcdFx0XHRcdFx0cG9sbGluZ1Jlc3VsdCA9IG91dHB1dE1vbml0b3IucG9sbGluZ1Jlc3VsdDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhd2FpdCB0aGlzLl9jb21tYW5kQXJ0aWZhY3RDb2xsZWN0b3IuY2FwdHVyZSh0b29sU3BlY2lmaWNEYXRhLCB0b29sVGVybWluYWwuaW5zdGFuY2UsIGNvbW1hbmRJZCk7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gdG9vbFNwZWNpZmljRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZSA/PyB7fTtcblx0XHRcdFx0c3RhdGUudGltZXN0YW1wID0gc3RhdGUudGltZXN0YW1wID8/IHRpbWluZ1N0YXJ0O1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhLnRlcm1pbmFsQ29tbWFuZFN0YXRlID0gc3RhdGU7XG5cblx0XHRcdFx0bGV0IHJlc3VsdFRleHQgPSAoXG5cdFx0XHRcdFx0ZGlkU2FuZGJveFdyYXBDb21tYW5kID8gYENvbW1hbmQgaXMgbm93IHJ1bm5pbmcgaW4gdGVybWluYWwgd2l0aCBJRD0ke3Rlcm1JZH1gXG5cdFx0XHRcdFx0XHQ6IGRpZFVzZXJFZGl0Q29tbWFuZFxuXHRcdFx0XHRcdFx0XHQ/IGBOb3RlOiBUaGUgdXNlciBtYW51YWxseSBlZGl0ZWQgdGhlIGNvbW1hbmQgdG8gXFxgJHtjb21tYW5kfVxcYCwgYW5kIHRoYXQgY29tbWFuZCBpcyBub3cgcnVubmluZyBpbiB0ZXJtaW5hbCB3aXRoIElEPSR7dGVybUlkfWBcblx0XHRcdFx0XHRcdFx0OiBkaWRUb29sRWRpdENvbW1hbmRcblx0XHRcdFx0XHRcdFx0XHQ/IGBOb3RlOiBUaGUgdG9vbCBzaW1wbGlmaWVkIHRoZSBjb21tYW5kIHRvIFxcYCR7Y29tbWFuZH1cXGAsIGFuZCB0aGF0IGNvbW1hbmQgaXMgbm93IHJ1bm5pbmcgaW4gdGVybWluYWwgd2l0aCBJRD0ke3Rlcm1JZH1gXG5cdFx0XHRcdFx0XHRcdFx0OiBgQ29tbWFuZCBpcyBydW5uaW5nIGluIHRlcm1pbmFsIHdpdGggSUQ9JHt0ZXJtSWR9YFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRjb25zdCBiYWNrZ3JvdW5kT3V0cHV0ID0gcG9sbGluZ1Jlc3VsdD8ub3V0cHV0ID8/IChpZGxlVGltZWRPdXQgPyBleGVjdXRpb24uZ2V0T3V0cHV0KCkgOiB1bmRlZmluZWQpO1xuXHRcdFx0XHRjb25zdCBvdXRwdXRBbmFseXplck1lc3NhZ2UgPSBiYWNrZ3JvdW5kT3V0cHV0XG5cdFx0XHRcdFx0PyBhd2FpdCB0aGlzLl9nZXRPdXRwdXRBbmFseXplck1lc3NhZ2UodW5kZWZpbmVkLCBiYWNrZ3JvdW5kT3V0cHV0LCBjb21tYW5kLCBkaWRTYW5kYm94V3JhcENvbW1hbmQpXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChpZGxlVGltZWRPdXQpIHtcblx0XHRcdFx0XHRyZXN1bHRUZXh0ICs9IGBcXG4gVGltZWQgb3V0IHdhaXRpbmcgZm9yIHRoZSBjb21tYW5kIHRvIGJlY29tZSBpZGxlLiBUaGUgY29tbWFuZCBpcyBzdGlsbCBydW5uaW5nLCB3aXRoIG91dHB1dDpcXG5gO1xuXHRcdFx0XHRcdGlmIChvdXRwdXRBbmFseXplck1lc3NhZ2UpIHtcblx0XHRcdFx0XHRcdHJlc3VsdFRleHQgKz0gYCR7b3V0cHV0QW5hbHl6ZXJNZXNzYWdlfVxcbmA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJlc3VsdFRleHQgKz0gYmFja2dyb3VuZE91dHB1dCA/PyAnJztcblx0XHRcdFx0fSBlbHNlIGlmIChwb2xsaW5nUmVzdWx0ICYmIHBvbGxpbmdSZXN1bHQuc3RhdGUgPT09IE91dHB1dE1vbml0b3JTdGF0ZS5JZGxlKSB7XG5cdFx0XHRcdFx0cmVzdWx0VGV4dCArPSBgXFxuIFRoZSBjb21tYW5kIGJlY2FtZSBpZGxlIHdpdGggb3V0cHV0OlxcbmA7XG5cdFx0XHRcdFx0aWYgKG91dHB1dEFuYWx5emVyTWVzc2FnZSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0VGV4dCArPSBgJHtvdXRwdXRBbmFseXplck1lc3NhZ2V9XFxuYDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmVzdWx0VGV4dCArPSBwb2xsaW5nUmVzdWx0Lm91dHB1dDtcblx0XHRcdFx0XHRyZXN1bHRUZXh0ICs9IGBcXG4ke3RoaXMuX2J1aWxkSW5wdXROZWVkZWRTdGVlcmluZ1RleHQoY2hhdFNlc3Npb25SZXNvdXJjZSwgdGVybUlkLCAnbm9uZScpfWA7XG5cdFx0XHRcdH0gZWxzZSBpZiAocG9sbGluZ1Jlc3VsdCkge1xuXHRcdFx0XHRcdHJlc3VsdFRleHQgKz0gYFxcbiBUaGUgY29tbWFuZCBpcyBzdGlsbCBydW5uaW5nLCB3aXRoIG91dHB1dDpcXG5gO1xuXHRcdFx0XHRcdGlmIChvdXRwdXRBbmFseXplck1lc3NhZ2UpIHtcblx0XHRcdFx0XHRcdHJlc3VsdFRleHQgKz0gYCR7b3V0cHV0QW5hbHl6ZXJNZXNzYWdlfVxcbmA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJlc3VsdFRleHQgKz0gcG9sbGluZ1Jlc3VsdC5vdXRwdXQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZW5kQ3dkID0gYXdhaXQgdG9vbFRlcm1pbmFsLmluc3RhbmNlLmdldEN3ZFJlc291cmNlKCk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dG9vbE1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRleGl0Q29kZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0aWQ6IHRlcm1JZCxcblx0XHRcdFx0XHRcdHRlcm1pbmFsSWQ6IHRvb2xUZXJtaW5hbC5pbnN0YW5jZS5pbnN0YW5jZUlkLFxuXHRcdFx0XHRcdFx0Y3dkOiBlbmRDd2Q/LnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHJlc3VsdFRleHQsXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBGb3JlZ3JvdW5kIG1vZGU6IHJhY2UgZXhlY3V0aW9uIGNvbXBsZXRpb24gYWdhaW5zdCBjb250aW51ZSBpbiBiYWNrZ3JvdW5kLlxuXHRcdFx0XHQvLyBBbHNvIHJhY2Ugb24gb3V0cHV0IG1vbml0b3IgaW5wdXQtbmVlZGVkIHNvIHRoYXQgaW50ZXJhY3RpdmUgcHJvbXB0c1xuXHRcdFx0XHQvLyByZXR1cm4gb3V0cHV0IHRvIHRoZSBhZ2VudCBlYXJseSBpbnN0ZWFkIG9mIHdhaXRpbmcgZm9yIHRpbWVvdXQuXG5cdFx0XHRcdGNvbnN0IHJhY2VDbGVhbnVwID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHQvLyBTZW5zaXRpdmUgcHJvbXB0cyAocGFzc3dvcmRzLCBPVFBzLCBcdTIwMjYpIG11c3QgbmV2ZXIgcmVhY2ggdGhlIG1vZGVsLlxuXHRcdFx0XHQvLyBTaG93IGEgY29uZmlybWF0aW9uIGRpYWxvZyB0aGF0IGZvY3VzZXMgdGhlIHRlcm1pbmFsIHNvIHRoZSB1c2VyXG5cdFx0XHRcdC8vIHR5cGVzIHRoZSBzZWNyZXQgZGlyZWN0bHkuIFRoZSByYWNlIGlzICpub3QqIHJlc29sdmVkIGJ5IHNlbnNpdGl2ZVxuXHRcdFx0XHQvLyBwcm9tcHRzIFx1MjAxNCB0aGUgcnVubmluZyBjb21tYW5kIGtlZXBzIHdhaXRpbmcgZm9yIHVzZXIgaW5wdXQgdW50aWxcblx0XHRcdFx0Ly8gZWl0aGVyIGl0IGNvbXBsZXRlcyAoZXhlY3V0aW9uUHJvbWlzZSB3aW5zKSBvciB0aGUgdXNlciBjYW5jZWxzXG5cdFx0XHRcdC8vIGl0IGZyb20gdGhlIGRpYWxvZyAod2hpY2ggY2FuY2VscyBleGVjdXRpb24gYW5kIGFsc28gbWFrZXNcblx0XHRcdFx0Ly8gZXhlY3V0aW9uUHJvbWlzZSByZXNvbHZlKS4gVGhpcyBtZWFucyB3ZSBuZXZlciBoYW5kIGEgc2VjcmV0XG5cdFx0XHRcdC8vIHByb21wdCBiYWNrIHRvIHRoZSBtb2RlbDsgdGhlIHVzZXIgaXMgYWx3YXlzIGluIGNvbnRyb2wuXG5cdFx0XHRcdC8vXG5cdFx0XHRcdC8vIG91dHB1dE1vbml0b3IgaXMgY3JlYXRlZCBsYXRlciBpbnNpZGUgYG9uRGlkQ3JlYXRlU3RhcnRNYXJrZXJgLFxuXHRcdFx0XHQvLyBzbyB3ZSBtdXN0IHdhaXQgb24gYHN0YXJ0TWFya2VyUHJvbWlzZWAgYmVmb3JlIHJlZ2lzdGVyaW5nIHRoZVxuXHRcdFx0XHQvLyBsaXN0ZW5lciBcdTIwMTQgb3RoZXJ3aXNlIG91dHB1dE1vbml0b3IgaXMgc3RpbGwgdW5kZWZpbmVkIGhlcmUgYW5kXG5cdFx0XHRcdC8vIHRoZSBzZW5zaXRpdmUgZXZlbnQgbmV2ZXIgcmVhY2hlcyB1cy5cblx0XHRcdFx0c3RhcnRNYXJrZXJQcm9taXNlLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChvdXRwdXRNb25pdG9yICYmICFyYWNlQ2xlYW51cC5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0XHRyYWNlQ2xlYW51cC5hZGQodGhpcy5fcmVnaXN0ZXJTZW5zaXRpdmVJbnB1dEVsaWNpdGF0aW9uKFxuXHRcdFx0XHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHR0b29sVGVybWluYWwuaW5zdGFuY2UsXG5cdFx0XHRcdFx0XHRcdG91dHB1dE1vbml0b3IsXG5cdFx0XHRcdFx0XHRcdCgpID0+IGV4ZWN1dGVDYW5jZWxsYXRpb24uY2FuY2VsKCksXG5cdFx0XHRcdFx0XHRcdCgpID0+IHsgZGlkU2Vuc2l0aXZlQXV0b0NhbmNlbGxlZCA9IHRydWU7IH0sXG5cdFx0XHRcdFx0XHQpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCByYWNlQ2FuZGlkYXRlczogUHJvbWlzZTx7IHR5cGU6ICdjb21wbGV0ZWQnOyByZXN1bHQ6IElUZXJtaW5hbEV4ZWN1dGVTdHJhdGVneVJlc3VsdCB9IHwgeyB0eXBlOiAnYmFja2dyb3VuZCcgfSB8IHsgdHlwZTogJ3RpbWVvdXQnIH0gfCB7IHR5cGU6ICdpbnB1dE5lZWRlZCcgfSB8IHsgdHlwZTogJ2lkbGVTaWxlbmNlJyB9PltdID0gW1xuXHRcdFx0XHRcdGV4ZWN1dGlvblByb21pc2UudGhlbihyZXN1bHQgPT4gKHsgdHlwZTogJ2NvbXBsZXRlZCcgYXMgY29uc3QsIHJlc3VsdCB9KSksXG5cdFx0XHRcdFx0Y29udGludWVJbkJhY2tncm91bmRQcm9taXNlLnRoZW4oKCkgPT4gKHsgdHlwZTogJ2JhY2tncm91bmQnIGFzIGNvbnN0IH0pKSxcblx0XHRcdFx0XHRuZXcgUHJvbWlzZTx7IHR5cGU6ICdpbnB1dE5lZWRlZCcgfT4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdFx0XHRzdGFydE1hcmtlclByb21pc2UudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChvdXRwdXRNb25pdG9yICYmICFyYWNlQ2xlYW51cC5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmFjZUNsZWFudXAuYWRkKG91dHB1dE1vbml0b3Iub25EaWREZXRlY3RJbnB1dE5lZWRlZCgoKSA9PiByZXNvbHZlKHsgdHlwZTogJ2lucHV0TmVlZGVkJyBhcyBjb25zdCB9KSkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHRdO1xuXHRcdFx0XHRpZiAodGltZW91dFJhY2VQcm9taXNlKSB7XG5cdFx0XHRcdFx0cmFjZUNhbmRpZGF0ZXMucHVzaCh0aW1lb3V0UmFjZVByb21pc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIElkbGUtc2lsZW5jZSBwcm9tb3Rpb246IGlmIG5vIHRlcm1pbmFsIG91dHB1dCBhcnJpdmVzIGZvciBOIG1zLFxuXHRcdFx0XHQvLyBoYW5kIGNvbnRyb2wgYmFjayB0byB0aGUgbW9kZWwgd2l0aCB0aGUgdGVybWluYWwgSUQgKyBvdXRwdXRcblx0XHRcdFx0Ly8gY29sbGVjdGVkIHNvIGZhci4gVGhlIHByb2Nlc3Mga2VlcHMgcnVubmluZyBcdTIwMTQgbW9kZWwgY2FuIHBvbGwsXG5cdFx0XHRcdC8vIHNlbmQgaW5wdXQsIG9yIGtpbGwgaXQuIERlZmF1bHQgNSBtaW47IDAgZGlzYWJsZXMuXG5cdFx0XHRcdGNvbnN0IGlkbGVTaWxlbmNlTXMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuSWRsZVNpbGVuY2VUaW1lb3V0TXMpID8/IERFRkFVTFRfSURMRV9TSUxFTkNFX1RJTUVPVVRfTVM7XG5cdFx0XHRcdGlmIChpZGxlU2lsZW5jZU1zID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGlkbGVTaWxlbmNlRGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHsgdHlwZTogJ2lkbGVTaWxlbmNlJyB9PigpO1xuXHRcdFx0XHRcdGNvbnN0IGlkbGVTaWxlbmNlU2NoZWR1bGVyID0gcmFjZUNsZWFudXAuYWRkKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IGlkbGVTaWxlbmNlRGVmZXJyZWQuY29tcGxldGUoeyB0eXBlOiAnaWRsZVNpbGVuY2UnIGFzIGNvbnN0IH0pLCBpZGxlU2lsZW5jZU1zKSk7XG5cdFx0XHRcdFx0cmFjZUNsZWFudXAuYWRkKHRvb2xUZXJtaW5hbC5pbnN0YW5jZS5vbkRhdGEoKCkgPT4gaWRsZVNpbGVuY2VTY2hlZHVsZXIuc2NoZWR1bGUoKSkpO1xuXHRcdFx0XHRcdGlkbGVTaWxlbmNlU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHRcdFx0cmFjZUNhbmRpZGF0ZXMucHVzaChpZGxlU2lsZW5jZURlZmVycmVkLnApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxldCByYWNlUmVzdWx0OiB7IHR5cGU6ICdjb21wbGV0ZWQnOyByZXN1bHQ6IElUZXJtaW5hbEV4ZWN1dGVTdHJhdGVneVJlc3VsdCB9IHwgeyB0eXBlOiAnYmFja2dyb3VuZCcgfSB8IHsgdHlwZTogJ3RpbWVvdXQnIH0gfCB7IHR5cGU6ICdpbnB1dE5lZWRlZCcgfSB8IHsgdHlwZTogJ2lkbGVTaWxlbmNlJyB9O1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJhY2VSZXN1bHQgPSBhd2FpdCBQcm9taXNlLnJhY2UocmFjZUNhbmRpZGF0ZXMpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHJhY2VDbGVhbnVwLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChyYWNlUmVzdWx0LnR5cGUgPT09ICdpbnB1dE5lZWRlZCcpIHtcblx0XHRcdFx0XHQvLyBPdXRwdXQgbW9uaXRvciBkZXRlY3RlZCB0aGUgdGVybWluYWwgaXMgd2FpdGluZyBmb3IgaW5wdXQuXG5cdFx0XHRcdFx0Ly8gUmV0dXJuIG91dHB1dCB0byB0aGUgYWdlbnQgc28gaXQgY2FuIHByb3ZpZGUgaW5wdXQgdmlhXG5cdFx0XHRcdFx0Ly8gc2VuZF90b190ZXJtaW5hbC4gVGhlIHRlcm1pbmFsIHN0YXlzIGZvcmVncm91bmQgc28gaXQgaXNcblx0XHRcdFx0XHQvLyByZXVzZWQgYnkgc3Vic2VxdWVudCBydW5faW5fdGVybWluYWwgY2FsbHMgaW4gdGhpcyBzZXNzaW9uLlxuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBPdXRwdXQgbW9uaXRvciBkZXRlY3RlZCBpbnB1dCBuZWVkZWQgaW4gZm9yZWdyb3VuZCB0ZXJtaW5hbCwgcmV0dXJuaW5nIG91dHB1dCB0byBhZ2VudGApO1xuXHRcdFx0XHRcdGVycm9yID0gJ2lucHV0TmVlZGVkJztcblx0XHRcdFx0XHRkaWRJbnB1dE5lZWRlZCA9IHRydWU7XG5cdFx0XHRcdFx0Ly8gUmVhZCBvdXRwdXQgZGlyZWN0bHkgZnJvbSB0aGUgZXhlY3V0aW9uIHJhdGhlciB0aGFuIGZyb20gcG9sbGluZ1Jlc3VsdCxcblx0XHRcdFx0XHQvLyBiZWNhdXNlIHRoZSBvdXRwdXQgbW9uaXRvciBtYXkgbm90IGhhdmUgc2V0IHBvbGxpbmdSZXN1bHQgeWV0IGF0IHRoaXMgcG9pbnRcblx0XHRcdFx0XHQvLyAoaXQgaXMgd3JpdHRlbiBpbiB0aGUgZmluYWxseSBibG9jayBhZnRlciBvbkRpZEZpbmlzaENvbW1hbmQpLlxuXHRcdFx0XHRcdGNvbnN0IGlkbGVPdXRwdXQgPSBleGVjdXRpb24uZ2V0T3V0cHV0KCk7XG5cdFx0XHRcdFx0b3V0cHV0TGluZUNvdW50ID0gaWRsZU91dHB1dCA/IGNvdW50KGlkbGVPdXRwdXQudHJpbSgpLCAnXFxuJykgKyAxIDogMDtcblx0XHRcdFx0XHR0ZXJtaW5hbFJlc3VsdCA9IGlkbGVPdXRwdXQgPz8gJyc7XG5cdFx0XHRcdH0gZWxzZSBpZiAocmFjZVJlc3VsdC50eXBlID09PSAnYmFja2dyb3VuZCcpIHtcblx0XHRcdFx0XHQvLyBNb3ZlZCB0byBiYWNrZ3JvdW5kIC0gZXhlY3V0aW9uIGNvbnRpbnVlcyBydW5uaW5nLCBqdXN0IHJldHVybiBjdXJyZW50IG91dHB1dFxuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBDb250aW51ZSBpbiBiYWNrZ3JvdW5kIHRyaWdnZXJlZCwgcmV0dXJuaW5nIG91dHB1dCBjb2xsZWN0ZWQgc28gZmFyYCk7XG5cdFx0XHRcdFx0ZXJyb3IgPSAnY29udGludWVJbkJhY2tncm91bmQnO1xuXHRcdFx0XHRcdGNvbnN0IGJhY2tncm91bmRPdXRwdXQgPSBleGVjdXRpb24uZ2V0T3V0cHV0KCk7XG5cdFx0XHRcdFx0b3V0cHV0TGluZUNvdW50ID0gYmFja2dyb3VuZE91dHB1dCA/IGNvdW50KGJhY2tncm91bmRPdXRwdXQudHJpbSgpLCAnXFxuJykgKyAxIDogMDtcblx0XHRcdFx0XHR0ZXJtaW5hbFJlc3VsdCA9IGJhY2tncm91bmRPdXRwdXQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAocmFjZVJlc3VsdC50eXBlID09PSAndGltZW91dCcpIHtcblx0XHRcdFx0XHQvLyBUaW1lb3V0IHJlYWNoZWQgLSByZXR1cm4gcGFydGlhbCBvdXRwdXQgYW5kIGtlZXAgdGVybWluYWwgYWxpdmUgYXMgYmFja2dyb3VuZC5cblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogVGltZW91dCByZWFjaGVkLCByZXR1cm5pbmcgb3V0cHV0IGNvbGxlY3RlZCBzbyBmYXJgKTtcblx0XHRcdFx0XHRlcnJvciA9ICd0aW1lb3V0Jztcblx0XHRcdFx0XHRkaWRUaW1lb3V0ID0gdHJ1ZTtcblx0XHRcdFx0XHRpc0JhY2tncm91bmRFeGVjdXRpb24gPSB0cnVlO1xuXHRcdFx0XHRcdHRvb2xUZXJtaW5hbC5pc0JhY2tncm91bmQgPSB0cnVlO1xuXHRcdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGEuZGlkQ29udGludWVJbkJhY2tncm91bmQgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5kZWxldGUoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fYXNzb2NpYXRlUHJvY2Vzc0lkV2l0aFNlc3Npb24odG9vbFRlcm1pbmFsLmluc3RhbmNlLCBjaGF0U2Vzc2lvblJlc291cmNlLCB0ZXJtSWQsIHRvb2xUZXJtaW5hbC5zaGVsbEludGVncmF0aW9uUXVhbGl0eSwgdHJ1ZSk7XG5cdFx0XHRcdFx0Y29uc3QgdGltZW91dE91dHB1dCA9IGV4ZWN1dGlvbi5nZXRPdXRwdXQoKTtcblx0XHRcdFx0XHRvdXRwdXRMaW5lQ291bnQgPSB0aW1lb3V0T3V0cHV0ID8gY291bnQodGltZW91dE91dHB1dC50cmltKCksICdcXG4nKSArIDEgOiAwO1xuXHRcdFx0XHRcdHRlcm1pbmFsUmVzdWx0ID0gdGltZW91dE91dHB1dCA/PyAnJztcblx0XHRcdFx0fSBlbHNlIGlmIChyYWNlUmVzdWx0LnR5cGUgPT09ICdpZGxlU2lsZW5jZScpIHtcblx0XHRcdFx0XHQvLyBObyBvdXRwdXQgZm9yIE4gbXMgLSBwcm9tb3RlIHRvIGJhY2tncm91bmQgYW5kIGhhbmQgYmFjayB0byBtb2RlbC4gUHJvY2VzcyBrZWVwcyBydW5uaW5nLlxuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBJZGxlIHNpbGVuY2UgcmVhY2hlZCAoJHtpZGxlU2lsZW5jZU1zfW1zKSwgcHJvbW90aW5nIHRvIGJhY2tncm91bmRgKTtcblx0XHRcdFx0XHRlcnJvciA9ICdpZGxlU2lsZW5jZSc7XG5cdFx0XHRcdFx0ZGlkSWRsZVNpbGVuY2UgPSB0cnVlO1xuXHRcdFx0XHRcdGlzQmFja2dyb3VuZEV4ZWN1dGlvbiA9IHRydWU7XG5cdFx0XHRcdFx0dG9vbFRlcm1pbmFsLmlzQmFja2dyb3VuZCA9IHRydWU7XG5cdFx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YS5kaWRDb250aW51ZUluQmFja2dyb3VuZCA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5fc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmRlbGV0ZShjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9hc3NvY2lhdGVQcm9jZXNzSWRXaXRoU2Vzc2lvbih0b29sVGVybWluYWwuaW5zdGFuY2UsIGNoYXRTZXNzaW9uUmVzb3VyY2UsIHRlcm1JZCwgdG9vbFRlcm1pbmFsLnNoZWxsSW50ZWdyYXRpb25RdWFsaXR5LCB0cnVlKTtcblx0XHRcdFx0XHRjb25zdCBpZGxlU2lsZW5jZU91dHB1dCA9IGV4ZWN1dGlvbi5nZXRPdXRwdXQoKTtcblx0XHRcdFx0XHRvdXRwdXRMaW5lQ291bnQgPSBpZGxlU2lsZW5jZU91dHB1dCA/IGNvdW50KGlkbGVTaWxlbmNlT3V0cHV0LnRyaW0oKSwgJ1xcbicpICsgMSA6IDA7XG5cdFx0XHRcdFx0dGVybWluYWxSZXN1bHQgPSBpZGxlU2lsZW5jZU91dHB1dCA/PyAnJztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBleGVjdXRlUmVzdWx0ID0gcmFjZVJlc3VsdC5yZXN1bHQ7XG5cdFx0XHRcdFx0Ly8gUmVzZXQgdXNlciBpbnB1dCBzdGF0ZSBhZnRlciBjb21tYW5kIGV4ZWN1dGlvbiBjb21wbGV0ZXNcblx0XHRcdFx0XHR0b29sVGVybWluYWwucmVjZWl2ZWRVc2VySW5wdXQgPSBmYWxzZTtcblx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChleGVjdXRlUmVzdWx0LmRpZEVudGVyQWx0QnVmZmVyKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRvb2xTcGVjaWZpY0RhdGEudGVybWluYWxDb21tYW5kU3RhdGUgPz8ge307XG5cdFx0XHRcdFx0XHRzdGF0ZS50aW1lc3RhbXAgPSBzdGF0ZS50aW1lc3RhbXAgPz8gdGltaW5nU3RhcnQ7XG5cdFx0XHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhLnRlcm1pbmFsQ29tbWFuZFN0YXRlID0gc3RhdGU7XG5cdFx0XHRcdFx0XHR0b29sUmVzdWx0TWVzc2FnZSA9IGFsdEJ1ZmZlck1lc3NhZ2U7XG5cdFx0XHRcdFx0XHRvdXRwdXRMaW5lQ291bnQgPSAwO1xuXHRcdFx0XHRcdFx0ZXJyb3IgPSBleGVjdXRlUmVzdWx0LmVycm9yID8/ICdhbHRlcm5hdGVCdWZmZXInO1xuXHRcdFx0XHRcdFx0Y29uc3QgYWx0QnVmZmVyQ3dkID0gYXdhaXQgdG9vbFRlcm1pbmFsLmluc3RhbmNlLmdldEN3ZFJlc291cmNlKCk7XG5cdFx0XHRcdFx0XHRhbHRCdWZmZXJSZXN1bHQgPSB7XG5cdFx0XHRcdFx0XHRcdHRvb2xSZXN1bHRNZXNzYWdlLFxuXHRcdFx0XHRcdFx0XHR0b29sTWV0YWRhdGE6IHtcblx0XHRcdFx0XHRcdFx0XHRleGl0Q29kZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdGlkOiB0ZXJtSWQsXG5cdFx0XHRcdFx0XHRcdFx0dGVybWluYWxJZDogdG9vbFRlcm1pbmFsLmluc3RhbmNlLmluc3RhbmNlSWQsXG5cdFx0XHRcdFx0XHRcdFx0Y3dkOiBhbHRCdWZmZXJDd2Q/LnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdFx0XHRcdHZhbHVlOiBhbHRCdWZmZXJNZXNzYWdlLFxuXHRcdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fY29tbWFuZEFydGlmYWN0Q29sbGVjdG9yLmNhcHR1cmUodG9vbFNwZWNpZmljRGF0YSwgdG9vbFRlcm1pbmFsLmluc3RhbmNlLCBjb21tYW5kSWQpO1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRvb2xTcGVjaWZpY0RhdGEudGVybWluYWxDb21tYW5kU3RhdGUgPz8ge307XG5cdFx0XHRcdFx0XHRcdHN0YXRlLnRpbWVzdGFtcCA9IHN0YXRlLnRpbWVzdGFtcCA/PyB0aW1pbmdTdGFydDtcblx0XHRcdFx0XHRcdFx0aWYgKGV4ZWN1dGVSZXN1bHQuZXhpdENvZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRcdHN0YXRlLmV4aXRDb2RlID0gZXhlY3V0ZVJlc3VsdC5leGl0Q29kZTtcblx0XHRcdFx0XHRcdFx0XHRpZiAoc3RhdGUudGltZXN0YW1wICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHN0YXRlLmR1cmF0aW9uID0gc3RhdGUuZHVyYXRpb24gPz8gTWF0aC5tYXgoMCwgRGF0ZS5ub3coKSAtIHN0YXRlLnRpbWVzdGFtcCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGEudGVybWluYWxDb21tYW5kU3RhdGUgPSBzdGF0ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBSdW5JblRlcm1pbmFsVG9vbDogRmluaXNoZWQgXFxgJHtleGVjdXRpb24uc3RyYXRlZ3kudHlwZX1cXGAgZXhlY3V0ZSBzdHJhdGVneSB3aXRoIGV4aXRDb2RlIFxcYCR7ZXhlY3V0ZVJlc3VsdC5leGl0Q29kZX1cXGAsIHJlc3VsdC5sZW5ndGggXFxgJHtleGVjdXRlUmVzdWx0Lm91dHB1dD8ubGVuZ3RofVxcYCwgZXJyb3IgXFxgJHtleGVjdXRlUmVzdWx0LmVycm9yfVxcYGApO1xuXHRcdFx0XHRcdFx0b3V0cHV0TGluZUNvdW50ID0gZXhlY3V0ZVJlc3VsdC5vdXRwdXQgPT09IHVuZGVmaW5lZCA/IDAgOiBjb3VudChleGVjdXRlUmVzdWx0Lm91dHB1dC50cmltKCksICdcXG4nKSArIDE7XG5cdFx0XHRcdFx0XHRleGl0Q29kZSA9IGV4ZWN1dGVSZXN1bHQuZXhpdENvZGU7XG5cdFx0XHRcdFx0XHRlcnJvciA9IGV4ZWN1dGVSZXN1bHQuZXJyb3I7XG5cblx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdEFycjogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0XHRcdGlmIChleGVjdXRlUmVzdWx0Lm91dHB1dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdEFyci5wdXNoKGV4ZWN1dGVSZXN1bHQub3V0cHV0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChleGVjdXRlUmVzdWx0LmFkZGl0aW9uYWxJbmZvcm1hdGlvbikge1xuXHRcdFx0XHRcdFx0XHRyZXN1bHRBcnIucHVzaChleGVjdXRlUmVzdWx0LmFkZGl0aW9uYWxJbmZvcm1hdGlvbik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0ZXJtaW5hbFJlc3VsdCA9IHJlc3VsdEFyci5qb2luKCdcXG5cXG4nKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBIYW5kbGUgdGltZW91dCBjYXNlIC0gZ2V0IG91dHB1dCBjb2xsZWN0ZWQgc28gZmFyIGFuZCByZXR1cm4gaXRcblx0XHRcdGlmIChkaWRUaW1lb3V0ICYmIGUgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogVGltZW91dCByZWFjaGVkLCByZXR1cm5pbmcgb3V0cHV0IGNvbGxlY3RlZCBzbyBmYXJgKTtcblx0XHRcdFx0ZXJyb3IgPSAndGltZW91dCc7XG5cdFx0XHRcdGlzQmFja2dyb3VuZEV4ZWN1dGlvbiA9IHRydWU7XG5cdFx0XHRcdHRvb2xUZXJtaW5hbC5pc0JhY2tncm91bmQgPSB0cnVlO1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhLmRpZENvbnRpbnVlSW5CYWNrZ3JvdW5kID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmRlbGV0ZShjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0Y29uc3QgdGltZW91dE91dHB1dCA9IGdldE91dHB1dCh0b29sVGVybWluYWwuaW5zdGFuY2UsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdG91dHB1dExpbmVDb3VudCA9IHRpbWVvdXRPdXRwdXQgPyBjb3VudCh0aW1lb3V0T3V0cHV0LnRyaW0oKSwgJ1xcbicpICsgMSA6IDA7XG5cdFx0XHRcdHRlcm1pbmFsUmVzdWx0ID0gdGltZW91dE91dHB1dCA/PyAnJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBUaHJldyBleGNlcHRpb25gKTtcblx0XHRcdFx0Ly8gQ2FwdHVyZSBvdXRwdXQgc25hcHNob3QgYmVmb3JlIGRpc3Bvc2luZyBvbiBjYW5jZWxsYXRpb25cblx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcikge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2NvbW1hbmRBcnRpZmFjdENvbGxlY3Rvci5jYXB0dXJlKHRvb2xTcGVjaWZpY0RhdGEsIHRvb2xUZXJtaW5hbC5pbnN0YW5jZSwgY29tbWFuZElkKTtcblx0XHRcdFx0XHQvLyBNYXJrIHRoZSBjb21tYW5kIGFzIGNhbmNlbGxlZCBpZiBpdCBoYXNuJ3QgZmluaXNoZWQgeWV0XG5cdFx0XHRcdFx0Ly8gVGhpcyBlbnN1cmVzIHRoZSBkZWNvcmF0aW9uIHNob3dzIGEgZmFpbHVyZSBpY29uIGluc3RlYWQgb2YgcnVubmluZ1xuXHRcdFx0XHRcdGNvbnN0IHN0YXRlID0gdG9vbFNwZWNpZmljRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZSA/PyB7fTtcblx0XHRcdFx0XHRpZiAoc3RhdGUuZXhpdENvZGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0c3RhdGUuZXhpdENvZGUgPSAtMTtcblx0XHRcdFx0XHRcdHN0YXRlLnRpbWVzdGFtcCA9IHN0YXRlLnRpbWVzdGFtcCA/PyB0aW1pbmdTdGFydDtcblx0XHRcdFx0XHRcdHN0YXRlLmR1cmF0aW9uID0gc3RhdGUuZHVyYXRpb24gPz8gTWF0aC5tYXgoMCwgRGF0ZS5ub3coKSAtIHN0YXRlLnRpbWVzdGFtcCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGEudGVybWluYWxDb21tYW5kU3RhdGUgPSBzdGF0ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBDbGVhbiB1cCB0aGUgZXhlY3V0aW9uIG9uIGVycm9yXG5cdFx0XHRcdFJ1bkluVGVybWluYWxUb29sLl9hY3RpdmVFeGVjdXRpb25zLmdldCh0ZXJtSWQpPy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX2RlbGV0ZUFjdGl2ZUV4ZWN1dGlvbih0ZXJtSWQpO1xuXHRcdFx0XHR0b29sVGVybWluYWwuaW5zdGFuY2UuZGlzcG9zZSgpO1xuXHRcdFx0XHRlcnJvciA9IGUgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvciA/ICdjYW5jZWxlZCcgOiAndW5leHBlY3RlZEV4Y2VwdGlvbic7XG5cdFx0XHRcdHRocm93IGU7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRpbWVvdXRQcm9taXNlPy5jYW5jZWwoKTtcblx0XHRcdGlmICgoaXNCYWNrZ3JvdW5kRXhlY3V0aW9uIHx8IGRpZElucHV0TmVlZGVkKSAmJiBleGVjdXRpb25Qcm9taXNlKSB7XG5cdFx0XHRcdC8vIEJhY2tncm91bmQgdGVybWluYWwgKHN0YXJ0ZWQgYXMgYmcgb3IgbW92ZWQgdG8gYmcpIG9yIGZvcmVncm91bmRcblx0XHRcdFx0Ly8gdGVybWluYWwgd2FpdGluZyBmb3IgaW5wdXQgLSBhdHRhY2ggZXJyb3IgaGFuZGxlciBzaW5jZSB3ZSB3b24ndCBhd2FpdCBpdC5cblx0XHRcdFx0ZXhlY3V0aW9uUHJvbWlzZS5jYXRjaCgoZTogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRcdGlmICghKGUgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcikpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFJ1bkluVGVybWluYWxUb29sOiBCYWNrZ3JvdW5kIGV4ZWN1dGlvbiBlcnJvcmAsIGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdC8vIFJlZ2lzdGVyIGEgbGlzdGVuZXIgdG8gbm90aWZ5IHRoZSBhZ2VudCB3aGVuIGNvbW1hbmRzIGNvbXBsZXRlIGluIHRoaXNcblx0XHRcdFx0Ly8gYmFja2dyb3VuZCB0ZXJtaW5hbCwgYW5kIGNvbnRpbnVlIHRoZSBvdXRwdXQgbW9uaXRvciBmb3IgcHJvbXB0LWZvci1pbnB1dCBkZXRlY3Rpb24uXG5cdFx0XHRcdGlmIChzaG91bGRTZW5kTm90aWZpY2F0aW9ucykge1xuXHRcdFx0XHRcdC8vIElmIHRoZSBmb3JlZ3JvdW5kIHRvb2wganVzdCByZXR1cm5lZCB2aWEgdGhlIGlucHV0TmVlZGVkIHJhY2UsIHRoZVxuXHRcdFx0XHRcdC8vIGFnZW50IGhhcyBhbHJlYWR5IHJlY2VpdmVkIGB0ZXJtaW5hbFJlc3VsdGAgYXMgdGhlIHRvb2wgcmVzdWx0LiBTZWVkXG5cdFx0XHRcdFx0Ly8gdGhlIEJHIGRlZHVwIHNvIHRoZSBPdXRwdXRNb25pdG9yJ3MgaW1tZWRpYXRlIHJlLWRldGVjdGlvbiBvZiB0aGVcblx0XHRcdFx0XHQvLyBzYW1lIHByb21wdCBkb2VzIG5vdCBzZW5kIGEgcmVkdW5kYW50IHN0ZWVyaW5nIG1lc3NhZ2UgdGhhdCB3b3VsZFxuXHRcdFx0XHRcdC8vIHlpZWxkIHRoZSBhZ2VudCdzIGluLWZsaWdodCBgc2VuZF90b190ZXJtaW5hbGAgcmVzcG9uc2UuXG5cdFx0XHRcdFx0Y29uc3QgYWxyZWFkeU5vdGlmaWVkSW5wdXROZWVkZWRPdXRwdXQgPSBkaWRJbnB1dE5lZWRlZCA/IHRlcm1pbmFsUmVzdWx0IDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyQ29tcGxldGlvbk5vdGlmaWNhdGlvbih0b29sVGVybWluYWwuaW5zdGFuY2UsIHRlcm1JZCwgY2hhdFNlc3Npb25SZXNvdXJjZSwgY29tbWFuZCwgdG9vbFNwZWNpZmljRGF0YSwgb3V0cHV0TW9uaXRvciwgYWxyZWFkeU5vdGlmaWVkSW5wdXROZWVkZWRPdXRwdXQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG91dHB1dE1vbml0b3I/LmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gRm9yZWdyb3VuZCBjb21wbGV0ZWQgb3IgZXJyb3IgLSBjbGVhbiB1cCBleGVjdXRpb24gYW5kIG91dHB1dCBtb25pdG9yXG5cdFx0XHRcdFJ1bkluVGVybWluYWxUb29sLl9hY3RpdmVFeGVjdXRpb25zLmdldCh0ZXJtSWQpPy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX2RlbGV0ZUFjdGl2ZUV4ZWN1dGlvbih0ZXJtSWQpO1xuXHRcdFx0XHRvdXRwdXRNb25pdG9yPy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRjb25zdCB0aW1pbmdFeGVjdXRlTXMgPSBEYXRlLm5vdygpIC0gdGltaW5nU3RhcnQ7XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnkubG9nSW52b2tlKHRvb2xUZXJtaW5hbC5pbnN0YW5jZSwge1xuXHRcdFx0XHR0ZXJtaW5hbFRvb2xTZXNzaW9uSWQ6IHRvb2xTcGVjaWZpY0RhdGEudGVybWluYWxUb29sU2Vzc2lvbklkLFxuXHRcdFx0XHRkaWRVc2VyRWRpdENvbW1hbmQsXG5cdFx0XHRcdGRpZFRvb2xFZGl0Q29tbWFuZCxcblx0XHRcdFx0aXNCYWNrZ3JvdW5kOiBleGVjdXRpb25PcHRpb25zLnBlcnNpc3RlbnRTZXNzaW9uLFxuXHRcdFx0XHRpc1NhbmRib3hXcmFwcGVkOiB0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLmlzU2FuZGJveFdyYXBwZWQgPT09IHRydWUsXG5cdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbjogYXJncy5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24sXG5cdFx0XHRcdHNoZWxsSW50ZWdyYXRpb25RdWFsaXR5OiB0b29sVGVybWluYWwuc2hlbGxJbnRlZ3JhdGlvblF1YWxpdHksXG5cdFx0XHRcdGVycm9yLFxuXHRcdFx0XHRpc05ld1Nlc3Npb24sXG5cdFx0XHRcdG91dHB1dExpbmVDb3VudCxcblx0XHRcdFx0ZXhpdENvZGUsXG5cdFx0XHRcdHRpbWluZ0V4ZWN1dGVNcyxcblx0XHRcdFx0dGltaW5nQ29ubmVjdE1zLFxuXHRcdFx0XHRpbnB1dFVzZXJDaGFycyxcblx0XHRcdFx0aW5wdXRVc2VyU2lnaW50LFxuXHRcdFx0XHR0ZXJtaW5hbEV4ZWN1dGlvbklkbGVCZWZvcmVUaW1lb3V0OiBwb2xsaW5nUmVzdWx0Py5zdGF0ZSA9PT0gT3V0cHV0TW9uaXRvclN0YXRlLklkbGUsXG5cdFx0XHRcdHBvbGxEdXJhdGlvbk1zOiBwb2xsaW5nUmVzdWx0Py5wb2xsRHVyYXRpb25Ncyxcblx0XHRcdFx0aW5wdXRUb29sTWFudWFsQWNjZXB0Q291bnQ6IG91dHB1dE1vbml0b3I/Lm91dHB1dE1vbml0b3JUZWxlbWV0cnlDb3VudGVycz8uaW5wdXRUb29sTWFudWFsQWNjZXB0Q291bnQsXG5cdFx0XHRcdGlucHV0VG9vbE1hbnVhbFJlamVjdENvdW50OiBvdXRwdXRNb25pdG9yPy5vdXRwdXRNb25pdG9yVGVsZW1ldHJ5Q291bnRlcnM/LmlucHV0VG9vbE1hbnVhbFJlamVjdENvdW50LFxuXHRcdFx0XHRpbnB1dFRvb2xNYW51YWxDaGFyczogb3V0cHV0TW9uaXRvcj8ub3V0cHV0TW9uaXRvclRlbGVtZXRyeUNvdW50ZXJzPy5pbnB1dFRvb2xNYW51YWxDaGFycyxcblx0XHRcdFx0aW5wdXRUb29sQXV0b0FjY2VwdENvdW50OiBvdXRwdXRNb25pdG9yPy5vdXRwdXRNb25pdG9yVGVsZW1ldHJ5Q291bnRlcnM/LmlucHV0VG9vbEF1dG9BY2NlcHRDb3VudCxcblx0XHRcdFx0aW5wdXRUb29sQXV0b0NoYXJzOiBvdXRwdXRNb25pdG9yPy5vdXRwdXRNb25pdG9yVGVsZW1ldHJ5Q291bnRlcnM/LmlucHV0VG9vbEF1dG9DaGFycyxcblx0XHRcdFx0aW5wdXRUb29sTWFudWFsU2hvd25Db3VudDogb3V0cHV0TW9uaXRvcj8ub3V0cHV0TW9uaXRvclRlbGVtZXRyeUNvdW50ZXJzPy5pbnB1dFRvb2xNYW51YWxTaG93bkNvdW50LFxuXHRcdFx0XHRpbnB1dFRvb2xGcmVlRm9ybUlucHV0Q291bnQ6IG91dHB1dE1vbml0b3I/Lm91dHB1dE1vbml0b3JUZWxlbWV0cnlDb3VudGVycz8uaW5wdXRUb29sRnJlZUZvcm1JbnB1dENvdW50LFxuXHRcdFx0XHRpbnB1dFRvb2xGcmVlRm9ybUlucHV0U2hvd25Db3VudDogb3V0cHV0TW9uaXRvcj8ub3V0cHV0TW9uaXRvclRlbGVtZXRyeUNvdW50ZXJzPy5pbnB1dFRvb2xGcmVlRm9ybUlucHV0U2hvd25Db3VudFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKGFsdEJ1ZmZlclJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIGFsdEJ1ZmZlclJlc3VsdDtcblx0XHR9XG5cblx0XHRpZiAoZGlkU2FuZGJveFdyYXBDb21tYW5kICYmIG91dHB1dExvb2tzQnViYmxld3JhcEhvc3RSZXN0cmljdGVkKHRlcm1pbmFsUmVzdWx0KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dldEJ1YmJsZXdyYXBIb3N0UmVzdHJpY3RlZFJlc3VsdCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNob3VsZEF1dG9SZXRyeVVuc2FuZGJveGVkID0gc2hvdWxkQXV0b21hdGljYWxseVJldHJ5VW5zYW5kYm94ZWQoe1xuXHRcdFx0YWxsb3dVbnNhbmRib3hlZENvbW1hbmRzLFxuXHRcdFx0ZGlkU2FuZGJveFdyYXBDb21tYW5kLFxuXHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uOiBhcmdzLnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiA9PT0gdHJ1ZSxcblx0XHRcdGlzUGVyc2lzdGVudFNlc3Npb246IGV4ZWN1dGlvbk9wdGlvbnMucGVyc2lzdGVudFNlc3Npb24sXG5cdFx0XHRpc0JhY2tncm91bmRFeGVjdXRpb246IGlzQmFja2dyb3VuZEV4ZWN1dGlvbiB8fCBkaWRJbnB1dE5lZWRlZCxcblx0XHRcdGRpZFRpbWVvdXQsXG5cdFx0XHRleGl0Q29kZSxcblx0XHRcdG91dHB1dDogdGVybWluYWxSZXN1bHQsXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2hvdWxkQXV0b1JldHJ5QWxsb3dOZXR3b3JrID0gc2hvdWxkQXV0b21hdGljYWxseVJldHJ5QWxsb3dOZXR3b3JrSW5TYW5kYm94ZWQoe1xuXHRcdFx0cmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHM6IGlzU2FuZGJveEVuYWJsZWQgJiYgIWlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQgJiYgdGhpcy5fcmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMsXG5cdFx0XHRkaWRTYW5kYm94V3JhcENvbW1hbmQsXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IGFyZ3MucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uID09PSB0cnVlLFxuXHRcdFx0cmVxdWVzdEFsbG93TmV0d29yazogYXJncy5yZXF1ZXN0QWxsb3dOZXR3b3JrID09PSB0cnVlLFxuXHRcdFx0aXNQZXJzaXN0ZW50U2Vzc2lvbjogZXhlY3V0aW9uT3B0aW9ucy5wZXJzaXN0ZW50U2Vzc2lvbixcblx0XHRcdGlzQmFja2dyb3VuZEV4ZWN1dGlvbjogaXNCYWNrZ3JvdW5kRXhlY3V0aW9uIHx8IGRpZElucHV0TmVlZGVkLFxuXHRcdFx0ZGlkVGltZW91dCxcblx0XHRcdGV4aXRDb2RlLFxuXHRcdFx0b3V0cHV0OiB0ZXJtaW5hbFJlc3VsdCxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGF1dG9tYXRpY1NhbmRib3hSZXRyeSA9IHNob3VsZEF1dG9SZXRyeUFsbG93TmV0d29ya1xuXHRcdFx0PyB7IHJldHJ5S2luZDogJ2FsbG93TmV0d29yaycgYXMgY29uc3QsIHJldHJ5UmVhc29uOiBhdXRvbWF0aWNBbGxvd05ldHdvcmtSZXRyeVJlYXNvbiB9XG5cdFx0XHQ6IHNob3VsZEF1dG9SZXRyeVVuc2FuZGJveGVkXG5cdFx0XHRcdD8geyByZXRyeUtpbmQ6ICd1bnNhbmRib3hlZCcgYXMgY29uc3QsIHJldHJ5UmVhc29uOiBhdXRvbWF0aWNVbnNhbmRib3hSZXRyeVJlYXNvbiB9XG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGlmIChhdXRvbWF0aWNTYW5kYm94UmV0cnkpIHtcblx0XHRcdGNvbnN0IHJldHJ5UmVzdWx0ID0gYXdhaXQgdGhpcy5fcnVuQXV0b21hdGljU2FuZGJveFJldHJ5KHtcblx0XHRcdFx0Li4uYXV0b21hdGljU2FuZGJveFJldHJ5LFxuXHRcdFx0XHRpbnZvY2F0aW9uLFxuXHRcdFx0XHRjb3VudFRva2VuczogX2NvdW50VG9rZW5zLFxuXHRcdFx0XHRwcm9ncmVzczogX3Byb2dyZXNzLFxuXHRcdFx0XHR0b2tlbixcblx0XHRcdFx0YXJncyxcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdFx0Y29tbWFuZCxcblx0XHRcdFx0YWxsb3dVbnNhbmRib3hlZENvbW1hbmRzLFxuXHRcdFx0XHRpc0JhY2tncm91bmQ6IGV4ZWN1dGlvbk9wdGlvbnMucGVyc2lzdGVudFNlc3Npb24sXG5cdFx0XHR9KTtcblx0XHRcdGlmIChyZXRyeVJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gcmV0cnlSZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmUtY2hlY2sgc2hlbGwgaW50ZWdyYXRpb24gcXVhbGl0eSBub3cgdGhhdCBjb21tYW5kIGV4ZWN1dGlvbiBoYXMgY29tcGxldGVkLlxuXHRcdC8vIE9ubHkgc2V0IHRoZSBiYW5uZXIgaWYgdG9vbFJlc3VsdE1lc3NhZ2UgaGFzbid0IGFscmVhZHkgYmVlbiBzZXQgKGUuZy4gYnkgdGhlIGFsdC1idWZmZXIgcGF0aCkuXG5cdFx0dGhpcy5fdGVybWluYWxUb29sQ3JlYXRvci5yZWZyZXNoU2hlbGxJbnRlZ3JhdGlvblF1YWxpdHkodG9vbFRlcm1pbmFsKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFJ1bkluVGVybWluYWxUb29sOiBzaGVsbEludGVncmF0aW9uUXVhbGl0eT0ke3Rvb2xUZXJtaW5hbC5zaGVsbEludGVncmF0aW9uUXVhbGl0eX0gYXQgYmFubmVyIGRlY2lzaW9uIHRpbWVgKTtcblx0XHRpZiAoIXRvb2xSZXN1bHRNZXNzYWdlICYmIHRvb2xUZXJtaW5hbC5zaGVsbEludGVncmF0aW9uUXVhbGl0eSA9PT0gU2hlbGxJbnRlZ3JhdGlvblF1YWxpdHkuTm9uZSkge1xuXHRcdFx0dG9vbFJlc3VsdE1lc3NhZ2UgPSAnJChpbmZvKSBFbmFibGUgW3NoZWxsIGludGVncmF0aW9uXShodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL3Rlcm1pbmFsL3NoZWxsLWludGVncmF0aW9uKSB0byBpbXByb3ZlIGNvbW1hbmQgZGV0ZWN0aW9uJztcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHRUZXh0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmICghZGlkU2FuZGJveFdyYXBDb21tYW5kKSB7XG5cdFx0XHRpZiAoZGlkVXNlckVkaXRDb21tYW5kKSB7XG5cdFx0XHRcdHJlc3VsdFRleHQucHVzaChgTm90ZTogVGhlIHVzZXIgbWFudWFsbHkgZWRpdGVkIHRoZSBjb21tYW5kIHRvIFxcYCR7Y29tbWFuZH1cXGAgKHRlcm1pbmFsIElEPSR7dGVybUlkfSksIGFuZCB0aGlzIGlzIHRoZSBvdXRwdXQgb2YgcnVubmluZyB0aGF0IGNvbW1hbmQgaW5zdGVhZDpcXG5gKTtcblx0XHRcdH0gZWxzZSBpZiAoZGlkVG9vbEVkaXRDb21tYW5kKSB7XG5cdFx0XHRcdC8vIElmIHRoZSB0b29sIHdyYXBwZWQgdGhlIGNvbW1hbmQgd2l0aCBgbm9odXBgIChQT1NJWCkgb3IgYFN0YXJ0LVByb2Nlc3NgXG5cdFx0XHRcdC8vIChXaW5kb3dzKSB0byBkZXRhY2ggYSBiYWNrZ3JvdW5kIHByb2Nlc3MsIHN0ZGluIGlzIG5vIGxvbmdlciBjb25uZWN0ZWQuXG5cdFx0XHRcdC8vIFRlbGwgdGhlIG1vZGVsIHNvIGl0IGRvZXMgbm90IHRyeSB0byBkcml2ZSBpbnRlcmFjdGl2ZSBwcm9ncmFtcyB0aHJvdWdoIGl0LlxuXHRcdFx0XHRjb25zdCB3YXNEZXRhY2hlZFRvQmFja2dyb3VuZCA9IC8oXnxcXHMpbm9odXBcXHN8U3RhcnQtUHJvY2Vzc1xcYi8udGVzdChjb21tYW5kKTtcblx0XHRcdFx0Y29uc3Qgc3RkaW5IaW50ID0gd2FzRGV0YWNoZWRUb0JhY2tncm91bmRcblx0XHRcdFx0XHQ/ICcgTm90ZSB0aGF0IHN0ZGluIGlzIGNsb3NlZCBmb3IgZGV0YWNoZWQgYmFja2dyb3VuZCBwcm9jZXNzZXM7IGRvIG5vdCB0cnkgdG8gc2VuZCBpbnB1dCB2aWEgc2VuZF90b190ZXJtaW5hbCBcdTIwMTQgcmUtcnVuIHdpdGggbW9kZT1cInN5bmNcIiBpbnN0ZWFkIGlmIGludGVyYWN0aXZlIGlucHV0IGlzIHJlcXVpcmVkLidcblx0XHRcdFx0XHQ6ICcnO1xuXHRcdFx0XHRyZXN1bHRUZXh0LnB1c2goYE5vdGU6IFRoZSB0b29sIHNpbXBsaWZpZWQgdGhlIGNvbW1hbmQgdG8gXFxgJHtjb21tYW5kfVxcYCAodGVybWluYWwgSUQ9JHt0ZXJtSWR9KS4ke3N0ZGluSGludH0gVGhpcyBpcyB0aGUgb3V0cHV0IG9mIHJ1bm5pbmcgdGhhdCBjb21tYW5kIGluc3RlYWQ6XFxuYCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNCYWNrZ3JvdW5kRXhlY3V0aW9uICYmICFleGVjdXRpb25PcHRpb25zLnBlcnNpc3RlbnRTZXNzaW9uKSB7XG5cdFx0XHRcdHJlc3VsdFRleHQucHVzaChgTm90ZTogVGhpcyB0ZXJtaW5hbCBleGVjdXRpb24gd2FzIG1vdmVkIHRvIHRoZSBiYWNrZ3JvdW5kIHVzaW5nIHRoZSBJRCAke3Rlcm1JZH1cXG5gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGRpZFNlbnNpdGl2ZUF1dG9DYW5jZWxsZWQpIHtcblx0XHRcdHJlc3VsdFRleHQucHVzaChgTm90ZTogVGhlIGNvbW1hbmQgaW4gdGVybWluYWwgSUQgJHt0ZXJtSWR9IHdhcyBwcm9tcHRpbmcgZm9yIGEgcGFzc3dvcmQsIHBhc3NwaHJhc2UsIG9yIG90aGVyIHNlY3JldC4gVGhlIHVzZXIgaXMgdW5hdmFpbGFibGUgKGF1dG8tYXBwcm92ZSAvIGF1dG9waWxvdCBtb2RlIGlzIG9uLCBzbyBubyBodW1hbiBjYW4gZm9jdXMgdGhlIHRlcm1pbmFsIHRvIHR5cGUgYSBzZWNyZXQpIGFuZCB0aGUgY29tbWFuZCBoYXMgYmVlbiBjYW5jZWxsZWQuIFN0b3AsIGRvIE5PVCByZXRyeSB0aGUgY29tbWFuZCwgZG8gTk9UIGNhbGwgJHtUZXJtaW5hbFRvb2xJZC5TZW5kVG9UZXJtaW5hbH0sIGFuZCBkbyBOT1QgY2FsbCB2c2NvZGVfYXNrUXVlc3Rpb25zIGZvciB0aGUgc2VjcmV0LiBUZWxsIHRoZSB1c2VyIHRvIHJ1biB0aGUgY29tbWFuZCBpbnRlcmFjdGl2ZWx5IHdoZW4gdGhleSBhcmUgYXZhaWxhYmxlLlxcblxcbmApO1xuXHRcdH0gZWxzZSBpZiAoZGlkSW5wdXROZWVkZWQpIHtcblx0XHRcdHJlc3VsdFRleHQucHVzaChgTm90ZTogVGhlIGNvbW1hbmQgaXMgcnVubmluZyBpbiB0ZXJtaW5hbCBJRCAke3Rlcm1JZH0gYW5kIG1heSBiZSB3YWl0aW5nIGZvciBpbnB1dC5cXG4ke3RoaXMuX2J1aWxkSW5wdXROZWVkZWRTdGVlcmluZ1RleHQoY2hhdFNlc3Npb25SZXNvdXJjZSwgdGVybUlkLCAnbm9uZScpfVxcblxcbmApO1xuXHRcdH0gZWxzZSBpZiAoZGlkVGltZW91dCAmJiB0aW1lb3V0VmFsdWUgIT09IHVuZGVmaW5lZCAmJiB0aW1lb3V0VmFsdWUgPiAwKSB7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25IaW50ID0gc2hvdWxkU2VuZE5vdGlmaWNhdGlvbnNcblx0XHRcdFx0PyAnIFlvdSB3aWxsIGJlIGF1dG9tYXRpY2FsbHkgbm90aWZpZWQgb24geW91ciBuZXh0IHR1cm4gd2hlbiBpdCBjb21wbGV0ZXMuJ1xuXHRcdFx0XHQ6ICcnO1xuXHRcdFx0cmVzdWx0VGV4dC5wdXNoKGBOb3RlOiBDb21tYW5kIHRpbWVkIG91dCBhZnRlciAke3RpbWVvdXRWYWx1ZX1tcy4gVGhlIGNvbW1hbmQgbWF5IHN0aWxsIGJlIHJ1bm5pbmcgaW4gdGVybWluYWwgSUQgJHt0ZXJtSWR9LiR7bm90aWZpY2F0aW9uSGludH1cXG4ke3RoaXMuX2J1aWxkSW5wdXROZWVkZWRTdGVlcmluZ1RleHQoY2hhdFNlc3Npb25SZXNvdXJjZSwgdGVybUlkLCAndGltZW91dCcpfVxcblxcbmApO1xuXHRcdH0gZWxzZSBpZiAoZGlkSWRsZVNpbGVuY2UpIHtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbkhpbnQgPSBzaG91bGRTZW5kTm90aWZpY2F0aW9uc1xuXHRcdFx0XHQ/ICcgWW91IHdpbGwgYmUgYXV0b21hdGljYWxseSBub3RpZmllZCBvbiB5b3VyIG5leHQgdHVybiB3aGVuIGl0IGNvbXBsZXRlcy4nXG5cdFx0XHRcdDogJyc7XG5cdFx0XHRyZXN1bHRUZXh0LnB1c2goYE5vdGU6IFRoZSBjb21tYW5kIHByb2R1Y2VkIG5vIG5ldyBvdXRwdXQgZm9yIGFuIGV4dGVuZGVkIHBlcmlvZCBhbmQgd2FzIG1vdmVkIHRvIGJhY2tncm91bmQgdGVybWluYWwgSUQgJHt0ZXJtSWR9OyB0aGUgcHJvY2VzcyBpcyBzdGlsbCBydW5uaW5nIGFuZCBoYXMgbm90IGJlZW4ga2lsbGVkLiR7bm90aWZpY2F0aW9uSGludH1cXG4ke3RoaXMuX2J1aWxkSW5wdXROZWVkZWRTdGVlcmluZ1RleHQoY2hhdFNlc3Npb25SZXNvdXJjZSwgdGVybUlkLCAnaWRsZVNpbGVuY2UnKX1cXG5cXG5gKTtcblx0XHR9XG5cdFx0Y29uc3Qgb3V0cHV0QW5hbHl6ZXJNZXNzYWdlID0gYXdhaXQgdGhpcy5fZ2V0T3V0cHV0QW5hbHl6ZXJNZXNzYWdlKGV4aXRDb2RlLCB0ZXJtaW5hbFJlc3VsdCwgY29tbWFuZCwgZGlkU2FuZGJveFdyYXBDb21tYW5kKTtcblx0XHRpZiAob3V0cHV0QW5hbHl6ZXJNZXNzYWdlKSB7XG5cdFx0XHRyZXN1bHRUZXh0LnB1c2goYCR7b3V0cHV0QW5hbHl6ZXJNZXNzYWdlfVxcbmApO1xuXHRcdH1cblx0XHRsZXQgb3V0cHV0Rm9yUmVzdWx0ID0gdGVybWluYWxSZXN1bHQ7XG5cdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuT3V0cHV0Q29tcGFjdGlvbikgPT09IHRydWUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRGb3JDb21wYWN0aW9uID0gdG9vbFNwZWNpZmljRGF0YS5jb21tYW5kTGluZS5mb3JEaXNwbGF5ID8/IGNvbW1hbmQ7XG5cdFx0XHRcdGNvbnN0IHJlcG9ydCA9IGNvbXBhY3QoY29tbWFuZEZvckNvbXBhY3Rpb24sIHRlcm1pbmFsUmVzdWx0KTtcblx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5LmxvZ0NvbXBhY3Rpb24ocmVwb3J0KTtcblx0XHRcdFx0aWYgKHJlcG9ydC5hcHBsaWVkKSB7XG5cdFx0XHRcdFx0b3V0cHV0Rm9yUmVzdWx0ID0gcmVwb3J0LmNvbXBhY3RlZE91dHB1dDtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHRoaXMuX3RlbGVtZXRyeS5sb2dDb21wYWN0aW9uRmFpbGVkKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFByb2Nlc3MgbGFyZ2Ugb3V0cHV0OiB3cml0ZSB0byBmaWxlIGlmIG5lZWRlZCwgdGhlbiB0cnVuY2F0ZSB3aXRoIGZpbGUgcGF0aFxuXHRcdGNvbnN0IHByb2Nlc3NlZE91dHB1dCA9IGF3YWl0IHRoaXMuX2xhcmdlT3V0cHV0RmlsZVdyaXRlci5wcm9jZXNzT3V0cHV0KG91dHB1dEZvclJlc3VsdCk7XG5cdFx0cmVzdWx0VGV4dC5wdXNoKHByb2Nlc3NlZE91dHB1dCk7XG5cblx0XHRjb25zdCBpc0Vycm9yID0gZXhpdENvZGUgIT09IHVuZGVmaW5lZCAmJiBleGl0Q29kZSAhPT0gMDtcblx0XHRjb25zdCBlbmRDd2QgPSBhd2FpdCB0b29sVGVybWluYWwuaW5zdGFuY2UuZ2V0Q3dkUmVzb3VyY2UoKTtcblxuXHRcdGNvbnN0IGltYWdlQ29udGVudCA9IGF3YWl0IHRoaXMuX2V4dHJhY3RJbWFnZXNGcm9tT3V0cHV0KHRlcm1pbmFsUmVzdWx0LCBlbmRDd2QpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHRvb2xSZXN1bHRNZXNzYWdlLFxuXHRcdFx0dG9vbE1ldGFkYXRhOiB7XG5cdFx0XHRcdGV4aXRDb2RlOiBleGl0Q29kZSxcblx0XHRcdFx0aWQ6IHRlcm1JZCxcblx0XHRcdFx0dGVybWluYWxJZDogdG9vbFRlcm1pbmFsLmluc3RhbmNlLmluc3RhbmNlSWQsXG5cdFx0XHRcdGN3ZDogZW5kQ3dkPy50b1N0cmluZygpLFxuXHRcdFx0XHR0aW1lZE91dDogZGlkVGltZW91dCB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdHRpbWVvdXRNczogZGlkVGltZW91dCA/IHRpbWVvdXRWYWx1ZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0aW5wdXROZWVkZWQ6IGRpZElucHV0TmVlZGVkIHx8IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHR0b29sUmVzdWx0RGV0YWlsczogaXNFcnJvciA/IHtcblx0XHRcdFx0aW5wdXQ6IGNvbW1hbmQsXG5cdFx0XHRcdG91dHB1dDogW3sgdHlwZTogJ2VtYmVkJywgaXNUZXh0OiB0cnVlLCB2YWx1ZTogb3V0cHV0Rm9yUmVzdWx0IH1dLFxuXHRcdFx0XHRpc0Vycm9yOiB0cnVlXG5cdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdHZhbHVlOiByZXN1bHRUZXh0LmpvaW4oJycpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQuLi5pbWFnZUNvbnRlbnQsXG5cdFx0XHRdXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEJ1YmJsZXdyYXBVbnN1cHBvcnRlZFJlc3VsdCgpOiBJVG9vbFJlc3VsdCB7XG5cdFx0Y29uc3Qgc2V0dGluZ0lkID0gQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWQ7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IGxvY2FsaXplKFxuXHRcdFx0J3J1bkluVGVybWluYWwuYnViYmxld3JhcC51bnN1cHBvcnRlZEVudmlyb25tZW50Jyxcblx0XHRcdFwiU2FuZGJveGluZyBpcyBub3Qgc3VwcG9ydGVkIGluIHRoaXMgZW52aXJvbm1lbnQuIFRvIGRpc2FibGUgc2FuZGJveGluZywgc2V0IGB7MH1gIHRvIGBvZmZgLiBUaGUgY29tbWFuZCB3YXMgbm90IGV4ZWN1dGVkLlwiLFxuXHRcdFx0c2V0dGluZ0lkLFxuXHRcdCk7XG5cdFx0Y29uc3Qgc2V0dGluZ3NDb21tYW5kQXJncyA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShbYEBpZDoke3NldHRpbmdJZH1gXSkpO1xuXHRcdGNvbnN0IHRvb2xSZXN1bHRNZXNzYWdlID0gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKFxuXHRcdFx0J3J1bkluVGVybWluYWwuYnViYmxld3JhcC51bnN1cHBvcnRlZEVudmlyb25tZW50V2l0aFNldHRpbmdzTGluaycsXG5cdFx0XHRcIlNhbmRib3hpbmcgaXMgbm90IHN1cHBvcnRlZCBpbiB0aGlzIGVudmlyb25tZW50LiBbT3BlbiB0aGUgYHswfWAgc2V0dGluZ10oY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncz97MX0gXFxcIk9wZW4gU2V0dGluZ3NcXFwiKSBhbmQgc2V0IGl0IHRvIGBvZmZgLiBUaGUgY29tbWFuZCB3YXMgbm90IGV4ZWN1dGVkLlwiLFxuXHRcdFx0c2V0dGluZ0lkLFxuXHRcdFx0c2V0dGluZ3NDb21tYW5kQXJncyxcblx0XHQpLCB7IGlzVHJ1c3RlZDogeyBlbmFibGVkQ29tbWFuZHM6IFsnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnXSB9IH0pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBtZXNzYWdlIH1dLFxuXHRcdFx0dG9vbFJlc3VsdE1lc3NhZ2UsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEJ1YmJsZXdyYXBIb3N0UmVzdHJpY3RlZFJlc3VsdCgpOiBJVG9vbFJlc3VsdCB7XG5cdFx0Y29uc3Qgc2V0dGluZ0lkID0gQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWQ7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IGxvY2FsaXplKFxuXHRcdFx0J3J1bkluVGVybWluYWwuYnViYmxld3JhcC5ob3N0UmVzdHJpY3Rpb24nLFxuXHRcdFx0XCJTYW5kYm94IGNyZWF0aW9uIGZhaWxlZCBkdWUgdG8gaG9zdCByZXN0cmljdGlvbnMuIFNhbmRib3hpbmcgY2FuIGJlIGRpc2FibGVkIGJ5IHNldHRpbmcgYHswfWAgdG8gYG9mZmAuXCIsXG5cdFx0XHRzZXR0aW5nSWQsXG5cdFx0KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogbWVzc2FnZSB9XSxcblx0XHRcdHRvb2xSZXN1bHRNZXNzYWdlOiBtZXNzYWdlLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGRzIHRoZSBzdGVlcmluZyB0ZXh0IHRoZSBtb2RlbCBzZWVzIHdoZW4gdGhlIHRlcm1pbmFsIHRvb2wgc3VzcGVjdHNcblx0ICogdGhlIGNvbW1hbmQgbWF5IGJlIHdhaXRpbmcgZm9yIGlucHV0LiBUaGUgaGV1cmlzdGljIHRoYXQgdHJpZ2dlcnMgdGhpc1xuXHQgKiBub3RlIGNhbiBmYWxzZS1wb3NpdGl2ZSBvbiBsb25nLXJ1bm5pbmcgY29tcHV0ZSBjb21tYW5kcyBvciBzaGVsbHMgc2l0dGluZ1xuXHQgKiBvbiBhIHNlY29uZGFyeSBwcm9tcHQgKGUuZy4gaGVyZWRvYyBjb250aW51YXRpb24gYD4gYCksIHNvIHRoZSB0ZXh0XG5cdCAqIGV4cGxpY2l0bHk6XG5cdCAqICAgMS4gVGVsbHMgdGhlIG1vZGVsIHRoaXMgbm90ZSBpcyBOT1QgYSBzaWduYWwgdG8gZW5kIHRoZSB0dXJuLlxuXHQgKiAgIDIuIEluIGF1dG8tYXBwcm92ZSBtb2RlLCBsZWFkcyB3aXRoIGBzZW5kX3RvX3Rlcm1pbmFsYCBmb3Igbm9uLXNlY3JldFxuXHQgKiAgICAgIHByb21wdHMgdG8gbWluaW1pemUgcm91bmQtdHJpcHMsIHdpdGggYSBgZ2V0X3Rlcm1pbmFsX291dHB1dGAgZmFsbGJhY2suXG5cdCAqICAgMy4gSW4gZGVmYXVsdCBtb2RlLCBsZWFkcyB3aXRoIGBnZXRfdGVybWluYWxfb3V0cHV0YCBhcyB0aGUgc2FmZVxuXHQgKiAgICAgIHJlY292ZXJ5IGFjdGlvbiBhbmQgb2ZmZXJzIGB2c2NvZGVfYXNrUXVlc3Rpb25zYCBvbmx5IGZvciByZWFsXG5cdCAqICAgICAgbm9uLXNlY3JldCBwcm9tcHRzLiBTZWNyZXQgcHJvbXB0cyAocGFzc3dvcmRzLCBwYXNzcGhyYXNlcyxcblx0ICogICAgICB0b2tlbnMpIG11c3QgbmV2ZXIgYmUgcm91dGVkIHRocm91Z2ggYHZzY29kZV9hc2tRdWVzdGlvbnNgXG5cdCAqICAgICAgYmVjYXVzZSBhbnN3ZXJzIHRvIHRoYXQgdG9vbCBhcmUgc2VudCB0aHJvdWdoIHRoZSBtb2RlbCBcdTIwMTQgdGhlXG5cdCAqICAgICAgdXNlciBpcyB0b2xkIHRvIHR5cGUgdGhvc2UgdmFsdWVzIGRpcmVjdGx5IGludG8gdGhlIHRlcm1pbmFsLlxuXHQgKiBga2lsbF90ZXJtaW5hbGAgaXMgb25seSBhZHZlcnRpc2VkIHdoZW4gdGhlIGNvbW1hbmQgbWF5IGJlIGh1bmdcblx0ICogKGAndGltZW91dCdgIG9yIGAnaWRsZVNpbGVuY2UnYCkgXHUyMDE0IHN1Z2dlc3RpbmcgaXQgaW4gdGhlIGdlbmVyYWwgY2FzZVxuXHQgKiBsZWFkcyB0aGUgbW9kZWwgdG8gdGVybWluYXRlIHZhbGlkIGludGVyYWN0aXZlIHNlc3Npb25zIChlLmcuXG5cdCAqIGBucG0gaW5pdGApIGluc3RlYWQgb2YgZHJpdmluZyB0aGVtLlxuXHQgKi9cblx0cHJpdmF0ZSBfYnVpbGRJbnB1dE5lZWRlZFN0ZWVyaW5nVGV4dChjaGF0U2Vzc2lvblJlc291cmNlOiBVUkksIHRlcm1JZDogc3RyaW5nLCBodW5nSGludDogJ25vbmUnIHwgJ3RpbWVvdXQnIHwgJ2lkbGVTaWxlbmNlJyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgaXNBdXRvQXBwcm92ZWQgPSBpc1Nlc3Npb25BdXRvQXBwcm92ZUxldmVsKGNoYXRTZXNzaW9uUmVzb3VyY2UsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9jaGF0V2lkZ2V0U2VydmljZSwgdGhpcy5fY2hhdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxpbmVzLnB1c2goYFRoaXMgbm90ZSBpcyBub3QgYSBzaWduYWwgdG8gZW5kIHRoZSB0dXJuIFx1MjAxNCBwaWNrIG9uZSBvZiB0aGUgYWN0aW9ucyBiZWxvdyBhbmQgY29udGludWUuYCk7XG5cdFx0aWYgKGlzQXV0b0FwcHJvdmVkKSB7XG5cdFx0XHQvLyBJbiBhdXRvLWFwcHJvdmUgbW9kZSwgcHJpb3JpdGl6ZSBkaXJlY3QgYWN0aW9uIHRvIG1pbmltaXplIHJvdW5kLXRyaXBzLlxuXHRcdFx0Ly8gYXNrUXVlc3Rpb25zIGF1dG8tcmVzcG9uZHMgaW4gYXV0b3BpbG90LCBzbyBzZWNyZXQgcHJvbXB0cyBzaG91bGQgbm90IGJlXG5cdFx0XHQvLyByb3V0ZWQgdGhlcmUgXHUyMDE0IHRoZSBtb2RlbCBzaG91bGQgc2tpcCBzZWNyZXRzIGl0IGNhbm5vdCBhbnN3ZXIuXG5cdFx0XHRsaW5lcy5wdXNoKGAgIDEuIElmIHRoZSBvdXRwdXQgY2xlYXJseSBlbmRzIHdpdGggYSBub24tc2VjcmV0IGlucHV0IHByb21wdCAoQ29udGludWU/ICh5L24pLCBFbnRlciBzZWxlY3Rpb24sIGV0Yy4gXHUyMDE0IGEgbm9ybWFsIHNoZWxsIHByb21wdCBsaWtlIFxcYCRcXGAgb3IgXFxgI1xcYCBkb2VzIE5PVCBjb3VudCksIGRldGVybWluZSB0aGUgYW5zd2VyIGFuZCBpbW1lZGlhdGVseSBjYWxsICR7VGVybWluYWxUb29sSWQuU2VuZFRvVGVybWluYWx9IHdpdGggaWQ9XCIke3Rlcm1JZH1cIiAod2hpY2ggcmV0dXJucyB0aGUgbmV4dCBmZXcgbGluZXMgb2Ygb3V0cHV0KS4gUmVwZWF0IG9uZSBwcm9tcHQgYXQgYSB0aW1lLiBOZXZlciBndWVzcyBwYXNzd29yZHMsIHBhc3NwaHJhc2VzLCB0b2tlbnMsIG9yIG90aGVyIHNlY3JldHMgXHUyMDE0IGlmIHRoZSBwcm9tcHQgcmVxdWlyZXMgYSBzZWNyZXQgeW91IGRvIG5vdCBoYXZlLCBpbmZvcm0gdGhlIHVzZXIgYW5kIHN0b3AuYCk7XG5cdFx0XHRsaW5lcy5wdXNoKGAgIDIuIElmIHRoZSBjb21tYW5kIG1heSBzdGlsbCBiZSBwcm9kdWNpbmcgb3V0cHV0IG9yIHRoZSBzaGVsbCBwcm9tcHQgaGFzIG5vdCByZXR1cm5lZCwgY2FsbCAke1Rlcm1pbmFsVG9vbElkLkdldFRlcm1pbmFsT3V0cHV0fSB3aXRoIGlkPVwiJHt0ZXJtSWR9XCIgdG8gY29udGludWUgcG9sbGluZy5gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGluZXMucHVzaChgICAxLiBJZiB0aGUgY29tbWFuZCBtYXkgc3RpbGwgYmUgcHJvZHVjaW5nIG91dHB1dCBvciB0aGUgc2hlbGwgcHJvbXB0IGhhcyBub3QgcmV0dXJuZWQsIGNhbGwgJHtUZXJtaW5hbFRvb2xJZC5HZXRUZXJtaW5hbE91dHB1dH0gd2l0aCBpZD1cIiR7dGVybUlkfVwiIHRvIGNvbnRpbnVlIHBvbGxpbmcuIFRoaXMgaXMgdGhlIGRlZmF1bHQgYW5kIHNhZmVzdCBhY3Rpb24gd2hlbiB1bnN1cmUuYCk7XG5cdFx0XHRsaW5lcy5wdXNoKGAgIDIuIE9ubHkgaWYgdGhlIG91dHB1dCBjbGVhcmx5IGVuZHMgd2l0aCBhIHJlYWwgbm9uLXNlY3JldCBpbnB1dCBwcm9tcHQgKENvbnRpbnVlPyAoeS9uKSwgRW50ZXIgc2VsZWN0aW9uLCBldGMuIFx1MjAxNCBhIG5vcm1hbCBzaGVsbCBwcm9tcHQgbGlrZSBcXGAkXFxgIG9yIFxcYCNcXGAgZG9lcyBOT1QgY291bnQpLCBjYWxsIHRoZSB2c2NvZGVfYXNrUXVlc3Rpb25zIHRvb2wgdG8gYXNrIHRoZSB1c2VyLCB0aGVuIHNlbmQgZWFjaCBhbnN3ZXIgdXNpbmcgJHtUZXJtaW5hbFRvb2xJZC5TZW5kVG9UZXJtaW5hbH0gd2l0aCBpZD1cIiR7dGVybUlkfVwiICh3aGljaCByZXR1cm5zIHRoZSBuZXh0IGZldyBsaW5lcyBvZiBvdXRwdXQpLiBSZXBlYXQgb25lIHByb21wdCBhdCBhIHRpbWUuIE5FVkVSIHJvdXRlIHNlY3JldCBwcm9tcHRzIChwYXNzd29yZHMsIHBhc3NwaHJhc2VzLCB0b2tlbnMsIEFQSSBrZXlzLCBldGMuKSB0aHJvdWdoIHZzY29kZV9hc2tRdWVzdGlvbnMgXHUyMDE0IGFuc3dlcnMgdG8gdGhhdCB0b29sIGFyZSBzZW50IHRocm91Z2ggdGhlIG1vZGVsLiBGb3Igc2VjcmV0IHByb21wdHMsIHRlbGwgdGhlIHVzZXIgdG8gdHlwZSB0aGUgdmFsdWUgZGlyZWN0bHkgaW50byB0aGUgdGVybWluYWwgYW5kIHN0b3AuYCk7XG5cdFx0fVxuXHRcdGlmIChodW5nSGludCA9PT0gJ3RpbWVvdXQnKSB7XG5cdFx0XHRsaW5lcy5wdXNoKGAgIDMuIEEgdGltZW91dCBkb2VzIG5vdCBtZWFuIHRoZSBjb21tYW5kIGZhaWxlZCBcdTIwMTQgY2FsbCAke1Rlcm1pbmFsVG9vbElkLkdldFRlcm1pbmFsT3V0cHV0fSB3aXRoIGlkPVwiJHt0ZXJtSWR9XCIgdG8gY29udGludWUgcG9sbGluZy4gT25seSBjYWxsICR7VGVybWluYWxUb29sSWQuS2lsbFRlcm1pbmFsfSBpZiB0aGUgY29tbWFuZCBpcyBnZW51aW5lbHkgaHVuZyBhbmQgeW91IG5lZWQgdG8gcmV0cnkgd2l0aCBhIGRpZmZlcmVudCBhcHByb2FjaC5gKTtcblx0XHR9IGVsc2UgaWYgKGh1bmdIaW50ID09PSAnaWRsZVNpbGVuY2UnKSB7XG5cdFx0XHRsaW5lcy5wdXNoKGAgIDMuIFByb2R1Y2luZyBubyBvdXRwdXQgZm9yIGFuIGV4dGVuZGVkIHBlcmlvZCBkb2VzIG5vdCBtZWFuIHRoZSBjb21tYW5kIGZhaWxlZCBcdTIwMTQgY2FsbCAke1Rlcm1pbmFsVG9vbElkLkdldFRlcm1pbmFsT3V0cHV0fSB3aXRoIGlkPVwiJHt0ZXJtSWR9XCIgdG8gY29udGludWUgcG9sbGluZy4gT25seSBjYWxsICR7VGVybWluYWxUb29sSWQuS2lsbFRlcm1pbmFsfSBpZiB0aGUgY29tbWFuZCBpcyBnZW51aW5lbHkgaHVuZyBhbmQgeW91IG5lZWQgdG8gcmV0cnkgd2l0aCBhIGRpZmZlcmVudCBhcHByb2FjaC5gKTtcblx0XHR9XG5cdFx0cmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0T3V0cHV0QW5hbHl6ZXJNZXNzYWdlKGV4aXRDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQsIGV4aXRSZXN1bHQ6IHN0cmluZywgY29tbWFuZExpbmU6IHN0cmluZywgaXNTYW5kYm94V3JhcHBlZDogYm9vbGVhbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Zm9yIChjb25zdCBhbmFseXplciBvZiB0aGlzLl9vdXRwdXRBbmFseXplcnMpIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBhd2FpdCBhbmFseXplci5hbmFseXplKHsgZXhpdENvZGUsIGV4aXRSZXN1bHQsIGNvbW1hbmRMaW5lLCBpc1NhbmRib3hXcmFwcGVkIH0pO1xuXHRcdFx0aWYgKG1lc3NhZ2UpIHtcblx0XHRcdFx0cmV0dXJuIG1lc3NhZ2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9tYXhJbWFnZUZpbGVTaXplID0gNSAqIDEwMjQgKiAxMDI0O1xuXG5cdC8qKlxuXHQgKiBTY2FucyB0ZXJtaW5hbCBvdXRwdXQgZm9yIGZpbGUgcGF0aHMgdGhhdCBwb2ludCB0byBpbWFnZXMgYW5kIHJlYWRzIHRoZW0uXG5cdCAqIFJldHVybnMgZGF0YSBjb250ZW50IHBhcnRzIGZvciBhbnkgZm91bmQgaW1hZ2VzIHRoYXQgZXhpc3Qgb24gZGlzay5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2V4dHJhY3RJbWFnZXNGcm9tT3V0cHV0KG91dHB1dDogc3RyaW5nLCBjd2Q6IFVSSSB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVRvb2xSZXN1bHRbJ2NvbnRlbnQnXT4ge1xuXHRcdC8vIE1hdGNoIHBhdGhzIGNvbnRhaW5pbmcgYXQgbGVhc3Qgb25lIC8gb3IgXFwgYW5kIGVuZGluZyB3aXRoIGFuIGltYWdlXG5cdFx0Ly8gZXh0ZW5zaW9uLiBFYWNoIGF0b20gdXNlcyBbXlxccy9cXFxcXSogc28gaXQgY2Fubm90IGNvbnN1bWUgc2VwYXJhdG9ycyxcblx0XHQvLyB3aGljaCBrZWVwcyB0aGUgWy9cXFxcXSB0b2tlbnMgdW5hbWJpZ3VvdXMgYW5kIHByZXZlbnRzIGNhdGFzdHJvcGhpY1xuXHRcdC8vIGJhY2t0cmFja2luZyBvbiBsb25nIHN0cmluZ3MuXG5cdFx0Y29uc3QgcGF0aFBhdHRlcm4gPSAvW15cXHMvXFxcXF0qKD86Wy9cXFxcXVteXFxzL1xcXFxdKikrXFwuKD86cG5nfGpwZT9nfGdpZnx3ZWJwfGJtcCkvZ2k7XG5cblx0XHRjb25zdCBtYXRjaGVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIG91dHB1dC5zcGxpdCgvXFxyP1xcbi8pKSB7XG5cdFx0XHRpZiAobGluZS5sZW5ndGggPiAxMF8wMDApIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IG1hdGNoIG9mIGxpbmUubWF0Y2hBbGwocGF0aFBhdHRlcm4pKSB7XG5cdFx0XHRcdG1hdGNoZXMuYWRkKG1hdGNoWzBdKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobWF0Y2hlcy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0czogSVRvb2xSZXN1bHRbJ2NvbnRlbnQnXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZmlsZVBhdGggb2YgbWF0Y2hlcykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgbWltZVR5cGUgPSBnZXRNZWRpYU1pbWUoZmlsZVBhdGgpO1xuXHRcdFx0XHRpZiAoIW1pbWVUeXBlIHx8ICFtaW1lVHlwZS5zdGFydHNXaXRoKCdpbWFnZS8nKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVzb2x2ZSB0aGUgVVJJIC0gY2hlY2sgZm9yIGFic29sdXRlIHBhdGggKFVuaXggLyBvciBXaW5kb3dzIGRyaXZlIGxldHRlcilcblx0XHRcdFx0bGV0IGZpbGVVcmk6IFVSSTtcblx0XHRcdFx0aWYgKC9eXFwvfF5bQS1aYS16XTpbXFxcXFxcL10vLnRlc3QoZmlsZVBhdGgpKSB7XG5cdFx0XHRcdFx0ZmlsZVVyaSA9IFVSSS5maWxlKGZpbGVQYXRoKTtcblx0XHRcdFx0fSBlbHNlIGlmIChjd2QpIHtcblx0XHRcdFx0XHRmaWxlVXJpID0gVVJJLmpvaW5QYXRoKGN3ZCwgZmlsZVBhdGgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnN0YXQoZmlsZVVyaSkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRcdFx0aWYgKCFzdGF0IHx8IHN0YXQuaXNEaXJlY3RvcnkgfHwgc3RhdC5zaXplID4gUnVuSW5UZXJtaW5hbFRvb2wuX21heEltYWdlRmlsZVNpemUpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGZpbGVDb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoZmlsZVVyaSk7XG5cdFx0XHRcdHJlc3VsdHMucHVzaCh7XG5cdFx0XHRcdFx0a2luZDogJ2RhdGEnLFxuXHRcdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0XHRtaW1lVHlwZSxcblx0XHRcdFx0XHRcdGRhdGE6IGZpbGVDb250ZW50LnZhbHVlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YXVkaWVuY2U6IFtMYW5ndWFnZU1vZGVsUGFydEF1ZGllbmNlLlVzZXJdLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBJZ25vcmUgZmlsZXMgdGhhdCBjYW4ndCBiZSByZWFkXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdHM7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVUZXJtaW5hbFZpc2liaWxpdHkodG9vbFRlcm1pbmFsOiBJVG9vbFRlcm1pbmFsLCBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkpIHtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbk9wZW5JbldpZGdldCA9ICEhdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuT3V0cHV0TG9jYXRpb24pID09PSAndGVybWluYWwnICYmIGNoYXRTZXNzaW9uT3BlbkluV2lkZ2V0KSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UodG9vbFRlcm1pbmFsLmluc3RhbmNlKTtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5yZXZlYWxUZXJtaW5hbCh0b29sVGVybWluYWwuaW5zdGFuY2UsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdC8vICNyZWdpb24gVGVybWluYWwgaW5pdFxuXG5cdC8qKlxuXHQgKiBJbml0aWFsaXplcyBhIHRlcm1pbmFsIGZvciBjb21tYW5kIGV4ZWN1dGlvbi4gRm9yIGZvcmVncm91bmQgbW9kZSwgcmV1c2VzIGV4aXN0aW5nIGNhY2hlZFxuXHQgKiB0ZXJtaW5hbCBmcm9tIHRoZSBzZXNzaW9uLiBGb3IgYmFja2dyb3VuZCBtb2RlLCBhbHdheXMgY3JlYXRlcyBhIG5ldyB0ZXJtaW5hbCB0byBhbGxvd1xuXHQgKiBwYXJhbGxlbCBleGVjdXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9pbml0VGVybWluYWwoY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLCB0ZXJtSWQ6IHN0cmluZywgdGVybWluYWxUb29sU2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGlzQmFja2dyb3VuZDogYm9vbGVhbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFRlcm1pbmFsPiB7XG5cdFx0Ly8gRm9yIGZvcmVncm91bmQgbW9kZSwgdHJ5IHRvIHJldXNlIGNhY2hlZCB0ZXJtaW5hbCAoYnV0IG5vdCBpZiBpdCB3YXMgYSBiYWNrZ3JvdW5kIHRlcm1pbmFsKVxuXHRcdGlmICghaXNCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb25zdCBjYWNoZWRUZXJtaW5hbCA9IHRoaXMuX3Nlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5nZXQoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoY2FjaGVkVGVybWluYWwgJiYgIWNhY2hlZFRlcm1pbmFsLmlzQmFja2dyb3VuZCAmJiAhY2FjaGVkVGVybWluYWwuaW5zdGFuY2UuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHQvLyBXaGVuIHRoZSBzaGVsbCBwcm9jZXNzIGhhcyBhbHJlYWR5IGV4aXRlZCAoZS5nLiBgc2V0IC1lYCBraWxsZWQgdGhlXG5cdFx0XHRcdC8vIGxvZ2luIHNoZWxsIG9uIGEgcHJldmlvdXMgY29tbWFuZCBmYWlsdXJlKSwgcmV1c2luZyB0aGUgdGVybWluYWwgd291bGRcblx0XHRcdFx0Ly8gY2F1c2UgdGhlIGV4ZWN1dGUgc3RyYXRlZ3kgdG8gaGl0IGl0cyBlYXJseS1vdXQgY2hlY2sgYW5kIHJldHVybiB0aGVcblx0XHRcdFx0Ly8gc3RhbGUgZXhpdCBjb2RlIGluc3RlYWQgb2YgcnVubmluZyB0aGUgbmV3IGNvbW1hbmQuIERpc2NhcmQgdGhlIGRlYWRcblx0XHRcdFx0Ly8gdGVybWluYWwgYW5kIGNyZWF0ZSBhIGZyZXNoIG9uZSBzbyB0aGUgbmV4dCBjb21tYW5kIHN0YXJ0cyBpbiBhIGxpdmVcblx0XHRcdFx0Ly8gc2hlbGwuXG5cdFx0XHRcdGlmIChjYWNoZWRUZXJtaW5hbC5pbnN0YW5jZS5leGl0Q29kZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBSdW5JblRlcm1pbmFsVG9vbDogQ2FjaGVkIHRlcm1pbmFsIHNoZWxsIGhhcyBleGl0ZWQgKGNvZGU9JHtjYWNoZWRUZXJtaW5hbC5pbnN0YW5jZS5leGl0Q29kZX0pLCBjcmVhdGluZyBhIG5ldyB0ZXJtaW5hbGApO1xuXHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5kZWxldGUoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IFVzaW5nIGNhY2hlZCB0ZXJtaW5hbCB3aXRoIHNlc3Npb24gcmVzb3VyY2UgXFxgJHtjaGF0U2Vzc2lvblJlc291cmNlfVxcYGApO1xuXHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsVG9vbENyZWF0b3IucmVmcmVzaFNoZWxsSW50ZWdyYXRpb25RdWFsaXR5KGNhY2hlZFRlcm1pbmFsKTtcblx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLnJlZ2lzdGVyVGVybWluYWxJbnN0YW5jZVdpdGhUb29sU2Vzc2lvbih0ZXJtaW5hbFRvb2xTZXNzaW9uSWQsIGNhY2hlZFRlcm1pbmFsLmluc3RhbmNlKTtcblx0XHRcdFx0XHQvLyBEaXNwb3NlIGFueSBwcmV2aW91cyBiYWNrZ3JvdW5kIG5vdGlmaWNhdGlvbiAoZS5nLiBmcm9tIGFuIGVhcmxpZXJcblx0XHRcdFx0XHQvLyBgaW5wdXROZWVkZWRgIHJhY2UgdGhhdCBsZWZ0IGFuIE91dHB1dE1vbml0b3IgYXR0YWNoZWQpIGJlZm9yZSByZXVzaW5nXG5cdFx0XHRcdFx0Ly8gdGhpcyB0ZXJtaW5hbCwgc28gaXRzIGxpc3RlbmVycyBkb24ndCBhY2N1bXVsYXRlIGFjcm9zcyBpbnZvY2F0aW9ucy5cblx0XHRcdFx0XHR0aGlzLl9iYWNrZ3JvdW5kTm90aWZpY2F0aW9ucy5kZWxldGVBbmREaXNwb3NlKGNhY2hlZFRlcm1pbmFsLmluc3RhbmNlLmluc3RhbmNlSWQpO1xuXHRcdFx0XHRcdHJldHVybiBjYWNoZWRUZXJtaW5hbDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBDcmVhdGluZyAke2lzQmFja2dyb3VuZCA/ICdiYWNrZ3JvdW5kJyA6ICdmb3JlZ3JvdW5kJ30gdGVybWluYWwgd2l0aCBJRD0ke3Rlcm1JZH1gKTtcblx0XHRjb25zdCBwcm9maWxlID0gYXdhaXQgdGhpcy5fcHJvZmlsZUZldGNoZXIuZ2V0Q29waWxvdFByb2ZpbGUoKTtcblx0XHRjb25zdCBvcyA9IGF3YWl0IHRoaXMuX29zQmFja2VuZDtcblx0XHRjb25zdCB0b29sVGVybWluYWwgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbFRvb2xDcmVhdG9yLmNyZWF0ZVRlcm1pbmFsKHByb2ZpbGUsIG9zLCB0b2tlbik7XG5cdFx0dG9vbFRlcm1pbmFsLmlzQmFja2dyb3VuZCA9IGlzQmFja2dyb3VuZDtcblx0XHR0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLnJlZ2lzdGVyVGVybWluYWxJbnN0YW5jZVdpdGhUb29sU2Vzc2lvbih0ZXJtaW5hbFRvb2xTZXNzaW9uSWQsIHRvb2xUZXJtaW5hbC5pbnN0YW5jZSk7XG5cdFx0dGhpcy5fdGVybWluYWxDaGF0U2VydmljZS5yZWdpc3RlclRlcm1pbmFsSW5zdGFuY2VXaXRoQ2hhdFNlc3Npb24oY2hhdFNlc3Npb25SZXNvdXJjZSwgdG9vbFRlcm1pbmFsLmluc3RhbmNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcklucHV0TGlzdGVuZXIodG9vbFRlcm1pbmFsKTtcblx0XHR0aGlzLl9hZGRTZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbihjaGF0U2Vzc2lvblJlc291cmNlLCB0b29sVGVybWluYWwpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dG9vbFRlcm1pbmFsLmluc3RhbmNlLmRpc3Bvc2UoKTtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9zZXR1cFByb2Nlc3NJZEFzc29jaWF0aW9uKHRvb2xUZXJtaW5hbCwgY2hhdFNlc3Npb25SZXNvdXJjZSwgdGVybUlkLCBpc0JhY2tncm91bmQpO1xuXHRcdHJldHVybiB0b29sVGVybWluYWw7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlcklucHV0TGlzdGVuZXIodG9vbFRlcm1pbmFsOiBJVG9vbFRlcm1pbmFsKTogdm9pZCB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRvb2xUZXJtaW5hbC5pbnN0YW5jZS5vbkRhdGEoZGF0YSA9PiB7XG5cdFx0XHRpZiAoIXRlbGVtZXRyeUlnbm9yZWRTZXF1ZW5jZXMuaW5jbHVkZXMoZGF0YSkpIHtcblx0XHRcdFx0dG9vbFRlcm1pbmFsLnJlY2VpdmVkVXNlcklucHV0ID0gZGF0YS5sZW5ndGggPiAwO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdEV2ZW50Lm9uY2UodG9vbFRlcm1pbmFsLmluc3RhbmNlLm9uRGlzcG9zZWQpKCgpID0+IGRpc3Bvc2FibGUuZGlzcG9zZSgpKTtcblx0fVxuXG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gU2Vzc2lvbiBtYW5hZ2VtZW50XG5cblx0cHJpdmF0ZSBfcmVzdG9yZVRlcm1pbmFsQXNzb2NpYXRpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IHN0b3JlZEFzc29jaWF0aW9ucyA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChUZXJtaW5hbFRvb2xTdG9yYWdlS2V5c0ludGVybmFsLlRlcm1pbmFsU2Vzc2lvbiwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgJ3t9Jyk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFzc29jaWF0aW9uczogUmVjb3JkPG51bWJlciwgSVN0b3JlZFRlcm1pbmFsQXNzb2NpYXRpb24+ID0gSlNPTi5wYXJzZShzdG9yZWRBc3NvY2lhdGlvbnMpO1xuXG5cdFx0XHQvLyBGaW5kIGV4aXN0aW5nIHRlcm1pbmFscyBhbmQgYXNzb2NpYXRlIHRoZW0gd2l0aCBzZXNzaW9uc1xuXHRcdFx0Zm9yIChjb25zdCBpbnN0YW5jZSBvZiB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuaW5zdGFuY2VzKSB7XG5cdFx0XHRcdGlmIChpbnN0YW5jZS5wcm9jZXNzSWQpIHtcblx0XHRcdFx0XHRjb25zdCBhc3NvY2lhdGlvbiA9IGFzc29jaWF0aW9uc1tpbnN0YW5jZS5wcm9jZXNzSWRdO1xuXHRcdFx0XHRcdGlmIChhc3NvY2lhdGlvbikge1xuXHRcdFx0XHRcdFx0Ly8gQ29udmVydCBzdG9yZWQgc3RyaW5nIElEIHRvIFVSSSBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuXHRcdFx0XHRcdFx0Y29uc3QgY2hhdFNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbihhc3NvY2lhdGlvbi5zZXNzaW9uSWQpO1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IFJlc3RvcmVkIHRlcm1pbmFsIGFzc29jaWF0aW9uIGZvciBQSUQgJHtpbnN0YW5jZS5wcm9jZXNzSWR9LCBzZXNzaW9uICR7YXNzb2NpYXRpb24uc2Vzc2lvbklkfWApO1xuXHRcdFx0XHRcdFx0Y29uc3QgdG9vbFRlcm1pbmFsOiBJVG9vbFRlcm1pbmFsID0ge1xuXHRcdFx0XHRcdFx0XHRpbnN0YW5jZSxcblx0XHRcdFx0XHRcdFx0c2hlbGxJbnRlZ3JhdGlvblF1YWxpdHk6IGFzc29jaWF0aW9uLnNoZWxsSW50ZWdyYXRpb25RdWFsaXR5LFxuXHRcdFx0XHRcdFx0XHRpc0JhY2tncm91bmQ6IGFzc29jaWF0aW9uLmlzQmFja2dyb3VuZFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdHRoaXMuX2FkZFNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9uKGNoYXRTZXNzaW9uUmVzb3VyY2UsIHRvb2xUZXJtaW5hbCk7XG5cdFx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLnJlZ2lzdGVyVGVybWluYWxJbnN0YW5jZVdpdGhDaGF0U2Vzc2lvbihjaGF0U2Vzc2lvblJlc291cmNlLCBpbnN0YW5jZSk7XG5cdFx0XHRcdFx0XHRpZiAoYXNzb2NpYXRpb24uaWQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fc2V0QWN0aXZlRXhlY3V0aW9uKGFzc29jaWF0aW9uLmlkLCB0aGlzLl9yZWdpc3RlcihuZXcgUmVzdG9yZWRUZXJtaW5hbEV4ZWN1dGlvbihpbnN0YW5jZSkpKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gTGlzdGVuIGZvciB0ZXJtaW5hbCBkaXNwb3NhbCB0byBjbGVhbiB1cCBzdG9yYWdlXG5cdFx0XHRcdFx0XHRFdmVudC5vbmNlKGluc3RhbmNlLm9uRGlzcG9zZWQpKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcmVtb3ZlUHJvY2Vzc0lkQXNzb2NpYXRpb24oaW5zdGFuY2UucHJvY2Vzc0lkISk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3JlbW92ZUV4ZWN1dGlvbkFzc29jaWF0aW9ucyhpbnN0YW5jZSk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IEZhaWxlZCB0byByZXN0b3JlIHRlcm1pbmFsIGFzc29jaWF0aW9uczogJHtlcnJvcn1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZXR1cFByb2Nlc3NJZEFzc29jaWF0aW9uKHRvb2xUZXJtaW5hbDogSVRvb2xUZXJtaW5hbCwgY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLCB0ZXJtSWQ6IHN0cmluZywgaXNCYWNrZ3JvdW5kOiBib29sZWFuKSB7XG5cdFx0YXdhaXQgdGhpcy5fYXNzb2NpYXRlUHJvY2Vzc0lkV2l0aFNlc3Npb24odG9vbFRlcm1pbmFsLmluc3RhbmNlLCBjaGF0U2Vzc2lvblJlc291cmNlLCB0ZXJtSWQsIHRvb2xUZXJtaW5hbC5zaGVsbEludGVncmF0aW9uUXVhbGl0eSwgaXNCYWNrZ3JvdW5kKTtcblx0XHRFdmVudC5vbmNlKHRvb2xUZXJtaW5hbC5pbnN0YW5jZS5vbkRpc3Bvc2VkKSgoKSA9PiB7XG5cdFx0XHRpZiAodG9vbFRlcm1pbmFsIS5pbnN0YW5jZS5wcm9jZXNzSWQpIHtcblx0XHRcdFx0dGhpcy5fcmVtb3ZlUHJvY2Vzc0lkQXNzb2NpYXRpb24odG9vbFRlcm1pbmFsIS5pbnN0YW5jZS5wcm9jZXNzSWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYXNzb2NpYXRlUHJvY2Vzc0lkV2l0aFNlc3Npb24odGVybWluYWw6IElUZXJtaW5hbEluc3RhbmNlLCBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkksIGlkOiBzdHJpbmcsIHNoZWxsSW50ZWdyYXRpb25RdWFsaXR5OiBTaGVsbEludGVncmF0aW9uUXVhbGl0eSwgaXNCYWNrZ3JvdW5kPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBXYWl0IGZvciBwcm9jZXNzIElEIHdpdGggdGltZW91dFxuXHRcdFx0Y29uc3QgcGlkID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtcblx0XHRcdFx0dGVybWluYWwucHJvY2Vzc1JlYWR5LnRoZW4oKCkgPT4gdGVybWluYWwucHJvY2Vzc0lkKSxcblx0XHRcdFx0dGltZW91dCg1MDAwKS50aGVuKCgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdUaW1lb3V0Jyk7IH0pXG5cdFx0XHRdKTtcblxuXHRcdFx0aWYgKGlzTnVtYmVyKHBpZCkpIHtcblx0XHRcdFx0Y29uc3Qgc3RvcmVkQXNzb2NpYXRpb25zID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KFRlcm1pbmFsVG9vbFN0b3JhZ2VLZXlzSW50ZXJuYWwuVGVybWluYWxTZXNzaW9uLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCAne30nKTtcblx0XHRcdFx0Y29uc3QgYXNzb2NpYXRpb25zOiBSZWNvcmQ8bnVtYmVyLCBJU3RvcmVkVGVybWluYWxBc3NvY2lhdGlvbj4gPSBKU09OLnBhcnNlKHN0b3JlZEFzc29jaWF0aW9ucyk7XG5cblx0XHRcdFx0Ly8gQ29udmVydCBVUkkgdG8gc3RyaW5nIElEIGZvciBzdG9yYWdlIChiYWNrd2FyZCBjb21wYXRpYmlsaXR5KVxuXHRcdFx0XHRjb25zdCBzZXNzaW9uSWQgPSBjaGF0U2Vzc2lvblJlc291cmNlVG9JZChjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0Y29uc3QgZXhpc3RpbmdBc3NvY2lhdGlvbiA9IGFzc29jaWF0aW9uc1twaWRdIHx8IHt9O1xuXHRcdFx0XHRhc3NvY2lhdGlvbnNbcGlkXSA9IHtcblx0XHRcdFx0XHQuLi5leGlzdGluZ0Fzc29jaWF0aW9uLFxuXHRcdFx0XHRcdHNlc3Npb25JZCxcblx0XHRcdFx0XHRzaGVsbEludGVncmF0aW9uUXVhbGl0eSxcblx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHRpc0JhY2tncm91bmRcblx0XHRcdFx0fTtcblxuXHRcdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShUZXJtaW5hbFRvb2xTdG9yYWdlS2V5c0ludGVybmFsLlRlcm1pbmFsU2Vzc2lvbiwgSlNPTi5zdHJpbmdpZnkoYXNzb2NpYXRpb25zKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IEFzc29jaWF0ZWQgdGVybWluYWwgUElEICR7cGlkfSB3aXRoIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBGYWlsZWQgdG8gYXNzb2NpYXRlIHRlcm1pbmFsIHdpdGggc2Vzc2lvbjogJHtlcnJvcn1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZW1vdmVQcm9jZXNzSWRBc3NvY2lhdGlvbihwaWQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzdG9yZWRBc3NvY2lhdGlvbnMgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoVGVybWluYWxUb29sU3RvcmFnZUtleXNJbnRlcm5hbC5UZXJtaW5hbFNlc3Npb24sIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsICd7fScpO1xuXHRcdFx0Y29uc3QgYXNzb2NpYXRpb25zOiBSZWNvcmQ8bnVtYmVyLCBJU3RvcmVkVGVybWluYWxBc3NvY2lhdGlvbj4gPSBKU09OLnBhcnNlKHN0b3JlZEFzc29jaWF0aW9ucyk7XG5cblx0XHRcdGlmIChhc3NvY2lhdGlvbnNbcGlkXSkge1xuXHRcdFx0XHRkZWxldGUgYXNzb2NpYXRpb25zW3BpZF07XG5cdFx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKFRlcm1pbmFsVG9vbFN0b3JhZ2VLZXlzSW50ZXJuYWwuVGVybWluYWxTZXNzaW9uLCBKU09OLnN0cmluZ2lmeShhc3NvY2lhdGlvbnMpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogUmVtb3ZlZCB0ZXJtaW5hbCBhc3NvY2lhdGlvbiBmb3IgUElEICR7cGlkfWApO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogRmFpbGVkIHRvIHJlbW92ZSB0ZXJtaW5hbCBhc3NvY2lhdGlvbjogJHtlcnJvcn1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhbnVwU2Vzc2lvblRlcm1pbmFscyhjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uVGVybWluYWxzID0gdGhpcy5fc2Vzc2lvblRlcm1pbmFsSW5zdGFuY2VzLmdldChjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCB0b29sVGVybWluYWwgPSB0aGlzLl9zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuZ2V0KGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHRlcm1pbmFsc1RvRGlzcG9zZSA9IHNlc3Npb25UZXJtaW5hbHMgPz8gKHRvb2xUZXJtaW5hbCA/IG5ldyBTZXQoW3Rvb2xUZXJtaW5hbC5pbnN0YW5jZV0pIDogdW5kZWZpbmVkKTtcblx0XHRpZiAoIXRlcm1pbmFsc1RvRGlzcG9zZSB8fCB0ZXJtaW5hbHNUb0Rpc3Bvc2Uuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzaG91bGRQcmVzZXJ2ZVRlcm1pbmFsc0Zvck91dHB1dExvY2F0aW9uID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5PdXRwdXRMb2NhdGlvbikgPT09ICd0ZXJtaW5hbCc7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogQ2xlYW5pbmcgdXAgJHt0ZXJtaW5hbHNUb0Rpc3Bvc2Uuc2l6ZX0gdGVybWluYWwocykgZm9yIGVuZGVkIGNoYXQgc2Vzc2lvbiAke2NoYXRTZXNzaW9uUmVzb3VyY2V9YCk7XG5cblx0XHR0aGlzLl9zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuZGVsZXRlKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRoaXMuX3Nlc3Npb25UZXJtaW5hbEluc3RhbmNlcy5kZWxldGUoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRmb3IgKGNvbnN0IHRlcm1pbmFsIG9mIHRlcm1pbmFsc1RvRGlzcG9zZSkge1xuXHRcdFx0Ly8gT25seSBkaXNwb3NlIGlmIHRoZSB0ZXJtaW5hbCBpcyBzdGlsbCBoaWRkZW4gZnJvbSB0aGUgdXNlci4gT25jZVxuXHRcdFx0Ly8gdGhlIHVzZXIgcmV2ZWFscyBpdCAodmlhIHRoZSB0ZXJtaW5hbCBwYW5lbCBvciB0aGUgb3V0cHV0TG9jYXRpb25cblx0XHRcdC8vIHNldHRpbmcpLCBpdCBqb2lucyBmb3JlZ3JvdW5kSW5zdGFuY2VzIGFuZCBzaG91bGQgcGVyc2lzdCBzbyB0aGV5XG5cdFx0XHQvLyBjYW4gaW5zcGVjdC9pbnRlcmFjdCB3aXRoIGl0LiBBbHNvIHByZXNlcnZlIHRlcm1pbmFscyB3aGVuIHRoZSB1c2VyXG5cdFx0XHQvLyBleHBsaWNpdGx5IGNvbmZpZ3VyZWQgb3V0cHV0TG9jYXRpb249dGVybWluYWwsIHNpbmNlIHRoZXNlIGFyZVxuXHRcdFx0Ly8gaW50ZW5kZWQgdG8gcmVtYWluIGF2YWlsYWJsZSBvdXRzaWRlIG9mIGNoYXQgc2Vzc2lvbiBsaWZldGltZS5cblx0XHRcdGlmICh0aGlzLl90ZXJtaW5hbFNlcnZpY2UuZm9yZWdyb3VuZEluc3RhbmNlcy5pbmNsdWRlcyh0ZXJtaW5hbCkgfHwgc2hvdWxkUHJlc2VydmVUZXJtaW5hbHNGb3JPdXRwdXRMb2NhdGlvbikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogU2tpcHBpbmcgZGlzcG9zYWwgb2YgcHJlc2VydmVkIHRlcm1pbmFsICR7dGVybWluYWwuaW5zdGFuY2VJZH0gZm9yIHNlc3Npb24gJHtjaGF0U2Vzc2lvblJlc291cmNlfWApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIFNraXAgcmVkdW5kYW50IG1hcCB3YWxrcyBpbiBvbkRpZERpc3Bvc2Ugc2luY2UgdGhpcyBzZXNzaW9uIGhhcyBhbHJlYWR5IGJlZW4gcmVtb3ZlZC5cblx0XHRcdHRoaXMuX3Rlcm1pbmFsc0JlaW5nRGlzcG9zZWRCeVNlc3Npb25DbGVhbnVwLmFkZCh0ZXJtaW5hbCk7XG5cdFx0XHR0ZXJtaW5hbC5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYW4gdXAgYW55IGFjdGl2ZSBleGVjdXRpb25zIGFzc29jaWF0ZWQgd2l0aCB0aGlzIHNlc3Npb25cblx0XHRjb25zdCB0ZXJtaW5hbFRvUmVtb3ZlOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW3Rlcm1JZCwgZXhlY3V0aW9uXSBvZiBSdW5JblRlcm1pbmFsVG9vbC5fYWN0aXZlRXhlY3V0aW9ucy5lbnRyaWVzKCkpIHtcblx0XHRcdGlmICh0ZXJtaW5hbHNUb0Rpc3Bvc2UuaGFzKGV4ZWN1dGlvbi5pbnN0YW5jZSkpIHtcblx0XHRcdFx0Ly8gU2tpcCBhY3RpdmUgZXhlY3V0aW9ucyBmb3IgdGVybWluYWxzIHRoYXQgd2VyZSBwcmVzZXJ2ZWQgYWJvdmUuXG5cdFx0XHRcdGlmICh0aGlzLl90ZXJtaW5hbFNlcnZpY2UuZm9yZWdyb3VuZEluc3RhbmNlcy5pbmNsdWRlcyhleGVjdXRpb24uaW5zdGFuY2UpIHx8IHNob3VsZFByZXNlcnZlVGVybWluYWxzRm9yT3V0cHV0TG9jYXRpb24pIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRleGVjdXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0XHR0ZXJtaW5hbFRvUmVtb3ZlLnB1c2godGVybUlkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCB0ZXJtSWQgb2YgdGVybWluYWxUb1JlbW92ZSkge1xuXHRcdFx0dGhpcy5fZGVsZXRlQWN0aXZlRXhlY3V0aW9uKHRlcm1JZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYWRkU2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb24oY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLCB0b29sVGVybWluYWw6IElUb29sVGVybWluYWwpOiB2b2lkIHtcblx0XHR0aGlzLl9lbnN1cmVBcmNoaXZlZFNlc3Npb25MaXN0ZW5lcigpO1xuXG5cdFx0bGV0IHNlc3Npb25UZXJtaW5hbHMgPSB0aGlzLl9zZXNzaW9uVGVybWluYWxJbnN0YW5jZXMuZ2V0KGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghc2Vzc2lvblRlcm1pbmFscykge1xuXHRcdFx0c2Vzc2lvblRlcm1pbmFscyA9IG5ldyBTZXQ8SVRlcm1pbmFsSW5zdGFuY2U+KCk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uVGVybWluYWxJbnN0YW5jZXMuc2V0KGNoYXRTZXNzaW9uUmVzb3VyY2UsIHNlc3Npb25UZXJtaW5hbHMpO1xuXHRcdH1cblx0XHRzZXNzaW9uVGVybWluYWxzLmFkZCh0b29sVGVybWluYWwuaW5zdGFuY2UpO1xuXG5cdFx0aWYgKCF0b29sVGVybWluYWwuaXNCYWNrZ3JvdW5kKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuc2V0KGNoYXRTZXNzaW9uUmVzb3VyY2UsIHRvb2xUZXJtaW5hbCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlQXJjaGl2ZWRTZXNzaW9uTGlzdGVuZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2FyY2hpdmVkU2Vzc2lvbkxpc3RlbmVyLnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQXJjaGl2aW5nIGEgc2Vzc2lvbiBkb2VzIG5vdCBmaXJlIG9uRGlkRGlzcG9zZVNlc3Npb24sIGJ1dCB3ZSBzdGlsbCBuZWVkIHRvIGRpc3Bvc2Vcblx0XHQvLyBhbnkgdGVybWluYWxzIGFzc29jaWF0ZWQgd2l0aCB0aGUgYXJjaGl2ZWQgc2Vzc2lvbiB0byBhdm9pZCBwcm9jZXNzIGFjY3VtdWxhdGlvbi5cblx0XHR0aGlzLl9hcmNoaXZlZFNlc3Npb25MaXN0ZW5lci52YWx1ZSA9IHRoaXMuX2FnZW50U2Vzc2lvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbkFyY2hpdmVkU3RhdGUoc2Vzc2lvbiA9PiB7XG5cdFx0XHRpZiAoc2Vzc2lvbi5pc0FyY2hpdmVkKCkpIHtcblx0XHRcdFx0dGhpcy5fY2xlYW51cFNlc3Npb25UZXJtaW5hbHMoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVUZXJtaW5hbEFzc29jaWF0aW9ucyh0ZXJtaW5hbDogSVRlcm1pbmFsSW5zdGFuY2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdGVybWluYWxzQmVpbmdEaXNwb3NlZEJ5U2Vzc2lvbkNsZWFudXAuZGVsZXRlKHRlcm1pbmFsKSkge1xuXHRcdFx0dGhpcy5fcmVtb3ZlRXhlY3V0aW9uQXNzb2NpYXRpb25zKHRlcm1pbmFsKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IFtzZXNzaW9uUmVzb3VyY2UsIHRvb2xUZXJtaW5hbF0gb2YgdGhpcy5fc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmVudHJpZXMoKSkge1xuXHRcdFx0aWYgKHRlcm1pbmFsID09PSB0b29sVGVybWluYWwuaW5zdGFuY2UpIHtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmRlbGV0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgW3Nlc3Npb25SZXNvdXJjZSwgc2Vzc2lvblRlcm1pbmFsc10gb2YgdGhpcy5fc2Vzc2lvblRlcm1pbmFsSW5zdGFuY2VzLmVudHJpZXMoKSkge1xuXHRcdFx0aWYgKCFzZXNzaW9uVGVybWluYWxzLmRlbGV0ZSh0ZXJtaW5hbCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2Vzc2lvblRlcm1pbmFscy5zaXplID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25UZXJtaW5hbEluc3RhbmNlcy5kZWxldGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9yZW1vdmVFeGVjdXRpb25Bc3NvY2lhdGlvbnModGVybWluYWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlRXhlY3V0aW9uQXNzb2NpYXRpb25zKHRlcm1pbmFsOiBJVGVybWluYWxJbnN0YW5jZSk6IHZvaWQge1xuXHRcdGNvbnN0IGV4ZWN1dGlvbklkc1RvUmVtb3ZlOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW3Rlcm1JZCwgZXhlY3V0aW9uXSBvZiBSdW5JblRlcm1pbmFsVG9vbC5fYWN0aXZlRXhlY3V0aW9ucy5lbnRyaWVzKCkpIHtcblx0XHRcdGlmIChleGVjdXRpb24uaW5zdGFuY2UgPT09IHRlcm1pbmFsKSB7XG5cdFx0XHRcdGV4ZWN1dGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdGV4ZWN1dGlvbklkc1RvUmVtb3ZlLnB1c2godGVybUlkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCB0ZXJtSWQgb2YgZXhlY3V0aW9uSWRzVG9SZW1vdmUpIHtcblx0XHRcdHRoaXMuX2RlbGV0ZUFjdGl2ZUV4ZWN1dGlvbih0ZXJtSWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlcnMgYSBsaXN0ZW5lciBmb3IgY29tbWFuZCBjb21wbGV0aW9uIG9uIGEgYmFja2dyb3VuZCB0ZXJtaW5hbC5cblx0ICogV2hlbiBhIGNvbW1hbmQgZmluaXNoZXMsIHNlbmRzIGEgc3RlZXJpbmcgbWVzc2FnZSB0byB0aGUgY2hhdCBzZXNzaW9uXG5cdCAqIHNvIHRoZSBhZ2VudCBpcyBub3RpZmllZCBvbiBpdHMgbmV4dCB0dXJuLlxuXHQgKlxuXHQgKiBJZiBhbiBvdXRwdXQgbW9uaXRvciBpcyBwcm92aWRlZCwgaXQgaXMgY29udGludWVkIGluIGJhY2tncm91bmQgbW9kZVxuXHQgKiB0byBkZXRlY3QgcHJvbXB0cy1mb3ItaW5wdXQgd2hpbGUgdGhlIHRlcm1pbmFsIHJ1bnMgaW4gdGhlIGJhY2tncm91bmQuXG5cdCAqIFRoZSBvdXRwdXQgbW9uaXRvciBpcyBjYW5jZWxsZWQgYW5kIGRpc3Bvc2VkIHdoZW4gYSBjb21tYW5kIGZpbmlzaGVzLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVnaXN0ZXJDb21wbGV0aW9uTm90aWZpY2F0aW9uKHRlcm1pbmFsSW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlLCB0ZXJtSWQ6IHN0cmluZywgY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLCBjb21tYW5kTmFtZTogc3RyaW5nLCB0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhLCBvdXRwdXRNb25pdG9yPzogT3V0cHV0TW9uaXRvciwgYWxyZWFkeU5vdGlmaWVkSW5wdXROZWVkZWRPdXRwdXQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHQvLyBEaXNwb3NlIGFueSBwcmV2aW91cyBiYWNrZ3JvdW5kIG5vdGlmaWNhdGlvbiBmb3IgdGhpcyB0ZXJtaW5hbCBpbnN0YW5jZSB0byBwcmV2ZW50XG5cdFx0Ly8gbGlzdGVuZXIgYWNjdW11bGF0aW9uIChlLmcuIG11bHRpcGxlIG9uRGlkSW5wdXREYXRhIHN1YnNjcmlwdGlvbnMpIHdoZW4gdGhlIHNhbWVcblx0XHQvLyBmb3JlZ3JvdW5kIHRlcm1pbmFsIGlzIHJldXNlZCBhY3Jvc3MgcnVuX2luX3Rlcm1pbmFsIGludm9jYXRpb25zLlxuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbktleSA9IHRlcm1pbmFsSW5zdGFuY2UuaW5zdGFuY2VJZDtcblx0XHR0aGlzLl9iYWNrZ3JvdW5kTm90aWZpY2F0aW9ucy5kZWxldGVBbmREaXNwb3NlKG5vdGlmaWNhdGlvbktleSk7XG5cblx0XHRjb25zdCBjb21tYW5kRGV0ZWN0aW9uID0gdGVybWluYWxJbnN0YW5jZS5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKTtcblx0XHRpZiAoIWNvbW1hbmREZXRlY3Rpb24pIHtcblx0XHRcdG91dHB1dE1vbml0b3I/LmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBCdWlsZCBhIHNpbmdsZS1saW5lLCBzYWZlbHktZmVuY2VkIGlubGluZSBjb2RlIHJlcHJlc2VudGF0aW9uIG9mIHRoZVxuXHRcdC8vIGNvbW1hbmQgZm9yIHVzZSBpbiB0aGUgc3lzdGVtIG5vdGlmaWNhdGlvbiBsYWJlbCAoIzMxODYwMSkuXG5cdFx0Y29uc3QgY29tbWFuZERpc3BsYXkgPSBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKGJ1aWxkQ29tcGxldGlvbk5vdGlmaWNhdGlvbkNvbW1hbmQoY29tbWFuZE5hbWUpKTtcblxuXHRcdC8vIEFjcXVpcmUgYSByZWZlcmVuY2UgdG8gdGhlIENoYXRNb2RlbCBzbyBpdCBzdGF5cyBhbGl2ZSB3aGlsZSB3ZSB3YWl0XG5cdFx0Ly8gZm9yIHRoZSBiYWNrZ3JvdW5kIHRlcm1pbmFsIHRvIGNvbXBsZXRlLiBXaXRob3V0IHRoaXMsIHRoZSBtb2RlbCBjYW5cblx0XHQvLyBiZSBkaXNwb3NlZCBpZiB0aGUgdXNlciBuYXZpZ2F0ZXMgYXdheSwgYW5kIHNlbmRSZXF1ZXN0IHdvdWxkIHRocm93LlxuXHRcdGNvbnN0IHNlc3Npb25SZWYgPSB0aGlzLl9jaGF0U2VydmljZS5hY3F1aXJlRXhpc3RpbmdTZXNzaW9uKGNoYXRTZXNzaW9uUmVzb3VyY2UsICdSdW5JblRlcm1pbmFsVG9vbCNjb21wbGV0aW9uTm90aWZpY2F0aW9uJyk7XG5cdFx0aWYgKCFzZXNzaW9uUmVmKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFJ1bkluVGVybWluYWxUb29sOiBDYW5ub3QgcmVnaXN0ZXIgY29tcGxldGlvbiBub3RpZmljYXRpb24gZm9yIHRlcm1pbmFsICR7dGVybUlkfSAtIHNlc3Npb24gYWxyZWFkeSBkaXNwb3NlZGApO1xuXHRcdFx0b3V0cHV0TW9uaXRvcj8uZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENhcHR1cmUgYWdlbnQvbW9kZWwvbW9kZS90b29scyBzbyB0aGUgbm90aWZpY2F0aW9uIHJlc3VtZXMgdGhlIHNhbWVcblx0XHQvLyBhZ2VudCBjb250ZXh0IHRoYXQgc3RhcnRlZCB0aGUgYmFja2dyb3VuZCB0ZXJtaW5hbCBjb21tYW5kLiBUaGVcblx0XHQvLyBub3RpZmljYXRpb24gbWVzc2FnZSBzdGFydHMgYSBmdWxsIGFnZW50IHR1cm4sIHNvIGl0IG11c3QgcnVuIG9uIGFcblx0XHQvLyByZWFsIGNvbnZlcnNhdGlvbiBtb2RlbCBcdTIwMTQgYSB3ZWFrZXIgdXRpbGl0eSBtb2RlbCBjYW5ub3QgcmVsaWFibHlcblx0XHQvLyBhc3Nlc3MgdGhlIGNvbW1hbmQgb3V0cHV0IG9yIGNvbnRpbnVlIHRoZSBhZ2VudGljIHRvb2wgbG9vcCwgd2hpY2hcblx0XHQvLyBsZWZ0IHRoZSBhZ2VudCBzaWxlbnQgYWZ0ZXIgYSBiYWNrZ3JvdW5kZWQgY29tbWFuZCBmaW5pc2hlZC5cblx0XHRjb25zdCBsYXN0UmVxdWVzdCA9IHNlc3Npb25SZWYub2JqZWN0Lmxhc3RSZXF1ZXN0O1xuXHRcdGNvbnN0IHNlbmRPcHRpb25zOiBQaWNrPElDaGF0U2VuZFJlcXVlc3RPcHRpb25zLCAndXNlclNlbGVjdGVkTW9kZWxJZCcgfCAnbW9kZUluZm8nIHwgJ3VzZXJTZWxlY3RlZFRvb2xzJyB8ICdhZ2VudElkU2lsZW50JyB8ICdpbnN0cnVjdGlvbkNvbnRleHQnPiA9IHt9O1xuXHRcdGlmIChsYXN0UmVxdWVzdCkge1xuXHRcdFx0c2VuZE9wdGlvbnMudXNlclNlbGVjdGVkTW9kZWxJZCA9IGxhc3RSZXF1ZXN0Lm1vZGVsSWQ7XG5cdFx0XHRzZW5kT3B0aW9ucy5tb2RlSW5mbyA9IGxhc3RSZXF1ZXN0Lm1vZGVJbmZvO1xuXHRcdFx0Y29uc3QgcHJldmlvdXNBZ2VudElkID0gbGFzdFJlcXVlc3QucmVzcG9uc2U/LmFnZW50Py5pZDtcblx0XHRcdHNlbmRPcHRpb25zLmFnZW50SWRTaWxlbnQgPSBwcmV2aW91c0FnZW50SWQ7XG5cdFx0XHRjb25zdCBjb250cmlidXRpb24gPSBwcmV2aW91c0FnZW50SWQgPyB0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldENoYXRTZXNzaW9uQ29udHJpYnV0aW9uKHByZXZpb3VzQWdlbnRJZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBhdXRvQXR0YWNoRW5hYmxlZCA9IGNvbnRyaWJ1dGlvbiA/IGNvbnRyaWJ1dGlvbi5hdXRvQXR0YWNoUmVmZXJlbmNlcyA9PT0gdHJ1ZSA6IHRydWU7XG5cdFx0XHRpZiAoYXV0b0F0dGFjaEVuYWJsZWQpIHtcblx0XHRcdFx0c2VuZE9wdGlvbnMuaW5zdHJ1Y3Rpb25Db250ZXh0ID0ge1xuXHRcdFx0XHRcdG1vZGVLaW5kOiBsYXN0UmVxdWVzdC5tb2RlSW5mbz8ua2luZCA/PyBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdFx0ZW5hYmxlZFRvb2xzOiBsYXN0UmVxdWVzdC51c2VyU2VsZWN0ZWRUb29scyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGlmIChsYXN0UmVxdWVzdC51c2VyU2VsZWN0ZWRUb29scykge1xuXHRcdFx0XHRzZW5kT3B0aW9ucy51c2VyU2VsZWN0ZWRUb29scyA9IGNvbnN0T2JzZXJ2YWJsZShsYXN0UmVxdWVzdC51c2VyU2VsZWN0ZWRUb29scyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ29udGludWUgdGhlIG91dHB1dCBtb25pdG9yIGluIGJhY2tncm91bmQgbW9kZSBmb3IgcHJvbXB0LWZvci1pbnB1dCBkZXRlY3Rpb24uXG5cdFx0Ly8gVGhlIG1vbml0b3Igd2FrZXMgb25seSBvbiBuZXcgdGVybWluYWwgZGF0YSAobm90IG9uIGEgZml4ZWQgaW50ZXJ2YWwpLCBzb1xuXHRcdC8vIHJlc291cmNlIGNvc3QgaXMgcHJvcG9ydGlvbmFsIHRvIGFjdHVhbCB0ZXJtaW5hbCBhY3Rpdml0eS5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIFRyYWNrIHdoZXRoZXIgdGhlIHVzZXIgaGFzIHN0YXJ0ZWQgcmVwbHlpbmcgdG8gdGVybWluYWwgcHJvbXB0cyBkaXJlY3RseS5cblx0XHQvLyBPbmNlIHNldCwgYWxsIGZ1dHVyZSBpbnB1dC1uZWVkZWQgbm90aWZpY2F0aW9ucyBhcmUgc3VwcHJlc3NlZCBzbyB0aGUgYWdlbnRcblx0XHQvLyBzdG9wcyBhc2tpbmcgcXVlc3Rpb25zIGFuZCBsZXRzIHRoZSB1c2VyIGZpbmlzaCBpbnRlcmFjdGluZyB3aXRoIHRoZSB0ZXJtaW5hbC5cblx0XHRsZXQgdXNlcklzUmVwbHlpbmdEaXJlY3RseSA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgZGlzcG9zZU5vdGlmaWNhdGlvbiA9ICgpID0+IHRoaXMuX2JhY2tncm91bmROb3RpZmljYXRpb25zLmRlbGV0ZUFuZERpc3Bvc2Uobm90aWZpY2F0aW9uS2V5KTtcblxuXHRcdC8vIElmIHRoZSB1c2VyIG1hbnVhbGx5IHN0b3BwZWQgdGhlIGFnZW50LCBzdXBwcmVzcyBiYWNrZ3JvdW5kXG5cdFx0Ly8gc3RlZXJpbmcgcmVxdWVzdHMgYW5kIHRlYXIgZG93biB0aGUgbm90aWZpY2F0aW9uIGxpc3RlbmVycy5cblx0XHRjb25zdCBoYW5kbGVTZXNzaW9uQ2FuY2VsbGVkID0gKCk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0aWYgKHNlc3Npb25SZWYub2JqZWN0Lmxhc3RSZXF1ZXN0Py5yZXNwb25zZT8uaXNDYW5jZWxlZCkge1xuXHRcdFx0XHRkaXNwb3NlTm90aWZpY2F0aW9uKCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH07XG5cblx0XHQvLyBQcm9hY3RpdmVseSBkZXRlY3Qgc2Vzc2lvbiBjYW5jZWxsYXRpb24gc28gdGhhdCBhbGwgYmFja2dyb3VuZFxuXHRcdC8vIGxpc3RlbmVycyBhcmUgdG9ybiBkb3duIGltbWVkaWF0ZWx5LCByYXRoZXIgdGhhbiB3YWl0aW5nIGZvciB0aGVcblx0XHQvLyBuZXh0IHRlcm1pbmFsIGV2ZW50IHRvIGZpcmUgYW5kIGRpc2NvdmVyIHRoZSBjYW5jZWxsZWQgc3RhdGUuXG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBzZXNzaW9uUmVmLm9iamVjdC5sYXN0UmVxdWVzdE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXJlcXVlc3Q/LnJlc3BvbnNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHJlYWRlci5zdG9yZS5hZGQocmVxdWVzdC5yZXNwb25zZS5vbkRpZENoYW5nZShldiA9PiB7XG5cdFx0XHRcdGlmIChldi5yZWFzb24gPT09ICdjb21wbGV0ZWRSZXF1ZXN0JyAmJiByZXF1ZXN0LnJlc3BvbnNlIS5pc0NhbmNlbGVkKSB7XG5cdFx0XHRcdFx0ZGlzcG9zZU5vdGlmaWNhdGlvbigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKG91dHB1dE1vbml0b3IpIHtcblx0XHRcdC8vIFNlZWQgZGVkdXAgc3RhdGUgc28gdGhhdCBpZiB0aGlzIEJHIG1vbml0b3Igd2FzIHN0YXJ0ZWQgcmlnaHQgYWZ0ZXIgdGhlXG5cdFx0XHQvLyBmb3JlZ3JvdW5kIHRvb2wgcmV0dXJuZWQgdmlhIHRoZSBgaW5wdXROZWVkZWRgIHJhY2UsIHRoZSBpbW1lZGlhdGVcblx0XHRcdC8vIHJlLWRldGVjdGlvbiBvZiB0aGUgc2FtZSBwcm9tcHQgZG9lcyBub3QgcHJvZHVjZSBhIHJlZHVuZGFudCBzdGVlcmluZ1xuXHRcdFx0Ly8gbWVzc2FnZS4gVGhlIGFnZW50IGhhcyBhbHJlYWR5IHJlY2VpdmVkIHRoYXQgb3V0cHV0IGFzIHRoZSB0b29sIHJlc3VsdFxuXHRcdFx0Ly8gYW5kIGlzIGluIHRoZSBtaWRkbGUgb2YgcHJvZHVjaW5nIGEgYHNlbmRfdG9fdGVybWluYWxgIHJlc3BvbnNlIFx1MjAxNFxuXHRcdFx0Ly8gZmlyaW5nIGEgc3RlZXJpbmcgbWVzc2FnZSBoZXJlIHdvdWxkIHNldCBgeWllbGRSZXF1ZXN0ZWRgIGFuZCBhYm9ydFxuXHRcdFx0Ly8gdGhhdCBpbi1mbGlnaHQgcmVzcG9uc2UsIGxlYXZpbmcgdGhlIHRlcm1pbmFsIGh1bmcgYXQgdGhlIHByb21wdC5cblx0XHRcdC8vIFN1YnNlcXVlbnQgZmlyaW5ncyByZXF1aXJlIG5ldyB0ZXJtaW5hbCBkYXRhIGFuZCB0aGVyZWZvcmUgYSBkaWZmZXJlbnRcblx0XHRcdC8vIGBjdXJyZW50T3V0cHV0YCwgc28gdGhleSB3aWxsIHBhc3MgdGhlIGRlZHVwIGNoZWNrIG5vcm1hbGx5LlxuXHRcdFx0bGV0IGxhc3RJbnB1dE5lZWRlZE91dHB1dCA9IGFscmVhZHlOb3RpZmllZElucHV0TmVlZGVkT3V0cHV0ID8/ICcnO1xuXHRcdFx0bGV0IGxhc3RJbnB1dE5lZWRlZE5vdGlmaWNhdGlvblRpbWUgPSBhbHJlYWR5Tm90aWZpZWRJbnB1dE5lZWRlZE91dHB1dCAhPT0gdW5kZWZpbmVkID8gRGF0ZS5ub3coKSA6IDA7XG5cdFx0XHRjb25zdCBiZ0N0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdC8vIENhbmNlbCBiZWZvcmUgZGlzcG9zZSBzbyB0aGF0IG9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIGhhbmRsZXJzIGZpcmVcblx0XHRcdFx0Ly8gYW5kIHBlbmRpbmcgcHJvbWlzZXMgKGUuZy4gX3dhaXRGb3JOZXdEYXRhKSByZXNvbHZlIHByb3Blcmx5LlxuXHRcdFx0XHRiZ0N0cy5jYW5jZWwoKTtcblx0XHRcdFx0YmdDdHMuZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0c3RvcmUuYWRkKG91dHB1dE1vbml0b3IpO1xuXHRcdFx0b3V0cHV0TW9uaXRvci5jb250aW51ZU1vbml0b3JpbmdBc3luYyhiZ0N0cy50b2tlbik7XG5cblx0XHRcdC8vIFNlbnNpdGl2ZSBwcm9tcHRzIChwYXNzd29yZHMsIE9UUHMsIFx1MjAyNikgZGV0ZWN0ZWQgd2hpbGUgdGhlIGNvbW1hbmQgcnVuc1xuXHRcdFx0Ly8gaW4gdGhlIGJhY2tncm91bmQgbXVzdCBub3QgZ2VuZXJhdGUgYSBzdGVlcmluZyBtZXNzYWdlIFx1MjAxNCB0aGUgc2VjcmV0XG5cdFx0XHQvLyBtdXN0IG5ldmVyIHJlYWNoIHRoZSBtb2RlbC4gU2hvdyBhIGNvbmZpcm1hdGlvbiBkaWFsb2cgdGhhdCBmb2N1c2VzXG5cdFx0XHQvLyB0aGUgdGVybWluYWwgc28gdGhlIHVzZXIgY2FuIHR5cGUgdGhlIHNlY3JldCBkaXJlY3RseS5cblx0XHRcdHN0b3JlLmFkZCh0aGlzLl9yZWdpc3RlclNlbnNpdGl2ZUlucHV0RWxpY2l0YXRpb24oXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdHRlcm1pbmFsSW5zdGFuY2UsXG5cdFx0XHRcdG91dHB1dE1vbml0b3IsXG5cdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBleGVjdXRpb24gPSBSdW5JblRlcm1pbmFsVG9vbC5fYWN0aXZlRXhlY3V0aW9ucy5nZXQodGVybUlkKTtcblx0XHRcdFx0XHRleGVjdXRpb24/LmRpc3Bvc2UoKTtcblx0XHRcdFx0fSxcblx0XHRcdCkpO1xuXG5cdFx0XHQvLyBXaGVuIHRoZSBvdXRwdXQgbW9uaXRvciBkZXRlY3RzIHRoZSB0ZXJtaW5hbCBpcyB3YWl0aW5nIGZvciBpbnB1dCxcblx0XHRcdC8vIHNlbmQgYSBzdGVlcmluZyBtZXNzYWdlIHNvIHRoZSBhZ2VudCBoYW5kbGVzIGl0IHZpYSBzZW5kX3RvX3Rlcm1pbmFsLlxuXHRcdFx0c3RvcmUuYWRkKG91dHB1dE1vbml0b3Iub25EaWREZXRlY3RJbnB1dE5lZWRlZCgoKSA9PiB7XG5cdFx0XHRcdGlmICh1c2VySXNSZXBseWluZ0RpcmVjdGx5KSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IFN1cHByZXNzaW5nIGlucHV0LW5lZWRlZCBub3RpZmljYXRpb24gZm9yIHRlcm1pbmFsICR7dGVybUlkfSBiZWNhdXNlIHVzZXIgaXMgcmVwbHlpbmcgZGlyZWN0bHlgKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJZiB0aGUgdGVybWluYWwgaGFzIGJlZW4gZGlzcG9zZWQgKGUuZy4gdGhlIHVzZXIgY2xvc2VkIGl0KSwgdGhlXG5cdFx0XHRcdC8vIGJ1ZmZlcmVkIG91dHB1dCBtYXkgc3RpbGwgbWF0Y2ggYW4gaW5wdXQtcmVxdWlyZWQgcGF0dGVybiAoZm9yXG5cdFx0XHRcdC8vIGV4YW1wbGUsIGEgcGFnZXIgcHJvbXB0IGxlZnQgaW4gdGhlIHNjcm9sbGJhY2spLiBTZW5kaW5nIGFuXG5cdFx0XHRcdC8vIGlucHV0LW5lZWRlZCBzdGVlcmluZyBtZXNzYWdlIGluIHRoYXQgY2FzZSBwcm9kdWNlcyBhIHNwdXJpb3VzXG5cdFx0XHRcdC8vIGNoYXQvdG9vbCB0dXJuIGV2ZW4gdGhvdWdoIHRoZXJlJ3Mgbm8gbGl2ZSB0ZXJtaW5hbCB0byBzZW5kXG5cdFx0XHRcdC8vIGlucHV0IHRvIFx1MjAxNCB0aGUgYWdlbnQgd2lsbCBiZSBub3RpZmllZCBzZXBhcmF0ZWx5IHZpYSB0aGVcblx0XHRcdFx0Ly8gYG9uRGlzcG9zZWRgIGxpc3RlbmVyIGJlbG93LlxuXHRcdFx0XHRpZiAodGVybWluYWxJbnN0YW5jZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IFN1cHByZXNzaW5nIGlucHV0LW5lZWRlZCBub3RpZmljYXRpb24gZm9yIHRlcm1pbmFsICR7dGVybUlkfSBiZWNhdXNlIHRoZSB0ZXJtaW5hbCBpcyBkaXNwb3NlZGApO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChoYW5kbGVTZXNzaW9uQ2FuY2VsbGVkKCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBleGVjdXRpb24gPSBSdW5JblRlcm1pbmFsVG9vbC5fYWN0aXZlRXhlY3V0aW9ucy5nZXQodGVybUlkKTtcblx0XHRcdFx0aWYgKCFleGVjdXRpb24pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjdXJyZW50T3V0cHV0ID0gZXhlY3V0aW9uLmdldE91dHB1dCgpO1xuXHRcdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0XHRjb25zdCBpc0R1cGxpY2F0ZSA9IGN1cnJlbnRPdXRwdXQgPT09IGxhc3RJbnB1dE5lZWRlZE91dHB1dCAmJiBub3cgLSBsYXN0SW5wdXROZWVkZWROb3RpZmljYXRpb25UaW1lIDwgSU5QVVRfTkVFREVEX05PVElGSUNBVElPTl9USFJPVFRMRV9NUztcblx0XHRcdFx0aWYgKGlzRHVwbGljYXRlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxhc3RJbnB1dE5lZWRlZE91dHB1dCA9IGN1cnJlbnRPdXRwdXQ7XG5cdFx0XHRcdGxhc3RJbnB1dE5lZWRlZE5vdGlmaWNhdGlvblRpbWUgPSBub3c7XG5cdFx0XHRcdGNvbnN0IGlucHV0QWN0aW9uID0gdGhpcy5fYnVpbGRJbnB1dE5lZWRlZFN0ZWVyaW5nVGV4dChjaGF0U2Vzc2lvblJlc291cmNlLCB0ZXJtSWQsICdub25lJyk7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBgW1Rlcm1pbmFsICR7dGVybUlkfSBub3RpZmljYXRpb246IGNvbW1hbmQgbWF5IGJlIHdhaXRpbmcgZm9yIGlucHV0IFx1MjAxNCBhc3Nlc3MgdGhlIG91dHB1dCBiZWxvdy5dXFxuJHtpbnB1dEFjdGlvbn1cXG5UZXJtaW5hbCBvdXRwdXQ6XFxuJHtjdXJyZW50T3V0cHV0fWA7XG5cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IElucHV0IG5lZWRlZCBpbiBiYWNrZ3JvdW5kIHRlcm1pbmFsICR7dGVybUlkfSwgbm90aWZ5aW5nIGNoYXQgc2Vzc2lvbmApO1xuXG5cdFx0XHRcdHRoaXMuX2NoYXRTZXJ2aWNlLnNlbmRSZXF1ZXN0KGNoYXRTZXNzaW9uUmVzb3VyY2UsIG1lc3NhZ2UsIHtcblx0XHRcdFx0XHQuLi5zZW5kT3B0aW9ucyxcblx0XHRcdFx0XHRxdWV1ZTogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcsXG5cdFx0XHRcdFx0aXNTeXN0ZW1Jbml0aWF0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0c3lzdGVtSW5pdGlhdGVkTGFiZWw6IGxvY2FsaXplKCd0ZXJtaW5hbEFzc2Vzc2luZ091dHB1dCcsIFwiezB9IG1heSBuZWVkIGlucHV0XCIsIGNvbW1hbmREaXNwbGF5KSxcblx0XHRcdFx0XHR0ZXJtaW5hbEV4ZWN1dGlvbklkOiB0ZXJtSWQsXG5cdFx0XHRcdH0pLmNhdGNoKGUgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgUnVuSW5UZXJtaW5hbFRvb2w6IEZhaWxlZCB0byBzZW5kIGlucHV0LW5lZWRlZCBub3RpZmljYXRpb24gZm9yIHRlcm1pbmFsICR7dGVybUlkfWAsIGUpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBXaGVuIHRoZSB1c2VyIHR5cGVzIGRpcmVjdGx5IGluIHRoZSB0ZXJtaW5hbCwgZGlzbWlzcyBhbnkgcGVuZGluZ1xuXHRcdC8vIHF1ZXN0aW9uIGNhcm91c2VsIGZvciB0aGlzIHRlcm1pbmFsIHNvIHRoZSB0b29sIGludm9jYXRpb24gaXNcblx0XHQvLyB1bmJsb2NrZWQgYW5kIHRoZSBjYXJvdXNlbCBkb2Vzbid0IGxpbmdlci4gQWxzbyBzdXBwcmVzcyBmdXR1cmVcblx0XHQvLyBpbnB1dC1uZWVkZWQgbm90aWZpY2F0aW9ucyBzaW5jZSB0aGUgdXNlciBpcyBoYW5kbGluZyBwcm9tcHRzLlxuXHRcdHN0b3JlLmFkZCh0ZXJtaW5hbEluc3RhbmNlLm9uRGlkSW5wdXREYXRhKCgpID0+IHtcblx0XHRcdGlmICh1c2VySXNSZXBseWluZ0RpcmVjdGx5KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHVzZXJJc1JlcGx5aW5nRGlyZWN0bHkgPSB0cnVlO1xuXHRcdFx0dGhpcy5fZGlzbWlzc1BlbmRpbmdDYXJvdXNlbHNGb3JUZXJtaW5hbChjaGF0U2Vzc2lvblJlc291cmNlLCB0ZXJtSWQpO1xuXHRcdH0pKTtcblxuXHRcdHN0b3JlLmFkZChzZXNzaW9uUmVmKTtcblxuXHRcdHN0b3JlLmFkZChjb21tYW5kRGV0ZWN0aW9uLm9uQ29tbWFuZEZpbmlzaGVkKGNvbW1hbmQgPT4ge1xuXHRcdFx0Y29uc3QgZXhlY3V0aW9uID0gUnVuSW5UZXJtaW5hbFRvb2wuX2FjdGl2ZUV4ZWN1dGlvbnMuZ2V0KHRlcm1JZCk7XG5cdFx0XHRpZiAoIWV4ZWN1dGlvbikge1xuXHRcdFx0XHRkaXNwb3NlTm90aWZpY2F0aW9uKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGhhbmRsZVNlc3Npb25DYW5jZWxsZWQoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIERpc3Bvc2UgYWZ0ZXIgZmlyc3Qgbm90aWZpY2F0aW9uIHRvIGF2b2lkIGNoYXR0eSByZXBlYXRlZCBtZXNzYWdlc1xuXHRcdFx0Ly8gaWYgdGhlIHVzZXIgcnVucyBhZGRpdGlvbmFsIGNvbW1hbmRzIHZpYSBzZW5kX3RvX3Rlcm1pbmFsLlxuXHRcdFx0ZGlzcG9zZU5vdGlmaWNhdGlvbigpO1xuXG5cdFx0XHRjb25zdCBleGl0Q29kZSA9IGNvbW1hbmQuZXhpdENvZGU7XG5cdFx0XHQvLyBBIHN1Y2Nlc3NmdWwgY29tcGxldGlvbiBpcyBhbHJlYWR5IGNvbnZleWVkIGJ5IFwiY29tbWFuZCBjb21wbGV0ZWRcIjtcblx0XHRcdC8vIG9ubHkgc3VyZmFjZSBhbiBleGl0IGNvZGUgaW4gY2hhdCB3aGVuIGl0IHByb3ZpZGVzIGZhaWx1cmUgY29udGV4dC5cblx0XHRcdGNvbnN0IGV4aXRDb2RlVGV4dCA9IGV4aXRDb2RlICE9PSB1bmRlZmluZWQgJiYgZXhpdENvZGUgIT09IDAgPyBgIHdpdGggZXhpdCBjb2RlICR7ZXhpdENvZGV9YCA6ICcnO1xuXHRcdFx0Y29uc3QgY3VycmVudE91dHB1dCA9IGV4ZWN1dGlvbi5nZXRPdXRwdXQoKTtcblx0XHRcdC8vIE9ubHkgZGlzcG9zZSBpZiB0aGUgdGVybWluYWwgaXMgc3RpbGwgaGlkZGVuIGZyb20gdGhlIHVzZXIuIE9uY2UgdGhlXG5cdFx0XHQvLyB1c2VyIHJldmVhbHMgaXQgKHZpYSB0aGUgXCJTaG93XCIgbGluayksIGl0IGpvaW5zIGBmb3JlZ3JvdW5kSW5zdGFuY2VzYFxuXHRcdFx0Ly8gYW5kIHNob3VsZCBwZXJzaXN0IHNvIHRoZXkgY2FuIGluc3BlY3QvaW50ZXJhY3Qgd2l0aCBpdC5cblx0XHRcdGNvbnN0IGlzVXNlclZpc2libGUgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuZm9yZWdyb3VuZEluc3RhbmNlcy5pbmNsdWRlcyh0ZXJtaW5hbEluc3RhbmNlKTtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBpc1VzZXJWaXNpYmxlXG5cdFx0XHRcdD8gYFtUZXJtaW5hbCAke3Rlcm1JZH0gbm90aWZpY2F0aW9uOiBjb21tYW5kIGNvbXBsZXRlZCR7ZXhpdENvZGVUZXh0fS4gVXNlIHNlbmRfdG9fdGVybWluYWwgdG8gc2VuZCBhbm90aGVyIGNvbW1hbmQgb3Iga2lsbF90ZXJtaW5hbCB0byBzdG9wIGl0Ll1cXG5UZXJtaW5hbCBvdXRwdXQ6XFxuJHtjdXJyZW50T3V0cHV0fWBcblx0XHRcdFx0OiBgW1Rlcm1pbmFsICR7dGVybUlkfSBub3RpZmljYXRpb246IGNvbW1hbmQgY29tcGxldGVkJHtleGl0Q29kZVRleHR9LiBUaGUgdGVybWluYWwgaGFzIGJlZW4gY2xlYW5lZCB1cC5dXFxuVGVybWluYWwgb3V0cHV0OlxcbiR7Y3VycmVudE91dHB1dH1gO1xuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogQ29tbWFuZCBjb21wbGV0ZWQgaW4gYmFja2dyb3VuZCB0ZXJtaW5hbCAke3Rlcm1JZH0sIG5vdGlmeWluZyBjaGF0IHNlc3Npb25gKTtcblxuXHRcdFx0dGhpcy5fY2hhdFNlcnZpY2Uuc2VuZFJlcXVlc3QoY2hhdFNlc3Npb25SZXNvdXJjZSwgbWVzc2FnZSwge1xuXHRcdFx0XHQuLi5zZW5kT3B0aW9ucyxcblx0XHRcdFx0cXVldWU6IENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nLFxuXHRcdFx0XHRpc1N5c3RlbUluaXRpYXRlZDogdHJ1ZSxcblx0XHRcdFx0c3lzdGVtSW5pdGlhdGVkTGFiZWw6IGxvY2FsaXplKCd0ZXJtaW5hbENvbW1hbmRDb21wbGV0ZWQnLCBcInswfSBjb21wbGV0ZWRcIiwgY29tbWFuZERpc3BsYXkpLFxuXHRcdFx0XHR0ZXJtaW5hbEV4ZWN1dGlvbklkOiB0ZXJtSWQsXG5cdFx0XHR9KS5jYXRjaChlID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBSdW5JblRlcm1pbmFsVG9vbDogRmFpbGVkIHRvIHNlbmQgY29tcGxldGlvbiBub3RpZmljYXRpb24gZm9yIHRlcm1pbmFsICR7dGVybUlkfWAsIGUpO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEJhY2tncm91bmQgdGVybWluYWxzIGFyZSBub3QgcmV1c2VkLCBzbyBkaXNwb3NlIHRoZW0gb25jZSB0aGVpclxuXHRcdFx0Ly8gY29tbWFuZCBjb21wbGV0ZXMgdG8gcHJldmVudCB0ZXJtaW5hbCBhY2N1bXVsYXRpb24gYWNyb3NzIHR1cm5zLlxuXHRcdFx0Ly8gT25seSBkaXNwb3NlIGlmIHRoZSB1c2VyIGhhc24ndCByZXZlYWxlZCB0aGUgdGVybWluYWwgXHUyMDE0IG9uY2UgcmV2ZWFsZWRcblx0XHRcdC8vIGl0IGpvaW5zIGBmb3JlZ3JvdW5kSW5zdGFuY2VzYCBhbmQgdGhleSBtYXkgd2FudCB0byBpbnNwZWN0IGl0c1xuXHRcdFx0Ly8gb3V0cHV0IG9yIGludGVyYWN0IHdpdGggaXQuXG5cdFx0XHQvLyBDYXB0dXJlIHRoZSBvdXRwdXQgc25hcHNob3QgZmlyc3Qgc28gdGhlIHByb2dyZXNzIHBhcnQgY2FuIHN0aWxsXG5cdFx0XHQvLyBkaXNwbGF5IG91dHB1dCBhZnRlciB0aGUgdGVybWluYWwgaW5zdGFuY2UgaXMgZ29uZS5cblx0XHRcdC8vIFJlLWNoZWNrIGZvcmVncm91bmRJbnN0YW5jZXMgaW5zaWRlIHRoZSBjYWxsYmFjayBiZWNhdXNlIHRoZSB1c2VyXG5cdFx0XHQvLyBtYXkgY2xpY2sgdGhlIFwiU2hvd1wiIGxpbmsgd2hpbGUgY2FwdHVyZSBpcyBpbiBwcm9ncmVzcy5cblx0XHRcdHRoaXMuX2NvbW1hbmRBcnRpZmFjdENvbGxlY3Rvci5jYXB0dXJlKHRvb2xTcGVjaWZpY0RhdGEsIHRlcm1pbmFsSW5zdGFuY2UsIGNvbW1hbmQuaWQpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fdGVybWluYWxTZXJ2aWNlLmZvcmVncm91bmRJbnN0YW5jZXMuaW5jbHVkZXModGVybWluYWxJbnN0YW5jZSkpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogQmFja2dyb3VuZCB0ZXJtaW5hbCAke3Rlcm1JZH0gd2FzIHJldmVhbGVkIGJ5IHVzZXIsIHNraXBwaW5nIGRpc3Bvc2FsYCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBEaXNwb3NpbmcgZmluaXNoZWQgYmFja2dyb3VuZCB0ZXJtaW5hbCAke3Rlcm1JZH1gKTtcblx0XHRcdFx0Ly8gTWFyayBhcyBraWxsZWQgc28gdGhlIG9uRGlzcG9zZWQgaGFuZGxlciBiZWxvdyBkb2VzIG5vdFxuXHRcdFx0XHQvLyBzZW5kIGEgcmVkdW5kYW50IFwidGVybWluYWwgZXhpdGVkXCIgc3RlZXJpbmcgbWVzc2FnZS5cblx0XHRcdFx0UnVuSW5UZXJtaW5hbFRvb2wuX2tpbGxlZEJ5VG9vbC5hZGQodGVybUlkKTtcblx0XHRcdFx0ZXhlY3V0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fZGVsZXRlQWN0aXZlRXhlY3V0aW9uKHRlcm1JZCk7XG5cdFx0XHRcdHRlcm1pbmFsSW5zdGFuY2UuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2xlYW4gdXAgYWxsIGJhY2tncm91bmQgcmVzb3VyY2VzIHdoZW4gdGhlIHRlcm1pbmFsIGlzIGRpc3Bvc2VkXG5cdFx0Ly8gKGUuZy4gdXNlciBjbG9zZXMgdGhlIHRlcm1pbmFsKS4gU2VuZCBhIGNvbXBsZXRpb24gbm90aWZpY2F0aW9uIHNvXG5cdFx0Ly8gdGhlIGFnZW50IGlzbid0IGxlZnQgd2FpdGluZyBmb3IgYW4gYG9uQ29tbWFuZEZpbmlzaGVkYCBldmVudCB0aGF0XG5cdFx0Ly8gd2lsbCBuZXZlciBmaXJlIFx1MjAxNCB0aGUgcHR5IGV4aXRlZCBiZWZvcmUgc2hlbGwgaW50ZWdyYXRpb24gY291bGRcblx0XHQvLyBlbWl0IHRoZSBlbmQgbWFya2VyLiBPdXRwdXQgY2FwdHVyZWQgaGVyZSBpcyB3aGF0ZXZlciB3YXMgYnVmZmVyZWRcblx0XHQvLyB1cCB1bnRpbCBkaXNwb3NhbC5cblx0XHQvLyBDYXB0dXJlIHRoZSBleGVjdXRpb24gcmVmZXJlbmNlIG5vdyBcdTIwMTQgYnkgdGhlIHRpbWUgb25EaXNwb3NlZCBmaXJlcyxcblx0XHQvLyBvbkRpZERpc3Bvc2VJbnN0YW5jZSBsaXN0ZW5lcnMgbWF5IGhhdmUgYWxyZWFkeSByZW1vdmVkIGl0IGZyb21cblx0XHQvLyBfYWN0aXZlRXhlY3V0aW9ucy5cblx0XHRjb25zdCBleGVjdXRpb25Gb3JEaXNwb3NhbCA9IFJ1bkluVGVybWluYWxUb29sLl9hY3RpdmVFeGVjdXRpb25zLmdldCh0ZXJtSWQpO1xuXHRcdHN0b3JlLmFkZCh0ZXJtaW5hbEluc3RhbmNlLm9uRGlzcG9zZWQoKCkgPT4ge1xuXHRcdFx0Ly8gSWYga2lsbF90ZXJtaW5hbCBpcyBkaXNwb3NpbmcgdGhpcyB0ZXJtaW5hbCwgdGhlIGFnZW50IHdpbGxcblx0XHRcdC8vIHJlY2VpdmUgdGhlIG91dHB1dCB0aHJvdWdoIHRoZSBub3JtYWwgdG9vbC1yZXN1bHQgZmxvdyBcdTIwMTRcblx0XHRcdC8vIHNraXAgdGhlIHJlZHVuZGFudCBzdGVlcmluZyBtZXNzYWdlLlxuXHRcdFx0aWYgKFJ1bkluVGVybWluYWxUb29sLl9raWxsZWRCeVRvb2wuaGFzKHRlcm1JZCkpIHtcblx0XHRcdFx0ZGlzcG9zZU5vdGlmaWNhdGlvbigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBEdXJpbmcgVlMgQ29kZSBzaHV0ZG93biwgdGVybWluYWxzIGFyZSBkaXNwb3NlZCBhcyBwYXJ0IG9mXG5cdFx0XHQvLyBub3JtYWwgY2xlYW51cC4gU3VwcHJlc3Mgbm90aWZpY2F0aW9ucyBzbyB0aGV5IGRvbid0IHBlcnNpc3Rcblx0XHRcdC8vIGFzIHVuZGVsaXZlcmFibGUgc3RlZXJpbmcgbWVzc2FnZXMgYWZ0ZXIgcmVzdGFydCAoIzMxNDc5MSkuXG5cdFx0XHRpZiAodGhpcy5faXNTaHV0dGluZ0Rvd24pIHtcblx0XHRcdFx0ZGlzcG9zZU5vdGlmaWNhdGlvbigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBTa2lwIHN0ZWVyaW5nIG1lc3NhZ2Ugd2hlbiB1c2VyIG1hbnVhbGx5IGNsb3NlZCB0aGUgdGVybWluYWwgKCMzMTcwNTkpLlxuXHRcdFx0aWYgKHRlcm1pbmFsSW5zdGFuY2UuZXhpdFJlYXNvbiA9PT0gVGVybWluYWxFeGl0UmVhc29uLlVzZXIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IEJhY2tncm91bmQgdGVybWluYWwgJHt0ZXJtSWR9IGNsb3NlZCBieSB1c2VyLCBzdXBwcmVzc2luZyBzdGVlcmluZyBtZXNzYWdlYCk7XG5cdFx0XHRcdGRpc3Bvc2VOb3RpZmljYXRpb24oKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhhbmRsZVNlc3Npb25DYW5jZWxsZWQoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjdXJyZW50T3V0cHV0ID0gZXhlY3V0aW9uRm9yRGlzcG9zYWw/LmdldE91dHB1dCgpID8/ICcnO1xuXHRcdFx0Y29uc3QgZXhpdENvZGUgPSB0ZXJtaW5hbEluc3RhbmNlLmV4aXRDb2RlO1xuXHRcdFx0Ly8gQXZvaWQgcmVwb3J0aW5nIGEgc3VjY2Vzc2Z1bCBleGl0IGNvZGUgYXMgZGlhZ25vc3RpYyBpbmZvcm1hdGlvbiBpbiBjaGF0LlxuXHRcdFx0Y29uc3QgZXhpdENvZGVUZXh0ID0gZXhpdENvZGUgIT09IHVuZGVmaW5lZCAmJiBleGl0Q29kZSAhPT0gMCA/IGAgd2l0aCBleGl0IGNvZGUgJHtleGl0Q29kZX1gIDogJyc7XG5cdFx0XHRkaXNwb3NlTm90aWZpY2F0aW9uKCk7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gYFtUZXJtaW5hbCAke3Rlcm1JZH0gbm90aWZpY2F0aW9uOiB0ZXJtaW5hbCBleGl0ZWQke2V4aXRDb2RlVGV4dH0uIFRoZSB0ZXJtaW5hbCBwcm9jZXNzIGVuZGVkIGJlZm9yZSB0aGUgY29tbWFuZCBjb3VsZCBjb21wbGV0ZSBub3JtYWxseTsgZnVydGhlciBjb21tYW5kcyBjYW5ub3QgYmUgc2VudCB0byB0aGlzIHRlcm1pbmFsIElELl1cXG5UZXJtaW5hbCBvdXRwdXQ6XFxuJHtjdXJyZW50T3V0cHV0fWA7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogQmFja2dyb3VuZCB0ZXJtaW5hbCAke3Rlcm1JZH0gZGlzcG9zZWQke2V4aXRDb2RlVGV4dH0sIG5vdGlmeWluZyBjaGF0IHNlc3Npb25gKTtcblx0XHRcdHRoaXMuX2NoYXRTZXJ2aWNlLnNlbmRSZXF1ZXN0KGNoYXRTZXNzaW9uUmVzb3VyY2UsIG1lc3NhZ2UsIHtcblx0XHRcdFx0Li4uc2VuZE9wdGlvbnMsXG5cdFx0XHRcdHF1ZXVlOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5TdGVlcmluZyxcblx0XHRcdFx0aXNTeXN0ZW1Jbml0aWF0ZWQ6IHRydWUsXG5cdFx0XHRcdHN5c3RlbUluaXRpYXRlZExhYmVsOiBsb2NhbGl6ZSgndGVybWluYWxQcm9jZXNzRXhpdGVkJywgXCJ7MH0gdGVybWluYWwgZXhpdGVkXCIsIGNvbW1hbmREaXNwbGF5KSxcblx0XHRcdFx0dGVybWluYWxFeGVjdXRpb25JZDogdGVybUlkLFxuXHRcdFx0fSkuY2F0Y2goZSA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgUnVuSW5UZXJtaW5hbFRvb2w6IEZhaWxlZCB0byBzZW5kIHRlcm1pbmFsLWV4aXRlZCBub3RpZmljYXRpb24gZm9yIHRlcm1pbmFsICR7dGVybUlkfWAsIGUpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gV2hlbiBhIGNoZWNrcG9pbnQgaXMgcmVzdG9yZWQsIHJlcXVlc3RzIGFyZSByZW1vdmVkIGZyb20gdGhlIG1vZGVsLlxuXHRcdC8vIENhbmNlbCB0aGUgYmFja2dyb3VuZCBub3RpZmljYXRpb24gYW5kIGRpc3Bvc2UgdGhlIHRlcm1pbmFsIHNvIHRoYXRcblx0XHQvLyBiYWNrZ3JvdW5kIHByb2Nlc3NlcyBkb24ndCBvdXRsaXZlIHRoZSByb2xsZWQtYmFjayBzZXNzaW9uIHN0YXRlLlxuXHRcdHN0b3JlLmFkZChzZXNzaW9uUmVmLm9iamVjdC5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmtpbmQgPT09ICdyZW1vdmVSZXF1ZXN0Jykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogUmVxdWVzdCByZW1vdmVkIGZyb20gc2Vzc2lvbiwgY2xlYW5pbmcgdXAgYmFja2dyb3VuZCB0ZXJtaW5hbCAke3Rlcm1JZH1gKTtcblx0XHRcdFx0UnVuSW5UZXJtaW5hbFRvb2wuX2FjdGl2ZUV4ZWN1dGlvbnMuZ2V0KHRlcm1JZCk/LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fZGVsZXRlQWN0aXZlRXhlY3V0aW9uKHRlcm1JZCk7XG5cdFx0XHRcdGRpc3Bvc2VOb3RpZmljYXRpb24oKTtcblx0XHRcdFx0dGVybWluYWxJbnN0YW5jZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fYmFja2dyb3VuZE5vdGlmaWNhdGlvbnMuc2V0KG5vdGlmaWNhdGlvbktleSwgc3RvcmUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpbmQgYW5kIGRpc21pc3MgYW55IHBlbmRpbmcgKG5vdCB5ZXQgYW5zd2VyZWQpIHF1ZXN0aW9uIGNhcm91c2VscyB0aGF0XG5cdCAqIGFyZSBhc3NvY2lhdGVkIHdpdGggdGhlIGdpdmVuIHRlcm1pbmFsLiBUaGlzIGlzIGNhbGxlZCB3aGVuIHRoZSB1c2VyXG5cdCAqIHR5cGVzIGRpcmVjdGx5IGludG8gdGhlIHRlcm1pbmFsLCBieXBhc3NpbmcgdGhlIGNhcm91c2VsIFVJLlxuXHQgKi9cblx0cHJpdmF0ZSBfZGlzbWlzc1BlbmRpbmdDYXJvdXNlbHNGb3JUZXJtaW5hbChjaGF0U2Vzc2lvblJlc291cmNlOiBVUkksIHRlcm1JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9jaGF0U2VydmljZS5nZXRTZXNzaW9uKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBXYWxrIGluIHJldmVyc2UgXHUyMDE0IHRoZXJlIHNob3VsZCBiZSBhdCBtb3N0IG9uZSBwZW5kaW5nIGNhcm91c2VsIHBlciB0ZXJtaW5hbC5cblx0XHRjb25zdCByZXF1ZXN0cyA9IG1vZGVsLmdldFJlcXVlc3RzKCk7XG5cdFx0Zm9yIChsZXQgaSA9IHJlcXVlc3RzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IHJlcXVlc3RzW2ldLnJlc3BvbnNlO1xuXHRcdFx0aWYgKCFyZXNwb25zZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcnRzID0gcmVzcG9uc2UucmVzcG9uc2UudmFsdWU7XG5cdFx0XHRmb3IgKGxldCBqID0gcGFydHMubGVuZ3RoIC0gMTsgaiA+PSAwOyBqLS0pIHtcblx0XHRcdFx0Y29uc3QgcGFydCA9IHBhcnRzW2pdO1xuXHRcdFx0XHRpZiAocGFydCBpbnN0YW5jZW9mIENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSAmJiBwYXJ0LnRlcm1pbmFsSWQgPT09IHRlcm1JZCAmJiAhcGFydC5pc1VzZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogRGlzbWlzc2luZyBwZW5kaW5nIGNhcm91c2VsIGZvciB0ZXJtaW5hbCAke3Rlcm1JZH0gYmVjYXVzZSB1c2VyIHR5cGVkIGRpcmVjdGx5IGluIHRlcm1pbmFsYCk7XG5cdFx0XHRcdFx0cGFydC5kYXRhID0ge307XG5cdFx0XHRcdFx0cGFydC5pc1VzZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHBhcnQuZGlzbWlzc2VkQnlUZXJtaW5hbElucHV0ID0gdHJ1ZTtcblx0XHRcdFx0XHRwYXJ0LmNvbXBsZXRpb24uY29tcGxldGUoeyBhbnN3ZXJzOiB1bmRlZmluZWQgfSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdC8vICNlbmRyZWdpb25cbn1cblxuLyoqXG4gKiBSZXByZXNlbnRzIGFuIGFjdGl2ZSB0ZXJtaW5hbCBjb21tYW5kIGV4ZWN1dGlvbiB0aGF0IGNhbiBydW4gaW4gZWl0aGVyIGZvcmVncm91bmQgb3IgYmFja2dyb3VuZFxuICogbW9kZS4gVGhpcyB1bmlmaWVkIGNsYXNzIHJlcGxhY2VzIHRoZSBwcmV2aW91cyBzcGxpdCBiZXR3ZWVuIGZvcmVncm91bmQgc3RyYXRlZ3kgZXhlY3V0aW9uIGFuZFxuICogQmFja2dyb3VuZFRlcm1pbmFsRXhlY3V0aW9uLCBhbGxvd2luZyBzZWFtbGVzcyBzd2l0Y2hpbmcgYmV0d2VlbiBtb2Rlcy5cbiAqL1xuY2xhc3MgQWN0aXZlVGVybWluYWxFeGVjdXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFjdGl2ZVRlcm1pbmFsRXhlY3V0aW9uIHtcblx0cHJpdmF0ZSBfc3RhcnRNYXJrZXI6IElYdGVybU1hcmtlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNCYWNrZ3JvdW5kOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21wbGV0aW9uRGVmZXJyZWQ6IERlZmVycmVkUHJvbWlzZTxJVGVybWluYWxFeGVjdXRlU3RyYXRlZ3lSZXN1bHQ+O1xuXG5cdC8qKlxuXHQgKiBUaGUgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gdGhlIGV4ZWN1dGUgc3RyYXRlZ3kgY29tcGxldGVzLiBDYW4gYmUgYXdhaXRlZCB0byBnZXQgdGhlXG5cdCAqIGZ1bGwgcmVzdWx0IHdpdGggZXhpdCBjb2RlLlxuXHQgKi9cblx0Z2V0IGNvbXBsZXRpb25Qcm9taXNlKCk6IFByb21pc2U8SVRlcm1pbmFsRXhlY3V0ZVN0cmF0ZWd5UmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbXBsZXRpb25EZWZlcnJlZC5wO1xuXHR9XG5cblx0Z2V0IGlzQmFja2dyb3VuZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNCYWNrZ3JvdW5kO1xuXHR9XG5cblx0Z2V0IHN0YXJ0TWFya2VyKCk6IElYdGVybU1hcmtlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXJ0TWFya2VyO1xuXHR9XG5cblx0cmVhZG9ubHkgc3RyYXRlZ3k6IElUZXJtaW5hbEV4ZWN1dGVTdHJhdGVneTtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9vbFRlcm1pbmFsOiBJVG9vbFRlcm1pbmFsO1xuXG5cdGdldCBpbnN0YW5jZSgpOiBJVGVybWluYWxJbnN0YW5jZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rvb2xUZXJtaW5hbC5pbnN0YW5jZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJLFxuXHRcdHJlYWRvbmx5IHRlcm1JZDogc3RyaW5nLFxuXHRcdHRvb2xUZXJtaW5hbDogSVRvb2xUZXJtaW5hbCxcblx0XHRjb21tYW5kRGV0ZWN0aW9uOiBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHksXG5cdFx0aXNCYWNrZ3JvdW5kOiBib29sZWFuLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl90b29sVGVybWluYWwgPSB0b29sVGVybWluYWw7XG5cdFx0dGhpcy5faXNCYWNrZ3JvdW5kID0gaXNCYWNrZ3JvdW5kO1xuXHRcdHRoaXMuX2NvbXBsZXRpb25EZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8SVRlcm1pbmFsRXhlY3V0ZVN0cmF0ZWd5UmVzdWx0PigpO1xuXG5cdFx0Ly8gQ3JlYXRlIGFuZCByZWdpc3RlciB0aGUgc3RyYXRlZ3kgZm9yIGRpc3Bvc2FsIHRvIGNsZWFuIHVwIGl0cyBpbnRlcm5hbCByZXNvdXJjZXNcblx0XHR0aGlzLnN0cmF0ZWd5ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fY3JlYXRlU3RyYXRlZ3koY29tbWFuZERldGVjdGlvbikpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdHJhdGVneS5vbkRpZENyZWF0ZVN0YXJ0TWFya2VyKG1hcmtlciA9PiB7XG5cdFx0XHRpZiAobWFya2VyKSB7XG5cdFx0XHRcdC8vIERvbid0IHJlZ2lzdGVyIG1hcmtlciAtIHN0cmF0ZWd5IGFscmVhZHkgbWFuYWdlcyBpdHMgbGlmZWN5Y2xlXG5cdFx0XHRcdHRoaXMuX3N0YXJ0TWFya2VyID0gbWFya2VyO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVN0cmF0ZWd5KGNvbW1hbmREZXRlY3Rpb246IElDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSk6IElUZXJtaW5hbEV4ZWN1dGVTdHJhdGVneSB7XG5cdFx0Y29uc3QgaXNTeW5jTW9kZSA9ICF0aGlzLl9pc0JhY2tncm91bmQ7XG5cdFx0c3dpdGNoICh0aGlzLl90b29sVGVybWluYWwuc2hlbGxJbnRlZ3JhdGlvblF1YWxpdHkpIHtcblx0XHRcdGNhc2UgU2hlbGxJbnRlZ3JhdGlvblF1YWxpdHkuTm9uZTpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vbmVFeGVjdXRlU3RyYXRlZ3ksIHRoaXMuX3Rvb2xUZXJtaW5hbC5pbnN0YW5jZSwgKCkgPT4gdGhpcy5fdG9vbFRlcm1pbmFsLnJlY2VpdmVkVXNlcklucHV0ID8/IGZhbHNlKTtcblx0XHRcdGNhc2UgU2hlbGxJbnRlZ3JhdGlvblF1YWxpdHkuQmFzaWM6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCYXNpY0V4ZWN1dGVTdHJhdGVneSwgdGhpcy5fdG9vbFRlcm1pbmFsLmluc3RhbmNlLCAoKSA9PiB0aGlzLl90b29sVGVybWluYWwucmVjZWl2ZWRVc2VySW5wdXQgPz8gZmFsc2UsIGNvbW1hbmREZXRlY3Rpb24pO1xuXHRcdFx0Y2FzZSBTaGVsbEludGVncmF0aW9uUXVhbGl0eS5SaWNoOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmljaEV4ZWN1dGVTdHJhdGVneSwgdGhpcy5fdG9vbFRlcm1pbmFsLmluc3RhbmNlLCBjb21tYW5kRGV0ZWN0aW9uLCBpc1N5bmNNb2RlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU3RhcnRzIHRoZSBjb21tYW5kIGV4ZWN1dGlvbiB1c2luZyB0aGUgZXhlY3V0ZSBzdHJhdGVneS5cblx0ICogQHBhcmFtIGNvbW1hbmRMaW5lIFRoZSBjb21tYW5kIHRvIGV4ZWN1dGVcblx0ICogQHBhcmFtIHRva2VuIENhbmNlbGxhdGlvbiB0b2tlblxuXHQgKiBAcGFyYW0gY29tbWFuZElkIE9wdGlvbmFsIGNvbW1hbmQgSUQgZm9yIGxpbmtpbmdcblx0ICogQHJldHVybnMgVGhlIGV4ZWN1dGlvbiByZXN1bHRcblx0ICovXG5cdGFzeW5jIHN0YXJ0KGNvbW1hbmRMaW5lOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgY29tbWFuZElkPzogc3RyaW5nLCBjb21tYW5kTGluZUZvck1ldGFkYXRhPzogc3RyaW5nKTogUHJvbWlzZTxJVGVybWluYWxFeGVjdXRlU3RyYXRlZ3lSZXN1bHQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zdHJhdGVneS5leGVjdXRlKGNvbW1hbmRMaW5lLCB0b2tlbiwgY29tbWFuZElkLCBjb21tYW5kTGluZUZvck1ldGFkYXRhKTtcblx0XHRcdHRoaXMuX2NvbXBsZXRpb25EZWZlcnJlZC5jb21wbGV0ZShyZXN1bHQpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9jb21wbGV0aW9uRGVmZXJyZWQuZXJyb3IoZSk7XG5cdFx0XHR0aHJvdyBlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTd2l0Y2hlcyB0aGlzIGV4ZWN1dGlvbiB0byBmb3JlZ3JvdW5kIG1vZGUsIG1lYW5pbmcgY2FsbGVycyB3aWxsIGF3YWl0IGl0cyBjb21wbGV0aW9uLlxuXHQgKi9cblx0c2V0Rm9yZWdyb3VuZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0JhY2tncm91bmQgPSBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTd2l0Y2hlcyB0aGlzIGV4ZWN1dGlvbiB0byBiYWNrZ3JvdW5kIG1vZGUuXG5cdCAqL1xuXHRzZXRCYWNrZ3JvdW5kKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzQmFja2dyb3VuZCA9IHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgY3VycmVudCBvdXRwdXQgZnJvbSB0aGUgdGVybWluYWwuXG5cdCAqL1xuXHRnZXRPdXRwdXQobWFya2VyPzogSVh0ZXJtTWFya2VyKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZ2V0T3V0cHV0KHRoaXMuaW5zdGFuY2UsIG1hcmtlciA/PyB0aGlzLl9zdGFydE1hcmtlcik7XG5cdH1cbn1cblxuY2xhc3MgUmVzdG9yZWRUZXJtaW5hbEV4ZWN1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWN0aXZlVGVybWluYWxFeGVjdXRpb24ge1xuXHRyZWFkb25seSBjb21wbGV0aW9uUHJvbWlzZTogUHJvbWlzZTxJVGVybWluYWxFeGVjdXRlU3RyYXRlZ3lSZXN1bHQ+ID0gUHJvbWlzZS5yZXNvbHZlKHsgb3V0cHV0OiB1bmRlZmluZWQsIGVycm9yOiAncmVzdG9yZWRUZXJtaW5hbEV4ZWN1dGlvbk5vdEF3YWl0YWJsZScgfSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Z2V0T3V0cHV0KG1hcmtlcj86IElYdGVybU1hcmtlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGdldE91dHB1dCh0aGlzLmluc3RhbmNlLCBtYXJrZXIpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbFByb2ZpbGVGZXRjaGVyIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfcG9zaXhTaGVsbEZhbGxiYWNrcyA9IFsnL2Jpbi9iYXNoJywgJy91c3IvYmluL2Jhc2gnLCAnL2Jpbi9zaCddO1xuXG5cdHJlYWRvbmx5IG9zQmFja2VuZDogUHJvbWlzZTxPcGVyYXRpbmdTeXN0ZW0+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2U6IElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVRlcm1pbmFsTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJVGVybWluYWxMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLm9zQmFja2VuZCA9IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpLnRoZW4ocmVtb3RlRW52ID0+IHJlbW90ZUVudj8ub3MgPz8gT1MpO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q29waWxvdFByb2ZpbGUoKTogUHJvbWlzZTxJVGVybWluYWxQcm9maWxlPiB7XG5cdFx0Y29uc3Qgb3MgPSBhd2FpdCB0aGlzLm9zQmFja2VuZDtcblxuXHRcdC8vIENoZWNrIGZvciBjaGF0IGFnZW50IHRlcm1pbmFsIHByb2ZpbGUgZmlyc3Rcblx0XHRjb25zdCBjdXN0b21DaGF0QWdlbnRQcm9maWxlID0gdGhpcy5fZ2V0Q2hhdFRlcm1pbmFsUHJvZmlsZShvcyk7XG5cdFx0aWYgKGN1c3RvbUNoYXRBZ2VudFByb2ZpbGUpIHtcblx0XHRcdHJldHVybiBjdXN0b21DaGF0QWdlbnRQcm9maWxlO1xuXHRcdH1cblxuXHRcdC8vIFdoZW4gc2V0dGluZyBpcyBudWxsLCB1c2UgdGhlIHByZXZpb3VzIGJlaGF2aW9yXG5cdFx0Y29uc3QgZGVmYXVsdFByb2ZpbGUgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UuZ2V0RGVmYXVsdFByb2ZpbGUoe1xuXHRcdFx0b3MsXG5cdFx0XHRyZW1vdGVBdXRob3JpdHk6IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCk/LnJlbW90ZUF1dGhvcml0eVxuXHRcdH0pO1xuXG5cdFx0Ly8gRm9yY2UgcHdzaCBvdmVyIGNtZCBhcyBjbWQgZG9lc24ndCBoYXZlIHNoZWxsIGludGVncmF0aW9uXG5cdFx0aWYgKGJhc2VuYW1lKGRlZmF1bHRQcm9maWxlLnBhdGgpID09PSAnY21kLmV4ZScpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLmRlZmF1bHRQcm9maWxlLFxuXHRcdFx0XHRwYXRoOiAnQzpcXFxcV0lORE9XU1xcXFxTeXN0ZW0zMlxcXFxXaW5kb3dzUG93ZXJTaGVsbFxcXFx2MS4wXFxcXHBvd2Vyc2hlbGwuZXhlJyxcblx0XHRcdFx0cHJvZmlsZU5hbWU6ICdQb3dlclNoZWxsJ1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBGb3JjZSBiYXNoIG92ZXIgc2ggYXMgc2ggZG9lc24ndCBoYXZlIHNoZWxsIGludGVncmF0aW9uXG5cdFx0aWYgKGRlZmF1bHRQcm9maWxlLnBhdGggPT09ICcvYmluL3NoJykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4uZGVmYXVsdFByb2ZpbGUsXG5cdFx0XHRcdHBhdGg6ICcvYmluL2Jhc2gnLFxuXHRcdFx0XHRwcm9maWxlTmFtZTogJ2Jhc2gnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBWYWxpZGF0ZSB0aGUgcmVzb2x2ZWQgc2hlbGwgZXhpc3RzIG9uIGRpc2s7IGZhbGwgYmFjayB0byBhIGtub3duXG5cdFx0Ly8gUE9TSVggc2hlbGwgd2hlbiBpdCBkb2Vzbid0IChlLmcuIHByb2ZpbGUgcmVzb2x2ZXMgdG8genNoIG9uIGFcblx0XHQvLyBMaW51eCBzeXN0ZW0gd2hlcmUgenNoIGlzIG5vdCBpbnN0YWxsZWQpLlxuXHRcdGlmIChvcyAhPT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRcdGNvbnN0IHNoZWxsRXhpc3RzID0gYXdhaXQgdGhpcy5fc2hlbGxFeGlzdHMoZGVmYXVsdFByb2ZpbGUucGF0aCk7XG5cdFx0XHRpZiAoIXNoZWxsRXhpc3RzKSB7XG5cdFx0XHRcdGNvbnN0IGZhbGxiYWNrUGF0aCA9IGF3YWl0IHRoaXMuX2ZpbmRGYWxsYmFja1NoZWxsKCk7XG5cdFx0XHRcdGlmIChmYWxsYmFja1BhdGgpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFRlcm1pbmFsUHJvZmlsZUZldGNoZXI6IHJlc29sdmVkIHNoZWxsIFwiJHtkZWZhdWx0UHJvZmlsZS5wYXRofVwiIGRvZXMgbm90IGV4aXN0LCBmYWxsaW5nIGJhY2sgdG8gXCIke2ZhbGxiYWNrUGF0aH1cImApO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHQuLi5kZWZhdWx0UHJvZmlsZSxcblx0XHRcdFx0XHRcdHBhdGg6IGZhbGxiYWNrUGF0aCxcblx0XHRcdFx0XHRcdHByb2ZpbGVOYW1lOiBiYXNlbmFtZShmYWxsYmFja1BhdGgpLFxuXHRcdFx0XHRcdFx0aWNvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTZXR0aW5nIGljb246IHVuZGVmaW5lZCBhbGxvd3MgdGhlIHN5c3RlbSB0byB1c2UgdGhlIGRlZmF1bHQgQUkgdGVybWluYWwgaWNvbiAobm90IG92ZXJyaWRkZW4gb3IgcmVtb3ZlZClcblx0XHRyZXR1cm4geyAuLi5kZWZhdWx0UHJvZmlsZSwgaWNvbjogdW5kZWZpbmVkIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zaGVsbEV4aXN0cyhzaGVsbFBhdGg6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSB0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpPy5yZW1vdGVBdXRob3JpdHk7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IHJlbW90ZUF1dGhvcml0eVxuXHRcdFx0XHQ/IFVSSS5maWxlKHNoZWxsUGF0aCkud2l0aCh7IHNjaGVtZTogJ3ZzY29kZS1yZW1vdGUnLCBhdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eSB9KVxuXHRcdFx0XHQ6IFVSSS5maWxlKHNoZWxsUGF0aCk7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHJlc291cmNlKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9maW5kRmFsbGJhY2tTaGVsbCgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIFRlcm1pbmFsUHJvZmlsZUZldGNoZXIuX3Bvc2l4U2hlbGxGYWxsYmFja3MpIHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLl9zaGVsbEV4aXN0cyhjYW5kaWRhdGUpKSB7XG5cdFx0XHRcdHJldHVybiBjYW5kaWRhdGU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBnZXRDb3BpbG90U2hlbGwoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuZ2V0Q29waWxvdFByb2ZpbGUoKSkucGF0aDtcblx0fVxuXG5cdHByaXZhdGUgX2dldENoYXRUZXJtaW5hbFByb2ZpbGUob3M6IE9wZXJhdGluZ1N5c3RlbSk6IElUZXJtaW5hbFByb2ZpbGUgfCB1bmRlZmluZWQge1xuXHRcdGxldCBwcm9maWxlU2V0dGluZzogc3RyaW5nO1xuXHRcdHN3aXRjaCAob3MpIHtcblx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3M6XG5cdFx0XHRcdHByb2ZpbGVTZXR0aW5nID0gVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5UZXJtaW5hbFByb2ZpbGVXaW5kb3dzO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaDpcblx0XHRcdFx0cHJvZmlsZVNldHRpbmcgPSBUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLlRlcm1pbmFsUHJvZmlsZU1hY09zO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLkxpbnV4OlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cHJvZmlsZVNldHRpbmcgPSBUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLlRlcm1pbmFsUHJvZmlsZUxpbnV4O1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRjb25zdCBwcm9maWxlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUocHJvZmlsZVNldHRpbmcpO1xuXHRcdGlmICh0aGlzLl9pc1ZhbGlkQ2hhdEFnZW50VGVybWluYWxQcm9maWxlKHByb2ZpbGUpKSB7XG5cdFx0XHRyZXR1cm4gcHJvZmlsZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNWYWxpZENoYXRBZ2VudFRlcm1pbmFsUHJvZmlsZShwcm9maWxlOiB1bmtub3duKTogcHJvZmlsZSBpcyBJVGVybWluYWxQcm9maWxlIHtcblx0XHRpZiAocHJvZmlsZSA9PT0gbnVsbCB8fCBwcm9maWxlID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIHByb2ZpbGUgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICgncGF0aCcgaW4gcHJvZmlsZSAmJiBpc1N0cmluZygocHJvZmlsZSBhcyB7IHBhdGg6IHVua25vd24gfSkucGF0aCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFs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VyxrQkFDZCxJQUFJLEtBQUssU0FBUyxFQUFFLEtBQUssRUFBRSxRQUFRLGlCQUFpQixXQUFXLGdCQUFnQixDQUFDLElBQ2hGLElBQUksS0FBSyxTQUFTO0FBQ3JCLGFBQU8sTUFBTSxLQUFLLGFBQWEsT0FBTyxRQUFRO0FBQUEsSUFDL0MsUUFBUTtBQUNQLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxxQkFBa0Q7QUFDL0QsZUFBVyxhQUFhLHVCQUF1QixzQkFBc0I7QUFDcEUsVUFBSSxNQUFNLEtBQUssYUFBYSxTQUFTLEdBQUc7QUFDdkMsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0sa0JBQW1DO0FBQ3hDLFlBQVEsTUFBTSxLQUFLLGtCQUFrQixHQUFHO0FBQUEsRUFDekM7QUFBQSxFQUVRLHdCQUF3QixJQUFtRDtBQUNsRixRQUFJO0FBQ0osWUFBUSxJQUFJO0FBQUEsTUFDWCxLQUFLLGdCQUFnQjtBQUNwQix5QkFBaUIsZ0NBQWdDO0FBQ2pEO0FBQUEsTUFDRCxLQUFLLGdCQUFnQjtBQUNwQix5QkFBaUIsZ0NBQWdDO0FBQ2pEO0FBQUEsTUFDRCxLQUFLLGdCQUFnQjtBQUFBLE1BQ3JCO0FBQ0MseUJBQWlCLGdDQUFnQztBQUNqRDtBQUFBLElBQ0Y7QUFFQSxVQUFNLFVBQVUsS0FBSyxzQkFBc0IsU0FBUyxjQUFjO0FBQ2xFLFFBQUksS0FBSyxpQ0FBaUMsT0FBTyxHQUFHO0FBQ25ELGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGlDQUFpQyxTQUErQztBQUN2RixRQUFJLFlBQVksUUFBUSxZQUFZLFVBQWEsT0FBTyxZQUFZLFVBQVU7QUFDN0UsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLFVBQVUsV0FBVyxTQUFVLFFBQThCLElBQUksR0FBRztBQUN2RSxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFqSWEsdUJBRVksdUJBQXVCLENBQUMsYUFBYSxpQkFBaUIsU0FBUztBQUYzRSx5QkFBTjtBQUFBLEVBT0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FYVTsiLAogICJuYW1lcyI6IFsiVGVybWluYWxUb29sU3RvcmFnZUtleXNJbnRlcm5hbCIsICJjd2QiLCAiY29tbWFuZFRvRGlzcGxheSIsICJyZXF1ZXN0IiwgImV4aXRDb2RlIiwgInJlc3VsdFRleHQiLCAib3V0cHV0QW5hbHl6ZXJNZXNzYWdlIiwgImVuZEN3ZCJdCn0K
