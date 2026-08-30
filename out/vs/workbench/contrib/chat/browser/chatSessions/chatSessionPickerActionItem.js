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
import "./media/chatSessionPickerActionItem.css";
import * as dom from "../../../../../base/browser/dom.js";
import { getActiveWindow } from "../../../../../base/browser/dom.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { ActionWidgetDropdownActionViewItem } from "../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { localize } from "../../../../../nls.js";
import { withChatInputPickerMotion } from "../widget/input/chatInputPickerActionItem.js";
import { autorun } from "../../../../../base/common/observable.js";
import { IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { getModelHoverContent } from "../widget/input/modelPicker/modelPickerHover.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
let ChatSessionPickerActionItem = class extends ActionWidgetDropdownActionViewItem {
  constructor(action, initialState, delegate, _pickerOptions, actionWidgetService, contextKeyService, keybindingService, commandService, telemetryService, chatEntitlementService, openerService) {
    const { group, item } = initialState;
    const actionWithLabel = {
      ...action,
      label: item?.name || group.name,
      tooltip: item?.description ?? group.description ?? group.name,
      run: () => {
      }
    };
    const sessionPickerActionWidgetOptions = {
      actionProvider: {
        getActions: () => this.getDropdownActions()
      },
      actionBarActionProvider: void 0,
      reporter: { id: group.id, name: `ChatSession:${group.name}`, includeOptions: false },
      getAnchor: () => this._getAnchorElement(),
      listOptions: withChatInputPickerMotion(void 0)
    };
    super(actionWithLabel, sessionPickerActionWidgetOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);
    this.delegate = delegate;
    this._pickerOptions = _pickerOptions;
    this.commandService = commandService;
    this.chatEntitlementService = chatEntitlementService;
    this.openerService = openerService;
    this.currentOption = item;
    this._register(this.delegate.onDidChangeOption((newOption) => {
      this.currentOption = newOption;
      if (this.element) {
        this.renderLabel(this.element);
      }
      this.updateEnabled();
    }));
    const pickerOptions = this._pickerOptions;
    if (pickerOptions) {
      this._register(autorun((reader) => {
        pickerOptions.compact.read(reader);
        if (this.element) {
          this.renderLabel(this.element);
        }
      }));
    }
  }
  /**
   * Returns the actions to show in the dropdown. Can be overridden by subclasses.
   */
  getDropdownActions() {
    const currentOption = this.delegate.getCurrentOption();
    if (currentOption?.locked) {
      return [this.createLockedOptionAction(currentOption)];
    }
    const group = this.delegate.getOptionGroup();
    if (!group) {
      return [];
    }
    const actions = group.items.map((optionItem) => {
      const isCurrent = optionItem.id === currentOption?.id;
      return {
        id: optionItem.id,
        enabled: !optionItem.locked,
        icon: optionItem.icon,
        checked: isCurrent,
        class: void 0,
        description: optionItem.description,
        tooltip: optionItem.description ?? optionItem.name,
        label: optionItem.name,
        hover: this._buildOptionHover(optionItem),
        run: () => {
          this.delegate.setOption(optionItem);
        }
      };
    });
    if (group.commands?.length) {
      const addSeparator = actions.length > 0;
      for (const command of group.commands) {
        const args = command.arguments ? [...command.arguments] : [];
        const sessionResource = this.delegate.getSessionResource();
        if (sessionResource) {
          args.unshift(sessionResource);
        }
        actions.push({
          id: command.command,
          enabled: true,
          checked: false,
          class: void 0,
          description: void 0,
          tooltip: command.tooltip ?? command.title,
          label: command.title,
          // Use category to create a separator before commands (only if there are options)
          category: addSeparator ? { label: "", order: Number.MAX_SAFE_INTEGER } : void 0,
          run: () => {
            this.commandService.executeCommand(command.command, ...args);
          }
        });
      }
    }
    return actions;
  }
  _buildOptionHover(optionItem) {
    if (optionItem.modelMetadata) {
      const isUBB = !!this.chatEntitlementService.quotas.usageBasedBilling;
      const syntheticModel = {
        identifier: optionItem.id,
        metadata: {
          extension: new ExtensionIdentifier(""),
          name: optionItem.modelMetadata.name,
          id: optionItem.modelMetadata.id,
          vendor: optionItem.modelMetadata.vendor ?? "",
          version: optionItem.modelMetadata.version ?? "",
          family: optionItem.modelMetadata.family ?? "",
          tooltip: optionItem.modelMetadata.tooltip,
          pricing: optionItem.modelMetadata.pricing,
          multiplierNumeric: optionItem.modelMetadata.multiplierNumeric,
          inputCost: optionItem.modelMetadata.inputCost,
          outputCost: optionItem.modelMetadata.outputCost,
          cacheCost: optionItem.modelMetadata.cacheCost,
          cacheWriteCost: optionItem.modelMetadata.cacheWriteCost,
          longContextInputCost: optionItem.modelMetadata.longContextInputCost,
          longContextOutputCost: optionItem.modelMetadata.longContextOutputCost,
          longContextCacheCost: optionItem.modelMetadata.longContextCacheCost,
          longContextCacheWriteCost: optionItem.modelMetadata.longContextCacheWriteCost,
          priceCategory: optionItem.modelMetadata.priceCategory,
          promo: optionItem.modelMetadata.promo,
          maxInputTokens: optionItem.modelMetadata.maxInputTokens ?? 0,
          maxOutputTokens: optionItem.modelMetadata.maxOutputTokens ?? 0,
          capabilities: optionItem.modelMetadata.capabilities ? {
            vision: optionItem.modelMetadata.capabilities.vision,
            toolCalling: optionItem.modelMetadata.capabilities.toolCalling
          } : void 0,
          isDefaultForLocation: {}
        }
      };
      const hover = getModelHoverContent(syntheticModel, isUBB, void 0, this.openerService);
      if (hover) {
        return { content: hover.element, disposable: hover.disposable };
      }
    }
    if (optionItem.tooltip) {
      return { content: optionItem.tooltip };
    }
    return void 0;
  }
  /**
   * Creates a disabled action for a locked option.
   */
  createLockedOptionAction(option) {
    return {
      id: option.id,
      enabled: false,
      icon: option.icon,
      checked: true,
      class: void 0,
      description: option.description,
      tooltip: option.description ?? option.name,
      label: option.name,
      run: () => {
      }
    };
  }
  /**
   * Returns the anchor element for the dropdown.
   * Falls back to the overflow anchor if this element is not in the DOM.
   */
  _getAnchorElement() {
    if (this.element && getActiveWindow().document.contains(this.element)) {
      return this.element;
    }
    return this._pickerOptions?.getOverflowAnchor?.() ?? this.element;
  }
  renderLabel(element) {
    const domChildren = [];
    element.classList.add("chat-session-option-picker");
    const group = this.delegate.getOptionGroup();
    const isDefaultWithIcon = this.currentOption?.default && this.currentOption?.icon;
    if (this.currentOption?.icon) {
      domChildren.push(renderIcon(this.currentOption.icon));
    }
    if (!isDefaultWithIcon) {
      domChildren.push(dom.$("span.chat-session-option-label", void 0, this.currentOption?.name ?? group?.description ?? localize("chat.sessionPicker.label", "Pick Option")));
    }
    dom.reset(element, ...domChildren);
    this.setAriaLabelAttributes(element);
    return null;
  }
  render(container) {
    this.container = container;
    super.render(container);
    container.classList.add(this.getContainerClass());
    if (this.currentOption?.locked) {
      container.classList.add("locked");
    }
  }
  /**
   * Returns the CSS class to add to the container. Can be overridden by subclasses.
   */
  getContainerClass() {
    return "chat-sessionPicker-item";
  }
  updateEnabled() {
    const originalEnabled = this.action.enabled;
    if (this.currentOption?.locked) {
      this.action.enabled = false;
    }
    super.updateEnabled();
    this.action.enabled = originalEnabled;
    if (this.container) {
      this.container.classList.toggle("locked", !!this.currentOption?.locked);
    }
  }
};
ChatSessionPickerActionItem = __decorateClass([
  __decorateParam(4, IActionWidgetService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, ITelemetryService),
  __decorateParam(9, IChatEntitlementService),
  __decorateParam(10, IOpenerService)
], ChatSessionPickerActionItem);
export {
  ChatSessionPickerActionItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRTZXNzaW9uc1xcY2hhdFNlc3Npb25QaWNrZXJBY3Rpb25JdGVtLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXRTZXNzaW9uUGlja2VyQWN0aW9uSXRlbS5jc3MnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBnZXRBY3RpdmVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbiwgSUFjdGlvbldpZGdldERyb3Bkb3duT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldERyb3Bkb3duLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cCwgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ2hhdElucHV0UGlja2VyT3B0aW9ucywgd2l0aENoYXRJbnB1dFBpY2tlck1vdGlvbiB9IGZyb20gJy4uL3dpZGdldC9pbnB1dC9jaGF0SW5wdXRQaWNrZXJBY3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uTGlzdEl0ZW1Ib3ZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbkxpc3QuanMnO1xuaW1wb3J0IHsgZ2V0TW9kZWxIb3ZlckNvbnRlbnQgfSBmcm9tICcuLi93aWRnZXQvaW5wdXQvbW9kZWxQaWNrZXIvbW9kZWxQaWNrZXJIb3Zlci5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFNlc3Npb25QaWNrZXJEZWxlZ2F0ZSB7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlT3B0aW9uOiBFdmVudDxJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0+O1xuXHRnZXRDdXJyZW50T3B0aW9uKCk6IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbSB8IHVuZGVmaW5lZDtcblx0c2V0T3B0aW9uKG9wdGlvbjogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtKTogdm9pZDtcblx0Z2V0T3B0aW9uR3JvdXAoKTogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cCB8IHVuZGVmaW5lZDtcblx0Z2V0U2Vzc2lvblJlc291cmNlOiAoKSA9PiBVUkkgfCB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogQWN0aW9uIHZpZXcgaXRlbSBmb3IgbWFraW5nIGFuIG9wdGlvbiBzZWxlY3Rpb24gZm9yIGEgY29udHJpYnV0ZWQgY2hhdCBzZXNzaW9uXG4gKiBUaGVzZSBvcHRpb25zIGFyZSBwcm92aWRlZCBieSB0aGUgcmVsZXZhbnQgQ2hhdFNlc3Npb24gUHJvdmlkZXJcbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRTZXNzaW9uUGlja2VyQWN0aW9uSXRlbSBleHRlbmRzIEFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uVmlld0l0ZW0ge1xuXHRwcm90ZWN0ZWQgY3VycmVudE9wdGlvbjogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtIHwgdW5kZWZpbmVkO1xuXHRwcm90ZWN0ZWQgY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0aW5pdGlhbFN0YXRlOiB7IGdyb3VwOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwOyBpdGVtOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0gfCB1bmRlZmluZWQgfSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgZGVsZWdhdGU6IElDaGF0U2Vzc2lvblBpY2tlckRlbGVnYXRlLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBfcGlja2VyT3B0aW9uczogSUNoYXRJbnB1dFBpY2tlck9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElBY3Rpb25XaWRnZXRTZXJ2aWNlIGFjdGlvbldpZGdldFNlcnZpY2U6IElBY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IHsgZ3JvdXAsIGl0ZW0gfSA9IGluaXRpYWxTdGF0ZTtcblx0XHRjb25zdCBhY3Rpb25XaXRoTGFiZWw6IElBY3Rpb24gPSB7XG5cdFx0XHQuLi5hY3Rpb24sXG5cdFx0XHRsYWJlbDogaXRlbT8ubmFtZSB8fCBncm91cC5uYW1lLFxuXHRcdFx0dG9vbHRpcDogaXRlbT8uZGVzY3JpcHRpb24gPz8gZ3JvdXAuZGVzY3JpcHRpb24gPz8gZ3JvdXAubmFtZSxcblx0XHRcdHJ1bjogKCkgPT4geyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHNlc3Npb25QaWNrZXJBY3Rpb25XaWRnZXRPcHRpb25zOiBPbWl0PElBY3Rpb25XaWRnZXREcm9wZG93bk9wdGlvbnMsICdsYWJlbCcgfCAnbGFiZWxSZW5kZXJlcic+ID0ge1xuXHRcdFx0YWN0aW9uUHJvdmlkZXI6IHtcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gdGhpcy5nZXREcm9wZG93bkFjdGlvbnMoKVxuXHRcdFx0fSxcblx0XHRcdGFjdGlvbkJhckFjdGlvblByb3ZpZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRyZXBvcnRlcjogeyBpZDogZ3JvdXAuaWQsIG5hbWU6IGBDaGF0U2Vzc2lvbjoke2dyb3VwLm5hbWV9YCwgaW5jbHVkZU9wdGlvbnM6IGZhbHNlIH0sXG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IHRoaXMuX2dldEFuY2hvckVsZW1lbnQoKSxcblx0XHRcdGxpc3RPcHRpb25zOiB3aXRoQ2hhdElucHV0UGlja2VyTW90aW9uKHVuZGVmaW5lZCksXG5cdFx0fTtcblxuXHRcdHN1cGVyKGFjdGlvbldpdGhMYWJlbCwgc2Vzc2lvblBpY2tlckFjdGlvbldpZGdldE9wdGlvbnMsIGFjdGlvbldpZGdldFNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0dGhpcy5jdXJyZW50T3B0aW9uID0gaXRlbTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVsZWdhdGUub25EaWRDaGFuZ2VPcHRpb24obmV3T3B0aW9uID0+IHtcblx0XHRcdHRoaXMuY3VycmVudE9wdGlvbiA9IG5ld09wdGlvbjtcblx0XHRcdGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJMYWJlbCh0aGlzLmVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy51cGRhdGVFbmFibGVkKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcGlja2VyT3B0aW9ucyA9IHRoaXMuX3BpY2tlck9wdGlvbnM7XG5cdFx0aWYgKHBpY2tlck9wdGlvbnMpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0cGlja2VyT3B0aW9ucy5jb21wYWN0LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0XHRcdHRoaXMucmVuZGVyTGFiZWwodGhpcy5lbGVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBhY3Rpb25zIHRvIHNob3cgaW4gdGhlIGRyb3Bkb3duLiBDYW4gYmUgb3ZlcnJpZGRlbiBieSBzdWJjbGFzc2VzLlxuXHQgKi9cblx0cHJvdGVjdGVkIGdldERyb3Bkb3duQWN0aW9ucygpOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25bXSB7XG5cdFx0Ly8gaWYgbG9ja2VkLCBzaG93IHRoZSBjdXJyZW50IG9wdGlvbiBvbmx5XG5cdFx0Y29uc3QgY3VycmVudE9wdGlvbiA9IHRoaXMuZGVsZWdhdGUuZ2V0Q3VycmVudE9wdGlvbigpO1xuXHRcdGlmIChjdXJyZW50T3B0aW9uPy5sb2NrZWQpIHtcblx0XHRcdHJldHVybiBbdGhpcy5jcmVhdGVMb2NrZWRPcHRpb25BY3Rpb24oY3VycmVudE9wdGlvbildO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdyb3VwID0gdGhpcy5kZWxlZ2F0ZS5nZXRPcHRpb25Hcm91cCgpO1xuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25bXSA9IGdyb3VwLml0ZW1zLm1hcChvcHRpb25JdGVtID0+IHtcblx0XHRcdGNvbnN0IGlzQ3VycmVudCA9IG9wdGlvbkl0ZW0uaWQgPT09IGN1cnJlbnRPcHRpb24/LmlkO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6IG9wdGlvbkl0ZW0uaWQsXG5cdFx0XHRcdGVuYWJsZWQ6ICFvcHRpb25JdGVtLmxvY2tlZCxcblx0XHRcdFx0aWNvbjogb3B0aW9uSXRlbS5pY29uLFxuXHRcdFx0XHRjaGVja2VkOiBpc0N1cnJlbnQsXG5cdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBvcHRpb25JdGVtLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHR0b29sdGlwOiBvcHRpb25JdGVtLmRlc2NyaXB0aW9uID8/IG9wdGlvbkl0ZW0ubmFtZSxcblx0XHRcdFx0bGFiZWw6IG9wdGlvbkl0ZW0ubmFtZSxcblx0XHRcdFx0aG92ZXI6IHRoaXMuX2J1aWxkT3B0aW9uSG92ZXIob3B0aW9uSXRlbSksXG5cdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuZGVsZWdhdGUuc2V0T3B0aW9uKG9wdGlvbkl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IHNhdGlzZmllcyBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb247XG5cdFx0fSk7XG5cblx0XHQvLyBBZGQgY29tbWFuZHMgYXQgdGhlIGVuZCBpbiBhIHNlcGFyYXRlIHNlY3Rpb24gKG9ubHkgaWYgdGhlcmUgYXJlIG9wdGlvbnMpXG5cdFx0aWYgKGdyb3VwLmNvbW1hbmRzPy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGFkZFNlcGFyYXRvciA9IGFjdGlvbnMubGVuZ3RoID4gMDtcblx0XHRcdGZvciAoY29uc3QgY29tbWFuZCBvZiBncm91cC5jb21tYW5kcykge1xuXHRcdFx0XHRjb25zdCBhcmdzID0gY29tbWFuZC5hcmd1bWVudHMgPyBbLi4uY29tbWFuZC5hcmd1bWVudHNdIDogW107XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuZGVsZWdhdGUuZ2V0U2Vzc2lvblJlc291cmNlKCk7XG5cdFx0XHRcdGlmIChzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRhcmdzLnVuc2hpZnQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGlkOiBjb21tYW5kLmNvbW1hbmQsXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRjaGVja2VkOiBmYWxzZSxcblx0XHRcdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dG9vbHRpcDogY29tbWFuZC50b29sdGlwID8/IGNvbW1hbmQudGl0bGUsXG5cdFx0XHRcdFx0bGFiZWw6IGNvbW1hbmQudGl0bGUsXG5cdFx0XHRcdFx0Ly8gVXNlIGNhdGVnb3J5IHRvIGNyZWF0ZSBhIHNlcGFyYXRvciBiZWZvcmUgY29tbWFuZHMgKG9ubHkgaWYgdGhlcmUgYXJlIG9wdGlvbnMpXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IGFkZFNlcGFyYXRvciA/IHsgbGFiZWw6ICcnLCBvcmRlcjogTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIgfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZC5jb21tYW5kLCAuLi5hcmdzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gc2F0aXNmaWVzIElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIF9idWlsZE9wdGlvbkhvdmVyKG9wdGlvbkl0ZW06IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbSk6IElBY3Rpb25MaXN0SXRlbUhvdmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAob3B0aW9uSXRlbS5tb2RlbE1ldGFkYXRhKSB7XG5cdFx0XHRjb25zdCBpc1VCQiA9ICEhdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcy51c2FnZUJhc2VkQmlsbGluZztcblx0XHRcdGNvbnN0IHN5bnRoZXRpY01vZGVsID0ge1xuXHRcdFx0XHRpZGVudGlmaWVyOiBvcHRpb25JdGVtLmlkLFxuXHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJycpLFxuXHRcdFx0XHRcdG5hbWU6IG9wdGlvbkl0ZW0ubW9kZWxNZXRhZGF0YS5uYW1lLFxuXHRcdFx0XHRcdGlkOiBvcHRpb25JdGVtLm1vZGVsTWV0YWRhdGEuaWQsXG5cdFx0XHRcdFx0dmVuZG9yOiBvcHRpb25JdGVtLm1vZGVsTWV0YWRhdGEudmVuZG9yID8/ICcnLFxuXHRcdFx0XHRcdHZlcnNpb246IG9wdGlvbkl0ZW0ubW9kZWxNZXRhZGF0YS52ZXJzaW9uID8/ICcnLFxuXHRcdFx0XHRcdGZhbWlseTogb3B0aW9uSXRlbS5tb2RlbE1ldGFkYXRhLmZhbWlseSA/PyAnJyxcblx0XHRcdFx0XHR0b29sdGlwOiBvcHRpb25JdGVtLm1vZGVsTWV0YWRhdGEudG9vbHRpcCxcblx0XHRcdFx0XHRwcmljaW5nOiBvcHRpb25JdGVtLm1vZGVsTWV0YWRhdGEucHJpY2luZyxcblx0XHRcdFx0XHRtdWx0aXBsaWVyTnVtZXJpYzogb3B0aW9uSXRlbS5tb2RlbE1ldGFkYXRhLm11bHRpcGxpZXJOdW1lcmljLFxuXHRcdFx0XHRcdGlucHV0Q29zdDogb3B0aW9uSXRlbS5tb2RlbE1ldGFkYXRhLmlucHV0Q29zdCxcblx0XHRcdFx0XHRvdXRwdXRDb3N0OiBvcHRpb25JdGVtLm1vZGVsTWV0YWRhdGEub3V0cHV0Q29zdCxcblx0XHRcdFx0XHRjYWNoZUNvc3Q6IG9wdGlvbkl0ZW0ubW9kZWxNZXRhZGF0YS5jYWNoZUNvc3QsXG5cdFx0XHRcdFx0Y2FjaGVXcml0ZUNvc3Q6IG9wdGlvbkl0ZW0ubW9kZWxNZXRhZGF0YS5jYWNoZVdyaXRlQ29zdCxcblx0XHRcdFx0XHRsb25nQ29udGV4dElucHV0Q29zdDogb3B0aW9uSXRlbS5tb2RlbE1ldGFkYXRhLmxvbmdDb250ZXh0SW5wdXRDb3N0LFxuXHRcdFx0XHRcdGxvbmdDb250ZXh0T3V0cHV0Q29zdDogb3B0aW9uSXRlbS5tb2RlbE1ldGFkYXRhLmxvbmdDb250ZXh0T3V0cHV0Q29zdCxcblx0XHRcdFx0XHRsb25nQ29udGV4dENhY2hlQ29zdDogb3B0aW9uSXRlbS5tb2RlbE1ldGFkYXRhLmxvbmdDb250ZXh0Q2FjaGVDb3N0LFxuXHRcdFx0XHRcdGxvbmdDb250ZXh0Q2FjaGVXcml0ZUNvc3Q6IG9wdGlvbkl0ZW0ubW9kZWxNZXRhZGF0YS5sb25nQ29udGV4dENhY2hlV3JpdGVDb3N0LFxuXHRcdFx0XHRcdHByaWNlQ2F0ZWdvcnk6IG9wdGlvbkl0ZW0ubW9kZWxNZXRhZGF0YS5wcmljZUNhdGVnb3J5LFxuXHRcdFx0XHRcdHByb21vOiBvcHRpb25JdGVtLm1vZGVsTWV0YWRhdGEucHJvbW8sXG5cdFx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IG9wdGlvbkl0ZW0ubW9kZWxNZXRhZGF0YS5tYXhJbnB1dFRva2VucyA/PyAwLFxuXHRcdFx0XHRcdG1heE91dHB1dFRva2Vuczogb3B0aW9uSXRlbS5tb2RlbE1ldGFkYXRhLm1heE91dHB1dFRva2VucyA/PyAwLFxuXHRcdFx0XHRcdGNhcGFiaWxpdGllczogb3B0aW9uSXRlbS5tb2RlbE1ldGFkYXRhLmNhcGFiaWxpdGllcyA/IHtcblx0XHRcdFx0XHRcdHZpc2lvbjogb3B0aW9uSXRlbS5tb2RlbE1ldGFkYXRhLmNhcGFiaWxpdGllcy52aXNpb24sXG5cdFx0XHRcdFx0XHR0b29sQ2FsbGluZzogb3B0aW9uSXRlbS5tb2RlbE1ldGFkYXRhLmNhcGFiaWxpdGllcy50b29sQ2FsbGluZyxcblx0XHRcdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBob3ZlciA9IGdldE1vZGVsSG92ZXJDb250ZW50KHN5bnRoZXRpY01vZGVsLCBpc1VCQiwgdW5kZWZpbmVkLCB0aGlzLm9wZW5lclNlcnZpY2UpO1xuXHRcdFx0aWYgKGhvdmVyKSB7XG5cdFx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IGhvdmVyLmVsZW1lbnQsIGRpc3Bvc2FibGU6IGhvdmVyLmRpc3Bvc2FibGUgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKG9wdGlvbkl0ZW0udG9vbHRpcCkge1xuXHRcdFx0cmV0dXJuIHsgY29udGVudDogb3B0aW9uSXRlbS50b29sdGlwIH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIGRpc2FibGVkIGFjdGlvbiBmb3IgYSBsb2NrZWQgb3B0aW9uLlxuXHQgKi9cblx0cHJvdGVjdGVkIGNyZWF0ZUxvY2tlZE9wdGlvbkFjdGlvbihvcHRpb246IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbSk6IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBvcHRpb24uaWQsXG5cdFx0XHRlbmFibGVkOiBmYWxzZSxcblx0XHRcdGljb246IG9wdGlvbi5pY29uLFxuXHRcdFx0Y2hlY2tlZDogdHJ1ZSxcblx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRkZXNjcmlwdGlvbjogb3B0aW9uLmRlc2NyaXB0aW9uLFxuXHRcdFx0dG9vbHRpcDogb3B0aW9uLmRlc2NyaXB0aW9uID8/IG9wdGlvbi5uYW1lLFxuXHRcdFx0bGFiZWw6IG9wdGlvbi5uYW1lLFxuXHRcdFx0cnVuOiAoKSA9PiB7IH1cblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGFuY2hvciBlbGVtZW50IGZvciB0aGUgZHJvcGRvd24uXG5cdCAqIEZhbGxzIGJhY2sgdG8gdGhlIG92ZXJmbG93IGFuY2hvciBpZiB0aGlzIGVsZW1lbnQgaXMgbm90IGluIHRoZSBET00uXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRBbmNob3JFbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRpZiAodGhpcy5lbGVtZW50ICYmIGdldEFjdGl2ZVdpbmRvdygpLmRvY3VtZW50LmNvbnRhaW5zKHRoaXMuZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiB0aGlzLmVsZW1lbnQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9waWNrZXJPcHRpb25zPy5nZXRPdmVyZmxvd0FuY2hvcj8uKCkgPz8gdGhpcy5lbGVtZW50ITtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJMYWJlbChlbGVtZW50OiBIVE1MRWxlbWVudCk6IElEaXNwb3NhYmxlIHwgbnVsbCB7XG5cdFx0Y29uc3QgZG9tQ2hpbGRyZW4gPSBbXTtcblx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtc2Vzc2lvbi1vcHRpb24tcGlja2VyJyk7XG5cdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLmRlbGVnYXRlLmdldE9wdGlvbkdyb3VwKCk7XG5cdFx0Ly8gSWYgdGhlIGN1cnJlbnQgb3B0aW9uIGlzIHRoZSBkZWZhdWx0IGFuZCBoYXMgYW4gaWNvbiwgY29sbGFwc2UgdGhlIHRleHQgYW5kIHNob3cgb25seSB0aGUgaWNvblxuXHRcdGNvbnN0IGlzRGVmYXVsdFdpdGhJY29uID0gdGhpcy5jdXJyZW50T3B0aW9uPy5kZWZhdWx0ICYmIHRoaXMuY3VycmVudE9wdGlvbj8uaWNvbjtcblxuXHRcdGlmICh0aGlzLmN1cnJlbnRPcHRpb24/Lmljb24pIHtcblx0XHRcdGRvbUNoaWxkcmVuLnB1c2gocmVuZGVySWNvbih0aGlzLmN1cnJlbnRPcHRpb24uaWNvbikpO1xuXHRcdH1cblxuXHRcdGlmICghaXNEZWZhdWx0V2l0aEljb24pIHtcblx0XHRcdGRvbUNoaWxkcmVuLnB1c2goZG9tLiQoJ3NwYW4uY2hhdC1zZXNzaW9uLW9wdGlvbi1sYWJlbCcsIHVuZGVmaW5lZCwgdGhpcy5jdXJyZW50T3B0aW9uPy5uYW1lID8/IGdyb3VwPy5kZXNjcmlwdGlvbiA/PyBsb2NhbGl6ZSgnY2hhdC5zZXNzaW9uUGlja2VyLmxhYmVsJywgXCJQaWNrIE9wdGlvblwiKSkpO1xuXHRcdH1cblxuXHRcdGRvbS5yZXNldChlbGVtZW50LCAuLi5kb21DaGlsZHJlbik7XG5cdFx0dGhpcy5zZXRBcmlhTGFiZWxBdHRyaWJ1dGVzKGVsZW1lbnQpO1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCh0aGlzLmdldENvbnRhaW5lckNsYXNzKCkpO1xuXG5cdFx0Ly8gU2V0IGluaXRpYWwgbG9ja2VkIHN0YXRlIG9uIGNvbnRhaW5lclxuXHRcdGlmICh0aGlzLmN1cnJlbnRPcHRpb24/LmxvY2tlZCkge1xuXHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2xvY2tlZCcpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBDU1MgY2xhc3MgdG8gYWRkIHRvIHRoZSBjb250YWluZXIuIENhbiBiZSBvdmVycmlkZGVuIGJ5IHN1YmNsYXNzZXMuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgZ2V0Q29udGFpbmVyQ2xhc3MoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJ2NoYXQtc2Vzc2lvblBpY2tlci1pdGVtJztcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVFbmFibGVkKCk6IHZvaWQge1xuXHRcdGNvbnN0IG9yaWdpbmFsRW5hYmxlZCA9IHRoaXMuYWN0aW9uLmVuYWJsZWQ7XG5cdFx0aWYgKHRoaXMuY3VycmVudE9wdGlvbj8ubG9ja2VkKSB7XG5cdFx0XHR0aGlzLmFjdGlvbi5lbmFibGVkID0gZmFsc2U7XG5cdFx0fVxuXHRcdHN1cGVyLnVwZGF0ZUVuYWJsZWQoKTtcblx0XHR0aGlzLmFjdGlvbi5lbmFibGVkID0gb3JpZ2luYWxFbmFibGVkO1xuXHRcdGlmICh0aGlzLmNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnbG9ja2VkJywgISF0aGlzLmN1cnJlbnRPcHRpb24/LmxvY2tlZCk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFHUCxZQUFZLFNBQVM7QUFDckIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw0QkFBNEI7QUFFckMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywwQ0FBMEM7QUFFbkQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFFekIsU0FBa0MsaUNBQWlDO0FBQ25FLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtCQUErQjtBQUV4QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUEyQjtBQWU3QixJQUFNLDhCQUFOLGNBQTBDLG1DQUFtQztBQUFBLEVBSW5GLFlBQ0MsUUFDQSxjQUNtQixVQUNBLGdCQUNHLHFCQUNGLG1CQUNBLG1CQUNnQixnQkFDakIsa0JBQ3VCLHdCQUNULGVBQ2hDO0FBQ0QsVUFBTSxFQUFFLE9BQU8sS0FBSyxJQUFJO0FBQ3hCLFVBQU0sa0JBQTJCO0FBQUEsTUFDaEMsR0FBRztBQUFBLE1BQ0gsT0FBTyxNQUFNLFFBQVEsTUFBTTtBQUFBLE1BQzNCLFNBQVMsTUFBTSxlQUFlLE1BQU0sZUFBZSxNQUFNO0FBQUEsTUFDekQsS0FBSyxNQUFNO0FBQUEsTUFBRTtBQUFBLElBQ2Q7QUFFQSxVQUFNLG1DQUFrRztBQUFBLE1BQ3ZHLGdCQUFnQjtBQUFBLFFBQ2YsWUFBWSxNQUFNLEtBQUssbUJBQW1CO0FBQUEsTUFDM0M7QUFBQSxNQUNBLHlCQUF5QjtBQUFBLE1BQ3pCLFVBQVUsRUFBRSxJQUFJLE1BQU0sSUFBSSxNQUFNLGVBQWUsTUFBTSxJQUFJLElBQUksZ0JBQWdCLE1BQU07QUFBQSxNQUNuRixXQUFXLE1BQU0sS0FBSyxrQkFBa0I7QUFBQSxNQUN4QyxhQUFhLDBCQUEwQixNQUFTO0FBQUEsSUFDakQ7QUFFQSxVQUFNLGlCQUFpQixrQ0FBa0MscUJBQXFCLG1CQUFtQixtQkFBbUIsZ0JBQWdCO0FBNUJqSDtBQUNBO0FBSWlCO0FBRU07QUFDVDtBQXFCakMsU0FBSyxnQkFBZ0I7QUFFckIsU0FBSyxVQUFVLEtBQUssU0FBUyxrQkFBa0IsZUFBYTtBQUMzRCxXQUFLLGdCQUFnQjtBQUNyQixVQUFJLEtBQUssU0FBUztBQUNqQixhQUFLLFlBQVksS0FBSyxPQUFPO0FBQUEsTUFDOUI7QUFDQSxXQUFLLGNBQWM7QUFBQSxJQUNwQixDQUFDLENBQUM7QUFFRixVQUFNLGdCQUFnQixLQUFLO0FBQzNCLFFBQUksZUFBZTtBQUNsQixXQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLHNCQUFjLFFBQVEsS0FBSyxNQUFNO0FBQ2pDLFlBQUksS0FBSyxTQUFTO0FBQ2pCLGVBQUssWUFBWSxLQUFLLE9BQU87QUFBQSxRQUM5QjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtVLHFCQUFvRDtBQUU3RCxVQUFNLGdCQUFnQixLQUFLLFNBQVMsaUJBQWlCO0FBQ3JELFFBQUksZUFBZSxRQUFRO0FBQzFCLGFBQU8sQ0FBQyxLQUFLLHlCQUF5QixhQUFhLENBQUM7QUFBQSxJQUNyRDtBQUVBLFVBQU0sUUFBUSxLQUFLLFNBQVMsZUFBZTtBQUMzQyxRQUFJLENBQUMsT0FBTztBQUNYLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFFQSxVQUFNLFVBQXlDLE1BQU0sTUFBTSxJQUFJLGdCQUFjO0FBQzVFLFlBQU0sWUFBWSxXQUFXLE9BQU8sZUFBZTtBQUNuRCxhQUFPO0FBQUEsUUFDTixJQUFJLFdBQVc7QUFBQSxRQUNmLFNBQVMsQ0FBQyxXQUFXO0FBQUEsUUFDckIsTUFBTSxXQUFXO0FBQUEsUUFDakIsU0FBUztBQUFBLFFBQ1QsT0FBTztBQUFBLFFBQ1AsYUFBYSxXQUFXO0FBQUEsUUFDeEIsU0FBUyxXQUFXLGVBQWUsV0FBVztBQUFBLFFBQzlDLE9BQU8sV0FBVztBQUFBLFFBQ2xCLE9BQU8sS0FBSyxrQkFBa0IsVUFBVTtBQUFBLFFBQ3hDLEtBQUssTUFBTTtBQUNWLGVBQUssU0FBUyxVQUFVLFVBQVU7QUFBQSxRQUNuQztBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFHRCxRQUFJLE1BQU0sVUFBVSxRQUFRO0FBQzNCLFlBQU0sZUFBZSxRQUFRLFNBQVM7QUFDdEMsaUJBQVcsV0FBVyxNQUFNLFVBQVU7QUFDckMsY0FBTSxPQUFPLFFBQVEsWUFBWSxDQUFDLEdBQUcsUUFBUSxTQUFTLElBQUksQ0FBQztBQUMzRCxjQUFNLGtCQUFrQixLQUFLLFNBQVMsbUJBQW1CO0FBQ3pELFlBQUksaUJBQWlCO0FBQ3BCLGVBQUssUUFBUSxlQUFlO0FBQUEsUUFDN0I7QUFDQSxnQkFBUSxLQUFLO0FBQUEsVUFDWixJQUFJLFFBQVE7QUFBQSxVQUNaLFNBQVM7QUFBQSxVQUNULFNBQVM7QUFBQSxVQUNULE9BQU87QUFBQSxVQUNQLGFBQWE7QUFBQSxVQUNiLFNBQVMsUUFBUSxXQUFXLFFBQVE7QUFBQSxVQUNwQyxPQUFPLFFBQVE7QUFBQTtBQUFBLFVBRWYsVUFBVSxlQUFlLEVBQUUsT0FBTyxJQUFJLE9BQU8sT0FBTyxpQkFBaUIsSUFBSTtBQUFBLFVBQ3pFLEtBQUssTUFBTTtBQUNWLGlCQUFLLGVBQWUsZUFBZSxRQUFRLFNBQVMsR0FBRyxJQUFJO0FBQUEsVUFDNUQ7QUFBQSxRQUNELENBQXVDO0FBQUEsTUFDeEM7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGtCQUFrQixZQUE4RTtBQUN2RyxRQUFJLFdBQVcsZUFBZTtBQUM3QixZQUFNLFFBQVEsQ0FBQyxDQUFDLEtBQUssdUJBQXVCLE9BQU87QUFDbkQsWUFBTSxpQkFBaUI7QUFBQSxRQUN0QixZQUFZLFdBQVc7QUFBQSxRQUN2QixVQUFVO0FBQUEsVUFDVCxXQUFXLElBQUksb0JBQW9CLEVBQUU7QUFBQSxVQUNyQyxNQUFNLFdBQVcsY0FBYztBQUFBLFVBQy9CLElBQUksV0FBVyxjQUFjO0FBQUEsVUFDN0IsUUFBUSxXQUFXLGNBQWMsVUFBVTtBQUFBLFVBQzNDLFNBQVMsV0FBVyxjQUFjLFdBQVc7QUFBQSxVQUM3QyxRQUFRLFdBQVcsY0FBYyxVQUFVO0FBQUEsVUFDM0MsU0FBUyxXQUFXLGNBQWM7QUFBQSxVQUNsQyxTQUFTLFdBQVcsY0FBYztBQUFBLFVBQ2xDLG1CQUFtQixXQUFXLGNBQWM7QUFBQSxVQUM1QyxXQUFXLFdBQVcsY0FBYztBQUFBLFVBQ3BDLFlBQVksV0FBVyxjQUFjO0FBQUEsVUFDckMsV0FBVyxXQUFXLGNBQWM7QUFBQSxVQUNwQyxnQkFBZ0IsV0FBVyxjQUFjO0FBQUEsVUFDekMsc0JBQXNCLFdBQVcsY0FBYztBQUFBLFVBQy9DLHVCQUF1QixXQUFXLGNBQWM7QUFBQSxVQUNoRCxzQkFBc0IsV0FBVyxjQUFjO0FBQUEsVUFDL0MsMkJBQTJCLFdBQVcsY0FBYztBQUFBLFVBQ3BELGVBQWUsV0FBVyxjQUFjO0FBQUEsVUFDeEMsT0FBTyxXQUFXLGNBQWM7QUFBQSxVQUNoQyxnQkFBZ0IsV0FBVyxjQUFjLGtCQUFrQjtBQUFBLFVBQzNELGlCQUFpQixXQUFXLGNBQWMsbUJBQW1CO0FBQUEsVUFDN0QsY0FBYyxXQUFXLGNBQWMsZUFBZTtBQUFBLFlBQ3JELFFBQVEsV0FBVyxjQUFjLGFBQWE7QUFBQSxZQUM5QyxhQUFhLFdBQVcsY0FBYyxhQUFhO0FBQUEsVUFDcEQsSUFBSTtBQUFBLFVBQ0osc0JBQXNCLENBQUM7QUFBQSxRQUN4QjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFFBQVEscUJBQXFCLGdCQUFnQixPQUFPLFFBQVcsS0FBSyxhQUFhO0FBQ3ZGLFVBQUksT0FBTztBQUNWLGVBQU8sRUFBRSxTQUFTLE1BQU0sU0FBUyxZQUFZLE1BQU0sV0FBVztBQUFBLE1BQy9EO0FBQUEsSUFDRDtBQUNBLFFBQUksV0FBVyxTQUFTO0FBQ3ZCLGFBQU8sRUFBRSxTQUFTLFdBQVcsUUFBUTtBQUFBLElBQ3RDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtVLHlCQUF5QixRQUFxRTtBQUN2RyxXQUFPO0FBQUEsTUFDTixJQUFJLE9BQU87QUFBQSxNQUNYLFNBQVM7QUFBQSxNQUNULE1BQU0sT0FBTztBQUFBLE1BQ2IsU0FBUztBQUFBLE1BQ1QsT0FBTztBQUFBLE1BQ1AsYUFBYSxPQUFPO0FBQUEsTUFDcEIsU0FBUyxPQUFPLGVBQWUsT0FBTztBQUFBLE1BQ3RDLE9BQU8sT0FBTztBQUFBLE1BQ2QsS0FBSyxNQUFNO0FBQUEsTUFBRTtBQUFBLElBQ2Q7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1RLG9CQUFpQztBQUN4QyxRQUFJLEtBQUssV0FBVyxnQkFBZ0IsRUFBRSxTQUFTLFNBQVMsS0FBSyxPQUFPLEdBQUc7QUFDdEUsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFdBQU8sS0FBSyxnQkFBZ0Isb0JBQW9CLEtBQUssS0FBSztBQUFBLEVBQzNEO0FBQUEsRUFFbUIsWUFBWSxTQUEwQztBQUN4RSxVQUFNLGNBQWMsQ0FBQztBQUNyQixZQUFRLFVBQVUsSUFBSSw0QkFBNEI7QUFDbEQsVUFBTSxRQUFRLEtBQUssU0FBUyxlQUFlO0FBRTNDLFVBQU0sb0JBQW9CLEtBQUssZUFBZSxXQUFXLEtBQUssZUFBZTtBQUU3RSxRQUFJLEtBQUssZUFBZSxNQUFNO0FBQzdCLGtCQUFZLEtBQUssV0FBVyxLQUFLLGNBQWMsSUFBSSxDQUFDO0FBQUEsSUFDckQ7QUFFQSxRQUFJLENBQUMsbUJBQW1CO0FBQ3ZCLGtCQUFZLEtBQUssSUFBSSxFQUFFLGtDQUFrQyxRQUFXLEtBQUssZUFBZSxRQUFRLE9BQU8sZUFBZSxTQUFTLDRCQUE0QixhQUFhLENBQUMsQ0FBQztBQUFBLElBQzNLO0FBRUEsUUFBSSxNQUFNLFNBQVMsR0FBRyxXQUFXO0FBQ2pDLFNBQUssdUJBQXVCLE9BQU87QUFDbkMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVTLE9BQU8sV0FBOEI7QUFDN0MsU0FBSyxZQUFZO0FBQ2pCLFVBQU0sT0FBTyxTQUFTO0FBQ3RCLGNBQVUsVUFBVSxJQUFJLEtBQUssa0JBQWtCLENBQUM7QUFHaEQsUUFBSSxLQUFLLGVBQWUsUUFBUTtBQUMvQixnQkFBVSxVQUFVLElBQUksUUFBUTtBQUFBLElBQ2pDO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1Usb0JBQTRCO0FBQ3JDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFbUIsZ0JBQXNCO0FBQ3hDLFVBQU0sa0JBQWtCLEtBQUssT0FBTztBQUNwQyxRQUFJLEtBQUssZUFBZSxRQUFRO0FBQy9CLFdBQUssT0FBTyxVQUFVO0FBQUEsSUFDdkI7QUFDQSxVQUFNLGNBQWM7QUFDcEIsU0FBSyxPQUFPLFVBQVU7QUFDdEIsUUFBSSxLQUFLLFdBQVc7QUFDbkIsV0FBSyxVQUFVLFVBQVUsT0FBTyxVQUFVLENBQUMsQ0FBQyxLQUFLLGVBQWUsTUFBTTtBQUFBLElBQ3ZFO0FBQUEsRUFDRDtBQUNEO0FBalBhLDhCQUFOO0FBQUEsRUFTSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBZlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
