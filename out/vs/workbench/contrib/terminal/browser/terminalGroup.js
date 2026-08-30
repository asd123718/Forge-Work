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
import { TERMINAL_VIEW_ID } from "../common/terminal.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import { SplitView, Orientation, Sizing } from "../../../../base/browser/ui/splitview/splitview.js";
import { isHorizontal, IWorkbenchLayoutService, Position } from "../../../services/layout/browser/layoutService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Direction, ITerminalInstanceService, ITerminalConfigurationService } from "./terminal.js";
import { ViewContainerLocation, IViewDescriptorService } from "../../../common/views.js";
import { TerminalLocation } from "../../../../platform/terminal/common/terminal.js";
import { TerminalStatus } from "./terminalStatusList.js";
import { getWindow } from "../../../../base/browser/dom.js";
import { asArray } from "../../../../base/common/arrays.js";
import { hasKey, isNumber } from "../../../../base/common/types.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["SplitPaneMinSize"] = 80] = "SplitPaneMinSize";
  Constants2[Constants2["ResizePartCellCount"] = 4] = "ResizePartCellCount";
  return Constants2;
})(Constants || {});
class SplitPaneContainer extends Disposable {
  constructor(_container, orientation) {
    super();
    this._container = _container;
    this.orientation = orientation;
    this._splitViewDisposables = this._register(new DisposableStore());
    this._children = [];
    this._terminalToPane = /* @__PURE__ */ new Map();
    this._onDidChange = Event.None;
    this._width = this._container.offsetWidth;
    this._height = this._container.offsetHeight;
    this._createSplitView();
    this._splitView.layout(this.orientation === Orientation.HORIZONTAL ? this._width : this._height);
  }
  get onDidChange() {
    return this._onDidChange;
  }
  _createSplitView() {
    this._splitViewDisposables.clear();
    this._splitView = new SplitView(this._container, { orientation: this.orientation });
    this._splitViewDisposables.add(this._splitView);
    this._splitViewDisposables.add(this._splitView.onDidSashReset(() => this._splitView.distributeViewSizes()));
  }
  split(instance, index) {
    this._addChild(instance, index);
  }
  resizePane(index, direction, amount) {
    if (this._children.length <= 1) {
      return;
    }
    const sizes = [];
    for (let i = 0; i < this._splitView.length; i++) {
      sizes.push(this._splitView.getViewSize(i));
    }
    const isSizingEndPane = index !== this._children.length - 1;
    const indexToChange = isSizingEndPane ? index + 1 : index - 1;
    if (isSizingEndPane && direction === Direction.Left) {
      amount *= -1;
    } else if (!isSizingEndPane && direction === Direction.Right) {
      amount *= -1;
    } else if (isSizingEndPane && direction === Direction.Up) {
      amount *= -1;
    } else if (!isSizingEndPane && direction === Direction.Down) {
      amount *= -1;
    }
    if (sizes[index] + amount < 80 /* SplitPaneMinSize */) {
      amount = 80 /* SplitPaneMinSize */ - sizes[index];
    } else if (sizes[indexToChange] - amount < 80 /* SplitPaneMinSize */) {
      amount = sizes[indexToChange] - 80 /* SplitPaneMinSize */;
    }
    sizes[index] += amount;
    sizes[indexToChange] -= amount;
    for (let i = 0; i < this._splitView.length - 1; i++) {
      this._splitView.resizeView(i, sizes[i]);
    }
  }
  resizePanes(relativeSizes) {
    if (this._children.length <= 1) {
      return;
    }
    relativeSizes[relativeSizes.length - 1] += 1 - relativeSizes.reduce((totalValue, currentValue) => totalValue + currentValue, 0);
    let totalSize = 0;
    for (let i = 0; i < this._splitView.length; i++) {
      totalSize += this._splitView.getViewSize(i);
    }
    for (let i = 0; i < this._splitView.length; i++) {
      this._splitView.resizeView(i, totalSize * relativeSizes[i]);
    }
  }
  getPaneSize(instance) {
    const paneForInstance = this._terminalToPane.get(instance);
    if (!paneForInstance) {
      return 0;
    }
    const index = this._children.indexOf(paneForInstance);
    return this._splitView.getViewSize(index);
  }
  _addChild(instance, index) {
    const child = new SplitPane(instance, this.orientation === Orientation.HORIZONTAL ? this._height : this._width);
    child.orientation = this.orientation;
    if (isNumber(index)) {
      this._children.splice(index, 0, child);
    } else {
      this._children.push(child);
    }
    this._terminalToPane.set(instance, this._children[this._children.indexOf(child)]);
    this._withDisabledLayout(() => this._splitView.addView(child, Sizing.Distribute, index));
    this.layout(this._width, this._height);
    this._onDidChange = Event.any(...this._children.map((c) => c.onDidChange));
  }
  remove(instance) {
    let index = null;
    for (let i = 0; i < this._children.length; i++) {
      if (this._children[i].instance === instance) {
        index = i;
      }
    }
    if (index !== null) {
      this._children.splice(index, 1);
      this._terminalToPane.delete(instance);
      this._splitView.removeView(index, Sizing.Distribute);
      instance.detachFromElement();
    }
  }
  layout(width, height) {
    this._width = width;
    this._height = height;
    if (this.orientation === Orientation.HORIZONTAL) {
      this._children.forEach((c) => c.orthogonalLayout(height));
      this._splitView.layout(width);
    } else {
      this._children.forEach((c) => c.orthogonalLayout(width));
      this._splitView.layout(height);
    }
  }
  setOrientation(orientation) {
    if (this.orientation === orientation) {
      return;
    }
    this.orientation = orientation;
    while (this._container.children.length > 0) {
      this._container.children[0].remove();
    }
    this._createSplitView();
    this._withDisabledLayout(() => {
      this._children.forEach((child) => {
        child.orientation = orientation;
        this._splitView.addView(child, 1);
      });
    });
  }
  _withDisabledLayout(innerFunction) {
    this._children.forEach((c) => c.instance.disableLayout = true);
    innerFunction();
    this._children.forEach((c) => c.instance.disableLayout = false);
  }
}
class SplitPane {
  constructor(instance, orthogonalSize) {
    this.instance = instance;
    this.orthogonalSize = orthogonalSize;
    this.minimumSize = 80 /* SplitPaneMinSize */;
    this.maximumSize = Number.MAX_VALUE;
    this._onDidChange = Event.None;
    this.element = document.createElement("div");
    this.element.className = "terminal-split-pane";
    this.instance.attachToElement(this.element);
  }
  get onDidChange() {
    return this._onDidChange;
  }
  layout(size) {
    if (!size || !this.orthogonalSize) {
      return;
    }
    if (this.orientation === Orientation.VERTICAL) {
      this.instance.layout({ width: this.orthogonalSize, height: size });
    } else {
      this.instance.layout({ width: size, height: this.orthogonalSize });
    }
  }
  orthogonalLayout(size) {
    this.orthogonalSize = size;
  }
}
let TerminalGroup = class extends Disposable {
  constructor(_container, shellLaunchConfigOrInstance, _terminalConfigurationService, _terminalInstanceService, _paneCompositePartService, _layoutService, _viewDescriptorService, _instantiationService) {
    super();
    this._container = _container;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._terminalInstanceService = _terminalInstanceService;
    this._paneCompositePartService = _paneCompositePartService;
    this._layoutService = _layoutService;
    this._viewDescriptorService = _viewDescriptorService;
    this._instantiationService = _instantiationService;
    this._terminalInstances = [];
    this._panelPosition = Position.BOTTOM;
    this._terminalLocation = ViewContainerLocation.Panel;
    this._instanceDisposables = /* @__PURE__ */ new Map();
    this._activeInstanceIndex = -1;
    this._hadFocusOnExit = false;
    this._visible = false;
    this._onDidDisposeInstance = this._register(new Emitter());
    this.onDidDisposeInstance = this._onDidDisposeInstance.event;
    this._onDidFocusInstance = this._register(new Emitter());
    this.onDidFocusInstance = this._onDidFocusInstance.event;
    this._onDidChangeInstanceCapability = this._register(new Emitter());
    this.onDidChangeInstanceCapability = this._onDidChangeInstanceCapability.event;
    this._onDisposed = this._register(new Emitter());
    this.onDisposed = this._onDisposed.event;
    this._onInstancesChanged = this._register(new Emitter());
    this.onInstancesChanged = this._onInstancesChanged.event;
    this._onDidChangeActiveInstance = this._register(new Emitter());
    this.onDidChangeActiveInstance = this._onDidChangeActiveInstance.event;
    this._onPanelOrientationChanged = this._register(new Emitter());
    this.onPanelOrientationChanged = this._onPanelOrientationChanged.event;
    if (shellLaunchConfigOrInstance) {
      this.addInstance(shellLaunchConfigOrInstance);
    }
    if (this._container) {
      this.attachToElement(this._container);
    }
    this._onPanelOrientationChanged.fire(this._terminalLocation === ViewContainerLocation.Panel && isHorizontal(this._panelPosition) ? Orientation.HORIZONTAL : Orientation.VERTICAL);
    this._register(toDisposable(() => {
      if (this._container && this._groupElement) {
        this._groupElement.remove();
        this._groupElement = void 0;
      }
    }));
  }
  get terminalInstances() {
    return this._terminalInstances;
  }
  get hadFocusOnExit() {
    return this._hadFocusOnExit;
  }
  addInstance(shellLaunchConfigOrInstance, parentTerminalId) {
    let instance;
    const parentIndex = parentTerminalId ? this._terminalInstances.findIndex((t) => t.instanceId === parentTerminalId) : this._activeInstanceIndex;
    if (hasKey(shellLaunchConfigOrInstance, { instanceId: true })) {
      instance = shellLaunchConfigOrInstance;
    } else {
      instance = this._terminalInstanceService.createInstance(shellLaunchConfigOrInstance, TerminalLocation.Panel);
    }
    if (this._terminalInstances.length === 0) {
      this._terminalInstances.push(instance);
      this._activeInstanceIndex = 0;
    } else {
      this._terminalInstances.splice(parentIndex + 1, 0, instance);
    }
    this._initInstanceListeners(instance);
    if (this._splitPaneContainer) {
      this._splitPaneContainer.split(instance, parentIndex + 1);
    }
    this._onInstancesChanged.fire();
  }
  dispose() {
    this._terminalInstances = [];
    this._onInstancesChanged.fire();
    this._splitPaneContainer?.dispose();
    super.dispose();
  }
  get activeInstance() {
    if (this._terminalInstances.length === 0) {
      return void 0;
    }
    return this._terminalInstances[this._activeInstanceIndex];
  }
  getLayoutInfo(isActive) {
    const instances = this.terminalInstances.filter((instance) => isNumber(instance.persistentProcessId) && instance.shouldPersist);
    const totalSize = instances.map((t) => this._splitPaneContainer?.getPaneSize(t) || 0).reduce((total, size) => total += size, 0);
    return {
      isActive,
      activePersistentProcessId: this.activeInstance ? this.activeInstance.persistentProcessId : void 0,
      terminals: instances.map((t) => {
        return {
          relativeSize: totalSize > 0 ? this._splitPaneContainer.getPaneSize(t) / totalSize : 0,
          terminal: t.persistentProcessId || 0
        };
      })
    };
  }
  _initInstanceListeners(instance) {
    this._instanceDisposables.set(instance.instanceId, [
      instance.onDisposed((instance2) => {
        this._onDidDisposeInstance.fire(instance2);
        this._handleOnDidDisposeInstance(instance2);
      }),
      instance.onDidFocus((instance2) => {
        this._setActiveInstance(instance2);
        this._onDidFocusInstance.fire(instance2);
      }),
      instance.capabilities.onDidChangeCapabilities(() => this._onDidChangeInstanceCapability.fire(instance))
    ]);
  }
  _handleOnDidDisposeInstance(instance) {
    this._removeInstance(instance);
  }
  removeInstance(instance) {
    this._removeInstance(instance);
  }
  _removeInstance(instance) {
    const index = this._terminalInstances.indexOf(instance);
    if (index === -1) {
      return;
    }
    const wasActiveInstance = instance === this.activeInstance;
    this._terminalInstances.splice(index, 1);
    if (wasActiveInstance && this._terminalInstances.length > 0) {
      const newIndex = index < this._terminalInstances.length ? index : this._terminalInstances.length - 1;
      this.setActiveInstanceByIndex(newIndex);
      this.activeInstance?.focus(true);
    } else if (index < this._activeInstanceIndex) {
      this._activeInstanceIndex--;
    }
    this._splitPaneContainer?.remove(instance);
    if (this._terminalInstances.length === 0) {
      this._hadFocusOnExit = instance.hadFocusOnExit;
      this._onDisposed.fire(this);
      this.dispose();
    } else {
      this._onInstancesChanged.fire();
    }
    const disposables = this._instanceDisposables.get(instance.instanceId);
    if (disposables) {
      dispose(disposables);
      this._instanceDisposables.delete(instance.instanceId);
    }
  }
  moveInstance(instances, index, position) {
    instances = asArray(instances);
    const hasInvalidInstance = instances.some((instance) => !this.terminalInstances.includes(instance));
    if (hasInvalidInstance) {
      return;
    }
    const insertIndex = position === "before" ? index : index + 1;
    this._terminalInstances.splice(insertIndex, 0, ...instances);
    for (const item of instances) {
      const originSourceGroupIndex = position === "after" ? this._terminalInstances.indexOf(item) : this._terminalInstances.lastIndexOf(item);
      this._terminalInstances.splice(originSourceGroupIndex, 1);
    }
    if (this._splitPaneContainer) {
      for (let i = 0; i < instances.length; i++) {
        const item = instances[i];
        this._splitPaneContainer.remove(item);
        this._splitPaneContainer.split(item, index + (position === "before" ? i : 0));
      }
    }
    this._onInstancesChanged.fire();
  }
  _setActiveInstance(instance) {
    this.setActiveInstanceByIndex(this._getIndexFromId(instance.instanceId));
  }
  _getIndexFromId(terminalId) {
    let terminalIndex = -1;
    this.terminalInstances.forEach((terminalInstance, i) => {
      if (terminalInstance.instanceId === terminalId) {
        terminalIndex = i;
      }
    });
    if (terminalIndex === -1) {
      throw new Error(`Terminal with ID ${terminalId} does not exist (has it already been disposed?)`);
    }
    return terminalIndex;
  }
  setActiveInstanceByIndex(index, force) {
    if (index < 0 || index >= this._terminalInstances.length) {
      return;
    }
    const oldActiveInstance = this.activeInstance;
    this._activeInstanceIndex = index;
    if (oldActiveInstance !== this.activeInstance || force) {
      this._onInstancesChanged.fire();
      this._onDidChangeActiveInstance.fire(this.activeInstance);
    }
  }
  attachToElement(element) {
    this._container = element;
    if (!this._groupElement) {
      this._groupElement = document.createElement("div");
      this._groupElement.classList.add("terminal-group");
    }
    this._container.appendChild(this._groupElement);
    if (!this._splitPaneContainer) {
      this._panelPosition = this._layoutService.getPanelPosition();
      this._terminalLocation = this._viewDescriptorService.getViewLocationById(TERMINAL_VIEW_ID);
      const orientation = this._terminalLocation === ViewContainerLocation.Panel && isHorizontal(this._panelPosition) ? Orientation.HORIZONTAL : Orientation.VERTICAL;
      this._splitPaneContainer = this._instantiationService.createInstance(SplitPaneContainer, this._groupElement, orientation);
      this.terminalInstances.forEach((instance) => this._splitPaneContainer.split(instance, this._activeInstanceIndex + 1));
    }
  }
  get title() {
    if (this._terminalInstances.length === 0) {
      return "";
    }
    let title = this.terminalInstances[0].title + this._getBellTitle(this.terminalInstances[0]);
    if (this.terminalInstances[0].description) {
      title += ` (${this.terminalInstances[0].description})`;
    }
    for (let i = 1; i < this.terminalInstances.length; i++) {
      const instance = this.terminalInstances[i];
      if (instance.title) {
        title += `, ${instance.title + this._getBellTitle(instance)}`;
        if (instance.description) {
          title += ` (${instance.description})`;
        }
      }
    }
    return title;
  }
  _getBellTitle(instance) {
    if (this._terminalConfigurationService.config.enableBell && instance.statusList.statuses.some((e) => e.id === TerminalStatus.Bell)) {
      return "*";
    }
    return "";
  }
  setVisible(visible) {
    this._visible = visible;
    if (this._groupElement) {
      this._groupElement.style.display = visible ? "" : "none";
    }
    this.terminalInstances.forEach((i) => i.setVisible(visible));
  }
  split(shellLaunchConfig) {
    const instance = this._terminalInstanceService.createInstance(shellLaunchConfig, TerminalLocation.Panel);
    this.addInstance(instance, shellLaunchConfig.parentTerminalId);
    this._setActiveInstance(instance);
    return instance;
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
  layout(width, height) {
    if (this._splitPaneContainer) {
      const newPanelPosition = this._layoutService.getPanelPosition();
      const newTerminalLocation = this._viewDescriptorService.getViewLocationById(TERMINAL_VIEW_ID);
      const terminalPositionChanged = newPanelPosition !== this._panelPosition || newTerminalLocation !== this._terminalLocation;
      if (terminalPositionChanged) {
        const newOrientation = newTerminalLocation === ViewContainerLocation.Panel && isHorizontal(newPanelPosition) ? Orientation.HORIZONTAL : Orientation.VERTICAL;
        this._splitPaneContainer.setOrientation(newOrientation);
        this._panelPosition = newPanelPosition;
        this._terminalLocation = newTerminalLocation;
        this._onPanelOrientationChanged.fire(this._splitPaneContainer.orientation);
      }
      this._splitPaneContainer.layout(width, height);
      if (this._initialRelativeSizes && this._visible) {
        this.resizePanes(this._initialRelativeSizes);
        this._initialRelativeSizes = void 0;
      }
    }
  }
  focusPreviousPane() {
    const newIndex = this._activeInstanceIndex === 0 ? this._terminalInstances.length - 1 : this._activeInstanceIndex - 1;
    this.setActiveInstanceByIndex(newIndex);
  }
  focusNextPane() {
    const newIndex = this._activeInstanceIndex === this._terminalInstances.length - 1 ? 0 : this._activeInstanceIndex + 1;
    this.setActiveInstanceByIndex(newIndex);
  }
  _getPosition() {
    switch (this._terminalLocation) {
      case ViewContainerLocation.Panel:
        return this._panelPosition;
      case ViewContainerLocation.Sidebar:
        return this._layoutService.getSideBarPosition();
      case ViewContainerLocation.AuxiliaryBar:
        return this._layoutService.getSideBarPosition() === Position.LEFT ? Position.RIGHT : Position.LEFT;
      default:
        return this._panelPosition;
    }
  }
  _getOrientation() {
    return isHorizontal(this._getPosition()) ? Orientation.HORIZONTAL : Orientation.VERTICAL;
  }
  resizePane(direction) {
    if (!this._splitPaneContainer) {
      return;
    }
    const isHorizontalResize = direction === Direction.Left || direction === Direction.Right;
    const groupOrientation = this._getOrientation();
    const shouldResizePart = isHorizontalResize && groupOrientation === Orientation.VERTICAL || !isHorizontalResize && groupOrientation === Orientation.HORIZONTAL;
    const font = this._terminalConfigurationService.getFont(getWindow(this._groupElement));
    const charSize = isHorizontalResize ? font.charWidth : font.charHeight;
    if (charSize) {
      let resizeAmount = charSize * 4 /* ResizePartCellCount */;
      if (shouldResizePart) {
        const position = this._getPosition();
        const shouldShrink = position === Position.LEFT && direction === Direction.Left || position === Position.RIGHT && direction === Direction.Right || position === Position.BOTTOM && direction === Direction.Down || position === Position.TOP && direction === Direction.Up;
        if (shouldShrink) {
          resizeAmount *= -1;
        }
        this._layoutService.resizePart(this._paneCompositePartService.getPartId(this._terminalLocation), resizeAmount, resizeAmount);
      } else {
        this._splitPaneContainer.resizePane(this._activeInstanceIndex, direction, resizeAmount);
      }
    }
  }
  resizePanes(relativeSizes) {
    if (!this._splitPaneContainer) {
      this._initialRelativeSizes = relativeSizes;
      return;
    }
    this._splitPaneContainer.resizePanes(relativeSizes);
  }
};
TerminalGroup = __decorateClass([
  __decorateParam(2, ITerminalConfigurationService),
  __decorateParam(3, ITerminalInstanceService),
  __decorateParam(4, IPaneCompositePartService),
  __decorateParam(5, IWorkbenchLayoutService),
  __decorateParam(6, IViewDescriptorService),
  __decorateParam(7, IInstantiationService)
], TerminalGroup);
export {
  TerminalGroup
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFx0ZXJtaW5hbEdyb3VwLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVEVSTUlOQUxfVklFV19JRCB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTcGxpdFZpZXcsIE9yaWVudGF0aW9uLCBJVmlldywgU2l6aW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NwbGl0dmlldy9zcGxpdHZpZXcuanMnO1xuaW1wb3J0IHsgaXNIb3Jpem9udGFsLCBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsSW5zdGFuY2UsIERpcmVjdGlvbiwgSVRlcm1pbmFsR3JvdXAsIElUZXJtaW5hbEluc3RhbmNlU2VydmljZSwgSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFZpZXdDb250YWluZXJMb2NhdGlvbiwgSVZpZXdEZXNjcmlwdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJU2hlbGxMYXVuY2hDb25maWcsIElUZXJtaW5hbFRhYkxheW91dEluZm9CeUlkLCBUZXJtaW5hbExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsU3RhdHVzIH0gZnJvbSAnLi90ZXJtaW5hbFN0YXR1c0xpc3QuanMnO1xuaW1wb3J0IHsgZ2V0V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGhhc0tleSwgaXNOdW1iZXIsIHR5cGUgU2luZ2xlT3JNYW55IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhbmVjb21wb3NpdGUvYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcblxuY29uc3QgZW51bSBDb25zdGFudHMge1xuXHQvKipcblx0ICogVGhlIG1pbmltdW0gc2l6ZSBpbiBwaXhlbHMgb2YgYSBzcGxpdCBwYW5lLlxuXHQgKi9cblx0U3BsaXRQYW5lTWluU2l6ZSA9IDgwLFxuXHQvKipcblx0ICogVGhlIG51bWJlciBvZiBjZWxscyB0aGUgdGVybWluYWwgZ2V0cyBhZGRlZCBvciByZW1vdmVkIHdoZW4gYXNrZWQgdG8gaW5jcmVhc2Ugb3IgZGVjcmVhc2Vcblx0ICogdGhlIHZpZXcgc2l6ZS5cblx0ICovXG5cdFJlc2l6ZVBhcnRDZWxsQ291bnQgPSA0XG59XG5cbmNsYXNzIFNwbGl0UGFuZUNvbnRhaW5lciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9oZWlnaHQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfd2lkdGg6IG51bWJlcjtcblx0cHJpdmF0ZSBfc3BsaXRWaWV3ITogU3BsaXRWaWV3O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zcGxpdFZpZXdEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX2NoaWxkcmVuOiBTcGxpdFBhbmVbXSA9IFtdO1xuXHRwcml2YXRlIF90ZXJtaW5hbFRvUGFuZTogTWFwPElUZXJtaW5hbEluc3RhbmNlLCBTcGxpdFBhbmU+ID0gbmV3IE1hcCgpO1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlOiBFdmVudDxudW1iZXIgfCB1bmRlZmluZWQ+ID0gRXZlbnQuTm9uZTtcblx0Z2V0IG9uRGlkQ2hhbmdlKCk6IEV2ZW50PG51bWJlciB8IHVuZGVmaW5lZD4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2U7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9jb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHB1YmxpYyBvcmllbnRhdGlvbjogT3JpZW50YXRpb24sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fd2lkdGggPSB0aGlzLl9jb250YWluZXIub2Zmc2V0V2lkdGg7XG5cdFx0dGhpcy5faGVpZ2h0ID0gdGhpcy5fY29udGFpbmVyLm9mZnNldEhlaWdodDtcblx0XHR0aGlzLl9jcmVhdGVTcGxpdFZpZXcoKTtcblx0XHR0aGlzLl9zcGxpdFZpZXcubGF5b3V0KHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyB0aGlzLl93aWR0aCA6IHRoaXMuX2hlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVTcGxpdFZpZXcoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3BsaXRWaWV3RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9zcGxpdFZpZXcgPSBuZXcgU3BsaXRWaWV3KHRoaXMuX2NvbnRhaW5lciwgeyBvcmllbnRhdGlvbjogdGhpcy5vcmllbnRhdGlvbiB9KTtcblx0XHR0aGlzLl9zcGxpdFZpZXdEaXNwb3NhYmxlcy5hZGQodGhpcy5fc3BsaXRWaWV3KTtcblx0XHR0aGlzLl9zcGxpdFZpZXdEaXNwb3NhYmxlcy5hZGQodGhpcy5fc3BsaXRWaWV3Lm9uRGlkU2FzaFJlc2V0KCgpID0+IHRoaXMuX3NwbGl0Vmlldy5kaXN0cmlidXRlVmlld1NpemVzKCkpKTtcblx0fVxuXG5cdHNwbGl0KGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSwgaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2FkZENoaWxkKGluc3RhbmNlLCBpbmRleCk7XG5cdH1cblxuXHRyZXNpemVQYW5lKGluZGV4OiBudW1iZXIsIGRpcmVjdGlvbjogRGlyZWN0aW9uLCBhbW91bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdC8vIE9ubHkgcmVzaXplIHdoZW4gdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBwYW5lXG5cdFx0aWYgKHRoaXMuX2NoaWxkcmVuLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gR2V0IHNpemVzXG5cdFx0Y29uc3Qgc2l6ZXM6IG51bWJlcltdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9zcGxpdFZpZXcubGVuZ3RoOyBpKyspIHtcblx0XHRcdHNpemVzLnB1c2godGhpcy5fc3BsaXRWaWV3LmdldFZpZXdTaXplKGkpKTtcblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgc2l6ZSBmcm9tIHJpZ2h0IHBhbmUsIHVubGVzcyBpbmRleCBpcyB0aGUgbGFzdCBwYW5lIGluIHdoaWNoIGNhc2UgdXNlIGxlZnQgcGFuZVxuXHRcdGNvbnN0IGlzU2l6aW5nRW5kUGFuZSA9IGluZGV4ICE9PSB0aGlzLl9jaGlsZHJlbi5sZW5ndGggLSAxO1xuXHRcdGNvbnN0IGluZGV4VG9DaGFuZ2UgPSBpc1NpemluZ0VuZFBhbmUgPyBpbmRleCArIDEgOiBpbmRleCAtIDE7XG5cdFx0aWYgKGlzU2l6aW5nRW5kUGFuZSAmJiBkaXJlY3Rpb24gPT09IERpcmVjdGlvbi5MZWZ0KSB7XG5cdFx0XHRhbW91bnQgKj0gLTE7XG5cdFx0fSBlbHNlIGlmICghaXNTaXppbmdFbmRQYW5lICYmIGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLlJpZ2h0KSB7XG5cdFx0XHRhbW91bnQgKj0gLTE7XG5cdFx0fSBlbHNlIGlmIChpc1NpemluZ0VuZFBhbmUgJiYgZGlyZWN0aW9uID09PSBEaXJlY3Rpb24uVXApIHtcblx0XHRcdGFtb3VudCAqPSAtMTtcblx0XHR9IGVsc2UgaWYgKCFpc1NpemluZ0VuZFBhbmUgJiYgZGlyZWN0aW9uID09PSBEaXJlY3Rpb24uRG93bikge1xuXHRcdFx0YW1vdW50ICo9IC0xO1xuXHRcdH1cblxuXHRcdC8vIEVuc3VyZSB0aGUgc2l6ZSBpcyBub3QgcmVkdWNlZCBiZXlvbmQgdGhlIG1pbmltdW0sIG90aGVyd2lzZSB3ZWlyZCB0aGluZ3MgY2FuIGhhcHBlblxuXHRcdGlmIChzaXplc1tpbmRleF0gKyBhbW91bnQgPCBDb25zdGFudHMuU3BsaXRQYW5lTWluU2l6ZSkge1xuXHRcdFx0YW1vdW50ID0gQ29uc3RhbnRzLlNwbGl0UGFuZU1pblNpemUgLSBzaXplc1tpbmRleF07XG5cdFx0fSBlbHNlIGlmIChzaXplc1tpbmRleFRvQ2hhbmdlXSAtIGFtb3VudCA8IENvbnN0YW50cy5TcGxpdFBhbmVNaW5TaXplKSB7XG5cdFx0XHRhbW91bnQgPSBzaXplc1tpbmRleFRvQ2hhbmdlXSAtIENvbnN0YW50cy5TcGxpdFBhbmVNaW5TaXplO1xuXHRcdH1cblxuXHRcdC8vIEFwcGx5IHRoZSBzaXplIGNoYW5nZVxuXHRcdHNpemVzW2luZGV4XSArPSBhbW91bnQ7XG5cdFx0c2l6ZXNbaW5kZXhUb0NoYW5nZV0gLT0gYW1vdW50O1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fc3BsaXRWaWV3Lmxlbmd0aCAtIDE7IGkrKykge1xuXHRcdFx0dGhpcy5fc3BsaXRWaWV3LnJlc2l6ZVZpZXcoaSwgc2l6ZXNbaV0pO1xuXHRcdH1cblx0fVxuXG5cdHJlc2l6ZVBhbmVzKHJlbGF0aXZlU2l6ZXM6IG51bWJlcltdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NoaWxkcmVuLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gYXNzaWduIGFueSBleHRyYSBzaXplIHRvIGxhc3QgdGVybWluYWxcblx0XHRyZWxhdGl2ZVNpemVzW3JlbGF0aXZlU2l6ZXMubGVuZ3RoIC0gMV0gKz0gMSAtIHJlbGF0aXZlU2l6ZXMucmVkdWNlKCh0b3RhbFZhbHVlLCBjdXJyZW50VmFsdWUpID0+IHRvdGFsVmFsdWUgKyBjdXJyZW50VmFsdWUsIDApO1xuXHRcdGxldCB0b3RhbFNpemUgPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fc3BsaXRWaWV3Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0b3RhbFNpemUgKz0gdGhpcy5fc3BsaXRWaWV3LmdldFZpZXdTaXplKGkpO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3NwbGl0Vmlldy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dGhpcy5fc3BsaXRWaWV3LnJlc2l6ZVZpZXcoaSwgdG90YWxTaXplICogcmVsYXRpdmVTaXplc1tpXSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0UGFuZVNpemUoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogbnVtYmVyIHtcblx0XHRjb25zdCBwYW5lRm9ySW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbFRvUGFuZS5nZXQoaW5zdGFuY2UpO1xuXHRcdGlmICghcGFuZUZvckluc3RhbmNlKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2NoaWxkcmVuLmluZGV4T2YocGFuZUZvckluc3RhbmNlKTtcblx0XHRyZXR1cm4gdGhpcy5fc3BsaXRWaWV3LmdldFZpZXdTaXplKGluZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgX2FkZENoaWxkKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSwgaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGNoaWxkID0gbmV3IFNwbGl0UGFuZShpbnN0YW5jZSwgdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IHRoaXMuX2hlaWdodCA6IHRoaXMuX3dpZHRoKTtcblx0XHRjaGlsZC5vcmllbnRhdGlvbiA9IHRoaXMub3JpZW50YXRpb247XG5cdFx0aWYgKGlzTnVtYmVyKGluZGV4KSkge1xuXHRcdFx0dGhpcy5fY2hpbGRyZW4uc3BsaWNlKGluZGV4LCAwLCBjaGlsZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NoaWxkcmVuLnB1c2goY2hpbGQpO1xuXHRcdH1cblx0XHR0aGlzLl90ZXJtaW5hbFRvUGFuZS5zZXQoaW5zdGFuY2UsIHRoaXMuX2NoaWxkcmVuW3RoaXMuX2NoaWxkcmVuLmluZGV4T2YoY2hpbGQpXSk7XG5cblx0XHR0aGlzLl93aXRoRGlzYWJsZWRMYXlvdXQoKCkgPT4gdGhpcy5fc3BsaXRWaWV3LmFkZFZpZXcoY2hpbGQsIFNpemluZy5EaXN0cmlidXRlLCBpbmRleCkpO1xuXHRcdHRoaXMubGF5b3V0KHRoaXMuX3dpZHRoLCB0aGlzLl9oZWlnaHQpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UgPSBFdmVudC5hbnkoLi4udGhpcy5fY2hpbGRyZW4ubWFwKGMgPT4gYy5vbkRpZENoYW5nZSkpO1xuXHR9XG5cblx0cmVtb3ZlKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IHZvaWQge1xuXHRcdGxldCBpbmRleDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKHRoaXMuX2NoaWxkcmVuW2ldLmluc3RhbmNlID09PSBpbnN0YW5jZSkge1xuXHRcdFx0XHRpbmRleCA9IGk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChpbmRleCAhPT0gbnVsbCkge1xuXHRcdFx0dGhpcy5fY2hpbGRyZW4uc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsVG9QYW5lLmRlbGV0ZShpbnN0YW5jZSk7XG5cdFx0XHR0aGlzLl9zcGxpdFZpZXcucmVtb3ZlVmlldyhpbmRleCwgU2l6aW5nLkRpc3RyaWJ1dGUpO1xuXHRcdFx0aW5zdGFuY2UuZGV0YWNoRnJvbUVsZW1lbnQoKTtcblx0XHR9XG5cdH1cblxuXHRsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl93aWR0aCA9IHdpZHRoO1xuXHRcdHRoaXMuX2hlaWdodCA9IGhlaWdodDtcblx0XHRpZiAodGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCkge1xuXHRcdFx0dGhpcy5fY2hpbGRyZW4uZm9yRWFjaChjID0+IGMub3J0aG9nb25hbExheW91dChoZWlnaHQpKTtcblx0XHRcdHRoaXMuX3NwbGl0Vmlldy5sYXlvdXQod2lkdGgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jaGlsZHJlbi5mb3JFYWNoKGMgPT4gYy5vcnRob2dvbmFsTGF5b3V0KHdpZHRoKSk7XG5cdFx0XHR0aGlzLl9zcGxpdFZpZXcubGF5b3V0KGhlaWdodCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0T3JpZW50YXRpb24ob3JpZW50YXRpb246IE9yaWVudGF0aW9uKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMub3JpZW50YXRpb24gPT09IG9yaWVudGF0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMub3JpZW50YXRpb24gPSBvcmllbnRhdGlvbjtcblxuXHRcdC8vIFJlbW92ZSBvbGQgc3BsaXQgdmlld1xuXHRcdHdoaWxlICh0aGlzLl9jb250YWluZXIuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fY29udGFpbmVyLmNoaWxkcmVuWzBdLnJlbW92ZSgpO1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBuZXcgc3BsaXQgdmlldyB3aXRoIHVwZGF0ZWQgb3JpZW50YXRpb25cblx0XHR0aGlzLl9jcmVhdGVTcGxpdFZpZXcoKTtcblx0XHR0aGlzLl93aXRoRGlzYWJsZWRMYXlvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY2hpbGRyZW4uZm9yRWFjaChjaGlsZCA9PiB7XG5cdFx0XHRcdGNoaWxkLm9yaWVudGF0aW9uID0gb3JpZW50YXRpb247XG5cdFx0XHRcdHRoaXMuX3NwbGl0Vmlldy5hZGRWaWV3KGNoaWxkLCAxKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2l0aERpc2FibGVkTGF5b3V0KGlubmVyRnVuY3Rpb246ICgpID0+IHZvaWQpOiB2b2lkIHtcblx0XHQvLyBXaGVuZXZlciBtYW5pcHVsYXRpbmcgdmlld3MgdGhhdCBhcmUgZ29pbmcgdG8gYmUgY2hhbmdlZCBpbW1lZGlhdGVseSwgZGlzYWJsaW5nXG5cdFx0Ly8gbGF5b3V0L3Jlc2l6ZSBldmVudHMgaW4gdGhlIHRlcm1pbmFsIHByZXZlbnQgYmFkIGRpbWVuc2lvbnMgZ29pbmcgdG8gdGhlIHB0eS5cblx0XHR0aGlzLl9jaGlsZHJlbi5mb3JFYWNoKGMgPT4gYy5pbnN0YW5jZS5kaXNhYmxlTGF5b3V0ID0gdHJ1ZSk7XG5cdFx0aW5uZXJGdW5jdGlvbigpO1xuXHRcdHRoaXMuX2NoaWxkcmVuLmZvckVhY2goYyA9PiBjLmluc3RhbmNlLmRpc2FibGVMYXlvdXQgPSBmYWxzZSk7XG5cdH1cbn1cblxuY2xhc3MgU3BsaXRQYW5lIGltcGxlbWVudHMgSVZpZXcge1xuXHRtaW5pbXVtU2l6ZTogbnVtYmVyID0gQ29uc3RhbnRzLlNwbGl0UGFuZU1pblNpemU7XG5cdG1heGltdW1TaXplOiBudW1iZXIgPSBOdW1iZXIuTUFYX1ZBTFVFO1xuXG5cdG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZTogRXZlbnQ8bnVtYmVyIHwgdW5kZWZpbmVkPiA9IEV2ZW50Lk5vbmU7XG5cdGdldCBvbkRpZENoYW5nZSgpOiBFdmVudDxudW1iZXIgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlOyB9XG5cblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlLFxuXHRcdHB1YmxpYyBvcnRob2dvbmFsU2l6ZTogbnVtYmVyXG5cdCkge1xuXHRcdHRoaXMuZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc05hbWUgPSAndGVybWluYWwtc3BsaXQtcGFuZSc7XG5cdFx0dGhpcy5pbnN0YW5jZS5hdHRhY2hUb0VsZW1lbnQodGhpcy5lbGVtZW50KTtcblx0fVxuXG5cdGxheW91dChzaXplOiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBPbmx5IGxheW91dCB3aGVuIGJvdGggc2l6ZXMgYXJlIGtub3duXG5cdFx0aWYgKCFzaXplIHx8ICF0aGlzLm9ydGhvZ29uYWxTaXplKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMKSB7XG5cdFx0XHR0aGlzLmluc3RhbmNlLmxheW91dCh7IHdpZHRoOiB0aGlzLm9ydGhvZ29uYWxTaXplLCBoZWlnaHQ6IHNpemUgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuaW5zdGFuY2UubGF5b3V0KHsgd2lkdGg6IHNpemUsIGhlaWdodDogdGhpcy5vcnRob2dvbmFsU2l6ZSB9KTtcblx0XHR9XG5cdH1cblxuXHRvcnRob2dvbmFsTGF5b3V0KHNpemU6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMub3J0aG9nb25hbFNpemUgPSBzaXplO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbEdyb3VwIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXJtaW5hbEdyb3VwIHtcblx0cHJpdmF0ZSBfdGVybWluYWxJbnN0YW5jZXM6IElUZXJtaW5hbEluc3RhbmNlW10gPSBbXTtcblx0cHJpdmF0ZSBfc3BsaXRQYW5lQ29udGFpbmVyOiBTcGxpdFBhbmVDb250YWluZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2dyb3VwRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3BhbmVsUG9zaXRpb246IFBvc2l0aW9uID0gUG9zaXRpb24uQk9UVE9NO1xuXHRwcml2YXRlIF90ZXJtaW5hbExvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gPSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWw7XG5cdHByaXZhdGUgX2luc3RhbmNlRGlzcG9zYWJsZXM6IE1hcDxudW1iZXIsIElEaXNwb3NhYmxlW10+ID0gbmV3IE1hcCgpO1xuXG5cdHByaXZhdGUgX2FjdGl2ZUluc3RhbmNlSW5kZXg6IG51bWJlciA9IC0xO1xuXG5cdGdldCB0ZXJtaW5hbEluc3RhbmNlcygpOiBJVGVybWluYWxJbnN0YW5jZVtdIHsgcmV0dXJuIHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzOyB9XG5cblx0cHJpdmF0ZSBfaGFkRm9jdXNPbkV4aXQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0Z2V0IGhhZEZvY3VzT25FeGl0KCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faGFkRm9jdXNPbkV4aXQ7IH1cblxuXHRwcml2YXRlIF9pbml0aWFsUmVsYXRpdmVTaXplczogbnVtYmVyW10gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Zpc2libGU6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc3Bvc2VJbnN0YW5jZTogRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzcG9zZUluc3RhbmNlID0gdGhpcy5fb25EaWREaXNwb3NlSW5zdGFuY2UuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRm9jdXNJbnN0YW5jZTogRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXNJbnN0YW5jZSA9IHRoaXMuX29uRGlkRm9jdXNJbnN0YW5jZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VJbnN0YW5jZUNhcGFiaWxpdHk6IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUluc3RhbmNlQ2FwYWJpbGl0eSA9IHRoaXMuX29uRGlkQ2hhbmdlSW5zdGFuY2VDYXBhYmlsaXR5LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpc3Bvc2VkOiBFbWl0dGVyPElUZXJtaW5hbEdyb3VwPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEdyb3VwPigpKTtcblx0cmVhZG9ubHkgb25EaXNwb3NlZCA9IHRoaXMuX29uRGlzcG9zZWQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uSW5zdGFuY2VzQ2hhbmdlZDogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkluc3RhbmNlc0NoYW5nZWQgPSB0aGlzLl9vbkluc3RhbmNlc0NoYW5nZWQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UgPSB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUluc3RhbmNlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblBhbmVsT3JpZW50YXRpb25DaGFuZ2VkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8T3JpZW50YXRpb24+KCkpO1xuXHRyZWFkb25seSBvblBhbmVsT3JpZW50YXRpb25DaGFuZ2VkID0gdGhpcy5fb25QYW5lbE9yaWVudGF0aW9uQ2hhbmdlZC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9jb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkLFxuXHRcdHNoZWxsTGF1bmNoQ29uZmlnT3JJbnN0YW5jZTogSVNoZWxsTGF1bmNoQ29uZmlnIHwgSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQsXG5cdFx0QElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxJbnN0YW5jZVNlcnZpY2U6IElUZXJtaW5hbEluc3RhbmNlU2VydmljZSxcblx0XHRASVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wYW5lQ29tcG9zaXRlUGFydFNlcnZpY2U6IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRpZiAoc2hlbGxMYXVuY2hDb25maWdPckluc3RhbmNlKSB7XG5cdFx0XHR0aGlzLmFkZEluc3RhbmNlKHNoZWxsTGF1bmNoQ29uZmlnT3JJbnN0YW5jZSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jb250YWluZXIpIHtcblx0XHRcdHRoaXMuYXR0YWNoVG9FbGVtZW50KHRoaXMuX2NvbnRhaW5lcik7XG5cdFx0fVxuXHRcdHRoaXMuX29uUGFuZWxPcmllbnRhdGlvbkNoYW5nZWQuZmlyZSh0aGlzLl90ZXJtaW5hbExvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwgJiYgaXNIb3Jpem9udGFsKHRoaXMuX3BhbmVsUG9zaXRpb24pID8gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA6IE9yaWVudGF0aW9uLlZFUlRJQ0FMKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2NvbnRhaW5lciAmJiB0aGlzLl9ncm91cEVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5fZ3JvdXBFbGVtZW50LnJlbW92ZSgpO1xuXHRcdFx0XHR0aGlzLl9ncm91cEVsZW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0YWRkSW5zdGFuY2Uoc2hlbGxMYXVuY2hDb25maWdPckluc3RhbmNlOiBJU2hlbGxMYXVuY2hDb25maWcgfCBJVGVybWluYWxJbnN0YW5jZSwgcGFyZW50VGVybWluYWxJZD86IG51bWJlcik6IHZvaWQge1xuXHRcdGxldCBpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2U7XG5cdFx0Ly8gaWYgYSBwYXJlbnQgdGVybWluYWwgaXMgcHJvdmlkZWQsIGZpbmQgaXRcblx0XHQvLyBvdGhlcndpc2UsIHBhcmVudCBpcyB0aGUgYWN0aXZlIHRlcm1pbmFsXG5cdFx0Y29uc3QgcGFyZW50SW5kZXggPSBwYXJlbnRUZXJtaW5hbElkID8gdGhpcy5fdGVybWluYWxJbnN0YW5jZXMuZmluZEluZGV4KHQgPT4gdC5pbnN0YW5jZUlkID09PSBwYXJlbnRUZXJtaW5hbElkKSA6IHRoaXMuX2FjdGl2ZUluc3RhbmNlSW5kZXg7XG5cdFx0aWYgKGhhc0tleShzaGVsbExhdW5jaENvbmZpZ09ySW5zdGFuY2UsIHsgaW5zdGFuY2VJZDogdHJ1ZSB9KSkge1xuXHRcdFx0aW5zdGFuY2UgPSBzaGVsbExhdW5jaENvbmZpZ09ySW5zdGFuY2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGluc3RhbmNlID0gdGhpcy5fdGVybWluYWxJbnN0YW5jZVNlcnZpY2UuY3JlYXRlSW5zdGFuY2Uoc2hlbGxMYXVuY2hDb25maWdPckluc3RhbmNlLCBUZXJtaW5hbExvY2F0aW9uLlBhbmVsKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fdGVybWluYWxJbnN0YW5jZXMucHVzaChpbnN0YW5jZSk7XG5cdFx0XHR0aGlzLl9hY3RpdmVJbnN0YW5jZUluZGV4ID0gMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdGVybWluYWxJbnN0YW5jZXMuc3BsaWNlKHBhcmVudEluZGV4ICsgMSwgMCwgaW5zdGFuY2UpO1xuXHRcdH1cblx0XHR0aGlzLl9pbml0SW5zdGFuY2VMaXN0ZW5lcnMoaW5zdGFuY2UpO1xuXG5cdFx0aWYgKHRoaXMuX3NwbGl0UGFuZUNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5fc3BsaXRQYW5lQ29udGFpbmVyLnNwbGl0KGluc3RhbmNlLCBwYXJlbnRJbmRleCArIDEpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uSW5zdGFuY2VzQ2hhbmdlZC5maXJlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzID0gW107XG5cdFx0dGhpcy5fb25JbnN0YW5jZXNDaGFuZ2VkLmZpcmUoKTtcblx0XHR0aGlzLl9zcGxpdFBhbmVDb250YWluZXI/LmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRnZXQgYWN0aXZlSW5zdGFuY2UoKTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl90ZXJtaW5hbEluc3RhbmNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbEluc3RhbmNlc1t0aGlzLl9hY3RpdmVJbnN0YW5jZUluZGV4XTtcblx0fVxuXG5cdGdldExheW91dEluZm8oaXNBY3RpdmU6IGJvb2xlYW4pOiBJVGVybWluYWxUYWJMYXlvdXRJbmZvQnlJZCB7XG5cdFx0Y29uc3QgaW5zdGFuY2VzID0gdGhpcy50ZXJtaW5hbEluc3RhbmNlcy5maWx0ZXIoaW5zdGFuY2UgPT4gaXNOdW1iZXIoaW5zdGFuY2UucGVyc2lzdGVudFByb2Nlc3NJZCkgJiYgaW5zdGFuY2Uuc2hvdWxkUGVyc2lzdCk7XG5cdFx0Y29uc3QgdG90YWxTaXplID0gaW5zdGFuY2VzLm1hcCh0ID0+IHRoaXMuX3NwbGl0UGFuZUNvbnRhaW5lcj8uZ2V0UGFuZVNpemUodCkgfHwgMCkucmVkdWNlKCh0b3RhbCwgc2l6ZSkgPT4gdG90YWwgKz0gc2l6ZSwgMCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlzQWN0aXZlOiBpc0FjdGl2ZSxcblx0XHRcdGFjdGl2ZVBlcnNpc3RlbnRQcm9jZXNzSWQ6IHRoaXMuYWN0aXZlSW5zdGFuY2UgPyB0aGlzLmFjdGl2ZUluc3RhbmNlLnBlcnNpc3RlbnRQcm9jZXNzSWQgOiB1bmRlZmluZWQsXG5cdFx0XHR0ZXJtaW5hbHM6IGluc3RhbmNlcy5tYXAodCA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cmVsYXRpdmVTaXplOiB0b3RhbFNpemUgPiAwID8gdGhpcy5fc3BsaXRQYW5lQ29udGFpbmVyIS5nZXRQYW5lU2l6ZSh0KSAvIHRvdGFsU2l6ZSA6IDAsXG5cdFx0XHRcdFx0dGVybWluYWw6IHQucGVyc2lzdGVudFByb2Nlc3NJZCB8fCAwXG5cdFx0XHRcdH07XG5cdFx0XHR9KVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9pbml0SW5zdGFuY2VMaXN0ZW5lcnMoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKSB7XG5cdFx0dGhpcy5faW5zdGFuY2VEaXNwb3NhYmxlcy5zZXQoaW5zdGFuY2UuaW5zdGFuY2VJZCwgW1xuXHRcdFx0aW5zdGFuY2Uub25EaXNwb3NlZChpbnN0YW5jZSA9PiB7XG5cdFx0XHRcdHRoaXMuX29uRGlkRGlzcG9zZUluc3RhbmNlLmZpcmUoaW5zdGFuY2UpO1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVPbkRpZERpc3Bvc2VJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0XHR9KSxcblx0XHRcdGluc3RhbmNlLm9uRGlkRm9jdXMoaW5zdGFuY2UgPT4ge1xuXHRcdFx0XHR0aGlzLl9zZXRBY3RpdmVJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0XHRcdHRoaXMuX29uRGlkRm9jdXNJbnN0YW5jZS5maXJlKGluc3RhbmNlKTtcblx0XHRcdH0pLFxuXHRcdFx0aW5zdGFuY2UuY2FwYWJpbGl0aWVzLm9uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlSW5zdGFuY2VDYXBhYmlsaXR5LmZpcmUoaW5zdGFuY2UpKSxcblx0XHRdKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZU9uRGlkRGlzcG9zZUluc3RhbmNlKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSkge1xuXHRcdHRoaXMuX3JlbW92ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0fVxuXG5cdHJlbW92ZUluc3RhbmNlKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSkge1xuXHRcdHRoaXMuX3JlbW92ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZUluc3RhbmNlKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSkge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fdGVybWluYWxJbnN0YW5jZXMuaW5kZXhPZihpbnN0YW5jZSk7XG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdhc0FjdGl2ZUluc3RhbmNlID0gaW5zdGFuY2UgPT09IHRoaXMuYWN0aXZlSW5zdGFuY2U7XG5cdFx0dGhpcy5fdGVybWluYWxJbnN0YW5jZXMuc3BsaWNlKGluZGV4LCAxKTtcblxuXHRcdC8vIEFkanVzdCBmb2N1cyBpZiB0aGUgaW5zdGFuY2Ugd2FzIGFjdGl2ZVxuXHRcdGlmICh3YXNBY3RpdmVJbnN0YW5jZSAmJiB0aGlzLl90ZXJtaW5hbEluc3RhbmNlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBuZXdJbmRleCA9IGluZGV4IDwgdGhpcy5fdGVybWluYWxJbnN0YW5jZXMubGVuZ3RoID8gaW5kZXggOiB0aGlzLl90ZXJtaW5hbEluc3RhbmNlcy5sZW5ndGggLSAxO1xuXHRcdFx0dGhpcy5zZXRBY3RpdmVJbnN0YW5jZUJ5SW5kZXgobmV3SW5kZXgpO1xuXHRcdFx0Ly8gVE9ETzogT25seSBmb2N1cyB0aGUgbmV3IGluc3RhbmNlIGlmIHRoZSBncm91cCBoYWQgZm9jdXM/XG5cdFx0XHR0aGlzLmFjdGl2ZUluc3RhbmNlPy5mb2N1cyh0cnVlKTtcblx0XHR9IGVsc2UgaWYgKGluZGV4IDwgdGhpcy5fYWN0aXZlSW5zdGFuY2VJbmRleCkge1xuXHRcdFx0Ly8gQWRqdXN0IGFjdGl2ZSBpbnN0YW5jZSBpbmRleCBpZiBuZWVkZWRcblx0XHRcdHRoaXMuX2FjdGl2ZUluc3RhbmNlSW5kZXgtLTtcblx0XHR9XG5cblx0XHR0aGlzLl9zcGxpdFBhbmVDb250YWluZXI/LnJlbW92ZShpbnN0YW5jZSk7XG5cblx0XHQvLyBGaXJlIGV2ZW50cyBhbmQgZGlzcG9zZSBncm91cCBpZiBpdCB3YXMgdGhlIGxhc3QgaW5zdGFuY2Vcblx0XHRpZiAodGhpcy5fdGVybWluYWxJbnN0YW5jZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9oYWRGb2N1c09uRXhpdCA9IGluc3RhbmNlLmhhZEZvY3VzT25FeGl0O1xuXHRcdFx0dGhpcy5fb25EaXNwb3NlZC5maXJlKHRoaXMpO1xuXHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX29uSW5zdGFuY2VzQ2hhbmdlZC5maXJlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRGlzcG9zZSBpbnN0YW5jZSBldmVudCBsaXN0ZW5lcnNcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IHRoaXMuX2luc3RhbmNlRGlzcG9zYWJsZXMuZ2V0KGluc3RhbmNlLmluc3RhbmNlSWQpO1xuXHRcdGlmIChkaXNwb3NhYmxlcykge1xuXHRcdFx0ZGlzcG9zZShkaXNwb3NhYmxlcyk7XG5cdFx0XHR0aGlzLl9pbnN0YW5jZURpc3Bvc2FibGVzLmRlbGV0ZShpbnN0YW5jZS5pbnN0YW5jZUlkKTtcblx0XHR9XG5cdH1cblxuXHRtb3ZlSW5zdGFuY2UoaW5zdGFuY2VzOiBTaW5nbGVPck1hbnk8SVRlcm1pbmFsSW5zdGFuY2U+LCBpbmRleDogbnVtYmVyLCBwb3NpdGlvbjogJ2JlZm9yZScgfCAnYWZ0ZXInKTogdm9pZCB7XG5cdFx0aW5zdGFuY2VzID0gYXNBcnJheShpbnN0YW5jZXMpO1xuXHRcdGNvbnN0IGhhc0ludmFsaWRJbnN0YW5jZSA9IGluc3RhbmNlcy5zb21lKGluc3RhbmNlID0+ICF0aGlzLnRlcm1pbmFsSW5zdGFuY2VzLmluY2x1ZGVzKGluc3RhbmNlKSk7XG5cdFx0aWYgKGhhc0ludmFsaWRJbnN0YW5jZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpbnNlcnRJbmRleCA9IHBvc2l0aW9uID09PSAnYmVmb3JlJyA/IGluZGV4IDogaW5kZXggKyAxO1xuXHRcdHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzLnNwbGljZShpbnNlcnRJbmRleCwgMCwgLi4uaW5zdGFuY2VzKTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaW5zdGFuY2VzKSB7XG5cdFx0XHRjb25zdCBvcmlnaW5Tb3VyY2VHcm91cEluZGV4ID0gcG9zaXRpb24gPT09ICdhZnRlcicgPyB0aGlzLl90ZXJtaW5hbEluc3RhbmNlcy5pbmRleE9mKGl0ZW0pIDogdGhpcy5fdGVybWluYWxJbnN0YW5jZXMubGFzdEluZGV4T2YoaXRlbSk7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbEluc3RhbmNlcy5zcGxpY2Uob3JpZ2luU291cmNlR3JvdXBJbmRleCwgMSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zcGxpdFBhbmVDb250YWluZXIpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaW5zdGFuY2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSBpbnN0YW5jZXNbaV07XG5cdFx0XHRcdHRoaXMuX3NwbGl0UGFuZUNvbnRhaW5lci5yZW1vdmUoaXRlbSk7XG5cdFx0XHRcdHRoaXMuX3NwbGl0UGFuZUNvbnRhaW5lci5zcGxpdChpdGVtLCBpbmRleCArIChwb3NpdGlvbiA9PT0gJ2JlZm9yZScgPyBpIDogMCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9vbkluc3RhbmNlc0NoYW5nZWQuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKSB7XG5cdFx0dGhpcy5zZXRBY3RpdmVJbnN0YW5jZUJ5SW5kZXgodGhpcy5fZ2V0SW5kZXhGcm9tSWQoaW5zdGFuY2UuaW5zdGFuY2VJZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0SW5kZXhGcm9tSWQodGVybWluYWxJZDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRsZXQgdGVybWluYWxJbmRleCA9IC0xO1xuXHRcdHRoaXMudGVybWluYWxJbnN0YW5jZXMuZm9yRWFjaCgodGVybWluYWxJbnN0YW5jZSwgaSkgPT4ge1xuXHRcdFx0aWYgKHRlcm1pbmFsSW5zdGFuY2UuaW5zdGFuY2VJZCA9PT0gdGVybWluYWxJZCkge1xuXHRcdFx0XHR0ZXJtaW5hbEluZGV4ID0gaTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpZiAodGVybWluYWxJbmRleCA9PT0gLTEpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVGVybWluYWwgd2l0aCBJRCAke3Rlcm1pbmFsSWR9IGRvZXMgbm90IGV4aXN0IChoYXMgaXQgYWxyZWFkeSBiZWVuIGRpc3Bvc2VkPylgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRlcm1pbmFsSW5kZXg7XG5cdH1cblxuXHRzZXRBY3RpdmVJbnN0YW5jZUJ5SW5kZXgoaW5kZXg6IG51bWJlciwgZm9yY2U/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Ly8gQ2hlY2sgZm9yIGludmFsaWQgdmFsdWVcblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9sZEFjdGl2ZUluc3RhbmNlID0gdGhpcy5hY3RpdmVJbnN0YW5jZTtcblx0XHR0aGlzLl9hY3RpdmVJbnN0YW5jZUluZGV4ID0gaW5kZXg7XG5cdFx0aWYgKG9sZEFjdGl2ZUluc3RhbmNlICE9PSB0aGlzLmFjdGl2ZUluc3RhbmNlIHx8IGZvcmNlKSB7XG5cdFx0XHR0aGlzLl9vbkluc3RhbmNlc0NoYW5nZWQuZmlyZSgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVJbnN0YW5jZS5maXJlKHRoaXMuYWN0aXZlSW5zdGFuY2UpO1xuXHRcdH1cblx0fVxuXG5cdGF0dGFjaFRvRWxlbWVudChlbGVtZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRhaW5lciA9IGVsZW1lbnQ7XG5cblx0XHQvLyBJZiB3ZSBhbHJlYWR5IGhhdmUgYSBncm91cCBlbGVtZW50LCB3ZSBjYW4gcmVwYXJlbnQgaXRcblx0XHRpZiAoIXRoaXMuX2dyb3VwRWxlbWVudCkge1xuXHRcdFx0dGhpcy5fZ3JvdXBFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHR0aGlzLl9ncm91cEVsZW1lbnQuY2xhc3NMaXN0LmFkZCgndGVybWluYWwtZ3JvdXAnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fZ3JvdXBFbGVtZW50KTtcblx0XHRpZiAoIXRoaXMuX3NwbGl0UGFuZUNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5fcGFuZWxQb3NpdGlvbiA9IHRoaXMuX2xheW91dFNlcnZpY2UuZ2V0UGFuZWxQb3NpdGlvbigpO1xuXHRcdFx0dGhpcy5fdGVybWluYWxMb2NhdGlvbiA9IHRoaXMuX3ZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKFRFUk1JTkFMX1ZJRVdfSUQpITtcblx0XHRcdGNvbnN0IG9yaWVudGF0aW9uID0gdGhpcy5fdGVybWluYWxMb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsICYmIGlzSG9yaXpvbnRhbCh0aGlzLl9wYW5lbFBvc2l0aW9uKSA/IE9yaWVudGF0aW9uLkhPUklaT05UQUwgOiBPcmllbnRhdGlvbi5WRVJUSUNBTDtcblx0XHRcdHRoaXMuX3NwbGl0UGFuZUNvbnRhaW5lciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNwbGl0UGFuZUNvbnRhaW5lciwgdGhpcy5fZ3JvdXBFbGVtZW50LCBvcmllbnRhdGlvbik7XG5cdFx0XHR0aGlzLnRlcm1pbmFsSW5zdGFuY2VzLmZvckVhY2goaW5zdGFuY2UgPT4gdGhpcy5fc3BsaXRQYW5lQ29udGFpbmVyIS5zcGxpdChpbnN0YW5jZSwgdGhpcy5fYWN0aXZlSW5zdGFuY2VJbmRleCArIDEpKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgdGl0bGUoKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5fdGVybWluYWxJbnN0YW5jZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBOb3JtYWxseSBjb25zdW1lcnMgc2hvdWxkIG5vdCBjYWxsIGludG8gdGl0bGUgYXQgYWxsIGFmdGVyIHRoZSBncm91cCBpcyBkaXNwb3NlZCBidXRcblx0XHRcdC8vIHRoaXMgaXMgcmVxdWlyZWQgd2hlbiB0aGUgZ3JvdXAgaXMgdXNlZCBhcyBwYXJ0IG9mIGEgdHJlZS5cblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0bGV0IHRpdGxlID0gdGhpcy50ZXJtaW5hbEluc3RhbmNlc1swXS50aXRsZSArIHRoaXMuX2dldEJlbGxUaXRsZSh0aGlzLnRlcm1pbmFsSW5zdGFuY2VzWzBdKTtcblx0XHRpZiAodGhpcy50ZXJtaW5hbEluc3RhbmNlc1swXS5kZXNjcmlwdGlvbikge1xuXHRcdFx0dGl0bGUgKz0gYCAoJHt0aGlzLnRlcm1pbmFsSW5zdGFuY2VzWzBdLmRlc2NyaXB0aW9ufSlgO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IHRoaXMudGVybWluYWxJbnN0YW5jZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy50ZXJtaW5hbEluc3RhbmNlc1tpXTtcblx0XHRcdGlmIChpbnN0YW5jZS50aXRsZSkge1xuXHRcdFx0XHR0aXRsZSArPSBgLCAke2luc3RhbmNlLnRpdGxlICsgdGhpcy5fZ2V0QmVsbFRpdGxlKGluc3RhbmNlKX1gO1xuXHRcdFx0XHRpZiAoaW5zdGFuY2UuZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHR0aXRsZSArPSBgICgke2luc3RhbmNlLmRlc2NyaXB0aW9ufSlgO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aXRsZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEJlbGxUaXRsZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpIHtcblx0XHRpZiAodGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuZW5hYmxlQmVsbCAmJiBpbnN0YW5jZS5zdGF0dXNMaXN0LnN0YXR1c2VzLnNvbWUoZSA9PiBlLmlkID09PSBUZXJtaW5hbFN0YXR1cy5CZWxsKSkge1xuXHRcdFx0cmV0dXJuICcqJztcblx0XHR9XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0c2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlzaWJsZSA9IHZpc2libGU7XG5cdFx0aWYgKHRoaXMuX2dyb3VwRWxlbWVudCkge1xuXHRcdFx0dGhpcy5fZ3JvdXBFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSB2aXNpYmxlID8gJycgOiAnbm9uZSc7XG5cdFx0fVxuXHRcdHRoaXMudGVybWluYWxJbnN0YW5jZXMuZm9yRWFjaChpID0+IGkuc2V0VmlzaWJsZSh2aXNpYmxlKSk7XG5cdH1cblxuXHRzcGxpdChzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnKTogSVRlcm1pbmFsSW5zdGFuY2Uge1xuXHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy5fdGVybWluYWxJbnN0YW5jZVNlcnZpY2UuY3JlYXRlSW5zdGFuY2Uoc2hlbGxMYXVuY2hDb25maWcsIFRlcm1pbmFsTG9jYXRpb24uUGFuZWwpO1xuXHRcdHRoaXMuYWRkSW5zdGFuY2UoaW5zdGFuY2UsIHNoZWxsTGF1bmNoQ29uZmlnLnBhcmVudFRlcm1pbmFsSWQpO1xuXHRcdHRoaXMuX3NldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRyZXR1cm4gaW5zdGFuY2U7XG5cdH1cblxuXHRhZGREaXNwb3NhYmxlKGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZSk7XG5cdH1cblxuXHRsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3BsaXRQYW5lQ29udGFpbmVyKSB7XG5cdFx0XHQvLyBDaGVjayBpZiB0aGUgcGFuZWwgcG9zaXRpb24gY2hhbmdlZCBhbmQgcm90YXRlIHBhbmVzIGlmIHNvXG5cdFx0XHRjb25zdCBuZXdQYW5lbFBvc2l0aW9uID0gdGhpcy5fbGF5b3V0U2VydmljZS5nZXRQYW5lbFBvc2l0aW9uKCk7XG5cdFx0XHRjb25zdCBuZXdUZXJtaW5hbExvY2F0aW9uID0gdGhpcy5fdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdMb2NhdGlvbkJ5SWQoVEVSTUlOQUxfVklFV19JRCkhO1xuXHRcdFx0Y29uc3QgdGVybWluYWxQb3NpdGlvbkNoYW5nZWQgPSBuZXdQYW5lbFBvc2l0aW9uICE9PSB0aGlzLl9wYW5lbFBvc2l0aW9uIHx8IG5ld1Rlcm1pbmFsTG9jYXRpb24gIT09IHRoaXMuX3Rlcm1pbmFsTG9jYXRpb247XG5cdFx0XHRpZiAodGVybWluYWxQb3NpdGlvbkNoYW5nZWQpIHtcblx0XHRcdFx0Y29uc3QgbmV3T3JpZW50YXRpb24gPSBuZXdUZXJtaW5hbExvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwgJiYgaXNIb3Jpem9udGFsKG5ld1BhbmVsUG9zaXRpb24pID8gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA6IE9yaWVudGF0aW9uLlZFUlRJQ0FMO1xuXHRcdFx0XHR0aGlzLl9zcGxpdFBhbmVDb250YWluZXIuc2V0T3JpZW50YXRpb24obmV3T3JpZW50YXRpb24pO1xuXHRcdFx0XHR0aGlzLl9wYW5lbFBvc2l0aW9uID0gbmV3UGFuZWxQb3NpdGlvbjtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxMb2NhdGlvbiA9IG5ld1Rlcm1pbmFsTG9jYXRpb247XG5cdFx0XHRcdHRoaXMuX29uUGFuZWxPcmllbnRhdGlvbkNoYW5nZWQuZmlyZSh0aGlzLl9zcGxpdFBhbmVDb250YWluZXIub3JpZW50YXRpb24pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc3BsaXRQYW5lQ29udGFpbmVyLmxheW91dCh3aWR0aCwgaGVpZ2h0KTtcblx0XHRcdGlmICh0aGlzLl9pbml0aWFsUmVsYXRpdmVTaXplcyAmJiB0aGlzLl92aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMucmVzaXplUGFuZXModGhpcy5faW5pdGlhbFJlbGF0aXZlU2l6ZXMpO1xuXHRcdFx0XHR0aGlzLl9pbml0aWFsUmVsYXRpdmVTaXplcyA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRmb2N1c1ByZXZpb3VzUGFuZSgpOiB2b2lkIHtcblx0XHRjb25zdCBuZXdJbmRleCA9IHRoaXMuX2FjdGl2ZUluc3RhbmNlSW5kZXggPT09IDAgPyB0aGlzLl90ZXJtaW5hbEluc3RhbmNlcy5sZW5ndGggLSAxIDogdGhpcy5fYWN0aXZlSW5zdGFuY2VJbmRleCAtIDE7XG5cdFx0dGhpcy5zZXRBY3RpdmVJbnN0YW5jZUJ5SW5kZXgobmV3SW5kZXgpO1xuXHR9XG5cblx0Zm9jdXNOZXh0UGFuZSgpOiB2b2lkIHtcblx0XHRjb25zdCBuZXdJbmRleCA9IHRoaXMuX2FjdGl2ZUluc3RhbmNlSW5kZXggPT09IHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aCAtIDEgPyAwIDogdGhpcy5fYWN0aXZlSW5zdGFuY2VJbmRleCArIDE7XG5cdFx0dGhpcy5zZXRBY3RpdmVJbnN0YW5jZUJ5SW5kZXgobmV3SW5kZXgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UG9zaXRpb24oKTogUG9zaXRpb24ge1xuXHRcdHN3aXRjaCAodGhpcy5fdGVybWluYWxMb2NhdGlvbikge1xuXHRcdFx0Y2FzZSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWw6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wYW5lbFBvc2l0aW9uO1xuXHRcdFx0Y2FzZSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcjpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2xheW91dFNlcnZpY2UuZ2V0U2lkZUJhclBvc2l0aW9uKCk7XG5cdFx0XHRjYXNlIFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXI6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9sYXlvdXRTZXJ2aWNlLmdldFNpZGVCYXJQb3NpdGlvbigpID09PSBQb3NpdGlvbi5MRUZUID8gUG9zaXRpb24uUklHSFQgOiBQb3NpdGlvbi5MRUZUO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3BhbmVsUG9zaXRpb247XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0T3JpZW50YXRpb24oKTogT3JpZW50YXRpb24ge1xuXHRcdHJldHVybiBpc0hvcml6b250YWwodGhpcy5fZ2V0UG9zaXRpb24oKSkgPyBPcmllbnRhdGlvbi5IT1JJWk9OVEFMIDogT3JpZW50YXRpb24uVkVSVElDQUw7XG5cdH1cblxuXHRyZXNpemVQYW5lKGRpcmVjdGlvbjogRGlyZWN0aW9uKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zcGxpdFBhbmVDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc0hvcml6b250YWxSZXNpemUgPSAoZGlyZWN0aW9uID09PSBEaXJlY3Rpb24uTGVmdCB8fCBkaXJlY3Rpb24gPT09IERpcmVjdGlvbi5SaWdodCk7XG5cblx0XHRjb25zdCBncm91cE9yaWVudGF0aW9uID0gdGhpcy5fZ2V0T3JpZW50YXRpb24oKTtcblxuXHRcdGNvbnN0IHNob3VsZFJlc2l6ZVBhcnQgPVxuXHRcdFx0KGlzSG9yaXpvbnRhbFJlc2l6ZSAmJiBncm91cE9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCkgfHxcblx0XHRcdCghaXNIb3Jpem9udGFsUmVzaXplICYmIGdyb3VwT3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwpO1xuXG5cdFx0Y29uc3QgZm9udCA9IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Rm9udChnZXRXaW5kb3codGhpcy5fZ3JvdXBFbGVtZW50KSk7XG5cdFx0Ly8gVE9ETzogU3VwcG9ydCBsZXR0ZXIgc3BhY2luZyBhbmQgbGluZSBoZWlnaHRcblx0XHRjb25zdCBjaGFyU2l6ZSA9IChpc0hvcml6b250YWxSZXNpemUgPyBmb250LmNoYXJXaWR0aCA6IGZvbnQuY2hhckhlaWdodCk7XG5cblx0XHRpZiAoY2hhclNpemUpIHtcblx0XHRcdGxldCByZXNpemVBbW91bnQgPSBjaGFyU2l6ZSAqIENvbnN0YW50cy5SZXNpemVQYXJ0Q2VsbENvdW50O1xuXG5cdFx0XHRpZiAoc2hvdWxkUmVzaXplUGFydCkge1xuXG5cdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fZ2V0UG9zaXRpb24oKTtcblx0XHRcdFx0Y29uc3Qgc2hvdWxkU2hyaW5rID1cblx0XHRcdFx0XHQocG9zaXRpb24gPT09IFBvc2l0aW9uLkxFRlQgJiYgZGlyZWN0aW9uID09PSBEaXJlY3Rpb24uTGVmdCkgfHxcblx0XHRcdFx0XHQocG9zaXRpb24gPT09IFBvc2l0aW9uLlJJR0hUICYmIGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLlJpZ2h0KSB8fFxuXHRcdFx0XHRcdChwb3NpdGlvbiA9PT0gUG9zaXRpb24uQk9UVE9NICYmIGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLkRvd24pIHx8XG5cdFx0XHRcdFx0KHBvc2l0aW9uID09PSBQb3NpdGlvbi5UT1AgJiYgZGlyZWN0aW9uID09PSBEaXJlY3Rpb24uVXApO1xuXG5cdFx0XHRcdGlmIChzaG91bGRTaHJpbmspIHtcblx0XHRcdFx0XHRyZXNpemVBbW91bnQgKj0gLTE7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLnJlc2l6ZVBhcnQodGhpcy5fcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLmdldFBhcnRJZCh0aGlzLl90ZXJtaW5hbExvY2F0aW9uKSwgcmVzaXplQW1vdW50LCByZXNpemVBbW91bnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fc3BsaXRQYW5lQ29udGFpbmVyLnJlc2l6ZVBhbmUodGhpcy5fYWN0aXZlSW5zdGFuY2VJbmRleCwgZGlyZWN0aW9uLCByZXNpemVBbW91bnQpO1xuXHRcdFx0fVxuXG5cdFx0fVxuXHR9XG5cblx0cmVzaXplUGFuZXMocmVsYXRpdmVTaXplczogbnVtYmVyW10pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3NwbGl0UGFuZUNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5faW5pdGlhbFJlbGF0aXZlU2l6ZXMgPSByZWxhdGl2ZVNpemVzO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NwbGl0UGFuZUNvbnRhaW5lci5yZXNpemVQYW5lcyhyZWxhdGl2ZVNpemVzKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLE9BQU8sZUFBZTtBQUMvQixTQUFzQixZQUFZLGlCQUFpQixTQUFTLG9CQUFvQjtBQUNoRixTQUFTLFdBQVcsYUFBb0IsY0FBYztBQUN0RCxTQUFTLGNBQWMseUJBQXlCLGdCQUFnQjtBQUNoRSxTQUFTLDZCQUE2QjtBQUN0QyxTQUE0QixXQUEyQiwwQkFBMEIscUNBQXFDO0FBQ3RILFNBQVMsdUJBQXVC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
