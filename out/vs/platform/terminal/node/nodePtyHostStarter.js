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
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { FileAccess, Schemas } from "../../../base/common/network.js";
import { Client } from "../../../base/parts/ipc/node/ipc.cp.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { parsePtyHostDebugPort } from "../../environment/node/environmentService.js";
let NodePtyHostStarter = class extends Disposable {
  constructor(_reconnectConstants, _environmentService) {
    super();
    this._reconnectConstants = _reconnectConstants;
    this._environmentService = _environmentService;
  }
  start() {
    const opts = {
      serverName: "Pty Host",
      args: ["--type=ptyHost", "--logsPath", this._environmentService.logsHome.with({ scheme: Schemas.file }).fsPath],
      env: {
        VSCODE_ESM_ENTRYPOINT: "vs/platform/terminal/node/ptyHostMain",
        VSCODE_PIPE_LOGGING: "true",
        VSCODE_VERBOSE_LOGGING: "true",
        // transmit console logs from server to client,
        VSCODE_RECONNECT_GRACE_TIME: this._reconnectConstants.graceTime,
        VSCODE_RECONNECT_SHORT_GRACE_TIME: this._reconnectConstants.shortGraceTime,
        VSCODE_RECONNECT_SCROLLBACK: this._reconnectConstants.scrollback
      }
    };
    const ptyHostDebug = parsePtyHostDebugPort(this._environmentService.args, this._environmentService.isBuilt);
    if (ptyHostDebug) {
      if (ptyHostDebug.break && ptyHostDebug.port) {
        opts.debugBrk = ptyHostDebug.port;
      } else if (!ptyHostDebug.break && ptyHostDebug.port) {
        opts.debug = ptyHostDebug.port;
      }
    }
    const client = new Client(FileAccess.asFileUri("bootstrap-fork").fsPath, opts);
    const store = new DisposableStore();
    store.add(client);
    return {
      client,
      store,
      onDidProcessExit: client.onDidProcessExit
    };
  }
};
NodePtyHostStarter = __decorateClass([
  __decorateParam(1, IEnvironmentService)
], NodePtyHostStarter);
export {
  NodePtyHostStarter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXG5vZGVcXG5vZGVQdHlIb3N0U3RhcnRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzLCBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBDbGllbnQsIElJUENPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvbm9kZS9pcGMuY3AuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSwgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBwYXJzZVB0eUhvc3REZWJ1Z1BvcnQgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9ub2RlL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVjb25uZWN0Q29uc3RhbnRzIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElQdHlIb3N0Q29ubmVjdGlvbiwgSVB0eUhvc3RTdGFydGVyIH0gZnJvbSAnLi9wdHlIb3N0LmpzJztcblxuZXhwb3J0IGNsYXNzIE5vZGVQdHlIb3N0U3RhcnRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUHR5SG9zdFN0YXJ0ZXIge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZWNvbm5lY3RDb25zdGFudHM6IElSZWNvbm5lY3RDb25zdGFudHMsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRzdGFydCgpOiBJUHR5SG9zdENvbm5lY3Rpb24ge1xuXHRcdGNvbnN0IG9wdHM6IElJUENPcHRpb25zID0ge1xuXHRcdFx0c2VydmVyTmFtZTogJ1B0eSBIb3N0Jyxcblx0XHRcdGFyZ3M6IFsnLS10eXBlPXB0eUhvc3QnLCAnLS1sb2dzUGF0aCcsIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5sb2dzSG9tZS53aXRoKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUgfSkuZnNQYXRoXSxcblx0XHRcdGVudjoge1xuXHRcdFx0XHRWU0NPREVfRVNNX0VOVFJZUE9JTlQ6ICd2cy9wbGF0Zm9ybS90ZXJtaW5hbC9ub2RlL3B0eUhvc3RNYWluJyxcblx0XHRcdFx0VlNDT0RFX1BJUEVfTE9HR0lORzogJ3RydWUnLFxuXHRcdFx0XHRWU0NPREVfVkVSQk9TRV9MT0dHSU5HOiAndHJ1ZScsIC8vIHRyYW5zbWl0IGNvbnNvbGUgbG9ncyBmcm9tIHNlcnZlciB0byBjbGllbnQsXG5cdFx0XHRcdFZTQ09ERV9SRUNPTk5FQ1RfR1JBQ0VfVElNRTogdGhpcy5fcmVjb25uZWN0Q29uc3RhbnRzLmdyYWNlVGltZSxcblx0XHRcdFx0VlNDT0RFX1JFQ09OTkVDVF9TSE9SVF9HUkFDRV9USU1FOiB0aGlzLl9yZWNvbm5lY3RDb25zdGFudHMuc2hvcnRHcmFjZVRpbWUsXG5cdFx0XHRcdFZTQ09ERV9SRUNPTk5FQ1RfU0NST0xMQkFDSzogdGhpcy5fcmVjb25uZWN0Q29uc3RhbnRzLnNjcm9sbGJhY2tcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcHR5SG9zdERlYnVnID0gcGFyc2VQdHlIb3N0RGVidWdQb3J0KHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcmdzLCB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCk7XG5cdFx0aWYgKHB0eUhvc3REZWJ1Zykge1xuXHRcdFx0aWYgKHB0eUhvc3REZWJ1Zy5icmVhayAmJiBwdHlIb3N0RGVidWcucG9ydCkge1xuXHRcdFx0XHRvcHRzLmRlYnVnQnJrID0gcHR5SG9zdERlYnVnLnBvcnQ7XG5cdFx0XHR9IGVsc2UgaWYgKCFwdHlIb3N0RGVidWcuYnJlYWsgJiYgcHR5SG9zdERlYnVnLnBvcnQpIHtcblx0XHRcdFx0b3B0cy5kZWJ1ZyA9IHB0eUhvc3REZWJ1Zy5wb3J0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBDbGllbnQoRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ2Jvb3RzdHJhcC1mb3JrJykuZnNQYXRoLCBvcHRzKTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChjbGllbnQpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNsaWVudCxcblx0XHRcdHN0b3JlLFxuXHRcdFx0b25EaWRQcm9jZXNzRXhpdDogY2xpZW50Lm9uRGlkUHJvY2Vzc0V4aXRcblx0XHR9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxZQUFZLGVBQWU7QUFDcEMsU0FBUyxjQUEyQjtBQUNwQyxTQUFTLDJCQUFzRDtBQUMvRCxTQUFTLDZCQUE2QjtBQUkvQixJQUFNLHFCQUFOLGNBQWlDLFdBQXNDO0FBQUEsRUFDN0UsWUFDa0IscUJBQ3FCLHFCQUNyQztBQUNELFVBQU07QUFIVztBQUNxQjtBQUFBLEVBR3ZDO0FBQUEsRUFFQSxRQUE0QjtBQUMzQixVQUFNLE9BQW9CO0FBQUEsTUFDekIsWUFBWTtBQUFBLE1BQ1osTUFBTSxDQUFDLGtCQUFrQixjQUFjLEtBQUssb0JBQW9CLFNBQVMsS0FBSyxFQUFFLFFBQVEsUUFBUSxLQUFLLENBQUMsRUFBRSxNQUFNO0FBQUEsTUFDOUcsS0FBSztBQUFBLFFBQ0osdUJBQXVCO0FBQUEsUUFDdkIscUJBQXFCO0FBQUEsUUFDckIsd0JBQXdCO0FBQUE7QUFBQSxRQUN4Qiw2QkFBNkIsS0FBSyxvQkFBb0I7QUFBQSxRQUN0RCxtQ0FBbUMsS0FBSyxvQkFBb0I7QUFBQSxRQUM1RCw2QkFBNkIsS0FBSyxvQkFBb0I7QUFBQSxNQUN2RDtBQUFBLElBQ0Q7QUFFQSxVQUFNLGVBQWUsc0JBQXNCLEtBQUssb0JBQW9CLE1BQU0sS0FBSyxvQkFBb0IsT0FBTztBQUMxRyxRQUFJLGNBQWM7QUFDakIsVUFBSSxhQUFhLFNBQVMsYUFBYSxNQUFNO0FBQzVDLGFBQUssV0FBVyxhQUFhO0FBQUEsTUFDOUIsV0FBVyxDQUFDLGFBQWEsU0FBUyxhQUFhLE1BQU07QUFDcEQsYUFBSyxRQUFRLGFBQWE7QUFBQSxNQUMzQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsSUFBSSxPQUFPLFdBQVcsVUFBVSxnQkFBZ0IsRUFBRSxRQUFRLElBQUk7QUFFN0UsVUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLFVBQU0sSUFBSSxNQUFNO0FBRWhCLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0Esa0JBQWtCLE9BQU87QUFBQSxJQUMxQjtBQUFBLEVBQ0Q7QUFDRDtBQTFDYSxxQkFBTjtBQUFBLEVBR0o7QUFBQSxHQUhVOyIsCiAgIm5hbWVzIjogW10KfQo=
