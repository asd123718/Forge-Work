import { localize } from "../../../../../nls.js";
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from "../../../../../platform/sandbox/common/settings.js";
import { gitAutoApproveRules } from "../../../../../platform/terminal/common/autoApprove/gitAutoApproveRules.js";
import { powershellAutoApproveRules } from "../../../../../platform/terminal/common/autoApprove/powershellAutoApproveRules.js";
import { sortAutoApproveRules } from "../../../../../platform/terminal/common/autoApprove/sortAutoApproveRules.js";
import { TerminalSettingId } from "../../../../../platform/terminal/common/terminal.js";
import { terminalProfileBaseProperties } from "../../../../../platform/terminal/common/terminalPlatformConfiguration.js";
import { PolicyCategory } from "../../../../../base/common/policy.js";
const DEFAULT_IDLE_SILENCE_TIMEOUT_MS = 3e5;
var TerminalChatAgentToolsSettingId = /* @__PURE__ */ ((TerminalChatAgentToolsSettingId2) => {
  TerminalChatAgentToolsSettingId2["EnableAutoApprove"] = "chat.tools.terminal.enableAutoApprove";
  TerminalChatAgentToolsSettingId2["AutoApprove"] = "chat.tools.terminal.autoApprove";
  TerminalChatAgentToolsSettingId2["AutoApproveWorkspaceNpmScripts"] = "chat.tools.terminal.autoApproveWorkspaceNpmScripts";
  TerminalChatAgentToolsSettingId2["IgnoreDefaultAutoApproveRules"] = "chat.tools.terminal.ignoreDefaultAutoApproveRules";
  TerminalChatAgentToolsSettingId2["BlockDetectedFileWrites"] = "chat.tools.terminal.blockDetectedFileWrites";
  TerminalChatAgentToolsSettingId2["ShellIntegrationTimeout"] = "chat.tools.terminal.shellIntegrationTimeout";
  TerminalChatAgentToolsSettingId2["OutputLocation"] = "chat.tools.terminal.outputLocation";
  TerminalChatAgentToolsSettingId2["AgentSandboxLinuxFileSystem"] = "chat.agent.sandbox.fileSystem.linux";
  TerminalChatAgentToolsSettingId2["AgentSandboxMacFileSystem"] = "chat.agent.sandbox.fileSystem.mac";
  TerminalChatAgentToolsSettingId2["AgentSandboxWindowsFileSystem"] = "chat.agent.sandbox.fileSystem.windows";
  TerminalChatAgentToolsSettingId2["AgentSandboxAdvancedRuntime"] = "chat.agent.sandbox.advanced.runtime";
  TerminalChatAgentToolsSettingId2["PreventShellHistory"] = "chat.tools.terminal.preventShellHistory";
  TerminalChatAgentToolsSettingId2["EnforceTimeoutFromModel"] = "chat.tools.terminal.enforceTimeoutFromModel";
  TerminalChatAgentToolsSettingId2["IdleSilenceTimeoutMs"] = "chat.tools.terminal.idleSilenceTimeoutMs";
  TerminalChatAgentToolsSettingId2["DetachBackgroundProcesses"] = "chat.tools.terminal.detachBackgroundProcesses";
  TerminalChatAgentToolsSettingId2["BackgroundNotifications"] = "chat.tools.terminal.backgroundNotifications";
  TerminalChatAgentToolsSettingId2["OutputDeltas"] = "chat.tools.terminal.outputDeltas";
  TerminalChatAgentToolsSettingId2["OutputCompaction"] = "chat.tools.terminal.outputCompaction";
  TerminalChatAgentToolsSettingId2["IdlePollInterval"] = "chat.tools.terminal.idlePollInterval";
  TerminalChatAgentToolsSettingId2["TerminalProfileLinux"] = "chat.tools.terminal.terminalProfile.linux";
  TerminalChatAgentToolsSettingId2["TerminalProfileMacOs"] = "chat.tools.terminal.terminalProfile.osx";
  TerminalChatAgentToolsSettingId2["TerminalProfileWindows"] = "chat.tools.terminal.terminalProfile.windows";
  TerminalChatAgentToolsSettingId2["DeprecatedAutoApproveCompatible"] = "chat.agent.terminal.autoApprove";
  TerminalChatAgentToolsSettingId2["DeprecatedAutoApprove1"] = "chat.agent.terminal.allowList";
  TerminalChatAgentToolsSettingId2["DeprecatedAutoApprove2"] = "chat.agent.terminal.denyList";
  TerminalChatAgentToolsSettingId2["DeprecatedAutoApprove3"] = "github.copilot.chat.agent.terminal.allowList";
  TerminalChatAgentToolsSettingId2["DeprecatedAutoApprove4"] = "github.copilot.chat.agent.terminal.denyList";
  return TerminalChatAgentToolsSettingId2;
})(TerminalChatAgentToolsSettingId || {});
const autoApproveBoolean = {
  type: "boolean",
  enum: [
    true,
    false
  ],
  enumDescriptions: [
    localize("autoApprove.true", "Automatically approve the pattern."),
    localize("autoApprove.false", "Require explicit approval for the pattern.")
  ],
  description: localize("autoApprove.key", "The start of a command to match against. A regular expression can be provided by wrapping the string in `/` characters.")
};
const terminalChatAgentProfileSchema = {
  type: "object",
  required: ["path"],
  properties: {
    path: {
      description: localize("terminalChatAgentProfile.path", "A path to a shell executable."),
      type: "string"
    },
    ...terminalProfileBaseProperties
  }
};
const terminalChatAgentToolsConfiguration = {
  ["chat.tools.terminal.enableAutoApprove" /* EnableAutoApprove */]: {
    restricted: true,
    description: localize("autoApproveMode.description", "Controls whether to allow auto approval in the run in terminal tool."),
    type: "boolean",
    default: true,
    policy: {
      name: "ChatToolsTerminalEnableAutoApprove",
      category: PolicyCategory.IntegratedTerminal,
      minimumVersion: "1.104",
      localization: {
        description: {
          key: "autoApproveMode.description",
          value: localize("autoApproveMode.description", "Controls whether to allow auto approval in the run in terminal tool.")
        }
      }
    },
    agentsWindow: { default: true }
  },
  ["chat.tools.terminal.autoApprove" /* AutoApprove */]: {
    restricted: true,
    markdownDescription: [
      localize("autoApprove.description.intro", "A list of commands or regular expressions that control whether the run in terminal tool commands require explicit approval. These will be matched against the start of a command. A regular expression can be provided by wrapping the string in {0} characters followed by optional flags such as {1} for case-insensitivity.", "`/`", "`i`"),
      localize("autoApprove.description.values", "Set to {0} to automatically approve commands, {1} to always require explicit approval or {2} to unset the value.", "`true`", "`false`", "`null`"),
      localize("autoApprove.description.subCommands", "Note that these commands and regular expressions are evaluated for every _sub-command_ within the full _command line_, so {0} for example will need both {1} and {2} to match a {3} entry and must not match a {4} entry in order to auto approve. Inline commands such as {5} (process substitution) should also be detected.", "`foo && bar`", "`foo`", "`bar`", "`true`", "`false`", "`<(foo)`"),
      localize("autoApprove.description.commandLine", "An object can be used to match against the full command line instead of matching sub-commands and inline commands, for example {0}. In order to be auto approved _both_ the sub-command and command line must not be explicitly denied, then _either_ all sub-commands or command line needs to be approved.", "`{ approve: false, matchCommandLine: true }`"),
      localize("autoApprove.defaults", "Note that there's a default set of rules to allow and also deny commands. Consider setting {0} to {1} to ignore all default rules to ensure there are no conflicts with your own rules. Do this at your own risk, the default denial rules are designed to protect you against running dangerous commands.", `\`#${"chat.tools.terminal.ignoreDefaultAutoApproveRules" /* IgnoreDefaultAutoApproveRules */}#\``, "`true`"),
      [
        localize("autoApprove.description.examples.title", "Examples:"),
        `|${localize("autoApprove.description.examples.value", "Value")}|${localize("autoApprove.description.examples.description", "Description")}|`,
        "|---|---|",
        '| `"mkdir": true` | ' + localize("autoApprove.description.examples.mkdir", "Allow all commands starting with {0}", "`mkdir`"),
        '| `"npm run build": true` | ' + localize("autoApprove.description.examples.npmRunBuild", "Allow all commands starting with {0}", "`npm run build`"),
        '| `"bin/test.sh": true` | ' + localize("autoApprove.description.examples.binTest", "Allow all commands that match the path {0} ({1}, {2}, etc.)", "`bin/test.sh`", "`bin\\test.sh`", "`./bin/test.sh`"),
        '| `"/^git (status\\|show\\\\b.*)$/": true` | ' + localize("autoApprove.description.examples.regexGit", "Allow {0} and all commands starting with {1}", "`git status`", "`git show`"),
        '| `"/^Get-ChildItem\\\\b/i": true` | ' + localize("autoApprove.description.examples.regexCase", "will allow {0} commands regardless of casing", "`Get-ChildItem`"),
        '| `"/.*/": true` | ' + localize("autoApprove.description.examples.regexAll", "Allow all commands (denied commands still require approval)"),
        '| `"rm": false` | ' + localize("autoApprove.description.examples.rm", "Require explicit approval for all commands starting with {0}", "`rm`"),
        '| `"/\\\\.ps1/i": { approve: false, matchCommandLine: true }` | ' + localize("autoApprove.description.examples.ps1", "Require explicit approval for any _command line_ that contains {0} regardless of casing", '`".ps1"`'),
        '| `"rm": null` | ' + localize("autoApprove.description.examples.rmUnset", "Unset the default {0} value for {1}", "`false`", "`rm`")
      ].join("\n")
    ].join("\n\n"),
    type: "object",
    additionalProperties: {
      anyOf: [
        autoApproveBoolean,
        {
          type: "object",
          properties: {
            approve: autoApproveBoolean,
            matchCommandLine: {
              type: "boolean",
              enum: [
                true,
                false
              ],
              enumDescriptions: [
                localize("autoApprove.matchCommandLine.true", "Match against the full command line, eg. `foo && bar`."),
                localize("autoApprove.matchCommandLine.false", "Match against sub-commands and inline commands, eg. `foo && bar` will need both `foo` and `bar` to match.")
              ],
              description: localize("autoApprove.matchCommandLine", "Whether to match against the full command line, as opposed to splitting by sub-commands and inline commands.")
            }
          },
          required: ["approve"]
        },
        {
          type: "null",
          description: localize("autoApprove.null", "Ignore the pattern, this is useful for unsetting the same pattern set at a higher scope.")
        }
      ]
    },
    default: {
      // This is the default set of terminal auto approve commands. Note that these are best
      // effort and do not aim to provide exhaustive coverage to prevent dangerous commands
      // from executing as that is simply not feasible. Workspace trust and warnings of
      // possible prompt injection are _the_ thing protecting the user in agent mode, once
      // that trust boundary has been breached all bets are off as trusting a workspace that
      // contains anything malicious has already compromised the machine.
      //
      // Instead, the focus here is to unblock the user from approving clearly safe commands
      // frequently and cover common edge cases that could arise from the user auto-approving
      // commands.
      //
      // Take for example `find` which looks innocuous and most users are likely to auto
      // approve future calls when offered. However, the `-exec` argument can run anything. So
      // instead of leaving this decision up to the user we provide relatively safe defaults
      // and block common edge cases. So offering these default rules, despite their flaws, is
      // likely to protect the user more in general than leaving everything up to them (plus
      // make agent mode more convenient).
      // #region Safe commands
      //
      // Generally safe and common readonly commands
      cd: true,
      echo: true,
      ls: true,
      dir: true,
      pwd: true,
      cat: true,
      head: true,
      tail: true,
      findstr: true,
      wc: true,
      tr: true,
      cut: true,
      cmp: true,
      which: true,
      basename: true,
      dirname: true,
      realpath: true,
      readlink: true,
      stat: true,
      file: true,
      od: true,
      du: true,
      df: true,
      sleep: true,
      nl: true,
      // grep
      // - Variable
      // - `-f`: Read patterns from file, this is an acceptable risk since you can do similar
      //   with cat
      // - `-P`: PCRE risks include denial of service (memory exhaustion, catastrophic
      //   backtracking) which could lock up the terminal. Older PCRE versions allow code
      //   execution via this flag but this has been patched with CVEs.
      // - Variable injection is possible, but requires setting a variable which would need
      //   manual approval.
      grep: true,
      // #endregion
      // #region Safe sub-commands
      //
      // Safe and common sub-commands
      ...gitAutoApproveRules,
      // docker - readonly sub-commands
      "/^docker\\s+(ps|images|info|version|inspect|logs|top|stats|port|diff|search|events)\\b/": true,
      "/^docker\\s+(container|image|network|volume|context|system)\\s+(ls|ps|inspect|history|show|df|info)\\b/": true,
      "/^docker\\s+compose\\s+(ps|ls|top|logs|images|config|version|port|events)\\b/": true,
      // #endregion
      // #region PowerShell
      ...powershellAutoApproveRules,
      // #endregion
      // #region Package managers (npm, yarn, pnpm)
      //
      // Read-only commands that don't modify files or execute arbitrary code.
      // npm read-only commands
      "/^npm\\s+(ls|list|outdated|view|info|show|explain|why|root|prefix|bin|search|doctor|fund|repo|bugs|docs|home|help(-search)?)\\b/": true,
      "/^npm\\s+config\\s+(list|get)\\b/": true,
      "/^npm\\s+pkg\\s+get\\b/": true,
      "/^npm\\s+audit$/": true,
      "/^npm\\s+cache\\s+verify\\b/": true,
      // yarn read-only commands
      "/^yarn\\s+(list|outdated|info|why|bin|help|versions)\\b/": true,
      "/^yarn\\s+licenses\\b/": true,
      "/^yarn\\s+audit\\b(?!.*\\bfix\\b)/": true,
      "/^yarn\\s+config\\s+(list|get)\\b/": true,
      "/^yarn\\s+cache\\s+dir\\b/": true,
      // pnpm read-only commands
      "/^pnpm\\s+(ls|list|outdated|why|root|bin|doctor)\\b/": true,
      "/^pnpm\\s+licenses\\b/": true,
      "/^pnpm\\s+audit\\b(?!.*\\bfix\\b)/": true,
      "/^pnpm\\s+config\\s+(list|get)\\b/": true,
      // Safe lockfile-only installs since we trust the workspace and lock file is trusted.
      "npm ci": true,
      "/^yarn\\s+install\\s+--frozen-lockfile\\b/": true,
      "/^pnpm\\s+install\\s+--frozen-lockfile\\b/": true,
      // #endregion
      // #region Safe + disabled args
      //
      // Commands that are generally allowed with special cases we block. Note that shell
      // expansion is handled by the inline command detection when parsing sub-commands.
      // column
      // - `-c`: We block excessive columns that could lead to memory exhaustion.
      column: true,
      "/^column\\b.*\\s-c\\s+[0-9]{4,}/": false,
      // date
      // -s|--set: Sets the system clock
      date: true,
      "/^date\\b.*\\s(-s|--set)\\b/": false,
      // find
      // - `-delete`: Deletes files or directories.
      // - `-exec`/`-execdir`: Execute on results.
      // - `-fprint`/`fprintf`/`fls`: Writes files.
      // - `-ok`/`-okdir`: Like exec but with a confirmation.
      find: true,
      "/^find\\b.*\\s-(delete|exec|execdir|fprint|fprintf|fls|ok|okdir)\\b/": false,
      // rg (ripgrep)
      // - `--pre`: Executes arbitrary command as preprocessor for every file searched.
      // - `--hostname-bin`: Executes arbitrary command to get hostname.
      rg: true,
      "/^rg\\b.*\\s(--pre|--hostname-bin)\\b/": false,
      // sed
      // - `-e`/`--expression`: Add the commands in script to the set of commands to be run
      //   while processing the input.
      // - `-f`/`--file`: Add the commands contained in the file script-file to the set of
      //   commands to be run while processing the input.
      // - standalone `e`: Execute a shell command from the sed script
      // - standalone `r`/`R`: Read arbitrary files into the stream
      // - standalone `w`/`W`: Write pattern space to arbitrary files
      // - `s///e` flag: Executes substitution result as shell command
      // - `s///w` flag: Write substitution result to file
      // - Note that `--sandbox` exists which blocks unsafe commands that could potentially be
      //   leveraged to auto approve
      // - In-place editing (`-i`, `-I`, `--in-place`) is detected and blocked via file write
      //   detection if necessary
      // - These patterns are conservative: a literal `;e ` or `{e ` inside a replacement
      //   string also matches, which asks for confirmation rather than auto-approving.
      // TODO: replace sed deny regexes with a shared script analyzer — https://github.com/microsoft/vscode/issues/329218
      sed: true,
      "/^sed\\b.*\\s(-[a-zA-Z]*(e|f)[a-zA-Z]*|--expression|--file)\\b/": false,
      "/^sed\\b.*s\\/.*\\/.*\\/[ew]/": false,
      // Quoted positional script whose first command is e/r/R/w/W. The opening quote is
      // captured so the closing quote must match it, and whitespace and `!` are allowed
      // around the optional address since sed ignores them. The option prefix also skips
      // the separate operand consumed by -l/--line-length.
      "/^sed\\b(?:\\s+(?:(?:-l|--line-length)\\s+\\S+|--line-length=\\S+|-\\S+))*\\s+(['\"])\\s*(?:(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/)(?:\\s*,\\s*(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/))?)?\\s*!?\\s*[erRwW](?:\\s|\\1)/": false,
      // Same dangerous commands after a `;` or `{` separator inside a quoted script.
      // Escaped characters are consumed before testing for the matching closing quote.
      "/^sed\\b(?:\\s+(?:(?:-l|--line-length)\\s+\\S+|--line-length=\\S+|-\\S+))*\\s+(['\"])(?:\\\\.|(?!\\1).)*[;{]\\s*(?:(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/)(?:\\s*,\\s*(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/))?)?\\s*!?\\s*[erRwW](?:\\s|\\1|[;}])/": false,
      // Unquoted positional script form (e.g. `sed 1e id`, `sed w file`, `sed /pat/e file`)
      "/^sed\\b(?:\\s+(?:(?:-l|--line-length)\\s+\\S+|--line-length=\\S+|-\\S+))*\\s+(?:(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/)(?:\\s*,\\s*(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/))?)?\\s*!?\\s*[erRwW](?:\\s|$)/": false,
      ...sortAutoApproveRules,
      // tree
      // - `-o`: Output redirection can write files (`tree -o /etc/something file`) which are
      //   blocked currently
      tree: true,
      "/^tree\\b.*\\s-o\\b/": false,
      // xxd
      // - Only allow flags and a single input file as it's difficult to parse the outfile
      //   positional argument safely.
      "/^xxd$/": true,
      "/^xxd\\b(\\s+-\\S+)*\\s+[^-\\s]\\S*$/": true,
      // #endregion
      // #region Dangerous commands
      //
      // There are countless dangerous commands available on the command line, the defaults
      // here include common ones that the user is likely to want to explicitly approve first.
      // This is not intended to be a catch all as the user needs to opt-in to auto-approve
      // commands, it provides some additional safety when the commands get approved by overly
      // broad user/workspace rules.
      // Deleting files
      rm: false,
      rmdir: false,
      del: false,
      "Remove-Item": false,
      ri: false,
      rd: false,
      erase: false,
      dd: false,
      // Managing/killing processes, dangerous thing to do generally
      kill: false,
      ps: false,
      top: false,
      "Stop-Process": false,
      spps: false,
      taskkill: false,
      "taskkill.exe": false,
      // Web requests, prompt injection concerns
      curl: false,
      wget: false,
      "Invoke-RestMethod": false,
      "Invoke-WebRequest": false,
      "irm": false,
      "iwr": false,
      // File permissions and ownership, messing with these can cause hard to diagnose issues
      chmod: false,
      chown: false,
      "Set-ItemProperty": false,
      "sp": false,
      "Set-Acl": false,
      // General eval/command execution, can lead to anything else running
      jq: false,
      xargs: false,
      eval: false,
      "Invoke-Expression": false,
      iex: false
      // #endregion
    }
  },
  ["chat.tools.terminal.ignoreDefaultAutoApproveRules" /* IgnoreDefaultAutoApproveRules */]: {
    restricted: true,
    type: "boolean",
    default: false,
    tags: ["experimental"],
    markdownDescription: localize("ignoreDefaultAutoApproveRules.description", "Whether to ignore the built-in default auto-approve rules used by the run in terminal tool as defined in {0}. When this setting is enabled, the run in terminal tool will ignore any rule that comes from the default set but still follow rules defined in the user, remote and workspace settings. Use this setting at your own risk; the default auto-approve rules are designed to protect you against running dangerous commands.", `\`#${"chat.tools.terminal.autoApprove" /* AutoApprove */}#\``)
  },
  ["chat.tools.terminal.autoApproveWorkspaceNpmScripts" /* AutoApproveWorkspaceNpmScripts */]: {
    restricted: true,
    type: "boolean",
    // In order to use agent mode the workspace must be trusted, this plus the fact that
    // modifying package.json is protected means this is safe to enable by default.
    default: true,
    tags: ["experimental"],
    markdownDescription: localize("autoApproveWorkspaceNpmScripts.description", "Whether to automatically approve npm, yarn, and pnpm run commands when the script is defined in a workspace package.json file. Since the workspace is trusted, scripts defined in package.json are considered safe to run without explicit approval.")
  },
  ["chat.tools.terminal.blockDetectedFileWrites" /* BlockDetectedFileWrites */]: {
    restricted: true,
    type: "string",
    enum: ["never", "outsideWorkspace", "all"],
    enumDescriptions: [
      localize("blockFileWrites.never", "Allow all detected file writes."),
      localize("blockFileWrites.outsideWorkspace", "Block file writes detected outside the workspace. This depends on the shell integration feature working correctly to determine the current working directory of the terminal."),
      localize("blockFileWrites.all", "Block all detected file writes.")
    ],
    default: "outsideWorkspace",
    tags: ["experimental"],
    markdownDescription: localize("blockFileWrites.description", "Controls whether detected file write operations are blocked in the run in terminal tool. When detected, this will require explicit approval regardless of whether the command would normally be auto approved. Note that this cannot detect all possible methods of writing files, this is what is currently detected:\n\n- File redirection (detected via the bash or PowerShell tree sitter grammar)\n- `sed` in-place editing (`-i`, `-I`, `--in-place`)")
  },
  ["chat.tools.terminal.shellIntegrationTimeout" /* ShellIntegrationTimeout */]: {
    markdownDescription: localize("shellIntegrationTimeout.description", "Configures the duration in milliseconds to wait for shell integration to be detected when the run in terminal tool launches a new terminal. Set to `0` to skip the wait entirely, the default value `-1` uses a variable wait time based on the value of {0} and whether it's a remote window. A large value can be useful if your shell starts very slowly.", `\`#${TerminalSettingId.ShellIntegrationEnabled}#\``),
    type: "integer",
    minimum: -1,
    maximum: 6e4,
    default: -1,
    markdownDeprecationMessage: localize("shellIntegrationTimeout.deprecated", "Use {0} instead", `\`#${TerminalSettingId.ShellIntegrationTimeout}#\``)
  },
  ["chat.tools.terminal.idlePollInterval" /* IdlePollInterval */]: {
    markdownDescription: localize("idlePollInterval.description", "Configures the idle poll interval in milliseconds used by the run in terminal tool to detect when commands have finished executing. Lower values make command detection faster but may cause false positives on slow systems. This primarily affects terminals without shell integration where idle detection is used instead of shell integration events."),
    type: "integer",
    minimum: 50,
    maximum: 1e4,
    default: 1e3
  },
  ["chat.tools.terminal.terminalProfile.linux" /* TerminalProfileLinux */]: {
    restricted: true,
    markdownDescription: localize("terminalChatAgentProfile.linux", "The terminal profile to use on Linux for chat agent's run in terminal tool."),
    type: ["object", "null"],
    default: null,
    "anyOf": [
      { type: "null" },
      terminalChatAgentProfileSchema
    ],
    defaultSnippets: [
      {
        body: {
          path: "${1}"
        }
      }
    ]
  },
  ["chat.tools.terminal.terminalProfile.osx" /* TerminalProfileMacOs */]: {
    restricted: true,
    markdownDescription: localize("terminalChatAgentProfile.osx", "The terminal profile to use on macOS for chat agent's run in terminal tool."),
    type: ["object", "null"],
    default: null,
    "anyOf": [
      { type: "null" },
      terminalChatAgentProfileSchema
    ],
    defaultSnippets: [
      {
        body: {
          path: "${1}"
        }
      }
    ]
  },
  ["chat.tools.terminal.terminalProfile.windows" /* TerminalProfileWindows */]: {
    restricted: true,
    markdownDescription: localize("terminalChatAgentProfile.windows", "The terminal profile to use on Windows for chat agent's run in terminal tool."),
    type: ["object", "null"],
    default: null,
    "anyOf": [
      { type: "null" },
      terminalChatAgentProfileSchema
    ],
    defaultSnippets: [
      {
        body: {
          path: "${1}"
        }
      }
    ]
  },
  ["chat.tools.terminal.outputLocation" /* OutputLocation */]: {
    markdownDescription: localize("outputLocation.description", "Where to show the output from the run in terminal tool."),
    type: "string",
    enum: ["terminal", "chat"],
    enumDescriptions: [
      localize("outputLocation.terminal", "Reveal the terminal in the panel or editor in addition to chat."),
      localize("outputLocation.chat", "Reveal the terminal output within chat only.")
    ],
    default: "chat",
    tags: ["experimental"],
    experiment: {
      mode: "auto"
    }
  },
  [AgentSandboxSettingId.AgentSandboxEnabled]: {
    markdownDescription: localize("agentSandbox.enabledSetting", "Controls whether agent mode uses sandboxing to restrict what tools can do. When enabled, tools like the terminal are run in a sandboxed environment to limit access to the system. Use {0} to allow all network domains.", `\`#${AgentSandboxSettingId.AgentSandboxAllowNetwork}#\``),
    type: "string",
    enum: [AgentSandboxEnabledValue.Off, AgentSandboxEnabledValue.On],
    enumDescriptions: [
      localize("agentSandbox.enabledSetting.offDescription", "Disable sandboxing for agent mode tools."),
      localize("agentSandbox.enabledSetting.onDescription", "Enable sandboxing for agent mode tools.")
    ],
    default: AgentSandboxEnabledValue.Off,
    tags: ["preview"],
    restricted: true,
    experiment: {
      mode: "auto"
    },
    policy: {
      name: "ChatAgentSandboxEnabled",
      category: PolicyCategory.IntegratedTerminal,
      minimumVersion: "1.116",
      localization: {
        description: {
          key: "agentSandbox.enabledSetting",
          value: localize("agentSandbox.enabledSetting", "Controls whether agent mode uses sandboxing to restrict what tools can do. When enabled, tools like the terminal are run in a sandboxed environment to limit access to the system. Use {0} to allow all network domains.", `\`#${AgentSandboxSettingId.AgentSandboxAllowNetwork}#\``)
        },
        enumDescriptions: [
          {
            key: "agentSandbox.enabledSetting.offDescription",
            value: localize("agentSandbox.enabledSetting.offDescription", "Disable sandboxing for agent mode tools.")
          },
          {
            key: "agentSandbox.enabledSetting.onDescription",
            value: localize("agentSandbox.enabledSetting.onDescription", "Enable sandboxing for agent mode tools.")
          }
        ]
      }
    }
  },
  [AgentSandboxSettingId.AgentSandboxWindowsEnabled]: {
    markdownDescription: localize("agentSandbox.windowsEnabledSetting", "Controls whether agent mode uses sandboxing on Windows. Use {0} to allow all network domains.", `\`#${AgentSandboxSettingId.AgentSandboxAllowNetwork}#\``),
    type: "string",
    enum: [AgentSandboxEnabledValue.Off, AgentSandboxEnabledValue.On],
    enumDescriptions: [
      localize("agentSandbox.windowsEnabledSetting.offDescription", "Disable sandboxing for agent mode tools on Windows."),
      localize("agentSandbox.windowsEnabledSetting.onDescription", "Enable sandboxing for agent mode tools on Windows.")
    ],
    default: AgentSandboxEnabledValue.Off,
    tags: ["experimental"],
    restricted: true,
    experiment: {
      mode: "auto"
    }
  },
  [AgentSandboxSettingId.AgentSandboxAllowNetwork]: {
    markdownDescription: localize("agentSandbox.allowNetwork", "When {0} is enabled, controls whether to allow all network domains in the sandbox. When enabled, the sandbox preserves file system restrictions while relaxing all network restrictions.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
    type: "boolean",
    default: false,
    tags: ["preview"],
    restricted: true,
    policy: {
      name: "ChatAgentSandboxAllowNetwork",
      category: PolicyCategory.IntegratedTerminal,
      minimumVersion: "1.127",
      localization: {
        description: {
          key: "agentSandbox.allowNetwork",
          value: localize("agentSandbox.allowNetwork", "When {0} is enabled, controls whether to allow all network domains in the sandbox. When enabled, the sandbox preserves file system restrictions while relaxing all network restrictions.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``)
        }
      }
    }
  },
  [AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands]: {
    markdownDescription: localize("agentSandbox.allowUnsandboxedCommands", "Controls whether agent mode terminal commands can run outside the sandbox after user confirmation when a sandboxed command fails or when sandbox restrictions would block the command. This applies only when {0} is enabled.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
    type: "boolean",
    default: true,
    tags: ["preview"],
    restricted: true,
    policy: {
      name: "ChatAgentSandboxAllowUnsandboxedCommands",
      category: PolicyCategory.IntegratedTerminal,
      minimumVersion: "1.116",
      localization: {
        description: {
          key: "agentSandbox.allowUnsandboxedCommands",
          value: localize("agentSandbox.allowUnsandboxedCommands", "Controls whether agent mode terminal commands can run outside the sandbox after user confirmation when a sandboxed command fails or when sandbox restrictions would block the command. This applies only when {0} is enabled.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``)
        }
      }
    }
  },
  [AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests]: {
    markdownDescription: localize("agentSandbox.retryWithAllowNetworkRequests", "Controls whether agent mode terminal commands can retry in the sandbox with unrestricted network access after user confirmation. This applies only when {0} is enabled and preserves file system sandboxing while relaxing network restrictions for an approved command.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
    type: "boolean",
    default: true,
    tags: ["preview"],
    restricted: true
  },
  [AgentSandboxSettingId.AgentSandboxAllowAutoApprove]: {
    markdownDescription: localize("agentSandbox.allowAutoApprove", "Controls whether agent mode terminal commands that run inside the sandbox are auto-approved. When disabled, the run in terminal tool uses the existing approval flow. This applies only when {0} is enabled.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
    type: "boolean",
    default: true,
    tags: ["preview"],
    restricted: true,
    policy: {
      name: "ChatAgentSandboxAllowAutoApprove",
      category: PolicyCategory.IntegratedTerminal,
      minimumVersion: "1.116",
      localization: {
        description: {
          key: "agentSandbox.allowAutoApprove",
          value: localize("agentSandbox.allowAutoApprove", "Controls whether agent mode terminal commands that run inside the sandbox are auto-approved. When disabled, the run in terminal tool uses the existing approval flow. This applies only when {0} is enabled.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``)
        }
      }
    }
  },
  ["chat.agent.sandbox.fileSystem.linux" /* AgentSandboxLinuxFileSystem */]: {
    markdownDescription: localize("agentSandbox.linuxFileSystemSetting", "Note: this setting is applicable only when {0} is enabled. Controls file system access in sandbox on Linux. Paths do not support glob patterns, only literal paths (ex: ./src/, ~/.ssh, .env). **bubblewrap** and **socat** should be installed for this setting to work.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
    type: "object",
    properties: {
      denyRead: {
        type: "array",
        description: localize("agentSandbox.linuxFileSystemSetting.denyRead", "Array of paths to deny read access. Leave empty to allow reading all paths."),
        items: { type: "string" },
        default: []
      },
      allowRead: {
        type: "array",
        description: localize("agentSandbox.linuxFileSystemSetting.allowRead", "Array of paths to re-allow read access within denied regions. Takes precedence over denyRead."),
        items: { type: "string" },
        default: []
      },
      allowWrite: {
        type: "array",
        description: localize("agentSandbox.linuxFileSystemSetting.allowWrite", "Array of additional paths to allow write access. Leave empty to disallow writes outside the workspace folders, workspace storage folder, and sandbox temp directory."),
        items: { type: "string" },
        default: []
      },
      denyWrite: {
        type: "array",
        description: localize("agentSandbox.linuxFileSystemSetting.denyWrite", "Array of paths to deny write access within allowed paths (takes precedence over allowWrite)."),
        items: { type: "string" },
        default: []
      }
    },
    default: {
      denyRead: [],
      allowRead: [],
      allowWrite: [],
      denyWrite: []
    },
    tags: ["preview"],
    restricted: true
  },
  ["chat.agent.sandbox.fileSystem.mac" /* AgentSandboxMacFileSystem */]: {
    markdownDescription: localize("agentSandbox.macFileSystemSetting", "Note: this setting is applicable only when {0} is enabled. Controls file system access in sandbox on macOS. Paths also support git-style glob patterns(ex: *.ts, ./src, ./src/**/*.ts, file?.txt).", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
    type: "object",
    properties: {
      denyRead: {
        type: "array",
        description: localize("agentSandbox.macFileSystemSetting.denyRead", "Array of paths to deny read access. Leave empty to allow reading all paths."),
        items: { type: "string" },
        default: []
      },
      allowRead: {
        type: "array",
        description: localize("agentSandbox.macFileSystemSetting.allowRead", "Array of paths to re-allow read access within denied regions. Takes precedence over denyRead."),
        items: { type: "string" },
        default: []
      },
      allowWrite: {
        type: "array",
        description: localize("agentSandbox.macFileSystemSetting.allowWrite", "Array of additional paths to allow write access. Leave empty to disallow writes outside the workspace folders, workspace storage folder, and sandbox temp directory."),
        items: { type: "string" },
        default: []
      },
      denyWrite: {
        type: "array",
        description: localize("agentSandbox.macFileSystemSetting.denyWrite", "Array of paths to deny write access within allowed paths (takes precedence over allowWrite)."),
        items: { type: "string" },
        default: []
      }
    },
    default: {
      denyRead: [],
      allowRead: [],
      allowWrite: [],
      denyWrite: []
    },
    tags: ["preview"],
    restricted: true
  },
  ["chat.agent.sandbox.fileSystem.windows" /* AgentSandboxWindowsFileSystem */]: {
    markdownDescription: localize("agentSandbox.windowsFileSystemSetting", "Note: this setting is applicable only when {0} is enabled. Controls file system access in sandbox on Windows. Paths do not support glob patterns, only literal paths (ex: C:\\src, C:\\Users\\me\\.ssh, .env).", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
    type: "object",
    properties: {
      denyRead: {
        type: "array",
        description: localize("agentSandbox.windowsFileSystemSetting.denyRead", "Array of paths to deny access. Leave empty to allow reading all paths."),
        items: { type: "string" },
        default: []
      },
      allowRead: {
        type: "array",
        description: localize("agentSandbox.windowsFileSystemSetting.allowRead", "Array of additional paths to allow read-only access. Takes precedence over denyRead."),
        items: { type: "string" },
        default: []
      },
      allowWrite: {
        type: "array",
        description: localize("agentSandbox.windowsFileSystemSetting.allowWrite", "Array of additional paths to allow read/write access. Leave empty to disallow writes outside the workspace folders, workspace storage folder, and sandbox temp directory."),
        items: { type: "string" },
        default: []
      }
    },
    default: {
      denyRead: [],
      allowRead: [],
      allowWrite: []
    },
    tags: ["preview"],
    restricted: true
  },
  [AgentSandboxSettingId.AgentSandboxWindowsSchemaVersion]: {
    // Intentionally available only to callers that explicitly set it in settings.json.
    included: false,
    restricted: true,
    type: "string"
  },
  ["chat.agent.sandbox.advanced.runtime" /* AgentSandboxAdvancedRuntime */]: {
    markdownDescription: localize("agentSandbox.runtimeSetting", "Note: this setting is applicable only when {0} is enabled. Key/value pairs are passed through to the root of the sandbox runtime configuration.", `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
    type: "object",
    default: {
      enableWeakerNestedSandbox: false
    },
    additionalProperties: true,
    tags: ["preview"],
    restricted: true
  },
  ["chat.tools.terminal.preventShellHistory" /* PreventShellHistory */]: {
    type: "boolean",
    default: true,
    markdownDescription: [
      localize("preventShellHistory.description", "Whether to exclude commands run by the terminal tool from the shell history. See below for the supported shells and the method used for each:"),
      `- \`bash\`: ${localize("preventShellHistory.description.bash", "Sets `HISTCONTROL=ignorespace` and prepends the command with space")}`,
      `- \`zsh\`: ${localize("preventShellHistory.description.zsh", "Sets `HIST_IGNORE_SPACE` option and prepends the command with space")}`,
      `- \`fish\`: ${localize("preventShellHistory.description.fish", "Sets `fish_private_mode` to prevent any command from entering history")}`,
      `- \`pwsh\`: ${localize("preventShellHistory.description.pwsh", "Sets a custom history handler via PSReadLine's `AddToHistoryHandler` to prevent any command from entering history")}`
    ].join("\n")
  },
  ["chat.tools.terminal.enforceTimeoutFromModel" /* EnforceTimeoutFromModel */]: {
    restricted: true,
    type: "boolean",
    default: true,
    tags: ["experimental"],
    experiment: {
      mode: "auto"
    },
    markdownDescription: localize("enforceTimeoutFromModel.description", "Whether to enforce the timeout value provided by the model in the run in terminal tool. When enabled, if the model provides a timeout parameter, the tool will stop tracking the command after that duration and return the output collected so far.")
  },
  ["chat.tools.terminal.idleSilenceTimeoutMs" /* IdleSilenceTimeoutMs */]: {
    restricted: true,
    type: "number",
    default: DEFAULT_IDLE_SILENCE_TIMEOUT_MS,
    minimum: 0,
    tags: ["experimental"],
    experiment: {
      mode: "auto"
    },
    markdownDescription: localize("idleSilenceTimeoutMs.description", "Number of milliseconds the run in terminal tool will wait for new output from a synchronous command before moving it to a background terminal and returning what was collected so far. The process is not killed \u2014 the tool returns the terminal ID so the model can poll, send input, or kill it. Set to {0} to disable.", "`0`")
  },
  ["chat.tools.terminal.detachBackgroundProcesses" /* DetachBackgroundProcesses */]: {
    included: false,
    restricted: true,
    type: "boolean",
    default: false,
    tags: ["experimental"],
    markdownDescription: localize("detachBackgroundProcesses.description", 'Whether to detach persistent terminal processes so they survive when VS Code exits. When enabled, commands started with `mode: "async"` (legacy: `isBackground: true`) are wrapped with `nohup` (POSIX) or `Start-Process` (Windows) so the process continues running after the terminal is disposed.')
  },
  ["chat.tools.terminal.backgroundNotifications" /* BackgroundNotifications */]: {
    restricted: true,
    type: "boolean",
    default: true,
    tags: ["experimental"],
    deprecated: true,
    markdownDeprecationMessage: localize("backgroundNotifications.deprecated", "This setting is deprecated. Terminal completion and input-needed notifications are now always enabled."),
    markdownDescription: localize("backgroundNotifications.description", "This setting is deprecated and no longer has any effect. Terminal completion and input-needed notifications are now always enabled for any command that continues running after the tool returns.")
  },
  ["chat.tools.terminal.outputDeltas" /* OutputDeltas */]: {
    restricted: true,
    type: "boolean",
    default: false,
    tags: ["experimental"],
    experiment: {
      mode: "auto"
    },
    markdownDescription: localize("outputDeltas.description", "When enabled, repeated get terminal output tool calls return only output added since the previous poll for the same terminal execution, or a short unchanged-output message when there is no new output.")
  },
  ["chat.tools.terminal.outputCompaction" /* OutputCompaction */]: {
    restricted: true,
    type: "boolean",
    default: false,
    tags: ["experimental"],
    experiment: {
      mode: "auto"
    },
    markdownDescription: localize("outputCompaction.description", "When enabled, the output of commands run by the run in terminal tool is compacted before being returned to the model, reducing the number of tokens spent on noisy output (for example progress bars or repeated log lines) while preserving the important information.")
  }
};
for (const id of [
  "chat.agent.terminal.allowList" /* DeprecatedAutoApprove1 */,
  "chat.agent.terminal.denyList" /* DeprecatedAutoApprove2 */,
  "github.copilot.chat.agent.terminal.allowList" /* DeprecatedAutoApprove3 */,
  "github.copilot.chat.agent.terminal.denyList" /* DeprecatedAutoApprove4 */,
  "chat.agent.terminal.autoApprove" /* DeprecatedAutoApproveCompatible */
]) {
  terminalChatAgentToolsConfiguration[id] = {
    ...id === "chat.agent.terminal.autoApprove" /* DeprecatedAutoApproveCompatible */ ? { restricted: true } : {},
    deprecated: true,
    markdownDeprecationMessage: localize("autoApprove.deprecated", "Use {0} instead", `\`#${"chat.tools.terminal.autoApprove" /* AutoApprove */}#\``)
  };
}
export {
  DEFAULT_IDLE_SILENCE_TIMEOUT_MS,
  TerminalChatAgentToolsSettingId,
  terminalChatAgentToolsConfiguration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGNvbW1vblxcdGVybWluYWxDaGF0QWdlbnRUb29sc0NvbmZpZ3VyYXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgdHlwZSBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZSwgQWdlbnRTYW5kYm94U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc2FuZGJveC9jb21tb24vc2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgZ2l0QXV0b0FwcHJvdmVSdWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9hdXRvQXBwcm92ZS9naXRBdXRvQXBwcm92ZVJ1bGVzLmpzJztcbmltcG9ydCB7IHBvd2Vyc2hlbGxBdXRvQXBwcm92ZVJ1bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2F1dG9BcHByb3ZlL3Bvd2Vyc2hlbGxBdXRvQXBwcm92ZVJ1bGVzLmpzJztcbmltcG9ydCB7IHNvcnRBdXRvQXBwcm92ZVJ1bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2F1dG9BcHByb3ZlL3NvcnRBdXRvQXBwcm92ZVJ1bGVzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IHRlcm1pbmFsUHJvZmlsZUJhc2VQcm9wZXJ0aWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsUGxhdGZvcm1Db25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFBvbGljeUNhdGVnb3J5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcG9saWN5LmpzJztcblxuLyoqXG4gKiBEZWZhdWx0IGlkbGUgc2lsZW5jZSB0aW1lb3V0IGluIG1pbGxpc2Vjb25kcy4gVXNlZCBhcyBib3RoIHRoZSBjb25maWd1cmF0aW9uXG4gKiBkZWZhdWx0IGFuZCB0aGUgcnVudGltZSBmYWxsYmFjayB3aGVuIHRoZSBzZXR0aW5nIGlzIHVuYXZhaWxhYmxlLlxuICovXG5leHBvcnQgY29uc3QgREVGQVVMVF9JRExFX1NJTEVOQ0VfVElNRU9VVF9NUyA9IDMwMF8wMDA7IC8vIDUgbWludXRlc1xuXG5leHBvcnQgY29uc3QgZW51bSBUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkIHtcblx0RW5hYmxlQXV0b0FwcHJvdmUgPSAnY2hhdC50b29scy50ZXJtaW5hbC5lbmFibGVBdXRvQXBwcm92ZScsXG5cdEF1dG9BcHByb3ZlID0gJ2NoYXQudG9vbHMudGVybWluYWwuYXV0b0FwcHJvdmUnLFxuXHRBdXRvQXBwcm92ZVdvcmtzcGFjZU5wbVNjcmlwdHMgPSAnY2hhdC50b29scy50ZXJtaW5hbC5hdXRvQXBwcm92ZVdvcmtzcGFjZU5wbVNjcmlwdHMnLFxuXHRJZ25vcmVEZWZhdWx0QXV0b0FwcHJvdmVSdWxlcyA9ICdjaGF0LnRvb2xzLnRlcm1pbmFsLmlnbm9yZURlZmF1bHRBdXRvQXBwcm92ZVJ1bGVzJyxcblx0QmxvY2tEZXRlY3RlZEZpbGVXcml0ZXMgPSAnY2hhdC50b29scy50ZXJtaW5hbC5ibG9ja0RldGVjdGVkRmlsZVdyaXRlcycsXG5cdFNoZWxsSW50ZWdyYXRpb25UaW1lb3V0ID0gJ2NoYXQudG9vbHMudGVybWluYWwuc2hlbGxJbnRlZ3JhdGlvblRpbWVvdXQnLFxuXHRPdXRwdXRMb2NhdGlvbiA9ICdjaGF0LnRvb2xzLnRlcm1pbmFsLm91dHB1dExvY2F0aW9uJyxcblx0QWdlbnRTYW5kYm94TGludXhGaWxlU3lzdGVtID0gJ2NoYXQuYWdlbnQuc2FuZGJveC5maWxlU3lzdGVtLmxpbnV4Jyxcblx0QWdlbnRTYW5kYm94TWFjRmlsZVN5c3RlbSA9ICdjaGF0LmFnZW50LnNhbmRib3guZmlsZVN5c3RlbS5tYWMnLFxuXHRBZ2VudFNhbmRib3hXaW5kb3dzRmlsZVN5c3RlbSA9ICdjaGF0LmFnZW50LnNhbmRib3guZmlsZVN5c3RlbS53aW5kb3dzJyxcblx0QWdlbnRTYW5kYm94QWR2YW5jZWRSdW50aW1lID0gJ2NoYXQuYWdlbnQuc2FuZGJveC5hZHZhbmNlZC5ydW50aW1lJyxcblx0UHJldmVudFNoZWxsSGlzdG9yeSA9ICdjaGF0LnRvb2xzLnRlcm1pbmFsLnByZXZlbnRTaGVsbEhpc3RvcnknLFxuXHRFbmZvcmNlVGltZW91dEZyb21Nb2RlbCA9ICdjaGF0LnRvb2xzLnRlcm1pbmFsLmVuZm9yY2VUaW1lb3V0RnJvbU1vZGVsJyxcblx0SWRsZVNpbGVuY2VUaW1lb3V0TXMgPSAnY2hhdC50b29scy50ZXJtaW5hbC5pZGxlU2lsZW5jZVRpbWVvdXRNcycsXG5cdERldGFjaEJhY2tncm91bmRQcm9jZXNzZXMgPSAnY2hhdC50b29scy50ZXJtaW5hbC5kZXRhY2hCYWNrZ3JvdW5kUHJvY2Vzc2VzJyxcblx0QmFja2dyb3VuZE5vdGlmaWNhdGlvbnMgPSAnY2hhdC50b29scy50ZXJtaW5hbC5iYWNrZ3JvdW5kTm90aWZpY2F0aW9ucycsXG5cdE91dHB1dERlbHRhcyA9ICdjaGF0LnRvb2xzLnRlcm1pbmFsLm91dHB1dERlbHRhcycsXG5cdE91dHB1dENvbXBhY3Rpb24gPSAnY2hhdC50b29scy50ZXJtaW5hbC5vdXRwdXRDb21wYWN0aW9uJyxcblx0SWRsZVBvbGxJbnRlcnZhbCA9ICdjaGF0LnRvb2xzLnRlcm1pbmFsLmlkbGVQb2xsSW50ZXJ2YWwnLFxuXG5cdFRlcm1pbmFsUHJvZmlsZUxpbnV4ID0gJ2NoYXQudG9vbHMudGVybWluYWwudGVybWluYWxQcm9maWxlLmxpbnV4Jyxcblx0VGVybWluYWxQcm9maWxlTWFjT3MgPSAnY2hhdC50b29scy50ZXJtaW5hbC50ZXJtaW5hbFByb2ZpbGUub3N4Jyxcblx0VGVybWluYWxQcm9maWxlV2luZG93cyA9ICdjaGF0LnRvb2xzLnRlcm1pbmFsLnRlcm1pbmFsUHJvZmlsZS53aW5kb3dzJyxcblxuXHREZXByZWNhdGVkQXV0b0FwcHJvdmVDb21wYXRpYmxlID0gJ2NoYXQuYWdlbnQudGVybWluYWwuYXV0b0FwcHJvdmUnLFxuXHREZXByZWNhdGVkQXV0b0FwcHJvdmUxID0gJ2NoYXQuYWdlbnQudGVybWluYWwuYWxsb3dMaXN0Jyxcblx0RGVwcmVjYXRlZEF1dG9BcHByb3ZlMiA9ICdjaGF0LmFnZW50LnRlcm1pbmFsLmRlbnlMaXN0Jyxcblx0RGVwcmVjYXRlZEF1dG9BcHByb3ZlMyA9ICdnaXRodWIuY29waWxvdC5jaGF0LmFnZW50LnRlcm1pbmFsLmFsbG93TGlzdCcsXG5cdERlcHJlY2F0ZWRBdXRvQXBwcm92ZTQgPSAnZ2l0aHViLmNvcGlsb3QuY2hhdC5hZ2VudC50ZXJtaW5hbC5kZW55TGlzdCcsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlcm1pbmFsQ2hhdEFnZW50VG9vbHNDb25maWd1cmF0aW9uIHtcblx0YXV0b0FwcHJvdmU6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9O1xuXHRjb21tYW5kUmVwb3J0aW5nQWxsb3dMaXN0OiB7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfTtcblx0c2hlbGxJbnRlZ3JhdGlvblRpbWVvdXQ6IG51bWJlcjtcbn1cblxuY29uc3QgYXV0b0FwcHJvdmVCb29sZWFuOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRlbnVtOiBbXG5cdFx0dHJ1ZSxcblx0XHRmYWxzZSxcblx0XSxcblx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdGxvY2FsaXplKCdhdXRvQXBwcm92ZS50cnVlJywgXCJBdXRvbWF0aWNhbGx5IGFwcHJvdmUgdGhlIHBhdHRlcm4uXCIpLFxuXHRcdGxvY2FsaXplKCdhdXRvQXBwcm92ZS5mYWxzZScsIFwiUmVxdWlyZSBleHBsaWNpdCBhcHByb3ZhbCBmb3IgdGhlIHBhdHRlcm4uXCIpLFxuXHRdLFxuXHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F1dG9BcHByb3ZlLmtleScsIFwiVGhlIHN0YXJ0IG9mIGEgY29tbWFuZCB0byBtYXRjaCBhZ2FpbnN0LiBBIHJlZ3VsYXIgZXhwcmVzc2lvbiBjYW4gYmUgcHJvdmlkZWQgYnkgd3JhcHBpbmcgdGhlIHN0cmluZyBpbiBgL2AgY2hhcmFjdGVycy5cIiksXG59O1xuXG5jb25zdCB0ZXJtaW5hbENoYXRBZ2VudFByb2ZpbGVTY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cmVxdWlyZWQ6IFsncGF0aCddLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0cGF0aDoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbENoYXRBZ2VudFByb2ZpbGUucGF0aCcsIFwiQSBwYXRoIHRvIGEgc2hlbGwgZXhlY3V0YWJsZS5cIiksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHR9LFxuXHRcdC4uLnRlcm1pbmFsUHJvZmlsZUJhc2VQcm9wZXJ0aWVzLFxuXHR9XG59O1xuXG5leHBvcnQgY29uc3QgdGVybWluYWxDaGF0QWdlbnRUb29sc0NvbmZpZ3VyYXRpb246IElTdHJpbmdEaWN0aW9uYXJ5PElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+ID0ge1xuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5FbmFibGVBdXRvQXBwcm92ZV06IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXV0b0FwcHJvdmVNb2RlLmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIHRvIGFsbG93IGF1dG8gYXBwcm92YWwgaW4gdGhlIHJ1biBpbiB0ZXJtaW5hbCB0b29sLlwiKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRwb2xpY3k6IHtcblx0XHRcdG5hbWU6ICdDaGF0VG9vbHNUZXJtaW5hbEVuYWJsZUF1dG9BcHByb3ZlJyxcblx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlZ3JhdGVkVGVybWluYWwsXG5cdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTA0Jyxcblx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdGtleTogJ2F1dG9BcHByb3ZlTW9kZS5kZXNjcmlwdGlvbicsXG5cdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCdhdXRvQXBwcm92ZU1vZGUuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gYWxsb3cgYXV0byBhcHByb3ZhbCBpbiB0aGUgcnVuIGluIHRlcm1pbmFsIHRvb2wuXCIpLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRhZ2VudHNXaW5kb3c6IHsgZGVmYXVsdDogdHJ1ZSB9LFxuXHR9LFxuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZV06IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IFtcblx0XHRcdGxvY2FsaXplKCdhdXRvQXBwcm92ZS5kZXNjcmlwdGlvbi5pbnRybycsIFwiQSBsaXN0IG9mIGNvbW1hbmRzIG9yIHJlZ3VsYXIgZXhwcmVzc2lvbnMgdGhhdCBjb250cm9sIHdoZXRoZXIgdGhlIHJ1biBpbiB0ZXJtaW5hbCB0b29sIGNvbW1hbmRzIHJlcXVpcmUgZXhwbGljaXQgYXBwcm92YWwuIFRoZXNlIHdpbGwgYmUgbWF0Y2hlZCBhZ2FpbnN0IHRoZSBzdGFydCBvZiBhIGNvbW1hbmQuIEEgcmVndWxhciBleHByZXNzaW9uIGNhbiBiZSBwcm92aWRlZCBieSB3cmFwcGluZyB0aGUgc3RyaW5nIGluIHswfSBjaGFyYWN0ZXJzIGZvbGxvd2VkIGJ5IG9wdGlvbmFsIGZsYWdzIHN1Y2ggYXMgezF9IGZvciBjYXNlLWluc2Vuc2l0aXZpdHkuXCIsICdgL2AnLCAnYGlgJyksXG5cdFx0XHRsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuZGVzY3JpcHRpb24udmFsdWVzJywgXCJTZXQgdG8gezB9IHRvIGF1dG9tYXRpY2FsbHkgYXBwcm92ZSBjb21tYW5kcywgezF9IHRvIGFsd2F5cyByZXF1aXJlIGV4cGxpY2l0IGFwcHJvdmFsIG9yIHsyfSB0byB1bnNldCB0aGUgdmFsdWUuXCIsICdgdHJ1ZWAnLCAnYGZhbHNlYCcsICdgbnVsbGAnKSxcblx0XHRcdGxvY2FsaXplKCdhdXRvQXBwcm92ZS5kZXNjcmlwdGlvbi5zdWJDb21tYW5kcycsIFwiTm90ZSB0aGF0IHRoZXNlIGNvbW1hbmRzIGFuZCByZWd1bGFyIGV4cHJlc3Npb25zIGFyZSBldmFsdWF0ZWQgZm9yIGV2ZXJ5IF9zdWItY29tbWFuZF8gd2l0aGluIHRoZSBmdWxsIF9jb21tYW5kIGxpbmVfLCBzbyB7MH0gZm9yIGV4YW1wbGUgd2lsbCBuZWVkIGJvdGggezF9IGFuZCB7Mn0gdG8gbWF0Y2ggYSB7M30gZW50cnkgYW5kIG11c3Qgbm90IG1hdGNoIGEgezR9IGVudHJ5IGluIG9yZGVyIHRvIGF1dG8gYXBwcm92ZS4gSW5saW5lIGNvbW1hbmRzIHN1Y2ggYXMgezV9IChwcm9jZXNzIHN1YnN0aXR1dGlvbikgc2hvdWxkIGFsc28gYmUgZGV0ZWN0ZWQuXCIsICdgZm9vICYmIGJhcmAnLCAnYGZvb2AnLCAnYGJhcmAnLCAnYHRydWVgJywgJ2BmYWxzZWAnLCAnYDwoZm9vKWAnKSxcblx0XHRcdGxvY2FsaXplKCdhdXRvQXBwcm92ZS5kZXNjcmlwdGlvbi5jb21tYW5kTGluZScsIFwiQW4gb2JqZWN0IGNhbiBiZSB1c2VkIHRvIG1hdGNoIGFnYWluc3QgdGhlIGZ1bGwgY29tbWFuZCBsaW5lIGluc3RlYWQgb2YgbWF0Y2hpbmcgc3ViLWNvbW1hbmRzIGFuZCBpbmxpbmUgY29tbWFuZHMsIGZvciBleGFtcGxlIHswfS4gSW4gb3JkZXIgdG8gYmUgYXV0byBhcHByb3ZlZCBfYm90aF8gdGhlIHN1Yi1jb21tYW5kIGFuZCBjb21tYW5kIGxpbmUgbXVzdCBub3QgYmUgZXhwbGljaXRseSBkZW5pZWQsIHRoZW4gX2VpdGhlcl8gYWxsIHN1Yi1jb21tYW5kcyBvciBjb21tYW5kIGxpbmUgbmVlZHMgdG8gYmUgYXBwcm92ZWQuXCIsICdgeyBhcHByb3ZlOiBmYWxzZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9YCcpLFxuXHRcdFx0bG9jYWxpemUoJ2F1dG9BcHByb3ZlLmRlZmF1bHRzJywgXCJOb3RlIHRoYXQgdGhlcmUncyBhIGRlZmF1bHQgc2V0IG9mIHJ1bGVzIHRvIGFsbG93IGFuZCBhbHNvIGRlbnkgY29tbWFuZHMuIENvbnNpZGVyIHNldHRpbmcgezB9IHRvIHsxfSB0byBpZ25vcmUgYWxsIGRlZmF1bHQgcnVsZXMgdG8gZW5zdXJlIHRoZXJlIGFyZSBubyBjb25mbGljdHMgd2l0aCB5b3VyIG93biBydWxlcy4gRG8gdGhpcyBhdCB5b3VyIG93biByaXNrLCB0aGUgZGVmYXVsdCBkZW5pYWwgcnVsZXMgYXJlIGRlc2lnbmVkIHRvIHByb3RlY3QgeW91IGFnYWluc3QgcnVubmluZyBkYW5nZXJvdXMgY29tbWFuZHMuXCIsIGBcXGAjJHtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLklnbm9yZURlZmF1bHRBdXRvQXBwcm92ZVJ1bGVzfSNcXGBgLCAnYHRydWVgJyksXG5cdFx0XHRbXG5cdFx0XHRcdGxvY2FsaXplKCdhdXRvQXBwcm92ZS5kZXNjcmlwdGlvbi5leGFtcGxlcy50aXRsZScsICdFeGFtcGxlczonKSxcblx0XHRcdFx0YHwke2xvY2FsaXplKCdhdXRvQXBwcm92ZS5kZXNjcmlwdGlvbi5leGFtcGxlcy52YWx1ZScsIFwiVmFsdWVcIil9fCR7bG9jYWxpemUoJ2F1dG9BcHByb3ZlLmRlc2NyaXB0aW9uLmV4YW1wbGVzLmRlc2NyaXB0aW9uJywgXCJEZXNjcmlwdGlvblwiKX18YCxcblx0XHRcdFx0J3wtLS18LS0tfCcsXG5cdFx0XHRcdCd8IGBcXFwibWtkaXJcXFwiOiB0cnVlYCB8ICcgKyBsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuZGVzY3JpcHRpb24uZXhhbXBsZXMubWtkaXInLCBcIkFsbG93IGFsbCBjb21tYW5kcyBzdGFydGluZyB3aXRoIHswfVwiLCAnYG1rZGlyYCcpLFxuXHRcdFx0XHQnfCBgXFxcIm5wbSBydW4gYnVpbGRcXFwiOiB0cnVlYCB8ICcgKyBsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuZGVzY3JpcHRpb24uZXhhbXBsZXMubnBtUnVuQnVpbGQnLCBcIkFsbG93IGFsbCBjb21tYW5kcyBzdGFydGluZyB3aXRoIHswfVwiLCAnYG5wbSBydW4gYnVpbGRgJyksXG5cdFx0XHRcdCd8IGBcXFwiYmluL3Rlc3Quc2hcXFwiOiB0cnVlYCB8ICcgKyBsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuZGVzY3JpcHRpb24uZXhhbXBsZXMuYmluVGVzdCcsIFwiQWxsb3cgYWxsIGNvbW1hbmRzIHRoYXQgbWF0Y2ggdGhlIHBhdGggezB9ICh7MX0sIHsyfSwgZXRjLilcIiwgJ2BiaW4vdGVzdC5zaGAnLCAnYGJpblxcXFx0ZXN0LnNoYCcsICdgLi9iaW4vdGVzdC5zaGAnKSxcblx0XHRcdFx0J3wgYFxcXCIvXmdpdCAoc3RhdHVzXFxcXHxzaG93XFxcXFxcXFxiLiopJC9cXFwiOiB0cnVlYCB8ICcgKyBsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuZGVzY3JpcHRpb24uZXhhbXBsZXMucmVnZXhHaXQnLCBcIkFsbG93IHswfSBhbmQgYWxsIGNvbW1hbmRzIHN0YXJ0aW5nIHdpdGggezF9XCIsICdgZ2l0IHN0YXR1c2AnLCAnYGdpdCBzaG93YCcpLFxuXHRcdFx0XHQnfCBgXFxcIi9eR2V0LUNoaWxkSXRlbVxcXFxcXFxcYi9pXFxcIjogdHJ1ZWAgfCAnICsgbG9jYWxpemUoJ2F1dG9BcHByb3ZlLmRlc2NyaXB0aW9uLmV4YW1wbGVzLnJlZ2V4Q2FzZScsIFwid2lsbCBhbGxvdyB7MH0gY29tbWFuZHMgcmVnYXJkbGVzcyBvZiBjYXNpbmdcIiwgJ2BHZXQtQ2hpbGRJdGVtYCcpLFxuXHRcdFx0XHQnfCBgXFxcIi8uKi9cXFwiOiB0cnVlYCB8ICcgKyBsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuZGVzY3JpcHRpb24uZXhhbXBsZXMucmVnZXhBbGwnLCBcIkFsbG93IGFsbCBjb21tYW5kcyAoZGVuaWVkIGNvbW1hbmRzIHN0aWxsIHJlcXVpcmUgYXBwcm92YWwpXCIpLFxuXHRcdFx0XHQnfCBgXFxcInJtXFxcIjogZmFsc2VgIHwgJyArIGxvY2FsaXplKCdhdXRvQXBwcm92ZS5kZXNjcmlwdGlvbi5leGFtcGxlcy5ybScsIFwiUmVxdWlyZSBleHBsaWNpdCBhcHByb3ZhbCBmb3IgYWxsIGNvbW1hbmRzIHN0YXJ0aW5nIHdpdGggezB9XCIsICdgcm1gJyksXG5cdFx0XHRcdCd8IGBcXFwiL1xcXFxcXFxcLnBzMS9pXFxcIjogeyBhcHByb3ZlOiBmYWxzZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9YCB8ICcgKyBsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuZGVzY3JpcHRpb24uZXhhbXBsZXMucHMxJywgXCJSZXF1aXJlIGV4cGxpY2l0IGFwcHJvdmFsIGZvciBhbnkgX2NvbW1hbmQgbGluZV8gdGhhdCBjb250YWlucyB7MH0gcmVnYXJkbGVzcyBvZiBjYXNpbmdcIiwgJ2BcIi5wczFcImAnKSxcblx0XHRcdFx0J3wgYFxcXCJybVxcXCI6IG51bGxgIHwgJyArIGxvY2FsaXplKCdhdXRvQXBwcm92ZS5kZXNjcmlwdGlvbi5leGFtcGxlcy5ybVVuc2V0JywgXCJVbnNldCB0aGUgZGVmYXVsdCB7MH0gdmFsdWUgZm9yIHsxfVwiLCAnYGZhbHNlYCcsICdgcm1gJyksXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdF0uam9pbignXFxuXFxuJyksXG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdGF1dG9BcHByb3ZlQm9vbGVhbixcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGFwcHJvdmU6IGF1dG9BcHByb3ZlQm9vbGVhbixcblx0XHRcdFx0XHRcdG1hdGNoQ29tbWFuZExpbmU6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0XHRlbnVtOiBbXG5cdFx0XHRcdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdhdXRvQXBwcm92ZS5tYXRjaENvbW1hbmRMaW5lLnRydWUnLCBcIk1hdGNoIGFnYWluc3QgdGhlIGZ1bGwgY29tbWFuZCBsaW5lLCBlZy4gYGZvbyAmJiBiYXJgLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnYXV0b0FwcHJvdmUubWF0Y2hDb21tYW5kTGluZS5mYWxzZScsIFwiTWF0Y2ggYWdhaW5zdCBzdWItY29tbWFuZHMgYW5kIGlubGluZSBjb21tYW5kcywgZWcuIGBmb28gJiYgYmFyYCB3aWxsIG5lZWQgYm90aCBgZm9vYCBhbmQgYGJhcmAgdG8gbWF0Y2guXCIpLFxuXHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F1dG9BcHByb3ZlLm1hdGNoQ29tbWFuZExpbmUnLCBcIldoZXRoZXIgdG8gbWF0Y2ggYWdhaW5zdCB0aGUgZnVsbCBjb21tYW5kIGxpbmUsIGFzIG9wcG9zZWQgdG8gc3BsaXR0aW5nIGJ5IHN1Yi1jb21tYW5kcyBhbmQgaW5saW5lIGNvbW1hbmRzLlwiKSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2FwcHJvdmUnXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ251bGwnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXV0b0FwcHJvdmUubnVsbCcsIFwiSWdub3JlIHRoZSBwYXR0ZXJuLCB0aGlzIGlzIHVzZWZ1bCBmb3IgdW5zZXR0aW5nIHRoZSBzYW1lIHBhdHRlcm4gc2V0IGF0IGEgaGlnaGVyIHNjb3BlLlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdF1cblx0XHR9LFxuXHRcdGRlZmF1bHQ6IHtcblx0XHRcdC8vIFRoaXMgaXMgdGhlIGRlZmF1bHQgc2V0IG9mIHRlcm1pbmFsIGF1dG8gYXBwcm92ZSBjb21tYW5kcy4gTm90ZSB0aGF0IHRoZXNlIGFyZSBiZXN0XG5cdFx0XHQvLyBlZmZvcnQgYW5kIGRvIG5vdCBhaW0gdG8gcHJvdmlkZSBleGhhdXN0aXZlIGNvdmVyYWdlIHRvIHByZXZlbnQgZGFuZ2Vyb3VzIGNvbW1hbmRzXG5cdFx0XHQvLyBmcm9tIGV4ZWN1dGluZyBhcyB0aGF0IGlzIHNpbXBseSBub3QgZmVhc2libGUuIFdvcmtzcGFjZSB0cnVzdCBhbmQgd2FybmluZ3Mgb2Zcblx0XHRcdC8vIHBvc3NpYmxlIHByb21wdCBpbmplY3Rpb24gYXJlIF90aGVfIHRoaW5nIHByb3RlY3RpbmcgdGhlIHVzZXIgaW4gYWdlbnQgbW9kZSwgb25jZVxuXHRcdFx0Ly8gdGhhdCB0cnVzdCBib3VuZGFyeSBoYXMgYmVlbiBicmVhY2hlZCBhbGwgYmV0cyBhcmUgb2ZmIGFzIHRydXN0aW5nIGEgd29ya3NwYWNlIHRoYXRcblx0XHRcdC8vIGNvbnRhaW5zIGFueXRoaW5nIG1hbGljaW91cyBoYXMgYWxyZWFkeSBjb21wcm9taXNlZCB0aGUgbWFjaGluZS5cblx0XHRcdC8vXG5cdFx0XHQvLyBJbnN0ZWFkLCB0aGUgZm9jdXMgaGVyZSBpcyB0byB1bmJsb2NrIHRoZSB1c2VyIGZyb20gYXBwcm92aW5nIGNsZWFybHkgc2FmZSBjb21tYW5kc1xuXHRcdFx0Ly8gZnJlcXVlbnRseSBhbmQgY292ZXIgY29tbW9uIGVkZ2UgY2FzZXMgdGhhdCBjb3VsZCBhcmlzZSBmcm9tIHRoZSB1c2VyIGF1dG8tYXBwcm92aW5nXG5cdFx0XHQvLyBjb21tYW5kcy5cblx0XHRcdC8vXG5cdFx0XHQvLyBUYWtlIGZvciBleGFtcGxlIGBmaW5kYCB3aGljaCBsb29rcyBpbm5vY3VvdXMgYW5kIG1vc3QgdXNlcnMgYXJlIGxpa2VseSB0byBhdXRvXG5cdFx0XHQvLyBhcHByb3ZlIGZ1dHVyZSBjYWxscyB3aGVuIG9mZmVyZWQuIEhvd2V2ZXIsIHRoZSBgLWV4ZWNgIGFyZ3VtZW50IGNhbiBydW4gYW55dGhpbmcuIFNvXG5cdFx0XHQvLyBpbnN0ZWFkIG9mIGxlYXZpbmcgdGhpcyBkZWNpc2lvbiB1cCB0byB0aGUgdXNlciB3ZSBwcm92aWRlIHJlbGF0aXZlbHkgc2FmZSBkZWZhdWx0c1xuXHRcdFx0Ly8gYW5kIGJsb2NrIGNvbW1vbiBlZGdlIGNhc2VzLiBTbyBvZmZlcmluZyB0aGVzZSBkZWZhdWx0IHJ1bGVzLCBkZXNwaXRlIHRoZWlyIGZsYXdzLCBpc1xuXHRcdFx0Ly8gbGlrZWx5IHRvIHByb3RlY3QgdGhlIHVzZXIgbW9yZSBpbiBnZW5lcmFsIHRoYW4gbGVhdmluZyBldmVyeXRoaW5nIHVwIHRvIHRoZW0gKHBsdXNcblx0XHRcdC8vIG1ha2UgYWdlbnQgbW9kZSBtb3JlIGNvbnZlbmllbnQpLlxuXG5cdFx0XHQvLyAjcmVnaW9uIFNhZmUgY29tbWFuZHNcblx0XHRcdC8vXG5cdFx0XHQvLyBHZW5lcmFsbHkgc2FmZSBhbmQgY29tbW9uIHJlYWRvbmx5IGNvbW1hbmRzXG5cblx0XHRcdGNkOiB0cnVlLFxuXHRcdFx0ZWNobzogdHJ1ZSxcblx0XHRcdGxzOiB0cnVlLFxuXHRcdFx0ZGlyOiB0cnVlLFxuXHRcdFx0cHdkOiB0cnVlLFxuXHRcdFx0Y2F0OiB0cnVlLFxuXHRcdFx0aGVhZDogdHJ1ZSxcblx0XHRcdHRhaWw6IHRydWUsXG5cdFx0XHRmaW5kc3RyOiB0cnVlLFxuXHRcdFx0d2M6IHRydWUsXG5cdFx0XHR0cjogdHJ1ZSxcblx0XHRcdGN1dDogdHJ1ZSxcblx0XHRcdGNtcDogdHJ1ZSxcblx0XHRcdHdoaWNoOiB0cnVlLFxuXHRcdFx0YmFzZW5hbWU6IHRydWUsXG5cdFx0XHRkaXJuYW1lOiB0cnVlLFxuXHRcdFx0cmVhbHBhdGg6IHRydWUsXG5cdFx0XHRyZWFkbGluazogdHJ1ZSxcblx0XHRcdHN0YXQ6IHRydWUsXG5cdFx0XHRmaWxlOiB0cnVlLFxuXHRcdFx0b2Q6IHRydWUsXG5cdFx0XHRkdTogdHJ1ZSxcblx0XHRcdGRmOiB0cnVlLFxuXHRcdFx0c2xlZXA6IHRydWUsXG5cdFx0XHRubDogdHJ1ZSxcblxuXHRcdFx0Ly8gZ3JlcFxuXHRcdFx0Ly8gLSBWYXJpYWJsZVxuXHRcdFx0Ly8gLSBgLWZgOiBSZWFkIHBhdHRlcm5zIGZyb20gZmlsZSwgdGhpcyBpcyBhbiBhY2NlcHRhYmxlIHJpc2sgc2luY2UgeW91IGNhbiBkbyBzaW1pbGFyXG5cdFx0XHQvLyAgIHdpdGggY2F0XG5cdFx0XHQvLyAtIGAtUGA6IFBDUkUgcmlza3MgaW5jbHVkZSBkZW5pYWwgb2Ygc2VydmljZSAobWVtb3J5IGV4aGF1c3Rpb24sIGNhdGFzdHJvcGhpY1xuXHRcdFx0Ly8gICBiYWNrdHJhY2tpbmcpIHdoaWNoIGNvdWxkIGxvY2sgdXAgdGhlIHRlcm1pbmFsLiBPbGRlciBQQ1JFIHZlcnNpb25zIGFsbG93IGNvZGVcblx0XHRcdC8vICAgZXhlY3V0aW9uIHZpYSB0aGlzIGZsYWcgYnV0IHRoaXMgaGFzIGJlZW4gcGF0Y2hlZCB3aXRoIENWRXMuXG5cdFx0XHQvLyAtIFZhcmlhYmxlIGluamVjdGlvbiBpcyBwb3NzaWJsZSwgYnV0IHJlcXVpcmVzIHNldHRpbmcgYSB2YXJpYWJsZSB3aGljaCB3b3VsZCBuZWVkXG5cdFx0XHQvLyAgIG1hbnVhbCBhcHByb3ZhbC5cblx0XHRcdGdyZXA6IHRydWUsXG5cblx0XHRcdC8vICNlbmRyZWdpb25cblxuXHRcdFx0Ly8gI3JlZ2lvbiBTYWZlIHN1Yi1jb21tYW5kc1xuXHRcdFx0Ly9cblx0XHRcdC8vIFNhZmUgYW5kIGNvbW1vbiBzdWItY29tbWFuZHNcblxuXHRcdFx0Li4uZ2l0QXV0b0FwcHJvdmVSdWxlcyxcblxuXHRcdFx0Ly8gZG9ja2VyIC0gcmVhZG9ubHkgc3ViLWNvbW1hbmRzXG5cdFx0XHQnL15kb2NrZXJcXFxccysocHN8aW1hZ2VzfGluZm98dmVyc2lvbnxpbnNwZWN0fGxvZ3N8dG9wfHN0YXRzfHBvcnR8ZGlmZnxzZWFyY2h8ZXZlbnRzKVxcXFxiLyc6IHRydWUsXG5cdFx0XHQnL15kb2NrZXJcXFxccysoY29udGFpbmVyfGltYWdlfG5ldHdvcmt8dm9sdW1lfGNvbnRleHR8c3lzdGVtKVxcXFxzKyhsc3xwc3xpbnNwZWN0fGhpc3Rvcnl8c2hvd3xkZnxpbmZvKVxcXFxiLyc6IHRydWUsXG5cdFx0XHQnL15kb2NrZXJcXFxccytjb21wb3NlXFxcXHMrKHBzfGxzfHRvcHxsb2dzfGltYWdlc3xjb25maWd8dmVyc2lvbnxwb3J0fGV2ZW50cylcXFxcYi8nOiB0cnVlLFxuXG5cdFx0XHQvLyAjZW5kcmVnaW9uXG5cblx0XHRcdC8vICNyZWdpb24gUG93ZXJTaGVsbFxuXG5cdFx0XHQuLi5wb3dlcnNoZWxsQXV0b0FwcHJvdmVSdWxlcyxcblxuXHRcdFx0Ly8gI2VuZHJlZ2lvblxuXG5cdFx0XHQvLyAjcmVnaW9uIFBhY2thZ2UgbWFuYWdlcnMgKG5wbSwgeWFybiwgcG5wbSlcblx0XHRcdC8vXG5cdFx0XHQvLyBSZWFkLW9ubHkgY29tbWFuZHMgdGhhdCBkb24ndCBtb2RpZnkgZmlsZXMgb3IgZXhlY3V0ZSBhcmJpdHJhcnkgY29kZS5cblxuXHRcdFx0Ly8gbnBtIHJlYWQtb25seSBjb21tYW5kc1xuXHRcdFx0Jy9ebnBtXFxcXHMrKGxzfGxpc3R8b3V0ZGF0ZWR8dmlld3xpbmZvfHNob3d8ZXhwbGFpbnx3aHl8cm9vdHxwcmVmaXh8YmlufHNlYXJjaHxkb2N0b3J8ZnVuZHxyZXBvfGJ1Z3N8ZG9jc3xob21lfGhlbHAoLXNlYXJjaCk/KVxcXFxiLyc6IHRydWUsXG5cdFx0XHQnL15ucG1cXFxccytjb25maWdcXFxccysobGlzdHxnZXQpXFxcXGIvJzogdHJ1ZSxcblx0XHRcdCcvXm5wbVxcXFxzK3BrZ1xcXFxzK2dldFxcXFxiLyc6IHRydWUsXG5cdFx0XHQnL15ucG1cXFxccythdWRpdCQvJzogdHJ1ZSxcblx0XHRcdCcvXm5wbVxcXFxzK2NhY2hlXFxcXHMrdmVyaWZ5XFxcXGIvJzogdHJ1ZSxcblxuXHRcdFx0Ly8geWFybiByZWFkLW9ubHkgY29tbWFuZHNcblx0XHRcdCcvXnlhcm5cXFxccysobGlzdHxvdXRkYXRlZHxpbmZvfHdoeXxiaW58aGVscHx2ZXJzaW9ucylcXFxcYi8nOiB0cnVlLFxuXHRcdFx0Jy9eeWFyblxcXFxzK2xpY2Vuc2VzXFxcXGIvJzogdHJ1ZSxcblx0XHRcdCcvXnlhcm5cXFxccythdWRpdFxcXFxiKD8hLipcXFxcYmZpeFxcXFxiKS8nOiB0cnVlLFxuXHRcdFx0Jy9eeWFyblxcXFxzK2NvbmZpZ1xcXFxzKyhsaXN0fGdldClcXFxcYi8nOiB0cnVlLFxuXHRcdFx0Jy9eeWFyblxcXFxzK2NhY2hlXFxcXHMrZGlyXFxcXGIvJzogdHJ1ZSxcblxuXHRcdFx0Ly8gcG5wbSByZWFkLW9ubHkgY29tbWFuZHNcblx0XHRcdCcvXnBucG1cXFxccysobHN8bGlzdHxvdXRkYXRlZHx3aHl8cm9vdHxiaW58ZG9jdG9yKVxcXFxiLyc6IHRydWUsXG5cdFx0XHQnL15wbnBtXFxcXHMrbGljZW5zZXNcXFxcYi8nOiB0cnVlLFxuXHRcdFx0Jy9ecG5wbVxcXFxzK2F1ZGl0XFxcXGIoPyEuKlxcXFxiZml4XFxcXGIpLyc6IHRydWUsXG5cdFx0XHQnL15wbnBtXFxcXHMrY29uZmlnXFxcXHMrKGxpc3R8Z2V0KVxcXFxiLyc6IHRydWUsXG5cblx0XHRcdC8vIFNhZmUgbG9ja2ZpbGUtb25seSBpbnN0YWxscyBzaW5jZSB3ZSB0cnVzdCB0aGUgd29ya3NwYWNlIGFuZCBsb2NrIGZpbGUgaXMgdHJ1c3RlZC5cblx0XHRcdCducG0gY2knOiB0cnVlLFxuXHRcdFx0Jy9eeWFyblxcXFxzK2luc3RhbGxcXFxccystLWZyb3plbi1sb2NrZmlsZVxcXFxiLyc6IHRydWUsXG5cdFx0XHQnL15wbnBtXFxcXHMraW5zdGFsbFxcXFxzKy0tZnJvemVuLWxvY2tmaWxlXFxcXGIvJzogdHJ1ZSxcblxuXHRcdFx0Ly8gI2VuZHJlZ2lvblxuXG5cdFx0XHQvLyAjcmVnaW9uIFNhZmUgKyBkaXNhYmxlZCBhcmdzXG5cdFx0XHQvL1xuXHRcdFx0Ly8gQ29tbWFuZHMgdGhhdCBhcmUgZ2VuZXJhbGx5IGFsbG93ZWQgd2l0aCBzcGVjaWFsIGNhc2VzIHdlIGJsb2NrLiBOb3RlIHRoYXQgc2hlbGxcblx0XHRcdC8vIGV4cGFuc2lvbiBpcyBoYW5kbGVkIGJ5IHRoZSBpbmxpbmUgY29tbWFuZCBkZXRlY3Rpb24gd2hlbiBwYXJzaW5nIHN1Yi1jb21tYW5kcy5cblxuXHRcdFx0Ly8gY29sdW1uXG5cdFx0XHQvLyAtIGAtY2A6IFdlIGJsb2NrIGV4Y2Vzc2l2ZSBjb2x1bW5zIHRoYXQgY291bGQgbGVhZCB0byBtZW1vcnkgZXhoYXVzdGlvbi5cblx0XHRcdGNvbHVtbjogdHJ1ZSxcblx0XHRcdCcvXmNvbHVtblxcXFxiLipcXFxccy1jXFxcXHMrWzAtOV17NCx9Lyc6IGZhbHNlLFxuXG5cdFx0XHQvLyBkYXRlXG5cdFx0XHQvLyAtc3wtLXNldDogU2V0cyB0aGUgc3lzdGVtIGNsb2NrXG5cdFx0XHRkYXRlOiB0cnVlLFxuXHRcdFx0Jy9eZGF0ZVxcXFxiLipcXFxccygtc3wtLXNldClcXFxcYi8nOiBmYWxzZSxcblxuXHRcdFx0Ly8gZmluZFxuXHRcdFx0Ly8gLSBgLWRlbGV0ZWA6IERlbGV0ZXMgZmlsZXMgb3IgZGlyZWN0b3JpZXMuXG5cdFx0XHQvLyAtIGAtZXhlY2AvYC1leGVjZGlyYDogRXhlY3V0ZSBvbiByZXN1bHRzLlxuXHRcdFx0Ly8gLSBgLWZwcmludGAvYGZwcmludGZgL2BmbHNgOiBXcml0ZXMgZmlsZXMuXG5cdFx0XHQvLyAtIGAtb2tgL2Atb2tkaXJgOiBMaWtlIGV4ZWMgYnV0IHdpdGggYSBjb25maXJtYXRpb24uXG5cdFx0XHRmaW5kOiB0cnVlLFxuXHRcdFx0Jy9eZmluZFxcXFxiLipcXFxccy0oZGVsZXRlfGV4ZWN8ZXhlY2RpcnxmcHJpbnR8ZnByaW50ZnxmbHN8b2t8b2tkaXIpXFxcXGIvJzogZmFsc2UsXG5cblx0XHRcdC8vIHJnIChyaXBncmVwKVxuXHRcdFx0Ly8gLSBgLS1wcmVgOiBFeGVjdXRlcyBhcmJpdHJhcnkgY29tbWFuZCBhcyBwcmVwcm9jZXNzb3IgZm9yIGV2ZXJ5IGZpbGUgc2VhcmNoZWQuXG5cdFx0XHQvLyAtIGAtLWhvc3RuYW1lLWJpbmA6IEV4ZWN1dGVzIGFyYml0cmFyeSBjb21tYW5kIHRvIGdldCBob3N0bmFtZS5cblx0XHRcdHJnOiB0cnVlLFxuXHRcdFx0Jy9ecmdcXFxcYi4qXFxcXHMoLS1wcmV8LS1ob3N0bmFtZS1iaW4pXFxcXGIvJzogZmFsc2UsXG5cblx0XHRcdC8vIHNlZFxuXHRcdFx0Ly8gLSBgLWVgL2AtLWV4cHJlc3Npb25gOiBBZGQgdGhlIGNvbW1hbmRzIGluIHNjcmlwdCB0byB0aGUgc2V0IG9mIGNvbW1hbmRzIHRvIGJlIHJ1blxuXHRcdFx0Ly8gICB3aGlsZSBwcm9jZXNzaW5nIHRoZSBpbnB1dC5cblx0XHRcdC8vIC0gYC1mYC9gLS1maWxlYDogQWRkIHRoZSBjb21tYW5kcyBjb250YWluZWQgaW4gdGhlIGZpbGUgc2NyaXB0LWZpbGUgdG8gdGhlIHNldCBvZlxuXHRcdFx0Ly8gICBjb21tYW5kcyB0byBiZSBydW4gd2hpbGUgcHJvY2Vzc2luZyB0aGUgaW5wdXQuXG5cdFx0XHQvLyAtIHN0YW5kYWxvbmUgYGVgOiBFeGVjdXRlIGEgc2hlbGwgY29tbWFuZCBmcm9tIHRoZSBzZWQgc2NyaXB0XG5cdFx0XHQvLyAtIHN0YW5kYWxvbmUgYHJgL2BSYDogUmVhZCBhcmJpdHJhcnkgZmlsZXMgaW50byB0aGUgc3RyZWFtXG5cdFx0XHQvLyAtIHN0YW5kYWxvbmUgYHdgL2BXYDogV3JpdGUgcGF0dGVybiBzcGFjZSB0byBhcmJpdHJhcnkgZmlsZXNcblx0XHRcdC8vIC0gYHMvLy9lYCBmbGFnOiBFeGVjdXRlcyBzdWJzdGl0dXRpb24gcmVzdWx0IGFzIHNoZWxsIGNvbW1hbmRcblx0XHRcdC8vIC0gYHMvLy93YCBmbGFnOiBXcml0ZSBzdWJzdGl0dXRpb24gcmVzdWx0IHRvIGZpbGVcblx0XHRcdC8vIC0gTm90ZSB0aGF0IGAtLXNhbmRib3hgIGV4aXN0cyB3aGljaCBibG9ja3MgdW5zYWZlIGNvbW1hbmRzIHRoYXQgY291bGQgcG90ZW50aWFsbHkgYmVcblx0XHRcdC8vICAgbGV2ZXJhZ2VkIHRvIGF1dG8gYXBwcm92ZVxuXHRcdFx0Ly8gLSBJbi1wbGFjZSBlZGl0aW5nIChgLWlgLCBgLUlgLCBgLS1pbi1wbGFjZWApIGlzIGRldGVjdGVkIGFuZCBibG9ja2VkIHZpYSBmaWxlIHdyaXRlXG5cdFx0XHQvLyAgIGRldGVjdGlvbiBpZiBuZWNlc3Nhcnlcblx0XHRcdC8vIC0gVGhlc2UgcGF0dGVybnMgYXJlIGNvbnNlcnZhdGl2ZTogYSBsaXRlcmFsIGA7ZSBgIG9yIGB7ZSBgIGluc2lkZSBhIHJlcGxhY2VtZW50XG5cdFx0XHQvLyAgIHN0cmluZyBhbHNvIG1hdGNoZXMsIHdoaWNoIGFza3MgZm9yIGNvbmZpcm1hdGlvbiByYXRoZXIgdGhhbiBhdXRvLWFwcHJvdmluZy5cblx0XHRcdC8vIFRPRE86IHJlcGxhY2Ugc2VkIGRlbnkgcmVnZXhlcyB3aXRoIGEgc2hhcmVkIHNjcmlwdCBhbmFseXplciBcdTIwMTQgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMyOTIxOFxuXHRcdFx0c2VkOiB0cnVlLFxuXHRcdFx0Jy9ec2VkXFxcXGIuKlxcXFxzKC1bYS16QS1aXSooZXxmKVthLXpBLVpdKnwtLWV4cHJlc3Npb258LS1maWxlKVxcXFxiLyc6IGZhbHNlLFxuXHRcdFx0Jy9ec2VkXFxcXGIuKnNcXFxcLy4qXFxcXC8uKlxcXFwvW2V3XS8nOiBmYWxzZSxcblx0XHRcdC8vIFF1b3RlZCBwb3NpdGlvbmFsIHNjcmlwdCB3aG9zZSBmaXJzdCBjb21tYW5kIGlzIGUvci9SL3cvVy4gVGhlIG9wZW5pbmcgcXVvdGUgaXNcblx0XHRcdC8vIGNhcHR1cmVkIHNvIHRoZSBjbG9zaW5nIHF1b3RlIG11c3QgbWF0Y2ggaXQsIGFuZCB3aGl0ZXNwYWNlIGFuZCBgIWAgYXJlIGFsbG93ZWRcblx0XHRcdC8vIGFyb3VuZCB0aGUgb3B0aW9uYWwgYWRkcmVzcyBzaW5jZSBzZWQgaWdub3JlcyB0aGVtLiBUaGUgb3B0aW9uIHByZWZpeCBhbHNvIHNraXBzXG5cdFx0XHQvLyB0aGUgc2VwYXJhdGUgb3BlcmFuZCBjb25zdW1lZCBieSAtbC8tLWxpbmUtbGVuZ3RoLlxuXHRcdFx0Jy9ec2VkXFxcXGIoPzpcXFxccysoPzooPzotbHwtLWxpbmUtbGVuZ3RoKVxcXFxzK1xcXFxTK3wtLWxpbmUtbGVuZ3RoPVxcXFxTK3wtXFxcXFMrKSkqXFxcXHMrKFtcXCdcIl0pXFxcXHMqKD86KD86XFxcXGQrfFxcXFwkfFxcXFwvKD86XFxcXFxcXFwufFteXFxcXC9dKSpcXFxcLykoPzpcXFxccyosXFxcXHMqKD86XFxcXGQrfFxcXFwkfFxcXFwvKD86XFxcXFxcXFwufFteXFxcXC9dKSpcXFxcLykpPyk/XFxcXHMqIT9cXFxccypbZXJSd1ddKD86XFxcXHN8XFxcXDEpLyc6IGZhbHNlLFxuXHRcdFx0Ly8gU2FtZSBkYW5nZXJvdXMgY29tbWFuZHMgYWZ0ZXIgYSBgO2Agb3IgYHtgIHNlcGFyYXRvciBpbnNpZGUgYSBxdW90ZWQgc2NyaXB0LlxuXHRcdFx0Ly8gRXNjYXBlZCBjaGFyYWN0ZXJzIGFyZSBjb25zdW1lZCBiZWZvcmUgdGVzdGluZyBmb3IgdGhlIG1hdGNoaW5nIGNsb3NpbmcgcXVvdGUuXG5cdFx0XHQnL15zZWRcXFxcYig/OlxcXFxzKyg/Oig/Oi1sfC0tbGluZS1sZW5ndGgpXFxcXHMrXFxcXFMrfC0tbGluZS1sZW5ndGg9XFxcXFMrfC1cXFxcUyspKSpcXFxccysoW1xcJ1wiXSkoPzpcXFxcXFxcXC58KD8hXFxcXDEpLikqWzt7XVxcXFxzKig/Oig/OlxcXFxkK3xcXFxcJHxcXFxcLyg/OlxcXFxcXFxcLnxbXlxcXFwvXSkqXFxcXC8pKD86XFxcXHMqLFxcXFxzKig/OlxcXFxkK3xcXFxcJHxcXFxcLyg/OlxcXFxcXFxcLnxbXlxcXFwvXSkqXFxcXC8pKT8pP1xcXFxzKiE/XFxcXHMqW2VyUndXXSg/OlxcXFxzfFxcXFwxfFs7fV0pLyc6IGZhbHNlLFxuXHRcdFx0Ly8gVW5xdW90ZWQgcG9zaXRpb25hbCBzY3JpcHQgZm9ybSAoZS5nLiBgc2VkIDFlIGlkYCwgYHNlZCB3IGZpbGVgLCBgc2VkIC9wYXQvZSBmaWxlYClcblx0XHRcdCcvXnNlZFxcXFxiKD86XFxcXHMrKD86KD86LWx8LS1saW5lLWxlbmd0aClcXFxccytcXFxcUyt8LS1saW5lLWxlbmd0aD1cXFxcUyt8LVxcXFxTKykpKlxcXFxzKyg/Oig/OlxcXFxkK3xcXFxcJHxcXFxcLyg/OlxcXFxcXFxcLnxbXlxcXFwvXSkqXFxcXC8pKD86XFxcXHMqLFxcXFxzKig/OlxcXFxkK3xcXFxcJHxcXFxcLyg/OlxcXFxcXFxcLnxbXlxcXFwvXSkqXFxcXC8pKT8pP1xcXFxzKiE/XFxcXHMqW2VyUndXXSg/OlxcXFxzfCQpLyc6IGZhbHNlLFxuXG5cdFx0XHQuLi5zb3J0QXV0b0FwcHJvdmVSdWxlcyxcblxuXHRcdFx0Ly8gdHJlZVxuXHRcdFx0Ly8gLSBgLW9gOiBPdXRwdXQgcmVkaXJlY3Rpb24gY2FuIHdyaXRlIGZpbGVzIChgdHJlZSAtbyAvZXRjL3NvbWV0aGluZyBmaWxlYCkgd2hpY2ggYXJlXG5cdFx0XHQvLyAgIGJsb2NrZWQgY3VycmVudGx5XG5cdFx0XHR0cmVlOiB0cnVlLFxuXHRcdFx0Jy9edHJlZVxcXFxiLipcXFxccy1vXFxcXGIvJzogZmFsc2UsXG5cblx0XHRcdC8vIHh4ZFxuXHRcdFx0Ly8gLSBPbmx5IGFsbG93IGZsYWdzIGFuZCBhIHNpbmdsZSBpbnB1dCBmaWxlIGFzIGl0J3MgZGlmZmljdWx0IHRvIHBhcnNlIHRoZSBvdXRmaWxlXG5cdFx0XHQvLyAgIHBvc2l0aW9uYWwgYXJndW1lbnQgc2FmZWx5LlxuXHRcdFx0Jy9eeHhkJC8nOiB0cnVlLFxuXHRcdFx0Jy9eeHhkXFxcXGIoXFxcXHMrLVxcXFxTKykqXFxcXHMrW14tXFxcXHNdXFxcXFMqJC8nOiB0cnVlLFxuXG5cdFx0XHQvLyAjZW5kcmVnaW9uXG5cblx0XHRcdC8vICNyZWdpb24gRGFuZ2Vyb3VzIGNvbW1hbmRzXG5cdFx0XHQvL1xuXHRcdFx0Ly8gVGhlcmUgYXJlIGNvdW50bGVzcyBkYW5nZXJvdXMgY29tbWFuZHMgYXZhaWxhYmxlIG9uIHRoZSBjb21tYW5kIGxpbmUsIHRoZSBkZWZhdWx0c1xuXHRcdFx0Ly8gaGVyZSBpbmNsdWRlIGNvbW1vbiBvbmVzIHRoYXQgdGhlIHVzZXIgaXMgbGlrZWx5IHRvIHdhbnQgdG8gZXhwbGljaXRseSBhcHByb3ZlIGZpcnN0LlxuXHRcdFx0Ly8gVGhpcyBpcyBub3QgaW50ZW5kZWQgdG8gYmUgYSBjYXRjaCBhbGwgYXMgdGhlIHVzZXIgbmVlZHMgdG8gb3B0LWluIHRvIGF1dG8tYXBwcm92ZVxuXHRcdFx0Ly8gY29tbWFuZHMsIGl0IHByb3ZpZGVzIHNvbWUgYWRkaXRpb25hbCBzYWZldHkgd2hlbiB0aGUgY29tbWFuZHMgZ2V0IGFwcHJvdmVkIGJ5IG92ZXJseVxuXHRcdFx0Ly8gYnJvYWQgdXNlci93b3Jrc3BhY2UgcnVsZXMuXG5cblx0XHRcdC8vIERlbGV0aW5nIGZpbGVzXG5cdFx0XHRybTogZmFsc2UsXG5cdFx0XHRybWRpcjogZmFsc2UsXG5cdFx0XHRkZWw6IGZhbHNlLFxuXHRcdFx0J1JlbW92ZS1JdGVtJzogZmFsc2UsXG5cdFx0XHRyaTogZmFsc2UsXG5cdFx0XHRyZDogZmFsc2UsXG5cdFx0XHRlcmFzZTogZmFsc2UsXG5cdFx0XHRkZDogZmFsc2UsXG5cblx0XHRcdC8vIE1hbmFnaW5nL2tpbGxpbmcgcHJvY2Vzc2VzLCBkYW5nZXJvdXMgdGhpbmcgdG8gZG8gZ2VuZXJhbGx5XG5cdFx0XHRraWxsOiBmYWxzZSxcblx0XHRcdHBzOiBmYWxzZSxcblx0XHRcdHRvcDogZmFsc2UsXG5cdFx0XHQnU3RvcC1Qcm9jZXNzJzogZmFsc2UsXG5cdFx0XHRzcHBzOiBmYWxzZSxcblx0XHRcdHRhc2traWxsOiBmYWxzZSxcblx0XHRcdCd0YXNra2lsbC5leGUnOiBmYWxzZSxcblxuXHRcdFx0Ly8gV2ViIHJlcXVlc3RzLCBwcm9tcHQgaW5qZWN0aW9uIGNvbmNlcm5zXG5cdFx0XHRjdXJsOiBmYWxzZSxcblx0XHRcdHdnZXQ6IGZhbHNlLFxuXHRcdFx0J0ludm9rZS1SZXN0TWV0aG9kJzogZmFsc2UsXG5cdFx0XHQnSW52b2tlLVdlYlJlcXVlc3QnOiBmYWxzZSxcblx0XHRcdCdpcm0nOiBmYWxzZSxcblx0XHRcdCdpd3InOiBmYWxzZSxcblxuXHRcdFx0Ly8gRmlsZSBwZXJtaXNzaW9ucyBhbmQgb3duZXJzaGlwLCBtZXNzaW5nIHdpdGggdGhlc2UgY2FuIGNhdXNlIGhhcmQgdG8gZGlhZ25vc2UgaXNzdWVzXG5cdFx0XHRjaG1vZDogZmFsc2UsXG5cdFx0XHRjaG93bjogZmFsc2UsXG5cdFx0XHQnU2V0LUl0ZW1Qcm9wZXJ0eSc6IGZhbHNlLFxuXHRcdFx0J3NwJzogZmFsc2UsXG5cdFx0XHQnU2V0LUFjbCc6IGZhbHNlLFxuXG5cdFx0XHQvLyBHZW5lcmFsIGV2YWwvY29tbWFuZCBleGVjdXRpb24sIGNhbiBsZWFkIHRvIGFueXRoaW5nIGVsc2UgcnVubmluZ1xuXHRcdFx0anE6IGZhbHNlLFxuXHRcdFx0eGFyZ3M6IGZhbHNlLFxuXHRcdFx0ZXZhbDogZmFsc2UsXG5cdFx0XHQnSW52b2tlLUV4cHJlc3Npb24nOiBmYWxzZSxcblx0XHRcdGlleDogZmFsc2UsXG5cblx0XHRcdC8vICNlbmRyZWdpb25cblx0XHR9IHNhdGlzZmllcyBSZWNvcmQ8c3RyaW5nLCBib29sZWFuIHwgeyBhcHByb3ZlOiBib29sZWFuOyBtYXRjaENvbW1hbmRMaW5lPzogYm9vbGVhbiB9Pixcblx0fSxcblx0W1Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuSWdub3JlRGVmYXVsdEF1dG9BcHByb3ZlUnVsZXNdOiB7XG5cdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaWdub3JlRGVmYXVsdEF1dG9BcHByb3ZlUnVsZXMuZGVzY3JpcHRpb24nLCBcIldoZXRoZXIgdG8gaWdub3JlIHRoZSBidWlsdC1pbiBkZWZhdWx0IGF1dG8tYXBwcm92ZSBydWxlcyB1c2VkIGJ5IHRoZSBydW4gaW4gdGVybWluYWwgdG9vbCBhcyBkZWZpbmVkIGluIHswfS4gV2hlbiB0aGlzIHNldHRpbmcgaXMgZW5hYmxlZCwgdGhlIHJ1biBpbiB0ZXJtaW5hbCB0b29sIHdpbGwgaWdub3JlIGFueSBydWxlIHRoYXQgY29tZXMgZnJvbSB0aGUgZGVmYXVsdCBzZXQgYnV0IHN0aWxsIGZvbGxvdyBydWxlcyBkZWZpbmVkIGluIHRoZSB1c2VyLCByZW1vdGUgYW5kIHdvcmtzcGFjZSBzZXR0aW5ncy4gVXNlIHRoaXMgc2V0dGluZyBhdCB5b3VyIG93biByaXNrOyB0aGUgZGVmYXVsdCBhdXRvLWFwcHJvdmUgcnVsZXMgYXJlIGRlc2lnbmVkIHRvIHByb3RlY3QgeW91IGFnYWluc3QgcnVubmluZyBkYW5nZXJvdXMgY29tbWFuZHMuXCIsIGBcXGAjJHtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlfSNcXGBgKSxcblx0fSxcblx0W1Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmVXb3Jrc3BhY2VOcG1TY3JpcHRzXToge1xuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdC8vIEluIG9yZGVyIHRvIHVzZSBhZ2VudCBtb2RlIHRoZSB3b3Jrc3BhY2UgbXVzdCBiZSB0cnVzdGVkLCB0aGlzIHBsdXMgdGhlIGZhY3QgdGhhdFxuXHRcdC8vIG1vZGlmeWluZyBwYWNrYWdlLmpzb24gaXMgcHJvdGVjdGVkIG1lYW5zIHRoaXMgaXMgc2FmZSB0byBlbmFibGUgYnkgZGVmYXVsdC5cblx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F1dG9BcHByb3ZlV29ya3NwYWNlTnBtU2NyaXB0cy5kZXNjcmlwdGlvbicsIFwiV2hldGhlciB0byBhdXRvbWF0aWNhbGx5IGFwcHJvdmUgbnBtLCB5YXJuLCBhbmQgcG5wbSBydW4gY29tbWFuZHMgd2hlbiB0aGUgc2NyaXB0IGlzIGRlZmluZWQgaW4gYSB3b3Jrc3BhY2UgcGFja2FnZS5qc29uIGZpbGUuIFNpbmNlIHRoZSB3b3Jrc3BhY2UgaXMgdHJ1c3RlZCwgc2NyaXB0cyBkZWZpbmVkIGluIHBhY2thZ2UuanNvbiBhcmUgY29uc2lkZXJlZCBzYWZlIHRvIHJ1biB3aXRob3V0IGV4cGxpY2l0IGFwcHJvdmFsLlwiKSxcblx0fSxcblx0W1Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQmxvY2tEZXRlY3RlZEZpbGVXcml0ZXNdOiB7XG5cdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbJ25ldmVyJywgJ291dHNpZGVXb3Jrc3BhY2UnLCAnYWxsJ10sXG5cdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ2Jsb2NrRmlsZVdyaXRlcy5uZXZlcicsIFwiQWxsb3cgYWxsIGRldGVjdGVkIGZpbGUgd3JpdGVzLlwiKSxcblx0XHRcdGxvY2FsaXplKCdibG9ja0ZpbGVXcml0ZXMub3V0c2lkZVdvcmtzcGFjZScsIFwiQmxvY2sgZmlsZSB3cml0ZXMgZGV0ZWN0ZWQgb3V0c2lkZSB0aGUgd29ya3NwYWNlLiBUaGlzIGRlcGVuZHMgb24gdGhlIHNoZWxsIGludGVncmF0aW9uIGZlYXR1cmUgd29ya2luZyBjb3JyZWN0bHkgdG8gZGV0ZXJtaW5lIHRoZSBjdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5IG9mIHRoZSB0ZXJtaW5hbC5cIiksXG5cdFx0XHRsb2NhbGl6ZSgnYmxvY2tGaWxlV3JpdGVzLmFsbCcsIFwiQmxvY2sgYWxsIGRldGVjdGVkIGZpbGUgd3JpdGVzLlwiKSxcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdvdXRzaWRlV29ya3NwYWNlJyxcblx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdibG9ja0ZpbGVXcml0ZXMuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgZGV0ZWN0ZWQgZmlsZSB3cml0ZSBvcGVyYXRpb25zIGFyZSBibG9ja2VkIGluIHRoZSBydW4gaW4gdGVybWluYWwgdG9vbC4gV2hlbiBkZXRlY3RlZCwgdGhpcyB3aWxsIHJlcXVpcmUgZXhwbGljaXQgYXBwcm92YWwgcmVnYXJkbGVzcyBvZiB3aGV0aGVyIHRoZSBjb21tYW5kIHdvdWxkIG5vcm1hbGx5IGJlIGF1dG8gYXBwcm92ZWQuIE5vdGUgdGhhdCB0aGlzIGNhbm5vdCBkZXRlY3QgYWxsIHBvc3NpYmxlIG1ldGhvZHMgb2Ygd3JpdGluZyBmaWxlcywgdGhpcyBpcyB3aGF0IGlzIGN1cnJlbnRseSBkZXRlY3RlZDpcXG5cXG4tIEZpbGUgcmVkaXJlY3Rpb24gKGRldGVjdGVkIHZpYSB0aGUgYmFzaCBvciBQb3dlclNoZWxsIHRyZWUgc2l0dGVyIGdyYW1tYXIpXFxuLSBgc2VkYCBpbi1wbGFjZSBlZGl0aW5nIChgLWlgLCBgLUlgLCBgLS1pbi1wbGFjZWApXCIpLFxuXHR9LFxuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5TaGVsbEludGVncmF0aW9uVGltZW91dF06IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2hlbGxJbnRlZ3JhdGlvblRpbWVvdXQuZGVzY3JpcHRpb24nLCBcIkNvbmZpZ3VyZXMgdGhlIGR1cmF0aW9uIGluIG1pbGxpc2Vjb25kcyB0byB3YWl0IGZvciBzaGVsbCBpbnRlZ3JhdGlvbiB0byBiZSBkZXRlY3RlZCB3aGVuIHRoZSBydW4gaW4gdGVybWluYWwgdG9vbCBsYXVuY2hlcyBhIG5ldyB0ZXJtaW5hbC4gU2V0IHRvIGAwYCB0byBza2lwIHRoZSB3YWl0IGVudGlyZWx5LCB0aGUgZGVmYXVsdCB2YWx1ZSBgLTFgIHVzZXMgYSB2YXJpYWJsZSB3YWl0IHRpbWUgYmFzZWQgb24gdGhlIHZhbHVlIG9mIHswfSBhbmQgd2hldGhlciBpdCdzIGEgcmVtb3RlIHdpbmRvdy4gQSBsYXJnZSB2YWx1ZSBjYW4gYmUgdXNlZnVsIGlmIHlvdXIgc2hlbGwgc3RhcnRzIHZlcnkgc2xvd2x5LlwiLCBgXFxgIyR7VGVybWluYWxTZXR0aW5nSWQuU2hlbGxJbnRlZ3JhdGlvbkVuYWJsZWR9I1xcYGApLFxuXHRcdHR5cGU6ICdpbnRlZ2VyJyxcblx0XHRtaW5pbXVtOiAtMSxcblx0XHRtYXhpbXVtOiA2MDAwMCxcblx0XHRkZWZhdWx0OiAtMSxcblx0XHRtYXJrZG93bkRlcHJlY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3NoZWxsSW50ZWdyYXRpb25UaW1lb3V0LmRlcHJlY2F0ZWQnLCAnVXNlIHswfSBpbnN0ZWFkJywgYFxcYCMke1Rlcm1pbmFsU2V0dGluZ0lkLlNoZWxsSW50ZWdyYXRpb25UaW1lb3V0fSNcXGBgKVxuXHR9LFxuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5JZGxlUG9sbEludGVydmFsXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdpZGxlUG9sbEludGVydmFsLmRlc2NyaXB0aW9uJywgXCJDb25maWd1cmVzIHRoZSBpZGxlIHBvbGwgaW50ZXJ2YWwgaW4gbWlsbGlzZWNvbmRzIHVzZWQgYnkgdGhlIHJ1biBpbiB0ZXJtaW5hbCB0b29sIHRvIGRldGVjdCB3aGVuIGNvbW1hbmRzIGhhdmUgZmluaXNoZWQgZXhlY3V0aW5nLiBMb3dlciB2YWx1ZXMgbWFrZSBjb21tYW5kIGRldGVjdGlvbiBmYXN0ZXIgYnV0IG1heSBjYXVzZSBmYWxzZSBwb3NpdGl2ZXMgb24gc2xvdyBzeXN0ZW1zLiBUaGlzIHByaW1hcmlseSBhZmZlY3RzIHRlcm1pbmFscyB3aXRob3V0IHNoZWxsIGludGVncmF0aW9uIHdoZXJlIGlkbGUgZGV0ZWN0aW9uIGlzIHVzZWQgaW5zdGVhZCBvZiBzaGVsbCBpbnRlZ3JhdGlvbiBldmVudHMuXCIpLFxuXHRcdHR5cGU6ICdpbnRlZ2VyJyxcblx0XHRtaW5pbXVtOiA1MCxcblx0XHRtYXhpbXVtOiAxMDAwMCxcblx0XHRkZWZhdWx0OiAxMDAwLFxuXHR9LFxuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5UZXJtaW5hbFByb2ZpbGVMaW51eF06IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbENoYXRBZ2VudFByb2ZpbGUubGludXgnLCBcIlRoZSB0ZXJtaW5hbCBwcm9maWxlIHRvIHVzZSBvbiBMaW51eCBmb3IgY2hhdCBhZ2VudCdzIHJ1biBpbiB0ZXJtaW5hbCB0b29sLlwiKSxcblx0XHR0eXBlOiBbJ29iamVjdCcsICdudWxsJ10sXG5cdFx0ZGVmYXVsdDogbnVsbCxcblx0XHQnYW55T2YnOiBbXG5cdFx0XHR7IHR5cGU6ICdudWxsJyB9LFxuXHRcdFx0dGVybWluYWxDaGF0QWdlbnRQcm9maWxlU2NoZW1hXG5cdFx0XSxcblx0XHRkZWZhdWx0U25pcHBldHM6IFtcblx0XHRcdHtcblx0XHRcdFx0Ym9keToge1xuXHRcdFx0XHRcdHBhdGg6ICckezF9J1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XVxuXHR9LFxuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5UZXJtaW5hbFByb2ZpbGVNYWNPc106IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbENoYXRBZ2VudFByb2ZpbGUub3N4JywgXCJUaGUgdGVybWluYWwgcHJvZmlsZSB0byB1c2Ugb24gbWFjT1MgZm9yIGNoYXQgYWdlbnQncyBydW4gaW4gdGVybWluYWwgdG9vbC5cIiksXG5cdFx0dHlwZTogWydvYmplY3QnLCAnbnVsbCddLFxuXHRcdGRlZmF1bHQ6IG51bGwsXG5cdFx0J2FueU9mJzogW1xuXHRcdFx0eyB0eXBlOiAnbnVsbCcgfSxcblx0XHRcdHRlcm1pbmFsQ2hhdEFnZW50UHJvZmlsZVNjaGVtYVxuXHRcdF0sXG5cdFx0ZGVmYXVsdFNuaXBwZXRzOiBbXG5cdFx0XHR7XG5cdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRwYXRoOiAnJHsxfSdcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdF1cblx0fSxcblx0W1Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuVGVybWluYWxQcm9maWxlV2luZG93c106IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbENoYXRBZ2VudFByb2ZpbGUud2luZG93cycsIFwiVGhlIHRlcm1pbmFsIHByb2ZpbGUgdG8gdXNlIG9uIFdpbmRvd3MgZm9yIGNoYXQgYWdlbnQncyBydW4gaW4gdGVybWluYWwgdG9vbC5cIiksXG5cdFx0dHlwZTogWydvYmplY3QnLCAnbnVsbCddLFxuXHRcdGRlZmF1bHQ6IG51bGwsXG5cdFx0J2FueU9mJzogW1xuXHRcdFx0eyB0eXBlOiAnbnVsbCcgfSxcblx0XHRcdHRlcm1pbmFsQ2hhdEFnZW50UHJvZmlsZVNjaGVtYVxuXHRcdF0sXG5cdFx0ZGVmYXVsdFNuaXBwZXRzOiBbXG5cdFx0XHR7XG5cdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRwYXRoOiAnJHsxfSdcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdF1cblx0fSxcblx0W1Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuT3V0cHV0TG9jYXRpb25dOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ291dHB1dExvY2F0aW9uLmRlc2NyaXB0aW9uJywgXCJXaGVyZSB0byBzaG93IHRoZSBvdXRwdXQgZnJvbSB0aGUgcnVuIGluIHRlcm1pbmFsIHRvb2wuXCIpLFxuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGVudW06IFsndGVybWluYWwnLCAnY2hhdCddLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCdvdXRwdXRMb2NhdGlvbi50ZXJtaW5hbCcsIFwiUmV2ZWFsIHRoZSB0ZXJtaW5hbCBpbiB0aGUgcGFuZWwgb3IgZWRpdG9yIGluIGFkZGl0aW9uIHRvIGNoYXQuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ291dHB1dExvY2F0aW9uLmNoYXQnLCBcIlJldmVhbCB0aGUgdGVybWluYWwgb3V0cHV0IHdpdGhpbiBjaGF0IG9ubHkuXCIpLFxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogJ2NoYXQnLFxuXHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0fVxuXHR9LFxuXHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWRdOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2FuZGJveC5lbmFibGVkU2V0dGluZycsIFwiQ29udHJvbHMgd2hldGhlciBhZ2VudCBtb2RlIHVzZXMgc2FuZGJveGluZyB0byByZXN0cmljdCB3aGF0IHRvb2xzIGNhbiBkby4gV2hlbiBlbmFibGVkLCB0b29scyBsaWtlIHRoZSB0ZXJtaW5hbCBhcmUgcnVuIGluIGEgc2FuZGJveGVkIGVudmlyb25tZW50IHRvIGxpbWl0IGFjY2VzcyB0byB0aGUgc3lzdGVtLiBVc2UgezB9IHRvIGFsbG93IGFsbCBuZXR3b3JrIGRvbWFpbnMuXCIsIGBcXGAjJHtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dOZXR3b3JrfSNcXGBgKSxcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9mZiwgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uXSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgnYWdlbnRTYW5kYm94LmVuYWJsZWRTZXR0aW5nLm9mZkRlc2NyaXB0aW9uJywgJ0Rpc2FibGUgc2FuZGJveGluZyBmb3IgYWdlbnQgbW9kZSB0b29scy4nKSxcblx0XHRcdGxvY2FsaXplKCdhZ2VudFNhbmRib3guZW5hYmxlZFNldHRpbmcub25EZXNjcmlwdGlvbicsICdFbmFibGUgc2FuZGJveGluZyBmb3IgYWdlbnQgbW9kZSB0b29scy4nKSxcblx0XHRdLFxuXHRcdGRlZmF1bHQ6IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PZmYsXG5cdFx0dGFnczogWydwcmV2aWV3J10sXG5cdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRtb2RlOiAnYXV0bydcblx0XHR9LFxuXHRcdHBvbGljeToge1xuXHRcdFx0bmFtZTogJ0NoYXRBZ2VudFNhbmRib3hFbmFibGVkJyxcblx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlZ3JhdGVkVGVybWluYWwsXG5cdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTE2Jyxcblx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdGtleTogJ2FnZW50U2FuZGJveC5lbmFibGVkU2V0dGluZycsXG5cdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCdhZ2VudFNhbmRib3guZW5hYmxlZFNldHRpbmcnLCBcIkNvbnRyb2xzIHdoZXRoZXIgYWdlbnQgbW9kZSB1c2VzIHNhbmRib3hpbmcgdG8gcmVzdHJpY3Qgd2hhdCB0b29scyBjYW4gZG8uIFdoZW4gZW5hYmxlZCwgdG9vbHMgbGlrZSB0aGUgdGVybWluYWwgYXJlIHJ1biBpbiBhIHNhbmRib3hlZCBlbnZpcm9ubWVudCB0byBsaW1pdCBhY2Nlc3MgdG8gdGhlIHN5c3RlbS4gVXNlIHswfSB0byBhbGxvdyBhbGwgbmV0d29yayBkb21haW5zLlwiLCBgXFxgIyR7QWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93TmV0d29ya30jXFxgYCksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRrZXk6ICdhZ2VudFNhbmRib3guZW5hYmxlZFNldHRpbmcub2ZmRGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCdhZ2VudFNhbmRib3guZW5hYmxlZFNldHRpbmcub2ZmRGVzY3JpcHRpb24nLCAnRGlzYWJsZSBzYW5kYm94aW5nIGZvciBhZ2VudCBtb2RlIHRvb2xzLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0a2V5OiAnYWdlbnRTYW5kYm94LmVuYWJsZWRTZXR0aW5nLm9uRGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCdhZ2VudFNhbmRib3guZW5hYmxlZFNldHRpbmcub25EZXNjcmlwdGlvbicsICdFbmFibGUgc2FuZGJveGluZyBmb3IgYWdlbnQgbW9kZSB0b29scy4nKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fVxuXHR9LFxuXHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFdpbmRvd3NFbmFibGVkXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudFNhbmRib3gud2luZG93c0VuYWJsZWRTZXR0aW5nJywgXCJDb250cm9scyB3aGV0aGVyIGFnZW50IG1vZGUgdXNlcyBzYW5kYm94aW5nIG9uIFdpbmRvd3MuIFVzZSB7MH0gdG8gYWxsb3cgYWxsIG5ldHdvcmsgZG9tYWlucy5cIiwgYFxcYCMke0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd05ldHdvcmt9I1xcYGApLFxuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGVudW06IFtBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT2ZmLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT25dLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCdhZ2VudFNhbmRib3gud2luZG93c0VuYWJsZWRTZXR0aW5nLm9mZkRlc2NyaXB0aW9uJywgJ0Rpc2FibGUgc2FuZGJveGluZyBmb3IgYWdlbnQgbW9kZSB0b29scyBvbiBXaW5kb3dzLicpLFxuXHRcdFx0bG9jYWxpemUoJ2FnZW50U2FuZGJveC53aW5kb3dzRW5hYmxlZFNldHRpbmcub25EZXNjcmlwdGlvbicsICdFbmFibGUgc2FuZGJveGluZyBmb3IgYWdlbnQgbW9kZSB0b29scyBvbiBXaW5kb3dzLicpLFxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9mZixcblx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0fVxuXHR9LFxuXHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93TmV0d29ya106IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRTYW5kYm94LmFsbG93TmV0d29yaycsIFwiV2hlbiB7MH0gaXMgZW5hYmxlZCwgY29udHJvbHMgd2hldGhlciB0byBhbGxvdyBhbGwgbmV0d29yayBkb21haW5zIGluIHRoZSBzYW5kYm94LiBXaGVuIGVuYWJsZWQsIHRoZSBzYW5kYm94IHByZXNlcnZlcyBmaWxlIHN5c3RlbSByZXN0cmljdGlvbnMgd2hpbGUgcmVsYXhpbmcgYWxsIG5ldHdvcmsgcmVzdHJpY3Rpb25zLlwiLCBgXFxgIyR7QWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWR9I1xcYGApLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHR0YWdzOiBbJ3ByZXZpZXcnXSxcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdHBvbGljeToge1xuXHRcdFx0bmFtZTogJ0NoYXRBZ2VudFNhbmRib3hBbGxvd05ldHdvcmsnLFxuXHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVncmF0ZWRUZXJtaW5hbCxcblx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMjcnLFxuXHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0a2V5OiAnYWdlbnRTYW5kYm94LmFsbG93TmV0d29yaycsXG5cdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCdhZ2VudFNhbmRib3guYWxsb3dOZXR3b3JrJywgXCJXaGVuIHswfSBpcyBlbmFibGVkLCBjb250cm9scyB3aGV0aGVyIHRvIGFsbG93IGFsbCBuZXR3b3JrIGRvbWFpbnMgaW4gdGhlIHNhbmRib3guIFdoZW4gZW5hYmxlZCwgdGhlIHNhbmRib3ggcHJlc2VydmVzIGZpbGUgc3lzdGVtIHJlc3RyaWN0aW9ucyB3aGlsZSByZWxheGluZyBhbGwgbmV0d29yayByZXN0cmljdGlvbnMuXCIsIGBcXGAjJHtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZH0jXFxgYCksXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0sXG5cdFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dVbnNhbmRib3hlZENvbW1hbmRzXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudFNhbmRib3guYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzJywgXCJDb250cm9scyB3aGV0aGVyIGFnZW50IG1vZGUgdGVybWluYWwgY29tbWFuZHMgY2FuIHJ1biBvdXRzaWRlIHRoZSBzYW5kYm94IGFmdGVyIHVzZXIgY29uZmlybWF0aW9uIHdoZW4gYSBzYW5kYm94ZWQgY29tbWFuZCBmYWlscyBvciB3aGVuIHNhbmRib3ggcmVzdHJpY3Rpb25zIHdvdWxkIGJsb2NrIHRoZSBjb21tYW5kLiBUaGlzIGFwcGxpZXMgb25seSB3aGVuIHswfSBpcyBlbmFibGVkLlwiLCBgXFxgIyR7QWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWR9I1xcYGApLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdHRhZ3M6IFsncHJldmlldyddLFxuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0cG9saWN5OiB7XG5cdFx0XHRuYW1lOiAnQ2hhdEFnZW50U2FuZGJveEFsbG93VW5zYW5kYm94ZWRDb21tYW5kcycsXG5cdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZWdyYXRlZFRlcm1pbmFsLFxuXHRcdFx0bWluaW11bVZlcnNpb246ICcxLjExNicsXG5cdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRrZXk6ICdhZ2VudFNhbmRib3guYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzJyxcblx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoJ2FnZW50U2FuZGJveC5hbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgYWdlbnQgbW9kZSB0ZXJtaW5hbCBjb21tYW5kcyBjYW4gcnVuIG91dHNpZGUgdGhlIHNhbmRib3ggYWZ0ZXIgdXNlciBjb25maXJtYXRpb24gd2hlbiBhIHNhbmRib3hlZCBjb21tYW5kIGZhaWxzIG9yIHdoZW4gc2FuZGJveCByZXN0cmljdGlvbnMgd291bGQgYmxvY2sgdGhlIGNvbW1hbmQuIFRoaXMgYXBwbGllcyBvbmx5IHdoZW4gezB9IGlzIGVuYWJsZWQuXCIsIGBcXGAjJHtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZH0jXFxgYCksXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0sXG5cdFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94UmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHNdOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2FuZGJveC5yZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cycsIFwiQ29udHJvbHMgd2hldGhlciBhZ2VudCBtb2RlIHRlcm1pbmFsIGNvbW1hbmRzIGNhbiByZXRyeSBpbiB0aGUgc2FuZGJveCB3aXRoIHVucmVzdHJpY3RlZCBuZXR3b3JrIGFjY2VzcyBhZnRlciB1c2VyIGNvbmZpcm1hdGlvbi4gVGhpcyBhcHBsaWVzIG9ubHkgd2hlbiB7MH0gaXMgZW5hYmxlZCBhbmQgcHJlc2VydmVzIGZpbGUgc3lzdGVtIHNhbmRib3hpbmcgd2hpbGUgcmVsYXhpbmcgbmV0d29yayByZXN0cmljdGlvbnMgZm9yIGFuIGFwcHJvdmVkIGNvbW1hbmQuXCIsIGBcXGAjJHtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZH0jXFxgYCksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0dGFnczogWydwcmV2aWV3J10sXG5cdFx0cmVzdHJpY3RlZDogdHJ1ZVxuXHR9LFxuXHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93QXV0b0FwcHJvdmVdOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2FuZGJveC5hbGxvd0F1dG9BcHByb3ZlJywgXCJDb250cm9scyB3aGV0aGVyIGFnZW50IG1vZGUgdGVybWluYWwgY29tbWFuZHMgdGhhdCBydW4gaW5zaWRlIHRoZSBzYW5kYm94IGFyZSBhdXRvLWFwcHJvdmVkLiBXaGVuIGRpc2FibGVkLCB0aGUgcnVuIGluIHRlcm1pbmFsIHRvb2wgdXNlcyB0aGUgZXhpc3RpbmcgYXBwcm92YWwgZmxvdy4gVGhpcyBhcHBsaWVzIG9ubHkgd2hlbiB7MH0gaXMgZW5hYmxlZC5cIiwgYFxcYCMke0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkfSNcXGBgKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHR0YWdzOiBbJ3ByZXZpZXcnXSxcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdHBvbGljeToge1xuXHRcdFx0bmFtZTogJ0NoYXRBZ2VudFNhbmRib3hBbGxvd0F1dG9BcHByb3ZlJyxcblx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlZ3JhdGVkVGVybWluYWwsXG5cdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTE2Jyxcblx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdGtleTogJ2FnZW50U2FuZGJveC5hbGxvd0F1dG9BcHByb3ZlJyxcblx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoJ2FnZW50U2FuZGJveC5hbGxvd0F1dG9BcHByb3ZlJywgXCJDb250cm9scyB3aGV0aGVyIGFnZW50IG1vZGUgdGVybWluYWwgY29tbWFuZHMgdGhhdCBydW4gaW5zaWRlIHRoZSBzYW5kYm94IGFyZSBhdXRvLWFwcHJvdmVkLiBXaGVuIGRpc2FibGVkLCB0aGUgcnVuIGluIHRlcm1pbmFsIHRvb2wgdXNlcyB0aGUgZXhpc3RpbmcgYXBwcm92YWwgZmxvdy4gVGhpcyBhcHBsaWVzIG9ubHkgd2hlbiB7MH0gaXMgZW5hYmxlZC5cIiwgYFxcYCMke0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkfSNcXGBgKSxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSxcblx0W1Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQWdlbnRTYW5kYm94TGludXhGaWxlU3lzdGVtXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudFNhbmRib3gubGludXhGaWxlU3lzdGVtU2V0dGluZycsIFwiTm90ZTogdGhpcyBzZXR0aW5nIGlzIGFwcGxpY2FibGUgb25seSB3aGVuIHswfSBpcyBlbmFibGVkLiBDb250cm9scyBmaWxlIHN5c3RlbSBhY2Nlc3MgaW4gc2FuZGJveCBvbiBMaW51eC4gUGF0aHMgZG8gbm90IHN1cHBvcnQgZ2xvYiBwYXR0ZXJucywgb25seSBsaXRlcmFsIHBhdGhzIChleDogLi9zcmMvLCB+Ly5zc2gsIC5lbnYpLiAqKmJ1YmJsZXdyYXAqKiBhbmQgKipzb2NhdCoqIHNob3VsZCBiZSBpbnN0YWxsZWQgZm9yIHRoaXMgc2V0dGluZyB0byB3b3JrLlwiLCBgXFxgIyR7QWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWR9I1xcYGApLFxuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdGRlbnlSZWFkOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRTYW5kYm94LmxpbnV4RmlsZVN5c3RlbVNldHRpbmcuZGVueVJlYWQnLCBcIkFycmF5IG9mIHBhdGhzIHRvIGRlbnkgcmVhZCBhY2Nlc3MuIExlYXZlIGVtcHR5IHRvIGFsbG93IHJlYWRpbmcgYWxsIHBhdGhzLlwiKSxcblx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0ZGVmYXVsdDogW11cblx0XHRcdH0sXG5cdFx0XHRhbGxvd1JlYWQ6IHtcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudFNhbmRib3gubGludXhGaWxlU3lzdGVtU2V0dGluZy5hbGxvd1JlYWQnLCBcIkFycmF5IG9mIHBhdGhzIHRvIHJlLWFsbG93IHJlYWQgYWNjZXNzIHdpdGhpbiBkZW5pZWQgcmVnaW9ucy4gVGFrZXMgcHJlY2VkZW5jZSBvdmVyIGRlbnlSZWFkLlwiKSxcblx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0ZGVmYXVsdDogW11cblx0XHRcdH0sXG5cdFx0XHRhbGxvd1dyaXRlOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRTYW5kYm94LmxpbnV4RmlsZVN5c3RlbVNldHRpbmcuYWxsb3dXcml0ZScsIFwiQXJyYXkgb2YgYWRkaXRpb25hbCBwYXRocyB0byBhbGxvdyB3cml0ZSBhY2Nlc3MuIExlYXZlIGVtcHR5IHRvIGRpc2FsbG93IHdyaXRlcyBvdXRzaWRlIHRoZSB3b3Jrc3BhY2UgZm9sZGVycywgd29ya3NwYWNlIHN0b3JhZ2UgZm9sZGVyLCBhbmQgc2FuZGJveCB0ZW1wIGRpcmVjdG9yeS5cIiksXG5cdFx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdGRlZmF1bHQ6IFtdXG5cdFx0XHR9LFxuXHRcdFx0ZGVueVdyaXRlOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRTYW5kYm94LmxpbnV4RmlsZVN5c3RlbVNldHRpbmcuZGVueVdyaXRlJywgXCJBcnJheSBvZiBwYXRocyB0byBkZW55IHdyaXRlIGFjY2VzcyB3aXRoaW4gYWxsb3dlZCBwYXRocyAodGFrZXMgcHJlY2VkZW5jZSBvdmVyIGFsbG93V3JpdGUpLlwiKSxcblx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0ZGVmYXVsdDogW11cblx0XHRcdH1cblx0XHR9LFxuXHRcdGRlZmF1bHQ6IHtcblx0XHRcdGRlbnlSZWFkOiBbXSxcblx0XHRcdGFsbG93UmVhZDogW10sXG5cdFx0XHRhbGxvd1dyaXRlOiBbXSxcblx0XHRcdGRlbnlXcml0ZTogW11cblx0XHR9LFxuXHRcdHRhZ3M6IFsncHJldmlldyddLFxuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdH0sXG5cdFtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkFnZW50U2FuZGJveE1hY0ZpbGVTeXN0ZW1dOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2FuZGJveC5tYWNGaWxlU3lzdGVtU2V0dGluZycsIFwiTm90ZTogdGhpcyBzZXR0aW5nIGlzIGFwcGxpY2FibGUgb25seSB3aGVuIHswfSBpcyBlbmFibGVkLiBDb250cm9scyBmaWxlIHN5c3RlbSBhY2Nlc3MgaW4gc2FuZGJveCBvbiBtYWNPUy4gUGF0aHMgYWxzbyBzdXBwb3J0IGdpdC1zdHlsZSBnbG9iIHBhdHRlcm5zKGV4OiAqLnRzLCAuL3NyYywgLi9zcmMvKiovKi50cywgZmlsZT8udHh0KS5cIiwgYFxcYCMke0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkfSNcXGBgKSxcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRkZW55UmVhZDoge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2FuZGJveC5tYWNGaWxlU3lzdGVtU2V0dGluZy5kZW55UmVhZCcsIFwiQXJyYXkgb2YgcGF0aHMgdG8gZGVueSByZWFkIGFjY2Vzcy4gTGVhdmUgZW1wdHkgdG8gYWxsb3cgcmVhZGluZyBhbGwgcGF0aHMuXCIpLFxuXHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRkZWZhdWx0OiBbXVxuXHRcdFx0fSxcblx0XHRcdGFsbG93UmVhZDoge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2FuZGJveC5tYWNGaWxlU3lzdGVtU2V0dGluZy5hbGxvd1JlYWQnLCBcIkFycmF5IG9mIHBhdGhzIHRvIHJlLWFsbG93IHJlYWQgYWNjZXNzIHdpdGhpbiBkZW5pZWQgcmVnaW9ucy4gVGFrZXMgcHJlY2VkZW5jZSBvdmVyIGRlbnlSZWFkLlwiKSxcblx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0ZGVmYXVsdDogW11cblx0XHRcdH0sXG5cdFx0XHRhbGxvd1dyaXRlOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRTYW5kYm94Lm1hY0ZpbGVTeXN0ZW1TZXR0aW5nLmFsbG93V3JpdGUnLCBcIkFycmF5IG9mIGFkZGl0aW9uYWwgcGF0aHMgdG8gYWxsb3cgd3JpdGUgYWNjZXNzLiBMZWF2ZSBlbXB0eSB0byBkaXNhbGxvdyB3cml0ZXMgb3V0c2lkZSB0aGUgd29ya3NwYWNlIGZvbGRlcnMsIHdvcmtzcGFjZSBzdG9yYWdlIGZvbGRlciwgYW5kIHNhbmRib3ggdGVtcCBkaXJlY3RvcnkuXCIpLFxuXHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRkZWZhdWx0OiBbXVxuXHRcdFx0fSxcblx0XHRcdGRlbnlXcml0ZToge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2FuZGJveC5tYWNGaWxlU3lzdGVtU2V0dGluZy5kZW55V3JpdGUnLCBcIkFycmF5IG9mIHBhdGhzIHRvIGRlbnkgd3JpdGUgYWNjZXNzIHdpdGhpbiBhbGxvd2VkIHBhdGhzICh0YWtlcyBwcmVjZWRlbmNlIG92ZXIgYWxsb3dXcml0ZSkuXCIpLFxuXHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRkZWZhdWx0OiBbXVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0ZGVmYXVsdDoge1xuXHRcdFx0ZGVueVJlYWQ6IFtdLFxuXHRcdFx0YWxsb3dSZWFkOiBbXSxcblx0XHRcdGFsbG93V3JpdGU6IFtdLFxuXHRcdFx0ZGVueVdyaXRlOiBbXVxuXHRcdH0sXG5cdFx0dGFnczogWydwcmV2aWV3J10sXG5cdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0fSxcblx0W1Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQWdlbnRTYW5kYm94V2luZG93c0ZpbGVTeXN0ZW1dOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2FuZGJveC53aW5kb3dzRmlsZVN5c3RlbVNldHRpbmcnLCBcIk5vdGU6IHRoaXMgc2V0dGluZyBpcyBhcHBsaWNhYmxlIG9ubHkgd2hlbiB7MH0gaXMgZW5hYmxlZC4gQ29udHJvbHMgZmlsZSBzeXN0ZW0gYWNjZXNzIGluIHNhbmRib3ggb24gV2luZG93cy4gUGF0aHMgZG8gbm90IHN1cHBvcnQgZ2xvYiBwYXR0ZXJucywgb25seSBsaXRlcmFsIHBhdGhzIChleDogQzpcXFxcc3JjLCBDOlxcXFxVc2Vyc1xcXFxtZVxcXFwuc3NoLCAuZW52KS5cIiwgYFxcYCMke0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkfSNcXGBgKSxcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRkZW55UmVhZDoge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50U2FuZGJveC53aW5kb3dzRmlsZVN5c3RlbVNldHRpbmcuZGVueVJlYWQnLCBcIkFycmF5IG9mIHBhdGhzIHRvIGRlbnkgYWNjZXNzLiBMZWF2ZSBlbXB0eSB0byBhbGxvdyByZWFkaW5nIGFsbCBwYXRocy5cIiksXG5cdFx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdGRlZmF1bHQ6IFtdXG5cdFx0XHR9LFxuXHRcdFx0YWxsb3dSZWFkOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRTYW5kYm94LndpbmRvd3NGaWxlU3lzdGVtU2V0dGluZy5hbGxvd1JlYWQnLCBcIkFycmF5IG9mIGFkZGl0aW9uYWwgcGF0aHMgdG8gYWxsb3cgcmVhZC1vbmx5IGFjY2Vzcy4gVGFrZXMgcHJlY2VkZW5jZSBvdmVyIGRlbnlSZWFkLlwiKSxcblx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0ZGVmYXVsdDogW11cblx0XHRcdH0sXG5cdFx0XHRhbGxvd1dyaXRlOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRTYW5kYm94LndpbmRvd3NGaWxlU3lzdGVtU2V0dGluZy5hbGxvd1dyaXRlJywgXCJBcnJheSBvZiBhZGRpdGlvbmFsIHBhdGhzIHRvIGFsbG93IHJlYWQvd3JpdGUgYWNjZXNzLiBMZWF2ZSBlbXB0eSB0byBkaXNhbGxvdyB3cml0ZXMgb3V0c2lkZSB0aGUgd29ya3NwYWNlIGZvbGRlcnMsIHdvcmtzcGFjZSBzdG9yYWdlIGZvbGRlciwgYW5kIHNhbmRib3ggdGVtcCBkaXJlY3RvcnkuXCIpLFxuXHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRkZWZhdWx0OiBbXVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0ZGVmYXVsdDoge1xuXHRcdFx0ZGVueVJlYWQ6IFtdLFxuXHRcdFx0YWxsb3dSZWFkOiBbXSxcblx0XHRcdGFsbG93V3JpdGU6IFtdXG5cdFx0fSxcblx0XHR0YWdzOiBbJ3ByZXZpZXcnXSxcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHR9LFxuXHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFdpbmRvd3NTY2hlbWFWZXJzaW9uXToge1xuXHRcdC8vIEludGVudGlvbmFsbHkgYXZhaWxhYmxlIG9ubHkgdG8gY2FsbGVycyB0aGF0IGV4cGxpY2l0bHkgc2V0IGl0IGluIHNldHRpbmdzLmpzb24uXG5cdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdH0sXG5cdFtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkFnZW50U2FuZGJveEFkdmFuY2VkUnVudGltZV06IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRTYW5kYm94LnJ1bnRpbWVTZXR0aW5nJywgXCJOb3RlOiB0aGlzIHNldHRpbmcgaXMgYXBwbGljYWJsZSBvbmx5IHdoZW4gezB9IGlzIGVuYWJsZWQuIEtleS92YWx1ZSBwYWlycyBhcmUgcGFzc2VkIHRocm91Z2ggdG8gdGhlIHJvb3Qgb2YgdGhlIHNhbmRib3ggcnVudGltZSBjb25maWd1cmF0aW9uLlwiLCBgXFxgIyR7QWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWR9I1xcYGApLFxuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdGRlZmF1bHQ6IHtcblx0XHRcdGVuYWJsZVdlYWtlck5lc3RlZFNhbmRib3g6IGZhbHNlXG5cdFx0fSxcblx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogdHJ1ZSxcblx0XHR0YWdzOiBbJ3ByZXZpZXcnXSxcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHR9LFxuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5QcmV2ZW50U2hlbGxIaXN0b3J5XToge1xuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IFtcblx0XHRcdGxvY2FsaXplKCdwcmV2ZW50U2hlbGxIaXN0b3J5LmRlc2NyaXB0aW9uJywgXCJXaGV0aGVyIHRvIGV4Y2x1ZGUgY29tbWFuZHMgcnVuIGJ5IHRoZSB0ZXJtaW5hbCB0b29sIGZyb20gdGhlIHNoZWxsIGhpc3RvcnkuIFNlZSBiZWxvdyBmb3IgdGhlIHN1cHBvcnRlZCBzaGVsbHMgYW5kIHRoZSBtZXRob2QgdXNlZCBmb3IgZWFjaDpcIiksXG5cdFx0XHRgLSBcXGBiYXNoXFxgOiAke2xvY2FsaXplKCdwcmV2ZW50U2hlbGxIaXN0b3J5LmRlc2NyaXB0aW9uLmJhc2gnLCBcIlNldHMgYEhJU1RDT05UUk9MPWlnbm9yZXNwYWNlYCBhbmQgcHJlcGVuZHMgdGhlIGNvbW1hbmQgd2l0aCBzcGFjZVwiKX1gLFxuXHRcdFx0YC0gXFxgenNoXFxgOiAke2xvY2FsaXplKCdwcmV2ZW50U2hlbGxIaXN0b3J5LmRlc2NyaXB0aW9uLnpzaCcsIFwiU2V0cyBgSElTVF9JR05PUkVfU1BBQ0VgIG9wdGlvbiBhbmQgcHJlcGVuZHMgdGhlIGNvbW1hbmQgd2l0aCBzcGFjZVwiKX1gLFxuXHRcdFx0YC0gXFxgZmlzaFxcYDogJHtsb2NhbGl6ZSgncHJldmVudFNoZWxsSGlzdG9yeS5kZXNjcmlwdGlvbi5maXNoJywgXCJTZXRzIGBmaXNoX3ByaXZhdGVfbW9kZWAgdG8gcHJldmVudCBhbnkgY29tbWFuZCBmcm9tIGVudGVyaW5nIGhpc3RvcnlcIil9YCxcblx0XHRcdGAtIFxcYHB3c2hcXGA6ICR7bG9jYWxpemUoJ3ByZXZlbnRTaGVsbEhpc3RvcnkuZGVzY3JpcHRpb24ucHdzaCcsIFwiU2V0cyBhIGN1c3RvbSBoaXN0b3J5IGhhbmRsZXIgdmlhIFBTUmVhZExpbmUncyBgQWRkVG9IaXN0b3J5SGFuZGxlcmAgdG8gcHJldmVudCBhbnkgY29tbWFuZCBmcm9tIGVudGVyaW5nIGhpc3RvcnlcIil9YCxcblx0XHRdLmpvaW4oJ1xcbicpLFxuXHR9LFxuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5FbmZvcmNlVGltZW91dEZyb21Nb2RlbF06IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0fSxcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZW5mb3JjZVRpbWVvdXRGcm9tTW9kZWwuZGVzY3JpcHRpb24nLCBcIldoZXRoZXIgdG8gZW5mb3JjZSB0aGUgdGltZW91dCB2YWx1ZSBwcm92aWRlZCBieSB0aGUgbW9kZWwgaW4gdGhlIHJ1biBpbiB0ZXJtaW5hbCB0b29sLiBXaGVuIGVuYWJsZWQsIGlmIHRoZSBtb2RlbCBwcm92aWRlcyBhIHRpbWVvdXQgcGFyYW1ldGVyLCB0aGUgdG9vbCB3aWxsIHN0b3AgdHJhY2tpbmcgdGhlIGNvbW1hbmQgYWZ0ZXIgdGhhdCBkdXJhdGlvbiBhbmQgcmV0dXJuIHRoZSBvdXRwdXQgY29sbGVjdGVkIHNvIGZhci5cIiksXG5cdH0sXG5cdFtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLklkbGVTaWxlbmNlVGltZW91dE1zXToge1xuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0dHlwZTogJ251bWJlcicsXG5cdFx0ZGVmYXVsdDogREVGQVVMVF9JRExFX1NJTEVOQ0VfVElNRU9VVF9NUyxcblx0XHRtaW5pbXVtOiAwLFxuXHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0fSxcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaWRsZVNpbGVuY2VUaW1lb3V0TXMuZGVzY3JpcHRpb24nLCBcIk51bWJlciBvZiBtaWxsaXNlY29uZHMgdGhlIHJ1biBpbiB0ZXJtaW5hbCB0b29sIHdpbGwgd2FpdCBmb3IgbmV3IG91dHB1dCBmcm9tIGEgc3luY2hyb25vdXMgY29tbWFuZCBiZWZvcmUgbW92aW5nIGl0IHRvIGEgYmFja2dyb3VuZCB0ZXJtaW5hbCBhbmQgcmV0dXJuaW5nIHdoYXQgd2FzIGNvbGxlY3RlZCBzbyBmYXIuIFRoZSBwcm9jZXNzIGlzIG5vdCBraWxsZWQgXHUyMDE0IHRoZSB0b29sIHJldHVybnMgdGhlIHRlcm1pbmFsIElEIHNvIHRoZSBtb2RlbCBjYW4gcG9sbCwgc2VuZCBpbnB1dCwgb3Iga2lsbCBpdC4gU2V0IHRvIHswfSB0byBkaXNhYmxlLlwiLCAnYDBgJyksXG5cdH0sXG5cdFtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkRldGFjaEJhY2tncm91bmRQcm9jZXNzZXNdOiB7XG5cdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2RldGFjaEJhY2tncm91bmRQcm9jZXNzZXMuZGVzY3JpcHRpb24nLCBcIldoZXRoZXIgdG8gZGV0YWNoIHBlcnNpc3RlbnQgdGVybWluYWwgcHJvY2Vzc2VzIHNvIHRoZXkgc3Vydml2ZSB3aGVuIFZTIENvZGUgZXhpdHMuIFdoZW4gZW5hYmxlZCwgY29tbWFuZHMgc3RhcnRlZCB3aXRoIGBtb2RlOiBcXFwiYXN5bmNcXFwiYCAobGVnYWN5OiBgaXNCYWNrZ3JvdW5kOiB0cnVlYCkgYXJlIHdyYXBwZWQgd2l0aCBgbm9odXBgIChQT1NJWCkgb3IgYFN0YXJ0LVByb2Nlc3NgIChXaW5kb3dzKSBzbyB0aGUgcHJvY2VzcyBjb250aW51ZXMgcnVubmluZyBhZnRlciB0aGUgdGVybWluYWwgaXMgZGlzcG9zZWQuXCIpLFxuXHR9LFxuXHRbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5CYWNrZ3JvdW5kTm90aWZpY2F0aW9uc106IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0ZGVwcmVjYXRlZDogdHJ1ZSxcblx0XHRtYXJrZG93bkRlcHJlY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ2JhY2tncm91bmROb3RpZmljYXRpb25zLmRlcHJlY2F0ZWQnLCBcIlRoaXMgc2V0dGluZyBpcyBkZXByZWNhdGVkLiBUZXJtaW5hbCBjb21wbGV0aW9uIGFuZCBpbnB1dC1uZWVkZWQgbm90aWZpY2F0aW9ucyBhcmUgbm93IGFsd2F5cyBlbmFibGVkLlwiKSxcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYmFja2dyb3VuZE5vdGlmaWNhdGlvbnMuZGVzY3JpcHRpb24nLCBcIlRoaXMgc2V0dGluZyBpcyBkZXByZWNhdGVkIGFuZCBubyBsb25nZXIgaGFzIGFueSBlZmZlY3QuIFRlcm1pbmFsIGNvbXBsZXRpb24gYW5kIGlucHV0LW5lZWRlZCBub3RpZmljYXRpb25zIGFyZSBub3cgYWx3YXlzIGVuYWJsZWQgZm9yIGFueSBjb21tYW5kIHRoYXQgY29udGludWVzIHJ1bm5pbmcgYWZ0ZXIgdGhlIHRvb2wgcmV0dXJucy5cIiksXG5cdH0sXG5cdFtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLk91dHB1dERlbHRhc106IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdH0sXG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ291dHB1dERlbHRhcy5kZXNjcmlwdGlvbicsIFwiV2hlbiBlbmFibGVkLCByZXBlYXRlZCBnZXQgdGVybWluYWwgb3V0cHV0IHRvb2wgY2FsbHMgcmV0dXJuIG9ubHkgb3V0cHV0IGFkZGVkIHNpbmNlIHRoZSBwcmV2aW91cyBwb2xsIGZvciB0aGUgc2FtZSB0ZXJtaW5hbCBleGVjdXRpb24sIG9yIGEgc2hvcnQgdW5jaGFuZ2VkLW91dHB1dCBtZXNzYWdlIHdoZW4gdGhlcmUgaXMgbm8gbmV3IG91dHB1dC5cIiksXG5cdH0sXG5cdFtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLk91dHB1dENvbXBhY3Rpb25dOiB7XG5cdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRtb2RlOiAnYXV0bydcblx0XHR9LFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdvdXRwdXRDb21wYWN0aW9uLmRlc2NyaXB0aW9uJywgXCJXaGVuIGVuYWJsZWQsIHRoZSBvdXRwdXQgb2YgY29tbWFuZHMgcnVuIGJ5IHRoZSBydW4gaW4gdGVybWluYWwgdG9vbCBpcyBjb21wYWN0ZWQgYmVmb3JlIGJlaW5nIHJldHVybmVkIHRvIHRoZSBtb2RlbCwgcmVkdWNpbmcgdGhlIG51bWJlciBvZiB0b2tlbnMgc3BlbnQgb24gbm9pc3kgb3V0cHV0IChmb3IgZXhhbXBsZSBwcm9ncmVzcyBiYXJzIG9yIHJlcGVhdGVkIGxvZyBsaW5lcykgd2hpbGUgcHJlc2VydmluZyB0aGUgaW1wb3J0YW50IGluZm9ybWF0aW9uLlwiKSxcblx0fVxufTtcblxuZm9yIChjb25zdCBpZCBvZiBbXG5cdFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuRGVwcmVjYXRlZEF1dG9BcHByb3ZlMSxcblx0VGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5EZXByZWNhdGVkQXV0b0FwcHJvdmUyLFxuXHRUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkRlcHJlY2F0ZWRBdXRvQXBwcm92ZTMsXG5cdFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuRGVwcmVjYXRlZEF1dG9BcHByb3ZlNCxcblx0VGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5EZXByZWNhdGVkQXV0b0FwcHJvdmVDb21wYXRpYmxlLFxuXSkge1xuXHR0ZXJtaW5hbENoYXRBZ2VudFRvb2xzQ29uZmlndXJhdGlvbltpZF0gPSB7XG5cdFx0Li4uKGlkID09PSBUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkRlcHJlY2F0ZWRBdXRvQXBwcm92ZUNvbXBhdGlibGUgPyB7IHJlc3RyaWN0ZWQ6IHRydWUgfSA6IHt9KSxcblx0XHRkZXByZWNhdGVkOiB0cnVlLFxuXHRcdG1hcmtkb3duRGVwcmVjYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuZGVwcmVjYXRlZCcsICdVc2UgezB9IGluc3RlYWQnLCBgXFxgIyR7VGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZX0jXFxgYClcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU9BLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsMEJBQTBCLDZCQUE2QjtBQUNo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QUMscUVBQW9ELEdBQUc7QUFBQSxJQUN2RCxZQUFZO0FBQUEsSUFDWixNQUFNO0FBQUEsSUFDTixTQUFTO0FBQUEsSUFDVCxTQUFTO0FBQUEsSUFDVCxNQUFNLENBQUMsY0FBYztBQUFBLElBQ3JCLFlBQVk7QUFBQSxNQUNYLE1BQU07QUFBQSxJQUNQO0FBQUEsSUFDQSxxQkFBcUIsU0FBUyxvQ0FBb0Msa1VBQTZULEtBQUs7QUFBQSxFQUNyWTtBQUFBLEVBQ0EsQ0FBQywrRUFBeUQsR0FBRztBQUFBLElBQzVELFVBQVU7QUFBQSxJQUNWLFlBQVk7QUFBQSxJQUNaLE1BQU07QUFBQSxJQUNOLFNBQVM7QUFBQSxJQUNULE1BQU0sQ0FBQyxjQUFjO0FBQUEsSUFDckIscUJBQXFCLFNBQVMseUNBQXlDLHVTQUF5UztBQUFBLEVBQ2pYO0FBQUEsRUFDQSxDQUFDLDJFQUF1RCxHQUFHO0FBQUEsSUFDMUQsWUFBWTtBQUFBLElBQ1osTUFBTTtBQUFBLElBQ04sU0FBUztBQUFBLElBQ1QsTUFBTSxDQUFDLGNBQWM7QUFBQSxJQUNyQixZQUFZO0FBQUEsSUFDWiw0QkFBNEIsU0FBUyxzQ0FBc0Msd0dBQXdHO0FBQUEsSUFDbkwscUJBQXFCLFNBQVMsdUNBQXVDLG1NQUFtTTtBQUFBLEVBQ3pRO0FBQUEsRUFDQSxDQUFDLHFEQUE0QyxHQUFHO0FBQUEsSUFDL0MsWUFBWTtBQUFBLElBQ1osTUFBTTtBQUFBLElBQ04sU0FBUztBQUFBLElBQ1QsTUFBTSxDQUFDLGNBQWM7QUFBQSxJQUNyQixZQUFZO0FBQUEsTUFDWCxNQUFNO0FBQUEsSUFDUDtBQUFBLElBQ0EscUJBQXFCLFNBQVMsNEJBQTRCLDBNQUEwTTtBQUFBLEVBQ3JRO0FBQUEsRUFDQSxDQUFDLDZEQUFnRCxHQUFHO0FBQUEsSUFDbkQsWUFBWTtBQUFBLElBQ1osTUFBTTtBQUFBLElBQ04sU0FBUztBQUFBLElBQ1QsTUFBTSxDQUFDLGNBQWM7QUFBQSxJQUNyQixZQUFZO0FBQUEsTUFDWCxNQUFNO0FBQUEsSUFDUDtBQUFBLElBQ0EscUJBQXFCLFNBQVMsZ0NBQWdDLHlRQUF5UTtBQUFBLEVBQ3hVO0FBQ0Q7QUFFQSxXQUFXLE1BQU07QUFBQSxFQUNoQjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFDRCxHQUFHO0FBQ0Ysc0NBQW9DLEVBQUUsSUFBSTtBQUFBLElBQ3pDLEdBQUksT0FBTywwRUFBa0UsRUFBRSxZQUFZLEtBQUssSUFBSSxDQUFDO0FBQUEsSUFDckcsWUFBWTtBQUFBLElBQ1osNEJBQTRCLFNBQVMsMEJBQTBCLG1CQUFtQixNQUFNLG1EQUEyQyxLQUFLO0FBQUEsRUFDekk7QUFDRDsiLAogICJuYW1lcyI6IFsiVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZCJdCn0K
