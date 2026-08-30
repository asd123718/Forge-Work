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
import { onDidChangeFullscreen } from "../../../../base/browser/browser.js";
import { $, getActiveWindow, hide, show } from "../../../../base/browser/dom.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore, markAsSingleton, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { isNative } from "../../../../base/common/platform.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { hasCustomTitlebar } from "../../../../platform/window/common/window.js";
import { EditorPart } from "./editorPart.js";
import { WindowTitle } from "../titlebar/windowTitle.js";
import { IAuxiliaryWindowService } from "../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js";
import { GroupDirection, GroupsOrder, GroupActivationReason } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IWorkbenchLayoutService, Parts, shouldShowCustomTitleBar } from "../../../services/layout/browser/layoutService.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { IStatusbarService } from "../../../services/statusbar/browser/statusbar.js";
import { ITitleService } from "../../../services/title/browser/titleService.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { localize, localize2 } from "../../../../nls.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IsAuxiliaryWindowContext, IsAuxiliaryWindowFocusedContext, IsCompactTitleBarContext } from "../../../common/contextkeys.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
const compactWindowEmitter = markAsSingleton(new Emitter());
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleCompactAuxiliaryWindow",
      title: localize2("toggleCompactAuxiliaryWindow", "Toggle Window Compact Mode"),
      category: Categories.View,
      f1: true,
      precondition: IsAuxiliaryWindowFocusedContext
    });
  }
  async run() {
    compactWindowEmitter.fire({ windowId: getActiveWindow().vscodeWindowId, compact: "toggle" });
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.enableCompactAuxiliaryWindow",
      title: localize("enableCompactAuxiliaryWindow", "Turn On Compact Mode"),
      icon: Codicon.screenFull,
      menu: {
        id: MenuId.LayoutControlMenu,
        when: ContextKeyExpr.and(IsCompactTitleBarContext.toNegated(), IsAuxiliaryWindowContext),
        order: 0,
        group: "navigation"
      }
    });
  }
  async run() {
    compactWindowEmitter.fire({ windowId: getActiveWindow().vscodeWindowId, compact: true });
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.disableCompactAuxiliaryWindow",
      title: localize("disableCompactAuxiliaryWindow", "Turn Off Compact Mode"),
      icon: Codicon.screenNormal,
      menu: {
        id: MenuId.LayoutControlMenu,
        when: ContextKeyExpr.and(IsCompactTitleBarContext, IsAuxiliaryWindowContext),
        order: 0,
        group: "navigation"
      }
    });
  }
  async run() {
    compactWindowEmitter.fire({ windowId: getActiveWindow().vscodeWindowId, compact: false });
  }
});
let AuxiliaryEditorPart = class {
  constructor(editorPartsView, instantiationService, auxiliaryWindowService, lifecycleService, configurationService, statusbarService, titleService, editorService, layoutService) {
    this.editorPartsView = editorPartsView;
    this.instantiationService = instantiationService;
    this.auxiliaryWindowService = auxiliaryWindowService;
    this.lifecycleService = lifecycleService;
    this.configurationService = configurationService;
    this.statusbarService = statusbarService;
    this.titleService = titleService;
    this.editorService = editorService;
    this.layoutService = layoutService;
  }
  async create(label, options) {
    const that = this;
    const disposables = new DisposableStore();
    let compact = Boolean(options?.compact);
    function computeEditorPartHeightOffset() {
      let editorPartHeightOffset = 0;
      if (statusbarVisible) {
        editorPartHeightOffset += statusbarPart.height;
      }
      if (titlebarPart && titlebarVisible) {
        editorPartHeightOffset += titlebarPart.height;
      }
      return editorPartHeightOffset;
    }
    function updateStatusbarVisibility(fromEvent) {
      if (statusbarVisible) {
        show(statusbarPart.container);
      } else {
        hide(statusbarPart.container);
      }
      if (fromEvent) {
        auxiliaryWindow.layout();
      }
    }
    function updateTitlebarVisibility(fromEvent) {
      if (!titlebarPart) {
        return;
      }
      if (titlebarVisible) {
        show(titlebarPart.container);
      } else {
        hide(titlebarPart.container);
      }
      if (fromEvent) {
        auxiliaryWindow.layout();
      }
    }
    function updateCompact(newCompact) {
      if (newCompact === compact) {
        return;
      }
      compact = newCompact;
      auxiliaryWindow.updateOptions({ compact });
      titlebarPart?.updateOptions({ compact });
      editorPart.updateOptions({ compact });
      const oldStatusbarVisible = statusbarVisible;
      statusbarVisible = !compact && that.configurationService.getValue(AuxiliaryEditorPart.STATUS_BAR_VISIBILITY) !== false;
      if (oldStatusbarVisible !== statusbarVisible) {
        updateStatusbarVisibility(true);
      }
    }
    const auxiliaryWindow = disposables.add(await this.auxiliaryWindowService.open(options));
    const editorPartContainer = $(".part.editor", { role: "main" });
    editorPartContainer.style.position = "relative";
    auxiliaryWindow.container.appendChild(editorPartContainer);
    const editorPart = disposables.add(this.instantiationService.createInstance(AuxiliaryEditorPartImpl, auxiliaryWindow.window.vscodeWindowId, this.editorPartsView, options?.state, label));
    editorPart.updateOptions({ compact });
    disposables.add(this.editorPartsView.registerPart(editorPart));
    editorPart.create(editorPartContainer);
    const scopedEditorPartInstantiationService = disposables.add(editorPart.scopedInstantiationService.createChild(new ServiceCollection(
      [IEditorService, this.editorService.createScoped(editorPart, disposables)]
    )));
    let titlebarPart = void 0;
    let titlebarVisible = false;
    const useCustomTitle = isNative && hasCustomTitlebar(this.configurationService);
    if (useCustomTitle) {
      titlebarPart = disposables.add(this.titleService.createAuxiliaryTitlebarPart(auxiliaryWindow.container, editorPart, scopedEditorPartInstantiationService));
      titlebarPart.updateOptions({ compact });
      titlebarVisible = shouldShowCustomTitleBar(this.configurationService, auxiliaryWindow.window, void 0);
      const handleTitleBarVisibilityEvent = () => {
        const oldTitlebarPartVisible = titlebarVisible;
        titlebarVisible = shouldShowCustomTitleBar(this.configurationService, auxiliaryWindow.window, void 0);
        if (oldTitlebarPartVisible !== titlebarVisible) {
          updateTitlebarVisibility(true);
        }
      };
      disposables.add(titlebarPart.onDidChange(() => auxiliaryWindow.layout()));
      disposables.add(this.layoutService.onDidChangePartVisibility(() => handleTitleBarVisibilityEvent()));
      disposables.add(onDidChangeFullscreen((windowId) => {
        if (windowId !== auxiliaryWindow.window.vscodeWindowId) {
          return;
        }
        handleTitleBarVisibilityEvent();
      }));
      updateTitlebarVisibility(false);
    } else {
      disposables.add(scopedEditorPartInstantiationService.createInstance(WindowTitle, auxiliaryWindow.window));
    }
    const statusbarPart = disposables.add(this.statusbarService.createAuxiliaryStatusbarPart(auxiliaryWindow.container, scopedEditorPartInstantiationService));
    let statusbarVisible = !compact && this.configurationService.getValue(AuxiliaryEditorPart.STATUS_BAR_VISIBILITY) !== false;
    disposables.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AuxiliaryEditorPart.STATUS_BAR_VISIBILITY)) {
        statusbarVisible = !compact && this.configurationService.getValue(AuxiliaryEditorPart.STATUS_BAR_VISIBILITY) !== false;
        updateStatusbarVisibility(true);
      }
    }));
    updateStatusbarVisibility(false);
    const editorCloseListener = disposables.add(Event.once(editorPart.onWillClose)(() => auxiliaryWindow.window.close()));
    disposables.add(Event.once(auxiliaryWindow.onUnload)(() => {
      if (disposables.isDisposed) {
        return;
      }
      editorCloseListener.dispose();
      editorPart.close();
      disposables.dispose();
    }));
    disposables.add(Event.once(this.lifecycleService.onDidShutdown)(() => disposables.dispose()));
    disposables.add(auxiliaryWindow.onBeforeUnload((event) => {
      for (const group of editorPart.groups) {
        for (const editor of group.editors) {
          const canMoveVeto = editor.canMove(group.id, this.editorPartsView.mainPart.activeGroup.id);
          if (typeof canMoveVeto === "string") {
            group.openEditor(editor);
            event.veto(canMoveVeto);
            return;
          }
        }
      }
    }));
    disposables.add(auxiliaryWindow.onWillLayout((dimension) => {
      const titlebarPartHeight = titlebarPart?.height ?? 0;
      titlebarPart?.layout(dimension.width, titlebarPartHeight, 0, 0);
      const editorPartHeight = dimension.height - computeEditorPartHeightOffset();
      editorPart.layout(dimension.width, editorPartHeight, titlebarPartHeight, 0);
      statusbarPart.layout(dimension.width, statusbarPart.height, dimension.height - statusbarPart.height, 0);
    }));
    auxiliaryWindow.layout();
    disposables.add(compactWindowEmitter.event((e) => {
      if (e.windowId === auxiliaryWindow.window.vscodeWindowId) {
        let newCompact;
        if (typeof e.compact === "boolean") {
          newCompact = e.compact;
        } else {
          newCompact = !compact;
        }
        updateCompact(newCompact);
      }
    }));
    disposables.add(editorPart.onDidAddGroup((group) => {
      updateCompact(false);
      disposables.add(group.onDidActiveEditorChange(() => {
        if (group.count > 1) {
          updateCompact(false);
        }
      }));
    }));
    disposables.add(editorPart.activeGroup.onDidActiveEditorChange(() => {
      if (editorPart.activeGroup.count > 1) {
        updateCompact(false);
      }
    }));
    const scopedInstantiationService = disposables.add(scopedEditorPartInstantiationService.createChild(new ServiceCollection(
      [IStatusbarService, this.statusbarService.createScoped(statusbarPart, disposables)]
    )));
    return {
      part: editorPart,
      instantiationService: scopedInstantiationService,
      disposables
    };
  }
};
AuxiliaryEditorPart.STATUS_BAR_VISIBILITY = "workbench.statusBar.visible";
AuxiliaryEditorPart = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IAuxiliaryWindowService),
  __decorateParam(3, ILifecycleService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IStatusbarService),
  __decorateParam(6, ITitleService),
  __decorateParam(7, IEditorService),
  __decorateParam(8, IWorkbenchLayoutService)
], AuxiliaryEditorPart);
let AuxiliaryEditorPartImpl = class extends EditorPart {
  constructor(windowId, editorPartsView, state, groupsLabel, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService) {
    const id = AuxiliaryEditorPartImpl.COUNTER++;
    super(editorPartsView, `workbench.parts.auxiliaryEditor.${id}`, groupsLabel, windowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService);
    this.state = state;
    this._onWillClose = this._register(new Emitter());
    this.onWillClose = this._onWillClose.event;
    this.optionsDisposable = this._register(new MutableDisposable());
    this.isCompact = false;
  }
  handleContextKeys() {
    const isAuxiliaryWindowContext = IsAuxiliaryWindowContext.bindTo(this.scopedContextKeyService);
    isAuxiliaryWindowContext.set(true);
    super.handleContextKeys();
  }
  updateOptions(options) {
    this.isCompact = options.compact;
    if (options.compact) {
      if (!this.optionsDisposable.value) {
        this.optionsDisposable.value = this.enforcePartOptions({
          showTabs: "none",
          showBreadcrumbs: false,
          closeEmptyGroups: true
        });
      }
    } else {
      this.optionsDisposable.clear();
    }
  }
  addGroup(location, direction, groupToCopy) {
    if (this.isCompact) {
      location = this.editorPartsView.mainPart.activeGroup;
    }
    return super.addGroup(location, direction, groupToCopy);
  }
  removeGroup(group, preserveFocus) {
    const groupView = this.assertGroupView(group);
    if (this.count === 1 && this.activeGroup === groupView) {
      this.doRemoveLastGroup(preserveFocus);
    } else {
      super.removeGroup(group, preserveFocus);
    }
  }
  doRemoveLastGroup(preserveFocus) {
    const restoreFocus = !preserveFocus && this.shouldRestoreFocus(this.container);
    const mostRecentlyActiveGroups = this.editorPartsView.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    const nextActiveGroup = mostRecentlyActiveGroups[1];
    if (nextActiveGroup) {
      nextActiveGroup.groupsView.activateGroup(nextActiveGroup, void 0, GroupActivationReason.PART_CLOSE);
    }
    if (nextActiveGroup && restoreFocus) {
      const nextGroupInHiddenMainPart = nextActiveGroup.groupsView === this.editorPartsView.mainPart && !this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow);
      if (!nextGroupInHiddenMainPart) {
        nextActiveGroup.focus();
      }
    }
    this.doClose(
      false
      /* do not merge any confirming editors to main part */
    );
  }
  loadState() {
    return this.state;
  }
  saveState() {
    return;
  }
  close() {
    return this.doClose(
      true
      /* merge all confirming editors to main part */
    );
  }
  doClose(mergeConfirmingEditorsToMainPart) {
    let result = true;
    if (mergeConfirmingEditorsToMainPart) {
      for (const group of this.groups) {
        group.closeAllEditors({ excludeConfirming: true, force: true });
      }
      result = this.mergeGroupsToMainPart();
      if (!result) {
        return false;
      }
    }
    this._onWillClose.fire();
    return result;
  }
  mergeGroupsToMainPart() {
    if (!this.groups.some((group) => group.count > 0)) {
      return true;
    }
    let targetGroup = void 0;
    for (const group of this.editorPartsView.mainPart.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
      if (!group.isLocked) {
        targetGroup = group;
        break;
      }
    }
    if (!targetGroup) {
      targetGroup = this.editorPartsView.mainPart.addGroup(this.editorPartsView.mainPart.activeGroup, this.partOptions.openSideBySideDirection === "right" ? GroupDirection.RIGHT : GroupDirection.DOWN);
    }
    const result = this.mergeAllGroups(targetGroup, {
      // Try to reduce the impact of closing the auxiliary window
      // as much as possible by not changing existing editors
      // in the main window.
      preserveExistingIndex: true
    });
    targetGroup.focus();
    return result;
  }
};
AuxiliaryEditorPartImpl.COUNTER = 1;
AuxiliaryEditorPartImpl = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IWorkbenchLayoutService),
  __decorateParam(9, IHostService),
  __decorateParam(10, IContextKeyService)
], AuxiliaryEditorPartImpl);
export {
  AuxiliaryEditorPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGF1eGlsaWFyeUVkaXRvclBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBvbkRpZENoYW5nZUZ1bGxzY3JlZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvYnJvd3Nlci5qcyc7XG5pbXBvcnQgeyAkLCBnZXRBY3RpdmVXaW5kb3csIGhpZGUsIHNob3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBtYXJrQXNTaW5nbGV0b24sIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzTmF0aXZlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBoYXNDdXN0b21UaXRsZWJhciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cFZpZXcsIElFZGl0b3JQYXJ0c1ZpZXcgfSBmcm9tICcuL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYXJ0LCBJRWRpdG9yUGFydFVJU3RhdGUgfSBmcm9tICcuL2VkaXRvclBhcnQuanMnO1xuaW1wb3J0IHsgSUF1eGlsaWFyeVRpdGxlYmFyUGFydCB9IGZyb20gJy4uL3RpdGxlYmFyL3RpdGxlYmFyUGFydC5qcyc7XG5pbXBvcnQgeyBXaW5kb3dUaXRsZSB9IGZyb20gJy4uL3RpdGxlYmFyL3dpbmRvd1RpdGxlLmpzJztcbmltcG9ydCB7IElBdXhpbGlhcnlXaW5kb3dPcGVuT3B0aW9ucywgSUF1eGlsaWFyeVdpbmRvd1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXhpbGlhcnlXaW5kb3cvYnJvd3Nlci9hdXhpbGlhcnlXaW5kb3dTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdyb3VwRGlyZWN0aW9uLCBHcm91cHNPcmRlciwgSUF1eGlsaWFyeUVkaXRvclBhcnQsIEdyb3VwQWN0aXZhdGlvblJlYXNvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUGFydHMsIHNob3VsZFNob3dDdXN0b21UaXRsZUJhciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJU3RhdHVzYmFyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci5qcyc7XG5pbXBvcnQgeyBJVGl0bGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGl0bGUvYnJvd3Nlci90aXRsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElzQXV4aWxpYXJ5V2luZG93Q29udGV4dCwgSXNBdXhpbGlhcnlXaW5kb3dGb2N1c2VkQ29udGV4dCwgSXNDb21wYWN0VGl0bGVCYXJDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgR3JvdXBJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUF1eGlsaWFyeUVkaXRvclBhcnRPcGVuT3B0aW9ucyBleHRlbmRzIElBdXhpbGlhcnlXaW5kb3dPcGVuT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHN0YXRlPzogSUVkaXRvclBhcnRVSVN0YXRlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDcmVhdGVBdXhpbGlhcnlFZGl0b3JQYXJ0UmVzdWx0IHtcblx0cmVhZG9ubHkgcGFydDogQXV4aWxpYXJ5RWRpdG9yUGFydEltcGw7XG5cdHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmNvbnN0IGNvbXBhY3RXaW5kb3dFbWl0dGVyID0gbWFya0FzU2luZ2xldG9uKG5ldyBFbWl0dGVyPHsgd2luZG93SWQ6IG51bWJlcjsgY29tcGFjdDogYm9vbGVhbiB8ICd0b2dnbGUnIH0+KCkpO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlQ29tcGFjdEF1eGlsaWFyeVdpbmRvdycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0b2dnbGVDb21wYWN0QXV4aWxpYXJ5V2luZG93JywgXCJUb2dnbGUgV2luZG93IENvbXBhY3QgTW9kZVwiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogSXNBdXhpbGlhcnlXaW5kb3dGb2N1c2VkQ29udGV4dFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbXBhY3RXaW5kb3dFbWl0dGVyLmZpcmUoeyB3aW5kb3dJZDogZ2V0QWN0aXZlV2luZG93KCkudnNjb2RlV2luZG93SWQsIGNvbXBhY3Q6ICd0b2dnbGUnIH0pO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmVuYWJsZUNvbXBhY3RBdXhpbGlhcnlXaW5kb3cnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdlbmFibGVDb21wYWN0QXV4aWxpYXJ5V2luZG93JywgXCJUdXJuIE9uIENvbXBhY3QgTW9kZVwiKSxcblx0XHRcdGljb246IENvZGljb24uc2NyZWVuRnVsbCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5MYXlvdXRDb250cm9sTWVudSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKElzQ29tcGFjdFRpdGxlQmFyQ29udGV4dC50b05lZ2F0ZWQoKSwgSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0KSxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbidcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb21wYWN0V2luZG93RW1pdHRlci5maXJlKHsgd2luZG93SWQ6IGdldEFjdGl2ZVdpbmRvdygpLnZzY29kZVdpbmRvd0lkLCBjb21wYWN0OiB0cnVlIH0pO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmRpc2FibGVDb21wYWN0QXV4aWxpYXJ5V2luZG93Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZGlzYWJsZUNvbXBhY3RBdXhpbGlhcnlXaW5kb3cnLCBcIlR1cm4gT2ZmIENvbXBhY3QgTW9kZVwiKSxcblx0XHRcdGljb246IENvZGljb24uc2NyZWVuTm9ybWFsLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkxheW91dENvbnRyb2xNZW51LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNDb21wYWN0VGl0bGVCYXJDb250ZXh0LCBJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQpLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbXBhY3RXaW5kb3dFbWl0dGVyLmZpcmUoeyB3aW5kb3dJZDogZ2V0QWN0aXZlV2luZG93KCkudnNjb2RlV2luZG93SWQsIGNvbXBhY3Q6IGZhbHNlIH0pO1xuXHR9XG59KTtcblxuZXhwb3J0IGNsYXNzIEF1eGlsaWFyeUVkaXRvclBhcnQge1xuXG5cdHByaXZhdGUgc3RhdGljIFNUQVRVU19CQVJfVklTSUJJTElUWSA9ICd3b3JrYmVuY2guc3RhdHVzQmFyLnZpc2libGUnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yUGFydHNWaWV3OiBJRWRpdG9yUGFydHNWaWV3LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQXV4aWxpYXJ5V2luZG93U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1eGlsaWFyeVdpbmRvd1NlcnZpY2U6IElBdXhpbGlhcnlXaW5kb3dTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RhdHVzYmFyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0YXR1c2JhclNlcnZpY2U6IElTdGF0dXNiYXJTZXJ2aWNlLFxuXHRcdEBJVGl0bGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGl0bGVTZXJ2aWNlOiBJVGl0bGVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlXG5cdCkge1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlKGxhYmVsOiBzdHJpbmcsIG9wdGlvbnM/OiBJQXV4aWxpYXJ5RWRpdG9yUGFydE9wZW5PcHRpb25zKTogUHJvbWlzZTxJQ3JlYXRlQXV4aWxpYXJ5RWRpdG9yUGFydFJlc3VsdD4ge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0bGV0IGNvbXBhY3QgPSBCb29sZWFuKG9wdGlvbnM/LmNvbXBhY3QpO1xuXG5cdFx0ZnVuY3Rpb24gY29tcHV0ZUVkaXRvclBhcnRIZWlnaHRPZmZzZXQoKTogbnVtYmVyIHtcblx0XHRcdGxldCBlZGl0b3JQYXJ0SGVpZ2h0T2Zmc2V0ID0gMDtcblxuXHRcdFx0aWYgKHN0YXR1c2JhclZpc2libGUpIHtcblx0XHRcdFx0ZWRpdG9yUGFydEhlaWdodE9mZnNldCArPSBzdGF0dXNiYXJQYXJ0LmhlaWdodDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRpdGxlYmFyUGFydCAmJiB0aXRsZWJhclZpc2libGUpIHtcblx0XHRcdFx0ZWRpdG9yUGFydEhlaWdodE9mZnNldCArPSB0aXRsZWJhclBhcnQuaGVpZ2h0O1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZWRpdG9yUGFydEhlaWdodE9mZnNldDtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiB1cGRhdGVTdGF0dXNiYXJWaXNpYmlsaXR5KGZyb21FdmVudDogYm9vbGVhbik6IHZvaWQge1xuXHRcdFx0aWYgKHN0YXR1c2JhclZpc2libGUpIHtcblx0XHRcdFx0c2hvdyhzdGF0dXNiYXJQYXJ0LmNvbnRhaW5lcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoaWRlKHN0YXR1c2JhclBhcnQuY29udGFpbmVyKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGZyb21FdmVudCkge1xuXHRcdFx0XHRhdXhpbGlhcnlXaW5kb3cubGF5b3V0KCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdXBkYXRlVGl0bGViYXJWaXNpYmlsaXR5KGZyb21FdmVudDogYm9vbGVhbik6IHZvaWQge1xuXHRcdFx0aWYgKCF0aXRsZWJhclBhcnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGl0bGViYXJWaXNpYmxlKSB7XG5cdFx0XHRcdHNob3codGl0bGViYXJQYXJ0LmNvbnRhaW5lcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoaWRlKHRpdGxlYmFyUGFydC5jb250YWluZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZnJvbUV2ZW50KSB7XG5cdFx0XHRcdGF1eGlsaWFyeVdpbmRvdy5sYXlvdXQoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmdW5jdGlvbiB1cGRhdGVDb21wYWN0KG5ld0NvbXBhY3Q6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdGlmIChuZXdDb21wYWN0ID09PSBjb21wYWN0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29tcGFjdCA9IG5ld0NvbXBhY3Q7XG5cdFx0XHRhdXhpbGlhcnlXaW5kb3cudXBkYXRlT3B0aW9ucyh7IGNvbXBhY3QgfSk7XG5cdFx0XHR0aXRsZWJhclBhcnQ/LnVwZGF0ZU9wdGlvbnMoeyBjb21wYWN0IH0pO1xuXHRcdFx0ZWRpdG9yUGFydC51cGRhdGVPcHRpb25zKHsgY29tcGFjdCB9KTtcblxuXHRcdFx0Y29uc3Qgb2xkU3RhdHVzYmFyVmlzaWJsZSA9IHN0YXR1c2JhclZpc2libGU7XG5cdFx0XHRzdGF0dXNiYXJWaXNpYmxlID0gIWNvbXBhY3QgJiYgdGhhdC5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBdXhpbGlhcnlFZGl0b3JQYXJ0LlNUQVRVU19CQVJfVklTSUJJTElUWSkgIT09IGZhbHNlO1xuXHRcdFx0aWYgKG9sZFN0YXR1c2JhclZpc2libGUgIT09IHN0YXR1c2JhclZpc2libGUpIHtcblx0XHRcdFx0dXBkYXRlU3RhdHVzYmFyVmlzaWJpbGl0eSh0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBdXhpbGlhcnkgV2luZG93XG5cdFx0Y29uc3QgYXV4aWxpYXJ5V2luZG93ID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IHRoaXMuYXV4aWxpYXJ5V2luZG93U2VydmljZS5vcGVuKG9wdGlvbnMpKTtcblxuXHRcdC8vIEVkaXRvciBQYXJ0XG5cdFx0Y29uc3QgZWRpdG9yUGFydENvbnRhaW5lciA9ICQoJy5wYXJ0LmVkaXRvcicsIHsgcm9sZTogJ21haW4nIH0pO1xuXHRcdGVkaXRvclBhcnRDb250YWluZXIuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRcdGF1eGlsaWFyeVdpbmRvdy5jb250YWluZXIuYXBwZW5kQ2hpbGQoZWRpdG9yUGFydENvbnRhaW5lcik7XG5cblx0XHRjb25zdCBlZGl0b3JQYXJ0ID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQXV4aWxpYXJ5RWRpdG9yUGFydEltcGwsIGF1eGlsaWFyeVdpbmRvdy53aW5kb3cudnNjb2RlV2luZG93SWQsIHRoaXMuZWRpdG9yUGFydHNWaWV3LCBvcHRpb25zPy5zdGF0ZSwgbGFiZWwpKTtcblx0XHRlZGl0b3JQYXJ0LnVwZGF0ZU9wdGlvbnMoeyBjb21wYWN0IH0pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmVkaXRvclBhcnRzVmlldy5yZWdpc3RlclBhcnQoZWRpdG9yUGFydCkpO1xuXHRcdGVkaXRvclBhcnQuY3JlYXRlKGVkaXRvclBhcnRDb250YWluZXIpO1xuXG5cdFx0Y29uc3Qgc2NvcGVkRWRpdG9yUGFydEluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGVkaXRvclBhcnQuc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lFZGl0b3JTZXJ2aWNlLCB0aGlzLmVkaXRvclNlcnZpY2UuY3JlYXRlU2NvcGVkKGVkaXRvclBhcnQsIGRpc3Bvc2FibGVzKV1cblx0XHQpKSk7XG5cblx0XHQvLyBUaXRsZWJhclxuXHRcdGxldCB0aXRsZWJhclBhcnQ6IElBdXhpbGlhcnlUaXRsZWJhclBhcnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IHRpdGxlYmFyVmlzaWJsZSA9IGZhbHNlO1xuXHRcdGNvbnN0IHVzZUN1c3RvbVRpdGxlID0gaXNOYXRpdmUgJiYgaGFzQ3VzdG9tVGl0bGViYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7IC8vIGN1c3RvbSB0aXRsZSBpbiBhdXggd2luZG93cyBvbmx5IGVuYWJsZWQgaW4gbmF0aXZlXG5cdFx0aWYgKHVzZUN1c3RvbVRpdGxlKSB7XG5cdFx0XHR0aXRsZWJhclBhcnQgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy50aXRsZVNlcnZpY2UuY3JlYXRlQXV4aWxpYXJ5VGl0bGViYXJQYXJ0KGF1eGlsaWFyeVdpbmRvdy5jb250YWluZXIsIGVkaXRvclBhcnQsIHNjb3BlZEVkaXRvclBhcnRJbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdFx0dGl0bGViYXJQYXJ0LnVwZGF0ZU9wdGlvbnMoeyBjb21wYWN0IH0pO1xuXHRcdFx0dGl0bGViYXJWaXNpYmxlID0gc2hvdWxkU2hvd0N1c3RvbVRpdGxlQmFyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIGF1eGlsaWFyeVdpbmRvdy53aW5kb3csIHVuZGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IGhhbmRsZVRpdGxlQmFyVmlzaWJpbGl0eUV2ZW50ID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBvbGRUaXRsZWJhclBhcnRWaXNpYmxlID0gdGl0bGViYXJWaXNpYmxlO1xuXHRcdFx0XHR0aXRsZWJhclZpc2libGUgPSBzaG91bGRTaG93Q3VzdG9tVGl0bGVCYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgYXV4aWxpYXJ5V2luZG93LndpbmRvdywgdW5kZWZpbmVkKTtcblx0XHRcdFx0aWYgKG9sZFRpdGxlYmFyUGFydFZpc2libGUgIT09IHRpdGxlYmFyVmlzaWJsZSkge1xuXHRcdFx0XHRcdHVwZGF0ZVRpdGxlYmFyVmlzaWJpbGl0eSh0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRpdGxlYmFyUGFydC5vbkRpZENoYW5nZSgoKSA9PiBhdXhpbGlhcnlXaW5kb3cubGF5b3V0KCkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmxheW91dFNlcnZpY2Uub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eSgoKSA9PiBoYW5kbGVUaXRsZUJhclZpc2liaWxpdHlFdmVudCgpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQob25EaWRDaGFuZ2VGdWxsc2NyZWVuKHdpbmRvd0lkID0+IHtcblx0XHRcdFx0aWYgKHdpbmRvd0lkICE9PSBhdXhpbGlhcnlXaW5kb3cud2luZG93LnZzY29kZVdpbmRvd0lkKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBpZ25vcmUgYWxsIGJ1dCBvdXIgd2luZG93XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRoYW5kbGVUaXRsZUJhclZpc2liaWxpdHlFdmVudCgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR1cGRhdGVUaXRsZWJhclZpc2liaWxpdHkoZmFsc2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2NvcGVkRWRpdG9yUGFydEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdpbmRvd1RpdGxlLCBhdXhpbGlhcnlXaW5kb3cud2luZG93KSk7XG5cdFx0fVxuXG5cdFx0Ly8gU3RhdHVzYmFyXG5cdFx0Y29uc3Qgc3RhdHVzYmFyUGFydCA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLnN0YXR1c2JhclNlcnZpY2UuY3JlYXRlQXV4aWxpYXJ5U3RhdHVzYmFyUGFydChhdXhpbGlhcnlXaW5kb3cuY29udGFpbmVyLCBzY29wZWRFZGl0b3JQYXJ0SW5zdGFudGlhdGlvblNlcnZpY2UpKTtcblx0XHRsZXQgc3RhdHVzYmFyVmlzaWJsZSA9ICFjb21wYWN0ICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQXV4aWxpYXJ5RWRpdG9yUGFydC5TVEFUVVNfQkFSX1ZJU0lCSUxJVFkpICE9PSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBdXhpbGlhcnlFZGl0b3JQYXJ0LlNUQVRVU19CQVJfVklTSUJJTElUWSkpIHtcblx0XHRcdFx0c3RhdHVzYmFyVmlzaWJsZSA9ICFjb21wYWN0ICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQXV4aWxpYXJ5RWRpdG9yUGFydC5TVEFUVVNfQkFSX1ZJU0lCSUxJVFkpICE9PSBmYWxzZTtcblxuXHRcdFx0XHR1cGRhdGVTdGF0dXNiYXJWaXNpYmlsaXR5KHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHVwZGF0ZVN0YXR1c2JhclZpc2liaWxpdHkoZmFsc2UpO1xuXG5cdFx0Ly8gTGlmZWN5Y2xlXG5cdFx0Y29uc3QgZWRpdG9yQ2xvc2VMaXN0ZW5lciA9IGRpc3Bvc2FibGVzLmFkZChFdmVudC5vbmNlKGVkaXRvclBhcnQub25XaWxsQ2xvc2UpKCgpID0+IGF1eGlsaWFyeVdpbmRvdy53aW5kb3cuY2xvc2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5vbmNlKGF1eGlsaWFyeVdpbmRvdy5vblVubG9hZCkoKCkgPT4ge1xuXHRcdFx0aWYgKGRpc3Bvc2FibGVzLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyB0aGUgY2xvc2UgaGFwcGVuZWQgYXMgcGFydCBvZiBhbiBlYXJsaWVyIGRpc3Bvc2UgY2FsbFxuXHRcdFx0fVxuXG5cdFx0XHRlZGl0b3JDbG9zZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdGVkaXRvclBhcnQuY2xvc2UoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50Lm9uY2UodGhpcy5saWZlY3ljbGVTZXJ2aWNlLm9uRGlkU2h1dGRvd24pKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhdXhpbGlhcnlXaW5kb3cub25CZWZvcmVVbmxvYWQoZXZlbnQgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiBlZGl0b3JQYXJ0Lmdyb3Vwcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBncm91cC5lZGl0b3JzKSB7XG5cdFx0XHRcdFx0Ly8gQ2xvc2luZyBhbiBhdXhpbGlhcnkgd2luZG93IHdpdGggb3BlbmVkIGVkaXRvcnNcblx0XHRcdFx0XHQvLyB3aWxsIG1vdmUgdGhlIGVkaXRvcnMgdG8gdGhlIG1haW4gd2luZG93LiBBcyBzdWNoLFxuXHRcdFx0XHRcdC8vIHdlIG5lZWQgdG8gdmFsaWRhdGUgdGhhdCB3ZSBjYW4gbW92ZSBhbmQgb3RoZXJ3aXNlXG5cdFx0XHRcdFx0Ly8gcHJldmVudCB0aGUgd2luZG93IGZyb20gY2xvc2luZy5cblx0XHRcdFx0XHRjb25zdCBjYW5Nb3ZlVmV0byA9IGVkaXRvci5jYW5Nb3ZlKGdyb3VwLmlkLCB0aGlzLmVkaXRvclBhcnRzVmlldy5tYWluUGFydC5hY3RpdmVHcm91cC5pZCk7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBjYW5Nb3ZlVmV0byA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdGdyb3VwLm9wZW5FZGl0b3IoZWRpdG9yKTtcblx0XHRcdFx0XHRcdGV2ZW50LnZldG8oY2FuTW92ZVZldG8pO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIExheW91dDogc3BlY2lmaWNhbGx5IGBvbldpbGxMYXlvdXRgIHRvIGhhdmUgYSBjaGFuY2Vcblx0XHQvLyB0byBidWlsZCB0aGUgYXV4IGVkaXRvciBwYXJ0IGJlZm9yZSBvdGhlciBjb21wb25lbnRzXG5cdFx0Ly8gaGF2ZSBhIGNoYW5jZSB0byByZWFjdC5cblx0XHRkaXNwb3NhYmxlcy5hZGQoYXV4aWxpYXJ5V2luZG93Lm9uV2lsbExheW91dChkaW1lbnNpb24gPT4ge1xuXHRcdFx0Y29uc3QgdGl0bGViYXJQYXJ0SGVpZ2h0ID0gdGl0bGViYXJQYXJ0Py5oZWlnaHQgPz8gMDtcblx0XHRcdHRpdGxlYmFyUGFydD8ubGF5b3V0KGRpbWVuc2lvbi53aWR0aCwgdGl0bGViYXJQYXJ0SGVpZ2h0LCAwLCAwKTtcblxuXHRcdFx0Y29uc3QgZWRpdG9yUGFydEhlaWdodCA9IGRpbWVuc2lvbi5oZWlnaHQgLSBjb21wdXRlRWRpdG9yUGFydEhlaWdodE9mZnNldCgpO1xuXHRcdFx0ZWRpdG9yUGFydC5sYXlvdXQoZGltZW5zaW9uLndpZHRoLCBlZGl0b3JQYXJ0SGVpZ2h0LCB0aXRsZWJhclBhcnRIZWlnaHQsIDApO1xuXG5cdFx0XHRzdGF0dXNiYXJQYXJ0LmxheW91dChkaW1lbnNpb24ud2lkdGgsIHN0YXR1c2JhclBhcnQuaGVpZ2h0LCBkaW1lbnNpb24uaGVpZ2h0IC0gc3RhdHVzYmFyUGFydC5oZWlnaHQsIDApO1xuXHRcdH0pKTtcblx0XHRhdXhpbGlhcnlXaW5kb3cubGF5b3V0KCk7XG5cblx0XHQvLyBDb21wYWN0IG1vZGVcblx0XHRkaXNwb3NhYmxlcy5hZGQoY29tcGFjdFdpbmRvd0VtaXR0ZXIuZXZlbnQoZSA9PiB7XG5cdFx0XHRpZiAoZS53aW5kb3dJZCA9PT0gYXV4aWxpYXJ5V2luZG93LndpbmRvdy52c2NvZGVXaW5kb3dJZCkge1xuXHRcdFx0XHRsZXQgbmV3Q29tcGFjdDogYm9vbGVhbjtcblx0XHRcdFx0aWYgKHR5cGVvZiBlLmNvbXBhY3QgPT09ICdib29sZWFuJykge1xuXHRcdFx0XHRcdG5ld0NvbXBhY3QgPSBlLmNvbXBhY3Q7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bmV3Q29tcGFjdCA9ICFjb21wYWN0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHVwZGF0ZUNvbXBhY3QobmV3Q29tcGFjdCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvclBhcnQub25EaWRBZGRHcm91cChncm91cCA9PiB7XG5cdFx0XHR1cGRhdGVDb21wYWN0KGZhbHNlKTsgLy8gbGVhdmUgY29tcGFjdCBtb2RlIHdoZW4gYSBncm91cCBpcyBhZGRlZFxuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZ3JvdXAub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRpZiAoZ3JvdXAuY291bnQgPiAxKSB7XG5cdFx0XHRcdFx0dXBkYXRlQ29tcGFjdChmYWxzZSk7IC8vIGxlYXZlIGNvbXBhY3QgbW9kZSB3aGVuIG1vcmUgdGhhbiAxIGVkaXRvciBpcyBhY3RpdmVcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3JQYXJ0LmFjdGl2ZUdyb3VwLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmIChlZGl0b3JQYXJ0LmFjdGl2ZUdyb3VwLmNvdW50ID4gMSkge1xuXHRcdFx0XHR1cGRhdGVDb21wYWN0KGZhbHNlKTsgLy8gbGVhdmUgY29tcGFjdCBtb2RlIHdoZW4gbW9yZSB0aGFuIDEgZWRpdG9yIGlzIGFjdGl2ZVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEhhdmUgYSBzY29wZWQgaW5zdGFudGlhdGlvbiBzZXJ2aWNlIHRoYXQgaXMgc2NvcGVkIHRvIHRoZSBhdXhpbGlhcnkgd2luZG93XG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoc2NvcGVkRWRpdG9yUGFydEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJU3RhdHVzYmFyU2VydmljZSwgdGhpcy5zdGF0dXNiYXJTZXJ2aWNlLmNyZWF0ZVNjb3BlZChzdGF0dXNiYXJQYXJ0LCBkaXNwb3NhYmxlcyldXG5cdFx0KSkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHBhcnQ6IGVkaXRvclBhcnQsXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZTogc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRkaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cbn1cblxuY2xhc3MgQXV4aWxpYXJ5RWRpdG9yUGFydEltcGwgZXh0ZW5kcyBFZGl0b3JQYXJ0IGltcGxlbWVudHMgSUF1eGlsaWFyeUVkaXRvclBhcnQge1xuXG5cdHByaXZhdGUgc3RhdGljIENPVU5URVIgPSAxO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbENsb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbENsb3NlID0gdGhpcy5fb25XaWxsQ2xvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIGlzQ29tcGFjdCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHdpbmRvd0lkOiBudW1iZXIsXG5cdFx0ZWRpdG9yUGFydHNWaWV3OiBJRWRpdG9yUGFydHNWaWV3LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc3RhdGU6IElFZGl0b3JQYXJ0VUlTdGF0ZSB8IHVuZGVmaW5lZCxcblx0XHRncm91cHNMYWJlbDogc3RyaW5nLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZVxuXHQpIHtcblx0XHRjb25zdCBpZCA9IEF1eGlsaWFyeUVkaXRvclBhcnRJbXBsLkNPVU5URVIrKztcblx0XHRzdXBlcihlZGl0b3JQYXJ0c1ZpZXcsIGB3b3JrYmVuY2gucGFydHMuYXV4aWxpYXJ5RWRpdG9yLiR7aWR9YCwgZ3JvdXBzTGFiZWwsIHdpbmRvd0lkLCBpbnN0YW50aWF0aW9uU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxheW91dFNlcnZpY2UsIGhvc3RTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgaGFuZGxlQ29udGV4dEtleXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgaXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0ID0gSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQuc2V0KHRydWUpO1xuXG5cdFx0c3VwZXIuaGFuZGxlQ29udGV4dEtleXMoKTtcblx0fVxuXG5cdHVwZGF0ZU9wdGlvbnMob3B0aW9uczogeyBjb21wYWN0OiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHR0aGlzLmlzQ29tcGFjdCA9IG9wdGlvbnMuY29tcGFjdDtcblxuXHRcdGlmIChvcHRpb25zLmNvbXBhY3QpIHtcblx0XHRcdGlmICghdGhpcy5vcHRpb25zRGlzcG9zYWJsZS52YWx1ZSkge1xuXHRcdFx0XHR0aGlzLm9wdGlvbnNEaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5lbmZvcmNlUGFydE9wdGlvbnMoe1xuXHRcdFx0XHRcdHNob3dUYWJzOiAnbm9uZScsXG5cdFx0XHRcdFx0c2hvd0JyZWFkY3J1bWJzOiBmYWxzZSxcblx0XHRcdFx0XHRjbG9zZUVtcHR5R3JvdXBzOiB0cnVlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm9wdGlvbnNEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYWRkR3JvdXAobG9jYXRpb246IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIsIGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24sIGdyb3VwVG9Db3B5PzogSUVkaXRvckdyb3VwVmlldyk6IElFZGl0b3JHcm91cFZpZXcge1xuXHRcdGlmICh0aGlzLmlzQ29tcGFjdCkge1xuXHRcdFx0Ly8gV2hlbiBpbiBjb21wYWN0IG1vZGUsIHdlIHByZWZlciB0byBvcGVuIGdyb3VwcyBpbiB0aGUgbWFpbiBwYXJ0XG5cdFx0XHQvLyBhcyBjb21wYWN0IG1vZGUgaXMgdHlwaWNhbGx5IG1lYW50IGZvciBzaG93aW5nIGp1c3QgMSBlZGl0b3IuXG5cdFx0XHRsb2NhdGlvbiA9IHRoaXMuZWRpdG9yUGFydHNWaWV3Lm1haW5QYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdXBlci5hZGRHcm91cChsb2NhdGlvbiwgZGlyZWN0aW9uLCBncm91cFRvQ29weSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW1vdmVHcm91cChncm91cDogbnVtYmVyIHwgSUVkaXRvckdyb3VwVmlldywgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4pOiB2b2lkIHtcblxuXHRcdC8vIENsb3NlIGF1eCB3aW5kb3cgd2hlbiBsYXN0IGdyb3VwIHJlbW92ZWRcblx0XHRjb25zdCBncm91cFZpZXcgPSB0aGlzLmFzc2VydEdyb3VwVmlldyhncm91cCk7XG5cdFx0aWYgKHRoaXMuY291bnQgPT09IDEgJiYgdGhpcy5hY3RpdmVHcm91cCA9PT0gZ3JvdXBWaWV3KSB7XG5cdFx0XHR0aGlzLmRvUmVtb3ZlTGFzdEdyb3VwKHByZXNlcnZlRm9jdXMpO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSBkZWxlZ2F0ZSB0byBwYXJlbnQgaW1wbGVtZW50YXRpb25cblx0XHRlbHNlIHtcblx0XHRcdHN1cGVyLnJlbW92ZUdyb3VwKGdyb3VwLCBwcmVzZXJ2ZUZvY3VzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRvUmVtb3ZlTGFzdEdyb3VwKHByZXNlcnZlRm9jdXM/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzdG9yZUZvY3VzID0gIXByZXNlcnZlRm9jdXMgJiYgdGhpcy5zaG91bGRSZXN0b3JlRm9jdXModGhpcy5jb250YWluZXIpO1xuXG5cdFx0Ly8gQWN0aXZhdGUgbmV4dCBncm91cCB3aGVuIGNsb3Npbmdcblx0XHRjb25zdCBtb3N0UmVjZW50bHlBY3RpdmVHcm91cHMgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpO1xuXHRcdGNvbnN0IG5leHRBY3RpdmVHcm91cCA9IG1vc3RSZWNlbnRseUFjdGl2ZUdyb3Vwc1sxXTsgLy8gWzBdIHdpbGwgYmUgdGhlIGN1cnJlbnQgZ3JvdXAgd2UgYXJlIGFib3V0IHRvIGRpc3Bvc2Vcblx0XHRpZiAobmV4dEFjdGl2ZUdyb3VwKSB7XG5cdFx0XHRuZXh0QWN0aXZlR3JvdXAuZ3JvdXBzVmlldy5hY3RpdmF0ZUdyb3VwKG5leHRBY3RpdmVHcm91cCwgdW5kZWZpbmVkLCBHcm91cEFjdGl2YXRpb25SZWFzb24uUEFSVF9DTE9TRSk7XG5cdFx0fVxuXG5cdFx0Ly8gRGVhbCB3aXRoIGZvY3VzOiBmb2N1cyB0aGUgbmV4dCByZWNlbnRseSB1c2VkIGdyb3VwIGJ1dCBza2lwXG5cdFx0Ly8gdGhpcyBpZiB0aGUgbmV4dCBncm91cCBpcyBpbiB0aGUgbWFpbiBwYXJ0IGFuZCB0aGUgbWFpbiBwYXJ0XG5cdFx0Ly8gaXMgY3VycmVudGx5IGhpZGRlbiwgYXMgdGhhdCB3b3VsZCBtYWtlIGl0IHZpc2libGUuXG5cdFx0aWYgKG5leHRBY3RpdmVHcm91cCAmJiByZXN0b3JlRm9jdXMpIHtcblx0XHRcdGNvbnN0IG5leHRHcm91cEluSGlkZGVuTWFpblBhcnQgPSBuZXh0QWN0aXZlR3JvdXAuZ3JvdXBzVmlldyA9PT0gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcubWFpblBhcnQgJiYgIXRoaXMubGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIG1haW5XaW5kb3cpO1xuXHRcdFx0aWYgKCFuZXh0R3JvdXBJbkhpZGRlbk1haW5QYXJ0KSB7XG5cdFx0XHRcdG5leHRBY3RpdmVHcm91cC5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuZG9DbG9zZShmYWxzZSAvKiBkbyBub3QgbWVyZ2UgYW55IGNvbmZpcm1pbmcgZWRpdG9ycyB0byBtYWluIHBhcnQgKi8pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxvYWRTdGF0ZSgpOiBJRWRpdG9yUGFydFVJU3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnN0YXRlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHRyZXR1cm47IC8vIGRpc2FibGVkLCBhdXhpbGlhcnkgZWRpdG9yIHBhcnQgc3RhdGUgaXMgdHJhY2tlZCBvdXRzaWRlXG5cdH1cblxuXHRjbG9zZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5kb0Nsb3NlKHRydWUgLyogbWVyZ2UgYWxsIGNvbmZpcm1pbmcgZWRpdG9ycyB0byBtYWluIHBhcnQgKi8pO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0Nsb3NlKG1lcmdlQ29uZmlybWluZ0VkaXRvcnNUb01haW5QYXJ0OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0bGV0IHJlc3VsdCA9IHRydWU7XG5cdFx0aWYgKG1lcmdlQ29uZmlybWluZ0VkaXRvcnNUb01haW5QYXJ0KSB7XG5cblx0XHRcdC8vIEZpcnN0IGNsb3NlIGFsbCBlZGl0b3JzIHRoYXQgYXJlIG5vbi1jb25maXJtaW5nXG5cdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZ3JvdXBzKSB7XG5cdFx0XHRcdGdyb3VwLmNsb3NlQWxsRWRpdG9ycyh7IGV4Y2x1ZGVDb25maXJtaW5nOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVGhlbiBtZXJnZSByZW1haW5pbmcgdG8gbWFpbiBwYXJ0XG5cdFx0XHRyZXN1bHQgPSB0aGlzLm1lcmdlR3JvdXBzVG9NYWluUGFydCgpO1xuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBEbyBub3QgY2xvc2Ugd2hlbiBlZGl0b3JzIGNvdWxkIG5vdCBiZSBtZXJnZWQgYmFja1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX29uV2lsbENsb3NlLmZpcmUoKTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIG1lcmdlR3JvdXBzVG9NYWluUGFydCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuZ3JvdXBzLnNvbWUoZ3JvdXAgPT4gZ3JvdXAuY291bnQgPiAwKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIHNraXAgaWYgd2UgaGF2ZSBubyBlZGl0b3JzIG9wZW5lZFxuXHRcdH1cblxuXHRcdC8vIEZpbmQgdGhlIG1vc3QgcmVjZW50IGdyb3VwIHRoYXQgaXMgbm90IGxvY2tlZFxuXHRcdGxldCB0YXJnZXRHcm91cDogSUVkaXRvckdyb3VwVmlldyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZWRpdG9yUGFydHNWaWV3Lm1haW5QYXJ0LmdldEdyb3VwcyhHcm91cHNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkpIHtcblx0XHRcdGlmICghZ3JvdXAuaXNMb2NrZWQpIHtcblx0XHRcdFx0dGFyZ2V0R3JvdXAgPSBncm91cDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF0YXJnZXRHcm91cCkge1xuXHRcdFx0dGFyZ2V0R3JvdXAgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5tYWluUGFydC5hZGRHcm91cCh0aGlzLmVkaXRvclBhcnRzVmlldy5tYWluUGFydC5hY3RpdmVHcm91cCwgdGhpcy5wYXJ0T3B0aW9ucy5vcGVuU2lkZUJ5U2lkZURpcmVjdGlvbiA9PT0gJ3JpZ2h0JyA/IEdyb3VwRGlyZWN0aW9uLlJJR0hUIDogR3JvdXBEaXJlY3Rpb24uRE9XTik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5tZXJnZUFsbEdyb3Vwcyh0YXJnZXRHcm91cCwge1xuXHRcdFx0Ly8gVHJ5IHRvIHJlZHVjZSB0aGUgaW1wYWN0IG9mIGNsb3NpbmcgdGhlIGF1eGlsaWFyeSB3aW5kb3dcblx0XHRcdC8vIGFzIG11Y2ggYXMgcG9zc2libGUgYnkgbm90IGNoYW5naW5nIGV4aXN0aW5nIGVkaXRvcnNcblx0XHRcdC8vIGluIHRoZSBtYWluIHdpbmRvdy5cblx0XHRcdHByZXNlcnZlRXhpc3RpbmdJbmRleDogdHJ1ZVxuXHRcdH0pO1xuXHRcdHRhcmdldEdyb3VwLmZvY3VzKCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsR0FBRyxpQkFBaUIsTUFBTSxZQUFZO0FBQy9DLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsaUJBQWlCLGlCQUFpQix5QkFBeUI7QUFDcEUsU0FBUyxnQkFBZ0I7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
