import { VSBuffer } from "../../../base/common/buffer.js";
import { DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { upgradeToISocket } from "../../../base/parts/ipc/node/ipc.net.js";
import { OPTIONS, parseArgs } from "../../environment/node/argv.js";
import { OpenContext } from "../../windows/electron-main/windows.js";
import { ExtensionHostDebugBroadcastChannel } from "../common/extensionHostDebugIpc.js";
class ElectronExtensionHostDebugBroadcastChannel extends ExtensionHostDebugBroadcastChannel {
  constructor(windowsMainService) {
    super();
    this.windowsMainService = windowsMainService;
  }
  call(ctx, command, arg) {
    if (command === "openExtensionDevelopmentHostWindow") {
      return this.openExtensionDevelopmentHostWindow(arg[0], arg[1]);
    } else if (command === "attachToCurrentWindowRenderer") {
      return this.attachToCurrentWindowRenderer(arg[0]);
    } else {
      return super.call(ctx, command, arg);
    }
  }
  async attachToCurrentWindowRenderer(windowId) {
    const codeWindow = this.windowsMainService.getWindowById(windowId);
    if (!codeWindow?.win) {
      return { success: false };
    }
    return this.openCdp(codeWindow.win, true);
  }
  async openExtensionDevelopmentHostWindow(args, debugRenderer) {
    const pargs = parseArgs(args, OPTIONS);
    pargs.debugRenderer = debugRenderer;
    const extDevPaths = pargs.extensionDevelopmentPath;
    if (!extDevPaths) {
      return { success: false };
    }
    const [codeWindow] = await this.windowsMainService.openExtensionDevelopmentHostWindow(extDevPaths, {
      context: OpenContext.API,
      cli: pargs,
      forceProfile: pargs.profile,
      forceTempProfile: pargs["profile-temp"]
    });
    if (!debugRenderer) {
      return { success: true };
    }
    const win = codeWindow.win;
    if (!win) {
      return { success: true };
    }
    return this.openCdp(win, false);
  }
  async openCdpServer(ident, onSocket) {
    const { createServer } = await import("http");
    const server = createServer((req, res) => {
      if (req.url === "/json/list" || req.url === "/json") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify([{
          description: "VS Code Renderer",
          devtoolsFrontendUrl: "",
          id: ident,
          title: "VS Code Renderer",
          type: "page",
          url: "vscode://renderer",
          webSocketDebuggerUrl: wsUrl
        }]));
        return;
      } else if (req.url === "/json/version") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          "Browser": "VS Code Renderer",
          "Protocol-Version": "1.3",
          "webSocketDebuggerUrl": wsUrl
        }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const serverAddr = server.address();
    const port = typeof serverAddr === "object" && serverAddr ? serverAddr.port : 0;
    const serverAddrBase = typeof serverAddr === "string" ? serverAddr : `ws://127.0.0.1:${serverAddr?.port}`;
    const wsUrl = `${serverAddrBase}/${ident}`;
    server.on("upgrade", (req, socket) => {
      if (!req.url?.includes(ident)) {
        socket.end();
        return;
      }
      const upgraded = upgradeToISocket(req, socket, {
        debugLabel: "extension-host-cdp-" + generateUuid(),
        enableMessageSplitting: false
      });
      if (upgraded) {
        onSocket(upgraded);
      }
    });
    return { server, wsUrl, port };
  }
  async openCdp(win, debugRenderer) {
    const debug = win.webContents.debugger;
    let listeners = debug.isAttached() ? Infinity : 0;
    const ident = generateUuid();
    const pageSessionId = debugRenderer ? `page-${ident}` : void 0;
    const { server, wsUrl, port } = await this.openCdpServer(ident, (listener) => {
      if (listeners++ === 0) {
        debug.attach();
      }
      const store = new DisposableStore();
      store.add(listener);
      const writeMessage = (message) => {
        if (!store.isDisposed) {
          listener.write(VSBuffer.fromString(JSON.stringify(message)));
        }
      };
      const onMessage = (_event, method, params, sessionId) => writeMessage({ method, params, sessionId: sessionId || pageSessionId });
      const onWindowClose = () => {
        listener.end();
        store.dispose();
      };
      win.addListener("close", onWindowClose);
      store.add(toDisposable(() => win.removeListener("close", onWindowClose)));
      debug.addListener("message", onMessage);
      store.add(toDisposable(() => debug.removeListener("message", onMessage)));
      store.add(listener.onData((rawData) => {
        let data;
        try {
          data = JSON.parse(rawData.toString());
        } catch (e) {
          console.error("error reading cdp line", e);
          return;
        }
        if (debugRenderer) {
          const targetInfo = { targetId: ident, type: "page", title: "VS Code Renderer", url: "vscode://renderer" };
          if (data.method === "Target.setDiscoverTargets") {
            writeMessage({ id: data.id, sessionId: data.sessionId, result: {} });
            writeMessage({ method: "Target.targetCreated", sessionId: data.sessionId, params: { targetInfo: { ...targetInfo, attached: false, canAccessOpener: false } } });
            return;
          }
          if (data.method === "Target.attachToTarget") {
            writeMessage({ id: data.id, sessionId: data.sessionId, result: { sessionId: pageSessionId } });
            writeMessage({ method: "Target.attachedToTarget", params: { sessionId: pageSessionId, targetInfo: { ...targetInfo, attached: true, canAccessOpener: false }, waitingForDebugger: false } });
            return;
          }
          if (data.method === "Target.setAutoAttach" || data.method === "Target.attachToBrowserTarget") {
            writeMessage({ id: data.id, sessionId: data.sessionId, result: data.method === "Target.attachToBrowserTarget" ? { sessionId: "browser" } : {} });
            return;
          }
          if (data.method === "Target.getTargets") {
            writeMessage({ id: data.id, sessionId: data.sessionId, result: { targetInfos: [{ ...targetInfo, attached: true }] } });
            return;
          }
        }
        const forwardSessionId = data.sessionId === pageSessionId ? void 0 : data.sessionId;
        debug.sendCommand(data.method, data.params, forwardSessionId).then((result) => writeMessage({ id: data.id, sessionId: data.sessionId, result })).catch((error) => writeMessage({ id: data.id, sessionId: data.sessionId, error: { code: 0, message: error.message } }));
      }));
      store.add(listener.onClose(() => {
        if (--listeners === 0) {
          debug.detach();
        }
      }));
    });
    win.on("close", () => server.close());
    return { rendererDebugAddr: wsUrl, success: true, port };
  }
}
export {
  ElectronExtensionHostDebugBroadcastChannel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZGVidWdcXGVsZWN0cm9uLW1haW5cXGV4dGVuc2lvbkhvc3REZWJ1Z0lwYy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEJyb3dzZXJXaW5kb3cgfSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgdHlwZSB7IFNlcnZlciB9IGZyb20gJ2h0dHAnO1xuaW1wb3J0IHsgU29ja2V0IH0gZnJvbSAnbmV0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSVNvY2tldCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMubmV0LmpzJztcbmltcG9ydCB7IHVwZ3JhZGVUb0lTb2NrZXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9ub2RlL2lwYy5uZXQuanMnO1xuaW1wb3J0IHsgT1BUSU9OUywgcGFyc2VBcmdzIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvbm9kZS9hcmd2LmpzJztcbmltcG9ydCB7IElXaW5kb3dzTWFpblNlcnZpY2UsIE9wZW5Db250ZXh0IH0gZnJvbSAnLi4vLi4vd2luZG93cy9lbGVjdHJvbi1tYWluL3dpbmRvd3MuanMnO1xuaW1wb3J0IHsgSU9wZW5FeHRlbnNpb25XaW5kb3dSZXN1bHQgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uSG9zdERlYnVnLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvc3REZWJ1Z0Jyb2FkY2FzdENoYW5uZWwgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uSG9zdERlYnVnSXBjLmpzJztcblxuZXhwb3J0IGNsYXNzIEVsZWN0cm9uRXh0ZW5zaW9uSG9zdERlYnVnQnJvYWRjYXN0Q2hhbm5lbDxUQ29udGV4dD4gZXh0ZW5kcyBFeHRlbnNpb25Ib3N0RGVidWdCcm9hZGNhc3RDaGFubmVsPFRDb250ZXh0PiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSB3aW5kb3dzTWFpblNlcnZpY2U6IElXaW5kb3dzTWFpblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNhbGwoY3R4OiBUQ29udGV4dCwgY29tbWFuZDogc3RyaW5nLCBhcmc/OiBhbnkpOiBQcm9taXNlPGFueT4ge1xuXHRcdGlmIChjb21tYW5kID09PSAnb3BlbkV4dGVuc2lvbkRldmVsb3BtZW50SG9zdFdpbmRvdycpIHtcblx0XHRcdHJldHVybiB0aGlzLm9wZW5FeHRlbnNpb25EZXZlbG9wbWVudEhvc3RXaW5kb3coYXJnWzBdLCBhcmdbMV0pO1xuXHRcdH0gZWxzZSBpZiAoY29tbWFuZCA9PT0gJ2F0dGFjaFRvQ3VycmVudFdpbmRvd1JlbmRlcmVyJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuYXR0YWNoVG9DdXJyZW50V2luZG93UmVuZGVyZXIoYXJnWzBdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHN1cGVyLmNhbGwoY3R4LCBjb21tYW5kLCBhcmcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYXR0YWNoVG9DdXJyZW50V2luZG93UmVuZGVyZXIod2luZG93SWQ6IG51bWJlcik6IFByb21pc2U8SU9wZW5FeHRlbnNpb25XaW5kb3dSZXN1bHQ+IHtcblx0XHRjb25zdCBjb2RlV2luZG93ID0gdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93QnlJZCh3aW5kb3dJZCk7XG5cdFx0aWYgKCFjb2RlV2luZG93Py53aW4pIHtcblx0XHRcdHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMub3BlbkNkcChjb2RlV2luZG93LndpbiwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5FeHRlbnNpb25EZXZlbG9wbWVudEhvc3RXaW5kb3coYXJnczogc3RyaW5nW10sIGRlYnVnUmVuZGVyZXI6IGJvb2xlYW4pOiBQcm9taXNlPElPcGVuRXh0ZW5zaW9uV2luZG93UmVzdWx0PiB7XG5cdFx0Y29uc3QgcGFyZ3MgPSBwYXJzZUFyZ3MoYXJncywgT1BUSU9OUyk7XG5cdFx0cGFyZ3MuZGVidWdSZW5kZXJlciA9IGRlYnVnUmVuZGVyZXI7XG5cblx0XHRjb25zdCBleHREZXZQYXRocyA9IHBhcmdzLmV4dGVuc2lvbkRldmVsb3BtZW50UGF0aDtcblx0XHRpZiAoIWV4dERldlBhdGhzKSB7XG5cdFx0XHRyZXR1cm4geyBzdWNjZXNzOiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IFtjb2RlV2luZG93XSA9IGF3YWl0IHRoaXMud2luZG93c01haW5TZXJ2aWNlLm9wZW5FeHRlbnNpb25EZXZlbG9wbWVudEhvc3RXaW5kb3coZXh0RGV2UGF0aHMsIHtcblx0XHRcdGNvbnRleHQ6IE9wZW5Db250ZXh0LkFQSSxcblx0XHRcdGNsaTogcGFyZ3MsXG5cdFx0XHRmb3JjZVByb2ZpbGU6IHBhcmdzLnByb2ZpbGUsXG5cdFx0XHRmb3JjZVRlbXBQcm9maWxlOiBwYXJnc1sncHJvZmlsZS10ZW1wJ11cblx0XHR9KTtcblxuXHRcdGlmICghZGVidWdSZW5kZXJlcikge1xuXHRcdFx0cmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpbiA9IGNvZGVXaW5kb3cud2luO1xuXHRcdGlmICghd2luKSB7XG5cdFx0XHRyZXR1cm4geyBzdWNjZXNzOiB0cnVlIH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMub3BlbkNkcCh3aW4sIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkNkcFNlcnZlcihpZGVudDogc3RyaW5nLCBvblNvY2tldDogKHNvY2tldDogSVNvY2tldCkgPT4gdm9pZCk6IFByb21pc2U8eyBzZXJ2ZXI6IFNlcnZlcjsgd3NVcmw6IHN0cmluZzsgcG9ydDogbnVtYmVyIH0+IHtcblx0XHRjb25zdCB7IGNyZWF0ZVNlcnZlciB9ID0gYXdhaXQgaW1wb3J0KCdodHRwJyk7IC8vIExhenkgZHVlIHRvIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9pc3N1ZXMvNTk2ODZcblx0XHRjb25zdCBzZXJ2ZXIgPSBjcmVhdGVTZXJ2ZXIoKHJlcSwgcmVzKSA9PiB7XG5cdFx0XHRpZiAocmVxLnVybCA9PT0gJy9qc29uL2xpc3QnIHx8IHJlcS51cmwgPT09ICcvanNvbicpIHtcblx0XHRcdFx0cmVzLnNldEhlYWRlcignQ29udGVudC1UeXBlJywgJ2FwcGxpY2F0aW9uL2pzb24nKTtcblx0XHRcdFx0cmVzLmVuZChKU09OLnN0cmluZ2lmeShbe1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnVlMgQ29kZSBSZW5kZXJlcicsXG5cdFx0XHRcdFx0ZGV2dG9vbHNGcm9udGVuZFVybDogJycsXG5cdFx0XHRcdFx0aWQ6IGlkZW50LFxuXHRcdFx0XHRcdHRpdGxlOiAnVlMgQ29kZSBSZW5kZXJlcicsXG5cdFx0XHRcdFx0dHlwZTogJ3BhZ2UnLFxuXHRcdFx0XHRcdHVybDogJ3ZzY29kZTovL3JlbmRlcmVyJyxcblx0XHRcdFx0XHR3ZWJTb2NrZXREZWJ1Z2dlclVybDogd3NVcmxcblx0XHRcdFx0fV0pKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBlbHNlIGlmIChyZXEudXJsID09PSAnL2pzb24vdmVyc2lvbicpIHtcblx0XHRcdFx0cmVzLnNldEhlYWRlcignQ29udGVudC1UeXBlJywgJ2FwcGxpY2F0aW9uL2pzb24nKTtcblx0XHRcdFx0cmVzLmVuZChKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0J0Jyb3dzZXInOiAnVlMgQ29kZSBSZW5kZXJlcicsXG5cdFx0XHRcdFx0J1Byb3RvY29sLVZlcnNpb24nOiAnMS4zJyxcblx0XHRcdFx0XHQnd2ViU29ja2V0RGVidWdnZXJVcmwnOiB3c1VybFxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0cmVzLnN0YXR1c0NvZGUgPSA0MDQ7XG5cdFx0XHRyZXMuZW5kKCk7XG5cdFx0fSk7XG5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHNlcnZlci5saXN0ZW4oMCwgJzEyNy4wLjAuMScsIHIpKTtcblx0XHRjb25zdCBzZXJ2ZXJBZGRyID0gc2VydmVyLmFkZHJlc3MoKTtcblx0XHRjb25zdCBwb3J0ID0gdHlwZW9mIHNlcnZlckFkZHIgPT09ICdvYmplY3QnICYmIHNlcnZlckFkZHIgPyBzZXJ2ZXJBZGRyLnBvcnQgOiAwO1xuXHRcdGNvbnN0IHNlcnZlckFkZHJCYXNlID0gdHlwZW9mIHNlcnZlckFkZHIgPT09ICdzdHJpbmcnID8gc2VydmVyQWRkciA6IGB3czovLzEyNy4wLjAuMToke3NlcnZlckFkZHI/LnBvcnR9YDtcblx0XHRjb25zdCB3c1VybCA9IGAke3NlcnZlckFkZHJCYXNlfS8ke2lkZW50fWA7XG5cblx0XHRzZXJ2ZXIub24oJ3VwZ3JhZGUnLCAocmVxLCBzb2NrZXQpID0+IHtcblx0XHRcdGlmICghcmVxLnVybD8uaW5jbHVkZXMoaWRlbnQpKSB7XG5cdFx0XHRcdHNvY2tldC5lbmQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdXBncmFkZWQgPSB1cGdyYWRlVG9JU29ja2V0KHJlcSwgc29ja2V0IGFzIFNvY2tldCwge1xuXHRcdFx0XHRkZWJ1Z0xhYmVsOiAnZXh0ZW5zaW9uLWhvc3QtY2RwLScgKyBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0ZW5hYmxlTWVzc2FnZVNwbGl0dGluZzogZmFsc2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHVwZ3JhZGVkKSB7XG5cdFx0XHRcdG9uU29ja2V0KHVwZ3JhZGVkKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiB7IHNlcnZlciwgd3NVcmwsIHBvcnQgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkNkcCh3aW46IEJyb3dzZXJXaW5kb3csIGRlYnVnUmVuZGVyZXI6IGJvb2xlYW4pOiBQcm9taXNlPElPcGVuRXh0ZW5zaW9uV2luZG93UmVzdWx0PiB7XG5cdFx0Y29uc3QgZGVidWcgPSB3aW4ud2ViQ29udGVudHMuZGVidWdnZXI7XG5cblx0XHRsZXQgbGlzdGVuZXJzID0gZGVidWcuaXNBdHRhY2hlZCgpID8gSW5maW5pdHkgOiAwO1xuXHRcdGNvbnN0IGlkZW50ID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgcGFnZVNlc3Npb25JZCA9IGRlYnVnUmVuZGVyZXIgPyBgcGFnZS0ke2lkZW50fWAgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgeyBzZXJ2ZXIsIHdzVXJsLCBwb3J0IH0gPSBhd2FpdCB0aGlzLm9wZW5DZHBTZXJ2ZXIoaWRlbnQsIGxpc3RlbmVyID0+IHtcblx0XHRcdGlmIChsaXN0ZW5lcnMrKyA9PT0gMCkge1xuXHRcdFx0XHRkZWJ1Zy5hdHRhY2goKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRzdG9yZS5hZGQobGlzdGVuZXIpO1xuXG5cdFx0XHRjb25zdCB3cml0ZU1lc3NhZ2UgPSAobWVzc2FnZTogb2JqZWN0KSA9PiB7XG5cdFx0XHRcdGlmICghc3RvcmUuaXNEaXNwb3NlZCkgeyAvLyBpbiBjYXNlIHNlbmRDb21tYW5kIHByb21pc2VzIHNldHRsZSBhZnRlciBjbG9zZWRcblx0XHRcdFx0XHRsaXN0ZW5lci53cml0ZShWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpKSk7IC8vIG51bGwtZGVsaW1pdGVkLCBDRFAtY29tcGF0aWJsZVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBvbk1lc3NhZ2UgPSAoX2V2ZW50OiBFbGVjdHJvbi5FdmVudCwgbWV0aG9kOiBzdHJpbmcsIHBhcmFtczogdW5rbm93biwgc2Vzc2lvbklkPzogc3RyaW5nKSA9PlxuXHRcdFx0XHR3cml0ZU1lc3NhZ2UoeyBtZXRob2QsIHBhcmFtcywgc2Vzc2lvbklkOiBzZXNzaW9uSWQgfHwgcGFnZVNlc3Npb25JZCB9KTtcblxuXHRcdFx0Y29uc3Qgb25XaW5kb3dDbG9zZSA9ICgpID0+IHtcblx0XHRcdFx0bGlzdGVuZXIuZW5kKCk7XG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdH07XG5cblx0XHRcdHdpbi5hZGRMaXN0ZW5lcignY2xvc2UnLCBvbldpbmRvd0Nsb3NlKTtcblx0XHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gd2luLnJlbW92ZUxpc3RlbmVyKCdjbG9zZScsIG9uV2luZG93Q2xvc2UpKSk7XG5cblx0XHRcdGRlYnVnLmFkZExpc3RlbmVyKCdtZXNzYWdlJywgb25NZXNzYWdlKTtcblx0XHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gZGVidWcucmVtb3ZlTGlzdGVuZXIoJ21lc3NhZ2UnLCBvbk1lc3NhZ2UpKSk7XG5cblx0XHRcdHN0b3JlLmFkZChsaXN0ZW5lci5vbkRhdGEocmF3RGF0YSA9PiB7XG5cdFx0XHRcdGxldCBkYXRhOiB7IGlkOiBudW1iZXI7IHNlc3Npb25JZD86IHN0cmluZzsgbWV0aG9kOiBzdHJpbmc7IHBhcmFtczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRkYXRhID0gSlNPTi5wYXJzZShyYXdEYXRhLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcignZXJyb3IgcmVhZGluZyBjZHAgbGluZScsIGUpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChkZWJ1Z1JlbmRlcmVyKSB7XG5cdFx0XHRcdFx0Ly8gRW11bGF0ZSBUYXJnZXQuKiBtZXRob2RzIHRoYXQganMtZGVidWcgZXhwZWN0cyBidXQgRWxlY3Ryb24ncyBkZWJ1Z2dlciBkb2Vzbid0IHN1cHBvcnRcblx0XHRcdFx0XHRjb25zdCB0YXJnZXRJbmZvID0geyB0YXJnZXRJZDogaWRlbnQsIHR5cGU6ICdwYWdlJywgdGl0bGU6ICdWUyBDb2RlIFJlbmRlcmVyJywgdXJsOiAndnNjb2RlOi8vcmVuZGVyZXInIH07XG5cdFx0XHRcdFx0aWYgKGRhdGEubWV0aG9kID09PSAnVGFyZ2V0LnNldERpc2NvdmVyVGFyZ2V0cycpIHtcblx0XHRcdFx0XHRcdHdyaXRlTWVzc2FnZSh7IGlkOiBkYXRhLmlkLCBzZXNzaW9uSWQ6IGRhdGEuc2Vzc2lvbklkLCByZXN1bHQ6IHt9IH0pO1xuXHRcdFx0XHRcdFx0d3JpdGVNZXNzYWdlKHsgbWV0aG9kOiAnVGFyZ2V0LnRhcmdldENyZWF0ZWQnLCBzZXNzaW9uSWQ6IGRhdGEuc2Vzc2lvbklkLCBwYXJhbXM6IHsgdGFyZ2V0SW5mbzogeyAuLi50YXJnZXRJbmZvLCBhdHRhY2hlZDogZmFsc2UsIGNhbkFjY2Vzc09wZW5lcjogZmFsc2UgfSB9IH0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZGF0YS5tZXRob2QgPT09ICdUYXJnZXQuYXR0YWNoVG9UYXJnZXQnKSB7XG5cdFx0XHRcdFx0XHR3cml0ZU1lc3NhZ2UoeyBpZDogZGF0YS5pZCwgc2Vzc2lvbklkOiBkYXRhLnNlc3Npb25JZCwgcmVzdWx0OiB7IHNlc3Npb25JZDogcGFnZVNlc3Npb25JZCB9IH0pO1xuXHRcdFx0XHRcdFx0d3JpdGVNZXNzYWdlKHsgbWV0aG9kOiAnVGFyZ2V0LmF0dGFjaGVkVG9UYXJnZXQnLCBwYXJhbXM6IHsgc2Vzc2lvbklkOiBwYWdlU2Vzc2lvbklkLCB0YXJnZXRJbmZvOiB7IC4uLnRhcmdldEluZm8sIGF0dGFjaGVkOiB0cnVlLCBjYW5BY2Nlc3NPcGVuZXI6IGZhbHNlIH0sIHdhaXRpbmdGb3JEZWJ1Z2dlcjogZmFsc2UgfSB9KTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGRhdGEubWV0aG9kID09PSAnVGFyZ2V0LnNldEF1dG9BdHRhY2gnIHx8IGRhdGEubWV0aG9kID09PSAnVGFyZ2V0LmF0dGFjaFRvQnJvd3NlclRhcmdldCcpIHtcblx0XHRcdFx0XHRcdHdyaXRlTWVzc2FnZSh7IGlkOiBkYXRhLmlkLCBzZXNzaW9uSWQ6IGRhdGEuc2Vzc2lvbklkLCByZXN1bHQ6IGRhdGEubWV0aG9kID09PSAnVGFyZ2V0LmF0dGFjaFRvQnJvd3NlclRhcmdldCcgPyB7IHNlc3Npb25JZDogJ2Jyb3dzZXInIH0gOiB7fSB9KTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGRhdGEubWV0aG9kID09PSAnVGFyZ2V0LmdldFRhcmdldHMnKSB7XG5cdFx0XHRcdFx0XHR3cml0ZU1lc3NhZ2UoeyBpZDogZGF0YS5pZCwgc2Vzc2lvbklkOiBkYXRhLnNlc3Npb25JZCwgcmVzdWx0OiB7IHRhcmdldEluZm9zOiBbeyAuLi50YXJnZXRJbmZvLCBhdHRhY2hlZDogdHJ1ZSB9XSB9IH0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEZvcndhcmQgdG8gRWxlY3Ryb24ncyBkZWJ1Z2dlciwgc3RyaXBwaW5nIG91ciBzeW50aGV0aWMgcGFnZSBzZXNzaW9uSWRcblx0XHRcdFx0Y29uc3QgZm9yd2FyZFNlc3Npb25JZCA9IGRhdGEuc2Vzc2lvbklkID09PSBwYWdlU2Vzc2lvbklkID8gdW5kZWZpbmVkIDogZGF0YS5zZXNzaW9uSWQ7XG5cblx0XHRcdFx0ZGVidWcuc2VuZENvbW1hbmQoZGF0YS5tZXRob2QsIGRhdGEucGFyYW1zLCBmb3J3YXJkU2Vzc2lvbklkKVxuXHRcdFx0XHRcdC50aGVuKChyZXN1bHQ6IG9iamVjdCkgPT4gd3JpdGVNZXNzYWdlKHsgaWQ6IGRhdGEuaWQsIHNlc3Npb25JZDogZGF0YS5zZXNzaW9uSWQsIHJlc3VsdCB9KSlcblx0XHRcdFx0XHQuY2F0Y2goKGVycm9yOiBFcnJvcikgPT4gd3JpdGVNZXNzYWdlKHsgaWQ6IGRhdGEuaWQsIHNlc3Npb25JZDogZGF0YS5zZXNzaW9uSWQsIGVycm9yOiB7IGNvZGU6IDAsIG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UgfSB9KSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHN0b3JlLmFkZChsaXN0ZW5lci5vbkNsb3NlKCgpID0+IHtcblx0XHRcdFx0aWYgKC0tbGlzdGVuZXJzID09PSAwKSB7XG5cdFx0XHRcdFx0ZGVidWcuZGV0YWNoKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KTtcblxuXHRcdHdpbi5vbignY2xvc2UnLCAoKSA9PiBzZXJ2ZXIuY2xvc2UoKSk7XG5cblx0XHRyZXR1cm4geyByZW5kZXJlckRlYnVnQWRkcjogd3NVcmwsIHN1Y2Nlc3M6IHRydWUsIHBvcnQ6IHBvcnQgfTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBUUEsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNB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
