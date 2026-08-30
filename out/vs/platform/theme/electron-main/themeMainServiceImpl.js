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
import electron from "electron";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { isLinux, isMacintosh, isWindows } from "../../../base/common/platform.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IStateService } from "../../state/node/state.js";
import { ThemeTypeSelector } from "../common/theme.js";
import { coalesce } from "../../../base/common/arrays.js";
import { getAllWindowsExcludingOffscreen } from "../../windows/electron-main/windows.js";
import { ILogService, LogLevel } from "../../log/common/log.js";
const DEFAULT_BG_LIGHT = "#FFFFFF";
const DEFAULT_BG_DARK = "#1F1F1F";
const DEFAULT_BG_HC_BLACK = "#000000";
const DEFAULT_BG_HC_LIGHT = "#FFFFFF";
const THEME_STORAGE_KEY = "theme";
const THEME_BG_STORAGE_KEY = "themeBackground";
const THEME_WINDOW_SPLASH_KEY = "windowSplash";
const THEME_WINDOW_SPLASH_OVERRIDE_KEY = "windowSplashWorkspaceOverride";
class Setting {
  constructor(key, defaultValue) {
    this.key = key;
    this.defaultValue = defaultValue;
  }
  getValue(configurationService) {
    return configurationService.getValue(this.key) ?? this.defaultValue;
  }
}
((Setting2) => {
  Setting2.DETECT_COLOR_SCHEME = new Setting2("window.autoDetectColorScheme", false);
  Setting2.DETECT_HC = new Setting2("window.autoDetectHighContrast", true);
  Setting2.SYSTEM_COLOR_THEME = new Setting2("window.systemColorTheme", "default");
  Setting2.AUXILIARYBAR_DEFAULT_VISIBILITY = new Setting2("workbench.secondarySideBar.defaultVisibility", "visibleInWorkspace");
  Setting2.STARTUP_EDITOR = new Setting2("workbench.startupEditor", "welcomePage");
})(Setting || (Setting = {}));
let ThemeMainService = class extends Disposable {
  constructor(stateService, configurationService, logService) {
    super();
    this.stateService = stateService;
    this.configurationService = configurationService;
    this.logService = logService;
    this._onDidChangeColorScheme = this._register(new Emitter());
    this.onDidChangeColorScheme = this._onDidChangeColorScheme.event;
    if (!isLinux) {
      this._register(this.configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(Setting.SYSTEM_COLOR_THEME.key) || e.affectsConfiguration(Setting.DETECT_COLOR_SCHEME.key)) {
          this.updateSystemColorTheme();
          this.logThemeSettings();
        }
      }));
    }
    this.updateSystemColorTheme();
    this.logThemeSettings();
    this._register(Event.fromNodeEventEmitter(electron.nativeTheme, "updated")(() => {
      this.logThemeSettings();
      this._onDidChangeColorScheme.fire(this.getColorScheme());
    }));
  }
  logThemeSettings() {
    if (this.logService.getLevel() >= LogLevel.Debug) {
      const logSetting = (setting) => `${setting.key}=${setting.getValue(this.configurationService)}`;
      this.logService.debug(`[theme main service] ${logSetting(Setting.DETECT_COLOR_SCHEME)}, ${logSetting(Setting.DETECT_HC)}, ${logSetting(Setting.SYSTEM_COLOR_THEME)}`);
      const logProperty = (property) => `${String(property)}=${electron.nativeTheme[property]}`;
      this.logService.debug(`[theme main service] electron.nativeTheme: ${logProperty("themeSource")}, ${logProperty("shouldUseDarkColors")}, ${logProperty("shouldUseHighContrastColors")}, ${logProperty("shouldUseInvertedColorScheme")}, ${logProperty("shouldUseDarkColorsForSystemIntegratedUI")}	`);
      this.logService.debug(`[theme main service] New color scheme: ${JSON.stringify(this.getColorScheme())}`);
    }
  }
  updateSystemColorTheme() {
    if (isLinux || this.isAutoDetectColorScheme()) {
      electron.nativeTheme.themeSource = "system";
    } else {
      switch (Setting.SYSTEM_COLOR_THEME.getValue(this.configurationService)) {
        case "dark":
          electron.nativeTheme.themeSource = "dark";
          break;
        case "light":
          electron.nativeTheme.themeSource = "light";
          break;
        case "auto":
          switch (this.getPreferredBaseTheme() ?? this.getStoredBaseTheme()) {
            case ThemeTypeSelector.VS:
              electron.nativeTheme.themeSource = "light";
              break;
            case ThemeTypeSelector.VS_DARK:
              electron.nativeTheme.themeSource = "dark";
              break;
            default:
              electron.nativeTheme.themeSource = "system";
          }
          break;
        default:
          electron.nativeTheme.themeSource = "system";
          break;
      }
    }
  }
  getColorScheme() {
    if (isWindows) {
      if (electron.nativeTheme.shouldUseHighContrastColors) {
        return { dark: electron.nativeTheme.shouldUseInvertedColorScheme, highContrast: true };
      }
    } else if (isMacintosh) {
      if (electron.nativeTheme.shouldUseInvertedColorScheme || electron.nativeTheme.shouldUseHighContrastColors) {
        return { dark: electron.nativeTheme.shouldUseDarkColors, highContrast: true };
      }
    } else if (isLinux) {
      if (electron.nativeTheme.shouldUseHighContrastColors) {
        return { dark: true, highContrast: true };
      }
    }
    return {
      dark: electron.nativeTheme.shouldUseDarkColors,
      highContrast: false
    };
  }
  getPreferredBaseTheme() {
    const colorScheme = this.getColorScheme();
    if (Setting.DETECT_HC.getValue(this.configurationService) && colorScheme.highContrast) {
      return colorScheme.dark ? ThemeTypeSelector.HC_BLACK : ThemeTypeSelector.HC_LIGHT;
    }
    if (this.isAutoDetectColorScheme()) {
      return colorScheme.dark ? ThemeTypeSelector.VS_DARK : ThemeTypeSelector.VS;
    }
    return void 0;
  }
  isAutoDetectColorScheme() {
    if (Setting.DETECT_COLOR_SCHEME.getValue(this.configurationService)) {
      return true;
    }
    return false;
  }
  getBackgroundColor() {
    const preferred = this.getPreferredBaseTheme();
    const stored = this.getStoredBaseTheme();
    if (preferred === void 0 || preferred === stored) {
      const storedBackground = this.stateService.getItem(THEME_BG_STORAGE_KEY, null);
      if (storedBackground) {
        return storedBackground;
      }
    }
    switch (preferred ?? stored) {
      case ThemeTypeSelector.VS:
        return DEFAULT_BG_LIGHT;
      case ThemeTypeSelector.HC_BLACK:
        return DEFAULT_BG_HC_BLACK;
      case ThemeTypeSelector.HC_LIGHT:
        return DEFAULT_BG_HC_LIGHT;
      default:
        return DEFAULT_BG_DARK;
    }
  }
  getStoredBaseTheme() {
    const baseTheme = this.stateService.getItem(THEME_STORAGE_KEY, ThemeTypeSelector.VS_DARK).split(" ")[0];
    switch (baseTheme) {
      case ThemeTypeSelector.VS:
        return ThemeTypeSelector.VS;
      case ThemeTypeSelector.HC_BLACK:
        return ThemeTypeSelector.HC_BLACK;
      case ThemeTypeSelector.HC_LIGHT:
        return ThemeTypeSelector.HC_LIGHT;
      default:
        return ThemeTypeSelector.VS_DARK;
    }
  }
  saveWindowSplash(windowId, workspace, splash) {
    const splashOverride = this.updateWindowSplashOverride(workspace, splash);
    this.stateService.setItems(coalesce([
      { key: THEME_STORAGE_KEY, data: splash.baseTheme },
      { key: THEME_BG_STORAGE_KEY, data: splash.colorInfo.background },
      { key: THEME_WINDOW_SPLASH_KEY, data: splash },
      splashOverride ? { key: THEME_WINDOW_SPLASH_OVERRIDE_KEY, data: splashOverride } : void 0
    ]));
    if (typeof windowId === "number") {
      this.updateBackgroundColor(windowId, splash);
    }
    this.updateSystemColorTheme();
  }
  updateWindowSplashOverride(workspace, splash) {
    let splashOverride = void 0;
    let changed = false;
    if (workspace) {
      splashOverride = { ...this.getWindowSplashOverride() };
      changed = this.doUpdateWindowSplashOverride(workspace, splash, splashOverride, "sideBar");
      changed = this.doUpdateWindowSplashOverride(workspace, splash, splashOverride, "auxiliaryBar") || changed;
    }
    return changed ? splashOverride : void 0;
  }
  doUpdateWindowSplashOverride(workspace, splash, splashOverride, part) {
    const currentWidth = part === "sideBar" ? splash.layoutInfo?.sideBarWidth : splash.layoutInfo?.auxiliaryBarWidth;
    const overrideWidth = part === "sideBar" ? splashOverride.layoutInfo.sideBarWidth : splashOverride.layoutInfo.auxiliaryBarWidth;
    let changed = false;
    if (typeof currentWidth !== "number") {
      if (splashOverride.layoutInfo.workspaces[workspace.id]) {
        delete splashOverride.layoutInfo.workspaces[workspace.id];
        changed = true;
      }
      return changed;
    }
    let workspaceOverride = splashOverride.layoutInfo.workspaces[workspace.id];
    if (!workspaceOverride) {
      const workspaceEntries = Object.keys(splashOverride.layoutInfo.workspaces);
      if (workspaceEntries.length >= ThemeMainService.WORKSPACE_OVERRIDE_LIMIT) {
        delete splashOverride.layoutInfo.workspaces[workspaceEntries[0]];
        changed = true;
      }
      workspaceOverride = { sideBarVisible: false, auxiliaryBarVisible: false };
      splashOverride.layoutInfo.workspaces[workspace.id] = workspaceOverride;
      changed = true;
    }
    if (currentWidth > 0) {
      if (overrideWidth !== currentWidth) {
        splashOverride.layoutInfo[part === "sideBar" ? "sideBarWidth" : "auxiliaryBarWidth"] = currentWidth;
        changed = true;
      }
      switch (part) {
        case "sideBar":
          if (!workspaceOverride.sideBarVisible) {
            workspaceOverride.sideBarVisible = true;
            changed = true;
          }
          break;
        case "auxiliaryBar":
          if (!workspaceOverride.auxiliaryBarVisible) {
            workspaceOverride.auxiliaryBarVisible = true;
            changed = true;
          }
          break;
      }
    } else {
      switch (part) {
        case "sideBar":
          if (workspaceOverride.sideBarVisible) {
            workspaceOverride.sideBarVisible = false;
            changed = true;
          }
          break;
        case "auxiliaryBar":
          if (workspaceOverride.auxiliaryBarVisible) {
            workspaceOverride.auxiliaryBarVisible = false;
            changed = true;
          }
          break;
      }
    }
    return changed;
  }
  updateBackgroundColor(windowId, splash) {
    for (const window of getAllWindowsExcludingOffscreen()) {
      if (window.id === windowId) {
        window.setBackgroundColor(splash.colorInfo.background);
        break;
      }
    }
  }
  getWindowSplash(workspace) {
    try {
      return this.doGetWindowSplash(workspace);
    } catch (error) {
      this.logService.error("[theme main service] Failed to get window splash", error);
      return void 0;
    }
  }
  doGetWindowSplash(workspace) {
    const partSplash = this.stateService.getItem(THEME_WINDOW_SPLASH_KEY);
    if (!partSplash?.layoutInfo) {
      return partSplash;
    }
    const override = this.getWindowSplashOverride();
    let sideBarWidth;
    if (workspace) {
      if (override.layoutInfo.workspaces[workspace.id]?.sideBarVisible === false) {
        sideBarWidth = 0;
      } else {
        sideBarWidth = override.layoutInfo.sideBarWidth || partSplash.layoutInfo.sideBarWidth || ThemeMainService.DEFAULT_BAR_WIDTH;
      }
    } else {
      sideBarWidth = 0;
    }
    const auxiliaryBarDefaultVisibility = Setting.AUXILIARYBAR_DEFAULT_VISIBILITY.getValue(this.configurationService);
    const startupEditor = Setting.STARTUP_EDITOR.getValue(this.configurationService);
    let auxiliaryBarWidth;
    if (workspace) {
      const auxiliaryBarVisible = override.layoutInfo.workspaces[workspace.id]?.auxiliaryBarVisible;
      if (auxiliaryBarVisible === true) {
        auxiliaryBarWidth = override.layoutInfo.auxiliaryBarWidth || partSplash.layoutInfo.auxiliaryBarWidth || ThemeMainService.DEFAULT_BAR_WIDTH;
      } else if (auxiliaryBarVisible === false) {
        auxiliaryBarWidth = 0;
      } else {
        if (startupEditor !== "agentSessionsWelcomePage" && (auxiliaryBarDefaultVisibility === "visible" || auxiliaryBarDefaultVisibility === "visibleInWorkspace")) {
          auxiliaryBarWidth = override.layoutInfo.auxiliaryBarWidth || partSplash.layoutInfo.auxiliaryBarWidth || ThemeMainService.DEFAULT_BAR_WIDTH;
        } else if (startupEditor !== "agentSessionsWelcomePage" && (auxiliaryBarDefaultVisibility === "maximized" || auxiliaryBarDefaultVisibility === "maximizedInWorkspace")) {
          auxiliaryBarWidth = Number.MAX_SAFE_INTEGER;
        } else {
          auxiliaryBarWidth = 0;
        }
      }
    } else {
      auxiliaryBarWidth = 0;
    }
    const partBounds = sideBarWidth === partSplash.layoutInfo.sideBarWidth && auxiliaryBarWidth === partSplash.layoutInfo.auxiliaryBarWidth ? partSplash.layoutInfo.partBounds : void 0;
    return {
      ...partSplash,
      layoutInfo: {
        ...partSplash.layoutInfo,
        sideBarWidth,
        auxiliaryBarWidth,
        partBounds
      }
    };
  }
  getWindowSplashOverride() {
    let override = this.stateService.getItem(THEME_WINDOW_SPLASH_OVERRIDE_KEY);
    if (!override?.layoutInfo) {
      override = {
        layoutInfo: {
          sideBarWidth: ThemeMainService.DEFAULT_BAR_WIDTH,
          auxiliaryBarWidth: ThemeMainService.DEFAULT_BAR_WIDTH,
          workspaces: {}
        }
      };
    }
    if (!override.layoutInfo.sideBarWidth) {
      override.layoutInfo.sideBarWidth = ThemeMainService.DEFAULT_BAR_WIDTH;
    }
    if (!override.layoutInfo.auxiliaryBarWidth) {
      override.layoutInfo.auxiliaryBarWidth = ThemeMainService.DEFAULT_BAR_WIDTH;
    }
    if (!override.layoutInfo.workspaces) {
      override.layoutInfo.workspaces = {};
    }
    return override;
  }
};
ThemeMainService.DEFAULT_BAR_WIDTH = 300;
ThemeMainService.WORKSPACE_OVERRIDE_LIMIT = 50;
ThemeMainService = __decorateClass([
  __decorateParam(0, IStateService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ILogService)
], ThemeMainService);
export {
  ThemeMainService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGhlbWVcXGVsZWN0cm9uLW1haW5cXHRoZW1lTWFpblNlcnZpY2VJbXBsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGVsZWN0cm9uIGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0xpbnV4LCBpc01hY2ludG9zaCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc3RhdGUvbm9kZS9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBJUGFydHNTcGxhc2ggfSBmcm9tICcuLi9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb2xvclNjaGVtZSB9IGZyb20gJy4uLy4uL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IFRoZW1lVHlwZVNlbGVjdG9yIH0gZnJvbSAnLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyLCBJV29ya3NwYWNlSWRlbnRpZmllciB9IGZyb20gJy4uLy4uL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGdldEFsbFdpbmRvd3NFeGNsdWRpbmdPZmZzY3JlZW4gfSBmcm9tICcuLi8uLi93aW5kb3dzL2VsZWN0cm9uLW1haW4vd2luZG93cy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVNYWluU2VydmljZSB9IGZyb20gJy4vdGhlbWVNYWluU2VydmljZS5qcyc7XG5cbi8vIFRoZXNlIGRlZmF1bHQgY29sb3JzIG1hdGNoIG91ciBkZWZhdWx0IHRoZW1lc1xuLy8gZWRpdG9yIGJhY2tncm91bmQgY29sb3IgKFwiRGFyayBNb2Rlcm5cIiwgZXRjLi4uKVxuY29uc3QgREVGQVVMVF9CR19MSUdIVCA9ICcjRkZGRkZGJztcbmNvbnN0IERFRkFVTFRfQkdfREFSSyA9ICcjMUYxRjFGJztcbmNvbnN0IERFRkFVTFRfQkdfSENfQkxBQ0sgPSAnIzAwMDAwMCc7XG5jb25zdCBERUZBVUxUX0JHX0hDX0xJR0hUID0gJyNGRkZGRkYnO1xuXG5jb25zdCBUSEVNRV9TVE9SQUdFX0tFWSA9ICd0aGVtZSc7XG5jb25zdCBUSEVNRV9CR19TVE9SQUdFX0tFWSA9ICd0aGVtZUJhY2tncm91bmQnO1xuXG5jb25zdCBUSEVNRV9XSU5ET1dfU1BMQVNIX0tFWSA9ICd3aW5kb3dTcGxhc2gnO1xuY29uc3QgVEhFTUVfV0lORE9XX1NQTEFTSF9PVkVSUklERV9LRVkgPSAnd2luZG93U3BsYXNoV29ya3NwYWNlT3ZlcnJpZGUnO1xuXG5jbGFzcyBTZXR0aW5nPFQ+IHtcblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IGtleTogc3RyaW5nLCBwdWJsaWMgcmVhZG9ubHkgZGVmYXVsdFZhbHVlOiBUKSB7XG5cdH1cblx0Z2V0VmFsdWUoY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IFQge1xuXHRcdHJldHVybiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxUPih0aGlzLmtleSkgPz8gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdH1cbn1cblxuLy8gaW4gdGhlIG1haW4gcHJvY2VzcywgZGVmYXVsdHMgYXJlIG5vdCBrbm93biB0byB0aGUgY29uZmlndXJhdGlvbiBzZXJ2aWNlLCBzbyB3ZSBuZWVkIHRvIGRlZmluZSB0aGVtIGhlcmVcbm5hbWVzcGFjZSBTZXR0aW5nIHtcblx0ZXhwb3J0IGNvbnN0IERFVEVDVF9DT0xPUl9TQ0hFTUUgPSBuZXcgU2V0dGluZzxib29sZWFuPignd2luZG93LmF1dG9EZXRlY3RDb2xvclNjaGVtZScsIGZhbHNlKTtcblx0ZXhwb3J0IGNvbnN0IERFVEVDVF9IQyA9IG5ldyBTZXR0aW5nPGJvb2xlYW4+KCd3aW5kb3cuYXV0b0RldGVjdEhpZ2hDb250cmFzdCcsIHRydWUpO1xuXHRleHBvcnQgY29uc3QgU1lTVEVNX0NPTE9SX1RIRU1FID0gbmV3IFNldHRpbmc8J2RlZmF1bHQnIHwgJ2F1dG8nIHwgJ2xpZ2h0JyB8ICdkYXJrJz4oJ3dpbmRvdy5zeXN0ZW1Db2xvclRoZW1lJywgJ2RlZmF1bHQnKTtcblx0ZXhwb3J0IGNvbnN0IEFVWElMSUFSWUJBUl9ERUZBVUxUX1ZJU0lCSUxJVFkgPSBuZXcgU2V0dGluZzwnaGlkZGVuJyB8ICd2aXNpYmxlSW5Xb3Jrc3BhY2UnIHwgJ3Zpc2libGUnIHwgJ21heGltaXplZEluV29ya3NwYWNlJyB8ICdtYXhpbWl6ZWQnPignd29ya2JlbmNoLnNlY29uZGFyeVNpZGVCYXIuZGVmYXVsdFZpc2liaWxpdHknLCAndmlzaWJsZUluV29ya3NwYWNlJyk7XG5cdGV4cG9ydCBjb25zdCBTVEFSVFVQX0VESVRPUiA9IG5ldyBTZXR0aW5nPCdub25lJyB8ICd3ZWxjb21lUGFnZScgfCAncmVhZG1lJyB8ICduZXdVbnRpdGxlZEZpbGUnIHwgJ3dlbGNvbWVQYWdlSW5FbXB0eVdvcmtiZW5jaCcgfCAndGVybWluYWwnIHwgJ2FnZW50U2Vzc2lvbnNXZWxjb21lUGFnZSc+KCd3b3JrYmVuY2guc3RhcnR1cEVkaXRvcicsICd3ZWxjb21lUGFnZScpO1xufVxuXG5pbnRlcmZhY2UgSVBhcnRTcGxhc2hPdmVycmlkZVdvcmtzcGFjZXMge1xuXHRbd29ya3NwYWNlSWQ6IHN0cmluZ106IHtcblx0XHRzaWRlQmFyVmlzaWJsZTogYm9vbGVhbjtcblx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBib29sZWFuO1xuXHR9O1xufVxuXG5pbnRlcmZhY2UgSVBhcnRzU3BsYXNoT3ZlcnJpZGUge1xuXHRsYXlvdXRJbmZvOiB7XG5cdFx0c2lkZUJhcldpZHRoOiBudW1iZXI7XG5cdFx0YXV4aWxpYXJ5QmFyV2lkdGg6IG51bWJlcjtcblxuXHRcdHdvcmtzcGFjZXM6IElQYXJ0U3BsYXNoT3ZlcnJpZGVXb3Jrc3BhY2VzO1xuXHR9O1xufVxuXG5leHBvcnQgY2xhc3MgVGhlbWVNYWluU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGhlbWVNYWluU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgREVGQVVMVF9CQVJfV0lEVEggPSAzMDA7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgV09SS1NQQUNFX09WRVJSSURFX0xJTUlUID0gNTA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb2xvclNjaGVtZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDb2xvclNjaGVtZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29sb3JTY2hlbWUgPSB0aGlzLl9vbkRpZENoYW5nZUNvbG9yU2NoZW1lLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3RhdGVTZXJ2aWNlIHByaXZhdGUgc3RhdGVTZXJ2aWNlOiBJU3RhdGVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBTeXN0ZW0gVGhlbWVcblx0XHRpZiAoIWlzTGludXgpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihTZXR0aW5nLlNZU1RFTV9DT0xPUl9USEVNRS5rZXkpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oU2V0dGluZy5ERVRFQ1RfQ09MT1JfU0NIRU1FLmtleSkpIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVN5c3RlbUNvbG9yVGhlbWUoKTtcblx0XHRcdFx0XHR0aGlzLmxvZ1RoZW1lU2V0dGluZ3MoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZVN5c3RlbUNvbG9yVGhlbWUoKTtcblx0XHR0aGlzLmxvZ1RoZW1lU2V0dGluZ3MoKTtcblxuXHRcdC8vIENvbG9yIFNjaGVtZSBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXIoZWxlY3Ryb24ubmF0aXZlVGhlbWUsICd1cGRhdGVkJykoKCkgPT4ge1xuXHRcdFx0dGhpcy5sb2dUaGVtZVNldHRpbmdzKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbG9yU2NoZW1lLmZpcmUodGhpcy5nZXRDb2xvclNjaGVtZSgpKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGxvZ1RoZW1lU2V0dGluZ3MoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubG9nU2VydmljZS5nZXRMZXZlbCgpID49IExvZ0xldmVsLkRlYnVnKSB7XG5cdFx0XHRjb25zdCBsb2dTZXR0aW5nID0gKHNldHRpbmc6IFNldHRpbmc8c3RyaW5nIHwgYm9vbGVhbj4pID0+IGAke3NldHRpbmcua2V5fT0ke3NldHRpbmcuZ2V0VmFsdWUodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSl9YDtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW3RoZW1lIG1haW4gc2VydmljZV0gJHtsb2dTZXR0aW5nKFNldHRpbmcuREVURUNUX0NPTE9SX1NDSEVNRSl9LCAke2xvZ1NldHRpbmcoU2V0dGluZy5ERVRFQ1RfSEMpfSwgJHtsb2dTZXR0aW5nKFNldHRpbmcuU1lTVEVNX0NPTE9SX1RIRU1FKX1gKTtcblxuXHRcdFx0Y29uc3QgbG9nUHJvcGVydHkgPSAocHJvcGVydHk6IGtleW9mIEVsZWN0cm9uLk5hdGl2ZVRoZW1lKSA9PiBgJHtTdHJpbmcocHJvcGVydHkpfT0ke2VsZWN0cm9uLm5hdGl2ZVRoZW1lW3Byb3BlcnR5XX1gO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBbdGhlbWUgbWFpbiBzZXJ2aWNlXSBlbGVjdHJvbi5uYXRpdmVUaGVtZTogJHtsb2dQcm9wZXJ0eSgndGhlbWVTb3VyY2UnKX0sICR7bG9nUHJvcGVydHkoJ3Nob3VsZFVzZURhcmtDb2xvcnMnKX0sICR7bG9nUHJvcGVydHkoJ3Nob3VsZFVzZUhpZ2hDb250cmFzdENvbG9ycycpfSwgJHtsb2dQcm9wZXJ0eSgnc2hvdWxkVXNlSW52ZXJ0ZWRDb2xvclNjaGVtZScpfSwgJHtsb2dQcm9wZXJ0eSgnc2hvdWxkVXNlRGFya0NvbG9yc0ZvclN5c3RlbUludGVncmF0ZWRVSScpfVx0YCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFt0aGVtZSBtYWluIHNlcnZpY2VdIE5ldyBjb2xvciBzY2hlbWU6ICR7SlNPTi5zdHJpbmdpZnkodGhpcy5nZXRDb2xvclNjaGVtZSgpKX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN5c3RlbUNvbG9yVGhlbWUoKTogdm9pZCB7XG5cdFx0aWYgKGlzTGludXggfHwgdGhpcy5pc0F1dG9EZXRlY3RDb2xvclNjaGVtZSgpKSB7XG5cdFx0XHRlbGVjdHJvbi5uYXRpdmVUaGVtZS50aGVtZVNvdXJjZSA9ICdzeXN0ZW0nOyAvLyBvbmx5IHdpdGggYHN5c3RlbWAgd2UgY2FuIGRldGVjdCB0aGUgc3lzdGVtIGNvbG9yIHNjaGVtZVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRzd2l0Y2ggKFNldHRpbmcuU1lTVEVNX0NPTE9SX1RIRU1FLmdldFZhbHVlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cdFx0XHRcdGNhc2UgJ2RhcmsnOlxuXHRcdFx0XHRcdGVsZWN0cm9uLm5hdGl2ZVRoZW1lLnRoZW1lU291cmNlID0gJ2RhcmsnO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdsaWdodCc6XG5cdFx0XHRcdFx0ZWxlY3Ryb24ubmF0aXZlVGhlbWUudGhlbWVTb3VyY2UgPSAnbGlnaHQnO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdhdXRvJzpcblx0XHRcdFx0XHRzd2l0Y2ggKHRoaXMuZ2V0UHJlZmVycmVkQmFzZVRoZW1lKCkgPz8gdGhpcy5nZXRTdG9yZWRCYXNlVGhlbWUoKSkge1xuXHRcdFx0XHRcdFx0Y2FzZSBUaGVtZVR5cGVTZWxlY3Rvci5WUzogZWxlY3Ryb24ubmF0aXZlVGhlbWUudGhlbWVTb3VyY2UgPSAnbGlnaHQnOyBicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgVGhlbWVUeXBlU2VsZWN0b3IuVlNfREFSSzogZWxlY3Ryb24ubmF0aXZlVGhlbWUudGhlbWVTb3VyY2UgPSAnZGFyayc7IGJyZWFrO1xuXHRcdFx0XHRcdFx0ZGVmYXVsdDogZWxlY3Ryb24ubmF0aXZlVGhlbWUudGhlbWVTb3VyY2UgPSAnc3lzdGVtJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0ZWxlY3Ryb24ubmF0aXZlVGhlbWUudGhlbWVTb3VyY2UgPSAnc3lzdGVtJztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXRDb2xvclNjaGVtZSgpOiBJQ29sb3JTY2hlbWUge1xuXG5cdFx0Ly8gaGlnaCBjb250cmFzdCBpcyByZWZsZWN0ZWQgYnkgdGhlIHNob3VsZFVzZUludmVydGVkQ29sb3JTY2hlbWUgcHJvcGVydHlcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRpZiAoZWxlY3Ryb24ubmF0aXZlVGhlbWUuc2hvdWxkVXNlSGlnaENvbnRyYXN0Q29sb3JzKSB7XG5cdFx0XHRcdC8vIHNob3VsZFVzZUludmVydGVkQ29sb3JTY2hlbWUgaXMgZGFyaywgIXNob3VsZFVzZUludmVydGVkQ29sb3JTY2hlbWUgaXMgbGlnaHRcblx0XHRcdFx0cmV0dXJuIHsgZGFyazogZWxlY3Ryb24ubmF0aXZlVGhlbWUuc2hvdWxkVXNlSW52ZXJ0ZWRDb2xvclNjaGVtZSwgaGlnaENvbnRyYXN0OiB0cnVlIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gaGlnaCBjb250cmFzdCBpcyBzZXQgaWYgb25lIG9mIHNob3VsZFVzZUludmVydGVkQ29sb3JTY2hlbWUgb3Igc2hvdWxkVXNlSGlnaENvbnRyYXN0Q29sb3JzIGlzIHNldCxcblx0XHQvLyByZWZsZWN0aW5nIHRoZSAnSW52ZXJ0IGNvbG91cnMnIGFuZCBgSW5jcmVhc2UgY29udHJhc3RgIHNldHRpbmdzIGluIE1hY09TXG5cdFx0ZWxzZSBpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdGlmIChlbGVjdHJvbi5uYXRpdmVUaGVtZS5zaG91bGRVc2VJbnZlcnRlZENvbG9yU2NoZW1lIHx8IGVsZWN0cm9uLm5hdGl2ZVRoZW1lLnNob3VsZFVzZUhpZ2hDb250cmFzdENvbG9ycykge1xuXHRcdFx0XHRyZXR1cm4geyBkYXJrOiBlbGVjdHJvbi5uYXRpdmVUaGVtZS5zaG91bGRVc2VEYXJrQ29sb3JzLCBoaWdoQ29udHJhc3Q6IHRydWUgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyB1YnVudHUgZ25vbWUgc2VlbXMgdG8gaGF2ZSAzIHN0YXRlcywgbGlnaHQgZGFyayBhbmQgaGlnaCBjb250cmFzdFxuXHRcdGVsc2UgaWYgKGlzTGludXgpIHtcblx0XHRcdGlmIChlbGVjdHJvbi5uYXRpdmVUaGVtZS5zaG91bGRVc2VIaWdoQ29udHJhc3RDb2xvcnMpIHtcblx0XHRcdFx0cmV0dXJuIHsgZGFyazogdHJ1ZSwgaGlnaENvbnRyYXN0OiB0cnVlIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRhcms6IGVsZWN0cm9uLm5hdGl2ZVRoZW1lLnNob3VsZFVzZURhcmtDb2xvcnMsXG5cdFx0XHRoaWdoQ29udHJhc3Q6IGZhbHNlXG5cdFx0fTtcblx0fVxuXG5cdGdldFByZWZlcnJlZEJhc2VUaGVtZSgpOiBUaGVtZVR5cGVTZWxlY3RvciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29sb3JTY2hlbWUgPSB0aGlzLmdldENvbG9yU2NoZW1lKCk7XG5cdFx0aWYgKFNldHRpbmcuREVURUNUX0hDLmdldFZhbHVlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpICYmIGNvbG9yU2NoZW1lLmhpZ2hDb250cmFzdCkge1xuXHRcdFx0cmV0dXJuIGNvbG9yU2NoZW1lLmRhcmsgPyBUaGVtZVR5cGVTZWxlY3Rvci5IQ19CTEFDSyA6IFRoZW1lVHlwZVNlbGVjdG9yLkhDX0xJR0hUO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzQXV0b0RldGVjdENvbG9yU2NoZW1lKCkpIHtcblx0XHRcdHJldHVybiBjb2xvclNjaGVtZS5kYXJrID8gVGhlbWVUeXBlU2VsZWN0b3IuVlNfREFSSyA6IFRoZW1lVHlwZVNlbGVjdG9yLlZTO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRpc0F1dG9EZXRlY3RDb2xvclNjaGVtZSgpOiBib29sZWFuIHtcblx0XHRpZiAoU2V0dGluZy5ERVRFQ1RfQ09MT1JfU0NIRU1FLmdldFZhbHVlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Z2V0QmFja2dyb3VuZENvbG9yKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcHJlZmVycmVkID0gdGhpcy5nZXRQcmVmZXJyZWRCYXNlVGhlbWUoKTtcblx0XHRjb25zdCBzdG9yZWQgPSB0aGlzLmdldFN0b3JlZEJhc2VUaGVtZSgpO1xuXG5cdFx0Ly8gSWYgdGhlIHN0b3JlZCB0aGVtZSBoYXMgdGhlIHNhbWUgYmFzZSBhcyB0aGUgcHJlZmVycmVkLCB3ZSBjYW4gcmV0dXJuIHRoZSBzdG9yZWQgYmFja2dyb3VuZFxuXHRcdGlmIChwcmVmZXJyZWQgPT09IHVuZGVmaW5lZCB8fCBwcmVmZXJyZWQgPT09IHN0b3JlZCkge1xuXHRcdFx0Y29uc3Qgc3RvcmVkQmFja2dyb3VuZCA9IHRoaXMuc3RhdGVTZXJ2aWNlLmdldEl0ZW08c3RyaW5nIHwgbnVsbD4oVEhFTUVfQkdfU1RPUkFHRV9LRVksIG51bGwpO1xuXHRcdFx0aWYgKHN0b3JlZEJhY2tncm91bmQpIHtcblx0XHRcdFx0cmV0dXJuIHN0b3JlZEJhY2tncm91bmQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIHdlIHJldHVybiB0aGUgZGVmYXVsdCBiYWNrZ3JvdW5kIGZvciB0aGUgcHJlZmVycmVkIGJhc2UgdGhlbWUuIElmIHRoZXJlJ3Mgbm8gcHJlZmVycmVkLCB1c2UgdGhlIHN0b3JlZCBvbmUuXG5cdFx0c3dpdGNoIChwcmVmZXJyZWQgPz8gc3RvcmVkKSB7XG5cdFx0XHRjYXNlIFRoZW1lVHlwZVNlbGVjdG9yLlZTOiByZXR1cm4gREVGQVVMVF9CR19MSUdIVDtcblx0XHRcdGNhc2UgVGhlbWVUeXBlU2VsZWN0b3IuSENfQkxBQ0s6IHJldHVybiBERUZBVUxUX0JHX0hDX0JMQUNLO1xuXHRcdFx0Y2FzZSBUaGVtZVR5cGVTZWxlY3Rvci5IQ19MSUdIVDogcmV0dXJuIERFRkFVTFRfQkdfSENfTElHSFQ7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gREVGQVVMVF9CR19EQVJLO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0U3RvcmVkQmFzZVRoZW1lKCk6IFRoZW1lVHlwZVNlbGVjdG9yIHtcblx0XHRjb25zdCBiYXNlVGhlbWUgPSB0aGlzLnN0YXRlU2VydmljZS5nZXRJdGVtPFRoZW1lVHlwZVNlbGVjdG9yPihUSEVNRV9TVE9SQUdFX0tFWSwgVGhlbWVUeXBlU2VsZWN0b3IuVlNfREFSSykuc3BsaXQoJyAnKVswXTtcblx0XHRzd2l0Y2ggKGJhc2VUaGVtZSkge1xuXHRcdFx0Y2FzZSBUaGVtZVR5cGVTZWxlY3Rvci5WUzogcmV0dXJuIFRoZW1lVHlwZVNlbGVjdG9yLlZTO1xuXHRcdFx0Y2FzZSBUaGVtZVR5cGVTZWxlY3Rvci5IQ19CTEFDSzogcmV0dXJuIFRoZW1lVHlwZVNlbGVjdG9yLkhDX0JMQUNLO1xuXHRcdFx0Y2FzZSBUaGVtZVR5cGVTZWxlY3Rvci5IQ19MSUdIVDogcmV0dXJuIFRoZW1lVHlwZVNlbGVjdG9yLkhDX0xJR0hUO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIFRoZW1lVHlwZVNlbGVjdG9yLlZTX0RBUks7XG5cdFx0fVxuXHR9XG5cblx0c2F2ZVdpbmRvd1NwbGFzaCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCB3b3Jrc3BhY2U6IElXb3Jrc3BhY2VJZGVudGlmaWVyIHwgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIgfCB1bmRlZmluZWQsIHNwbGFzaDogSVBhcnRzU3BsYXNoKTogdm9pZCB7XG5cblx0XHQvLyBVcGRhdGUgb3ZlcnJpZGUgYXMgbmVlZGVkXG5cdFx0Y29uc3Qgc3BsYXNoT3ZlcnJpZGUgPSB0aGlzLnVwZGF0ZVdpbmRvd1NwbGFzaE92ZXJyaWRlKHdvcmtzcGFjZSwgc3BsYXNoKTtcblxuXHRcdC8vIFVwZGF0ZSBpbiBzdG9yYWdlXG5cdFx0dGhpcy5zdGF0ZVNlcnZpY2Uuc2V0SXRlbXMoY29hbGVzY2UoW1xuXHRcdFx0eyBrZXk6IFRIRU1FX1NUT1JBR0VfS0VZLCBkYXRhOiBzcGxhc2guYmFzZVRoZW1lIH0sXG5cdFx0XHR7IGtleTogVEhFTUVfQkdfU1RPUkFHRV9LRVksIGRhdGE6IHNwbGFzaC5jb2xvckluZm8uYmFja2dyb3VuZCB9LFxuXHRcdFx0eyBrZXk6IFRIRU1FX1dJTkRPV19TUExBU0hfS0VZLCBkYXRhOiBzcGxhc2ggfSxcblx0XHRcdHNwbGFzaE92ZXJyaWRlID8geyBrZXk6IFRIRU1FX1dJTkRPV19TUExBU0hfT1ZFUlJJREVfS0VZLCBkYXRhOiBzcGxhc2hPdmVycmlkZSB9IDogdW5kZWZpbmVkXG5cdFx0XSkpO1xuXG5cdFx0Ly8gVXBkYXRlIGluIG9wZW5lZCB3aW5kb3dzXG5cdFx0aWYgKHR5cGVvZiB3aW5kb3dJZCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMudXBkYXRlQmFja2dyb3VuZENvbG9yKHdpbmRvd0lkLCBzcGxhc2gpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBzeXN0ZW0gdGhlbWVcblx0XHR0aGlzLnVwZGF0ZVN5c3RlbUNvbG9yVGhlbWUoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlV2luZG93U3BsYXNoT3ZlcnJpZGUod29ya3NwYWNlOiBJV29ya3NwYWNlSWRlbnRpZmllciB8IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyIHwgdW5kZWZpbmVkLCBzcGxhc2g6IElQYXJ0c1NwbGFzaCk6IElQYXJ0c1NwbGFzaE92ZXJyaWRlIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgc3BsYXNoT3ZlcnJpZGU6IElQYXJ0c1NwbGFzaE92ZXJyaWRlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cdFx0aWYgKHdvcmtzcGFjZSkge1xuXHRcdFx0c3BsYXNoT3ZlcnJpZGUgPSB7IC4uLnRoaXMuZ2V0V2luZG93U3BsYXNoT3ZlcnJpZGUoKSB9OyAvLyBtYWtlIGEgY29weSBmb3IgbW9kaWZpY2F0aW9uc1xuXG5cdFx0XHRjaGFuZ2VkID0gdGhpcy5kb1VwZGF0ZVdpbmRvd1NwbGFzaE92ZXJyaWRlKHdvcmtzcGFjZSwgc3BsYXNoLCBzcGxhc2hPdmVycmlkZSwgJ3NpZGVCYXInKTtcblx0XHRcdGNoYW5nZWQgPSB0aGlzLmRvVXBkYXRlV2luZG93U3BsYXNoT3ZlcnJpZGUod29ya3NwYWNlLCBzcGxhc2gsIHNwbGFzaE92ZXJyaWRlLCAnYXV4aWxpYXJ5QmFyJykgfHwgY2hhbmdlZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2hhbmdlZCA/IHNwbGFzaE92ZXJyaWRlIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1VwZGF0ZVdpbmRvd1NwbGFzaE92ZXJyaWRlKHdvcmtzcGFjZTogSVdvcmtzcGFjZUlkZW50aWZpZXIgfCBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciwgc3BsYXNoOiBJUGFydHNTcGxhc2gsIHNwbGFzaE92ZXJyaWRlOiBJUGFydHNTcGxhc2hPdmVycmlkZSwgcGFydDogJ3NpZGVCYXInIHwgJ2F1eGlsaWFyeUJhcicpOiBib29sZWFuIHtcblx0XHRjb25zdCBjdXJyZW50V2lkdGggPSBwYXJ0ID09PSAnc2lkZUJhcicgPyBzcGxhc2gubGF5b3V0SW5mbz8uc2lkZUJhcldpZHRoIDogc3BsYXNoLmxheW91dEluZm8/LmF1eGlsaWFyeUJhcldpZHRoO1xuXHRcdGNvbnN0IG92ZXJyaWRlV2lkdGggPSBwYXJ0ID09PSAnc2lkZUJhcicgPyBzcGxhc2hPdmVycmlkZS5sYXlvdXRJbmZvLnNpZGVCYXJXaWR0aCA6IHNwbGFzaE92ZXJyaWRlLmxheW91dEluZm8uYXV4aWxpYXJ5QmFyV2lkdGg7XG5cblx0XHQvLyBObyBsYXlvdXQgaW5mbzogcmVtb3ZlIG92ZXJyaWRlXG5cdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRpZiAodHlwZW9mIGN1cnJlbnRXaWR0aCAhPT0gJ251bWJlcicpIHtcblx0XHRcdGlmIChzcGxhc2hPdmVycmlkZS5sYXlvdXRJbmZvLndvcmtzcGFjZXNbd29ya3NwYWNlLmlkXSkge1xuXHRcdFx0XHRkZWxldGUgc3BsYXNoT3ZlcnJpZGUubGF5b3V0SW5mby53b3Jrc3BhY2VzW3dvcmtzcGFjZS5pZF07XG5cdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gY2hhbmdlZDtcblx0XHR9XG5cblx0XHRsZXQgd29ya3NwYWNlT3ZlcnJpZGUgPSBzcGxhc2hPdmVycmlkZS5sYXlvdXRJbmZvLndvcmtzcGFjZXNbd29ya3NwYWNlLmlkXTtcblx0XHRpZiAoIXdvcmtzcGFjZU92ZXJyaWRlKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VFbnRyaWVzID0gT2JqZWN0LmtleXMoc3BsYXNoT3ZlcnJpZGUubGF5b3V0SW5mby53b3Jrc3BhY2VzKTtcblx0XHRcdGlmICh3b3Jrc3BhY2VFbnRyaWVzLmxlbmd0aCA+PSBUaGVtZU1haW5TZXJ2aWNlLldPUktTUEFDRV9PVkVSUklERV9MSU1JVCkge1xuXHRcdFx0XHRkZWxldGUgc3BsYXNoT3ZlcnJpZGUubGF5b3V0SW5mby53b3Jrc3BhY2VzW3dvcmtzcGFjZUVudHJpZXNbMF1dO1xuXHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0d29ya3NwYWNlT3ZlcnJpZGUgPSB7IHNpZGVCYXJWaXNpYmxlOiBmYWxzZSwgYXV4aWxpYXJ5QmFyVmlzaWJsZTogZmFsc2UgfTtcblx0XHRcdHNwbGFzaE92ZXJyaWRlLmxheW91dEluZm8ud29ya3NwYWNlc1t3b3Jrc3BhY2UuaWRdID0gd29ya3NwYWNlT3ZlcnJpZGU7XG5cdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBQYXJ0IGhhcyB3aWR0aDogdXBkYXRlIHdpZHRoICYgdmlzaWJpbGl0eSBvdmVycmlkZVxuXHRcdGlmIChjdXJyZW50V2lkdGggPiAwKSB7XG5cdFx0XHRpZiAob3ZlcnJpZGVXaWR0aCAhPT0gY3VycmVudFdpZHRoKSB7XG5cdFx0XHRcdHNwbGFzaE92ZXJyaWRlLmxheW91dEluZm9bcGFydCA9PT0gJ3NpZGVCYXInID8gJ3NpZGVCYXJXaWR0aCcgOiAnYXV4aWxpYXJ5QmFyV2lkdGgnXSA9IGN1cnJlbnRXaWR0aDtcblx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdHN3aXRjaCAocGFydCkge1xuXHRcdFx0XHRjYXNlICdzaWRlQmFyJzpcblx0XHRcdFx0XHRpZiAoIXdvcmtzcGFjZU92ZXJyaWRlLnNpZGVCYXJWaXNpYmxlKSB7XG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2VPdmVycmlkZS5zaWRlQmFyVmlzaWJsZSA9IHRydWU7XG5cdFx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2F1eGlsaWFyeUJhcic6XG5cdFx0XHRcdFx0aWYgKCF3b3Jrc3BhY2VPdmVycmlkZS5hdXhpbGlhcnlCYXJWaXNpYmxlKSB7XG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2VPdmVycmlkZS5hdXhpbGlhcnlCYXJWaXNpYmxlID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBQYXJ0IGlzIGhpZGRlbjogdXBkYXRlIHZpc2liaWxpdHkgb3ZlcnJpZGVcblx0XHRlbHNlIHtcblx0XHRcdHN3aXRjaCAocGFydCkge1xuXHRcdFx0XHRjYXNlICdzaWRlQmFyJzpcblx0XHRcdFx0XHRpZiAod29ya3NwYWNlT3ZlcnJpZGUuc2lkZUJhclZpc2libGUpIHtcblx0XHRcdFx0XHRcdHdvcmtzcGFjZU92ZXJyaWRlLnNpZGVCYXJWaXNpYmxlID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2F1eGlsaWFyeUJhcic6XG5cdFx0XHRcdFx0aWYgKHdvcmtzcGFjZU92ZXJyaWRlLmF1eGlsaWFyeUJhclZpc2libGUpIHtcblx0XHRcdFx0XHRcdHdvcmtzcGFjZU92ZXJyaWRlLmF1eGlsaWFyeUJhclZpc2libGUgPSBmYWxzZTtcblx0XHRcdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gY2hhbmdlZDtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQmFja2dyb3VuZENvbG9yKHdpbmRvd0lkOiBudW1iZXIsIHNwbGFzaDogSVBhcnRzU3BsYXNoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB3aW5kb3cgb2YgZ2V0QWxsV2luZG93c0V4Y2x1ZGluZ09mZnNjcmVlbigpKSB7XG5cdFx0XHRpZiAod2luZG93LmlkID09PSB3aW5kb3dJZCkge1xuXHRcdFx0XHR3aW5kb3cuc2V0QmFja2dyb3VuZENvbG9yKHNwbGFzaC5jb2xvckluZm8uYmFja2dyb3VuZCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldFdpbmRvd1NwbGFzaCh3b3Jrc3BhY2U6IElXb3Jrc3BhY2VJZGVudGlmaWVyIHwgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIgfCB1bmRlZmluZWQpOiBJUGFydHNTcGxhc2ggfCB1bmRlZmluZWQge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb0dldFdpbmRvd1NwbGFzaCh3b3Jrc3BhY2UpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1t0aGVtZSBtYWluIHNlcnZpY2VdIEZhaWxlZCB0byBnZXQgd2luZG93IHNwbGFzaCcsIGVycm9yKTtcblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRvR2V0V2luZG93U3BsYXNoKHdvcmtzcGFjZTogSVdvcmtzcGFjZUlkZW50aWZpZXIgfCBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciB8IHVuZGVmaW5lZCk6IElQYXJ0c1NwbGFzaCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcGFydFNwbGFzaCA9IHRoaXMuc3RhdGVTZXJ2aWNlLmdldEl0ZW08SVBhcnRzU3BsYXNoPihUSEVNRV9XSU5ET1dfU1BMQVNIX0tFWSk7XG5cdFx0aWYgKCFwYXJ0U3BsYXNoPy5sYXlvdXRJbmZvKSB7XG5cdFx0XHRyZXR1cm4gcGFydFNwbGFzaDsgLy8gcmV0dXJuIGVhcmx5OiBvdmVycmlkZXMgY3VycmVudGx5IG9ubHkgYXBwbHkgdG8gbGF5b3V0IGluZm9cblx0XHR9XG5cblx0XHRjb25zdCBvdmVycmlkZSA9IHRoaXMuZ2V0V2luZG93U3BsYXNoT3ZlcnJpZGUoKTtcblxuXHRcdC8vIEZpZ3VyZSBvdXQgc2lkZSBiYXIgd2lkdGggYmFzZWQgb24gd29ya3NwYWNlIGFuZCBvdmVycmlkZXNcblx0XHRsZXQgc2lkZUJhcldpZHRoOiBudW1iZXI7XG5cdFx0aWYgKHdvcmtzcGFjZSkge1xuXHRcdFx0aWYgKG92ZXJyaWRlLmxheW91dEluZm8ud29ya3NwYWNlc1t3b3Jrc3BhY2UuaWRdPy5zaWRlQmFyVmlzaWJsZSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0c2lkZUJhcldpZHRoID0gMDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNpZGVCYXJXaWR0aCA9IG92ZXJyaWRlLmxheW91dEluZm8uc2lkZUJhcldpZHRoIHx8IHBhcnRTcGxhc2gubGF5b3V0SW5mby5zaWRlQmFyV2lkdGggfHwgVGhlbWVNYWluU2VydmljZS5ERUZBVUxUX0JBUl9XSURUSDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0c2lkZUJhcldpZHRoID0gMDtcblx0XHR9XG5cblx0XHQvLyBGaWd1cmUgb3V0IGF1eGlsaWFyeSBiYXIgd2lkdGggYmFzZWQgb24gd29ya3NwYWNlLCBjb25maWd1cmF0aW9uIGFuZCBvdmVycmlkZXNcblx0XHRjb25zdCBhdXhpbGlhcnlCYXJEZWZhdWx0VmlzaWJpbGl0eSA9IFNldHRpbmcuQVVYSUxJQVJZQkFSX0RFRkFVTFRfVklTSUJJTElUWS5nZXRWYWx1ZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBzdGFydHVwRWRpdG9yID0gU2V0dGluZy5TVEFSVFVQX0VESVRPUi5nZXRWYWx1ZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRsZXQgYXV4aWxpYXJ5QmFyV2lkdGg6IG51bWJlcjtcblx0XHRpZiAod29ya3NwYWNlKSB7XG5cdFx0XHRjb25zdCBhdXhpbGlhcnlCYXJWaXNpYmxlID0gb3ZlcnJpZGUubGF5b3V0SW5mby53b3Jrc3BhY2VzW3dvcmtzcGFjZS5pZF0/LmF1eGlsaWFyeUJhclZpc2libGU7XG5cdFx0XHRpZiAoYXV4aWxpYXJ5QmFyVmlzaWJsZSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRhdXhpbGlhcnlCYXJXaWR0aCA9IG92ZXJyaWRlLmxheW91dEluZm8uYXV4aWxpYXJ5QmFyV2lkdGggfHwgcGFydFNwbGFzaC5sYXlvdXRJbmZvLmF1eGlsaWFyeUJhcldpZHRoIHx8IFRoZW1lTWFpblNlcnZpY2UuREVGQVVMVF9CQVJfV0lEVEg7XG5cdFx0XHR9IGVsc2UgaWYgKGF1eGlsaWFyeUJhclZpc2libGUgPT09IGZhbHNlKSB7XG5cdFx0XHRcdGF1eGlsaWFyeUJhcldpZHRoID0gMDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChzdGFydHVwRWRpdG9yICE9PSAnYWdlbnRTZXNzaW9uc1dlbGNvbWVQYWdlJyAmJiAoYXV4aWxpYXJ5QmFyRGVmYXVsdFZpc2liaWxpdHkgPT09ICd2aXNpYmxlJyB8fCBhdXhpbGlhcnlCYXJEZWZhdWx0VmlzaWJpbGl0eSA9PT0gJ3Zpc2libGVJbldvcmtzcGFjZScpKSB7XG5cdFx0XHRcdFx0YXV4aWxpYXJ5QmFyV2lkdGggPSBvdmVycmlkZS5sYXlvdXRJbmZvLmF1eGlsaWFyeUJhcldpZHRoIHx8IHBhcnRTcGxhc2gubGF5b3V0SW5mby5hdXhpbGlhcnlCYXJXaWR0aCB8fCBUaGVtZU1haW5TZXJ2aWNlLkRFRkFVTFRfQkFSX1dJRFRIO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHN0YXJ0dXBFZGl0b3IgIT09ICdhZ2VudFNlc3Npb25zV2VsY29tZVBhZ2UnICYmIChhdXhpbGlhcnlCYXJEZWZhdWx0VmlzaWJpbGl0eSA9PT0gJ21heGltaXplZCcgfHwgYXV4aWxpYXJ5QmFyRGVmYXVsdFZpc2liaWxpdHkgPT09ICdtYXhpbWl6ZWRJbldvcmtzcGFjZScpKSB7XG5cdFx0XHRcdFx0YXV4aWxpYXJ5QmFyV2lkdGggPSBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUjsgLy8gbWFya2VyIGZvciBhIG1heGltaXNlZCBhdXhpbGlhcnkgYmFyXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXV4aWxpYXJ5QmFyV2lkdGggPSAwO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF1eGlsaWFyeUJhcldpZHRoID0gMDsgLy8gdGVjaG5pY2FsbHkgbm90IHRydWUgaWYgY29uZmlndXJlZCAndmlzaWJsZScsIGJ1dCB3ZSBuZXZlciBzdG9yZSBzcGxhc2ggcGVyIGVtcHR5IHdpbmRvdywgc28gd2UgZGVjaWRlIG9uIGEgZGVmYXVsdCBoZXJlXG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFydEJvdW5kcyA9IHNpZGVCYXJXaWR0aCA9PT0gcGFydFNwbGFzaC5sYXlvdXRJbmZvLnNpZGVCYXJXaWR0aCAmJiBhdXhpbGlhcnlCYXJXaWR0aCA9PT0gcGFydFNwbGFzaC5sYXlvdXRJbmZvLmF1eGlsaWFyeUJhcldpZHRoXG5cdFx0XHQ/IHBhcnRTcGxhc2gubGF5b3V0SW5mby5wYXJ0Qm91bmRzXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5wYXJ0U3BsYXNoLFxuXHRcdFx0bGF5b3V0SW5mbzoge1xuXHRcdFx0XHQuLi5wYXJ0U3BsYXNoLmxheW91dEluZm8sXG5cdFx0XHRcdHNpZGVCYXJXaWR0aCxcblx0XHRcdFx0YXV4aWxpYXJ5QmFyV2lkdGgsXG5cdFx0XHRcdHBhcnRCb3VuZHNcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRXaW5kb3dTcGxhc2hPdmVycmlkZSgpOiBJUGFydHNTcGxhc2hPdmVycmlkZSB7XG5cdFx0bGV0IG92ZXJyaWRlID0gdGhpcy5zdGF0ZVNlcnZpY2UuZ2V0SXRlbTxJUGFydHNTcGxhc2hPdmVycmlkZT4oVEhFTUVfV0lORE9XX1NQTEFTSF9PVkVSUklERV9LRVkpO1xuXG5cdFx0aWYgKCFvdmVycmlkZT8ubGF5b3V0SW5mbykge1xuXHRcdFx0b3ZlcnJpZGUgPSB7XG5cdFx0XHRcdGxheW91dEluZm86IHtcblx0XHRcdFx0XHRzaWRlQmFyV2lkdGg6IFRoZW1lTWFpblNlcnZpY2UuREVGQVVMVF9CQVJfV0lEVEgsXG5cdFx0XHRcdFx0YXV4aWxpYXJ5QmFyV2lkdGg6IFRoZW1lTWFpblNlcnZpY2UuREVGQVVMVF9CQVJfV0lEVEgsXG5cdFx0XHRcdFx0d29ya3NwYWNlczoge31cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoIW92ZXJyaWRlLmxheW91dEluZm8uc2lkZUJhcldpZHRoKSB7XG5cdFx0XHRvdmVycmlkZS5sYXlvdXRJbmZvLnNpZGVCYXJXaWR0aCA9IFRoZW1lTWFpblNlcnZpY2UuREVGQVVMVF9CQVJfV0lEVEg7XG5cdFx0fVxuXG5cdFx0aWYgKCFvdmVycmlkZS5sYXlvdXRJbmZvLmF1eGlsaWFyeUJhcldpZHRoKSB7XG5cdFx0XHRvdmVycmlkZS5sYXlvdXRJbmZvLmF1eGlsaWFyeUJhcldpZHRoID0gVGhlbWVNYWluU2VydmljZS5ERUZBVUxUX0JBUl9XSURUSDtcblx0XHR9XG5cblx0XHRpZiAoIW92ZXJyaWRlLmxheW91dEluZm8ud29ya3NwYWNlcykge1xuXHRcdFx0b3ZlcnJpZGUubGF5b3V0SW5mby53b3Jrc3BhY2VzID0ge307XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG92ZXJyaWRlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU8sY0FBYztBQUNyQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFNBQVMsYUFBYSxpQkFBaUI7QUFDaEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFHOUIsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxhQUFhLGdCQUFnQjtBQUt0QyxNQUFNLG1CQUFtQjtBQUN6QixNQUFNLGtCQUFrQjtBQUN4QixNQUFNLHNCQUFzQjtBQUM1QixNQUFNLHNCQUFzQjtBQUU1QixNQUFNLG9CQUFvQjtBQUMxQixNQUFNLHVCQUF1QjtBQUU3QixNQUFNLDBCQUEwQjtBQUNoQyxNQUFNLG1DQUFtQztBQUV6QyxNQUFNLFFBQVc7QUFBQSxFQUNoQixZQUE0QixLQUE2QixjQUFpQjtBQUE5QztBQUE2QjtBQUFBLEVBQ3pEO0FBQUEsRUFDQSxTQUFTLHNCQUFnRDtBQUN4RCxXQUFPLHFCQUFxQixTQUFZLEtBQUssR0FBRyxLQUFLLEtBQUs7QUFBQSxFQUMzRDtBQUNEO0FBQUEsQ0FHQSxDQUFVQSxhQUFWO0FBQ1EsRUFBTUEsU0FBQSxzQkFBc0IsSUFBSUEsU0FBaUIsZ0NBQWdDLEtBQUs7QUFDdEYsRUFBTUEsU0FBQSxZQUFZLElBQUlBLFNB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
