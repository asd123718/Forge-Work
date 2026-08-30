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
import { equals as arraysEqual } from "../../../../base/common/arrays.js";
import { assertNever } from "../../../../base/common/assert.js";
import { Throttler } from "../../../../base/common/async.js";
import * as glob from "../../../../base/common/glob.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { equals as objectsEqual } from "../../../../base/common/objects.js";
import { autorun, autorunDelta, derivedOpts } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { FileSystemProviderCapabilities, IFileService } from "../../../../platform/files/common/files.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IDebugService } from "../../debug/common/debug.js";
import { IMcpRegistry } from "./mcpRegistryTypes.js";
import { McpServerTransportType } from "./mcpTypes.js";
let McpDevModeServerAttache = class extends Disposable {
  constructor(server, fwdRef, registry, fileService, workspaceContextService) {
    super();
    const workspaceFolder = server.readDefinitions().map(({ collection }) => collection?.presentation?.origin && workspaceContextService.getWorkspaceFolder(collection.presentation?.origin)?.uri);
    const restart = async () => {
      const lastDebugged = fwdRef.lastModeDebugged;
      await server.stop();
      await server.start({ debug: lastDebugged });
    };
    let didAutoStart = false;
    this._register(autorun((reader) => {
      const defs = server.readDefinitions().read(reader);
      if (!defs.collection || !defs.server || !defs.server.devMode) {
        didAutoStart = false;
        return;
      }
      if (didAutoStart) {
        return;
      }
      const delegates = registry.delegates.read(reader);
      if (!delegates.some((d) => d.canStart(defs.collection, defs.server))) {
        return;
      }
      server.start();
      didAutoStart = true;
    }));
    const debugMode = server.readDefinitions().map((d) => !!d.server?.devMode?.debug);
    this._register(autorunDelta(debugMode, ({ lastValue, newValue }) => {
      if (!!newValue && !objectsEqual(lastValue, newValue)) {
        restart();
      }
    }));
    const watchObs = derivedOpts({ equalsFn: arraysEqual }, (reader) => {
      const def = server.readDefinitions().read(reader);
      const watch = def.server?.devMode?.watch;
      return typeof watch === "string" ? [watch] : watch;
    });
    const restartScheduler = this._register(new Throttler());
    this._register(autorun((reader) => {
      const pattern = watchObs.read(reader);
      const wf = workspaceFolder.read(reader);
      if (!pattern || !wf) {
        return;
      }
      const includes = pattern.filter((p) => !p.startsWith("!"));
      const excludes = pattern.filter((p) => p.startsWith("!")).map((p) => p.slice(1));
      reader.store.add(fileService.watch(wf, { includes, excludes, recursive: true }));
      const ignoreCase = !fileService.hasCapability(wf, FileSystemProviderCapabilities.PathCaseSensitive);
      const includeParse = includes.map((p) => glob.parse({ base: wf.fsPath, pattern: p }, { ignoreCase }));
      const excludeParse = excludes.map((p) => glob.parse({ base: wf.fsPath, pattern: p }, { ignoreCase }));
      reader.store.add(fileService.onDidFilesChange((e) => {
        for (const change of [e.rawAdded, e.rawDeleted, e.rawUpdated]) {
          for (const uri of change) {
            if (includeParse.some((i) => i(uri.fsPath)) && !excludeParse.some((e2) => e2(uri.fsPath))) {
              restartScheduler.queue(restart);
              break;
            }
          }
        }
      }));
    }));
  }
};
McpDevModeServerAttache = __decorateClass([
  __decorateParam(2, IMcpRegistry),
  __decorateParam(3, IFileService),
  __decorateParam(4, IWorkspaceContextService)
], McpDevModeServerAttache);
const IMcpDevModeDebugging = createDecorator("mcpDevModeDebugging");
const DEBUG_HOST = "127.0.0.1";
let McpDevModeDebugging = class {
  constructor(_debugService, _commandService) {
    this._debugService = _debugService;
    this._commandService = _commandService;
  }
  async transform(definition, launch) {
    if (!definition.devMode?.debug || launch.type !== McpServerTransportType.Stdio) {
      return launch;
    }
    const port = await this.getDebugPort();
    const name = `MCP: ${definition.label}`;
    const options = { startedByUser: false, suppressDebugView: true };
    const commonConfig = {
      internalConsoleOptions: "neverOpen",
      suppressMultipleSessionWarning: true
    };
    switch (definition.devMode.debug.type) {
      case "node": {
        if (!/node[0-9]*$/.test(launch.command)) {
          throw new Error(localize("mcp.debug.nodeBinReq", 'MCP server must be launched with the "node" executable to enable debugging, but was launched with "{0}"', launch.command));
        }
        this._debugService.startDebugging(void 0, {
          type: "pwa-node",
          request: "attach",
          name,
          port,
          host: DEBUG_HOST,
          timeout: 3e4,
          continueOnAttach: true,
          ...commonConfig
        }, options);
        return { ...launch, args: [`--inspect-brk=${DEBUG_HOST}:${port}`, ...launch.args] };
      }
      case "debugpy": {
        if (!/python[0-9.]*$/.test(launch.command)) {
          throw new Error(localize("mcp.debug.pythonBinReq", 'MCP server must be launched with the "python" executable to enable debugging, but was launched with "{0}"', launch.command));
        }
        let command;
        let args = ["--wait-for-client", "--connect", `${DEBUG_HOST}:${port}`, ...launch.args];
        if (definition.devMode.debug.debugpyPath) {
          command = definition.devMode.debug.debugpyPath;
        } else {
          try {
            const debugPyPath = await this._commandService.executeCommand("python.getDebugpyPackagePath");
            if (debugPyPath) {
              command = launch.command;
              args = [debugPyPath, ...args];
            }
          } catch {
          }
        }
        if (!command) {
          command = "debugpy";
        }
        await Promise.race([
          // eslint-disable-next-line local/code-no-dangerous-type-assertions
          this._debugService.startDebugging(void 0, {
            type: "debugpy",
            name,
            request: "attach",
            listen: {
              host: DEBUG_HOST,
              port
            },
            ...commonConfig
          }, options),
          this.ensureListeningOnPort(port)
        ]);
        return { ...launch, command, args };
      }
      default:
        assertNever(definition.devMode.debug, `Unknown debug type ${JSON.stringify(definition.devMode.debug)}`);
    }
  }
  ensureListeningOnPort(port) {
    return Promise.resolve();
  }
  getDebugPort() {
    return Promise.resolve(9230);
  }
};
McpDevModeDebugging = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, ICommandService)
], McpDevModeDebugging);
export {
  IMcpDevModeDebugging,
  McpDevModeDebugging,
  McpDevModeServerAttache
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxtY3BEZXZNb2RlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZXF1YWxzIGFzIGFycmF5c0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IFRocm90dGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCAqIGFzIGdsb2IgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVxdWFscyBhcyBvYmplY3RzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGF1dG9ydW5EZWx0YSwgZGVyaXZlZE9wdHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMsIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElDb25maWcsIElEZWJ1Z1NlcnZpY2UsIElEZWJ1Z1Nlc3Npb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vZGVidWcvY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IElNY3BSZWdpc3RyeSB9IGZyb20gJy4vbWNwUmVnaXN0cnlUeXBlcy5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmVyLCBNY3BTZXJ2ZXJEZWZpbml0aW9uLCBNY3BTZXJ2ZXJMYXVuY2gsIE1jcFNlcnZlclRyYW5zcG9ydFR5cGUgfSBmcm9tICcuL21jcFR5cGVzLmpzJztcblxuZXhwb3J0IGNsYXNzIE1jcERldk1vZGVTZXJ2ZXJBdHRhY2hlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHNlcnZlcjogSU1jcFNlcnZlcixcblx0XHRmd2RSZWY6IHsgbGFzdE1vZGVEZWJ1Z2dlZDogYm9vbGVhbiB9LFxuXHRcdEBJTWNwUmVnaXN0cnkgcmVnaXN0cnk6IElNY3BSZWdpc3RyeSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gc2VydmVyLnJlYWREZWZpbml0aW9ucygpLm1hcCgoeyBjb2xsZWN0aW9uIH0pID0+IGNvbGxlY3Rpb24/LnByZXNlbnRhdGlvbj8ub3JpZ2luICYmXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIoY29sbGVjdGlvbi5wcmVzZW50YXRpb24/Lm9yaWdpbik/LnVyaSk7XG5cblx0XHRjb25zdCByZXN0YXJ0ID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGFzdERlYnVnZ2VkID0gZndkUmVmLmxhc3RNb2RlRGVidWdnZWQ7XG5cdFx0XHRhd2FpdCBzZXJ2ZXIuc3RvcCgpO1xuXHRcdFx0YXdhaXQgc2VydmVyLnN0YXJ0KHsgZGVidWc6IGxhc3REZWJ1Z2dlZCB9KTtcblx0XHR9O1xuXG5cdFx0Ly8gMS4gQXV0by1zdGFydCB0aGUgc2VydmVyLCByZXN0YXJ0IGlmIGVudGVyaW5nIGRlYnVnIG1vZGVcblx0XHRsZXQgZGlkQXV0b1N0YXJ0ID0gZmFsc2U7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZGVmcyA9IHNlcnZlci5yZWFkRGVmaW5pdGlvbnMoKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWRlZnMuY29sbGVjdGlvbiB8fCAhZGVmcy5zZXJ2ZXIgfHwgIWRlZnMuc2VydmVyLmRldk1vZGUpIHtcblx0XHRcdFx0ZGlkQXV0b1N0YXJ0ID0gZmFsc2U7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gZG9uJ3Qga2VlcCB0cnlpbmcgdG8gc3RhcnQgdGhlIHNlcnZlciB1bmxlc3MgaXQncyBhIG5ldyBzZXJ2ZXIgb3IgZGV2bW9kZSBpcyBuZXdseSB0dXJuZWQgb25cblx0XHRcdGlmIChkaWRBdXRvU3RhcnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZWxlZ2F0ZXMgPSByZWdpc3RyeS5kZWxlZ2F0ZXMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFkZWxlZ2F0ZXMuc29tZShkID0+IGQuY2FuU3RhcnQoZGVmcy5jb2xsZWN0aW9uISwgZGVmcy5zZXJ2ZXIhKSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRzZXJ2ZXIuc3RhcnQoKTtcblx0XHRcdGRpZEF1dG9TdGFydCA9IHRydWU7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZGVidWdNb2RlID0gc2VydmVyLnJlYWREZWZpbml0aW9ucygpLm1hcChkID0+ICEhZC5zZXJ2ZXI/LmRldk1vZGU/LmRlYnVnKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuRGVsdGEoZGVidWdNb2RlLCAoeyBsYXN0VmFsdWUsIG5ld1ZhbHVlIH0pID0+IHtcblx0XHRcdGlmICghIW5ld1ZhbHVlICYmICFvYmplY3RzRXF1YWwobGFzdFZhbHVlLCBuZXdWYWx1ZSkpIHtcblx0XHRcdFx0cmVzdGFydCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIDIuIFdhdGNoIGZvciBmaWxlIGNoYW5nZXNcblx0XHRjb25zdCB3YXRjaE9icyA9IGRlcml2ZWRPcHRzPHN0cmluZ1tdIHwgdW5kZWZpbmVkPih7IGVxdWFsc0ZuOiBhcnJheXNFcXVhbCB9LCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZGVmID0gc2VydmVyLnJlYWREZWZpbml0aW9ucygpLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHdhdGNoID0gZGVmLnNlcnZlcj8uZGV2TW9kZT8ud2F0Y2g7XG5cdFx0XHRyZXR1cm4gdHlwZW9mIHdhdGNoID09PSAnc3RyaW5nJyA/IFt3YXRjaF0gOiB3YXRjaDtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3RhcnRTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVyKCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcGF0dGVybiA9IHdhdGNoT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHdmID0gd29ya3NwYWNlRm9sZGVyLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghcGF0dGVybiB8fCAhd2YpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpbmNsdWRlcyA9IHBhdHRlcm4uZmlsdGVyKHAgPT4gIXAuc3RhcnRzV2l0aCgnIScpKTtcblx0XHRcdGNvbnN0IGV4Y2x1ZGVzID0gcGF0dGVybi5maWx0ZXIocCA9PiBwLnN0YXJ0c1dpdGgoJyEnKSkubWFwKHAgPT4gcC5zbGljZSgxKSk7XG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKGZpbGVTZXJ2aWNlLndhdGNoKHdmLCB7IGluY2x1ZGVzLCBleGNsdWRlcywgcmVjdXJzaXZlOiB0cnVlIH0pKTtcblxuXHRcdFx0Y29uc3QgaWdub3JlQ2FzZSA9ICFmaWxlU2VydmljZS5oYXNDYXBhYmlsaXR5KHdmLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUGF0aENhc2VTZW5zaXRpdmUpO1xuXHRcdFx0Y29uc3QgaW5jbHVkZVBhcnNlID0gaW5jbHVkZXMubWFwKHAgPT4gZ2xvYi5wYXJzZSh7IGJhc2U6IHdmLmZzUGF0aCwgcGF0dGVybjogcCB9LCB7IGlnbm9yZUNhc2UgfSkpO1xuXHRcdFx0Y29uc3QgZXhjbHVkZVBhcnNlID0gZXhjbHVkZXMubWFwKHAgPT4gZ2xvYi5wYXJzZSh7IGJhc2U6IHdmLmZzUGF0aCwgcGF0dGVybjogcCB9LCB7IGlnbm9yZUNhc2UgfSkpO1xuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZChmaWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBbZS5yYXdBZGRlZCwgZS5yYXdEZWxldGVkLCBlLnJhd1VwZGF0ZWRdKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB1cmkgb2YgY2hhbmdlKSB7XG5cdFx0XHRcdFx0XHRpZiAoaW5jbHVkZVBhcnNlLnNvbWUoaSA9PiBpKHVyaS5mc1BhdGgpKSAmJiAhZXhjbHVkZVBhcnNlLnNvbWUoZSA9PiBlKHVyaS5mc1BhdGgpKSkge1xuXHRcdFx0XHRcdFx0XHRyZXN0YXJ0U2NoZWR1bGVyLnF1ZXVlKHJlc3RhcnQpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWNwRGV2TW9kZURlYnVnZ2luZyB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHR0cmFuc2Zvcm0oZGVmaW5pdGlvbjogTWNwU2VydmVyRGVmaW5pdGlvbiwgbGF1bmNoOiBNY3BTZXJ2ZXJMYXVuY2gpOiBQcm9taXNlPE1jcFNlcnZlckxhdW5jaD47XG59XG5cbmV4cG9ydCBjb25zdCBJTWNwRGV2TW9kZURlYnVnZ2luZyA9IGNyZWF0ZURlY29yYXRvcjxJTWNwRGV2TW9kZURlYnVnZ2luZz4oJ21jcERldk1vZGVEZWJ1Z2dpbmcnKTtcblxuY29uc3QgREVCVUdfSE9TVCA9ICcxMjcuMC4wLjEnO1xuXG5leHBvcnQgY2xhc3MgTWNwRGV2TW9kZURlYnVnZ2luZyBpbXBsZW1lbnRzIElNY3BEZXZNb2RlRGVidWdnaW5nIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0KSB7IH1cblxuXHRwdWJsaWMgYXN5bmMgdHJhbnNmb3JtKGRlZmluaXRpb246IE1jcFNlcnZlckRlZmluaXRpb24sIGxhdW5jaDogTWNwU2VydmVyTGF1bmNoKTogUHJvbWlzZTxNY3BTZXJ2ZXJMYXVuY2g+IHtcblx0XHRpZiAoIWRlZmluaXRpb24uZGV2TW9kZT8uZGVidWcgfHwgbGF1bmNoLnR5cGUgIT09IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuU3RkaW8pIHtcblx0XHRcdHJldHVybiBsYXVuY2g7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9ydCA9IGF3YWl0IHRoaXMuZ2V0RGVidWdQb3J0KCk7XG5cdFx0Y29uc3QgbmFtZSA9IGBNQ1A6ICR7ZGVmaW5pdGlvbi5sYWJlbH1gOyAvLyBmb3IgZGVidWdnaW5nXG5cdFx0Y29uc3Qgb3B0aW9uczogSURlYnVnU2Vzc2lvbk9wdGlvbnMgPSB7IHN0YXJ0ZWRCeVVzZXI6IGZhbHNlLCBzdXBwcmVzc0RlYnVnVmlldzogdHJ1ZSB9O1xuXHRcdGNvbnN0IGNvbW1vbkNvbmZpZzogUGFydGlhbDxJQ29uZmlnPiA9IHtcblx0XHRcdGludGVybmFsQ29uc29sZU9wdGlvbnM6ICduZXZlck9wZW4nLFxuXHRcdFx0c3VwcHJlc3NNdWx0aXBsZVNlc3Npb25XYXJuaW5nOiB0cnVlLFxuXHRcdH07XG5cblx0XHRzd2l0Y2ggKGRlZmluaXRpb24uZGV2TW9kZS5kZWJ1Zy50eXBlKSB7XG5cdFx0XHRjYXNlICdub2RlJzoge1xuXHRcdFx0XHRpZiAoIS9ub2RlWzAtOV0qJC8udGVzdChsYXVuY2guY29tbWFuZCkpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ21jcC5kZWJ1Zy5ub2RlQmluUmVxJywgJ01DUCBzZXJ2ZXIgbXVzdCBiZSBsYXVuY2hlZCB3aXRoIHRoZSBcIm5vZGVcIiBleGVjdXRhYmxlIHRvIGVuYWJsZSBkZWJ1Z2dpbmcsIGJ1dCB3YXMgbGF1bmNoZWQgd2l0aCBcInswfVwiJywgbGF1bmNoLmNvbW1hbmQpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFdlIGludGVudGlvbmFsbHkgYXNzZXJ0IHR5cGVzIGFzIHRoZSBEQSBoYXMgYWRkaXRpb25hbCBwcm9wZXJ0aWVzIGJleW9uZyBJQ29uZmlnXG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnNcblx0XHRcdFx0dGhpcy5fZGVidWdTZXJ2aWNlLnN0YXJ0RGVidWdnaW5nKHVuZGVmaW5lZCwge1xuXHRcdFx0XHRcdHR5cGU6ICdwd2Etbm9kZScsXG5cdFx0XHRcdFx0cmVxdWVzdDogJ2F0dGFjaCcsXG5cdFx0XHRcdFx0bmFtZSxcblx0XHRcdFx0XHRwb3J0LFxuXHRcdFx0XHRcdGhvc3Q6IERFQlVHX0hPU1QsXG5cdFx0XHRcdFx0dGltZW91dDogMzBfMDAwLFxuXHRcdFx0XHRcdGNvbnRpbnVlT25BdHRhY2g6IHRydWUsXG5cdFx0XHRcdFx0Li4uY29tbW9uQ29uZmlnLFxuXHRcdFx0XHR9IGFzIElDb25maWcsIG9wdGlvbnMpO1xuXHRcdFx0XHRyZXR1cm4geyAuLi5sYXVuY2gsIGFyZ3M6IFtgLS1pbnNwZWN0LWJyaz0ke0RFQlVHX0hPU1R9OiR7cG9ydH1gLCAuLi5sYXVuY2guYXJnc10gfTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2RlYnVncHknOiB7XG5cdFx0XHRcdGlmICghL3B5dGhvblswLTkuXSokLy50ZXN0KGxhdW5jaC5jb21tYW5kKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnbWNwLmRlYnVnLnB5dGhvbkJpblJlcScsICdNQ1Agc2VydmVyIG11c3QgYmUgbGF1bmNoZWQgd2l0aCB0aGUgXCJweXRob25cIiBleGVjdXRhYmxlIHRvIGVuYWJsZSBkZWJ1Z2dpbmcsIGJ1dCB3YXMgbGF1bmNoZWQgd2l0aCBcInswfVwiJywgbGF1bmNoLmNvbW1hbmQpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBjb21tYW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGxldCBhcmdzID0gWyctLXdhaXQtZm9yLWNsaWVudCcsICctLWNvbm5lY3QnLCBgJHtERUJVR19IT1NUfToke3BvcnR9YCwgLi4ubGF1bmNoLmFyZ3NdO1xuXHRcdFx0XHRpZiAoZGVmaW5pdGlvbi5kZXZNb2RlLmRlYnVnLmRlYnVncHlQYXRoKSB7XG5cdFx0XHRcdFx0Y29tbWFuZCA9IGRlZmluaXRpb24uZGV2TW9kZS5kZWJ1Zy5kZWJ1Z3B5UGF0aDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Ly8gVGhlIFB5dGhvbiBkZWJ1Z2dlciBleHBvc2VzIGEgY29tbWFuZCB0byBnZXQgaXRzIGJ1bmRsZSBkZWJ1Z3B5IG1vZHVsZSBwYXRoLiAgVXNlIHRoYXQgaWYgaXQncyBhdmFpbGFibGUuXG5cdFx0XHRcdFx0XHRjb25zdCBkZWJ1Z1B5UGF0aCA9IGF3YWl0IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPHN0cmluZyB8IHVuZGVmaW5lZD4oJ3B5dGhvbi5nZXREZWJ1Z3B5UGFja2FnZVBhdGgnKTtcblx0XHRcdFx0XHRcdGlmIChkZWJ1Z1B5UGF0aCkge1xuXHRcdFx0XHRcdFx0XHRjb21tYW5kID0gbGF1bmNoLmNvbW1hbmQ7XG5cdFx0XHRcdFx0XHRcdGFyZ3MgPSBbZGVidWdQeVBhdGgsIC4uLmFyZ3NdO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0Ly8gaWdub3JlZCwgbm8gUHl0aG9uIGRlYnVnZ2VyIGV4dGVuc2lvbiBpbnN0YWxsZWQgb3IgYW4gZXJyb3IgdGhlcmVpblxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWNvbW1hbmQpIHtcblx0XHRcdFx0XHRjb21tYW5kID0gJ2RlYnVncHknO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yYWNlKFtcblx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zXG5cdFx0XHRcdFx0dGhpcy5fZGVidWdTZXJ2aWNlLnN0YXJ0RGVidWdnaW5nKHVuZGVmaW5lZCwge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2RlYnVncHknLFxuXHRcdFx0XHRcdFx0bmFtZSxcblx0XHRcdFx0XHRcdHJlcXVlc3Q6ICdhdHRhY2gnLFxuXHRcdFx0XHRcdFx0bGlzdGVuOiB7XG5cdFx0XHRcdFx0XHRcdGhvc3Q6IERFQlVHX0hPU1QsXG5cdFx0XHRcdFx0XHRcdHBvcnRcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHQuLi5jb21tb25Db25maWcsXG5cdFx0XHRcdFx0fSBhcyBJQ29uZmlnLCBvcHRpb25zKSxcblx0XHRcdFx0XHR0aGlzLmVuc3VyZUxpc3RlbmluZ09uUG9ydChwb3J0KVxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHRyZXR1cm4geyAuLi5sYXVuY2gsIGNvbW1hbmQsIGFyZ3MgfTtcblx0XHRcdH1cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGFzc2VydE5ldmVyKGRlZmluaXRpb24uZGV2TW9kZS5kZWJ1ZywgYFVua25vd24gZGVidWcgdHlwZSAke0pTT04uc3RyaW5naWZ5KGRlZmluaXRpb24uZGV2TW9kZS5kZWJ1Zyl9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGVuc3VyZUxpc3RlbmluZ09uUG9ydChwb3J0OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0RGVidWdQb3J0KCkge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoOTIz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
