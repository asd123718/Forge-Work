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
import { localize, localize2 } from "../../../../../nls.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../../platform/configuration/common/configurationRegistry.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { BrowserViewCommandId, BrowserViewStorageScope } from "../../../../../platform/browserView/common/browserView.js";
import { workbenchConfigurationNodeBase } from "../../../../common/configuration.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { BrowserMaxHistoryEntriesSettingId } from "../browserViewWorkbenchService.js";
import {
  BROWSER_EDITOR_ACTIVE,
  BrowserActionCategory,
  BrowserActionGroup,
  BrowserEditor,
  BrowserEditorContribution
} from "../browserEditor.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { CONTEXT_BROWSER_STORAGE_SCOPE } from "./browserDataStorageFeatures.js";
const MAX_RECENTS = 3;
const MAX_HISTORY = 6;
let BrowserHistoryFeature = class extends BrowserEditorContribution {
  constructor(editor, _quickInputService) {
    super(editor);
    this._quickInputService = _quickInputService;
    this._modelDisposables = this._register(new DisposableStore());
    this._onDidChange = this._register(new Emitter());
    this._recentsProvider = {
      label: localize("browser.recents", "Recents"),
      order: 5,
      onDidChange: this._onDidChange.event,
      getSuggestions: async ({ input, text }) => this._buildRecents(input.url, text)
    };
    this._historyProvider = {
      label: localize("browser.history", "History"),
      order: 10,
      onDidChange: this._onDidChange.event,
      getSuggestions: async ({ input, text }) => this._buildHistory(input.url, text)
    };
  }
  get urlSuggestionProviders() {
    return [this._recentsProvider, this._historyProvider];
  }
  onModelAttached() {
    this._modelDisposables.clear();
    this._model = this.editor.model;
    this._history = this._model.history;
    this._modelDisposables.add(this._history.onDidChange(() => this._onDidChange.fire()));
    this._onDidChange.fire();
  }
  onModelDetached() {
    this._modelDisposables.clear();
    this._model = void 0;
    this._history = void 0;
    this._onDidChange.fire();
  }
  showManagementPicker() {
    const model = this._model;
    const history = this._history;
    if (!model || !history) {
      return;
    }
    showHistoryPicker(this._quickInputService, model, history);
  }
  _buildRecents(currentUrl, text) {
    if (text.trim().length > 0) {
      return [];
    }
    return this._buildList(
      currentUrl,
      "",
      /* onlyUserInitiated */
      true,
      MAX_RECENTS
    );
  }
  _buildHistory(currentUrl, text) {
    const needle = text.trim().toLowerCase();
    if (needle.length === 0) {
      return [];
    }
    return this._buildList(
      currentUrl,
      needle,
      /* onlyUserInitiated */
      false,
      MAX_HISTORY
    );
  }
  _buildList(currentUrl, needle, onlyUserInitiated, max) {
    const history = this._history;
    const model = this._model;
    if (!history || !model) {
      return [];
    }
    const entries = history.entries.items;
    if (entries.length === 0) {
      return [];
    }
    const seen = /* @__PURE__ */ new Set();
    if (currentUrl) {
      seen.add(dedupKey(currentUrl));
    }
    const out = [];
    for (let i = entries.length - 1; i >= 0 && out.length < max; i--) {
      const entry = entries[i];
      if (onlyUserInitiated && !entry.explicit) {
        continue;
      }
      const key = dedupKey(entry.url);
      if (seen.has(key)) {
        continue;
      }
      if (needle && !matches(entry, needle)) {
        continue;
      }
      seen.add(key);
      out.push(toSuggestion(model, history, entry));
    }
    return out;
  }
};
BrowserHistoryFeature = __decorateClass([
  __decorateParam(1, IQuickInputService)
], BrowserHistoryFeature);
BrowserEditor.registerContribution(BrowserHistoryFeature);
function toSuggestion(model, history, entry) {
  const label = entry.title || entry.url;
  const description = entry.title ? entry.url : void 0;
  const faviconUri = entry.icon ? resolveFavicon(history, entry.icon) : void 0;
  const deleteAction = {
    id: "browser.history.delete",
    iconClass: ThemeIcon.asClassName(Codicon.close),
    tooltip: localize("browser.removeFromHistory", "Remove from History"),
    run: () => model.deleteHistory([entry.id])
  };
  return {
    id: "history:" + entry.id,
    label,
    description,
    icon: faviconUri ? void 0 : Codicon.globe,
    iconPath: faviconUri ? { dark: faviconUri } : void 0,
    apply: (input) => input.navigate(entry.url),
    actions: [deleteAction]
  };
}
function dedupKey(url) {
  const parsed = URL.parse(url);
  if (!parsed) {
    return url;
  }
  return parsed.host + parsed.pathname;
}
function matches(entry, needle) {
  return entry.url.toLowerCase().includes(needle) || entry.title.toLowerCase().includes(needle);
}
function resolveFavicon(history, hash) {
  const dataUri = history.favicons.get(hash);
  if (!dataUri) {
    return void 0;
  }
  try {
    return URI.parse(dataUri);
  } catch {
    return void 0;
  }
}
function showHistoryPicker(quickInputService, model, history) {
  const disposables = new DisposableStore();
  const picker = disposables.add(quickInputService.createQuickPick({ useSeparators: true }));
  picker.title = localize("browser.history.title", "Browser History");
  picker.placeholder = localize("browser.history.placeholder", "Filter browser history");
  picker.matchOnDescription = true;
  picker.matchOnDetail = true;
  const clearAllButton = {
    iconClass: ThemeIcon.asClassName(Codicon.trash),
    tooltip: localize("browser.history.clearAll", "Clear All History")
  };
  const clearDayButton = {
    iconClass: ThemeIcon.asClassName(Codicon.trash),
    tooltip: localize("browser.history.clearDay", "Clear Entries for This Day")
  };
  const removeEntryButton = {
    iconClass: ThemeIcon.asClassName(Codicon.close),
    tooltip: localize("browser.removeFromHistory", "Remove from History")
  };
  picker.buttons = [clearAllButton];
  const rebuild = () => {
    picker.items = buildPickerItems(history, clearDayButton, removeEntryButton);
  };
  rebuild();
  disposables.add(history.onDidChange(rebuild));
  disposables.add(picker.onDidTriggerButton((button) => {
    if (button === clearAllButton) {
      void model.deleteHistory();
    }
  }));
  disposables.add(picker.onDidTriggerSeparatorButton(({ button, separator }) => {
    if (button === clearDayButton) {
      void model.deleteHistory(separator.entryIds);
    }
  }));
  disposables.add(picker.onDidTriggerItemButton(({ button, item }) => {
    if (button === removeEntryButton) {
      void model.deleteHistory([item.entryId]);
    }
  }));
  disposables.add(picker.onDidAccept(() => {
    const selected = picker.selectedItems[0];
    if (selected) {
      void model.loadURL(selected.entryUrl);
    }
    picker.hide();
  }));
  disposables.add(picker.onDidHide(() => disposables.dispose()));
  picker.show();
}
function buildPickerItems(history, clearDayButton, removeEntryButton) {
  const sorted = [...history.entries.items].sort((a, b) => b.time - a.time);
  const groups = /* @__PURE__ */ new Map();
  const orderedKeys = [];
  const now = /* @__PURE__ */ new Date();
  for (const entry of sorted) {
    const key = dayKey(entry.time);
    let group = groups.get(key);
    if (!group) {
      group = { label: dayLabel(entry.time, now), entries: [] };
      groups.set(key, group);
      orderedKeys.push(key);
    }
    group.entries.push(entry);
  }
  const out = [];
  for (const key of orderedKeys) {
    const group = groups.get(key);
    out.push({
      type: "separator",
      id: key,
      label: group.label,
      buttons: [clearDayButton],
      entryIds: group.entries.map((e) => e.id)
    });
    for (const entry of group.entries) {
      const faviconUri = entry.icon ? resolveFavicon(history, entry.icon) : void 0;
      out.push({
        label: entry.title || entry.url,
        description: entry.title ? entry.url : void 0,
        iconPath: faviconUri ? { dark: faviconUri } : void 0,
        iconClass: faviconUri ? void 0 : ThemeIcon.asClassName(Codicon.globe),
        buttons: [removeEntryButton],
        entryId: entry.id,
        entryUrl: entry.url
      });
    }
  }
  return out;
}
function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(ts, now) {
  const d = new Date(ts);
  if (isSameDay(d, now)) {
    return localize("browser.history.today", "Today");
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) {
    return localize("browser.history.yesterday", "Yesterday");
  }
  return d.toLocaleDateString(void 0, { year: "numeric", month: "long", day: "numeric" });
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
const _ShowBrowserHistoryAction = class _ShowBrowserHistoryAction extends Action2 {
  constructor() {
    const when = ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, ContextKeyExpr.equals(CONTEXT_BROWSER_STORAGE_SCOPE.key, BrowserViewStorageScope.Ephemeral).negate());
    super({
      id: _ShowBrowserHistoryAction.ID,
      title: localize2("browser.showHistory", "History"),
      category: BrowserActionCategory,
      icon: Codicon.history,
      f1: true,
      precondition: when,
      menu: {
        id: MenuId.BrowserActionsToolbar,
        group: BrowserActionGroup.Data,
        order: 1,
        when,
        isHiddenByDefault: true
      },
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyCode.KeyH,
        mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyY },
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      browserEditor.getContribution(BrowserHistoryFeature)?.showManagementPicker();
    }
  }
};
_ShowBrowserHistoryAction.ID = BrowserViewCommandId.ShowHistory;
let ShowBrowserHistoryAction = _ShowBrowserHistoryAction;
registerAction2(ShowBrowserHistoryAction);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  ...workbenchConfigurationNodeBase,
  properties: {
    [BrowserMaxHistoryEntriesSettingId]: {
      type: "integer",
      default: 200,
      minimum: 0,
      maximum: 1e4,
      scope: ConfigurationScope.APPLICATION,
      description: localize("browser.maxHistoryEntries", "Maximum number of history items kept per session scope. Older entries are evicted first."),
      order: 110
    }
  }
});
export {
  BrowserHistoryFeature
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFxmZWF0dXJlc1xcYnJvd3Nlckhpc3RvcnlGZWF0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLCBDb25maWd1cmF0aW9uU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0QnV0dG9uLCBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBCcm93c2VyVmlld0NvbW1hbmRJZCwgQnJvd3NlclZpZXdTdG9yYWdlU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgQnJvd3Nlckhpc3RvcnlTdG9yZSwgSUJyb3dzZXJIaXN0b3J5RW50cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vYnJvd3Nlckhpc3RvcnkuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoQ29uZmlndXJhdGlvbk5vZGVCYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgQnJvd3Nlck1heEhpc3RvcnlFbnRyaWVzU2V0dGluZ0lkIH0gZnJvbSAnLi4vYnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLmpzJztcbmltcG9ydCB7XG5cdEJST1dTRVJfRURJVE9SX0FDVElWRSxcblx0QnJvd3NlckFjdGlvbkNhdGVnb3J5LFxuXHRCcm93c2VyQWN0aW9uR3JvdXAsXG5cdEJyb3dzZXJFZGl0b3IsXG5cdEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24sXG5cdElCcm93c2VyVXJsU3VnZ2VzdGlvbixcblx0SUJyb3dzZXJVcmxTdWdnZXN0aW9uQWN0aW9uLFxuXHRJQnJvd3NlclVybFN1Z2dlc3Rpb25Qcm92aWRlcixcbn0gZnJvbSAnLi4vYnJvd3NlckVkaXRvci5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBDT05URVhUX0JST1dTRVJfU1RPUkFHRV9TQ09QRSB9IGZyb20gJy4vYnJvd3NlckRhdGFTdG9yYWdlRmVhdHVyZXMuanMnO1xuXG5jb25zdCBNQVhfUkVDRU5UUyA9IDM7XG5jb25zdCBNQVhfSElTVE9SWSA9IDY7XG5cbi8qKlxuICogU3VyZmFjZXMgaGlzdG9yeSBmcm9tIHRoZSBhY3RpdmUgbW9kZWwncyB7QGxpbmsgQnJvd3Nlckhpc3RvcnlTdG9yZX0gYXNcbiAqIFVSTCBiYXIgc3VnZ2VzdGlvbnMgKGRlZHVwZWQgYnkgaG9zdCtwYXRoKSBhbmQgZXhwb3NlcyBhIGZ1bGwgaGlzdG9yeVxuICogbWFuYWdlbWVudCBwaWNrZXIgdmlhIHRoZSB7QGxpbmsgQnJvd3NlclZpZXdDb21tYW5kSWQuU2hvd0hpc3Rvcnl9IGFjdGlvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIEJyb3dzZXJIaXN0b3J5RmVhdHVyZSBleHRlbmRzIEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXG5cdHByaXZhdGUgX21vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaGlzdG9yeTogQnJvd3Nlckhpc3RvcnlTdG9yZSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IEJyb3dzZXJFZGl0b3IsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihlZGl0b3IpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVjZW50c1Byb3ZpZGVyOiBJQnJvd3NlclVybFN1Z2dlc3Rpb25Qcm92aWRlciA9IHtcblx0XHRsYWJlbDogbG9jYWxpemUoJ2Jyb3dzZXIucmVjZW50cycsIFwiUmVjZW50c1wiKSxcblx0XHRvcmRlcjogNSxcblx0XHRvbkRpZENoYW5nZTogdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQsXG5cdFx0Z2V0U3VnZ2VzdGlvbnM6IGFzeW5jICh7IGlucHV0LCB0ZXh0IH0pID0+IHRoaXMuX2J1aWxkUmVjZW50cyhpbnB1dC51cmwsIHRleHQpLFxuXHR9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hpc3RvcnlQcm92aWRlcjogSUJyb3dzZXJVcmxTdWdnZXN0aW9uUHJvdmlkZXIgPSB7XG5cdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VyLmhpc3RvcnknLCBcIkhpc3RvcnlcIiksXG5cdFx0b3JkZXI6IDEwLFxuXHRcdG9uRGlkQ2hhbmdlOiB0aGlzLl9vbkRpZENoYW5nZS5ldmVudCxcblx0XHRnZXRTdWdnZXN0aW9uczogYXN5bmMgKHsgaW5wdXQsIHRleHQgfSkgPT4gdGhpcy5fYnVpbGRIaXN0b3J5KGlucHV0LnVybCwgdGV4dCksXG5cdH07XG5cblx0b3ZlcnJpZGUgZ2V0IHVybFN1Z2dlc3Rpb25Qcm92aWRlcnMoKTogcmVhZG9ubHkgSUJyb3dzZXJVcmxTdWdnZXN0aW9uUHJvdmlkZXJbXSB7XG5cdFx0cmV0dXJuIFt0aGlzLl9yZWNlbnRzUHJvdmlkZXIsIHRoaXMuX2hpc3RvcnlQcm92aWRlcl07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgb25Nb2RlbEF0dGFjaGVkKCk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9tb2RlbCA9IHRoaXMuZWRpdG9yLm1vZGVsITtcblx0XHR0aGlzLl9oaXN0b3J5ID0gdGhpcy5fbW9kZWwuaGlzdG9yeTtcblx0XHR0aGlzLl9tb2RlbERpc3Bvc2FibGVzLmFkZCh0aGlzLl9oaXN0b3J5Lm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKSkpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIG9uTW9kZWxEZXRhY2hlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlbERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fbW9kZWwgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5faGlzdG9yeSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdH1cblxuXHRzaG93TWFuYWdlbWVudFBpY2tlcigpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVsO1xuXHRcdGNvbnN0IGhpc3RvcnkgPSB0aGlzLl9oaXN0b3J5O1xuXHRcdGlmICghbW9kZWwgfHwgIWhpc3RvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0c2hvd0hpc3RvcnlQaWNrZXIodGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UsIG1vZGVsLCBoaXN0b3J5KTtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkUmVjZW50cyhjdXJyZW50VXJsOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRleHQ6IHN0cmluZyk6IElCcm93c2VyVXJsU3VnZ2VzdGlvbltdIHtcblx0XHRpZiAodGV4dC50cmltKCkubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYnVpbGRMaXN0KGN1cnJlbnRVcmwsICcnLCAvKiBvbmx5VXNlckluaXRpYXRlZCAqLyB0cnVlLCBNQVhfUkVDRU5UUyk7XG5cdH1cblxuXHRwcml2YXRlIF9idWlsZEhpc3RvcnkoY3VycmVudFVybDogc3RyaW5nIHwgdW5kZWZpbmVkLCB0ZXh0OiBzdHJpbmcpOiBJQnJvd3NlclVybFN1Z2dlc3Rpb25bXSB7XG5cdFx0Y29uc3QgbmVlZGxlID0gdGV4dC50cmltKCkudG9Mb3dlckNhc2UoKTtcblx0XHRpZiAobmVlZGxlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYnVpbGRMaXN0KGN1cnJlbnRVcmwsIG5lZWRsZSwgLyogb25seVVzZXJJbml0aWF0ZWQgKi8gZmFsc2UsIE1BWF9ISVNUT1JZKTtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkTGlzdChjdXJyZW50VXJsOiBzdHJpbmcgfCB1bmRlZmluZWQsIG5lZWRsZTogc3RyaW5nLCBvbmx5VXNlckluaXRpYXRlZDogYm9vbGVhbiwgbWF4OiBudW1iZXIpOiBJQnJvd3NlclVybFN1Z2dlc3Rpb25bXSB7XG5cdFx0Y29uc3QgaGlzdG9yeSA9IHRoaXMuX2hpc3Rvcnk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9tb2RlbDtcblx0XHRpZiAoIWhpc3RvcnkgfHwgIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGVudHJpZXMgPSBoaXN0b3J5LmVudHJpZXMuaXRlbXM7XG5cdFx0aWYgKGVudHJpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGlmIChjdXJyZW50VXJsKSB7XG5cdFx0XHRzZWVuLmFkZChkZWR1cEtleShjdXJyZW50VXJsKSk7XG5cdFx0fVxuXG5cdFx0Ly8gV2FsayBuZXdlc3QtZmlyc3Q7IHRoZSBwZXJzaXN0ZWQgbGlzdCBpcyBhcHBlbmQtb3JkZXJlZC4gRGVkdXAgYnlcblx0XHQvLyBob3N0K3BhdGggc28gZS5nLiA/Zm9vPTEgYW5kID9mb289MiBjb2xsYXBzZSBpbnRvIGEgc2luZ2xlIGVudHJ5XG5cdFx0Ly8gKG5ld2VzdCB3aW5zIGJlY2F1c2Ugd2Ugd2FsayBpbiByZXZlcnNlKS5cblx0XHRjb25zdCBvdXQ6IElCcm93c2VyVXJsU3VnZ2VzdGlvbltdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IGVudHJpZXMubGVuZ3RoIC0gMTsgaSA+PSAwICYmIG91dC5sZW5ndGggPCBtYXg7IGktLSkge1xuXHRcdFx0Y29uc3QgZW50cnkgPSBlbnRyaWVzW2ldO1xuXHRcdFx0aWYgKG9ubHlVc2VySW5pdGlhdGVkICYmICFlbnRyeS5leHBsaWNpdCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGtleSA9IGRlZHVwS2V5KGVudHJ5LnVybCk7XG5cdFx0XHRpZiAoc2Vlbi5oYXMoa2V5KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChuZWVkbGUgJiYgIW1hdGNoZXMoZW50cnksIG5lZWRsZSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRzZWVuLmFkZChrZXkpO1xuXHRcdFx0b3V0LnB1c2godG9TdWdnZXN0aW9uKG1vZGVsLCBoaXN0b3J5LCBlbnRyeSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gb3V0O1xuXHR9XG59XG5cbkJyb3dzZXJFZGl0b3IucmVnaXN0ZXJDb250cmlidXRpb24oQnJvd3Nlckhpc3RvcnlGZWF0dXJlKTtcblxuLy8gLS0gU3VnZ2VzdGlvbiBoZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gdG9TdWdnZXN0aW9uKG1vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCwgaGlzdG9yeTogQnJvd3Nlckhpc3RvcnlTdG9yZSwgZW50cnk6IElCcm93c2VySGlzdG9yeUVudHJ5KTogSUJyb3dzZXJVcmxTdWdnZXN0aW9uIHtcblx0Y29uc3QgbGFiZWwgPSBlbnRyeS50aXRsZSB8fCBlbnRyeS51cmw7XG5cdGNvbnN0IGRlc2NyaXB0aW9uID0gZW50cnkudGl0bGUgPyBlbnRyeS51cmwgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGZhdmljb25VcmkgPSBlbnRyeS5pY29uID8gcmVzb2x2ZUZhdmljb24oaGlzdG9yeSwgZW50cnkuaWNvbikgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGRlbGV0ZUFjdGlvbjogSUJyb3dzZXJVcmxTdWdnZXN0aW9uQWN0aW9uID0ge1xuXHRcdGlkOiAnYnJvd3Nlci5oaXN0b3J5LmRlbGV0ZScsXG5cdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jbG9zZSksXG5cdFx0dG9vbHRpcDogbG9jYWxpemUoJ2Jyb3dzZXIucmVtb3ZlRnJvbUhpc3RvcnknLCBcIlJlbW92ZSBmcm9tIEhpc3RvcnlcIiksXG5cdFx0cnVuOiAoKSA9PiBtb2RlbC5kZWxldGVIaXN0b3J5KFtlbnRyeS5pZF0pLFxuXHR9O1xuXHRyZXR1cm4ge1xuXHRcdGlkOiAnaGlzdG9yeTonICsgZW50cnkuaWQsXG5cdFx0bGFiZWwsXG5cdFx0ZGVzY3JpcHRpb24sXG5cdFx0aWNvbjogZmF2aWNvblVyaSA/IHVuZGVmaW5lZCA6IENvZGljb24uZ2xvYmUsXG5cdFx0aWNvblBhdGg6IGZhdmljb25VcmkgPyB7IGRhcms6IGZhdmljb25VcmkgfSA6IHVuZGVmaW5lZCxcblx0XHRhcHBseTogaW5wdXQgPT4gaW5wdXQubmF2aWdhdGUoZW50cnkudXJsKSxcblx0XHRhY3Rpb25zOiBbZGVsZXRlQWN0aW9uXSxcblx0fTtcbn1cblxuZnVuY3Rpb24gZGVkdXBLZXkodXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBwYXJzZWQgPSBVUkwucGFyc2UodXJsKTtcblx0aWYgKCFwYXJzZWQpIHtcblx0XHRyZXR1cm4gdXJsO1xuXHR9XG5cdHJldHVybiBwYXJzZWQuaG9zdCArIHBhcnNlZC5wYXRobmFtZTtcbn1cblxuZnVuY3Rpb24gbWF0Y2hlcyhlbnRyeTogSUJyb3dzZXJIaXN0b3J5RW50cnksIG5lZWRsZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBlbnRyeS51cmwudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhuZWVkbGUpXG5cdFx0fHwgZW50cnkudGl0bGUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhuZWVkbGUpO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlRmF2aWNvbihoaXN0b3J5OiBCcm93c2VySGlzdG9yeVN0b3JlLCBoYXNoOiBzdHJpbmcpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRjb25zdCBkYXRhVXJpID0gaGlzdG9yeS5mYXZpY29ucy5nZXQoaGFzaCk7XG5cdGlmICghZGF0YVVyaSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0dHJ5IHtcblx0XHRyZXR1cm4gVVJJLnBhcnNlKGRhdGFVcmkpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8vIC0tIE1hbmFnZW1lbnQgcGlja2VyIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmludGVyZmFjZSBIaXN0b3J5UXVpY2tQaWNrSXRlbSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0cmVhZG9ubHkgZW50cnlJZDogbnVtYmVyO1xuXHRyZWFkb25seSBlbnRyeVVybDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSGlzdG9yeVNlcGFyYXRvciBleHRlbmRzIElRdWlja1BpY2tTZXBhcmF0b3Ige1xuXHRyZWFkb25seSBlbnRyeUlkczogcmVhZG9ubHkgbnVtYmVyW107XG59XG5cbmZ1bmN0aW9uIHNob3dIaXN0b3J5UGlja2VyKHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsIG1vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCwgaGlzdG9yeTogQnJvd3Nlckhpc3RvcnlTdG9yZSk6IHZvaWQge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3QgcGlja2VyID0gZGlzcG9zYWJsZXMuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxIaXN0b3J5UXVpY2tQaWNrSXRlbT4oeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pKTtcblx0cGlja2VyLnRpdGxlID0gbG9jYWxpemUoJ2Jyb3dzZXIuaGlzdG9yeS50aXRsZScsIFwiQnJvd3NlciBIaXN0b3J5XCIpO1xuXHRwaWNrZXIucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnYnJvd3Nlci5oaXN0b3J5LnBsYWNlaG9sZGVyJywgXCJGaWx0ZXIgYnJvd3NlciBoaXN0b3J5XCIpO1xuXHRwaWNrZXIubWF0Y2hPbkRlc2NyaXB0aW9uID0gdHJ1ZTtcblx0cGlja2VyLm1hdGNoT25EZXRhaWwgPSB0cnVlO1xuXG5cdGNvbnN0IGNsZWFyQWxsQnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnRyYXNoKSxcblx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnYnJvd3Nlci5oaXN0b3J5LmNsZWFyQWxsJywgXCJDbGVhciBBbGwgSGlzdG9yeVwiKSxcblx0fTtcblx0Y29uc3QgY2xlYXJEYXlCdXR0b246IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24udHJhc2gpLFxuXHRcdHRvb2x0aXA6IGxvY2FsaXplKCdicm93c2VyLmhpc3RvcnkuY2xlYXJEYXknLCBcIkNsZWFyIEVudHJpZXMgZm9yIFRoaXMgRGF5XCIpLFxuXHR9O1xuXHRjb25zdCByZW1vdmVFbnRyeUJ1dHRvbjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jbG9zZSksXG5cdFx0dG9vbHRpcDogbG9jYWxpemUoJ2Jyb3dzZXIucmVtb3ZlRnJvbUhpc3RvcnknLCBcIlJlbW92ZSBmcm9tIEhpc3RvcnlcIiksXG5cdH07XG5cdHBpY2tlci5idXR0b25zID0gW2NsZWFyQWxsQnV0dG9uXTtcblxuXHRjb25zdCByZWJ1aWxkID0gKCkgPT4ge1xuXHRcdHBpY2tlci5pdGVtcyA9IGJ1aWxkUGlja2VySXRlbXMoaGlzdG9yeSwgY2xlYXJEYXlCdXR0b24sIHJlbW92ZUVudHJ5QnV0dG9uKTtcblx0fTtcblx0cmVidWlsZCgpO1xuXHRkaXNwb3NhYmxlcy5hZGQoaGlzdG9yeS5vbkRpZENoYW5nZShyZWJ1aWxkKSk7XG5cblx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZFRyaWdnZXJCdXR0b24oYnV0dG9uID0+IHtcblx0XHRpZiAoYnV0dG9uID09PSBjbGVhckFsbEJ1dHRvbikge1xuXHRcdFx0dm9pZCBtb2RlbC5kZWxldGVIaXN0b3J5KCk7XG5cdFx0fVxuXHR9KSk7XG5cblx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZFRyaWdnZXJTZXBhcmF0b3JCdXR0b24oKHsgYnV0dG9uLCBzZXBhcmF0b3IgfSkgPT4ge1xuXHRcdGlmIChidXR0b24gPT09IGNsZWFyRGF5QnV0dG9uKSB7XG5cdFx0XHR2b2lkIG1vZGVsLmRlbGV0ZUhpc3RvcnkoKHNlcGFyYXRvciBhcyBIaXN0b3J5U2VwYXJhdG9yKS5lbnRyeUlkcyk7XG5cdFx0fVxuXHR9KSk7XG5cblx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZFRyaWdnZXJJdGVtQnV0dG9uKCh7IGJ1dHRvbiwgaXRlbSB9KSA9PiB7XG5cdFx0aWYgKGJ1dHRvbiA9PT0gcmVtb3ZlRW50cnlCdXR0b24pIHtcblx0XHRcdHZvaWQgbW9kZWwuZGVsZXRlSGlzdG9yeShbaXRlbS5lbnRyeUlkXSk7XG5cdFx0fVxuXHR9KSk7XG5cblx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0Y29uc3Qgc2VsZWN0ZWQgPSBwaWNrZXIuc2VsZWN0ZWRJdGVtc1swXTtcblx0XHRpZiAoc2VsZWN0ZWQpIHtcblx0XHRcdHZvaWQgbW9kZWwubG9hZFVSTChzZWxlY3RlZC5lbnRyeVVybCk7XG5cdFx0fVxuXHRcdHBpY2tlci5oaWRlKCk7XG5cdH0pKTtcblxuXHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkSGlkZSgoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpKTtcblx0cGlja2VyLnNob3coKTtcbn1cblxuZnVuY3Rpb24gYnVpbGRQaWNrZXJJdGVtcyhoaXN0b3J5OiBCcm93c2VySGlzdG9yeVN0b3JlLCBjbGVhckRheUJ1dHRvbjogSVF1aWNrSW5wdXRCdXR0b24sIHJlbW92ZUVudHJ5QnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbik6IChIaXN0b3J5UXVpY2tQaWNrSXRlbSB8IEhpc3RvcnlTZXBhcmF0b3IpW10ge1xuXHQvLyBHcm91cCBieSBjYWxlbmRhciBkYXksIG5ld2VzdC1maXJzdCB3aXRoaW4gZWFjaCBkYXkgYW5kIGFjcm9zcyBkYXlzLlxuXHRjb25zdCBzb3J0ZWQgPSBbLi4uaGlzdG9yeS5lbnRyaWVzLml0ZW1zXS5zb3J0KChhLCBiKSA9PiBiLnRpbWUgLSBhLnRpbWUpO1xuXHRjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgeyBsYWJlbDogc3RyaW5nOyBlbnRyaWVzOiBJQnJvd3Nlckhpc3RvcnlFbnRyeVtdIH0+KCk7XG5cdGNvbnN0IG9yZGVyZWRLZXlzOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuXHRmb3IgKGNvbnN0IGVudHJ5IG9mIHNvcnRlZCkge1xuXHRcdGNvbnN0IGtleSA9IGRheUtleShlbnRyeS50aW1lKTtcblx0XHRsZXQgZ3JvdXAgPSBncm91cHMuZ2V0KGtleSk7XG5cdFx0aWYgKCFncm91cCkge1xuXHRcdFx0Z3JvdXAgPSB7IGxhYmVsOiBkYXlMYWJlbChlbnRyeS50aW1lLCBub3cpLCBlbnRyaWVzOiBbXSB9O1xuXHRcdFx0Z3JvdXBzLnNldChrZXksIGdyb3VwKTtcblx0XHRcdG9yZGVyZWRLZXlzLnB1c2goa2V5KTtcblx0XHR9XG5cdFx0Z3JvdXAuZW50cmllcy5wdXNoKGVudHJ5KTtcblx0fVxuXG5cdGNvbnN0IG91dDogKEhpc3RvcnlRdWlja1BpY2tJdGVtIHwgSGlzdG9yeVNlcGFyYXRvcilbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGtleSBvZiBvcmRlcmVkS2V5cykge1xuXHRcdGNvbnN0IGdyb3VwID0gZ3JvdXBzLmdldChrZXkpITtcblx0XHRvdXQucHVzaCh7XG5cdFx0XHR0eXBlOiAnc2VwYXJhdG9yJyxcblx0XHRcdGlkOiBrZXksXG5cdFx0XHRsYWJlbDogZ3JvdXAubGFiZWwsXG5cdFx0XHRidXR0b25zOiBbY2xlYXJEYXlCdXR0b25dLFxuXHRcdFx0ZW50cnlJZHM6IGdyb3VwLmVudHJpZXMubWFwKGUgPT4gZS5pZCksXG5cdFx0fSk7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBncm91cC5lbnRyaWVzKSB7XG5cdFx0XHRjb25zdCBmYXZpY29uVXJpID0gZW50cnkuaWNvbiA/IHJlc29sdmVGYXZpY29uKGhpc3RvcnksIGVudHJ5Lmljb24pIDogdW5kZWZpbmVkO1xuXHRcdFx0b3V0LnB1c2goe1xuXHRcdFx0XHRsYWJlbDogZW50cnkudGl0bGUgfHwgZW50cnkudXJsLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZW50cnkudGl0bGUgPyBlbnRyeS51cmwgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGljb25QYXRoOiBmYXZpY29uVXJpID8geyBkYXJrOiBmYXZpY29uVXJpIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdGljb25DbGFzczogZmF2aWNvblVyaSA/IHVuZGVmaW5lZCA6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmdsb2JlKSxcblx0XHRcdFx0YnV0dG9uczogW3JlbW92ZUVudHJ5QnV0dG9uXSxcblx0XHRcdFx0ZW50cnlJZDogZW50cnkuaWQsXG5cdFx0XHRcdGVudHJ5VXJsOiBlbnRyeS51cmwsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gZGF5S2V5KHRzOiBudW1iZXIpOiBzdHJpbmcge1xuXHRjb25zdCBkID0gbmV3IERhdGUodHMpO1xuXHRyZXR1cm4gYCR7ZC5nZXRGdWxsWWVhcigpfS0ke2QuZ2V0TW9udGgoKX0tJHtkLmdldERhdGUoKX1gO1xufVxuXG5mdW5jdGlvbiBkYXlMYWJlbCh0czogbnVtYmVyLCBub3c6IERhdGUpOiBzdHJpbmcge1xuXHRjb25zdCBkID0gbmV3IERhdGUodHMpO1xuXHRpZiAoaXNTYW1lRGF5KGQsIG5vdykpIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2Jyb3dzZXIuaGlzdG9yeS50b2RheScsIFwiVG9kYXlcIik7XG5cdH1cblx0Y29uc3QgeWVzdGVyZGF5ID0gbmV3IERhdGUobm93KTtcblx0eWVzdGVyZGF5LnNldERhdGUobm93LmdldERhdGUoKSAtIDEpO1xuXHRpZiAoaXNTYW1lRGF5KGQsIHllc3RlcmRheSkpIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2Jyb3dzZXIuaGlzdG9yeS55ZXN0ZXJkYXknLCBcIlllc3RlcmRheVwiKTtcblx0fVxuXHRyZXR1cm4gZC50b0xvY2FsZURhdGVTdHJpbmcodW5kZWZpbmVkLCB7IHllYXI6ICdudW1lcmljJywgbW9udGg6ICdsb25nJywgZGF5OiAnbnVtZXJpYycgfSk7XG59XG5cbmZ1bmN0aW9uIGlzU2FtZURheShhOiBEYXRlLCBiOiBEYXRlKTogYm9vbGVhbiB7XG5cdHJldHVybiBhLmdldEZ1bGxZZWFyKCkgPT09IGIuZ2V0RnVsbFllYXIoKVxuXHRcdCYmIGEuZ2V0TW9udGgoKSA9PT0gYi5nZXRNb250aCgpXG5cdFx0JiYgYS5nZXREYXRlKCkgPT09IGIuZ2V0RGF0ZSgpO1xufVxuXG4vLyAtLSBBY3Rpb25zIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY2xhc3MgU2hvd0Jyb3dzZXJIaXN0b3J5QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9IEJyb3dzZXJWaWV3Q29tbWFuZElkLlNob3dIaXN0b3J5O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IHdoZW4gPSBDb250ZXh0S2V5RXhwci5hbmQoQlJPV1NFUl9FRElUT1JfQUNUSVZFLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoQ09OVEVYVF9CUk9XU0VSX1NUT1JBR0VfU0NPUEUua2V5LCBCcm93c2VyVmlld1N0b3JhZ2VTY29wZS5FcGhlbWVyYWwpLm5lZ2F0ZSgpKTtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU2hvd0Jyb3dzZXJIaXN0b3J5QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci5zaG93SGlzdG9yeScsICdIaXN0b3J5JyksXG5cdFx0XHRjYXRlZ29yeTogQnJvd3NlckFjdGlvbkNhdGVnb3J5LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5oaXN0b3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IHdoZW4sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQnJvd3NlckFjdGlvbnNUb29sYmFyLFxuXHRcdFx0XHRncm91cDogQnJvd3NlckFjdGlvbkdyb3VwLkRhdGEsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuLFxuXHRcdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlILFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVkgfSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYnJvd3NlckVkaXRvciA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChicm93c2VyRWRpdG9yIGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcikge1xuXHRcdFx0YnJvd3NlckVkaXRvci5nZXRDb250cmlidXRpb24oQnJvd3Nlckhpc3RvcnlGZWF0dXJlKT8uc2hvd01hbmFnZW1lbnRQaWNrZXIoKTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKFNob3dCcm93c2VySGlzdG9yeUFjdGlvbik7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdC4uLndvcmtiZW5jaENvbmZpZ3VyYXRpb25Ob2RlQmFzZSxcblx0cHJvcGVydGllczoge1xuXHRcdFtCcm93c2VyTWF4SGlzdG9yeUVudHJpZXNTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnaW50ZWdlcicsXG5cdFx0XHRkZWZhdWx0OiAyMDAsXG5cdFx0XHRtaW5pbXVtOiAwLFxuXHRcdFx0bWF4aW11bTogMTAwMDAsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdicm93c2VyLm1heEhpc3RvcnlFbnRyaWVzJywgXCJNYXhpbXVtIG51bWJlciBvZiBoaXN0b3J5IGl0ZW1zIGtlcHQgcGVyIHNlc3Npb24gc2NvcGUuIE9sZGVyIGVudHJpZXMgYXJlIGV2aWN0ZWQgZmlyc3QuXCIpLFxuXHRcdFx0b3JkZXI6IDExMFxuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBQ2pELFNBQWlDLGNBQWMseUJBQXlCLDBCQUEwQjtBQUNsRyxTQUFTLHNCQUFzQjtBQUUvQixTQUE0QiwwQkFBK0Q7QUFDM0YsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0IsK0JBQStCO0FBRTlELFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMseUNBQXlDO0FBQ2xEO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEs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
