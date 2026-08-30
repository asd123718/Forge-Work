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
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { URI } from "../../../../base/common/uri.js";
import { MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { ITerminalGroupService, ITerminalService as IIntegratedTerminalService } from "../../terminal/browser/terminal.js";
import { ResourceContextKey } from "../../../common/contextkeys.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { getMultiSelectedResources, IExplorerService } from "../../files/browser/files.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { Schemas } from "../../../../base/common/network.js";
import { distinct } from "../../../../base/common/arrays.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { isWindows } from "../../../../base/common/platform.js";
import { dirname, basename } from "../../../../base/common/path.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IExternalTerminalService } from "../../../../platform/externalTerminal/common/externalTerminal.js";
import { TerminalLocation } from "../../../../platform/terminal/common/terminal.js";
import { IListService } from "../../../../platform/list/browser/listService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
const OPEN_IN_TERMINAL_COMMAND_ID = "openInTerminal";
const OPEN_IN_INTEGRATED_TERMINAL_COMMAND_ID = "openInIntegratedTerminal";
function registerOpenTerminalCommand(id, explorerKind) {
  CommandsRegistry.registerCommand({
    id,
    handler: async (accessor, resource) => {
      const configurationService = accessor.get(IConfigurationService);
      const fileService = accessor.get(IFileService);
      const integratedTerminalService = accessor.get(IIntegratedTerminalService);
      const remoteAgentService = accessor.get(IRemoteAgentService);
      const terminalGroupService = accessor.get(ITerminalGroupService);
      let externalTerminalService = void 0;
      try {
        externalTerminalService = accessor.get(IExternalTerminalService);
      } catch {
      }
      const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
      return fileService.resolveAll(resources.map((r) => ({ resource: r }))).then(async (stats) => {
        const config = configurationService.getValue();
        const useIntegratedTerminal = remoteAgentService.getConnection() || explorerKind === "integrated";
        const targets = distinct(stats.filter((data) => data.success));
        if (useIntegratedTerminal) {
          const opened = {};
          const cwds = targets.map(({ stat }) => {
            const resource2 = stat.resource;
            if (stat.isDirectory) {
              return resource2;
            }
            return URI.from({
              scheme: resource2.scheme,
              authority: resource2.authority,
              fragment: resource2.fragment,
              query: resource2.query,
              path: dirname(resource2.path)
            });
          });
          for (const cwd of cwds) {
            if (opened[cwd.path]) {
              return;
            }
            opened[cwd.path] = true;
            const instance = await integratedTerminalService.createTerminal({ config: { cwd } });
            if (instance && instance.target !== TerminalLocation.Editor && (resources.length === 1 || !resource || cwd.path === resource.path || cwd.path === dirname(resource.path))) {
              integratedTerminalService.setActiveInstance(instance);
              terminalGroupService.showPanel(true);
            }
          }
        } else if (externalTerminalService) {
          distinct(targets.map(({ stat }) => stat.isDirectory ? stat.resource.fsPath : dirname(stat.resource.fsPath))).forEach((cwd) => {
            externalTerminalService.openTerminal(config.terminal.external, cwd);
          });
        }
      });
    }
  });
}
registerOpenTerminalCommand(OPEN_IN_TERMINAL_COMMAND_ID, "external");
registerOpenTerminalCommand(OPEN_IN_INTEGRATED_TERMINAL_COMMAND_ID, "integrated");
let ExternalTerminalContribution = class extends Disposable {
  constructor(_configurationService) {
    super();
    this._configurationService = _configurationService;
    const shouldShowIntegratedOnLocal = ContextKeyExpr.and(
      ResourceContextKey.Scheme.isEqualTo(Schemas.file),
      ContextKeyExpr.or(ContextKeyExpr.equals("config.terminal.explorerKind", "integrated"), ContextKeyExpr.equals("config.terminal.explorerKind", "both"))
    );
    const shouldShowExternalKindOnLocal = ContextKeyExpr.and(
      ResourceContextKey.Scheme.isEqualTo(Schemas.file),
      ContextKeyExpr.or(ContextKeyExpr.equals("config.terminal.explorerKind", "external"), ContextKeyExpr.equals("config.terminal.explorerKind", "both"))
    );
    this._openInIntegratedTerminalMenuItem = {
      group: "navigation",
      order: 30,
      command: {
        id: OPEN_IN_INTEGRATED_TERMINAL_COMMAND_ID,
        title: nls.localize("scopedConsoleAction.Integrated", "Open in Integrated Terminal")
      },
      when: ContextKeyExpr.or(shouldShowIntegratedOnLocal, ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote))
    };
    this._openInTerminalMenuItem = {
      group: "navigation",
      order: 31,
      command: {
        id: OPEN_IN_TERMINAL_COMMAND_ID,
        title: nls.localize("scopedConsoleAction.external", "Open in External Terminal")
      },
      when: shouldShowExternalKindOnLocal
    };
    MenuRegistry.appendMenuItem(MenuId.ExplorerContext, this._openInTerminalMenuItem);
    MenuRegistry.appendMenuItem(MenuId.ExplorerContext, this._openInIntegratedTerminalMenuItem);
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("terminal.explorerKind") || e.affectsConfiguration("terminal.external")) {
        this._refreshOpenInTerminalMenuItemTitle();
      }
    }));
    this._refreshOpenInTerminalMenuItemTitle();
  }
  isWindows() {
    const config = this._configurationService.getValue().terminal;
    if (isWindows && config.external?.windowsExec) {
      const file = basename(config.external.windowsExec);
      if (file === "wt" || file === "wt.exe") {
        return true;
      }
    }
    return false;
  }
  _refreshOpenInTerminalMenuItemTitle() {
    if (this.isWindows()) {
      this._openInTerminalMenuItem.command.title = nls.localize("scopedConsoleAction.wt", "Open in Windows Terminal");
    }
  }
};
ExternalTerminalContribution = __decorateClass([
  __decorateParam(0, IConfigurationService)
], ExternalTerminalContribution);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ExternalTerminalContribution, LifecyclePhase.Restored);
export {
  ExternalTerminalContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVybmFsVGVybWluYWxcXGJyb3dzZXJcXGV4dGVybmFsVGVybWluYWwuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIE1lbnVSZWdpc3RyeSwgSU1lbnVJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxHcm91cFNlcnZpY2UsIElUZXJtaW5hbFNlcnZpY2UgYXMgSUludGVncmF0ZWRUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFJlc291cmNlQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgZ2V0TXVsdGlTZWxlY3RlZFJlc291cmNlcywgSUV4cGxvcmVyU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2Jyb3dzZXIvZmlsZXMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUV4dGVybmFsVGVybWluYWxDb25maWd1cmF0aW9uLCBJRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlcm5hbFRlcm1pbmFsL2NvbW1vbi9leHRlcm5hbFRlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSUxpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcblxuY29uc3QgT1BFTl9JTl9URVJNSU5BTF9DT01NQU5EX0lEID0gJ29wZW5JblRlcm1pbmFsJztcbmNvbnN0IE9QRU5fSU5fSU5URUdSQVRFRF9URVJNSU5BTF9DT01NQU5EX0lEID0gJ29wZW5JbkludGVncmF0ZWRUZXJtaW5hbCc7XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyT3BlblRlcm1pbmFsQ29tbWFuZChpZDogc3RyaW5nLCBleHBsb3JlcktpbmQ6ICdpbnRlZ3JhdGVkJyB8ICdleHRlcm5hbCcpIHtcblx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRcdGlkOiBpZCxcblx0XHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIHJlc291cmNlOiBVUkkpID0+IHtcblxuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCBpbnRlZ3JhdGVkVGVybWluYWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnRlZ3JhdGVkVGVybWluYWxTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHJlbW90ZUFnZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJUmVtb3RlQWdlbnRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsR3JvdXBTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXJtaW5hbEdyb3VwU2VydmljZSk7XG5cdFx0XHRsZXQgZXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2U6IElFeHRlcm5hbFRlcm1pbmFsU2VydmljZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGV4dGVybmFsVGVybWluYWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlcm5hbFRlcm1pbmFsU2VydmljZSk7XG5cdFx0XHR9IGNhdGNoIHsgfVxuXG5cdFx0XHRjb25zdCByZXNvdXJjZXMgPSBnZXRNdWx0aVNlbGVjdGVkUmVzb3VyY2VzKHJlc291cmNlLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpKTtcblx0XHRcdHJldHVybiBmaWxlU2VydmljZS5yZXNvbHZlQWxsKHJlc291cmNlcy5tYXAociA9PiAoeyByZXNvdXJjZTogciB9KSkpLnRoZW4oYXN5bmMgc3RhdHMgPT4ge1xuXHRcdFx0XHQvLyBBbHdheXMgdXNlIGludGVncmF0ZWQgdGVybWluYWwgd2hlbiB1c2luZyBhIHJlbW90ZVxuXHRcdFx0XHRjb25zdCBjb25maWcgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRXh0ZXJuYWxUZXJtaW5hbENvbmZpZ3VyYXRpb24+KCk7XG5cblx0XHRcdFx0Y29uc3QgdXNlSW50ZWdyYXRlZFRlcm1pbmFsID0gcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKSB8fCBleHBsb3JlcktpbmQgPT09ICdpbnRlZ3JhdGVkJztcblx0XHRcdFx0Y29uc3QgdGFyZ2V0cyA9IGRpc3RpbmN0KHN0YXRzLmZpbHRlcihkYXRhID0+IGRhdGEuc3VjY2VzcykpO1xuXHRcdFx0XHRpZiAodXNlSW50ZWdyYXRlZFRlcm1pbmFsKSB7XG5cdFx0XHRcdFx0Ly8gVE9ETzogVXNlIHVyaSBmb3IgY3dkIGluIGNyZWF0ZXRlcm1pbmFsXG5cdFx0XHRcdFx0Y29uc3Qgb3BlbmVkOiB7IFtwYXRoOiBzdHJpbmddOiBib29sZWFuIH0gPSB7fTtcblx0XHRcdFx0XHRjb25zdCBjd2RzID0gdGFyZ2V0cy5tYXAoKHsgc3RhdCB9KSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IHN0YXQhLnJlc291cmNlO1xuXHRcdFx0XHRcdFx0aWYgKHN0YXQhLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiByZXNvdXJjZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBVUkkuZnJvbSh7XG5cdFx0XHRcdFx0XHRcdHNjaGVtZTogcmVzb3VyY2Uuc2NoZW1lLFxuXHRcdFx0XHRcdFx0XHRhdXRob3JpdHk6IHJlc291cmNlLmF1dGhvcml0eSxcblx0XHRcdFx0XHRcdFx0ZnJhZ21lbnQ6IHJlc291cmNlLmZyYWdtZW50LFxuXHRcdFx0XHRcdFx0XHRxdWVyeTogcmVzb3VyY2UucXVlcnksXG5cdFx0XHRcdFx0XHRcdHBhdGg6IGRpcm5hbWUocmVzb3VyY2UucGF0aClcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgY3dkIG9mIGN3ZHMpIHtcblx0XHRcdFx0XHRcdGlmIChvcGVuZWRbY3dkLnBhdGhdKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdG9wZW5lZFtjd2QucGF0aF0gPSB0cnVlO1xuXHRcdFx0XHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCBpbnRlZ3JhdGVkVGVybWluYWxTZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHsgY29uZmlnOiB7IGN3ZCB9IH0pO1xuXHRcdFx0XHRcdFx0aWYgKGluc3RhbmNlICYmIGluc3RhbmNlLnRhcmdldCAhPT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IgJiYgKHJlc291cmNlcy5sZW5ndGggPT09IDEgfHwgIXJlc291cmNlIHx8IGN3ZC5wYXRoID09PSByZXNvdXJjZS5wYXRoIHx8IGN3ZC5wYXRoID09PSBkaXJuYW1lKHJlc291cmNlLnBhdGgpKSkge1xuXHRcdFx0XHRcdFx0XHRpbnRlZ3JhdGVkVGVybWluYWxTZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRcdFx0XHRcdFx0dGVybWluYWxHcm91cFNlcnZpY2Uuc2hvd1BhbmVsKHRydWUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChleHRlcm5hbFRlcm1pbmFsU2VydmljZSkge1xuXHRcdFx0XHRcdGRpc3RpbmN0KHRhcmdldHMubWFwKCh7IHN0YXQgfSkgPT4gc3RhdCEuaXNEaXJlY3RvcnkgPyBzdGF0IS5yZXNvdXJjZS5mc1BhdGggOiBkaXJuYW1lKHN0YXQhLnJlc291cmNlLmZzUGF0aCkpKS5mb3JFYWNoKGN3ZCA9PiB7XG5cdFx0XHRcdFx0XHRleHRlcm5hbFRlcm1pbmFsU2VydmljZS5vcGVuVGVybWluYWwoY29uZmlnLnRlcm1pbmFsLmV4dGVybmFsLCBjd2QpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xufVxuXG5yZWdpc3Rlck9wZW5UZXJtaW5hbENvbW1hbmQoT1BFTl9JTl9URVJNSU5BTF9DT01NQU5EX0lELCAnZXh0ZXJuYWwnKTtcbnJlZ2lzdGVyT3BlblRlcm1pbmFsQ29tbWFuZChPUEVOX0lOX0lOVEVHUkFURURfVEVSTUlOQUxfQ09NTUFORF9JRCwgJ2ludGVncmF0ZWQnKTtcblxuZXhwb3J0IGNsYXNzIEV4dGVybmFsVGVybWluYWxDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHByaXZhdGUgX29wZW5JbkludGVncmF0ZWRUZXJtaW5hbE1lbnVJdGVtOiBJTWVudUl0ZW07XG5cdHByaXZhdGUgX29wZW5JblRlcm1pbmFsTWVudUl0ZW06IElNZW51SXRlbTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IHNob3VsZFNob3dJbnRlZ3JhdGVkT25Mb2NhbCA9IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMuZmlsZSksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5vcihDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy50ZXJtaW5hbC5leHBsb3JlcktpbmQnLCAnaW50ZWdyYXRlZCcpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy50ZXJtaW5hbC5leHBsb3JlcktpbmQnLCAnYm90aCcpKSk7XG5cblxuXHRcdGNvbnN0IHNob3VsZFNob3dFeHRlcm5hbEtpbmRPbkxvY2FsID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0UmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy5maWxlKSxcblx0XHRcdENvbnRleHRLZXlFeHByLm9yKENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLnRlcm1pbmFsLmV4cGxvcmVyS2luZCcsICdleHRlcm5hbCcpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy50ZXJtaW5hbC5leHBsb3JlcktpbmQnLCAnYm90aCcpKSk7XG5cblx0XHR0aGlzLl9vcGVuSW5JbnRlZ3JhdGVkVGVybWluYWxNZW51SXRlbSA9IHtcblx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRvcmRlcjogMzAsXG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiBPUEVOX0lOX0lOVEVHUkFURURfVEVSTUlOQUxfQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnc2NvcGVkQ29uc29sZUFjdGlvbi5JbnRlZ3JhdGVkJywgXCJPcGVuIGluIEludGVncmF0ZWQgVGVybWluYWxcIilcblx0XHRcdH0sXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihzaG91bGRTaG93SW50ZWdyYXRlZE9uTG9jYWwsIFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMudnNjb2RlUmVtb3RlKSlcblx0XHR9O1xuXG5cblx0XHR0aGlzLl9vcGVuSW5UZXJtaW5hbE1lbnVJdGVtID0ge1xuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdG9yZGVyOiAzMSxcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6IE9QRU5fSU5fVEVSTUlOQUxfQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnc2NvcGVkQ29uc29sZUFjdGlvbi5leHRlcm5hbCcsIFwiT3BlbiBpbiBFeHRlcm5hbCBUZXJtaW5hbFwiKVxuXHRcdFx0fSxcblx0XHRcdHdoZW46IHNob3VsZFNob3dFeHRlcm5hbEtpbmRPbkxvY2FsXG5cdFx0fTtcblxuXG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FeHBsb3JlckNvbnRleHQsIHRoaXMuX29wZW5JblRlcm1pbmFsTWVudUl0ZW0pO1xuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRXhwbG9yZXJDb250ZXh0LCB0aGlzLl9vcGVuSW5JbnRlZ3JhdGVkVGVybWluYWxNZW51SXRlbSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbigndGVybWluYWwuZXhwbG9yZXJLaW5kJykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbigndGVybWluYWwuZXh0ZXJuYWwnKSkge1xuXHRcdFx0XHR0aGlzLl9yZWZyZXNoT3BlbkluVGVybWluYWxNZW51SXRlbVRpdGxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVmcmVzaE9wZW5JblRlcm1pbmFsTWVudUl0ZW1UaXRsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1dpbmRvd3MoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUV4dGVybmFsVGVybWluYWxDb25maWd1cmF0aW9uPigpLnRlcm1pbmFsO1xuXHRcdGlmIChpc1dpbmRvd3MgJiYgY29uZmlnLmV4dGVybmFsPy53aW5kb3dzRXhlYykge1xuXHRcdFx0Y29uc3QgZmlsZSA9IGJhc2VuYW1lKGNvbmZpZy5leHRlcm5hbC53aW5kb3dzRXhlYyk7XG5cdFx0XHRpZiAoZmlsZSA9PT0gJ3d0JyB8fCBmaWxlID09PSAnd3QuZXhlJykge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVmcmVzaE9wZW5JblRlcm1pbmFsTWVudUl0ZW1UaXRsZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc1dpbmRvd3MoKSkge1xuXHRcdFx0dGhpcy5fb3BlbkluVGVybWluYWxNZW51SXRlbS5jb21tYW5kLnRpdGxlID0gbmxzLmxvY2FsaXplKCdzY29wZWRDb25zb2xlQWN0aW9uLnd0JywgXCJPcGVuIGluIFdpbmRvd3MgVGVybWluYWxcIik7XG5cdFx0fVxuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihFeHRlcm5hbFRlcm1pbmFsQ29udHJpYnV0aW9uLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxRQUFRLG9CQUErQjtBQUNoRCxTQUFTLHVCQUF1QixvQkFBb0Isa0NBQWtDO0FBQ3RGLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMkJBQTJCLHdCQUF3QjtBQUM1RCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBa0UsY0FBYywyQkFBMkI7QUFDM0csU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxTQUFTLGdCQUFnQjtBQUNsQyxT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
