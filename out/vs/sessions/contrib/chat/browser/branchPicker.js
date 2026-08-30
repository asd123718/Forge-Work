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
import * as dom from "../../../../base/browser/dom.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Checkbox } from "../../../../base/browser/ui/toggle/toggle.js";
import { Gesture, EventType as TouchEventType } from "../../../../base/browser/touch.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { ActionListItemKind } from "../../../../platform/actionWidget/browser/actionList.js";
import { defaultCheckboxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import "./media/branchPicker.css";
const FILTER_THRESHOLD = 10;
let descriptionIdPool = 0;
let BranchPicker = class extends Disposable {
  constructor(_options, _actionWidgetService) {
    super();
    this._options = _options;
    this._actionWidgetService = _actionWidgetService;
    this._renderDisposables = this._register(new DisposableStore());
    this._state = {
      label: localize("branchPicker.select", "Branch"),
      branches: [],
      status: "empty",
      canOpen: false
    };
    this._isOpen = false;
    this._register(toDisposable(() => {
      if (this._isOpen) {
        this._actionWidgetService.hide(true);
      }
    }));
  }
  _renderIsolation(container) {
    const isolation = this._options.isolation;
    if (!isolation) {
      return;
    }
    const slot = dom.append(container, dom.$(".sessions-chat-picker-slot.sessions-chat-isolation-checkbox"));
    if (isolation.slotClassName) {
      slot.classList.add(isolation.slotClassName);
    }
    this._isolationSlot = slot;
    this._renderDisposables.add(toDisposable(() => slot.remove()));
    if (isolation.markTarget) {
      this._renderDisposables.add(isolation.markTarget(slot));
    }
    const row = dom.append(slot, dom.$(".action-label"));
    row.setAttribute("aria-label", isolation.ariaLabel);
    this._isolationRow = row;
    const checkbox = this._renderDisposables.add(new Checkbox(isolation.label, this._isolationState?.checked ?? false, { ...defaultCheckboxStyles, size: 14 }));
    this._isolationCheckbox = checkbox;
    dom.append(row, checkbox.domNode);
    const labelSpan = dom.append(row, dom.$("span.sessions-chat-dropdown-label"));
    labelSpan.textContent = isolation.label;
    this._renderDisposables.add(checkbox.onChange(() => isolation.onToggle(checkbox.checked)));
    this._renderDisposables.add(Gesture.addTarget(row));
    for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
      this._renderDisposables.add(dom.addDisposableListener(row, eventType, (e) => {
        if (!checkbox.enabled) {
          return;
        }
        dom.EventHelper.stop(e, true);
        checkbox.checked = !checkbox.checked;
        isolation.onToggle(checkbox.checked);
      }));
    }
    this._updateIsolation();
  }
  _updateIsolation() {
    if (!this._options.isolation || !this._isolationCheckbox || !this._isolationSlot) {
      return;
    }
    const state = this._isolationState;
    const mode = state?.state ?? "disabled";
    this._isolationCheckbox.checked = state?.checked ?? false;
    if (mode === "enabled") {
      this._isolationCheckbox.enable();
    } else {
      this._isolationCheckbox.disable();
      this._isolationCheckbox.domNode.tabIndex = 0;
    }
    this._isolationSlot.classList.toggle("disabled", mode === "disabled");
    this._isolationSlot.classList.toggle("hidden", mode === "hidden");
    const reason = state?.disabledReason;
    if (this._isolationRow) {
      if (mode === "disabled" && reason) {
        this._isolationRow.title = reason;
      } else {
        this._isolationRow.removeAttribute("title");
      }
    }
  }
  render(container) {
    if (this._isOpen) {
      this._actionWidgetService.hide(true);
    }
    this._renderDisposables.clear();
    const renderTarget = this._options.isolation ? dom.append(container, dom.$("span.sessions-chat-branch-picker-group")) : container;
    if (renderTarget !== container) {
      this._renderDisposables.add({ dispose: () => renderTarget.remove() });
    }
    this._renderIsolation(renderTarget);
    const slot = dom.append(renderTarget, dom.$(".sessions-chat-picker-slot"));
    if (this._options.slotClassName) {
      slot.classList.add(this._options.slotClassName);
    }
    this._slotElement = slot;
    this._renderDisposables.add({ dispose: () => slot.remove() });
    const trigger = dom.append(slot, dom.$("a.action-label"));
    if (this._options.triggerClassName) {
      trigger.classList.add(this._options.triggerClassName);
    }
    trigger.role = "button";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    if (this._options.ariaLive) {
      trigger.setAttribute("aria-live", this._options.ariaLive);
    }
    this._triggerElement = trigger;
    const description = dom.append(slot, dom.$("span.branch-picker-description"));
    if (this._options.descriptionClassName) {
      description.classList.add(this._options.descriptionClassName);
    }
    description.id = `branch-picker-description-${++descriptionIdPool}`;
    trigger.setAttribute("aria-describedby", description.id);
    this._descriptionElement = description;
    this._updateTrigger();
    this._renderDisposables.add(Gesture.addTarget(trigger));
    for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
      this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
        dom.EventHelper.stop(e, true);
        this.showPicker();
      }));
    }
    this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        dom.EventHelper.stop(e, true);
        this.showPicker();
      }
    }));
  }
  update(state) {
    this._state = state;
    this._isolationState = state.isolation;
    this._updateTrigger();
    this._updateIsolation();
    if (this._isOpen) {
      if (!state.canOpen) {
        this._actionWidgetService.hide(true);
      } else {
        this._actionWidgetService.updateItems(this._getItems());
      }
    }
  }
  showPicker() {
    if (!this._triggerElement || this._actionWidgetService.isVisible || !this._state.canOpen) {
      return;
    }
    const trigger = this._triggerElement;
    const delegate = {
      onSelect: (item) => {
        this._actionWidgetService.hide();
        if (item.kind === "retry") {
          this._options.onRetry?.();
        } else if (item.name) {
          this._options.onSelectBranch(item.name);
        }
      },
      onHide: () => {
        this._isOpen = false;
        trigger.setAttribute("aria-expanded", "false");
        if (trigger.isConnected) {
          trigger.focus();
        }
      }
    };
    this._isOpen = true;
    trigger.setAttribute("aria-expanded", "true");
    const items = this._getItems();
    const branchCount = items.filter((item) => item.item?.kind === "branch" && !item.item.unavailable).length;
    this._actionWidgetService.show(
      this._options.user,
      false,
      items,
      delegate,
      trigger,
      void 0,
      [],
      {
        getAriaLabel: (item) => {
          const label = item.label ?? "";
          return item.item?.unavailable ? localize("branchPicker.unavailableAriaLabel", "{0}, unavailable locally", label) : label;
        },
        getWidgetAriaLabel: () => localize("branchPicker.ariaLabel", "Branch Picker")
      },
      branchCount > FILTER_THRESHOLD ? { showFilter: true, filterPlaceholder: localize("branchPicker.filter", "Filter branches\u2026") } : void 0
    );
  }
  _getItems() {
    switch (this._state.status) {
      case "loading":
        return [{
          kind: ActionListItemKind.Action,
          label: localize("branchPicker.loading", "Loading branches\u2026"),
          disabled: true,
          item: { kind: "branch" }
        }];
      case "error":
        return [{
          kind: ActionListItemKind.Action,
          label: localize("branchPicker.retry", "Retry Loading Branches"),
          group: { title: "", icon: Codicon.refresh },
          disabled: !this._options.onRetry,
          item: { kind: "retry" }
        }];
      case "empty":
        return [{
          kind: ActionListItemKind.Action,
          label: localize("branchPicker.empty", "No local branches"),
          disabled: true,
          item: { kind: "branch" }
        }];
      case "ready":
        return this._state.branches.map((branch) => ({
          kind: ActionListItemKind.Action,
          label: branch.name,
          detail: branch.unavailable ? localize("branchPicker.unavailable", "Unavailable locally") : void 0,
          group: { title: "", icon: branch.unavailable ? Codicon.warning : Codicon.gitBranch },
          item: {
            kind: "branch",
            name: branch.name,
            checked: branch.selected || void 0,
            unavailable: branch.unavailable
          }
        }));
    }
  }
  _updateTrigger() {
    if (!this._triggerElement || !this._slotElement || !this._descriptionElement) {
      return;
    }
    dom.clearNode(this._triggerElement);
    const icon = dom.append(this._triggerElement, renderIcon(Codicon.gitBranch));
    icon.setAttribute("aria-hidden", "true");
    const label = dom.append(this._triggerElement, dom.$("span.sessions-chat-dropdown-label"));
    if (this._options.labelClassName) {
      label.classList.add(this._options.labelClassName);
    }
    label.textContent = this._state.label;
    if (this._state.showChevron !== false) {
      const chevron = dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
      chevron.setAttribute("aria-hidden", "true");
    }
    const disabled = !this._state.canOpen;
    const renderAsStatic = disabled && this._options.renderDisabledAsStatic === true;
    const reason = this._state.disabledReason;
    this._triggerElement.setAttribute("aria-label", disabled && reason ? localize("branchPicker.disabledAriaLabel", "{0}. {1}", this._state.label, reason) : localize("branchPicker.triggerAriaLabel", "Pick Branch, {0}", this._state.label));
    this._triggerElement.setAttribute("aria-disabled", String(disabled));
    this._triggerElement.setAttribute("aria-busy", String(this._state.status === "loading"));
    this._triggerElement.tabIndex = !disabled || this._options.keepDisabledFocusable && !renderAsStatic ? 0 : -1;
    if (renderAsStatic) {
      this._triggerElement.removeAttribute("role");
      this._triggerElement.removeAttribute("aria-haspopup");
      this._triggerElement.removeAttribute("aria-expanded");
    } else {
      this._triggerElement.setAttribute("role", "button");
      this._triggerElement.setAttribute("aria-haspopup", "listbox");
      this._triggerElement.setAttribute("aria-expanded", String(this._isOpen));
    }
    this._triggerElement.title = disabled && reason ? reason : this._state.label;
    this._descriptionElement.textContent = reason ?? "";
    this._slotElement.classList.toggle("disabled", disabled);
    this._triggerElement.classList.toggle("branch-picker-disabled", disabled);
    this._triggerElement.classList.toggle("branch-picker-missing", this._state.missing === true);
  }
};
BranchPicker = __decorateClass([
  __decorateParam(1, IActionWidgetService)
], BranchPicker);
export {
  BranchPicker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3NlclxcYnJhbmNoUGlja2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBDaGVja2JveCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IEdlc3R1cmUsIEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IEFjdGlvbkxpc3RJdGVtS2luZCwgSUFjdGlvbkxpc3REZWxlZ2F0ZSwgSUFjdGlvbkxpc3RJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0Q2hlY2tib3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0ICcuL21lZGlhL2JyYW5jaFBpY2tlci5jc3MnO1xuXG5jb25zdCBGSUxURVJfVEhSRVNIT0xEID0gMTA7XG5sZXQgZGVzY3JpcHRpb25JZFBvb2wgPSAwO1xuXG5leHBvcnQgaW50ZXJmYWNlIElCcmFuY2hQaWNrZXJCcmFuY2gge1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlbGVjdGVkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdW5hdmFpbGFibGU/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElCcmFuY2hQaWNrZXJTdGF0ZSB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGJyYW5jaGVzOiByZWFkb25seSBJQnJhbmNoUGlja2VyQnJhbmNoW107XG5cdHJlYWRvbmx5IHN0YXR1czogJ3JlYWR5JyB8ICdsb2FkaW5nJyB8ICdlbXB0eScgfCAnZXJyb3InO1xuXHRyZWFkb25seSBjYW5PcGVuOiBib29sZWFuO1xuXHRyZWFkb25seSBkaXNhYmxlZFJlYXNvbj86IHN0cmluZztcblx0cmVhZG9ubHkgbWlzc2luZz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNob3dDaGV2cm9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNvbGF0aW9uPzogSUJyYW5jaFBpY2tlcklzb2xhdGlvblN0YXRlO1xufVxuXG4vKipcbiAqIFN0YXRpYyBjb25maWd1cmF0aW9uIGZvciB0aGUgb3B0aW9uYWwgaXNvbGF0aW9uIGNoZWNrYm94IHJlbmRlcmVkIGJlZm9yZSB0aGUgYnJhbmNoIHRyaWdnZXIuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUJyYW5jaFBpY2tlcklzb2xhdGlvbk9wdGlvbnMge1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBhcmlhTGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgb25Ub2dnbGU6IChjaGVja2VkOiBib29sZWFuKSA9PiB2b2lkO1xuXHRyZWFkb25seSBzbG90Q2xhc3NOYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBtYXJrVGFyZ2V0PzogKGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA9PiBJRGlzcG9zYWJsZTtcbn1cblxuLyoqXG4gKiBQZXItdXBkYXRlIHN0YXRlIGZvciB0aGUgb3B0aW9uYWwgaXNvbGF0aW9uIGNoZWNrYm94LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElCcmFuY2hQaWNrZXJJc29sYXRpb25TdGF0ZSB7XG5cdHJlYWRvbmx5IGNoZWNrZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHN0YXRlOiAnZW5hYmxlZCcgfCAnZGlzYWJsZWQnIHwgJ2hpZGRlbic7XG5cdHJlYWRvbmx5IGRpc2FibGVkUmVhc29uPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElCcmFuY2hQaWNrZXJPcHRpb25zIHtcblx0cmVhZG9ubHkgdXNlcjogc3RyaW5nO1xuXHRyZWFkb25seSBvblNlbGVjdEJyYW5jaDogKGJyYW5jaDogc3RyaW5nKSA9PiB2b2lkO1xuXHRyZWFkb25seSBvblJldHJ5PzogKCkgPT4gdm9pZDtcblx0cmVhZG9ubHkgc2xvdENsYXNzTmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgdHJpZ2dlckNsYXNzTmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWxDbGFzc05hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uQ2xhc3NOYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBrZWVwRGlzYWJsZWRGb2N1c2FibGU/OiBib29sZWFuO1xuXHRyZWFkb25seSByZW5kZXJEaXNhYmxlZEFzU3RhdGljPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgYXJpYUxpdmU/OiAnb2ZmJyB8ICdwb2xpdGUnIHwgJ2Fzc2VydGl2ZSc7XG5cdHJlYWRvbmx5IGlzb2xhdGlvbj86IElCcmFuY2hQaWNrZXJJc29sYXRpb25PcHRpb25zO1xufVxuXG5pbnRlcmZhY2UgSUJyYW5jaFBpY2tlckl0ZW0ge1xuXHRyZWFkb25seSBraW5kOiAnYnJhbmNoJyB8ICdyZXRyeSc7XG5cdHJlYWRvbmx5IG5hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNoZWNrZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSB1bmF2YWlsYWJsZT86IGJvb2xlYW47XG59XG5cbi8qKlxuICogU2hhcmVkIGJyYW5jaCB0cmlnZ2VyIGFuZCBBY3Rpb25XaWRnZXQgdXNlZCBieSBuZXctc2Vzc2lvbiBhbmQgYXV0b21hdGlvbiBzdXJmYWNlcy5cbiAqL1xuZXhwb3J0IGNsYXNzIEJyYW5jaFBpY2tlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX3N0YXRlOiBJQnJhbmNoUGlja2VyU3RhdGUgPSB7XG5cdFx0bGFiZWw6IGxvY2FsaXplKCdicmFuY2hQaWNrZXIuc2VsZWN0JywgXCJCcmFuY2hcIiksXG5cdFx0YnJhbmNoZXM6IFtdLFxuXHRcdHN0YXR1czogJ2VtcHR5Jyxcblx0XHRjYW5PcGVuOiBmYWxzZSxcblx0fTtcblx0cHJpdmF0ZSBfc2xvdEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90cmlnZ2VyRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2Rlc2NyaXB0aW9uRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2lzT3BlbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9pc29sYXRpb25TbG90OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNvbGF0aW9uUm93OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNvbGF0aW9uQ2hlY2tib3g6IENoZWNrYm94IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pc29sYXRpb25TdGF0ZTogSUJyYW5jaFBpY2tlcklzb2xhdGlvblN0YXRlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM6IElCcmFuY2hQaWNrZXJPcHRpb25zLFxuXHRcdEBJQWN0aW9uV2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY3Rpb25XaWRnZXRTZXJ2aWNlOiBJQWN0aW9uV2lkZ2V0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzT3Blbikge1xuXHRcdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmhpZGUodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVySXNvbGF0aW9uKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBpc29sYXRpb24gPSB0aGlzLl9vcHRpb25zLmlzb2xhdGlvbjtcblx0XHRpZiAoIWlzb2xhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNsb3QgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LXBpY2tlci1zbG90LnNlc3Npb25zLWNoYXQtaXNvbGF0aW9uLWNoZWNrYm94JykpO1xuXHRcdGlmIChpc29sYXRpb24uc2xvdENsYXNzTmFtZSkge1xuXHRcdFx0c2xvdC5jbGFzc0xpc3QuYWRkKGlzb2xhdGlvbi5zbG90Q2xhc3NOYW1lKTtcblx0XHR9XG5cdFx0dGhpcy5faXNvbGF0aW9uU2xvdCA9IHNsb3Q7XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBzbG90LnJlbW92ZSgpKSk7XG5cdFx0aWYgKGlzb2xhdGlvbi5tYXJrVGFyZ2V0KSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoaXNvbGF0aW9uLm1hcmtUYXJnZXQoc2xvdCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJvdyA9IGRvbS5hcHBlbmQoc2xvdCwgZG9tLiQoJy5hY3Rpb24tbGFiZWwnKSk7XG5cdFx0cm93LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGlzb2xhdGlvbi5hcmlhTGFiZWwpO1xuXHRcdHRoaXMuX2lzb2xhdGlvblJvdyA9IHJvdztcblxuXHRcdGNvbnN0IGNoZWNrYm94ID0gdGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKG5ldyBDaGVja2JveChpc29sYXRpb24ubGFiZWwsIHRoaXMuX2lzb2xhdGlvblN0YXRlPy5jaGVja2VkID8/IGZhbHNlLCB7IC4uLmRlZmF1bHRDaGVja2JveFN0eWxlcywgc2l6ZTogMTQgfSkpO1xuXHRcdHRoaXMuX2lzb2xhdGlvbkNoZWNrYm94ID0gY2hlY2tib3g7XG5cdFx0ZG9tLmFwcGVuZChyb3csIGNoZWNrYm94LmRvbU5vZGUpO1xuXHRcdGNvbnN0IGxhYmVsU3BhbiA9IGRvbS5hcHBlbmQocm93LCBkb20uJCgnc3Bhbi5zZXNzaW9ucy1jaGF0LWRyb3Bkb3duLWxhYmVsJykpO1xuXHRcdGxhYmVsU3Bhbi50ZXh0Q29udGVudCA9IGlzb2xhdGlvbi5sYWJlbDtcblxuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChjaGVja2JveC5vbkNoYW5nZSgoKSA9PiBpc29sYXRpb24ub25Ub2dnbGUoY2hlY2tib3guY2hlY2tlZCkpKTtcblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoR2VzdHVyZS5hZGRUYXJnZXQocm93KSk7XG5cdFx0Zm9yIChjb25zdCBldmVudFR5cGUgb2YgW2RvbS5FdmVudFR5cGUuQ0xJQ0ssIFRvdWNoRXZlbnRUeXBlLlRhcF0pIHtcblx0XHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHJvdywgZXZlbnRUeXBlLCBlID0+IHtcblx0XHRcdFx0aWYgKCFjaGVja2JveC5lbmFibGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHRjaGVja2JveC5jaGVja2VkID0gIWNoZWNrYm94LmNoZWNrZWQ7XG5cdFx0XHRcdGlzb2xhdGlvbi5vblRvZ2dsZShjaGVja2JveC5jaGVja2VkKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVJc29sYXRpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUlzb2xhdGlvbigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX29wdGlvbnMuaXNvbGF0aW9uIHx8ICF0aGlzLl9pc29sYXRpb25DaGVja2JveCB8fCAhdGhpcy5faXNvbGF0aW9uU2xvdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5faXNvbGF0aW9uU3RhdGU7XG5cdFx0Y29uc3QgbW9kZSA9IHN0YXRlPy5zdGF0ZSA/PyAnZGlzYWJsZWQnO1xuXHRcdHRoaXMuX2lzb2xhdGlvbkNoZWNrYm94LmNoZWNrZWQgPSBzdGF0ZT8uY2hlY2tlZCA/PyBmYWxzZTtcblx0XHRpZiAobW9kZSA9PT0gJ2VuYWJsZWQnKSB7XG5cdFx0XHR0aGlzLl9pc29sYXRpb25DaGVja2JveC5lbmFibGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5faXNvbGF0aW9uQ2hlY2tib3guZGlzYWJsZSgpO1xuXHRcdFx0Ly8gS2VlcCBmb2N1c2FibGUgc28ga2V5Ym9hcmQgdXNlcnMgY2FuIGRpc2NvdmVyIHRoZSBkaXNhYmxlZCByZWFzb24gdmlhIHRvb2x0aXBcblx0XHRcdHRoaXMuX2lzb2xhdGlvbkNoZWNrYm94LmRvbU5vZGUudGFiSW5kZXggPSAwO1xuXHRcdH1cblx0XHR0aGlzLl9pc29sYXRpb25TbG90LmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgbW9kZSA9PT0gJ2Rpc2FibGVkJyk7XG5cdFx0dGhpcy5faXNvbGF0aW9uU2xvdC5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCBtb2RlID09PSAnaGlkZGVuJyk7XG5cblx0XHRjb25zdCByZWFzb24gPSBzdGF0ZT8uZGlzYWJsZWRSZWFzb247XG5cdFx0aWYgKHRoaXMuX2lzb2xhdGlvblJvdykge1xuXHRcdFx0aWYgKG1vZGUgPT09ICdkaXNhYmxlZCcgJiYgcmVhc29uKSB7XG5cdFx0XHRcdHRoaXMuX2lzb2xhdGlvblJvdy50aXRsZSA9IHJlYXNvbjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2lzb2xhdGlvblJvdy5yZW1vdmVBdHRyaWJ1dGUoJ3RpdGxlJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNPcGVuKSB7XG5cdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmhpZGUodHJ1ZSk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRjb25zdCByZW5kZXJUYXJnZXQgPSB0aGlzLl9vcHRpb25zLmlzb2xhdGlvblxuXHRcdFx0PyBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJ3NwYW4uc2Vzc2lvbnMtY2hhdC1icmFuY2gtcGlja2VyLWdyb3VwJykpXG5cdFx0XHQ6IGNvbnRhaW5lcjtcblx0XHRpZiAocmVuZGVyVGFyZ2V0ICE9PSBjb250YWluZXIpIHtcblx0XHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHJlbmRlclRhcmdldC5yZW1vdmUoKSB9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZW5kZXJJc29sYXRpb24ocmVuZGVyVGFyZ2V0KTtcblxuXHRcdGNvbnN0IHNsb3QgPSBkb20uYXBwZW5kKHJlbmRlclRhcmdldCwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LXBpY2tlci1zbG90JykpO1xuXHRcdGlmICh0aGlzLl9vcHRpb25zLnNsb3RDbGFzc05hbWUpIHtcblx0XHRcdHNsb3QuY2xhc3NMaXN0LmFkZCh0aGlzLl9vcHRpb25zLnNsb3RDbGFzc05hbWUpO1xuXHRcdH1cblx0XHR0aGlzLl9zbG90RWxlbWVudCA9IHNsb3Q7XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gc2xvdC5yZW1vdmUoKSB9KTtcblxuXHRcdGNvbnN0IHRyaWdnZXIgPSBkb20uYXBwZW5kKHNsb3QsIGRvbS4kKCdhLmFjdGlvbi1sYWJlbCcpKTtcblx0XHRpZiAodGhpcy5fb3B0aW9ucy50cmlnZ2VyQ2xhc3NOYW1lKSB7XG5cdFx0XHR0cmlnZ2VyLmNsYXNzTGlzdC5hZGQodGhpcy5fb3B0aW9ucy50cmlnZ2VyQ2xhc3NOYW1lKTtcblx0XHR9XG5cdFx0dHJpZ2dlci5yb2xlID0gJ2J1dHRvbic7XG5cdFx0dHJpZ2dlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGFzcG9wdXAnLCAnbGlzdGJveCcpO1xuXHRcdHRyaWdnZXIuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ2ZhbHNlJyk7XG5cdFx0aWYgKHRoaXMuX29wdGlvbnMuYXJpYUxpdmUpIHtcblx0XHRcdHRyaWdnZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxpdmUnLCB0aGlzLl9vcHRpb25zLmFyaWFMaXZlKTtcblx0XHR9XG5cdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnQgPSB0cmlnZ2VyO1xuXG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBkb20uYXBwZW5kKHNsb3QsIGRvbS4kKCdzcGFuLmJyYW5jaC1waWNrZXItZGVzY3JpcHRpb24nKSk7XG5cdFx0aWYgKHRoaXMuX29wdGlvbnMuZGVzY3JpcHRpb25DbGFzc05hbWUpIHtcblx0XHRcdGRlc2NyaXB0aW9uLmNsYXNzTGlzdC5hZGQodGhpcy5fb3B0aW9ucy5kZXNjcmlwdGlvbkNsYXNzTmFtZSk7XG5cdFx0fVxuXHRcdGRlc2NyaXB0aW9uLmlkID0gYGJyYW5jaC1waWNrZXItZGVzY3JpcHRpb24tJHsrK2Rlc2NyaXB0aW9uSWRQb29sfWA7XG5cdFx0dHJpZ2dlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGVzY3JpYmVkYnknLCBkZXNjcmlwdGlvbi5pZCk7XG5cdFx0dGhpcy5fZGVzY3JpcHRpb25FbGVtZW50ID0gZGVzY3JpcHRpb247XG5cblx0XHR0aGlzLl91cGRhdGVUcmlnZ2VyKCk7XG5cblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoR2VzdHVyZS5hZGRUYXJnZXQodHJpZ2dlcikpO1xuXHRcdGZvciAoY29uc3QgZXZlbnRUeXBlIG9mIFtkb20uRXZlbnRUeXBlLkNMSUNLLCBUb3VjaEV2ZW50VHlwZS5UYXBdKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0cmlnZ2VyLCBldmVudFR5cGUsIGUgPT4ge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5zaG93UGlja2VyKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRyaWdnZXIsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuc2hvd1BpY2tlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHVwZGF0ZShzdGF0ZTogSUJyYW5jaFBpY2tlclN0YXRlKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RhdGUgPSBzdGF0ZTtcblx0XHR0aGlzLl9pc29sYXRpb25TdGF0ZSA9IHN0YXRlLmlzb2xhdGlvbjtcblx0XHR0aGlzLl91cGRhdGVUcmlnZ2VyKCk7XG5cdFx0dGhpcy5fdXBkYXRlSXNvbGF0aW9uKCk7XG5cdFx0aWYgKHRoaXMuX2lzT3Blbikge1xuXHRcdFx0aWYgKCFzdGF0ZS5jYW5PcGVuKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2UuaGlkZSh0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2UudXBkYXRlSXRlbXModGhpcy5fZ2V0SXRlbXMoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0c2hvd1BpY2tlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3RyaWdnZXJFbGVtZW50IHx8IHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2UuaXNWaXNpYmxlIHx8ICF0aGlzLl9zdGF0ZS5jYW5PcGVuKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJpZ2dlciA9IHRoaXMuX3RyaWdnZXJFbGVtZW50O1xuXHRcdGNvbnN0IGRlbGVnYXRlOiBJQWN0aW9uTGlzdERlbGVnYXRlPElCcmFuY2hQaWNrZXJJdGVtPiA9IHtcblx0XHRcdG9uU2VsZWN0OiBpdGVtID0+IHtcblx0XHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKCk7XG5cdFx0XHRcdGlmIChpdGVtLmtpbmQgPT09ICdyZXRyeScpIHtcblx0XHRcdFx0XHR0aGlzLl9vcHRpb25zLm9uUmV0cnk/LigpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGl0ZW0ubmFtZSkge1xuXHRcdFx0XHRcdHRoaXMuX29wdGlvbnMub25TZWxlY3RCcmFuY2goaXRlbS5uYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG9uSGlkZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9pc09wZW4gPSBmYWxzZTtcblx0XHRcdFx0dHJpZ2dlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAnZmFsc2UnKTtcblx0XHRcdFx0aWYgKHRyaWdnZXIuaXNDb25uZWN0ZWQpIHtcblx0XHRcdFx0XHR0cmlnZ2VyLmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdHRoaXMuX2lzT3BlbiA9IHRydWU7XG5cdFx0dHJpZ2dlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAndHJ1ZScpO1xuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5fZ2V0SXRlbXMoKTtcblx0XHRjb25zdCBicmFuY2hDb3VudCA9IGl0ZW1zLmZpbHRlcihpdGVtID0+IGl0ZW0uaXRlbT8ua2luZCA9PT0gJ2JyYW5jaCcgJiYgIWl0ZW0uaXRlbS51bmF2YWlsYWJsZSkubGVuZ3RoO1xuXHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2Uuc2hvdyhcblx0XHRcdHRoaXMuX29wdGlvbnMudXNlcixcblx0XHRcdGZhbHNlLFxuXHRcdFx0aXRlbXMsXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdHRyaWdnZXIsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRbXSxcblx0XHRcdHtcblx0XHRcdFx0Z2V0QXJpYUxhYmVsOiBpdGVtID0+IHtcblx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IGl0ZW0ubGFiZWwgPz8gJyc7XG5cdFx0XHRcdFx0cmV0dXJuIGl0ZW0uaXRlbT8udW5hdmFpbGFibGVcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2JyYW5jaFBpY2tlci51bmF2YWlsYWJsZUFyaWFMYWJlbCcsIFwiezB9LCB1bmF2YWlsYWJsZSBsb2NhbGx5XCIsIGxhYmVsKVxuXHRcdFx0XHRcdFx0OiBsYWJlbDtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsOiAoKSA9PiBsb2NhbGl6ZSgnYnJhbmNoUGlja2VyLmFyaWFMYWJlbCcsIFwiQnJhbmNoIFBpY2tlclwiKSxcblx0XHRcdH0sXG5cdFx0XHRicmFuY2hDb3VudCA+IEZJTFRFUl9USFJFU0hPTERcblx0XHRcdFx0PyB7IHNob3dGaWx0ZXI6IHRydWUsIGZpbHRlclBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnYnJhbmNoUGlja2VyLmZpbHRlcicsIFwiRmlsdGVyIGJyYW5jaGVzXHUyMDI2XCIpIH1cblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEl0ZW1zKCk6IHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxJQnJhbmNoUGlja2VySXRlbT5bXSB7XG5cdFx0c3dpdGNoICh0aGlzLl9zdGF0ZS5zdGF0dXMpIHtcblx0XHRcdGNhc2UgJ2xvYWRpbmcnOlxuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYnJhbmNoUGlja2VyLmxvYWRpbmcnLCBcIkxvYWRpbmcgYnJhbmNoZXNcdTIwMjZcIiksXG5cdFx0XHRcdFx0ZGlzYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0aXRlbTogeyBraW5kOiAnYnJhbmNoJyB9LFxuXHRcdFx0XHR9XTtcblx0XHRcdGNhc2UgJ2Vycm9yJzpcblx0XHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2JyYW5jaFBpY2tlci5yZXRyeScsIFwiUmV0cnkgTG9hZGluZyBCcmFuY2hlc1wiKSxcblx0XHRcdFx0XHRncm91cDogeyB0aXRsZTogJycsIGljb246IENvZGljb24ucmVmcmVzaCB9LFxuXHRcdFx0XHRcdGRpc2FibGVkOiAhdGhpcy5fb3B0aW9ucy5vblJldHJ5LFxuXHRcdFx0XHRcdGl0ZW06IHsga2luZDogJ3JldHJ5JyB9LFxuXHRcdFx0XHR9XTtcblx0XHRcdGNhc2UgJ2VtcHR5Jzpcblx0XHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2JyYW5jaFBpY2tlci5lbXB0eScsIFwiTm8gbG9jYWwgYnJhbmNoZXNcIiksXG5cdFx0XHRcdFx0ZGlzYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0aXRlbTogeyBraW5kOiAnYnJhbmNoJyB9LFxuXHRcdFx0XHR9XTtcblx0XHRcdGNhc2UgJ3JlYWR5Jzpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3N0YXRlLmJyYW5jaGVzLm1hcChicmFuY2ggPT4gKHtcblx0XHRcdFx0XHRraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLFxuXHRcdFx0XHRcdGxhYmVsOiBicmFuY2gubmFtZSxcblx0XHRcdFx0XHRkZXRhaWw6IGJyYW5jaC51bmF2YWlsYWJsZSA/IGxvY2FsaXplKCdicmFuY2hQaWNrZXIudW5hdmFpbGFibGUnLCBcIlVuYXZhaWxhYmxlIGxvY2FsbHlcIikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Z3JvdXA6IHsgdGl0bGU6ICcnLCBpY29uOiBicmFuY2gudW5hdmFpbGFibGUgPyBDb2RpY29uLndhcm5pbmcgOiBDb2RpY29uLmdpdEJyYW5jaCB9LFxuXHRcdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdicmFuY2gnLFxuXHRcdFx0XHRcdFx0bmFtZTogYnJhbmNoLm5hbWUsXG5cdFx0XHRcdFx0XHRjaGVja2VkOiBicmFuY2guc2VsZWN0ZWQgfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0dW5hdmFpbGFibGU6IGJyYW5jaC51bmF2YWlsYWJsZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlVHJpZ2dlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3RyaWdnZXJFbGVtZW50IHx8ICF0aGlzLl9zbG90RWxlbWVudCB8fCAhdGhpcy5fZGVzY3JpcHRpb25FbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fdHJpZ2dlckVsZW1lbnQpO1xuXG5cdFx0Y29uc3QgaWNvbiA9IGRvbS5hcHBlbmQodGhpcy5fdHJpZ2dlckVsZW1lbnQsIHJlbmRlckljb24oQ29kaWNvbi5naXRCcmFuY2gpKTtcblx0XHRpY29uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZCh0aGlzLl90cmlnZ2VyRWxlbWVudCwgZG9tLiQoJ3NwYW4uc2Vzc2lvbnMtY2hhdC1kcm9wZG93bi1sYWJlbCcpKTtcblx0XHRpZiAodGhpcy5fb3B0aW9ucy5sYWJlbENsYXNzTmFtZSkge1xuXHRcdFx0bGFiZWwuY2xhc3NMaXN0LmFkZCh0aGlzLl9vcHRpb25zLmxhYmVsQ2xhc3NOYW1lKTtcblx0XHR9XG5cdFx0bGFiZWwudGV4dENvbnRlbnQgPSB0aGlzLl9zdGF0ZS5sYWJlbDtcblx0XHRpZiAodGhpcy5fc3RhdGUuc2hvd0NoZXZyb24gIT09IGZhbHNlKSB7XG5cdFx0XHRjb25zdCBjaGV2cm9uID0gZG9tLmFwcGVuZCh0aGlzLl90cmlnZ2VyRWxlbWVudCwgcmVuZGVySWNvbihDb2RpY29uLmNoZXZyb25Eb3duKSk7XG5cdFx0XHRjaGV2cm9uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc2FibGVkID0gIXRoaXMuX3N0YXRlLmNhbk9wZW47XG5cdFx0Y29uc3QgcmVuZGVyQXNTdGF0aWMgPSBkaXNhYmxlZCAmJiB0aGlzLl9vcHRpb25zLnJlbmRlckRpc2FibGVkQXNTdGF0aWMgPT09IHRydWU7XG5cdFx0Y29uc3QgcmVhc29uID0gdGhpcy5fc3RhdGUuZGlzYWJsZWRSZWFzb247XG5cdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgZGlzYWJsZWQgJiYgcmVhc29uXG5cdFx0XHQ/IGxvY2FsaXplKCdicmFuY2hQaWNrZXIuZGlzYWJsZWRBcmlhTGFiZWwnLCBcInswfS4gezF9XCIsIHRoaXMuX3N0YXRlLmxhYmVsLCByZWFzb24pXG5cdFx0XHQ6IGxvY2FsaXplKCdicmFuY2hQaWNrZXIudHJpZ2dlckFyaWFMYWJlbCcsIFwiUGljayBCcmFuY2gsIHswfVwiLCB0aGlzLl9zdGF0ZS5sYWJlbCkpO1xuXHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcsIFN0cmluZyhkaXNhYmxlZCkpO1xuXHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1idXN5JywgU3RyaW5nKHRoaXMuX3N0YXRlLnN0YXR1cyA9PT0gJ2xvYWRpbmcnKSk7XG5cdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnQudGFiSW5kZXggPSAhZGlzYWJsZWQgfHwgdGhpcy5fb3B0aW9ucy5rZWVwRGlzYWJsZWRGb2N1c2FibGUgJiYgIXJlbmRlckFzU3RhdGljID8gMCA6IC0xO1xuXHRcdGlmIChyZW5kZXJBc1N0YXRpYykge1xuXHRcdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCdyb2xlJyk7XG5cdFx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtaGFzcG9wdXAnKTtcblx0XHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGFzcG9wdXAnLCAnbGlzdGJveCcpO1xuXHRcdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgU3RyaW5nKHRoaXMuX2lzT3BlbikpO1xuXHRcdH1cblx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudC50aXRsZSA9IGRpc2FibGVkICYmIHJlYXNvbiA/IHJlYXNvbiA6IHRoaXMuX3N0YXRlLmxhYmVsO1xuXHRcdHRoaXMuX2Rlc2NyaXB0aW9uRWxlbWVudC50ZXh0Q29udGVudCA9IHJlYXNvbiA/PyAnJztcblx0XHR0aGlzLl9zbG90RWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsIGRpc2FibGVkKTtcblx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdicmFuY2gtcGlja2VyLWRpc2FibGVkJywgZGlzYWJsZWQpO1xuXHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2JyYW5jaC1waWNrZXItbWlzc2luZycsIHRoaXMuX3N0YXRlLm1pc3NpbmcgPT09IHRydWUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsYUFBYSxzQkFBc0I7QUFDckQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxpQkFBOEIsb0JBQW9CO0FBQ3ZFLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMEJBQWdFO0FBQ3pFLFNBQVMsNkJBQTZCO0FBQ3RDLE9BQU87QUFFUCxNQUFNLG1CQUFtQjtBQUN6QixJQUFJLG9CQUFvQjtBQStEakIsSUFBTSxlQUFOLGNBQTJCLFdBQVc7QUFBQSxFQWlCNUMsWUFDa0IsVUFDc0Isc0JBQ3RDO0FBQ0QsVUFBTTtBQUhXO0FBQ3NCO0FBbEJ4QyxTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFDMUUsU0FBUSxTQUE2QjtBQUFBLE1BQ3BDLE9BQU8sU0FBUyx1QkFBdUIsUUFBUTtBQUFBLE1BQy9DLFVBQVUsQ0FBQztBQUFBLE1BQ1gsUUFBUTtBQUFBLE1BQ1IsU0FBUztBQUFBLElBQ1Y7QUFJQSxTQUFRLFVBQVU7QUFXakIsU0FBSyxVQUFVLGFBQWEsTUFBTTtBQUNqQyxVQUFJLEtBQUssU0FBUztBQUNqQixhQUFLLHFCQUFxQixLQUFLLElBQUk7QUFBQSxNQUNwQztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsaUJBQWlCLFdBQThCO0FBQ3RELFVBQU0sWUFBWSxLQUFLLFNBQVM7QUFDaEMsUUFBSSxDQUFDLFdBQVc7QUFDZjtBQUFBLElBQ0Q7QUFFQSxVQUFNLE9BQU8sSUFBSSxPQUFPLFdBQVcsSUFBSSxFQUFFLDZEQUE2RCxDQUFDO0FBQ3ZHLFFBQUksVUFBVSxlQUFlO0FBQzVCLFdBQUssVUFBVSxJQUFJLFVBQVUsYUFBYTtBQUFBLElBQzNDO0FBQ0EsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyxtQkFBbUIsSUFBSSxhQUFhLE1BQU0sS0FBSyxPQUFPLENBQUMsQ0FBQztBQUM3RCxRQUFJLFVBQVUsWUFBWTtBQUN6QixXQUFLLG1CQUFtQixJQUFJLFVBQVUsV0FBVyxJQUFJLENBQUM7QUFBQSxJQUN2RDtBQUVBLFVBQU0sTUFBTSxJQUFJLE9BQU8sTUFBTSxJQUFJLEVBQUUsZUFBZSxDQUFDO0FBQ25ELFFBQUksYUFBYSxjQUFjLFVBQVUsU0FBUztBQUNsRCxTQUFLLGdCQUFnQjtBQUVyQixVQUFNLFdBQVcsS0FBSyxtQkFBbUIsSUFBSSxJQUFJLFNBQVMsVUFBVSxPQUFPLEtBQUssaUJBQWlCLFdBQVcsT0FBTyxFQUFFLEdBQUcsdUJBQXVCLE1BQU0sR0FBRyxDQUFDLENBQUM7QUFDMUosU0FBSyxxQkFBcUI7QUFDMUIsUUFBSSxPQUFPLEtBQUssU0FBUyxPQUFPO0FBQ2hDLFVBQU0sWUFBWSxJQUFJLE9BQU8sS0FBSyxJQUFJLEVBQUUsbUNBQW1DLENBQUM7QUFDNUUsY0FBVSxjQUFjLFVBQVU7QUFFbEMsU0FBSyxtQkFBbUIsSUFBSSxTQUFTLFNBQVMsTUFBTSxVQUFVLFNBQVMsU0FBUyxPQUFPLENBQUMsQ0FBQztBQUN6RixTQUFLLG1CQUFtQixJQUFJLFFBQVEsVUFBVSxHQUFHLENBQUM7QUFDbEQsZUFBVyxhQUFhLENBQUMsSUFBSSxVQUFVLE9BQU8sZUFBZSxHQUFHLEdBQUc7QUFDbEUsV0FBSyxtQkFBbUIsSUFBSSxJQUFJLHNCQUFzQixLQUFLLFdBQVcsT0FBSztBQUMxRSxZQUFJLENBQUMsU0FBUyxTQUFTO0FBQ3RCO0FBQUEsUUFDRDtBQUNBLFlBQUksWUFBWSxLQUFLLEdBQUcsSUFBSTtBQUM1QixpQkFBUyxVQUFVLENBQUMsU0FBUztBQUM3QixrQkFBVSxTQUFTLFNBQVMsT0FBTztBQUFBLE1BQ3BDLENBQUMsQ0FBQztBQUFBLElBQ0g7QUFFQSxTQUFLLGlCQUFpQjtBQUFBLEVBQ3ZCO0FBQUEsRUFFUSxtQkFBeUI7QUFDaEMsUUFBSSxDQUFDLEtBQUssU0FBUyxhQUFhLENBQUMsS0FBSyxzQkFBc0IsQ0FBQyxLQUFLLGdCQUFnQjtBQUNqRjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFFBQVEsS0FBSztBQUNuQixVQUFNLE9BQU8sT0FBTyxTQUFTO0FBQzdCLFNBQUssbUJBQW1CLFVBQVUsT0FBTyxXQUFXO0FBQ3BELFFBQUksU0FBUyxXQUFXO0FBQ3ZCLFdBQUssbUJBQW1CLE9BQU87QUFBQSxJQUNoQyxPQUFPO0FBQ04sV0FBSyxtQkFBbUIsUUFBUTtBQUVoQyxXQUFLLG1CQUFtQixRQUFRLFdBQVc7QUFBQSxJQUM1QztBQUNBLFNBQUssZUFBZSxVQUFVLE9BQU8sWUFBWSxTQUFTLFVBQVU7QUFDcEUsU0FBSyxlQUFlLFVBQVUsT0FBTyxVQUFVLFNBQVMsUUFBUTtBQUVoRSxVQUFNLFNBQVMsT0FBTztBQUN0QixRQUFJLEtBQUssZUFBZTtBQUN2QixVQUFJLFNBQVMsY0FBYyxRQUFRO0FBQ2xDLGFBQUssY0FBYyxRQUFRO0FBQUEsTUFDNUIsT0FBTztBQUNOLGFBQUssY0FBYyxnQkFBZ0IsT0FBTztBQUFBLE1BQzNDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE9BQU8sV0FBOEI7QUFDcEMsUUFBSSxLQUFLLFNBQVM7QUFDakIsV0FBSyxxQkFBcUIsS0FBSyxJQUFJO0FBQUEsSUFDcEM7QUFDQSxTQUFLLG1CQUFtQixNQUFNO0FBRTlCLFVBQU0sZUFBZSxLQUFLLFNBQVMsWUFDaEMsSUFBSSxPQUFPLFdBQVcsSUFBSSxFQUFFLHdDQUF3QyxDQUFDLElBQ3JFO0FBQ0gsUUFBSSxpQkFBaUIsV0FBVztBQUMvQixXQUFLLG1CQUFtQixJQUFJLEVBQUUsU0FBUyxNQUFNLGFBQWEsT0FBTyxFQUFFLENBQUM7QUFBQSxJQUNyRTtBQUVBLFNBQUssaUJBQWlCLFlBQVk7QUFFbEMsVUFBTSxPQUFPLElBQUksT0FBTyxjQUFjLElBQUksRUFBRSw0QkFBNEIsQ0FBQztBQUN6RSxRQUFJLEtBQUssU0FBUyxlQUFlO0FBQ2hDLFdBQUssVUFBVSxJQUFJLEtBQUssU0FBUyxhQUFhO0FBQUEsSUFDL0M7QUFDQSxTQUFLLGVBQWU7QUFDcEIsU0FBSyxtQkFBbUIsSUFBSSxFQUFFLFNBQVMsTUFBTSxLQUFLLE9BQU8sRUFBRSxDQUFDO0FBRTVELFVBQU0sVUFBVSxJQUFJLE9BQU8sTUFBTSxJQUFJLEVBQUUsZ0JBQWdCLENBQUM7QUFDeEQsUUFBSSxLQUFLLFNBQVMsa0JBQWtCO0FBQ25DLGNBQVEsVUFBVSxJQUFJLEtBQUssU0FBUyxnQkFBZ0I7QUFBQSxJQUNyRDtBQUNBLFlBQVEsT0FBTztBQUNmLFlBQVEsYUFBYSxpQkFBaUIsU0FBUztBQUMvQyxZQUFRLGFBQWEsaUJBQWlCLE9BQU87QUFDN0MsUUFBSSxLQUFLLFNBQVMsVUFBVTtBQUMzQixjQUFRLGFBQWEsYUFBYSxLQUFLLFNBQVMsUUFBUTtBQUFBLElBQ3pEO0FBQ0EsU0FBSyxrQkFBa0I7QUFFdkIsVUFBTSxjQUFjLElBQUksT0FBTyxNQUFNLElBQUksRUFBRSxnQ0FBZ0MsQ0FBQztBQUM1RSxRQUFJLEtBQUssU0FBUyxzQkFBc0I7QUFDdkMsa0JBQVksVUFBVSxJQUFJLEtBQUssU0FBUyxvQkFBb0I7QUFBQSxJQUM3RDtBQUNBLGdCQUFZLEtBQUssNkJBQTZCLEVBQUUsaUJBQWlCO0FBQ2pFLFlBQVEsYUFBYSxvQkFBb0IsWUFBWSxFQUFFO0FBQ3ZELFNBQUssc0JBQXNCO0FBRTNCLFNBQUssZUFBZTtBQUVwQixTQUFLLG1CQUFtQixJQUFJLFFBQVEsVUFBVSxPQUFPLENBQUM7QUFDdEQsZUFBVyxhQUFhLENBQUMsSUFBSSxVQUFVLE9BQU8sZUFBZSxHQUFHLEdBQUc7QUFDbEUsV0FBSyxtQkFBbUIsSUFBSSxJQUFJLHNCQUFzQixTQUFTLFdBQVcsT0FBSztBQUM5RSxZQUFJLFlBQVksS0FBSyxHQUFHLElBQUk7QUFDNUIsYUFBSyxXQUFXO0FBQUEsTUFDakIsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUNBLFNBQUssbUJBQW1CLElBQUksSUFBSSxzQkFBc0IsU0FBUyxJQUFJLFVBQVUsVUFBVSxPQUFLO0FBQzNGLFVBQUksRUFBRSxRQUFRLFdBQVcsRUFBRSxRQUFRLEtBQUs7QUFDdkMsWUFBSSxZQUFZLEtBQUssR0FBRyxJQUFJO0FBQzVCLGFBQUssV0FBVztBQUFBLE1BQ2pCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxPQUFPLE9BQWlDO0FBQ3ZDLFNBQUssU0FBUztBQUNkLFNBQUssa0JBQWtCLE1BQU07QUFDN0IsU0FBSyxlQUFlO0FBQ3BCLFNBQUssaUJBQWlCO0FBQ3RCLFFBQUksS0FBSyxTQUFTO0FBQ2pCLFVBQUksQ0FBQyxNQUFNLFNBQVM7QUFDbkIsYUFBSyxxQkFBcUIsS0FBSyxJQUFJO0FBQUEsTUFDcEMsT0FBTztBQUNOLGFBQUsscUJBQXFCLFlBQVksS0FBSyxVQUFVLENBQUM7QUFBQSxNQUN2RDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxhQUFtQjtBQUNsQixRQUFJLENBQUMsS0FBSyxtQkFBbUIsS0FBSyxxQkFBcUIsYUFBYSxDQUFDLEtBQUssT0FBTyxTQUFTO0FBQ3pGO0FBQUEsSUFDRDtBQUVBLFVBQU0sVUFBVSxLQUFLO0FBQ3JCLFVBQU0sV0FBbUQ7QUFBQSxNQUN4RCxVQUFVLFVBQVE7QUFDakIsYUFBSyxxQkFBcUIsS0FBSztBQUMvQixZQUFJLEtBQUssU0FBUyxTQUFTO0FBQzFCLGVBQUssU0FBUyxVQUFVO0FBQUEsUUFDekIsV0FBVyxLQUFLLE1BQU07QUFDckIsZUFBSyxTQUFTLGVBQWUsS0FBSyxJQUFJO0FBQUEsUUFDdkM7QUFBQSxNQUNEO0FBQUEsTUFDQSxRQUFRLE1BQU07QUFDYixhQUFLLFVBQVU7QUFDZixnQkFBUSxhQUFhLGlCQUFpQixPQUFPO0FBQzdDLFlBQUksUUFBUSxhQUFhO0FBQ3hCLGtCQUFRLE1BQU07QUFBQSxRQUNmO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxTQUFLLFVBQVU7QUFDZixZQUFRLGFBQWEsaUJBQWlCLE1BQU07QUFDNUMsVUFBTSxRQUFRLEtBQUssVUFBVTtBQUM3QixVQUFNLGNBQWMsTUFBTSxPQUFPLFVBQVEsS0FBSyxNQUFNLFNBQVMsWUFBWSxDQUFDLEtBQUssS0FBSyxXQUFXLEVBQUU7QUFDakcsU0FBSyxxQkFBcUI7QUFBQSxNQUN6QixLQUFLLFNBQVM7QUFBQSxNQUNkO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsQ0FBQztBQUFBLE1BQ0Q7QUFBQSxRQUNDLGNBQWMsVUFBUTtBQUNyQixnQkFBTSxRQUFRLEtBQUssU0FBUztBQUM1QixpQkFBTyxLQUFLLE1BQU0sY0FDZixTQUFTLHFDQUFxQyw0QkFBNEIsS0FBSyxJQUMvRTtBQUFBLFFBQ0o7QUFBQSxRQUNBLG9CQUFvQixNQUFNLFNBQVMsMEJBQTBCLGVBQWU7QUFBQSxNQUM3RTtBQUFBLE1BQ0EsY0FBYyxtQkFDWCxFQUFFLFlBQVksTUFBTSxtQkFBbUIsU0FBUyx1QkFBdUIsdUJBQWtCLEVBQUUsSUFDM0Y7QUFBQSxJQUNKO0FBQUEsRUFDRDtBQUFBLEVBRVEsWUFBMkQ7QUFDbEUsWUFBUSxLQUFLLE9BQU8sUUFBUTtBQUFBLE1BQzNCLEtBQUs7QUFDSixlQUFPLENBQUM7QUFBQSxVQUNQLE1BQU0sbUJBQW1CO0FBQUEsVUFDekIsT0FBTyxTQUFTLHdCQUF3Qix3QkFBbUI7QUFBQSxVQUMzRCxVQUFVO0FBQUEsVUFDVixNQUFNLEVBQUUsTUFBTSxTQUFTO0FBQUEsUUFDeEIsQ0FBQztBQUFBLE1BQ0YsS0FBSztBQUNKLGVBQU8sQ0FBQztBQUFBLFVBQ1AsTUFBTSxtQkFBbUI7QUFBQSxVQUN6QixPQUFPLFNBQVMsc0JBQXNCLHdCQUF3QjtBQUFBLFVBQzlELE9BQU8sRUFBRSxPQUFPLElBQUksTUFBTSxRQUFRLFFBQVE7QUFBQSxVQUMxQyxVQUFVLENBQUMsS0FBSyxTQUFTO0FBQUEsVUFDekIsTUFBTSxFQUFFLE1BQU0sUUFBUTtBQUFBLFFBQ3ZCLENBQUM7QUFBQSxNQUNGLEtBQUs7QUFDSixlQUFPLENBQUM7QUFBQSxVQUNQLE1BQU0sbUJBQW1CO0FBQUEsVUFDekIsT0FBTyxTQUFTLHNCQUFzQixtQkFBbUI7QUFBQSxVQUN6RCxVQUFVO0FBQUEsVUFDVixNQUFNLEVBQUUsTUFBTSxTQUFTO0FBQUEsUUFDeEIsQ0FBQztBQUFBLE1BQ0YsS0FBSztBQUNKLGVBQU8sS0FBSyxPQUFPLFNBQVMsSUFBSSxhQUFXO0FBQUEsVUFDMUMsTUFBTSxtQkFBbUI7QUFBQSxVQUN6QixPQUFPLE9BQU87QUFBQSxVQUNkLFFBQVEsT0FBTyxjQUFjLFNBQVMsNEJBQTRCLHFCQUFxQixJQUFJO0FBQUEsVUFDM0YsT0FBTyxFQUFFLE9BQU8sSUFBSSxNQUFNLE9BQU8sY0FBYyxRQUFRLFVBQVUsUUFBUSxVQUFVO0FBQUEsVUFDbkYsTUFBTTtBQUFBLFlBQ0wsTUFBTTtBQUFBLFlBQ04sTUFBTSxPQUFPO0FBQUEsWUFDYixTQUFTLE9BQU8sWUFBWTtBQUFBLFlBQzVCLGFBQWEsT0FBTztBQUFBLFVBQ3JCO0FBQUEsUUFDRCxFQUFFO0FBQUEsSUFDSjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGlCQUF1QjtBQUM5QixRQUFJLENBQUMsS0FBSyxtQkFBbUIsQ0FBQyxLQUFLLGdCQUFnQixDQUFDLEtBQUsscUJBQXFCO0FBQzdFO0FBQUEsSUFDRDtBQUNBLFFBQUksVUFBVSxLQUFLLGVBQWU7QUFFbEMsVUFBTSxPQUFPLElBQUksT0FBTyxLQUFLLGlCQUFpQixXQUFXLFFBQVEsU0FBUyxDQUFDO0FBQzNFLFNBQUssYUFBYSxlQUFlLE1BQU07QUFDdkMsVUFBTSxRQUFRLElBQUksT0FBTyxLQUFLLGlCQUFpQixJQUFJLEVBQUUsbUNBQW1DLENBQUM7QUFDekYsUUFBSSxLQUFLLFNBQVMsZ0JBQWdCO0FBQ2pDLFlBQU0sVUFBVSxJQUFJLEtBQUssU0FBUyxjQUFjO0FBQUEsSUFDakQ7QUFDQSxVQUFNLGNBQWMsS0FBSyxPQUFPO0FBQ2hDLFFBQUksS0FBSyxPQUFPLGdCQUFnQixPQUFPO0FBQ3RDLFlBQU0sVUFBVSxJQUFJLE9BQU8sS0FBSyxpQkFBaUIsV0FBVyxRQUFRLFdBQVcsQ0FBQztBQUNoRixjQUFRLGFBQWEsZUFBZSxNQUFNO0FBQUEsSUFDM0M7QUFFQSxVQUFNLFdBQVcsQ0FBQyxLQUFLLE9BQU87QUFDOUIsVUFBTSxpQkFBaUIsWUFBWSxLQUFLLFNBQVMsMkJBQTJCO0FBQzVFLFVBQU0sU0FBUyxLQUFLLE9BQU87QUFDM0IsU0FBSyxnQkFBZ0IsYUFBYSxjQUFjLFlBQVksU0FDekQsU0FBUyxrQ0FBa0MsWUFBWSxLQUFLLE9BQU8sT0FBTyxNQUFNLElBQ2hGLFNBQVMsaUNBQWlDLG9CQUFvQixLQUFLLE9BQU8sS0FBSyxDQUFDO0FBQ25GLFNBQUssZ0JBQWdCLGFBQWEsaUJBQWlCLE9BQU8sUUFBUSxDQUFDO0FBQ25FLFNBQUssZ0JBQWdCLGFBQWEsYUFBYSxPQUFPLEtBQUssT0FBTyxXQUFXLFNBQVMsQ0FBQztBQUN2RixTQUFLLGdCQUFnQixXQUFXLENBQUMsWUFBWSxLQUFLLFNBQVMseUJBQXlCLENBQUMsaUJBQWlCLElBQUk7QUFDMUcsUUFBSSxnQkFBZ0I7QUFDbkIsV0FBSyxnQkFBZ0IsZ0JBQWdCLE1BQU07QUFDM0MsV0FBSyxnQkFBZ0IsZ0JBQWdCLGVBQWU7QUFDcEQsV0FBSyxnQkFBZ0IsZ0JBQWdCLGVBQWU7QUFBQSxJQUNyRCxPQUFPO0FBQ04sV0FBSyxnQkFBZ0IsYUFBYSxRQUFRLFFBQVE7QUFDbEQsV0FBSyxnQkFBZ0IsYUFBYSxpQkFBaUIsU0FBUztBQUM1RCxXQUFLLGdCQUFnQixhQUFhLGlCQUFpQixPQUFPLEtBQUssT0FBTyxDQUFDO0FBQUEsSUFDeEU7QUFDQSxTQUFLLGdCQUFnQixRQUFRLFlBQVksU0FBUyxTQUFTLEtBQUssT0FBTztBQUN2RSxTQUFLLG9CQUFvQixjQUFjLFVBQVU7QUFDakQsU0FBSyxhQUFhLFVBQVUsT0FBTyxZQUFZLFFBQVE7QUFDdkQsU0FBSyxnQkFBZ0IsVUFBVSxPQUFPLDBCQUEwQixRQUFRO0FBQ3hFLFNBQUssZ0JBQWdCLFVBQVUsT0FBTyx5QkFBeUIsS0FBSyxPQUFPLFlBQVksSUFBSTtBQUFBLEVBQzVGO0FBQ0Q7QUFqVGEsZUFBTjtBQUFBLEVBbUJKO0FBQUEsR0FuQlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
