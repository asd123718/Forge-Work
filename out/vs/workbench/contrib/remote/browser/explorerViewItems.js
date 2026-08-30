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
import { IRemoteExplorerService, REMOTE_EXPLORER_TYPE_KEY } from "../../../services/remote/common/remoteExplorerService.js";
import { isStringArray } from "../../../../base/common/types.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IStorageService, StorageScope } from "../../../../platform/storage/common/storage.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { VIEWLET_ID } from "./remoteExplorer.js";
import { getVirtualWorkspaceLocation } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { Disposable, DisposableMap } from "../../../../base/common/lifecycle.js";
const SELECTED_REMOTE_IN_EXPLORER = new RawContextKey("selectedRemoteInExplorer", "");
let SwitchRemoteViewItem = class extends Disposable {
  constructor(contextKeyService, remoteExplorerService, environmentService, storageService, workspaceContextService) {
    super();
    this.contextKeyService = contextKeyService;
    this.remoteExplorerService = remoteExplorerService;
    this.environmentService = environmentService;
    this.storageService = storageService;
    this.workspaceContextService = workspaceContextService;
    this.completedRemotes = this._register(new DisposableMap());
    this.selectedRemoteContext = SELECTED_REMOTE_IN_EXPLORER.bindTo(contextKeyService);
    this.switchRemoteMenu = MenuId.for("workbench.remote.menu.switchRemoteMenu");
    this._register(MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
      submenu: this.switchRemoteMenu,
      title: nls.localize("switchRemote.label", "Switch Remote"),
      group: "navigation",
      when: ContextKeyExpr.equals("viewContainer", VIEWLET_ID),
      order: 1,
      isSelection: true
    }));
    this._register(remoteExplorerService.onDidChangeTargetType((e) => {
      this.select(e);
    }));
  }
  setSelectionForConnection() {
    let isSetForConnection = false;
    if (this.completedRemotes.size > 0) {
      let authority;
      const remoteAuthority = this.environmentService.remoteAuthority;
      let virtualWorkspace;
      if (!remoteAuthority) {
        virtualWorkspace = getVirtualWorkspaceLocation(this.workspaceContextService.getWorkspace())?.scheme;
      }
      isSetForConnection = true;
      const explorerType = remoteAuthority ? [remoteAuthority.split("+")[0]] : virtualWorkspace ? [virtualWorkspace] : this.storageService.get(REMOTE_EXPLORER_TYPE_KEY, StorageScope.WORKSPACE)?.split(",") ?? this.storageService.get(REMOTE_EXPLORER_TYPE_KEY, StorageScope.PROFILE)?.split(",");
      if (explorerType !== void 0) {
        authority = this.getAuthorityForExplorerType(explorerType);
      }
      if (authority) {
        this.select(authority);
      }
    }
    return isSetForConnection;
  }
  select(authority) {
    this.selectedRemoteContext.set(authority[0]);
    this.remoteExplorerService.targetType = authority;
  }
  getAuthorityForExplorerType(explorerType) {
    let authority;
    for (const option of this.completedRemotes) {
      for (const authorityOption of option[1].authority) {
        for (const explorerOption of explorerType) {
          if (authorityOption === explorerOption) {
            authority = option[1].authority;
            break;
          } else if (option[1].virtualWorkspace === explorerOption) {
            authority = option[1].authority;
            break;
          }
        }
      }
    }
    return authority;
  }
  removeOptionItems(views) {
    for (const view of views) {
      if (view.group && view.group.startsWith("targets") && view.remoteAuthority && (!view.when || this.contextKeyService.contextMatchesRules(view.when))) {
        const authority = isStringArray(view.remoteAuthority) ? view.remoteAuthority : [view.remoteAuthority];
        this.completedRemotes.deleteAndDispose(authority[0]);
      }
    }
  }
  createOptionItems(views) {
    const startingCount = this.completedRemotes.size;
    for (const view of views) {
      if (view.group && view.group.startsWith("targets") && view.remoteAuthority && (!view.when || this.contextKeyService.contextMatchesRules(view.when))) {
        const text = view.name;
        const authority = isStringArray(view.remoteAuthority) ? view.remoteAuthority : [view.remoteAuthority];
        if (this.completedRemotes.has(authority[0])) {
          continue;
        }
        const thisCapture = this;
        const action = registerAction2(class extends Action2 {
          constructor() {
            super({
              id: `workbench.action.remoteExplorer.show.${authority[0]}`,
              title: text,
              toggled: SELECTED_REMOTE_IN_EXPLORER.isEqualTo(authority[0]),
              menu: {
                id: thisCapture.switchRemoteMenu
              }
            });
          }
          async run() {
            thisCapture.select(authority);
          }
        });
        this.completedRemotes.set(authority[0], { text: text.value, authority, virtualWorkspace: view.virtualWorkspace, dispose: () => action.dispose() });
      }
    }
    if (this.completedRemotes.size > startingCount) {
      this.setSelectionForConnection();
    }
  }
};
SwitchRemoteViewItem = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IRemoteExplorerService),
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IWorkspaceContextService)
], SwitchRemoteViewItem);
export {
  SELECTED_REMOTE_IN_EXPLORER,
  SwitchRemoteViewItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHJlbW90ZVxcYnJvd3NlclxcZXhwbG9yZXJWaWV3SXRlbXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElSZW1vdGVFeHBsb3JlclNlcnZpY2UsIFJFTU9URV9FWFBMT1JFUl9UWVBFX0tFWSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZWxlY3RPcHRpb25JdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NlbGVjdEJveC9zZWxlY3RCb3guanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nQXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFZJRVdMRVRfSUQgfSBmcm9tICcuL3JlbW90ZUV4cGxvcmVyLmpzJztcbmltcG9ydCB7IGdldFZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vdmlydHVhbFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuaW50ZXJmYWNlIElSZW1vdGVTZWxlY3RJdGVtIGV4dGVuZHMgSVNlbGVjdE9wdGlvbkl0ZW0ge1xuXHRhdXRob3JpdHk6IHN0cmluZ1tdO1xuXHR2aXJ0dWFsV29ya3NwYWNlPzogc3RyaW5nO1xuXHRkaXNwb3NlKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjb25zdCBTRUxFQ1RFRF9SRU1PVEVfSU5fRVhQTE9SRVIgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmc+KCdzZWxlY3RlZFJlbW90ZUluRXhwbG9yZXInLCAnJyk7XG5cbmV4cG9ydCBjbGFzcyBTd2l0Y2hSZW1vdGVWaWV3SXRlbSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHN3aXRjaFJlbW90ZU1lbnU6IE1lbnVJZDtcblx0cHJpdmF0ZSBjb21wbGV0ZWRSZW1vdGVzOiBEaXNwb3NhYmxlTWFwPHN0cmluZywgSVJlbW90ZVNlbGVjdEl0ZW0+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXAoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2VsZWN0ZWRSZW1vdGVDb250ZXh0OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlIHByaXZhdGUgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5zZWxlY3RlZFJlbW90ZUNvbnRleHQgPSBTRUxFQ1RFRF9SRU1PVEVfSU5fRVhQTE9SRVIuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuc3dpdGNoUmVtb3RlTWVudSA9IE1lbnVJZC5mb3IoJ3dvcmtiZW5jaC5yZW1vdGUubWVudS5zd2l0Y2hSZW1vdGVNZW51Jyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGUsIHtcblx0XHRcdHN1Ym1lbnU6IHRoaXMuc3dpdGNoUmVtb3RlTWVudSxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3N3aXRjaFJlbW90ZS5sYWJlbCcsIFwiU3dpdGNoIFJlbW90ZVwiKSxcblx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXInLCBWSUVXTEVUX0lEKSxcblx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0aXNTZWxlY3Rpb246IHRydWVcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVtb3RlRXhwbG9yZXJTZXJ2aWNlLm9uRGlkQ2hhbmdlVGFyZ2V0VHlwZShlID0+IHtcblx0XHRcdHRoaXMuc2VsZWN0KGUpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRTZWxlY3Rpb25Gb3JDb25uZWN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdGxldCBpc1NldEZvckNvbm5lY3Rpb24gPSBmYWxzZTtcblx0XHRpZiAodGhpcy5jb21wbGV0ZWRSZW1vdGVzLnNpemUgPiAwKSB7XG5cdFx0XHRsZXQgYXV0aG9yaXR5OiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eTtcblx0XHRcdGxldCB2aXJ0dWFsV29ya3NwYWNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIXJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHR2aXJ0dWFsV29ya3NwYWNlID0gZ2V0VmlydHVhbFdvcmtzcGFjZUxvY2F0aW9uKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkpPy5zY2hlbWU7XG5cdFx0XHR9XG5cdFx0XHRpc1NldEZvckNvbm5lY3Rpb24gPSB0cnVlO1xuXHRcdFx0Y29uc3QgZXhwbG9yZXJUeXBlOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCA9IHJlbW90ZUF1dGhvcml0eSA/IFtyZW1vdGVBdXRob3JpdHkuc3BsaXQoJysnKVswXV1cblx0XHRcdFx0OiAodmlydHVhbFdvcmtzcGFjZSA/IFt2aXJ0dWFsV29ya3NwYWNlXVxuXHRcdFx0XHRcdDogKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFJFTU9URV9FWFBMT1JFUl9UWVBFX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk/LnNwbGl0KCcsJykgPz8gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoUkVNT1RFX0VYUExPUkVSX1RZUEVfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk/LnNwbGl0KCcsJykpKTtcblx0XHRcdGlmIChleHBsb3JlclR5cGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRhdXRob3JpdHkgPSB0aGlzLmdldEF1dGhvcml0eUZvckV4cGxvcmVyVHlwZShleHBsb3JlclR5cGUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGF1dGhvcml0eSkge1xuXHRcdFx0XHR0aGlzLnNlbGVjdChhdXRob3JpdHkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gaXNTZXRGb3JDb25uZWN0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBzZWxlY3QoYXV0aG9yaXR5OiBzdHJpbmdbXSkge1xuXHRcdHRoaXMuc2VsZWN0ZWRSZW1vdGVDb250ZXh0LnNldChhdXRob3JpdHlbMF0pO1xuXHRcdHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnRhcmdldFR5cGUgPSBhdXRob3JpdHk7XG5cdH1cblxuXHRwcml2YXRlIGdldEF1dGhvcml0eUZvckV4cGxvcmVyVHlwZShleHBsb3JlclR5cGU6IHN0cmluZ1tdKTogc3RyaW5nW10gfCB1bmRlZmluZWQge1xuXHRcdGxldCBhdXRob3JpdHk6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3Qgb3B0aW9uIG9mIHRoaXMuY29tcGxldGVkUmVtb3Rlcykge1xuXHRcdFx0Zm9yIChjb25zdCBhdXRob3JpdHlPcHRpb24gb2Ygb3B0aW9uWzFdLmF1dGhvcml0eSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGV4cGxvcmVyT3B0aW9uIG9mIGV4cGxvcmVyVHlwZSkge1xuXHRcdFx0XHRcdGlmIChhdXRob3JpdHlPcHRpb24gPT09IGV4cGxvcmVyT3B0aW9uKSB7XG5cdFx0XHRcdFx0XHRhdXRob3JpdHkgPSBvcHRpb25bMV0uYXV0aG9yaXR5O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChvcHRpb25bMV0udmlydHVhbFdvcmtzcGFjZSA9PT0gZXhwbG9yZXJPcHRpb24pIHtcblx0XHRcdFx0XHRcdGF1dGhvcml0eSA9IG9wdGlvblsxXS5hdXRob3JpdHk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGF1dGhvcml0eTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVPcHRpb25JdGVtcyh2aWV3czogSVZpZXdEZXNjcmlwdG9yW10pIHtcblx0XHRmb3IgKGNvbnN0IHZpZXcgb2Ygdmlld3MpIHtcblx0XHRcdGlmICh2aWV3Lmdyb3VwICYmIHZpZXcuZ3JvdXAuc3RhcnRzV2l0aCgndGFyZ2V0cycpICYmIHZpZXcucmVtb3RlQXV0aG9yaXR5ICYmICghdmlldy53aGVuIHx8IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyh2aWV3LndoZW4pKSkge1xuXHRcdFx0XHRjb25zdCBhdXRob3JpdHkgPSBpc1N0cmluZ0FycmF5KHZpZXcucmVtb3RlQXV0aG9yaXR5KSA/IHZpZXcucmVtb3RlQXV0aG9yaXR5IDogW3ZpZXcucmVtb3RlQXV0aG9yaXR5XTtcblx0XHRcdFx0dGhpcy5jb21wbGV0ZWRSZW1vdGVzLmRlbGV0ZUFuZERpc3Bvc2UoYXV0aG9yaXR5WzBdKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlT3B0aW9uSXRlbXModmlld3M6IElWaWV3RGVzY3JpcHRvcltdKSB7XG5cdFx0Y29uc3Qgc3RhcnRpbmdDb3VudCA9IHRoaXMuY29tcGxldGVkUmVtb3Rlcy5zaXplO1xuXHRcdGZvciAoY29uc3QgdmlldyBvZiB2aWV3cykge1xuXHRcdFx0aWYgKHZpZXcuZ3JvdXAgJiYgdmlldy5ncm91cC5zdGFydHNXaXRoKCd0YXJnZXRzJykgJiYgdmlldy5yZW1vdGVBdXRob3JpdHkgJiYgKCF2aWV3LndoZW4gfHwgdGhpcy5jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHZpZXcud2hlbikpKSB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSB2aWV3Lm5hbWU7XG5cdFx0XHRcdGNvbnN0IGF1dGhvcml0eSA9IGlzU3RyaW5nQXJyYXkodmlldy5yZW1vdGVBdXRob3JpdHkpID8gdmlldy5yZW1vdGVBdXRob3JpdHkgOiBbdmlldy5yZW1vdGVBdXRob3JpdHldO1xuXHRcdFx0XHRpZiAodGhpcy5jb21wbGV0ZWRSZW1vdGVzLmhhcyhhdXRob3JpdHlbMF0pKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdGhpc0NhcHR1cmUgPSB0aGlzO1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSByZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9uLnJlbW90ZUV4cGxvcmVyLnNob3cuJHthdXRob3JpdHlbMF19YCxcblx0XHRcdFx0XHRcdFx0dGl0bGU6IHRleHQsXG5cdFx0XHRcdFx0XHRcdHRvZ2dsZWQ6IFNFTEVDVEVEX1JFTU9URV9JTl9FWFBMT1JFUi5pc0VxdWFsVG8oYXV0aG9yaXR5WzBdKSxcblx0XHRcdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0XHRcdGlkOiB0aGlzQ2FwdHVyZS5zd2l0Y2hSZW1vdGVNZW51XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdFx0XHR0aGlzQ2FwdHVyZS5zZWxlY3QoYXV0aG9yaXR5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLmNvbXBsZXRlZFJlbW90ZXMuc2V0KGF1dGhvcml0eVswXSwgeyB0ZXh0OiB0ZXh0LnZhbHVlLCBhdXRob3JpdHksIHZpcnR1YWxXb3Jrc3BhY2U6IHZpZXcudmlydHVhbFdvcmtzcGFjZSwgZGlzcG9zZTogKCkgPT4gYWN0aW9uLmRpc3Bvc2UoKSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuY29tcGxldGVkUmVtb3Rlcy5zaXplID4gc3RhcnRpbmdDb3VudCkge1xuXHRcdFx0dGhpcy5zZXRTZWxlY3Rpb25Gb3JDb25uZWN0aW9uKCk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLHdCQUF3QixnQ0FBZ0M7QUFHakUsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsZ0JBQTZCLG9CQUFvQixxQkFBcUI7QUFDL0UsU0FBUyxTQUFTLFFBQVEsY0FBYyx1QkFBdUI7QUFDL0QsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxZQUFZ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
