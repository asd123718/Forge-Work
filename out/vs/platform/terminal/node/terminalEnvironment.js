import * as os from "os";
import { FileAccess } from "../../../base/common/network.js";
import * as path from "../../../base/common/path.js";
import { isMacintosh, isWindows } from "../../../base/common/platform.js";
import * as process from "../../../base/common/process.js";
import { format } from "../../../base/common/strings.js";
import { ShellIntegrationInjectionFailureReason } from "../common/terminal.js";
import { EnvironmentVariableMutatorType } from "../common/environmentVariable.js";
import { deserializeEnvironmentVariableCollections } from "../common/environmentVariableShared.js";
import { MergedEnvironmentVariableCollection } from "../common/environmentVariableCollection.js";
import { chmod, realpathSync, mkdirSync } from "fs";
import { promisify } from "util";
import { isString } from "../../../base/common/types.js";
import { getWindowsBuildNumberAsync } from "../../../base/node/windowsVersion.js";
async function getShellIntegrationInjection(shellLaunchConfig, options, env, logService, productService, skipStickyBit = false) {
  if (!options.shellIntegration.enabled) {
    return { type: "failure", reason: ShellIntegrationInjectionFailureReason.InjectionSettingDisabled };
  }
  if (!shellLaunchConfig.executable) {
    return { type: "failure", reason: ShellIntegrationInjectionFailureReason.NoExecutable };
  }
  if (shellLaunchConfig.isFeatureTerminal && !shellLaunchConfig.forceShellIntegration) {
    return { type: "failure", reason: ShellIntegrationInjectionFailureReason.FeatureTerminal };
  }
  if (shellLaunchConfig.ignoreShellIntegration) {
    return { type: "failure", reason: ShellIntegrationInjectionFailureReason.IgnoreShellIntegrationFlag };
  }
  const windowsBuildNumber = isWindows ? await getWindowsBuildNumberAsync() : 0;
  if (isWindows && windowsBuildNumber < 18309) {
    return { type: "failure", reason: ShellIntegrationInjectionFailureReason.UnsupportedWindowsBuild };
  }
  const originalArgs = shellLaunchConfig.args;
  const shell = process.platform === "win32" ? path.basename(shellLaunchConfig.executable).toLowerCase() : path.basename(shellLaunchConfig.executable);
  const shellIntegrationScriptRoot = FileAccess.asFileUri("vs/workbench/contrib/terminal/common/scripts").fsPath;
  const type = "injection";
  let newArgs;
  const envMixin = {
    "VSCODE_INJECTION": "1"
  };
  if (options.shellIntegration.nonce) {
    envMixin["VSCODE_NONCE"] = options.shellIntegration.nonce;
  }
  const scopedDownShellEnvs = ["PATH", "VIRTUAL_ENV", "HOME", "SHELL", "PWD"];
  if (shellLaunchConfig.shellIntegrationEnvironmentReporting) {
    if (isWindows) {
      const enableWindowsEnvReporting = options.windowsUseConptyDll || windowsBuildNumber >= 22631 && shell !== "bash.exe";
      if (enableWindowsEnvReporting) {
        envMixin["VSCODE_SHELL_ENV_REPORTING"] = scopedDownShellEnvs.join(",");
      }
    } else {
      envMixin["VSCODE_SHELL_ENV_REPORTING"] = scopedDownShellEnvs.join(",");
    }
  }
  if (isWindows) {
    if (shell === "pwsh.exe" || shell === "powershell.exe") {
      envMixin["VSCODE_A11Y_MODE"] = options.isScreenReaderOptimized ? "1" : "0";
      if (!originalArgs || arePwshImpliedArgs(originalArgs)) {
        newArgs = shellIntegrationArgs.get("windows-pwsh" /* WindowsPwsh */);
      } else if (arePwshLoginArgs(originalArgs)) {
        newArgs = shellIntegrationArgs.get("windows-pwsh-login" /* WindowsPwshLogin */);
      }
      if (!newArgs) {
        return { type: "failure", reason: ShellIntegrationInjectionFailureReason.UnsupportedArgs };
      }
      newArgs = [...newArgs];
      newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], shellIntegrationScriptRoot, "");
      envMixin["VSCODE_STABLE"] = productService.quality === "stable" ? "1" : "0";
      return { type, newArgs, envMixin };
    } else if (shell === "bash.exe") {
      if (!originalArgs || originalArgs.length === 0) {
        newArgs = shellIntegrationArgs.get("bash" /* Bash */);
      } else if (areZshBashFishLoginArgs(originalArgs)) {
        envMixin["VSCODE_SHELL_LOGIN"] = "1";
        addEnvMixinPathPrefix(options, envMixin, shell);
        newArgs = shellIntegrationArgs.get("bash" /* Bash */);
      }
      if (!newArgs) {
        return { type: "failure", reason: ShellIntegrationInjectionFailureReason.UnsupportedArgs };
      }
      newArgs = [...newArgs];
      newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], shellIntegrationScriptRoot);
      envMixin["VSCODE_STABLE"] = productService.quality === "stable" ? "1" : "0";
      return { type, newArgs, envMixin };
    }
    logService.warn(`Shell integration cannot be enabled for executable "${shellLaunchConfig.executable}" and args`, shellLaunchConfig.args);
    return { type: "failure", reason: ShellIntegrationInjectionFailureReason.UnsupportedShell };
  }
  switch (shell) {
    case "bash": {
      if (!originalArgs || originalArgs.length === 0) {
        newArgs = shellIntegrationArgs.get("bash" /* Bash */);
      } else if (areZshBashFishLoginArgs(originalArgs)) {
        envMixin["VSCODE_SHELL_LOGIN"] = "1";
        addEnvMixinPathPrefix(options, envMixin, shell);
        newArgs = shellIntegrationArgs.get("bash" /* Bash */);
      }
      if (!newArgs) {
        return { type: "failure", reason: ShellIntegrationInjectionFailureReason.UnsupportedArgs };
      }
      newArgs = [...newArgs];
      newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], shellIntegrationScriptRoot);
      envMixin["VSCODE_STABLE"] = productService.quality === "stable" ? "1" : "0";
      return { type, newArgs, envMixin };
    }
    case "fish": {
      if (!originalArgs || originalArgs.length === 0) {
        newArgs = shellIntegrationArgs.get("fish" /* Fish */);
      } else if (areZshBashFishLoginArgs(originalArgs)) {
        newArgs = shellIntegrationArgs.get("fish-login" /* FishLogin */);
      } else if (originalArgs === shellIntegrationArgs.get("fish" /* Fish */) || originalArgs === shellIntegrationArgs.get("fish-login" /* FishLogin */)) {
        newArgs = originalArgs;
      }
      if (!newArgs) {
        return { type: "failure", reason: ShellIntegrationInjectionFailureReason.UnsupportedArgs };
      }
      addEnvMixinPathPrefix(options, envMixin, shell);
      newArgs = [...newArgs];
      newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], shellIntegrationScriptRoot);
      return { type, newArgs, envMixin };
    }
    case "pwsh": {
      if (!originalArgs || arePwshImpliedArgs(originalArgs)) {
        newArgs = shellIntegrationArgs.get("pwsh" /* Pwsh */);
      } else if (arePwshLoginArgs(originalArgs)) {
        newArgs = shellIntegrationArgs.get("pwsh-login" /* PwshLogin */);
      }
      if (!newArgs) {
        return { type: "failure", reason: ShellIntegrationInjectionFailureReason.UnsupportedArgs };
      }
      newArgs = [...newArgs];
      newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], shellIntegrationScriptRoot, "");
      envMixin["VSCODE_STABLE"] = productService.quality === "stable" ? "1" : "0";
      return { type, newArgs, envMixin };
    }
    case "zsh": {
      if (!originalArgs || originalArgs.length === 0) {
        newArgs = shellIntegrationArgs.get("zsh" /* Zsh */);
      } else if (areZshBashFishLoginArgs(originalArgs)) {
        newArgs = shellIntegrationArgs.get("zsh-login" /* ZshLogin */);
        addEnvMixinPathPrefix(options, envMixin, shell);
      } else if (originalArgs === shellIntegrationArgs.get("zsh" /* Zsh */) || originalArgs === shellIntegrationArgs.get("zsh-login" /* ZshLogin */)) {
        newArgs = originalArgs;
      }
      if (!newArgs) {
        return { type: "failure", reason: ShellIntegrationInjectionFailureReason.UnsupportedArgs };
      }
      newArgs = [...newArgs];
      newArgs[newArgs.length - 1] = format(newArgs[newArgs.length - 1], shellIntegrationScriptRoot);
      let username;
      try {
        username = os.userInfo().username;
      } catch {
        username = "unknown";
      }
      const realTmpDir = realpathSync(os.tmpdir());
      const zdotdir = path.join(realTmpDir, `${username}-${productService.applicationName}-zsh`);
      if (!skipStickyBit) {
        try {
          const chmodAsync = promisify(chmod);
          await chmodAsync(zdotdir, 960);
        } catch (err) {
          if (!err.message.includes("ENOENT")) {
            logService.error(`Failed to set sticky bit on ${zdotdir}: ${err}`);
            return { type: "failure", reason: ShellIntegrationInjectionFailureReason.FailedToSetStickyBit };
          }
          try {
            mkdirSync(zdotdir, { recursive: true });
          } catch (err2) {
            logService.error(`Failed to create zdotdir at ${zdotdir}: ${err2}`);
            return { type: "failure", reason: ShellIntegrationInjectionFailureReason.FailedToCreateTmpDir };
          }
          try {
            const chmodAsync = promisify(chmod);
            await chmodAsync(zdotdir, 960);
          } catch (err2) {
            logService.error(`Failed to set sticky bit on ${zdotdir}: ${err2}`);
            return { type: "failure", reason: ShellIntegrationInjectionFailureReason.FailedToSetStickyBit };
          }
        }
      }
      envMixin["ZDOTDIR"] = zdotdir;
      const userZdotdir = env?.ZDOTDIR ?? os.homedir() ?? `~`;
      envMixin["USER_ZDOTDIR"] = userZdotdir;
      const filesToCopy = [];
      filesToCopy.push({
        source: path.join(shellIntegrationScriptRoot, "shellIntegration-rc.zsh"),
        dest: path.join(zdotdir, ".zshrc")
      });
      filesToCopy.push({
        source: path.join(shellIntegrationScriptRoot, "shellIntegration-profile.zsh"),
        dest: path.join(zdotdir, ".zprofile")
      });
      filesToCopy.push({
        source: path.join(shellIntegrationScriptRoot, "shellIntegration-env.zsh"),
        dest: path.join(zdotdir, ".zshenv")
      });
      filesToCopy.push({
        source: path.join(shellIntegrationScriptRoot, "shellIntegration-login.zsh"),
        dest: path.join(zdotdir, ".zlogin")
      });
      return { type, newArgs, envMixin, filesToCopy };
    }
  }
  logService.warn(`Shell integration cannot be enabled for executable "${shellLaunchConfig.executable}" and args`, shellLaunchConfig.args);
  return { type: "failure", reason: ShellIntegrationInjectionFailureReason.UnsupportedShell };
}
function addEnvMixinPathPrefix(options, envMixin, shell) {
  if ((isMacintosh || shell === "fish") && options.environmentVariableCollections) {
    const deserialized = deserializeEnvironmentVariableCollections(options.environmentVariableCollections);
    const merged = new MergedEnvironmentVariableCollection(deserialized);
    const pathEntry = merged.getVariableMap({ workspaceFolder: options.workspaceFolder }).get("PATH");
    const prependToPath = [];
    if (pathEntry) {
      for (const mutator of pathEntry) {
        if (mutator.type === EnvironmentVariableMutatorType.Prepend) {
          prependToPath.push(mutator.value);
        }
      }
    }
    if (prependToPath.length > 0) {
      envMixin["VSCODE_PATH_PREFIX"] = prependToPath.join("");
    }
  }
}
var ShellIntegrationExecutable = /* @__PURE__ */ ((ShellIntegrationExecutable2) => {
  ShellIntegrationExecutable2["WindowsPwsh"] = "windows-pwsh";
  ShellIntegrationExecutable2["WindowsPwshLogin"] = "windows-pwsh-login";
  ShellIntegrationExecutable2["Pwsh"] = "pwsh";
  ShellIntegrationExecutable2["PwshLogin"] = "pwsh-login";
  ShellIntegrationExecutable2["Zsh"] = "zsh";
  ShellIntegrationExecutable2["ZshLogin"] = "zsh-login";
  ShellIntegrationExecutable2["Bash"] = "bash";
  ShellIntegrationExecutable2["Fish"] = "fish";
  ShellIntegrationExecutable2["FishLogin"] = "fish-login";
  return ShellIntegrationExecutable2;
})(ShellIntegrationExecutable || {});
const shellIntegrationArgs = /* @__PURE__ */ new Map();
shellIntegrationArgs.set("windows-pwsh" /* WindowsPwsh */, ["-noexit", "-command", 'try { . "{0}\\shellIntegration.ps1" } catch {}{1}']);
shellIntegrationArgs.set("windows-pwsh-login" /* WindowsPwshLogin */, ["-l", "-noexit", "-command", 'try { . "{0}\\shellIntegration.ps1" } catch {}{1}']);
shellIntegrationArgs.set("pwsh" /* Pwsh */, ["-noexit", "-command", '. "{0}/shellIntegration.ps1"{1}']);
shellIntegrationArgs.set("pwsh-login" /* PwshLogin */, ["-l", "-noexit", "-command", '. "{0}/shellIntegration.ps1"']);
shellIntegrationArgs.set("zsh" /* Zsh */, ["-i"]);
shellIntegrationArgs.set("zsh-login" /* ZshLogin */, ["-il"]);
shellIntegrationArgs.set("bash" /* Bash */, ["--init-file", "{0}/shellIntegration-bash.sh"]);
shellIntegrationArgs.set("fish" /* Fish */, ["--init-command", 'source "{0}/shellIntegration.fish"']);
shellIntegrationArgs.set("fish-login" /* FishLogin */, ["-l", "--init-command", 'source "{0}/shellIntegration.fish"']);
const pwshLoginArgs = ["-login", "-l"];
const shLoginArgs = ["--login", "-l"];
const shInteractiveArgs = ["-i", "--interactive"];
const pwshImpliedArgs = ["-nol", "-nologo"];
function arePwshLoginArgs(originalArgs) {
  if (isString(originalArgs)) {
    return pwshLoginArgs.includes(originalArgs.toLowerCase());
  } else {
    return originalArgs.length === 1 && pwshLoginArgs.includes(originalArgs[0].toLowerCase()) || originalArgs.length === 2 && (pwshLoginArgs.includes(originalArgs[0].toLowerCase()) || pwshLoginArgs.includes(originalArgs[1].toLowerCase())) && (pwshImpliedArgs.includes(originalArgs[0].toLowerCase()) || pwshImpliedArgs.includes(originalArgs[1].toLowerCase()));
  }
}
function arePwshImpliedArgs(originalArgs) {
  if (isString(originalArgs)) {
    return pwshImpliedArgs.includes(originalArgs.toLowerCase());
  } else {
    return originalArgs.length === 0 || originalArgs?.length === 1 && pwshImpliedArgs.includes(originalArgs[0].toLowerCase());
  }
}
function areZshBashFishLoginArgs(originalArgs) {
  if (!isString(originalArgs)) {
    originalArgs = originalArgs.filter((arg) => !shInteractiveArgs.includes(arg.toLowerCase()));
  }
  return isString(originalArgs) && shLoginArgs.includes(originalArgs.toLowerCase()) || !isString(originalArgs) && originalArgs.length === 1 && shLoginArgs.includes(originalArgs[0].toLowerCase());
}
const sensitiveEnvVarNames = /^(?:.*_)?(?:API_?KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL|AUTH|PRIVATE_?KEY|ACCESS_?KEY|CLIENT_?SECRET|APIKEY)(?:_.*)?$/i;
const secretValuePatterns = [
  // JWT tokens
  /^eyJ[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+$/,
  // GitHub tokens
  /^gh[psuro]_[a-zA-Z0-9]{36}$/,
  /^github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}$/,
  // Google API keys
  /^AIza[A-Za-z0-9_\-]{35}$/,
  // Slack tokens
  /^xox[pbar]\-[A-Za-z0-9\-]+$/,
  // Azure/MS tokens (common patterns)
  /^[a-zA-Z0-9]{32,}$/
];
function sanitizeEnvForLogging(env) {
  if (!env) {
    return env;
  }
  const sanitized = {};
  for (const key of Object.keys(env)) {
    const value = env[key];
    if (value === void 0) {
      continue;
    }
    if (sensitiveEnvVarNames.test(key)) {
      sanitized[key] = "<REDACTED>";
      continue;
    }
    let isSecret = false;
    for (const pattern of secretValuePatterns) {
      if (pattern.test(value)) {
        isSecret = true;
        break;
      }
    }
    sanitized[key] = isSecret ? "<REDACTED>" : value;
  }
  return sanitized;
}
export {
  getShellIntegrationInjection,
  sanitizeEnvForLogging
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXG5vZGVcXHRlcm1pbmFsRW52aXJvbm1lbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgSVByb2Nlc3NFbnZpcm9ubWVudCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAqIGFzIHByb2Nlc3MgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBmb3JtYXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNoZWxsTGF1bmNoQ29uZmlnLCBJVGVybWluYWxFbnZpcm9ubWVudCwgSVRlcm1pbmFsUHJvY2Vzc09wdGlvbnMsIFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlUmVhc29uIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlLmpzJztcbmltcG9ydCB7IGRlc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25zIH0gZnJvbSAnLi4vY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGVTaGFyZWQuanMnO1xuaW1wb3J0IHsgTWVyZ2VkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24gfSBmcm9tICcuLi9jb21tb24vZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgY2htb2QsIHJlYWxwYXRoU3luYywgbWtkaXJTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgcHJvbWlzaWZ5IH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgeyBpc1N0cmluZywgU2luZ2xlT3JNYW55IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZ2V0V2luZG93c0J1aWxkTnVtYmVyQXN5bmMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvd2luZG93c1ZlcnNpb24uanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTaGVsbEludGVncmF0aW9uQ29uZmlnSW5qZWN0aW9uIHtcblx0cmVhZG9ubHkgdHlwZTogJ2luamVjdGlvbic7XG5cdC8qKlxuXHQgKiBBIG5ldyBzZXQgb2YgYXJndW1lbnRzIHRvIHVzZS5cblx0ICovXG5cdHJlYWRvbmx5IG5ld0FyZ3M6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogQW4gb3B0aW9uYWwgZW52aXJvbm1lbnQgdG8gbWl4aW5nIHRvIHRoZSByZWFsIGVudmlyb25tZW50LlxuXHQgKi9cblx0cmVhZG9ubHkgZW52TWl4aW4/OiBJUHJvY2Vzc0Vudmlyb25tZW50O1xuXHQvKipcblx0ICogQW4gb3B0aW9uYWwgYXJyYXkgb2YgZmlsZXMgdG8gY29weSBmcm9tIGBzb3VyY2VgIHRvIGBkZXN0YC5cblx0ICovXG5cdHJlYWRvbmx5IGZpbGVzVG9Db3B5Pzoge1xuXHRcdHNvdXJjZTogc3RyaW5nO1xuXHRcdGRlc3Q6IHN0cmluZztcblx0fVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZSB7XG5cdHJlYWRvbmx5IHR5cGU6ICdmYWlsdXJlJztcblx0cmVhZG9ubHkgcmVhc29uOiBTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZVJlYXNvbjtcbn1cblxuLyoqXG4gKiBGb3IgYSBnaXZlbiBzaGVsbCBsYXVuY2ggY29uZmlnLCByZXR1cm5zIGFyZ3VtZW50cyB0byByZXBsYWNlIGFuZCBhbiBvcHRpb25hbCBlbnZpcm9ubWVudCB0b1xuICogbWl4aW4gdG8gdGhlIFNMQydzIGVudmlyb25tZW50IHRvIGVuYWJsZSBzaGVsbCBpbnRlZ3JhdGlvbi4gVGhpcyBtdXN0IGJlIHJ1biB3aXRoaW4gdGhlIGNvbnRleHRcbiAqIHRoYXQgY3JlYXRlcyB0aGUgcHJvY2VzcyB0byBlbnN1cmUgYWNjdXJhY3kuIFJldHVybnMgdW5kZWZpbmVkIGlmIHNoZWxsIGludGVncmF0aW9uIGNhbm5vdCBiZVxuICogZW5hYmxlZC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oXG5cdHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcsXG5cdG9wdGlvbnM6IElUZXJtaW5hbFByb2Nlc3NPcHRpb25zLFxuXHRlbnY6IElUZXJtaW5hbEVudmlyb25tZW50IHwgdW5kZWZpbmVkLFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0cHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0c2tpcFN0aWNreUJpdDogYm9vbGVhbiA9IGZhbHNlXG4pOiBQcm9taXNlPElTaGVsbEludGVncmF0aW9uQ29uZmlnSW5qZWN0aW9uIHwgSVNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlPiB7XG5cdC8vIFRoZSBnbG9iYWwgc2V0dGluZyBpcyBkaXNhYmxlZFxuXHRpZiAoIW9wdGlvbnMuc2hlbGxJbnRlZ3JhdGlvbi5lbmFibGVkKSB7XG5cdFx0cmV0dXJuIHsgdHlwZTogJ2ZhaWx1cmUnLCByZWFzb246IFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlUmVhc29uLkluamVjdGlvblNldHRpbmdEaXNhYmxlZCB9O1xuXHR9XG5cdC8vIFRoZXJlIGlzIG5vIGV4ZWN1dGFibGUgKHNvIHRoZXJlJ3Mgbm8gd2F5IHRvIGRldGVybWluZSBob3cgdG8gaW5qZWN0KVxuXHRpZiAoIXNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUpIHtcblx0XHRyZXR1cm4geyB0eXBlOiAnZmFpbHVyZScsIHJlYXNvbjogU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb24uTm9FeGVjdXRhYmxlIH07XG5cdH1cblx0Ly8gSXQncyBhIGZlYXR1cmUgdGVybWluYWwgKHRhc2tzLCBkZWJ1ZyksIHVubGVzcyBpdCdzIGV4cGxpY2l0bHkgYmVpbmcgZm9yY2VkXG5cdGlmIChzaGVsbExhdW5jaENvbmZpZy5pc0ZlYXR1cmVUZXJtaW5hbCAmJiAhc2hlbGxMYXVuY2hDb25maWcuZm9yY2VTaGVsbEludGVncmF0aW9uKSB7XG5cdFx0cmV0dXJuIHsgdHlwZTogJ2ZhaWx1cmUnLCByZWFzb246IFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlUmVhc29uLkZlYXR1cmVUZXJtaW5hbCB9O1xuXHR9XG5cdC8vIFRoZSBpZ25vcmVTaGVsbEludGVncmF0aW9uIGZsYWcgaXMgcGFzc2VkIChlZy4gcmVsYXVuY2hpbmcgd2l0aG91dCBzaGVsbCBpbnRlZ3JhdGlvbilcblx0aWYgKHNoZWxsTGF1bmNoQ29uZmlnLmlnbm9yZVNoZWxsSW50ZWdyYXRpb24pIHtcblx0XHRyZXR1cm4geyB0eXBlOiAnZmFpbHVyZScsIHJlYXNvbjogU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb24uSWdub3JlU2hlbGxJbnRlZ3JhdGlvbkZsYWcgfTtcblx0fVxuXHQvLyBTaGVsbCBpbnRlZ3JhdGlvbiByZXF1aXJlcyBXaW5kb3dzIDEwIGJ1aWxkIDE4MzA5KyAoQ29uUFRZIHN1cHBvcnQpXG5cdGNvbnN0IHdpbmRvd3NCdWlsZE51bWJlciA9IGlzV2luZG93cyA/IGF3YWl0IGdldFdpbmRvd3NCdWlsZE51bWJlckFzeW5jKCkgOiAwO1xuXHRpZiAoaXNXaW5kb3dzICYmIHdpbmRvd3NCdWlsZE51bWJlciA8IDE4MzA5KSB7XG5cdFx0cmV0dXJuIHsgdHlwZTogJ2ZhaWx1cmUnLCByZWFzb246IFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlUmVhc29uLlVuc3VwcG9ydGVkV2luZG93c0J1aWxkIH07XG5cdH1cblxuXHRjb25zdCBvcmlnaW5hbEFyZ3MgPSBzaGVsbExhdW5jaENvbmZpZy5hcmdzO1xuXHRjb25zdCBzaGVsbCA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicgPyBwYXRoLmJhc2VuYW1lKHNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUpLnRvTG93ZXJDYXNlKCkgOiBwYXRoLmJhc2VuYW1lKHNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUpO1xuXHRjb25zdCBzaGVsbEludGVncmF0aW9uU2NyaXB0Um9vdCA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9jb21tb24vc2NyaXB0cycpLmZzUGF0aDtcblx0Y29uc3QgdHlwZSA9ICdpbmplY3Rpb24nO1xuXHRsZXQgbmV3QXJnczogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdGNvbnN0IGVudk1peGluOiBJUHJvY2Vzc0Vudmlyb25tZW50ID0ge1xuXHRcdCdWU0NPREVfSU5KRUNUSU9OJzogJzEnXG5cdH07XG5cblx0aWYgKG9wdGlvbnMuc2hlbGxJbnRlZ3JhdGlvbi5ub25jZSkge1xuXHRcdGVudk1peGluWydWU0NPREVfTk9OQ0UnXSA9IG9wdGlvbnMuc2hlbGxJbnRlZ3JhdGlvbi5ub25jZTtcblx0fVxuXHQvLyBUZW1wb3JhcmlseSBwYXNzIGxpc3Qgb2YgaGFyZGNvZGVkIGVudiB2YXJzIGZvciBzaGVsbCBlbnYgYXBpXG5cdGNvbnN0IHNjb3BlZERvd25TaGVsbEVudnMgPSBbJ1BBVEgnLCAnVklSVFVBTF9FTlYnLCAnSE9NRScsICdTSEVMTCcsICdQV0QnXTtcblx0aWYgKHNoZWxsTGF1bmNoQ29uZmlnLnNoZWxsSW50ZWdyYXRpb25FbnZpcm9ubWVudFJlcG9ydGluZykge1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGNvbnN0IGVuYWJsZVdpbmRvd3NFbnZSZXBvcnRpbmcgPSBvcHRpb25zLndpbmRvd3NVc2VDb25wdHlEbGwgfHwgd2luZG93c0J1aWxkTnVtYmVyID49IDIyNjMxICYmIHNoZWxsICE9PSAnYmFzaC5leGUnO1xuXHRcdFx0aWYgKGVuYWJsZVdpbmRvd3NFbnZSZXBvcnRpbmcpIHtcblx0XHRcdFx0ZW52TWl4aW5bJ1ZTQ09ERV9TSEVMTF9FTlZfUkVQT1JUSU5HJ10gPSBzY29wZWREb3duU2hlbGxFbnZzLmpvaW4oJywnKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0ZW52TWl4aW5bJ1ZTQ09ERV9TSEVMTF9FTlZfUkVQT1JUSU5HJ10gPSBzY29wZWREb3duU2hlbGxFbnZzLmpvaW4oJywnKTtcblx0XHR9XG5cdH1cblxuXHQvLyBXaW5kb3dzXG5cdGlmIChpc1dpbmRvd3MpIHtcblx0XHRpZiAoc2hlbGwgPT09ICdwd3NoLmV4ZScgfHwgc2hlbGwgPT09ICdwb3dlcnNoZWxsLmV4ZScpIHtcblx0XHRcdGVudk1peGluWydWU0NPREVfQTExWV9NT0RFJ10gPSBvcHRpb25zLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkID8gJzEnIDogJzAnO1xuXG5cdFx0XHRpZiAoIW9yaWdpbmFsQXJncyB8fCBhcmVQd3NoSW1wbGllZEFyZ3Mob3JpZ2luYWxBcmdzKSkge1xuXHRcdFx0XHRuZXdBcmdzID0gc2hlbGxJbnRlZ3JhdGlvbkFyZ3MuZ2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLldpbmRvd3NQd3NoKTtcblx0XHRcdH0gZWxzZSBpZiAoYXJlUHdzaExvZ2luQXJncyhvcmlnaW5hbEFyZ3MpKSB7XG5cdFx0XHRcdG5ld0FyZ3MgPSBzaGVsbEludGVncmF0aW9uQXJncy5nZXQoU2hlbGxJbnRlZ3JhdGlvbkV4ZWN1dGFibGUuV2luZG93c1B3c2hMb2dpbik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW5ld0FyZ3MpIHtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2ZhaWx1cmUnLCByZWFzb246IFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlUmVhc29uLlVuc3VwcG9ydGVkQXJncyB9O1xuXHRcdFx0fVxuXHRcdFx0bmV3QXJncyA9IFsuLi5uZXdBcmdzXTtcblx0XHRcdG5ld0FyZ3NbbmV3QXJncy5sZW5ndGggLSAxXSA9IGZvcm1hdChuZXdBcmdzW25ld0FyZ3MubGVuZ3RoIC0gMV0sIHNoZWxsSW50ZWdyYXRpb25TY3JpcHRSb290LCAnJyk7XG5cdFx0XHRlbnZNaXhpblsnVlNDT0RFX1NUQUJMRSddID0gcHJvZHVjdFNlcnZpY2UucXVhbGl0eSA9PT0gJ3N0YWJsZScgPyAnMScgOiAnMCc7XG5cdFx0XHRyZXR1cm4geyB0eXBlLCBuZXdBcmdzLCBlbnZNaXhpbiB9O1xuXHRcdH0gZWxzZSBpZiAoc2hlbGwgPT09ICdiYXNoLmV4ZScpIHtcblx0XHRcdGlmICghb3JpZ2luYWxBcmdzIHx8IG9yaWdpbmFsQXJncy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0bmV3QXJncyA9IHNoZWxsSW50ZWdyYXRpb25BcmdzLmdldChTaGVsbEludGVncmF0aW9uRXhlY3V0YWJsZS5CYXNoKTtcblx0XHRcdH0gZWxzZSBpZiAoYXJlWnNoQmFzaEZpc2hMb2dpbkFyZ3Mob3JpZ2luYWxBcmdzKSkge1xuXHRcdFx0XHRlbnZNaXhpblsnVlNDT0RFX1NIRUxMX0xPR0lOJ10gPSAnMSc7XG5cdFx0XHRcdGFkZEVudk1peGluUGF0aFByZWZpeChvcHRpb25zLCBlbnZNaXhpbiwgc2hlbGwpO1xuXHRcdFx0XHRuZXdBcmdzID0gc2hlbGxJbnRlZ3JhdGlvbkFyZ3MuZ2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLkJhc2gpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFuZXdBcmdzKSB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGU6ICdmYWlsdXJlJywgcmVhc29uOiBTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZVJlYXNvbi5VbnN1cHBvcnRlZEFyZ3MgfTtcblx0XHRcdH1cblx0XHRcdG5ld0FyZ3MgPSBbLi4ubmV3QXJnc107IC8vIFNoYWxsb3cgY2xvbmUgdGhlIGFycmF5IHRvIGF2b2lkIHNldHRpbmcgdGhlIGRlZmF1bHQgYXJyYXlcblx0XHRcdG5ld0FyZ3NbbmV3QXJncy5sZW5ndGggLSAxXSA9IGZvcm1hdChuZXdBcmdzW25ld0FyZ3MubGVuZ3RoIC0gMV0sIHNoZWxsSW50ZWdyYXRpb25TY3JpcHRSb290KTtcblx0XHRcdGVudk1peGluWydWU0NPREVfU1RBQkxFJ10gPSBwcm9kdWN0U2VydmljZS5xdWFsaXR5ID09PSAnc3RhYmxlJyA/ICcxJyA6ICcwJztcblx0XHRcdHJldHVybiB7IHR5cGUsIG5ld0FyZ3MsIGVudk1peGluIH07XG5cdFx0fVxuXHRcdGxvZ1NlcnZpY2Uud2FybihgU2hlbGwgaW50ZWdyYXRpb24gY2Fubm90IGJlIGVuYWJsZWQgZm9yIGV4ZWN1dGFibGUgXCIke3NoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGV9XCIgYW5kIGFyZ3NgLCBzaGVsbExhdW5jaENvbmZpZy5hcmdzKTtcblx0XHRyZXR1cm4geyB0eXBlOiAnZmFpbHVyZScsIHJlYXNvbjogU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb24uVW5zdXBwb3J0ZWRTaGVsbCB9O1xuXHR9XG5cblx0Ly8gTGludXggJiBtYWNPU1xuXHRzd2l0Y2ggKHNoZWxsKSB7XG5cdFx0Y2FzZSAnYmFzaCc6IHtcblx0XHRcdGlmICghb3JpZ2luYWxBcmdzIHx8IG9yaWdpbmFsQXJncy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0bmV3QXJncyA9IHNoZWxsSW50ZWdyYXRpb25BcmdzLmdldChTaGVsbEludGVncmF0aW9uRXhlY3V0YWJsZS5CYXNoKTtcblx0XHRcdH0gZWxzZSBpZiAoYXJlWnNoQmFzaEZpc2hMb2dpbkFyZ3Mob3JpZ2luYWxBcmdzKSkge1xuXHRcdFx0XHRlbnZNaXhpblsnVlNDT0RFX1NIRUxMX0xPR0lOJ10gPSAnMSc7XG5cdFx0XHRcdGFkZEVudk1peGluUGF0aFByZWZpeChvcHRpb25zLCBlbnZNaXhpbiwgc2hlbGwpO1xuXHRcdFx0XHRuZXdBcmdzID0gc2hlbGxJbnRlZ3JhdGlvbkFyZ3MuZ2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLkJhc2gpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFuZXdBcmdzKSB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGU6ICdmYWlsdXJlJywgcmVhc29uOiBTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZVJlYXNvbi5VbnN1cHBvcnRlZEFyZ3MgfTtcblx0XHRcdH1cblx0XHRcdG5ld0FyZ3MgPSBbLi4ubmV3QXJnc107IC8vIFNoYWxsb3cgY2xvbmUgdGhlIGFycmF5IHRvIGF2b2lkIHNldHRpbmcgdGhlIGRlZmF1bHQgYXJyYXlcblx0XHRcdG5ld0FyZ3NbbmV3QXJncy5sZW5ndGggLSAxXSA9IGZvcm1hdChuZXdBcmdzW25ld0FyZ3MubGVuZ3RoIC0gMV0sIHNoZWxsSW50ZWdyYXRpb25TY3JpcHRSb290KTtcblx0XHRcdGVudk1peGluWydWU0NPREVfU1RBQkxFJ10gPSBwcm9kdWN0U2VydmljZS5xdWFsaXR5ID09PSAnc3RhYmxlJyA/ICcxJyA6ICcwJztcblx0XHRcdHJldHVybiB7IHR5cGUsIG5ld0FyZ3MsIGVudk1peGluIH07XG5cdFx0fVxuXHRcdGNhc2UgJ2Zpc2gnOiB7XG5cdFx0XHRpZiAoIW9yaWdpbmFsQXJncyB8fCBvcmlnaW5hbEFyZ3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdG5ld0FyZ3MgPSBzaGVsbEludGVncmF0aW9uQXJncy5nZXQoU2hlbGxJbnRlZ3JhdGlvbkV4ZWN1dGFibGUuRmlzaCk7XG5cdFx0XHR9IGVsc2UgaWYgKGFyZVpzaEJhc2hGaXNoTG9naW5BcmdzKG9yaWdpbmFsQXJncykpIHtcblx0XHRcdFx0bmV3QXJncyA9IHNoZWxsSW50ZWdyYXRpb25BcmdzLmdldChTaGVsbEludGVncmF0aW9uRXhlY3V0YWJsZS5GaXNoTG9naW4pO1xuXHRcdFx0fSBlbHNlIGlmIChvcmlnaW5hbEFyZ3MgPT09IHNoZWxsSW50ZWdyYXRpb25BcmdzLmdldChTaGVsbEludGVncmF0aW9uRXhlY3V0YWJsZS5GaXNoKSB8fCBvcmlnaW5hbEFyZ3MgPT09IHNoZWxsSW50ZWdyYXRpb25BcmdzLmdldChTaGVsbEludGVncmF0aW9uRXhlY3V0YWJsZS5GaXNoTG9naW4pKSB7XG5cdFx0XHRcdG5ld0FyZ3MgPSBvcmlnaW5hbEFyZ3M7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW5ld0FyZ3MpIHtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2ZhaWx1cmUnLCByZWFzb246IFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlUmVhc29uLlVuc3VwcG9ydGVkQXJncyB9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPbiBmaXNoLCAnJGZpc2hfdXNlcl9wYXRocycgaXMgYWx3YXlzIHByZXBlbmRlZCB0byB0aGUgUEFUSCwgZm9yIGJvdGggbG9naW4gYW5kIG5vbi1sb2dpbiBzaGVsbHMsIHNvIHdlIG5lZWRcblx0XHRcdC8vIHRvIGFwcGx5IHRoZSBwYXRoIHByZWZpeCBmaXggYWx3YXlzLCBub3Qgb25seSBmb3IgbG9naW4gc2hlbGxzIChzZWUgIzIzMjI5MSlcblx0XHRcdGFkZEVudk1peGluUGF0aFByZWZpeChvcHRpb25zLCBlbnZNaXhpbiwgc2hlbGwpO1xuXG5cdFx0XHRuZXdBcmdzID0gWy4uLm5ld0FyZ3NdOyAvLyBTaGFsbG93IGNsb25lIHRoZSBhcnJheSB0byBhdm9pZCBzZXR0aW5nIHRoZSBkZWZhdWx0IGFycmF5XG5cdFx0XHRuZXdBcmdzW25ld0FyZ3MubGVuZ3RoIC0gMV0gPSBmb3JtYXQobmV3QXJnc1tuZXdBcmdzLmxlbmd0aCAtIDFdLCBzaGVsbEludGVncmF0aW9uU2NyaXB0Um9vdCk7XG5cdFx0XHRyZXR1cm4geyB0eXBlLCBuZXdBcmdzLCBlbnZNaXhpbiB9O1xuXHRcdH1cblx0XHRjYXNlICdwd3NoJzoge1xuXHRcdFx0aWYgKCFvcmlnaW5hbEFyZ3MgfHwgYXJlUHdzaEltcGxpZWRBcmdzKG9yaWdpbmFsQXJncykpIHtcblx0XHRcdFx0bmV3QXJncyA9IHNoZWxsSW50ZWdyYXRpb25BcmdzLmdldChTaGVsbEludGVncmF0aW9uRXhlY3V0YWJsZS5Qd3NoKTtcblx0XHRcdH0gZWxzZSBpZiAoYXJlUHdzaExvZ2luQXJncyhvcmlnaW5hbEFyZ3MpKSB7XG5cdFx0XHRcdG5ld0FyZ3MgPSBzaGVsbEludGVncmF0aW9uQXJncy5nZXQoU2hlbGxJbnRlZ3JhdGlvbkV4ZWN1dGFibGUuUHdzaExvZ2luKTtcblx0XHRcdH1cblx0XHRcdGlmICghbmV3QXJncykge1xuXHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnZmFpbHVyZScsIHJlYXNvbjogU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb24uVW5zdXBwb3J0ZWRBcmdzIH07XG5cdFx0XHR9XG5cdFx0XHRuZXdBcmdzID0gWy4uLm5ld0FyZ3NdOyAvLyBTaGFsbG93IGNsb25lIHRoZSBhcnJheSB0byBhdm9pZCBzZXR0aW5nIHRoZSBkZWZhdWx0IGFycmF5XG5cdFx0XHRuZXdBcmdzW25ld0FyZ3MubGVuZ3RoIC0gMV0gPSBmb3JtYXQobmV3QXJnc1tuZXdBcmdzLmxlbmd0aCAtIDFdLCBzaGVsbEludGVncmF0aW9uU2NyaXB0Um9vdCwgJycpO1xuXHRcdFx0ZW52TWl4aW5bJ1ZTQ09ERV9TVEFCTEUnXSA9IHByb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgPT09ICdzdGFibGUnID8gJzEnIDogJzAnO1xuXHRcdFx0cmV0dXJuIHsgdHlwZSwgbmV3QXJncywgZW52TWl4aW4gfTtcblx0XHR9XG5cdFx0Y2FzZSAnenNoJzoge1xuXHRcdFx0aWYgKCFvcmlnaW5hbEFyZ3MgfHwgb3JpZ2luYWxBcmdzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRuZXdBcmdzID0gc2hlbGxJbnRlZ3JhdGlvbkFyZ3MuZ2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLlpzaCk7XG5cdFx0XHR9IGVsc2UgaWYgKGFyZVpzaEJhc2hGaXNoTG9naW5BcmdzKG9yaWdpbmFsQXJncykpIHtcblx0XHRcdFx0bmV3QXJncyA9IHNoZWxsSW50ZWdyYXRpb25BcmdzLmdldChTaGVsbEludGVncmF0aW9uRXhlY3V0YWJsZS5ac2hMb2dpbik7XG5cdFx0XHRcdGFkZEVudk1peGluUGF0aFByZWZpeChvcHRpb25zLCBlbnZNaXhpbiwgc2hlbGwpO1xuXHRcdFx0fSBlbHNlIGlmIChvcmlnaW5hbEFyZ3MgPT09IHNoZWxsSW50ZWdyYXRpb25BcmdzLmdldChTaGVsbEludGVncmF0aW9uRXhlY3V0YWJsZS5ac2gpIHx8IG9yaWdpbmFsQXJncyA9PT0gc2hlbGxJbnRlZ3JhdGlvbkFyZ3MuZ2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLlpzaExvZ2luKSkge1xuXHRcdFx0XHRuZXdBcmdzID0gb3JpZ2luYWxBcmdzO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFuZXdBcmdzKSB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGU6ICdmYWlsdXJlJywgcmVhc29uOiBTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZVJlYXNvbi5VbnN1cHBvcnRlZEFyZ3MgfTtcblx0XHRcdH1cblx0XHRcdG5ld0FyZ3MgPSBbLi4ubmV3QXJnc107IC8vIFNoYWxsb3cgY2xvbmUgdGhlIGFycmF5IHRvIGF2b2lkIHNldHRpbmcgdGhlIGRlZmF1bHQgYXJyYXlcblx0XHRcdG5ld0FyZ3NbbmV3QXJncy5sZW5ndGggLSAxXSA9IGZvcm1hdChuZXdBcmdzW25ld0FyZ3MubGVuZ3RoIC0gMV0sIHNoZWxsSW50ZWdyYXRpb25TY3JpcHRSb290KTtcblxuXHRcdFx0Ly8gTW92ZSAuenNocmMgaW50byAkWkRPVERJUiBhcyB0aGUgd2F5IHRvIGFjdGl2YXRlIHRoZSBzY3JpcHRcblx0XHRcdGxldCB1c2VybmFtZTogc3RyaW5nO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dXNlcm5hbWUgPSBvcy51c2VySW5mbygpLnVzZXJuYW1lO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHVzZXJuYW1lID0gJ3Vua25vd24nO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXNvbHZlIHRoZSBhY3R1YWwgdG1wIGRpcmVjdG9yeSBzbyB3ZSBjYW4gc2V0IHRoZSBzdGlja3kgYml0XG5cdFx0XHRjb25zdCByZWFsVG1wRGlyID0gcmVhbHBhdGhTeW5jKG9zLnRtcGRpcigpKTtcblx0XHRcdGNvbnN0IHpkb3RkaXIgPSBwYXRoLmpvaW4ocmVhbFRtcERpciwgYCR7dXNlcm5hbWV9LSR7cHJvZHVjdFNlcnZpY2UuYXBwbGljYXRpb25OYW1lfS16c2hgKTtcblxuXHRcdFx0Ly8gU2V0IGRpcmVjdG9yeSBwZXJtaXNzaW9ucyB1c2luZyBvY3RhbCBub3RhdGlvbjpcblx0XHRcdC8vIC0gMG8xNzAwOlxuXHRcdFx0Ly8gLSBTdGlja3kgYml0IGlzIHNldCwgcHJldmVudGluZyBub24tb3duZXJzIGZyb20gZGVsZXRpbmcgb3IgcmVuYW1pbmcgZmlsZXMgd2l0aGluIHRoaXMgZGlyZWN0b3J5ICgxKVxuXHRcdFx0Ly8gLSBPd25lciBoYXMgZnVsbCByZWFkICg0KSwgd3JpdGUgKDIpLCBleGVjdXRlICgxKSBwZXJtaXNzaW9uc1xuXHRcdFx0Ly8gLSBHcm91cCBoYXMgbm8gcGVybWlzc2lvbnMgKDApXG5cdFx0XHQvLyAtIE90aGVycyBoYXZlIG5vIHBlcm1pc3Npb25zICgwKVxuXHRcdFx0aWYgKCFza2lwU3RpY2t5Qml0KSB7XG5cdFx0XHRcdC8vIHNraXAgZm9yIHRlc3RzXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgY2htb2RBc3luYyA9IHByb21pc2lmeShjaG1vZCk7XG5cdFx0XHRcdFx0YXdhaXQgY2htb2RBc3luYyh6ZG90ZGlyLCAwbzE3MDApO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRpZiAoIWVyci5tZXNzYWdlLmluY2x1ZGVzKCdFTk9FTlQnKSkge1xuXHRcdFx0XHRcdFx0bG9nU2VydmljZS5lcnJvcihgRmFpbGVkIHRvIHNldCBzdGlja3kgYml0IG9uICR7emRvdGRpcn06ICR7ZXJyfWApO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2ZhaWx1cmUnLCByZWFzb246IFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlUmVhc29uLkZhaWxlZFRvU2V0U3RpY2t5Qml0IH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRta2RpclN5bmMoemRvdGRpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHRsb2dTZXJ2aWNlLmVycm9yKGBGYWlsZWQgdG8gY3JlYXRlIHpkb3RkaXIgYXQgJHt6ZG90ZGlyfTogJHtlcnJ9YCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnZmFpbHVyZScsIHJlYXNvbjogU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb24uRmFpbGVkVG9DcmVhdGVUbXBEaXIgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IGNobW9kQXN5bmMgPSBwcm9taXNpZnkoY2htb2QpO1xuXHRcdFx0XHRcdFx0YXdhaXQgY2htb2RBc3luYyh6ZG90ZGlyLCAwbzE3MDApO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0bG9nU2VydmljZS5lcnJvcihgRmFpbGVkIHRvIHNldCBzdGlja3kgYml0IG9uICR7emRvdGRpcn06ICR7ZXJyfWApO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2ZhaWx1cmUnLCByZWFzb246IFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlUmVhc29uLkZhaWxlZFRvU2V0U3RpY2t5Qml0IH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRlbnZNaXhpblsnWkRPVERJUiddID0gemRvdGRpcjtcblx0XHRcdGNvbnN0IHVzZXJaZG90ZGlyID0gZW52Py5aRE9URElSID8/IG9zLmhvbWVkaXIoKSA/PyBgfmA7XG5cdFx0XHRlbnZNaXhpblsnVVNFUl9aRE9URElSJ10gPSB1c2VyWmRvdGRpcjtcblx0XHRcdGNvbnN0IGZpbGVzVG9Db3B5OiBJU2hlbGxJbnRlZ3JhdGlvbkNvbmZpZ0luamVjdGlvblsnZmlsZXNUb0NvcHknXSA9IFtdO1xuXHRcdFx0ZmlsZXNUb0NvcHkucHVzaCh7XG5cdFx0XHRcdHNvdXJjZTogcGF0aC5qb2luKHNoZWxsSW50ZWdyYXRpb25TY3JpcHRSb290LCAnc2hlbGxJbnRlZ3JhdGlvbi1yYy56c2gnKSxcblx0XHRcdFx0ZGVzdDogcGF0aC5qb2luKHpkb3RkaXIsICcuenNocmMnKVxuXHRcdFx0fSk7XG5cdFx0XHRmaWxlc1RvQ29weS5wdXNoKHtcblx0XHRcdFx0c291cmNlOiBwYXRoLmpvaW4oc2hlbGxJbnRlZ3JhdGlvblNjcmlwdFJvb3QsICdzaGVsbEludGVncmF0aW9uLXByb2ZpbGUuenNoJyksXG5cdFx0XHRcdGRlc3Q6IHBhdGguam9pbih6ZG90ZGlyLCAnLnpwcm9maWxlJylcblx0XHRcdH0pO1xuXHRcdFx0ZmlsZXNUb0NvcHkucHVzaCh7XG5cdFx0XHRcdHNvdXJjZTogcGF0aC5qb2luKHNoZWxsSW50ZWdyYXRpb25TY3JpcHRSb290LCAnc2hlbGxJbnRlZ3JhdGlvbi1lbnYuenNoJyksXG5cdFx0XHRcdGRlc3Q6IHBhdGguam9pbih6ZG90ZGlyLCAnLnpzaGVudicpXG5cdFx0XHR9KTtcblx0XHRcdGZpbGVzVG9Db3B5LnB1c2goe1xuXHRcdFx0XHRzb3VyY2U6IHBhdGguam9pbihzaGVsbEludGVncmF0aW9uU2NyaXB0Um9vdCwgJ3NoZWxsSW50ZWdyYXRpb24tbG9naW4uenNoJyksXG5cdFx0XHRcdGRlc3Q6IHBhdGguam9pbih6ZG90ZGlyLCAnLnpsb2dpbicpXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB7IHR5cGUsIG5ld0FyZ3MsIGVudk1peGluLCBmaWxlc1RvQ29weSB9O1xuXHRcdH1cblx0fVxuXHRsb2dTZXJ2aWNlLndhcm4oYFNoZWxsIGludGVncmF0aW9uIGNhbm5vdCBiZSBlbmFibGVkIGZvciBleGVjdXRhYmxlIFwiJHtzaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlfVwiIGFuZCBhcmdzYCwgc2hlbGxMYXVuY2hDb25maWcuYXJncyk7XG5cdHJldHVybiB7IHR5cGU6ICdmYWlsdXJlJywgcmVhc29uOiBTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZVJlYXNvbi5VbnN1cHBvcnRlZFNoZWxsIH07XG59XG5cbi8qKlxuICogVGhlcmUgYXJlIGEgZmV3IHNpdHVhdGlvbnMgd2hlcmUgc29tZSBkaXJlY3RvcmllcyBhcmUgYWRkZWQgdG8gdGhlIGJlZ2lubmluZyBvZiB0aGUgUEFUSC5cbiAqIDEuIE9uIG1hY09TIHdoZW4gdGhlIHByb2ZpbGUgY2FsbHMgcGF0aF9oZWxwZXIuXG4gKiAyLiBGb3IgZmlzaCB0ZXJtaW5hbHMsIHdoaWNoIGFsd2F5cyBwcmVwZW5kIFwiJGZpc2hfdXNlcl9wYXRoc1wiIHRvIHRoZSBQQVRILlxuICpcbiAqIFRoaXMgY2F1c2VzIHNpZ25pZmljYW50IHByb2JsZW1zIGZvciB0aGUgZW52aXJvbm1lbnQgdmFyaWFibGVcbiAqIGNvbGxlY3Rpb24gQVBJIGFzIHRoZSBjdXN0b20gcGF0aHMgYWRkZWQgdG8gdGhlIGVuZCB3aWxsIG5vdyBiZSBzb21ld2hlcmUgaW4gdGhlIG1pZGRsZSBvZlxuICogdGhlIFBBVEguIFRvIGNvbWJhdCB0aGlzLCBWU0NPREVfUEFUSF9QUkVGSVggaXMgdXNlZCB0byByZS1hcHBseSBhbnkgcHJlZml4IGFmdGVyIHRoZSBwcm9maWxlXG4gKiBoYXMgcnVuLiBUaGlzIHdpbGwgY2F1c2UgZHVwbGljYXRpb24gaW4gdGhlIFBBVEggYnV0IHNob3VsZCBmaXggdGhlIGlzc3VlLlxuICpcbiAqIFNlZSAjOTk4NzggZm9yIG1vcmUgaW5mb3JtYXRpb24uXG4gKi9cbmZ1bmN0aW9uIGFkZEVudk1peGluUGF0aFByZWZpeChvcHRpb25zOiBJVGVybWluYWxQcm9jZXNzT3B0aW9ucywgZW52TWl4aW46IElQcm9jZXNzRW52aXJvbm1lbnQsIHNoZWxsOiBzdHJpbmcpOiB2b2lkIHtcblx0aWYgKChpc01hY2ludG9zaCB8fCBzaGVsbCA9PT0gJ2Zpc2gnKSAmJiBvcHRpb25zLmVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9ucykge1xuXHRcdC8vIERlc2VyaWFsaXplIGFuZCBtZXJnZVxuXHRcdGNvbnN0IGRlc2VyaWFsaXplZCA9IGRlc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25zKG9wdGlvbnMuZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25zKTtcblx0XHRjb25zdCBtZXJnZWQgPSBuZXcgTWVyZ2VkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oZGVzZXJpYWxpemVkKTtcblxuXHRcdC8vIEdldCBhbGwgcHJlcGVuZCBQQVRIIGVudHJpZXNcblx0XHRjb25zdCBwYXRoRW50cnkgPSBtZXJnZWQuZ2V0VmFyaWFibGVNYXAoeyB3b3Jrc3BhY2VGb2xkZXI6IG9wdGlvbnMud29ya3NwYWNlRm9sZGVyIH0pLmdldCgnUEFUSCcpO1xuXHRcdGNvbnN0IHByZXBlbmRUb1BhdGg6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKHBhdGhFbnRyeSkge1xuXHRcdFx0Zm9yIChjb25zdCBtdXRhdG9yIG9mIHBhdGhFbnRyeSkge1xuXHRcdFx0XHRpZiAobXV0YXRvci50eXBlID09PSBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUHJlcGVuZCkge1xuXHRcdFx0XHRcdHByZXBlbmRUb1BhdGgucHVzaChtdXRhdG9yLnZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFkZCB0byB0aGUgZW52aXJvbm1lbnQgbWl4aW4gdG8gYmUgYXBwbGllZCBpbiB0aGUgc2hlbGwgaW50ZWdyYXRpb24gc2NyaXB0XG5cdFx0aWYgKHByZXBlbmRUb1BhdGgubGVuZ3RoID4gMCkge1xuXHRcdFx0ZW52TWl4aW5bJ1ZTQ09ERV9QQVRIX1BSRUZJWCddID0gcHJlcGVuZFRvUGF0aC5qb2luKCcnKTtcblx0XHR9XG5cdH1cbn1cblxuZW51bSBTaGVsbEludGVncmF0aW9uRXhlY3V0YWJsZSB7XG5cdFdpbmRvd3NQd3NoID0gJ3dpbmRvd3MtcHdzaCcsXG5cdFdpbmRvd3NQd3NoTG9naW4gPSAnd2luZG93cy1wd3NoLWxvZ2luJyxcblx0UHdzaCA9ICdwd3NoJyxcblx0UHdzaExvZ2luID0gJ3B3c2gtbG9naW4nLFxuXHRac2ggPSAnenNoJyxcblx0WnNoTG9naW4gPSAnenNoLWxvZ2luJyxcblx0QmFzaCA9ICdiYXNoJyxcblx0RmlzaCA9ICdmaXNoJyxcblx0RmlzaExvZ2luID0gJ2Zpc2gtbG9naW4nLFxufVxuXG5jb25zdCBzaGVsbEludGVncmF0aW9uQXJnczogTWFwPFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLCBzdHJpbmdbXT4gPSBuZXcgTWFwKCk7XG4vLyBUaGUgdHJ5IGNhdGNoIHN3YWxsb3dzIGV4ZWN1dGlvbiBwb2xpY3kgZXJyb3JzIGluIHRoZSBjYXNlIG9mIHRoZSBhcmNoaXZlIGRpc3RyaWJ1dGFibGVcbnNoZWxsSW50ZWdyYXRpb25BcmdzLnNldChTaGVsbEludGVncmF0aW9uRXhlY3V0YWJsZS5XaW5kb3dzUHdzaCwgWyctbm9leGl0JywgJy1jb21tYW5kJywgJ3RyeSB7IC4gXFxcInswfVxcXFxzaGVsbEludGVncmF0aW9uLnBzMVxcXCIgfSBjYXRjaCB7fXsxfSddKTtcbnNoZWxsSW50ZWdyYXRpb25BcmdzLnNldChTaGVsbEludGVncmF0aW9uRXhlY3V0YWJsZS5XaW5kb3dzUHdzaExvZ2luLCBbJy1sJywgJy1ub2V4aXQnLCAnLWNvbW1hbmQnLCAndHJ5IHsgLiBcXFwiezB9XFxcXHNoZWxsSW50ZWdyYXRpb24ucHMxXFxcIiB9IGNhdGNoIHt9ezF9J10pO1xuc2hlbGxJbnRlZ3JhdGlvbkFyZ3Muc2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLlB3c2gsIFsnLW5vZXhpdCcsICctY29tbWFuZCcsICcuIFwiezB9L3NoZWxsSW50ZWdyYXRpb24ucHMxXCJ7MX0nXSk7XG5zaGVsbEludGVncmF0aW9uQXJncy5zZXQoU2hlbGxJbnRlZ3JhdGlvbkV4ZWN1dGFibGUuUHdzaExvZ2luLCBbJy1sJywgJy1ub2V4aXQnLCAnLWNvbW1hbmQnLCAnLiBcInswfS9zaGVsbEludGVncmF0aW9uLnBzMVwiJ10pO1xuc2hlbGxJbnRlZ3JhdGlvbkFyZ3Muc2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLlpzaCwgWyctaSddKTtcbnNoZWxsSW50ZWdyYXRpb25BcmdzLnNldChTaGVsbEludGVncmF0aW9uRXhlY3V0YWJsZS5ac2hMb2dpbiwgWyctaWwnXSk7XG5zaGVsbEludGVncmF0aW9uQXJncy5zZXQoU2hlbGxJbnRlZ3JhdGlvbkV4ZWN1dGFibGUuQmFzaCwgWyctLWluaXQtZmlsZScsICd7MH0vc2hlbGxJbnRlZ3JhdGlvbi1iYXNoLnNoJ10pO1xuc2hlbGxJbnRlZ3JhdGlvbkFyZ3Muc2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLkZpc2gsIFsnLS1pbml0LWNvbW1hbmQnLCAnc291cmNlIFwiezB9L3NoZWxsSW50ZWdyYXRpb24uZmlzaFwiJ10pO1xuc2hlbGxJbnRlZ3JhdGlvbkFyZ3Muc2V0KFNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlLkZpc2hMb2dpbiwgWyctbCcsICctLWluaXQtY29tbWFuZCcsICdzb3VyY2UgXCJ7MH0vc2hlbGxJbnRlZ3JhdGlvbi5maXNoXCInXSk7XG5jb25zdCBwd3NoTG9naW5BcmdzID0gWyctbG9naW4nLCAnLWwnXTtcbmNvbnN0IHNoTG9naW5BcmdzID0gWyctLWxvZ2luJywgJy1sJ107XG5jb25zdCBzaEludGVyYWN0aXZlQXJncyA9IFsnLWknLCAnLS1pbnRlcmFjdGl2ZSddO1xuY29uc3QgcHdzaEltcGxpZWRBcmdzID0gWyctbm9sJywgJy1ub2xvZ28nXTtcblxuZnVuY3Rpb24gYXJlUHdzaExvZ2luQXJncyhvcmlnaW5hbEFyZ3M6IFNpbmdsZU9yTWFueTxzdHJpbmc+KTogYm9vbGVhbiB7XG5cdGlmIChpc1N0cmluZyhvcmlnaW5hbEFyZ3MpKSB7XG5cdFx0cmV0dXJuIHB3c2hMb2dpbkFyZ3MuaW5jbHVkZXMob3JpZ2luYWxBcmdzLnRvTG93ZXJDYXNlKCkpO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBvcmlnaW5hbEFyZ3MubGVuZ3RoID09PSAxICYmIHB3c2hMb2dpbkFyZ3MuaW5jbHVkZXMob3JpZ2luYWxBcmdzWzBdLnRvTG93ZXJDYXNlKCkpIHx8XG5cdFx0XHQob3JpZ2luYWxBcmdzLmxlbmd0aCA9PT0gMiAmJlxuXHRcdFx0XHQoKChwd3NoTG9naW5BcmdzLmluY2x1ZGVzKG9yaWdpbmFsQXJnc1swXS50b0xvd2VyQ2FzZSgpKSkgfHwgcHdzaExvZ2luQXJncy5pbmNsdWRlcyhvcmlnaW5hbEFyZ3NbMV0udG9Mb3dlckNhc2UoKSkpKVxuXHRcdFx0XHQmJiAoKHB3c2hJbXBsaWVkQXJncy5pbmNsdWRlcyhvcmlnaW5hbEFyZ3NbMF0udG9Mb3dlckNhc2UoKSkpIHx8IHB3c2hJbXBsaWVkQXJncy5pbmNsdWRlcyhvcmlnaW5hbEFyZ3NbMV0udG9Mb3dlckNhc2UoKSkpKTtcblx0fVxufVxuXG5mdW5jdGlvbiBhcmVQd3NoSW1wbGllZEFyZ3Mob3JpZ2luYWxBcmdzOiBTaW5nbGVPck1hbnk8c3RyaW5nPik6IGJvb2xlYW4ge1xuXHRpZiAoaXNTdHJpbmcob3JpZ2luYWxBcmdzKSkge1xuXHRcdHJldHVybiBwd3NoSW1wbGllZEFyZ3MuaW5jbHVkZXMob3JpZ2luYWxBcmdzLnRvTG93ZXJDYXNlKCkpO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBvcmlnaW5hbEFyZ3MubGVuZ3RoID09PSAwIHx8IG9yaWdpbmFsQXJncz8ubGVuZ3RoID09PSAxICYmIHB3c2hJbXBsaWVkQXJncy5pbmNsdWRlcyhvcmlnaW5hbEFyZ3NbMF0udG9Mb3dlckNhc2UoKSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gYXJlWnNoQmFzaEZpc2hMb2dpbkFyZ3Mob3JpZ2luYWxBcmdzOiBTaW5nbGVPck1hbnk8c3RyaW5nPik6IGJvb2xlYW4ge1xuXHRpZiAoIWlzU3RyaW5nKG9yaWdpbmFsQXJncykpIHtcblx0XHRvcmlnaW5hbEFyZ3MgPSBvcmlnaW5hbEFyZ3MuZmlsdGVyKGFyZyA9PiAhc2hJbnRlcmFjdGl2ZUFyZ3MuaW5jbHVkZXMoYXJnLnRvTG93ZXJDYXNlKCkpKTtcblx0fVxuXHRyZXR1cm4gaXNTdHJpbmcob3JpZ2luYWxBcmdzKSAmJiBzaExvZ2luQXJncy5pbmNsdWRlcyhvcmlnaW5hbEFyZ3MudG9Mb3dlckNhc2UoKSlcblx0XHR8fCAhaXNTdHJpbmcob3JpZ2luYWxBcmdzKSAmJiBvcmlnaW5hbEFyZ3MubGVuZ3RoID09PSAxICYmIHNoTG9naW5BcmdzLmluY2x1ZGVzKG9yaWdpbmFsQXJnc1swXS50b0xvd2VyQ2FzZSgpKTtcbn1cblxuLyoqXG4gKiBQYXR0ZXJucyB0aGF0IGluZGljYXRlIHNlbnNpdGl2ZSBlbnZpcm9ubWVudCB2YXJpYWJsZSBuYW1lcy5cbiAqL1xuY29uc3Qgc2Vuc2l0aXZlRW52VmFyTmFtZXMgPSAvXig/Oi4qXyk/KD86QVBJXz9LRVl8VE9LRU58U0VDUkVUfFBBU1NXT1JEfFBBU1NXRHxQV0R8Q1JFREVOVElBTHxBVVRIfFBSSVZBVEVfP0tFWXxBQ0NFU1NfP0tFWXxDTElFTlRfP1NFQ1JFVHxBUElLRVkpKD86Xy4qKT8kL2k7XG5cbi8qKlxuICogUGF0dGVybnMgZm9yIGRldGVjdGluZyBzZWNyZXQgdmFsdWVzIGluIGVudmlyb25tZW50IHZhcmlhYmxlcy5cbiAqL1xuY29uc3Qgc2VjcmV0VmFsdWVQYXR0ZXJucyA9IFtcblx0Ly8gSldUIHRva2Vuc1xuXHQvXmV5SlthLXpBLVowLTlcXC1fXStcXC5bYS16QS1aMC05XFwtX10rXFwuW2EtekEtWjAtOVxcLV9dKyQvLFxuXHQvLyBHaXRIdWIgdG9rZW5zXG5cdC9eZ2hbcHN1cm9dX1thLXpBLVowLTldezM2fSQvLFxuXHQvXmdpdGh1Yl9wYXRfW2EtekEtWjAtOV17MjJ9X1thLXpBLVowLTldezU5fSQvLFxuXHQvLyBHb29nbGUgQVBJIGtleXNcblx0L15BSXphW0EtWmEtejAtOV9cXC1dezM1fSQvLFxuXHQvLyBTbGFjayB0b2tlbnNcblx0L154b3hbcGJhcl1cXC1bQS1aYS16MC05XFwtXSskLyxcblx0Ly8gQXp1cmUvTVMgdG9rZW5zIChjb21tb24gcGF0dGVybnMpXG5cdC9eW2EtekEtWjAtOV17MzIsfSQvLFxuXTtcblxuLyoqXG4gKiBTYW5pdGl6ZXMgZW52aXJvbm1lbnQgdmFyaWFibGVzIGZvciBsb2dnaW5nIGJ5IHJlZGFjdGluZyBzZW5zaXRpdmUgdmFsdWVzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2FuaXRpemVFbnZGb3JMb2dnaW5nKGVudjogSVByb2Nlc3NFbnZpcm9ubWVudCB8IHVuZGVmaW5lZCk6IElQcm9jZXNzRW52aXJvbm1lbnQgfCB1bmRlZmluZWQge1xuXHRpZiAoIWVudikge1xuXHRcdHJldHVybiBlbnY7XG5cdH1cblx0Y29uc3Qgc2FuaXRpemVkOiBJUHJvY2Vzc0Vudmlyb25tZW50ID0ge307XG5cdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGVudikpIHtcblx0XHRjb25zdCB2YWx1ZSA9IGVudltrZXldO1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIGtleSBuYW1lIHN1Z2dlc3RzIGEgc2Vuc2l0aXZlIHZhbHVlXG5cdFx0aWYgKHNlbnNpdGl2ZUVudlZhck5hbWVzLnRlc3Qoa2V5KSkge1xuXHRcdFx0c2FuaXRpemVkW2tleV0gPSAnPFJFREFDVEVEPic7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIHZhbHVlIG1hdGNoZXMga25vd24gc2VjcmV0IHBhdHRlcm5zXG5cdFx0bGV0IGlzU2VjcmV0ID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBwYXR0ZXJuIG9mIHNlY3JldFZhbHVlUGF0dGVybnMpIHtcblx0XHRcdGlmIChwYXR0ZXJuLnRlc3QodmFsdWUpKSB7XG5cdFx0XHRcdGlzU2VjcmV0ID0gdHJ1ZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHNhbml0aXplZFtrZXldID0gaXNTZWNyZXQgPyAnPFJFREFDVEVEPicgOiB2YWx1ZTtcblx0fVxuXHRyZXR1cm4gc2FuaXRpemVkO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsa0JBQWtCO0FBQzNCLFlBQVksVUFBVTtBQUN0QixTQUE4QixhQUFhLGlCQUFpQjtBQUM1RCxZQUFZLGFBQWE7QUFDekIsU0FBUyxjQUFjO0FBR3ZCLFNBQTRFLDhDQUE4QztBQUMxSCxTQUFTLHNDQUFzQztBQUMvQyxTQUFT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QWEsQ0FBQyxFQUFFLFlBQVksQ0FBQyxLQUFNLGdCQUFnQixTQUFTLGFBQWEsQ0FBQyxFQUFFLFlBQVksQ0FBQztBQUFBLEVBQzFIO0FBQ0Q7QUFFQSxTQUFTLG1CQUFtQixjQUE2QztBQUN4RSxNQUFJLFNBQVMsWUFBWSxHQUFHO0FBQzNCLFdBQU8sZ0JBQWdCLFNBQVMsYUFBYSxZQUFZLENBQUM7QUFBQSxFQUMzRCxPQUFPO0FBQ04sV0FBTyxhQUFhLFdBQVcsS0FBSyxjQUFjLFdBQVcsS0FBSyxnQkFBZ0IsU0FBUyxhQUFhLENBQUMsRUFBRSxZQUFZLENBQUM7QUFBQSxFQUN6SDtBQUNEO0FBRUEsU0FBUyx3QkFBd0IsY0FBNkM7QUFDN0UsTUFBSSxDQUFDLFNBQVMsWUFBWSxHQUFHO0FBQzVCLG1CQUFlLGFBQWEsT0FBTyxTQUFPLENBQUMsa0JBQWtCLFNBQVMsSUFBSSxZQUFZLENBQUMsQ0FBQztBQUFBLEVBQ3pGO0FBQ0EsU0FBTyxTQUFTLFlBQVksS0FBSyxZQUFZLFNBQVMsYUFBYSxZQUFZLENBQUMsS0FDNUUsQ0FBQyxTQUFTLFlBQVksS0FBSyxhQUFhLFdBQVcsS0FBSyxZQUFZLFNBQVMsYUFBYSxDQUFDLEVBQUUsWUFBWSxDQUFDO0FBQy9HO0FBS0EsTUFBTSx1QkFBdUI7QUFLN0IsTUFBTSxzQkFBc0I7QUFBQTtBQUFBLEVBRTNCO0FBQUE7QUFBQSxFQUVBO0FBQUEsRUFDQTtBQUFBO0FBQUEsRUFFQTtBQUFBO0FBQUEsRUFFQTtBQUFBO0FBQUEsRUFFQTtBQUNEO0FBS08sU0FBUyxzQkFBc0IsS0FBdUU7QUFDNUcsTUFBSSxDQUFDLEtBQUs7QUFDVCxXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sWUFBaUMsQ0FBQztBQUN4QyxhQUFXLE9BQU8sT0FBTyxLQUFLLEdBQUcsR0FBRztBQUNuQyxVQUFNLFFBQVEsSUFBSSxHQUFHO0FBQ3JCLFFBQUksVUFBVSxRQUFXO0FBQ3hCO0FBQUEsSUFDRDtBQUVBLFFBQUkscUJBQXFCLEtBQUssR0FBRyxHQUFHO0FBQ25DLGdCQUFVLEdBQUcsSUFBSTtBQUNqQjtBQUFBLElBQ0Q7QUFFQSxRQUFJLFdBQVc7QUFDZixlQUFXLFdBQVcscUJBQXFCO0FBQzFDLFVBQUksUUFBUSxLQUFLLEtBQUssR0FBRztBQUN4QixtQkFBVztBQUNYO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxjQUFVLEdBQUcsSUFBSSxXQUFXLGVBQWU7QUFBQSxFQUM1QztBQUNBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsiZXJyIiwgIlNoZWxsSW50ZWdyYXRpb25FeGVjdXRhYmxlIl0KfQo=
