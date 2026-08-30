import assert from "assert";
import { AnchorPosition } from "../../../../../../../../base/common/layout.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../../base/test/common/utils.js";
import { ExtensionIdentifier } from "../../../../../../../../platform/extensions/common/extensions.js";
import { ActionListItemKind } from "../../../../../../../../platform/actionWidget/browser/actionList.js";
import { ModelPickerConfiguration } from "../../../../../browser/widget/input/modelPicker/modelPickerConfiguration.js";
function createModel(options) {
  return {
    identifier: "copilot/test-model",
    metadata: {
      extension: new ExtensionIdentifier("test.extension"),
      id: "test-model",
      name: "Test Model",
      vendor: "copilot",
      version: "1.0",
      family: "test",
      maxInputTokens: 128e3,
      maxOutputTokens: 4096,
      isDefaultForLocation: {},
      configurationSchema: {
        properties: {
          effort: {
            type: "string",
            group: "navigation",
            enum: ["low", "medium"],
            enumItemLabels: ["Low", "Medium"],
            enumDescriptions: ["Faster", "Balanced"],
            default: options?.omitEffortDefault ? void 0 : "low"
          },
          context: {
            type: "number",
            group: "tokens",
            enum: [32768, 65536],
            enumItemLabels: ["32K", "64K"],
            default: options?.omitContextDefault ? void 0 : 32768
          }
        }
      }
    }
  };
}
function createTierModel() {
  return {
    identifier: "copilot/auto",
    metadata: {
      extension: new ExtensionIdentifier("test.extension"),
      id: "auto",
      name: "Auto",
      vendor: "copilot",
      version: "1.0",
      family: "auto",
      maxInputTokens: 128e3,
      maxOutputTokens: 4096,
      isDefaultForLocation: {},
      configurationSchema: {
        properties: {
          tier: {
            type: "string",
            title: "Tier",
            group: "navigation",
            enum: ["eco", "balanced", "max"],
            enumItemLabels: ["Eco", "Balanced", "Max"],
            enumDescriptions: ["Cheaper models", "Balances capability and cost", "Most capable models"],
            default: "balanced"
          }
        }
      }
    }
  };
}
function render(model, configuration = {}) {
  const access = {
    getModelConfiguration: () => configuration,
    setModelConfiguration: async (_modelId, values) => {
      Object.assign(configuration, values);
    },
    getModelConfigurationActions: () => []
  };
  let shownItems = [];
  let shownOptions;
  const actionWidgetService = {
    show: (_id, _supportsPreview, items, _delegate, _anchor, _container, _actions, _accessibilityProvider, options) => {
      shownItems = items;
      shownOptions = options;
    },
    focusItemById: () => {
    },
    updateItems: () => {
    }
  };
  const controller = new ModelPickerConfiguration({
    getSelectedModel: () => model,
    getConfigurationAccess: () => access,
    isDisabled: () => false,
    shouldShowCacheBreakHint: () => false,
    getCacheBreakLearnMoreLink: () => void 0,
    dismissCacheBreakHint: () => {
    }
  }, actionWidgetService, { publicLog2: () => {
  } });
  const button = document.createElement("a");
  controller.renderButton(button, false, false);
  controller.show(button);
  return {
    label: button.textContent,
    ariaLabel: button.ariaLabel,
    listOptions: {
      reserveSubmenuSpace: shownOptions?.reserveSubmenuSpace
    },
    sections: shownItems.map((item) => item.kind === ActionListItemKind.Action ? {
      className: item.className,
      label: item.label,
      checked: item.item.checked,
      ariaDescription: item.ariaDescription
    } : { kind: item.kind, label: item.label })
  };
}
suite("ModelPickerConfiguration", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("renders the combined label and builds accessible option sections", () => {
    assert.deepStrictEqual(render(createModel(), { effort: "medium", context: 65536 }), {
      label: "Medium 64K",
      ariaLabel: "Thinking Effort: Medium, Context Size: 64K",
      listOptions: {
        reserveSubmenuSpace: false
      },
      sections: [
        { kind: ActionListItemKind.Header, label: "Thinking Effort" },
        { className: "chat-model-picker-config-option", label: "Low", checked: false, ariaDescription: "Default, Faster" },
        { className: "chat-model-picker-config-option", label: "Medium", checked: true, ariaDescription: "Balanced" },
        { kind: ActionListItemKind.Separator, label: void 0 },
        { kind: ActionListItemKind.Header, label: "Context Size" },
        { className: "chat-model-picker-config-option", label: "32K", checked: false, ariaDescription: "Default" },
        { className: "chat-model-picker-config-option", label: "64K", checked: true, ariaDescription: void 0 }
      ]
    });
  });
  test("renders the settings sliders icon in compact chat input", () => {
    const access = {
      getModelConfiguration: () => ({ effort: "medium", context: 65536 }),
      setModelConfiguration: async () => {
      },
      getModelConfigurationActions: () => []
    };
    const controller = new ModelPickerConfiguration({
      getSelectedModel: () => createModel(),
      getConfigurationAccess: () => access,
      isDisabled: () => false,
      shouldShowCacheBreakHint: () => false,
      getCacheBreakLearnMoreLink: () => void 0,
      dismissCacheBreakHint: () => {
      }
    }, { show() {
    }, focusItemById() {
    }, updateItems() {
    }, hide() {
    } }, { publicLog2: () => {
    } });
    const button = document.createElement("a");
    controller.renderButton(button, true, false);
    assert.notStrictEqual(button.style.display, "none");
    assert.ok(button.querySelector(".codicon-settings"));
    controller.dispose();
  });
  test("uses the host action widget placement and visibility lifecycle", () => {
    const model = createModel();
    const container = document.createElement("div");
    const button = document.createElement("a");
    const anchor = { x: 10, y: 20, width: 30, height: 1 };
    const visibility = [];
    let shownPlacement;
    let onHide;
    const actionWidgetService = {
      show: (_id, _supportsPreview, _items, delegate, shownAnchor, shownContainer, _actions, _accessibilityProvider, options) => {
        onHide = delegate.onHide;
        shownPlacement = {
          anchor: shownAnchor,
          container: shownContainer,
          anchorPosition: options.anchorPosition
        };
      },
      focusItemById: () => {
      },
      updateItems: () => {
      },
      hide: () => onHide?.()
    };
    const access = {
      getModelConfiguration: () => ({}),
      setModelConfiguration: async () => {
      },
      getModelConfigurationActions: () => []
    };
    const controller = new ModelPickerConfiguration({
      getSelectedModel: () => model,
      getConfigurationAccess: () => access,
      isDisabled: () => false,
      shouldShowCacheBreakHint: () => false,
      getCacheBreakLearnMoreLink: () => void 0,
      dismissCacheBreakHint: () => {
      },
      onDidChangeVisibility: (visible) => {
        visibility.push(visible);
      },
      getActionWidgetContainer: () => container,
      getActionWidgetAnchor: () => anchor,
      getAnchorPosition: () => AnchorPosition.BELOW
    }, actionWidgetService, { publicLog2: () => {
    } });
    controller.show(button);
    controller.show(button);
    controller.show(button);
    controller.dispose();
    assert.deepStrictEqual({
      shownPlacement,
      visibility
    }, {
      shownPlacement: {
        anchor,
        container,
        anchorPosition: AnchorPosition.BELOW
      },
      visibility: [true, false, true, false]
    });
  });
  test('omits an unresolved group from the label rather than rendering "undefined"', () => {
    assert.deepStrictEqual(render(createModel({ omitEffortDefault: true })), {
      label: "32K",
      ariaLabel: "Context Size: 32K",
      listOptions: {
        reserveSubmenuSpace: false
      },
      sections: [
        { kind: ActionListItemKind.Header, label: "Thinking Effort" },
        { className: "chat-model-picker-config-option", label: "Low", checked: false, ariaDescription: "Faster" },
        { className: "chat-model-picker-config-option", label: "Medium", checked: false, ariaDescription: "Balanced" },
        { kind: ActionListItemKind.Separator, label: void 0 },
        { kind: ActionListItemKind.Header, label: "Context Size" },
        { className: "chat-model-picker-config-option", label: "32K", checked: true, ariaDescription: "Default" },
        { className: "chat-model-picker-config-option", label: "64K", checked: false, ariaDescription: void 0 }
      ]
    });
  });
  test("falls back to a generic label when no group resolves a value", () => {
    const rendered = render(createModel({ omitEffortDefault: true, omitContextDefault: true }));
    assert.deepStrictEqual({ label: rendered.label, ariaLabel: rendered.ariaLabel }, {
      label: "Configure",
      ariaLabel: "Configure"
    });
  });
  test("names the navigation group after the schema title when one is given", () => {
    assert.deepStrictEqual(render(createTierModel(), { tier: "max" }), {
      label: "Max",
      ariaLabel: "Tier: Max",
      listOptions: {
        reserveSubmenuSpace: false
      },
      sections: [
        { kind: ActionListItemKind.Header, label: "Tier" },
        { className: "chat-model-picker-config-option", label: "Eco", checked: false, ariaDescription: "Cheaper models" },
        { className: "chat-model-picker-config-option", label: "Balanced", checked: false, ariaDescription: "Default, Balances capability and cost" },
        { className: "chat-model-picker-config-option", label: "Max", checked: true, ariaDescription: "Most capable models" }
      ]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXG1vZGVsUGlja2VyXFxtb2RlbFBpY2tlckNvbmZpZ3VyYXRpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IElBbmNob3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgQW5jaG9yUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXlvdXQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25MaXN0SXRlbUtpbmQsIElBY3Rpb25MaXN0SXRlbSwgSUFjdGlvbkxpc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXREcm9wZG93bi5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE1vZGVsUGlja2VyQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2lucHV0L21vZGVsUGlja2VyL21vZGVsUGlja2VyQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTW9kZWxDb25maWd1cmF0aW9uQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvaW5wdXQvbW9kZWxQaWNrZXIvbW9kZWxQaWNrZXJBY3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuXG4vKipcbiAqIEJ1aWxkcyBhIG1vZGVsIHdob3NlIHNjaGVtYSBhZHZlcnRpc2VzIGEgVGhpbmtpbmcgRWZmb3J0IGFuZCBhIENvbnRleHQgU2l6ZVxuICogZ3JvdXAuIEEgcHJvZHVjZXIgdGhhdCBjYW5ub3QgcmVzb2x2ZSBhIGRlZmF1bHQgbGVhdmVzIGl0IGB1bmRlZmluZWRgIChzZWVcbiAqIHRoZSBhZ2VudCBob3N0J3MgYHRoaW5raW5nTGV2ZWxgIHNjaGVtYSksIHNvIGVhY2ggZ3JvdXAncyBkZWZhdWx0IGlzXG4gKiBvbWl0dGFibGUgdG8gY292ZXIgdGhhdCBjYXNlLlxuICovXG5mdW5jdGlvbiBjcmVhdGVNb2RlbChvcHRpb25zPzogeyByZWFkb25seSBvbWl0RWZmb3J0RGVmYXVsdD86IGJvb2xlYW47IHJlYWRvbmx5IG9taXRDb250ZXh0RGVmYXVsdD86IGJvb2xlYW4gfSk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB7XG5cdHJldHVybiB7XG5cdFx0aWRlbnRpZmllcjogJ2NvcGlsb3QvdGVzdC1tb2RlbCcsXG5cdFx0bWV0YWRhdGE6IHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QuZXh0ZW5zaW9uJyksXG5cdFx0XHRpZDogJ3Rlc3QtbW9kZWwnLFxuXHRcdFx0bmFtZTogJ1Rlc3QgTW9kZWwnLFxuXHRcdFx0dmVuZG9yOiAnY29waWxvdCcsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdGZhbWlseTogJ3Rlc3QnLFxuXHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEyODAwMCxcblx0XHRcdG1heE91dHB1dFRva2VuczogNDA5Nixcblx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TY2hlbWE6IHtcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGVmZm9ydDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdFx0ZW51bTogWydsb3cnLCAnbWVkaXVtJ10sXG5cdFx0XHRcdFx0XHRlbnVtSXRlbUxhYmVsczogWydMb3cnLCAnTWVkaXVtJ10sXG5cdFx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbJ0Zhc3RlcicsICdCYWxhbmNlZCddLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogb3B0aW9ucz8ub21pdEVmZm9ydERlZmF1bHQgPyB1bmRlZmluZWQgOiAnbG93Jyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICd0b2tlbnMnLFxuXHRcdFx0XHRcdFx0ZW51bTogWzMyNzY4LCA2NTUzNl0sXG5cdFx0XHRcdFx0XHRlbnVtSXRlbUxhYmVsczogWyczMksnLCAnNjRLJ10sXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiBvcHRpb25zPy5vbWl0Q29udGV4dERlZmF1bHQgPyB1bmRlZmluZWQgOiAzMjc2OCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9IGFzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHR9O1xufVxuXG4vKipcbiAqIEJ1aWxkcyBhIG1vZGVsIHNoYXBlZCBsaWtlIENvcGlsb3QncyBBdXRvIGVudHJ5OiBhIHNpbmdsZSBuYXZpZ2F0aW9uIGdyb3VwXG4gKiB0aGF0IG5hbWVzIGl0c2VsZiBcIlRpZXJcIiBpbnN0ZWFkIG9mIHJldXNpbmcgdGhlIHRoaW5raW5nLWVmZm9ydCB3b3JkaW5nLlxuICovXG5mdW5jdGlvbiBjcmVhdGVUaWVyTW9kZWwoKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHtcblx0cmV0dXJuIHtcblx0XHRpZGVudGlmaWVyOiAnY29waWxvdC9hdXRvJyxcblx0XHRtZXRhZGF0YToge1xuXHRcdFx0ZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdC5leHRlbnNpb24nKSxcblx0XHRcdGlkOiAnYXV0bycsXG5cdFx0XHRuYW1lOiAnQXV0bycsXG5cdFx0XHR2ZW5kb3I6ICdjb3BpbG90Jyxcblx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0ZmFtaWx5OiAnYXV0bycsXG5cdFx0XHRtYXhJbnB1dFRva2VuczogMTI4MDAwLFxuXHRcdFx0bWF4T3V0cHV0VG9rZW5zOiA0MDk2LFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdFx0Y29uZmlndXJhdGlvblNjaGVtYToge1xuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0dGllcjoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHR0aXRsZTogJ1RpZXInLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdGVudW06IFsnZWNvJywgJ2JhbGFuY2VkJywgJ21heCddLFxuXHRcdFx0XHRcdFx0ZW51bUl0ZW1MYWJlbHM6IFsnRWNvJywgJ0JhbGFuY2VkJywgJ01heCddLFxuXHRcdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogWydDaGVhcGVyIG1vZGVscycsICdCYWxhbmNlcyBjYXBhYmlsaXR5IGFuZCBjb3N0JywgJ01vc3QgY2FwYWJsZSBtb2RlbHMnXSxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6ICdiYWxhbmNlZCcsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSBhcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0fTtcbn1cblxuLyoqXG4gKiBSZW5kZXJzIHRoZSBjb25maWd1cmF0aW9uIGJ1dHRvbiBhbmQgb3BlbnMgdGhlIGRyb3Bkb3duIGZvciBgbW9kZWxgLCB0aGVuXG4gKiByZXR1cm5zIGEgc25hcHNob3Qgb2YgZXZlcnl0aGluZyB0aGUgdXNlciBjYW4gc2VlOiB0aGUgYnV0dG9uIGxhYmVsLCBpdHNcbiAqIGFjY2Vzc2libGUgbmFtZSwgdGhlIGxpc3Qgb3B0aW9ucyBhbmQgdGhlIG9wdGlvbiByb3dzLlxuICovXG5mdW5jdGlvbiByZW5kZXIobW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciwgY29uZmlndXJhdGlvbjogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fSkge1xuXHRjb25zdCBhY2Nlc3M6IElNb2RlbENvbmZpZ3VyYXRpb25BY2Nlc3MgPSB7XG5cdFx0Z2V0TW9kZWxDb25maWd1cmF0aW9uOiAoKSA9PiBjb25maWd1cmF0aW9uLFxuXHRcdHNldE1vZGVsQ29uZmlndXJhdGlvbjogYXN5bmMgKF9tb2RlbElkLCB2YWx1ZXMpID0+IHsgT2JqZWN0LmFzc2lnbihjb25maWd1cmF0aW9uLCB2YWx1ZXMpOyB9LFxuXHRcdGdldE1vZGVsQ29uZmlndXJhdGlvbkFjdGlvbnM6ICgpID0+IFtdLFxuXHR9O1xuXHRsZXQgc2hvd25JdGVtczogSUFjdGlvbkxpc3RJdGVtPElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbj5bXSA9IFtdO1xuXHRsZXQgc2hvd25PcHRpb25zOiBJQWN0aW9uTGlzdE9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdGNvbnN0IGFjdGlvbldpZGdldFNlcnZpY2UgPSB7XG5cdFx0c2hvdzogKFxuXHRcdFx0X2lkOiBzdHJpbmcsXG5cdFx0XHRfc3VwcG9ydHNQcmV2aWV3OiBib29sZWFuLFxuXHRcdFx0aXRlbXM6IElBY3Rpb25MaXN0SXRlbTxJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24+W10sXG5cdFx0XHRfZGVsZWdhdGU6IHVua25vd24sXG5cdFx0XHRfYW5jaG9yOiB1bmtub3duLFxuXHRcdFx0X2NvbnRhaW5lcjogdW5rbm93bixcblx0XHRcdF9hY3Rpb25zOiB1bmtub3duLFxuXHRcdFx0X2FjY2Vzc2liaWxpdHlQcm92aWRlcjogdW5rbm93bixcblx0XHRcdG9wdGlvbnM6IElBY3Rpb25MaXN0T3B0aW9ucyxcblx0XHQpID0+IHtcblx0XHRcdHNob3duSXRlbXMgPSBpdGVtcztcblx0XHRcdHNob3duT3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0fSxcblx0XHRmb2N1c0l0ZW1CeUlkOiAoKSA9PiB7IH0sXG5cdFx0dXBkYXRlSXRlbXM6ICgpID0+IHsgfSxcblx0fSBhcyB1bmtub3duIGFzIElBY3Rpb25XaWRnZXRTZXJ2aWNlO1xuXHRjb25zdCBjb250cm9sbGVyID0gbmV3IE1vZGVsUGlja2VyQ29uZmlndXJhdGlvbih7XG5cdFx0Z2V0U2VsZWN0ZWRNb2RlbDogKCkgPT4gbW9kZWwsXG5cdFx0Z2V0Q29uZmlndXJhdGlvbkFjY2VzczogKCkgPT4gYWNjZXNzLFxuXHRcdGlzRGlzYWJsZWQ6ICgpID0+IGZhbHNlLFxuXHRcdHNob3VsZFNob3dDYWNoZUJyZWFrSGludDogKCkgPT4gZmFsc2UsXG5cdFx0Z2V0Q2FjaGVCcmVha0xlYXJuTW9yZUxpbms6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRkaXNtaXNzQ2FjaGVCcmVha0hpbnQ6ICgpID0+IHsgfSxcblx0fSwgYWN0aW9uV2lkZ2V0U2VydmljZSwgeyBwdWJsaWNMb2cyOiAoKSA9PiB7IH0gfSBhcyB1bmtub3duIGFzIElUZWxlbWV0cnlTZXJ2aWNlKTtcblx0Y29uc3QgYnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuXG5cdGNvbnRyb2xsZXIucmVuZGVyQnV0dG9uKGJ1dHRvbiwgZmFsc2UsIGZhbHNlKTtcblx0Y29udHJvbGxlci5zaG93KGJ1dHRvbik7XG5cblx0cmV0dXJuIHtcblx0XHRsYWJlbDogYnV0dG9uLnRleHRDb250ZW50LFxuXHRcdGFyaWFMYWJlbDogYnV0dG9uLmFyaWFMYWJlbCxcblx0XHRsaXN0T3B0aW9uczoge1xuXHRcdFx0cmVzZXJ2ZVN1Ym1lbnVTcGFjZTogc2hvd25PcHRpb25zPy5yZXNlcnZlU3VibWVudVNwYWNlLFxuXHRcdH0sXG5cdFx0c2VjdGlvbnM6IHNob3duSXRlbXMubWFwKGl0ZW0gPT4gaXRlbS5raW5kID09PSBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uID8ge1xuXHRcdFx0Y2xhc3NOYW1lOiBpdGVtLmNsYXNzTmFtZSxcblx0XHRcdGxhYmVsOiBpdGVtLmxhYmVsLFxuXHRcdFx0Y2hlY2tlZDogaXRlbS5pdGVtIS5jaGVja2VkLFxuXHRcdFx0YXJpYURlc2NyaXB0aW9uOiBpdGVtLmFyaWFEZXNjcmlwdGlvbixcblx0XHR9IDogeyBraW5kOiBpdGVtLmtpbmQsIGxhYmVsOiBpdGVtLmxhYmVsIH0pLFxuXHR9O1xufVxuXG5zdWl0ZSgnTW9kZWxQaWNrZXJDb25maWd1cmF0aW9uJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JlbmRlcnMgdGhlIGNvbWJpbmVkIGxhYmVsIGFuZCBidWlsZHMgYWNjZXNzaWJsZSBvcHRpb24gc2VjdGlvbnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZW5kZXIoY3JlYXRlTW9kZWwoKSwgeyBlZmZvcnQ6ICdtZWRpdW0nLCBjb250ZXh0OiA2NTUzNiB9KSwge1xuXHRcdFx0bGFiZWw6ICdNZWRpdW0gNjRLJyxcblx0XHRcdGFyaWFMYWJlbDogJ1RoaW5raW5nIEVmZm9ydDogTWVkaXVtLCBDb250ZXh0IFNpemU6IDY0SycsXG5cdFx0XHRsaXN0T3B0aW9uczoge1xuXHRcdFx0XHRyZXNlcnZlU3VibWVudVNwYWNlOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XHRzZWN0aW9uczogW1xuXHRcdFx0XHR7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5IZWFkZXIsIGxhYmVsOiAnVGhpbmtpbmcgRWZmb3J0JyB9LFxuXHRcdFx0XHR7IGNsYXNzTmFtZTogJ2NoYXQtbW9kZWwtcGlja2VyLWNvbmZpZy1vcHRpb24nLCBsYWJlbDogJ0xvdycsIGNoZWNrZWQ6IGZhbHNlLCBhcmlhRGVzY3JpcHRpb246ICdEZWZhdWx0LCBGYXN0ZXInIH0sXG5cdFx0XHRcdHsgY2xhc3NOYW1lOiAnY2hhdC1tb2RlbC1waWNrZXItY29uZmlnLW9wdGlvbicsIGxhYmVsOiAnTWVkaXVtJywgY2hlY2tlZDogdHJ1ZSwgYXJpYURlc2NyaXB0aW9uOiAnQmFsYW5jZWQnIH0sXG5cdFx0XHRcdHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLlNlcGFyYXRvciwgbGFiZWw6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5IZWFkZXIsIGxhYmVsOiAnQ29udGV4dCBTaXplJyB9LFxuXHRcdFx0XHR7IGNsYXNzTmFtZTogJ2NoYXQtbW9kZWwtcGlja2VyLWNvbmZpZy1vcHRpb24nLCBsYWJlbDogJzMySycsIGNoZWNrZWQ6IGZhbHNlLCBhcmlhRGVzY3JpcHRpb246ICdEZWZhdWx0JyB9LFxuXHRcdFx0XHR7IGNsYXNzTmFtZTogJ2NoYXQtbW9kZWwtcGlja2VyLWNvbmZpZy1vcHRpb24nLCBsYWJlbDogJzY0SycsIGNoZWNrZWQ6IHRydWUsIGFyaWFEZXNjcmlwdGlvbjogdW5kZWZpbmVkIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5kZXJzIHRoZSBzZXR0aW5ncyBzbGlkZXJzIGljb24gaW4gY29tcGFjdCBjaGF0IGlucHV0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGFjY2VzczogSU1vZGVsQ29uZmlndXJhdGlvbkFjY2VzcyA9IHtcblx0XHRcdGdldE1vZGVsQ29uZmlndXJhdGlvbjogKCkgPT4gKHsgZWZmb3J0OiAnbWVkaXVtJywgY29udGV4dDogNjU1MzYgfSksXG5cdFx0XHRzZXRNb2RlbENvbmZpZ3VyYXRpb246IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdGdldE1vZGVsQ29uZmlndXJhdGlvbkFjdGlvbnM6ICgpID0+IFtdLFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBNb2RlbFBpY2tlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0Z2V0U2VsZWN0ZWRNb2RlbDogKCkgPT4gY3JlYXRlTW9kZWwoKSxcblx0XHRcdGdldENvbmZpZ3VyYXRpb25BY2Nlc3M6ICgpID0+IGFjY2Vzcyxcblx0XHRcdGlzRGlzYWJsZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0c2hvdWxkU2hvd0NhY2hlQnJlYWtIaW50OiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldENhY2hlQnJlYWtMZWFybk1vcmVMaW5rOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRkaXNtaXNzQ2FjaGVCcmVha0hpbnQ6ICgpID0+IHsgfSxcblx0XHR9LCB7IHNob3coKSB7IH0sIGZvY3VzSXRlbUJ5SWQoKSB7IH0sIHVwZGF0ZUl0ZW1zKCkgeyB9LCBoaWRlKCkgeyB9IH0gYXMgdW5rbm93biBhcyBJQWN0aW9uV2lkZ2V0U2VydmljZSwgeyBwdWJsaWNMb2cyOiAoKSA9PiB7IH0gfSBhcyB1bmtub3duIGFzIElUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRjb25zdCBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG5cdFx0Y29udHJvbGxlci5yZW5kZXJCdXR0b24oYnV0dG9uLCB0cnVlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGJ1dHRvbi5zdHlsZS5kaXNwbGF5LCAnbm9uZScpO1xuXHRcdGFzc2VydC5vayhidXR0b24ucXVlcnlTZWxlY3RvcignLmNvZGljb24tc2V0dGluZ3MnKSk7XG5cdFx0Y29udHJvbGxlci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgdGhlIGhvc3QgYWN0aW9uIHdpZGdldCBwbGFjZW1lbnQgYW5kIHZpc2liaWxpdHkgbGlmZWN5Y2xlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb25zdCBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG5cdFx0Y29uc3QgYW5jaG9yOiBJQW5jaG9yID0geyB4OiAxMCwgeTogMjAsIHdpZHRoOiAzMCwgaGVpZ2h0OiAxIH07XG5cdFx0Y29uc3QgdmlzaWJpbGl0eTogYm9vbGVhbltdID0gW107XG5cdFx0bGV0IHNob3duUGxhY2VtZW50OiB7IGFuY2hvcjogdW5rbm93bjsgY29udGFpbmVyOiB1bmtub3duOyBhbmNob3JQb3NpdGlvbjogQW5jaG9yUG9zaXRpb24gfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgb25IaWRlOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWN0aW9uV2lkZ2V0U2VydmljZSA9IHtcblx0XHRcdHNob3c6IChcblx0XHRcdFx0X2lkOiBzdHJpbmcsXG5cdFx0XHRcdF9zdXBwb3J0c1ByZXZpZXc6IGJvb2xlYW4sXG5cdFx0XHRcdF9pdGVtczogSUFjdGlvbkxpc3RJdGVtPElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbj5bXSxcblx0XHRcdFx0ZGVsZWdhdGU6IHsgb25IaWRlOiAoKSA9PiB2b2lkIH0sXG5cdFx0XHRcdHNob3duQW5jaG9yOiB1bmtub3duLFxuXHRcdFx0XHRzaG93bkNvbnRhaW5lcjogdW5rbm93bixcblx0XHRcdFx0X2FjdGlvbnM6IHVua25vd24sXG5cdFx0XHRcdF9hY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHVua25vd24sXG5cdFx0XHRcdG9wdGlvbnM6IElBY3Rpb25MaXN0T3B0aW9ucyxcblx0XHRcdCkgPT4ge1xuXHRcdFx0XHRvbkhpZGUgPSBkZWxlZ2F0ZS5vbkhpZGU7XG5cdFx0XHRcdHNob3duUGxhY2VtZW50ID0ge1xuXHRcdFx0XHRcdGFuY2hvcjogc2hvd25BbmNob3IsXG5cdFx0XHRcdFx0Y29udGFpbmVyOiBzaG93bkNvbnRhaW5lcixcblx0XHRcdFx0XHRhbmNob3JQb3NpdGlvbjogb3B0aW9ucy5hbmNob3JQb3NpdGlvbixcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0XHRmb2N1c0l0ZW1CeUlkOiAoKSA9PiB7IH0sXG5cdFx0XHR1cGRhdGVJdGVtczogKCkgPT4geyB9LFxuXHRcdFx0aGlkZTogKCkgPT4gb25IaWRlPy4oKSxcblx0XHR9IGFzIHVua25vd24gYXMgSUFjdGlvbldpZGdldFNlcnZpY2U7XG5cdFx0Y29uc3QgYWNjZXNzOiBJTW9kZWxDb25maWd1cmF0aW9uQWNjZXNzID0ge1xuXHRcdFx0Z2V0TW9kZWxDb25maWd1cmF0aW9uOiAoKSA9PiAoe30pLFxuXHRcdFx0c2V0TW9kZWxDb25maWd1cmF0aW9uOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRnZXRNb2RlbENvbmZpZ3VyYXRpb25BY3Rpb25zOiAoKSA9PiBbXSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgTW9kZWxQaWNrZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdGdldFNlbGVjdGVkTW9kZWw6ICgpID0+IG1vZGVsLFxuXHRcdFx0Z2V0Q29uZmlndXJhdGlvbkFjY2VzczogKCkgPT4gYWNjZXNzLFxuXHRcdFx0aXNEaXNhYmxlZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRzaG91bGRTaG93Q2FjaGVCcmVha0hpbnQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0Z2V0Q2FjaGVCcmVha0xlYXJuTW9yZUxpbms6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGRpc21pc3NDYWNoZUJyZWFrSGludDogKCkgPT4geyB9LFxuXHRcdFx0b25EaWRDaGFuZ2VWaXNpYmlsaXR5OiB2aXNpYmxlID0+IHsgdmlzaWJpbGl0eS5wdXNoKHZpc2libGUpOyB9LFxuXHRcdFx0Z2V0QWN0aW9uV2lkZ2V0Q29udGFpbmVyOiAoKSA9PiBjb250YWluZXIsXG5cdFx0XHRnZXRBY3Rpb25XaWRnZXRBbmNob3I6ICgpID0+IGFuY2hvcixcblx0XHRcdGdldEFuY2hvclBvc2l0aW9uOiAoKSA9PiBBbmNob3JQb3NpdGlvbi5CRUxPVyxcblx0XHR9LCBhY3Rpb25XaWRnZXRTZXJ2aWNlLCB7IHB1YmxpY0xvZzI6ICgpID0+IHsgfSB9IGFzIHVua25vd24gYXMgSVRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Y29udHJvbGxlci5zaG93KGJ1dHRvbik7XG5cdFx0Y29udHJvbGxlci5zaG93KGJ1dHRvbik7XG5cdFx0Y29udHJvbGxlci5zaG93KGJ1dHRvbik7XG5cdFx0Y29udHJvbGxlci5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNob3duUGxhY2VtZW50LFxuXHRcdFx0dmlzaWJpbGl0eSxcblx0XHR9LCB7XG5cdFx0XHRzaG93blBsYWNlbWVudDoge1xuXHRcdFx0XHRhbmNob3IsXG5cdFx0XHRcdGNvbnRhaW5lcixcblx0XHRcdFx0YW5jaG9yUG9zaXRpb246IEFuY2hvclBvc2l0aW9uLkJFTE9XLFxuXHRcdFx0fSxcblx0XHRcdHZpc2liaWxpdHk6IFt0cnVlLCBmYWxzZSwgdHJ1ZSwgZmFsc2VdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyBBIHByb2R1Y2VyIHRoYXQgY2Fubm90IHJlc29sdmUgYSBkZWZhdWx0IGxlYXZlcyBpdCBgdW5kZWZpbmVkYCwgd2hpY2ggdXNlZFxuXHQvLyB0byBiZSBzdHJpbmdpZmllZCBzdHJhaWdodCBpbnRvIHRoZSBsYWJlbCBhcyBcInVuZGVmaW5lZCAyNzJLXCIuIFRoZSBncm91cCBpc1xuXHQvLyBkcm9wcGVkIGZyb20gdGhlIGxhYmVsIGluc3RlYWQsIHdoaWxlIGl0cyBvcHRpb25zIHN0YXkgc2VsZWN0YWJsZS5cblx0dGVzdCgnb21pdHMgYW4gdW5yZXNvbHZlZCBncm91cCBmcm9tIHRoZSBsYWJlbCByYXRoZXIgdGhhbiByZW5kZXJpbmcgXCJ1bmRlZmluZWRcIicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbmRlcihjcmVhdGVNb2RlbCh7IG9taXRFZmZvcnREZWZhdWx0OiB0cnVlIH0pKSwge1xuXHRcdFx0bGFiZWw6ICczMksnLFxuXHRcdFx0YXJpYUxhYmVsOiAnQ29udGV4dCBTaXplOiAzMksnLFxuXHRcdFx0bGlzdE9wdGlvbnM6IHtcblx0XHRcdFx0cmVzZXJ2ZVN1Ym1lbnVTcGFjZTogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0c2VjdGlvbnM6IFtcblx0XHRcdFx0eyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuSGVhZGVyLCBsYWJlbDogJ1RoaW5raW5nIEVmZm9ydCcgfSxcblx0XHRcdFx0eyBjbGFzc05hbWU6ICdjaGF0LW1vZGVsLXBpY2tlci1jb25maWctb3B0aW9uJywgbGFiZWw6ICdMb3cnLCBjaGVja2VkOiBmYWxzZSwgYXJpYURlc2NyaXB0aW9uOiAnRmFzdGVyJyB9LFxuXHRcdFx0XHR7IGNsYXNzTmFtZTogJ2NoYXQtbW9kZWwtcGlja2VyLWNvbmZpZy1vcHRpb24nLCBsYWJlbDogJ01lZGl1bScsIGNoZWNrZWQ6IGZhbHNlLCBhcmlhRGVzY3JpcHRpb246ICdCYWxhbmNlZCcgfSxcblx0XHRcdFx0eyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yLCBsYWJlbDogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkhlYWRlciwgbGFiZWw6ICdDb250ZXh0IFNpemUnIH0sXG5cdFx0XHRcdHsgY2xhc3NOYW1lOiAnY2hhdC1tb2RlbC1waWNrZXItY29uZmlnLW9wdGlvbicsIGxhYmVsOiAnMzJLJywgY2hlY2tlZDogdHJ1ZSwgYXJpYURlc2NyaXB0aW9uOiAnRGVmYXVsdCcgfSxcblx0XHRcdFx0eyBjbGFzc05hbWU6ICdjaGF0LW1vZGVsLXBpY2tlci1jb25maWctb3B0aW9uJywgbGFiZWw6ICc2NEsnLCBjaGVja2VkOiBmYWxzZSwgYXJpYURlc2NyaXB0aW9uOiB1bmRlZmluZWQgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIFdpdGggbm90aGluZyB0byBzdW1tYXJpemUgdGhlIGJ1dHRvbiBmYWxscyBiYWNrIHRvIGEgZ2VuZXJpYyBsYWJlbCBzbyB0aGVcblx0Ly8gY29uZmlndXJhdGlvbiBzdGF5cyByZWFjaGFibGUgXHUyMDE0IGl0IG11c3Qgbm90IHJlYWQgXCJ1bmRlZmluZWQgdW5kZWZpbmVkXCIuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gYSBnZW5lcmljIGxhYmVsIHdoZW4gbm8gZ3JvdXAgcmVzb2x2ZXMgYSB2YWx1ZScsICgpID0+IHtcblx0XHRjb25zdCByZW5kZXJlZCA9IHJlbmRlcihjcmVhdGVNb2RlbCh7IG9taXRFZmZvcnREZWZhdWx0OiB0cnVlLCBvbWl0Q29udGV4dERlZmF1bHQ6IHRydWUgfSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBsYWJlbDogcmVuZGVyZWQubGFiZWwsIGFyaWFMYWJlbDogcmVuZGVyZWQuYXJpYUxhYmVsIH0sIHtcblx0XHRcdGxhYmVsOiAnQ29uZmlndXJlJyxcblx0XHRcdGFyaWFMYWJlbDogJ0NvbmZpZ3VyZScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIFRoZSBuYXZpZ2F0aW9uIGdyb3VwIGlzIGdlbmVyaWM6IENvcGlsb3QncyBBdXRvIG1vZGVsIHVzZXMgaXQgZm9yIHRoZVxuXHQvLyByb3V0aW5nIHRpZXIgcmF0aGVyIHRoYW4gdGhpbmtpbmcgZWZmb3J0LCBhbmQgbmFtZXMgaXQgdGhyb3VnaCBgdGl0bGVgLlxuXHR0ZXN0KCduYW1lcyB0aGUgbmF2aWdhdGlvbiBncm91cCBhZnRlciB0aGUgc2NoZW1hIHRpdGxlIHdoZW4gb25lIGlzIGdpdmVuJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVuZGVyKGNyZWF0ZVRpZXJNb2RlbCgpLCB7IHRpZXI6ICdtYXgnIH0pLCB7XG5cdFx0XHRsYWJlbDogJ01heCcsXG5cdFx0XHRhcmlhTGFiZWw6ICdUaWVyOiBNYXgnLFxuXHRcdFx0bGlzdE9wdGlvbnM6IHtcblx0XHRcdFx0cmVzZXJ2ZVN1Ym1lbnVTcGFjZTogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0c2VjdGlvbnM6IFtcblx0XHRcdFx0eyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuSGVhZGVyLCBsYWJlbDogJ1RpZXInIH0sXG5cdFx0XHRcdHsgY2xhc3NOYW1lOiAnY2hhdC1tb2RlbC1waWNrZXItY29uZmlnLW9wdGlvbicsIGxhYmVsOiAnRWNvJywgY2hlY2tlZDogZmFsc2UsIGFyaWFEZXNjcmlwdGlvbjogJ0NoZWFwZXIgbW9kZWxzJyB9LFxuXHRcdFx0XHR7IGNsYXNzTmFtZTogJ2NoYXQtbW9kZWwtcGlja2VyLWNvbmZpZy1vcHRpb24nLCBsYWJlbDogJ0JhbGFuY2VkJywgY2hlY2tlZDogZmFsc2UsIGFyaWFEZXNjcmlwdGlvbjogJ0RlZmF1bHQsIEJhbGFuY2VzIGNhcGFiaWxpdHkgYW5kIGNvc3QnIH0sXG5cdFx0XHRcdHsgY2xhc3NOYW1lOiAnY2hhdC1tb2RlbC1waWNrZXItY29uZmlnLW9wdGlvbicsIGxhYmVsOiAnTWF4JywgY2hlY2tlZDogdHJ1ZSwgYXJpYURlc2NyaXB0aW9uOiAnTW9zdCBjYXBhYmxlIG1vZGVscycgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFFbkIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywwQkFBK0Q7QUFJeEUsU0FBUyxnQ0FBZ0M7QUFVekMsU0FBUyxZQUFZLFNBQW9JO0FBQ3hKLFNBQU87QUFBQSxJQUNOLFlBQVk7QUFBQSxJQUNaLFVBQVU7QUFBQSxNQUNULFdBQVcsSUFBSSxvQkFBb0IsZ0JBQWdCO0FBQUEsTUFDbkQsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLE1BQ1IsU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLE1BQ1IsZ0JBQWdCO0FBQUEsTUFDaEIsaUJBQWlCO0FBQUEsTUFDakIsc0JBQXNCLENBQUM7QUFBQSxNQUN2QixxQkFBcUI7QUFBQSxRQUNwQixZQUFZO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxNQUFNO0FBQUEsWUFDTixPQUFPO0FBQUEsWUFDUCxNQUFNLENBQUMsT0FBTyxRQUFRO0FBQUEsWUFDdEIsZ0JBQWdC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QXFCO0FBQUEsTUFDdEI7QUFBQSxNQUNBLFVBQVU7QUFBQSxRQUNULEVBQUUsTUFBTSxtQkFBbUIsUUFBUSxPQUFPLGtCQUFrQjtBQUFBLFFBQzVELEVBQUUsV0FBVyxtQ0FBbUMsT0FBTyxPQUFPLFNBQVMsT0FBTyxpQkFBaUIsU0FBUztBQUFBLFFBQ3hHLEVBQUUsV0FBVyxtQ0FBbUMsT0FBTyxVQUFVLFNBQVMsT0FBTyxpQkFBaUIsV0FBVztBQUFBLFFBQzdHLEVBQUUsTUFBTSxtQkFBbUIsV0FBVyxPQUFPLE9BQVU7QUFBQSxRQUN2RCxFQUFFLE1BQU0sbUJBQW1CLFFBQVEsT0FBTyxlQUFlO0FBQUEsUUFDekQsRUFBRSxXQUFXLG1DQUFtQyxPQUFPLE9BQU8sU0FBUyxNQUFNLGlCQUFpQixVQUFVO0FBQUEsUUFDeEcsRUFBRSxXQUFXLG1DQUFtQyxPQUFPLE9BQU8sU0FBUyxPQUFPLGlCQUFpQixPQUFVO0FBQUEsTUFDMUc7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFJRCxPQUFLLGdFQUFnRSxNQUFNO0FBQzFFLFVBQU0sV0FBVyxPQUFPLFlBQVksRUFBRSxtQkFBbUIsTUFBTSxvQkFBb0IsS0FBSyxDQUFDLENBQUM7QUFDMUYsV0FBTyxnQkFBZ0IsRUFBRSxPQUFPLFNBQVMsT0FBTyxXQUFXLFNBQVMsVUFBVSxHQUFHO0FBQUEsTUFDaEYsT0FBTztBQUFBLE1BQ1AsV0FBVztBQUFBLElBQ1osQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUlELE9BQUssdUVBQXVFLE1BQU07QUFDakYsV0FBTyxnQkFBZ0IsT0FBTyxnQkFBZ0IsR0FBRyxFQUFFLE1BQU0sTUFBTSxDQUFDLEdBQUc7QUFBQSxNQUNsRSxPQUFPO0FBQUEsTUFDUCxXQUFXO0FBQUEsTUFDWCxhQUFhO0FBQUEsUUFDWixxQkFBcUI7QUFBQSxNQUN0QjtBQUFBLE1BQ0EsVUFBVTtBQUFBLFFBQ1QsRUFBRSxNQUFNLG1CQUFtQixRQUFRLE9BQU8sT0FBTztBQUFBLFFBQ2pELEVBQUUsV0FBVyxtQ0FBbUMsT0FBTyxPQUFPLFNBQVMsT0FBTyxpQkFBaUIsaUJBQWlCO0FBQUEsUUFDaEgsRUFBRSxXQUFXLG1DQUFtQyxPQUFPLFlBQVksU0FBUyxPQUFPLGlCQUFpQix3Q0FBd0M7QUFBQSxRQUM1SSxFQUFFLFdBQVcsbUNBQW1DLE9BQU8sT0FBTyxTQUFTLE1BQU0saUJBQWlCLHNCQUFzQjtBQUFBLE1BQ3JIO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
