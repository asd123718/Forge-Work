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
import { LayoutPriority, Orientation, Sizing, SplitView } from "../../../../base/browser/ui/splitview/splitview.js";
import { Disposable, dispose } from "../../../../base/common/lifecycle.js";
import { Event } from "../../../../base/common/event.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ITerminalChatService, ITerminalConfigurationService, ITerminalGroupService, ITerminalService, TerminalConnectionState, TerminalDataTransfers } from "./terminal.js";
import { TerminalTabsListSizes, TerminalTabList } from "./terminalTabsList.js";
import * as dom from "../../../../base/browser/dom.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { TerminalSettingId } from "../../../../platform/terminal/common/terminal.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { localize } from "../../../../nls.js";
import { openContextMenu } from "./terminalContextMenu.js";
import { TerminalStorageKeys } from "../common/terminalStorageKeys.js";
import { TerminalContextKeys } from "../common/terminalContextKey.js";
import { getInstanceHoverInfo } from "./terminalTooltip.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { TerminalTabsChatEntry } from "./terminalTabsChatEntry.js";
import { containsDragType } from "../../../../platform/dnd/browser/dnd.js";
import { getTerminalResourcesFromDragEvent, parseTerminalUri } from "./terminalUri.js";
import { TerminalContribContextKeyStrings } from "../terminalContribExports.js";
const $ = dom.$;
var CssClass = /* @__PURE__ */ ((CssClass2) => {
  CssClass2["ViewIsVertical"] = "terminal-side-view";
  return CssClass2;
})(CssClass || {});
var WidthConstants = /* @__PURE__ */ ((WidthConstants2) => {
  WidthConstants2[WidthConstants2["StatusIcon"] = 30] = "StatusIcon";
  WidthConstants2[WidthConstants2["SplitAnnotation"] = 30] = "SplitAnnotation";
  return WidthConstants2;
})(WidthConstants || {});
let TerminalTabbedView = class extends Disposable {
  constructor(parentElement, _terminalService, _terminalChatService, _terminalConfigurationService, _terminalGroupService, _instantiationService, _contextMenuService, _configurationService, menuService, _storageService, contextKeyService, _hoverService) {
    super();
    this._terminalService = _terminalService;
    this._terminalChatService = _terminalChatService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._terminalGroupService = _terminalGroupService;
    this._instantiationService = _instantiationService;
    this._contextMenuService = _contextMenuService;
    this._configurationService = _configurationService;
    this._storageService = _storageService;
    this._hoverService = _hoverService;
    this._cancelContextMenu = false;
    this._emptyAreaDropTargetCount = 0;
    this._tabContainer = $(".tabs-container");
    const tabListContainer = $(".tabs-list-container");
    this._tabListContainer = tabListContainer;
    this._tabListElement = $(".tabs-list");
    tabListContainer.appendChild(this._tabListElement);
    this._tabContainer.appendChild(tabListContainer);
    this._instanceMenu = this._register(menuService.createMenu(MenuId.TerminalInstanceContext, contextKeyService));
    this._tabsListMenu = this._register(menuService.createMenu(MenuId.TerminalTabContext, contextKeyService));
    this._tabsListEmptyMenu = this._register(menuService.createMenu(MenuId.TerminalTabEmptyAreaContext, contextKeyService));
    this._tabList = this._register(this._instantiationService.createInstance(TerminalTabList, this._tabListElement));
    this._tabListDomElement = this._tabList.getHTMLElement();
    this._chatEntry = this._register(this._instantiationService.createInstance(TerminalTabsChatEntry, tabListContainer, this._tabContainer));
    const terminalOuterContainer = $(".terminal-outer-container");
    this._terminalContainer = $(".terminal-groups-container");
    terminalOuterContainer.appendChild(this._terminalContainer);
    this._terminalService.setContainers(parentElement, this._terminalContainer);
    this._terminalIsTabsNarrowContextKey = TerminalContextKeys.tabsNarrow.bindTo(contextKeyService);
    this._terminalTabsFocusContextKey = TerminalContextKeys.tabsFocus.bindTo(contextKeyService);
    this._terminalTabsMouseContextKey = TerminalContextKeys.tabsMouse.bindTo(contextKeyService);
    this._tabTreeIndex = this._terminalConfigurationService.config.tabs.location === "left" ? 0 : 1;
    this._terminalContainerIndex = this._terminalConfigurationService.config.tabs.location === "left" ? 1 : 0;
    this._register(_configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TerminalSettingId.TabsEnabled) || e.affectsConfiguration(TerminalSettingId.TabsHideCondition)) {
        this._refreshShowTabs();
      } else if (e.affectsConfiguration(TerminalSettingId.TabsLocation)) {
        this._tabTreeIndex = this._terminalConfigurationService.config.tabs.location === "left" ? 0 : 1;
        this._terminalContainerIndex = this._terminalConfigurationService.config.tabs.location === "left" ? 1 : 0;
        if (this._shouldShowTabs()) {
          this._splitView.swapViews(0, 1);
          this._removeSashListener();
          this._addSashListener();
          this._splitView.resizeView(this._tabTreeIndex, this._getLastListWidth());
        }
      }
    }));
    this._register(Event.any(this._terminalGroupService.onDidChangeInstances, this._terminalGroupService.onDidChangeGroups)(() => {
      this._refreshShowTabs();
      this._updateChatTerminalsEntry();
    }));
    this._register(Event.any(this._terminalChatService.onDidRegisterTerminalInstanceWithToolSession, this._terminalService.onDidChangeInstances, this._terminalService.onDidDisposeInstance)(() => {
      this._refreshShowTabs();
      this._updateChatTerminalsEntry();
    }));
    this._register(contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(/* @__PURE__ */ new Set([TerminalContribContextKeyStrings.ChatHasHiddenTerminals]))) {
        this._refreshShowTabs();
        this._updateChatTerminalsEntry();
      }
    }));
    this._attachEventListeners(parentElement, this._terminalContainer);
    this._register(this._terminalGroupService.onDidChangePanelOrientation((orientation) => {
      this._panelOrientation = orientation;
      if (this._panelOrientation === Orientation.VERTICAL) {
        this._terminalContainer.classList.add("terminal-side-view" /* ViewIsVertical */);
      } else {
        this._terminalContainer.classList.remove("terminal-side-view" /* ViewIsVertical */);
      }
    }));
    this._splitView = new SplitView(parentElement, { orientation: Orientation.HORIZONTAL, proportionalLayout: false });
    this._setupSplitView(terminalOuterContainer);
    this._updateChatTerminalsEntry();
  }
  _shouldShowTabs() {
    const enabled = this._terminalConfigurationService.config.tabs.enabled;
    const hide = this._terminalConfigurationService.config.tabs.hideCondition;
    const hiddenChatTerminals = this._terminalChatService.getToolSessionTerminalInstances(true);
    if (!enabled) {
      return false;
    }
    if (hiddenChatTerminals.length > 0) {
      return true;
    }
    switch (hide) {
      case "never":
        return true;
      case "singleTerminal":
        if (this._terminalGroupService.instances.length > 1) {
          return true;
        }
        break;
      case "singleGroup":
        if (this._terminalGroupService.groups.length > 1) {
          return true;
        }
        break;
    }
    return false;
  }
  _refreshShowTabs() {
    if (this._shouldShowTabs()) {
      if (this._splitView.length === 1) {
        this._addTabTree();
        this._addSashListener();
        this._splitView.resizeView(this._tabTreeIndex, this._getLastListWidth());
        this.rerenderTabs();
      }
    } else {
      if (this._splitView.length === 2 && !this._terminalTabsMouseContextKey.get()) {
        this._splitView.removeView(this._tabTreeIndex);
        this._plusButton?.remove();
        this._removeSashListener();
      }
    }
  }
  _updateChatTerminalsEntry() {
    this._chatEntry?.update();
  }
  _getLastListWidth() {
    const widthKey = this._panelOrientation === Orientation.VERTICAL ? TerminalStorageKeys.TabsListWidthVertical : TerminalStorageKeys.TabsListWidthHorizontal;
    const storedValue = this._storageService.get(widthKey, StorageScope.PROFILE);
    if (!storedValue || !parseInt(storedValue)) {
      return this._panelOrientation === Orientation.VERTICAL ? TerminalTabsListSizes.NarrowViewWidth : TerminalTabsListSizes.DefaultWidth;
    }
    return parseInt(storedValue);
  }
  _handleOnDidSashReset() {
    let idealWidth = TerminalTabsListSizes.WideViewMinimumWidth;
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = 1;
    offscreenCanvas.height = 1;
    const ctx = offscreenCanvas.getContext("2d");
    if (ctx) {
      const style = dom.getWindow(this._tabListElement).getComputedStyle(this._tabListElement);
      ctx.font = `${style.fontStyle} ${style.fontSize} ${style.fontFamily}`;
      const maxInstanceWidth = this._terminalGroupService.instances.reduce((p, c) => {
        return Math.max(p, ctx.measureText(c.title + (c.description || "")).width + this._getAdditionalWidth(c));
      }, 0);
      idealWidth = Math.ceil(Math.max(maxInstanceWidth, TerminalTabsListSizes.WideViewMinimumWidth));
    }
    const currentWidth = Math.ceil(this._splitView.getViewSize(this._tabTreeIndex));
    if (currentWidth === idealWidth) {
      idealWidth = TerminalTabsListSizes.NarrowViewWidth;
    }
    this._splitView.resizeView(this._tabTreeIndex, idealWidth);
    this._updateListWidth(idealWidth);
  }
  _getAdditionalWidth(instance) {
    const additionalWidth = 40;
    const statusIconWidth = instance.statusList.statuses.length > 0 ? 30 /* StatusIcon */ : 0;
    const splitAnnotationWidth = (this._terminalGroupService.getGroupForInstance(instance)?.terminalInstances.length || 0) > 1 ? 30 /* SplitAnnotation */ : 0;
    return additionalWidth + splitAnnotationWidth + statusIconWidth;
  }
  _handleOnDidSashChange() {
    const listWidth = this._splitView.getViewSize(this._tabTreeIndex);
    if (!this._width || listWidth <= 0) {
      return;
    }
    this._updateListWidth(listWidth);
  }
  _updateListWidth(width) {
    if (width < TerminalTabsListSizes.MidpointViewWidth && width >= TerminalTabsListSizes.NarrowViewWidth) {
      width = TerminalTabsListSizes.NarrowViewWidth;
      this._splitView.resizeView(this._tabTreeIndex, width);
    } else if (width >= TerminalTabsListSizes.MidpointViewWidth && width < TerminalTabsListSizes.WideViewMinimumWidth) {
      width = TerminalTabsListSizes.WideViewMinimumWidth;
      this._splitView.resizeView(this._tabTreeIndex, width);
    }
    this.rerenderTabs();
    const widthKey = this._panelOrientation === Orientation.VERTICAL ? TerminalStorageKeys.TabsListWidthVertical : TerminalStorageKeys.TabsListWidthHorizontal;
    this._storageService.store(widthKey, width, StorageScope.PROFILE, StorageTarget.USER);
  }
  _setupSplitView(terminalOuterContainer) {
    this._register(this._splitView.onDidSashReset(() => this._handleOnDidSashReset()));
    this._register(this._splitView.onDidSashChange(() => this._handleOnDidSashChange()));
    if (this._shouldShowTabs()) {
      this._addTabTree();
    }
    this._splitView.addView({
      element: terminalOuterContainer,
      layout: (width) => this._terminalGroupService.groups.forEach((tab) => tab.layout(width, this._height || 0)),
      minimumSize: 120,
      maximumSize: Number.POSITIVE_INFINITY,
      onDidChange: () => Disposable.None,
      priority: LayoutPriority.High
    }, Sizing.Distribute, this._terminalContainerIndex);
    if (this._shouldShowTabs()) {
      this._addSashListener();
    }
  }
  _addTabTree() {
    this._splitView.addView({
      element: this._tabContainer,
      layout: (width) => this._tabList.layout(this._height || 0, width),
      minimumSize: TerminalTabsListSizes.NarrowViewWidth,
      maximumSize: TerminalTabsListSizes.MaximumWidth,
      onDidChange: () => Disposable.None,
      priority: LayoutPriority.Low
    }, Sizing.Distribute, this._tabTreeIndex);
    this.rerenderTabs();
  }
  rerenderTabs() {
    this._updateHasText();
    this._tabList.refresh();
  }
  _addSashListener() {
    let interval;
    this._sashDisposables = [
      this._splitView.sashes[0].onDidStart((e) => {
        interval = dom.disposableWindowInterval(dom.getWindow(this._splitView.el), () => {
          this.rerenderTabs();
        }, 100);
      }),
      this._splitView.sashes[0].onDidEnd((e) => {
        interval.dispose();
      })
    ];
  }
  _removeSashListener() {
    if (this._sashDisposables) {
      dispose(this._sashDisposables);
      this._sashDisposables = void 0;
    }
  }
  _updateHasText() {
    const hasText = this._tabListElement.clientWidth > TerminalTabsListSizes.MidpointViewWidth;
    this._tabContainer.classList.toggle("has-text", hasText);
    this._terminalIsTabsNarrowContextKey.set(!hasText);
    this._updateChatTerminalsEntry();
  }
  layout(width, height) {
    const chatItemHeight = this._chatEntry?.element.style.display === "none" ? 0 : this._chatEntry?.element.clientHeight;
    this._height = height - (chatItemHeight ?? 0);
    this._width = width;
    this._splitView.layout(width);
    if (this._shouldShowTabs()) {
      this._splitView.resizeView(this._tabTreeIndex, this._getLastListWidth());
    }
    this._updateHasText();
  }
  _attachEventListeners(parentDomElement, terminalContainer) {
    this._register(dom.addDisposableListener(this._tabContainer, "mouseleave", async (event) => {
      this._terminalTabsMouseContextKey.set(false);
      this._refreshShowTabs();
      event.stopPropagation();
    }));
    this._register(dom.addDisposableListener(this._tabContainer, "mouseenter", async (event) => {
      this._terminalTabsMouseContextKey.set(true);
      event.stopPropagation();
    }));
    this._register(dom.addDisposableListener(this._tabContainer, "dragenter", (event) => {
      if (!this._shouldHandleEmptyAreaDrop(event)) {
        this._resetEmptyAreaDropState();
        return;
      }
      this._emptyAreaDropTargetCount++;
      this._setEmptyAreaDropState(true);
    }));
    this._register(dom.addDisposableListener(this._tabContainer, "dragover", (event) => {
      if (!this._shouldHandleEmptyAreaDrop(event)) {
        this._resetEmptyAreaDropState();
        return;
      }
      event.preventDefault();
      this._setEmptyAreaDropState(true);
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    }));
    this._register(dom.addDisposableListener(this._tabContainer, "dragleave", (event) => {
      if (!this._shouldHandleEmptyAreaDrop(event)) {
        if (!this._tabContainer.contains(event.relatedTarget)) {
          this._resetEmptyAreaDropState();
        }
        return;
      }
      if (this._tabContainer.contains(event.relatedTarget)) {
        return;
      }
      this._emptyAreaDropTargetCount = Math.max(0, this._emptyAreaDropTargetCount - 1);
      if (this._emptyAreaDropTargetCount === 0) {
        this._resetEmptyAreaDropState();
      }
    }));
    this._register(dom.addDisposableListener(this._tabContainer, "drop", (event) => {
      if (!this._shouldHandleEmptyAreaDrop(event)) {
        return;
      }
      void this._handleContainerDrop(event);
    }));
    this._register(dom.addDisposableListener(terminalContainer, "mousedown", async (event) => {
      const terminal = this._terminalGroupService.activeInstance;
      if (this._terminalGroupService.instances.length > 0 && terminal) {
        const result = await terminal.handleMouseEvent(event, this._instanceMenu);
        if (typeof result === "object" && result.cancelContextMenu) {
          this._cancelContextMenu = true;
        }
      }
    }));
    this._register(dom.addDisposableListener(terminalContainer, "contextmenu", (event) => {
      const rightClickBehavior = this._terminalConfigurationService.config.rightClickBehavior;
      if (rightClickBehavior === "nothing" && !event.shiftKey) {
        this._cancelContextMenu = true;
      }
      terminalContainer.focus();
      if (!this._cancelContextMenu) {
        openContextMenu(dom.getWindow(terminalContainer), event, this._terminalGroupService.activeInstance, this._instanceMenu, this._contextMenuService);
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      this._cancelContextMenu = false;
    }));
    this._register(dom.addDisposableListener(this._tabContainer, "contextmenu", (event) => {
      const rightClickBehavior = this._terminalConfigurationService.config.rightClickBehavior;
      if (rightClickBehavior === "nothing" && !event.shiftKey) {
        this._cancelContextMenu = true;
      }
      if (!this._cancelContextMenu) {
        const emptyList = this._tabList.getFocus().length === 0;
        if (!emptyList) {
          this._terminalGroupService.lastAccessedMenu = "tab-list";
        }
        const selectedInstances = this._tabList.getSelectedElements();
        const focusedInstance = this._tabList.getFocusedElements()?.[0];
        if (focusedInstance) {
          selectedInstances.splice(selectedInstances.findIndex((e) => e.instanceId === focusedInstance.instanceId), 1);
          selectedInstances.unshift(focusedInstance);
        }
        openContextMenu(dom.getWindow(this._tabContainer), event, selectedInstances, emptyList ? this._tabsListEmptyMenu : this._tabsListMenu, this._contextMenuService, emptyList ? this._getTabActions() : void 0);
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      this._cancelContextMenu = false;
    }));
    this._register(dom.addDisposableListener(terminalContainer.ownerDocument, "keydown", (event) => {
      terminalContainer.classList.toggle("alt-active", !!event.altKey);
    }));
    this._register(dom.addDisposableListener(terminalContainer.ownerDocument, "keyup", (event) => {
      terminalContainer.classList.toggle("alt-active", !!event.altKey);
    }));
    this._register(dom.addDisposableListener(parentDomElement, "keyup", (event) => {
      if (event.keyCode === 27) {
        event.stopPropagation();
      }
    }));
    this._register(dom.addDisposableListener(this._tabContainer, dom.EventType.FOCUS_IN, () => {
      this._terminalTabsFocusContextKey.set(true);
    }));
    this._register(dom.addDisposableListener(this._tabContainer, dom.EventType.FOCUS_OUT, () => {
      this._terminalTabsFocusContextKey.set(false);
    }));
  }
  _shouldHandleEmptyAreaDrop(event) {
    const targetNode = event.target;
    if (targetNode && (this._tabListDomElement.contains(targetNode) || this._tabListElement.contains(targetNode))) {
      return false;
    }
    return !!event.dataTransfer && containsDragType(event, TerminalDataTransfers.Terminals);
  }
  _setEmptyAreaDropState(active) {
    this._tabListContainer.classList.toggle("drop-target", active);
    this._tabContainer.classList.toggle("drop-target", active);
    this._chatEntry?.element.classList.toggle("drop-target", active);
  }
  _resetEmptyAreaDropState() {
    this._emptyAreaDropTargetCount = 0;
    this._setEmptyAreaDropState(false);
  }
  async _handleContainerDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    this._resetEmptyAreaDropState();
    const primaryBackend = this._terminalService.getPrimaryBackend();
    const resources = getTerminalResourcesFromDragEvent(event);
    let sourceInstances;
    const promises = [];
    if (resources) {
      for (const uri of resources) {
        const instance = this._terminalService.getInstanceFromResource(uri);
        if (instance) {
          if (sourceInstances) {
            sourceInstances.push(instance);
          } else {
            sourceInstances = [instance];
          }
          this._terminalService.moveToTerminalView(instance);
        } else if (primaryBackend) {
          const terminalIdentifier = parseTerminalUri(uri);
          if (terminalIdentifier.instanceId) {
            promises.push(primaryBackend.requestDetachInstance(terminalIdentifier.workspaceId, terminalIdentifier.instanceId));
          }
        }
      }
    }
    if (promises.length) {
      const processes = (await Promise.all(promises)).filter((process) => !!process);
      let lastInstance;
      for (const attachPersistentProcess of processes) {
        lastInstance = await this._terminalService.createTerminal({ config: { attachPersistentProcess } });
      }
      if (lastInstance) {
        this._terminalService.setActiveInstance(lastInstance);
      }
      return;
    }
    if (!sourceInstances || !sourceInstances.length) {
      sourceInstances = this._tabList.getSelectedElements();
      if (!sourceInstances.length) {
        return;
      }
    }
    this._terminalGroupService.moveGroupToEnd(sourceInstances);
    this._terminalService.setActiveInstance(sourceInstances[0]);
    const indexes = sourceInstances.map((instance) => this._terminalGroupService.instances.indexOf(instance)).filter((index) => index >= 0);
    if (indexes.length) {
      this._tabList.setSelection(indexes);
      this._tabList.setFocus([indexes[0]]);
    }
  }
  _getTabActions() {
    return [
      new Separator(),
      this._configurationService.inspect(TerminalSettingId.TabsLocation).userValue === "left" ? new Action("moveRight", localize("moveTabsRight", "Move Tabs Right"), void 0, void 0, async () => {
        this._configurationService.updateValue(TerminalSettingId.TabsLocation, "right");
      }) : new Action("moveLeft", localize("moveTabsLeft", "Move Tabs Left"), void 0, void 0, async () => {
        this._configurationService.updateValue(TerminalSettingId.TabsLocation, "left");
      }),
      new Action("hideTabs", localize("hideTabs", "Hide Tabs"), void 0, void 0, async () => {
        this._configurationService.updateValue(TerminalSettingId.TabsEnabled, false);
      })
    ];
  }
  setEditable(isEditing) {
    if (!isEditing) {
      this._tabList.domFocus();
    }
    this._tabList.refresh(false);
  }
  focusTabs() {
    if (!this._shouldShowTabs()) {
      return;
    }
    this._terminalTabsFocusContextKey.set(true);
    const selected = this._tabList.getSelection();
    this._tabList.domFocus();
    if (selected) {
      this._tabList.setFocus(selected);
    }
  }
  focus() {
    if (this._terminalService.connectionState === TerminalConnectionState.Connected) {
      this._focus();
      return;
    }
    const previousActiveElement = this._tabListElement.ownerDocument.activeElement;
    if (previousActiveElement) {
      const listener = this._register(Event.once(this._terminalService.onDidChangeConnectionState)(() => {
        if (dom.isActiveElement(previousActiveElement)) {
          this._focus();
        }
        this._store.delete(listener);
      }));
    }
  }
  focusHover() {
    if (this._shouldShowTabs()) {
      this._tabList.focusHover();
      return;
    }
    const instance = this._terminalGroupService.activeInstance;
    if (!instance) {
      return;
    }
    this._hoverService.showInstantHover({
      ...getInstanceHoverInfo(instance, this._storageService),
      target: this._terminalContainer,
      trapFocus: true
    }, true);
  }
  _focus() {
    this._terminalGroupService.activeInstance?.focusWhenReady();
  }
};
TerminalTabbedView = __decorateClass([
  __decorateParam(1, ITerminalService),
  __decorateParam(2, ITerminalChatService),
  __decorateParam(3, ITerminalConfigurationService),
  __decorateParam(4, ITerminalGroupService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IHoverService)
], TerminalTabbedView);
export {
  TerminalTabbedView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFx0ZXJtaW5hbFRhYmJlZFZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBMYXlvdXRQcmlvcml0eSwgT3JpZW50YXRpb24sIFNpemluZywgU3BsaXRWaWV3IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NwbGl0dmlldy9zcGxpdHZpZXcuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ2hhdFNlcnZpY2UsIElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJVGVybWluYWxHcm91cFNlcnZpY2UsIElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxTZXJ2aWNlLCBUZXJtaW5hbENvbm5lY3Rpb25TdGF0ZSwgVGVybWluYWxEYXRhVHJhbnNmZXJzIH0gZnJvbSAnLi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMsIFRlcm1pbmFsVGFiTGlzdCB9IGZyb20gJy4vdGVybWluYWxUYWJzTGlzdC5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24sIFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSU1lbnUsIElNZW51U2VydmljZSwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgb3BlbkNvbnRleHRNZW51IH0gZnJvbSAnLi90ZXJtaW5hbENvbnRleHRNZW51LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsU3RvcmFnZUtleXMgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxTdG9yYWdlS2V5cy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsQ29udGV4dEtleS5qcyc7XG5pbXBvcnQgeyBnZXRJbnN0YW5jZUhvdmVySW5mbyB9IGZyb20gJy4vdGVybWluYWxUb29sdGlwLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsVGFic0NoYXRFbnRyeSB9IGZyb20gJy4vdGVybWluYWxUYWJzQ2hhdEVudHJ5LmpzJztcbmltcG9ydCB7IGNvbnRhaW5zRHJhZ1R5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kbmQvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgZ2V0VGVybWluYWxSZXNvdXJjZXNGcm9tRHJhZ0V2ZW50LCBwYXJzZVRlcm1pbmFsVXJpIH0gZnJvbSAnLi90ZXJtaW5hbFVyaS5qcyc7XG5pbXBvcnQgdHlwZSB7IElQcm9jZXNzRGV0YWlscyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbFByb2Nlc3MuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDb250cmliQ29udGV4dEtleVN0cmluZ3MgfSBmcm9tICcuLi90ZXJtaW5hbENvbnRyaWJFeHBvcnRzLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG5jb25zdCBlbnVtIENzc0NsYXNzIHtcblx0Vmlld0lzVmVydGljYWwgPSAndGVybWluYWwtc2lkZS12aWV3Jyxcbn1cblxuY29uc3QgZW51bSBXaWR0aENvbnN0YW50cyB7XG5cdFN0YXR1c0ljb24gPSAzMCxcblx0U3BsaXRBbm5vdGF0aW9uID0gMzBcbn1cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsVGFiYmVkVmlldyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgX3NwbGl0VmlldzogU3BsaXRWaWV3O1xuXG5cdHByaXZhdGUgX3Rlcm1pbmFsQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfdGFiTGlzdEVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF90YWJDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgX3RhYkxpc3Q6IFRlcm1pbmFsVGFiTGlzdDtcblx0cHJpdmF0ZSBfdGFiTGlzdENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3RhYkxpc3REb21FbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfc2FzaERpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3BsdXNCdXR0b246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jaGF0RW50cnk6IFRlcm1pbmFsVGFic0NoYXRFbnRyeSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF90YWJUcmVlSW5kZXg6IG51bWJlcjtcblx0cHJpdmF0ZSBfdGVybWluYWxDb250YWluZXJJbmRleDogbnVtYmVyO1xuXG5cdHByaXZhdGUgX2hlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF93aWR0aDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2NhbmNlbENvbnRleHRNZW51OiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2luc3RhbmNlTWVudTogSU1lbnU7XG5cdHByaXZhdGUgX3RhYnNMaXN0TWVudTogSU1lbnU7XG5cdHByaXZhdGUgX3RhYnNMaXN0RW1wdHlNZW51OiBJTWVudTtcblxuXHRwcml2YXRlIF90ZXJtaW5hbElzVGFic05hcnJvd0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF90ZXJtaW5hbFRhYnNGb2N1c0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF90ZXJtaW5hbFRhYnNNb3VzZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgX3BhbmVsT3JpZW50YXRpb246IE9yaWVudGF0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9lbXB0eUFyZWFEcm9wVGFyZ2V0Q291bnQgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHBhcmVudEVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0XHRASVRlcm1pbmFsQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxDaGF0U2VydmljZTogSVRlcm1pbmFsQ2hhdFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxHcm91cFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxHcm91cFNlcnZpY2U6IElUZXJtaW5hbEdyb3VwU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl90YWJDb250YWluZXIgPSAkKCcudGFicy1jb250YWluZXInKTtcblx0XHRjb25zdCB0YWJMaXN0Q29udGFpbmVyID0gJCgnLnRhYnMtbGlzdC1jb250YWluZXInKTtcblx0XHR0aGlzLl90YWJMaXN0Q29udGFpbmVyID0gdGFiTGlzdENvbnRhaW5lcjtcblx0XHR0aGlzLl90YWJMaXN0RWxlbWVudCA9ICQoJy50YWJzLWxpc3QnKTtcblx0XHR0YWJMaXN0Q29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3RhYkxpc3RFbGVtZW50KTtcblx0XHR0aGlzLl90YWJDb250YWluZXIuYXBwZW5kQ2hpbGQodGFiTGlzdENvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9pbnN0YW5jZU1lbnUgPSB0aGlzLl9yZWdpc3RlcihtZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5UZXJtaW5hbEluc3RhbmNlQ29udGV4dCwgY29udGV4dEtleVNlcnZpY2UpKTtcblx0XHR0aGlzLl90YWJzTGlzdE1lbnUgPSB0aGlzLl9yZWdpc3RlcihtZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5UZXJtaW5hbFRhYkNvbnRleHQsIGNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fdGFic0xpc3RFbXB0eU1lbnUgPSB0aGlzLl9yZWdpc3RlcihtZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5UZXJtaW5hbFRhYkVtcHR5QXJlYUNvbnRleHQsIGNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cblx0XHR0aGlzLl90YWJMaXN0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxUYWJMaXN0LCB0aGlzLl90YWJMaXN0RWxlbWVudCkpO1xuXHRcdHRoaXMuX3RhYkxpc3REb21FbGVtZW50ID0gdGhpcy5fdGFiTGlzdC5nZXRIVE1MRWxlbWVudCgpO1xuXHRcdHRoaXMuX2NoYXRFbnRyeSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsVGFic0NoYXRFbnRyeSwgdGFiTGlzdENvbnRhaW5lciwgdGhpcy5fdGFiQ29udGFpbmVyKSk7XG5cblx0XHRjb25zdCB0ZXJtaW5hbE91dGVyQ29udGFpbmVyID0gJCgnLnRlcm1pbmFsLW91dGVyLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsQ29udGFpbmVyID0gJCgnLnRlcm1pbmFsLWdyb3Vwcy1jb250YWluZXInKTtcblx0XHR0ZXJtaW5hbE91dGVyQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3Rlcm1pbmFsQ29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRDb250YWluZXJzKHBhcmVudEVsZW1lbnQsIHRoaXMuX3Rlcm1pbmFsQ29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3Rlcm1pbmFsSXNUYWJzTmFycm93Q29udGV4dEtleSA9IFRlcm1pbmFsQ29udGV4dEtleXMudGFic05hcnJvdy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsVGFic0ZvY3VzQ29udGV4dEtleSA9IFRlcm1pbmFsQ29udGV4dEtleXMudGFic0ZvY3VzLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fdGVybWluYWxUYWJzTW91c2VDb250ZXh0S2V5ID0gVGVybWluYWxDb250ZXh0S2V5cy50YWJzTW91c2UuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3RhYlRyZWVJbmRleCA9IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnRhYnMubG9jYXRpb24gPT09ICdsZWZ0JyA/IDAgOiAxO1xuXHRcdHRoaXMuX3Rlcm1pbmFsQ29udGFpbmVySW5kZXggPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy50YWJzLmxvY2F0aW9uID09PSAnbGVmdCcgPyAxIDogMDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKF9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXJtaW5hbFNldHRpbmdJZC5UYWJzRW5hYmxlZCkgfHxcblx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXJtaW5hbFNldHRpbmdJZC5UYWJzSGlkZUNvbmRpdGlvbikpIHtcblx0XHRcdFx0dGhpcy5fcmVmcmVzaFNob3dUYWJzKCk7XG5cdFx0XHR9IGVsc2UgaWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuVGFic0xvY2F0aW9uKSkge1xuXHRcdFx0XHR0aGlzLl90YWJUcmVlSW5kZXggPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy50YWJzLmxvY2F0aW9uID09PSAnbGVmdCcgPyAwIDogMTtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxDb250YWluZXJJbmRleCA9IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnRhYnMubG9jYXRpb24gPT09ICdsZWZ0JyA/IDEgOiAwO1xuXHRcdFx0XHRpZiAodGhpcy5fc2hvdWxkU2hvd1RhYnMoKSkge1xuXHRcdFx0XHRcdHRoaXMuX3NwbGl0Vmlldy5zd2FwVmlld3MoMCwgMSk7XG5cdFx0XHRcdFx0dGhpcy5fcmVtb3ZlU2FzaExpc3RlbmVyKCk7XG5cdFx0XHRcdFx0dGhpcy5fYWRkU2FzaExpc3RlbmVyKCk7XG5cdFx0XHRcdFx0dGhpcy5fc3BsaXRWaWV3LnJlc2l6ZVZpZXcodGhpcy5fdGFiVHJlZUluZGV4LCB0aGlzLl9nZXRMYXN0TGlzdFdpZHRoKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueSh0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5vbkRpZENoYW5nZUluc3RhbmNlcywgdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uub25EaWRDaGFuZ2VHcm91cHMpKCgpID0+IHtcblx0XHRcdHRoaXMuX3JlZnJlc2hTaG93VGFicygpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQ2hhdFRlcm1pbmFsc0VudHJ5KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2Uub25EaWRSZWdpc3RlclRlcm1pbmFsSW5zdGFuY2VXaXRoVG9vbFNlc3Npb24sIHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkRpZENoYW5nZUluc3RhbmNlcywgdGhpcy5fdGVybWluYWxTZXJ2aWNlLm9uRGlkRGlzcG9zZUluc3RhbmNlKSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZWZyZXNoU2hvd1RhYnMoKTtcblx0XHRcdHRoaXMuX3VwZGF0ZUNoYXRUZXJtaW5hbHNFbnRyeSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKG5ldyBTZXQoW1Rlcm1pbmFsQ29udHJpYkNvbnRleHRLZXlTdHJpbmdzLkNoYXRIYXNIaWRkZW5UZXJtaW5hbHNdKSkpIHtcblx0XHRcdFx0dGhpcy5fcmVmcmVzaFNob3dUYWJzKCk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUNoYXRUZXJtaW5hbHNFbnRyeSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9hdHRhY2hFdmVudExpc3RlbmVycyhwYXJlbnRFbGVtZW50LCB0aGlzLl90ZXJtaW5hbENvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5vbkRpZENoYW5nZVBhbmVsT3JpZW50YXRpb24oKG9yaWVudGF0aW9uKSA9PiB7XG5cdFx0XHR0aGlzLl9wYW5lbE9yaWVudGF0aW9uID0gb3JpZW50YXRpb247XG5cdFx0XHRpZiAodGhpcy5fcGFuZWxPcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwpIHtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxDb250YWluZXIuY2xhc3NMaXN0LmFkZChDc3NDbGFzcy5WaWV3SXNWZXJ0aWNhbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbENvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKENzc0NsYXNzLlZpZXdJc1ZlcnRpY2FsKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9zcGxpdFZpZXcgPSBuZXcgU3BsaXRWaWV3KHBhcmVudEVsZW1lbnQsIHsgb3JpZW50YXRpb246IE9yaWVudGF0aW9uLkhPUklaT05UQUwsIHByb3BvcnRpb25hbExheW91dDogZmFsc2UgfSk7XG5cdFx0dGhpcy5fc2V0dXBTcGxpdFZpZXcodGVybWluYWxPdXRlckNvbnRhaW5lcik7XG5cdFx0dGhpcy5fdXBkYXRlQ2hhdFRlcm1pbmFsc0VudHJ5KCk7XG5cdH1cblxuXHRwcml2YXRlIF9zaG91bGRTaG93VGFicygpOiBib29sZWFuIHtcblx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcudGFicy5lbmFibGVkO1xuXHRcdGNvbnN0IGhpZGUgPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy50YWJzLmhpZGVDb25kaXRpb247XG5cdFx0Y29uc3QgaGlkZGVuQ2hhdFRlcm1pbmFscyA9IHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UuZ2V0VG9vbFNlc3Npb25UZXJtaW5hbEluc3RhbmNlcyh0cnVlKTtcblx0XHRpZiAoIWVuYWJsZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGhpZGRlbkNoYXRUZXJtaW5hbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChoaWRlKSB7XG5cdFx0XHRjYXNlICduZXZlcic6XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSAnc2luZ2xlVGVybWluYWwnOlxuXHRcdFx0XHRpZiAodGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuaW5zdGFuY2VzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3NpbmdsZUdyb3VwJzpcblx0XHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmdyb3Vwcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hTaG93VGFicygpIHtcblx0XHRpZiAodGhpcy5fc2hvdWxkU2hvd1RhYnMoKSkge1xuXHRcdFx0aWYgKHRoaXMuX3NwbGl0Vmlldy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0dGhpcy5fYWRkVGFiVHJlZSgpO1xuXHRcdFx0XHR0aGlzLl9hZGRTYXNoTGlzdGVuZXIoKTtcblx0XHRcdFx0dGhpcy5fc3BsaXRWaWV3LnJlc2l6ZVZpZXcodGhpcy5fdGFiVHJlZUluZGV4LCB0aGlzLl9nZXRMYXN0TGlzdFdpZHRoKCkpO1xuXHRcdFx0XHR0aGlzLnJlcmVuZGVyVGFicygpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5fc3BsaXRWaWV3Lmxlbmd0aCA9PT0gMiAmJiAhdGhpcy5fdGVybWluYWxUYWJzTW91c2VDb250ZXh0S2V5LmdldCgpKSB7XG5cdFx0XHRcdHRoaXMuX3NwbGl0Vmlldy5yZW1vdmVWaWV3KHRoaXMuX3RhYlRyZWVJbmRleCk7XG5cdFx0XHRcdHRoaXMuX3BsdXNCdXR0b24/LnJlbW92ZSgpO1xuXHRcdFx0XHR0aGlzLl9yZW1vdmVTYXNoTGlzdGVuZXIoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDaGF0VGVybWluYWxzRW50cnkoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hhdEVudHJ5Py51cGRhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldExhc3RMaXN0V2lkdGgoKTogbnVtYmVyIHtcblx0XHRjb25zdCB3aWR0aEtleSA9IHRoaXMuX3BhbmVsT3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMID8gVGVybWluYWxTdG9yYWdlS2V5cy5UYWJzTGlzdFdpZHRoVmVydGljYWwgOiBUZXJtaW5hbFN0b3JhZ2VLZXlzLlRhYnNMaXN0V2lkdGhIb3Jpem9udGFsO1xuXHRcdGNvbnN0IHN0b3JlZFZhbHVlID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KHdpZHRoS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cblx0XHRpZiAoIXN0b3JlZFZhbHVlIHx8ICFwYXJzZUludChzdG9yZWRWYWx1ZSkpIHtcblx0XHRcdC8vIHdlIHdhbnQgdG8gdXNlIHRoZSBtaW4gd2lkdGggYnkgZGVmYXVsdCBmb3IgdGhlIHZlcnRpY2FsIG9yaWVudGF0aW9uIGJjXG5cdFx0XHQvLyB0aGVyZSBpcyBzdWNoIGEgbGltaXRlZCB3aWR0aCBmb3IgdGhlIHRlcm1pbmFsIHBhbmVsIHRvIGJlZ2luIHcgdGhlcmUuXG5cdFx0XHRyZXR1cm4gdGhpcy5fcGFuZWxPcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwgPyBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMuTmFycm93Vmlld1dpZHRoIDogVGVybWluYWxUYWJzTGlzdFNpemVzLkRlZmF1bHRXaWR0aDtcblx0XHR9XG5cdFx0cmV0dXJuIHBhcnNlSW50KHN0b3JlZFZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZU9uRGlkU2FzaFJlc2V0KCk6IHZvaWQge1xuXHRcdC8vIENhbGN1bGF0ZSBpZGVhbCBzaXplIG9mIGxpc3QgdG8gZGlzcGxheSBhbGwgdGV4dCBiYXNlZCBvbiBpdHMgY29udGVudHNcblx0XHRsZXQgaWRlYWxXaWR0aCA9IFRlcm1pbmFsVGFic0xpc3RTaXplcy5XaWRlVmlld01pbmltdW1XaWR0aDtcblx0XHRjb25zdCBvZmZzY3JlZW5DYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcblx0XHRvZmZzY3JlZW5DYW52YXMud2lkdGggPSAxO1xuXHRcdG9mZnNjcmVlbkNhbnZhcy5oZWlnaHQgPSAxO1xuXHRcdGNvbnN0IGN0eCA9IG9mZnNjcmVlbkNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuXHRcdGlmIChjdHgpIHtcblx0XHRcdGNvbnN0IHN0eWxlID0gZG9tLmdldFdpbmRvdyh0aGlzLl90YWJMaXN0RWxlbWVudCkuZ2V0Q29tcHV0ZWRTdHlsZSh0aGlzLl90YWJMaXN0RWxlbWVudCk7XG5cdFx0XHRjdHguZm9udCA9IGAke3N0eWxlLmZvbnRTdHlsZX0gJHtzdHlsZS5mb250U2l6ZX0gJHtzdHlsZS5mb250RmFtaWx5fWA7XG5cdFx0XHRjb25zdCBtYXhJbnN0YW5jZVdpZHRoID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuaW5zdGFuY2VzLnJlZHVjZSgocCwgYykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gTWF0aC5tYXgocCwgY3R4Lm1lYXN1cmVUZXh0KGMudGl0bGUgKyAoYy5kZXNjcmlwdGlvbiB8fCAnJykpLndpZHRoICsgdGhpcy5fZ2V0QWRkaXRpb25hbFdpZHRoKGMpKTtcblx0XHRcdH0sIDApO1xuXHRcdFx0aWRlYWxXaWR0aCA9IE1hdGguY2VpbChNYXRoLm1heChtYXhJbnN0YW5jZVdpZHRoLCBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMuV2lkZVZpZXdNaW5pbXVtV2lkdGgpKTtcblx0XHR9XG5cdFx0Ly8gSWYgdGhlIHNpemUgaXMgYWxyZWFkeSBpZGVhbCwgdG9nZ2xlIHRvIGNvbGxhcHNlZFxuXHRcdGNvbnN0IGN1cnJlbnRXaWR0aCA9IE1hdGguY2VpbCh0aGlzLl9zcGxpdFZpZXcuZ2V0Vmlld1NpemUodGhpcy5fdGFiVHJlZUluZGV4KSk7XG5cdFx0aWYgKGN1cnJlbnRXaWR0aCA9PT0gaWRlYWxXaWR0aCkge1xuXHRcdFx0aWRlYWxXaWR0aCA9IFRlcm1pbmFsVGFic0xpc3RTaXplcy5OYXJyb3dWaWV3V2lkdGg7XG5cdFx0fVxuXHRcdHRoaXMuX3NwbGl0Vmlldy5yZXNpemVWaWV3KHRoaXMuX3RhYlRyZWVJbmRleCwgaWRlYWxXaWR0aCk7XG5cdFx0dGhpcy5fdXBkYXRlTGlzdFdpZHRoKGlkZWFsV2lkdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QWRkaXRpb25hbFdpZHRoKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IG51bWJlciB7XG5cdFx0Ly8gU2l6ZSB0byBpbmNsdWRlIHBhZGRpbmcsIGljb24sIHN0YXR1cyBpY29uIChpZiBhbnkpLCBzcGxpdCBhbm5vdGF0aW9uIChpZiBhbnkpLCArIGEgbGl0dGxlIG1vcmVcblx0XHRjb25zdCBhZGRpdGlvbmFsV2lkdGggPSA0MDtcblx0XHRjb25zdCBzdGF0dXNJY29uV2lkdGggPSBpbnN0YW5jZS5zdGF0dXNMaXN0LnN0YXR1c2VzLmxlbmd0aCA+IDAgPyBXaWR0aENvbnN0YW50cy5TdGF0dXNJY29uIDogMDtcblx0XHRjb25zdCBzcGxpdEFubm90YXRpb25XaWR0aCA9ICh0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5nZXRHcm91cEZvckluc3RhbmNlKGluc3RhbmNlKT8udGVybWluYWxJbnN0YW5jZXMubGVuZ3RoIHx8IDApID4gMSA/IFdpZHRoQ29uc3RhbnRzLlNwbGl0QW5ub3RhdGlvbiA6IDA7XG5cdFx0cmV0dXJuIGFkZGl0aW9uYWxXaWR0aCArIHNwbGl0QW5ub3RhdGlvbldpZHRoICsgc3RhdHVzSWNvbldpZHRoO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlT25EaWRTYXNoQ2hhbmdlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGxpc3RXaWR0aCA9IHRoaXMuX3NwbGl0Vmlldy5nZXRWaWV3U2l6ZSh0aGlzLl90YWJUcmVlSW5kZXgpO1xuXHRcdGlmICghdGhpcy5fd2lkdGggfHwgbGlzdFdpZHRoIDw9IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlTGlzdFdpZHRoKGxpc3RXaWR0aCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVMaXN0V2lkdGgod2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh3aWR0aCA8IFRlcm1pbmFsVGFic0xpc3RTaXplcy5NaWRwb2ludFZpZXdXaWR0aCAmJiB3aWR0aCA+PSBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMuTmFycm93Vmlld1dpZHRoKSB7XG5cdFx0XHR3aWR0aCA9IFRlcm1pbmFsVGFic0xpc3RTaXplcy5OYXJyb3dWaWV3V2lkdGg7XG5cdFx0XHR0aGlzLl9zcGxpdFZpZXcucmVzaXplVmlldyh0aGlzLl90YWJUcmVlSW5kZXgsIHdpZHRoKTtcblx0XHR9IGVsc2UgaWYgKHdpZHRoID49IFRlcm1pbmFsVGFic0xpc3RTaXplcy5NaWRwb2ludFZpZXdXaWR0aCAmJiB3aWR0aCA8IFRlcm1pbmFsVGFic0xpc3RTaXplcy5XaWRlVmlld01pbmltdW1XaWR0aCkge1xuXHRcdFx0d2lkdGggPSBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMuV2lkZVZpZXdNaW5pbXVtV2lkdGg7XG5cdFx0XHR0aGlzLl9zcGxpdFZpZXcucmVzaXplVmlldyh0aGlzLl90YWJUcmVlSW5kZXgsIHdpZHRoKTtcblx0XHR9XG5cdFx0dGhpcy5yZXJlbmRlclRhYnMoKTtcblx0XHRjb25zdCB3aWR0aEtleSA9IHRoaXMuX3BhbmVsT3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMID8gVGVybWluYWxTdG9yYWdlS2V5cy5UYWJzTGlzdFdpZHRoVmVydGljYWwgOiBUZXJtaW5hbFN0b3JhZ2VLZXlzLlRhYnNMaXN0V2lkdGhIb3Jpem9udGFsO1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKHdpZHRoS2V5LCB3aWR0aCwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHRwcml2YXRlIF9zZXR1cFNwbGl0Vmlldyh0ZXJtaW5hbE91dGVyQ29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3NwbGl0Vmlldy5vbkRpZFNhc2hSZXNldCgoKSA9PiB0aGlzLl9oYW5kbGVPbkRpZFNhc2hSZXNldCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3BsaXRWaWV3Lm9uRGlkU2FzaENoYW5nZSgoKSA9PiB0aGlzLl9oYW5kbGVPbkRpZFNhc2hDaGFuZ2UoKSkpO1xuXG5cdFx0aWYgKHRoaXMuX3Nob3VsZFNob3dUYWJzKCkpIHtcblx0XHRcdHRoaXMuX2FkZFRhYlRyZWUoKTtcblx0XHR9XG5cdFx0dGhpcy5fc3BsaXRWaWV3LmFkZFZpZXcoe1xuXHRcdFx0ZWxlbWVudDogdGVybWluYWxPdXRlckNvbnRhaW5lcixcblx0XHRcdGxheW91dDogd2lkdGggPT4gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuZ3JvdXBzLmZvckVhY2godGFiID0+IHRhYi5sYXlvdXQod2lkdGgsIHRoaXMuX2hlaWdodCB8fCAwKSksXG5cdFx0XHRtaW5pbXVtU2l6ZTogMTIwLFxuXHRcdFx0bWF4aW11bVNpemU6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSxcblx0XHRcdG9uRGlkQ2hhbmdlOiAoKSA9PiBEaXNwb3NhYmxlLk5vbmUsXG5cdFx0XHRwcmlvcml0eTogTGF5b3V0UHJpb3JpdHkuSGlnaFxuXHRcdH0sIFNpemluZy5EaXN0cmlidXRlLCB0aGlzLl90ZXJtaW5hbENvbnRhaW5lckluZGV4KTtcblxuXHRcdGlmICh0aGlzLl9zaG91bGRTaG93VGFicygpKSB7XG5cdFx0XHR0aGlzLl9hZGRTYXNoTGlzdGVuZXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hZGRUYWJUcmVlKCkge1xuXHRcdHRoaXMuX3NwbGl0Vmlldy5hZGRWaWV3KHtcblx0XHRcdGVsZW1lbnQ6IHRoaXMuX3RhYkNvbnRhaW5lcixcblx0XHRcdGxheW91dDogd2lkdGggPT4gdGhpcy5fdGFiTGlzdC5sYXlvdXQodGhpcy5faGVpZ2h0IHx8IDAsIHdpZHRoKSxcblx0XHRcdG1pbmltdW1TaXplOiBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMuTmFycm93Vmlld1dpZHRoLFxuXHRcdFx0bWF4aW11bVNpemU6IFRlcm1pbmFsVGFic0xpc3RTaXplcy5NYXhpbXVtV2lkdGgsXG5cdFx0XHRvbkRpZENoYW5nZTogKCkgPT4gRGlzcG9zYWJsZS5Ob25lLFxuXHRcdFx0cHJpb3JpdHk6IExheW91dFByaW9yaXR5Lkxvd1xuXHRcdH0sIFNpemluZy5EaXN0cmlidXRlLCB0aGlzLl90YWJUcmVlSW5kZXgpO1xuXHRcdHRoaXMucmVyZW5kZXJUYWJzKCk7XG5cdH1cblxuXHRyZXJlbmRlclRhYnMoKSB7XG5cdFx0dGhpcy5fdXBkYXRlSGFzVGV4dCgpO1xuXHRcdHRoaXMuX3RhYkxpc3QucmVmcmVzaCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkU2FzaExpc3RlbmVyKCkge1xuXHRcdGxldCBpbnRlcnZhbDogSURpc3Bvc2FibGU7XG5cdFx0dGhpcy5fc2FzaERpc3Bvc2FibGVzID0gW1xuXHRcdFx0dGhpcy5fc3BsaXRWaWV3LnNhc2hlc1swXS5vbkRpZFN0YXJ0KGUgPT4ge1xuXHRcdFx0XHRpbnRlcnZhbCA9IGRvbS5kaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwoZG9tLmdldFdpbmRvdyh0aGlzLl9zcGxpdFZpZXcuZWwpLCAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5yZXJlbmRlclRhYnMoKTtcblx0XHRcdFx0fSwgMTAwKTtcblx0XHRcdH0pLFxuXHRcdFx0dGhpcy5fc3BsaXRWaWV3LnNhc2hlc1swXS5vbkRpZEVuZChlID0+IHtcblx0XHRcdFx0aW50ZXJ2YWwuZGlzcG9zZSgpO1xuXHRcdFx0fSlcblx0XHRdO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlU2FzaExpc3RlbmVyKCkge1xuXHRcdGlmICh0aGlzLl9zYXNoRGlzcG9zYWJsZXMpIHtcblx0XHRcdGRpc3Bvc2UodGhpcy5fc2FzaERpc3Bvc2FibGVzKTtcblx0XHRcdHRoaXMuX3Nhc2hEaXNwb3NhYmxlcyA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVIYXNUZXh0KCkge1xuXHRcdGNvbnN0IGhhc1RleHQgPSB0aGlzLl90YWJMaXN0RWxlbWVudC5jbGllbnRXaWR0aCA+IFRlcm1pbmFsVGFic0xpc3RTaXplcy5NaWRwb2ludFZpZXdXaWR0aDtcblx0XHR0aGlzLl90YWJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLXRleHQnLCBoYXNUZXh0KTtcblx0XHR0aGlzLl90ZXJtaW5hbElzVGFic05hcnJvd0NvbnRleHRLZXkuc2V0KCFoYXNUZXh0KTtcblx0XHR0aGlzLl91cGRhdGVDaGF0VGVybWluYWxzRW50cnkoKTtcblx0fVxuXG5cdGxheW91dCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGNoYXRJdGVtSGVpZ2h0ID0gdGhpcy5fY2hhdEVudHJ5Py5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPT09ICdub25lJyA/IDAgOiB0aGlzLl9jaGF0RW50cnk/LmVsZW1lbnQuY2xpZW50SGVpZ2h0O1xuXHRcdHRoaXMuX2hlaWdodCA9IGhlaWdodCAtIChjaGF0SXRlbUhlaWdodCA/PyAwKTtcblx0XHR0aGlzLl93aWR0aCA9IHdpZHRoO1xuXHRcdHRoaXMuX3NwbGl0Vmlldy5sYXlvdXQod2lkdGgpO1xuXHRcdGlmICh0aGlzLl9zaG91bGRTaG93VGFicygpKSB7XG5cdFx0XHR0aGlzLl9zcGxpdFZpZXcucmVzaXplVmlldyh0aGlzLl90YWJUcmVlSW5kZXgsIHRoaXMuX2dldExhc3RMaXN0V2lkdGgoKSk7XG5cdFx0fVxuXHRcdHRoaXMuX3VwZGF0ZUhhc1RleHQoKTtcblx0fVxuXG5cblx0cHJpdmF0ZSBfYXR0YWNoRXZlbnRMaXN0ZW5lcnMocGFyZW50RG9tRWxlbWVudDogSFRNTEVsZW1lbnQsIHRlcm1pbmFsQ29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdGFiQ29udGFpbmVyLCAnbW91c2VsZWF2ZScsIGFzeW5jIChldmVudDogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0dGhpcy5fdGVybWluYWxUYWJzTW91c2VDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0XHR0aGlzLl9yZWZyZXNoU2hvd1RhYnMoKTtcblx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3RhYkNvbnRhaW5lciwgJ21vdXNlZW50ZXInLCBhc3luYyAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsVGFic01vdXNlQ29udGV4dEtleS5zZXQodHJ1ZSk7XG5cdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl90YWJDb250YWluZXIsICdkcmFnZW50ZXInLCAoZXZlbnQ6IERyYWdFdmVudCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9zaG91bGRIYW5kbGVFbXB0eUFyZWFEcm9wKGV2ZW50KSkge1xuXHRcdFx0XHR0aGlzLl9yZXNldEVtcHR5QXJlYURyb3BTdGF0ZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9lbXB0eUFyZWFEcm9wVGFyZ2V0Q291bnQrKztcblx0XHRcdHRoaXMuX3NldEVtcHR5QXJlYURyb3BTdGF0ZSh0cnVlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl90YWJDb250YWluZXIsICdkcmFnb3ZlcicsIChldmVudDogRHJhZ0V2ZW50KSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX3Nob3VsZEhhbmRsZUVtcHR5QXJlYURyb3AoZXZlbnQpKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc2V0RW1wdHlBcmVhRHJvcFN0YXRlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR0aGlzLl9zZXRFbXB0eUFyZWFEcm9wU3RhdGUodHJ1ZSk7XG5cdFx0XHRpZiAoZXZlbnQuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRcdGV2ZW50LmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ21vdmUnO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3RhYkNvbnRhaW5lciwgJ2RyYWdsZWF2ZScsIChldmVudDogRHJhZ0V2ZW50KSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX3Nob3VsZEhhbmRsZUVtcHR5QXJlYURyb3AoZXZlbnQpKSB7XG5cdFx0XHRcdGlmICghdGhpcy5fdGFiQ29udGFpbmVyLmNvbnRhaW5zKGV2ZW50LnJlbGF0ZWRUYXJnZXQgYXMgTm9kZSB8IG51bGwpKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVzZXRFbXB0eUFyZWFEcm9wU3RhdGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fdGFiQ29udGFpbmVyLmNvbnRhaW5zKGV2ZW50LnJlbGF0ZWRUYXJnZXQgYXMgTm9kZSB8IG51bGwpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2VtcHR5QXJlYURyb3BUYXJnZXRDb3VudCA9IE1hdGgubWF4KDAsIHRoaXMuX2VtcHR5QXJlYURyb3BUYXJnZXRDb3VudCAtIDEpO1xuXHRcdFx0aWYgKHRoaXMuX2VtcHR5QXJlYURyb3BUYXJnZXRDb3VudCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9yZXNldEVtcHR5QXJlYURyb3BTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3RhYkNvbnRhaW5lciwgJ2Ryb3AnLCAoZXZlbnQ6IERyYWdFdmVudCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9zaG91bGRIYW5kbGVFbXB0eUFyZWFEcm9wKGV2ZW50KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR2b2lkIHRoaXMuX2hhbmRsZUNvbnRhaW5lckRyb3AoZXZlbnQpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRlcm1pbmFsQ29udGFpbmVyLCAnbW91c2Vkb3duJywgYXN5bmMgKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlO1xuXHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmluc3RhbmNlcy5sZW5ndGggPiAwICYmIHRlcm1pbmFsKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsLmhhbmRsZU1vdXNlRXZlbnQoZXZlbnQsIHRoaXMuX2luc3RhbmNlTWVudSk7XG5cdFx0XHRcdGlmICh0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyAmJiByZXN1bHQuY2FuY2VsQ29udGV4dE1lbnUpIHtcblx0XHRcdFx0XHR0aGlzLl9jYW5jZWxDb250ZXh0TWVudSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0ZXJtaW5hbENvbnRhaW5lciwgJ2NvbnRleHRtZW51JywgKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCByaWdodENsaWNrQmVoYXZpb3IgPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5yaWdodENsaWNrQmVoYXZpb3I7XG5cdFx0XHRpZiAocmlnaHRDbGlja0JlaGF2aW9yID09PSAnbm90aGluZycgJiYgIWV2ZW50LnNoaWZ0S2V5KSB7XG5cdFx0XHRcdHRoaXMuX2NhbmNlbENvbnRleHRNZW51ID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHRlcm1pbmFsQ29udGFpbmVyLmZvY3VzKCk7XG5cdFx0XHRpZiAoIXRoaXMuX2NhbmNlbENvbnRleHRNZW51KSB7XG5cdFx0XHRcdG9wZW5Db250ZXh0TWVudShkb20uZ2V0V2luZG93KHRlcm1pbmFsQ29udGFpbmVyKSwgZXZlbnQsIHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlLCB0aGlzLl9pbnN0YW5jZU1lbnUsIHRoaXMuX2NvbnRleHRNZW51U2VydmljZSk7XG5cdFx0XHR9XG5cdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZXZlbnQuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLl9jYW5jZWxDb250ZXh0TWVudSA9IGZhbHNlO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3RhYkNvbnRhaW5lciwgJ2NvbnRleHRtZW51JywgKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCByaWdodENsaWNrQmVoYXZpb3IgPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5yaWdodENsaWNrQmVoYXZpb3I7XG5cdFx0XHRpZiAocmlnaHRDbGlja0JlaGF2aW9yID09PSAnbm90aGluZycgJiYgIWV2ZW50LnNoaWZ0S2V5KSB7XG5cdFx0XHRcdHRoaXMuX2NhbmNlbENvbnRleHRNZW51ID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5fY2FuY2VsQ29udGV4dE1lbnUpIHtcblx0XHRcdFx0Y29uc3QgZW1wdHlMaXN0ID0gdGhpcy5fdGFiTGlzdC5nZXRGb2N1cygpLmxlbmd0aCA9PT0gMDtcblx0XHRcdFx0aWYgKCFlbXB0eUxpc3QpIHtcblx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5sYXN0QWNjZXNzZWRNZW51ID0gJ3RhYi1saXN0Jztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFB1dCB0aGUgZm9jdXNlZCBpdGVtIGZpcnN0IGFzIGl0J3MgdXNlZCBhcyB0aGUgZmlyc3QgcG9zaXRpb25hbCBhcmd1bWVudFxuXHRcdFx0XHRjb25zdCBzZWxlY3RlZEluc3RhbmNlcyA9IHRoaXMuX3RhYkxpc3QuZ2V0U2VsZWN0ZWRFbGVtZW50cygpO1xuXHRcdFx0XHRjb25zdCBmb2N1c2VkSW5zdGFuY2UgPSB0aGlzLl90YWJMaXN0LmdldEZvY3VzZWRFbGVtZW50cygpPy5bMF07XG5cdFx0XHRcdGlmIChmb2N1c2VkSW5zdGFuY2UpIHtcblx0XHRcdFx0XHRzZWxlY3RlZEluc3RhbmNlcy5zcGxpY2Uoc2VsZWN0ZWRJbnN0YW5jZXMuZmluZEluZGV4KGUgPT4gZS5pbnN0YW5jZUlkID09PSBmb2N1c2VkSW5zdGFuY2UuaW5zdGFuY2VJZCksIDEpO1xuXHRcdFx0XHRcdHNlbGVjdGVkSW5zdGFuY2VzLnVuc2hpZnQoZm9jdXNlZEluc3RhbmNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG9wZW5Db250ZXh0TWVudShkb20uZ2V0V2luZG93KHRoaXMuX3RhYkNvbnRhaW5lciksIGV2ZW50LCBzZWxlY3RlZEluc3RhbmNlcywgZW1wdHlMaXN0ID8gdGhpcy5fdGFic0xpc3RFbXB0eU1lbnUgOiB0aGlzLl90YWJzTGlzdE1lbnUsIHRoaXMuX2NvbnRleHRNZW51U2VydmljZSwgZW1wdHlMaXN0ID8gdGhpcy5fZ2V0VGFiQWN0aW9ucygpIDogdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRldmVudC5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuX2NhbmNlbENvbnRleHRNZW51ID0gZmFsc2U7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGVybWluYWxDb250YWluZXIub3duZXJEb2N1bWVudCwgJ2tleWRvd24nLCAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdHRlcm1pbmFsQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2FsdC1hY3RpdmUnLCAhIWV2ZW50LmFsdEtleSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGVybWluYWxDb250YWluZXIub3duZXJEb2N1bWVudCwgJ2tleXVwJywgKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHR0ZXJtaW5hbENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdhbHQtYWN0aXZlJywgISFldmVudC5hbHRLZXkpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHBhcmVudERvbUVsZW1lbnQsICdrZXl1cCcsIChldmVudDogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LmtleUNvZGUgPT09IDI3KSB7XG5cdFx0XHRcdC8vIEtlZXAgdGVybWluYWwgb3BlbiBvbiBlc2NhcGVcblx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdGFiQ29udGFpbmVyLCBkb20uRXZlbnRUeXBlLkZPQ1VTX0lOLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFRhYnNGb2N1c0NvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3RhYkNvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5GT0NVU19PVVQsICgpID0+IHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsVGFic0ZvY3VzQ29udGV4dEtleS5zZXQoZmFsc2UpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZEhhbmRsZUVtcHR5QXJlYURyb3AoZXZlbnQ6IERyYWdFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHRhcmdldE5vZGUgPSBldmVudC50YXJnZXQgYXMgTm9kZSB8IG51bGw7XG5cdFx0aWYgKHRhcmdldE5vZGUgJiYgKHRoaXMuX3RhYkxpc3REb21FbGVtZW50LmNvbnRhaW5zKHRhcmdldE5vZGUpIHx8IHRoaXMuX3RhYkxpc3RFbGVtZW50LmNvbnRhaW5zKHRhcmdldE5vZGUpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gISFldmVudC5kYXRhVHJhbnNmZXIgJiYgY29udGFpbnNEcmFnVHlwZShldmVudCwgVGVybWluYWxEYXRhVHJhbnNmZXJzLlRlcm1pbmFscyk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRFbXB0eUFyZWFEcm9wU3RhdGUoYWN0aXZlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fdGFiTGlzdENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdkcm9wLXRhcmdldCcsIGFjdGl2ZSk7XG5cdFx0dGhpcy5fdGFiQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2Ryb3AtdGFyZ2V0JywgYWN0aXZlKTtcblx0XHR0aGlzLl9jaGF0RW50cnk/LmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZHJvcC10YXJnZXQnLCBhY3RpdmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzZXRFbXB0eUFyZWFEcm9wU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fZW1wdHlBcmVhRHJvcFRhcmdldENvdW50ID0gMDtcblx0XHR0aGlzLl9zZXRFbXB0eUFyZWFEcm9wU3RhdGUoZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlQ29udGFpbmVyRHJvcChldmVudDogRHJhZ0V2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR0aGlzLl9yZXNldEVtcHR5QXJlYURyb3BTdGF0ZSgpO1xuXHRcdGNvbnN0IHByaW1hcnlCYWNrZW5kID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmdldFByaW1hcnlCYWNrZW5kKCk7XG5cdFx0Y29uc3QgcmVzb3VyY2VzID0gZ2V0VGVybWluYWxSZXNvdXJjZXNGcm9tRHJhZ0V2ZW50KGV2ZW50KTtcblx0XHRsZXQgc291cmNlSW5zdGFuY2VzOiBJVGVybWluYWxJbnN0YW5jZVtdIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPElQcm9jZXNzRGV0YWlscyB8IHVuZGVmaW5lZD5bXSA9IFtdO1xuXHRcdGlmIChyZXNvdXJjZXMpIHtcblx0XHRcdGZvciAoY29uc3QgdXJpIG9mIHJlc291cmNlcykge1xuXHRcdFx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5nZXRJbnN0YW5jZUZyb21SZXNvdXJjZSh1cmkpO1xuXHRcdFx0XHRpZiAoaW5zdGFuY2UpIHtcblx0XHRcdFx0XHRpZiAoc291cmNlSW5zdGFuY2VzKSB7XG5cdFx0XHRcdFx0XHRzb3VyY2VJbnN0YW5jZXMucHVzaChpbnN0YW5jZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHNvdXJjZUluc3RhbmNlcyA9IFtpbnN0YW5jZV07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5tb3ZlVG9UZXJtaW5hbFZpZXcoaW5zdGFuY2UpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHByaW1hcnlCYWNrZW5kKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGVybWluYWxJZGVudGlmaWVyID0gcGFyc2VUZXJtaW5hbFVyaSh1cmkpO1xuXHRcdFx0XHRcdGlmICh0ZXJtaW5hbElkZW50aWZpZXIuaW5zdGFuY2VJZCkge1xuXHRcdFx0XHRcdFx0cHJvbWlzZXMucHVzaChwcmltYXJ5QmFja2VuZC5yZXF1ZXN0RGV0YWNoSW5zdGFuY2UodGVybWluYWxJZGVudGlmaWVyLndvcmtzcGFjZUlkLCB0ZXJtaW5hbElkZW50aWZpZXIuaW5zdGFuY2VJZCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocHJvbWlzZXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBwcm9jZXNzZXMgPSAoYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpKS5maWx0ZXIoKHByb2Nlc3MpOiBwcm9jZXNzIGlzIElQcm9jZXNzRGV0YWlscyA9PiAhIXByb2Nlc3MpO1xuXHRcdFx0bGV0IGxhc3RJbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ7XG5cdFx0XHRmb3IgKGNvbnN0IGF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzIG9mIHByb2Nlc3Nlcykge1xuXHRcdFx0XHRsYXN0SW5zdGFuY2UgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuY3JlYXRlVGVybWluYWwoeyBjb25maWc6IHsgYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MgfSB9KTtcblx0XHRcdH1cblx0XHRcdGlmIChsYXN0SW5zdGFuY2UpIHtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKGxhc3RJbnN0YW5jZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghc291cmNlSW5zdGFuY2VzIHx8ICFzb3VyY2VJbnN0YW5jZXMubGVuZ3RoKSB7XG5cdFx0XHRzb3VyY2VJbnN0YW5jZXMgPSB0aGlzLl90YWJMaXN0LmdldFNlbGVjdGVkRWxlbWVudHMoKTtcblx0XHRcdGlmICghc291cmNlSW5zdGFuY2VzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLm1vdmVHcm91cFRvRW5kKHNvdXJjZUluc3RhbmNlcyk7XG5cdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKHNvdXJjZUluc3RhbmNlc1swXSk7XG5cdFx0Y29uc3QgaW5kZXhlcyA9IHNvdXJjZUluc3RhbmNlc1xuXHRcdFx0Lm1hcChpbnN0YW5jZSA9PiB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5pbnN0YW5jZXMuaW5kZXhPZihpbnN0YW5jZSkpXG5cdFx0XHQuZmlsdGVyKGluZGV4ID0+IGluZGV4ID49IDApO1xuXHRcdGlmIChpbmRleGVzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fdGFiTGlzdC5zZXRTZWxlY3Rpb24oaW5kZXhlcyk7XG5cdFx0XHR0aGlzLl90YWJMaXN0LnNldEZvY3VzKFtpbmRleGVzWzBdXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VGFiQWN0aW9ucygpOiBJQWN0aW9uW10ge1xuXHRcdHJldHVybiBbXG5cdFx0XHRuZXcgU2VwYXJhdG9yKCksXG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KFRlcm1pbmFsU2V0dGluZ0lkLlRhYnNMb2NhdGlvbikudXNlclZhbHVlID09PSAnbGVmdCcgP1xuXHRcdFx0XHRuZXcgQWN0aW9uKCdtb3ZlUmlnaHQnLCBsb2NhbGl6ZSgnbW92ZVRhYnNSaWdodCcsIFwiTW92ZSBUYWJzIFJpZ2h0XCIpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFRlcm1pbmFsU2V0dGluZ0lkLlRhYnNMb2NhdGlvbiwgJ3JpZ2h0Jyk7XG5cdFx0XHRcdH0pIDpcblx0XHRcdFx0bmV3IEFjdGlvbignbW92ZUxlZnQnLCBsb2NhbGl6ZSgnbW92ZVRhYnNMZWZ0JywgXCJNb3ZlIFRhYnMgTGVmdFwiKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShUZXJtaW5hbFNldHRpbmdJZC5UYWJzTG9jYXRpb24sICdsZWZ0Jyk7XG5cdFx0XHRcdH0pLFxuXHRcdFx0bmV3IEFjdGlvbignaGlkZVRhYnMnLCBsb2NhbGl6ZSgnaGlkZVRhYnMnLCBcIkhpZGUgVGFic1wiKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoVGVybWluYWxTZXR0aW5nSWQuVGFic0VuYWJsZWQsIGZhbHNlKTtcblx0XHRcdH0pXG5cdFx0XTtcblx0fVxuXG5cdHNldEVkaXRhYmxlKGlzRWRpdGluZzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghaXNFZGl0aW5nKSB7XG5cdFx0XHR0aGlzLl90YWJMaXN0LmRvbUZvY3VzKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3RhYkxpc3QucmVmcmVzaChmYWxzZSk7XG5cdH1cblxuXHRmb2N1c1RhYnMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zaG91bGRTaG93VGFicygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Rlcm1pbmFsVGFic0ZvY3VzQ29udGV4dEtleS5zZXQodHJ1ZSk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWQgPSB0aGlzLl90YWJMaXN0LmdldFNlbGVjdGlvbigpO1xuXHRcdHRoaXMuX3RhYkxpc3QuZG9tRm9jdXMoKTtcblx0XHRpZiAoc2VsZWN0ZWQpIHtcblx0XHRcdHRoaXMuX3RhYkxpc3Quc2V0Rm9jdXMoc2VsZWN0ZWQpO1xuXHRcdH1cblx0fVxuXG5cdGZvY3VzKCkge1xuXHRcdGlmICh0aGlzLl90ZXJtaW5hbFNlcnZpY2UuY29ubmVjdGlvblN0YXRlID09PSBUZXJtaW5hbENvbm5lY3Rpb25TdGF0ZS5Db25uZWN0ZWQpIHtcblx0XHRcdHRoaXMuX2ZvY3VzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIHRlcm1pbmFsIGlzIHdhaXRpbmcgdG8gcmVjb25uZWN0IHRvIHJlbW90ZSB0ZXJtaW5hbHMsIHRoZW4gdGhlcmUgaXMgbm8gVGVybWluYWxJbnN0YW5jZSB5ZXQgdGhhdCBjYW5cblx0XHQvLyBiZSBmb2N1c2VkLiBTbyB3YWl0IGZvciBjb25uZWN0aW9uIHRvIGZpbmlzaCwgdGhlbiBmb2N1cy5cblx0XHRjb25zdCBwcmV2aW91c0FjdGl2ZUVsZW1lbnQgPSB0aGlzLl90YWJMaXN0RWxlbWVudC5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0aWYgKHByZXZpb3VzQWN0aXZlRWxlbWVudCkge1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihFdmVudC5vbmNlKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZSkoKCkgPT4ge1xuXHRcdFx0XHQvLyBPbmx5IGZvY3VzIHRoZSB0ZXJtaW5hbCBpZiB0aGUgYWN0aXZlRWxlbWVudCBoYXMgbm90IGNoYW5nZWQgc2luY2UgZm9jdXMoKSB3YXMgY2FsbGVkXG5cdFx0XHRcdGlmIChkb20uaXNBY3RpdmVFbGVtZW50KHByZXZpb3VzQWN0aXZlRWxlbWVudCkpIHtcblx0XHRcdFx0XHR0aGlzLl9mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3N0b3JlLmRlbGV0ZShsaXN0ZW5lcik7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0Zm9jdXNIb3ZlcigpIHtcblx0XHRpZiAodGhpcy5fc2hvdWxkU2hvd1RhYnMoKSkge1xuXHRcdFx0dGhpcy5fdGFiTGlzdC5mb2N1c0hvdmVyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuYWN0aXZlSW5zdGFuY2U7XG5cdFx0aWYgKCFpbnN0YW5jZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9ob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHQuLi5nZXRJbnN0YW5jZUhvdmVySW5mbyhpbnN0YW5jZSwgdGhpcy5fc3RvcmFnZVNlcnZpY2UpLFxuXHRcdFx0dGFyZ2V0OiB0aGlzLl90ZXJtaW5hbENvbnRhaW5lcixcblx0XHRcdHRyYXBGb2N1czogdHJ1ZVxuXHRcdH0sIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9jdXMoKSB7XG5cdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuYWN0aXZlSW5zdGFuY2U/LmZvY3VzV2hlblJlYWR5KCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0IsYUFBYSxRQUFRLGlCQUFpQjtBQUMvRCxTQUFTLFlBQVksZUFBNEI7QUFDakQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FB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
