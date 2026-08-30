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
import * as dom from "../../../../../../../base/browser/dom.js";
import { renderIcon } from "../../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { formatTokenCount } from "../../../../../../../base/common/numbers.js";
import { ThemeIcon } from "../../../../../../../base/common/themables.js";
import { localize } from "../../../../../../../nls.js";
import { ActionListItemKind } from "../../../../../../../platform/actionWidget/browser/actionList.js";
import { IActionWidgetService } from "../../../../../../../platform/actionWidget/browser/actionWidget.js";
import { ITelemetryService } from "../../../../../../../platform/telemetry/common/telemetry.js";
import { TelemetryTrustedValue } from "../../../../../../../platform/telemetry/common/telemetryUtils.js";
import { withChatInputPickerMotion } from "../chatInputPickerActionItem.js";
let ModelPickerConfiguration = class {
  constructor(_host, _actionWidgetService, _telemetryService) {
    this._host = _host;
    this._actionWidgetService = _actionWidgetService;
    this._telemetryService = _telemetryService;
    this._showRequestId = 0;
  }
  renderButton(button, compact, noModelsAvailable) {
    const model = this._host.getSelectedModel();
    const effortConfig = this._getConfigProperty("navigation");
    const tokensConfig = this._getConfigProperty("tokens");
    if (!model || noModelsAvailable || !effortConfig && !tokensConfig) {
      button.style.display = "none";
      return;
    }
    const labelParts = [];
    const ariaParts = [];
    if (effortConfig && effortConfig.value !== void 0) {
      const enumIndex = effortConfig.schema.enum?.indexOf(effortConfig.value) ?? -1;
      const effortLabel = enumIndex >= 0 && effortConfig.schema.enumItemLabels?.[enumIndex] ? effortConfig.schema.enumItemLabels[enumIndex] : String(effortConfig.value);
      labelParts.push(effortLabel);
      ariaParts.push(effortConfig.schema.title ? localize("chat.modelPicker.navigationAriaLabel", "{0}: {1}", effortConfig.schema.title, effortLabel) : localize("chat.modelPicker.effortAriaLabel", "Thinking Effort: {0}", effortLabel));
    }
    if (tokensConfig && tokensConfig.value !== void 0) {
      const enumIndex = tokensConfig.schema.enum?.indexOf(tokensConfig.value) ?? -1;
      const tokensLabel = enumIndex >= 0 && tokensConfig.schema.enumItemLabels?.[enumIndex] ? tokensConfig.schema.enumItemLabels[enumIndex] : formatTokenCount(Number(tokensConfig.value));
      labelParts.push(tokensLabel);
      ariaParts.push(localize("chat.modelPicker.tokensAriaLabel", "Context Size: {0}", tokensLabel));
    }
    if (!labelParts.length) {
      const fallbackLabel = effortConfig?.schema.title ?? tokensConfig?.schema.title ?? localize("chat.modelPicker.configureLabel", "Configure");
      labelParts.push(fallbackLabel);
      ariaParts.push(fallbackLabel);
    }
    button.style.display = "";
    button.ariaLabel = ariaParts.join(", ") || localize("chat.modelPicker.configTooltip", "Configure Model");
    if (compact) {
      dom.reset(button, renderIcon(Codicon.settings));
      return;
    }
    dom.reset(button, dom.$("span.chat-input-picker-label", void 0, labelParts.join(" ")));
  }
  show(button, focusGroup) {
    if (this._host.isDisabled() || !button || !this._host.getSelectedModel()) {
      return;
    }
    if (button.getAttribute("aria-expanded") === "true") {
      this._showRequestId++;
      this._actionWidgetService.hide(true);
      return;
    }
    const items = this._buildItems();
    if (!items.length) {
      return;
    }
    const previouslyFocusedElement = dom.getActiveElement();
    const showRequestId = ++this._showRequestId;
    const delegate = {
      onSelect: async (action) => {
        this._actionWidgetService.focusItemById(action.id);
        await action.run();
        this._actionWidgetService.updateItems(this._buildItems(), action.id);
      },
      onHide: () => {
        this._showRequestId++;
        if (this._activeButton === button) {
          this._activeButton = void 0;
        }
        button.setAttribute("aria-expanded", "false");
        const visibilityChange2 = this._host.onDidChangeVisibility?.(false);
        if (visibilityChange2) {
          void visibilityChange2.catch(() => {
          });
        }
        if (dom.isHTMLElement(previouslyFocusedElement)) {
          previouslyFocusedElement.focus();
        }
      }
    };
    button.setAttribute("aria-expanded", "true");
    this._activeButton = button;
    const showCacheBreakHint = this._host.shouldShowCacheBreakHint();
    const showActionWidget = () => {
      if (showRequestId !== this._showRequestId || button.getAttribute("aria-expanded") !== "true") {
        return;
      }
      this._actionWidgetService.show(
        "ChatModelConfigPicker",
        false,
        items,
        delegate,
        this._host.getActionWidgetAnchor?.(button) ?? button,
        this._host.getActionWidgetContainer?.(),
        [],
        {
          isChecked: (element) => element.kind === ActionListItemKind.Action ? !!element.item?.checked : void 0,
          getRole: (element) => element.kind === ActionListItemKind.Action ? "menuitemradio" : "separator",
          getWidgetRole: () => "menu"
        },
        withChatInputPickerMotion({
          headerText: showCacheBreakHint ? localize("chat.config.cacheBreakHint", "Changing these options mid-session resets the prompt cache and may increase cost.") : void 0,
          headerIcon: showCacheBreakHint ? Codicon.info : void 0,
          headerLink: showCacheBreakHint ? this._host.getCacheBreakLearnMoreLink() : void 0,
          headerDismiss: showCacheBreakHint ? this._host.dismissCacheBreakHint : void 0,
          reserveSubmenuSpace: false,
          anchorPosition: this._host.getAnchorPosition?.()
        })
      );
      if (focusGroup) {
        const groupItem = items.find((item) => item.kind === ActionListItemKind.Action && item.item?.id?.startsWith(`${focusGroup}.`));
        if (groupItem?.kind === ActionListItemKind.Action && groupItem.item) {
          this._actionWidgetService.focusItemById(groupItem.item.id);
        }
      }
    };
    const visibilityChange = this._host.onDidChangeVisibility?.(true);
    if (visibilityChange) {
      void visibilityChange.then(showActionWidget, () => {
        if (showRequestId !== this._showRequestId) {
          return;
        }
        this._showRequestId++;
        if (this._activeButton === button) {
          this._activeButton = void 0;
        }
        button.setAttribute("aria-expanded", "false");
        const hideVisibilityChange = this._host.onDidChangeVisibility?.(false);
        if (hideVisibilityChange) {
          void hideVisibilityChange.catch(() => {
          });
        }
        if (dom.isHTMLElement(previouslyFocusedElement)) {
          previouslyFocusedElement.focus();
        }
      });
    } else {
      showActionWidget();
    }
  }
  dispose() {
    this._showRequestId++;
    if (this._activeButton) {
      this._activeButton = void 0;
      this._actionWidgetService.hide(true);
    }
  }
  _getConfigProperty(group) {
    const model = this._host.getSelectedModel();
    if (!model) {
      return void 0;
    }
    const schema = model.metadata.configurationSchema;
    if (!schema?.properties) {
      return void 0;
    }
    const configurationAccess = this._host.getConfigurationAccess();
    const currentConfig = configurationAccess.getModelConfiguration(model.identifier) ?? {};
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (propSchema.group !== group || !propSchema.enum?.length) {
        continue;
      }
      return { key, value: currentConfig[key] ?? propSchema.default, schema: propSchema };
    }
    return void 0;
  }
  _buildItems() {
    const model = this._host.getSelectedModel();
    if (!model) {
      return [];
    }
    const modelIdentifier = model.identifier;
    const configurationAccess = this._host.getConfigurationAccess();
    const items = [];
    const defaultLabel = localize("models.configDefault", "Default");
    const appendConfigSection = (group, fallbackHeaderLabel, formatValueLabel, logChange) => {
      const config = this._getConfigProperty(group);
      if (!config) {
        return;
      }
      const previousValue = String(config.value ?? "");
      const enumValues = config.schema.enum ?? [];
      if (items.length) {
        items.push({ kind: ActionListItemKind.Separator });
      }
      items.push({ kind: ActionListItemKind.Header, label: config.schema.title ?? fallbackHeaderLabel });
      for (let index = 0; index < enumValues.length; index++) {
        const value = enumValues[index];
        const isDefault = value === config.schema.default;
        const displayLabel = formatValueLabel(value, config.schema.enumItemLabels?.[index]);
        const enumDescription = config.schema.enumDescriptions?.[index];
        const ariaDescriptionParts = [isDefault ? defaultLabel : void 0, enumDescription].filter((part) => !!part);
        const checked = config.value === value;
        items.push({
          item: {
            id: `${group}.${value}`,
            enabled: true,
            checked,
            class: void 0,
            tooltip: enumDescription ?? "",
            label: displayLabel,
            run: () => {
              logChange(value, previousValue, config.key);
              return configurationAccess.setModelConfiguration(modelIdentifier, { [config.key]: value });
            }
          },
          kind: ActionListItemKind.Action,
          className: "chat-model-picker-config-option",
          label: displayLabel,
          description: isDefault ? defaultLabel : void 0,
          ariaDescription: ariaDescriptionParts.length ? ariaDescriptionParts.join(", ") : void 0,
          hover: enumDescription ? { content: enumDescription } : void 0,
          group: { title: "", icon: ThemeIcon.fromId(checked ? Codicon.check.id : Codicon.blank.id) },
          hideIcon: false
        });
      }
    };
    appendConfigSection(
      "navigation",
      localize("chat.effort.header", "Thinking Effort"),
      (value, enumLabel) => enumLabel ?? String(value),
      (value, previousValue, key) => this._telemetryService.publicLog2("chat.thinkingEffortChange", {
        model: model.metadata.vendor === "copilot" ? new TelemetryTrustedValue(modelIdentifier) : "unknown",
        // Third-party providers choose their own property keys, so only
        // first-party ones are reported as a controlled vocabulary.
        property: model.metadata.vendor === "copilot" ? key : "unknown",
        fromValue: previousValue,
        toValue: String(value)
      })
    );
    appendConfigSection(
      "tokens",
      localize("chat.tokens.header", "Context Size"),
      (value, enumLabel) => enumLabel ?? formatTokenCount(Number(value)),
      (value, previousValue) => this._telemetryService.publicLog2("chat.contextSizeChange", {
        model: model.metadata.vendor === "copilot" ? new TelemetryTrustedValue(modelIdentifier) : "unknown",
        fromValue: previousValue,
        toValue: String(value)
      })
    );
    return items;
  }
};
ModelPickerConfiguration = __decorateClass([
  __decorateParam(1, IActionWidgetService),
  __decorateParam(2, ITelemetryService)
], ModelPickerConfiguration);
export {
  ModelPickerConfiguration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXG1vZGVsUGlja2VyXFxtb2RlbFBpY2tlckNvbmZpZ3VyYXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJQW5jaG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEFuY2hvclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF5b3V0LmpzJztcbmltcG9ydCB7IGZvcm1hdFRva2VuQ291bnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25MaXN0SXRlbUtpbmQsIElBY3Rpb25MaXN0SGVhZGVyTGluaywgSUFjdGlvbkxpc3RJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXREcm9wZG93bi5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IHdpdGhDaGF0SW5wdXRQaWNrZXJNb3Rpb24gfSBmcm9tICcuLi9jaGF0SW5wdXRQaWNrZXJBY3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IElNb2RlbENvbmZpZ3VyYXRpb25BY2Nlc3MgfSBmcm9tICcuL21vZGVsUGlja2VyQWN0aW9uSXRlbS5qcyc7XG5cbnR5cGUgQ2hhdFRoaW5raW5nRWZmb3J0Q2hhbmdlQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnbHJhbW9zMTUnO1xuXHRjb21tZW50OiAnUmVwb3J0aW5nIHdoZW4gYSBtb2RlbCBjb25maWd1cmF0aW9uIHZhbHVlIChlLmcuIHRoaW5raW5nIGVmZm9ydCwgb3IgdGhlIEF1dG8gcm91dGluZyB0aWVyKSBpcyBjaGFuZ2VkJztcblx0bW9kZWw6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbW9kZWwgdGhlIGNvbmZpZ3VyYXRpb24gd2FzIGNoYW5nZWQgZm9yJyB9O1xuXHRwcm9wZXJ0eTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBmaXJzdC1wYXJ0eSBjb25maWd1cmF0aW9uIHByb3BlcnR5IHRoYXQgd2FzIGNoYW5nZWQgKHJlYXNvbmluZ0VmZm9ydCwgb3IgdGllciBmb3IgdGhlIEF1dG8gbW9kZWwpOyBcInVua25vd25cIiBmb3IgdGhpcmQtcGFydHkgcHJvdmlkZXJzLCB3aGljaCBjaG9vc2UgdGhlaXIgb3duIGtleXMnIH07XG5cdGZyb21WYWx1ZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBwcmV2aW91cyB2YWx1ZSBvZiB0aGUgY29uZmlndXJhdGlvbiBwcm9wZXJ0eScgfTtcblx0dG9WYWx1ZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBuZXcgdmFsdWUgb2YgdGhlIGNvbmZpZ3VyYXRpb24gcHJvcGVydHknIH07XG59O1xuXG50eXBlIENoYXRUaGlua2luZ0VmZm9ydENoYW5nZUV2ZW50ID0ge1xuXHRtb2RlbDogc3RyaW5nIHwgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlPHN0cmluZz47XG5cdHByb3BlcnR5OiBzdHJpbmc7XG5cdGZyb21WYWx1ZTogc3RyaW5nO1xuXHR0b1ZhbHVlOiBzdHJpbmc7XG59O1xuXG50eXBlIENoYXRDb250ZXh0U2l6ZUNoYW5nZUNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2xyYW1vczE1Jztcblx0Y29tbWVudDogJ1JlcG9ydGluZyB3aGVuIHRoZSBjb250ZXh0IHdpbmRvdyBzaXplIGlzIGNoYW5nZWQnO1xuXHRtb2RlbDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBtb2RlbCB0aGUgY29udGV4dCBzaXplIHdhcyBjaGFuZ2VkIGZvcicgfTtcblx0ZnJvbVZhbHVlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHByZXZpb3VzIGNvbnRleHQgc2l6ZSB2YWx1ZScgfTtcblx0dG9WYWx1ZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBuZXcgY29udGV4dCBzaXplIHZhbHVlJyB9O1xufTtcblxudHlwZSBDaGF0Q29udGV4dFNpemVDaGFuZ2VFdmVudCA9IHtcblx0bW9kZWw6IHN0cmluZyB8IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZTxzdHJpbmc+O1xuXHRmcm9tVmFsdWU6IHN0cmluZztcblx0dG9WYWx1ZTogc3RyaW5nO1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBJTW9kZWxQaWNrZXJDb25maWd1cmF0aW9uSG9zdCB7XG5cdHJlYWRvbmx5IGdldFNlbGVjdGVkTW9kZWw6ICgpID0+IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZ2V0Q29uZmlndXJhdGlvbkFjY2VzczogKCkgPT4gSU1vZGVsQ29uZmlndXJhdGlvbkFjY2Vzcztcblx0cmVhZG9ubHkgaXNEaXNhYmxlZDogKCkgPT4gYm9vbGVhbjtcblx0cmVhZG9ubHkgc2hvdWxkU2hvd0NhY2hlQnJlYWtIaW50OiAoKSA9PiBib29sZWFuO1xuXHRyZWFkb25seSBnZXRDYWNoZUJyZWFrTGVhcm5Nb3JlTGluazogKCkgPT4gSUFjdGlvbkxpc3RIZWFkZXJMaW5rIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBkaXNtaXNzQ2FjaGVCcmVha0hpbnQ6ICgpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eT86ICh2aXNpYmxlOiBib29sZWFuKSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPjtcblx0cmVhZG9ubHkgZ2V0QWN0aW9uV2lkZ2V0Q29udGFpbmVyPzogKCkgPT4gSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGdldEFjdGlvbldpZGdldEFuY2hvcj86IChhbmNob3I6IEhUTUxFbGVtZW50KSA9PiBIVE1MRWxlbWVudCB8IElBbmNob3I7XG5cdHJlYWRvbmx5IGdldEFuY2hvclBvc2l0aW9uPzogKCkgPT4gQW5jaG9yUG9zaXRpb24gfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBNb2RlbFBpY2tlckNvbmZpZ3VyYXRpb24ge1xuXG5cdHByaXZhdGUgX3Nob3dSZXF1ZXN0SWQgPSAwO1xuXHRwcml2YXRlIF9hY3RpdmVCdXR0b246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hvc3Q6IElNb2RlbFBpY2tlckNvbmZpZ3VyYXRpb25Ib3N0LFxuXHRcdEBJQWN0aW9uV2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY3Rpb25XaWRnZXRTZXJ2aWNlOiBJQWN0aW9uV2lkZ2V0U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkgeyB9XG5cblx0cmVuZGVyQnV0dG9uKGJ1dHRvbjogSFRNTEVsZW1lbnQsIGNvbXBhY3Q6IGJvb2xlYW4sIG5vTW9kZWxzQXZhaWxhYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9ob3N0LmdldFNlbGVjdGVkTW9kZWwoKTtcblx0XHRjb25zdCBlZmZvcnRDb25maWcgPSB0aGlzLl9nZXRDb25maWdQcm9wZXJ0eSgnbmF2aWdhdGlvbicpO1xuXHRcdGNvbnN0IHRva2Vuc0NvbmZpZyA9IHRoaXMuX2dldENvbmZpZ1Byb3BlcnR5KCd0b2tlbnMnKTtcblx0XHRpZiAoIW1vZGVsIHx8IG5vTW9kZWxzQXZhaWxhYmxlIHx8ICghZWZmb3J0Q29uZmlnICYmICF0b2tlbnNDb25maWcpKSB7XG5cdFx0XHRidXR0b24uc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsYWJlbFBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGFyaWFQYXJ0czogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAoZWZmb3J0Q29uZmlnICYmIGVmZm9ydENvbmZpZy52YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBlbnVtSW5kZXggPSBlZmZvcnRDb25maWcuc2NoZW1hLmVudW0/LmluZGV4T2YoZWZmb3J0Q29uZmlnLnZhbHVlKSA/PyAtMTtcblx0XHRcdGNvbnN0IGVmZm9ydExhYmVsID0gZW51bUluZGV4ID49IDAgJiYgZWZmb3J0Q29uZmlnLnNjaGVtYS5lbnVtSXRlbUxhYmVscz8uW2VudW1JbmRleF1cblx0XHRcdFx0PyBlZmZvcnRDb25maWcuc2NoZW1hLmVudW1JdGVtTGFiZWxzW2VudW1JbmRleF1cblx0XHRcdFx0OiBTdHJpbmcoZWZmb3J0Q29uZmlnLnZhbHVlKTtcblx0XHRcdGxhYmVsUGFydHMucHVzaChlZmZvcnRMYWJlbCk7XG5cdFx0XHQvLyBUaGUgZ3JvdXAgaXMgZ2VuZXJpYywgc28gcHJvZHVjZXJzIG5hbWUgaXQ6IENvcGlsb3QncyBBdXRvIG1vZGVsIHVzZXMgaXRcblx0XHRcdC8vIGZvciBcIlRpZXJcIiB3aGlsZSByZWd1bGFyIG1vZGVscyB1c2UgaXQgZm9yIHRoaW5raW5nIGVmZm9ydC5cblx0XHRcdGFyaWFQYXJ0cy5wdXNoKGVmZm9ydENvbmZpZy5zY2hlbWEudGl0bGVcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5uYXZpZ2F0aW9uQXJpYUxhYmVsJywgXCJ7MH06IHsxfVwiLCBlZmZvcnRDb25maWcuc2NoZW1hLnRpdGxlLCBlZmZvcnRMYWJlbClcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5lZmZvcnRBcmlhTGFiZWwnLCBcIlRoaW5raW5nIEVmZm9ydDogezB9XCIsIGVmZm9ydExhYmVsKSk7XG5cdFx0fVxuXHRcdGlmICh0b2tlbnNDb25maWcgJiYgdG9rZW5zQ29uZmlnLnZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IGVudW1JbmRleCA9IHRva2Vuc0NvbmZpZy5zY2hlbWEuZW51bT8uaW5kZXhPZih0b2tlbnNDb25maWcudmFsdWUpID8/IC0xO1xuXHRcdFx0Y29uc3QgdG9rZW5zTGFiZWwgPSBlbnVtSW5kZXggPj0gMCAmJiB0b2tlbnNDb25maWcuc2NoZW1hLmVudW1JdGVtTGFiZWxzPy5bZW51bUluZGV4XVxuXHRcdFx0XHQ/IHRva2Vuc0NvbmZpZy5zY2hlbWEuZW51bUl0ZW1MYWJlbHNbZW51bUluZGV4XVxuXHRcdFx0XHQ6IGZvcm1hdFRva2VuQ291bnQoTnVtYmVyKHRva2Vuc0NvbmZpZy52YWx1ZSkpO1xuXHRcdFx0bGFiZWxQYXJ0cy5wdXNoKHRva2Vuc0xhYmVsKTtcblx0XHRcdGFyaWFQYXJ0cy5wdXNoKGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLnRva2Vuc0FyaWFMYWJlbCcsIFwiQ29udGV4dCBTaXplOiB7MH1cIiwgdG9rZW5zTGFiZWwpKTtcblx0XHR9XG5cblx0XHRpZiAoIWxhYmVsUGFydHMubGVuZ3RoKSB7XG5cdFx0XHQvLyBGaXJzdC1wYXJ0eSBwcm9kdWNlcnMgYWx3YXlzIHN1cHBseSBhIGRlZmF1bHQsIGJ1dCBjb25maWd1cmF0aW9uIHNjaGVtYXMgY2FuIGFsc28gY29tZVxuXHRcdFx0Ly8gZnJvbSB0aGlyZC1wYXJ0eSBleHRlbnNpb25zIHZpYSB0aGUgTE0gQVBJLiBGYWxsIGJhY2sgdG8gYSBnZW5lcmljIGxhYmVsIHJhdGhlciB0aGFuXG5cdFx0XHQvLyBoaWRpbmcgdGhlIGJ1dHRvbiwgc28gdGhlIGNvbmZpZ3VyYXRpb24gc3RheXMgcmVhY2hhYmxlLlxuXHRcdFx0Y29uc3QgZmFsbGJhY2tMYWJlbCA9IGVmZm9ydENvbmZpZz8uc2NoZW1hLnRpdGxlID8/IHRva2Vuc0NvbmZpZz8uc2NoZW1hLnRpdGxlID8/IGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLmNvbmZpZ3VyZUxhYmVsJywgXCJDb25maWd1cmVcIik7XG5cdFx0XHRsYWJlbFBhcnRzLnB1c2goZmFsbGJhY2tMYWJlbCk7XG5cdFx0XHRhcmlhUGFydHMucHVzaChmYWxsYmFja0xhYmVsKTtcblx0XHR9XG5cblx0XHRidXR0b24uc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdGJ1dHRvbi5hcmlhTGFiZWwgPSBhcmlhUGFydHMuam9pbignLCAnKSB8fCBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5jb25maWdUb29sdGlwJywgXCJDb25maWd1cmUgTW9kZWxcIik7XG5cdFx0aWYgKGNvbXBhY3QpIHtcblx0XHRcdC8vIENoYXQgaW5wdXQgaXMgY29tcGFjdDoga2VlcCBhIHNsaWRlcnMgY29udHJvbCBuZXh0IHRvIHRoZSBtb2RlbCBuYW1lXG5cdFx0XHQvLyBpbnN0ZWFkIG9mIGhpZGluZyB0aGlua2luZy1kZXB0aCAvIGNvbnRleHQtc2l6ZSBjb25maWd1cmF0aW9uLlxuXHRcdFx0ZG9tLnJlc2V0KGJ1dHRvbiwgcmVuZGVySWNvbihDb2RpY29uLnNldHRpbmdzKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGRvbS5yZXNldChidXR0b24sIGRvbS4kKCdzcGFuLmNoYXQtaW5wdXQtcGlja2VyLWxhYmVsJywgdW5kZWZpbmVkLCBsYWJlbFBhcnRzLmpvaW4oJyAnKSkpO1xuXHR9XG5cblx0c2hvdyhidXR0b246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkLCBmb2N1c0dyb3VwPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2hvc3QuaXNEaXNhYmxlZCgpIHx8ICFidXR0b24gfHwgIXRoaXMuX2hvc3QuZ2V0U2VsZWN0ZWRNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChidXR0b24uZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykgPT09ICd0cnVlJykge1xuXHRcdFx0dGhpcy5fc2hvd1JlcXVlc3RJZCsrO1xuXHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5fYnVpbGRJdGVtcygpO1xuXHRcdGlmICghaXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJldmlvdXNseUZvY3VzZWRFbGVtZW50ID0gZG9tLmdldEFjdGl2ZUVsZW1lbnQoKTtcblx0XHRjb25zdCBzaG93UmVxdWVzdElkID0gKyt0aGlzLl9zaG93UmVxdWVzdElkO1xuXHRcdGNvbnN0IGRlbGVnYXRlID0ge1xuXHRcdFx0b25TZWxlY3Q6IGFzeW5jIChhY3Rpb246IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbikgPT4ge1xuXHRcdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmZvY3VzSXRlbUJ5SWQoYWN0aW9uLmlkKTtcblx0XHRcdFx0YXdhaXQgYWN0aW9uLnJ1bigpO1xuXHRcdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLnVwZGF0ZUl0ZW1zKHRoaXMuX2J1aWxkSXRlbXMoKSwgYWN0aW9uLmlkKTtcblx0XHRcdH0sXG5cdFx0XHRvbkhpZGU6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fc2hvd1JlcXVlc3RJZCsrO1xuXHRcdFx0XHRpZiAodGhpcy5fYWN0aXZlQnV0dG9uID09PSBidXR0b24pIHtcblx0XHRcdFx0XHR0aGlzLl9hY3RpdmVCdXR0b24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXHRcdFx0XHRjb25zdCB2aXNpYmlsaXR5Q2hhbmdlID0gdGhpcy5faG9zdC5vbkRpZENoYW5nZVZpc2liaWxpdHk/LihmYWxzZSk7XG5cdFx0XHRcdGlmICh2aXNpYmlsaXR5Q2hhbmdlKSB7XG5cdFx0XHRcdFx0dm9pZCB2aXNpYmlsaXR5Q2hhbmdlLmNhdGNoKCgpID0+IHsgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGRvbS5pc0hUTUxFbGVtZW50KHByZXZpb3VzbHlGb2N1c2VkRWxlbWVudCkpIHtcblx0XHRcdFx0XHRwcmV2aW91c2x5Rm9jdXNlZEVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ3RydWUnKTtcblx0XHR0aGlzLl9hY3RpdmVCdXR0b24gPSBidXR0b247XG5cdFx0Y29uc3Qgc2hvd0NhY2hlQnJlYWtIaW50ID0gdGhpcy5faG9zdC5zaG91bGRTaG93Q2FjaGVCcmVha0hpbnQoKTtcblx0XHRjb25zdCBzaG93QWN0aW9uV2lkZ2V0ID0gKCkgPT4ge1xuXHRcdFx0aWYgKHNob3dSZXF1ZXN0SWQgIT09IHRoaXMuX3Nob3dSZXF1ZXN0SWQgfHwgYnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpICE9PSAndHJ1ZScpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5zaG93KFxuXHRcdFx0XHQnQ2hhdE1vZGVsQ29uZmlnUGlja2VyJyxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdGl0ZW1zLFxuXHRcdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdFx0dGhpcy5faG9zdC5nZXRBY3Rpb25XaWRnZXRBbmNob3I/LihidXR0b24pID8/IGJ1dHRvbixcblx0XHRcdFx0dGhpcy5faG9zdC5nZXRBY3Rpb25XaWRnZXRDb250YWluZXI/LigpLFxuXHRcdFx0XHRbXSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlzQ2hlY2tlZDogZWxlbWVudCA9PiBlbGVtZW50LmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24gPyAhIWVsZW1lbnQuaXRlbT8uY2hlY2tlZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRnZXRSb2xlOiBlbGVtZW50ID0+IGVsZW1lbnQua2luZCA9PT0gQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbiA/ICdtZW51aXRlbXJhZGlvJyBhcyBjb25zdCA6ICdzZXBhcmF0b3InIGFzIGNvbnN0LFxuXHRcdFx0XHRcdGdldFdpZGdldFJvbGU6ICgpID0+ICdtZW51JyBhcyBjb25zdCxcblx0XHRcdFx0fSxcblx0XHRcdFx0d2l0aENoYXRJbnB1dFBpY2tlck1vdGlvbih7XG5cdFx0XHRcdFx0aGVhZGVyVGV4dDogc2hvd0NhY2hlQnJlYWtIaW50ID8gbG9jYWxpemUoJ2NoYXQuY29uZmlnLmNhY2hlQnJlYWtIaW50JywgXCJDaGFuZ2luZyB0aGVzZSBvcHRpb25zIG1pZC1zZXNzaW9uIHJlc2V0cyB0aGUgcHJvbXB0IGNhY2hlIGFuZCBtYXkgaW5jcmVhc2UgY29zdC5cIikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0aGVhZGVySWNvbjogc2hvd0NhY2hlQnJlYWtIaW50ID8gQ29kaWNvbi5pbmZvIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGhlYWRlckxpbms6IHNob3dDYWNoZUJyZWFrSGludCA/IHRoaXMuX2hvc3QuZ2V0Q2FjaGVCcmVha0xlYXJuTW9yZUxpbmsoKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRoZWFkZXJEaXNtaXNzOiBzaG93Q2FjaGVCcmVha0hpbnQgPyB0aGlzLl9ob3N0LmRpc21pc3NDYWNoZUJyZWFrSGludCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRyZXNlcnZlU3VibWVudVNwYWNlOiBmYWxzZSxcblx0XHRcdFx0XHRhbmNob3JQb3NpdGlvbjogdGhpcy5faG9zdC5nZXRBbmNob3JQb3NpdGlvbj8uKCksXG5cdFx0XHRcdH0pLFxuXHRcdFx0KTtcblxuXHRcdFx0aWYgKGZvY3VzR3JvdXApIHtcblx0XHRcdFx0Y29uc3QgZ3JvdXBJdGVtID0gaXRlbXMuZmluZChpdGVtID0+IGl0ZW0ua2luZCA9PT0gQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbiAmJiBpdGVtLml0ZW0/LmlkPy5zdGFydHNXaXRoKGAke2ZvY3VzR3JvdXB9LmApKTtcblx0XHRcdFx0aWYgKGdyb3VwSXRlbT8ua2luZCA9PT0gQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbiAmJiBncm91cEl0ZW0uaXRlbSkge1xuXHRcdFx0XHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2UuZm9jdXNJdGVtQnlJZChncm91cEl0ZW0uaXRlbS5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHZpc2liaWxpdHlDaGFuZ2UgPSB0aGlzLl9ob3N0Lm9uRGlkQ2hhbmdlVmlzaWJpbGl0eT8uKHRydWUpO1xuXHRcdGlmICh2aXNpYmlsaXR5Q2hhbmdlKSB7XG5cdFx0XHR2b2lkIHZpc2liaWxpdHlDaGFuZ2UudGhlbihzaG93QWN0aW9uV2lkZ2V0LCAoKSA9PiB7XG5cdFx0XHRcdGlmIChzaG93UmVxdWVzdElkICE9PSB0aGlzLl9zaG93UmVxdWVzdElkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3Nob3dSZXF1ZXN0SWQrKztcblx0XHRcdFx0aWYgKHRoaXMuX2FjdGl2ZUJ1dHRvbiA9PT0gYnV0dG9uKSB7XG5cdFx0XHRcdFx0dGhpcy5fYWN0aXZlQnV0dG9uID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAnZmFsc2UnKTtcblx0XHRcdFx0Y29uc3QgaGlkZVZpc2liaWxpdHlDaGFuZ2UgPSB0aGlzLl9ob3N0Lm9uRGlkQ2hhbmdlVmlzaWJpbGl0eT8uKGZhbHNlKTtcblx0XHRcdFx0aWYgKGhpZGVWaXNpYmlsaXR5Q2hhbmdlKSB7XG5cdFx0XHRcdFx0dm9pZCBoaWRlVmlzaWJpbGl0eUNoYW5nZS5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChkb20uaXNIVE1MRWxlbWVudChwcmV2aW91c2x5Rm9jdXNlZEVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0cHJldmlvdXNseUZvY3VzZWRFbGVtZW50LmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzaG93QWN0aW9uV2lkZ2V0KCk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zaG93UmVxdWVzdElkKys7XG5cdFx0aWYgKHRoaXMuX2FjdGl2ZUJ1dHRvbikge1xuXHRcdFx0dGhpcy5fYWN0aXZlQnV0dG9uID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldENvbmZpZ1Byb3BlcnR5KGdyb3VwOiBzdHJpbmcpIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2hvc3QuZ2V0U2VsZWN0ZWRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNjaGVtYSA9IG1vZGVsLm1ldGFkYXRhLmNvbmZpZ3VyYXRpb25TY2hlbWE7XG5cdFx0aWYgKCFzY2hlbWE/LnByb3BlcnRpZXMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25BY2Nlc3MgPSB0aGlzLl9ob3N0LmdldENvbmZpZ3VyYXRpb25BY2Nlc3MoKTtcblx0XHRjb25zdCBjdXJyZW50Q29uZmlnID0gY29uZmlndXJhdGlvbkFjY2Vzcy5nZXRNb2RlbENvbmZpZ3VyYXRpb24obW9kZWwuaWRlbnRpZmllcikgPz8ge307XG5cdFx0Zm9yIChjb25zdCBba2V5LCBwcm9wU2NoZW1hXSBvZiBPYmplY3QuZW50cmllcyhzY2hlbWEucHJvcGVydGllcykpIHtcblx0XHRcdGlmIChwcm9wU2NoZW1hLmdyb3VwICE9PSBncm91cCB8fCAhcHJvcFNjaGVtYS5lbnVtPy5sZW5ndGgpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBrZXksIHZhbHVlOiBjdXJyZW50Q29uZmlnW2tleV0gPz8gcHJvcFNjaGVtYS5kZWZhdWx0LCBzY2hlbWE6IHByb3BTY2hlbWEgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkSXRlbXMoKTogSUFjdGlvbkxpc3RJdGVtPElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbj5bXSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9ob3N0LmdldFNlbGVjdGVkTW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWxJZGVudGlmaWVyID0gbW9kZWwuaWRlbnRpZmllcjtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uQWNjZXNzID0gdGhpcy5faG9zdC5nZXRDb25maWd1cmF0aW9uQWNjZXNzKCk7XG5cdFx0Y29uc3QgaXRlbXM6IElBY3Rpb25MaXN0SXRlbTxJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24+W10gPSBbXTtcblx0XHRjb25zdCBkZWZhdWx0TGFiZWwgPSBsb2NhbGl6ZSgnbW9kZWxzLmNvbmZpZ0RlZmF1bHQnLCBcIkRlZmF1bHRcIik7XG5cdFx0Y29uc3QgYXBwZW5kQ29uZmlnU2VjdGlvbiA9IChcblx0XHRcdGdyb3VwOiBzdHJpbmcsXG5cdFx0XHRmYWxsYmFja0hlYWRlckxhYmVsOiBzdHJpbmcsXG5cdFx0XHRmb3JtYXRWYWx1ZUxhYmVsOiAodmFsdWU6IHVua25vd24sIGVudW1MYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiBzdHJpbmcsXG5cdFx0XHRsb2dDaGFuZ2U6ICh2YWx1ZTogdW5rbm93biwgcHJldmlvdXNWYWx1ZTogc3RyaW5nLCBrZXk6IHN0cmluZykgPT4gdm9pZCxcblx0XHQpOiB2b2lkID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX2dldENvbmZpZ1Byb3BlcnR5KGdyb3VwKTtcblx0XHRcdGlmICghY29uZmlnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHByZXZpb3VzVmFsdWUgPSBTdHJpbmcoY29uZmlnLnZhbHVlID8/ICcnKTtcblx0XHRcdGNvbnN0IGVudW1WYWx1ZXMgPSBjb25maWcuc2NoZW1hLmVudW0gPz8gW107XG5cdFx0XHRpZiAoaXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdGl0ZW1zLnB1c2goeyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yIH0pO1xuXHRcdFx0fVxuXHRcdFx0aXRlbXMucHVzaCh7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5IZWFkZXIsIGxhYmVsOiBjb25maWcuc2NoZW1hLnRpdGxlID8/IGZhbGxiYWNrSGVhZGVyTGFiZWwgfSk7XG5cdFx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgZW51bVZhbHVlcy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBlbnVtVmFsdWVzW2luZGV4XTtcblx0XHRcdFx0Y29uc3QgaXNEZWZhdWx0ID0gdmFsdWUgPT09IGNvbmZpZy5zY2hlbWEuZGVmYXVsdDtcblx0XHRcdFx0Y29uc3QgZGlzcGxheUxhYmVsID0gZm9ybWF0VmFsdWVMYWJlbCh2YWx1ZSwgY29uZmlnLnNjaGVtYS5lbnVtSXRlbUxhYmVscz8uW2luZGV4XSk7XG5cdFx0XHRcdGNvbnN0IGVudW1EZXNjcmlwdGlvbiA9IGNvbmZpZy5zY2hlbWEuZW51bURlc2NyaXB0aW9ucz8uW2luZGV4XTtcblx0XHRcdFx0Y29uc3QgYXJpYURlc2NyaXB0aW9uUGFydHMgPSBbaXNEZWZhdWx0ID8gZGVmYXVsdExhYmVsIDogdW5kZWZpbmVkLCBlbnVtRGVzY3JpcHRpb25dLmZpbHRlcigocGFydCk6IHBhcnQgaXMgc3RyaW5nID0+ICEhcGFydCk7XG5cdFx0XHRcdGNvbnN0IGNoZWNrZWQgPSBjb25maWcudmFsdWUgPT09IHZhbHVlO1xuXHRcdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0XHRpZDogYCR7Z3JvdXB9LiR7dmFsdWV9YCxcblx0XHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRjaGVja2VkLFxuXHRcdFx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IGVudW1EZXNjcmlwdGlvbiA/PyAnJyxcblx0XHRcdFx0XHRcdGxhYmVsOiBkaXNwbGF5TGFiZWwsXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0bG9nQ2hhbmdlKHZhbHVlLCBwcmV2aW91c1ZhbHVlLCBjb25maWcua2V5KTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25BY2Nlc3Muc2V0TW9kZWxDb25maWd1cmF0aW9uKG1vZGVsSWRlbnRpZmllciwgeyBbY29uZmlnLmtleV06IHZhbHVlIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdFx0XHRjbGFzc05hbWU6ICdjaGF0LW1vZGVsLXBpY2tlci1jb25maWctb3B0aW9uJyxcblx0XHRcdFx0XHRsYWJlbDogZGlzcGxheUxhYmVsLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBpc0RlZmF1bHQgPyBkZWZhdWx0TGFiZWwgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0YXJpYURlc2NyaXB0aW9uOiBhcmlhRGVzY3JpcHRpb25QYXJ0cy5sZW5ndGggPyBhcmlhRGVzY3JpcHRpb25QYXJ0cy5qb2luKCcsICcpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGhvdmVyOiBlbnVtRGVzY3JpcHRpb24gPyB7IGNvbnRlbnQ6IGVudW1EZXNjcmlwdGlvbiB9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogVGhlbWVJY29uLmZyb21JZChjaGVja2VkID8gQ29kaWNvbi5jaGVjay5pZCA6IENvZGljb24uYmxhbmsuaWQpIH0sXG5cdFx0XHRcdFx0aGlkZUljb246IGZhbHNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0YXBwZW5kQ29uZmlnU2VjdGlvbihcblx0XHRcdCduYXZpZ2F0aW9uJyxcblx0XHRcdGxvY2FsaXplKCdjaGF0LmVmZm9ydC5oZWFkZXInLCBcIlRoaW5raW5nIEVmZm9ydFwiKSxcblx0XHRcdCh2YWx1ZSwgZW51bUxhYmVsKSA9PiBlbnVtTGFiZWwgPz8gU3RyaW5nKHZhbHVlKSxcblx0XHRcdCh2YWx1ZSwgcHJldmlvdXNWYWx1ZSwga2V5KSA9PiB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdFRoaW5raW5nRWZmb3J0Q2hhbmdlRXZlbnQsIENoYXRUaGlua2luZ0VmZm9ydENoYW5nZUNsYXNzaWZpY2F0aW9uPignY2hhdC50aGlua2luZ0VmZm9ydENoYW5nZScsIHtcblx0XHRcdFx0bW9kZWw6IG1vZGVsLm1ldGFkYXRhLnZlbmRvciA9PT0gJ2NvcGlsb3QnID8gbmV3IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZShtb2RlbElkZW50aWZpZXIpIDogJ3Vua25vd24nLFxuXHRcdFx0XHQvLyBUaGlyZC1wYXJ0eSBwcm92aWRlcnMgY2hvb3NlIHRoZWlyIG93biBwcm9wZXJ0eSBrZXlzLCBzbyBvbmx5XG5cdFx0XHRcdC8vIGZpcnN0LXBhcnR5IG9uZXMgYXJlIHJlcG9ydGVkIGFzIGEgY29udHJvbGxlZCB2b2NhYnVsYXJ5LlxuXHRcdFx0XHRwcm9wZXJ0eTogbW9kZWwubWV0YWRhdGEudmVuZG9yID09PSAnY29waWxvdCcgPyBrZXkgOiAndW5rbm93bicsXG5cdFx0XHRcdGZyb21WYWx1ZTogcHJldmlvdXNWYWx1ZSxcblx0XHRcdFx0dG9WYWx1ZTogU3RyaW5nKHZhbHVlKSxcblx0XHRcdH0pLFxuXHRcdCk7XG5cdFx0YXBwZW5kQ29uZmlnU2VjdGlvbihcblx0XHRcdCd0b2tlbnMnLFxuXHRcdFx0bG9jYWxpemUoJ2NoYXQudG9rZW5zLmhlYWRlcicsIFwiQ29udGV4dCBTaXplXCIpLFxuXHRcdFx0KHZhbHVlLCBlbnVtTGFiZWwpID0+IGVudW1MYWJlbCA/PyBmb3JtYXRUb2tlbkNvdW50KE51bWJlcih2YWx1ZSkpLFxuXHRcdFx0KHZhbHVlLCBwcmV2aW91c1ZhbHVlKSA9PiB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdENvbnRleHRTaXplQ2hhbmdlRXZlbnQsIENoYXRDb250ZXh0U2l6ZUNoYW5nZUNsYXNzaWZpY2F0aW9uPignY2hhdC5jb250ZXh0U2l6ZUNoYW5nZScsIHtcblx0XHRcdFx0bW9kZWw6IG1vZGVsLm1ldGFkYXRhLnZlbmRvciA9PT0gJ2NvcGlsb3QnID8gbmV3IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZShtb2RlbElkZW50aWZpZXIpIDogJ3Vua25vd24nLFxuXHRcdFx0XHRmcm9tVmFsdWU6IHByZXZpb3VzVmFsdWUsXG5cdFx0XHRcdHRvVmFsdWU6IFN0cmluZyh2YWx1ZSksXG5cdFx0XHR9KSxcblx0XHQpO1xuXG5cdFx0cmV0dXJuIGl0ZW1zO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUVyQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFFeEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBa0U7QUFDM0UsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxpQ0FBaUM7QUE4Q25DLElBQU0sMkJBQU4sTUFBK0I7QUFBQSxFQUtyQyxZQUNrQixPQUNzQixzQkFDSCxtQkFDbkM7QUFIZ0I7QUFDc0I7QUFDSDtBQU5yQyxTQUFRLGlCQUFpQjtBQUFBLEVBT3JCO0FBQUEsRUFFSixhQUFhLFFBQXFCLFNBQWtCLG1CQUFrQztBQUNyRixVQUFNLFFBQVEsS0FBSyxNQUFNLGlCQUFpQjtBQUMxQyxVQUFNLGVBQWUsS0FBSyxtQkFBbUIsWUFBWTtBQUN6RCxVQUFNLGVBQWUsS0FBSyxtQkFBbUIsUUFBUTtBQUNyRCxRQUFJLENBQUMsU0FBUyxxQkFBc0IsQ0FBQyxnQkFBZ0IsQ0FBQyxjQUFlO0FBQ3BFLGFBQU8sTUFBTSxVQUFVO0FBQ3ZCO0FBQUEsSUFDRDtBQUVBLFVBQU0sYUFBdUIsQ0FBQztBQUM5QixVQUFNLFlBQXNCLENBQUM7QUFDN0IsUUFBSSxnQkFBZ0IsYUFBYSxVQUFVLFFBQVc7QUFDckQsWUFBTSxZQUFZLGFBQWEsT0FBTyxNQUFNLFFBQVEsYUFBYSxLQUFLLEtBQUs7QUFDM0UsWUFBTSxjQUFjLGFBQWEsS0FBSyxhQUFhLE9B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SUFBSSxHQUFHLEtBQUssSUFBSSxLQUFLO0FBQUEsWUFDckIsU0FBUztBQUFBLFlBQ1Q7QUFBQSxZQUNBLE9BQU87QUFBQSxZQUNQLFNBQVMsbUJBQW1CO0FBQUEsWUFDNUIsT0FBTztBQUFBLFlBQ1AsS0FBSyxNQUFNO0FBQ1Ysd0JBQVUsT0FBTyxlQUFlLE9BQU8sR0FBRztBQUMxQyxxQkFBTyxvQkFBb0Isc0JBQXNCLGlCQUFpQixFQUFFLENBQUMsT0FBTyxHQUFHLEdBQUcsTUFBTSxDQUFDO0FBQUEsWUFDMUY7QUFBQSxVQUNEO0FBQUEsVUFDQSxNQUFNLG1CQUFtQjtBQUFBLFVBQ3pCLFdBQVc7QUFBQSxVQUNYLE9BQU87QUFBQSxVQUNQLGFBQWEsWUFBWSxlQUFlO0FBQUEsVUFDeEMsaUJBQWlCLHFCQUFxQixTQUFTLHFCQUFxQixLQUFLLElBQUksSUFBSTtBQUFBLFVBQ2pGLE9BQU8sa0JBQWtCLEVBQUUsU0FBUyxnQkFBZ0IsSUFBSTtBQUFBLFVBQ3hELE9BQU8sRUFBRSxPQUFPLElBQUksTUFBTSxVQUFVLE9BQU8sVUFBVSxRQUFRLE1BQU0sS0FBSyxRQUFRLE1BQU0sRUFBRSxFQUFFO0FBQUEsVUFDMUYsVUFBVTtBQUFBLFFBQ1gsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBRUE7QUFBQSxNQUNDO0FBQUEsTUFDQSxTQUFTLHNCQUFzQixpQkFBaUI7QUFBQSxNQUNoRCxDQUFDLE9BQU8sY0FBYyxhQUFhLE9BQU8sS0FBSztBQUFBLE1BQy9DLENBQUMsT0FBTyxlQUFlLFFBQVEsS0FBSyxrQkFBa0IsV0FBa0YsNkJBQTZCO0FBQUEsUUFDcEssT0FBTyxNQUFNLFNBQVMsV0FBVyxZQUFZLElBQUksc0JBQXNCLGVBQWUsSUFBSTtBQUFBO0FBQUE7QUFBQSxRQUcxRixVQUFVLE1BQU0sU0FBUyxXQUFXLFlBQVksTUFBTTtBQUFBLFFBQ3RELFdBQVc7QUFBQSxRQUNYLFNBQVMsT0FBTyxLQUFLO0FBQUEsTUFDdEIsQ0FBQztBQUFBLElBQ0Y7QUFDQTtBQUFBLE1BQ0M7QUFBQSxNQUNBLFNBQVMsc0JBQXNCLGNBQWM7QUFBQSxNQUM3QyxDQUFDLE9BQU8sY0FBYyxhQUFhLGlCQUFpQixPQUFPLEtBQUssQ0FBQztBQUFBLE1BQ2pFLENBQUMsT0FBTyxrQkFBa0IsS0FBSyxrQkFBa0IsV0FBNEUsMEJBQTBCO0FBQUEsUUFDdEosT0FBTyxNQUFNLFNBQVMsV0FBVyxZQUFZLElBQUksc0JBQXNCLGVBQWUsSUFBSTtBQUFBLFFBQzFGLFdBQVc7QUFBQSxRQUNYLFNBQVMsT0FBTyxLQUFLO0FBQUEsTUFDdEIsQ0FBQztBQUFBLElBQ0Y7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBblJhLDJCQUFOO0FBQUEsRUFPSjtBQUFBLEVBQ0E7QUFBQSxHQVJVOyIsCiAgIm5hbWVzIjogWyJ2aXNpYmlsaXR5Q2hhbmdlIl0KfQo=
