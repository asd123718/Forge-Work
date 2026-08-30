import * as fs from "fs";
import * as cp from "child_process";
import { Codicon } from "../../../base/common/codicons.js";
import { basename, delimiter, normalize, dirname, resolve } from "../../../base/common/path.js";
import { isLinux, isWindows } from "../../../base/common/platform.js";
import { findExecutable } from "../../../base/node/processes.js";
import { hasKey, isObject, isString } from "../../../base/common/types.js";
import * as pfs from "../../../base/node/pfs.js";
import { enumeratePowerShellInstallations } from "../../../base/node/powershell.js";
import { ProfileSource, TerminalSettingId } from "../common/terminal.js";
import { getWindowsBuildNumberAsync } from "../../../base/node/windowsVersion.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2["UnixShellsPath"] = "/etc/shells";
  return Constants2;
})(Constants || {});
let profileSources;
let logIfWslNotInstalled = true;
function detectAvailableProfiles(profiles, defaultProfile, includeDetectedProfiles, configurationService, shellEnv = process.env, fsProvider, logService, variableResolver, testPwshSourcePaths) {
  fsProvider = fsProvider || {
    existsFile: pfs.SymlinkSupport.existsFile,
    readFile: fs.promises.readFile
  };
  if (isWindows) {
    return detectAvailableWindowsProfiles(
      includeDetectedProfiles,
      fsProvider,
      shellEnv,
      logService,
      configurationService.getValue(TerminalSettingId.UseWslProfiles) !== false,
      profiles && isObject(profiles) ? { ...profiles } : configurationService.getValue(TerminalSettingId.ProfilesWindows),
      isString(defaultProfile) ? defaultProfile : configurationService.getValue(TerminalSettingId.DefaultProfileWindows),
      testPwshSourcePaths,
      variableResolver
    );
  }
  return detectAvailableUnixProfiles(
    fsProvider,
    logService,
    includeDetectedProfiles,
    profiles && isObject(profiles) ? { ...profiles } : configurationService.getValue(isLinux ? TerminalSettingId.ProfilesLinux : TerminalSettingId.ProfilesMacOs),
    isString(defaultProfile) ? defaultProfile : configurationService.getValue(isLinux ? TerminalSettingId.DefaultProfileLinux : TerminalSettingId.DefaultProfileMacOs),
    testPwshSourcePaths,
    variableResolver,
    shellEnv
  );
}
async function detectAvailableWindowsProfiles(includeDetectedProfiles, fsProvider, shellEnv, logService, useWslProfiles, configProfiles, defaultProfileName, testPwshSourcePaths, variableResolver) {
  const is32ProcessOn64Windows = process.env.hasOwnProperty("PROCESSOR_ARCHITEW6432");
  const system32Path = `${process.env["windir"]}\\${is32ProcessOn64Windows ? "Sysnative" : "System32"}`;
  const allowWslDiscovery = await getWindowsBuildNumberAsync() >= 19041;
  await initializeWindowsProfiles(testPwshSourcePaths);
  const detectedProfiles = /* @__PURE__ */ new Map();
  if (includeDetectedProfiles) {
    detectedProfiles.set("PowerShell", {
      source: ProfileSource.Pwsh,
      icon: Codicon.terminalPowershell,
      isAutoDetected: true
    });
    detectedProfiles.set("Windows PowerShell", {
      path: `${system32Path}\\WindowsPowerShell\\v1.0\\powershell.exe`,
      icon: Codicon.terminalPowershell,
      isAutoDetected: true
    });
    detectedProfiles.set("Git Bash", {
      source: ProfileSource.GitBash,
      icon: Codicon.terminalGitBash,
      isAutoDetected: true
    });
    detectedProfiles.set("Command Prompt", {
      path: `${system32Path}\\cmd.exe`,
      icon: Codicon.terminalCmd,
      isAutoDetected: true
    });
    detectedProfiles.set("Cygwin", {
      path: [
        { path: `${process.env["HOMEDRIVE"]}\\cygwin64\\bin\\bash.exe`, isUnsafe: true },
        { path: `${process.env["HOMEDRIVE"]}\\cygwin\\bin\\bash.exe`, isUnsafe: true }
      ],
      args: ["--login"],
      isAutoDetected: true
    });
    detectedProfiles.set("bash (MSYS2)", {
      path: [
        { path: `${process.env["HOMEDRIVE"]}\\msys64\\usr\\bin\\bash.exe`, isUnsafe: true }
      ],
      args: ["--login", "-i"],
      // CHERE_INVOKING retains current working directory
      env: { CHERE_INVOKING: "1" },
      icon: Codicon.terminalBash,
      isAutoDetected: true
    });
    const cmderPath = `${process.env["CMDER_ROOT"] || `${process.env["HOMEDRIVE"]}\\cmder`}\\vendor\\bin\\vscode_init.cmd`;
    detectedProfiles.set("Cmder", {
      path: `${system32Path}\\cmd.exe`,
      args: ["/K", cmderPath],
      // The path is safe if it was derived from CMDER_ROOT
      requiresPath: process.env["CMDER_ROOT"] ? cmderPath : { path: cmderPath, isUnsafe: true },
      isAutoDetected: true
    });
  }
  applyConfigProfilesToMap(configProfiles, detectedProfiles);
  const resultProfiles = await transformToTerminalProfiles(detectedProfiles.entries(), defaultProfileName, fsProvider, shellEnv, logService, variableResolver);
  if (includeDetectedProfiles && useWslProfiles && allowWslDiscovery) {
    try {
      const result = await getWslProfiles(`${system32Path}\\wsl.exe`, defaultProfileName);
      for (const wslProfile of result) {
        if (!configProfiles || !Object.prototype.hasOwnProperty.call(configProfiles, wslProfile.profileName)) {
          resultProfiles.push(wslProfile);
        }
      }
    } catch (e) {
      if (logIfWslNotInstalled) {
        logService?.trace("WSL is not installed, so could not detect WSL profiles");
        logIfWslNotInstalled = false;
      }
    }
  }
  return resultProfiles;
}
async function transformToTerminalProfiles(entries, defaultProfileName, fsProvider, shellEnv = process.env, logService, variableResolver) {
  const promises = [];
  for (const [profileName, profile] of entries) {
    promises.push(getValidatedProfile(profileName, profile, defaultProfileName, fsProvider, shellEnv, logService, variableResolver));
  }
  return (await Promise.all(promises)).filter((e) => !!e);
}
async function getValidatedProfile(profileName, profile, defaultProfileName, fsProvider, shellEnv = process.env, logService, variableResolver) {
  if (profile === null) {
    return void 0;
  }
  let originalPaths;
  let args;
  let icon = void 0;
  if (hasKey(profile, { source: true })) {
    const source = profileSources?.get(profile.source);
    if (!source) {
      return void 0;
    }
    originalPaths = source.paths;
    args = profile.args || source.args;
    if (profile.icon) {
      icon = validateIcon(profile.icon);
    } else if (source.icon) {
      icon = source.icon;
    }
  } else {
    originalPaths = Array.isArray(profile.path) ? profile.path : [profile.path];
    args = isWindows ? profile.args : Array.isArray(profile.args) ? profile.args : void 0;
    icon = validateIcon(profile.icon);
  }
  let paths;
  if (variableResolver) {
    const mapped = originalPaths.map((e) => isString(e) ? e : e.path);
    const resolved = await variableResolver(mapped);
    paths = new Array(originalPaths.length);
    for (let i = 0; i < originalPaths.length; i++) {
      if (isString(originalPaths[i])) {
        paths[i] = resolved[i];
      } else {
        paths[i] = {
          path: resolved[i],
          isUnsafe: true
        };
      }
    }
  } else {
    paths = originalPaths.slice();
  }
  let requiresUnsafePath;
  if (profile.requiresPath) {
    let actualRequiredPath;
    if (isString(profile.requiresPath)) {
      actualRequiredPath = profile.requiresPath;
    } else {
      actualRequiredPath = profile.requiresPath.path;
      if (profile.requiresPath.isUnsafe) {
        requiresUnsafePath = actualRequiredPath;
      }
    }
    const result = await fsProvider.existsFile(actualRequiredPath);
    if (!result) {
      return;
    }
  }
  const validatedProfile = await validateProfilePaths(profileName, defaultProfileName, paths, fsProvider, shellEnv, args, profile.env, profile.overrideName, profile.isAutoDetected, requiresUnsafePath);
  if (!validatedProfile) {
    logService?.debug("Terminal profile not validated", profileName, originalPaths);
    return void 0;
  }
  validatedProfile.isAutoDetected = profile.isAutoDetected;
  validatedProfile.icon = icon;
  validatedProfile.color = profile.color;
  return validatedProfile;
}
function validateIcon(icon) {
  if (isString(icon)) {
    return { id: icon };
  }
  return icon;
}
async function initializeWindowsProfiles(testPwshSourcePaths) {
  if (profileSources && !testPwshSourcePaths) {
    return;
  }
  const [gitBashPaths, pwshPaths] = await Promise.all([getGitBashPaths(), testPwshSourcePaths || getPowershellPaths()]);
  profileSources = /* @__PURE__ */ new Map();
  profileSources.set(
    ProfileSource.GitBash,
    {
      profileName: "Git Bash",
      paths: gitBashPaths,
      args: ["--login", "-i"]
    }
  );
  profileSources.set(ProfileSource.Pwsh, {
    profileName: "PowerShell",
    paths: pwshPaths,
    icon: Codicon.terminalPowershell
  });
}
async function getGitBashPaths() {
  const gitDirs = /* @__PURE__ */ new Set();
  const gitExePath = await findExecutable("git.exe");
  if (gitExePath) {
    const gitExeDir = dirname(gitExePath);
    gitDirs.add(resolve(gitExeDir, "../.."));
  }
  function addTruthy(set, value) {
    if (value) {
      set.add(value);
    }
  }
  addTruthy(gitDirs, process.env["ProgramW6432"]);
  addTruthy(gitDirs, process.env["ProgramFiles"]);
  addTruthy(gitDirs, process.env["ProgramFiles(X86)"]);
  addTruthy(gitDirs, `${process.env["LocalAppData"]}\\Program`);
  const gitBashPaths = [];
  for (const gitDir of gitDirs) {
    gitBashPaths.push(
      `${gitDir}\\Git\\bin\\bash.exe`,
      `${gitDir}\\Git\\usr\\bin\\bash.exe`,
      `${gitDir}\\usr\\bin\\bash.exe`
      // using Git for Windows SDK
    );
  }
  gitBashPaths.push(`${process.env["UserProfile"]}\\scoop\\apps\\git\\current\\bin\\bash.exe`);
  gitBashPaths.push(`${process.env["UserProfile"]}\\scoop\\apps\\git-with-openssh\\current\\bin\\bash.exe`);
  return gitBashPaths;
}
async function getPowershellPaths() {
  const paths = [];
  for await (const pwshExe of enumeratePowerShellInstallations()) {
    paths.push(pwshExe.exePath);
  }
  return paths;
}
async function getWslProfiles(wslPath, defaultProfileName) {
  const profiles = [];
  const distroOutput = await new Promise((resolve2, reject) => {
    cp.exec("wsl.exe -l -q", { encoding: "utf16le", env: { ...process.env, WSL_UTF8: "0" }, timeout: 1e3 }, (err, stdout) => {
      if (err) {
        return reject("Problem occurred when getting wsl distros");
      }
      resolve2(stdout);
    });
  });
  if (!distroOutput) {
    return [];
  }
  const distroNames = distroOutput.split(/\r?\n/).filter((t) => t.trim().length > 0);
  for (const distroName of distroNames) {
    if (distroName === "") {
      continue;
    }
    if (distroName.startsWith("docker-desktop")) {
      continue;
    }
    const profileName = `${distroName} (WSL)`;
    const profile = {
      profileName,
      path: wslPath,
      args: [`-d`, `${distroName}`],
      isDefault: profileName === defaultProfileName,
      icon: getWslIcon(distroName),
      isAutoDetected: false
    };
    profiles.push(profile);
  }
  return profiles;
}
function getWslIcon(distroName) {
  if (distroName.includes("Ubuntu")) {
    return Codicon.terminalUbuntu;
  } else if (distroName.includes("Debian")) {
    return Codicon.terminalDebian;
  } else {
    return Codicon.terminalLinux;
  }
}
async function detectAvailableUnixProfiles(fsProvider, logService, includeDetectedProfiles, configProfiles, defaultProfileName, testPaths, variableResolver, shellEnv) {
  const detectedProfiles = /* @__PURE__ */ new Map();
  if (includeDetectedProfiles && await fsProvider.existsFile("/etc/shells" /* UnixShellsPath */)) {
    const contents = (await fsProvider.readFile("/etc/shells" /* UnixShellsPath */)).toString();
    const profiles = (testPaths || contents.split("\n")).map((e) => {
      const index = e.indexOf("#");
      return index === -1 ? e : e.substring(0, index);
    }).filter((e) => e.trim().length > 0);
    const counts = /* @__PURE__ */ new Map();
    for (const profile of profiles) {
      let profileName = basename(profile);
      let count = counts.get(profileName) || 0;
      count++;
      if (count > 1) {
        profileName = `${profileName} (${count})`;
      }
      counts.set(profileName, count);
      detectedProfiles.set(profileName, { path: profile, isAutoDetected: true });
    }
  }
  applyConfigProfilesToMap(configProfiles, detectedProfiles);
  return await transformToTerminalProfiles(detectedProfiles.entries(), defaultProfileName, fsProvider, shellEnv, logService, variableResolver);
}
function applyConfigProfilesToMap(configProfiles, profilesMap) {
  if (!configProfiles) {
    return;
  }
  for (const [profileName, value] of Object.entries(configProfiles)) {
    if (value === null || !isObject(value) || !hasKey(value, { path: true }) && !hasKey(value, { source: true })) {
      profilesMap.delete(profileName);
    } else {
      value.icon = value.icon || profilesMap.get(profileName)?.icon;
      profilesMap.set(profileName, value);
    }
  }
}
async function validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args, env, overrideName, isAutoDetected, requiresUnsafePath) {
  if (potentialPaths.length === 0) {
    return Promise.resolve(void 0);
  }
  const path = potentialPaths.shift();
  if (path === "") {
    return validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args, env, overrideName, isAutoDetected);
  }
  const isUnsafePath = !isString(path) && path.isUnsafe;
  const actualPath = isString(path) ? path : path.path;
  const profile = {
    profileName,
    path: actualPath,
    args,
    env,
    overrideName,
    isAutoDetected,
    isDefault: profileName === defaultProfileName,
    isUnsafePath,
    requiresUnsafePath
  };
  if (basename(actualPath) === actualPath) {
    const envPaths = shellEnv.PATH ? shellEnv.PATH.split(delimiter) : void 0;
    const executable = await findExecutable(actualPath, void 0, envPaths, void 0, fsProvider.existsFile);
    if (!executable) {
      return validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args);
    }
    profile.path = executable;
    profile.isFromPath = true;
    return profile;
  }
  const result = await fsProvider.existsFile(normalize(actualPath));
  if (result) {
    return profile;
  }
  return validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args, env, overrideName, isAutoDetected);
}
export {
  detectAvailableProfiles
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXG5vZGVcXHRlcm1pbmFsUHJvZmlsZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBjcCBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGVsaW1pdGVyLCBub3JtYWxpemUsIGRpcm5hbWUsIHJlc29sdmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzTGludXgsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGZpbmRFeGVjdXRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3Byb2Nlc3Nlcy5qcyc7XG5pbXBvcnQgeyBoYXNLZXksIGlzT2JqZWN0LCBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBwZnMgZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3Bmcy5qcyc7XG5pbXBvcnQgeyBlbnVtZXJhdGVQb3dlclNoZWxsSW5zdGFsbGF0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9wb3dlcnNoZWxsLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxFbnZpcm9ubWVudCwgSVRlcm1pbmFsRXhlY3V0YWJsZSwgSVRlcm1pbmFsUHJvZmlsZSwgSVRlcm1pbmFsUHJvZmlsZVNvdXJjZSwgSVRlcm1pbmFsVW5zYWZlUGF0aCwgUHJvZmlsZVNvdXJjZSwgVGVybWluYWxJY29uLCBUZXJtaW5hbFNldHRpbmdJZCB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgZ2V0V2luZG93c0J1aWxkTnVtYmVyQXN5bmMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvd2luZG93c1ZlcnNpb24uanMnO1xuXG5jb25zdCBlbnVtIENvbnN0YW50cyB7XG5cdFVuaXhTaGVsbHNQYXRoID0gJy9ldGMvc2hlbGxzJ1xufVxuXG5sZXQgcHJvZmlsZVNvdXJjZXM6IE1hcDxzdHJpbmcsIElQb3RlbnRpYWxUZXJtaW5hbFByb2ZpbGU+IHwgdW5kZWZpbmVkO1xubGV0IGxvZ0lmV3NsTm90SW5zdGFsbGVkOiBib29sZWFuID0gdHJ1ZTtcblxuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdEF2YWlsYWJsZVByb2ZpbGVzKFxuXHRwcm9maWxlczogdW5rbm93bixcblx0ZGVmYXVsdFByb2ZpbGU6IHVua25vd24sXG5cdGluY2x1ZGVEZXRlY3RlZFByb2ZpbGVzOiBib29sZWFuLFxuXHRjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRzaGVsbEVudjogdHlwZW9mIHByb2Nlc3MuZW52ID0gcHJvY2Vzcy5lbnYsXG5cdGZzUHJvdmlkZXI/OiBJRnNQcm92aWRlcixcblx0bG9nU2VydmljZT86IElMb2dTZXJ2aWNlLFxuXHR2YXJpYWJsZVJlc29sdmVyPzogKHRleHQ6IHN0cmluZ1tdKSA9PiBQcm9taXNlPHN0cmluZ1tdPixcblx0dGVzdFB3c2hTb3VyY2VQYXRocz86IHN0cmluZ1tdXG4pOiBQcm9taXNlPElUZXJtaW5hbFByb2ZpbGVbXT4ge1xuXHRmc1Byb3ZpZGVyID0gZnNQcm92aWRlciB8fCB7XG5cdFx0ZXhpc3RzRmlsZTogcGZzLlN5bWxpbmtTdXBwb3J0LmV4aXN0c0ZpbGUsXG5cdFx0cmVhZEZpbGU6IGZzLnByb21pc2VzLnJlYWRGaWxlXG5cdH07XG5cdGlmIChpc1dpbmRvd3MpIHtcblx0XHRyZXR1cm4gZGV0ZWN0QXZhaWxhYmxlV2luZG93c1Byb2ZpbGVzKFxuXHRcdFx0aW5jbHVkZURldGVjdGVkUHJvZmlsZXMsXG5cdFx0XHRmc1Byb3ZpZGVyLFxuXHRcdFx0c2hlbGxFbnYsXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuVXNlV3NsUHJvZmlsZXMpICE9PSBmYWxzZSxcblx0XHRcdHByb2ZpbGVzICYmIGlzT2JqZWN0KHByb2ZpbGVzKSA/IHsgLi4ucHJvZmlsZXMgfSA6IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHsgW2tleTogc3RyaW5nXTogSVVucmVzb2x2ZWRUZXJtaW5hbFByb2ZpbGUgfT4oVGVybWluYWxTZXR0aW5nSWQuUHJvZmlsZXNXaW5kb3dzKSxcblx0XHRcdGlzU3RyaW5nKGRlZmF1bHRQcm9maWxlKSA/IGRlZmF1bHRQcm9maWxlIDogY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihUZXJtaW5hbFNldHRpbmdJZC5EZWZhdWx0UHJvZmlsZVdpbmRvd3MpLFxuXHRcdFx0dGVzdFB3c2hTb3VyY2VQYXRocyxcblx0XHRcdHZhcmlhYmxlUmVzb2x2ZXJcblx0XHQpO1xuXHR9XG5cdHJldHVybiBkZXRlY3RBdmFpbGFibGVVbml4UHJvZmlsZXMoXG5cdFx0ZnNQcm92aWRlcixcblx0XHRsb2dTZXJ2aWNlLFxuXHRcdGluY2x1ZGVEZXRlY3RlZFByb2ZpbGVzLFxuXHRcdHByb2ZpbGVzICYmIGlzT2JqZWN0KHByb2ZpbGVzKSA/IHsgLi4ucHJvZmlsZXMgfSA6IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHsgW2tleTogc3RyaW5nXTogSVVucmVzb2x2ZWRUZXJtaW5hbFByb2ZpbGUgfT4oaXNMaW51eCA/IFRlcm1pbmFsU2V0dGluZ0lkLlByb2ZpbGVzTGludXggOiBUZXJtaW5hbFNldHRpbmdJZC5Qcm9maWxlc01hY09zKSxcblx0XHRpc1N0cmluZyhkZWZhdWx0UHJvZmlsZSkgPyBkZWZhdWx0UHJvZmlsZSA6IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oaXNMaW51eCA/IFRlcm1pbmFsU2V0dGluZ0lkLkRlZmF1bHRQcm9maWxlTGludXggOiBUZXJtaW5hbFNldHRpbmdJZC5EZWZhdWx0UHJvZmlsZU1hY09zKSxcblx0XHR0ZXN0UHdzaFNvdXJjZVBhdGhzLFxuXHRcdHZhcmlhYmxlUmVzb2x2ZXIsXG5cdFx0c2hlbGxFbnZcblx0KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZGV0ZWN0QXZhaWxhYmxlV2luZG93c1Byb2ZpbGVzKFxuXHRpbmNsdWRlRGV0ZWN0ZWRQcm9maWxlczogYm9vbGVhbixcblx0ZnNQcm92aWRlcjogSUZzUHJvdmlkZXIsXG5cdHNoZWxsRW52OiB0eXBlb2YgcHJvY2Vzcy5lbnYsXG5cdGxvZ1NlcnZpY2U/OiBJTG9nU2VydmljZSxcblx0dXNlV3NsUHJvZmlsZXM/OiBib29sZWFuLFxuXHRjb25maWdQcm9maWxlcz86IHsgW2tleTogc3RyaW5nXTogSVVucmVzb2x2ZWRUZXJtaW5hbFByb2ZpbGUgfSxcblx0ZGVmYXVsdFByb2ZpbGVOYW1lPzogc3RyaW5nLFxuXHR0ZXN0UHdzaFNvdXJjZVBhdGhzPzogc3RyaW5nW10sXG5cdHZhcmlhYmxlUmVzb2x2ZXI/OiAodGV4dDogc3RyaW5nW10pID0+IFByb21pc2U8c3RyaW5nW10+XG4pOiBQcm9taXNlPElUZXJtaW5hbFByb2ZpbGVbXT4ge1xuXHQvLyBEZXRlcm1pbmUgdGhlIGNvcnJlY3QgU3lzdGVtMzIgcGF0aC4gV2Ugd2FudCB0byBwb2ludCB0byBTeXNuYXRpdmVcblx0Ly8gd2hlbiB0aGUgMzItYml0IHZlcnNpb24gb2YgVlMgQ29kZSBpcyBydW5uaW5nIG9uIGEgNjQtYml0IG1hY2hpbmUuXG5cdC8vIFRoZSByZWFzb24gZm9yIHRoaXMgaXMgYmVjYXVzZSBQb3dlclNoZWxsJ3MgaW1wb3J0YW50IFBTUmVhZGxpbmVcblx0Ly8gbW9kdWxlIGRvZXNuJ3Qgd29yayBpZiB0aGlzIGlzIG5vdCB0aGUgY2FzZS4gU2VlICMyNzkxNS5cblx0Y29uc3QgaXMzMlByb2Nlc3NPbjY0V2luZG93cyA9IHByb2Nlc3MuZW52Lmhhc093blByb3BlcnR5KCdQUk9DRVNTT1JfQVJDSElURVc2NDMyJyk7XG5cdGNvbnN0IHN5c3RlbTMyUGF0aCA9IGAke3Byb2Nlc3MuZW52Wyd3aW5kaXInXX1cXFxcJHtpczMyUHJvY2Vzc09uNjRXaW5kb3dzID8gJ1N5c25hdGl2ZScgOiAnU3lzdGVtMzInfWA7XG5cblx0Ly8gV1NMIDIgcmVsZWFzZWQgaW4gdGhlIE1heSAyMDIwIFVwZGF0ZSwgdGhpcyBpcyB3aGVyZSB0aGUgYC1kYCBmbGFnIHdhcyBhZGRlZCB0aGF0IHdlIGRlcGVuZFxuXHQvLyB1cG9uXG5cdGNvbnN0IGFsbG93V3NsRGlzY292ZXJ5ID0gYXdhaXQgZ2V0V2luZG93c0J1aWxkTnVtYmVyQXN5bmMoKSA+PSAxOTA0MTtcblxuXHRhd2FpdCBpbml0aWFsaXplV2luZG93c1Byb2ZpbGVzKHRlc3RQd3NoU291cmNlUGF0aHMpO1xuXG5cdGNvbnN0IGRldGVjdGVkUHJvZmlsZXM6IE1hcDxzdHJpbmcsIElVbnJlc29sdmVkVGVybWluYWxQcm9maWxlPiA9IG5ldyBNYXAoKTtcblxuXHQvLyBBZGQgYXV0byBkZXRlY3RlZCBwcm9maWxlc1xuXHRpZiAoaW5jbHVkZURldGVjdGVkUHJvZmlsZXMpIHtcblx0XHRkZXRlY3RlZFByb2ZpbGVzLnNldCgnUG93ZXJTaGVsbCcsIHtcblx0XHRcdHNvdXJjZTogUHJvZmlsZVNvdXJjZS5Qd3NoLFxuXHRcdFx0aWNvbjogQ29kaWNvbi50ZXJtaW5hbFBvd2Vyc2hlbGwsXG5cdFx0XHRpc0F1dG9EZXRlY3RlZDogdHJ1ZVxuXHRcdH0pO1xuXHRcdGRldGVjdGVkUHJvZmlsZXMuc2V0KCdXaW5kb3dzIFBvd2VyU2hlbGwnLCB7XG5cdFx0XHRwYXRoOiBgJHtzeXN0ZW0zMlBhdGh9XFxcXFdpbmRvd3NQb3dlclNoZWxsXFxcXHYxLjBcXFxccG93ZXJzaGVsbC5leGVgLFxuXHRcdFx0aWNvbjogQ29kaWNvbi50ZXJtaW5hbFBvd2Vyc2hlbGwsXG5cdFx0XHRpc0F1dG9EZXRlY3RlZDogdHJ1ZVxuXHRcdH0pO1xuXHRcdGRldGVjdGVkUHJvZmlsZXMuc2V0KCdHaXQgQmFzaCcsIHtcblx0XHRcdHNvdXJjZTogUHJvZmlsZVNvdXJjZS5HaXRCYXNoLFxuXHRcdFx0aWNvbjogQ29kaWNvbi50ZXJtaW5hbEdpdEJhc2gsXG5cdFx0XHRpc0F1dG9EZXRlY3RlZDogdHJ1ZVxuXHRcdH0pO1xuXHRcdGRldGVjdGVkUHJvZmlsZXMuc2V0KCdDb21tYW5kIFByb21wdCcsIHtcblx0XHRcdHBhdGg6IGAke3N5c3RlbTMyUGF0aH1cXFxcY21kLmV4ZWAsXG5cdFx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsQ21kLFxuXHRcdFx0aXNBdXRvRGV0ZWN0ZWQ6IHRydWVcblx0XHR9KTtcblx0XHRkZXRlY3RlZFByb2ZpbGVzLnNldCgnQ3lnd2luJywge1xuXHRcdFx0cGF0aDogW1xuXHRcdFx0XHR7IHBhdGg6IGAke3Byb2Nlc3MuZW52WydIT01FRFJJVkUnXX1cXFxcY3lnd2luNjRcXFxcYmluXFxcXGJhc2guZXhlYCwgaXNVbnNhZmU6IHRydWUgfSxcblx0XHRcdFx0eyBwYXRoOiBgJHtwcm9jZXNzLmVudlsnSE9NRURSSVZFJ119XFxcXGN5Z3dpblxcXFxiaW5cXFxcYmFzaC5leGVgLCBpc1Vuc2FmZTogdHJ1ZSB9XG5cdFx0XHRdLFxuXHRcdFx0YXJnczogWyctLWxvZ2luJ10sXG5cdFx0XHRpc0F1dG9EZXRlY3RlZDogdHJ1ZVxuXHRcdH0pO1xuXHRcdGRldGVjdGVkUHJvZmlsZXMuc2V0KCdiYXNoIChNU1lTMiknLCB7XG5cdFx0XHRwYXRoOiBbXG5cdFx0XHRcdHsgcGF0aDogYCR7cHJvY2Vzcy5lbnZbJ0hPTUVEUklWRSddfVxcXFxtc3lzNjRcXFxcdXNyXFxcXGJpblxcXFxiYXNoLmV4ZWAsIGlzVW5zYWZlOiB0cnVlIH0sXG5cdFx0XHRdLFxuXHRcdFx0YXJnczogWyctLWxvZ2luJywgJy1pJ10sXG5cdFx0XHQvLyBDSEVSRV9JTlZPS0lORyByZXRhaW5zIGN1cnJlbnQgd29ya2luZyBkaXJlY3Rvcnlcblx0XHRcdGVudjogeyBDSEVSRV9JTlZPS0lORzogJzEnIH0sXG5cdFx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsQmFzaCxcblx0XHRcdGlzQXV0b0RldGVjdGVkOiB0cnVlXG5cdFx0fSk7XG5cdFx0Y29uc3QgY21kZXJQYXRoID0gYCR7cHJvY2Vzcy5lbnZbJ0NNREVSX1JPT1QnXSB8fCBgJHtwcm9jZXNzLmVudlsnSE9NRURSSVZFJ119XFxcXGNtZGVyYH1cXFxcdmVuZG9yXFxcXGJpblxcXFx2c2NvZGVfaW5pdC5jbWRgO1xuXHRcdGRldGVjdGVkUHJvZmlsZXMuc2V0KCdDbWRlcicsIHtcblx0XHRcdHBhdGg6IGAke3N5c3RlbTMyUGF0aH1cXFxcY21kLmV4ZWAsXG5cdFx0XHRhcmdzOiBbJy9LJywgY21kZXJQYXRoXSxcblx0XHRcdC8vIFRoZSBwYXRoIGlzIHNhZmUgaWYgaXQgd2FzIGRlcml2ZWQgZnJvbSBDTURFUl9ST09UXG5cdFx0XHRyZXF1aXJlc1BhdGg6IHByb2Nlc3MuZW52WydDTURFUl9ST09UJ10gPyBjbWRlclBhdGggOiB7IHBhdGg6IGNtZGVyUGF0aCwgaXNVbnNhZmU6IHRydWUgfSxcblx0XHRcdGlzQXV0b0RldGVjdGVkOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRhcHBseUNvbmZpZ1Byb2ZpbGVzVG9NYXAoY29uZmlnUHJvZmlsZXMsIGRldGVjdGVkUHJvZmlsZXMpO1xuXG5cdGNvbnN0IHJlc3VsdFByb2ZpbGVzOiBJVGVybWluYWxQcm9maWxlW10gPSBhd2FpdCB0cmFuc2Zvcm1Ub1Rlcm1pbmFsUHJvZmlsZXMoZGV0ZWN0ZWRQcm9maWxlcy5lbnRyaWVzKCksIGRlZmF1bHRQcm9maWxlTmFtZSwgZnNQcm92aWRlciwgc2hlbGxFbnYsIGxvZ1NlcnZpY2UsIHZhcmlhYmxlUmVzb2x2ZXIpO1xuXG5cdGlmIChpbmNsdWRlRGV0ZWN0ZWRQcm9maWxlcyAmJiB1c2VXc2xQcm9maWxlcyAmJiBhbGxvd1dzbERpc2NvdmVyeSkge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBnZXRXc2xQcm9maWxlcyhgJHtzeXN0ZW0zMlBhdGh9XFxcXHdzbC5leGVgLCBkZWZhdWx0UHJvZmlsZU5hbWUpO1xuXHRcdFx0Zm9yIChjb25zdCB3c2xQcm9maWxlIG9mIHJlc3VsdCkge1xuXHRcdFx0XHRpZiAoIWNvbmZpZ1Byb2ZpbGVzIHx8ICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoY29uZmlnUHJvZmlsZXMsIHdzbFByb2ZpbGUucHJvZmlsZU5hbWUpKSB7XG5cdFx0XHRcdFx0cmVzdWx0UHJvZmlsZXMucHVzaCh3c2xQcm9maWxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGlmIChsb2dJZldzbE5vdEluc3RhbGxlZCkge1xuXHRcdFx0XHRsb2dTZXJ2aWNlPy50cmFjZSgnV1NMIGlzIG5vdCBpbnN0YWxsZWQsIHNvIGNvdWxkIG5vdCBkZXRlY3QgV1NMIHByb2ZpbGVzJyk7XG5cdFx0XHRcdGxvZ0lmV3NsTm90SW5zdGFsbGVkID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlc3VsdFByb2ZpbGVzO1xufVxuXG5hc3luYyBmdW5jdGlvbiB0cmFuc2Zvcm1Ub1Rlcm1pbmFsUHJvZmlsZXMoXG5cdGVudHJpZXM6IEl0ZXJhYmxlSXRlcmF0b3I8W3N0cmluZywgSVVucmVzb2x2ZWRUZXJtaW5hbFByb2ZpbGVdPixcblx0ZGVmYXVsdFByb2ZpbGVOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdGZzUHJvdmlkZXI6IElGc1Byb3ZpZGVyLFxuXHRzaGVsbEVudjogdHlwZW9mIHByb2Nlc3MuZW52ID0gcHJvY2Vzcy5lbnYsXG5cdGxvZ1NlcnZpY2U/OiBJTG9nU2VydmljZSxcblx0dmFyaWFibGVSZXNvbHZlcj86ICh0ZXh0OiBzdHJpbmdbXSkgPT4gUHJvbWlzZTxzdHJpbmdbXT4sXG4pOiBQcm9taXNlPElUZXJtaW5hbFByb2ZpbGVbXT4ge1xuXHRjb25zdCBwcm9taXNlczogUHJvbWlzZTxJVGVybWluYWxQcm9maWxlIHwgdW5kZWZpbmVkPltdID0gW107XG5cdGZvciAoY29uc3QgW3Byb2ZpbGVOYW1lLCBwcm9maWxlXSBvZiBlbnRyaWVzKSB7XG5cdFx0cHJvbWlzZXMucHVzaChnZXRWYWxpZGF0ZWRQcm9maWxlKHByb2ZpbGVOYW1lLCBwcm9maWxlLCBkZWZhdWx0UHJvZmlsZU5hbWUsIGZzUHJvdmlkZXIsIHNoZWxsRW52LCBsb2dTZXJ2aWNlLCB2YXJpYWJsZVJlc29sdmVyKSk7XG5cdH1cblx0cmV0dXJuIChhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcykpLmZpbHRlcihlID0+ICEhZSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFZhbGlkYXRlZFByb2ZpbGUoXG5cdHByb2ZpbGVOYW1lOiBzdHJpbmcsXG5cdHByb2ZpbGU6IElVbnJlc29sdmVkVGVybWluYWxQcm9maWxlLFxuXHRkZWZhdWx0UHJvZmlsZU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0ZnNQcm92aWRlcjogSUZzUHJvdmlkZXIsXG5cdHNoZWxsRW52OiB0eXBlb2YgcHJvY2Vzcy5lbnYgPSBwcm9jZXNzLmVudixcblx0bG9nU2VydmljZT86IElMb2dTZXJ2aWNlLFxuXHR2YXJpYWJsZVJlc29sdmVyPzogKHRleHQ6IHN0cmluZ1tdKSA9PiBQcm9taXNlPHN0cmluZ1tdPlxuKTogUHJvbWlzZTxJVGVybWluYWxQcm9maWxlIHwgdW5kZWZpbmVkPiB7XG5cdGlmIChwcm9maWxlID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRsZXQgb3JpZ2luYWxQYXRoczogKHN0cmluZyB8IElUZXJtaW5hbFVuc2FmZVBhdGgpW107XG5cdGxldCBhcmdzOiBzdHJpbmdbXSB8IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IGljb246IFRoZW1lSWNvbiB8IFVSSSB8IHsgbGlnaHQ6IFVSSTsgZGFyazogVVJJIH0gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdC8vIHVzZSBjYWxjdWxhdGVkIHZhbHVlcyBpZiBwYXRoIGlzIG5vdCBzcGVjaWZpZWRcblx0aWYgKGhhc0tleShwcm9maWxlLCB7IHNvdXJjZTogdHJ1ZSB9KSkge1xuXHRcdGNvbnN0IHNvdXJjZSA9IHByb2ZpbGVTb3VyY2VzPy5nZXQocHJvZmlsZS5zb3VyY2UpO1xuXHRcdGlmICghc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRvcmlnaW5hbFBhdGhzID0gc291cmNlLnBhdGhzO1xuXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIGNvbmZpZ3VyZWQgYXJncywgb3ZlcnJpZGUgdGhlIGRlZmF1bHQgb25lc1xuXHRcdGFyZ3MgPSBwcm9maWxlLmFyZ3MgfHwgc291cmNlLmFyZ3M7XG5cdFx0aWYgKHByb2ZpbGUuaWNvbikge1xuXHRcdFx0aWNvbiA9IHZhbGlkYXRlSWNvbihwcm9maWxlLmljb24pO1xuXHRcdH0gZWxzZSBpZiAoc291cmNlLmljb24pIHtcblx0XHRcdGljb24gPSBzb3VyY2UuaWNvbjtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0b3JpZ2luYWxQYXRocyA9IEFycmF5LmlzQXJyYXkocHJvZmlsZS5wYXRoKSA/IHByb2ZpbGUucGF0aCA6IFtwcm9maWxlLnBhdGhdO1xuXHRcdGFyZ3MgPSBpc1dpbmRvd3MgPyBwcm9maWxlLmFyZ3MgOiBBcnJheS5pc0FycmF5KHByb2ZpbGUuYXJncykgPyBwcm9maWxlLmFyZ3MgOiB1bmRlZmluZWQ7XG5cdFx0aWNvbiA9IHZhbGlkYXRlSWNvbihwcm9maWxlLmljb24pO1xuXHR9XG5cblx0bGV0IHBhdGhzOiAoc3RyaW5nIHwgSVRlcm1pbmFsVW5zYWZlUGF0aClbXTtcblx0aWYgKHZhcmlhYmxlUmVzb2x2ZXIpIHtcblx0XHQvLyBDb252ZXJ0IHRvIHN0cmluZ1tdIGZvciByZXNvbHZlXG5cdFx0Y29uc3QgbWFwcGVkID0gb3JpZ2luYWxQYXRocy5tYXAoZSA9PiBpc1N0cmluZyhlKSA/IGUgOiBlLnBhdGgpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB2YXJpYWJsZVJlc29sdmVyKG1hcHBlZCk7XG5cdFx0Ly8gQ29udmVydCByZXNvbHZlZCBiYWNrIHRvIChUIHwgc3RyaW5nKVtdXG5cdFx0cGF0aHMgPSBuZXcgQXJyYXkob3JpZ2luYWxQYXRocy5sZW5ndGgpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgb3JpZ2luYWxQYXRocy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKGlzU3RyaW5nKG9yaWdpbmFsUGF0aHNbaV0pKSB7XG5cdFx0XHRcdHBhdGhzW2ldID0gcmVzb2x2ZWRbaV07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwYXRoc1tpXSA9IHtcblx0XHRcdFx0XHRwYXRoOiByZXNvbHZlZFtpXSxcblx0XHRcdFx0XHRpc1Vuc2FmZTogdHJ1ZVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRwYXRocyA9IG9yaWdpbmFsUGF0aHMuc2xpY2UoKTtcblx0fVxuXG5cdGxldCByZXF1aXJlc1Vuc2FmZVBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0aWYgKHByb2ZpbGUucmVxdWlyZXNQYXRoKSB7XG5cdFx0Ly8gVmFsaWRhdGUgcmVxdWlyZXNQYXRoIGV4aXN0c1xuXHRcdGxldCBhY3R1YWxSZXF1aXJlZFBhdGg6IHN0cmluZztcblx0XHRpZiAoaXNTdHJpbmcocHJvZmlsZS5yZXF1aXJlc1BhdGgpKSB7XG5cdFx0XHRhY3R1YWxSZXF1aXJlZFBhdGggPSBwcm9maWxlLnJlcXVpcmVzUGF0aDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YWN0dWFsUmVxdWlyZWRQYXRoID0gcHJvZmlsZS5yZXF1aXJlc1BhdGgucGF0aDtcblx0XHRcdGlmIChwcm9maWxlLnJlcXVpcmVzUGF0aC5pc1Vuc2FmZSkge1xuXHRcdFx0XHRyZXF1aXJlc1Vuc2FmZVBhdGggPSBhY3R1YWxSZXF1aXJlZFBhdGg7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZzUHJvdmlkZXIuZXhpc3RzRmlsZShhY3R1YWxSZXF1aXJlZFBhdGgpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgdmFsaWRhdGVkUHJvZmlsZSA9IGF3YWl0IHZhbGlkYXRlUHJvZmlsZVBhdGhzKHByb2ZpbGVOYW1lLCBkZWZhdWx0UHJvZmlsZU5hbWUsIHBhdGhzLCBmc1Byb3ZpZGVyLCBzaGVsbEVudiwgYXJncywgcHJvZmlsZS5lbnYsIHByb2ZpbGUub3ZlcnJpZGVOYW1lLCBwcm9maWxlLmlzQXV0b0RldGVjdGVkLCByZXF1aXJlc1Vuc2FmZVBhdGgpO1xuXHRpZiAoIXZhbGlkYXRlZFByb2ZpbGUpIHtcblx0XHRsb2dTZXJ2aWNlPy5kZWJ1ZygnVGVybWluYWwgcHJvZmlsZSBub3QgdmFsaWRhdGVkJywgcHJvZmlsZU5hbWUsIG9yaWdpbmFsUGF0aHMpO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHR2YWxpZGF0ZWRQcm9maWxlLmlzQXV0b0RldGVjdGVkID0gcHJvZmlsZS5pc0F1dG9EZXRlY3RlZDtcblx0dmFsaWRhdGVkUHJvZmlsZS5pY29uID0gaWNvbjtcblx0dmFsaWRhdGVkUHJvZmlsZS5jb2xvciA9IHByb2ZpbGUuY29sb3I7XG5cdHJldHVybiB2YWxpZGF0ZWRQcm9maWxlO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUljb24oaWNvbjogc3RyaW5nIHwgVGVybWluYWxJY29uIHwgdW5kZWZpbmVkKTogVGVybWluYWxJY29uIHwgdW5kZWZpbmVkIHtcblx0aWYgKGlzU3RyaW5nKGljb24pKSB7XG5cdFx0cmV0dXJuIHsgaWQ6IGljb24gfTtcblx0fVxuXHRyZXR1cm4gaWNvbjtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaW5pdGlhbGl6ZVdpbmRvd3NQcm9maWxlcyh0ZXN0UHdzaFNvdXJjZVBhdGhzPzogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0aWYgKHByb2ZpbGVTb3VyY2VzICYmICF0ZXN0UHdzaFNvdXJjZVBhdGhzKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgW2dpdEJhc2hQYXRocywgcHdzaFBhdGhzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtnZXRHaXRCYXNoUGF0aHMoKSwgdGVzdFB3c2hTb3VyY2VQYXRocyB8fCBnZXRQb3dlcnNoZWxsUGF0aHMoKV0pO1xuXG5cdHByb2ZpbGVTb3VyY2VzID0gbmV3IE1hcCgpO1xuXHRwcm9maWxlU291cmNlcy5zZXQoXG5cdFx0UHJvZmlsZVNvdXJjZS5HaXRCYXNoLCB7XG5cdFx0cHJvZmlsZU5hbWU6ICdHaXQgQmFzaCcsXG5cdFx0cGF0aHM6IGdpdEJhc2hQYXRocyxcblx0XHRhcmdzOiBbJy0tbG9naW4nLCAnLWknXVxuXHR9KTtcblx0cHJvZmlsZVNvdXJjZXMuc2V0KFByb2ZpbGVTb3VyY2UuUHdzaCwge1xuXHRcdHByb2ZpbGVOYW1lOiAnUG93ZXJTaGVsbCcsXG5cdFx0cGF0aHM6IHB3c2hQYXRocyxcblx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsUG93ZXJzaGVsbFxuXHR9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0R2l0QmFzaFBhdGhzKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0Y29uc3QgZ2l0RGlyczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cblx0Ly8gTG9vayBmb3IgZ2l0LmV4ZSBvbiB0aGUgUEFUSCBhbmQgdXNlIHRoYXQgaWYgZm91bmQuIGdpdC5leGUgaXMgbG9jYXRlZCBhdFxuXHQvLyBgPGluc3RhbGxkaXI+L2NtZC9naXQuZXhlYC4gVGhpcyBpcyBub3QgYW4gdW5zYWZlIGxvY2F0aW9uIGJlY2F1c2UgdGhlIGdpdCBleGVjdXRhYmxlIGlzXG5cdC8vIGxvY2F0ZWQgb24gdGhlIFBBVEggd2hpY2ggaXMgb25seSBjb250cm9sbGVkIGJ5IHRoZSB1c2VyL2FkbWluLlxuXHRjb25zdCBnaXRFeGVQYXRoID0gYXdhaXQgZmluZEV4ZWN1dGFibGUoJ2dpdC5leGUnKTtcblx0aWYgKGdpdEV4ZVBhdGgpIHtcblx0XHRjb25zdCBnaXRFeGVEaXIgPSBkaXJuYW1lKGdpdEV4ZVBhdGgpO1xuXHRcdGdpdERpcnMuYWRkKHJlc29sdmUoZ2l0RXhlRGlyLCAnLi4vLi4nKSk7XG5cdH1cblx0ZnVuY3Rpb24gYWRkVHJ1dGh5PFQ+KHNldDogU2V0PFQ+LCB2YWx1ZTogVCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0c2V0LmFkZCh2YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gQWRkIGNvbW1vbiBnaXQgaW5zdGFsbCBsb2NhdGlvbnNcblx0YWRkVHJ1dGh5KGdpdERpcnMsIHByb2Nlc3MuZW52WydQcm9ncmFtVzY0MzInXSk7XG5cdGFkZFRydXRoeShnaXREaXJzLCBwcm9jZXNzLmVudlsnUHJvZ3JhbUZpbGVzJ10pO1xuXHRhZGRUcnV0aHkoZ2l0RGlycywgcHJvY2Vzcy5lbnZbJ1Byb2dyYW1GaWxlcyhYODYpJ10pO1xuXHRhZGRUcnV0aHkoZ2l0RGlycywgYCR7cHJvY2Vzcy5lbnZbJ0xvY2FsQXBwRGF0YSddfVxcXFxQcm9ncmFtYCk7XG5cblx0Y29uc3QgZ2l0QmFzaFBhdGhzOiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGdpdERpciBvZiBnaXREaXJzKSB7XG5cdFx0Z2l0QmFzaFBhdGhzLnB1c2goXG5cdFx0XHRgJHtnaXREaXJ9XFxcXEdpdFxcXFxiaW5cXFxcYmFzaC5leGVgLFxuXHRcdFx0YCR7Z2l0RGlyfVxcXFxHaXRcXFxcdXNyXFxcXGJpblxcXFxiYXNoLmV4ZWAsXG5cdFx0XHRgJHtnaXREaXJ9XFxcXHVzclxcXFxiaW5cXFxcYmFzaC5leGVgIC8vIHVzaW5nIEdpdCBmb3IgV2luZG93cyBTREtcblx0XHQpO1xuXHR9XG5cblx0Ly8gQWRkIHNwZWNpYWwgaW5zdGFsbHMgdGhhdCBkb24ndCBmb2xsb3cgdGhlIHN0YW5kYXJkIGRpcmVjdG9yeSBzdHJ1Y3R1cmVcblx0Z2l0QmFzaFBhdGhzLnB1c2goYCR7cHJvY2Vzcy5lbnZbJ1VzZXJQcm9maWxlJ119XFxcXHNjb29wXFxcXGFwcHNcXFxcZ2l0XFxcXGN1cnJlbnRcXFxcYmluXFxcXGJhc2guZXhlYCk7XG5cdGdpdEJhc2hQYXRocy5wdXNoKGAke3Byb2Nlc3MuZW52WydVc2VyUHJvZmlsZSddfVxcXFxzY29vcFxcXFxhcHBzXFxcXGdpdC13aXRoLW9wZW5zc2hcXFxcY3VycmVudFxcXFxiaW5cXFxcYmFzaC5leGVgKTtcblxuXHRyZXR1cm4gZ2l0QmFzaFBhdGhzO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRQb3dlcnNoZWxsUGF0aHMoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRjb25zdCBwYXRoczogc3RyaW5nW10gPSBbXTtcblx0Ly8gQWRkIGFsbCBvZiB0aGUgZGlmZmVyZW50IGtpbmRzIG9mIFBvd2VyU2hlbGxzXG5cdGZvciBhd2FpdCAoY29uc3QgcHdzaEV4ZSBvZiBlbnVtZXJhdGVQb3dlclNoZWxsSW5zdGFsbGF0aW9ucygpKSB7XG5cdFx0cGF0aHMucHVzaChwd3NoRXhlLmV4ZVBhdGgpO1xuXHR9XG5cdHJldHVybiBwYXRocztcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0V3NsUHJvZmlsZXMod3NsUGF0aDogc3RyaW5nLCBkZWZhdWx0UHJvZmlsZU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVRlcm1pbmFsUHJvZmlsZVtdPiB7XG5cdGNvbnN0IHByb2ZpbGVzOiBJVGVybWluYWxQcm9maWxlW10gPSBbXTtcblx0Y29uc3QgZGlzdHJvT3V0cHV0ID0gYXdhaXQgbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Ly8gd3NsLmV4ZSBvdXRwdXQgaXMgZW5jb2RlZCBpbiB1dGYxNmxlIChpZS4gQSAtPiAweDQxMDApIGJ5IGRlZmF1bHQsIGZvcmNlIGl0IGluIGNhc2UgdGhlXG5cdFx0Ly8gdXNlciBjaGFuZ2VkIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNzYyNTNcblx0XHRjcC5leGVjKCd3c2wuZXhlIC1sIC1xJywgeyBlbmNvZGluZzogJ3V0ZjE2bGUnLCBlbnY6IHsgLi4ucHJvY2Vzcy5lbnYsIFdTTF9VVEY4OiAnMCcgfSwgdGltZW91dDogMTAwMCB9LCAoZXJyLCBzdGRvdXQpID0+IHtcblx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0cmV0dXJuIHJlamVjdCgnUHJvYmxlbSBvY2N1cnJlZCB3aGVuIGdldHRpbmcgd3NsIGRpc3Ryb3MnKTtcblx0XHRcdH1cblx0XHRcdHJlc29sdmUoc3Rkb3V0KTtcblx0XHR9KTtcblx0fSk7XG5cdGlmICghZGlzdHJvT3V0cHV0KSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGNvbnN0IGRpc3Ryb05hbWVzID0gZGlzdHJvT3V0cHV0LnNwbGl0KC9cXHI/XFxuLykuZmlsdGVyKHQgPT4gdC50cmltKCkubGVuZ3RoID4gMCk7XG5cdGZvciAoY29uc3QgZGlzdHJvTmFtZSBvZiBkaXN0cm9OYW1lcykge1xuXHRcdC8vIFNraXAgZW1wdHkgbGluZXNcblx0XHRpZiAoZGlzdHJvTmFtZSA9PT0gJycpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdC8vIGRvY2tlci1kZXNrdG9wIGFuZCBkb2NrZXItZGVza3RvcC1kYXRhIGFyZSB0cmVhdGVkIGFzIGltcGxlbWVudGF0aW9uIGRldGFpbHMgb2Zcblx0XHQvLyBEb2NrZXIgRGVza3RvcCBmb3IgV2luZG93cyBhbmQgdGhlcmVmb3JlIG5vdCBleHBvc2VkXG5cdFx0aWYgKGRpc3Ryb05hbWUuc3RhcnRzV2l0aCgnZG9ja2VyLWRlc2t0b3AnKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIHRoZSBwcm9maWxlLCBhZGRpbmcgdGhlIGljb24gZGVwZW5kaW5nIG9uIHRoZSBkaXN0cm9cblx0XHRjb25zdCBwcm9maWxlTmFtZSA9IGAke2Rpc3Ryb05hbWV9IChXU0wpYDtcblx0XHRjb25zdCBwcm9maWxlOiBJVGVybWluYWxQcm9maWxlID0ge1xuXHRcdFx0cHJvZmlsZU5hbWUsXG5cdFx0XHRwYXRoOiB3c2xQYXRoLFxuXHRcdFx0YXJnczogW2AtZGAsIGAke2Rpc3Ryb05hbWV9YF0sXG5cdFx0XHRpc0RlZmF1bHQ6IHByb2ZpbGVOYW1lID09PSBkZWZhdWx0UHJvZmlsZU5hbWUsXG5cdFx0XHRpY29uOiBnZXRXc2xJY29uKGRpc3Ryb05hbWUpLFxuXHRcdFx0aXNBdXRvRGV0ZWN0ZWQ6IGZhbHNlXG5cdFx0fTtcblx0XHQvLyBBZGQgdGhlIHByb2ZpbGVcblx0XHRwcm9maWxlcy5wdXNoKHByb2ZpbGUpO1xuXHR9XG5cdHJldHVybiBwcm9maWxlcztcbn1cblxuZnVuY3Rpb24gZ2V0V3NsSWNvbihkaXN0cm9OYW1lOiBzdHJpbmcpOiBUaGVtZUljb24ge1xuXHRpZiAoZGlzdHJvTmFtZS5pbmNsdWRlcygnVWJ1bnR1JykpIHtcblx0XHRyZXR1cm4gQ29kaWNvbi50ZXJtaW5hbFVidW50dTtcblx0fSBlbHNlIGlmIChkaXN0cm9OYW1lLmluY2x1ZGVzKCdEZWJpYW4nKSkge1xuXHRcdHJldHVybiBDb2RpY29uLnRlcm1pbmFsRGViaWFuO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBDb2RpY29uLnRlcm1pbmFsTGludXg7XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZGV0ZWN0QXZhaWxhYmxlVW5peFByb2ZpbGVzKFxuXHRmc1Byb3ZpZGVyOiBJRnNQcm92aWRlcixcblx0bG9nU2VydmljZT86IElMb2dTZXJ2aWNlLFxuXHRpbmNsdWRlRGV0ZWN0ZWRQcm9maWxlcz86IGJvb2xlYW4sXG5cdGNvbmZpZ1Byb2ZpbGVzPzogeyBba2V5OiBzdHJpbmddOiBJVW5yZXNvbHZlZFRlcm1pbmFsUHJvZmlsZSB9LFxuXHRkZWZhdWx0UHJvZmlsZU5hbWU/OiBzdHJpbmcsXG5cdHRlc3RQYXRocz86IHN0cmluZ1tdLFxuXHR2YXJpYWJsZVJlc29sdmVyPzogKHRleHQ6IHN0cmluZ1tdKSA9PiBQcm9taXNlPHN0cmluZ1tdPixcblx0c2hlbGxFbnY/OiB0eXBlb2YgcHJvY2Vzcy5lbnZcbik6IFByb21pc2U8SVRlcm1pbmFsUHJvZmlsZVtdPiB7XG5cdGNvbnN0IGRldGVjdGVkUHJvZmlsZXM6IE1hcDxzdHJpbmcsIElVbnJlc29sdmVkVGVybWluYWxQcm9maWxlPiA9IG5ldyBNYXAoKTtcblxuXHQvLyBBZGQgbm9uLXF1aWNrIGxhdW5jaCBwcm9maWxlc1xuXHRpZiAoaW5jbHVkZURldGVjdGVkUHJvZmlsZXMgJiYgYXdhaXQgZnNQcm92aWRlci5leGlzdHNGaWxlKENvbnN0YW50cy5Vbml4U2hlbGxzUGF0aCkpIHtcblx0XHRjb25zdCBjb250ZW50cyA9IChhd2FpdCBmc1Byb3ZpZGVyLnJlYWRGaWxlKENvbnN0YW50cy5Vbml4U2hlbGxzUGF0aCkpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgcHJvZmlsZXMgPSAoXG5cdFx0XHQodGVzdFBhdGhzIHx8IGNvbnRlbnRzLnNwbGl0KCdcXG4nKSlcblx0XHRcdFx0Lm1hcChlID0+IHtcblx0XHRcdFx0XHRjb25zdCBpbmRleCA9IGUuaW5kZXhPZignIycpO1xuXHRcdFx0XHRcdHJldHVybiBpbmRleCA9PT0gLTEgPyBlIDogZS5zdWJzdHJpbmcoMCwgaW5kZXgpO1xuXHRcdFx0XHR9KVxuXHRcdFx0XHQuZmlsdGVyKGUgPT4gZS50cmltKCkubGVuZ3RoID4gMClcblx0XHQpO1xuXHRcdGNvbnN0IGNvdW50czogTWFwPHN0cmluZywgbnVtYmVyPiA9IG5ldyBNYXAoKTtcblx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgcHJvZmlsZXMpIHtcblx0XHRcdGxldCBwcm9maWxlTmFtZSA9IGJhc2VuYW1lKHByb2ZpbGUpO1xuXHRcdFx0bGV0IGNvdW50ID0gY291bnRzLmdldChwcm9maWxlTmFtZSkgfHwgMDtcblx0XHRcdGNvdW50Kys7XG5cdFx0XHRpZiAoY291bnQgPiAxKSB7XG5cdFx0XHRcdHByb2ZpbGVOYW1lID0gYCR7cHJvZmlsZU5hbWV9ICgke2NvdW50fSlgO1xuXHRcdFx0fVxuXHRcdFx0Y291bnRzLnNldChwcm9maWxlTmFtZSwgY291bnQpO1xuXHRcdFx0ZGV0ZWN0ZWRQcm9maWxlcy5zZXQocHJvZmlsZU5hbWUsIHsgcGF0aDogcHJvZmlsZSwgaXNBdXRvRGV0ZWN0ZWQ6IHRydWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0YXBwbHlDb25maWdQcm9maWxlc1RvTWFwKGNvbmZpZ1Byb2ZpbGVzLCBkZXRlY3RlZFByb2ZpbGVzKTtcblxuXHRyZXR1cm4gYXdhaXQgdHJhbnNmb3JtVG9UZXJtaW5hbFByb2ZpbGVzKGRldGVjdGVkUHJvZmlsZXMuZW50cmllcygpLCBkZWZhdWx0UHJvZmlsZU5hbWUsIGZzUHJvdmlkZXIsIHNoZWxsRW52LCBsb2dTZXJ2aWNlLCB2YXJpYWJsZVJlc29sdmVyKTtcbn1cblxuZnVuY3Rpb24gYXBwbHlDb25maWdQcm9maWxlc1RvTWFwKGNvbmZpZ1Byb2ZpbGVzOiB7IFtrZXk6IHN0cmluZ106IElVbnJlc29sdmVkVGVybWluYWxQcm9maWxlIH0gfCB1bmRlZmluZWQsIHByb2ZpbGVzTWFwOiBNYXA8c3RyaW5nLCBJVW5yZXNvbHZlZFRlcm1pbmFsUHJvZmlsZT4pIHtcblx0aWYgKCFjb25maWdQcm9maWxlcykge1xuXHRcdHJldHVybjtcblx0fVxuXHRmb3IgKGNvbnN0IFtwcm9maWxlTmFtZSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGNvbmZpZ1Byb2ZpbGVzKSkge1xuXHRcdGlmICh2YWx1ZSA9PT0gbnVsbCB8fCAhaXNPYmplY3QodmFsdWUpIHx8ICghaGFzS2V5KHZhbHVlLCB7IHBhdGg6IHRydWUgfSkgJiYgIWhhc0tleSh2YWx1ZSwgeyBzb3VyY2U6IHRydWUgfSkpKSB7XG5cdFx0XHRwcm9maWxlc01hcC5kZWxldGUocHJvZmlsZU5hbWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YWx1ZS5pY29uID0gdmFsdWUuaWNvbiB8fCBwcm9maWxlc01hcC5nZXQocHJvZmlsZU5hbWUpPy5pY29uO1xuXHRcdFx0cHJvZmlsZXNNYXAuc2V0KHByb2ZpbGVOYW1lLCB2YWx1ZSk7XG5cdFx0fVxuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHZhbGlkYXRlUHJvZmlsZVBhdGhzKHByb2ZpbGVOYW1lOiBzdHJpbmcsIGRlZmF1bHRQcm9maWxlTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBwb3RlbnRpYWxQYXRoczogKHN0cmluZyB8IElUZXJtaW5hbFVuc2FmZVBhdGgpW10sIGZzUHJvdmlkZXI6IElGc1Byb3ZpZGVyLCBzaGVsbEVudjogdHlwZW9mIHByb2Nlc3MuZW52LCBhcmdzPzogc3RyaW5nW10gfCBzdHJpbmcsIGVudj86IElUZXJtaW5hbEVudmlyb25tZW50LCBvdmVycmlkZU5hbWU/OiBib29sZWFuLCBpc0F1dG9EZXRlY3RlZD86IGJvb2xlYW4sIHJlcXVpcmVzVW5zYWZlUGF0aD86IHN0cmluZyk6IFByb21pc2U8SVRlcm1pbmFsUHJvZmlsZSB8IHVuZGVmaW5lZD4ge1xuXHRpZiAocG90ZW50aWFsUGF0aHMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cdGNvbnN0IHBhdGggPSBwb3RlbnRpYWxQYXRocy5zaGlmdCgpITtcblx0aWYgKHBhdGggPT09ICcnKSB7XG5cdFx0cmV0dXJuIHZhbGlkYXRlUHJvZmlsZVBhdGhzKHByb2ZpbGVOYW1lLCBkZWZhdWx0UHJvZmlsZU5hbWUsIHBvdGVudGlhbFBhdGhzLCBmc1Byb3ZpZGVyLCBzaGVsbEVudiwgYXJncywgZW52LCBvdmVycmlkZU5hbWUsIGlzQXV0b0RldGVjdGVkKTtcblx0fVxuXHRjb25zdCBpc1Vuc2FmZVBhdGggPSAhaXNTdHJpbmcocGF0aCkgJiYgcGF0aC5pc1Vuc2FmZTtcblx0Y29uc3QgYWN0dWFsUGF0aCA9IGlzU3RyaW5nKHBhdGgpID8gcGF0aCA6IHBhdGgucGF0aDtcblxuXHRjb25zdCBwcm9maWxlOiBJVGVybWluYWxQcm9maWxlID0ge1xuXHRcdHByb2ZpbGVOYW1lLFxuXHRcdHBhdGg6IGFjdHVhbFBhdGgsXG5cdFx0YXJncyxcblx0XHRlbnYsXG5cdFx0b3ZlcnJpZGVOYW1lLFxuXHRcdGlzQXV0b0RldGVjdGVkLFxuXHRcdGlzRGVmYXVsdDogcHJvZmlsZU5hbWUgPT09IGRlZmF1bHRQcm9maWxlTmFtZSxcblx0XHRpc1Vuc2FmZVBhdGgsXG5cdFx0cmVxdWlyZXNVbnNhZmVQYXRoXG5cdH07XG5cblx0Ly8gRm9yIG5vbi1hYnNvbHV0ZSBwYXRocywgY2hlY2sgaWYgaXQncyBhdmFpbGFibGUgb24gJFBBVEhcblx0aWYgKGJhc2VuYW1lKGFjdHVhbFBhdGgpID09PSBhY3R1YWxQYXRoKSB7XG5cdFx0Ly8gVGhlIGV4ZWN1dGFibGUgaXNuJ3QgYW4gYWJzb2x1dGUgcGF0aCwgdHJ5IGZpbmQgaXQgb24gdGhlIFBBVEhcblx0XHRjb25zdCBlbnZQYXRoczogc3RyaW5nW10gfCB1bmRlZmluZWQgPSBzaGVsbEVudi5QQVRIID8gc2hlbGxFbnYuUEFUSC5zcGxpdChkZWxpbWl0ZXIpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGV4ZWN1dGFibGUgPSBhd2FpdCBmaW5kRXhlY3V0YWJsZShhY3R1YWxQYXRoLCB1bmRlZmluZWQsIGVudlBhdGhzLCB1bmRlZmluZWQsIGZzUHJvdmlkZXIuZXhpc3RzRmlsZSk7XG5cdFx0aWYgKCFleGVjdXRhYmxlKSB7XG5cdFx0XHRyZXR1cm4gdmFsaWRhdGVQcm9maWxlUGF0aHMocHJvZmlsZU5hbWUsIGRlZmF1bHRQcm9maWxlTmFtZSwgcG90ZW50aWFsUGF0aHMsIGZzUHJvdmlkZXIsIHNoZWxsRW52LCBhcmdzKTtcblx0XHR9XG5cdFx0cHJvZmlsZS5wYXRoID0gZXhlY3V0YWJsZTtcblx0XHRwcm9maWxlLmlzRnJvbVBhdGggPSB0cnVlO1xuXHRcdHJldHVybiBwcm9maWxlO1xuXHR9XG5cblx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZnNQcm92aWRlci5leGlzdHNGaWxlKG5vcm1hbGl6ZShhY3R1YWxQYXRoKSk7XG5cdGlmIChyZXN1bHQpIHtcblx0XHRyZXR1cm4gcHJvZmlsZTtcblx0fVxuXG5cdHJldHVybiB2YWxpZGF0ZVByb2ZpbGVQYXRocyhwcm9maWxlTmFtZSwgZGVmYXVsdFByb2ZpbGVOYW1lLCBwb3RlbnRpYWxQYXRocywgZnNQcm92aWRlciwgc2hlbGxFbnYsIGFyZ3MsIGVudiwgb3ZlcnJpZGVOYW1lLCBpc0F1dG9EZXRlY3RlZCk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZzUHJvdmlkZXIge1xuXHRleGlzdHNGaWxlKHBhdGg6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj47XG5cdHJlYWRGaWxlKHBhdGg6IHN0cmluZyk6IFByb21pc2U8QnVmZmVyPjtcbn1cblxuaW50ZXJmYWNlIElQb3RlbnRpYWxUZXJtaW5hbFByb2ZpbGUge1xuXHRwcm9maWxlTmFtZTogc3RyaW5nO1xuXHRwYXRoczogc3RyaW5nW107XG5cdGFyZ3M/OiBzdHJpbmdbXTtcblx0aWNvbj86IFRoZW1lSWNvbiB8IFVSSSB8IHsgbGlnaHQ6IFVSSTsgZGFyazogVVJJIH07XG59XG5cbmV4cG9ydCB0eXBlIElVbnJlc29sdmVkVGVybWluYWxQcm9maWxlID0gSVRlcm1pbmFsRXhlY3V0YWJsZSB8IElUZXJtaW5hbFByb2ZpbGVTb3VyY2UgfCBudWxsO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxRQUFRO0FBQ3BCLFlBQVksUUFBUTtBQUNwQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxVQUFVLFdBQVcsV0FBVyxTQUFTLGVBQWU7QUFDakUsU0FBUyxTQUFTLGlCQUFpQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFFBQVEsVUFBVSxnQkFBZ0I7QUFFM0MsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsd0NBQXdDO0FBR2pELFNBQW1ILGVBQTZCLHlCQUF5QjtBQUV6SyxTQUFTLGtDQUFrQztBQUUzQyxJQUFXLFlBQVgsa0JBQVdBLGVBQVg7QUFDQyxFQUFBQSxXQUFBLG9CQUFpQjtBQURQLFNBQUFBO0FBQUEsR0FBQTtBQUlYLElBQUk7QUFDSixJQUFJLHVCQUFnQztBQUU3QixTQUFTLHdCQUNmLFVBQ0EsZ0JBQ0EseUJBQ0Esc0JBQ0EsV0FBK0IsUUFBUSxLQUN2QyxZQUNBLFlBQ0Esa0JBQ0EscUJBQzhCO0FBQzlCLGVBQWEsY0FBYztBQUFBLElBQzFCLFlBQVksSUFBSSxlQUFlO0FBQUEsSUFDL0IsVUFBVSxHQUFHLFNBQVM7QUFBQSxFQUN2QjtBQUNBLE1BQUksV0FBVztBQUNkLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxxQkFBcUIsU0FB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S0FBSyxLQUFNLENBQUMsT0FBTyxPQUFPLEVBQUUsTUFBTSxLQUFLLENBQUMsS0FBSyxDQUFDLE9BQU8sT0FBTyxFQUFFLFFBQVEsS0FBSyxDQUFDLEdBQUk7QUFDL0csa0JBQVksT0FBTyxXQUFXO0FBQUEsSUFDL0IsT0FBTztBQUNOLFlBQU0sT0FBTyxNQUFNLFFBQVEsWUFBWSxJQUFJLFdBQVcsR0FBRztBQUN6RCxrQkFBWSxJQUFJLGFBQWEsS0FBSztBQUFBLElBQ25DO0FBQUEsRUFDRDtBQUNEO0FBRUEsZUFBZSxxQkFBcUIsYUFBcUIsb0JBQXdDLGdCQUFrRCxZQUF5QixVQUE4QixNQUEwQixLQUE0QixjQUF3QixnQkFBMEIsb0JBQW9FO0FBQ3JYLE1BQUksZUFBZSxXQUFXLEdBQUc7QUFDaEMsV0FBTyxRQUFRLFFBQVEsTUFBUztBQUFBLEVBQ2pDO0FBQ0EsUUFBTSxPQUFPLGVBQWUsTUFBTTtBQUNsQyxNQUFJLFNBQVMsSUFBSTtBQUNoQixXQUFPLHFCQUFxQixhQUFhLG9CQUFvQixnQkFBZ0IsWUFBWSxVQUFVLE1BQU0sS0FBSyxjQUFjLGNBQWM7QUFBQSxFQUMzSTtBQUNBLFFBQU0sZUFBZSxDQUFDLFNBQVMsSUFBSSxLQUFLLEtBQUs7QUFDN0MsUUFBTSxhQUFhLFNBQVMsSUFBSSxJQUFJLE9BQU8sS0FBSztBQUVoRCxRQUFNLFVBQTRCO0FBQUEsSUFDakM7QUFBQSxJQUNBLE1BQU07QUFBQSxJQUNOO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQSxXQUFXLGdCQUFnQjtBQUFBLElBQzNCO0FBQUEsSUFDQTtBQUFBLEVBQ0Q7QUFHQSxNQUFJLFNBQVMsVUFBVSxNQUFNLFlBQVk7QUFFeEMsVUFBTSxXQUFpQyxTQUFTLE9BQU8sU0FBUyxLQUFLLE1BQU0sU0FBUyxJQUFJO0FBQ3hGLFVBQU0sYUFBYSxNQUFNLGVBQWUsWUFBWSxRQUFXLFVBQVUsUUFBVyxXQUFXLFVBQVU7QUFDekcsUUFBSSxDQUFDLFlBQVk7QUFDaEIsYUFBTyxxQkFBcUIsYUFBYSxvQkFBb0IsZ0JBQWdCLFlBQVksVUFBVSxJQUFJO0FBQUEsSUFDeEc7QUFDQSxZQUFRLE9BQU87QUFDZixZQUFRLGFBQWE7QUFDckIsV0FBTztBQUFBLEVBQ1I7QUFFQSxRQUFNLFNBQVMsTUFBTSxXQUFXLFdBQVcsVUFBVSxVQUFVLENBQUM7QUFDaEUsTUFBSSxRQUFRO0FBQ1gsV0FBTztBQUFBLEVBQ1I7QUFFQSxTQUFPLHFCQUFxQixhQUFhLG9CQUFvQixnQkFBZ0IsWUFBWSxVQUFVLE1BQU0sS0FBSyxjQUFjLGNBQWM7QUFDM0k7IiwKICAibmFtZXMiOiBbIkNvbnN0YW50cyIsICJyZXNvbHZlIl0KfQo=
