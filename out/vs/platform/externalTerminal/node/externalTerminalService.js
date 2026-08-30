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
import * as cp from "child_process";
import { memoize } from "../../../base/common/decorators.js";
import { FileAccess } from "../../../base/common/network.js";
import * as path from "../../../base/common/path.js";
import * as env from "../../../base/common/platform.js";
import { sanitizeProcessEnvironment } from "../../../base/common/processes.js";
import * as pfs from "../../../base/node/pfs.js";
import * as processes from "../../../base/node/processes.js";
import * as nls from "../../../nls.js";
import { DEFAULT_TERMINAL_OSX } from "../common/externalTerminal.js";
const TERMINAL_TITLE = nls.localize("console.title", "VS Code Console");
class ExternalTerminalService {
  async getDefaultTerminalForPlatforms() {
    return {
      windows: WindowsExternalTerminalService.getDefaultTerminalWindows(),
      linux: await LinuxExternalTerminalService.getDefaultTerminalLinuxReady(),
      osx: DEFAULT_TERMINAL_OSX
    };
  }
}
const _WindowsExternalTerminalService = class _WindowsExternalTerminalService extends ExternalTerminalService {
  openTerminal(configuration, cwd) {
    return this.spawnTerminal(cp, configuration, processes.getWindowsShell(), cwd);
  }
  spawnTerminal(spawner, configuration, command, cwd) {
    const exec = configuration.windowsExec || _WindowsExternalTerminalService.getDefaultTerminalWindows();
    if (cwd && cwd[1] === ":") {
      cwd = cwd[0].toUpperCase() + cwd.substr(1);
    }
    const basename = path.basename(exec, ".exe").toLowerCase();
    if (basename === "cmder") {
      spawner.spawn(exec, cwd ? [cwd] : void 0);
      return Promise.resolve(void 0);
    }
    const cmdArgs = ["/c", "start", "/wait"];
    if (exec.indexOf(" ") >= 0) {
      cmdArgs.push(exec);
    }
    cmdArgs.push(exec);
    if (basename === "wt") {
      cmdArgs.push("-d .");
    }
    return new Promise((c, e) => {
      const env2 = getSanitizedEnvironment(process);
      const child = spawner.spawn(command, cmdArgs, { cwd, env: env2, detached: true });
      child.on("error", e);
      child.on("exit", () => c());
    });
  }
  async runInTerminal(title, dir, args, envVars, settings) {
    const exec = settings.windowsExec || _WindowsExternalTerminalService.getDefaultTerminalWindows();
    const wt = await _WindowsExternalTerminalService.getWtExePath();
    return new Promise((resolve, reject) => {
      const title2 = `"${dir} - ${TERMINAL_TITLE}"`;
      const command = `"${args.join('" "')}" & pause`;
      const env2 = Object.assign({}, getSanitizedEnvironment(process), envVars);
      Object.keys(env2).filter((v) => env2[v] === null).forEach((key) => delete env2[key]);
      const options = {
        cwd: dir,
        env: env2,
        windowsVerbatimArguments: true
      };
      let spawnExec;
      let cmdArgs;
      if (path.basename(exec, ".exe") === "wt") {
        spawnExec = exec;
        cmdArgs = ["-d", ".", _WindowsExternalTerminalService.CMD, "/c", command];
      } else if (wt) {
        spawnExec = wt;
        cmdArgs = ["-d", ".", exec, "/c", command];
      } else {
        spawnExec = _WindowsExternalTerminalService.CMD;
        cmdArgs = ["/c", "start", title2, "/wait", exec, "/c", `"${command}"`];
      }
      const cmd = cp.spawn(spawnExec, cmdArgs, options);
      cmd.on("error", (err) => {
        reject(improveError(err));
      });
      resolve(void 0);
    });
  }
  static getDefaultTerminalWindows() {
    if (!_WindowsExternalTerminalService._DEFAULT_TERMINAL_WINDOWS) {
      const isWoW64 = !!process.env.hasOwnProperty("PROCESSOR_ARCHITEW6432");
      _WindowsExternalTerminalService._DEFAULT_TERMINAL_WINDOWS = `${process.env.windir ? process.env.windir : "C:\\Windows"}\\${isWoW64 ? "Sysnative" : "System32"}\\cmd.exe`;
    }
    return _WindowsExternalTerminalService._DEFAULT_TERMINAL_WINDOWS;
  }
  static async getWtExePath() {
    try {
      return await processes.findExecutable("wt");
    } catch {
      return void 0;
    }
  }
};
_WindowsExternalTerminalService.CMD = "cmd.exe";
__decorateClass([
  memoize
], _WindowsExternalTerminalService, "getWtExePath", 1);
let WindowsExternalTerminalService = _WindowsExternalTerminalService;
const _MacExternalTerminalService = class _MacExternalTerminalService extends ExternalTerminalService {
  // osascript is the AppleScript interpreter on OS X
  openTerminal(configuration, cwd) {
    return this.spawnTerminal(cp, configuration, cwd);
  }
  runInTerminal(title, dir, args, envVars, settings) {
    const terminalApp = settings.osxExec || DEFAULT_TERMINAL_OSX;
    return new Promise((resolve, reject) => {
      if (terminalApp === DEFAULT_TERMINAL_OSX || terminalApp === "iTerm.app") {
        const script = terminalApp === DEFAULT_TERMINAL_OSX ? "TerminalHelper" : "iTermHelper";
        const scriptpath = FileAccess.asFileUri(`vs/workbench/contrib/externalTerminal/node/${script}.scpt`).fsPath;
        const osaArgs = [
          scriptpath,
          "-t",
          title || TERMINAL_TITLE,
          "-w",
          dir
        ];
        for (const a of args) {
          osaArgs.push("-a");
          osaArgs.push(a);
        }
        if (envVars) {
          const env2 = Object.assign({}, getSanitizedEnvironment(process), envVars);
          for (const key in env2) {
            const value = env2[key];
            if (value === null) {
              osaArgs.push("-u");
              osaArgs.push(key);
            } else {
              osaArgs.push("-e");
              osaArgs.push(`${key}=${value}`);
            }
          }
        }
        const osa = cp.spawn(_MacExternalTerminalService.OSASCRIPT, osaArgs);
        setupSpawnErrorHandling(osa, resolve, reject, terminalApp);
      } else if (terminalApp === "Ghostty.app") {
        const env2 = Object.assign({}, getSanitizedEnvironment(process), envVars);
        const openArgs = ["-na", "Ghostty.app", "--args"];
        openArgs.push("--working-directory=" + dir);
        openArgs.push("--wait-after-command=true");
        openArgs.push("-e", ...args);
        const cmd = cp.spawn("/usr/bin/open", openArgs, { env: env2 });
        setupSpawnErrorHandling(cmd, resolve, reject, terminalApp);
      } else {
        reject(new Error(nls.localize("mac.terminal.type.not.supported", "'{0}' not supported", terminalApp)));
      }
    });
  }
  spawnTerminal(spawner, configuration, cwd) {
    const terminalApp = configuration.osxExec || DEFAULT_TERMINAL_OSX;
    return new Promise((c, e) => {
      const args = ["-a", terminalApp];
      if (cwd) {
        args.push(cwd);
      }
      const env2 = getSanitizedEnvironment(process);
      const child = spawner.spawn("/usr/bin/open", args, { cwd, env: env2 });
      child.on("error", e);
      child.on("exit", () => c());
    });
  }
};
_MacExternalTerminalService.OSASCRIPT = "/usr/bin/osascript";
let MacExternalTerminalService = _MacExternalTerminalService;
const _LinuxExternalTerminalService = class _LinuxExternalTerminalService extends ExternalTerminalService {
  openTerminal(configuration, cwd) {
    return this.spawnTerminal(cp, configuration, cwd);
  }
  runInTerminal(title, dir, args, envVars, settings) {
    const execPromise = settings.linuxExec ? Promise.resolve(settings.linuxExec) : _LinuxExternalTerminalService.getDefaultTerminalLinuxReady();
    return new Promise((resolve, reject) => {
      execPromise.then((exec) => {
        const basename = path.basename(exec).toLowerCase();
        if (basename === "ghostty") {
          const ghosttyArgs = [];
          if (dir) {
            ghosttyArgs.push(`--working-directory=${dir}`);
          }
          ghosttyArgs.push("--wait-after-command=true");
          if (args.length) {
            ghosttyArgs.push("-e", ...args);
          }
          _LinuxExternalTerminalService.spawnTerminalWithEnv(exec, ghosttyArgs, dir, envVars, resolve, reject);
          return;
        }
        const termArgs = [];
        if (exec.indexOf("gnome-terminal") >= 0) {
          termArgs.push("-x");
        } else {
          termArgs.push("-e");
        }
        termArgs.push("bash");
        termArgs.push("-c");
        const bashCommand = `${quote(args)}; echo; read -p "${_LinuxExternalTerminalService.WAIT_MESSAGE}" -n1;`;
        termArgs.push(`''${bashCommand}''`);
        _LinuxExternalTerminalService.spawnTerminalWithEnv(exec, termArgs, dir, envVars, resolve, reject);
      });
    });
  }
  static spawnTerminalWithEnv(exec, args, dir, envVars, resolve, reject) {
    const env2 = Object.assign({}, getSanitizedEnvironment(process), envVars);
    Object.keys(env2).filter((v) => env2[v] === null).forEach((key) => delete env2[key]);
    const cmd = cp.spawn(exec, args, { cwd: dir, env: env2 });
    setupSpawnErrorHandling(cmd, resolve, reject, exec);
  }
  static async getDefaultTerminalLinuxReady() {
    if (!_LinuxExternalTerminalService._DEFAULT_TERMINAL_LINUX_READY) {
      if (!env.isLinux) {
        _LinuxExternalTerminalService._DEFAULT_TERMINAL_LINUX_READY = Promise.resolve("xterm");
      } else {
        const isDebian = await pfs.Promises.exists("/etc/debian_version");
        _LinuxExternalTerminalService._DEFAULT_TERMINAL_LINUX_READY = new Promise((r) => {
          if (isDebian) {
            r("x-terminal-emulator");
          } else if (process.env.DESKTOP_SESSION === "gnome" || process.env.DESKTOP_SESSION === "gnome-classic") {
            r("gnome-terminal");
          } else if (process.env.DESKTOP_SESSION === "kde-plasma") {
            r("konsole");
          } else if (process.env.COLORTERM) {
            r(process.env.COLORTERM);
          } else if (process.env.TERM) {
            r(process.env.TERM);
          } else {
            r("xterm");
          }
        });
      }
    }
    return _LinuxExternalTerminalService._DEFAULT_TERMINAL_LINUX_READY;
  }
  spawnTerminal(spawner, configuration, cwd) {
    const execPromise = configuration.linuxExec ? Promise.resolve(configuration.linuxExec) : _LinuxExternalTerminalService.getDefaultTerminalLinuxReady();
    return new Promise((c, e) => {
      execPromise.then((exec) => {
        const env2 = getSanitizedEnvironment(process);
        const basename = path.basename(exec).toLowerCase();
        const args = basename === "ghostty" && cwd ? [`--working-directory=${cwd}`] : [];
        const child = spawner.spawn(exec, args, { cwd, env: env2 });
        child.on("error", e);
        child.on("exit", () => c());
      });
    });
  }
};
_LinuxExternalTerminalService.WAIT_MESSAGE = nls.localize("press.any.key", "Press any key to continue...");
let LinuxExternalTerminalService = _LinuxExternalTerminalService;
function getSanitizedEnvironment(process2) {
  const env2 = { ...process2.env };
  sanitizeProcessEnvironment(env2);
  return env2;
}
function improveError(err) {
  if (err.errno === "ENOENT" && err.path) {
    return new Error(nls.localize("ext.term.app.not.found", "can't find terminal application '{0}'", err.path));
  }
  return err;
}
function setupSpawnErrorHandling(cmd, resolve, reject, terminalApp) {
  let stderr = "";
  cmd.on("error", (err) => {
    reject(improveError(err));
  });
  cmd.stderr?.on("data", (data) => {
    stderr += data.toString();
  });
  cmd.on("exit", (code) => {
    if (code === 0) {
      resolve(void 0);
    } else {
      if (stderr) {
        const lines = stderr.split("\n", 1);
        reject(new Error(lines[0]));
      } else {
        reject(new Error(nls.localize("terminal.launch.failed", "Launching '{0}' failed with exit code {1}", terminalApp, code)));
      }
    }
  });
}
function quote(args) {
  let r = "";
  for (const a of args) {
    if (a.indexOf(" ") >= 0) {
      r += '"' + a + '"';
    } else {
      r += a;
    }
    r += " ";
  }
  return r;
}
export {
  LinuxExternalTerminalService,
  MacExternalTerminalService,
  WindowsExternalTerminalService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZXJuYWxUZXJtaW5hbFxcbm9kZVxcZXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBjcCBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IG1lbW9pemUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgKiBhcyBlbnYgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgc2FuaXRpemVQcm9jZXNzRW52aXJvbm1lbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wcm9jZXNzZXMuanMnO1xuaW1wb3J0ICogYXMgcGZzIGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9wZnMuanMnO1xuaW1wb3J0ICogYXMgcHJvY2Vzc2VzIGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9wcm9jZXNzZXMuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX1RFUk1JTkFMX09TWCwgSUV4dGVybmFsVGVybWluYWxTZXJ2aWNlLCBJRXh0ZXJuYWxUZXJtaW5hbFNldHRpbmdzLCBJVGVybWluYWxGb3JQbGF0Zm9ybSB9IGZyb20gJy4uL2NvbW1vbi9leHRlcm5hbFRlcm1pbmFsLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEVudmlyb25tZW50IH0gZnJvbSAnLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcblxuY29uc3QgVEVSTUlOQUxfVElUTEUgPSBubHMubG9jYWxpemUoJ2NvbnNvbGUudGl0bGUnLCBcIlZTIENvZGUgQ29uc29sZVwiKTtcblxuYWJzdHJhY3QgY2xhc3MgRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2Uge1xuXHRwdWJsaWMgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGFzeW5jIGdldERlZmF1bHRUZXJtaW5hbEZvclBsYXRmb3JtcygpOiBQcm9taXNlPElUZXJtaW5hbEZvclBsYXRmb3JtPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHdpbmRvd3M6IFdpbmRvd3NFeHRlcm5hbFRlcm1pbmFsU2VydmljZS5nZXREZWZhdWx0VGVybWluYWxXaW5kb3dzKCksXG5cdFx0XHRsaW51eDogYXdhaXQgTGludXhFeHRlcm5hbFRlcm1pbmFsU2VydmljZS5nZXREZWZhdWx0VGVybWluYWxMaW51eFJlYWR5KCksXG5cdFx0XHRvc3g6IERFRkFVTFRfVEVSTUlOQUxfT1NYXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgV2luZG93c0V4dGVybmFsVGVybWluYWxTZXJ2aWNlIGV4dGVuZHMgRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UgaW1wbGVtZW50cyBJRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2Uge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDTUQgPSAnY21kLmV4ZSc7XG5cdHByaXZhdGUgc3RhdGljIF9ERUZBVUxUX1RFUk1JTkFMX1dJTkRPV1M6IHN0cmluZztcblxuXHRwdWJsaWMgb3BlblRlcm1pbmFsKGNvbmZpZ3VyYXRpb246IElFeHRlcm5hbFRlcm1pbmFsU2V0dGluZ3MsIGN3ZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnNwYXduVGVybWluYWwoY3AsIGNvbmZpZ3VyYXRpb24sIHByb2Nlc3Nlcy5nZXRXaW5kb3dzU2hlbGwoKSwgY3dkKTtcblx0fVxuXG5cdHB1YmxpYyBzcGF3blRlcm1pbmFsKHNwYXduZXI6IHR5cGVvZiBjcCwgY29uZmlndXJhdGlvbjogSUV4dGVybmFsVGVybWluYWxTZXR0aW5ncywgY29tbWFuZDogc3RyaW5nLCBjd2Q/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleGVjID0gY29uZmlndXJhdGlvbi53aW5kb3dzRXhlYyB8fCBXaW5kb3dzRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UuZ2V0RGVmYXVsdFRlcm1pbmFsV2luZG93cygpO1xuXG5cdFx0Ly8gTWFrZSB0aGUgZHJpdmUgbGV0dGVyIHVwcGVyY2FzZSBvbiBXaW5kb3dzIChzZWUgIzk0NDgpXG5cdFx0aWYgKGN3ZCAmJiBjd2RbMV0gPT09ICc6Jykge1xuXHRcdFx0Y3dkID0gY3dkWzBdLnRvVXBwZXJDYXNlKCkgKyBjd2Quc3Vic3RyKDEpO1xuXHRcdH1cblxuXHRcdC8vIGNtZGVyIGlnbm9yZXMgdGhlIGVudmlyb25tZW50IGN3ZCBhbmQgaW5zdGVhZCBvcHRzIHRvIGFsd2F5cyBvcGVuIGluICVVU0VSUFJPRklMRSVcblx0XHQvLyB1bmxlc3Mgb3RoZXJ3aXNlIHNwZWNpZmllZFxuXHRcdGNvbnN0IGJhc2VuYW1lID0gcGF0aC5iYXNlbmFtZShleGVjLCAnLmV4ZScpLnRvTG93ZXJDYXNlKCk7XG5cdFx0aWYgKGJhc2VuYW1lID09PSAnY21kZXInKSB7XG5cdFx0XHRzcGF3bmVyLnNwYXduKGV4ZWMsIGN3ZCA/IFtjd2RdIDogdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRjb25zdCBjbWRBcmdzID0gWycvYycsICdzdGFydCcsICcvd2FpdCddO1xuXHRcdGlmIChleGVjLmluZGV4T2YoJyAnKSA+PSAwKSB7XG5cdFx0XHQvLyBUaGUgXCJcIiBhcmd1bWVudCBpcyB0aGUgd2luZG93IHRpdGxlLiBXaXRob3V0IHRoaXMsIGV4ZWMgZG9lc24ndCB3b3JrIHdoZW4gdGhlIHBhdGhcblx0XHRcdC8vIGNvbnRhaW5zIHNwYWNlcy4gIzY1OTBcblx0XHRcdC8vIFRpdGxlIGlzIEV4ZWN1dGlvbiBQYXRoLiAjMjIwMTI5XG5cdFx0XHRjbWRBcmdzLnB1c2goZXhlYyk7XG5cdFx0fVxuXHRcdGNtZEFyZ3MucHVzaChleGVjKTtcblx0XHQvLyBBZGQgc3RhcnRpbmcgZGlyZWN0b3J5IHBhcmFtZXRlciBmb3IgV2luZG93cyBUZXJtaW5hbCAoc2VlICM5MDczNClcblx0XHRpZiAoYmFzZW5hbWUgPT09ICd3dCcpIHtcblx0XHRcdGNtZEFyZ3MucHVzaCgnLWQgLicpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigoYywgZSkgPT4ge1xuXHRcdFx0Y29uc3QgZW52ID0gZ2V0U2FuaXRpemVkRW52aXJvbm1lbnQocHJvY2Vzcyk7XG5cdFx0XHRjb25zdCBjaGlsZCA9IHNwYXduZXIuc3Bhd24oY29tbWFuZCwgY21kQXJncywgeyBjd2QsIGVudiwgZGV0YWNoZWQ6IHRydWUgfSk7XG5cdFx0XHRjaGlsZC5vbignZXJyb3InLCBlKTtcblx0XHRcdGNoaWxkLm9uKCdleGl0JywgKCkgPT4gYygpKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW5JblRlcm1pbmFsKHRpdGxlOiBzdHJpbmcsIGRpcjogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSwgZW52VmFyczogSVRlcm1pbmFsRW52aXJvbm1lbnQsIHNldHRpbmdzOiBJRXh0ZXJuYWxUZXJtaW5hbFNldHRpbmdzKTogUHJvbWlzZTxudW1iZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBleGVjID0gc2V0dGluZ3Mud2luZG93c0V4ZWMgfHwgV2luZG93c0V4dGVybmFsVGVybWluYWxTZXJ2aWNlLmdldERlZmF1bHRUZXJtaW5hbFdpbmRvd3MoKTtcblx0XHRjb25zdCB3dCA9IGF3YWl0IFdpbmRvd3NFeHRlcm5hbFRlcm1pbmFsU2VydmljZS5nZXRXdEV4ZVBhdGgoKTtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxudW1iZXIgfCB1bmRlZmluZWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblxuXHRcdFx0Y29uc3QgdGl0bGUgPSBgXCIke2Rpcn0gLSAke1RFUk1JTkFMX1RJVExFfVwiYDtcblx0XHRcdGNvbnN0IGNvbW1hbmQgPSBgXCIke2FyZ3Muam9pbignXCIgXCInKX1cIiAmIHBhdXNlYDsgLy8gdXNlICd8JyB0byBvbmx5IHBhdXNlIG9uIG5vbi16ZXJvIGV4aXQgY29kZVxuXG5cdFx0XHQvLyBtZXJnZSBlbnZpcm9ubWVudCB2YXJpYWJsZXMgaW50byBhIGNvcHkgb2YgdGhlIHByb2Nlc3MuZW52XG5cdFx0XHRjb25zdCBlbnYgPSBPYmplY3QuYXNzaWduKHt9LCBnZXRTYW5pdGl6ZWRFbnZpcm9ubWVudChwcm9jZXNzKSwgZW52VmFycyk7XG5cblx0XHRcdC8vIGRlbGV0ZSBlbnZpcm9ubWVudCB2YXJpYWJsZXMgdGhhdCBoYXZlIGEgbnVsbCB2YWx1ZVxuXHRcdFx0T2JqZWN0LmtleXMoZW52KS5maWx0ZXIodiA9PiBlbnZbdl0gPT09IG51bGwpLmZvckVhY2goa2V5ID0+IGRlbGV0ZSBlbnZba2V5XSk7XG5cblx0XHRcdGNvbnN0IG9wdGlvbnMgPSB7XG5cdFx0XHRcdGN3ZDogZGlyLFxuXHRcdFx0XHRlbnY6IGVudixcblx0XHRcdFx0d2luZG93c1ZlcmJhdGltQXJndW1lbnRzOiB0cnVlXG5cdFx0XHR9O1xuXG5cdFx0XHRsZXQgc3Bhd25FeGVjOiBzdHJpbmc7XG5cdFx0XHRsZXQgY21kQXJnczogc3RyaW5nW107XG5cblx0XHRcdGlmIChwYXRoLmJhc2VuYW1lKGV4ZWMsICcuZXhlJykgPT09ICd3dCcpIHtcblx0XHRcdFx0Ly8gSGFuZGxlIFdpbmRvd3MgVGVybWluYWwgc3BlY2lhbGx5OyAtZCB0byBzZXQgdGhlIGN3ZCBhbmQgcnVuIGEgY21kLmV4ZSBpbnN0YW5jZVxuXHRcdFx0XHQvLyBpbnNpZGUgaXRcblx0XHRcdFx0c3Bhd25FeGVjID0gZXhlYztcblx0XHRcdFx0Y21kQXJncyA9IFsnLWQnLCAnLicsIFdpbmRvd3NFeHRlcm5hbFRlcm1pbmFsU2VydmljZS5DTUQsICcvYycsIGNvbW1hbmRdO1xuXHRcdFx0fSBlbHNlIGlmICh3dCkge1xuXHRcdFx0XHQvLyBwcmVmZXIgdG8gdXNlIHRoZSB3aW5kb3cgdGVybWluYWwgdG8gc3Bhd24gaWYgaXQncyBhdmFpbGFibGUgaW5zdGVhZFxuXHRcdFx0XHQvLyBvZiBzdGFydCwgc2luY2UgdGhhdCBhbGxvd3MgY3RybCtjIGhhbmRsaW5nICgjODEzMjIpXG5cdFx0XHRcdHNwYXduRXhlYyA9IHd0O1xuXHRcdFx0XHRjbWRBcmdzID0gWyctZCcsICcuJywgZXhlYywgJy9jJywgY29tbWFuZF07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzcGF3bkV4ZWMgPSBXaW5kb3dzRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UuQ01EO1xuXHRcdFx0XHRjbWRBcmdzID0gWycvYycsICdzdGFydCcsIHRpdGxlLCAnL3dhaXQnLCBleGVjLCAnL2MnLCBgXCIke2NvbW1hbmR9XCJgXTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY21kID0gY3Auc3Bhd24oc3Bhd25FeGVjLCBjbWRBcmdzLCBvcHRpb25zKTtcblxuXHRcdFx0Y21kLm9uKCdlcnJvcicsIGVyciA9PiB7XG5cdFx0XHRcdHJlamVjdChpbXByb3ZlRXJyb3IoZXJyKSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBnZXREZWZhdWx0VGVybWluYWxXaW5kb3dzKCk6IHN0cmluZyB7XG5cdFx0aWYgKCFXaW5kb3dzRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UuX0RFRkFVTFRfVEVSTUlOQUxfV0lORE9XUykge1xuXHRcdFx0Y29uc3QgaXNXb1c2NCA9ICEhcHJvY2Vzcy5lbnYuaGFzT3duUHJvcGVydHkoJ1BST0NFU1NPUl9BUkNISVRFVzY0MzInKTtcblx0XHRcdFdpbmRvd3NFeHRlcm5hbFRlcm1pbmFsU2VydmljZS5fREVGQVVMVF9URVJNSU5BTF9XSU5ET1dTID0gYCR7cHJvY2Vzcy5lbnYud2luZGlyID8gcHJvY2Vzcy5lbnYud2luZGlyIDogJ0M6XFxcXFdpbmRvd3MnfVxcXFwke2lzV29XNjQgPyAnU3lzbmF0aXZlJyA6ICdTeXN0ZW0zMid9XFxcXGNtZC5leGVgO1xuXHRcdH1cblx0XHRyZXR1cm4gV2luZG93c0V4dGVybmFsVGVybWluYWxTZXJ2aWNlLl9ERUZBVUxUX1RFUk1JTkFMX1dJTkRPV1M7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRwcml2YXRlIHN0YXRpYyBhc3luYyBnZXRXdEV4ZVBhdGgoKSB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBwcm9jZXNzZXMuZmluZEV4ZWN1dGFibGUoJ3d0Jyk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWFjRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UgZXh0ZW5kcyBFeHRlcm5hbFRlcm1pbmFsU2VydmljZSBpbXBsZW1lbnRzIElFeHRlcm5hbFRlcm1pbmFsU2VydmljZSB7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE9TQVNDUklQVCA9ICcvdXNyL2Jpbi9vc2FzY3JpcHQnO1x0Ly8gb3Nhc2NyaXB0IGlzIHRoZSBBcHBsZVNjcmlwdCBpbnRlcnByZXRlciBvbiBPUyBYXG5cblx0cHVibGljIG9wZW5UZXJtaW5hbChjb25maWd1cmF0aW9uOiBJRXh0ZXJuYWxUZXJtaW5hbFNldHRpbmdzLCBjd2Q/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zcGF3blRlcm1pbmFsKGNwLCBjb25maWd1cmF0aW9uLCBjd2QpO1xuXHR9XG5cblx0cHVibGljIHJ1bkluVGVybWluYWwodGl0bGU6IHN0cmluZywgZGlyOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdLCBlbnZWYXJzOiBJVGVybWluYWxFbnZpcm9ubWVudCwgc2V0dGluZ3M6IElFeHRlcm5hbFRlcm1pbmFsU2V0dGluZ3MpOiBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Y29uc3QgdGVybWluYWxBcHAgPSBzZXR0aW5ncy5vc3hFeGVjIHx8IERFRkFVTFRfVEVSTUlOQUxfT1NYO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXG5cdFx0XHRpZiAodGVybWluYWxBcHAgPT09IERFRkFVTFRfVEVSTUlOQUxfT1NYIHx8IHRlcm1pbmFsQXBwID09PSAnaVRlcm0uYXBwJykge1xuXG5cdFx0XHRcdC8vIE9uIE9TIFggd2UgbGF1bmNoIGFuIEFwcGxlU2NyaXB0IHRoYXQgY3JlYXRlcyAob3IgcmV1c2VzKSBhIFRlcm1pbmFsIHdpbmRvd1xuXHRcdFx0XHQvLyBhbmQgdGhlbiBsYXVuY2hlcyB0aGUgcHJvZ3JhbSBpbnNpZGUgdGhhdCB3aW5kb3cuXG5cblx0XHRcdFx0Y29uc3Qgc2NyaXB0ID0gdGVybWluYWxBcHAgPT09IERFRkFVTFRfVEVSTUlOQUxfT1NYID8gJ1Rlcm1pbmFsSGVscGVyJyA6ICdpVGVybUhlbHBlcic7XG5cdFx0XHRcdGNvbnN0IHNjcmlwdHBhdGggPSBGaWxlQWNjZXNzLmFzRmlsZVVyaShgdnMvd29ya2JlbmNoL2NvbnRyaWIvZXh0ZXJuYWxUZXJtaW5hbC9ub2RlLyR7c2NyaXB0fS5zY3B0YCkuZnNQYXRoO1xuXG5cdFx0XHRcdGNvbnN0IG9zYUFyZ3MgPSBbXG5cdFx0XHRcdFx0c2NyaXB0cGF0aCxcblx0XHRcdFx0XHQnLXQnLCB0aXRsZSB8fCBURVJNSU5BTF9USVRMRSxcblx0XHRcdFx0XHQnLXcnLCBkaXIsXG5cdFx0XHRcdF07XG5cblx0XHRcdFx0Zm9yIChjb25zdCBhIG9mIGFyZ3MpIHtcblx0XHRcdFx0XHRvc2FBcmdzLnB1c2goJy1hJyk7XG5cdFx0XHRcdFx0b3NhQXJncy5wdXNoKGEpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGVudlZhcnMpIHtcblx0XHRcdFx0XHQvLyBtZXJnZSBlbnZpcm9ubWVudCB2YXJpYWJsZXMgaW50byBhIGNvcHkgb2YgdGhlIHByb2Nlc3MuZW52XG5cdFx0XHRcdFx0Y29uc3QgZW52ID0gT2JqZWN0LmFzc2lnbih7fSwgZ2V0U2FuaXRpemVkRW52aXJvbm1lbnQocHJvY2VzcyksIGVudlZhcnMpO1xuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gZW52KSB7XG5cdFx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IGVudltrZXldO1xuXHRcdFx0XHRcdFx0aWYgKHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRcdG9zYUFyZ3MucHVzaCgnLXUnKTtcblx0XHRcdFx0XHRcdFx0b3NhQXJncy5wdXNoKGtleSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRvc2FBcmdzLnB1c2goJy1lJyk7XG5cdFx0XHRcdFx0XHRcdG9zYUFyZ3MucHVzaChgJHtrZXl9PSR7dmFsdWV9YCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgb3NhID0gY3Auc3Bhd24oTWFjRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UuT1NBU0NSSVBULCBvc2FBcmdzKTtcblx0XHRcdFx0c2V0dXBTcGF3bkVycm9ySGFuZGxpbmcob3NhLCByZXNvbHZlLCByZWplY3QsIHRlcm1pbmFsQXBwKTtcblx0XHRcdH0gZWxzZSBpZiAodGVybWluYWxBcHAgPT09ICdHaG9zdHR5LmFwcCcpIHtcblx0XHRcdFx0Ly8gR2hvc3R0eSB1c2VzIENMSSBmbGFncyBkaXJlY3RseSBpbnN0ZWFkIG9mIEFwcGxlU2NyaXB0IGxpa2UgTWFjIFRlcm1pbmFsIGFuZCBpVGVybVxuXHRcdFx0XHQvLyBOb3RlOiAtbmEgaXMgcmVxdWlyZWQgKG5vdCBqdXN0IC1hKSBiZWNhdXNlIHdlIG5lZWQgdG8gc3Bhd24gYSBuZXcgaW5zdGFuY2UgdGhhdFxuXHRcdFx0XHQvLyByZWNlaXZlcyBvdXIgLS1hcmdzLiBXaXRoIGp1c3QgLWEsIGlmIEdob3N0dHkgaXMgYWxyZWFkeSBydW5uaW5nLCBvcGVuIHdpbGxcblx0XHRcdFx0Ly8gYWN0aXZhdGUgdGhlIGV4aXN0aW5nIGluc3RhbmNlIGFuZCBpZ25vcmUgLS1hcmdzIGVudGlyZWx5LlxuXHRcdFx0XHRjb25zdCBlbnYgPSBPYmplY3QuYXNzaWduKHt9LCBnZXRTYW5pdGl6ZWRFbnZpcm9ubWVudChwcm9jZXNzKSwgZW52VmFycyk7XG5cdFx0XHRcdGNvbnN0IG9wZW5BcmdzID0gWyctbmEnLCAnR2hvc3R0eS5hcHAnLCAnLS1hcmdzJ107XG5cdFx0XHRcdG9wZW5BcmdzLnB1c2goJy0td29ya2luZy1kaXJlY3Rvcnk9JyArIGRpcik7XG5cdFx0XHRcdG9wZW5BcmdzLnB1c2goJy0td2FpdC1hZnRlci1jb21tYW5kPXRydWUnKTtcblx0XHRcdFx0b3BlbkFyZ3MucHVzaCgnLWUnLCAuLi5hcmdzKTtcblxuXHRcdFx0XHRjb25zdCBjbWQgPSBjcC5zcGF3bignL3Vzci9iaW4vb3BlbicsIG9wZW5BcmdzLCB7IGVudiB9KTtcblx0XHRcdFx0c2V0dXBTcGF3bkVycm9ySGFuZGxpbmcoY21kLCByZXNvbHZlLCByZWplY3QsIHRlcm1pbmFsQXBwKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlamVjdChuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdtYWMudGVybWluYWwudHlwZS5ub3Quc3VwcG9ydGVkJywgXCInezB9JyBub3Qgc3VwcG9ydGVkXCIsIHRlcm1pbmFsQXBwKSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0c3Bhd25UZXJtaW5hbChzcGF3bmVyOiB0eXBlb2YgY3AsIGNvbmZpZ3VyYXRpb246IElFeHRlcm5hbFRlcm1pbmFsU2V0dGluZ3MsIGN3ZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRlcm1pbmFsQXBwID0gY29uZmlndXJhdGlvbi5vc3hFeGVjIHx8IERFRkFVTFRfVEVSTUlOQUxfT1NYO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChjLCBlKSA9PiB7XG5cdFx0XHRjb25zdCBhcmdzID0gWyctYScsIHRlcm1pbmFsQXBwXTtcblx0XHRcdGlmIChjd2QpIHtcblx0XHRcdFx0YXJncy5wdXNoKGN3ZCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnYgPSBnZXRTYW5pdGl6ZWRFbnZpcm9ubWVudChwcm9jZXNzKTtcblx0XHRcdGNvbnN0IGNoaWxkID0gc3Bhd25lci5zcGF3bignL3Vzci9iaW4vb3BlbicsIGFyZ3MsIHsgY3dkLCBlbnYgfSk7XG5cdFx0XHRjaGlsZC5vbignZXJyb3InLCBlKTtcblx0XHRcdGNoaWxkLm9uKCdleGl0JywgKCkgPT4gYygpKTtcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTGludXhFeHRlcm5hbFRlcm1pbmFsU2VydmljZSBleHRlbmRzIEV4dGVybmFsVGVybWluYWxTZXJ2aWNlIGltcGxlbWVudHMgSUV4dGVybmFsVGVybWluYWxTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBXQUlUX01FU1NBR0UgPSBubHMubG9jYWxpemUoJ3ByZXNzLmFueS5rZXknLCBcIlByZXNzIGFueSBrZXkgdG8gY29udGludWUuLi5cIik7XG5cblx0cHVibGljIG9wZW5UZXJtaW5hbChjb25maWd1cmF0aW9uOiBJRXh0ZXJuYWxUZXJtaW5hbFNldHRpbmdzLCBjd2Q/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zcGF3blRlcm1pbmFsKGNwLCBjb25maWd1cmF0aW9uLCBjd2QpO1xuXHR9XG5cblx0cHVibGljIHJ1bkluVGVybWluYWwodGl0bGU6IHN0cmluZywgZGlyOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdLCBlbnZWYXJzOiBJVGVybWluYWxFbnZpcm9ubWVudCwgc2V0dGluZ3M6IElFeHRlcm5hbFRlcm1pbmFsU2V0dGluZ3MpOiBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Y29uc3QgZXhlY1Byb21pc2UgPSBzZXR0aW5ncy5saW51eEV4ZWMgPyBQcm9taXNlLnJlc29sdmUoc2V0dGluZ3MubGludXhFeGVjKSA6IExpbnV4RXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UuZ2V0RGVmYXVsdFRlcm1pbmFsTGludXhSZWFkeSgpO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0ZXhlY1Byb21pc2UudGhlbihleGVjID0+IHtcblx0XHRcdFx0Y29uc3QgYmFzZW5hbWUgPSBwYXRoLmJhc2VuYW1lKGV4ZWMpLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGlmIChiYXNlbmFtZSA9PT0gJ2dob3N0dHknKSB7XG5cdFx0XHRcdFx0Y29uc3QgZ2hvc3R0eUFyZ3M6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdFx0aWYgKGRpcikge1xuXHRcdFx0XHRcdFx0Z2hvc3R0eUFyZ3MucHVzaChgLS13b3JraW5nLWRpcmVjdG9yeT0ke2Rpcn1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Z2hvc3R0eUFyZ3MucHVzaCgnLS13YWl0LWFmdGVyLWNvbW1hbmQ9dHJ1ZScpO1xuXHRcdFx0XHRcdGlmIChhcmdzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0Z2hvc3R0eUFyZ3MucHVzaCgnLWUnLCAuLi5hcmdzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0TGludXhFeHRlcm5hbFRlcm1pbmFsU2VydmljZS5zcGF3blRlcm1pbmFsV2l0aEVudihleGVjLCBnaG9zdHR5QXJncywgZGlyLCBlbnZWYXJzLCByZXNvbHZlLCByZWplY3QpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHRlcm1BcmdzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHQvL3Rlcm1BcmdzLnB1c2goJy0tdGl0bGUnKTtcblx0XHRcdFx0Ly90ZXJtQXJncy5wdXNoKGBcIiR7VEVSTUlOQUxfVElUTEV9XCJgKTtcblx0XHRcdFx0aWYgKGV4ZWMuaW5kZXhPZignZ25vbWUtdGVybWluYWwnKSA+PSAwKSB7XG5cdFx0XHRcdFx0dGVybUFyZ3MucHVzaCgnLXgnKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0ZXJtQXJncy5wdXNoKCctZScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRlcm1BcmdzLnB1c2goJ2Jhc2gnKTtcblx0XHRcdFx0dGVybUFyZ3MucHVzaCgnLWMnKTtcblxuXHRcdFx0XHRjb25zdCBiYXNoQ29tbWFuZCA9IGAke3F1b3RlKGFyZ3MpfTsgZWNobzsgcmVhZCAtcCBcIiR7TGludXhFeHRlcm5hbFRlcm1pbmFsU2VydmljZS5XQUlUX01FU1NBR0V9XCIgLW4xO2A7XG5cdFx0XHRcdHRlcm1BcmdzLnB1c2goYCcnJHtiYXNoQ29tbWFuZH0nJ2ApO1x0Ly8gd3JhcHBpbmcgYXJndW1lbnQgaW4gdHdvIHNldHMgb2YgJyBiZWNhdXNlIG5vZGUgaXMgc28gXCJmcmllbmRseVwiIHRoYXQgaXQgcmVtb3ZlcyBvbmUgc2V0Li4uXG5cblxuXHRcdFx0XHRMaW51eEV4dGVybmFsVGVybWluYWxTZXJ2aWNlLnNwYXduVGVybWluYWxXaXRoRW52KGV4ZWMsIHRlcm1BcmdzLCBkaXIsIGVudlZhcnMsIHJlc29sdmUsIHJlamVjdCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHNwYXduVGVybWluYWxXaXRoRW52KFxuXHRcdGV4ZWM6IHN0cmluZyxcblx0XHRhcmdzOiBzdHJpbmdbXSxcblx0XHRkaXI6IHN0cmluZyxcblx0XHRlbnZWYXJzOiBJVGVybWluYWxFbnZpcm9ubWVudCxcblx0XHRyZXNvbHZlOiAodmFsdWU6IG51bWJlciB8IFByb21pc2VMaWtlPG51bWJlciB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQpID0+IHZvaWQsXG5cdFx0cmVqZWN0OiAocmVhc29uPzogdW5rbm93bikgPT4gdm9pZFxuXHQpOiB2b2lkIHtcblx0XHRjb25zdCBlbnYgPSBPYmplY3QuYXNzaWduKHt9LCBnZXRTYW5pdGl6ZWRFbnZpcm9ubWVudChwcm9jZXNzKSwgZW52VmFycyk7XG5cblx0XHQvLyBkZWxldGUgZW52aXJvbm1lbnQgdmFyaWFibGVzIHRoYXQgaGF2ZSBhIG51bGwgdmFsdWVcblx0XHRPYmplY3Qua2V5cyhlbnYpLmZpbHRlcih2ID0+IGVudlt2XSA9PT0gbnVsbCkuZm9yRWFjaChrZXkgPT4gZGVsZXRlIGVudltrZXldKTtcblxuXHRcdGNvbnN0IGNtZCA9IGNwLnNwYXduKGV4ZWMsIGFyZ3MsIHsgY3dkOiBkaXIsIGVudiB9KTtcblx0XHRzZXR1cFNwYXduRXJyb3JIYW5kbGluZyhjbWQsIHJlc29sdmUsIHJlamVjdCwgZXhlYyk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfREVGQVVMVF9URVJNSU5BTF9MSU5VWF9SRUFEWTogUHJvbWlzZTxzdHJpbmc+O1xuXG5cdHB1YmxpYyBzdGF0aWMgYXN5bmMgZ2V0RGVmYXVsdFRlcm1pbmFsTGludXhSZWFkeSgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGlmICghTGludXhFeHRlcm5hbFRlcm1pbmFsU2VydmljZS5fREVGQVVMVF9URVJNSU5BTF9MSU5VWF9SRUFEWSkge1xuXHRcdFx0aWYgKCFlbnYuaXNMaW51eCkge1xuXHRcdFx0XHRMaW51eEV4dGVybmFsVGVybWluYWxTZXJ2aWNlLl9ERUZBVUxUX1RFUk1JTkFMX0xJTlVYX1JFQURZID0gUHJvbWlzZS5yZXNvbHZlKCd4dGVybScpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgaXNEZWJpYW4gPSBhd2FpdCBwZnMuUHJvbWlzZXMuZXhpc3RzKCcvZXRjL2RlYmlhbl92ZXJzaW9uJyk7XG5cdFx0XHRcdExpbnV4RXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UuX0RFRkFVTFRfVEVSTUlOQUxfTElOVVhfUkVBRFkgPSBuZXcgUHJvbWlzZTxzdHJpbmc+KHIgPT4ge1xuXHRcdFx0XHRcdGlmIChpc0RlYmlhbikge1xuXHRcdFx0XHRcdFx0cigneC10ZXJtaW5hbC1lbXVsYXRvcicpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocHJvY2Vzcy5lbnYuREVTS1RPUF9TRVNTSU9OID09PSAnZ25vbWUnIHx8IHByb2Nlc3MuZW52LkRFU0tUT1BfU0VTU0lPTiA9PT0gJ2dub21lLWNsYXNzaWMnKSB7XG5cdFx0XHRcdFx0XHRyKCdnbm9tZS10ZXJtaW5hbCcpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocHJvY2Vzcy5lbnYuREVTS1RPUF9TRVNTSU9OID09PSAna2RlLXBsYXNtYScpIHtcblx0XHRcdFx0XHRcdHIoJ2tvbnNvbGUnKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHByb2Nlc3MuZW52LkNPTE9SVEVSTSkge1xuXHRcdFx0XHRcdFx0cihwcm9jZXNzLmVudi5DT0xPUlRFUk0pO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocHJvY2Vzcy5lbnYuVEVSTSkge1xuXHRcdFx0XHRcdFx0cihwcm9jZXNzLmVudi5URVJNKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cigneHRlcm0nKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gTGludXhFeHRlcm5hbFRlcm1pbmFsU2VydmljZS5fREVGQVVMVF9URVJNSU5BTF9MSU5VWF9SRUFEWTtcblx0fVxuXG5cdHNwYXduVGVybWluYWwoc3Bhd25lcjogdHlwZW9mIGNwLCBjb25maWd1cmF0aW9uOiBJRXh0ZXJuYWxUZXJtaW5hbFNldHRpbmdzLCBjd2Q/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleGVjUHJvbWlzZSA9IGNvbmZpZ3VyYXRpb24ubGludXhFeGVjID8gUHJvbWlzZS5yZXNvbHZlKGNvbmZpZ3VyYXRpb24ubGludXhFeGVjKSA6IExpbnV4RXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UuZ2V0RGVmYXVsdFRlcm1pbmFsTGludXhSZWFkeSgpO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChjLCBlKSA9PiB7XG5cdFx0XHRleGVjUHJvbWlzZS50aGVuKGV4ZWMgPT4ge1xuXHRcdFx0XHRjb25zdCBlbnYgPSBnZXRTYW5pdGl6ZWRFbnZpcm9ubWVudChwcm9jZXNzKTtcblx0XHRcdFx0Y29uc3QgYmFzZW5hbWUgPSBwYXRoLmJhc2VuYW1lKGV4ZWMpLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGNvbnN0IGFyZ3MgPSBiYXNlbmFtZSA9PT0gJ2dob3N0dHknICYmIGN3ZCA/IFtgLS13b3JraW5nLWRpcmVjdG9yeT0ke2N3ZH1gXSA6IFtdO1xuXHRcdFx0XHRjb25zdCBjaGlsZCA9IHNwYXduZXIuc3Bhd24oZXhlYywgYXJncywgeyBjd2QsIGVudiB9KTtcblx0XHRcdFx0Y2hpbGQub24oJ2Vycm9yJywgZSk7XG5cdFx0XHRcdGNoaWxkLm9uKCdleGl0JywgKCkgPT4gYygpKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFNhbml0aXplZEVudmlyb25tZW50KHByb2Nlc3M6IE5vZGVKUy5Qcm9jZXNzKSB7XG5cdGNvbnN0IGVudiA9IHsgLi4ucHJvY2Vzcy5lbnYgfTtcblx0c2FuaXRpemVQcm9jZXNzRW52aXJvbm1lbnQoZW52KTtcblx0cmV0dXJuIGVudjtcbn1cblxuLyoqXG4gKiB0cmllcyB0byB0dXJuIE9TIGVycm9ycyBpbnRvIG1vcmUgbWVhbmluZ2Z1bCBlcnJvciBtZXNzYWdlc1xuICovXG5mdW5jdGlvbiBpbXByb3ZlRXJyb3IoZXJyOiBFcnJvciAmIHsgZXJybm8/OiBzdHJpbmc7IHBhdGg/OiBzdHJpbmcgfSk6IEVycm9yIHtcblx0aWYgKGVyci5lcnJubyA9PT0gJ0VOT0VOVCcgJiYgZXJyLnBhdGgpIHtcblx0XHRyZXR1cm4gbmV3IEVycm9yKG5scy5sb2NhbGl6ZSgnZXh0LnRlcm0uYXBwLm5vdC5mb3VuZCcsIFwiY2FuJ3QgZmluZCB0ZXJtaW5hbCBhcHBsaWNhdGlvbiAnezB9J1wiLCBlcnIucGF0aCkpO1xuXHR9XG5cdHJldHVybiBlcnI7XG59XG5cbi8qKlxuICogQXR0YWNoZXMgZXJyb3IgaGFuZGxpbmcgdG8gYSBzcGF3bmVkIGNoaWxkIHByb2Nlc3MgZm9yIHRlcm1pbmFsIGxhdW5jaGluZy5cbiAqL1xuZnVuY3Rpb24gc2V0dXBTcGF3bkVycm9ySGFuZGxpbmcoXG5cdGNtZDogY3AuQ2hpbGRQcm9jZXNzLFxuXHRyZXNvbHZlOiAodmFsdWU6IG51bWJlciB8IFByb21pc2VMaWtlPG51bWJlciB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQpID0+IHZvaWQsXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdHJlamVjdDogKHJlYXNvbj86IGFueSkgPT4gdm9pZCxcblx0dGVybWluYWxBcHA6IHN0cmluZ1xuKTogdm9pZCB7XG5cdGxldCBzdGRlcnIgPSAnJztcblx0Y21kLm9uKCdlcnJvcicsIGVyciA9PiB7XG5cdFx0cmVqZWN0KGltcHJvdmVFcnJvcihlcnIpKTtcblx0fSk7XG5cdGNtZC5zdGRlcnI/Lm9uKCdkYXRhJywgKGRhdGEpID0+IHtcblx0XHRzdGRlcnIgKz0gZGF0YS50b1N0cmluZygpO1xuXHR9KTtcblx0Y21kLm9uKCdleGl0JywgKGNvZGU6IG51bWJlcikgPT4ge1xuXHRcdGlmIChjb2RlID09PSAwKSB7XG5cdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChzdGRlcnIpIHtcblx0XHRcdFx0Y29uc3QgbGluZXMgPSBzdGRlcnIuc3BsaXQoJ1xcbicsIDEpO1xuXHRcdFx0XHRyZWplY3QobmV3IEVycm9yKGxpbmVzWzBdKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZWplY3QobmV3IEVycm9yKG5scy5sb2NhbGl6ZSgndGVybWluYWwubGF1bmNoLmZhaWxlZCcsIFwiTGF1bmNoaW5nICd7MH0nIGZhaWxlZCB3aXRoIGV4aXQgY29kZSB7MX1cIiwgdGVybWluYWxBcHAsIGNvZGUpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcbn1cblxuLyoqXG4gKiBRdW90ZSBhcmdzIGlmIG5lY2Vzc2FyeSBhbmQgY29tYmluZSBpbnRvIGEgc3BhY2Ugc2VwYXJhdGVkIHN0cmluZy5cbiAqL1xuZnVuY3Rpb24gcXVvdGUoYXJnczogc3RyaW5nW10pOiBzdHJpbmcge1xuXHRsZXQgciA9ICcnO1xuXHRmb3IgKGNvbnN0IGEgb2YgYXJncykge1xuXHRcdGlmIChhLmluZGV4T2YoJyAnKSA+PSAwKSB7XG5cdFx0XHRyICs9ICdcIicgKyBhICsgJ1wiJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0ciArPSBhO1xuXHRcdH1cblx0XHRyICs9ICcgJztcblx0fVxuXHRyZXR1cm4gcjtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFFBQVE7QUFDcEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFlBQVksVUFBVTtBQUN0QixZQUFZLFNBQVM7QUFDckIsU0FBUyxrQ0FBa0M7QUFDM0MsWUFBWSxTQUFTO0FBQ3JCLFlBQVksZUFBZTtBQUMzQixZQUFZLFNBQVM7QUFDckIsU0FBUyw0QkFBdUc7QUFHaEgsTUFBTSxpQkFBaUIsSUFBSSxTQUFTLGlCQUFpQixpQkFBaUI7QUFFdEUsTUFBZSx3QkFBd0I7QUFBQSxFQUd0QyxNQUFNLGlDQUFnRTtBQUNyRSxXQUFPO0FBQUEsTUFDTixTQUFTLCtCQUErQiwwQkFBMEI7QUFBQSxNQUNsRSxPQUFPLE1BQU0sNkJBQTZCLDZCQUE2QjtBQUFBLE1BQ3ZFLEtBQUs7QUFBQSxJQUNOO0FBQUEsRUFDRDtBQUNEO0FBRU8sTUFBTSxrQ0FBTixNQUFNLHdDQUF1Qyx3QkFBNEQ7QUFBQSxFQUl4RyxhQUFhLGVBQTBDLEtBQTZCO0FBQzFGLFdBQU8sS0FBSyxjQUFjLElBQUksZUFBZSxVQUFVLGdCQUFnQixHQUFHLEdBQUc7QUFBQSxFQUM5RTtBQUFBLEVBRU8sY0FBYyxTQUFvQixlQUEwQyxTQUFpQixLQUE2QjtBQUNoSSxVQUFNLE9BQU8sY0FBYyxlQUFlLGdDQUErQiwwQkFBMEI7QUFHbkcsUUFBSSxPQUFPLElBQUksQ0FBQyxNQUFNLEtBQUs7QUFDMUIsWUFBTSxJQUFJLENBQUMsRUFBRSxZQUFZLElBQUksSUFBSSxPQUFPLENBQUM7QUFBQSxJQUMxQztBQUlBLFVBQU0sV0FBVyxLQUFLLFNBQVMsTUFBTSxNQUFNLEVBQUUsWUFBWTtBQUN6RCxRQUFJLGFBQWEsU0FBUztBQUN6QixjQUFRLE1BQU0sTUFBTSxNQUFNLENBQUMsR0FBRyxJQUFJLE1BQVM7QUFDM0MsYUFBTyxRQUFRLFFBQVEsTUFBUztBQUFBLElBQ2pDO0FBRUEsVUFBTSxVQUFVLENBQUMsTUFBTSxTQUFTLE9BQU87QUFDdkMsUUFBSSxLQUFLLFFBQVEsR0FBRyxLQUFLLEdBQUc7QUFJM0IsY0FBUSxLQUFLLElBQUk7QUFBQSxJQUNsQjtBQUNBLFlBQVEsS0FBSyxJQUFJO0FBRWpCLFFBQUksYUFBYSxNQUFNO0FBQ3RCLGNBQVEsS0FBSyxNQUFNO0FBQUEsSUFDcEI7QUFFQSxXQUFPLElBQUksUUFBYyxDQUFDLEdBQUcsTUFBTTtBQUNsQyxZQUFNQSxPQUFNLHdCQUF3QixPQUFPO0FBQzNDLFlBQU0sUUFBUSxRQUFRLE1BQU0sU0FBUyxTQUFTLEVBQUUsS0FBSyxLQUFBQSxNQUFLLFVBQVUsS0FBSyxDQUFDO0FBQzFFLFlBQU0sR0FBRyxTQUFTLENBQUM7QUFDbkIsWUFBTSxHQUFHLFFBQVEsTUFBTSxFQUFFLENBQUM7QUFBQSxJQUMzQixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYSxjQUFjLE9BQWUsS0FBYSxNQUFnQixTQUErQixVQUFrRTtBQUN2SyxVQUFNLE9BQU8sU0FBUyxlQUFlLGdDQUErQiwwQkFBMEI7QUFDOUYsVUFBTSxLQUFLLE1BQU0sZ0NBQStCLGFBQWE7QUFFN0QsV0FBTyxJQUFJLFFBQTRCLENBQUMsU0FBUyxXQUFXO0FBRTNELFlBQU1DLFNBQVEsSUFBSSxHQUFHLE1BQU0sY0FBYztBQUN6QyxZQUFNLFVBQVUsSUFBSSxLQUFLLEtBQUssS0FBSyxDQUFDO0FBR3BDLFlBQU1ELE9BQU0sT0FBTyxPQUFPLENBQUMsR0FBRyx3QkFBd0IsT0FBTyxHQUFHLE9BQU87QUFHdkUsYUFBTyxLQUFLQSxJQUFHLEVBQUUsT0FBTyxPQUFLQSxLQUFJLENBQUMsTUFBTSxJQUFJLEVBQUUsUUFBUSxTQUFPLE9BQU9BLEtBQUksR0FBRyxDQUFDO0FBRTVFLFlBQU0sVUFBVTtBQUFBLFFBQ2YsS0FBSztBQUFBLFFBQ0wsS0FBS0E7QUFBQSxRQUNMLDBCQUEwQjtBQUFBLE1BQzNCO0FBRUEsVUFBSTtBQUNKLFVBQUk7QUFFSixVQUFJLEtBQUssU0FBUyxNQUFNLE1BQU0sTUFBTSxNQUFNO0FBR3pDLG9CQUFZO0FBQ1osa0JBQVUsQ0FBQyxNQUFNLEtBQUssZ0NBQStCLEtBQUssTUFBTSxPQUFPO0FBQUEsTUFDeEUsV0FBVyxJQUFJO0FBR2Qsb0JBQVk7QUFDWixrQkFBVSxDQUFDLE1BQU0sS0FBSyxNQUFNLE1BQU0sT0FBTztBQUFBLE1BQzFDLE9BQU87QUFDTixvQkFBWSxnQ0FBK0I7QUFDM0Msa0JBQVUsQ0FBQyxNQUFNLFNBQVNDLFFBQU8sU0FBUyxNQUFNLE1BQU0sSUFBSSxPQUFPLEdBQUc7QUFBQSxNQUNyRTtBQUVBLFlBQU0sTUFBTSxHQUFHLE1BQU0sV0FBVyxTQUFTLE9BQU87QUFFaEQsVUFBSSxHQUFHLFNBQVMsU0FBTztBQUN0QixlQUFPLGFBQWEsR0FBRyxDQUFDO0FBQUEsTUFDekIsQ0FBQztBQUVELGNBQVEsTUFBUztBQUFBLElBQ2xCLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxPQUFjLDRCQUFvQztBQUNqRCxRQUFJLENBQUMsZ0NBQStCLDJCQUEyQjtBQUM5RCxZQUFNLFVBQVUsQ0FBQyxDQUFDLFFBQVEsSUFBSSxlQUFlLHdCQUF3QjtBQUNyRSxzQ0FBK0IsNEJBQTRCLEdBQUcsUUFBUSxJQUFJLFNBQVMsUUFBUSxJQUFJLFNBQVMsYUFBYSxLQUFLLFVBQVUsY0FBYyxVQUFVO0FBQUEsSUFDN0o7QUFDQSxXQUFPLGdDQUErQjtBQUFBLEVBQ3ZDO0FBQUEsRUFHQSxhQUFxQixlQUFlO0FBQ25DLFFBQUk7QUFDSCxhQUFPLE1BQU0sVUFBVSxlQUFlLElBQUk7QUFBQSxJQUMzQyxRQUFRO0FBQ1AsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0Q7QUE5R2EsZ0NBQ1ksTUFBTTtBQXNHVDtBQUFBLEVBRHBCO0FBQUEsR0F0R1csaUNBdUdTO0FBdkdmLElBQU0saUNBQU47QUFnSEEsTUFBTSw4QkFBTixNQUFNLG9DQUFtQyx3QkFBNEQ7QUFBQTtBQUFBLEVBR3BHLGFBQWEsZUFBMEMsS0FBNkI7QUFDMUYsV0FBTyxLQUFLLGNBQWMsSUFBSSxlQUFlLEdBQUc7QUFBQSxFQUNqRDtBQUFBLEVBRU8sY0FBYyxPQUFlLEtBQWEsTUFBZ0IsU0FBK0IsVUFBa0U7QUFFakssVUFBTSxjQUFjLFNBQVMsV0FBVztBQUV4QyxXQUFPLElBQUksUUFBNEIsQ0FBQyxTQUFTLFdBQVc7QUFFM0QsVUFBSSxnQkFBZ0Isd0JBQXdCLGdCQUFnQixhQUFhO0FBS3hFLGNBQU0sU0FBUyxnQkFBZ0IsdUJBQXVCLG1CQUFtQjtBQUN6RSxjQUFNLGFBQWEsV0FBVyxVQUFVLDhDQUE4QyxNQUFNLE9BQU8sRUFBRTtBQUVyRyxjQUFNLFVBQVU7QUFBQSxVQUNmO0FBQUEsVUFDQTtBQUFBLFVBQU0sU0FBUztBQUFBLFVBQ2Y7QUFBQSxVQUFNO0FBQUEsUUFDUDtBQUVBLG1CQUFXLEtBQUssTUFBTTtBQUNyQixrQkFBUSxLQUFLLElBQUk7QUFDakIsa0JBQVEsS0FBSyxDQUFDO0FBQUEsUUFDZjtBQUVBLFlBQUksU0FBUztBQUVaLGdCQUFNRCxPQUFNLE9BQU8sT0FBTyxDQUFDLEdBQUcsd0JBQXdCLE9BQU8sR0FBRyxPQUFPO0FBRXZFLHFCQUFXLE9BQU9BLE1BQUs7QUFDdEIsa0JBQU0sUUFBUUEsS0FBSSxHQUFHO0FBQ3JCLGdCQUFJLFVBQVUsTUFBTTtBQUNuQixzQkFBUSxLQUFLLElBQUk7QUFDakIsc0JBQVEsS0FBSyxHQUFHO0FBQUEsWUFDakIsT0FBTztBQUNOLHNCQUFRLEtBQUssSUFBSTtBQUNqQixzQkFBUSxLQUFLLEdBQUcsR0FBRyxJQUFJLEtBQUssRUFBRTtBQUFBLFlBQy9CO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFFQSxjQUFNLE1BQU0sR0FBRyxNQUFNLDRCQUEyQixXQUFXLE9BQU87QUFDbEUsZ0NBQXdCLEtBQUssU0FBUyxRQUFRLFdBQVc7QUFBQSxNQUMxRCxXQUFXLGdCQUFnQixlQUFlO0FBS3pDLGNBQU1BLE9BQU0sT0FBTyxPQUFPLENBQUMsR0FBRyx3QkFBd0IsT0FBTyxHQUFHLE9BQU87QUFDdkUsY0FBTSxXQUFXLENBQUMsT0FBTyxlQUFlLFFBQVE7QUFDaEQsaUJBQVMsS0FBSyx5QkFBeUIsR0FBRztBQUMxQyxpQkFBUyxLQUFLLDJCQUEyQjtBQUN6QyxpQkFBUyxLQUFLLE1BQU0sR0FBRyxJQUFJO0FBRTNCLGNBQU0sTUFBTSxHQUFHLE1BQU0saUJBQWlCLFVBQVUsRUFBRSxLQUFBQSxLQUFJLENBQUM7QUFDdkQsZ0NBQXdCLEtBQUssU0FBUyxRQUFRLFdBQVc7QUFBQSxNQUMxRCxPQUFPO0FBQ04sZUFBTyxJQUFJLE1BQU0sSUFBSSxTQUFTLG1DQUFtQyx1QkFBdUIsV0FBVyxDQUFDLENBQUM7QUFBQSxNQUN0RztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLGNBQWMsU0FBb0IsZUFBMEMsS0FBNkI7QUFDeEcsVUFBTSxjQUFjLGNBQWMsV0FBVztBQUU3QyxXQUFPLElBQUksUUFBYyxDQUFDLEdBQUcsTUFBTTtBQUNsQyxZQUFNLE9BQU8sQ0FBQyxNQUFNLFdBQVc7QUFDL0IsVUFBSSxLQUFLO0FBQ1IsYUFBSyxLQUFLLEdBQUc7QUFBQSxNQUNkO0FBQ0EsWUFBTUEsT0FBTSx3QkFBd0IsT0FBTztBQUMzQyxZQUFNLFFBQVEsUUFBUSxNQUFNLGlCQUFpQixNQUFNLEVBQUUsS0FBSyxLQUFBQSxLQUFJLENBQUM7QUFDL0QsWUFBTSxHQUFHLFNBQVMsQ0FBQztBQUNuQixZQUFNLEdBQUcsUUFBUSxNQUFNLEVBQUUsQ0FBQztBQUFBLElBQzNCLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUFuRmEsNEJBQ1ksWUFBWTtBQUQ5QixJQUFNLDZCQUFOO0FBcUZBLE1BQU0sZ0NBQU4sTUFBTSxzQ0FBcUMsd0JBQTREO0FBQUEsRUFJdEcsYUFBYSxlQUEwQyxLQUE2QjtBQUMxRixXQUFPLEtBQUssY0FBYyxJQUFJLGVBQWUsR0FBRztBQUFBLEVBQ2pEO0FBQUEsRUFFTyxjQUFjLE9BQWUsS0FBYSxNQUFnQixTQUErQixVQUFrRTtBQUVqSyxVQUFNLGNBQWMsU0FBUyxZQUFZLFFBQVEsUUFBUSxTQUFTLFNBQVMsSUFBSSw4QkFBNkIsNkJBQTZCO0FBRXpJLFdBQU8sSUFBSSxRQUE0QixDQUFDLFNBQVMsV0FBVztBQUMzRCxrQkFBWSxLQUFLLFVBQVE7QUFDeEIsY0FBTSxXQUFXLEtBQUssU0FBUyxJQUFJLEVBQUUsWUFBWTtBQUNqRCxZQUFJLGFBQWEsV0FBVztBQUMzQixnQkFBTSxjQUF3QixDQUFDO0FBQy9CLGNBQUksS0FBSztBQUNSLHdCQUFZLEtBQUssdUJBQXVCLEdBQUcsRUFBRTtBQUFBLFVBQzlDO0FBQ0Esc0JBQVksS0FBSywyQkFBMkI7QUFDNUMsY0FBSSxLQUFLLFFBQVE7QUFDaEIsd0JBQVksS0FBSyxNQUFNLEdBQUcsSUFBSTtBQUFBLFVBQy9CO0FBQ0Esd0NBQTZCLHFCQUFxQixNQUFNLGFBQWEsS0FBSyxTQUFTLFNBQVMsTUFBTTtBQUNsRztBQUFBLFFBQ0Q7QUFFQSxjQUFNLFdBQXFCLENBQUM7QUFHNUIsWUFBSSxLQUFLLFFBQVEsZ0JBQWdCLEtBQUssR0FBRztBQUN4QyxtQkFBUyxLQUFLLElBQUk7QUFBQSxRQUNuQixPQUFPO0FBQ04sbUJBQVMsS0FBSyxJQUFJO0FBQUEsUUFDbkI7QUFDQSxpQkFBUyxLQUFLLE1BQU07QUFDcEIsaUJBQVMsS0FBSyxJQUFJO0FBRWxCLGNBQU0sY0FBYyxHQUFHLE1BQU0sSUFBSSxDQUFDLG9CQUFvQiw4QkFBNkIsWUFBWTtBQUMvRixpQkFBUyxLQUFLLEtBQUssV0FBVyxJQUFJO0FBR2xDLHNDQUE2QixxQkFBcUIsTUFBTSxVQUFVLEtBQUssU0FBUyxTQUFTLE1BQU07QUFBQSxNQUNoRyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsT0FBZSxxQkFDZCxNQUNBLE1BQ0EsS0FDQSxTQUNBLFNBQ0EsUUFDTztBQUNQLFVBQU1BLE9BQU0sT0FBTyxPQUFPLENBQUMsR0FBRyx3QkFBd0IsT0FBTyxHQUFHLE9BQU87QUFHdkUsV0FBTyxLQUFLQSxJQUFHLEVBQUUsT0FBTyxPQUFLQSxLQUFJLENBQUMsTUFBTSxJQUFJLEVBQUUsUUFBUSxTQUFPLE9BQU9BLEtBQUksR0FBRyxDQUFDO0FBRTVFLFVBQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxNQUFNLEVBQUUsS0FBSyxLQUFLLEtBQUFBLEtBQUksQ0FBQztBQUNsRCw0QkFBd0IsS0FBSyxTQUFTLFFBQVEsSUFBSTtBQUFBLEVBQ25EO0FBQUEsRUFJQSxhQUFvQiwrQkFBZ0Q7QUFDbkUsUUFBSSxDQUFDLDhCQUE2QiwrQkFBK0I7QUFDaEUsVUFBSSxDQUFDLElBQUksU0FBUztBQUNqQixzQ0FBNkIsZ0NBQWdDLFFBQVEsUUFBUSxPQUFPO0FBQUEsTUFDckYsT0FBTztBQUNOLGNBQU0sV0FBVyxNQUFNLElBQUksU0FBUyxPQUFPLHFCQUFxQjtBQUNoRSxzQ0FBNkIsZ0NBQWdDLElBQUksUUFBZ0IsT0FBSztBQUNyRixjQUFJLFVBQVU7QUFDYixjQUFFLHFCQUFxQjtBQUFBLFVBQ3hCLFdBQVcsUUFBUSxJQUFJLG9CQUFvQixXQUFXLFFBQVEsSUFBSSxvQkFBb0IsaUJBQWlCO0FBQ3RHLGNBQUUsZ0JBQWdCO0FBQUEsVUFDbkIsV0FBVyxRQUFRLElBQUksb0JBQW9CLGNBQWM7QUFDeEQsY0FBRSxTQUFTO0FBQUEsVUFDWixXQUFXLFFBQVEsSUFBSSxXQUFXO0FBQ2pDLGNBQUUsUUFBUSxJQUFJLFNBQVM7QUFBQSxVQUN4QixXQUFXLFFBQVEsSUFBSSxNQUFNO0FBQzVCLGNBQUUsUUFBUSxJQUFJLElBQUk7QUFBQSxVQUNuQixPQUFPO0FBQ04sY0FBRSxPQUFPO0FBQUEsVUFDVjtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBQ0EsV0FBTyw4QkFBNkI7QUFBQSxFQUNyQztBQUFBLEVBRUEsY0FBYyxTQUFvQixlQUEwQyxLQUE2QjtBQUN4RyxVQUFNLGNBQWMsY0FBYyxZQUFZLFFBQVEsUUFBUSxjQUFjLFNBQVMsSUFBSSw4QkFBNkIsNkJBQTZCO0FBRW5KLFdBQU8sSUFBSSxRQUFjLENBQUMsR0FBRyxNQUFNO0FBQ2xDLGtCQUFZLEtBQUssVUFBUTtBQUN4QixjQUFNQSxPQUFNLHdCQUF3QixPQUFPO0FBQzNDLGNBQU0sV0FBVyxLQUFLLFNBQVMsSUFBSSxFQUFFLFlBQVk7QUFDakQsY0FBTSxPQUFPLGFBQWEsYUFBYSxNQUFNLENBQUMsdUJBQXVCLEdBQUcsRUFBRSxJQUFJLENBQUM7QUFDL0UsY0FBTSxRQUFRLFFBQVEsTUFBTSxNQUFNLE1BQU0sRUFBRSxLQUFLLEtBQUFBLEtBQUksQ0FBQztBQUNwRCxjQUFNLEdBQUcsU0FBUyxDQUFDO0FBQ25CLGNBQU0sR0FBRyxRQUFRLE1BQU0sRUFBRSxDQUFDO0FBQUEsTUFDM0IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQTNHYSw4QkFFWSxlQUFlLElBQUksU0FBUyxpQkFBaUIsOEJBQThCO0FBRjdGLElBQU0sK0JBQU47QUE2R1AsU0FBUyx3QkFBd0JFLFVBQXlCO0FBQ3pELFFBQU1GLE9BQU0sRUFBRSxHQUFHRSxTQUFRLElBQUk7QUFDN0IsNkJBQTJCRixJQUFHO0FBQzlCLFNBQU9BO0FBQ1I7QUFLQSxTQUFTLGFBQWEsS0FBdUQ7QUFDNUUsTUFBSSxJQUFJLFVBQVUsWUFBWSxJQUFJLE1BQU07QUFDdkMsV0FBTyxJQUFJLE1BQU0sSUFBSSxTQUFTLDBCQUEwQix5Q0FBeUMsSUFBSSxJQUFJLENBQUM7QUFBQSxFQUMzRztBQUNBLFNBQU87QUFDUjtBQUtBLFNBQVMsd0JBQ1IsS0FDQSxTQUVBLFFBQ0EsYUFDTztBQUNQLE1BQUksU0FBUztBQUNiLE1BQUksR0FBRyxTQUFTLFNBQU87QUFDdEIsV0FBTyxhQUFhLEdBQUcsQ0FBQztBQUFBLEVBQ3pCLENBQUM7QUFDRCxNQUFJLFFBQVEsR0FBRyxRQUFRLENBQUMsU0FBUztBQUNoQyxjQUFVLEtBQUssU0FBUztBQUFBLEVBQ3pCLENBQUM7QUFDRCxNQUFJLEdBQUcsUUFBUSxDQUFDLFNBQWlCO0FBQ2hDLFFBQUksU0FBUyxHQUFHO0FBQ2YsY0FBUSxNQUFTO0FBQUEsSUFDbEIsT0FBTztBQUNOLFVBQUksUUFBUTtBQUNYLGNBQU0sUUFBUSxPQUFPLE1BQU0sTUFBTSxDQUFDO0FBQ2xDLGVBQU8sSUFBSSxNQUFNLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFBQSxNQUMzQixPQUFPO0FBQ04sZUFBTyxJQUFJLE1BQU0sSUFBSSxTQUFTLDBCQUEwQiw2Q0FBNkMsYUFBYSxJQUFJLENBQUMsQ0FBQztBQUFBLE1BQ3pIO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUNGO0FBS0EsU0FBUyxNQUFNLE1BQXdCO0FBQ3RDLE1BQUksSUFBSTtBQUNSLGFBQVcsS0FBSyxNQUFNO0FBQ3JCLFFBQUksRUFBRSxRQUFRLEdBQUcsS0FBSyxHQUFHO0FBQ3hCLFdBQUssTUFBTSxJQUFJO0FBQUEsSUFDaEIsT0FBTztBQUNOLFdBQUs7QUFBQSxJQUNOO0FBQ0EsU0FBSztBQUFBLEVBQ047QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbImVudiIsICJ0aXRsZSIsICJwcm9jZXNzIl0KfQo=
