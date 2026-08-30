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
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import * as fs from "fs";
import { exec } from "child_process";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Emitter } from "../../../base/common/event.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { MovingAverage } from "../../../base/common/numbers.js";
import { isLinux } from "../../../base/common/platform.js";
import * as resources from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import * as pfs from "../../../base/node/pfs.js";
import { SocketCloseEventType } from "../../../base/parts/ipc/common/ipc.net.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { ManagedSocket, connectManagedSocket } from "../../../platform/remote/common/managedSocket.js";
import { ManagedRemoteConnection } from "../../../platform/remote/common/remoteAuthorityResolver.js";
import { ISignService } from "../../../platform/sign/common/sign.js";
import { isAllInterfaces, isLocalhost } from "../../../platform/tunnel/common/tunnel.js";
import { NodeRemoteTunnel } from "../../../platform/tunnel/node/tunnelService.js";
import { IExtHostInitDataService } from "../common/extHostInitDataService.js";
import { IExtHostRpcService } from "../common/extHostRpcService.js";
import { ExtHostTunnelService } from "../common/extHostTunnelService.js";
import { parseAddress } from "../../services/remote/common/tunnelModel.js";
import { IExtHostConfiguration } from "../common/extHostConfiguration.js";
function getSockets(stdout) {
  const lines = stdout.trim().split("\n");
  const mapped = [];
  lines.forEach((line) => {
    const match = /\/proc\/(\d+)\/fd\/\d+ -> socket:\[(\d+)\]/.exec(line);
    if (match && match.length >= 3) {
      mapped.push({
        pid: parseInt(match[1], 10),
        socket: parseInt(match[2], 10)
      });
    }
  });
  const socketMap = mapped.reduce((m, socket) => {
    m[socket.socket] = socket;
    return m;
  }, {});
  return socketMap;
}
function loadListeningPorts(...stdouts) {
  const table = [].concat(...stdouts.map(loadConnectionTable));
  return [
    ...new Map(
      table.filter((row) => row.st === "0A").map((row) => {
        const address = row.local_address.split(":");
        return {
          socket: parseInt(row.inode, 10),
          ip: parseIpAddress(address[0]),
          port: parseInt(address[1], 16)
        };
      }).map((port) => [port.ip + ":" + port.port, port])
    ).values()
  ];
}
function parseIpAddress(hex) {
  let result = "";
  if (hex.length === 8) {
    for (let i = hex.length - 2; i >= 0; i -= 2) {
      result += parseInt(hex.substr(i, 2), 16);
      if (i !== 0) {
        result += ".";
      }
    }
  } else {
    for (let i = 0; i < hex.length; i += 8) {
      const word = hex.substring(i, i + 8);
      let subWord = "";
      for (let j = 8; j >= 2; j -= 2) {
        subWord += word.substring(j - 2, j);
        if (j === 6 || j === 2) {
          subWord = parseInt(subWord, 16).toString(16);
          result += `${subWord}`;
          subWord = "";
          if (i + j !== hex.length - 6) {
            result += ":";
          }
        }
      }
    }
  }
  return result;
}
function loadConnectionTable(stdout) {
  const lines = stdout.trim().split("\n");
  const names = lines.shift().trim().split(/\s+/).filter((name) => name !== "rx_queue" && name !== "tm->when");
  const table = lines.map((line) => line.trim().split(/\s+/).reduce((obj, value, i) => {
    obj[names[i] || i] = value;
    return obj;
  }, {}));
  return table;
}
function knownExcludeCmdline(command) {
  if (command.length > 500) {
    return false;
  }
  return !!command.match(/.*\.vscode-server-[a-zA-Z]+\/bin.*/) || command.indexOf("out/server-main.js") !== -1 || command.indexOf("_productName=VSCode") !== -1;
}
function getRootProcesses(stdout) {
  const lines = stdout.trim().split("\n");
  const mapped = [];
  lines.forEach((line) => {
    const match = /^\d+\s+\D+\s+root\s+(\d+)\s+(\d+).+\d+\:\d+\:\d+\s+(.+)$/.exec(line);
    if (match && match.length >= 4) {
      mapped.push({
        pid: parseInt(match[1], 10),
        ppid: parseInt(match[2]),
        cmd: match[3]
      });
    }
  });
  return mapped;
}
async function findPorts(connections, socketMap, processes) {
  const processMap = processes.reduce((m, process2) => {
    m[process2.pid] = process2;
    return m;
  }, {});
  const ports = [];
  connections.forEach(({ socket, ip, port }) => {
    const pid = socketMap[socket] ? socketMap[socket].pid : void 0;
    const command = pid ? processMap[pid]?.cmd : void 0;
    if (pid && command && !knownExcludeCmdline(command)) {
      ports.push({ host: ip, port, detail: command, pid });
    }
  });
  return ports;
}
function tryFindRootPorts(connections, rootProcessesStdout, previousPorts) {
  const ports = /* @__PURE__ */ new Map();
  const rootProcesses = getRootProcesses(rootProcessesStdout);
  for (const connection of connections) {
    const previousPort = previousPorts.get(connection.port);
    if (previousPort) {
      ports.set(connection.port, previousPort);
      continue;
    }
    const rootProcessMatch = rootProcesses.find((value) => value.cmd.includes(`${connection.port}`));
    if (rootProcessMatch) {
      let bestMatch = rootProcessMatch;
      let mostChild;
      do {
        mostChild = rootProcesses.find((value) => value.ppid === bestMatch.pid);
        if (mostChild) {
          bestMatch = mostChild;
        }
      } while (mostChild);
      ports.set(connection.port, { host: connection.ip, port: connection.port, pid: bestMatch.pid, detail: bestMatch.cmd, ppid: bestMatch.ppid });
    } else {
      ports.set(connection.port, { host: connection.ip, port: connection.port, ppid: Number.MAX_VALUE });
    }
  }
  return ports;
}
let NodeExtHostTunnelService = class extends ExtHostTunnelService {
  constructor(extHostRpc, initData, logService, signService, configurationService) {
    super(extHostRpc, initData, logService);
    this.initData = initData;
    this.signService = signService;
    this.configurationService = configurationService;
    this._initialCandidates = void 0;
    this._foundRootPorts = /* @__PURE__ */ new Map();
    this._candidateFindingEnabled = false;
    if (isLinux && initData.remote.isRemote && initData.remote.authority) {
      this._proxy.$setRemoteTunnelService(process.pid);
      this.setInitialCandidates();
    }
  }
  async $registerCandidateFinder(enable) {
    if (enable && this._candidateFindingEnabled) {
      return;
    }
    this._candidateFindingEnabled = enable;
    let oldPorts = void 0;
    if (this._initialCandidates) {
      oldPorts = this._initialCandidates;
      await this._proxy.$onFoundNewCandidates(this._initialCandidates);
    }
    const movingAverage = new MovingAverage();
    let scanCount = 0;
    while (this._candidateFindingEnabled) {
      const startTime = (/* @__PURE__ */ new Date()).getTime();
      const newPorts = (await this.findCandidatePorts()).filter((candidate) => isLocalhost(candidate.host) || isAllInterfaces(candidate.host));
      this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) found candidate ports ${newPorts.map((port) => port.port).join(", ")}`);
      const timeTaken = (/* @__PURE__ */ new Date()).getTime() - startTime;
      this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) candidate port scan took ${timeTaken} ms.`);
      if (scanCount++ > 3) {
        movingAverage.update(timeTaken);
      }
      if (!oldPorts || JSON.stringify(oldPorts) !== JSON.stringify(newPorts)) {
        oldPorts = newPorts;
        await this._proxy.$onFoundNewCandidates(oldPorts);
      }
      const delay = this.calculateDelay(movingAverage.value);
      this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) next candidate port scan in ${delay} ms.`);
      await new Promise((resolve) => setTimeout(() => resolve(), delay));
    }
  }
  calculateDelay(movingAverage) {
    return Math.max(movingAverage * 20, 2e3);
  }
  async setInitialCandidates() {
    this._initialCandidates = await this.findCandidatePorts();
    this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) Initial candidates found: ${this._initialCandidates.map((c) => c.port).join(", ")}`);
  }
  async findCandidatePorts() {
    let tcp = "";
    let tcp6 = "";
    try {
      tcp = await fs.promises.readFile("/proc/net/tcp", "utf8");
      tcp6 = await fs.promises.readFile("/proc/net/tcp6", "utf8");
    } catch (e) {
    }
    const connections = loadListeningPorts(tcp, tcp6);
    const procSockets = await new Promise((resolve) => {
      exec("ls -l /proc/[0-9]*/fd/[0-9]* | grep socket:", (error, stdout, stderr) => {
        resolve(stdout);
      });
    });
    const socketMap = getSockets(procSockets);
    const procChildren = await pfs.Promises.readdir("/proc");
    const processes = [];
    for (const childName of procChildren) {
      try {
        const pid = Number(childName);
        const childUri = resources.joinPath(URI.file("/proc"), childName);
        const childStat = await fs.promises.stat(childUri.fsPath);
        if (childStat.isDirectory() && !isNaN(pid)) {
          const cwd = await fs.promises.readlink(resources.joinPath(childUri, "cwd").fsPath);
          const cmd = await fs.promises.readFile(resources.joinPath(childUri, "cmdline").fsPath, "utf8");
          processes.push({ pid, cwd, cmd });
        }
      } catch (e) {
      }
    }
    const unFoundConnections = [];
    const filteredConnections = connections.filter(((connection) => {
      const foundConnection = socketMap[connection.socket];
      if (!foundConnection) {
        unFoundConnections.push(connection);
      }
      return foundConnection;
    }));
    const foundPorts = findPorts(filteredConnections, socketMap, processes);
    let heuristicPorts;
    this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) number of possible root ports ${unFoundConnections.length}`);
    if (unFoundConnections.length > 0) {
      const rootProcesses = await new Promise((resolve) => {
        exec("ps -F -A -l | grep root", (error, stdout, stderr) => {
          resolve(stdout);
        });
      });
      this._foundRootPorts = tryFindRootPorts(unFoundConnections, rootProcesses, this._foundRootPorts);
      heuristicPorts = Array.from(this._foundRootPorts.values());
      this.logService.trace(`ForwardedPorts: (ExtHostTunnelService) heuristic ports ${heuristicPorts.map((heuristicPort) => heuristicPort.port).join(", ")}`);
    }
    return foundPorts.then((foundCandidates) => {
      if (heuristicPorts) {
        return foundCandidates.concat(heuristicPorts);
      } else {
        return foundCandidates;
      }
    });
  }
  async defaultTunnelHost() {
    const settingValue = (await this.configurationService.getConfigProvider()).getConfiguration("remote").get("localPortHost");
    return !settingValue || settingValue === "localhost" ? "127.0.0.1" : "0.0.0.0";
  }
  makeManagedTunnelFactory(authority) {
    return async (tunnelOptions) => {
      const t = new NodeRemoteTunnel(
        {
          commit: this.initData.commit,
          quality: this.initData.quality,
          logService: this.logService,
          ipcLogger: null,
          // services and address providers have stubs since we don't need
          // the connection identification that the renderer process uses
          remoteSocketFactoryService: {
            _serviceBrand: void 0,
            async connect(_connectTo, path, query, debugLabel) {
              const result = await authority.makeConnection();
              return ExtHostManagedSocket.connect(result, path, query, debugLabel);
            },
            register() {
              throw new Error("not implemented");
            }
          },
          addressProvider: {
            getAddress() {
              return Promise.resolve({
                connectTo: new ManagedRemoteConnection(0),
                connectionToken: authority.connectionToken
              });
            }
          },
          signService: this.signService
        },
        await this.defaultTunnelHost(),
        tunnelOptions.remoteAddress.host || "localhost",
        tunnelOptions.remoteAddress.port,
        tunnelOptions.localAddressPort
      );
      await t.waitForReady();
      const disposeEmitter = new Emitter();
      return {
        localAddress: parseAddress(t.localAddress) ?? t.localAddress,
        remoteAddress: { port: t.tunnelRemotePort, host: t.tunnelRemoteHost },
        onDidDispose: disposeEmitter.event,
        dispose: () => {
          t.dispose();
          disposeEmitter.fire();
          disposeEmitter.dispose();
        }
      };
    };
  }
};
NodeExtHostTunnelService = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostInitDataService),
  __decorateParam(2, ILogService),
  __decorateParam(3, ISignService),
  __decorateParam(4, IExtHostConfiguration)
], NodeExtHostTunnelService);
class ExtHostManagedSocket extends ManagedSocket {
  constructor(passing, debugLabel, half) {
    super(debugLabel, half);
    this.passing = passing;
  }
  static connect(passing, path, query, debugLabel) {
    const d = new DisposableStore();
    const half = {
      onClose: d.add(new Emitter()),
      onData: d.add(new Emitter()),
      onEnd: d.add(new Emitter())
    };
    d.add(passing.onDidReceiveMessage((d2) => half.onData.fire(VSBuffer.wrap(d2))));
    d.add(passing.onDidEnd(() => half.onEnd.fire()));
    d.add(passing.onDidClose((error) => half.onClose.fire({
      type: SocketCloseEventType.NodeSocketCloseEvent,
      error,
      hadError: !!error
    })));
    const socket = new ExtHostManagedSocket(passing, debugLabel, half);
    socket._register(d);
    return connectManagedSocket(socket, path, query, debugLabel, half);
  }
  write(buffer) {
    this.passing.send(buffer.buffer);
  }
  closeRemote() {
    this.passing.end();
  }
  async drain() {
    await this.passing.drain?.();
  }
}
export {
  ExtHostManagedSocket,
  NodeExtHostTunnelService,
  findPorts,
  getRootProcesses,
  getSockets,
  loadConnectionTable,
  loadListeningPorts,
  parseIpAddress,
  tryFindRootPorts
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcbm9kZVxcZXh0SG9zdFR1bm5lbFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgeyBleGVjIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1vdmluZ0F2ZXJhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IGlzTGludXggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgKiBhcyByZXNvdXJjZXMgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBwZnMgZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3Bmcy5qcyc7XG5pbXBvcnQgeyBJU29ja2V0LCBTb2NrZXRDbG9zZUV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMubmV0LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTWFuYWdlZFNvY2tldCwgUmVtb3RlU29ja2V0SGFsZiwgY29ubmVjdE1hbmFnZWRTb2NrZXQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL21hbmFnZWRTb2NrZXQuanMnO1xuaW1wb3J0IHsgTWFuYWdlZFJlbW90ZUNvbm5lY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUF1dGhvcml0eVJlc29sdmVyLmpzJztcbmltcG9ydCB7IElTaWduU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3NpZ24vY29tbW9uL3NpZ24uanMnO1xuaW1wb3J0IHsgaXNBbGxJbnRlcmZhY2VzLCBpc0xvY2FsaG9zdCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3R1bm5lbC9jb21tb24vdHVubmVsLmpzJztcbmltcG9ydCB7IE5vZGVSZW1vdGVUdW5uZWwgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90dW5uZWwvbm9kZS90dW5uZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3RJbml0RGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RScGNTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3RScGNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RUdW5uZWxTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3RUdW5uZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENhbmRpZGF0ZVBvcnQsIHBhcnNlQWRkcmVzcyB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vdHVubmVsTW9kZWwuanMnO1xuaW1wb3J0ICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBJRXh0SG9zdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdENvbmZpZ3VyYXRpb24uanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U29ja2V0cyhzdGRvdXQ6IHN0cmluZyk6IFJlY29yZDxzdHJpbmcsIHsgcGlkOiBudW1iZXI7IHNvY2tldDogbnVtYmVyIH0+IHtcblx0Y29uc3QgbGluZXMgPSBzdGRvdXQudHJpbSgpLnNwbGl0KCdcXG4nKTtcblx0Y29uc3QgbWFwcGVkOiB7IHBpZDogbnVtYmVyOyBzb2NrZXQ6IG51bWJlciB9W10gPSBbXTtcblx0bGluZXMuZm9yRWFjaChsaW5lID0+IHtcblx0XHRjb25zdCBtYXRjaCA9IC9cXC9wcm9jXFwvKFxcZCspXFwvZmRcXC9cXGQrIC0+IHNvY2tldDpcXFsoXFxkKylcXF0vLmV4ZWMobGluZSkhO1xuXHRcdGlmIChtYXRjaCAmJiBtYXRjaC5sZW5ndGggPj0gMykge1xuXHRcdFx0bWFwcGVkLnB1c2goe1xuXHRcdFx0XHRwaWQ6IHBhcnNlSW50KG1hdGNoWzFdLCAxMCksXG5cdFx0XHRcdHNvY2tldDogcGFyc2VJbnQobWF0Y2hbMl0sIDEwKVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblx0Y29uc3Qgc29ja2V0TWFwID0gbWFwcGVkLnJlZHVjZSgobTogUmVjb3JkPHN0cmluZywgdHlwZW9mIG1hcHBlZFswXT4sIHNvY2tldCkgPT4ge1xuXHRcdG1bc29ja2V0LnNvY2tldF0gPSBzb2NrZXQ7XG5cdFx0cmV0dXJuIG07XG5cdH0sIHt9KTtcblx0cmV0dXJuIHNvY2tldE1hcDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvYWRMaXN0ZW5pbmdQb3J0cyguLi5zdGRvdXRzOiBzdHJpbmdbXSk6IHsgc29ja2V0OiBudW1iZXI7IGlwOiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9W10ge1xuXHRjb25zdCB0YWJsZSA9IChbXSBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+W10pLmNvbmNhdCguLi5zdGRvdXRzLm1hcChsb2FkQ29ubmVjdGlvblRhYmxlKSk7XG5cdHJldHVybiBbXG5cdFx0Li4ubmV3IE1hcChcblx0XHRcdHRhYmxlLmZpbHRlcihyb3cgPT4gcm93LnN0ID09PSAnMEEnKVxuXHRcdFx0XHQubWFwKHJvdyA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgYWRkcmVzcyA9IHJvdy5sb2NhbF9hZGRyZXNzLnNwbGl0KCc6Jyk7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHNvY2tldDogcGFyc2VJbnQocm93Lmlub2RlLCAxMCksXG5cdFx0XHRcdFx0XHRpcDogcGFyc2VJcEFkZHJlc3MoYWRkcmVzc1swXSksXG5cdFx0XHRcdFx0XHRwb3J0OiBwYXJzZUludChhZGRyZXNzWzFdLCAxNilcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9KS5tYXAocG9ydCA9PiBbcG9ydC5pcCArICc6JyArIHBvcnQucG9ydCwgcG9ydF0pXG5cdFx0KS52YWx1ZXMoKVxuXHRdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VJcEFkZHJlc3MoaGV4OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgcmVzdWx0ID0gJyc7XG5cdGlmIChoZXgubGVuZ3RoID09PSA4KSB7XG5cdFx0Zm9yIChsZXQgaSA9IGhleC5sZW5ndGggLSAyOyBpID49IDA7IGkgLT0gMikge1xuXHRcdFx0cmVzdWx0ICs9IHBhcnNlSW50KGhleC5zdWJzdHIoaSwgMiksIDE2KTtcblx0XHRcdGlmIChpICE9PSAwKSB7XG5cdFx0XHRcdHJlc3VsdCArPSAnLic7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdC8vIE5pY2UgZXhwbGFuYXRpb24gb2YgaG9zdCBmb3JtYXQgaW4gdGNwNiBmaWxlOiBodHRwczovL3NlcnZlcmZhdWx0LmNvbS9xdWVzdGlvbnMvNTkyNTc0L3doeS1kb2VzLXByb2MtbmV0LXRjcDYtcmVwcmVzZW50cy0xLWFzLTEwMDBcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGhleC5sZW5ndGg7IGkgKz0gOCkge1xuXHRcdFx0Y29uc3Qgd29yZCA9IGhleC5zdWJzdHJpbmcoaSwgaSArIDgpO1xuXHRcdFx0bGV0IHN1YldvcmQgPSAnJztcblx0XHRcdGZvciAobGV0IGogPSA4OyBqID49IDI7IGogLT0gMikge1xuXHRcdFx0XHRzdWJXb3JkICs9IHdvcmQuc3Vic3RyaW5nKGogLSAyLCBqKTtcblx0XHRcdFx0aWYgKChqID09PSA2KSB8fCAoaiA9PT0gMikpIHtcblx0XHRcdFx0XHQvLyBUcmltIGxlYWRpbmcgemVyb3Ncblx0XHRcdFx0XHRzdWJXb3JkID0gcGFyc2VJbnQoc3ViV29yZCwgMTYpLnRvU3RyaW5nKDE2KTtcblx0XHRcdFx0XHRyZXN1bHQgKz0gYCR7c3ViV29yZH1gO1xuXHRcdFx0XHRcdHN1YldvcmQgPSAnJztcblx0XHRcdFx0XHRpZiAoaSArIGogIT09IGhleC5sZW5ndGggLSA2KSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQgKz0gJzonO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9hZENvbm5lY3Rpb25UYWJsZShzdGRvdXQ6IHN0cmluZyk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz5bXSB7XG5cdGNvbnN0IGxpbmVzID0gc3Rkb3V0LnRyaW0oKS5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IG5hbWVzID0gbGluZXMuc2hpZnQoKSEudHJpbSgpLnNwbGl0KC9cXHMrLylcblx0XHQuZmlsdGVyKG5hbWUgPT4gbmFtZSAhPT0gJ3J4X3F1ZXVlJyAmJiBuYW1lICE9PSAndG0tPndoZW4nKTtcblx0Y29uc3QgdGFibGUgPSBsaW5lcy5tYXAobGluZSA9PiBsaW5lLnRyaW0oKS5zcGxpdCgvXFxzKy8pLnJlZHVjZSgob2JqOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCB2YWx1ZSwgaSkgPT4ge1xuXHRcdG9ialtuYW1lc1tpXSB8fCBpXSA9IHZhbHVlO1xuXHRcdHJldHVybiBvYmo7XG5cdH0sIHt9KSk7XG5cdHJldHVybiB0YWJsZTtcbn1cblxuZnVuY3Rpb24ga25vd25FeGNsdWRlQ21kbGluZShjb21tYW5kOiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKGNvbW1hbmQubGVuZ3RoID4gNTAwKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiAhIWNvbW1hbmQubWF0Y2goLy4qXFwudnNjb2RlLXNlcnZlci1bYS16QS1aXStcXC9iaW4uKi8pXG5cdFx0fHwgKGNvbW1hbmQuaW5kZXhPZignb3V0L3NlcnZlci1tYWluLmpzJykgIT09IC0xKVxuXHRcdHx8IChjb21tYW5kLmluZGV4T2YoJ19wcm9kdWN0TmFtZT1WU0NvZGUnKSAhPT0gLTEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Um9vdFByb2Nlc3NlcyhzdGRvdXQ6IHN0cmluZykge1xuXHRjb25zdCBsaW5lcyA9IHN0ZG91dC50cmltKCkuc3BsaXQoJ1xcbicpO1xuXHRjb25zdCBtYXBwZWQ6IHsgcGlkOiBudW1iZXI7IGNtZDogc3RyaW5nOyBwcGlkOiBudW1iZXIgfVtdID0gW107XG5cdGxpbmVzLmZvckVhY2gobGluZSA9PiB7XG5cdFx0Y29uc3QgbWF0Y2ggPSAvXlxcZCtcXHMrXFxEK1xccytyb290XFxzKyhcXGQrKVxccysoXFxkKykuK1xcZCtcXDpcXGQrXFw6XFxkK1xccysoLispJC8uZXhlYyhsaW5lKSE7XG5cdFx0aWYgKG1hdGNoICYmIG1hdGNoLmxlbmd0aCA+PSA0KSB7XG5cdFx0XHRtYXBwZWQucHVzaCh7XG5cdFx0XHRcdHBpZDogcGFyc2VJbnQobWF0Y2hbMV0sIDEwKSxcblx0XHRcdFx0cHBpZDogcGFyc2VJbnQobWF0Y2hbMl0pLFxuXHRcdFx0XHRjbWQ6IG1hdGNoWzNdXG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xuXHRyZXR1cm4gbWFwcGVkO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmluZFBvcnRzKGNvbm5lY3Rpb25zOiB7IHNvY2tldDogbnVtYmVyOyBpcDogc3RyaW5nOyBwb3J0OiBudW1iZXIgfVtdLCBzb2NrZXRNYXA6IFJlY29yZDxzdHJpbmcsIHsgcGlkOiBudW1iZXI7IHNvY2tldDogbnVtYmVyIH0+LCBwcm9jZXNzZXM6IHsgcGlkOiBudW1iZXI7IGN3ZDogc3RyaW5nOyBjbWQ6IHN0cmluZyB9W10pOiBQcm9taXNlPENhbmRpZGF0ZVBvcnRbXT4ge1xuXHRjb25zdCBwcm9jZXNzTWFwID0gcHJvY2Vzc2VzLnJlZHVjZSgobTogUmVjb3JkPHN0cmluZywgdHlwZW9mIHByb2Nlc3Nlc1swXT4sIHByb2Nlc3MpID0+IHtcblx0XHRtW3Byb2Nlc3MucGlkXSA9IHByb2Nlc3M7XG5cdFx0cmV0dXJuIG07XG5cdH0sIHt9KTtcblxuXHRjb25zdCBwb3J0czogQ2FuZGlkYXRlUG9ydFtdID0gW107XG5cdGNvbm5lY3Rpb25zLmZvckVhY2goKHsgc29ja2V0LCBpcCwgcG9ydCB9KSA9PiB7XG5cdFx0Y29uc3QgcGlkID0gc29ja2V0TWFwW3NvY2tldF0gPyBzb2NrZXRNYXBbc29ja2V0XS5waWQgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY29tbWFuZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gcGlkID8gcHJvY2Vzc01hcFtwaWRdPy5jbWQgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHBpZCAmJiBjb21tYW5kICYmICFrbm93bkV4Y2x1ZGVDbWRsaW5lKGNvbW1hbmQpKSB7XG5cdFx0XHRwb3J0cy5wdXNoKHsgaG9zdDogaXAsIHBvcnQsIGRldGFpbDogY29tbWFuZCwgcGlkIH0pO1xuXHRcdH1cblx0fSk7XG5cdHJldHVybiBwb3J0cztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRyeUZpbmRSb290UG9ydHMoY29ubmVjdGlvbnM6IHsgc29ja2V0OiBudW1iZXI7IGlwOiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9W10sIHJvb3RQcm9jZXNzZXNTdGRvdXQ6IHN0cmluZywgcHJldmlvdXNQb3J0czogTWFwPG51bWJlciwgQ2FuZGlkYXRlUG9ydCAmIHsgcHBpZDogbnVtYmVyIH0+KTogTWFwPG51bWJlciwgQ2FuZGlkYXRlUG9ydCAmIHsgcHBpZDogbnVtYmVyIH0+IHtcblx0Y29uc3QgcG9ydHM6IE1hcDxudW1iZXIsIENhbmRpZGF0ZVBvcnQgJiB7IHBwaWQ6IG51bWJlciB9PiA9IG5ldyBNYXAoKTtcblx0Y29uc3Qgcm9vdFByb2Nlc3NlcyA9IGdldFJvb3RQcm9jZXNzZXMocm9vdFByb2Nlc3Nlc1N0ZG91dCk7XG5cblx0Zm9yIChjb25zdCBjb25uZWN0aW9uIG9mIGNvbm5lY3Rpb25zKSB7XG5cdFx0Y29uc3QgcHJldmlvdXNQb3J0ID0gcHJldmlvdXNQb3J0cy5nZXQoY29ubmVjdGlvbi5wb3J0KTtcblx0XHRpZiAocHJldmlvdXNQb3J0KSB7XG5cdFx0XHRwb3J0cy5zZXQoY29ubmVjdGlvbi5wb3J0LCBwcmV2aW91c1BvcnQpO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IHJvb3RQcm9jZXNzTWF0Y2ggPSByb290UHJvY2Vzc2VzLmZpbmQoKHZhbHVlKSA9PiB2YWx1ZS5jbWQuaW5jbHVkZXMoYCR7Y29ubmVjdGlvbi5wb3J0fWApKTtcblx0XHRpZiAocm9vdFByb2Nlc3NNYXRjaCkge1xuXHRcdFx0bGV0IGJlc3RNYXRjaCA9IHJvb3RQcm9jZXNzTWF0Y2g7XG5cdFx0XHQvLyBUaGVyZSBhcmUgb2Z0ZW4gc2V2ZXJhbCBwcm9jZXNzZXMgdGhhdCBcImxvb2tcIiBsaWtlIHRoZXkgY291bGQgbWF0Y2ggdGhlIHBvcnQuXG5cdFx0XHQvLyBUaGUgb25lIHdlIHdhbnQgaXMgdXN1YWxseSB0aGUgY2hpbGQgb2YgdGhlIG90aGVyLiBGaW5kIHRoZSBtb3N0IGNoaWxkIHByb2Nlc3MuXG5cdFx0XHRsZXQgbW9zdENoaWxkOiB7IHBpZDogbnVtYmVyOyBjbWQ6IHN0cmluZzsgcHBpZDogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRkbyB7XG5cdFx0XHRcdG1vc3RDaGlsZCA9IHJvb3RQcm9jZXNzZXMuZmluZCh2YWx1ZSA9PiB2YWx1ZS5wcGlkID09PSBiZXN0TWF0Y2gucGlkKTtcblx0XHRcdFx0aWYgKG1vc3RDaGlsZCkge1xuXHRcdFx0XHRcdGJlc3RNYXRjaCA9IG1vc3RDaGlsZDtcblx0XHRcdFx0fVxuXHRcdFx0fSB3aGlsZSAobW9zdENoaWxkKTtcblx0XHRcdHBvcnRzLnNldChjb25uZWN0aW9uLnBvcnQsIHsgaG9zdDogY29ubmVjdGlvbi5pcCwgcG9ydDogY29ubmVjdGlvbi5wb3J0LCBwaWQ6IGJlc3RNYXRjaC5waWQsIGRldGFpbDogYmVzdE1hdGNoLmNtZCwgcHBpZDogYmVzdE1hdGNoLnBwaWQgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHBvcnRzLnNldChjb25uZWN0aW9uLnBvcnQsIHsgaG9zdDogY29ubmVjdGlvbi5pcCwgcG9ydDogY29ubmVjdGlvbi5wb3J0LCBwcGlkOiBOdW1iZXIuTUFYX1ZBTFVFIH0pO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBwb3J0cztcbn1cblxuZXhwb3J0IGNsYXNzIE5vZGVFeHRIb3N0VHVubmVsU2VydmljZSBleHRlbmRzIEV4dEhvc3RUdW5uZWxTZXJ2aWNlIHtcblx0cHJpdmF0ZSBfaW5pdGlhbENhbmRpZGF0ZXM6IENhbmRpZGF0ZVBvcnRbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZm91bmRSb290UG9ydHM6IE1hcDxudW1iZXIsIENhbmRpZGF0ZVBvcnQgJiB7IHBwaWQ6IG51bWJlciB9PiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSBfY2FuZGlkYXRlRmluZGluZ0VuYWJsZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dEhvc3RScGNTZXJ2aWNlIGV4dEhvc3RScGM6IElFeHRIb3N0UnBjU2VydmljZSxcblx0XHRASUV4dEhvc3RJbml0RGF0YVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbml0RGF0YTogSUV4dEhvc3RJbml0RGF0YVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJU2lnblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzaWduU2VydmljZTogSVNpZ25TZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdENvbmZpZ3VyYXRpb24gcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUV4dEhvc3RDb25maWd1cmF0aW9uLFxuXHQpIHtcblx0XHRzdXBlcihleHRIb3N0UnBjLCBpbml0RGF0YSwgbG9nU2VydmljZSk7XG5cdFx0aWYgKGlzTGludXggJiYgaW5pdERhdGEucmVtb3RlLmlzUmVtb3RlICYmIGluaXREYXRhLnJlbW90ZS5hdXRob3JpdHkpIHtcblx0XHRcdHRoaXMuX3Byb3h5LiRzZXRSZW1vdGVUdW5uZWxTZXJ2aWNlKHByb2Nlc3MucGlkKTtcblx0XHRcdHRoaXMuc2V0SW5pdGlhbENhbmRpZGF0ZXMoKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyAkcmVnaXN0ZXJDYW5kaWRhdGVGaW5kZXIoZW5hYmxlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGVuYWJsZSAmJiB0aGlzLl9jYW5kaWRhdGVGaW5kaW5nRW5hYmxlZCkge1xuXHRcdFx0Ly8gYWxyZWFkeSBlbmFibGVkXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fY2FuZGlkYXRlRmluZGluZ0VuYWJsZWQgPSBlbmFibGU7XG5cdFx0bGV0IG9sZFBvcnRzOiB7IGhvc3Q6IHN0cmluZzsgcG9ydDogbnVtYmVyOyBkZXRhaWw/OiBzdHJpbmcgfVtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gSWYgd2UgYWxyZWFkeSBoYXZlIGZvdW5kIGluaXRpYWwgY2FuZGlkYXRlcyBzZW5kIHRob3NlIGltbWVkaWF0ZWx5LlxuXHRcdGlmICh0aGlzLl9pbml0aWFsQ2FuZGlkYXRlcykge1xuXHRcdFx0b2xkUG9ydHMgPSB0aGlzLl9pbml0aWFsQ2FuZGlkYXRlcztcblx0XHRcdGF3YWl0IHRoaXMuX3Byb3h5LiRvbkZvdW5kTmV3Q2FuZGlkYXRlcyh0aGlzLl9pbml0aWFsQ2FuZGlkYXRlcyk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVndWxhcmx5IHNjYW4gdG8gc2VlIGlmIHRoZSBjYW5kaWRhdGUgcG9ydHMgaGF2ZSBjaGFuZ2VkLlxuXHRcdGNvbnN0IG1vdmluZ0F2ZXJhZ2UgPSBuZXcgTW92aW5nQXZlcmFnZSgpO1xuXHRcdGxldCBzY2FuQ291bnQgPSAwO1xuXHRcdHdoaWxlICh0aGlzLl9jYW5kaWRhdGVGaW5kaW5nRW5hYmxlZCkge1xuXHRcdFx0Y29uc3Qgc3RhcnRUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cdFx0XHRjb25zdCBuZXdQb3J0cyA9IChhd2FpdCB0aGlzLmZpbmRDYW5kaWRhdGVQb3J0cygpKS5maWx0ZXIoY2FuZGlkYXRlID0+IChpc0xvY2FsaG9zdChjYW5kaWRhdGUuaG9zdCkgfHwgaXNBbGxJbnRlcmZhY2VzKGNhbmRpZGF0ZS5ob3N0KSkpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKEV4dEhvc3RUdW5uZWxTZXJ2aWNlKSBmb3VuZCBjYW5kaWRhdGUgcG9ydHMgJHtuZXdQb3J0cy5tYXAocG9ydCA9PiBwb3J0LnBvcnQpLmpvaW4oJywgJyl9YCk7XG5cdFx0XHRjb25zdCB0aW1lVGFrZW4gPSBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIHN0YXJ0VGltZTtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRm9yd2FyZGVkUG9ydHM6IChFeHRIb3N0VHVubmVsU2VydmljZSkgY2FuZGlkYXRlIHBvcnQgc2NhbiB0b29rICR7dGltZVRha2VufSBtcy5gKTtcblx0XHRcdC8vIERvIG5vdCBjb3VudCB0aGUgZmlyc3QgZmV3IHNjYW5zIHRvd2FyZHMgdGhlIG1vdmluZyBhdmVyYWdlIGFzIHRoZXkgYXJlIGxpa2VseSB0byBiZSBzbG93ZXIuXG5cdFx0XHRpZiAoc2NhbkNvdW50KysgPiAzKSB7XG5cdFx0XHRcdG1vdmluZ0F2ZXJhZ2UudXBkYXRlKHRpbWVUYWtlbik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW9sZFBvcnRzIHx8IChKU09OLnN0cmluZ2lmeShvbGRQb3J0cykgIT09IEpTT04uc3RyaW5naWZ5KG5ld1BvcnRzKSkpIHtcblx0XHRcdFx0b2xkUG9ydHMgPSBuZXdQb3J0cztcblx0XHRcdFx0YXdhaXQgdGhpcy5fcHJveHkuJG9uRm91bmROZXdDYW5kaWRhdGVzKG9sZFBvcnRzKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRlbGF5ID0gdGhpcy5jYWxjdWxhdGVEZWxheShtb3ZpbmdBdmVyYWdlLnZhbHVlKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRm9yd2FyZGVkUG9ydHM6IChFeHRIb3N0VHVubmVsU2VydmljZSkgbmV4dCBjYW5kaWRhdGUgcG9ydCBzY2FuIGluICR7ZGVsYXl9IG1zLmApO1xuXHRcdFx0YXdhaXQgKG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gc2V0VGltZW91dCgoKSA9PiByZXNvbHZlKCksIGRlbGF5KSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2FsY3VsYXRlRGVsYXkobW92aW5nQXZlcmFnZTogbnVtYmVyKSB7XG5cdFx0Ly8gU29tZSBsb2NhbCB0ZXN0aW5nIGluZGljYXRlZCB0aGF0IHRoZSBtb3ZpbmcgYXZlcmFnZSBtaWdodCBiZSBiZXR3ZWVuIDUwLTEwMCBtcy5cblx0XHRyZXR1cm4gTWF0aC5tYXgobW92aW5nQXZlcmFnZSAqIDIwLCAyMDAwKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2V0SW5pdGlhbENhbmRpZGF0ZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5faW5pdGlhbENhbmRpZGF0ZXMgPSBhd2FpdCB0aGlzLmZpbmRDYW5kaWRhdGVQb3J0cygpO1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRm9yd2FyZGVkUG9ydHM6IChFeHRIb3N0VHVubmVsU2VydmljZSkgSW5pdGlhbCBjYW5kaWRhdGVzIGZvdW5kOiAke3RoaXMuX2luaXRpYWxDYW5kaWRhdGVzLm1hcChjID0+IGMucG9ydCkuam9pbignLCAnKX1gKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZmluZENhbmRpZGF0ZVBvcnRzKCk6IFByb21pc2U8Q2FuZGlkYXRlUG9ydFtdPiB7XG5cdFx0bGV0IHRjcDogc3RyaW5nID0gJyc7XG5cdFx0bGV0IHRjcDY6IHN0cmluZyA9ICcnO1xuXHRcdHRyeSB7XG5cdFx0XHR0Y3AgPSBhd2FpdCBmcy5wcm9taXNlcy5yZWFkRmlsZSgnL3Byb2MvbmV0L3RjcCcsICd1dGY4Jyk7XG5cdFx0XHR0Y3A2ID0gYXdhaXQgZnMucHJvbWlzZXMucmVhZEZpbGUoJy9wcm9jL25ldC90Y3A2JywgJ3V0ZjgnKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBGaWxlIHJlYWRpbmcgZXJyb3IuIE5vIGFkZGl0aW9uYWwgaGFuZGxpbmcgbmVlZGVkLlxuXHRcdH1cblx0XHRjb25zdCBjb25uZWN0aW9uczogeyBzb2NrZXQ6IG51bWJlcjsgaXA6IHN0cmluZzsgcG9ydDogbnVtYmVyIH1bXSA9IGxvYWRMaXN0ZW5pbmdQb3J0cyh0Y3AsIHRjcDYpO1xuXG5cdFx0Y29uc3QgcHJvY1NvY2tldHM6IHN0cmluZyA9IGF3YWl0IChuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcblx0XHRcdGV4ZWMoJ2xzIC1sIC9wcm9jL1swLTldKi9mZC9bMC05XSogfCBncmVwIHNvY2tldDonLCAoZXJyb3IsIHN0ZG91dCwgc3RkZXJyKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUoc3Rkb3V0KTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0XHRjb25zdCBzb2NrZXRNYXAgPSBnZXRTb2NrZXRzKHByb2NTb2NrZXRzKTtcblxuXHRcdGNvbnN0IHByb2NDaGlsZHJlbiA9IGF3YWl0IHBmcy5Qcm9taXNlcy5yZWFkZGlyKCcvcHJvYycpO1xuXHRcdGNvbnN0IHByb2Nlc3Nlczoge1xuXHRcdFx0cGlkOiBudW1iZXI7IGN3ZDogc3RyaW5nOyBjbWQ6IHN0cmluZztcblx0XHR9W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNoaWxkTmFtZSBvZiBwcm9jQ2hpbGRyZW4pIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBpZDogbnVtYmVyID0gTnVtYmVyKGNoaWxkTmFtZSk7XG5cdFx0XHRcdGNvbnN0IGNoaWxkVXJpID0gcmVzb3VyY2VzLmpvaW5QYXRoKFVSSS5maWxlKCcvcHJvYycpLCBjaGlsZE5hbWUpO1xuXHRcdFx0XHRjb25zdCBjaGlsZFN0YXQgPSBhd2FpdCBmcy5wcm9taXNlcy5zdGF0KGNoaWxkVXJpLmZzUGF0aCk7XG5cdFx0XHRcdGlmIChjaGlsZFN0YXQuaXNEaXJlY3RvcnkoKSAmJiAhaXNOYU4ocGlkKSkge1xuXHRcdFx0XHRcdGNvbnN0IGN3ZCA9IGF3YWl0IGZzLnByb21pc2VzLnJlYWRsaW5rKHJlc291cmNlcy5qb2luUGF0aChjaGlsZFVyaSwgJ2N3ZCcpLmZzUGF0aCk7XG5cdFx0XHRcdFx0Y29uc3QgY21kID0gYXdhaXQgZnMucHJvbWlzZXMucmVhZEZpbGUocmVzb3VyY2VzLmpvaW5QYXRoKGNoaWxkVXJpLCAnY21kbGluZScpLmZzUGF0aCwgJ3V0ZjgnKTtcblx0XHRcdFx0XHRwcm9jZXNzZXMucHVzaCh7IHBpZCwgY3dkLCBjbWQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Ly9cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB1bkZvdW5kQ29ubmVjdGlvbnM6IHsgc29ja2V0OiBudW1iZXI7IGlwOiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9W10gPSBbXTtcblx0XHRjb25zdCBmaWx0ZXJlZENvbm5lY3Rpb25zID0gY29ubmVjdGlvbnMuZmlsdGVyKChjb25uZWN0aW9uID0+IHtcblx0XHRcdGNvbnN0IGZvdW5kQ29ubmVjdGlvbiA9IHNvY2tldE1hcFtjb25uZWN0aW9uLnNvY2tldF07XG5cdFx0XHRpZiAoIWZvdW5kQ29ubmVjdGlvbikge1xuXHRcdFx0XHR1bkZvdW5kQ29ubmVjdGlvbnMucHVzaChjb25uZWN0aW9uKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmb3VuZENvbm5lY3Rpb247XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZm91bmRQb3J0cyA9IGZpbmRQb3J0cyhmaWx0ZXJlZENvbm5lY3Rpb25zLCBzb2NrZXRNYXAsIHByb2Nlc3Nlcyk7XG5cdFx0bGV0IGhldXJpc3RpY1BvcnRzOiBDYW5kaWRhdGVQb3J0W10gfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKEV4dEhvc3RUdW5uZWxTZXJ2aWNlKSBudW1iZXIgb2YgcG9zc2libGUgcm9vdCBwb3J0cyAke3VuRm91bmRDb25uZWN0aW9ucy5sZW5ndGh9YCk7XG5cdFx0aWYgKHVuRm91bmRDb25uZWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCByb290UHJvY2Vzc2VzOiBzdHJpbmcgPSBhd2FpdCAobmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdGV4ZWMoJ3BzIC1GIC1BIC1sIHwgZ3JlcCByb290JywgKGVycm9yLCBzdGRvdXQsIHN0ZGVycikgPT4ge1xuXHRcdFx0XHRcdHJlc29sdmUoc3Rkb3V0KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9mb3VuZFJvb3RQb3J0cyA9IHRyeUZpbmRSb290UG9ydHModW5Gb3VuZENvbm5lY3Rpb25zLCByb290UHJvY2Vzc2VzLCB0aGlzLl9mb3VuZFJvb3RQb3J0cyk7XG5cdFx0XHRoZXVyaXN0aWNQb3J0cyA9IEFycmF5LmZyb20odGhpcy5fZm91bmRSb290UG9ydHMudmFsdWVzKCkpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKEV4dEhvc3RUdW5uZWxTZXJ2aWNlKSBoZXVyaXN0aWMgcG9ydHMgJHtoZXVyaXN0aWNQb3J0cy5tYXAoaGV1cmlzdGljUG9ydCA9PiBoZXVyaXN0aWNQb3J0LnBvcnQpLmpvaW4oJywgJyl9YCk7XG5cblx0XHR9XG5cdFx0cmV0dXJuIGZvdW5kUG9ydHMudGhlbihmb3VuZENhbmRpZGF0ZXMgPT4ge1xuXHRcdFx0aWYgKGhldXJpc3RpY1BvcnRzKSB7XG5cdFx0XHRcdHJldHVybiBmb3VuZENhbmRpZGF0ZXMuY29uY2F0KGhldXJpc3RpY1BvcnRzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBmb3VuZENhbmRpZGF0ZXM7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRlZmF1bHRUdW5uZWxIb3N0KCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3Qgc2V0dGluZ1ZhbHVlID0gKGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Q29uZmlnUHJvdmlkZXIoKSkuZ2V0Q29uZmlndXJhdGlvbigncmVtb3RlJykuZ2V0KCdsb2NhbFBvcnRIb3N0Jyk7XG5cdFx0cmV0dXJuICghc2V0dGluZ1ZhbHVlIHx8IHNldHRpbmdWYWx1ZSA9PT0gJ2xvY2FsaG9zdCcpID8gJzEyNy4wLjAuMScgOiAnMC4wLjAuMCc7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbWFrZU1hbmFnZWRUdW5uZWxGYWN0b3J5KGF1dGhvcml0eTogdnNjb2RlLk1hbmFnZWRSZXNvbHZlZEF1dGhvcml0eSk6IHZzY29kZS5SZW1vdGVBdXRob3JpdHlSZXNvbHZlclsndHVubmVsRmFjdG9yeSddIHtcblx0XHRyZXR1cm4gYXN5bmMgKHR1bm5lbE9wdGlvbnMpID0+IHtcblx0XHRcdGNvbnN0IHQgPSBuZXcgTm9kZVJlbW90ZVR1bm5lbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbW1pdDogdGhpcy5pbml0RGF0YS5jb21taXQsXG5cdFx0XHRcdFx0cXVhbGl0eTogdGhpcy5pbml0RGF0YS5xdWFsaXR5LFxuXHRcdFx0XHRcdGxvZ1NlcnZpY2U6IHRoaXMubG9nU2VydmljZSxcblx0XHRcdFx0XHRpcGNMb2dnZXI6IG51bGwsXG5cdFx0XHRcdFx0Ly8gc2VydmljZXMgYW5kIGFkZHJlc3MgcHJvdmlkZXJzIGhhdmUgc3R1YnMgc2luY2Ugd2UgZG9uJ3QgbmVlZFxuXHRcdFx0XHRcdC8vIHRoZSBjb25uZWN0aW9uIGlkZW50aWZpY2F0aW9uIHRoYXQgdGhlIHJlbmRlcmVyIHByb2Nlc3MgdXNlc1xuXHRcdFx0XHRcdHJlbW90ZVNvY2tldEZhY3RvcnlTZXJ2aWNlOiB7XG5cdFx0XHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRhc3luYyBjb25uZWN0KF9jb25uZWN0VG86IE1hbmFnZWRSZW1vdGVDb25uZWN0aW9uLCBwYXRoOiBzdHJpbmcsIHF1ZXJ5OiBzdHJpbmcsIGRlYnVnTGFiZWw6IHN0cmluZyk6IFByb21pc2U8SVNvY2tldD4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhdXRob3JpdHkubWFrZUNvbm5lY3Rpb24oKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIEV4dEhvc3RNYW5hZ2VkU29ja2V0LmNvbm5lY3QocmVzdWx0LCBwYXRoLCBxdWVyeSwgZGVidWdMYWJlbCk7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0cmVnaXN0ZXIoKSB7XG5cdFx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YWRkcmVzc1Byb3ZpZGVyOiB7XG5cdFx0XHRcdFx0XHRnZXRBZGRyZXNzKCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcblx0XHRcdFx0XHRcdFx0XHRjb25uZWN0VG86IG5ldyBNYW5hZ2VkUmVtb3RlQ29ubmVjdGlvbigwKSxcblx0XHRcdFx0XHRcdFx0XHRjb25uZWN0aW9uVG9rZW46IGF1dGhvcml0eS5jb25uZWN0aW9uVG9rZW4sXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHNpZ25TZXJ2aWNlOiB0aGlzLnNpZ25TZXJ2aWNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhd2FpdCB0aGlzLmRlZmF1bHRUdW5uZWxIb3N0KCksXG5cdFx0XHRcdHR1bm5lbE9wdGlvbnMucmVtb3RlQWRkcmVzcy5ob3N0IHx8ICdsb2NhbGhvc3QnLFxuXHRcdFx0XHR0dW5uZWxPcHRpb25zLnJlbW90ZUFkZHJlc3MucG9ydCxcblx0XHRcdFx0dHVubmVsT3B0aW9ucy5sb2NhbEFkZHJlc3NQb3J0LFxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgdC53YWl0Rm9yUmVhZHkoKTtcblxuXHRcdFx0Y29uc3QgZGlzcG9zZUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsb2NhbEFkZHJlc3M6IHBhcnNlQWRkcmVzcyh0LmxvY2FsQWRkcmVzcykgPz8gdC5sb2NhbEFkZHJlc3MsXG5cdFx0XHRcdHJlbW90ZUFkZHJlc3M6IHsgcG9ydDogdC50dW5uZWxSZW1vdGVQb3J0LCBob3N0OiB0LnR1bm5lbFJlbW90ZUhvc3QgfSxcblx0XHRcdFx0b25EaWREaXNwb3NlOiBkaXNwb3NlRW1pdHRlci5ldmVudCxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdHQuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGRpc3Bvc2VFbWl0dGVyLmZpcmUoKTtcblx0XHRcdFx0XHRkaXNwb3NlRW1pdHRlci5kaXNwb3NlKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RNYW5hZ2VkU29ja2V0IGV4dGVuZHMgTWFuYWdlZFNvY2tldCB7XG5cdHB1YmxpYyBzdGF0aWMgY29ubmVjdChcblx0XHRwYXNzaW5nOiB2c2NvZGUuTWFuYWdlZE1lc3NhZ2VQYXNzaW5nLFxuXHRcdHBhdGg6IHN0cmluZywgcXVlcnk6IHN0cmluZywgZGVidWdMYWJlbDogc3RyaW5nLFxuXHQpOiBQcm9taXNlPEV4dEhvc3RNYW5hZ2VkU29ja2V0PiB7XG5cdFx0Y29uc3QgZCA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBoYWxmOiBSZW1vdGVTb2NrZXRIYWxmID0ge1xuXHRcdFx0b25DbG9zZTogZC5hZGQobmV3IEVtaXR0ZXIoKSksXG5cdFx0XHRvbkRhdGE6IGQuYWRkKG5ldyBFbWl0dGVyKCkpLFxuXHRcdFx0b25FbmQ6IGQuYWRkKG5ldyBFbWl0dGVyKCkpLFxuXHRcdH07XG5cblx0XHRkLmFkZChwYXNzaW5nLm9uRGlkUmVjZWl2ZU1lc3NhZ2UoZCA9PiBoYWxmLm9uRGF0YS5maXJlKFZTQnVmZmVyLndyYXAoZCkpKSk7XG5cdFx0ZC5hZGQocGFzc2luZy5vbkRpZEVuZCgoKSA9PiBoYWxmLm9uRW5kLmZpcmUoKSkpO1xuXHRcdGQuYWRkKHBhc3Npbmcub25EaWRDbG9zZShlcnJvciA9PiBoYWxmLm9uQ2xvc2UuZmlyZSh7XG5cdFx0XHR0eXBlOiBTb2NrZXRDbG9zZUV2ZW50VHlwZS5Ob2RlU29ja2V0Q2xvc2VFdmVudCxcblx0XHRcdGVycm9yLFxuXHRcdFx0aGFkRXJyb3I6ICEhZXJyb3Jcblx0XHR9KSkpO1xuXG5cdFx0Y29uc3Qgc29ja2V0ID0gbmV3IEV4dEhvc3RNYW5hZ2VkU29ja2V0KHBhc3NpbmcsIGRlYnVnTGFiZWwsIGhhbGYpO1xuXHRcdHNvY2tldC5fcmVnaXN0ZXIoZCk7XG5cdFx0cmV0dXJuIGNvbm5lY3RNYW5hZ2VkU29ja2V0KHNvY2tldCwgcGF0aCwgcXVlcnksIGRlYnVnTGFiZWwsIGhhbGYpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwYXNzaW5nOiB2c2NvZGUuTWFuYWdlZE1lc3NhZ2VQYXNzaW5nLFxuXHRcdGRlYnVnTGFiZWw6IHN0cmluZyxcblx0XHRoYWxmOiBSZW1vdGVTb2NrZXRIYWxmLFxuXHQpIHtcblx0XHRzdXBlcihkZWJ1Z0xhYmVsLCBoYWxmKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSB3cml0ZShidWZmZXI6IFZTQnVmZmVyKTogdm9pZCB7XG5cdFx0dGhpcy5wYXNzaW5nLnNlbmQoYnVmZmVyLmJ1ZmZlcik7XG5cdH1cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNsb3NlUmVtb3RlKCk6IHZvaWQge1xuXHRcdHRoaXMucGFzc2luZy5lbmQoKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBhc3luYyBkcmFpbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnBhc3NpbmcuZHJhaW4/LigpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksUUFBUTtBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZUFBZTtBQUN4QixZQUFZLGVBQWU7QUFDM0IsU0FBUyxXQUFXO0FBQ3BCLFlBQVksU0FBUztBQUNyQixTQUFrQiw0QkFBNEI7QUFDOUMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxlQUFpQyw0QkFBNEI7QUFDdEUsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxpQkFBaUIsbUJBQW1CO0FBQzdDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQXdCLG9CQUFvQjtBQUU1QyxTQUFTLDZCQUE2QjtBQUUvQixTQUFTLFdBQVcs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
