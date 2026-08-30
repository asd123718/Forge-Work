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
import * as DOM from "../../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../../base/browser/mouseEvent.js";
import { DomScrollableElement } from "../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ToolBar } from "../../../../../base/browser/ui/toolbar/toolbar.js";
import { Separator } from "../../../../../base/common/actions.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { ScrollbarVisibility } from "../../../../../base/common/scrollable.js";
import { MenuEntryActionViewItem, SubmenuEntryActionViewItem } from "../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from "../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { SELECT_KERNEL_ID } from "../controller/coreActions.js";
import { NOTEBOOK_EDITOR_ID, NotebookSetting } from "../../common/notebookCommon.js";
import { NotebooKernelActionViewItem } from "./notebookKernelView.js";
import { ActionViewWithLabel, UnifiedSubmenuActionView } from "../view/cellParts/cellActionView.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { disposableTimeout } from "../../../../../base/common/async.js";
import { HiddenItemStrategy, WorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { WorkbenchHoverDelegate } from "../../../../../platform/hover/browser/hover.js";
var RenderLabel = /* @__PURE__ */ ((RenderLabel2) => {
  RenderLabel2[RenderLabel2["Always"] = 0] = "Always";
  RenderLabel2[RenderLabel2["Never"] = 1] = "Never";
  RenderLabel2[RenderLabel2["Dynamic"] = 2] = "Dynamic";
  return RenderLabel2;
})(RenderLabel || {});
function convertConfiguration(value) {
  switch (value) {
    case true:
      return 0 /* Always */;
    case false:
      return 1 /* Never */;
    case "always":
      return 0 /* Always */;
    case "never":
      return 1 /* Never */;
    case "dynamic":
      return 2 /* Dynamic */;
  }
}
const ICON_ONLY_ACTION_WIDTH = 21;
const TOGGLE_MORE_ACTION_WIDTH = 21;
const ACTION_PADDING = 8;
class WorkbenchAlwaysLabelStrategy {
  constructor(notebookEditor, editorToolbar, goToMenu, instantiationService) {
    this.notebookEditor = notebookEditor;
    this.editorToolbar = editorToolbar;
    this.goToMenu = goToMenu;
    this.instantiationService = instantiationService;
  }
  actionProvider(action, options) {
    if (action.id === SELECT_KERNEL_ID) {
      return this.instantiationService.createInstance(NotebooKernelActionViewItem, action, this.notebookEditor, options);
    }
    if (action instanceof MenuItemAction) {
      return this.instantiationService.createInstance(ActionViewWithLabel, action, { hoverDelegate: options.hoverDelegate });
    }
    if (action instanceof SubmenuItemAction && action.item.submenu.id === MenuId.NotebookCellExecuteGoTo.id) {
      return this.instantiationService.createInstance(UnifiedSubmenuActionView, action, { hoverDelegate: options.hoverDelegate }, true, {
        getActions: () => {
          return this.goToMenu.getActions().find(([group]) => group === "navigation/execute")?.[1] ?? [];
        }
      }, this.actionProvider.bind(this));
    }
    return void 0;
  }
  calculateActions(leftToolbarContainerMaxWidth) {
    const initialPrimaryActions = this.editorToolbar.primaryActions;
    const initialSecondaryActions = this.editorToolbar.secondaryActions;
    const actionOutput = workbenchCalculateActions(initialPrimaryActions, initialSecondaryActions, leftToolbarContainerMaxWidth);
    return {
      primaryActions: actionOutput.primaryActions.map((a) => a.action),
      secondaryActions: actionOutput.secondaryActions
    };
  }
}
class WorkbenchNeverLabelStrategy {
  constructor(notebookEditor, editorToolbar, goToMenu, instantiationService) {
    this.notebookEditor = notebookEditor;
    this.editorToolbar = editorToolbar;
    this.goToMenu = goToMenu;
    this.instantiationService = instantiationService;
  }
  actionProvider(action, options) {
    if (action.id === SELECT_KERNEL_ID) {
      return this.instantiationService.createInstance(NotebooKernelActionViewItem, action, this.notebookEditor, options);
    }
    if (action instanceof MenuItemAction) {
      return this.instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate });
    }
    if (action instanceof SubmenuItemAction) {
      if (action.item.submenu.id === MenuId.NotebookCellExecuteGoTo.id) {
        return this.instantiationService.createInstance(UnifiedSubmenuActionView, action, { hoverDelegate: options.hoverDelegate }, false, {
          getActions: () => {
            return this.goToMenu.getActions().find(([group]) => group === "navigation/execute")?.[1] ?? [];
          }
        }, this.actionProvider.bind(this));
      } else {
        return this.instantiationService.createInstance(SubmenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate });
      }
    }
    return void 0;
  }
  calculateActions(leftToolbarContainerMaxWidth) {
    const initialPrimaryActions = this.editorToolbar.primaryActions;
    const initialSecondaryActions = this.editorToolbar.secondaryActions;
    const actionOutput = workbenchCalculateActions(initialPrimaryActions, initialSecondaryActions, leftToolbarContainerMaxWidth);
    return {
      primaryActions: actionOutput.primaryActions.map((a) => a.action),
      secondaryActions: actionOutput.secondaryActions
    };
  }
}
class WorkbenchDynamicLabelStrategy {
  constructor(notebookEditor, editorToolbar, goToMenu, instantiationService) {
    this.notebookEditor = notebookEditor;
    this.editorToolbar = editorToolbar;
    this.goToMenu = goToMenu;
    this.instantiationService = instantiationService;
  }
  actionProvider(action, options) {
    if (action.id === SELECT_KERNEL_ID) {
      return this.instantiationService.createInstance(NotebooKernelActionViewItem, action, this.notebookEditor, options);
    }
    const a = this.editorToolbar.primaryActions.find((a2) => a2.action.id === action.id);
    if (!a || a.renderLabel) {
      if (action instanceof MenuItemAction) {
        return this.instantiationService.createInstance(ActionViewWithLabel, action, { hoverDelegate: options.hoverDelegate });
      }
      if (action instanceof SubmenuItemAction && action.item.submenu.id === MenuId.NotebookCellExecuteGoTo.id) {
        return this.instantiationService.createInstance(UnifiedSubmenuActionView, action, { hoverDelegate: options.hoverDelegate }, true, {
          getActions: () => {
            return this.goToMenu.getActions().find(([group]) => group === "navigation/execute")?.[1] ?? [];
          }
        }, this.actionProvider.bind(this));
      }
      return void 0;
    } else {
      if (action instanceof MenuItemAction) {
        return this.instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate });
      }
      if (action instanceof SubmenuItemAction) {
        if (action.item.submenu.id === MenuId.NotebookCellExecuteGoTo.id) {
          return this.instantiationService.createInstance(UnifiedSubmenuActionView, action, { hoverDelegate: options.hoverDelegate }, false, {
            getActions: () => {
              return this.goToMenu.getActions().find(([group]) => group === "navigation/execute")?.[1] ?? [];
            }
          }, this.actionProvider.bind(this));
        } else {
          return this.instantiationService.createInstance(SubmenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate });
        }
      }
      return void 0;
    }
  }
  calculateActions(leftToolbarContainerMaxWidth) {
    const initialPrimaryActions = this.editorToolbar.primaryActions;
    const initialSecondaryActions = this.editorToolbar.secondaryActions;
    const actionOutput = workbenchDynamicCalculateActions(initialPrimaryActions, initialSecondaryActions, leftToolbarContainerMaxWidth);
    return {
      primaryActions: actionOutput.primaryActions.map((a) => a.action),
      secondaryActions: actionOutput.secondaryActions
    };
  }
}
let NotebookEditorWorkbenchToolbar = class extends Disposable {
  constructor(notebookEditor, contextKeyService, notebookOptions, domNode, instantiationService, configurationService, contextMenuService, menuService, editorService, keybindingService) {
    super();
    this.notebookEditor = notebookEditor;
    this.contextKeyService = contextKeyService;
    this.notebookOptions = notebookOptions;
    this.domNode = domNode;
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    this.contextMenuService = contextMenuService;
    this.menuService = menuService;
    this.editorService = editorService;
    this.keybindingService = keybindingService;
    this._useGlobalToolbar = false;
    this._renderLabel = 0 /* Always */;
    this._visible = false;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this._dimension = null;
    this._primaryActions = [];
    this._secondaryActions = [];
    this._buildBody();
    this._register(Event.debounce(
      this.editorService.onDidActiveEditorChange,
      (last, _current) => last,
      200
    )(this._updatePerEditorChange, this));
    this._registerNotebookActionsToolbar();
    this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.CONTEXT_MENU, (e) => {
      const event = new StandardMouseEvent(DOM.getWindow(this.domNode), e);
      this.contextMenuService.showContextMenu({
        menuId: MenuId.NotebookToolbarContext,
        getAnchor: () => event,
        menuActionOptions: { renderShortTitle: true }
      });
    }));
  }
  get primaryActions() {
    return this._primaryActions;
  }
  get secondaryActions() {
    return this._secondaryActions;
  }
  set visible(visible) {
    if (this._visible !== visible) {
      this._visible = visible;
      this._onDidChangeVisibility.fire(visible);
    }
  }
  get useGlobalToolbar() {
    return this._useGlobalToolbar;
  }
  _buildBody() {
    this._notebookTopLeftToolbarContainer = document.createElement("div");
    this._notebookTopLeftToolbarContainer.classList.add("notebook-toolbar-left");
    this._leftToolbarScrollable = new DomScrollableElement(this._notebookTopLeftToolbarContainer, {
      vertical: ScrollbarVisibility.Hidden,
      horizontal: ScrollbarVisibility.Visible,
      horizontalScrollbarSize: 3,
      useShadows: false,
      scrollYToX: true
    });
    this._register(this._leftToolbarScrollable);
    DOM.append(this.domNode, this._leftToolbarScrollable.getDomNode());
    this._notebookTopRightToolbarContainer = document.createElement("div");
    this._notebookTopRightToolbarContainer.classList.add("notebook-toolbar-right");
    DOM.append(this.domNode, this._notebookTopRightToolbarContainer);
  }
  _updatePerEditorChange() {
    if (this.editorService.activeEditorPane?.getId() === NOTEBOOK_EDITOR_ID) {
      const notebookEditor = this.editorService.activeEditorPane.getControl();
      if (notebookEditor === this.notebookEditor) {
        this._showNotebookActionsinEditorToolbar();
        return;
      }
    }
  }
  _registerNotebookActionsToolbar() {
    this._notebookGlobalActionsMenu = this._register(this.menuService.createMenu(this.notebookEditor.creationOptions.menuIds.notebookToolbar, this.contextKeyService));
    this._executeGoToActionsMenu = this._register(this.menuService.createMenu(MenuId.NotebookCellExecuteGoTo, this.contextKeyService));
    this._useGlobalToolbar = this.notebookOptions.getDisplayOptions().globalToolbar;
    this._renderLabel = this._convertConfiguration(this.configurationService.getValue(NotebookSetting.globalToolbarShowLabel));
    this._updateStrategy();
    const context = {
      ui: true,
      notebookEditor: this.notebookEditor,
      source: "notebookToolbar"
    };
    const actionProvider = (action, options) => {
      if (action.id === SELECT_KERNEL_ID) {
        return this.instantiationService.createInstance(NotebooKernelActionViewItem, action, this.notebookEditor, options);
      }
      if (this._renderLabel !== 1 /* Never */) {
        const a = this._primaryActions.find((a2) => a2.action.id === action.id);
        if (a && a.renderLabel) {
          return action instanceof MenuItemAction ? this.instantiationService.createInstance(ActionViewWithLabel, action, { hoverDelegate: options.hoverDelegate }) : void 0;
        } else {
          return action instanceof MenuItemAction ? this.instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate }) : void 0;
        }
      } else {
        return action instanceof MenuItemAction ? this.instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate }) : void 0;
      }
    };
    const hoverDelegate = this._register(this.instantiationService.createInstance(WorkbenchHoverDelegate, "element", { instantHover: true }, {}));
    hoverDelegate.setInstantHoverTimeLimit(600);
    const leftToolbarOptions = {
      hiddenItemStrategy: HiddenItemStrategy.RenderInSecondaryGroup,
      resetMenu: MenuId.NotebookToolbar,
      actionViewItemProvider: (action, options) => {
        return this._strategy.actionProvider(action, options);
      },
      getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id),
      renderDropdownAsChildElement: true,
      hoverDelegate
    };
    this._notebookLeftToolbar = this.instantiationService.createInstance(
      WorkbenchToolBar,
      this._notebookTopLeftToolbarContainer,
      leftToolbarOptions
    );
    this._register(this._notebookLeftToolbar);
    this._notebookLeftToolbar.context = context;
    this._notebookRightToolbar = new ToolBar(this._notebookTopRightToolbarContainer, this.contextMenuService, {
      getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id),
      actionViewItemProvider: actionProvider,
      renderDropdownAsChildElement: true,
      hoverDelegate
    });
    this._register(this._notebookRightToolbar);
    this._notebookRightToolbar.context = context;
    this._showNotebookActionsinEditorToolbar();
    let dropdownIsVisible = false;
    let deferredUpdate;
    this._register(this._notebookGlobalActionsMenu.onDidChange(() => {
      if (dropdownIsVisible) {
        deferredUpdate = () => this._showNotebookActionsinEditorToolbar();
        return;
      }
      if (this.notebookEditor.isVisible) {
        this._showNotebookActionsinEditorToolbar();
      }
    }));
    this._register(this._notebookLeftToolbar.onDidChangeDropdownVisibility((visible) => {
      dropdownIsVisible = visible;
      if (deferredUpdate && !visible) {
        setTimeout(() => {
          deferredUpdate?.();
        }, 0);
        deferredUpdate = void 0;
      }
    }));
    this._register(this.notebookOptions.onDidChangeOptions((e) => {
      if (e.globalToolbar !== void 0) {
        this._useGlobalToolbar = this.notebookOptions.getDisplayOptions().globalToolbar;
        this._showNotebookActionsinEditorToolbar();
      }
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotebookSetting.globalToolbarShowLabel)) {
        this._renderLabel = this._convertConfiguration(this.configurationService.getValue(NotebookSetting.globalToolbarShowLabel));
        this._updateStrategy();
        const oldElement = this._notebookLeftToolbar.getElement();
        oldElement.remove();
        this._notebookLeftToolbar.dispose();
        this._notebookLeftToolbar = this.instantiationService.createInstance(
          WorkbenchToolBar,
          this._notebookTopLeftToolbarContainer,
          leftToolbarOptions
        );
        this._register(this._notebookLeftToolbar);
        this._notebookLeftToolbar.context = context;
        this._showNotebookActionsinEditorToolbar();
        return;
      }
    }));
  }
  _updateStrategy() {
    switch (this._renderLabel) {
      case 0 /* Always */:
        this._strategy = new WorkbenchAlwaysLabelStrategy(this.notebookEditor, this, this._executeGoToActionsMenu, this.instantiationService);
        break;
      case 1 /* Never */:
        this._strategy = new WorkbenchNeverLabelStrategy(this.notebookEditor, this, this._executeGoToActionsMenu, this.instantiationService);
        break;
      case 2 /* Dynamic */:
        this._strategy = new WorkbenchDynamicLabelStrategy(this.notebookEditor, this, this._executeGoToActionsMenu, this.instantiationService);
        break;
    }
  }
  _convertConfiguration(value) {
    switch (value) {
      case true:
        return 0 /* Always */;
      case false:
        return 1 /* Never */;
      case "always":
        return 0 /* Always */;
      case "never":
        return 1 /* Never */;
      case "dynamic":
        return 2 /* Dynamic */;
    }
  }
  _showNotebookActionsinEditorToolbar() {
    if (!this.notebookEditor.hasModel()) {
      this._deferredActionUpdate?.dispose();
      this._deferredActionUpdate = void 0;
      this.visible = false;
      return;
    }
    if (this._deferredActionUpdate) {
      return;
    }
    if (!this._useGlobalToolbar) {
      this.domNode.style.display = "none";
      this._deferredActionUpdate = void 0;
      this.visible = false;
    } else {
      this._deferredActionUpdate = disposableTimeout(async () => {
        await this._setNotebookActions();
        this.visible = true;
        this._deferredActionUpdate?.dispose();
        this._deferredActionUpdate = void 0;
      }, 50);
    }
  }
  async _setNotebookActions() {
    const groups = this._notebookGlobalActionsMenu.getActions({ shouldForwardArgs: true, renderShortTitle: true });
    this.domNode.style.display = "flex";
    const primaryLeftGroups = groups.filter((group) => /^navigation/.test(group[0]));
    const primaryActions = [];
    primaryLeftGroups.sort((a, b) => {
      if (a[0] === "navigation") {
        return 1;
      }
      if (b[0] === "navigation") {
        return -1;
      }
      return 0;
    }).forEach((group, index) => {
      primaryActions.push(...group[1]);
      if (index < primaryLeftGroups.length - 1) {
        primaryActions.push(new Separator());
      }
    });
    const primaryRightGroup = groups.find((group) => /^status/.test(group[0]));
    const primaryRightActions = primaryRightGroup ? primaryRightGroup[1] : [];
    const secondaryActions = groups.filter((group) => !/^navigation/.test(group[0]) && !/^status/.test(group[0])).reduce((prev, curr) => {
      prev.push(...curr[1]);
      return prev;
    }, []);
    this._notebookLeftToolbar.setActions([], []);
    this._primaryActions = primaryActions.map((action) => ({
      action,
      size: action instanceof Separator ? 1 : 0,
      renderLabel: true,
      visible: true
    }));
    this._notebookLeftToolbar.setActions(primaryActions, secondaryActions);
    this._secondaryActions = secondaryActions;
    this._notebookRightToolbar.setActions(primaryRightActions, []);
    this._secondaryActions = secondaryActions;
    if (this._dimension && this._dimension.width >= 0 && this._dimension.height >= 0) {
      this._cacheItemSizes(this._notebookLeftToolbar);
    }
    this._computeSizes();
  }
  _cacheItemSizes(toolbar) {
    for (let i = 0; i < toolbar.getItemsLength(); i++) {
      const action = toolbar.getItemAction(i);
      if (action && action.id !== "toolbar.toggle.more") {
        const existing = this._primaryActions.find((a) => a.action.id === action.id);
        if (existing) {
          existing.size = toolbar.getItemWidth(i);
        }
      }
    }
  }
  _computeSizes() {
    const toolbar = this._notebookLeftToolbar;
    const rightToolbar = this._notebookRightToolbar;
    if (toolbar && rightToolbar && this._dimension && this._dimension.height >= 0 && this._dimension.width >= 0) {
      if (this._primaryActions.length === 0 && toolbar.getItemsLength() !== this._primaryActions.length) {
        this._cacheItemSizes(this._notebookLeftToolbar);
      }
      if (this._primaryActions.length === 0) {
        return;
      }
      const kernelWidth = (rightToolbar.getItemsLength() ? rightToolbar.getItemWidth(0) : 0) + ACTION_PADDING;
      const leftToolbarContainerMaxWidth = this._dimension.width - kernelWidth - (ACTION_PADDING + TOGGLE_MORE_ACTION_WIDTH) - /** toolbar left margin */
      ACTION_PADDING - /** toolbar right margin */
      ACTION_PADDING;
      const calculatedActions = this._strategy.calculateActions(leftToolbarContainerMaxWidth);
      this._notebookLeftToolbar.setActions(calculatedActions.primaryActions, calculatedActions.secondaryActions);
    }
  }
  layout(dimension) {
    this._dimension = dimension;
    if (!this._useGlobalToolbar) {
      this.domNode.style.display = "none";
    } else {
      this.domNode.style.display = "flex";
    }
    this._computeSizes();
  }
  dispose() {
    this._notebookLeftToolbar.context = void 0;
    this._notebookRightToolbar.context = void 0;
    this._notebookLeftToolbar.dispose();
    this._notebookRightToolbar.dispose();
    this._notebookLeftToolbar = null;
    this._notebookRightToolbar = null;
    this._deferredActionUpdate?.dispose();
    this._deferredActionUpdate = void 0;
    super.dispose();
  }
};
NotebookEditorWorkbenchToolbar = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IMenuService),
  __decorateParam(8, IEditorService),
  __decorateParam(9, IKeybindingService)
], NotebookEditorWorkbenchToolbar);
function workbenchCalculateActions(initialPrimaryActions, initialSecondaryActions, leftToolbarContainerMaxWidth) {
  return actionOverflowHelper(initialPrimaryActions, initialSecondaryActions, leftToolbarContainerMaxWidth, false);
}
function workbenchDynamicCalculateActions(initialPrimaryActions, initialSecondaryActions, leftToolbarContainerMaxWidth) {
  if (initialPrimaryActions.length === 0) {
    return { primaryActions: [], secondaryActions: initialSecondaryActions };
  }
  const visibleActionLength = initialPrimaryActions.filter((action) => action.size !== 0).length;
  const totalWidthWithLabels = initialPrimaryActions.map((action) => action.size).reduce((a, b) => a + b, 0) + (visibleActionLength - 1) * ACTION_PADDING;
  if (totalWidthWithLabels <= leftToolbarContainerMaxWidth) {
    initialPrimaryActions.forEach((action) => {
      action.renderLabel = true;
    });
    return actionOverflowHelper(initialPrimaryActions, initialSecondaryActions, leftToolbarContainerMaxWidth, false);
  }
  if (visibleActionLength * ICON_ONLY_ACTION_WIDTH + (visibleActionLength - 1) * ACTION_PADDING > leftToolbarContainerMaxWidth) {
    initialPrimaryActions.forEach((action) => {
      action.renderLabel = false;
    });
    return actionOverflowHelper(initialPrimaryActions, initialSecondaryActions, leftToolbarContainerMaxWidth, true);
  }
  let sum = 0;
  let lastActionWithLabel = -1;
  for (let i = 0; i < initialPrimaryActions.length; i++) {
    sum += initialPrimaryActions[i].size + ACTION_PADDING;
    if (initialPrimaryActions[i].action instanceof Separator) {
      const remainingItems = initialPrimaryActions.slice(i + 1).filter((action) => action.size !== 0);
      const newTotalSum = sum + (remainingItems.length === 0 ? 0 : remainingItems.length * ICON_ONLY_ACTION_WIDTH + (remainingItems.length - 1) * ACTION_PADDING);
      if (newTotalSum <= leftToolbarContainerMaxWidth) {
        lastActionWithLabel = i;
      }
    } else {
      continue;
    }
  }
  if (lastActionWithLabel < 0) {
    initialPrimaryActions.forEach((action) => {
      action.renderLabel = false;
    });
    return actionOverflowHelper(initialPrimaryActions, initialSecondaryActions, leftToolbarContainerMaxWidth, true);
  }
  initialPrimaryActions.slice(0, lastActionWithLabel + 1).forEach((action) => {
    action.renderLabel = true;
  });
  initialPrimaryActions.slice(lastActionWithLabel + 1).forEach((action) => {
    action.renderLabel = false;
  });
  return {
    primaryActions: initialPrimaryActions,
    secondaryActions: initialSecondaryActions
  };
}
function actionOverflowHelper(initialPrimaryActions, initialSecondaryActions, leftToolbarContainerMaxWidth, iconOnly) {
  const renderActions = [];
  const overflow = [];
  let currentSize = 0;
  let nonZeroAction = false;
  let containerFull = false;
  if (initialPrimaryActions.length === 0) {
    return { primaryActions: [], secondaryActions: initialSecondaryActions };
  }
  for (let i = 0; i < initialPrimaryActions.length; i++) {
    const actionModel = initialPrimaryActions[i];
    const itemSize = iconOnly ? actionModel.size === 0 ? 0 : ICON_ONLY_ACTION_WIDTH : actionModel.size;
    if (actionModel.action instanceof Separator && renderActions.length > 0 && renderActions[renderActions.length - 1].action instanceof Separator) {
      continue;
    }
    if (actionModel.action instanceof Separator && !nonZeroAction) {
      continue;
    }
    if (currentSize + itemSize <= leftToolbarContainerMaxWidth && !containerFull) {
      currentSize += ACTION_PADDING + itemSize;
      renderActions.push(actionModel);
      if (itemSize !== 0) {
        nonZeroAction = true;
      }
      if (actionModel.action instanceof Separator) {
        nonZeroAction = false;
      }
    } else {
      containerFull = true;
      if (itemSize === 0) {
        renderActions.push(actionModel);
      } else {
        if (actionModel.action instanceof Separator) {
          continue;
        }
        overflow.push(actionModel.action);
      }
    }
  }
  for (let i = renderActions.length - 1; i > 0; i--) {
    const temp = renderActions[i];
    if (temp.size === 0) {
      continue;
    }
    if (temp.action instanceof Separator) {
      renderActions.splice(i, 1);
    }
    break;
  }
  if (renderActions.length && renderActions[renderActions.length - 1].action instanceof Separator) {
    renderActions.pop();
  }
  if (overflow.length !== 0) {
    overflow.push(new Separator());
  }
  if (iconOnly) {
    const markdownIndex = renderActions.findIndex((a) => a.action.id === "notebook.cell.insertMarkdownCellBelow");
    if (markdownIndex !== -1) {
      renderActions.splice(markdownIndex, 1);
    }
  }
  return {
    primaryActions: renderActions,
    secondaryActions: [...overflow, ...initialSecondaryActions]
  };
}
export {
  NotebookEditorWorkbenchToolbar,
  RenderLabel,
  convertConfiguration,
  workbenchCalculateActions,
  workbenchDynamicCalculateActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3UGFydHNcXG5vdGVib29rRWRpdG9yVG9vbGJhci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Rvb2xiYXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0sIFN1Ym1lbnVFbnRyeUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElNZW51LCBJTWVudVNlcnZpY2UsIE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24sIFN1Ym1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IFNFTEVDVF9LRVJORUxfSUQgfSBmcm9tICcuLi9jb250cm9sbGVyL2NvcmVBY3Rpb25zLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX0VESVRPUl9JRCwgTm90ZWJvb2tTZXR0aW5nIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvckRlbGVnYXRlIH0gZnJvbSAnLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IE5vdGVib29LZXJuZWxBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4vbm90ZWJvb2tLZXJuZWxWaWV3LmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdXaXRoTGFiZWwsIFVuaWZpZWRTdWJtZW51QWN0aW9uVmlldyB9IGZyb20gJy4uL3ZpZXcvY2VsbFBhcnRzL2NlbGxBY3Rpb25WaWV3LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rT3B0aW9ucyB9IGZyb20gJy4uL25vdGVib29rT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW0sIElBY3Rpb25WaWV3SXRlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBIaWRkZW5JdGVtU3RyYXRlZ3ksIElXb3JrYmVuY2hUb29sQmFyT3B0aW9ucywgV29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5cbmludGVyZmFjZSBJQWN0aW9uTW9kZWwge1xuXHRhY3Rpb246IElBY3Rpb247XG5cdHNpemU6IG51bWJlcjtcblx0dmlzaWJsZTogYm9vbGVhbjtcblx0cmVuZGVyTGFiZWw6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBlbnVtIFJlbmRlckxhYmVsIHtcblx0QWx3YXlzID0gMCxcblx0TmV2ZXIgPSAxLFxuXHREeW5hbWljID0gMlxufVxuXG5leHBvcnQgdHlwZSBSZW5kZXJMYWJlbFdpdGhGYWxsYmFjayA9IHRydWUgfCBmYWxzZSB8ICdhbHdheXMnIHwgJ25ldmVyJyB8ICdkeW5hbWljJztcblxuZXhwb3J0IGZ1bmN0aW9uIGNvbnZlcnRDb25maWd1cmF0aW9uKHZhbHVlOiBSZW5kZXJMYWJlbFdpdGhGYWxsYmFjayk6IFJlbmRlckxhYmVsIHtcblx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdGNhc2UgdHJ1ZTpcblx0XHRcdHJldHVybiBSZW5kZXJMYWJlbC5BbHdheXM7XG5cdFx0Y2FzZSBmYWxzZTpcblx0XHRcdHJldHVybiBSZW5kZXJMYWJlbC5OZXZlcjtcblx0XHRjYXNlICdhbHdheXMnOlxuXHRcdFx0cmV0dXJuIFJlbmRlckxhYmVsLkFsd2F5cztcblx0XHRjYXNlICduZXZlcic6XG5cdFx0XHRyZXR1cm4gUmVuZGVyTGFiZWwuTmV2ZXI7XG5cdFx0Y2FzZSAnZHluYW1pYyc6XG5cdFx0XHRyZXR1cm4gUmVuZGVyTGFiZWwuRHluYW1pYztcblx0fVxufVxuXG5jb25zdCBJQ09OX09OTFlfQUNUSU9OX1dJRFRIID0gMjE7XG5jb25zdCBUT0dHTEVfTU9SRV9BQ1RJT05fV0lEVEggPSAyMTtcbmNvbnN0IEFDVElPTl9QQURESU5HID0gODtcblxuaW50ZXJmYWNlIElBY3Rpb25MYXlvdXRTdHJhdGVneSB7XG5cdGFjdGlvblByb3ZpZGVyOiBJQWN0aW9uVmlld0l0ZW1Qcm92aWRlcjtcblx0Y2FsY3VsYXRlQWN0aW9ucyhsZWZ0VG9vbGJhckNvbnRhaW5lck1heFdpZHRoOiBudW1iZXIpOiB7IHByaW1hcnlBY3Rpb25zOiBJQWN0aW9uW107IHNlY29uZGFyeUFjdGlvbnM6IElBY3Rpb25bXSB9O1xufVxuXG5jbGFzcyBXb3JrYmVuY2hBbHdheXNMYWJlbFN0cmF0ZWd5IGltcGxlbWVudHMgSUFjdGlvbkxheW91dFN0cmF0ZWd5IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvckRlbGVnYXRlLFxuXHRcdHJlYWRvbmx5IGVkaXRvclRvb2xiYXI6IE5vdGVib29rRWRpdG9yV29ya2JlbmNoVG9vbGJhcixcblx0XHRyZWFkb25seSBnb1RvTWVudTogSU1lbnUsXG5cdFx0cmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkgeyB9XG5cblx0YWN0aW9uUHJvdmlkZXIoYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKTogSUFjdGlvblZpZXdJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoYWN0aW9uLmlkID09PSBTRUxFQ1RfS0VSTkVMX0lEKSB7XG5cdFx0XHQvL1x0dGhpcyBpcyBiZWluZyBkaXNwb3NlZCBieSB0aGUgY29uc3VtZXJcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29LZXJuZWxBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB0aGlzLm5vdGVib29rRWRpdG9yLCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFjdGlvblZpZXdXaXRoTGFiZWwsIGFjdGlvbiwgeyBob3ZlckRlbGVnYXRlOiBvcHRpb25zLmhvdmVyRGVsZWdhdGUgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIFN1Ym1lbnVJdGVtQWN0aW9uICYmIGFjdGlvbi5pdGVtLnN1Ym1lbnUuaWQgPT09IE1lbnVJZC5Ob3RlYm9va0NlbGxFeGVjdXRlR29Uby5pZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW5pZmllZFN1Ym1lbnVBY3Rpb25WaWV3LCBhY3Rpb24sIHsgaG92ZXJEZWxlZ2F0ZTogb3B0aW9ucy5ob3ZlckRlbGVnYXRlIH0sIHRydWUsIHtcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmdvVG9NZW51LmdldEFjdGlvbnMoKS5maW5kKChbZ3JvdXBdKSA9PiBncm91cCA9PT0gJ25hdmlnYXRpb24vZXhlY3V0ZScpPy5bMV0gPz8gW107XG5cdFx0XHRcdH1cblx0XHRcdH0sIHRoaXMuYWN0aW9uUHJvdmlkZXIuYmluZCh0aGlzKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNhbGN1bGF0ZUFjdGlvbnMobGVmdFRvb2xiYXJDb250YWluZXJNYXhXaWR0aDogbnVtYmVyKTogeyBwcmltYXJ5QWN0aW9uczogSUFjdGlvbltdOyBzZWNvbmRhcnlBY3Rpb25zOiBJQWN0aW9uW10gfSB7XG5cdFx0Y29uc3QgaW5pdGlhbFByaW1hcnlBY3Rpb25zID0gdGhpcy5lZGl0b3JUb29sYmFyLnByaW1hcnlBY3Rpb25zO1xuXHRcdGNvbnN0IGluaXRpYWxTZWNvbmRhcnlBY3Rpb25zID0gdGhpcy5lZGl0b3JUb29sYmFyLnNlY29uZGFyeUFjdGlvbnM7XG5cblx0XHRjb25zdCBhY3Rpb25PdXRwdXQgPSB3b3JrYmVuY2hDYWxjdWxhdGVBY3Rpb25zKGluaXRpYWxQcmltYXJ5QWN0aW9ucywgaW5pdGlhbFNlY29uZGFyeUFjdGlvbnMsIGxlZnRUb29sYmFyQ29udGFpbmVyTWF4V2lkdGgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcmltYXJ5QWN0aW9uczogYWN0aW9uT3V0cHV0LnByaW1hcnlBY3Rpb25zLm1hcChhID0+IGEuYWN0aW9uKSxcblx0XHRcdHNlY29uZGFyeUFjdGlvbnM6IGFjdGlvbk91dHB1dC5zZWNvbmRhcnlBY3Rpb25zXG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBXb3JrYmVuY2hOZXZlckxhYmVsU3RyYXRlZ3kgaW1wbGVtZW50cyBJQWN0aW9uTGF5b3V0U3RyYXRlZ3kge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yRGVsZWdhdGUsXG5cdFx0cmVhZG9ubHkgZWRpdG9yVG9vbGJhcjogTm90ZWJvb2tFZGl0b3JXb3JrYmVuY2hUb29sYmFyLFxuXHRcdHJlYWRvbmx5IGdvVG9NZW51OiBJTWVudSxcblx0XHRyZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKSB7IH1cblxuXHRhY3Rpb25Qcm92aWRlcihhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMpOiBJQWN0aW9uVmlld0l0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGlmIChhY3Rpb24uaWQgPT09IFNFTEVDVF9LRVJORUxfSUQpIHtcblx0XHRcdC8vXHR0aGlzIGlzIGJlaW5nIGRpc3Bvc2VkIGJ5IHRoZSBjb25zdW1lclxuXHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb0tlcm5lbEFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHRoaXMubm90ZWJvb2tFZGl0b3IsIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgeyBob3ZlckRlbGVnYXRlOiBvcHRpb25zLmhvdmVyRGVsZWdhdGUgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIFN1Ym1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRpZiAoYWN0aW9uLml0ZW0uc3VibWVudS5pZCA9PT0gTWVudUlkLk5vdGVib29rQ2VsbEV4ZWN1dGVHb1RvLmlkKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVuaWZpZWRTdWJtZW51QWN0aW9uVmlldywgYWN0aW9uLCB7IGhvdmVyRGVsZWdhdGU6IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSB9LCBmYWxzZSwge1xuXHRcdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmdvVG9NZW51LmdldEFjdGlvbnMoKS5maW5kKChbZ3JvdXBdKSA9PiBncm91cCA9PT0gJ25hdmlnYXRpb24vZXhlY3V0ZScpPy5bMV0gPz8gW107XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCB0aGlzLmFjdGlvblByb3ZpZGVyLmJpbmQodGhpcykpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3VibWVudUVudHJ5QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgeyBob3ZlckRlbGVnYXRlOiBvcHRpb25zLmhvdmVyRGVsZWdhdGUgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNhbGN1bGF0ZUFjdGlvbnMobGVmdFRvb2xiYXJDb250YWluZXJNYXhXaWR0aDogbnVtYmVyKTogeyBwcmltYXJ5QWN0aW9uczogSUFjdGlvbltdOyBzZWNvbmRhcnlBY3Rpb25zOiBJQWN0aW9uW10gfSB7XG5cdFx0Y29uc3QgaW5pdGlhbFByaW1hcnlBY3Rpb25zID0gdGhpcy5lZGl0b3JUb29sYmFyLnByaW1hcnlBY3Rpb25zO1xuXHRcdGNvbnN0IGluaXRpYWxTZWNvbmRhcnlBY3Rpb25zID0gdGhpcy5lZGl0b3JUb29sYmFyLnNlY29uZGFyeUFjdGlvbnM7XG5cblx0XHRjb25zdCBhY3Rpb25PdXRwdXQgPSB3b3JrYmVuY2hDYWxjdWxhdGVBY3Rpb25zKGluaXRpYWxQcmltYXJ5QWN0aW9ucywgaW5pdGlhbFNlY29uZGFyeUFjdGlvbnMsIGxlZnRUb29sYmFyQ29udGFpbmVyTWF4V2lkdGgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcmltYXJ5QWN0aW9uczogYWN0aW9uT3V0cHV0LnByaW1hcnlBY3Rpb25zLm1hcChhID0+IGEuYWN0aW9uKSxcblx0XHRcdHNlY29uZGFyeUFjdGlvbnM6IGFjdGlvbk91dHB1dC5zZWNvbmRhcnlBY3Rpb25zXG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBXb3JrYmVuY2hEeW5hbWljTGFiZWxTdHJhdGVneSBpbXBsZW1lbnRzIElBY3Rpb25MYXlvdXRTdHJhdGVneSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSxcblx0XHRyZWFkb25seSBlZGl0b3JUb29sYmFyOiBOb3RlYm9va0VkaXRvcldvcmtiZW5jaFRvb2xiYXIsXG5cdFx0cmVhZG9ubHkgZ29Ub01lbnU6IElNZW51LFxuXHRcdHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpIHsgfVxuXG5cdGFjdGlvblByb3ZpZGVyKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyk6IElBY3Rpb25WaWV3SXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGFjdGlvbi5pZCA9PT0gU0VMRUNUX0tFUk5FTF9JRCkge1xuXHRcdFx0Ly9cdHRoaXMgaXMgYmVpbmcgZGlzcG9zZWQgYnkgdGhlIGNvbnN1bWVyXG5cdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9vS2VybmVsQWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgdGhpcy5ub3RlYm9va0VkaXRvciwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYSA9IHRoaXMuZWRpdG9yVG9vbGJhci5wcmltYXJ5QWN0aW9ucy5maW5kKGEgPT4gYS5hY3Rpb24uaWQgPT09IGFjdGlvbi5pZCk7XG5cdFx0aWYgKCFhIHx8IGEucmVuZGVyTGFiZWwpIHtcblx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBY3Rpb25WaWV3V2l0aExhYmVsLCBhY3Rpb24sIHsgaG92ZXJEZWxlZ2F0ZTogb3B0aW9ucy5ob3ZlckRlbGVnYXRlIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgU3VibWVudUl0ZW1BY3Rpb24gJiYgYWN0aW9uLml0ZW0uc3VibWVudS5pZCA9PT0gTWVudUlkLk5vdGVib29rQ2VsbEV4ZWN1dGVHb1RvLmlkKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVuaWZpZWRTdWJtZW51QWN0aW9uVmlldywgYWN0aW9uLCB7IGhvdmVyRGVsZWdhdGU6IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSB9LCB0cnVlLCB7XG5cdFx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuZ29Ub01lbnUuZ2V0QWN0aW9ucygpLmZpbmQoKFtncm91cF0pID0+IGdyb3VwID09PSAnbmF2aWdhdGlvbi9leGVjdXRlJyk/LlsxXSA/PyBbXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIHRoaXMuYWN0aW9uUHJvdmlkZXIuYmluZCh0aGlzKSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB7IGhvdmVyRGVsZWdhdGU6IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSB9KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIFN1Ym1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdGlmIChhY3Rpb24uaXRlbS5zdWJtZW51LmlkID09PSBNZW51SWQuTm90ZWJvb2tDZWxsRXhlY3V0ZUdvVG8uaWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVbmlmaWVkU3VibWVudUFjdGlvblZpZXcsIGFjdGlvbiwgeyBob3ZlckRlbGVnYXRlOiBvcHRpb25zLmhvdmVyRGVsZWdhdGUgfSwgZmFsc2UsIHtcblx0XHRcdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuZ29Ub01lbnUuZ2V0QWN0aW9ucygpLmZpbmQoKFtncm91cF0pID0+IGdyb3VwID09PSAnbmF2aWdhdGlvbi9leGVjdXRlJyk/LlsxXSA/PyBbXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LCB0aGlzLmFjdGlvblByb3ZpZGVyLmJpbmQodGhpcykpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN1Ym1lbnVFbnRyeUFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHsgaG92ZXJEZWxlZ2F0ZTogb3B0aW9ucy5ob3ZlckRlbGVnYXRlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0Y2FsY3VsYXRlQWN0aW9ucyhsZWZ0VG9vbGJhckNvbnRhaW5lck1heFdpZHRoOiBudW1iZXIpOiB7IHByaW1hcnlBY3Rpb25zOiBJQWN0aW9uW107IHNlY29uZGFyeUFjdGlvbnM6IElBY3Rpb25bXSB9IHtcblx0XHRjb25zdCBpbml0aWFsUHJpbWFyeUFjdGlvbnMgPSB0aGlzLmVkaXRvclRvb2xiYXIucHJpbWFyeUFjdGlvbnM7XG5cdFx0Y29uc3QgaW5pdGlhbFNlY29uZGFyeUFjdGlvbnMgPSB0aGlzLmVkaXRvclRvb2xiYXIuc2Vjb25kYXJ5QWN0aW9ucztcblxuXHRcdGNvbnN0IGFjdGlvbk91dHB1dCA9IHdvcmtiZW5jaER5bmFtaWNDYWxjdWxhdGVBY3Rpb25zKGluaXRpYWxQcmltYXJ5QWN0aW9ucywgaW5pdGlhbFNlY29uZGFyeUFjdGlvbnMsIGxlZnRUb29sYmFyQ29udGFpbmVyTWF4V2lkdGgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcmltYXJ5QWN0aW9uczogYWN0aW9uT3V0cHV0LnByaW1hcnlBY3Rpb25zLm1hcChhID0+IGEuYWN0aW9uKSxcblx0XHRcdHNlY29uZGFyeUFjdGlvbnM6IGFjdGlvbk91dHB1dC5zZWNvbmRhcnlBY3Rpb25zXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tFZGl0b3JXb3JrYmVuY2hUb29sYmFyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX2xlZnRUb29sYmFyU2Nyb2xsYWJsZSE6IERvbVNjcm9sbGFibGVFbGVtZW50O1xuXHRwcml2YXRlIF9ub3RlYm9va1RvcExlZnRUb29sYmFyQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX25vdGVib29rVG9wUmlnaHRUb29sYmFyQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX25vdGVib29rR2xvYmFsQWN0aW9uc01lbnUhOiBJTWVudTtcblx0cHJpdmF0ZSBfZXhlY3V0ZUdvVG9BY3Rpb25zTWVudSE6IElNZW51O1xuXHRwcml2YXRlIF9ub3RlYm9va0xlZnRUb29sYmFyITogV29ya2JlbmNoVG9vbEJhcjtcblx0cHJpdmF0ZSBfcHJpbWFyeUFjdGlvbnM6IElBY3Rpb25Nb2RlbFtdO1xuXHRnZXQgcHJpbWFyeUFjdGlvbnMoKTogSUFjdGlvbk1vZGVsW10ge1xuXHRcdHJldHVybiB0aGlzLl9wcmltYXJ5QWN0aW9ucztcblx0fVxuXHRwcml2YXRlIF9zZWNvbmRhcnlBY3Rpb25zOiBJQWN0aW9uW107XG5cdGdldCBzZWNvbmRhcnlBY3Rpb25zKCk6IElBY3Rpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlY29uZGFyeUFjdGlvbnM7XG5cdH1cblx0cHJpdmF0ZSBfbm90ZWJvb2tSaWdodFRvb2xiYXIhOiBUb29sQmFyO1xuXHRwcml2YXRlIF91c2VHbG9iYWxUb29sYmFyOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX3N0cmF0ZWd5ITogSUFjdGlvbkxheW91dFN0cmF0ZWd5O1xuXHRwcml2YXRlIF9yZW5kZXJMYWJlbDogUmVuZGVyTGFiZWwgPSBSZW5kZXJMYWJlbC5BbHdheXM7XG5cblx0cHJpdmF0ZSBfdmlzaWJsZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRzZXQgdmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX3Zpc2libGUgIT09IHZpc2libGUpIHtcblx0XHRcdHRoaXMuX3Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmZpcmUodmlzaWJsZSk7XG5cdFx0fVxuXHR9XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmlzaWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpc2liaWxpdHk6IEV2ZW50PGJvb2xlYW4+ID0gdGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmV2ZW50O1xuXG5cdGdldCB1c2VHbG9iYWxUb29sYmFyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl91c2VHbG9iYWxUb29sYmFyO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGltZW5zaW9uOiBET00uRGltZW5zaW9uIHwgbnVsbCA9IG51bGw7XG5cblx0cHJpdmF0ZSBfZGVmZXJyZWRBY3Rpb25VcGRhdGU6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSxcblx0XHRyZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdHJlYWRvbmx5IG5vdGVib29rT3B0aW9uczogTm90ZWJvb2tPcHRpb25zLFxuXHRcdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcHJpbWFyeUFjdGlvbnMgPSBbXTtcblx0XHR0aGlzLl9zZWNvbmRhcnlBY3Rpb25zID0gW107XG5cdFx0dGhpcy5fYnVpbGRCb2R5KCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5kZWJvdW5jZTx2b2lkLCB2b2lkPihcblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSxcblx0XHRcdChsYXN0LCBfY3VycmVudCkgPT4gbGFzdCxcblx0XHRcdDIwMFxuXHRcdCkodGhpcy5fdXBkYXRlUGVyRWRpdG9yQ2hhbmdlLCB0aGlzKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlck5vdGVib29rQWN0aW9uc1Rvb2xiYXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCBET00uRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgZSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoRE9NLmdldFdpbmRvdyh0aGlzLmRvbU5vZGUpLCBlKTtcblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdG1lbnVJZDogTWVudUlkLk5vdGVib29rVG9vbGJhckNvbnRleHQsXG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZlbnQsXG5cdFx0XHRcdG1lbnVBY3Rpb25PcHRpb25zOiB7IHJlbmRlclNob3J0VGl0bGU6IHRydWUgfVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRCb2R5KCkge1xuXHRcdHRoaXMuX25vdGVib29rVG9wTGVmdFRvb2xiYXJDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9ub3RlYm9va1RvcExlZnRUb29sYmFyQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ25vdGVib29rLXRvb2xiYXItbGVmdCcpO1xuXHRcdHRoaXMuX2xlZnRUb29sYmFyU2Nyb2xsYWJsZSA9IG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudCh0aGlzLl9ub3RlYm9va1RvcExlZnRUb29sYmFyQ29udGFpbmVyLCB7XG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LlZpc2libGUsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFyU2l6ZTogMyxcblx0XHRcdHVzZVNoYWRvd3M6IGZhbHNlLFxuXHRcdFx0c2Nyb2xsWVRvWDogdHJ1ZVxuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xlZnRUb29sYmFyU2Nyb2xsYWJsZSk7XG5cblx0XHRET00uYXBwZW5kKHRoaXMuZG9tTm9kZSwgdGhpcy5fbGVmdFRvb2xiYXJTY3JvbGxhYmxlLmdldERvbU5vZGUoKSk7XG5cdFx0dGhpcy5fbm90ZWJvb2tUb3BSaWdodFRvb2xiYXJDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9ub3RlYm9va1RvcFJpZ2h0VG9vbGJhckNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdub3RlYm9vay10b29sYmFyLXJpZ2h0Jyk7XG5cdFx0RE9NLmFwcGVuZCh0aGlzLmRvbU5vZGUsIHRoaXMuX25vdGVib29rVG9wUmlnaHRUb29sYmFyQ29udGFpbmVyKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVBlckVkaXRvckNoYW5nZSgpIHtcblx0XHRpZiAodGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU/LmdldElkKCkgPT09IE5PVEVCT09LX0VESVRPUl9JRCkge1xuXHRcdFx0Y29uc3Qgbm90ZWJvb2tFZGl0b3IgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZS5nZXRDb250cm9sKCkgYXMgSU5vdGVib29rRWRpdG9yRGVsZWdhdGU7XG5cdFx0XHRpZiAobm90ZWJvb2tFZGl0b3IgPT09IHRoaXMubm90ZWJvb2tFZGl0b3IpIHtcblx0XHRcdFx0Ly8gdGhpcyBpcyB0aGUgYWN0aXZlIGVkaXRvclxuXHRcdFx0XHR0aGlzLl9zaG93Tm90ZWJvb2tBY3Rpb25zaW5FZGl0b3JUb29sYmFyKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3Rlck5vdGVib29rQWN0aW9uc1Rvb2xiYXIoKSB7XG5cdFx0dGhpcy5fbm90ZWJvb2tHbG9iYWxBY3Rpb25zTWVudSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMubWVudVNlcnZpY2UuY3JlYXRlTWVudSh0aGlzLm5vdGVib29rRWRpdG9yLmNyZWF0aW9uT3B0aW9ucy5tZW51SWRzLm5vdGVib29rVG9vbGJhciwgdGhpcy5jb250ZXh0S2V5U2VydmljZSkpO1xuXHRcdHRoaXMuX2V4ZWN1dGVHb1RvQWN0aW9uc01lbnUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLk5vdGVib29rQ2VsbEV4ZWN1dGVHb1RvLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cblx0XHR0aGlzLl91c2VHbG9iYWxUb29sYmFyID0gdGhpcy5ub3RlYm9va09wdGlvbnMuZ2V0RGlzcGxheU9wdGlvbnMoKS5nbG9iYWxUb29sYmFyO1xuXHRcdHRoaXMuX3JlbmRlckxhYmVsID0gdGhpcy5fY29udmVydENvbmZpZ3VyYXRpb24odGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShOb3RlYm9va1NldHRpbmcuZ2xvYmFsVG9vbGJhclNob3dMYWJlbCkpO1xuXHRcdHRoaXMuX3VwZGF0ZVN0cmF0ZWd5KCk7XG5cblx0XHRjb25zdCBjb250ZXh0ID0ge1xuXHRcdFx0dWk6IHRydWUsXG5cdFx0XHRub3RlYm9va0VkaXRvcjogdGhpcy5ub3RlYm9va0VkaXRvcixcblx0XHRcdHNvdXJjZTogJ25vdGVib29rVG9vbGJhcidcblx0XHR9O1xuXG5cdFx0Y29uc3QgYWN0aW9uUHJvdmlkZXIgPSAoYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKSA9PiB7XG5cdFx0XHRpZiAoYWN0aW9uLmlkID09PSBTRUxFQ1RfS0VSTkVMX0lEKSB7XG5cdFx0XHRcdC8vIHRoaXMgaXMgYmVpbmcgZGlzcG9zZWQgYnkgdGhlIGNvbnN1bWVyXG5cdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29LZXJuZWxBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB0aGlzLm5vdGVib29rRWRpdG9yLCBvcHRpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX3JlbmRlckxhYmVsICE9PSBSZW5kZXJMYWJlbC5OZXZlcikge1xuXHRcdFx0XHRjb25zdCBhID0gdGhpcy5fcHJpbWFyeUFjdGlvbnMuZmluZChhID0+IGEuYWN0aW9uLmlkID09PSBhY3Rpb24uaWQpO1xuXHRcdFx0XHRpZiAoYSAmJiBhLnJlbmRlckxhYmVsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uID8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBY3Rpb25WaWV3V2l0aExhYmVsLCBhY3Rpb24sIHsgaG92ZXJEZWxlZ2F0ZTogb3B0aW9ucy5ob3ZlckRlbGVnYXRlIH0pIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbiA/IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgeyBob3ZlckRlbGVnYXRlOiBvcHRpb25zLmhvdmVyRGVsZWdhdGUgfSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbiA/IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgeyBob3ZlckRlbGVnYXRlOiBvcHRpb25zLmhvdmVyRGVsZWdhdGUgfSkgOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIE1ha2Ugc3VyZSBib3RoIHRvb2xiYXJzIGhhdmUgdGhlIHNhbWUgaG92ZXIgZGVsZWdhdGUgZm9yIGluc3RhbnQgaG92ZXIgdG8gd29ya1xuXHRcdC8vIER1ZSB0byB0aGUgZWxlbWVudHMgYmVpbmcgZnVydGhlciBhcGFydCB0aGFuIG5vcm1hbCB0b29sYmFycywgdGhlIGRlZmF1bHQgdGltZSBsaW1pdCBpcyB0byBzaG9ydCBhbmQgaGFzIHRvIGJlIGluY3JlYXNlZFxuXHRcdGNvbnN0IGhvdmVyRGVsZWdhdGUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaEhvdmVyRGVsZWdhdGUsICdlbGVtZW50JywgeyBpbnN0YW50SG92ZXI6IHRydWUgfSwge30pKTtcblx0XHRob3ZlckRlbGVnYXRlLnNldEluc3RhbnRIb3ZlclRpbWVMaW1pdCg2MDApO1xuXG5cdFx0Y29uc3QgbGVmdFRvb2xiYXJPcHRpb25zOiBJV29ya2JlbmNoVG9vbEJhck9wdGlvbnMgPSB7XG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5SZW5kZXJJblNlY29uZGFyeUdyb3VwLFxuXHRcdFx0cmVzZXRNZW51OiBNZW51SWQuTm90ZWJvb2tUb29sYmFyLFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fc3RyYXRlZ3kuYWN0aW9uUHJvdmlkZXIoYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRLZXlCaW5kaW5nOiBhY3Rpb24gPT4gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCksXG5cdFx0XHRyZW5kZXJEcm9wZG93bkFzQ2hpbGRFbGVtZW50OiB0cnVlLFxuXHRcdFx0aG92ZXJEZWxlZ2F0ZVxuXHRcdH07XG5cblx0XHR0aGlzLl9ub3RlYm9va0xlZnRUb29sYmFyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaFRvb2xCYXIsXG5cdFx0XHR0aGlzLl9ub3RlYm9va1RvcExlZnRUb29sYmFyQ29udGFpbmVyLFxuXHRcdFx0bGVmdFRvb2xiYXJPcHRpb25zXG5cdFx0KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9ub3RlYm9va0xlZnRUb29sYmFyKTtcblx0XHR0aGlzLl9ub3RlYm9va0xlZnRUb29sYmFyLmNvbnRleHQgPSBjb250ZXh0O1xuXG5cdFx0dGhpcy5fbm90ZWJvb2tSaWdodFRvb2xiYXIgPSBuZXcgVG9vbEJhcih0aGlzLl9ub3RlYm9va1RvcFJpZ2h0VG9vbGJhckNvbnRhaW5lciwgdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsIHtcblx0XHRcdGdldEtleUJpbmRpbmc6IGFjdGlvbiA9PiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IGFjdGlvblByb3ZpZGVyLFxuXHRcdFx0cmVuZGVyRHJvcGRvd25Bc0NoaWxkRWxlbWVudDogdHJ1ZSxcblx0XHRcdGhvdmVyRGVsZWdhdGVcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9ub3RlYm9va1JpZ2h0VG9vbGJhcik7XG5cdFx0dGhpcy5fbm90ZWJvb2tSaWdodFRvb2xiYXIuY29udGV4dCA9IGNvbnRleHQ7XG5cblx0XHR0aGlzLl9zaG93Tm90ZWJvb2tBY3Rpb25zaW5FZGl0b3JUb29sYmFyKCk7XG5cdFx0bGV0IGRyb3Bkb3duSXNWaXNpYmxlID0gZmFsc2U7XG5cdFx0bGV0IGRlZmVycmVkVXBkYXRlOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9ub3RlYm9va0dsb2JhbEFjdGlvbnNNZW51Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmIChkcm9wZG93bklzVmlzaWJsZSkge1xuXHRcdFx0XHRkZWZlcnJlZFVwZGF0ZSA9ICgpID0+IHRoaXMuX3Nob3dOb3RlYm9va0FjdGlvbnNpbkVkaXRvclRvb2xiYXIoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5ub3RlYm9va0VkaXRvci5pc1Zpc2libGUpIHtcblx0XHRcdFx0dGhpcy5fc2hvd05vdGVib29rQWN0aW9uc2luRWRpdG9yVG9vbGJhcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX25vdGVib29rTGVmdFRvb2xiYXIub25EaWRDaGFuZ2VEcm9wZG93blZpc2liaWxpdHkodmlzaWJsZSA9PiB7XG5cdFx0XHRkcm9wZG93bklzVmlzaWJsZSA9IHZpc2libGU7XG5cblx0XHRcdGlmIChkZWZlcnJlZFVwZGF0ZSAmJiAhdmlzaWJsZSkge1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRkZWZlcnJlZFVwZGF0ZT8uKCk7XG5cdFx0XHRcdH0sIDApO1xuXHRcdFx0XHRkZWZlcnJlZFVwZGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm5vdGVib29rT3B0aW9ucy5vbkRpZENoYW5nZU9wdGlvbnMoZSA9PiB7XG5cdFx0XHRpZiAoZS5nbG9iYWxUb29sYmFyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fdXNlR2xvYmFsVG9vbGJhciA9IHRoaXMubm90ZWJvb2tPcHRpb25zLmdldERpc3BsYXlPcHRpb25zKCkuZ2xvYmFsVG9vbGJhcjtcblx0XHRcdFx0dGhpcy5fc2hvd05vdGVib29rQWN0aW9uc2luRWRpdG9yVG9vbGJhcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLmdsb2JhbFRvb2xiYXJTaG93TGFiZWwpKSB7XG5cdFx0XHRcdHRoaXMuX3JlbmRlckxhYmVsID0gdGhpcy5fY29udmVydENvbmZpZ3VyYXRpb24odGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxSZW5kZXJMYWJlbFdpdGhGYWxsYmFjaz4oTm90ZWJvb2tTZXR0aW5nLmdsb2JhbFRvb2xiYXJTaG93TGFiZWwpKTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlU3RyYXRlZ3koKTtcblx0XHRcdFx0Y29uc3Qgb2xkRWxlbWVudCA9IHRoaXMuX25vdGVib29rTGVmdFRvb2xiYXIuZ2V0RWxlbWVudCgpO1xuXHRcdFx0XHRvbGRFbGVtZW50LnJlbW92ZSgpO1xuXHRcdFx0XHR0aGlzLl9ub3RlYm9va0xlZnRUb29sYmFyLmRpc3Bvc2UoKTtcblxuXHRcdFx0XHR0aGlzLl9ub3RlYm9va0xlZnRUb29sYmFyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRXb3JrYmVuY2hUb29sQmFyLFxuXHRcdFx0XHRcdHRoaXMuX25vdGVib29rVG9wTGVmdFRvb2xiYXJDb250YWluZXIsXG5cdFx0XHRcdFx0bGVmdFRvb2xiYXJPcHRpb25zXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbm90ZWJvb2tMZWZ0VG9vbGJhcik7XG5cdFx0XHRcdHRoaXMuX25vdGVib29rTGVmdFRvb2xiYXIuY29udGV4dCA9IGNvbnRleHQ7XG5cdFx0XHRcdHRoaXMuX3Nob3dOb3RlYm9va0FjdGlvbnNpbkVkaXRvclRvb2xiYXIoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVN0cmF0ZWd5KCkge1xuXHRcdHN3aXRjaCAodGhpcy5fcmVuZGVyTGFiZWwpIHtcblx0XHRcdGNhc2UgUmVuZGVyTGFiZWwuQWx3YXlzOlxuXHRcdFx0XHR0aGlzLl9zdHJhdGVneSA9IG5ldyBXb3JrYmVuY2hBbHdheXNMYWJlbFN0cmF0ZWd5KHRoaXMubm90ZWJvb2tFZGl0b3IsIHRoaXMsIHRoaXMuX2V4ZWN1dGVHb1RvQWN0aW9uc01lbnUsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUmVuZGVyTGFiZWwuTmV2ZXI6XG5cdFx0XHRcdHRoaXMuX3N0cmF0ZWd5ID0gbmV3IFdvcmtiZW5jaE5ldmVyTGFiZWxTdHJhdGVneSh0aGlzLm5vdGVib29rRWRpdG9yLCB0aGlzLCB0aGlzLl9leGVjdXRlR29Ub0FjdGlvbnNNZW51LCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJlbmRlckxhYmVsLkR5bmFtaWM6XG5cdFx0XHRcdHRoaXMuX3N0cmF0ZWd5ID0gbmV3IFdvcmtiZW5jaER5bmFtaWNMYWJlbFN0cmF0ZWd5KHRoaXMubm90ZWJvb2tFZGl0b3IsIHRoaXMsIHRoaXMuX2V4ZWN1dGVHb1RvQWN0aW9uc01lbnUsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jb252ZXJ0Q29uZmlndXJhdGlvbih2YWx1ZTogUmVuZGVyTGFiZWxXaXRoRmFsbGJhY2spOiBSZW5kZXJMYWJlbCB7XG5cdFx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdFx0Y2FzZSB0cnVlOlxuXHRcdFx0XHRyZXR1cm4gUmVuZGVyTGFiZWwuQWx3YXlzO1xuXHRcdFx0Y2FzZSBmYWxzZTpcblx0XHRcdFx0cmV0dXJuIFJlbmRlckxhYmVsLk5ldmVyO1xuXHRcdFx0Y2FzZSAnYWx3YXlzJzpcblx0XHRcdFx0cmV0dXJuIFJlbmRlckxhYmVsLkFsd2F5cztcblx0XHRcdGNhc2UgJ25ldmVyJzpcblx0XHRcdFx0cmV0dXJuIFJlbmRlckxhYmVsLk5ldmVyO1xuXHRcdFx0Y2FzZSAnZHluYW1pYyc6XG5cdFx0XHRcdHJldHVybiBSZW5kZXJMYWJlbC5EeW5hbWljO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Nob3dOb3RlYm9va0FjdGlvbnNpbkVkaXRvclRvb2xiYXIoKSB7XG5cdFx0Ly8gd2hlbiB0aGVyZSBpcyBubyB2aWV3IG1vZGVsLCBqdXN0IGlnbm9yZS5cblx0XHRpZiAoIXRoaXMubm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0dGhpcy5fZGVmZXJyZWRBY3Rpb25VcGRhdGU/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2RlZmVycmVkQWN0aW9uVXBkYXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy52aXNpYmxlID0gZmFsc2U7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2RlZmVycmVkQWN0aW9uVXBkYXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl91c2VHbG9iYWxUb29sYmFyKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX2RlZmVycmVkQWN0aW9uVXBkYXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy52aXNpYmxlID0gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2RlZmVycmVkQWN0aW9uVXBkYXRlID0gZGlzcG9zYWJsZVRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9zZXROb3RlYm9va0FjdGlvbnMoKTtcblx0XHRcdFx0dGhpcy52aXNpYmxlID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fZGVmZXJyZWRBY3Rpb25VcGRhdGU/LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fZGVmZXJyZWRBY3Rpb25VcGRhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9LCA1MCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2V0Tm90ZWJvb2tBY3Rpb25zKCkge1xuXHRcdGNvbnN0IGdyb3VwcyA9IHRoaXMuX25vdGVib29rR2xvYmFsQWN0aW9uc01lbnUuZ2V0QWN0aW9ucyh7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlLCByZW5kZXJTaG9ydFRpdGxlOiB0cnVlIH0pO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdGNvbnN0IHByaW1hcnlMZWZ0R3JvdXBzID0gZ3JvdXBzLmZpbHRlcihncm91cCA9PiAvXm5hdmlnYXRpb24vLnRlc3QoZ3JvdXBbMF0pKTtcblx0XHRjb25zdCBwcmltYXJ5QWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0cHJpbWFyeUxlZnRHcm91cHMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0aWYgKGFbMF0gPT09ICduYXZpZ2F0aW9uJykge1xuXHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGJbMF0gPT09ICduYXZpZ2F0aW9uJykge1xuXHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiAwO1xuXHRcdH0pLmZvckVhY2goKGdyb3VwLCBpbmRleCkgPT4ge1xuXHRcdFx0cHJpbWFyeUFjdGlvbnMucHVzaCguLi5ncm91cFsxXSk7XG5cdFx0XHRpZiAoaW5kZXggPCBwcmltYXJ5TGVmdEdyb3Vwcy5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBwcmltYXJ5UmlnaHRHcm91cCA9IGdyb3Vwcy5maW5kKGdyb3VwID0+IC9ec3RhdHVzLy50ZXN0KGdyb3VwWzBdKSk7XG5cdFx0Y29uc3QgcHJpbWFyeVJpZ2h0QWN0aW9ucyA9IHByaW1hcnlSaWdodEdyb3VwID8gcHJpbWFyeVJpZ2h0R3JvdXBbMV0gOiBbXTtcblx0XHRjb25zdCBzZWNvbmRhcnlBY3Rpb25zID0gZ3JvdXBzLmZpbHRlcihncm91cCA9PiAhL15uYXZpZ2F0aW9uLy50ZXN0KGdyb3VwWzBdKSAmJiAhL15zdGF0dXMvLnRlc3QoZ3JvdXBbMF0pKS5yZWR1Y2UoKHByZXY6IChNZW51SXRlbUFjdGlvbiB8IFN1Ym1lbnVJdGVtQWN0aW9uKVtdLCBjdXJyKSA9PiB7IHByZXYucHVzaCguLi5jdXJyWzFdKTsgcmV0dXJuIHByZXY7IH0sIFtdKTtcblxuXHRcdHRoaXMuX25vdGVib29rTGVmdFRvb2xiYXIuc2V0QWN0aW9ucyhbXSwgW10pO1xuXG5cdFx0dGhpcy5fcHJpbWFyeUFjdGlvbnMgPSBwcmltYXJ5QWN0aW9ucy5tYXAoYWN0aW9uID0+ICh7XG5cdFx0XHRhY3Rpb246IGFjdGlvbixcblx0XHRcdHNpemU6IChhY3Rpb24gaW5zdGFuY2VvZiBTZXBhcmF0b3IgPyAxIDogMCksXG5cdFx0XHRyZW5kZXJMYWJlbDogdHJ1ZSxcblx0XHRcdHZpc2libGU6IHRydWVcblx0XHR9KSk7XG5cdFx0dGhpcy5fbm90ZWJvb2tMZWZ0VG9vbGJhci5zZXRBY3Rpb25zKHByaW1hcnlBY3Rpb25zLCBzZWNvbmRhcnlBY3Rpb25zKTtcblx0XHR0aGlzLl9zZWNvbmRhcnlBY3Rpb25zID0gc2Vjb25kYXJ5QWN0aW9ucztcblxuXHRcdHRoaXMuX25vdGVib29rUmlnaHRUb29sYmFyLnNldEFjdGlvbnMocHJpbWFyeVJpZ2h0QWN0aW9ucywgW10pO1xuXHRcdHRoaXMuX3NlY29uZGFyeUFjdGlvbnMgPSBzZWNvbmRhcnlBY3Rpb25zO1xuXG5cblx0XHRpZiAodGhpcy5fZGltZW5zaW9uICYmIHRoaXMuX2RpbWVuc2lvbi53aWR0aCA+PSAwICYmIHRoaXMuX2RpbWVuc2lvbi5oZWlnaHQgPj0gMCkge1xuXHRcdFx0dGhpcy5fY2FjaGVJdGVtU2l6ZXModGhpcy5fbm90ZWJvb2tMZWZ0VG9vbGJhcik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29tcHV0ZVNpemVzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9jYWNoZUl0ZW1TaXplcyh0b29sYmFyOiBXb3JrYmVuY2hUb29sQmFyKSB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0b29sYmFyLmdldEl0ZW1zTGVuZ3RoKCk7IGkrKykge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gdG9vbGJhci5nZXRJdGVtQWN0aW9uKGkpO1xuXHRcdFx0aWYgKGFjdGlvbiAmJiBhY3Rpb24uaWQgIT09ICd0b29sYmFyLnRvZ2dsZS5tb3JlJykge1xuXHRcdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3ByaW1hcnlBY3Rpb25zLmZpbmQoYSA9PiBhLmFjdGlvbi5pZCA9PT0gYWN0aW9uLmlkKTtcblx0XHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdFx0ZXhpc3Rpbmcuc2l6ZSA9IHRvb2xiYXIuZ2V0SXRlbVdpZHRoKGkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZVNpemVzKCkge1xuXHRcdGNvbnN0IHRvb2xiYXIgPSB0aGlzLl9ub3RlYm9va0xlZnRUb29sYmFyO1xuXHRcdGNvbnN0IHJpZ2h0VG9vbGJhciA9IHRoaXMuX25vdGVib29rUmlnaHRUb29sYmFyO1xuXHRcdGlmICh0b29sYmFyICYmIHJpZ2h0VG9vbGJhciAmJiB0aGlzLl9kaW1lbnNpb24gJiYgdGhpcy5fZGltZW5zaW9uLmhlaWdodCA+PSAwICYmIHRoaXMuX2RpbWVuc2lvbi53aWR0aCA+PSAwKSB7XG5cdFx0XHQvLyBjb21wdXRlIHNpemUgb25seSBpZiBpdCdzIHZpc2libGVcblx0XHRcdGlmICh0aGlzLl9wcmltYXJ5QWN0aW9ucy5sZW5ndGggPT09IDAgJiYgdG9vbGJhci5nZXRJdGVtc0xlbmd0aCgpICE9PSB0aGlzLl9wcmltYXJ5QWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5fY2FjaGVJdGVtU2l6ZXModGhpcy5fbm90ZWJvb2tMZWZ0VG9vbGJhcik7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9wcmltYXJ5QWN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBrZXJuZWxXaWR0aCA9IChyaWdodFRvb2xiYXIuZ2V0SXRlbXNMZW5ndGgoKSA/IHJpZ2h0VG9vbGJhci5nZXRJdGVtV2lkdGgoMCkgOiAwKSArIEFDVElPTl9QQURESU5HO1xuXHRcdFx0Y29uc3QgbGVmdFRvb2xiYXJDb250YWluZXJNYXhXaWR0aCA9IHRoaXMuX2RpbWVuc2lvbi53aWR0aCAtIGtlcm5lbFdpZHRoIC0gKEFDVElPTl9QQURESU5HICsgVE9HR0xFX01PUkVfQUNUSU9OX1dJRFRIKSAtICgvKiogdG9vbGJhciBsZWZ0IG1hcmdpbiAqL0FDVElPTl9QQURESU5HKSAtICgvKiogdG9vbGJhciByaWdodCBtYXJnaW4gKi9BQ1RJT05fUEFERElORyk7XG5cdFx0XHRjb25zdCBjYWxjdWxhdGVkQWN0aW9ucyA9IHRoaXMuX3N0cmF0ZWd5LmNhbGN1bGF0ZUFjdGlvbnMobGVmdFRvb2xiYXJDb250YWluZXJNYXhXaWR0aCk7XG5cdFx0XHR0aGlzLl9ub3RlYm9va0xlZnRUb29sYmFyLnNldEFjdGlvbnMoY2FsY3VsYXRlZEFjdGlvbnMucHJpbWFyeUFjdGlvbnMsIGNhbGN1bGF0ZWRBY3Rpb25zLnNlY29uZGFyeUFjdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdGxheW91dChkaW1lbnNpb246IERPTS5EaW1lbnNpb24pIHtcblx0XHR0aGlzLl9kaW1lbnNpb24gPSBkaW1lbnNpb247XG5cblx0XHRpZiAoIXRoaXMuX3VzZUdsb2JhbFRvb2xiYXIpIHtcblx0XHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0XHR9XG5cdFx0dGhpcy5fY29tcHV0ZVNpemVzKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHRoaXMuX25vdGVib29rTGVmdFRvb2xiYXIuY29udGV4dCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9ub3RlYm9va1JpZ2h0VG9vbGJhci5jb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX25vdGVib29rTGVmdFRvb2xiYXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX25vdGVib29rUmlnaHRUb29sYmFyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9ub3RlYm9va0xlZnRUb29sYmFyID0gbnVsbCE7XG5cdFx0dGhpcy5fbm90ZWJvb2tSaWdodFRvb2xiYXIgPSBudWxsITtcblx0XHR0aGlzLl9kZWZlcnJlZEFjdGlvblVwZGF0ZT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2RlZmVycmVkQWN0aW9uVXBkYXRlID0gdW5kZWZpbmVkO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3b3JrYmVuY2hDYWxjdWxhdGVBY3Rpb25zKGluaXRpYWxQcmltYXJ5QWN0aW9uczogSUFjdGlvbk1vZGVsW10sIGluaXRpYWxTZWNvbmRhcnlBY3Rpb25zOiBJQWN0aW9uW10sIGxlZnRUb29sYmFyQ29udGFpbmVyTWF4V2lkdGg6IG51bWJlcik6IHsgcHJpbWFyeUFjdGlvbnM6IElBY3Rpb25Nb2RlbFtdOyBzZWNvbmRhcnlBY3Rpb25zOiBJQWN0aW9uW10gfSB7XG5cdHJldHVybiBhY3Rpb25PdmVyZmxvd0hlbHBlcihpbml0aWFsUHJpbWFyeUFjdGlvbnMsIGluaXRpYWxTZWNvbmRhcnlBY3Rpb25zLCBsZWZ0VG9vbGJhckNvbnRhaW5lck1heFdpZHRoLCBmYWxzZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3b3JrYmVuY2hEeW5hbWljQ2FsY3VsYXRlQWN0aW9ucyhpbml0aWFsUHJpbWFyeUFjdGlvbnM6IElBY3Rpb25Nb2RlbFtdLCBpbml0aWFsU2Vjb25kYXJ5QWN0aW9uczogSUFjdGlvbltdLCBsZWZ0VG9vbGJhckNvbnRhaW5lck1heFdpZHRoOiBudW1iZXIpOiB7IHByaW1hcnlBY3Rpb25zOiBJQWN0aW9uTW9kZWxbXTsgc2Vjb25kYXJ5QWN0aW9uczogSUFjdGlvbltdIH0ge1xuXG5cdGlmIChpbml0aWFsUHJpbWFyeUFjdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHsgcHJpbWFyeUFjdGlvbnM6IFtdLCBzZWNvbmRhcnlBY3Rpb25zOiBpbml0aWFsU2Vjb25kYXJ5QWN0aW9ucyB9O1xuXHR9XG5cblx0Ly8gZmluZCB0cnVlIGxlbmd0aCBvZiBhcnJheSwgYWRkIDEgZm9yIGVhY2ggcHJpbWFyeSBhY3Rpb25zLCBpZ25vcmluZyBhbiBpdGVtIHdoZW4gc2l6ZSA9IDBcblx0Y29uc3QgdmlzaWJsZUFjdGlvbkxlbmd0aCA9IGluaXRpYWxQcmltYXJ5QWN0aW9ucy5maWx0ZXIoYWN0aW9uID0+IGFjdGlvbi5zaXplICE9PSAwKS5sZW5ndGg7XG5cblx0Ly8gc3RlcCAxOiB0cnkgdG8gZml0IGFsbCBwcmltYXJ5IGFjdGlvbnNcblx0Y29uc3QgdG90YWxXaWR0aFdpdGhMYWJlbHMgPSBpbml0aWFsUHJpbWFyeUFjdGlvbnMubWFwKGFjdGlvbiA9PiBhY3Rpb24uc2l6ZSkucmVkdWNlKChhLCBiKSA9PiBhICsgYiwgMCkgKyAodmlzaWJsZUFjdGlvbkxlbmd0aCAtIDEpICogQUNUSU9OX1BBRERJTkc7XG5cdGlmICh0b3RhbFdpZHRoV2l0aExhYmVscyA8PSBsZWZ0VG9vbGJhckNvbnRhaW5lck1heFdpZHRoKSB7XG5cdFx0aW5pdGlhbFByaW1hcnlBY3Rpb25zLmZvckVhY2goYWN0aW9uID0+IHtcblx0XHRcdGFjdGlvbi5yZW5kZXJMYWJlbCA9IHRydWU7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGFjdGlvbk92ZXJmbG93SGVscGVyKGluaXRpYWxQcmltYXJ5QWN0aW9ucywgaW5pdGlhbFNlY29uZGFyeUFjdGlvbnMsIGxlZnRUb29sYmFyQ29udGFpbmVyTWF4V2lkdGgsIGZhbHNlKTtcblx0fVxuXG5cdC8vIHN0ZXAgMjogY2hlY2sgaWYgdGhleSBmaXQgd2l0aG91dCBsYWJlbHNcblx0aWYgKCh2aXNpYmxlQWN0aW9uTGVuZ3RoICogSUNPTl9PTkxZX0FDVElPTl9XSURUSCArICh2aXNpYmxlQWN0aW9uTGVuZ3RoIC0gMSkgKiBBQ1RJT05fUEFERElORykgPiBsZWZ0VG9vbGJhckNvbnRhaW5lck1heFdpZHRoKSB7XG5cdFx0aW5pdGlhbFByaW1hcnlBY3Rpb25zLmZvckVhY2goYWN0aW9uID0+IHsgYWN0aW9uLnJlbmRlckxhYmVsID0gZmFsc2U7IH0pO1xuXHRcdHJldHVybiBhY3Rpb25PdmVyZmxvd0hlbHBlcihpbml0aWFsUHJpbWFyeUFjdGlvbnMsIGluaXRpYWxTZWNvbmRhcnlBY3Rpb25zLCBsZWZ0VG9vbGJhckNvbnRhaW5lck1heFdpZHRoLCB0cnVlKTtcblx0fVxuXG5cdC8vIHN0ZXAgMzogcmVuZGVyIGFzIG1hbnkgYWN0aW9ucyBhcyBwb3NzaWJsZSB3aXRoIGxhYmVscywgcmVzdCB3aXRob3V0LlxuXHRsZXQgc3VtID0gMDtcblx0bGV0IGxhc3RBY3Rpb25XaXRoTGFiZWwgPSAtMTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBpbml0aWFsUHJpbWFyeUFjdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRzdW0gKz0gaW5pdGlhbFByaW1hcnlBY3Rpb25zW2ldLnNpemUgKyBBQ1RJT05fUEFERElORztcblxuXHRcdGlmIChpbml0aWFsUHJpbWFyeUFjdGlvbnNbaV0uYWN0aW9uIGluc3RhbmNlb2YgU2VwYXJhdG9yKSB7XG5cdFx0XHQvLyBmaW5kIGdyb3VwIHNlcGFyYXRvclxuXHRcdFx0Y29uc3QgcmVtYWluaW5nSXRlbXMgPSBpbml0aWFsUHJpbWFyeUFjdGlvbnMuc2xpY2UoaSArIDEpLmZpbHRlcihhY3Rpb24gPT4gYWN0aW9uLnNpemUgIT09IDApOyAvLyB0b2RvOiBuZWVkIHRvIGV4Y2x1ZGUgc2l6ZSAwIGl0ZW1zIGZyb20gdGhpc1xuXHRcdFx0Y29uc3QgbmV3VG90YWxTdW0gPSBzdW0gKyAocmVtYWluaW5nSXRlbXMubGVuZ3RoID09PSAwID8gMCA6IChyZW1haW5pbmdJdGVtcy5sZW5ndGggKiBJQ09OX09OTFlfQUNUSU9OX1dJRFRIICsgKHJlbWFpbmluZ0l0ZW1zLmxlbmd0aCAtIDEpICogQUNUSU9OX1BBRERJTkcpKTtcblx0XHRcdGlmIChuZXdUb3RhbFN1bSA8PSBsZWZ0VG9vbGJhckNvbnRhaW5lck1heFdpZHRoKSB7XG5cdFx0XHRcdGxhc3RBY3Rpb25XaXRoTGFiZWwgPSBpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdH1cblxuXHQvLyBpY29ucyBvbmx5IGRvbid0IGZpdCBlaXRoZXJcblx0aWYgKGxhc3RBY3Rpb25XaXRoTGFiZWwgPCAwKSB7XG5cdFx0aW5pdGlhbFByaW1hcnlBY3Rpb25zLmZvckVhY2goYWN0aW9uID0+IHsgYWN0aW9uLnJlbmRlckxhYmVsID0gZmFsc2U7IH0pO1xuXHRcdHJldHVybiBhY3Rpb25PdmVyZmxvd0hlbHBlcihpbml0aWFsUHJpbWFyeUFjdGlvbnMsIGluaXRpYWxTZWNvbmRhcnlBY3Rpb25zLCBsZWZ0VG9vbGJhckNvbnRhaW5lck1heFdpZHRoLCB0cnVlKTtcblx0fVxuXG5cdC8vIHJlbmRlciBsYWJlbHMgZm9yIHRoZSBhY3Rpb25zIHRoYXQgaGF2ZSBzcGFjZVxuXHRpbml0aWFsUHJpbWFyeUFjdGlvbnMuc2xpY2UoMCwgbGFzdEFjdGlvbldpdGhMYWJlbCArIDEpLmZvckVhY2goYWN0aW9uID0+IHsgYWN0aW9uLnJlbmRlckxhYmVsID0gdHJ1ZTsgfSk7XG5cdGluaXRpYWxQcmltYXJ5QWN0aW9ucy5zbGljZShsYXN0QWN0aW9uV2l0aExhYmVsICsgMSkuZm9yRWFjaChhY3Rpb24gPT4geyBhY3Rpb24ucmVuZGVyTGFiZWwgPSBmYWxzZTsgfSk7XG5cdHJldHVybiB7XG5cdFx0cHJpbWFyeUFjdGlvbnM6IGluaXRpYWxQcmltYXJ5QWN0aW9ucyxcblx0XHRzZWNvbmRhcnlBY3Rpb25zOiBpbml0aWFsU2Vjb25kYXJ5QWN0aW9uc1xuXHR9O1xufVxuXG5mdW5jdGlvbiBhY3Rpb25PdmVyZmxvd0hlbHBlcihpbml0aWFsUHJpbWFyeUFjdGlvbnM6IElBY3Rpb25Nb2RlbFtdLCBpbml0aWFsU2Vjb25kYXJ5QWN0aW9uczogSUFjdGlvbltdLCBsZWZ0VG9vbGJhckNvbnRhaW5lck1heFdpZHRoOiBudW1iZXIsIGljb25Pbmx5OiBib29sZWFuKTogeyBwcmltYXJ5QWN0aW9uczogSUFjdGlvbk1vZGVsW107IHNlY29uZGFyeUFjdGlvbnM6IElBY3Rpb25bXSB9IHtcblx0Y29uc3QgcmVuZGVyQWN0aW9uczogSUFjdGlvbk1vZGVsW10gPSBbXTtcblx0Y29uc3Qgb3ZlcmZsb3c6IElBY3Rpb25bXSA9IFtdO1xuXG5cdGxldCBjdXJyZW50U2l6ZSA9IDA7XG5cdGxldCBub25aZXJvQWN0aW9uID0gZmFsc2U7XG5cdGxldCBjb250YWluZXJGdWxsID0gZmFsc2U7XG5cblx0aWYgKGluaXRpYWxQcmltYXJ5QWN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4geyBwcmltYXJ5QWN0aW9uczogW10sIHNlY29uZGFyeUFjdGlvbnM6IGluaXRpYWxTZWNvbmRhcnlBY3Rpb25zIH07XG5cdH1cblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IGluaXRpYWxQcmltYXJ5QWN0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGFjdGlvbk1vZGVsID0gaW5pdGlhbFByaW1hcnlBY3Rpb25zW2ldO1xuXHRcdGNvbnN0IGl0ZW1TaXplID0gaWNvbk9ubHkgPyAoYWN0aW9uTW9kZWwuc2l6ZSA9PT0gMCA/IDAgOiBJQ09OX09OTFlfQUNUSU9OX1dJRFRIKSA6IGFjdGlvbk1vZGVsLnNpemU7XG5cblx0XHQvLyBpZiB0d28gc2VwYXJhdG9ycyBpbiBhIHJvdywgaWdub3JlIHRoZSBzZWNvbmRcblx0XHRpZiAoYWN0aW9uTW9kZWwuYWN0aW9uIGluc3RhbmNlb2YgU2VwYXJhdG9yICYmIHJlbmRlckFjdGlvbnMubGVuZ3RoID4gMCAmJiByZW5kZXJBY3Rpb25zW3JlbmRlckFjdGlvbnMubGVuZ3RoIC0gMV0uYWN0aW9uIGluc3RhbmNlb2YgU2VwYXJhdG9yKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHQvLyBpZiBhIHNlcGFyYXRvciBpcyB0aGUgZmlyc3Qgbm9uWmVybyBhY3Rpb24sIGlnbm9yZSBpdFxuXHRcdGlmIChhY3Rpb25Nb2RlbC5hY3Rpb24gaW5zdGFuY2VvZiBTZXBhcmF0b3IgJiYgIW5vblplcm9BY3Rpb24pIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXG5cdFx0aWYgKGN1cnJlbnRTaXplICsgaXRlbVNpemUgPD0gbGVmdFRvb2xiYXJDb250YWluZXJNYXhXaWR0aCAmJiAhY29udGFpbmVyRnVsbCkge1xuXHRcdFx0Y3VycmVudFNpemUgKz0gQUNUSU9OX1BBRERJTkcgKyBpdGVtU2l6ZTtcblx0XHRcdHJlbmRlckFjdGlvbnMucHVzaChhY3Rpb25Nb2RlbCk7XG5cdFx0XHRpZiAoaXRlbVNpemUgIT09IDApIHtcblx0XHRcdFx0bm9uWmVyb0FjdGlvbiA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYWN0aW9uTW9kZWwuYWN0aW9uIGluc3RhbmNlb2YgU2VwYXJhdG9yKSB7XG5cdFx0XHRcdG5vblplcm9BY3Rpb24gPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29udGFpbmVyRnVsbCA9IHRydWU7XG5cdFx0XHRpZiAoaXRlbVNpemUgPT09IDApIHsgLy8gc2l6ZSAwIGltcGxpZXMgYSBoaWRkZW4gaXRlbSwga2VlcCBpbiBwcmltYXJ5IHRvIGFsbG93IGZvciBXb3JrYmVuY2ggdG8gaGFuZGxlIHZpc2liaWxpdHlcblx0XHRcdFx0cmVuZGVyQWN0aW9ucy5wdXNoKGFjdGlvbk1vZGVsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChhY3Rpb25Nb2RlbC5hY3Rpb24gaW5zdGFuY2VvZiBTZXBhcmF0b3IpIHsgLy8gbmV2ZXIgcHVzaCBhIHNlcGFyYXRvciB0byBvdmVyZmxvd1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG92ZXJmbG93LnB1c2goYWN0aW9uTW9kZWwuYWN0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRmb3IgKGxldCBpID0gKHJlbmRlckFjdGlvbnMubGVuZ3RoIC0gMSk7IGkgPiAwOyBpLS0pIHtcblx0XHRjb25zdCB0ZW1wID0gcmVuZGVyQWN0aW9uc1tpXTtcblx0XHRpZiAodGVtcC5zaXplID09PSAwKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKHRlbXAuYWN0aW9uIGluc3RhbmNlb2YgU2VwYXJhdG9yKSB7XG5cdFx0XHRyZW5kZXJBY3Rpb25zLnNwbGljZShpLCAxKTtcblx0XHR9XG5cdFx0YnJlYWs7XG5cdH1cblxuXG5cdGlmIChyZW5kZXJBY3Rpb25zLmxlbmd0aCAmJiByZW5kZXJBY3Rpb25zW3JlbmRlckFjdGlvbnMubGVuZ3RoIC0gMV0uYWN0aW9uIGluc3RhbmNlb2YgU2VwYXJhdG9yKSB7XG5cdFx0cmVuZGVyQWN0aW9ucy5wb3AoKTtcblx0fVxuXG5cdGlmIChvdmVyZmxvdy5sZW5ndGggIT09IDApIHtcblx0XHRvdmVyZmxvdy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdH1cblxuXHRpZiAoaWNvbk9ubHkpIHtcblx0XHQvLyBpZiBpY29uIG9ubHkgbW9kZSwgZG9uJ3QgcmVuZGVyIGJvdGggKCsgY29kZSkgYW5kICgrIG1hcmtkb3duKSBidXR0b25zLiByZW1vdmUgb2YgbWFya2Rvd24gYWN0aW9uXG5cdFx0Y29uc3QgbWFya2Rvd25JbmRleCA9IHJlbmRlckFjdGlvbnMuZmluZEluZGV4KGEgPT4gYS5hY3Rpb24uaWQgPT09ICdub3RlYm9vay5jZWxsLmluc2VydE1hcmtkb3duQ2VsbEJlbG93Jyk7XG5cdFx0aWYgKG1hcmtkb3duSW5kZXggIT09IC0xKSB7XG5cdFx0XHRyZW5kZXJBY3Rpb25zLnNwbGljZShtYXJrZG93bkluZGV4LCAxKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdHByaW1hcnlBY3Rpb25zOiByZW5kZXJBY3Rpb25zLFxuXHRcdHNlY29uZGFyeUFjdGlvbnM6IFsuLi5vdmVyZmxvdywgLi4uaW5pdGlhbFNlY29uZGFyeUFjdGlvbnNdXG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGVBQWU7QUFDeEIsU0FBa0IsaUJBQWlCO0FBQ25DLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsa0JBQStCO0FBQ3hDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMseUJBQXlCLGtDQUFrQztBQUNwRSxTQUFnQixjQUFjLFFBQVEsZ0JBQWdCLHlCQUF5QjtBQUMvRSxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9CQUFvQix1QkFBdUI7QUFFcEQsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxxQkFBcUIsZ0NBQWdDO0FBQzlELFNBQVMsc0JBQXNCO0FBRy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQThDLHdCQUF3QjtB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
