import { spawn } from "child_process";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { parseEnvFile } from "../../../base/common/envfile.js";
import { untildify } from "../../../base/common/labels.js";
import { Lazy } from "../../../base/common/lazy.js";
import { DisposableMap } from "../../../base/common/lifecycle.js";
import * as path from "../../../base/common/path.js";
import { URI } from "../../../base/common/uri.js";
import { StreamSplitter } from "../../../base/node/nodeStreams.js";
import { findExecutable } from "../../../base/node/processes.js";
import { LogLevel } from "../../../platform/log/common/log.js";
import { McpConnectionState, McpServerTransportType } from "../../contrib/mcp/common/mcpTypes.js";
import { McpStdioStateHandler } from "../../contrib/mcp/node/mcpStdioStateHandler.js";
import { ExtHostMcpService, McpHTTPHandle } from "../common/extHostMcp.js";
class NodeExtHostMpcService extends ExtHostMcpService {
  constructor() {
    super(...arguments);
    this.nodeServers = this._register(new DisposableMap());
  }
  _startMcp(id, launch, defaultCwd, errorOnUserInteraction) {
    if (launch.type === McpServerTransportType.Stdio) {
      this.startNodeMpc(id, launch, defaultCwd);
    } else if (launch.type === McpServerTransportType.HTTP) {
      this._sseEventSources.set(id, new McpHTTPHandleNode(id, launch, this._proxy, this._logService, errorOnUserInteraction));
    } else {
      super._startMcp(id, launch, defaultCwd, errorOnUserInteraction);
    }
  }
  $stopMcp(id) {
    const nodeServer = this.nodeServers.get(id);
    if (nodeServer) {
      nodeServer.stop();
    } else {
      super.$stopMcp(id);
    }
  }
  $sendMessage(id, message) {
    const nodeServer = this.nodeServers.get(id);
    if (nodeServer) {
      nodeServer.write(message);
    } else {
      super.$sendMessage(id, message);
    }
  }
  async startNodeMpc(id, launch, defaultCwd) {
    const onError = (err) => this._proxy.$onDidChangeState(id, {
      state: McpConnectionState.Kind.Error,
      // eslint-disable-next-line local/code-no-any-casts
      code: err.hasOwnProperty("code") ? String(err.code) : void 0,
      message: typeof err === "string" ? err : err.message
    });
    const env = { ...process.env };
    if (launch.envFile) {
      try {
        for (const [key, value] of parseEnvFile(await readFile(launch.envFile, "utf-8"))) {
          env[key] = value;
        }
      } catch (e) {
        onError(`Failed to read envFile '${launch.envFile}': ${e.message}`);
        return;
      }
    }
    for (const [key, value] of Object.entries(launch.env)) {
      if (key.toUpperCase() === "PATH" && value !== null) {
        env[key] = env[key] ? `${env[key]}${path.delimiter}${String(value)}` : String(value);
        continue;
      }
      env[key] = value === null ? void 0 : String(value);
    }
    let child;
    try {
      const home = homedir();
      let cwd = launch.cwd ? untildify(launch.cwd, home) : defaultCwd?.fsPath || home;
      if (!path.isAbsolute(cwd)) {
        cwd = defaultCwd ? path.join(defaultCwd.fsPath, cwd) : path.join(home, cwd);
      }
      const { executable, args, shell } = await formatSubprocessArguments(
        untildify(launch.command, home),
        launch.args.map((a) => untildify(a, home)),
        cwd,
        env
      );
      this._proxy.$onDidPublishLog(id, LogLevel.Debug, `Server command line: ${executable} ${args.join(" ")}`);
      child = spawn(executable, args, {
        stdio: "pipe",
        cwd,
        env,
        shell
      });
    } catch (e) {
      onError(e);
      return;
    }
    const connectionManager = new McpStdioStateHandler(child);
    this._proxy.$onDidChangeState(id, { state: McpConnectionState.Kind.Starting });
    child.stdout.pipe(new StreamSplitter("\n")).on("data", (line) => this._proxy.$onDidReceiveMessage(id, line.toString()));
    child.stdin.on("error", onError);
    child.stdout.on("error", onError);
    child.stderr.pipe(new StreamSplitter("\n")).on("data", (line) => this._proxy.$onDidPublishLog(id, LogLevel.Warning, `[server stderr] ${line.toString().trimEnd()}`));
    child.on("spawn", () => this._proxy.$onDidChangeState(id, { state: McpConnectionState.Kind.Running }));
    child.on("error", (e) => {
      onError(e);
    });
    child.on("exit", (code) => {
      this.nodeServers.deleteAndDispose(id);
      if (code === 0 || connectionManager.stopped) {
        this._proxy.$onDidChangeState(id, { state: McpConnectionState.Kind.Stopped });
      } else {
        this._proxy.$onDidChangeState(id, {
          state: McpConnectionState.Kind.Error,
          message: `Process exited with code ${code}`
        });
      }
    });
    this.nodeServers.set(id, connectionManager);
  }
}
class McpHTTPHandleNode extends McpHTTPHandle {
  constructor() {
    super(...arguments);
    this._undici = new Lazy(() => import("undici"));
  }
  async _fetchInternal(url, init) {
    const { fetch, Agent } = await this._undici.value;
    const undiciInit = { ...init };
    let httpUrl = url;
    const uri = URI.parse(url);
    if (uri.scheme === "unix" || uri.scheme === "pipe") {
      undiciInit.dispatcher = new Agent({
        socketPath: uri.path
      });
      httpUrl = uri.with({
        scheme: "http",
        authority: "localhost",
        // HTTP always wants a host (not that we're using it), but if we're using a socket or pipe then localhost is sorta right anyway
        path: uri.fragment
      }).toString(true);
    } else {
      return super._fetchInternal(url, init);
    }
    const undiciResponse = await fetch(httpUrl, undiciInit);
    return {
      status: undiciResponse.status,
      statusText: undiciResponse.statusText,
      headers: undiciResponse.headers,
      // undici `Headers` class no longer overlaps with lib.dom `Headers` (`SpecIterableIterator` vs `HeadersIterator`)
      body: undiciResponse.body,
      // Way down in `ReadableStreamReadDoneResult<T>`, `value` is optional in the undici type but required (yet can be `undefined`) in the standard type
      url: undiciResponse.url,
      json: () => undiciResponse.json(),
      text: () => undiciResponse.text()
    };
  }
}
const windowsShellScriptRe = /\.(bat|cmd)$/i;
const escapeCmdArg = (s) => `"${s.replace(/"/g, '""')}"`;
const formatSubprocessArguments = async (executable, args, cwd, env) => {
  if (process.platform !== "win32") {
    return { executable, args, shell: false };
  }
  const found = await findExecutable(executable, cwd, void 0, env);
  if (found && windowsShellScriptRe.test(found)) {
    return {
      executable: escapeCmdArg(found),
      args: args.map(escapeCmdArg),
      shell: true
    };
  }
  return { executable, args, shell: false };
};
export {
  NodeExtHostMpcService,
  escapeCmdArg,
  formatSubprocessArguments
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcbm9kZVxcZXh0SG9zdE1jcE5vZGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGlsZFByb2Nlc3NXaXRob3V0TnVsbFN0cmVhbXMsIHNwYXduIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyByZWFkRmlsZSB9IGZyb20gJ2ZzL3Byb21pc2VzJztcbmltcG9ydCB7IGhvbWVkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgdHlwZSB7IFJlcXVlc3RJbml0IGFzIFVuZGljaVJlcXVlc3RJbml0IH0gZnJvbSAndW5kaWNpJztcbmltcG9ydCB7IHBhcnNlRW52RmlsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2VudmZpbGUuanMnO1xuaW1wb3J0IHsgdW50aWxkaWZ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBTdHJlYW1TcGxpdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9ub2RlU3RyZWFtcy5qcyc7XG5pbXBvcnQgeyBmaW5kRXhlY3V0YWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9wcm9jZXNzZXMuanMnO1xuaW1wb3J0IHsgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBNY3BDb25uZWN0aW9uU3RhdGUsIE1jcFNlcnZlckxhdW5jaCwgTWNwU2VydmVyVHJhbnNwb3J0U3RkaW8sIE1jcFNlcnZlclRyYW5zcG9ydFR5cGUgfSBmcm9tICcuLi8uLi9jb250cmliL21jcC9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgTWNwU3RkaW9TdGF0ZUhhbmRsZXIgfSBmcm9tICcuLi8uLi9jb250cmliL21jcC9ub2RlL21jcFN0ZGlvU3RhdGVIYW5kbGVyLmpzJztcbmltcG9ydCB7IENvbW1vblJlcXVlc3RJbml0LCBDb21tb25SZXNwb25zZSwgRXh0SG9zdE1jcFNlcnZpY2UsIE1jcEhUVFBIYW5kbGUgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdE1jcC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBOb2RlRXh0SG9zdE1wY1NlcnZpY2UgZXh0ZW5kcyBFeHRIb3N0TWNwU2VydmljZSB7XG5cdHByaXZhdGUgbm9kZVNlcnZlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxudW1iZXIsIE1jcFN0ZGlvU3RhdGVIYW5kbGVyPigpKTtcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX3N0YXJ0TWNwKGlkOiBudW1iZXIsIGxhdW5jaDogTWNwU2VydmVyTGF1bmNoLCBkZWZhdWx0Q3dkPzogVVJJLCBlcnJvck9uVXNlckludGVyYWN0aW9uPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChsYXVuY2gudHlwZSA9PT0gTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5TdGRpbykge1xuXHRcdFx0dGhpcy5zdGFydE5vZGVNcGMoaWQsIGxhdW5jaCwgZGVmYXVsdEN3ZCk7XG5cdFx0fSBlbHNlIGlmIChsYXVuY2gudHlwZSA9PT0gTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5IVFRQKSB7XG5cdFx0XHR0aGlzLl9zc2VFdmVudFNvdXJjZXMuc2V0KGlkLCBuZXcgTWNwSFRUUEhhbmRsZU5vZGUoaWQsIGxhdW5jaCwgdGhpcy5fcHJveHksIHRoaXMuX2xvZ1NlcnZpY2UsIGVycm9yT25Vc2VySW50ZXJhY3Rpb24pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3VwZXIuX3N0YXJ0TWNwKGlkLCBsYXVuY2gsIGRlZmF1bHRDd2QsIGVycm9yT25Vc2VySW50ZXJhY3Rpb24pO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlICRzdG9wTWNwKGlkOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBub2RlU2VydmVyID0gdGhpcy5ub2RlU2VydmVycy5nZXQoaWQpO1xuXHRcdGlmIChub2RlU2VydmVyKSB7XG5cdFx0XHRub2RlU2VydmVyLnN0b3AoKTsgLy8gd2lsbCBnZXQgcmVtb3ZlZCBmcm9tIG1hcCB3aGVuIHByb2Nlc3MgaXMgZnVsbHkgc3RvcHBlZFxuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdXBlci4kc3RvcE1jcChpZCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgJHNlbmRNZXNzYWdlKGlkOiBudW1iZXIsIG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IG5vZGVTZXJ2ZXIgPSB0aGlzLm5vZGVTZXJ2ZXJzLmdldChpZCk7XG5cdFx0aWYgKG5vZGVTZXJ2ZXIpIHtcblx0XHRcdG5vZGVTZXJ2ZXIud3JpdGUobWVzc2FnZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN1cGVyLiRzZW5kTWVzc2FnZShpZCwgbWVzc2FnZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzdGFydE5vZGVNcGMoaWQ6IG51bWJlciwgbGF1bmNoOiBNY3BTZXJ2ZXJUcmFuc3BvcnRTdGRpbywgZGVmYXVsdEN3ZD86IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG9uRXJyb3IgPSAoZXJyOiBFcnJvciB8IHN0cmluZykgPT4gdGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlU3RhdGUoaWQsIHtcblx0XHRcdHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvcixcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0Y29kZTogZXJyLmhhc093blByb3BlcnR5KCdjb2RlJykgPyBTdHJpbmcoKGVyciBhcyBhbnkpLmNvZGUpIDogdW5kZWZpbmVkLFxuXHRcdFx0bWVzc2FnZTogdHlwZW9mIGVyciA9PT0gJ3N0cmluZycgPyBlcnIgOiBlcnIubWVzc2FnZSxcblx0XHR9KTtcblxuXHRcdC8vIE1DUCBzZXJ2ZXJzIGFyZSBydW4gb24gdGhlIHNhbWUgYXV0aG9yaXR5IHdoZXJlIHRoZXkgYXJlIGRlZmluZWQsIHNvXG5cdFx0Ly8gcmVhZGluZyB0aGUgZW52ZmlsZSBiYXNlZCBvbiBpdHMgcGF0aCBvZmYgdGhlIGZpbGVzeXN0ZW0gaGVyZSBpcyBmaW5lLlxuXHRcdGNvbnN0IGVudiA9IHsgLi4ucHJvY2Vzcy5lbnYgfTtcblx0XHRpZiAobGF1bmNoLmVudkZpbGUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHBhcnNlRW52RmlsZShhd2FpdCByZWFkRmlsZShsYXVuY2guZW52RmlsZSwgJ3V0Zi04JykpKSB7XG5cdFx0XHRcdFx0ZW52W2tleV0gPSB2YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRvbkVycm9yKGBGYWlsZWQgdG8gcmVhZCBlbnZGaWxlICcke2xhdW5jaC5lbnZGaWxlfSc6ICR7ZS5tZXNzYWdlfWApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGxhdW5jaC5lbnYpKSB7XG5cdFx0XHQvLyBGb3IgUEFUSCwgd2Ugd2FudCB0byBhcHBlbmQgdG8gdGhlIGV4aXN0aW5nIFBBVEggaW5zdGVhZCBvZiBvdmVyd3JpdGluZyBpdC5cblx0XHRcdGlmIChrZXkudG9VcHBlckNhc2UoKSA9PT0gJ1BBVEgnICYmIHZhbHVlICE9PSBudWxsKSB7XG5cdFx0XHRcdGVudltrZXldID0gZW52W2tleV0gPyBgJHtlbnZba2V5XX0ke3BhdGguZGVsaW1pdGVyfSR7U3RyaW5nKHZhbHVlKX1gIDogU3RyaW5nKHZhbHVlKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRlbnZba2V5XSA9IHZhbHVlID09PSBudWxsID8gdW5kZWZpbmVkIDogU3RyaW5nKHZhbHVlKTtcblx0XHR9XG5cblx0XHRsZXQgY2hpbGQ6IENoaWxkUHJvY2Vzc1dpdGhvdXROdWxsU3RyZWFtcztcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaG9tZSA9IGhvbWVkaXIoKTtcblx0XHRcdGxldCBjd2QgPSBsYXVuY2guY3dkID8gdW50aWxkaWZ5KGxhdW5jaC5jd2QsIGhvbWUpIDogKGRlZmF1bHRDd2Q/LmZzUGF0aCB8fCBob21lKTtcblx0XHRcdGlmICghcGF0aC5pc0Fic29sdXRlKGN3ZCkpIHtcblx0XHRcdFx0Y3dkID0gZGVmYXVsdEN3ZCA/IHBhdGguam9pbihkZWZhdWx0Q3dkLmZzUGF0aCwgY3dkKSA6IHBhdGguam9pbihob21lLCBjd2QpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB7IGV4ZWN1dGFibGUsIGFyZ3MsIHNoZWxsIH0gPSBhd2FpdCBmb3JtYXRTdWJwcm9jZXNzQXJndW1lbnRzKFxuXHRcdFx0XHR1bnRpbGRpZnkobGF1bmNoLmNvbW1hbmQsIGhvbWUpLFxuXHRcdFx0XHRsYXVuY2guYXJncy5tYXAoYSA9PiB1bnRpbGRpZnkoYSwgaG9tZSkpLFxuXHRcdFx0XHRjd2QsXG5cdFx0XHRcdGVudlxuXHRcdFx0KTtcblxuXHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkUHVibGlzaExvZyhpZCwgTG9nTGV2ZWwuRGVidWcsIGBTZXJ2ZXIgY29tbWFuZCBsaW5lOiAke2V4ZWN1dGFibGV9ICR7YXJncy5qb2luKCcgJyl9YCk7XG5cdFx0XHRjaGlsZCA9IHNwYXduKGV4ZWN1dGFibGUsIGFyZ3MsIHtcblx0XHRcdFx0c3RkaW86ICdwaXBlJyxcblx0XHRcdFx0Y3dkLFxuXHRcdFx0XHRlbnYsXG5cdFx0XHRcdHNoZWxsLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0b25FcnJvcihlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgdGhlIGNvbm5lY3Rpb24gbWFuYWdlciBmb3IgZ3JhY2VmdWwgc2h1dGRvd25cblx0XHRjb25zdCBjb25uZWN0aW9uTWFuYWdlciA9IG5ldyBNY3BTdGRpb1N0YXRlSGFuZGxlcihjaGlsZCk7XG5cblx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VTdGF0ZShpZCwgeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RhcnRpbmcgfSk7XG5cblx0XHRjaGlsZC5zdGRvdXQucGlwZShuZXcgU3RyZWFtU3BsaXR0ZXIoJ1xcbicpKS5vbignZGF0YScsIGxpbmUgPT4gdGhpcy5fcHJveHkuJG9uRGlkUmVjZWl2ZU1lc3NhZ2UoaWQsIGxpbmUudG9TdHJpbmcoKSkpO1xuXG5cdFx0Y2hpbGQuc3RkaW4ub24oJ2Vycm9yJywgb25FcnJvcik7XG5cdFx0Y2hpbGQuc3Rkb3V0Lm9uKCdlcnJvcicsIG9uRXJyb3IpO1xuXG5cdFx0Ly8gU3RkZXJyIGhhbmRsaW5nIGlzIG5vdCBjdXJyZW50bHkgc3BlY2lmaWVkIGh0dHBzOi8vZ2l0aHViLmNvbS9tb2RlbGNvbnRleHRwcm90b2NvbC9zcGVjaWZpY2F0aW9uL2lzc3Vlcy8xNzdcblx0XHQvLyBKdXN0IHRyZWF0IGl0IGFzIGdlbmVyaWMgbG9nIGRhdGEgZm9yIG5vd1xuXHRcdGNoaWxkLnN0ZGVyci5waXBlKG5ldyBTdHJlYW1TcGxpdHRlcignXFxuJykpLm9uKCdkYXRhJywgbGluZSA9PiB0aGlzLl9wcm94eS4kb25EaWRQdWJsaXNoTG9nKGlkLCBMb2dMZXZlbC5XYXJuaW5nLCBgW3NlcnZlciBzdGRlcnJdICR7bGluZS50b1N0cmluZygpLnRyaW1FbmQoKX1gKSk7XG5cblx0XHRjaGlsZC5vbignc3Bhd24nLCAoKSA9PiB0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VTdGF0ZShpZCwgeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuUnVubmluZyB9KSk7XG5cblx0XHRjaGlsZC5vbignZXJyb3InLCBlID0+IHtcblx0XHRcdG9uRXJyb3IoZSk7XG5cdFx0fSk7XG5cdFx0Y2hpbGQub24oJ2V4aXQnLCBjb2RlID0+IHtcblx0XHRcdHRoaXMubm9kZVNlcnZlcnMuZGVsZXRlQW5kRGlzcG9zZShpZCk7XG5cblx0XHRcdGlmIChjb2RlID09PSAwIHx8IGNvbm5lY3Rpb25NYW5hZ2VyLnN0b3BwZWQpIHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlU3RhdGUoaWQsIHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlN0b3BwZWQgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VTdGF0ZShpZCwge1xuXHRcdFx0XHRcdHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvcixcblx0XHRcdFx0XHRtZXNzYWdlOiBgUHJvY2VzcyBleGl0ZWQgd2l0aCBjb2RlICR7Y29kZX1gLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMubm9kZVNlcnZlcnMuc2V0KGlkLCBjb25uZWN0aW9uTWFuYWdlcik7XG5cdH1cbn1cblxuY2xhc3MgTWNwSFRUUEhhbmRsZU5vZGUgZXh0ZW5kcyBNY3BIVFRQSGFuZGxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfdW5kaWNpID0gbmV3IExhenkoKCkgPT4gaW1wb3J0KCd1bmRpY2knKSk7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9mZXRjaEludGVybmFsKHVybDogc3RyaW5nLCBpbml0PzogQ29tbW9uUmVxdWVzdEluaXQpOiBQcm9taXNlPENvbW1vblJlc3BvbnNlPiB7XG5cdFx0Ly8gTm90ZTogaW1wb3J0ZWQgYXN5bmMgc28gdGhhdCB3ZSBjYW4gZW5zdXJlIHdlIGxvYWQgdW5kaWNpIGFmdGVyIHByb3h5IHBhdGNoZXMgaGF2ZSBiZWVuIGFwcGxpZWRcblx0XHRjb25zdCB7IGZldGNoLCBBZ2VudCB9ID0gYXdhaXQgdGhpcy5fdW5kaWNpLnZhbHVlO1xuXG5cdFx0Y29uc3QgdW5kaWNpSW5pdDogVW5kaWNpUmVxdWVzdEluaXQgPSB7IC4uLmluaXQgfTtcblxuXHRcdGxldCBodHRwVXJsID0gdXJsO1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSh1cmwpO1xuXG5cdFx0aWYgKHVyaS5zY2hlbWUgPT09ICd1bml4JyB8fCB1cmkuc2NoZW1lID09PSAncGlwZScpIHtcblx0XHRcdC8vIEJ5IGNvbnZlbnRpb24sIHdlIHB1dCB0aGUgKnNvY2tldCBwYXRoKiBhcyB0aGUgVVJJIHBhdGgsIGFuZCB0aGUgKnJlcXVlc3QgcGF0aCogaW4gdGhlIGZyYWdtZW50XG5cdFx0XHQvLyBTbywgc2V0IHRoZSBkaXNwYXRjaGVyIHdpdGggdGhlIHNvY2tldCBwYXRoXG5cdFx0XHR1bmRpY2lJbml0LmRpc3BhdGNoZXIgPSBuZXcgQWdlbnQoe1xuXHRcdFx0XHRzb2NrZXRQYXRoOiB1cmkucGF0aCxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBBbmQgdGhlbiByZXdyaXRlIHRoZSBVUkwgdG8gYmUgaHR0cDovL2xvY2FsaG9zdC88ZnJhZ21lbnQ+XG5cdFx0XHRodHRwVXJsID0gdXJpLndpdGgoe1xuXHRcdFx0XHRzY2hlbWU6ICdodHRwJyxcblx0XHRcdFx0YXV0aG9yaXR5OiAnbG9jYWxob3N0JywgLy8gSFRUUCBhbHdheXMgd2FudHMgYSBob3N0IChub3QgdGhhdCB3ZSdyZSB1c2luZyBpdCksIGJ1dCBpZiB3ZSdyZSB1c2luZyBhIHNvY2tldCBvciBwaXBlIHRoZW4gbG9jYWxob3N0IGlzIHNvcnRhIHJpZ2h0IGFueXdheVxuXHRcdFx0XHRwYXRoOiB1cmkuZnJhZ21lbnQsXG5cdFx0XHR9KS50b1N0cmluZyh0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHN1cGVyLl9mZXRjaEludGVybmFsKHVybCwgaW5pdCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdW5kaWNpUmVzcG9uc2UgPSBhd2FpdCBmZXRjaChodHRwVXJsLCB1bmRpY2lJbml0KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRzdGF0dXM6IHVuZGljaVJlc3BvbnNlLnN0YXR1cyxcblx0XHRcdHN0YXR1c1RleHQ6IHVuZGljaVJlc3BvbnNlLnN0YXR1c1RleHQsXG5cdFx0XHRoZWFkZXJzOiB1bmRpY2lSZXNwb25zZS5oZWFkZXJzIGFzIHVua25vd24gYXMgSGVhZGVycywgLy8gdW5kaWNpIGBIZWFkZXJzYCBjbGFzcyBubyBsb25nZXIgb3ZlcmxhcHMgd2l0aCBsaWIuZG9tIGBIZWFkZXJzYCAoYFNwZWNJdGVyYWJsZUl0ZXJhdG9yYCB2cyBgSGVhZGVyc0l0ZXJhdG9yYClcblx0XHRcdGJvZHk6IHVuZGljaVJlc3BvbnNlLmJvZHkgYXMgUmVhZGFibGVTdHJlYW0sIC8vIFdheSBkb3duIGluIGBSZWFkYWJsZVN0cmVhbVJlYWREb25lUmVzdWx0PFQ+YCwgYHZhbHVlYCBpcyBvcHRpb25hbCBpbiB0aGUgdW5kaWNpIHR5cGUgYnV0IHJlcXVpcmVkICh5ZXQgY2FuIGJlIGB1bmRlZmluZWRgKSBpbiB0aGUgc3RhbmRhcmQgdHlwZVxuXHRcdFx0dXJsOiB1bmRpY2lSZXNwb25zZS51cmwsXG5cdFx0XHRqc29uOiAoKSA9PiB1bmRpY2lSZXNwb25zZS5qc29uKCksXG5cdFx0XHR0ZXh0OiAoKSA9PiB1bmRpY2lSZXNwb25zZS50ZXh0KCksXG5cdFx0fTtcblx0fVxufVxuXG5jb25zdCB3aW5kb3dzU2hlbGxTY3JpcHRSZSA9IC9cXC4oYmF0fGNtZCkkL2k7XG5cbmV4cG9ydCBjb25zdCBlc2NhcGVDbWRBcmcgPSAoczogc3RyaW5nKTogc3RyaW5nID0+IGBcIiR7cy5yZXBsYWNlKC9cIi9nLCAnXCJcIicpfVwiYDtcblxuLyoqXG4gKiBGb3JtYXRzIGFyZ3VtZW50cyB0byBhdm9pZCBpc3N1ZXMgb24gV2luZG93cyBmb3IgQ1ZFLTIwMjQtMjc5ODAuXG4gKi9cbmV4cG9ydCBjb25zdCBmb3JtYXRTdWJwcm9jZXNzQXJndW1lbnRzID0gYXN5bmMgKFxuXHRleGVjdXRhYmxlOiBzdHJpbmcsXG5cdGFyZ3M6IFJlYWRvbmx5QXJyYXk8c3RyaW5nPixcblx0Y3dkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdGVudjogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPixcbikgPT4ge1xuXHRpZiAocHJvY2Vzcy5wbGF0Zm9ybSAhPT0gJ3dpbjMyJykge1xuXHRcdHJldHVybiB7IGV4ZWN1dGFibGUsIGFyZ3MsIHNoZWxsOiBmYWxzZSB9O1xuXHR9XG5cblx0Y29uc3QgZm91bmQgPSBhd2FpdCBmaW5kRXhlY3V0YWJsZShleGVjdXRhYmxlLCBjd2QsIHVuZGVmaW5lZCwgZW52KTtcblx0aWYgKGZvdW5kICYmIHdpbmRvd3NTaGVsbFNjcmlwdFJlLnRlc3QoZm91bmQpKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGV4ZWN1dGFibGU6IGVzY2FwZUNtZEFyZyhmb3VuZCksXG5cdFx0XHRhcmdzOiBhcmdzLm1hcChlc2NhcGVDbWRBcmcpLFxuXHRcdFx0c2hlbGw6IHRydWUsXG5cdFx0fTtcblx0fVxuXG5c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
