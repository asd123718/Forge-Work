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
import * as osLib from "os";
import { Promises } from "../../../base/common/async.js";
import { getNodeType, parse } from "../../../base/common/json.js";
import { Schemas } from "../../../base/common/network.js";
import { basename, join } from "../../../base/common/path.js";
import { isLinux, isWindows } from "../../../base/common/platform.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { URI } from "../../../base/common/uri.js";
import { virtualMachineHint } from "../../../base/node/id.js";
import { Promises as pfs } from "../../../base/node/pfs.js";
import { listProcesses } from "../../../base/node/ps.js";
import { isRemoteDiagnosticError } from "../common/diagnostics.js";
import { ByteSize } from "../../files/common/files.js";
import { IProductService } from "../../product/common/productService.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
const workspaceStatsCache = /* @__PURE__ */ new Map();
const NO_EXT_KEY = "\0no-extension";
async function collectWorkspaceStats(folder, filter, options) {
  const cacheKey = `${folder}::${filter.join(":")}::${options?.unbounded ? "unbounded" : "bounded"}`;
  if (!options?.skipCache) {
    const cached = workspaceStatsCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  } else {
    workspaceStatsCache.delete(cacheKey);
  }
  const configFilePatterns = [
    { tag: "grunt.js", filePattern: /^gruntfile\.js$/i },
    { tag: "gulp.js", filePattern: /^gulpfile\.js$/i },
    { tag: "tsconfig.json", filePattern: /^tsconfig\.json$/i },
    { tag: "package.json", filePattern: /^package\.json$/i },
    { tag: "jsconfig.json", filePattern: /^jsconfig\.json$/i },
    { tag: "tslint.json", filePattern: /^tslint\.json$/i },
    { tag: "eslint.json", filePattern: /^eslint\.json$/i },
    { tag: "tasks.json", filePattern: /^tasks\.json$/i },
    { tag: "launch.json", filePattern: /^launch\.json$/i },
    { tag: "mcp.json", filePattern: /^mcp\.json$/i },
    { tag: "settings.json", filePattern: /^settings\.json$/i },
    { tag: "webpack.config.js", filePattern: /^webpack\.config\.js$/i },
    { tag: "project.json", filePattern: /^project\.json$/i },
    { tag: "makefile", filePattern: /^makefile$/i },
    { tag: "sln", filePattern: /^.+\.sln$/i },
    { tag: "csproj", filePattern: /^.+\.csproj$/i },
    { tag: "cmake", filePattern: /^.+\.cmake$/i },
    { tag: "github-actions", filePattern: /^.+\.ya?ml$/i, relativePathPattern: /^\.github(?:\/|\\)workflows$/i },
    { tag: "devcontainer.json", filePattern: /^devcontainer\.json$/i },
    { tag: "dockerfile", filePattern: /^(dockerfile|docker\-compose\.ya?ml)$/i },
    { tag: "cursorrules", filePattern: /^\.cursorrules$/i },
    { tag: "cursorrules-dir", filePattern: /\.mdc$/i, relativePathPattern: /^\.cursor[\/\\]rules$/i },
    { tag: "github-instructions-dir", filePattern: /\.instructions\.md$/i, relativePathPattern: /^\.github[\/\\]instructions$/i },
    { tag: "github-prompts-dir", filePattern: /\.prompt\.md$/i, relativePathPattern: /^\.github[\/\\]prompts$/i },
    { tag: "clinerules", filePattern: /^\.clinerules$/i },
    { tag: "clinerules-dir", filePattern: /\.md$/i, relativePathPattern: /^\.clinerules$/i },
    { tag: "agent.md", filePattern: /^agent\.md$/i },
    { tag: "agents.md", filePattern: /^agents\.md$/i },
    { tag: "claude.md", filePattern: /^claude\.md$/i },
    { tag: "claude-settings", filePattern: /^settings\.json$/i, relativePathPattern: /^\.claude$/i },
    { tag: "claude-settings-local", filePattern: /^settings\.local\.json$/i, relativePathPattern: /^\.claude$/i },
    { tag: "claude-mcp", filePattern: /^mcp\.json$/i, relativePathPattern: /^\.claude$/i },
    { tag: "claude-commands-dir", filePattern: /\.md$/i, relativePathPattern: /^\.claude[\/\\]commands$/i },
    { tag: "claude-skills-dir", filePattern: /^SKILL\.md$/i, relativePathPattern: /^\.claude[\/\\]skills[\/\\]/i },
    { tag: "claude-rules-dir", filePattern: /\.md$/i, relativePathPattern: /^\.claude[\/\\]rules$/i },
    { tag: "gemini.md", filePattern: /^gemini\.md$/i },
    { tag: "copilot-instructions.md", filePattern: /^copilot\-instructions\.md$/i, relativePathPattern: /^\.github$/i }
  ];
  const fileTypes = /* @__PURE__ */ new Map();
  const configFiles = /* @__PURE__ */ new Map();
  const MAX_FILES = options?.unbounded ? Number.POSITIVE_INFINITY : 2e4;
  function collect(root, dir, filter2, token) {
    const relativePath = dir.substring(root.length + 1);
    return Promises.withAsyncBody(async (resolve) => {
      if (token.count >= MAX_FILES) {
        token.maxReached = true;
        resolve();
        return;
      }
      let files;
      token.readdirCount++;
      try {
        files = await pfs.readdir(dir, { withFileTypes: true });
      } catch (error) {
        resolve();
        return;
      }
      if (token.count >= MAX_FILES) {
        token.maxReached = true;
        resolve();
        return;
      }
      let pending = files.length;
      if (pending === 0) {
        resolve();
        return;
      }
      for (const file of files) {
        if (file.isDirectory()) {
          if (!filter2.includes(file.name)) {
            await collect(root, join(dir, file.name), filter2, token);
          }
          if (--pending === 0) {
            resolve();
            return;
          }
        } else {
          if (token.count >= MAX_FILES) {
            token.maxReached = true;
            resolve();
            return;
          }
          token.count++;
          const index = file.name.lastIndexOf(".");
          let fileType;
          if (index >= 0) {
            fileType = file.name.substring(index + 1) || void 0;
          }
          fileTypes.set(fileType ?? NO_EXT_KEY, (fileTypes.get(fileType ?? NO_EXT_KEY) ?? 0) + 1);
          for (const configFile of configFilePatterns) {
            if (configFile.relativePathPattern?.test(relativePath) !== false && configFile.filePattern.test(file.name)) {
              configFiles.set(configFile.tag, (configFiles.get(configFile.tag) ?? 0) + 1);
            }
          }
          if (--pending === 0) {
            resolve();
            return;
          }
        }
      }
    });
  }
  const statsPromise = Promises.withAsyncBody(async (resolve) => {
    const token = { count: 0, maxReached: false, readdirCount: 0 };
    const sw = new StopWatch(true);
    await collect(folder, folder, filter, token);
    const launchConfigs = await collectLaunchConfigs(folder);
    resolve({
      configFiles: asSortedItems(configFiles),
      fileTypes: asSortedItems(fileTypes),
      fileCount: token.count,
      maxFilesReached: token.maxReached,
      launchConfigFiles: launchConfigs,
      totalScanTime: sw.elapsed(),
      totalReaddirCount: token.readdirCount
    });
  });
  workspaceStatsCache.set(cacheKey, statsPromise);
  return statsPromise;
}
function asSortedItems(items) {
  return Array.from(items.entries(), ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}
function getMachineInfo() {
  const machineInfo = {
    os: `${osLib.type()} ${osLib.arch()} ${osLib.release()}`,
    memory: `${(osLib.totalmem() / ByteSize.GB).toFixed(2)}GB (${(osLib.freemem() / ByteSize.GB).toFixed(2)}GB free)`,
    vmHint: `${Math.round(virtualMachineHint.value() * 100)}%`
  };
  const cpus = osLib.cpus();
  if (cpus && cpus.length > 0) {
    machineInfo.cpus = `${cpus[0].model} (${cpus.length} x ${cpus[0].speed})`;
  }
  return machineInfo;
}
async function collectLaunchConfigs(folder) {
  try {
    const launchConfigs = /* @__PURE__ */ new Map();
    const launchConfig = join(folder, ".vscode", "launch.json");
    const contents = await fs.promises.readFile(launchConfig);
    const errors = [];
    const json = parse(contents.toString(), errors);
    if (errors.length) {
      console.log(`Unable to parse ${launchConfig}`);
      return [];
    }
    if (getNodeType(json) === "object" && json["configurations"]) {
      for (const each of json["configurations"]) {
        const type = each["type"];
        if (type) {
          if (launchConfigs.has(type)) {
            launchConfigs.set(type, launchConfigs.get(type) + 1);
          } else {
            launchConfigs.set(type, 1);
          }
        }
      }
    }
    return asSortedItems(launchConfigs);
  } catch (error) {
    return [];
  }
}
let DiagnosticsService = class {
  constructor(telemetryService, productService) {
    this.telemetryService = telemetryService;
    this.productService = productService;
  }
  formatMachineInfo(info) {
    const output = [];
    output.push(`OS Version:       ${info.os}`);
    output.push(`CPUs:             ${info.cpus}`);
    output.push(`Memory (System):  ${info.memory}`);
    output.push(`VM:               ${info.vmHint}`);
    return output.join("\n");
  }
  formatEnvironment(info) {
    const output = [];
    output.push(`Version:          ${this.productService.nameShort} ${this.productService.version} (${this.productService.commit || "Commit unknown"}, ${this.productService.date || "Date unknown"})`);
    output.push(`OS Version:       ${osLib.type()} ${osLib.arch()} ${osLib.release()}`);
    const cpus = osLib.cpus();
    if (cpus && cpus.length > 0) {
      output.push(`CPUs:             ${cpus[0].model} (${cpus.length} x ${cpus[0].speed})`);
    }
    output.push(`Memory (System):  ${(osLib.totalmem() / ByteSize.GB).toFixed(2)}GB (${(osLib.freemem() / ByteSize.GB).toFixed(2)}GB free)`);
    if (!isWindows) {
      output.push(`Load (avg):       ${osLib.loadavg().map((l) => Math.round(l)).join(", ")}`);
    }
    output.push(`VM:               ${Math.round(virtualMachineHint.value() * 100)}%`);
    output.push(`Screen Reader:    ${info.screenReader ? "yes" : "no"}`);
    output.push(`Process Argv:     ${info.mainArguments.join(" ")}`);
    output.push(`GPU Status:       ${this.expandGPUFeatures(info.gpuFeatureStatus)}`);
    if (info.gpuLogMessages && info.gpuLogMessages.length > 0) {
      output.push(`GPU Log Messages:`);
      info.gpuLogMessages.forEach((msg) => {
        output.push(`${msg.header}: ${msg.message}`);
      });
    }
    return output.join("\n");
  }
  async getPerformanceInfo(info, remoteData, options) {
    return Promise.all([listProcesses(info.mainPID), this.formatWorkspaceMetadata(info, options)]).then(async (result) => {
      let [rootProcess, workspaceInfo] = result;
      let processInfo = this.formatProcessList(info, rootProcess);
      remoteData.forEach((diagnostics) => {
        if (isRemoteDiagnosticError(diagnostics)) {
          processInfo += `
${diagnostics.errorMessage}`;
          workspaceInfo += `
${diagnostics.errorMessage}`;
        } else {
          processInfo += `

Remote: ${diagnostics.hostName}`;
          if (diagnostics.processes) {
            processInfo += `
${this.formatProcessList(info, diagnostics.processes)}`;
          }
          if (diagnostics.workspaceMetadata) {
            workspaceInfo += `
|  Remote: ${diagnostics.hostName}`;
            for (const folder of Object.keys(diagnostics.workspaceMetadata)) {
              const metadata = diagnostics.workspaceMetadata[folder];
              let countMessage = `${metadata.fileCount} files`;
              if (metadata.maxFilesReached) {
                countMessage = `more than ${countMessage}`;
              }
              workspaceInfo += `|    Folder (${folder}): ${countMessage}`;
              workspaceInfo += this.formatWorkspaceStats(metadata);
            }
          }
        }
      });
      return {
        processInfo,
        workspaceInfo
      };
    });
  }
  async getSystemInfo(info, remoteData) {
    const { memory, vmHint, os, cpus } = getMachineInfo();
    const systemInfo = {
      os,
      memory,
      cpus,
      vmHint,
      processArgs: `${info.mainArguments.join(" ")}`,
      gpuStatus: info.gpuFeatureStatus,
      screenReader: `${info.screenReader ? "yes" : "no"}`,
      remoteData
    };
    if (!isWindows) {
      systemInfo.load = `${osLib.loadavg().map((l) => Math.round(l)).join(", ")}`;
    }
    if (isLinux) {
      systemInfo.linuxEnv = {
        desktopSession: process.env["DESKTOP_SESSION"],
        xdgSessionDesktop: process.env["XDG_SESSION_DESKTOP"],
        xdgCurrentDesktop: process.env["XDG_CURRENT_DESKTOP"],
        xdgSessionType: process.env["XDG_SESSION_TYPE"]
      };
    }
    return Promise.resolve(systemInfo);
  }
  async getDiagnostics(info, remoteDiagnostics) {
    const output = [];
    return listProcesses(info.mainPID).then(async (rootProcess) => {
      output.push("");
      output.push(this.formatEnvironment(info));
      output.push("");
      output.push(this.formatProcessList(info, rootProcess));
      if (info.windows.some((window) => window.folderURIs && window.folderURIs.length > 0 && !window.remoteAuthority)) {
        output.push("");
        output.push("Workspace Stats: ");
        output.push(await this.formatWorkspaceMetadata(info));
      }
      remoteDiagnostics.forEach((diagnostics) => {
        if (isRemoteDiagnosticError(diagnostics)) {
          output.push(`
${diagnostics.errorMessage}`);
        } else {
          output.push("\n\n");
          output.push(`Remote:           ${diagnostics.hostName}`);
          output.push(this.formatMachineInfo(diagnostics.machineInfo));
          if (diagnostics.processes) {
            output.push(this.formatProcessList(info, diagnostics.processes));
          }
          if (diagnostics.workspaceMetadata) {
            for (const folder of Object.keys(diagnostics.workspaceMetadata)) {
              const metadata = diagnostics.workspaceMetadata[folder];
              let countMessage = `${metadata.fileCount} files`;
              if (metadata.maxFilesReached) {
                countMessage = `more than ${countMessage}`;
              }
              output.push(`Folder (${folder}): ${countMessage}`);
              output.push(this.formatWorkspaceStats(metadata));
            }
          }
        }
      });
      output.push("");
      output.push("");
      return output.join("\n");
    });
  }
  formatWorkspaceStats(workspaceStats) {
    const output = [];
    const lineLength = 60;
    let col = 0;
    const appendAndWrap = (name, count) => {
      const item = ` ${name}(${count})`;
      if (col + item.length > lineLength) {
        output.push(line);
        line = "|                 ";
        col = line.length;
      } else {
        col += item.length;
      }
      line += item;
    };
    let line = "|      File types:";
    const maxShown = 10;
    const namedTypes = workspaceStats.fileTypes.filter((t) => t.name !== NO_EXT_KEY);
    const noExtCount = workspaceStats.fileTypes.filter((t) => t.name === NO_EXT_KEY).reduce((sum, t) => sum + t.count, 0);
    const max = Math.min(namedTypes.length, maxShown);
    for (let i = 0; i < max; i++) {
      const item = namedTypes[i];
      appendAndWrap(item.name, item.count);
    }
    let otherCount = noExtCount;
    for (let i = max; i < namedTypes.length; i++) {
      otherCount += namedTypes[i].count;
    }
    if (otherCount > 0) {
      appendAndWrap("other", otherCount);
    }
    output.push(line);
    if (workspaceStats.configFiles.length >= 0) {
      line = "|      Conf files:";
      col = 0;
      workspaceStats.configFiles.forEach((item) => {
        appendAndWrap(item.name, item.count);
      });
      output.push(line);
    }
    if (workspaceStats.launchConfigFiles.length > 0) {
      let line2 = "|      Launch Configs:";
      workspaceStats.launchConfigFiles.forEach((each) => {
        const item = each.count > 1 ? ` ${each.name}(${each.count})` : ` ${each.name}`;
        line2 += item;
      });
      output.push(line2);
    }
    return output.join("\n");
  }
  expandGPUFeatures(gpuFeatures) {
    const longestFeatureName = Math.max(...Object.keys(gpuFeatures).map((feature) => feature.length));
    return Object.keys(gpuFeatures).map((feature) => `${feature}:  ${" ".repeat(longestFeatureName - feature.length)}  ${gpuFeatures[feature]}`).join("\n                  ");
  }
  formatWorkspaceMetadata(info, options) {
    const output = [];
    const workspaceStatPromises = [];
    info.windows.forEach((window) => {
      if (window.folderURIs.length === 0 || !!window.remoteAuthority) {
        return;
      }
      output.push(`|  Window (${window.title})`);
      window.folderURIs.forEach((uriComponents) => {
        const folderUri = URI.revive(uriComponents);
        if (folderUri.scheme === Schemas.file) {
          const folder = folderUri.fsPath;
          workspaceStatPromises.push(collectWorkspaceStats(folder, ["node_modules", ".git"], options).then((stats) => {
            let countMessage = `${stats.fileCount} files`;
            if (stats.maxFilesReached) {
              countMessage = `more than ${countMessage}`;
            }
            output.push(`|    Folder (${basename(folder)}): ${countMessage}`);
            output.push(this.formatWorkspaceStats(stats));
          }).catch((error) => {
            output.push(`|      Error: Unable to collect workspace stats for folder ${folder} (${error.toString()})`);
          }));
        } else {
          output.push(`|    Folder (${folderUri.toString()}): Workspace stats not available.`);
        }
      });
    });
    return Promise.all(workspaceStatPromises).then((_) => output.join("\n")).catch((e) => `Unable to collect workspace stats: ${e}`);
  }
  formatProcessList(info, rootProcess) {
    const mapProcessToName = /* @__PURE__ */ new Map();
    info.windows.forEach((window) => mapProcessToName.set(window.pid, `window [${window.id}] (${window.title})`));
    info.pidToNames.forEach(({ pid, name }) => mapProcessToName.set(pid, name));
    const output = [];
    output.push("CPU %	Mem MB	   PID	Process");
    if (rootProcess) {
      this.formatProcessItem(info.mainPID, mapProcessToName, output, rootProcess, 0);
    }
    return output.join("\n");
  }
  formatProcessItem(mainPid, mapProcessToName, output, item, indent) {
    const isRoot = indent === 0;
    let name;
    if (isRoot) {
      name = item.pid === mainPid ? this.productService.applicationName : "remote-server";
    } else {
      if (mapProcessToName.has(item.pid)) {
        name = mapProcessToName.get(item.pid);
      } else {
        name = `${"  ".repeat(indent)} ${item.name}`;
      }
    }
    const memory = process.platform === "win32" ? item.mem : osLib.totalmem() * (item.mem / 100);
    output.push(`${item.load.toFixed(0).padStart(5, " ")}	${(memory / ByteSize.MB).toFixed(0).padStart(6, " ")}	${item.pid.toFixed(0).padStart(6, " ")}	${name}`);
    if (Array.isArray(item.children)) {
      item.children.forEach((child) => this.formatProcessItem(mainPid, mapProcessToName, output, child, indent + 1));
    }
  }
  async getWorkspaceFileExtensions(workspace) {
    const items = /* @__PURE__ */ new Set();
    for (const { uri } of workspace.folders) {
      const folderUri = URI.revive(uri);
      if (folderUri.scheme !== Schemas.file) {
        continue;
      }
      const folder = folderUri.fsPath;
      try {
        const stats = await collectWorkspaceStats(folder, ["node_modules", ".git"]);
        stats.fileTypes.forEach((item) => {
          if (item.name !== NO_EXT_KEY) {
            items.add(item.name);
          }
        });
      } catch {
      }
    }
    return { extensions: [...items] };
  }
  async reportWorkspaceStats(workspace) {
    for (const { uri } of workspace.folders) {
      const folderUri = URI.revive(uri);
      if (folderUri.scheme !== Schemas.file) {
        continue;
      }
      const folder = folderUri.fsPath;
      try {
        const stats = await collectWorkspaceStats(folder, ["node_modules", ".git"]);
        this.telemetryService.publicLog2("workspace.stats", {
          "workspace.id": workspace.telemetryId,
          rendererSessionId: workspace.rendererSessionId
        });
        stats.fileTypes.forEach((e) => {
          if (e.name === NO_EXT_KEY) {
            return;
          }
          this.telemetryService.publicLog2("workspace.stats.file", {
            rendererSessionId: workspace.rendererSessionId,
            type: e.name,
            count: e.count
          });
        });
        stats.launchConfigFiles.forEach((e) => {
          this.telemetryService.publicLog2("workspace.stats.launchConfigFile", {
            rendererSessionId: workspace.rendererSessionId,
            type: e.name,
            count: e.count
          });
        });
        stats.configFiles.forEach((e) => {
          this.telemetryService.publicLog2("workspace.stats.configFiles", {
            rendererSessionId: workspace.rendererSessionId,
            type: e.name,
            count: e.count
          });
        });
        this.telemetryService.publicLog2("workspace.stats.metadata", { duration: stats.totalScanTime, reachedLimit: stats.maxFilesReached, fileCount: stats.fileCount, readdirCount: stats.totalReaddirCount });
      } catch {
      }
    }
  }
};
DiagnosticsService = __decorateClass([
  __decorateParam(0, ITelemetryService),
  __decorateParam(1, IProductService)
], DiagnosticsService);
export {
  DiagnosticsService,
  collectLaunchConfigs,
  collectWorkspaceStats,
  getMachineInfo
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZGlhZ25vc3RpY3NcXG5vZGVcXGRpYWdub3N0aWNzU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIG9zTGliIGZyb20gJ29zJztcbmltcG9ydCB7IFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZ2V0Tm9kZVR5cGUsIHBhcnNlLCBQYXJzZUVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgam9pbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgUHJvY2Vzc0l0ZW0gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wcm9jZXNzZXMuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyB2aXJ0dWFsTWFjaGluZUhpbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvaWQuanMnO1xuaW1wb3J0IHsgSURpcmVudCwgUHJvbWlzZXMgYXMgcGZzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3Bmcy5qcyc7XG5pbXBvcnQgeyBsaXN0UHJvY2Vzc2VzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3BzLmpzJztcbmltcG9ydCB7IElEaWFnbm9zdGljc1NlcnZpY2UsIElNYWNoaW5lSW5mbywgSU1haW5Qcm9jZXNzRGlhZ25vc3RpY3MsIElSZW1vdGVEaWFnbm9zdGljRXJyb3IsIElSZW1vdGVEaWFnbm9zdGljSW5mbywgaXNSZW1vdGVEaWFnbm9zdGljRXJyb3IsIElXb3Jrc3BhY2VJbmZvcm1hdGlvbiwgUGVyZm9ybWFuY2VJbmZvLCBTeXN0ZW1JbmZvLCBXb3Jrc3BhY2VTdGF0SXRlbSwgV29ya3NwYWNlU3RhdHMgfSBmcm9tICcuLi9jb21tb24vZGlhZ25vc3RpY3MuanMnO1xuaW1wb3J0IHsgQnl0ZVNpemUgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuXG5pbnRlcmZhY2UgQ29uZmlnRmlsZVBhdHRlcm5zIHtcblx0dGFnOiBzdHJpbmc7XG5cdGZpbGVQYXR0ZXJuOiBSZWdFeHA7XG5cdHJlbGF0aXZlUGF0aFBhdHRlcm4/OiBSZWdFeHA7XG59XG5cbmNvbnN0IHdvcmtzcGFjZVN0YXRzQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTxXb3Jrc3BhY2VTdGF0cz4+KCk7XG5cbi8qKiBTZW50aW5lbCBrZXkgaW4ge0BsaW5rIFdvcmtzcGFjZVN0YXRzLmZpbGVUeXBlc30gZm9yIGZpbGVzIHdpdGggbm8gZXh0ZW5zaW9uLiAqL1xuY29uc3QgTk9fRVhUX0tFWSA9ICdcXDBuby1leHRlbnNpb24nO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29sbGVjdFdvcmtzcGFjZVN0YXRzKGZvbGRlcjogc3RyaW5nLCBmaWx0ZXI6IHN0cmluZ1tdLCBvcHRpb25zPzogeyBza2lwQ2FjaGU/OiBib29sZWFuOyB1bmJvdW5kZWQ/OiBib29sZWFuIH0pOiBQcm9taXNlPFdvcmtzcGFjZVN0YXRzPiB7XG5cdC8vIEluY2x1ZGUgYHVuYm91bmRlZGAgaW4gdGhlIGNhY2hlIGtleSBzbyBhIGJvdW5kZWQgKDIway1jYXApIHJlc3VsdCBpcyBuZXZlclxuXHQvLyByZXR1cm5lZCBmb3IgYW4gdW5ib3VuZGVkIHJlcXVlc3QgKHdoaWNoIHdvdWxkIHNpbGVudGx5IHRydW5jYXRlIGNvdW50cykuXG5cdGNvbnN0IGNhY2hlS2V5ID0gYCR7Zm9sZGVyfTo6JHtmaWx0ZXIuam9pbignOicpfTo6JHtvcHRpb25zPy51bmJvdW5kZWQgPyAndW5ib3VuZGVkJyA6ICdib3VuZGVkJ31gO1xuXHRpZiAoIW9wdGlvbnM/LnNraXBDYWNoZSkge1xuXHRcdGNvbnN0IGNhY2hlZCA9IHdvcmtzcGFjZVN0YXRzQ2FjaGUuZ2V0KGNhY2hlS2V5KTtcblx0XHRpZiAoY2FjaGVkKSB7XG5cdFx0XHRyZXR1cm4gY2FjaGVkO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHQvLyBEcm9wIGFueSBpbi1mbGlnaHQgb3Igc3RhbGUgZW50cnkgc28gY2FsbGVycyBjYW4gYmUgc3VyZSB0aGV5IGdldCBmcmVzaCBkYXRhLlxuXHRcdHdvcmtzcGFjZVN0YXRzQ2FjaGUuZGVsZXRlKGNhY2hlS2V5KTtcblx0fVxuXG5cdGNvbnN0IGNvbmZpZ0ZpbGVQYXR0ZXJuczogQ29uZmlnRmlsZVBhdHRlcm5zW10gPSBbXG5cdFx0eyB0YWc6ICdncnVudC5qcycsIGZpbGVQYXR0ZXJuOiAvXmdydW50ZmlsZVxcLmpzJC9pIH0sXG5cdFx0eyB0YWc6ICdndWxwLmpzJywgZmlsZVBhdHRlcm46IC9eZ3VscGZpbGVcXC5qcyQvaSB9LFxuXHRcdHsgdGFnOiAndHNjb25maWcuanNvbicsIGZpbGVQYXR0ZXJuOiAvXnRzY29uZmlnXFwuanNvbiQvaSB9LFxuXHRcdHsgdGFnOiAncGFja2FnZS5qc29uJywgZmlsZVBhdHRlcm46IC9ecGFja2FnZVxcLmpzb24kL2kgfSxcblx0XHR7IHRhZzogJ2pzY29uZmlnLmpzb24nLCBmaWxlUGF0dGVybjogL15qc2NvbmZpZ1xcLmpzb24kL2kgfSxcblx0XHR7IHRhZzogJ3RzbGludC5qc29uJywgZmlsZVBhdHRlcm46IC9edHNsaW50XFwuanNvbiQvaSB9LFxuXHRcdHsgdGFnOiAnZXNsaW50Lmpzb24nLCBmaWxlUGF0dGVybjogL15lc2xpbnRcXC5qc29uJC9pIH0sXG5cdFx0eyB0YWc6ICd0YXNrcy5qc29uJywgZmlsZVBhdHRlcm46IC9edGFza3NcXC5qc29uJC9pIH0sXG5cdFx0eyB0YWc6ICdsYXVuY2guanNvbicsIGZpbGVQYXR0ZXJuOiAvXmxhdW5jaFxcLmpzb24kL2kgfSxcblx0XHR7IHRhZzogJ21jcC5qc29uJywgZmlsZVBhdHRlcm46IC9ebWNwXFwuanNvbiQvaSB9LFxuXHRcdHsgdGFnOiAnc2V0dGluZ3MuanNvbicsIGZpbGVQYXR0ZXJuOiAvXnNldHRpbmdzXFwuanNvbiQvaSB9LFxuXHRcdHsgdGFnOiAnd2VicGFjay5jb25maWcuanMnLCBmaWxlUGF0dGVybjogL153ZWJwYWNrXFwuY29uZmlnXFwuanMkL2kgfSxcblx0XHR7IHRhZzogJ3Byb2plY3QuanNvbicsIGZpbGVQYXR0ZXJuOiAvXnByb2plY3RcXC5qc29uJC9pIH0sXG5cdFx0eyB0YWc6ICdtYWtlZmlsZScsIGZpbGVQYXR0ZXJuOiAvXm1ha2VmaWxlJC9pIH0sXG5cdFx0eyB0YWc6ICdzbG4nLCBmaWxlUGF0dGVybjogL14uK1xcLnNsbiQvaSB9LFxuXHRcdHsgdGFnOiAnY3Nwcm9qJywgZmlsZVBhdHRlcm46IC9eLitcXC5jc3Byb2okL2kgfSxcblx0XHR7IHRhZzogJ2NtYWtlJywgZmlsZVBhdHRlcm46IC9eLitcXC5jbWFrZSQvaSB9LFxuXHRcdHsgdGFnOiAnZ2l0aHViLWFjdGlvbnMnLCBmaWxlUGF0dGVybjogL14uK1xcLnlhP21sJC9pLCByZWxhdGl2ZVBhdGhQYXR0ZXJuOiAvXlxcLmdpdGh1Yig/OlxcL3xcXFxcKXdvcmtmbG93cyQvaSB9LFxuXHRcdHsgdGFnOiAnZGV2Y29udGFpbmVyLmpzb24nLCBmaWxlUGF0dGVybjogL15kZXZjb250YWluZXJcXC5qc29uJC9pIH0sXG5cdFx0eyB0YWc6ICdkb2NrZXJmaWxlJywgZmlsZVBhdHRlcm46IC9eKGRvY2tlcmZpbGV8ZG9ja2VyXFwtY29tcG9zZVxcLnlhP21sKSQvaSB9LFxuXHRcdHsgdGFnOiAnY3Vyc29ycnVsZXMnLCBmaWxlUGF0dGVybjogL15cXC5jdXJzb3JydWxlcyQvaSB9LFxuXHRcdHsgdGFnOiAnY3Vyc29ycnVsZXMtZGlyJywgZmlsZVBhdHRlcm46IC9cXC5tZGMkL2ksIHJlbGF0aXZlUGF0aFBhdHRlcm46IC9eXFwuY3Vyc29yW1xcL1xcXFxdcnVsZXMkL2kgfSxcblx0XHR7IHRhZzogJ2dpdGh1Yi1pbnN0cnVjdGlvbnMtZGlyJywgZmlsZVBhdHRlcm46IC9cXC5pbnN0cnVjdGlvbnNcXC5tZCQvaSwgcmVsYXRpdmVQYXRoUGF0dGVybjogL15cXC5naXRodWJbXFwvXFxcXF1pbnN0cnVjdGlvbnMkL2kgfSxcblx0XHR7IHRhZzogJ2dpdGh1Yi1wcm9tcHRzLWRpcicsIGZpbGVQYXR0ZXJuOiAvXFwucHJvbXB0XFwubWQkL2ksIHJlbGF0aXZlUGF0aFBhdHRlcm46IC9eXFwuZ2l0aHViW1xcL1xcXFxdcHJvbXB0cyQvaSB9LFxuXHRcdHsgdGFnOiAnY2xpbmVydWxlcycsIGZpbGVQYXR0ZXJuOiAvXlxcLmNsaW5lcnVsZXMkL2kgfSxcblx0XHR7IHRhZzogJ2NsaW5lcnVsZXMtZGlyJywgZmlsZVBhdHRlcm46IC9cXC5tZCQvaSwgcmVsYXRpdmVQYXRoUGF0dGVybjogL15cXC5jbGluZXJ1bGVzJC9pIH0sXG5cdFx0eyB0YWc6ICdhZ2VudC5tZCcsIGZpbGVQYXR0ZXJuOiAvXmFnZW50XFwubWQkL2kgfSxcblx0XHR7IHRhZzogJ2FnZW50cy5tZCcsIGZpbGVQYXR0ZXJuOiAvXmFnZW50c1xcLm1kJC9pIH0sXG5cdFx0eyB0YWc6ICdjbGF1ZGUubWQnLCBmaWxlUGF0dGVybjogL15jbGF1ZGVcXC5tZCQvaSB9LFxuXHRcdHsgdGFnOiAnY2xhdWRlLXNldHRpbmdzJywgZmlsZVBhdHRlcm46IC9ec2V0dGluZ3NcXC5qc29uJC9pLCByZWxhdGl2ZVBhdGhQYXR0ZXJuOiAvXlxcLmNsYXVkZSQvaSB9LFxuXHRcdHsgdGFnOiAnY2xhdWRlLXNldHRpbmdzLWxvY2FsJywgZmlsZVBhdHRlcm46IC9ec2V0dGluZ3NcXC5sb2NhbFxcLmpzb24kL2ksIHJlbGF0aXZlUGF0aFBhdHRlcm46IC9eXFwuY2xhdWRlJC9pIH0sXG5cdFx0eyB0YWc6ICdjbGF1ZGUtbWNwJywgZmlsZVBhdHRlcm46IC9ebWNwXFwuanNvbiQvaSwgcmVsYXRpdmVQYXRoUGF0dGVybjogL15cXC5jbGF1ZGUkL2kgfSxcblx0XHR7IHRhZzogJ2NsYXVkZS1jb21tYW5kcy1kaXInLCBmaWxlUGF0dGVybjogL1xcLm1kJC9pLCByZWxhdGl2ZVBhdGhQYXR0ZXJuOiAvXlxcLmNsYXVkZVtcXC9cXFxcXWNvbW1hbmRzJC9pIH0sXG5cdFx0eyB0YWc6ICdjbGF1ZGUtc2tpbGxzLWRpcicsIGZpbGVQYXR0ZXJuOiAvXlNLSUxMXFwubWQkL2ksIHJlbGF0aXZlUGF0aFBhdHRlcm46IC9eXFwuY2xhdWRlW1xcL1xcXFxdc2tpbGxzW1xcL1xcXFxdL2kgfSxcblx0XHR7IHRhZzogJ2NsYXVkZS1ydWxlcy1kaXInLCBmaWxlUGF0dGVybjogL1xcLm1kJC9pLCByZWxhdGl2ZVBhdGhQYXR0ZXJuOiAvXlxcLmNsYXVkZVtcXC9cXFxcXXJ1bGVzJC9pIH0sXG5cdFx0eyB0YWc6ICdnZW1pbmkubWQnLCBmaWxlUGF0dGVybjogL15nZW1pbmlcXC5tZCQvaSB9LFxuXHRcdHsgdGFnOiAnY29waWxvdC1pbnN0cnVjdGlvbnMubWQnLCBmaWxlUGF0dGVybjogL15jb3BpbG90XFwtaW5zdHJ1Y3Rpb25zXFwubWQkL2ksIHJlbGF0aXZlUGF0aFBhdHRlcm46IC9eXFwuZ2l0aHViJC9pIH0sXG5cdF07XG5cblx0Y29uc3QgZmlsZVR5cGVzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0Y29uc3QgY29uZmlnRmlsZXMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXG5cdGNvbnN0IE1BWF9GSUxFUyA9IG9wdGlvbnM/LnVuYm91bmRlZCA/IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSA6IDIwMDAwO1xuXG5cdGZ1bmN0aW9uIGNvbGxlY3Qocm9vdDogc3RyaW5nLCBkaXI6IHN0cmluZywgZmlsdGVyOiBzdHJpbmdbXSwgdG9rZW46IHsgY291bnQ6IG51bWJlcjsgbWF4UmVhY2hlZDogYm9vbGVhbjsgcmVhZGRpckNvdW50OiBudW1iZXIgfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlbGF0aXZlUGF0aCA9IGRpci5zdWJzdHJpbmcocm9vdC5sZW5ndGggKyAxKTtcblxuXHRcdHJldHVybiBQcm9taXNlcy53aXRoQXN5bmNCb2R5KGFzeW5jIHJlc29sdmUgPT4ge1xuXHRcdFx0Ly8gQmFpbCBiZWZvcmUgdG91Y2hpbmcgdGhlIGZpbGVzeXN0ZW0gd2hlbiB0aGUgY2FwIGhhcyBhbHJlYWR5IGJlZW4gaGl0IHNvXG5cdFx0XHQvLyBzaWJsaW5nLWRpcmVjdG9yeSByZWN1cnNpb24gZG9lc24ndCBwYXkgcmVhZGRpciBJTyBhZnRlciB0aGUgc2NhbiBpc1xuXHRcdFx0Ly8gZWZmZWN0aXZlbHkgZG9uZS5cblx0XHRcdGlmICh0b2tlbi5jb3VudCA+PSBNQVhfRklMRVMpIHtcblx0XHRcdFx0dG9rZW4ubWF4UmVhY2hlZCA9IHRydWU7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgZmlsZXM6IElEaXJlbnRbXTtcblxuXHRcdFx0dG9rZW4ucmVhZGRpckNvdW50Kys7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRmaWxlcyA9IGF3YWl0IHBmcy5yZWFkZGlyKGRpciwgeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Ly8gSWdub3JlIGZvbGRlcnMgdGhhdCBjYW4ndCBiZSByZWFkXG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodG9rZW4uY291bnQgPj0gTUFYX0ZJTEVTKSB7XG5cdFx0XHRcdHRva2VuLm1heFJlYWNoZWQgPSB0cnVlO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHBlbmRpbmcgPSBmaWxlcy5sZW5ndGg7XG5cdFx0XHRpZiAocGVuZGluZyA9PT0gMCkge1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG5cdFx0XHRcdGlmIChmaWxlLmlzRGlyZWN0b3J5KCkpIHtcblx0XHRcdFx0XHRpZiAoIWZpbHRlci5pbmNsdWRlcyhmaWxlLm5hbWUpKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBjb2xsZWN0KHJvb3QsIGpvaW4oZGlyLCBmaWxlLm5hbWUpLCBmaWx0ZXIsIHRva2VuKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoLS1wZW5kaW5nID09PSAwKSB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmICh0b2tlbi5jb3VudCA+PSBNQVhfRklMRVMpIHtcblx0XHRcdFx0XHRcdHRva2VuLm1heFJlYWNoZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0b2tlbi5jb3VudCsrO1xuXG5cdFx0XHRcdFx0Y29uc3QgaW5kZXggPSBmaWxlLm5hbWUubGFzdEluZGV4T2YoJy4nKTtcblx0XHRcdFx0XHRsZXQgZmlsZVR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0XHRcdFx0ZmlsZVR5cGUgPSBmaWxlLm5hbWUuc3Vic3RyaW5nKGluZGV4ICsgMSkgfHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBUcmFjayBmaWxlcyB3aXRoIG5vIHVzYWJsZSBleHRlbnNpb24gdW5kZXIgYSBzZW50aW5lbCBrZXkgc28gdGhleVxuXHRcdFx0XHRcdC8vIGNhbiBiZSBmb2xkZWQgaW50byB0aGUgXCJvdGhlclwiIGJ1Y2tldCBhdCByZW5kZXIgdGltZS4gV2l0aG91dCB0aGlzLFxuXHRcdFx0XHRcdC8vIGV4dGVuc2lvbi1sZXNzIGZpbGVzIChNYWtlZmlsZSwgTElDRU5TRSwgc2NyaXB0cyBpbiBiaW4vLCBldGMuKSB3b3VsZFxuXHRcdFx0XHRcdC8vIGJlIHNpbGVudGx5IGRyb3BwZWQgZnJvbSB0aGUgZmlsZS10eXBlIGNvdW50cyBhbmQgdGhlIHRvdGFscyB3b3VsZFxuXHRcdFx0XHRcdC8vIG5vdCByZWNvbmNpbGUgd2l0aCB0aGUgb3ZlcmFsbCBmaWxlIGNvdW50LlxuXHRcdFx0XHRcdGZpbGVUeXBlcy5zZXQoZmlsZVR5cGUgPz8gTk9fRVhUX0tFWSwgKGZpbGVUeXBlcy5nZXQoZmlsZVR5cGUgPz8gTk9fRVhUX0tFWSkgPz8gMCkgKyAxKTtcblxuXHRcdFx0XHRcdGZvciAoY29uc3QgY29uZmlnRmlsZSBvZiBjb25maWdGaWxlUGF0dGVybnMpIHtcblx0XHRcdFx0XHRcdGlmIChjb25maWdGaWxlLnJlbGF0aXZlUGF0aFBhdHRlcm4/LnRlc3QocmVsYXRpdmVQYXRoKSAhPT0gZmFsc2UgJiYgY29uZmlnRmlsZS5maWxlUGF0dGVybi50ZXN0KGZpbGUubmFtZSkpIHtcblx0XHRcdFx0XHRcdFx0Y29uZmlnRmlsZXMuc2V0KGNvbmZpZ0ZpbGUudGFnLCAoY29uZmlnRmlsZXMuZ2V0KGNvbmZpZ0ZpbGUudGFnKSA/PyAwKSArIDEpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICgtLXBlbmRpbmcgPT09IDApIHtcblx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGNvbnN0IHN0YXRzUHJvbWlzZSA9IFByb21pc2VzLndpdGhBc3luY0JvZHk8V29ya3NwYWNlU3RhdHM+KGFzeW5jIChyZXNvbHZlKSA9PiB7XG5cdFx0Y29uc3QgdG9rZW46IHsgY291bnQ6IG51bWJlcjsgbWF4UmVhY2hlZDogYm9vbGVhbjsgcmVhZGRpckNvdW50OiBudW1iZXIgfSA9IHsgY291bnQ6IDAsIG1heFJlYWNoZWQ6IGZhbHNlLCByZWFkZGlyQ291bnQ6IDAgfTtcblx0XHRjb25zdCBzdyA9IG5ldyBTdG9wV2F0Y2godHJ1ZSk7XG5cdFx0YXdhaXQgY29sbGVjdChmb2xkZXIsIGZvbGRlciwgZmlsdGVyLCB0b2tlbik7XG5cdFx0Y29uc3QgbGF1bmNoQ29uZmlncyA9IGF3YWl0IGNvbGxlY3RMYXVuY2hDb25maWdzKGZvbGRlcik7XG5cdFx0cmVzb2x2ZSh7XG5cdFx0XHRjb25maWdGaWxlczogYXNTb3J0ZWRJdGVtcyhjb25maWdGaWxlcyksXG5cdFx0XHRmaWxlVHlwZXM6IGFzU29ydGVkSXRlbXMoZmlsZVR5cGVzKSxcblx0XHRcdGZpbGVDb3VudDogdG9rZW4uY291bnQsXG5cdFx0XHRtYXhGaWxlc1JlYWNoZWQ6IHRva2VuLm1heFJlYWNoZWQsXG5cdFx0XHRsYXVuY2hDb25maWdGaWxlczogbGF1bmNoQ29uZmlncyxcblx0XHRcdHRvdGFsU2NhblRpbWU6IHN3LmVsYXBzZWQoKSxcblx0XHRcdHRvdGFsUmVhZGRpckNvdW50OiB0b2tlbi5yZWFkZGlyQ291bnRcblx0XHR9KTtcblx0fSk7XG5cblx0d29ya3NwYWNlU3RhdHNDYWNoZS5zZXQoY2FjaGVLZXksIHN0YXRzUHJvbWlzZSk7XG5cdHJldHVybiBzdGF0c1Byb21pc2U7XG59XG5cbmZ1bmN0aW9uIGFzU29ydGVkSXRlbXMoaXRlbXM6IE1hcDxzdHJpbmcsIG51bWJlcj4pOiBXb3Jrc3BhY2VTdGF0SXRlbVtdIHtcblx0cmV0dXJuIEFycmF5LmZyb20oaXRlbXMuZW50cmllcygpLCAoW25hbWUsIGNvdW50XSkgPT4gKHsgbmFtZTogbmFtZSwgY291bnQ6IGNvdW50IH0pKVxuXHRcdC5zb3J0KChhLCBiKSA9PiBiLmNvdW50IC0gYS5jb3VudCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRNYWNoaW5lSW5mbygpOiBJTWFjaGluZUluZm8ge1xuXG5cdGNvbnN0IG1hY2hpbmVJbmZvOiBJTWFjaGluZUluZm8gPSB7XG5cdFx0b3M6IGAke29zTGliLnR5cGUoKX0gJHtvc0xpYi5hcmNoKCl9ICR7b3NMaWIucmVsZWFzZSgpfWAsXG5cdFx0bWVtb3J5OiBgJHsob3NMaWIudG90YWxtZW0oKSAvIEJ5dGVTaXplLkdCKS50b0ZpeGVkKDIpfUdCICgkeyhvc0xpYi5mcmVlbWVtKCkgLyBCeXRlU2l6ZS5HQikudG9GaXhlZCgyKX1HQiBmcmVlKWAsXG5cdFx0dm1IaW50OiBgJHtNYXRoLnJvdW5kKCh2aXJ0dWFsTWFjaGluZUhpbnQudmFsdWUoKSAqIDEwMCkpfSVgLFxuXHR9O1xuXG5cdGNvbnN0IGNwdXMgPSBvc0xpYi5jcHVzKCk7XG5cdGlmIChjcHVzICYmIGNwdXMubGVuZ3RoID4gMCkge1xuXHRcdG1hY2hpbmVJbmZvLmNwdXMgPSBgJHtjcHVzWzBdLm1vZGVsfSAoJHtjcHVzLmxlbmd0aH0geCAke2NwdXNbMF0uc3BlZWR9KWA7XG5cdH1cblxuXHRyZXR1cm4gbWFjaGluZUluZm87XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb2xsZWN0TGF1bmNoQ29uZmlncyhmb2xkZXI6IHN0cmluZyk6IFByb21pc2U8V29ya3NwYWNlU3RhdEl0ZW1bXT4ge1xuXHR0cnkge1xuXHRcdGNvbnN0IGxhdW5jaENvbmZpZ3MgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdGNvbnN0IGxhdW5jaENvbmZpZyA9IGpvaW4oZm9sZGVyLCAnLnZzY29kZScsICdsYXVuY2guanNvbicpO1xuXG5cdFx0Y29uc3QgY29udGVudHMgPSBhd2FpdCBmcy5wcm9taXNlcy5yZWFkRmlsZShsYXVuY2hDb25maWcpO1xuXG5cdFx0Y29uc3QgZXJyb3JzOiBQYXJzZUVycm9yW10gPSBbXTtcblx0XHRjb25zdCBqc29uID0gcGFyc2UoY29udGVudHMudG9TdHJpbmcoKSwgZXJyb3JzKTtcblx0XHRpZiAoZXJyb3JzLmxlbmd0aCkge1xuXHRcdFx0Y29uc29sZS5sb2coYFVuYWJsZSB0byBwYXJzZSAke2xhdW5jaENvbmZpZ31gKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRpZiAoZ2V0Tm9kZVR5cGUoanNvbikgPT09ICdvYmplY3QnICYmIGpzb25bJ2NvbmZpZ3VyYXRpb25zJ10pIHtcblx0XHRcdGZvciAoY29uc3QgZWFjaCBvZiBqc29uWydjb25maWd1cmF0aW9ucyddKSB7XG5cdFx0XHRcdGNvbnN0IHR5cGUgPSBlYWNoWyd0eXBlJ107XG5cdFx0XHRcdGlmICh0eXBlKSB7XG5cdFx0XHRcdFx0aWYgKGxhdW5jaENvbmZpZ3MuaGFzKHR5cGUpKSB7XG5cdFx0XHRcdFx0XHRsYXVuY2hDb25maWdzLnNldCh0eXBlLCBsYXVuY2hDb25maWdzLmdldCh0eXBlKSEgKyAxKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bGF1bmNoQ29uZmlncy5zZXQodHlwZSwgMSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFzU29ydGVkSXRlbXMobGF1bmNoQ29uZmlncyk7XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEaWFnbm9zdGljc1NlcnZpY2UgaW1wbGVtZW50cyBJRGlhZ25vc3RpY3NTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZVxuXHQpIHsgfVxuXG5cdHByaXZhdGUgZm9ybWF0TWFjaGluZUluZm8oaW5mbzogSU1hY2hpbmVJbmZvKTogc3RyaW5nIHtcblx0XHRjb25zdCBvdXRwdXQ6IHN0cmluZ1tdID0gW107XG5cdFx0b3V0cHV0LnB1c2goYE9TIFZlcnNpb246ICAgICAgICR7aW5mby5vc31gKTtcblx0XHRvdXRwdXQucHVzaChgQ1BVczogICAgICAgICAgICAgJHtpbmZvLmNwdXN9YCk7XG5cdFx0b3V0cHV0LnB1c2goYE1lbW9yeSAoU3lzdGVtKTogICR7aW5mby5tZW1vcnl9YCk7XG5cdFx0b3V0cHV0LnB1c2goYFZNOiAgICAgICAgICAgICAgICR7aW5mby52bUhpbnR9YCk7XG5cblx0XHRyZXR1cm4gb3V0cHV0LmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0cHJpdmF0ZSBmb3JtYXRFbnZpcm9ubWVudChpbmZvOiBJTWFpblByb2Nlc3NEaWFnbm9zdGljcyk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgb3V0cHV0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdG91dHB1dC5wdXNoKGBWZXJzaW9uOiAgICAgICAgICAke3RoaXMucHJvZHVjdFNlcnZpY2UubmFtZVNob3J0fSAke3RoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbn0gKCR7dGhpcy5wcm9kdWN0U2VydmljZS5jb21taXQgfHwgJ0NvbW1pdCB1bmtub3duJ30sICR7dGhpcy5wcm9kdWN0U2VydmljZS5kYXRlIHx8ICdEYXRlIHVua25vd24nfSlgKTtcblx0XHRvdXRwdXQucHVzaChgT1MgVmVyc2lvbjogICAgICAgJHtvc0xpYi50eXBlKCl9ICR7b3NMaWIuYXJjaCgpfSAke29zTGliLnJlbGVhc2UoKX1gKTtcblx0XHRjb25zdCBjcHVzID0gb3NMaWIuY3B1cygpO1xuXHRcdGlmIChjcHVzICYmIGNwdXMubGVuZ3RoID4gMCkge1xuXHRcdFx0b3V0cHV0LnB1c2goYENQVXM6ICAgICAgICAgICAgICR7Y3B1c1swXS5tb2RlbH0gKCR7Y3B1cy5sZW5ndGh9IHggJHtjcHVzWzBdLnNwZWVkfSlgKTtcblx0XHR9XG5cdFx0b3V0cHV0LnB1c2goYE1lbW9yeSAoU3lzdGVtKTogICR7KG9zTGliLnRvdGFsbWVtKCkgLyBCeXRlU2l6ZS5HQikudG9GaXhlZCgyKX1HQiAoJHsob3NMaWIuZnJlZW1lbSgpIC8gQnl0ZVNpemUuR0IpLnRvRml4ZWQoMil9R0IgZnJlZSlgKTtcblx0XHRpZiAoIWlzV2luZG93cykge1xuXHRcdFx0b3V0cHV0LnB1c2goYExvYWQgKGF2Zyk6ICAgICAgICR7b3NMaWIubG9hZGF2ZygpLm1hcChsID0+IE1hdGgucm91bmQobCkpLmpvaW4oJywgJyl9YCk7IC8vIG9ubHkgcHJvdmlkZWQgb24gTGludXgvbWFjT1Ncblx0XHR9XG5cdFx0b3V0cHV0LnB1c2goYFZNOiAgICAgICAgICAgICAgICR7TWF0aC5yb3VuZCgodmlydHVhbE1hY2hpbmVIaW50LnZhbHVlKCkgKiAxMDApKX0lYCk7XG5cdFx0b3V0cHV0LnB1c2goYFNjcmVlbiBSZWFkZXI6ICAgICR7aW5mby5zY3JlZW5SZWFkZXIgPyAneWVzJyA6ICdubyd9YCk7XG5cdFx0b3V0cHV0LnB1c2goYFByb2Nlc3MgQXJndjogICAgICR7aW5mby5tYWluQXJndW1lbnRzLmpvaW4oJyAnKX1gKTtcblx0XHRvdXRwdXQucHVzaChgR1BVIFN0YXR1czogICAgICAgJHt0aGlzLmV4cGFuZEdQVUZlYXR1cmVzKGluZm8uZ3B1RmVhdHVyZVN0YXR1cyl9YCk7XG5cdFx0aWYgKGluZm8uZ3B1TG9nTWVzc2FnZXMgJiYgaW5mby5ncHVMb2dNZXNzYWdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRvdXRwdXQucHVzaChgR1BVIExvZyBNZXNzYWdlczpgKTtcblx0XHRcdGluZm8uZ3B1TG9nTWVzc2FnZXMuZm9yRWFjaChtc2cgPT4ge1xuXHRcdFx0XHRvdXRwdXQucHVzaChgJHttc2cuaGVhZGVyfTogJHttc2cubWVzc2FnZX1gKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBvdXRwdXQuam9pbignXFxuJyk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0UGVyZm9ybWFuY2VJbmZvKGluZm86IElNYWluUHJvY2Vzc0RpYWdub3N0aWNzLCByZW1vdGVEYXRhOiAoSVJlbW90ZURpYWdub3N0aWNJbmZvIHwgSVJlbW90ZURpYWdub3N0aWNFcnJvcilbXSwgb3B0aW9ucz86IHsgc2tpcENhY2hlPzogYm9vbGVhbjsgdW5ib3VuZGVkPzogYm9vbGVhbiB9KTogUHJvbWlzZTxQZXJmb3JtYW5jZUluZm8+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoW2xpc3RQcm9jZXNzZXMoaW5mby5tYWluUElEKSwgdGhpcy5mb3JtYXRXb3Jrc3BhY2VNZXRhZGF0YShpbmZvLCBvcHRpb25zKV0pLnRoZW4oYXN5bmMgcmVzdWx0ID0+IHtcblx0XHRcdGxldCBbcm9vdFByb2Nlc3MsIHdvcmtzcGFjZUluZm9dID0gcmVzdWx0O1xuXHRcdFx0bGV0IHByb2Nlc3NJbmZvID0gdGhpcy5mb3JtYXRQcm9jZXNzTGlzdChpbmZvLCByb290UHJvY2Vzcyk7XG5cblx0XHRcdHJlbW90ZURhdGEuZm9yRWFjaChkaWFnbm9zdGljcyA9PiB7XG5cdFx0XHRcdGlmIChpc1JlbW90ZURpYWdub3N0aWNFcnJvcihkaWFnbm9zdGljcykpIHtcblx0XHRcdFx0XHRwcm9jZXNzSW5mbyArPSBgXFxuJHtkaWFnbm9zdGljcy5lcnJvck1lc3NhZ2V9YDtcblx0XHRcdFx0XHR3b3Jrc3BhY2VJbmZvICs9IGBcXG4ke2RpYWdub3N0aWNzLmVycm9yTWVzc2FnZX1gO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHByb2Nlc3NJbmZvICs9IGBcXG5cXG5SZW1vdGU6ICR7ZGlhZ25vc3RpY3MuaG9zdE5hbWV9YDtcblx0XHRcdFx0XHRpZiAoZGlhZ25vc3RpY3MucHJvY2Vzc2VzKSB7XG5cdFx0XHRcdFx0XHRwcm9jZXNzSW5mbyArPSBgXFxuJHt0aGlzLmZvcm1hdFByb2Nlc3NMaXN0KGluZm8sIGRpYWdub3N0aWNzLnByb2Nlc3Nlcyl9YDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoZGlhZ25vc3RpY3Mud29ya3NwYWNlTWV0YWRhdGEpIHtcblx0XHRcdFx0XHRcdHdvcmtzcGFjZUluZm8gKz0gYFxcbnwgIFJlbW90ZTogJHtkaWFnbm9zdGljcy5ob3N0TmFtZX1gO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgT2JqZWN0LmtleXMoZGlhZ25vc3RpY3Mud29ya3NwYWNlTWV0YWRhdGEpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG1ldGFkYXRhID0gZGlhZ25vc3RpY3Mud29ya3NwYWNlTWV0YWRhdGFbZm9sZGVyXTtcblxuXHRcdFx0XHRcdFx0XHRsZXQgY291bnRNZXNzYWdlID0gYCR7bWV0YWRhdGEuZmlsZUNvdW50fSBmaWxlc2A7XG5cdFx0XHRcdFx0XHRcdGlmIChtZXRhZGF0YS5tYXhGaWxlc1JlYWNoZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRjb3VudE1lc3NhZ2UgPSBgbW9yZSB0aGFuICR7Y291bnRNZXNzYWdlfWA7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHR3b3Jrc3BhY2VJbmZvICs9IGB8ICAgIEZvbGRlciAoJHtmb2xkZXJ9KTogJHtjb3VudE1lc3NhZ2V9YDtcblx0XHRcdFx0XHRcdFx0d29ya3NwYWNlSW5mbyArPSB0aGlzLmZvcm1hdFdvcmtzcGFjZVN0YXRzKG1ldGFkYXRhKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRwcm9jZXNzSW5mbyxcblx0XHRcdFx0d29ya3NwYWNlSW5mb1xuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRTeXN0ZW1JbmZvKGluZm86IElNYWluUHJvY2Vzc0RpYWdub3N0aWNzLCByZW1vdGVEYXRhOiAoSVJlbW90ZURpYWdub3N0aWNJbmZvIHwgSVJlbW90ZURpYWdub3N0aWNFcnJvcilbXSk6IFByb21pc2U8U3lzdGVtSW5mbz4ge1xuXHRcdGNvbnN0IHsgbWVtb3J5LCB2bUhpbnQsIG9zLCBjcHVzIH0gPSBnZXRNYWNoaW5lSW5mbygpO1xuXHRcdGNvbnN0IHN5c3RlbUluZm86IFN5c3RlbUluZm8gPSB7XG5cdFx0XHRvcyxcblx0XHRcdG1lbW9yeSxcblx0XHRcdGNwdXMsXG5cdFx0XHR2bUhpbnQsXG5cdFx0XHRwcm9jZXNzQXJnczogYCR7aW5mby5tYWluQXJndW1lbnRzLmpvaW4oJyAnKX1gLFxuXHRcdFx0Z3B1U3RhdHVzOiBpbmZvLmdwdUZlYXR1cmVTdGF0dXMsXG5cdFx0XHRzY3JlZW5SZWFkZXI6IGAke2luZm8uc2NyZWVuUmVhZGVyID8gJ3llcycgOiAnbm8nfWAsXG5cdFx0XHRyZW1vdGVEYXRhXG5cdFx0fTtcblxuXHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRzeXN0ZW1JbmZvLmxvYWQgPSBgJHtvc0xpYi5sb2FkYXZnKCkubWFwKGwgPT4gTWF0aC5yb3VuZChsKSkuam9pbignLCAnKX1gO1xuXHRcdH1cblxuXHRcdGlmIChpc0xpbnV4KSB7XG5cdFx0XHRzeXN0ZW1JbmZvLmxpbnV4RW52ID0ge1xuXHRcdFx0XHRkZXNrdG9wU2Vzc2lvbjogcHJvY2Vzcy5lbnZbJ0RFU0tUT1BfU0VTU0lPTiddLFxuXHRcdFx0XHR4ZGdTZXNzaW9uRGVza3RvcDogcHJvY2Vzcy5lbnZbJ1hER19TRVNTSU9OX0RFU0tUT1AnXSxcblx0XHRcdFx0eGRnQ3VycmVudERlc2t0b3A6IHByb2Nlc3MuZW52WydYREdfQ1VSUkVOVF9ERVNLVE9QJ10sXG5cdFx0XHRcdHhkZ1Nlc3Npb25UeXBlOiBwcm9jZXNzLmVudlsnWERHX1NFU1NJT05fVFlQRSddXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoc3lzdGVtSW5mbyk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0RGlhZ25vc3RpY3MoaW5mbzogSU1haW5Qcm9jZXNzRGlhZ25vc3RpY3MsIHJlbW90ZURpYWdub3N0aWNzOiAoSVJlbW90ZURpYWdub3N0aWNJbmZvIHwgSVJlbW90ZURpYWdub3N0aWNFcnJvcilbXSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3Qgb3V0cHV0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdHJldHVybiBsaXN0UHJvY2Vzc2VzKGluZm8ubWFpblBJRCkudGhlbihhc3luYyByb290UHJvY2VzcyA9PiB7XG5cblx0XHRcdC8vIEVudmlyb25tZW50IEluZm9cblx0XHRcdG91dHB1dC5wdXNoKCcnKTtcblx0XHRcdG91dHB1dC5wdXNoKHRoaXMuZm9ybWF0RW52aXJvbm1lbnQoaW5mbykpO1xuXG5cdFx0XHQvLyBQcm9jZXNzIExpc3Rcblx0XHRcdG91dHB1dC5wdXNoKCcnKTtcblx0XHRcdG91dHB1dC5wdXNoKHRoaXMuZm9ybWF0UHJvY2Vzc0xpc3QoaW5mbywgcm9vdFByb2Nlc3MpKTtcblxuXHRcdFx0Ly8gV29ya3NwYWNlIFN0YXRzXG5cdFx0XHRpZiAoaW5mby53aW5kb3dzLnNvbWUod2luZG93ID0+IHdpbmRvdy5mb2xkZXJVUklzICYmIHdpbmRvdy5mb2xkZXJVUklzLmxlbmd0aCA+IDAgJiYgIXdpbmRvdy5yZW1vdGVBdXRob3JpdHkpKSB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKCcnKTtcblx0XHRcdFx0b3V0cHV0LnB1c2goJ1dvcmtzcGFjZSBTdGF0czogJyk7XG5cdFx0XHRcdG91dHB1dC5wdXNoKGF3YWl0IHRoaXMuZm9ybWF0V29ya3NwYWNlTWV0YWRhdGEoaW5mbykpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZW1vdGVEaWFnbm9zdGljcy5mb3JFYWNoKGRpYWdub3N0aWNzID0+IHtcblx0XHRcdFx0aWYgKGlzUmVtb3RlRGlhZ25vc3RpY0Vycm9yKGRpYWdub3N0aWNzKSkge1xuXHRcdFx0XHRcdG91dHB1dC5wdXNoKGBcXG4ke2RpYWdub3N0aWNzLmVycm9yTWVzc2FnZX1gKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRvdXRwdXQucHVzaCgnXFxuXFxuJyk7XG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goYFJlbW90ZTogICAgICAgICAgICR7ZGlhZ25vc3RpY3MuaG9zdE5hbWV9YCk7XG5cdFx0XHRcdFx0b3V0cHV0LnB1c2godGhpcy5mb3JtYXRNYWNoaW5lSW5mbyhkaWFnbm9zdGljcy5tYWNoaW5lSW5mbykpO1xuXG5cdFx0XHRcdFx0aWYgKGRpYWdub3N0aWNzLnByb2Nlc3Nlcykge1xuXHRcdFx0XHRcdFx0b3V0cHV0LnB1c2godGhpcy5mb3JtYXRQcm9jZXNzTGlzdChpbmZvLCBkaWFnbm9zdGljcy5wcm9jZXNzZXMpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoZGlhZ25vc3RpY3Mud29ya3NwYWNlTWV0YWRhdGEpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIE9iamVjdC5rZXlzKGRpYWdub3N0aWNzLndvcmtzcGFjZU1ldGFkYXRhKSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBtZXRhZGF0YSA9IGRpYWdub3N0aWNzLndvcmtzcGFjZU1ldGFkYXRhW2ZvbGRlcl07XG5cblx0XHRcdFx0XHRcdFx0bGV0IGNvdW50TWVzc2FnZSA9IGAke21ldGFkYXRhLmZpbGVDb3VudH0gZmlsZXNgO1xuXHRcdFx0XHRcdFx0XHRpZiAobWV0YWRhdGEubWF4RmlsZXNSZWFjaGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y291bnRNZXNzYWdlID0gYG1vcmUgdGhhbiAke2NvdW50TWVzc2FnZX1gO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0b3V0cHV0LnB1c2goYEZvbGRlciAoJHtmb2xkZXJ9KTogJHtjb3VudE1lc3NhZ2V9YCk7XG5cdFx0XHRcdFx0XHRcdG91dHB1dC5wdXNoKHRoaXMuZm9ybWF0V29ya3NwYWNlU3RhdHMobWV0YWRhdGEpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRvdXRwdXQucHVzaCgnJyk7XG5cdFx0XHRvdXRwdXQucHVzaCgnJyk7XG5cblx0XHRcdHJldHVybiBvdXRwdXQuam9pbignXFxuJyk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGZvcm1hdFdvcmtzcGFjZVN0YXRzKHdvcmtzcGFjZVN0YXRzOiBXb3Jrc3BhY2VTdGF0cyk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgb3V0cHV0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGxpbmVMZW5ndGggPSA2MDtcblx0XHRsZXQgY29sID0gMDtcblxuXHRcdGNvbnN0IGFwcGVuZEFuZFdyYXAgPSAobmFtZTogc3RyaW5nLCBjb3VudDogbnVtYmVyKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtID0gYCAke25hbWV9KCR7Y291bnR9KWA7XG5cblx0XHRcdGlmIChjb2wgKyBpdGVtLmxlbmd0aCA+IGxpbmVMZW5ndGgpIHtcblx0XHRcdFx0b3V0cHV0LnB1c2gobGluZSk7XG5cdFx0XHRcdGxpbmUgPSAnfCAgICAgICAgICAgICAgICAgJztcblx0XHRcdFx0Y29sID0gbGluZS5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Y29sICs9IGl0ZW0ubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdFx0bGluZSArPSBpdGVtO1xuXHRcdH07XG5cblx0XHQvLyBGaWxlIFR5cGVzXG5cdFx0Ly8gU2tpcCB0aGUgbm8tZXh0ZW5zaW9uIHNlbnRpbmVsIGZyb20gdGhlIG5hbWVkIGxpc3QgYW5kIGZvbGQgaXRzIGNvdW50IGludG9cblx0XHQvLyB0aGUgXCJvdGhlclwiIGJ1Y2tldCBzbyB0b3RhbHMgcmVjb25jaWxlIHdpdGggZmlsZUNvdW50LlxuXHRcdGxldCBsaW5lID0gJ3wgICAgICBGaWxlIHR5cGVzOic7XG5cdFx0Y29uc3QgbWF4U2hvd24gPSAxMDtcblx0XHRjb25zdCBuYW1lZFR5cGVzID0gd29ya3NwYWNlU3RhdHMuZmlsZVR5cGVzLmZpbHRlcih0ID0+IHQubmFtZSAhPT0gTk9fRVhUX0tFWSk7XG5cdFx0Y29uc3Qgbm9FeHRDb3VudCA9IHdvcmtzcGFjZVN0YXRzLmZpbGVUeXBlc1xuXHRcdFx0LmZpbHRlcih0ID0+IHQubmFtZSA9PT0gTk9fRVhUX0tFWSlcblx0XHRcdC5yZWR1Y2UoKHN1bSwgdCkgPT4gc3VtICsgdC5jb3VudCwgMCk7XG5cdFx0Y29uc3QgbWF4ID0gTWF0aC5taW4obmFtZWRUeXBlcy5sZW5ndGgsIG1heFNob3duKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1heDsgaSsrKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gbmFtZWRUeXBlc1tpXTtcblx0XHRcdGFwcGVuZEFuZFdyYXAoaXRlbS5uYW1lLCBpdGVtLmNvdW50KTtcblx0XHR9XG5cdFx0bGV0IG90aGVyQ291bnQgPSBub0V4dENvdW50O1xuXHRcdGZvciAobGV0IGkgPSBtYXg7IGkgPCBuYW1lZFR5cGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRvdGhlckNvdW50ICs9IG5hbWVkVHlwZXNbaV0uY291bnQ7XG5cdFx0fVxuXHRcdGlmIChvdGhlckNvdW50ID4gMCkge1xuXHRcdFx0YXBwZW5kQW5kV3JhcCgnb3RoZXInLCBvdGhlckNvdW50KTtcblx0XHR9XG5cdFx0b3V0cHV0LnB1c2gobGluZSk7XG5cblx0XHQvLyBDb25mIEZpbGVzXG5cdFx0aWYgKHdvcmtzcGFjZVN0YXRzLmNvbmZpZ0ZpbGVzLmxlbmd0aCA+PSAwKSB7XG5cdFx0XHRsaW5lID0gJ3wgICAgICBDb25mIGZpbGVzOic7XG5cdFx0XHRjb2wgPSAwO1xuXHRcdFx0d29ya3NwYWNlU3RhdHMuY29uZmlnRmlsZXMuZm9yRWFjaCgoaXRlbSkgPT4ge1xuXHRcdFx0XHRhcHBlbmRBbmRXcmFwKGl0ZW0ubmFtZSwgaXRlbS5jb3VudCk7XG5cdFx0XHR9KTtcblx0XHRcdG91dHB1dC5wdXNoKGxpbmUpO1xuXHRcdH1cblxuXHRcdGlmICh3b3Jrc3BhY2VTdGF0cy5sYXVuY2hDb25maWdGaWxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRsZXQgbGluZSA9ICd8ICAgICAgTGF1bmNoIENvbmZpZ3M6Jztcblx0XHRcdHdvcmtzcGFjZVN0YXRzLmxhdW5jaENvbmZpZ0ZpbGVzLmZvckVhY2goZWFjaCA9PiB7XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSBlYWNoLmNvdW50ID4gMSA/IGAgJHtlYWNoLm5hbWV9KCR7ZWFjaC5jb3VudH0pYCA6IGAgJHtlYWNoLm5hbWV9YDtcblx0XHRcdFx0bGluZSArPSBpdGVtO1xuXHRcdFx0fSk7XG5cdFx0XHRvdXRwdXQucHVzaChsaW5lKTtcblx0XHR9XG5cdFx0cmV0dXJuIG91dHB1dC5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHByaXZhdGUgZXhwYW5kR1BVRmVhdHVyZXMoZ3B1RmVhdHVyZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBzdHJpbmcge1xuXHRcdGNvbnN0IGxvbmdlc3RGZWF0dXJlTmFtZSA9IE1hdGgubWF4KC4uLk9iamVjdC5rZXlzKGdwdUZlYXR1cmVzKS5tYXAoZmVhdHVyZSA9PiBmZWF0dXJlLmxlbmd0aCkpO1xuXHRcdC8vIE1ha2UgY29sdW1ucyBhbGlnbmVkIGJ5IGFkZGluZyBzcGFjZXMgYWZ0ZXIgZmVhdHVyZSBuYW1lXG5cdFx0cmV0dXJuIE9iamVjdC5rZXlzKGdwdUZlYXR1cmVzKS5tYXAoZmVhdHVyZSA9PiBgJHtmZWF0dXJlfTogICR7JyAnLnJlcGVhdChsb25nZXN0RmVhdHVyZU5hbWUgLSBmZWF0dXJlLmxlbmd0aCl9ICAke2dwdUZlYXR1cmVzW2ZlYXR1cmVdfWApLmpvaW4oJ1xcbiAgICAgICAgICAgICAgICAgICcpO1xuXHR9XG5cblx0cHJpdmF0ZSBmb3JtYXRXb3Jrc3BhY2VNZXRhZGF0YShpbmZvOiBJTWFpblByb2Nlc3NEaWFnbm9zdGljcywgb3B0aW9ucz86IHsgc2tpcENhY2hlPzogYm9vbGVhbjsgdW5ib3VuZGVkPzogYm9vbGVhbiB9KTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBvdXRwdXQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3Qgd29ya3NwYWNlU3RhdFByb21pc2VzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblxuXHRcdGluZm8ud2luZG93cy5mb3JFYWNoKHdpbmRvdyA9PiB7XG5cdFx0XHRpZiAod2luZG93LmZvbGRlclVSSXMubGVuZ3RoID09PSAwIHx8ICEhd2luZG93LnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdG91dHB1dC5wdXNoKGB8ICBXaW5kb3cgKCR7d2luZG93LnRpdGxlfSlgKTtcblxuXHRcdFx0d2luZG93LmZvbGRlclVSSXMuZm9yRWFjaCh1cmlDb21wb25lbnRzID0+IHtcblx0XHRcdFx0Y29uc3QgZm9sZGVyVXJpID0gVVJJLnJldml2ZSh1cmlDb21wb25lbnRzKTtcblx0XHRcdFx0aWYgKGZvbGRlclVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRcdGNvbnN0IGZvbGRlciA9IGZvbGRlclVyaS5mc1BhdGg7XG5cdFx0XHRcdFx0d29ya3NwYWNlU3RhdFByb21pc2VzLnB1c2goY29sbGVjdFdvcmtzcGFjZVN0YXRzKGZvbGRlciwgWydub2RlX21vZHVsZXMnLCAnLmdpdCddLCBvcHRpb25zKS50aGVuKHN0YXRzID0+IHtcblx0XHRcdFx0XHRcdGxldCBjb3VudE1lc3NhZ2UgPSBgJHtzdGF0cy5maWxlQ291bnR9IGZpbGVzYDtcblx0XHRcdFx0XHRcdGlmIChzdGF0cy5tYXhGaWxlc1JlYWNoZWQpIHtcblx0XHRcdFx0XHRcdFx0Y291bnRNZXNzYWdlID0gYG1vcmUgdGhhbiAke2NvdW50TWVzc2FnZX1gO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0b3V0cHV0LnB1c2goYHwgICAgRm9sZGVyICgke2Jhc2VuYW1lKGZvbGRlcil9KTogJHtjb3VudE1lc3NhZ2V9YCk7XG5cdFx0XHRcdFx0XHRvdXRwdXQucHVzaCh0aGlzLmZvcm1hdFdvcmtzcGFjZVN0YXRzKHN0YXRzKSk7XG5cblx0XHRcdFx0XHR9KS5jYXRjaChlcnJvciA9PiB7XG5cdFx0XHRcdFx0XHRvdXRwdXQucHVzaChgfCAgICAgIEVycm9yOiBVbmFibGUgdG8gY29sbGVjdCB3b3Jrc3BhY2Ugc3RhdHMgZm9yIGZvbGRlciAke2ZvbGRlcn0gKCR7ZXJyb3IudG9TdHJpbmcoKX0pYCk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG91dHB1dC5wdXNoKGB8ICAgIEZvbGRlciAoJHtmb2xkZXJVcmkudG9TdHJpbmcoKX0pOiBXb3Jrc3BhY2Ugc3RhdHMgbm90IGF2YWlsYWJsZS5gKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwod29ya3NwYWNlU3RhdFByb21pc2VzKVxuXHRcdFx0LnRoZW4oXyA9PiBvdXRwdXQuam9pbignXFxuJykpXG5cdFx0XHQuY2F0Y2goZSA9PiBgVW5hYmxlIHRvIGNvbGxlY3Qgd29ya3NwYWNlIHN0YXRzOiAke2V9YCk7XG5cdH1cblxuXHRwcml2YXRlIGZvcm1hdFByb2Nlc3NMaXN0KGluZm86IElNYWluUHJvY2Vzc0RpYWdub3N0aWNzLCByb290UHJvY2VzczogUHJvY2Vzc0l0ZW0pOiBzdHJpbmcge1xuXHRcdGNvbnN0IG1hcFByb2Nlc3NUb05hbWUgPSBuZXcgTWFwPG51bWJlciwgc3RyaW5nPigpO1xuXHRcdGluZm8ud2luZG93cy5mb3JFYWNoKHdpbmRvdyA9PiBtYXBQcm9jZXNzVG9OYW1lLnNldCh3aW5kb3cucGlkLCBgd2luZG93IFske3dpbmRvdy5pZH1dICgke3dpbmRvdy50aXRsZX0pYCkpO1xuXHRcdGluZm8ucGlkVG9OYW1lcy5mb3JFYWNoKCh7IHBpZCwgbmFtZSB9KSA9PiBtYXBQcm9jZXNzVG9OYW1lLnNldChwaWQsIG5hbWUpKTtcblxuXHRcdGNvbnN0IG91dHB1dDogc3RyaW5nW10gPSBbXTtcblxuXHRcdG91dHB1dC5wdXNoKCdDUFUgJVxcdE1lbSBNQlxcdCAgIFBJRFxcdFByb2Nlc3MnKTtcblxuXHRcdGlmIChyb290UHJvY2Vzcykge1xuXHRcdFx0dGhpcy5mb3JtYXRQcm9jZXNzSXRlbShpbmZvLm1haW5QSUQsIG1hcFByb2Nlc3NUb05hbWUsIG91dHB1dCwgcm9vdFByb2Nlc3MsIDApO1xuXHRcdH1cblxuXHRcdHJldHVybiBvdXRwdXQuam9pbignXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIGZvcm1hdFByb2Nlc3NJdGVtKG1haW5QaWQ6IG51bWJlciwgbWFwUHJvY2Vzc1RvTmFtZTogTWFwPG51bWJlciwgc3RyaW5nPiwgb3V0cHV0OiBzdHJpbmdbXSwgaXRlbTogUHJvY2Vzc0l0ZW0sIGluZGVudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgaXNSb290ID0gKGluZGVudCA9PT0gMCk7XG5cblx0XHQvLyBGb3JtYXQgbmFtZSB3aXRoIGluZGVudFxuXHRcdGxldCBuYW1lOiBzdHJpbmc7XG5cdFx0aWYgKGlzUm9vdCkge1xuXHRcdFx0bmFtZSA9IGl0ZW0ucGlkID09PSBtYWluUGlkID8gdGhpcy5wcm9kdWN0U2VydmljZS5hcHBsaWNhdGlvbk5hbWUgOiAncmVtb3RlLXNlcnZlcic7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChtYXBQcm9jZXNzVG9OYW1lLmhhcyhpdGVtLnBpZCkpIHtcblx0XHRcdFx0bmFtZSA9IG1hcFByb2Nlc3NUb05hbWUuZ2V0KGl0ZW0ucGlkKSE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRuYW1lID0gYCR7JyAgJy5yZXBlYXQoaW5kZW50KX0gJHtpdGVtLm5hbWV9YDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtZW1vcnkgPSBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInID8gaXRlbS5tZW0gOiAob3NMaWIudG90YWxtZW0oKSAqIChpdGVtLm1lbSAvIDEwMCkpO1xuXHRcdG91dHB1dC5wdXNoKGAke2l0ZW0ubG9hZC50b0ZpeGVkKDApLnBhZFN0YXJ0KDUsICcgJyl9XFx0JHsobWVtb3J5IC8gQnl0ZVNpemUuTUIpLnRvRml4ZWQoMCkucGFkU3RhcnQoNiwgJyAnKX1cXHQke2l0ZW0ucGlkLnRvRml4ZWQoMCkucGFkU3RhcnQoNiwgJyAnKX1cXHQke25hbWV9YCk7XG5cblx0XHQvLyBSZWN1cnNlIGludG8gY2hpbGRyZW4gaWYgYW55XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoaXRlbS5jaGlsZHJlbikpIHtcblx0XHRcdGl0ZW0uY2hpbGRyZW4uZm9yRWFjaChjaGlsZCA9PiB0aGlzLmZvcm1hdFByb2Nlc3NJdGVtKG1haW5QaWQsIG1hcFByb2Nlc3NUb05hbWUsIG91dHB1dCwgY2hpbGQsIGluZGVudCArIDEpKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0V29ya3NwYWNlRmlsZUV4dGVuc2lvbnMod29ya3NwYWNlOiBJV29ya3NwYWNlKTogUHJvbWlzZTx7IGV4dGVuc2lvbnM6IHN0cmluZ1tdIH0+IHtcblx0XHRjb25zdCBpdGVtcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgeyB1cmkgfSBvZiB3b3Jrc3BhY2UuZm9sZGVycykge1xuXHRcdFx0Y29uc3QgZm9sZGVyVXJpID0gVVJJLnJldml2ZSh1cmkpO1xuXHRcdFx0aWYgKGZvbGRlclVyaS5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZvbGRlciA9IGZvbGRlclVyaS5mc1BhdGg7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdGF0cyA9IGF3YWl0IGNvbGxlY3RXb3Jrc3BhY2VTdGF0cyhmb2xkZXIsIFsnbm9kZV9tb2R1bGVzJywgJy5naXQnXSk7XG5cdFx0XHRcdHN0YXRzLmZpbGVUeXBlcy5mb3JFYWNoKGl0ZW0gPT4ge1xuXHRcdFx0XHRcdGlmIChpdGVtLm5hbWUgIT09IE5PX0VYVF9LRVkpIHtcblx0XHRcdFx0XHRcdGl0ZW1zLmFkZChpdGVtLm5hbWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9IGNhdGNoIHsgfVxuXHRcdH1cblx0XHRyZXR1cm4geyBleHRlbnNpb25zOiBbLi4uaXRlbXNdIH07XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVwb3J0V29ya3NwYWNlU3RhdHMod29ya3NwYWNlOiBJV29ya3NwYWNlSW5mb3JtYXRpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IHsgdXJpIH0gb2Ygd29ya3NwYWNlLmZvbGRlcnMpIHtcblx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IFVSSS5yZXZpdmUodXJpKTtcblx0XHRcdGlmIChmb2xkZXJVcmkuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZvbGRlciA9IGZvbGRlclVyaS5mc1BhdGg7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdGF0cyA9IGF3YWl0IGNvbGxlY3RXb3Jrc3BhY2VTdGF0cyhmb2xkZXIsIFsnbm9kZV9tb2R1bGVzJywgJy5naXQnXSk7XG5cdFx0XHRcdHR5cGUgV29ya3NwYWNlU3RhdHNDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0XHRvd25lcjogJ2xyYW1vczE1Jztcblx0XHRcdFx0XHRjb21tZW50OiAnTWV0YWRhdGEgcmVsYXRlZCB0byB0aGUgd29ya3NwYWNlJztcblx0XHRcdFx0XHQnd29ya3NwYWNlLmlkJzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0EgVVVJRCBnaXZlbiB0byBhIHdvcmtzcGFjZSB0byBpZGVudGlmeSBpdC4nIH07XG5cdFx0XHRcdFx0cmVuZGVyZXJTZXNzaW9uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgSUQgb2YgdGhlIHNlc3Npb24nIH07XG5cdFx0XHRcdH07XG5cdFx0XHRcdHR5cGUgV29ya3NwYWNlU3RhdHNFdmVudCA9IHtcblx0XHRcdFx0XHQnd29ya3NwYWNlLmlkJzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHJlbmRlcmVyU2Vzc2lvbklkOiBzdHJpbmc7XG5cdFx0XHRcdH07XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtzcGFjZVN0YXRzRXZlbnQsIFdvcmtzcGFjZVN0YXRzQ2xhc3NpZmljYXRpb24+KCd3b3Jrc3BhY2Uuc3RhdHMnLCB7XG5cdFx0XHRcdFx0J3dvcmtzcGFjZS5pZCc6IHdvcmtzcGFjZS50ZWxlbWV0cnlJZCxcblx0XHRcdFx0XHRyZW5kZXJlclNlc3Npb25JZDogd29ya3NwYWNlLnJlbmRlcmVyU2Vzc2lvbklkXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0eXBlIFdvcmtzcGFjZVN0YXRzRmlsZUNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdG93bmVyOiAnbHJhbW9zMTUnO1xuXHRcdFx0XHRcdGNvbW1lbnQ6ICdIZWxwcyB1cyBnYWluIGluc2lnaHRzIGludG8gd2hhdCB0eXBlIG9mIGZpbGVzIGFyZSBiZWluZyB1c2VkIGluIGEgd29ya3NwYWNlJztcblx0XHRcdFx0XHRyZW5kZXJlclNlc3Npb25JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBJRCBvZiB0aGUgc2Vzc2lvbi4nIH07XG5cdFx0XHRcdFx0dHlwZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB0eXBlIG9mIGZpbGUnIH07XG5cdFx0XHRcdFx0Y291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdIb3cgbWFueSB0eXBlcyBvZiB0aGF0IGZpbGUgYXJlIHByZXNlbnQnIH07XG5cdFx0XHRcdH07XG5cdFx0XHRcdHR5cGUgV29ya3NwYWNlU3RhdHNGaWxlRXZlbnQgPSB7XG5cdFx0XHRcdFx0cmVuZGVyZXJTZXNzaW9uSWQ6IHN0cmluZztcblx0XHRcdFx0XHR0eXBlOiBzdHJpbmc7XG5cdFx0XHRcdFx0Y291bnQ6IG51bWJlcjtcblx0XHRcdFx0fTtcblx0XHRcdFx0c3RhdHMuZmlsZVR5cGVzLmZvckVhY2goZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUubmFtZSA9PT0gTk9fRVhUX0tFWSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3Jrc3BhY2VTdGF0c0ZpbGVFdmVudCwgV29ya3NwYWNlU3RhdHNGaWxlQ2xhc3NpZmljYXRpb24+KCd3b3Jrc3BhY2Uuc3RhdHMuZmlsZScsIHtcblx0XHRcdFx0XHRcdHJlbmRlcmVyU2Vzc2lvbklkOiB3b3Jrc3BhY2UucmVuZGVyZXJTZXNzaW9uSWQsXG5cdFx0XHRcdFx0XHR0eXBlOiBlLm5hbWUsXG5cdFx0XHRcdFx0XHRjb3VudDogZS5jb3VudFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0c3RhdHMubGF1bmNoQ29uZmlnRmlsZXMuZm9yRWFjaChlID0+IHtcblx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3Jrc3BhY2VTdGF0c0ZpbGVFdmVudCwgV29ya3NwYWNlU3RhdHNGaWxlQ2xhc3NpZmljYXRpb24+KCd3b3Jrc3BhY2Uuc3RhdHMubGF1bmNoQ29uZmlnRmlsZScsIHtcblx0XHRcdFx0XHRcdHJlbmRlcmVyU2Vzc2lvbklkOiB3b3Jrc3BhY2UucmVuZGVyZXJTZXNzaW9uSWQsXG5cdFx0XHRcdFx0XHR0eXBlOiBlLm5hbWUsXG5cdFx0XHRcdFx0XHRjb3VudDogZS5jb3VudFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0c3RhdHMuY29uZmlnRmlsZXMuZm9yRWFjaChlID0+IHtcblx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3Jrc3BhY2VTdGF0c0ZpbGVFdmVudCwgV29ya3NwYWNlU3RhdHNGaWxlQ2xhc3NpZmljYXRpb24+KCd3b3Jrc3BhY2Uuc3RhdHMuY29uZmlnRmlsZXMnLCB7XG5cdFx0XHRcdFx0XHRyZW5kZXJlclNlc3Npb25JZDogd29ya3NwYWNlLnJlbmRlcmVyU2Vzc2lvbklkLFxuXHRcdFx0XHRcdFx0dHlwZTogZS5uYW1lLFxuXHRcdFx0XHRcdFx0Y291bnQ6IGUuY291bnRcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gV29ya3NwYWNlIHN0YXRzIG1ldGFkYXRhXG5cdFx0XHRcdHR5cGUgV29ya3NwYWNlU3RhdHNNZXRhZGF0YUNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdG93bmVyOiAnanJpZWtlbic7XG5cdFx0XHRcdFx0Y29tbWVudDogJ01ldGFkYXRhIGFib3V0IHdvcmtzcGFjZSBtZXRhZGF0YSBjb2xsZWN0aW9uJztcblx0XHRcdFx0XHRkdXJhdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0hvdyBkaWQgaXQgdGFrZSB0byBtYWtlIHdvcmtzcGFjZSBzdGF0cycgfTtcblx0XHRcdFx0XHRyZWFjaGVkTGltaXQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdEaWQgbWFraW5nIHdvcmtzcGFjZSBzdGF0cyByZWFjaCBpdHMgbGltaXRzJyB9O1xuXHRcdFx0XHRcdGZpbGVDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0hvdyBtYW55IGZpbGVzIGRpZCB3b3Jrc3BhY2Ugc3RhdHMgZGlzY292ZXInIH07XG5cdFx0XHRcdFx0cmVhZGRpckNvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnSG93IG1hbnkgcmVhZGRpciBjYWxsIHdlcmUgbmVlZGVkJyB9O1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR0eXBlIFdvcmtzcGFjZVN0YXRzTWV0YWRhdGEgPSB7XG5cdFx0XHRcdFx0ZHVyYXRpb246IG51bWJlcjtcblx0XHRcdFx0XHRyZWFjaGVkTGltaXQ6IGJvb2xlYW47XG5cdFx0XHRcdFx0ZmlsZUNvdW50OiBudW1iZXI7XG5cdFx0XHRcdFx0cmVhZGRpckNvdW50OiBudW1iZXI7XG5cdFx0XHRcdH07XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtzcGFjZVN0YXRzTWV0YWRhdGEsIFdvcmtzcGFjZVN0YXRzTWV0YWRhdGFDbGFzc2lmaWNhdGlvbj4oJ3dvcmtzcGFjZS5zdGF0cy5tZXRhZGF0YScsIHsgZHVyYXRpb246IHN0YXRzLnRvdGFsU2NhblRpbWUsIHJlYWNoZWRMaW1pdDogc3RhdHMubWF4RmlsZXNSZWFjaGVkLCBmaWxlQ291bnQ6IHN0YXRzLmZpbGVDb3VudCwgcmVhZGRpckNvdW50OiBzdGF0cy50b3RhbFJlYWRkaXJDb3VudCB9KTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBSZXBvcnQgbm90aGluZyBpZiBjb2xsZWN0aW5nIG1ldGFkYXRhIGZhaWxzLlxuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFFBQVE7QUFDcEIsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYSxhQUF5QjtBQUMvQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxVQUFVLFlBQVk7QUFDL0IsU0FBUyxTQUFTLGlCQUFpQjtBQUVuQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBa0IsWUFBWSxXQUFXO0FBQ3pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQW9ILCtCQUFzSDtBQUMxTyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQVNsQyxNQUFNLHNCQUFzQixvQkFBSSxJQUFxQztBQUdyRSxNQUFNLGFBQWE7QUFFbkIsZUFBc0Isc0JBQXNCLFFBQWdCLFFBQWtCLFNBQWlGO0FBRzlKLFFBQU0sV0FBVyxHQUFHLE1BQU0sS0FBSyxPQUFPLEtBQUssR0FBRyxDQUFDLEtBQUssU0FBUyxZQUFZLGNBQWMsU0FBUztBQUNoRyxNQUFJ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
