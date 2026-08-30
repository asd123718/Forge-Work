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
import { isActiveDocument, reset } from "../../../../base/browser/dom.js";
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { SubmenuAction } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar, WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { MenuId, MenuRegistry, SubmenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ChatAIDisabledSettingId } from "../../../../platform/chat/common/chatSettings.js";
const AGENT_STATUS_ENABLED_SETTING = "chat.agentsControl.enabled";
let CommandCenterControl = class {
  constructor(windowTitle, hoverDelegate, instantiationService, quickInputService) {
    this._disposables = new DisposableStore();
    this._onDidChangeVisibility = this._disposables.add(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this.element = document.createElement("div");
    this.element.classList.add("command-center");
    const titleToolbar = instantiationService.createInstance(MenuWorkbenchToolBar, this.element, MenuId.CommandCenter, {
      contextMenu: MenuId.TitleBarContext,
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      toolbarOptions: {
        primaryGroup: () => true
      },
      telemetrySource: "commandCenter",
      actionViewItemProvider: (action, options) => {
        if (action instanceof SubmenuItemAction && action.item.submenu === MenuId.CommandCenterCenter) {
          return instantiationService.createInstance(CommandCenterCenterViewItem, action, windowTitle, { ...options, hoverDelegate });
        } else {
          return createActionViewItem(instantiationService, action, { ...options, hoverDelegate });
        }
      }
    });
    let quickInputVisible = false;
    this._disposables.add(Event.filter(quickInputService.onShow, () => isActiveDocument(this.element), this._disposables)(() => {
      quickInputVisible = true;
      this._setVisibility(quickInputService.alignment.get() !== "top");
    }));
    this._disposables.add(quickInputService.onHide(() => {
      quickInputVisible = false;
      this._setVisibility(true);
    }));
    this._disposables.add(autorun((reader) => {
      const alignment = quickInputService.alignment.read(reader);
      if (quickInputVisible) {
        this._setVisibility(alignment !== "top");
      }
    }));
    this._disposables.add(titleToolbar);
  }
  _setVisibility(show) {
    this.element.classList.toggle("hide", !show);
    this._onDidChangeVisibility.fire();
  }
  dispose() {
    this._disposables.dispose();
  }
};
CommandCenterControl = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IQuickInputService)
], CommandCenterControl);
let CommandCenterCenterViewItem = class extends BaseActionViewItem {
  constructor(_submenu, _windowTitle, options, _hoverService, _keybindingService, _instaService, _editorGroupService, _configurationService) {
    super(void 0, _submenu.actions.find((action) => action.id === "workbench.action.quickOpenWithModes") ?? _submenu.actions[0], options);
    this._submenu = _submenu;
    this._windowTitle = _windowTitle;
    this._hoverService = _hoverService;
    this._keybindingService = _keybindingService;
    this._instaService = _instaService;
    this._editorGroupService = _editorGroupService;
    this._configurationService = _configurationService;
    this._hoverDelegate = options.hoverDelegate ?? getDefaultHoverDelegate("mouse");
  }
  render(container) {
    super.render(container);
    container.classList.add("command-center-center");
    container.classList.toggle("multiple", this._submenu.actions.length > 1);
    const hover = this._store.add(this._hoverService.setupManagedHover(this._hoverDelegate, container, this.getTooltip()));
    this._store.add(this._windowTitle.onDidChange(() => {
      hover.update(this.getTooltip());
    }));
    const groups = [];
    for (const action of this._submenu.actions) {
      if (action instanceof SubmenuAction) {
        groups.push(action.actions);
      } else {
        groups.push([action]);
      }
    }
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const toolbar = this._instaService.createInstance(WorkbenchToolBar, container, {
        hiddenItemStrategy: HiddenItemStrategy.NoHide,
        telemetrySource: "commandCenterCenter",
        actionViewItemProvider: (action, options) => {
          options = {
            ...options,
            hoverDelegate: this._hoverDelegate
          };
          if (action.id !== CommandCenterCenterViewItem._quickOpenCommandId) {
            return createActionViewItem(this._instaService, action, options);
          }
          const that = this;
          return this._instaService.createInstance(class CommandCenterQuickPickItem extends BaseActionViewItem {
            constructor() {
              super(void 0, action, options);
            }
            render(container2) {
              super.render(container2);
              container2.classList.toggle("command-center-quick-pick");
              container2.role = "button";
              container2.setAttribute("aria-description", this.getTooltip());
              const aiFeaturesDisabled = that._configurationService.getValue(ChatAIDisabledSettingId) === true;
              const aiCustomizationsDisabled = that._configurationService.getValue("disableAICustomizations") === true || that._configurationService.getValue("workbench.disableAICustomizations") === true;
              const forcedHidden = aiFeaturesDisabled && aiCustomizationsDisabled;
              const agentControlValue = that._configurationService.getValue(AGENT_STATUS_ENABLED_SETTING);
              const isCompactMode = !forcedHidden && (agentControlValue === true || agentControlValue === void 0 || agentControlValue === "compact");
              container2.classList.toggle("compact-mode", isCompactMode);
              const action2 = this.action;
              const searchIcon = document.createElement("span");
              searchIcon.ariaHidden = "true";
              searchIcon.className = action2.class ?? "";
              searchIcon.classList.add("search-icon");
              const label = this._getLabel();
              const labelElement = document.createElement("span");
              labelElement.classList.add("search-label");
              labelElement.textContent = label;
              if (isCompactMode) {
                reset(container2, labelElement);
              } else {
                reset(container2, searchIcon, labelElement);
              }
              const hover2 = this._store.add(that._hoverService.setupManagedHover(that._hoverDelegate, container2, this.getTooltip()));
              this._store.add(that._windowTitle.onDidChange(() => {
                hover2.update(this.getTooltip());
                labelElement.textContent = this._getLabel();
              }));
              this._store.add(that._editorGroupService.onDidChangeEditorPartOptions(({ newPartOptions, oldPartOptions }) => {
                if (newPartOptions.showTabs !== oldPartOptions.showTabs) {
                  hover2.update(this.getTooltip());
                  labelElement.textContent = this._getLabel();
                }
              }));
            }
            getTooltip() {
              return that.getTooltip();
            }
            _getLabel() {
              const { prefix, suffix } = that._windowTitle.getTitleDecorations();
              let label = that._windowTitle.workspaceName;
              if (that._windowTitle.isCustomTitleFormat()) {
                label = that._windowTitle.getWindowTitle();
              } else if (that._editorGroupService.partOptions.showTabs === "none") {
                label = that._windowTitle.fileName ?? label;
              }
              if (!label) {
                label = localize("label.dfl", "Search");
              }
              if (prefix) {
                label = localize("label1", "{0} {1}", prefix, label);
              }
              if (suffix) {
                label = localize("label2", "{0} {1}", label, suffix);
              }
              return label.replaceAll(/\r\n|\r|\n/g, "\u23CE");
            }
          });
        }
      });
      toolbar.setActions(group);
      this._store.add(toolbar);
      if (i < groups.length - 1) {
        const icon = renderIcon(Codicon.circleSmallFilled);
        icon.style.padding = "0 8px";
        icon.style.height = "100%";
        icon.style.opacity = "0.5";
        container.appendChild(icon);
      }
    }
  }
  getTooltip() {
    const kb = this._keybindingService.lookupKeybinding(this.action.id)?.getLabel();
    const title = kb ? localize("title", "Search {0} ({1}) \u2014 {2}", this._windowTitle.workspaceName, kb, this._windowTitle.value) : localize("title2", "Search {0} \u2014 {1}", this._windowTitle.workspaceName, this._windowTitle.value);
    return title;
  }
};
CommandCenterCenterViewItem._quickOpenCommandId = "workbench.action.quickOpenWithModes";
CommandCenterCenterViewItem = __decorateClass([
  __decorateParam(3, IHoverService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IEditorGroupsService),
  __decorateParam(7, IConfigurationService)
], CommandCenterCenterViewItem);
MenuRegistry.appendMenuItem(MenuId.CommandCenter, {
  submenu: MenuId.CommandCenterCenter,
  title: localize("title3", "Command Center"),
  icon: Codicon.shield,
  order: 101
});
export {
  CommandCenterControl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFx0aXRsZWJhclxcY29tbWFuZENlbnRlckNvbnRyb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpc0FjdGl2ZURvY3VtZW50LCByZXNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQmFzZUFjdGlvblZpZXdJdGVtLCBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBTdWJtZW51QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSGlkZGVuSXRlbVN0cmF0ZWd5LCBNZW51V29ya2JlbmNoVG9vbEJhciwgV29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCBTdWJtZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgV2luZG93VGl0bGUgfSBmcm9tICcuL3dpbmRvd1RpdGxlLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jaGF0L2NvbW1vbi9jaGF0U2V0dGluZ3MuanMnO1xuXG5jb25zdCBBR0VOVF9TVEFUVVNfRU5BQkxFRF9TRVRUSU5HID0gJ2NoYXQuYWdlbnRzQ29udHJvbC5lbmFibGVkJztcblxuZXhwb3J0IGNsYXNzIENvbW1hbmRDZW50ZXJDb250cm9sIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpc2liaWxpdHkgPSB0aGlzLl9kaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZXZlbnQ7XG5cblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR3aW5kb3dUaXRsZTogV2luZG93VGl0bGUsXG5cdFx0aG92ZXJEZWxlZ2F0ZTogSUhvdmVyRGVsZWdhdGUsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NvbW1hbmQtY2VudGVyJyk7XG5cblx0XHRjb25zdCB0aXRsZVRvb2xiYXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdGhpcy5lbGVtZW50LCBNZW51SWQuQ29tbWFuZENlbnRlciwge1xuXHRcdFx0Y29udGV4dE1lbnU6IE1lbnVJZC5UaXRsZUJhckNvbnRleHQsXG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0XHR0b29sYmFyT3B0aW9uczoge1xuXHRcdFx0XHRwcmltYXJ5R3JvdXA6ICgpID0+IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0dGVsZW1ldHJ5U291cmNlOiAnY29tbWFuZENlbnRlcicsXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBTdWJtZW51SXRlbUFjdGlvbiAmJiBhY3Rpb24uaXRlbS5zdWJtZW51ID09PSBNZW51SWQuQ29tbWFuZENlbnRlckNlbnRlcikge1xuXHRcdFx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21tYW5kQ2VudGVyQ2VudGVyVmlld0l0ZW0sIGFjdGlvbiwgd2luZG93VGl0bGUsIHsgLi4ub3B0aW9ucywgaG92ZXJEZWxlZ2F0ZSB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gY3JlYXRlQWN0aW9uVmlld0l0ZW0oaW5zdGFudGlhdGlvblNlcnZpY2UsIGFjdGlvbiwgeyAuLi5vcHRpb25zLCBob3ZlckRlbGVnYXRlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRsZXQgcXVpY2tJbnB1dFZpc2libGUgPSBmYWxzZTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoRXZlbnQuZmlsdGVyKHF1aWNrSW5wdXRTZXJ2aWNlLm9uU2hvdywgKCkgPT4gaXNBY3RpdmVEb2N1bWVudCh0aGlzLmVsZW1lbnQpLCB0aGlzLl9kaXNwb3NhYmxlcykoKCkgPT4ge1xuXHRcdFx0cXVpY2tJbnB1dFZpc2libGUgPSB0cnVlO1xuXHRcdFx0dGhpcy5fc2V0VmlzaWJpbGl0eShxdWlja0lucHV0U2VydmljZS5hbGlnbm1lbnQuZ2V0KCkgIT09ICd0b3AnKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLm9uSGlkZSgoKSA9PiB7XG5cdFx0XHRxdWlja0lucHV0VmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fc2V0VmlzaWJpbGl0eSh0cnVlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFsaWdubWVudCA9IHF1aWNrSW5wdXRTZXJ2aWNlLmFsaWdubWVudC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAocXVpY2tJbnB1dFZpc2libGUpIHtcblx0XHRcdFx0dGhpcy5fc2V0VmlzaWJpbGl0eShhbGlnbm1lbnQgIT09ICd0b3AnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRpdGxlVG9vbGJhcik7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRWaXNpYmlsaXR5KHNob3c6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZScsICFzaG93KTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZmlyZSgpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuXG5jbGFzcyBDb21tYW5kQ2VudGVyQ2VudGVyVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9xdWlja09wZW5Db21tYW5kSWQgPSAnd29ya2JlbmNoLmFjdGlvbi5xdWlja09wZW5XaXRoTW9kZXMnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3N1Ym1lbnU6IFN1Ym1lbnVJdGVtQWN0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dpbmRvd1RpdGxlOiBXaW5kb3dUaXRsZSxcblx0XHRvcHRpb25zOiBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSBfaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgX2VkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIF9zdWJtZW51LmFjdGlvbnMuZmluZChhY3Rpb24gPT4gYWN0aW9uLmlkID09PSAnd29ya2JlbmNoLmFjdGlvbi5xdWlja09wZW5XaXRoTW9kZXMnKSA/PyBfc3VibWVudS5hY3Rpb25zWzBdLCBvcHRpb25zKTtcblx0XHR0aGlzLl9ob3ZlckRlbGVnYXRlID0gb3B0aW9ucy5ob3ZlckRlbGVnYXRlID8/IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY29tbWFuZC1jZW50ZXItY2VudGVyJyk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ211bHRpcGxlJywgKHRoaXMuX3N1Ym1lbnUuYWN0aW9ucy5sZW5ndGggPiAxKSk7XG5cblx0XHRjb25zdCBob3ZlciA9IHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIodGhpcy5faG92ZXJEZWxlZ2F0ZSwgY29udGFpbmVyLCB0aGlzLmdldFRvb2x0aXAoKSkpO1xuXG5cdFx0Ly8gdXBkYXRlIGxhYmVsICYgdG9vbHRpcCB3aGVuIHdpbmRvdyB0aXRsZSBjaGFuZ2VzXG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX3dpbmRvd1RpdGxlLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGhvdmVyLnVwZGF0ZSh0aGlzLmdldFRvb2x0aXAoKSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZ3JvdXBzOiAocmVhZG9ubHkgSUFjdGlvbltdKVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgdGhpcy5fc3VibWVudS5hY3Rpb25zKSB7XG5cdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgU3VibWVudUFjdGlvbikge1xuXHRcdFx0XHRncm91cHMucHVzaChhY3Rpb24uYWN0aW9ucyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRncm91cHMucHVzaChbYWN0aW9uXSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGdyb3Vwcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZ3JvdXAgPSBncm91cHNbaV07XG5cblx0XHRcdC8vIG5lc3RlZCB0b29sYmFyXG5cdFx0XHRjb25zdCB0b29sYmFyID0gdGhpcy5faW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFRvb2xCYXIsIGNvbnRhaW5lciwge1xuXHRcdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ2NvbW1hbmRDZW50ZXJDZW50ZXInLFxuXHRcdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdFx0b3B0aW9ucyA9IHtcblx0XHRcdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdFx0XHRob3ZlckRlbGVnYXRlOiB0aGlzLl9ob3ZlckRlbGVnYXRlLFxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRpZiAoYWN0aW9uLmlkICE9PSBDb21tYW5kQ2VudGVyQ2VudGVyVmlld0l0ZW0uX3F1aWNrT3BlbkNvbW1hbmRJZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGNyZWF0ZUFjdGlvblZpZXdJdGVtKHRoaXMuX2luc3RhU2VydmljZSwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCB0aGF0ID0gdGhpcztcblxuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoY2xhc3MgQ29tbWFuZENlbnRlclF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXG5cdFx0XHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRcdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdFx0XHRcdFx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRcdFx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NvbW1hbmQtY2VudGVyLXF1aWNrLXBpY2snKTtcblx0XHRcdFx0XHRcdFx0Y29udGFpbmVyLnJvbGUgPSAnYnV0dG9uJztcblx0XHRcdFx0XHRcdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1kZXNjcmlwdGlvbicsIHRoaXMuZ2V0VG9vbHRpcCgpKTtcblxuXHRcdFx0XHRcdFx0XHQvLyBXaGVuIGFnZW50IGNvbnRyb2wgbW9kZSBpcyAnY29tcGFjdCcsIGhpZGUgc2VhcmNoIGljb24gYW5kIGxlZnQtYWxpZ24gdGhlIGxhYmVsXG5cdFx0XHRcdFx0XHRcdC8vIEJhY2t3YXJkIGNvbXBhdDogdGhlIG9sZCBib29sZWFuIHNldHRpbmcgKHRydWUpIGFuZCB0aGUgbmV3IGRlZmF1bHQgKHVuZGVmaW5lZCkgYm90aCBtYXAgdG8gY29tcGFjdFxuXHRcdFx0XHRcdFx0XHRjb25zdCBhaUZlYXR1cmVzRGlzYWJsZWQgPSB0aGF0Ll9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCkgPT09IHRydWU7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGFpQ3VzdG9taXphdGlvbnNEaXNhYmxlZCA9IHRoYXQuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdkaXNhYmxlQUlDdXN0b21pemF0aW9ucycpID09PSB0cnVlXG5cdFx0XHRcdFx0XHRcdFx0fHwgdGhhdC5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3dvcmtiZW5jaC5kaXNhYmxlQUlDdXN0b21pemF0aW9ucycpID09PSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmb3JjZWRIaWRkZW4gPSBhaUZlYXR1cmVzRGlzYWJsZWQgJiYgYWlDdXN0b21pemF0aW9uc0Rpc2FibGVkO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBhZ2VudENvbnRyb2xWYWx1ZSA9IHRoYXQuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEFHRU5UX1NUQVRVU19FTkFCTEVEX1NFVFRJTkcpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBpc0NvbXBhY3RNb2RlID0gIWZvcmNlZEhpZGRlbiAmJiAoYWdlbnRDb250cm9sVmFsdWUgPT09IHRydWUgfHwgYWdlbnRDb250cm9sVmFsdWUgPT09IHVuZGVmaW5lZCB8fCBhZ2VudENvbnRyb2xWYWx1ZSA9PT0gJ2NvbXBhY3QnKTtcblx0XHRcdFx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NvbXBhY3QtbW9kZScsIGlzQ29tcGFjdE1vZGUpO1xuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMuYWN0aW9uO1xuXG5cdFx0XHRcdFx0XHRcdC8vIGljb24gKHNlYXJjaCkgLSBoaWRkZW4gaW4gY29tcGFjdCBtb2RlXG5cdFx0XHRcdFx0XHRcdGNvbnN0IHNlYXJjaEljb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0XHRcdFx0XHRcdHNlYXJjaEljb24uYXJpYUhpZGRlbiA9ICd0cnVlJztcblx0XHRcdFx0XHRcdFx0c2VhcmNoSWNvbi5jbGFzc05hbWUgPSBhY3Rpb24uY2xhc3MgPz8gJyc7XG5cdFx0XHRcdFx0XHRcdHNlYXJjaEljb24uY2xhc3NMaXN0LmFkZCgnc2VhcmNoLWljb24nKTtcblxuXHRcdFx0XHRcdFx0XHQvLyBsYWJlbDoganVzdCB3b3Jrc3BhY2UgbmFtZSBhbmQgb3B0aW9uYWwgZGVjb3JhdGlvbnNcblx0XHRcdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSB0aGlzLl9nZXRMYWJlbCgpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0XHRcdFx0XHRcdGxhYmVsRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdzZWFyY2gtbGFiZWwnKTtcblx0XHRcdFx0XHRcdFx0bGFiZWxFbGVtZW50LnRleHRDb250ZW50ID0gbGFiZWw7XG5cdFx0XHRcdFx0XHRcdGlmIChpc0NvbXBhY3RNb2RlKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVzZXQoY29udGFpbmVyLCBsYWJlbEVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHJlc2V0KGNvbnRhaW5lciwgc2VhcmNoSWNvbiwgbGFiZWxFbGVtZW50KTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IGhvdmVyID0gdGhpcy5fc3RvcmUuYWRkKHRoYXQuX2hvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcih0aGF0Ll9ob3ZlckRlbGVnYXRlLCBjb250YWluZXIsIHRoaXMuZ2V0VG9vbHRpcCgpKSk7XG5cblx0XHRcdFx0XHRcdFx0Ly8gdXBkYXRlIGxhYmVsICYgdG9vbHRpcCB3aGVuIHdpbmRvdyB0aXRsZSBjaGFuZ2VzXG5cdFx0XHRcdFx0XHRcdHRoaXMuX3N0b3JlLmFkZCh0aGF0Ll93aW5kb3dUaXRsZS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0aG92ZXIudXBkYXRlKHRoaXMuZ2V0VG9vbHRpcCgpKTtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbEVsZW1lbnQudGV4dENvbnRlbnQgPSB0aGlzLl9nZXRMYWJlbCgpO1xuXHRcdFx0XHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0XHRcdFx0Ly8gdXBkYXRlIGxhYmVsICYgdG9vbHRpcCB3aGVuIHRhYnMgdmlzaWJpbGl0eSBjaGFuZ2VzXG5cdFx0XHRcdFx0XHRcdHRoaXMuX3N0b3JlLmFkZCh0aGF0Ll9lZGl0b3JHcm91cFNlcnZpY2Uub25EaWRDaGFuZ2VFZGl0b3JQYXJ0T3B0aW9ucygoeyBuZXdQYXJ0T3B0aW9ucywgb2xkUGFydE9wdGlvbnMgfSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChuZXdQYXJ0T3B0aW9ucy5zaG93VGFicyAhPT0gb2xkUGFydE9wdGlvbnMuc2hvd1RhYnMpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGhvdmVyLnVwZGF0ZSh0aGlzLmdldFRvb2x0aXAoKSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRsYWJlbEVsZW1lbnQudGV4dENvbnRlbnQgPSB0aGlzLl9nZXRMYWJlbCgpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0VG9vbHRpcCgpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoYXQuZ2V0VG9vbHRpcCgpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRwcml2YXRlIF9nZXRMYWJlbCgpOiBzdHJpbmcge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB7IHByZWZpeCwgc3VmZml4IH0gPSB0aGF0Ll93aW5kb3dUaXRsZS5nZXRUaXRsZURlY29yYXRpb25zKCk7XG5cdFx0XHRcdFx0XHRcdGxldCBsYWJlbCA9IHRoYXQuX3dpbmRvd1RpdGxlLndvcmtzcGFjZU5hbWU7XG5cdFx0XHRcdFx0XHRcdGlmICh0aGF0Ll93aW5kb3dUaXRsZS5pc0N1c3RvbVRpdGxlRm9ybWF0KCkpIHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbCA9IHRoYXQuX3dpbmRvd1RpdGxlLmdldFdpbmRvd1RpdGxlKCk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAodGhhdC5fZWRpdG9yR3JvdXBTZXJ2aWNlLnBhcnRPcHRpb25zLnNob3dUYWJzID09PSAnbm9uZScpIHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbCA9IHRoYXQuX3dpbmRvd1RpdGxlLmZpbGVOYW1lID8/IGxhYmVsO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmICghbGFiZWwpIHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdsYWJlbC5kZmwnLCBcIlNlYXJjaFwiKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAocHJlZml4KSB7XG5cdFx0XHRcdFx0XHRcdFx0bGFiZWwgPSBsb2NhbGl6ZSgnbGFiZWwxJywgXCJ7MH0gezF9XCIsIHByZWZpeCwgbGFiZWwpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmIChzdWZmaXgpIHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdsYWJlbDInLCBcInswfSB7MX1cIiwgbGFiZWwsIHN1ZmZpeCk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbGFiZWwucmVwbGFjZUFsbCgvXFxyXFxufFxccnxcXG4vZywgJ1xcdTIzQ0UnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR0b29sYmFyLnNldEFjdGlvbnMoZ3JvdXApO1xuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKHRvb2xiYXIpO1xuXG5cblx0XHRcdC8vIHNwYWNlclxuXHRcdFx0aWYgKGkgPCBncm91cHMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRjb25zdCBpY29uID0gcmVuZGVySWNvbihDb2RpY29uLmNpcmNsZVNtYWxsRmlsbGVkKTtcblx0XHRcdFx0aWNvbi5zdHlsZS5wYWRkaW5nID0gJzAgOHB4Jztcblx0XHRcdFx0aWNvbi5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XG5cdFx0XHRcdGljb24uc3R5bGUub3BhY2l0eSA9ICcwLjUnO1xuXHRcdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoaWNvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFRvb2x0aXAoKSB7XG5cblx0XHQvLyB0b29sdGlwOiBmdWxsIHdpbmRvd1RpdGxlXG5cdFx0Y29uc3Qga2IgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKHRoaXMuYWN0aW9uLmlkKT8uZ2V0TGFiZWwoKTtcblx0XHRjb25zdCB0aXRsZSA9IGtiXG5cdFx0XHQ/IGxvY2FsaXplKCd0aXRsZScsIFwiU2VhcmNoIHswfSAoezF9KSBcXHUyMDE0IHsyfVwiLCB0aGlzLl93aW5kb3dUaXRsZS53b3Jrc3BhY2VOYW1lLCBrYiwgdGhpcy5fd2luZG93VGl0bGUudmFsdWUpXG5cdFx0XHQ6IGxvY2FsaXplKCd0aXRsZTInLCBcIlNlYXJjaCB7MH0gXFx1MjAxNCB7MX1cIiwgdGhpcy5fd2luZG93VGl0bGUud29ya3NwYWNlTmFtZSwgdGhpcy5fd2luZG93VGl0bGUudmFsdWUpO1xuXG5cdFx0cmV0dXJuIHRpdGxlO1xuXHR9XG59XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZENlbnRlciwge1xuXHRzdWJtZW51OiBNZW51SWQuQ29tbWFuZENlbnRlckNlbnRlcixcblx0dGl0bGU6IGxvY2FsaXplKCd0aXRsZTMnLCBcIkNvbW1hbmQgQ2VudGVyXCIpLFxuXHRpY29uOiBDb2RpY29uLnNoaWVsZCxcblx0b3JkZXI6IDEwMSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQixhQUFhO0FBQ3hDLFNBQVMsMEJBQXNEO0FBQy9ELFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQWtCLHFCQUFxQjtBQUN2QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFT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
