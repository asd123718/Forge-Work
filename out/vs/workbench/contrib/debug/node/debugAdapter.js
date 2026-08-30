import * as cp from "child_process";
import * as net from "net";
import * as objects from "../../../../base/common/objects.js";
import * as path from "../../../../base/common/path.js";
import * as platform from "../../../../base/common/platform.js";
import * as strings from "../../../../base/common/strings.js";
import { Promises } from "../../../../base/node/pfs.js";
import * as nls from "../../../../nls.js";
import { AbstractDebugAdapter } from "../common/abstractDebugAdapter.js";
import { killTree } from "../../../../base/node/processes.js";
const _StreamDebugAdapter = class _StreamDebugAdapter extends AbstractDebugAdapter {
  constructor() {
    super();
    this.rawData = Buffer.allocUnsafe(0);
    this.contentLength = -1;
  }
  connect(readable, writable) {
    this.outputStream = writable;
    this.rawData = Buffer.allocUnsafe(0);
    this.contentLength = -1;
    readable.on("data", (data) => this.handleData(data));
  }
  sendMessage(message) {
    if (this.outputStream) {
      const json = JSON.stringify(message);
      this.outputStream.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}${_StreamDebugAdapter.TWO_CRLF}${json}`, "utf8");
    }
  }
  handleData(data) {
    this.rawData = Buffer.concat([this.rawData, data]);
    while (true) {
      if (this.contentLength >= 0) {
        if (this.rawData.length >= this.contentLength) {
          const message = this.rawData.toString("utf8", 0, this.contentLength);
          this.rawData = this.rawData.slice(this.contentLength);
          this.contentLength = -1;
          if (message.length > 0) {
            try {
              this.acceptMessage(JSON.parse(message));
            } catch (e) {
              this._onError.fire(new Error((e.message || e) + "\n" + message));
            }
          }
          continue;
        }
      } else {
        const idx = this.rawData.indexOf(_StreamDebugAdapter.TWO_CRLF);
        if (idx !== -1) {
          const header = this.rawData.toString("utf8", 0, idx);
          const lines = header.split(_StreamDebugAdapter.HEADER_LINESEPARATOR);
          for (const h of lines) {
            const kvPair = h.split(_StreamDebugAdapter.HEADER_FIELDSEPARATOR);
            if (kvPair[0] === "Content-Length") {
              this.contentLength = Number(kvPair[1]);
            }
          }
          this.rawData = this.rawData.slice(idx + _StreamDebugAdapter.TWO_CRLF.length);
          continue;
        }
      }
      break;
    }
  }
};
_StreamDebugAdapter.TWO_CRLF = "\r\n\r\n";
_StreamDebugAdapter.HEADER_LINESEPARATOR = /\r?\n/;
// allow for non-RFC 2822 conforming line separators
_StreamDebugAdapter.HEADER_FIELDSEPARATOR = /: */;
let StreamDebugAdapter = _StreamDebugAdapter;
class NetworkDebugAdapter extends StreamDebugAdapter {
  startSession() {
    return new Promise((resolve, reject) => {
      let connected = false;
      this.socket = this.createConnection(() => {
        this.connect(this.socket, this.socket);
        resolve();
        connected = true;
      });
      this.socket.on("close", () => {
        if (connected) {
          this._onError.fire(new Error("connection closed"));
        } else {
          reject(new Error("connection closed"));
        }
      });
      this.socket.on("error", (error) => {
        if (error instanceof AggregateError) {
          error = error.errors[0];
        }
        if (connected) {
          this._onError.fire(error);
        } else {
          reject(error);
        }
      });
    });
  }
  async stopSession() {
    await this.cancelPendingRequests();
    if (this.socket) {
      this.socket.end();
      this.socket = void 0;
    }
  }
}
class SocketDebugAdapter extends NetworkDebugAdapter {
  constructor(adapterServer) {
    super();
    this.adapterServer = adapterServer;
  }
  createConnection(connectionListener) {
    return net.createConnection(this.adapterServer.port, this.adapterServer.host || "127.0.0.1", connectionListener);
  }
}
class NamedPipeDebugAdapter extends NetworkDebugAdapter {
  constructor(adapterServer) {
    super();
    this.adapterServer = adapterServer;
  }
  createConnection(connectionListener) {
    return net.createConnection(this.adapterServer.path, connectionListener);
  }
}
class ExecutableDebugAdapter extends StreamDebugAdapter {
  constructor(adapterExecutable, debugType) {
    super();
    this.adapterExecutable = adapterExecutable;
    this.debugType = debugType;
  }
  async startSession() {
    const command = this.adapterExecutable.command;
    const args = this.adapterExecutable.args;
    const options = this.adapterExecutable.options || {};
    try {
      if (command) {
        if (path.isAbsolute(command)) {
          const commandExists = await Promises.exists(command);
          if (!commandExists) {
            throw new Error(nls.localize("debugAdapterBinNotFound", "Debug adapter executable '{0}' does not exist.", command));
          }
        } else {
          if (command.indexOf("/") < 0 && command.indexOf("\\") < 0) {
          }
        }
      } else {
        throw new Error(nls.localize(
          { key: "debugAdapterCannotDetermineExecutable", comment: ["Adapter executable file not found"] },
          "Cannot determine executable for debug adapter '{0}'.",
          this.debugType
        ));
      }
      let env = process.env;
      if (options.env && Object.keys(options.env).length > 0) {
        env = objects.mixin(objects.deepClone(process.env), options.env);
      }
      if (command === "node") {
        if (Array.isArray(args) && args.length > 0) {
          const isElectron = !!process.env["ELECTRON_RUN_AS_NODE"] || !!process.versions["electron"];
          const forkOptions = {
            env,
            execArgv: isElectron ? ["-e", "delete process.env.ELECTRON_RUN_AS_NODE;require(process.argv[1])"] : [],
            silent: true
          };
          if (options.cwd) {
            forkOptions.cwd = options.cwd;
          }
          const child = cp.fork(args[0], args.slice(1), forkOptions);
          if (!child.pid) {
            throw new Error(nls.localize("unableToLaunchDebugAdapter", "Unable to launch debug adapter from '{0}'.", args[0]));
          }
          this.serverProcess = child;
        } else {
          throw new Error(nls.localize("unableToLaunchDebugAdapterNoArgs", "Unable to launch debug adapter."));
        }
      } else {
        let spawnCommand = command;
        let spawnArgs = args;
        const spawnOptions = {
          env
        };
        if (options.cwd) {
          spawnOptions.cwd = options.cwd;
        }
        if (platform.isWindows && (command.endsWith(".bat") || command.endsWith(".cmd"))) {
          spawnOptions.shell = true;
          spawnCommand = `"${command}"`;
          spawnArgs = args.map((a) => {
            a = a.replace(/"/g, '\\"');
            return `"${a}"`;
          });
        }
        this.serverProcess = cp.spawn(spawnCommand, spawnArgs, spawnOptions);
      }
      this.serverProcess.on("error", (err) => {
        this._onError.fire(err);
      });
      this.serverProcess.on("exit", (code, signal) => {
        this._onExit.fire(code);
      });
      this.serverProcess.stdout.on("close", () => {
        this._onError.fire(new Error("read error"));
      });
      this.serverProcess.stdout.on("error", (error) => {
        this._onError.fire(error);
      });
      this.serverProcess.stdin.on("error", (error) => {
        this._onError.fire(error);
      });
      this.serverProcess.stderr.resume();
      this.connect(this.serverProcess.stdout, this.serverProcess.stdin);
    } catch (err) {
      this._onError.fire(err);
    }
  }
  async stopSession() {
    if (!this.serverProcess) {
      return Promise.resolve(void 0);
    }
    await this.cancelPendingRequests();
    if (platform.isWindows) {
      return killTree(this.serverProcess.pid, true).catch(() => {
        this.serverProcess?.kill();
      });
    } else {
      this.serverProcess.kill("SIGTERM");
      return Promise.resolve(void 0);
    }
  }
  static extract(platformContribution, extensionFolderPath) {
    if (!platformContribution) {
      return void 0;
    }
    const result = /* @__PURE__ */ Object.create(null);
    if (platformContribution.runtime) {
      if (platformContribution.runtime.indexOf("./") === 0) {
        result.runtime = path.join(extensionFolderPath, platformContribution.runtime);
      } else {
        result.runtime = platformContribution.runtime;
      }
    }
    if (platformContribution.runtimeArgs) {
      result.runtimeArgs = platformContribution.runtimeArgs;
    }
    if (platformContribution.program) {
      if (!path.isAbsolute(platformContribution.program)) {
        result.program = path.join(extensionFolderPath, platformContribution.program);
      } else {
        result.program = platformContribution.program;
      }
    }
    if (platformContribution.args) {
      result.args = platformContribution.args;
    }
    const contribution = platformContribution;
    if (contribution.win) {
      result.win = ExecutableDebugAdapter.extract(contribution.win, extensionFolderPath);
    }
    if (contribution.winx86) {
      result.winx86 = ExecutableDebugAdapter.extract(contribution.winx86, extensionFolderPath);
    }
    if (contribution.windows) {
      result.windows = ExecutableDebugAdapter.extract(contribution.windows, extensionFolderPath);
    }
    if (contribution.osx) {
      result.osx = ExecutableDebugAdapter.extract(contribution.osx, extensionFolderPath);
    }
    if (contribution.linux) {
      result.linux = ExecutableDebugAdapter.extract(contribution.linux, extensionFolderPath);
    }
    return result;
  }
  static platformAdapterExecutable(extensionDescriptions, debugType) {
    let result = /* @__PURE__ */ Object.create(null);
    debugType = debugType.toLowerCase();
    for (const ed of extensionDescriptions) {
      if (ed.contributes) {
        const debuggers = ed.contributes["debuggers"];
        if (debuggers && debuggers.length > 0) {
          debuggers.filter((dbg) => typeof dbg.type === "string" && strings.equalsIgnoreCase(dbg.type, debugType)).forEach((dbg) => {
            const extractedDbg = ExecutableDebugAdapter.extract(dbg, ed.extensionLocation.fsPath);
            result = objects.mixin(result, extractedDbg, ed.isBuiltin);
          });
        }
      }
    }
    let platformInfo;
    if (platform.isWindows && !process.env.hasOwnProperty("PROCESSOR_ARCHITEW6432")) {
      platformInfo = result.winx86 || result.win || result.windows;
    } else if (platform.isWindows) {
      platformInfo = result.win || result.windows;
    } else if (platform.isMacintosh) {
      platformInfo = result.osx;
    } else if (platform.isLinux) {
      platformInfo = result.linux;
    }
    platformInfo = platformInfo || result;
    const program = platformInfo.program || result.program;
    const args = platformInfo.args || result.args;
    const runtime = platformInfo.runtime || result.runtime;
    const runtimeArgs = platformInfo.runtimeArgs || result.runtimeArgs;
    if (runtime) {
      return {
        type: "executable",
        command: runtime,
        args: (runtimeArgs || []).concat(typeof program === "string" ? [program] : []).concat(args || [])
      };
    } else if (program) {
      return {
        type: "executable",
        command: program,
        args: args || []
      };
    }
    return void 0;
  }
}
export {
  ExecutableDebugAdapter,
  NamedPipeDebugAdapter,
  NetworkDebugAdapter,
  SocketDebugAdapter,
  StreamDebugAdapter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxub2RlXFxkZWJ1Z0FkYXB0ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBjcCBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCAqIGFzIG5ldCBmcm9tICduZXQnO1xuaW1wb3J0ICogYXMgc3RyZWFtIGZyb20gJ3N0cmVhbSc7XG5pbXBvcnQgKiBhcyBvYmplY3RzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2Uvbm9kZS9wZnMuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElEZWJ1Z0FkYXB0ZXJFeGVjdXRhYmxlLCBJRGVidWdBZGFwdGVyTmFtZWRQaXBlU2VydmVyLCBJRGVidWdBZGFwdGVyU2VydmVyLCBJRGVidWdnZXJDb250cmlidXRpb24sIElQbGF0Zm9ybVNwZWNpZmljQWRhcHRlckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdERlYnVnQWRhcHRlciB9IGZyb20gJy4uL2NvbW1vbi9hYnN0cmFjdERlYnVnQWRhcHRlci5qcyc7XG5pbXBvcnQgeyBraWxsVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2Uvbm9kZS9wcm9jZXNzZXMuanMnO1xuXG4vKipcbiAqIEFuIGltcGxlbWVudGF0aW9uIHRoYXQgY29tbXVuaWNhdGVzIHZpYSB0d28gc3RyZWFtcyB3aXRoIHRoZSBkZWJ1ZyBhZGFwdGVyLlxuICovXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgU3RyZWFtRGVidWdBZGFwdGVyIGV4dGVuZHMgQWJzdHJhY3REZWJ1Z0FkYXB0ZXIge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFRXT19DUkxGID0gJ1xcclxcblxcclxcbic7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEhFQURFUl9MSU5FU0VQQVJBVE9SID0gL1xccj9cXG4vO1x0Ly8gYWxsb3cgZm9yIG5vbi1SRkMgMjgyMiBjb25mb3JtaW5nIGxpbmUgc2VwYXJhdG9yc1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBIRUFERVJfRklFTERTRVBBUkFUT1IgPSAvOiAqLztcblxuXHRwcml2YXRlIG91dHB1dFN0cmVhbSE6IHN0cmVhbS5Xcml0YWJsZTtcblx0cHJpdmF0ZSByYXdEYXRhID0gQnVmZmVyLmFsbG9jVW5zYWZlKDApO1xuXHRwcml2YXRlIGNvbnRlbnRMZW5ndGggPSAtMTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNvbm5lY3QocmVhZGFibGU6IHN0cmVhbS5SZWFkYWJsZSwgd3JpdGFibGU6IHN0cmVhbS5Xcml0YWJsZSk6IHZvaWQge1xuXG5cdFx0dGhpcy5vdXRwdXRTdHJlYW0gPSB3cml0YWJsZTtcblx0XHR0aGlzLnJhd0RhdGEgPSBCdWZmZXIuYWxsb2NVbnNhZmUoMCk7XG5cdFx0dGhpcy5jb250ZW50TGVuZ3RoID0gLTE7XG5cblx0XHRyZWFkYWJsZS5vbignZGF0YScsIChkYXRhOiBCdWZmZXIpID0+IHRoaXMuaGFuZGxlRGF0YShkYXRhKSk7XG5cdH1cblxuXHRzZW5kTWVzc2FnZShtZXNzYWdlOiBEZWJ1Z1Byb3RvY29sLlByb3RvY29sTWVzc2FnZSk6IHZvaWQge1xuXG5cdFx0aWYgKHRoaXMub3V0cHV0U3RyZWFtKSB7XG5cdFx0XHRjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkobWVzc2FnZSk7XG5cdFx0XHR0aGlzLm91dHB1dFN0cmVhbS53cml0ZShgQ29udGVudC1MZW5ndGg6ICR7QnVmZmVyLmJ5dGVMZW5ndGgoanNvbiwgJ3V0ZjgnKX0ke1N0cmVhbURlYnVnQWRhcHRlci5UV09fQ1JMRn0ke2pzb259YCwgJ3V0ZjgnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZURhdGEoZGF0YTogQnVmZmVyKTogdm9pZCB7XG5cblx0XHR0aGlzLnJhd0RhdGEgPSBCdWZmZXIuY29uY2F0KFt0aGlzLnJhd0RhdGEsIGRhdGFdKTtcblxuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRpZiAodGhpcy5jb250ZW50TGVuZ3RoID49IDApIHtcblx0XHRcdFx0aWYgKHRoaXMucmF3RGF0YS5sZW5ndGggPj0gdGhpcy5jb250ZW50TGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IHRoaXMucmF3RGF0YS50b1N0cmluZygndXRmOCcsIDAsIHRoaXMuY29udGVudExlbmd0aCk7XG5cdFx0XHRcdFx0dGhpcy5yYXdEYXRhID0gdGhpcy5yYXdEYXRhLnNsaWNlKHRoaXMuY29udGVudExlbmd0aCk7XG5cdFx0XHRcdFx0dGhpcy5jb250ZW50TGVuZ3RoID0gLTE7XG5cdFx0XHRcdFx0aWYgKG1lc3NhZ2UubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0dGhpcy5hY2NlcHRNZXNzYWdlKDxEZWJ1Z1Byb3RvY29sLlByb3RvY29sTWVzc2FnZT5KU09OLnBhcnNlKG1lc3NhZ2UpKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fb25FcnJvci5maXJlKG5ldyBFcnJvcigoZS5tZXNzYWdlIHx8IGUpICsgJ1xcbicgKyBtZXNzYWdlKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnRpbnVlO1x0Ly8gdGhlcmUgbWF5IGJlIG1vcmUgY29tcGxldGUgbWVzc2FnZXMgdG8gcHJvY2Vzc1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBpZHggPSB0aGlzLnJhd0RhdGEuaW5kZXhPZihTdHJlYW1EZWJ1Z0FkYXB0ZXIuVFdPX0NSTEYpO1xuXHRcdFx0XHRpZiAoaWR4ICE9PSAtMSkge1xuXHRcdFx0XHRcdGNvbnN0IGhlYWRlciA9IHRoaXMucmF3RGF0YS50b1N0cmluZygndXRmOCcsIDAsIGlkeCk7XG5cdFx0XHRcdFx0Y29uc3QgbGluZXMgPSBoZWFkZXIuc3BsaXQoU3RyZWFtRGVidWdBZGFwdGVyLkhFQURFUl9MSU5FU0VQQVJBVE9SKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGggb2YgbGluZXMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGt2UGFpciA9IGguc3BsaXQoU3RyZWFtRGVidWdBZGFwdGVyLkhFQURFUl9GSUVMRFNFUEFSQVRPUik7XG5cdFx0XHRcdFx0XHRpZiAoa3ZQYWlyWzBdID09PSAnQ29udGVudC1MZW5ndGgnKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuY29udGVudExlbmd0aCA9IE51bWJlcihrdlBhaXJbMV0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLnJhd0RhdGEgPSB0aGlzLnJhd0RhdGEuc2xpY2UoaWR4ICsgU3RyZWFtRGVidWdBZGFwdGVyLlRXT19DUkxGLmxlbmd0aCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgTmV0d29ya0RlYnVnQWRhcHRlciBleHRlbmRzIFN0cmVhbURlYnVnQWRhcHRlciB7XG5cblx0cHJvdGVjdGVkIHNvY2tldD86IG5ldC5Tb2NrZXQ7XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGNyZWF0ZUNvbm5lY3Rpb24oY29ubmVjdGlvbkxpc3RlbmVyOiAoKSA9PiB2b2lkKTogbmV0LlNvY2tldDtcblxuXHRzdGFydFNlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGxldCBjb25uZWN0ZWQgPSBmYWxzZTtcblxuXHRcdFx0dGhpcy5zb2NrZXQgPSB0aGlzLmNyZWF0ZUNvbm5lY3Rpb24oKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmNvbm5lY3QodGhpcy5zb2NrZXQhLCB0aGlzLnNvY2tldCEpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdGNvbm5lY3RlZCA9IHRydWU7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5zb2NrZXQub24oJ2Nsb3NlJywgKCkgPT4ge1xuXHRcdFx0XHRpZiAoY29ubmVjdGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25FcnJvci5maXJlKG5ldyBFcnJvcignY29ubmVjdGlvbiBjbG9zZWQnKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcignY29ubmVjdGlvbiBjbG9zZWQnKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLnNvY2tldC5vbignZXJyb3InLCBlcnJvciA9PiB7XG5cdFx0XHRcdC8vIE9uIGlwdjYgcG9zaXggdGhpcyBjYW4gYmUgYW4gQWdncmVnYXRlRXJyb3Igd2hpY2ggbGFja3MgYSBtZXNzYWdlLiBVc2UgdGhlIGZpcnN0LlxuXHRcdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBBZ2dyZWdhdGVFcnJvcikge1xuXHRcdFx0XHRcdGVycm9yID0gZXJyb3IuZXJyb3JzWzBdO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGNvbm5lY3RlZCkge1xuXHRcdFx0XHRcdHRoaXMuX29uRXJyb3IuZmlyZShlcnJvcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBzdG9wU2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmNhbmNlbFBlbmRpbmdSZXF1ZXN0cygpO1xuXHRcdGlmICh0aGlzLnNvY2tldCkge1xuXHRcdFx0dGhpcy5zb2NrZXQuZW5kKCk7XG5cdFx0XHR0aGlzLnNvY2tldCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBBbiBpbXBsZW1lbnRhdGlvbiB0aGF0IGNvbm5lY3RzIHRvIGEgZGVidWcgYWRhcHRlciB2aWEgYSBzb2NrZXQuXG4qL1xuZXhwb3J0IGNsYXNzIFNvY2tldERlYnVnQWRhcHRlciBleHRlbmRzIE5ldHdvcmtEZWJ1Z0FkYXB0ZXIge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgYWRhcHRlclNlcnZlcjogSURlYnVnQWRhcHRlclNlcnZlcikge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlQ29ubmVjdGlvbihjb25uZWN0aW9uTGlzdGVuZXI6ICgpID0+IHZvaWQpOiBuZXQuU29ja2V0IHtcblx0XHRyZXR1cm4gbmV0LmNyZWF0ZUNvbm5lY3Rpb24odGhpcy5hZGFwdGVyU2VydmVyLnBvcnQsIHRoaXMuYWRhcHRlclNlcnZlci5ob3N0IHx8ICcxMjcuMC4wLjEnLCBjb25uZWN0aW9uTGlzdGVuZXIpO1xuXHR9XG59XG5cbi8qKlxuICogQW4gaW1wbGVtZW50YXRpb24gdGhhdCBjb25uZWN0cyB0byBhIGRlYnVnIGFkYXB0ZXIgdmlhIGEgTmFtZWRQaXBlIChvbiBXaW5kb3dzKS9VTklYIERvbWFpbiBTb2NrZXQgKG9uIG5vbi1XaW5kb3dzKS5cbiAqL1xuZXhwb3J0IGNsYXNzIE5hbWVkUGlwZURlYnVnQWRhcHRlciBleHRlbmRzIE5ldHdvcmtEZWJ1Z0FkYXB0ZXIge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgYWRhcHRlclNlcnZlcjogSURlYnVnQWRhcHRlck5hbWVkUGlwZVNlcnZlcikge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlQ29ubmVjdGlvbihjb25uZWN0aW9uTGlzdGVuZXI6ICgpID0+IHZvaWQpOiBuZXQuU29ja2V0IHtcblx0XHRyZXR1cm4gbmV0LmNyZWF0ZUNvbm5lY3Rpb24odGhpcy5hZGFwdGVyU2VydmVyLnBhdGgsIGNvbm5lY3Rpb25MaXN0ZW5lcik7XG5cdH1cbn1cblxuLyoqXG4gKiBBbiBpbXBsZW1lbnRhdGlvbiB0aGF0IGxhdW5jaGVzIHRoZSBkZWJ1ZyBhZGFwdGVyIGFzIGEgc2VwYXJhdGUgcHJvY2VzcyBhbmQgY29tbXVuaWNhdGVzIHZpYSBzdGRpbi9zdGRvdXQuXG4qL1xuZXhwb3J0IGNsYXNzIEV4ZWN1dGFibGVEZWJ1Z0FkYXB0ZXIgZXh0ZW5kcyBTdHJlYW1EZWJ1Z0FkYXB0ZXIge1xuXG5cdHByaXZhdGUgc2VydmVyUHJvY2VzczogY3AuQ2hpbGRQcm9jZXNzIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgYWRhcHRlckV4ZWN1dGFibGU6IElEZWJ1Z0FkYXB0ZXJFeGVjdXRhYmxlLCBwcml2YXRlIGRlYnVnVHlwZTogc3RyaW5nKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIHN0YXJ0U2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGNvbnN0IGNvbW1hbmQgPSB0aGlzLmFkYXB0ZXJFeGVjdXRhYmxlLmNvbW1hbmQ7XG5cdFx0Y29uc3QgYXJncyA9IHRoaXMuYWRhcHRlckV4ZWN1dGFibGUuYXJncztcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5hZGFwdGVyRXhlY3V0YWJsZS5vcHRpb25zIHx8IHt9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIHZlcmlmeSBleGVjdXRhYmxlcyBhc3luY2hyb25vdXNseVxuXHRcdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdFx0aWYgKHBhdGguaXNBYnNvbHV0ZShjb21tYW5kKSkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbW1hbmRFeGlzdHMgPSBhd2FpdCBQcm9taXNlcy5leGlzdHMoY29tbWFuZCk7XG5cdFx0XHRcdFx0aWYgKCFjb21tYW5kRXhpc3RzKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdkZWJ1Z0FkYXB0ZXJCaW5Ob3RGb3VuZCcsIFwiRGVidWcgYWRhcHRlciBleGVjdXRhYmxlICd7MH0nIGRvZXMgbm90IGV4aXN0LlwiLCBjb21tYW5kKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIHJlbGF0aXZlIHBhdGhcblx0XHRcdFx0XHRpZiAoY29tbWFuZC5pbmRleE9mKCcvJykgPCAwICYmIGNvbW1hbmQuaW5kZXhPZignXFxcXCcpIDwgMCkge1xuXHRcdFx0XHRcdFx0Ly8gbm8gc2VwYXJhdG9yczogY29tbWFuZCBsb29rcyBsaWtlIGEgcnVudGltZSBuYW1lIGxpa2UgJ25vZGUnIG9yICdtb25vJ1xuXHRcdFx0XHRcdFx0Ly8gVE9ETzogY2hlY2sgdGhhdCB0aGUgcnVudGltZSBpcyBhdmFpbGFibGUgb24gUEFUSFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKG5scy5sb2NhbGl6ZSh7IGtleTogJ2RlYnVnQWRhcHRlckNhbm5vdERldGVybWluZUV4ZWN1dGFibGUnLCBjb21tZW50OiBbJ0FkYXB0ZXIgZXhlY3V0YWJsZSBmaWxlIG5vdCBmb3VuZCddIH0sXG5cdFx0XHRcdFx0XCJDYW5ub3QgZGV0ZXJtaW5lIGV4ZWN1dGFibGUgZm9yIGRlYnVnIGFkYXB0ZXIgJ3swfScuXCIsIHRoaXMuZGVidWdUeXBlKSk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBlbnYgPSBwcm9jZXNzLmVudjtcblx0XHRcdGlmIChvcHRpb25zLmVudiAmJiBPYmplY3Qua2V5cyhvcHRpb25zLmVudikubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRlbnYgPSBvYmplY3RzLm1peGluKG9iamVjdHMuZGVlcENsb25lKHByb2Nlc3MuZW52KSwgb3B0aW9ucy5lbnYpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY29tbWFuZCA9PT0gJ25vZGUnKSB7XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KGFyZ3MpICYmIGFyZ3MubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGlzRWxlY3Ryb24gPSAhIXByb2Nlc3MuZW52WydFTEVDVFJPTl9SVU5fQVNfTk9ERSddIHx8ICEhcHJvY2Vzcy52ZXJzaW9uc1snZWxlY3Ryb24nXTtcblx0XHRcdFx0XHRjb25zdCBmb3JrT3B0aW9uczogY3AuRm9ya09wdGlvbnMgPSB7XG5cdFx0XHRcdFx0XHRlbnY6IGVudixcblx0XHRcdFx0XHRcdGV4ZWNBcmd2OiBpc0VsZWN0cm9uID8gWyctZScsICdkZWxldGUgcHJvY2Vzcy5lbnYuRUxFQ1RST05fUlVOX0FTX05PREU7cmVxdWlyZShwcm9jZXNzLmFyZ3ZbMV0pJ10gOiBbXSxcblx0XHRcdFx0XHRcdHNpbGVudDogdHJ1ZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0aWYgKG9wdGlvbnMuY3dkKSB7XG5cdFx0XHRcdFx0XHRmb3JrT3B0aW9ucy5jd2QgPSBvcHRpb25zLmN3ZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgY2hpbGQgPSBjcC5mb3JrKGFyZ3NbMF0sIGFyZ3Muc2xpY2UoMSksIGZvcmtPcHRpb25zKTtcblx0XHRcdFx0XHRpZiAoIWNoaWxkLnBpZCkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKG5scy5sb2NhbGl6ZSgndW5hYmxlVG9MYXVuY2hEZWJ1Z0FkYXB0ZXInLCBcIlVuYWJsZSB0byBsYXVuY2ggZGVidWcgYWRhcHRlciBmcm9tICd7MH0nLlwiLCBhcmdzWzBdKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuc2VydmVyUHJvY2VzcyA9IGNoaWxkO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoJ3VuYWJsZVRvTGF1bmNoRGVidWdBZGFwdGVyTm9BcmdzJywgXCJVbmFibGUgdG8gbGF1bmNoIGRlYnVnIGFkYXB0ZXIuXCIpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IHNwYXduQ29tbWFuZCA9IGNvbW1hbmQ7XG5cdFx0XHRcdGxldCBzcGF3bkFyZ3MgPSBhcmdzO1xuXHRcdFx0XHRjb25zdCBzcGF3bk9wdGlvbnM6IGNwLlNwYXduT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRlbnY6IGVudlxuXHRcdFx0XHR9O1xuXHRcdFx0XHRpZiAob3B0aW9ucy5jd2QpIHtcblx0XHRcdFx0XHRzcGF3bk9wdGlvbnMuY3dkID0gb3B0aW9ucy5jd2Q7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBsYXRmb3JtLmlzV2luZG93cyAmJiAoY29tbWFuZC5lbmRzV2l0aCgnLmJhdCcpIHx8IGNvbW1hbmQuZW5kc1dpdGgoJy5jbWQnKSkpIHtcblx0XHRcdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjI0MTg0XG5cdFx0XHRcdFx0c3Bhd25PcHRpb25zLnNoZWxsID0gdHJ1ZTtcblx0XHRcdFx0XHRzcGF3bkNvbW1hbmQgPSBgXCIke2NvbW1hbmR9XCJgO1xuXHRcdFx0XHRcdHNwYXduQXJncyA9IGFyZ3MubWFwKGEgPT4ge1xuXHRcdFx0XHRcdFx0YSA9IGEucmVwbGFjZSgvXCIvZywgJ1xcXFxcIicpOyAvLyBFc2NhcGUgZXhpc3RpbmcgZG91YmxlIHF1b3RlcyB3aXRoIFxcXG5cdFx0XHRcdFx0XHQvLyBXcmFwIGluIGRvdWJsZSBxdW90ZXNcblx0XHRcdFx0XHRcdHJldHVybiBgXCIke2F9XCJgO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5zZXJ2ZXJQcm9jZXNzID0gY3Auc3Bhd24oc3Bhd25Db21tYW5kLCBzcGF3bkFyZ3MsIHNwYXduT3B0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuc2VydmVyUHJvY2Vzcy5vbignZXJyb3InLCBlcnIgPT4ge1xuXHRcdFx0XHR0aGlzLl9vbkVycm9yLmZpcmUoZXJyKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5zZXJ2ZXJQcm9jZXNzLm9uKCdleGl0JywgKGNvZGUsIHNpZ25hbCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9vbkV4aXQuZmlyZShjb2RlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLnNlcnZlclByb2Nlc3Muc3Rkb3V0IS5vbignY2xvc2UnLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX29uRXJyb3IuZmlyZShuZXcgRXJyb3IoJ3JlYWQgZXJyb3InKSk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuc2VydmVyUHJvY2Vzcy5zdGRvdXQhLm9uKCdlcnJvcicsIGVycm9yID0+IHtcblx0XHRcdFx0dGhpcy5fb25FcnJvci5maXJlKGVycm9yKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLnNlcnZlclByb2Nlc3Muc3RkaW4hLm9uKCdlcnJvcicsIGVycm9yID0+IHtcblx0XHRcdFx0dGhpcy5fb25FcnJvci5maXJlKGVycm9yKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLnNlcnZlclByb2Nlc3Muc3RkZXJyIS5yZXN1bWUoKTtcblxuXHRcdFx0Ly8gZmluYWxseSBjb25uZWN0IHRvIHRoZSBEQVxuXHRcdFx0dGhpcy5jb25uZWN0KHRoaXMuc2VydmVyUHJvY2Vzcy5zdGRvdXQhLCB0aGlzLnNlcnZlclByb2Nlc3Muc3RkaW4hKTtcblxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fb25FcnJvci5maXJlKGVycik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc3RvcFNlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRpZiAoIXRoaXMuc2VydmVyUHJvY2Vzcykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdC8vIHdoZW4ga2lsbGluZyBhIHByb2Nlc3MgaW4gd2luZG93cyBpdHMgY2hpbGRcblx0XHQvLyBwcm9jZXNzZXMgYXJlICpub3QqIGtpbGxlZCBidXQgYmVjb21lIHJvb3Rcblx0XHQvLyBwcm9jZXNzZXMuIFRoZXJlZm9yZSB3ZSB1c2UgVEFTS0tJTEwuRVhFXG5cdFx0YXdhaXQgdGhpcy5jYW5jZWxQZW5kaW5nUmVxdWVzdHMoKTtcblx0XHRpZiAocGxhdGZvcm0uaXNXaW5kb3dzKSB7XG5cdFx0XHRyZXR1cm4ga2lsbFRyZWUodGhpcy5zZXJ2ZXJQcm9jZXNzIS5waWQhLCB0cnVlKS5jYXRjaCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuc2VydmVyUHJvY2Vzcz8ua2lsbCgpO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2VydmVyUHJvY2Vzcy5raWxsKCdTSUdURVJNJyk7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgZXh0cmFjdChwbGF0Zm9ybUNvbnRyaWJ1dGlvbjogSVBsYXRmb3JtU3BlY2lmaWNBZGFwdGVyQ29udHJpYnV0aW9uLCBleHRlbnNpb25Gb2xkZXJQYXRoOiBzdHJpbmcpOiBJRGVidWdnZXJDb250cmlidXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGlmICghcGxhdGZvcm1Db250cmlidXRpb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBJRGVidWdnZXJDb250cmlidXRpb24gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGlmIChwbGF0Zm9ybUNvbnRyaWJ1dGlvbi5ydW50aW1lKSB7XG5cdFx0XHRpZiAocGxhdGZvcm1Db250cmlidXRpb24ucnVudGltZS5pbmRleE9mKCcuLycpID09PSAwKSB7XHQvLyBUT0RPXG5cdFx0XHRcdHJlc3VsdC5ydW50aW1lID0gcGF0aC5qb2luKGV4dGVuc2lvbkZvbGRlclBhdGgsIHBsYXRmb3JtQ29udHJpYnV0aW9uLnJ1bnRpbWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnJ1bnRpbWUgPSBwbGF0Zm9ybUNvbnRyaWJ1dGlvbi5ydW50aW1lO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocGxhdGZvcm1Db250cmlidXRpb24ucnVudGltZUFyZ3MpIHtcblx0XHRcdHJlc3VsdC5ydW50aW1lQXJncyA9IHBsYXRmb3JtQ29udHJpYnV0aW9uLnJ1bnRpbWVBcmdzO1xuXHRcdH1cblx0XHRpZiAocGxhdGZvcm1Db250cmlidXRpb24ucHJvZ3JhbSkge1xuXHRcdFx0aWYgKCFwYXRoLmlzQWJzb2x1dGUocGxhdGZvcm1Db250cmlidXRpb24ucHJvZ3JhbSkpIHtcblx0XHRcdFx0cmVzdWx0LnByb2dyYW0gPSBwYXRoLmpvaW4oZXh0ZW5zaW9uRm9sZGVyUGF0aCwgcGxhdGZvcm1Db250cmlidXRpb24ucHJvZ3JhbSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQucHJvZ3JhbSA9IHBsYXRmb3JtQ29udHJpYnV0aW9uLnByb2dyYW07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChwbGF0Zm9ybUNvbnRyaWJ1dGlvbi5hcmdzKSB7XG5cdFx0XHRyZXN1bHQuYXJncyA9IHBsYXRmb3JtQ29udHJpYnV0aW9uLmFyZ3M7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gcGxhdGZvcm1Db250cmlidXRpb24gYXMgSURlYnVnZ2VyQ29udHJpYnV0aW9uO1xuXG5cdFx0aWYgKGNvbnRyaWJ1dGlvbi53aW4pIHtcblx0XHRcdHJlc3VsdC53aW4gPSBFeGVjdXRhYmxlRGVidWdBZGFwdGVyLmV4dHJhY3QoY29udHJpYnV0aW9uLndpbiwgZXh0ZW5zaW9uRm9sZGVyUGF0aCk7XG5cdFx0fVxuXHRcdGlmIChjb250cmlidXRpb24ud2lueDg2KSB7XG5cdFx0XHRyZXN1bHQud2lueDg2ID0gRXhlY3V0YWJsZURlYnVnQWRhcHRlci5leHRyYWN0KGNvbnRyaWJ1dGlvbi53aW54ODYsIGV4dGVuc2lvbkZvbGRlclBhdGgpO1xuXHRcdH1cblx0XHRpZiAoY29udHJpYnV0aW9uLndpbmRvd3MpIHtcblx0XHRcdHJlc3VsdC53aW5kb3dzID0gRXhlY3V0YWJsZURlYnVnQWRhcHRlci5leHRyYWN0KGNvbnRyaWJ1dGlvbi53aW5kb3dzLCBleHRlbnNpb25Gb2xkZXJQYXRoKTtcblx0XHR9XG5cdFx0aWYgKGNvbnRyaWJ1dGlvbi5vc3gpIHtcblx0XHRcdHJlc3VsdC5vc3ggPSBFeGVjdXRhYmxlRGVidWdBZGFwdGVyLmV4dHJhY3QoY29udHJpYnV0aW9uLm9zeCwgZXh0ZW5zaW9uRm9sZGVyUGF0aCk7XG5cdFx0fVxuXHRcdGlmIChjb250cmlidXRpb24ubGludXgpIHtcblx0XHRcdHJlc3VsdC5saW51eCA9IEV4ZWN1dGFibGVEZWJ1Z0FkYXB0ZXIuZXh0cmFjdChjb250cmlidXRpb24ubGludXgsIGV4dGVuc2lvbkZvbGRlclBhdGgpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0c3RhdGljIHBsYXRmb3JtQWRhcHRlckV4ZWN1dGFibGUoZXh0ZW5zaW9uRGVzY3JpcHRpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSwgZGVidWdUeXBlOiBzdHJpbmcpOiBJRGVidWdBZGFwdGVyRXhlY3V0YWJsZSB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHJlc3VsdDogSURlYnVnZ2VyQ29udHJpYnV0aW9uID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRkZWJ1Z1R5cGUgPSBkZWJ1Z1R5cGUudG9Mb3dlckNhc2UoKTtcblxuXHRcdC8vIG1lcmdlIGFsbCBjb250cmlidXRpb25zIGludG8gb25lXG5cdFx0Zm9yIChjb25zdCBlZCBvZiBleHRlbnNpb25EZXNjcmlwdGlvbnMpIHtcblx0XHRcdGlmIChlZC5jb250cmlidXRlcykge1xuXHRcdFx0XHRjb25zdCBkZWJ1Z2dlcnMgPSA8SURlYnVnZ2VyQ29udHJpYnV0aW9uW10+ZWQuY29udHJpYnV0ZXNbJ2RlYnVnZ2VycyddO1xuXHRcdFx0XHRpZiAoZGVidWdnZXJzICYmIGRlYnVnZ2Vycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0ZGVidWdnZXJzLmZpbHRlcihkYmcgPT4gdHlwZW9mIGRiZy50eXBlID09PSAnc3RyaW5nJyAmJiBzdHJpbmdzLmVxdWFsc0lnbm9yZUNhc2UoZGJnLnR5cGUsIGRlYnVnVHlwZSkpLmZvckVhY2goZGJnID0+IHtcblx0XHRcdFx0XHRcdC8vIGV4dHJhY3QgcmVsZXZhbnQgYXR0cmlidXRlcyBhbmQgbWFrZSB0aGVtIGFic29sdXRlIHdoZXJlIG5lZWRlZFxuXHRcdFx0XHRcdFx0Y29uc3QgZXh0cmFjdGVkRGJnID0gRXhlY3V0YWJsZURlYnVnQWRhcHRlci5leHRyYWN0KGRiZywgZWQuZXh0ZW5zaW9uTG9jYXRpb24uZnNQYXRoKTtcblxuXHRcdFx0XHRcdFx0Ly8gbWVyZ2Vcblx0XHRcdFx0XHRcdHJlc3VsdCA9IG9iamVjdHMubWl4aW4ocmVzdWx0LCBleHRyYWN0ZWREYmcsIGVkLmlzQnVpbHRpbik7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBzZWxlY3QgdGhlIHJpZ2h0IHBsYXRmb3JtXG5cdFx0bGV0IHBsYXRmb3JtSW5mbzogSVBsYXRmb3JtU3BlY2lmaWNBZGFwdGVyQ29udHJpYnV0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChwbGF0Zm9ybS5pc1dpbmRvd3MgJiYgIXByb2Nlc3MuZW52Lmhhc093blByb3BlcnR5KCdQUk9DRVNTT1JfQVJDSElURVc2NDMyJykpIHtcblx0XHRcdHBsYXRmb3JtSW5mbyA9IHJlc3VsdC53aW54ODYgfHwgcmVzdWx0LndpbiB8fCByZXN1bHQud2luZG93cztcblx0XHR9IGVsc2UgaWYgKHBsYXRmb3JtLmlzV2luZG93cykge1xuXHRcdFx0cGxhdGZvcm1JbmZvID0gcmVzdWx0LndpbiB8fCByZXN1bHQud2luZG93cztcblx0XHR9IGVsc2UgaWYgKHBsYXRmb3JtLmlzTWFjaW50b3NoKSB7XG5cdFx0XHRwbGF0Zm9ybUluZm8gPSByZXN1bHQub3N4O1xuXHRcdH0gZWxzZSBpZiAocGxhdGZvcm0uaXNMaW51eCkge1xuXHRcdFx0cGxhdGZvcm1JbmZvID0gcmVzdWx0LmxpbnV4O1xuXHRcdH1cblx0XHRwbGF0Zm9ybUluZm8gPSBwbGF0Zm9ybUluZm8gfHwgcmVzdWx0O1xuXG5cdFx0Ly8gdGhlc2UgYXJlIHRoZSByZWxldmFudCBhdHRyaWJ1dGVzXG5cdFx0Y29uc3QgcHJvZ3JhbSA9IHBsYXRmb3JtSW5mby5wcm9ncmFtIHx8IHJlc3VsdC5wcm9ncmFtO1xuXHRcdGNvbnN0IGFyZ3MgPSBwbGF0Zm9ybUluZm8uYXJncyB8fCByZXN1bHQuYXJncztcblx0XHRjb25zdCBydW50aW1lID0gcGxhdGZvcm1JbmZvLnJ1bnRpbWUgfHwgcmVzdWx0LnJ1bnRpbWU7XG5cdFx0Y29uc3QgcnVudGltZUFyZ3MgPSBwbGF0Zm9ybUluZm8ucnVudGltZUFyZ3MgfHwgcmVzdWx0LnJ1bnRpbWVBcmdzO1xuXG5cdFx0aWYgKHJ1bnRpbWUpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdleGVjdXRhYmxlJyxcblx0XHRcdFx0Y29tbWFuZDogcnVudGltZSxcblx0XHRcdFx0YXJnczogKHJ1bnRpbWVBcmdzIHx8IFtdKS5jb25jYXQodHlwZW9mIHByb2dyYW0gPT09ICdzdHJpbmcnID8gW3Byb2dyYW1dIDogW10pLmNvbmNhdChhcmdzIHx8IFtdKVxuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKHByb2dyYW0pIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdleGVjdXRhYmxlJyxcblx0XHRcdFx0Y29tbWFuZDogcHJvZ3JhbSxcblx0XHRcdFx0YXJnczogYXJncyB8fCBbXVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBub3RoaW5nIGZvdW5kXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxRQUFRO0FBQ3BCLFlBQVksU0FBUztBQUVyQixZQUFZLGFBQWE7QUFDekIsWUFBWSxVQUFVO0FBQ3RCLFlBQVksY0FBYztBQUMxQixZQUFZLGFBQWE7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsWUFBWSxTQUFTO0FBR3JCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0JBQWdCO0FBS2xCLE1BQWUsc0JBQWYsTUFBZSw0QkFBMkIscUJBQXFCO0FBQUEsRUFVckUsY0FBYztBQUNiLFVBQU07QUFKUCxTQUFRLFVBQVUsT0FBTyxZQUFZLENBQUM7QUFDdEMsU0FBUSxnQkFBZ0I7QUFBQSxFQUl4QjtBQUFBLEVBRVUsUUFBUSxVQUEyQixVQUFpQztBQUU3RSxTQUFLLGVBQWU7QUFDcEIsU0FBSyxVQUFVLE9BQU8sWUFBWSxDQUFDO0FBQ25DLFNBQUssZ0JBQWdCO0FBRXJCLGFBQVMsR0FBRyxRQUFRLENBQUMsU0FBaUIsS0FBSyxXQUFXLElBQUksQ0FBQztBQUFBLEVBQzVEO0FBQUEsRUFFQSxZQUFZLFNBQThDO0FBRXpELFFBQUks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
