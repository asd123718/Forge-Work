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
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Schemas } from "../../../../base/common/network.js";
import * as nls from "../../../../nls.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { settingKeyToDisplayFormat } from "../../preferences/browser/settingsTreeModels.js";
let SimpleSettingRenderer = class {
  // setting ID to feature value
  constructor(_configurationService, _contextMenuService, _preferencesService, _telemetryService, _clipboardService) {
    this._configurationService = _configurationService;
    this._contextMenuService = _contextMenuService;
    this._preferencesService = _preferencesService;
    this._telemetryService = _telemetryService;
    this._clipboardService = _clipboardService;
    this._updatedSettings = /* @__PURE__ */ new Map();
    // setting ID to user's original setting value
    this._encounteredSettings = /* @__PURE__ */ new Map();
    // setting ID to setting
    this._featuredSettings = /* @__PURE__ */ new Map();
    this.codeSettingAnchorRegex = new RegExp(`^<a (href)=".*code.*://settings/([^\\s"]+)"(?:\\s*codesetting="([^"]+)")?>`);
    this.codeSettingSimpleRegex = new RegExp(`^setting\\(([^\\s:)]+)(?::([^)]+))?\\)$`);
  }
  get featuredSettingStates() {
    const result = /* @__PURE__ */ new Map();
    for (const [settingId, value] of this._featuredSettings) {
      result.set(settingId, this._configurationService.getValue(settingId) === value);
    }
    return result;
  }
  replaceAnchor(raw) {
    const match = this.codeSettingAnchorRegex.exec(raw);
    if (match && match.length === 4) {
      const settingId = match[2];
      const rendered = this.render(settingId, match[3]);
      if (rendered) {
        return raw.replace(this.codeSettingAnchorRegex, rendered);
      }
    }
    return void 0;
  }
  replaceSimple(raw) {
    const match = this.codeSettingSimpleRegex.exec(raw);
    if (match && match.length === 3) {
      const settingId = match[1];
      const rendered = this.render(settingId, match[2]);
      if (rendered) {
        return raw.replace(this.codeSettingSimpleRegex, rendered);
      }
    }
    return void 0;
  }
  getHtmlRenderer() {
    return ({ raw }) => {
      const replacedAnchor = this.replaceAnchor(raw);
      if (replacedAnchor) {
        raw = replacedAnchor;
      }
      return raw;
    };
  }
  getCodeSpanRenderer() {
    return ({ text }) => {
      const replacedSimple = this.replaceSimple(text);
      if (replacedSimple) {
        return replacedSimple;
      }
      return `<code>${text}</code>`;
    };
  }
  settingToUriString(settingId, value) {
    return `${Schemas.codeSetting}://${settingId}${value ? `/${value}` : ""}`;
  }
  getSetting(settingId) {
    if (this._encounteredSettings.has(settingId)) {
      return this._encounteredSettings.get(settingId);
    }
    return this._preferencesService.getSetting(settingId);
  }
  parseValue(settingId, value) {
    if (value === "undefined" || value === "") {
      return void 0;
    }
    const setting = this.getSetting(settingId);
    if (!setting) {
      return value;
    }
    switch (setting.type) {
      case "boolean":
        return value === "true";
      case "number":
        return parseInt(value, 10);
      case "string":
      default:
        return value;
    }
  }
  render(settingId, newValue) {
    const setting = this.getSetting(settingId);
    if (!setting) {
      return `<code>${settingId}</code>`;
    }
    return this.renderSetting(setting, newValue);
  }
  viewInSettingsMessage(settingId, alreadyDisplayed) {
    if (alreadyDisplayed) {
      return nls.localize("viewInSettings", "View in Settings");
    } else {
      const displayName = settingKeyToDisplayFormat(settingId);
      return nls.localize("viewInSettingsDetailed", 'View "{0}: {1}" in Settings', displayName.category, displayName.label);
    }
  }
  restorePreviousSettingMessage(settingId) {
    const displayName = settingKeyToDisplayFormat(settingId);
    return nls.localize("restorePreviousValue", 'Restore value of "{0}: {1}"', displayName.category, displayName.label);
  }
  isAlreadySet(setting, value) {
    const currentValue = this._configurationService.getValue(setting.key);
    return currentValue === value || currentValue === void 0 && setting.value === value;
  }
  booleanSettingMessage(setting, booleanValue) {
    const displayName = settingKeyToDisplayFormat(setting.key);
    if (this.isAlreadySet(setting, booleanValue)) {
      if (booleanValue) {
        return nls.localize("alreadysetBoolTrue", '"{0}: {1}" is already enabled', displayName.category, displayName.label);
      } else {
        return nls.localize("alreadysetBoolFalse", '"{0}: {1}" is already disabled', displayName.category, displayName.label);
      }
    }
    if (booleanValue) {
      return nls.localize("trueMessage", 'Enable "{0}: {1}"', displayName.category, displayName.label);
    } else {
      return nls.localize("falseMessage", 'Disable "{0}: {1}"', displayName.category, displayName.label);
    }
  }
  stringSettingMessage(setting, stringValue) {
    const displayName = settingKeyToDisplayFormat(setting.key);
    if (this.isAlreadySet(setting, stringValue)) {
      return nls.localize("alreadysetString", '"{0}: {1}" is already set to "{2}"', displayName.category, displayName.label, stringValue);
    }
    return nls.localize("stringValue", 'Set "{0}: {1}" to "{2}"', displayName.category, displayName.label, stringValue);
  }
  numberSettingMessage(setting, numberValue) {
    const displayName = settingKeyToDisplayFormat(setting.key);
    if (this.isAlreadySet(setting, numberValue)) {
      return nls.localize("alreadysetNum", '"{0}: {1}" is already set to {2}', displayName.category, displayName.label, numberValue);
    }
    return nls.localize("numberValue", 'Set "{0}: {1}" to {2}', displayName.category, displayName.label, numberValue);
  }
  renderSetting(setting, newValue) {
    const href = this.settingToUriString(setting.key, newValue);
    const title = nls.localize("changeSettingTitle", "View or change setting");
    return `<code tabindex="0"><a href="${href}" class="codesetting" title="${title}" aria-role="button"><svg width="14" height="14" viewBox="0 0 15 15" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.4.5v1.2l2.4.5.3.8-1.3 2 .8.8 2-1.3.8.3.4 2.3h1.2l.5-2.4.8-.3 2 1.3.8-.8-1.3-2 .3-.8 2.3-.4V7.4l-2.4-.5-.3-.8 1.3-2-.8-.8-2 1.3-.7-.2zM9.4 1l.5 2.4L12 2.1l2 2-1.4 2.1 2.4.4v2.8l-2.4.5L14 12l-2 2-2.1-1.4-.5 2.4H6.6l-.5-2.4L4 13.9l-2-2 1.4-2.1L1 9.4V6.6l2.4-.5L2.1 4l2-2 2.1 1.4.4-2.4h2.8zm.6 7c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zM8 9c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1z"/></svg>
			<span class="separator"></span>
			<span class="setting-name">${setting.key}</span>
		</a></code>`;
  }
  getSettingMessage(setting, newValue) {
    if (setting.type === "boolean") {
      return this.booleanSettingMessage(setting, newValue);
    } else if (setting.type === "string") {
      return this.stringSettingMessage(setting, newValue);
    } else if (setting.type === "number") {
      return this.numberSettingMessage(setting, newValue);
    }
    return void 0;
  }
  async restoreSetting(settingId) {
    const userOriginalSettingValue = this._updatedSettings.get(settingId);
    this._updatedSettings.delete(settingId);
    return this._configurationService.updateValue(settingId, userOriginalSettingValue, ConfigurationTarget.USER);
  }
  async setSetting(settingId, currentSettingValue, newSettingValue) {
    this._updatedSettings.set(settingId, currentSettingValue);
    return this._configurationService.updateValue(settingId, newSettingValue, ConfigurationTarget.USER);
  }
  getActions(uri) {
    if (uri.scheme !== Schemas.codeSetting) {
      return;
    }
    const actions = [];
    const settingId = uri.authority;
    const newSettingValue = this.parseValue(uri.authority, uri.path.substring(1));
    const currentSettingValue = this._configurationService.inspect(settingId).userValue;
    if (newSettingValue !== void 0 && newSettingValue === currentSettingValue && this._updatedSettings.has(settingId)) {
      const restoreMessage = this.restorePreviousSettingMessage(settingId);
      actions.push({
        class: void 0,
        id: "restoreSetting",
        enabled: true,
        tooltip: restoreMessage,
        label: restoreMessage,
        run: () => {
          return this.restoreSetting(settingId);
        }
      });
    } else if (newSettingValue !== void 0) {
      const setting = this.getSetting(settingId);
      const trySettingMessage = setting ? this.getSettingMessage(setting, newSettingValue) : void 0;
      if (setting && trySettingMessage) {
        actions.push({
          class: void 0,
          id: "trySetting",
          enabled: !this.isAlreadySet(setting, newSettingValue),
          tooltip: trySettingMessage,
          label: trySettingMessage,
          run: () => {
            this.setSetting(settingId, currentSettingValue, newSettingValue);
          }
        });
      }
    }
    const viewInSettingsMessage = this.viewInSettingsMessage(settingId, actions.length > 0);
    actions.push({
      class: void 0,
      enabled: true,
      id: "viewInSettings",
      tooltip: viewInSettingsMessage,
      label: viewInSettingsMessage,
      run: () => {
        return this._preferencesService.openApplicationSettings({ query: `@id:${settingId}` });
      }
    });
    actions.push({
      class: void 0,
      enabled: true,
      id: "copySettingId",
      tooltip: nls.localize("copySettingId", "Copy Setting ID"),
      label: nls.localize("copySettingId", "Copy Setting ID"),
      run: () => {
        this._clipboardService.writeText(settingId);
      }
    });
    return actions;
  }
  showContextMenu(uri, x, y) {
    const actions = this.getActions(uri);
    if (!actions) {
      return;
    }
    this._contextMenuService.showContextMenu({
      getAnchor: () => ({ x, y }),
      getActions: () => actions,
      getActionViewItem: (action) => {
        return new ActionViewItem(action, action, { label: true });
      }
    });
  }
  async updateSetting(uri, x, y) {
    if (uri.scheme === Schemas.codeSetting) {
      this._telemetryService.publicLog2("releaseNotesSettingAction", {
        settingId: uri.authority
      });
      return this.showContextMenu(uri, x, y);
    }
  }
};
SimpleSettingRenderer = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IPreferencesService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IClipboardService)
], SimpleSettingRenderer);
export {
  SimpleSettingRenderer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1hcmtkb3duXFxicm93c2VyXFxtYXJrZG93blNldHRpbmdSZW5kZXJlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBUb2tlbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJrZWQvbWFya2VkLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlLCBJU2V0dGluZyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0IH0gZnJvbSAnLi4vLi4vcHJlZmVyZW5jZXMvYnJvd3Nlci9zZXR0aW5nc1RyZWVNb2RlbHMuanMnO1xuXG5leHBvcnQgY2xhc3MgU2ltcGxlU2V0dGluZ1JlbmRlcmVyIHtcblx0cHJpdmF0ZSByZWFkb25seSBjb2RlU2V0dGluZ0FuY2hvclJlZ2V4OiBSZWdFeHA7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29kZVNldHRpbmdTaW1wbGVSZWdleDogUmVnRXhwO1xuXG5cdHByaXZhdGUgX3VwZGF0ZWRTZXR0aW5ncyA9IG5ldyBNYXA8c3RyaW5nLCB1bmtub3duPigpOyAvLyBzZXR0aW5nIElEIHRvIHVzZXIncyBvcmlnaW5hbCBzZXR0aW5nIHZhbHVlXG5cdHByaXZhdGUgX2VuY291bnRlcmVkU2V0dGluZ3MgPSBuZXcgTWFwPHN0cmluZywgSVNldHRpbmc+KCk7IC8vIHNldHRpbmcgSUQgdG8gc2V0dGluZ1xuXHRwcml2YXRlIF9mZWF0dXJlZFNldHRpbmdzID0gbmV3IE1hcDxzdHJpbmcsIHVua25vd24+KCk7IC8vIHNldHRpbmcgSUQgdG8gZmVhdHVyZSB2YWx1ZVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElQcmVmZXJlbmNlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJlZmVyZW5jZXNTZXJ2aWNlOiBJUHJlZmVyZW5jZXNTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuY29kZVNldHRpbmdBbmNob3JSZWdleCA9IG5ldyBSZWdFeHAoYF48YSAoaHJlZik9XCIuKmNvZGUuKjovL3NldHRpbmdzLyhbXlxcXFxzXCJdKylcIig/OlxcXFxzKmNvZGVzZXR0aW5nPVwiKFteXCJdKylcIik/PmApO1xuXHRcdHRoaXMuY29kZVNldHRpbmdTaW1wbGVSZWdleCA9IG5ldyBSZWdFeHAoYF5zZXR0aW5nXFxcXCgoW15cXFxcczopXSspKD86OihbXildKykpP1xcXFwpJGApO1xuXHR9XG5cblx0Z2V0IGZlYXR1cmVkU2V0dGluZ1N0YXRlcygpOiBNYXA8c3RyaW5nLCBib29sZWFuPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE1hcDxzdHJpbmcsIGJvb2xlYW4+KCk7XG5cdFx0Zm9yIChjb25zdCBbc2V0dGluZ0lkLCB2YWx1ZV0gb2YgdGhpcy5fZmVhdHVyZWRTZXR0aW5ncykge1xuXHRcdFx0cmVzdWx0LnNldChzZXR0aW5nSWQsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHNldHRpbmdJZCkgPT09IHZhbHVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgcmVwbGFjZUFuY2hvcihyYXc6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbWF0Y2ggPSB0aGlzLmNvZGVTZXR0aW5nQW5jaG9yUmVnZXguZXhlYyhyYXcpO1xuXHRcdGlmIChtYXRjaCAmJiBtYXRjaC5sZW5ndGggPT09IDQpIHtcblx0XHRcdGNvbnN0IHNldHRpbmdJZCA9IG1hdGNoWzJdO1xuXHRcdFx0Y29uc3QgcmVuZGVyZWQgPSB0aGlzLnJlbmRlcihzZXR0aW5nSWQsIG1hdGNoWzNdKTtcblx0XHRcdGlmIChyZW5kZXJlZCkge1xuXHRcdFx0XHRyZXR1cm4gcmF3LnJlcGxhY2UodGhpcy5jb2RlU2V0dGluZ0FuY2hvclJlZ2V4LCByZW5kZXJlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHJlcGxhY2VTaW1wbGUocmF3OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1hdGNoID0gdGhpcy5jb2RlU2V0dGluZ1NpbXBsZVJlZ2V4LmV4ZWMocmF3KTtcblx0XHRpZiAobWF0Y2ggJiYgbWF0Y2gubGVuZ3RoID09PSAzKSB7XG5cdFx0XHRjb25zdCBzZXR0aW5nSWQgPSBtYXRjaFsxXTtcblx0XHRcdGNvbnN0IHJlbmRlcmVkID0gdGhpcy5yZW5kZXIoc2V0dGluZ0lkLCBtYXRjaFsyXSk7XG5cdFx0XHRpZiAocmVuZGVyZWQpIHtcblx0XHRcdFx0cmV0dXJuIHJhdy5yZXBsYWNlKHRoaXMuY29kZVNldHRpbmdTaW1wbGVSZWdleCwgcmVuZGVyZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0SHRtbFJlbmRlcmVyKCk6ICh0b2tlbjogVG9rZW5zLkhUTUwgfCBUb2tlbnMuVGFnKSA9PiBzdHJpbmcge1xuXHRcdHJldHVybiAoeyByYXcgfTogVG9rZW5zLkhUTUwgfCBUb2tlbnMuVGFnKTogc3RyaW5nID0+IHtcblx0XHRcdGNvbnN0IHJlcGxhY2VkQW5jaG9yID0gdGhpcy5yZXBsYWNlQW5jaG9yKHJhdyk7XG5cdFx0XHRpZiAocmVwbGFjZWRBbmNob3IpIHtcblx0XHRcdFx0cmF3ID0gcmVwbGFjZWRBbmNob3I7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmF3O1xuXHRcdH07XG5cdH1cblxuXHRnZXRDb2RlU3BhblJlbmRlcmVyKCk6ICh0b2tlbjogVG9rZW5zLkNvZGVzcGFuKSA9PiBzdHJpbmcge1xuXHRcdHJldHVybiAoeyB0ZXh0IH06IFRva2Vucy5Db2Rlc3Bhbik6IHN0cmluZyA9PiB7XG5cdFx0XHRjb25zdCByZXBsYWNlZFNpbXBsZSA9IHRoaXMucmVwbGFjZVNpbXBsZSh0ZXh0KTtcblx0XHRcdGlmIChyZXBsYWNlZFNpbXBsZSkge1xuXHRcdFx0XHRyZXR1cm4gcmVwbGFjZWRTaW1wbGU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYDxjb2RlPiR7dGV4dH08L2NvZGU+YDtcblx0XHR9O1xuXHR9XG5cblx0c2V0dGluZ1RvVXJpU3RyaW5nKHNldHRpbmdJZDogc3RyaW5nLCB2YWx1ZT86IHVua25vd24pOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtTY2hlbWFzLmNvZGVTZXR0aW5nfTovLyR7c2V0dGluZ0lkfSR7dmFsdWUgPyBgLyR7dmFsdWV9YCA6ICcnfWA7XG5cdH1cblxuXHRwcml2YXRlIGdldFNldHRpbmcoc2V0dGluZ0lkOiBzdHJpbmcpOiBJU2V0dGluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX2VuY291bnRlcmVkU2V0dGluZ3MuaGFzKHNldHRpbmdJZCkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9lbmNvdW50ZXJlZFNldHRpbmdzLmdldChzZXR0aW5nSWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcHJlZmVyZW5jZXNTZXJ2aWNlLmdldFNldHRpbmcoc2V0dGluZ0lkKTtcblx0fVxuXG5cdHBhcnNlVmFsdWUoc2V0dGluZ0lkOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpIHtcblx0XHRpZiAodmFsdWUgPT09ICd1bmRlZmluZWQnIHx8IHZhbHVlID09PSAnJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2V0dGluZyA9IHRoaXMuZ2V0U2V0dGluZyhzZXR0aW5nSWQpO1xuXHRcdGlmICghc2V0dGluZykge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAoc2V0dGluZy50eXBlKSB7XG5cdFx0XHRjYXNlICdib29sZWFuJzpcblx0XHRcdFx0cmV0dXJuIHZhbHVlID09PSAndHJ1ZSc7XG5cdFx0XHRjYXNlICdudW1iZXInOlxuXHRcdFx0XHRyZXR1cm4gcGFyc2VJbnQodmFsdWUsIDEwKTtcblx0XHRcdGNhc2UgJ3N0cmluZyc6XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXIoc2V0dGluZ0lkOiBzdHJpbmcsIG5ld1ZhbHVlOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNldHRpbmcgPSB0aGlzLmdldFNldHRpbmcoc2V0dGluZ0lkKTtcblx0XHRpZiAoIXNldHRpbmcpIHtcblx0XHRcdHJldHVybiBgPGNvZGU+JHtzZXR0aW5nSWR9PC9jb2RlPmA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucmVuZGVyU2V0dGluZyhzZXR0aW5nLCBuZXdWYWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHZpZXdJblNldHRpbmdzTWVzc2FnZShzZXR0aW5nSWQ6IHN0cmluZywgYWxyZWFkeURpc3BsYXllZDogYm9vbGVhbikge1xuXHRcdGlmIChhbHJlYWR5RGlzcGxheWVkKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCd2aWV3SW5TZXR0aW5ncycsIFwiVmlldyBpbiBTZXR0aW5nc1wiKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0KHNldHRpbmdJZCk7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCd2aWV3SW5TZXR0aW5nc0RldGFpbGVkJywgXCJWaWV3IFxcXCJ7MH06IHsxfVxcXCIgaW4gU2V0dGluZ3NcIiwgZGlzcGxheU5hbWUuY2F0ZWdvcnksIGRpc3BsYXlOYW1lLmxhYmVsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlc3RvcmVQcmV2aW91c1NldHRpbmdNZXNzYWdlKHNldHRpbmdJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBkaXNwbGF5TmFtZSA9IHNldHRpbmdLZXlUb0Rpc3BsYXlGb3JtYXQoc2V0dGluZ0lkKTtcblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdyZXN0b3JlUHJldmlvdXNWYWx1ZScsIFwiUmVzdG9yZSB2YWx1ZSBvZiBcXFwiezB9OiB7MX1cXFwiXCIsIGRpc3BsYXlOYW1lLmNhdGVnb3J5LCBkaXNwbGF5TmFtZS5sYWJlbCk7XG5cdH1cblxuXHRwcml2YXRlIGlzQWxyZWFkeVNldChzZXR0aW5nOiBJU2V0dGluZywgdmFsdWU6IHN0cmluZyB8IG51bWJlciB8IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRjb25zdCBjdXJyZW50VmFsdWUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihzZXR0aW5nLmtleSk7XG5cdFx0cmV0dXJuIChjdXJyZW50VmFsdWUgPT09IHZhbHVlIHx8IChjdXJyZW50VmFsdWUgPT09IHVuZGVmaW5lZCAmJiBzZXR0aW5nLnZhbHVlID09PSB2YWx1ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBib29sZWFuU2V0dGluZ01lc3NhZ2Uoc2V0dGluZzogSVNldHRpbmcsIGJvb2xlYW5WYWx1ZTogYm9vbGVhbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0KHNldHRpbmcua2V5KTtcblx0XHRpZiAodGhpcy5pc0FscmVhZHlTZXQoc2V0dGluZywgYm9vbGVhblZhbHVlKSkge1xuXHRcdFx0aWYgKGJvb2xlYW5WYWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdhbHJlYWR5c2V0Qm9vbFRydWUnLCBcIlxcXCJ7MH06IHsxfVxcXCIgaXMgYWxyZWFkeSBlbmFibGVkXCIsIGRpc3BsYXlOYW1lLmNhdGVnb3J5LCBkaXNwbGF5TmFtZS5sYWJlbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdhbHJlYWR5c2V0Qm9vbEZhbHNlJywgXCJcXFwiezB9OiB7MX1cXFwiIGlzIGFscmVhZHkgZGlzYWJsZWRcIiwgZGlzcGxheU5hbWUuY2F0ZWdvcnksIGRpc3BsYXlOYW1lLmxhYmVsKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoYm9vbGVhblZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCd0cnVlTWVzc2FnZScsIFwiRW5hYmxlIFxcXCJ7MH06IHsxfVxcXCJcIiwgZGlzcGxheU5hbWUuY2F0ZWdvcnksIGRpc3BsYXlOYW1lLmxhYmVsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnZmFsc2VNZXNzYWdlJywgXCJEaXNhYmxlIFxcXCJ7MH06IHsxfVxcXCJcIiwgZGlzcGxheU5hbWUuY2F0ZWdvcnksIGRpc3BsYXlOYW1lLmxhYmVsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0cmluZ1NldHRpbmdNZXNzYWdlKHNldHRpbmc6IElTZXR0aW5nLCBzdHJpbmdWYWx1ZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBkaXNwbGF5TmFtZSA9IHNldHRpbmdLZXlUb0Rpc3BsYXlGb3JtYXQoc2V0dGluZy5rZXkpO1xuXHRcdGlmICh0aGlzLmlzQWxyZWFkeVNldChzZXR0aW5nLCBzdHJpbmdWYWx1ZSkpIHtcblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2FscmVhZHlzZXRTdHJpbmcnLCBcIlxcXCJ7MH06IHsxfVxcXCIgaXMgYWxyZWFkeSBzZXQgdG8gXFxcInsyfVxcXCJcIiwgZGlzcGxheU5hbWUuY2F0ZWdvcnksIGRpc3BsYXlOYW1lLmxhYmVsLCBzdHJpbmdWYWx1ZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnc3RyaW5nVmFsdWUnLCBcIlNldCBcXFwiezB9OiB7MX1cXFwiIHRvIFxcXCJ7Mn1cXFwiXCIsIGRpc3BsYXlOYW1lLmNhdGVnb3J5LCBkaXNwbGF5TmFtZS5sYWJlbCwgc3RyaW5nVmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBudW1iZXJTZXR0aW5nTWVzc2FnZShzZXR0aW5nOiBJU2V0dGluZywgbnVtYmVyVmFsdWU6IG51bWJlcik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0KHNldHRpbmcua2V5KTtcblx0XHRpZiAodGhpcy5pc0FscmVhZHlTZXQoc2V0dGluZywgbnVtYmVyVmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdhbHJlYWR5c2V0TnVtJywgXCJcXFwiezB9OiB7MX1cXFwiIGlzIGFscmVhZHkgc2V0IHRvIHsyfVwiLCBkaXNwbGF5TmFtZS5jYXRlZ29yeSwgZGlzcGxheU5hbWUubGFiZWwsIG51bWJlclZhbHVlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdudW1iZXJWYWx1ZScsIFwiU2V0IFxcXCJ7MH06IHsxfVxcXCIgdG8gezJ9XCIsIGRpc3BsYXlOYW1lLmNhdGVnb3J5LCBkaXNwbGF5TmFtZS5sYWJlbCwgbnVtYmVyVmFsdWUpO1xuXG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclNldHRpbmcoc2V0dGluZzogSVNldHRpbmcsIG5ld1ZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGhyZWYgPSB0aGlzLnNldHRpbmdUb1VyaVN0cmluZyhzZXR0aW5nLmtleSwgbmV3VmFsdWUpO1xuXHRcdGNvbnN0IHRpdGxlID0gbmxzLmxvY2FsaXplKCdjaGFuZ2VTZXR0aW5nVGl0bGUnLCBcIlZpZXcgb3IgY2hhbmdlIHNldHRpbmdcIik7XG5cdFx0cmV0dXJuIGA8Y29kZSB0YWJpbmRleD1cIjBcIj48YSBocmVmPVwiJHtocmVmfVwiIGNsYXNzPVwiY29kZXNldHRpbmdcIiB0aXRsZT1cIiR7dGl0bGV9XCIgYXJpYS1yb2xlPVwiYnV0dG9uXCI+PHN2ZyB3aWR0aD1cIjE0XCIgaGVpZ2h0PVwiMTRcIiB2aWV3Qm94PVwiMCAwIDE1IDE1XCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIGZpbGw9XCJjdXJyZW50Q29sb3JcIj48cGF0aCBkPVwiTTkuMSA0LjRMOC42IDJINy40bC0uNSAyLjQtLjcuMy0yLTEuMy0uOS44IDEuMyAyLS4yLjctMi40LjV2MS4ybDIuNC41LjMuOC0xLjMgMiAuOC44IDItMS4zLjguMy40IDIuM2gxLjJsLjUtMi40LjgtLjMgMiAxLjMuOC0uOC0xLjMtMiAuMy0uOCAyLjMtLjRWNy40bC0yLjQtLjUtLjMtLjggMS4zLTItLjgtLjgtMiAxLjMtLjctLjJ6TTkuNCAxbC41IDIuNEwxMiAyLjFsMiAyLTEuNCAyLjEgMi40LjR2Mi44bC0yLjQuNUwxNCAxMmwtMiAyLTIuMS0xLjQtLjUgMi40SDYuNmwtLjUtMi40TDQgMTMuOWwtMi0yIDEuNC0yLjFMMSA5LjRWNi42bDIuNC0uNUwyLjEgNGwyLTIgMi4xIDEuNC40LTIuNGgyLjh6bS42IDdjMCAxLjEtLjkgMi0yIDJzLTItLjktMi0yIC45LTIgMi0yIDIgLjkgMiAyek04IDljLjYgMCAxLS40IDEtMXMtLjQtMS0xLTEtMSAuNC0xIDEgLjQgMSAxIDF6XCIvPjwvc3ZnPlxuXHRcdFx0PHNwYW4gY2xhc3M9XCJzZXBhcmF0b3JcIj48L3NwYW4+XG5cdFx0XHQ8c3BhbiBjbGFzcz1cInNldHRpbmctbmFtZVwiPiR7c2V0dGluZy5rZXl9PC9zcGFuPlxuXHRcdDwvYT48L2NvZGU+YDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U2V0dGluZ01lc3NhZ2Uoc2V0dGluZzogSVNldHRpbmcsIG5ld1ZhbHVlOiBib29sZWFuIHwgc3RyaW5nIHwgbnVtYmVyKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoc2V0dGluZy50eXBlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiB0aGlzLmJvb2xlYW5TZXR0aW5nTWVzc2FnZShzZXR0aW5nLCBuZXdWYWx1ZSBhcyBib29sZWFuKTtcblx0XHR9IGVsc2UgaWYgKHNldHRpbmcudHlwZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB0aGlzLnN0cmluZ1NldHRpbmdNZXNzYWdlKHNldHRpbmcsIG5ld1ZhbHVlIGFzIHN0cmluZyk7XG5cdFx0fSBlbHNlIGlmIChzZXR0aW5nLnR5cGUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5udW1iZXJTZXR0aW5nTWVzc2FnZShzZXR0aW5nLCBuZXdWYWx1ZSBhcyBudW1iZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgcmVzdG9yZVNldHRpbmcoc2V0dGluZ0lkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB1c2VyT3JpZ2luYWxTZXR0aW5nVmFsdWUgPSB0aGlzLl91cGRhdGVkU2V0dGluZ3MuZ2V0KHNldHRpbmdJZCk7XG5cdFx0dGhpcy5fdXBkYXRlZFNldHRpbmdzLmRlbGV0ZShzZXR0aW5nSWQpO1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShzZXR0aW5nSWQsIHVzZXJPcmlnaW5hbFNldHRpbmdWYWx1ZSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0fVxuXG5cdGFzeW5jIHNldFNldHRpbmcoc2V0dGluZ0lkOiBzdHJpbmcsIGN1cnJlbnRTZXR0aW5nVmFsdWU6IHVua25vd24sIG5ld1NldHRpbmdWYWx1ZTogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3VwZGF0ZWRTZXR0aW5ncy5zZXQoc2V0dGluZ0lkLCBjdXJyZW50U2V0dGluZ1ZhbHVlKTtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoc2V0dGluZ0lkLCBuZXdTZXR0aW5nVmFsdWUsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdH1cblxuXHRnZXRBY3Rpb25zKHVyaTogVVJJKSB7XG5cdFx0aWYgKHVyaS5zY2hlbWUgIT09IFNjaGVtYXMuY29kZVNldHRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblxuXHRcdGNvbnN0IHNldHRpbmdJZCA9IHVyaS5hdXRob3JpdHk7XG5cdFx0Y29uc3QgbmV3U2V0dGluZ1ZhbHVlID0gdGhpcy5wYXJzZVZhbHVlKHVyaS5hdXRob3JpdHksIHVyaS5wYXRoLnN1YnN0cmluZygxKSk7XG5cdFx0Y29uc3QgY3VycmVudFNldHRpbmdWYWx1ZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Qoc2V0dGluZ0lkKS51c2VyVmFsdWU7XG5cblx0XHRpZiAoKG5ld1NldHRpbmdWYWx1ZSAhPT0gdW5kZWZpbmVkKSAmJiBuZXdTZXR0aW5nVmFsdWUgPT09IGN1cnJlbnRTZXR0aW5nVmFsdWUgJiYgdGhpcy5fdXBkYXRlZFNldHRpbmdzLmhhcyhzZXR0aW5nSWQpKSB7XG5cdFx0XHRjb25zdCByZXN0b3JlTWVzc2FnZSA9IHRoaXMucmVzdG9yZVByZXZpb3VzU2V0dGluZ01lc3NhZ2Uoc2V0dGluZ0lkKTtcblx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdGlkOiAncmVzdG9yZVNldHRpbmcnLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHR0b29sdGlwOiByZXN0b3JlTWVzc2FnZSxcblx0XHRcdFx0bGFiZWw6IHJlc3RvcmVNZXNzYWdlLFxuXHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5yZXN0b3JlU2V0dGluZyhzZXR0aW5nSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKG5ld1NldHRpbmdWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBzZXR0aW5nID0gdGhpcy5nZXRTZXR0aW5nKHNldHRpbmdJZCk7XG5cdFx0XHRjb25zdCB0cnlTZXR0aW5nTWVzc2FnZSA9IHNldHRpbmcgPyB0aGlzLmdldFNldHRpbmdNZXNzYWdlKHNldHRpbmcsIG5ld1NldHRpbmdWYWx1ZSkgOiB1bmRlZmluZWQ7XG5cblx0XHRcdGlmIChzZXR0aW5nICYmIHRyeVNldHRpbmdNZXNzYWdlKSB7XG5cdFx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRpZDogJ3RyeVNldHRpbmcnLFxuXHRcdFx0XHRcdGVuYWJsZWQ6ICF0aGlzLmlzQWxyZWFkeVNldChzZXR0aW5nLCBuZXdTZXR0aW5nVmFsdWUpLFxuXHRcdFx0XHRcdHRvb2x0aXA6IHRyeVNldHRpbmdNZXNzYWdlLFxuXHRcdFx0XHRcdGxhYmVsOiB0cnlTZXR0aW5nTWVzc2FnZSxcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuc2V0U2V0dGluZyhzZXR0aW5nSWQsIGN1cnJlbnRTZXR0aW5nVmFsdWUsIG5ld1NldHRpbmdWYWx1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB2aWV3SW5TZXR0aW5nc01lc3NhZ2UgPSB0aGlzLnZpZXdJblNldHRpbmdzTWVzc2FnZShzZXR0aW5nSWQsIGFjdGlvbnMubGVuZ3RoID4gMCk7XG5cdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0aWQ6ICd2aWV3SW5TZXR0aW5ncycsXG5cdFx0XHR0b29sdGlwOiB2aWV3SW5TZXR0aW5nc01lc3NhZ2UsXG5cdFx0XHRsYWJlbDogdmlld0luU2V0dGluZ3NNZXNzYWdlLFxuXHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcmVmZXJlbmNlc1NlcnZpY2Uub3BlbkFwcGxpY2F0aW9uU2V0dGluZ3MoeyBxdWVyeTogYEBpZDoke3NldHRpbmdJZH1gIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0aWQ6ICdjb3B5U2V0dGluZ0lkJyxcblx0XHRcdHRvb2x0aXA6IG5scy5sb2NhbGl6ZSgnY29weVNldHRpbmdJZCcsIFwiQ29weSBTZXR0aW5nIElEXCIpLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnY29weVNldHRpbmdJZCcsIFwiQ29weSBTZXR0aW5nIElEXCIpLFxuXHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2NsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHNldHRpbmdJZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gYWN0aW9ucztcblx0fVxuXG5cdHByaXZhdGUgc2hvd0NvbnRleHRNZW51KHVyaTogVVJJLCB4OiBudW1iZXIsIHk6IG51bWJlcikge1xuXHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLmdldEFjdGlvbnModXJpKTtcblx0XHRpZiAoIWFjdGlvbnMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gKHsgeCwgeSB9KSxcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRnZXRBY3Rpb25WaWV3SXRlbTogKGFjdGlvbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gbmV3IEFjdGlvblZpZXdJdGVtKGFjdGlvbiwgYWN0aW9uLCB7IGxhYmVsOiB0cnVlIH0pO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZVNldHRpbmcodXJpOiBVUkksIHg6IG51bWJlciwgeTogbnVtYmVyKSB7XG5cdFx0aWYgKHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuY29kZVNldHRpbmcpIHtcblx0XHRcdHR5cGUgUmVsZWFzZU5vdGVzU2V0dGluZ1VzZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0b3duZXI6ICdhbGV4cjAwJztcblx0XHRcdFx0Y29tbWVudDogJ1VzZWQgdG8gdW5kZXJzdGFuZCBpZiB0aGUgYWN0aW9uIHRvIHVwZGF0ZSBzZXR0aW5ncyBmcm9tIHRoZSByZWxlYXNlIG5vdGVzIGlzIHVzZWQuJztcblx0XHRcdFx0c2V0dGluZ0lkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGlkIG9mIHRoZSBzZXR0aW5nIHRoYXQgd2FzIGNsaWNrZWQgb24gaW4gdGhlIHJlbGVhc2Ugbm90ZXMnIH07XG5cdFx0XHR9O1xuXHRcdFx0dHlwZSBSZWxlYXNlTm90ZXNTZXR0aW5nVXNlZCA9IHtcblx0XHRcdFx0c2V0dGluZ0lkOiBzdHJpbmc7XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFJlbGVhc2VOb3Rlc1NldHRpbmdVc2VkLCBSZWxlYXNlTm90ZXNTZXR0aW5nVXNlZENsYXNzaWZpY2F0aW9uPigncmVsZWFzZU5vdGVzU2V0dGluZ0FjdGlvbicsIHtcblx0XHRcdFx0c2V0dGluZ0lkOiB1cmkuYXV0aG9yaXR5XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB0aGlzLnNob3dDb250ZXh0TWVudSh1cmksIHgsIHkpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHNCQUFzQjtBQUcvQixTQUFTLGVBQWU7QUFFeEIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUFxQztBQUM5QyxTQUFTLGlDQUFpQztBQUVuQyxJQUFNLHdCQUFOLE1BQTRCO0FBQUE7QUFBQSxFQVFsQyxZQUN5Qyx1QkFDRixxQkFDQSxxQkFDRixtQkFDQSxtQkFDbkM7QUFMdUM7QUFDRjtBQUNBO0FBQ0Y7QUFDQTtBQVRyQyxTQUFRLG1CQUFtQixvQkFBSSxJQUFxQjtBQUNwRDtBQUFBLFNBQVEsdUJBQXVCLG9CQUFJLElBQXNCO0FBQ3pEO0FBQUEsU0FBUSxvQkFBb0Isb0JBQUksSUFBcUI7QUFTcEQsU0FBSyx5QkFBeUIsSUFBSSxPQUFPLDRFQUE0RTtBQUNySCxTQUFLLHlCQUF5QixJQUFJLE9BQU8seUNBQXlDO0FBQUEsRUFDbkY7QUFBQSxFQUVBLElBQUksd0JBQThDO0FBQ2pELFVBQU0sU0FBUyxvQkFBSSxJQUFxQjtBQUN4QyxlQUFXLENBQUMsV0FBVyxLQUFLLEtBQUssS0FBSyxtQkFBbUI7QUFDeEQsYUFBTyxJQUFJLFdBQVcsS0FBSyxzQkFBc0IsU0FBUyxTQUFTLE1BQU0sS0FBSztBQUFBLElBQy9FO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGNBQWMsS0FBaUM7QUFDdEQsVUFBTSxRQUFRLEtBQUssdUJBQXVCLEtBQUssR0FBRztBQUNsRCxRQUFJLFNBQVMsTUFBTSxXQUFXLEdBQUc7QUFDaEMsWUFBTSxZQUFZLE1BQU0sQ0FBQztBQUN6QixZQUFNLFdBQVcsS0FBSyxPQUFPLFdBQVcsTUFBTSxDQUFDLENBQUM7QUFDaEQsVUFBSSxVQUFVO0FBQ2IsZUFBTyxJQUFJLFFBQVEsS0FBSyx3QkFBd0IsUUFBUTtBQUFBLE1BQ3pEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxjQUFjLEtBQWlDO0FBQ3RELFVBQU0sUUFBUSxLQUFLLHVCQUF1QixLQUFLLEdBQUc7QUFDbEQsUUFBSSxTQUFTLE1BQU0sV0FBVyxHQUFHO0FBQ2hDLFlBQU0sWUFBWSxNQUFNLENBQUM7QUFDekIsWUFBTSxXQUFXLEtBQUssT0FBTyxXQUFXLE1BQU0sQ0FBQyxDQUFDO0FBQ2hELFVBQUksVUFBVTtBQUNiLGVBQU8sSUFBSSxRQUFRLEtBQUssd0JBQXdCLFFBQVE7QUFBQSxNQUN6RDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsa0JBQStEO0FBQzlELFdBQU8sQ0FBQyxFQUFFLElBQUksTUFBd0M7QUFDckQsWUFBTSxpQkFBaUIsS0FBSyxjQUFjLEdBQUc7QUFDN0MsVUFBSSxnQkFBZ0I7QUFDbkIsY0FBTTtBQUFBLE1BQ1A7QUFDQSxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLHNCQUEwRDtBQUN6RCxXQUFPLENBQUMsRUFBRSxLQUFLLE1BQStCO0FBQzdDLFlBQU0saUJBQWlCLEtBQUssY0FBYyxJQUFJO0FBQzlDLFVBQUksZ0JBQWdCO0FBQ25CLGVBQU87QUFBQSxNQUNSO0FBQ0EsYUFBTyxTQUFTLElBQUk7QUFBQSxJQUNyQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLG1CQUFtQixXQUFtQixPQUF5QjtBQUM5RCxXQUFPLEdBQUcsUUFBUSxXQUFXLE1BQU0sU0FBUyxHQUFHLFFBQVEsSUFBSSxLQUFLLEtBQUssRUFBRTtBQUFBLEVBQ3hFO0FBQUEsRUFFUSxXQUFXLFdBQXlDO0FBQzNELFFBQUksS0FBSyxxQkFBcUIsSUFBSSxTQUFTLEdBQUc7QUFDN0MsYUFBTyxLQUFLLHFCQUFxQixJQUFJLFNBQVM7QUFBQSxJQUMvQztBQUNBLFdBQU8sS0FBSyxvQkFBb0IsV0FBVyxTQUFTO0FBQUEsRUFDckQ7QUFBQSxFQUVBLFdBQVcsV0FBbUIsT0FBZTtBQUM1QyxRQUFJLFVBQVUsZUFBZSxVQUFVLElBQUk7QUFDMUMsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFVBQVUsS0FBSyxXQUFXLFNBQVM7QUFDekMsUUFBSSxDQUFDLFNBQVM7QUFDYixhQUFPO0FBQUEsSUFDUjtBQUVBLFlBQVEsUUFBUSxNQUFNO0FBQUEsTUFDckIsS0FBSztBQUNKLGVBQU8sVUFBVTtBQUFBLE1BQ2xCLEtBQUs7QUFDSixlQUFPLFNBQVMsT0FBTyxFQUFFO0FBQUEsTUFDMUIsS0FBSztBQUFBLE1BQ0w7QUFDQyxlQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLE9BQU8sV0FBbUIsVUFBc0M7QUFDdkUsVUFBTSxVQUFVLEtBQUssV0FBVyxTQUFTO0FBQ3pDLFFBQUksQ0FBQyxTQUFTO0FBQ2IsYUFBTyxTQUFTLFNBQVM7QUFBQSxJQUMxQjtBQUVBLFdBQU8sS0FBSyxjQUFjLFNBQVMsUUFBUTtBQUFBLEVBQzVDO0FBQUEsRUFFUSxzQkFBc0IsV0FBbUIsa0JBQTJCO0FBQzNFLFFBQUksa0JBQWtCO0FBQ3JCLGFBQU8sSUFBSSxTQUFTLGtCQUFrQixrQkFBa0I7QUFBQSxJQUN6RCxPQUFPO0FBQ04sWUFBTSxjQUFjLDBCQUEwQixTQUFTO0FBQ3ZELGFBQU8sSUFBSSxTQUFTLDBCQUEwQiwrQkFBaUMsWUFBWSxVQUFVLFlBQVksS0FBSztBQUFBLElBQ3ZIO0FBQUEsRUFDRDtBQUFBLEVBRVEsOEJBQThCLFdBQTJCO0FBQ2hFLFVBQU0sY0FBYywwQkFBMEIsU0FBUztBQUN2RCxXQUFPLElBQUksU0FBUyx3QkFBd0IsK0JBQWlDLFlBQVksVUFBVSxZQUFZLEtBQUs7QUFBQSxFQUNySDtBQUFBLEVBRVEsYUFBYSxTQUFtQixPQUEyQztBQUNsRixVQUFNLGVBQWUsS0FBSyxzQkFBc0IsU0FBa0IsUUFBUSxHQUFHO0FBQzdFLFdBQVEsaUJBQWlCLFNBQVUsaUJBQWlCLFVBQWEsUUFBUSxVQUFVO0FBQUEsRUFDcEY7QUFBQSxFQUVRLHNCQUFzQixTQUFtQixjQUEyQztBQUMzRixVQUFNLGNBQWMsMEJBQTBCLFFBQVEsR0FBRztBQUN6RCxRQUFJLEtBQUssYUFBYSxTQUFTLFlBQVksR0FBRztBQUM3QyxVQUFJLGNBQWM7QUFDakIsZUFBTyxJQUFJLFNBQVMsc0JBQXNCLGlDQUFtQyxZQUFZLFVBQVUsWUFBWSxLQUFLO0FBQUEsTUFDckgsT0FBTztBQUNOLGVBQU8sSUFBSSxTQUFTLHVCQUF1QixrQ0FBb0MsWUFBWSxVQUFVLFlBQVksS0FBSztBQUFBLE1BQ3ZIO0FBQUEsSUFDRDtBQUVBLFFBQUksY0FBYztBQUNqQixhQUFPLElBQUksU0FBUyxlQUFlLHFCQUF1QixZQUFZLFVBQVUsWUFBWSxLQUFLO0FBQUEsSUFDbEcsT0FBTztBQUNOLGFBQU8sSUFBSSxTQUFTLGdCQUFnQixzQkFBd0IsWUFBWSxVQUFVLFlBQVksS0FBSztBQUFBLElBQ3BHO0FBQUEsRUFDRDtBQUFBLEVBRVEscUJBQXFCLFNBQW1CLGFBQXlDO0FBQ3hGLFVBQU0sY0FBYywwQkFBMEIsUUFBUSxHQUFHO0FBQ3pELFFBQUksS0FBSyxhQUFhLFNBQVMsV0FBVyxHQUFHO0FBQzVDLGFBQU8sSUFBSSxTQUFTLG9CQUFvQixzQ0FBMEMsWUFBWSxVQUFVLFlBQVksT0FBTyxXQUFXO0FBQUEsSUFDdkk7QUFFQSxXQUFPLElBQUksU0FBUyxlQUFlLDJCQUErQixZQUFZLFVBQVUsWUFBWSxPQUFPLFdBQVc7QUFBQSxFQUN2SDtBQUFBLEVBRVEscUJBQXFCLFNBQW1CLGFBQXlDO0FBQ3hGLFVBQU0sY0FBYywwQkFBMEIsUUFBUSxHQUFHO0FBQ3pELFFBQUksS0FBSyxhQUFhLFNBQVMsV0FBVyxHQUFHO0FBQzVDLGFBQU8sSUFBSSxTQUFTLGlCQUFpQixvQ0FBc0MsWUFBWSxVQUFVLFlBQVksT0FBTyxXQUFXO0FBQUEsSUFDaEk7QUFFQSxXQUFPLElBQUksU0FBUyxlQUFlLHlCQUEyQixZQUFZLFVBQVUsWUFBWSxPQUFPLFdBQVc7QUFBQSxFQUVuSDtBQUFBLEVBRVEsY0FBYyxTQUFtQixVQUFrRDtBQUMxRixVQUFNLE9BQU8sS0FBSyxtQkFBbUIsUUFBUSxLQUFLLFFBQVE7QUFDMUQsVUFBTSxRQUFRLElBQUksU0FBUyxzQkFBc0Isd0JBQXdCO0FBQ3pFLFdBQU8sK0JBQStCLElBQUksZ0NBQWdDLEtBQUs7QUFBQTtBQUFBLGdDQUVqRCxRQUFRLEdBQUc7QUFBQTtBQUFBLEVBRTFDO0FBQUEsRUFFUSxrQkFBa0IsU0FBbUIsVUFBeUQ7QUFDckcsUUFBSSxRQUFRLFNBQVMsV0FBVztBQUMvQixhQUFPLEtBQUssc0JBQXNCLFNBQVMsUUFBbUI7QUFBQSxJQUMvRCxXQUFXLFFBQVEsU0FBUyxVQUFVO0FBQ3JDLGFBQU8sS0FBSyxxQkFBcUIsU0FBUyxRQUFrQjtBQUFBLElBQzdELFdBQVcsUUFBUSxTQUFTLFVBQVU7QUFDckMsYUFBTyxLQUFLLHFCQUFxQixTQUFTLFFBQWtCO0FBQUEsSUFDN0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxlQUFlLFdBQWtDO0FBQ3RELFVBQU0sMkJBQTJCLEtBQUssaUJBQWlCLElBQUksU0FBUztBQUNwRSxTQUFLLGlCQUFpQixPQUFPLFNBQVM7QUFDdEMsV0FBTyxLQUFLLHNCQUFzQixZQUFZLFdBQVcsMEJBQTBCLG9CQUFvQixJQUFJO0FBQUEsRUFDNUc7QUFBQSxFQUVBLE1BQU0sV0FBVyxXQUFtQixxQkFBOEIsaUJBQXlDO0FBQzFHLFNBQUssaUJBQWlCLElBQUksV0FBVyxtQkFBbUI7QUFDeEQsV0FBTyxLQUFLLHNCQUFzQixZQUFZLFdBQVcsaUJBQWlCLG9CQUFvQixJQUFJO0FBQUEsRUFDbkc7QUFBQSxFQUVBLFdBQVcsS0FBVTtBQUNwQixRQUFJLElBQUksV0FBVyxRQUFRLGFBQWE7QUFDdkM7QUFBQSxJQUNEO0FBRUEsVUFBTSxVQUFxQixDQUFDO0FBRTVCLFVBQU0sWUFBWSxJQUFJO0FBQ3RCLFVBQU0sa0JBQWtCLEtBQUssV0FBVyxJQUFJLFdBQVcsSUFBSSxLQUFLLFVBQVUsQ0FBQyxDQUFDO0FBQzVFLFVBQU0sc0JBQXNCLEtBQUssc0JBQXNCLFFBQVEsU0FBUyxFQUFFO0FBRTFFLFFBQUssb0JBQW9CLFVBQWMsb0JBQW9CLHVCQUF1QixLQUFLLGlCQUFpQixJQUFJLFNBQVMsR0FBRztBQUN2SCxZQUFNLGlCQUFpQixLQUFLLDhCQUE4QixTQUFTO0FBQ25FLGNBQVEsS0FBSztBQUFBLFFBQ1osT0FBTztBQUFBLFFBQ1AsSUFBSTtBQUFBLFFBQ0osU0FBUztBQUFBLFFBQ1QsU0FBUztBQUFBLFFBQ1QsT0FBTztBQUFBLFFBQ1AsS0FBSyxNQUFNO0FBQ1YsaUJBQU8sS0FBSyxlQUFlLFNBQVM7QUFBQSxRQUNyQztBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsV0FBVyxvQkFBb0IsUUFBVztBQUN6QyxZQUFNLFVBQVUsS0FBSyxXQUFXLFNBQVM7QUFDekMsWUFBTSxvQkFBb0IsVUFBVSxLQUFLLGtCQUFrQixTQUFTLGVBQWUsSUFBSTtBQUV2RixVQUFJLFdBQVcsbUJBQW1CO0FBQ2pDLGdCQUFRLEtBQUs7QUFBQSxVQUNaLE9BQU87QUFBQSxVQUNQLElBQUk7QUFBQSxVQUNKLFNBQVMsQ0FBQyxLQUFLLGFBQWEsU0FBUyxlQUFlO0FBQUEsVUFDcEQsU0FBUztBQUFBLFVBQ1QsT0FBTztBQUFBLFVBQ1AsS0FBSyxNQUFNO0FBQ1YsaUJBQUssV0FBVyxXQUFXLHFCQUFxQixlQUFlO0FBQUEsVUFDaEU7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUVBLFVBQU0sd0JBQXdCLEtBQUssc0JBQXNCLFdBQVcsUUFBUSxTQUFTLENBQUM7QUFDdEYsWUFBUSxLQUFLO0FBQUEsTUFDWixPQUFPO0FBQUEsTUFDUCxTQUFTO0FBQUEsTUFDVCxJQUFJO0FBQUEsTUFDSixTQUFTO0FBQUEsTUFDVCxPQUFPO0FBQUEsTUFDUCxLQUFLLE1BQU07QUFDVixlQUFPLEtBQUssb0JBQW9CLHdCQUF3QixFQUFFLE9BQU8sT0FBTyxTQUFTLEdBQUcsQ0FBQztBQUFBLE1BQ3RGO0FBQUEsSUFDRCxDQUFDO0FBRUQsWUFBUSxLQUFLO0FBQUEsTUFDWixPQUFPO0FBQUEsTUFDUCxTQUFTO0FBQUEsTUFDVCxJQUFJO0FBQUEsTUFDSixTQUFTLElBQUksU0FBUyxpQkFBaUIsaUJBQWlCO0FBQUEsTUFDeEQsT0FBTyxJQUFJLFNBQVMsaUJBQWlCLGlCQUFpQjtBQUFBLE1BQ3RELEtBQUssTUFBTTtBQUNWLGFBQUssa0JBQWtCLFVBQVUsU0FBUztBQUFBLE1BQzNDO0FBQUEsSUFDRCxDQUFDO0FBRUQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGdCQUFnQixLQUFVLEdBQVcsR0FBVztBQUN2RCxVQUFNLFVBQVUsS0FBSyxXQUFXLEdBQUc7QUFDbkMsUUFBSSxDQUFDLFNBQVM7QUFDYjtBQUFBLElBQ0Q7QUFFQSxTQUFLLG9CQUFvQixnQkFBZ0I7QUFBQSxNQUN4QyxXQUFXLE9BQU8sRUFBRSxHQUFHLEVBQUU7QUFBQSxNQUN6QixZQUFZLE1BQU07QUFBQSxNQUNsQixtQkFBbUIsQ0FBQyxXQUFXO0FBQzlCLGVBQU8sSUFBSSxlQUFlLFFBQVEsUUFBUSxFQUFFLE9BQU8sS0FBSyxDQUFDO0FBQUEsTUFDMUQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLGNBQWMsS0FBVSxHQUFXLEdBQVc7QUFDbkQsUUFBSSxJQUFJLFdBQVcsUUFBUSxhQUFhO0FBU3ZDLFdBQUssa0JBQWtCLFdBQTJFLDZCQUE2QjtBQUFBLFFBQzlILFdBQVcsSUFBSTtBQUFBLE1BQ2hCLENBQUM7QUFDRCxhQUFPLEtBQUssZ0JBQWdCLEtBQUssR0FBRyxDQUFDO0FBQUEsSUFDdEM7QUFBQSxFQUNEO0FBQ0Q7QUF2U2Esd0JBQU47QUFBQSxFQVNKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBYlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
