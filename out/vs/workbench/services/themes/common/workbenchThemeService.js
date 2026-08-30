import { refineServiceDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { isBoolean, isString } from "../../../../base/common/types.js";
const IWorkbenchThemeService = refineServiceDecorator(IThemeService);
const THEME_SCOPE_OPEN_PAREN = "[";
const THEME_SCOPE_CLOSE_PAREN = "]";
const THEME_SCOPE_WILDCARD = "*";
const themeScopeRegex = /\[(.+?)\]/g;
var ThemeSettings = /* @__PURE__ */ ((ThemeSettings2) => {
  ThemeSettings2["COLOR_THEME"] = "workbench.colorTheme";
  ThemeSettings2["FILE_ICON_THEME"] = "workbench.iconTheme";
  ThemeSettings2["PRODUCT_ICON_THEME"] = "workbench.productIconTheme";
  ThemeSettings2["COLOR_CUSTOMIZATIONS"] = "workbench.colorCustomizations";
  ThemeSettings2["TOKEN_COLOR_CUSTOMIZATIONS"] = "editor.tokenColorCustomizations";
  ThemeSettings2["SEMANTIC_TOKEN_COLOR_CUSTOMIZATIONS"] = "editor.semanticTokenColorCustomizations";
  ThemeSettings2["PREFERRED_DARK_THEME"] = "workbench.preferredDarkColorTheme";
  ThemeSettings2["PREFERRED_LIGHT_THEME"] = "workbench.preferredLightColorTheme";
  ThemeSettings2["PREFERRED_HC_DARK_THEME"] = "workbench.preferredHighContrastColorTheme";
  ThemeSettings2["PREFERRED_HC_LIGHT_THEME"] = "workbench.preferredHighContrastLightColorTheme";
  ThemeSettings2["DETECT_COLOR_SCHEME"] = "window.autoDetectColorScheme";
  ThemeSettings2["DETECT_HC"] = "window.autoDetectHighContrast";
  ThemeSettings2["SYSTEM_COLOR_THEME"] = "window.systemColorTheme";
  return ThemeSettings2;
})(ThemeSettings || {});
var ThemeSettingDefaults;
((ThemeSettingDefaults2) => {
  ThemeSettingDefaults2.COLOR_THEME_DARK = "Dark 2026";
  ThemeSettingDefaults2.COLOR_THEME_LIGHT = "Light 2026";
  ThemeSettingDefaults2.COLOR_THEME_HC_DARK = "Default High Contrast";
  ThemeSettingDefaults2.COLOR_THEME_HC_LIGHT = "Default High Contrast Light";
  ThemeSettingDefaults2.FILE_ICON_THEME = "vs-seti";
  ThemeSettingDefaults2.PRODUCT_ICON_THEME = "Default";
})(ThemeSettingDefaults || (ThemeSettingDefaults = {}));
function migrateThemeSettingsId(settingsId) {
  switch (settingsId) {
    case "Default Dark Modern":
      return "Dark Modern";
    case "Default Light Modern":
      return "Light Modern";
    case "Default Dark+":
      return "Dark+";
    case "Default Light+":
      return "Light+";
    case "Experimental Dark":
    case "VS Code Dark":
      return ThemeSettingDefaults.COLOR_THEME_DARK;
    case "Experimental Light":
    case "VS Code Light":
      return ThemeSettingDefaults.COLOR_THEME_LIGHT;
  }
  return settingsId;
}
const COLOR_THEME_DARK_INITIAL_COLORS = {
  "actionBar.toggledBackground": "#383a49",
  "activityBar.activeBorder": "#0078D4",
  "activityBar.background": "#181818",
  "activityBar.border": "#2B2B2B",
  "activityBar.foreground": "#D7D7D7",
  "activityBar.inactiveForeground": "#868686",
  "activityBarBadge.background": "#0078D4",
  "activityBarBadge.foreground": "#FFFFFF",
  "badge.background": "#616161",
  "badge.foreground": "#F8F8F8",
  "button.background": "#0078D4",
  "button.border": "#FFFFFF12",
  "button.foreground": "#FFFFFF",
  "button.hoverBackground": "#026EC1",
  "button.secondaryBackground": "#313131",
  "button.secondaryForeground": "#CCCCCC",
  "button.secondaryHoverBackground": "#3C3C3C",
  "chat.slashCommandBackground": "#26477866",
  "chat.slashCommandForeground": "#85B6FF",
  "chat.editedFileForeground": "#E2C08D",
  "checkbox.background": "#313131",
  "checkbox.border": "#3C3C3C",
  "debugToolBar.background": "#181818",
  "descriptionForeground": "#9D9D9D",
  "dropdown.background": "#313131",
  "dropdown.border": "#3C3C3C",
  "dropdown.foreground": "#CCCCCC",
  "dropdown.listBackground": "#1F1F1F",
  "editor.background": "#1F1F1F",
  "editor.findMatchBackground": "#9E6A03",
  "editor.foreground": "#CCCCCC",
  "editor.inactiveSelectionBackground": "#3A3D41",
  "editor.selectionHighlightBackground": "#ADD6FF26",
  "editorGroup.border": "#FFFFFF17",
  "editorGroupHeader.tabsBackground": "#181818",
  "editorGroupHeader.tabsBorder": "#2B2B2B",
  "editorGutter.addedBackground": "#2EA043",
  "editorGutter.deletedBackground": "#F85149",
  "editorGutter.modifiedBackground": "#0078D4",
  "editorIndentGuide.activeBackground1": "#707070",
  "editorIndentGuide.background1": "#404040",
  "editorLineNumber.activeForeground": "#CCCCCC",
  "editorLineNumber.foreground": "#6E7681",
  "editorOverviewRuler.border": "#010409",
  "editorWidget.background": "#202020",
  "errorForeground": "#F85149",
  "focusBorder": "#0078D4",
  "foreground": "#CCCCCC",
  "icon.foreground": "#CCCCCC",
  "input.background": "#313131",
  "input.border": "#3C3C3C",
  "input.foreground": "#CCCCCC",
  "input.placeholderForeground": "#989898",
  "inputOption.activeBackground": "#2489DB82",
  "inputOption.activeBorder": "#2488DB",
  "keybindingLabel.foreground": "#CCCCCC",
  "list.activeSelectionIconForeground": "#FFF",
  "list.dropBackground": "#383B3D",
  "menu.background": "#1F1F1F",
  "menu.border": "#454545",
  "menu.foreground": "#CCCCCC",
  "menu.selectionBackground": "#0078d4",
  "menu.separatorBackground": "#454545",
  "notificationCenterHeader.background": "#1F1F1F",
  "notificationCenterHeader.foreground": "#CCCCCC",
  "notifications.background": "#1F1F1F",
  "notifications.border": "#2B2B2B",
  "notifications.foreground": "#CCCCCC",
  "panel.background": "#181818",
  "panel.border": "#2B2B2B",
  "panelInput.border": "#2B2B2B",
  "panelTitle.activeBorder": "#0078D4",
  "panelTitle.activeForeground": "#CCCCCC",
  "panelTitle.inactiveForeground": "#9D9D9D",
  "peekViewEditor.background": "#1F1F1F",
  "peekViewEditor.matchHighlightBackground": "#BB800966",
  "peekViewResult.background": "#1F1F1F",
  "peekViewResult.matchHighlightBackground": "#BB800966",
  "pickerGroup.border": "#3C3C3C",
  "ports.iconRunningProcessForeground": "#369432",
  "progressBar.background": "#0078D4",
  "quickInput.background": "#222222",
  "quickInput.foreground": "#CCCCCC",
  "settings.dropdownBackground": "#313131",
  "settings.dropdownBorder": "#3C3C3C",
  "settings.headerForeground": "#FFFFFF",
  "settings.modifiedItemIndicator": "#BB800966",
  "sideBar.background": "#181818",
  "sideBar.border": "#2B2B2B",
  "sideBar.foreground": "#CCCCCC",
  "sideBarSectionHeader.background": "#181818",
  "sideBarSectionHeader.border": "#2B2B2B",
  "sideBarSectionHeader.foreground": "#CCCCCC",
  "sideBarTitle.foreground": "#CCCCCC",
  "statusBar.background": "#181818",
  "statusBar.border": "#2B2B2B",
  "statusBar.debuggingBackground": "#0078D4",
  "statusBar.debuggingForeground": "#FFFFFF",
  "statusBar.focusBorder": "#0078D4",
  "statusBar.foreground": "#CCCCCC",
  "statusBar.noFolderBackground": "#1F1F1F",
  "statusBarItem.focusBorder": "#0078D4",
  "statusBarItem.prominentBackground": "#6E768166",
  "statusBarItem.remoteBackground": "#0078D4",
  "statusBarItem.remoteForeground": "#FFFFFF",
  "tab.activeBackground": "#1F1F1F",
  "tab.activeBorder": "#1F1F1F",
  "tab.activeBorderTop": "#0078D4",
  "tab.activeForeground": "#FFFFFF",
  "tab.border": "#2B2B2B",
  "tab.hoverBackground": "#1F1F1F",
  "tab.inactiveBackground": "#181818",
  "tab.inactiveForeground": "#9D9D9D",
  "tab.lastPinnedBorder": "#ccc3",
  "tab.selectedBackground": "#37373D",
  "tab.selectedBorderTop": "#6caddf",
  "tab.selectedForeground": "#FFFFFF",
  "tab.unfocusedActiveBorder": "#1F1F1F",
  "tab.unfocusedActiveBorderTop": "#2B2B2B",
  "tab.unfocusedHoverBackground": "#1F1F1F",
  "terminal.foreground": "#CCCCCC",
  "terminal.inactiveSelectionBackground": "#3A3D41",
  "terminal.tab.activeBorder": "#0078D4",
  "textBlockQuote.background": "#2B2B2B",
  "textBlockQuote.border": "#616161",
  "textCodeBlock.background": "#2B2B2B",
  "textLink.activeForeground": "#4daafc",
  "textLink.foreground": "#4daafc",
  "textPreformat.background": "#3C3C3C",
  "textPreformat.foreground": "#D0D0D0",
  "textSeparator.foreground": "#21262D",
  "titleBar.activeBackground": "#181818",
  "titleBar.activeForeground": "#CCCCCC",
  "titleBar.border": "#2B2B2B",
  "titleBar.inactiveBackground": "#1F1F1F",
  "titleBar.inactiveForeground": "#9D9D9D",
  "welcomePage.progress.foreground": "#0078D4",
  "welcomePage.tileBackground": "#2B2B2B",
  "widget.border": "#313131"
};
const COLOR_THEME_LIGHT_INITIAL_COLORS = {
  "actionBar.toggledBackground": "#dddddd",
  "activityBar.activeBorder": "#005FB8",
  "activityBar.background": "#F8F8F8",
  "activityBar.border": "#E5E5E5",
  "activityBar.foreground": "#1F1F1F",
  "activityBar.inactiveForeground": "#616161",
  "activityBarBadge.background": "#005FB8",
  "activityBarBadge.foreground": "#FFFFFF",
  "badge.background": "#CCCCCC",
  "badge.foreground": "#3B3B3B",
  "button.background": "#005FB8",
  "button.border": "#0000001a",
  "button.foreground": "#FFFFFF",
  "button.hoverBackground": "#0258A8",
  "button.secondaryBackground": "#E5E5E5",
  "button.secondaryForeground": "#3B3B3B",
  "button.secondaryHoverBackground": "#CCCCCC",
  "chat.slashCommandBackground": "#ADCEFF7A",
  "chat.slashCommandForeground": "#26569E",
  "chat.editedFileForeground": "#895503",
  "checkbox.background": "#F8F8F8",
  "checkbox.border": "#CECECE",
  "descriptionForeground": "#3B3B3B",
  "diffEditor.unchangedRegionBackground": "#f8f8f8",
  "dropdown.background": "#FFFFFF",
  "dropdown.border": "#CECECE",
  "dropdown.foreground": "#3B3B3B",
  "dropdown.listBackground": "#FFFFFF",
  "editor.background": "#FFFFFF",
  "editor.foreground": "#3B3B3B",
  "editor.inactiveSelectionBackground": "#E5EBF1",
  "editor.selectionHighlightBackground": "#ADD6FF80",
  "editorGroup.border": "#E5E5E5",
  "editorGroupHeader.tabsBackground": "#F8F8F8",
  "editorGroupHeader.tabsBorder": "#E5E5E5",
  "editorGutter.addedBackground": "#2EA043",
  "editorGutter.deletedBackground": "#F85149",
  "editorGutter.modifiedBackground": "#005FB8",
  "editorIndentGuide.activeBackground1": "#939393",
  "editorIndentGuide.background1": "#D3D3D3",
  "editorLineNumber.activeForeground": "#171184",
  "editorLineNumber.foreground": "#6E7681",
  "editorOverviewRuler.border": "#E5E5E5",
  "editorSuggestWidget.background": "#F8F8F8",
  "editorWidget.background": "#F8F8F8",
  "errorForeground": "#F85149",
  "focusBorder": "#005FB8",
  "foreground": "#3B3B3B",
  "icon.foreground": "#3B3B3B",
  "input.background": "#FFFFFF",
  "input.border": "#CECECE",
  "input.foreground": "#3B3B3B",
  "input.placeholderForeground": "#767676",
  "inputOption.activeBackground": "#BED6ED",
  "inputOption.activeBorder": "#005FB8",
  "inputOption.activeForeground": "#000000",
  "keybindingLabel.foreground": "#3B3B3B",
  "list.activeSelectionBackground": "#E8E8E8",
  "list.activeSelectionForeground": "#000000",
  "list.activeSelectionIconForeground": "#000000",
  "list.focusAndSelectionOutline": "#005FB8",
  "list.hoverBackground": "#F2F2F2",
  "menu.border": "#CECECE",
  "menu.selectionBackground": "#005FB8",
  "menu.selectionForeground": "#ffffff",
  "notebook.cellBorderColor": "#E5E5E5",
  "notebook.selectedCellBackground": "#C8DDF150",
  "notificationCenterHeader.background": "#FFFFFF",
  "notificationCenterHeader.foreground": "#3B3B3B",
  "notifications.background": "#FFFFFF",
  "notifications.border": "#E5E5E5",
  "notifications.foreground": "#3B3B3B",
  "panel.background": "#F8F8F8",
  "panel.border": "#E5E5E5",
  "panelInput.border": "#E5E5E5",
  "panelTitle.activeBorder": "#005FB8",
  "panelTitle.activeForeground": "#3B3B3B",
  "panelTitle.inactiveForeground": "#3B3B3B",
  "peekViewEditor.matchHighlightBackground": "#BB800966",
  "peekViewResult.background": "#FFFFFF",
  "peekViewResult.matchHighlightBackground": "#BB800966",
  "pickerGroup.border": "#E5E5E5",
  "pickerGroup.foreground": "#8B949E",
  "ports.iconRunningProcessForeground": "#369432",
  "progressBar.background": "#005FB8",
  "quickInput.background": "#F8F8F8",
  "quickInput.foreground": "#3B3B3B",
  "searchEditor.textInputBorder": "#CECECE",
  "settings.dropdownBackground": "#FFFFFF",
  "settings.dropdownBorder": "#CECECE",
  "settings.headerForeground": "#1F1F1F",
  "settings.modifiedItemIndicator": "#BB800966",
  "settings.numberInputBorder": "#CECECE",
  "settings.textInputBorder": "#CECECE",
  "sideBar.background": "#F8F8F8",
  "sideBar.border": "#E5E5E5",
  "sideBar.foreground": "#3B3B3B",
  "sideBarSectionHeader.background": "#F8F8F8",
  "sideBarSectionHeader.border": "#E5E5E5",
  "sideBarSectionHeader.foreground": "#3B3B3B",
  "sideBarTitle.foreground": "#3B3B3B",
  "statusBar.background": "#F8F8F8",
  "statusBar.border": "#E5E5E5",
  "statusBar.debuggingBackground": "#FD716C",
  "statusBar.debuggingForeground": "#000000",
  "statusBar.focusBorder": "#005FB8",
  "statusBar.foreground": "#3B3B3B",
  "statusBar.noFolderBackground": "#F8F8F8",
  "statusBarItem.compactHoverBackground": "#CCCCCC",
  "statusBarItem.errorBackground": "#C72E0F",
  "statusBarItem.focusBorder": "#005FB8",
  "statusBarItem.hoverBackground": "#B8B8B850",
  "statusBarItem.prominentBackground": "#6E768166",
  "statusBarItem.remoteBackground": "#005FB8",
  "statusBarItem.remoteForeground": "#FFFFFF",
  "tab.activeBackground": "#FFFFFF",
  "tab.activeBorder": "#F8F8F8",
  "tab.activeBorderTop": "#005FB8",
  "tab.activeForeground": "#3B3B3B",
  "tab.border": "#E5E5E5",
  "tab.hoverBackground": "#FFFFFF",
  "tab.inactiveBackground": "#F8F8F8",
  "tab.inactiveForeground": "#868686",
  "tab.lastPinnedBorder": "#D4D4D4",
  "tab.selectedBackground": "#E4E6F1",
  "tab.selectedBorderTop": "#68a3da",
  "tab.selectedForeground": "#333333",
  "tab.unfocusedActiveBorder": "#F8F8F8",
  "tab.unfocusedActiveBorderTop": "#E5E5E5",
  "tab.unfocusedHoverBackground": "#F8F8F8",
  "terminal.foreground": "#3B3B3B",
  "terminal.inactiveSelectionBackground": "#E5EBF1",
  "terminal.tab.activeBorder": "#005FB8",
  "terminalCursor.foreground": "#005FB8",
  "textBlockQuote.background": "#F8F8F8",
  "textBlockQuote.border": "#E5E5E5",
  "textCodeBlock.background": "#F8F8F8",
  "textLink.activeForeground": "#005FB8",
  "textLink.foreground": "#005FB8",
  "textPreformat.background": "#0000001F",
  "textPreformat.foreground": "#3B3B3B",
  "textSeparator.foreground": "#21262D",
  "titleBar.activeBackground": "#F8F8F8",
  "titleBar.activeForeground": "#1E1E1E",
  "titleBar.border": "#E5E5E5",
  "titleBar.inactiveBackground": "#F8F8F8",
  "titleBar.inactiveForeground": "#8B949E",
  "welcomePage.tileBackground": "#F3F3F3",
  "widget.border": "#E5E5E5"
};
var ExtensionData;
((ExtensionData2) => {
  function toJSONObject(d) {
    return d && { _extensionId: d.extensionId, _extensionIsBuiltin: d.extensionIsBuiltin, _extensionName: d.extensionName, _extensionPublisher: d.extensionPublisher };
  }
  ExtensionData2.toJSONObject = toJSONObject;
  function fromJSONObject(o) {
    if (o && isString(o._extensionId) && isBoolean(o._extensionIsBuiltin) && isString(o._extensionName) && isString(o._extensionPublisher)) {
      return { extensionId: o._extensionId, extensionIsBuiltin: o._extensionIsBuiltin, extensionName: o._extensionName, extensionPublisher: o._extensionPublisher };
    }
    return void 0;
  }
  ExtensionData2.fromJSONObject = fromJSONObject;
  function fromName(publisher, name, isBuiltin = false) {
    return { extensionPublisher: publisher, extensionId: `${publisher}.${name}`, extensionName: name, extensionIsBuiltin: isBuiltin };
  }
  ExtensionData2.fromName = fromName;
})(ExtensionData || (ExtensionData = {}));
export {
  COLOR_THEME_DARK_INITIAL_COLORS,
  COLOR_THEME_LIGHT_INITIAL_COLORS,
  ExtensionData,
  IWorkbenchThemeService,
  THEME_SCOPE_CLOSE_PAREN,
  THEME_SCOPE_OPEN_PAREN,
  THEME_SCOPE_WILDCARD,
  ThemeSettingDefaults,
  ThemeSettings,
  migrateThemeSettingsId,
  themeScopeRegex
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0aGVtZXNcXGNvbW1vblxcd29ya2JlbmNoVGhlbWVTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcmVmaW5lU2VydmljZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IElDb2xvclRoZW1lLCBJVGhlbWVTZXJ2aWNlLCBJRmlsZUljb25UaGVtZSwgSVByb2R1Y3RJY29uVGhlbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGlzQm9vbGVhbiwgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJY29uQ29udHJpYnV0aW9uLCBJY29uRGVmaW5pdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29sb3JTY2hlbWUsIFRoZW1lVHlwZVNlbGVjdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcblxuZXhwb3J0IGNvbnN0IElXb3JrYmVuY2hUaGVtZVNlcnZpY2UgPSByZWZpbmVTZXJ2aWNlRGVjb3JhdG9yPElUaGVtZVNlcnZpY2UsIElXb3JrYmVuY2hUaGVtZVNlcnZpY2U+KElUaGVtZVNlcnZpY2UpO1xuXG5leHBvcnQgY29uc3QgVEhFTUVfU0NPUEVfT1BFTl9QQVJFTiA9ICdbJztcbmV4cG9ydCBjb25zdCBUSEVNRV9TQ09QRV9DTE9TRV9QQVJFTiA9ICddJztcbmV4cG9ydCBjb25zdCBUSEVNRV9TQ09QRV9XSUxEQ0FSRCA9ICcqJztcblxuZXhwb3J0IGNvbnN0IHRoZW1lU2NvcGVSZWdleCA9IC9cXFsoLis/KVxcXS9nO1xuXG5leHBvcnQgZW51bSBUaGVtZVNldHRpbmdzIHtcblx0Q09MT1JfVEhFTUUgPSAnd29ya2JlbmNoLmNvbG9yVGhlbWUnLFxuXHRGSUxFX0lDT05fVEhFTUUgPSAnd29ya2JlbmNoLmljb25UaGVtZScsXG5cdFBST0RVQ1RfSUNPTl9USEVNRSA9ICd3b3JrYmVuY2gucHJvZHVjdEljb25UaGVtZScsXG5cdENPTE9SX0NVU1RPTUlaQVRJT05TID0gJ3dvcmtiZW5jaC5jb2xvckN1c3RvbWl6YXRpb25zJyxcblx0VE9LRU5fQ09MT1JfQ1VTVE9NSVpBVElPTlMgPSAnZWRpdG9yLnRva2VuQ29sb3JDdXN0b21pemF0aW9ucycsXG5cdFNFTUFOVElDX1RPS0VOX0NPTE9SX0NVU1RPTUlaQVRJT05TID0gJ2VkaXRvci5zZW1hbnRpY1Rva2VuQ29sb3JDdXN0b21pemF0aW9ucycsXG5cblx0UFJFRkVSUkVEX0RBUktfVEhFTUUgPSAnd29ya2JlbmNoLnByZWZlcnJlZERhcmtDb2xvclRoZW1lJyxcblx0UFJFRkVSUkVEX0xJR0hUX1RIRU1FID0gJ3dvcmtiZW5jaC5wcmVmZXJyZWRMaWdodENvbG9yVGhlbWUnLFxuXHRQUkVGRVJSRURfSENfREFSS19USEVNRSA9ICd3b3JrYmVuY2gucHJlZmVycmVkSGlnaENvbnRyYXN0Q29sb3JUaGVtZScsIC8qIGlkIGtlcHQgZm9yIGNvbXBhdGliaWxpdHkgcmVhc29ucyAqL1xuXHRQUkVGRVJSRURfSENfTElHSFRfVEhFTUUgPSAnd29ya2JlbmNoLnByZWZlcnJlZEhpZ2hDb250cmFzdExpZ2h0Q29sb3JUaGVtZScsXG5cdERFVEVDVF9DT0xPUl9TQ0hFTUUgPSAnd2luZG93LmF1dG9EZXRlY3RDb2xvclNjaGVtZScsXG5cdERFVEVDVF9IQyA9ICd3aW5kb3cuYXV0b0RldGVjdEhpZ2hDb250cmFzdCcsXG5cblx0U1lTVEVNX0NPTE9SX1RIRU1FID0gJ3dpbmRvdy5zeXN0ZW1Db2xvclRoZW1lJ1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRoZW1lU2V0dGluZ0RlZmF1bHRzIHtcblx0ZXhwb3J0IGNvbnN0IENPTE9SX1RIRU1FX0RBUksgPSAnRGFyayAyMDI2Jztcblx0ZXhwb3J0IGNvbnN0IENPTE9SX1RIRU1FX0xJR0hUID0gJ0xpZ2h0IDIwMjYnO1xuXHRleHBvcnQgY29uc3QgQ09MT1JfVEhFTUVfSENfREFSSyA9ICdEZWZhdWx0IEhpZ2ggQ29udHJhc3QnO1xuXHRleHBvcnQgY29uc3QgQ09MT1JfVEhFTUVfSENfTElHSFQgPSAnRGVmYXVsdCBIaWdoIENvbnRyYXN0IExpZ2h0JztcblxuXHRleHBvcnQgY29uc3QgRklMRV9JQ09OX1RIRU1FID0gJ3ZzLXNldGknO1xuXHRleHBvcnQgY29uc3QgUFJPRFVDVF9JQ09OX1RIRU1FID0gJ0RlZmF1bHQnO1xufVxuXG4vKipcbiAqIE1pZ3JhdGVzIGxlZ2FjeSB0aGVtZSBzZXR0aW5ncyBJRHMgdG8gdGhlaXIgY3VycmVudCBlcXVpdmFsZW50cy5cbiAqIFRoZW1lIElEcyB3ZXJlIHNpbXBsaWZpZWQ6IFwiRGVmYXVsdFwiIHByZWZpeCB3YXMgcmVtb3ZlZCBmcm9tIGJ1aWx0LWluIHRoZW1lcyxcbiAqIGFuZCBcIkV4cGVyaW1lbnRhbFwiIHByZWZpeCB3YXMgcmVwbGFjZWQgd2hlbiBWUyBDb2RlIHRoZW1lcyBiZWNhbWUgR0EuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtaWdyYXRlVGhlbWVTZXR0aW5nc0lkKHNldHRpbmdzSWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHN3aXRjaCAoc2V0dGluZ3NJZCkge1xuXHRcdGNhc2UgJ0RlZmF1bHQgRGFyayBNb2Rlcm4nOiByZXR1cm4gJ0RhcmsgTW9kZXJuJztcblx0XHRjYXNlICdEZWZhdWx0IExpZ2h0IE1vZGVybic6IHJldHVybiAnTGlnaHQgTW9kZXJuJztcblx0XHRjYXNlICdEZWZhdWx0IERhcmsrJzogcmV0dXJuICdEYXJrKyc7XG5cdFx0Y2FzZSAnRGVmYXVsdCBMaWdodCsnOiByZXR1cm4gJ0xpZ2h0Kyc7XG5cdFx0Y2FzZSAnRXhwZXJpbWVudGFsIERhcmsnOlxuXHRcdGNhc2UgJ1ZTIENvZGUgRGFyayc6XG5cdFx0XHRyZXR1cm4gVGhlbWVTZXR0aW5nRGVmYXVsdHMuQ09MT1JfVEhFTUVfREFSSztcblx0XHRjYXNlICdFeHBlcmltZW50YWwgTGlnaHQnOlxuXHRcdGNhc2UgJ1ZTIENvZGUgTGlnaHQnOlxuXHRcdFx0cmV0dXJuIFRoZW1lU2V0dGluZ0RlZmF1bHRzLkNPTE9SX1RIRU1FX0xJR0hUO1xuXHR9XG5cdHJldHVybiBzZXR0aW5nc0lkO1xufVxuXG5leHBvcnQgY29uc3QgQ09MT1JfVEhFTUVfREFSS19JTklUSUFMX0NPTE9SUyA9IHtcblx0J2FjdGlvbkJhci50b2dnbGVkQmFja2dyb3VuZCc6ICcjMzgzYTQ5Jyxcblx0J2FjdGl2aXR5QmFyLmFjdGl2ZUJvcmRlcic6ICcjMDA3OEQ0Jyxcblx0J2FjdGl2aXR5QmFyLmJhY2tncm91bmQnOiAnIzE4MTgxOCcsXG5cdCdhY3Rpdml0eUJhci5ib3JkZXInOiAnIzJCMkIyQicsXG5cdCdhY3Rpdml0eUJhci5mb3JlZ3JvdW5kJzogJyNEN0Q3RDcnLFxuXHQnYWN0aXZpdHlCYXIuaW5hY3RpdmVGb3JlZ3JvdW5kJzogJyM4Njg2ODYnLFxuXHQnYWN0aXZpdHlCYXJCYWRnZS5iYWNrZ3JvdW5kJzogJyMwMDc4RDQnLFxuXHQnYWN0aXZpdHlCYXJCYWRnZS5mb3JlZ3JvdW5kJzogJyNGRkZGRkYnLFxuXHQnYmFkZ2UuYmFja2dyb3VuZCc6ICcjNjE2MTYxJyxcblx0J2JhZGdlLmZvcmVncm91bmQnOiAnI0Y4RjhGOCcsXG5cdCdidXR0b24uYmFja2dyb3VuZCc6ICcjMDA3OEQ0Jyxcblx0J2J1dHRvbi5ib3JkZXInOiAnI0ZGRkZGRjEyJyxcblx0J2J1dHRvbi5mb3JlZ3JvdW5kJzogJyNGRkZGRkYnLFxuXHQnYnV0dG9uLmhvdmVyQmFja2dyb3VuZCc6ICcjMDI2RUMxJyxcblx0J2J1dHRvbi5zZWNvbmRhcnlCYWNrZ3JvdW5kJzogJyMzMTMxMzEnLFxuXHQnYnV0dG9uLnNlY29uZGFyeUZvcmVncm91bmQnOiAnI0NDQ0NDQycsXG5cdCdidXR0b24uc2Vjb25kYXJ5SG92ZXJCYWNrZ3JvdW5kJzogJyMzQzNDM0MnLFxuXHQnY2hhdC5zbGFzaENvbW1hbmRCYWNrZ3JvdW5kJzogJyMyNjQ3Nzg2NicsXG5cdCdjaGF0LnNsYXNoQ29tbWFuZEZvcmVncm91bmQnOiAnIzg1QjZGRicsXG5cdCdjaGF0LmVkaXRlZEZpbGVGb3JlZ3JvdW5kJzogJyNFMkMwOEQnLFxuXHQnY2hlY2tib3guYmFja2dyb3VuZCc6ICcjMzEzMTMxJyxcblx0J2NoZWNrYm94LmJvcmRlcic6ICcjM0MzQzNDJyxcblx0J2RlYnVnVG9vbEJhci5iYWNrZ3JvdW5kJzogJyMxODE4MTgnLFxuXHQnZGVzY3JpcHRpb25Gb3JlZ3JvdW5kJzogJyM5RDlEOUQnLFxuXHQnZHJvcGRvd24uYmFja2dyb3VuZCc6ICcjMzEzMTMxJyxcblx0J2Ryb3Bkb3duLmJvcmRlcic6ICcjM0MzQzNDJyxcblx0J2Ryb3Bkb3duLmZvcmVncm91bmQnOiAnI0NDQ0NDQycsXG5cdCdkcm9wZG93bi5saXN0QmFja2dyb3VuZCc6ICcjMUYxRjFGJyxcblx0J2VkaXRvci5iYWNrZ3JvdW5kJzogJyMxRjFGMUYnLFxuXHQnZWRpdG9yLmZpbmRNYXRjaEJhY2tncm91bmQnOiAnIzlFNkEwMycsXG5cdCdlZGl0b3IuZm9yZWdyb3VuZCc6ICcjQ0NDQ0NDJyxcblx0J2VkaXRvci5pbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQnOiAnIzNBM0Q0MScsXG5cdCdlZGl0b3Iuc2VsZWN0aW9uSGlnaGxpZ2h0QmFja2dyb3VuZCc6ICcjQURENkZGMjYnLFxuXHQnZWRpdG9yR3JvdXAuYm9yZGVyJzogJyNGRkZGRkYxNycsXG5cdCdlZGl0b3JHcm91cEhlYWRlci50YWJzQmFja2dyb3VuZCc6ICcjMTgxODE4Jyxcblx0J2VkaXRvckdyb3VwSGVhZGVyLnRhYnNCb3JkZXInOiAnIzJCMkIyQicsXG5cdCdlZGl0b3JHdXR0ZXIuYWRkZWRCYWNrZ3JvdW5kJzogJyMyRUEwNDMnLFxuXHQnZWRpdG9yR3V0dGVyLmRlbGV0ZWRCYWNrZ3JvdW5kJzogJyNGODUxNDknLFxuXHQnZWRpdG9yR3V0dGVyLm1vZGlmaWVkQmFja2dyb3VuZCc6ICcjMDA3OEQ0Jyxcblx0J2VkaXRvckluZGVudEd1aWRlLmFjdGl2ZUJhY2tncm91bmQxJzogJyM3MDcwNzAnLFxuXHQnZWRpdG9ySW5kZW50R3VpZGUuYmFja2dyb3VuZDEnOiAnIzQwNDA0MCcsXG5cdCdlZGl0b3JMaW5lTnVtYmVyLmFjdGl2ZUZvcmVncm91bmQnOiAnI0NDQ0NDQycsXG5cdCdlZGl0b3JMaW5lTnVtYmVyLmZvcmVncm91bmQnOiAnIzZFNzY4MScsXG5cdCdlZGl0b3JPdmVydmlld1J1bGVyLmJvcmRlcic6ICcjMDEwNDA5Jyxcblx0J2VkaXRvcldpZGdldC5iYWNrZ3JvdW5kJzogJyMyMDIwMjAnLFxuXHQnZXJyb3JGb3JlZ3JvdW5kJzogJyNGODUxNDknLFxuXHQnZm9jdXNCb3JkZXInOiAnIzAwNzhENCcsXG5cdCdmb3JlZ3JvdW5kJzogJyNDQ0NDQ0MnLFxuXHQnaWNvbi5mb3JlZ3JvdW5kJzogJyNDQ0NDQ0MnLFxuXHQnaW5wdXQuYmFja2dyb3VuZCc6ICcjMzEzMTMxJyxcblx0J2lucHV0LmJvcmRlcic6ICcjM0MzQzNDJyxcblx0J2lucHV0LmZvcmVncm91bmQnOiAnI0NDQ0NDQycsXG5cdCdpbnB1dC5wbGFjZWhvbGRlckZvcmVncm91bmQnOiAnIzk4OTg5OCcsXG5cdCdpbnB1dE9wdGlvbi5hY3RpdmVCYWNrZ3JvdW5kJzogJyMyNDg5REI4MicsXG5cdCdpbnB1dE9wdGlvbi5hY3RpdmVCb3JkZXInOiAnIzI0ODhEQicsXG5cdCdrZXliaW5kaW5nTGFiZWwuZm9yZWdyb3VuZCc6ICcjQ0NDQ0NDJyxcblx0J2xpc3QuYWN0aXZlU2VsZWN0aW9uSWNvbkZvcmVncm91bmQnOiAnI0ZGRicsXG5cdCdsaXN0LmRyb3BCYWNrZ3JvdW5kJzogJyMzODNCM0QnLFxuXHQnbWVudS5iYWNrZ3JvdW5kJzogJyMxRjFGMUYnLFxuXHQnbWVudS5ib3JkZXInOiAnIzQ1NDU0NScsXG5cdCdtZW51LmZvcmVncm91bmQnOiAnI0NDQ0NDQycsXG5cdCdtZW51LnNlbGVjdGlvbkJhY2tncm91bmQnOiAnIzAwNzhkNCcsXG5cdCdtZW51LnNlcGFyYXRvckJhY2tncm91bmQnOiAnIzQ1NDU0NScsXG5cdCdub3RpZmljYXRpb25DZW50ZXJIZWFkZXIuYmFja2dyb3VuZCc6ICcjMUYxRjFGJyxcblx0J25vdGlmaWNhdGlvbkNlbnRlckhlYWRlci5mb3JlZ3JvdW5kJzogJyNDQ0NDQ0MnLFxuXHQnbm90aWZpY2F0aW9ucy5iYWNrZ3JvdW5kJzogJyMxRjFGMUYnLFxuXHQnbm90aWZpY2F0aW9ucy5ib3JkZXInOiAnIzJCMkIyQicsXG5cdCdub3RpZmljYXRpb25zLmZvcmVncm91bmQnOiAnI0NDQ0NDQycsXG5cdCdwYW5lbC5iYWNrZ3JvdW5kJzogJyMxODE4MTgnLFxuXHQncGFuZWwuYm9yZGVyJzogJyMyQjJCMkInLFxuXHQncGFuZWxJbnB1dC5ib3JkZXInOiAnIzJCMkIyQicsXG5cdCdwYW5lbFRpdGxlLmFjdGl2ZUJvcmRlcic6ICcjMDA3OEQ0Jyxcblx0J3BhbmVsVGl0bGUuYWN0aXZlRm9yZWdyb3VuZCc6ICcjQ0NDQ0NDJyxcblx0J3BhbmVsVGl0bGUuaW5hY3RpdmVGb3JlZ3JvdW5kJzogJyM5RDlEOUQnLFxuXHQncGVla1ZpZXdFZGl0b3IuYmFja2dyb3VuZCc6ICcjMUYxRjFGJyxcblx0J3BlZWtWaWV3RWRpdG9yLm1hdGNoSGlnaGxpZ2h0QmFja2dyb3VuZCc6ICcjQkI4MDA5NjYnLFxuXHQncGVla1ZpZXdSZXN1bHQuYmFja2dyb3VuZCc6ICcjMUYxRjFGJyxcblx0J3BlZWtWaWV3UmVzdWx0Lm1hdGNoSGlnaGxpZ2h0QmFja2dyb3VuZCc6ICcjQkI4MDA5NjYnLFxuXHQncGlja2VyR3JvdXAuYm9yZGVyJzogJyMzQzNDM0MnLFxuXHQncG9ydHMuaWNvblJ1bm5pbmdQcm9jZXNzRm9yZWdyb3VuZCc6ICcjMzY5NDMyJyxcblx0J3Byb2dyZXNzQmFyLmJhY2tncm91bmQnOiAnIzAwNzhENCcsXG5cdCdxdWlja0lucHV0LmJhY2tncm91bmQnOiAnIzIyMjIyMicsXG5cdCdxdWlja0lucHV0LmZvcmVncm91bmQnOiAnI0NDQ0NDQycsXG5cdCdzZXR0aW5ncy5kcm9wZG93bkJhY2tncm91bmQnOiAnIzMxMzEzMScsXG5cdCdzZXR0aW5ncy5kcm9wZG93bkJvcmRlcic6ICcjM0MzQzNDJyxcblx0J3NldHRpbmdzLmhlYWRlckZvcmVncm91bmQnOiAnI0ZGRkZGRicsXG5cdCdzZXR0aW5ncy5tb2RpZmllZEl0ZW1JbmRpY2F0b3InOiAnI0JCODAwOTY2Jyxcblx0J3NpZGVCYXIuYmFja2dyb3VuZCc6ICcjMTgxODE4Jyxcblx0J3NpZGVCYXIuYm9yZGVyJzogJyMyQjJCMkInLFxuXHQnc2lkZUJhci5mb3JlZ3JvdW5kJzogJyNDQ0NDQ0MnLFxuXHQnc2lkZUJhclNlY3Rpb25IZWFkZXIuYmFja2dyb3VuZCc6ICcjMTgxODE4Jyxcblx0J3NpZGVCYXJTZWN0aW9uSGVhZGVyLmJvcmRlcic6ICcjMkIyQjJCJyxcblx0J3NpZGVCYXJTZWN0aW9uSGVhZGVyLmZvcmVncm91bmQnOiAnI0NDQ0NDQycsXG5cdCdzaWRlQmFyVGl0bGUuZm9yZWdyb3VuZCc6ICcjQ0NDQ0NDJyxcblx0J3N0YXR1c0Jhci5iYWNrZ3JvdW5kJzogJyMxODE4MTgnLFxuXHQnc3RhdHVzQmFyLmJvcmRlcic6ICcjMkIyQjJCJyxcblx0J3N0YXR1c0Jhci5kZWJ1Z2dpbmdCYWNrZ3JvdW5kJzogJyMwMDc4RDQnLFxuXHQnc3RhdHVzQmFyLmRlYnVnZ2luZ0ZvcmVncm91bmQnOiAnI0ZGRkZGRicsXG5cdCdzdGF0dXNCYXIuZm9jdXNCb3JkZXInOiAnIzAwNzhENCcsXG5cdCdzdGF0dXNCYXIuZm9yZWdyb3VuZCc6ICcjQ0NDQ0NDJyxcblx0J3N0YXR1c0Jhci5ub0ZvbGRlckJhY2tncm91bmQnOiAnIzFGMUYxRicsXG5cdCdzdGF0dXNCYXJJdGVtLmZvY3VzQm9yZGVyJzogJyMwMDc4RDQnLFxuXHQnc3RhdHVzQmFySXRlbS5wcm9taW5lbnRCYWNrZ3JvdW5kJzogJyM2RTc2ODE2NicsXG5cdCdzdGF0dXNCYXJJdGVtLnJlbW90ZUJhY2tncm91bmQnOiAnIzAwNzhENCcsXG5cdCdzdGF0dXNCYXJJdGVtLnJlbW90ZUZvcmVncm91bmQnOiAnI0ZGRkZGRicsXG5cdCd0YWIuYWN0aXZlQmFja2dyb3VuZCc6ICcjMUYxRjFGJyxcblx0J3RhYi5hY3RpdmVCb3JkZXInOiAnIzFGMUYxRicsXG5cdCd0YWIuYWN0aXZlQm9yZGVyVG9wJzogJyMwMDc4RDQnLFxuXHQndGFiLmFjdGl2ZUZvcmVncm91bmQnOiAnI0ZGRkZGRicsXG5cdCd0YWIuYm9yZGVyJzogJyMyQjJCMkInLFxuXHQndGFiLmhvdmVyQmFja2dyb3VuZCc6ICcjMUYxRjFGJyxcblx0J3RhYi5pbmFjdGl2ZUJhY2tncm91bmQnOiAnIzE4MTgxOCcsXG5cdCd0YWIuaW5hY3RpdmVGb3JlZ3JvdW5kJzogJyM5RDlEOUQnLFxuXHQndGFiLmxhc3RQaW5uZWRCb3JkZXInOiAnI2NjYzMnLFxuXHQndGFiLnNlbGVjdGVkQmFja2dyb3VuZCc6ICcjMzczNzNEJyxcblx0J3RhYi5zZWxlY3RlZEJvcmRlclRvcCc6ICcjNmNhZGRmJyxcblx0J3RhYi5zZWxlY3RlZEZvcmVncm91bmQnOiAnI0ZGRkZGRicsXG5cdCd0YWIudW5mb2N1c2VkQWN0aXZlQm9yZGVyJzogJyMxRjFGMUYnLFxuXHQndGFiLnVuZm9jdXNlZEFjdGl2ZUJvcmRlclRvcCc6ICcjMkIyQjJCJyxcblx0J3RhYi51bmZvY3VzZWRIb3ZlckJhY2tncm91bmQnOiAnIzFGMUYxRicsXG5cdCd0ZXJtaW5hbC5mb3JlZ3JvdW5kJzogJyNDQ0NDQ0MnLFxuXHQndGVybWluYWwuaW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kJzogJyMzQTNENDEnLFxuXHQndGVybWluYWwudGFiLmFjdGl2ZUJvcmRlcic6ICcjMDA3OEQ0Jyxcblx0J3RleHRCbG9ja1F1b3RlLmJhY2tncm91bmQnOiAnIzJCMkIyQicsXG5cdCd0ZXh0QmxvY2tRdW90ZS5ib3JkZXInOiAnIzYxNjE2MScsXG5cdCd0ZXh0Q29kZUJsb2NrLmJhY2tncm91bmQnOiAnIzJCMkIyQicsXG5cdCd0ZXh0TGluay5hY3RpdmVGb3JlZ3JvdW5kJzogJyM0ZGFhZmMnLFxuXHQndGV4dExpbmsuZm9yZWdyb3VuZCc6ICcjNGRhYWZjJyxcblx0J3RleHRQcmVmb3JtYXQuYmFja2dyb3VuZCc6ICcjM0MzQzNDJyxcblx0J3RleHRQcmVmb3JtYXQuZm9yZWdyb3VuZCc6ICcjRDBEMEQwJyxcblx0J3RleHRTZXBhcmF0b3IuZm9yZWdyb3VuZCc6ICcjMjEyNjJEJyxcblx0J3RpdGxlQmFyLmFjdGl2ZUJhY2tncm91bmQnOiAnIzE4MTgxOCcsXG5cdCd0aXRsZUJhci5hY3RpdmVGb3JlZ3JvdW5kJzogJyNDQ0NDQ0MnLFxuXHQndGl0bGVCYXIuYm9yZGVyJzogJyMyQjJCMkInLFxuXHQndGl0bGVCYXIuaW5hY3RpdmVCYWNrZ3JvdW5kJzogJyMxRjFGMUYnLFxuXHQndGl0bGVCYXIuaW5hY3RpdmVGb3JlZ3JvdW5kJzogJyM5RDlEOUQnLFxuXHQnd2VsY29tZVBhZ2UucHJvZ3Jlc3MuZm9yZWdyb3VuZCc6ICcjMDA3OEQ0Jyxcblx0J3dlbGNvbWVQYWdlLnRpbGVCYWNrZ3JvdW5kJzogJyMyQjJCMkInLFxuXHQnd2lkZ2V0LmJvcmRlcic6ICcjMzEzMTMxJ1xufTtcblxuZXhwb3J0IGNvbnN0IENPTE9SX1RIRU1FX0xJR0hUX0lOSVRJQUxfQ09MT1JTID0ge1xuXHQnYWN0aW9uQmFyLnRvZ2dsZWRCYWNrZ3JvdW5kJzogJyNkZGRkZGQnLFxuXHQnYWN0aXZpdHlCYXIuYWN0aXZlQm9yZGVyJzogJyMwMDVGQjgnLFxuXHQnYWN0aXZpdHlCYXIuYmFja2dyb3VuZCc6ICcjRjhGOEY4Jyxcblx0J2FjdGl2aXR5QmFyLmJvcmRlcic6ICcjRTVFNUU1Jyxcblx0J2FjdGl2aXR5QmFyLmZvcmVncm91bmQnOiAnIzFGMUYxRicsXG5cdCdhY3Rpdml0eUJhci5pbmFjdGl2ZUZvcmVncm91bmQnOiAnIzYxNjE2MScsXG5cdCdhY3Rpdml0eUJhckJhZGdlLmJhY2tncm91bmQnOiAnIzAwNUZCOCcsXG5cdCdhY3Rpdml0eUJhckJhZGdlLmZvcmVncm91bmQnOiAnI0ZGRkZGRicsXG5cdCdiYWRnZS5iYWNrZ3JvdW5kJzogJyNDQ0NDQ0MnLFxuXHQnYmFkZ2UuZm9yZWdyb3VuZCc6ICcjM0IzQjNCJyxcblx0J2J1dHRvbi5iYWNrZ3JvdW5kJzogJyMwMDVGQjgnLFxuXHQnYnV0dG9uLmJvcmRlcic6ICcjMDAwMDAwMWEnLFxuXHQnYnV0dG9uLmZvcmVncm91bmQnOiAnI0ZGRkZGRicsXG5cdCdidXR0b24uaG92ZXJCYWNrZ3JvdW5kJzogJyMwMjU4QTgnLFxuXHQnYnV0dG9uLnNlY29uZGFyeUJhY2tncm91bmQnOiAnI0U1RTVFNScsXG5cdCdidXR0b24uc2Vjb25kYXJ5Rm9yZWdyb3VuZCc6ICcjM0IzQjNCJyxcblx0J2J1dHRvbi5zZWNvbmRhcnlIb3ZlckJhY2tncm91bmQnOiAnI0NDQ0NDQycsXG5cdCdjaGF0LnNsYXNoQ29tbWFuZEJhY2tncm91bmQnOiAnI0FEQ0VGRjdBJyxcblx0J2NoYXQuc2xhc2hDb21tYW5kRm9yZWdyb3VuZCc6ICcjMjY1NjlFJyxcblx0J2NoYXQuZWRpdGVkRmlsZUZvcmVncm91bmQnOiAnIzg5NTUwMycsXG5cdCdjaGVja2JveC5iYWNrZ3JvdW5kJzogJyNGOEY4RjgnLFxuXHQnY2hlY2tib3guYm9yZGVyJzogJyNDRUNFQ0UnLFxuXHQnZGVzY3JpcHRpb25Gb3JlZ3JvdW5kJzogJyMzQjNCM0InLFxuXHQnZGlmZkVkaXRvci51bmNoYW5nZWRSZWdpb25CYWNrZ3JvdW5kJzogJyNmOGY4ZjgnLFxuXHQnZHJvcGRvd24uYmFja2dyb3VuZCc6ICcjRkZGRkZGJyxcblx0J2Ryb3Bkb3duLmJvcmRlcic6ICcjQ0VDRUNFJyxcblx0J2Ryb3Bkb3duLmZvcmVncm91bmQnOiAnIzNCM0IzQicsXG5cdCdkcm9wZG93bi5saXN0QmFja2dyb3VuZCc6ICcjRkZGRkZGJyxcblx0J2VkaXRvci5iYWNrZ3JvdW5kJzogJyNGRkZGRkYnLFxuXHQnZWRpdG9yLmZvcmVncm91bmQnOiAnIzNCM0IzQicsXG5cdCdlZGl0b3IuaW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kJzogJyNFNUVCRjEnLFxuXHQnZWRpdG9yLnNlbGVjdGlvbkhpZ2hsaWdodEJhY2tncm91bmQnOiAnI0FERDZGRjgwJyxcblx0J2VkaXRvckdyb3VwLmJvcmRlcic6ICcjRTVFNUU1Jyxcblx0J2VkaXRvckdyb3VwSGVhZGVyLnRhYnNCYWNrZ3JvdW5kJzogJyNGOEY4RjgnLFxuXHQnZWRpdG9yR3JvdXBIZWFkZXIudGFic0JvcmRlcic6ICcjRTVFNUU1Jyxcblx0J2VkaXRvckd1dHRlci5hZGRlZEJhY2tncm91bmQnOiAnIzJFQTA0MycsXG5cdCdlZGl0b3JHdXR0ZXIuZGVsZXRlZEJhY2tncm91bmQnOiAnI0Y4NTE0OScsXG5cdCdlZGl0b3JHdXR0ZXIubW9kaWZpZWRCYWNrZ3JvdW5kJzogJyMwMDVGQjgnLFxuXHQnZWRpdG9ySW5kZW50R3VpZGUuYWN0aXZlQmFja2dyb3VuZDEnOiAnIzkzOTM5MycsXG5cdCdlZGl0b3JJbmRlbnRHdWlkZS5iYWNrZ3JvdW5kMSc6ICcjRDNEM0QzJyxcblx0J2VkaXRvckxpbmVOdW1iZXIuYWN0aXZlRm9yZWdyb3VuZCc6ICcjMTcxMTg0Jyxcblx0J2VkaXRvckxpbmVOdW1iZXIuZm9yZWdyb3VuZCc6ICcjNkU3NjgxJyxcblx0J2VkaXRvck92ZXJ2aWV3UnVsZXIuYm9yZGVyJzogJyNFNUU1RTUnLFxuXHQnZWRpdG9yU3VnZ2VzdFdpZGdldC5iYWNrZ3JvdW5kJzogJyNGOEY4RjgnLFxuXHQnZWRpdG9yV2lkZ2V0LmJhY2tncm91bmQnOiAnI0Y4RjhGOCcsXG5cdCdlcnJvckZvcmVncm91bmQnOiAnI0Y4NTE0OScsXG5cdCdmb2N1c0JvcmRlcic6ICcjMDA1RkI4Jyxcblx0J2ZvcmVncm91bmQnOiAnIzNCM0IzQicsXG5cdCdpY29uLmZvcmVncm91bmQnOiAnIzNCM0IzQicsXG5cdCdpbnB1dC5iYWNrZ3JvdW5kJzogJyNGRkZGRkYnLFxuXHQnaW5wdXQuYm9yZGVyJzogJyNDRUNFQ0UnLFxuXHQnaW5wdXQuZm9yZWdyb3VuZCc6ICcjM0IzQjNCJyxcblx0J2lucHV0LnBsYWNlaG9sZGVyRm9yZWdyb3VuZCc6ICcjNzY3Njc2Jyxcblx0J2lucHV0T3B0aW9uLmFjdGl2ZUJhY2tncm91bmQnOiAnI0JFRDZFRCcsXG5cdCdpbnB1dE9wdGlvbi5hY3RpdmVCb3JkZXInOiAnIzAwNUZCOCcsXG5cdCdpbnB1dE9wdGlvbi5hY3RpdmVGb3JlZ3JvdW5kJzogJyMwMDAwMDAnLFxuXHQna2V5YmluZGluZ0xhYmVsLmZvcmVncm91bmQnOiAnIzNCM0IzQicsXG5cdCdsaXN0LmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQnOiAnI0U4RThFOCcsXG5cdCdsaXN0LmFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmQnOiAnIzAwMDAwMCcsXG5cdCdsaXN0LmFjdGl2ZVNlbGVjdGlvbkljb25Gb3JlZ3JvdW5kJzogJyMwMDAwMDAnLFxuXHQnbGlzdC5mb2N1c0FuZFNlbGVjdGlvbk91dGxpbmUnOiAnIzAwNUZCOCcsXG5cdCdsaXN0LmhvdmVyQmFja2dyb3VuZCc6ICcjRjJGMkYyJyxcblx0J21lbnUuYm9yZGVyJzogJyNDRUNFQ0UnLFxuXHQnbWVudS5zZWxlY3Rpb25CYWNrZ3JvdW5kJzogJyMwMDVGQjgnLFxuXHQnbWVudS5zZWxlY3Rpb25Gb3JlZ3JvdW5kJzogJyNmZmZmZmYnLFxuXHQnbm90ZWJvb2suY2VsbEJvcmRlckNvbG9yJzogJyNFNUU1RTUnLFxuXHQnbm90ZWJvb2suc2VsZWN0ZWRDZWxsQmFja2dyb3VuZCc6ICcjQzhEREYxNTAnLFxuXHQnbm90aWZpY2F0aW9uQ2VudGVySGVhZGVyLmJhY2tncm91bmQnOiAnI0ZGRkZGRicsXG5cdCdub3RpZmljYXRpb25DZW50ZXJIZWFkZXIuZm9yZWdyb3VuZCc6ICcjM0IzQjNCJyxcblx0J25vdGlmaWNhdGlvbnMuYmFja2dyb3VuZCc6ICcjRkZGRkZGJyxcblx0J25vdGlmaWNhdGlvbnMuYm9yZGVyJzogJyNFNUU1RTUnLFxuXHQnbm90aWZpY2F0aW9ucy5mb3JlZ3JvdW5kJzogJyMzQjNCM0InLFxuXHQncGFuZWwuYmFja2dyb3VuZCc6ICcjRjhGOEY4Jyxcblx0J3BhbmVsLmJvcmRlcic6ICcjRTVFNUU1Jyxcblx0J3BhbmVsSW5wdXQuYm9yZGVyJzogJyNFNUU1RTUnLFxuXHQncGFuZWxUaXRsZS5hY3RpdmVCb3JkZXInOiAnIzAwNUZCOCcsXG5cdCdwYW5lbFRpdGxlLmFjdGl2ZUZvcmVncm91bmQnOiAnIzNCM0IzQicsXG5cdCdwYW5lbFRpdGxlLmluYWN0aXZlRm9yZWdyb3VuZCc6ICcjM0IzQjNCJyxcblx0J3BlZWtWaWV3RWRpdG9yLm1hdGNoSGlnaGxpZ2h0QmFja2dyb3VuZCc6ICcjQkI4MDA5NjYnLFxuXHQncGVla1ZpZXdSZXN1bHQuYmFja2dyb3VuZCc6ICcjRkZGRkZGJyxcblx0J3BlZWtWaWV3UmVzdWx0Lm1hdGNoSGlnaGxpZ2h0QmFja2dyb3VuZCc6ICcjQkI4MDA5NjYnLFxuXHQncGlja2VyR3JvdXAuYm9yZGVyJzogJyNFNUU1RTUnLFxuXHQncGlja2VyR3JvdXAuZm9yZWdyb3VuZCc6ICcjOEI5NDlFJyxcblx0J3BvcnRzLmljb25SdW5uaW5nUHJvY2Vzc0ZvcmVncm91bmQnOiAnIzM2OTQzMicsXG5cdCdwcm9ncmVzc0Jhci5iYWNrZ3JvdW5kJzogJyMwMDVGQjgnLFxuXHQncXVpY2tJbnB1dC5iYWNrZ3JvdW5kJzogJyNGOEY4RjgnLFxuXHQncXVpY2tJbnB1dC5mb3JlZ3JvdW5kJzogJyMzQjNCM0InLFxuXHQnc2VhcmNoRWRpdG9yLnRleHRJbnB1dEJvcmRlcic6ICcjQ0VDRUNFJyxcblx0J3NldHRpbmdzLmRyb3Bkb3duQmFja2dyb3VuZCc6ICcjRkZGRkZGJyxcblx0J3NldHRpbmdzLmRyb3Bkb3duQm9yZGVyJzogJyNDRUNFQ0UnLFxuXHQnc2V0dGluZ3MuaGVhZGVyRm9yZWdyb3VuZCc6ICcjMUYxRjFGJyxcblx0J3NldHRpbmdzLm1vZGlmaWVkSXRlbUluZGljYXRvcic6ICcjQkI4MDA5NjYnLFxuXHQnc2V0dGluZ3MubnVtYmVySW5wdXRCb3JkZXInOiAnI0NFQ0VDRScsXG5cdCdzZXR0aW5ncy50ZXh0SW5wdXRCb3JkZXInOiAnI0NFQ0VDRScsXG5cdCdzaWRlQmFyLmJhY2tncm91bmQnOiAnI0Y4RjhGOCcsXG5cdCdzaWRlQmFyLmJvcmRlcic6ICcjRTVFNUU1Jyxcblx0J3NpZGVCYXIuZm9yZWdyb3VuZCc6ICcjM0IzQjNCJyxcblx0J3NpZGVCYXJTZWN0aW9uSGVhZGVyLmJhY2tncm91bmQnOiAnI0Y4RjhGOCcsXG5cdCdzaWRlQmFyU2VjdGlvbkhlYWRlci5ib3JkZXInOiAnI0U1RTVFNScsXG5cdCdzaWRlQmFyU2VjdGlvbkhlYWRlci5mb3JlZ3JvdW5kJzogJyMzQjNCM0InLFxuXHQnc2lkZUJhclRpdGxlLmZvcmVncm91bmQnOiAnIzNCM0IzQicsXG5cdCdzdGF0dXNCYXIuYmFja2dyb3VuZCc6ICcjRjhGOEY4Jyxcblx0J3N0YXR1c0Jhci5ib3JkZXInOiAnI0U1RTVFNScsXG5cdCdzdGF0dXNCYXIuZGVidWdnaW5nQmFja2dyb3VuZCc6ICcjRkQ3MTZDJyxcblx0J3N0YXR1c0Jhci5kZWJ1Z2dpbmdGb3JlZ3JvdW5kJzogJyMwMDAwMDAnLFxuXHQnc3RhdHVzQmFyLmZvY3VzQm9yZGVyJzogJyMwMDVGQjgnLFxuXHQnc3RhdHVzQmFyLmZvcmVncm91bmQnOiAnIzNCM0IzQicsXG5cdCdzdGF0dXNCYXIubm9Gb2xkZXJCYWNrZ3JvdW5kJzogJyNGOEY4RjgnLFxuXHQnc3RhdHVzQmFySXRlbS5jb21wYWN0SG92ZXJCYWNrZ3JvdW5kJzogJyNDQ0NDQ0MnLFxuXHQnc3RhdHVzQmFySXRlbS5lcnJvckJhY2tncm91bmQnOiAnI0M3MkUwRicsXG5cdCdzdGF0dXNCYXJJdGVtLmZvY3VzQm9yZGVyJzogJyMwMDVGQjgnLFxuXHQnc3RhdHVzQmFySXRlbS5ob3ZlckJhY2tncm91bmQnOiAnI0I4QjhCODUwJyxcblx0J3N0YXR1c0Jhckl0ZW0ucHJvbWluZW50QmFja2dyb3VuZCc6ICcjNkU3NjgxNjYnLFxuXHQnc3RhdHVzQmFySXRlbS5yZW1vdGVCYWNrZ3JvdW5kJzogJyMwMDVGQjgnLFxuXHQnc3RhdHVzQmFySXRlbS5yZW1vdGVGb3JlZ3JvdW5kJzogJyNGRkZGRkYnLFxuXHQndGFiLmFjdGl2ZUJhY2tncm91bmQnOiAnI0ZGRkZGRicsXG5cdCd0YWIuYWN0aXZlQm9yZGVyJzogJyNGOEY4RjgnLFxuXHQndGFiLmFjdGl2ZUJvcmRlclRvcCc6ICcjMDA1RkI4Jyxcblx0J3RhYi5hY3RpdmVGb3JlZ3JvdW5kJzogJyMzQjNCM0InLFxuXHQndGFiLmJvcmRlcic6ICcjRTVFNUU1Jyxcblx0J3RhYi5ob3ZlckJhY2tncm91bmQnOiAnI0ZGRkZGRicsXG5cdCd0YWIuaW5hY3RpdmVCYWNrZ3JvdW5kJzogJyNGOEY4RjgnLFxuXHQndGFiLmluYWN0aXZlRm9yZWdyb3VuZCc6ICcjODY4Njg2Jyxcblx0J3RhYi5sYXN0UGlubmVkQm9yZGVyJzogJyNENEQ0RDQnLFxuXHQndGFiLnNlbGVjdGVkQmFja2dyb3VuZCc6ICcjRTRFNkYxJyxcblx0J3RhYi5zZWxlY3RlZEJvcmRlclRvcCc6ICcjNjhhM2RhJyxcblx0J3RhYi5zZWxlY3RlZEZvcmVncm91bmQnOiAnIzMzMzMzMycsXG5cdCd0YWIudW5mb2N1c2VkQWN0aXZlQm9yZGVyJzogJyNGOEY4RjgnLFxuXHQndGFiLnVuZm9jdXNlZEFjdGl2ZUJvcmRlclRvcCc6ICcjRTVFNUU1Jyxcblx0J3RhYi51bmZvY3VzZWRIb3ZlckJhY2tncm91bmQnOiAnI0Y4RjhGOCcsXG5cdCd0ZXJtaW5hbC5mb3JlZ3JvdW5kJzogJyMzQjNCM0InLFxuXHQndGVybWluYWwuaW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kJzogJyNFNUVCRjEnLFxuXHQndGVybWluYWwudGFiLmFjdGl2ZUJvcmRlcic6ICcjMDA1RkI4Jyxcblx0J3Rlcm1pbmFsQ3Vyc29yLmZvcmVncm91bmQnOiAnIzAwNUZCOCcsXG5cdCd0ZXh0QmxvY2tRdW90ZS5iYWNrZ3JvdW5kJzogJyNGOEY4RjgnLFxuXHQndGV4dEJsb2NrUXVvdGUuYm9yZGVyJzogJyNFNUU1RTUnLFxuXHQndGV4dENvZGVCbG9jay5iYWNrZ3JvdW5kJzogJyNGOEY4RjgnLFxuXHQndGV4dExpbmsuYWN0aXZlRm9yZWdyb3VuZCc6ICcjMDA1RkI4Jyxcblx0J3RleHRMaW5rLmZvcmVncm91bmQnOiAnIzAwNUZCOCcsXG5cdCd0ZXh0UHJlZm9ybWF0LmJhY2tncm91bmQnOiAnIzAwMDAwMDFGJyxcblx0J3RleHRQcmVmb3JtYXQuZm9yZWdyb3VuZCc6ICcjM0IzQjNCJyxcblx0J3RleHRTZXBhcmF0b3IuZm9yZWdyb3VuZCc6ICcjMjEyNjJEJyxcblx0J3RpdGxlQmFyLmFjdGl2ZUJhY2tncm91bmQnOiAnI0Y4RjhGOCcsXG5cdCd0aXRsZUJhci5hY3RpdmVGb3JlZ3JvdW5kJzogJyMxRTFFMUUnLFxuXHQndGl0bGVCYXIuYm9yZGVyJzogJyNFNUU1RTUnLFxuXHQndGl0bGVCYXIuaW5hY3RpdmVCYWNrZ3JvdW5kJzogJyNGOEY4RjgnLFxuXHQndGl0bGVCYXIuaW5hY3RpdmVGb3JlZ3JvdW5kJzogJyM4Qjk0OUUnLFxuXHQnd2VsY29tZVBhZ2UudGlsZUJhY2tncm91bmQnOiAnI0YzRjNGMycsXG5cdCd3aWRnZXQuYm9yZGVyJzogJyNFNUU1RTUnXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElXb3JrYmVuY2hUaGVtZSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbkRhdGE/OiBFeHRlbnNpb25EYXRhO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgc2V0dGluZ3NJZDogc3RyaW5nIHwgbnVsbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoQ29sb3JUaGVtZSBleHRlbmRzIElXb3JrYmVuY2hUaGVtZSwgSUNvbG9yVGhlbWUge1xuXHRyZWFkb25seSBzZXR0aW5nc0lkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRva2VuQ29sb3JzOiBJVGV4dE1hdGVUaGVtaW5nUnVsZVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb2xvck1hcCB7XG5cdFtpZDogc3RyaW5nXTogQ29sb3I7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jaEZpbGVJY29uVGhlbWUgZXh0ZW5kcyBJV29ya2JlbmNoVGhlbWUsIElGaWxlSWNvblRoZW1lIHtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoUHJvZHVjdEljb25UaGVtZSBleHRlbmRzIElXb3JrYmVuY2hUaGVtZSwgSVByb2R1Y3RJY29uVGhlbWUge1xuXHRyZWFkb25seSBzZXR0aW5nc0lkOiBzdHJpbmc7XG5cblx0Z2V0SWNvbihpY29uOiBJY29uQ29udHJpYnV0aW9uKTogSWNvbkRlZmluaXRpb24gfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCB0eXBlIFRoZW1lU2V0dGluZ1RhcmdldCA9IENvbmZpZ3VyYXRpb25UYXJnZXQgfCB1bmRlZmluZWQgfCAnYXV0bycgfCAncHJldmlldyc7XG5cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlIGV4dGVuZHMgSVRoZW1lU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0c2V0Q29sb3JUaGVtZSh0aGVtZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBJV29ya2JlbmNoQ29sb3JUaGVtZSwgc2V0dGluZ3NUYXJnZXQ6IFRoZW1lU2V0dGluZ1RhcmdldCk6IFByb21pc2U8SVdvcmtiZW5jaENvbG9yVGhlbWUgfCBudWxsPjtcblx0Z2V0Q29sb3JUaGVtZSgpOiBJV29ya2JlbmNoQ29sb3JUaGVtZTtcblx0Z2V0Q29sb3JUaGVtZXMoKTogUHJvbWlzZTxJV29ya2JlbmNoQ29sb3JUaGVtZVtdPjtcblx0Z2V0TWFya2V0cGxhY2VDb2xvclRoZW1lcyhwdWJsaXNoZXI6IHN0cmluZywgbmFtZTogc3RyaW5nLCB2ZXJzaW9uOiBzdHJpbmcpOiBQcm9taXNlPElXb3JrYmVuY2hDb2xvclRoZW1lW10+O1xuXHRyZWFkb25seSBvbkRpZENvbG9yVGhlbWVDaGFuZ2U6IEV2ZW50PElXb3JrYmVuY2hDb2xvclRoZW1lPjtcblxuXHRnZXRQcmVmZXJyZWRDb2xvclNjaGVtZSgpOiBDb2xvclNjaGVtZSB8IHVuZGVmaW5lZDtcblxuXHRzZXRGaWxlSWNvblRoZW1lKGljb25UaGVtZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBJV29ya2JlbmNoRmlsZUljb25UaGVtZSwgc2V0dGluZ3NUYXJnZXQ6IFRoZW1lU2V0dGluZ1RhcmdldCk6IFByb21pc2U8SVdvcmtiZW5jaEZpbGVJY29uVGhlbWU+O1xuXHRnZXRGaWxlSWNvblRoZW1lKCk6IElXb3JrYmVuY2hGaWxlSWNvblRoZW1lO1xuXHRnZXRGaWxlSWNvblRoZW1lcygpOiBQcm9taXNlPElXb3JrYmVuY2hGaWxlSWNvblRoZW1lW10+O1xuXHRnZXRNYXJrZXRwbGFjZUZpbGVJY29uVGhlbWVzKHB1Ymxpc2hlcjogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIHZlcnNpb246IHN0cmluZyk6IFByb21pc2U8SVdvcmtiZW5jaEZpbGVJY29uVGhlbWVbXT47XG5cdHJlYWRvbmx5IG9uRGlkRmlsZUljb25UaGVtZUNoYW5nZTogRXZlbnQ8SVdvcmtiZW5jaEZpbGVJY29uVGhlbWU+O1xuXG5cdHNldFByb2R1Y3RJY29uVGhlbWUoaWNvblRoZW1lSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCB8IElXb3JrYmVuY2hQcm9kdWN0SWNvblRoZW1lLCBzZXR0aW5nc1RhcmdldDogVGhlbWVTZXR0aW5nVGFyZ2V0KTogUHJvbWlzZTxJV29ya2JlbmNoUHJvZHVjdEljb25UaGVtZT47XG5cdGdldFByb2R1Y3RJY29uVGhlbWUoKTogSVdvcmtiZW5jaFByb2R1Y3RJY29uVGhlbWU7XG5cdGdldFByb2R1Y3RJY29uVGhlbWVzKCk6IFByb21pc2U8SVdvcmtiZW5jaFByb2R1Y3RJY29uVGhlbWVbXT47XG5cdGdldE1hcmtldHBsYWNlUHJvZHVjdEljb25UaGVtZXMocHVibGlzaGVyOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgdmVyc2lvbjogc3RyaW5nKTogUHJvbWlzZTxJV29ya2JlbmNoUHJvZHVjdEljb25UaGVtZVtdPjtcblx0cmVhZG9ubHkgb25EaWRQcm9kdWN0SWNvblRoZW1lQ2hhbmdlOiBFdmVudDxJV29ya2JlbmNoUHJvZHVjdEljb25UaGVtZT47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRoZW1lU2NvcGVkQ29sb3JDdXN0b21pemF0aW9ucyB7XG5cdFtjb2xvcklkOiBzdHJpbmddOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbG9yQ3VzdG9taXphdGlvbnMge1xuXHRbY29sb3JJZE9yVGhlbWVTY29wZTogc3RyaW5nXTogSVRoZW1lU2NvcGVkQ29sb3JDdXN0b21pemF0aW9ucyB8IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGhlbWVTY29wZWRUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMge1xuXHRbZ3JvdXBJZDogc3RyaW5nXTogSVRleHRNYXRlVGhlbWluZ1J1bGVbXSB8IElUb2tlbkNvbG9yaXphdGlvblNldHRpbmcgfCBib29sZWFuIHwgc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRjb21tZW50cz86IHN0cmluZyB8IElUb2tlbkNvbG9yaXphdGlvblNldHRpbmc7XG5cdHN0cmluZ3M/OiBzdHJpbmcgfCBJVG9rZW5Db2xvcml6YXRpb25TZXR0aW5nO1xuXHRudW1iZXJzPzogc3RyaW5nIHwgSVRva2VuQ29sb3JpemF0aW9uU2V0dGluZztcblx0a2V5d29yZHM/OiBzdHJpbmcgfCBJVG9rZW5Db2xvcml6YXRpb25TZXR0aW5nO1xuXHR0eXBlcz86IHN0cmluZyB8IElUb2tlbkNvbG9yaXphdGlvblNldHRpbmc7XG5cdGZ1bmN0aW9ucz86IHN0cmluZyB8IElUb2tlbkNvbG9yaXphdGlvblNldHRpbmc7XG5cdHZhcmlhYmxlcz86IHN0cmluZyB8IElUb2tlbkNvbG9yaXphdGlvblNldHRpbmc7XG5cdHRleHRNYXRlUnVsZXM/OiBJVGV4dE1hdGVUaGVtaW5nUnVsZVtdO1xuXHRzZW1hbnRpY0hpZ2hsaWdodGluZz86IGJvb2xlYW47IC8vIGRlcHJlY2F0ZWQsIHVzZSBJU2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMuZW5hYmxlZCBpbnN0ZWFkXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRva2VuQ29sb3JDdXN0b21pemF0aW9ucyB7XG5cdFtncm91cElkT3JUaGVtZVNjb3BlOiBzdHJpbmddOiBJVGhlbWVTY29wZWRUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMgfCBJVGV4dE1hdGVUaGVtaW5nUnVsZVtdIHwgSVRva2VuQ29sb3JpemF0aW9uU2V0dGluZyB8IGJvb2xlYW4gfCBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGNvbW1lbnRzPzogc3RyaW5nIHwgSVRva2VuQ29sb3JpemF0aW9uU2V0dGluZztcblx0c3RyaW5ncz86IHN0cmluZyB8IElUb2tlbkNvbG9yaXphdGlvblNldHRpbmc7XG5cdG51bWJlcnM/OiBzdHJpbmcgfCBJVG9rZW5Db2xvcml6YXRpb25TZXR0aW5nO1xuXHRrZXl3b3Jkcz86IHN0cmluZyB8IElUb2tlbkNvbG9yaXphdGlvblNldHRpbmc7XG5cdHR5cGVzPzogc3RyaW5nIHwgSVRva2VuQ29sb3JpemF0aW9uU2V0dGluZztcblx0ZnVuY3Rpb25zPzogc3RyaW5nIHwgSVRva2VuQ29sb3JpemF0aW9uU2V0dGluZztcblx0dmFyaWFibGVzPzogc3RyaW5nIHwgSVRva2VuQ29sb3JpemF0aW9uU2V0dGluZztcblx0dGV4dE1hdGVSdWxlcz86IElUZXh0TWF0ZVRoZW1pbmdSdWxlW107XG5cdHNlbWFudGljSGlnaGxpZ2h0aW5nPzogYm9vbGVhbjsgLy8gZGVwcmVjYXRlZCwgdXNlIElTZW1hbnRpY1Rva2VuQ29sb3JDdXN0b21pemF0aW9ucy5lbmFibGVkIGluc3RlYWRcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGhlbWVTY29wZWRTZW1hbnRpY1Rva2VuQ29sb3JDdXN0b21pemF0aW9ucyB7XG5cdFtzdHlsZVJ1bGU6IHN0cmluZ106IElTZW1hbnRpY1Rva2VuUnVsZXMgfCBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRlbmFibGVkPzogYm9vbGVhbjtcblx0cnVsZXM/OiBJU2VtYW50aWNUb2tlblJ1bGVzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZW1hbnRpY1Rva2VuQ29sb3JDdXN0b21pemF0aW9ucyB7XG5cdFtzdHlsZVJ1bGVPclRoZW1lU2NvcGU6IHN0cmluZ106IElUaGVtZVNjb3BlZFNlbWFudGljVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zIHwgSVNlbWFudGljVG9rZW5SdWxlcyB8IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdGVuYWJsZWQ/OiBib29sZWFuO1xuXHRydWxlcz86IElTZW1hbnRpY1Rva2VuUnVsZXM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRoZW1lU2NvcGVkRXhwZXJpbWVudGFsU2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMge1xuXHRbdGhlbWVTY29wZTogc3RyaW5nXTogSVNlbWFudGljVG9rZW5SdWxlcyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXhwZXJpbWVudGFsU2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMge1xuXHRbc3R5bGVSdWxlT3JUaGVtZVNjb3BlOiBzdHJpbmddOiBJVGhlbWVTY29wZWRFeHBlcmltZW50YWxTZW1hbnRpY1Rva2VuQ29sb3JDdXN0b21pemF0aW9ucyB8IElTZW1hbnRpY1Rva2VuUnVsZXMgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCB0eXBlIElUaGVtZVNjb3BlZEN1c3RvbWl6YXRpb25zID1cblx0SVRoZW1lU2NvcGVkQ29sb3JDdXN0b21pemF0aW9uc1xuXHR8IElUaGVtZVNjb3BlZFRva2VuQ29sb3JDdXN0b21pemF0aW9uc1xuXHR8IElUaGVtZVNjb3BlZEV4cGVyaW1lbnRhbFNlbWFudGljVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zXG5cdHwgSVRoZW1lU2NvcGVkU2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnM7XG5cbmV4cG9ydCB0eXBlIElUaGVtZVNjb3BhYmxlQ3VzdG9taXphdGlvbnMgPVxuXHRJQ29sb3JDdXN0b21pemF0aW9uc1xuXHR8IElUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnNcblx0fCBJRXhwZXJpbWVudGFsU2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnNcblx0fCBJU2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnM7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlbWFudGljVG9rZW5SdWxlcyB7XG5cdFtzZWxlY3Rvcjogc3RyaW5nXTogc3RyaW5nIHwgSVNlbWFudGljVG9rZW5Db2xvcml6YXRpb25TZXR0aW5nIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXh0TWF0ZVRoZW1pbmdSdWxlIHtcblx0bmFtZT86IHN0cmluZztcblx0c2NvcGU/OiBzdHJpbmcgfCBzdHJpbmdbXTtcblx0c2V0dGluZ3M6IElUb2tlbkNvbG9yaXphdGlvblNldHRpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRva2VuQ29sb3JpemF0aW9uU2V0dGluZyB7XG5cdGZvcmVncm91bmQ/OiBzdHJpbmc7XG5cdGJhY2tncm91bmQ/OiBzdHJpbmc7XG5cdGZvbnRTdHlsZT86IHN0cmluZzsgLyogW2l0YWxpY3xib2xkfHVuZGVybGluZXxzdHJpa2V0aHJvdWdoXSAqL1xuXHRmb250RmFtaWx5Pzogc3RyaW5nO1xuXHRmb250U2l6ZT86IG51bWJlcjtcblx0bGluZUhlaWdodD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VtYW50aWNUb2tlbkNvbG9yaXphdGlvblNldHRpbmcge1xuXHRmb3JlZ3JvdW5kPzogc3RyaW5nO1xuXHRmb250U3R5bGU/OiBzdHJpbmc7IC8qIFtpdGFsaWN8Ym9sZHx1bmRlcmxpbmV8c3RyaWtldGhyb3VnaF0gKi9cblx0Ym9sZD86IGJvb2xlYW47XG5cdHVuZGVybGluZT86IGJvb2xlYW47XG5cdHN0cmlrZXRocm91Z2g/OiBib29sZWFuO1xuXHRpdGFsaWM/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEV4dGVuc2lvbkRhdGEge1xuXHRleHRlbnNpb25JZDogc3RyaW5nO1xuXHRleHRlbnNpb25QdWJsaXNoZXI6IHN0cmluZztcblx0ZXh0ZW5zaW9uTmFtZTogc3RyaW5nO1xuXHRleHRlbnNpb25Jc0J1aWx0aW46IGJvb2xlYW47XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgRXh0ZW5zaW9uRGF0YSB7XG5cdGV4cG9ydCBmdW5jdGlvbiB0b0pTT05PYmplY3QoZDogRXh0ZW5zaW9uRGF0YSB8IHVuZGVmaW5lZCk6IGFueSB7XG5cdFx0cmV0dXJuIGQgJiYgeyBfZXh0ZW5zaW9uSWQ6IGQuZXh0ZW5zaW9uSWQsIF9leHRlbnNpb25Jc0J1aWx0aW46IGQuZXh0ZW5zaW9uSXNCdWlsdGluLCBfZXh0ZW5zaW9uTmFtZTogZC5leHRlbnNpb25OYW1lLCBfZXh0ZW5zaW9uUHVibGlzaGVyOiBkLmV4dGVuc2lvblB1Ymxpc2hlciB9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tSlNPTk9iamVjdChvOiBhbnkpOiBFeHRlbnNpb25EYXRhIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAobyAmJiBpc1N0cmluZyhvLl9leHRlbnNpb25JZCkgJiYgaXNCb29sZWFuKG8uX2V4dGVuc2lvbklzQnVpbHRpbikgJiYgaXNTdHJpbmcoby5fZXh0ZW5zaW9uTmFtZSkgJiYgaXNTdHJpbmcoby5fZXh0ZW5zaW9uUHVibGlzaGVyKSkge1xuXHRcdFx0cmV0dXJuIHsgZXh0ZW5zaW9uSWQ6IG8uX2V4dGVuc2lvbklkLCBleHRlbnNpb25Jc0J1aWx0aW46IG8uX2V4dGVuc2lvbklzQnVpbHRpbiwgZXh0ZW5zaW9uTmFtZTogby5fZXh0ZW5zaW9uTmFtZSwgZXh0ZW5zaW9uUHVibGlzaGVyOiBvLl9leHRlbnNpb25QdWJsaXNoZXIgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbU5hbWUocHVibGlzaGVyOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgaXNCdWlsdGluID0gZmFsc2UpOiBFeHRlbnNpb25EYXRhIHtcblx0XHRyZXR1cm4geyBleHRlbnNpb25QdWJsaXNoZXI6IHB1Ymxpc2hlciwgZXh0ZW5zaW9uSWQ6IGAke3B1Ymxpc2hlcn0uJHtuYW1lfWAsIGV4dGVuc2lvbk5hbWU6IG5hbWUsIGV4dGVuc2lvbklzQnVpbHRpbjogaXNCdWlsdGluIH07XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGhlbWVFeHRlbnNpb25Qb2ludCB7XG5cdGlkOiBzdHJpbmc7XG5cdGxhYmVsPzogc3RyaW5nO1xuXHRkZXNjcmlwdGlvbj86IHN0cmluZztcblx0cGF0aDogc3RyaW5nO1xuXHR1aVRoZW1lPzogVGhlbWVUeXBlU2VsZWN0b3I7XG5cdF93YXRjaDogYm9vbGVhbjsgLy8gdW5zdXBwb3J0ZWQgb3B0aW9ucyB0byB3YXRjaCBsb2NhdGlvblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyw4QkFBOEI7QUFHdkMsU0FBc0IscUJBQXdEO0FBRTlFLFNBQVMsV0FBVyxnQkFBZ0I7QUFJN0IsTUFBTSx5QkFBeUIsdUJBQThELGFBQWE7QUFFMUcsTUFBTSx5QkFBeUI7QUFDL0IsTUFBTSwwQkFBMEI7QUFDaEMsTUFBTSx1QkFBdUI7QUFFN0IsTUFBTSxrQkFBa0I7QUFFeEIsSUFBSyxnQkFBTCxrQkFBS0EsbUJBQUw7QUFDTixFQUFBQSxlQUFBLGlCQUFjO0FBQ2QsRUFBQUEsZUFBQSxxQkFBa0I7QUFDbEIsRUFBQUEsZUFBQSx3QkFBcUI7QUFDckIsRUFBQUEsZUFBQSwwQkFBdUI7QUFDdkIsRUFBQUEsZUFBQSxnQ0FBNkI7QUFDN0IsRUFBQUEsZUFBQSx5Q0FBc0M7QUFFdEMsRUFBQUEsZUFBQSwwQkFBdUI7QUFDdkIsRUFBQUEsZUFBQSwyQkFBd0I7QUFDeEIsRUFBQUEsZUFBQSw2QkFBMEI7QUFDMUIsRUFBQUEsZUFBQSw4QkFBMkI7QUFDM0IsRUFBQUEsZUFBQSx5QkFBc0I7QUFDdEIsRUFBQUEsZUFBQSxlQUFZO0FBRVosRUFBQUEsZUFBQSx3QkFBcUI7QUFmVixTQUFBQTtBQUFBLEdBQUE7QUFrQkwsSUFBVTtBQUFBLENBQVYs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QUFBLEVBQzdCLDJDQUEyQztBQUFBLEVBQzNDLDZCQUE2QjtBQUFBLEVBQzdCLDJDQUEyQztBQUFBLEVBQzNDLHNCQUFzQjtBQUFBLEVBQ3RCLHNDQUFzQztBQUFBLEVBQ3RDLDBCQUEwQjtBQUFBLEVBQzFCLHlCQUF5QjtBQUFBLEVBQ3pCLHlCQUF5QjtBQUFBLEVBQ3pCLCtCQUErQjtBQUFBLEVBQy9CLDJCQUEyQjtBQUFBLEVBQzNCLDZCQUE2QjtBQUFBLEVBQzdCLGtDQUFrQztBQUFBLEVBQ2xDLHNCQUFzQjtBQUFBLEVBQ3RCLGtCQUFrQjtBQUFBLEVBQ2xCLHNCQUFzQjtBQUFBLEVBQ3RCLG1DQUFtQztBQUFBLEVBQ25DLCtCQUErQjtBQUFBLEVBQy9CLG1DQUFtQztBQUFBLEVBQ25DLDJCQUEyQjtBQUFBLEVBQzNCLHdCQUF3QjtBQUFBLEVBQ3hCLG9CQUFvQjtBQUFBLEVBQ3BCLGlDQUFpQztBQUFBLEVBQ2pDLGlDQUFpQztBQUFBLEVBQ2pDLHlCQUF5QjtBQUFBLEVBQ3pCLHdCQUF3QjtBQUFBLEVBQ3hCLGdDQUFnQztBQUFBLEVBQ2hDLDZCQUE2QjtBQUFBLEVBQzdCLHFDQUFxQztBQUFBLEVBQ3JDLGtDQUFrQztBQUFBLEVBQ2xDLGtDQUFrQztBQUFBLEVBQ2xDLHdCQUF3QjtBQUFBLEVBQ3hCLG9CQUFvQjtBQUFBLEVBQ3BCLHVCQUF1QjtBQUFBLEVBQ3ZCLHdCQUF3QjtBQUFBLEVBQ3hCLGNBQWM7QUFBQSxFQUNkLHVCQUF1QjtBQUFBLEVBQ3ZCLDBCQUEwQjtBQUFBLEVBQzFCLDBCQUEwQjtBQUFBLEVBQzFCLHdCQUF3QjtBQUFBLEVBQ3hCLDBCQUEwQjtBQUFBLEVBQzFCLHlCQUF5QjtBQUFBLEVBQ3pCLDBCQUEwQjtBQUFBLEVBQzFCLDZCQUE2QjtBQUFBLEVBQzdCLGdDQUFnQztBQUFBLEVBQ2hDLGdDQUFnQztBQUFBLEVBQ2hDLHVCQUF1QjtBQUFBLEVBQ3ZCLHdDQUF3QztBQUFBLEVBQ3hDLDZCQUE2QjtBQUFBLEVBQzdCLDZCQUE2QjtBQUFBLEVBQzdCLHlCQUF5QjtBQUFBLEVBQ3pCLDRCQUE0QjtBQUFBLEVBQzVCLDZCQUE2QjtBQUFBLEVBQzdCLHVCQUF1QjtBQUFBLEVBQ3ZCLDRCQUE0QjtBQUFBLEVBQzVCLDRCQUE0QjtBQUFBLEVBQzVCLDRCQUE0QjtBQUFBLEVBQzVCLDZCQUE2QjtBQUFBLEVBQzdCLDZCQUE2QjtBQUFBLEVBQzdCLG1CQUFtQjtBQUFBLEVBQ25CLCtCQUErQjtBQUFBLEVBQy9CLCtCQUErQjtBQUFBLEVBQy9CLG1DQUFtQztBQUFBLEVBQ25DLDhCQUE4QjtBQUFBLEVBQzlCLGlCQUFpQjtBQUNsQjtBQUVPLE1BQU0sbUNBQW1DO0FBQUEsRUFDL0MsK0JBQStCO0FBQUEsRUFDL0IsNEJBQTRCO0FBQUEsRUFDNUIsMEJBQTBCO0FBQUEsRUFDMUIsc0JBQXNCO0FBQUEsRUFDdEIsMEJBQTBCO0FBQUEsRUFDMUIsa0NBQWtDO0FBQUEsRUFDbEMsK0JBQStCO0FBQUEsRUFDL0IsK0JBQStCO0FBQUEsRUFDL0Isb0JBQW9CO0FBQUEsRUFDcEIsb0JBQW9CO0FBQUEsRUFDcEIscUJBQXFCO0FBQUEsRUFDckIsaUJBQWlCO0FBQUEsRUFDakIscUJBQXFCO0FBQUEsRUFDckIsMEJBQTBCO0FBQUEsRUFDMUIsOEJBQThCO0FBQUEsRUFDOUIsOEJBQThCO0FBQUEsRUFDOUIsbUNBQW1DO0FBQUEsRUFDbkMsK0JBQStCO0FBQUEsRUFDL0IsK0JBQStCO0FBQUEsRUFDL0IsNkJBQTZCO0FBQUEsRUFDN0IsdUJBQXVCO0FBQUEsRUFDdkIsbUJBQW1CO0FBQUEsRUFDbkIseUJBQXlCO0FBQUEsRUFDekIsd0NBQXdDO0FBQUEsRUFDeEMsdUJBQXVCO0FBQUEsRUFDdkIsbUJBQW1CO0FBQUEsRUFDbkIsdUJBQXVCO0FBQUEsRUFDdkIsMkJBQTJCO0FBQUEsRUFDM0IscUJBQXFCO0FBQUEsRUFDckIscUJBQXFCO0FBQUEsRUFDckIsc0NBQXNDO0FBQUEsRUFDdEMsdUNBQXVDO0FBQUEsRUFDdkMsc0JBQXNCO0FBQUEsRUFDdEIsb0NBQW9DO0FBQUEsRUFDcEMsZ0NBQWdDO0FBQUEsRUFDaEMsZ0NBQWdDO0FBQUEsRUFDaEMsa0NBQWtDO0FBQUEsRUFDbEMsbUNBQW1DO0FBQUEsRUFDbkMsdUNBQXVDO0FBQUEsRUFDdkMsaUNBQWlDO0FBQUEsRUFDakMscUNBQXFDO0FBQUEsRUFDckMsK0JBQStCO0FBQUEsRUFDL0IsOEJBQThCO0FBQUEsRUFDOUIsa0NBQWtDO0FBQUEsRUFDbEMsMkJBQTJCO0FBQUEsRUFDM0IsbUJBQW1CO0FBQUEsRUFDbkIsZUFBZTtBQUFBLEVBQ2YsY0FBYztBQUFBLEVBQ2QsbUJBQW1CO0FBQUEsRUFDbkIsb0JBQW9CO0FBQUEsRUFDcEIsZ0JBQWdCO0FBQUEsRUFDaEIsb0JBQW9CO0FBQUEsRUFDcEIsK0JBQStCO0FBQUEsRUFDL0IsZ0NBQWdDO0FBQUEsRUFDaEMsNEJBQTRCO0FBQUEsRUFDNUIsZ0NBQWdDO0FBQUEsRUFDaEMsOEJBQThCO0FBQUEsRUFDOUIsa0NBQWtDO0FBQUEsRUFDbEMsa0NBQWtDO0FBQUEsRUFDbEMsc0NBQXNDO0FBQUEsRUFDdEMsaUNBQWlDO0FBQUEsRUFDakMsd0JBQXdCO0FBQUEsRUFDeEIsZUFBZTtBQUFBLEVBQ2YsNEJBQTRCO0FBQUEsRUFDNUIsNEJBQTRCO0FBQUEsRUFDNUIsNEJBQTRCO0FBQUEsRUFDNUIsbUNBQW1DO0FBQUEsRUFDbkMsdUNBQXVDO0FBQUEsRUFDdkMsdUNBQXVDO0FBQUEsRUFDdkMsNEJBQTRCO0FBQUEsRUFDNUIsd0JBQXdCO0FBQUEsRUFDeEIsNEJBQTRCO0FBQUEsRUFDNUIsb0JBQW9CO0FBQUEsRUFDcEIsZ0JBQWdCO0FBQUEsRUFDaEIscUJBQXFCO0FBQUEsRUFDckIsMkJBQTJCO0FBQUEsRUFDM0IsK0JBQStCO0FBQUEsRUFDL0IsaUNBQWlDO0FBQUEsRUFDakMsMkNBQTJDO0FBQUEsRUFDM0MsNkJBQTZCO0FBQUEsRUFDN0IsMkNBQTJDO0FBQUEsRUFDM0Msc0JBQXNCO0FBQUEsRUFDdEIsMEJBQTBCO0FBQUEsRUFDMUIsc0NBQXNDO0FBQUEsRUFDdEMsMEJBQTBCO0FBQUEsRUFDMUIseUJBQXlCO0FBQUEsRUFDekIseUJBQXlCO0FBQUEsRUFDekIsZ0NBQWdDO0FBQUEsRUFDaEMsK0JBQStCO0FBQUEsRUFDL0IsMkJBQTJCO0FBQUEsRUFDM0IsNkJBQTZCO0FBQUEsRUFDN0Isa0NBQWtDO0FBQUEsRUFDbEMsOEJBQThCO0FBQUEsRUFDOUIsNEJBQTRCO0FBQUEsRUFDNUIsc0JBQXNCO0FBQUEsRUFDdEIsa0JBQWtCO0FBQUEsRUFDbEIsc0JBQXNCO0FBQUEsRUFDdEIsbUNBQW1DO0FBQUEsRUFDbkMsK0JBQStCO0FBQUEsRUFDL0IsbUNBQW1DO0FBQUEsRUFDbkMsMkJBQTJCO0FBQUEsRUFDM0Isd0JBQXdCO0FBQUEsRUFDeEIsb0JBQW9CO0FBQUEsRUFDcEIsaUNBQWlDO0FBQUEsRUFDakMsaUNBQWlDO0FBQUEsRUFDakMseUJBQXlCO0FBQUEsRUFDekIsd0JBQXdCO0FBQUEsRUFDeEIsZ0NBQWdDO0FBQUEsRUFDaEMsd0NBQXdDO0FBQUEsRUFDeEMsaUNBQWlDO0FBQUEsRUFDakMsNkJBQTZCO0FBQUEsRUFDN0IsaUNBQWlDO0FBQUEsRUFDakMscUNBQXFDO0FBQUEsRUFDckMsa0NBQWtDO0FBQUEsRUFDbEMsa0NBQWtDO0FBQUEsRUFDbEMsd0JBQXdCO0FBQUEsRUFDeEIsb0JBQW9CO0FBQUEsRUFDcEIsdUJBQXVCO0FBQUEsRUFDdkIsd0JBQXdCO0FBQUEsRUFDeEIsY0FBYztBQUFBLEVBQ2QsdUJBQXVCO0FBQUEsRUFDdkIsMEJBQTBCO0FBQUEsRUFDMUIsMEJBQTBCO0FBQUEsRUFDMUIsd0JBQXdCO0FBQUEsRUFDeEIsMEJBQTBCO0FBQUEsRUFDMUIseUJBQXlCO0FBQUEsRUFDekIsMEJBQTBCO0FBQUEsRUFDMUIsNkJBQTZCO0FBQUEsRUFDN0IsZ0NBQWdDO0FBQUEsRUFDaEMsZ0NBQWdDO0FBQUEsRUFDaEMsdUJBQXVCO0FBQUEsRUFDdkIsd0NBQXdDO0FBQUEsRUFDeEMsNkJBQTZCO0FBQUEsRUFDN0IsNkJBQTZCO0FBQUEsRUFDN0IsNkJBQTZCO0FBQUEsRUFDN0IseUJBQXlCO0FBQUEsRUFDekIsNEJBQTRCO0FBQUEsRUFDNUIsNkJBQTZCO0FBQUEsRUFDN0IsdUJBQXVCO0FBQUEsRUFDdkIsNEJBQTRCO0FBQUEsRUFDNUIsNEJBQTRCO0FBQUEsRUFDNUIsNEJBQTRCO0FBQUEsRUFDNUIsNkJBQTZCO0FBQUEsRUFDN0IsNkJBQTZCO0FBQUEsRUFDN0IsbUJBQW1CO0FBQUEsRUFDbkIsK0JBQStCO0FBQUEsRUFDL0IsK0JBQStCO0FBQUEsRUFDL0IsOEJBQThCO0FBQUEsRUFDOUIsaUJBQWlCO0FBQ2xCO0FBMkpPLElBQVU7QUFBQSxDQUFWLENBQVVDLG1CQUFWO0FBQ0MsV0FBUyxhQUFhLEdBQW1DO0FBQy9ELFdBQU8sS0FBSyxFQUFFLGNBQWMsRUFBRSxhQUFhLHFCQUFxQixFQUFFLG9CQUFvQixnQkFBZ0IsRUFBRSxlQUFlLHFCQUFxQixFQUFFLG1CQUFtQjtBQUFBLEVBQ2xLO0FBRk8sRUFBQUEsZUFBUztBQUdULFdBQVMsZUFBZSxHQUFtQztBQUNqRSxRQUFJLEtBQUssU0FBUyxFQUFFLFlBQVksS0FBSyxVQUFVLEVBQUUsbUJBQW1CLEtBQUssU0FBUyxFQUFFLGNBQWMsS0FBSyxTQUFTLEVBQUUsbUJBQW1CLEdBQUc7QUFDdkksYUFBTyxFQUFFLGFBQWEsRUFBRSxjQUFjLG9CQUFvQixFQUFFLHFCQUFxQixlQUFlLEVBQUUsZ0JBQWdCLG9CQUFvQixFQUFFLG9CQUFvQjtBQUFBLElBQzdKO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFMTyxFQUFBQSxlQUFTO0FBTVQsV0FBUyxTQUFTLFdBQW1CLE1BQWMsWUFBWSxPQUFzQjtBQUMzRixXQUFPLEVBQUUsb0JBQW9CLFdBQVcsYUFBYSxHQUFHLFNBQVMsSUFBSSxJQUFJLElBQUksZUFBZSxNQUFNLG9CQUFvQixVQUFVO0FBQUEsRUFDakk7QUFGTyxFQUFBQSxlQUFTO0FBQUEsR0FWQTsiLAogICJuYW1lcyI6IFsiVGhlbWVTZXR0aW5ncyIsICJUaGVtZVNldHRpbmdEZWZhdWx0cyIsICJFeHRlbnNpb25EYXRhIl0KfQo=
