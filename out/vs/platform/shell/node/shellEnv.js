import { spawn } from "child_process";
import { basename } from "../../../base/common/path.js";
import { localize } from "../../../nls.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { CancellationError, isCancellationError } from "../../../base/common/errors.js";
import { isWindows, OS } from "../../../base/common/platform.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { getSystemShell } from "../../../base/node/shell.js";
import { isLaunchedFromCli } from "../../environment/node/argvHelper.js";
import { Promises } from "../../../base/common/async.js";
import { clamp } from "../../../base/common/numbers.js";
let unixShellEnvPromise = void 0;
async function getResolvedShellEnv(configurationService, logService, args, env) {
  if (args["force-disable-user-env"]) {
    logService.trace("resolveShellEnv(): skipped (--force-disable-user-env)");
    return {};
  } else if (isWindows) {
    logService.trace("resolveShellEnv(): skipped (Windows)");
    return {};
  } else if (isLaunchedFromCli(env) && !args["force-user-env"]) {
    logService.trace("resolveShellEnv(): skipped (VSCODE_CLI is set)");
    return {};
  } else {
    if (isLaunchedFromCli(env)) {
      logService.trace("resolveShellEnv(): running (--force-user-env)");
    } else {
      logService.trace("resolveShellEnv(): running (macOS/Linux)");
    }
    if (!unixShellEnvPromise) {
      unixShellEnvPromise = Promises.withAsyncBody(async (resolve, reject) => {
        const cts = new CancellationTokenSource();
        let timeoutValue = 1e4;
        const configuredTimeoutValue = configurationService.getValue("application.shellEnvironmentResolutionTimeout");
        if (typeof configuredTimeoutValue === "number") {
          timeoutValue = clamp(configuredTimeoutValue, 1, 120) * 1e3;
        }
        const timeout = setTimeout(() => {
          cts.dispose(true);
          reject(new Error(localize("resolveShellEnvTimeout", "Unable to resolve your shell environment in a reasonable time. Please review your shell configuration and restart.")));
        }, timeoutValue);
        try {
          resolve(await doResolveUnixShellEnv(logService, cts.token));
        } catch (error) {
          if (!isCancellationError(error) && !cts.token.isCancellationRequested) {
            reject(new Error(localize("resolveShellEnvError", "Unable to resolve your shell environment: {0}", toErrorMessage(error))));
          } else {
            resolve({});
          }
        } finally {
          clearTimeout(timeout);
          cts.dispose();
        }
      });
    }
    return unixShellEnvPromise;
  }
}
async function doResolveUnixShellEnv(logService, token) {
  const runAsNode = process.env["ELECTRON_RUN_AS_NODE"];
  logService.trace("getUnixShellEnvironment#runAsNode", runAsNode);
  const noAttach = process.env["ELECTRON_NO_ATTACH_CONSOLE"];
  logService.trace("getUnixShellEnvironment#noAttach", noAttach);
  const mark = generateUuid().replace(/-/g, "").substr(0, 12);
  const regex = new RegExp(mark + "({.*})" + mark);
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    ELECTRON_NO_ATTACH_CONSOLE: "1",
    VSCODE_RESOLVING_ENVIRONMENT: "1"
  };
  logService.trace("getUnixShellEnvironment#env", env);
  const systemShellUnix = await getSystemShell(OS, env);
  logService.trace("getUnixShellEnvironment#shell", systemShellUnix);
  return new Promise((resolve, reject) => {
    if (token.isCancellationRequested) {
      return reject(new CancellationError());
    }
    const name = basename(systemShellUnix);
    let command, shellArgs;
    const extraArgs = "";
    if (/^(?:pwsh|powershell)(?:-preview)?$/.test(name)) {
      command = `& '${process.execPath}' ${extraArgs} -p '''${mark}'' + JSON.stringify(process.env) + ''${mark}'''`;
      shellArgs = ["-Login", "-Command"];
    } else if (name === "nu") {
      command = `^'${process.execPath}' ${extraArgs} -p '"${mark}" + JSON.stringify(process.env) + "${mark}"'`;
      shellArgs = ["-i", "-l", "-c"];
    } else if (name === "xonsh") {
      command = `import os, json; print("${mark}", json.dumps(dict(os.environ)), "${mark}")`;
      shellArgs = ["-i", "-l", "-c"];
    } else {
      command = `'${process.execPath}' ${extraArgs} -p '"${mark}" + JSON.stringify(process.env) + "${mark}"'`;
      if (name === "tcsh" || name === "csh") {
        shellArgs = ["-ic"];
      } else {
        shellArgs = ["-i", "-l", "-c"];
      }
    }
    logService.trace("getUnixShellEnvironment#spawn", JSON.stringify(shellArgs), command);
    const child = spawn(systemShellUnix, [...shellArgs, command], {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env
    });
    token.onCancellationRequested(() => {
      child.kill();
      return reject(new CancellationError());
    });
    child.on("error", (err) => {
      logService.error("getUnixShellEnvironment#errorChildProcess", toErrorMessage(err));
      reject(err);
    });
    const buffers = [];
    child.stdout.on("data", (b) => buffers.push(b));
    const stderr = [];
    child.stderr.on("data", (b) => stderr.push(b));
    child.on("close", (code, signal) => {
      const raw = Buffer.concat(buffers).toString("utf8");
      logService.trace("getUnixShellEnvironment#raw", raw);
      const stderrStr = Buffer.concat(stderr).toString("utf8");
      if (stderrStr.trim()) {
        logService.trace("getUnixShellEnvironment#stderr", stderrStr);
      }
      if (code || signal) {
        return reject(new Error(localize("resolveShellEnvExitError", "Unexpected exit code from spawned shell (code {0}, signal {1})", code, signal)));
      }
      const match = regex.exec(raw);
      const rawStripped = match ? match[1] : "{}";
      try {
        const env2 = JSON.parse(rawStripped);
        if (runAsNode) {
          env2["ELECTRON_RUN_AS_NODE"] = runAsNode;
        } else {
          delete env2["ELECTRON_RUN_AS_NODE"];
        }
        if (noAttach) {
          env2["ELECTRON_NO_ATTACH_CONSOLE"] = noAttach;
        } else {
          delete env2["ELECTRON_NO_ATTACH_CONSOLE"];
        }
        delete env2["VSCODE_RESOLVING_ENVIRONMENT"];
        delete env2["XDG_RUNTIME_DIR"];
        logService.trace("getUnixShellEnvironment#result", env2);
        resolve(env2);
      } catch (err) {
        logService.error("getUnixShellEnvironment#errorCaught", toErrorMessage(err));
        reject(err);
      }
    });
  });
}
export {
  getResolvedShellEnv
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcc2hlbGxcXG5vZGVcXHNoZWxsRW52LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgc3Bhd24gfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSVByb2Nlc3NFbnZpcm9ubWVudCwgaXNXaW5kb3dzLCBPUyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgZ2V0U3lzdGVtU2hlbGwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvc2hlbGwuanMnO1xuaW1wb3J0IHsgTmF0aXZlUGFyc2VkQXJncyB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9hcmd2LmpzJztcbmltcG9ydCB7IGlzTGF1bmNoZWRGcm9tQ2xpIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvbm9kZS9hcmd2SGVscGVyLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5cbmxldCB1bml4U2hlbGxFbnZQcm9taXNlOiBQcm9taXNlPHR5cGVvZiBwcm9jZXNzLmVudj4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cbi8qKlxuICogUmVzb2x2ZXMgdGhlIHNoZWxsIGVudmlyb25tZW50IGJ5IHNwYXduaW5nIGEgc2hlbGwuIFRoaXMgY2FsbCB3aWxsIGNhY2hlXG4gKiB0aGUgc2hlbGwgc3Bhd25pbmcgc28gdGhhdCBzdWJzZXF1ZW50IGludm9jYXRpb25zIHVzZSB0aGF0IGNhY2hlZCByZXN1bHQuXG4gKlxuICogV2lsbCB0aHJvdyBhbiBlcnJvciBpZjpcbiAqIC0gd2UgaGl0IGEgdGltZW91dCBvZiBgTUFYX1NIRUxMX1JFU09MVkVfVElNRWBcbiAqIC0gYW55IG90aGVyIGVycm9yIGZyb20gc3Bhd25pbmcgYSBzaGVsbCB0byBmaWd1cmUgb3V0IHRoZSBlbnZpcm9ubWVudFxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0UmVzb2x2ZWRTaGVsbEVudihjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSwgYXJnczogTmF0aXZlUGFyc2VkQXJncywgZW52OiBJUHJvY2Vzc0Vudmlyb25tZW50KTogUHJvbWlzZTx0eXBlb2YgcHJvY2Vzcy5lbnY+IHtcblxuXHQvLyBTa2lwIGlmIC0tZm9yY2UtZGlzYWJsZS11c2VyLWVudlxuXHRpZiAoYXJnc1snZm9yY2UtZGlzYWJsZS11c2VyLWVudiddKSB7XG5cdFx0bG9nU2VydmljZS50cmFjZSgncmVzb2x2ZVNoZWxsRW52KCk6IHNraXBwZWQgKC0tZm9yY2UtZGlzYWJsZS11c2VyLWVudiknKTtcblxuXHRcdHJldHVybiB7fTtcblx0fVxuXG5cdC8vIFNraXAgb24gd2luZG93c1xuXHRlbHNlIGlmIChpc1dpbmRvd3MpIHtcblx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdyZXNvbHZlU2hlbGxFbnYoKTogc2tpcHBlZCAoV2luZG93cyknKTtcblxuXHRcdHJldHVybiB7fTtcblx0fVxuXG5cdC8vIFNraXAgaWYgcnVubmluZyBmcm9tIENMSSBhbHJlYWR5XG5cdGVsc2UgaWYgKGlzTGF1bmNoZWRGcm9tQ2xpKGVudikgJiYgIWFyZ3NbJ2ZvcmNlLXVzZXItZW52J10pIHtcblx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdyZXNvbHZlU2hlbGxFbnYoKTogc2tpcHBlZCAoVlNDT0RFX0NMSSBpcyBzZXQpJyk7XG5cblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHQvLyBPdGhlcndpc2UgcmVzb2x2ZSAobWFjT1MsIExpbnV4KVxuXHRlbHNlIHtcblx0XHRpZiAoaXNMYXVuY2hlZEZyb21DbGkoZW52KSkge1xuXHRcdFx0bG9nU2VydmljZS50cmFjZSgncmVzb2x2ZVNoZWxsRW52KCk6IHJ1bm5pbmcgKC0tZm9yY2UtdXNlci1lbnYpJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoJ3Jlc29sdmVTaGVsbEVudigpOiBydW5uaW5nIChtYWNPUy9MaW51eCknKTtcblx0XHR9XG5cblx0XHQvLyBDYWxsIHRoaXMgb25seSBvbmNlIGFuZCBjYWNoZSB0aGUgcHJvbWlzZSBmb3Jcblx0XHQvLyBzdWJzZXF1ZW50IGNhbGxzIHNpbmNlIHRoaXMgb3BlcmF0aW9uIGNhbiBiZVxuXHRcdC8vIGV4cGVuc2l2ZSAoc3Bhd25zIGEgcHJvY2VzcykuXG5cdFx0aWYgKCF1bml4U2hlbGxFbnZQcm9taXNlKSB7XG5cdFx0XHR1bml4U2hlbGxFbnZQcm9taXNlID0gUHJvbWlzZXMud2l0aEFzeW5jQm9keTxOb2RlSlMuUHJvY2Vzc0Vudj4oYXN5bmMgKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdFx0XHRsZXQgdGltZW91dFZhbHVlID0gMTAwMDA7IC8vIGRlZmF1bHQgdG8gMTAgc2Vjb25kc1xuXHRcdFx0XHRjb25zdCBjb25maWd1cmVkVGltZW91dFZhbHVlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8dW5rbm93bj4oJ2FwcGxpY2F0aW9uLnNoZWxsRW52aXJvbm1lbnRSZXNvbHV0aW9uVGltZW91dCcpO1xuXHRcdFx0XHRpZiAodHlwZW9mIGNvbmZpZ3VyZWRUaW1lb3V0VmFsdWUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0dGltZW91dFZhbHVlID0gY2xhbXAoY29uZmlndXJlZFRpbWVvdXRWYWx1ZSwgMSwgMTIwKSAqIDEwMDAgLyogY29udmVydCBmcm9tIHNlY29uZHMgKi87XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBHaXZlIHVwIHJlc29sdmluZyBzaGVsbCBlbnYgYWZ0ZXIgc29tZSB0aW1lXG5cdFx0XHRcdGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRjdHMuZGlzcG9zZSh0cnVlKTtcblx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKGxvY2FsaXplKCdyZXNvbHZlU2hlbGxFbnZUaW1lb3V0JywgXCJVbmFibGUgdG8gcmVzb2x2ZSB5b3VyIHNoZWxsIGVudmlyb25tZW50IGluIGEgcmVhc29uYWJsZSB0aW1lLiBQbGVhc2UgcmV2aWV3IHlvdXIgc2hlbGwgY29uZmlndXJhdGlvbiBhbmQgcmVzdGFydC5cIikpKTtcblx0XHRcdFx0fSwgdGltZW91dFZhbHVlKTtcblxuXHRcdFx0XHQvLyBSZXNvbHZlIHNoZWxsIGVudiBhbmQgaGFuZGxlIGVycm9yc1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJlc29sdmUoYXdhaXQgZG9SZXNvbHZlVW5peFNoZWxsRW52KGxvZ1NlcnZpY2UsIGN0cy50b2tlbikpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikgJiYgIWN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcihsb2NhbGl6ZSgncmVzb2x2ZVNoZWxsRW52RXJyb3InLCBcIlVuYWJsZSB0byByZXNvbHZlIHlvdXIgc2hlbGwgZW52aXJvbm1lbnQ6IHswfVwiLCB0b0Vycm9yTWVzc2FnZShlcnJvcikpKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJlc29sdmUoe30pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQodGltZW91dCk7XG5cdFx0XHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuaXhTaGVsbEVudlByb21pc2U7XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZG9SZXNvbHZlVW5peFNoZWxsRW52KGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHR5cGVvZiBwcm9jZXNzLmVudj4ge1xuXHRjb25zdCBydW5Bc05vZGUgPSBwcm9jZXNzLmVudlsnRUxFQ1RST05fUlVOX0FTX05PREUnXTtcblx0bG9nU2VydmljZS50cmFjZSgnZ2V0VW5peFNoZWxsRW52aXJvbm1lbnQjcnVuQXNOb2RlJywgcnVuQXNOb2RlKTtcblxuXHRjb25zdCBub0F0dGFjaCA9IHByb2Nlc3MuZW52WydFTEVDVFJPTl9OT19BVFRBQ0hfQ09OU09MRSddO1xuXHRsb2dTZXJ2aWNlLnRyYWNlKCdnZXRVbml4U2hlbGxFbnZpcm9ubWVudCNub0F0dGFjaCcsIG5vQXR0YWNoKTtcblxuXHRjb25zdCBtYXJrID0gZ2VuZXJhdGVVdWlkKCkucmVwbGFjZSgvLS9nLCAnJykuc3Vic3RyKDAsIDEyKTtcblx0Y29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKG1hcmsgKyAnKHsuKn0pJyArIG1hcmspO1xuXG5cdGNvbnN0IGVudiA9IHtcblx0XHQuLi5wcm9jZXNzLmVudixcblx0XHRFTEVDVFJPTl9SVU5fQVNfTk9ERTogJzEnLFxuXHRcdEVMRUNUUk9OX05PX0FUVEFDSF9DT05TT0xFOiAnMScsXG5cdFx0VlNDT0RFX1JFU09MVklOR19FTlZJUk9OTUVOVDogJzEnXG5cdH07XG5cblx0bG9nU2VydmljZS50cmFjZSgnZ2V0VW5peFNoZWxsRW52aXJvbm1lbnQjZW52JywgZW52KTtcblx0Y29uc3Qgc3lzdGVtU2hlbGxVbml4ID0gYXdhaXQgZ2V0U3lzdGVtU2hlbGwoT1MsIGVudik7XG5cdGxvZ1NlcnZpY2UudHJhY2UoJ2dldFVuaXhTaGVsbEVudmlyb25tZW50I3NoZWxsJywgc3lzdGVtU2hlbGxVbml4KTtcblxuXHRyZXR1cm4gbmV3IFByb21pc2U8dHlwZW9mIHByb2Nlc3MuZW52PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gcmVqZWN0KG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHR9XG5cblx0XHQvLyBoYW5kbGUgcG9wdWxhciBub24tUE9TSVggc2hlbGxzXG5cdFx0Y29uc3QgbmFtZSA9IGJhc2VuYW1lKHN5c3RlbVNoZWxsVW5peCk7XG5cdFx0bGV0IGNvbW1hbmQ6IHN0cmluZywgc2hlbGxBcmdzOiBBcnJheTxzdHJpbmc+O1xuXHRcdGNvbnN0IGV4dHJhQXJncyA9ICcnO1xuXHRcdGlmICgvXig/OnB3c2h8cG93ZXJzaGVsbCkoPzotcHJldmlldyk/JC8udGVzdChuYW1lKSkge1xuXHRcdFx0Ly8gT2xkZXIgdmVyc2lvbnMgb2YgUG93ZXJTaGVsbCByZW1vdmVzIGRvdWJsZSBxdW90ZXMgc29tZXRpbWVzIHNvIHdlIHVzZSBcImRvdWJsZSBzaW5nbGUgcXVvdGVzXCIgd2hpY2ggaXMgaG93XG5cdFx0XHQvLyB5b3UgZXNjYXBlIHNpbmdsZSBxdW90ZXMgaW5zaWRlIG9mIGEgc2luZ2xlIHF1b3RlZCBzdHJpbmcuXG5cdFx0XHRjb21tYW5kID0gYCYgJyR7cHJvY2Vzcy5leGVjUGF0aH0nICR7ZXh0cmFBcmdzfSAtcCAnJycke21hcmt9JycgKyBKU09OLnN0cmluZ2lmeShwcm9jZXNzLmVudikgKyAnJyR7bWFya30nJydgO1xuXHRcdFx0c2hlbGxBcmdzID0gWyctTG9naW4nLCAnLUNvbW1hbmQnXTtcblx0XHR9IGVsc2UgaWYgKG5hbWUgPT09ICdudScpIHsgLy8gbnVzaGVsbCByZXF1aXJlcyBeIGJlZm9yZSBxdW90ZWQgcGF0aCB0byB0cmVhdCBpdCBhcyBhIGNvbW1hbmRcblx0XHRcdGNvbW1hbmQgPSBgXicke3Byb2Nlc3MuZXhlY1BhdGh9JyAke2V4dHJhQXJnc30gLXAgJ1wiJHttYXJrfVwiICsgSlNPTi5zdHJpbmdpZnkocHJvY2Vzcy5lbnYpICsgXCIke21hcmt9XCInYDtcblx0XHRcdHNoZWxsQXJncyA9IFsnLWknLCAnLWwnLCAnLWMnXTtcblx0XHR9IGVsc2UgaWYgKG5hbWUgPT09ICd4b25zaCcpIHsgLy8gIzIwMDM3NDogbmF0aXZlIGltcGxlbWVudGF0aW9uIGlzIHNob3J0ZXJcblx0XHRcdGNvbW1hbmQgPSBgaW1wb3J0IG9zLCBqc29uOyBwcmludChcIiR7bWFya31cIiwganNvbi5kdW1wcyhkaWN0KG9zLmVudmlyb24pKSwgXCIke21hcmt9XCIpYDtcblx0XHRcdHNoZWxsQXJncyA9IFsnLWknLCAnLWwnLCAnLWMnXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29tbWFuZCA9IGAnJHtwcm9jZXNzLmV4ZWNQYXRofScgJHtleHRyYUFyZ3N9IC1wICdcIiR7bWFya31cIiArIEpTT04uc3RyaW5naWZ5KHByb2Nlc3MuZW52KSArIFwiJHttYXJrfVwiJ2A7XG5cblx0XHRcdGlmIChuYW1lID09PSAndGNzaCcgfHwgbmFtZSA9PT0gJ2NzaCcpIHtcblx0XHRcdFx0c2hlbGxBcmdzID0gWyctaWMnXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNoZWxsQXJncyA9IFsnLWknLCAnLWwnLCAnLWMnXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdnZXRVbml4U2hlbGxFbnZpcm9ubWVudCNzcGF3bicsIEpTT04uc3RyaW5naWZ5KHNoZWxsQXJncyksIGNvbW1hbmQpO1xuXG5cdFx0Y29uc3QgY2hpbGQgPSBzcGF3bihzeXN0ZW1TaGVsbFVuaXgsIFsuLi5zaGVsbEFyZ3MsIGNvbW1hbmRdLCB7XG5cdFx0XHRkZXRhY2hlZDogdHJ1ZSxcblx0XHRcdHN0ZGlvOiBbJ2lnbm9yZScsICdwaXBlJywgJ3BpcGUnXSxcblx0XHRcdGVudlxuXHRcdH0pO1xuXG5cdFx0dG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0Y2hpbGQua2lsbCgpO1xuXG5cdFx0XHRyZXR1cm4gcmVqZWN0KG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHR9KTtcblxuXHRcdGNoaWxkLm9uKCdlcnJvcicsIGVyciA9PiB7XG5cdFx0XHRsb2dTZXJ2aWNlLmVycm9yKCdnZXRVbml4U2hlbGxFbnZpcm9ubWVudCNlcnJvckNoaWxkUHJvY2VzcycsIHRvRXJyb3JNZXNzYWdlKGVycikpO1xuXHRcdFx0cmVqZWN0KGVycik7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBidWZmZXJzOiBCdWZmZXJbXSA9IFtdO1xuXHRcdGNoaWxkLnN0ZG91dC5vbignZGF0YScsIGIgPT4gYnVmZmVycy5wdXNoKGIpKTtcblxuXHRcdGNvbnN0IHN0ZGVycjogQnVmZmVyW10gPSBbXTtcblx0XHRjaGlsZC5zdGRlcnIub24oJ2RhdGEnLCBiID0+IHN0ZGVyci5wdXNoKGIpKTtcblxuXHRcdGNoaWxkLm9uKCdjbG9zZScsIChjb2RlLCBzaWduYWwpID0+IHtcblx0XHRcdGNvbnN0IHJhdyA9IEJ1ZmZlci5jb25jYXQoYnVmZmVycykudG9TdHJpbmcoJ3V0ZjgnKTtcblx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoJ2dldFVuaXhTaGVsbEVudmlyb25tZW50I3JhdycsIHJhdyk7XG5cblx0XHRcdGNvbnN0IHN0ZGVyclN0ciA9IEJ1ZmZlci5jb25jYXQoc3RkZXJyKS50b1N0cmluZygndXRmOCcpO1xuXHRcdFx0aWYgKHN0ZGVyclN0ci50cmltKCkpIHtcblx0XHRcdFx0bG9nU2VydmljZS50cmFjZSgnZ2V0VW5peFNoZWxsRW52aXJvbm1lbnQjc3RkZXJyJywgc3RkZXJyU3RyKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvZGUgfHwgc2lnbmFsKSB7XG5cdFx0XHRcdHJldHVybiByZWplY3QobmV3IEVycm9yKGxvY2FsaXplKCdyZXNvbHZlU2hlbGxFbnZFeGl0RXJyb3InLCBcIlVuZXhwZWN0ZWQgZXhpdCBjb2RlIGZyb20gc3Bhd25lZCBzaGVsbCAoY29kZSB7MH0sIHNpZ25hbCB7MX0pXCIsIGNvZGUsIHNpZ25hbCkpKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWF0Y2ggPSByZWdleC5leGVjKHJhdyk7XG5cdFx0XHRjb25zdCByYXdTdHJpcHBlZCA9IG1hdGNoID8gbWF0Y2hbMV0gOiAne30nO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBlbnYgPSBKU09OLnBhcnNlKHJhd1N0cmlwcGVkKTtcblxuXHRcdFx0XHRpZiAocnVuQXNOb2RlKSB7XG5cdFx0XHRcdFx0ZW52WydFTEVDVFJPTl9SVU5fQVNfTk9ERSddID0gcnVuQXNOb2RlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRlbGV0ZSBlbnZbJ0VMRUNUUk9OX1JVTl9BU19OT0RFJ107XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobm9BdHRhY2gpIHtcblx0XHRcdFx0XHRlbnZbJ0VMRUNUUk9OX05PX0FUVEFDSF9DT05TT0xFJ10gPSBub0F0dGFjaDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkZWxldGUgZW52WydFTEVDVFJPTl9OT19BVFRBQ0hfQ09OU09MRSddO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZGVsZXRlIGVudlsnVlNDT0RFX1JFU09MVklOR19FTlZJUk9OTUVOVCddO1xuXG5cdFx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMjU5MyNpc3N1ZWNvbW1lbnQtMzM2MDUwNzU4XG5cdFx0XHRcdGRlbGV0ZSBlbnZbJ1hER19SVU5USU1FX0RJUiddO1xuXG5cdFx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoJ2dldFVuaXhTaGVsbEVudmlyb25tZW50I3Jlc3VsdCcsIGVudik7XG5cdFx0XHRcdHJlc29sdmUoZW52KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLmVycm9yKCdnZXRVbml4U2hlbGxFbnZpcm9ubWVudCNlcnJvckNhdWdodCcsIHRvRXJyb3JNZXNzYWdlKGVycikpO1xuXHRcdFx0XHRyZWplY3QoZXJyKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUJBQW1CLDJCQUEyQjtBQUN2RCxTQUE4QixXQUFXLFVBQVU7QUFDbkQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxhQUFhO0FBRXRCLElBQUksc0JBQStEO0FBVW5FLGVBQXNCLG9CQUFvQixzQkFBNkMsWUFBeUIsTUFBd0IsS0FBdUQ7QUFHOUwsTUFBSSxLQUFLLHdCQUF3QixHQUFHO0FBQ25DLGVBQVcsTUFBTSx1REFBdUQ7QUFFeEUsV0FBTyxDQUFDO0FBQUEsRUFDVCxXQUdTLFdBQVc7QUFDbkIsZUFBVyxNQUFNLHNDQUFzQztBQUV2RCxXQUFPLENBQUM7QUFBQSxFQUNULFdBR1Msa0JBQWtCLEdBQUcsS0FBSyxDQUFDLEtBQUssZ0JBQWdCLEdBQUc7QUFDM0QsZUFBVyxNQUFNLGdEQUFnRDtBQUVqRSxXQUFPLENBQUM7QUFBQSxFQUNULE9BR0s7QUFDSixRQUFJLGtCQUFrQixHQUFHLEdBQUc7QUFDM0IsaUJBQVcsTUFBTSwrQ0FBK0M7QUFBQSxJQUNqRSxPQUFPO0FBQ04saUJBQVcsTUFBTSwwQ0FBMEM7QUFBQSxJQUM1RDtBQUtBLFFBQUksQ0FBQyxxQkFBcUI7QUFDekIsNEJBQXNCLFNBQVMsY0FBaUMsT0FBTyxTQUFTLFdBQVc7QUFDMUYsY0FBTSxNQUFNLElBQUksd0JBQXdCO0FBRXhDLFlBQUksZUFBZTtBQUNuQixjQUFNLHlCQUF5QixxQkFBcUIsU0FBa0IsK0NBQStDO0FBQ3JILFlBQUksT0FBTywyQkFBMkIsVUFBVTtBQUMvQyx5QkFBZSxNQUFNLHdCQUF3QixHQUFHLEdBQUcsSUFBSTtBQUFBLFFBQ3hEO0FBR0EsY0FBTSxVQUFVLFdBQVcsTUFBTTtBQUNoQyxjQUFJLFFBQVEsSUFBSTtBQUNoQixpQkFBTyxJQUFJLE1BQU0sU0FBUywwQkFBMEIsb0hBQW9ILENBQUMsQ0FBQztBQUFBLFFBQzNLLEdBQUcsWUFBWTtBQUdmLFlBQUk7QUFDSCxrQkFBUSxNQUFNLHNCQUFzQixZQUFZLElBQUksS0FBSyxDQUFDO0FBQUEsUUFDM0QsU0FBUyxPQUFPO0FBQ2YsY0FBSSxDQUFDLG9CQUFvQixLQUFLLEtBQUssQ0FBQyxJQUFJLE1BQU0seUJBQXlCO0FBQ3RFLG1CQUFPLElBQUksTUFBTSxTQUFTLHdCQUF3QixpREFBaUQsZUFBZSxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQUEsVUFDM0gsT0FBTztBQUNOLG9CQUFRLENBQUMsQ0FBQztBQUFBLFVBQ1g7QUFBQSxRQUNELFVBQUU7QUFDRCx1QkFBYSxPQUFPO0FBQ3BCLGNBQUksUUFBUTtBQUFBLFFBQ2I7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLGVBQWUsc0JBQXNCLFlBQXlCLE9BQXVEO0FBQ3BILFFBQU0sWUFBWSxRQUFRLElBQUksc0JBQXNCO0FBQ3BELGFBQVcsTUFBTSxxQ0FBcUMsU0FBUztBQUUvRCxRQUFNLFdBQVcsUUFBUSxJQUFJLDRCQUE0QjtBQUN6RCxhQUFXLE1BQU0sb0NBQW9DLFFBQVE7QUFFN0QsUUFBTSxPQUFPLGFBQWEsRUFBRSxRQUFRLE1BQU0sRUFBRSxFQUFFLE9BQU8sR0FBRyxFQUFFO0FBQzFELFFBQU0sUUFBUSxJQUFJLE9BQU8sT0FBTyxXQUFXLElBQUk7QUFFL0MsUUFBTSxNQUFNO0FBQUEsSUFDWCxHQUFHLFFBQVE7QUFBQSxJQUNYLHNCQUFzQjtBQUFBLElBQ3RCLDRCQUE0QjtBQUFBLElBQzVCLDhCQUE4QjtBQUFBLEVBQy9CO0FBRUEsYUFBVyxNQUFNLCtCQUErQixHQUFHO0FBQ25ELFFBQU0sa0JBQWtCLE1BQU0sZUFBZSxJQUFJLEdBQUc7QUFDcEQsYUFBVyxNQUFNLGlDQUFpQyxlQUFlO0FBRWpFLFNBQU8sSUFBSSxRQUE0QixDQUFDLFNBQVMsV0FBVztBQUMzRCxRQUFJLE1BQU0seUJBQXlCO0FBQ2xDLGFBQU8sT0FBTyxJQUFJLGtCQUFrQixDQUFDO0FBQUEsSUFDdEM7QUFHQSxVQUFNLE9BQU8sU0FBUyxlQUFlO0FBQ3JDLFFBQUksU0FBaUI7QUFDckIsVUFBTSxZQUFZO0FBQ2xCLFFBQUkscUNBQXFDLEtBQUssSUFBSSxHQUFHO0FBR3BELGdCQUFVLE1BQU0sUUFBUSxRQUFRLEtBQUssU0FBUyxVQUFVLElBQUksd0NBQXdDLElBQUk7QUFDeEcsa0JBQVksQ0FBQyxVQUFVLFVBQVU7QUFBQSxJQUNsQyxXQUFXLFNBQVMsTUFBTTtBQUN6QixnQkFBVSxLQUFLLFFBQVEsUUFBUSxLQUFLLFNBQVMsU0FBUyxJQUFJLHNDQUFzQyxJQUFJO0FBQ3BHLGtCQUFZLENBQUMsTUFBTSxNQUFNLElBQUk7QUFBQSxJQUM5QixXQUFXLFNBQVMsU0FBUztBQUM1QixnQkFBVSwyQkFBMkIsSUFBSSxxQ0FBcUMsSUFBSTtBQUNsRixrQkFBWSxDQUFDLE1BQU0sTUFBTSxJQUFJO0FBQUEsSUFDOUIsT0FBTztBQUNOLGdCQUFVLElBQUksUUFBUSxRQUFRLEtBQUssU0FBUyxTQUFTLElBQUksc0NBQXNDLElBQUk7QUFFbkcsVUFBSSxTQUFTLFVBQVUsU0FBUyxPQUFPO0FBQ3RDLG9CQUFZLENBQUMsS0FBSztBQUFBLE1BQ25CLE9BQU87QUFDTixvQkFBWSxDQUFDLE1BQU0sTUFBTSxJQUFJO0FBQUEsTUFDOUI7QUFBQSxJQUNEO0FBRUEsZUFBVyxNQUFNLGlDQUFpQyxLQUFLLFVBQVUsU0FBUyxHQUFHLE9BQU87QUFFcEYsVUFBTSxRQUFRLE1BQU0saUJBQWlCLENBQUMsR0FBRyxXQUFXLE9BQU8sR0FBRztBQUFBLE1BQzdELFVBQVU7QUFBQSxNQUNWLE9BQU8sQ0FBQyxVQUFVLFFBQVEsTUFBTTtBQUFBLE1BQ2hDO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSx3QkFBd0IsTUFBTTtBQUNuQyxZQUFNLEtBQUs7QUFFWCxhQUFPLE9BQU8sSUFBSSxrQkFBa0IsQ0FBQztBQUFBLElBQ3RDLENBQUM7QUFFRCxVQUFNLEdBQUcsU0FBUyxTQUFPO0FBQ3hCLGlCQUFXLE1BQU0sNkNBQTZDLGVBQWUsR0FBRyxDQUFDO0FBQ2pGLGFBQU8sR0FBRztBQUFBLElBQ1gsQ0FBQztBQUVELFVBQU0sVUFBb0IsQ0FBQztBQUMzQixVQUFNLE9BQU8sR0FBRyxRQUFRLE9BQUssUUFBUSxLQUFLLENBQUMsQ0FBQztBQUU1QyxVQUFNLFNBQW1CLENBQUM7QUFDMUIsVUFBTSxPQUFPLEdBQUcsUUFBUSxPQUFLLE9BQU8sS0FBSyxDQUFDLENBQUM7QUFFM0MsVUFBTSxHQUFHLFNBQVMsQ0FBQyxNQUFNLFdBQVc7QUFDbkMsWUFBTSxNQUFNLE9BQU8sT0FBTyxPQUFPLEVBQUUsU0FBUyxNQUFNO0FBQ2xELGlCQUFXLE1BQU0sK0JBQStCLEdBQUc7QUFFbkQsWUFBTSxZQUFZLE9BQU8sT0FBTyxNQUFNLEVBQUUsU0FBUyxNQUFNO0FBQ3ZELFVBQUksVUFBVSxLQUFLLEdBQUc7QUFDckIsbUJBQVcsTUFBTSxrQ0FBa0MsU0FBUztBQUFBLE1BQzdEO0FBRUEsVUFBSSxRQUFRLFFBQVE7QUFDbkIsZUFBTyxPQUFPLElBQUksTUFBTSxTQUFTLDRCQUE0QixrRUFBa0UsTUFBTSxNQUFNLENBQUMsQ0FBQztBQUFBLE1BQzlJO0FBRUEsWUFBTSxRQUFRLE1BQU0sS0FBSyxHQUFHO0FBQzVCLFlBQU0sY0FBYyxRQUFRLE1BQU0sQ0FBQyxJQUFJO0FBRXZDLFVBQUk7QUFDSCxjQUFNQSxPQUFNLEtBQUssTUFBTSxXQUFXO0FBRWxDLFlBQUksV0FBVztBQUNkLFVBQUFBLEtBQUksc0JBQXNCLElBQUk7QUFBQSxRQUMvQixPQUFPO0FBQ04saUJBQU9BLEtBQUksc0JBQXNCO0FBQUEsUUFDbEM7QUFFQSxZQUFJLFVBQVU7QUFDYixVQUFBQSxLQUFJLDRCQUE0QixJQUFJO0FBQUEsUUFDckMsT0FBTztBQUNOLGlCQUFPQSxLQUFJLDRCQUE0QjtBQUFBLFFBQ3hDO0FBRUEsZUFBT0EsS0FBSSw4QkFBOEI7QUFHekMsZUFBT0EsS0FBSSxpQkFBaUI7QUFFNUIsbUJBQVcsTUFBTSxrQ0FBa0NBLElBQUc7QUFDdEQsZ0JBQVFBLElBQUc7QUFBQSxNQUNaLFNBQVMsS0FBSztBQUNiLG1CQUFXLE1BQU0sdUNBQXVDLGVBQWUsR0FBRyxDQUFDO0FBQzNFLGVBQU8sR0FBRztBQUFBLE1BQ1g7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRjsiLAogICJuYW1lcyI6IFsiZW52Il0KfQo=
