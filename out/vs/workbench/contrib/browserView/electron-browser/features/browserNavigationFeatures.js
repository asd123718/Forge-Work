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
import { $ } from "../../../../../base/browser/dom.js";
import { disposableTimeout } from "../../../../../base/common/async.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { KeyMod, KeyCode } from "../../../../../base/common/keyCodes.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { MenuWorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { HoverPosition } from "../../../../../base/browser/ui/hover/hoverWidget.js";
import { WorkbenchHoverDelegate } from "../../../../../platform/hover/browser/hover.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { BrowserViewCommandId } from "../../../../../platform/browserView/common/browserView.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IPreferencesService } from "../../../../services/preferences/common/preferences.js";
import { BrowserEditorInput } from "../../common/browserEditorInput.js";
import {
  BROWSER_SEARCH_NONE,
  BrowserSearchEngineSettingId,
  buildSearchUrl,
  getBrowserSearchEngineLabel,
  resolveAddressBarInputType
} from "../../common/browserSearch.js";
import {
  BROWSER_EDITOR_ACTIVE,
  BrowserActionCategory,
  BrowserActionGroup,
  BrowserEditor,
  BrowserEditorContribution,
  BrowserWidgetLocation,
  CONTEXT_BROWSER_FOCUSED,
  CONTEXT_BROWSER_HAS_URL
} from "../browserEditor.js";
import { BrowserUrlBarWidget } from "../widgets/browserUrlBarWidget.js";
const CONTEXT_BROWSER_CAN_GO_BACK = new RawContextKey("browserCanGoBack", false, localize("browser.canGoBack", "Whether the browser can go back"));
const CONTEXT_BROWSER_CAN_GO_FORWARD = new RawContextKey("browserCanGoForward", false, localize("browser.canGoForward", "Whether the browser can go forward"));
class BrowserNavigationBar extends Disposable {
  constructor(editor, instantiationService, scopedContextKeyService, _configurationService, _preferencesService) {
    super();
    this._configurationService = _configurationService;
    this._preferencesService = _preferencesService;
    this._contributionListeners = this._register(new DisposableStore());
    this._contributions = [];
    this.element = $(".browser-navbar");
    const hoverDelegate = this._register(
      instantiationService.createInstance(
        WorkbenchHoverDelegate,
        "element",
        void 0,
        { position: { hoverPosition: HoverPosition.ABOVE } }
      )
    );
    const scopedInstantiationService = instantiationService.createChild(new ServiceCollection(
      [IContextKeyService, scopedContextKeyService]
    ));
    const navContainer = $(".browser-nav-toolbar");
    this._navToolbar = this._register(scopedInstantiationService.createInstance(
      MenuWorkbenchToolBar,
      navContainer,
      MenuId.BrowserNavigationToolbar,
      {
        hoverDelegate,
        highlightToggledItems: true,
        actionViewItemProvider: (action, options) => {
          for (const contribution of this._contributions) {
            const viewItem = contribution.getActionViewItem(action, options, scopedInstantiationService);
            if (viewItem) {
              return viewItem;
            }
          }
          return void 0;
        },
        // Render all actions inline regardless of group.
        toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
        menuOptions: { shouldForwardArgs: true }
      }
    ));
    this._navToolbar.context = editor;
    const urlBarHost = {
      get input() {
        return editor.input instanceof BrowserEditorInput ? editor.input : void 0;
      },
      get isReadonly() {
        return editor.input instanceof BrowserEditorInput && editor.input.associatedResource !== void 0;
      },
      ensureBrowserFocus: () => editor.ensureBrowserFocus(),
      getPrimaryActions: (text) => this._resolvePrimaryActions(text),
      getPlaceholder: () => this._searchEngine ? localize({ key: "browser.urlOrSearchPlaceholder", comment: ["Placeholder text shown in the integrated browser's address (URL) bar when it is empty. The user can either type a search query to search the web, or type a URL to navigate to it."] }, "Search or enter URL") : localize("browser.urlPlaceholder", "Enter a URL")
    };
    this._urlBar = this._register(instantiationService.createInstance(BrowserUrlBarWidget, urlBarHost));
    const actionsContainer = $(".browser-actions-toolbar");
    const actionsToolbar = this._register(scopedInstantiationService.createInstance(
      MenuWorkbenchToolBar,
      actionsContainer,
      MenuId.BrowserActionsToolbar,
      {
        hoverDelegate,
        highlightToggledItems: true,
        toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
        menuOptions: { shouldForwardArgs: true },
        responsiveBehavior: {
          enabled: true,
          kind: "last",
          minItems: 0,
          // The URL bar is the flexible element, so the actions toolbar's own
          // element width does not reflect the room it could occupy.
          // So we pass manual calculations based on the navbar's overall width and the URL bar's width.
          observedElement: this.element,
          getAvailableWidth: () => {
            const toolbarBounds = this.element.getBoundingClientRect();
            const urlBarBounds = this._urlBar.element.getBoundingClientRect();
            return Math.max(
              0,
              toolbarBounds.right - urlBarBounds.left - 240
              /* approximate: preferred width of the URL input plus padding */
            );
          }
        }
      }
    ));
    actionsToolbar.context = editor;
    this.element.appendChild(navContainer);
    this.element.appendChild(this._urlBar.element);
    this.element.appendChild(actionsContainer);
  }
  refreshUrl() {
    this._urlBar.refreshUrl();
  }
  previewUrl(url) {
    this._urlBar.previewUrl(url);
  }
  focusUrlInput() {
    this._urlBar.focusUrlInput();
  }
  openUrlPicker() {
    this._urlBar.openUrlPicker();
  }
  clear() {
    this._urlBar.clear();
  }
  mountContributions(contributions) {
    this._contributions = contributions;
    this._contributionListeners.clear();
    for (const contribution of contributions) {
      this._contributionListeners.add(contribution.onDidChangeActionViewItems(() => this._navToolbar.refresh()));
    }
    this._navToolbar.refresh();
    this._urlBar.mountContributions(contributions);
  }
  /**
   * The configured address bar search engine, or `undefined` when search
   * routing is disabled (the setting is `'none'`).
   */
  get _searchEngine() {
    const value = this._configurationService.getValue(BrowserSearchEngineSettingId);
    return value && value !== BROWSER_SEARCH_NONE ? value : void 0;
  }
  /**
   * The URL bar's primary picker item(s) for the given text, mirroring
   * Chrome/Edge. With search enabled: a URL reads "{url}" (globe icon) first
   * with a search fallback after, a clear query reads "{query} - {engine}
   * Search" (search icon), and an ambiguous input offers both — Search first,
   * then Go to — so the user can pick. The destination URL is resolved here
   * (search text → search-engine URL) so {@link BrowserEditorInput.navigate}
   * receives a plain URL; the telemetry source is passed through so a
   * search-initiated navigation is tracked as such.
   */
  _resolvePrimaryActions(text) {
    const goTo = {
      id: text,
      label: text,
      iconClass: ThemeIcon.asClassName(Codicon.globe),
      apply: (input) => input.navigate(text)
    };
    const engineId = this._searchEngine;
    if (!engineId) {
      return [goTo];
    }
    const configureEngineButton = {
      id: "browser.configureSearchEngine",
      iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
      tooltip: localize("browser.configureSearchEngine", "Configure Search Engine"),
      run: () => void this._preferencesService.openSettings({ query: `@id:${BrowserSearchEngineSettingId}` })
    };
    const search = {
      id: text,
      label: localize("browser.searchFor", "{0} - {1} Search", text, getBrowserSearchEngineLabel(engineId)),
      iconClass: ThemeIcon.asClassName(Codicon.search),
      buttons: [configureEngineButton],
      apply: (input) => input.navigate(buildSearchUrl(text, engineId), { source: "searchInput" })
    };
    switch (resolveAddressBarInputType(text)) {
      case "url":
        return [goTo, search];
      case "query":
        return [search];
      default:
        return [search, goTo];
    }
  }
}
let BrowserNavigationFeatures = class extends BrowserEditorContribution {
  constructor(editor, instantiationService, contextKeyService, configurationService, preferencesService) {
    super(editor);
    this._pendingTryFocus = this._register(new MutableDisposable());
    /**
     * Whether a navigation has been initiated on the current tab. Once true,
     * an empty URL means "navigation in flight" rather than "fresh tab", so
     * {@link tryFocus} keeps focus on the page instead of reopening the picker.
     */
    this._hasInitiatedNavigation = false;
    this._navbar = this._register(new BrowserNavigationBar(editor, instantiationService, contextKeyService, configurationService, preferencesService));
    this._canGoBackContext = CONTEXT_BROWSER_CAN_GO_BACK.bindTo(contextKeyService);
    this._canGoForwardContext = CONTEXT_BROWSER_CAN_GO_FORWARD.bindTo(contextKeyService);
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(BrowserSearchEngineSettingId)) {
        this._navbar.refreshUrl();
      }
    }));
  }
  get widgets() {
    return [{ location: BrowserWidgetLocation.Toolbar, element: this._navbar.element, order: 0 }];
  }
  onContainerCreated() {
    const contributions = [];
    for (const contribution of this.editor.getContributions()) {
      if (contribution !== this) {
        contributions.push(contribution);
      }
    }
    this._navbar.mountContributions(contributions);
  }
  prerenderInput(_input) {
    this._navbar.refreshUrl();
    this._canGoBackContext.set(false);
    this._canGoForwardContext.set(false);
  }
  onModelAttached(model, store) {
    this._hasInitiatedNavigation = model.loading;
    this._updateFromModel(model);
    store.add(model.onDidNavigate(() => this._updateFromModel(model)));
    store.add(model.onWillNavigate((url) => {
      this._hasInitiatedNavigation = true;
      this._navbar.previewUrl(url);
    }));
  }
  onModelDetached() {
    this._hasInitiatedNavigation = false;
    this._navbar.clear();
    this._canGoBackContext.reset();
    this._canGoForwardContext.reset();
  }
  tryFocus() {
    const input = this.editor.input;
    this._pendingTryFocus.value = disposableTimeout(() => {
      if (this.editor.input !== input) {
        return;
      }
      const url = this.editor.model?.url ?? (input instanceof BrowserEditorInput ? input.url : void 0);
      if (!url && !this._hasInitiatedNavigation) {
        this._navbar.openUrlPicker();
      } else {
        this.editor.ensureBrowserFocus();
      }
    }, 0);
    return true;
  }
  _updateFromModel(model) {
    this._navbar.refreshUrl();
    this._canGoBackContext.set(model.canGoBack);
    this._canGoForwardContext.set(model.canGoForward);
  }
  focusUrlInput() {
    this._navbar.focusUrlInput();
  }
  openUrlPicker() {
    this._navbar.openUrlPicker();
  }
};
BrowserNavigationFeatures = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IPreferencesService)
], BrowserNavigationFeatures);
BrowserEditor.registerContribution(BrowserNavigationFeatures);
const _GoBackAction = class _GoBackAction extends Action2 {
  constructor() {
    super({
      id: _GoBackAction.ID,
      title: localize2("browser.goBackAction", "Go Back"),
      category: BrowserActionCategory,
      icon: Codicon.arrowLeft,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_CAN_GO_BACK),
      menu: {
        id: MenuId.BrowserNavigationToolbar,
        group: "navigation",
        order: 1
      },
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib + 50,
        primary: KeyMod.Alt | KeyCode.LeftArrow,
        secondary: [KeyCode.BrowserBack],
        mac: { primary: KeyMod.CtrlCmd | KeyCode.BracketLeft, secondary: [KeyCode.BrowserBack, KeyMod.CtrlCmd | KeyCode.LeftArrow] }
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      await browserEditor.model?.goBack();
    }
  }
};
_GoBackAction.ID = BrowserViewCommandId.GoBack;
let GoBackAction = _GoBackAction;
const _GoForwardAction = class _GoForwardAction extends Action2 {
  constructor() {
    super({
      id: _GoForwardAction.ID,
      title: localize2("browser.goForwardAction", "Go Forward"),
      category: BrowserActionCategory,
      icon: Codicon.arrowRight,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_CAN_GO_FORWARD),
      menu: {
        id: MenuId.BrowserNavigationToolbar,
        group: "navigation",
        order: 2
      },
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib + 50,
        primary: KeyMod.Alt | KeyCode.RightArrow,
        secondary: [KeyCode.BrowserForward],
        mac: { primary: KeyMod.CtrlCmd | KeyCode.BracketRight, secondary: [KeyCode.BrowserForward, KeyMod.CtrlCmd | KeyCode.RightArrow] }
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      await browserEditor.model?.goForward();
    }
  }
};
_GoForwardAction.ID = BrowserViewCommandId.GoForward;
let GoForwardAction = _GoForwardAction;
const _ReloadAction = class _ReloadAction extends Action2 {
  constructor() {
    super({
      id: _ReloadAction.ID,
      title: localize2("browser.reloadAction", "Reload"),
      category: BrowserActionCategory,
      icon: Codicon.refresh,
      f1: true,
      precondition: BROWSER_EDITOR_ACTIVE,
      menu: {
        id: MenuId.BrowserNavigationToolbar,
        group: "navigation",
        order: 3,
        alt: {
          id: HardReloadAction.ID,
          title: localize2("browser.hardReloadAction", "Hard Reload"),
          icon: Codicon.refresh
        }
      },
      keybinding: {
        when: CONTEXT_BROWSER_FOCUSED,
        weight: KeybindingWeight.WorkbenchContrib + 75,
        primary: KeyMod.CtrlCmd | KeyCode.KeyR,
        secondary: [KeyCode.F5],
        mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyR, secondary: [] }
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      await browserEditor.model?.reload();
    }
  }
};
_ReloadAction.ID = BrowserViewCommandId.Reload;
let ReloadAction = _ReloadAction;
const _HardReloadAction = class _HardReloadAction extends Action2 {
  constructor() {
    super({
      id: _HardReloadAction.ID,
      title: localize2("browser.hardReloadAction", "Hard Reload"),
      category: BrowserActionCategory,
      icon: Codicon.refresh,
      f1: true,
      precondition: BROWSER_EDITOR_ACTIVE,
      keybinding: {
        when: CONTEXT_BROWSER_FOCUSED,
        weight: KeybindingWeight.WorkbenchContrib + 75,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
        secondary: [KeyMod.CtrlCmd | KeyCode.F5],
        mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR, secondary: [] }
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      await browserEditor.model?.reload(true);
    }
  }
};
_HardReloadAction.ID = BrowserViewCommandId.HardReload;
let HardReloadAction = _HardReloadAction;
const _FocusUrlInputAction = class _FocusUrlInputAction extends Action2 {
  constructor() {
    super({
      id: _FocusUrlInputAction.ID,
      title: localize2("browser.focusUrlInputAction", "Focus URL Input"),
      category: BrowserActionCategory,
      f1: true,
      precondition: BROWSER_EDITOR_ACTIVE,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyL
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      browserEditor.getContribution(BrowserNavigationFeatures)?.openUrlPicker();
    }
  }
};
_FocusUrlInputAction.ID = BrowserViewCommandId.FocusUrlInput;
let FocusUrlInputAction = _FocusUrlInputAction;
const _OpenInExternalBrowserAction = class _OpenInExternalBrowserAction extends Action2 {
  constructor() {
    super({
      id: _OpenInExternalBrowserAction.ID,
      title: localize2("browser.openExternalAction", "Open in External Browser"),
      category: BrowserActionCategory,
      icon: Codicon.linkExternal,
      f1: true,
      // Note: We do allow opening in an external browser even if there is an error page shown
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL),
      menu: {
        id: MenuId.BrowserActionsToolbar,
        group: BrowserActionGroup.Tools,
        order: 10,
        isHiddenByDefault: true
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      const url = browserEditor.model?.url;
      if (url) {
        const openerService = accessor.get(IOpenerService);
        await openerService.open(url, {
          // ensures that VS Code itself doesn't try to open the URL, even for non-"http(s):" scheme URLs.
          openExternal: true,
          // ensures that the link isn't opened in Integrated Browser or other contributed external openers. False is the default, but just being explicit here.
          allowContributedOpeners: false
        });
      }
    }
  }
};
_OpenInExternalBrowserAction.ID = BrowserViewCommandId.OpenExternal;
let OpenInExternalBrowserAction = _OpenInExternalBrowserAction;
const _OpenBrowserSettingsAction = class _OpenBrowserSettingsAction extends Action2 {
  constructor() {
    super({
      id: _OpenBrowserSettingsAction.ID,
      title: localize2("browser.openSettingsAction", "Browser Settings"),
      category: BrowserActionCategory,
      icon: Codicon.settingsGear,
      f1: false,
      menu: {
        id: MenuId.BrowserActionsToolbar,
        group: BrowserActionGroup.Settings,
        order: 2,
        isHiddenByDefault: true
      }
    });
  }
  async run(accessor) {
    const preferencesService = accessor.get(IPreferencesService);
    await preferencesService.openSettings({ query: `@id:workbench.browser.*` });
  }
};
_OpenBrowserSettingsAction.ID = BrowserViewCommandId.OpenSettings;
let OpenBrowserSettingsAction = _OpenBrowserSettingsAction;
registerAction2(GoBackAction);
registerAction2(GoForwardAction);
registerAction2(ReloadAction);
registerAction2(HardReloadAction);
registerAction2(FocusUrlInputAction);
registerAction2(OpenInExternalBrowserAction);
registerAction2(OpenBrowserSettingsAction);
export {
  BrowserNavigationFeatures
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFxmZWF0dXJlc1xcYnJvd3Nlck5hdmlnYXRpb25GZWF0dXJlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgJCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgS2V5TW9kLCBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQnJvd3NlclZpZXdDb21tYW5kSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IElCcm93c2VyVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IEJyb3dzZXJFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9icm93c2VyRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHtcblx0QlJPV1NFUl9TRUFSQ0hfTk9ORSxcblx0QnJvd3NlclNlYXJjaEVuZ2luZUlkLFxuXHRCcm93c2VyU2VhcmNoRW5naW5lU2V0dGluZ0lkLFxuXHRidWlsZFNlYXJjaFVybCxcblx0Z2V0QnJvd3NlclNlYXJjaEVuZ2luZUxhYmVsLFxuXHRyZXNvbHZlQWRkcmVzc0JhcklucHV0VHlwZSxcbn0gZnJvbSAnLi4vLi4vY29tbW9uL2Jyb3dzZXJTZWFyY2guanMnO1xuaW1wb3J0IHtcblx0QlJPV1NFUl9FRElUT1JfQUNUSVZFLFxuXHRCcm93c2VyQWN0aW9uQ2F0ZWdvcnksXG5cdEJyb3dzZXJBY3Rpb25Hcm91cCxcblx0QnJvd3NlckVkaXRvcixcblx0QnJvd3NlckVkaXRvckNvbnRyaWJ1dGlvbixcblx0QnJvd3NlcldpZGdldExvY2F0aW9uLFxuXHRDT05URVhUX0JST1dTRVJfRk9DVVNFRCxcblx0Q09OVEVYVF9CUk9XU0VSX0hBU19VUkwsXG5cdElCcm93c2VyRWRpdG9yV2lkZ2V0LFxuXHRJQnJvd3NlclVybFN1Z2dlc3Rpb25BY3Rpb24sXG59IGZyb20gJy4uL2Jyb3dzZXJFZGl0b3IuanMnO1xuaW1wb3J0IHsgQnJvd3NlclVybEJhcldpZGdldCwgSUJyb3dzZXJVcmxCYXJIb3N0LCBJVXJsUGlja2VySXRlbSB9IGZyb20gJy4uL3dpZGdldHMvYnJvd3NlclVybEJhcldpZGdldC5qcyc7XG5cbmNvbnN0IENPTlRFWFRfQlJPV1NFUl9DQU5fR09fQkFDSyA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdicm93c2VyQ2FuR29CYWNrJywgZmFsc2UsIGxvY2FsaXplKCdicm93c2VyLmNhbkdvQmFjaycsIFwiV2hldGhlciB0aGUgYnJvd3NlciBjYW4gZ28gYmFja1wiKSk7XG5jb25zdCBDT05URVhUX0JST1dTRVJfQ0FOX0dPX0ZPUldBUkQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYnJvd3NlckNhbkdvRm9yd2FyZCcsIGZhbHNlLCBsb2NhbGl6ZSgnYnJvd3Nlci5jYW5Hb0ZvcndhcmQnLCBcIldoZXRoZXIgdGhlIGJyb3dzZXIgY2FuIGdvIGZvcndhcmRcIikpO1xuXG4vKipcbiAqIEJyb3dzZXIgbmF2aWdhdGlvbiBiYXIgd2lkZ2V0OiBuYXYgdG9vbGJhciAoYmFjay9mb3J3YXJkL2V0YyksIFVSTCBiYXJcbiAqIChkaXNwbGF5ICsgZWRpdGluZyBwaWNrZXIsIHNlZSB7QGxpbmsgQnJvd3NlclVybEJhcldpZGdldH0pLCBhY3Rpb25zIHRvb2xiYXIuXG4gKiBPd25lZCBieSB7QGxpbmsgQnJvd3Nlck5hdmlnYXRpb25GZWF0dXJlc30uXG4gKi9cbmNsYXNzIEJyb3dzZXJOYXZpZ2F0aW9uQmFyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF91cmxCYXI6IEJyb3dzZXJVcmxCYXJXaWRnZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX25hdlRvb2xiYXI6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250cmlidXRpb25MaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9jb250cmlidXRpb25zOiByZWFkb25seSBCcm93c2VyRWRpdG9yQ29udHJpYnV0aW9uW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IEJyb3dzZXJFZGl0b3IsXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRzY29wZWRDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJlZmVyZW5jZXNTZXJ2aWNlOiBJUHJlZmVyZW5jZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5lbGVtZW50ID0gJCgnLmJyb3dzZXItbmF2YmFyJyk7XG5cblx0XHRjb25zdCBob3ZlckRlbGVnYXRlID0gdGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0V29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSxcblx0XHRcdFx0J2VsZW1lbnQnLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHsgcG9zaXRpb246IHsgaG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5BQk9WRSB9IH1cblx0XHRcdClcblx0XHQpO1xuXG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSUNvbnRleHRLZXlTZXJ2aWNlLCBzY29wZWRDb250ZXh0S2V5U2VydmljZV1cblx0XHQpKTtcblxuXHRcdGNvbnN0IG5hdkNvbnRhaW5lciA9ICQoJy5icm93c2VyLW5hdi10b29sYmFyJyk7XG5cdFx0dGhpcy5fbmF2VG9vbGJhciA9IHRoaXMuX3JlZ2lzdGVyKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0TWVudVdvcmtiZW5jaFRvb2xCYXIsXG5cdFx0XHRuYXZDb250YWluZXIsXG5cdFx0XHRNZW51SWQuQnJvd3Nlck5hdmlnYXRpb25Ub29sYmFyLFxuXHRcdFx0e1xuXHRcdFx0XHRob3ZlckRlbGVnYXRlLFxuXHRcdFx0XHRoaWdobGlnaHRUb2dnbGVkSXRlbXM6IHRydWUsXG5cdFx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiB0aGlzLl9jb250cmlidXRpb25zKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB2aWV3SXRlbSA9IGNvbnRyaWJ1dGlvbi5nZXRBY3Rpb25WaWV3SXRlbShhY3Rpb24sIG9wdGlvbnMsIHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0XHRcdGlmICh2aWV3SXRlbSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdmlld0l0ZW07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdC8vIFJlbmRlciBhbGwgYWN0aW9ucyBpbmxpbmUgcmVnYXJkbGVzcyBvZiBncm91cC5cblx0XHRcdFx0dG9vbGJhck9wdGlvbnM6IHsgcHJpbWFyeUdyb3VwOiAoKSA9PiB0cnVlLCB1c2VTZXBhcmF0b3JzSW5QcmltYXJ5QWN0aW9uczogdHJ1ZSB9LFxuXHRcdFx0XHRtZW51T3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9XG5cdFx0XHR9XG5cdFx0KSk7XG5cdFx0dGhpcy5fbmF2VG9vbGJhci5jb250ZXh0ID0gZWRpdG9yO1xuXG5cdFx0Y29uc3QgdXJsQmFySG9zdDogSUJyb3dzZXJVcmxCYXJIb3N0ID0ge1xuXHRcdFx0Z2V0IGlucHV0KCkgeyByZXR1cm4gZWRpdG9yLmlucHV0IGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcklucHV0ID8gZWRpdG9yLmlucHV0IDogdW5kZWZpbmVkOyB9LFxuXHRcdFx0Z2V0IGlzUmVhZG9ubHkoKSB7IHJldHVybiBlZGl0b3IuaW5wdXQgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9ySW5wdXQgJiYgZWRpdG9yLmlucHV0LmFzc29jaWF0ZWRSZXNvdXJjZSAhPT0gdW5kZWZpbmVkOyB9LFxuXHRcdFx0ZW5zdXJlQnJvd3NlckZvY3VzOiAoKSA9PiBlZGl0b3IuZW5zdXJlQnJvd3NlckZvY3VzKCksXG5cdFx0XHRnZXRQcmltYXJ5QWN0aW9uczogKHRleHQpID0+IHRoaXMuX3Jlc29sdmVQcmltYXJ5QWN0aW9ucyh0ZXh0KSxcblx0XHRcdGdldFBsYWNlaG9sZGVyOiAoKSA9PiB0aGlzLl9zZWFyY2hFbmdpbmVcblx0XHRcdFx0PyBsb2NhbGl6ZSh7IGtleTogJ2Jyb3dzZXIudXJsT3JTZWFyY2hQbGFjZWhvbGRlcicsIGNvbW1lbnQ6IFsnUGxhY2Vob2xkZXIgdGV4dCBzaG93biBpbiB0aGUgaW50ZWdyYXRlZCBicm93c2VyXFwncyBhZGRyZXNzIChVUkwpIGJhciB3aGVuIGl0IGlzIGVtcHR5LiBUaGUgdXNlciBjYW4gZWl0aGVyIHR5cGUgYSBzZWFyY2ggcXVlcnkgdG8gc2VhcmNoIHRoZSB3ZWIsIG9yIHR5cGUgYSBVUkwgdG8gbmF2aWdhdGUgdG8gaXQuJ10gfSwgXCJTZWFyY2ggb3IgZW50ZXIgVVJMXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2Jyb3dzZXIudXJsUGxhY2Vob2xkZXInLCBcIkVudGVyIGEgVVJMXCIpLFxuXHRcdH07XG5cdFx0dGhpcy5fdXJsQmFyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnJvd3NlclVybEJhcldpZGdldCwgdXJsQmFySG9zdCkpO1xuXG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9ICQoJy5icm93c2VyLWFjdGlvbnMtdG9vbGJhcicpO1xuXHRcdGNvbnN0IGFjdGlvbnNUb29sYmFyID0gdGhpcy5fcmVnaXN0ZXIoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRNZW51V29ya2JlbmNoVG9vbEJhcixcblx0XHRcdGFjdGlvbnNDb250YWluZXIsXG5cdFx0XHRNZW51SWQuQnJvd3NlckFjdGlvbnNUb29sYmFyLFxuXHRcdFx0e1xuXHRcdFx0XHRob3ZlckRlbGVnYXRlLFxuXHRcdFx0XHRoaWdobGlnaHRUb2dnbGVkSXRlbXM6IHRydWUsXG5cdFx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHByaW1hcnlHcm91cDogKCkgPT4gdHJ1ZSwgdXNlU2VwYXJhdG9yc0luUHJpbWFyeUFjdGlvbnM6IHRydWUgfSxcblx0XHRcdFx0bWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHRcdFx0cmVzcG9uc2l2ZUJlaGF2aW9yOiB7XG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRraW5kOiAnbGFzdCcsXG5cdFx0XHRcdFx0bWluSXRlbXM6IDAsXG5cblx0XHRcdFx0XHQvLyBUaGUgVVJMIGJhciBpcyB0aGUgZmxleGlibGUgZWxlbWVudCwgc28gdGhlIGFjdGlvbnMgdG9vbGJhcidzIG93blxuXHRcdFx0XHRcdC8vIGVsZW1lbnQgd2lkdGggZG9lcyBub3QgcmVmbGVjdCB0aGUgcm9vbSBpdCBjb3VsZCBvY2N1cHkuXG5cdFx0XHRcdFx0Ly8gU28gd2UgcGFzcyBtYW51YWwgY2FsY3VsYXRpb25zIGJhc2VkIG9uIHRoZSBuYXZiYXIncyBvdmVyYWxsIHdpZHRoIGFuZCB0aGUgVVJMIGJhcidzIHdpZHRoLlxuXHRcdFx0XHRcdG9ic2VydmVkRWxlbWVudDogdGhpcy5lbGVtZW50LFxuXHRcdFx0XHRcdGdldEF2YWlsYWJsZVdpZHRoOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCB0b29sYmFyQm91bmRzID0gdGhpcy5lbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0XHRcdFx0Y29uc3QgdXJsQmFyQm91bmRzID0gdGhpcy5fdXJsQmFyLmVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gTWF0aC5tYXgoMCwgdG9vbGJhckJvdW5kcy5yaWdodCAtIHVybEJhckJvdW5kcy5sZWZ0IC0gMjQwIC8qIGFwcHJveGltYXRlOiBwcmVmZXJyZWQgd2lkdGggb2YgdGhlIFVSTCBpbnB1dCBwbHVzIHBhZGRpbmcgKi8pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHQpKTtcblx0XHRhY3Rpb25zVG9vbGJhci5jb250ZXh0ID0gZWRpdG9yO1xuXG5cdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKG5hdkNvbnRhaW5lcik7XG5cdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuX3VybEJhci5lbGVtZW50KTtcblx0XHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQoYWN0aW9uc0NvbnRhaW5lcik7XG5cdH1cblxuXHRyZWZyZXNoVXJsKCk6IHZvaWQgeyB0aGlzLl91cmxCYXIucmVmcmVzaFVybCgpOyB9XG5cdHByZXZpZXdVcmwodXJsOiBzdHJpbmcpOiB2b2lkIHsgdGhpcy5fdXJsQmFyLnByZXZpZXdVcmwodXJsKTsgfVxuXHRmb2N1c1VybElucHV0KCk6IHZvaWQgeyB0aGlzLl91cmxCYXIuZm9jdXNVcmxJbnB1dCgpOyB9XG5cdG9wZW5VcmxQaWNrZXIoKTogdm9pZCB7IHRoaXMuX3VybEJhci5vcGVuVXJsUGlja2VyKCk7IH1cblx0Y2xlYXIoKTogdm9pZCB7IHRoaXMuX3VybEJhci5jbGVhcigpOyB9XG5cblx0bW91bnRDb250cmlidXRpb25zKGNvbnRyaWJ1dGlvbnM6IHJlYWRvbmx5IEJyb3dzZXJFZGl0b3JDb250cmlidXRpb25bXSk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRyaWJ1dGlvbnMgPSBjb250cmlidXRpb25zO1xuXHRcdHRoaXMuX2NvbnRyaWJ1dGlvbkxpc3RlbmVycy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgY29udHJpYnV0aW9uIG9mIGNvbnRyaWJ1dGlvbnMpIHtcblx0XHRcdHRoaXMuX2NvbnRyaWJ1dGlvbkxpc3RlbmVycy5hZGQoY29udHJpYnV0aW9uLm9uRGlkQ2hhbmdlQWN0aW9uVmlld0l0ZW1zKCgpID0+IHRoaXMuX25hdlRvb2xiYXIucmVmcmVzaCgpKSk7XG5cdFx0fVxuXHRcdHRoaXMuX25hdlRvb2xiYXIucmVmcmVzaCgpO1xuXHRcdHRoaXMuX3VybEJhci5tb3VudENvbnRyaWJ1dGlvbnMoY29udHJpYnV0aW9ucyk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGNvbmZpZ3VyZWQgYWRkcmVzcyBiYXIgc2VhcmNoIGVuZ2luZSwgb3IgYHVuZGVmaW5lZGAgd2hlbiBzZWFyY2hcblx0ICogcm91dGluZyBpcyBkaXNhYmxlZCAodGhlIHNldHRpbmcgaXMgYCdub25lJ2ApLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXQgX3NlYXJjaEVuZ2luZSgpOiBCcm93c2VyU2VhcmNoRW5naW5lSWQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihCcm93c2VyU2VhcmNoRW5naW5lU2V0dGluZ0lkKTtcblx0XHRyZXR1cm4gdmFsdWUgJiYgdmFsdWUgIT09IEJST1dTRVJfU0VBUkNIX05PTkUgPyB2YWx1ZSBhcyBCcm93c2VyU2VhcmNoRW5naW5lSWQgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIFVSTCBiYXIncyBwcmltYXJ5IHBpY2tlciBpdGVtKHMpIGZvciB0aGUgZ2l2ZW4gdGV4dCwgbWlycm9yaW5nXG5cdCAqIENocm9tZS9FZGdlLiBXaXRoIHNlYXJjaCBlbmFibGVkOiBhIFVSTCByZWFkcyBcInt1cmx9XCIgKGdsb2JlIGljb24pIGZpcnN0XG5cdCAqIHdpdGggYSBzZWFyY2ggZmFsbGJhY2sgYWZ0ZXIsIGEgY2xlYXIgcXVlcnkgcmVhZHMgXCJ7cXVlcnl9IC0ge2VuZ2luZX1cblx0ICogU2VhcmNoXCIgKHNlYXJjaCBpY29uKSwgYW5kIGFuIGFtYmlndW91cyBpbnB1dCBvZmZlcnMgYm90aCBcdTIwMTQgU2VhcmNoIGZpcnN0LFxuXHQgKiB0aGVuIEdvIHRvIFx1MjAxNCBzbyB0aGUgdXNlciBjYW4gcGljay4gVGhlIGRlc3RpbmF0aW9uIFVSTCBpcyByZXNvbHZlZCBoZXJlXG5cdCAqIChzZWFyY2ggdGV4dCBcdTIxOTIgc2VhcmNoLWVuZ2luZSBVUkwpIHNvIHtAbGluayBCcm93c2VyRWRpdG9ySW5wdXQubmF2aWdhdGV9XG5cdCAqIHJlY2VpdmVzIGEgcGxhaW4gVVJMOyB0aGUgdGVsZW1ldHJ5IHNvdXJjZSBpcyBwYXNzZWQgdGhyb3VnaCBzbyBhXG5cdCAqIHNlYXJjaC1pbml0aWF0ZWQgbmF2aWdhdGlvbiBpcyB0cmFja2VkIGFzIHN1Y2guXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlUHJpbWFyeUFjdGlvbnModGV4dDogc3RyaW5nKTogSVVybFBpY2tlckl0ZW1bXSB7XG5cdFx0Y29uc3QgZ29UbzogSVVybFBpY2tlckl0ZW0gPSB7XG5cdFx0XHRpZDogdGV4dCxcblx0XHRcdGxhYmVsOiB0ZXh0LFxuXHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5nbG9iZSksXG5cdFx0XHRhcHBseTogaW5wdXQgPT4gaW5wdXQubmF2aWdhdGUodGV4dCksXG5cdFx0fTtcblx0XHRjb25zdCBlbmdpbmVJZCA9IHRoaXMuX3NlYXJjaEVuZ2luZTtcblx0XHRpZiAoIWVuZ2luZUlkKSB7XG5cdFx0XHRyZXR1cm4gW2dvVG9dO1xuXHRcdH1cblx0XHRjb25zdCBjb25maWd1cmVFbmdpbmVCdXR0b246IElCcm93c2VyVXJsU3VnZ2VzdGlvbkFjdGlvbiA9IHtcblx0XHRcdGlkOiAnYnJvd3Nlci5jb25maWd1cmVTZWFyY2hFbmdpbmUnLFxuXHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5zZXR0aW5nc0dlYXIpLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2Jyb3dzZXIuY29uZmlndXJlU2VhcmNoRW5naW5lJywgXCJDb25maWd1cmUgU2VhcmNoIEVuZ2luZVwiKSxcblx0XHRcdHJ1bjogKCkgPT4gdm9pZCB0aGlzLl9wcmVmZXJlbmNlc1NlcnZpY2Uub3BlblNldHRpbmdzKHsgcXVlcnk6IGBAaWQ6JHtCcm93c2VyU2VhcmNoRW5naW5lU2V0dGluZ0lkfWAgfSksXG5cdFx0fTtcblx0XHRjb25zdCBzZWFyY2g6IElVcmxQaWNrZXJJdGVtID0ge1xuXHRcdFx0aWQ6IHRleHQsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2Jyb3dzZXIuc2VhcmNoRm9yJywgXCJ7MH0gLSB7MX0gU2VhcmNoXCIsIHRleHQsIGdldEJyb3dzZXJTZWFyY2hFbmdpbmVMYWJlbChlbmdpbmVJZCkpLFxuXHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5zZWFyY2gpLFxuXHRcdFx0YnV0dG9uczogW2NvbmZpZ3VyZUVuZ2luZUJ1dHRvbl0sXG5cdFx0XHRhcHBseTogaW5wdXQgPT4gaW5wdXQubmF2aWdhdGUoYnVpbGRTZWFyY2hVcmwodGV4dCwgZW5naW5lSWQpLCB7IHNvdXJjZTogJ3NlYXJjaElucHV0JyB9KSxcblx0XHR9O1xuXHRcdHN3aXRjaCAocmVzb2x2ZUFkZHJlc3NCYXJJbnB1dFR5cGUodGV4dCkpIHtcblx0XHRcdGNhc2UgJ3VybCc6XG5cdFx0XHRcdC8vIExvb2tzIGxpa2UgYSBVUkw6IG5hdmlnYXRlIGZpcnN0LCBidXQgc3RpbGwgb2ZmZXIgc2VhcmNoIGFmdGVyLlxuXHRcdFx0XHRyZXR1cm4gW2dvVG8sIHNlYXJjaF07XG5cdFx0XHRjYXNlICdxdWVyeSc6XG5cdFx0XHRcdHJldHVybiBbc2VhcmNoXTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdC8vIEFtYmlndW91czogb2ZmZXIgYm90aCwgc2VhcmNoIGZpcnN0LlxuXHRcdFx0XHRyZXR1cm4gW3NlYXJjaCwgZ29Ub107XG5cdFx0fVxuXHR9XG59XG5cblxuLyoqXG4gKiBPd25zIHRoZSBuYXZiYXIgd2lkZ2V0IGFuZCB0aGUgbmF2aWdhdGlvbi1yZWxhdGVkIGNvbnRleHQga2V5cy4gTW91bnRzXG4gKiBzaWJsaW5nIFByZVVybC9Qb3N0VXJsIHdpZGdldHMgYW5kIFVSTCByZW5kZXJlcnMgaW50byB0aGUgbmF2YmFyLlxuICovXG5leHBvcnQgY2xhc3MgQnJvd3Nlck5hdmlnYXRpb25GZWF0dXJlcyBleHRlbmRzIEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX25hdmJhcjogQnJvd3Nlck5hdmlnYXRpb25CYXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhbkdvQmFja0NvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYW5Hb0ZvcndhcmRDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1RyeUZvY3VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIGEgbmF2aWdhdGlvbiBoYXMgYmVlbiBpbml0aWF0ZWQgb24gdGhlIGN1cnJlbnQgdGFiLiBPbmNlIHRydWUsXG5cdCAqIGFuIGVtcHR5IFVSTCBtZWFucyBcIm5hdmlnYXRpb24gaW4gZmxpZ2h0XCIgcmF0aGVyIHRoYW4gXCJmcmVzaCB0YWJcIiwgc29cblx0ICoge0BsaW5rIHRyeUZvY3VzfSBrZWVwcyBmb2N1cyBvbiB0aGUgcGFnZSBpbnN0ZWFkIG9mIHJlb3BlbmluZyB0aGUgcGlja2VyLlxuXHQgKi9cblx0cHJpdmF0ZSBfaGFzSW5pdGlhdGVkTmF2aWdhdGlvbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogQnJvd3NlckVkaXRvcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGVkaXRvcik7XG5cdFx0dGhpcy5fbmF2YmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJyb3dzZXJOYXZpZ2F0aW9uQmFyKGVkaXRvciwgaW5zdGFudGlhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgcHJlZmVyZW5jZXNTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fY2FuR29CYWNrQ29udGV4dCA9IENPTlRFWFRfQlJPV1NFUl9DQU5fR09fQkFDSy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2NhbkdvRm9yd2FyZENvbnRleHQgPSBDT05URVhUX0JST1dTRVJfQ0FOX0dPX0ZPUldBUkQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdC8vIEtlZXAgdGhlIFVSTCBiYXIgcHJlc2VudGF0aW9uIChwbGFjZWhvbGRlciwgcHJpbWFyeSBhY3Rpb24pIGluIHN5bmNcblx0XHQvLyB3aGVuIHRoZSB1c2VyIHRvZ2dsZXMgc2VhcmNoIHNldHRpbmdzIHdoaWxlIHRoZSBiYXIgaXMgdmlzaWJsZS5cblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihCcm93c2VyU2VhcmNoRW5naW5lU2V0dGluZ0lkKSkge1xuXHRcdFx0XHR0aGlzLl9uYXZiYXIucmVmcmVzaFVybCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCB3aWRnZXRzKCk6IHJlYWRvbmx5IElCcm93c2VyRWRpdG9yV2lkZ2V0W10ge1xuXHRcdHJldHVybiBbeyBsb2NhdGlvbjogQnJvd3NlcldpZGdldExvY2F0aW9uLlRvb2xiYXIsIGVsZW1lbnQ6IHRoaXMuX25hdmJhci5lbGVtZW50LCBvcmRlcjogMCB9XTtcblx0fVxuXG5cdG92ZXJyaWRlIG9uQ29udGFpbmVyQ3JlYXRlZCgpOiB2b2lkIHtcblx0XHRjb25zdCBjb250cmlidXRpb25zOiBCcm93c2VyRWRpdG9yQ29udHJpYnV0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiB0aGlzLmVkaXRvci5nZXRDb250cmlidXRpb25zKCkpIHtcblx0XHRcdGlmIChjb250cmlidXRpb24gIT09IHRoaXMpIHtcblx0XHRcdFx0Y29udHJpYnV0aW9ucy5wdXNoKGNvbnRyaWJ1dGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX25hdmJhci5tb3VudENvbnRyaWJ1dGlvbnMoY29udHJpYnV0aW9ucyk7XG5cdH1cblxuXHRvdmVycmlkZSBwcmVyZW5kZXJJbnB1dChfaW5wdXQ6IEJyb3dzZXJFZGl0b3JJbnB1dCk6IHZvaWQge1xuXHRcdHRoaXMuX25hdmJhci5yZWZyZXNoVXJsKCk7XG5cdFx0dGhpcy5fY2FuR29CYWNrQ29udGV4dC5zZXQoZmFsc2UpO1xuXHRcdHRoaXMuX2NhbkdvRm9yd2FyZENvbnRleHQuc2V0KGZhbHNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbk1vZGVsQXR0YWNoZWQobW9kZWw6IElCcm93c2VyVmlld01vZGVsLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdFx0Ly8gQSBtb2RlbCB0aGF0IGlzIGFscmVhZHkgbG9hZGluZyBvbiBhdHRhY2ggKGUuZy4gc3dpdGNoaW5nIGJhY2sgdG8gYVxuXHRcdC8vIHRhYiBtaWQtbmF2aWdhdGlvbikgY291bnRzIGFzIGhhdmluZyBpbml0aWF0ZWQgbmF2aWdhdGlvbi5cblx0XHR0aGlzLl9oYXNJbml0aWF0ZWROYXZpZ2F0aW9uID0gbW9kZWwubG9hZGluZztcblx0XHR0aGlzLl91cGRhdGVGcm9tTW9kZWwobW9kZWwpO1xuXHRcdHN0b3JlLmFkZChtb2RlbC5vbkRpZE5hdmlnYXRlKCgpID0+IHRoaXMuX3VwZGF0ZUZyb21Nb2RlbChtb2RlbCkpKTtcblx0XHRzdG9yZS5hZGQobW9kZWwub25XaWxsTmF2aWdhdGUodXJsID0+IHtcblx0XHRcdHRoaXMuX2hhc0luaXRpYXRlZE5hdmlnYXRpb24gPSB0cnVlO1xuXHRcdFx0dGhpcy5fbmF2YmFyLnByZXZpZXdVcmwodXJsKTtcblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBvbk1vZGVsRGV0YWNoZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5faGFzSW5pdGlhdGVkTmF2aWdhdGlvbiA9IGZhbHNlO1xuXHRcdHRoaXMuX25hdmJhci5jbGVhcigpO1xuXHRcdHRoaXMuX2NhbkdvQmFja0NvbnRleHQucmVzZXQoKTtcblx0XHR0aGlzLl9jYW5Hb0ZvcndhcmRDb250ZXh0LnJlc2V0KCk7XG5cdH1cblxuXHRvdmVycmlkZSB0cnlGb2N1cygpOiBib29sZWFuIHtcblx0XHRjb25zdCBpbnB1dCA9IHRoaXMuZWRpdG9yLmlucHV0O1xuXG5cdFx0Ly8gRGVmZXIgb25lIHRpY2sgc28gZWRpdG9yLXRhYiBhY3RpdmF0aW9uIGNhbiBmb2N1cyB0aGUgdGFiIGNvbnRyb2wgZmlyc3Q7XG5cdFx0Ly8gdGhlbiB3ZSBtb3ZlIGZvY3VzIGludG8gdGhlIGJyb3dzZXIgZWRpdG9yJ3MgVVJMIGZsb3cuXG5cdFx0dGhpcy5fcGVuZGluZ1RyeUZvY3VzLnZhbHVlID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuZWRpdG9yLmlucHV0ICE9PSBpbnB1dCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIEEgbmV3IHRhYiAobm8gVVJMIGxvYWRlZCkgYXV0by1vcGVucyB0aGUgcGlja2VyIHNvIHRoZSB1c2VyIGNhbiBpbW1lZGlhdGVseSB0eXBlIC8gYnJvd3NlIHN1Z2dlc3Rpb25zLlxuXHRcdFx0Ly8gT3RoZXJ3aXNlIHdlIG1vdmUgZm9jdXMgaW50byB0aGUgYnJvd3NlciBlZGl0b3Igc28gaXQgZG9lc24ndCBzdGF5IG9uIHRoZSB0YWIgY29udHJvbC5cblx0XHRcdGNvbnN0IHVybCA9IHRoaXMuZWRpdG9yLm1vZGVsPy51cmwgPz8gKGlucHV0IGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcklucHV0ID8gaW5wdXQudXJsIDogdW5kZWZpbmVkKTtcblx0XHRcdGlmICghdXJsICYmICF0aGlzLl9oYXNJbml0aWF0ZWROYXZpZ2F0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX25hdmJhci5vcGVuVXJsUGlja2VyKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmVkaXRvci5lbnN1cmVCcm93c2VyRm9jdXMoKTtcblx0XHRcdH1cblx0XHR9LCAwKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUZyb21Nb2RlbChtb2RlbDogSUJyb3dzZXJWaWV3TW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLl9uYXZiYXIucmVmcmVzaFVybCgpO1xuXHRcdHRoaXMuX2NhbkdvQmFja0NvbnRleHQuc2V0KG1vZGVsLmNhbkdvQmFjayk7XG5cdFx0dGhpcy5fY2FuR29Gb3J3YXJkQ29udGV4dC5zZXQobW9kZWwuY2FuR29Gb3J3YXJkKTtcblx0fVxuXG5cdGZvY3VzVXJsSW5wdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fbmF2YmFyLmZvY3VzVXJsSW5wdXQoKTtcblx0fVxuXG5cdG9wZW5VcmxQaWNrZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fbmF2YmFyLm9wZW5VcmxQaWNrZXIoKTtcblx0fVxufVxuXG5Ccm93c2VyRWRpdG9yLnJlZ2lzdGVyQ29udHJpYnV0aW9uKEJyb3dzZXJOYXZpZ2F0aW9uRmVhdHVyZXMpO1xuXG5jbGFzcyBHb0JhY2tBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gQnJvd3NlclZpZXdDb21tYW5kSWQuR29CYWNrO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBHb0JhY2tBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdicm93c2VyLmdvQmFja0FjdGlvbicsICdHbyBCYWNrJyksXG5cdFx0XHRjYXRlZ29yeTogQnJvd3NlckFjdGlvbkNhdGVnb3J5LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5hcnJvd0xlZnQsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEJST1dTRVJfRURJVE9SX0FDVElWRSwgQ09OVEVYVF9CUk9XU0VSX0NBTl9HT19CQUNLKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Ccm93c2VyTmF2aWdhdGlvblRvb2xiYXIsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0fSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyA1MCxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuTGVmdEFycm93LFxuXHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlDb2RlLkJyb3dzZXJCYWNrXSxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5CcmFja2V0TGVmdCwgc2Vjb25kYXJ5OiBbS2V5Q29kZS5Ccm93c2VyQmFjaywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkxlZnRBcnJvd10gfVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBicm93c2VyRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGJyb3dzZXJFZGl0b3IgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9yKSB7XG5cdFx0XHRhd2FpdCBicm93c2VyRWRpdG9yLm1vZGVsPy5nb0JhY2soKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgR29Gb3J3YXJkQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9IEJyb3dzZXJWaWV3Q29tbWFuZElkLkdvRm9yd2FyZDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogR29Gb3J3YXJkQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci5nb0ZvcndhcmRBY3Rpb24nLCAnR28gRm9yd2FyZCcpLFxuXHRcdFx0Y2F0ZWdvcnk6IEJyb3dzZXJBY3Rpb25DYXRlZ29yeSxcblx0XHRcdGljb246IENvZGljb24uYXJyb3dSaWdodCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQlJPV1NFUl9FRElUT1JfQUNUSVZFLCBDT05URVhUX0JST1dTRVJfQ0FOX0dPX0ZPUldBUkQpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkJyb3dzZXJOYXZpZ2F0aW9uVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHR9LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDUwLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5SaWdodEFycm93LFxuXHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlDb2RlLkJyb3dzZXJGb3J3YXJkXSxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5CcmFja2V0UmlnaHQsIHNlY29uZGFyeTogW0tleUNvZGUuQnJvd3NlckZvcndhcmQsIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5SaWdodEFycm93XSB9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGJyb3dzZXJFZGl0b3IgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoYnJvd3NlckVkaXRvciBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3IpIHtcblx0XHRcdGF3YWl0IGJyb3dzZXJFZGl0b3IubW9kZWw/LmdvRm9yd2FyZCgpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBSZWxvYWRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gQnJvd3NlclZpZXdDb21tYW5kSWQuUmVsb2FkO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBSZWxvYWRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdicm93c2VyLnJlbG9hZEFjdGlvbicsICdSZWxvYWQnKSxcblx0XHRcdGNhdGVnb3J5OiBCcm93c2VyQWN0aW9uQ2F0ZWdvcnksXG5cdFx0XHRpY29uOiBDb2RpY29uLnJlZnJlc2gsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQlJPV1NFUl9FRElUT1JfQUNUSVZFLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkJyb3dzZXJOYXZpZ2F0aW9uVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHRcdGFsdDoge1xuXHRcdFx0XHRcdGlkOiBIYXJkUmVsb2FkQWN0aW9uLklELFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIuaGFyZFJlbG9hZEFjdGlvbicsICdIYXJkIFJlbG9hZCcpLFxuXHRcdFx0XHRcdGljb246IENvZGljb24ucmVmcmVzaCxcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9CUk9XU0VSX0ZPQ1VTRUQsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgNzUsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlSLFxuXHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlDb2RlLkY1XSxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlSLCBzZWNvbmRhcnk6IFtdIH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYnJvd3NlckVkaXRvciA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChicm93c2VyRWRpdG9yIGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcikge1xuXHRcdFx0YXdhaXQgYnJvd3NlckVkaXRvci5tb2RlbD8ucmVsb2FkKCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEhhcmRSZWxvYWRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gQnJvd3NlclZpZXdDb21tYW5kSWQuSGFyZFJlbG9hZDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogSGFyZFJlbG9hZEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIuaGFyZFJlbG9hZEFjdGlvbicsICdIYXJkIFJlbG9hZCcpLFxuXHRcdFx0Y2F0ZWdvcnk6IEJyb3dzZXJBY3Rpb25DYXRlZ29yeSxcblx0XHRcdGljb246IENvZGljb24ucmVmcmVzaCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBCUk9XU0VSX0VESVRPUl9BQ1RJVkUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENPTlRFWFRfQlJPV1NFUl9GT0NVU0VELFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDc1LFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5Uixcblx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkY1XSxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlSLCBzZWNvbmRhcnk6IFtdIH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYnJvd3NlckVkaXRvciA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChicm93c2VyRWRpdG9yIGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcikge1xuXHRcdFx0YXdhaXQgYnJvd3NlckVkaXRvci5tb2RlbD8ucmVsb2FkKHRydWUpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBGb2N1c1VybElucHV0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9IEJyb3dzZXJWaWV3Q29tbWFuZElkLkZvY3VzVXJsSW5wdXQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEZvY3VzVXJsSW5wdXRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdicm93c2VyLmZvY3VzVXJsSW5wdXRBY3Rpb24nLCAnRm9jdXMgVVJMIElucHV0JyksXG5cdFx0XHRjYXRlZ29yeTogQnJvd3NlckFjdGlvbkNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IEJST1dTRVJfRURJVE9SX0FDVElWRSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlMLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBicm93c2VyRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGJyb3dzZXJFZGl0b3IgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9yKSB7XG5cdFx0XHRicm93c2VyRWRpdG9yLmdldENvbnRyaWJ1dGlvbihCcm93c2VyTmF2aWdhdGlvbkZlYXR1cmVzKT8ub3BlblVybFBpY2tlcigpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBPcGVuSW5FeHRlcm5hbEJyb3dzZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gQnJvd3NlclZpZXdDb21tYW5kSWQuT3BlbkV4dGVybmFsO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBPcGVuSW5FeHRlcm5hbEJyb3dzZXJBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdicm93c2VyLm9wZW5FeHRlcm5hbEFjdGlvbicsICdPcGVuIGluIEV4dGVybmFsIEJyb3dzZXInKSxcblx0XHRcdGNhdGVnb3J5OiBCcm93c2VyQWN0aW9uQ2F0ZWdvcnksXG5cdFx0XHRpY29uOiBDb2RpY29uLmxpbmtFeHRlcm5hbCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Ly8gTm90ZTogV2UgZG8gYWxsb3cgb3BlbmluZyBpbiBhbiBleHRlcm5hbCBicm93c2VyIGV2ZW4gaWYgdGhlcmUgaXMgYW4gZXJyb3IgcGFnZSBzaG93blxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQlJPV1NFUl9FRElUT1JfQUNUSVZFLCBDT05URVhUX0JST1dTRVJfSEFTX1VSTCksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQnJvd3NlckFjdGlvbnNUb29sYmFyLFxuXHRcdFx0XHRncm91cDogQnJvd3NlckFjdGlvbkdyb3VwLlRvb2xzLFxuXHRcdFx0XHRvcmRlcjogMTAsXG5cdFx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBicm93c2VyRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGJyb3dzZXJFZGl0b3IgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9yKSB7XG5cdFx0XHRjb25zdCB1cmwgPSBicm93c2VyRWRpdG9yLm1vZGVsPy51cmw7XG5cdFx0XHRpZiAodXJsKSB7XG5cdFx0XHRcdGNvbnN0IG9wZW5lclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU9wZW5lclNlcnZpY2UpO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXJTZXJ2aWNlLm9wZW4odXJsLCB7XG5cdFx0XHRcdFx0Ly8gZW5zdXJlcyB0aGF0IFZTIENvZGUgaXRzZWxmIGRvZXNuJ3QgdHJ5IHRvIG9wZW4gdGhlIFVSTCwgZXZlbiBmb3Igbm9uLVwiaHR0cChzKTpcIiBzY2hlbWUgVVJMcy5cblx0XHRcdFx0XHRvcGVuRXh0ZXJuYWw6IHRydWUsXG5cdFx0XHRcdFx0Ly8gZW5zdXJlcyB0aGF0IHRoZSBsaW5rIGlzbid0IG9wZW5lZCBpbiBJbnRlZ3JhdGVkIEJyb3dzZXIgb3Igb3RoZXIgY29udHJpYnV0ZWQgZXh0ZXJuYWwgb3BlbmVycy4gRmFsc2UgaXMgdGhlIGRlZmF1bHQsIGJ1dCBqdXN0IGJlaW5nIGV4cGxpY2l0IGhlcmUuXG5cdFx0XHRcdFx0YWxsb3dDb250cmlidXRlZE9wZW5lcnM6IGZhbHNlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBPcGVuQnJvd3NlclNldHRpbmdzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9IEJyb3dzZXJWaWV3Q29tbWFuZElkLk9wZW5TZXR0aW5ncztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3BlbkJyb3dzZXJTZXR0aW5nc0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIub3BlblNldHRpbmdzQWN0aW9uJywgJ0Jyb3dzZXIgU2V0dGluZ3MnKSxcblx0XHRcdGNhdGVnb3J5OiBCcm93c2VyQWN0aW9uQ2F0ZWdvcnksXG5cdFx0XHRpY29uOiBDb2RpY29uLnNldHRpbmdzR2Vhcixcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Ccm93c2VyQWN0aW9uc1Rvb2xiYXIsXG5cdFx0XHRcdGdyb3VwOiBCcm93c2VyQWN0aW9uR3JvdXAuU2V0dGluZ3MsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZSxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByZWZlcmVuY2VzU2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKTtcblx0XHRhd2FpdCBwcmVmZXJlbmNlc1NlcnZpY2Uub3BlblNldHRpbmdzKHsgcXVlcnk6IGBAaWQ6d29ya2JlbmNoLmJyb3dzZXIuKmAgfSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKEdvQmFja0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoR29Gb3J3YXJkQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihSZWxvYWRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEhhcmRSZWxvYWRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEZvY3VzVXJsSW5wdXRBY3Rpb24pO1xuXG5yZWdpc3RlckFjdGlvbjIoT3BlbkluRXh0ZXJuYWxCcm93c2VyQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihPcGVuQnJvd3NlclNldHRpbmdzQWN0aW9uKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFNBQVM7QUFDbEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxZQUFZLGlCQUFpQix5QkFBeUI7QUFDL0QsU0FBUyxlQUFlO0FBQ3hCLFNBQVMs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
