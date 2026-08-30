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
import { fork } from "child_process";
import { Limiter } from "../../../base/common/async.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { Event } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { join } from "../../../base/common/path.js";
import { Promises } from "../../../base/node/pfs.js";
import { ILogService } from "../../log/common/log.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
let ExtensionsLifecycle = class extends Disposable {
  // Run max 5 processes in parallel
  constructor(userDataProfilesService, logService) {
    super();
    this.userDataProfilesService = userDataProfilesService;
    this.logService = logService;
    this.processesLimiter = new Limiter(5);
  }
  async postUninstall(extension) {
    const script = this.parseScript(extension, "uninstall");
    if (script) {
      this.logService.info(extension.identifier.id, extension.manifest.version, `Running post uninstall script`);
      await this.processesLimiter.queue(async () => {
        try {
          await this.runLifecycleHook(script.script, "uninstall", script.args, true, extension);
          this.logService.info(`Finished running post uninstall script`, extension.identifier.id, extension.manifest.version);
        } catch (error) {
          this.logService.error("Failed to run post uninstall script", extension.identifier.id, extension.manifest.version);
          this.logService.error(error);
        }
      });
    }
    try {
      await Promises.rm(this.getExtensionStoragePath(extension));
    } catch (error) {
      this.logService.error("Error while removing extension storage path", extension.identifier.id);
      this.logService.error(error);
    }
  }
  parseScript(extension, type) {
    const scriptKey = `vscode:${type}`;
    if (extension.location.scheme === Schemas.file && extension.manifest && extension.manifest["scripts"] && typeof extension.manifest["scripts"][scriptKey] === "string") {
      const script = extension.manifest["scripts"][scriptKey].split(" ");
      if (script.length < 2 || script[0] !== "node" || !script[1]) {
        this.logService.warn(extension.identifier.id, extension.manifest.version, `${scriptKey} should be a node script`);
        return null;
      }
      return { script: join(extension.location.fsPath, script[1]), args: script.slice(2) || [] };
    }
    return null;
  }
  runLifecycleHook(lifecycleHook, lifecycleType, args, timeout, extension) {
    return new Promise((c, e) => {
      const extensionLifecycleProcess = this.start(lifecycleHook, lifecycleType, args, extension);
      let timeoutHandler;
      const onexit = (error) => {
        if (timeoutHandler) {
          clearTimeout(timeoutHandler);
          timeoutHandler = null;
        }
        if (error) {
          e(error);
        } else {
          c(void 0);
        }
      };
      extensionLifecycleProcess.on("error", (err) => {
        onexit(toErrorMessage(err) || "Unknown");
      });
      extensionLifecycleProcess.on("exit", (code, signal) => {
        onexit(code ? `post-${lifecycleType} process exited with code ${code}` : void 0);
      });
      if (timeout) {
        timeoutHandler = setTimeout(() => {
          timeoutHandler = null;
          extensionLifecycleProcess.kill();
          e("timed out");
        }, 5e3);
      }
    });
  }
  start(uninstallHook, lifecycleType, args, extension) {
    const opts = {
      silent: true,
      execArgv: void 0
    };
    const extensionUninstallProcess = fork(uninstallHook, [`--type=extension-post-${lifecycleType}`, ...args], opts);
    extensionUninstallProcess.stdout.setEncoding("utf8");
    extensionUninstallProcess.stderr.setEncoding("utf8");
    const onStdout = Event.fromNodeEventEmitter(extensionUninstallProcess.stdout, "data");
    const onStderr = Event.fromNodeEventEmitter(extensionUninstallProcess.stderr, "data");
    this._register(onStdout((data) => this.logService.info(extension.identifier.id, extension.manifest.version, `post-${lifecycleType}`, data)));
    this._register(onStderr((data) => this.logService.error(extension.identifier.id, extension.manifest.version, `post-${lifecycleType}`, data)));
    const onOutput = Event.any(
      Event.map(onStdout, (o) => ({ data: `%c${o}`, format: [""] }), this._store),
      Event.map(onStderr, (o) => ({ data: `%c${o}`, format: ["color: red"] }), this._store)
    );
    const onDebouncedOutput = Event.debounce(onOutput, (r, o) => {
      return r ? { data: r.data + o.data, format: [...r.format, ...o.format] } : { data: o.data, format: o.format };
    }, 100, void 0, void 0, void 0, this._store);
    onDebouncedOutput((data) => {
      console.group(extension.identifier.id);
      console.log(data.data, ...data.format);
      console.groupEnd();
    });
    return extensionUninstallProcess;
  }
  getExtensionStoragePath(extension) {
    return join(this.userDataProfilesService.defaultProfile.globalStorageHome.fsPath, extension.identifier.id.toLowerCase());
  }
};
ExtensionsLifecycle = __decorateClass([
  __decorateParam(0, IUserDataProfilesService),
  __decorateParam(1, ILogService)
], ExtensionsLifecycle);
export {
  ExtensionsLifecycle
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZW5zaW9uTWFuYWdlbWVudFxcbm9kZVxcZXh0ZW5zaW9uTGlmZWN5Y2xlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hpbGRQcm9jZXNzLCBmb3JrIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBMaW1pdGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3Bmcy5qcyc7XG5pbXBvcnQgeyBJTG9jYWxFeHRlbnNpb24gfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbnNMaWZlY3ljbGUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHByb2Nlc3Nlc0xpbWl0ZXI6IExpbWl0ZXI8dm9pZD4gPSBuZXcgTGltaXRlcig1KTsgLy8gUnVuIG1heCA1IHByb2Nlc3NlcyBpbiBwYXJhbGxlbFxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyBwb3N0VW5pbnN0YWxsKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2NyaXB0ID0gdGhpcy5wYXJzZVNjcmlwdChleHRlbnNpb24sICd1bmluc3RhbGwnKTtcblx0XHRpZiAoc2NyaXB0KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhleHRlbnNpb24uaWRlbnRpZmllci5pZCwgZXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24sIGBSdW5uaW5nIHBvc3QgdW5pbnN0YWxsIHNjcmlwdGApO1xuXHRcdFx0YXdhaXQgdGhpcy5wcm9jZXNzZXNMaW1pdGVyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJ1bkxpZmVjeWNsZUhvb2soc2NyaXB0LnNjcmlwdCwgJ3VuaW5zdGFsbCcsIHNjcmlwdC5hcmdzLCB0cnVlLCBleHRlbnNpb24pO1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBGaW5pc2hlZCBydW5uaW5nIHBvc3QgdW5pbnN0YWxsIHNjcmlwdGAsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBleHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbik7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gcnVuIHBvc3QgdW5pbnN0YWxsIHNjcmlwdCcsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBleHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbik7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlcy5ybSh0aGlzLmdldEV4dGVuc2lvblN0b3JhZ2VQYXRoKGV4dGVuc2lvbikpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0Vycm9yIHdoaWxlIHJlbW92aW5nIGV4dGVuc2lvbiBzdG9yYWdlIHBhdGgnLCBleHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcGFyc2VTY3JpcHQoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIHR5cGU6IHN0cmluZyk6IHsgc2NyaXB0OiBzdHJpbmc7IGFyZ3M6IHN0cmluZ1tdIH0gfCBudWxsIHtcblx0XHRjb25zdCBzY3JpcHRLZXkgPSBgdnNjb2RlOiR7dHlwZX1gO1xuXHRcdGlmIChleHRlbnNpb24ubG9jYXRpb24uc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgJiYgZXh0ZW5zaW9uLm1hbmlmZXN0ICYmIGV4dGVuc2lvbi5tYW5pZmVzdFsnc2NyaXB0cyddICYmIHR5cGVvZiBleHRlbnNpb24ubWFuaWZlc3RbJ3NjcmlwdHMnXVtzY3JpcHRLZXldID09PSAnc3RyaW5nJykge1xuXHRcdFx0Y29uc3Qgc2NyaXB0ID0gKGV4dGVuc2lvbi5tYW5pZmVzdFsnc2NyaXB0cyddW3NjcmlwdEtleV0pLnNwbGl0KCcgJyk7XG5cdFx0XHRpZiAoc2NyaXB0Lmxlbmd0aCA8IDIgfHwgc2NyaXB0WzBdICE9PSAnbm9kZScgfHwgIXNjcmlwdFsxXSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihleHRlbnNpb24uaWRlbnRpZmllci5pZCwgZXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24sIGAke3NjcmlwdEtleX0gc2hvdWxkIGJlIGEgbm9kZSBzY3JpcHRgKTtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBzY3JpcHQ6IGpvaW4oZXh0ZW5zaW9uLmxvY2F0aW9uLmZzUGF0aCwgc2NyaXB0WzFdKSwgYXJnczogc2NyaXB0LnNsaWNlKDIpIHx8IFtdIH07XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBydW5MaWZlY3ljbGVIb29rKGxpZmVjeWNsZUhvb2s6IHN0cmluZywgbGlmZWN5Y2xlVHlwZTogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSwgdGltZW91dDogYm9vbGVhbiwgZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKGMsIGUpID0+IHtcblxuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uTGlmZWN5Y2xlUHJvY2VzcyA9IHRoaXMuc3RhcnQobGlmZWN5Y2xlSG9vaywgbGlmZWN5Y2xlVHlwZSwgYXJncywgZXh0ZW5zaW9uKTtcblx0XHRcdGxldCB0aW1lb3V0SGFuZGxlcjogVGltZW91dCB8IG51bGw7XG5cblx0XHRcdGNvbnN0IG9uZXhpdCA9IChlcnJvcj86IHN0cmluZykgPT4ge1xuXHRcdFx0XHRpZiAodGltZW91dEhhbmRsZXIpIHtcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQodGltZW91dEhhbmRsZXIpO1xuXHRcdFx0XHRcdHRpbWVvdXRIYW5kbGVyID0gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0XHRlKGVycm9yKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdC8vIG9uIGVycm9yXG5cdFx0XHRleHRlbnNpb25MaWZlY3ljbGVQcm9jZXNzLm9uKCdlcnJvcicsIChlcnIpID0+IHtcblx0XHRcdFx0b25leGl0KHRvRXJyb3JNZXNzYWdlKGVycikgfHwgJ1Vua25vd24nKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBvbiBleGl0XG5cdFx0XHRleHRlbnNpb25MaWZlY3ljbGVQcm9jZXNzLm9uKCdleGl0JywgKGNvZGU6IG51bWJlciwgc2lnbmFsOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0b25leGl0KGNvZGUgPyBgcG9zdC0ke2xpZmVjeWNsZVR5cGV9IHByb2Nlc3MgZXhpdGVkIHdpdGggY29kZSAke2NvZGV9YCA6IHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHRpbWVvdXQpIHtcblx0XHRcdFx0Ly8gdGltZW91dDoga2lsbCBwcm9jZXNzIGFmdGVyIHdhaXRpbmcgZm9yIDVzXG5cdFx0XHRcdHRpbWVvdXRIYW5kbGVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0dGltZW91dEhhbmRsZXIgPSBudWxsO1xuXHRcdFx0XHRcdGV4dGVuc2lvbkxpZmVjeWNsZVByb2Nlc3Mua2lsbCgpO1xuXHRcdFx0XHRcdGUoJ3RpbWVkIG91dCcpO1xuXHRcdFx0XHR9LCA1MDAwKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc3RhcnQodW5pbnN0YWxsSG9vazogc3RyaW5nLCBsaWZlY3ljbGVUeXBlOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdLCBleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbik6IENoaWxkUHJvY2VzcyB7XG5cdFx0Y29uc3Qgb3B0cyA9IHtcblx0XHRcdHNpbGVudDogdHJ1ZSxcblx0XHRcdGV4ZWNBcmd2OiB1bmRlZmluZWRcblx0XHR9O1xuXHRcdGNvbnN0IGV4dGVuc2lvblVuaW5zdGFsbFByb2Nlc3MgPSBmb3JrKHVuaW5zdGFsbEhvb2ssIFtgLS10eXBlPWV4dGVuc2lvbi1wb3N0LSR7bGlmZWN5Y2xlVHlwZX1gLCAuLi5hcmdzXSwgb3B0cyk7XG5cblx0XHQvLyBDYXRjaCBhbGwgb3V0cHV0IGNvbWluZyBmcm9tIHRoZSBwcm9jZXNzXG5cdFx0dHlwZSBPdXRwdXQgPSB7IGRhdGE6IHN0cmluZzsgZm9ybWF0OiBzdHJpbmdbXSB9O1xuXHRcdGV4dGVuc2lvblVuaW5zdGFsbFByb2Nlc3Muc3Rkb3V0IS5zZXRFbmNvZGluZygndXRmOCcpO1xuXHRcdGV4dGVuc2lvblVuaW5zdGFsbFByb2Nlc3Muc3RkZXJyIS5zZXRFbmNvZGluZygndXRmOCcpO1xuXG5cdFx0Y29uc3Qgb25TdGRvdXQgPSBFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcjxzdHJpbmc+KGV4dGVuc2lvblVuaW5zdGFsbFByb2Nlc3Muc3Rkb3V0ISwgJ2RhdGEnKTtcblx0XHRjb25zdCBvblN0ZGVyciA9IEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyPHN0cmluZz4oZXh0ZW5zaW9uVW5pbnN0YWxsUHJvY2Vzcy5zdGRlcnIhLCAnZGF0YScpO1xuXG5cdFx0Ly8gTG9nIG91dHB1dFxuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uU3Rkb3V0KGRhdGEgPT4gdGhpcy5sb2dTZXJ2aWNlLmluZm8oZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uLCBgcG9zdC0ke2xpZmVjeWNsZVR5cGV9YCwgZGF0YSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvblN0ZGVycihkYXRhID0+IHRoaXMubG9nU2VydmljZS5lcnJvcihleHRlbnNpb24uaWRlbnRpZmllci5pZCwgZXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24sIGBwb3N0LSR7bGlmZWN5Y2xlVHlwZX1gLCBkYXRhKSkpO1xuXG5cdFx0Y29uc3Qgb25PdXRwdXQgPSBFdmVudC5hbnkoXG5cdFx0XHRFdmVudC5tYXAob25TdGRvdXQsIG8gPT4gKHsgZGF0YTogYCVjJHtvfWAsIGZvcm1hdDogWycnXSB9KSwgdGhpcy5fc3RvcmUpLFxuXHRcdFx0RXZlbnQubWFwKG9uU3RkZXJyLCBvID0+ICh7IGRhdGE6IGAlYyR7b31gLCBmb3JtYXQ6IFsnY29sb3I6IHJlZCddIH0pLCB0aGlzLl9zdG9yZSlcblx0XHQpO1xuXHRcdC8vIERlYm91bmNlIGFsbCBvdXRwdXQsIHNvIHdlIGNhbiByZW5kZXIgaXQgaW4gdGhlIENocm9tZSBjb25zb2xlIGFzIGEgZ3JvdXBcblx0XHRjb25zdCBvbkRlYm91bmNlZE91dHB1dCA9IEV2ZW50LmRlYm91bmNlPE91dHB1dD4ob25PdXRwdXQsIChyLCBvKSA9PiB7XG5cdFx0XHRyZXR1cm4gclxuXHRcdFx0XHQ/IHsgZGF0YTogci5kYXRhICsgby5kYXRhLCBmb3JtYXQ6IFsuLi5yLmZvcm1hdCwgLi4uby5mb3JtYXRdIH1cblx0XHRcdFx0OiB7IGRhdGE6IG8uZGF0YSwgZm9ybWF0OiBvLmZvcm1hdCB9O1xuXHRcdH0sIDEwMCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5fc3RvcmUpO1xuXG5cdFx0Ly8gUHJpbnQgb3V0IG91dHB1dFxuXHRcdG9uRGVib3VuY2VkT3V0cHV0KGRhdGEgPT4ge1xuXHRcdFx0Y29uc29sZS5ncm91cChleHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0XHRjb25zb2xlLmxvZyhkYXRhLmRhdGEsIC4uLmRhdGEuZm9ybWF0KTtcblx0XHRcdGNvbnNvbGUuZ3JvdXBFbmQoKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBleHRlbnNpb25Vbmluc3RhbGxQcm9jZXNzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFeHRlbnNpb25TdG9yYWdlUGF0aChleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGpvaW4odGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5nbG9iYWxTdG9yYWdlSG9tZS5mc1BhdGgsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQXVCLFlBQVk7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsYUFBYTtBQUN0QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0NBQWdDO0FBRWxDLElBQU0sc0JBQU4sY0FBa0MsV0FBVztBQUFBO0FBQUEsRUFJbkQsWUFDbUMseUJBQ0osWUFDN0I7QUFDRCxVQUFNO0FBSDRCO0FBQ0o7QUFKL0IsU0FBUSxtQkFBa0MsSUFBSSxRQUFRLENBQUM7QUFBQSxFQU92RDtBQUFBLEVBRUEsTUFBTSxjQUFjLFdBQTJDO0FBQzlELFVBQU0sU0FBUyxLQUFLLFlBQVksV0FBVyxXQUFXO0FBQ3RELFFBQUksUUFBUTtBQUNYLFdBQUssV0FBVyxLQUFLLFVBQVUsV0FBVyxJQUFJLFVBQVUsU0FBUyxTQUFTLCtCQUErQjtBQUN6RyxZQUFNLEtBQUssaUJBQWlCLE1BQU0sWUFBWTtBQUM3QyxZQUFJO0FBQ0gsZ0JBQU0sS0FBSyxpQkFBaUIsT0FBTyxRQUFR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
