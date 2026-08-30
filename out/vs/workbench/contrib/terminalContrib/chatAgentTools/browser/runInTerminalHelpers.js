import { Separator } from "../../../../../base/common/actions.js";
import { coalesce } from "../../../../../base/common/arrays.js";
import { posix as pathPosix, win32 as pathWin32 } from "../../../../../base/common/path.js";
import { OperatingSystem } from "../../../../../base/common/platform.js";
import { escapeRegExpCharacters } from "../../../../../base/common/strings.js";
import { localize } from "../../../../../nls.js";
import { isAutoApproveRule } from "./tools/commandLineAnalyzer/commandLineAnalyzer.js";
function isPowerShell(envShell, os) {
  if (os === OperatingSystem.Windows) {
    return /^(?:powershell|pwsh)(?:-preview)?$/i.test(pathWin32.basename(envShell).replace(/\.exe$/i, ""));
  }
  return /^(?:powershell|pwsh)(?:-preview)?$/.test(pathPosix.basename(envShell));
}
function isWindowsPowerShell(envShell) {
  return envShell.endsWith("System32\\WindowsPowerShell\\v1.0\\powershell.exe");
}
function isZsh(envShell, os) {
  if (os === OperatingSystem.Windows) {
    return /^zsh(?:\.exe)?$/i.test(pathWin32.basename(envShell));
  }
  return /^zsh$/.test(pathPosix.basename(envShell));
}
function isBash(envShell, os) {
  if (os === OperatingSystem.Windows) {
    return /^bash(?:\.exe)?$/i.test(pathWin32.basename(envShell));
  }
  return /^bash$/.test(pathPosix.basename(envShell));
}
function isFish(envShell, os) {
  if (os === OperatingSystem.Windows) {
    return /^fish(?:\.exe)?$/i.test(pathWin32.basename(envShell));
  }
  return /^fish$/.test(pathPosix.basename(envShell));
}
const TRUNCATION_MESSAGE = "\n\n[... PREVIOUS OUTPUT TRUNCATED ...]\n\n";
function truncateOutputKeepingTail(output, maxLength) {
  if (output.length <= maxLength) {
    return output;
  }
  const truncationMessageLength = TRUNCATION_MESSAGE.length;
  if (truncationMessageLength >= maxLength) {
    return TRUNCATION_MESSAGE.slice(TRUNCATION_MESSAGE.length - maxLength);
  }
  const availableLength = maxLength - truncationMessageLength;
  const endPortion = output.slice(-availableLength);
  return TRUNCATION_MESSAGE + endPortion;
}
function normalizeTerminalCommandForDisplay(commandLine) {
  return commandLine.replace(/\\(["'\/])/g, "$1");
}
function buildCommandDisplayText(command) {
  const normalized = normalizeTerminalCommandForDisplay(command).replace(/\r\n|\r|\n/g, " ");
  return normalized.length > 80 ? normalized.substring(0, 77) + "..." : normalized;
}
function normalizeCommandForExecution(command) {
  return command.replace(/\r\n|\r|\n/g, " ").trim();
}
function isMultilineCommand(command) {
  const normalized = command.replace(/\r\n|\r/g, "\n");
  return /(?<!\\)\n/.test(normalized);
}
function generateAutoApproveActions(commandLine, subCommands, autoApproveResult, options) {
  const actions = [];
  const canCreateAutoApproval = autoApproveResult.subCommandResults.every((e) => e.result !== "denied") && autoApproveResult.commandLineResult.result !== "denied";
  if (canCreateAutoApproval) {
    const unapprovedSubCommands = subCommands.filter((_, index) => {
      return autoApproveResult.subCommandResults[index].result !== "approved";
    });
    const neverAutoApproveCommands = /* @__PURE__ */ new Set([
      // Shell interpreters
      "bash",
      "sh",
      "zsh",
      "fish",
      "ksh",
      "csh",
      "tcsh",
      "dash",
      "pwsh",
      "powershell",
      "powershell.exe",
      "cmd",
      "cmd.exe",
      // Script interpreters
      "python",
      "python3",
      "node",
      "ruby",
      "perl",
      "php",
      "lua",
      // Direct execution commands
      "eval",
      "exec",
      "source",
      "sudo",
      "su",
      "doas",
      // Network tools that can download and execute code
      "curl",
      "wget",
      "invoke-restmethod",
      "invoke-webrequest",
      "irm",
      "iwr"
    ]);
    const commandsWithSubcommands = /* @__PURE__ */ new Set(["git", "npm", "npx", "yarn", "docker", "kubectl", "cargo", "dotnet", "mvn", "gradle"]);
    const commandsWithSubSubCommands = /* @__PURE__ */ new Set(["npm run", "yarn run"]);
    const findNextNonFlagArg = (parts, startIndex) => {
      for (let i = startIndex; i < parts.length; i++) {
        if (!parts[i].startsWith("-")) {
          return i;
        }
      }
      return void 0;
    };
    const subCommandsToSuggest = Array.from(new Set(coalesce(unapprovedSubCommands.map((command) => {
      const parts = command.trim().split(/\s+/);
      const baseCommand = parts[0].toLowerCase();
      if (neverAutoApproveCommands.has(baseCommand)) {
        return void 0;
      }
      if (commandsWithSubcommands.has(baseCommand)) {
        const subCommandIndex = findNextNonFlagArg(parts, 1);
        if (subCommandIndex !== void 0) {
          const baseSubCommand = `${parts[0]} ${parts[subCommandIndex]}`.toLowerCase();
          if (commandsWithSubSubCommands.has(baseSubCommand)) {
            const subSubCommandIndex = findNextNonFlagArg(parts, subCommandIndex + 1);
            if (subSubCommandIndex !== void 0) {
              return parts.slice(0, subSubCommandIndex + 1).join(" ");
            }
            return void 0;
          } else {
            return parts.slice(0, subCommandIndex + 1).join(" ");
          }
        }
        return void 0;
      } else {
        return parts[0];
      }
    }))));
    if (subCommandsToSuggest.length > 0) {
      let subCommandLabel;
      if (subCommandsToSuggest.length === 1) {
        subCommandLabel = `\`${subCommandsToSuggest[0]} \u2026\``;
      } else {
        subCommandLabel = `Commands ${subCommandsToSuggest.map((e) => `\`${e} \u2026\``).join(", ")}`;
      }
      if (!options?.skipSessionScoped) {
        actions.push({
          label: `Allow ${subCommandLabel} in this Session`,
          data: {
            type: "newRule",
            rule: subCommandsToSuggest.map((key) => ({
              key,
              value: true,
              scope: "session"
            }))
          }
        });
      }
      actions.push({
        label: `Allow ${subCommandLabel} in this Workspace`,
        data: {
          type: "newRule",
          rule: subCommandsToSuggest.map((key) => ({
            key,
            value: true,
            scope: "workspace"
          }))
        }
      });
      actions.push({
        label: `Always Allow ${subCommandLabel}`,
        data: {
          type: "newRule",
          rule: subCommandsToSuggest.map((key) => ({
            key,
            value: true,
            scope: "user"
          }))
        }
      });
    }
    if (actions.length > 0) {
      actions.push(new Separator());
    }
    const firstSubcommandFirstWord = unapprovedSubCommands.length > 0 ? unapprovedSubCommands[0].split(" ")[0] : "";
    if (firstSubcommandFirstWord !== commandLine && !commandsWithSubcommands.has(commandLine) && !commandsWithSubSubCommands.has(commandLine)) {
      if (!options?.skipSessionScoped) {
        actions.push({
          label: localize("autoApprove.exactCommand1", "Allow Exact Command Line in this Session"),
          data: {
            type: "newRule",
            rule: {
              key: `/^${escapeRegExpCharacters(commandLine)}$/`,
              value: {
                approve: true,
                matchCommandLine: true
              },
              scope: "session"
            }
          }
        });
      }
      actions.push({
        label: localize("autoApprove.exactCommand2", "Allow Exact Command Line in this Workspace"),
        data: {
          type: "newRule",
          rule: {
            key: `/^${escapeRegExpCharacters(commandLine)}$/`,
            value: {
              approve: true,
              matchCommandLine: true
            },
            scope: "workspace"
          }
        }
      });
      actions.push({
        label: localize("autoApprove.exactCommand", "Always Allow Exact Command Line"),
        data: {
          type: "newRule",
          rule: {
            key: `/^${escapeRegExpCharacters(commandLine)}$/`,
            value: {
              approve: true,
              matchCommandLine: true
            },
            scope: "user"
          }
        }
      });
    }
  }
  if (actions.length > 0) {
    actions.push(new Separator());
  }
  if (!options?.skipSessionScoped) {
    actions.push({
      label: localize("allowSession", "Allow All Commands in this Session"),
      tooltip: localize("allowSessionTooltip", "Allow this tool to run in this session without confirmation."),
      data: {
        type: "sessionApproval"
      }
    });
    actions.push(new Separator());
  }
  actions.push({
    label: localize("autoApprove.configure", "Configure Auto Approve..."),
    data: {
      type: "configure"
    }
  });
  return actions;
}
function dedupeRules(rules) {
  return rules.filter((result, index, array) => {
    if (!isAutoApproveRule(result.rule)) {
      return false;
    }
    const sourceText = result.rule.sourceText;
    return array.findIndex((r) => isAutoApproveRule(r.rule) && r.rule.sourceText === sourceText) === index;
  });
}
function extractCdPrefix(commandLine, shell, os) {
  const isPwsh = isPowerShell(shell, os);
  const cdPrefixMatch = commandLine.match(
    isPwsh ? /^(?:cd(?: \/d)?|Set-Location(?: -Path)?) (?<dir>[^\s]+) ?(?:&&|;)\s+(?<suffix>.+)$/i : /^cd (?<dir>[^\s]+) &&\s+(?<suffix>.+)$/
  );
  const cdDir = cdPrefixMatch?.groups?.dir;
  const cdSuffix = cdPrefixMatch?.groups?.suffix;
  if (cdDir && cdSuffix) {
    let cdDirPath = cdDir;
    if (cdDirPath.startsWith('"') && cdDirPath.endsWith('"')) {
      cdDirPath = cdDirPath.slice(1, -1);
    }
    return { directory: cdDirPath, command: cdSuffix };
  }
  return void 0;
}
export {
  TRUNCATION_MESSAGE,
  buildCommandDisplayText,
  dedupeRules,
  extractCdPrefix,
  generateAutoApproveActions,
  isBash,
  isFish,
  isMultilineCommand,
  isPowerShell,
  isWindowsPowerShell,
  isZsh,
  normalizeCommandForExecution,
  normalizeTerminalCommandForDisplay,
  truncateOutputKeepingTail
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGJyb3dzZXJcXHJ1bkluVGVybWluYWxIZWxwZXJzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBwb3NpeCBhcyBwYXRoUG9zaXgsIHdpbjMyIGFzIHBhdGhXaW4zMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHR5cGUgeyBUZXJtaW5hbE5ld0F1dG9BcHByb3ZlQnV0dG9uRGF0YSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdWJQYXJ0LmpzJztcbmltcG9ydCB0eXBlIHsgVG9vbENvbmZpcm1hdGlvbkFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ29tbWFuZEFwcHJvdmFsUmVzdWx0V2l0aFJlYXNvbiB9IGZyb20gJy4vdG9vbHMvY29tbWFuZExpbmVBbmFseXplci9hdXRvQXBwcm92ZS9jb21tYW5kTGluZUF1dG9BcHByb3Zlci5qcyc7XG5pbXBvcnQgeyBpc0F1dG9BcHByb3ZlUnVsZSB9IGZyb20gJy4vdG9vbHMvY29tbWFuZExpbmVBbmFseXplci9jb21tYW5kTGluZUFuYWx5emVyLmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGlzUG93ZXJTaGVsbChlbnZTaGVsbDogc3RyaW5nLCBvczogT3BlcmF0aW5nU3lzdGVtKTogYm9vbGVhbiB7XG5cdGlmIChvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRyZXR1cm4gL14oPzpwb3dlcnNoZWxsfHB3c2gpKD86LXByZXZpZXcpPyQvaS50ZXN0KHBhdGhXaW4zMi5iYXNlbmFtZShlbnZTaGVsbCkucmVwbGFjZSgvXFwuZXhlJC9pLCAnJykpO1xuXG5cdH1cblx0cmV0dXJuIC9eKD86cG93ZXJzaGVsbHxwd3NoKSg/Oi1wcmV2aWV3KT8kLy50ZXN0KHBhdGhQb3NpeC5iYXNlbmFtZShlbnZTaGVsbCkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNXaW5kb3dzUG93ZXJTaGVsbChlbnZTaGVsbDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBlbnZTaGVsbC5lbmRzV2l0aCgnU3lzdGVtMzJcXFxcV2luZG93c1Bvd2VyU2hlbGxcXFxcdjEuMFxcXFxwb3dlcnNoZWxsLmV4ZScpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNac2goZW52U2hlbGw6IHN0cmluZywgb3M6IE9wZXJhdGluZ1N5c3RlbSk6IGJvb2xlYW4ge1xuXHRpZiAob3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSB7XG5cdFx0cmV0dXJuIC9eenNoKD86XFwuZXhlKT8kL2kudGVzdChwYXRoV2luMzIuYmFzZW5hbWUoZW52U2hlbGwpKTtcblx0fVxuXHRyZXR1cm4gL156c2gkLy50ZXN0KHBhdGhQb3NpeC5iYXNlbmFtZShlbnZTaGVsbCkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNCYXNoKGVudlNoZWxsOiBzdHJpbmcsIG9zOiBPcGVyYXRpbmdTeXN0ZW0pOiBib29sZWFuIHtcblx0aWYgKG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdHJldHVybiAvXmJhc2goPzpcXC5leGUpPyQvaS50ZXN0KHBhdGhXaW4zMi5iYXNlbmFtZShlbnZTaGVsbCkpO1xuXHR9XG5cdHJldHVybiAvXmJhc2gkLy50ZXN0KHBhdGhQb3NpeC5iYXNlbmFtZShlbnZTaGVsbCkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNGaXNoKGVudlNoZWxsOiBzdHJpbmcsIG9zOiBPcGVyYXRpbmdTeXN0ZW0pOiBib29sZWFuIHtcblx0aWYgKG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdHJldHVybiAvXmZpc2goPzpcXC5leGUpPyQvaS50ZXN0KHBhdGhXaW4zMi5iYXNlbmFtZShlbnZTaGVsbCkpO1xuXHR9XG5cdHJldHVybiAvXmZpc2gkLy50ZXN0KHBhdGhQb3NpeC5iYXNlbmFtZShlbnZTaGVsbCkpO1xufVxuXG5leHBvcnQgY29uc3QgVFJVTkNBVElPTl9NRVNTQUdFID0gJ1xcblxcblsuLi4gUFJFVklPVVMgT1VUUFVUIFRSVU5DQVRFRCAuLi5dXFxuXFxuJztcblxuZXhwb3J0IGZ1bmN0aW9uIHRydW5jYXRlT3V0cHV0S2VlcGluZ1RhaWwob3V0cHV0OiBzdHJpbmcsIG1heExlbmd0aDogbnVtYmVyKTogc3RyaW5nIHtcblx0aWYgKG91dHB1dC5sZW5ndGggPD0gbWF4TGVuZ3RoKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXHRjb25zdCB0cnVuY2F0aW9uTWVzc2FnZUxlbmd0aCA9IFRSVU5DQVRJT05fTUVTU0FHRS5sZW5ndGg7XG5cdGlmICh0cnVuY2F0aW9uTWVzc2FnZUxlbmd0aCA+PSBtYXhMZW5ndGgpIHtcblx0XHRyZXR1cm4gVFJVTkNBVElPTl9NRVNTQUdFLnNsaWNlKFRSVU5DQVRJT05fTUVTU0FHRS5sZW5ndGggLSBtYXhMZW5ndGgpO1xuXHR9XG5cdGNvbnN0IGF2YWlsYWJsZUxlbmd0aCA9IG1heExlbmd0aCAtIHRydW5jYXRpb25NZXNzYWdlTGVuZ3RoO1xuXHRjb25zdCBlbmRQb3J0aW9uID0gb3V0cHV0LnNsaWNlKC1hdmFpbGFibGVMZW5ndGgpO1xuXHRyZXR1cm4gVFJVTkNBVElPTl9NRVNTQUdFICsgZW5kUG9ydGlvbjtcbn1cblxuLyoqXG4gKiBOb3JtYWxpemVzIGNvbW1hbmQgdGV4dCBmb3IgVUkgZGlzcGxheSBieSByZW1vdmluZyB1bm5lY2Vzc2FyeSBxdW90ZSBhbmQgZm9yd2FyZCBzbGFzaFxuICogZXNjYXBpbmcgYXJ0aWZhY3RzIChmb3IgZXhhbXBsZTogXFxcIiBcXCcgXFwvKSBjb21tb25seSBwcm9kdWNlZCBpbiBzdHJlYW1lZCB0b29sLWNhbGwgSlNPTi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVRlcm1pbmFsQ29tbWFuZEZvckRpc3BsYXkoY29tbWFuZExpbmU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBjb21tYW5kTGluZS5yZXBsYWNlKC9cXFxcKFtcIidcXC9dKS9nLCAnJDEnKTtcbn1cblxuLyoqXG4gKiBCdWlsZHMgYSBzaW5nbGUtbGluZSBkaXNwbGF5IHN0cmluZyBmb3IgYSB0ZXJtaW5hbCBjb21tYW5kLCBzdWl0YWJsZSBmb3IgVUkgbWVzc2FnZXMuXG4gKiBOb3JtYWxpemVzIGVzY2FwZSBhcnRpZmFjdHMsIGNvbGxhcHNlcyBuZXdsaW5lcyB0byBzcGFjZXMsIGFuZCB0cnVuY2F0ZXMgdG8gODAgY2hhcmFjdGVycy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkQ29tbWFuZERpc3BsYXlUZXh0KGNvbW1hbmQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVUZXJtaW5hbENvbW1hbmRGb3JEaXNwbGF5KGNvbW1hbmQpLnJlcGxhY2UoL1xcclxcbnxcXHJ8XFxuL2csICcgJyk7XG5cdHJldHVybiBub3JtYWxpemVkLmxlbmd0aCA+IDgwID8gbm9ybWFsaXplZC5zdWJzdHJpbmcoMCwgNzcpICsgJy4uLicgOiBub3JtYWxpemVkO1xufVxuXG4vKipcbiAqIE5vcm1hbGl6ZXMgYSB0ZXJtaW5hbCBjb21tYW5kIGZvciBleGVjdXRpb24gYnkgY29sbGFwc2luZyBuZXdsaW5lcyB0byBzcGFjZXMuXG4gKiBUaGlzIHByZXZlbnRzIG11bHRpLWxpbmUgaW5wdXQgZnJvbSBiZWluZyBzZW50IGFzIG11bHRpcGxlIGNvbW1hbmRzIHZpYSBzZW5kVGV4dC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUNvbW1hbmRGb3JFeGVjdXRpb24oY29tbWFuZDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGNvbW1hbmQucmVwbGFjZSgvXFxyXFxufFxccnxcXG4vZywgJyAnKS50cmltKCk7XG59XG5cbi8qKlxuICogV2hldGhlciBhIGNvbW1hbmQgc3BhbnMgbXVsdGlwbGUgbGluZXMgKGhlcmVkb2MsIG11bHRpLXN0YXRlbWVudCBibG9jaywgZXRjLikuXG4gKiBNdWx0aS1saW5lIGNvbW1hbmRzIG11c3QgYmUgc2VudCB2ZXJiYXRpbSB0aHJvdWdoIGJyYWNrZXRlZCBwYXN0ZSBtb2RlIHNvIHRoZVxuICogc2hlbGwgdHJlYXRzIHRoZW0gYXMgYSBzaW5nbGUgcGFzdGUgaW5zdGVhZCBvZiBleGVjdXRpbmcgZWFjaCBsaW5lIGFzIGl0XG4gKiBhcnJpdmVzLlxuICpcbiAqIEJhcmUgbGluZSBjb250aW51YXRpb25zIChgXFxgIGltbWVkaWF0ZWx5IGJlZm9yZSBhIG5ld2xpbmUpIGFyZSAqKm5vdCoqXG4gKiBjb25zaWRlcmVkIG11bHRpLWxpbmUgYmVjYXVzZSB0aGUgc2hlbGwgam9pbnMgdGhlbSBpbnRvIGEgc2luZ2xlIGxvZ2ljYWxcbiAqIGxpbmUuIE9ubHkgbmV3bGluZXMgdGhhdCBhcmUgKm5vdCogcHJlY2VkZWQgYnkgYSBiYWNrc2xhc2ggY291bnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc011bHRpbGluZUNvbW1hbmQoY29tbWFuZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdC8vIE5vcm1hbGl6ZSBhbGwgbGluZS1lbmRpbmcgdmFyaWFudHMgdG8gXFxuLCB0aGVuIGNoZWNrIGZvciBhIG5ld2xpbmVcblx0Ly8gdGhhdCBpcyBub3QgcHJlY2VkZWQgYnkgYSBiYWNrc2xhc2ggKGkuZS4gbm90IGEgbGluZSBjb250aW51YXRpb24pLlxuXHRjb25zdCBub3JtYWxpemVkID0gY29tbWFuZC5yZXBsYWNlKC9cXHJcXG58XFxyL2csICdcXG4nKTtcblx0cmV0dXJuIC8oPzwhXFxcXClcXG4vLnRlc3Qobm9ybWFsaXplZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUF1dG9BcHByb3ZlQWN0aW9ucyhjb21tYW5kTGluZTogc3RyaW5nLCBzdWJDb21tYW5kczogc3RyaW5nW10sIGF1dG9BcHByb3ZlUmVzdWx0OiB7IHN1YkNvbW1hbmRSZXN1bHRzOiBJQ29tbWFuZEFwcHJvdmFsUmVzdWx0V2l0aFJlYXNvbltdOyBjb21tYW5kTGluZVJlc3VsdDogSUNvbW1hbmRBcHByb3ZhbFJlc3VsdFdpdGhSZWFzb24gfSwgb3B0aW9ucz86IHsgc2tpcFNlc3Npb25TY29wZWQ/OiBib29sZWFuIH0pOiBUb29sQ29uZmlybWF0aW9uQWN0aW9uW10ge1xuXHRjb25zdCBhY3Rpb25zOiBUb29sQ29uZmlybWF0aW9uQWN0aW9uW10gPSBbXTtcblxuXHQvLyBXZSBzaG91bGRuJ3Qgb2ZmZXIgY29uZmlndXJpbmcgcnVsZXMgZm9yIGNvbW1hbmRzIHRoYXQgYXJlIGV4cGxpY2l0bHkgZGVuaWVkIHNpbmNlIGl0XG5cdC8vIHdvdWxkbid0IGdldCBhdXRvIGFwcHJvdmVkIHdpdGggYSBuZXcgcnVsZVxuXHRjb25zdCBjYW5DcmVhdGVBdXRvQXBwcm92YWwgPSAoXG5cdFx0YXV0b0FwcHJvdmVSZXN1bHQuc3ViQ29tbWFuZFJlc3VsdHMuZXZlcnkoZSA9PiBlLnJlc3VsdCAhPT0gJ2RlbmllZCcpICYmXG5cdFx0YXV0b0FwcHJvdmVSZXN1bHQuY29tbWFuZExpbmVSZXN1bHQucmVzdWx0ICE9PSAnZGVuaWVkJ1xuXHQpO1xuXHRpZiAoY2FuQ3JlYXRlQXV0b0FwcHJvdmFsKSB7XG5cdFx0Y29uc3QgdW5hcHByb3ZlZFN1YkNvbW1hbmRzID0gc3ViQ29tbWFuZHMuZmlsdGVyKChfLCBpbmRleCkgPT4ge1xuXHRcdFx0cmV0dXJuIGF1dG9BcHByb3ZlUmVzdWx0LnN1YkNvbW1hbmRSZXN1bHRzW2luZGV4XS5yZXN1bHQgIT09ICdhcHByb3ZlZCc7XG5cdFx0fSk7XG5cblx0XHQvLyBTb21lIGNvbW1hbmRzIHNob3VsZCBub3QgYmUgcmVjb21tZW5kZWQgYXMgdGhleSBhcmUgdG9vIHBlcm1pc3NpdmUgZ2VuZXJhbGx5LiBUaGlzIG9ubHlcblx0XHQvLyBhcHBsaWVzIHRvIHN1Yi1jb21tYW5kcywgd2Ugc3RpbGwgd2FudCB0byBvZmZlciBhcHByb3Zpbmcgb2YgdGhlIGV4YWN0IHRoZSBjb21tYW5kIGxpbmVcblx0XHQvLyBob3dldmVyIGFzIGl0J3MgdmVyeSBzcGVjaWZpYy5cblx0XHRjb25zdCBuZXZlckF1dG9BcHByb3ZlQ29tbWFuZHMgPSBuZXcgU2V0KFtcblx0XHRcdC8vIFNoZWxsIGludGVycHJldGVyc1xuXHRcdFx0J2Jhc2gnLCAnc2gnLCAnenNoJywgJ2Zpc2gnLCAna3NoJywgJ2NzaCcsICd0Y3NoJywgJ2Rhc2gnLFxuXHRcdFx0J3B3c2gnLCAncG93ZXJzaGVsbCcsICdwb3dlcnNoZWxsLmV4ZScsICdjbWQnLCAnY21kLmV4ZScsXG5cdFx0XHQvLyBTY3JpcHQgaW50ZXJwcmV0ZXJzXG5cdFx0XHQncHl0aG9uJywgJ3B5dGhvbjMnLCAnbm9kZScsICdydWJ5JywgJ3BlcmwnLCAncGhwJywgJ2x1YScsXG5cdFx0XHQvLyBEaXJlY3QgZXhlY3V0aW9uIGNvbW1hbmRzXG5cdFx0XHQnZXZhbCcsICdleGVjJywgJ3NvdXJjZScsICdzdWRvJywgJ3N1JywgJ2RvYXMnLFxuXHRcdFx0Ly8gTmV0d29yayB0b29scyB0aGF0IGNhbiBkb3dubG9hZCBhbmQgZXhlY3V0ZSBjb2RlXG5cdFx0XHQnY3VybCcsICd3Z2V0JywgJ2ludm9rZS1yZXN0bWV0aG9kJywgJ2ludm9rZS13ZWJyZXF1ZXN0JywgJ2lybScsICdpd3InLFxuXHRcdF0pO1xuXG5cdFx0Ly8gQ29tbWFuZHMgd2hlcmUgd2Ugd2FudCB0byBzdWdnZXN0IHRoZSBzdWItY29tbWFuZCAoZWcuIGBmb28gYmFyYCBpbnN0ZWFkIG9mIGBmb29gKVxuXHRcdGNvbnN0IGNvbW1hbmRzV2l0aFN1YmNvbW1hbmRzID0gbmV3IFNldChbJ2dpdCcsICducG0nLCAnbnB4JywgJ3lhcm4nLCAnZG9ja2VyJywgJ2t1YmVjdGwnLCAnY2FyZ28nLCAnZG90bmV0JywgJ212bicsICdncmFkbGUnXSk7XG5cblx0XHQvLyBDb21tYW5kcyB3aGVyZSB3ZSB3YW50IHRvIHN1Z2dlc3QgdGhlIHN1Yi1jb21tYW5kIG9mIGEgc3ViLWNvbW1hbmQgKGVnLiBgZm9vIGJhciBiYXpgXG5cdFx0Ly8gaW5zdGVhZCBvZiBgZm9vYClcblx0XHRjb25zdCBjb21tYW5kc1dpdGhTdWJTdWJDb21tYW5kcyA9IG5ldyBTZXQoWyducG0gcnVuJywgJ3lhcm4gcnVuJ10pO1xuXG5cdFx0Ly8gSGVscGVyIGZ1bmN0aW9uIHRvIGZpbmQgdGhlIGZpcnN0IG5vbi1mbGFnIGFyZ3VtZW50IGFmdGVyIGEgZ2l2ZW4gaW5kZXhcblx0XHRjb25zdCBmaW5kTmV4dE5vbkZsYWdBcmcgPSAocGFydHM6IHN0cmluZ1tdLCBzdGFydEluZGV4OiBudW1iZXIpOiBudW1iZXIgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0Zm9yIChsZXQgaSA9IHN0YXJ0SW5kZXg7IGkgPCBwYXJ0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAoIXBhcnRzW2ldLnN0YXJ0c1dpdGgoJy0nKSkge1xuXHRcdFx0XHRcdHJldHVybiBpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH07XG5cblx0XHQvLyBGb3IgZWFjaCB1bmFwcHJvdmVkIHN1Yi1jb21tYW5kICh3aXRoaW4gdGhlIG92ZXJhbGwgY29tbWFuZCBsaW5lKSwgZGVjaWRlIHdoZXRoZXIgdG9cblx0XHQvLyBzdWdnZXN0IG5ldyBydWxlcyBmb3IgdGhlIGNvbW1hbmQsIGEgc3ViLWNvbW1hbmQsIGEgc3ViLWNvbW1hbmQgb2YgYSBzdWItY29tbWFuZCBvciB0b1xuXHRcdC8vIG5vdCBzdWdnZXN0IGF0IGFsbC5cblx0XHQvL1xuXHRcdC8vIFRoaXMgaW5jbHVkZXMgc3VwcG9ydCBmb3IgZGV0ZWN0aW5nIGZsYWdzIGJldHdlZW4gdGhlIGNvbW1hbmRzLCBzbyBgbXZuIC1Ec2tpcElUIHRlc3QgYWBcblx0XHQvLyB3b3VsZCBzdWdnZXN0IGBtdm4gLURza2lwSVQgdGVzdGAgYXMgdGhhdCdzIG1vcmUgdXNlZnVsIHRoYW4gb25seSBzdWdnZXN0aW5nIHRoZSBleGFjdFxuXHRcdC8vIGNvbW1hbmQgbGluZS5cblx0XHRjb25zdCBzdWJDb21tYW5kc1RvU3VnZ2VzdCA9IEFycmF5LmZyb20obmV3IFNldChjb2FsZXNjZSh1bmFwcHJvdmVkU3ViQ29tbWFuZHMubWFwKGNvbW1hbmQgPT4ge1xuXHRcdFx0Y29uc3QgcGFydHMgPSBjb21tYW5kLnRyaW0oKS5zcGxpdCgvXFxzKy8pO1xuXHRcdFx0Y29uc3QgYmFzZUNvbW1hbmQgPSBwYXJ0c1swXS50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0XHQvLyBTZWN1cml0eSBjaGVjazogTmV2ZXIgc3VnZ2VzdCBhdXRvLWFwcHJvdmFsIGZvciBkYW5nZXJvdXMgaW50ZXJwcmV0ZXIgY29tbWFuZHNcblx0XHRcdGlmIChuZXZlckF1dG9BcHByb3ZlQ29tbWFuZHMuaGFzKGJhc2VDb21tYW5kKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY29tbWFuZHNXaXRoU3ViY29tbWFuZHMuaGFzKGJhc2VDb21tYW5kKSkge1xuXHRcdFx0XHQvLyBGaW5kIHRoZSBmaXJzdCBub24tZmxhZyBhcmd1bWVudCBhZnRlciB0aGUgY29tbWFuZFxuXHRcdFx0XHRjb25zdCBzdWJDb21tYW5kSW5kZXggPSBmaW5kTmV4dE5vbkZsYWdBcmcocGFydHMsIDEpO1xuXHRcdFx0XHRpZiAoc3ViQ29tbWFuZEluZGV4ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHQvLyBDaGVjayBpZiB0aGlzIGlzIGEgc3ViLXN1Yi1jb21tYW5kIGNhc2Vcblx0XHRcdFx0XHRjb25zdCBiYXNlU3ViQ29tbWFuZCA9IGAke3BhcnRzWzBdfSAke3BhcnRzW3N1YkNvbW1hbmRJbmRleF19YC50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRcdGlmIChjb21tYW5kc1dpdGhTdWJTdWJDb21tYW5kcy5oYXMoYmFzZVN1YkNvbW1hbmQpKSB7XG5cdFx0XHRcdFx0XHQvLyBMb29rIGZvciB0aGUgc2Vjb25kIG5vbi1mbGFnIGFyZ3VtZW50IGFmdGVyIHRoZSBmaXJzdCBzdWJjb21tYW5kXG5cdFx0XHRcdFx0XHRjb25zdCBzdWJTdWJDb21tYW5kSW5kZXggPSBmaW5kTmV4dE5vbkZsYWdBcmcocGFydHMsIHN1YkNvbW1hbmRJbmRleCArIDEpO1xuXHRcdFx0XHRcdFx0aWYgKHN1YlN1YkNvbW1hbmRJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdC8vIEluY2x1ZGUgZXZlcnl0aGluZyBmcm9tIGNvbW1hbmQgdG8gc3ViLXN1Yi1jb21tYW5kIChpbmNsdWRpbmcgZmxhZ3MpXG5cdFx0XHRcdFx0XHRcdHJldHVybiBwYXJ0cy5zbGljZSgwLCBzdWJTdWJDb21tYW5kSW5kZXggKyAxKS5qb2luKCcgJyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBJbmNsdWRlIGV2ZXJ5dGhpbmcgZnJvbSBjb21tYW5kIHRvIHN1YmNvbW1hbmQgKGluY2x1ZGluZyBmbGFncylcblx0XHRcdFx0XHRcdHJldHVybiBwYXJ0cy5zbGljZSgwLCBzdWJDb21tYW5kSW5kZXggKyAxKS5qb2luKCcgJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gcGFydHNbMF07XG5cdFx0XHR9XG5cdFx0fSkpKSk7XG5cblx0XHRpZiAoc3ViQ29tbWFuZHNUb1N1Z2dlc3QubGVuZ3RoID4gMCkge1xuXHRcdFx0bGV0IHN1YkNvbW1hbmRMYWJlbDogc3RyaW5nO1xuXHRcdFx0aWYgKHN1YkNvbW1hbmRzVG9TdWdnZXN0Lmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRzdWJDb21tYW5kTGFiZWwgPSBgXFxgJHtzdWJDb21tYW5kc1RvU3VnZ2VzdFswXX0gXFx1MjAyNlxcYGA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzdWJDb21tYW5kTGFiZWwgPSBgQ29tbWFuZHMgJHtzdWJDb21tYW5kc1RvU3VnZ2VzdC5tYXAoZSA9PiBgXFxgJHtlfSBcXHUyMDI2XFxgYCkuam9pbignLCAnKX1gO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIW9wdGlvbnM/LnNraXBTZXNzaW9uU2NvcGVkKSB7XG5cdFx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IGBBbGxvdyAke3N1YkNvbW1hbmRMYWJlbH0gaW4gdGhpcyBTZXNzaW9uYCxcblx0XHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnbmV3UnVsZScsXG5cdFx0XHRcdFx0XHRydWxlOiBzdWJDb21tYW5kc1RvU3VnZ2VzdC5tYXAoa2V5ID0+ICh7XG5cdFx0XHRcdFx0XHRcdGtleSxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IHRydWUsXG5cdFx0XHRcdFx0XHRcdHNjb3BlOiAnc2Vzc2lvbidcblx0XHRcdFx0XHRcdH0pKVxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIFRlcm1pbmFsTmV3QXV0b0FwcHJvdmVCdXR0b25EYXRhXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGBBbGxvdyAke3N1YkNvbW1hbmRMYWJlbH0gaW4gdGhpcyBXb3Jrc3BhY2VgLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0dHlwZTogJ25ld1J1bGUnLFxuXHRcdFx0XHRcdHJ1bGU6IHN1YkNvbW1hbmRzVG9TdWdnZXN0Lm1hcChrZXkgPT4gKHtcblx0XHRcdFx0XHRcdGtleSxcblx0XHRcdFx0XHRcdHZhbHVlOiB0cnVlLFxuXHRcdFx0XHRcdFx0c2NvcGU6ICd3b3Jrc3BhY2UnXG5cdFx0XHRcdFx0fSkpXG5cdFx0XHRcdH0gc2F0aXNmaWVzIFRlcm1pbmFsTmV3QXV0b0FwcHJvdmVCdXR0b25EYXRhXG5cdFx0XHR9KTtcblx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBgQWx3YXlzIEFsbG93ICR7c3ViQ29tbWFuZExhYmVsfWAsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHR0eXBlOiAnbmV3UnVsZScsXG5cdFx0XHRcdFx0cnVsZTogc3ViQ29tbWFuZHNUb1N1Z2dlc3QubWFwKGtleSA9PiAoe1xuXHRcdFx0XHRcdFx0a2V5LFxuXHRcdFx0XHRcdFx0dmFsdWU6IHRydWUsXG5cdFx0XHRcdFx0XHRzY29wZTogJ3VzZXInXG5cdFx0XHRcdFx0fSkpXG5cdFx0XHRcdH0gc2F0aXNmaWVzIFRlcm1pbmFsTmV3QXV0b0FwcHJvdmVCdXR0b25EYXRhXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoYWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHR9XG5cblx0XHQvLyBBbGxvdyBleGFjdCBjb21tYW5kIGxpbmUsIGRvbid0IGRvIHRoaXMgaWYgaXQncyBqdXN0IHRoZSBmaXJzdCBzdWItY29tbWFuZCdzIGZpcnN0XG5cdFx0Ly8gd29yZCBvciBpZiBpdCdzIGFuIGV4YWN0IG1hdGNoIGZvciBzcGVjaWFsIHN1Yi1jb21tYW5kc1xuXHRcdGNvbnN0IGZpcnN0U3ViY29tbWFuZEZpcnN0V29yZCA9IHVuYXBwcm92ZWRTdWJDb21tYW5kcy5sZW5ndGggPiAwID8gdW5hcHByb3ZlZFN1YkNvbW1hbmRzWzBdLnNwbGl0KCcgJylbMF0gOiAnJztcblx0XHRpZiAoXG5cdFx0XHRmaXJzdFN1YmNvbW1hbmRGaXJzdFdvcmQgIT09IGNvbW1hbmRMaW5lICYmXG5cdFx0XHQhY29tbWFuZHNXaXRoU3ViY29tbWFuZHMuaGFzKGNvbW1hbmRMaW5lKSAmJlxuXHRcdFx0IWNvbW1hbmRzV2l0aFN1YlN1YkNvbW1hbmRzLmhhcyhjb21tYW5kTGluZSlcblx0XHQpIHtcblx0XHRcdGlmICghb3B0aW9ucz8uc2tpcFNlc3Npb25TY29wZWQpIHtcblx0XHRcdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2F1dG9BcHByb3ZlLmV4YWN0Q29tbWFuZDEnLCAnQWxsb3cgRXhhY3QgQ29tbWFuZCBMaW5lIGluIHRoaXMgU2Vzc2lvbicpLFxuXHRcdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICduZXdSdWxlJyxcblx0XHRcdFx0XHRcdHJ1bGU6IHtcblx0XHRcdFx0XHRcdFx0a2V5OiBgL14ke2VzY2FwZVJlZ0V4cENoYXJhY3RlcnMoY29tbWFuZExpbmUpfSQvYCxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRcdFx0XHRhcHByb3ZlOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdG1hdGNoQ29tbWFuZExpbmU6IHRydWVcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0c2NvcGU6ICdzZXNzaW9uJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIFRlcm1pbmFsTmV3QXV0b0FwcHJvdmVCdXR0b25EYXRhXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhdXRvQXBwcm92ZS5leGFjdENvbW1hbmQyJywgJ0FsbG93IEV4YWN0IENvbW1hbmQgTGluZSBpbiB0aGlzIFdvcmtzcGFjZScpLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0dHlwZTogJ25ld1J1bGUnLFxuXHRcdFx0XHRcdHJ1bGU6IHtcblx0XHRcdFx0XHRcdGtleTogYC9eJHtlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKGNvbW1hbmRMaW5lKX0kL2AsXG5cdFx0XHRcdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRcdFx0XHRhcHByb3ZlOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRtYXRjaENvbW1hbmRMaW5lOiB0cnVlXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0c2NvcGU6ICd3b3Jrc3BhY2UnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IHNhdGlzZmllcyBUZXJtaW5hbE5ld0F1dG9BcHByb3ZlQnV0dG9uRGF0YVxuXHRcdFx0fSk7XG5cdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2F1dG9BcHByb3ZlLmV4YWN0Q29tbWFuZCcsICdBbHdheXMgQWxsb3cgRXhhY3QgQ29tbWFuZCBMaW5lJyksXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHR0eXBlOiAnbmV3UnVsZScsXG5cdFx0XHRcdFx0cnVsZToge1xuXHRcdFx0XHRcdFx0a2V5OiBgL14ke2VzY2FwZVJlZ0V4cENoYXJhY3RlcnMoY29tbWFuZExpbmUpfSQvYCxcblx0XHRcdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0XHRcdGFwcHJvdmU6IHRydWUsXG5cdFx0XHRcdFx0XHRcdG1hdGNoQ29tbWFuZExpbmU6IHRydWVcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRzY29wZTogJ3VzZXInXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IHNhdGlzZmllcyBUZXJtaW5hbE5ld0F1dG9BcHByb3ZlQnV0dG9uRGF0YVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0aWYgKGFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHR9XG5cblxuXHQvLyBBbGxvdyBhbGwgY29tbWFuZHMgZm9yIHRoaXMgc2Vzc2lvblxuXHRpZiAoIW9wdGlvbnM/LnNraXBTZXNzaW9uU2NvcGVkKSB7XG5cdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWxsb3dTZXNzaW9uJywgJ0FsbG93IEFsbCBDb21tYW5kcyBpbiB0aGlzIFNlc3Npb24nKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdhbGxvd1Nlc3Npb25Ub29sdGlwJywgJ0FsbG93IHRoaXMgdG9vbCB0byBydW4gaW4gdGhpcyBzZXNzaW9uIHdpdGhvdXQgY29uZmlybWF0aW9uLicpLFxuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHR0eXBlOiAnc2Vzc2lvbkFwcHJvdmFsJ1xuXHRcdFx0fSBzYXRpc2ZpZXMgVGVybWluYWxOZXdBdXRvQXBwcm92ZUJ1dHRvbkRhdGFcblx0XHR9KTtcblxuXHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHR9XG5cblx0Ly8gQWx3YXlzIHNob3cgY29uZmlndXJlIG9wdGlvblxuXHRhY3Rpb25zLnB1c2goe1xuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuY29uZmlndXJlJywgJ0NvbmZpZ3VyZSBBdXRvIEFwcHJvdmUuLi4nKSxcblx0XHRkYXRhOiB7XG5cdFx0XHR0eXBlOiAnY29uZmlndXJlJ1xuXHRcdH0gc2F0aXNmaWVzIFRlcm1pbmFsTmV3QXV0b0FwcHJvdmVCdXR0b25EYXRhXG5cdH0pO1xuXG5cdHJldHVybiBhY3Rpb25zO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVkdXBlUnVsZXMocnVsZXM6IElDb21tYW5kQXBwcm92YWxSZXN1bHRXaXRoUmVhc29uW10pOiBJQ29tbWFuZEFwcHJvdmFsUmVzdWx0V2l0aFJlYXNvbltdIHtcblx0cmV0dXJuIHJ1bGVzLmZpbHRlcigocmVzdWx0LCBpbmRleCwgYXJyYXkpID0+IHtcblx0XHRpZiAoIWlzQXV0b0FwcHJvdmVSdWxlKHJlc3VsdC5ydWxlKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBzb3VyY2VUZXh0ID0gcmVzdWx0LnJ1bGUuc291cmNlVGV4dDtcblx0XHRyZXR1cm4gYXJyYXkuZmluZEluZGV4KHIgPT4gaXNBdXRvQXBwcm92ZVJ1bGUoci5ydWxlKSAmJiByLnJ1bGUuc291cmNlVGV4dCA9PT0gc291cmNlVGV4dCkgPT09IGluZGV4O1xuXHR9KTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXh0cmFjdGVkQ2RQcmVmaXgge1xuXHQvKiogVGhlIGRpcmVjdG9yeSBwYXRoIHRoYXQgd2FzIGV4dHJhY3RlZCBmcm9tIHRoZSBjZCBjb21tYW5kICovXG5cdGRpcmVjdG9yeTogc3RyaW5nO1xuXHQvKiogVGhlIGNvbW1hbmQgdG8gcnVuIGFmdGVyIHRoZSBjZCAqL1xuXHRjb21tYW5kOiBzdHJpbmc7XG59XG5cbi8qKlxuICogRXh0cmFjdHMgYSBjZCBwcmVmaXggZnJvbSBhIGNvbW1hbmQgbGluZSwgcmV0dXJuaW5nIHRoZSBkaXJlY3RvcnkgYW5kIHJlbWFpbmluZyBjb21tYW5kLlxuICogRG9lcyBub3QgY2hlY2sgaWYgdGhlIGRpcmVjdG9yeSBtYXRjaGVzIHRoZSBjdXJyZW50IGN3ZCAtIGp1c3QgZXh0cmFjdHMgdGhlIHBhdHRlcm4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0Q2RQcmVmaXgoY29tbWFuZExpbmU6IHN0cmluZywgc2hlbGw6IHN0cmluZywgb3M6IE9wZXJhdGluZ1N5c3RlbSk6IElFeHRyYWN0ZWRDZFByZWZpeCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGlzUHdzaCA9IGlzUG93ZXJTaGVsbChzaGVsbCwgb3MpO1xuXG5cdGNvbnN0IGNkUHJlZml4TWF0Y2ggPSBjb21tYW5kTGluZS5tYXRjaChcblx0XHRpc1B3c2hcblx0XHRcdD8gL14oPzpjZCg/OiBcXC9kKT98U2V0LUxvY2F0aW9uKD86IC1QYXRoKT8pICg/PGRpcj5bXlxcc10rKSA/KD86JiZ8OylcXHMrKD88c3VmZml4Pi4rKSQvaVxuXHRcdFx0OiAvXmNkICg/PGRpcj5bXlxcc10rKSAmJlxccysoPzxzdWZmaXg+LispJC9cblx0KTtcblx0Y29uc3QgY2REaXIgPSBjZFByZWZpeE1hdGNoPy5ncm91cHM/LmRpcjtcblx0Y29uc3QgY2RTdWZmaXggPSBjZFByZWZpeE1hdGNoPy5ncm91cHM/LnN1ZmZpeDtcblx0aWYgKGNkRGlyICYmIGNkU3VmZml4KSB7XG5cdFx0Ly8gUmVtb3ZlIGFueSBzdXJyb3VuZGluZyBxdW90ZXNcblx0XHRsZXQgY2REaXJQYXRoID0gY2REaXI7XG5cdFx0aWYgKGNkRGlyUGF0aC5zdGFydHNXaXRoKCdcIicpICYmIGNkRGlyUGF0aC5lbmRzV2l0aCgnXCInKSkge1xuXHRcdFx0Y2REaXJQYXRoID0gY2REaXJQYXRoLnNsaWNlKDEsIC0xKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgZGlyZWN0b3J5OiBjZERpclBhdGgsIGNvbW1hbmQ6IGNkU3VmZml4IH07XG5cdH1cblx0cmV0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
