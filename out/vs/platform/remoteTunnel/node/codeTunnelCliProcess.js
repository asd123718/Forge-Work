import { createCancelablePromise } from "../../../base/common/async.js";
import { dirname, join } from "../../../base/common/path.js";
import { isMacintosh, isWindows } from "../../../base/common/platform.js";
import { StreamSplitter } from "../../../base/node/nodeStreams.js";
import { spawn } from "child_process";
import { homedir } from "os";
const STOP_GRACE_PERIOD_MS = 5e3;
function resolveTunnelCommandLocation(appRoot, platform, tunnelApplicationName, win32VersionedUpdate) {
  let binParentLocation;
  if (platform === "darwin") {
    binParentLocation = appRoot;
  } else if (platform === "win32") {
    binParentLocation = win32VersionedUpdate ? dirname(dirname(dirname(appRoot))) : dirname(dirname(appRoot));
  } else {
    binParentLocation = dirname(dirname(appRoot));
  }
  return join(binParentLocation, "bin", `${tunnelApplicationName}${platform === "win32" ? ".exe" : ""}`);
}
class CodeTunnelCli {
  constructor(_options) {
    this._options = _options;
    this._spawn = _options.spawn ?? spawn;
    this._onLog = _options.onLog ?? (() => {
    });
  }
  /** Absolute path of the `code-tunnel` binary for this installation. */
  get commandLocation() {
    if (!this._commandLocation) {
      this._commandLocation = resolveTunnelCommandLocation(
        this._options.appRoot,
        isWindows ? "win32" : isMacintosh ? "darwin" : "linux",
        this._options.tunnelApplicationName,
        this._options.win32VersionedUpdate
      );
    }
    return this._commandLocation;
  }
  /** Runs the code CLI with the specified complete command arguments. */
  run(logLabel, args, onOutput, env) {
    let tunnelProcess;
    let didStop = false;
    let resolveExit;
    const exited = new Promise((resolve) => resolveExit = resolve);
    const stop = () => {
      if (tunnelProcess && !didStop) {
        didStop = true;
        const child = tunnelProcess;
        this._onLog(`${logLabel} terminating(${child.pid})`);
        child.kill();
        const forceKill = setTimeout(() => {
          this._onLog(`${logLabel} did not exit within ${STOP_GRACE_PERIOD_MS}ms, force killing(${child.pid})`);
          child.kill("SIGKILL");
        }, STOP_GRACE_PERIOD_MS);
        void exited.finally(() => clearTimeout(forceKill));
      }
      return exited;
    };
    const result = createCancelablePromise((token) => {
      return new Promise((resolve, reject) => {
        if (token.isCancellationRequested) {
          resolve(-1);
        }
        const stdio = ["ignore", "pipe", "pipe"];
        const cancellationListener = token.onCancellationRequested(() => {
          void stop();
        });
        try {
          if (!this._options.isBuilt) {
            onOutput("Building tunnel CLI from sources and run\n", false);
            onOutput(`${logLabel} Spawning: cargo run -- ${args.join(" ")}
`, false);
            tunnelProcess = this._spawn("cargo", ["run", "--", ...args], { cwd: join(this._options.appRoot, "cli"), stdio, env: { ...process.env, RUST_BACKTRACE: "1", ...env } });
          } else {
            onOutput("Running tunnel CLI\n", false);
            const tunnelCommand = this.commandLocation;
            onOutput(`${logLabel} Spawning: ${tunnelCommand} ${args.join(" ")}
`, false);
            tunnelProcess = this._spawn(tunnelCommand, args, { cwd: homedir(), stdio, env: { ...process.env, ...env } });
          }
        } catch (error) {
          cancellationListener.dispose();
          resolveExit?.();
          reject(error);
          return;
        }
        tunnelProcess.stdout.pipe(new StreamSplitter("\n")).on("data", (data) => {
          if (tunnelProcess) {
            onOutput(data.toString(), false);
          }
        });
        tunnelProcess.stderr.pipe(new StreamSplitter("\n")).on("data", (data) => {
          if (tunnelProcess) {
            onOutput(data.toString(), true);
          }
        });
        tunnelProcess.on("exit", (e) => {
          if (tunnelProcess) {
            cancellationListener.dispose();
            onOutput(`${logLabel} exit(${tunnelProcess.pid}): + ${e} `, false);
            tunnelProcess = void 0;
            resolveExit?.();
            resolve(e || 0);
          }
        });
        tunnelProcess.on("error", (e) => {
          if (tunnelProcess) {
            cancellationListener.dispose();
            onOutput(`${logLabel} error(${tunnelProcess.pid}): + ${e} `, true);
            tunnelProcess = void 0;
            resolveExit?.();
            reject(e);
          }
        });
      });
    });
    return { result, stop };
  }
}
export {
  CodeTunnelCli,
  resolveTunnelCommandLocation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccmVtb3RlVHVubmVsXFxub2RlXFxjb2RlVHVubmVsQ2xpUHJvY2Vzcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIGpvaW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBTdHJlYW1TcGxpdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9ub2RlU3RyZWFtcy5qcyc7XG5pbXBvcnQgeyBDaGlsZFByb2Nlc3MsIHNwYXduLCBTcGF3bk9wdGlvbnMsIFN0ZGlvT3B0aW9ucyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgaG9tZWRpciB9IGZyb20gJ29zJztcblxuLyoqIENhbGxiYWNrIGZvciBhIHNpbmdsZSBsaW5lIG9mIENMSSBvdXRwdXQuICovXG5leHBvcnQgdHlwZSBDb2RlVHVubmVsQ2xpT3V0cHV0ID0gKG1lc3NhZ2U6IHN0cmluZywgaXNFcnJvcjogYm9vbGVhbikgPT4gdm9pZDtcblxuLyoqIEEgcnVubmluZyB0dW5uZWwgQ0xJIGludm9jYXRpb24gYW5kIGl0cyBhY3R1YWwtcHJvY2VzcyBsaWZldGltZS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvZGVUdW5uZWxDbGlSdW4ge1xuXHQvKiogUmVzb2x2ZXMgd2l0aCB0aGUgcHJvY2VzcyBleGl0IGNvZGU7IHJlamVjdHMgaWYgdGhlIHByb2Nlc3MgY291bGQgbm90IGJlIHNwYXduZWQuICovXG5cdHJlYWRvbmx5IHJlc3VsdDogQ2FuY2VsYWJsZVByb21pc2U8bnVtYmVyPjtcblx0LyoqIEtpbGxzIHRoZSBwcm9jZXNzIGlmIG5lZWRlZCBhbmQgcmVzb2x2ZXMgYWZ0ZXIgaXRzIGBleGl0YCBvciBgZXJyb3JgIGV2ZW50LiAqL1xuXHRzdG9wKCk6IFByb21pc2U8dm9pZD47XG59XG5cbi8qKiBIb3cgbG9uZyBhIHN0b3BwZWQgQ0xJIHByb2Nlc3MgZ2V0cyB0byBleGl0IGJlZm9yZSBpdCBpcyBmb3JjZS1raWxsZWQuICovXG5jb25zdCBTVE9QX0dSQUNFX1BFUklPRF9NUyA9IDVfMDAwO1xuXG4vKiogSW5qZWN0YWJsZSBwcm9jZXNzLXNwYXduaW5nIGltcGxlbWVudGF0aW9uIGZvciB0aGUgdHVubmVsIENMSS4gKi9cbmV4cG9ydCB0eXBlIENvZGVUdW5uZWxTcGF3biA9IChjb21tYW5kOiBzdHJpbmcsIGFyZ3M6IHJlYWRvbmx5IHN0cmluZ1tdLCBvcHRpb25zOiBTcGF3bk9wdGlvbnMpID0+IENoaWxkUHJvY2VzcztcblxuLyoqIFJlc29sdmVzIHRoZSBhYnNvbHV0ZSBwYXRoIG9mIGEgdHVubmVsIENMSSBiaW5hcnkgZm9yIGFuIGluc3RhbGxhdGlvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlVHVubmVsQ29tbWFuZExvY2F0aW9uKGFwcFJvb3Q6IHN0cmluZywgcGxhdGZvcm06IE5vZGVKUy5QbGF0Zm9ybSwgdHVubmVsQXBwbGljYXRpb25OYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsIHdpbjMyVmVyc2lvbmVkVXBkYXRlOiBib29sZWFuKTogc3RyaW5nIHtcblx0bGV0IGJpblBhcmVudExvY2F0aW9uOiBzdHJpbmc7XG5cdGlmIChwbGF0Zm9ybSA9PT0gJ2RhcndpbicpIHtcblx0XHRiaW5QYXJlbnRMb2NhdGlvbiA9IGFwcFJvb3Q7XG5cdH0gZWxzZSBpZiAocGxhdGZvcm0gPT09ICd3aW4zMicpIHtcblx0XHRiaW5QYXJlbnRMb2NhdGlvbiA9IHdpbjMyVmVyc2lvbmVkVXBkYXRlID8gZGlybmFtZShkaXJuYW1lKGRpcm5hbWUoYXBwUm9vdCkpKSA6IGRpcm5hbWUoZGlybmFtZShhcHBSb290KSk7XG5cdH0gZWxzZSB7XG5cdFx0YmluUGFyZW50TG9jYXRpb24gPSBkaXJuYW1lKGRpcm5hbWUoYXBwUm9vdCkpO1xuXHR9XG5cdHJldHVybiBqb2luKGJpblBhcmVudExvY2F0aW9uLCAnYmluJywgYCR7dHVubmVsQXBwbGljYXRpb25OYW1lfSR7cGxhdGZvcm0gPT09ICd3aW4zMicgPyAnLmV4ZScgOiAnJ31gKTtcbn1cblxuLyoqIEhvdyB0byByZWFjaCBhbmQgcnVuIGEgVlMgQ29kZSBpbnN0YWxsYXRpb24ncyBidW5kbGVkIENMSS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvZGVUdW5uZWxDbGlPcHRpb25zIHtcblx0cmVhZG9ubHkgYXBwUm9vdDogc3RyaW5nO1xuXHRyZWFkb25seSBpc0J1aWx0OiBib29sZWFuO1xuXHRyZWFkb25seSB0dW5uZWxBcHBsaWNhdGlvbk5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgd2luMzJWZXJzaW9uZWRVcGRhdGU6IGJvb2xlYW47XG5cdC8qKiBJbmplY3RhYmxlIGZvciB0ZXN0czsgZGVmYXVsdHMgdG8gdGhlIHJlYWwgYGNoaWxkX3Byb2Nlc3Muc3Bhd25gLiAqL1xuXHRyZWFkb25seSBzcGF3bj86IENvZGVUdW5uZWxTcGF3bjtcblx0LyoqIFJlY2VpdmVzIHRoZSBzZXJ2aWNlJ3Mgb3duIGRpYWdub3N0aWNzLCBzZXBhcmF0ZSBmcm9tIENMSSBvdXRwdXQuICovXG5cdHJlYWRvbmx5IG9uTG9nPzogKG1lc3NhZ2U6IHN0cmluZykgPT4gdm9pZDtcbn1cblxuLyoqIFJ1bnMgdGhlIGNvZGUtdHVubmVsIENMSSBmb3IgYSBWUyBDb2RlIGluc3RhbGxhdGlvbi4gKi9cbmV4cG9ydCBjbGFzcyBDb2RlVHVubmVsQ2xpIHtcblxuXHRwcml2YXRlIF9jb21tYW5kTG9jYXRpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfc3Bhd246IENvZGVUdW5uZWxTcGF3bjtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Mb2c6IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSUNvZGVUdW5uZWxDbGlPcHRpb25zKSB7XG5cdFx0dGhpcy5fc3Bhd24gPSBfb3B0aW9ucy5zcGF3biA/PyBzcGF3bjtcblx0XHR0aGlzLl9vbkxvZyA9IF9vcHRpb25zLm9uTG9nID8/ICgoKSA9PiB7IH0pO1xuXHR9XG5cblx0LyoqIEFic29sdXRlIHBhdGggb2YgdGhlIGBjb2RlLXR1bm5lbGAgYmluYXJ5IGZvciB0aGlzIGluc3RhbGxhdGlvbi4gKi9cblx0Z2V0IGNvbW1hbmRMb2NhdGlvbigpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5fY29tbWFuZExvY2F0aW9uKSB7XG5cdFx0XHR0aGlzLl9jb21tYW5kTG9jYXRpb24gPSByZXNvbHZlVHVubmVsQ29tbWFuZExvY2F0aW9uKFxuXHRcdFx0XHR0aGlzLl9vcHRpb25zLmFwcFJvb3QsXG5cdFx0XHRcdGlzV2luZG93cyA/ICd3aW4zMicgOiBpc01hY2ludG9zaCA/ICdkYXJ3aW4nIDogJ2xpbnV4Jyxcblx0XHRcdFx0dGhpcy5fb3B0aW9ucy50dW5uZWxBcHBsaWNhdGlvbk5hbWUsXG5cdFx0XHRcdHRoaXMuX29wdGlvbnMud2luMzJWZXJzaW9uZWRVcGRhdGVcblx0XHRcdCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jb21tYW5kTG9jYXRpb247XG5cdH1cblxuXHQvKiogUnVucyB0aGUgY29kZSBDTEkgd2l0aCB0aGUgc3BlY2lmaWVkIGNvbXBsZXRlIGNvbW1hbmQgYXJndW1lbnRzLiAqL1xuXHRydW4obG9nTGFiZWw6IHN0cmluZywgYXJnczogcmVhZG9ubHkgc3RyaW5nW10sIG9uT3V0cHV0OiBDb2RlVHVubmVsQ2xpT3V0cHV0LCBlbnY/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogSUNvZGVUdW5uZWxDbGlSdW4ge1xuXHRcdGxldCB0dW5uZWxQcm9jZXNzOiBDaGlsZFByb2Nlc3MgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGRpZFN0b3AgPSBmYWxzZTtcblx0XHRsZXQgcmVzb2x2ZUV4aXQ6ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBleGl0ZWQgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHJlc29sdmVFeGl0ID0gcmVzb2x2ZSk7XG5cdFx0Y29uc3Qgc3RvcCA9ICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdGlmICh0dW5uZWxQcm9jZXNzICYmICFkaWRTdG9wKSB7XG5cdFx0XHRcdGRpZFN0b3AgPSB0cnVlO1xuXHRcdFx0XHRjb25zdCBjaGlsZCA9IHR1bm5lbFByb2Nlc3M7XG5cdFx0XHRcdHRoaXMuX29uTG9nKGAke2xvZ0xhYmVsfSB0ZXJtaW5hdGluZygke2NoaWxkLnBpZH0pYCk7XG5cdFx0XHRcdGNoaWxkLmtpbGwoKTtcblx0XHRcdFx0Ly8gQ2FsbGVycyBzZXJpYWxpemUgb24gdGhpcyBwcm9taXNlLCBzbyBhIENMSSB0aGF0IGlnbm9yZXMgdGhlXG5cdFx0XHRcdC8vIHRlcm1pbmF0aW9uIHNpZ25hbCB3b3VsZCB3ZWRnZSB0aGVtIGZvcmV2ZXIuIEVzY2FsYXRlIGluc3RlYWRcblx0XHRcdFx0Ly8gb2Ygd2FpdGluZyBpbmRlZmluaXRlbHk6IFNJR0tJTEwgY2Fubm90IGJlIGNhdWdodCwgc28gYGV4aXRgXG5cdFx0XHRcdC8vIGFsd2F5cyBmb2xsb3dzIGFuZCBgZXhpdGVkYCBhbHdheXMgc2V0dGxlcy5cblx0XHRcdFx0Y29uc3QgZm9yY2VLaWxsID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fb25Mb2coYCR7bG9nTGFiZWx9IGRpZCBub3QgZXhpdCB3aXRoaW4gJHtTVE9QX0dSQUNFX1BFUklPRF9NU31tcywgZm9yY2Uga2lsbGluZygke2NoaWxkLnBpZH0pYCk7XG5cdFx0XHRcdFx0Y2hpbGQua2lsbCgnU0lHS0lMTCcpO1xuXHRcdFx0XHR9LCBTVE9QX0dSQUNFX1BFUklPRF9NUyk7XG5cdFx0XHRcdHZvaWQgZXhpdGVkLmZpbmFsbHkoKCkgPT4gY2xlYXJUaW1lb3V0KGZvcmNlS2lsbCkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGV4aXRlZDtcblx0XHR9O1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlPG51bWJlcj4odG9rZW4gPT4ge1xuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSgtMSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc3RkaW86IFN0ZGlvT3B0aW9ucyA9IFsnaWdub3JlJywgJ3BpcGUnLCAncGlwZSddO1xuXG5cdFx0XHRcdGNvbnN0IGNhbmNlbGxhdGlvbkxpc3RlbmVyID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdHZvaWQgc3RvcCgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRpZiAoIXRoaXMuX29wdGlvbnMuaXNCdWlsdCkge1xuXHRcdFx0XHRcdFx0b25PdXRwdXQoJ0J1aWxkaW5nIHR1bm5lbCBDTEkgZnJvbSBzb3VyY2VzIGFuZCBydW5cXG4nLCBmYWxzZSk7XG5cdFx0XHRcdFx0XHRvbk91dHB1dChgJHtsb2dMYWJlbH0gU3Bhd25pbmc6IGNhcmdvIHJ1biAtLSAke2FyZ3Muam9pbignICcpfVxcbmAsIGZhbHNlKTtcblx0XHRcdFx0XHRcdHR1bm5lbFByb2Nlc3MgPSB0aGlzLl9zcGF3bignY2FyZ28nLCBbJ3J1bicsICctLScsIC4uLmFyZ3NdLCB7IGN3ZDogam9pbih0aGlzLl9vcHRpb25zLmFwcFJvb3QsICdjbGknKSwgc3RkaW8sIGVudjogeyAuLi5wcm9jZXNzLmVudiwgUlVTVF9CQUNLVFJBQ0U6ICcxJywgLi4uZW52IH0gfSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG9uT3V0cHV0KCdSdW5uaW5nIHR1bm5lbCBDTElcXG4nLCBmYWxzZSk7XG5cdFx0XHRcdFx0XHRjb25zdCB0dW5uZWxDb21tYW5kID0gdGhpcy5jb21tYW5kTG9jYXRpb247XG5cdFx0XHRcdFx0XHRvbk91dHB1dChgJHtsb2dMYWJlbH0gU3Bhd25pbmc6ICR7dHVubmVsQ29tbWFuZH0gJHthcmdzLmpvaW4oJyAnKX1cXG5gLCBmYWxzZSk7XG5cdFx0XHRcdFx0XHR0dW5uZWxQcm9jZXNzID0gdGhpcy5fc3Bhd24odHVubmVsQ29tbWFuZCwgYXJncywgeyBjd2Q6IGhvbWVkaXIoKSwgc3RkaW8sIGVudjogeyAuLi5wcm9jZXNzLmVudiwgLi4uZW52IH0gfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGNhbmNlbGxhdGlvbkxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXNvbHZlRXhpdD8uKCk7XG5cdFx0XHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0dW5uZWxQcm9jZXNzLnN0ZG91dCEucGlwZShuZXcgU3RyZWFtU3BsaXR0ZXIoJ1xcbicpKS5vbignZGF0YScsIGRhdGEgPT4ge1xuXHRcdFx0XHRcdGlmICh0dW5uZWxQcm9jZXNzKSB7XG5cdFx0XHRcdFx0XHRvbk91dHB1dChkYXRhLnRvU3RyaW5nKCksIGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0dW5uZWxQcm9jZXNzLnN0ZGVyciEucGlwZShuZXcgU3RyZWFtU3BsaXR0ZXIoJ1xcbicpKS5vbignZGF0YScsIGRhdGEgPT4ge1xuXHRcdFx0XHRcdGlmICh0dW5uZWxQcm9jZXNzKSB7XG5cdFx0XHRcdFx0XHRvbk91dHB1dChkYXRhLnRvU3RyaW5nKCksIHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHR1bm5lbFByb2Nlc3Mub24oJ2V4aXQnLCBlID0+IHtcblx0XHRcdFx0XHRpZiAodHVubmVsUHJvY2Vzcykge1xuXHRcdFx0XHRcdFx0Y2FuY2VsbGF0aW9uTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0b25PdXRwdXQoYCR7bG9nTGFiZWx9IGV4aXQoJHt0dW5uZWxQcm9jZXNzLnBpZH0pOiArICR7ZX0gYCwgZmFsc2UpO1xuXHRcdFx0XHRcdFx0dHVubmVsUHJvY2VzcyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdHJlc29sdmVFeGl0Py4oKTtcblx0XHRcdFx0XHRcdHJlc29sdmUoZSB8fCAwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0dW5uZWxQcm9jZXNzLm9uKCdlcnJvcicsIGUgPT4ge1xuXHRcdFx0XHRcdGlmICh0dW5uZWxQcm9jZXNzKSB7XG5cdFx0XHRcdFx0XHRjYW5jZWxsYXRpb25MaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRvbk91dHB1dChgJHtsb2dMYWJlbH0gZXJyb3IoJHt0dW5uZWxQcm9jZXNzLnBpZH0pOiArICR7ZX0gYCwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHR0dW5uZWxQcm9jZXNzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZUV4aXQ/LigpO1xuXHRcdFx0XHRcdFx0cmVqZWN0KGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRyZXR1cm4geyByZXN1bHQsIHN0b3AgfTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsU0FBUyxZQUFZO0FBQzlCLFNBQVMsYUFBYSxpQkFBaUI7QUFDdkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBdUIsYUFBeUM7QUFDaEUsU0FBUyxlQUFlO0FBY3hCLE1BQU0sdUJBQXVCO0FBTXRCLFNBQVMsNkJBQTZCLFNBQWlCLFVBQTJCLHVCQUEyQyxzQkFBdUM7QUFDMUssTUFBSTtBQUNKLE1BQUksYUFBYSxVQUFVO0FBQzFCLHdCQUFvQjtBQUFBLEVBQ3JCLFdBQVcsYUFBYSxTQUFTO0FBQ2hDLHdCQUFvQix1QkFBdUIsUUFBUSxRQUFRLFFBQVEsT0FBTyxDQUFDLENBQUMsSUFBSSxRQUFRLFFBQVEsT0FBTyxDQUFDO0FBQUEsRUFDekcsT0FBTztBQUNOLHdCQUFvQixRQUFRLFFBQVEsT0FBTyxDQUFDO0FBQUEsRUFDN0M7QUFDQSxTQUFPLEtBQUssbUJBQW1CLE9BQU8sR0FBRyxxQkFBcUIsR0FBRyxhQUFhLFVBQVUsU0FBUyxFQUFFLEVBQUU7QUFDdEc7QUFlTyxNQUFNLGNBQWM7QUFBQSxFQU0xQixZQUE2QixVQUFpQztBQUFqQztBQUM1QixTQUFLLFNBQVMsU0FBUyxTQUFTO0FBQ2hDLFNBQUssU0FBUyxTQUFTLFVBQVUsTUFBTTtBQUFBLElBQUU7QUFBQSxFQUMxQztBQUFBO0FBQUEsRUFHQSxJQUFJLGtCQUEwQjtBQUM3QixRQUFJLENBQUMsS0FBSyxrQkFBa0I7QUFDM0IsV0FBSyxtQkFBbUI7QUFBQSxRQUN2QixLQUFLLFNBQVM7QUFBQSxR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
