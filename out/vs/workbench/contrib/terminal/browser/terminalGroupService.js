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
import { timeout } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { TerminalGroup } from "./terminalGroup.js";
import { getInstanceFromResource } from "./terminalUri.js";
import { TERMINAL_VIEW_ID } from "../common/terminal.js";
import { TerminalContextKeys } from "../common/terminalContextKey.js";
import { asArray } from "../../../../base/common/arrays.js";
let TerminalGroupService = class extends Disposable {
  constructor(_contextKeyService, _instantiationService, _viewsService, _viewDescriptorService, _quickInputService) {
    super();
    this._contextKeyService = _contextKeyService;
    this._instantiationService = _instantiationService;
    this._viewsService = _viewsService;
    this._viewDescriptorService = _viewDescriptorService;
    this._quickInputService = _quickInputService;
    this.groups = [];
    this.activeGroupIndex = -1;
    this.lastAccessedMenu = "inline-tab";
    this._isQuickInputOpened = false;
    this._onDidChangeActiveGroup = this._register(new Emitter());
    this.onDidChangeActiveGroup = this._onDidChangeActiveGroup.event;
    this._onDidDisposeGroup = this._register(new Emitter());
    this.onDidDisposeGroup = this._onDidDisposeGroup.event;
    this._onDidChangeGroups = this._register(new Emitter());
    this.onDidChangeGroups = this._onDidChangeGroups.event;
    this._onDidShow = this._register(new Emitter());
    this.onDidShow = this._onDidShow.event;
    this._onDidDisposeInstance = this._register(new Emitter());
    this.onDidDisposeInstance = this._onDidDisposeInstance.event;
    this._onDidFocusInstance = this._register(new Emitter());
    this.onDidFocusInstance = this._onDidFocusInstance.event;
    this._onDidChangeActiveInstance = this._register(new Emitter());
    this.onDidChangeActiveInstance = this._onDidChangeActiveInstance.event;
    this._onDidChangeInstances = this._register(new Emitter());
    this.onDidChangeInstances = this._onDidChangeInstances.event;
    this._onDidChangeInstanceCapability = this._register(new Emitter());
    this.onDidChangeInstanceCapability = this._onDidChangeInstanceCapability.event;
    this._onDidChangePanelOrientation = this._register(new Emitter());
    this.onDidChangePanelOrientation = this._onDidChangePanelOrientation.event;
    this._getValidTerminalGroups = (sources) => {
      return new Set(
        sources.map((source) => this.getGroupForInstance(source)).filter((group) => group !== void 0)
      );
    };
    const terminalGroupCountContextKey = TerminalContextKeys.groupCount.bindTo(this._contextKeyService);
    this._register(Event.runAndSubscribe(this.onDidChangeGroups, () => terminalGroupCountContextKey.set(this.groups.length)));
    const splitTerminalActiveContextKey = TerminalContextKeys.splitTerminalActive.bindTo(this._contextKeyService);
    this._register(Event.runAndSubscribe(this.onDidFocusInstance, () => {
      const activeInstance = this.activeInstance;
      splitTerminalActiveContextKey.set(activeInstance ? this.instanceIsSplit(activeInstance) : false);
    }));
    this._register(this.onDidDisposeGroup((group) => this._removeGroup(group)));
    this._register(Event.any(this.onDidChangeActiveGroup, this.onDidChangeInstances)(() => this.updateVisibility()));
    this._register(this._quickInputService.onShow(() => this._isQuickInputOpened = true));
    this._register(this._quickInputService.onHide(() => this._isQuickInputOpened = false));
  }
  get instances() {
    return this.groups.reduce((p, c) => p.concat(c.terminalInstances), []);
  }
  hidePanel() {
    const panel = this._viewDescriptorService.getViewContainerByViewId(TERMINAL_VIEW_ID);
    if (panel && this._viewDescriptorService.getViewContainerModel(panel).visibleViewDescriptors.length === 1) {
      this._viewsService.closeView(TERMINAL_VIEW_ID);
      TerminalContextKeys.tabsMouse.bindTo(this._contextKeyService).set(false);
    }
  }
  get activeGroup() {
    if (this.activeGroupIndex < 0 || this.activeGroupIndex >= this.groups.length) {
      return void 0;
    }
    return this.groups[this.activeGroupIndex];
  }
  set activeGroup(value) {
    if (value === void 0) {
      return;
    }
    const index = this.groups.findIndex((e) => e === value);
    this.setActiveGroupByIndex(index);
  }
  get activeInstance() {
    return this.activeGroup?.activeInstance;
  }
  setActiveInstance(instance) {
    this.setActiveInstanceByIndex(this._getIndexFromId(instance.instanceId));
  }
  _getIndexFromId(terminalId) {
    const terminalIndex = this.instances.findIndex((e) => e.instanceId === terminalId);
    if (terminalIndex === -1) {
      throw new Error(`Terminal with ID ${terminalId} does not exist (has it already been disposed?)`);
    }
    return terminalIndex;
  }
  setContainer(container) {
    this._container = container;
    this.groups.forEach((group) => group.attachToElement(container));
  }
  async focusTabs() {
    if (this.instances.length === 0) {
      return;
    }
    await this.showPanel(true);
    const pane = this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID);
    pane?.terminalTabbedView?.focusTabs();
  }
  async focusHover() {
    if (this.instances.length === 0) {
      return;
    }
    const pane = this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID);
    pane?.terminalTabbedView?.focusHover();
  }
  async focusInstance(instance) {
    if (this.instances.includes(instance)) {
      this.setActiveInstance(instance);
    }
    await this.showPanel(true);
  }
  async focusActiveInstance() {
    return this.showPanel(true);
  }
  createGroup(slcOrInstance) {
    const group = this._instantiationService.createInstance(TerminalGroup, this._container, slcOrInstance);
    this.groups.push(group);
    group.addDisposable(Event.forward(group.onPanelOrientationChanged, this._onDidChangePanelOrientation));
    group.addDisposable(Event.forward(group.onDidDisposeInstance, this._onDidDisposeInstance));
    group.addDisposable(Event.forward(group.onDidFocusInstance, this._onDidFocusInstance));
    group.addDisposable(Event.forward(group.onDidChangeInstanceCapability, this._onDidChangeInstanceCapability));
    group.addDisposable(Event.forward(group.onInstancesChanged, this._onDidChangeInstances));
    group.addDisposable(Event.forward(group.onDisposed, this._onDidDisposeGroup));
    group.addDisposable(group.onDidChangeActiveInstance((e) => {
      if (group === this.activeGroup) {
        this._onDidChangeActiveInstance.fire(e);
      }
    }));
    if (group.terminalInstances.length > 0) {
      this._onDidChangeInstances.fire();
    }
    if (this.instances.length === 1) {
      this.setActiveInstanceByIndex(0);
    }
    this._onDidChangeGroups.fire();
    return group;
  }
  async showPanel(focus) {
    const pane = this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID) ?? await this._viewsService.openView(TERMINAL_VIEW_ID, focus);
    pane?.setExpanded(true);
    if (focus) {
      await timeout(0);
      const instance = this.activeInstance;
      if (instance) {
        if (pane && !pane.isVisible()) {
          await this._viewsService.openView(TERMINAL_VIEW_ID, focus);
        }
        await instance.focusWhenReady(true);
      }
    }
    this._onDidShow.fire();
  }
  getInstanceFromResource(resource) {
    return getInstanceFromResource(this.instances, resource);
  }
  _removeGroup(group) {
    const activeGroup = this.activeGroup;
    const wasActiveGroup = group === activeGroup;
    const index = this.groups.indexOf(group);
    if (index !== -1) {
      this.groups.splice(index, 1);
      this._onDidChangeGroups.fire();
    }
    if (wasActiveGroup) {
      if (this.groups.length > 0 && !this._isQuickInputOpened) {
        const newIndex = index < this.groups.length ? index : this.groups.length - 1;
        this.setActiveGroupByIndex(newIndex, true);
        if (group.hadFocusOnExit) {
          this.activeInstance?.focus(true);
        }
      }
    } else {
      if (this.activeGroupIndex > index) {
        this.setActiveGroupByIndex(this.activeGroupIndex - 1);
      }
    }
    if (this.activeGroupIndex >= this.groups.length) {
      this.setActiveGroupByIndex(this.groups.length - 1);
    }
    this._onDidChangeInstances.fire();
    this._onDidChangeGroups.fire();
    if (wasActiveGroup) {
      this._onDidChangeActiveGroup.fire(this.activeGroup);
      this._onDidChangeActiveInstance.fire(this.activeInstance);
    }
  }
  /**
   * @param force Whether to force the group change, this should be used when the previous active
   * group has been removed.
   */
  setActiveGroupByIndex(index, force) {
    if (index === -1 && this.groups.length === 0) {
      if (this.activeGroupIndex !== -1) {
        this.activeGroupIndex = -1;
        this._onDidChangeActiveGroup.fire(this.activeGroup);
        this._onDidChangeActiveInstance.fire(this.activeInstance);
      }
      return;
    }
    if (index < 0 || index >= this.groups.length) {
      return;
    }
    const oldActiveGroup = this.activeGroup;
    this.activeGroupIndex = index;
    if (force || oldActiveGroup !== this.activeGroup) {
      this._onDidChangeActiveGroup.fire(this.activeGroup);
      this._onDidChangeActiveInstance.fire(this.activeInstance);
    }
  }
  _getInstanceLocation(index) {
    let currentGroupIndex = 0;
    while (index >= 0 && currentGroupIndex < this.groups.length) {
      const group = this.groups[currentGroupIndex];
      const count = group.terminalInstances.length;
      if (index < count) {
        return {
          group,
          groupIndex: currentGroupIndex,
          instance: group.terminalInstances[index],
          instanceIndex: index
        };
      }
      index -= count;
      currentGroupIndex++;
    }
    return void 0;
  }
  setActiveInstanceByIndex(index) {
    const activeInstance = this.activeInstance;
    const instanceLocation = this._getInstanceLocation(index);
    const newActiveInstance = instanceLocation?.group.terminalInstances[instanceLocation.instanceIndex];
    if (!instanceLocation || activeInstance === newActiveInstance) {
      return;
    }
    const activeInstanceIndex = instanceLocation.instanceIndex;
    this.activeGroupIndex = instanceLocation.groupIndex;
    this._onDidChangeActiveGroup.fire(this.activeGroup);
    instanceLocation.group.setActiveInstanceByIndex(activeInstanceIndex, true);
  }
  setActiveGroupToNext() {
    if (this.groups.length <= 1) {
      return;
    }
    let newIndex = this.activeGroupIndex + 1;
    if (newIndex >= this.groups.length) {
      newIndex = 0;
    }
    this.setActiveGroupByIndex(newIndex);
  }
  setActiveGroupToPrevious() {
    if (this.groups.length <= 1) {
      return;
    }
    let newIndex = this.activeGroupIndex - 1;
    if (newIndex < 0) {
      newIndex = this.groups.length - 1;
    }
    this.setActiveGroupByIndex(newIndex);
  }
  moveGroup(source, target) {
    source = asArray(source);
    const sourceGroups = this._getValidTerminalGroups(source);
    const targetGroup = this.getGroupForInstance(target);
    if (!targetGroup || sourceGroups.size === 0) {
      return;
    }
    if (sourceGroups.size === 1 && sourceGroups.has(targetGroup)) {
      const targetIndex = targetGroup.terminalInstances.indexOf(target);
      const sortedSources = source.sort((a, b) => {
        return targetGroup.terminalInstances.indexOf(a) - targetGroup.terminalInstances.indexOf(b);
      });
      const firstTargetIndex = targetGroup.terminalInstances.indexOf(sortedSources[0]);
      const position2 = firstTargetIndex < targetIndex ? "after" : "before";
      targetGroup.moveInstance(sortedSources, targetIndex, position2);
      this._onDidChangeInstances.fire();
      return;
    }
    const targetGroupIndex = this.groups.indexOf(targetGroup);
    const sortedSourceGroups = Array.from(sourceGroups).sort((a, b) => {
      return this.groups.indexOf(a) - this.groups.indexOf(b);
    });
    const firstSourceGroupIndex = this.groups.indexOf(sortedSourceGroups[0]);
    const position = firstSourceGroupIndex < targetGroupIndex ? "after" : "before";
    const insertIndex = position === "after" ? targetGroupIndex + 1 : targetGroupIndex;
    this.groups.splice(insertIndex, 0, ...sortedSourceGroups);
    for (const sourceGroup of sortedSourceGroups) {
      const originSourceGroupIndex = position === "after" ? this.groups.indexOf(sourceGroup) : this.groups.lastIndexOf(sourceGroup);
      this.groups.splice(originSourceGroupIndex, 1);
    }
    this._onDidChangeInstances.fire();
  }
  moveGroupToEnd(source) {
    source = asArray(source);
    const sourceGroups = this._getValidTerminalGroups(source);
    if (sourceGroups.size === 0) {
      return;
    }
    const lastInstanceIndex = this.groups.length - 1;
    const sortedSourceGroups = Array.from(sourceGroups).sort((a, b) => {
      return this.groups.indexOf(a) - this.groups.indexOf(b);
    });
    this.groups.splice(lastInstanceIndex + 1, 0, ...sortedSourceGroups);
    for (const sourceGroup of sortedSourceGroups) {
      const sourceGroupIndex = this.groups.indexOf(sourceGroup);
      this.groups.splice(sourceGroupIndex, 1);
    }
    this._onDidChangeInstances.fire();
  }
  moveInstance(source, target, side) {
    const sourceGroup = this.getGroupForInstance(source);
    const targetGroup = this.getGroupForInstance(target);
    if (!sourceGroup || !targetGroup) {
      return;
    }
    if (sourceGroup !== targetGroup) {
      sourceGroup.removeInstance(source);
      targetGroup.addInstance(source);
    }
    const index = targetGroup.terminalInstances.indexOf(target) + (side === "after" ? 1 : 0);
    targetGroup.moveInstance(source, index, side);
  }
  unsplitInstance(instance) {
    const oldGroup = this.getGroupForInstance(instance);
    if (!oldGroup || oldGroup.terminalInstances.length < 2) {
      return;
    }
    oldGroup.removeInstance(instance);
    this.createGroup(instance);
  }
  joinInstances(instances) {
    const group = this.getGroupForInstance(instances[0]);
    if (group) {
      let differentGroups = true;
      for (let i = 1; i < group.terminalInstances.length; i++) {
        if (group.terminalInstances.includes(instances[i])) {
          differentGroups = false;
          break;
        }
      }
      if (!differentGroups && group.terminalInstances.length === instances.length) {
        return;
      }
    }
    let candidateInstance = void 0;
    let candidateGroup = void 0;
    for (const instance of instances) {
      const group2 = this.getGroupForInstance(instance);
      if (group2?.terminalInstances.length === 1) {
        candidateInstance = instance;
        candidateGroup = group2;
        break;
      }
    }
    if (!candidateGroup) {
      candidateGroup = this.createGroup();
    }
    const wasActiveGroup = this.activeGroup === candidateGroup;
    for (const instance of instances) {
      if (instance === candidateInstance) {
        continue;
      }
      const oldGroup = this.getGroupForInstance(instance);
      if (!oldGroup) {
        continue;
      }
      oldGroup.removeInstance(instance);
      candidateGroup.addInstance(instance);
    }
    this.setActiveInstance(instances[0]);
    this._onDidChangeInstances.fire();
    if (!wasActiveGroup) {
      this._onDidChangeActiveGroup.fire(this.activeGroup);
    }
  }
  instanceIsSplit(instance) {
    const group = this.getGroupForInstance(instance);
    if (!group) {
      return false;
    }
    return group.terminalInstances.length > 1;
  }
  getGroupForInstance(instance) {
    return this.groups.find((group) => group.terminalInstances.includes(instance));
  }
  getGroupLabels() {
    return this.groups.filter((group) => group.terminalInstances.length > 0).map((group, index) => {
      return `${index + 1}: ${group.title ? group.title : ""}`;
    });
  }
  /**
   * Visibility should be updated in the following cases:
   * 1. Toggle `TERMINAL_VIEW_ID` visibility
   * 2. Change active group
   * 3. Change instances in active group
   */
  updateVisibility() {
    const visible = this._viewsService.isViewVisible(TERMINAL_VIEW_ID);
    this.groups.forEach((g, i) => g.setVisible(visible && i === this.activeGroupIndex));
  }
};
TerminalGroupService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IViewsService),
  __decorateParam(3, IViewDescriptorService),
  __decorateParam(4, IQuickInputService)
], TerminalGroupService);
export {
  TerminalGroupService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFx0ZXJtaW5hbEdyb3VwU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IE9yaWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Nhc2gvc2FzaC5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVNoZWxsTGF1bmNoQ29uZmlnIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsR3JvdXAsIElUZXJtaW5hbEdyb3VwU2VydmljZSwgSVRlcm1pbmFsSW5zdGFuY2UgfSBmcm9tICcuL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgVGVybWluYWxHcm91cCB9IGZyb20gJy4vdGVybWluYWxHcm91cC5qcyc7XG5pbXBvcnQgeyBnZXRJbnN0YW5jZUZyb21SZXNvdXJjZSB9IGZyb20gJy4vdGVybWluYWxVcmkuanMnO1xuaW1wb3J0IHsgVGVybWluYWxWaWV3UGFuZSB9IGZyb20gJy4vdGVybWluYWxWaWV3LmpzJztcbmltcG9ydCB7IFRFUk1JTkFMX1ZJRVdfSUQgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDb250ZXh0S2V5cyB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbENvbnRleHRLZXkuanMnO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgdHlwZSB7IFNpbmdsZU9yTWFueSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsR3JvdXBTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXJtaW5hbEdyb3VwU2VydmljZSB7XG5cdGRlY2xhcmUgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGdyb3VwczogSVRlcm1pbmFsR3JvdXBbXSA9IFtdO1xuXHRhY3RpdmVHcm91cEluZGV4OiBudW1iZXIgPSAtMTtcblx0Z2V0IGluc3RhbmNlcygpOiBJVGVybWluYWxJbnN0YW5jZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5ncm91cHMucmVkdWNlKChwLCBjKSA9PiBwLmNvbmNhdChjLnRlcm1pbmFsSW5zdGFuY2VzKSwgW10gYXMgSVRlcm1pbmFsSW5zdGFuY2VbXSk7XG5cdH1cblxuXHRsYXN0QWNjZXNzZWRNZW51OiAnaW5saW5lLXRhYicgfCAndGFiLWxpc3QnID0gJ2lubGluZS10YWInO1xuXG5cdHByaXZhdGUgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfaXNRdWlja0lucHV0T3BlbmVkOiBib29sZWFuID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY3RpdmVHcm91cCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEdyb3VwIHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVHcm91cCA9IHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlR3JvdXAuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzcG9zZUdyb3VwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsR3JvdXA+KCkpO1xuXHRyZWFkb25seSBvbkRpZERpc3Bvc2VHcm91cCA9IHRoaXMuX29uRGlkRGlzcG9zZUdyb3VwLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUdyb3VwcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUdyb3VwcyA9IHRoaXMuX29uRGlkQ2hhbmdlR3JvdXBzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNob3cgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRTaG93ID0gdGhpcy5fb25EaWRTaG93LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzcG9zZUluc3RhbmNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+KCkpO1xuXHRyZWFkb25seSBvbkRpZERpc3Bvc2VJbnN0YW5jZSA9IHRoaXMuX29uRGlkRGlzcG9zZUluc3RhbmNlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZvY3VzSW5zdGFuY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXNJbnN0YW5jZSA9IHRoaXMuX29uRGlkRm9jdXNJbnN0YW5jZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY3RpdmVJbnN0YW5jZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVJbnN0YW5jZSA9IHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSW5zdGFuY2VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSW5zdGFuY2VzID0gdGhpcy5fb25EaWRDaGFuZ2VJbnN0YW5jZXMuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSW5zdGFuY2VDYXBhYmlsaXR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUluc3RhbmNlQ2FwYWJpbGl0eSA9IHRoaXMuX29uRGlkQ2hhbmdlSW5zdGFuY2VDYXBhYmlsaXR5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUGFuZWxPcmllbnRhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE9yaWVudGF0aW9uPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQYW5lbE9yaWVudGF0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VQYW5lbE9yaWVudGF0aW9uLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IHRlcm1pbmFsR3JvdXBDb3VudENvbnRleHRLZXkgPSBUZXJtaW5hbENvbnRleHRLZXlzLmdyb3VwQ291bnQuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUodGhpcy5vbkRpZENoYW5nZUdyb3VwcywgKCkgPT4gdGVybWluYWxHcm91cENvdW50Q29udGV4dEtleS5zZXQodGhpcy5ncm91cHMubGVuZ3RoKSkpO1xuXG5cdFx0Y29uc3Qgc3BsaXRUZXJtaW5hbEFjdGl2ZUNvbnRleHRLZXkgPSBUZXJtaW5hbENvbnRleHRLZXlzLnNwbGl0VGVybWluYWxBY3RpdmUuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUodGhpcy5vbkRpZEZvY3VzSW5zdGFuY2UsICgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZUluc3RhbmNlID0gdGhpcy5hY3RpdmVJbnN0YW5jZTtcblx0XHRcdHNwbGl0VGVybWluYWxBY3RpdmVDb250ZXh0S2V5LnNldChhY3RpdmVJbnN0YW5jZSA/IHRoaXMuaW5zdGFuY2VJc1NwbGl0KGFjdGl2ZUluc3RhbmNlKSA6IGZhbHNlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkRGlzcG9zZUdyb3VwKGdyb3VwID0+IHRoaXMuX3JlbW92ZUdyb3VwKGdyb3VwKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueSh0aGlzLm9uRGlkQ2hhbmdlQWN0aXZlR3JvdXAsIHRoaXMub25EaWRDaGFuZ2VJbnN0YW5jZXMpKCgpID0+IHRoaXMudXBkYXRlVmlzaWJpbGl0eSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcXVpY2tJbnB1dFNlcnZpY2Uub25TaG93KCgpID0+IHRoaXMuX2lzUXVpY2tJbnB1dE9wZW5lZCA9IHRydWUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9xdWlja0lucHV0U2VydmljZS5vbkhpZGUoKCkgPT4gdGhpcy5faXNRdWlja0lucHV0T3BlbmVkID0gZmFsc2UpKTtcblx0fVxuXG5cdGhpZGVQYW5lbCgpOiB2b2lkIHtcblx0XHQvLyBIaWRlIHRoZSBwYW5lbCBpZiB0aGUgdGVybWluYWwgaXMgaW4gdGhlIHBhbmVsIGFuZCBpdCBoYXMgbm8gc2libGluZyB2aWV3c1xuXHRcdGNvbnN0IHBhbmVsID0gdGhpcy5fdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZChURVJNSU5BTF9WSUVXX0lEKTtcblx0XHRpZiAocGFuZWwgJiYgdGhpcy5fdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbChwYW5lbCkudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHRoaXMuX3ZpZXdzU2VydmljZS5jbG9zZVZpZXcoVEVSTUlOQUxfVklFV19JRCk7XG5cdFx0XHRUZXJtaW5hbENvbnRleHRLZXlzLnRhYnNNb3VzZS5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpLnNldChmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGFjdGl2ZUdyb3VwKCk6IElUZXJtaW5hbEdyb3VwIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5hY3RpdmVHcm91cEluZGV4IDwgMCB8fCB0aGlzLmFjdGl2ZUdyb3VwSW5kZXggPj0gdGhpcy5ncm91cHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5ncm91cHNbdGhpcy5hY3RpdmVHcm91cEluZGV4XTtcblx0fVxuXHRzZXQgYWN0aXZlR3JvdXAodmFsdWU6IElUZXJtaW5hbEdyb3VwIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIFNldHRpbmcgdG8gdW5kZWZpbmVkIGlzIG5vdCBwb3NzaWJsZSwgdGhpcyBjYW4gb25seSBiZSBkb25lIHdoZW4gcmVtb3ZpbmcgdGhlIGxhc3QgZ3JvdXBcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmdyb3Vwcy5maW5kSW5kZXgoZSA9PiBlID09PSB2YWx1ZSk7XG5cdFx0dGhpcy5zZXRBY3RpdmVHcm91cEJ5SW5kZXgoaW5kZXgpO1xuXHR9XG5cblx0Z2V0IGFjdGl2ZUluc3RhbmNlKCk6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5hY3RpdmVHcm91cD8uYWN0aXZlSW5zdGFuY2U7XG5cdH1cblxuXHRzZXRBY3RpdmVJbnN0YW5jZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpIHtcblx0XHR0aGlzLnNldEFjdGl2ZUluc3RhbmNlQnlJbmRleCh0aGlzLl9nZXRJbmRleEZyb21JZChpbnN0YW5jZS5pbnN0YW5jZUlkKSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRJbmRleEZyb21JZCh0ZXJtaW5hbElkOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IHRlcm1pbmFsSW5kZXggPSB0aGlzLmluc3RhbmNlcy5maW5kSW5kZXgoZSA9PiBlLmluc3RhbmNlSWQgPT09IHRlcm1pbmFsSWQpO1xuXHRcdGlmICh0ZXJtaW5hbEluZGV4ID09PSAtMSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUZXJtaW5hbCB3aXRoIElEICR7dGVybWluYWxJZH0gZG9lcyBub3QgZXhpc3QgKGhhcyBpdCBhbHJlYWR5IGJlZW4gZGlzcG9zZWQ/KWApO1xuXHRcdH1cblx0XHRyZXR1cm4gdGVybWluYWxJbmRleDtcblx0fVxuXG5cdHNldENvbnRhaW5lcihjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0dGhpcy5fY29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdHRoaXMuZ3JvdXBzLmZvckVhY2goZ3JvdXAgPT4gZ3JvdXAuYXR0YWNoVG9FbGVtZW50KGNvbnRhaW5lcikpO1xuXHR9XG5cblx0YXN5bmMgZm9jdXNUYWJzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmluc3RhbmNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5zaG93UGFuZWwodHJ1ZSk7XG5cdFx0Y29uc3QgcGFuZSA9IHRoaXMuX3ZpZXdzU2VydmljZS5nZXRBY3RpdmVWaWV3V2l0aElkPFRlcm1pbmFsVmlld1BhbmU+KFRFUk1JTkFMX1ZJRVdfSUQpO1xuXHRcdHBhbmU/LnRlcm1pbmFsVGFiYmVkVmlldz8uZm9jdXNUYWJzKCk7XG5cdH1cblxuXHRhc3luYyBmb2N1c0hvdmVyKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmluc3RhbmNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYW5lID0gdGhpcy5fdmlld3NTZXJ2aWNlLmdldEFjdGl2ZVZpZXdXaXRoSWQ8VGVybWluYWxWaWV3UGFuZT4oVEVSTUlOQUxfVklFV19JRCk7XG5cdFx0cGFuZT8udGVybWluYWxUYWJiZWRWaWV3Py5mb2N1c0hvdmVyKCk7XG5cdH1cblxuXHRhc3luYyBmb2N1c0luc3RhbmNlKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmluc3RhbmNlcy5pbmNsdWRlcyhpbnN0YW5jZSkpIHtcblx0XHRcdHRoaXMuc2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnNob3dQYW5lbCh0cnVlKTtcblx0fVxuXG5cdGFzeW5jIGZvY3VzQWN0aXZlSW5zdGFuY2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuc2hvd1BhbmVsKHRydWUpO1xuXHR9XG5cblx0Y3JlYXRlR3JvdXAoc2xjT3JJbnN0YW5jZT86IElTaGVsbExhdW5jaENvbmZpZyB8IElUZXJtaW5hbEluc3RhbmNlKTogSVRlcm1pbmFsR3JvdXAge1xuXHRcdGNvbnN0IGdyb3VwID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxHcm91cCwgdGhpcy5fY29udGFpbmVyLCBzbGNPckluc3RhbmNlKTtcblx0XHR0aGlzLmdyb3Vwcy5wdXNoKGdyb3VwKTtcblx0XHRncm91cC5hZGREaXNwb3NhYmxlKEV2ZW50LmZvcndhcmQoZ3JvdXAub25QYW5lbE9yaWVudGF0aW9uQ2hhbmdlZCwgdGhpcy5fb25EaWRDaGFuZ2VQYW5lbE9yaWVudGF0aW9uKSk7XG5cdFx0Z3JvdXAuYWRkRGlzcG9zYWJsZShFdmVudC5mb3J3YXJkKGdyb3VwLm9uRGlkRGlzcG9zZUluc3RhbmNlLCB0aGlzLl9vbkRpZERpc3Bvc2VJbnN0YW5jZSkpO1xuXHRcdGdyb3VwLmFkZERpc3Bvc2FibGUoRXZlbnQuZm9yd2FyZChncm91cC5vbkRpZEZvY3VzSW5zdGFuY2UsIHRoaXMuX29uRGlkRm9jdXNJbnN0YW5jZSkpO1xuXHRcdGdyb3VwLmFkZERpc3Bvc2FibGUoRXZlbnQuZm9yd2FyZChncm91cC5vbkRpZENoYW5nZUluc3RhbmNlQ2FwYWJpbGl0eSwgdGhpcy5fb25EaWRDaGFuZ2VJbnN0YW5jZUNhcGFiaWxpdHkpKTtcblx0XHRncm91cC5hZGREaXNwb3NhYmxlKEV2ZW50LmZvcndhcmQoZ3JvdXAub25JbnN0YW5jZXNDaGFuZ2VkLCB0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlcykpO1xuXHRcdGdyb3VwLmFkZERpc3Bvc2FibGUoRXZlbnQuZm9yd2FyZChncm91cC5vbkRpc3Bvc2VkLCB0aGlzLl9vbkRpZERpc3Bvc2VHcm91cCkpO1xuXHRcdGdyb3VwLmFkZERpc3Bvc2FibGUoZ3JvdXAub25EaWRDaGFuZ2VBY3RpdmVJbnN0YW5jZShlID0+IHtcblx0XHRcdGlmIChncm91cCA9PT0gdGhpcy5hY3RpdmVHcm91cCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUluc3RhbmNlLmZpcmUoZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGlmIChncm91cC50ZXJtaW5hbEluc3RhbmNlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlcy5maXJlKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmluc3RhbmNlcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdC8vIEl0J3MgdGhlIGZpcnN0IGluc3RhbmNlIHNvIGl0IHNob3VsZCBiZSBtYWRlIGFjdGl2ZSBhdXRvbWF0aWNhbGx5LCB0aGlzIG11c3QgZmlyZVxuXHRcdFx0Ly8gYWZ0ZXIgb25JbnN0YW5jZXNDaGFuZ2VkIHNvIGNvbnN1bWVycyBjYW4gcmVhY3QgdG8gdGhlIGluc3RhbmNlIGJlaW5nIGFkZGVkIGZpcnN0XG5cdFx0XHR0aGlzLnNldEFjdGl2ZUluc3RhbmNlQnlJbmRleCgwKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VHcm91cHMuZmlyZSgpO1xuXHRcdHJldHVybiBncm91cDtcblx0fVxuXG5cdGFzeW5jIHNob3dQYW5lbChmb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwYW5lID0gdGhpcy5fdmlld3NTZXJ2aWNlLmdldEFjdGl2ZVZpZXdXaXRoSWQoVEVSTUlOQUxfVklFV19JRClcblx0XHRcdD8/IGF3YWl0IHRoaXMuX3ZpZXdzU2VydmljZS5vcGVuVmlldyhURVJNSU5BTF9WSUVXX0lELCBmb2N1cyk7XG5cdFx0cGFuZT8uc2V0RXhwYW5kZWQodHJ1ZSk7XG5cblx0XHRpZiAoZm9jdXMpIHtcblx0XHRcdC8vIERvIHRoZSBmb2N1cyBjYWxsIGFzeW5jaHJvbm91c2x5IGFzIGdvaW5nIHRocm91Z2ggdGhlXG5cdFx0XHQvLyBjb21tYW5kIHBhbGV0dGUgd2lsbCBmb3JjZSBlZGl0b3IgZm9jdXNcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMuYWN0aXZlSW5zdGFuY2U7XG5cdFx0XHRpZiAoaW5zdGFuY2UpIHtcblx0XHRcdFx0Ly8gSEFDSzogRW5zdXJlIHRoZSBwYW5lbCBpcyBzdGlsbCB2aXNpYmxlIGF0IHRoaXMgcG9pbnQgYXMgdGhlcmUgbWF5IGhhdmUgYmVlblxuXHRcdFx0XHQvLyBhIHJlcXVlc3Qgc2luY2UgaXQgd2FzIG9wZW5lZCB0byBzaG93IGEgZGlmZmVyZW50IHBhbmVsXG5cdFx0XHRcdGlmIChwYW5lICYmICFwYW5lLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fdmlld3NTZXJ2aWNlLm9wZW5WaWV3KFRFUk1JTkFMX1ZJRVdfSUQsIGZvY3VzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCBpbnN0YW5jZS5mb2N1c1doZW5SZWFkeSh0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fb25EaWRTaG93LmZpcmUoKTtcblx0fVxuXG5cdGdldEluc3RhbmNlRnJvbVJlc291cmNlKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGdldEluc3RhbmNlRnJvbVJlc291cmNlKHRoaXMuaW5zdGFuY2VzLCByZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVHcm91cChncm91cDogSVRlcm1pbmFsR3JvdXApIHtcblx0XHQvLyBHZXQgdGhlIGluZGV4IG9mIHRoZSBncm91cCBhbmQgcmVtb3ZlIGl0IGZyb20gdGhlIGxpc3Rcblx0XHRjb25zdCBhY3RpdmVHcm91cCA9IHRoaXMuYWN0aXZlR3JvdXA7XG5cdFx0Y29uc3Qgd2FzQWN0aXZlR3JvdXAgPSBncm91cCA9PT0gYWN0aXZlR3JvdXA7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmdyb3Vwcy5pbmRleE9mKGdyb3VwKTtcblx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHR0aGlzLmdyb3Vwcy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VHcm91cHMuZmlyZSgpO1xuXHRcdH1cblxuXHRcdGlmICh3YXNBY3RpdmVHcm91cCkge1xuXHRcdFx0Ly8gQWRqdXN0IGZvY3VzIGlmIHRoZSBncm91cCB3YXMgYWN0aXZlXG5cdFx0XHRpZiAodGhpcy5ncm91cHMubGVuZ3RoID4gMCAmJiAhdGhpcy5faXNRdWlja0lucHV0T3BlbmVkKSB7XG5cdFx0XHRcdGNvbnN0IG5ld0luZGV4ID0gaW5kZXggPCB0aGlzLmdyb3Vwcy5sZW5ndGggPyBpbmRleCA6IHRoaXMuZ3JvdXBzLmxlbmd0aCAtIDE7XG5cdFx0XHRcdHRoaXMuc2V0QWN0aXZlR3JvdXBCeUluZGV4KG5ld0luZGV4LCB0cnVlKTtcblx0XHRcdFx0aWYgKGdyb3VwLmhhZEZvY3VzT25FeGl0KSB7XG5cdFx0XHRcdFx0dGhpcy5hY3RpdmVJbnN0YW5jZT8uZm9jdXModHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQWRqdXN0IHRoZSBhY3RpdmUgZ3JvdXAgaWYgdGhlIHJlbW92ZWQgZ3JvdXAgd2FzIGFib3ZlIHRoZSBhY3RpdmUgZ3JvdXBcblx0XHRcdGlmICh0aGlzLmFjdGl2ZUdyb3VwSW5kZXggPiBpbmRleCkge1xuXHRcdFx0XHR0aGlzLnNldEFjdGl2ZUdyb3VwQnlJbmRleCh0aGlzLmFjdGl2ZUdyb3VwSW5kZXggLSAxKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gRW5zdXJlIHRoZSBhY3RpdmUgZ3JvdXAgaXMgc3RpbGwgdmFsaWQsIHRoaXMgc2hvdWxkIHNldCB0aGUgYWN0aXZlR3JvdXBJbmRleCB0byAtMSBpZlxuXHRcdC8vIHRoZXJlIGFyZSBubyBncm91cHNcblx0XHRpZiAodGhpcy5hY3RpdmVHcm91cEluZGV4ID49IHRoaXMuZ3JvdXBzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5zZXRBY3RpdmVHcm91cEJ5SW5kZXgodGhpcy5ncm91cHMubGVuZ3RoIC0gMSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJbnN0YW5jZXMuZmlyZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlR3JvdXBzLmZpcmUoKTtcblx0XHRpZiAod2FzQWN0aXZlR3JvdXApIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlR3JvdXAuZmlyZSh0aGlzLmFjdGl2ZUdyb3VwKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UuZmlyZSh0aGlzLmFjdGl2ZUluc3RhbmNlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIGZvcmNlIFdoZXRoZXIgdG8gZm9yY2UgdGhlIGdyb3VwIGNoYW5nZSwgdGhpcyBzaG91bGQgYmUgdXNlZCB3aGVuIHRoZSBwcmV2aW91cyBhY3RpdmVcblx0ICogZ3JvdXAgaGFzIGJlZW4gcmVtb3ZlZC5cblx0ICovXG5cdHNldEFjdGl2ZUdyb3VwQnlJbmRleChpbmRleDogbnVtYmVyLCBmb3JjZT86IGJvb2xlYW4pIHtcblx0XHQvLyBVbnNldCBhY3RpdmUgZ3JvdXAgd2hlbiB0aGUgbGFzdCBncm91cCBpcyByZW1vdmVkXG5cdFx0aWYgKGluZGV4ID09PSAtMSAmJiB0aGlzLmdyb3Vwcy5sZW5ndGggPT09IDApIHtcblx0XHRcdGlmICh0aGlzLmFjdGl2ZUdyb3VwSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdHRoaXMuYWN0aXZlR3JvdXBJbmRleCA9IC0xO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUdyb3VwLmZpcmUodGhpcy5hY3RpdmVHcm91cCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UuZmlyZSh0aGlzLmFjdGl2ZUluc3RhbmNlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBFbnN1cmUgaW5kZXggaXMgdmFsaWRcblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMuZ3JvdXBzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEZpcmUgZ3JvdXAvaW5zdGFuY2UgY2hhbmdlIGlmIG5lZWRlZFxuXHRcdGNvbnN0IG9sZEFjdGl2ZUdyb3VwID0gdGhpcy5hY3RpdmVHcm91cDtcblx0XHR0aGlzLmFjdGl2ZUdyb3VwSW5kZXggPSBpbmRleDtcblx0XHRpZiAoZm9yY2UgfHwgb2xkQWN0aXZlR3JvdXAgIT09IHRoaXMuYWN0aXZlR3JvdXApIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlR3JvdXAuZmlyZSh0aGlzLmFjdGl2ZUdyb3VwKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UuZmlyZSh0aGlzLmFjdGl2ZUluc3RhbmNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRJbnN0YW5jZUxvY2F0aW9uKGluZGV4OiBudW1iZXIpOiBJSW5zdGFuY2VMb2NhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IGN1cnJlbnRHcm91cEluZGV4ID0gMDtcblx0XHR3aGlsZSAoaW5kZXggPj0gMCAmJiBjdXJyZW50R3JvdXBJbmRleCA8IHRoaXMuZ3JvdXBzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLmdyb3Vwc1tjdXJyZW50R3JvdXBJbmRleF07XG5cdFx0XHRjb25zdCBjb3VudCA9IGdyb3VwLnRlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aDtcblx0XHRcdGlmIChpbmRleCA8IGNvdW50KSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Z3JvdXAsXG5cdFx0XHRcdFx0Z3JvdXBJbmRleDogY3VycmVudEdyb3VwSW5kZXgsXG5cdFx0XHRcdFx0aW5zdGFuY2U6IGdyb3VwLnRlcm1pbmFsSW5zdGFuY2VzW2luZGV4XSxcblx0XHRcdFx0XHRpbnN0YW5jZUluZGV4OiBpbmRleFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0aW5kZXggLT0gY291bnQ7XG5cdFx0XHRjdXJyZW50R3JvdXBJbmRleCsrO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0c2V0QWN0aXZlSW5zdGFuY2VCeUluZGV4KGluZGV4OiBudW1iZXIpIHtcblx0XHRjb25zdCBhY3RpdmVJbnN0YW5jZSA9IHRoaXMuYWN0aXZlSW5zdGFuY2U7XG5cdFx0Y29uc3QgaW5zdGFuY2VMb2NhdGlvbiA9IHRoaXMuX2dldEluc3RhbmNlTG9jYXRpb24oaW5kZXgpO1xuXHRcdGNvbnN0IG5ld0FjdGl2ZUluc3RhbmNlID0gaW5zdGFuY2VMb2NhdGlvbj8uZ3JvdXAudGVybWluYWxJbnN0YW5jZXNbaW5zdGFuY2VMb2NhdGlvbi5pbnN0YW5jZUluZGV4XTtcblx0XHRpZiAoIWluc3RhbmNlTG9jYXRpb24gfHwgYWN0aXZlSW5zdGFuY2UgPT09IG5ld0FjdGl2ZUluc3RhbmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlSW5zdGFuY2VJbmRleCA9IGluc3RhbmNlTG9jYXRpb24uaW5zdGFuY2VJbmRleDtcblxuXHRcdHRoaXMuYWN0aXZlR3JvdXBJbmRleCA9IGluc3RhbmNlTG9jYXRpb24uZ3JvdXBJbmRleDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUdyb3VwLmZpcmUodGhpcy5hY3RpdmVHcm91cCk7XG5cdFx0aW5zdGFuY2VMb2NhdGlvbi5ncm91cC5zZXRBY3RpdmVJbnN0YW5jZUJ5SW5kZXgoYWN0aXZlSW5zdGFuY2VJbmRleCwgdHJ1ZSk7XG5cdH1cblxuXHRzZXRBY3RpdmVHcm91cFRvTmV4dCgpIHtcblx0XHRpZiAodGhpcy5ncm91cHMubGVuZ3RoIDw9IDEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IG5ld0luZGV4ID0gdGhpcy5hY3RpdmVHcm91cEluZGV4ICsgMTtcblx0XHRpZiAobmV3SW5kZXggPj0gdGhpcy5ncm91cHMubGVuZ3RoKSB7XG5cdFx0XHRuZXdJbmRleCA9IDA7XG5cdFx0fVxuXHRcdHRoaXMuc2V0QWN0aXZlR3JvdXBCeUluZGV4KG5ld0luZGV4KTtcblx0fVxuXG5cdHNldEFjdGl2ZUdyb3VwVG9QcmV2aW91cygpIHtcblx0XHRpZiAodGhpcy5ncm91cHMubGVuZ3RoIDw9IDEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IG5ld0luZGV4ID0gdGhpcy5hY3RpdmVHcm91cEluZGV4IC0gMTtcblx0XHRpZiAobmV3SW5kZXggPCAwKSB7XG5cdFx0XHRuZXdJbmRleCA9IHRoaXMuZ3JvdXBzLmxlbmd0aCAtIDE7XG5cdFx0fVxuXHRcdHRoaXMuc2V0QWN0aXZlR3JvdXBCeUluZGV4KG5ld0luZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFZhbGlkVGVybWluYWxHcm91cHMgPSAoc291cmNlczogSVRlcm1pbmFsSW5zdGFuY2VbXSk6IFNldDxJVGVybWluYWxHcm91cD4gPT4ge1xuXHRcdHJldHVybiBuZXcgU2V0KFxuXHRcdFx0c291cmNlc1xuXHRcdFx0XHQubWFwKHNvdXJjZSA9PiB0aGlzLmdldEdyb3VwRm9ySW5zdGFuY2Uoc291cmNlKSlcblx0XHRcdFx0LmZpbHRlcigoZ3JvdXApID0+IGdyb3VwICE9PSB1bmRlZmluZWQpXG5cdFx0KTtcblx0fTtcblxuXHRtb3ZlR3JvdXAoc291cmNlOiBTaW5nbGVPck1hbnk8SVRlcm1pbmFsSW5zdGFuY2U+LCB0YXJnZXQ6IElUZXJtaW5hbEluc3RhbmNlKSB7XG5cdFx0c291cmNlID0gYXNBcnJheShzb3VyY2UpO1xuXHRcdGNvbnN0IHNvdXJjZUdyb3VwcyA9IHRoaXMuX2dldFZhbGlkVGVybWluYWxHcm91cHMoc291cmNlKTtcblx0XHRjb25zdCB0YXJnZXRHcm91cCA9IHRoaXMuZ2V0R3JvdXBGb3JJbnN0YW5jZSh0YXJnZXQpO1xuXHRcdGlmICghdGFyZ2V0R3JvdXAgfHwgc291cmNlR3JvdXBzLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUaGUgZ3JvdXBzIGFyZSB0aGUgc2FtZSwgcmVhcnJhbmdlIHdpdGhpbiB0aGUgZ3JvdXBcblx0XHRpZiAoc291cmNlR3JvdXBzLnNpemUgPT09IDEgJiYgc291cmNlR3JvdXBzLmhhcyh0YXJnZXRHcm91cCkpIHtcblx0XHRcdGNvbnN0IHRhcmdldEluZGV4ID0gdGFyZ2V0R3JvdXAudGVybWluYWxJbnN0YW5jZXMuaW5kZXhPZih0YXJnZXQpO1xuXHRcdFx0Y29uc3Qgc29ydGVkU291cmNlcyA9IHNvdXJjZS5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0YXJnZXRHcm91cC50ZXJtaW5hbEluc3RhbmNlcy5pbmRleE9mKGEpIC0gdGFyZ2V0R3JvdXAudGVybWluYWxJbnN0YW5jZXMuaW5kZXhPZihiKTtcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgZmlyc3RUYXJnZXRJbmRleCA9IHRhcmdldEdyb3VwLnRlcm1pbmFsSW5zdGFuY2VzLmluZGV4T2Yoc29ydGVkU291cmNlc1swXSk7XG5cdFx0XHRjb25zdCBwb3NpdGlvbjogJ2JlZm9yZScgfCAnYWZ0ZXInID0gZmlyc3RUYXJnZXRJbmRleCA8IHRhcmdldEluZGV4ID8gJ2FmdGVyJyA6ICdiZWZvcmUnO1xuXHRcdFx0dGFyZ2V0R3JvdXAubW92ZUluc3RhbmNlKHNvcnRlZFNvdXJjZXMsIHRhcmdldEluZGV4LCBwb3NpdGlvbik7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlcy5maXJlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIGdyb3VwcyBkaWZmZXIsIHJlYXJyYW5nZSBncm91cHNcblx0XHRjb25zdCB0YXJnZXRHcm91cEluZGV4ID0gdGhpcy5ncm91cHMuaW5kZXhPZih0YXJnZXRHcm91cCk7XG5cdFx0Y29uc3Qgc29ydGVkU291cmNlR3JvdXBzID0gQXJyYXkuZnJvbShzb3VyY2VHcm91cHMpLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLmdyb3Vwcy5pbmRleE9mKGEpIC0gdGhpcy5ncm91cHMuaW5kZXhPZihiKTtcblx0XHR9KTtcblx0XHRjb25zdCBmaXJzdFNvdXJjZUdyb3VwSW5kZXggPSB0aGlzLmdyb3Vwcy5pbmRleE9mKHNvcnRlZFNvdXJjZUdyb3Vwc1swXSk7XG5cdFx0Y29uc3QgcG9zaXRpb246ICdiZWZvcmUnIHwgJ2FmdGVyJyA9IGZpcnN0U291cmNlR3JvdXBJbmRleCA8IHRhcmdldEdyb3VwSW5kZXggPyAnYWZ0ZXInIDogJ2JlZm9yZSc7XG5cdFx0Y29uc3QgaW5zZXJ0SW5kZXggPSBwb3NpdGlvbiA9PT0gJ2FmdGVyJyA/IHRhcmdldEdyb3VwSW5kZXggKyAxIDogdGFyZ2V0R3JvdXBJbmRleDtcblx0XHR0aGlzLmdyb3Vwcy5zcGxpY2UoaW5zZXJ0SW5kZXgsIDAsIC4uLnNvcnRlZFNvdXJjZUdyb3Vwcyk7XG5cdFx0Zm9yIChjb25zdCBzb3VyY2VHcm91cCBvZiBzb3J0ZWRTb3VyY2VHcm91cHMpIHtcblx0XHRcdGNvbnN0IG9yaWdpblNvdXJjZUdyb3VwSW5kZXggPSBwb3NpdGlvbiA9PT0gJ2FmdGVyJyA/IHRoaXMuZ3JvdXBzLmluZGV4T2Yoc291cmNlR3JvdXApIDogdGhpcy5ncm91cHMubGFzdEluZGV4T2Yoc291cmNlR3JvdXApO1xuXHRcdFx0dGhpcy5ncm91cHMuc3BsaWNlKG9yaWdpblNvdXJjZUdyb3VwSW5kZXgsIDEpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlcy5maXJlKCk7XG5cdH1cblxuXHRtb3ZlR3JvdXBUb0VuZChzb3VyY2U6IFNpbmdsZU9yTWFueTxJVGVybWluYWxJbnN0YW5jZT4pOiB2b2lkIHtcblx0XHRzb3VyY2UgPSBhc0FycmF5KHNvdXJjZSk7XG5cdFx0Y29uc3Qgc291cmNlR3JvdXBzID0gdGhpcy5fZ2V0VmFsaWRUZXJtaW5hbEdyb3Vwcyhzb3VyY2UpO1xuXHRcdGlmIChzb3VyY2VHcm91cHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsYXN0SW5zdGFuY2VJbmRleCA9IHRoaXMuZ3JvdXBzLmxlbmd0aCAtIDE7XG5cdFx0Y29uc3Qgc29ydGVkU291cmNlR3JvdXBzID0gQXJyYXkuZnJvbShzb3VyY2VHcm91cHMpLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLmdyb3Vwcy5pbmRleE9mKGEpIC0gdGhpcy5ncm91cHMuaW5kZXhPZihiKTtcblx0XHR9KTtcblx0XHR0aGlzLmdyb3Vwcy5zcGxpY2UobGFzdEluc3RhbmNlSW5kZXggKyAxLCAwLCAuLi5zb3J0ZWRTb3VyY2VHcm91cHMpO1xuXHRcdGZvciAoY29uc3Qgc291cmNlR3JvdXAgb2Ygc29ydGVkU291cmNlR3JvdXBzKSB7XG5cdFx0XHRjb25zdCBzb3VyY2VHcm91cEluZGV4ID0gdGhpcy5ncm91cHMuaW5kZXhPZihzb3VyY2VHcm91cCk7XG5cdFx0XHR0aGlzLmdyb3Vwcy5zcGxpY2Uoc291cmNlR3JvdXBJbmRleCwgMSk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSW5zdGFuY2VzLmZpcmUoKTtcblx0fVxuXG5cdG1vdmVJbnN0YW5jZShzb3VyY2U6IElUZXJtaW5hbEluc3RhbmNlLCB0YXJnZXQ6IElUZXJtaW5hbEluc3RhbmNlLCBzaWRlOiAnYmVmb3JlJyB8ICdhZnRlcicpIHtcblx0XHRjb25zdCBzb3VyY2VHcm91cCA9IHRoaXMuZ2V0R3JvdXBGb3JJbnN0YW5jZShzb3VyY2UpO1xuXHRcdGNvbnN0IHRhcmdldEdyb3VwID0gdGhpcy5nZXRHcm91cEZvckluc3RhbmNlKHRhcmdldCk7XG5cdFx0aWYgKCFzb3VyY2VHcm91cCB8fCAhdGFyZ2V0R3JvdXApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBNb3ZlIGZyb20gdGhlIHNvdXJjZSBncm91cCB0byB0aGUgdGFyZ2V0IGdyb3VwXG5cdFx0aWYgKHNvdXJjZUdyb3VwICE9PSB0YXJnZXRHcm91cCkge1xuXHRcdFx0Ly8gTW92ZSBncm91cHNcblx0XHRcdHNvdXJjZUdyb3VwLnJlbW92ZUluc3RhbmNlKHNvdXJjZSk7XG5cdFx0XHR0YXJnZXRHcm91cC5hZGRJbnN0YW5jZShzb3VyY2UpO1xuXHRcdH1cblxuXHRcdC8vIFJlYXJyYW5nZSB3aXRoaW4gdGhlIHRhcmdldCBncm91cFxuXHRcdGNvbnN0IGluZGV4ID0gdGFyZ2V0R3JvdXAudGVybWluYWxJbnN0YW5jZXMuaW5kZXhPZih0YXJnZXQpICsgKHNpZGUgPT09ICdhZnRlcicgPyAxIDogMCk7XG5cdFx0dGFyZ2V0R3JvdXAubW92ZUluc3RhbmNlKHNvdXJjZSwgaW5kZXgsIHNpZGUpO1xuXHR9XG5cblx0dW5zcGxpdEluc3RhbmNlKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSkge1xuXHRcdGNvbnN0IG9sZEdyb3VwID0gdGhpcy5nZXRHcm91cEZvckluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRpZiAoIW9sZEdyb3VwIHx8IG9sZEdyb3VwLnRlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aCA8IDIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRvbGRHcm91cC5yZW1vdmVJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0dGhpcy5jcmVhdGVHcm91cChpbnN0YW5jZSk7XG5cdH1cblxuXHRqb2luSW5zdGFuY2VzKGluc3RhbmNlczogSVRlcm1pbmFsSW5zdGFuY2VbXSkge1xuXHRcdGNvbnN0IGdyb3VwID0gdGhpcy5nZXRHcm91cEZvckluc3RhbmNlKGluc3RhbmNlc1swXSk7XG5cdFx0aWYgKGdyb3VwKSB7XG5cdFx0XHRsZXQgZGlmZmVyZW50R3JvdXBzID0gdHJ1ZTtcblx0XHRcdGZvciAobGV0IGkgPSAxOyBpIDwgZ3JvdXAudGVybWluYWxJbnN0YW5jZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKGdyb3VwLnRlcm1pbmFsSW5zdGFuY2VzLmluY2x1ZGVzKGluc3RhbmNlc1tpXSkpIHtcblx0XHRcdFx0XHRkaWZmZXJlbnRHcm91cHMgPSBmYWxzZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFkaWZmZXJlbnRHcm91cHMgJiYgZ3JvdXAudGVybWluYWxJbnN0YW5jZXMubGVuZ3RoID09PSBpbnN0YW5jZXMubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gRmluZCB0aGUgZ3JvdXAgb2YgdGhlIGZpcnN0IGluc3RhbmNlIHRoYXQgaXMgdGhlIG9ubHkgaW5zdGFuY2UgaW4gdGhlIGdyb3VwLCBpZiBvbmUgZXhpc3RzXG5cdFx0bGV0IGNhbmRpZGF0ZUluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgY2FuZGlkYXRlR3JvdXA6IElUZXJtaW5hbEdyb3VwIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgaW5zdGFuY2VzKSB7XG5cdFx0XHRjb25zdCBncm91cCA9IHRoaXMuZ2V0R3JvdXBGb3JJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0XHRpZiAoZ3JvdXA/LnRlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRjYW5kaWRhdGVJbnN0YW5jZSA9IGluc3RhbmNlO1xuXHRcdFx0XHRjYW5kaWRhdGVHcm91cCA9IGdyb3VwO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgYSBuZXcgZ3JvdXAgaWYgbmVlZGVkXG5cdFx0aWYgKCFjYW5kaWRhdGVHcm91cCkge1xuXHRcdFx0Y2FuZGlkYXRlR3JvdXAgPSB0aGlzLmNyZWF0ZUdyb3VwKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2FzQWN0aXZlR3JvdXAgPSB0aGlzLmFjdGl2ZUdyb3VwID09PSBjYW5kaWRhdGVHcm91cDtcblxuXHRcdC8vIFVuc3BsaXQgYWxsIG90aGVyIGluc3RhbmNlcyBhbmQgYWRkIHRoZW0gdG8gdGhlIG5ldyBncm91cFxuXHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgaW5zdGFuY2VzKSB7XG5cdFx0XHRpZiAoaW5zdGFuY2UgPT09IGNhbmRpZGF0ZUluc3RhbmNlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvbGRHcm91cCA9IHRoaXMuZ2V0R3JvdXBGb3JJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0XHRpZiAoIW9sZEdyb3VwKSB7XG5cdFx0XHRcdC8vIFNvbWV0aGluZyB3ZW50IHdyb25nLCBkb24ndCBqb2luIHRoaXMgb25lXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0b2xkR3JvdXAucmVtb3ZlSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0Y2FuZGlkYXRlR3JvdXAuYWRkSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdH1cblxuXHRcdC8vIFNldCB0aGUgYWN0aXZlIHRlcm1pbmFsXG5cdFx0dGhpcy5zZXRBY3RpdmVJbnN0YW5jZShpbnN0YW5jZXNbMF0pO1xuXG5cdFx0Ly8gRmlyZSBldmVudHNcblx0XHR0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlcy5maXJlKCk7XG5cdFx0aWYgKCF3YXNBY3RpdmVHcm91cCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVHcm91cC5maXJlKHRoaXMuYWN0aXZlR3JvdXApO1xuXHRcdH1cblx0fVxuXG5cdGluc3RhbmNlSXNTcGxpdChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiBib29sZWFuIHtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuZ2V0R3JvdXBGb3JJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0aWYgKCFncm91cCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gZ3JvdXAudGVybWluYWxJbnN0YW5jZXMubGVuZ3RoID4gMTtcblx0fVxuXG5cdGdldEdyb3VwRm9ySW5zdGFuY2UoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogSVRlcm1pbmFsR3JvdXAgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdyb3Vwcy5maW5kKGdyb3VwID0+IGdyb3VwLnRlcm1pbmFsSW5zdGFuY2VzLmluY2x1ZGVzKGluc3RhbmNlKSk7XG5cdH1cblxuXHRnZXRHcm91cExhYmVscygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZ3JvdXBzLmZpbHRlcihncm91cCA9PiBncm91cC50ZXJtaW5hbEluc3RhbmNlcy5sZW5ndGggPiAwKS5tYXAoKGdyb3VwLCBpbmRleCkgPT4ge1xuXHRcdFx0cmV0dXJuIGAke2luZGV4ICsgMX06ICR7Z3JvdXAudGl0bGUgPyBncm91cC50aXRsZSA6ICcnfWA7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogVmlzaWJpbGl0eSBzaG91bGQgYmUgdXBkYXRlZCBpbiB0aGUgZm9sbG93aW5nIGNhc2VzOlxuXHQgKiAxLiBUb2dnbGUgYFRFUk1JTkFMX1ZJRVdfSURgIHZpc2liaWxpdHlcblx0ICogMi4gQ2hhbmdlIGFjdGl2ZSBncm91cFxuXHQgKiAzLiBDaGFuZ2UgaW5zdGFuY2VzIGluIGFjdGl2ZSBncm91cFxuXHQgKi9cblx0dXBkYXRlVmlzaWJpbGl0eSgpIHtcblx0XHRjb25zdCB2aXNpYmxlID0gdGhpcy5fdmlld3NTZXJ2aWNlLmlzVmlld1Zpc2libGUoVEVSTUlOQUxfVklFV19JRCk7XG5cdFx0dGhpcy5ncm91cHMuZm9yRWFjaCgoZywgaSkgPT4gZy5zZXRWaXNpYmxlKHZpc2libGUgJiYgaSA9PT0gdGhpcy5hY3RpdmVHcm91cEluZGV4KSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElJbnN0YW5jZUxvY2F0aW9uIHtcblx0Z3JvdXA6IElUZXJtaW5hbEdyb3VwO1xuXHRncm91cEluZGV4OiBudW1iZXI7XG5cdGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZTtcblx0aW5zdGFuY2VJbmRleDogbnVtYmVyO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywrQkFBK0I7QUFFeEMs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QSxRQUFJLENBQUMsZ0JBQWdCO0FBQ3BCLHVCQUFpQixLQUFLLFlBQVk7QUFBQSxJQUNuQztBQUVBLFVBQU0saUJBQWlCLEtBQUssZ0JBQWdCO0FBRzVDLGVBQVcsWUFBWSxXQUFXO0FBQ2pDLFVBQUksYUFBYSxtQkFBbUI7QUFDbkM7QUFBQSxNQUNEO0FBRUEsWUFBTSxXQUFXLEtBQUssb0JBQW9CLFFBQVE7QUFDbEQsVUFBSSxDQUFDLFVBQVU7QUFFZDtBQUFBLE1BQ0Q7QUFDQSxlQUFTLGVBQWUsUUFBUTtBQUNoQyxxQkFBZSxZQUFZLFFBQVE7QUFBQSxJQUNwQztBQUdBLFNBQUssa0JBQWtCLFVBQVUsQ0FBQyxDQUFDO0FBR25DLFNBQUssc0JBQXNCLEtBQUs7QUFDaEMsUUFBSSxDQUFDLGdCQUFnQjtBQUNwQixXQUFLLHdCQUF3QixLQUFLLEtBQUssV0FBVztBQUFBLElBQ25EO0FBQUEsRUFDRDtBQUFBLEVBRUEsZ0JBQWdCLFVBQXNDO0FBQ3JELFVBQU0sUUFBUSxLQUFLLG9CQUFvQixRQUFRO0FBQy9DLFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLE1BQU0sa0JBQWtCLFNBQVM7QUFBQSxFQUN6QztBQUFBLEVBRUEsb0JBQW9CLFVBQXlEO0FBQzVFLFdBQU8sS0FBSyxPQUFPLEtBQUssV0FBUyxNQUFNLGtCQUFrQixTQUFTLFFBQVEsQ0FBQztBQUFBLEVBQzVFO0FBQUEsRUFFQSxpQkFBMkI7QUFDMUIsV0FBTyxLQUFLLE9BQU8sT0FBTyxXQUFTLE1BQU0sa0JBQWtCLFNBQVMsQ0FBQyxFQUFFLElBQUksQ0FBQyxPQUFPLFVBQVU7QUFDNUYsYUFBTyxHQUFHLFFBQVEsQ0FBQyxLQUFLLE1BQU0sUUFBUSxNQUFNLFFBQVEsRUFBRTtBQUFBLElBQ3ZELENBQUM7QUFBQSxFQUNGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRQSxtQkFBbUI7QUFDbEIsVUFBTSxVQUFVLEtBQUssY0FBYyxjQUFjLGdCQUFnQjtBQUNqRSxTQUFLLE9BQU8sUUFBUSxDQUFDLEdBQUcsTUFBTSxFQUFFLFdBQVcsV0FBVyxNQUFNLEtBQUssZ0JBQWdCLENBQUM7QUFBQSxFQUNuRjtBQUNEO0FBMWVhLHVCQUFOO0FBQUEsRUF1Q0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0EzQ1U7IiwKICAibmFtZXMiOiBbInBvc2l0aW9uIiwgImdyb3VwIl0KfQo=
