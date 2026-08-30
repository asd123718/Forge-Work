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
import * as nls from "../../../../nls.js";
import * as types from "../../../../base/common/types.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { IWorkbenchThemeService, ExtensionData, ThemeSettings, ThemeSettingDefaults, COLOR_THEME_DARK_INITIAL_COLORS, COLOR_THEME_LIGHT_INITIAL_COLORS, migrateThemeSettingsId } from "../common/workbenchThemeService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import * as errors from "../../../../base/common/errors.js";
import { IConfigurationService, ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { ColorThemeData } from "../common/colorThemeData.js";
import { Extensions as ThemingExtensions } from "../../../../platform/theme/common/themeService.js";
import { Emitter } from "../../../../base/common/event.js";
import { registerFileIconThemeSchemas } from "../common/fileIconThemeSchema.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { FileIconThemeData, FileIconThemeLoader } from "./fileIconThemeData.js";
import { createStyleSheet } from "../../../../base/browser/domStylesheets.js";
import { IBrowserWorkbenchEnvironmentService } from "../../environment/browser/environmentService.js";
import { IFileService, FileChangeType } from "../../../../platform/files/common/files.js";
import * as resources from "../../../../base/common/resources.js";
import { registerColorThemeSchemas } from "../common/colorThemeSchema.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { getRemoteAuthority } from "../../../../platform/remote/common/remoteHosts.js";
import { IWorkbenchLayoutService } from "../../layout/browser/layoutService.js";
import { IExtensionResourceLoaderService } from "../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js";
import { ThemeRegistry, registerColorThemeExtensionPoint, registerFileIconThemeExtensionPoint, registerProductIconThemeExtensionPoint } from "../common/themeExtensionPoints.js";
import { updateColorThemeConfigurationSchemas, updateFileIconThemeConfigurationSchemas, ThemeConfiguration, updateProductIconThemeConfigurationSchemas } from "../common/themeConfiguration.js";
import { ProductIconThemeData, DEFAULT_PRODUCT_ICON_THEME_ID } from "./productIconThemeData.js";
import { registerProductIconThemeSchemas } from "../common/productIconThemeSchema.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { isWeb } from "../../../../base/common/platform.js";
import { ColorScheme, ThemeTypeSelector } from "../../../../platform/theme/common/theme.js";
import { IHostColorSchemeService } from "../common/hostColorSchemeService.js";
import { RunOnceScheduler, Sequencer } from "../../../../base/common/async.js";
import { IUserDataInitializationService } from "../../userData/browser/userDataInit.js";
import { getIconsStyleSheet } from "../../../../platform/theme/browser/iconsStyleSheet.js";
import { getColorRegistry } from "../../../../platform/theme/common/colorRegistry.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { generateColorThemeCSS } from "./colorThemeCss.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IHostService } from "../../host/browser/host.js";
import { toAction } from "../../../../base/common/actions.js";
const defaultThemeExtensionId = "vscode-theme-defaults";
const DEFAULT_FILE_ICON_THEME_ID = "vscode.vscode-theme-seti-vs-seti";
const fileIconsEnabledClass = "file-icons-enabled";
const colorThemeRulesClassName = "contributedColorTheme";
const fileIconThemeRulesClassName = "contributedFileIconTheme";
const productIconThemeRulesClassName = "contributedProductIconTheme";
const themingRegistry = Registry.as(ThemingExtensions.ThemingContribution);
function validateThemeId(theme) {
  switch (theme) {
    case ThemeTypeSelector.VS:
      return `vs ${defaultThemeExtensionId}-themes-light_vs-json`;
    case ThemeTypeSelector.VS_DARK:
      return `vs-dark ${defaultThemeExtensionId}-themes-dark_vs-json`;
    case ThemeTypeSelector.HC_BLACK:
      return `hc-black ${defaultThemeExtensionId}-themes-hc_black-json`;
    case ThemeTypeSelector.HC_LIGHT:
      return `hc-light ${defaultThemeExtensionId}-themes-hc_light-json`;
  }
  return theme;
}
const colorThemesExtPoint = registerColorThemeExtensionPoint();
const fileIconThemesExtPoint = registerFileIconThemeExtensionPoint();
const productIconThemesExtPoint = registerProductIconThemeExtensionPoint();
let WorkbenchThemeService = class extends Disposable {
  constructor(extensionService, storageService, configurationService, telemetryService, environmentService, fileService, extensionResourceLoaderService, layoutService, logService, hostColorService, userDataInitializationService, languageService, notificationService, hostService) {
    super();
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.telemetryService = telemetryService;
    this.environmentService = environmentService;
    this.extensionResourceLoaderService = extensionResourceLoaderService;
    this.logService = logService;
    this.hostColorService = hostColorService;
    this.userDataInitializationService = userDataInitializationService;
    this.languageService = languageService;
    this.notificationService = notificationService;
    this.hostService = hostService;
    this.themeExtensionsActivated = /* @__PURE__ */ new Map();
    this.container = layoutService.mainContainer;
    this.settings = new ThemeConfiguration(configurationService, hostColorService);
    this.colorThemeRegistry = this._register(new ThemeRegistry(colorThemesExtPoint, ColorThemeData.fromExtensionTheme));
    this.colorThemeWatcher = this._register(new ThemeFileWatcher(fileService, environmentService, this.reloadCurrentColorTheme.bind(this)));
    this.onColorThemeChange = this._register(new Emitter({ leakWarningThreshold: 400, leakWarningName: "ThemeService.onColorThemeChange" }));
    this.currentColorTheme = ColorThemeData.createUnloadedTheme("");
    this.colorThemeSequencer = new Sequencer();
    this.fileIconThemeWatcher = this._register(new ThemeFileWatcher(fileService, environmentService, this.reloadCurrentFileIconTheme.bind(this)));
    this.fileIconThemeRegistry = this._register(new ThemeRegistry(fileIconThemesExtPoint, FileIconThemeData.fromExtensionTheme, true, FileIconThemeData.noIconTheme));
    this.fileIconThemeLoader = new FileIconThemeLoader(extensionResourceLoaderService, languageService);
    this.onFileIconThemeChange = this._register(new Emitter({ leakWarningThreshold: 400, leakWarningName: "ThemeService.onFileIconThemeChange" }));
    this.currentFileIconTheme = FileIconThemeData.createUnloadedTheme("");
    this.fileIconThemeSequencer = new Sequencer();
    this.productIconThemeWatcher = this._register(new ThemeFileWatcher(fileService, environmentService, this.reloadCurrentProductIconTheme.bind(this)));
    this.productIconThemeRegistry = this._register(new ThemeRegistry(productIconThemesExtPoint, ProductIconThemeData.fromExtensionTheme, true, ProductIconThemeData.defaultTheme));
    this.onProductIconThemeChange = this._register(new Emitter());
    this.currentProductIconTheme = ProductIconThemeData.createUnloadedTheme("");
    this.productIconThemeSequencer = new Sequencer();
    this._register(this.onDidColorThemeChange((theme) => getColorRegistry().notifyThemeUpdate(theme)));
    let themeData = ColorThemeData.fromStorageData(this.storageService);
    const previousColorThemeSetting = themeData?.settingsId;
    const colorThemeSetting = this.settings.colorTheme;
    if (themeData && colorThemeSetting !== themeData.settingsId) {
      themeData = void 0;
    }
    const defaultColorMap = colorThemeSetting === ThemeSettingDefaults.COLOR_THEME_LIGHT ? COLOR_THEME_LIGHT_INITIAL_COLORS : colorThemeSetting === ThemeSettingDefaults.COLOR_THEME_DARK ? COLOR_THEME_DARK_INITIAL_COLORS : void 0;
    if (!themeData) {
      const initialColorTheme = environmentService.options?.initialColorTheme;
      if (initialColorTheme) {
        themeData = ColorThemeData.createUnloadedThemeForThemeType(initialColorTheme.themeType, initialColorTheme.colors ?? defaultColorMap);
      }
    }
    if (!themeData) {
      const colorScheme = this.settings.getPreferredColorScheme() ?? (isWeb ? ColorScheme.LIGHT : ColorScheme.DARK);
      themeData = ColorThemeData.createUnloadedThemeForThemeType(colorScheme, defaultColorMap);
    }
    themeData.setCustomizations(this.settings);
    this.applyTheme(themeData, void 0, true);
    const fileIconData = FileIconThemeData.fromStorageData(this.storageService);
    if (fileIconData) {
      this.applyAndSetFileIconTheme(fileIconData, true);
    }
    const productIconData = ProductIconThemeData.fromStorageData(this.storageService);
    if (productIconData) {
      this.applyAndSetProductIconTheme(productIconData, true);
    }
    extensionService.whenInstalledExtensionsRegistered().then((_) => {
      this.installConfigurationListener();
      this.installPreferredSchemeListener();
      this.installRegistryListeners();
      this.initialize(previousColorThemeSetting).catch(errors.onUnexpectedError);
    });
    const codiconStyleSheet = createStyleSheet();
    codiconStyleSheet.id = "codiconStyles";
    const iconsStyleSheet = this._register(getIconsStyleSheet(this));
    function updateAll() {
      codiconStyleSheet.textContent = iconsStyleSheet.getCSS();
    }
    const delayer = this._register(new RunOnceScheduler(updateAll, 0));
    this._register(iconsStyleSheet.onDidChange(() => delayer.schedule()));
    delayer.schedule();
  }
  async initialize(themePreviousSettingsId) {
    const extDevLocs = this.environmentService.extensionDevelopmentLocationURI;
    const extDevLoc = extDevLocs && extDevLocs.length === 1 ? extDevLocs[0] : void 0;
    const initializeColorTheme = async () => {
      const devThemes = this.colorThemeRegistry.findThemeByExtensionLocation(extDevLoc);
      if (devThemes.length) {
        const matchedColorTheme = devThemes.find((theme2) => theme2.type === this.currentColorTheme.type);
        return this.setColorTheme(matchedColorTheme ? matchedColorTheme.id : devThemes[0].id, void 0);
      }
      let theme = this.colorThemeRegistry.findThemeBySettingsId(this.settings.colorTheme, void 0);
      if (!theme) {
        await this.userDataInitializationService.whenInitializationFinished();
        const fallbackTheme = this.currentColorTheme.type === ColorScheme.LIGHT ? ThemeSettingDefaults.COLOR_THEME_LIGHT : ThemeSettingDefaults.COLOR_THEME_DARK;
        theme = this.colorThemeRegistry.findThemeBySettingsId(this.settings.colorTheme, fallbackTheme);
      }
      return this.setColorTheme(theme && theme.id, void 0);
    };
    const initializeFileIconTheme = async () => {
      const devThemes = this.fileIconThemeRegistry.findThemeByExtensionLocation(extDevLoc);
      if (devThemes.length) {
        return this.setFileIconTheme(devThemes[0].id, ConfigurationTarget.MEMORY);
      }
      let theme = this.fileIconThemeRegistry.findThemeBySettingsId(this.settings.fileIconTheme);
      if (!theme) {
        await this.userDataInitializationService.whenInitializationFinished();
        theme = this.fileIconThemeRegistry.findThemeBySettingsId(this.settings.fileIconTheme);
      }
      return this.setFileIconTheme(theme ? theme.id : DEFAULT_FILE_ICON_THEME_ID, void 0);
    };
    const initializeProductIconTheme = async () => {
      const devThemes = this.productIconThemeRegistry.findThemeByExtensionLocation(extDevLoc);
      if (devThemes.length) {
        return this.setProductIconTheme(devThemes[0].id, ConfigurationTarget.MEMORY);
      }
      let theme = this.productIconThemeRegistry.findThemeBySettingsId(this.settings.productIconTheme);
      if (!theme) {
        await this.userDataInitializationService.whenInitializationFinished();
        theme = this.productIconThemeRegistry.findThemeBySettingsId(this.settings.productIconTheme);
      }
      return this.setProductIconTheme(theme ? theme.id : DEFAULT_PRODUCT_ICON_THEME_ID, void 0);
    };
    this.migrateColorThemeSettings();
    const result = await Promise.all([initializeColorTheme(), initializeFileIconTheme(), initializeProductIconTheme()]);
    await this.showNewDefaultThemeNotification(themePreviousSettingsId);
    return result;
  }
  async showNewDefaultThemeNotification(previousSettingsId) {
    if (this.storageService.getBoolean(WorkbenchThemeService.NEW_THEME_NOTIFICATION_KEY, StorageScope.APPLICATION)) {
      return;
    }
    if (!await this.hostService.hadLastFocus() || this.environmentService.isSessionsWindow) {
      return;
    }
    try {
      if (!this.settings.isDefaultColorTheme() || !previousSettingsId) {
        return;
      }
      previousSettingsId = migrateThemeSettingsId(previousSettingsId);
      if (!["Dark Modern", "Light Modern"].includes(previousSettingsId)) {
        return;
      }
      if (![ThemeSettingDefaults.COLOR_THEME_DARK, ThemeSettingDefaults.COLOR_THEME_LIGHT].includes(this.settings.colorTheme)) {
        return;
      }
    } finally {
      this.storageService.store(WorkbenchThemeService.NEW_THEME_NOTIFICATION_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
    }
    const keepTheme = await new Promise((resolve) => {
      this.notificationService.prompt(
        Severity.Info,
        nls.localize({ key: "themeUpdatedNotification", comment: ["{0} is the name of the new default theme"] }, "VS Code has a new default theme: '{0}'.", this.getColorTheme().label),
        [
          toAction({
            id: "themeUpdated.tryItOut",
            label: nls.localize("tryNewTheme", "Keep It"),
            run: () => resolve(true)
          }),
          toAction({
            id: "themeUpdated.noThanks",
            label: nls.localize("noThanks", "No Thanks"),
            run: () => resolve(false)
          })
        ],
        {
          onCancel: () => resolve(false)
        }
      );
    });
    if (!keepTheme) {
      const previousTheme = this.colorThemeRegistry.findThemeBySettingsId(previousSettingsId);
      if (previousTheme) {
        this.setColorTheme(previousTheme.id, "auto");
      }
    }
  }
  /**
   * Migrates legacy theme setting values to their current equivalents,
   * writing back the migrated value so settings sync distributes the correct ID.
   */
  migrateColorThemeSettings() {
    const themeSettings = [
      ThemeSettings.COLOR_THEME,
      ThemeSettings.PREFERRED_DARK_THEME,
      ThemeSettings.PREFERRED_LIGHT_THEME,
      ThemeSettings.PREFERRED_HC_DARK_THEME,
      ThemeSettings.PREFERRED_HC_LIGHT_THEME
    ];
    for (const key of themeSettings) {
      const inspection = this.configurationService.inspect(key);
      for (const [target, value] of [
        [ConfigurationTarget.USER, inspection.userValue],
        [ConfigurationTarget.USER_REMOTE, inspection.userRemoteValue],
        [ConfigurationTarget.WORKSPACE, inspection.workspaceValue]
      ]) {
        if (value) {
          const migrated = migrateThemeSettingsId(value);
          if (migrated !== value) {
            this.configurationService.updateValue(key, migrated, target);
          }
        }
      }
    }
  }
  installConfigurationListener() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ThemeSettings.COLOR_THEME) || e.affectsConfiguration(ThemeSettings.PREFERRED_DARK_THEME) || e.affectsConfiguration(ThemeSettings.PREFERRED_LIGHT_THEME) || e.affectsConfiguration(ThemeSettings.PREFERRED_HC_DARK_THEME) || e.affectsConfiguration(ThemeSettings.PREFERRED_HC_LIGHT_THEME) || e.affectsConfiguration(ThemeSettings.DETECT_COLOR_SCHEME) || e.affectsConfiguration(ThemeSettings.DETECT_HC) || e.affectsConfiguration(ThemeSettings.SYSTEM_COLOR_THEME)) {
        this.restoreColorTheme();
      }
      if (e.affectsConfiguration(ThemeSettings.FILE_ICON_THEME)) {
        this.restoreFileIconTheme();
      }
      if (e.affectsConfiguration(ThemeSettings.PRODUCT_ICON_THEME)) {
        this.restoreProductIconTheme();
      }
      if (this.currentColorTheme) {
        let hasColorChanges = false;
        if (e.affectsConfiguration(ThemeSettings.COLOR_CUSTOMIZATIONS)) {
          this.currentColorTheme.setCustomColors(this.settings.colorCustomizations);
          hasColorChanges = true;
        }
        if (e.affectsConfiguration(ThemeSettings.TOKEN_COLOR_CUSTOMIZATIONS)) {
          this.currentColorTheme.setCustomTokenColors(this.settings.tokenColorCustomizations);
          hasColorChanges = true;
        }
        if (e.affectsConfiguration(ThemeSettings.SEMANTIC_TOKEN_COLOR_CUSTOMIZATIONS)) {
          this.currentColorTheme.setCustomSemanticTokenColors(this.settings.semanticTokenColorCustomizations);
          hasColorChanges = true;
        }
        if (hasColorChanges) {
          this.updateDynamicCSSRules(this.currentColorTheme);
          this.onColorThemeChange.fire(this.currentColorTheme);
        }
      }
    }));
  }
  installRegistryListeners() {
    let prevColorId = void 0;
    this._register(this.colorThemeRegistry.onDidChange(async (event) => {
      updateColorThemeConfigurationSchemas(event.themes);
      if (await this.restoreColorTheme()) {
        if (this.currentColorTheme.settingsId === ThemeSettingDefaults.COLOR_THEME_DARK && !types.isUndefined(prevColorId) && await this.colorThemeRegistry.findThemeById(prevColorId)) {
          await this.setColorTheme(prevColorId, "auto");
          prevColorId = void 0;
        } else if (event.added.some((t) => t.settingsId === this.currentColorTheme.settingsId)) {
          await this.reloadCurrentColorTheme();
        }
      } else if (event.removed.some((t) => t.settingsId === this.currentColorTheme.settingsId)) {
        prevColorId = this.currentColorTheme.id;
        const defaultTheme = this.colorThemeRegistry.findThemeBySettingsId(ThemeSettingDefaults.COLOR_THEME_DARK);
        await this.setColorTheme(defaultTheme, "auto");
      }
    }));
    let prevFileIconId = void 0;
    this._register(this._register(this.fileIconThemeRegistry.onDidChange(async (event) => {
      updateFileIconThemeConfigurationSchemas(event.themes);
      if (await this.restoreFileIconTheme()) {
        if (this.currentFileIconTheme.id === DEFAULT_FILE_ICON_THEME_ID && !types.isUndefined(prevFileIconId) && this.fileIconThemeRegistry.findThemeById(prevFileIconId)) {
          await this.setFileIconTheme(prevFileIconId, "auto");
          prevFileIconId = void 0;
        } else if (event.added.some((t) => t.settingsId === this.currentFileIconTheme.settingsId)) {
          await this.reloadCurrentFileIconTheme();
        }
      } else if (event.removed.some((t) => t.settingsId === this.currentFileIconTheme.settingsId)) {
        prevFileIconId = this.currentFileIconTheme.id;
        await this.setFileIconTheme(DEFAULT_FILE_ICON_THEME_ID, "auto");
      }
    })));
    let prevProductIconId = void 0;
    this._register(this.productIconThemeRegistry.onDidChange(async (event) => {
      updateProductIconThemeConfigurationSchemas(event.themes);
      if (await this.restoreProductIconTheme()) {
        if (this.currentProductIconTheme.id === DEFAULT_PRODUCT_ICON_THEME_ID && !types.isUndefined(prevProductIconId) && this.productIconThemeRegistry.findThemeById(prevProductIconId)) {
          await this.setProductIconTheme(prevProductIconId, "auto");
          prevProductIconId = void 0;
        } else if (event.added.some((t) => t.settingsId === this.currentProductIconTheme.settingsId)) {
          await this.reloadCurrentProductIconTheme();
        }
      } else if (event.removed.some((t) => t.settingsId === this.currentProductIconTheme.settingsId)) {
        prevProductIconId = this.currentProductIconTheme.id;
        await this.setProductIconTheme(DEFAULT_PRODUCT_ICON_THEME_ID, "auto");
      }
    }));
    this._register(this.languageService.onDidChange(() => this.reloadCurrentFileIconTheme()));
    return Promise.all([this.getColorThemes(), this.getFileIconThemes(), this.getProductIconThemes()]).then(([ct, fit, pit]) => {
      updateColorThemeConfigurationSchemas(ct);
      updateFileIconThemeConfigurationSchemas(fit);
      updateProductIconThemeConfigurationSchemas(pit);
    });
  }
  // preferred scheme handling
  installPreferredSchemeListener() {
    let previous = { dark: this.hostColorService.dark, highContrast: this.hostColorService.highContrast };
    this._register(this.hostColorService.onDidChangeColorScheme(() => {
      const restoreColorTheme = this.settings.isPreferredColorSchemeChange(previous);
      previous = { dark: this.hostColorService.dark, highContrast: this.hostColorService.highContrast };
      if (restoreColorTheme) {
        this.restoreColorTheme();
      }
    }));
  }
  getColorTheme() {
    return this.currentColorTheme;
  }
  async getColorThemes() {
    return this.colorThemeRegistry.getThemes();
  }
  getPreferredColorScheme() {
    return this.settings.getPreferredColorScheme();
  }
  async getMarketplaceColorThemes(publisher, name, version) {
    const extensionLocation = await this.extensionResourceLoaderService.getExtensionGalleryResourceURL({ publisher, name, version }, "extension");
    if (extensionLocation) {
      try {
        const manifestContent = await this.extensionResourceLoaderService.readExtensionResource(resources.joinPath(extensionLocation, "package.json"));
        return this.colorThemeRegistry.getMarketplaceThemes(JSON.parse(manifestContent), extensionLocation, ExtensionData.fromName(publisher, name));
      } catch (e) {
        this.logService.error("Problem loading themes from marketplace", e);
      }
    }
    return [];
  }
  get onDidColorThemeChange() {
    return this.onColorThemeChange.event;
  }
  setColorTheme(themeIdOrTheme, settingsTarget) {
    return this.colorThemeSequencer.queue(async () => {
      return this.internalSetColorTheme(themeIdOrTheme, settingsTarget);
    });
  }
  async internalSetColorTheme(themeIdOrTheme, settingsTarget) {
    if (!themeIdOrTheme) {
      return null;
    }
    const themeId = types.isString(themeIdOrTheme) ? validateThemeId(themeIdOrTheme) : themeIdOrTheme.id;
    if (this.currentColorTheme.isLoaded && themeId === this.currentColorTheme.id) {
      if (settingsTarget !== "preview") {
        this.currentColorTheme.toStorage(this.storageService);
      }
      return this.settings.setColorTheme(this.currentColorTheme, settingsTarget);
    }
    let themeData = this.colorThemeRegistry.findThemeById(themeId);
    if (!themeData) {
      if (themeIdOrTheme instanceof ColorThemeData) {
        themeData = themeIdOrTheme;
      } else {
        return null;
      }
    }
    try {
      await themeData.ensureLoaded(this.extensionResourceLoaderService);
      themeData.setCustomizations(this.settings);
      return this.applyTheme(themeData, settingsTarget);
    } catch (error) {
      throw new Error(nls.localize("error.cannotloadtheme", "Unable to load {0}: {1}", themeData.location?.toString(), error.message));
    }
  }
  reloadCurrentColorTheme() {
    return this.colorThemeSequencer.queue(async () => {
      try {
        const theme = this.colorThemeRegistry.findThemeBySettingsId(this.currentColorTheme.settingsId) || this.currentColorTheme;
        await theme.reload(this.extensionResourceLoaderService);
        theme.setCustomizations(this.settings);
        await this.applyTheme(theme, void 0, false);
      } catch (error) {
        this.logService.info("Unable to reload {0}: {1}", this.currentColorTheme.location?.toString());
      }
    });
  }
  async restoreColorTheme() {
    return this.colorThemeSequencer.queue(async () => {
      const settingId = this.settings.colorTheme;
      const theme = this.colorThemeRegistry.findThemeBySettingsId(settingId);
      if (theme) {
        if (settingId !== this.currentColorTheme.settingsId) {
          await this.internalSetColorTheme(theme.id, void 0);
        } else if (theme !== this.currentColorTheme) {
          await theme.ensureLoaded(this.extensionResourceLoaderService);
          theme.setCustomizations(this.settings);
          await this.applyTheme(theme, void 0, true);
        }
        return true;
      }
      return false;
    });
  }
  updateDynamicCSSRules(themeData) {
    const css = generateColorThemeCSS(
      themeData,
      ".monaco-workbench",
      themingRegistry.getThemingParticipants(),
      this.environmentService
    );
    _applyRules(css.code, colorThemeRulesClassName);
  }
  applyTheme(newTheme, settingsTarget, silent = false) {
    this.updateDynamicCSSRules(newTheme);
    if (this.currentColorTheme.id) {
      this.container.classList.remove(...this.currentColorTheme.classNames);
    } else {
      this.container.classList.remove(ThemeTypeSelector.VS, ThemeTypeSelector.VS_DARK, ThemeTypeSelector.HC_BLACK, ThemeTypeSelector.HC_LIGHT);
    }
    this.container.classList.add(...newTheme.classNames);
    this.currentColorTheme.clearCaches();
    this.currentColorTheme = newTheme;
    if (!this.colorThemingParticipantChangeListener) {
      this.colorThemingParticipantChangeListener = themingRegistry.onThemingParticipantAdded((_) => this.updateDynamicCSSRules(this.currentColorTheme));
    }
    this.colorThemeWatcher.update(newTheme);
    this.sendTelemetry(newTheme.id, newTheme.extensionData, "color");
    if (silent) {
      return Promise.resolve(null);
    }
    this.onColorThemeChange.fire(this.currentColorTheme);
    if (newTheme.isLoaded && settingsTarget !== "preview") {
      newTheme.toStorage(this.storageService);
    }
    return this.settings.setColorTheme(this.currentColorTheme, settingsTarget);
  }
  sendTelemetry(themeId, themeData, themeType) {
    if (themeData) {
      const key = themeType + themeData.extensionId;
      if (!this.themeExtensionsActivated.get(key)) {
        this.telemetryService.publicLog2("activateThemeExtension", {
          id: themeData.extensionId,
          name: themeData.extensionName,
          isBuiltin: themeData.extensionIsBuiltin,
          publisherDisplayName: themeData.extensionPublisher,
          themeId
        });
        this.themeExtensionsActivated.set(key, true);
      }
    }
  }
  async getFileIconThemes() {
    return this.fileIconThemeRegistry.getThemes();
  }
  getFileIconTheme() {
    return this.currentFileIconTheme;
  }
  get onDidFileIconThemeChange() {
    return this.onFileIconThemeChange.event;
  }
  async setFileIconTheme(iconThemeOrId, settingsTarget) {
    return this.fileIconThemeSequencer.queue(async () => {
      return this.internalSetFileIconTheme(iconThemeOrId, settingsTarget);
    });
  }
  async internalSetFileIconTheme(iconThemeOrId, settingsTarget) {
    if (iconThemeOrId === void 0) {
      iconThemeOrId = "";
    }
    const themeId = types.isString(iconThemeOrId) ? iconThemeOrId : iconThemeOrId.id;
    if (themeId !== this.currentFileIconTheme.id || !this.currentFileIconTheme.isLoaded) {
      let newThemeData = this.fileIconThemeRegistry.findThemeById(themeId);
      if (!newThemeData && iconThemeOrId instanceof FileIconThemeData) {
        newThemeData = iconThemeOrId;
      }
      if (!newThemeData) {
        newThemeData = FileIconThemeData.noIconTheme;
      }
      await newThemeData.ensureLoaded(this.fileIconThemeLoader);
      this.applyAndSetFileIconTheme(newThemeData);
    }
    const themeData = this.currentFileIconTheme;
    if (themeData.isLoaded && settingsTarget !== "preview" && (!themeData.location || !getRemoteAuthority(themeData.location))) {
      themeData.toStorage(this.storageService);
    }
    await this.settings.setFileIconTheme(this.currentFileIconTheme, settingsTarget);
    return themeData;
  }
  async getMarketplaceFileIconThemes(publisher, name, version) {
    const extensionLocation = await this.extensionResourceLoaderService.getExtensionGalleryResourceURL({ publisher, name, version }, "extension");
    if (extensionLocation) {
      try {
        const manifestContent = await this.extensionResourceLoaderService.readExtensionResource(resources.joinPath(extensionLocation, "package.json"));
        return this.fileIconThemeRegistry.getMarketplaceThemes(JSON.parse(manifestContent), extensionLocation, ExtensionData.fromName(publisher, name));
      } catch (e) {
        this.logService.error("Problem loading themes from marketplace", e);
      }
    }
    return [];
  }
  async reloadCurrentFileIconTheme() {
    return this.fileIconThemeSequencer.queue(async () => {
      await this.currentFileIconTheme.reload(this.fileIconThemeLoader);
      this.applyAndSetFileIconTheme(this.currentFileIconTheme);
    });
  }
  async restoreFileIconTheme() {
    return this.fileIconThemeSequencer.queue(async () => {
      const settingId = this.settings.fileIconTheme;
      const theme = this.fileIconThemeRegistry.findThemeBySettingsId(settingId);
      if (theme) {
        if (settingId !== this.currentFileIconTheme.settingsId) {
          await this.internalSetFileIconTheme(theme.id, void 0);
        } else if (theme !== this.currentFileIconTheme) {
          await theme.ensureLoaded(this.fileIconThemeLoader);
          this.applyAndSetFileIconTheme(theme, true);
        }
        return true;
      }
      return false;
    });
  }
  applyAndSetFileIconTheme(iconThemeData, silent = false) {
    this.currentFileIconTheme = iconThemeData;
    _applyRules(iconThemeData.styleSheetContent, fileIconThemeRulesClassName);
    if (iconThemeData.id) {
      this.container.classList.add(fileIconsEnabledClass);
    } else {
      this.container.classList.remove(fileIconsEnabledClass);
    }
    this.fileIconThemeWatcher.update(iconThemeData);
    if (iconThemeData.id) {
      this.sendTelemetry(iconThemeData.id, iconThemeData.extensionData, "fileIcon");
    }
    if (!silent) {
      this.onFileIconThemeChange.fire(this.currentFileIconTheme);
    }
  }
  async getProductIconThemes() {
    return this.productIconThemeRegistry.getThemes();
  }
  getProductIconTheme() {
    return this.currentProductIconTheme;
  }
  get onDidProductIconThemeChange() {
    return this.onProductIconThemeChange.event;
  }
  async setProductIconTheme(iconThemeOrId, settingsTarget) {
    return this.productIconThemeSequencer.queue(async () => {
      return this.internalSetProductIconTheme(iconThemeOrId, settingsTarget);
    });
  }
  async internalSetProductIconTheme(iconThemeOrId, settingsTarget) {
    if (iconThemeOrId === void 0) {
      iconThemeOrId = "";
    }
    const themeId = types.isString(iconThemeOrId) ? iconThemeOrId : iconThemeOrId.id;
    if (themeId !== this.currentProductIconTheme.id || !this.currentProductIconTheme.isLoaded) {
      let newThemeData = this.productIconThemeRegistry.findThemeById(themeId);
      if (!newThemeData && iconThemeOrId instanceof ProductIconThemeData) {
        newThemeData = iconThemeOrId;
      }
      if (!newThemeData) {
        newThemeData = ProductIconThemeData.defaultTheme;
      }
      await newThemeData.ensureLoaded(this.extensionResourceLoaderService, this.logService);
      this.applyAndSetProductIconTheme(newThemeData);
    }
    const themeData = this.currentProductIconTheme;
    if (themeData.isLoaded && settingsTarget !== "preview" && (!themeData.location || !getRemoteAuthority(themeData.location))) {
      themeData.toStorage(this.storageService);
    }
    await this.settings.setProductIconTheme(this.currentProductIconTheme, settingsTarget);
    return themeData;
  }
  async getMarketplaceProductIconThemes(publisher, name, version) {
    const extensionLocation = await this.extensionResourceLoaderService.getExtensionGalleryResourceURL({ publisher, name, version }, "extension");
    if (extensionLocation) {
      try {
        const manifestContent = await this.extensionResourceLoaderService.readExtensionResource(resources.joinPath(extensionLocation, "package.json"));
        return this.productIconThemeRegistry.getMarketplaceThemes(JSON.parse(manifestContent), extensionLocation, ExtensionData.fromName(publisher, name));
      } catch (e) {
        this.logService.error("Problem loading themes from marketplace", e);
      }
    }
    return [];
  }
  async reloadCurrentProductIconTheme() {
    return this.productIconThemeSequencer.queue(async () => {
      await this.currentProductIconTheme.reload(this.extensionResourceLoaderService, this.logService);
      this.applyAndSetProductIconTheme(this.currentProductIconTheme);
    });
  }
  async restoreProductIconTheme() {
    return this.productIconThemeSequencer.queue(async () => {
      const settingId = this.settings.productIconTheme;
      const theme = this.productIconThemeRegistry.findThemeBySettingsId(settingId);
      if (theme) {
        if (settingId !== this.currentProductIconTheme.settingsId) {
          await this.internalSetProductIconTheme(theme.id, void 0);
        } else if (theme !== this.currentProductIconTheme) {
          await theme.ensureLoaded(this.extensionResourceLoaderService, this.logService);
          this.applyAndSetProductIconTheme(theme, true);
        }
        return true;
      }
      return false;
    });
  }
  applyAndSetProductIconTheme(iconThemeData, silent = false) {
    this.currentProductIconTheme = iconThemeData;
    _applyRules(iconThemeData.styleSheetContent, productIconThemeRulesClassName);
    this.productIconThemeWatcher.update(iconThemeData);
    if (iconThemeData.id) {
      this.sendTelemetry(iconThemeData.id, iconThemeData.extensionData, "productIcon");
    }
    if (!silent) {
      this.onProductIconThemeChange.fire(this.currentProductIconTheme);
    }
  }
};
WorkbenchThemeService.NEW_THEME_NOTIFICATION_KEY = "workbench.newDefaultThemeNotification";
WorkbenchThemeService = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IBrowserWorkbenchEnvironmentService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IExtensionResourceLoaderService),
  __decorateParam(7, IWorkbenchLayoutService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IHostColorSchemeService),
  __decorateParam(10, IUserDataInitializationService),
  __decorateParam(11, ILanguageService),
  __decorateParam(12, INotificationService),
  __decorateParam(13, IHostService)
], WorkbenchThemeService);
class ThemeFileWatcher {
  constructor(fileService, environmentService, onUpdate) {
    this.fileService = fileService;
    this.environmentService = environmentService;
    this.onUpdate = onUpdate;
    this.watcherDisposables = new DisposableStore();
  }
  update(theme) {
    if (!resources.isEqual(theme.location, this.watchedLocation)) {
      this.watchedLocation = void 0;
      this.watcherDisposables.clear();
      if (theme.location && (theme.watch || this.environmentService.isExtensionDevelopment)) {
        this.watchedLocation = theme.location;
        this.watcherDisposables.add(this.fileService.watch(theme.location));
        this.watcherDisposables.add(this.fileService.onDidFilesChange((e) => {
          if (this.watchedLocation && e.contains(this.watchedLocation, FileChangeType.UPDATED)) {
            this.onUpdate();
          }
        }));
      }
    }
  }
  dispose() {
    this.watcherDisposables.dispose();
    this.watchedLocation = void 0;
  }
}
function _applyRules(styleSheetContent, rulesClassName) {
  const themeStyles = mainWindow.document.head.getElementsByClassName(rulesClassName);
  if (themeStyles.length === 0) {
    const elStyle = createStyleSheet();
    elStyle.className = rulesClassName;
    elStyle.textContent = styleSheetContent;
  } else {
    themeStyles[0].textContent = styleSheetContent;
  }
}
registerColorThemeSchemas();
registerFileIconThemeSchemas();
registerProductIconThemeSchemas();
registerSingleton(IWorkbenchThemeService, WorkbenchThemeService, InstantiationType.Eager);
export {
  WorkbenchThemeService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0aGVtZXNcXGJyb3dzZXJcXHdvcmtiZW5jaFRoZW1lU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgdHlwZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hUaGVtZVNlcnZpY2UsIElXb3JrYmVuY2hDb2xvclRoZW1lLCBJV29ya2JlbmNoRmlsZUljb25UaGVtZSwgRXh0ZW5zaW9uRGF0YSwgVGhlbWVTZXR0aW5ncywgSVdvcmtiZW5jaFByb2R1Y3RJY29uVGhlbWUsIFRoZW1lU2V0dGluZ1RhcmdldCwgVGhlbWVTZXR0aW5nRGVmYXVsdHMsIENPTE9SX1RIRU1FX0RBUktfSU5JVElBTF9DT0xPUlMsIENPTE9SX1RIRU1FX0xJR0hUX0lOSVRJQUxfQ09MT1JTLCBtaWdyYXRlVGhlbWVTZXR0aW5nc0lkIH0gZnJvbSAnLi4vY29tbW9uL3dvcmtiZW5jaFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgKiBhcyBlcnJvcnMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSwgQ29uZmlndXJhdGlvblRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29sb3JUaGVtZURhdGEgfSBmcm9tICcuLi9jb21tb24vY29sb3JUaGVtZURhdGEuanMnO1xuaW1wb3J0IHsgSUNvbG9yVGhlbWUsIEV4dGVuc2lvbnMgYXMgVGhlbWluZ0V4dGVuc2lvbnMsIElUaGVtaW5nUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJGaWxlSWNvblRoZW1lU2NoZW1hcyB9IGZyb20gJy4uL2NvbW1vbi9maWxlSWNvblRoZW1lU2NoZW1hLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRmlsZUljb25UaGVtZURhdGEsIEZpbGVJY29uVGhlbWVMb2FkZXIgfSBmcm9tICcuL2ZpbGVJY29uVGhlbWVEYXRhLmpzJztcbmltcG9ydCB7IGNyZWF0ZVN0eWxlU2hlZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU3R5bGVzaGVldHMuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UsIEZpbGVDaGFuZ2VUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyByZXNvdXJjZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ29sb3JUaGVtZVNjaGVtYXMgfSBmcm9tICcuLi9jb21tb24vY29sb3JUaGVtZVNjaGVtYS5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGdldFJlbW90ZUF1dGhvcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlSG9zdHMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25SZXNvdXJjZUxvYWRlci9jb21tb24vZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXIuanMnO1xuaW1wb3J0IHsgVGhlbWVSZWdpc3RyeSwgcmVnaXN0ZXJDb2xvclRoZW1lRXh0ZW5zaW9uUG9pbnQsIHJlZ2lzdGVyRmlsZUljb25UaGVtZUV4dGVuc2lvblBvaW50LCByZWdpc3RlclByb2R1Y3RJY29uVGhlbWVFeHRlbnNpb25Qb2ludCB9IGZyb20gJy4uL2NvbW1vbi90aGVtZUV4dGVuc2lvblBvaW50cy5qcyc7XG5pbXBvcnQgeyB1cGRhdGVDb2xvclRoZW1lQ29uZmlndXJhdGlvblNjaGVtYXMsIHVwZGF0ZUZpbGVJY29uVGhlbWVDb25maWd1cmF0aW9uU2NoZW1hcywgVGhlbWVDb25maWd1cmF0aW9uLCB1cGRhdGVQcm9kdWN0SWNvblRoZW1lQ29uZmlndXJhdGlvblNjaGVtYXMgfSBmcm9tICcuLi9jb21tb24vdGhlbWVDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFByb2R1Y3RJY29uVGhlbWVEYXRhLCBERUZBVUxUX1BST0RVQ1RfSUNPTl9USEVNRV9JRCB9IGZyb20gJy4vcHJvZHVjdEljb25UaGVtZURhdGEuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJQcm9kdWN0SWNvblRoZW1lU2NoZW1hcyB9IGZyb20gJy4uL2NvbW1vbi9wcm9kdWN0SWNvblRoZW1lU2NoZW1hLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBDb2xvclNjaGVtZSwgVGhlbWVUeXBlU2VsZWN0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSUhvc3RDb2xvclNjaGVtZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vaG9zdENvbG9yU2NoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyLCBTZXF1ZW5jZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFJbml0aWFsaXphdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YS9icm93c2VyL3VzZXJEYXRhSW5pdC5qcyc7XG5pbXBvcnQgeyBnZXRJY29uc1N0eWxlU2hlZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2ljb25zU3R5bGVTaGVldC5qcyc7XG5pbXBvcnQgeyBnZXRDb2xvclJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IGdlbmVyYXRlQ29sb3JUaGVtZUNTUyB9IGZyb20gJy4vY29sb3JUaGVtZUNzcy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuXG4vLyBpbXBsZW1lbnRhdGlvblxuXG5jb25zdCBkZWZhdWx0VGhlbWVFeHRlbnNpb25JZCA9ICd2c2NvZGUtdGhlbWUtZGVmYXVsdHMnO1xuXG5jb25zdCBERUZBVUxUX0ZJTEVfSUNPTl9USEVNRV9JRCA9ICd2c2NvZGUudnNjb2RlLXRoZW1lLXNldGktdnMtc2V0aSc7XG5jb25zdCBmaWxlSWNvbnNFbmFibGVkQ2xhc3MgPSAnZmlsZS1pY29ucy1lbmFibGVkJztcblxuY29uc3QgY29sb3JUaGVtZVJ1bGVzQ2xhc3NOYW1lID0gJ2NvbnRyaWJ1dGVkQ29sb3JUaGVtZSc7XG5jb25zdCBmaWxlSWNvblRoZW1lUnVsZXNDbGFzc05hbWUgPSAnY29udHJpYnV0ZWRGaWxlSWNvblRoZW1lJztcbmNvbnN0IHByb2R1Y3RJY29uVGhlbWVSdWxlc0NsYXNzTmFtZSA9ICdjb250cmlidXRlZFByb2R1Y3RJY29uVGhlbWUnO1xuXG5jb25zdCB0aGVtaW5nUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVGhlbWluZ1JlZ2lzdHJ5PihUaGVtaW5nRXh0ZW5zaW9ucy5UaGVtaW5nQ29udHJpYnV0aW9uKTtcblxuZnVuY3Rpb24gdmFsaWRhdGVUaGVtZUlkKHRoZW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHQvLyBtaWdyYXRpb25zXG5cdHN3aXRjaCAodGhlbWUpIHtcblx0XHRjYXNlIFRoZW1lVHlwZVNlbGVjdG9yLlZTOiByZXR1cm4gYHZzICR7ZGVmYXVsdFRoZW1lRXh0ZW5zaW9uSWR9LXRoZW1lcy1saWdodF92cy1qc29uYDtcblx0XHRjYXNlIFRoZW1lVHlwZVNlbGVjdG9yLlZTX0RBUks6IHJldHVybiBgdnMtZGFyayAke2RlZmF1bHRUaGVtZUV4dGVuc2lvbklkfS10aGVtZXMtZGFya192cy1qc29uYDtcblx0XHRjYXNlIFRoZW1lVHlwZVNlbGVjdG9yLkhDX0JMQUNLOiByZXR1cm4gYGhjLWJsYWNrICR7ZGVmYXVsdFRoZW1lRXh0ZW5zaW9uSWR9LXRoZW1lcy1oY19ibGFjay1qc29uYDtcblx0XHRjYXNlIFRoZW1lVHlwZVNlbGVjdG9yLkhDX0xJR0hUOiByZXR1cm4gYGhjLWxpZ2h0ICR7ZGVmYXVsdFRoZW1lRXh0ZW5zaW9uSWR9LXRoZW1lcy1oY19saWdodC1qc29uYDtcblx0fVxuXHRyZXR1cm4gdGhlbWU7XG59XG5cbmNvbnN0IGNvbG9yVGhlbWVzRXh0UG9pbnQgPSByZWdpc3RlckNvbG9yVGhlbWVFeHRlbnNpb25Qb2ludCgpO1xuY29uc3QgZmlsZUljb25UaGVtZXNFeHRQb2ludCA9IHJlZ2lzdGVyRmlsZUljb25UaGVtZUV4dGVuc2lvblBvaW50KCk7XG5jb25zdCBwcm9kdWN0SWNvblRoZW1lc0V4dFBvaW50ID0gcmVnaXN0ZXJQcm9kdWN0SWNvblRoZW1lRXh0ZW5zaW9uUG9pbnQoKTtcblxuZXhwb3J0IGNsYXNzIFdvcmtiZW5jaFRoZW1lU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNldHRpbmdzOiBUaGVtZUNvbmZpZ3VyYXRpb247XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb2xvclRoZW1lUmVnaXN0cnk6IFRoZW1lUmVnaXN0cnk8Q29sb3JUaGVtZURhdGE+O1xuXHRwcml2YXRlIGN1cnJlbnRDb2xvclRoZW1lOiBDb2xvclRoZW1lRGF0YTtcblx0cHJpdmF0ZSByZWFkb25seSBvbkNvbG9yVGhlbWVDaGFuZ2U6IEVtaXR0ZXI8SVdvcmtiZW5jaENvbG9yVGhlbWU+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbG9yVGhlbWVXYXRjaGVyOiBUaGVtZUZpbGVXYXRjaGVyO1xuXHRwcml2YXRlIGNvbG9yVGhlbWluZ1BhcnRpY2lwYW50Q2hhbmdlTGlzdGVuZXI6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbG9yVGhlbWVTZXF1ZW5jZXI6IFNlcXVlbmNlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGZpbGVJY29uVGhlbWVSZWdpc3RyeTogVGhlbWVSZWdpc3RyeTxGaWxlSWNvblRoZW1lRGF0YT47XG5cdHByaXZhdGUgY3VycmVudEZpbGVJY29uVGhlbWU6IEZpbGVJY29uVGhlbWVEYXRhO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRmlsZUljb25UaGVtZUNoYW5nZTogRW1pdHRlcjxJV29ya2JlbmNoRmlsZUljb25UaGVtZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgZmlsZUljb25UaGVtZUxvYWRlcjogRmlsZUljb25UaGVtZUxvYWRlcjtcblx0cHJpdmF0ZSByZWFkb25seSBmaWxlSWNvblRoZW1lV2F0Y2hlcjogVGhlbWVGaWxlV2F0Y2hlcjtcblx0cHJpdmF0ZSByZWFkb25seSBmaWxlSWNvblRoZW1lU2VxdWVuY2VyOiBTZXF1ZW5jZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcm9kdWN0SWNvblRoZW1lUmVnaXN0cnk6IFRoZW1lUmVnaXN0cnk8UHJvZHVjdEljb25UaGVtZURhdGE+O1xuXHRwcml2YXRlIGN1cnJlbnRQcm9kdWN0SWNvblRoZW1lOiBQcm9kdWN0SWNvblRoZW1lRGF0YTtcblx0cHJpdmF0ZSByZWFkb25seSBvblByb2R1Y3RJY29uVGhlbWVDaGFuZ2U6IEVtaXR0ZXI8SVdvcmtiZW5jaFByb2R1Y3RJY29uVGhlbWU+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RJY29uVGhlbWVXYXRjaGVyOiBUaGVtZUZpbGVXYXRjaGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RJY29uVGhlbWVTZXF1ZW5jZXI6IFNlcXVlbmNlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2U6IElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJSG9zdENvbG9yU2NoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RDb2xvclNlcnZpY2U6IElIb3N0Q29sb3JTY2hlbWVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFJbml0aWFsaXphdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YUluaXRpYWxpemF0aW9uU2VydmljZTogSVVzZXJEYXRhSW5pdGlhbGl6YXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5jb250YWluZXIgPSBsYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXI7XG5cdFx0dGhpcy5zZXR0aW5ncyA9IG5ldyBUaGVtZUNvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvblNlcnZpY2UsIGhvc3RDb2xvclNlcnZpY2UpO1xuXG5cdFx0dGhpcy5jb2xvclRoZW1lUmVnaXN0cnkgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhlbWVSZWdpc3RyeShjb2xvclRoZW1lc0V4dFBvaW50LCBDb2xvclRoZW1lRGF0YS5mcm9tRXh0ZW5zaW9uVGhlbWUpKTtcblx0XHR0aGlzLmNvbG9yVGhlbWVXYXRjaGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRoZW1lRmlsZVdhdGNoZXIoZmlsZVNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgdGhpcy5yZWxvYWRDdXJyZW50Q29sb3JUaGVtZS5iaW5kKHRoaXMpKSk7XG5cdFx0dGhpcy5vbkNvbG9yVGhlbWVDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJV29ya2JlbmNoQ29sb3JUaGVtZT4oeyBsZWFrV2FybmluZ1RocmVzaG9sZDogNDAwLCBsZWFrV2FybmluZ05hbWU6ICdUaGVtZVNlcnZpY2Uub25Db2xvclRoZW1lQ2hhbmdlJyB9KSk7XG5cdFx0dGhpcy5jdXJyZW50Q29sb3JUaGVtZSA9IENvbG9yVGhlbWVEYXRhLmNyZWF0ZVVubG9hZGVkVGhlbWUoJycpO1xuXHRcdHRoaXMuY29sb3JUaGVtZVNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoKTtcblxuXHRcdHRoaXMuZmlsZUljb25UaGVtZVdhdGNoZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhlbWVGaWxlV2F0Y2hlcihmaWxlU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCB0aGlzLnJlbG9hZEN1cnJlbnRGaWxlSWNvblRoZW1lLmJpbmQodGhpcykpKTtcblx0XHR0aGlzLmZpbGVJY29uVGhlbWVSZWdpc3RyeSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaGVtZVJlZ2lzdHJ5KGZpbGVJY29uVGhlbWVzRXh0UG9pbnQsIEZpbGVJY29uVGhlbWVEYXRhLmZyb21FeHRlbnNpb25UaGVtZSwgdHJ1ZSwgRmlsZUljb25UaGVtZURhdGEubm9JY29uVGhlbWUpKTtcblx0XHR0aGlzLmZpbGVJY29uVGhlbWVMb2FkZXIgPSBuZXcgRmlsZUljb25UaGVtZUxvYWRlcihleHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSk7XG5cdFx0dGhpcy5vbkZpbGVJY29uVGhlbWVDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJV29ya2JlbmNoRmlsZUljb25UaGVtZT4oeyBsZWFrV2FybmluZ1RocmVzaG9sZDogNDAwLCBsZWFrV2FybmluZ05hbWU6ICdUaGVtZVNlcnZpY2Uub25GaWxlSWNvblRoZW1lQ2hhbmdlJyB9KSk7XG5cdFx0dGhpcy5jdXJyZW50RmlsZUljb25UaGVtZSA9IEZpbGVJY29uVGhlbWVEYXRhLmNyZWF0ZVVubG9hZGVkVGhlbWUoJycpO1xuXHRcdHRoaXMuZmlsZUljb25UaGVtZVNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoKTtcblxuXHRcdHRoaXMucHJvZHVjdEljb25UaGVtZVdhdGNoZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhlbWVGaWxlV2F0Y2hlcihmaWxlU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCB0aGlzLnJlbG9hZEN1cnJlbnRQcm9kdWN0SWNvblRoZW1lLmJpbmQodGhpcykpKTtcblx0XHR0aGlzLnByb2R1Y3RJY29uVGhlbWVSZWdpc3RyeSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaGVtZVJlZ2lzdHJ5KHByb2R1Y3RJY29uVGhlbWVzRXh0UG9pbnQsIFByb2R1Y3RJY29uVGhlbWVEYXRhLmZyb21FeHRlbnNpb25UaGVtZSwgdHJ1ZSwgUHJvZHVjdEljb25UaGVtZURhdGEuZGVmYXVsdFRoZW1lKSk7XG5cdFx0dGhpcy5vblByb2R1Y3RJY29uVGhlbWVDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJV29ya2JlbmNoUHJvZHVjdEljb25UaGVtZT4oKSk7XG5cdFx0dGhpcy5jdXJyZW50UHJvZHVjdEljb25UaGVtZSA9IFByb2R1Y3RJY29uVGhlbWVEYXRhLmNyZWF0ZVVubG9hZGVkVGhlbWUoJycpO1xuXHRcdHRoaXMucHJvZHVjdEljb25UaGVtZVNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDb2xvclRoZW1lQ2hhbmdlKHRoZW1lID0+IGdldENvbG9yUmVnaXN0cnkoKS5ub3RpZnlUaGVtZVVwZGF0ZSh0aGVtZSkpKTtcblxuXHRcdC8vIEluIG9yZGVyIHRvIGF2b2lkIHBhaW50IGZsYXNoaW5nIGZvciB0b2tlbnMsIGJlY2F1c2Vcblx0XHQvLyB0aGVtZXMgYXJlIGxvYWRlZCBhc3luY2hyb25vdXNseSwgd2UgbmVlZCB0byBpbml0aWFsaXplXG5cdFx0Ly8gYSBjb2xvciB0aGVtZSBkb2N1bWVudCB3aXRoIGdvb2QgZGVmYXVsdHMgdW50aWwgdGhlIHRoZW1lIGlzIGxvYWRlZFxuXHRcdGxldCB0aGVtZURhdGE6IENvbG9yVGhlbWVEYXRhIHwgdW5kZWZpbmVkID0gQ29sb3JUaGVtZURhdGEuZnJvbVN0b3JhZ2VEYXRhKHRoaXMuc3RvcmFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHByZXZpb3VzQ29sb3JUaGVtZVNldHRpbmcgPSB0aGVtZURhdGE/LnNldHRpbmdzSWQ7XG5cdFx0Y29uc3QgY29sb3JUaGVtZVNldHRpbmcgPSB0aGlzLnNldHRpbmdzLmNvbG9yVGhlbWU7XG5cdFx0aWYgKHRoZW1lRGF0YSAmJiBjb2xvclRoZW1lU2V0dGluZyAhPT0gdGhlbWVEYXRhLnNldHRpbmdzSWQpIHtcblx0XHRcdHRoZW1lRGF0YSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBkZWZhdWx0Q29sb3JNYXAgPSBjb2xvclRoZW1lU2V0dGluZyA9PT0gVGhlbWVTZXR0aW5nRGVmYXVsdHMuQ09MT1JfVEhFTUVfTElHSFQgPyBDT0xPUl9USEVNRV9MSUdIVF9JTklUSUFMX0NPTE9SUyA6IGNvbG9yVGhlbWVTZXR0aW5nID09PSBUaGVtZVNldHRpbmdEZWZhdWx0cy5DT0xPUl9USEVNRV9EQVJLID8gQ09MT1JfVEhFTUVfREFSS19JTklUSUFMX0NPTE9SUyA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXRoZW1lRGF0YSkge1xuXHRcdFx0Y29uc3QgaW5pdGlhbENvbG9yVGhlbWUgPSBlbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucz8uaW5pdGlhbENvbG9yVGhlbWU7XG5cdFx0XHRpZiAoaW5pdGlhbENvbG9yVGhlbWUpIHtcblx0XHRcdFx0dGhlbWVEYXRhID0gQ29sb3JUaGVtZURhdGEuY3JlYXRlVW5sb2FkZWRUaGVtZUZvclRoZW1lVHlwZShpbml0aWFsQ29sb3JUaGVtZS50aGVtZVR5cGUsIGluaXRpYWxDb2xvclRoZW1lLmNvbG9ycyA/PyBkZWZhdWx0Q29sb3JNYXApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIXRoZW1lRGF0YSkge1xuXHRcdFx0Y29uc3QgY29sb3JTY2hlbWUgPSB0aGlzLnNldHRpbmdzLmdldFByZWZlcnJlZENvbG9yU2NoZW1lKCkgPz8gKGlzV2ViID8gQ29sb3JTY2hlbWUuTElHSFQgOiBDb2xvclNjaGVtZS5EQVJLKTtcblx0XHRcdHRoZW1lRGF0YSA9IENvbG9yVGhlbWVEYXRhLmNyZWF0ZVVubG9hZGVkVGhlbWVGb3JUaGVtZVR5cGUoY29sb3JTY2hlbWUsIGRlZmF1bHRDb2xvck1hcCk7XG5cdFx0fVxuXHRcdHRoZW1lRGF0YS5zZXRDdXN0b21pemF0aW9ucyh0aGlzLnNldHRpbmdzKTtcblx0XHR0aGlzLmFwcGx5VGhlbWUodGhlbWVEYXRhLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0Y29uc3QgZmlsZUljb25EYXRhID0gRmlsZUljb25UaGVtZURhdGEuZnJvbVN0b3JhZ2VEYXRhKHRoaXMuc3RvcmFnZVNlcnZpY2UpO1xuXHRcdGlmIChmaWxlSWNvbkRhdGEpIHtcblx0XHRcdHRoaXMuYXBwbHlBbmRTZXRGaWxlSWNvblRoZW1lKGZpbGVJY29uRGF0YSwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvZHVjdEljb25EYXRhID0gUHJvZHVjdEljb25UaGVtZURhdGEuZnJvbVN0b3JhZ2VEYXRhKHRoaXMuc3RvcmFnZVNlcnZpY2UpO1xuXHRcdGlmIChwcm9kdWN0SWNvbkRhdGEpIHtcblx0XHRcdHRoaXMuYXBwbHlBbmRTZXRQcm9kdWN0SWNvblRoZW1lKHByb2R1Y3RJY29uRGF0YSwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0ZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKS50aGVuKF8gPT4ge1xuXHRcdFx0dGhpcy5pbnN0YWxsQ29uZmlndXJhdGlvbkxpc3RlbmVyKCk7XG5cdFx0XHR0aGlzLmluc3RhbGxQcmVmZXJyZWRTY2hlbWVMaXN0ZW5lcigpO1xuXHRcdFx0dGhpcy5pbnN0YWxsUmVnaXN0cnlMaXN0ZW5lcnMoKTtcblx0XHRcdHRoaXMuaW5pdGlhbGl6ZShwcmV2aW91c0NvbG9yVGhlbWVTZXR0aW5nKS5jYXRjaChlcnJvcnMub25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY29kaWNvblN0eWxlU2hlZXQgPSBjcmVhdGVTdHlsZVNoZWV0KCk7XG5cdFx0Y29kaWNvblN0eWxlU2hlZXQuaWQgPSAnY29kaWNvblN0eWxlcyc7XG5cblx0XHRjb25zdCBpY29uc1N0eWxlU2hlZXQgPSB0aGlzLl9yZWdpc3RlcihnZXRJY29uc1N0eWxlU2hlZXQodGhpcykpO1xuXHRcdGZ1bmN0aW9uIHVwZGF0ZUFsbCgpIHtcblx0XHRcdGNvZGljb25TdHlsZVNoZWV0LnRleHRDb250ZW50ID0gaWNvbnNTdHlsZVNoZWV0LmdldENTUygpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcih1cGRhdGVBbGwsIDApKTtcblx0XHR0aGlzLl9yZWdpc3RlcihpY29uc1N0eWxlU2hlZXQub25EaWRDaGFuZ2UoKCkgPT4gZGVsYXllci5zY2hlZHVsZSgpKSk7XG5cdFx0ZGVsYXllci5zY2hlZHVsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0aWFsaXplKHRoZW1lUHJldmlvdXNTZXR0aW5nc0lkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPFtJV29ya2JlbmNoQ29sb3JUaGVtZSB8IG51bGwsIElXb3JrYmVuY2hGaWxlSWNvblRoZW1lIHwgbnVsbCwgSVdvcmtiZW5jaFByb2R1Y3RJY29uVGhlbWUgfCBudWxsXT4ge1xuXHRcdGNvbnN0IGV4dERldkxvY3MgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5leHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9uVVJJO1xuXHRcdGNvbnN0IGV4dERldkxvYyA9IGV4dERldkxvY3MgJiYgZXh0RGV2TG9jcy5sZW5ndGggPT09IDEgPyBleHREZXZMb2NzWzBdIDogdW5kZWZpbmVkOyAvLyBpbiBkZXYgbW9kZSwgc3dpdGNoIHRvIGEgdGhlbWUgcHJvdmlkZWQgYnkgdGhlIGV4dGVuc2lvbiB1bmRlciBkZXYuXG5cblx0XHRjb25zdCBpbml0aWFsaXplQ29sb3JUaGVtZSA9IGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRldlRoZW1lcyA9IHRoaXMuY29sb3JUaGVtZVJlZ2lzdHJ5LmZpbmRUaGVtZUJ5RXh0ZW5zaW9uTG9jYXRpb24oZXh0RGV2TG9jKTtcblx0XHRcdGlmIChkZXZUaGVtZXMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IG1hdGNoZWRDb2xvclRoZW1lID0gZGV2VGhlbWVzLmZpbmQodGhlbWUgPT4gdGhlbWUudHlwZSA9PT0gdGhpcy5jdXJyZW50Q29sb3JUaGVtZS50eXBlKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2V0Q29sb3JUaGVtZShtYXRjaGVkQ29sb3JUaGVtZSA/IG1hdGNoZWRDb2xvclRoZW1lLmlkIDogZGV2VGhlbWVzWzBdLmlkLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdFx0bGV0IHRoZW1lID0gdGhpcy5jb2xvclRoZW1lUmVnaXN0cnkuZmluZFRoZW1lQnlTZXR0aW5nc0lkKHRoaXMuc2V0dGluZ3MuY29sb3JUaGVtZSwgdW5kZWZpbmVkKTtcblx0XHRcdGlmICghdGhlbWUpIHtcblx0XHRcdFx0Ly8gSWYgdGhlIGN1cnJlbnQgdGhlbWUgaXMgbm90IGF2YWlsYWJsZSwgZmlyc3QgbWFrZSBzdXJlIHNldHRpbmcgc3luYyBpcyBjb21wbGV0ZVxuXHRcdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhSW5pdGlhbGl6YXRpb25TZXJ2aWNlLndoZW5Jbml0aWFsaXphdGlvbkZpbmlzaGVkKCk7XG5cdFx0XHRcdC8vIHRyeSB0byBnZXQgdGhlIHRoZW1lIGFnYWluLCBub3cgd2l0aCBhIGZhbGxiYWNrIHRvIHRoZSBkZWZhdWx0IHRoZW1lc1xuXHRcdFx0XHRjb25zdCBmYWxsYmFja1RoZW1lID0gdGhpcy5jdXJyZW50Q29sb3JUaGVtZS50eXBlID09PSBDb2xvclNjaGVtZS5MSUdIVCA/IFRoZW1lU2V0dGluZ0RlZmF1bHRzLkNPTE9SX1RIRU1FX0xJR0hUIDogVGhlbWVTZXR0aW5nRGVmYXVsdHMuQ09MT1JfVEhFTUVfREFSSztcblx0XHRcdFx0dGhlbWUgPSB0aGlzLmNvbG9yVGhlbWVSZWdpc3RyeS5maW5kVGhlbWVCeVNldHRpbmdzSWQodGhpcy5zZXR0aW5ncy5jb2xvclRoZW1lLCBmYWxsYmFja1RoZW1lKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLnNldENvbG9yVGhlbWUodGhlbWUgJiYgdGhlbWUuaWQsIHVuZGVmaW5lZCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGluaXRpYWxpemVGaWxlSWNvblRoZW1lID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGV2VGhlbWVzID0gdGhpcy5maWxlSWNvblRoZW1lUmVnaXN0cnkuZmluZFRoZW1lQnlFeHRlbnNpb25Mb2NhdGlvbihleHREZXZMb2MpO1xuXHRcdFx0aWYgKGRldlRoZW1lcy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2V0RmlsZUljb25UaGVtZShkZXZUaGVtZXNbMF0uaWQsIENvbmZpZ3VyYXRpb25UYXJnZXQuTUVNT1JZKTtcblx0XHRcdH1cblx0XHRcdGxldCB0aGVtZSA9IHRoaXMuZmlsZUljb25UaGVtZVJlZ2lzdHJ5LmZpbmRUaGVtZUJ5U2V0dGluZ3NJZCh0aGlzLnNldHRpbmdzLmZpbGVJY29uVGhlbWUpO1xuXHRcdFx0aWYgKCF0aGVtZSkge1xuXHRcdFx0XHQvLyBJZiB0aGUgY3VycmVudCB0aGVtZSBpcyBub3QgYXZhaWxhYmxlLCBmaXJzdCBtYWtlIHN1cmUgc2V0dGluZyBzeW5jIGlzIGNvbXBsZXRlXG5cdFx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFJbml0aWFsaXphdGlvblNlcnZpY2Uud2hlbkluaXRpYWxpemF0aW9uRmluaXNoZWQoKTtcblx0XHRcdFx0dGhlbWUgPSB0aGlzLmZpbGVJY29uVGhlbWVSZWdpc3RyeS5maW5kVGhlbWVCeVNldHRpbmdzSWQodGhpcy5zZXR0aW5ncy5maWxlSWNvblRoZW1lKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLnNldEZpbGVJY29uVGhlbWUodGhlbWUgPyB0aGVtZS5pZCA6IERFRkFVTFRfRklMRV9JQ09OX1RIRU1FX0lELCB1bmRlZmluZWQpO1xuXHRcdH07XG5cblx0XHRjb25zdCBpbml0aWFsaXplUHJvZHVjdEljb25UaGVtZSA9IGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRldlRoZW1lcyA9IHRoaXMucHJvZHVjdEljb25UaGVtZVJlZ2lzdHJ5LmZpbmRUaGVtZUJ5RXh0ZW5zaW9uTG9jYXRpb24oZXh0RGV2TG9jKTtcblx0XHRcdGlmIChkZXZUaGVtZXMubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNldFByb2R1Y3RJY29uVGhlbWUoZGV2VGhlbWVzWzBdLmlkLCBDb25maWd1cmF0aW9uVGFyZ2V0Lk1FTU9SWSk7XG5cdFx0XHR9XG5cdFx0XHRsZXQgdGhlbWUgPSB0aGlzLnByb2R1Y3RJY29uVGhlbWVSZWdpc3RyeS5maW5kVGhlbWVCeVNldHRpbmdzSWQodGhpcy5zZXR0aW5ncy5wcm9kdWN0SWNvblRoZW1lKTtcblx0XHRcdGlmICghdGhlbWUpIHtcblx0XHRcdFx0Ly8gSWYgdGhlIGN1cnJlbnQgdGhlbWUgaXMgbm90IGF2YWlsYWJsZSwgZmlyc3QgbWFrZSBzdXJlIHNldHRpbmcgc3luYyBpcyBjb21wbGV0ZVxuXHRcdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhSW5pdGlhbGl6YXRpb25TZXJ2aWNlLndoZW5Jbml0aWFsaXphdGlvbkZpbmlzaGVkKCk7XG5cdFx0XHRcdHRoZW1lID0gdGhpcy5wcm9kdWN0SWNvblRoZW1lUmVnaXN0cnkuZmluZFRoZW1lQnlTZXR0aW5nc0lkKHRoaXMuc2V0dGluZ3MucHJvZHVjdEljb25UaGVtZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5zZXRQcm9kdWN0SWNvblRoZW1lKHRoZW1lID8gdGhlbWUuaWQgOiBERUZBVUxUX1BST0RVQ1RfSUNPTl9USEVNRV9JRCwgdW5kZWZpbmVkKTtcblx0XHR9O1xuXG5cblx0XHR0aGlzLm1pZ3JhdGVDb2xvclRoZW1lU2V0dGluZ3MoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBQcm9taXNlLmFsbChbaW5pdGlhbGl6ZUNvbG9yVGhlbWUoKSwgaW5pdGlhbGl6ZUZpbGVJY29uVGhlbWUoKSwgaW5pdGlhbGl6ZVByb2R1Y3RJY29uVGhlbWUoKV0pO1xuXHRcdGF3YWl0IHRoaXMuc2hvd05ld0RlZmF1bHRUaGVtZU5vdGlmaWNhdGlvbih0aGVtZVByZXZpb3VzU2V0dGluZ3NJZCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE5FV19USEVNRV9OT1RJRklDQVRJT05fS0VZID0gJ3dvcmtiZW5jaC5uZXdEZWZhdWx0VGhlbWVOb3RpZmljYXRpb24nO1xuXG5cdHByaXZhdGUgYXN5bmMgc2hvd05ld0RlZmF1bHRUaGVtZU5vdGlmaWNhdGlvbihwcmV2aW91c1NldHRpbmdzSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oV29ya2JlbmNoVGhlbWVTZXJ2aWNlLk5FV19USEVNRV9OT1RJRklDQVRJT05fS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pKSB7XG5cdFx0XHRyZXR1cm47IC8vIGFscmVhZHkgc2hvd25cblx0XHR9XG5cdFx0aWYgKCEoYXdhaXQgdGhpcy5ob3N0U2VydmljZS5oYWRMYXN0Rm9jdXMoKSkgfHwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0aWYgKCF0aGlzLnNldHRpbmdzLmlzRGVmYXVsdENvbG9yVGhlbWUoKSB8fCAhcHJldmlvdXNTZXR0aW5nc0lkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHByZXZpb3VzU2V0dGluZ3NJZCA9IG1pZ3JhdGVUaGVtZVNldHRpbmdzSWQocHJldmlvdXNTZXR0aW5nc0lkKTtcblx0XHRcdGlmICghWydEYXJrIE1vZGVybicsICdMaWdodCBNb2Rlcm4nXS5pbmNsdWRlcyhwcmV2aW91c1NldHRpbmdzSWQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghW1RoZW1lU2V0dGluZ0RlZmF1bHRzLkNPTE9SX1RIRU1FX0RBUkssIFRoZW1lU2V0dGluZ0RlZmF1bHRzLkNPTE9SX1RIRU1FX0xJR0hUXS5pbmNsdWRlcyh0aGlzLnNldHRpbmdzLmNvbG9yVGhlbWUpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Ly8gcmVtZWJlciB0byBub3Qgc2hvdyB0aGUgZGlhbG9nIGFnYWluXG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFdvcmtiZW5jaFRoZW1lU2VydmljZS5ORVdfVEhFTUVfTk9USUZJQ0FUSU9OX0tFWSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGtlZXBUaGVtZSA9IGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFx0U2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0bmxzLmxvY2FsaXplKHsga2V5OiAndGhlbWVVcGRhdGVkTm90aWZpY2F0aW9uJywgY29tbWVudDogWyd7MH0gaXMgdGhlIG5hbWUgb2YgdGhlIG5ldyBkZWZhdWx0IHRoZW1lJ10gfSwgXCJWUyBDb2RlIGhhcyBhIG5ldyBkZWZhdWx0IHRoZW1lOiAnezB9Jy5cIiwgdGhpcy5nZXRDb2xvclRoZW1lKCkubGFiZWwpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0aWQ6ICd0aGVtZVVwZGF0ZWQudHJ5SXRPdXQnLFxuXHRcdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgndHJ5TmV3VGhlbWUnLCBcIktlZXAgSXRcIiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHJlc29sdmUodHJ1ZSlcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHR0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRpZDogJ3RoZW1lVXBkYXRlZC5ub1RoYW5rcycsXG5cdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdub1RoYW5rcycsIFwiTm8gVGhhbmtzXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiByZXNvbHZlKGZhbHNlKVxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvbkNhbmNlbDogKCkgPT4gcmVzb2x2ZShmYWxzZSlcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdGlmICgha2VlcFRoZW1lKSB7XG5cdFx0XHRjb25zdCBwcmV2aW91c1RoZW1lID0gdGhpcy5jb2xvclRoZW1lUmVnaXN0cnkuZmluZFRoZW1lQnlTZXR0aW5nc0lkKHByZXZpb3VzU2V0dGluZ3NJZCk7XG5cdFx0XHRpZiAocHJldmlvdXNUaGVtZSkge1xuXHRcdFx0XHR0aGlzLnNldENvbG9yVGhlbWUocHJldmlvdXNUaGVtZS5pZCwgJ2F1dG8nKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogTWlncmF0ZXMgbGVnYWN5IHRoZW1lIHNldHRpbmcgdmFsdWVzIHRvIHRoZWlyIGN1cnJlbnQgZXF1aXZhbGVudHMsXG5cdCAqIHdyaXRpbmcgYmFjayB0aGUgbWlncmF0ZWQgdmFsdWUgc28gc2V0dGluZ3Mgc3luYyBkaXN0cmlidXRlcyB0aGUgY29ycmVjdCBJRC5cblx0ICovXG5cdHByaXZhdGUgbWlncmF0ZUNvbG9yVGhlbWVTZXR0aW5ncygpOiB2b2lkIHtcblx0XHRjb25zdCB0aGVtZVNldHRpbmdzID0gW1xuXHRcdFx0VGhlbWVTZXR0aW5ncy5DT0xPUl9USEVNRSxcblx0XHRcdFRoZW1lU2V0dGluZ3MuUFJFRkVSUkVEX0RBUktfVEhFTUUsXG5cdFx0XHRUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9MSUdIVF9USEVNRSxcblx0XHRcdFRoZW1lU2V0dGluZ3MuUFJFRkVSUkVEX0hDX0RBUktfVEhFTUUsXG5cdFx0XHRUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9IQ19MSUdIVF9USEVNRSxcblx0XHRdO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIHRoZW1lU2V0dGluZ3MpIHtcblx0XHRcdGNvbnN0IGluc3BlY3Rpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8c3RyaW5nPihrZXkpO1xuXHRcdFx0Zm9yIChjb25zdCBbdGFyZ2V0LCB2YWx1ZV0gb2YgW1xuXHRcdFx0XHRbQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLCBpbnNwZWN0aW9uLnVzZXJWYWx1ZV0sXG5cdFx0XHRcdFtDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFLCBpbnNwZWN0aW9uLnVzZXJSZW1vdGVWYWx1ZV0sXG5cdFx0XHRcdFtDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSwgaW5zcGVjdGlvbi53b3Jrc3BhY2VWYWx1ZV0sXG5cdFx0XHRdIGFzIGNvbnN0KSB7XG5cdFx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRcdGNvbnN0IG1pZ3JhdGVkID0gbWlncmF0ZVRoZW1lU2V0dGluZ3NJZCh2YWx1ZSk7XG5cdFx0XHRcdFx0aWYgKG1pZ3JhdGVkICE9PSB2YWx1ZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShrZXksIG1pZ3JhdGVkLCB0YXJnZXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaW5zdGFsbENvbmZpZ3VyYXRpb25MaXN0ZW5lcigpIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRoZW1lU2V0dGluZ3MuQ09MT1JfVEhFTUUpXG5cdFx0XHRcdHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGhlbWVTZXR0aW5ncy5QUkVGRVJSRURfREFSS19USEVNRSlcblx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9MSUdIVF9USEVNRSlcblx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9IQ19EQVJLX1RIRU1FKVxuXHRcdFx0XHR8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRoZW1lU2V0dGluZ3MuUFJFRkVSUkVEX0hDX0xJR0hUX1RIRU1FKVxuXHRcdFx0XHR8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRoZW1lU2V0dGluZ3MuREVURUNUX0NPTE9SX1NDSEVNRSlcblx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUaGVtZVNldHRpbmdzLkRFVEVDVF9IQylcblx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUaGVtZVNldHRpbmdzLlNZU1RFTV9DT0xPUl9USEVNRSlcblx0XHRcdCkge1xuXHRcdFx0XHR0aGlzLnJlc3RvcmVDb2xvclRoZW1lKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUaGVtZVNldHRpbmdzLkZJTEVfSUNPTl9USEVNRSkpIHtcblx0XHRcdFx0dGhpcy5yZXN0b3JlRmlsZUljb25UaGVtZSgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGhlbWVTZXR0aW5ncy5QUk9EVUNUX0lDT05fVEhFTUUpKSB7XG5cdFx0XHRcdHRoaXMucmVzdG9yZVByb2R1Y3RJY29uVGhlbWUoKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmN1cnJlbnRDb2xvclRoZW1lKSB7XG5cdFx0XHRcdGxldCBoYXNDb2xvckNoYW5nZXMgPSBmYWxzZTtcblx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGhlbWVTZXR0aW5ncy5DT0xPUl9DVVNUT01JWkFUSU9OUykpIHtcblx0XHRcdFx0XHR0aGlzLmN1cnJlbnRDb2xvclRoZW1lLnNldEN1c3RvbUNvbG9ycyh0aGlzLnNldHRpbmdzLmNvbG9yQ3VzdG9taXphdGlvbnMpO1xuXHRcdFx0XHRcdGhhc0NvbG9yQ2hhbmdlcyA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGhlbWVTZXR0aW5ncy5UT0tFTl9DT0xPUl9DVVNUT01JWkFUSU9OUykpIHtcblx0XHRcdFx0XHR0aGlzLmN1cnJlbnRDb2xvclRoZW1lLnNldEN1c3RvbVRva2VuQ29sb3JzKHRoaXMuc2V0dGluZ3MudG9rZW5Db2xvckN1c3RvbWl6YXRpb25zKTtcblx0XHRcdFx0XHRoYXNDb2xvckNoYW5nZXMgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRoZW1lU2V0dGluZ3MuU0VNQU5USUNfVE9LRU5fQ09MT1JfQ1VTVE9NSVpBVElPTlMpKSB7XG5cdFx0XHRcdFx0dGhpcy5jdXJyZW50Q29sb3JUaGVtZS5zZXRDdXN0b21TZW1hbnRpY1Rva2VuQ29sb3JzKHRoaXMuc2V0dGluZ3Muc2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMpO1xuXHRcdFx0XHRcdGhhc0NvbG9yQ2hhbmdlcyA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGhhc0NvbG9yQ2hhbmdlcykge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlRHluYW1pY0NTU1J1bGVzKHRoaXMuY3VycmVudENvbG9yVGhlbWUpO1xuXHRcdFx0XHRcdHRoaXMub25Db2xvclRoZW1lQ2hhbmdlLmZpcmUodGhpcy5jdXJyZW50Q29sb3JUaGVtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGluc3RhbGxSZWdpc3RyeUxpc3RlbmVycygpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGxldCBwcmV2Q29sb3JJZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gdXBkYXRlIHNldHRpbmdzIHNjaGVtYSBzZXR0aW5nIGZvciB0aGVtZSBzcGVjaWZpYyBzZXR0aW5nc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29sb3JUaGVtZVJlZ2lzdHJ5Lm9uRGlkQ2hhbmdlKGFzeW5jIGV2ZW50ID0+IHtcblx0XHRcdHVwZGF0ZUNvbG9yVGhlbWVDb25maWd1cmF0aW9uU2NoZW1hcyhldmVudC50aGVtZXMpO1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMucmVzdG9yZUNvbG9yVGhlbWUoKSkgeyAvLyBjaGVja3MgaWYgdGhlbWUgZnJvbSBzZXR0aW5ncyBleGlzdHMgYW5kIGlzIHNldFxuXHRcdFx0XHQvLyByZXN0b3JlIHRoZW1lXG5cdFx0XHRcdGlmICh0aGlzLmN1cnJlbnRDb2xvclRoZW1lLnNldHRpbmdzSWQgPT09IFRoZW1lU2V0dGluZ0RlZmF1bHRzLkNPTE9SX1RIRU1FX0RBUksgJiYgIXR5cGVzLmlzVW5kZWZpbmVkKHByZXZDb2xvcklkKSAmJiBhd2FpdCB0aGlzLmNvbG9yVGhlbWVSZWdpc3RyeS5maW5kVGhlbWVCeUlkKHByZXZDb2xvcklkKSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuc2V0Q29sb3JUaGVtZShwcmV2Q29sb3JJZCwgJ2F1dG8nKTtcblx0XHRcdFx0XHRwcmV2Q29sb3JJZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fSBlbHNlIGlmIChldmVudC5hZGRlZC5zb21lKHQgPT4gdC5zZXR0aW5nc0lkID09PSB0aGlzLmN1cnJlbnRDb2xvclRoZW1lLnNldHRpbmdzSWQpKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5yZWxvYWRDdXJyZW50Q29sb3JUaGVtZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LnJlbW92ZWQuc29tZSh0ID0+IHQuc2V0dGluZ3NJZCA9PT0gdGhpcy5jdXJyZW50Q29sb3JUaGVtZS5zZXR0aW5nc0lkKSkge1xuXHRcdFx0XHQvLyBjdXJyZW50IHRoZW1lIGlzIG5vIGxvbmdlciBhdmFpbGFibGVcblx0XHRcdFx0cHJldkNvbG9ySWQgPSB0aGlzLmN1cnJlbnRDb2xvclRoZW1lLmlkO1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0VGhlbWUgPSB0aGlzLmNvbG9yVGhlbWVSZWdpc3RyeS5maW5kVGhlbWVCeVNldHRpbmdzSWQoVGhlbWVTZXR0aW5nRGVmYXVsdHMuQ09MT1JfVEhFTUVfREFSSyk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2V0Q29sb3JUaGVtZShkZWZhdWx0VGhlbWUsICdhdXRvJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bGV0IHByZXZGaWxlSWNvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlSWNvblRoZW1lUmVnaXN0cnkub25EaWRDaGFuZ2UoYXN5bmMgZXZlbnQgPT4ge1xuXHRcdFx0dXBkYXRlRmlsZUljb25UaGVtZUNvbmZpZ3VyYXRpb25TY2hlbWFzKGV2ZW50LnRoZW1lcyk7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5yZXN0b3JlRmlsZUljb25UaGVtZSgpKSB7IC8vIGNoZWNrcyBpZiB0aGVtZSBmcm9tIHNldHRpbmdzIGV4aXN0cyBhbmQgaXMgc2V0XG5cdFx0XHRcdC8vIHJlc3RvcmUgdGhlbWVcblx0XHRcdFx0aWYgKHRoaXMuY3VycmVudEZpbGVJY29uVGhlbWUuaWQgPT09IERFRkFVTFRfRklMRV9JQ09OX1RIRU1FX0lEICYmICF0eXBlcy5pc1VuZGVmaW5lZChwcmV2RmlsZUljb25JZCkgJiYgdGhpcy5maWxlSWNvblRoZW1lUmVnaXN0cnkuZmluZFRoZW1lQnlJZChwcmV2RmlsZUljb25JZCkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnNldEZpbGVJY29uVGhlbWUocHJldkZpbGVJY29uSWQsICdhdXRvJyk7XG5cdFx0XHRcdFx0cHJldkZpbGVJY29uSWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZXZlbnQuYWRkZWQuc29tZSh0ID0+IHQuc2V0dGluZ3NJZCA9PT0gdGhpcy5jdXJyZW50RmlsZUljb25UaGVtZS5zZXR0aW5nc0lkKSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucmVsb2FkQ3VycmVudEZpbGVJY29uVGhlbWUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChldmVudC5yZW1vdmVkLnNvbWUodCA9PiB0LnNldHRpbmdzSWQgPT09IHRoaXMuY3VycmVudEZpbGVJY29uVGhlbWUuc2V0dGluZ3NJZCkpIHtcblx0XHRcdFx0Ly8gY3VycmVudCB0aGVtZSBpcyBubyBsb25nZXIgYXZhaWxhYmxlXG5cdFx0XHRcdHByZXZGaWxlSWNvbklkID0gdGhpcy5jdXJyZW50RmlsZUljb25UaGVtZS5pZDtcblx0XHRcdFx0YXdhaXQgdGhpcy5zZXRGaWxlSWNvblRoZW1lKERFRkFVTFRfRklMRV9JQ09OX1RIRU1FX0lELCAnYXV0bycpO1xuXHRcdFx0fVxuXG5cdFx0fSkpKTtcblxuXHRcdGxldCBwcmV2UHJvZHVjdEljb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucHJvZHVjdEljb25UaGVtZVJlZ2lzdHJ5Lm9uRGlkQ2hhbmdlKGFzeW5jIGV2ZW50ID0+IHtcblx0XHRcdHVwZGF0ZVByb2R1Y3RJY29uVGhlbWVDb25maWd1cmF0aW9uU2NoZW1hcyhldmVudC50aGVtZXMpO1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMucmVzdG9yZVByb2R1Y3RJY29uVGhlbWUoKSkgeyAvLyBjaGVja3MgaWYgdGhlbWUgZnJvbSBzZXR0aW5ncyBleGlzdHMgYW5kIGlzIHNldFxuXHRcdFx0XHQvLyByZXN0b3JlIHRoZW1lXG5cdFx0XHRcdGlmICh0aGlzLmN1cnJlbnRQcm9kdWN0SWNvblRoZW1lLmlkID09PSBERUZBVUxUX1BST0RVQ1RfSUNPTl9USEVNRV9JRCAmJiAhdHlwZXMuaXNVbmRlZmluZWQocHJldlByb2R1Y3RJY29uSWQpICYmIHRoaXMucHJvZHVjdEljb25UaGVtZVJlZ2lzdHJ5LmZpbmRUaGVtZUJ5SWQocHJldlByb2R1Y3RJY29uSWQpKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5zZXRQcm9kdWN0SWNvblRoZW1lKHByZXZQcm9kdWN0SWNvbklkLCAnYXV0bycpO1xuXHRcdFx0XHRcdHByZXZQcm9kdWN0SWNvbklkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmFkZGVkLnNvbWUodCA9PiB0LnNldHRpbmdzSWQgPT09IHRoaXMuY3VycmVudFByb2R1Y3RJY29uVGhlbWUuc2V0dGluZ3NJZCkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJlbG9hZEN1cnJlbnRQcm9kdWN0SWNvblRoZW1lKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQucmVtb3ZlZC5zb21lKHQgPT4gdC5zZXR0aW5nc0lkID09PSB0aGlzLmN1cnJlbnRQcm9kdWN0SWNvblRoZW1lLnNldHRpbmdzSWQpKSB7XG5cdFx0XHRcdC8vIGN1cnJlbnQgdGhlbWUgaXMgbm8gbG9uZ2VyIGF2YWlsYWJsZVxuXHRcdFx0XHRwcmV2UHJvZHVjdEljb25JZCA9IHRoaXMuY3VycmVudFByb2R1Y3RJY29uVGhlbWUuaWQ7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2V0UHJvZHVjdEljb25UaGVtZShERUZBVUxUX1BST0RVQ1RfSUNPTl9USEVNRV9JRCwgJ2F1dG8nKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYW5ndWFnZVNlcnZpY2Uub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5yZWxvYWRDdXJyZW50RmlsZUljb25UaGVtZSgpKSk7XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoW3RoaXMuZ2V0Q29sb3JUaGVtZXMoKSwgdGhpcy5nZXRGaWxlSWNvblRoZW1lcygpLCB0aGlzLmdldFByb2R1Y3RJY29uVGhlbWVzKCldKS50aGVuKChbY3QsIGZpdCwgcGl0XSkgPT4ge1xuXHRcdFx0dXBkYXRlQ29sb3JUaGVtZUNvbmZpZ3VyYXRpb25TY2hlbWFzKGN0KTtcblx0XHRcdHVwZGF0ZUZpbGVJY29uVGhlbWVDb25maWd1cmF0aW9uU2NoZW1hcyhmaXQpO1xuXHRcdFx0dXBkYXRlUHJvZHVjdEljb25UaGVtZUNvbmZpZ3VyYXRpb25TY2hlbWFzKHBpdCk7XG5cdFx0fSk7XG5cdH1cblxuXG5cdC8vIHByZWZlcnJlZCBzY2hlbWUgaGFuZGxpbmdcblxuXHRwcml2YXRlIGluc3RhbGxQcmVmZXJyZWRTY2hlbWVMaXN0ZW5lcigpIHtcblx0XHRsZXQgcHJldmlvdXMgPSB7IGRhcms6IHRoaXMuaG9zdENvbG9yU2VydmljZS5kYXJrLCBoaWdoQ29udHJhc3Q6IHRoaXMuaG9zdENvbG9yU2VydmljZS5oaWdoQ29udHJhc3QgfTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvc3RDb2xvclNlcnZpY2Uub25EaWRDaGFuZ2VDb2xvclNjaGVtZSgoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN0b3JlQ29sb3JUaGVtZSA9IHRoaXMuc2V0dGluZ3MuaXNQcmVmZXJyZWRDb2xvclNjaGVtZUNoYW5nZShwcmV2aW91cyk7XG5cdFx0XHRwcmV2aW91cyA9IHsgZGFyazogdGhpcy5ob3N0Q29sb3JTZXJ2aWNlLmRhcmssIGhpZ2hDb250cmFzdDogdGhpcy5ob3N0Q29sb3JTZXJ2aWNlLmhpZ2hDb250cmFzdCB9O1xuXHRcdFx0aWYgKHJlc3RvcmVDb2xvclRoZW1lKSB7XG5cdFx0XHRcdHRoaXMucmVzdG9yZUNvbG9yVGhlbWUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29sb3JUaGVtZSgpOiBJV29ya2JlbmNoQ29sb3JUaGVtZSB7XG5cdFx0cmV0dXJuIHRoaXMuY3VycmVudENvbG9yVGhlbWU7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0Q29sb3JUaGVtZXMoKTogUHJvbWlzZTxJV29ya2JlbmNoQ29sb3JUaGVtZVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuY29sb3JUaGVtZVJlZ2lzdHJ5LmdldFRoZW1lcygpO1xuXHR9XG5cblx0cHVibGljIGdldFByZWZlcnJlZENvbG9yU2NoZW1lKCk6IENvbG9yU2NoZW1lIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5zZXR0aW5ncy5nZXRQcmVmZXJyZWRDb2xvclNjaGVtZSgpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldE1hcmtldHBsYWNlQ29sb3JUaGVtZXMocHVibGlzaGVyOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgdmVyc2lvbjogc3RyaW5nKTogUHJvbWlzZTxJV29ya2JlbmNoQ29sb3JUaGVtZVtdPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uTG9jYXRpb24gPSBhd2FpdCB0aGlzLmV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZS5nZXRFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VVUkwoeyBwdWJsaXNoZXIsIG5hbWUsIHZlcnNpb24gfSwgJ2V4dGVuc2lvbicpO1xuXHRcdGlmIChleHRlbnNpb25Mb2NhdGlvbikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgbWFuaWZlc3RDb250ZW50ID0gYXdhaXQgdGhpcy5leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UucmVhZEV4dGVuc2lvblJlc291cmNlKHJlc291cmNlcy5qb2luUGF0aChleHRlbnNpb25Mb2NhdGlvbiwgJ3BhY2thZ2UuanNvbicpKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuY29sb3JUaGVtZVJlZ2lzdHJ5LmdldE1hcmtldHBsYWNlVGhlbWVzKEpTT04ucGFyc2UobWFuaWZlc3RDb250ZW50KSwgZXh0ZW5zaW9uTG9jYXRpb24sIEV4dGVuc2lvbkRhdGEuZnJvbU5hbWUocHVibGlzaGVyLCBuYW1lKSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignUHJvYmxlbSBsb2FkaW5nIHRoZW1lcyBmcm9tIG1hcmtldHBsYWNlJywgZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRDb2xvclRoZW1lQ2hhbmdlKCk6IEV2ZW50PElXb3JrYmVuY2hDb2xvclRoZW1lPiB7XG5cdFx0cmV0dXJuIHRoaXMub25Db2xvclRoZW1lQ2hhbmdlLmV2ZW50O1xuXHR9XG5cblx0cHVibGljIHNldENvbG9yVGhlbWUodGhlbWVJZE9yVGhlbWU6IHN0cmluZyB8IHVuZGVmaW5lZCB8IElXb3JrYmVuY2hDb2xvclRoZW1lLCBzZXR0aW5nc1RhcmdldDogVGhlbWVTZXR0aW5nVGFyZ2V0KTogUHJvbWlzZTxJV29ya2JlbmNoQ29sb3JUaGVtZSB8IG51bGw+IHtcblx0XHRyZXR1cm4gdGhpcy5jb2xvclRoZW1lU2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLmludGVybmFsU2V0Q29sb3JUaGVtZSh0aGVtZUlkT3JUaGVtZSwgc2V0dGluZ3NUYXJnZXQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbnRlcm5hbFNldENvbG9yVGhlbWUodGhlbWVJZE9yVGhlbWU6IHN0cmluZyB8IHVuZGVmaW5lZCB8IElXb3JrYmVuY2hDb2xvclRoZW1lLCBzZXR0aW5nc1RhcmdldDogVGhlbWVTZXR0aW5nVGFyZ2V0KTogUHJvbWlzZTxJV29ya2JlbmNoQ29sb3JUaGVtZSB8IG51bGw+IHtcblx0XHRpZiAoIXRoZW1lSWRPclRoZW1lKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgdGhlbWVJZCA9IHR5cGVzLmlzU3RyaW5nKHRoZW1lSWRPclRoZW1lKSA/IHZhbGlkYXRlVGhlbWVJZCh0aGVtZUlkT3JUaGVtZSkgOiB0aGVtZUlkT3JUaGVtZS5pZDtcblx0XHRpZiAodGhpcy5jdXJyZW50Q29sb3JUaGVtZS5pc0xvYWRlZCAmJiB0aGVtZUlkID09PSB0aGlzLmN1cnJlbnRDb2xvclRoZW1lLmlkKSB7XG5cdFx0XHRpZiAoc2V0dGluZ3NUYXJnZXQgIT09ICdwcmV2aWV3Jykge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRDb2xvclRoZW1lLnRvU3RvcmFnZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLnNldHRpbmdzLnNldENvbG9yVGhlbWUodGhpcy5jdXJyZW50Q29sb3JUaGVtZSwgc2V0dGluZ3NUYXJnZXQpO1xuXHRcdH1cblxuXHRcdGxldCB0aGVtZURhdGEgPSB0aGlzLmNvbG9yVGhlbWVSZWdpc3RyeS5maW5kVGhlbWVCeUlkKHRoZW1lSWQpO1xuXHRcdGlmICghdGhlbWVEYXRhKSB7XG5cdFx0XHRpZiAodGhlbWVJZE9yVGhlbWUgaW5zdGFuY2VvZiBDb2xvclRoZW1lRGF0YSkge1xuXHRcdFx0XHR0aGVtZURhdGEgPSB0aGVtZUlkT3JUaGVtZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhlbWVEYXRhLmVuc3VyZUxvYWRlZCh0aGlzLmV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSk7XG5cdFx0XHR0aGVtZURhdGEuc2V0Q3VzdG9taXphdGlvbnModGhpcy5zZXR0aW5ncyk7XG5cdFx0XHRyZXR1cm4gdGhpcy5hcHBseVRoZW1lKHRoZW1lRGF0YSwgc2V0dGluZ3NUYXJnZXQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdlcnJvci5jYW5ub3Rsb2FkdGhlbWUnLCBcIlVuYWJsZSB0byBsb2FkIHswfTogezF9XCIsIHRoZW1lRGF0YS5sb2NhdGlvbj8udG9TdHJpbmcoKSwgZXJyb3IubWVzc2FnZSkpO1xuXHRcdH1cblxuXHR9XG5cblx0cHJpdmF0ZSByZWxvYWRDdXJyZW50Q29sb3JUaGVtZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5jb2xvclRoZW1lU2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHRoZW1lID0gdGhpcy5jb2xvclRoZW1lUmVnaXN0cnkuZmluZFRoZW1lQnlTZXR0aW5nc0lkKHRoaXMuY3VycmVudENvbG9yVGhlbWUuc2V0dGluZ3NJZCkgfHwgdGhpcy5jdXJyZW50Q29sb3JUaGVtZTtcblx0XHRcdFx0YXdhaXQgdGhlbWUucmVsb2FkKHRoaXMuZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlKTtcblx0XHRcdFx0dGhlbWUuc2V0Q3VzdG9taXphdGlvbnModGhpcy5zZXR0aW5ncyk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuYXBwbHlUaGVtZSh0aGVtZSwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnVW5hYmxlIHRvIHJlbG9hZCB7MH06IHsxfScsIHRoaXMuY3VycmVudENvbG9yVGhlbWUubG9jYXRpb24/LnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlc3RvcmVDb2xvclRoZW1lKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLmNvbG9yVGhlbWVTZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2V0dGluZ0lkID0gdGhpcy5zZXR0aW5ncy5jb2xvclRoZW1lO1xuXHRcdFx0Y29uc3QgdGhlbWUgPSB0aGlzLmNvbG9yVGhlbWVSZWdpc3RyeS5maW5kVGhlbWVCeVNldHRpbmdzSWQoc2V0dGluZ0lkKTtcblx0XHRcdGlmICh0aGVtZSkge1xuXHRcdFx0XHRpZiAoc2V0dGluZ0lkICE9PSB0aGlzLmN1cnJlbnRDb2xvclRoZW1lLnNldHRpbmdzSWQpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmludGVybmFsU2V0Q29sb3JUaGVtZSh0aGVtZS5pZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGVtZSAhPT0gdGhpcy5jdXJyZW50Q29sb3JUaGVtZSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoZW1lLmVuc3VyZUxvYWRlZCh0aGlzLmV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSk7XG5cdFx0XHRcdFx0dGhlbWUuc2V0Q3VzdG9taXphdGlvbnModGhpcy5zZXR0aW5ncyk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5hcHBseVRoZW1lKHRoZW1lLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVEeW5hbWljQ1NTUnVsZXModGhlbWVEYXRhOiBJQ29sb3JUaGVtZSkge1xuXHRcdGNvbnN0IGNzcyA9IGdlbmVyYXRlQ29sb3JUaGVtZUNTUyhcblx0XHRcdHRoZW1lRGF0YSxcblx0XHRcdCcubW9uYWNvLXdvcmtiZW5jaCcsXG5cdFx0XHR0aGVtaW5nUmVnaXN0cnkuZ2V0VGhlbWluZ1BhcnRpY2lwYW50cygpLFxuXHRcdFx0dGhpcy5lbnZpcm9ubWVudFNlcnZpY2Vcblx0XHQpO1xuXHRcdF9hcHBseVJ1bGVzKGNzcy5jb2RlLCBjb2xvclRoZW1lUnVsZXNDbGFzc05hbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseVRoZW1lKG5ld1RoZW1lOiBDb2xvclRoZW1lRGF0YSwgc2V0dGluZ3NUYXJnZXQ6IFRoZW1lU2V0dGluZ1RhcmdldCwgc2lsZW50ID0gZmFsc2UpOiBQcm9taXNlPElXb3JrYmVuY2hDb2xvclRoZW1lIHwgbnVsbD4ge1xuXHRcdHRoaXMudXBkYXRlRHluYW1pY0NTU1J1bGVzKG5ld1RoZW1lKTtcblxuXHRcdGlmICh0aGlzLmN1cnJlbnRDb2xvclRoZW1lLmlkKSB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKC4uLnRoaXMuY3VycmVudENvbG9yVGhlbWUuY2xhc3NOYW1lcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoVGhlbWVUeXBlU2VsZWN0b3IuVlMsIFRoZW1lVHlwZVNlbGVjdG9yLlZTX0RBUkssIFRoZW1lVHlwZVNlbGVjdG9yLkhDX0JMQUNLLCBUaGVtZVR5cGVTZWxlY3Rvci5IQ19MSUdIVCk7XG5cdFx0fVxuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoLi4ubmV3VGhlbWUuY2xhc3NOYW1lcyk7XG5cblx0XHR0aGlzLmN1cnJlbnRDb2xvclRoZW1lLmNsZWFyQ2FjaGVzKCk7XG5cdFx0dGhpcy5jdXJyZW50Q29sb3JUaGVtZSA9IG5ld1RoZW1lO1xuXHRcdGlmICghdGhpcy5jb2xvclRoZW1pbmdQYXJ0aWNpcGFudENoYW5nZUxpc3RlbmVyKSB7XG5cdFx0XHR0aGlzLmNvbG9yVGhlbWluZ1BhcnRpY2lwYW50Q2hhbmdlTGlzdGVuZXIgPSB0aGVtaW5nUmVnaXN0cnkub25UaGVtaW5nUGFydGljaXBhbnRBZGRlZChfID0+IHRoaXMudXBkYXRlRHluYW1pY0NTU1J1bGVzKHRoaXMuY3VycmVudENvbG9yVGhlbWUpKTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbG9yVGhlbWVXYXRjaGVyLnVwZGF0ZShuZXdUaGVtZSk7XG5cblx0XHR0aGlzLnNlbmRUZWxlbWV0cnkobmV3VGhlbWUuaWQsIG5ld1RoZW1lLmV4dGVuc2lvbkRhdGEsICdjb2xvcicpO1xuXG5cdFx0aWYgKHNpbGVudCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHR9XG5cblx0XHR0aGlzLm9uQ29sb3JUaGVtZUNoYW5nZS5maXJlKHRoaXMuY3VycmVudENvbG9yVGhlbWUpO1xuXG5cdFx0Ly8gcmVtZW1iZXIgdGhlbWUgZGF0YSBmb3IgYSBxdWljayByZXN0b3JlXG5cdFx0aWYgKG5ld1RoZW1lLmlzTG9hZGVkICYmIHNldHRpbmdzVGFyZ2V0ICE9PSAncHJldmlldycpIHtcblx0XHRcdG5ld1RoZW1lLnRvU3RvcmFnZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5zZXR0aW5ncy5zZXRDb2xvclRoZW1lKHRoaXMuY3VycmVudENvbG9yVGhlbWUsIHNldHRpbmdzVGFyZ2V0KTtcblx0fVxuXG5cblx0cHJpdmF0ZSB0aGVtZUV4dGVuc2lvbnNBY3RpdmF0ZWQgPSBuZXcgTWFwPHN0cmluZywgYm9vbGVhbj4oKTtcblx0cHJpdmF0ZSBzZW5kVGVsZW1ldHJ5KHRoZW1lSWQ6IHN0cmluZywgdGhlbWVEYXRhOiBFeHRlbnNpb25EYXRhIHwgdW5kZWZpbmVkLCB0aGVtZVR5cGU6IHN0cmluZykge1xuXHRcdGlmICh0aGVtZURhdGEpIHtcblx0XHRcdGNvbnN0IGtleSA9IHRoZW1lVHlwZSArIHRoZW1lRGF0YS5leHRlbnNpb25JZDtcblx0XHRcdGlmICghdGhpcy50aGVtZUV4dGVuc2lvbnNBY3RpdmF0ZWQuZ2V0KGtleSkpIHtcblx0XHRcdFx0dHlwZSBBY3RpdmF0ZVBsdWdpbkNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdG93bmVyOiAnYWVzY2hsaSc7XG5cdFx0XHRcdFx0Y29tbWVudDogJ0FuIGV2ZW50IGlzIGZpcmVkIHdoZW4gYW4gY29sb3IgdGhlbWUgZXh0ZW5zaW9uIGlzIGZpcnN0IHVzZWQgYXMgaXQgcHJvdmlkZXMgdGhlIGN1cnJlbnRseSBzaG93biBjb2xvciB0aGVtZS4nO1xuXHRcdFx0XHRcdGlkOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBleHRlbnNpb24gaWQuJyB9O1xuXHRcdFx0XHRcdG5hbWU6IHsgY2xhc3NpZmljYXRpb246ICdQdWJsaWNOb25QZXJzb25hbERhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGV4dGVuc2lvbiBuYW1lLicgfTtcblx0XHRcdFx0XHRpc0J1aWx0aW46IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBleHRlbnNpb24gaXMgYSBidWlsdC1pbiBleHRlbnNpb24uJyB9O1xuXHRcdFx0XHRcdHB1Ymxpc2hlckRpc3BsYXlOYW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGV4dGVuc2lvbiBwdWJsaXNoZXIgaWQuJyB9O1xuXHRcdFx0XHRcdHRoZW1lSWQ6IHsgY2xhc3NpZmljYXRpb246ICdQdWJsaWNOb25QZXJzb25hbERhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGlkIG9mIHRoZSB0aGVtZSB0aGF0IHRyaWdnZXJlZCB0aGUgZmlyc3QgZXh0ZW5zaW9uIHVzZS4nIH07XG5cdFx0XHRcdH07XG5cdFx0XHRcdHR5cGUgQWN0aXZhdGVQbHVnaW5FdmVudCA9IHtcblx0XHRcdFx0XHRpZDogc3RyaW5nO1xuXHRcdFx0XHRcdG5hbWU6IHN0cmluZztcblx0XHRcdFx0XHRpc0J1aWx0aW46IGJvb2xlYW47XG5cdFx0XHRcdFx0cHVibGlzaGVyRGlzcGxheU5hbWU6IHN0cmluZztcblx0XHRcdFx0XHR0aGVtZUlkOiBzdHJpbmc7XG5cdFx0XHRcdH07XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEFjdGl2YXRlUGx1Z2luRXZlbnQsIEFjdGl2YXRlUGx1Z2luQ2xhc3NpZmljYXRpb24+KCdhY3RpdmF0ZVRoZW1lRXh0ZW5zaW9uJywge1xuXHRcdFx0XHRcdGlkOiB0aGVtZURhdGEuZXh0ZW5zaW9uSWQsXG5cdFx0XHRcdFx0bmFtZTogdGhlbWVEYXRhLmV4dGVuc2lvbk5hbWUsXG5cdFx0XHRcdFx0aXNCdWlsdGluOiB0aGVtZURhdGEuZXh0ZW5zaW9uSXNCdWlsdGluLFxuXHRcdFx0XHRcdHB1Ymxpc2hlckRpc3BsYXlOYW1lOiB0aGVtZURhdGEuZXh0ZW5zaW9uUHVibGlzaGVyLFxuXHRcdFx0XHRcdHRoZW1lSWQ6IHRoZW1lSWRcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMudGhlbWVFeHRlbnNpb25zQWN0aXZhdGVkLnNldChrZXksIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRGaWxlSWNvblRoZW1lcygpOiBQcm9taXNlPElXb3JrYmVuY2hGaWxlSWNvblRoZW1lW10+IHtcblx0XHRyZXR1cm4gdGhpcy5maWxlSWNvblRoZW1lUmVnaXN0cnkuZ2V0VGhlbWVzKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RmlsZUljb25UaGVtZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5jdXJyZW50RmlsZUljb25UaGVtZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRGaWxlSWNvblRoZW1lQ2hhbmdlKCk6IEV2ZW50PElXb3JrYmVuY2hGaWxlSWNvblRoZW1lPiB7XG5cdFx0cmV0dXJuIHRoaXMub25GaWxlSWNvblRoZW1lQ2hhbmdlLmV2ZW50O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHNldEZpbGVJY29uVGhlbWUoaWNvblRoZW1lT3JJZDogc3RyaW5nIHwgdW5kZWZpbmVkIHwgSVdvcmtiZW5jaEZpbGVJY29uVGhlbWUsIHNldHRpbmdzVGFyZ2V0OiBUaGVtZVNldHRpbmdUYXJnZXQpOiBQcm9taXNlPElXb3JrYmVuY2hGaWxlSWNvblRoZW1lPiB7XG5cdFx0cmV0dXJuIHRoaXMuZmlsZUljb25UaGVtZVNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnRlcm5hbFNldEZpbGVJY29uVGhlbWUoaWNvblRoZW1lT3JJZCwgc2V0dGluZ3NUYXJnZXQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbnRlcm5hbFNldEZpbGVJY29uVGhlbWUoaWNvblRoZW1lT3JJZDogc3RyaW5nIHwgdW5kZWZpbmVkIHwgSVdvcmtiZW5jaEZpbGVJY29uVGhlbWUsIHNldHRpbmdzVGFyZ2V0OiBUaGVtZVNldHRpbmdUYXJnZXQpOiBQcm9taXNlPElXb3JrYmVuY2hGaWxlSWNvblRoZW1lPiB7XG5cdFx0aWYgKGljb25UaGVtZU9ySWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWNvblRoZW1lT3JJZCA9ICcnO1xuXHRcdH1cblx0XHRjb25zdCB0aGVtZUlkID0gdHlwZXMuaXNTdHJpbmcoaWNvblRoZW1lT3JJZCkgPyBpY29uVGhlbWVPcklkIDogaWNvblRoZW1lT3JJZC5pZDtcblx0XHRpZiAodGhlbWVJZCAhPT0gdGhpcy5jdXJyZW50RmlsZUljb25UaGVtZS5pZCB8fCAhdGhpcy5jdXJyZW50RmlsZUljb25UaGVtZS5pc0xvYWRlZCkge1xuXG5cdFx0XHRsZXQgbmV3VGhlbWVEYXRhID0gdGhpcy5maWxlSWNvblRoZW1lUmVnaXN0cnkuZmluZFRoZW1lQnlJZCh0aGVtZUlkKTtcblx0XHRcdGlmICghbmV3VGhlbWVEYXRhICYmIGljb25UaGVtZU9ySWQgaW5zdGFuY2VvZiBGaWxlSWNvblRoZW1lRGF0YSkge1xuXHRcdFx0XHRuZXdUaGVtZURhdGEgPSBpY29uVGhlbWVPcklkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFuZXdUaGVtZURhdGEpIHtcblx0XHRcdFx0bmV3VGhlbWVEYXRhID0gRmlsZUljb25UaGVtZURhdGEubm9JY29uVGhlbWU7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBuZXdUaGVtZURhdGEuZW5zdXJlTG9hZGVkKHRoaXMuZmlsZUljb25UaGVtZUxvYWRlcik7XG5cblx0XHRcdHRoaXMuYXBwbHlBbmRTZXRGaWxlSWNvblRoZW1lKG5ld1RoZW1lRGF0YSk7IC8vIHVwZGF0ZXMgdGhpcy5jdXJyZW50RmlsZUljb25UaGVtZVxuXHRcdH1cblxuXHRcdGNvbnN0IHRoZW1lRGF0YSA9IHRoaXMuY3VycmVudEZpbGVJY29uVGhlbWU7XG5cblx0XHQvLyByZW1lbWJlciB0aGVtZSBkYXRhIGZvciBhIHF1aWNrIHJlc3RvcmVcblx0XHRpZiAodGhlbWVEYXRhLmlzTG9hZGVkICYmIHNldHRpbmdzVGFyZ2V0ICE9PSAncHJldmlldycgJiYgKCF0aGVtZURhdGEubG9jYXRpb24gfHwgIWdldFJlbW90ZUF1dGhvcml0eSh0aGVtZURhdGEubG9jYXRpb24pKSkge1xuXHRcdFx0dGhlbWVEYXRhLnRvU3RvcmFnZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlKTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5zZXR0aW5ncy5zZXRGaWxlSWNvblRoZW1lKHRoaXMuY3VycmVudEZpbGVJY29uVGhlbWUsIHNldHRpbmdzVGFyZ2V0KTtcblxuXHRcdHJldHVybiB0aGVtZURhdGE7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0TWFya2V0cGxhY2VGaWxlSWNvblRoZW1lcyhwdWJsaXNoZXI6IHN0cmluZywgbmFtZTogc3RyaW5nLCB2ZXJzaW9uOiBzdHJpbmcpOiBQcm9taXNlPElXb3JrYmVuY2hGaWxlSWNvblRoZW1lW10+IHtcblx0XHRjb25zdCBleHRlbnNpb25Mb2NhdGlvbiA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLmdldEV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVVSTCh7IHB1Ymxpc2hlciwgbmFtZSwgdmVyc2lvbiB9LCAnZXh0ZW5zaW9uJyk7XG5cdFx0aWYgKGV4dGVuc2lvbkxvY2F0aW9uKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBtYW5pZmVzdENvbnRlbnQgPSBhd2FpdCB0aGlzLmV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZS5yZWFkRXh0ZW5zaW9uUmVzb3VyY2UocmVzb3VyY2VzLmpvaW5QYXRoKGV4dGVuc2lvbkxvY2F0aW9uLCAncGFja2FnZS5qc29uJykpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5maWxlSWNvblRoZW1lUmVnaXN0cnkuZ2V0TWFya2V0cGxhY2VUaGVtZXMoSlNPTi5wYXJzZShtYW5pZmVzdENvbnRlbnQpLCBleHRlbnNpb25Mb2NhdGlvbiwgRXh0ZW5zaW9uRGF0YS5mcm9tTmFtZShwdWJsaXNoZXIsIG5hbWUpKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdQcm9ibGVtIGxvYWRpbmcgdGhlbWVzIGZyb20gbWFya2V0cGxhY2UnLCBlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWxvYWRDdXJyZW50RmlsZUljb25UaGVtZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5maWxlSWNvblRoZW1lU2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuY3VycmVudEZpbGVJY29uVGhlbWUucmVsb2FkKHRoaXMuZmlsZUljb25UaGVtZUxvYWRlcik7XG5cdFx0XHR0aGlzLmFwcGx5QW5kU2V0RmlsZUljb25UaGVtZSh0aGlzLmN1cnJlbnRGaWxlSWNvblRoZW1lKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyByZXN0b3JlRmlsZUljb25UaGVtZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5maWxlSWNvblRoZW1lU2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNldHRpbmdJZCA9IHRoaXMuc2V0dGluZ3MuZmlsZUljb25UaGVtZTtcblx0XHRcdGNvbnN0IHRoZW1lID0gdGhpcy5maWxlSWNvblRoZW1lUmVnaXN0cnkuZmluZFRoZW1lQnlTZXR0aW5nc0lkKHNldHRpbmdJZCk7XG5cdFx0XHRpZiAodGhlbWUpIHtcblx0XHRcdFx0aWYgKHNldHRpbmdJZCAhPT0gdGhpcy5jdXJyZW50RmlsZUljb25UaGVtZS5zZXR0aW5nc0lkKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5pbnRlcm5hbFNldEZpbGVJY29uVGhlbWUodGhlbWUuaWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhlbWUgIT09IHRoaXMuY3VycmVudEZpbGVJY29uVGhlbWUpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGVtZS5lbnN1cmVMb2FkZWQodGhpcy5maWxlSWNvblRoZW1lTG9hZGVyKTtcblx0XHRcdFx0XHR0aGlzLmFwcGx5QW5kU2V0RmlsZUljb25UaGVtZSh0aGVtZSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5QW5kU2V0RmlsZUljb25UaGVtZShpY29uVGhlbWVEYXRhOiBGaWxlSWNvblRoZW1lRGF0YSwgc2lsZW50ID0gZmFsc2UpOiB2b2lkIHtcblx0XHR0aGlzLmN1cnJlbnRGaWxlSWNvblRoZW1lID0gaWNvblRoZW1lRGF0YTtcblxuXHRcdF9hcHBseVJ1bGVzKGljb25UaGVtZURhdGEuc3R5bGVTaGVldENvbnRlbnQhLCBmaWxlSWNvblRoZW1lUnVsZXNDbGFzc05hbWUpO1xuXG5cdFx0aWYgKGljb25UaGVtZURhdGEuaWQpIHtcblx0XHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoZmlsZUljb25zRW5hYmxlZENsYXNzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShmaWxlSWNvbnNFbmFibGVkQ2xhc3MpO1xuXHRcdH1cblxuXHRcdHRoaXMuZmlsZUljb25UaGVtZVdhdGNoZXIudXBkYXRlKGljb25UaGVtZURhdGEpO1xuXG5cdFx0aWYgKGljb25UaGVtZURhdGEuaWQpIHtcblx0XHRcdHRoaXMuc2VuZFRlbGVtZXRyeShpY29uVGhlbWVEYXRhLmlkLCBpY29uVGhlbWVEYXRhLmV4dGVuc2lvbkRhdGEsICdmaWxlSWNvbicpO1xuXHRcdH1cblxuXHRcdGlmICghc2lsZW50KSB7XG5cdFx0XHR0aGlzLm9uRmlsZUljb25UaGVtZUNoYW5nZS5maXJlKHRoaXMuY3VycmVudEZpbGVJY29uVGhlbWUpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRQcm9kdWN0SWNvblRoZW1lcygpOiBQcm9taXNlPElXb3JrYmVuY2hQcm9kdWN0SWNvblRoZW1lW10+IHtcblx0XHRyZXR1cm4gdGhpcy5wcm9kdWN0SWNvblRoZW1lUmVnaXN0cnkuZ2V0VGhlbWVzKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UHJvZHVjdEljb25UaGVtZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5jdXJyZW50UHJvZHVjdEljb25UaGVtZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRQcm9kdWN0SWNvblRoZW1lQ2hhbmdlKCk6IEV2ZW50PElXb3JrYmVuY2hQcm9kdWN0SWNvblRoZW1lPiB7XG5cdFx0cmV0dXJuIHRoaXMub25Qcm9kdWN0SWNvblRoZW1lQ2hhbmdlLmV2ZW50O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHNldFByb2R1Y3RJY29uVGhlbWUoaWNvblRoZW1lT3JJZDogc3RyaW5nIHwgdW5kZWZpbmVkIHwgSVdvcmtiZW5jaFByb2R1Y3RJY29uVGhlbWUsIHNldHRpbmdzVGFyZ2V0OiBUaGVtZVNldHRpbmdUYXJnZXQpOiBQcm9taXNlPElXb3JrYmVuY2hQcm9kdWN0SWNvblRoZW1lPiB7XG5cdFx0cmV0dXJuIHRoaXMucHJvZHVjdEljb25UaGVtZVNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnRlcm5hbFNldFByb2R1Y3RJY29uVGhlbWUoaWNvblRoZW1lT3JJZCwgc2V0dGluZ3NUYXJnZXQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbnRlcm5hbFNldFByb2R1Y3RJY29uVGhlbWUoaWNvblRoZW1lT3JJZDogc3RyaW5nIHwgdW5kZWZpbmVkIHwgSVdvcmtiZW5jaFByb2R1Y3RJY29uVGhlbWUsIHNldHRpbmdzVGFyZ2V0OiBUaGVtZVNldHRpbmdUYXJnZXQpOiBQcm9taXNlPElXb3JrYmVuY2hQcm9kdWN0SWNvblRoZW1lPiB7XG5cdFx0aWYgKGljb25UaGVtZU9ySWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWNvblRoZW1lT3JJZCA9ICcnO1xuXHRcdH1cblx0XHRjb25zdCB0aGVtZUlkID0gdHlwZXMuaXNTdHJpbmcoaWNvblRoZW1lT3JJZCkgPyBpY29uVGhlbWVPcklkIDogaWNvblRoZW1lT3JJZC5pZDtcblx0XHRpZiAodGhlbWVJZCAhPT0gdGhpcy5jdXJyZW50UHJvZHVjdEljb25UaGVtZS5pZCB8fCAhdGhpcy5jdXJyZW50UHJvZHVjdEljb25UaGVtZS5pc0xvYWRlZCkge1xuXHRcdFx0bGV0IG5ld1RoZW1lRGF0YSA9IHRoaXMucHJvZHVjdEljb25UaGVtZVJlZ2lzdHJ5LmZpbmRUaGVtZUJ5SWQodGhlbWVJZCk7XG5cdFx0XHRpZiAoIW5ld1RoZW1lRGF0YSAmJiBpY29uVGhlbWVPcklkIGluc3RhbmNlb2YgUHJvZHVjdEljb25UaGVtZURhdGEpIHtcblx0XHRcdFx0bmV3VGhlbWVEYXRhID0gaWNvblRoZW1lT3JJZDtcblx0XHRcdH1cblx0XHRcdGlmICghbmV3VGhlbWVEYXRhKSB7XG5cdFx0XHRcdG5ld1RoZW1lRGF0YSA9IFByb2R1Y3RJY29uVGhlbWVEYXRhLmRlZmF1bHRUaGVtZTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IG5ld1RoZW1lRGF0YS5lbnN1cmVMb2FkZWQodGhpcy5leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UsIHRoaXMubG9nU2VydmljZSk7XG5cblx0XHRcdHRoaXMuYXBwbHlBbmRTZXRQcm9kdWN0SWNvblRoZW1lKG5ld1RoZW1lRGF0YSk7IC8vIHVwZGF0ZXMgdGhpcy5jdXJyZW50UHJvZHVjdEljb25UaGVtZVxuXHRcdH1cblx0XHRjb25zdCB0aGVtZURhdGEgPSB0aGlzLmN1cnJlbnRQcm9kdWN0SWNvblRoZW1lO1xuXG5cdFx0Ly8gcmVtZW1iZXIgdGhlbWUgZGF0YSBmb3IgYSBxdWljayByZXN0b3JlXG5cdFx0aWYgKHRoZW1lRGF0YS5pc0xvYWRlZCAmJiBzZXR0aW5nc1RhcmdldCAhPT0gJ3ByZXZpZXcnICYmICghdGhlbWVEYXRhLmxvY2F0aW9uIHx8ICFnZXRSZW1vdGVBdXRob3JpdHkodGhlbWVEYXRhLmxvY2F0aW9uKSkpIHtcblx0XHRcdHRoZW1lRGF0YS50b1N0b3JhZ2UodGhpcy5zdG9yYWdlU2VydmljZSk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuc2V0dGluZ3Muc2V0UHJvZHVjdEljb25UaGVtZSh0aGlzLmN1cnJlbnRQcm9kdWN0SWNvblRoZW1lLCBzZXR0aW5nc1RhcmdldCk7XG5cblx0XHRyZXR1cm4gdGhlbWVEYXRhO1xuXG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0TWFya2V0cGxhY2VQcm9kdWN0SWNvblRoZW1lcyhwdWJsaXNoZXI6IHN0cmluZywgbmFtZTogc3RyaW5nLCB2ZXJzaW9uOiBzdHJpbmcpOiBQcm9taXNlPElXb3JrYmVuY2hQcm9kdWN0SWNvblRoZW1lW10+IHtcblx0XHRjb25zdCBleHRlbnNpb25Mb2NhdGlvbiA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLmdldEV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVVSTCh7IHB1Ymxpc2hlciwgbmFtZSwgdmVyc2lvbiB9LCAnZXh0ZW5zaW9uJyk7XG5cdFx0aWYgKGV4dGVuc2lvbkxvY2F0aW9uKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBtYW5pZmVzdENvbnRlbnQgPSBhd2FpdCB0aGlzLmV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZS5yZWFkRXh0ZW5zaW9uUmVzb3VyY2UocmVzb3VyY2VzLmpvaW5QYXRoKGV4dGVuc2lvbkxvY2F0aW9uLCAncGFja2FnZS5qc29uJykpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5wcm9kdWN0SWNvblRoZW1lUmVnaXN0cnkuZ2V0TWFya2V0cGxhY2VUaGVtZXMoSlNPTi5wYXJzZShtYW5pZmVzdENvbnRlbnQpLCBleHRlbnNpb25Mb2NhdGlvbiwgRXh0ZW5zaW9uRGF0YS5mcm9tTmFtZShwdWJsaXNoZXIsIG5hbWUpKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdQcm9ibGVtIGxvYWRpbmcgdGhlbWVzIGZyb20gbWFya2V0cGxhY2UnLCBlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWxvYWRDdXJyZW50UHJvZHVjdEljb25UaGVtZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5wcm9kdWN0SWNvblRoZW1lU2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuY3VycmVudFByb2R1Y3RJY29uVGhlbWUucmVsb2FkKHRoaXMuZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0dGhpcy5hcHBseUFuZFNldFByb2R1Y3RJY29uVGhlbWUodGhpcy5jdXJyZW50UHJvZHVjdEljb25UaGVtZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVzdG9yZVByb2R1Y3RJY29uVGhlbWUoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMucHJvZHVjdEljb25UaGVtZVNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXR0aW5nSWQgPSB0aGlzLnNldHRpbmdzLnByb2R1Y3RJY29uVGhlbWU7XG5cdFx0XHRjb25zdCB0aGVtZSA9IHRoaXMucHJvZHVjdEljb25UaGVtZVJlZ2lzdHJ5LmZpbmRUaGVtZUJ5U2V0dGluZ3NJZChzZXR0aW5nSWQpO1xuXHRcdFx0aWYgKHRoZW1lKSB7XG5cdFx0XHRcdGlmIChzZXR0aW5nSWQgIT09IHRoaXMuY3VycmVudFByb2R1Y3RJY29uVGhlbWUuc2V0dGluZ3NJZCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuaW50ZXJuYWxTZXRQcm9kdWN0SWNvblRoZW1lKHRoZW1lLmlkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoZW1lICE9PSB0aGlzLmN1cnJlbnRQcm9kdWN0SWNvblRoZW1lKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhlbWUuZW5zdXJlTG9hZGVkKHRoaXMuZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0XHRcdHRoaXMuYXBwbHlBbmRTZXRQcm9kdWN0SWNvblRoZW1lKHRoZW1lLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlBbmRTZXRQcm9kdWN0SWNvblRoZW1lKGljb25UaGVtZURhdGE6IFByb2R1Y3RJY29uVGhlbWVEYXRhLCBzaWxlbnQgPSBmYWxzZSk6IHZvaWQge1xuXG5cdFx0dGhpcy5jdXJyZW50UHJvZHVjdEljb25UaGVtZSA9IGljb25UaGVtZURhdGE7XG5cblx0XHRfYXBwbHlSdWxlcyhpY29uVGhlbWVEYXRhLnN0eWxlU2hlZXRDb250ZW50ISwgcHJvZHVjdEljb25UaGVtZVJ1bGVzQ2xhc3NOYW1lKTtcblxuXHRcdHRoaXMucHJvZHVjdEljb25UaGVtZVdhdGNoZXIudXBkYXRlKGljb25UaGVtZURhdGEpO1xuXG5cdFx0aWYgKGljb25UaGVtZURhdGEuaWQpIHtcblx0XHRcdHRoaXMuc2VuZFRlbGVtZXRyeShpY29uVGhlbWVEYXRhLmlkLCBpY29uVGhlbWVEYXRhLmV4dGVuc2lvbkRhdGEsICdwcm9kdWN0SWNvbicpO1xuXHRcdH1cblx0XHRpZiAoIXNpbGVudCkge1xuXHRcdFx0dGhpcy5vblByb2R1Y3RJY29uVGhlbWVDaGFuZ2UuZmlyZSh0aGlzLmN1cnJlbnRQcm9kdWN0SWNvblRoZW1lKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgVGhlbWVGaWxlV2F0Y2hlciB7XG5cblx0cHJpdmF0ZSB3YXRjaGVkTG9jYXRpb246IFVSSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSB3YXRjaGVyRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9uVXBkYXRlOiAoKSA9PiB2b2lkXG5cdCkgeyB9XG5cblx0dXBkYXRlKHRoZW1lOiB7IGxvY2F0aW9uPzogVVJJOyB3YXRjaD86IGJvb2xlYW4gfSkge1xuXHRcdGlmICghcmVzb3VyY2VzLmlzRXF1YWwodGhlbWUubG9jYXRpb24sIHRoaXMud2F0Y2hlZExvY2F0aW9uKSkge1xuXHRcdFx0dGhpcy53YXRjaGVkTG9jYXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLndhdGNoZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0XHRpZiAodGhlbWUubG9jYXRpb24gJiYgKHRoZW1lLndhdGNoIHx8IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQpKSB7XG5cdFx0XHRcdHRoaXMud2F0Y2hlZExvY2F0aW9uID0gdGhlbWUubG9jYXRpb247XG5cdFx0XHRcdHRoaXMud2F0Y2hlckRpc3Bvc2FibGVzLmFkZCh0aGlzLmZpbGVTZXJ2aWNlLndhdGNoKHRoZW1lLmxvY2F0aW9uKSk7XG5cdFx0XHRcdHRoaXMud2F0Y2hlckRpc3Bvc2FibGVzLmFkZCh0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMud2F0Y2hlZExvY2F0aW9uICYmIGUuY29udGFpbnModGhpcy53YXRjaGVkTG9jYXRpb24sIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm9uVXBkYXRlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLndhdGNoZXJEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy53YXRjaGVkTG9jYXRpb24gPSB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gX2FwcGx5UnVsZXMoc3R5bGVTaGVldENvbnRlbnQ6IHN0cmluZywgcnVsZXNDbGFzc05hbWU6IHN0cmluZykge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0Y29uc3QgdGhlbWVTdHlsZXMgPSBtYWluV2luZG93LmRvY3VtZW50LmhlYWQuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZShydWxlc0NsYXNzTmFtZSk7XG5cdGlmICh0aGVtZVN0eWxlcy5sZW5ndGggPT09IDApIHtcblx0XHRjb25zdCBlbFN0eWxlID0gY3JlYXRlU3R5bGVTaGVldCgpO1xuXHRcdGVsU3R5bGUuY2xhc3NOYW1lID0gcnVsZXNDbGFzc05hbWU7XG5cdFx0ZWxTdHlsZS50ZXh0Q29udGVudCA9IHN0eWxlU2hlZXRDb250ZW50O1xuXHR9IGVsc2Uge1xuXHRcdCg8SFRNTFN0eWxlRWxlbWVudD50aGVtZVN0eWxlc1swXSkudGV4dENvbnRlbnQgPSBzdHlsZVNoZWV0Q29udGVudDtcblx0fVxufVxuXG5yZWdpc3RlckNvbG9yVGhlbWVTY2hlbWFzKCk7XG5yZWdpc3RlckZpbGVJY29uVGhlbWVTY2hlbWFzKCk7XG5yZWdpc3RlclByb2R1Y3RJY29uVGhlbWVTY2hlbWFzKCk7XG5cbi8vIFRoZSBXb3JrYmVuY2hUaGVtZVNlcnZpY2Ugc2hvdWxkIHN0YXkgZWFnZXIgYXMgdGhlIGNvbnN0cnVjdG9yIHJlc3RvcmVzIHRoZVxuLy8gbGFzdCB1c2VkIGNvbG9ycyAvIGljb25zIGZyb20gc3RvcmFnZS4gVGhpcyBuZWVkcyB0byBoYXBwZW4gYXMgcXVpY2tseSBhcyBwb3NzaWJsZVxuLy8gZm9yIGEgZmxpY2tlci1mcmVlIHN0YXJ0dXAgZXhwZXJpZW5jZS5cbnJlZ2lzdGVyU2luZ2xldG9uKElXb3JrYmVuY2hUaGVtZVNlcnZpY2UsIFdvcmtiZW5jaFRoZW1lU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIs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
