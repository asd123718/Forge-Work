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
import { createRandomIPCHandle } from "../../../base/parts/ipc/node/ipc.net.js";
import * as fs from "fs";
import { IExtHostCommands } from "../common/extHostCommands.js";
import { URI } from "../../../base/common/uri.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { hasWorkspaceFileExtension } from "../../../platform/workspace/common/workspace.js";
class CLIServerBase {
  constructor(_commands, logService, _ipcHandlePath) {
    this._commands = _commands;
    this.logService = logService;
    this._ipcHandlePath = _ipcHandlePath;
    this._server = void 0;
    this._disposed = false;
    this.setup();
  }
  get ipcHandlePath() {
    return this._ipcHandlePath;
  }
  async setup() {
    try {
      const http = await import("http");
      if (this._disposed) {
        return;
      }
      this._server = http.createServer((req, res) => this.onRequest(req, res));
      try {
        this._server.listen(this.ipcHandlePath);
        this._server.on("error", (err) => this.logService.error(err));
      } catch (err) {
        this.logService.error("Could not start open from terminal server.");
      }
    } catch (error) {
      this.logService.error("Error setting up CLI server", error);
    }
  }
  onRequest(req, res) {
    const sendResponse = (statusCode, returnObj) => {
      res.writeHead(statusCode, { "content-type": "application/json" });
      res.end(JSON.stringify(returnObj || null), (err) => err && this.logService.error(err));
    };
    const chunks = [];
    req.setEncoding("utf8");
    req.on("data", (d) => chunks.push(d));
    req.on("end", async () => {
      try {
        const data = JSON.parse(chunks.join(""));
        let returnObj;
        switch (data.type) {
          case "open":
            returnObj = await this.open(data);
            break;
          case "openExternal":
            returnObj = await this.openExternal(data);
            break;
          case "status":
            returnObj = await this.getStatus(data);
            break;
          case "extensionManagement":
            returnObj = await this.manageExtensions(data);
            break;
          default:
            sendResponse(404, `Unknown message type: ${data.type}`);
            break;
        }
        sendResponse(200, returnObj);
      } catch (e) {
        const message = e instanceof Error ? e.message : JSON.stringify(e);
        sendResponse(500, message);
        this.logService.error("Error while processing pipe request", e);
      }
    });
  }
  async open(data) {
    const { fileURIs, folderURIs, forceNewWindow, diffMode, mergeMode, addMode, removeMode, forceReuseWindow, gotoLineMode, waitMarkerFilePath, remoteAuthority } = data;
    const urisToOpen = [];
    if (Array.isArray(folderURIs)) {
      for (const s of folderURIs) {
        try {
          urisToOpen.push({ folderUri: URI.parse(s) });
        } catch (e) {
        }
      }
    }
    if (Array.isArray(fileURIs)) {
      for (const s of fileURIs) {
        try {
          if (hasWorkspaceFileExtension(s)) {
            urisToOpen.push({ workspaceUri: URI.parse(s) });
          } else {
            urisToOpen.push({ fileUri: URI.parse(s) });
          }
        } catch (e) {
        }
      }
    }
    const waitMarkerFileURI = waitMarkerFilePath ? URI.file(waitMarkerFilePath) : void 0;
    const preferNewWindow = !forceReuseWindow && !waitMarkerFileURI && !addMode && !removeMode;
    const windowOpenArgs = { forceNewWindow, diffMode, mergeMode, addMode, removeMode, gotoLineMode, forceReuseWindow, preferNewWindow, waitMarkerFileURI, remoteAuthority };
    this._commands.executeCommand("_remoteCLI.windowOpen", urisToOpen, windowOpenArgs);
  }
  async openExternal(data) {
    for (const uriString of data.uris) {
      const uri = URI.parse(uriString);
      if (uri.scheme === "file") {
        continue;
      }
      await this._commands.executeCommand("_remoteCLI.openExternal", uriString);
    }
  }
  async manageExtensions(data) {
    const toExtOrVSIX = (inputs) => inputs?.map((input) => /\.vsix$/i.test(input) ? URI.parse(input) : input);
    const commandArgs = {
      list: data.list,
      install: toExtOrVSIX(data.install),
      uninstall: toExtOrVSIX(data.uninstall),
      force: data.force
    };
    return await this._commands.executeCommand("_remoteCLI.manageExtensions", commandArgs);
  }
  async getStatus(data) {
    return await this._commands.executeCommand("_remoteCLI.getSystemStatus");
  }
  dispose() {
    this._disposed = true;
    this._server?.close();
    if (this._ipcHandlePath && process.platform !== "win32" && fs.existsSync(this._ipcHandlePath)) {
      fs.unlinkSync(this._ipcHandlePath);
    }
  }
}
let CLIServer = class extends CLIServerBase {
  constructor(commands, logService) {
    super(commands, logService, createRandomIPCHandle());
  }
};
CLIServer = __decorateClass([
  __decorateParam(0, IExtHostCommands),
  __decorateParam(1, ILogService)
], CLIServer);
export {
  CLIServer,
  CLIServerBase
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcbm9kZVxcZXh0SG9zdENMSVNlcnZlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNyZWF0ZVJhbmRvbUlQQ0hhbmRsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL25vZGUvaXBjLm5ldC5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgeyBJRXh0SG9zdENvbW1hbmRzIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3RDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJV2luZG93T3BlbmFibGUsIElPcGVuV2luZG93T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGhhc1dvcmtzcGFjZUZpbGVFeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgT3BlbkNvbW1hbmRQaXBlQXJncyB7XG5cdHR5cGU6ICdvcGVuJztcblx0ZmlsZVVSSXM/OiBzdHJpbmdbXTtcblx0Zm9sZGVyVVJJcz86IHN0cmluZ1tdO1xuXHRmb3JjZU5ld1dpbmRvdz86IGJvb2xlYW47XG5cdGRpZmZNb2RlPzogYm9vbGVhbjtcblx0bWVyZ2VNb2RlPzogYm9vbGVhbjtcblx0YWRkTW9kZT86IGJvb2xlYW47XG5cdHJlbW92ZU1vZGU/OiBib29sZWFuO1xuXHRnb3RvTGluZU1vZGU/OiBib29sZWFuO1xuXHRmb3JjZVJldXNlV2luZG93PzogYm9vbGVhbjtcblx0d2FpdE1hcmtlckZpbGVQYXRoPzogc3RyaW5nO1xuXHRyZW1vdGVBdXRob3JpdHk/OiBzdHJpbmcgfCBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE9wZW5FeHRlcm5hbENvbW1hbmRQaXBlQXJncyB7XG5cdHR5cGU6ICdvcGVuRXh0ZXJuYWwnO1xuXHR1cmlzOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdGF0dXNQaXBlQXJncyB7XG5cdHR5cGU6ICdzdGF0dXMnO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEV4dGVuc2lvbk1hbmFnZW1lbnRQaXBlQXJncyB7XG5cdHR5cGU6ICdleHRlbnNpb25NYW5hZ2VtZW50Jztcblx0bGlzdD86IHsgc2hvd1ZlcnNpb25zPzogYm9vbGVhbjsgY2F0ZWdvcnk/OiBzdHJpbmcgfTtcblx0aW5zdGFsbD86IHN0cmluZ1tdO1xuXHR1bmluc3RhbGw/OiBzdHJpbmdbXTtcblx0Zm9yY2U/OiBib29sZWFuO1xufVxuXG5leHBvcnQgdHlwZSBQaXBlQ29tbWFuZCA9IE9wZW5Db21tYW5kUGlwZUFyZ3MgfCBTdGF0dXNQaXBlQXJncyB8IE9wZW5FeHRlcm5hbENvbW1hbmRQaXBlQXJncyB8IEV4dGVuc2lvbk1hbmFnZW1lbnRQaXBlQXJncztcblxuZXhwb3J0IGludGVyZmFjZSBJQ29tbWFuZHNFeGVjdXRlciB7XG5cdGV4ZWN1dGVDb21tYW5kPFQ+KGlkOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8VD47XG59XG5cbmV4cG9ydCBjbGFzcyBDTElTZXJ2ZXJCYXNlIHtcblx0cHJpdmF0ZSBfc2VydmVyOiBodHRwLlNlcnZlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGlzcG9zZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kczogSUNvbW1hbmRzRXhlY3V0ZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pcGNIYW5kbGVQYXRoOiBzdHJpbmcsXG5cdCkge1xuXHRcdHRoaXMuc2V0dXAoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXBjSGFuZGxlUGF0aCgpIHtcblx0XHRyZXR1cm4gdGhpcy5faXBjSGFuZGxlUGF0aDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2V0dXAoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGh0dHAgPSBhd2FpdCBpbXBvcnQoJ2h0dHAnKTtcblx0XHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zZXJ2ZXIgPSBodHRwLmNyZWF0ZVNlcnZlcigocmVxLCByZXMpID0+IHRoaXMub25SZXF1ZXN0KHJlcSwgcmVzKSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9zZXJ2ZXIubGlzdGVuKHRoaXMuaXBjSGFuZGxlUGF0aCk7XG5cdFx0XHRcdHRoaXMuX3NlcnZlci5vbignZXJyb3InLCBlcnIgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycikpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignQ291bGQgbm90IHN0YXJ0IG9wZW4gZnJvbSB0ZXJtaW5hbCBzZXJ2ZXIuJyk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRXJyb3Igc2V0dGluZyB1cCBDTEkgc2VydmVyJywgZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25SZXF1ZXN0KHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSk6IHZvaWQge1xuXHRcdGNvbnN0IHNlbmRSZXNwb25zZSA9IChzdGF0dXNDb2RlOiBudW1iZXIsIHJldHVybk9iajogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRyZXMud3JpdGVIZWFkKHN0YXR1c0NvZGUsIHsgJ2NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcblx0XHRcdHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkocmV0dXJuT2JqIHx8IG51bGwpLCAoZXJyPzogYW55KSA9PiBlcnIgJiYgdGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycikpOyAvLyBDb2RlUUwgW1NNMDE1MjRdIE9ubHkgdGhlIG1lc3NhZ2UgcG9ydGlvbiBvZiBlcnJvcnMgYXJlIHBhc3NlZCBpbi5cblx0XHR9O1xuXG5cdFx0Y29uc3QgY2h1bmtzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdHJlcS5zZXRFbmNvZGluZygndXRmOCcpO1xuXHRcdHJlcS5vbignZGF0YScsIChkOiBzdHJpbmcpID0+IGNodW5rcy5wdXNoKGQpKTtcblx0XHRyZXEub24oJ2VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGRhdGE6IFBpcGVDb21tYW5kIHwgYW55ID0gSlNPTi5wYXJzZShjaHVua3Muam9pbignJykpO1xuXHRcdFx0XHRsZXQgcmV0dXJuT2JqOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdHN3aXRjaCAoZGF0YS50eXBlKSB7XG5cdFx0XHRcdFx0Y2FzZSAnb3Blbic6XG5cdFx0XHRcdFx0XHRyZXR1cm5PYmogPSBhd2FpdCB0aGlzLm9wZW4oZGF0YSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdvcGVuRXh0ZXJuYWwnOlxuXHRcdFx0XHRcdFx0cmV0dXJuT2JqID0gYXdhaXQgdGhpcy5vcGVuRXh0ZXJuYWwoZGF0YSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdzdGF0dXMnOlxuXHRcdFx0XHRcdFx0cmV0dXJuT2JqID0gYXdhaXQgdGhpcy5nZXRTdGF0dXMoZGF0YSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdleHRlbnNpb25NYW5hZ2VtZW50Jzpcblx0XHRcdFx0XHRcdHJldHVybk9iaiA9IGF3YWl0IHRoaXMubWFuYWdlRXh0ZW5zaW9ucyhkYXRhKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRzZW5kUmVzcG9uc2UoNDA0LCBgVW5rbm93biBtZXNzYWdlIHR5cGU6ICR7ZGF0YS50eXBlfWApO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2VuZFJlc3BvbnNlKDIwMCwgcmV0dXJuT2JqKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IEpTT04uc3RyaW5naWZ5KGUpO1xuXHRcdFx0XHRzZW5kUmVzcG9uc2UoNTAwLCBtZXNzYWdlKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdFcnJvciB3aGlsZSBwcm9jZXNzaW5nIHBpcGUgcmVxdWVzdCcsIGUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuKGRhdGE6IE9wZW5Db21tYW5kUGlwZUFyZ3MpOiBQcm9taXNlPHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHsgZmlsZVVSSXMsIGZvbGRlclVSSXMsIGZvcmNlTmV3V2luZG93LCBkaWZmTW9kZSwgbWVyZ2VNb2RlLCBhZGRNb2RlLCByZW1vdmVNb2RlLCBmb3JjZVJldXNlV2luZG93LCBnb3RvTGluZU1vZGUsIHdhaXRNYXJrZXJGaWxlUGF0aCwgcmVtb3RlQXV0aG9yaXR5IH0gPSBkYXRhO1xuXHRcdGNvbnN0IHVyaXNUb09wZW46IElXaW5kb3dPcGVuYWJsZVtdID0gW107XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoZm9sZGVyVVJJcykpIHtcblx0XHRcdGZvciAoY29uc3QgcyBvZiBmb2xkZXJVUklzKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0dXJpc1RvT3Blbi5wdXNoKHsgZm9sZGVyVXJpOiBVUkkucGFyc2UocykgfSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHQvLyBpZ25vcmVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoQXJyYXkuaXNBcnJheShmaWxlVVJJcykpIHtcblx0XHRcdGZvciAoY29uc3QgcyBvZiBmaWxlVVJJcykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGlmIChoYXNXb3Jrc3BhY2VGaWxlRXh0ZW5zaW9uKHMpKSB7XG5cdFx0XHRcdFx0XHR1cmlzVG9PcGVuLnB1c2goeyB3b3Jrc3BhY2VVcmk6IFVSSS5wYXJzZShzKSB9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dXJpc1RvT3Blbi5wdXNoKHsgZmlsZVVyaTogVVJJLnBhcnNlKHMpIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHdhaXRNYXJrZXJGaWxlVVJJID0gd2FpdE1hcmtlckZpbGVQYXRoID8gVVJJLmZpbGUod2FpdE1hcmtlckZpbGVQYXRoKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwcmVmZXJOZXdXaW5kb3cgPSAhZm9yY2VSZXVzZVdpbmRvdyAmJiAhd2FpdE1hcmtlckZpbGVVUkkgJiYgIWFkZE1vZGUgJiYgIXJlbW92ZU1vZGU7XG5cdFx0Y29uc3Qgd2luZG93T3BlbkFyZ3M6IElPcGVuV2luZG93T3B0aW9ucyA9IHsgZm9yY2VOZXdXaW5kb3csIGRpZmZNb2RlLCBtZXJnZU1vZGUsIGFkZE1vZGUsIHJlbW92ZU1vZGUsIGdvdG9MaW5lTW9kZSwgZm9yY2VSZXVzZVdpbmRvdywgcHJlZmVyTmV3V2luZG93LCB3YWl0TWFya2VyRmlsZVVSSSwgcmVtb3RlQXV0aG9yaXR5IH07XG5cdFx0dGhpcy5fY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQoJ19yZW1vdGVDTEkud2luZG93T3BlbicsIHVyaXNUb09wZW4sIHdpbmRvd09wZW5BcmdzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkV4dGVybmFsKGRhdGE6IE9wZW5FeHRlcm5hbENvbW1hbmRQaXBlQXJncyk6IFByb21pc2U8dW5kZWZpbmVkPiB7XG5cdFx0Zm9yIChjb25zdCB1cmlTdHJpbmcgb2YgZGF0YS51cmlzKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UodXJpU3RyaW5nKTtcblx0XHRcdGlmICh1cmkuc2NoZW1lID09PSAnZmlsZScpIHtcblx0XHRcdFx0Ly8gc2tpcCBmaWxlOi8vIHVyaXMsIHRoZXkgcmVmZXIgdG8gdGhlIGZpbGUgc3lzdGVtIG9mIHRoZSByZW1vdGUgdGhhdCBoYXZlIG5vIG1lYW5pbmcgb24gdGhlIGxvY2FsIG1hY2hpbmVcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl9jb21tYW5kcy5leGVjdXRlQ29tbWFuZCgnX3JlbW90ZUNMSS5vcGVuRXh0ZXJuYWwnLCB1cmlTdHJpbmcpOyAvLyBhbHdheXMgc2VuZCB0aGUgc3RyaW5nLCB3b3JrYXJvdW5kIGZvciAjMTEyNTc3XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBtYW5hZ2VFeHRlbnNpb25zKGRhdGE6IEV4dGVuc2lvbk1hbmFnZW1lbnRQaXBlQXJncyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdG9FeHRPclZTSVggPSAoaW5wdXRzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCkgPT4gaW5wdXRzPy5tYXAoaW5wdXQgPT4gL1xcLnZzaXgkL2kudGVzdChpbnB1dCkgPyBVUkkucGFyc2UoaW5wdXQpIDogaW5wdXQpO1xuXHRcdGNvbnN0IGNvbW1hbmRBcmdzID0ge1xuXHRcdFx0bGlzdDogZGF0YS5saXN0LFxuXHRcdFx0aW5zdGFsbDogdG9FeHRPclZTSVgoZGF0YS5pbnN0YWxsKSxcblx0XHRcdHVuaW5zdGFsbDogdG9FeHRPclZTSVgoZGF0YS51bmluc3RhbGwpLFxuXHRcdFx0Zm9yY2U6IGRhdGEuZm9yY2Vcblx0XHR9O1xuXHRcdHJldHVybiBhd2FpdCB0aGlzLl9jb21tYW5kcy5leGVjdXRlQ29tbWFuZDxzdHJpbmcgfCB1bmRlZmluZWQ+KCdfcmVtb3RlQ0xJLm1hbmFnZUV4dGVuc2lvbnMnLCBjb21tYW5kQXJncyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFN0YXR1cyhkYXRhOiBTdGF0dXNQaXBlQXJncyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2NvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHN0cmluZyB8IHVuZGVmaW5lZD4oJ19yZW1vdGVDTEkuZ2V0U3lzdGVtU3RhdHVzJyk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9zZXJ2ZXI/LmNsb3NlKCk7XG5cblx0XHRpZiAodGhpcy5faXBjSGFuZGxlUGF0aCAmJiBwcm9jZXNzLnBsYXRmb3JtICE9PSAnd2luMzInICYmIGZzLmV4aXN0c1N5bmModGhpcy5faXBjSGFuZGxlUGF0aCkpIHtcblx0XHRcdGZzLnVubGlua1N5bmModGhpcy5faXBjSGFuZGxlUGF0aCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDTElTZXJ2ZXIgZXh0ZW5kcyBDTElTZXJ2ZXJCYXNlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRIb3N0Q29tbWFuZHMgY29tbWFuZHM6IElFeHRIb3N0Q29tbWFuZHMsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGNvbW1hbmRzLCBsb2dTZXJ2aWNlLCBjcmVhdGVSYW5kb21JUENIYW5kbGUoKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyw2QkFBNkI7QUFFdEMsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsV0FBVztBQUNwQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlDQUFpQztBQXdDbkMsTUFBTSxjQUFjO0FBQUEsRUFJMUIsWUFDa0IsV0FDQSxZQUNBLGdCQUNoQjtBQUhnQjtBQUNBO0FBQ0E7QUFObEIsU0FBUSxVQUFtQztBQUMzQyxTQUFRLFlBQVk7QUFPbkIsU0FBSyxNQUFNO0FBQUEsRUFDWjtBQUFBLEVBRUEsSUFBVyxnQkFBZ0I7QUFDMUIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsTUFBYyxRQUF1QjtBQUNwQyxRQUFJO0FBQ0gsWUFBTSxPQUFPLE1BQU0sT0FBTyxNQUFNO0FBQ2hDLFVBQUksS0FBSyxXQUFXO0FBQ25CO0FBQUEsTUFDRDtBQUNBLFdBQUssVUFBVSxLQUFLLGFBQWEsQ0FBQyxLQUFLLFFBQVEsS0FBSyxVQUFVLEtBQUssR0FBRyxDQUFDO0FBQ3ZFLFVBQUk7QUFDSCxhQUFLLFFBQVEsT0FBTyxLQUFLLGFBQWE7QUFDdEMsYUFBSyxRQUFRLEdBQUcsU0FBUyxTQUFPLEtBQUssV0FBVyxNQUFNLEdBQUcsQ0FBQztBQUFBLE1BQzNELFNBQVMsS0FBSztBQUNiLGFBQUssV0FBVyxNQUFNLDRDQUE0QztBQUFBLE1BQ25FO0FBQUEsSUFDRCxTQUFTLE9BQU87QUFDZixXQUFLLFdBQVcsTUFBTSwrQkFBK0IsS0FBSztBQUFBLElBQzNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsVUFBVSxLQUEyQixLQUFnQztBQUM1RSxVQUFNLGVBQWUsQ0FBQyxZQUFvQixjQUFrQztBQUMzRSxVQUFJLFVBQVUsWUFBWSxFQUFFLGdCQUFnQixtQkFBbUIsQ0FBQztBQUNoRSxVQUFJLElBQUksS0FBSyxVQUFVLGFBQWEsSUFBSSxHQUFHLENBQUMsUUFBYyxPQUFPLEtBQUssV0FBVyxNQUFNLEdBQUcsQ0FBQztBQUFBLElBQzVGO0FBRUEsVUFBTSxTQUFtQixDQUFDO0FBQzFCLFFBQUksWUFBWSxNQUFNO0FBQ3RCLFFBQUksR0FBRyxRQUFRLENBQUMsTUFBYyxPQUFPLEtBQUssQ0FBQyxDQUFDO0FBQzVDLFFBQUksR0FBRyxPQUFPLFlBQVk7QUFDekIsVUFBSTtBQUNILGNBQU0sT0FBMEIsS0FBSyxNQUFNLE9BQU8sS0FBSyxFQUFFLENBQUM7QUFDMUQsWUFBSTtBQUNKLGdCQUFRLEtBQUssTUFBTTtBQUFBLFVBQ2xCLEtBQUs7QUFDSix3QkFBWSxNQUFNLEtBQUssS0FBSyxJQUFJO0FBQ2hDO0FBQUEsVUFDRCxLQUFLO0FBQ0osd0JBQVksTUFBTSxLQUFLLGFBQWEsSUFBSTtBQUN4QztBQUFBLFVBQ0QsS0FBSztBQUNKLHdCQUFZLE1BQU0sS0FBSyxVQUFVLElBQUk7QUFDckM7QUFBQSxVQUNELEtBQUs7QUFDSix3QkFBWSxNQUFNLEtBQUssaUJBQWlCLElBQUk7QUFDNUM7QUFBQSxVQUNEO0FBQ0MseUJBQWEsS0FBSyx5QkFBeUIsS0FBSyxJQUFJLEVBQUU7QUFDdEQ7QUFBQSxRQUNGO0FBQ0EscUJBQWEsS0FBSyxTQUFTO0FBQUEsTUFDNUIsU0FBUyxHQUFHO0FBQ1gsY0FBTSxVQUFVLGFBQWEsUUFBUSxFQUFFLFVBQVUsS0FBSyxVQUFVLENBQUM7QUFDakUscUJBQWEsS0FBSyxPQUFPO0FBQ3pCLGFBQUssV0FBVyxNQUFNLHVDQUF1QyxDQUFDO0FBQUEsTUFDL0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLEtBQUssTUFBK0M7QUFDakUsVUFBTSxFQUFFLFVBQVUsWUFBWSxnQkFBZ0IsVUFBVSxXQUFXLFNBQVMsWUFBWSxrQkFBa0IsY0FBYyxvQkFBb0IsZ0JBQWdCLElBQUk7QUFDaEssVUFBTSxhQUFnQyxDQUFDO0FBQ3ZDLFFBQUksTUFBTSxRQUFRLFVBQVUsR0FBRztBQUM5QixpQkFBVyxLQUFLLFlBQVk7QUFDM0IsWUFBSTtBQUNILHFCQUFXLEtBQUssRUFBRSxXQUFXLElBQUksTUFBTSxDQUFDLEVBQUUsQ0FBQztBQUFBLFFBQzVDLFNBQVMsR0FBRztBQUFBLFFBRVo7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFFBQUksTUFBTSxRQUFRLFFBQVEsR0FBRztBQUM1QixpQkFBVyxLQUFLLFVBQVU7QUFDekIsWUFBSTtBQUNILGNBQUksMEJBQTBCLENBQUMsR0FBRztBQUNqQyx1QkFBVyxLQUFLLEVBQUUsY0FBYyxJQUFJLE1BQU0sQ0FBQyxFQUFFLENBQUM7QUFBQSxVQUMvQyxPQUFPO0FBQ04sdUJBQVcsS0FBSyxFQUFFLFNBQVMsSUFBSSxNQUFNLENBQUMsRUFBRSxDQUFDO0FBQUEsVUFDMUM7QUFBQSxRQUNELFNBQVMsR0FBRztBQUFBLFFBRVo7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFVBQU0sb0JBQW9CLHFCQUFxQixJQUFJLEtBQUssa0JBQWtCLElBQUk7QUFDOUUsVUFBTSxrQkFBa0IsQ0FBQyxvQkFBb0IsQ0FBQyxxQkFBcUIsQ0FBQyxXQUFXLENBQUM7QUFDaEYsVUFBTSxpQkFBcUMsRUFBRSxnQkFBZ0IsVUFBVSxXQUFXLFNBQVMsWUFBWSxjQUFjLGtCQUFrQixpQkFBaUIsbUJBQW1CLGdCQUFnQjtBQUMzTCxTQUFLLFVBQVUsZUFBZSx5QkFBeUIsWUFBWSxjQUFjO0FBQUEsRUFDbEY7QUFBQSxFQUVBLE1BQWMsYUFBYSxNQUF1RDtBQUNqRixlQUFXLGFBQWEsS0FBSyxNQUFNO0FBQ2xDLFlBQU0sTUFBTSxJQUFJLE1BQU0sU0FBUztBQUMvQixVQUFJLElBQUksV0FBVyxRQUFRO0FBRTFCO0FBQUEsTUFDRDtBQUNBLFlBQU0sS0FBSyxVQUFVLGVBQWUsMkJBQTJCLFNBQVM7QUFBQSxJQUN6RTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsaUJBQWlCLE1BQWdFO0FBQzlGLFVBQU0sY0FBYyxDQUFDLFdBQWlDLFFBQVEsSUFBSSxXQUFTLFdBQVcsS0FBSyxLQUFLLElBQUksSUFBSSxNQUFNLEtBQUssSUFBSSxLQUFLO0FBQzVILFVBQU0sY0FBYztBQUFBLE1BQ25CLE1BQU0sS0FBSztBQUFBLE1BQ1gsU0FBUyxZQUFZLEtBQUssT0FBTztBQUFBLE1BQ2pDLFdBQVcsWUFBWSxLQUFLLFNBQVM7QUFBQSxNQUNyQyxPQUFPLEtBQUs7QUFBQSxJQUNiO0FBQ0EsV0FBTyxNQUFNLEtBQUssVUFBVSxlQUFtQywrQkFBK0IsV0FBVztBQUFBLEVBQzFHO0FBQUEsRUFFQSxNQUFjLFVBQVUsTUFBbUQ7QUFDMUUsV0FBTyxNQUFNLEtBQUssVUFBVSxlQUFtQyw0QkFBNEI7QUFBQSxFQUM1RjtBQUFBLEVBRUEsVUFBZ0I7QUFDZixTQUFLLFlBQVk7QUFDakIsU0FBSyxTQUFTLE1BQU07QUFFcEIsUUFBSSxLQUFLLGtCQUFrQixRQUFRLGFBQWEsV0FBVyxHQUFHLFdBQVcsS0FBSyxjQUFjLEdBQUc7QUFDOUYsU0FBRyxXQUFXLEtBQUssY0FBYztBQUFBLElBQ2xDO0FBQUEsRUFDRDtBQUNEO0FBRU8sSUFBTSxZQUFOLGNBQXdCLGNBQWM7QUFBQSxFQUM1QyxZQUNtQixVQUNMLFlBQ1o7QUFDRCxVQUFNLFVBQVUsWUFBWSxzQkFBc0IsQ0FBQztBQUFBLEVBQ3BEO0FBQ0Q7QUFQYSxZQUFOO0FBQUEsRUFFSjtBQUFBLEVBQ0E7QUFBQSxHQUhVOyIsCiAgIm5hbWVzIjogW10KfQo=
