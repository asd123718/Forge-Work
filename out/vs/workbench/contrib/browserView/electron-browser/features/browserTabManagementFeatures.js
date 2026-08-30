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
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyMod, KeyCode } from "../../../../../base/common/keyCodes.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../../services/editor/common/editorService.js";
import { IEditorGroupsService, GroupsOrder } from "../../../../services/editor/common/editorGroupsService.js";
import { EditorsOrder, EditorResourceAccessor, SideBySideEditor } from "../../../../common/editor.js";
import { IQuickInputService, QuickInputButtonLocation } from "../../../../../platform/quickinput/common/quickInput.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../base/common/event.js";
import { URI } from "../../../../../base/common/uri.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { BrowserViewUri } from "../../../../../platform/browserView/common/browserViewUri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { BrowserEditorInput } from "../../common/browserEditorInput.js";
import { logBrowserOpen } from "../../../../../platform/browserView/common/browserViewTelemetry.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { BrowserViewCommandId } from "../../../../../platform/browserView/common/browserView.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../common/contributions.js";
import { IBrowserViewWorkbenchService } from "../../common/browserView.js";
import { BrowserNewTabPlacementSettingId } from "../browserViewWorkbenchService.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../../platform/configuration/common/configurationRegistry.js";
import { workbenchConfigurationNodeBase } from "../../../../common/configuration.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { isLocalhostAuthority, isAllInterfacesAuthority } from "../../../../../platform/url/common/trustedDomains.js";
import { IConfigurationService, isConfigured } from "../../../../../platform/configuration/common/configuration.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ToggleTitleBarConfigAction } from "../../../../browser/parts/titlebar/titlebarActions.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { match } from "../../../../../base/common/glob.js";
import { $, addDisposableListener, EventType } from "../../../../../base/browser/dom.js";
import { BrowserEditor, BrowserEditorContribution, BrowserWidgetLocation, BROWSER_EDITOR_ACTIVE, BrowserActionCategory, BrowserActionGroup } from "../browserEditor.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { HoverPosition } from "../../../../../base/browser/ui/hover/hoverWidget.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IPreferencesService } from "../../../../services/preferences/common/preferences.js";
import { disposableTimeout } from "../../../../../base/common/async.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { IsSessionsWindowContext, ResourceContextKey } from "../../../../common/contextkeys.js";
import { Schemas } from "../../../../../base/common/network.js";
const CONTEXT_BROWSER_EDITOR_OPEN = new RawContextKey("browserEditorOpen", false, localize("browser.editorOpen", "Whether any browser editor is currently open"));
const closeButtonItem = {
  iconClass: ThemeIcon.asClassName(Codicon.close),
  tooltip: localize("browser.closeTab", "Close")
};
const closeAllButtonItem = {
  iconClass: ThemeIcon.asClassName(Codicon.closeAll),
  tooltip: localize("browser.closeAllTabs", "Close All"),
  location: QuickInputButtonLocation.Inline
};
let BrowserTabQuickPick = class extends Disposable {
  constructor(_editorService, _editorGroupsService, quickInputService, telemetryService, _browserViewService) {
    super();
    this._editorService = _editorService;
    this._editorGroupsService = _editorGroupsService;
    this._browserViewService = _browserViewService;
    this._itemListeners = this._register(new DisposableStore());
    this._openNewTabPick = {
      groupId: -1,
      editor: void 0,
      label: localize("browser.openNewTab", "New Integrated Browser Tab"),
      iconClass: ThemeIcon.asClassName(Codicon.add),
      alwaysShow: true
    };
    this._quickPick = this._register(quickInputService.createQuickPick({ useSeparators: true }));
    this._quickPick.placeholder = localize("browser.quickOpenPlaceholder", "Select a browser tab");
    this._quickPick.matchOnDescription = true;
    this._quickPick.sortByLabel = false;
    this._quickPick.buttons = [closeAllButtonItem];
    this._register(this._quickPick.onDidTriggerItemButton(async ({ item }) => {
      item.editor?.dispose(true);
    }));
    this._register(this._quickPick.onDidTriggerButton(async () => {
      for (const editor of this._browserViewService.getContextualBrowserViews().values()) {
        editor.dispose(true);
      }
    }));
    this._register(this._quickPick.onDidAccept(async () => {
      const [selected] = this._quickPick.selectedItems;
      if (!selected) {
        return;
      }
      if (selected === this._openNewTabPick) {
        logBrowserOpen(telemetryService, "quickOpenWithoutUrl");
        this._quickPick.hide();
        await this._editorService.openEditor({
          resource: BrowserViewUri.forId(generateUuid())
        }, await this._browserViewService.getPreferredGroup());
      } else {
        await this._editorService.openEditor(selected.editor, await this._browserViewService.getPreferredGroup(selected.groupId));
      }
    }));
    this._register(this._quickPick.onDidHide(() => this.dispose()));
  }
  show() {
    this._buildItems();
    const activeEditor = this._editorService.activeEditor;
    if (activeEditor instanceof BrowserEditorInput) {
      const activePick = this._quickPick.items.find((item) => item.type !== "separator" && item.editor === activeEditor);
      if (activePick) {
        this._quickPick.activeItems = [activePick];
      }
    }
    this._quickPick.show();
  }
  _buildItems() {
    this._itemListeners.clear();
    const activeEditor = this._quickPick.activeItems[0]?.editor;
    const picks = [];
    const groups = this._editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE);
    const groupsWithBrowserEditors = groups.map((group) => ({ group, browserEditors: group.editors.filter((e) => e instanceof BrowserEditorInput) })).filter(({ browserEditors }) => browserEditors.length > 0);
    const viewsInGroups = /* @__PURE__ */ new Set();
    for (const { browserEditors } of groupsWithBrowserEditors) {
      for (const editor of browserEditors) {
        viewsInGroups.add(editor.id);
      }
    }
    const backgroundEditors = [...this._browserViewService.getContextualBrowserViews().values()].filter((e) => !viewsInGroups.has(e.id));
    const backgroundLabel = localize("browser.backgroundGroup", "Background");
    const sections = groupsWithBrowserEditors.map(({ group, browserEditors }) => ({
      label: group.label,
      ariaLabel: group.ariaLabel,
      groupId: group.id,
      editors: browserEditors,
      isPinned: (e) => group.isPinned(e)
    }));
    if (backgroundEditors.length > 0) {
      sections.push({ label: backgroundLabel, ariaLabel: backgroundLabel, groupId: ACTIVE_GROUP, editors: backgroundEditors });
    }
    for (const { group } of groupsWithBrowserEditors) {
      this._itemListeners.add(group.onDidModelChange(() => this._buildItems()));
    }
    this._itemListeners.add(this._browserViewService.onDidChangeBrowserViews(() => this._buildItems()));
    const hasMultipleSections = sections.length > 1;
    let newActivePick;
    for (const section of sections) {
      if (hasMultipleSections) {
        picks.push({ type: "separator", label: section.label });
      }
      for (const editor of section.editors) {
        const icon = editor.getIcon();
        const description = editor.getDescription();
        const nameAndDescription = description ? `${editor.getName()} ${description}` : editor.getName();
        const pick = {
          groupId: section.groupId,
          editor,
          label: editor.getName(),
          ariaLabel: hasMultipleSections ? localize("browserEntryAriaLabelWithGroup", "{0}, {1}", nameAndDescription, section.ariaLabel) : nameAndDescription,
          description,
          buttons: [closeButtonItem],
          italic: section.isPinned ? !section.isPinned(editor) : void 0
        };
        if (icon instanceof URI) {
          pick.iconPath = { dark: icon };
        } else if (icon) {
          pick.iconClass = ThemeIcon.asClassName(icon);
        }
        picks.push(pick);
        if (editor === activeEditor) {
          newActivePick = pick;
        }
        this._itemListeners.add(editor.onDidChangeLabel(() => this._buildItems()));
      }
    }
    picks.push({ type: "separator" });
    picks.push(this._openNewTabPick);
    this._quickPick.keepScrollPosition = true;
    this._quickPick.items = picks;
    if (newActivePick) {
      this._quickPick.activeItems = [newActivePick];
    }
  }
};
BrowserTabQuickPick = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IEditorGroupsService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IBrowserViewWorkbenchService)
], BrowserTabQuickPick);
class QuickOpenBrowserAction extends Action2 {
  constructor() {
    super({
      id: BrowserViewCommandId.QuickOpen,
      title: localize2("browser.quickOpenAction", "Quick Open Browser Tab..."),
      icon: Codicon.globe,
      category: BrowserActionCategory,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        // Note: on Linux this conflicts with the "toggle block comment" keybinding.
        //       it's not as problem at the moment becase oh the `when`, but worth noting for the future.
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
        when: BROWSER_EDITOR_ACTIVE
      }
    });
  }
  run(accessor) {
    const picker = accessor.get(IInstantiationService).createInstance(BrowserTabQuickPick);
    picker.show();
  }
}
class OpenIntegratedBrowserAction extends Action2 {
  constructor() {
    super({
      id: BrowserViewCommandId.Open,
      title: localize2("browser.openAction", "Open Integrated Browser"),
      category: BrowserActionCategory,
      icon: Codicon.globe,
      f1: true
    });
  }
  async run(accessor, urlOrOptions) {
    const editorService = accessor.get(IEditorService);
    const telemetryService = accessor.get(ITelemetryService);
    const browserViewService = accessor.get(IBrowserViewWorkbenchService);
    const options = typeof urlOrOptions === "string" ? { url: urlOrOptions } : urlOrOptions ?? {};
    const resource = BrowserViewUri.forId(generateUuid());
    const group = await browserViewService.getPreferredGroup(options.openToSide ? SIDE_GROUP : void 0);
    if (options.reuseUrlFilter) {
      const filterUri = URI.parse(options.reuseUrlFilter);
      const matchingEditor = [...browserViewService.getContextualBrowserViews().values()].find((e) => {
        const editorUri = URI.parse(e.url || "");
        if (filterUri.scheme && options.reuseUrlFilter.startsWith(`${filterUri.scheme}:`) && filterUri.scheme !== editorUri.scheme) {
          return false;
        }
        if (filterUri.authority && !match(filterUri.authority, editorUri.authority)) {
          return false;
        }
        if (filterUri.path && !match(filterUri.path, editorUri.path)) {
          return false;
        }
        if (filterUri.query) {
          const filterParams = new URLSearchParams(filterUri.query);
          const editorParams = new URLSearchParams(editorUri.query);
          if (![...filterParams].every(([key, value]) => match(value, editorParams.get(key) ?? ""))) {
            return false;
          }
        }
        return true;
      });
      if (matchingEditor) {
        if (options.url) {
          matchingEditor.navigate(options.url);
        }
        await editorService.openEditor(matchingEditor);
        return;
      }
    }
    logBrowserOpen(telemetryService, options.url ? "commandWithUrl" : "commandWithoutUrl");
    const editorPane = await editorService.openEditor({ resource, options: { viewState: { url: options.url } } }, group);
    if (options.openToSide && editorPane?.group) {
      editorPane.group.lock(true);
    }
  }
}
class OpenFileInIntegratedBrowserAction extends Action2 {
  constructor() {
    const IS_LOCAL_HTML_FILE = ContextKeyExpr.and(
      ResourceContextKey.Scheme.isEqualTo(Schemas.file),
      ContextKeyExpr.regex(ResourceContextKey.Extension.key, /\.html?$/i)
    );
    super({
      id: BrowserViewCommandId.OpenFile,
      title: localize2("browser.openFileAction", "Open in Integrated Browser"),
      category: BrowserActionCategory,
      icon: Codicon.globe,
      f1: true,
      precondition: IS_LOCAL_HTML_FILE,
      menu: [
        {
          id: MenuId.ExplorerContext,
          group: "navigation",
          order: 29,
          when: IS_LOCAL_HTML_FILE
        },
        {
          id: MenuId.EditorTitleContext,
          group: "1_open",
          order: 5,
          when: IS_LOCAL_HTML_FILE
        },
        {
          id: MenuId.EditorTitle,
          group: "navigation",
          order: 99,
          when: IS_LOCAL_HTML_FILE
        }
      ]
    });
  }
  async run(accessor, resource) {
    const editorService = accessor.get(IEditorService);
    const telemetryService = accessor.get(ITelemetryService);
    const browserViewService = accessor.get(IBrowserViewWorkbenchService);
    const fileUri = resource ?? EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { filterByScheme: [Schemas.file], supportSideBySide: SideBySideEditor.PRIMARY });
    if (!fileUri) {
      return;
    }
    logBrowserOpen(telemetryService, "openFileCommand");
    const browserUri = BrowserViewUri.forId(generateUuid());
    await editorService.openEditor({ resource: browserUri, options: { viewState: { url: fileUri.toString() } } }, await browserViewService.getPreferredGroup());
  }
}
class NewTabAction extends Action2 {
  constructor() {
    super({
      id: BrowserViewCommandId.NewTab,
      title: localize2("browser.newTabAction", "New Tab"),
      category: BrowserActionCategory,
      icon: Codicon.add,
      f1: true,
      precondition: BROWSER_EDITOR_ACTIVE,
      menu: {
        id: MenuId.BrowserActionsToolbar,
        group: BrowserActionGroup.Tabs,
        order: 1,
        isHiddenByDefault: true
      },
      // When already in a browser, Ctrl/Cmd + T opens a new tab
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib + 50,
        // Priority over search actions
        primary: KeyMod.CtrlCmd | KeyCode.KeyT
      }
    });
  }
  async run(accessor, _browserEditor = accessor.get(IEditorService).activeEditorPane) {
    const editorService = accessor.get(IEditorService);
    const telemetryService = accessor.get(ITelemetryService);
    const browserViewService = accessor.get(IBrowserViewWorkbenchService);
    const resource = BrowserViewUri.forId(generateUuid());
    logBrowserOpen(telemetryService, "newTabCommand");
    await editorService.openEditor({ resource }, await browserViewService.getPreferredGroup());
  }
}
class CloseAllBrowserTabsAction extends Action2 {
  constructor() {
    super({
      id: BrowserViewCommandId.CloseAll,
      title: localize2("browser.closeAll", "Close All Browser Tabs"),
      category: BrowserActionCategory,
      f1: true,
      precondition: CONTEXT_BROWSER_EDITOR_OPEN
    });
  }
  async run(accessor) {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    for (const group of editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE)) {
      const browserEditors = group.getEditors(EditorsOrder.SEQUENTIAL).filter((e) => e instanceof BrowserEditorInput);
      if (browserEditors.length > 0) {
        await group.closeEditors(browserEditors);
      }
    }
  }
}
class CloseAllBrowserTabsInGroupAction extends Action2 {
  constructor() {
    super({
      id: BrowserViewCommandId.CloseAllInGroup,
      title: localize2("browser.closeAllInGroup", "Close All Browser Tabs in Group"),
      category: BrowserActionCategory,
      f1: true,
      precondition: BROWSER_EDITOR_ACTIVE
    });
  }
  async run(accessor) {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const editorService = accessor.get(IEditorService);
    const group = editorGroupsService.getGroup(editorService.activeEditorPane?.group?.id ?? editorGroupsService.activeGroup.id);
    if (!group) {
      return;
    }
    const browserEditors = group.getEditors(EditorsOrder.SEQUENTIAL).filter((e) => e instanceof BrowserEditorInput);
    if (browserEditors.length > 0) {
      await group.closeEditors(browserEditors);
    }
  }
}
class OpenOrListBrowsersAction extends Action2 {
  constructor() {
    super({
      id: BrowserViewCommandId.OpenOrList,
      title: localize2("browser.openOrListAction", "Browser"),
      icon: Codicon.globe,
      f1: false,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Slash
      },
      menu: {
        id: MenuId.TitleBar,
        group: "navigation",
        order: 10,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("config.workbench.browser.showInTitleBar", false).negate(),
          ContextKeyExpr.or(
            CONTEXT_BROWSER_EDITOR_OPEN,
            // This is a hack to work around `true` just testing for truthiness of the key. It works since `1 == true` in JS.
            ContextKeyExpr.equals("config.workbench.browser.showInTitleBar", 1)
          )
        )
      }
    });
  }
  async run(accessor) {
    const browserViewService = accessor.get(IBrowserViewWorkbenchService);
    const commandService = accessor.get(ICommandService);
    const hasOpenBrowserEditor = browserViewService.getContextualBrowserViews().size > 0;
    if (hasOpenBrowserEditor) {
      await commandService.executeCommand(BrowserViewCommandId.QuickOpen);
      return;
    }
    await commandService.executeCommand(BrowserViewCommandId.Open);
  }
}
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
  group: "4_auxbar",
  command: {
    id: BrowserViewCommandId.OpenOrList,
    title: localize({ key: "miOpenBrowser", comment: ["&& denotes a mnemonic"] }, "&&Browser")
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: BrowserViewCommandId.CloseAllInGroup, title: localize("browser.closeAllInGroupShort", "Close All Browser Tabs") }, group: "1_close", order: 55, when: BROWSER_EDITOR_ACTIVE });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: {
    id: BrowserViewCommandId.NewTab,
    title: localize2("browser.newTabAction", "New Tab"),
    icon: Codicon.add
  },
  group: "navigation",
  order: 1,
  when: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, IsSessionsWindowContext)
});
registerAction2(QuickOpenBrowserAction);
registerAction2(OpenIntegratedBrowserAction);
registerAction2(OpenFileInIntegratedBrowserAction);
registerAction2(OpenOrListBrowsersAction);
registerAction2(NewTabAction);
registerAction2(CloseAllBrowserTabsAction);
registerAction2(CloseAllBrowserTabsInGroupAction);
registerAction2(class ToggleBrowserTitleBarButton extends ToggleTitleBarConfigAction {
  constructor() {
    super("workbench.browser.showInTitleBar", localize("toggle.browser", "Integrated Browser"), localize("toggle.browserDescription", "Toggle visibility of the Integrated Browser button in title bar"), 8);
  }
});
let BrowserEditorOpenContextKeyContribution = class extends Disposable {
  constructor(contextKeyService, browserViewService) {
    super();
    const contextKey = CONTEXT_BROWSER_EDITOR_OPEN.bindTo(contextKeyService);
    const update = () => contextKey.set(browserViewService.getContextualBrowserViews().size > 0);
    update();
    this._register(browserViewService.onDidChangeBrowserViews(() => update()));
  }
};
BrowserEditorOpenContextKeyContribution.ID = "workbench.contrib.browserEditorOpenContextKey";
BrowserEditorOpenContextKeyContribution = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IBrowserViewWorkbenchService)
], BrowserEditorOpenContextKeyContribution);
registerWorkbenchContribution2(BrowserEditorOpenContextKeyContribution.ID, BrowserEditorOpenContextKeyContribution, WorkbenchPhase.AfterRestored);
let LocalhostLinkOpenerContribution = class extends Disposable {
  constructor(openerService, configurationService, editorService, telemetryService, browserViewWorkbenchService) {
    super();
    this.configurationService = configurationService;
    this.editorService = editorService;
    this.telemetryService = telemetryService;
    this.browserViewWorkbenchService = browserViewWorkbenchService;
    this._register(openerService.registerExternalOpener(this));
  }
  async openExternal(href, ctx, _token) {
    if (!this.configurationService.getValue("workbench.browser.openLocalhostLinks")) {
      return false;
    }
    if (this.browserViewWorkbenchService.willUseRemoteProxy() && ctx.sourceUri) {
      href = ctx.sourceUri.toString();
    }
    try {
      const parsed = new URL(href);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return false;
      }
      if (!isLocalhostAuthority(parsed.host) && !isAllInterfacesAuthority(parsed.host)) {
        return false;
      }
    } catch {
      return false;
    }
    logBrowserOpen(this.telemetryService, "localhostLinkOpener");
    const isDefaultLinkOpen = !isConfigured(this.configurationService.inspect("workbench.browser.openLocalhostLinks"));
    const browserUri = BrowserViewUri.forId(generateUuid());
    await this.editorService.openEditor({ resource: browserUri, options: { pinned: true, viewState: { url: href, isDefaultLinkOpen } } }, await this.browserViewWorkbenchService.getPreferredGroup());
    return true;
  }
};
LocalhostLinkOpenerContribution.ID = "workbench.contrib.localhostLinkOpener";
LocalhostLinkOpenerContribution = __decorateClass([
  __decorateParam(0, IOpenerService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IBrowserViewWorkbenchService)
], LocalhostLinkOpenerContribution);
registerWorkbenchContribution2(LocalhostLinkOpenerContribution.ID, LocalhostLinkOpenerContribution, WorkbenchPhase.BlockStartup);
const LOCALHOST_HINT_DISMISSED_KEY = "workbench.browser.linkOpenedHintDismissed";
let LinkOpenedHintPill = class extends BrowserEditorContribution {
  constructor(editor, hoverService, storageService, preferencesService, contextKeyService) {
    super(editor);
    this.hoverService = hoverService;
    this.storageService = storageService;
    this.preferencesService = preferencesService;
    this.contextKeyService = contextKeyService;
    this._attentionTimeout = this._register(new MutableDisposable());
    this._pill = $(".browser-link-opened-hint-pill");
    this._pill.tabIndex = 0;
    this._pill.role = "button";
    this._pill.ariaLabel = localize("browser.linkOpenedHint.ariaLabel", "This link opened in the integrated browser");
    this._pill.ariaHidden = "true";
    const icon = $("span");
    icon.className = ThemeIcon.asClassName(Codicon.info);
    const label = $("span");
    label.textContent = localize("browser.linkOpenedHint.label", "Link opened here");
    this._pill.appendChild(icon);
    this._pill.appendChild(label);
    const hoverOptions = () => ({
      content: new MarkdownString(localize("browser.linkOpenedHint.detail", "**Integrated Browser**\n\nLocalhost links automatically open in the integrated browser.")),
      actions: [
        {
          label: localize("browser.linkOpenedHint.openSettings", "Open Settings"),
          commandId: "workbench.action.openSettings",
          iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
          run: () => {
            this.preferencesService.openUserSettings({ query: "workbench.browser.openLocalhostLinks" });
          }
        },
        {
          label: localize("browser.linkOpenedHint.dismiss", "Don't Show Again"),
          commandId: "",
          run: () => {
            this._dismiss();
          }
        }
      ],
      position: { hoverPosition: HoverPosition.BELOW }
    });
    this._register(this.hoverService.setupDelayedHover(this._pill, hoverOptions, { setupKeyboardEvents: true }));
    this._register(addDisposableListener(this._pill, EventType.CLICK, () => {
      this.hoverService.showInstantHover({ ...hoverOptions(), target: this._pill, persistence: { sticky: true } }, true);
    }));
  }
  get widgets() {
    return [{ location: BrowserWidgetLocation.PostUrl, element: this._pill, order: 100 }];
  }
  onModelAttached(_model, _store, isNew) {
    if (IsSessionsWindowContext.getValue(this.contextKeyService)) {
      this._setVisible(false);
      return;
    }
    const input = this.editor.input;
    if (input instanceof BrowserEditorInput && input.isDefaultLinkOpen) {
      const dismissed = this.storageService.getBoolean(LOCALHOST_HINT_DISMISSED_KEY, StorageScope.APPLICATION, false);
      this._setVisible(!dismissed);
      if (!dismissed && isNew) {
        this._callAttention();
      }
    } else {
      this._setVisible(false);
    }
  }
  onModelDetached() {
    this._attentionTimeout.clear();
    this._setVisible(false);
  }
  _setVisible(visible) {
    if (!visible) {
      this._attentionTimeout.clear();
      this._pill.classList.remove("attention");
    }
    this._pill.classList.toggle("visible", visible);
    this._pill.ariaHidden = visible ? "false" : "true";
  }
  _callAttention() {
    this._attentionTimeout.clear();
    this._pill.classList.remove("attention");
    this._attentionTimeout.value = disposableTimeout(() => {
      this._pill.classList.add("attention");
      this._attentionTimeout.value = disposableTimeout(() => {
        this._pill.classList.remove("attention");
      }, 2e3);
    }, 300);
  }
  _dismiss() {
    this.storageService.store(LOCALHOST_HINT_DISMISSED_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
    this._setVisible(false);
  }
};
LinkOpenedHintPill = __decorateClass([
  __decorateParam(1, IHoverService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IPreferencesService),
  __decorateParam(4, IContextKeyService)
], LinkOpenedHintPill);
BrowserEditor.registerContribution(LinkOpenedHintPill);
let BrowserTabUrlSuggestions = class extends BrowserEditorContribution {
  constructor(editor, _browserViewService, _editorService, _editorGroupsService) {
    super(editor);
    this._browserViewService = _browserViewService;
    this._editorService = _editorService;
    this._editorGroupsService = _editorGroupsService;
    this._onDidChange = this._register(new Emitter());
    this._groupListeners = this._register(new DisposableMap());
    this._editorLabelListeners = this._register(new DisposableMap());
    for (const group of this._editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE)) {
      this._trackGroup(group);
    }
    this._register(this._editorGroupsService.onDidAddGroup((group) => {
      this._trackGroup(group);
      this._onDidChange.fire();
    }));
    this._register(this._editorGroupsService.onDidRemoveGroup((group) => {
      this._groupListeners.deleteAndDispose(group.id);
      this._onDidChange.fire();
    }));
    this._register(this._editorGroupsService.onDidMoveGroup(() => this._onDidChange.fire()));
    this._register(this._editorGroupsService.onDidChangeGroupIndex(() => this._onDidChange.fire()));
    this._refreshEditorLabelListeners();
    this._register(this._browserViewService.onDidChangeBrowserViews(() => {
      this._refreshEditorLabelListeners();
      this._onDidChange.fire();
    }));
    this._provider = {
      label: localize("browser.openTabs", "Open Tabs"),
      description: localize("browser.openTabsDescription", "Select a tab to switch"),
      order: 100,
      actions: [],
      onDidChange: this._onDidChange.event,
      getSuggestions: async ({ input }) => {
        if (input.url) {
          return [];
        }
        return this._collectSuggestions(input);
      }
    };
  }
  get urlSuggestionProviders() {
    return [this._provider];
  }
  _trackGroup(group) {
    this._groupListeners.set(group.id, group.onDidModelChange(() => this._onDidChange.fire()));
  }
  _refreshEditorLabelListeners() {
    const known = this._browserViewService.getContextualBrowserViews();
    for (const id of [...this._editorLabelListeners.keys()]) {
      if (!known.has(id)) {
        this._editorLabelListeners.deleteAndDispose(id);
      }
    }
    for (const [id, editor] of known) {
      if (!this._editorLabelListeners.has(id)) {
        this._editorLabelListeners.set(id, editor.onDidChangeLabel(() => this._onDidChange.fire()));
      }
    }
  }
  /**
   * Return tabs in editor-group visibility order (grid appearance, then
   * within-group editor order), with background tabs (known but not open
   * in any group) appended at the end. Excludes the editor's own input.
   */
  _collectSuggestions(input) {
    const ordered = [];
    const seen = /* @__PURE__ */ new Set();
    for (const group of this._editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE)) {
      for (const editor of group.editors) {
        if (editor instanceof BrowserEditorInput && !seen.has(editor.id)) {
          seen.add(editor.id);
          ordered.push(editor);
        }
      }
    }
    for (const tab of this._browserViewService.getContextualBrowserViews().values()) {
      if (!seen.has(tab.id)) {
        seen.add(tab.id);
        ordered.push(tab);
      }
    }
    const suggestions = [];
    for (const tab of ordered) {
      if (tab === input) {
        continue;
      }
      const rawIcon = tab.getIcon();
      suggestions.push({
        id: tab.id,
        label: tab.getName(),
        description: tab.getDescription(),
        icon: rawIcon instanceof URI ? void 0 : rawIcon,
        iconPath: rawIcon instanceof URI ? { dark: rawIcon } : void 0,
        apply: (source) => this._switchToTab(source, tab)
      });
    }
    return suggestions;
  }
  /**
   * Close {@link source} and focus {@link target} where it already lives.
   *
   * The navbar's picker-hide handler synchronously calls
   * `ensureBrowserFocus()` on the source editor before any of our awaits
   * resolve, so we have to explicitly refocus the target group after the
   * editor service operations complete — otherwise focus snaps back to
   * the (about-to-close) source's window.
   */
  async _switchToTab(source, target) {
    if (source === target) {
      await this._editorService.openEditor(target);
      return;
    }
    const sourceGroup = this._editorGroupsService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).find((g) => g.contains(source));
    if (sourceGroup) {
      await sourceGroup.closeEditor(source, { preserveFocus: true });
    }
    await this._editorService.openEditor(target);
  }
};
BrowserTabUrlSuggestions = __decorateClass([
  __decorateParam(1, IBrowserViewWorkbenchService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IEditorGroupsService)
], BrowserTabUrlSuggestions);
BrowserEditor.registerContribution(BrowserTabUrlSuggestions);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  ...workbenchConfigurationNodeBase,
  properties: {
    "workbench.browser.showInTitleBar": {
      type: ["boolean", "string"],
      enum: [true, false, "whenOpen"],
      enumDescriptions: [
        localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "browser.showInTitleBar.true" }, "The button is always shown in the title bar."),
        localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "browser.showInTitleBar.false" }, "The button is never shown in the title bar."),
        localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "browser.showInTitleBar.whenOpen" }, "The button is shown in the title bar when a browser editor is open.")
      ],
      default: "whenOpen",
      experiment: { mode: "startup" },
      description: localize(
        { comment: ["This is the description for a setting."], key: "browser.showInTitleBar" },
        "Controls whether the Integrated Browser button is shown in the title bar."
      )
    },
    "workbench.browser.openLocalhostLinks": {
      type: "boolean",
      default: false,
      experiment: { mode: "startup" },
      markdownDescription: localize(
        { comment: ["This is the description for a setting."], key: "browser.openLocalhostLinks" },
        "When enabled, localhost links (`localhost`, `127.0.0.1`, `[::1]`) and all-interfaces links (`0.0.0.0`, `[0:0:0:0:0:0:0:0]`, `[::]`) from the terminal, chat, and other sources will open in the Integrated Browser instead of the system browser."
      ),
      agentsWindow: { default: true }
    },
    [BrowserNewTabPlacementSettingId]: {
      type: "string",
      enum: ["activeGroup", "sideGroup", "window"],
      enumDescriptions: [
        localize({ comment: ["This is the description for a setting."], key: "browser.newTabPlacement.activeGroup" }, "New browser tabs open in the currently active editor group."),
        localize({ comment: ["This is the description for a setting."], key: "browser.newTabPlacement.sideGroup" }, "New browser tabs open in a dedicated editor group to the side that is reused for subsequent tabs. The group is locked so other editors are not opened into it."),
        localize({ comment: ["This is the description for a setting."], key: "browser.newTabPlacement.window" }, "New browser tabs open in a dedicated window that is reused for subsequent tabs. The window is locked so other editors are not opened into it.")
      ],
      default: "activeGroup",
      markdownDescription: localize(
        { comment: ["This is the description for a setting."], key: "browser.newTabPlacement" },
        "Controls where new Integrated Browser tabs are opened."
      ),
      scope: ConfigurationScope.WINDOW
    }
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFxmZWF0dXJlc1xcYnJvd3NlclRhYk1hbmFnZW1lbnRGZWF0dXJlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBLZXlNb2QsIEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBBQ1RJVkVfR1JPVVAsIElFZGl0b3JTZXJ2aWNlLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UsIEdyb3Vwc09yZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvcnNPcmRlciwgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgR3JvdXBJZGVudGlmaWVyLCBTaWRlQnlTaWRlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja0lucHV0QnV0dG9uLCBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrUGlja1NlcGFyYXRvciwgUXVpY2tJbnB1dEJ1dHRvbkxvY2F0aW9uLCBJUXVpY2tQaWNrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBCcm93c2VyVmlld1VyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyVmlld1VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IEJyb3dzZXJFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9icm93c2VyRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgbG9nQnJvd3Nlck9wZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXdUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQnJvd3NlclZpZXdDb21tYW5kSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElCcm93c2VyVmlld01vZGVsLCBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IEJyb3dzZXJOZXdUYWJQbGFjZW1lbnRTZXR0aW5nSWQgfSBmcm9tICcuLi9icm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgQ29uZmlndXJhdGlvblNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaENvbmZpZ3VyYXRpb25Ob2RlQmFzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRlcm5hbE9wZW5lciwgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBpc0xvY2FsaG9zdEF1dGhvcml0eSwgaXNBbGxJbnRlcmZhY2VzQXV0aG9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJsL2NvbW1vbi90cnVzdGVkRG9tYWlucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UsIGlzQ29uZmlndXJlZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IFRvZ2dsZVRpdGxlQmFyQ29uZmlnQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy90aXRsZWJhci90aXRsZWJhckFjdGlvbnMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgbWF0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBCcm93c2VyRWRpdG9yLCBCcm93c2VyRWRpdG9yQ29udHJpYnV0aW9uLCBCcm93c2VyV2lkZ2V0TG9jYXRpb24sIEJST1dTRVJfRURJVE9SX0FDVElWRSwgQnJvd3NlckFjdGlvbkNhdGVnb3J5LCBCcm93c2VyQWN0aW9uR3JvdXAsIElCcm93c2VyRWRpdG9yV2lkZ2V0LCBJQnJvd3NlclVybFN1Z2dlc3Rpb24sIElCcm93c2VyVXJsU3VnZ2VzdGlvblByb3ZpZGVyIH0gZnJvbSAnLi4vYnJvd3NlckVkaXRvci5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LCBSZXNvdXJjZUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuXG5jb25zdCBDT05URVhUX0JST1dTRVJfRURJVE9SX09QRU4gPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYnJvd3NlckVkaXRvck9wZW4nLCBmYWxzZSwgbG9jYWxpemUoJ2Jyb3dzZXIuZWRpdG9yT3BlbicsIFwiV2hldGhlciBhbnkgYnJvd3NlciBlZGl0b3IgaXMgY3VycmVudGx5IG9wZW5cIikpO1xuXG5pbnRlcmZhY2UgSUJyb3dzZXJRdWlja1BpY2tJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRncm91cElkOiBHcm91cElkZW50aWZpZXI7XG5cdGVkaXRvcjogQnJvd3NlckVkaXRvcklucHV0O1xufVxuXG5jb25zdCBjbG9zZUJ1dHRvbkl0ZW06IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNsb3NlKSxcblx0dG9vbHRpcDogbG9jYWxpemUoJ2Jyb3dzZXIuY2xvc2VUYWInLCBcIkNsb3NlXCIpXG59O1xuXG5jb25zdCBjbG9zZUFsbEJ1dHRvbkl0ZW06IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNsb3NlQWxsKSxcblx0dG9vbHRpcDogbG9jYWxpemUoJ2Jyb3dzZXIuY2xvc2VBbGxUYWJzJywgXCJDbG9zZSBBbGxcIiksXG5cdGxvY2F0aW9uOiBRdWlja0lucHV0QnV0dG9uTG9jYXRpb24uSW5saW5lXG59O1xuXG5cbi8qKlxuICogTWFuYWdlcyBhIHF1aWNrIHBpY2sgdGhhdCBsaXN0cyBhbGwgb3BlbiBicm93c2VyIHRhYnMgZ3JvdXBlZCBieSBlZGl0b3IgZ3JvdXAsXG4gKiB3aXRoIGNsb3NlIGJ1dHRvbnMsIGxpdmUgdXBkYXRlcywgYW5kIGFuIGFsd2F5cy12aXNpYmxlIFwiTmV3IEludGVncmF0ZWQgQnJvd3NlciBUYWJcIiBlbnRyeS5cbiAqL1xuY2xhc3MgQnJvd3NlclRhYlF1aWNrUGljayBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrUGljazogSVF1aWNrUGljazxJQnJvd3NlclF1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9Pjtcblx0cHJpdmF0ZSByZWFkb25seSBfaXRlbUxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3Blbk5ld1RhYlBpY2s6IElCcm93c2VyUXVpY2tQaWNrSXRlbSA9IHtcblx0XHRncm91cElkOiAtMSxcblx0XHRlZGl0b3I6IHVuZGVmaW5lZCEsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VyLm9wZW5OZXdUYWInLCBcIk5ldyBJbnRlZ3JhdGVkIEJyb3dzZXIgVGFiXCIpLFxuXHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uYWRkKSxcblx0XHRhbHdheXNTaG93OiB0cnVlLFxuXHR9O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yR3JvdXBzU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9icm93c2VyVmlld1NlcnZpY2U6IElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9xdWlja1BpY2sgPSB0aGlzLl9yZWdpc3RlcihxdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SUJyb3dzZXJRdWlja1BpY2tJdGVtPih7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSkpO1xuXHRcdHRoaXMuX3F1aWNrUGljay5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdicm93c2VyLnF1aWNrT3BlblBsYWNlaG9sZGVyJywgXCJTZWxlY3QgYSBicm93c2VyIHRhYlwiKTtcblx0XHR0aGlzLl9xdWlja1BpY2subWF0Y2hPbkRlc2NyaXB0aW9uID0gdHJ1ZTtcblx0XHR0aGlzLl9xdWlja1BpY2suc29ydEJ5TGFiZWwgPSBmYWxzZTtcblx0XHR0aGlzLl9xdWlja1BpY2suYnV0dG9ucyA9IFtjbG9zZUFsbEJ1dHRvbkl0ZW1dO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcXVpY2tQaWNrLm9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oYXN5bmMgKHsgaXRlbSB9KSA9PiB7XG5cdFx0XHRpdGVtLmVkaXRvcj8uZGlzcG9zZSh0cnVlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9xdWlja1BpY2sub25EaWRUcmlnZ2VyQnV0dG9uKGFzeW5jICgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIHRoaXMuX2Jyb3dzZXJWaWV3U2VydmljZS5nZXRDb250ZXh0dWFsQnJvd3NlclZpZXdzKCkudmFsdWVzKCkpIHtcblx0XHRcdFx0ZWRpdG9yLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcXVpY2tQaWNrLm9uRGlkQWNjZXB0KGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IFtzZWxlY3RlZF0gPSB0aGlzLl9xdWlja1BpY2suc2VsZWN0ZWRJdGVtcztcblx0XHRcdGlmICghc2VsZWN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNlbGVjdGVkID09PSB0aGlzLl9vcGVuTmV3VGFiUGljaykge1xuXHRcdFx0XHRsb2dCcm93c2VyT3Blbih0ZWxlbWV0cnlTZXJ2aWNlLCAncXVpY2tPcGVuV2l0aG91dFVybCcpO1xuXHRcdFx0XHR0aGlzLl9xdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdHJlc291cmNlOiBCcm93c2VyVmlld1VyaS5mb3JJZChnZW5lcmF0ZVV1aWQoKSksXG5cdFx0XHRcdH0sIGF3YWl0IHRoaXMuX2Jyb3dzZXJWaWV3U2VydmljZS5nZXRQcmVmZXJyZWRHcm91cCgpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihzZWxlY3RlZC5lZGl0b3IsIGF3YWl0IHRoaXMuX2Jyb3dzZXJWaWV3U2VydmljZS5nZXRQcmVmZXJyZWRHcm91cChzZWxlY3RlZC5ncm91cElkKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiB0aGlzLmRpc3Bvc2UoKSkpO1xuXHR9XG5cblx0c2hvdygpOiB2b2lkIHtcblx0XHR0aGlzLl9idWlsZEl0ZW1zKCk7XG5cblx0XHQvLyBQcmUtc2VsZWN0IHRoZSBjdXJyZW50bHkgYWN0aXZlIGJyb3dzZXIgZWRpdG9yXG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gdGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvciBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3JJbnB1dCkge1xuXHRcdFx0Y29uc3QgYWN0aXZlUGljayA9ICh0aGlzLl9xdWlja1BpY2suaXRlbXMgYXMgcmVhZG9ubHkgKElCcm93c2VyUXVpY2tQaWNrSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10pXG5cdFx0XHRcdC5maW5kKChpdGVtKTogaXRlbSBpcyBJQnJvd3NlclF1aWNrUGlja0l0ZW0gPT4gaXRlbS50eXBlICE9PSAnc2VwYXJhdG9yJyAmJiBpdGVtLmVkaXRvciA9PT0gYWN0aXZlRWRpdG9yKTtcblx0XHRcdGlmIChhY3RpdmVQaWNrKSB7XG5cdFx0XHRcdHRoaXMuX3F1aWNrUGljay5hY3RpdmVJdGVtcyA9IFthY3RpdmVQaWNrXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9xdWlja1BpY2suc2hvdygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRJdGVtcygpOiB2b2lkIHtcblx0XHR0aGlzLl9pdGVtTGlzdGVuZXJzLmNsZWFyKCk7XG5cblx0XHQvLyBSZW1lbWJlciB3aGljaCBlZGl0b3Igd2FzIGFjdGl2ZSBzbyB3ZSBjYW4gcmVzdG9yZSBzZWxlY3Rpb25cblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSB0aGlzLl9xdWlja1BpY2suYWN0aXZlSXRlbXNbMF0/LmVkaXRvcjtcblxuXHRcdGNvbnN0IHBpY2tzOiAoSUJyb3dzZXJRdWlja1BpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFtdO1xuXHRcdGNvbnN0IGdyb3VwcyA9IHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLkdSSURfQVBQRUFSQU5DRSk7XG5cblx0XHRjb25zdCBncm91cHNXaXRoQnJvd3NlckVkaXRvcnMgPSBncm91cHNcblx0XHRcdC5tYXAoZ3JvdXAgPT4gKHsgZ3JvdXAsIGJyb3dzZXJFZGl0b3JzOiBncm91cC5lZGl0b3JzLmZpbHRlcigoZSk6IGUgaXMgQnJvd3NlckVkaXRvcklucHV0ID0+IGUgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9ySW5wdXQpIH0pKVxuXHRcdFx0LmZpbHRlcigoeyBicm93c2VyRWRpdG9ycyB9KSA9PiBicm93c2VyRWRpdG9ycy5sZW5ndGggPiAwKTtcblxuXHRcdC8vIFRyYWNrIHdoaWNoIHZpZXcgSURzIGFwcGVhciBpbiBhdCBsZWFzdCBvbmUgZWRpdG9yIGdyb3VwXG5cdFx0Y29uc3Qgdmlld3NJbkdyb3VwcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgeyBicm93c2VyRWRpdG9ycyB9IG9mIGdyb3Vwc1dpdGhCcm93c2VyRWRpdG9ycykge1xuXHRcdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgYnJvd3NlckVkaXRvcnMpIHtcblx0XHRcdFx0dmlld3NJbkdyb3Vwcy5hZGQoZWRpdG9yLmlkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBCYWNrZ3JvdW5kIHZpZXdzOiBrbm93biBidXQgbm90IG9wZW4gaW4gYW55IGVkaXRvciBncm91cFxuXHRcdGNvbnN0IGJhY2tncm91bmRFZGl0b3JzID0gWy4uLnRoaXMuX2Jyb3dzZXJWaWV3U2VydmljZS5nZXRDb250ZXh0dWFsQnJvd3NlclZpZXdzKCkudmFsdWVzKCldLmZpbHRlcihlID0+ICF2aWV3c0luR3JvdXBzLmhhcyhlLmlkKSk7XG5cdFx0Y29uc3QgYmFja2dyb3VuZExhYmVsID0gbG9jYWxpemUoJ2Jyb3dzZXIuYmFja2dyb3VuZEdyb3VwJywgXCJCYWNrZ3JvdW5kXCIpO1xuXG5cdFx0Ly8gQnVpbGQgc2VjdGlvbnM6IGVhY2ggZWRpdG9yIGdyb3VwICsgb3B0aW9uYWwgYmFja2dyb3VuZFxuXHRcdHR5cGUgU2VjdGlvbiA9IHsgbGFiZWw6IHN0cmluZzsgYXJpYUxhYmVsOiBzdHJpbmc7IGdyb3VwSWQ6IG51bWJlcjsgZWRpdG9yczogQnJvd3NlckVkaXRvcklucHV0W107IGlzUGlubmVkPzogKGU6IEJyb3dzZXJFZGl0b3JJbnB1dCkgPT4gYm9vbGVhbiB9O1xuXHRcdGNvbnN0IHNlY3Rpb25zOiBTZWN0aW9uW10gPSBncm91cHNXaXRoQnJvd3NlckVkaXRvcnMubWFwKCh7IGdyb3VwLCBicm93c2VyRWRpdG9ycyB9KSA9PiAoe1xuXHRcdFx0bGFiZWw6IGdyb3VwLmxhYmVsLFxuXHRcdFx0YXJpYUxhYmVsOiBncm91cC5hcmlhTGFiZWwsXG5cdFx0XHRncm91cElkOiBncm91cC5pZCxcblx0XHRcdGVkaXRvcnM6IGJyb3dzZXJFZGl0b3JzLFxuXHRcdFx0aXNQaW5uZWQ6IGUgPT4gZ3JvdXAuaXNQaW5uZWQoZSksXG5cdFx0fSkpO1xuXHRcdGlmIChiYWNrZ3JvdW5kRWRpdG9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRzZWN0aW9ucy5wdXNoKHsgbGFiZWw6IGJhY2tncm91bmRMYWJlbCwgYXJpYUxhYmVsOiBiYWNrZ3JvdW5kTGFiZWwsIGdyb3VwSWQ6IEFDVElWRV9HUk9VUCwgZWRpdG9yczogYmFja2dyb3VuZEVkaXRvcnMgfSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgeyBncm91cCB9IG9mIGdyb3Vwc1dpdGhCcm93c2VyRWRpdG9ycykge1xuXHRcdFx0dGhpcy5faXRlbUxpc3RlbmVycy5hZGQoZ3JvdXAub25EaWRNb2RlbENoYW5nZSgoKSA9PiB0aGlzLl9idWlsZEl0ZW1zKCkpKTtcblx0XHR9XG5cdFx0dGhpcy5faXRlbUxpc3RlbmVycy5hZGQodGhpcy5fYnJvd3NlclZpZXdTZXJ2aWNlLm9uRGlkQ2hhbmdlQnJvd3NlclZpZXdzKCgpID0+IHRoaXMuX2J1aWxkSXRlbXMoKSkpO1xuXG5cdFx0Y29uc3QgaGFzTXVsdGlwbGVTZWN0aW9ucyA9IHNlY3Rpb25zLmxlbmd0aCA+IDE7XG5cdFx0bGV0IG5ld0FjdGl2ZVBpY2s6IElCcm93c2VyUXVpY2tQaWNrSXRlbSB8IHVuZGVmaW5lZDtcblxuXHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiBzZWN0aW9ucykge1xuXHRcdFx0aWYgKGhhc011bHRpcGxlU2VjdGlvbnMpIHtcblx0XHRcdFx0cGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogc2VjdGlvbi5sYWJlbCB9KTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIHNlY3Rpb24uZWRpdG9ycykge1xuXHRcdFx0XHRjb25zdCBpY29uID0gZWRpdG9yLmdldEljb24oKTtcblx0XHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBlZGl0b3IuZ2V0RGVzY3JpcHRpb24oKTtcblx0XHRcdFx0Y29uc3QgbmFtZUFuZERlc2NyaXB0aW9uID0gZGVzY3JpcHRpb24gPyBgJHtlZGl0b3IuZ2V0TmFtZSgpfSAke2Rlc2NyaXB0aW9ufWAgOiBlZGl0b3IuZ2V0TmFtZSgpO1xuXHRcdFx0XHRjb25zdCBwaWNrOiBJQnJvd3NlclF1aWNrUGlja0l0ZW0gPSB7XG5cdFx0XHRcdFx0Z3JvdXBJZDogc2VjdGlvbi5ncm91cElkLFxuXHRcdFx0XHRcdGVkaXRvcixcblx0XHRcdFx0XHRsYWJlbDogZWRpdG9yLmdldE5hbWUoKSxcblx0XHRcdFx0XHRhcmlhTGFiZWw6IGhhc011bHRpcGxlU2VjdGlvbnNcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2Jyb3dzZXJFbnRyeUFyaWFMYWJlbFdpdGhHcm91cCcsIFwiezB9LCB7MX1cIiwgbmFtZUFuZERlc2NyaXB0aW9uLCBzZWN0aW9uLmFyaWFMYWJlbClcblx0XHRcdFx0XHRcdDogbmFtZUFuZERlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdGJ1dHRvbnM6IFtjbG9zZUJ1dHRvbkl0ZW1dLFxuXHRcdFx0XHRcdGl0YWxpYzogc2VjdGlvbi5pc1Bpbm5lZCA/ICFzZWN0aW9uLmlzUGlubmVkKGVkaXRvcikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdH07XG5cdFx0XHRcdGlmIChpY29uIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHRcdFx0cGljay5pY29uUGF0aCA9IHsgZGFyazogaWNvbiB9O1xuXHRcdFx0XHR9IGVsc2UgaWYgKGljb24pIHtcblx0XHRcdFx0XHRwaWNrLmljb25DbGFzcyA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwaWNrcy5wdXNoKHBpY2spO1xuXG5cdFx0XHRcdGlmIChlZGl0b3IgPT09IGFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRcdG5ld0FjdGl2ZVBpY2sgPSBwaWNrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5faXRlbUxpc3RlbmVycy5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTGFiZWwoKCkgPT4gdGhpcy5fYnVpbGRJdGVtcygpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InIH0pO1xuXHRcdHBpY2tzLnB1c2godGhpcy5fb3Blbk5ld1RhYlBpY2spO1xuXG5cdFx0dGhpcy5fcXVpY2tQaWNrLmtlZXBTY3JvbGxQb3NpdGlvbiA9IHRydWU7XG5cdFx0dGhpcy5fcXVpY2tQaWNrLml0ZW1zID0gcGlja3M7XG5cdFx0aWYgKG5ld0FjdGl2ZVBpY2spIHtcblx0XHRcdHRoaXMuX3F1aWNrUGljay5hY3RpdmVJdGVtcyA9IFtuZXdBY3RpdmVQaWNrXTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgUXVpY2tPcGVuQnJvd3NlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQnJvd3NlclZpZXdDb21tYW5kSWQuUXVpY2tPcGVuLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci5xdWlja09wZW5BY3Rpb24nLCBcIlF1aWNrIE9wZW4gQnJvd3NlciBUYWIuLi5cIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmdsb2JlLFxuXHRcdFx0Y2F0ZWdvcnk6IEJyb3dzZXJBY3Rpb25DYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0Ly8gTm90ZTogb24gTGludXggdGhpcyBjb25mbGljdHMgd2l0aCB0aGUgXCJ0b2dnbGUgYmxvY2sgY29tbWVudFwiIGtleWJpbmRpbmcuXG5cdFx0XHRcdC8vICAgICAgIGl0J3Mgbm90IGFzIHByb2JsZW0gYXQgdGhlIG1vbWVudCBiZWNhc2Ugb2ggdGhlIGB3aGVuYCwgYnV0IHdvcnRoIG5vdGluZyBmb3IgdGhlIGZ1dHVyZS5cblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUEsXG5cdFx0XHRcdHdoZW46IEJST1dTRVJfRURJVE9SX0FDVElWRVxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IHBpY2tlciA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpLmNyZWF0ZUluc3RhbmNlKEJyb3dzZXJUYWJRdWlja1BpY2spO1xuXHRcdHBpY2tlci5zaG93KCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElPcGVuQnJvd3Nlck9wdGlvbnMge1xuXHR1cmw/OiBzdHJpbmc7XG5cdG9wZW5Ub1NpZGU/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBJZiBzZXQsIHRoZSBmaXJzdCBleGlzdGluZyB0YWIgd2l0aCBhIFVSTCBtYXRjaGluZyB0aGlzIGdsb2IgcGF0dGVybiB3aWxsIGJlIHJldXNlZCAvIGZvY3VzZWQgaW5zdGVhZCBvZiBvcGVuaW5nIGEgbmV3IHRhYi5cblx0ICpcblx0ICogVGhpcyBpcyB1c2VkIGJ5IExpdmUgUHJldmlldyBleHRlbnNpb24gdG8gcmV1c2UgdGFicywgZXNwZWNpYWxseSBhZnRlciByZWxvYWQgLyByZXN0YXJ0LlxuXHQgKi9cblx0cmV1c2VVcmxGaWx0ZXI/OiBzdHJpbmc7XG59XG5cbmNsYXNzIE9wZW5JbnRlZ3JhdGVkQnJvd3NlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQnJvd3NlclZpZXdDb21tYW5kSWQuT3Blbixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIub3BlbkFjdGlvbicsIFwiT3BlbiBJbnRlZ3JhdGVkIEJyb3dzZXJcIiksXG5cdFx0XHRjYXRlZ29yeTogQnJvd3NlckFjdGlvbkNhdGVnb3J5LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5nbG9iZSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB1cmxPck9wdGlvbnM/OiBzdHJpbmcgfCBJT3BlbkJyb3dzZXJPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0Y29uc3QgYnJvd3NlclZpZXdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UpO1xuXG5cdFx0Ly8gUGFyc2UgYXJndW1lbnRzXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHR5cGVvZiB1cmxPck9wdGlvbnMgPT09ICdzdHJpbmcnID8geyB1cmw6IHVybE9yT3B0aW9ucyB9IDogKHVybE9yT3B0aW9ucyA/PyB7fSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBCcm93c2VyVmlld1VyaS5mb3JJZChnZW5lcmF0ZVV1aWQoKSk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBhd2FpdCBicm93c2VyVmlld1NlcnZpY2UuZ2V0UHJlZmVycmVkR3JvdXAob3B0aW9ucy5vcGVuVG9TaWRlID8gU0lERV9HUk9VUCA6IHVuZGVmaW5lZCk7XG5cblx0XHRpZiAob3B0aW9ucy5yZXVzZVVybEZpbHRlcikge1xuXHRcdFx0Y29uc3QgZmlsdGVyVXJpID0gVVJJLnBhcnNlKG9wdGlvbnMucmV1c2VVcmxGaWx0ZXIpO1xuXHRcdFx0Y29uc3QgbWF0Y2hpbmdFZGl0b3IgPSBbLi4uYnJvd3NlclZpZXdTZXJ2aWNlLmdldENvbnRleHR1YWxCcm93c2VyVmlld3MoKS52YWx1ZXMoKV0uZmluZCgoZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JVcmkgPSBVUkkucGFyc2UoZS51cmwgfHwgJycpO1xuXHRcdFx0XHQvLyBVUklzIGRlZmF1bHQgdG8gcHV0dGluZyBcImZpbGVcIiBzY2hlbWUuIENoZWNrIHRoYXQgdGhlIHNjaGVtZSBpcyByZWFsbHkgaW4gdGhlIGZpbHRlci5cblx0XHRcdFx0aWYgKGZpbHRlclVyaS5zY2hlbWUgJiYgb3B0aW9ucy5yZXVzZVVybEZpbHRlciEuc3RhcnRzV2l0aChgJHtmaWx0ZXJVcmkuc2NoZW1lfTpgKSAmJiBmaWx0ZXJVcmkuc2NoZW1lICE9PSBlZGl0b3JVcmkuc2NoZW1lKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChmaWx0ZXJVcmkuYXV0aG9yaXR5ICYmICFtYXRjaChmaWx0ZXJVcmkuYXV0aG9yaXR5LCBlZGl0b3JVcmkuYXV0aG9yaXR5KSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZmlsdGVyVXJpLnBhdGggJiYgIW1hdGNoKGZpbHRlclVyaS5wYXRoLCBlZGl0b3JVcmkucGF0aCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGZpbHRlclVyaS5xdWVyeSkge1xuXHRcdFx0XHRcdGNvbnN0IGZpbHRlclBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMoZmlsdGVyVXJpLnF1ZXJ5KTtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3JQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKGVkaXRvclVyaS5xdWVyeSk7XG5cdFx0XHRcdFx0aWYgKCFbLi4uZmlsdGVyUGFyYW1zXS5ldmVyeSgoW2tleSwgdmFsdWVdKSA9PiBtYXRjaCh2YWx1ZSwgZWRpdG9yUGFyYW1zLmdldChrZXkpID8/ICcnKSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0pO1xuXHRcdFx0aWYgKG1hdGNoaW5nRWRpdG9yKSB7XG5cdFx0XHRcdGlmIChvcHRpb25zLnVybCkge1xuXHRcdFx0XHRcdG1hdGNoaW5nRWRpdG9yLm5hdmlnYXRlKG9wdGlvbnMudXJsKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBSZXZlYWwgdGhlIGV4aXN0aW5nIGJyb3dzZXIgdGFiIHdoZXJlIGl0IGFscmVhZHkgbGl2ZXMgcmF0aGVyIHRoYW5cblx0XHRcdFx0Ly8gcmVsb2NhdGluZyBpdCBpbnRvIHRoZSBkb2NrZWQgZ3JvdXAgKHdoaWNoIHdvdWxkIG1vdmUgYSB0YWIgb3V0IG9mIGFcblx0XHRcdFx0Ly8gbW9kYWwgZ3JvdXAgd2hlbiBgd29ya2JlbmNoLmVkaXRvci51c2VNb2RhbDogJ2FsbCdgKS5cblx0XHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKG1hdGNoaW5nRWRpdG9yKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxvZ0Jyb3dzZXJPcGVuKHRlbGVtZXRyeVNlcnZpY2UsIG9wdGlvbnMudXJsID8gJ2NvbW1hbmRXaXRoVXJsJyA6ICdjb21tYW5kV2l0aG91dFVybCcpO1xuXG5cdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlLCBvcHRpb25zOiB7IHZpZXdTdGF0ZTogeyB1cmw6IG9wdGlvbnMudXJsIH0gfSB9LCBncm91cCk7XG5cblx0XHQvLyBMb2NrIHRoZSBncm91cCB3aGVuIG9wZW5pbmcgdG8gdGhlIHNpZGVcblx0XHRpZiAob3B0aW9ucy5vcGVuVG9TaWRlICYmIGVkaXRvclBhbmU/Lmdyb3VwKSB7XG5cdFx0XHRlZGl0b3JQYW5lLmdyb3VwLmxvY2sodHJ1ZSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIE9wZW5GaWxlSW5JbnRlZ3JhdGVkQnJvd3NlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBJU19MT0NBTF9IVE1MX0ZJTEUgPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLmZpbGUpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIucmVnZXgoUmVzb3VyY2VDb250ZXh0S2V5LkV4dGVuc2lvbi5rZXksIC9cXC5odG1sPyQvaSksXG5cdFx0KTtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQnJvd3NlclZpZXdDb21tYW5kSWQuT3BlbkZpbGUsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdicm93c2VyLm9wZW5GaWxlQWN0aW9uJywgXCJPcGVuIGluIEludGVncmF0ZWQgQnJvd3NlclwiKSxcblx0XHRcdGNhdGVnb3J5OiBCcm93c2VyQWN0aW9uQ2F0ZWdvcnksXG5cdFx0XHRpY29uOiBDb2RpY29uLmdsb2JlLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IElTX0xPQ0FMX0hUTUxfRklMRSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuRXhwbG9yZXJDb250ZXh0LFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDI5LFxuXHRcdFx0XHRcdHdoZW46IElTX0xPQ0FMX0hUTUxfRklMRSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LFxuXHRcdFx0XHRcdGdyb3VwOiAnMV9vcGVuJyxcblx0XHRcdFx0XHRvcmRlcjogNSxcblx0XHRcdFx0XHR3aGVuOiBJU19MT0NBTF9IVE1MX0ZJTEUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDk5LFxuXHRcdFx0XHRcdHdoZW46IElTX0xPQ0FMX0hUTUxfRklMRSxcblx0XHRcdFx0fSxcblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcmVzb3VyY2U/OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRjb25zdCBicm93c2VyVmlld1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSk7XG5cblx0XHQvLyBSZXNvbHZlIHRoZSBmaWxlIFVSSSBmcm9tIHRoZSBjb250ZXh0IG9yIHRoZSBhY3RpdmUgZWRpdG9yXG5cdFx0Y29uc3QgZmlsZVVyaSA9IHJlc291cmNlID8/IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IsIHsgZmlsdGVyQnlTY2hlbWU6IFtTY2hlbWFzLmZpbGVdLCBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXHRcdGlmICghZmlsZVVyaSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxvZ0Jyb3dzZXJPcGVuKHRlbGVtZXRyeVNlcnZpY2UsICdvcGVuRmlsZUNvbW1hbmQnKTtcblxuXHRcdGNvbnN0IGJyb3dzZXJVcmkgPSBCcm93c2VyVmlld1VyaS5mb3JJZChnZW5lcmF0ZVV1aWQoKSk7XG5cdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IGJyb3dzZXJVcmksIG9wdGlvbnM6IHsgdmlld1N0YXRlOiB7IHVybDogZmlsZVVyaS50b1N0cmluZygpIH0gfSB9LCBhd2FpdCBicm93c2VyVmlld1NlcnZpY2UuZ2V0UHJlZmVycmVkR3JvdXAoKSk7XG5cdH1cbn1cblxuY2xhc3MgTmV3VGFiQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBCcm93c2VyVmlld0NvbW1hbmRJZC5OZXdUYWIsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdicm93c2VyLm5ld1RhYkFjdGlvbicsIFwiTmV3IFRhYlwiKSxcblx0XHRcdGNhdGVnb3J5OiBCcm93c2VyQWN0aW9uQ2F0ZWdvcnksXG5cdFx0XHRpY29uOiBDb2RpY29uLmFkZCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBCUk9XU0VSX0VESVRPUl9BQ1RJVkUsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQnJvd3NlckFjdGlvbnNUb29sYmFyLFxuXHRcdFx0XHRncm91cDogQnJvd3NlckFjdGlvbkdyb3VwLlRhYnMsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHQvLyBXaGVuIGFscmVhZHkgaW4gYSBicm93c2VyLCBDdHJsL0NtZCArIFQgb3BlbnMgYSBuZXcgdGFiXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgNTAsIC8vIFByaW9yaXR5IG92ZXIgc2VhcmNoIGFjdGlvbnNcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVQsXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF9icm93c2VyRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0Y29uc3QgYnJvd3NlclZpZXdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gQnJvd3NlclZpZXdVcmkuZm9ySWQoZ2VuZXJhdGVVdWlkKCkpO1xuXG5cdFx0bG9nQnJvd3Nlck9wZW4odGVsZW1ldHJ5U2VydmljZSwgJ25ld1RhYkNvbW1hbmQnKTtcblxuXHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlIH0sIGF3YWl0IGJyb3dzZXJWaWV3U2VydmljZS5nZXRQcmVmZXJyZWRHcm91cCgpKTtcblx0fVxufVxuXG5jbGFzcyBDbG9zZUFsbEJyb3dzZXJUYWJzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBCcm93c2VyVmlld0NvbW1hbmRJZC5DbG9zZUFsbCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIuY2xvc2VBbGwnLCBcIkNsb3NlIEFsbCBCcm93c2VyIFRhYnNcIiksXG5cdFx0XHRjYXRlZ29yeTogQnJvd3NlckFjdGlvbkNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfQlJPV1NFUl9FRElUT1JfT1BFTixcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZWRpdG9yR3JvdXBzU2VydmljZS5nZXRHcm91cHMoR3JvdXBzT3JkZXIuR1JJRF9BUFBFQVJBTkNFKSkge1xuXHRcdFx0Y29uc3QgYnJvd3NlckVkaXRvcnMgPSBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKS5maWx0ZXIoKGUpOiBlIGlzIEJyb3dzZXJFZGl0b3JJbnB1dCA9PiBlIGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcklucHV0KTtcblx0XHRcdGlmIChicm93c2VyRWRpdG9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyhicm93c2VyRWRpdG9ycyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIENsb3NlQWxsQnJvd3NlclRhYnNJbkdyb3VwQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBCcm93c2VyVmlld0NvbW1hbmRJZC5DbG9zZUFsbEluR3JvdXAsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdicm93c2VyLmNsb3NlQWxsSW5Hcm91cCcsIFwiQ2xvc2UgQWxsIEJyb3dzZXIgVGFicyBpbiBHcm91cFwiKSxcblx0XHRcdGNhdGVnb3J5OiBCcm93c2VyQWN0aW9uQ2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQlJPV1NFUl9FRElUT1JfQUNUSVZFLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmdldEdyb3VwKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZT8uZ3JvdXA/LmlkID8/IGVkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZlR3JvdXAuaWQpO1xuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYnJvd3NlckVkaXRvcnMgPSBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKS5maWx0ZXIoKGUpOiBlIGlzIEJyb3dzZXJFZGl0b3JJbnB1dCA9PiBlIGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcklucHV0KTtcblx0XHRpZiAoYnJvd3NlckVkaXRvcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0YXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3JzKGJyb3dzZXJFZGl0b3JzKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgT3Blbk9yTGlzdEJyb3dzZXJzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBCcm93c2VyVmlld0NvbW1hbmRJZC5PcGVuT3JMaXN0LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci5vcGVuT3JMaXN0QWN0aW9uJywgXCJCcm93c2VyXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5nbG9iZSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuU2xhc2gsXG5cdFx0XHR9LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlRpdGxlQmFyLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMTAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guYnJvd3Nlci5zaG93SW5UaXRsZUJhcicsIGZhbHNlKS5uZWdhdGUoKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdENPTlRFWFRfQlJPV1NFUl9FRElUT1JfT1BFTixcblx0XHRcdFx0XHRcdC8vIFRoaXMgaXMgYSBoYWNrIHRvIHdvcmsgYXJvdW5kIGB0cnVlYCBqdXN0IHRlc3RpbmcgZm9yIHRydXRoaW5lc3Mgb2YgdGhlIGtleS4gSXQgd29ya3Mgc2luY2UgYDEgPT0gdHJ1ZWAgaW4gSlMuXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guYnJvd3Nlci5zaG93SW5UaXRsZUJhcicsIDEpXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYnJvd3NlclZpZXdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cblx0XHRjb25zdCBoYXNPcGVuQnJvd3NlckVkaXRvciA9IGJyb3dzZXJWaWV3U2VydmljZS5nZXRDb250ZXh0dWFsQnJvd3NlclZpZXdzKCkuc2l6ZSA+IDA7XG5cblx0XHRpZiAoaGFzT3BlbkJyb3dzZXJFZGl0b3IpIHtcblx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEJyb3dzZXJWaWV3Q29tbWFuZElkLlF1aWNrT3Blbik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQnJvd3NlclZpZXdDb21tYW5kSWQuT3Blbik7XG5cdH1cbn1cblxuLy8gUmVnaXN0ZXIgaW4gVmlldyBtZW51XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJWaWV3TWVudSwge1xuXHRncm91cDogJzRfYXV4YmFyJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBCcm93c2VyVmlld0NvbW1hbmRJZC5PcGVuT3JMaXN0LFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pT3BlbkJyb3dzZXInLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZCcm93c2VyXCIpXG5cdH0sXG5cdG9yZGVyOiAyXG59KTtcblxuLy8gUmVnaXN0ZXIgYXMgXCJDbG9zZSBBbGwgQnJvd3NlciBUYWJzXCIgYWN0aW9uIGluIGVkaXRvciB0aXRsZSBtZW51IHRvIGFsaWduIHdpdGggdGhlIHJlZ3VsYXIgXCJDbG9zZSBBbGxcIiBhY3Rpb25cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IEJyb3dzZXJWaWV3Q29tbWFuZElkLkNsb3NlQWxsSW5Hcm91cCwgdGl0bGU6IGxvY2FsaXplKCdicm93c2VyLmNsb3NlQWxsSW5Hcm91cFNob3J0JywgXCJDbG9zZSBBbGwgQnJvd3NlciBUYWJzXCIpIH0sIGdyb3VwOiAnMV9jbG9zZScsIG9yZGVyOiA1NSwgd2hlbjogQlJPV1NFUl9FRElUT1JfQUNUSVZFIH0pO1xuXG4vLyBBZ2VudHMgd2luZG93OiBzdXJmYWNlIE5ldyBUYWIgYXMgYSBwcmltYXJ5IGVkaXRvciB0aXRsZSB0b29sYmFyIGljb24gc28gdGhlXG4vLyBicm93c2VyIGVkaXRvciB0aXRsZSBiYXIgaXNuJ3QgbGVmdCBzaG93aW5nIG9ubHkgdGhlIG92ZXJmbG93ICguLi4pIG1lbnUuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRpdGxlLCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogQnJvd3NlclZpZXdDb21tYW5kSWQuTmV3VGFiLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIubmV3VGFiQWN0aW9uJywgXCJOZXcgVGFiXCIpLFxuXHRcdGljb246IENvZGljb24uYWRkXG5cdH0sXG5cdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdG9yZGVyOiAxLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQlJPV1NFUl9FRElUT1JfQUNUSVZFLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dClcbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoUXVpY2tPcGVuQnJvd3NlckFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoT3BlbkludGVncmF0ZWRCcm93c2VyQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihPcGVuRmlsZUluSW50ZWdyYXRlZEJyb3dzZXJBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE9wZW5Pckxpc3RCcm93c2Vyc0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTmV3VGFiQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihDbG9zZUFsbEJyb3dzZXJUYWJzQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihDbG9zZUFsbEJyb3dzZXJUYWJzSW5Hcm91cEFjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVCcm93c2VyVGl0bGVCYXJCdXR0b24gZXh0ZW5kcyBUb2dnbGVUaXRsZUJhckNvbmZpZ0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCd3b3JrYmVuY2guYnJvd3Nlci5zaG93SW5UaXRsZUJhcicsIGxvY2FsaXplKCd0b2dnbGUuYnJvd3NlcicsICdJbnRlZ3JhdGVkIEJyb3dzZXInKSwgbG9jYWxpemUoJ3RvZ2dsZS5icm93c2VyRGVzY3JpcHRpb24nLCBcIlRvZ2dsZSB2aXNpYmlsaXR5IG9mIHRoZSBJbnRlZ3JhdGVkIEJyb3dzZXIgYnV0dG9uIGluIHRpdGxlIGJhclwiKSwgOCk7XG5cdH1cbn0pO1xuXG4vKipcbiAqIFRyYWNrcyB3aGV0aGVyIGFueSBicm93c2VyIGVkaXRvciBpcyBvcGVuIGFjcm9zcyBhbGwgZWRpdG9yIGdyb3VwcyBhbmRcbiAqIGtlZXBzIHRoZSBgYnJvd3NlckVkaXRvck9wZW5gIGNvbnRleHQga2V5IGluIHN5bmMuXG4gKi9cbmNsYXNzIEJyb3dzZXJFZGl0b3JPcGVuQ29udGV4dEtleUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmJyb3dzZXJFZGl0b3JPcGVuQ29udGV4dEtleSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlIGJyb3dzZXJWaWV3U2VydmljZTogSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGNvbnRleHRLZXkgPSBDT05URVhUX0JST1dTRVJfRURJVE9SX09QRU4uYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCB1cGRhdGUgPSAoKSA9PiBjb250ZXh0S2V5LnNldChicm93c2VyVmlld1NlcnZpY2UuZ2V0Q29udGV4dHVhbEJyb3dzZXJWaWV3cygpLnNpemUgPiAwKTtcblxuXHRcdHVwZGF0ZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGJyb3dzZXJWaWV3U2VydmljZS5vbkRpZENoYW5nZUJyb3dzZXJWaWV3cygoKSA9PiB1cGRhdGUoKSkpO1xuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihCcm93c2VyRWRpdG9yT3BlbkNvbnRleHRLZXlDb250cmlidXRpb24uSUQsIEJyb3dzZXJFZGl0b3JPcGVuQ29udGV4dEtleUNvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5cbi8qKlxuICogT3BlbnMgbG9jYWxob3N0IFVSTHMgYW5kIGFsbC1pbnRlcmZhY2VzIFVSTHMgaW4gdGhlIEludGVncmF0ZWQgQnJvd3NlciB3aGVuIHRoZSBzZXR0aW5nIGlzIGVuYWJsZWQuXG4gKi9cbmNsYXNzIExvY2FsaG9zdExpbmtPcGVuZXJDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgSUV4dGVybmFsT3BlbmVyIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmxvY2FsaG9zdExpbmtPcGVuZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZTogSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG9wZW5lclNlcnZpY2UucmVnaXN0ZXJFeHRlcm5hbE9wZW5lcih0aGlzKSk7XG5cdH1cblxuXHRhc3luYyBvcGVuRXh0ZXJuYWwoaHJlZjogc3RyaW5nLCBjdHg6IHsgc291cmNlVXJpOiBVUkk7IHByZWZlcnJlZE9wZW5lcklkPzogc3RyaW5nIH0sIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3dvcmtiZW5jaC5icm93c2VyLm9wZW5Mb2NhbGhvc3RMaW5rcycpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UgYXJlIGluIGEgcmVtb3RlIHNlc3Npb24sIGFsd2F5cyB1c2UgdGhlIG9yaWdpbmFsIHNvdXJjZSBVUkkgKGFuZCBub3QgdGhlIGhyZWYgd2hpY2ggbWF5IGJlIHRoZSBmb3J3YXJkZWQgYWRkcmVzcylcblx0XHRpZiAodGhpcy5icm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2Uud2lsbFVzZVJlbW90ZVByb3h5KCkgJiYgY3R4LnNvdXJjZVVyaSkge1xuXHRcdFx0aHJlZiA9IGN0eC5zb3VyY2VVcmkudG9TdHJpbmcoKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gbmV3IFVSTChocmVmKTtcblx0XHRcdGlmIChwYXJzZWQucHJvdG9jb2wgIT09ICdodHRwOicgJiYgcGFyc2VkLnByb3RvY29sICE9PSAnaHR0cHM6Jykge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWlzTG9jYWxob3N0QXV0aG9yaXR5KHBhcnNlZC5ob3N0KSAmJiAhaXNBbGxJbnRlcmZhY2VzQXV0aG9yaXR5KHBhcnNlZC5ob3N0KSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0bG9nQnJvd3Nlck9wZW4odGhpcy50ZWxlbWV0cnlTZXJ2aWNlLCAnbG9jYWxob3N0TGlua09wZW5lcicpO1xuXG5cdFx0Ly8gQ2hlY2sgd2hldGhlciB0aGUgc2V0dGluZyB3YXMgZXhwbGljaXRseSBzZXQgYnkgdGhlIHVzZXIgb3IgaXMgc3RpbGwgYXQgaXRzIGRlZmF1bHQgdmFsdWUuXG5cdFx0Ly8gV2hlbiBpdCBpcyBhIGRlZmF1bHQsIHRhZyB0aGUgdmlld1N0YXRlIHNvIHRoYXQgdGhlIGhpbnQgcGlsbCBjYW4gYmUgc2hvd24uXG5cdFx0Y29uc3QgaXNEZWZhdWx0TGlua09wZW4gPSAhaXNDb25maWd1cmVkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdCgnd29ya2JlbmNoLmJyb3dzZXIub3BlbkxvY2FsaG9zdExpbmtzJykpO1xuXG5cdFx0Y29uc3QgYnJvd3NlclVyaSA9IEJyb3dzZXJWaWV3VXJpLmZvcklkKGdlbmVyYXRlVXVpZCgpKTtcblx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBicm93c2VyVXJpLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSwgdmlld1N0YXRlOiB7IHVybDogaHJlZiwgaXNEZWZhdWx0TGlua09wZW4gfSB9IH0sIGF3YWl0IHRoaXMuYnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLmdldFByZWZlcnJlZEdyb3VwKCkpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihMb2NhbGhvc3RMaW5rT3BlbmVyQ29udHJpYnV0aW9uLklELCBMb2NhbGhvc3RMaW5rT3BlbmVyQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xuXG4vLyAtLS0tIExpbmsgb3BlbmVkIGhpbnQgcGlsbCAoVVJMIGJhciB3aWRnZXQpIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNvbnN0IExPQ0FMSE9TVF9ISU5UX0RJU01JU1NFRF9LRVkgPSAnd29ya2JlbmNoLmJyb3dzZXIubGlua09wZW5lZEhpbnREaXNtaXNzZWQnO1xuXG4vKipcbiAqIEEgc21hbGwgcGlsbCBzaG93biBpbiB0aGUgVVJMIGJhciB0aGF0IGluZm9ybXMgdGhlIHVzZXIgdGhlaXIgbGluayB3YXMgb3BlbmVkXG4gKiBpbiB0aGUgSW50ZWdyYXRlZCBCcm93c2VyIGJ5IGRlZmF1bHQuIENsaWNraW5nIGl0IHNob3dzIGEgdG9vbHRpcFxuICogd2l0aCBhbiBleHBsYW5hdGlvbiBhbmQgb3B0aW9ucyB0byBvcGVuIHNldHRpbmdzIG9yIGRpc21pc3MgcGVybWFuZW50bHkuXG4gKi9cbmNsYXNzIExpbmtPcGVuZWRIaW50UGlsbCBleHRlbmRzIEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BpbGw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hdHRlbnRpb25UaW1lb3V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogQnJvd3NlckVkaXRvcixcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihlZGl0b3IpO1xuXG5cdFx0dGhpcy5fcGlsbCA9ICQoJy5icm93c2VyLWxpbmstb3BlbmVkLWhpbnQtcGlsbCcpO1xuXHRcdHRoaXMuX3BpbGwudGFiSW5kZXggPSAwO1xuXHRcdHRoaXMuX3BpbGwucm9sZSA9ICdidXR0b24nO1xuXHRcdHRoaXMuX3BpbGwuYXJpYUxhYmVsID0gbG9jYWxpemUoJ2Jyb3dzZXIubGlua09wZW5lZEhpbnQuYXJpYUxhYmVsJywgXCJUaGlzIGxpbmsgb3BlbmVkIGluIHRoZSBpbnRlZ3JhdGVkIGJyb3dzZXJcIik7XG5cdFx0dGhpcy5fcGlsbC5hcmlhSGlkZGVuID0gJ3RydWUnO1xuXG5cdFx0Y29uc3QgaWNvbiA9ICQoJ3NwYW4nKTtcblx0XHRpY29uLmNsYXNzTmFtZSA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmluZm8pO1xuXHRcdGNvbnN0IGxhYmVsID0gJCgnc3BhbicpO1xuXHRcdGxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2Jyb3dzZXIubGlua09wZW5lZEhpbnQubGFiZWwnLCBcIkxpbmsgb3BlbmVkIGhlcmVcIik7XG5cblx0XHR0aGlzLl9waWxsLmFwcGVuZENoaWxkKGljb24pO1xuXHRcdHRoaXMuX3BpbGwuYXBwZW5kQ2hpbGQobGFiZWwpO1xuXG5cdFx0Y29uc3QgaG92ZXJPcHRpb25zID0gKCkgPT4gKHtcblx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYnJvd3Nlci5saW5rT3BlbmVkSGludC5kZXRhaWwnLCBcIioqSW50ZWdyYXRlZCBCcm93c2VyKipcXG5cXG5Mb2NhbGhvc3QgbGlua3MgYXV0b21hdGljYWxseSBvcGVuIGluIHRoZSBpbnRlZ3JhdGVkIGJyb3dzZXIuXCIpKSxcblx0XHRcdGFjdGlvbnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYnJvd3Nlci5saW5rT3BlbmVkSGludC5vcGVuU2V0dGluZ3MnLCBcIk9wZW4gU2V0dGluZ3NcIiksXG5cdFx0XHRcdFx0Y29tbWFuZElkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLFxuXHRcdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uc2V0dGluZ3NHZWFyKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Vc2VyU2V0dGluZ3MoeyBxdWVyeTogJ3dvcmtiZW5jaC5icm93c2VyLm9wZW5Mb2NhbGhvc3RMaW5rcycgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VyLmxpbmtPcGVuZWRIaW50LmRpc21pc3MnLCBcIkRvbid0IFNob3cgQWdhaW5cIiksXG5cdFx0XHRcdFx0Y29tbWFuZElkOiAnJyxcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2Rpc21pc3MoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF0sXG5cdFx0XHRwb3NpdGlvbjogeyBob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkJFTE9XIH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRoaXMuX3BpbGwsIGhvdmVyT3B0aW9ucywgeyBzZXR1cEtleWJvYXJkRXZlbnRzOiB0cnVlIH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fcGlsbCwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmhvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKHsgLi4uaG92ZXJPcHRpb25zKCksIHRhcmdldDogdGhpcy5fcGlsbCwgcGVyc2lzdGVuY2U6IHsgc3RpY2t5OiB0cnVlIH0gfSwgdHJ1ZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHdpZGdldHMoKTogcmVhZG9ubHkgSUJyb3dzZXJFZGl0b3JXaWRnZXRbXSB7XG5cdFx0cmV0dXJuIFt7IGxvY2F0aW9uOiBCcm93c2VyV2lkZ2V0TG9jYXRpb24uUG9zdFVybCwgZWxlbWVudDogdGhpcy5fcGlsbCwgb3JkZXI6IDEwMCB9XTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbk1vZGVsQXR0YWNoZWQoX21vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCwgX3N0b3JlOiBEaXNwb3NhYmxlU3RvcmUsIGlzTmV3OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LmdldFZhbHVlKHRoaXMuY29udGV4dEtleVNlcnZpY2UpKSB7XG5cdFx0XHR0aGlzLl9zZXRWaXNpYmxlKGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpbnB1dCA9IHRoaXMuZWRpdG9yLmlucHV0O1xuXHRcdGlmIChpbnB1dCBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3JJbnB1dCAmJiBpbnB1dC5pc0RlZmF1bHRMaW5rT3Blbikge1xuXHRcdFx0Y29uc3QgZGlzbWlzc2VkID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKExPQ0FMSE9TVF9ISU5UX0RJU01JU1NFRF9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpO1xuXHRcdFx0dGhpcy5fc2V0VmlzaWJsZSghZGlzbWlzc2VkKTtcblx0XHRcdGlmICghZGlzbWlzc2VkICYmIGlzTmV3KSB7XG5cdFx0XHRcdHRoaXMuX2NhbGxBdHRlbnRpb24oKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2V0VmlzaWJsZShmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgb25Nb2RlbERldGFjaGVkKCk6IHZvaWQge1xuXHRcdHRoaXMuX2F0dGVudGlvblRpbWVvdXQuY2xlYXIoKTtcblx0XHR0aGlzLl9zZXRWaXNpYmxlKGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdmlzaWJsZSkge1xuXHRcdFx0dGhpcy5fYXR0ZW50aW9uVGltZW91dC5jbGVhcigpO1xuXHRcdFx0dGhpcy5fcGlsbC5jbGFzc0xpc3QucmVtb3ZlKCdhdHRlbnRpb24nKTtcblx0XHR9XG5cdFx0dGhpcy5fcGlsbC5jbGFzc0xpc3QudG9nZ2xlKCd2aXNpYmxlJywgdmlzaWJsZSk7XG5cdFx0dGhpcy5fcGlsbC5hcmlhSGlkZGVuID0gdmlzaWJsZSA/ICdmYWxzZScgOiAndHJ1ZSc7XG5cdH1cblxuXHRwcml2YXRlIF9jYWxsQXR0ZW50aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX2F0dGVudGlvblRpbWVvdXQuY2xlYXIoKTtcblx0XHR0aGlzLl9waWxsLmNsYXNzTGlzdC5yZW1vdmUoJ2F0dGVudGlvbicpO1xuXHRcdC8vIFN0YXJ0IGNvbGxhcHNlZCAoaWNvbiBvbmx5KSwgZXhwYW5kIGFmdGVyIDMwMG1zLCB0aGVuIGNvbGxhcHNlIGJhY2sgYWZ0ZXIgYW5vdGhlciAyc1xuXHRcdHRoaXMuX2F0dGVudGlvblRpbWVvdXQudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9waWxsLmNsYXNzTGlzdC5hZGQoJ2F0dGVudGlvbicpO1xuXHRcdFx0dGhpcy5fYXR0ZW50aW9uVGltZW91dC52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5fcGlsbC5jbGFzc0xpc3QucmVtb3ZlKCdhdHRlbnRpb24nKTtcblx0XHRcdH0sIDIwMDApO1xuXHRcdH0sIDMwMCk7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNtaXNzKCk6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoTE9DQUxIT1NUX0hJTlRfRElTTUlTU0VEX0tFWSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdHRoaXMuX3NldFZpc2libGUoZmFsc2UpO1xuXHR9XG59XG5cbkJyb3dzZXJFZGl0b3IucmVnaXN0ZXJDb250cmlidXRpb24oTGlua09wZW5lZEhpbnRQaWxsKTtcblxuLyoqXG4gKiBDb250cmlidXRlcyBVUkwtYmFyIHN1Z2dlc3Rpb25zIGZvciB0aGUgdXNlcidzIG90aGVyIG9wZW4gYnJvd3NlciB0YWJzLlxuICogUGlja2luZyBvbmUgc3dhcHMgdGhlIG5hdmJhcidzIGVkaXRvciBpbnB1dCBmb3IgdGhlIHRhYidzIGlucHV0IChtb3ZpbmdcbiAqIHRoZSB0YXJnZXQgaW50byBvdXIgc2xvdCwgdGhlbiBjbG9zaW5nIHRoZSBwcmV2aW91c2x5LWFjdGl2ZSBpbnB1dCkgc29cbiAqIHBpY2tpbmcgZnJvbSB0aGUgVVJMIGJhciBmZWVscyBsaWtlIFwicmVwbGFjZSB0aGlzIHRhYiB3aXRoIHRoYXQgb25lXCIuXG4gKi9cbmNsYXNzIEJyb3dzZXJUYWJVcmxTdWdnZXN0aW9ucyBleHRlbmRzIEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2dyb3VwTGlzdGVuZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8R3JvdXBJZGVudGlmaWVyPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yTGFiZWxMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmc+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyOiBJQnJvd3NlclVybFN1Z2dlc3Rpb25Qcm92aWRlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IEJyb3dzZXJFZGl0b3IsXG5cdFx0QElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYnJvd3NlclZpZXdTZXJ2aWNlOiBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yR3JvdXBzU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGVkaXRvcik7XG5cblx0XHQvLyBSZS1maXJlIG9uRGlkQ2hhbmdlIHdoZW5ldmVyIHRoZSBzZXQgb2YgdGFicywgdGhlIGdyb3VwIHN0cnVjdHVyZSwgb3Jcblx0XHQvLyBhbnkgdGFiJ3MgbGFiZWwgY2hhbmdlcyBzbyB0aGUgVVJMIHBpY2tlcidzIG9wZW4tdGFicyBsaXN0IHN0YXlzIGxpdmVcblx0XHQvLyAoYWRkaXRpb25zL3JlbW92YWxzKSBhbmQgb3JkZXJlZCBieSBjdXJyZW50IGdyb3VwIHZpc2liaWxpdHkuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLmdldEdyb3VwcyhHcm91cHNPcmRlci5HUklEX0FQUEVBUkFOQ0UpKSB7XG5cdFx0XHR0aGlzLl90cmFja0dyb3VwKGdyb3VwKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5vbkRpZEFkZEdyb3VwKGdyb3VwID0+IHtcblx0XHRcdHRoaXMuX3RyYWNrR3JvdXAoZ3JvdXApO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLm9uRGlkUmVtb3ZlR3JvdXAoZ3JvdXAgPT4ge1xuXHRcdFx0dGhpcy5fZ3JvdXBMaXN0ZW5lcnMuZGVsZXRlQW5kRGlzcG9zZShncm91cC5pZCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2Uub25EaWRNb3ZlR3JvdXAoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5vbkRpZENoYW5nZUdyb3VwSW5kZXgoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpKSk7XG5cblx0XHR0aGlzLl9yZWZyZXNoRWRpdG9yTGFiZWxMaXN0ZW5lcnMoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9icm93c2VyVmlld1NlcnZpY2Uub25EaWRDaGFuZ2VCcm93c2VyVmlld3MoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVmcmVzaEVkaXRvckxhYmVsTGlzdGVuZXJzKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcHJvdmlkZXIgPSB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2Jyb3dzZXIub3BlblRhYnMnLCBcIk9wZW4gVGFic1wiKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYnJvd3Nlci5vcGVuVGFic0Rlc2NyaXB0aW9uJywgXCJTZWxlY3QgYSB0YWIgdG8gc3dpdGNoXCIpLFxuXHRcdFx0b3JkZXI6IDEwMCxcblx0XHRcdGFjdGlvbnM6IFtdLFxuXHRcdFx0b25EaWRDaGFuZ2U6IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50LFxuXHRcdFx0Z2V0U3VnZ2VzdGlvbnM6IGFzeW5jICh7IGlucHV0IH0pID0+IHtcblx0XHRcdFx0Ly8gT25seSBzdXJmYWNlIHRhYiBzdWdnZXN0aW9ucyBvbiBhIG5ldyAvIGVtcHR5IHRhYi5cblx0XHRcdFx0aWYgKGlucHV0LnVybCkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fY29sbGVjdFN1Z2dlc3Rpb25zKGlucHV0KTtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCB1cmxTdWdnZXN0aW9uUHJvdmlkZXJzKCk6IHJlYWRvbmx5IElCcm93c2VyVXJsU3VnZ2VzdGlvblByb3ZpZGVyW10ge1xuXHRcdHJldHVybiBbdGhpcy5fcHJvdmlkZXJdO1xuXHR9XG5cblx0cHJpdmF0ZSBfdHJhY2tHcm91cChncm91cDogSUVkaXRvckdyb3VwKTogdm9pZCB7XG5cdFx0dGhpcy5fZ3JvdXBMaXN0ZW5lcnMuc2V0KGdyb3VwLmlkLCBncm91cC5vbkRpZE1vZGVsQ2hhbmdlKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVmcmVzaEVkaXRvckxhYmVsTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGtub3duID0gdGhpcy5fYnJvd3NlclZpZXdTZXJ2aWNlLmdldENvbnRleHR1YWxCcm93c2VyVmlld3MoKTtcblx0XHRmb3IgKGNvbnN0IGlkIG9mIFsuLi50aGlzLl9lZGl0b3JMYWJlbExpc3RlbmVycy5rZXlzKCldKSB7XG5cdFx0XHRpZiAoIWtub3duLmhhcyhpZCkpIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yTGFiZWxMaXN0ZW5lcnMuZGVsZXRlQW5kRGlzcG9zZShpZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgW2lkLCBlZGl0b3JdIG9mIGtub3duKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2VkaXRvckxhYmVsTGlzdGVuZXJzLmhhcyhpZCkpIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yTGFiZWxMaXN0ZW5lcnMuc2V0KGlkLCBlZGl0b3Iub25EaWRDaGFuZ2VMYWJlbCgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZS5maXJlKCkpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJuIHRhYnMgaW4gZWRpdG9yLWdyb3VwIHZpc2liaWxpdHkgb3JkZXIgKGdyaWQgYXBwZWFyYW5jZSwgdGhlblxuXHQgKiB3aXRoaW4tZ3JvdXAgZWRpdG9yIG9yZGVyKSwgd2l0aCBiYWNrZ3JvdW5kIHRhYnMgKGtub3duIGJ1dCBub3Qgb3BlblxuXHQgKiBpbiBhbnkgZ3JvdXApIGFwcGVuZGVkIGF0IHRoZSBlbmQuIEV4Y2x1ZGVzIHRoZSBlZGl0b3IncyBvd24gaW5wdXQuXG5cdCAqL1xuXHRwcml2YXRlIF9jb2xsZWN0U3VnZ2VzdGlvbnMoaW5wdXQ6IEJyb3dzZXJFZGl0b3JJbnB1dCk6IElCcm93c2VyVXJsU3VnZ2VzdGlvbltdIHtcblx0XHRjb25zdCBvcmRlcmVkOiBCcm93c2VyRWRpdG9ySW5wdXRbXSA9IFtdO1xuXHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLkdSSURfQVBQRUFSQU5DRSkpIHtcblx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGdyb3VwLmVkaXRvcnMpIHtcblx0XHRcdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3JJbnB1dCAmJiAhc2Vlbi5oYXMoZWRpdG9yLmlkKSkge1xuXHRcdFx0XHRcdHNlZW4uYWRkKGVkaXRvci5pZCk7XG5cdFx0XHRcdFx0b3JkZXJlZC5wdXNoKGVkaXRvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCB0YWIgb2YgdGhpcy5fYnJvd3NlclZpZXdTZXJ2aWNlLmdldENvbnRleHR1YWxCcm93c2VyVmlld3MoKS52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKCFzZWVuLmhhcyh0YWIuaWQpKSB7XG5cdFx0XHRcdHNlZW4uYWRkKHRhYi5pZCk7XG5cdFx0XHRcdG9yZGVyZWQucHVzaCh0YWIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHN1Z2dlc3Rpb25zOiBJQnJvd3NlclVybFN1Z2dlc3Rpb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdGFiIG9mIG9yZGVyZWQpIHtcblx0XHRcdGlmICh0YWIgPT09IGlucHV0KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmF3SWNvbiA9IHRhYi5nZXRJY29uKCk7XG5cdFx0XHRzdWdnZXN0aW9ucy5wdXNoKHtcblx0XHRcdFx0aWQ6IHRhYi5pZCxcblx0XHRcdFx0bGFiZWw6IHRhYi5nZXROYW1lKCksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB0YWIuZ2V0RGVzY3JpcHRpb24oKSxcblx0XHRcdFx0aWNvbjogcmF3SWNvbiBpbnN0YW5jZW9mIFVSSSA/IHVuZGVmaW5lZCA6IHJhd0ljb24sXG5cdFx0XHRcdGljb25QYXRoOiByYXdJY29uIGluc3RhbmNlb2YgVVJJID8geyBkYXJrOiByYXdJY29uIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdGFwcGx5OiBzb3VyY2UgPT4gdGhpcy5fc3dpdGNoVG9UYWIoc291cmNlLCB0YWIpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiBzdWdnZXN0aW9ucztcblx0fVxuXG5cdC8qKlxuXHQgKiBDbG9zZSB7QGxpbmsgc291cmNlfSBhbmQgZm9jdXMge0BsaW5rIHRhcmdldH0gd2hlcmUgaXQgYWxyZWFkeSBsaXZlcy5cblx0ICpcblx0ICogVGhlIG5hdmJhcidzIHBpY2tlci1oaWRlIGhhbmRsZXIgc3luY2hyb25vdXNseSBjYWxsc1xuXHQgKiBgZW5zdXJlQnJvd3NlckZvY3VzKClgIG9uIHRoZSBzb3VyY2UgZWRpdG9yIGJlZm9yZSBhbnkgb2Ygb3VyIGF3YWl0c1xuXHQgKiByZXNvbHZlLCBzbyB3ZSBoYXZlIHRvIGV4cGxpY2l0bHkgcmVmb2N1cyB0aGUgdGFyZ2V0IGdyb3VwIGFmdGVyIHRoZVxuXHQgKiBlZGl0b3Igc2VydmljZSBvcGVyYXRpb25zIGNvbXBsZXRlIFx1MjAxNCBvdGhlcndpc2UgZm9jdXMgc25hcHMgYmFjayB0b1xuXHQgKiB0aGUgKGFib3V0LXRvLWNsb3NlKSBzb3VyY2UncyB3aW5kb3cuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9zd2l0Y2hUb1RhYihzb3VyY2U6IEJyb3dzZXJFZGl0b3JJbnB1dCwgdGFyZ2V0OiBCcm93c2VyRWRpdG9ySW5wdXQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoc291cmNlID09PSB0YXJnZXQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih0YXJnZXQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzb3VyY2VHcm91cCA9IHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5maW5kKGcgPT4gZy5jb250YWlucyhzb3VyY2UpKTtcblx0XHRpZiAoc291cmNlR3JvdXApIHtcblx0XHRcdGF3YWl0IHNvdXJjZUdyb3VwLmNsb3NlRWRpdG9yKHNvdXJjZSwgeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0pO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IodGFyZ2V0KTtcblx0fVxufVxuXG5Ccm93c2VyRWRpdG9yLnJlZ2lzdGVyQ29udHJpYnV0aW9uKEJyb3dzZXJUYWJVcmxTdWdnZXN0aW9ucyk7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdC4uLndvcmtiZW5jaENvbmZpZ3VyYXRpb25Ob2RlQmFzZSxcblx0cHJvcGVydGllczoge1xuXHRcdCd3b3JrYmVuY2guYnJvd3Nlci5zaG93SW5UaXRsZUJhcic6IHtcblx0XHRcdHR5cGU6IFsnYm9vbGVhbicsICdzdHJpbmcnXSxcblx0XHRcdGVudW06IFt0cnVlLCBmYWxzZSwgJ3doZW5PcGVuJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKHsgY29tbWVudDogWydUaGlzIGlzIHRoZSBkZXNjcmlwdGlvbiBmb3IgYSBzZXR0aW5nLiBWYWx1ZXMgc3Vycm91bmRlZCBieSBzaW5nbGUgcXVvdGVzIGFyZSBub3QgdG8gYmUgdHJhbnNsYXRlZC4nXSwga2V5OiAnYnJvd3Nlci5zaG93SW5UaXRsZUJhci50cnVlJyB9LCAnVGhlIGJ1dHRvbiBpcyBhbHdheXMgc2hvd24gaW4gdGhlIHRpdGxlIGJhci4nKSxcblx0XHRcdFx0bG9jYWxpemUoeyBjb21tZW50OiBbJ1RoaXMgaXMgdGhlIGRlc2NyaXB0aW9uIGZvciBhIHNldHRpbmcuIFZhbHVlcyBzdXJyb3VuZGVkIGJ5IHNpbmdsZSBxdW90ZXMgYXJlIG5vdCB0byBiZSB0cmFuc2xhdGVkLiddLCBrZXk6ICdicm93c2VyLnNob3dJblRpdGxlQmFyLmZhbHNlJyB9LCAnVGhlIGJ1dHRvbiBpcyBuZXZlciBzaG93biBpbiB0aGUgdGl0bGUgYmFyLicpLFxuXHRcdFx0XHRsb2NhbGl6ZSh7IGNvbW1lbnQ6IFsnVGhpcyBpcyB0aGUgZGVzY3JpcHRpb24gZm9yIGEgc2V0dGluZy4gVmFsdWVzIHN1cnJvdW5kZWQgYnkgc2luZ2xlIHF1b3RlcyBhcmUgbm90IHRvIGJlIHRyYW5zbGF0ZWQuJ10sIGtleTogJ2Jyb3dzZXIuc2hvd0luVGl0bGVCYXIud2hlbk9wZW4nIH0sICdUaGUgYnV0dG9uIGlzIHNob3duIGluIHRoZSB0aXRsZSBiYXIgd2hlbiBhIGJyb3dzZXIgZWRpdG9yIGlzIG9wZW4uJylcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnd2hlbk9wZW4nLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBtb2RlOiAnc3RhcnR1cCcgfSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZShcblx0XHRcdFx0eyBjb21tZW50OiBbJ1RoaXMgaXMgdGhlIGRlc2NyaXB0aW9uIGZvciBhIHNldHRpbmcuJ10sIGtleTogJ2Jyb3dzZXIuc2hvd0luVGl0bGVCYXInIH0sXG5cdFx0XHRcdCdDb250cm9scyB3aGV0aGVyIHRoZSBJbnRlZ3JhdGVkIEJyb3dzZXIgYnV0dG9uIGlzIHNob3duIGluIHRoZSB0aXRsZSBiYXIuJ1xuXHRcdFx0KVxuXHRcdH0sXG5cdFx0J3dvcmtiZW5jaC5icm93c2VyLm9wZW5Mb2NhbGhvc3RMaW5rcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBtb2RlOiAnc3RhcnR1cCcgfSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKFxuXHRcdFx0XHR7IGNvbW1lbnQ6IFsnVGhpcyBpcyB0aGUgZGVzY3JpcHRpb24gZm9yIGEgc2V0dGluZy4nXSwga2V5OiAnYnJvd3Nlci5vcGVuTG9jYWxob3N0TGlua3MnIH0sXG5cdFx0XHRcdCdXaGVuIGVuYWJsZWQsIGxvY2FsaG9zdCBsaW5rcyAoYGxvY2FsaG9zdGAsIGAxMjcuMC4wLjFgLCBgWzo6MV1gKSBhbmQgYWxsLWludGVyZmFjZXMgbGlua3MgKGAwLjAuMC4wYCwgYFswOjA6MDowOjA6MDowOjBdYCwgYFs6Ol1gKSBmcm9tIHRoZSB0ZXJtaW5hbCwgY2hhdCwgYW5kIG90aGVyIHNvdXJjZXMgd2lsbCBvcGVuIGluIHRoZSBJbnRlZ3JhdGVkIEJyb3dzZXIgaW5zdGVhZCBvZiB0aGUgc3lzdGVtIGJyb3dzZXIuJ1xuXHRcdFx0KSxcblx0XHRcdGFnZW50c1dpbmRvdzogeyBkZWZhdWx0OiB0cnVlIH0sXG5cdFx0fSxcblx0XHRbQnJvd3Nlck5ld1RhYlBsYWNlbWVudFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydhY3RpdmVHcm91cCcsICdzaWRlR3JvdXAnLCAnd2luZG93J10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKHsgY29tbWVudDogWydUaGlzIGlzIHRoZSBkZXNjcmlwdGlvbiBmb3IgYSBzZXR0aW5nLiddLCBrZXk6ICdicm93c2VyLm5ld1RhYlBsYWNlbWVudC5hY3RpdmVHcm91cCcgfSwgXCJOZXcgYnJvd3NlciB0YWJzIG9wZW4gaW4gdGhlIGN1cnJlbnRseSBhY3RpdmUgZWRpdG9yIGdyb3VwLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoeyBjb21tZW50OiBbJ1RoaXMgaXMgdGhlIGRlc2NyaXB0aW9uIGZvciBhIHNldHRpbmcuJ10sIGtleTogJ2Jyb3dzZXIubmV3VGFiUGxhY2VtZW50LnNpZGVHcm91cCcgfSwgXCJOZXcgYnJvd3NlciB0YWJzIG9wZW4gaW4gYSBkZWRpY2F0ZWQgZWRpdG9yIGdyb3VwIHRvIHRoZSBzaWRlIHRoYXQgaXMgcmV1c2VkIGZvciBzdWJzZXF1ZW50IHRhYnMuIFRoZSBncm91cCBpcyBsb2NrZWQgc28gb3RoZXIgZWRpdG9ycyBhcmUgbm90IG9wZW5lZCBpbnRvIGl0LlwiKSxcblx0XHRcdFx0bG9jYWxpemUoeyBjb21tZW50OiBbJ1RoaXMgaXMgdGhlIGRlc2NyaXB0aW9uIGZvciBhIHNldHRpbmcuJ10sIGtleTogJ2Jyb3dzZXIubmV3VGFiUGxhY2VtZW50LndpbmRvdycgfSwgXCJOZXcgYnJvd3NlciB0YWJzIG9wZW4gaW4gYSBkZWRpY2F0ZWQgd2luZG93IHRoYXQgaXMgcmV1c2VkIGZvciBzdWJzZXF1ZW50IHRhYnMuIFRoZSB3aW5kb3cgaXMgbG9ja2VkIHNvIG90aGVyIGVkaXRvcnMgYXJlIG5vdCBvcGVuZWQgaW50byBpdC5cIilcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnYWN0aXZlR3JvdXAnLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoXG5cdFx0XHRcdHsgY29tbWVudDogWydUaGlzIGlzIHRoZSBkZXNjcmlwdGlvbiBmb3IgYSBzZXR0aW5nLiddLCBrZXk6ICdicm93c2VyLm5ld1RhYlBsYWNlbWVudCcgfSxcblx0XHRcdFx0XCJDb250cm9scyB3aGVyZSBuZXcgSW50ZWdyYXRlZCBCcm93c2VyIHRhYnMgYXJlIG9wZW5lZC5cIlxuXHRcdFx0KSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuV0lORE9XLFxuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxTQUFTLFFBQVEsY0FBYyx1QkFBdUI7QUFDL0QsU0FBMkIsNkJBQTZCO0FBQ3hELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsUUFBUSxlQUFlO0FBQ2hDLFNBQVMsY0FBYyxnQkFBZ0Isa0JBQWtCO0FBQ3pELFNBQXVCLHNCQUFzQixtQkFBbUI7QUFDaEUsU0FBUyxjQUFjLHdCQUF5Qyx3QkFBd0I7QUFDeEYsU0FBUyxvQkFBNEUsZ0NBQTRDO0FBQ2pJLFNBQVMsWUFBWSxlQUFlLGlCQUFpQix5QkFBeUI7QUFDOUUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0Isb0JBQW9CLHFCQUFxQjtBQUNsRSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFpQyxnQ0FBZ0Msc0JBQXNCO0FBQ3ZGLFNBQTRCLG9DQUFvQztBQUNoRSxTQUFTLHVDQUF1QztBQUNoRCxTQUFpQyxjQUFjLHlCQUF5QiwwQkFBMEI7QUFDbEcsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBMEIsc0JBQXNCO0FBQ2hELFNBQVMsc0JBQXNCLGdDQUFnQztBQUMvRCxTQUFTLHVCQUF1QixvQkFBb0I7QUFDcEQsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsR0FBRyx1QkFBdUIsaUJBQWlCO0FBQ3BELFNBQVMsZUFBZSwyQkFBMkIsdUJBQXVCLHVCQUF1Qix1QkFBdUIsMEJBQXNHO0FBQzlOLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCLDBCQUEwQjtBQUM1RCxTQUFTLGVBQWU7QUFFeEIsTUFBTSw4QkFBOEIsSUFBSSxjQUF1QixxQkFBcUIsT0FBTyxTQUFTLHNCQUFzQiw4Q0FBOEMsQ0FBQztBQU96SyxNQUFNLGtCQUFxQztBQUFBLEVBQzFDLFdBQVcsVUFBVSxZQUFZLFFBQVEsS0FBSztBQUFBLEVBQzlDLFNBQVMsU0FBUyxvQkFBb0IsT0FBTztBQUM5QztBQUVBLE1BQU0scUJBQXdDO0FBQUEsRUFDN0MsV0FBVyxVQUFVLFlBQVksUUFBUSxRQUFRO0FBQUEsRUFDakQsU0FBUyxTQUFTLHdCQUF3QixXQUFXO0FBQUEsRUFDckQsVUFBVSx5QkFBeUI7QUFDcEM7QUFPQSxJQUFNLHNCQUFOLGNBQWtDLFdBQVc7QUFBQSxFQWE1QyxZQUNrQyxnQkFDTSxzQkFDbkIsbUJBQ0Qsa0JBQzRCLHFCQUM5QztBQUNELFVBQU07QUFOMkI7QUFDTTtBQUdRO0FBZmhELFNBQWlCLGlCQUFpQixLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQUV0RSxTQUFpQixrQkFBeUM7QUFBQSxNQUN6RCxTQUFTO0FBQUEsTUFDVCxRQUFRO0FBQUEsTUFDUixPQUFPLFNBQVMsc0JBQXNCLDRCQUE0QjtBQUFBLE1BQ2xFLFdBQVcsVUFBVSxZQUFZLFFBQVEsR0FBRztBQUFBLE1BQzVDLFlBQVk7QUFBQSxJQUNiO0FBV0MsU0FBSyxhQUFhLEtBQUssVUFBVSxrQkFBa0IsZ0JBQXVDLEVBQUUsZUFBZSxLQUFLLENBQUMsQ0FBQztBQUNsSCxTQUFLLFdBQVcsY0FBYyxTQUFTLGdDQUFnQyxzQkFBc0I7QUFDN0YsU0FBSyxXQUFXLHFCQUFxQjtBQUNyQyxTQUFLLFdBQVcsY0FBYztBQUM5QixTQUFLLFdBQVcsVUFBVSxDQUFDLGtCQUFrQjtBQUU3QyxTQUFLLFVBQVUsS0FBSyxXQUFXLHVCQUF1QixPQUFPLEVBQUUsS0FBSyxNQUFNO0FBQ3pFLFdBQUssUUFBUSxRQUFRLElBQUk7QUFBQSxJQUMxQixDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsS0FBSyxXQUFXLG1CQUFtQixZQUFZO0FBQzdELGlCQUFXLFVBQVUsS0FBSyxvQkFBb0IsMEJBQTBCLEVBQUUsT0FBTyxHQUFHO0FBQ25GLGVBQU8sUUFBUSxJQUFJO0FBQUEsTUFDcEI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxLQUFLLFdBQVcsWUFBWSxZQUFZO0FBQ3RELFlBQU0sQ0FBQyxRQUFRLElBQUksS0FBSyxXQUFXO0FBQ25DLFVBQUksQ0FBQyxVQUFVO0FBQ2Q7QUFBQSxNQUNEO0FBQ0EsVUFBSSxhQUFhLEtBQUssaUJBQWlCO0FBQ3RDLHVCQUFlLGtCQUFrQixxQkFBcUI7QUFDdEQsYUFBSyxXQUFXLEtBQUs7QUFDckIsY0FBTSxLQUFLLGVBQWUsV0FBVztBQUFBLFVBQ3BDLFVBQVUsZUFBZSxNQUFNLGFBQWEsQ0FBQztBQUFBLFFBQzlDLEdBQUcsTUFBTSxLQUFLLG9CQUFvQixrQkFBa0IsQ0FBQztBQUFBLE1BQ3RELE9BQU87QUFDTixjQUFNLEtBQUssZUFBZSxXQUFXLFNBQVMsUUFBUSxNQUFNLEtBQUssb0JBQW9CLGtCQUFrQixTQUFTLE9BQU8sQ0FBQztBQUFBLE1BQ3pIO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsS0FBSyxXQUFXLFVBQVUsTUFBTSxLQUFLLFFBQVEsQ0FBQyxDQUFDO0FBQUEsRUFDL0Q7QUFBQSxFQUVBLE9BQWE7QUFDWixTQUFLLFlBQVk7QUFHakIsVUFBTSxlQUFlLEtBQUssZUFBZTtBQUN6QyxRQUFJLHdCQUF3QixvQkFBb0I7QUFDL0MsWUFBTSxhQUFjLEtBQUssV0FBVyxNQUNsQyxLQUFLLENBQUMsU0FBd0MsS0FBSyxTQUFTLGVBQWUsS0FBSyxXQUFXLFlBQVk7QUFDekcsVUFBSSxZQUFZO0FBQ2YsYUFBSyxXQUFXLGNBQWMsQ0FBQyxVQUFVO0FBQUEsTUFDMUM7QUFBQSxJQUNEO0FBRUEsU0FBSyxXQUFXLEtBQUs7QUFBQSxFQUN0QjtBQUFBLEVBRVEsY0FBb0I7QUFDM0IsU0FBSyxlQUFlLE1BQU07QUFHMUIsVUFBTSxlQUFlLEtBQUssV0FBVyxZQUFZLENBQUMsR0FBRztBQUVyRCxVQUFNLFFBQXlELENBQUM7QUFDaEUsVUFBTSxTQUFTLEtBQUsscUJBQXFCLFVBQVUsWUFBWSxlQUFlO0FBRTlFLFVBQU0sMkJBQTJCLE9BQy9CLElBQUksWUFBVSxFQUFFLE9BQU8sZ0JBQWdCLE1BQU0sUUFBUSxPQUFPLENBQUMsTUFBK0IsYUFBYSxrQkFBa0IsRUFBRSxFQUFFLEVBQy9ILE9BQU8sQ0FBQyxFQUFFLGVBQWUsTUFBTSxlQUFlLFNBQVMsQ0FBQztBQUcxRCxVQUFNLGdCQUFnQixvQkFBSSxJQUFZO0FBQ3RDLGVBQVcsRUFBRSxlQUFlLEtBQUssMEJBQTBCO0FBQzFELGlCQUFXLFVBQVUsZ0JBQWdCO0FBQ3BDLHNCQUFjLElBQUksT0FBTyxFQUFFO0FBQUEsTUFDNUI7QUFBQSxJQUNEO0FBR0EsVUFBTSxvQkFBb0IsQ0FBQyxHQUFHLEtBQUssb0JBQW9CLDBCQUEwQixFQUFFLE9BQU8sQ0FBQyxFQUFFLE9BQU8sT0FBSyxDQUFDLGNBQWMsSUFBSSxFQUFFLEVBQUUsQ0FBQztBQUNqSSxVQUFNLGtCQUFrQixTQUFTLDJCQUEyQixZQUFZO0FBSXhFLFVBQU0sV0FBc0IseUJBQXlCLElBQUksQ0FBQyxFQUFFLE9BQU8sZUFBZSxPQUFPO0FBQUEsTUFDeEYsT0FBTyxNQUFNO0FBQUEsTUFDYixXQUFXLE1BQU07QUFBQSxNQUNqQixTQUFTLE1BQU07QUFBQSxNQUNmLFNBQVM7QUFBQSxNQUNULFVBQVUsT0FBSyxNQUFNLFNBQVMsQ0FBQztBQUFBLElBQ2hDLEVBQUU7QUFDRixRQUFJLGtCQUFrQixTQUFTLEdBQUc7QUFDakMsZUFBUyxLQUFLLEVBQUUsT0FBTyxpQkFBaUIsV0FBVyxpQkFBaUIsU0FBUyxjQUFjLFNBQVMsa0JBQWtCLENBQUM7QUFBQSxJQUN4SDtBQUNBLGVBQVcsRUFBRSxNQUFNLEtBQUssMEJBQTBCO0FBQ2pELFdBQUssZUFBZSxJQUFJLE1BQU0saUJBQWlCLE1BQU0sS0FBSyxZQUFZLENBQUMsQ0FBQztBQUFBLElBQ3pFO0FBQ0EsU0FBSyxlQUFlLElBQUksS0FBSyxvQkFBb0Isd0JBQXdCLE1BQU0sS0FBSyxZQUFZLENBQUMsQ0FBQztBQUVsRyxVQUFNLHNCQUFzQixTQUFTLFNBQVM7QUFDOUMsUUFBSTtBQUVKLGVBQVcsV0FBVyxVQUFVO0FBQy9CLFVBQUkscUJBQXFCO0FBQ3hCLGNBQU0sS0FBSyxFQUFFLE1BQU0sYUFBYSxPQUFPLFFBQVEsTUFBTSxDQUFDO0FBQUEsTUFDdkQ7QUFDQSxpQkFBVyxVQUFVLFFBQVEsU0FBUztBQUNyQyxjQUFNLE9BQU8sT0FBTyxRQUFRO0FBQzVCLGNBQU0sY0FBYyxPQUFPLGVBQWU7QUFDMUMsY0FBTSxxQkFBcUIsY0FBYyxHQUFHLE9BQU8sUUFBUSxDQUFDLElBQUksV0FBVyxLQUFLLE9BQU8sUUFBUTtBQUMvRixjQUFNLE9BQThCO0FBQUEsVUFDbkMsU0FBUyxRQUFRO0FBQUEsVUFDakI7QUFBQSxVQUNBLE9BQU8sT0FBTyxRQUFRO0FBQUEsVUFDdEIsV0FBVyxzQkFDUixTQUFTLGtDQUFrQyxZQUFZLG9CQUFvQixRQUFRLFNBQVMsSUFDNUY7QUFBQSxVQUNIO0FBQUEsVUFDQSxTQUFTLENBQUMsZUFBZTtBQUFBLFVBQ3pCLFFBQVEsUUFBUSxXQUFXLENBQUMsUUFBUSxTQUFTLE1BQU0sSUFBSTtBQUFBLFFBQ3hEO0FBQ0EsWUFBSSxnQkFBZ0IsS0FBSztBQUN4QixlQUFLLFdBQVcsRUFBRSxNQUFNLEtBQUs7QUFBQSxRQUM5QixXQUFXLE1BQU07QUFDaEIsZUFBSyxZQUFZLFVBQVUsWUFBWSxJQUFJO0FBQUEsUUFDNUM7QUFDQSxjQUFNLEtBQUssSUFBSTtBQUVmLFlBQUksV0FBVyxjQUFjO0FBQzVCLDBCQUFnQjtBQUFBLFFBQ2pCO0FBRUEsYUFBSyxlQUFlLElBQUksT0FBTyxpQkFBaUIsTUFBTSxLQUFLLFlBQVksQ0FBQyxDQUFDO0FBQUEsTUFDMUU7QUFBQSxJQUNEO0FBRUEsVUFBTSxLQUFLLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDaEMsVUFBTSxLQUFLLEtBQUssZUFBZTtBQUUvQixTQUFLLFdBQVcscUJBQXFCO0FBQ3JDLFNBQUssV0FBVyxRQUFRO0FBQ3hCLFFBQUksZUFBZTtBQUNsQixXQUFLLFdBQVcsY0FBYyxDQUFDLGFBQWE7QUFBQSxJQUM3QztBQUFBLEVBQ0Q7QUFDRDtBQWpLTSxzQkFBTjtBQUFBLEVBY0c7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FsQkc7QUFtS04sTUFBTSwrQkFBK0IsUUFBUTtBQUFBLEVBQzVDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJLHFCQUFxQjtBQUFBLE1BQ3pCLE9BQU8sVUFBVSwyQkFBMkIsMkJBQTJCO0FBQUEsTUFDdkUsTUFBTSxRQUFRO0FBQUEsTUFDZCxVQUFVO0FBQUEsTUFDVixJQUFJO0FBQUEsTUFDSixZQUFZO0FBQUEsUUFDWCxRQUFRLGlCQUFpQjtBQUFBO0FBQUE7QUFBQSxRQUd6QixTQUFTLE9BQU8sVUFBVSxPQUFPLFFBQVEsUUFBUTtBQUFBLFFBQ2pELE1BQU07QUFBQSxNQUNQO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsSUFBSSxVQUFrQztBQUNyQyxVQUFNLFNBQVMsU0FBUyxJQUFJLHFCQUFxQixFQUFFLGVBQWUsbUJBQW1CO0FBQ3JGLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFDRDtBQWNBLE1BQU0sb0NBQW9DLFFBQVE7QUFBQSxFQUNqRCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSSxxQkFBcUI7QUFBQSxNQUN6QixPQUFPLFVBQVUsc0JBQXNCLHlCQUF5QjtBQUFBLE1BQ2hFLFVBQVU7QUFBQSxNQUNWLE1BQU0sUUFBUTtBQUFBLE1BQ2QsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUE0QixjQUE0RDtBQUNqRyxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxVQUFNLG1CQUFtQixTQUFTLElBQUksaUJBQWlCO0FBQ3ZELFVBQU0scUJBQXFCLFNBQVMsSUFBSSw0QkFBNEI7QUFHcEUsVUFBTSxVQUFVLE9BQU8saUJBQWlCLFdBQVcsRUFBRSxLQUFLLGFBQWEsSUFBSyxnQkFBZ0IsQ0FBQztBQUM3RixVQUFNLFdBQVcsZUFBZSxNQUFNLGFBQWEsQ0FBQztBQUNwRCxVQUFNLFFBQVEsTUFBTSxtQkFBbUIsa0JBQWtCLFFBQVEsYUFBYSxhQUFhLE1BQVM7QUFFcEcsUUFBSSxRQUFRLGdCQUFnQjtBQUMzQixZQUFNLFlBQVksSUFBSSxNQUFNLFFBQVEsY0FBYztBQUNsRCxZQUFNLGlCQUFpQixDQUFDLEdBQUcsbUJBQW1CLDBCQUEwQixFQUFFLE9BQU8sQ0FBQyxFQUFFLEtBQUssQ0FBQyxNQUFNO0FBQy9GLGNBQU0sWUFBWSxJQUFJLE1BQU0sRUFBRSxPQUFPLEVBQUU7QUFFdkMsWUFBSSxVQUFVLFVBQVUsUUFBUSxlQUFnQixXQUFXLEdBQUcsVUFBVSxNQUFNLEdBQUcsS0FBSyxVQUFVLFdBQVcsVUFBVSxRQUFRO0FBQzVILGlCQUFPO0FBQUEsUUFDUjtBQUNBLFlBQUksVUFBVSxhQUFhLENBQUMsTUFBTSxVQUFVLFdBQVcsVUFBVSxTQUFTLEdBQUc7QUFDNUUsaUJBQU87QUFBQSxRQUNSO0FBQ0EsWUFBSSxVQUFVLFFBQVEsQ0FBQyxNQUFNLFVBQVUsTUFBTSxVQUFVLElBQUksR0FBRztBQUM3RCxpQkFBTztBQUFBLFFBQ1I7QUFDQSxZQUFJLFVBQVUsT0FBTztBQUNwQixnQkFBTSxlQUFlLElBQUksZ0JBQWdCLFVBQVUsS0FBSztBQUN4RCxnQkFBTSxlQUFlLElBQUksZ0JBQWdCLFVBQVUsS0FBSztBQUN4RCxjQUFJLENBQUMsQ0FBQyxHQUFHLFlBQVksRUFBRSxNQUFNLENBQUMsQ0FBQyxLQUFLLEtBQUssTUFBTSxNQUFNLE9BQU8sYUFBYSxJQUFJLEdBQUcsS0FBSyxFQUFFLENBQUMsR0FBRztBQUMxRixtQkFBTztBQUFBLFVBQ1I7QUFBQSxRQUNEO0FBRUEsZUFBTztBQUFBLE1BQ1IsQ0FBQztBQUNELFVBQUksZ0JBQWdCO0FBQ25CLFlBQUksUUFBUSxLQUFLO0FBQ2hCLHlCQUFlLFNBQVMsUUFBUSxHQUFHO0FBQUEsUUFDcEM7QUFJQSxjQUFNLGNBQWMsV0FBVyxjQUFjO0FBQzdDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxtQkFBZSxrQkFBa0IsUUFBUSxNQUFNLG1CQUFtQixtQkFBbUI7QUFFckYsVUFBTSxhQUFhLE1BQU0sY0FBYyxXQUFXLEVBQUUsVUFBVSxTQUFTLEVBQUUsV0FBVyxFQUFFLEtBQUssUUFBUSxJQUFJLEVBQUUsRUFBRSxHQUFHLEtBQUs7QUFHbkgsUUFBSSxRQUFRLGNBQWMsWUFBWSxPQUFPO0FBQzVDLGlCQUFXLE1BQU0sS0FBSyxJQUFJO0FBQUEsSUFDM0I7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxNQUFNLDBDQUEwQyxRQUFRO0FBQUEsRUFDdkQsY0FBYztBQUNiLFVBQU0scUJBQXFCLGVBQWU7QUFBQSxNQUN6QyxtQkFBbUIsT0FBTyxVQUFVLFFBQVEsSUFBSTtBQUFBLE1BQ2hELGVBQWUsTUFBTSxtQkFBbUIsVUFBVSxLQUFLLFdBQVc7QUFBQSxJQUNuRTtBQUNBLFVBQU07QUFBQSxNQUNMLElBQUkscUJBQXFCO0FBQUEsTUFDekIsT0FBTyxVQUFVLDBCQUEwQiw0QkFBNEI7QUFBQSxNQUN2RSxVQUFVO0FBQUEsTUFDVixNQUFNLFFBQVE7QUFBQSxNQUNkLElBQUk7QUFBQSxNQUNKLGNBQWM7QUFBQSxNQUNkLE1BQU07QUFBQSxRQUNMO0FBQUEsVUFDQyxJQUFJLE9BQU87QUFBQSxVQUNYLE9BQU87QUFBQSxVQUNQLE9BQU87QUFBQSxVQUNQLE1BQU07QUFBQSxRQUNQO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSSxPQUFPO0FBQUEsVUFDWCxPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsVUFDUCxNQUFNO0FBQUEsUUFDUDtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUksT0FBTztBQUFBLFVBQ1gsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFVBQ1AsTUFBTTtBQUFBLFFBQ1A7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxJQUFJLFVBQTRCLFVBQStCO0FBQ3BFLFVBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBQ2pELFVBQU0sbUJBQW1CLFNBQVMsSUFBSSxpQkFBaUI7QUFDdkQsVUFBTSxxQkFBcUIsU0FBUyxJQUFJLDRCQUE0QjtBQUdwRSxVQUFNLFVBQVUsWUFBWSx1QkFBdUIsZUFBZSxjQUFjLGNBQWMsRUFBRSxnQkFBZ0IsQ0FBQyxRQUFRLElBQUksR0FBRyxtQkFBbUIsaUJBQWlCLFFBQVEsQ0FBQztBQUM3SyxRQUFJLENBQUMsU0FBUztBQUNiO0FBQUEsSUFDRDtBQUVBLG1CQUFlLGtCQUFrQixpQkFBaUI7QUFFbEQsVUFBTSxhQUFhLGVBQWUsTUFBTSxhQUFhLENBQUM7QUFDdEQsVUFBTSxjQUFjLFdBQVcsRUFBRSxVQUFVLFlBQVksU0FBUyxFQUFFLFdBQVcsRUFBRSxLQUFLLFFBQVEsU0FBUyxFQUFFLEVBQUUsRUFBRSxHQUFHLE1BQU0sbUJBQW1CLGtCQUFrQixDQUFDO0FBQUEsRUFDM0o7QUFDRDtBQUVBLE1BQU0scUJBQXFCLFFBQVE7QUFBQSxFQUNsQyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSSxxQkFBcUI7QUFBQSxNQUN6QixPQUFPLFVBQVUsd0JBQXdCLFNBQVM7QUFBQSxNQUNsRCxVQUFVO0FBQUEsTUFDVixNQUFNLFFBQVE7QUFBQSxNQUNkLElBQUk7QUFBQSxNQUNKLGNBQWM7QUFBQSxNQUNkLE1BQU07QUFBQSxRQUNMLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTyxtQkFBbUI7QUFBQSxRQUMxQixPQUFPO0FBQUEsUUFDUCxtQkFBbUI7QUFBQSxNQUNwQjtBQUFBO0FBQUEsTUFFQSxZQUFZO0FBQUEsUUFDWCxRQUFRLGlCQUFpQixtQkFBbUI7QUFBQTtBQUFBLFFBQzVDLFNBQVMsT0FBTyxVQUFVLFFBQVE7QUFBQSxNQUNuQztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUE0QixpQkFBaUIsU0FBUyxJQUFJLGNBQWMsRUFBRSxrQkFBaUM7QUFDcEgsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGNBQWM7QUFDakQsVUFBTSxtQkFBbUIsU0FBUyxJQUFJLGlCQUFpQjtBQUN2RCxVQUFNLHFCQUFxQixTQUFTLElBQUksNEJBQTRCO0FBQ3BFLFVBQU0sV0FBVyxlQUFlLE1BQU0sYUFBYSxDQUFDO0FBRXBELG1CQUFlLGtCQUFrQixlQUFlO0FBRWhELFVBQU0sY0FBYyxXQUFXLEVBQUUsU0FBUyxHQUFHLE1BQU0sbUJBQW1CLGtCQUFrQixDQUFDO0FBQUEsRUFDMUY7QUFDRDtBQUVBLE1BQU0sa0NBQWtDLFFBQVE7QUFBQSxFQUMvQyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSSxxQkFBcUI7QUFBQSxNQUN6QixPQUFPLFVBQVUsb0JBQW9CLHdCQUF3QjtBQUFBLE1BQzdELFVBQVU7QUFBQSxNQUNWLElBQUk7QUFBQSxNQUNKLGNBQWM7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBMkM7QUFDcEQsVUFBTSxzQkFBc0IsU0FBUyxJQUFJLG9CQUFvQjtBQUM3RCxlQUFXLFNBQVMsb0JBQW9CLFVBQVUsWUFBWSxlQUFlLEdBQUc7QUFDL0UsWUFBTSxpQkFBaUIsTUFBTSxXQUFXLGFBQWEsVUFBVSxFQUFFLE9BQU8sQ0FBQyxNQUErQixhQUFhLGtCQUFrQjtBQUN2SSxVQUFJLGVBQWUsU0FBUyxHQUFHO0FBQzlCLGNBQU0sTUFBTSxhQUFhLGNBQWM7QUFBQSxNQUN4QztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxNQUFNLHlDQUF5QyxRQUFRO0FBQUEsRUFDdEQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUkscUJBQXFCO0FBQUEsTUFDekIsT0FBTyxVQUFVLDJCQUEyQixpQ0FBaUM7QUFBQSxNQUM3RSxVQUFVO0FBQUEsTUFDVixJQUFJO0FBQUEsTUFDSixjQUFjO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxJQUFJLFVBQTJDO0FBQ3BELFVBQU0sc0JBQXNCLFNBQVMsSUFBSSxvQkFBb0I7QUFDN0QsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGNBQWM7QUFDakQsVUFBTSxRQUFRLG9CQUFvQixTQUFTLGNBQWMsa0JBQWtCLE9BQU8sTUFBTSxvQkFBb0IsWUFBWSxFQUFFO0FBQzFILFFBQUksQ0FBQyxPQUFPO0FBQ1g7QUFBQSxJQUNEO0FBQ0EsVUFBTSxpQkFBaUIsTUFBTSxXQUFXLGFBQWEsVUFBVSxFQUFFLE9BQU8sQ0FBQyxNQUErQixhQUFhLGtCQUFrQjtBQUN2SSxRQUFJLGVBQWUsU0FBUyxHQUFHO0FBQzlCLFlBQU0sTUFBTSxhQUFhLGNBQWM7QUFBQSxJQUN4QztBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0saUNBQWlDLFFBQVE7QUFBQSxFQUM5QyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSSxxQkFBcUI7QUFBQSxNQUN6QixPQUFPLFVBQVUsNEJBQTRCLFNBQVM7QUFBQSxNQUN0RCxNQUFNLFFBQVE7QUFBQSxNQUNkLElBQUk7QUFBQSxNQUNKLFlBQVk7QUFBQSxRQUNYLFFBQVEsaUJBQWlCO0FBQUEsUUFDekIsU0FBUyxPQUFPLFVBQVUsT0FBTyxNQUFNLFFBQVE7QUFBQSxNQUNoRDtBQUFBLE1BQ0EsTUFBTTtBQUFBLFFBQ0wsSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNLGVBQWU7QUFBQSxVQUNwQixlQUFlLE9BQU8sMkNBQTJDLEtBQUssRUFBRSxPQUFPO0FBQUEsVUFDL0UsZUFBZTtBQUFBLFlBQ2Q7QUFBQTtBQUFBLFlBRUEsZUFBZSxPQUFPLDJDQUEyQyxDQUFDO0FBQUEsVUFDbkU7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUEyQztBQUNwRCxVQUFNLHFCQUFxQixTQUFTLElBQUksNEJBQTRCO0FBQ3BFLFVBQU0saUJBQWlCLFNBQVMsSUFBSSxlQUFlO0FBRW5ELFVBQU0sdUJBQXVCLG1CQUFtQiwwQkFBMEIsRUFBRSxPQUFPO0FBRW5GLFFBQUksc0JBQXNCO0FBQ3pCLFlBQU0sZUFBZSxlQUFlLHFCQUFxQixTQUFTO0FBQ2xFO0FBQUEsSUFDRDtBQUVBLFVBQU0sZUFBZSxlQUFlLHFCQUFxQixJQUFJO0FBQUEsRUFDOUQ7QUFDRDtBQUdBLGFBQWEsZUFBZSxPQUFPLGlCQUFpQjtBQUFBLEVBQ25ELE9BQU87QUFBQSxFQUNQLFNBQVM7QUFBQSxJQUNSLElBQUkscUJBQXFCO0FBQUEsSUFDekIsT0FBTyxTQUFTLEVBQUUsS0FBSyxpQkFBaUIsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsV0FBVztBQUFBLEVBQzFGO0FBQUEsRUFDQSxPQUFPO0FBQ1IsQ0FBQztBQUdELGFBQWEsZUFBZSxPQUFPLG9CQUFvQixFQUFFLFNBQVMsRUFBRSxJQUFJLHFCQUFxQixpQkFBaUIsT0FBTyxTQUFTLGdDQUFnQyx3QkFBd0IsRUFBRSxHQUFHLE9BQU8sV0FBVyxPQUFPLElBQUksTUFBTSxzQkFBc0IsQ0FBQztBQUlyUCxhQUFhLGVBQWUsT0FBTyxhQUFhO0FBQUEsRUFDL0MsU0FBUztBQUFBLElBQ1IsSUFBSSxxQkFBcUI7QUFBQSxJQUN6QixPQUFPLFVBQVUsd0JBQXdCLFNBQVM7QUFBQSxJQUNsRCxNQUFNLFFBQVE7QUFBQSxFQUNmO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxPQUFPO0FBQUEsRUFDUCxNQUFNLGVBQWUsSUFBSSx1QkFBdUIsdUJBQXVCO0FBQ3hFLENBQUM7QUFFRCxnQkFBZ0Isc0JBQXNCO0FBQ3RDLGdCQUFnQiwyQkFBMkI7QUFDM0MsZ0JBQWdCLGlDQUFpQztBQUNqRCxnQkFBZ0Isd0JBQXdCO0FBQ3hDLGdCQUFnQixZQUFZO0FBQzVCLGdCQUFnQix5QkFBeUI7QUFDekMsZ0JBQWdCLGdDQUFnQztBQUVoRCxnQkFBZ0IsTUFBTSxvQ0FBb0MsMkJBQTJCO0FBQUEsRUFDcEYsY0FBYztBQUNiLFVBQU0sb0NBQW9DLFNBQVMsa0JBQWtCLG9CQUFvQixHQUFHLFNBQVMsNkJBQTZCLGlFQUFpRSxHQUFHLENBQUM7QUFBQSxFQUN4TTtBQUNELENBQUM7QUFNRCxJQUFNLDBDQUFOLGNBQXNELFdBQTZDO0FBQUEsRUFHbEcsWUFDcUIsbUJBQ1Usb0JBQzdCO0FBQ0QsVUFBTTtBQUVOLFVBQU0sYUFBYSw0QkFBNEIsT0FBTyxpQkFBaUI7QUFDdkUsVUFBTSxTQUFTLE1BQU0sV0FBVyxJQUFJLG1CQUFtQiwwQkFBMEIsRUFBRSxPQUFPLENBQUM7QUFFM0YsV0FBTztBQUNQLFNBQUssVUFBVSxtQkFBbUIsd0JBQXdCLE1BQU0sT0FBTyxDQUFDLENBQUM7QUFBQSxFQUMxRTtBQUNEO0FBZk0sd0NBQ1csS0FBSztBQURoQiwwQ0FBTjtBQUFBLEVBSUc7QUFBQSxFQUNBO0FBQUEsR0FMRztBQWlCTiwrQkFBK0Isd0NBQXdDLElBQUkseUNBQXlDLGVBQWUsYUFBYTtBQUtoSixJQUFNLGtDQUFOLGNBQThDLFdBQThEO0FBQUEsRUFHM0csWUFDaUIsZUFDd0Isc0JBQ1AsZUFDRyxrQkFDVyw2QkFDOUM7QUFDRCxVQUFNO0FBTGtDO0FBQ1A7QUFDRztBQUNXO0FBSS9DLFNBQUssVUFBVSxjQUFjLHVCQUF1QixJQUFJLENBQUM7QUFBQSxFQUMxRDtBQUFBLEVBRUEsTUFBTSxhQUFhLE1BQWMsS0FBcUQsUUFBNkM7QUFDbEksUUFBSSxDQUFDLEtBQUsscUJBQXFCLFNBQWtCLHNDQUFzQyxHQUFHO0FBQ3pGLGFBQU87QUFBQSxJQUNSO0FBR0EsUUFBSSxLQUFLLDRCQUE0QixtQkFBbUIsS0FBSyxJQUFJLFdBQVc7QUFDM0UsYUFBTyxJQUFJLFVBQVUsU0FBUztBQUFBLElBQy9CO0FBRUEsUUFBSTtBQUNILFlBQU0sU0FBUyxJQUFJLElBQUksSUFBSTtBQUMzQixVQUFJLE9BQU8sYUFBYSxXQUFXLE9BQU8sYUFBYSxVQUFVO0FBQ2hFLGVBQU87QUFBQSxNQUNSO0FBQ0EsVUFBSSxDQUFDLHFCQUFxQixPQUFPLElBQUksS0FBSyxDQUFDLHlCQUF5QixPQUFPLElBQUksR0FBRztBQUNqRixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsUUFBUTtBQUNQLGFBQU87QUFBQSxJQUNSO0FBRUEsbUJBQWUsS0FBSyxrQkFBa0IscUJBQXFCO0FBSTNELFVBQU0sb0JBQW9CLENBQUMsYUFBYSxLQUFLLHFCQUFxQixRQUFRLHNDQUFzQyxDQUFDO0FBRWpILFVBQU0sYUFBYSxlQUFlLE1BQU0sYUFBYSxDQUFDO0FBQ3RELFVBQU0sS0FBSyxjQUFjLFdBQVcsRUFBRSxVQUFVLFlBQVksU0FBUyxFQUFFLFFBQVEsTUFBTSxXQUFXLEVBQUUsS0FBSyxNQUFNLGtCQUFrQixFQUFFLEVBQUUsR0FBRyxNQUFNLEtBQUssNEJBQTRCLGtCQUFrQixDQUFDO0FBQ2hNLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUEvQ00sZ0NBQ1csS0FBSztBQURoQixrQ0FBTjtBQUFBLEVBSUc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FSRztBQWlETiwrQkFBK0IsZ0NBQWdDLElBQUksaUNBQWlDLGVBQWUsWUFBWTtBQUkvSCxNQUFNLCtCQUErQjtBQU9yQyxJQUFNLHFCQUFOLGNBQWlDLDBCQUEwQjtBQUFBLEVBSzFELFlBQ0MsUUFDZ0MsY0FDRSxnQkFDSSxvQkFDRCxtQkFDcEM7QUFDRCxVQUFNLE1BQU07QUFMb0I7QUFDRTtBQUNJO0FBQ0Q7QUFQdEMsU0FBaUIsb0JBQW9CLEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBVzFFLFNBQUssUUFBUSxFQUFFLGdDQUFnQztBQUMvQyxTQUFLLE1BQU0sV0FBVztBQUN0QixTQUFLLE1BQU0sT0FBTztBQUNsQixTQUFLLE1BQU0sWUFBWSxTQUFTLG9DQUFvQyw0Q0FBNEM7QUFDaEgsU0FBSyxNQUFNLGFBQWE7QUFFeEIsVUFBTSxPQUFPLEVBQUUsTUFBTTtBQUNyQixTQUFLLFlBQVksVUFBVSxZQUFZLFFBQVEsSUFBSTtBQUNuRCxVQUFNLFFBQVEsRUFBRSxNQUFNO0FBQ3RCLFVBQU0sY0FBYyxTQUFTLGdDQUFnQyxrQkFBa0I7QUFFL0UsU0FBSyxNQUFNLFlBQVksSUFBSTtBQUMzQixTQUFLLE1BQU0sWUFBWSxLQUFLO0FBRTVCLFVBQU0sZUFBZSxPQUFPO0FBQUEsTUFDM0IsU0FBUyxJQUFJLGVBQWUsU0FBUyxpQ0FBaUMseUZBQXlGLENBQUM7QUFBQSxNQUNoSyxTQUFTO0FBQUEsUUFDUjtBQUFBLFVBQ0MsT0FBTyxTQUFTLHVDQUF1QyxlQUFlO0FBQUEsVUFDdEUsV0FBVztBQUFBLFVBQ1gsV0FBVyxVQUFVLFlBQVksUUFBUSxZQUFZO0FBQUEsVUFDckQsS0FBSyxNQUFNO0FBQ1YsaUJBQUssbUJBQW1CLGlCQUFpQixFQUFFLE9BQU8sdUNBQXVDLENBQUM7QUFBQSxVQUMzRjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxPQUFPLFNBQVMsa0NBQWtDLGtCQUFrQjtBQUFBLFVBQ3BFLFdBQVc7QUFBQSxVQUNYLEtBQUssTUFBTTtBQUNWLGlCQUFLLFNBQVM7QUFBQSxVQUNmO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFVBQVUsRUFBRSxlQUFlLGNBQWMsTUFBTTtBQUFBLElBQ2hEO0FBRUEsU0FBSyxVQUFVLEtBQUssYUFBYSxrQkFBa0IsS0FBSyxPQUFPLGNBQWMsRUFBRSxxQkFBcUIsS0FBSyxDQUFDLENBQUM7QUFDM0csU0FBSyxVQUFVLHNCQUFzQixLQUFLLE9BQU8sVUFBVSxPQUFPLE1BQU07QUFDdkUsV0FBSyxhQUFhLGlCQUFpQixFQUFFLEdBQUcsYUFBYSxHQUFHLFFBQVEsS0FBSyxPQUFPLGFBQWEsRUFBRSxRQUFRLEtBQUssRUFBRSxHQUFHLElBQUk7QUFBQSxJQUNsSCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxJQUFhLFVBQTJDO0FBQ3ZELFdBQU8sQ0FBQyxFQUFFLFVBQVUsc0JBQXNCLFNBQVMsU0FBUyxLQUFLLE9BQU8sT0FBTyxJQUFJLENBQUM7QUFBQSxFQUNyRjtBQUFBLEVBRW1CLGdCQUFnQixRQUEyQixRQUF5QixPQUFzQjtBQUM1RyxRQUFJLHdCQUF3QixTQUFTLEtBQUssaUJBQWlCLEdBQUc7QUFDN0QsV0FBSyxZQUFZLEtBQUs7QUFDdEI7QUFBQSxJQUNEO0FBRUEsVUFBTSxRQUFRLEtBQUssT0FBTztBQUMxQixRQUFJLGlCQUFpQixzQkFBc0IsTUFBTSxtQkFBbUI7QUFDbkUsWUFBTSxZQUFZLEtBQUssZUFBZSxXQUFXLDhCQUE4QixhQUFhLGFBQWEsS0FBSztBQUM5RyxXQUFLLFlBQVksQ0FBQyxTQUFTO0FBQzNCLFVBQUksQ0FBQyxhQUFhLE9BQU87QUFDeEIsYUFBSyxlQUFlO0FBQUEsTUFDckI7QUFBQSxJQUNELE9BQU87QUFDTixXQUFLLFlBQVksS0FBSztBQUFBLElBQ3ZCO0FBQUEsRUFDRDtBQUFBLEVBRVMsa0JBQXdCO0FBQ2hDLFNBQUssa0JBQWtCLE1BQU07QUFDN0IsU0FBSyxZQUFZLEtBQUs7QUFBQSxFQUN2QjtBQUFBLEVBRVEsWUFBWSxTQUF3QjtBQUMzQyxRQUFJLENBQUMsU0FBUztBQUNiLFdBQUssa0JBQWtCLE1BQU07QUFDN0IsV0FBSyxNQUFNLFVBQVUsT0FBTyxXQUFXO0FBQUEsSUFDeEM7QUFDQSxTQUFLLE1BQU0sVUFBVSxPQUFPLFdBQVcsT0FBTztBQUM5QyxTQUFLLE1BQU0sYUFBYSxVQUFVLFVBQVU7QUFBQSxFQUM3QztBQUFBLEVBRVEsaUJBQXVCO0FBQzlCLFNBQUssa0JBQWtCLE1BQU07QUFDN0IsU0FBSyxNQUFNLFVBQVUsT0FBTyxXQUFXO0FBRXZDLFNBQUssa0JBQWtCLFFBQVEsa0JBQWtCLE1BQU07QUFDdEQsV0FBSyxNQUFNLFVBQVUsSUFBSSxXQUFXO0FBQ3BDLFdBQUssa0JBQWtCLFFBQVEsa0JBQWtCLE1BQU07QUFDdEQsYUFBSyxNQUFNLFVBQVUsT0FBTyxXQUFXO0FBQUEsTUFDeEMsR0FBRyxHQUFJO0FBQUEsSUFDUixHQUFHLEdBQUc7QUFBQSxFQUNQO0FBQUEsRUFFUSxXQUFpQjtBQUN4QixTQUFLLGVBQWUsTUFBTSw4QkFBOEIsTUFBTSxhQUFhLGFBQWEsY0FBYyxJQUFJO0FBQzFHLFNBQUssWUFBWSxLQUFLO0FBQUEsRUFDdkI7QUFDRDtBQTVHTSxxQkFBTjtBQUFBLEVBT0c7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVZHO0FBOEdOLGNBQWMscUJBQXFCLGtCQUFrQjtBQVFyRCxJQUFNLDJCQUFOLGNBQXVDLDBCQUEwQjtBQUFBLEVBUWhFLFlBQ0MsUUFDK0MscUJBQ2QsZ0JBQ00sc0JBQ3RDO0FBQ0QsVUFBTSxNQUFNO0FBSm1DO0FBQ2Q7QUFDTTtBQVZ4QyxTQUFpQixlQUFlLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUNsRSxTQUFpQixrQkFBa0IsS0FBSyxVQUFVLElBQUksY0FBK0IsQ0FBQztBQUN0RixTQUFpQix3QkFBd0IsS0FBSyxVQUFVLElBQUksY0FBc0IsQ0FBQztBQWVsRixlQUFXLFNBQVMsS0FBSyxxQkFBcUIsVUFBVSxZQUFZLGVBQWUsR0FBRztBQUNyRixXQUFLLFlBQVksS0FBSztBQUFBLElBQ3ZCO0FBQ0EsU0FBSyxVQUFVLEtBQUsscUJBQXFCLGNBQWMsV0FBUztBQUMvRCxXQUFLLFlBQVksS0FBSztBQUN0QixXQUFLLGFBQWEsS0FBSztBQUFBLElBQ3hCLENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxLQUFLLHFCQUFxQixpQkFBaUIsV0FBUztBQUNsRSxXQUFLLGdCQUFnQixpQkFBaUIsTUFBTSxFQUFFO0FBQzlDLFdBQUssYUFBYSxLQUFLO0FBQUEsSUFDeEIsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLEtBQUsscUJBQXFCLGVBQWUsTUFBTSxLQUFLLGFBQWEsS0FBSyxDQUFDLENBQUM7QUFDdkYsU0FBSyxVQUFVLEtBQUsscUJBQXFCLHNCQUFzQixNQUFNLEtBQUssYUFBYSxLQUFLLENBQUMsQ0FBQztBQUU5RixTQUFLLDZCQUE2QjtBQUNsQyxTQUFLLFVBQVUsS0FBSyxvQkFBb0Isd0JBQXdCLE1BQU07QUFDckUsV0FBSyw2QkFBNkI7QUFDbEMsV0FBSyxhQUFhLEtBQUs7QUFBQSxJQUN4QixDQUFDLENBQUM7QUFFRixTQUFLLFlBQVk7QUFBQSxNQUNoQixPQUFPLFNBQVMsb0JBQW9CLFdBQVc7QUFBQSxNQUMvQyxhQUFhLFNBQVMsK0JBQStCLHdCQUF3QjtBQUFBLE1BQzdFLE9BQU87QUFBQSxNQUNQLFNBQVMsQ0FBQztBQUFBLE1BQ1YsYUFBYSxLQUFLLGFBQWE7QUFBQSxNQUMvQixnQkFBZ0IsT0FBTyxFQUFFLE1BQU0sTUFBTTtBQUVwQyxZQUFJLE1BQU0sS0FBSztBQUNkLGlCQUFPLENBQUM7QUFBQSxRQUNUO0FBQ0EsZUFBTyxLQUFLLG9CQUFvQixLQUFLO0FBQUEsTUFDdEM7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsSUFBYSx5QkFBbUU7QUFDL0UsV0FBTyxDQUFDLEtBQUssU0FBUztBQUFBLEVBQ3ZCO0FBQUEsRUFFUSxZQUFZLE9BQTJCO0FBQzlDLFNBQUssZ0JBQWdCLElBQUksTUFBTSxJQUFJLE1BQU0saUJBQWlCLE1BQU0sS0FBSyxhQUFhLEtBQUssQ0FBQyxDQUFDO0FBQUEsRUFDMUY7QUFBQSxFQUVRLCtCQUFxQztBQUM1QyxVQUFNLFFBQVEsS0FBSyxvQkFBb0IsMEJBQTBCO0FBQ2pFLGVBQVcsTUFBTSxDQUFDLEdBQUcsS0FBSyxzQkFBc0IsS0FBSyxDQUFDLEdBQUc7QUFDeEQsVUFBSSxDQUFDLE1BQU0sSUFBSSxFQUFFLEdBQUc7QUFDbkIsYUFBSyxzQkFBc0IsaUJBQWlCLEVBQUU7QUFBQSxNQUMvQztBQUFBLElBQ0Q7QUFDQSxlQUFXLENBQUMsSUFBSSxNQUFNLEtBQUssT0FBTztBQUNqQyxVQUFJLENBQUMsS0FBSyxzQkFBc0IsSUFBSSxFQUFFLEdBQUc7QUFDeEMsYUFBSyxzQkFBc0IsSUFBSSxJQUFJLE9BQU8saUJBQWlCLE1BQU0sS0FBSyxhQUFhLEtBQUssQ0FBQyxDQUFDO0FBQUEsTUFDM0Y7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9RLG9CQUFvQixPQUFvRDtBQUMvRSxVQUFNLFVBQWdDLENBQUM7QUFDdkMsVUFBTSxPQUFPLG9CQUFJLElBQVk7QUFDN0IsZUFBVyxTQUFTLEtBQUsscUJBQXFCLFVBQVUsWUFBWSxlQUFlLEdBQUc7QUFDckYsaUJBQVcsVUFBVSxNQUFNLFNBQVM7QUFDbkMsWUFBSSxrQkFBa0Isc0JBQXNCLENBQUMsS0FBSyxJQUFJLE9BQU8sRUFBRSxHQUFHO0FBQ2pFLGVBQUssSUFBSSxPQUFPLEVBQUU7QUFDbEIsa0JBQVEsS0FBSyxNQUFNO0FBQUEsUUFDcEI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLGVBQVcsT0FBTyxLQUFLLG9CQUFvQiwwQkFBMEIsRUFBRSxPQUFPLEdBQUc7QUFDaEYsVUFBSSxDQUFDLEtBQUssSUFBSSxJQUFJLEVBQUUsR0FBRztBQUN0QixhQUFLLElBQUksSUFBSSxFQUFFO0FBQ2YsZ0JBQVEsS0FBSyxHQUFHO0FBQUEsTUFDakI7QUFBQSxJQUNEO0FBRUEsVUFBTSxjQUF1QyxDQUFDO0FBQzlDLGVBQVcsT0FBTyxTQUFTO0FBQzFCLFVBQUksUUFBUSxPQUFPO0FBQ2xCO0FBQUEsTUFDRDtBQUNBLFlBQU0sVUFBVSxJQUFJLFFBQVE7QUFDNUIsa0JBQVksS0FBSztBQUFBLFFBQ2hCLElBQUksSUFBSTtBQUFBLFFBQ1IsT0FBTyxJQUFJLFFBQVE7QUFBQSxRQUNuQixhQUFhLElBQUksZUFBZTtBQUFBLFFBQ2hDLE1BQU0sbUJBQW1CLE1BQU0sU0FBWTtBQUFBLFFBQzNDLFVBQVUsbUJBQW1CLE1BQU0sRUFBRSxNQUFNLFFBQVEsSUFBSTtBQUFBLFFBQ3ZELE9BQU8sWUFBVSxLQUFLLGFBQWEsUUFBUSxHQUFHO0FBQUEsTUFDL0MsQ0FBQztBQUFBLElBQ0Y7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBV0EsTUFBYyxhQUFhLFFBQTRCLFFBQTJDO0FBQ2pHLFFBQUksV0FBVyxRQUFRO0FBQ3RCLFlBQU0sS0FBSyxlQUFlLFdBQVcsTUFBTTtBQUMzQztBQUFBLElBQ0Q7QUFDQSxVQUFNLGNBQWMsS0FBSyxxQkFBcUIsVUFBVSxZQUFZLG9CQUFvQixFQUFFLEtBQUssT0FBSyxFQUFFLFNBQVMsTUFBTSxDQUFDO0FBQ3RILFFBQUksYUFBYTtBQUNoQixZQUFNLFlBQVksWUFBWSxRQUFRLEVBQUUsZUFBZSxLQUFLLENBQUM7QUFBQSxJQUM5RDtBQUNBLFVBQU0sS0FBSyxlQUFlLFdBQVcsTUFBTTtBQUFBLEVBQzVDO0FBQ0Q7QUExSU0sMkJBQU47QUFBQSxFQVVHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVpHO0FBNElOLGNBQWMscUJBQXFCLHdCQUF3QjtBQUUzRCxTQUFTLEdBQTJCLHdCQUF3QixhQUFhLEVBQUUsc0JBQXNCO0FBQUEsRUFDaEcsR0FBRztBQUFBLEVBQ0gsWUFBWTtBQUFBLElBQ1gsb0NBQW9DO0FBQUEsTUFDbkMsTUFBTSxDQUFDLFdBQVcsUUFBUTtBQUFBLE1BQzFCLE1BQU0sQ0FBQyxNQUFNLE9BQU8sVUFBVTtBQUFBLE1BQzlCLGtCQUFrQjtBQUFBLFFBQ2pCLFNBQVMsRUFBRSxTQUFTLENBQUMscUdBQXFHLEdBQUcsS0FBSyw4QkFBOEIsR0FBRyw4Q0FBOEM7QUFBQSxRQUNqTixTQUFTLEVBQUUsU0FBUyxDQUFDLHFHQUFxRyxHQUFHLEtBQUssK0JBQStCLEdBQUcsNkNBQTZDO0FBQUEsUUFDak4sU0FBUyxFQUFFLFNBQVMsQ0FBQyxxR0FBcUcsR0FBRyxLQUFLLGtDQUFrQyxHQUFHLHFFQUFxRTtBQUFBLE1BQzdPO0FBQUEsTUFDQSxTQUFTO0FBQUEsTUFDVCxZQUFZLEVBQUUsTUFBTSxVQUFVO0FBQUEsTUFDOUIsYUFBYTtBQUFBLFFBQ1osRUFBRSxTQUFTLENBQUMsd0NBQXdDLEdBQUcsS0FBSyx5QkFBeUI7QUFBQSxRQUNyRjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQSx3Q0FBd0M7QUFBQSxNQUN2QyxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxZQUFZLEVBQUUsTUFBTSxVQUFVO0FBQUEsTUFDOUIscUJBQXFCO0FBQUEsUUFDcEIsRUFBRSxTQUFTLENBQUMsd0NBQXdDLEdBQUcsS0FBSyw2QkFBNkI7QUFBQSxRQUN6RjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLGNBQWMsRUFBRSxTQUFTLEtBQUs7QUFBQSxJQUMvQjtBQUFBLElBQ0EsQ0FBQywrQkFBK0IsR0FBRztBQUFBLE1BQ2xDLE1BQU07QUFBQSxNQUNOLE1BQU0sQ0FBQyxlQUFlLGFBQWEsUUFBUTtBQUFBLE1BQzNDLGtCQUFrQjtBQUFBLFFBQ2pCLFNBQVMsRUFBRSxTQUFTLENBQUMsd0NBQXdDLEdBQUcsS0FBSyxzQ0FBc0MsR0FBRyw2REFBNkQ7QUFBQSxRQUMzSyxTQUFTLEVBQUUsU0FBUyxDQUFDLHdDQUF3QyxHQUFHLEtBQUssb0NBQW9DLEdBQUcsZ0tBQWdLO0FBQUEsUUFDNVEsU0FBUyxFQUFFLFNBQVMsQ0FBQyx3Q0FBd0MsR0FBRyxLQUFLLGlDQUFpQyxHQUFHLCtJQUErSTtBQUFBLE1BQ3pQO0FBQUEsTUFDQSxTQUFTO0FBQUEsTUFDVCxxQkFBcUI7QUFBQSxRQUNwQixFQUFFLFNBQVMsQ0FBQyx3Q0FBd0MsR0FBRyxLQUFLLDBCQUEwQjtBQUFBLFFBQ3RGO0FBQUEsTUFDRDtBQUFBLE1BQ0EsT0FBTyxtQkFBbUI7QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
