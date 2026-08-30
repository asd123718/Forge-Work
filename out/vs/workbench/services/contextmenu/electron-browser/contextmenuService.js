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
import { Separator, SubmenuAction } from "../../../../base/common/actions.js";
import * as dom from "../../../../base/browser/dom.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { getZoomFactor } from "../../../../base/browser/browser.js";
import { unmnemonicLabel } from "../../../../base/common/labels.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { createSingleCallFunction } from "../../../../base/common/functional.js";
import { popup } from "../../../../base/parts/contextmenu/electron-browser/contextmenu.js";
import { hasNativeContextMenu, MenuSettings } from "../../../../platform/window/common/window.js";
import { isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextMenuMenuDelegate, ContextMenuService as HTMLContextMenuService } from "../../../../platform/contextview/browser/contextMenuService.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { stripIcons } from "../../../../base/common/iconLabels.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { Emitter } from "../../../../base/common/event.js";
import { AnchorAlignment, AnchorAxisAlignment, isAnchor } from "../../../../base/browser/ui/contextview/contextview.js";
import { IMenuService } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
let ContextMenuService = class {
  get onDidShowContextMenu() {
    return this.impl.onDidShowContextMenu;
  }
  get onDidHideContextMenu() {
    return this.impl.onDidHideContextMenu;
  }
  constructor(notificationService, telemetryService, keybindingService, configurationService, contextViewService, menuService, contextKeyService) {
    function createContextMenuService(native) {
      return native ? new NativeContextMenuService(notificationService, telemetryService, keybindingService, menuService, contextKeyService) : new HTMLContextMenuService(telemetryService, notificationService, contextViewService, keybindingService, menuService, contextKeyService);
    }
    let isNativeContextMenu = hasNativeContextMenu(configurationService);
    this.impl = createContextMenuService(isNativeContextMenu);
    if (isMacintosh) {
      this.listener = configurationService.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration(MenuSettings.MenuStyle)) {
          return;
        }
        const newIsNativeContextMenu = hasNativeContextMenu(configurationService);
        if (newIsNativeContextMenu === isNativeContextMenu) {
          return;
        }
        this.impl.dispose();
        this.impl = createContextMenuService(newIsNativeContextMenu);
        isNativeContextMenu = newIsNativeContextMenu;
      });
    }
  }
  dispose() {
    this.listener?.dispose();
    this.impl.dispose();
  }
  showContextMenu(delegate) {
    this.impl.showContextMenu(delegate);
  }
};
ContextMenuService = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextViewService),
  __decorateParam(5, IMenuService),
  __decorateParam(6, IContextKeyService)
], ContextMenuService);
let NativeContextMenuService = class extends Disposable {
  constructor(notificationService, telemetryService, keybindingService, menuService, contextKeyService) {
    super();
    this.notificationService = notificationService;
    this.telemetryService = telemetryService;
    this.keybindingService = keybindingService;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this._onDidShowContextMenu = this._store.add(new Emitter());
    this.onDidShowContextMenu = this._onDidShowContextMenu.event;
    this._onDidHideContextMenu = this._store.add(new Emitter());
    this.onDidHideContextMenu = this._onDidHideContextMenu.event;
  }
  showContextMenu(delegate) {
    delegate = ContextMenuMenuDelegate.transform(delegate, this.menuService, this.contextKeyService);
    const actions = delegate.getActions();
    if (actions.length) {
      const onHide = createSingleCallFunction(() => {
        delegate.onHide?.(false);
        dom.ModifierKeyEmitter.getInstance().resetKeyStatus();
        this._onDidHideContextMenu.fire();
      });
      const menu = this.createMenu(delegate, actions, onHide);
      const anchor = delegate.getAnchor();
      let x;
      let y;
      let zoom = getZoomFactor(dom.isHTMLElement(anchor) ? dom.getWindow(anchor) : dom.getActiveWindow());
      if (dom.isHTMLElement(anchor)) {
        const clientRect = anchor.getBoundingClientRect();
        const elementPosition = { left: clientRect.left, top: clientRect.top, width: clientRect.width, height: clientRect.height };
        const win = dom.getWindow(anchor);
        const vw = win.innerWidth;
        const vh = win.innerHeight;
        const isClipped = clientRect.left < 0 || clientRect.top < 0 || clientRect.right > vw || clientRect.bottom > vh;
        zoom *= dom.getDomNodeZoomLevel(anchor);
        if (isClipped) {
          x = Math.min(Math.max(clientRect.right, 0), vw);
          y = Math.min(Math.max(clientRect.bottom, 0), vh);
        } else {
          if (delegate.anchorAxisAlignment === AnchorAxisAlignment.HORIZONTAL) {
            if (delegate.anchorAlignment === AnchorAlignment.LEFT) {
              x = elementPosition.left;
              y = elementPosition.top;
            } else {
              x = elementPosition.left + elementPosition.width;
              y = elementPosition.top;
            }
            if (!isMacintosh) {
              const window = dom.getWindow(anchor);
              const availableHeightForMenu = window.screen.height - y;
              if (availableHeightForMenu < actions.length * (isWindows ? 45 : 32)) {
                y += elementPosition.height;
              }
            }
          } else {
            if (delegate.anchorAlignment === AnchorAlignment.LEFT) {
              x = elementPosition.left;
              y = elementPosition.top + elementPosition.height;
            } else {
              x = elementPosition.left + elementPosition.width;
              y = elementPosition.top + elementPosition.height;
            }
          }
        }
        if (isMacintosh) {
          y += 4 / zoom;
        }
      } else if (isAnchor(anchor)) {
        x = anchor.x;
        y = anchor.y;
      } else {
      }
      if (typeof x === "number") {
        x = Math.floor(x * zoom);
      }
      if (typeof y === "number") {
        y = Math.floor(y * zoom);
      }
      popup(menu, { x, y, positioningItem: delegate.autoSelectFirstItem ? 0 : void 0 }, () => onHide());
      this._onDidShowContextMenu.fire();
    }
  }
  createMenu(delegate, entries, onHide, submenuIds = /* @__PURE__ */ new Set()) {
    return coalesce(entries.map((entry) => this.createMenuItem(delegate, entry, onHide, submenuIds)));
  }
  createMenuItem(delegate, entry, onHide, submenuIds) {
    if (entry instanceof Separator) {
      return { type: "separator" };
    }
    if (entry instanceof SubmenuAction) {
      if (submenuIds.has(entry.id)) {
        console.warn(`Found submenu cycle: ${entry.id}`);
        return void 0;
      }
      return {
        label: unmnemonicLabel(stripIcons(entry.label)).trim(),
        submenu: this.createMenu(delegate, entry.actions, onHide, /* @__PURE__ */ new Set([...submenuIds, entry.id]))
      };
    } else {
      let type = void 0;
      if (entry.checked) {
        if (typeof delegate.getCheckedActionsRepresentation === "function") {
          type = delegate.getCheckedActionsRepresentation(entry);
        } else {
          type = "checkbox";
        }
      }
      const item = {
        label: unmnemonicLabel(stripIcons(entry.label)).trim(),
        checked: !!entry.checked,
        type,
        enabled: !!entry.enabled,
        click: (event) => {
          onHide();
          this.runAction(entry, delegate, event);
        }
      };
      const keybinding = delegate.getKeyBinding ? delegate.getKeyBinding(entry) : this.keybindingService.lookupKeybinding(entry.id);
      if (keybinding) {
        const electronAccelerator = keybinding.getElectronAccelerator();
        if (electronAccelerator) {
          item.accelerator = electronAccelerator;
        } else {
          const label = keybinding.getLabel();
          if (label) {
            item.label = `${item.label} [${label}]`;
          }
        }
      }
      return item;
    }
  }
  async runAction(actionToRun, delegate, event) {
    if (!delegate.skipTelemetry) {
      this.telemetryService.publicLog2("workbenchActionExecuted", { id: actionToRun.id, from: "contextMenu" });
    }
    const context = delegate.getActionsContext ? delegate.getActionsContext(event) : void 0;
    try {
      if (delegate.actionRunner) {
        await delegate.actionRunner.run(actionToRun, context);
      } else if (actionToRun.enabled) {
        await actionToRun.run(context);
      }
    } catch (error) {
      this.notificationService.error(error);
    }
  }
};
NativeContextMenuService = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IMenuService),
  __decorateParam(4, IContextKeyService)
], NativeContextMenuService);
registerSingleton(IContextMenuService, ContextMenuService, InstantiationType.Delayed);
export {
  ContextMenuService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxjb250ZXh0bWVudVxcZWxlY3Ryb24tYnJvd3NlclxcY29udGV4dG1lbnVTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUFjdGlvbiwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbiwgU2VwYXJhdG9yLCBTdWJtZW51QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVNZW51RGVsZWdhdGUsIElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBnZXRab29tRmFjdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgdW5tbmVtb25pY0xhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51RGVsZWdhdGUsIElDb250ZXh0TWVudUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2NvbnRleHRtZW51LmpzJztcbmltcG9ydCB7IGNyZWF0ZVNpbmdsZUNhbGxGdW5jdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Z1bmN0aW9uYWwuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvY29udGV4dG1lbnUvY29tbW9uL2NvbnRleHRtZW51LmpzJztcbmltcG9ydCB7IHBvcHVwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9jb250ZXh0bWVudS9lbGVjdHJvbi1icm93c2VyL2NvbnRleHRtZW51LmpzJztcbmltcG9ydCB7IGhhc05hdGl2ZUNvbnRleHRNZW51LCBNZW51U2V0dGluZ3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0TWVudU1lbnVEZWxlZ2F0ZSwgQ29udGV4dE1lbnVTZXJ2aWNlIGFzIEhUTUxDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRNZW51U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IHN0cmlwSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQW5jaG9yQWxpZ25tZW50LCBBbmNob3JBeGlzQWxpZ25tZW50LCBpc0FuY2hvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5leHBvcnQgY2xhc3MgQ29udGV4dE1lbnVTZXJ2aWNlIGltcGxlbWVudHMgSUNvbnRleHRNZW51U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBpbXBsOiBIVE1MQ29udGV4dE1lbnVTZXJ2aWNlIHwgTmF0aXZlQ29udGV4dE1lbnVTZXJ2aWNlO1xuXHRwcml2YXRlIGxpc3RlbmVyPzogSURpc3Bvc2FibGU7XG5cblx0Z2V0IG9uRGlkU2hvd0NvbnRleHRNZW51KCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMuaW1wbC5vbkRpZFNob3dDb250ZXh0TWVudTsgfVxuXHRnZXQgb25EaWRIaWRlQ29udGV4dE1lbnUoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5pbXBsLm9uRGlkSGlkZUNvbnRleHRNZW51OyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRmdW5jdGlvbiBjcmVhdGVDb250ZXh0TWVudVNlcnZpY2UobmF0aXZlOiBib29sZWFuKSB7XG5cdFx0XHRyZXR1cm4gbmF0aXZlID9cblx0XHRcdFx0bmV3IE5hdGl2ZUNvbnRleHRNZW51U2VydmljZShub3RpZmljYXRpb25TZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgbWVudVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlKVxuXHRcdFx0XHQ6IG5ldyBIVE1MQ29udGV4dE1lbnVTZXJ2aWNlKHRlbGVtZXRyeVNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIGNvbnRleHRWaWV3U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIG1lbnVTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0fVxuXG5cdFx0Ly8gc2V0IGluaXRpYWwgY29udGV4dCBtZW51IHNlcnZpY2Vcblx0XHRsZXQgaXNOYXRpdmVDb250ZXh0TWVudSA9IGhhc05hdGl2ZUNvbnRleHRNZW51KGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLmltcGwgPSBjcmVhdGVDb250ZXh0TWVudVNlcnZpY2UoaXNOYXRpdmVDb250ZXh0TWVudSk7XG5cblx0XHQvLyBNYWNPUyBkb2VzIG5vdCBuZWVkIGEgcmVzdGFydCB3aGVuIHRoZSBtZW51IHN0eWxlIGNoYW5nZXNcblx0XHQvLyBJdCBzaG91bGQgdXBkYXRlIHRoZSBjb250ZXh0IG1lbnUgc3R5bGUgb24gbWVudSBzdHlsZSBjb25maWd1cmF0aW9uIGNoYW5nZVxuXHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0dGhpcy5saXN0ZW5lciA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdFx0aWYgKCFlLmFmZmVjdHNDb25maWd1cmF0aW9uKE1lbnVTZXR0aW5ncy5NZW51U3R5bGUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbmV3SXNOYXRpdmVDb250ZXh0TWVudSA9IGhhc05hdGl2ZUNvbnRleHRNZW51KGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0aWYgKG5ld0lzTmF0aXZlQ29udGV4dE1lbnUgPT09IGlzTmF0aXZlQ29udGV4dE1lbnUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmltcGwuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLmltcGwgPSBjcmVhdGVDb250ZXh0TWVudVNlcnZpY2UobmV3SXNOYXRpdmVDb250ZXh0TWVudSk7XG5cdFx0XHRcdGlzTmF0aXZlQ29udGV4dE1lbnUgPSBuZXdJc05hdGl2ZUNvbnRleHRNZW51O1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5pbXBsLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHNob3dDb250ZXh0TWVudShkZWxlZ2F0ZTogSUNvbnRleHRNZW51RGVsZWdhdGUgfCBJQ29udGV4dE1lbnVNZW51RGVsZWdhdGUpOiB2b2lkIHtcblx0XHR0aGlzLmltcGwuc2hvd0NvbnRleHRNZW51KGRlbGVnYXRlKTtcblx0fVxufVxuXG5jbGFzcyBOYXRpdmVDb250ZXh0TWVudVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNvbnRleHRNZW51U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTaG93Q29udGV4dE1lbnUgPSB0aGlzLl9zdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2hvd0NvbnRleHRNZW51ID0gdGhpcy5fb25EaWRTaG93Q29udGV4dE1lbnUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRIaWRlQ29udGV4dE1lbnUgPSB0aGlzLl9zdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkSGlkZUNvbnRleHRNZW51ID0gdGhpcy5fb25EaWRIaWRlQ29udGV4dE1lbnUuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHNob3dDb250ZXh0TWVudShkZWxlZ2F0ZTogSUNvbnRleHRNZW51RGVsZWdhdGUgfCBJQ29udGV4dE1lbnVNZW51RGVsZWdhdGUpOiB2b2lkIHtcblxuXHRcdGRlbGVnYXRlID0gQ29udGV4dE1lbnVNZW51RGVsZWdhdGUudHJhbnNmb3JtKGRlbGVnYXRlLCB0aGlzLm1lbnVTZXJ2aWNlLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBkZWxlZ2F0ZS5nZXRBY3Rpb25zKCk7XG5cdFx0aWYgKGFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBvbkhpZGUgPSBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24oKCkgPT4ge1xuXHRcdFx0XHRkZWxlZ2F0ZS5vbkhpZGU/LihmYWxzZSk7XG5cblx0XHRcdFx0ZG9tLk1vZGlmaWVyS2V5RW1pdHRlci5nZXRJbnN0YW5jZSgpLnJlc2V0S2V5U3RhdHVzKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkSGlkZUNvbnRleHRNZW51LmZpcmUoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBtZW51ID0gdGhpcy5jcmVhdGVNZW51KGRlbGVnYXRlLCBhY3Rpb25zLCBvbkhpZGUpO1xuXHRcdFx0Y29uc3QgYW5jaG9yID0gZGVsZWdhdGUuZ2V0QW5jaG9yKCk7XG5cblx0XHRcdGxldCB4OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgeTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRsZXQgem9vbSA9IGdldFpvb21GYWN0b3IoZG9tLmlzSFRNTEVsZW1lbnQoYW5jaG9yKSA/IGRvbS5nZXRXaW5kb3coYW5jaG9yKSA6IGRvbS5nZXRBY3RpdmVXaW5kb3coKSk7XG5cdFx0XHRpZiAoZG9tLmlzSFRNTEVsZW1lbnQoYW5jaG9yKSkge1xuXHRcdFx0XHRjb25zdCBjbGllbnRSZWN0ID0gYW5jaG9yLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0XHRjb25zdCBlbGVtZW50UG9zaXRpb24gPSB7IGxlZnQ6IGNsaWVudFJlY3QubGVmdCwgdG9wOiBjbGllbnRSZWN0LnRvcCwgd2lkdGg6IGNsaWVudFJlY3Qud2lkdGgsIGhlaWdodDogY2xpZW50UmVjdC5oZWlnaHQgfTtcblxuXHRcdFx0XHQvLyBEZXRlcm1pbmUgaWYgZWxlbWVudCBpcyBjbGlwcGVkIGJ5IHZpZXdwb3J0OyBpZiBzbyB3ZSdsbCB1c2UgdGhlIGJvdHRvbS1yaWdodCBvZiB0aGUgdmlzaWJsZSBwb3J0aW9uXG5cdFx0XHRcdGNvbnN0IHdpbiA9IGRvbS5nZXRXaW5kb3coYW5jaG9yKTtcblx0XHRcdFx0Y29uc3QgdncgPSB3aW4uaW5uZXJXaWR0aDtcblx0XHRcdFx0Y29uc3QgdmggPSB3aW4uaW5uZXJIZWlnaHQ7XG5cdFx0XHRcdGNvbnN0IGlzQ2xpcHBlZCA9IGNsaWVudFJlY3QubGVmdCA8IDAgfHwgY2xpZW50UmVjdC50b3AgPCAwIHx8IGNsaWVudFJlY3QucmlnaHQgPiB2dyB8fCBjbGllbnRSZWN0LmJvdHRvbSA+IHZoO1xuXG5cdFx0XHRcdC8vIFdoZW4gZHJhd2luZyBjb250ZXh0IG1lbnVzLCB3ZSBhZGp1c3QgdGhlIHBpeGVsIHBvc2l0aW9uIGZvciBuYXRpdmUgbWVudXMgdXNpbmcgem9vbSBsZXZlbFxuXHRcdFx0XHQvLyBJbiBhcmVhcyB3aGVyZSB6b29tIGlzIGFwcGxpZWQgdG8gdGhlIGVsZW1lbnQgb3IgaXRzIGFuY2VzdG9ycywgd2UgbmVlZCB0byBhZGp1c3QgYWNjb3JkaW5nbHlcblx0XHRcdFx0Ly8gZS5nLiBUaGUgdGl0bGUgYmFyIGhhcyBjb3VudGVyIHpvb20gYmVoYXZpb3IgbWVhbmluZyBpdCBhcHBsaWVzIHRoZSBpbnZlcnNlIG9mIHpvb20gbGV2ZWwuXG5cdFx0XHRcdC8vIFdpbmRvdyBab29tIExldmVsOiAxLjUsIFRpdGxlIEJhciBab29tOiAxLzEuNSwgQ29vcmRpbmF0ZSBNdWx0aXBsaWVyOiAxLjUgKiAxLjAgLyAxLjUgPSAxLjBcblx0XHRcdFx0em9vbSAqPSBkb20uZ2V0RG9tTm9kZVpvb21MZXZlbChhbmNob3IpO1xuXG5cdFx0XHRcdGlmIChpc0NsaXBwZWQpIHtcblx0XHRcdFx0XHQvLyBFbGVtZW50IGlzIHBhcnRpYWxseSBvdXQgb2Ygdmlld3BvcnQ6IGFsd2F5cyBwbGFjZSBhdCBib3R0b20tcmlnaHQgdmlzaWJsZSBjb3JuZXJcblx0XHRcdFx0XHR4ID0gTWF0aC5taW4oTWF0aC5tYXgoY2xpZW50UmVjdC5yaWdodCwgMCksIHZ3KTtcblx0XHRcdFx0XHR5ID0gTWF0aC5taW4oTWF0aC5tYXgoY2xpZW50UmVjdC5ib3R0b20sIDApLCB2aCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gUG9zaXRpb24gYWNjb3JkaW5nIHRvIHRoZSBheGlzIGFsaWdubWVudCBhbmQgdGhlIGFuY2hvciBhbGlnbm1lbnQ6XG5cdFx0XHRcdFx0Ly8gYEhPUklaT05UQUxgIGFsaWducyBhdCB0aGUgdG9wIGxlZnQgb3IgcmlnaHQgb2YgdGhlIGFuY2hvciBhbmRcblx0XHRcdFx0XHQvLyAgYFZFUlRJQ0FMYCBhbGlnbnMgYXQgdGhlIGJvdHRvbSBsZWZ0IG9mIHRoZSBhbmNob3IuXG5cdFx0XHRcdFx0aWYgKGRlbGVnYXRlLmFuY2hvckF4aXNBbGlnbm1lbnQgPT09IEFuY2hvckF4aXNBbGlnbm1lbnQuSE9SSVpPTlRBTCkge1xuXHRcdFx0XHRcdFx0aWYgKGRlbGVnYXRlLmFuY2hvckFsaWdubWVudCA9PT0gQW5jaG9yQWxpZ25tZW50LkxFRlQpIHtcblx0XHRcdFx0XHRcdFx0eCA9IGVsZW1lbnRQb3NpdGlvbi5sZWZ0O1xuXHRcdFx0XHRcdFx0XHR5ID0gZWxlbWVudFBvc2l0aW9uLnRvcDtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHggPSBlbGVtZW50UG9zaXRpb24ubGVmdCArIGVsZW1lbnRQb3NpdGlvbi53aWR0aDtcblx0XHRcdFx0XHRcdFx0eSA9IGVsZW1lbnRQb3NpdGlvbi50b3A7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmICghaXNNYWNpbnRvc2gpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgd2luZG93ID0gZG9tLmdldFdpbmRvdyhhbmNob3IpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBhdmFpbGFibGVIZWlnaHRGb3JNZW51ID0gd2luZG93LnNjcmVlbi5oZWlnaHQgLSB5O1xuXHRcdFx0XHRcdFx0XHRpZiAoYXZhaWxhYmxlSGVpZ2h0Rm9yTWVudSA8IGFjdGlvbnMubGVuZ3RoICogKGlzV2luZG93cyA/IDQ1IDogMzIpIC8qIGd1ZXNzIG9mIDEgbWVudSBpdGVtIGhlaWdodCAqLykge1xuXHRcdFx0XHRcdFx0XHRcdC8vIHRoaXMgaXMgYSBndWVzcyB0byBkZXRlY3Qgd2hldGhlciB0aGUgY29udGV4dCBtZW51IHdvdWxkXG5cdFx0XHRcdFx0XHRcdFx0Ly8gb3BlbiB0byB0aGUgYm90dG9tIGZyb20gdGhpcyBwb2ludCBvciB0byB0aGUgdG9wLiBJZiB0aGVcblx0XHRcdFx0XHRcdFx0XHQvLyBtZW51IG9wZW5zIHRvIHRoZSB0b3AsIG1ha2Ugc3VyZSB0byBhbGlnbiBpdCB0byB0aGUgYm90dG9tXG5cdFx0XHRcdFx0XHRcdFx0Ly8gb2YgdGhlIGFuY2hvciBhbmQgbm90IHRvIHRoZSB0b3AuXG5cdFx0XHRcdFx0XHRcdFx0Ly8gdGhpcyBzZWVtcyB0byBiZSBvbmx5IG5lY2Vzc2FyeSBmb3IgV2luZG93cyBhbmQgTGludXguXG5cdFx0XHRcdFx0XHRcdFx0eSArPSBlbGVtZW50UG9zaXRpb24uaGVpZ2h0O1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGlmIChkZWxlZ2F0ZS5hbmNob3JBbGlnbm1lbnQgPT09IEFuY2hvckFsaWdubWVudC5MRUZUKSB7XG5cdFx0XHRcdFx0XHRcdHggPSBlbGVtZW50UG9zaXRpb24ubGVmdDtcblx0XHRcdFx0XHRcdFx0eSA9IGVsZW1lbnRQb3NpdGlvbi50b3AgKyBlbGVtZW50UG9zaXRpb24uaGVpZ2h0O1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0eCA9IGVsZW1lbnRQb3NpdGlvbi5sZWZ0ICsgZWxlbWVudFBvc2l0aW9uLndpZHRoO1xuXHRcdFx0XHRcdFx0XHR5ID0gZWxlbWVudFBvc2l0aW9uLnRvcCArIGVsZW1lbnRQb3NpdGlvbi5oZWlnaHQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU2hpZnQgbWFjT1MgbWVudXMgYnkgYSBmZXcgcGl4ZWxzIGJlbG93IGVsZW1lbnRzXG5cdFx0XHRcdC8vIHRvIGFjY291bnQgZm9yIGV4dHJhIHBhZGRpbmcgb24gdG9wIG9mIG5hdGl2ZSBtZW51XG5cdFx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy84NDIzMVxuXHRcdFx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdFx0XHR5ICs9IDQgLyB6b29tO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGlzQW5jaG9yKGFuY2hvcikpIHtcblx0XHRcdFx0eCA9IGFuY2hvci54O1xuXHRcdFx0XHR5ID0gYW5jaG9yLnk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBXZSBsZWF2ZSB4L3kgdW5kZWZpbmVkIGluIHRoaXMgY2FzZSB3aGljaCB3aWxsIHJlc3VsdCBpblxuXHRcdFx0XHQvLyBFbGVjdHJvbiB0YWtpbmcgY2FyZSBvZiBvcGVuaW5nIHRoZSBtZW51IGF0IHRoZSBjdXJzb3IgcG9zaXRpb24uXG5cdFx0XHR9XG5cblx0XHRcdGlmICh0eXBlb2YgeCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0eCA9IE1hdGguZmxvb3IoeCAqIHpvb20pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodHlwZW9mIHkgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHkgPSBNYXRoLmZsb29yKHkgKiB6b29tKTtcblx0XHRcdH1cblxuXHRcdFx0cG9wdXAobWVudSwgeyB4LCB5LCBwb3NpdGlvbmluZ0l0ZW06IGRlbGVnYXRlLmF1dG9TZWxlY3RGaXJzdEl0ZW0gPyAwIDogdW5kZWZpbmVkLCB9LCAoKSA9PiBvbkhpZGUoKSk7XG5cblx0XHRcdHRoaXMuX29uRGlkU2hvd0NvbnRleHRNZW51LmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU1lbnUoZGVsZWdhdGU6IElDb250ZXh0TWVudURlbGVnYXRlLCBlbnRyaWVzOiByZWFkb25seSBJQWN0aW9uW10sIG9uSGlkZTogKCkgPT4gdm9pZCwgc3VibWVudUlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpKTogSUNvbnRleHRNZW51SXRlbVtdIHtcblx0XHRyZXR1cm4gY29hbGVzY2UoZW50cmllcy5tYXAoZW50cnkgPT4gdGhpcy5jcmVhdGVNZW51SXRlbShkZWxlZ2F0ZSwgZW50cnksIG9uSGlkZSwgc3VibWVudUlkcykpKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlTWVudUl0ZW0oZGVsZWdhdGU6IElDb250ZXh0TWVudURlbGVnYXRlLCBlbnRyeTogSUFjdGlvbiwgb25IaWRlOiAoKSA9PiB2b2lkLCBzdWJtZW51SWRzOiBTZXQ8c3RyaW5nPik6IElDb250ZXh0TWVudUl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdC8vIFNlcGFyYXRvclxuXHRcdGlmIChlbnRyeSBpbnN0YW5jZW9mIFNlcGFyYXRvcikge1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogJ3NlcGFyYXRvcicgfTtcblx0XHR9XG5cblx0XHQvLyBTdWJtZW51XG5cdFx0aWYgKGVudHJ5IGluc3RhbmNlb2YgU3VibWVudUFjdGlvbikge1xuXHRcdFx0aWYgKHN1Ym1lbnVJZHMuaGFzKGVudHJ5LmlkKSkge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oYEZvdW5kIHN1Ym1lbnUgY3ljbGU6ICR7ZW50cnkuaWR9YCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxhYmVsOiB1bm1uZW1vbmljTGFiZWwoc3RyaXBJY29ucyhlbnRyeS5sYWJlbCkpLnRyaW0oKSxcblx0XHRcdFx0c3VibWVudTogdGhpcy5jcmVhdGVNZW51KGRlbGVnYXRlLCBlbnRyeS5hY3Rpb25zLCBvbkhpZGUsIG5ldyBTZXQoWy4uLnN1Ym1lbnVJZHMsIGVudHJ5LmlkXSkpXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIE5vcm1hbCBNZW51IEl0ZW1cblx0XHRlbHNlIHtcblx0XHRcdGxldCB0eXBlOiAncmFkaW8nIHwgJ2NoZWNrYm94JyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGlmIChlbnRyeS5jaGVja2VkKSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgZGVsZWdhdGUuZ2V0Q2hlY2tlZEFjdGlvbnNSZXByZXNlbnRhdGlvbiA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRcdHR5cGUgPSBkZWxlZ2F0ZS5nZXRDaGVja2VkQWN0aW9uc1JlcHJlc2VudGF0aW9uKGVudHJ5KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0eXBlID0gJ2NoZWNrYm94Jztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpdGVtOiBJQ29udGV4dE1lbnVJdGVtID0ge1xuXHRcdFx0XHRsYWJlbDogdW5tbmVtb25pY0xhYmVsKHN0cmlwSWNvbnMoZW50cnkubGFiZWwpKS50cmltKCksXG5cdFx0XHRcdGNoZWNrZWQ6ICEhZW50cnkuY2hlY2tlZCxcblx0XHRcdFx0dHlwZSxcblx0XHRcdFx0ZW5hYmxlZDogISFlbnRyeS5lbmFibGVkLFxuXHRcdFx0XHRjbGljazogZXZlbnQgPT4ge1xuXG5cdFx0XHRcdFx0Ly8gVG8gcHJlc2VydmUgcHJlLWVsZWN0cm9uLTIueCBiZWhhdmlvdXIsIHdlIGZpcnN0IHRyaWdnZXJcblx0XHRcdFx0XHQvLyB0aGUgb25IaWRlIGNhbGxiYWNrIGFuZCB0aGVuIHRoZSBhY3Rpb24uXG5cdFx0XHRcdFx0Ly8gRml4ZXMgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzQ1NjAxXG5cdFx0XHRcdFx0b25IaWRlKCk7XG5cblx0XHRcdFx0XHQvLyBSdW4gYWN0aW9uIHdoaWNoIHdpbGwgY2xvc2UgdGhlIG1lbnVcblx0XHRcdFx0XHR0aGlzLnJ1bkFjdGlvbihlbnRyeSwgZGVsZWdhdGUsIGV2ZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IGRlbGVnYXRlLmdldEtleUJpbmRpbmcgPyBkZWxlZ2F0ZS5nZXRLZXlCaW5kaW5nKGVudHJ5KSA6IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhlbnRyeS5pZCk7XG5cdFx0XHRpZiAoa2V5YmluZGluZykge1xuXHRcdFx0XHRjb25zdCBlbGVjdHJvbkFjY2VsZXJhdG9yID0ga2V5YmluZGluZy5nZXRFbGVjdHJvbkFjY2VsZXJhdG9yKCk7XG5cdFx0XHRcdGlmIChlbGVjdHJvbkFjY2VsZXJhdG9yKSB7XG5cdFx0XHRcdFx0aXRlbS5hY2NlbGVyYXRvciA9IGVsZWN0cm9uQWNjZWxlcmF0b3I7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSBrZXliaW5kaW5nLmdldExhYmVsKCk7XG5cdFx0XHRcdFx0aWYgKGxhYmVsKSB7XG5cdFx0XHRcdFx0XHRpdGVtLmxhYmVsID0gYCR7aXRlbS5sYWJlbH0gWyR7bGFiZWx9XWA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBpdGVtO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcnVuQWN0aW9uKGFjdGlvblRvUnVuOiBJQWN0aW9uLCBkZWxlZ2F0ZTogSUNvbnRleHRNZW51RGVsZWdhdGUsIGV2ZW50OiBJQ29udGV4dE1lbnVFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghZGVsZWdhdGUuc2tpcFRlbGVtZXRyeSkge1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogYWN0aW9uVG9SdW4uaWQsIGZyb206ICdjb250ZXh0TWVudScgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGV4dCA9IGRlbGVnYXRlLmdldEFjdGlvbnNDb250ZXh0ID8gZGVsZWdhdGUuZ2V0QWN0aW9uc0NvbnRleHQoZXZlbnQpIDogdW5kZWZpbmVkO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGlmIChkZWxlZ2F0ZS5hY3Rpb25SdW5uZXIpIHtcblx0XHRcdFx0YXdhaXQgZGVsZWdhdGUuYWN0aW9uUnVubmVyLnJ1bihhY3Rpb25Ub1J1biwgY29udGV4dCk7XG5cdFx0XHR9IGVsc2UgaWYgKGFjdGlvblRvUnVuLmVuYWJsZWQpIHtcblx0XHRcdFx0YXdhaXQgYWN0aW9uVG9SdW4ucnVuKGNvbnRleHQpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJQ29udGV4dE1lbnVTZXJ2aWNlLCBDb250ZXh0TWVudVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUF1RixXQUFXLHFCQUFxQjtBQUN2SCxZQUFZLFNBQVM7QUFDckIsU0FBbUMscUJBQXFCLDJCQUEyQjtBQUNuRixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxzQkFBc0Isb0JBQW9CO0FBQ25ELFNBQVMsYUFBYSxpQkFBaUI7QUFDdkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUIsc0JBQXNCLDhCQUE4QjtBQUN0RixTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBZ0IsZUFBZTtBQUMvQixTQUFTLGlCQUFpQixxQkFBcUIsZ0JBQWdCO0FBQy9ELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0JBQStCO0FBRWpDLElBQU0scUJBQU4sTUFBd0Q7QUFBQSxFQU85RCxJQUFJLHVCQUFvQztBQUFFLFdBQU8sS0FBSyxLQUFLO0FBQUEsRUFBc0I7QUFBQSxFQUNq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RUEsWUFBTSxPQUF5QjtBQUFBLFFBQzlCLE9BQU8sZ0JBQWdCLFdBQVcsTUFBTSxLQUFLLENBQUMsRUFBRSxLQUFLO0FBQUEsUUFDckQsU0FBUyxDQUFDLENBQUMsTUFBTTtBQUFBLFFBQ2pCO0FBQUEsUUFDQSxTQUFTLENBQUMsQ0FBQyxNQUFNO0FBQUEsUUFDakIsT0FBTyxXQUFTO0FBS2YsaUJBQU87QUFHUCxlQUFLLFVBQVUsT0FBTyxVQUFVLEtBQUs7QUFBQSxRQUN0QztBQUFBLE1BQ0Q7QUFFQSxZQUFNLGFBQWEsU0FBUyxnQkFBZ0IsU0FBUyxjQUFjLEtBQUssSUFBSSxLQUFLLGtCQUFrQixpQkFBaUIsTUFBTSxFQUFFO0FBQzVILFVBQUksWUFBWTtBQUNmLGNBQU0sc0JBQXNCLFdBQVcsdUJBQXVCO0FBQzlELFlBQUkscUJBQXFCO0FBQ3hCLGVBQUssY0FBYztBQUFBLFFBQ3BCLE9BQU87QUFDTixnQkFBTSxRQUFRLFdBQVcsU0FBUztBQUNsQyxjQUFJLE9BQU87QUFDVixpQkFBSyxRQUFRLEdBQUcsS0FBSyxLQUFLLEtBQUssS0FBSztBQUFBLFVBQ3JDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsVUFBVSxhQUFzQixVQUFnQyxPQUF5QztBQUN0SCxRQUFJLENBQUMsU0FBUyxlQUFlO0FBQzVCLFdBQUssaUJBQWlCLFdBQWdGLDJCQUEyQixFQUFFLElBQUksWUFBWSxJQUFJLE1BQU0sY0FBYyxDQUFDO0FBQUEsSUFDN0s7QUFFQSxVQUFNLFVBQVUsU0FBUyxvQkFBb0IsU0FBUyxrQkFBa0IsS0FBSyxJQUFJO0FBRWpGLFFBQUk7QUFDSCxVQUFJLFNBQVMsY0FBYztBQUMxQixjQUFNLFNBQVMsYUFBYSxJQUFJLGFBQWEsT0FBTztBQUFBLE1BQ3JELFdBQVcsWUFBWSxTQUFTO0FBQy9CLGNBQU0sWUFBWSxJQUFJLE9BQU87QUFBQSxNQUM5QjtBQUFBLElBQ0QsU0FBUyxPQUFPO0FBQ2YsV0FBSyxvQkFBb0IsTUFBTSxLQUFLO0FBQUEsSUFDckM7QUFBQSxFQUNEO0FBQ0Q7QUFqTk0sMkJBQU47QUFBQSxFQVdHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBZkc7QUFtTk4sa0JBQWtCLHFCQUFxQixvQkFBb0Isa0JBQWtCLE9BQU87IiwKICAibmFtZXMiOiBbXQp9Cg==
