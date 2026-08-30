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
import "./media/forgeOrchestration.css";
import { $, addDisposableListener, append, EventHelper, isAncestor } from "../../../../base/browser/dom.js";
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { AnchorAlignment, AnchorPosition } from "../../../../base/common/layout.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { OpenModelPickerAction } from "../../chat/browser/actions/chatExecuteActions.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { FORGE_WORK_MODE_SETTING_ID, readForgeWorkMode } from "../common/forgeWorkMode.js";
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "forge",
  title: localize("forge.configuration", "Forge"),
  type: "object",
  properties: {
    [FORGE_WORK_MODE_SETTING_ID]: {
      type: "string",
      enum: ["logos", "dialectic"],
      enumItemLabels: ["Logos", "Dialectic"],
      enumDescriptions: [
        localize("forge.workMode.logos.desc", "\u5355\u4E00 Agent \u5DE5\u4F5C\uFF0C\u548C\u4EE5\u524D\u4E00\u6837\u3002"),
        localize("forge.workMode.dialectic.desc", "\u6307\u5B9A Leader \u548C Worker\uFF0C\u5E76\u884C\u7F16\u6392\u3002")
      ],
      default: "logos",
      description: localize("forge.workMode", "Agent \u5DE5\u4F5C\u6A21\u5F0F\u3002Logos \u9009\u62E9\u4E00\u4E2A\u6A21\u578B\u76F4\u63A5\u5DE5\u4F5C\uFF1BDialectic \u7531 Leader \u89C4\u5212\u5E76\u7531 Worker \u5E76\u884C\u6267\u884C\u3002"),
      scope: ConfigurationScope.APPLICATION
    }
  }
});
let ForgeWorkModeContribution = class extends Disposable {
  constructor(actionViewItemService) {
    super();
    this._register(actionViewItemService.register(
      MenuId.ChatInput,
      OpenModelPickerAction.ID,
      (action, _options, instantiationService) => instantiationService.createInstance(ForgeWorkModeActionViewItem, action)
    ));
  }
};
ForgeWorkModeContribution.ID = "workbench.contrib.forgeWorkMode";
ForgeWorkModeContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService)
], ForgeWorkModeContribution);
let ForgeWorkModeActionViewItem = class extends BaseActionViewItem {
  constructor(action, _configurationService, _contextViewService) {
    super(void 0, action);
    this._configurationService = _configurationService;
    this._contextViewService = _contextViewService;
    this._lastToggle = 0;
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(FORGE_WORK_MODE_SETTING_ID)) {
        this._renderLabel();
      }
    }));
    this._register({ dispose: () => this._close() });
  }
  render(container) {
    super.render(container);
    container.classList.add("forge-work-mode-item", "chat-input-picker-item");
    const root = append(container, $("div.action-label.forge-work-mode"));
    root.setAttribute("role", "button");
    root.setAttribute("aria-haspopup", "listbox");
    this._label = append(root, $("span.forge-work-mode-label"));
    const chevron = append(root, $("span"));
    chevron.className = ThemeIcon.asClassName(Codicon.chevronUp);
    this._renderLabel();
  }
  onClick(event, _preserveFocus = false) {
    EventHelper.stop(event, true);
    this._toggle();
  }
  _mode() {
    return readForgeWorkMode(this._configurationService.getValue(FORGE_WORK_MODE_SETTING_ID));
  }
  _open() {
    return !!this._openView;
  }
  _renderLabel() {
    if (!this._label) {
      return;
    }
    const mode = this._mode();
    this._label.textContent = mode === "dialectic" ? "Dialectic" : "Logos";
    const trigger = this.element?.querySelector(".forge-work-mode");
    trigger?.setAttribute("aria-expanded", this._open() ? "true" : "false");
    trigger?.setAttribute("aria-label", localize("forge.workMode.aria", "\u5DE5\u4F5C\u6A21\u5F0F\uFF0C{0}", this._label.textContent));
  }
  _toggle() {
    const now = Date.now();
    if (now - this._lastToggle < 250) {
      return;
    }
    this._lastToggle = now;
    if (this._open()) {
      this._close();
      return;
    }
    this._show();
  }
  _close() {
    this._openView?.close();
    this._openView = void 0;
    this._renderLabel();
  }
  _show() {
    const anchor = this.element;
    if (!anchor) {
      return;
    }
    this._openView = this._contextViewService.showContextView({
      getAnchor: () => anchor,
      anchorAlignment: AnchorAlignment.LEFT,
      anchorPosition: AnchorPosition.ABOVE,
      render: (container) => this._renderPicker(container),
      onDOMEvent: (e) => this._onPickerEvent(e),
      onHide: () => {
        this._openView = void 0;
        this._renderLabel();
      }
    });
    this._renderLabel();
  }
  _onPickerEvent(e) {
    if (e.type === "keydown" && e.key === "Escape") {
      this._close();
      return;
    }
    if (e.type !== "click" && e.type !== "mousedown") {
      return;
    }
    const target = e.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (this.element && isAncestor(target, this.element)) {
      return;
    }
    if (isAncestor(target, this._contextViewService.getContextViewElement())) {
      return;
    }
    this._close();
  }
  _renderPicker(container) {
    const store = new DisposableStore();
    const picker = append(container, $("div.forge-work-mode-picker"));
    picker.setAttribute("role", "listbox");
    append(picker, $("div.forge-orch-picker-title", void 0, localize("forge.workMode.pick", "\u5DE5\u4F5C\u6A21\u5F0F")));
    const list = append(picker, $("div.forge-orch-choices"));
    this._choice(store, list, "Logos", localize("forge.workMode.logos.hint", "\u53F3\u4FA7\u9009\u62E9\u4E00\u4E2A Agent\uFF0C\u76F4\u63A5\u5DE5\u4F5C"), "logos");
    this._choice(store, list, "Dialectic", localize("forge.workMode.dialectic.hint", "\u9009\u62E9 Leader \u548C Worker\uFF0C\u5E76\u884C\u7F16\u6392"), "dialectic");
    return store;
  }
  _choice(store, parent, label, detail, mode) {
    const selected = this._mode() === mode;
    const button = append(parent, $("button.forge-orch-choice", { type: "button" }));
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", selected ? "true" : "false");
    button.classList.toggle("selected", selected);
    append(button, $("span.forge-orch-choice-mark"));
    append(button, $("span.forge-orch-choice-label", void 0, label));
    append(button, $("span.forge-orch-choice-model", void 0, detail));
    store.add(addDisposableListener(button, "click", () => {
      void this._configurationService.updateValue(FORGE_WORK_MODE_SETTING_ID, mode, ConfigurationTarget.USER);
      this._close();
    }));
  }
};
ForgeWorkModeActionViewItem = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IContextViewService)
], ForgeWorkModeActionViewItem);
registerWorkbenchContribution2(ForgeWorkModeContribution.ID, ForgeWorkModeContribution, WorkbenchPhase.BlockRestore);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZvcmdlXFxlbGVjdHJvbi1icm93c2VyXFxmb3JnZVdvcmtNb2RlLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxyXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cclxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXHJcblxyXG5pbXBvcnQgJy4vbWVkaWEvZm9yZ2VPcmNoZXN0cmF0aW9uLmNzcyc7XHJcbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgYXBwZW5kLCBFdmVudEhlbHBlciwgaXNBbmNlc3RvciwgdHlwZSBFdmVudExpa2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcclxuaW1wb3J0IHsgQmFzZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xyXG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XHJcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XHJcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XHJcbmltcG9ydCB7IEFuY2hvckFsaWdubWVudCwgQW5jaG9yUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXlvdXQuanMnO1xyXG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xyXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XHJcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmpzJztcclxuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XHJcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xyXG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLCBDb25maWd1cmF0aW9uU2NvcGUsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xyXG5pbXBvcnQgeyBJQ29udGV4dFZpZXdTZXJ2aWNlLCB0eXBlIElPcGVuQ29udGV4dFZpZXcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcclxuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xyXG5pbXBvcnQgeyBPcGVuTW9kZWxQaWNrZXJBY3Rpb24gfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvYWN0aW9ucy9jaGF0RXhlY3V0ZUFjdGlvbnMuanMnO1xyXG5pbXBvcnQgeyByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xyXG5pbXBvcnQgeyBGT1JHRV9XT1JLX01PREVfU0VUVElOR19JRCwgcmVhZEZvcmdlV29ya01vZGUsIHR5cGUgRm9yZ2VXb3JrTW9kZSB9IGZyb20gJy4uL2NvbW1vbi9mb3JnZVdvcmtNb2RlLmpzJztcclxuXHJcblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XHJcblx0aWQ6ICdmb3JnZScsXHJcblx0dGl0bGU6IGxvY2FsaXplKCdmb3JnZS5jb25maWd1cmF0aW9uJywgXCJGb3JnZVwiKSxcclxuXHR0eXBlOiAnb2JqZWN0JyxcclxuXHRwcm9wZXJ0aWVzOiB7XHJcblx0XHRbRk9SR0VfV09SS19NT0RFX1NFVFRJTkdfSURdOiB7XHJcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxyXG5cdFx0XHRlbnVtOiBbJ2xvZ29zJywgJ2RpYWxlY3RpYyddLFxyXG5cdFx0XHRlbnVtSXRlbUxhYmVsczogWydMb2dvcycsICdEaWFsZWN0aWMnXSxcclxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xyXG5cdFx0XHRcdGxvY2FsaXplKCdmb3JnZS53b3JrTW9kZS5sb2dvcy5kZXNjJywgXCJcdTUzNTVcdTRFMDAgQWdlbnQgXHU1REU1XHU0RjVDXHVGRjBDXHU1NDhDXHU0RUU1XHU1MjREXHU0RTAwXHU2ODM3XHUzMDAyXCIpLFxyXG5cdFx0XHRcdGxvY2FsaXplKCdmb3JnZS53b3JrTW9kZS5kaWFsZWN0aWMuZGVzYycsIFwiXHU2MzA3XHU1QjlBIExlYWRlciBcdTU0OEMgV29ya2VyXHVGRjBDXHU1RTc2XHU4ODRDXHU3RjE2XHU2MzkyXHUzMDAyXCIpLFxyXG5cdFx0XHRdLFxyXG5cdFx0XHRkZWZhdWx0OiAnbG9nb3MnLFxyXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZvcmdlLndvcmtNb2RlJywgXCJBZ2VudCBcdTVERTVcdTRGNUNcdTZBMjFcdTVGMEZcdTMwMDJMb2dvcyBcdTkwMDlcdTYyRTlcdTRFMDBcdTRFMkFcdTZBMjFcdTU3OEJcdTc2RjRcdTYzQTVcdTVERTVcdTRGNUNcdUZGMUJEaWFsZWN0aWMgXHU3NTMxIExlYWRlciBcdTg5QzRcdTUyMTJcdTVFNzZcdTc1MzEgV29ya2VyIFx1NUU3Nlx1ODg0Q1x1NjI2N1x1ODg0Q1x1MzAwMlwiKSxcclxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcclxuXHRcdH0sXHJcblx0fSxcclxufSk7XHJcblxyXG5jbGFzcyBGb3JnZVdvcmtNb2RlQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XHJcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmZvcmdlV29ya01vZGUnO1xyXG5cclxuXHRjb25zdHJ1Y3RvcihcclxuXHRcdEBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIGFjdGlvblZpZXdJdGVtU2VydmljZTogSUFjdGlvblZpZXdJdGVtU2VydmljZSxcclxuXHQpIHtcclxuXHRcdHN1cGVyKCk7XHJcblx0XHR0aGlzLl9yZWdpc3RlcihhY3Rpb25WaWV3SXRlbVNlcnZpY2UucmVnaXN0ZXIoXHJcblx0XHRcdE1lbnVJZC5DaGF0SW5wdXQsXHJcblx0XHRcdE9wZW5Nb2RlbFBpY2tlckFjdGlvbi5JRCxcclxuXHRcdFx0KGFjdGlvbiwgX29wdGlvbnMsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGb3JnZVdvcmtNb2RlQWN0aW9uVmlld0l0ZW0sIGFjdGlvbiksXHJcblx0XHQpKTtcclxuXHR9XHJcbn1cclxuXHJcbmNsYXNzIEZvcmdlV29ya01vZGVBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XHJcblx0cHJpdmF0ZSBfbGFiZWw6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xyXG5cdHByaXZhdGUgX29wZW5WaWV3OiBJT3BlbkNvbnRleHRWaWV3IHwgdW5kZWZpbmVkO1xyXG5cdHByaXZhdGUgX2xhc3RUb2dnbGUgPSAwO1xyXG5cclxuXHRjb25zdHJ1Y3RvcihcclxuXHRcdGFjdGlvbjogSUFjdGlvbixcclxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcclxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcclxuXHQpIHtcclxuXHRcdHN1cGVyKHVuZGVmaW5lZCwgYWN0aW9uKTtcclxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcclxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oRk9SR0VfV09SS19NT0RFX1NFVFRJTkdfSUQpKSB7XHJcblx0XHRcdFx0dGhpcy5fcmVuZGVyTGFiZWwoKTtcclxuXHRcdFx0fVxyXG5cdFx0fSkpO1xyXG5cdFx0dGhpcy5fcmVnaXN0ZXIoeyBkaXNwb3NlOiAoKSA9PiB0aGlzLl9jbG9zZSgpIH0pO1xyXG5cdH1cclxuXHJcblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xyXG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2ZvcmdlLXdvcmstbW9kZS1pdGVtJywgJ2NoYXQtaW5wdXQtcGlja2VyLWl0ZW0nKTtcclxuXHRcdGNvbnN0IHJvb3QgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdkaXYuYWN0aW9uLWxhYmVsLmZvcmdlLXdvcmstbW9kZScpKTtcclxuXHRcdHJvb3Quc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xyXG5cdFx0cm9vdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGFzcG9wdXAnLCAnbGlzdGJveCcpO1xyXG5cdFx0dGhpcy5fbGFiZWwgPSBhcHBlbmQocm9vdCwgJCgnc3Bhbi5mb3JnZS13b3JrLW1vZGUtbGFiZWwnKSk7XHJcblx0XHRjb25zdCBjaGV2cm9uID0gYXBwZW5kKHJvb3QsICQoJ3NwYW4nKSk7XHJcblx0XHRjaGV2cm9uLmNsYXNzTmFtZSA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNoZXZyb25VcCk7XHJcblx0XHR0aGlzLl9yZW5kZXJMYWJlbCgpO1xyXG5cdH1cclxuXHJcblx0b3ZlcnJpZGUgb25DbGljayhldmVudDogRXZlbnRMaWtlLCBfcHJlc2VydmVGb2N1cyA9IGZhbHNlKTogdm9pZCB7XHJcblx0XHRFdmVudEhlbHBlci5zdG9wKGV2ZW50LCB0cnVlKTtcclxuXHRcdHRoaXMuX3RvZ2dsZSgpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfbW9kZSgpOiBGb3JnZVdvcmtNb2RlIHtcclxuXHRcdHJldHVybiByZWFkRm9yZ2VXb3JrTW9kZSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShGT1JHRV9XT1JLX01PREVfU0VUVElOR19JRCkpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfb3BlbigpOiBib29sZWFuIHtcclxuXHRcdHJldHVybiAhIXRoaXMuX29wZW5WaWV3O1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfcmVuZGVyTGFiZWwoKTogdm9pZCB7XHJcblx0XHRpZiAoIXRoaXMuX2xhYmVsKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdGNvbnN0IG1vZGUgPSB0aGlzLl9tb2RlKCk7XHJcblx0XHR0aGlzLl9sYWJlbC50ZXh0Q29udGVudCA9IG1vZGUgPT09ICdkaWFsZWN0aWMnID8gJ0RpYWxlY3RpYycgOiAnTG9nb3MnO1xyXG5cdFx0Y29uc3QgdHJpZ2dlciA9IHRoaXMuZWxlbWVudD8ucXVlcnlTZWxlY3RvcignLmZvcmdlLXdvcmstbW9kZScpO1xyXG5cdFx0dHJpZ2dlcj8uc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgdGhpcy5fb3BlbigpID8gJ3RydWUnIDogJ2ZhbHNlJyk7XHJcblx0XHR0cmlnZ2VyPy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnZm9yZ2Uud29ya01vZGUuYXJpYScsIFwiXHU1REU1XHU0RjVDXHU2QTIxXHU1RjBGXHVGRjBDezB9XCIsIHRoaXMuX2xhYmVsLnRleHRDb250ZW50KSk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF90b2dnbGUoKTogdm9pZCB7XHJcblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xyXG5cdFx0aWYgKG5vdyAtIHRoaXMuX2xhc3RUb2dnbGUgPCAyNTApIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5fbGFzdFRvZ2dsZSA9IG5vdztcclxuXHRcdGlmICh0aGlzLl9vcGVuKCkpIHtcclxuXHRcdFx0dGhpcy5fY2xvc2UoKTtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5fc2hvdygpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfY2xvc2UoKTogdm9pZCB7XHJcblx0XHR0aGlzLl9vcGVuVmlldz8uY2xvc2UoKTtcclxuXHRcdHRoaXMuX29wZW5WaWV3ID0gdW5kZWZpbmVkO1xyXG5cdFx0dGhpcy5fcmVuZGVyTGFiZWwoKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX3Nob3coKTogdm9pZCB7XHJcblx0XHRjb25zdCBhbmNob3IgPSB0aGlzLmVsZW1lbnQ7XHJcblx0XHRpZiAoIWFuY2hvcikge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHR0aGlzLl9vcGVuVmlldyA9IHRoaXMuX2NvbnRleHRWaWV3U2VydmljZS5zaG93Q29udGV4dFZpZXcoe1xyXG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGFuY2hvcixcclxuXHRcdFx0YW5jaG9yQWxpZ25tZW50OiBBbmNob3JBbGlnbm1lbnQuTEVGVCxcclxuXHRcdFx0YW5jaG9yUG9zaXRpb246IEFuY2hvclBvc2l0aW9uLkFCT1ZFLFxyXG5cdFx0XHRyZW5kZXI6IGNvbnRhaW5lciA9PiB0aGlzLl9yZW5kZXJQaWNrZXIoY29udGFpbmVyKSxcclxuXHRcdFx0b25ET01FdmVudDogZSA9PiB0aGlzLl9vblBpY2tlckV2ZW50KGUpLFxyXG5cdFx0XHRvbkhpZGU6ICgpID0+IHtcclxuXHRcdFx0XHR0aGlzLl9vcGVuVmlldyA9IHVuZGVmaW5lZDtcclxuXHRcdFx0XHR0aGlzLl9yZW5kZXJMYWJlbCgpO1xyXG5cdFx0XHR9LFxyXG5cdFx0fSk7XHJcblx0XHR0aGlzLl9yZW5kZXJMYWJlbCgpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfb25QaWNrZXJFdmVudChlOiBFdmVudCk6IHZvaWQge1xyXG5cdFx0aWYgKGUudHlwZSA9PT0gJ2tleWRvd24nICYmIChlIGFzIEtleWJvYXJkRXZlbnQpLmtleSA9PT0gJ0VzY2FwZScpIHtcclxuXHRcdFx0dGhpcy5fY2xvc2UoKTtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0aWYgKGUudHlwZSAhPT0gJ2NsaWNrJyAmJiBlLnR5cGUgIT09ICdtb3VzZWRvd24nKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0O1xyXG5cdFx0aWYgKCEodGFyZ2V0IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdGlmICh0aGlzLmVsZW1lbnQgJiYgaXNBbmNlc3Rvcih0YXJnZXQsIHRoaXMuZWxlbWVudCkpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0aWYgKGlzQW5jZXN0b3IodGFyZ2V0LCB0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2UuZ2V0Q29udGV4dFZpZXdFbGVtZW50KCkpKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdHRoaXMuX2Nsb3NlKCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9yZW5kZXJQaWNrZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IERpc3Bvc2FibGVTdG9yZSB7XHJcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcclxuXHRcdGNvbnN0IHBpY2tlciA9IGFwcGVuZChjb250YWluZXIsICQoJ2Rpdi5mb3JnZS13b3JrLW1vZGUtcGlja2VyJykpO1xyXG5cdFx0cGlja2VyLnNldEF0dHJpYnV0ZSgncm9sZScsICdsaXN0Ym94Jyk7XHJcblx0XHRhcHBlbmQocGlja2VyLCAkKCdkaXYuZm9yZ2Utb3JjaC1waWNrZXItdGl0bGUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdmb3JnZS53b3JrTW9kZS5waWNrJywgXCJcdTVERTVcdTRGNUNcdTZBMjFcdTVGMEZcIikpKTtcclxuXHRcdGNvbnN0IGxpc3QgPSBhcHBlbmQocGlja2VyLCAkKCdkaXYuZm9yZ2Utb3JjaC1jaG9pY2VzJykpO1xyXG5cdFx0dGhpcy5fY2hvaWNlKHN0b3JlLCBsaXN0LCAnTG9nb3MnLCBsb2NhbGl6ZSgnZm9yZ2Uud29ya01vZGUubG9nb3MuaGludCcsIFwiXHU1M0YzXHU0RkE3XHU5MDA5XHU2MkU5XHU0RTAwXHU0RTJBIEFnZW50XHVGRjBDXHU3NkY0XHU2M0E1XHU1REU1XHU0RjVDXCIpLCAnbG9nb3MnKTtcclxuXHRcdHRoaXMuX2Nob2ljZShzdG9yZSwgbGlzdCwgJ0RpYWxlY3RpYycsIGxvY2FsaXplKCdmb3JnZS53b3JrTW9kZS5kaWFsZWN0aWMuaGludCcsIFwiXHU5MDA5XHU2MkU5IExlYWRlciBcdTU0OEMgV29ya2VyXHVGRjBDXHU1RTc2XHU4ODRDXHU3RjE2XHU2MzkyXCIpLCAnZGlhbGVjdGljJyk7XHJcblx0XHRyZXR1cm4gc3RvcmU7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9jaG9pY2Uoc3RvcmU6IERpc3Bvc2FibGVTdG9yZSwgcGFyZW50OiBIVE1MRWxlbWVudCwgbGFiZWw6IHN0cmluZywgZGV0YWlsOiBzdHJpbmcsIG1vZGU6IEZvcmdlV29ya01vZGUpOiB2b2lkIHtcclxuXHRcdGNvbnN0IHNlbGVjdGVkID0gdGhpcy5fbW9kZSgpID09PSBtb2RlO1xyXG5cdFx0Y29uc3QgYnV0dG9uID0gYXBwZW5kKHBhcmVudCwgJCgnYnV0dG9uLmZvcmdlLW9yY2gtY2hvaWNlJywgeyB0eXBlOiAnYnV0dG9uJyB9KSk7XHJcblx0XHRidXR0b24uc2V0QXR0cmlidXRlKCdyb2xlJywgJ29wdGlvbicpO1xyXG5cdFx0YnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcsIHNlbGVjdGVkID8gJ3RydWUnIDogJ2ZhbHNlJyk7XHJcblx0XHRidXR0b24uY2xhc3NMaXN0LnRvZ2dsZSgnc2VsZWN0ZWQnLCBzZWxlY3RlZCk7XHJcblx0XHRhcHBlbmQoYnV0dG9uLCAkKCdzcGFuLmZvcmdlLW9yY2gtY2hvaWNlLW1hcmsnKSk7XHJcblx0XHRhcHBlbmQoYnV0dG9uLCAkKCdzcGFuLmZvcmdlLW9yY2gtY2hvaWNlLWxhYmVsJywgdW5kZWZpbmVkLCBsYWJlbCkpO1xyXG5cdFx0YXBwZW5kKGJ1dHRvbiwgJCgnc3Bhbi5mb3JnZS1vcmNoLWNob2ljZS1tb2RlbCcsIHVuZGVmaW5lZCwgZGV0YWlsKSk7XHJcblx0XHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJ1dHRvbiwgJ2NsaWNrJywgKCkgPT4ge1xyXG5cdFx0XHR2b2lkIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKEZPUkdFX1dPUktfTU9ERV9TRVRUSU5HX0lELCBtb2RlLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xyXG5cdFx0XHR0aGlzLl9jbG9zZSgpO1xyXG5cdFx0fSkpO1xyXG5cdH1cclxufVxyXG5cclxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKEZvcmdlV29ya01vZGVDb250cmlidXRpb24uSUQsIEZvcmdlV29ya01vZGVDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsR0FBRyx1QkFBdUIsUUFBUSxhQUFhLGtCQUFrQztBQUMxRixTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGlCQUFpQixzQkFBc0I7QUFDaEQsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLGNBQWMseUJBQXlCLDBCQUFrRDtBQUNsRyxTQUFTLDJCQUFrRDtBQUMzRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQyxzQkFBc0I7QUFDL0QsU0FBUyw0QkFBNEIseUJBQTZDO0FBRWxGLFNBQVMsR0FBMkIsd0JBQXdCLGFBQWEsRUFBRSxzQkFBc0I7QUFBQSxFQUNoRyxJQUFJO0FBQUEsRUFDSixPQUFPLFNBQVMsdUJBQXVCLE9BQU87QUFBQSxFQUM5QyxNQUFNO0FBQUEsRUFDTixZQUFZO0FBQUEsSUFDWCxDQUFDLDBCQUEwQixHQUFHO0FBQUEsTUFDN0IsTUFBTTtBQUFBLE1BQ04sTUFBTSxDQUFDLFNBQVMs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
