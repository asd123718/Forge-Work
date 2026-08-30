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
import { ipcRenderer } from "../../../../base/parts/sandbox/electron-browser/globals.js";
import { URI } from "../../../../base/common/uri.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { registerRemoteContributions } from "./terminalRemote.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ITerminalService } from "../browser/terminal.js";
import { disposableWindowInterval, getActiveWindow } from "../../../../base/browser/dom.js";
let TerminalNativeContribution = class extends Disposable {
  constructor(_fileService, _terminalService, remoteAgentService, nativeHostService) {
    super();
    this._fileService = _fileService;
    this._terminalService = _terminalService;
    ipcRenderer.on("vscode:openFiles", (_, ...args) => {
      this._onOpenFileRequest(args[0]);
    });
    this._register(nativeHostService.onDidResumeOS(() => this._onOsResume()));
    this._terminalService.setNativeDelegate({
      getWindowCount: () => nativeHostService.getWindowCount()
    });
    const connection = remoteAgentService.getConnection();
    if (connection && connection.remoteAuthority) {
      registerRemoteContributions();
    }
  }
  _onOsResume() {
    for (const instance of this._terminalService.instances) {
      instance.xterm?.forceRedraw();
    }
  }
  async _onOpenFileRequest(request) {
    if (request.termProgram === "vscode" && request.filesToWait) {
      const waitMarkerFileUri = URI.revive(request.filesToWait.waitMarkerFileUri);
      await this._whenFileDeleted(waitMarkerFileUri);
      this._terminalService.activeInstance?.focus();
    }
  }
  _whenFileDeleted(path) {
    return new Promise((resolve) => {
      let running = false;
      const interval = disposableWindowInterval(getActiveWindow(), async () => {
        if (!running) {
          running = true;
          const exists = await this._fileService.exists(path);
          running = false;
          if (!exists) {
            interval.dispose();
            resolve(void 0);
          }
        }
      }, 1e3);
    });
  }
};
TerminalNativeContribution = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, ITerminalService),
  __decorateParam(2, IRemoteAgentService),
  __decorateParam(3, INativeHostService)
], TerminalNativeContribution);
export {
  TerminalNativeContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxlbGVjdHJvbi1icm93c2VyXFx0ZXJtaW5hbE5hdGl2ZUNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlwY1JlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9zYW5kYm94L2VsZWN0cm9uLWJyb3dzZXIvZ2xvYmFscy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlT3BlbkZpbGVSZXF1ZXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclJlbW90ZUNvbnRyaWJ1dGlvbnMgfSBmcm9tICcuL3Rlcm1pbmFsUmVtb3RlLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwsIGdldEFjdGl2ZVdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuXG5leHBvcnQgY2xhc3MgVGVybWluYWxOYXRpdmVDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdGRlY2xhcmUgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0aXBjUmVuZGVyZXIub24oJ3ZzY29kZTpvcGVuRmlsZXMnLCAoXzogdW5rbm93biwgLi4uYXJnczogdW5rbm93bltdKSA9PiB7IHRoaXMuX29uT3BlbkZpbGVSZXF1ZXN0KGFyZ3NbMF0gYXMgSU5hdGl2ZU9wZW5GaWxlUmVxdWVzdCk7IH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG5hdGl2ZUhvc3RTZXJ2aWNlLm9uRGlkUmVzdW1lT1MoKCkgPT4gdGhpcy5fb25Pc1Jlc3VtZSgpKSk7XG5cblx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0TmF0aXZlRGVsZWdhdGUoe1xuXHRcdFx0Z2V0V2luZG93Q291bnQ6ICgpID0+IG5hdGl2ZUhvc3RTZXJ2aWNlLmdldFdpbmRvd0NvdW50KClcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSByZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpO1xuXHRcdGlmIChjb25uZWN0aW9uICYmIGNvbm5lY3Rpb24ucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRyZWdpc3RlclJlbW90ZUNvbnRyaWJ1dGlvbnMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vbk9zUmVzdW1lKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmluc3RhbmNlcykge1xuXHRcdFx0aW5zdGFuY2UueHRlcm0/LmZvcmNlUmVkcmF3KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb25PcGVuRmlsZVJlcXVlc3QocmVxdWVzdDogSU5hdGl2ZU9wZW5GaWxlUmVxdWVzdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIGlmIHRoZSByZXF1ZXN0IHRvIG9wZW4gZmlsZXMgaXMgY29taW5nIGluIGZyb20gdGhlIGludGVncmF0ZWQgdGVybWluYWwgKGlkZW50aWZpZWQgdGhvdWdoXG5cdFx0Ly8gdGhlIHRlcm1Qcm9ncmFtIHZhcmlhYmxlKSBhbmQgd2UgYXJlIGluc3RydWN0ZWQgdG8gd2FpdCBmb3IgZWRpdG9ycyBjbG9zZSwgd2FpdCBmb3IgdGhlXG5cdFx0Ly8gbWFya2VyIGZpbGUgdG8gZ2V0IGRlbGV0ZWQgYW5kIHRoZW4gZm9jdXMgYmFjayB0byB0aGUgaW50ZWdyYXRlZCB0ZXJtaW5hbC5cblx0XHRpZiAocmVxdWVzdC50ZXJtUHJvZ3JhbSA9PT0gJ3ZzY29kZScgJiYgcmVxdWVzdC5maWxlc1RvV2FpdCkge1xuXHRcdFx0Y29uc3Qgd2FpdE1hcmtlckZpbGVVcmkgPSBVUkkucmV2aXZlKHJlcXVlc3QuZmlsZXNUb1dhaXQud2FpdE1hcmtlckZpbGVVcmkpO1xuXHRcdFx0YXdhaXQgdGhpcy5fd2hlbkZpbGVEZWxldGVkKHdhaXRNYXJrZXJGaWxlVXJpKTtcblxuXHRcdFx0Ly8gRm9jdXMgYWN0aXZlIHRlcm1pbmFsXG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2UuYWN0aXZlSW5zdGFuY2U/LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfd2hlbkZpbGVEZWxldGVkKHBhdGg6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIENvbXBsZXRlIHdoZW4gd2FpdCBtYXJrZXIgZmlsZSBpcyBkZWxldGVkXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0bGV0IHJ1bm5pbmcgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGludGVydmFsID0gZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsKGdldEFjdGl2ZVdpbmRvdygpLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGlmICghcnVubmluZykge1xuXHRcdFx0XHRcdHJ1bm5pbmcgPSB0cnVlO1xuXHRcdFx0XHRcdGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyhwYXRoKTtcblx0XHRcdFx0XHRydW5uaW5nID0gZmFsc2U7XG5cblx0XHRcdFx0XHRpZiAoIWV4aXN0cykge1xuXHRcdFx0XHRcdFx0aW50ZXJ2YWwuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSwgMTAwMCk7XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsMEJBQTBCLHVCQUF1QjtBQUVuRCxJQUFNLDZCQUFOLGNBQXlDLFdBQTZDO0FBQUEsRUFHNUYsWUFDZ0MsY0FDSSxrQkFDZCxvQkFDRCxtQkFDbkI7QUFDRCxVQUFNO0FBTHlCO0FBQ0k7QUFNbkMsZ0JBQVksR0FBRyxvQkFBb0IsQ0FBQyxNQUFlLFNBQW9CO0FBQUUsV0FBSyxtQkFBbUIsS0FBSyxDQUFDLENBQTJCO0FBQUEsSUFBRyxDQUFDO0FBQ3RJLFNBQUssVUFBVSxrQkFBa0IsY0FBYyxNQUFNLEtBQUssWUFBWSxDQUFDLENBQUM7QUFFeEUsU0FBSyxpQkFBaUIsa0JBQWtCO0FBQUEsTUFDdkMsZ0JBQWdCLE1BQU0sa0JBQWtCLGVBQWU7QUFBQSxJQUN4RCxDQUFDO0FBRUQsVUFBTSxhQUFhLG1CQUFtQixjQUFjO0FBQ3BELFFBQUksY0FBYyxXQUFXLGlCQUFpQjtBQUM3QyxrQ0FBNEI7QUFBQSxJQUM3QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGNBQW9CO0FBQzNCLGVBQVcsWUFBWSxLQUFLLGlCQUFpQixXQUFXO0FBQ3ZELGVBQVMsT0FBTyxZQUFZO0FBQUEsSUFDN0I7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLG1CQUFtQixTQUFnRDtBQUloRixRQUFJLFFBQVEsZ0JBQWdCLFlBQVksUUFBUSxhQUFhO0FBQzVELFlBQU0sb0JBQW9CLElBQUksT0FBTyxRQUFRLFlBQVksaUJBQWlCO0FBQzFFLFlBQU0sS0FBSyxpQkFBaUIsaUJBQWlCO0FBRzdDLFdBQUssaUJBQWlCLGdCQUFnQixNQUFNO0FBQUEsSUFDN0M7QUFBQSxFQUNEO0FBQUEsRUFFUSxpQkFBaUIsTUFBMEI7QUFFbEQsV0FBTyxJQUFJLFFBQWMsYUFBVztBQUNuQyxVQUFJLFVBQVU7QUFDZCxZQUFNLFdBQVcseUJBQXlCLGdCQUFnQixHQUFHLFlBQVk7QUFDeEUsWUFBSSxDQUFDLFNBQVM7QUFDYixvQkFBVTtBQUNWLGdCQUFNLFNBQVMsTUFBTSxLQUFLLGFBQWEsT0FBTyxJQUFJO0FBQ2xELG9CQUFVO0FBRVYsY0FBSSxDQUFDLFFBQVE7QUFDWixxQkFBUyxRQUFRO0FBQ2pCLG9CQUFRLE1BQVM7QUFBQSxVQUNsQjtBQUFBLFFBQ0Q7QUFBQSxNQUNELEdBQUcsR0FBSTtBQUFBLElBQ1IsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQTdEYSw2QkFBTjtBQUFBLEVBSUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
