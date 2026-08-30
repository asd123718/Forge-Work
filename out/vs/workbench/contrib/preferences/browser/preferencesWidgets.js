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
import * as DOM from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { ActionBar, ActionsOrientation } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { Widget } from "../../../../base/browser/ui/widget.js";
import { Action } from "../../../../base/common/actions.js";
import { Emitter } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { isEqual } from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { MouseTargetType } from "../../../../editor/browser/editorBrowser.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { TrackedRangeStickiness } from "../../../../editor/common/model.js";
import { localize } from "../../../../nls.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { ContextScopedHistoryInputBox } from "../../../../platform/history/browser/contextScopedHistoryWidget.js";
import { showHistoryKeybindingHint } from "../../../../platform/history/browser/historyWidgetKeybindingHint.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { asCssVariable, badgeBackground, badgeForeground, contrastBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { isWorkspaceFolder, IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { settingsEditIcon, settingsScopeDropDownIcon } from "./preferencesIcons.js";
let FolderSettingsActionViewItem = class extends BaseActionViewItem {
  constructor(action, contextService, contextMenuService, hoverService) {
    super(null, action);
    this.contextService = contextService;
    this.contextMenuService = contextMenuService;
    this.hoverService = hoverService;
    this._folderSettingCounts = /* @__PURE__ */ new Map();
    const workspace = this.contextService.getWorkspace();
    this._folder = workspace.folders.length === 1 ? workspace.folders[0] : null;
    this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.onWorkspaceFoldersChanged()));
  }
  get folder() {
    return this._folder;
  }
  set folder(folder) {
    this._folder = folder;
    this.update();
  }
  setCount(settingsTarget, count) {
    const workspaceFolder = this.contextService.getWorkspaceFolder(settingsTarget);
    if (!workspaceFolder) {
      throw new Error("unknown folder");
    }
    const folder = workspaceFolder.uri;
    this._folderSettingCounts.set(folder.toString(), count);
    this.update();
  }
  render(container) {
    this.element = container;
    this.container = container;
    this.labelElement = DOM.$(".action-title");
    this.detailsElement = DOM.$(".action-details");
    this.dropDownElement = DOM.$(".dropdown-icon.hide" + ThemeIcon.asCSSSelector(settingsScopeDropDownIcon));
    this.anchorElement = DOM.$("a.action-label.folder-settings", {
      role: "button",
      "aria-haspopup": "true",
      "tabindex": "0"
    }, this.labelElement, this.detailsElement, this.dropDownElement);
    this.anchorElementHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.anchorElement, ""));
    this._register(DOM.addDisposableListener(this.anchorElement, DOM.EventType.MOUSE_DOWN, (e) => DOM.EventHelper.stop(e)));
    this._register(DOM.addDisposableListener(this.anchorElement, DOM.EventType.CLICK, (e) => this.onClick(e)));
    this._register(DOM.addDisposableListener(this.container, DOM.EventType.KEY_UP, (e) => this.onKeyUp(e)));
    DOM.append(this.container, this.anchorElement);
    this.update();
  }
  onKeyUp(event) {
    const keyboardEvent = new StandardKeyboardEvent(event);
    switch (keyboardEvent.keyCode) {
      case KeyCode.Enter:
      case KeyCode.Space:
        this.onClick(event);
        return;
    }
  }
  onClick(event) {
    DOM.EventHelper.stop(event, true);
    if (!this.folder || this._action.checked) {
      this.showMenu();
    } else {
      this._action.run(this._folder);
    }
  }
  updateEnabled() {
    this.update();
  }
  updateChecked() {
    this.update();
  }
  onWorkspaceFoldersChanged() {
    const oldFolder = this._folder;
    const workspace = this.contextService.getWorkspace();
    if (oldFolder) {
      this._folder = workspace.folders.filter((folder) => isEqual(folder.uri, oldFolder.uri))[0] || workspace.folders[0];
    }
    this._folder = this._folder ? this._folder : workspace.folders.length === 1 ? workspace.folders[0] : null;
    this.update();
    if (this._action.checked) {
      this._action.run(this._folder);
    }
  }
  update() {
    let total = 0;
    this._folderSettingCounts.forEach((n) => total += n);
    const workspace = this.contextService.getWorkspace();
    if (this._folder) {
      this.labelElement.textContent = this._folder.name;
      this.anchorElementHover.update(this._folder.name);
      const detailsText = this.labelWithCount(this._action.label, total);
      this.detailsElement.textContent = detailsText;
      this.dropDownElement.classList.toggle("hide", workspace.folders.length === 1 || !this._action.checked);
    } else {
      const labelText = this.labelWithCount(this._action.label, total);
      this.labelElement.textContent = labelText;
      this.detailsElement.textContent = "";
      this.anchorElementHover.update(this._action.label);
      this.dropDownElement.classList.remove("hide");
    }
    this.anchorElement.classList.toggle("checked", this._action.checked);
    this.container.classList.toggle("disabled", !this._action.enabled);
  }
  showMenu() {
    this.contextMenuService.showContextMenu({
      getAnchor: () => this.container,
      getActions: () => this.getDropdownMenuActions(),
      getActionViewItem: () => void 0,
      onHide: () => {
        this.anchorElement.blur();
      }
    });
  }
  getDropdownMenuActions() {
    const actions = [];
    const workspaceFolders = this.contextService.getWorkspace().folders;
    if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && workspaceFolders.length > 0) {
      actions.push(...workspaceFolders.map((folder, index) => {
        const folderCount = this._folderSettingCounts.get(folder.uri.toString());
        return {
          id: "folderSettingsTarget" + index,
          label: this.labelWithCount(folder.name, folderCount),
          tooltip: this.labelWithCount(folder.name, folderCount),
          checked: !!this.folder && isEqual(this.folder.uri, folder.uri),
          enabled: true,
          class: void 0,
          run: () => this._action.run(folder)
        };
      }));
    }
    return actions;
  }
  labelWithCount(label, count) {
    if (count) {
      label += ` (${count})`;
    }
    return label;
  }
};
FolderSettingsActionViewItem = __decorateClass([
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IHoverService)
], FolderSettingsActionViewItem);
let SettingsTargetsWidget = class extends Widget {
  constructor(parent, options, contextService, instantiationService, environmentService, labelService, languageService) {
    super();
    this.contextService = contextService;
    this.instantiationService = instantiationService;
    this.environmentService = environmentService;
    this.labelService = labelService;
    this.languageService = languageService;
    this._settingsTarget = null;
    this._onDidTargetChange = this._register(new Emitter());
    this.onDidTargetChange = this._onDidTargetChange.event;
    this.options = options ?? {};
    this.create(parent);
    this._register(this.contextService.onDidChangeWorkbenchState(() => this.onWorkbenchStateChanged()));
    this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.update()));
  }
  resetLabels() {
    const remoteAuthority = this.environmentService.remoteAuthority;
    const hostLabel = remoteAuthority && this.labelService.getHostLabel(Schemas.vscodeRemote, remoteAuthority);
    this.userLocalSettings.label = localize("userSettings", "User");
    this.userRemoteSettings.label = localize("userSettingsRemote", "Remote") + (hostLabel ? ` [${hostLabel}]` : "");
    this.workspaceSettings.label = this.contextService.getWorkspace().name || localize("workspaceSettings", "Workspace");
    this.folderSettingsAction.label = localize("folderSettings", "Folder");
  }
  create(parent) {
    const settingsTabsWidget = DOM.append(parent, DOM.$(".settings-tabs-widget"));
    this.settingsSwitcherBar = this._register(new ActionBar(settingsTabsWidget, {
      orientation: ActionsOrientation.HORIZONTAL,
      focusOnlyEnabledItems: true,
      ariaLabel: localize("settingsSwitcherBarAriaLabel", "Settings Switcher"),
      ariaRole: "tablist",
      actionViewItemProvider: (action, options) => action.id === "folderSettings" ? this.folderSettings : void 0
    }));
    this.userLocalSettings = this._register(new Action("userSettings", "", ".settings-tab", true, () => this.updateTarget(ConfigurationTarget.USER_LOCAL)));
    this.userLocalSettings.tooltip = localize("userSettings", "User");
    this.userRemoteSettings = this._register(new Action("userSettingsRemote", "", ".settings-tab", true, () => this.updateTarget(ConfigurationTarget.USER_REMOTE)));
    const remoteAuthority = this.environmentService.remoteAuthority;
    const hostLabel = remoteAuthority && this.labelService.getHostLabel(Schemas.vscodeRemote, remoteAuthority);
    this.userRemoteSettings.tooltip = localize("userSettingsRemote", "Remote") + (hostLabel ? ` [${hostLabel}]` : "");
    this.workspaceSettings = this._register(new Action("workspaceSettings", "", ".settings-tab", false, () => this.updateTarget(ConfigurationTarget.WORKSPACE)));
    this.folderSettingsAction = this._register(new Action("folderSettings", "", ".settings-tab", false, async (folder) => {
      this.updateTarget(isWorkspaceFolder(folder) ? folder.uri : ConfigurationTarget.USER_LOCAL);
    }));
    this.folderSettings = this._register(this.instantiationService.createInstance(FolderSettingsActionViewItem, this.folderSettingsAction));
    this.resetLabels();
    this.update();
    this.settingsSwitcherBar.push([this.userLocalSettings, this.userRemoteSettings, this.workspaceSettings, this.folderSettingsAction]);
  }
  get settingsTarget() {
    return this._settingsTarget;
  }
  set settingsTarget(settingsTarget) {
    this._settingsTarget = settingsTarget;
    this.userLocalSettings.checked = ConfigurationTarget.USER_LOCAL === this.settingsTarget;
    this.userRemoteSettings.checked = ConfigurationTarget.USER_REMOTE === this.settingsTarget;
    this.workspaceSettings.checked = ConfigurationTarget.WORKSPACE === this.settingsTarget;
    if (this.settingsTarget instanceof URI) {
      this.folderSettings.action.checked = true;
      this.folderSettings.folder = this.contextService.getWorkspaceFolder(this.settingsTarget);
    } else {
      this.folderSettings.action.checked = false;
    }
  }
  setResultCount(settingsTarget, count) {
    if (settingsTarget === ConfigurationTarget.WORKSPACE) {
      let label = this.contextService.getWorkspace().name ?? localize("workspaceSettings", "Workspace");
      if (count) {
        label += ` (${count})`;
      }
      this.workspaceSettings.label = label;
    } else if (settingsTarget === ConfigurationTarget.USER_LOCAL) {
      let label = localize("userSettings", "User");
      if (count) {
        label += ` (${count})`;
      }
      this.userLocalSettings.label = label;
    } else if (settingsTarget instanceof URI) {
      this.folderSettings.setCount(settingsTarget, count);
    }
  }
  updateLanguageFilterIndicators(filter) {
    this.resetLabels();
    if (filter) {
      const languageToUse = this.languageService.getLanguageName(filter);
      if (languageToUse) {
        const languageSuffix = ` [${languageToUse}]`;
        this.userLocalSettings.label += languageSuffix;
        this.userRemoteSettings.label += languageSuffix;
        this.workspaceSettings.label += languageSuffix;
        this.folderSettingsAction.label += languageSuffix;
      }
    }
  }
  onWorkbenchStateChanged() {
    this.folderSettings.folder = null;
    this.update();
    if (this.settingsTarget === ConfigurationTarget.WORKSPACE && this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      this.updateTarget(ConfigurationTarget.USER_LOCAL);
    }
  }
  updateTarget(settingsTarget) {
    const isSameTarget = this.settingsTarget === settingsTarget || settingsTarget instanceof URI && this.settingsTarget instanceof URI && isEqual(this.settingsTarget, settingsTarget);
    if (!isSameTarget) {
      this.settingsTarget = settingsTarget;
      this._onDidTargetChange.fire(this.settingsTarget);
    }
    return Promise.resolve(void 0);
  }
  async update() {
    this.settingsSwitcherBar.domNode.classList.toggle("empty-workbench", this.contextService.getWorkbenchState() === WorkbenchState.EMPTY);
    this.userRemoteSettings.enabled = !!(this.options.enableRemoteSettings && this.environmentService.remoteAuthority);
    this.workspaceSettings.enabled = this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY;
    this.folderSettings.action.enabled = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && this.contextService.getWorkspace().folders.length > 0;
    this.workspaceSettings.tooltip = localize("workspaceSettings", "Workspace");
  }
};
SettingsTargetsWidget = __decorateClass([
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IWorkbenchEnvironmentService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, ILanguageService)
], SettingsTargetsWidget);
let SearchWidget = class extends Widget {
  constructor(parent, options, contextViewService, instantiationService, contextKeyService, keybindingService) {
    super();
    this.options = options;
    this.contextViewService = contextViewService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.keybindingService = keybindingService;
    this._onDidChange = this._register(new Emitter());
    this._onFocus = this._register(new Emitter());
    this.create(parent);
  }
  get onDidChange() {
    return this._onDidChange.event;
  }
  get onFocus() {
    return this._onFocus.event;
  }
  create(parent) {
    this.domNode = DOM.append(parent, DOM.$("div.settings-header-widget"));
    this.createSearchContainer(DOM.append(this.domNode, DOM.$("div.settings-search-container")));
    this.controlsDiv = DOM.append(this.domNode, DOM.$("div.settings-search-controls"));
    if (this.options.showResultCount) {
      this.countElement = DOM.append(this.controlsDiv, DOM.$(".settings-count-widget"));
      this.countElement.style.backgroundColor = asCssVariable(badgeBackground);
      this.countElement.style.color = asCssVariable(badgeForeground);
      this.countElement.style.border = `1px solid ${asCssVariable(contrastBorder)}`;
    }
    this.inputBox.inputElement.setAttribute("aria-live", this.options.ariaLive || "off");
    if (this.options.ariaLabelledBy) {
      this.inputBox.inputElement.setAttribute("aria-labelledBy", this.options.ariaLabelledBy);
    }
    const focusTracker = this._register(DOM.trackFocus(this.inputBox.inputElement));
    this._register(focusTracker.onDidFocus(() => this._onFocus.fire()));
    const focusKey = this.options.focusKey;
    if (focusKey) {
      this._register(focusTracker.onDidFocus(() => focusKey.set(true)));
      this._register(focusTracker.onDidBlur(() => focusKey.set(false)));
    }
  }
  createSearchContainer(searchContainer) {
    this.searchContainer = searchContainer;
    const searchInput = DOM.append(this.searchContainer, DOM.$("div.settings-search-input"));
    this.inputBox = this._register(this.createInputBox(searchInput));
    this._register(this.inputBox.onDidChange((value) => this._onDidChange.fire(value)));
  }
  createInputBox(parent) {
    const showHistoryHint = () => showHistoryKeybindingHint(this.keybindingService);
    return new ContextScopedHistoryInputBox(parent, this.contextViewService, { ...this.options, showHistoryHint }, this.contextKeyService);
  }
  showMessage(message) {
    if (this.countElement && message !== this.countElement.textContent) {
      this.countElement.textContent = message;
      this.inputBox.inputElement.setAttribute("aria-label", message);
      this.inputBox.inputElement.style.paddingRight = this.getControlsWidth() + "px";
    }
  }
  layout(dimension) {
    if (dimension.width < 400) {
      this.countElement?.classList.add("hide");
      this.inputBox.inputElement.style.paddingRight = "0px";
    } else {
      this.countElement?.classList.remove("hide");
      this.inputBox.inputElement.style.paddingRight = this.getControlsWidth() + "px";
    }
  }
  getControlsWidth() {
    const countWidth = this.countElement ? DOM.getTotalWidth(this.countElement) : 0;
    return countWidth + 20;
  }
  focus() {
    this.inputBox.focus();
    if (this.getValue()) {
      this.inputBox.select();
    }
  }
  hasFocus() {
    return this.inputBox.hasFocus();
  }
  clear() {
    this.inputBox.value = "";
  }
  getValue() {
    return this.inputBox.value;
  }
  setValue(value) {
    return this.inputBox.value = value;
  }
  dispose() {
    this.options.focusKey?.set(false);
    super.dispose();
  }
};
SearchWidget = __decorateClass([
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IKeybindingService)
], SearchWidget);
class EditPreferenceWidget extends Disposable {
  constructor(editor) {
    super();
    this.editor = editor;
    this._line = -1;
    this._preferences = [];
    this._onClick = this._register(new Emitter());
    this.onClick = this._onClick.event;
    this._editPreferenceDecoration = this.editor.createDecorationsCollection();
    this._register(this.editor.onMouseDown((e) => {
      if (e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN || e.target.detail.isAfterLines || !this.isVisible()) {
        return;
      }
      this._onClick.fire(e);
    }));
  }
  get preferences() {
    return this._preferences;
  }
  getLine() {
    return this._line;
  }
  show(line, hoverMessage, preferences) {
    this._preferences = preferences;
    const newDecoration = [];
    this._line = line;
    newDecoration.push({
      options: {
        description: "edit-preference-widget-decoration",
        glyphMarginClassName: ThemeIcon.asClassName(settingsEditIcon),
        glyphMarginHoverMessage: new MarkdownString().appendText(hoverMessage),
        stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      },
      range: {
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: 1
      }
    });
    this._editPreferenceDecoration.set(newDecoration);
  }
  hide() {
    this._editPreferenceDecoration.clear();
  }
  isVisible() {
    return this._editPreferenceDecoration.length > 0;
  }
  dispose() {
    this.hide();
    super.dispose();
  }
}
export {
  EditPreferenceWidget,
  FolderSettingsActionViewItem,
  SearchWidget,
  SettingsTargetsWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHByZWZlcmVuY2VzXFxicm93c2VyXFxwcmVmZXJlbmNlc1dpZGdldHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIsIEFjdGlvbnNPcmllbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSwgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB0eXBlIHsgSU1hbmFnZWRIb3ZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBIaXN0b3J5SW5wdXRCb3gsIElIaXN0b3J5SW5wdXRPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IFdpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS93aWRnZXQuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJRWRpdG9yTW91c2VFdmVudCwgTW91c2VUYXJnZXRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElNb2RlbERlbHRhRGVjb3JhdGlvbiwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSwgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgQ29udGV4dFNjb3BlZEhpc3RvcnlJbnB1dEJveCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hpc3RvcnkvYnJvd3Nlci9jb250ZXh0U2NvcGVkSGlzdG9yeVdpZGdldC5qcyc7XG5pbXBvcnQgeyBzaG93SGlzdG9yeUtleWJpbmRpbmdIaW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaGlzdG9yeS9icm93c2VyL2hpc3RvcnlXaWRnZXRLZXliaW5kaW5nSGludC5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlLCBiYWRnZUJhY2tncm91bmQsIGJhZGdlRm9yZWdyb3VuZCwgY29udHJhc3RCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBpc1dvcmtzcGFjZUZvbGRlciwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHNldHRpbmdzRWRpdEljb24sIHNldHRpbmdzU2NvcGVEcm9wRG93bkljb24gfSBmcm9tICcuL3ByZWZlcmVuY2VzSWNvbnMuanMnO1xuXG5leHBvcnQgY2xhc3MgRm9sZGVyU2V0dGluZ3NBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cblx0cHJpdmF0ZSBfZm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyIHwgbnVsbDtcblx0cHJpdmF0ZSBfZm9sZGVyU2V0dGluZ0NvdW50cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cblx0cHJpdmF0ZSBjb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBhbmNob3JFbGVtZW50ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgYW5jaG9yRWxlbWVudEhvdmVyITogSU1hbmFnZWRIb3Zlcjtcblx0cHJpdmF0ZSBsYWJlbEVsZW1lbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBkZXRhaWxzRWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGRyb3BEb3duRWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobnVsbCwgYWN0aW9uKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdHRoaXMuX2ZvbGRlciA9IHdvcmtzcGFjZS5mb2xkZXJzLmxlbmd0aCA9PT0gMSA/IHdvcmtzcGFjZS5mb2xkZXJzWzBdIDogbnVsbDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycygoKSA9PiB0aGlzLm9uV29ya3NwYWNlRm9sZGVyc0NoYW5nZWQoKSkpO1xuXHR9XG5cblx0Z2V0IGZvbGRlcigpOiBJV29ya3NwYWNlRm9sZGVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZvbGRlcjtcblx0fVxuXG5cdHNldCBmb2xkZXIoZm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyIHwgbnVsbCkge1xuXHRcdHRoaXMuX2ZvbGRlciA9IGZvbGRlcjtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0c2V0Q291bnQoc2V0dGluZ3NUYXJnZXQ6IFVSSSwgY291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHNldHRpbmdzVGFyZ2V0KTtcblx0XHRpZiAoIXdvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCd1bmtub3duIGZvbGRlcicpO1xuXHRcdH1cblx0XHRjb25zdCBmb2xkZXIgPSB3b3Jrc3BhY2VGb2xkZXIudXJpO1xuXHRcdHRoaXMuX2ZvbGRlclNldHRpbmdDb3VudHMuc2V0KGZvbGRlci50b1N0cmluZygpLCBjb3VudCk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50ID0gY29udGFpbmVyO1xuXG5cdFx0dGhpcy5jb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0dGhpcy5sYWJlbEVsZW1lbnQgPSBET00uJCgnLmFjdGlvbi10aXRsZScpO1xuXHRcdHRoaXMuZGV0YWlsc0VsZW1lbnQgPSBET00uJCgnLmFjdGlvbi1kZXRhaWxzJyk7XG5cdFx0dGhpcy5kcm9wRG93bkVsZW1lbnQgPSBET00uJCgnLmRyb3Bkb3duLWljb24uaGlkZScgKyBUaGVtZUljb24uYXNDU1NTZWxlY3RvcihzZXR0aW5nc1Njb3BlRHJvcERvd25JY29uKSk7XG5cdFx0dGhpcy5hbmNob3JFbGVtZW50ID0gRE9NLiQoJ2EuYWN0aW9uLWxhYmVsLmZvbGRlci1zZXR0aW5ncycsIHtcblx0XHRcdHJvbGU6ICdidXR0b24nLFxuXHRcdFx0J2FyaWEtaGFzcG9wdXAnOiAndHJ1ZScsXG5cdFx0XHQndGFiaW5kZXgnOiAnMCdcblx0XHR9LCB0aGlzLmxhYmVsRWxlbWVudCwgdGhpcy5kZXRhaWxzRWxlbWVudCwgdGhpcy5kcm9wRG93bkVsZW1lbnQpO1xuXHRcdHRoaXMuYW5jaG9yRWxlbWVudEhvdmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHRoaXMuYW5jaG9yRWxlbWVudCwgJycpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuYW5jaG9yRWxlbWVudCwgRE9NLkV2ZW50VHlwZS5NT1VTRV9ET1dOLCBlID0+IERPTS5FdmVudEhlbHBlci5zdG9wKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmFuY2hvckVsZW1lbnQsIERPTS5FdmVudFR5cGUuQ0xJQ0ssIGUgPT4gdGhpcy5vbkNsaWNrKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgRE9NLkV2ZW50VHlwZS5LRVlfVVAsIGUgPT4gdGhpcy5vbktleVVwKGUpKSk7XG5cblx0XHRET00uYXBwZW5kKHRoaXMuY29udGFpbmVyLCB0aGlzLmFuY2hvckVsZW1lbnQpO1xuXG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgb25LZXlVcChldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGtleWJvYXJkRXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGV2ZW50KTtcblx0XHRzd2l0Y2ggKGtleWJvYXJkRXZlbnQua2V5Q29kZSkge1xuXHRcdFx0Y2FzZSBLZXlDb2RlLkVudGVyOlxuXHRcdFx0Y2FzZSBLZXlDb2RlLlNwYWNlOlxuXHRcdFx0XHR0aGlzLm9uQ2xpY2soZXZlbnQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgb25DbGljayhldmVudDogRE9NLkV2ZW50TGlrZSk6IHZvaWQge1xuXHRcdERPTS5FdmVudEhlbHBlci5zdG9wKGV2ZW50LCB0cnVlKTtcblx0XHRpZiAoIXRoaXMuZm9sZGVyIHx8IHRoaXMuX2FjdGlvbi5jaGVja2VkKSB7XG5cdFx0XHR0aGlzLnNob3dNZW51KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2FjdGlvbi5ydW4odGhpcy5fZm9sZGVyKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlRW5hYmxlZCgpOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUNoZWNrZWQoKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgb25Xb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlZCgpOiB2b2lkIHtcblx0XHRjb25zdCBvbGRGb2xkZXIgPSB0aGlzLl9mb2xkZXI7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRpZiAob2xkRm9sZGVyKSB7XG5cdFx0XHR0aGlzLl9mb2xkZXIgPSB3b3Jrc3BhY2UuZm9sZGVycy5maWx0ZXIoZm9sZGVyID0+IGlzRXF1YWwoZm9sZGVyLnVyaSwgb2xkRm9sZGVyLnVyaSkpWzBdIHx8IHdvcmtzcGFjZS5mb2xkZXJzWzBdO1xuXHRcdH1cblx0XHR0aGlzLl9mb2xkZXIgPSB0aGlzLl9mb2xkZXIgPyB0aGlzLl9mb2xkZXIgOiB3b3Jrc3BhY2UuZm9sZGVycy5sZW5ndGggPT09IDEgPyB3b3Jrc3BhY2UuZm9sZGVyc1swXSA6IG51bGw7XG5cblx0XHR0aGlzLnVwZGF0ZSgpO1xuXG5cdFx0aWYgKHRoaXMuX2FjdGlvbi5jaGVja2VkKSB7XG5cdFx0XHR0aGlzLl9hY3Rpb24ucnVuKHRoaXMuX2ZvbGRlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGUoKTogdm9pZCB7XG5cdFx0bGV0IHRvdGFsID0gMDtcblx0XHR0aGlzLl9mb2xkZXJTZXR0aW5nQ291bnRzLmZvckVhY2gobiA9PiB0b3RhbCArPSBuKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0aWYgKHRoaXMuX2ZvbGRlcikge1xuXHRcdFx0dGhpcy5sYWJlbEVsZW1lbnQudGV4dENvbnRlbnQgPSB0aGlzLl9mb2xkZXIubmFtZTtcblx0XHRcdHRoaXMuYW5jaG9yRWxlbWVudEhvdmVyLnVwZGF0ZSh0aGlzLl9mb2xkZXIubmFtZSk7XG5cdFx0XHRjb25zdCBkZXRhaWxzVGV4dCA9IHRoaXMubGFiZWxXaXRoQ291bnQodGhpcy5fYWN0aW9uLmxhYmVsLCB0b3RhbCk7XG5cdFx0XHR0aGlzLmRldGFpbHNFbGVtZW50LnRleHRDb250ZW50ID0gZGV0YWlsc1RleHQ7XG5cdFx0XHR0aGlzLmRyb3BEb3duRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdoaWRlJywgd29ya3NwYWNlLmZvbGRlcnMubGVuZ3RoID09PSAxIHx8ICF0aGlzLl9hY3Rpb24uY2hlY2tlZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGxhYmVsVGV4dCA9IHRoaXMubGFiZWxXaXRoQ291bnQodGhpcy5fYWN0aW9uLmxhYmVsLCB0b3RhbCk7XG5cdFx0XHR0aGlzLmxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9IGxhYmVsVGV4dDtcblx0XHRcdHRoaXMuZGV0YWlsc0VsZW1lbnQudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdHRoaXMuYW5jaG9yRWxlbWVudEhvdmVyLnVwZGF0ZSh0aGlzLl9hY3Rpb24ubGFiZWwpO1xuXHRcdFx0dGhpcy5kcm9wRG93bkVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZScpO1xuXHRcdH1cblxuXHRcdHRoaXMuYW5jaG9yRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdjaGVja2VkJywgdGhpcy5fYWN0aW9uLmNoZWNrZWQpO1xuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgIXRoaXMuX2FjdGlvbi5lbmFibGVkKTtcblx0fVxuXG5cdHByaXZhdGUgc2hvd01lbnUoKTogdm9pZCB7XG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gdGhpcy5jb250YWluZXIsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiB0aGlzLmdldERyb3Bkb3duTWVudUFjdGlvbnMoKSxcblx0XHRcdGdldEFjdGlvblZpZXdJdGVtOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRvbkhpZGU6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5hbmNob3JFbGVtZW50LmJsdXIoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RHJvcGRvd25NZW51QWN0aW9ucygpOiBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0aWYgKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFICYmIHdvcmtzcGFjZUZvbGRlcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKC4uLndvcmtzcGFjZUZvbGRlcnMubWFwKChmb2xkZXIsIGluZGV4KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZvbGRlckNvdW50ID0gdGhpcy5fZm9sZGVyU2V0dGluZ0NvdW50cy5nZXQoZm9sZGVyLnVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogJ2ZvbGRlclNldHRpbmdzVGFyZ2V0JyArIGluZGV4LFxuXHRcdFx0XHRcdGxhYmVsOiB0aGlzLmxhYmVsV2l0aENvdW50KGZvbGRlci5uYW1lLCBmb2xkZXJDb3VudCksXG5cdFx0XHRcdFx0dG9vbHRpcDogdGhpcy5sYWJlbFdpdGhDb3VudChmb2xkZXIubmFtZSwgZm9sZGVyQ291bnQpLFxuXHRcdFx0XHRcdGNoZWNrZWQ6ICEhdGhpcy5mb2xkZXIgJiYgaXNFcXVhbCh0aGlzLmZvbGRlci51cmksIGZvbGRlci51cmkpLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuX2FjdGlvbi5ydW4oZm9sZGVyKVxuXHRcdFx0XHR9O1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gYWN0aW9ucztcblx0fVxuXG5cdHByaXZhdGUgbGFiZWxXaXRoQ291bnQobGFiZWw6IHN0cmluZywgY291bnQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0Ly8gQXBwZW5kIHRoZSBjb3VudCBpZiBpdCdzID4wIGFuZCBub3QgdW5kZWZpbmVkXG5cdFx0aWYgKGNvdW50KSB7XG5cdFx0XHRsYWJlbCArPSBgICgke2NvdW50fSlgO1xuXHRcdH1cblxuXHRcdHJldHVybiBsYWJlbDtcblx0fVxufVxuXG5leHBvcnQgdHlwZSBTZXR0aW5nc1RhcmdldCA9IENvbmZpZ3VyYXRpb25UYXJnZXQuQVBQTElDQVRJT04gfCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwgfCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFIHwgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UgfCBVUkk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNldHRpbmdzVGFyZ2V0c1dpZGdldE9wdGlvbnMge1xuXHRlbmFibGVSZW1vdGVTZXR0aW5ncz86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nc1RhcmdldHNXaWRnZXQgZXh0ZW5kcyBXaWRnZXQge1xuXG5cdHByaXZhdGUgc2V0dGluZ3NTd2l0Y2hlckJhciE6IEFjdGlvbkJhcjtcblx0cHJpdmF0ZSB1c2VyTG9jYWxTZXR0aW5ncyE6IEFjdGlvbjtcblx0cHJpdmF0ZSB1c2VyUmVtb3RlU2V0dGluZ3MhOiBBY3Rpb247XG5cdHByaXZhdGUgd29ya3NwYWNlU2V0dGluZ3MhOiBBY3Rpb247XG5cdHByaXZhdGUgZm9sZGVyU2V0dGluZ3NBY3Rpb24hOiBBY3Rpb247XG5cdHByaXZhdGUgZm9sZGVyU2V0dGluZ3MhOiBGb2xkZXJTZXR0aW5nc0FjdGlvblZpZXdJdGVtO1xuXHRwcml2YXRlIG9wdGlvbnM6IElTZXR0aW5nc1RhcmdldHNXaWRnZXRPcHRpb25zO1xuXG5cdHByaXZhdGUgX3NldHRpbmdzVGFyZ2V0OiBTZXR0aW5nc1RhcmdldCB8IG51bGwgPSBudWxsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVGFyZ2V0Q2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U2V0dGluZ3NUYXJnZXQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFRhcmdldENoYW5nZTogRXZlbnQ8U2V0dGluZ3NUYXJnZXQ+ID0gdGhpcy5fb25EaWRUYXJnZXRDaGFuZ2UuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRvcHRpb25zOiBJU2V0dGluZ3NUYXJnZXRzV2lkZ2V0T3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnMgPz8ge307XG5cdFx0dGhpcy5jcmVhdGUocGFyZW50KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUoKCkgPT4gdGhpcy5vbldvcmtiZW5jaFN0YXRlQ2hhbmdlZCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNldExhYmVscygpIHtcblx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdFx0Y29uc3QgaG9zdExhYmVsID0gcmVtb3RlQXV0aG9yaXR5ICYmIHRoaXMubGFiZWxTZXJ2aWNlLmdldEhvc3RMYWJlbChTY2hlbWFzLnZzY29kZVJlbW90ZSwgcmVtb3RlQXV0aG9yaXR5KTtcblx0XHR0aGlzLnVzZXJMb2NhbFNldHRpbmdzLmxhYmVsID0gbG9jYWxpemUoJ3VzZXJTZXR0aW5ncycsIFwiVXNlclwiKTtcblx0XHR0aGlzLnVzZXJSZW1vdGVTZXR0aW5ncy5sYWJlbCA9IGxvY2FsaXplKCd1c2VyU2V0dGluZ3NSZW1vdGUnLCBcIlJlbW90ZVwiKSArIChob3N0TGFiZWwgPyBgIFske2hvc3RMYWJlbH1dYCA6ICcnKTtcblx0XHR0aGlzLndvcmtzcGFjZVNldHRpbmdzLmxhYmVsID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5uYW1lIHx8IGxvY2FsaXplKCd3b3Jrc3BhY2VTZXR0aW5ncycsIFwiV29ya3NwYWNlXCIpO1xuXHRcdHRoaXMuZm9sZGVyU2V0dGluZ3NBY3Rpb24ubGFiZWwgPSBsb2NhbGl6ZSgnZm9sZGVyU2V0dGluZ3MnLCBcIkZvbGRlclwiKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBzZXR0aW5nc1RhYnNXaWRnZXQgPSBET00uYXBwZW5kKHBhcmVudCwgRE9NLiQoJy5zZXR0aW5ncy10YWJzLXdpZGdldCcpKTtcblx0XHR0aGlzLnNldHRpbmdzU3dpdGNoZXJCYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKHNldHRpbmdzVGFic1dpZGdldCwge1xuXHRcdFx0b3JpZW50YXRpb246IEFjdGlvbnNPcmllbnRhdGlvbi5IT1JJWk9OVEFMLFxuXHRcdFx0Zm9jdXNPbmx5RW5hYmxlZEl0ZW1zOiB0cnVlLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnc2V0dGluZ3NTd2l0Y2hlckJhckFyaWFMYWJlbCcsIFwiU2V0dGluZ3MgU3dpdGNoZXJcIiksXG5cdFx0XHRhcmlhUm9sZTogJ3RhYmxpc3QnLFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucykgPT4gYWN0aW9uLmlkID09PSAnZm9sZGVyU2V0dGluZ3MnID8gdGhpcy5mb2xkZXJTZXR0aW5ncyA6IHVuZGVmaW5lZFxuXHRcdH0pKTtcblxuXHRcdHRoaXMudXNlckxvY2FsU2V0dGluZ3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKCd1c2VyU2V0dGluZ3MnLCAnJywgJy5zZXR0aW5ncy10YWInLCB0cnVlLCAoKSA9PiB0aGlzLnVwZGF0ZVRhcmdldChDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwpKSk7XG5cdFx0dGhpcy51c2VyTG9jYWxTZXR0aW5ncy50b29sdGlwID0gbG9jYWxpemUoJ3VzZXJTZXR0aW5ncycsIFwiVXNlclwiKTtcblxuXHRcdHRoaXMudXNlclJlbW90ZVNldHRpbmdzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbigndXNlclNldHRpbmdzUmVtb3RlJywgJycsICcuc2V0dGluZ3MtdGFiJywgdHJ1ZSwgKCkgPT4gdGhpcy51cGRhdGVUYXJnZXQoQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSkpKTtcblx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdFx0Y29uc3QgaG9zdExhYmVsID0gcmVtb3RlQXV0aG9yaXR5ICYmIHRoaXMubGFiZWxTZXJ2aWNlLmdldEhvc3RMYWJlbChTY2hlbWFzLnZzY29kZVJlbW90ZSwgcmVtb3RlQXV0aG9yaXR5KTtcblx0XHR0aGlzLnVzZXJSZW1vdGVTZXR0aW5ncy50b29sdGlwID0gbG9jYWxpemUoJ3VzZXJTZXR0aW5nc1JlbW90ZScsIFwiUmVtb3RlXCIpICsgKGhvc3RMYWJlbCA/IGAgWyR7aG9zdExhYmVsfV1gIDogJycpO1xuXG5cdFx0dGhpcy53b3Jrc3BhY2VTZXR0aW5ncyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb24oJ3dvcmtzcGFjZVNldHRpbmdzJywgJycsICcuc2V0dGluZ3MtdGFiJywgZmFsc2UsICgpID0+IHRoaXMudXBkYXRlVGFyZ2V0KENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKSkpO1xuXG5cdFx0dGhpcy5mb2xkZXJTZXR0aW5nc0FjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb24oJ2ZvbGRlclNldHRpbmdzJywgJycsICcuc2V0dGluZ3MtdGFiJywgZmFsc2UsIGFzeW5jIGZvbGRlciA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZVRhcmdldChpc1dvcmtzcGFjZUZvbGRlcihmb2xkZXIpID8gZm9sZGVyLnVyaSA6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuZm9sZGVyU2V0dGluZ3MgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZvbGRlclNldHRpbmdzQWN0aW9uVmlld0l0ZW0sIHRoaXMuZm9sZGVyU2V0dGluZ3NBY3Rpb24pKTtcblxuXHRcdHRoaXMucmVzZXRMYWJlbHMoKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXG5cdFx0dGhpcy5zZXR0aW5nc1N3aXRjaGVyQmFyLnB1c2goW3RoaXMudXNlckxvY2FsU2V0dGluZ3MsIHRoaXMudXNlclJlbW90ZVNldHRpbmdzLCB0aGlzLndvcmtzcGFjZVNldHRpbmdzLCB0aGlzLmZvbGRlclNldHRpbmdzQWN0aW9uXSk7XG5cdH1cblxuXHRnZXQgc2V0dGluZ3NUYXJnZXQoKTogU2V0dGluZ3NUYXJnZXQgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fc2V0dGluZ3NUYXJnZXQ7XG5cdH1cblxuXHRzZXQgc2V0dGluZ3NUYXJnZXQoc2V0dGluZ3NUYXJnZXQ6IFNldHRpbmdzVGFyZ2V0IHwgbnVsbCkge1xuXHRcdHRoaXMuX3NldHRpbmdzVGFyZ2V0ID0gc2V0dGluZ3NUYXJnZXQ7XG5cdFx0dGhpcy51c2VyTG9jYWxTZXR0aW5ncy5jaGVja2VkID0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMID09PSB0aGlzLnNldHRpbmdzVGFyZ2V0O1xuXHRcdHRoaXMudXNlclJlbW90ZVNldHRpbmdzLmNoZWNrZWQgPSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFID09PSB0aGlzLnNldHRpbmdzVGFyZ2V0O1xuXHRcdHRoaXMud29ya3NwYWNlU2V0dGluZ3MuY2hlY2tlZCA9IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFID09PSB0aGlzLnNldHRpbmdzVGFyZ2V0O1xuXHRcdGlmICh0aGlzLnNldHRpbmdzVGFyZ2V0IGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHR0aGlzLmZvbGRlclNldHRpbmdzLmFjdGlvbi5jaGVja2VkID0gdHJ1ZTtcblx0XHRcdHRoaXMuZm9sZGVyU2V0dGluZ3MuZm9sZGVyID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIodGhpcy5zZXR0aW5nc1RhcmdldCBhcyBVUkkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmZvbGRlclNldHRpbmdzLmFjdGlvbi5jaGVja2VkID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0c2V0UmVzdWx0Q291bnQoc2V0dGluZ3NUYXJnZXQ6IFNldHRpbmdzVGFyZ2V0LCBjb3VudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHNldHRpbmdzVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSkge1xuXHRcdFx0bGV0IGxhYmVsID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5uYW1lID8/IGxvY2FsaXplKCd3b3Jrc3BhY2VTZXR0aW5ncycsIFwiV29ya3NwYWNlXCIpO1xuXHRcdFx0aWYgKGNvdW50KSB7XG5cdFx0XHRcdGxhYmVsICs9IGAgKCR7Y291bnR9KWA7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMud29ya3NwYWNlU2V0dGluZ3MubGFiZWwgPSBsYWJlbDtcblx0XHR9IGVsc2UgaWYgKHNldHRpbmdzVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwpIHtcblx0XHRcdGxldCBsYWJlbCA9IGxvY2FsaXplKCd1c2VyU2V0dGluZ3MnLCBcIlVzZXJcIik7XG5cdFx0XHRpZiAoY291bnQpIHtcblx0XHRcdFx0bGFiZWwgKz0gYCAoJHtjb3VudH0pYDtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy51c2VyTG9jYWxTZXR0aW5ncy5sYWJlbCA9IGxhYmVsO1xuXHRcdH0gZWxzZSBpZiAoc2V0dGluZ3NUYXJnZXQgaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdHRoaXMuZm9sZGVyU2V0dGluZ3Muc2V0Q291bnQoc2V0dGluZ3NUYXJnZXQsIGNvdW50KTtcblx0XHR9XG5cdH1cblxuXHR1cGRhdGVMYW5ndWFnZUZpbHRlckluZGljYXRvcnMoZmlsdGVyOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLnJlc2V0TGFiZWxzKCk7XG5cdFx0aWYgKGZpbHRlcikge1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VUb1VzZSA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlTmFtZShmaWx0ZXIpO1xuXHRcdFx0aWYgKGxhbmd1YWdlVG9Vc2UpIHtcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VTdWZmaXggPSBgIFske2xhbmd1YWdlVG9Vc2V9XWA7XG5cdFx0XHRcdHRoaXMudXNlckxvY2FsU2V0dGluZ3MubGFiZWwgKz0gbGFuZ3VhZ2VTdWZmaXg7XG5cdFx0XHRcdHRoaXMudXNlclJlbW90ZVNldHRpbmdzLmxhYmVsICs9IGxhbmd1YWdlU3VmZml4O1xuXHRcdFx0XHR0aGlzLndvcmtzcGFjZVNldHRpbmdzLmxhYmVsICs9IGxhbmd1YWdlU3VmZml4O1xuXHRcdFx0XHR0aGlzLmZvbGRlclNldHRpbmdzQWN0aW9uLmxhYmVsICs9IGxhbmd1YWdlU3VmZml4O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Xb3JrYmVuY2hTdGF0ZUNoYW5nZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5mb2xkZXJTZXR0aW5ncy5mb2xkZXIgPSBudWxsO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0aWYgKHRoaXMuc2V0dGluZ3NUYXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFICYmIHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVRhcmdldChDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwpO1xuXHRcdH1cblx0fVxuXG5cdHVwZGF0ZVRhcmdldChzZXR0aW5nc1RhcmdldDogU2V0dGluZ3NUYXJnZXQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpc1NhbWVUYXJnZXQgPSB0aGlzLnNldHRpbmdzVGFyZ2V0ID09PSBzZXR0aW5nc1RhcmdldCB8fFxuXHRcdFx0c2V0dGluZ3NUYXJnZXQgaW5zdGFuY2VvZiBVUkkgJiZcblx0XHRcdHRoaXMuc2V0dGluZ3NUYXJnZXQgaW5zdGFuY2VvZiBVUkkgJiZcblx0XHRcdGlzRXF1YWwodGhpcy5zZXR0aW5nc1RhcmdldCwgc2V0dGluZ3NUYXJnZXQpO1xuXG5cdFx0aWYgKCFpc1NhbWVUYXJnZXQpIHtcblx0XHRcdHRoaXMuc2V0dGluZ3NUYXJnZXQgPSBzZXR0aW5nc1RhcmdldDtcblx0XHRcdHRoaXMuX29uRGlkVGFyZ2V0Q2hhbmdlLmZpcmUodGhpcy5zZXR0aW5nc1RhcmdldCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5zZXR0aW5nc1N3aXRjaGVyQmFyLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnZW1wdHktd29ya2JlbmNoJywgdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSk7XG5cdFx0dGhpcy51c2VyUmVtb3RlU2V0dGluZ3MuZW5hYmxlZCA9ICEhKHRoaXMub3B0aW9ucy5lbmFibGVSZW1vdGVTZXR0aW5ncyAmJiB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpO1xuXHRcdHRoaXMud29ya3NwYWNlU2V0dGluZ3MuZW5hYmxlZCA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFk7XG5cdFx0dGhpcy5mb2xkZXJTZXR0aW5ncy5hY3Rpb24uZW5hYmxlZCA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFICYmIHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5sZW5ndGggPiAwO1xuXG5cdFx0dGhpcy53b3Jrc3BhY2VTZXR0aW5ncy50b29sdGlwID0gbG9jYWxpemUoJ3dvcmtzcGFjZVNldHRpbmdzJywgXCJXb3Jrc3BhY2VcIik7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBTZWFyY2hPcHRpb25zIGV4dGVuZHMgSUhpc3RvcnlJbnB1dE9wdGlvbnMge1xuXHRmb2N1c0tleT86IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRzaG93UmVzdWx0Q291bnQ/OiBib29sZWFuO1xuXHRhcmlhTGl2ZT86IHN0cmluZztcblx0YXJpYUxhYmVsbGVkQnk/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBTZWFyY2hXaWRnZXQgZXh0ZW5kcyBXaWRnZXQge1xuXG5cdGRvbU5vZGUhOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIGNvdW50RWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNlYXJjaENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRpbnB1dEJveCE6IEhpc3RvcnlJbnB1dEJveDtcblx0cHJpdmF0ZSBjb250cm9sc0RpdiE6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlOiBFbWl0dGVyPHN0cmluZz4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlKCk6IEV2ZW50PHN0cmluZz4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkZvY3VzOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyBnZXQgb25Gb2N1cygpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLl9vbkZvY3VzLmV2ZW50OyB9XG5cblx0Y29uc3RydWN0b3IocGFyZW50OiBIVE1MRWxlbWVudCwgcHJvdGVjdGVkIG9wdGlvbnM6IFNlYXJjaE9wdGlvbnMsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcm90ZWN0ZWQgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5jcmVhdGUocGFyZW50KTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlKHBhcmVudDogSFRNTEVsZW1lbnQpIHtcblx0XHR0aGlzLmRvbU5vZGUgPSBET00uYXBwZW5kKHBhcmVudCwgRE9NLiQoJ2Rpdi5zZXR0aW5ncy1oZWFkZXItd2lkZ2V0JykpO1xuXHRcdHRoaXMuY3JlYXRlU2VhcmNoQ29udGFpbmVyKERPTS5hcHBlbmQodGhpcy5kb21Ob2RlLCBET00uJCgnZGl2LnNldHRpbmdzLXNlYXJjaC1jb250YWluZXInKSkpO1xuXHRcdHRoaXMuY29udHJvbHNEaXYgPSBET00uYXBwZW5kKHRoaXMuZG9tTm9kZSwgRE9NLiQoJ2Rpdi5zZXR0aW5ncy1zZWFyY2gtY29udHJvbHMnKSk7XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLnNob3dSZXN1bHRDb3VudCkge1xuXHRcdFx0dGhpcy5jb3VudEVsZW1lbnQgPSBET00uYXBwZW5kKHRoaXMuY29udHJvbHNEaXYsIERPTS4kKCcuc2V0dGluZ3MtY291bnQtd2lkZ2V0JykpO1xuXG5cdFx0XHR0aGlzLmNvdW50RWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBhc0Nzc1ZhcmlhYmxlKGJhZGdlQmFja2dyb3VuZCk7XG5cdFx0XHR0aGlzLmNvdW50RWxlbWVudC5zdHlsZS5jb2xvciA9IGFzQ3NzVmFyaWFibGUoYmFkZ2VGb3JlZ3JvdW5kKTtcblx0XHRcdHRoaXMuY291bnRFbGVtZW50LnN0eWxlLmJvcmRlciA9IGAxcHggc29saWQgJHthc0Nzc1ZhcmlhYmxlKGNvbnRyYXN0Qm9yZGVyKX1gO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5wdXRCb3guaW5wdXRFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1saXZlJywgdGhpcy5vcHRpb25zLmFyaWFMaXZlIHx8ICdvZmYnKTtcblx0XHRpZiAodGhpcy5vcHRpb25zLmFyaWFMYWJlbGxlZEJ5KSB7XG5cdFx0XHR0aGlzLmlucHV0Qm94LmlucHV0RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWxsZWRCeScsIHRoaXMub3B0aW9ucy5hcmlhTGFiZWxsZWRCeSk7XG5cdFx0fVxuXHRcdGNvbnN0IGZvY3VzVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKERPTS50cmFja0ZvY3VzKHRoaXMuaW5wdXRCb3guaW5wdXRFbGVtZW50KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZm9jdXNUcmFja2VyLm9uRGlkRm9jdXMoKCkgPT4gdGhpcy5fb25Gb2N1cy5maXJlKCkpKTtcblxuXHRcdGNvbnN0IGZvY3VzS2V5ID0gdGhpcy5vcHRpb25zLmZvY3VzS2V5O1xuXHRcdGlmIChmb2N1c0tleSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZm9jdXNUcmFja2VyLm9uRGlkRm9jdXMoKCkgPT4gZm9jdXNLZXkuc2V0KHRydWUpKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IGZvY3VzS2V5LnNldChmYWxzZSkpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNlYXJjaENvbnRhaW5lcihzZWFyY2hDb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0dGhpcy5zZWFyY2hDb250YWluZXIgPSBzZWFyY2hDb250YWluZXI7XG5cdFx0Y29uc3Qgc2VhcmNoSW5wdXQgPSBET00uYXBwZW5kKHRoaXMuc2VhcmNoQ29udGFpbmVyLCBET00uJCgnZGl2LnNldHRpbmdzLXNlYXJjaC1pbnB1dCcpKTtcblx0XHR0aGlzLmlucHV0Qm94ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5jcmVhdGVJbnB1dEJveChzZWFyY2hJbnB1dCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5wdXRCb3gub25EaWRDaGFuZ2UodmFsdWUgPT4gdGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh2YWx1ZSkpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVJbnB1dEJveChwYXJlbnQ6IEhUTUxFbGVtZW50KTogSGlzdG9yeUlucHV0Qm94IHtcblx0XHRjb25zdCBzaG93SGlzdG9yeUhpbnQgPSAoKSA9PiBzaG93SGlzdG9yeUtleWJpbmRpbmdIaW50KHRoaXMua2V5YmluZGluZ1NlcnZpY2UpO1xuXHRcdHJldHVybiBuZXcgQ29udGV4dFNjb3BlZEhpc3RvcnlJbnB1dEJveChwYXJlbnQsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLCB7IC4uLnRoaXMub3B0aW9ucywgc2hvd0hpc3RvcnlIaW50IH0sIHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0c2hvd01lc3NhZ2UobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gQXZvaWQgc2V0dGluZyB0aGUgYXJpYS1sYWJlbCB1bm5lY2Vzc2FyaWx5LCB0aGUgc2NyZWVucmVhZGVyIHdpbGwgcmVhZCB0aGUgY291bnQgZXZlcnkgdGltZSBpdCdzIHNldCwgc2luY2UgaXQncyBhcmlhLWxpdmU6YXNzZXJ0aXZlLiAjNTA5Njhcblx0XHRpZiAodGhpcy5jb3VudEVsZW1lbnQgJiYgbWVzc2FnZSAhPT0gdGhpcy5jb3VudEVsZW1lbnQudGV4dENvbnRlbnQpIHtcblx0XHRcdHRoaXMuY291bnRFbGVtZW50LnRleHRDb250ZW50ID0gbWVzc2FnZTtcblx0XHRcdHRoaXMuaW5wdXRCb3guaW5wdXRFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIG1lc3NhZ2UpO1xuXHRcdFx0dGhpcy5pbnB1dEJveC5pbnB1dEVsZW1lbnQuc3R5bGUucGFkZGluZ1JpZ2h0ID0gdGhpcy5nZXRDb250cm9sc1dpZHRoKCkgKyAncHgnO1xuXHRcdH1cblx0fVxuXG5cdGxheW91dChkaW1lbnNpb246IERPTS5EaW1lbnNpb24pIHtcblx0XHRpZiAoZGltZW5zaW9uLndpZHRoIDwgNDAwKSB7XG5cdFx0XHR0aGlzLmNvdW50RWxlbWVudD8uY2xhc3NMaXN0LmFkZCgnaGlkZScpO1xuXG5cdFx0XHR0aGlzLmlucHV0Qm94LmlucHV0RWxlbWVudC5zdHlsZS5wYWRkaW5nUmlnaHQgPSAnMHB4Jztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jb3VudEVsZW1lbnQ/LmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGUnKTtcblxuXHRcdFx0dGhpcy5pbnB1dEJveC5pbnB1dEVsZW1lbnQuc3R5bGUucGFkZGluZ1JpZ2h0ID0gdGhpcy5nZXRDb250cm9sc1dpZHRoKCkgKyAncHgnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29udHJvbHNXaWR0aCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IGNvdW50V2lkdGggPSB0aGlzLmNvdW50RWxlbWVudCA/IERPTS5nZXRUb3RhbFdpZHRoKHRoaXMuY291bnRFbGVtZW50KSA6IDA7XG5cdFx0cmV0dXJuIGNvdW50V2lkdGggKyAyMDtcblx0fVxuXG5cdGZvY3VzKCkge1xuXHRcdHRoaXMuaW5wdXRCb3guZm9jdXMoKTtcblx0XHRpZiAodGhpcy5nZXRWYWx1ZSgpKSB7XG5cdFx0XHR0aGlzLmlucHV0Qm94LnNlbGVjdCgpO1xuXHRcdH1cblx0fVxuXG5cdGhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlucHV0Qm94Lmhhc0ZvY3VzKCk7XG5cdH1cblxuXHRjbGVhcigpIHtcblx0XHR0aGlzLmlucHV0Qm94LnZhbHVlID0gJyc7XG5cdH1cblxuXHRnZXRWYWx1ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmlucHV0Qm94LnZhbHVlO1xuXHR9XG5cblx0c2V0VmFsdWUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXRCb3gudmFsdWUgPSB2YWx1ZTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5vcHRpb25zLmZvY3VzS2V5Py5zZXQoZmFsc2UpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRWRpdFByZWZlcmVuY2VXaWRnZXQ8VD4gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9saW5lOiBudW1iZXIgPSAtMTtcblx0cHJpdmF0ZSBfcHJlZmVyZW5jZXM6IFRbXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRQcmVmZXJlbmNlRGVjb3JhdGlvbjogSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNsaWNrID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvck1vdXNlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkNsaWNrOiBFdmVudDxJRWRpdG9yTW91c2VFdmVudD4gPSB0aGlzLl9vbkNsaWNrLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgZWRpdG9yOiBJQ29kZUVkaXRvcikge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZWRpdFByZWZlcmVuY2VEZWNvcmF0aW9uID0gdGhpcy5lZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25Nb3VzZURvd24oKGU6IElFZGl0b3JNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS50YXJnZXQudHlwZSAhPT0gTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9HTFlQSF9NQVJHSU4gfHwgZS50YXJnZXQuZGV0YWlsLmlzQWZ0ZXJMaW5lcyB8fCAhdGhpcy5pc1Zpc2libGUoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkNsaWNrLmZpcmUoZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0IHByZWZlcmVuY2VzKCk6IFRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ByZWZlcmVuY2VzO1xuXHR9XG5cblx0Z2V0TGluZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9saW5lO1xuXHR9XG5cblx0c2hvdyhsaW5lOiBudW1iZXIsIGhvdmVyTWVzc2FnZTogc3RyaW5nLCBwcmVmZXJlbmNlczogVFtdKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJlZmVyZW5jZXMgPSBwcmVmZXJlbmNlcztcblx0XHRjb25zdCBuZXdEZWNvcmF0aW9uOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXHRcdHRoaXMuX2xpbmUgPSBsaW5lO1xuXHRcdG5ld0RlY29yYXRpb24ucHVzaCh7XG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnZWRpdC1wcmVmZXJlbmNlLXdpZGdldC1kZWNvcmF0aW9uJyxcblx0XHRcdFx0Z2x5cGhNYXJnaW5DbGFzc05hbWU6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShzZXR0aW5nc0VkaXRJY29uKSxcblx0XHRcdFx0Z2x5cGhNYXJnaW5Ib3Zlck1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQoaG92ZXJNZXNzYWdlKSxcblx0XHRcdFx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsXG5cdFx0XHR9LFxuXHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBsaW5lLFxuXHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogbGluZSxcblx0XHRcdFx0ZW5kQ29sdW1uOiAxXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fZWRpdFByZWZlcmVuY2VEZWNvcmF0aW9uLnNldChuZXdEZWNvcmF0aW9uKTtcblx0fVxuXG5cdGhpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdFByZWZlcmVuY2VEZWNvcmF0aW9uLmNsZWFyKCk7XG5cdH1cblxuXHRpc1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRQcmVmZXJlbmNlRGVjb3JhdGlvbi5sZW5ndGggPiAwO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmhpZGUoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsV0FBVywwQkFBMEI7QUFDOUMsU0FBUywwQkFBa0Q7QUFFM0QsU0FBUywrQkFBK0I7QUFFeEMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsY0FBdUI7QUFDaEMsU0FBUyxlQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxr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
