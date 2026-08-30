import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { TerminalQuickFixType } from "./quickFix.js";
const GitCommandLineRegex = /git/;
const GitFastForwardPullOutputRegex = /and can be fast-forwarded/;
const GitPushCommandLineRegex = /git\s+push/;
const GitTwoDashesRegex = /error: did you mean `--(.+)` \(with two dashes\)\?/;
const GitSimilarOutputRegex = /(?:(most similar commands? (is|are)))/;
const FreePortOutputRegex = /(?:address already in use (?:0\.0\.0\.0|127\.0\.0\.1|localhost|::):|Unable to bind [^ ]*:|can't listen on port |listen EADDRINUSE [^ ]*:)(?<portNumber>\d{4,5})/;
const GitPushOutputRegex = /git push --set-upstream origin (?<branchName>[^\s]+)/;
const GitCreatePrOutputRegex = /remote:\s*(?<link>https:\/\/github\.com\/.+\/.+\/pull\/new\/.+)/;
const PwshGeneralErrorOutputRegex = /Suggestion \[General\]:/;
const PwshUnixCommandNotFoundErrorOutputRegex = /Suggestion \[cmd-not-found\]:/;
var QuickFixSource = /* @__PURE__ */ ((QuickFixSource2) => {
  QuickFixSource2["Builtin"] = "builtin";
  return QuickFixSource2;
})(QuickFixSource || {});
function gitSimilar() {
  return {
    id: "Git Similar",
    type: "internal",
    commandLineMatcher: GitCommandLineRegex,
    outputMatcher: {
      lineMatcher: GitSimilarOutputRegex,
      anchor: "bottom",
      offset: 0,
      length: 10
    },
    commandExitResult: "error",
    getQuickFixes: (matchResult) => {
      const regexMatch = matchResult.outputMatch?.regexMatch[0];
      if (!regexMatch || !matchResult.outputMatch) {
        return;
      }
      const actions = [];
      const startIndex = matchResult.outputMatch.outputLines.findIndex((l) => l.includes(regexMatch)) + 1;
      const results = matchResult.outputMatch.outputLines.map((r) => r.trim());
      for (let i = startIndex; i < results.length; i++) {
        const fixedCommand = results[i];
        if (fixedCommand) {
          actions.push({
            id: "Git Similar",
            type: TerminalQuickFixType.TerminalCommand,
            terminalCommand: matchResult.commandLine.replace(/git\s+[^\s]+/, () => `git ${fixedCommand}`),
            shouldExecute: true,
            source: "builtin" /* Builtin */
          });
        }
      }
      return actions;
    }
  };
}
function gitFastForwardPull() {
  return {
    id: "Git Fast Forward Pull",
    type: "internal",
    commandLineMatcher: GitCommandLineRegex,
    outputMatcher: {
      lineMatcher: GitFastForwardPullOutputRegex,
      anchor: "bottom",
      offset: 0,
      length: 8
    },
    commandExitResult: "success",
    getQuickFixes: (matchResult) => {
      return {
        type: TerminalQuickFixType.TerminalCommand,
        id: "Git Fast Forward Pull",
        terminalCommand: `git pull`,
        shouldExecute: true,
        source: "builtin" /* Builtin */
      };
    }
  };
}
function gitTwoDashes() {
  return {
    id: "Git Two Dashes",
    type: "internal",
    commandLineMatcher: GitCommandLineRegex,
    outputMatcher: {
      lineMatcher: GitTwoDashesRegex,
      anchor: "bottom",
      offset: 0,
      length: 2
    },
    commandExitResult: "error",
    getQuickFixes: (matchResult) => {
      const problemArg = matchResult?.outputMatch?.regexMatch?.[1];
      if (!problemArg) {
        return;
      }
      return {
        type: TerminalQuickFixType.TerminalCommand,
        id: "Git Two Dashes",
        terminalCommand: matchResult.commandLine.replace(` -${problemArg}`, () => ` --${problemArg}`),
        shouldExecute: true,
        source: "builtin" /* Builtin */
      };
    }
  };
}
function freePort(runCallback) {
  return {
    id: "Free Port",
    type: "internal",
    commandLineMatcher: /.+/,
    outputMatcher: {
      lineMatcher: FreePortOutputRegex,
      anchor: "bottom",
      offset: 0,
      length: 30
    },
    commandExitResult: "error",
    getQuickFixes: (matchResult) => {
      const port = matchResult?.outputMatch?.regexMatch?.groups?.portNumber;
      if (!port) {
        return;
      }
      const label = localize("terminal.freePort", "Free port {0}", port);
      return {
        type: TerminalQuickFixType.Port,
        class: void 0,
        tooltip: label,
        id: "Free Port",
        label,
        enabled: true,
        source: "builtin" /* Builtin */,
        run: () => runCallback(port, matchResult.commandLine)
      };
    }
  };
}
function gitPushSetUpstream() {
  return {
    id: "Git Push Set Upstream",
    type: "internal",
    commandLineMatcher: GitPushCommandLineRegex,
    /**
    			Example output on Windows:
    			8: PS C:\Users\merogge\repos\xterm.js> git push
    			7: fatal: The current branch sdjfskdjfdslkjf has no upstream branch.
    			6: To push the current branch and set the remote as upstream, use
    			5:
    			4:	git push --set-upstream origin sdjfskdjfdslkjf
    			3:
    			2: To have this happen automatically for branches without a tracking
    			1: upstream, see 'push.autoSetupRemote' in 'git help config'.
    			0:
    
    			Example output on macOS:
    			5: meganrogge@Megans-MacBook-Pro xterm.js % git push
    			4: fatal: The current branch merogge/asjdkfsjdkfsdjf has no upstream branch.
    			3: To push the current branch and set the remote as upstream, use
    			2:
    			1:	git push --set-upstream origin merogge/asjdkfsjdkfsdjf
    			0:
    		 */
    outputMatcher: {
      lineMatcher: GitPushOutputRegex,
      anchor: "bottom",
      offset: 0,
      length: 8
    },
    commandExitResult: "error",
    getQuickFixes: (matchResult) => {
      const matches = matchResult.outputMatch;
      const commandToRun = "git push --set-upstream origin ${group:branchName}";
      if (!matches) {
        return;
      }
      const groups = matches.regexMatch.groups;
      if (!groups) {
        return;
      }
      const actions = [];
      let fixedCommand = commandToRun;
      for (const [key, value] of Object.entries(groups)) {
        const varToResolve = `\${group:${key}}`;
        if (!commandToRun.includes(varToResolve)) {
          return [];
        }
        fixedCommand = fixedCommand.replaceAll(varToResolve, () => value);
      }
      if (fixedCommand) {
        actions.push({
          type: TerminalQuickFixType.TerminalCommand,
          id: "Git Push Set Upstream",
          terminalCommand: fixedCommand,
          shouldExecute: true,
          source: "builtin" /* Builtin */
        });
        return actions;
      }
      return;
    }
  };
}
function gitCreatePr() {
  return {
    id: "Git Create Pr",
    type: "internal",
    commandLineMatcher: GitPushCommandLineRegex,
    // Example output:
    // ...
    // 10: remote:
    // 9:  remote: Create a pull request for 'my_branch' on GitHub by visiting:
    // 8:  remote:      https://github.com/microsoft/vscode/pull/new/my_branch
    // 7:  remote:
    // 6:  remote: GitHub found x vulnerabilities on microsoft/vscode's default branch (...). To find out more, visit:
    // 5:  remote:      https://github.com/microsoft/vscode/security/dependabot
    // 4:  remote:
    // 3:  To https://github.com/microsoft/vscode
    // 2:  * [new branch]              my_branch -> my_branch
    // 1:  Branch 'my_branch' set up to track remote branch 'my_branch' from 'origin'.
    // 0:
    outputMatcher: {
      lineMatcher: GitCreatePrOutputRegex,
      anchor: "bottom",
      offset: 4,
      // ~6 should only be needed here for security alerts, but the git provider can customize
      // the text, so use 12 to be safe.
      length: 12
    },
    commandExitResult: "success",
    getQuickFixes: (matchResult) => {
      const link = matchResult?.outputMatch?.regexMatch?.groups?.link?.trimEnd();
      if (!link) {
        return;
      }
      const label = localize("terminal.createPR", "Create PR {0}", link);
      return {
        id: "Git Create Pr",
        label,
        enabled: true,
        type: TerminalQuickFixType.Opener,
        uri: URI.parse(link),
        source: "builtin" /* Builtin */
      };
    }
  };
}
function pwshGeneralError() {
  return {
    id: "Pwsh General Error",
    type: "internal",
    commandLineMatcher: /.+/,
    outputMatcher: {
      lineMatcher: PwshGeneralErrorOutputRegex,
      anchor: "bottom",
      offset: 0,
      length: 10
    },
    commandExitResult: "error",
    getQuickFixes: (matchResult) => {
      const lines = matchResult.outputMatch?.regexMatch.input?.split("\n");
      if (!lines) {
        return;
      }
      let i = 0;
      let inFeedbackProvider = false;
      for (; i < lines.length; i++) {
        if (lines[i].match(PwshGeneralErrorOutputRegex)) {
          inFeedbackProvider = true;
          break;
        }
      }
      if (!inFeedbackProvider) {
        return;
      }
      const suggestions = lines[i + 1].match(/The most similar commands are: (?<values>.+)./)?.groups?.values?.split(", ");
      if (!suggestions) {
        return;
      }
      const result = [];
      for (const suggestion of suggestions) {
        result.push({
          id: "Pwsh General Error",
          type: TerminalQuickFixType.TerminalCommand,
          terminalCommand: suggestion,
          source: "builtin" /* Builtin */
        });
      }
      return result;
    }
  };
}
function pwshUnixCommandNotFoundError() {
  return {
    id: "Unix Command Not Found",
    type: "internal",
    commandLineMatcher: /.+/,
    outputMatcher: {
      lineMatcher: PwshUnixCommandNotFoundErrorOutputRegex,
      anchor: "bottom",
      offset: 0,
      length: 10
    },
    commandExitResult: "error",
    getQuickFixes: (matchResult) => {
      const lines = matchResult.outputMatch?.regexMatch.input?.split("\n");
      if (!lines) {
        return;
      }
      let i = 0;
      let inFeedbackProvider = false;
      for (; i < lines.length; i++) {
        if (lines[i].match(PwshUnixCommandNotFoundErrorOutputRegex)) {
          inFeedbackProvider = true;
          break;
        }
      }
      if (!inFeedbackProvider) {
        return;
      }
      const result = [];
      let inSuggestions = false;
      for (; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length === 0) {
          break;
        }
        const installCommand = line.match(/You also have .+ installed, you can run '(?<command>.+)' instead./)?.groups?.command;
        if (installCommand) {
          result.push({
            id: "Pwsh Unix Command Not Found Error",
            type: TerminalQuickFixType.TerminalCommand,
            terminalCommand: installCommand,
            source: "builtin" /* Builtin */
          });
          inSuggestions = false;
          continue;
        }
        if (line.match(/Command '.+' not found, but can be installed with:/)) {
          inSuggestions = true;
          continue;
        }
        if (inSuggestions) {
          result.push({
            id: "Pwsh Unix Command Not Found Error",
            type: TerminalQuickFixType.TerminalCommand,
            terminalCommand: line.trim(),
            source: "builtin" /* Builtin */
          });
        }
      }
      return result;
    }
  };
}
export {
  FreePortOutputRegex,
  GitCommandLineRegex,
  GitCreatePrOutputRegex,
  GitFastForwardPullOutputRegex,
  GitPushCommandLineRegex,
  GitPushOutputRegex,
  GitSimilarOutputRegex,
  GitTwoDashesRegex,
  PwshGeneralErrorOutputRegex,
  PwshUnixCommandNotFoundErrorOutputRegex,
  QuickFixSource,
  freePort,
  gitCreatePr,
  gitFastForwardPull,
  gitPushSetUpstream,
  gitSimilar,
  gitTwoDashes,
  pwshGeneralError,
  pwshUnixCommandNotFoundError
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxccXVpY2tGaXhcXGJyb3dzZXJcXHRlcm1pbmFsUXVpY2tGaXhCdWlsdGluQWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxRdWlja0ZpeEludGVybmFsT3B0aW9ucywgSVRlcm1pbmFsQ29tbWFuZE1hdGNoUmVzdWx0LCBJVGVybWluYWxRdWlja0ZpeFRlcm1pbmFsQ29tbWFuZEFjdGlvbiwgVGVybWluYWxRdWlja0ZpeEFjdGlvbkludGVybmFsLCBUZXJtaW5hbFF1aWNrRml4VHlwZSB9IGZyb20gJy4vcXVpY2tGaXguanMnO1xuXG5leHBvcnQgY29uc3QgR2l0Q29tbWFuZExpbmVSZWdleCA9IC9naXQvO1xuZXhwb3J0IGNvbnN0IEdpdEZhc3RGb3J3YXJkUHVsbE91dHB1dFJlZ2V4ID0gL2FuZCBjYW4gYmUgZmFzdC1mb3J3YXJkZWQvO1xuZXhwb3J0IGNvbnN0IEdpdFB1c2hDb21tYW5kTGluZVJlZ2V4ID0gL2dpdFxccytwdXNoLztcbmV4cG9ydCBjb25zdCBHaXRUd29EYXNoZXNSZWdleCA9IC9lcnJvcjogZGlkIHlvdSBtZWFuIGAtLSguKylgIFxcKHdpdGggdHdvIGRhc2hlc1xcKVxcPy87XG5leHBvcnQgY29uc3QgR2l0U2ltaWxhck91dHB1dFJlZ2V4ID0gLyg/Oihtb3N0IHNpbWlsYXIgY29tbWFuZHM/IChpc3xhcmUpKSkvO1xuZXhwb3J0IGNvbnN0IEZyZWVQb3J0T3V0cHV0UmVnZXggPSAvKD86YWRkcmVzcyBhbHJlYWR5IGluIHVzZSAoPzowXFwuMFxcLjBcXC4wfDEyN1xcLjBcXC4wXFwuMXxsb2NhbGhvc3R8OjopOnxVbmFibGUgdG8gYmluZCBbXiBdKjp8Y2FuJ3QgbGlzdGVuIG9uIHBvcnQgfGxpc3RlbiBFQUREUklOVVNFIFteIF0qOikoPzxwb3J0TnVtYmVyPlxcZHs0LDV9KS87XG5leHBvcnQgY29uc3QgR2l0UHVzaE91dHB1dFJlZ2V4ID0gL2dpdCBwdXNoIC0tc2V0LXVwc3RyZWFtIG9yaWdpbiAoPzxicmFuY2hOYW1lPlteXFxzXSspLztcbi8vIFRoZSBwcmV2aW91cyBsaW5lIHN0YXJ0cyB3aXRoIFwiQ3JlYXRlIGEgcHVsbCByZXF1ZXN0IGZvciBcXCcoW15cXHNdKylcXCcgb24gR2l0SHViIGJ5IHZpc2l0aW5nOlxccypcIlxuLy8gaXQncyBzYWZlIHRvIGFzc3VtZSBpdCdzIGEgZ2l0aHViIHB1bGwgcmVxdWVzdCBpZiB0aGUgVVJMIGluY2x1ZGVzIGAvcHVsbC9gXG5leHBvcnQgY29uc3QgR2l0Q3JlYXRlUHJPdXRwdXRSZWdleCA9IC9yZW1vdGU6XFxzKig/PGxpbms+aHR0cHM6XFwvXFwvZ2l0aHViXFwuY29tXFwvLitcXC8uK1xcL3B1bGxcXC9uZXdcXC8uKykvO1xuZXhwb3J0IGNvbnN0IFB3c2hHZW5lcmFsRXJyb3JPdXRwdXRSZWdleCA9IC9TdWdnZXN0aW9uIFxcW0dlbmVyYWxcXF06LztcbmV4cG9ydCBjb25zdCBQd3NoVW5peENvbW1hbmROb3RGb3VuZEVycm9yT3V0cHV0UmVnZXggPSAvU3VnZ2VzdGlvbiBcXFtjbWQtbm90LWZvdW5kXFxdOi87XG5cbmV4cG9ydCBjb25zdCBlbnVtIFF1aWNrRml4U291cmNlIHtcblx0QnVpbHRpbiA9ICdidWlsdGluJ1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2l0U2ltaWxhcigpOiBJVGVybWluYWxRdWlja0ZpeEludGVybmFsT3B0aW9ucyB7XG5cdHJldHVybiB7XG5cdFx0aWQ6ICdHaXQgU2ltaWxhcicsXG5cdFx0dHlwZTogJ2ludGVybmFsJyxcblx0XHRjb21tYW5kTGluZU1hdGNoZXI6IEdpdENvbW1hbmRMaW5lUmVnZXgsXG5cdFx0b3V0cHV0TWF0Y2hlcjoge1xuXHRcdFx0bGluZU1hdGNoZXI6IEdpdFNpbWlsYXJPdXRwdXRSZWdleCxcblx0XHRcdGFuY2hvcjogJ2JvdHRvbScsXG5cdFx0XHRvZmZzZXQ6IDAsXG5cdFx0XHRsZW5ndGg6IDEwXG5cdFx0fSxcblx0XHRjb21tYW5kRXhpdFJlc3VsdDogJ2Vycm9yJyxcblx0XHRnZXRRdWlja0ZpeGVzOiAobWF0Y2hSZXN1bHQ6IElUZXJtaW5hbENvbW1hbmRNYXRjaFJlc3VsdCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVnZXhNYXRjaCA9IG1hdGNoUmVzdWx0Lm91dHB1dE1hdGNoPy5yZWdleE1hdGNoWzBdO1xuXHRcdFx0aWYgKCFyZWdleE1hdGNoIHx8ICFtYXRjaFJlc3VsdC5vdXRwdXRNYXRjaCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhY3Rpb25zOiBUZXJtaW5hbFF1aWNrRml4QWN0aW9uSW50ZXJuYWxbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc3RhcnRJbmRleCA9IG1hdGNoUmVzdWx0Lm91dHB1dE1hdGNoLm91dHB1dExpbmVzLmZpbmRJbmRleChsID0+IGwuaW5jbHVkZXMocmVnZXhNYXRjaCkpICsgMTtcblx0XHRcdGNvbnN0IHJlc3VsdHMgPSBtYXRjaFJlc3VsdC5vdXRwdXRNYXRjaC5vdXRwdXRMaW5lcy5tYXAociA9PiByLnRyaW0oKSk7XG5cdFx0XHRmb3IgKGxldCBpID0gc3RhcnRJbmRleDsgaSA8IHJlc3VsdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgZml4ZWRDb21tYW5kID0gcmVzdWx0c1tpXTtcblx0XHRcdFx0aWYgKGZpeGVkQ29tbWFuZCkge1xuXHRcdFx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRpZDogJ0dpdCBTaW1pbGFyJyxcblx0XHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsUXVpY2tGaXhUeXBlLlRlcm1pbmFsQ29tbWFuZCxcblx0XHRcdFx0XHRcdHRlcm1pbmFsQ29tbWFuZDogbWF0Y2hSZXN1bHQuY29tbWFuZExpbmUucmVwbGFjZSgvZ2l0XFxzK1teXFxzXSsvLCAoKSA9PiBgZ2l0ICR7Zml4ZWRDb21tYW5kfWApLFxuXHRcdFx0XHRcdFx0c2hvdWxkRXhlY3V0ZTogdHJ1ZSxcblx0XHRcdFx0XHRcdHNvdXJjZTogUXVpY2tGaXhTb3VyY2UuQnVpbHRpblxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYWN0aW9ucztcblx0XHR9XG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnaXRGYXN0Rm9yd2FyZFB1bGwoKTogSVRlcm1pbmFsUXVpY2tGaXhJbnRlcm5hbE9wdGlvbnMge1xuXHRyZXR1cm4ge1xuXHRcdGlkOiAnR2l0IEZhc3QgRm9yd2FyZCBQdWxsJyxcblx0XHR0eXBlOiAnaW50ZXJuYWwnLFxuXHRcdGNvbW1hbmRMaW5lTWF0Y2hlcjogR2l0Q29tbWFuZExpbmVSZWdleCxcblx0XHRvdXRwdXRNYXRjaGVyOiB7XG5cdFx0XHRsaW5lTWF0Y2hlcjogR2l0RmFzdEZvcndhcmRQdWxsT3V0cHV0UmVnZXgsXG5cdFx0XHRhbmNob3I6ICdib3R0b20nLFxuXHRcdFx0b2Zmc2V0OiAwLFxuXHRcdFx0bGVuZ3RoOiA4XG5cdFx0fSxcblx0XHRjb21tYW5kRXhpdFJlc3VsdDogJ3N1Y2Nlc3MnLFxuXHRcdGdldFF1aWNrRml4ZXM6IChtYXRjaFJlc3VsdDogSVRlcm1pbmFsQ29tbWFuZE1hdGNoUmVzdWx0KSA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBUZXJtaW5hbFF1aWNrRml4VHlwZS5UZXJtaW5hbENvbW1hbmQsXG5cdFx0XHRcdGlkOiAnR2l0IEZhc3QgRm9yd2FyZCBQdWxsJyxcblx0XHRcdFx0dGVybWluYWxDb21tYW5kOiBgZ2l0IHB1bGxgLFxuXHRcdFx0XHRzaG91bGRFeGVjdXRlOiB0cnVlLFxuXHRcdFx0XHRzb3VyY2U6IFF1aWNrRml4U291cmNlLkJ1aWx0aW5cblx0XHRcdH07XG5cdFx0fVxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2l0VHdvRGFzaGVzKCk6IElUZXJtaW5hbFF1aWNrRml4SW50ZXJuYWxPcHRpb25zIHtcblx0cmV0dXJuIHtcblx0XHRpZDogJ0dpdCBUd28gRGFzaGVzJyxcblx0XHR0eXBlOiAnaW50ZXJuYWwnLFxuXHRcdGNvbW1hbmRMaW5lTWF0Y2hlcjogR2l0Q29tbWFuZExpbmVSZWdleCxcblx0XHRvdXRwdXRNYXRjaGVyOiB7XG5cdFx0XHRsaW5lTWF0Y2hlcjogR2l0VHdvRGFzaGVzUmVnZXgsXG5cdFx0XHRhbmNob3I6ICdib3R0b20nLFxuXHRcdFx0b2Zmc2V0OiAwLFxuXHRcdFx0bGVuZ3RoOiAyXG5cdFx0fSxcblx0XHRjb21tYW5kRXhpdFJlc3VsdDogJ2Vycm9yJyxcblx0XHRnZXRRdWlja0ZpeGVzOiAobWF0Y2hSZXN1bHQ6IElUZXJtaW5hbENvbW1hbmRNYXRjaFJlc3VsdCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvYmxlbUFyZyA9IG1hdGNoUmVzdWx0Py5vdXRwdXRNYXRjaD8ucmVnZXhNYXRjaD8uWzFdO1xuXHRcdFx0aWYgKCFwcm9ibGVtQXJnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IFRlcm1pbmFsUXVpY2tGaXhUeXBlLlRlcm1pbmFsQ29tbWFuZCxcblx0XHRcdFx0aWQ6ICdHaXQgVHdvIERhc2hlcycsXG5cdFx0XHRcdHRlcm1pbmFsQ29tbWFuZDogbWF0Y2hSZXN1bHQuY29tbWFuZExpbmUucmVwbGFjZShgIC0ke3Byb2JsZW1Bcmd9YCwgKCkgPT4gYCAtLSR7cHJvYmxlbUFyZ31gKSxcblx0XHRcdFx0c2hvdWxkRXhlY3V0ZTogdHJ1ZSxcblx0XHRcdFx0c291cmNlOiBRdWlja0ZpeFNvdXJjZS5CdWlsdGluXG5cdFx0XHR9O1xuXHRcdH1cblx0fTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBmcmVlUG9ydChydW5DYWxsYmFjazogKHBvcnQ6IHN0cmluZywgY29tbWFuZExpbmU6IHN0cmluZykgPT4gUHJvbWlzZTx2b2lkPik6IElUZXJtaW5hbFF1aWNrRml4SW50ZXJuYWxPcHRpb25zIHtcblx0cmV0dXJuIHtcblx0XHRpZDogJ0ZyZWUgUG9ydCcsXG5cdFx0dHlwZTogJ2ludGVybmFsJyxcblx0XHRjb21tYW5kTGluZU1hdGNoZXI6IC8uKy8sXG5cdFx0b3V0cHV0TWF0Y2hlcjoge1xuXHRcdFx0bGluZU1hdGNoZXI6IEZyZWVQb3J0T3V0cHV0UmVnZXgsXG5cdFx0XHRhbmNob3I6ICdib3R0b20nLFxuXHRcdFx0b2Zmc2V0OiAwLFxuXHRcdFx0bGVuZ3RoOiAzMFxuXHRcdH0sXG5cdFx0Y29tbWFuZEV4aXRSZXN1bHQ6ICdlcnJvcicsXG5cdFx0Z2V0UXVpY2tGaXhlczogKG1hdGNoUmVzdWx0OiBJVGVybWluYWxDb21tYW5kTWF0Y2hSZXN1bHQpID0+IHtcblx0XHRcdGNvbnN0IHBvcnQgPSBtYXRjaFJlc3VsdD8ub3V0cHV0TWF0Y2g/LnJlZ2V4TWF0Y2g/Lmdyb3Vwcz8ucG9ydE51bWJlcjtcblx0XHRcdGlmICghcG9ydCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsYWJlbCA9IGxvY2FsaXplKFwidGVybWluYWwuZnJlZVBvcnRcIiwgXCJGcmVlIHBvcnQgezB9XCIsIHBvcnQpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogVGVybWluYWxRdWlja0ZpeFR5cGUuUG9ydCxcblx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0dG9vbHRpcDogbGFiZWwsXG5cdFx0XHRcdGlkOiAnRnJlZSBQb3J0Jyxcblx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHNvdXJjZTogUXVpY2tGaXhTb3VyY2UuQnVpbHRpbixcblx0XHRcdFx0cnVuOiAoKSA9PiBydW5DYWxsYmFjayhwb3J0LCBtYXRjaFJlc3VsdC5jb21tYW5kTGluZSlcblx0XHRcdH07XG5cdFx0fVxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2l0UHVzaFNldFVwc3RyZWFtKCk6IElUZXJtaW5hbFF1aWNrRml4SW50ZXJuYWxPcHRpb25zIHtcblx0cmV0dXJuIHtcblx0XHRpZDogJ0dpdCBQdXNoIFNldCBVcHN0cmVhbScsXG5cdFx0dHlwZTogJ2ludGVybmFsJyxcblx0XHRjb21tYW5kTGluZU1hdGNoZXI6IEdpdFB1c2hDb21tYW5kTGluZVJlZ2V4LFxuXHRcdC8qKlxuXHRcdFx0RXhhbXBsZSBvdXRwdXQgb24gV2luZG93czpcblx0XHRcdDg6IFBTIEM6XFxVc2Vyc1xcbWVyb2dnZVxccmVwb3NcXHh0ZXJtLmpzPiBnaXQgcHVzaFxuXHRcdFx0NzogZmF0YWw6IFRoZSBjdXJyZW50IGJyYW5jaCBzZGpmc2tkamZkc2xramYgaGFzIG5vIHVwc3RyZWFtIGJyYW5jaC5cblx0XHRcdDY6IFRvIHB1c2ggdGhlIGN1cnJlbnQgYnJhbmNoIGFuZCBzZXQgdGhlIHJlbW90ZSBhcyB1cHN0cmVhbSwgdXNlXG5cdFx0XHQ1OlxuXHRcdFx0NDpcdGdpdCBwdXNoIC0tc2V0LXVwc3RyZWFtIG9yaWdpbiBzZGpmc2tkamZkc2xramZcblx0XHRcdDM6XG5cdFx0XHQyOiBUbyBoYXZlIHRoaXMgaGFwcGVuIGF1dG9tYXRpY2FsbHkgZm9yIGJyYW5jaGVzIHdpdGhvdXQgYSB0cmFja2luZ1xuXHRcdFx0MTogdXBzdHJlYW0sIHNlZSAncHVzaC5hdXRvU2V0dXBSZW1vdGUnIGluICdnaXQgaGVscCBjb25maWcnLlxuXHRcdFx0MDpcblxuXHRcdFx0RXhhbXBsZSBvdXRwdXQgb24gbWFjT1M6XG5cdFx0XHQ1OiBtZWdhbnJvZ2dlQE1lZ2Fucy1NYWNCb29rLVBybyB4dGVybS5qcyAlIGdpdCBwdXNoXG5cdFx0XHQ0OiBmYXRhbDogVGhlIGN1cnJlbnQgYnJhbmNoIG1lcm9nZ2UvYXNqZGtmc2pka2ZzZGpmIGhhcyBubyB1cHN0cmVhbSBicmFuY2guXG5cdFx0XHQzOiBUbyBwdXNoIHRoZSBjdXJyZW50IGJyYW5jaCBhbmQgc2V0IHRoZSByZW1vdGUgYXMgdXBzdHJlYW0sIHVzZVxuXHRcdFx0Mjpcblx0XHRcdDE6XHRnaXQgcHVzaCAtLXNldC11cHN0cmVhbSBvcmlnaW4gbWVyb2dnZS9hc2pka2ZzamRrZnNkamZcblx0XHRcdDA6XG5cdFx0ICovXG5cdFx0b3V0cHV0TWF0Y2hlcjoge1xuXHRcdFx0bGluZU1hdGNoZXI6IEdpdFB1c2hPdXRwdXRSZWdleCxcblx0XHRcdGFuY2hvcjogJ2JvdHRvbScsXG5cdFx0XHRvZmZzZXQ6IDAsXG5cdFx0XHRsZW5ndGg6IDhcblx0XHR9LFxuXHRcdGNvbW1hbmRFeGl0UmVzdWx0OiAnZXJyb3InLFxuXHRcdGdldFF1aWNrRml4ZXM6IChtYXRjaFJlc3VsdDogSVRlcm1pbmFsQ29tbWFuZE1hdGNoUmVzdWx0KSA9PiB7XG5cdFx0XHRjb25zdCBtYXRjaGVzID0gbWF0Y2hSZXN1bHQub3V0cHV0TWF0Y2g7XG5cdFx0XHRjb25zdCBjb21tYW5kVG9SdW4gPSAnZ2l0IHB1c2ggLS1zZXQtdXBzdHJlYW0gb3JpZ2luICR7Z3JvdXA6YnJhbmNoTmFtZX0nO1xuXHRcdFx0aWYgKCFtYXRjaGVzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGdyb3VwcyA9IG1hdGNoZXMucmVnZXhNYXRjaC5ncm91cHM7XG5cdFx0XHRpZiAoIWdyb3Vwcykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhY3Rpb25zOiBUZXJtaW5hbFF1aWNrRml4QWN0aW9uSW50ZXJuYWxbXSA9IFtdO1xuXHRcdFx0bGV0IGZpeGVkQ29tbWFuZCA9IGNvbW1hbmRUb1J1bjtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGdyb3VwcykpIHtcblx0XHRcdFx0Y29uc3QgdmFyVG9SZXNvbHZlID0gJyR7Z3JvdXA6JyArIGAke2tleX1gICsgJ30nO1xuXHRcdFx0XHRpZiAoIWNvbW1hbmRUb1J1bi5pbmNsdWRlcyh2YXJUb1Jlc29sdmUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZpeGVkQ29tbWFuZCA9IGZpeGVkQ29tbWFuZC5yZXBsYWNlQWxsKHZhclRvUmVzb2x2ZSwgKCkgPT4gdmFsdWUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGZpeGVkQ29tbWFuZCkge1xuXHRcdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsUXVpY2tGaXhUeXBlLlRlcm1pbmFsQ29tbWFuZCxcblx0XHRcdFx0XHRpZDogJ0dpdCBQdXNoIFNldCBVcHN0cmVhbScsXG5cdFx0XHRcdFx0dGVybWluYWxDb21tYW5kOiBmaXhlZENvbW1hbmQsXG5cdFx0XHRcdFx0c2hvdWxkRXhlY3V0ZTogdHJ1ZSxcblx0XHRcdFx0XHRzb3VyY2U6IFF1aWNrRml4U291cmNlLkJ1aWx0aW5cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiBhY3Rpb25zO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdpdENyZWF0ZVByKCk6IElUZXJtaW5hbFF1aWNrRml4SW50ZXJuYWxPcHRpb25zIHtcblx0cmV0dXJuIHtcblx0XHRpZDogJ0dpdCBDcmVhdGUgUHInLFxuXHRcdHR5cGU6ICdpbnRlcm5hbCcsXG5cdFx0Y29tbWFuZExpbmVNYXRjaGVyOiBHaXRQdXNoQ29tbWFuZExpbmVSZWdleCxcblx0XHQvLyBFeGFtcGxlIG91dHB1dDpcblx0XHQvLyAuLi5cblx0XHQvLyAxMDogcmVtb3RlOlxuXHRcdC8vIDk6ICByZW1vdGU6IENyZWF0ZSBhIHB1bGwgcmVxdWVzdCBmb3IgJ215X2JyYW5jaCcgb24gR2l0SHViIGJ5IHZpc2l0aW5nOlxuXHRcdC8vIDg6ICByZW1vdGU6ICAgICAgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC9uZXcvbXlfYnJhbmNoXG5cdFx0Ly8gNzogIHJlbW90ZTpcblx0XHQvLyA2OiAgcmVtb3RlOiBHaXRIdWIgZm91bmQgeCB2dWxuZXJhYmlsaXRpZXMgb24gbWljcm9zb2Z0L3ZzY29kZSdzIGRlZmF1bHQgYnJhbmNoICguLi4pLiBUbyBmaW5kIG91dCBtb3JlLCB2aXNpdDpcblx0XHQvLyA1OiAgcmVtb3RlOiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3NlY3VyaXR5L2RlcGVuZGFib3Rcblx0XHQvLyA0OiAgcmVtb3RlOlxuXHRcdC8vIDM6ICBUbyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZVxuXHRcdC8vIDI6ICAqIFtuZXcgYnJhbmNoXSAgICAgICAgICAgICAgbXlfYnJhbmNoIC0+IG15X2JyYW5jaFxuXHRcdC8vIDE6ICBCcmFuY2ggJ215X2JyYW5jaCcgc2V0IHVwIHRvIHRyYWNrIHJlbW90ZSBicmFuY2ggJ215X2JyYW5jaCcgZnJvbSAnb3JpZ2luJy5cblx0XHQvLyAwOlxuXHRcdG91dHB1dE1hdGNoZXI6IHtcblx0XHRcdGxpbmVNYXRjaGVyOiBHaXRDcmVhdGVQck91dHB1dFJlZ2V4LFxuXHRcdFx0YW5jaG9yOiAnYm90dG9tJyxcblx0XHRcdG9mZnNldDogNCxcblx0XHRcdC8vIH42IHNob3VsZCBvbmx5IGJlIG5lZWRlZCBoZXJlIGZvciBzZWN1cml0eSBhbGVydHMsIGJ1dCB0aGUgZ2l0IHByb3ZpZGVyIGNhbiBjdXN0b21pemVcblx0XHRcdC8vIHRoZSB0ZXh0LCBzbyB1c2UgMTIgdG8gYmUgc2FmZS5cblx0XHRcdGxlbmd0aDogMTJcblx0XHR9LFxuXHRcdGNvbW1hbmRFeGl0UmVzdWx0OiAnc3VjY2VzcycsXG5cdFx0Z2V0UXVpY2tGaXhlczogKG1hdGNoUmVzdWx0OiBJVGVybWluYWxDb21tYW5kTWF0Y2hSZXN1bHQpID0+IHtcblx0XHRcdGNvbnN0IGxpbmsgPSBtYXRjaFJlc3VsdD8ub3V0cHV0TWF0Y2g/LnJlZ2V4TWF0Y2g/Lmdyb3Vwcz8ubGluaz8udHJpbUVuZCgpO1xuXHRcdFx0aWYgKCFsaW5rKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxhYmVsID0gbG9jYWxpemUoXCJ0ZXJtaW5hbC5jcmVhdGVQUlwiLCBcIkNyZWF0ZSBQUiB7MH1cIiwgbGluayk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogJ0dpdCBDcmVhdGUgUHInLFxuXHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0dHlwZTogVGVybWluYWxRdWlja0ZpeFR5cGUuT3BlbmVyLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZShsaW5rKSxcblx0XHRcdFx0c291cmNlOiBRdWlja0ZpeFNvdXJjZS5CdWlsdGluXG5cdFx0XHR9O1xuXHRcdH1cblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHB3c2hHZW5lcmFsRXJyb3IoKTogSVRlcm1pbmFsUXVpY2tGaXhJbnRlcm5hbE9wdGlvbnMge1xuXHRyZXR1cm4ge1xuXHRcdGlkOiAnUHdzaCBHZW5lcmFsIEVycm9yJyxcblx0XHR0eXBlOiAnaW50ZXJuYWwnLFxuXHRcdGNvbW1hbmRMaW5lTWF0Y2hlcjogLy4rLyxcblx0XHRvdXRwdXRNYXRjaGVyOiB7XG5cdFx0XHRsaW5lTWF0Y2hlcjogUHdzaEdlbmVyYWxFcnJvck91dHB1dFJlZ2V4LFxuXHRcdFx0YW5jaG9yOiAnYm90dG9tJyxcblx0XHRcdG9mZnNldDogMCxcblx0XHRcdGxlbmd0aDogMTBcblx0XHR9LFxuXHRcdGNvbW1hbmRFeGl0UmVzdWx0OiAnZXJyb3InLFxuXHRcdGdldFF1aWNrRml4ZXM6IChtYXRjaFJlc3VsdDogSVRlcm1pbmFsQ29tbWFuZE1hdGNoUmVzdWx0KSA9PiB7XG5cdFx0XHRjb25zdCBsaW5lcyA9IG1hdGNoUmVzdWx0Lm91dHB1dE1hdGNoPy5yZWdleE1hdGNoLmlucHV0Py5zcGxpdCgnXFxuJyk7XG5cdFx0XHRpZiAoIWxpbmVzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRmluZCB0aGUgc3RhcnRcblx0XHRcdGxldCBpID0gMDtcblx0XHRcdGxldCBpbkZlZWRiYWNrUHJvdmlkZXIgPSBmYWxzZTtcblx0XHRcdGZvciAoOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKGxpbmVzW2ldLm1hdGNoKFB3c2hHZW5lcmFsRXJyb3JPdXRwdXRSZWdleCkpIHtcblx0XHRcdFx0XHRpbkZlZWRiYWNrUHJvdmlkZXIgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWluRmVlZGJhY2tQcm92aWRlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN1Z2dlc3Rpb25zID0gbGluZXNbaSArIDFdLm1hdGNoKC9UaGUgbW9zdCBzaW1pbGFyIGNvbW1hbmRzIGFyZTogKD88dmFsdWVzPi4rKS4vKT8uZ3JvdXBzPy52YWx1ZXM/LnNwbGl0KCcsICcpO1xuXHRcdFx0aWYgKCFzdWdnZXN0aW9ucykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQ6IElUZXJtaW5hbFF1aWNrRml4VGVybWluYWxDb21tYW5kQWN0aW9uW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3Qgc3VnZ2VzdGlvbiBvZiBzdWdnZXN0aW9ucykge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0aWQ6ICdQd3NoIEdlbmVyYWwgRXJyb3InLFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsUXVpY2tGaXhUeXBlLlRlcm1pbmFsQ29tbWFuZCxcblx0XHRcdFx0XHR0ZXJtaW5hbENvbW1hbmQ6IHN1Z2dlc3Rpb24sXG5cdFx0XHRcdFx0c291cmNlOiBRdWlja0ZpeFNvdXJjZS5CdWlsdGluXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwd3NoVW5peENvbW1hbmROb3RGb3VuZEVycm9yKCk6IElUZXJtaW5hbFF1aWNrRml4SW50ZXJuYWxPcHRpb25zIHtcblx0cmV0dXJuIHtcblx0XHRpZDogJ1VuaXggQ29tbWFuZCBOb3QgRm91bmQnLFxuXHRcdHR5cGU6ICdpbnRlcm5hbCcsXG5cdFx0Y29tbWFuZExpbmVNYXRjaGVyOiAvLisvLFxuXHRcdG91dHB1dE1hdGNoZXI6IHtcblx0XHRcdGxpbmVNYXRjaGVyOiBQd3NoVW5peENvbW1hbmROb3RGb3VuZEVycm9yT3V0cHV0UmVnZXgsXG5cdFx0XHRhbmNob3I6ICdib3R0b20nLFxuXHRcdFx0b2Zmc2V0OiAwLFxuXHRcdFx0bGVuZ3RoOiAxMFxuXHRcdH0sXG5cdFx0Y29tbWFuZEV4aXRSZXN1bHQ6ICdlcnJvcicsXG5cdFx0Z2V0UXVpY2tGaXhlczogKG1hdGNoUmVzdWx0OiBJVGVybWluYWxDb21tYW5kTWF0Y2hSZXN1bHQpID0+IHtcblx0XHRcdGNvbnN0IGxpbmVzID0gbWF0Y2hSZXN1bHQub3V0cHV0TWF0Y2g/LnJlZ2V4TWF0Y2guaW5wdXQ/LnNwbGl0KCdcXG4nKTtcblx0XHRcdGlmICghbGluZXMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGaW5kIHRoZSBzdGFydFxuXHRcdFx0bGV0IGkgPSAwO1xuXHRcdFx0bGV0IGluRmVlZGJhY2tQcm92aWRlciA9IGZhbHNlO1xuXHRcdFx0Zm9yICg7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAobGluZXNbaV0ubWF0Y2goUHdzaFVuaXhDb21tYW5kTm90Rm91bmRFcnJvck91dHB1dFJlZ2V4KSkge1xuXHRcdFx0XHRcdGluRmVlZGJhY2tQcm92aWRlciA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICghaW5GZWVkYmFja1Byb3ZpZGVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQWx3YXlzIHJlbW92ZSB0aGUgZmlyc3QgZWxlbWVudCBhcyBpdCdzIHRoZSBcIlN1Z2dlc3Rpb24gW2NtZC1ub3QtZm91bmRdXCJcIiBsaW5lXG5cdFx0XHRjb25zdCByZXN1bHQ6IElUZXJtaW5hbFF1aWNrRml4VGVybWluYWxDb21tYW5kQWN0aW9uW10gPSBbXTtcblx0XHRcdGxldCBpblN1Z2dlc3Rpb25zID0gZmFsc2U7XG5cdFx0XHRmb3IgKDsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmUgPSBsaW5lc1tpXS50cmltKCk7XG5cdFx0XHRcdGlmIChsaW5lLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGluc3RhbGxDb21tYW5kID0gbGluZS5tYXRjaCgvWW91IGFsc28gaGF2ZSAuKyBpbnN0YWxsZWQsIHlvdSBjYW4gcnVuICcoPzxjb21tYW5kPi4rKScgaW5zdGVhZC4vKT8uZ3JvdXBzPy5jb21tYW5kO1xuXHRcdFx0XHRpZiAoaW5zdGFsbENvbW1hbmQpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0XHRpZDogJ1B3c2ggVW5peCBDb21tYW5kIE5vdCBGb3VuZCBFcnJvcicsXG5cdFx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbFF1aWNrRml4VHlwZS5UZXJtaW5hbENvbW1hbmQsXG5cdFx0XHRcdFx0XHR0ZXJtaW5hbENvbW1hbmQ6IGluc3RhbGxDb21tYW5kLFxuXHRcdFx0XHRcdFx0c291cmNlOiBRdWlja0ZpeFNvdXJjZS5CdWlsdGluXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0aW5TdWdnZXN0aW9ucyA9IGZhbHNlO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChsaW5lLm1hdGNoKC9Db21tYW5kICcuKycgbm90IGZvdW5kLCBidXQgY2FuIGJlIGluc3RhbGxlZCB3aXRoOi8pKSB7XG5cdFx0XHRcdFx0aW5TdWdnZXN0aW9ucyA9IHRydWU7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGluU3VnZ2VzdGlvbnMpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0XHRpZDogJ1B3c2ggVW5peCBDb21tYW5kIE5vdCBGb3VuZCBFcnJvcicsXG5cdFx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbFF1aWNrRml4VHlwZS5UZXJtaW5hbENvbW1hbmQsXG5cdFx0XHRcdFx0XHR0ZXJtaW5hbENvbW1hbmQ6IGxpbmUudHJpbSgpLFxuXHRcdFx0XHRcdFx0c291cmNlOiBRdWlja0ZpeFNvdXJjZS5CdWlsdGluXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHR9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQWdKLDRCQUE0QjtBQUVySyxNQUFNLHNCQUFzQjtBQUM1QixNQUFNLGdDQUFnQztBQUN0QyxNQUFNLDBCQUEwQjtBQUNoQyxNQUFNLG9CQUFvQjtBQUMxQixNQUFNLHdCQUF3QjtBQUM5QixNQUFNLHNCQUFzQjtBQUM1QixNQUFNLHFCQUFxQjtB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
