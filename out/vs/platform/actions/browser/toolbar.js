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
import { addDisposableListener, getWindow } from "../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { ToggleMenuAction, ToolBar } from "../../../base/browser/ui/toolbar/toolbar.js";
import { Separator, toAction } from "../../../base/common/actions.js";
import { coalesceInPlace } from "../../../base/common/arrays.js";
import { intersection } from "../../../base/common/collections.js";
import { BugIndicatingError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { Iterable } from "../../../base/common/iterator.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { localize } from "../../../nls.js";
import { createActionViewItem, getActionBarActions } from "./menuEntryActionViewItem.js";
import { IMenuService, MenuItemAction, SubmenuItemAction } from "../common/actions.js";
import { createConfigureKeybindingAction } from "../common/menuService.js";
import { ICommandService } from "../../commands/common/commands.js";
import { IContextKeyService } from "../../contextkey/common/contextkey.js";
import { IContextMenuService } from "../../contextview/browser/contextView.js";
import { IKeybindingService } from "../../keybinding/common/keybinding.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IActionViewItemService } from "./actionViewItemService.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
var HiddenItemStrategy = /* @__PURE__ */ ((HiddenItemStrategy2) => {
  HiddenItemStrategy2[HiddenItemStrategy2["NoHide"] = -1] = "NoHide";
  HiddenItemStrategy2[HiddenItemStrategy2["Ignore"] = 0] = "Ignore";
  HiddenItemStrategy2[HiddenItemStrategy2["RenderInSecondaryGroup"] = 1] = "RenderInSecondaryGroup";
  return HiddenItemStrategy2;
})(HiddenItemStrategy || {});
let WorkbenchToolBar = class extends ToolBar {
  constructor(container, _options, _menuService, _contextKeyService, _contextMenuService, _keybindingService, _commandService, telemetryService) {
    super(container, _contextMenuService, {
      // defaults
      getKeyBinding: (action) => _keybindingService.lookupKeybinding(action.id) ?? void 0,
      // options (override defaults)
      ..._options,
      // mandatory (overide options)
      allowContextMenu: true,
      skipTelemetry: typeof _options?.telemetrySource === "string"
    });
    this._options = _options;
    this._menuService = _menuService;
    this._contextKeyService = _contextKeyService;
    this._contextMenuService = _contextMenuService;
    this._keybindingService = _keybindingService;
    this._commandService = _commandService;
    this._sessionDisposables = this._store.add(new DisposableStore());
    const telemetrySource = _options?.telemetrySource;
    if (telemetrySource) {
      this._store.add(this.actionBar.onDidRun(
        (e) => telemetryService.publicLog2(
          "workbenchActionExecuted",
          { id: e.action.id, from: telemetrySource }
        )
      ));
    }
  }
  setActions(_primary, _secondary = [], menuIds) {
    this._sessionDisposables.clear();
    const primary = _primary.slice();
    const secondary = _secondary.slice();
    const toggleActions = [];
    let toggleActionsCheckedCount = 0;
    const extraSecondary = [];
    let someAreHidden = false;
    if (this._options?.hiddenItemStrategy !== -1 /* NoHide */) {
      for (let i = 0; i < primary.length; i++) {
        const action = primary[i];
        if (action instanceof Separator) {
          extraSecondary[i] = action;
          continue;
        }
        if (!(action instanceof MenuItemAction) && !(action instanceof SubmenuItemAction)) {
          continue;
        }
        if (!action.hideActions) {
          continue;
        }
        toggleActions.push(action.hideActions.toggle);
        if (action.hideActions.toggle.checked) {
          toggleActionsCheckedCount++;
        }
        if (action.hideActions.isHidden) {
          someAreHidden = true;
          primary[i] = void 0;
          if (this._options?.hiddenItemStrategy !== 0 /* Ignore */) {
            extraSecondary[i] = action;
          }
        }
      }
    }
    if (this._options?.overflowBehavior !== void 0) {
      const exemptedIds = intersection(new Set(this._options.overflowBehavior.exempted), Iterable.map(primary, (a) => a?.id));
      const maxItems = this._options.overflowBehavior.maxItems - exemptedIds.size;
      let count = 0;
      for (let i = 0; i < primary.length; i++) {
        const action = primary[i];
        if (!action) {
          continue;
        }
        count++;
        if (exemptedIds.has(action.id)) {
          continue;
        }
        if (count >= maxItems) {
          primary[i] = void 0;
          extraSecondary[i] = action;
        }
      }
    }
    coalesceInPlace(primary);
    coalesceInPlace(extraSecondary);
    super.setActions(Separator.clean(primary), Separator.join(Separator.clean(extraSecondary), secondary));
    if (toggleActions.length > 0 || primary.length > 0) {
      this._sessionDisposables.add(addDisposableListener(this.getElement(), "contextmenu", (e) => {
        const event = new StandardMouseEvent(getWindow(this.getElement()), e);
        const action = this.getItemAction(event.target);
        if (!action) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const primaryActions = [];
        if (action instanceof MenuItemAction && action.menuKeybinding) {
          primaryActions.push(action.menuKeybinding);
        } else if (!(action instanceof SubmenuItemAction || action instanceof ToggleMenuAction)) {
          const supportsKeybindings = !!this._keybindingService.lookupKeybinding(action.id);
          primaryActions.push(createConfigureKeybindingAction(this._commandService, this._keybindingService, action.id, void 0, supportsKeybindings));
        }
        if (toggleActions.length > 0) {
          let noHide = false;
          if (toggleActionsCheckedCount === 1 && this._options?.hiddenItemStrategy === 0 /* Ignore */) {
            noHide = true;
            for (let i = 0; i < toggleActions.length; i++) {
              if (toggleActions[i].checked) {
                toggleActions[i] = toAction({
                  id: action.id,
                  label: action.label,
                  checked: true,
                  enabled: false,
                  run() {
                  }
                });
                break;
              }
            }
          }
          if (!noHide && (action instanceof MenuItemAction || action instanceof SubmenuItemAction)) {
            if (!action.hideActions) {
              return;
            }
            primaryActions.push(action.hideActions.hide);
          } else {
            primaryActions.push(toAction({
              id: "label",
              label: localize("hide", "Hide"),
              enabled: false,
              run() {
              }
            }));
          }
        }
        const actions = Separator.join(primaryActions, toggleActions);
        if (this._options?.resetMenu && !menuIds) {
          menuIds = [this._options.resetMenu];
        }
        if (someAreHidden && menuIds) {
          actions.push(new Separator());
          actions.push(toAction({
            id: "resetThisMenu",
            label: localize("resetThisMenu", "Reset Menu"),
            run: () => this._menuService.resetHiddenStates(menuIds)
          }));
        }
        if (actions.length === 0) {
          return;
        }
        this._contextMenuService.showContextMenu({
          getAnchor: () => event,
          getActions: () => actions,
          // add context menu actions (iff appicable)
          menuId: this._options?.contextMenu,
          menuActionOptions: { renderShortTitle: true, ...this._options?.menuOptions },
          skipTelemetry: typeof this._options?.telemetrySource === "string",
          contextKeyService: this._contextKeyService
        });
      }));
    }
  }
};
WorkbenchToolBar = __decorateClass([
  __decorateParam(2, IMenuService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, ITelemetryService)
], WorkbenchToolBar);
let MenuWorkbenchToolBar = class extends WorkbenchToolBar {
  constructor(container, menuId, options, menuService, contextKeyService, contextMenuService, keybindingService, commandService, telemetryService, actionViewService, instantiationService) {
    super(container, {
      resetMenu: menuId,
      ...options,
      actionViewItemProvider: (action, opts) => {
        let provider = actionViewService.lookUp(menuId, action instanceof SubmenuItemAction ? action.item.submenu.id : action.id);
        if (!provider) {
          provider = options?.actionViewItemProvider;
        }
        const viewItem = provider?.(action, opts, instantiationService, getWindow(container).vscodeWindowId);
        if (viewItem) {
          return viewItem;
        }
        return createActionViewItem(instantiationService, action, opts);
      }
    }, menuService, contextKeyService, contextMenuService, keybindingService, commandService, telemetryService);
    this._onDidChangeMenuItems = this._store.add(new Emitter());
    this._container = container;
    this._menuOptions = options?.menuOptions;
    this._toolbarOptions = options?.toolbarOptions;
    this._menu = this._store.add(menuService.createMenu(menuId, contextKeyService, { emitEventsForSubmenuChanges: true, eventDebounceDelay: options?.eventDebounceDelay }));
    this._store.add(this._menu.onDidChange(() => {
      this._updateToolbar();
      this._onDidChangeMenuItems.fire(this);
    }));
    this._store.add(actionViewService.onDidChange((e) => {
      if (e === menuId) {
        this._updateToolbar();
      }
    }));
    this._updateToolbar();
  }
  get onDidChangeMenuItems() {
    return this._onDidChangeMenuItems.event;
  }
  _updateToolbar() {
    const { primary, secondary } = getActionBarActions(
      this._menu.getActions(this._menuOptions),
      this._toolbarOptions?.primaryGroup,
      this._toolbarOptions?.shouldInlineSubmenu,
      this._toolbarOptions?.useSeparatorsInPrimaryActions
    );
    this._container.classList.toggle("has-no-actions", primary.length === 0 && secondary.length === 0);
    super.setActions(primary, secondary);
  }
  /**
   * Force the toolbar to immediately re-evaluate its menu actions.
   * Use this after synchronously updating context keys to avoid
   * layout shifts caused by the debounced menu change event.
   */
  refresh() {
    this._updateToolbar();
  }
  /**
   * @deprecated The WorkbenchToolBar does not support this method because it works with menus.
   */
  setActions() {
    throw new BugIndicatingError("This toolbar is populated from a menu.");
  }
};
MenuWorkbenchToolBar = __decorateClass([
  __decorateParam(3, IMenuService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, ITelemetryService),
  __decorateParam(9, IActionViewItemService),
  __decorateParam(10, IInstantiationService)
], MenuWorkbenchToolBar);
export {
  HiddenItemStrategy,
  MenuWorkbenchToolBar,
  WorkbenchToolBar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWN0aW9uc1xcYnJvd3NlclxcdG9vbGJhci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgZ2V0V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBJVG9vbEJhck9wdGlvbnMsIFRvZ2dsZU1lbnVBY3Rpb24sIFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9vbGJhci90b29sYmFyLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIFNlcGFyYXRvciwgU3VibWVudUFjdGlvbiwgdG9BY3Rpb24sIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24sIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlSW5QbGFjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBpbnRlcnNlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvblZpZXdJdGVtLCBnZXRBY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJTWVudSwgSU1lbnVBY3Rpb25PcHRpb25zLCBJTWVudVNlcnZpY2UsIE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24sIFN1Ym1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29uZmlndXJlS2V5YmluZGluZ0FjdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9tZW51U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtU2VydmljZSB9IGZyb20gJy4vYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBIaWRkZW5JdGVtU3RyYXRlZ3kge1xuXHQvKiogVGhpcyB0b29sYmFyIGRvZXNuJ3Qgc3VwcG9ydCBoaWRpbmcqL1xuXHROb0hpZGUgPSAtMSxcblx0LyoqIEhpZGRlbiBpdGVtcyBhcmVuJ3Qgc2hvd24gYW55d2hlcmUgKi9cblx0SWdub3JlID0gMCxcblx0LyoqIEhpZGRlbiBpdGVtcyBtb3ZlIGludG8gdGhlIHNlY29uZGFyeSBncm91cCAqL1xuXHRSZW5kZXJJblNlY29uZGFyeUdyb3VwID0gMSxcbn1cblxuZXhwb3J0IHR5cGUgSVdvcmtiZW5jaFRvb2xCYXJPcHRpb25zID0gSVRvb2xCYXJPcHRpb25zICYge1xuXG5cdC8qKlxuXHQgKiBJdGVtcyBvZiB0aGUgcHJpbWFyeSBncm91cCBjYW4gYmUgaGlkZGVuLiBXaGVuIHRoaXMgaGFwcGVucyB0aGUgaXRlbSBjYW5cblx0ICogLSBtb3ZlIGludG8gdGhlIHNlY29uZGFyeSBwb3B1cC1tZW51LCBvclxuXHQgKiAtIG5vdCBiZSBzaG93biBhdCBhbGxcblx0ICovXG5cdGhpZGRlbkl0ZW1TdHJhdGVneT86IEhpZGRlbkl0ZW1TdHJhdGVneTtcblxuXHQvKipcblx0ICogT3B0aW9uYWwgbWVudSBpZCB3aGljaCBpcyB1c2VkIGZvciBhIFwiUmVzZXQgTWVudVwiIGNvbW1hbmQuIFRoaXMgc2hvdWxkIGJlIHRoZVxuXHQgKiBtZW51IGlkIHRoYXQgZGVmaW5lcyB0aGUgY29udGVudHMgb2YgdGhpcyB3b3JrYmVuY2ggbWVudVxuXHQgKi9cblx0cmVzZXRNZW51PzogTWVudUlkO1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBtZW51IGlkIHdoaWNoIGl0ZW1zIGFyZSB1c2VkIGZvciB0aGUgY29udGV4dCBtZW51IG9mIHRoZSB0b29sYmFyLlxuXHQgKi9cblx0Y29udGV4dE1lbnU/OiBNZW51SWQ7XG5cblx0LyoqXG5cdCAqIE9wdGlvbmFsIG9wdGlvbnMgaG93IG1lbnUgYWN0aW9ucyBhcmUgY3JlYXRlZCBhbmQgaW52b2tlZFxuXHQgKi9cblx0bWVudU9wdGlvbnM/OiBJTWVudUFjdGlvbk9wdGlvbnM7XG5cblx0LyoqXG5cdCAqIFdoZW4gc2V0IHRoZSBgd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRgIGlzIGF1dG9tYXRpY2FsbHkgc2VuZCBmb3IgZWFjaCBpbnZva2VkIGFjdGlvbi4gVGhlIGBmcm9tYCBwcm9wZXJ0eVxuXHQgKiBvZiB0aGUgZXZlbnQgd2lsbCB0aGUgcGFzc2VkIGB0ZWxlbWV0cnlTb3VyY2VgLXZhbHVlXG5cdCAqL1xuXHR0ZWxlbWV0cnlTb3VyY2U/OiBzdHJpbmc7XG5cblx0LyoqIFRoaXMgaXMgY29udHJvbGxlZCBieSB0aGUgV29ya2JlbmNoVG9vbEJhciAqL1xuXHRhbGxvd0NvbnRleHRNZW51PzogbmV2ZXI7XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIHRoZSBvdmVyZmxvdyBiZWhhdmlvciBvZiB0aGUgcHJpbWFyeSBncm91cCBvZiB0b29sYmFyLiBUaGlzIGlzdGhlIG1heGltdW0gbnVtYmVyIG9mIGl0ZW1zIGFuZCBpZCBvZlxuXHQgKiBpdGVtcyB0aGF0IHNob3VsZCBuZXZlciBvdmVyZmxvd1xuXHQgKlxuXHQgKi9cblx0b3ZlcmZsb3dCZWhhdmlvcj86IHsgbWF4SXRlbXM6IG51bWJlcjsgZXhlbXB0ZWQ/OiBzdHJpbmdbXSB9O1xufTtcblxuLyoqXG4gKiBUaGUgYFdvcmtiZW5jaFRvb2xCYXJgIGRvZXNcbiAqIC0gc3VwcG9ydCBoaWRpbmcgb2YgbWVudSBpdGVtc1xuICogLSBsb29rdXAga2V5YmluZGluZ3MgZm9yIGVhY2ggYWN0aW9ucyBhdXRvbWF0aWNhbGx5XG4gKiAtIHNlbmQgYHdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkYC1ldmVudHMgZm9yIGVhY2ggYWN0aW9uXG4gKlxuICogU2VlIHtAbGluayBNZW51V29ya2JlbmNoVG9vbEJhcn0gZm9yIGEgdG9vbGJhciB0aGF0IGlzIGJhY2tlZCBieSBhIG1lbnUuXG4gKi9cbmV4cG9ydCBjbGFzcyBXb3JrYmVuY2hUb29sQmFyIGV4dGVuZHMgVG9vbEJhciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkRpc3Bvc2FibGVzID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIF9vcHRpb25zOiBJV29ya2JlbmNoVG9vbEJhck9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGNvbnRhaW5lciwgX2NvbnRleHRNZW51U2VydmljZSwge1xuXHRcdFx0Ly8gZGVmYXVsdHNcblx0XHRcdGdldEtleUJpbmRpbmc6IChhY3Rpb24pID0+IF9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCkgPz8gdW5kZWZpbmVkLFxuXHRcdFx0Ly8gb3B0aW9ucyAob3ZlcnJpZGUgZGVmYXVsdHMpXG5cdFx0XHQuLi5fb3B0aW9ucyxcblx0XHRcdC8vIG1hbmRhdG9yeSAob3ZlcmlkZSBvcHRpb25zKVxuXHRcdFx0YWxsb3dDb250ZXh0TWVudTogdHJ1ZSxcblx0XHRcdHNraXBUZWxlbWV0cnk6IHR5cGVvZiBfb3B0aW9ucz8udGVsZW1ldHJ5U291cmNlID09PSAnc3RyaW5nJyxcblx0XHR9KTtcblxuXHRcdC8vIHRlbGVtZXRyeSBsb2dpY1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNvdXJjZSA9IF9vcHRpb25zPy50ZWxlbWV0cnlTb3VyY2U7XG5cdFx0aWYgKHRlbGVtZXRyeVNvdXJjZSkge1xuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuYWN0aW9uQmFyLm9uRGlkUnVuKGUgPT4gdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KFxuXHRcdFx0XHQnd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLFxuXHRcdFx0XHR7IGlkOiBlLmFjdGlvbi5pZCwgZnJvbTogdGVsZW1ldHJ5U291cmNlIH0pXG5cdFx0XHQpKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBzZXRBY3Rpb25zKF9wcmltYXJ5OiByZWFkb25seSBJQWN0aW9uW10sIF9zZWNvbmRhcnk6IHJlYWRvbmx5IElBY3Rpb25bXSA9IFtdLCBtZW51SWRzPzogcmVhZG9ubHkgTWVudUlkW10pOiB2b2lkIHtcblxuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGNvbnN0IHByaW1hcnk6IEFycmF5PElBY3Rpb24gfCB1bmRlZmluZWQ+ID0gX3ByaW1hcnkuc2xpY2UoKTsgLy8gZm9yIGhpZGluZyBhbmQgb3ZlcmZsb3cgd2Ugc2V0IHNvbWUgaXRlbXMgdG8gdW5kZWZpbmVkXG5cdFx0Y29uc3Qgc2Vjb25kYXJ5ID0gX3NlY29uZGFyeS5zbGljZSgpO1xuXHRcdGNvbnN0IHRvZ2dsZUFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGxldCB0b2dnbGVBY3Rpb25zQ2hlY2tlZENvdW50OiBudW1iZXIgPSAwO1xuXG5cdFx0Y29uc3QgZXh0cmFTZWNvbmRhcnk6IEFycmF5PElBY3Rpb24gfCB1bmRlZmluZWQ+ID0gW107XG5cblx0XHRsZXQgc29tZUFyZUhpZGRlbiA9IGZhbHNlO1xuXHRcdC8vIHVubGVzcyBkaXNhYmxlZCwgbW92ZSBhbGwgaGlkZGVuIGl0ZW1zIHRvIHNlY29uZGFyeSBncm91cCBvciBpZ25vcmUgdGhlbVxuXHRcdGlmICh0aGlzLl9vcHRpb25zPy5oaWRkZW5JdGVtU3RyYXRlZ3kgIT09IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcHJpbWFyeS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBwcmltYXJ5W2ldO1xuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgU2VwYXJhdG9yKSB7XG5cdFx0XHRcdFx0Ly8gVHJhY2sgZ3JvdXAgYm91bmRhcmllcyBmcm9tIGBwcmltYXJ5YCBzbyBoaWRkZW4gaXRlbXMga2VlcFxuXHRcdFx0XHRcdC8vIHRoZWlyIG9yaWdpbmFsIGdyb3VwcyBpbiB0aGUgb3ZlcmZsb3cgbWVudSAocmVsZXZhbnQgd2hlblxuXHRcdFx0XHRcdC8vIGFsbCBtZW51IGdyb3VwcyBhcmUgdHJlYXRlZCBhcyBwcmltYXJ5KS5cblx0XHRcdFx0XHRleHRyYVNlY29uZGFyeVtpXSA9IGFjdGlvbjtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikgJiYgIShhY3Rpb24gaW5zdGFuY2VvZiBTdWJtZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdFx0XHQvLyBjb25zb2xlLndhcm4oYEFjdGlvbiAke2FjdGlvbi5pZH0vJHthY3Rpb24ubGFiZWx9IGlzIG5vdCBhIE1lbnVJdGVtQWN0aW9uYCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFhY3Rpb24uaGlkZUFjdGlvbnMpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGNvbGxlY3QgYWxsIHRvZ2dsZSBhY3Rpb25zXG5cdFx0XHRcdHRvZ2dsZUFjdGlvbnMucHVzaChhY3Rpb24uaGlkZUFjdGlvbnMudG9nZ2xlKTtcblx0XHRcdFx0aWYgKGFjdGlvbi5oaWRlQWN0aW9ucy50b2dnbGUuY2hlY2tlZCkge1xuXHRcdFx0XHRcdHRvZ2dsZUFjdGlvbnNDaGVja2VkQ291bnQrKztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGhpZGRlbiBpdGVtcyBtb3ZlIGludG8gb3ZlcmZsb3cgb3IgaWdub3JlXG5cdFx0XHRcdGlmIChhY3Rpb24uaGlkZUFjdGlvbnMuaXNIaWRkZW4pIHtcblx0XHRcdFx0XHRzb21lQXJlSGlkZGVuID0gdHJ1ZTtcblx0XHRcdFx0XHRwcmltYXJ5W2ldID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmICh0aGlzLl9vcHRpb25zPy5oaWRkZW5JdGVtU3RyYXRlZ3kgIT09IEhpZGRlbkl0ZW1TdHJhdGVneS5JZ25vcmUpIHtcblx0XHRcdFx0XHRcdGV4dHJhU2Vjb25kYXJ5W2ldID0gYWN0aW9uO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGNvdW50IGZvciBtYXhcblx0XHRpZiAodGhpcy5fb3B0aW9ucz8ub3ZlcmZsb3dCZWhhdmlvciAhPT0gdW5kZWZpbmVkKSB7XG5cblx0XHRcdGNvbnN0IGV4ZW1wdGVkSWRzID0gaW50ZXJzZWN0aW9uKG5ldyBTZXQodGhpcy5fb3B0aW9ucy5vdmVyZmxvd0JlaGF2aW9yLmV4ZW1wdGVkKSwgSXRlcmFibGUubWFwKHByaW1hcnksIGEgPT4gYT8uaWQpKTtcblx0XHRcdGNvbnN0IG1heEl0ZW1zID0gdGhpcy5fb3B0aW9ucy5vdmVyZmxvd0JlaGF2aW9yLm1heEl0ZW1zIC0gZXhlbXB0ZWRJZHMuc2l6ZTtcblxuXHRcdFx0bGV0IGNvdW50ID0gMDtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcHJpbWFyeS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBwcmltYXJ5W2ldO1xuXHRcdFx0XHRpZiAoIWFjdGlvbikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHRcdGlmIChleGVtcHRlZElkcy5oYXMoYWN0aW9uLmlkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjb3VudCA+PSBtYXhJdGVtcykge1xuXHRcdFx0XHRcdHByaW1hcnlbaV0gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0ZXh0cmFTZWNvbmRhcnlbaV0gPSBhY3Rpb247XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBjb2FsZXNjZSB0dXJucyBBcnJheTxJQWN0aW9ufHVuZGVmaW5lZD4gaW50byBJQWN0aW9uW11cblx0XHRjb2FsZXNjZUluUGxhY2UocHJpbWFyeSk7XG5cdFx0Y29hbGVzY2VJblBsYWNlKGV4dHJhU2Vjb25kYXJ5KTtcblxuXHRcdHN1cGVyLnNldEFjdGlvbnMoU2VwYXJhdG9yLmNsZWFuKHByaW1hcnkpLCBTZXBhcmF0b3Iuam9pbihTZXBhcmF0b3IuY2xlYW4oZXh0cmFTZWNvbmRhcnkpLCBzZWNvbmRhcnkpKTtcblxuXHRcdC8vIGFkZCBjb250ZXh0IG1lbnUgZm9yIHRvZ2dsZSBhbmQgY29uZmlndXJlIGtleWJpbmRpbmcgYWN0aW9uc1xuXHRcdGlmICh0b2dnbGVBY3Rpb25zLmxlbmd0aCA+IDAgfHwgcHJpbWFyeS5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmdldEVsZW1lbnQoKSwgJ2NvbnRleHRtZW51JywgZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudChnZXRXaW5kb3codGhpcy5nZXRFbGVtZW50KCkpLCBlKTtcblxuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLmdldEl0ZW1BY3Rpb24oZXZlbnQudGFyZ2V0KTtcblx0XHRcdFx0aWYgKCEoYWN0aW9uKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblxuXHRcdFx0XHRjb25zdCBwcmltYXJ5QWN0aW9ucyA9IFtdO1xuXG5cdFx0XHRcdC8vIC0tIENvbmZpZ3VyZSBLZXliaW5kaW5nIEFjdGlvbiAtLVxuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24gJiYgYWN0aW9uLm1lbnVLZXliaW5kaW5nKSB7XG5cdFx0XHRcdFx0cHJpbWFyeUFjdGlvbnMucHVzaChhY3Rpb24ubWVudUtleWJpbmRpbmcpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgU3VibWVudUl0ZW1BY3Rpb24gfHwgYWN0aW9uIGluc3RhbmNlb2YgVG9nZ2xlTWVudUFjdGlvbikpIHtcblx0XHRcdFx0XHQvLyBvbmx5IGVuYWJsZSB0aGUgY29uZmlndXJlIGtleWJpbmRpbmcgYWN0aW9uIGZvciBhY3Rpb25zIHRoYXQgc3VwcG9ydCBrZXliaW5kaW5nc1xuXHRcdFx0XHRcdGNvbnN0IHN1cHBvcnRzS2V5YmluZGluZ3MgPSAhIXRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKTtcblx0XHRcdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKGNyZWF0ZUNvbmZpZ3VyZUtleWJpbmRpbmdBY3Rpb24odGhpcy5fY29tbWFuZFNlcnZpY2UsIHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLCBhY3Rpb24uaWQsIHVuZGVmaW5lZCwgc3VwcG9ydHNLZXliaW5kaW5ncykpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gLS0gSGlkZSBBY3Rpb25zIC0tXG5cdFx0XHRcdGlmICh0b2dnbGVBY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRsZXQgbm9IaWRlID0gZmFsc2U7XG5cblx0XHRcdFx0XHQvLyBsYXN0IGl0ZW0gY2Fubm90IGJlIGhpZGRlbiB3aGVuIHVzaW5nIGlnbm9yZSBzdHJhdGVneVxuXHRcdFx0XHRcdGlmICh0b2dnbGVBY3Rpb25zQ2hlY2tlZENvdW50ID09PSAxICYmIHRoaXMuX29wdGlvbnM/LmhpZGRlbkl0ZW1TdHJhdGVneSA9PT0gSGlkZGVuSXRlbVN0cmF0ZWd5Lklnbm9yZSkge1xuXHRcdFx0XHRcdFx0bm9IaWRlID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdG9nZ2xlQWN0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0XHRpZiAodG9nZ2xlQWN0aW9uc1tpXS5jaGVja2VkKSB7XG5cdFx0XHRcdFx0XHRcdFx0dG9nZ2xlQWN0aW9uc1tpXSA9IHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdFx0XHRcdGlkOiBhY3Rpb24uaWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogYWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdFx0XHRcdFx0Y2hlY2tlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRcdGVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdFx0cnVuKCkgeyB9XG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7IC8vIHRoZXJlIGlzIG9ubHkgb25lXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBhZGQgXCJoaWRlIGZvb1wiIGFjdGlvbnNcblx0XHRcdFx0XHRpZiAoIW5vSGlkZSAmJiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24gfHwgYWN0aW9uIGluc3RhbmNlb2YgU3VibWVudUl0ZW1BY3Rpb24pKSB7XG5cdFx0XHRcdFx0XHRpZiAoIWFjdGlvbi5oaWRlQWN0aW9ucykge1xuXHRcdFx0XHRcdFx0XHQvLyBubyBjb250ZXh0IG1lbnUgZm9yIE1lbnVJdGVtQWN0aW9uIGluc3RhbmNlcyB0aGF0IHN1cHBvcnQgbm8gaGlkaW5nXG5cdFx0XHRcdFx0XHRcdC8vIHRob3NlIGFyZSBmYWtlIGFjdGlvbnMgYW5kIG5lZWQgdG8gYmUgY2xlYW5lZCB1cFxuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKGFjdGlvbi5oaWRlQWN0aW9ucy5oaWRlKTtcblxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdFx0aWQ6ICdsYWJlbCcsXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaGlkZScsIFwiSGlkZVwiKSxcblx0XHRcdFx0XHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdHJ1bigpIHsgfVxuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGFjdGlvbnMgPSBTZXBhcmF0b3Iuam9pbihwcmltYXJ5QWN0aW9ucywgdG9nZ2xlQWN0aW9ucyk7XG5cblx0XHRcdFx0Ly8gYWRkIFwiUmVzZXQgTWVudVwiIGFjdGlvblxuXHRcdFx0XHRpZiAodGhpcy5fb3B0aW9ucz8ucmVzZXRNZW51ICYmICFtZW51SWRzKSB7XG5cdFx0XHRcdFx0bWVudUlkcyA9IFt0aGlzLl9vcHRpb25zLnJlc2V0TWVudV07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHNvbWVBcmVIaWRkZW4gJiYgbWVudUlkcykge1xuXHRcdFx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0XHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRpZDogJ3Jlc2V0VGhpc01lbnUnLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdyZXNldFRoaXNNZW51JywgXCJSZXNldCBNZW51XCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLl9tZW51U2VydmljZS5yZXNldEhpZGRlblN0YXRlcyhtZW51SWRzKVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChhY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2NvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZlbnQsXG5cdFx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdFx0XHQvLyBhZGQgY29udGV4dCBtZW51IGFjdGlvbnMgKGlmZiBhcHBpY2FibGUpXG5cdFx0XHRcdFx0bWVudUlkOiB0aGlzLl9vcHRpb25zPy5jb250ZXh0TWVudSxcblx0XHRcdFx0XHRtZW51QWN0aW9uT3B0aW9uczogeyByZW5kZXJTaG9ydFRpdGxlOiB0cnVlLCAuLi50aGlzLl9vcHRpb25zPy5tZW51T3B0aW9ucyB9LFxuXHRcdFx0XHRcdHNraXBUZWxlbWV0cnk6IHR5cGVvZiB0aGlzLl9vcHRpb25zPy50ZWxlbWV0cnlTb3VyY2UgPT09ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiB0aGlzLl9jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG59XG5cbi8vIC0tLS0gTWVudVdvcmtiZW5jaFRvb2xCYXIgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRvb2xCYXJSZW5kZXJPcHRpb25zIHtcblx0LyoqXG5cdCAqIERldGVybWluZXMgd2hhdCBncm91cHMgYXJlIGNvbnNpZGVyZWQgcHJpbWFyeS4gRGVmYXVsdHMgdG8gYG5hdmlnYXRpb25gLiBJdGVtcyBvZiB0aGUgcHJpbWFyeVxuXHQgKiBncm91cCBhcmUgcmVuZGVyZWQgd2l0aCBidXR0b25zIGFuZCB0aGUgcmVzdCBpcyByZW5kZXJlZCBpbiB0aGUgc2Vjb25kYXJ5IHBvcHVwLW1lbnUuXG5cdCAqL1xuXHRwcmltYXJ5R3JvdXA/OiBzdHJpbmcgfCAoKGFjdGlvbkdyb3VwOiBzdHJpbmcpID0+IGJvb2xlYW4pO1xuXG5cdC8qKlxuXHQgKiBJbmxpbnNlIHN1Ym1lbnVzIHdpdGgganVzdCBhIHNpbmdsZSBpdGVtXG5cdCAqL1xuXHRzaG91bGRJbmxpbmVTdWJtZW51PzogKGFjdGlvbjogU3VibWVudUFjdGlvbiwgZ3JvdXA6IHN0cmluZywgZ3JvdXBTaXplOiBudW1iZXIpID0+IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFNob3VsZCB0aGUgcHJpbWFyeSBncm91cCBhbGxvdyBmb3Igc2VwYXJhdG9ycy5cblx0ICovXG5cdHVzZVNlcGFyYXRvcnNJblByaW1hcnlBY3Rpb25zPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWVudVdvcmtiZW5jaFRvb2xCYXJPcHRpb25zIGV4dGVuZHMgSVdvcmtiZW5jaFRvb2xCYXJPcHRpb25zIHtcblxuXHQvKipcblx0ICogT3B0aW9uYWwgb3B0aW9ucyB0byBjb25maWd1cmUgaG93IHRoZSB0b29sYmFyIHJlbmRlcmVzIGl0ZW1zLlxuXHQgKi9cblx0dG9vbGJhck9wdGlvbnM/OiBJVG9vbEJhclJlbmRlck9wdGlvbnM7XG5cblx0LyoqXG5cdCAqIE9ubHkgYHVuZGVmaW5lZGAgdG8gZGlzYWJsZSB0aGUgcmVzZXQgY29tbWFuZCBpcyBhbGxvd2VkLCBvdGhlcndpc2UgdGhlIG1lbnVzXG5cdCAqIGlkIGlzIHVzZWQuXG5cdCAqL1xuXHRyZXNldE1lbnU/OiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEN1c3RvbWl6ZSB0aGUgZGVib3VuY2UgZGVsYXkgZm9yIG1lbnUgdXBkYXRlc1xuXHQgKi9cblx0ZXZlbnREZWJvdW5jZURlbGF5PzogbnVtYmVyO1xufVxuXG4vKipcbiAqIEEge0BsaW5rIFdvcmtiZW5jaFRvb2xCYXIgd29ya2JlbmNoIHRvb2xiYXJ9IHRoYXQgaXMgcHVyZWx5IGRyaXZlbiBmcm9tIGEge0BsaW5rIE1lbnVJZCBtZW51fS1pZGVudGlmaWVyLlxuICpcbiAqICpOb3RlKiB0aGF0IE1hbnVhbCB1cGRhdGVzIHZpYSBgc2V0QWN0aW9uc2AgYXJlIE5PVCBzdXBwb3J0ZWQuXG4gKi9cbmV4cG9ydCBjbGFzcyBNZW51V29ya2JlbmNoVG9vbEJhciBleHRlbmRzIFdvcmtiZW5jaFRvb2xCYXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTWVudUl0ZW1zID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHRoaXM+KCkpO1xuXHRnZXQgb25EaWRDaGFuZ2VNZW51SXRlbXMoKSB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZU1lbnVJdGVtcy5ldmVudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21lbnU6IElNZW51O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZW51T3B0aW9uczogSU1lbnVBY3Rpb25PcHRpb25zIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b29sYmFyT3B0aW9uczogSVRvb2xCYXJSZW5kZXJPcHRpb25zIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250YWluZXI6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0bWVudUlkOiBNZW51SWQsXG5cdFx0b3B0aW9uczogSU1lbnVXb3JrYmVuY2hUb29sQmFyT3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUFjdGlvblZpZXdJdGVtU2VydmljZSBhY3Rpb25WaWV3U2VydmljZTogSUFjdGlvblZpZXdJdGVtU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGNvbnRhaW5lciwge1xuXHRcdFx0cmVzZXRNZW51OiBtZW51SWQsXG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0cykgPT4ge1xuXHRcdFx0XHRsZXQgcHJvdmlkZXIgPSBhY3Rpb25WaWV3U2VydmljZS5sb29rVXAobWVudUlkLCBhY3Rpb24gaW5zdGFuY2VvZiBTdWJtZW51SXRlbUFjdGlvbiA/IGFjdGlvbi5pdGVtLnN1Ym1lbnUuaWQgOiBhY3Rpb24uaWQpO1xuXHRcdFx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0cHJvdmlkZXIgPSBvcHRpb25zPy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHZpZXdJdGVtID0gcHJvdmlkZXI/LihhY3Rpb24sIG9wdHMsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBnZXRXaW5kb3coY29udGFpbmVyKS52c2NvZGVXaW5kb3dJZCk7XG5cdFx0XHRcdGlmICh2aWV3SXRlbSkge1xuXHRcdFx0XHRcdHJldHVybiB2aWV3SXRlbTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gY3JlYXRlQWN0aW9uVmlld0l0ZW0oaW5zdGFudGlhdGlvblNlcnZpY2UsIGFjdGlvbiwgb3B0cyk7XG5cdFx0XHR9XG5cdFx0fSwgbWVudVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb21tYW5kU2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHR0aGlzLl9jb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0dGhpcy5fbWVudU9wdGlvbnMgPSBvcHRpb25zPy5tZW51T3B0aW9ucztcblx0XHR0aGlzLl90b29sYmFyT3B0aW9ucyA9IG9wdGlvbnM/LnRvb2xiYXJPcHRpb25zO1xuXG5cdFx0Ly8gdXBkYXRlIGxvZ2ljXG5cdFx0dGhpcy5fbWVudSA9IHRoaXMuX3N0b3JlLmFkZChtZW51U2VydmljZS5jcmVhdGVNZW51KG1lbnVJZCwgY29udGV4dEtleVNlcnZpY2UsIHsgZW1pdEV2ZW50c0ZvclN1Ym1lbnVDaGFuZ2VzOiB0cnVlLCBldmVudERlYm91bmNlRGVsYXk6IG9wdGlvbnM/LmV2ZW50RGVib3VuY2VEZWxheSB9KSk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5fbWVudS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVUb29sYmFyKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZU1lbnVJdGVtcy5maXJlKHRoaXMpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZChhY3Rpb25WaWV3U2VydmljZS5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlID09PSBtZW51SWQpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlVG9vbGJhcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl91cGRhdGVUb29sYmFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVUb29sYmFyKCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgcHJpbWFyeSwgc2Vjb25kYXJ5IH0gPSBnZXRBY3Rpb25CYXJBY3Rpb25zKFxuXHRcdFx0dGhpcy5fbWVudS5nZXRBY3Rpb25zKHRoaXMuX21lbnVPcHRpb25zKSxcblx0XHRcdHRoaXMuX3Rvb2xiYXJPcHRpb25zPy5wcmltYXJ5R3JvdXAsXG5cdFx0XHR0aGlzLl90b29sYmFyT3B0aW9ucz8uc2hvdWxkSW5saW5lU3VibWVudSxcblx0XHRcdHRoaXMuX3Rvb2xiYXJPcHRpb25zPy51c2VTZXBhcmF0b3JzSW5QcmltYXJ5QWN0aW9uc1xuXHRcdCk7XG5cdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hhcy1uby1hY3Rpb25zJywgcHJpbWFyeS5sZW5ndGggPT09IDAgJiYgc2Vjb25kYXJ5Lmxlbmd0aCA9PT0gMCk7XG5cdFx0c3VwZXIuc2V0QWN0aW9ucyhwcmltYXJ5LCBzZWNvbmRhcnkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvcmNlIHRoZSB0b29sYmFyIHRvIGltbWVkaWF0ZWx5IHJlLWV2YWx1YXRlIGl0cyBtZW51IGFjdGlvbnMuXG5cdCAqIFVzZSB0aGlzIGFmdGVyIHN5bmNocm9ub3VzbHkgdXBkYXRpbmcgY29udGV4dCBrZXlzIHRvIGF2b2lkXG5cdCAqIGxheW91dCBzaGlmdHMgY2F1c2VkIGJ5IHRoZSBkZWJvdW5jZWQgbWVudSBjaGFuZ2UgZXZlbnQuXG5cdCAqL1xuXHRyZWZyZXNoKCk6IHZvaWQge1xuXHRcdHRoaXMuX3VwZGF0ZVRvb2xiYXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAZGVwcmVjYXRlZCBUaGUgV29ya2JlbmNoVG9vbEJhciBkb2VzIG5vdCBzdXBwb3J0IHRoaXMgbWV0aG9kIGJlY2F1c2UgaXQgd29ya3Mgd2l0aCBtZW51cy5cblx0ICovXG5cdG92ZXJyaWRlIHNldEFjdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignVGhpcyB0b29sYmFyIGlzIHBvcHVsYXRlZCBmcm9tIGEgbWVudS4nKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QixpQkFBaUI7QUFDakQsU0FBUywwQkFBMEI7QUFDbkMsU0FBMEIsa0JBQWtCLGVBQWU7QUFDM0QsU0FBa0IsV0FBMEIsZ0JBQXFGO0FBQ2pJLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQiwyQkFBMkI7QUFDMUQsU0FBb0MsY0FBc0IsZ0JBQWdCLHlCQUF5QjtBQUNuRyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDZCQUE2QjtBQUUvQixJQUFXLHFCQUFY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
