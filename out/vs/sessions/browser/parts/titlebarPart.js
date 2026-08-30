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
import "../../../workbench/browser/parts/titlebar/media/titlebarpart.css";
import "./media/titlebarpart.css";
import { MultiWindowParts, Part } from "../../../workbench/browser/part.js";
import { getZoomFactor, isWCOEnabled, getWCOTitlebarAreaRect, isFullscreen, onDidChangeFullscreen } from "../../../base/browser/browser.js";
import { hasCustomTitlebar, hasNativeTitlebar, DEFAULT_CUSTOM_TITLEBAR_HEIGHT, getTitleBarStyle, getWindowControlsStyle, WindowControlsStyle } from "../../../platform/window/common/window.js";
import { IContextMenuService } from "../../../platform/contextview/browser/contextView.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { agentsBackground, agentsPanelForeground } from "../../common/theme.js";
import { isMacintosh, isWeb, isNative, platformLocale } from "../../../base/common/platform.js";
import { EventType, EventHelper, append, $, addDisposableListener, prepend, getWindow, getWindowId } from "../../../base/browser/dom.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { IStorageService } from "../../../platform/storage/common/storage.js";
import { Parts, IWorkbenchLayoutService } from "../../../workbench/services/layout/browser/layoutService.js";
import { IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { IHostService } from "../../../workbench/services/host/browser/host.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../platform/actions/browser/toolbar.js";
import { mainWindow } from "../../../base/browser/window.js";
import { safeIntl } from "../../../base/common/date.js";
import { WindowTitle } from "../../../workbench/browser/parts/titlebar/windowTitle.js";
import { Menus } from "../menus.js";
import { IsNewChatSessionContext } from "../../common/contextkeys.js";
const commandCenterContextKeys = /* @__PURE__ */ new Set([IsNewChatSessionContext.key]);
let TitlebarPart = class extends Part {
  constructor(id, targetWindow, contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService) {
    super(id, { hasTitle: false }, themeService, storageService, layoutService);
    this.contextMenuService = contextMenuService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.hostService = hostService;
    //#region IView
    this.minimumWidth = 0;
    this.maximumWidth = Number.POSITIVE_INFINITY;
    //#endregion
    //#region Events
    this._onMenubarVisibilityChange = this._register(new Emitter());
    this.onMenubarVisibilityChange = this._onMenubarVisibilityChange.event;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this.overflowManagedToolBarElements = [];
    this.leftSpacerWidth = 0;
    this.isInactive = false;
    this.titleBarStyle = getTitleBarStyle(this.configurationService);
    this.registerListeners(getWindowId(targetWindow));
  }
  get minimumHeight() {
    const wcoEnabled = isWeb && isWCOEnabled();
    let value = DEFAULT_CUSTOM_TITLEBAR_HEIGHT;
    if (wcoEnabled) {
      value = Math.max(value, getWCOTitlebarAreaRect(getWindow(this.element))?.height ?? 0);
    }
    return value / (this.preventZoom ? getZoomFactor(getWindow(this.element)) : 1);
  }
  get maximumHeight() {
    return this.minimumHeight;
  }
  get leftContainer() {
    return this.leftContent;
  }
  get rightContainer() {
    return this.rightContent;
  }
  get rightWindowControlsContainer() {
    return this.windowControlsContainer;
  }
  registerListeners(targetWindowId) {
    this._register(this.hostService.onDidChangeFocus((focused) => focused ? this.onFocus() : this.onBlur()));
    this._register(this.hostService.onDidChangeActiveWindow((windowId) => windowId === targetWindowId ? this.onFocus() : this.onBlur()));
  }
  onBlur() {
    this.isInactive = true;
    this.updateStyles();
  }
  onFocus() {
    this.isInactive = false;
    this.updateStyles();
  }
  updateProperties(_properties) {
  }
  registerVariables(_variables) {
  }
  updateOptions(_options) {
  }
  createContentArea(parent) {
    this.element = parent;
    this.rootContainer = append(parent, $(".titlebar-container.sessions-titlebar-container.has-center"));
    prepend(this.rootContainer, $("div.titlebar-drag-region"));
    this.leftContent = append(this.rootContainer, $(".titlebar-left"));
    this.centerContent = append(this.rootContainer, $(".titlebar-center"));
    this.rightContent = append(this.rootContainer, $(".titlebar-right"));
    if (!hasNativeTitlebar(this.configurationService, this.titleBarStyle)) {
      let primaryWindowControlsLocation = isMacintosh ? "left" : "right";
      if (isMacintosh && isNative) {
        const localeInfo = safeIntl.Locale(platformLocale).value;
        const textInfo = localeInfo.textInfo;
        if (textInfo?.direction === "rtl") {
          primaryWindowControlsLocation = "right";
        }
      }
      if (isMacintosh && isNative && primaryWindowControlsLocation === "left") {
        const spacer = append(this.leftContent, $("div.window-controls-container"));
        const updateSpacerVisibility = () => {
          const fullscreen = isFullscreen(mainWindow);
          spacer.style.display = fullscreen ? "none" : "";
          this.leftSpacerWidth = fullscreen ? 0 : 70;
        };
        updateSpacerVisibility();
        spacer.style.width = `${this.leftSpacerWidth}px`;
        spacer.style.flexShrink = "0";
        this._register(onDidChangeFullscreen((windowId) => {
          if (windowId === getWindowId(mainWindow)) {
            updateSpacerVisibility();
          }
        }));
      } else if (getWindowControlsStyle(this.configurationService) === WindowControlsStyle.HIDDEN) {
      } else {
        this.windowControlsContainer = append(primaryWindowControlsLocation === "left" ? this.leftContent : this.rightContent, $("div.window-controls-container"));
        if (isWeb) {
          append(primaryWindowControlsLocation === "left" ? this.rightContent : this.leftContent, $("div.window-controls-container"));
        }
        if (isWCOEnabled()) {
          this.windowControlsContainer.classList.add("wco-enabled");
        }
      }
    }
    this.leftToolbarContainer = append(this.leftContent, $("div.left-toolbar-container"));
    this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this.leftToolbarContainer, Menus.TitleBarLeftLayout, {
      contextMenu: Menus.TitleBarContext,
      telemetrySource: "titlePart.left",
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      toolbarOptions: { primaryGroup: () => true }
    }));
    const centerNavContainer = append(this.centerContent, $("div.titlebar-actions-container.titlebar-center-nav-container"));
    const centerNavToolBar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, centerNavContainer, Menus.TitleBarCenterLeft, {
      contextMenu: Menus.TitleBarContext,
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      telemetrySource: "titlePart.centerLeft",
      toolbarOptions: { primaryGroup: () => true }
    }));
    const windowTitle = append(this.centerContent, $("div.window-title"));
    const centerToolbarContainer = append(windowTitle, $("div.command-center"));
    const centerToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, centerToolbarContainer, Menus.CommandCenter, {
      contextMenu: Menus.TitleBarContext,
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      telemetrySource: "commandCenter",
      toolbarOptions: { primaryGroup: () => true }
    }));
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(commandCenterContextKeys)) {
        centerToolbar.refresh();
      }
    }));
    const centerActionsContainer = append(this.centerContent, $("div.titlebar-actions-container.titlebar-center-actions-container"));
    const centerActionsToolBar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, centerActionsContainer, Menus.TitleBarCenterRight, {
      contextMenu: Menus.TitleBarContext,
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      telemetrySource: "titlePart.centerRight",
      toolbarOptions: { primaryGroup: () => true }
    }));
    const rightToolbarContainer = prepend(this.rightContent, $("div.titlebar-actions-container.titlebar-right-layout-container"));
    const rightToolBar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, rightToolbarContainer, Menus.TitleBarRightLayout, {
      contextMenu: Menus.TitleBarContext,
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      telemetrySource: "titlePart.right",
      toolbarOptions: { primaryGroup: () => true }
    }));
    const sessionActionsContainer = prepend(this.rightContent, $("div.titlebar-actions-container.titlebar-session-actions-container"));
    const sessionActionsToolBar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, sessionActionsContainer, Menus.TitleBarSessionMenu, {
      contextMenu: Menus.TitleBarContext,
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      telemetrySource: "titlePart.sessionActions",
      toolbarOptions: { primaryGroup: () => true }
    }));
    const updateToolBarElement = prepend(this.rightContent, $("div.titlebar-actions-container.titlebar-update-container"));
    const updateToolBar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, updateToolBarElement, Menus.TitleBarUpdate, {
      contextMenu: Menus.TitleBarContext,
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      telemetrySource: "titlePart.update",
      toolbarOptions: { primaryGroup: () => true }
    }));
    this.registerOverflowManagedToolBar(centerActionsContainer, centerActionsToolBar);
    this.registerOverflowManagedToolBar(centerNavContainer, centerNavToolBar);
    this.registerOverflowManagedToolBar(rightToolbarContainer, rightToolBar);
    this.registerOverflowManagedToolBar(sessionActionsContainer, sessionActionsToolBar);
    this.registerOverflowManagedToolBar(updateToolBarElement, updateToolBar);
    this._register(addDisposableListener(this.rootContainer, EventType.CONTEXT_MENU, (e) => {
      EventHelper.stop(e);
      this.onContextMenu(e);
    }));
    this.updateStyles();
    return this.element;
  }
  updateStyles() {
    super.updateStyles();
    if (this.element) {
      this.element.classList.toggle("inactive", this.isInactive);
      const titleBarBackground = this.getColor(agentsBackground);
      this.element.style.backgroundColor = titleBarBackground || "";
      const titleForeground = this.getColor(agentsPanelForeground);
      this.element.style.color = titleForeground || "";
    }
  }
  onContextMenu(e) {
    const event = new StandardMouseEvent(getWindow(this.element), e);
    this.contextMenuService.showContextMenu({
      getAnchor: () => event,
      menuId: Menus.TitleBarContext,
      contextKeyService: this.contextKeyService,
      domForShadowRoot: isMacintosh && isNative ? event.target : void 0
    });
  }
  get hasZoomableElements() {
    return true;
  }
  get preventZoom() {
    return getZoomFactor(getWindow(this.element)) < 1 || !this.hasZoomableElements;
  }
  layout(width, height) {
    this.updateLayout();
    super.layoutContents(width, height);
    this.updateTitleBarToolBarOverflow();
  }
  registerOverflowManagedToolBar(element, toolBar) {
    this.overflowManagedToolBarElements.push(element);
    this._register(toolBar.onDidChangeMenuItems(() => this.updateTitleBarToolBarOverflow()));
  }
  updateTitleBarToolBarOverflow() {
    for (const element of this.overflowManagedToolBarElements) {
      element.classList.remove("overflowing");
    }
    if (this.rootContainer.clientWidth === 0) {
      return;
    }
    for (const element of this.overflowManagedToolBarElements) {
      if (!this.isTitleBarOverflowing()) {
        return;
      }
      if (!element.classList.contains("has-no-actions")) {
        element.classList.add("overflowing");
      }
    }
  }
  isTitleBarOverflowing() {
    return [this.rootContainer, this.leftContent, this.centerContent, this.rightContent].some((element) => element.scrollWidth > element.clientWidth);
  }
  updateLayout() {
    if (!hasCustomTitlebar(this.configurationService, this.titleBarStyle)) {
      return;
    }
    const zoomFactor = getZoomFactor(getWindow(this.element));
    this.element.style.setProperty("--zoom-factor", zoomFactor.toString());
    this.rootContainer.classList.toggle("counter-zoom", this.preventZoom);
  }
  focus() {
    this.element.querySelector('[tabindex]:not([tabindex="-1"])')?.focus();
  }
  toJSON() {
    return { type: Parts.TITLEBAR_PART };
  }
  dispose() {
    this._onWillDispose.fire();
    super.dispose();
  }
};
TitlebarPart = __decorateClass([
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IWorkbenchLayoutService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IHostService)
], TitlebarPart);
let MainTitlebarPart = class extends TitlebarPart {
  constructor(contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService) {
    super(Parts.TITLEBAR_PART, mainWindow, contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService);
  }
};
MainTitlebarPart = __decorateClass([
  __decorateParam(0, IContextMenuService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IThemeService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IWorkbenchLayoutService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IHostService)
], MainTitlebarPart);
let AuxiliaryTitlebarPart = class extends TitlebarPart {
  constructor(container, mainTitlebar, contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService) {
    const id = AuxiliaryTitlebarPart.COUNTER++;
    super(`workbench.parts.auxiliaryTitle.${id}`, getWindow(container), contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService);
    this.container = container;
    this.mainTitlebar = mainTitlebar;
  }
  get height() {
    return this.minimumHeight;
  }
  get preventZoom() {
    return getZoomFactor(getWindow(this.element)) < 1 || !this.mainTitlebar.hasZoomableElements;
  }
};
AuxiliaryTitlebarPart.COUNTER = 1;
AuxiliaryTitlebarPart = __decorateClass([
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IWorkbenchLayoutService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IHostService)
], AuxiliaryTitlebarPart);
let TitleService = class extends MultiWindowParts {
  constructor(instantiationService, storageService, themeService) {
    super("workbench.agentSessionsTitleService", themeService, storageService);
    this.instantiationService = instantiationService;
    this.mainPart = this._register(this.createMainTitlebarPart());
    this.onMenubarVisibilityChange = this.mainPart.onMenubarVisibilityChange;
    this._register(this.registerPart(this.mainPart));
  }
  createMainTitlebarPart() {
    return this.instantiationService.createInstance(MainTitlebarPart);
  }
  //#region Auxiliary Titlebar Parts
  createAuxiliaryTitlebarPart(container, editorGroupsContainer, instantiationService) {
    const titlebarPartContainer = $(".part.titlebar", { role: "none" });
    titlebarPartContainer.style.position = "relative";
    container.insertBefore(titlebarPartContainer, container.firstChild);
    const disposables = new DisposableStore();
    const titlebarPart = this.doCreateAuxiliaryTitlebarPart(titlebarPartContainer, editorGroupsContainer, instantiationService);
    disposables.add(this.registerPart(titlebarPart));
    disposables.add(Event.runAndSubscribe(titlebarPart.onDidChange, () => titlebarPartContainer.style.height = `${titlebarPart.height}px`));
    titlebarPart.create(titlebarPartContainer);
    Event.once(titlebarPart.onWillDispose)(() => disposables.dispose());
    return titlebarPart;
  }
  doCreateAuxiliaryTitlebarPart(container, _editorGroupsContainer, instantiationService) {
    return instantiationService.createInstance(AuxiliaryTitlebarPart, container, this.mainPart);
  }
  updateProperties(properties) {
    for (const part of this.parts) {
      part.updateProperties(properties);
    }
  }
  registerVariables(variables) {
    for (const part of this.parts) {
      part.registerVariables(variables);
    }
  }
  get windowTitle() {
    if (!this._windowTitle) {
      this._windowTitle = this._register(this.instantiationService.createInstance(WindowTitle, mainWindow));
    }
    return this._windowTitle;
  }
  //#endregion
};
TitleService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IThemeService)
], TitleService);
export {
  AuxiliaryTitlebarPart,
  MainTitlebarPart,
  TitleService,
  TitlebarPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcYnJvd3NlclxccGFydHNcXHRpdGxlYmFyUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvdGl0bGViYXIvbWVkaWEvdGl0bGViYXJwYXJ0LmNzcyc7XG5pbXBvcnQgJy4vbWVkaWEvdGl0bGViYXJwYXJ0LmNzcyc7XG5pbXBvcnQgeyBNdWx0aVdpbmRvd1BhcnRzLCBQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydC5qcyc7XG5pbXBvcnQgeyBJVGl0bGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3RpdGxlL2Jyb3dzZXIvdGl0bGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFpvb21GYWN0b3IsIGlzV0NPRW5hYmxlZCwgZ2V0V0NPVGl0bGViYXJBcmVhUmVjdCwgaXNGdWxsc2NyZWVuLCBvbkRpZENoYW5nZUZ1bGxzY3JlZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvYnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBoYXNDdXN0b21UaXRsZWJhciwgaGFzTmF0aXZlVGl0bGViYXIsIERFRkFVTFRfQ1VTVE9NX1RJVExFQkFSX0hFSUdIVCwgVGl0bGViYXJTdHlsZSwgZ2V0VGl0bGVCYXJTdHlsZSwgZ2V0V2luZG93Q29udHJvbHNTdHlsZSwgV2luZG93Q29udHJvbHNTdHlsZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFnZW50c0JhY2tncm91bmQsIGFnZW50c1BhbmVsRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCwgaXNXZWIsIGlzTmF0aXZlLCBwbGF0Zm9ybUxvY2FsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEV2ZW50VHlwZSwgRXZlbnRIZWxwZXIsIGFwcGVuZCwgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBwcmVwZW5kLCBnZXRXaW5kb3csIGdldFdpbmRvd0lkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBQYXJ0cywgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5cbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IEhpZGRlbkl0ZW1TdHJhdGVneSwgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2RlV2luZG93LCBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBzYWZlSW50bCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgSVRpdGxlYmFyUGFydCwgSVRpdGxlUHJvcGVydGllcywgSVRpdGxlVmFyaWFibGUsIElBdXhpbGlhcnlUaXRsZWJhclBhcnQgfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy90aXRsZWJhci90aXRsZWJhclBhcnQuanMnO1xuaW1wb3J0IHsgV2luZG93VGl0bGUgfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy90aXRsZWJhci93aW5kb3dUaXRsZS5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uL21lbnVzLmpzJztcbmltcG9ydCB7IElzTmV3Q2hhdFNlc3Npb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcblxuY29uc3QgY29tbWFuZENlbnRlckNvbnRleHRLZXlzID0gbmV3IFNldChbSXNOZXdDaGF0U2Vzc2lvbkNvbnRleHQua2V5XSk7XG5cbi8qKlxuICogU2ltcGxpZmllZCBhZ2VudCBzZXNzaW9ucyB0aXRsZWJhciBwYXJ0LlxuICpcbiAqIFRocmVlIHNlY3Rpb25zIGRyaXZlbiBlbnRpcmVseSBieSBtZW51czpcbiAqIC0gKipMZWZ0Kio6IGBNZW51cy5UaXRsZUJhckxlZnRgIHRvb2xiYXJcbiAqIC0gKipDZW50ZXIqKjogYE1lbnVzLkNvbW1hbmRDZW50ZXJgIHRvb2xiYXIgKHJlbmRlcnMgc2Vzc2lvbiBwaWNrZXIgdmlhIElBY3Rpb25WaWV3SXRlbVNlcnZpY2UpXG4gKiAtICoqUmlnaHQqKjogYE1lbnVzLlRpdGxlQmFyUmlnaHRgIHRvb2xiYXIgKGluY2x1ZGVzIGFjY291bnQgc3VibWVudSlcbiAqXG4gKiBObyBtZW51YmFyLCBubyBlZGl0b3IgYWN0aW9ucywgbm8gbGF5b3V0IGNvbnRyb2xzLCBubyBXaW5kb3dUaXRsZSBkZXBlbmRlbmN5LlxuICovXG5leHBvcnQgY2xhc3MgVGl0bGViYXJQYXJ0IGV4dGVuZHMgUGFydCBpbXBsZW1lbnRzIElUaXRsZWJhclBhcnQge1xuXG5cdC8vI3JlZ2lvbiBJVmlld1xuXG5cdHJlYWRvbmx5IG1pbmltdW1XaWR0aDogbnVtYmVyID0gMDtcblx0cmVhZG9ubHkgbWF4aW11bVdpZHRoOiBudW1iZXIgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cblx0Z2V0IG1pbmltdW1IZWlnaHQoKTogbnVtYmVyIHtcblx0XHRjb25zdCB3Y29FbmFibGVkID0gaXNXZWIgJiYgaXNXQ09FbmFibGVkKCk7XG5cdFx0bGV0IHZhbHVlID0gREVGQVVMVF9DVVNUT01fVElUTEVCQVJfSEVJR0hUO1xuXHRcdGlmICh3Y29FbmFibGVkKSB7XG5cdFx0XHR2YWx1ZSA9IE1hdGgubWF4KHZhbHVlLCBnZXRXQ09UaXRsZWJhckFyZWFSZWN0KGdldFdpbmRvdyh0aGlzLmVsZW1lbnQpKT8uaGVpZ2h0ID8/IDApO1xuXHRcdH1cblxuXHRcdHJldHVybiB2YWx1ZSAvICh0aGlzLnByZXZlbnRab29tID8gZ2V0Wm9vbUZhY3RvcihnZXRXaW5kb3codGhpcy5lbGVtZW50KSkgOiAxKTtcblx0fVxuXG5cdGdldCBtYXhpbXVtSGVpZ2h0KCk6IG51bWJlciB7IHJldHVybiB0aGlzLm1pbmltdW1IZWlnaHQ7IH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRXZlbnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25NZW51YmFyVmlzaWJpbGl0eUNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbk1lbnViYXJWaXNpYmlsaXR5Q2hhbmdlID0gdGhpcy5fb25NZW51YmFyVmlzaWJpbGl0eUNoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxEaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbERpc3Bvc2UgPSB0aGlzLl9vbldpbGxEaXNwb3NlLmV2ZW50O1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByb3RlY3RlZCByb290Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByb3RlY3RlZCB3aW5kb3dDb250cm9sc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBsZWZ0Q29udGVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGxlZnRUb29sYmFyQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgY2VudGVyQ29udGVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJpZ2h0Q29udGVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IG92ZXJmbG93TWFuYWdlZFRvb2xCYXJFbGVtZW50czogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXG5cdGdldCBsZWZ0Q29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHsgcmV0dXJuIHRoaXMubGVmdENvbnRlbnQ7IH1cblx0Z2V0IHJpZ2h0Q29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHsgcmV0dXJuIHRoaXMucmlnaHRDb250ZW50OyB9XG5cdGdldCByaWdodFdpbmRvd0NvbnRyb2xzQ29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMud2luZG93Q29udHJvbHNDb250YWluZXI7IH1cblxuXHRwcml2YXRlIGxlZnRTcGFjZXJXaWR0aDogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHRpdGxlQmFyU3R5bGU6IFRpdGxlYmFyU3R5bGU7XG5cdHByaXZhdGUgaXNJbmFjdGl2ZTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcsXG5cdFx0dGFyZ2V0V2luZG93OiBDb2RlV2luZG93LFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoaWQsIHsgaGFzVGl0bGU6IGZhbHNlIH0sIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxheW91dFNlcnZpY2UpO1xuXG5cdFx0dGhpcy50aXRsZUJhclN0eWxlID0gZ2V0VGl0bGVCYXJTdHlsZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoZ2V0V2luZG93SWQodGFyZ2V0V2luZG93KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKHRhcmdldFdpbmRvd0lkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXMoZm9jdXNlZCA9PiBmb2N1c2VkID8gdGhpcy5vbkZvY3VzKCkgOiB0aGlzLm9uQmx1cigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3N0U2VydmljZS5vbkRpZENoYW5nZUFjdGl2ZVdpbmRvdyh3aW5kb3dJZCA9PiB3aW5kb3dJZCA9PT0gdGFyZ2V0V2luZG93SWQgPyB0aGlzLm9uRm9jdXMoKSA6IHRoaXMub25CbHVyKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgb25CbHVyKCk6IHZvaWQge1xuXHRcdHRoaXMuaXNJbmFjdGl2ZSA9IHRydWU7XG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgb25Gb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLmlzSW5hY3RpdmUgPSBmYWxzZTtcblx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXHR9XG5cblx0dXBkYXRlUHJvcGVydGllcyhfcHJvcGVydGllczogSVRpdGxlUHJvcGVydGllcyk6IHZvaWQge1xuXHRcdC8vIE5vIHdpbmRvdyB0aXRsZSB0byB1cGRhdGUgaW4gc2ltcGxpZmllZCB0aXRsZWJhclxuXHR9XG5cblx0cmVnaXN0ZXJWYXJpYWJsZXMoX3ZhcmlhYmxlczogSVRpdGxlVmFyaWFibGVbXSk6IHZvaWQge1xuXHRcdC8vIE5vIHdpbmRvdyB0aXRsZSB2YXJpYWJsZXMgaW4gc2ltcGxpZmllZCB0aXRsZWJhclxuXHR9XG5cblx0dXBkYXRlT3B0aW9ucyhfb3B0aW9uczogeyBjb21wYWN0OiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHQvLyBObyBjb21wYWN0IG1vZGUgc3VwcG9ydCBpbiBhZ2VudCBzZXNzaW9ucyB0aXRsZWJhclxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUNvbnRlbnRBcmVhKHBhcmVudDogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0dGhpcy5lbGVtZW50ID0gcGFyZW50O1xuXHRcdHRoaXMucm9vdENvbnRhaW5lciA9IGFwcGVuZChwYXJlbnQsICQoJy50aXRsZWJhci1jb250YWluZXIuc2Vzc2lvbnMtdGl0bGViYXItY29udGFpbmVyLmhhcy1jZW50ZXInKSk7XG5cblx0XHQvLyBEcmFnZ2FibGUgcmVnaW9uXG5cdFx0cHJlcGVuZCh0aGlzLnJvb3RDb250YWluZXIsICQoJ2Rpdi50aXRsZWJhci1kcmFnLXJlZ2lvbicpKTtcblxuXHRcdHRoaXMubGVmdENvbnRlbnQgPSBhcHBlbmQodGhpcy5yb290Q29udGFpbmVyLCAkKCcudGl0bGViYXItbGVmdCcpKTtcblx0XHR0aGlzLmNlbnRlckNvbnRlbnQgPSBhcHBlbmQodGhpcy5yb290Q29udGFpbmVyLCAkKCcudGl0bGViYXItY2VudGVyJykpO1xuXHRcdHRoaXMucmlnaHRDb250ZW50ID0gYXBwZW5kKHRoaXMucm9vdENvbnRhaW5lciwgJCgnLnRpdGxlYmFyLXJpZ2h0JykpO1xuXG5cdFx0Ly8gV2luZG93IENvbnRyb2xzIENvbnRhaW5lciAobXVzdCBiZSBiZWZvcmUgbGVmdCB0b29sYmFyIGZvciBjb3JyZWN0IG9yZGVyaW5nKVxuXHRcdGlmICghaGFzTmF0aXZlVGl0bGViYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy50aXRsZUJhclN0eWxlKSkge1xuXHRcdFx0bGV0IHByaW1hcnlXaW5kb3dDb250cm9sc0xvY2F0aW9uID0gaXNNYWNpbnRvc2ggPyAnbGVmdCcgOiAncmlnaHQnO1xuXHRcdFx0aWYgKGlzTWFjaW50b3NoICYmIGlzTmF0aXZlKSB7XG5cdFx0XHRcdGNvbnN0IGxvY2FsZUluZm8gPSBzYWZlSW50bC5Mb2NhbGUocGxhdGZvcm1Mb2NhbGUpLnZhbHVlO1xuXHRcdFx0XHRjb25zdCB0ZXh0SW5mbyA9IChsb2NhbGVJbmZvIGFzIHsgdGV4dEluZm8/OiB7IGRpcmVjdGlvbj86IHN0cmluZyB9IH0pLnRleHRJbmZvO1xuXHRcdFx0XHRpZiAodGV4dEluZm8/LmRpcmVjdGlvbiA9PT0gJ3J0bCcpIHtcblx0XHRcdFx0XHRwcmltYXJ5V2luZG93Q29udHJvbHNMb2NhdGlvbiA9ICdyaWdodCc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzTWFjaW50b3NoICYmIGlzTmF0aXZlICYmIHByaW1hcnlXaW5kb3dDb250cm9sc0xvY2F0aW9uID09PSAnbGVmdCcpIHtcblx0XHRcdFx0Ly8gbWFjT1MgbmF0aXZlOiB0cmFmZmljIGxpZ2h0cyBhcmUgcmVuZGVyZWQgYnkgdGhlIE9TIGF0IHRoZSB0b3AtbGVmdCBjb3JuZXIuXG5cdFx0XHRcdC8vIEFkZCBhIGZpeGVkLXdpZHRoIHNwYWNlciB0byBwdXNoIGNvbnRlbnQgcGFzdCB0aGUgdHJhZmZpYyBsaWdodHMuXG5cdFx0XHRcdGNvbnN0IHNwYWNlciA9IGFwcGVuZCh0aGlzLmxlZnRDb250ZW50LCAkKCdkaXYud2luZG93LWNvbnRyb2xzLWNvbnRhaW5lcicpKTtcblxuXHRcdFx0XHQvLyBIaWRlIHNwYWNlciBpbiBmdWxsc2NyZWVuICh0cmFmZmljIGxpZ2h0cyBhcmUgbm90IHNob3duKVxuXHRcdFx0XHRjb25zdCB1cGRhdGVTcGFjZXJWaXNpYmlsaXR5ID0gKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGZ1bGxzY3JlZW4gPSBpc0Z1bGxzY3JlZW4obWFpbldpbmRvdyk7XG5cdFx0XHRcdFx0c3BhY2VyLnN0eWxlLmRpc3BsYXkgPSBmdWxsc2NyZWVuID8gJ25vbmUnIDogJyc7XG5cdFx0XHRcdFx0dGhpcy5sZWZ0U3BhY2VyV2lkdGggPSBmdWxsc2NyZWVuID8gMCA6IDcwO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR1cGRhdGVTcGFjZXJWaXNpYmlsaXR5KCk7XG5cdFx0XHRcdHNwYWNlci5zdHlsZS53aWR0aCA9IGAke3RoaXMubGVmdFNwYWNlcldpZHRofXB4YDtcblx0XHRcdFx0c3BhY2VyLnN0eWxlLmZsZXhTaHJpbmsgPSAnMCc7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkQ2hhbmdlRnVsbHNjcmVlbih3aW5kb3dJZCA9PiB7XG5cdFx0XHRcdFx0aWYgKHdpbmRvd0lkID09PSBnZXRXaW5kb3dJZChtYWluV2luZG93KSkge1xuXHRcdFx0XHRcdFx0dXBkYXRlU3BhY2VyVmlzaWJpbGl0eSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fSBlbHNlIGlmIChnZXRXaW5kb3dDb250cm9sc1N0eWxlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpID09PSBXaW5kb3dDb250cm9sc1N0eWxlLkhJRERFTikge1xuXHRcdFx0XHQvLyBjb250cm9scyBleHBsaWNpdGx5IGRpc2FibGVkXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLndpbmRvd0NvbnRyb2xzQ29udGFpbmVyID0gYXBwZW5kKHByaW1hcnlXaW5kb3dDb250cm9sc0xvY2F0aW9uID09PSAnbGVmdCcgPyB0aGlzLmxlZnRDb250ZW50IDogdGhpcy5yaWdodENvbnRlbnQsICQoJ2Rpdi53aW5kb3ctY29udHJvbHMtY29udGFpbmVyJykpO1xuXHRcdFx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdFx0XHRhcHBlbmQocHJpbWFyeVdpbmRvd0NvbnRyb2xzTG9jYXRpb24gPT09ICdsZWZ0JyA/IHRoaXMucmlnaHRDb250ZW50IDogdGhpcy5sZWZ0Q29udGVudCwgJCgnZGl2LndpbmRvdy1jb250cm9scy1jb250YWluZXInKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXNXQ09FbmFibGVkKCkpIHtcblx0XHRcdFx0XHR0aGlzLndpbmRvd0NvbnRyb2xzQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3djby1lbmFibGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBMZWZ0IHRvb2xiYXIgKGRyaXZlbiBieSBNZW51cy5UaXRsZUJhckxlZnQsIHJlbmRlcmVkIGFmdGVyIHdpbmRvdyBjb250cm9scyB2aWEgQ1NTIG9yZGVyKVxuXHRcdHRoaXMubGVmdFRvb2xiYXJDb250YWluZXIgPSBhcHBlbmQodGhpcy5sZWZ0Q29udGVudCwgJCgnZGl2LmxlZnQtdG9vbGJhci1jb250YWluZXInKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdGhpcy5sZWZ0VG9vbGJhckNvbnRhaW5lciwgTWVudXMuVGl0bGVCYXJMZWZ0TGF5b3V0LCB7XG5cdFx0XHRjb250ZXh0TWVudTogTWVudXMuVGl0bGVCYXJDb250ZXh0LFxuXHRcdFx0dGVsZW1ldHJ5U291cmNlOiAndGl0bGVQYXJ0LmxlZnQnLFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdFx0dG9vbGJhck9wdGlvbnM6IHsgcHJpbWFyeUdyb3VwOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2VudGVyIHNlY3Rpb246IFtuYXYgdG9vbGJhcl0gW2NvbW1hbmQgY2VudGVyIGJveF0gW2FjdGlvbnMgdG9vbGJhcl1cblx0XHQvLyBBbGwgbGl2ZSBpbnNpZGUgLnRpdGxlYmFyLWNlbnRlciBzbyB0aGUgY2x1c3RlciBpcyB3aW5kb3ctY2VudGVyZWQuXG5cblx0XHQvLyBOYXZpZ2F0aW9uIHRvb2xiYXIgKEJhY2svRm9yd2FyZCksIHJlbmRlcmVkIGxlZnQgb2YgdGhlIGNvbW1hbmQgY2VudGVyLlxuXHRcdGNvbnN0IGNlbnRlck5hdkNvbnRhaW5lciA9IGFwcGVuZCh0aGlzLmNlbnRlckNvbnRlbnQsICQoJ2Rpdi50aXRsZWJhci1hY3Rpb25zLWNvbnRhaW5lci50aXRsZWJhci1jZW50ZXItbmF2LWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBjZW50ZXJOYXZUb29sQmFyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgY2VudGVyTmF2Q29udGFpbmVyLCBNZW51cy5UaXRsZUJhckNlbnRlckxlZnQsIHtcblx0XHRcdGNvbnRleHRNZW51OiBNZW51cy5UaXRsZUJhckNvbnRleHQsXG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0XHR0ZWxlbWV0cnlTb3VyY2U6ICd0aXRsZVBhcnQuY2VudGVyTGVmdCcsXG5cdFx0XHR0b29sYmFyT3B0aW9uczogeyBwcmltYXJ5R3JvdXA6ICgpID0+IHRydWUgfSxcblx0XHR9KSk7XG5cblx0XHQvLyBDZW50ZXIgdG9vbGJhciAtIGNvbW1hbmQgY2VudGVyIChyZW5kZXJzIHNlc3Npb24gcGlja2VyIHZpYSBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlKVxuXHRcdC8vIFVzZXMgLndpbmRvdy10aXRsZSA+IC5jb21tYW5kLWNlbnRlciBuZXN0aW5nIHRvIG1hdGNoIGRlZmF1bHQgd29ya2JlbmNoIENTUyBzZWxlY3RvcnNcblx0XHRjb25zdCB3aW5kb3dUaXRsZSA9IGFwcGVuZCh0aGlzLmNlbnRlckNvbnRlbnQsICQoJ2Rpdi53aW5kb3ctdGl0bGUnKSk7XG5cdFx0Y29uc3QgY2VudGVyVG9vbGJhckNvbnRhaW5lciA9IGFwcGVuZCh3aW5kb3dUaXRsZSwgJCgnZGl2LmNvbW1hbmQtY2VudGVyJykpO1xuXHRcdGNvbnN0IGNlbnRlclRvb2xiYXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBjZW50ZXJUb29sYmFyQ29udGFpbmVyLCBNZW51cy5Db21tYW5kQ2VudGVyLCB7XG5cdFx0XHRjb250ZXh0TWVudTogTWVudXMuVGl0bGVCYXJDb250ZXh0LFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdFx0dGVsZW1ldHJ5U291cmNlOiAnY29tbWFuZENlbnRlcicsXG5cdFx0XHR0b29sYmFyT3B0aW9uczogeyBwcmltYXJ5R3JvdXA6ICgpID0+IHRydWUgfSxcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzU29tZShjb21tYW5kQ2VudGVyQ29udGV4dEtleXMpKSB7XG5cdFx0XHRcdGNlbnRlclRvb2xiYXIucmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEFjdGlvbnMgdG9vbGJhciAoT3BlbiBpbiBWUyBDb2RlKSwgcmVuZGVyZWQgcmlnaHQgb2YgdGhlIGNvbW1hbmQgY2VudGVyLlxuXHRcdGNvbnN0IGNlbnRlckFjdGlvbnNDb250YWluZXIgPSBhcHBlbmQodGhpcy5jZW50ZXJDb250ZW50LCAkKCdkaXYudGl0bGViYXItYWN0aW9ucy1jb250YWluZXIudGl0bGViYXItY2VudGVyLWFjdGlvbnMtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGNlbnRlckFjdGlvbnNUb29sQmFyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgY2VudGVyQWN0aW9uc0NvbnRhaW5lciwgTWVudXMuVGl0bGVCYXJDZW50ZXJSaWdodCwge1xuXHRcdFx0Y29udGV4dE1lbnU6IE1lbnVzLlRpdGxlQmFyQ29udGV4dCxcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZSxcblx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ3RpdGxlUGFydC5jZW50ZXJSaWdodCcsXG5cdFx0XHR0b29sYmFyT3B0aW9uczogeyBwcmltYXJ5R3JvdXA6ICgpID0+IHRydWUgfSxcblx0XHR9KSk7XG5cblx0XHQvLyBSaWdodCB0b29sYmFyIChkcml2ZW4gYnkgTWVudXMuVGl0bGVCYXJSaWdodExheW91dCAtIGluY2x1ZGVzIGxheW91dCBhY3Rpb25zKVxuXHRcdGNvbnN0IHJpZ2h0VG9vbGJhckNvbnRhaW5lciA9IHByZXBlbmQodGhpcy5yaWdodENvbnRlbnQsICQoJ2Rpdi50aXRsZWJhci1hY3Rpb25zLWNvbnRhaW5lci50aXRsZWJhci1yaWdodC1sYXlvdXQtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHJpZ2h0VG9vbEJhciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIHJpZ2h0VG9vbGJhckNvbnRhaW5lciwgTWVudXMuVGl0bGVCYXJSaWdodExheW91dCwge1xuXHRcdFx0Y29udGV4dE1lbnU6IE1lbnVzLlRpdGxlQmFyQ29udGV4dCxcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZSxcblx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ3RpdGxlUGFydC5yaWdodCcsXG5cdFx0XHR0b29sYmFyT3B0aW9uczogeyBwcmltYXJ5R3JvdXA6ICgpID0+IHRydWUgfSxcblx0XHR9KSk7XG5cblx0XHQvLyBTZXNzaW9uIHRpdGxlIGFjdGlvbnMgdG9vbGJhciAoYmVmb3JlIHJpZ2h0IHRvb2xiYXIpXG5cdFx0Y29uc3Qgc2Vzc2lvbkFjdGlvbnNDb250YWluZXIgPSBwcmVwZW5kKHRoaXMucmlnaHRDb250ZW50LCAkKCdkaXYudGl0bGViYXItYWN0aW9ucy1jb250YWluZXIudGl0bGViYXItc2Vzc2lvbi1hY3Rpb25zLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBzZXNzaW9uQWN0aW9uc1Rvb2xCYXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBzZXNzaW9uQWN0aW9uc0NvbnRhaW5lciwgTWVudXMuVGl0bGVCYXJTZXNzaW9uTWVudSwge1xuXHRcdFx0Y29udGV4dE1lbnU6IE1lbnVzLlRpdGxlQmFyQ29udGV4dCxcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZSxcblx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ3RpdGxlUGFydC5zZXNzaW9uQWN0aW9ucycsXG5cdFx0XHR0b29sYmFyT3B0aW9uczogeyBwcmltYXJ5R3JvdXA6ICgpID0+IHRydWUgfSxcblx0XHR9KSk7XG5cblx0XHQvLyBVcGRhdGUgdG9vbGJhciAobGVmdG1vc3QgaW4gdGhlIHJpZ2h0LXNpZGUgY29udHJvbHMpXG5cdFx0Y29uc3QgdXBkYXRlVG9vbEJhckVsZW1lbnQgPSBwcmVwZW5kKHRoaXMucmlnaHRDb250ZW50LCAkKCdkaXYudGl0bGViYXItYWN0aW9ucy1jb250YWluZXIudGl0bGViYXItdXBkYXRlLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCB1cGRhdGVUb29sQmFyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdXBkYXRlVG9vbEJhckVsZW1lbnQsIE1lbnVzLlRpdGxlQmFyVXBkYXRlLCB7XG5cdFx0XHRjb250ZXh0TWVudTogTWVudXMuVGl0bGVCYXJDb250ZXh0LFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdFx0dGVsZW1ldHJ5U291cmNlOiAndGl0bGVQYXJ0LnVwZGF0ZScsXG5cdFx0XHR0b29sYmFyT3B0aW9uczogeyBwcmltYXJ5R3JvdXA6ICgpID0+IHRydWUgfSxcblx0XHR9KSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyT3ZlcmZsb3dNYW5hZ2VkVG9vbEJhcihjZW50ZXJBY3Rpb25zQ29udGFpbmVyLCBjZW50ZXJBY3Rpb25zVG9vbEJhcik7XG5cdFx0dGhpcy5yZWdpc3Rlck92ZXJmbG93TWFuYWdlZFRvb2xCYXIoY2VudGVyTmF2Q29udGFpbmVyLCBjZW50ZXJOYXZUb29sQmFyKTtcblx0XHR0aGlzLnJlZ2lzdGVyT3ZlcmZsb3dNYW5hZ2VkVG9vbEJhcihyaWdodFRvb2xiYXJDb250YWluZXIsIHJpZ2h0VG9vbEJhcik7XG5cdFx0dGhpcy5yZWdpc3Rlck92ZXJmbG93TWFuYWdlZFRvb2xCYXIoc2Vzc2lvbkFjdGlvbnNDb250YWluZXIsIHNlc3Npb25BY3Rpb25zVG9vbEJhcik7XG5cdFx0dGhpcy5yZWdpc3Rlck92ZXJmbG93TWFuYWdlZFRvb2xCYXIodXBkYXRlVG9vbEJhckVsZW1lbnQsIHVwZGF0ZVRvb2xCYXIpO1xuXG5cdFx0Ly8gQ29udGV4dCBtZW51IG9uIHRoZSB0aXRsZWJhclxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnJvb3RDb250YWluZXIsIEV2ZW50VHlwZS5DT05URVhUX01FTlUsIGUgPT4ge1xuXHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlKTtcblx0XHRcdHRoaXMub25Db250ZXh0TWVudShlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXG5cdFx0cmV0dXJuIHRoaXMuZWxlbWVudDtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVTdHlsZXMoKTtcblxuXHRcdGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdpbmFjdGl2ZScsIHRoaXMuaXNJbmFjdGl2ZSk7XG5cblx0XHRcdGNvbnN0IHRpdGxlQmFyQmFja2dyb3VuZCA9IHRoaXMuZ2V0Q29sb3IoYWdlbnRzQmFja2dyb3VuZCk7IC8vIHRyYW5zcGFyZW50IGJhY2tncm91bmQgbm90IHN1cHBvcnRlZCBvbiBzb21lIHBsYXRmb3Jtc1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHRpdGxlQmFyQmFja2dyb3VuZCB8fCAnJztcblxuXHRcdFx0Y29uc3QgdGl0bGVGb3JlZ3JvdW5kID0gdGhpcy5nZXRDb2xvcihhZ2VudHNQYW5lbEZvcmVncm91bmQpO1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLmNvbG9yID0gdGl0bGVGb3JlZ3JvdW5kIHx8ICcnO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvbkNvbnRleHRNZW51KGU6IE1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZ2V0V2luZG93KHRoaXMuZWxlbWVudCksIGUpO1xuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGV2ZW50LFxuXHRcdFx0bWVudUlkOiBNZW51cy5UaXRsZUJhckNvbnRleHQsXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZTogdGhpcy5jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdGRvbUZvclNoYWRvd1Jvb3Q6IGlzTWFjaW50b3NoICYmIGlzTmF0aXZlID8gZXZlbnQudGFyZ2V0IDogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cblxuXHRnZXQgaGFzWm9vbWFibGVFbGVtZW50cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTsgLy8gc2Vzc2lvbnMgdGl0bGViYXIgYWx3YXlzIGhhcyBjb21tYW5kIGNlbnRlciBhbmQgdG9vbGJhciBhY3Rpb25zXG5cdH1cblxuXHRnZXQgcHJldmVudFpvb20oKTogYm9vbGVhbiB7XG5cdFx0Ly8gUHJldmVudCB6b29taW5nIGJlaGF2aW9yIGlmIGFueSBvZiB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcblx0XHQvLyAxLiBTaHJpbmtpbmcgYmVsb3cgdGhlIHdpbmRvdyBjb250cm9sIHNpemUgKHpvb20gPCAxKVxuXHRcdC8vIDIuIE5vIGN1c3RvbSBpdGVtcyBhcmUgcHJlc2VudCBpbiB0aGUgdGl0bGUgYmFyXG5cdFx0cmV0dXJuIGdldFpvb21GYWN0b3IoZ2V0V2luZG93KHRoaXMuZWxlbWVudCkpIDwgMSB8fCAhdGhpcy5oYXNab29tYWJsZUVsZW1lbnRzO1xuXHR9XG5cblx0b3ZlcnJpZGUgbGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVMYXlvdXQoKTtcblx0XHRzdXBlci5sYXlvdXRDb250ZW50cyh3aWR0aCwgaGVpZ2h0KTtcblx0XHR0aGlzLnVwZGF0ZVRpdGxlQmFyVG9vbEJhck92ZXJmbG93KCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyT3ZlcmZsb3dNYW5hZ2VkVG9vbEJhcihlbGVtZW50OiBIVE1MRWxlbWVudCwgdG9vbEJhcjogTWVudVdvcmtiZW5jaFRvb2xCYXIpOiB2b2lkIHtcblx0XHR0aGlzLm92ZXJmbG93TWFuYWdlZFRvb2xCYXJFbGVtZW50cy5wdXNoKGVsZW1lbnQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvb2xCYXIub25EaWRDaGFuZ2VNZW51SXRlbXMoKCkgPT4gdGhpcy51cGRhdGVUaXRsZUJhclRvb2xCYXJPdmVyZmxvdygpKSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRpdGxlQmFyVG9vbEJhck92ZXJmbG93KCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiB0aGlzLm92ZXJmbG93TWFuYWdlZFRvb2xCYXJFbGVtZW50cykge1xuXHRcdFx0ZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdvdmVyZmxvd2luZycpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnJvb3RDb250YWluZXIuY2xpZW50V2lkdGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgdGhpcy5vdmVyZmxvd01hbmFnZWRUb29sQmFyRWxlbWVudHMpIHtcblx0XHRcdGlmICghdGhpcy5pc1RpdGxlQmFyT3ZlcmZsb3dpbmcoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2hhcy1uby1hY3Rpb25zJykpIHtcblx0XHRcdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdvdmVyZmxvd2luZycpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNUaXRsZUJhck92ZXJmbG93aW5nKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBbdGhpcy5yb290Q29udGFpbmVyLCB0aGlzLmxlZnRDb250ZW50LCB0aGlzLmNlbnRlckNvbnRlbnQsIHRoaXMucmlnaHRDb250ZW50XVxuXHRcdFx0LnNvbWUoZWxlbWVudCA9PiBlbGVtZW50LnNjcm9sbFdpZHRoID4gZWxlbWVudC5jbGllbnRXaWR0aCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUxheW91dCgpOiB2b2lkIHtcblx0XHRpZiAoIWhhc0N1c3RvbVRpdGxlYmFyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMudGl0bGVCYXJTdHlsZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB6b29tRmFjdG9yID0gZ2V0Wm9vbUZhY3RvcihnZXRXaW5kb3codGhpcy5lbGVtZW50KSk7XG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLXpvb20tZmFjdG9yJywgem9vbUZhY3Rvci50b1N0cmluZygpKTtcblx0XHR0aGlzLnJvb3RDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY291bnRlci16b29tJywgdGhpcy5wcmV2ZW50Wm9vbSk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHQodGhpcy5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1t0YWJpbmRleF06bm90KFt0YWJpbmRleD1cIi0xXCJdKScpIGFzIEhUTUxFbGVtZW50IHwgbnVsbCk/LmZvY3VzKCk7XG5cdH1cblxuXHR0b0pTT04oKTogb2JqZWN0IHtcblx0XHRyZXR1cm4geyB0eXBlOiBQYXJ0cy5USVRMRUJBUl9QQVJUIH07XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uV2lsbERpc3Bvc2UuZmlyZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIE1haW4gYWdlbnQgc2Vzc2lvbnMgdGl0bGViYXIgcGFydCAoZm9yIHRoZSBtYWluIHdpbmRvdykuXG4gKi9cbmV4cG9ydCBjbGFzcyBNYWluVGl0bGViYXJQYXJ0IGV4dGVuZHMgVGl0bGViYXJQYXJ0IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihQYXJ0cy5USVRMRUJBUl9QQVJULCBtYWluV2luZG93LCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbGF5b3V0U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGhvc3RTZXJ2aWNlKTtcblx0fVxufVxuXG4vKipcbiAqIEF1eGlsaWFyeSBhZ2VudCBzZXNzaW9ucyB0aXRsZWJhciBwYXJ0IChmb3IgYXV4aWxpYXJ5IHdpbmRvd3MpLlxuICovXG5leHBvcnQgY2xhc3MgQXV4aWxpYXJ5VGl0bGViYXJQYXJ0IGV4dGVuZHMgVGl0bGViYXJQYXJ0IGltcGxlbWVudHMgSUF1eGlsaWFyeVRpdGxlYmFyUGFydCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgQ09VTlRFUiA9IDE7XG5cblx0Z2V0IGhlaWdodCgpIHsgcmV0dXJuIHRoaXMubWluaW11bUhlaWdodDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtYWluVGl0bGViYXI6IFRpdGxlYmFyUGFydCxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBpZCA9IEF1eGlsaWFyeVRpdGxlYmFyUGFydC5DT1VOVEVSKys7XG5cdFx0c3VwZXIoYHdvcmtiZW5jaC5wYXJ0cy5hdXhpbGlhcnlUaXRsZS4ke2lkfWAsIGdldFdpbmRvdyhjb250YWluZXIpLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbGF5b3V0U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGhvc3RTZXJ2aWNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBwcmV2ZW50Wm9vbSgpOiBib29sZWFuIHtcblx0XHQvLyBQcmV2ZW50IHpvb21pbmcgYmVoYXZpb3IgaWYgYW55IG9mIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuXHRcdC8vIDEuIFNocmlua2luZyBiZWxvdyB0aGUgd2luZG93IGNvbnRyb2wgc2l6ZSAoem9vbSA8IDEpXG5cdFx0Ly8gMi4gTm8gY3VzdG9tIGl0ZW1zIGFyZSBwcmVzZW50IGluIHRoZSBtYWluIHRpdGxlIGJhclxuXHRcdC8vIFRoZSBhdXhpbGlhcnkgdGl0bGUgYmFyIG5ldmVyIGNvbnRhaW5zIGFueSB6b29tYWJsZSBpdGVtcyBpdHNlbGYsXG5cdFx0Ly8gYnV0IHdlIHdhbnQgdG8gbWF0Y2ggdGhlIGJlaGF2aW9yIG9mIHRoZSBtYWluIHRpdGxlIGJhci5cblx0XHRyZXR1cm4gZ2V0Wm9vbUZhY3RvcihnZXRXaW5kb3codGhpcy5lbGVtZW50KSkgPCAxIHx8ICF0aGlzLm1haW5UaXRsZWJhci5oYXNab29tYWJsZUVsZW1lbnRzO1xuXHR9XG59XG5cbi8qKlxuICogQWdlbnQgU2Vzc2lvbnMgdGl0bGUgc2VydmljZSAtIG1hbmFnZXMgdGhlIHRpdGxlYmFyIHBhcnRzLlxuICovXG5leHBvcnQgY2xhc3MgVGl0bGVTZXJ2aWNlIGV4dGVuZHMgTXVsdGlXaW5kb3dQYXJ0czxUaXRsZWJhclBhcnQ+IGltcGxlbWVudHMgSVRpdGxlU2VydmljZSB7XG5cblx0ZGVjbGFyZSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgbWFpblBhcnQ6IFRpdGxlYmFyUGFydDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoJ3dvcmtiZW5jaC5hZ2VudFNlc3Npb25zVGl0bGVTZXJ2aWNlJywgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cblx0XHR0aGlzLm1haW5QYXJ0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5jcmVhdGVNYWluVGl0bGViYXJQYXJ0KCkpO1xuXHRcdHRoaXMub25NZW51YmFyVmlzaWJpbGl0eUNoYW5nZSA9IHRoaXMubWFpblBhcnQub25NZW51YmFyVmlzaWJpbGl0eUNoYW5nZTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlZ2lzdGVyUGFydCh0aGlzLm1haW5QYXJ0KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlTWFpblRpdGxlYmFyUGFydCgpOiBUaXRsZWJhclBhcnQge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1haW5UaXRsZWJhclBhcnQpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIEF1eGlsaWFyeSBUaXRsZWJhciBQYXJ0c1xuXG5cdGNyZWF0ZUF1eGlsaWFyeVRpdGxlYmFyUGFydChjb250YWluZXI6IEhUTUxFbGVtZW50LCBlZGl0b3JHcm91cHNDb250YWluZXI6IElFZGl0b3JHcm91cHNDb250YWluZXIsIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBJQXV4aWxpYXJ5VGl0bGViYXJQYXJ0IHtcblx0XHRjb25zdCB0aXRsZWJhclBhcnRDb250YWluZXIgPSAkKCcucGFydC50aXRsZWJhcicsIHsgcm9sZTogJ25vbmUnIH0pO1xuXHRcdHRpdGxlYmFyUGFydENvbnRhaW5lci5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cdFx0Y29udGFpbmVyLmluc2VydEJlZm9yZSh0aXRsZWJhclBhcnRDb250YWluZXIsIGNvbnRhaW5lci5maXJzdENoaWxkKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgdGl0bGViYXJQYXJ0ID0gdGhpcy5kb0NyZWF0ZUF1eGlsaWFyeVRpdGxlYmFyUGFydCh0aXRsZWJhclBhcnRDb250YWluZXIsIGVkaXRvckdyb3Vwc0NvbnRhaW5lciwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLnJlZ2lzdGVyUGFydCh0aXRsZWJhclBhcnQpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5ydW5BbmRTdWJzY3JpYmUodGl0bGViYXJQYXJ0Lm9uRGlkQ2hhbmdlLCAoKSA9PiB0aXRsZWJhclBhcnRDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7dGl0bGViYXJQYXJ0LmhlaWdodH1weGApKTtcblx0XHR0aXRsZWJhclBhcnQuY3JlYXRlKHRpdGxlYmFyUGFydENvbnRhaW5lcik7XG5cblx0XHRFdmVudC5vbmNlKHRpdGxlYmFyUGFydC5vbldpbGxEaXNwb3NlKSgoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpO1xuXG5cdFx0cmV0dXJuIHRpdGxlYmFyUGFydDtcblx0fVxuXG5cdHByb3RlY3RlZCBkb0NyZWF0ZUF1eGlsaWFyeVRpdGxlYmFyUGFydChjb250YWluZXI6IEhUTUxFbGVtZW50LCBfZWRpdG9yR3JvdXBzQ29udGFpbmVyOiBJRWRpdG9yR3JvdXBzQ29udGFpbmVyLCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogVGl0bGViYXJQYXJ0ICYgSUF1eGlsaWFyeVRpdGxlYmFyUGFydCB7XG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEF1eGlsaWFyeVRpdGxlYmFyUGFydCwgY29udGFpbmVyLCB0aGlzLm1haW5QYXJ0KTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBTZXJ2aWNlIEltcGxlbWVudGF0aW9uXG5cblx0cmVhZG9ubHkgb25NZW51YmFyVmlzaWJpbGl0eUNoYW5nZTogRXZlbnQ8Ym9vbGVhbj47XG5cblx0dXBkYXRlUHJvcGVydGllcyhwcm9wZXJ0aWVzOiBJVGl0bGVQcm9wZXJ0aWVzKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHRoaXMucGFydHMpIHtcblx0XHRcdHBhcnQudXBkYXRlUHJvcGVydGllcyhwcm9wZXJ0aWVzKTtcblx0XHR9XG5cdH1cblxuXHRyZWdpc3RlclZhcmlhYmxlcyh2YXJpYWJsZXM6IElUaXRsZVZhcmlhYmxlW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5wYXJ0cykge1xuXHRcdFx0cGFydC5yZWdpc3RlclZhcmlhYmxlcyh2YXJpYWJsZXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3dpbmRvd1RpdGxlOiBXaW5kb3dUaXRsZSB8IHVuZGVmaW5lZDtcblxuXHRnZXQgd2luZG93VGl0bGUoKTogV2luZG93VGl0bGUge1xuXHRcdC8vIFRoZSBBZ2VudHMgd2luZG93IHRpdGxlIGJhciBkb2VzIG5vdCByZW5kZXIgYHdpbmRvdy50aXRsZWAsIHNvIHdlXG5cdFx0Ly8gbGF6aWx5IGNvbnN0cnVjdCBhIGBXaW5kb3dUaXRsZWAgb25seSB3aGVuIGEgY29uc3VtZXIgKGUuZy4gYSBjdXN0b21cblx0XHQvLyBjb21tYW5kIGNlbnRlciB3aWRnZXQpIGFjdHVhbGx5IGFza3MgZm9yIG9uZS5cblx0XHRpZiAoIXRoaXMuX3dpbmRvd1RpdGxlKSB7XG5cdFx0XHR0aGlzLl93aW5kb3dUaXRsZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV2luZG93VGl0bGUsIG1haW5XaW5kb3cpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3dpbmRvd1RpdGxlO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxPQUFPO0FBQ1AsU0FBUyxrQkFBa0IsWUFBWTtBQUV2QyxTQUFTLGVBQWUsY0FBYyx3QkFBd0IsY0FBYyw2QkFBNkI7QUFDekcsU0FBUyxtQkFBbUIsbUJBQW1CLGdDQUErQyxrQkFBa0Isd0JBQXdCLDJCQUEyQjtBQUNuSyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGtCQUFrQiw2QkFBNkI7QUFDeEQsU0FBUyxhQUFhLE9BQU8sVUFBVSxzQkFBc0I7QUFDN0QsU0FBUyxXQUFXLGFBQWEsUUFBUSxHQUFHLHVCQUF1QixTQUFTLFdBQVcsbUJBQW1CO0FBQzFHLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsT0FBTywrQkFBK0I7QUFFL0MsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxvQkFBb0IsNEJBQTRCO0FBRXpELFNBQXFCLGtCQUFrQjtBQUN2QyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGFBQWE7QUFDdEIsU0FBUywrQkFBK0I7QUFFeEMsTUFBTSwyQkFBMkIsb0JBQUksSUFBSSxDQUFDLHdCQUF3QixHQUFHLENBQUM7QUFZL0QsSUFBTSxlQUFOLGNBQTJCLEtBQThCO0FBQUEsRUFpRC9ELFlBQ0MsSUFDQSxjQUNzQyxvQkFDSSxzQkFDQSxzQkFDM0IsY0FDRSxnQkFDUSxlQUNZLG1CQUNOLGFBQzlCO0FBQ0QsVUFBTSxJQUFJLEVBQUUsVUFBVSxNQUFNLEdBQUcsY0FBYyxnQkFBZ0IsYUFBYTtBQVRwQztBQUNJO0FBQ0E7QUFJTDtBQUNOO0FBdkRoQztBQUFBLFNBQVMsZUFBdUI7QUFDaEMsU0FBUyxlQUF1QixPQUFPO0FBa0J2QztBQUFBO0FBQUEsU0FBaUIsNkJBQTZCLEtBQUssVUFBVSxJQUFJLFFBQWlCLENBQUM7QUFDbkYsU0FBUyw0QkFBNEIsS0FBSywyQkFBMkI7QUFFckUsU0FBaUIsaUJBQWlCLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUNwRSxTQUFTLGdCQUFnQixLQUFLLGVBQWU7QUFXN0MsU0FBaUIsaUNBQWdELENBQUM7QUFNbEUsU0FBUSxrQkFBMEI7QUFHbEMsU0FBUSxhQUFzQjtBQWdCN0IsU0FBSyxnQkFBZ0IsaUJBQWlCLEtBQUssb0JBQW9CO0FBRS9ELFNBQUssa0JBQWtCLFlBQVksWUFBWSxDQUFDO0FBQUEsRUFDakQ7QUFBQSxFQTNEQSxJQUFJLGdCQUF3QjtBQUMzQixVQUFNLGFBQWEsU0FBUyxhQUFhO0FBQ3pDLFFBQUksUUFBUTtBQUNaLFFBQUksWUFBWTtBQUNmLGNBQVEsS0FBSyxJQUFJLE9BQU8sdUJBQXVCLFVBQVUsS0FBSyxPQUFPLENBQUMsR0FBRyxVQUFVLENBQUM7QUFBQSxJQUNyRjtBQUVBLFdBQU8sU0FBUyxLQUFLLGNBQWMsY0FBYyxVQUFVLEtBQUssT0FBTyxDQUFDLElBQUk7QUFBQSxFQUM3RTtBQUFBLEVBRUEsSUFBSSxnQkFBd0I7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFlO0FBQUEsRUF1QnpELElBQUksZ0JBQTZCO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBYTtBQUFBLEVBQzVELElBQUksaUJBQThCO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBYztBQUFBLEVBQzlELElBQUksK0JBQXdEO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBeUI7QUFBQSxFQTBCM0Ysa0JBQWtCLGdCQUE4QjtBQUN2RCxTQUFLLFVBQVUsS0FBSyxZQUFZLGlCQUFpQixhQUFXLFVBQVUsS0FBSyxRQUFRLElBQUksS0FBSyxPQUFPLENBQUMsQ0FBQztBQUNyRyxTQUFLLFVBQVUsS0FBSyxZQUFZLHdCQUF3QixjQUFZLGFBQWEsaUJBQWlCLEtBQUssUUFBUSxJQUFJLEtBQUssT0FBTyxDQUFDLENBQUM7QUFBQSxFQUNsSTtBQUFBLEVBRVEsU0FBZTtBQUN0QixTQUFLLGFBQWE7QUFDbEIsU0FBSyxhQUFhO0FBQUEsRUFDbkI7QUFBQSxFQUVRLFVBQWdCO0FBQ3ZCLFNBQUssYUFBYTtBQUNsQixTQUFLLGFBQWE7QUFBQSxFQUNuQjtBQUFBLEVBRUEsaUJBQWlCLGFBQXFDO0FBQUEsRUFFdEQ7QUFBQSxFQUVBLGtCQUFrQixZQUFvQztBQUFBLEVBRXREO0FBQUEsRUFFQSxjQUFjLFVBQXNDO0FBQUEsRUFFcEQ7QUFBQSxFQUVtQixrQkFBa0IsUUFBa0M7QUFDdEUsU0FBSyxVQUFVO0FBQ2YsU0FBSyxnQkFBZ0IsT0FBTyxRQUFRLEVBQUUsNERBQTRELENBQUM7QUFHbkcsWUFBUSxLQUFLLGVBQWUsRUFBRSwwQkFBMEIsQ0FBQztBQUV6RCxTQUFLLGNBQWMsT0FBTyxLQUFLLGVBQWUsRUFBRSxnQkFBZ0IsQ0FBQztBQUNqRSxTQUFLLGdCQUFnQixPQUFPLEtBQUssZUFBZSxFQUFFLGtCQUFrQixDQUFDO0FBQ3JFLFNBQUssZUFBZSxPQUFPLEtBQUssZUFBZSxFQUFFLGlCQUFpQixDQUFDO0FBR25FLFFBQUksQ0FBQyxrQkFBa0IsS0FBSyxzQkFBc0IsS0FBSyxhQUFhLEdBQUc7QUFDdEUsVUFBSSxnQ0FBZ0MsY0FBYyxTQUFTO0FBQzNELFVBQUksZUFBZSxVQUFVO0FBQzVCLGNBQU0sYUFBYSxTQUFTLE9BQU8sY0FBYyxFQUFFO0FBQ25ELGNBQU0sV0FBWSxXQUFxRDtBQUN2RSxZQUFJLFVBQVUsY0FBYyxPQUFPO0FBQ2xDLDBDQUFnQztBQUFBLFFBQ2pDO0FBQUEsTUFDRDtBQUVBLFVBQUksZUFBZSxZQUFZLGtDQUFrQyxRQUFRO0FBR3hFLGNBQU0sU0FBUyxPQUFPLEtBQUssYUFBYSxFQUFFLCtCQUErQixDQUFDO0FBRzFFLGNBQU0seUJBQXlCLE1BQU07QUFDcEMsZ0JBQU0sYUFBYSxhQUFhLFVBQVU7QUFDMUMsaUJBQU8sTUFBTSxVQUFVLGFBQWEsU0FBUztBQUM3QyxlQUFLLGtCQUFrQixhQUFhLElBQUk7QUFBQSxRQUN6QztBQUNBLCtCQUF1QjtBQUN2QixlQUFPLE1BQU0sUUFBUSxHQUFHLEtBQUssZUFBZTtBQUM1QyxlQUFPLE1BQU0sYUFBYTtBQUMxQixhQUFLLFVBQVUsc0JBQXNCLGNBQVk7QUFDaEQsY0FBSSxhQUFhLFlBQVksVUFBVSxHQUFHO0FBQ3pDLG1DQUF1QjtBQUFBLFVBQ3hCO0FBQUEsUUFDRCxDQUFDLENBQUM7QUFBQSxNQUNILFdBQVcsdUJBQXVCLEtBQUssb0JBQW9CLE1BQU0sb0JBQW9CLFFBQVE7QUFBQSxNQUU3RixPQUFPO0FBQ04sYUFBSywwQkFBMEIsT0FBTyxrQ0FBa0MsU0FBUyxLQUFLLGNBQWMsS0FBSyxjQUFjLEVBQUUsK0JBQStCLENBQUM7QUFDekosWUFBSSxPQUFPO0FBQ1YsaUJBQU8sa0NBQWtDLFNBQVMsS0FBSyxlQUFlLEtBQUssYUFBYSxFQUFFLCtCQUErQixDQUFDO0FBQUEsUUFDM0g7QUFFQSxZQUFJLGFBQWEsR0FBRztBQUNuQixlQUFLLHdCQUF3QixVQUFVLElBQUksYUFBYTtBQUFBLFFBQ3pEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFHQSxTQUFLLHVCQUF1QixPQUFPLEtBQUssYUFBYSxFQUFFLDRCQUE0QixDQUFDO0FBQ3BGLFNBQUssVUFBVSxLQUFLLHFCQUFxQixlQUFlLHNCQUFzQixLQUFLLHNCQUFzQixNQUFNLG9CQUFvQjtBQUFBLE1BQ2xJLGFBQWEsTUFBTTtBQUFBLE1BQ25CLGlCQUFpQjtBQUFBLE1BQ2pCLG9CQUFvQixtQkFBbUI7QUFBQSxNQUN2QyxnQkFBZ0IsRUFBRSxjQUFjLE1BQU0sS0FBSztBQUFBLElBQzVDLENBQUMsQ0FBQztBQU1GLFVBQU0scUJBQXFCLE9BQU8sS0FBSyxlQUFlLEVBQUUsOERBQThELENBQUM7QUFDdkgsVUFBTSxtQkFBbUIsS0FBSyxVQUFVLEtBQUsscUJBQXFCLGVBQWUsc0JBQXNCLG9CQUFvQixNQUFNLG9CQUFvQjtBQUFBLE1BQ3BKLGFBQWEsTUFBTTtBQUFBLE1BQ25CLG9CQUFvQixtQkFBbUI7QUFBQSxNQUN2QyxpQkFBaUI7QUFBQSxNQUNqQixnQkFBZ0IsRUFBRSxjQUFjLE1BQU0sS0FBSztBQUFBLElBQzVDLENBQUMsQ0FBQztBQUlGLFVBQU0sY0FBYyxPQUFPLEtBQUssZUFBZSxFQUFFLGtCQUFrQixDQUFDO0FBQ3BFLFVBQU0seUJBQXlCLE9BQU8sYUFBYSxFQUFFLG9CQUFvQixDQUFDO0FBQzFFLFVBQU0sZ0JBQWdCLEtBQUssVUFBVSxLQUFLLHFCQUFxQixlQUFlLHNCQUFzQix3QkFBd0IsTUFBTSxlQUFlO0FBQUEsTUFDaEosYUFBYSxNQUFNO0FBQUEsTUFDbkIsb0JBQW9CLG1CQUFtQjtBQUFBLE1BQ3ZDLGlCQUFpQjtBQUFBLE1BQ2pCLGdCQUFnQixFQUFFLGNBQWMsTUFBTSxLQUFLO0FBQUEsSUFDNUMsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLEtBQUssa0JBQWtCLG1CQUFtQixPQUFLO0FBQzdELFVBQUksRUFBRSxZQUFZLHdCQUF3QixHQUFHO0FBQzVDLHNCQUFjLFFBQVE7QUFBQSxNQUN2QjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YsVUFBTSx5QkFBeUIsT0FBTyxLQUFLLGVBQWUsRUFBRSxrRUFBa0UsQ0FBQztBQUMvSCxVQUFNLHVCQUF1QixLQUFLLFVBQVUsS0FBSyxxQkFBcUIsZUFBZSxzQkFBc0Isd0JBQXdCLE1BQU0scUJBQXFCO0FBQUEsTUFDN0osYUFBYSxNQUFNO0FBQUEsTUFDbkIsb0JBQW9CLG1CQUFtQjtBQUFBLE1BQ3ZDLGlCQUFpQjtBQUFBLE1BQ2pCLGdCQUFnQixFQUFFLGNBQWMsTUFBTSxLQUFLO0FBQUEsSUFDNUMsQ0FBQyxDQUFDO0FBR0YsVUFBTSx3QkFBd0IsUUFBUSxLQUFLLGNBQWMsRUFBRSxnRUFBZ0UsQ0FBQztBQUM1SCxVQUFNLGVBQWUsS0FBSyxVQUFVLEtBQUsscUJBQXFCLGVBQWUsc0JBQXNCLHVCQUF1QixNQUFNLHFCQUFxQjtBQUFBLE1BQ3BKLGFBQWEsTUFBTTtBQUFBLE1BQ25CLG9CQUFvQixtQkFBbUI7QUFBQSxNQUN2QyxpQkFBaUI7QUFBQSxNQUNqQixnQkFBZ0IsRUFBRSxjQUFjLE1BQU0sS0FBSztBQUFBLElBQzVDLENBQUMsQ0FBQztBQUdGLFVBQU0sMEJBQTBCLFFBQVEsS0FBSyxjQUFjLEVBQUUsbUVBQW1FLENBQUM7QUFDakksVUFBTSx3QkFBd0IsS0FBSyxVQUFVLEtBQUsscUJBQXFCLGVBQWUsc0JBQXNCLHlCQUF5QixNQUFNLHFCQUFxQjtBQUFBLE1BQy9KLGFBQWEsTUFBTTtBQUFBLE1BQ25CLG9CQUFvQixtQkFBbUI7QUFBQSxNQUN2QyxpQkFBaUI7QUFBQSxNQUNqQixnQkFBZ0IsRUFBRSxjQUFjLE1BQU0sS0FBSztBQUFBLElBQzVDLENBQUMsQ0FBQztBQUdGLFVBQU0sdUJBQXVCLFFBQVEsS0FBSyxjQUFjLEVBQUUsMERBQTBELENBQUM7QUFDckgsVUFBTSxnQkFBZ0IsS0FBSyxVQUFVLEtBQUsscUJBQXFCLGVBQWUsc0JBQXNCLHNCQUFzQixNQUFNLGdCQUFnQjtBQUFBLE1BQy9JLGFBQWEsTUFBTTtBQUFBLE1BQ25CLG9CQUFvQixtQkFBbUI7QUFBQSxNQUN2QyxpQkFBaUI7QUFBQSxNQUNqQixnQkFBZ0IsRUFBRSxjQUFjLE1BQU0sS0FBSztBQUFBLElBQzVDLENBQUMsQ0FBQztBQUVGLFNBQUssK0JBQStCLHdCQUF3QixvQkFBb0I7QUFDaEYsU0FBSywrQkFBK0Isb0JBQW9CLGdCQUFnQjtBQUN4RSxTQUFLLCtCQUErQix1QkFBdUIsWUFBWTtBQUN2RSxTQUFLLCtCQUErQix5QkFBeUIscUJBQXFCO0FBQ2xGLFNBQUssK0JBQStCLHNCQUFzQixhQUFhO0FBR3ZFLFNBQUssVUFBVSxzQkFBc0IsS0FBSyxlQUFlLFVBQVUsY0FBYyxPQUFLO0FBQ3JGLGtCQUFZLEtBQUssQ0FBQztBQUNsQixXQUFLLGNBQWMsQ0FBQztBQUFBLElBQ3JCLENBQUMsQ0FBQztBQUVGLFNBQUssYUFBYTtBQUVsQixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFUyxlQUFxQjtBQUM3QixVQUFNLGFBQWE7QUFFbkIsUUFBSSxLQUFLLFNBQVM7QUFDakIsV0FBSyxRQUFRLFVBQVUsT0FBTyxZQUFZLEtBQUssVUFBVTtBQUV6RCxZQUFNLHFCQUFxQixLQUFLLFNBQVMsZ0JBQWdCO0FBQ3pELFdBQUssUUFBUSxNQUFNLGtCQUFrQixzQkFBc0I7QUFFM0QsWUFBTSxrQkFBa0IsS0FBSyxTQUFTLHFCQUFxQjtBQUMzRCxXQUFLLFFBQVEsTUFBTSxRQUFRLG1CQUFtQjtBQUFBLElBQy9DO0FBQUEsRUFDRDtBQUFBLEVBRVUsY0FBYyxHQUFxQjtBQUM1QyxVQUFNLFFBQVEsSUFBSSxtQkFBbUIsVUFBVSxLQUFLLE9BQU8sR0FBRyxDQUFDO0FBQy9ELFNBQUssbUJBQW1CLGdCQUFnQjtBQUFBLE1BQ3ZDLFdBQVcsTUFBTTtBQUFBLE1BQ2pCLFFBQVEsTUFBTTtBQUFBLE1BQ2QsbUJBQW1CLEtBQUs7QUFBQSxNQUN4QixrQkFBa0IsZUFBZSxXQUFXLE1BQU0sU0FBUztBQUFBLElBQzVELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxJQUFJLHNCQUErQjtBQUNsQyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsSUFBSSxjQUF1QjtBQUkxQixXQUFPLGNBQWMsVUFBVSxLQUFLLE9BQU8sQ0FBQyxJQUFJLEtBQUssQ0FBQyxLQUFLO0FBQUEsRUFDNUQ7QUFBQSxFQUVTLE9BQU8sT0FBZSxRQUFzQjtBQUNwRCxTQUFLLGFBQWE7QUFDbEIsVUFBTSxlQUFlLE9BQU8sTUFBTTtBQUNsQyxTQUFLLDhCQUE4QjtBQUFBLEVBQ3BDO0FBQUEsRUFFUSwrQkFBK0IsU0FBc0IsU0FBcUM7QUFDakcsU0FBSywrQkFBK0IsS0FBSyxPQUFPO0FBQ2hELFNBQUssVUFBVSxRQUFRLHFCQUFxQixNQUFNLEtBQUssOEJBQThCLENBQUMsQ0FBQztBQUFBLEVBQ3hGO0FBQUEsRUFFUSxnQ0FBc0M7QUFDN0MsZUFBVyxXQUFXLEtBQUssZ0NBQWdDO0FBQzFELGNBQVEsVUFBVSxPQUFPLGFBQWE7QUFBQSxJQUN2QztBQUVBLFFBQUksS0FBSyxjQUFjLGdCQUFnQixHQUFHO0FBQ3pDO0FBQUEsSUFDRDtBQUVBLGVBQVcsV0FBVyxLQUFLLGdDQUFnQztBQUMxRCxVQUFJLENBQUMsS0FBSyxzQkFBc0IsR0FBRztBQUNsQztBQUFBLE1BQ0Q7QUFFQSxVQUFJLENBQUMsUUFBUSxVQUFVLFNBQVMsZ0JBQWdCLEdBQUc7QUFDbEQsZ0JBQVEsVUFBVSxJQUFJLGFBQWE7QUFBQSxNQUNwQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSx3QkFBaUM7QUFDeEMsV0FBTyxDQUFDLEtBQUssZUFBZSxLQUFLLGFBQWEsS0FBSyxlQUFlLEtBQUssWUFBWSxFQUNqRixLQUFLLGFBQVcsUUFBUSxjQUFjLFFBQVEsV0FBVztBQUFBLEVBQzVEO0FBQUEsRUFFUSxlQUFxQjtBQUM1QixRQUFJLENBQUMsa0JBQWtCLEtBQUssc0JBQXNCLEtBQUssYUFBYSxHQUFHO0FBQ3RFO0FBQUEsSUFDRDtBQUVBLFVBQU0sYUFBYSxjQUFjLFVBQVUsS0FBSyxPQUFPLENBQUM7QUFDeEQsU0FBSyxRQUFRLE1BQU0sWUFBWSxpQkFBaUIsV0FBVyxTQUFTLENBQUM7QUFDckUsU0FBSyxjQUFjLFVBQVUsT0FBTyxnQkFBZ0IsS0FBSyxXQUFXO0FBQUEsRUFDckU7QUFBQSxFQUVBLFFBQWM7QUFFYixJQUFDLEtBQUssUUFBUSxjQUFjLGlDQUFpQyxHQUEwQixNQUFNO0FBQUEsRUFDOUY7QUFBQSxFQUVBLFNBQWlCO0FBQ2hCLFdBQU8sRUFBRSxNQUFNLE1BQU0sY0FBYztBQUFBLEVBQ3BDO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixTQUFLLGVBQWUsS0FBSztBQUN6QixVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQ0Q7QUE5VWEsZUFBTjtBQUFBLEVBb0RKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBM0RVO0FBbVZOLElBQU0sbUJBQU4sY0FBK0IsYUFBYTtBQUFBLEVBRWxELFlBQ3NCLG9CQUNFLHNCQUNBLHNCQUNSLGNBQ0UsZ0JBQ1EsZUFDTCxtQkFDTixhQUNiO0FBQ0QsVUFBTSxNQUFNLGVBQWUsWUFBWSxvQkFBb0Isc0JBQXNCLHNCQUFzQixjQUFjLGdCQUFnQixlQUFlLG1CQUFtQixXQUFXO0FBQUEsRUFDbkw7QUFDRDtBQWRhLG1CQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVZVO0FBbUJOLElBQU0sd0JBQU4sY0FBb0MsYUFBK0M7QUFBQSxFQU16RixZQUNVLFdBQ1EsY0FDSSxvQkFDRSxzQkFDQSxzQkFDUixjQUNFLGdCQUNRLGVBQ0wsbUJBQ04sYUFDYjtBQUNELFVBQU0sS0FBSyxzQkFBc0I7QUFDakMsVUFBTSxrQ0FBa0MsRUFBRSxJQUFJLFVBQVUsU0FBUyxHQUFHLG9CQUFvQixzQkFBc0Isc0JBQXNCLGNBQWMsZ0JBQWdCLGVBQWUsbUJBQW1CLFdBQVc7QUFadE07QUFDUTtBQUFBLEVBWWxCO0FBQUEsRUFoQkEsSUFBSSxTQUFTO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBZTtBQUFBLEVBa0IxQyxJQUFhLGNBQXVCO0FBTW5DLFdBQU8sY0FBYyxVQUFVLEtBQUssT0FBTyxDQUFDLElBQUksS0FBSyxDQUFDLEtBQUssYUFBYTtBQUFBLEVBQ3pFO0FBQ0Q7QUE5QmEsc0JBRUcsVUFBVTtBQUZiLHdCQUFOO0FBQUEsRUFTSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWhCVTtBQW1DTixJQUFNLGVBQU4sY0FBMkIsaUJBQXdEO0FBQUEsRUFNekYsWUFDMkMsc0JBQ3pCLGdCQUNGLGNBQ2Q7QUFDRCxVQUFNLHVDQUF1QyxjQUFjLGNBQWM7QUFKL0I7QUFNMUMsU0FBSyxXQUFXLEtBQUssVUFBVSxLQUFLLHVCQUF1QixDQUFDO0FBQzVELFNBQUssNEJBQTRCLEtBQUssU0FBUztBQUMvQyxTQUFLLFVBQVUsS0FBSyxhQUFhLEtBQUssUUFBUSxDQUFDO0FBQUEsRUFDaEQ7QUFBQSxFQUVVLHlCQUF1QztBQUNoRCxXQUFPLEtBQUsscUJBQXFCLGVBQWUsZ0JBQWdCO0FBQUEsRUFDakU7QUFBQTtBQUFBLEVBSUEsNEJBQTRCLFdBQXdCLHVCQUErQyxzQkFBcUU7QUFDdkssVUFBTSx3QkFBd0IsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLE9BQU8sQ0FBQztBQUNsRSwwQkFBc0IsTUFBTSxXQUFXO0FBQ3ZDLGNBQVUsYUFBYSx1QkFBdUIsVUFBVSxVQUFVO0FBRWxFLFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUV4QyxVQUFNLGVBQWUsS0FBSyw4QkFBOEIsdUJBQXVCLHVCQUF1QixvQkFBb0I7QUFDMUgsZ0JBQVksSUFBSSxLQUFLLGFBQWEsWUFBWSxDQUFDO0FBRS9DLGdCQUFZLElBQUksTUFBTSxnQkFBZ0IsYUFBYSxhQUFhLE1BQU0sc0JBQXNCLE1BQU0sU0FBUyxHQUFHLGFBQWEsTUFBTSxJQUFJLENBQUM7QUFDdEksaUJBQWEsT0FBTyxxQkFBcUI7QUFFekMsVUFBTSxLQUFLLGFBQWEsYUFBYSxFQUFFLE1BQU0sWUFBWSxRQUFRLENBQUM7QUFFbEUsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVVLDhCQUE4QixXQUF3Qix3QkFBZ0Qsc0JBQW9GO0FBQ25NLFdBQU8scUJBQXFCLGVBQWUsdUJBQXVCLFdBQVcsS0FBSyxRQUFRO0FBQUEsRUFDM0Y7QUFBQSxFQVFBLGlCQUFpQixZQUFvQztBQUNwRCxlQUFXLFFBQVEsS0FBSyxPQUFPO0FBQzlCLFdBQUssaUJBQWlCLFVBQVU7QUFBQSxJQUNqQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLGtCQUFrQixXQUFtQztBQUNwRCxlQUFXLFFBQVEsS0FBSyxPQUFPO0FBQzlCLFdBQUssa0JBQWtCLFNBQVM7QUFBQSxJQUNqQztBQUFBLEVBQ0Q7QUFBQSxFQUlBLElBQUksY0FBMkI7QUFJOUIsUUFBSSxDQUFDLEtBQUssY0FBYztBQUN2QixXQUFLLGVBQWUsS0FBSyxVQUFVLEtBQUsscUJBQXFCLGVBQWUsYUFBYSxVQUFVLENBQUM7QUFBQSxJQUNyRztBQUNBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQTtBQUdEO0FBN0VhLGVBQU47QUFBQSxFQU9KO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVRVOyIsCiAgIm5hbWVzIjogW10KfQo=
