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
import { ButtonBar } from "../../../base/browser/ui/button/button.js";
import { createInstantHoverDelegate } from "../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { ActionRunner, SubmenuAction } from "../../../base/common/actions.js";
import { Codicon } from "../../../base/common/codicons.js";
import { Emitter } from "../../../base/common/event.js";
import { isMarkdownString, MarkdownString } from "../../../base/common/htmlContent.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { autorun } from "../../../base/common/observable.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { localize } from "../../../nls.js";
import { getActionBarActions } from "./menuEntryActionViewItem.js";
import { IMenuService, MenuItemAction } from "../common/actions.js";
import { IContextKeyService } from "../../contextkey/common/contextkey.js";
import { IContextMenuService } from "../../contextview/browser/contextView.js";
import { IHoverService } from "../../hover/browser/hover.js";
import { IKeybindingService } from "../../keybinding/common/keybinding.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { renderAsPlaintext } from "../../../base/browser/markdownRenderer.js";
import { stripIcons } from "../../../base/common/iconLabels.js";
let WorkbenchButtonBar = class extends ButtonBar {
  constructor(container, _options, _contextMenuService, _keybindingService, telemetryService, _hoverService) {
    super(container);
    this._options = _options;
    this._contextMenuService = _contextMenuService;
    this._keybindingService = _keybindingService;
    this._hoverService = _hoverService;
    this._store = new DisposableStore();
    this._updateStore = new DisposableStore();
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this._actionRunner = this._store.add(new ActionRunner());
    if (_options?.telemetrySource) {
      this._actionRunner.onDidRun((e) => {
        telemetryService.publicLog2(
          "workbenchActionExecuted",
          { id: e.action.id, from: _options.telemetrySource }
        );
      }, void 0, this._store);
    }
  }
  get onWillRun() {
    return this._actionRunner.onWillRun;
  }
  get onDidRun() {
    return this._actionRunner.onDidRun;
  }
  dispose() {
    this._onDidChange.dispose();
    this._updateStore.dispose();
    this._store.dispose();
    super.dispose();
  }
  update(actions, secondary) {
    const configProvider = this._options?.buttonConfigProvider ?? (() => ({ showLabel: true }));
    this._updateStore.clear();
    this.clear();
    const hoverDelegate = this._updateStore.add(createInstantHoverDelegate());
    const actionCount = this._options?.renderSecondaryActions === false ? Math.min(actions.length, 1) : actions.length;
    for (let i = 0; i < actionCount; i++) {
      const secondary2 = i > 0;
      const actionOrSubmenu = actions[i];
      let action;
      let btn;
      let tooltip;
      if (actionOrSubmenu instanceof SubmenuAction && actionOrSubmenu.actions.length > 1) {
        const [first, ...rest] = actionOrSubmenu.actions;
        action = first;
        tooltip = action.tooltip || action.label;
        tooltip = this._keybindingService.appendKeybinding(tooltip, action.id);
        btn = this.addButtonWithDropdown({
          addPrimaryActionToDropdown: false,
          secondary: configProvider(action, i)?.isSecondary ?? secondary2,
          actionRunner: this._actionRunner,
          actions: rest,
          contextMenuProvider: this._contextMenuService,
          ariaLabel: tooltip,
          supportIcons: true,
          small: this._options?.small
        });
      } else {
        action = actionOrSubmenu instanceof SubmenuAction && actionOrSubmenu.actions.length === 1 ? actionOrSubmenu.actions[0] : actionOrSubmenu;
        tooltip = action.tooltip || action.label;
        tooltip = this._keybindingService.appendKeybinding(tooltip, action.id);
        btn = this.addButton({
          secondary: configProvider(action, i)?.isSecondary ?? secondary2,
          ariaLabel: tooltip,
          supportIcons: true,
          small: this._options?.small
        });
      }
      btn.enabled = action.enabled;
      btn.checked = action.checked ?? false;
      btn.element.classList.add("default-colors");
      const config = configProvider(action, i);
      const showLabel = config?.showLabel ?? true;
      const showIcon = config?.showIcon;
      const customClass = config?.customClass;
      const customLabel = config?.customLabel;
      const customLabelObs = config?.customLabelObs;
      if (customClass) {
        btn.element.classList.add(customClass);
      }
      const composeLabel = (labelValue) => {
        if (showIcon && action instanceof MenuItemAction && ThemeIcon.isThemeIcon(action.item.icon) && showLabel) {
          return isMarkdownString(labelValue) ? new MarkdownString(`$(${action.item.icon.id}) ${labelValue.value}`, {
            isTrusted: labelValue.isTrusted,
            supportThemeIcons: true,
            supportHtml: labelValue.supportHtml
          }) : `$(${action.item.icon.id}) ${labelValue}`;
        }
        return labelValue;
      };
      const applyLabel = (labelValue) => {
        if (showLabel) {
          btn.label = composeLabel(labelValue);
        }
        const labelStringValue = stripIcons(renderAsPlaintext(labelValue));
        const ariaLabelWithKeybinding = this._keybindingService.appendKeybinding(labelStringValue, action.id);
        btn.setTitle(ariaLabelWithKeybinding);
        btn.setAriaLabel(ariaLabelWithKeybinding);
      };
      if (showLabel) {
        btn.label = composeLabel(customLabel ?? action.label);
      } else {
        btn.element.classList.add("monaco-text-button");
      }
      if (showIcon) {
        if (action instanceof MenuItemAction && ThemeIcon.isThemeIcon(action.item.icon)) {
          if (!showLabel) {
            btn.icon = action.item.icon;
          }
        } else if (action.class) {
          btn.element.classList.add(...action.class.split(" "));
        }
      }
      if (customLabelObs) {
        this._updateStore.add(autorun((reader) => {
          const v = customLabelObs.read(reader);
          applyLabel(v ?? customLabel ?? action.label);
        }));
      }
      this._updateStore.add(this._hoverService.setupManagedHover(hoverDelegate, btn.element, tooltip));
      this._updateStore.add(btn.onDidClick(async () => {
        if (this._options?.disableWhileRunning) {
          btn.enabled = false;
          try {
            await this._actionRunner.run(action);
          } finally {
            btn.enabled = action.enabled;
          }
        } else {
          this._actionRunner.run(action);
        }
      }));
    }
    if (this._options?.renderSecondaryActions !== false && secondary.length > 0) {
      const btn = this.addButton({
        secondary: true,
        ariaLabel: localize("moreActions", "More Actions"),
        small: this._options?.small
      });
      btn.icon = Codicon.dropDownButton;
      btn.element.classList.add("default-colors", "monaco-text-button");
      btn.enabled = true;
      this._updateStore.add(this._hoverService.setupManagedHover(hoverDelegate, btn.element, localize("moreActions", "More Actions")));
      this._updateStore.add(btn.onDidClick(async () => {
        this._contextMenuService.showContextMenu({
          getAnchor: () => btn.element,
          getActions: () => secondary,
          actionRunner: this._actionRunner,
          onHide: () => btn.element.setAttribute("aria-expanded", "false")
        });
        btn.element.setAttribute("aria-expanded", "true");
      }));
    }
    this._onDidChange.fire(this);
  }
};
WorkbenchButtonBar = __decorateClass([
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IHoverService)
], WorkbenchButtonBar);
let MenuWorkbenchButtonBar = class extends WorkbenchButtonBar {
  constructor(container, menuId, options, menuService, contextKeyService, contextMenuService, keybindingService, telemetryService, hoverService) {
    super(container, options, contextMenuService, keybindingService, telemetryService, hoverService);
    const menu = menuService.createMenu(menuId, contextKeyService);
    this._store.add(menu);
    const update = () => {
      this.clear();
      const actions = getActionBarActions(
        menu.getActions(options?.menuOptions),
        options?.toolbarOptions?.primaryGroup
      );
      super.update(actions.primary, actions.secondary);
    };
    this._store.add(menu.onDidChange(update));
    update();
  }
  dispose() {
    super.dispose();
  }
  update(_actions) {
    throw new Error("Use Menu or WorkbenchButtonBar");
  }
};
MenuWorkbenchButtonBar = __decorateClass([
  __decorateParam(3, IMenuService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IHoverService)
], MenuWorkbenchButtonBar);
export {
  MenuWorkbenchButtonBar,
  WorkbenchButtonBar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWN0aW9uc1xcYnJvd3NlclxcYnV0dG9uYmFyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQnV0dG9uQmFyLCBJQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgQWN0aW9uUnVubmVyLCBJQWN0aW9uLCBJQWN0aW9uUnVubmVyLCBJUnVuRXZlbnQsIFN1Ym1lbnVBY3Rpb24sIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24sIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgaXNNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBnZXRBY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJVG9vbEJhclJlbmRlck9wdGlvbnMgfSBmcm9tICcuL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgTWVudUlkLCBJTWVudVNlcnZpY2UsIE1lbnVJdGVtQWN0aW9uLCBJTWVudUFjdGlvbk9wdGlvbnMgfSBmcm9tICcuLi9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyByZW5kZXJBc1BsYWludGV4dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IHN0cmlwSWNvbnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9pY29uTGFiZWxzLmpzJztcblxuZXhwb3J0IHR5cGUgSUJ1dHRvbkNvbmZpZ1Byb3ZpZGVyID0gKGFjdGlvbjogSUFjdGlvbiwgaW5kZXg6IG51bWJlcikgPT4ge1xuXHRzaG93SWNvbj86IGJvb2xlYW47XG5cdHNob3dMYWJlbD86IGJvb2xlYW47XG5cdGlzU2Vjb25kYXJ5PzogYm9vbGVhbjtcblx0Y3VzdG9tTGFiZWw/OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7XG5cdGN1c3RvbUxhYmVsT2JzPzogSU9ic2VydmFibGU8c3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0Y3VzdG9tQ2xhc3M/OiBzdHJpbmc7XG59IHwgdW5kZWZpbmVkO1xuXG5leHBvcnQgaW50ZXJmYWNlIElXb3JrYmVuY2hCdXR0b25CYXJPcHRpb25zIHtcblx0dGVsZW1ldHJ5U291cmNlPzogc3RyaW5nO1xuXHRidXR0b25Db25maWdQcm92aWRlcj86IElCdXR0b25Db25maWdQcm92aWRlcjtcblx0c21hbGw/OiBib29sZWFuO1xuXHRkaXNhYmxlV2hpbGVSdW5uaW5nPzogYm9vbGVhbjtcblx0cmVuZGVyU2Vjb25kYXJ5QWN0aW9ucz86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBXb3JrYmVuY2hCdXR0b25CYXIgZXh0ZW5kcyBCdXR0b25CYXIge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByb3RlY3RlZCByZWFkb25seSBfdXBkYXRlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aW9uUnVubmVyOiBJQWN0aW9uUnVubmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPHRoaXM+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx0aGlzPiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdGdldCBvbldpbGxSdW4oKTogRXZlbnQ8SVJ1bkV2ZW50PiB7IHJldHVybiB0aGlzLl9hY3Rpb25SdW5uZXIub25XaWxsUnVuOyB9XG5cdGdldCBvbkRpZFJ1bigpOiBFdmVudDxJUnVuRXZlbnQ+IHsgcmV0dXJuIHRoaXMuX2FjdGlvblJ1bm5lci5vbkRpZFJ1bjsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSVdvcmtiZW5jaEJ1dHRvbkJhck9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihjb250YWluZXIpO1xuXG5cdFx0dGhpcy5fYWN0aW9uUnVubmVyID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBBY3Rpb25SdW5uZXIoKSk7XG5cdFx0aWYgKF9vcHRpb25zPy50ZWxlbWV0cnlTb3VyY2UpIHtcblx0XHRcdHRoaXMuX2FjdGlvblJ1bm5lci5vbkRpZFJ1bihlID0+IHtcblx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KFxuXHRcdFx0XHRcdCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsXG5cdFx0XHRcdFx0eyBpZDogZS5hY3Rpb24uaWQsIGZyb206IF9vcHRpb25zLnRlbGVtZXRyeVNvdXJjZSEgfVxuXHRcdFx0XHQpO1xuXHRcdFx0fSwgdW5kZWZpbmVkLCB0aGlzLl9zdG9yZSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fdXBkYXRlU3RvcmUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3N0b3JlLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHR1cGRhdGUoYWN0aW9uczogSUFjdGlvbltdLCBzZWNvbmRhcnk6IElBY3Rpb25bXSk6IHZvaWQge1xuXG5cdFx0Y29uc3QgY29uZmlnUHJvdmlkZXI6IElCdXR0b25Db25maWdQcm92aWRlciA9IHRoaXMuX29wdGlvbnM/LmJ1dHRvbkNvbmZpZ1Byb3ZpZGVyID8/ICgoKSA9PiAoeyBzaG93TGFiZWw6IHRydWUgfSkpO1xuXG5cdFx0dGhpcy5fdXBkYXRlU3RvcmUuY2xlYXIoKTtcblx0XHR0aGlzLmNsZWFyKCk7XG5cblx0XHQvLyBTdXBwb3J0IGluc3RhbnQgaG92ZXIgYmV0d2VlbiBidXR0b25zXG5cdFx0Y29uc3QgaG92ZXJEZWxlZ2F0ZSA9IHRoaXMuX3VwZGF0ZVN0b3JlLmFkZChjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSgpKTtcblxuXHRcdGNvbnN0IGFjdGlvbkNvdW50ID0gdGhpcy5fb3B0aW9ucz8ucmVuZGVyU2Vjb25kYXJ5QWN0aW9ucyA9PT0gZmFsc2Vcblx0XHRcdD8gTWF0aC5taW4oYWN0aW9ucy5sZW5ndGgsIDEpXG5cdFx0XHQ6IGFjdGlvbnMubGVuZ3RoO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYWN0aW9uQ291bnQ7IGkrKykge1xuXG5cdFx0XHRjb25zdCBzZWNvbmRhcnkgPSBpID4gMDtcblx0XHRcdGNvbnN0IGFjdGlvbk9yU3VibWVudSA9IGFjdGlvbnNbaV07XG5cdFx0XHRsZXQgYWN0aW9uOiBJQWN0aW9uO1xuXHRcdFx0bGV0IGJ0bjogSUJ1dHRvbjtcblx0XHRcdGxldCB0b29sdGlwOiBzdHJpbmc7XG5cblx0XHRcdGlmIChhY3Rpb25PclN1Ym1lbnUgaW5zdGFuY2VvZiBTdWJtZW51QWN0aW9uICYmIGFjdGlvbk9yU3VibWVudS5hY3Rpb25zLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0Y29uc3QgW2ZpcnN0LCAuLi5yZXN0XSA9IGFjdGlvbk9yU3VibWVudS5hY3Rpb25zO1xuXHRcdFx0XHRhY3Rpb24gPSA8TWVudUl0ZW1BY3Rpb24+Zmlyc3Q7XG5cblx0XHRcdFx0dG9vbHRpcCA9IGFjdGlvbi50b29sdGlwIHx8IGFjdGlvbi5sYWJlbDtcblx0XHRcdFx0dG9vbHRpcCA9IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcodG9vbHRpcCwgYWN0aW9uLmlkKTtcblxuXHRcdFx0XHRidG4gPSB0aGlzLmFkZEJ1dHRvbldpdGhEcm9wZG93bih7XG5cdFx0XHRcdFx0YWRkUHJpbWFyeUFjdGlvblRvRHJvcGRvd246IGZhbHNlLFxuXHRcdFx0XHRcdHNlY29uZGFyeTogY29uZmlnUHJvdmlkZXIoYWN0aW9uLCBpKT8uaXNTZWNvbmRhcnkgPz8gc2Vjb25kYXJ5LFxuXHRcdFx0XHRcdGFjdGlvblJ1bm5lcjogdGhpcy5fYWN0aW9uUnVubmVyLFxuXHRcdFx0XHRcdGFjdGlvbnM6IHJlc3QsXG5cdFx0XHRcdFx0Y29udGV4dE1lbnVQcm92aWRlcjogdGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdFx0XHRcdGFyaWFMYWJlbDogdG9vbHRpcCxcblx0XHRcdFx0XHRzdXBwb3J0SWNvbnM6IHRydWUsXG5cdFx0XHRcdFx0c21hbGw6IHRoaXMuX29wdGlvbnM/LnNtYWxsLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFjdGlvbiA9IGFjdGlvbk9yU3VibWVudSBpbnN0YW5jZW9mIFN1Ym1lbnVBY3Rpb24gJiYgYWN0aW9uT3JTdWJtZW51LmFjdGlvbnMubGVuZ3RoID09PSAxXG5cdFx0XHRcdFx0PyBhY3Rpb25PclN1Ym1lbnUuYWN0aW9uc1swXVxuXHRcdFx0XHRcdDogYWN0aW9uT3JTdWJtZW51O1xuXG5cdFx0XHRcdHRvb2x0aXAgPSBhY3Rpb24udG9vbHRpcCB8fCBhY3Rpb24ubGFiZWw7XG5cdFx0XHRcdHRvb2x0aXAgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKHRvb2x0aXAsIGFjdGlvbi5pZCk7XG5cblx0XHRcdFx0YnRuID0gdGhpcy5hZGRCdXR0b24oe1xuXHRcdFx0XHRcdHNlY29uZGFyeTogY29uZmlnUHJvdmlkZXIoYWN0aW9uLCBpKT8uaXNTZWNvbmRhcnkgPz8gc2Vjb25kYXJ5LFxuXHRcdFx0XHRcdGFyaWFMYWJlbDogdG9vbHRpcCxcblx0XHRcdFx0XHRzdXBwb3J0SWNvbnM6IHRydWUsXG5cdFx0XHRcdFx0c21hbGw6IHRoaXMuX29wdGlvbnM/LnNtYWxsLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0YnRuLmVuYWJsZWQgPSBhY3Rpb24uZW5hYmxlZDtcblx0XHRcdGJ0bi5jaGVja2VkID0gYWN0aW9uLmNoZWNrZWQgPz8gZmFsc2U7XG5cdFx0XHRidG4uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdkZWZhdWx0LWNvbG9ycycpO1xuXG5cdFx0XHRjb25zdCBjb25maWcgPSBjb25maWdQcm92aWRlcihhY3Rpb24sIGkpO1xuXHRcdFx0Y29uc3Qgc2hvd0xhYmVsID0gY29uZmlnPy5zaG93TGFiZWwgPz8gdHJ1ZTtcblx0XHRcdGNvbnN0IHNob3dJY29uID0gY29uZmlnPy5zaG93SWNvbjtcblx0XHRcdGNvbnN0IGN1c3RvbUNsYXNzID0gY29uZmlnPy5jdXN0b21DbGFzcztcblx0XHRcdGNvbnN0IGN1c3RvbUxhYmVsID0gY29uZmlnPy5jdXN0b21MYWJlbDtcblx0XHRcdGNvbnN0IGN1c3RvbUxhYmVsT2JzID0gY29uZmlnPy5jdXN0b21MYWJlbE9icztcblxuXHRcdFx0aWYgKGN1c3RvbUNsYXNzKSB7XG5cdFx0XHRcdGJ0bi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoY3VzdG9tQ2xhc3MpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb21wb3NlTGFiZWwgPSAobGFiZWxWYWx1ZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nKTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nID0+IHtcblx0XHRcdFx0aWYgKHNob3dJY29uICYmIGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uICYmIFRoZW1lSWNvbi5pc1RoZW1lSWNvbihhY3Rpb24uaXRlbS5pY29uKSAmJiBzaG93TGFiZWwpIHtcblx0XHRcdFx0XHQvLyB0aGlzIGlzIFJFQUxMWSBoYWNreSBidXQgY29tYmluaW5nIGEgY29kaWNvbiBhbmQgbm9ybWFsIHRleHQgaXMgdWdseSBiZWNhdXNlXG5cdFx0XHRcdFx0Ly8gdGhlIGZvcm1lciBkZWZpbmUgYSBmb250IHdoaWNoIGRvZXNuJ3Qgd29yayBmb3IgdGV4dFxuXHRcdFx0XHRcdHJldHVybiBpc01hcmtkb3duU3RyaW5nKGxhYmVsVmFsdWUpXG5cdFx0XHRcdFx0XHQ/IG5ldyBNYXJrZG93blN0cmluZyhgJCgke2FjdGlvbi5pdGVtLmljb24uaWR9KSAke2xhYmVsVmFsdWUudmFsdWV9YCwge1xuXHRcdFx0XHRcdFx0XHRpc1RydXN0ZWQ6IGxhYmVsVmFsdWUuaXNUcnVzdGVkLCBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSwgc3VwcG9ydEh0bWw6IGxhYmVsVmFsdWUuc3VwcG9ydEh0bWxcblx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHQ6IGAkKCR7YWN0aW9uLml0ZW0uaWNvbi5pZH0pICR7bGFiZWxWYWx1ZX1gO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBsYWJlbFZhbHVlO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgYXBwbHlMYWJlbCA9IChsYWJlbFZhbHVlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcpID0+IHtcblx0XHRcdFx0aWYgKHNob3dMYWJlbCkge1xuXHRcdFx0XHRcdGJ0bi5sYWJlbCA9IGNvbXBvc2VMYWJlbChsYWJlbFZhbHVlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGxhYmVsU3RyaW5nVmFsdWUgPSBzdHJpcEljb25zKHJlbmRlckFzUGxhaW50ZXh0KGxhYmVsVmFsdWUpKTtcblx0XHRcdFx0Y29uc3QgYXJpYUxhYmVsV2l0aEtleWJpbmRpbmcgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKGxhYmVsU3RyaW5nVmFsdWUsIGFjdGlvbi5pZCk7XG5cblx0XHRcdFx0YnRuLnNldFRpdGxlKGFyaWFMYWJlbFdpdGhLZXliaW5kaW5nKTtcblx0XHRcdFx0YnRuLnNldEFyaWFMYWJlbChhcmlhTGFiZWxXaXRoS2V5YmluZGluZyk7XG5cdFx0XHR9O1xuXG5cdFx0XHRpZiAoc2hvd0xhYmVsKSB7XG5cdFx0XHRcdGJ0bi5sYWJlbCA9IGNvbXBvc2VMYWJlbChjdXN0b21MYWJlbCA/PyBhY3Rpb24ubGFiZWwpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnRuLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbW9uYWNvLXRleHQtYnV0dG9uJyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzaG93SWNvbikge1xuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24gJiYgVGhlbWVJY29uLmlzVGhlbWVJY29uKGFjdGlvbi5pdGVtLmljb24pKSB7XG5cdFx0XHRcdFx0aWYgKCFzaG93TGFiZWwpIHtcblx0XHRcdFx0XHRcdGJ0bi5pY29uID0gYWN0aW9uLml0ZW0uaWNvbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAoYWN0aW9uLmNsYXNzKSB7XG5cdFx0XHRcdFx0YnRuLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCguLi5hY3Rpb24uY2xhc3Muc3BsaXQoJyAnKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGN1c3RvbUxhYmVsT2JzKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdiA9IGN1c3RvbUxhYmVsT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRhcHBseUxhYmVsKHYgPz8gY3VzdG9tTGFiZWwgPz8gYWN0aW9uLmxhYmVsKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl91cGRhdGVTdG9yZS5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGhvdmVyRGVsZWdhdGUsIGJ0bi5lbGVtZW50LCB0b29sdGlwKSk7XG5cdFx0XHR0aGlzLl91cGRhdGVTdG9yZS5hZGQoYnRuLm9uRGlkQ2xpY2soYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fb3B0aW9ucz8uZGlzYWJsZVdoaWxlUnVubmluZykge1xuXHRcdFx0XHRcdGJ0bi5lbmFibGVkID0gZmFsc2U7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2FjdGlvblJ1bm5lci5ydW4oYWN0aW9uKTtcblx0XHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdFx0YnRuLmVuYWJsZWQgPSBhY3Rpb24uZW5hYmxlZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fYWN0aW9uUnVubmVyLnJ1bihhY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX29wdGlvbnM/LnJlbmRlclNlY29uZGFyeUFjdGlvbnMgIT09IGZhbHNlICYmIHNlY29uZGFyeS5sZW5ndGggPiAwKSB7XG5cblx0XHRcdGNvbnN0IGJ0biA9IHRoaXMuYWRkQnV0dG9uKHtcblx0XHRcdFx0c2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdtb3JlQWN0aW9ucycsIFwiTW9yZSBBY3Rpb25zXCIpLFxuXHRcdFx0XHRzbWFsbDogdGhpcy5fb3B0aW9ucz8uc21hbGwsXG5cdFx0XHR9KTtcblxuXHRcdFx0YnRuLmljb24gPSBDb2RpY29uLmRyb3BEb3duQnV0dG9uO1xuXHRcdFx0YnRuLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZGVmYXVsdC1jb2xvcnMnLCAnbW9uYWNvLXRleHQtYnV0dG9uJyk7XG5cblx0XHRcdGJ0bi5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3VwZGF0ZVN0b3JlLmFkZCh0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoaG92ZXJEZWxlZ2F0ZSwgYnRuLmVsZW1lbnQsIGxvY2FsaXplKCdtb3JlQWN0aW9ucycsIFwiTW9yZSBBY3Rpb25zXCIpKSk7XG5cdFx0XHR0aGlzLl91cGRhdGVTdG9yZS5hZGQoYnRuLm9uRGlkQ2xpY2soYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IGJ0bi5lbGVtZW50LFxuXHRcdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHNlY29uZGFyeSxcblx0XHRcdFx0XHRhY3Rpb25SdW5uZXI6IHRoaXMuX2FjdGlvblJ1bm5lcixcblx0XHRcdFx0XHRvbkhpZGU6ICgpID0+IGJ0bi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRidG4uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAndHJ1ZScpO1xuXG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodGhpcyk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWVudVdvcmtiZW5jaEJ1dHRvbkJhck9wdGlvbnMgZXh0ZW5kcyBJV29ya2JlbmNoQnV0dG9uQmFyT3B0aW9ucyB7XG5cdG1lbnVPcHRpb25zPzogSU1lbnVBY3Rpb25PcHRpb25zO1xuXG5cdHRvb2xiYXJPcHRpb25zPzogSVRvb2xCYXJSZW5kZXJPcHRpb25zO1xufVxuXG5leHBvcnQgY2xhc3MgTWVudVdvcmtiZW5jaEJ1dHRvbkJhciBleHRlbmRzIFdvcmtiZW5jaEJ1dHRvbkJhciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRtZW51SWQ6IE1lbnVJZCxcblx0XHRvcHRpb25zOiBJTWVudVdvcmtiZW5jaEJ1dHRvbkJhck9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGNvbnRhaW5lciwgb3B0aW9ucywgY29udGV4dE1lbnVTZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG1lbnUgPSBtZW51U2VydmljZS5jcmVhdGVNZW51KG1lbnVJZCwgY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChtZW51KTtcblxuXHRcdGNvbnN0IHVwZGF0ZSA9ICgpID0+IHtcblxuXHRcdFx0dGhpcy5jbGVhcigpO1xuXG5cdFx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uQmFyQWN0aW9ucyhcblx0XHRcdFx0bWVudS5nZXRBY3Rpb25zKG9wdGlvbnM/Lm1lbnVPcHRpb25zKSxcblx0XHRcdFx0b3B0aW9ucz8udG9vbGJhck9wdGlvbnM/LnByaW1hcnlHcm91cFxuXHRcdFx0KTtcblxuXHRcdFx0c3VwZXIudXBkYXRlKGFjdGlvbnMucHJpbWFyeSwgYWN0aW9ucy5zZWNvbmRhcnkpO1xuXHRcdH07XG5cdFx0dGhpcy5fc3RvcmUuYWRkKG1lbnUub25EaWRDaGFuZ2UodXBkYXRlKSk7XG5cdFx0dXBkYXRlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZShfYWN0aW9uczogSUFjdGlvbltdKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdVc2UgTWVudSBvciBXb3JrYmVuY2hCdXR0b25CYXInKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGlCQUEwQjtBQUNuQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGNBQWlELHFCQUEwRjtBQUNwSixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFzQjtBQUMvQixTQUEwQixrQkFBa0Isc0JBQXNCO0FBQ2xFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBNEI7QUFDckMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywy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QUFXLFNBQVMsZUFBZSxjQUFjO0FBQUEsUUFDakQsT0FBTyxLQUFLLFVBQVU7QUFBQSxNQUN2QixDQUFDO0FBRUQsVUFBSSxPQUFPLFFBQVE7QUFDbkIsVUFBSSxRQUFRLFVBQVUsSUFBSSxrQkFBa0Isb0JBQW9CO0FBRWhFLFVBQUksVUFBVTtBQUNkLFdBQUssYUFBYSxJQUFJLEtBQUssY0FBYyxrQkFBa0IsZUFBZSxJQUFJLFNBQVMsU0FBUyxlQUFlLGNBQWMsQ0FBQyxDQUFDO0FBQy9ILFdBQUssYUFBYSxJQUFJLElBQUksV0FBVyxZQUFZO0FBQ2hELGFBQUssb0JBQW9CLGdCQUFnQjtBQUFBLFVBQ3hDLFdBQVcsTUFBTSxJQUFJO0FBQUEsVUFDckIsWUFBWSxNQUFNO0FBQUEsVUFDbEIsY0FBYyxLQUFLO0FBQUEsVUFDbkIsUUFBUSxNQUFNLElBQUksUUFBUSxhQUFhLGlCQUFpQixPQUFPO0FBQUEsUUFDaEUsQ0FBQztBQUNELFlBQUksUUFBUSxhQUFhLGlCQUFpQixNQUFNO0FBQUEsTUFFakQsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUNBLFNBQUssYUFBYSxLQUFLLElBQUk7QUFBQSxFQUM1QjtBQUNEO0FBdE1hLHFCQUFOO0FBQUEsRUFlSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBbEJVO0FBOE1OLElBQU0seUJBQU4sY0FBcUMsbUJBQW1CO0FBQUEsRUFFOUQsWUFDQyxXQUNBLFFBQ0EsU0FDYyxhQUNNLG1CQUNDLG9CQUNELG1CQUNELGtCQUNKLGNBQ2Q7QUFDRCxVQUFNLFdBQVcsU0FBUyxvQkFBb0IsbUJBQW1CLGtCQUFrQixZQUFZO0FBRS9GLFVBQU0sT0FBTyxZQUFZLFdBQVcsUUFBUSxpQkFBaUI7QUFDN0QsU0FBSyxPQUFPLElBQUksSUFBSTtBQUVwQixVQUFNLFNBQVMsTUFBTTtBQUVwQixXQUFLLE1BQU07QUFFWCxZQUFNLFVBQVU7QUFBQSxRQUNmLEtBQUssV0FBVyxTQUFTLFdBQVc7QUFBQSxRQUNwQyxTQUFTLGdCQUFnQjtBQUFBLE1BQzFCO0FBRUEsWUFBTSxPQUFPLFFBQVEsU0FBUyxRQUFRLFNBQVM7QUFBQSxJQUNoRDtBQUNBLFNBQUssT0FBTyxJQUFJLEtBQUssWUFBWSxNQUFNLENBQUM7QUFDeEMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVTLFVBQVU7QUFDbEIsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUFBLEVBRVMsT0FBTyxVQUEyQjtBQUMxQyxVQUFNLElBQUksTUFBTSxnQ0FBZ0M7QUFBQSxFQUNqRDtBQUNEO0FBeENhLHlCQUFOO0FBQUEsRUFNSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FYVTsiLAogICJuYW1lcyI6IFsic2Vjb25kYXJ5Il0KfQo=
