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
import { localize, localize2 } from "../../../../nls.js";
import { KeyMod, KeyChord, KeyCode } from "../../../../base/common/keyCodes.js";
import { MenuRegistry, MenuId, Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { equalsIgnoreCase } from "../../../../base/common/strings.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { IWorkbenchThemeService, ThemeSettings, ThemeSettingDefaults } from "../../../services/themes/common/workbenchThemeService.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { IExtensionGalleryService, IExtensionManagementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { Extensions as ColorRegistryExtensions } from "../../../../platform/theme/common/colorRegistry.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { Color } from "../../../../base/common/color.js";
import { ColorScheme, isHighContrast } from "../../../../platform/theme/common/theme.js";
import { colorThemeSchemaId } from "../../../services/themes/common/colorThemeSchema.js";
import { isCancellationError, onUnexpectedError } from "../../../../base/common/errors.js";
import { IQuickInputService, QuickInputButtonLocation } from "../../../../platform/quickinput/common/quickInput.js";
import { DEFAULT_PRODUCT_ICON_THEME_ID, ProductIconThemeData } from "../../../services/themes/browser/productIconThemeData.js";
import { ThrottledDelayer } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Emitter } from "../../../../base/common/event.js";
import { IExtensionResourceLoaderService } from "../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { FileIconThemeData } from "../../../services/themes/browser/fileIconThemeData.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
const manageExtensionIcon = registerIcon("theme-selection-manage-extension", Codicon.gear, localize("manageExtensionIcon", "Icon for the 'Manage' action in the theme selection quick pick."));
var ConfigureItem = /* @__PURE__ */ ((ConfigureItem2) => {
  ConfigureItem2["BROWSE_GALLERY"] = "marketplace";
  ConfigureItem2["EXTENSIONS_VIEW"] = "extensions";
  ConfigureItem2["CUSTOM_TOP_ENTRY"] = "customTopEntry";
  return ConfigureItem2;
})(ConfigureItem || {});
let MarketplaceThemesPicker = class {
  constructor(getMarketplaceColorThemes, marketplaceQuery, extensionGalleryService, extensionManagementService, quickInputService, logService, progressService, extensionsWorkbenchService, dialogService, environmentService) {
    this.getMarketplaceColorThemes = getMarketplaceColorThemes;
    this.marketplaceQuery = marketplaceQuery;
    this.extensionGalleryService = extensionGalleryService;
    this.extensionManagementService = extensionManagementService;
    this.quickInputService = quickInputService;
    this.logService = logService;
    this.progressService = progressService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.dialogService = dialogService;
    this.environmentService = environmentService;
    this._marketplaceExtensions = /* @__PURE__ */ new Set();
    this._marketplaceThemes = [];
    this._searchOngoing = false;
    this._searchError = void 0;
    this._onDidChange = new Emitter();
    this._queryDelayer = new ThrottledDelayer(200);
    this._installedExtensions = extensionManagementService.getInstalled().then((installed) => {
      const result = /* @__PURE__ */ new Set();
      for (const ext of installed) {
        result.add(ext.identifier.id);
      }
      return result;
    });
  }
  get themes() {
    return this._marketplaceThemes;
  }
  get onDidChange() {
    return this._onDidChange.event;
  }
  trigger(value) {
    if (this._tokenSource) {
      this._tokenSource.cancel();
      this._tokenSource = void 0;
    }
    this._queryDelayer.trigger(() => {
      this._tokenSource = new CancellationTokenSource();
      return this.doSearch(value, this._tokenSource.token);
    });
  }
  async doSearch(value, token) {
    this._searchOngoing = true;
    this._onDidChange.fire();
    try {
      const installedExtensions = await this._installedExtensions;
      const options = { text: `${this.marketplaceQuery} ${value}`, pageSize: 20 };
      const pager = await this.extensionGalleryService.query(options, token);
      for (let i = 0; i < pager.total && i < 1; i++) {
        if (token.isCancellationRequested) {
          break;
        }
        const nThemes = this._marketplaceThemes.length;
        const gallery = i === 0 ? pager.firstPage : await pager.getPage(i, token);
        const promises = [];
        const promisesGalleries = [];
        for (let i2 = 0; i2 < gallery.length; i2++) {
          if (token.isCancellationRequested) {
            break;
          }
          const ext = gallery[i2];
          if (this.environmentService.isSessionsWindow && ext.properties.executesCode) {
            continue;
          }
          if (!installedExtensions.has(ext.identifier.id) && !this._marketplaceExtensions.has(ext.identifier.id)) {
            this._marketplaceExtensions.add(ext.identifier.id);
            promises.push(this.getMarketplaceColorThemes(ext.publisher, ext.name, ext.version));
            promisesGalleries.push(ext);
          }
        }
        const allThemes = await Promise.all(promises);
        for (let i2 = 0; i2 < allThemes.length; i2++) {
          const ext = promisesGalleries[i2];
          for (const theme of allThemes[i2]) {
            this._marketplaceThemes.push({ id: theme.id, theme, label: theme.label, description: `${ext.displayName} \xB7 ${ext.publisherDisplayName}`, galleryExtension: ext, buttons: [configureButton] });
          }
        }
        if (nThemes !== this._marketplaceThemes.length) {
          this._marketplaceThemes.sort((t1, t2) => t1.label.localeCompare(t2.label));
          this._onDidChange.fire();
        }
      }
    } catch (e) {
      if (!isCancellationError(e)) {
        this.logService.error(`Error while searching for themes:`, e);
        this._searchError = "message" in e ? e.message : String(e);
      }
    } finally {
      this._searchOngoing = false;
      this._onDidChange.fire();
    }
  }
  openQuickPick(value, currentTheme, selectTheme) {
    let result = void 0;
    const disposables = new DisposableStore();
    return new Promise((s, _) => {
      const quickpick = disposables.add(this.quickInputService.createQuickPick());
      quickpick.items = [];
      quickpick.sortByLabel = false;
      quickpick.matchOnDescription = true;
      quickpick.buttons = [this.quickInputService.backButton];
      quickpick.title = "Marketplace Themes";
      quickpick.placeholder = localize("themes.selectMarketplaceTheme", "Type to Search More. Select to Install. Up/Down Keys to Preview");
      quickpick.canSelectMany = false;
      disposables.add(quickpick.onDidChangeValue(() => this.trigger(quickpick.value)));
      disposables.add(quickpick.onDidAccept(async (_2) => {
        const themeItem = quickpick.selectedItems[0];
        if (themeItem?.galleryExtension) {
          result = "selected";
          quickpick.hide();
          const success = await this.installExtension(themeItem.galleryExtension);
          if (success) {
            selectTheme(themeItem.theme, true);
          } else {
            selectTheme(currentTheme, true);
          }
        }
      }));
      disposables.add(quickpick.onDidTriggerItemButton((e) => {
        if (isItem(e.item)) {
          const extensionId = e.item.theme?.extensionData?.extensionId;
          if (extensionId) {
            this.extensionsWorkbenchService.openSearch(`@id:${extensionId}`);
          } else {
            this.extensionsWorkbenchService.openSearch(`${this.marketplaceQuery} ${quickpick.value}`);
          }
        }
      }));
      disposables.add(quickpick.onDidChangeActive((themes) => {
        if (result === void 0) {
          selectTheme(themes[0]?.theme, false);
        }
      }));
      disposables.add(quickpick.onDidHide(() => {
        if (result === void 0) {
          selectTheme(currentTheme, true);
          result = "cancelled";
        }
        s(result);
      }));
      disposables.add(quickpick.onDidTriggerButton((e) => {
        if (e === this.quickInputService.backButton) {
          result = "back";
          quickpick.hide();
        }
      }));
      disposables.add(this.onDidChange(() => {
        let items = this.themes;
        if (this._searchOngoing) {
          items = items.concat({ label: "$(loading~spin) Searching for themes...", id: void 0, alwaysShow: true });
        } else if (items.length === 0 && this._searchError) {
          items = [{ label: `$(error) ${localize("search.error", "Error while searching for themes: {0}", this._searchError)}`, id: void 0, alwaysShow: true }];
        }
        const activeItemId = quickpick.activeItems[0]?.id;
        const newActiveItem = activeItemId ? items.find((i) => isItem(i) && i.id === activeItemId) : void 0;
        quickpick.items = items;
        if (newActiveItem) {
          quickpick.activeItems = [newActiveItem];
        }
      }));
      this.trigger(value);
      quickpick.show();
    }).finally(() => {
      disposables.dispose();
    });
  }
  async installExtension(galleryExtension) {
    this.extensionsWorkbenchService.openSearch(`@id:${galleryExtension.identifier.id}`);
    const result = await this.dialogService.confirm({
      message: localize("installExtension.confirm", "This will install extension '{0}' published by '{1}'. Do you want to continue?", galleryExtension.displayName, galleryExtension.publisherDisplayName),
      primaryButton: localize("installExtension.button.ok", "OK")
    });
    if (!result.confirmed) {
      return false;
    }
    try {
      await this.progressService.withProgress({
        location: ProgressLocation.Notification,
        title: localize("installing extensions", "Installing Extension {0}...", galleryExtension.displayName)
      }, async () => {
        await this.extensionManagementService.installFromGallery(galleryExtension, {
          // Setting this to false is how you get the extension to be synced with Settings Sync (if enabled).
          isMachineScoped: false
        });
      });
      return true;
    } catch (e) {
      this.logService.error(`Problem installing extension ${galleryExtension.identifier.id}`, e);
      return false;
    }
  }
  dispose() {
    if (this._tokenSource) {
      this._tokenSource.cancel();
      this._tokenSource = void 0;
    }
    this._queryDelayer.dispose();
    this._marketplaceExtensions.clear();
    this._marketplaceThemes.length = 0;
    this._onDidChange.dispose();
  }
};
MarketplaceThemesPicker = __decorateClass([
  __decorateParam(2, IExtensionGalleryService),
  __decorateParam(3, IExtensionManagementService),
  __decorateParam(4, IQuickInputService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IProgressService),
  __decorateParam(7, IExtensionsWorkbenchService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IWorkbenchEnvironmentService)
], MarketplaceThemesPicker);
let InstalledThemesPicker = class {
  constructor(options, setTheme, getMarketplaceColorThemes, quickInputService, extensionGalleryService, extensionsWorkbenchService, extensionResourceLoaderService, instantiationService) {
    this.options = options;
    this.setTheme = setTheme;
    this.getMarketplaceColorThemes = getMarketplaceColorThemes;
    this.quickInputService = quickInputService;
    this.extensionGalleryService = extensionGalleryService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionResourceLoaderService = extensionResourceLoaderService;
    this.instantiationService = instantiationService;
  }
  async openQuickPick(picks, currentTheme) {
    let marketplaceThemePicker;
    if (this.extensionGalleryService.isEnabled()) {
      if (await this.extensionResourceLoaderService.supportsExtensionGalleryResources() && this.options.browseMessage) {
        marketplaceThemePicker = this.instantiationService.createInstance(MarketplaceThemesPicker, this.getMarketplaceColorThemes.bind(this), this.options.marketplaceTag);
        picks = [configurationEntry(this.options.browseMessage, "marketplace" /* BROWSE_GALLERY */), ...picks];
      } else {
        picks = [...picks, { type: "separator" }, configurationEntry(this.options.installMessage, "extensions" /* EXTENSIONS_VIEW */)];
      }
    }
    let selectThemeTimeout;
    const selectTheme = (theme, applyTheme) => {
      if (selectThemeTimeout) {
        clearTimeout(selectThemeTimeout);
      }
      selectThemeTimeout = mainWindow.setTimeout(() => {
        selectThemeTimeout = void 0;
        const newTheme = theme ?? currentTheme;
        this.setTheme(newTheme, applyTheme ? "auto" : "preview").then(
          void 0,
          (err) => {
            onUnexpectedError(err);
            this.setTheme(currentTheme, void 0);
          }
        );
      }, applyTheme ? 0 : 200);
    };
    const pickInstalledThemes = (activeItemId) => {
      const disposables = new DisposableStore();
      return new Promise((s, _) => {
        let isCompleted = false;
        const autoFocusIndex = picks.findIndex((p) => isItem(p) && p.id === activeItemId);
        const quickpick = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
        quickpick.items = picks;
        quickpick.title = this.options.title;
        quickpick.description = this.options.description;
        quickpick.placeholder = this.options.placeholderMessage;
        quickpick.activeItems = [picks[autoFocusIndex]];
        quickpick.canSelectMany = false;
        quickpick.buttons = this.options.buttons ?? [];
        disposables.add(quickpick.onDidTriggerButton((button) => this.options.onButton?.(button, quickpick)));
        quickpick.matchOnDescription = true;
        disposables.add(quickpick.onDidAccept(async (_2) => {
          isCompleted = true;
          const theme = quickpick.selectedItems[0];
          if (!theme || theme.configureItem) {
            if (!theme || theme.configureItem === "extensions" /* EXTENSIONS_VIEW */) {
              this.extensionsWorkbenchService.openSearch(`${this.options.marketplaceTag} ${quickpick.value}`);
            } else if (theme.configureItem === "marketplace" /* BROWSE_GALLERY */) {
              if (marketplaceThemePicker) {
                const res = await marketplaceThemePicker.openQuickPick(quickpick.value, currentTheme, selectTheme);
                if (res === "back") {
                  await pickInstalledThemes(void 0);
                }
              }
            }
          } else {
            selectTheme(theme.theme, true);
          }
          quickpick.hide();
          s();
        }));
        disposables.add(quickpick.onDidChangeActive((themes) => selectTheme(themes[0]?.theme, false)));
        disposables.add(quickpick.onDidHide(() => {
          if (!isCompleted) {
            selectTheme(currentTheme, true);
            s();
          }
          quickpick.dispose();
        }));
        disposables.add(quickpick.onDidTriggerItemButton((e) => {
          if (isItem(e.item)) {
            const extensionId = e.item.theme?.extensionData?.extensionId;
            if (extensionId) {
              this.extensionsWorkbenchService.openSearch(`@id:${extensionId}`);
            } else {
              this.extensionsWorkbenchService.openSearch(`${this.options.marketplaceTag} ${quickpick.value}`);
            }
          }
        }));
        quickpick.show();
      }).finally(() => {
        disposables.dispose();
      });
    };
    await pickInstalledThemes(currentTheme.id);
    marketplaceThemePicker?.dispose();
  }
};
InstalledThemesPicker = __decorateClass([
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, IExtensionGalleryService),
  __decorateParam(5, IExtensionsWorkbenchService),
  __decorateParam(6, IExtensionResourceLoaderService),
  __decorateParam(7, IInstantiationService)
], InstalledThemesPicker);
const SelectColorThemeCommandId = "workbench.action.selectTheme";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: SelectColorThemeCommandId,
      title: localize2("selectTheme.label", "Color Theme"),
      category: Categories.Preferences,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyT)
      }
    });
  }
  getTitle(colorScheme) {
    switch (colorScheme) {
      case ColorScheme.DARK:
        return localize("themes.selectTheme.darkScheme", "Select Color Theme for System Dark Mode");
      case ColorScheme.LIGHT:
        return localize("themes.selectTheme.lightScheme", "Select Color Theme for System Light Mode");
      case ColorScheme.HIGH_CONTRAST_DARK:
        return localize("themes.selectTheme.darkHC", "Select Color Theme for High Contrast Dark Mode");
      case ColorScheme.HIGH_CONTRAST_LIGHT:
        return localize("themes.selectTheme.lightHC", "Select Color Theme for High Contrast Light Mode");
      default:
        return localize("themes.selectTheme.default", "Select Color Theme (detect system color mode disabled)");
    }
  }
  async run(accessor) {
    const themeService = accessor.get(IWorkbenchThemeService);
    const preferencesService = accessor.get(IPreferencesService);
    const preferredColorScheme = themeService.getPreferredColorScheme();
    const modeConfigureButton = {
      tooltip: preferredColorScheme ? localize("themes.configure.switchingEnabled", "Detect system color mode enabled. Click to configure.") : localize("themes.configure.switchingDisabled", "Detect system color mode disabled. Click to configure."),
      iconClass: ThemeIcon.asClassName(Codicon.colorMode),
      location: QuickInputButtonLocation.Inline
    };
    const options = {
      installMessage: localize("installColorThemes", "Install Additional Color Themes..."),
      browseMessage: "$(plus) " + localize("browseColorThemes", "Browse Additional Color Themes..."),
      placeholderMessage: this.getTitle(preferredColorScheme),
      marketplaceTag: "category:themes",
      buttons: [modeConfigureButton],
      onButton: async (_button, picker2) => {
        picker2.hide();
        await preferencesService.openSettings({ query: ThemeSettings.DETECT_COLOR_SCHEME });
      }
    };
    const setTheme = (theme, settingsTarget) => themeService.setColorTheme(theme, settingsTarget);
    const getMarketplaceColorThemes = (publisher, name, version) => themeService.getMarketplaceColorThemes(publisher, name, version);
    const instantiationService = accessor.get(IInstantiationService);
    const picker = instantiationService.createInstance(InstalledThemesPicker, options, setTheme, getMarketplaceColorThemes);
    const themes = await themeService.getColorThemes();
    const currentTheme = themeService.getColorTheme();
    const lightEntries = toEntries(themes.filter((t) => t.type === ColorScheme.LIGHT), localize("themes.category.light", "light themes"));
    const darkEntries = toEntries(themes.filter((t) => t.type === ColorScheme.DARK), localize("themes.category.dark", "dark themes"));
    const hcEntries = toEntries(themes.filter((t) => isHighContrast(t.type)), localize("themes.category.hc", "high contrast themes"));
    let picks;
    switch (preferredColorScheme) {
      case ColorScheme.DARK:
        picks = [...darkEntries, ...lightEntries, ...hcEntries];
        break;
      case ColorScheme.HIGH_CONTRAST_DARK:
      case ColorScheme.HIGH_CONTRAST_LIGHT:
        picks = [...hcEntries, ...lightEntries, ...darkEntries];
        break;
      case ColorScheme.LIGHT:
      default:
        picks = [...lightEntries, ...darkEntries, ...hcEntries];
        break;
    }
    await picker.openQuickPick(picks, currentTheme);
  }
});
const SelectFileIconThemeCommandId = "workbench.action.selectIconTheme";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: SelectFileIconThemeCommandId,
      title: localize2("selectIconTheme.label", "File Icon Theme"),
      category: Categories.Preferences,
      f1: true
    });
  }
  async run(accessor) {
    const themeService = accessor.get(IWorkbenchThemeService);
    const options = {
      installMessage: localize("installIconThemes", "Install Additional File Icon Themes..."),
      placeholderMessage: localize("themes.selectIconTheme", "Select File Icon Theme (Up/Down Keys to Preview)"),
      marketplaceTag: "tag:icon-theme"
    };
    const setTheme = (theme, settingsTarget) => themeService.setFileIconTheme(theme, settingsTarget);
    const getMarketplaceColorThemes = (publisher, name, version) => themeService.getMarketplaceFileIconThemes(publisher, name, version);
    const instantiationService = accessor.get(IInstantiationService);
    const picker = instantiationService.createInstance(InstalledThemesPicker, options, setTheme, getMarketplaceColorThemes);
    const picks = [
      { type: "separator", label: localize("fileIconThemeCategory", "file icon themes") },
      { id: "", theme: FileIconThemeData.noIconTheme, label: localize("noIconThemeLabel", "None"), description: localize("noIconThemeDesc", "Disable File Icons") },
      ...toEntries(await themeService.getFileIconThemes())
    ];
    await picker.openQuickPick(picks, themeService.getFileIconTheme());
  }
});
const SelectProductIconThemeCommandId = "workbench.action.selectProductIconTheme";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: SelectProductIconThemeCommandId,
      title: localize2("selectProductIconTheme.label", "Product Icon Theme"),
      category: Categories.Preferences,
      f1: true
    });
  }
  async run(accessor) {
    const themeService = accessor.get(IWorkbenchThemeService);
    const options = {
      installMessage: localize("installProductIconThemes", "Install Additional Product Icon Themes..."),
      browseMessage: "$(plus) " + localize("browseProductIconThemes", "Browse Additional Product Icon Themes..."),
      placeholderMessage: localize("themes.selectProductIconTheme", "Select Product Icon Theme (Up/Down Keys to Preview)"),
      marketplaceTag: "tag:product-icon-theme"
    };
    const setTheme = (theme, settingsTarget) => themeService.setProductIconTheme(theme, settingsTarget);
    const getMarketplaceColorThemes = (publisher, name, version) => themeService.getMarketplaceProductIconThemes(publisher, name, version);
    const instantiationService = accessor.get(IInstantiationService);
    const picker = instantiationService.createInstance(InstalledThemesPicker, options, setTheme, getMarketplaceColorThemes);
    const picks = [
      { type: "separator", label: localize("productIconThemeCategory", "product icon themes") },
      { id: DEFAULT_PRODUCT_ICON_THEME_ID, theme: ProductIconThemeData.defaultTheme, label: localize("defaultProductIconThemeLabel", "Default") },
      ...toEntries(await themeService.getProductIconThemes())
    ];
    await picker.openQuickPick(picks, themeService.getProductIconTheme());
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.tryNewDefaultThemes",
      title: localize2("tryNewDefaultThemes", "Try New Default Themes"),
      category: Categories.Preferences,
      f1: true
    });
  }
  async run(accessor) {
    const themeService = accessor.get(IWorkbenchThemeService);
    const quickInputService = accessor.get(IQuickInputService);
    const configurationService = accessor.get(IConfigurationService);
    const previousTheme = themeService.getColorTheme();
    const allThemes = await themeService.getColorThemes();
    const newThemeSettingsIds = /* @__PURE__ */ new Set([ThemeSettingDefaults.COLOR_THEME_LIGHT, ThemeSettingDefaults.COLOR_THEME_DARK]);
    const themes = allThemes.filter((t) => newThemeSettingsIds.has(t.settingsId));
    const items = themes.map((t) => ({
      id: t.id,
      label: t.label,
      description: t.description
    }));
    const disposables = new DisposableStore();
    const picker = disposables.add(quickInputService.createQuickPick());
    picker.items = items;
    picker.placeholder = localize("pickNewTheme", "Pick a new default theme");
    picker.canSelectMany = false;
    const preferredId = previousTheme.type === ColorScheme.LIGHT || previousTheme.type === ColorScheme.HIGH_CONTRAST_LIGHT ? ThemeSettingDefaults.COLOR_THEME_LIGHT : ThemeSettingDefaults.COLOR_THEME_DARK;
    const activeItem = items.find((i) => themes.find((t) => t.id === i.id)?.settingsId === preferredId);
    if (activeItem) {
      picker.activeItems = [activeItem];
    }
    disposables.add(picker.onDidChangeActive((selected) => {
      if (selected[0]) {
        const theme = themes.find((t) => t.id === selected[0].id);
        if (theme) {
          themeService.setColorTheme(theme, "preview");
        }
      }
    }));
    disposables.add(picker.onDidAccept(() => {
      const selected = picker.activeItems[0];
      const theme = selected ? themes.find((t) => t.id === selected.id) : void 0;
      picker.hide();
      if (!theme) {
        return;
      }
      (async () => {
        try {
          await themeService.setColorTheme(theme, "auto");
          await configurationService.updateValue(ThemeSettings.PREFERRED_LIGHT_THEME, ThemeSettingDefaults.COLOR_THEME_LIGHT);
          await configurationService.updateValue(ThemeSettings.PREFERRED_DARK_THEME, ThemeSettingDefaults.COLOR_THEME_DARK);
        } catch (error) {
          if (!isCancellationError(error)) {
            onUnexpectedError(error);
          }
        }
      })();
    }));
    const result = new Promise((resolve) => {
      disposables.add(picker.onDidHide(() => {
        if (!picker.selectedItems.length) {
          themeService.setColorTheme(previousTheme, void 0);
        }
        resolve();
      }));
    }).finally(() => disposables.dispose());
    picker.show();
    return result;
  }
});
CommandsRegistry.registerCommand("workbench.action.previewColorTheme", async function(accessor, extension, themeSettingsId) {
  const themeService = accessor.get(IWorkbenchThemeService);
  let themes = findBuiltInThemes(await themeService.getColorThemes(), extension);
  if (themes.length === 0) {
    themes = await themeService.getMarketplaceColorThemes(extension.publisher, extension.name, extension.version);
  }
  for (const theme of themes) {
    if (!themeSettingsId || theme.settingsId === themeSettingsId) {
      await themeService.setColorTheme(theme, "preview");
      return theme.settingsId;
    }
  }
  return void 0;
});
function findBuiltInThemes(themes, extension) {
  return themes.filter(({ extensionData }) => extensionData && extensionData.extensionIsBuiltin && equalsIgnoreCase(extensionData.extensionPublisher, extension.publisher) && equalsIgnoreCase(extensionData.extensionName, extension.name));
}
function configurationEntry(label, configureItem) {
  return {
    id: void 0,
    label,
    alwaysShow: true,
    buttons: [configureButton],
    configureItem
  };
}
function isItem(i) {
  return i["type"] !== "separator";
}
const defaultThemeDescriptions = {
  [ThemeSettingDefaults.COLOR_THEME_LIGHT]: localize("defaultLight", "Default Light"),
  [ThemeSettingDefaults.COLOR_THEME_DARK]: localize("defaultDark", "Default Dark")
};
function toEntry(theme) {
  const settingId = theme.settingsId ?? void 0;
  const item = {
    id: theme.id,
    theme,
    label: theme.label,
    description: defaultThemeDescriptions[settingId ?? ""] ?? theme.description ?? (theme.label === settingId ? void 0 : settingId)
  };
  if (theme.extensionData) {
    item.buttons = [configureButton];
  }
  return item;
}
function toEntries(themes, label) {
  const pinnedIds = /* @__PURE__ */ new Set([ThemeSettingDefaults.COLOR_THEME_DARK, ThemeSettingDefaults.COLOR_THEME_LIGHT]);
  const sorter = (t1, t2) => {
    const pin1 = pinnedIds.has(t1.theme?.settingsId ?? "");
    const pin2 = pinnedIds.has(t2.theme?.settingsId ?? "");
    if (pin1 !== pin2) {
      return pin1 ? -1 : 1;
    }
    return t1.label.localeCompare(t2.label);
  };
  const entries = themes.map(toEntry).sort(sorter);
  if (entries.length > 0 && label) {
    entries.unshift({ type: "separator", label });
  }
  return entries;
}
const configureButton = {
  iconClass: ThemeIcon.asClassName(manageExtensionIcon),
  tooltip: localize("manage extension", "Manage Extension")
};
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.generateColorTheme",
      title: localize2("generateColorTheme.label", "Generate Color Theme From Current Settings"),
      category: Categories.Developer,
      f1: true
    });
  }
  run(accessor) {
    const themeService = accessor.get(IWorkbenchThemeService);
    const theme = themeService.getColorTheme();
    const colors = Registry.as(ColorRegistryExtensions.ColorContribution).getColors();
    const colorIds = colors.filter((c) => !c.deprecationMessage).map((c) => c.id).sort();
    const resultingColors = {};
    const inherited = [];
    for (const colorId of colorIds) {
      const color = theme.getColor(colorId, false);
      if (color) {
        resultingColors[colorId] = Color.Format.CSS.formatHexA(color, true);
      } else {
        inherited.push(colorId);
      }
    }
    const nullDefaults = [];
    for (const id of inherited) {
      const color = theme.getColor(id);
      if (color) {
        resultingColors["__" + id] = Color.Format.CSS.formatHexA(color, true);
      } else {
        nullDefaults.push(id);
      }
    }
    for (const id of nullDefaults) {
      resultingColors["__" + id] = null;
    }
    let contents = JSON.stringify({
      "$schema": colorThemeSchemaId,
      type: theme.type,
      colors: resultingColors,
      tokenColors: theme.tokenColors.filter((t) => !!t.scope)
    }, null, "	");
    contents = contents.replace(/\"__/g, '//"');
    const editorService = accessor.get(IEditorService);
    return editorService.openEditor({ resource: void 0, contents, languageId: "jsonc", options: { pinned: true } });
  }
});
const toggleLightDarkThemesCommandId = "workbench.action.toggleLightDarkThemes";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: toggleLightDarkThemesCommandId,
      title: localize2("toggleLightDarkThemes.label", "Toggle between Light/Dark Themes"),
      category: Categories.Preferences,
      f1: true
    });
  }
  async run(accessor) {
    const themeService = accessor.get(IWorkbenchThemeService);
    const configurationService = accessor.get(IConfigurationService);
    const notificationService = accessor.get(INotificationService);
    const preferencesService = accessor.get(IPreferencesService);
    if (configurationService.getValue(ThemeSettings.DETECT_COLOR_SCHEME)) {
      const message = localize({ key: "cannotToggle", comment: ["{0} is a setting name"] }, "Cannot toggle between light and dark themes when `{0}` is enabled in settings.", ThemeSettings.DETECT_COLOR_SCHEME);
      notificationService.prompt(Severity.Info, message, [
        {
          label: localize("goToSetting", "Open Settings"),
          run: () => {
            return preferencesService.openUserSettings({ query: ThemeSettings.DETECT_COLOR_SCHEME });
          }
        }
      ]);
      return;
    }
    const currentTheme = themeService.getColorTheme();
    let newSettingsId = ThemeSettings.PREFERRED_DARK_THEME;
    switch (currentTheme.type) {
      case ColorScheme.LIGHT:
        newSettingsId = ThemeSettings.PREFERRED_DARK_THEME;
        break;
      case ColorScheme.DARK:
        newSettingsId = ThemeSettings.PREFERRED_LIGHT_THEME;
        break;
      case ColorScheme.HIGH_CONTRAST_LIGHT:
        newSettingsId = ThemeSettings.PREFERRED_HC_DARK_THEME;
        break;
      case ColorScheme.HIGH_CONTRAST_DARK:
        newSettingsId = ThemeSettings.PREFERRED_HC_LIGHT_THEME;
        break;
    }
    const themeSettingId = configurationService.getValue(newSettingsId);
    if (themeSettingId && typeof themeSettingId === "string") {
      const theme = (await themeService.getColorThemes()).find((t) => t.settingsId === themeSettingId);
      if (theme) {
        themeService.setColorTheme(theme.id, "auto");
      }
    }
  }
});
const browseColorThemesInMarketplaceCommandId = "workbench.action.browseColorThemesInMarketplace";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: browseColorThemesInMarketplaceCommandId,
      title: localize2("browseColorThemeInMarketPlace.label", "Browse Color Themes in Marketplace"),
      category: Categories.Preferences,
      f1: true
    });
  }
  async run(accessor) {
    const marketplaceTag = "category:themes";
    const themeService = accessor.get(IWorkbenchThemeService);
    const extensionGalleryService = accessor.get(IExtensionGalleryService);
    const extensionResourceLoaderService = accessor.get(IExtensionResourceLoaderService);
    const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
    const instantiationService = accessor.get(IInstantiationService);
    if (!extensionGalleryService.isEnabled()) {
      return;
    }
    if (!await extensionResourceLoaderService.supportsExtensionGalleryResources()) {
      await extensionsWorkbenchService.openSearch(marketplaceTag);
      return;
    }
    const currentTheme = themeService.getColorTheme();
    const getMarketplaceColorThemes = (publisher, name, version) => themeService.getMarketplaceColorThemes(publisher, name, version);
    let selectThemeTimeout;
    const selectTheme = (theme, applyTheme) => {
      if (selectThemeTimeout) {
        clearTimeout(selectThemeTimeout);
      }
      selectThemeTimeout = mainWindow.setTimeout(() => {
        selectThemeTimeout = void 0;
        const newTheme = theme ?? currentTheme;
        themeService.setColorTheme(newTheme, applyTheme ? "auto" : "preview").then(
          void 0,
          (err) => {
            onUnexpectedError(err);
            themeService.setColorTheme(currentTheme, void 0);
          }
        );
      }, applyTheme ? 0 : 200);
    };
    const marketplaceThemePicker = instantiationService.createInstance(MarketplaceThemesPicker, getMarketplaceColorThemes, marketplaceTag);
    await marketplaceThemePicker.openQuickPick("", themeService.getColorTheme(), selectTheme).then(void 0, onUnexpectedError);
  }
});
const ThemesSubMenu = new MenuId("ThemesSubMenu");
MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
  title: localize("themes", "Themes"),
  submenu: ThemesSubMenu,
  group: "2_configuration",
  order: 7
});
MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
  title: localize({ key: "miSelectTheme", comment: ["&& denotes a mnemonic"] }, "&&Themes"),
  submenu: ThemesSubMenu,
  group: "2_configuration",
  order: 7
});
MenuRegistry.appendMenuItem(ThemesSubMenu, {
  command: {
    id: SelectColorThemeCommandId,
    title: localize("selectTheme.label", "Color Theme")
  },
  order: 1
});
MenuRegistry.appendMenuItem(ThemesSubMenu, {
  command: {
    id: SelectFileIconThemeCommandId,
    title: localize("themes.selectIconTheme.label", "File Icon Theme")
  },
  order: 2
});
MenuRegistry.appendMenuItem(ThemesSubMenu, {
  command: {
    id: SelectProductIconThemeCommandId,
    title: localize("themes.selectProductIconTheme.label", "Product Icon Theme")
  },
  order: 3
});
export {
  manageExtensionIcon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRoZW1lc1xcYnJvd3NlclxcdGhlbWVzLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgS2V5TW9kLCBLZXlDaG9yZCwgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IE1lbnVSZWdpc3RyeSwgTWVudUlkLCBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIsIElTdWJtZW51SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgZXF1YWxzSWdub3JlQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlLCBJV29ya2JlbmNoVGhlbWUsIFRoZW1lU2V0dGluZ1RhcmdldCwgSVdvcmtiZW5jaENvbG9yVGhlbWUsIElXb3JrYmVuY2hGaWxlSWNvblRoZW1lLCBJV29ya2JlbmNoUHJvZHVjdEljb25UaGVtZSwgVGhlbWVTZXR0aW5ncywgVGhlbWVTZXR0aW5nRGVmYXVsdHMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL3dvcmtiZW5jaFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBJR2FsbGVyeUV4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSUNvbG9yUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgQ29sb3JSZWdpc3RyeUV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IENvbG9yU2NoZW1lLCBpc0hpZ2hDb250cmFzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBjb2xvclRoZW1lU2NoZW1hSWQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL2NvbG9yVGhlbWVTY2hlbWEuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciwgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRCdXR0b24sIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGljaywgSVF1aWNrUGlja0l0ZW0sIFF1aWNrSW5wdXRCdXR0b25Mb2NhdGlvbiwgUXVpY2tQaWNrSW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IERFRkFVTFRfUFJPRFVDVF9JQ09OX1RIRU1FX0lELCBQcm9kdWN0SWNvblRoZW1lRGF0YSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RoZW1lcy9icm93c2VyL3Byb2R1Y3RJY29uVGhlbWVEYXRhLmpzJztcbmltcG9ydCB7IFRocm90dGxlZERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvblJlc291cmNlTG9hZGVyL2NvbW1vbi9leHRlbnNpb25SZXNvdXJjZUxvYWRlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRmlsZUljb25UaGVtZURhdGEgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90aGVtZXMvYnJvd3Nlci9maWxlSWNvblRoZW1lRGF0YS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5cbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBtYW5hZ2VFeHRlbnNpb25JY29uID0gcmVnaXN0ZXJJY29uKCd0aGVtZS1zZWxlY3Rpb24tbWFuYWdlLWV4dGVuc2lvbicsIENvZGljb24uZ2VhciwgbG9jYWxpemUoJ21hbmFnZUV4dGVuc2lvbkljb24nLCAnSWNvbiBmb3IgdGhlIFxcJ01hbmFnZVxcJyBhY3Rpb24gaW4gdGhlIHRoZW1lIHNlbGVjdGlvbiBxdWljayBwaWNrLicpKTtcblxudHlwZSBQaWNrZXJSZXN1bHQgPSAnYmFjaycgfCAnc2VsZWN0ZWQnIHwgJ2NhbmNlbGxlZCc7XG5cbmVudW0gQ29uZmlndXJlSXRlbSB7XG5cdEJST1dTRV9HQUxMRVJZID0gJ21hcmtldHBsYWNlJyxcblx0RVhURU5TSU9OU19WSUVXID0gJ2V4dGVuc2lvbnMnLFxuXHRDVVNUT01fVE9QX0VOVFJZID0gJ2N1c3RvbVRvcEVudHJ5J1xufVxuXG5jbGFzcyBNYXJrZXRwbGFjZVRoZW1lc1BpY2tlciBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5zdGFsbGVkRXh0ZW5zaW9uczogUHJvbWlzZTxTZXQ8c3RyaW5nPj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX21hcmtldHBsYWNlRXh0ZW5zaW9uczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21hcmtldHBsYWNlVGhlbWVzOiBUaGVtZUl0ZW1bXSA9IFtdO1xuXG5cdHByaXZhdGUgX3NlYXJjaE9uZ29pbmc6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfc2VhcmNoRXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXG5cdHByaXZhdGUgX3Rva2VuU291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfcXVlcnlEZWxheWVyID0gbmV3IFRocm90dGxlZERlbGF5ZXI8dm9pZD4oMjAwKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGdldE1hcmtldHBsYWNlQ29sb3JUaGVtZXM6IChwdWJsaXNoZXI6IHN0cmluZywgbmFtZTogc3RyaW5nLCB2ZXJzaW9uOiBzdHJpbmcpID0+IFByb21pc2U8SVdvcmtiZW5jaFRoZW1lW10+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWFya2V0cGxhY2VRdWVyeTogc3RyaW5nLFxuXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX2luc3RhbGxlZEV4dGVuc2lvbnMgPSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoKS50aGVuKGluc3RhbGxlZCA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGZvciAoY29uc3QgZXh0IG9mIGluc3RhbGxlZCkge1xuXHRcdFx0XHRyZXN1bHQuYWRkKGV4dC5pZGVudGlmaWVyLmlkKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHRoZW1lcygpOiBUaGVtZUl0ZW1bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX21hcmtldHBsYWNlVGhlbWVzO1xuXHR9XG5cblx0cHVibGljIGdldCBvbkRpZENoYW5nZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cdH1cblxuXHRwdWJsaWMgdHJpZ2dlcih2YWx1ZTogc3RyaW5nKSB7XG5cdFx0aWYgKHRoaXMuX3Rva2VuU291cmNlKSB7XG5cdFx0XHR0aGlzLl90b2tlblNvdXJjZS5jYW5jZWwoKTtcblx0XHRcdHRoaXMuX3Rva2VuU291cmNlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9xdWVyeURlbGF5ZXIudHJpZ2dlcigoKSA9PiB7XG5cdFx0XHR0aGlzLl90b2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9TZWFyY2godmFsdWUsIHRoaXMuX3Rva2VuU291cmNlLnRva2VuKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TZWFyY2godmFsdWU6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fc2VhcmNoT25nb2luZyA9IHRydWU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5faW5zdGFsbGVkRXh0ZW5zaW9ucztcblxuXHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHsgdGV4dDogYCR7dGhpcy5tYXJrZXRwbGFjZVF1ZXJ5fSAke3ZhbHVlfWAsIHBhZ2VTaXplOiAyMCB9O1xuXHRcdFx0Y29uc3QgcGFnZXIgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLnF1ZXJ5KG9wdGlvbnMsIHRva2VuKTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcGFnZXIudG90YWwgJiYgaSA8IDE7IGkrKykgeyAvLyBsb2FkaW5nIG11bHRpcGxlIHBhZ2VzIGlzIHR1cm5lZCBvZiBmb3Igbm93IHRvIGF2b2lkIGZsaWNrZXJpbmdcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBuVGhlbWVzID0gdGhpcy5fbWFya2V0cGxhY2VUaGVtZXMubGVuZ3RoO1xuXHRcdFx0XHRjb25zdCBnYWxsZXJ5ID0gaSA9PT0gMCA/IHBhZ2VyLmZpcnN0UGFnZSA6IGF3YWl0IHBhZ2VyLmdldFBhZ2UoaSwgdG9rZW4pO1xuXG5cdFx0XHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPElXb3JrYmVuY2hUaGVtZVtdPltdID0gW107XG5cdFx0XHRcdGNvbnN0IHByb21pc2VzR2FsbGVyaWVzID0gW107XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZ2FsbGVyeS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGV4dCA9IGdhbGxlcnlbaV07XG5cdFx0XHRcdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cgJiYgZXh0LnByb3BlcnRpZXMuZXhlY3V0ZXNDb2RlKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTsgLy8gSWRlYWxseSB3b3VsZCBiZSBpbiBzeW5jIHdpdGggY2FuRXhlY3V0ZU9uU2Vzc2lvbnNXaW5kb3dcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFpbnN0YWxsZWRFeHRlbnNpb25zLmhhcyhleHQuaWRlbnRpZmllci5pZCkgJiYgIXRoaXMuX21hcmtldHBsYWNlRXh0ZW5zaW9ucy5oYXMoZXh0LmlkZW50aWZpZXIuaWQpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9tYXJrZXRwbGFjZUV4dGVuc2lvbnMuYWRkKGV4dC5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0XHRcdHByb21pc2VzLnB1c2godGhpcy5nZXRNYXJrZXRwbGFjZUNvbG9yVGhlbWVzKGV4dC5wdWJsaXNoZXIsIGV4dC5uYW1lLCBleHQudmVyc2lvbikpO1xuXHRcdFx0XHRcdFx0cHJvbWlzZXNHYWxsZXJpZXMucHVzaChleHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBhbGxUaGVtZXMgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYWxsVGhlbWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ID0gcHJvbWlzZXNHYWxsZXJpZXNbaV07XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB0aGVtZSBvZiBhbGxUaGVtZXNbaV0pIHtcblx0XHRcdFx0XHRcdHRoaXMuX21hcmtldHBsYWNlVGhlbWVzLnB1c2goeyBpZDogdGhlbWUuaWQsIHRoZW1lOiB0aGVtZSwgbGFiZWw6IHRoZW1lLmxhYmVsLCBkZXNjcmlwdGlvbjogYCR7ZXh0LmRpc3BsYXlOYW1lfSBcdTAwQjcgJHtleHQucHVibGlzaGVyRGlzcGxheU5hbWV9YCwgZ2FsbGVyeUV4dGVuc2lvbjogZXh0LCBidXR0b25zOiBbY29uZmlndXJlQnV0dG9uXSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoblRoZW1lcyAhPT0gdGhpcy5fbWFya2V0cGxhY2VUaGVtZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5fbWFya2V0cGxhY2VUaGVtZXMuc29ydCgodDEsIHQyKSA9PiB0MS5sYWJlbC5sb2NhbGVDb21wYXJlKHQyLmxhYmVsKSk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGUpKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRXJyb3Igd2hpbGUgc2VhcmNoaW5nIGZvciB0aGVtZXM6YCwgZSk7XG5cdFx0XHRcdHRoaXMuX3NlYXJjaEVycm9yID0gJ21lc3NhZ2UnIGluIGUgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX3NlYXJjaE9uZ29pbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHR9XG5cblx0fVxuXG5cdHB1YmxpYyBvcGVuUXVpY2tQaWNrKHZhbHVlOiBzdHJpbmcsIGN1cnJlbnRUaGVtZTogSVdvcmtiZW5jaFRoZW1lIHwgdW5kZWZpbmVkLCBzZWxlY3RUaGVtZTogKHRoZW1lOiBJV29ya2JlbmNoVGhlbWUgfCB1bmRlZmluZWQsIGFwcGx5VGhlbWU6IGJvb2xlYW4pID0+IHZvaWQpOiBQcm9taXNlPFBpY2tlclJlc3VsdD4ge1xuXHRcdGxldCByZXN1bHQ6IFBpY2tlclJlc3VsdCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8UGlja2VyUmVzdWx0PigocywgXykgPT4ge1xuXHRcdFx0Y29uc3QgcXVpY2twaWNrID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPFRoZW1lSXRlbT4oKSk7XG5cdFx0XHRxdWlja3BpY2suaXRlbXMgPSBbXTtcblx0XHRcdHF1aWNrcGljay5zb3J0QnlMYWJlbCA9IGZhbHNlO1xuXHRcdFx0cXVpY2twaWNrLm1hdGNoT25EZXNjcmlwdGlvbiA9IHRydWU7XG5cdFx0XHRxdWlja3BpY2suYnV0dG9ucyA9IFt0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmJhY2tCdXR0b25dO1xuXHRcdFx0cXVpY2twaWNrLnRpdGxlID0gJ01hcmtldHBsYWNlIFRoZW1lcyc7XG5cdFx0XHRxdWlja3BpY2sucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgndGhlbWVzLnNlbGVjdE1hcmtldHBsYWNlVGhlbWUnLCBcIlR5cGUgdG8gU2VhcmNoIE1vcmUuIFNlbGVjdCB0byBJbnN0YWxsLiBVcC9Eb3duIEtleXMgdG8gUHJldmlld1wiKTtcblx0XHRcdHF1aWNrcGljay5jYW5TZWxlY3RNYW55ID0gZmFsc2U7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2twaWNrLm9uRGlkQ2hhbmdlVmFsdWUoKCkgPT4gdGhpcy50cmlnZ2VyKHF1aWNrcGljay52YWx1ZSkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja3BpY2sub25EaWRBY2NlcHQoYXN5bmMgXyA9PiB7XG5cdFx0XHRcdGNvbnN0IHRoZW1lSXRlbSA9IHF1aWNrcGljay5zZWxlY3RlZEl0ZW1zWzBdO1xuXHRcdFx0XHRpZiAodGhlbWVJdGVtPy5nYWxsZXJ5RXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gJ3NlbGVjdGVkJztcblx0XHRcdFx0XHRxdWlja3BpY2suaGlkZSgpO1xuXHRcdFx0XHRcdGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLmluc3RhbGxFeHRlbnNpb24odGhlbWVJdGVtLmdhbGxlcnlFeHRlbnNpb24pO1xuXHRcdFx0XHRcdGlmIChzdWNjZXNzKSB7XG5cdFx0XHRcdFx0XHRzZWxlY3RUaGVtZSh0aGVtZUl0ZW0udGhlbWUsIHRydWUpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzZWxlY3RUaGVtZShjdXJyZW50VGhlbWUsIHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2twaWNrLm9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oZSA9PiB7XG5cdFx0XHRcdGlmIChpc0l0ZW0oZS5pdGVtKSkge1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbklkID0gZS5pdGVtLnRoZW1lPy5leHRlbnNpb25EYXRhPy5leHRlbnNpb25JZDtcblx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9uSWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaChgQGlkOiR7ZXh0ZW5zaW9uSWR9YCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaChgJHt0aGlzLm1hcmtldHBsYWNlUXVlcnl9ICR7cXVpY2twaWNrLnZhbHVlfWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrcGljay5vbkRpZENoYW5nZUFjdGl2ZSh0aGVtZXMgPT4ge1xuXHRcdFx0XHRpZiAocmVzdWx0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRzZWxlY3RUaGVtZSh0aGVtZXNbMF0/LnRoZW1lLCBmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrcGljay5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHRpZiAocmVzdWx0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRzZWxlY3RUaGVtZShjdXJyZW50VGhlbWUsIHRydWUpO1xuXHRcdFx0XHRcdHJlc3VsdCA9ICdjYW5jZWxsZWQnO1xuXG5cdFx0XHRcdH1cblx0XHRcdFx0cyhyZXN1bHQpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2twaWNrLm9uRGlkVHJpZ2dlckJ1dHRvbihlID0+IHtcblx0XHRcdFx0aWYgKGUgPT09IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuYmFja0J1dHRvbikge1xuXHRcdFx0XHRcdHJlc3VsdCA9ICdiYWNrJztcblx0XHRcdFx0XHRxdWlja3BpY2suaGlkZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0bGV0IGl0ZW1zID0gdGhpcy50aGVtZXM7XG5cdFx0XHRcdGlmICh0aGlzLl9zZWFyY2hPbmdvaW5nKSB7XG5cdFx0XHRcdFx0aXRlbXMgPSBpdGVtcy5jb25jYXQoeyBsYWJlbDogJyQobG9hZGluZ35zcGluKSBTZWFyY2hpbmcgZm9yIHRoZW1lcy4uLicsIGlkOiB1bmRlZmluZWQsIGFsd2F5c1Nob3c6IHRydWUgfSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXRlbXMubGVuZ3RoID09PSAwICYmIHRoaXMuX3NlYXJjaEVycm9yKSB7XG5cdFx0XHRcdFx0aXRlbXMgPSBbeyBsYWJlbDogYCQoZXJyb3IpICR7bG9jYWxpemUoJ3NlYXJjaC5lcnJvcicsICdFcnJvciB3aGlsZSBzZWFyY2hpbmcgZm9yIHRoZW1lczogezB9JywgdGhpcy5fc2VhcmNoRXJyb3IpfWAsIGlkOiB1bmRlZmluZWQsIGFsd2F5c1Nob3c6IHRydWUgfV07XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWN0aXZlSXRlbUlkID0gcXVpY2twaWNrLmFjdGl2ZUl0ZW1zWzBdPy5pZDtcblx0XHRcdFx0Y29uc3QgbmV3QWN0aXZlSXRlbSA9IGFjdGl2ZUl0ZW1JZCA/IGl0ZW1zLmZpbmQoaSA9PiBpc0l0ZW0oaSkgJiYgaS5pZCA9PT0gYWN0aXZlSXRlbUlkKSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRxdWlja3BpY2suaXRlbXMgPSBpdGVtcztcblx0XHRcdFx0aWYgKG5ld0FjdGl2ZUl0ZW0pIHtcblx0XHRcdFx0XHRxdWlja3BpY2suYWN0aXZlSXRlbXMgPSBbbmV3QWN0aXZlSXRlbSBhcyBUaGVtZUl0ZW1dO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLnRyaWdnZXIodmFsdWUpO1xuXHRcdFx0cXVpY2twaWNrLnNob3coKTtcblx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW5zdGFsbEV4dGVuc2lvbihnYWxsZXJ5RXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbikge1xuXHRcdHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaChgQGlkOiR7Z2FsbGVyeUV4dGVuc2lvbi5pZGVudGlmaWVyLmlkfWApO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdpbnN0YWxsRXh0ZW5zaW9uLmNvbmZpcm0nLCBcIlRoaXMgd2lsbCBpbnN0YWxsIGV4dGVuc2lvbiAnezB9JyBwdWJsaXNoZWQgYnkgJ3sxfScuIERvIHlvdSB3YW50IHRvIGNvbnRpbnVlP1wiLCBnYWxsZXJ5RXh0ZW5zaW9uLmRpc3BsYXlOYW1lLCBnYWxsZXJ5RXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lKSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdpbnN0YWxsRXh0ZW5zaW9uLmJ1dHRvbi5vaycsIFwiT0tcIilcblx0XHR9KTtcblx0XHRpZiAoIXJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7XG5cdFx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbixcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdpbnN0YWxsaW5nIGV4dGVuc2lvbnMnLCBcIkluc3RhbGxpbmcgRXh0ZW5zaW9uIHswfS4uLlwiLCBnYWxsZXJ5RXh0ZW5zaW9uLmRpc3BsYXlOYW1lKVxuXHRcdFx0fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tR2FsbGVyeShnYWxsZXJ5RXh0ZW5zaW9uLCB7XG5cdFx0XHRcdFx0Ly8gU2V0dGluZyB0aGlzIHRvIGZhbHNlIGlzIGhvdyB5b3UgZ2V0IHRoZSBleHRlbnNpb24gdG8gYmUgc3luY2VkIHdpdGggU2V0dGluZ3MgU3luYyAoaWYgZW5hYmxlZCkuXG5cdFx0XHRcdFx0aXNNYWNoaW5lU2NvcGVkOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgUHJvYmxlbSBpbnN0YWxsaW5nIGV4dGVuc2lvbiAke2dhbGxlcnlFeHRlbnNpb24uaWRlbnRpZmllci5pZH1gLCBlKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXG5cdHB1YmxpYyBkaXNwb3NlKCkge1xuXHRcdGlmICh0aGlzLl90b2tlblNvdXJjZSkge1xuXHRcdFx0dGhpcy5fdG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLl90b2tlblNvdXJjZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fcXVlcnlEZWxheWVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9tYXJrZXRwbGFjZUV4dGVuc2lvbnMuY2xlYXIoKTtcblx0XHR0aGlzLl9tYXJrZXRwbGFjZVRoZW1lcy5sZW5ndGggPSAwO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSW5zdGFsbGVkVGhlbWVzUGlja2VyT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGluc3RhbGxNZXNzYWdlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGJyb3dzZU1lc3NhZ2U/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBsYWNlaG9sZGVyTWVzc2FnZTogc3RyaW5nO1xuXHRyZWFkb25seSBtYXJrZXRwbGFjZVRhZzogc3RyaW5nO1xuXHRyZWFkb25seSB0aXRsZT86IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGJ1dHRvbnM/OiBJUXVpY2tJbnB1dEJ1dHRvbltdO1xuXHRyZWFkb25seSBvbkJ1dHRvbj86IChidXR0b246IElRdWlja0lucHV0QnV0dG9uLCBxdWlja0lucHV0OiBJUXVpY2tQaWNrPFRoZW1lSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiBib29sZWFuIH0+KSA9PiBQcm9taXNlPHZvaWQ+O1xufVxuXG5jbGFzcyBJbnN0YWxsZWRUaGVtZXNQaWNrZXIge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IEluc3RhbGxlZFRoZW1lc1BpY2tlck9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZXRUaGVtZTogKHRoZW1lOiBJV29ya2JlbmNoVGhlbWUgfCB1bmRlZmluZWQsIHNldHRpbmdzVGFyZ2V0OiBUaGVtZVNldHRpbmdUYXJnZXQpID0+IFByb21pc2U8dW5rbm93bj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBnZXRNYXJrZXRwbGFjZUNvbG9yVGhlbWVzOiAocHVibGlzaGVyOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgdmVyc2lvbjogc3RyaW5nKSA9PiBQcm9taXNlPElXb3JrYmVuY2hUaGVtZVtdPixcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZTogSUV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBvcGVuUXVpY2tQaWNrKHBpY2tzOiBRdWlja1BpY2tJbnB1dDxUaGVtZUl0ZW0+W10sIGN1cnJlbnRUaGVtZTogSVdvcmtiZW5jaFRoZW1lKSB7XG5cblx0XHRsZXQgbWFya2V0cGxhY2VUaGVtZVBpY2tlcjogTWFya2V0cGxhY2VUaGVtZXNQaWNrZXIgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLmV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZS5zdXBwb3J0c0V4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZXMoKSAmJiB0aGlzLm9wdGlvbnMuYnJvd3NlTWVzc2FnZSkge1xuXHRcdFx0XHRtYXJrZXRwbGFjZVRoZW1lUGlja2VyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYXJrZXRwbGFjZVRoZW1lc1BpY2tlciwgdGhpcy5nZXRNYXJrZXRwbGFjZUNvbG9yVGhlbWVzLmJpbmQodGhpcyksIHRoaXMub3B0aW9ucy5tYXJrZXRwbGFjZVRhZyk7XG5cdFx0XHRcdHBpY2tzID0gW2NvbmZpZ3VyYXRpb25FbnRyeSh0aGlzLm9wdGlvbnMuYnJvd3NlTWVzc2FnZSwgQ29uZmlndXJlSXRlbS5CUk9XU0VfR0FMTEVSWSksIC4uLnBpY2tzXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHBpY2tzID0gWy4uLnBpY2tzLCB7IHR5cGU6ICdzZXBhcmF0b3InIH0sIGNvbmZpZ3VyYXRpb25FbnRyeSh0aGlzLm9wdGlvbnMuaW5zdGFsbE1lc3NhZ2UsIENvbmZpZ3VyZUl0ZW0uRVhURU5TSU9OU19WSUVXKV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHNlbGVjdFRoZW1lVGltZW91dDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgc2VsZWN0VGhlbWUgPSAodGhlbWU6IElXb3JrYmVuY2hUaGVtZSB8IHVuZGVmaW5lZCwgYXBwbHlUaGVtZTogYm9vbGVhbikgPT4ge1xuXHRcdFx0aWYgKHNlbGVjdFRoZW1lVGltZW91dCkge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQoc2VsZWN0VGhlbWVUaW1lb3V0KTtcblx0XHRcdH1cblx0XHRcdHNlbGVjdFRoZW1lVGltZW91dCA9IG1haW5XaW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHNlbGVjdFRoZW1lVGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgbmV3VGhlbWUgPSAodGhlbWUgPz8gY3VycmVudFRoZW1lKSBhcyBJV29ya2JlbmNoVGhlbWU7XG5cdFx0XHRcdHRoaXMuc2V0VGhlbWUobmV3VGhlbWUsIGFwcGx5VGhlbWUgPyAnYXV0bycgOiAncHJldmlldycpLnRoZW4odW5kZWZpbmVkLFxuXHRcdFx0XHRcdGVyciA9PiB7XG5cdFx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRUaGVtZShjdXJyZW50VGhlbWUsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpO1xuXHRcdFx0fSwgYXBwbHlUaGVtZSA/IDAgOiAyMDApO1xuXHRcdH07XG5cblx0XHRjb25zdCBwaWNrSW5zdGFsbGVkVGhlbWVzID0gKGFjdGl2ZUl0ZW1JZDogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocywgXykgPT4ge1xuXHRcdFx0XHRsZXQgaXNDb21wbGV0ZWQgPSBmYWxzZTtcblx0XHRcdFx0Y29uc3QgYXV0b0ZvY3VzSW5kZXggPSBwaWNrcy5maW5kSW5kZXgocCA9PiBpc0l0ZW0ocCkgJiYgcC5pZCA9PT0gYWN0aXZlSXRlbUlkKTtcblx0XHRcdFx0Y29uc3QgcXVpY2twaWNrID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPFRoZW1lSXRlbT4oeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pKTtcblx0XHRcdFx0cXVpY2twaWNrLml0ZW1zID0gcGlja3M7XG5cdFx0XHRcdHF1aWNrcGljay50aXRsZSA9IHRoaXMub3B0aW9ucy50aXRsZTtcblx0XHRcdFx0cXVpY2twaWNrLmRlc2NyaXB0aW9uID0gdGhpcy5vcHRpb25zLmRlc2NyaXB0aW9uO1xuXHRcdFx0XHRxdWlja3BpY2sucGxhY2Vob2xkZXIgPSB0aGlzLm9wdGlvbnMucGxhY2Vob2xkZXJNZXNzYWdlO1xuXHRcdFx0XHRxdWlja3BpY2suYWN0aXZlSXRlbXMgPSBbcGlja3NbYXV0b0ZvY3VzSW5kZXhdIGFzIFRoZW1lSXRlbV07XG5cdFx0XHRcdHF1aWNrcGljay5jYW5TZWxlY3RNYW55ID0gZmFsc2U7XG5cdFx0XHRcdHF1aWNrcGljay5idXR0b25zID0gdGhpcy5vcHRpb25zLmJ1dHRvbnMgPz8gW107XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja3BpY2sub25EaWRUcmlnZ2VyQnV0dG9uKGJ1dHRvbiA9PiB0aGlzLm9wdGlvbnMub25CdXR0b24/LihidXR0b24sIHF1aWNrcGljaykpKTtcblx0XHRcdFx0cXVpY2twaWNrLm1hdGNoT25EZXNjcmlwdGlvbiA9IHRydWU7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja3BpY2sub25EaWRBY2NlcHQoYXN5bmMgXyA9PiB7XG5cdFx0XHRcdFx0aXNDb21wbGV0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGNvbnN0IHRoZW1lID0gcXVpY2twaWNrLnNlbGVjdGVkSXRlbXNbMF07XG5cdFx0XHRcdFx0aWYgKCF0aGVtZSB8fCB0aGVtZS5jb25maWd1cmVJdGVtKSB7IC8vICdwaWNrIGluIG1hcmtldHBsYWNlJyBlbnRyeVxuXHRcdFx0XHRcdFx0aWYgKCF0aGVtZSB8fCB0aGVtZS5jb25maWd1cmVJdGVtID09PSBDb25maWd1cmVJdGVtLkVYVEVOU0lPTlNfVklFVykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goYCR7dGhpcy5vcHRpb25zLm1hcmtldHBsYWNlVGFnfSAke3F1aWNrcGljay52YWx1ZX1gKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAodGhlbWUuY29uZmlndXJlSXRlbSA9PT0gQ29uZmlndXJlSXRlbS5CUk9XU0VfR0FMTEVSWSkge1xuXHRcdFx0XHRcdFx0XHRpZiAobWFya2V0cGxhY2VUaGVtZVBpY2tlcikge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IG1hcmtldHBsYWNlVGhlbWVQaWNrZXIub3BlblF1aWNrUGljayhxdWlja3BpY2sudmFsdWUsIGN1cnJlbnRUaGVtZSwgc2VsZWN0VGhlbWUpO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChyZXMgPT09ICdiYWNrJykge1xuXHRcdFx0XHRcdFx0XHRcdFx0YXdhaXQgcGlja0luc3RhbGxlZFRoZW1lcyh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzZWxlY3RUaGVtZSh0aGVtZS50aGVtZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cXVpY2twaWNrLmhpZGUoKTtcblx0XHRcdFx0XHRzKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrcGljay5vbkRpZENoYW5nZUFjdGl2ZSh0aGVtZXMgPT4gc2VsZWN0VGhlbWUodGhlbWVzWzBdPy50aGVtZSwgZmFsc2UpKSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja3BpY2sub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0XHRpZiAoIWlzQ29tcGxldGVkKSB7XG5cdFx0XHRcdFx0XHRzZWxlY3RUaGVtZShjdXJyZW50VGhlbWUsIHRydWUpO1xuXHRcdFx0XHRcdFx0cygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRxdWlja3BpY2suZGlzcG9zZSgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja3BpY2sub25EaWRUcmlnZ2VySXRlbUJ1dHRvbihlID0+IHtcblx0XHRcdFx0XHRpZiAoaXNJdGVtKGUuaXRlbSkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbklkID0gZS5pdGVtLnRoZW1lPy5leHRlbnNpb25EYXRhPy5leHRlbnNpb25JZDtcblx0XHRcdFx0XHRcdGlmIChleHRlbnNpb25JZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goYEBpZDoke2V4dGVuc2lvbklkfWApO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGAke3RoaXMub3B0aW9ucy5tYXJrZXRwbGFjZVRhZ30gJHtxdWlja3BpY2sudmFsdWV9YCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHF1aWNrcGljay5zaG93KCk7XG5cdFx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fTtcblx0XHRhd2FpdCBwaWNrSW5zdGFsbGVkVGhlbWVzKGN1cnJlbnRUaGVtZS5pZCk7XG5cblx0XHRtYXJrZXRwbGFjZVRoZW1lUGlja2VyPy5kaXNwb3NlKCk7XG5cblx0fVxufVxuXG5jb25zdCBTZWxlY3RDb2xvclRoZW1lQ29tbWFuZElkID0gJ3dvcmtiZW5jaC5hY3Rpb24uc2VsZWN0VGhlbWUnO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU2VsZWN0Q29sb3JUaGVtZUNvbW1hbmRJZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NlbGVjdFRoZW1lLmxhYmVsJywgJ0NvbG9yIFRoZW1lJyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5QcmVmZXJlbmNlcyxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlUKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUaXRsZShjb2xvclNjaGVtZTogQ29sb3JTY2hlbWUgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAoY29sb3JTY2hlbWUpIHtcblx0XHRcdGNhc2UgQ29sb3JTY2hlbWUuREFSSzogcmV0dXJuIGxvY2FsaXplKCd0aGVtZXMuc2VsZWN0VGhlbWUuZGFya1NjaGVtZScsIFwiU2VsZWN0IENvbG9yIFRoZW1lIGZvciBTeXN0ZW0gRGFyayBNb2RlXCIpO1xuXHRcdFx0Y2FzZSBDb2xvclNjaGVtZS5MSUdIVDogcmV0dXJuIGxvY2FsaXplKCd0aGVtZXMuc2VsZWN0VGhlbWUubGlnaHRTY2hlbWUnLCBcIlNlbGVjdCBDb2xvciBUaGVtZSBmb3IgU3lzdGVtIExpZ2h0IE1vZGVcIik7XG5cdFx0XHRjYXNlIENvbG9yU2NoZW1lLkhJR0hfQ09OVFJBU1RfREFSSzogcmV0dXJuIGxvY2FsaXplKCd0aGVtZXMuc2VsZWN0VGhlbWUuZGFya0hDJywgXCJTZWxlY3QgQ29sb3IgVGhlbWUgZm9yIEhpZ2ggQ29udHJhc3QgRGFyayBNb2RlXCIpO1xuXHRcdFx0Y2FzZSBDb2xvclNjaGVtZS5ISUdIX0NPTlRSQVNUX0xJR0hUOiByZXR1cm4gbG9jYWxpemUoJ3RoZW1lcy5zZWxlY3RUaGVtZS5saWdodEhDJywgXCJTZWxlY3QgQ29sb3IgVGhlbWUgZm9yIEhpZ2ggQ29udHJhc3QgTGlnaHQgTW9kZVwiKTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgndGhlbWVzLnNlbGVjdFRoZW1lLmRlZmF1bHQnLCBcIlNlbGVjdCBDb2xvciBUaGVtZSAoZGV0ZWN0IHN5c3RlbSBjb2xvciBtb2RlIGRpc2FibGVkKVwiKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB0aGVtZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaFRoZW1lU2VydmljZSk7XG5cdFx0Y29uc3QgcHJlZmVyZW5jZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcHJlZmVycmVkQ29sb3JTY2hlbWUgPSB0aGVtZVNlcnZpY2UuZ2V0UHJlZmVycmVkQ29sb3JTY2hlbWUoKTtcblxuXHRcdGNvbnN0IG1vZGVDb25maWd1cmVCdXR0b246IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHRcdFx0dG9vbHRpcDogcHJlZmVycmVkQ29sb3JTY2hlbWVcblx0XHRcdFx0PyBsb2NhbGl6ZSgndGhlbWVzLmNvbmZpZ3VyZS5zd2l0Y2hpbmdFbmFibGVkJywgJ0RldGVjdCBzeXN0ZW0gY29sb3IgbW9kZSBlbmFibGVkLiBDbGljayB0byBjb25maWd1cmUuJylcblx0XHRcdFx0OiBsb2NhbGl6ZSgndGhlbWVzLmNvbmZpZ3VyZS5zd2l0Y2hpbmdEaXNhYmxlZCcsICdEZXRlY3Qgc3lzdGVtIGNvbG9yIG1vZGUgZGlzYWJsZWQuIENsaWNrIHRvIGNvbmZpZ3VyZS4nKSxcblx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY29sb3JNb2RlKSxcblx0XHRcdGxvY2F0aW9uOiBRdWlja0lucHV0QnV0dG9uTG9jYXRpb24uSW5saW5lXG5cdFx0fTtcblxuXHRcdGNvbnN0IG9wdGlvbnMgPSB7XG5cdFx0XHRpbnN0YWxsTWVzc2FnZTogbG9jYWxpemUoJ2luc3RhbGxDb2xvclRoZW1lcycsIFwiSW5zdGFsbCBBZGRpdGlvbmFsIENvbG9yIFRoZW1lcy4uLlwiKSxcblx0XHRcdGJyb3dzZU1lc3NhZ2U6ICckKHBsdXMpICcgKyBsb2NhbGl6ZSgnYnJvd3NlQ29sb3JUaGVtZXMnLCBcIkJyb3dzZSBBZGRpdGlvbmFsIENvbG9yIFRoZW1lcy4uLlwiKSxcblx0XHRcdHBsYWNlaG9sZGVyTWVzc2FnZTogdGhpcy5nZXRUaXRsZShwcmVmZXJyZWRDb2xvclNjaGVtZSksXG5cdFx0XHRtYXJrZXRwbGFjZVRhZzogJ2NhdGVnb3J5OnRoZW1lcycsXG5cdFx0XHRidXR0b25zOiBbbW9kZUNvbmZpZ3VyZUJ1dHRvbl0sXG5cdFx0XHRvbkJ1dHRvbjogYXN5bmMgKF9idXR0b24sIHBpY2tlcikgPT4ge1xuXHRcdFx0XHRwaWNrZXIuaGlkZSgpO1xuXHRcdFx0XHRhd2FpdCBwcmVmZXJlbmNlc1NlcnZpY2Uub3BlblNldHRpbmdzKHsgcXVlcnk6IFRoZW1lU2V0dGluZ3MuREVURUNUX0NPTE9SX1NDSEVNRSB9KTtcblx0XHRcdH1cblx0XHR9IHNhdGlzZmllcyBJbnN0YWxsZWRUaGVtZXNQaWNrZXJPcHRpb25zO1xuXHRcdGNvbnN0IHNldFRoZW1lID0gKHRoZW1lOiBJV29ya2JlbmNoVGhlbWUgfCB1bmRlZmluZWQsIHNldHRpbmdzVGFyZ2V0OiBUaGVtZVNldHRpbmdUYXJnZXQpID0+IHRoZW1lU2VydmljZS5zZXRDb2xvclRoZW1lKHRoZW1lIGFzIElXb3JrYmVuY2hDb2xvclRoZW1lLCBzZXR0aW5nc1RhcmdldCk7XG5cdFx0Y29uc3QgZ2V0TWFya2V0cGxhY2VDb2xvclRoZW1lcyA9IChwdWJsaXNoZXI6IHN0cmluZywgbmFtZTogc3RyaW5nLCB2ZXJzaW9uOiBzdHJpbmcpID0+IHRoZW1lU2VydmljZS5nZXRNYXJrZXRwbGFjZUNvbG9yVGhlbWVzKHB1Ymxpc2hlciwgbmFtZSwgdmVyc2lvbik7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHBpY2tlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxlZFRoZW1lc1BpY2tlciwgb3B0aW9ucywgc2V0VGhlbWUsIGdldE1hcmtldHBsYWNlQ29sb3JUaGVtZXMpO1xuXG5cdFx0Y29uc3QgdGhlbWVzID0gYXdhaXQgdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWVzKCk7XG5cdFx0Y29uc3QgY3VycmVudFRoZW1lID0gdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblxuXHRcdGNvbnN0IGxpZ2h0RW50cmllcyA9IHRvRW50cmllcyh0aGVtZXMuZmlsdGVyKHQgPT4gdC50eXBlID09PSBDb2xvclNjaGVtZS5MSUdIVCksIGxvY2FsaXplKCd0aGVtZXMuY2F0ZWdvcnkubGlnaHQnLCBcImxpZ2h0IHRoZW1lc1wiKSk7XG5cdFx0Y29uc3QgZGFya0VudHJpZXMgPSB0b0VudHJpZXModGhlbWVzLmZpbHRlcih0ID0+IHQudHlwZSA9PT0gQ29sb3JTY2hlbWUuREFSSyksIGxvY2FsaXplKCd0aGVtZXMuY2F0ZWdvcnkuZGFyaycsIFwiZGFyayB0aGVtZXNcIikpO1xuXHRcdGNvbnN0IGhjRW50cmllcyA9IHRvRW50cmllcyh0aGVtZXMuZmlsdGVyKHQgPT4gaXNIaWdoQ29udHJhc3QodC50eXBlKSksIGxvY2FsaXplKCd0aGVtZXMuY2F0ZWdvcnkuaGMnLCBcImhpZ2ggY29udHJhc3QgdGhlbWVzXCIpKTtcblxuXHRcdGxldCBwaWNrcztcblx0XHRzd2l0Y2ggKHByZWZlcnJlZENvbG9yU2NoZW1lKSB7XG5cdFx0XHRjYXNlIENvbG9yU2NoZW1lLkRBUks6XG5cdFx0XHRcdHBpY2tzID0gWy4uLmRhcmtFbnRyaWVzLCAuLi5saWdodEVudHJpZXMsIC4uLmhjRW50cmllc107XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDb2xvclNjaGVtZS5ISUdIX0NPTlRSQVNUX0RBUks6XG5cdFx0XHRjYXNlIENvbG9yU2NoZW1lLkhJR0hfQ09OVFJBU1RfTElHSFQ6XG5cdFx0XHRcdHBpY2tzID0gWy4uLmhjRW50cmllcywgLi4ubGlnaHRFbnRyaWVzLCAuLi5kYXJrRW50cmllc107XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDb2xvclNjaGVtZS5MSUdIVDpcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHBpY2tzID0gWy4uLmxpZ2h0RW50cmllcywgLi4uZGFya0VudHJpZXMsIC4uLmhjRW50cmllc107XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRhd2FpdCBwaWNrZXIub3BlblF1aWNrUGljayhwaWNrcywgY3VycmVudFRoZW1lKTtcblxuXHR9XG59KTtcblxuY29uc3QgU2VsZWN0RmlsZUljb25UaGVtZUNvbW1hbmRJZCA9ICd3b3JrYmVuY2guYWN0aW9uLnNlbGVjdEljb25UaGVtZSc7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTZWxlY3RGaWxlSWNvblRoZW1lQ29tbWFuZElkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2VsZWN0SWNvblRoZW1lLmxhYmVsJywgJ0ZpbGUgSWNvbiBUaGVtZScpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuUHJlZmVyZW5jZXMsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgdGhlbWVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hUaGVtZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHtcblx0XHRcdGluc3RhbGxNZXNzYWdlOiBsb2NhbGl6ZSgnaW5zdGFsbEljb25UaGVtZXMnLCBcIkluc3RhbGwgQWRkaXRpb25hbCBGaWxlIEljb24gVGhlbWVzLi4uXCIpLFxuXHRcdFx0cGxhY2Vob2xkZXJNZXNzYWdlOiBsb2NhbGl6ZSgndGhlbWVzLnNlbGVjdEljb25UaGVtZScsIFwiU2VsZWN0IEZpbGUgSWNvbiBUaGVtZSAoVXAvRG93biBLZXlzIHRvIFByZXZpZXcpXCIpLFxuXHRcdFx0bWFya2V0cGxhY2VUYWc6ICd0YWc6aWNvbi10aGVtZSdcblx0XHR9O1xuXHRcdGNvbnN0IHNldFRoZW1lID0gKHRoZW1lOiBJV29ya2JlbmNoVGhlbWUgfCB1bmRlZmluZWQsIHNldHRpbmdzVGFyZ2V0OiBUaGVtZVNldHRpbmdUYXJnZXQpID0+IHRoZW1lU2VydmljZS5zZXRGaWxlSWNvblRoZW1lKHRoZW1lIGFzIElXb3JrYmVuY2hGaWxlSWNvblRoZW1lLCBzZXR0aW5nc1RhcmdldCk7XG5cdFx0Y29uc3QgZ2V0TWFya2V0cGxhY2VDb2xvclRoZW1lcyA9IChwdWJsaXNoZXI6IHN0cmluZywgbmFtZTogc3RyaW5nLCB2ZXJzaW9uOiBzdHJpbmcpID0+IHRoZW1lU2VydmljZS5nZXRNYXJrZXRwbGFjZUZpbGVJY29uVGhlbWVzKHB1Ymxpc2hlciwgbmFtZSwgdmVyc2lvbik7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHBpY2tlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxlZFRoZW1lc1BpY2tlciwgb3B0aW9ucywgc2V0VGhlbWUsIGdldE1hcmtldHBsYWNlQ29sb3JUaGVtZXMpO1xuXG5cdFx0Y29uc3QgcGlja3M6IFF1aWNrUGlja0lucHV0PFRoZW1lSXRlbT5bXSA9IFtcblx0XHRcdHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnZmlsZUljb25UaGVtZUNhdGVnb3J5JywgJ2ZpbGUgaWNvbiB0aGVtZXMnKSB9LFxuXHRcdFx0eyBpZDogJycsIHRoZW1lOiBGaWxlSWNvblRoZW1lRGF0YS5ub0ljb25UaGVtZSwgbGFiZWw6IGxvY2FsaXplKCdub0ljb25UaGVtZUxhYmVsJywgJ05vbmUnKSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdub0ljb25UaGVtZURlc2MnLCAnRGlzYWJsZSBGaWxlIEljb25zJykgfSxcblx0XHRcdC4uLnRvRW50cmllcyhhd2FpdCB0aGVtZVNlcnZpY2UuZ2V0RmlsZUljb25UaGVtZXMoKSksXG5cdFx0XTtcblxuXHRcdGF3YWl0IHBpY2tlci5vcGVuUXVpY2tQaWNrKHBpY2tzLCB0aGVtZVNlcnZpY2UuZ2V0RmlsZUljb25UaGVtZSgpKTtcblx0fVxufSk7XG5cbmNvbnN0IFNlbGVjdFByb2R1Y3RJY29uVGhlbWVDb21tYW5kSWQgPSAnd29ya2JlbmNoLmFjdGlvbi5zZWxlY3RQcm9kdWN0SWNvblRoZW1lJztcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNlbGVjdFByb2R1Y3RJY29uVGhlbWVDb21tYW5kSWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzZWxlY3RQcm9kdWN0SWNvblRoZW1lLmxhYmVsJywgJ1Byb2R1Y3QgSWNvbiBUaGVtZScpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuUHJlZmVyZW5jZXMsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgdGhlbWVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hUaGVtZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHtcblx0XHRcdGluc3RhbGxNZXNzYWdlOiBsb2NhbGl6ZSgnaW5zdGFsbFByb2R1Y3RJY29uVGhlbWVzJywgXCJJbnN0YWxsIEFkZGl0aW9uYWwgUHJvZHVjdCBJY29uIFRoZW1lcy4uLlwiKSxcblx0XHRcdGJyb3dzZU1lc3NhZ2U6ICckKHBsdXMpICcgKyBsb2NhbGl6ZSgnYnJvd3NlUHJvZHVjdEljb25UaGVtZXMnLCBcIkJyb3dzZSBBZGRpdGlvbmFsIFByb2R1Y3QgSWNvbiBUaGVtZXMuLi5cIiksXG5cdFx0XHRwbGFjZWhvbGRlck1lc3NhZ2U6IGxvY2FsaXplKCd0aGVtZXMuc2VsZWN0UHJvZHVjdEljb25UaGVtZScsIFwiU2VsZWN0IFByb2R1Y3QgSWNvbiBUaGVtZSAoVXAvRG93biBLZXlzIHRvIFByZXZpZXcpXCIpLFxuXHRcdFx0bWFya2V0cGxhY2VUYWc6ICd0YWc6cHJvZHVjdC1pY29uLXRoZW1lJ1xuXHRcdH07XG5cdFx0Y29uc3Qgc2V0VGhlbWUgPSAodGhlbWU6IElXb3JrYmVuY2hUaGVtZSB8IHVuZGVmaW5lZCwgc2V0dGluZ3NUYXJnZXQ6IFRoZW1lU2V0dGluZ1RhcmdldCkgPT4gdGhlbWVTZXJ2aWNlLnNldFByb2R1Y3RJY29uVGhlbWUodGhlbWUgYXMgSVdvcmtiZW5jaFByb2R1Y3RJY29uVGhlbWUsIHNldHRpbmdzVGFyZ2V0KTtcblx0XHRjb25zdCBnZXRNYXJrZXRwbGFjZUNvbG9yVGhlbWVzID0gKHB1Ymxpc2hlcjogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIHZlcnNpb246IHN0cmluZykgPT4gdGhlbWVTZXJ2aWNlLmdldE1hcmtldHBsYWNlUHJvZHVjdEljb25UaGVtZXMocHVibGlzaGVyLCBuYW1lLCB2ZXJzaW9uKTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgcGlja2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbGVkVGhlbWVzUGlja2VyLCBvcHRpb25zLCBzZXRUaGVtZSwgZ2V0TWFya2V0cGxhY2VDb2xvclRoZW1lcyk7XG5cblx0XHRjb25zdCBwaWNrczogUXVpY2tQaWNrSW5wdXQ8VGhlbWVJdGVtPltdID0gW1xuXHRcdFx0eyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdwcm9kdWN0SWNvblRoZW1lQ2F0ZWdvcnknLCAncHJvZHVjdCBpY29uIHRoZW1lcycpIH0sXG5cdFx0XHR7IGlkOiBERUZBVUxUX1BST0RVQ1RfSUNPTl9USEVNRV9JRCwgdGhlbWU6IFByb2R1Y3RJY29uVGhlbWVEYXRhLmRlZmF1bHRUaGVtZSwgbGFiZWw6IGxvY2FsaXplKCdkZWZhdWx0UHJvZHVjdEljb25UaGVtZUxhYmVsJywgJ0RlZmF1bHQnKSB9LFxuXHRcdFx0Li4udG9FbnRyaWVzKGF3YWl0IHRoZW1lU2VydmljZS5nZXRQcm9kdWN0SWNvblRoZW1lcygpKSxcblx0XHRdO1xuXG5cdFx0YXdhaXQgcGlja2VyLm9wZW5RdWlja1BpY2socGlja3MsIHRoZW1lU2VydmljZS5nZXRQcm9kdWN0SWNvblRoZW1lKCkpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50cnlOZXdEZWZhdWx0VGhlbWVzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3RyeU5ld0RlZmF1bHRUaGVtZXMnLCBcIlRyeSBOZXcgRGVmYXVsdCBUaGVtZXNcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5QcmVmZXJlbmNlcyxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHRoZW1lU2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoVGhlbWVTZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBwcmV2aW91c1RoZW1lID0gdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHRjb25zdCBhbGxUaGVtZXMgPSBhd2FpdCB0aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZXMoKTtcblx0XHRjb25zdCBuZXdUaGVtZVNldHRpbmdzSWRzID0gbmV3IFNldChbVGhlbWVTZXR0aW5nRGVmYXVsdHMuQ09MT1JfVEhFTUVfTElHSFQsIFRoZW1lU2V0dGluZ0RlZmF1bHRzLkNPTE9SX1RIRU1FX0RBUktdKTtcblx0XHRjb25zdCB0aGVtZXMgPSBhbGxUaGVtZXMuZmlsdGVyKHQgPT4gbmV3VGhlbWVTZXR0aW5nc0lkcy5oYXModC5zZXR0aW5nc0lkKSk7XG5cblx0XHRjb25zdCBpdGVtczogSVF1aWNrUGlja0l0ZW1bXSA9IHRoZW1lcy5tYXAodCA9PiAoe1xuXHRcdFx0aWQ6IHQuaWQsXG5cdFx0XHRsYWJlbDogdC5sYWJlbCxcblx0XHRcdGRlc2NyaXB0aW9uOiB0LmRlc2NyaXB0aW9uLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHBpY2tlciA9IGRpc3Bvc2FibGVzLmFkZChxdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0+KCkpO1xuXHRcdHBpY2tlci5pdGVtcyA9IGl0ZW1zO1xuXHRcdHBpY2tlci5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdwaWNrTmV3VGhlbWUnLCBcIlBpY2sgYSBuZXcgZGVmYXVsdCB0aGVtZVwiKTtcblx0XHRwaWNrZXIuY2FuU2VsZWN0TWFueSA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgcHJlZmVycmVkSWQgPSAocHJldmlvdXNUaGVtZS50eXBlID09PSBDb2xvclNjaGVtZS5MSUdIVCB8fCBwcmV2aW91c1RoZW1lLnR5cGUgPT09IENvbG9yU2NoZW1lLkhJR0hfQ09OVFJBU1RfTElHSFQpID8gVGhlbWVTZXR0aW5nRGVmYXVsdHMuQ09MT1JfVEhFTUVfTElHSFQgOiBUaGVtZVNldHRpbmdEZWZhdWx0cy5DT0xPUl9USEVNRV9EQVJLO1xuXHRcdGNvbnN0IGFjdGl2ZUl0ZW0gPSBpdGVtcy5maW5kKGkgPT4gdGhlbWVzLmZpbmQodCA9PiB0LmlkID09PSBpLmlkKT8uc2V0dGluZ3NJZCA9PT0gcHJlZmVycmVkSWQpO1xuXHRcdGlmIChhY3RpdmVJdGVtKSB7XG5cdFx0XHRwaWNrZXIuYWN0aXZlSXRlbXMgPSBbYWN0aXZlSXRlbV07XG5cdFx0fVxuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZENoYW5nZUFjdGl2ZShzZWxlY3RlZCA9PiB7XG5cdFx0XHRpZiAoc2VsZWN0ZWRbMF0pIHtcblx0XHRcdFx0Y29uc3QgdGhlbWUgPSB0aGVtZXMuZmluZCh0ID0+IHQuaWQgPT09IHNlbGVjdGVkWzBdLmlkKTtcblx0XHRcdFx0aWYgKHRoZW1lKSB7XG5cdFx0XHRcdFx0dGhlbWVTZXJ2aWNlLnNldENvbG9yVGhlbWUodGhlbWUsICdwcmV2aWV3Jyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdGNvbnN0IHNlbGVjdGVkID0gcGlja2VyLmFjdGl2ZUl0ZW1zWzBdO1xuXHRcdFx0Y29uc3QgdGhlbWUgPSBzZWxlY3RlZCA/IHRoZW1lcy5maW5kKHQgPT4gdC5pZCA9PT0gc2VsZWN0ZWQuaWQpIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRwaWNrZXIuaGlkZSgpO1xuXG5cdFx0XHRpZiAoIXRoZW1lKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGVtZVNlcnZpY2Uuc2V0Q29sb3JUaGVtZSh0aGVtZSwgJ2F1dG8nKTtcblx0XHRcdFx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9MSUdIVF9USEVNRSwgVGhlbWVTZXR0aW5nRGVmYXVsdHMuQ09MT1JfVEhFTUVfTElHSFQpO1xuXHRcdFx0XHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFRoZW1lU2V0dGluZ3MuUFJFRkVSUkVEX0RBUktfVEhFTUUsIFRoZW1lU2V0dGluZ0RlZmF1bHRzLkNPTE9SX1RIRU1FX0RBUkspO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikpIHtcblx0XHRcdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdGlmICghcGlja2VyLnNlbGVjdGVkSXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhlbWVTZXJ2aWNlLnNldENvbG9yVGhlbWUocHJldmlvdXNUaGVtZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9KSk7XG5cdFx0fSkuZmluYWxseSgoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpO1xuXG5cdFx0cGlja2VyLnNob3coKTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5wcmV2aWV3Q29sb3JUaGVtZScsIGFzeW5jIGZ1bmN0aW9uIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZXh0ZW5zaW9uOiB7IHB1Ymxpc2hlcjogc3RyaW5nOyBuYW1lOiBzdHJpbmc7IHZlcnNpb246IHN0cmluZyB9LCB0aGVtZVNldHRpbmdzSWQ/OiBzdHJpbmcpIHtcblx0Y29uc3QgdGhlbWVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hUaGVtZVNlcnZpY2UpO1xuXG5cdGxldCB0aGVtZXMgPSBmaW5kQnVpbHRJblRoZW1lcyhhd2FpdCB0aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZXMoKSwgZXh0ZW5zaW9uKTtcblx0aWYgKHRoZW1lcy5sZW5ndGggPT09IDApIHtcblx0XHR0aGVtZXMgPSBhd2FpdCB0aGVtZVNlcnZpY2UuZ2V0TWFya2V0cGxhY2VDb2xvclRoZW1lcyhleHRlbnNpb24ucHVibGlzaGVyLCBleHRlbnNpb24ubmFtZSwgZXh0ZW5zaW9uLnZlcnNpb24pO1xuXHR9XG5cdGZvciAoY29uc3QgdGhlbWUgb2YgdGhlbWVzKSB7XG5cdFx0aWYgKCF0aGVtZVNldHRpbmdzSWQgfHwgdGhlbWUuc2V0dGluZ3NJZCA9PT0gdGhlbWVTZXR0aW5nc0lkKSB7XG5cdFx0XHRhd2FpdCB0aGVtZVNlcnZpY2Uuc2V0Q29sb3JUaGVtZSh0aGVtZSwgJ3ByZXZpZXcnKTtcblx0XHRcdHJldHVybiB0aGVtZS5zZXR0aW5nc0lkO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufSk7XG5cbmZ1bmN0aW9uIGZpbmRCdWlsdEluVGhlbWVzKHRoZW1lczogSVdvcmtiZW5jaENvbG9yVGhlbWVbXSwgZXh0ZW5zaW9uOiB7IHB1Ymxpc2hlcjogc3RyaW5nOyBuYW1lOiBzdHJpbmcgfSk6IElXb3JrYmVuY2hDb2xvclRoZW1lW10ge1xuXHRyZXR1cm4gdGhlbWVzLmZpbHRlcigoeyBleHRlbnNpb25EYXRhIH0pID0+IGV4dGVuc2lvbkRhdGEgJiYgZXh0ZW5zaW9uRGF0YS5leHRlbnNpb25Jc0J1aWx0aW4gJiYgZXF1YWxzSWdub3JlQ2FzZShleHRlbnNpb25EYXRhLmV4dGVuc2lvblB1Ymxpc2hlciwgZXh0ZW5zaW9uLnB1Ymxpc2hlcikgJiYgZXF1YWxzSWdub3JlQ2FzZShleHRlbnNpb25EYXRhLmV4dGVuc2lvbk5hbWUsIGV4dGVuc2lvbi5uYW1lKSk7XG59XG5cbmZ1bmN0aW9uIGNvbmZpZ3VyYXRpb25FbnRyeShsYWJlbDogc3RyaW5nLCBjb25maWd1cmVJdGVtOiBDb25maWd1cmVJdGVtKTogUXVpY2tQaWNrSW5wdXQ8VGhlbWVJdGVtPiB7XG5cdHJldHVybiB7XG5cdFx0aWQ6IHVuZGVmaW5lZCxcblx0XHRsYWJlbDogbGFiZWwsXG5cdFx0YWx3YXlzU2hvdzogdHJ1ZSxcblx0XHRidXR0b25zOiBbY29uZmlndXJlQnV0dG9uXSxcblx0XHRjb25maWd1cmVJdGVtOiBjb25maWd1cmVJdGVtXG5cdH07XG59XG5cbmludGVyZmFjZSBUaGVtZUl0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHRoZW1lPzogSVdvcmtiZW5jaFRoZW1lO1xuXHRyZWFkb25seSBnYWxsZXJ5RXh0ZW5zaW9uPzogSUdhbGxlcnlFeHRlbnNpb247XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBhbHdheXNTaG93PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgY29uZmlndXJlSXRlbT86IENvbmZpZ3VyZUl0ZW07XG59XG5cbmZ1bmN0aW9uIGlzSXRlbShpOiBRdWlja1BpY2tJbnB1dDxUaGVtZUl0ZW0+KTogaSBpcyBUaGVtZUl0ZW0ge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0cmV0dXJuICg8YW55PmkpWyd0eXBlJ10gIT09ICdzZXBhcmF0b3InO1xufVxuXG5jb25zdCBkZWZhdWx0VGhlbWVEZXNjcmlwdGlvbnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdFtUaGVtZVNldHRpbmdEZWZhdWx0cy5DT0xPUl9USEVNRV9MSUdIVF06IGxvY2FsaXplKCdkZWZhdWx0TGlnaHQnLCBcIkRlZmF1bHQgTGlnaHRcIiksXG5cdFtUaGVtZVNldHRpbmdEZWZhdWx0cy5DT0xPUl9USEVNRV9EQVJLXTogbG9jYWxpemUoJ2RlZmF1bHREYXJrJywgXCJEZWZhdWx0IERhcmtcIiksXG59O1xuXG5mdW5jdGlvbiB0b0VudHJ5KHRoZW1lOiBJV29ya2JlbmNoVGhlbWUpOiBUaGVtZUl0ZW0ge1xuXHRjb25zdCBzZXR0aW5nSWQgPSB0aGVtZS5zZXR0aW5nc0lkID8/IHVuZGVmaW5lZDtcblx0Y29uc3QgaXRlbTogVGhlbWVJdGVtID0ge1xuXHRcdGlkOiB0aGVtZS5pZCxcblx0XHR0aGVtZTogdGhlbWUsXG5cdFx0bGFiZWw6IHRoZW1lLmxhYmVsLFxuXHRcdGRlc2NyaXB0aW9uOiBkZWZhdWx0VGhlbWVEZXNjcmlwdGlvbnNbc2V0dGluZ0lkID8/ICcnXSA/PyB0aGVtZS5kZXNjcmlwdGlvbiA/PyAodGhlbWUubGFiZWwgPT09IHNldHRpbmdJZCA/IHVuZGVmaW5lZCA6IHNldHRpbmdJZCksXG5cdH07XG5cdGlmICh0aGVtZS5leHRlbnNpb25EYXRhKSB7XG5cdFx0aXRlbS5idXR0b25zID0gW2NvbmZpZ3VyZUJ1dHRvbl07XG5cdH1cblx0cmV0dXJuIGl0ZW07XG59XG5cbmZ1bmN0aW9uIHRvRW50cmllcyh0aGVtZXM6IEFycmF5PElXb3JrYmVuY2hUaGVtZT4sIGxhYmVsPzogc3RyaW5nKTogUXVpY2tQaWNrSW5wdXQ8VGhlbWVJdGVtPltdIHtcblx0Y29uc3QgcGlubmVkSWRzID0gbmV3IFNldChbVGhlbWVTZXR0aW5nRGVmYXVsdHMuQ09MT1JfVEhFTUVfREFSSywgVGhlbWVTZXR0aW5nRGVmYXVsdHMuQ09MT1JfVEhFTUVfTElHSFRdKTtcblx0Y29uc3Qgc29ydGVyID0gKHQxOiBUaGVtZUl0ZW0sIHQyOiBUaGVtZUl0ZW0pID0+IHtcblx0XHRjb25zdCBwaW4xID0gcGlubmVkSWRzLmhhcyh0MS50aGVtZT8uc2V0dGluZ3NJZCA/PyAnJyk7XG5cdFx0Y29uc3QgcGluMiA9IHBpbm5lZElkcy5oYXModDIudGhlbWU/LnNldHRpbmdzSWQgPz8gJycpO1xuXHRcdGlmIChwaW4xICE9PSBwaW4yKSB7XG5cdFx0XHRyZXR1cm4gcGluMSA/IC0xIDogMTtcblx0XHR9XG5cdFx0cmV0dXJuIHQxLmxhYmVsLmxvY2FsZUNvbXBhcmUodDIubGFiZWwpO1xuXHR9O1xuXHRjb25zdCBlbnRyaWVzOiBRdWlja1BpY2tJbnB1dDxUaGVtZUl0ZW0+W10gPSB0aGVtZXMubWFwKHRvRW50cnkpLnNvcnQoc29ydGVyKTtcblx0aWYgKGVudHJpZXMubGVuZ3RoID4gMCAmJiBsYWJlbCkge1xuXHRcdGVudHJpZXMudW5zaGlmdCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbCB9KTtcblx0fVxuXHRyZXR1cm4gZW50cmllcztcbn1cblxuY29uc3QgY29uZmlndXJlQnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUobWFuYWdlRXh0ZW5zaW9uSWNvbiksXG5cdHRvb2x0aXA6IGxvY2FsaXplKCdtYW5hZ2UgZXh0ZW5zaW9uJywgXCJNYW5hZ2UgRXh0ZW5zaW9uXCIpLFxufTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5nZW5lcmF0ZUNvbG9yVGhlbWUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZ2VuZXJhdGVDb2xvclRoZW1lLmxhYmVsJywgJ0dlbmVyYXRlIENvbG9yIFRoZW1lIEZyb20gQ3VycmVudCBTZXR0aW5ncycpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHRoZW1lU2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoVGhlbWVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHRoZW1lID0gdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHRjb25zdCBjb2xvcnMgPSBSZWdpc3RyeS5hczxJQ29sb3JSZWdpc3RyeT4oQ29sb3JSZWdpc3RyeUV4dGVuc2lvbnMuQ29sb3JDb250cmlidXRpb24pLmdldENvbG9ycygpO1xuXHRcdGNvbnN0IGNvbG9ySWRzID0gY29sb3JzLmZpbHRlcihjID0+ICFjLmRlcHJlY2F0aW9uTWVzc2FnZSkubWFwKGMgPT4gYy5pZCkuc29ydCgpO1xuXHRcdGNvbnN0IHJlc3VsdGluZ0NvbG9yczogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfCBudWxsIH0gPSB7fTtcblx0XHRjb25zdCBpbmhlcml0ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBjb2xvcklkIG9mIGNvbG9ySWRzKSB7XG5cdFx0XHRjb25zdCBjb2xvciA9IHRoZW1lLmdldENvbG9yKGNvbG9ySWQsIGZhbHNlKTtcblx0XHRcdGlmIChjb2xvcikge1xuXHRcdFx0XHRyZXN1bHRpbmdDb2xvcnNbY29sb3JJZF0gPSBDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdEhleEEoY29sb3IsIHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aW5oZXJpdGVkLnB1c2goY29sb3JJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IG51bGxEZWZhdWx0cyA9IFtdO1xuXHRcdGZvciAoY29uc3QgaWQgb2YgaW5oZXJpdGVkKSB7XG5cdFx0XHRjb25zdCBjb2xvciA9IHRoZW1lLmdldENvbG9yKGlkKTtcblx0XHRcdGlmIChjb2xvcikge1xuXHRcdFx0XHRyZXN1bHRpbmdDb2xvcnNbJ19fJyArIGlkXSA9IENvbG9yLkZvcm1hdC5DU1MuZm9ybWF0SGV4QShjb2xvciwgdHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRudWxsRGVmYXVsdHMucHVzaChpZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgaWQgb2YgbnVsbERlZmF1bHRzKSB7XG5cdFx0XHRyZXN1bHRpbmdDb2xvcnNbJ19fJyArIGlkXSA9IG51bGw7XG5cdFx0fVxuXHRcdGxldCBjb250ZW50cyA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdCckc2NoZW1hJzogY29sb3JUaGVtZVNjaGVtYUlkLFxuXHRcdFx0dHlwZTogdGhlbWUudHlwZSxcblx0XHRcdGNvbG9yczogcmVzdWx0aW5nQ29sb3JzLFxuXHRcdFx0dG9rZW5Db2xvcnM6IHRoZW1lLnRva2VuQ29sb3JzLmZpbHRlcih0ID0+ICEhdC5zY29wZSlcblx0XHR9LCBudWxsLCAnXFx0Jyk7XG5cdFx0Y29udGVudHMgPSBjb250ZW50cy5yZXBsYWNlKC9cXFwiX18vZywgJy8vXCInKTtcblxuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdHJldHVybiBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogdW5kZWZpbmVkLCBjb250ZW50cywgbGFuZ3VhZ2VJZDogJ2pzb25jJywgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9KTtcblx0fVxufSk7XG5cbmNvbnN0IHRvZ2dsZUxpZ2h0RGFya1RoZW1lc0NvbW1hbmRJZCA9ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZUxpZ2h0RGFya1RoZW1lcyc7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiB0b2dnbGVMaWdodERhcmtUaGVtZXNDb21tYW5kSWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0b2dnbGVMaWdodERhcmtUaGVtZXMubGFiZWwnLCAnVG9nZ2xlIGJldHdlZW4gTGlnaHQvRGFyayBUaGVtZXMnKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlByZWZlcmVuY2VzLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB0aGVtZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaFRoZW1lU2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBwcmVmZXJlbmNlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSk7XG5cblx0XHRpZiAoY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGhlbWVTZXR0aW5ncy5ERVRFQ1RfQ09MT1JfU0NIRU1FKSkge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGxvY2FsaXplKHsga2V5OiAnY2Fubm90VG9nZ2xlJywgY29tbWVudDogWyd7MH0gaXMgYSBzZXR0aW5nIG5hbWUnXSB9LCBcIkNhbm5vdCB0b2dnbGUgYmV0d2VlbiBsaWdodCBhbmQgZGFyayB0aGVtZXMgd2hlbiBgezB9YCBpcyBlbmFibGVkIGluIHNldHRpbmdzLlwiLCBUaGVtZVNldHRpbmdzLkRFVEVDVF9DT0xPUl9TQ0hFTUUpO1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuSW5mbywgbWVzc2FnZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdnb1RvU2V0dGluZycsIFwiT3BlbiBTZXR0aW5nc1wiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiBwcmVmZXJlbmNlc1NlcnZpY2Uub3BlblVzZXJTZXR0aW5ncyh7IHF1ZXJ5OiBUaGVtZVNldHRpbmdzLkRFVEVDVF9DT0xPUl9TQ0hFTUUgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50VGhlbWUgPSB0aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXHRcdGxldCBuZXdTZXR0aW5nc0lkOiBzdHJpbmcgPSBUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9EQVJLX1RIRU1FO1xuXHRcdHN3aXRjaCAoY3VycmVudFRoZW1lLnR5cGUpIHtcblx0XHRcdGNhc2UgQ29sb3JTY2hlbWUuTElHSFQ6XG5cdFx0XHRcdG5ld1NldHRpbmdzSWQgPSBUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9EQVJLX1RIRU1FO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ29sb3JTY2hlbWUuREFSSzpcblx0XHRcdFx0bmV3U2V0dGluZ3NJZCA9IFRoZW1lU2V0dGluZ3MuUFJFRkVSUkVEX0xJR0hUX1RIRU1FO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ29sb3JTY2hlbWUuSElHSF9DT05UUkFTVF9MSUdIVDpcblx0XHRcdFx0bmV3U2V0dGluZ3NJZCA9IFRoZW1lU2V0dGluZ3MuUFJFRkVSUkVEX0hDX0RBUktfVEhFTUU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDb2xvclNjaGVtZS5ISUdIX0NPTlRSQVNUX0RBUks6XG5cdFx0XHRcdG5ld1NldHRpbmdzSWQgPSBUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9IQ19MSUdIVF9USEVNRTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGhlbWVTZXR0aW5nSWQ6IHN0cmluZyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKG5ld1NldHRpbmdzSWQpO1xuXG5cdFx0aWYgKHRoZW1lU2V0dGluZ0lkICYmIHR5cGVvZiB0aGVtZVNldHRpbmdJZCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbnN0IHRoZW1lID0gKGF3YWl0IHRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lcygpKS5maW5kKHQgPT4gdC5zZXR0aW5nc0lkID09PSB0aGVtZVNldHRpbmdJZCk7XG5cdFx0XHRpZiAodGhlbWUpIHtcblx0XHRcdFx0dGhlbWVTZXJ2aWNlLnNldENvbG9yVGhlbWUodGhlbWUuaWQsICdhdXRvJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuY29uc3QgYnJvd3NlQ29sb3JUaGVtZXNJbk1hcmtldHBsYWNlQ29tbWFuZElkID0gJ3dvcmtiZW5jaC5hY3Rpb24uYnJvd3NlQ29sb3JUaGVtZXNJbk1hcmtldHBsYWNlJztcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IGJyb3dzZUNvbG9yVGhlbWVzSW5NYXJrZXRwbGFjZUNvbW1hbmRJZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZUNvbG9yVGhlbWVJbk1hcmtldFBsYWNlLmxhYmVsJywgJ0Jyb3dzZSBDb2xvciBUaGVtZXMgaW4gTWFya2V0cGxhY2UnKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlByZWZlcmVuY2VzLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBtYXJrZXRwbGFjZVRhZyA9ICdjYXRlZ29yeTp0aGVtZXMnO1xuXHRcdGNvbnN0IHRoZW1lU2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoVGhlbWVTZXJ2aWNlKTtcblx0XHRjb25zdCBleHRlbnNpb25HYWxsZXJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UpO1xuXHRcdGNvbnN0IGV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlKTtcblx0XHRjb25zdCBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRpZiAoIWV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFhd2FpdCBleHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2Uuc3VwcG9ydHNFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VzKCkpIHtcblx0XHRcdGF3YWl0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2gobWFya2V0cGxhY2VUYWcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnJlbnRUaGVtZSA9IHRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCk7XG5cdFx0Y29uc3QgZ2V0TWFya2V0cGxhY2VDb2xvclRoZW1lcyA9IChwdWJsaXNoZXI6IHN0cmluZywgbmFtZTogc3RyaW5nLCB2ZXJzaW9uOiBzdHJpbmcpID0+IHRoZW1lU2VydmljZS5nZXRNYXJrZXRwbGFjZUNvbG9yVGhlbWVzKHB1Ymxpc2hlciwgbmFtZSwgdmVyc2lvbik7XG5cblx0XHRsZXQgc2VsZWN0VGhlbWVUaW1lb3V0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBzZWxlY3RUaGVtZSA9ICh0aGVtZTogSVdvcmtiZW5jaFRoZW1lIHwgdW5kZWZpbmVkLCBhcHBseVRoZW1lOiBib29sZWFuKSA9PiB7XG5cdFx0XHRpZiAoc2VsZWN0VGhlbWVUaW1lb3V0KSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dChzZWxlY3RUaGVtZVRpbWVvdXQpO1xuXHRcdFx0fVxuXHRcdFx0c2VsZWN0VGhlbWVUaW1lb3V0ID0gbWFpbldpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0c2VsZWN0VGhlbWVUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBuZXdUaGVtZSA9ICh0aGVtZSA/PyBjdXJyZW50VGhlbWUpIGFzIElXb3JrYmVuY2hUaGVtZTtcblx0XHRcdFx0dGhlbWVTZXJ2aWNlLnNldENvbG9yVGhlbWUobmV3VGhlbWUgYXMgSVdvcmtiZW5jaENvbG9yVGhlbWUsIGFwcGx5VGhlbWUgPyAnYXV0bycgOiAncHJldmlldycpLnRoZW4odW5kZWZpbmVkLFxuXHRcdFx0XHRcdGVyciA9PiB7XG5cdFx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0XHRcdFx0dGhlbWVTZXJ2aWNlLnNldENvbG9yVGhlbWUoY3VycmVudFRoZW1lLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0KTtcblx0XHRcdH0sIGFwcGx5VGhlbWUgPyAwIDogMjAwKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgbWFya2V0cGxhY2VUaGVtZVBpY2tlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hcmtldHBsYWNlVGhlbWVzUGlja2VyLCBnZXRNYXJrZXRwbGFjZUNvbG9yVGhlbWVzLCBtYXJrZXRwbGFjZVRhZyk7XG5cdFx0YXdhaXQgbWFya2V0cGxhY2VUaGVtZVBpY2tlci5vcGVuUXVpY2tQaWNrKCcnLCB0aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLCBzZWxlY3RUaGVtZSkudGhlbih1bmRlZmluZWQsIG9uVW5leHBlY3RlZEVycm9yKTtcblx0fVxufSk7XG5cbmNvbnN0IFRoZW1lc1N1Yk1lbnUgPSBuZXcgTWVudUlkKCdUaGVtZXNTdWJNZW51Jyk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkdsb2JhbEFjdGl2aXR5LCB7XG5cdHRpdGxlOiBsb2NhbGl6ZSgndGhlbWVzJywgXCJUaGVtZXNcIiksXG5cdHN1Ym1lbnU6IFRoZW1lc1N1Yk1lbnUsXG5cdGdyb3VwOiAnMl9jb25maWd1cmF0aW9uJyxcblx0b3JkZXI6IDdcbn0gc2F0aXNmaWVzIElTdWJtZW51SXRlbSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJQcmVmZXJlbmNlc01lbnUsIHtcblx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlTZWxlY3RUaGVtZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlRoZW1lc1wiKSxcblx0c3VibWVudTogVGhlbWVzU3ViTWVudSxcblx0Z3JvdXA6ICcyX2NvbmZpZ3VyYXRpb24nLFxuXHRvcmRlcjogN1xufSBzYXRpc2ZpZXMgSVN1Ym1lbnVJdGVtKTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKFRoZW1lc1N1Yk1lbnUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBTZWxlY3RDb2xvclRoZW1lQ29tbWFuZElkLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2VsZWN0VGhlbWUubGFiZWwnLCAnQ29sb3IgVGhlbWUnKVxuXHR9LFxuXHRvcmRlcjogMVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShUaGVtZXNTdWJNZW51LCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogU2VsZWN0RmlsZUljb25UaGVtZUNvbW1hbmRJZCxcblx0XHR0aXRsZTogbG9jYWxpemUoJ3RoZW1lcy5zZWxlY3RJY29uVGhlbWUubGFiZWwnLCBcIkZpbGUgSWNvbiBUaGVtZVwiKVxuXHR9LFxuXHRvcmRlcjogMlxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShUaGVtZXNTdWJNZW51LCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogU2VsZWN0UHJvZHVjdEljb25UaGVtZUNvbW1hbmRJZCxcblx0XHR0aXRsZTogbG9jYWxpemUoJ3RoZW1lcy5zZWxlY3RQcm9kdWN0SWNvblRoZW1lLmxhYmVsJywgXCJQcm9kdWN0IEljb24gVGhlbWVcIilcblx0fSxcblx0b3JkZXI6IDNcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsUUFBUSxVQUFVLGVBQWU7QUFDMUMsU0FBUyxjQUFjLFFBQVEsU0FBUyx1QkFBcUM7QUFDN0UsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx3QkFBd0ksZUFBZSw0QkFBNEI7QUFDNUwsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUywwQkFBMEIsbUNBQXNEO0FBQ3pGLFNBQXlCLGNBQWMsK0JBQStCO0FBQ3RFLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsYUFBYTtBQUN0QixTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCLHlCQUF5QjtBQUN2RCxTQUE0QixvQkFBZ0QsZ0NBQWdEO0FBQzVILFNBQVMsK0JBQStCLDRCQUE0QjtBQUNwRSxTQUFTLHdCQUF3QjtBQUNqQyxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQkFBa0Isd0JBQXdCO0FBQ25ELFNBQVMsZUFBZTtBQUN4QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWU7QUFDeEIsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FB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Q3hGLFNBQVM7QUFBQSxFQUNULE9BQU87QUFBQSxFQUNQLE9BQU87QUFDUixDQUF3QjtBQUV4QixhQUFhLGVBQWUsZUFBZTtBQUFBLEVBQzFDLFNBQVM7QUFBQSxJQUNSLElBQUk7QUFBQSxJQUNKLE9BQU8sU0FBUyxxQkFBcUIsYUFBYTtBQUFBLEVBQ25EO0FBQUEsRUFDQSxPQUFPO0FBQ1IsQ0FBQztBQUVELGFBQWEsZUFBZSxlQUFlO0FBQUEsRUFDMUMsU0FBUztBQUFBLElBQ1IsSUFBSTtBQUFBLElBQ0osT0FBTyxTQUFTLGdDQUFnQyxpQkFBaUI7QUFBQSxFQUNsRTtBQUFBLEVBQ0EsT0FBTztBQUNSLENBQUM7QUFFRCxhQUFhLGVBQWUsZUFBZTtBQUFBLEVBQzFDLFNBQVM7QUFBQSxJQUNSLElBQUk7QUFBQSxJQUNKLE9BQU8sU0FBUyx1Q0FBdUMsb0JBQW9CO0FBQUEsRUFDNUU7QUFBQSxFQUNBLE9BQU87QUFDUixDQUFDOyIsCiAgIm5hbWVzIjogWyJDb25maWd1cmVJdGVtIiwgImkiLCAiXyIsICJwaWNrZXIiXQp9Cg==
