import { refineServiceDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { isMacintosh, isNative, isWeb } from "../../../../base/common/platform.js";
import { isAuxiliaryWindow, mainWindow } from "../../../../base/browser/window.js";
import { CustomTitleBarVisibility, TitleBarSetting, getMenuBarVisibility, hasCustomTitlebar, hasNativeMenu, hasNativeTitlebar } from "../../../../platform/window/common/window.js";
import { isFullscreen, isWCOEnabled } from "../../../../base/browser/browser.js";
const IWorkbenchLayoutService = refineServiceDecorator(ILayoutService);
var Parts = /* @__PURE__ */ ((Parts2) => {
  Parts2["TITLEBAR_PART"] = "workbench.parts.titlebar";
  Parts2["BANNER_PART"] = "workbench.parts.banner";
  Parts2["ACTIVITYBAR_PART"] = "workbench.parts.activitybar";
  Parts2["SIDEBAR_PART"] = "workbench.parts.sidebar";
  Parts2["PANEL_PART"] = "workbench.parts.panel";
  Parts2["AUXILIARYBAR_PART"] = "workbench.parts.auxiliarybar";
  Parts2["SESSIONS_PART"] = "workbench.parts.sessions";
  Parts2["CUSTOM_VIEW_GRID_PART"] = "workbench.parts.customViewGrid";
  Parts2["EDITOR_PART"] = "workbench.parts.editor";
  Parts2["STATUSBAR_PART"] = "workbench.parts.statusbar";
  return Parts2;
})(Parts || {});
var ZenModeSettings = /* @__PURE__ */ ((ZenModeSettings2) => {
  ZenModeSettings2["SHOW_TABS"] = "zenMode.showTabs";
  ZenModeSettings2["HIDE_LINENUMBERS"] = "zenMode.hideLineNumbers";
  ZenModeSettings2["HIDE_STATUSBAR"] = "zenMode.hideStatusBar";
  ZenModeSettings2["HIDE_ACTIVITYBAR"] = "zenMode.hideActivityBar";
  ZenModeSettings2["CENTER_LAYOUT"] = "zenMode.centerLayout";
  ZenModeSettings2["FULLSCREEN"] = "zenMode.fullScreen";
  ZenModeSettings2["RESTORE"] = "zenMode.restore";
  ZenModeSettings2["SILENT_NOTIFICATIONS"] = "zenMode.silentNotifications";
  return ZenModeSettings2;
})(ZenModeSettings || {});
var LayoutSettings = /* @__PURE__ */ ((LayoutSettings2) => {
  LayoutSettings2["ACTIVITY_BAR_LOCATION"] = "workbench.activityBar.location";
  LayoutSettings2["ACTIVITY_BAR_AUTO_HIDE"] = "workbench.activityBar.autoHide";
  LayoutSettings2["ACTIVITY_BAR_COMPACT"] = "workbench.activityBar.compact";
  LayoutSettings2["EDITOR_TABS_MODE"] = "workbench.editor.showTabs";
  LayoutSettings2["EDITOR_ACTIONS_LOCATION"] = "workbench.editor.editorActionsLocation";
  LayoutSettings2["COMMAND_CENTER"] = "window.commandCenter";
  LayoutSettings2["LAYOUT_ACTIONS"] = "workbench.layoutControl.enabled";
  LayoutSettings2["SHADOWS"] = "workbench.shadows";
  LayoutSettings2["MODERN_UI"] = "workbench.experimental.modernUI";
  LayoutSettings2["MODERN_UI_UPPERCASE_VIEW_HEADERS"] = "workbench.experimental.modernUIUppercaseViewHeaders";
  return LayoutSettings2;
})(LayoutSettings || {});
const FLOATING_PANEL_MARGIN = 4;
const FLOATING_PANEL_INNER_MARGIN = 0;
var ActivityBarPosition = /* @__PURE__ */ ((ActivityBarPosition2) => {
  ActivityBarPosition2["DEFAULT"] = "default";
  ActivityBarPosition2["TOP"] = "top";
  ActivityBarPosition2["BOTTOM"] = "bottom";
  ActivityBarPosition2["HIDDEN"] = "hidden";
  return ActivityBarPosition2;
})(ActivityBarPosition || {});
var EditorTabsMode = /* @__PURE__ */ ((EditorTabsMode2) => {
  EditorTabsMode2["MULTIPLE"] = "multiple";
  EditorTabsMode2["SINGLE"] = "single";
  EditorTabsMode2["NONE"] = "none";
  return EditorTabsMode2;
})(EditorTabsMode || {});
var EditorActionsLocation = /* @__PURE__ */ ((EditorActionsLocation2) => {
  EditorActionsLocation2["DEFAULT"] = "default";
  EditorActionsLocation2["TITLEBAR"] = "titleBar";
  EditorActionsLocation2["HIDDEN"] = "hidden";
  return EditorActionsLocation2;
})(EditorActionsLocation || {});
var Position = /* @__PURE__ */ ((Position2) => {
  Position2[Position2["LEFT"] = 0] = "LEFT";
  Position2[Position2["RIGHT"] = 1] = "RIGHT";
  Position2[Position2["BOTTOM"] = 2] = "BOTTOM";
  Position2[Position2["TOP"] = 3] = "TOP";
  return Position2;
})(Position || {});
function isHorizontal(position) {
  return position === 2 /* BOTTOM */ || position === 3 /* TOP */;
}
var PartOpensMaximizedOptions = /* @__PURE__ */ ((PartOpensMaximizedOptions2) => {
  PartOpensMaximizedOptions2[PartOpensMaximizedOptions2["ALWAYS"] = 0] = "ALWAYS";
  PartOpensMaximizedOptions2[PartOpensMaximizedOptions2["NEVER"] = 1] = "NEVER";
  PartOpensMaximizedOptions2[PartOpensMaximizedOptions2["REMEMBER_LAST"] = 2] = "REMEMBER_LAST";
  return PartOpensMaximizedOptions2;
})(PartOpensMaximizedOptions || {});
function positionToString(position) {
  switch (position) {
    case 0 /* LEFT */:
      return "left";
    case 1 /* RIGHT */:
      return "right";
    case 2 /* BOTTOM */:
      return "bottom";
    case 3 /* TOP */:
      return "top";
    default:
      return "bottom";
  }
}
function isFloatingTopEdgeExposed(layoutService, targetWindow) {
  return !layoutService.isVisible("workbench.parts.titlebar" /* TITLEBAR_PART */, targetWindow) && !layoutService.isVisible("workbench.parts.banner" /* BANNER_PART */);
}
function getFloatingOuterEdgeOwners(layoutService) {
  if (!layoutService.isFloatingPanelsEnabled()) {
    return { left: void 0, right: void 0 };
  }
  const sideBarLeft = layoutService.getSideBarPosition() === 0 /* LEFT */;
  const panelPosition = layoutService.getPanelPosition();
  const verticalPanelVisible = !isHorizontal(panelPosition) && layoutService.isVisible("workbench.parts.panel" /* PANEL_PART */);
  const panelInLeftSequence = verticalPanelVisible && panelPosition === 0 /* LEFT */;
  const panelInRightSequence = verticalPanelVisible && panelPosition === 1 /* RIGHT */;
  const sideBarGroup = ["workbench.parts.activitybar" /* ACTIVITYBAR_PART */, "workbench.parts.sidebar" /* SIDEBAR_PART */];
  const panelGroup = ["workbench.parts.panel" /* PANEL_PART */];
  const fullOrder = sideBarLeft ? [
    ...sideBarGroup,
    ...panelInLeftSequence ? panelGroup : [],
    "workbench.parts.editor" /* EDITOR_PART */,
    ...panelInRightSequence ? panelGroup : [],
    "workbench.parts.auxiliarybar" /* AUXILIARYBAR_PART */
  ] : [
    "workbench.parts.auxiliarybar" /* AUXILIARYBAR_PART */,
    ...panelInLeftSequence ? panelGroup : [],
    "workbench.parts.editor" /* EDITOR_PART */,
    ...panelInRightSequence ? panelGroup : [],
    ...[...sideBarGroup].reverse()
    // activity bar is outermost on the right edge
  ];
  return {
    left: resolveFloatingOuterOwner(layoutService, fullOrder),
    right: resolveFloatingOuterOwner(layoutService, [...fullOrder].reverse())
  };
}
function resolveFloatingOuterOwner(layoutService, orderedParts) {
  for (const part of orderedParts) {
    const visible = part === "workbench.parts.editor" /* EDITOR_PART */ ? layoutService.isVisible("workbench.parts.editor" /* EDITOR_PART */, mainWindow) : layoutService.isVisible(part);
    if (!visible) {
      continue;
    }
    return part === "workbench.parts.activitybar" /* ACTIVITYBAR_PART */ ? void 0 : part;
  }
  return void 0;
}
function getFloatingOuterGutterEdges(layoutService, partId) {
  if (!layoutService.isFloatingPanelsEnabled()) {
    return { left: false, right: false };
  }
  if (partId === "workbench.parts.panel" /* PANEL_PART */ && isHorizontal(layoutService.getPanelPosition())) {
    return getFloatingHorizontalPanelOuterEdges(layoutService);
  }
  const owners = getFloatingOuterEdgeOwners(layoutService);
  return { left: owners.left === partId, right: owners.right === partId };
}
function getFloatingPaneCompositeHorizontalMargins(layoutService, partId) {
  if (!layoutService.isFloatingPanelsEnabled()) {
    return { left: 0, right: 0 };
  }
  const outerGutter = getFloatingOuterGutterEdges(layoutService, partId);
  return {
    left: outerGutter.left ? FLOATING_PANEL_MARGIN * 2 : FLOATING_PANEL_MARGIN,
    right: outerGutter.right ? FLOATING_PANEL_MARGIN * 2 : FLOATING_PANEL_INNER_MARGIN
  };
}
function getFloatingSidebarSiblingToEditorStatus(layoutService) {
  const alignment = layoutService.getPanelAlignment();
  const sideBarOnLeft = layoutService.getSideBarPosition() === 0 /* LEFT */;
  return {
    sideBar: !(alignment === "center" || sideBarOnLeft && alignment === "right" || !sideBarOnLeft && alignment === "left"),
    auxBar: !(alignment === "center" || !sideBarOnLeft && alignment === "right" || sideBarOnLeft && alignment === "left")
  };
}
function getFloatingPaneCompositeVerticalMargins(layoutService, partId, targetWindow) {
  if (!layoutService.isFloatingPanelsEnabled()) {
    return { top: 0, bottom: 0 };
  }
  const topEdgeExposed = isFloatingTopEdgeExposed(layoutService, targetWindow);
  const panelPosition = layoutService.getPanelPosition();
  const panelVisible = layoutService.isVisible("workbench.parts.panel" /* PANEL_PART */);
  const isSideBar = partId === "workbench.parts.sidebar" /* SIDEBAR_PART */ || partId === "workbench.parts.auxiliarybar" /* AUXILIARYBAR_PART */;
  const siblingStatus = getFloatingSidebarSiblingToEditorStatus(layoutService);
  const isSiblingToEditor = partId === "workbench.parts.sidebar" /* SIDEBAR_PART */ ? siblingStatus.sideBar : siblingStatus.auxBar;
  const facesPanelAbove = panelVisible && panelPosition === 3 /* TOP */ && isSideBar && isSiblingToEditor;
  const facesEditorAbove = partId === "workbench.parts.panel" /* PANEL_PART */ && panelPosition === 2 /* BOTTOM */ && layoutService.isVisible("workbench.parts.editor" /* EDITOR_PART */, targetWindow);
  const facesEditorBelow = partId === "workbench.parts.panel" /* PANEL_PART */ && panelPosition === 3 /* TOP */;
  const facesPanelBelow = panelVisible && panelPosition === 2 /* BOTTOM */ && isSideBar && isSiblingToEditor;
  const atWindowBottom = !facesEditorBelow && !facesPanelBelow;
  const statusBarVisible = layoutService.isVisible("workbench.parts.statusbar" /* STATUSBAR_PART */, targetWindow);
  return {
    top: facesPanelAbove || facesEditorAbove ? FLOATING_PANEL_MARGIN : topEdgeExposed ? FLOATING_PANEL_MARGIN * 2 : FLOATING_PANEL_INNER_MARGIN,
    bottom: atWindowBottom ? statusBarVisible ? FLOATING_PANEL_MARGIN : FLOATING_PANEL_MARGIN * 2 : FLOATING_PANEL_INNER_MARGIN
  };
}
function getFloatingEditorVerticalMargins(layoutService, targetWindow) {
  if (!layoutService.isFloatingPanelsEnabled()) {
    return { top: 0, bottom: 0 };
  }
  const panelVisible = layoutService.isVisible("workbench.parts.panel" /* PANEL_PART */);
  const panelPosition = layoutService.getPanelPosition();
  const panelAtTop = panelVisible && panelPosition === 3 /* TOP */;
  const panelAtBottom = panelVisible && panelPosition === 2 /* BOTTOM */;
  return {
    top: panelAtTop ? FLOATING_PANEL_MARGIN : isFloatingTopEdgeExposed(layoutService, targetWindow) ? FLOATING_PANEL_MARGIN * 2 : FLOATING_PANEL_INNER_MARGIN,
    bottom: panelAtBottom ? FLOATING_PANEL_INNER_MARGIN : layoutService.isVisible("workbench.parts.statusbar" /* STATUSBAR_PART */, targetWindow) ? FLOATING_PANEL_MARGIN : FLOATING_PANEL_MARGIN * 2
  };
}
function getFloatingHorizontalPanelOuterEdges(layoutService) {
  if (!layoutService.isVisible("workbench.parts.panel" /* PANEL_PART */)) {
    return { left: false, right: false };
  }
  const sideBarLeft = layoutService.getSideBarPosition() === 0 /* LEFT */;
  const { sideBar: sideBarSiblingToEditor, auxBar: auxSiblingToEditor } = getFloatingSidebarSiblingToEditorStatus(layoutService);
  const sideBarSideReached = !layoutService.isVisible("workbench.parts.activitybar" /* ACTIVITYBAR_PART */) && (!layoutService.isVisible("workbench.parts.sidebar" /* SIDEBAR_PART */) || sideBarSiblingToEditor);
  const auxSideReached = !layoutService.isVisible("workbench.parts.auxiliarybar" /* AUXILIARYBAR_PART */) || auxSiblingToEditor;
  return sideBarLeft ? { left: sideBarSideReached, right: auxSideReached } : { left: auxSideReached, right: sideBarSideReached };
}
const positionsByString = {
  [positionToString(0 /* LEFT */)]: 0 /* LEFT */,
  [positionToString(1 /* RIGHT */)]: 1 /* RIGHT */,
  [positionToString(2 /* BOTTOM */)]: 2 /* BOTTOM */,
  [positionToString(3 /* TOP */)]: 3 /* TOP */
};
function positionFromString(str) {
  return positionsByString[str];
}
function partOpensMaximizedSettingToString(setting) {
  switch (setting) {
    case 0 /* ALWAYS */:
      return "always";
    case 1 /* NEVER */:
      return "never";
    case 2 /* REMEMBER_LAST */:
      return "preserve";
    default:
      return "preserve";
  }
}
const partOpensMaximizedByString = {
  [partOpensMaximizedSettingToString(0 /* ALWAYS */)]: 0 /* ALWAYS */,
  [partOpensMaximizedSettingToString(1 /* NEVER */)]: 1 /* NEVER */,
  [partOpensMaximizedSettingToString(2 /* REMEMBER_LAST */)]: 2 /* REMEMBER_LAST */
};
function partOpensMaximizedFromString(str) {
  return partOpensMaximizedByString[str];
}
function isMultiWindowPart(part) {
  return part === "workbench.parts.editor" /* EDITOR_PART */ || part === "workbench.parts.statusbar" /* STATUSBAR_PART */ || part === "workbench.parts.titlebar" /* TITLEBAR_PART */;
}
function shouldShowCustomTitleBar(configurationService, window, menuBarToggled) {
  if (!hasCustomTitlebar(configurationService)) {
    return false;
  }
  const inFullscreen = isFullscreen(window);
  const nativeTitleBarEnabled = hasNativeTitlebar(configurationService);
  if (!isWeb) {
    const showCustomTitleBar = configurationService.getValue(TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY);
    if (showCustomTitleBar === CustomTitleBarVisibility.NEVER && nativeTitleBarEnabled || showCustomTitleBar === CustomTitleBarVisibility.WINDOWED && inFullscreen) {
      return false;
    }
  }
  if (!isTitleBarEmpty(configurationService)) {
    return true;
  }
  if (nativeTitleBarEnabled && hasNativeMenu(configurationService)) {
    return false;
  }
  if (isMacintosh && isNative) {
    return !inFullscreen;
  }
  if (isNative && !inFullscreen) {
    return true;
  }
  if (isWCOEnabled() && !inFullscreen) {
    return true;
  }
  const menuBarVisibility = !isAuxiliaryWindow(window) ? getMenuBarVisibility(configurationService) : "hidden";
  switch (menuBarVisibility) {
    case "classic":
      return !inFullscreen || !!menuBarToggled;
    case "compact":
    case "hidden":
      return false;
    case "toggle":
      return !!menuBarToggled;
    case "visible":
      return true;
    default:
      return isWeb ? false : !inFullscreen || !!menuBarToggled;
  }
}
function isTitleBarEmpty(configurationService) {
  if (configurationService.getValue("window.commandCenter" /* COMMAND_CENTER */)) {
    return false;
  }
  const activityBarPosition = configurationService.getValue("workbench.activityBar.location" /* ACTIVITY_BAR_LOCATION */);
  if (activityBarPosition === "top" /* TOP */ || activityBarPosition === "bottom" /* BOTTOM */) {
    return false;
  }
  const editorActionsLocation = configurationService.getValue("workbench.editor.editorActionsLocation" /* EDITOR_ACTIONS_LOCATION */);
  const editorTabsMode = configurationService.getValue("workbench.editor.showTabs" /* EDITOR_TABS_MODE */);
  if (editorActionsLocation === "titleBar" /* TITLEBAR */ || editorActionsLocation === "default" /* DEFAULT */ && editorTabsMode === "none" /* NONE */) {
    return false;
  }
  if (configurationService.getValue("workbench.layoutControl.enabled" /* LAYOUT_ACTIONS */)) {
    return false;
  }
  return true;
}
export {
  ActivityBarPosition,
  EditorActionsLocation,
  EditorTabsMode,
  FLOATING_PANEL_INNER_MARGIN,
  FLOATING_PANEL_MARGIN,
  IWorkbenchLayoutService,
  LayoutSettings,
  PartOpensMaximizedOptions,
  Parts,
  Position,
  ZenModeSettings,
  getFloatingEditorVerticalMargins,
  getFloatingOuterEdgeOwners,
  getFloatingOuterGutterEdges,
  getFloatingPaneCompositeHorizontalMargins,
  getFloatingPaneCompositeVerticalMargins,
  getFloatingSidebarSiblingToEditorStatus,
  isFloatingTopEdgeExposed,
  isHorizontal,
  isMultiWindowPart,
  partOpensMaximizedFromString,
  positionFromString,
  positionToString,
  shouldShowCustomTitleBar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxsYXlvdXRcXGJyb3dzZXJcXGxheW91dFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyByZWZpbmVTZXJ2aWNlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0LmpzJztcbmltcG9ydCB7IElEaW1lbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERpcmVjdGlvbiwgSVZpZXdTaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2dyaWQvZ3JpZC5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCwgaXNOYXRpdmUsIGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgaXNBdXhpbGlhcnlXaW5kb3csIG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEN1c3RvbVRpdGxlQmFyVmlzaWJpbGl0eSwgVGl0bGVCYXJTZXR0aW5nLCBnZXRNZW51QmFyVmlzaWJpbGl0eSwgaGFzQ3VzdG9tVGl0bGViYXIsIGhhc05hdGl2ZU1lbnUsIGhhc05hdGl2ZVRpdGxlYmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgaXNGdWxsc2NyZWVuLCBpc1dDT0VuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvYnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuZXhwb3J0IGNvbnN0IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlID0gcmVmaW5lU2VydmljZURlY29yYXRvcjxJTGF5b3V0U2VydmljZSwgSVdvcmtiZW5jaExheW91dFNlcnZpY2U+KElMYXlvdXRTZXJ2aWNlKTtcblxuZXhwb3J0IGNvbnN0IGVudW0gUGFydHMge1xuXHRUSVRMRUJBUl9QQVJUID0gJ3dvcmtiZW5jaC5wYXJ0cy50aXRsZWJhcicsXG5cdEJBTk5FUl9QQVJUID0gJ3dvcmtiZW5jaC5wYXJ0cy5iYW5uZXInLFxuXHRBQ1RJVklUWUJBUl9QQVJUID0gJ3dvcmtiZW5jaC5wYXJ0cy5hY3Rpdml0eWJhcicsXG5cdFNJREVCQVJfUEFSVCA9ICd3b3JrYmVuY2gucGFydHMuc2lkZWJhcicsXG5cdFBBTkVMX1BBUlQgPSAnd29ya2JlbmNoLnBhcnRzLnBhbmVsJyxcblx0QVVYSUxJQVJZQkFSX1BBUlQgPSAnd29ya2JlbmNoLnBhcnRzLmF1eGlsaWFyeWJhcicsXG5cdFNFU1NJT05TX1BBUlQgPSAnd29ya2JlbmNoLnBhcnRzLnNlc3Npb25zJyxcblx0Q1VTVE9NX1ZJRVdfR1JJRF9QQVJUID0gJ3dvcmtiZW5jaC5wYXJ0cy5jdXN0b21WaWV3R3JpZCcsXG5cdEVESVRPUl9QQVJUID0gJ3dvcmtiZW5jaC5wYXJ0cy5lZGl0b3InLFxuXHRTVEFUVVNCQVJfUEFSVCA9ICd3b3JrYmVuY2gucGFydHMuc3RhdHVzYmFyJ1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBaZW5Nb2RlU2V0dGluZ3Mge1xuXHRTSE9XX1RBQlMgPSAnemVuTW9kZS5zaG93VGFicycsXG5cdEhJREVfTElORU5VTUJFUlMgPSAnemVuTW9kZS5oaWRlTGluZU51bWJlcnMnLFxuXHRISURFX1NUQVRVU0JBUiA9ICd6ZW5Nb2RlLmhpZGVTdGF0dXNCYXInLFxuXHRISURFX0FDVElWSVRZQkFSID0gJ3plbk1vZGUuaGlkZUFjdGl2aXR5QmFyJyxcblx0Q0VOVEVSX0xBWU9VVCA9ICd6ZW5Nb2RlLmNlbnRlckxheW91dCcsXG5cdEZVTExTQ1JFRU4gPSAnemVuTW9kZS5mdWxsU2NyZWVuJyxcblx0UkVTVE9SRSA9ICd6ZW5Nb2RlLnJlc3RvcmUnLFxuXHRTSUxFTlRfTk9USUZJQ0FUSU9OUyA9ICd6ZW5Nb2RlLnNpbGVudE5vdGlmaWNhdGlvbnMnLFxufVxuXG5leHBvcnQgY29uc3QgZW51bSBMYXlvdXRTZXR0aW5ncyB7XG5cdEFDVElWSVRZX0JBUl9MT0NBVElPTiA9ICd3b3JrYmVuY2guYWN0aXZpdHlCYXIubG9jYXRpb24nLFxuXHRBQ1RJVklUWV9CQVJfQVVUT19ISURFID0gJ3dvcmtiZW5jaC5hY3Rpdml0eUJhci5hdXRvSGlkZScsXG5cdEFDVElWSVRZX0JBUl9DT01QQUNUID0gJ3dvcmtiZW5jaC5hY3Rpdml0eUJhci5jb21wYWN0Jyxcblx0RURJVE9SX1RBQlNfTU9ERSA9ICd3b3JrYmVuY2guZWRpdG9yLnNob3dUYWJzJyxcblx0RURJVE9SX0FDVElPTlNfTE9DQVRJT04gPSAnd29ya2JlbmNoLmVkaXRvci5lZGl0b3JBY3Rpb25zTG9jYXRpb24nLFxuXHRDT01NQU5EX0NFTlRFUiA9ICd3aW5kb3cuY29tbWFuZENlbnRlcicsXG5cdExBWU9VVF9BQ1RJT05TID0gJ3dvcmtiZW5jaC5sYXlvdXRDb250cm9sLmVuYWJsZWQnLFxuXHRTSEFET1dTID0gJ3dvcmtiZW5jaC5zaGFkb3dzJyxcblx0TU9ERVJOX1VJID0gJ3dvcmtiZW5jaC5leHBlcmltZW50YWwubW9kZXJuVUknLFxuXHRNT0RFUk5fVUlfVVBQRVJDQVNFX1ZJRVdfSEVBREVSUyA9ICd3b3JrYmVuY2guZXhwZXJpbWVudGFsLm1vZGVyblVJVXBwZXJjYXNlVmlld0hlYWRlcnMnXG59XG5cbi8qKlxuICogVGhlIG1hcmdpbiAoaW4gcGl4ZWxzKSByZXNlcnZlZCBvbiBlYWNoIHNpZGUgb2YgYSBwYXJ0IHdoZW4gdGhlIE1vZGVybiBVSSBVcGRhdGVcbiAqIGV4cGVyaW1lbnQgKGBMYXlvdXRTZXR0aW5ncy5NT0RFUk5fVUlgKSBpcyBlbmFibGVkLiBQYXJ0cyBncm93IG9yIHNocmluayB0aGVpclxuICogY29udGVudCBieSB0aGlzIGFtb3VudCB0byBsZWF2ZSByb29tIGZvciB0aGUgbWFyZ2luL2JvcmRlciBhcHBsaWVkIGluIENTU1xuICogKGBzcmMvdnMvd29ya2JlbmNoL2Jyb3dzZXIvbWVkaWEvZmxvYXRpbmdQYW5lbHMuY3NzYCwgYC5mbG9hdGluZy1wYW5lbHNgKS5cbiAqIEtlZXAgaW4gc3luYyB3aXRoIHRoZSBgLS12c2NvZGUtc3BhY2luZy1zaXplNDBgICg0cHgpIHRva2VuIHVzZWQgdGhlcmUuXG4gKi9cbmV4cG9ydCBjb25zdCBGTE9BVElOR19QQU5FTF9NQVJHSU4gPSA0O1xuXG4vKipcbiAqIFRoZSB0cmFpbGluZyBjYXJkIG1hcmdpbiAoaW4gcGl4ZWxzKSB3aGVuIHRoZSBNb2Rlcm4gVUkgVXBkYXRlIGV4cGVyaW1lbnQgaXNcbiAqIGVuYWJsZWQuIFRvZ2V0aGVyIHdpdGggdGhlIG5leHQgY2FyZCdzIGxlYWRpbmcge0BsaW5rIEZMT0FUSU5HX1BBTkVMX01BUkdJTn0sXG4gKiBpdCBmb3JtcyB0aGUgNHB4IGludGVyLWNhcmQgZ2FwLiBLZWVwIGluIHN5bmMgd2l0aCB0aGVcbiAqIGAtLXZzY29kZS1zcGFjaW5nLXNpemVOb25lYCAoMHB4KSB0b2tlbiB1c2VkIGluIGBmbG9hdGluZ1BhbmVscy5jc3NgLlxuICovXG5leHBvcnQgY29uc3QgRkxPQVRJTkdfUEFORUxfSU5ORVJfTUFSR0lOID0gMDtcblxuZXhwb3J0IGNvbnN0IGVudW0gQWN0aXZpdHlCYXJQb3NpdGlvbiB7XG5cdERFRkFVTFQgPSAnZGVmYXVsdCcsXG5cdFRPUCA9ICd0b3AnLFxuXHRCT1RUT00gPSAnYm90dG9tJyxcblx0SElEREVOID0gJ2hpZGRlbidcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gRWRpdG9yVGFic01vZGUge1xuXHRNVUxUSVBMRSA9ICdtdWx0aXBsZScsXG5cdFNJTkdMRSA9ICdzaW5nbGUnLFxuXHROT05FID0gJ25vbmUnXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEVkaXRvckFjdGlvbnNMb2NhdGlvbiB7XG5cdERFRkFVTFQgPSAnZGVmYXVsdCcsXG5cdFRJVExFQkFSID0gJ3RpdGxlQmFyJyxcblx0SElEREVOID0gJ2hpZGRlbidcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gUG9zaXRpb24ge1xuXHRMRUZULFxuXHRSSUdIVCxcblx0Qk9UVE9NLFxuXHRUT1Bcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSG9yaXpvbnRhbChwb3NpdGlvbjogUG9zaXRpb24pOiBib29sZWFuIHtcblx0cmV0dXJuIHBvc2l0aW9uID09PSBQb3NpdGlvbi5CT1RUT00gfHwgcG9zaXRpb24gPT09IFBvc2l0aW9uLlRPUDtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gUGFydE9wZW5zTWF4aW1pemVkT3B0aW9ucyB7XG5cdEFMV0FZUyxcblx0TkVWRVIsXG5cdFJFTUVNQkVSX0xBU1Rcbn1cblxuZXhwb3J0IHR5cGUgUGFuZWxBbGlnbm1lbnQgPSAnbGVmdCcgfCAnY2VudGVyJyB8ICdyaWdodCcgfCAnanVzdGlmeSc7XG5cbmV4cG9ydCBmdW5jdGlvbiBwb3NpdGlvblRvU3RyaW5nKHBvc2l0aW9uOiBQb3NpdGlvbik6IHN0cmluZyB7XG5cdHN3aXRjaCAocG9zaXRpb24pIHtcblx0XHRjYXNlIFBvc2l0aW9uLkxFRlQ6IHJldHVybiAnbGVmdCc7XG5cdFx0Y2FzZSBQb3NpdGlvbi5SSUdIVDogcmV0dXJuICdyaWdodCc7XG5cdFx0Y2FzZSBQb3NpdGlvbi5CT1RUT006IHJldHVybiAnYm90dG9tJztcblx0XHRjYXNlIFBvc2l0aW9uLlRPUDogcmV0dXJuICd0b3AnO1xuXHRcdGRlZmF1bHQ6IHJldHVybiAnYm90dG9tJztcblx0fVxufVxuXG4vKipcbiAqIFdoZXRoZXIgdGhlIGZsb2F0aW5nIGNhcmRzIHNpdCBhZ2FpbnN0IHRoZSB0b3Agd2luZG93IGVkZ2UgYW5kIHRha2UgdGhlIGRvdWJsZWQgb3V0ZXJcbiAqIGd1dHRlci4gQm90aCBncmlkIHJvd3MgYWJvdmUgdGhlIG1pZGRsZSBzZWN0aW9uICh0aXRsZSBiYXIgYW5kIGJhbm5lcikgbXVzdCBiZSBoaWRkZW4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0Zsb2F0aW5nVG9wRWRnZUV4cG9zZWQobGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIHRhcmdldFdpbmRvdzogV2luZG93KTogYm9vbGVhbiB7XG5cdHJldHVybiAhbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuVElUTEVCQVJfUEFSVCwgdGFyZ2V0V2luZG93KSAmJiAhbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuQkFOTkVSX1BBUlQpO1xufVxuXG4vKipcbiAqIERldGVybWluZXMgd2hpY2ggd2luZG93IGVkZ2UgKGxlZnQvcmlnaHQpIGlzIG93bmVkIGJ5IHRoZSBvdXRlcm1vc3QgZmxvYXRpbmcgY2FyZFxuICogd2hlbiB0aGUgTW9kZXJuIFVJIFVwZGF0ZSBleHBlcmltZW50IGlzIGVuYWJsZWQsIGFuZCB3aGljaCB7QGxpbmsgUGFydHN9IG93bnMgaXQuXG4gKiBUaGUgb3duaW5nIHBhcnQgcmVjZWl2ZXMgYSBkb3VibGVkIG91dGVyIGd1dHRlciBzbyBpdHMgY29udGVudHMgZG8gbm90IGh1ZyB0aGVcbiAqIHdpbmRvdyBlZGdlLiBSZXR1cm5zIGB1bmRlZmluZWRgIGZvciBhbiBlZGdlIHdoZW4gbm8gZmxvYXRpbmcgY2FyZCBvd25zIGl0IChmb3JcbiAqIGV4YW1wbGUgdGhlIGFjdGl2aXR5IGJhciBzaXRzIGZsdXNoIGFnYWluc3QgdGhhdCBlZGdlKSBvciB3aGVuIHRoZSBleHBlcmltZW50IGlzXG4gKiBkaXNhYmxlZC5cbiAqXG4gKiBUaGUgaG9yaXpvbnRhbCBvcmRlciBvZiB0aGUgcGFydHMgaXMgcmVjb25zdHJ1Y3RlZCBmcm9tIHRoZSBzYW1lIGlucHV0cyB0aGUgZ3JpZFxuICogbGF5b3V0IHVzZXMgKG1pcnJvcnMgYExheW91dC5hZGp1c3RQYXJ0UG9zaXRpb25zYCBpbiBgc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL2xheW91dC50c2ApOiB0aGUgYWN0aXZpdHkgYmFyIGFuZCBwcmltYXJ5IHNpZGUgYmFyIHNpdFxuICogb24gYGdldFNpZGVCYXJQb3NpdGlvbigpYCwgdGhlIHNlY29uZGFyeSBzaWRlIGJhciBvbiB0aGUgb3Bwb3NpdGUgc2lkZSwgdGhlIGVkaXRvciBpblxuICogdGhlIG1pZGRsZSwgYW5kIGEgdmVydGljYWwgKGxlZnQvcmlnaHQpIHBhbmVsIGltbWVkaWF0ZWx5IG5leHQgdG8gdGhlIGVkaXRvciBvbiBpdHNcbiAqIHBsYWNlbWVudCBzaWRlLiBUaGUgb3V0ZXJtb3N0ICp2aXNpYmxlKiBwYXJ0IG9uIGVhY2ggZWRnZSB3aW5zOyB0aGUgYWN0aXZpdHkgYmFyIGlzIG5vdFxuICogYSBmbG9hdGluZyBjYXJkLCBzbyBpdCB5aWVsZHMgbm8gb3duZXIuIEEgaGlkZGVuIGVkaXRvciBpcyBza2lwcGVkLCBzbyBhIG1heGltaXplZCBzaWRlXG4gKiBiYXIgKHdoaWNoIHNwYW5zIHRoZSBmdWxsIGNvbnRlbnQgd2lkdGgpIGlzIGNvcnJlY3RseSBkZXRlY3RlZCBhcyB0aGUgb3duZXIgb24gYm90aCBlZGdlcy5cbiAqXG4gKiBDb25zdW1lZCBieSBgQWJzdHJhY3RQYW5lQ29tcG9zaXRlUGFydGAgKHNpZGUgYmFycyBhbmQgcGFuZWwpIGFuZCBgRWRpdG9yUGFydGBcbiAqIChtYWluIGVkaXRvcikgc28gdGhlIGRvdWJsZWQtZ3V0dGVyIGRlY2lzaW9uIHN0YXlzIGluIHN5bmMgYmV0d2VlbiB0aGVtLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0RmxvYXRpbmdPdXRlckVkZ2VPd25lcnMobGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UpOiB7IGxlZnQ6IFBhcnRzIHwgdW5kZWZpbmVkOyByaWdodDogUGFydHMgfCB1bmRlZmluZWQgfSB7XG5cdGlmICghbGF5b3V0U2VydmljZS5pc0Zsb2F0aW5nUGFuZWxzRW5hYmxlZCgpKSB7XG5cdFx0cmV0dXJuIHsgbGVmdDogdW5kZWZpbmVkLCByaWdodDogdW5kZWZpbmVkIH07XG5cdH1cblxuXHRjb25zdCBzaWRlQmFyTGVmdCA9IGxheW91dFNlcnZpY2UuZ2V0U2lkZUJhclBvc2l0aW9uKCkgPT09IFBvc2l0aW9uLkxFRlQ7XG5cdGNvbnN0IHBhbmVsUG9zaXRpb24gPSBsYXlvdXRTZXJ2aWNlLmdldFBhbmVsUG9zaXRpb24oKTtcblx0Y29uc3QgdmVydGljYWxQYW5lbFZpc2libGUgPSAhaXNIb3Jpem9udGFsKHBhbmVsUG9zaXRpb24pICYmIGxheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpO1xuXG5cdC8vIEEgdmlzaWJsZSB2ZXJ0aWNhbCBwYW5lbCBzaXRzIGltbWVkaWF0ZWx5IG91dHNpZGUgdGhlIGVkaXRvciBvbiBpdHMgcGxhY2VtZW50XG5cdC8vIHNpZGUgKGJldHdlZW4gdGhlIGVkaXRvciBhbmQgdGhlIHNpZGUvYXV4IGJhciBvbiB0aGF0IHNpZGUpLlxuXHRjb25zdCBwYW5lbEluTGVmdFNlcXVlbmNlID0gdmVydGljYWxQYW5lbFZpc2libGUgJiYgcGFuZWxQb3NpdGlvbiA9PT0gUG9zaXRpb24uTEVGVDtcblx0Y29uc3QgcGFuZWxJblJpZ2h0U2VxdWVuY2UgPSB2ZXJ0aWNhbFBhbmVsVmlzaWJsZSAmJiBwYW5lbFBvc2l0aW9uID09PSBQb3NpdGlvbi5SSUdIVDtcblxuXHQvLyBUaGUgZnVsbCB3aW5kb3cgb3JkZXIgb2YgdGhlIGZsb2F0YWJsZSBwYXJ0cywgbGVmdCAtPiByaWdodDogdGhlIGFjdGl2aXR5IGJhciBhbmRcblx0Ly8gcHJpbWFyeSBzaWRlIGJhciBzaXQgdG9nZXRoZXIgb24gYGdldFNpZGVCYXJQb3NpdGlvbigpYCAoYWN0aXZpdHkgYmFyIG91dGVybW9zdCksIHRoZVxuXHQvLyBzZWNvbmRhcnkgc2lkZSBiYXIgb24gdGhlIG9wcG9zaXRlIHNpZGUsIGEgdmVydGljYWwgcGFuZWwgaW1tZWRpYXRlbHkgYmVzaWRlIHRoZSBlZGl0b3Jcblx0Ly8gb24gaXRzIHBsYWNlbWVudCBzaWRlLCBhbmQgdGhlIGVkaXRvciBpbiB0aGUgbWlkZGxlLiBFYWNoIGVkZ2UgaXMgcmVzb2x2ZWQgYnkgd2Fsa2luZ1xuXHQvLyB0aGlzIG9yZGVyIGlud2FyZCB0byB0aGUgZmlyc3QgKnZpc2libGUqIGNhcmQsIHNvIGEgaGlkZGVuIGVkaXRvciAoZS5nLiBhIG1heGltaXplZCBzaWRlXG5cdC8vIGJhciB0aGF0IHNwYW5zIHRoZSBmdWxsIGNvbnRlbnQgd2lkdGgpIGlzIHNraXBwZWQgYW5kIHRoZSBzcGFubmluZyBjYXJkIGlzIGRldGVjdGVkIG9uXG5cdC8vIGJvdGggZWRnZXMuXG5cdGNvbnN0IHNpZGVCYXJHcm91cDogUGFydHNbXSA9IFtQYXJ0cy5BQ1RJVklUWUJBUl9QQVJULCBQYXJ0cy5TSURFQkFSX1BBUlRdO1xuXHRjb25zdCBwYW5lbEdyb3VwOiBQYXJ0c1tdID0gW1BhcnRzLlBBTkVMX1BBUlRdO1xuXHRjb25zdCBmdWxsT3JkZXI6IFBhcnRzW10gPSBzaWRlQmFyTGVmdFxuXHRcdD8gW1xuXHRcdFx0Li4uc2lkZUJhckdyb3VwLFxuXHRcdFx0Li4uKHBhbmVsSW5MZWZ0U2VxdWVuY2UgPyBwYW5lbEdyb3VwIDogW10pLFxuXHRcdFx0UGFydHMuRURJVE9SX1BBUlQsXG5cdFx0XHQuLi4ocGFuZWxJblJpZ2h0U2VxdWVuY2UgPyBwYW5lbEdyb3VwIDogW10pLFxuXHRcdFx0UGFydHMuQVVYSUxJQVJZQkFSX1BBUlRcblx0XHRdXG5cdFx0OiBbXG5cdFx0XHRQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCxcblx0XHRcdC4uLihwYW5lbEluTGVmdFNlcXVlbmNlID8gcGFuZWxHcm91cCA6IFtdKSxcblx0XHRcdFBhcnRzLkVESVRPUl9QQVJULFxuXHRcdFx0Li4uKHBhbmVsSW5SaWdodFNlcXVlbmNlID8gcGFuZWxHcm91cCA6IFtdKSxcblx0XHRcdC4uLlsuLi5zaWRlQmFyR3JvdXBdLnJldmVyc2UoKSAvLyBhY3Rpdml0eSBiYXIgaXMgb3V0ZXJtb3N0IG9uIHRoZSByaWdodCBlZGdlXG5cdFx0XTtcblxuXHRyZXR1cm4ge1xuXHRcdGxlZnQ6IHJlc29sdmVGbG9hdGluZ091dGVyT3duZXIobGF5b3V0U2VydmljZSwgZnVsbE9yZGVyKSxcblx0XHRyaWdodDogcmVzb2x2ZUZsb2F0aW5nT3V0ZXJPd25lcihsYXlvdXRTZXJ2aWNlLCBbLi4uZnVsbE9yZGVyXS5yZXZlcnNlKCkpXG5cdH07XG59XG5cbi8qKlxuICogV2Fsa3MgdGhlIGdpdmVuIHdpbmRvdyBvcmRlciAob3V0ZXJtb3N0IC0+IGlubmVybW9zdCBmcm9tIGEgd2luZG93IGVkZ2UpIGFuZCByZXR1cm5zIHRoZVxuICogZmlyc3QgdmlzaWJsZSBwYXJ0IGFzIHRoZSBvd25lciBvZiB0aGF0IGVkZ2UuIFRoZSBhY3Rpdml0eSBiYXIgaHVncyB0aGUgd2luZG93IGVkZ2UgYnV0IGlzXG4gKiBub3QgYSBmbG9hdGluZyBjYXJkLCBzbyBhIHZpc2libGUgYWN0aXZpdHkgYmFyIHlpZWxkcyBubyBvd25lci4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIG5vXG4gKiB2aXNpYmxlIGNhcmQgc2l0cyBvbiB0aGUgZWRnZS5cbiAqL1xuZnVuY3Rpb24gcmVzb2x2ZUZsb2F0aW5nT3V0ZXJPd25lcihsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgb3JkZXJlZFBhcnRzOiBQYXJ0c1tdKTogUGFydHMgfCB1bmRlZmluZWQge1xuXHRmb3IgKGNvbnN0IHBhcnQgb2Ygb3JkZXJlZFBhcnRzKSB7XG5cdFx0Ly8gVGhlIGVkaXRvciBpcyB0aGUgb25seSBtdWx0aS13aW5kb3cgcGFydCBpbiB0aGlzIG9yZGVyOyBpdHMgbWFpbi13aW5kb3cgdmlzaWJpbGl0eVxuXHRcdC8vIGlzIHdoYXQgbWF0dGVycyBmb3IgdGhlIG1haW4td2luZG93IGZsb2F0aW5nIGxheW91dC5cblx0XHRjb25zdCB2aXNpYmxlID0gcGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlRcblx0XHRcdD8gbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIG1haW5XaW5kb3cpXG5cdFx0XHQ6IGxheW91dFNlcnZpY2UuaXNWaXNpYmxlKHBhcnQgYXMgU0lOR0xFX1dJTkRPV19QQVJUUyk7XG5cdFx0aWYgKCF2aXNpYmxlKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHQvLyBUaGUgYWN0aXZpdHkgYmFyIGh1Z3MgdGhlIHdpbmRvdyBlZGdlIGJ1dCBpcyBub3QgYSBmbG9hdGluZyBjYXJkLlxuXHRcdHJldHVybiBwYXJ0ID09PSBQYXJ0cy5BQ1RJVklUWUJBUl9QQVJUID8gdW5kZWZpbmVkIDogcGFydDtcblx0fVxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogVGhlIHdpbmRvdyBlZGdlcyBvbiB3aGljaCB0aGUgZ2l2ZW4gcGFydCBpcyB0aGUgb3V0ZXJtb3N0IGZsb2F0aW5nIGNhcmQgYW5kIHNob3VsZFxuICogdGhlcmVmb3JlIHJlY2VpdmUgYSBkb3VibGVkIG91dGVyIGd1dHRlci4gQSBwYXJ0IGNhbiBvd24gYm90aCBlZGdlcyBhdCBvbmNlIChub3RhYmx5XG4gKiBhIGhvcml6b250YWwgYm90dG9tL3RvcCBwYW5lbCB0aGF0IHNwYW5zIHRoZSBmdWxsIHdpZHRoIHdoZW4gdGhlIGJhcnMgYmVzaWRlIGl0IGFyZVxuICogaGlkZGVuIG9yIG5vdCBmdWxsLWhlaWdodCkuIENvbnZlbmllbmNlIHdyYXBwZXIgYXJvdW5kIHtAbGluayBnZXRGbG9hdGluZ091dGVyRWRnZU93bmVyc30uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRGbG9hdGluZ091dGVyR3V0dGVyRWRnZXMobGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIHBhcnRJZDogUGFydHMpOiB7IGxlZnQ6IGJvb2xlYW47IHJpZ2h0OiBib29sZWFuIH0ge1xuXHRpZiAoIWxheW91dFNlcnZpY2UuaXNGbG9hdGluZ1BhbmVsc0VuYWJsZWQoKSkge1xuXHRcdHJldHVybiB7IGxlZnQ6IGZhbHNlLCByaWdodDogZmFsc2UgfTtcblx0fVxuXG5cdC8vIEEgaG9yaXpvbnRhbCAoYm90dG9tL3RvcCkgcGFuZWwgY2FuIHJlYWNoIGJvdGggd2luZG93IGVkZ2VzIHNpbXVsdGFuZW91c2x5LCBzbyBpdFxuXHQvLyBpcyBub3QgY2FwdHVyZWQgYnkgdGhlIHNpbmdsZS1vd25lci1wZXItZWRnZSBtb2RlbCBhbmQgaXMgcmVzb2x2ZWQgc2VwYXJhdGVseS5cblx0aWYgKHBhcnRJZCA9PT0gUGFydHMuUEFORUxfUEFSVCAmJiBpc0hvcml6b250YWwobGF5b3V0U2VydmljZS5nZXRQYW5lbFBvc2l0aW9uKCkpKSB7XG5cdFx0cmV0dXJuIGdldEZsb2F0aW5nSG9yaXpvbnRhbFBhbmVsT3V0ZXJFZGdlcyhsYXlvdXRTZXJ2aWNlKTtcblx0fVxuXG5cdGNvbnN0IG93bmVycyA9IGdldEZsb2F0aW5nT3V0ZXJFZGdlT3duZXJzKGxheW91dFNlcnZpY2UpO1xuXHRyZXR1cm4geyBsZWZ0OiBvd25lcnMubGVmdCA9PT0gcGFydElkLCByaWdodDogb3duZXJzLnJpZ2h0ID09PSBwYXJ0SWQgfTtcbn1cblxuLyoqXG4gKiBIb3Jpem9udGFsIG1hcmdpbnMgKGluIHBpeGVscykgYSBmbG9hdGluZyBwYW5lIGNvbXBvc2l0ZSByZXNlcnZlcywgbWlycm9yaW5nIHRoZVxuICogbWFyZ2lucyBpbiBgZmxvYXRpbmdQYW5lbHMuY3NzYC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEZsb2F0aW5nUGFuZUNvbXBvc2l0ZUhvcml6b250YWxNYXJnaW5zKGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBwYXJ0SWQ6IFBhcnRzKTogeyBsZWZ0OiBudW1iZXI7IHJpZ2h0OiBudW1iZXIgfSB7XG5cdGlmICghbGF5b3V0U2VydmljZS5pc0Zsb2F0aW5nUGFuZWxzRW5hYmxlZCgpKSB7XG5cdFx0cmV0dXJuIHsgbGVmdDogMCwgcmlnaHQ6IDAgfTtcblx0fVxuXG5cdGNvbnN0IG91dGVyR3V0dGVyID0gZ2V0RmxvYXRpbmdPdXRlckd1dHRlckVkZ2VzKGxheW91dFNlcnZpY2UsIHBhcnRJZCk7XG5cdHJldHVybiB7XG5cdFx0bGVmdDogb3V0ZXJHdXR0ZXIubGVmdCA/IEZMT0FUSU5HX1BBTkVMX01BUkdJTiAqIDIgOiBGTE9BVElOR19QQU5FTF9NQVJHSU4sXG5cdFx0cmlnaHQ6IG91dGVyR3V0dGVyLnJpZ2h0ID8gRkxPQVRJTkdfUEFORUxfTUFSR0lOICogMiA6IEZMT0FUSU5HX1BBTkVMX0lOTkVSX01BUkdJTixcblx0fTtcbn1cblxuLyoqXG4gKiBXaGV0aGVyIHRoZSBwcmltYXJ5IHNpZGViYXIgYW5kIGF1eGlsaWFyeSBiYXIgYXJlIGVhY2ggaW4gdGhlIHNhbWUgZ3JpZCByb3cgYXMgdGhlXG4gKiBlZGl0b3IgKHNpYmxpbmcgdG8gdGhlIGVkaXRvcikgZm9yIGEgaG9yaXpvbnRhbCBwYW5lbC4gQSBiYXIgdGhhdCBpcyBhIHNpYmxpbmcgaXMgbm90XG4gKiBmdWxsLWhlaWdodDsgaXQgc2l0cyBhYm92ZSBvciBiZWxvdyB0aGUgcGFuZWwgcm93IHJhdGhlciB0aGFuIHNwYW5uaW5nIHRoZSBmdWxsIGhlaWdodC5cbiAqIE1pcnJvcnMgdGhlIHNpZGVCYXJTaWJsaW5nVG9FZGl0b3IgLyBhdXhpbGlhcnlCYXJTaWJsaW5nVG9FZGl0b3IgZm9ybXVsYSB1c2VkIGluXG4gKiBhZGp1c3RQYXJ0UG9zaXRpb25zKCkgaW4gbGF5b3V0LnRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0RmxvYXRpbmdTaWRlYmFyU2libGluZ1RvRWRpdG9yU3RhdHVzKFxuXHRsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZVxuKTogeyBzaWRlQmFyOiBib29sZWFuOyBhdXhCYXI6IGJvb2xlYW4gfSB7XG5cdGNvbnN0IGFsaWdubWVudCA9IGxheW91dFNlcnZpY2UuZ2V0UGFuZWxBbGlnbm1lbnQoKTtcblx0Y29uc3Qgc2lkZUJhck9uTGVmdCA9IGxheW91dFNlcnZpY2UuZ2V0U2lkZUJhclBvc2l0aW9uKCkgPT09IFBvc2l0aW9uLkxFRlQ7XG5cdHJldHVybiB7XG5cdFx0c2lkZUJhcjogIShhbGlnbm1lbnQgPT09ICdjZW50ZXInIHx8IChzaWRlQmFyT25MZWZ0ICYmIGFsaWdubWVudCA9PT0gJ3JpZ2h0JykgfHwgKCFzaWRlQmFyT25MZWZ0ICYmIGFsaWdubWVudCA9PT0gJ2xlZnQnKSksXG5cdFx0YXV4QmFyOiAhKGFsaWdubWVudCA9PT0gJ2NlbnRlcicgfHwgKCFzaWRlQmFyT25MZWZ0ICYmIGFsaWdubWVudCA9PT0gJ3JpZ2h0JykgfHwgKHNpZGVCYXJPbkxlZnQgJiYgYWxpZ25tZW50ID09PSAnbGVmdCcpKSxcblx0fTtcbn1cblxuLyoqXG4gKiBWZXJ0aWNhbCBtYXJnaW5zIChpbiBwaXhlbHMpIGEgZmxvYXRpbmcgcGFuZSBjb21wb3NpdGUgKHByaW1hcnkgc2lkZSBiYXIsIHNlY29uZGFyeSBzaWRlXG4gKiBiYXIgb3IgcGFuZWwpIHJlc2VydmVzLCBtaXJyb3JpbmcgdGhlIG1hcmdpbnMgaW4gYGZsb2F0aW5nUGFuZWxzLmNzc2AuIEVhY2ggZWRnZSB0YWtlcyB0aGVcbiAqIGRvdWJsZWQgb3V0ZXIgZ3V0dGVyIG9ubHkgd2hlbiBpdCBmYWNlcyB0aGUgd2luZG93IHJhdGhlciB0aGFuIGFub3RoZXIgY2FyZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEZsb2F0aW5nUGFuZUNvbXBvc2l0ZVZlcnRpY2FsTWFyZ2lucyhcblx0bGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdHBhcnRJZDogUGFydHMsXG5cdHRhcmdldFdpbmRvdzogV2luZG93XG4pOiB7IHRvcDogbnVtYmVyOyBib3R0b206IG51bWJlciB9IHtcblx0aWYgKCFsYXlvdXRTZXJ2aWNlLmlzRmxvYXRpbmdQYW5lbHNFbmFibGVkKCkpIHtcblx0XHRyZXR1cm4geyB0b3A6IDAsIGJvdHRvbTogMCB9O1xuXHR9XG5cblx0Y29uc3QgdG9wRWRnZUV4cG9zZWQgPSBpc0Zsb2F0aW5nVG9wRWRnZUV4cG9zZWQobGF5b3V0U2VydmljZSwgdGFyZ2V0V2luZG93KTtcblxuXHRjb25zdCBwYW5lbFBvc2l0aW9uID0gbGF5b3V0U2VydmljZS5nZXRQYW5lbFBvc2l0aW9uKCk7XG5cdGNvbnN0IHBhbmVsVmlzaWJsZSA9IGxheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpO1xuXHRjb25zdCBpc1NpZGVCYXIgPSBwYXJ0SWQgPT09IFBhcnRzLlNJREVCQVJfUEFSVCB8fCBwYXJ0SWQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUO1xuXHRjb25zdCBzaWJsaW5nU3RhdHVzID0gZ2V0RmxvYXRpbmdTaWRlYmFyU2libGluZ1RvRWRpdG9yU3RhdHVzKGxheW91dFNlcnZpY2UpO1xuXHRjb25zdCBpc1NpYmxpbmdUb0VkaXRvciA9IHBhcnRJZCA9PT0gUGFydHMuU0lERUJBUl9QQVJUID8gc2libGluZ1N0YXR1cy5zaWRlQmFyIDogc2libGluZ1N0YXR1cy5hdXhCYXI7XG5cdGNvbnN0IGZhY2VzUGFuZWxBYm92ZSA9IHBhbmVsVmlzaWJsZSAmJiBwYW5lbFBvc2l0aW9uID09PSBQb3NpdGlvbi5UT1AgJiYgaXNTaWRlQmFyICYmIGlzU2libGluZ1RvRWRpdG9yO1xuXHRjb25zdCBmYWNlc0VkaXRvckFib3ZlID0gcGFydElkID09PSBQYXJ0cy5QQU5FTF9QQVJUICYmIHBhbmVsUG9zaXRpb24gPT09IFBvc2l0aW9uLkJPVFRPTSAmJiBsYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgdGFyZ2V0V2luZG93KTtcblx0Y29uc3QgZmFjZXNFZGl0b3JCZWxvdyA9IHBhcnRJZCA9PT0gUGFydHMuUEFORUxfUEFSVCAmJiBwYW5lbFBvc2l0aW9uID09PSBQb3NpdGlvbi5UT1A7XG5cdGNvbnN0IGZhY2VzUGFuZWxCZWxvdyA9IHBhbmVsVmlzaWJsZSAmJiBwYW5lbFBvc2l0aW9uID09PSBQb3NpdGlvbi5CT1RUT00gJiYgaXNTaWRlQmFyICYmIGlzU2libGluZ1RvRWRpdG9yO1xuXHRjb25zdCBhdFdpbmRvd0JvdHRvbSA9ICFmYWNlc0VkaXRvckJlbG93ICYmICFmYWNlc1BhbmVsQmVsb3c7XG5cdGNvbnN0IHN0YXR1c0JhclZpc2libGUgPSBsYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5TVEFUVVNCQVJfUEFSVCwgdGFyZ2V0V2luZG93KTtcblxuXHRyZXR1cm4ge1xuXHRcdHRvcDogZmFjZXNQYW5lbEFib3ZlIHx8IGZhY2VzRWRpdG9yQWJvdmUgPyBGTE9BVElOR19QQU5FTF9NQVJHSU5cblx0XHRcdDogdG9wRWRnZUV4cG9zZWQgPyBGTE9BVElOR19QQU5FTF9NQVJHSU4gKiAyIDogRkxPQVRJTkdfUEFORUxfSU5ORVJfTUFSR0lOLFxuXHRcdGJvdHRvbTogYXRXaW5kb3dCb3R0b21cblx0XHRcdD8gc3RhdHVzQmFyVmlzaWJsZSA/IEZMT0FUSU5HX1BBTkVMX01BUkdJTiA6IEZMT0FUSU5HX1BBTkVMX01BUkdJTiAqIDJcblx0XHRcdDogRkxPQVRJTkdfUEFORUxfSU5ORVJfTUFSR0lOXG5cdH07XG59XG5cbi8qKlxuICogVmVydGljYWwgbWFyZ2lucyAoaW4gcGl4ZWxzKSB0aGUgZmxvYXRpbmcgbWFpbiBlZGl0b3IgcmVzZXJ2ZXMsIG1pcnJvcmluZyB0aGUgbWFyZ2lucyBpblxuICogYGZsb2F0aW5nUGFuZWxzLmNzc2AuIEEgcGFuZWwgYWJvdmUgb3IgYmVsb3cgdGFrZXMgdGhlIHBsYWNlIG9mIHRoZSBjb3JyZXNwb25kaW5nIHdpbmRvdyBlZGdlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0RmxvYXRpbmdFZGl0b3JWZXJ0aWNhbE1hcmdpbnMoXG5cdGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHR0YXJnZXRXaW5kb3c6IFdpbmRvd1xuKTogeyB0b3A6IG51bWJlcjsgYm90dG9tOiBudW1iZXIgfSB7XG5cdGlmICghbGF5b3V0U2VydmljZS5pc0Zsb2F0aW5nUGFuZWxzRW5hYmxlZCgpKSB7XG5cdFx0cmV0dXJuIHsgdG9wOiAwLCBib3R0b206IDAgfTtcblx0fVxuXG5cdGNvbnN0IHBhbmVsVmlzaWJsZSA9IGxheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpO1xuXHRjb25zdCBwYW5lbFBvc2l0aW9uID0gbGF5b3V0U2VydmljZS5nZXRQYW5lbFBvc2l0aW9uKCk7XG5cdGNvbnN0IHBhbmVsQXRUb3AgPSBwYW5lbFZpc2libGUgJiYgcGFuZWxQb3NpdGlvbiA9PT0gUG9zaXRpb24uVE9QO1xuXHRjb25zdCBwYW5lbEF0Qm90dG9tID0gcGFuZWxWaXNpYmxlICYmIHBhbmVsUG9zaXRpb24gPT09IFBvc2l0aW9uLkJPVFRPTTtcblxuXHRyZXR1cm4ge1xuXHRcdHRvcDogcGFuZWxBdFRvcCA/IEZMT0FUSU5HX1BBTkVMX01BUkdJTlxuXHRcdFx0OiBpc0Zsb2F0aW5nVG9wRWRnZUV4cG9zZWQobGF5b3V0U2VydmljZSwgdGFyZ2V0V2luZG93KSA/IEZMT0FUSU5HX1BBTkVMX01BUkdJTiAqIDIgOiBGTE9BVElOR19QQU5FTF9JTk5FUl9NQVJHSU4sXG5cdFx0Ym90dG9tOiBwYW5lbEF0Qm90dG9tID8gRkxPQVRJTkdfUEFORUxfSU5ORVJfTUFSR0lOXG5cdFx0XHQ6IGxheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLlNUQVRVU0JBUl9QQVJULCB0YXJnZXRXaW5kb3cpID8gRkxPQVRJTkdfUEFORUxfTUFSR0lOIDogRkxPQVRJTkdfUEFORUxfTUFSR0lOICogMlxuXHR9O1xufVxuXG4vKipcbiAqIFdoZXRoZXIgYSB2aXNpYmxlIGhvcml6b250YWwgKGJvdHRvbS90b3ApIHBhbmVsIHJlYWNoZXMgZWFjaCB3aW5kb3cgZWRnZSBhbmQgc2hvdWxkXG4gKiB0aGVyZWZvcmUgcmVjZWl2ZSBhIGRvdWJsZWQgb3V0ZXIgZ3V0dGVyIHNvIGl0IGFsaWducyB3aXRoIHRoZSBlZGl0b3IgY2FyZCBhYm92ZSBpdC5cbiAqIFRoZSBwYW5lbCBzcGFucyB1bmRlcm5lYXRoIGEgYmFyIHRoYXQgaXMgbm90IGZ1bGwtaGVpZ2h0LCBhbmQgcmVhY2hlcyBhbiBlZGdlIHdoZW5ldmVyXG4gKiB0aGUgYmFyIG9uIHRoYXQgc2lkZSBpcyBoaWRkZW4gb3Igbm90IGZ1bGwtaGVpZ2h0IChhbmQsIG9uIHRoZSBzaWRlIGJhciBzaWRlLCB0aGVcbiAqIGFjdGl2aXR5IGJhciBpcyBhYnNlbnQpLiBUaGUgZnVsbC1oZWlnaHQvc2libGluZyBjb21wdXRhdGlvbiBtaXJyb3JzIGBMYXlvdXQuYWRqdXN0UGFydFBvc2l0aW9uc2AuXG4gKi9cbmZ1bmN0aW9uIGdldEZsb2F0aW5nSG9yaXpvbnRhbFBhbmVsT3V0ZXJFZGdlcyhsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSk6IHsgbGVmdDogYm9vbGVhbjsgcmlnaHQ6IGJvb2xlYW4gfSB7XG5cdGlmICghbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuUEFORUxfUEFSVCkpIHtcblx0XHRyZXR1cm4geyBsZWZ0OiBmYWxzZSwgcmlnaHQ6IGZhbHNlIH07XG5cdH1cblxuXHRjb25zdCBzaWRlQmFyTGVmdCA9IGxheW91dFNlcnZpY2UuZ2V0U2lkZUJhclBvc2l0aW9uKCkgPT09IFBvc2l0aW9uLkxFRlQ7XG5cdGNvbnN0IHsgc2lkZUJhcjogc2lkZUJhclNpYmxpbmdUb0VkaXRvciwgYXV4QmFyOiBhdXhTaWJsaW5nVG9FZGl0b3IgfSA9IGdldEZsb2F0aW5nU2lkZWJhclNpYmxpbmdUb0VkaXRvclN0YXR1cyhsYXlvdXRTZXJ2aWNlKTtcblxuXHRjb25zdCBzaWRlQmFyU2lkZVJlYWNoZWQgPSAhbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuQUNUSVZJVFlCQVJfUEFSVCkgJiYgKCFsYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5TSURFQkFSX1BBUlQpIHx8IHNpZGVCYXJTaWJsaW5nVG9FZGl0b3IpO1xuXHRjb25zdCBhdXhTaWRlUmVhY2hlZCA9ICFsYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkgfHwgYXV4U2libGluZ1RvRWRpdG9yO1xuXG5cdHJldHVybiBzaWRlQmFyTGVmdFxuXHRcdD8geyBsZWZ0OiBzaWRlQmFyU2lkZVJlYWNoZWQsIHJpZ2h0OiBhdXhTaWRlUmVhY2hlZCB9XG5cdFx0OiB7IGxlZnQ6IGF1eFNpZGVSZWFjaGVkLCByaWdodDogc2lkZUJhclNpZGVSZWFjaGVkIH07XG59XG5cbmNvbnN0IHBvc2l0aW9uc0J5U3RyaW5nOiB7IFtrZXk6IHN0cmluZ106IFBvc2l0aW9uIH0gPSB7XG5cdFtwb3NpdGlvblRvU3RyaW5nKFBvc2l0aW9uLkxFRlQpXTogUG9zaXRpb24uTEVGVCxcblx0W3Bvc2l0aW9uVG9TdHJpbmcoUG9zaXRpb24uUklHSFQpXTogUG9zaXRpb24uUklHSFQsXG5cdFtwb3NpdGlvblRvU3RyaW5nKFBvc2l0aW9uLkJPVFRPTSldOiBQb3NpdGlvbi5CT1RUT00sXG5cdFtwb3NpdGlvblRvU3RyaW5nKFBvc2l0aW9uLlRPUCldOiBQb3NpdGlvbi5UT1Bcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBwb3NpdGlvbkZyb21TdHJpbmcoc3RyOiBzdHJpbmcpOiBQb3NpdGlvbiB7XG5cdHJldHVybiBwb3NpdGlvbnNCeVN0cmluZ1tzdHJdO1xufVxuXG5mdW5jdGlvbiBwYXJ0T3BlbnNNYXhpbWl6ZWRTZXR0aW5nVG9TdHJpbmcoc2V0dGluZzogUGFydE9wZW5zTWF4aW1pemVkT3B0aW9ucyk6IHN0cmluZyB7XG5cdHN3aXRjaCAoc2V0dGluZykge1xuXHRcdGNhc2UgUGFydE9wZW5zTWF4aW1pemVkT3B0aW9ucy5BTFdBWVM6IHJldHVybiAnYWx3YXlzJztcblx0XHRjYXNlIFBhcnRPcGVuc01heGltaXplZE9wdGlvbnMuTkVWRVI6IHJldHVybiAnbmV2ZXInO1xuXHRcdGNhc2UgUGFydE9wZW5zTWF4aW1pemVkT3B0aW9ucy5SRU1FTUJFUl9MQVNUOiByZXR1cm4gJ3ByZXNlcnZlJztcblx0XHRkZWZhdWx0OiByZXR1cm4gJ3ByZXNlcnZlJztcblx0fVxufVxuXG5jb25zdCBwYXJ0T3BlbnNNYXhpbWl6ZWRCeVN0cmluZzogeyBba2V5OiBzdHJpbmddOiBQYXJ0T3BlbnNNYXhpbWl6ZWRPcHRpb25zIH0gPSB7XG5cdFtwYXJ0T3BlbnNNYXhpbWl6ZWRTZXR0aW5nVG9TdHJpbmcoUGFydE9wZW5zTWF4aW1pemVkT3B0aW9ucy5BTFdBWVMpXTogUGFydE9wZW5zTWF4aW1pemVkT3B0aW9ucy5BTFdBWVMsXG5cdFtwYXJ0T3BlbnNNYXhpbWl6ZWRTZXR0aW5nVG9TdHJpbmcoUGFydE9wZW5zTWF4aW1pemVkT3B0aW9ucy5ORVZFUildOiBQYXJ0T3BlbnNNYXhpbWl6ZWRPcHRpb25zLk5FVkVSLFxuXHRbcGFydE9wZW5zTWF4aW1pemVkU2V0dGluZ1RvU3RyaW5nKFBhcnRPcGVuc01heGltaXplZE9wdGlvbnMuUkVNRU1CRVJfTEFTVCldOiBQYXJ0T3BlbnNNYXhpbWl6ZWRPcHRpb25zLlJFTUVNQkVSX0xBU1Rcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJ0T3BlbnNNYXhpbWl6ZWRGcm9tU3RyaW5nKHN0cjogc3RyaW5nKTogUGFydE9wZW5zTWF4aW1pemVkT3B0aW9ucyB7XG5cdHJldHVybiBwYXJ0T3BlbnNNYXhpbWl6ZWRCeVN0cmluZ1tzdHJdO1xufVxuXG5leHBvcnQgdHlwZSBNVUxUSV9XSU5ET1dfUEFSVFMgPSBQYXJ0cy5FRElUT1JfUEFSVCB8IFBhcnRzLlNUQVRVU0JBUl9QQVJUIHwgUGFydHMuVElUTEVCQVJfUEFSVDtcbmV4cG9ydCB0eXBlIFNJTkdMRV9XSU5ET1dfUEFSVFMgPSBFeGNsdWRlPFBhcnRzLCBNVUxUSV9XSU5ET1dfUEFSVFM+O1xuXG5leHBvcnQgZnVuY3Rpb24gaXNNdWx0aVdpbmRvd1BhcnQocGFydDogUGFydHMpOiBwYXJ0IGlzIE1VTFRJX1dJTkRPV19QQVJUUyB7XG5cdHJldHVybiBwYXJ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVCB8fFxuXHRcdHBhcnQgPT09IFBhcnRzLlNUQVRVU0JBUl9QQVJUIHx8XG5cdFx0cGFydCA9PT0gUGFydHMuVElUTEVCQVJfUEFSVDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUGFydFZpc2liaWxpdHlDaGFuZ2VFdmVudCB7XG5cdHJlYWRvbmx5IHBhcnRJZDogc3RyaW5nO1xuXHRyZWFkb25seSB2aXNpYmxlOiBib29sZWFuO1xuXHRyZWFkb25seSBzb3VyY2U/OiAncmVzaXplJztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBleHRlbmRzIElMYXlvdXRTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEVtaXRzIHdoZW4gdGhlIHplbiBtb2RlIGlzIGVuYWJsZWQgb3IgZGlzYWJsZWQuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVplbk1vZGU6IEV2ZW50PGJvb2xlYW4+O1xuXG5cdC8qKlxuXHQgKiBFbWl0cyB3aGVuIHRoZSB0YXJnZXQgd2luZG93IGlzIG1heGltaXplZCBvciB1bm1heGltaXplZC5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlV2luZG93TWF4aW1pemVkOiBFdmVudDx7IHJlYWRvbmx5IHdpbmRvd0lkOiBudW1iZXI7IHJlYWRvbmx5IG1heGltaXplZDogYm9vbGVhbiB9PjtcblxuXHQvKipcblx0ICogRW1pdHMgd2hlbiBtYWluIGVkaXRvciBjZW50ZXJlZCBsYXlvdXQgaXMgZW5hYmxlZCBvciBkaXNhYmxlZC5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTWFpbkVkaXRvckNlbnRlcmVkTGF5b3V0OiBFdmVudDxib29sZWFuPjtcblxuXHQvKlxuXHQgKiBFbWl0IHdoZW4gcGFuZWwgcG9zaXRpb24gY2hhbmdlcy5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUGFuZWxQb3NpdGlvbjogRXZlbnQ8c3RyaW5nPjtcblxuXHQvKipcblx0ICogRW1pdCB3aGVuIHBhbmVsIGFsaWdubWVudCBjaGFuZ2VzLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQYW5lbEFsaWdubWVudDogRXZlbnQ8UGFuZWxBbGlnbm1lbnQ+O1xuXG5cdC8qKlxuXHQgKiBFbWl0IHdoZW4gcGFydCB2aXNpYmlsaXR5IGNoYW5nZXMuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5OiBFdmVudDxJUGFydFZpc2liaWxpdHlDaGFuZ2VFdmVudD47XG5cblx0LyoqXG5cdCAqIEVtaXQgd2hlbiBub3RpZmljYXRpb25zICh0b2FzdHMgb3IgY2VudGVyKSB2aXNpYmlsaXR5IGNoYW5nZXMuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU5vdGlmaWNhdGlvbnNWaXNpYmlsaXR5OiBFdmVudDxib29sZWFuPjtcblxuXHQvKlxuXHQgKiBFbWl0IHdoZW4gYXV4aWxpYXJ5IGJhciBtYXhpbWl6ZWQgc3RhdGUgY2hhbmdlcy5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQXV4aWxpYXJ5QmFyTWF4aW1pemVkOiBFdmVudDx2b2lkPjtcblxuXHQvKipcblx0ICogVHJ1ZSBpZiBhIGRlZmF1bHQgbGF5b3V0IHdpdGggZGVmYXVsdCBlZGl0b3JzIHdhcyBhcHBsaWVkIGF0IHN0YXJ0dXBcblx0ICovXG5cdHJlYWRvbmx5IG9wZW5lZERlZmF1bHRFZGl0b3JzOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBSdW4gYSBsYXlvdXQgb2YgdGhlIHdvcmtiZW5jaC5cblx0ICovXG5cdGxheW91dCgpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBBc2tzIHRoZSBwYXJ0IHNlcnZpY2UgaWYgYWxsIHBhcnRzIGhhdmUgYmVlbiBmdWxseSByZXN0b3JlZC4gRm9yIGVkaXRvciBwYXJ0XG5cdCAqIHRoaXMgbWVhbnMgdGhhdCB0aGUgY29udGVudHMgb2YgdmlzaWJsZSBlZGl0b3JzIGhhdmUgbG9hZGVkLlxuXHQgKi9cblx0aXNSZXN0b3JlZCgpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBBIHByb21pc2UgZm9yIHRvIGF3YWl0IHRoZSBgaXNSZXN0b3JlZCgpYCBjb25kaXRpb24gdG8gYmUgYHRydWVgLlxuXHQgKi9cblx0cmVhZG9ubHkgd2hlblJlc3RvcmVkOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIGdpdmVuIHBhcnQgaGFzIHRoZSBrZXlib2FyZCBmb2N1cyBvciBub3QuXG5cdCAqL1xuXHRoYXNGb2N1cyhwYXJ0OiBQYXJ0cyk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGUgZmxvYXRpbmcgcGFuZWxzIHByZXNlbnRhdGlvbiBpcyBlbmFibGVkIGZvciB0aGlzXG5cdCAqIHdvcmtiZW5jaCwgaS5lLiB3aGV0aGVyIHRoZSBNb2Rlcm4gVUkgVXBkYXRlIGV4cGVyaW1lbnRcblx0ICogKGBMYXlvdXRTZXR0aW5ncy5NT0RFUk5fVUlgKSBpcyBvbi4gQWx3YXlzIGBmYWxzZWAgZm9yIHRoZSBhZ2VudHMgd2luZG93LFxuXHQgKiB3aGljaCBoYXMgaXRzIG93biBmbG9hdGluZyBjYXJkIGRlc2lnbiBhbmQgbXVzdCBub3QgYXBwbHkgdGhlIGV4cGVyaW1lbnQnc1xuXHQgKiBjb250ZW50IGluc2V0cy5cblx0ICovXG5cdGlzRmxvYXRpbmdQYW5lbHNFbmFibGVkKCk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEZvY3VzZXMgdGhlIHBhcnQgaW4gdGhlIHRhcmdldCB3aW5kb3cuIElmIHRoZSBwYXJ0IGlzIG5vdCB2aXNpYmxlIHRoaXMgaXMgYSBub29wLlxuXHQgKi9cblx0Zm9jdXNQYXJ0KHBhcnQ6IFNJTkdMRV9XSU5ET1dfUEFSVFMpOiB2b2lkO1xuXHRmb2N1c1BhcnQocGFydDogTVVMVElfV0lORE9XX1BBUlRTLCB0YXJnZXRXaW5kb3c6IFdpbmRvdyk6IHZvaWQ7XG5cdGZvY3VzUGFydChwYXJ0OiBQYXJ0cywgdGFyZ2V0V2luZG93OiBXaW5kb3cpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSB0YXJnZXQgd2luZG93IGNvbnRhaW5lciBvciBwYXJ0cyBIVE1MIGVsZW1lbnQgd2l0aGluLCBpZiB0aGVyZSBpcyBvbmUuXG5cdCAqL1xuXHRnZXRDb250YWluZXIodGFyZ2V0V2luZG93OiBXaW5kb3cpOiBIVE1MRWxlbWVudDtcblx0Z2V0Q29udGFpbmVyKHRhcmdldFdpbmRvdzogV2luZG93LCBwYXJ0OiBQYXJ0cyk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGlmIHRoZSBwYXJ0IGlzIHZpc2libGUgaW4gdGhlIHRhcmdldCB3aW5kb3cuXG5cdCAqL1xuXHRpc1Zpc2libGUocGFydDogU0lOR0xFX1dJTkRPV19QQVJUUyk6IGJvb2xlYW47XG5cdGlzVmlzaWJsZShwYXJ0OiBNVUxUSV9XSU5ET1dfUEFSVFMsIHRhcmdldFdpbmRvdzogV2luZG93KTogYm9vbGVhbjtcblx0aXNWaXNpYmxlKHBhcnQ6IFBhcnRzLCB0YXJnZXRXaW5kb3c6IFdpbmRvdyk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFNldCBwYXJ0IGhpZGRlbiBvciBub3QgaW4gdGhlIHRhcmdldCB3aW5kb3cuXG5cdCAqL1xuXHRzZXRQYXJ0SGlkZGVuKGhpZGRlbjogYm9vbGVhbiwgcGFydDogUGFydHMpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIGxheW91dCBzdXJmYWNlIHRoYXQgcmVwcmVzZW50cyB0aGUgc2Vjb25kYXJ5IHNpZGViYXIgaXMgdmlzaWJsZS5cblx0ICovXG5cdGlzU2Vjb25kYXJ5U2lkZUJhclZpc2libGUoKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogVG9nZ2xlcyB0aGUgbGF5b3V0IHN1cmZhY2UgdGhhdCByZXByZXNlbnRzIHRoZSBzZWNvbmRhcnkgc2lkZWJhci5cblx0ICovXG5cdHRvZ2dsZVNlY29uZGFyeVNpZGVCYXIoKTogdm9pZDtcblxuXHQvKipcblx0ICogTWF4aW1pemVzIHRoZSBwYW5lbCBoZWlnaHQgaWYgdGhlIHBhbmVsIGlzIG5vdCBhbHJlYWR5IG1heGltaXplZC5cblx0ICogU2hyaW5rcyB0aGUgcGFuZWwgdG8gdGhlIGRlZmF1bHQgc3RhcnRpbmcgc2l6ZSBpZiB0aGUgcGFuZWwgaXMgbWF4aW1pemVkLlxuXHQgKi9cblx0dG9nZ2xlTWF4aW1pemVkUGFuZWwoKTogdm9pZDtcblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIHRoZSBwYW5lbCBpcyBtYXhpbWl6ZWQuXG5cdCAqL1xuXHRpc1BhbmVsTWF4aW1pemVkKCk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIE1heGltaXplcyB0aGUgYXV4aWxpYXJ5IHNpZGViYXIgYnkgaGlkaW5nIHRoZSBlZGl0b3IgYW5kIHBhbmVsIGFyZWFzLlxuXHQgKiBSZXN0b3JlcyB0aGUgcHJldmlvdXMgbGF5b3V0IGlmIHRoZSBhdXhpbGlhcnkgc2lkZWJhciBpcyBhbHJlYWR5IG1heGltaXplZC5cblx0ICovXG5cdHRvZ2dsZU1heGltaXplZEF1eGlsaWFyeUJhcigpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBNYXhpbWl6ZXMgb3IgcmVzdG9yZXMgdGhlIGF1eGlsaWFyeSBzaWRlYmFyLlxuXHQgKlxuXHQgKiBAcmV0dXJucyBgdHJ1ZWAgaWYgdGhlcmUgd2FzIGEgY2hhbmdlIGluIHRoZSBtYXhpbWl6YXRpb24gc3RhdGUuXG5cdCAqL1xuXHRzZXRBdXhpbGlhcnlCYXJNYXhpbWl6ZWQobWF4aW1pemVkOiBib29sZWFuKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIHRoZSBhdXhpbGlhcnkgc2lkZWJhciBpcyBtYXhpbWl6ZWQuXG5cdCAqL1xuXHRpc0F1eGlsaWFyeUJhck1heGltaXplZCgpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIG1haW4gd2luZG93IGhhcyBhIGJvcmRlci5cblx0ICovXG5cdGhhc01haW5XaW5kb3dCb3JkZXIoKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgbWFpbiB3aW5kb3cgYm9yZGVyIHJhZGl1cyBpZiBhbnkuXG5cdCAqL1xuXHRnZXRNYWluV2luZG93Qm9yZGVyUmFkaXVzKCk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogR2V0cyB0aGUgY3VycmVudCBzaWRlIGJhciBwb3NpdGlvbi4gTm90ZSB0aGF0IHRoZSBzaWRlYmFyIGNhbiBiZSBoaWRkZW4gdG9vLlxuXHQgKi9cblx0Z2V0U2lkZUJhclBvc2l0aW9uKCk6IFBvc2l0aW9uO1xuXG5cdC8qKlxuXHQgKiBUb2dnbGVzIHRoZSBtZW51IGJhciB2aXNpYmlsaXR5LlxuXHQgKi9cblx0dG9nZ2xlTWVudUJhcigpOiB2b2lkO1xuXG5cdC8qXG5cdCAqIEdldHMgdGhlIGN1cnJlbnQgcGFuZWwgcG9zaXRpb24uIE5vdGUgdGhhdCB0aGUgcGFuZWwgY2FuIGJlIGhpZGRlbiB0b28uXG5cdCAqL1xuXHRnZXRQYW5lbFBvc2l0aW9uKCk6IFBvc2l0aW9uO1xuXG5cdC8qKlxuXHQgKiBTZXRzIHRoZSBwYW5lbCBwb3NpdGlvbi5cblx0ICovXG5cdHNldFBhbmVsUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uKTogdm9pZDtcblxuXHQvKipcblx0ICogR2V0cyB0aGUgcGFuZWwgYWxpZ25lbWVudC5cblx0ICovXG5cdGdldFBhbmVsQWxpZ25tZW50KCk6IFBhbmVsQWxpZ25tZW50O1xuXG5cdC8qKlxuXHQgKiBTZXRzIHRoZSBwYW5lbCBhbGlnbm1lbnQuXG5cdCAqL1xuXHRzZXRQYW5lbEFsaWdubWVudChhbGlnbm1lbnQ6IFBhbmVsQWxpZ25tZW50KTogdm9pZDtcblxuXHQvKipcblx0ICogR2V0cyB0aGUgbWF4aW11bSBwb3NzaWJsZSBzaXplIGZvciBlZGl0b3IgaW4gdGhlIGdpdmVuIGNvbnRhaW5lci5cblx0ICovXG5cdGdldE1heGltdW1FZGl0b3JEaW1lbnNpb25zKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGltZW5zaW9uO1xuXG5cdC8qKlxuXHQgKiBUb2dnbGVzIHRoZSB3b3JrYmVuY2ggaW4gYW5kIG91dCBvZiB6ZW4gbW9kZSAtIHBhcnRzIGdldCBoaWRkZW4gYW5kIHdpbmRvdyBnb2VzIGZ1bGxzY3JlZW4uXG5cdCAqL1xuXHR0b2dnbGVaZW5Nb2RlKCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGUgY2VudGVyZWQgZWRpdG9yIGxheW91dCBpcyBhY3RpdmUgb24gdGhlIG1haW4gZWRpdG9yIHBhcnQuXG5cdCAqL1xuXHRpc01haW5FZGl0b3JMYXlvdXRDZW50ZXJlZCgpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBTZXRzIHRoZSBtYWluIGVkaXRvciBwYXJ0IGluIGFuZCBvdXQgb2YgY2VudGVyZWQgbGF5b3V0LlxuXHQgKi9cblx0Y2VudGVyTWFpbkVkaXRvckxheW91dChhY3RpdmU6IGJvb2xlYW4pOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIHByb3ZpZGVkIHBhcnRzIHNpemUgaW4gdGhlIG1haW4gd2luZG93LlxuXHQgKi9cblx0Z2V0U2l6ZShwYXJ0OiBQYXJ0cyk6IElWaWV3U2l6ZTtcblxuXHQvKipcblx0ICogU2V0IHRoZSBwcm92aWRlZCBwYXJ0cyBzaXplIGluIHRoZSBtYWluIHdpbmRvdy5cblx0ICovXG5cdHNldFNpemUocGFydDogUGFydHMsIHNpemU6IElWaWV3U2l6ZSk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFJlc2l6ZSB0aGUgcHJvdmlkZWQgcGFydCBpbiB0aGUgbWFpbiB3aW5kb3cuXG5cdCAqL1xuXHRyZXNpemVQYXJ0KHBhcnQ6IFBhcnRzLCBzaXplQ2hhbmdlV2lkdGg6IG51bWJlciwgc2l6ZUNoYW5nZUhlaWdodDogbnVtYmVyKTogdm9pZDtcblxuXHQvKipcblx0ICogUmVnaXN0ZXIgYSBwYXJ0IHRvIHBhcnRpY2lwYXRlIGluIHRoZSBsYXlvdXQuXG5cdCAqL1xuXHRyZWdpc3RlclBhcnQocGFydDogUGFydCk6IElEaXNwb3NhYmxlO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHRhcmdldCB3aW5kb3cgaXMgbWF4aW1pemVkLlxuXHQgKi9cblx0aXNXaW5kb3dNYXhpbWl6ZWQodGFyZ2V0V2luZG93OiBXaW5kb3cpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBtYXhpbWl6ZWQgc3RhdGUgb2YgdGhlIHRhcmdldCB3aW5kb3cuXG5cdCAqL1xuXHR1cGRhdGVXaW5kb3dNYXhpbWl6ZWRTdGF0ZSh0YXJnZXRXaW5kb3c6IFdpbmRvdywgbWF4aW1pemVkOiBib29sZWFuKTogdm9pZDtcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgbmV4dCB2aXNpYmxlIHZpZXcgcGFydCBpbiBhIGdpdmVuIGRpcmVjdGlvbiBpbiB0aGUgbWFpbiB3aW5kb3cuXG5cdCAqL1xuXHRnZXRWaXNpYmxlTmVpZ2hib3JQYXJ0KHBhcnQ6IFBhcnRzLCBkaXJlY3Rpb246IERpcmVjdGlvbik6IFBhcnRzIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkU2hvd0N1c3RvbVRpdGxlQmFyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIHdpbmRvdzogV2luZG93LCBtZW51QmFyVG9nZ2xlZD86IGJvb2xlYW4pOiBib29sZWFuIHtcblx0aWYgKCFoYXNDdXN0b21UaXRsZWJhcihjb25maWd1cmF0aW9uU2VydmljZSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdCBpbkZ1bGxzY3JlZW4gPSBpc0Z1bGxzY3JlZW4od2luZG93KTtcblx0Y29uc3QgbmF0aXZlVGl0bGVCYXJFbmFibGVkID0gaGFzTmF0aXZlVGl0bGViYXIoY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdGlmICghaXNXZWIpIHtcblx0XHRjb25zdCBzaG93Q3VzdG9tVGl0bGVCYXIgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxDdXN0b21UaXRsZUJhclZpc2liaWxpdHk+KFRpdGxlQmFyU2V0dGluZy5DVVNUT01fVElUTEVfQkFSX1ZJU0lCSUxJVFkpO1xuXHRcdGlmIChzaG93Q3VzdG9tVGl0bGVCYXIgPT09IEN1c3RvbVRpdGxlQmFyVmlzaWJpbGl0eS5ORVZFUiAmJiBuYXRpdmVUaXRsZUJhckVuYWJsZWQgfHwgc2hvd0N1c3RvbVRpdGxlQmFyID09PSBDdXN0b21UaXRsZUJhclZpc2liaWxpdHkuV0lORE9XRUQgJiYgaW5GdWxsc2NyZWVuKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0aWYgKCFpc1RpdGxlQmFyRW1wdHkoY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyBIaWRlIGN1c3RvbSB0aXRsZSBiYXIgd2hlbiBuYXRpdmUgdGl0bGUgYmFyIGVuYWJsZWQgYW5kIGN1c3RvbSB0aXRsZSBiYXIgaXMgZW1wdHlcblx0aWYgKG5hdGl2ZVRpdGxlQmFyRW5hYmxlZCAmJiBoYXNOYXRpdmVNZW51KGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8vIG1hY09TIGRlc2t0b3AgZG9lcyBub3QgbmVlZCBhIHRpdGxlIGJhciB3aGVuIGZ1bGwgc2NyZWVuXG5cdGlmIChpc01hY2ludG9zaCAmJiBpc05hdGl2ZSkge1xuXHRcdHJldHVybiAhaW5GdWxsc2NyZWVuO1xuXHR9XG5cblx0Ly8gbm9uLWZ1bGxzY3JlZW4gbmF0aXZlIG11c3Qgc2hvdyB0aGUgdGl0bGUgYmFyXG5cdGlmIChpc05hdGl2ZSAmJiAhaW5GdWxsc2NyZWVuKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyBpZiBXQ08gaXMgdmlzaWJsZSwgd2UgaGF2ZSB0byBzaG93IHRoZSB0aXRsZSBiYXJcblx0aWYgKGlzV0NPRW5hYmxlZCgpICYmICFpbkZ1bGxzY3JlZW4pIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8vIHJlbWFpbmluZyBiZWhhdmlvciBpcyBiYXNlZCBvbiBtZW51YmFyIHZpc2liaWxpdHlcblx0Y29uc3QgbWVudUJhclZpc2liaWxpdHkgPSAhaXNBdXhpbGlhcnlXaW5kb3cod2luZG93KSA/IGdldE1lbnVCYXJWaXNpYmlsaXR5KGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSA6ICdoaWRkZW4nO1xuXHRzd2l0Y2ggKG1lbnVCYXJWaXNpYmlsaXR5KSB7XG5cdFx0Y2FzZSAnY2xhc3NpYyc6XG5cdFx0XHRyZXR1cm4gIWluRnVsbHNjcmVlbiB8fCAhIW1lbnVCYXJUb2dnbGVkO1xuXHRcdGNhc2UgJ2NvbXBhY3QnOlxuXHRcdGNhc2UgJ2hpZGRlbic6XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0Y2FzZSAndG9nZ2xlJzpcblx0XHRcdHJldHVybiAhIW1lbnVCYXJUb2dnbGVkO1xuXHRcdGNhc2UgJ3Zpc2libGUnOlxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBpc1dlYiA/IGZhbHNlIDogIWluRnVsbHNjcmVlbiB8fCAhIW1lbnVCYXJUb2dnbGVkO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzVGl0bGVCYXJFbXB0eShjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogYm9vbGVhbiB7XG5cblx0Ly8gd2l0aCB0aGUgY29tbWFuZCBjZW50ZXIgZW5hYmxlZCwgd2Ugc2hvdWxkIGFsd2F5cyBzaG93XG5cdGlmIChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihMYXlvdXRTZXR0aW5ncy5DT01NQU5EX0NFTlRFUikpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvLyB3aXRoIHRoZSBhY3Rpdml0eSBiYXIgb24gdG9wLCB3ZSBzaG91bGQgYWx3YXlzIHNob3dcblx0Y29uc3QgYWN0aXZpdHlCYXJQb3NpdGlvbiA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPEFjdGl2aXR5QmFyUG9zaXRpb24+KExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTik7XG5cdGlmIChhY3Rpdml0eUJhclBvc2l0aW9uID09PSBBY3Rpdml0eUJhclBvc2l0aW9uLlRPUCB8fCBhY3Rpdml0eUJhclBvc2l0aW9uID09PSBBY3Rpdml0eUJhclBvc2l0aW9uLkJPVFRPTSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8vIHdpdGggdGhlIGVkaXRvciBhY3Rpb25zIG9uIHRvcCwgd2Ugc2hvdWxkIGFsd2F5cyBzaG93XG5cdGNvbnN0IGVkaXRvckFjdGlvbnNMb2NhdGlvbiA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPEVkaXRvckFjdGlvbnNMb2NhdGlvbj4oTGF5b3V0U2V0dGluZ3MuRURJVE9SX0FDVElPTlNfTE9DQVRJT04pO1xuXHRjb25zdCBlZGl0b3JUYWJzTW9kZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPEVkaXRvclRhYnNNb2RlPihMYXlvdXRTZXR0aW5ncy5FRElUT1JfVEFCU19NT0RFKTtcblx0aWYgKGVkaXRvckFjdGlvbnNMb2NhdGlvbiA9PT0gRWRpdG9yQWN0aW9uc0xvY2F0aW9uLlRJVExFQkFSIHx8IGVkaXRvckFjdGlvbnNMb2NhdGlvbiA9PT0gRWRpdG9yQWN0aW9uc0xvY2F0aW9uLkRFRkFVTFQgJiYgZWRpdG9yVGFic01vZGUgPT09IEVkaXRvclRhYnNNb2RlLk5PTkUpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvLyB3aXRoIHRoZSBsYXlvdXQgYWN0aW9ucyBvbiB0b3AsIHdlIHNob3VsZCBhbHdheXMgc2hvd1xuXHRpZiAoY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTGF5b3V0U2V0dGluZ3MuTEFZT1VUX0FDVElPTlMpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLDhCQUE4QjtBQUV2QyxTQUFTLHNCQUFzQjtBQUkvQixTQUFTLGFBQWEsVUFBVSxhQUFhO0FBQzdDLFNBQVMsbUJBQW1CLGtCQUFrQjtBQUM5QyxTQUFTLDBCQUEwQixpQkFBaUIsc0JBQXNCLG1CQUFtQixlQUFlLHlCQUF5QjtBQUNySSxTQUFTLGNBQWMsb0JBQW9CO0FBSXBDLE1BQU0sMEJBQTBCLHVCQUFnRSxjQUFjO0FBRTlHLElBQVcsUUFBWCxrQkFBV0EsV0FBWDtBQUNOLEVBQUFBLE9BQUEsbUJBQWdCO0FBQ2hCLEVBQUFBLE9BQUEsaUJBQWM7QUFDZCxFQUFBQSxPQUFBLHNCQUFtQjtBQUNu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QUM7QUFBQSxJQUNWLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUjtBQUNDLGFBQU8sUUFBUSxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUFBLEVBQzVDO0FBQ0Q7QUFFQSxTQUFTLGdCQUFnQixzQkFBc0Q7QUFHOUUsTUFBSSxxQkFBcUIsU0FBa0IsMkNBQTZCLEdBQUc7QUFDMUUsV0FBTztBQUFBLEVBQ1I7QUFHQSxRQUFNLHNCQUFzQixxQkFBcUIsU0FBOEIsNERBQW9DO0FBQ25ILE1BQUksd0JBQXdCLG1CQUEyQix3QkFBd0IsdUJBQTRCO0FBQzFHLFdBQU87QUFBQSxFQUNSO0FBR0EsUUFBTSx3QkFBd0IscUJBQXFCLFNBQWdDLHNFQUFzQztBQUN6SCxRQUFNLGlCQUFpQixxQkFBcUIsU0FBeUIsa0RBQStCO0FBQ3BHLE1BQUksMEJBQTBCLDZCQUFrQywwQkFBMEIsMkJBQWlDLG1CQUFtQixtQkFBcUI7QUFDbEssV0FBTztBQUFBLEVBQ1I7QUFHQSxNQUFJLHFCQUFxQixTQUFrQixzREFBNkIsR0FBRztBQUMxRSxXQUFPO0FBQUEsRUFDUjtBQUVBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsiUGFydHMiLCAiWmVuTW9kZVNldHRpbmdzIiwgIkxheW91dFNldHRpbmdzIiwgIkFjdGl2aXR5QmFyUG9zaXRpb24iLCAiRWRpdG9yVGFic01vZGUiLCAiRWRpdG9yQWN0aW9uc0xvY2F0aW9uIiwgIlBvc2l0aW9uIiwgIlBhcnRPcGVuc01heGltaXplZE9wdGlvbnMiXQp9Cg==
