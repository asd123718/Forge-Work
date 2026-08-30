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
import * as nls from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { isTemporaryWorkspace, IWorkspaceContextService, WorkbenchState } from "../../../../../platform/workspace/common/workspace.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ViewPane } from "../../../../browser/parts/views/viewPane.js";
import { ResourcesDropHandler } from "../../../../browser/dnd.js";
import { listDropOverBackground } from "../../../../../platform/theme/common/colorRegistry.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IViewDescriptorService } from "../../../../common/views.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { isWeb } from "../../../../../base/common/platform.js";
import { DragAndDropObserver, getWindow } from "../../../../../base/browser/dom.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
let EmptyView = class extends ViewPane {
  constructor(options, themeService, viewDescriptorService, instantiationService, keybindingService, contextMenuService, contextService, configurationService, labelService, contextKeyService, openerService, hoverService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.contextService = contextService;
    this.labelService = labelService;
    this._disposed = false;
    this._register(this.contextService.onDidChangeWorkbenchState(() => this.refreshTitle()));
    this._register(this.labelService.onDidChangeFormatters(() => this.refreshTitle()));
  }
  shouldShowWelcome() {
    return true;
  }
  renderBody(container) {
    super.renderBody(container);
    this._register(new DragAndDropObserver(container, {
      onDrop: (e) => {
        container.style.backgroundColor = "";
        const dropHandler = this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: !isWeb || isTemporaryWorkspace(this.contextService.getWorkspace()) });
        dropHandler.handleDrop(e, getWindow(container));
      },
      onDragEnter: () => {
        const color = this.themeService.getColorTheme().getColor(listDropOverBackground);
        container.style.backgroundColor = color ? color.toString() : "";
      },
      onDragEnd: () => {
        container.style.backgroundColor = "";
      },
      onDragLeave: () => {
        container.style.backgroundColor = "";
      },
      onDragOver: (e) => {
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = "copy";
        }
      }
    }));
    this.refreshTitle();
  }
  refreshTitle() {
    if (this._disposed) {
      return;
    }
    if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      this.updateTitle(EmptyView.NAME.value);
    } else {
      this.updateTitle(this.title);
    }
  }
  dispose() {
    this._disposed = true;
    super.dispose();
  }
};
EmptyView.ID = "workbench.explorer.emptyView";
EmptyView.NAME = nls.localize2("noWorkspace", "No Folder Opened");
EmptyView = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, IViewDescriptorService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IWorkspaceContextService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, ILabelService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IOpenerService),
  __decorateParam(11, IHoverService)
], EmptyView);
export {
  EmptyView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFxicm93c2VyXFx2aWV3c1xcZW1wdHlWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJVmlld2xldFZpZXdPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3c1ZpZXdsZXQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IGlzVGVtcG9yYXJ5V29ya3NwYWNlLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIFdvcmtiZW5jaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBWaWV3UGFuZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VzRHJvcEhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBsaXN0RHJvcE92ZXJCYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IERyYWdBbmREcm9wT2JzZXJ2ZXIsIGdldFdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUxvY2FsaXplZFN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcblxuZXhwb3J0IGNsYXNzIEVtcHR5VmlldyBleHRlbmRzIFZpZXdQYW5lIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9ICd3b3JrYmVuY2guZXhwbG9yZXIuZW1wdHlWaWV3Jztcblx0c3RhdGljIHJlYWRvbmx5IE5BTUU6IElMb2NhbGl6ZWRTdHJpbmcgPSBubHMubG9jYWxpemUyKCdub1dvcmtzcGFjZScsIFwiTm8gRm9sZGVyIE9wZW5lZFwiKTtcblx0cHJpdmF0ZSBfZGlzcG9zZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld2xldFZpZXdPcHRpb25zLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihvcHRpb25zLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3JrYmVuY2hTdGF0ZSgoKSA9PiB0aGlzLnJlZnJlc2hUaXRsZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYWJlbFNlcnZpY2Uub25EaWRDaGFuZ2VGb3JtYXR0ZXJzKCgpID0+IHRoaXMucmVmcmVzaFRpdGxlKCkpKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNob3VsZFNob3dXZWxjb21lKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG5ldyBEcmFnQW5kRHJvcE9ic2VydmVyKGNvbnRhaW5lciwge1xuXHRcdFx0b25Ecm9wOiBlID0+IHtcblx0XHRcdFx0Y29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICcnO1xuXHRcdFx0XHRjb25zdCBkcm9wSGFuZGxlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VzRHJvcEhhbmRsZXIsIHsgYWxsb3dXb3Jrc3BhY2VPcGVuOiAhaXNXZWIgfHwgaXNUZW1wb3JhcnlXb3Jrc3BhY2UodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSkgfSk7XG5cdFx0XHRcdGRyb3BIYW5kbGVyLmhhbmRsZURyb3AoZSwgZ2V0V2luZG93KGNvbnRhaW5lcikpO1xuXHRcdFx0fSxcblx0XHRcdG9uRHJhZ0VudGVyOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbG9yID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLmdldENvbG9yKGxpc3REcm9wT3ZlckJhY2tncm91bmQpO1xuXHRcdFx0XHRjb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gY29sb3IgPyBjb2xvci50b1N0cmluZygpIDogJyc7XG5cdFx0XHR9LFxuXHRcdFx0b25EcmFnRW5kOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAnJztcblx0XHRcdH0sXG5cdFx0XHRvbkRyYWdMZWF2ZTogKCkgPT4ge1xuXHRcdFx0XHRjb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJyc7XG5cdFx0XHR9LFxuXHRcdFx0b25EcmFnT3ZlcjogZSA9PiB7XG5cdFx0XHRcdGlmIChlLmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0XHRcdGUuZGF0YVRyYW5zZmVyLmRyb3BFZmZlY3QgPSAnY29weSc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnJlZnJlc2hUaXRsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoVGl0bGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVRpdGxlKEVtcHR5Vmlldy5OQU1FLnZhbHVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy51cGRhdGVUaXRsZSh0aGlzLnRpdGxlKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsc0JBQXNCLDBCQUEwQixzQkFBc0I7QUFDL0UsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMscUJBQXFCLGlCQUFpQjtBQUUvQyxTQUFTLHFCQUFxQjtBQUV2QixJQUFNLFlBQU4sY0FBd0IsU0FBUztBQUFBLEVBTXZDLFlBQ0MsU0FDZSxjQUNTLHVCQUNELHNCQUNILG1CQUNDLG9CQUNzQixnQkFDcEIsc0JBQ0EsY0FDSCxtQkFDSixlQUNELGNBQ2Q7QUFDRCxVQUFNLFNBQVMsbUJBQW1CLG9CQUFvQixzQkFBc0IsbUJBQW1CLHVCQUF1QixzQkFBc0IsZUFBZSxjQUFjLFlBQVk7QUFQMUk7QUFFcEI7QUFYeEIsU0FBUSxZQUFxQjtBQWtCNUIsU0FBSyxVQUFVLEtBQUssZUFBZSwwQkFBMEIsTUFBTSxLQUFLLGFBQWEsQ0FBQyxDQUFDO0FBQ3ZGLFNBQUssVUFBVSxLQUFLLGFBQWEsc0JBQXNCLE1BQU0sS0FBSyxhQUFhLENBQUMsQ0FBQztBQUFBLEVBQ2xGO0FBQUEsRUFFUyxvQkFBNkI7QUFDckMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVtQixXQUFXLFdBQThCO0FBQzNELFVBQU0sV0FBVyxTQUFTO0FBRTFCLFNBQUssVUFBVSxJQUFJLG9CQUFvQixXQUFXO0FBQUEsTUFDakQsUUFBUSxPQUFLO0FBQ1osa0JBQVUsTUFBTSxrQkFBa0I7QUFDbEMsY0FBTSxjQUFjLEtBQUsscUJBQXFCLGVBQWUsc0JBQXNCLEVBQUUsb0JBQW9CLENBQUMsU0FBUyxxQkFBcUIsS0FBSyxlQUFlLGFBQWEsQ0FBQyxFQUFFLENBQUM7QUFDN0ssb0JBQVksV0FBVyxHQUFHLFVBQVUsU0FBUyxDQUFDO0FBQUEsTUFDL0M7QUFBQSxNQUNBLGFBQWEsTUFBTTtBQUNsQixjQUFNLFFBQVEsS0FBSyxhQUFhLGNBQWMsRUFBRSxTQUFTLHNCQUFzQjtBQUMvRSxrQkFBVSxNQUFNLGtCQUFrQixRQUFRLE1BQU0sU0FBUyxJQUFJO0FBQUEsTUFDOUQ7QUFBQSxNQUNBLFdBQVcsTUFBTTtBQUNoQixrQkFBVSxNQUFNLGtCQUFrQjtBQUFBLE1BQ25DO0FBQUEsTUFDQSxhQUFhLE1BQU07QUFDbEIsa0JBQVUsTUFBTSxrQkFBa0I7QUFBQSxNQUNuQztBQUFBLE1BQ0EsWUFBWSxPQUFLO0FBQ2hCLFlBQUksRUFBRSxjQUFjO0FBQ25CLFlBQUUsYUFBYSxhQUFhO0FBQUEsUUFDN0I7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLGFBQWE7QUFBQSxFQUNuQjtBQUFBLEVBRVEsZUFBcUI7QUFDNUIsUUFBSSxLQUFLLFdBQVc7QUFDbkI7QUFBQSxJQUNEO0FBRUEsUUFBSSxLQUFLLGVBQWUsa0JBQWtCLE1BQU0sZUFBZSxXQUFXO0FBQ3pFLFdBQUssWUFBWSxVQUFVLEtBQUssS0FBSztBQUFBLElBQ3RDLE9BQU87QUFDTixXQUFLLFlBQVksS0FBSyxLQUFLO0FBQUEsSUFDNUI7QUFBQSxFQUNEO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixTQUFLLFlBQVk7QUFDakIsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBM0VhLFVBRUksS0FBYTtBQUZqQixVQUdJLE9BQXlCLElBQUksVUFBVSxlQUFlLGtCQUFrQjtBQUg1RSxZQUFOO0FBQUEsRUFRSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWxCVTsiLAogICJuYW1lcyI6IFtdCn0K
