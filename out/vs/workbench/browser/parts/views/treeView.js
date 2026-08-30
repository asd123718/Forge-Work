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
import { DataTransfers } from "../../../../base/browser/dnd.js";
import * as DOM from "../../../../base/browser/dom.js";
import * as cssJs from "../../../../base/browser/cssValue.js";
import { renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { TreeDragOverBubble } from "../../../../base/browser/ui/tree/tree.js";
import { CollapseAllAction } from "../../../../base/browser/ui/tree/treeDefaults.js";
import { ActionRunner, Separator } from "../../../../base/common/actions.js";
import { timeout } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { createMatches } from "../../../../base/common/filters.js";
import { isMarkdownString, MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { Mimes } from "../../../../base/common/mime.js";
import { Schemas } from "../../../../base/common/network.js";
import { basename, dirname } from "../../../../base/common/resources.js";
import { isFalsyOrWhitespace } from "../../../../base/common/strings.js";
import { isString } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import "./media/views.css";
import { VSDataTransfer } from "../../../../base/common/dataTransfer.js";
import { localize } from "../../../../nls.js";
import { createActionViewItem, getContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, IMenuService, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { FileKind } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProgressService } from "../../../../platform/progress/common/progress.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { isDark } from "../../../../platform/theme/common/theme.js";
import { FileThemeIcon, FolderThemeIcon, IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { fillEditorsDragData } from "../../dnd.js";
import { ResourceLabels } from "../../labels.js";
import { API_OPEN_DIFF_EDITOR_COMMAND_ID, API_OPEN_EDITOR_COMMAND_ID } from "../editor/editorCommands.js";
import { getLocationBasedViewColors, ViewPane } from "./viewPane.js";
import { Extensions, IViewDescriptorService, ResolvableTreeItem, TreeItemCollapsibleState } from "../../../common/views.js";
import { IActivityService, NumberBadge } from "../../../services/activity/common/activity.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IHoverService, WorkbenchHoverDelegate } from "../../../../platform/hover/browser/hover.js";
import { CodeDataTransfers, LocalSelectionTransfer } from "../../../../platform/dnd/browser/dnd.js";
import { toExternalVSDataTransfer } from "../../../../editor/browser/dataTransfer.js";
import { CheckboxStateHandler, TreeItemCheckbox } from "./checkbox.js";
import { setTimeout0 } from "../../../../base/common/platform.js";
import { TelemetryTrustedValue } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { ITreeViewsDnDService } from "../../../../editor/common/services/treeViewsDndService.js";
import { DraggedTreeItemsIdentifier } from "../../../../editor/common/services/treeViewsDnd.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { parseLinkedText } from "../../../../base/common/linkedText.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { defaultButtonStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IAccessibleViewInformationService } from "../../../services/accessibility/common/accessibleViewInformationService.js";
let TreeViewPane = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, notificationService, hoverService, accessibleViewService) {
    super({ ...options, titleMenuId: MenuId.ViewTitle, donotForwardArgs: false }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewService);
    const { treeView } = Registry.as(Extensions.ViewsRegistry).getView(options.id);
    this.treeView = treeView;
    this._register(this.treeView.onDidChangeActions(() => this.updateActions(), this));
    this._register(this.treeView.onDidChangeTitle((newTitle) => this.updateTitle(newTitle)));
    this._register(this.treeView.onDidChangeDescription((newDescription) => this.updateTitleDescription(newDescription)));
    this._register(toDisposable(() => {
      if (this._container && this.treeView.container && this._container === this.treeView.container) {
        this.treeView.setVisibility(false);
      }
    }));
    this._register(this.onDidChangeBodyVisibility(() => this.updateTreeVisibility()));
    this._register(this.treeView.onDidChangeWelcomeState(() => this._onDidChangeViewWelcomeState.fire()));
    if (options.title !== this.treeView.title) {
      this.updateTitle(this.treeView.title);
    }
    if (options.titleDescription !== this.treeView.description) {
      this.updateTitleDescription(this.treeView.description);
    }
    this._actionRunner = this._register(new MultipleSelectionActionRunner(notificationService, () => this.treeView.getSelection()));
    this.updateTreeVisibility();
  }
  focus() {
    super.focus();
    this.treeView.focus();
  }
  renderBody(container) {
    this._container = container;
    super.renderBody(container);
    this.renderTreeView(container);
  }
  shouldShowWelcome() {
    return (this.treeView.dataProvider === void 0 || !!this.treeView.dataProvider.isTreeEmpty) && (this.treeView.message === void 0 || this.treeView.message === "");
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.layoutTreeView(height, width);
  }
  getOptimalWidth() {
    return this.treeView.getOptimalWidth();
  }
  renderTreeView(container) {
    this.treeView.show(container);
  }
  layoutTreeView(height, width) {
    this.treeView.layout(height, width);
  }
  updateTreeVisibility() {
    this.treeView.setVisibility(this.isBodyVisible());
  }
  getActionRunner() {
    return this._actionRunner;
  }
  getActionsContext() {
    return { $treeViewId: this.id, $focusedTreeItem: true, $selectedTreeItems: true };
  }
};
TreeViewPane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, INotificationService),
  __decorateParam(10, IHoverService),
  __decorateParam(11, IAccessibleViewInformationService)
], TreeViewPane);
class Root {
  constructor() {
    this.label = { label: "root" };
    this.handle = "0";
    this.parentHandle = void 0;
    this.collapsibleState = TreeItemCollapsibleState.Expanded;
    this.children = void 0;
  }
}
function commandPreconditions(commandId) {
  const command = CommandsRegistry.getCommand(commandId);
  if (command) {
    const commandAction = MenuRegistry.getCommand(command.id);
    return commandAction?.precondition;
  }
  return void 0;
}
function isTreeCommandEnabled(treeCommand, contextKeyService) {
  const commandId = treeCommand.originalId ? treeCommand.originalId : treeCommand.id;
  const precondition = commandPreconditions(commandId);
  if (precondition) {
    return contextKeyService.contextMatchesRules(precondition);
  }
  return true;
}
function isRenderedMessageValue(messageValue) {
  return !!messageValue && typeof messageValue !== "string" && !!messageValue.element && !!messageValue.disposables;
}
const noDataProviderMessage = localize("no-dataprovider", "There is no data provider registered that can provide view data.");
const RawCustomTreeViewContextKey = new RawContextKey("customTreeView", false);
class Tree extends WorkbenchAsyncDataTree {
}
let AbstractTreeView = class extends Disposable {
  constructor(id, _title, themeService, instantiationService, commandService, configurationService, progressService, contextMenuService, keybindingService, notificationService, viewDescriptorService, hoverService, contextKeyService, activityService, logService, openerService, markdownRendererService) {
    super();
    this.id = id;
    this._title = _title;
    this.themeService = themeService;
    this.instantiationService = instantiationService;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.progressService = progressService;
    this.contextMenuService = contextMenuService;
    this.keybindingService = keybindingService;
    this.notificationService = notificationService;
    this.viewDescriptorService = viewDescriptorService;
    this.hoverService = hoverService;
    this.contextKeyService = contextKeyService;
    this.activityService = activityService;
    this.logService = logService;
    this.openerService = openerService;
    this.markdownRendererService = markdownRendererService;
    this.isVisible = false;
    this._hasIconForParentNode = false;
    this._hasIconForLeafNode = false;
    this.focused = false;
    this._canSelectMany = false;
    this._manuallyManageCheckboxes = false;
    this.elementsToRefresh = [];
    this.lastSelection = [];
    this._onDidExpandItem = this._register(new Emitter());
    this._onDidCollapseItem = this._register(new Emitter());
    this._onDidChangeSelectionAndFocus = this._register(new Emitter());
    this._onDidChangeVisibility = this._register(new Emitter());
    this._onDidChangeActions = this._register(new Emitter());
    this._onDidChangeWelcomeState = this._register(new Emitter());
    this._onDidChangeTitle = this._register(new Emitter());
    this._onDidChangeDescription = this._register(new Emitter());
    this._onDidChangeCheckboxState = this._register(new Emitter());
    this._onDidCompleteRefresh = this._register(new Emitter());
    this._isInitialized = false;
    this._activity = this._register(new MutableDisposable());
    this.activated = false;
    this.treeDisposables = this._register(new DisposableStore());
    this._height = 0;
    this._width = 0;
    this.refreshing = false;
    this.root = new Root();
    this.lastActive = this.root;
  }
  get onDidExpandItem() {
    return this._onDidExpandItem.event;
  }
  get onDidCollapseItem() {
    return this._onDidCollapseItem.event;
  }
  get onDidChangeSelectionAndFocus() {
    return this._onDidChangeSelectionAndFocus.event;
  }
  get onDidChangeVisibility() {
    return this._onDidChangeVisibility.event;
  }
  get onDidChangeActions() {
    return this._onDidChangeActions.event;
  }
  get onDidChangeWelcomeState() {
    return this._onDidChangeWelcomeState.event;
  }
  get onDidChangeTitle() {
    return this._onDidChangeTitle.event;
  }
  get onDidChangeDescription() {
    return this._onDidChangeDescription.event;
  }
  get onDidChangeCheckboxState() {
    return this._onDidChangeCheckboxState.event;
  }
  initialize() {
    if (this._isInitialized) {
      return;
    }
    this._isInitialized = true;
    this.contextKeyService.bufferChangeEvents(() => {
      this.initializeShowCollapseAllAction();
      this.initializeCollapseAllToggle();
      this.initializeShowRefreshAction();
    });
    this.treeViewDnd = this.instantiationService.createInstance(CustomTreeViewDragAndDrop, this.id);
    if (this._dragAndDropController) {
      this.treeViewDnd.controller = this._dragAndDropController;
    }
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("explorer.decorations")) {
        this.doRefresh([this.root]);
      }
    }));
    this._register(this.viewDescriptorService.onDidChangeLocation(({ views, from, to }) => {
      if (views.some((v) => v.id === this.id)) {
        this.tree?.updateOptions({ overrideStyles: getLocationBasedViewColors(this.viewLocation).listOverrideStyles });
      }
    }));
    this.registerActions();
    this.create();
  }
  get viewContainer() {
    return this.viewDescriptorService.getViewContainerByViewId(this.id);
  }
  get viewLocation() {
    return this.viewDescriptorService.getViewLocationById(this.id);
  }
  get dragAndDropController() {
    return this._dragAndDropController;
  }
  set dragAndDropController(dnd) {
    this._dragAndDropController = dnd;
    if (this.treeViewDnd) {
      this.treeViewDnd.controller = dnd;
    }
  }
  get dataProvider() {
    return this._dataProvider;
  }
  set dataProvider(dataProvider) {
    if (dataProvider) {
      if (this.visible) {
        this.activate();
      }
      const self = this;
      this._dataProvider = new class {
        constructor() {
          this._isEmpty = true;
          this._onDidChangeEmpty = new Emitter();
          this.onDidChangeEmpty = this._onDidChangeEmpty.event;
        }
        get isTreeEmpty() {
          return this._isEmpty;
        }
        async getChildren(element) {
          const batches = await this.getChildrenBatch(element ? [element] : void 0);
          return batches?.[0];
        }
        updateEmptyState(nodes, childrenGroups) {
          if (nodes.length === 1 && nodes[0] instanceof Root) {
            const oldEmpty = this._isEmpty;
            this._isEmpty = childrenGroups.length === 0 || childrenGroups[0].length === 0;
            if (oldEmpty !== this._isEmpty) {
              this._onDidChangeEmpty.fire();
            }
          }
        }
        findCheckboxesUpdated(nodes, childrenGroups) {
          if (childrenGroups.length === 0) {
            return [];
          }
          const checkboxesUpdated = [];
          for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const children = childrenGroups[i];
            for (const child of children) {
              child.parent = node;
              if (!self.manuallyManageCheckboxes && node?.checkbox?.isChecked === true && child.checkbox?.isChecked === false) {
                child.checkbox.isChecked = true;
                checkboxesUpdated.push(child);
              }
            }
          }
          return checkboxesUpdated;
        }
        async getChildrenBatch(nodes) {
          let childrenGroups;
          let checkboxesUpdated = [];
          if (nodes?.every((node) => !!node.children)) {
            childrenGroups = nodes.map((node) => node.children);
          } else {
            nodes = nodes ?? [self.root];
            const batchedChildren = await (nodes.length === 1 && nodes[0] instanceof Root ? doGetChildrenOrBatch(dataProvider, void 0) : doGetChildrenOrBatch(dataProvider, nodes));
            for (let i = 0; i < nodes.length; i++) {
              const node = nodes[i];
              node.children = batchedChildren ? batchedChildren[i] : void 0;
            }
            childrenGroups = batchedChildren ?? [];
            checkboxesUpdated = this.findCheckboxesUpdated(nodes, childrenGroups);
          }
          this.updateEmptyState(nodes, childrenGroups);
          if (checkboxesUpdated.length > 0) {
            self._onDidChangeCheckboxState.fire(checkboxesUpdated);
          }
          return childrenGroups;
        }
      }();
      if (this._dataProvider.onDidChangeEmpty) {
        this._register(this._dataProvider.onDidChangeEmpty(() => {
          this.updateCollapseAllToggle();
          this._onDidChangeWelcomeState.fire();
        }));
      }
      this.updateMessage();
      this.refresh();
    } else {
      this._dataProvider = void 0;
      this.treeDisposables.clear();
      this.activated = false;
      this.updateMessage();
    }
    this._onDidChangeWelcomeState.fire();
  }
  get message() {
    return this._message;
  }
  set message(message) {
    this._message = message;
    this.updateMessage();
    this._onDidChangeWelcomeState.fire();
  }
  get title() {
    return this._title;
  }
  set title(name) {
    this._title = name;
    if (this.tree) {
      this.tree.ariaLabel = this._title;
    }
    this._onDidChangeTitle.fire(this._title);
  }
  get description() {
    return this._description;
  }
  set description(description) {
    this._description = description;
    this._onDidChangeDescription.fire(this._description);
  }
  get badge() {
    return this._badge;
  }
  set badge(badge) {
    if (this._badge?.value === badge?.value && this._badge?.tooltip === badge?.tooltip) {
      return;
    }
    this._badge = badge;
    if (badge) {
      const activity = {
        badge: new NumberBadge(badge.value, () => badge.tooltip),
        priority: 50
      };
      this._activity.value = this.activityService.showViewActivity(this.id, activity);
    } else {
      this._activity.clear();
    }
  }
  get canSelectMany() {
    return this._canSelectMany;
  }
  set canSelectMany(canSelectMany) {
    const oldCanSelectMany = this._canSelectMany;
    this._canSelectMany = canSelectMany;
    if (this._canSelectMany !== oldCanSelectMany) {
      this.tree?.updateOptions({ multipleSelectionSupport: this.canSelectMany });
    }
  }
  get manuallyManageCheckboxes() {
    return this._manuallyManageCheckboxes;
  }
  set manuallyManageCheckboxes(manuallyManageCheckboxes) {
    this._manuallyManageCheckboxes = manuallyManageCheckboxes;
  }
  get hasIconForParentNode() {
    return this._hasIconForParentNode;
  }
  get hasIconForLeafNode() {
    return this._hasIconForLeafNode;
  }
  get visible() {
    return this.isVisible;
  }
  initializeShowCollapseAllAction(startingValue = false) {
    if (!this.collapseAllContext) {
      this.collapseAllContextKey = new RawContextKey(`treeView.${this.id}.enableCollapseAll`, startingValue, localize("treeView.enableCollapseAll", "Whether the tree view with id {0} enables collapse all.", this.id));
      this.collapseAllContext = this.collapseAllContextKey.bindTo(this.contextKeyService);
    }
    return true;
  }
  get showCollapseAllAction() {
    this.initializeShowCollapseAllAction();
    return !!this.collapseAllContext?.get();
  }
  set showCollapseAllAction(showCollapseAllAction) {
    this.initializeShowCollapseAllAction(showCollapseAllAction);
    this.collapseAllContext?.set(showCollapseAllAction);
  }
  initializeShowRefreshAction(startingValue = false) {
    if (!this.refreshContext) {
      this.refreshContextKey = new RawContextKey(`treeView.${this.id}.enableRefresh`, startingValue, localize("treeView.enableRefresh", "Whether the tree view with id {0} enables refresh.", this.id));
      this.refreshContext = this.refreshContextKey.bindTo(this.contextKeyService);
    }
  }
  get showRefreshAction() {
    this.initializeShowRefreshAction();
    return !!this.refreshContext?.get();
  }
  set showRefreshAction(showRefreshAction) {
    this.initializeShowRefreshAction(showRefreshAction);
    this.refreshContext?.set(showRefreshAction);
  }
  registerActions() {
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.actions.treeView.${that.id}.refresh`,
          title: localize("refresh", "Refresh"),
          menu: {
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", that.id), that.refreshContextKey),
            group: "navigation",
            order: Number.MAX_SAFE_INTEGER - 1
          },
          icon: Codicon.refresh
        });
      }
      async run() {
        return that.refresh();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.actions.treeView.${that.id}.collapseAll`,
          title: localize("collapseAll", "Collapse All"),
          menu: {
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", that.id), that.collapseAllContextKey),
            group: "navigation",
            order: Number.MAX_SAFE_INTEGER
          },
          precondition: that.collapseAllToggleContextKey,
          icon: Codicon.collapseAll
        });
      }
      async run() {
        if (that.tree) {
          return new CollapseAllAction(that.tree, true).run();
        }
      }
    }));
  }
  setVisibility(isVisible) {
    this.initialize();
    isVisible = !!isVisible;
    if (this.isVisible === isVisible) {
      return;
    }
    this.isVisible = isVisible;
    if (this.tree) {
      if (this.isVisible) {
        DOM.show(this.tree.getHTMLElement());
      } else {
        DOM.hide(this.tree.getHTMLElement());
      }
      if (this.isVisible && this.elementsToRefresh.length && this.dataProvider) {
        this.doRefresh(this.elementsToRefresh);
        this.elementsToRefresh = [];
      }
    }
    setTimeout0(() => {
      if (this.dataProvider) {
        this._onDidChangeVisibility.fire(this.isVisible);
      }
    });
    if (this.visible) {
      this.activate();
    }
  }
  focus(reveal = true, revealItem) {
    if (this.tree && this.root.children && this.root.children.length > 0) {
      const element = revealItem ?? this.tree.getSelection()[0];
      if (element && reveal) {
        this.tree.reveal(element, 0.5);
      }
      this.tree.domFocus();
    } else if (this.tree && this.treeContainer && !this.treeContainer.classList.contains("hide")) {
      this.tree.domFocus();
    } else {
      this.domNode.focus();
    }
  }
  show(container) {
    this._container = container;
    DOM.append(container, this.domNode);
  }
  create() {
    this.domNode = DOM.$(".tree-explorer-viewlet-tree-view");
    this.messageElement = DOM.append(this.domNode, DOM.$(".message"));
    this.updateMessage();
    this.treeContainer = DOM.append(this.domNode, DOM.$(".customview-tree"));
    this.treeContainer.classList.add("file-icon-themable-tree", "show-file-icons");
    const focusTracker = this._register(DOM.trackFocus(this.domNode));
    this._register(focusTracker.onDidFocus(() => this.focused = true));
    this._register(focusTracker.onDidBlur(() => this.focused = false));
  }
  createTree() {
    this.treeDisposables.clear();
    const actionViewItemProvider = createActionViewItem.bind(void 0, this.instantiationService);
    const treeMenus = this.treeDisposables.add(this.instantiationService.createInstance(TreeMenus, this.id));
    this.treeLabels = this.treeDisposables.add(this.instantiationService.createInstance(ResourceLabels, this));
    const dataSource = this.instantiationService.createInstance(TreeDataSource, this, (task) => this.progressService.withProgress({ location: this.id }, () => task));
    const aligner = this.treeDisposables.add(new Aligner(this.themeService, this.logService));
    const checkboxStateHandler = this.treeDisposables.add(new CheckboxStateHandler());
    const renderer = this.treeDisposables.add(this.instantiationService.createInstance(TreeRenderer, this.id, treeMenus, this.treeLabels, actionViewItemProvider, aligner, checkboxStateHandler, () => this.manuallyManageCheckboxes));
    this.treeDisposables.add(renderer.onDidChangeCheckboxState((e) => this._onDidChangeCheckboxState.fire(e)));
    const widgetAriaLabel = this._title;
    this.tree = this.treeDisposables.add(this.instantiationService.createInstance(
      Tree,
      this.id,
      this.treeContainer,
      new TreeViewDelegate(),
      [renderer],
      dataSource,
      {
        identityProvider: new TreeViewIdentityProvider(),
        accessibilityProvider: {
          getAriaLabel(element) {
            if (element.accessibilityInformation) {
              return element.accessibilityInformation.label;
            }
            if (isString(element.tooltip)) {
              return treeMenus.getResourceActions([element]).length > 0 ? localize("treeAriaLabelHasActionsTooltip", "{0}, has actions", element.tooltip) : element.tooltip;
            } else {
              if (element.resourceUri && !element.label) {
                return null;
              }
              let buildAriaLabel = "";
              if (element.label) {
                const labelText = isMarkdownString(element.label.label) ? element.label.label.value : element.label.label;
                buildAriaLabel += labelText + " ";
              }
              if (element.description) {
                buildAriaLabel += element.description;
              }
              if (treeMenus.getResourceActions([element]).length > 0) {
                buildAriaLabel = buildAriaLabel ? localize("treeAriaLabelHasActionsSuffix", "{0}, has actions", buildAriaLabel.trim()) : localize("treeAriaLabelHasActions", "has actions");
              }
              return buildAriaLabel;
            }
          },
          getRole(element) {
            return element.accessibilityInformation?.role ?? "treeitem";
          },
          getWidgetAriaLabel() {
            return widgetAriaLabel;
          }
        },
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (item) => {
            if (item.label) {
              return isMarkdownString(item.label.label) ? item.label.label.value : item.label.label;
            }
            return item.resourceUri ? basename(URI.revive(item.resourceUri)) : void 0;
          }
        },
        expandOnlyOnTwistieClick: (e) => {
          return !!e.command || !!e.checkbox || this.configurationService.getValue("workbench.tree.expandMode") === "doubleClick";
        },
        collapseByDefault: (e) => {
          return e.collapsibleState !== TreeItemCollapsibleState.Expanded;
        },
        multipleSelectionSupport: this.canSelectMany,
        dnd: this.treeViewDnd,
        overrideStyles: getLocationBasedViewColors(this.viewLocation).listOverrideStyles
      }
    ));
    this.treeDisposables.add(renderer.onDidChangeMenuContext((e) => e.forEach((e2) => this.tree?.rerender(e2))));
    this.treeDisposables.add(this.tree);
    treeMenus.setContextKeyService(this.tree.contextKeyService);
    aligner.tree = this.tree;
    const actionRunner = this.treeDisposables.add(new MultipleSelectionActionRunner(this.notificationService, () => this.tree.getSelection()));
    renderer.actionRunner = actionRunner;
    this.tree.contextKeyService.createKey(this.id, true);
    const customTreeKey = RawCustomTreeViewContextKey.bindTo(this.tree.contextKeyService);
    customTreeKey.set(true);
    this.treeDisposables.add(this.tree.onContextMenu((e) => this.onContextMenu(treeMenus, e, actionRunner)));
    this.treeDisposables.add(this.tree.onDidChangeSelection((e) => {
      this.lastSelection = e.elements;
      this.lastActive = this.tree?.getFocus()[0] ?? this.lastActive;
      this._onDidChangeSelectionAndFocus.fire({ selection: this.lastSelection, focus: this.lastActive });
    }));
    this.treeDisposables.add(this.tree.onDidChangeFocus((e) => {
      if (e.elements.length && e.elements[0] !== this.lastActive) {
        this.lastActive = e.elements[0];
        this.lastSelection = this.tree?.getSelection() ?? this.lastSelection;
        this._onDidChangeSelectionAndFocus.fire({ selection: this.lastSelection, focus: this.lastActive });
      }
    }));
    this.treeDisposables.add(this.tree.onDidChangeCollapseState((e) => {
      if (!e.node.element) {
        return;
      }
      const element = Array.isArray(e.node.element.element) ? e.node.element.element[0] : e.node.element.element;
      if (e.node.collapsed) {
        this._onDidCollapseItem.fire(element);
      } else {
        this._onDidExpandItem.fire(element);
      }
    }));
    this.tree.setInput(this.root).then(() => this.updateContentAreas());
    this.treeDisposables.add(this.tree.onDidOpen(async (e) => {
      if (!e.browserEvent) {
        return;
      }
      if (e.browserEvent.target && e.browserEvent.target.classList.contains(TreeItemCheckbox.checkboxClass)) {
        return;
      }
      const selection = this.tree.getSelection();
      const command = await this.resolveCommand(selection.length === 1 ? selection[0] : void 0);
      if (command && isTreeCommandEnabled(command, this.contextKeyService)) {
        let args = command.arguments || [];
        if (command.id === API_OPEN_EDITOR_COMMAND_ID || command.id === API_OPEN_DIFF_EDITOR_COMMAND_ID) {
          args = [...args, e];
        }
        try {
          await this.commandService.executeCommand(command.id, ...args);
        } catch (err) {
          this.notificationService.error(err);
        }
      }
    }));
    this.treeDisposables.add(treeMenus.onDidChange((changed) => {
      if (this.tree?.hasNode(changed)) {
        this.tree?.rerender(changed);
      }
    }));
  }
  async resolveCommand(element) {
    let command = element?.command;
    if (element && !command) {
      if (element instanceof ResolvableTreeItem && element.hasResolve) {
        await element.resolve(CancellationToken.None);
        command = element.command;
      }
    }
    return command;
  }
  onContextMenu(treeMenus, treeEvent, actionRunner) {
    this.hoverService.hideHover();
    const node = treeEvent.element;
    if (node === null) {
      return;
    }
    const event = treeEvent.browserEvent;
    event.preventDefault();
    event.stopPropagation();
    this.tree.setFocus([node]);
    let selected = this.canSelectMany ? this.getSelection() : [];
    if (!selected.find((item) => item.handle === node.handle)) {
      selected = [node];
    }
    const actions = treeMenus.getResourceContextActions(selected);
    if (!actions.length) {
      return;
    }
    this.contextMenuService.showContextMenu({
      getAnchor: () => treeEvent.anchor,
      getActions: () => actions,
      getActionViewItem: (action) => {
        const keybinding = this.keybindingService.lookupKeybinding(action.id);
        if (keybinding) {
          return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
        }
        return void 0;
      },
      onHide: (wasCancelled) => {
        if (wasCancelled) {
          this.tree.domFocus();
        }
      },
      getActionsContext: () => ({ $treeViewId: this.id, $treeItemHandle: node.handle }),
      actionRunner
    });
  }
  updateMessage() {
    if (this._message) {
      this.showMessage(this._message);
    } else if (!this.dataProvider) {
      this.showMessage(noDataProviderMessage);
    } else {
      this.hideMessage();
    }
    this.updateContentAreas();
  }
  processMessage(message, disposables) {
    const lines = message.value.split("\n");
    const result = [];
    let hasFoundButton = false;
    for (const line of lines) {
      const linkedText = parseLinkedText(line);
      if (linkedText.nodes.length === 1 && typeof linkedText.nodes[0] !== "string") {
        const node = linkedText.nodes[0];
        const buttonContainer = document.createElement("div");
        buttonContainer.classList.add("button-container");
        const button = new Button(buttonContainer, { title: node.title, secondary: hasFoundButton, supportIcons: true, ...defaultButtonStyles });
        button.label = node.label;
        button.onDidClick((_) => {
          this.openerService.open(node.href, { allowCommands: true });
        }, null, disposables);
        const href = URI.parse(node.href);
        if (href.scheme === Schemas.command) {
          const preConditions = commandPreconditions(href.path);
          if (preConditions) {
            button.enabled = this.contextKeyService.contextMatchesRules(preConditions);
            disposables.add(this.contextKeyService.onDidChangeContext((e) => {
              if (e.affectsSome(new Set(preConditions.keys()))) {
                button.enabled = this.contextKeyService.contextMatchesRules(preConditions);
              }
            }));
          }
        }
        disposables.add(button);
        hasFoundButton = true;
        result.push(buttonContainer);
      } else {
        hasFoundButton = false;
        const rendered = this.markdownRendererService.render(new MarkdownString(line, { isTrusted: message.isTrusted, supportThemeIcons: message.supportThemeIcons, supportHtml: message.supportHtml }));
        result.push(rendered.element);
        disposables.add(rendered);
      }
    }
    const container = document.createElement("div");
    container.classList.add("rendered-message");
    for (const child of result) {
      if (DOM.isHTMLElement(child)) {
        container.appendChild(child);
      } else {
        container.appendChild(child.element);
      }
    }
    return container;
  }
  showMessage(message) {
    if (isRenderedMessageValue(this._messageValue)) {
      this._messageValue.disposables.dispose();
    }
    if (isMarkdownString(message)) {
      const disposables = new DisposableStore();
      const renderedMessage = this.processMessage(message, disposables);
      this._messageValue = { element: renderedMessage, disposables };
    } else {
      this._messageValue = message;
    }
    if (!this.messageElement) {
      return;
    }
    this.messageElement.classList.remove("hide");
    this.resetMessageElement();
    if (typeof this._messageValue === "string" && !isFalsyOrWhitespace(this._messageValue)) {
      this.messageElement.textContent = this._messageValue;
    } else if (isRenderedMessageValue(this._messageValue)) {
      this.messageElement.appendChild(this._messageValue.element);
    }
    this.layout(this._height, this._width);
  }
  hideMessage() {
    this.resetMessageElement();
    this.messageElement?.classList.add("hide");
    this.layout(this._height, this._width);
  }
  resetMessageElement() {
    if (this.messageElement) {
      DOM.clearNode(this.messageElement);
    }
  }
  layout(height, width) {
    if (height && width && this.messageElement && this.treeContainer) {
      this._height = height;
      this._width = width;
      const treeHeight = height - DOM.getTotalHeight(this.messageElement);
      this.treeContainer.style.height = treeHeight + "px";
      this.tree?.layout(treeHeight, width);
    }
  }
  getOptimalWidth() {
    if (this.tree) {
      const parentNode = this.tree.getHTMLElement();
      const childNodes = [].slice.call(parentNode.querySelectorAll(".outline-item-label > a"));
      return DOM.getLargestChildWidth(parentNode, childNodes);
    }
    return 0;
  }
  updateCheckboxes(elements) {
    return setCascadingCheckboxUpdates(elements);
  }
  async refresh(elements, checkboxes) {
    if (this.dataProvider && this.tree) {
      if (this.refreshing) {
        await Event.toPromise(this._onDidCompleteRefresh.event);
      }
      if (!elements) {
        elements = [this.root];
        this.elementsToRefresh = [];
      }
      for (const element of elements) {
        element.children = void 0;
      }
      if (this.isVisible) {
        const affectedElements = this.updateCheckboxes(checkboxes ?? []);
        return this.doRefresh(elements.concat(affectedElements));
      } else {
        if (this.elementsToRefresh.length) {
          const seen = /* @__PURE__ */ new Set();
          this.elementsToRefresh.forEach((element) => seen.add(element.handle));
          for (const element of elements) {
            if (!seen.has(element.handle)) {
              this.elementsToRefresh.push(element);
            }
          }
        } else {
          this.elementsToRefresh.push(...elements);
        }
      }
    }
    return void 0;
  }
  async expand(itemOrItems) {
    const tree = this.tree;
    if (!tree) {
      return;
    }
    try {
      itemOrItems = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
      for (const element of itemOrItems) {
        await tree.expand(element, false);
      }
    } catch (e) {
    }
  }
  isCollapsed(item) {
    return !!this.tree?.isCollapsed(item);
  }
  setSelection(items) {
    this.tree?.setSelection(items);
  }
  getSelection() {
    return this.tree?.getSelection() ?? [];
  }
  setFocus(item) {
    if (this.tree) {
      if (item) {
        this.focus(true, item);
        this.tree.setFocus([item]);
      } else if (this.tree.getFocus().length === 0) {
        this.tree.setFocus([]);
      }
    }
  }
  async reveal(item) {
    if (this.tree) {
      return this.tree.reveal(item);
    }
  }
  async doRefresh(elements) {
    const tree = this.tree;
    if (tree && this.visible) {
      this.refreshing = true;
      const oldSelection = tree.getSelection();
      try {
        await Promise.all(elements.map((element) => tree.updateChildren(element, true, true)));
      } catch (e) {
        this.logService.error(e);
      }
      const newSelection = tree.getSelection();
      if (oldSelection.length !== newSelection.length || oldSelection.some((value, index) => value.handle !== newSelection[index].handle)) {
        this.lastSelection = newSelection;
        this._onDidChangeSelectionAndFocus.fire({ selection: this.lastSelection, focus: this.lastActive });
      }
      this.refreshing = false;
      this._onDidCompleteRefresh.fire();
      this.updateContentAreas();
      if (this.focused) {
        this.focus(false);
      }
      this.updateCollapseAllToggle();
    }
  }
  initializeCollapseAllToggle() {
    if (!this.collapseAllToggleContext) {
      this.collapseAllToggleContextKey = new RawContextKey(`treeView.${this.id}.toggleCollapseAll`, false, localize("treeView.toggleCollapseAll", "Whether collapse all is toggled for the tree view with id {0}.", this.id));
      this.collapseAllToggleContext = this.collapseAllToggleContextKey.bindTo(this.contextKeyService);
    }
  }
  updateCollapseAllToggle() {
    if (this.showCollapseAllAction) {
      this.initializeCollapseAllToggle();
      this.collapseAllToggleContext?.set(!!this.root.children && this.root.children.length > 0 && this.root.children.some((value) => value.collapsibleState !== TreeItemCollapsibleState.None));
    }
  }
  updateContentAreas() {
    const isTreeEmpty = !this.root.children || this.root.children.length === 0;
    if (this._messageValue && isTreeEmpty && !this.refreshing && this.treeContainer) {
      if (!this.dragAndDropController) {
        this.treeContainer.classList.add("hide");
      }
      this.domNode.setAttribute("tabindex", "0");
    } else if (this.treeContainer) {
      this.treeContainer.classList.remove("hide");
      if (this.domNode === DOM.getActiveElement()) {
        this.focus();
      }
      this.domNode.removeAttribute("tabindex");
    }
  }
  get container() {
    return this._container;
  }
};
AbstractTreeView = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IProgressService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IKeybindingService),
  __decorateParam(9, INotificationService),
  __decorateParam(10, IViewDescriptorService),
  __decorateParam(11, IHoverService),
  __decorateParam(12, IContextKeyService),
  __decorateParam(13, IActivityService),
  __decorateParam(14, ILogService),
  __decorateParam(15, IOpenerService),
  __decorateParam(16, IMarkdownRendererService)
], AbstractTreeView);
class TreeViewIdentityProvider {
  getId(element) {
    return element.handle;
  }
}
class TreeViewDelegate {
  getHeight(element) {
    return TreeRenderer.ITEM_HEIGHT;
  }
  getTemplateId(element) {
    return TreeRenderer.TREE_TEMPLATE_ID;
  }
}
async function doGetChildrenOrBatch(dataProvider, nodes) {
  if (dataProvider.getChildrenBatch) {
    return dataProvider.getChildrenBatch(nodes);
  } else {
    if (nodes) {
      return Promise.all(nodes.map((node) => dataProvider.getChildren(node).then((children) => children ?? [])));
    } else {
      return [await dataProvider.getChildren()].filter((children) => children !== void 0);
    }
  }
}
class TreeDataSource {
  constructor(treeView, withProgress) {
    this.treeView = treeView;
    this.withProgress = withProgress;
  }
  hasChildren(element) {
    return !!this.treeView.dataProvider && element.collapsibleState !== TreeItemCollapsibleState.None;
  }
  async getChildren(element) {
    const dataProvider = this.treeView.dataProvider;
    if (!dataProvider) {
      return [];
    }
    if (this.batch === void 0) {
      this.batch = [element];
      this.batchPromise = void 0;
    } else {
      this.batch.push(element);
    }
    const indexInBatch = this.batch.length - 1;
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        const batch = this.batch;
        this.batch = void 0;
        if (!this.batchPromise) {
          this.batchPromise = this.withProgress(doGetChildrenOrBatch(dataProvider, batch));
        }
        try {
          const result = await this.batchPromise;
          resolve(result && indexInBatch < result.length ? result[indexInBatch] : []);
        } catch (e) {
          if (!e.message.startsWith("Bad progress location:")) {
            reject(e);
          }
        }
      }, 0);
    });
  }
}
let TreeRenderer = class extends Disposable {
  // tree item handle to template data
  constructor(treeViewId, menus, labels, actionViewItemProvider, aligner, checkboxStateHandler, manuallyManageCheckboxes, themeService, configurationService, labelService, contextKeyService, hoverService, instantiationService) {
    super();
    this.treeViewId = treeViewId;
    this.menus = menus;
    this.labels = labels;
    this.actionViewItemProvider = actionViewItemProvider;
    this.aligner = aligner;
    this.checkboxStateHandler = checkboxStateHandler;
    this.manuallyManageCheckboxes = manuallyManageCheckboxes;
    this.themeService = themeService;
    this.configurationService = configurationService;
    this.labelService = labelService;
    this.contextKeyService = contextKeyService;
    this.hoverService = hoverService;
    this._onDidChangeCheckboxState = this._register(new Emitter());
    this.onDidChangeCheckboxState = this._onDidChangeCheckboxState.event;
    this._onDidChangeMenuContext = this._register(new Emitter());
    this.onDidChangeMenuContext = this._onDidChangeMenuContext.event;
    this._hasCheckbox = false;
    this._renderedElements = /* @__PURE__ */ new Map();
    this._hoverDelegate = this._register(instantiationService.createInstance(WorkbenchHoverDelegate, "mouse", void 0, {}));
    this._register(this.themeService.onDidFileIconThemeChange(() => this.rerender()));
    this._register(this.themeService.onDidColorThemeChange(() => this.rerender()));
    this._register(checkboxStateHandler.onDidChangeCheckboxState((items) => {
      this.updateCheckboxes(items);
    }));
    this._register(this.contextKeyService.onDidChangeContext((e) => this.onDidChangeContext(e)));
  }
  get templateId() {
    return TreeRenderer.TREE_TEMPLATE_ID;
  }
  set actionRunner(actionRunner) {
    this._actionRunner = actionRunner;
  }
  renderTemplate(container) {
    container.classList.add("custom-view-tree-node-item");
    const checkboxContainer = DOM.append(container, DOM.$(""));
    const resourceLabel = this.labels.create(container, { supportHighlights: true, hoverDelegate: this._hoverDelegate });
    const icon = DOM.prepend(resourceLabel.element, DOM.$(".custom-view-tree-node-item-icon"));
    const actionsContainer = DOM.append(resourceLabel.element, DOM.$(".actions"));
    const actionBar = new ActionBar(actionsContainer, {
      actionViewItemProvider: this.actionViewItemProvider
    });
    return { resourceLabel, icon, checkboxContainer, actionBar, container };
  }
  getHover(label, resource, node) {
    if (!(node instanceof ResolvableTreeItem) || !node.hasResolve) {
      if (resource && !node.tooltip) {
        return void 0;
      } else if (node.tooltip === void 0) {
        if (isMarkdownString(label)) {
          return { markdown: label, markdownNotSupportedFallback: label.value };
        } else {
          return label;
        }
      } else if (!isString(node.tooltip)) {
        return { markdown: node.tooltip, markdownNotSupportedFallback: resource ? void 0 : renderAsPlaintext(node.tooltip) };
      } else if (node.tooltip !== "") {
        return node.tooltip;
      } else {
        return void 0;
      }
    }
    return {
      markdown: typeof node.tooltip === "string" ? node.tooltip : (token) => {
        return new Promise((resolve) => {
          node.resolve(token).then(() => resolve(node.tooltip));
        });
      },
      markdownNotSupportedFallback: resource ? void 0 : label ? isMarkdownString(label) ? label.value : label : ""
      // Passing undefined as the fallback for a resource falls back to the old native hover
    };
  }
  processLabel(label, matches) {
    if (!isMarkdownString(label)) {
      return { label };
    }
    let text = label.value.trim();
    let bold = false;
    let italic = false;
    let strikethrough = false;
    function moveMatches(offset) {
      if (matches) {
        for (const match of matches) {
          match.start -= offset;
          match.end -= offset;
        }
      }
    }
    const syntaxes = [
      { open: "~~", close: "~~", mark: () => {
        strikethrough = true;
      } },
      { open: "**", close: "**", mark: () => {
        bold = true;
      } },
      { open: "*", close: "*", mark: () => {
        italic = true;
      } },
      { open: "_", close: "_", mark: () => {
        italic = true;
      } }
    ];
    function checkSyntaxes() {
      let didChange = false;
      for (const syntax of syntaxes) {
        if (text.startsWith(syntax.open) && text.endsWith(syntax.close)) {
          if (matches?.some((match) => match.start < syntax.open.length || match.end > text.length - syntax.close.length)) {
            return false;
          }
          syntax.mark();
          text = text.substring(syntax.open.length, text.length - syntax.close.length);
          moveMatches(syntax.open.length);
          didChange = true;
        }
      }
      return didChange;
    }
    for (let i = 0; i < 10; i++) {
      if (!checkSyntaxes()) {
        break;
      }
    }
    return {
      label: text,
      bold,
      italic,
      strikethrough,
      supportIcons: label.supportThemeIcons
    };
  }
  renderElement(element, index, templateData) {
    const node = element.element;
    const resource = node.resourceUri ? URI.revive(node.resourceUri) : null;
    const treeItemLabel = node.label ? node.label : resource ? { label: basename(resource) } : void 0;
    const description = isString(node.description) ? node.description : resource && node.description === true ? this.labelService.getUriLabel(dirname(resource), { relative: true }) : void 0;
    const labelStr = treeItemLabel ? isMarkdownString(treeItemLabel.label) ? treeItemLabel.label.value : treeItemLabel.label : void 0;
    const matches = treeItemLabel?.highlights && labelStr ? treeItemLabel.highlights.map(([start, end]) => {
      if (start < 0) {
        start = labelStr.length + start;
      }
      if (end < 0) {
        end = labelStr.length + end;
      }
      if (start >= labelStr.length || end > labelStr.length) {
        return { start: 0, end: 0 };
      }
      if (start > end) {
        const swap = start;
        start = end;
        end = swap;
      }
      return { start, end };
    }) : void 0;
    const { label, bold, italic, strikethrough, supportIcons } = this.processLabel(treeItemLabel?.label, matches);
    const icon = !isDark(this.themeService.getColorTheme().type) ? node.icon : node.iconDark;
    const iconUrl = icon ? URI.revive(icon) : void 0;
    const title = this.getHover(treeItemLabel?.label, resource, node);
    templateData.actionBar.clear();
    templateData.icon.style.color = "";
    let commandEnabled = true;
    if (node.command) {
      commandEnabled = isTreeCommandEnabled(node.command, this.contextKeyService);
    }
    this.renderCheckbox(node, templateData);
    if (resource) {
      const fileDecorations = this.configurationService.getValue("explorer.decorations");
      const labelResource = resource ? resource : URI.parse("missing:_icon_resource");
      templateData.resourceLabel.setResource({ name: label, description, resource: labelResource }, {
        fileKind: this.getFileKind(node),
        title,
        hideIcon: this.shouldHideResourceLabelIcon(iconUrl, node.themeIcon),
        fileDecorations,
        extraClasses: ["custom-view-tree-node-item-resourceLabel"],
        matches: matches ? matches : createMatches(element.filterData),
        bold,
        italic,
        strikethrough,
        disabledCommand: !commandEnabled,
        labelEscapeNewLines: true,
        forceLabel: !!node.label,
        supportIcons
      });
    } else {
      templateData.resourceLabel.setResource({ name: label, description }, {
        title,
        hideIcon: true,
        extraClasses: ["custom-view-tree-node-item-resourceLabel"],
        matches: matches ? matches : createMatches(element.filterData),
        bold,
        italic,
        strikethrough,
        disabledCommand: !commandEnabled,
        labelEscapeNewLines: true,
        supportIcons
      });
    }
    if (iconUrl) {
      templateData.icon.className = "custom-view-tree-node-item-icon";
      templateData.icon.style.backgroundImage = cssJs.asCSSUrl(iconUrl);
    } else {
      let iconClass;
      if (this.shouldShowThemeIcon(!!resource, node.themeIcon)) {
        iconClass = ThemeIcon.asClassName(node.themeIcon);
        if (node.themeIcon.color) {
          templateData.icon.style.color = this.themeService.getColorTheme().getColor(node.themeIcon.color.id)?.toString() ?? "";
        } else {
          iconClass = iconClass + " codicon-colored";
        }
      }
      templateData.icon.className = iconClass ? `custom-view-tree-node-item-icon ${iconClass}` : "";
      templateData.icon.style.backgroundImage = "";
    }
    if (!commandEnabled) {
      templateData.icon.className = templateData.icon.className + " disabled";
      if (templateData.container.parentElement) {
        templateData.container.parentElement.className = templateData.container.parentElement.className + " disabled";
      }
    }
    templateData.actionBar.context = { $treeViewId: this.treeViewId, $treeItemHandle: node.handle };
    const menuActions = this.menus.getResourceActions([node]);
    templateData.actionBar.push(menuActions, { icon: true, label: false });
    if (menuActions.length > 0) {
      const itemName = [label, description].filter((part) => !!part).join(" ").trim();
      templateData.actionBar.setAriaLabel(itemName ? localize("treeActionBarAriaLabel", "Actions for {0}", itemName) : localize("treeActionBarAriaLabelNoName", "Actions"));
    } else {
      templateData.actionBar.setAriaLabel("");
    }
    if (this._actionRunner) {
      templateData.actionBar.actionRunner = this._actionRunner;
    }
    this.setAlignment(templateData.container, node);
    const renderedItems = this._renderedElements.get(element.element.handle) ?? [];
    this._renderedElements.set(element.element.handle, [...renderedItems, { original: element, rendered: templateData }]);
  }
  rerender() {
    const keys = new Set(this._renderedElements.keys());
    for (const key of keys) {
      const values = this._renderedElements.get(key) ?? [];
      for (const value of values) {
        this.disposeElement(value.original, 0, value.rendered);
        this.renderElement(value.original, 0, value.rendered);
      }
    }
  }
  renderCheckbox(node, templateData) {
    if (node.checkbox) {
      if (!this._hasCheckbox) {
        this._hasCheckbox = true;
        this.rerender();
      }
      if (!templateData.checkbox) {
        const checkbox = new TreeItemCheckbox(templateData.checkboxContainer, this.checkboxStateHandler, this._hoverDelegate, this.hoverService);
        templateData.checkbox = checkbox;
      }
      templateData.checkbox.render(node);
    } else if (templateData.checkbox) {
      templateData.checkbox.dispose();
      templateData.checkbox = void 0;
    }
  }
  setAlignment(container, treeItem) {
    container.parentElement.classList.toggle("align-icon-with-twisty", this.aligner.alignIconWithTwisty(treeItem));
  }
  shouldHideResourceLabelIcon(iconUrl, icon) {
    return !!iconUrl || !!icon && !this.isFileKindThemeIcon(icon);
  }
  shouldShowThemeIcon(hasResource, icon) {
    if (!icon) {
      return false;
    }
    return !(hasResource && this.isFileKindThemeIcon(icon));
  }
  isFileKindThemeIcon(icon) {
    return ThemeIcon.isFile(icon) || ThemeIcon.isFolder(icon);
  }
  getFileKind(node) {
    if (node.themeIcon) {
      switch (node.themeIcon.id) {
        case FileThemeIcon.id:
          return FileKind.FILE;
        case FolderThemeIcon.id:
          return FileKind.FOLDER;
      }
    }
    return node.collapsibleState === TreeItemCollapsibleState.Collapsed || node.collapsibleState === TreeItemCollapsibleState.Expanded ? FileKind.FOLDER : FileKind.FILE;
  }
  onDidChangeContext(e) {
    const affectsEntireMenuContexts = e.affectsSome(this.menus.getEntireMenuContexts());
    const items = [];
    for (const [_, elements] of this._renderedElements) {
      for (const element of elements) {
        if (affectsEntireMenuContexts || e.affectsSome(this.menus.getElementOverlayContexts(element.original.element))) {
          items.push(element.original.element);
        }
      }
    }
    if (items.length) {
      this._onDidChangeMenuContext.fire(items);
    }
  }
  updateCheckboxes(items) {
    let allItems = [];
    if (!this.manuallyManageCheckboxes()) {
      allItems = setCascadingCheckboxUpdates(items);
    } else {
      allItems = items;
    }
    allItems.forEach((item) => {
      const renderedItems = this._renderedElements.get(item.handle);
      if (renderedItems) {
        renderedItems.forEach((renderedItems2) => renderedItems2.rendered.checkbox?.render(item));
      }
    });
    this._onDidChangeCheckboxState.fire(allItems);
  }
  disposeElement(resource, index, templateData) {
    const itemRenders = this._renderedElements.get(resource.element.handle) ?? [];
    const renderedIndex = itemRenders.findIndex((renderedItem) => templateData === renderedItem.rendered);
    if (itemRenders.length === 1) {
      this._renderedElements.delete(resource.element.handle);
    } else if (itemRenders.length > 0) {
      itemRenders.splice(renderedIndex, 1);
    }
    templateData.checkbox?.dispose();
    templateData.checkbox = void 0;
  }
  disposeTemplate(templateData) {
    templateData.resourceLabel.dispose();
    templateData.actionBar.dispose();
  }
};
TreeRenderer.ITEM_HEIGHT = 22;
TreeRenderer.TREE_TEMPLATE_ID = "treeExplorer";
TreeRenderer = __decorateClass([
  __decorateParam(7, IThemeService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, ILabelService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IHoverService),
  __decorateParam(12, IInstantiationService)
], TreeRenderer);
class Aligner extends Disposable {
  constructor(themeService, logService) {
    super();
    this.themeService = themeService;
    this.logService = logService;
  }
  set tree(tree) {
    this._tree = tree;
  }
  alignIconWithTwisty(treeItem) {
    if (treeItem.collapsibleState !== TreeItemCollapsibleState.None) {
      return false;
    }
    if (!this.hasIconOrCheckbox(treeItem)) {
      return false;
    }
    if (this._tree) {
      const root = this._tree.getInput();
      let parent;
      try {
        parent = this._tree.getParentElement(treeItem) || root;
      } catch (error) {
        this.logService.error(`[TreeView] Failed to resolve parent for ${treeItem.handle}`, error);
        return false;
      }
      if (this.hasIconOrCheckbox(parent)) {
        return !!parent.children && parent.children.some((c) => c.collapsibleState !== TreeItemCollapsibleState.None && !this.hasIconOrCheckbox(c));
      }
      return !!parent.children && parent.children.every((c) => c.collapsibleState === TreeItemCollapsibleState.None || !this.hasIconOrCheckbox(c));
    } else {
      return false;
    }
  }
  hasIconOrCheckbox(node) {
    return this.hasIcon(node) || !!node.checkbox;
  }
  hasIcon(node) {
    const icon = !isDark(this.themeService.getColorTheme().type) ? node.icon : node.iconDark;
    if (icon) {
      return true;
    }
    if (node.themeIcon && (!node.resourceUri || node.themeIcon.id !== FileThemeIcon.id && node.themeIcon.id !== FolderThemeIcon.id)) {
      return true;
    }
    if (node.resourceUri || node.themeIcon) {
      const fileIconTheme = this.themeService.getFileIconTheme();
      const isFolder = node.themeIcon ? node.themeIcon.id === FolderThemeIcon.id : node.collapsibleState !== TreeItemCollapsibleState.None;
      if (isFolder) {
        return fileIconTheme.hasFileIcons && fileIconTheme.hasFolderIcons;
      }
      return fileIconTheme.hasFileIcons;
    }
    return false;
  }
}
class MultipleSelectionActionRunner extends ActionRunner {
  constructor(notificationService, getSelectedResources) {
    super();
    this.getSelectedResources = getSelectedResources;
    this._register(this.onDidRun((e) => {
      if (e.error && !isCancellationError(e.error)) {
        notificationService.error(localize("command-error", "Error running command {1}: {0}. This is likely caused by the extension that contributes {1}.", e.error.message, e.action.id));
      }
    }));
  }
  async runAction(action, context) {
    const selection = this.getSelectedResources();
    let selectionHandleArgs = void 0;
    let actionInSelected = false;
    if (selection.length > 1) {
      selectionHandleArgs = selection.map((selected) => {
        if (selected.handle === context.$treeItemHandle || context.$selectedTreeItems) {
          actionInSelected = true;
        }
        return { $treeViewId: context.$treeViewId, $treeItemHandle: selected.handle };
      });
    }
    if (!actionInSelected && selectionHandleArgs) {
      selectionHandleArgs = void 0;
    }
    await action.run(context, selectionHandleArgs);
  }
}
let TreeMenus = class {
  constructor(id, menuService) {
    this.id = id;
    this.menuService = menuService;
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
  }
  /**
   * Gets only the actions that apply to all of the given elements.
   */
  getResourceActions(elements) {
    const actions = this.getActions(this.getMenuId(), elements);
    return actions.primary;
  }
  /**
   * Gets only the actions that apply to all of the given elements.
   */
  getResourceContextActions(elements) {
    return this.getActions(this.getMenuId(), elements).secondary;
  }
  setContextKeyService(service) {
    this.contextKeyService = service;
  }
  filterNonUniversalActions(groups, newActions) {
    const newActionsSet = new Set(newActions.map((a) => a.id));
    for (const group of groups) {
      const actions = group.keys();
      for (const action of actions) {
        if (!newActionsSet.has(action)) {
          group.delete(action);
        }
      }
    }
  }
  buildMenu(groups) {
    const result = [];
    for (const group of groups) {
      if (group.size > 0) {
        if (result.length) {
          result.push(new Separator());
        }
        result.push(...group.values());
      }
    }
    return result;
  }
  createGroups(actions) {
    const groups = [];
    let group = /* @__PURE__ */ new Map();
    for (const action of actions) {
      if (action instanceof Separator) {
        groups.push(group);
        group = /* @__PURE__ */ new Map();
      } else {
        group.set(action.id, action);
      }
    }
    groups.push(group);
    return groups;
  }
  getElementOverlayContexts(element) {
    return /* @__PURE__ */ new Map([
      ["view", this.id],
      ["viewItem", element.contextValue]
    ]);
  }
  getEntireMenuContexts() {
    return this.menuService.getMenuContexts(this.getMenuId());
  }
  getMenuId() {
    return MenuId.ViewItemContext;
  }
  getActions(menuId, elements) {
    if (!this.contextKeyService) {
      return { primary: [], secondary: [] };
    }
    let primaryGroups = [];
    let secondaryGroups = [];
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const contextKeyService = this.contextKeyService.createOverlay(this.getElementOverlayContexts(element));
      const menuData = this.menuService.getMenuActions(menuId, contextKeyService, { shouldForwardArgs: true });
      const result = getContextMenuActions(menuData, "inline");
      if (i === 0) {
        primaryGroups = this.createGroups(result.primary);
        secondaryGroups = this.createGroups(result.secondary);
      } else {
        this.filterNonUniversalActions(primaryGroups, result.primary);
        this.filterNonUniversalActions(secondaryGroups, result.secondary);
      }
    }
    return { primary: this.buildMenu(primaryGroups), secondary: this.buildMenu(secondaryGroups) };
  }
  dispose() {
    this.contextKeyService = void 0;
    this._onDidChange.dispose();
  }
};
TreeMenus = __decorateClass([
  __decorateParam(1, IMenuService)
], TreeMenus);
let CustomTreeView = class extends AbstractTreeView {
  constructor(id, title, extensionId, themeService, instantiationService, commandService, configurationService, progressService, contextMenuService, keybindingService, notificationService, viewDescriptorService, contextKeyService, hoverService, extensionService, activityService, telemetryService, logService, openerService, markdownRendererService) {
    super(id, title, themeService, instantiationService, commandService, configurationService, progressService, contextMenuService, keybindingService, notificationService, viewDescriptorService, hoverService, contextKeyService, activityService, logService, openerService, markdownRendererService);
    this.extensionId = extensionId;
    this.extensionService = extensionService;
    this.telemetryService = telemetryService;
  }
  activate() {
    if (!this.activated) {
      this.telemetryService.publicLog2("Extension:ViewActivate", {
        extensionId: new TelemetryTrustedValue(this.extensionId),
        id: this.id
      });
      this.createTree();
      this.progressService.withProgress({ location: this.id }, () => this.extensionService.activateByEvent(`onView:${this.id}`)).then(() => timeout(2e3)).then(() => {
        this.updateMessage();
      });
      this.activated = true;
    }
  }
};
CustomTreeView = __decorateClass([
  __decorateParam(3, IThemeService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IProgressService),
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, INotificationService),
  __decorateParam(11, IViewDescriptorService),
  __decorateParam(12, IContextKeyService),
  __decorateParam(13, IHoverService),
  __decorateParam(14, IExtensionService),
  __decorateParam(15, IActivityService),
  __decorateParam(16, ITelemetryService),
  __decorateParam(17, ILogService),
  __decorateParam(18, IOpenerService),
  __decorateParam(19, IMarkdownRendererService)
], CustomTreeView);
class TreeView extends AbstractTreeView {
  activate() {
    if (!this.activated) {
      this.createTree();
      this.activated = true;
    }
  }
}
let CustomTreeViewDragAndDrop = class {
  constructor(treeId, labelService, instantiationService, treeViewsDragAndDropService, logService) {
    this.treeId = treeId;
    this.labelService = labelService;
    this.instantiationService = instantiationService;
    this.treeViewsDragAndDropService = treeViewsDragAndDropService;
    this.logService = logService;
    this.treeItemsTransfer = LocalSelectionTransfer.getInstance();
    this.treeMimeType = `application/vnd.code.tree.${treeId.toLowerCase()}`;
  }
  set controller(controller) {
    this.dndController = controller;
  }
  handleDragAndLog(dndController, itemHandles, uuid, dragCancellationToken) {
    return dndController.handleDrag(itemHandles, uuid, dragCancellationToken).then((additionalDataTransfer) => {
      if (additionalDataTransfer) {
        const unlistedTypes = [];
        for (const item of additionalDataTransfer) {
          if (item[0] !== this.treeMimeType && dndController.dragMimeTypes.findIndex((value) => value === item[0]) < 0) {
            unlistedTypes.push(item[0]);
          }
        }
        if (unlistedTypes.length) {
          this.logService.warn(`Drag and drop controller for tree ${this.treeId} adds the following data transfer types but does not declare them in dragMimeTypes: ${unlistedTypes.join(", ")}`);
        }
      }
      return additionalDataTransfer;
    });
  }
  addExtensionProvidedTransferTypes(originalEvent, itemHandles) {
    if (!originalEvent.dataTransfer || !this.dndController) {
      return;
    }
    const uuid = generateUuid();
    this.dragCancellationToken = new CancellationTokenSource();
    this.treeViewsDragAndDropService.addDragOperationTransfer(uuid, this.handleDragAndLog(this.dndController, itemHandles, uuid, this.dragCancellationToken.token));
    this.treeItemsTransfer.setData([new DraggedTreeItemsIdentifier(uuid)], DraggedTreeItemsIdentifier.prototype);
    originalEvent.dataTransfer.clearData(Mimes.text);
    if (this.dndController.dragMimeTypes.find((element) => element === Mimes.uriList)) {
      originalEvent.dataTransfer?.setData(DataTransfers.RESOURCES, "");
    }
    this.dndController.dragMimeTypes.forEach((supportedType) => {
      originalEvent.dataTransfer?.setData(supportedType, "");
    });
  }
  addResourceInfoToTransfer(originalEvent, resources) {
    if (resources.length && originalEvent.dataTransfer) {
      this.instantiationService.invokeFunction((accessor) => fillEditorsDragData(accessor, resources, originalEvent));
      const fileResources = resources.filter((s) => s.scheme === Schemas.file).map((r) => r.fsPath);
      if (fileResources.length) {
        originalEvent.dataTransfer.setData(CodeDataTransfers.FILES, JSON.stringify(fileResources));
      }
    }
  }
  onDragStart(data, originalEvent) {
    if (originalEvent.dataTransfer) {
      const treeItemsData = data.getData();
      const resources = [];
      const sourceInfo = {
        id: this.treeId,
        itemHandles: []
      };
      treeItemsData.forEach((item) => {
        sourceInfo.itemHandles.push(item.handle);
        if (item.resourceUri) {
          resources.push(URI.revive(item.resourceUri));
        }
      });
      this.addResourceInfoToTransfer(originalEvent, resources);
      this.addExtensionProvidedTransferTypes(originalEvent, sourceInfo.itemHandles);
      originalEvent.dataTransfer.setData(
        this.treeMimeType,
        JSON.stringify(sourceInfo)
      );
    }
  }
  debugLog(types) {
    if (types.size) {
      this.logService.debug(`TreeView dragged mime types: ${Array.from(types).join(", ")}`);
    } else {
      this.logService.debug(`TreeView dragged with no supported mime types.`);
    }
  }
  onDragOver(data, targetElement, targetIndex, targetSector, originalEvent) {
    const dataTransfer = toExternalVSDataTransfer(originalEvent.dataTransfer);
    const types = new Set(Array.from(dataTransfer, (x) => x[0]));
    if (originalEvent.dataTransfer) {
      for (const item of originalEvent.dataTransfer.items) {
        if (item.kind === "file" || item.type === DataTransfers.RESOURCES.toLowerCase()) {
          types.add(Mimes.uriList);
          break;
        }
      }
    }
    this.debugLog(types);
    const dndController = this.dndController;
    if (!dndController || !originalEvent.dataTransfer || dndController.dropMimeTypes.length === 0) {
      return false;
    }
    const dragContainersSupportedType = Array.from(types).some((value, index) => {
      if (value === this.treeMimeType) {
        return true;
      } else {
        return dndController.dropMimeTypes.indexOf(value) >= 0;
      }
    });
    if (dragContainersSupportedType) {
      return { accept: true, bubble: TreeDragOverBubble.Down, autoExpand: true };
    }
    return false;
  }
  getDragURI(element) {
    if (!this.dndController) {
      return null;
    }
    return element.resourceUri ? URI.revive(element.resourceUri).toString() : element.handle;
  }
  getDragLabel(elements) {
    if (!this.dndController) {
      return void 0;
    }
    if (elements.length > 1) {
      return String(elements.length);
    }
    const element = elements[0];
    if (element.label) {
      return isMarkdownString(element.label.label) ? element.label.label.value : element.label.label;
    }
    return element.resourceUri ? this.labelService.getUriLabel(URI.revive(element.resourceUri)) : void 0;
  }
  async drop(data, targetNode, targetIndex, targetSector, originalEvent) {
    const dndController = this.dndController;
    if (!originalEvent.dataTransfer || !dndController) {
      return;
    }
    let treeSourceInfo;
    let willDropUuid;
    if (this.treeItemsTransfer.hasData(DraggedTreeItemsIdentifier.prototype)) {
      willDropUuid = this.treeItemsTransfer.getData(DraggedTreeItemsIdentifier.prototype)[0].identifier;
    }
    const originalDataTransfer = toExternalVSDataTransfer(originalEvent.dataTransfer, true);
    const outDataTransfer = new VSDataTransfer();
    for (const [type, item] of originalDataTransfer) {
      if (type === this.treeMimeType || dndController.dropMimeTypes.includes(type) || item.asFile() && dndController.dropMimeTypes.includes(DataTransfers.FILES.toLowerCase())) {
        outDataTransfer.append(type, item);
        if (type === this.treeMimeType) {
          try {
            treeSourceInfo = JSON.parse(await item.asString());
          } catch {
          }
        }
      }
    }
    const additionalDataTransfer = await this.treeViewsDragAndDropService.removeDragOperationTransfer(willDropUuid);
    if (additionalDataTransfer) {
      for (const [type, item] of additionalDataTransfer) {
        outDataTransfer.append(type, item);
      }
    }
    return dndController.handleDrop(outDataTransfer, targetNode, CancellationToken.None, willDropUuid, treeSourceInfo?.id, treeSourceInfo?.itemHandles);
  }
  onDragEnd(originalEvent) {
    if (originalEvent.dataTransfer?.dropEffect === "none") {
      this.dragCancellationToken?.cancel();
    }
  }
  dispose() {
  }
};
CustomTreeViewDragAndDrop = __decorateClass([
  __decorateParam(1, ILabelService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ITreeViewsDnDService),
  __decorateParam(4, ILogService)
], CustomTreeViewDragAndDrop);
function setCascadingCheckboxUpdates(items) {
  const additionalItems = [];
  for (const item of items) {
    if (item.checkbox !== void 0) {
      const checkChildren = (currentItem) => {
        for (const child of currentItem.children ?? []) {
          if (child.checkbox !== void 0 && currentItem.checkbox !== void 0 && child.checkbox.isChecked !== currentItem.checkbox.isChecked) {
            child.checkbox.isChecked = currentItem.checkbox.isChecked;
            additionalItems.push(child);
            checkChildren(child);
          }
        }
      };
      checkChildren(item);
      const visitedParents = /* @__PURE__ */ new Set();
      const checkParents = (currentItem) => {
        if (currentItem.parent?.checkbox !== void 0 && currentItem.parent.children) {
          if (visitedParents.has(currentItem.parent)) {
            return;
          } else {
            visitedParents.add(currentItem.parent);
          }
          let someUnchecked = false;
          let someChecked = false;
          for (const child of currentItem.parent.children) {
            if (someUnchecked && someChecked) {
              break;
            }
            if (child.checkbox !== void 0) {
              if (child.checkbox.isChecked) {
                someChecked = true;
              } else {
                someUnchecked = true;
              }
            }
          }
          if (someChecked && !someUnchecked && currentItem.parent.checkbox.isChecked !== true) {
            currentItem.parent.checkbox.isChecked = true;
            additionalItems.push(currentItem.parent);
            checkParents(currentItem.parent);
          } else if (someUnchecked && currentItem.parent.checkbox.isChecked !== false) {
            currentItem.parent.checkbox.isChecked = false;
            additionalItems.push(currentItem.parent);
            checkParents(currentItem.parent);
          }
        }
      };
      checkParents(item);
    }
  }
  return items.concat(additionalItems);
}
export {
  CustomTreeView,
  CustomTreeViewDragAndDrop,
  RawCustomTreeViewContextKey,
  TreeView,
  TreeViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFx2aWV3c1xcdHJlZVZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEYXRhVHJhbnNmZXJzLCBJRHJhZ0FuZERyb3BEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBjc3NKcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvY3NzVmFsdWUuanMnO1xuaW1wb3J0IHsgSVJlbmRlcmVkTWFya2Rvd24sIHJlbmRlckFzUGxhaW50ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyLCBJQWN0aW9uVmlld0l0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgSUhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZS5qcyc7XG5pbXBvcnQgeyBJSWRlbnRpdHlQcm92aWRlciwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhLCBMaXN0Vmlld1RhcmdldFNlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RWaWV3LmpzJztcbmltcG9ydCB7IElBc3luY0RhdGFTb3VyY2UsIElUcmVlQ29udGV4dE1lbnVFdmVudCwgSVRyZWVEcmFnQW5kRHJvcCwgSVRyZWVEcmFnT3ZlclJlYWN0aW9uLCBJVHJlZU5vZGUsIElUcmVlUmVuZGVyZXIsIFRyZWVEcmFnT3ZlckJ1YmJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgQ29sbGFwc2VBbGxBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlRGVmYXVsdHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uUnVubmVyLCBJQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVNYXRjaGVzLCBGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIGlzTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNaW1lcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgaXNGYWxzeU9yV2hpdGVzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvdmlld3MuY3NzJztcbmltcG9ydCB7IFZTRGF0YVRyYW5zZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0YVRyYW5zZmVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvblZpZXdJdGVtLCBnZXRDb250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleUV4cHJlc3Npb24sIElDb250ZXh0S2V5LCBJQ29udGV4dEtleUNoYW5nZUV2ZW50LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IEZpbGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaEFzeW5jRGF0YVRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGlzRGFyayB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBGaWxlVGhlbWVJY29uLCBGb2xkZXJUaGVtZUljb24sIElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBmaWxsRWRpdG9yc0RyYWdEYXRhIH0gZnJvbSAnLi4vLi4vZG5kLmpzJztcbmltcG9ydCB7IElSZXNvdXJjZUxhYmVsLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBBUElfT1BFTl9ESUZGX0VESVRPUl9DT01NQU5EX0lELCBBUElfT1BFTl9FRElUT1JfQ09NTUFORF9JRCB9IGZyb20gJy4uL2VkaXRvci9lZGl0b3JDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBnZXRMb2NhdGlvbkJhc2VkVmlld0NvbG9ycywgSVZpZXdQYW5lT3B0aW9ucywgVmlld1BhbmUgfSBmcm9tICcuL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3bGV0Vmlld09wdGlvbnMgfSBmcm9tICcuL3ZpZXdzVmlld2xldC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJVHJlZUl0ZW0sIElUcmVlSXRlbUxhYmVsLCBJVHJlZVZpZXcsIElUcmVlVmlld0RhdGFQcm92aWRlciwgSVRyZWVWaWV3RGVzY3JpcHRvciwgSVRyZWVWaWV3RHJhZ0FuZERyb3BDb250cm9sbGVyLCBJVmlld0JhZGdlLCBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBJVmlld3NSZWdpc3RyeSwgUmVzb2x2YWJsZVRyZWVJdGVtLCBUcmVlQ29tbWFuZCwgVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLCBUcmVlVmlld0l0ZW1IYW5kbGVBcmcsIFRyZWVWaWV3UGFuZUhhbmRsZUFyZywgVmlld0NvbnRhaW5lciwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElBY3Rpdml0eVNlcnZpY2UsIE51bWJlckJhZGdlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYWN0aXZpdHkvY29tbW9uL2FjdGl2aXR5LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlLCBXb3JrYmVuY2hIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBDb2RlRGF0YVRyYW5zZmVycywgTG9jYWxTZWxlY3Rpb25UcmFuc2ZlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RuZC9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyB0b0V4dGVybmFsVlNEYXRhVHJhbnNmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9kYXRhVHJhbnNmZXIuanMnO1xuaW1wb3J0IHsgQ2hlY2tib3hTdGF0ZUhhbmRsZXIsIFRyZWVJdGVtQ2hlY2tib3ggfSBmcm9tICcuL2NoZWNrYm94LmpzJztcbmltcG9ydCB7IHNldFRpbWVvdXQwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgQXJpYVJvbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSVRyZWVWaWV3c0RuRFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RyZWVWaWV3c0RuZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRHJhZ2dlZFRyZWVJdGVtc0lkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RyZWVWaWV3c0RuZC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHR5cGUgeyBJTWFuYWdlZEhvdmVyVG9vbHRpcE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IHBhcnNlTGlua2VkVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpbmtlZFRleHQuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJsZVZpZXdJbmZvcm1hdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmxlVmlld0luZm9ybWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuXG5leHBvcnQgY2xhc3MgVHJlZVZpZXdQYW5lIGV4dGVuZHMgVmlld1BhbmUge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSB0cmVlVmlldzogSVRyZWVWaWV3O1xuXHRwcml2YXRlIF9jb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hY3Rpb25SdW5uZXI6IE11bHRpcGxlU2VsZWN0aW9uQWN0aW9uUnVubmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElWaWV3bGV0Vmlld09wdGlvbnMsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJsZVZpZXdJbmZvcm1hdGlvblNlcnZpY2UgYWNjZXNzaWJsZVZpZXdTZXJ2aWNlOiBJQWNjZXNzaWJsZVZpZXdJbmZvcm1hdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHsgLi4uKG9wdGlvbnMgYXMgSVZpZXdQYW5lT3B0aW9ucyksIHRpdGxlTWVudUlkOiBNZW51SWQuVmlld1RpdGxlLCBkb25vdEZvcndhcmRBcmdzOiBmYWxzZSB9LCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlLCBhY2Nlc3NpYmxlVmlld1NlcnZpY2UpO1xuXHRcdGNvbnN0IHsgdHJlZVZpZXcgfSA9ICg8SVRyZWVWaWV3RGVzY3JpcHRvcj5SZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oRXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KS5nZXRWaWV3KG9wdGlvbnMuaWQpKTtcblx0XHR0aGlzLnRyZWVWaWV3ID0gdHJlZVZpZXc7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlVmlldy5vbkRpZENoYW5nZUFjdGlvbnMoKCkgPT4gdGhpcy51cGRhdGVBY3Rpb25zKCksIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWVWaWV3Lm9uRGlkQ2hhbmdlVGl0bGUoKG5ld1RpdGxlKSA9PiB0aGlzLnVwZGF0ZVRpdGxlKG5ld1RpdGxlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZVZpZXcub25EaWRDaGFuZ2VEZXNjcmlwdGlvbigobmV3RGVzY3JpcHRpb24pID0+IHRoaXMudXBkYXRlVGl0bGVEZXNjcmlwdGlvbihuZXdEZXNjcmlwdGlvbikpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2NvbnRhaW5lciAmJiB0aGlzLnRyZWVWaWV3LmNvbnRhaW5lciAmJiAodGhpcy5fY29udGFpbmVyID09PSB0aGlzLnRyZWVWaWV3LmNvbnRhaW5lcikpIHtcblx0XHRcdFx0dGhpcy50cmVlVmlldy5zZXRWaXNpYmlsaXR5KGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5KCgpID0+IHRoaXMudXBkYXRlVHJlZVZpc2liaWxpdHkoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZVZpZXcub25EaWRDaGFuZ2VXZWxjb21lU3RhdGUoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VWaWV3V2VsY29tZVN0YXRlLmZpcmUoKSkpO1xuXHRcdGlmIChvcHRpb25zLnRpdGxlICE9PSB0aGlzLnRyZWVWaWV3LnRpdGxlKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVRpdGxlKHRoaXMudHJlZVZpZXcudGl0bGUpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy50aXRsZURlc2NyaXB0aW9uICE9PSB0aGlzLnRyZWVWaWV3LmRlc2NyaXB0aW9uKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVRpdGxlRGVzY3JpcHRpb24odGhpcy50cmVlVmlldy5kZXNjcmlwdGlvbik7XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGlvblJ1bm5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdWx0aXBsZVNlbGVjdGlvbkFjdGlvblJ1bm5lcihub3RpZmljYXRpb25TZXJ2aWNlLCAoKSA9PiB0aGlzLnRyZWVWaWV3LmdldFNlbGVjdGlvbigpKSk7XG5cblx0XHR0aGlzLnVwZGF0ZVRyZWVWaXNpYmlsaXR5KCk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXHRcdHRoaXMudHJlZVZpZXcuZm9jdXMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXHRcdHRoaXMucmVuZGVyVHJlZVZpZXcoY29udGFpbmVyKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNob3VsZFNob3dXZWxjb21lKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoKHRoaXMudHJlZVZpZXcuZGF0YVByb3ZpZGVyID09PSB1bmRlZmluZWQpIHx8ICEhdGhpcy50cmVlVmlldy5kYXRhUHJvdmlkZXIuaXNUcmVlRW1wdHkpICYmICgodGhpcy50cmVlVmlldy5tZXNzYWdlID09PSB1bmRlZmluZWQpIHx8ICh0aGlzLnRyZWVWaWV3Lm1lc3NhZ2UgPT09ICcnKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy5sYXlvdXRUcmVlVmlldyhoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldE9wdGltYWxXaWR0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnRyZWVWaWV3LmdldE9wdGltYWxXaWR0aCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlclRyZWVWaWV3KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWVWaWV3LnNob3coY29udGFpbmVyKTtcblx0fVxuXG5cdHByb3RlY3RlZCBsYXlvdXRUcmVlVmlldyhoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMudHJlZVZpZXcubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUcmVlVmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWVWaWV3LnNldFZpc2liaWxpdHkodGhpcy5pc0JvZHlWaXNpYmxlKCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0QWN0aW9uUnVubmVyKCkge1xuXHRcdHJldHVybiB0aGlzLl9hY3Rpb25SdW5uZXI7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRBY3Rpb25zQ29udGV4dCgpOiBUcmVlVmlld1BhbmVIYW5kbGVBcmcge1xuXHRcdHJldHVybiB7ICR0cmVlVmlld0lkOiB0aGlzLmlkLCAkZm9jdXNlZFRyZWVJdGVtOiB0cnVlLCAkc2VsZWN0ZWRUcmVlSXRlbXM6IHRydWUgfTtcblx0fVxuXG59XG5cbmNsYXNzIFJvb3QgaW1wbGVtZW50cyBJVHJlZUl0ZW0ge1xuXHRsYWJlbCA9IHsgbGFiZWw6ICdyb290JyB9O1xuXHRoYW5kbGUgPSAnMCc7XG5cdHBhcmVudEhhbmRsZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRjb2xsYXBzaWJsZVN0YXRlID0gVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkV4cGFuZGVkO1xuXHRjaGlsZHJlbjogSVRyZWVJdGVtW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGNvbW1hbmRQcmVjb25kaXRpb25zKGNvbW1hbmRJZDogc3RyaW5nKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRjb25zdCBjb21tYW5kID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKGNvbW1hbmRJZCk7XG5cdGlmIChjb21tYW5kKSB7XG5cdFx0Y29uc3QgY29tbWFuZEFjdGlvbiA9IE1lbnVSZWdpc3RyeS5nZXRDb21tYW5kKGNvbW1hbmQuaWQpO1xuXHRcdHJldHVybiBjb21tYW5kQWN0aW9uPy5wcmVjb25kaXRpb247XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gaXNUcmVlQ29tbWFuZEVuYWJsZWQodHJlZUNvbW1hbmQ6IFRyZWVDb21tYW5kIHwgQ29tbWFuZCwgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSk6IGJvb2xlYW4ge1xuXHRjb25zdCBjb21tYW5kSWQ6IHN0cmluZyA9ICh0cmVlQ29tbWFuZCBhcyBUcmVlQ29tbWFuZCkub3JpZ2luYWxJZCA/ICh0cmVlQ29tbWFuZCBhcyBUcmVlQ29tbWFuZCkub3JpZ2luYWxJZCEgOiB0cmVlQ29tbWFuZC5pZDtcblx0Y29uc3QgcHJlY29uZGl0aW9uID0gY29tbWFuZFByZWNvbmRpdGlvbnMoY29tbWFuZElkKTtcblx0aWYgKHByZWNvbmRpdGlvbikge1xuXHRcdHJldHVybiBjb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHByZWNvbmRpdGlvbik7XG5cdH1cblxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuaW50ZXJmYWNlIFJlbmRlcmVkTWVzc2FnZSB7IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlIH1cblxuZnVuY3Rpb24gaXNSZW5kZXJlZE1lc3NhZ2VWYWx1ZShtZXNzYWdlVmFsdWU6IHN0cmluZyB8IFJlbmRlcmVkTWVzc2FnZSB8IHVuZGVmaW5lZCk6IG1lc3NhZ2VWYWx1ZSBpcyBSZW5kZXJlZE1lc3NhZ2Uge1xuXHRyZXR1cm4gISFtZXNzYWdlVmFsdWUgJiYgdHlwZW9mIG1lc3NhZ2VWYWx1ZSAhPT0gJ3N0cmluZycgJiYgISFtZXNzYWdlVmFsdWUuZWxlbWVudCAmJiAhIW1lc3NhZ2VWYWx1ZS5kaXNwb3NhYmxlcztcbn1cblxuY29uc3Qgbm9EYXRhUHJvdmlkZXJNZXNzYWdlID0gbG9jYWxpemUoJ25vLWRhdGFwcm92aWRlcicsIFwiVGhlcmUgaXMgbm8gZGF0YSBwcm92aWRlciByZWdpc3RlcmVkIHRoYXQgY2FuIHByb3ZpZGUgdmlldyBkYXRhLlwiKTtcblxuZXhwb3J0IGNvbnN0IFJhd0N1c3RvbVRyZWVWaWV3Q29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjdXN0b21UcmVlVmlldycsIGZhbHNlKTtcblxuY2xhc3MgVHJlZSBleHRlbmRzIFdvcmtiZW5jaEFzeW5jRGF0YVRyZWU8SVRyZWVJdGVtLCBJVHJlZUl0ZW0sIEZ1enp5U2NvcmU+IHsgfVxuXG5hYnN0cmFjdCBjbGFzcyBBYnN0cmFjdFRyZWVWaWV3IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUcmVlVmlldyB7XG5cblx0cHJpdmF0ZSBpc1Zpc2libGU6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfaGFzSWNvbkZvclBhcmVudE5vZGUgPSBmYWxzZTtcblx0cHJpdmF0ZSBfaGFzSWNvbkZvckxlYWZOb2RlID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBjb2xsYXBzZUFsbENvbnRleHRLZXk6IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29sbGFwc2VBbGxDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjb2xsYXBzZUFsbFRvZ2dsZUNvbnRleHRLZXk6IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29sbGFwc2VBbGxUb2dnbGVDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWZyZXNoQ29udGV4dEtleTogUmF3Q29udGV4dEtleTxib29sZWFuPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWZyZXNoQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBmb2N1c2VkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgZG9tTm9kZSE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRyZWVDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tZXNzYWdlVmFsdWU6IHN0cmluZyB8IHsgZWxlbWVudDogSFRNTEVsZW1lbnQ7IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgfSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY2FuU2VsZWN0TWFueTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9tYW51YWxseU1hbmFnZUNoZWNrYm94ZXM6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBtZXNzYWdlRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdHJlZTogVHJlZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0cmVlTGFiZWxzOiBSZXNvdXJjZUxhYmVscyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0cmVlVmlld0RuZDogQ3VzdG9tVHJlZVZpZXdEcmFnQW5kRHJvcCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJvb3Q6IElUcmVlSXRlbTtcblx0cHJpdmF0ZSBlbGVtZW50c1RvUmVmcmVzaDogSVRyZWVJdGVtW10gPSBbXTtcblx0cHJpdmF0ZSBsYXN0U2VsZWN0aW9uOiByZWFkb25seSBJVHJlZUl0ZW1bXSA9IFtdO1xuXHRwcml2YXRlIGxhc3RBY3RpdmU6IElUcmVlSXRlbTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEV4cGFuZEl0ZW06IEVtaXR0ZXI8SVRyZWVJdGVtPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUcmVlSXRlbT4oKSk7XG5cdGdldCBvbkRpZEV4cGFuZEl0ZW0oKTogRXZlbnQ8SVRyZWVJdGVtPiB7IHJldHVybiB0aGlzLl9vbkRpZEV4cGFuZEl0ZW0uZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENvbGxhcHNlSXRlbTogRW1pdHRlcjxJVHJlZUl0ZW0+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRyZWVJdGVtPigpKTtcblx0Z2V0IG9uRGlkQ29sbGFwc2VJdGVtKCk6IEV2ZW50PElUcmVlSXRlbT4geyByZXR1cm4gdGhpcy5fb25EaWRDb2xsYXBzZUl0ZW0uZXZlbnQ7IH1cblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZVNlbGVjdGlvbkFuZEZvY3VzOiBFbWl0dGVyPHsgc2VsZWN0aW9uOiByZWFkb25seSBJVHJlZUl0ZW1bXTsgZm9jdXM6IElUcmVlSXRlbSB9PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgc2VsZWN0aW9uOiByZWFkb25seSBJVHJlZUl0ZW1bXTsgZm9jdXM6IElUcmVlSXRlbSB9PigpKTtcblx0Z2V0IG9uRGlkQ2hhbmdlU2VsZWN0aW9uQW5kRm9jdXMoKTogRXZlbnQ8eyBzZWxlY3Rpb246IHJlYWRvbmx5IElUcmVlSXRlbVtdOyBmb2N1czogSVRyZWVJdGVtIH0+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uQW5kRm9jdXMuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpc2liaWxpdHk6IEVtaXR0ZXI8Ym9vbGVhbj4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0Z2V0IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eSgpOiBFdmVudDxib29sZWFuPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGlvbnM6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlkQ2hhbmdlQWN0aW9ucygpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUFjdGlvbnMuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVdlbGNvbWVTdGF0ZTogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRnZXQgb25EaWRDaGFuZ2VXZWxjb21lU3RhdGUoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VXZWxjb21lU3RhdGUuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVRpdGxlOiBFbWl0dGVyPHN0cmluZz4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRnZXQgb25EaWRDaGFuZ2VUaXRsZSgpOiBFdmVudDxzdHJpbmc+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlVGl0bGUuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZURlc2NyaXB0aW9uOiBFbWl0dGVyPHN0cmluZyB8IHVuZGVmaW5lZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmcgfCB1bmRlZmluZWQ+KCkpO1xuXHRnZXQgb25EaWRDaGFuZ2VEZXNjcmlwdGlvbigpOiBFdmVudDxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlRGVzY3JpcHRpb24uZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNoZWNrYm94U3RhdGU6IEVtaXR0ZXI8cmVhZG9ubHkgSVRyZWVJdGVtW10+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8cmVhZG9ubHkgSVRyZWVJdGVtW10+KCkpO1xuXHRnZXQgb25EaWRDaGFuZ2VDaGVja2JveFN0YXRlKCk6IEV2ZW50PHJlYWRvbmx5IElUcmVlSXRlbVtdPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUNoZWNrYm94U3RhdGUuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENvbXBsZXRlUmVmcmVzaDogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGlkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBfdGl0bGU6IHN0cmluZyxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQWN0aXZpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWN0aXZpdHlTZXJ2aWNlOiBJQWN0aXZpdHlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucm9vdCA9IG5ldyBSb290KCk7XG5cdFx0dGhpcy5sYXN0QWN0aXZlID0gdGhpcy5yb290O1xuXHRcdC8vIFRyeSBub3QgdG8gYWRkIGFueXRoaW5nIHRoYXQgY291bGQgYmUgY29zdGx5IHRvIHRoaXMgY29uc3RydWN0b3IuIEl0IGdldHMgY2FsbGVkIG9uY2UgcGVyIHRyZWUgdmlld1xuXHRcdC8vIGR1cmluZyBzdGFydHVwLCBhbmQgYW55dGhpbmcgYWRkZWQgaGVyZSBjYW4gYWZmZWN0IHBlcmZvcm1hbmNlLlxuXHR9XG5cblx0cHJpdmF0ZSBfaXNJbml0aWFsaXplZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIGluaXRpYWxpemUoKSB7XG5cdFx0aWYgKHRoaXMuX2lzSW5pdGlhbGl6ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faXNJbml0aWFsaXplZCA9IHRydWU7XG5cblx0XHQvLyBSZW1lbWJlciB3aGVuIGFkZGluZyB0byB0aGlzIG1ldGhvZCB0aGF0IGl0IGlzbid0IGNhbGxlZCB1bnRpbCB0aGUgdmlldyBpcyB2aXNpYmxlLCBtZWFuaW5nIHRoYXRcblx0XHQvLyBwcm9wZXJ0aWVzIGNvdWxkIGJlIHNldCBhbmQgZXZlbnRzIGNvdWxkIGJlIGZpcmVkIGJlZm9yZSB3ZSdyZSBpbml0aWFsaXplZCBhbmQgdGhhdCB0aGlzIG5lZWRzIHRvIGJlIGhhbmRsZWQuXG5cblx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmJ1ZmZlckNoYW5nZUV2ZW50cygoKSA9PiB7XG5cdFx0XHR0aGlzLmluaXRpYWxpemVTaG93Q29sbGFwc2VBbGxBY3Rpb24oKTtcblx0XHRcdHRoaXMuaW5pdGlhbGl6ZUNvbGxhcHNlQWxsVG9nZ2xlKCk7XG5cdFx0XHR0aGlzLmluaXRpYWxpemVTaG93UmVmcmVzaEFjdGlvbigpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy50cmVlVmlld0RuZCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ3VzdG9tVHJlZVZpZXdEcmFnQW5kRHJvcCwgdGhpcy5pZCk7XG5cdFx0aWYgKHRoaXMuX2RyYWdBbmREcm9wQ29udHJvbGxlcikge1xuXHRcdFx0dGhpcy50cmVlVmlld0RuZC5jb250cm9sbGVyID0gdGhpcy5fZHJhZ0FuZERyb3BDb250cm9sbGVyO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2V4cGxvcmVyLmRlY29yYXRpb25zJykpIHtcblx0XHRcdFx0dGhpcy5kb1JlZnJlc2goW3RoaXMucm9vdF0pOyAvKiogc29mdCByZWZyZXNoICoqL1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5vbkRpZENoYW5nZUxvY2F0aW9uKCh7IHZpZXdzLCBmcm9tLCB0byB9KSA9PiB7XG5cdFx0XHRpZiAodmlld3Muc29tZSh2ID0+IHYuaWQgPT09IHRoaXMuaWQpKSB7XG5cdFx0XHRcdHRoaXMudHJlZT8udXBkYXRlT3B0aW9ucyh7IG92ZXJyaWRlU3R5bGVzOiBnZXRMb2NhdGlvbkJhc2VkVmlld0NvbG9ycyh0aGlzLnZpZXdMb2NhdGlvbikubGlzdE92ZXJyaWRlU3R5bGVzIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnJlZ2lzdGVyQWN0aW9ucygpO1xuXG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0fVxuXG5cdGdldCB2aWV3Q29udGFpbmVyKCk6IFZpZXdDb250YWluZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQodGhpcy5pZCkhO1xuXHR9XG5cblx0Z2V0IHZpZXdMb2NhdGlvbigpOiBWaWV3Q29udGFpbmVyTG9jYXRpb24ge1xuXHRcdHJldHVybiB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKHRoaXMuaWQpITtcblx0fVxuXHRwcml2YXRlIF9kcmFnQW5kRHJvcENvbnRyb2xsZXI6IElUcmVlVmlld0RyYWdBbmREcm9wQ29udHJvbGxlciB8IHVuZGVmaW5lZDtcblx0Z2V0IGRyYWdBbmREcm9wQ29udHJvbGxlcigpOiBJVHJlZVZpZXdEcmFnQW5kRHJvcENvbnRyb2xsZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9kcmFnQW5kRHJvcENvbnRyb2xsZXI7XG5cdH1cblx0c2V0IGRyYWdBbmREcm9wQ29udHJvbGxlcihkbmQ6IElUcmVlVmlld0RyYWdBbmREcm9wQ29udHJvbGxlciB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2RyYWdBbmREcm9wQ29udHJvbGxlciA9IGRuZDtcblx0XHRpZiAodGhpcy50cmVlVmlld0RuZCkge1xuXHRcdFx0dGhpcy50cmVlVmlld0RuZC5jb250cm9sbGVyID0gZG5kO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2RhdGFQcm92aWRlcjogSVRyZWVWaWV3RGF0YVByb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHRnZXQgZGF0YVByb3ZpZGVyKCk6IElUcmVlVmlld0RhdGFQcm92aWRlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RhdGFQcm92aWRlcjtcblx0fVxuXG5cdHNldCBkYXRhUHJvdmlkZXIoZGF0YVByb3ZpZGVyOiBJVHJlZVZpZXdEYXRhUHJvdmlkZXIgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoZGF0YVByb3ZpZGVyKSB7XG5cdFx0XHRpZiAodGhpcy52aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMuYWN0aXZhdGUoKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlbGYgPSB0aGlzO1xuXHRcdFx0dGhpcy5fZGF0YVByb3ZpZGVyID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSVRyZWVWaWV3RGF0YVByb3ZpZGVyIHtcblx0XHRcdFx0cHJpdmF0ZSBfaXNFbXB0eTogYm9vbGVhbiA9IHRydWU7XG5cdFx0XHRcdHByaXZhdGUgX29uRGlkQ2hhbmdlRW1wdHk6IEVtaXR0ZXI8dm9pZD4gPSBuZXcgRW1pdHRlcigpO1xuXHRcdFx0XHRwdWJsaWMgb25EaWRDaGFuZ2VFbXB0eTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUVtcHR5LmV2ZW50O1xuXG5cdFx0XHRcdGdldCBpc1RyZWVFbXB0eSgpOiBib29sZWFuIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5faXNFbXB0eTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGFzeW5jIGdldENoaWxkcmVuKGVsZW1lbnQ/OiBJVHJlZUl0ZW0pOiBQcm9taXNlPHJlYWRvbmx5IElUcmVlSXRlbVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0XHRcdFx0Y29uc3QgYmF0Y2hlcyA9IGF3YWl0IHRoaXMuZ2V0Q2hpbGRyZW5CYXRjaChlbGVtZW50ID8gW2VsZW1lbnRdIDogdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRyZXR1cm4gYmF0Y2hlcz8uWzBdO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cHJpdmF0ZSB1cGRhdGVFbXB0eVN0YXRlKG5vZGVzOiBJVHJlZUl0ZW1bXSwgY2hpbGRyZW5Hcm91cHM6IChyZWFkb25seSBJVHJlZUl0ZW1bXSlbXSk6IHZvaWQge1xuXHRcdFx0XHRcdGlmICgobm9kZXMubGVuZ3RoID09PSAxKSAmJiAobm9kZXNbMF0gaW5zdGFuY2VvZiBSb290KSkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgb2xkRW1wdHkgPSB0aGlzLl9pc0VtcHR5O1xuXHRcdFx0XHRcdFx0dGhpcy5faXNFbXB0eSA9IChjaGlsZHJlbkdyb3Vwcy5sZW5ndGggPT09IDApIHx8IChjaGlsZHJlbkdyb3Vwc1swXS5sZW5ndGggPT09IDApO1xuXHRcdFx0XHRcdFx0aWYgKG9sZEVtcHR5ICE9PSB0aGlzLl9pc0VtcHR5KSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRW1wdHkuZmlyZSgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByaXZhdGUgZmluZENoZWNrYm94ZXNVcGRhdGVkKG5vZGVzOiBJVHJlZUl0ZW1bXSwgY2hpbGRyZW5Hcm91cHM6IChyZWFkb25seSBJVHJlZUl0ZW1bXSlbXSk6IElUcmVlSXRlbVtdIHtcblx0XHRcdFx0XHRpZiAoY2hpbGRyZW5Hcm91cHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGNoZWNrYm94ZXNVcGRhdGVkOiBJVHJlZUl0ZW1bXSA9IFtdO1xuXG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBub2Rlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0Y29uc3Qgbm9kZSA9IG5vZGVzW2ldO1xuXHRcdFx0XHRcdFx0Y29uc3QgY2hpbGRyZW4gPSBjaGlsZHJlbkdyb3Vwc1tpXTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRcdFx0Y2hpbGQucGFyZW50ID0gbm9kZTtcblx0XHRcdFx0XHRcdFx0aWYgKCFzZWxmLm1hbnVhbGx5TWFuYWdlQ2hlY2tib3hlcyAmJiAobm9kZT8uY2hlY2tib3g/LmlzQ2hlY2tlZCA9PT0gdHJ1ZSkgJiYgKGNoaWxkLmNoZWNrYm94Py5pc0NoZWNrZWQgPT09IGZhbHNlKSkge1xuXHRcdFx0XHRcdFx0XHRcdGNoaWxkLmNoZWNrYm94LmlzQ2hlY2tlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdFx0Y2hlY2tib3hlc1VwZGF0ZWQucHVzaChjaGlsZCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGNoZWNrYm94ZXNVcGRhdGVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXN5bmMgZ2V0Q2hpbGRyZW5CYXRjaChub2Rlcz86IElUcmVlSXRlbVtdKTogUHJvbWlzZTwocmVhZG9ubHkgSVRyZWVJdGVtW10pW10+IHtcblx0XHRcdFx0XHRsZXQgY2hpbGRyZW5Hcm91cHM6IChyZWFkb25seSBJVHJlZUl0ZW1bXSlbXTtcblx0XHRcdFx0XHRsZXQgY2hlY2tib3hlc1VwZGF0ZWQ6IElUcmVlSXRlbVtdID0gW107XG5cdFx0XHRcdFx0aWYgKG5vZGVzPy5ldmVyeSgobm9kZSk6IG5vZGUgaXMgUmVxdWlyZWQ8SVRyZWVJdGVtICYgeyBjaGlsZHJlbjogSVRyZWVJdGVtW10gfT4gPT4gISFub2RlLmNoaWxkcmVuKSkge1xuXHRcdFx0XHRcdFx0Y2hpbGRyZW5Hcm91cHMgPSBub2Rlcy5tYXAobm9kZSA9PiBub2RlLmNoaWxkcmVuKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bm9kZXMgPSBub2RlcyA/PyBbc2VsZi5yb290XTtcblx0XHRcdFx0XHRcdGNvbnN0IGJhdGNoZWRDaGlsZHJlbiA9IGF3YWl0IChub2Rlcy5sZW5ndGggPT09IDEgJiYgbm9kZXNbMF0gaW5zdGFuY2VvZiBSb290ID8gZG9HZXRDaGlsZHJlbk9yQmF0Y2goZGF0YVByb3ZpZGVyLCB1bmRlZmluZWQpIDogZG9HZXRDaGlsZHJlbk9yQmF0Y2goZGF0YVByb3ZpZGVyLCBub2RlcykpO1xuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBub2Rlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBub2RlID0gbm9kZXNbaV07XG5cdFx0XHRcdFx0XHRcdG5vZGUuY2hpbGRyZW4gPSBiYXRjaGVkQ2hpbGRyZW4gPyBiYXRjaGVkQ2hpbGRyZW5baV0gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjaGlsZHJlbkdyb3VwcyA9IGJhdGNoZWRDaGlsZHJlbiA/PyBbXTtcblx0XHRcdFx0XHRcdGNoZWNrYm94ZXNVcGRhdGVkID0gdGhpcy5maW5kQ2hlY2tib3hlc1VwZGF0ZWQobm9kZXMsIGNoaWxkcmVuR3JvdXBzKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUVtcHR5U3RhdGUobm9kZXMsIGNoaWxkcmVuR3JvdXBzKTtcblxuXHRcdFx0XHRcdGlmIChjaGVja2JveGVzVXBkYXRlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRzZWxmLl9vbkRpZENoYW5nZUNoZWNrYm94U3RhdGUuZmlyZShjaGVja2JveGVzVXBkYXRlZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBjaGlsZHJlbkdyb3Vwcztcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGlmICh0aGlzLl9kYXRhUHJvdmlkZXIub25EaWRDaGFuZ2VFbXB0eSkge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9kYXRhUHJvdmlkZXIub25EaWRDaGFuZ2VFbXB0eSgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVDb2xsYXBzZUFsbFRvZ2dsZSgpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlV2VsY29tZVN0YXRlLmZpcmUoKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy51cGRhdGVNZXNzYWdlKCk7XG5cdFx0XHR0aGlzLnJlZnJlc2goKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZGF0YVByb3ZpZGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy50cmVlRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHRoaXMuYWN0aXZhdGVkID0gZmFsc2U7XG5cdFx0XHR0aGlzLnVwZGF0ZU1lc3NhZ2UoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZVdlbGNvbWVTdGF0ZS5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9tZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldCBtZXNzYWdlKCk6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX21lc3NhZ2U7XG5cdH1cblxuXHRzZXQgbWVzc2FnZShtZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9tZXNzYWdlID0gbWVzc2FnZTtcblx0XHR0aGlzLnVwZGF0ZU1lc3NhZ2UoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVdlbGNvbWVTdGF0ZS5maXJlKCk7XG5cdH1cblxuXHRnZXQgdGl0bGUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fdGl0bGU7XG5cdH1cblxuXHRzZXQgdGl0bGUobmFtZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5fdGl0bGUgPSBuYW1lO1xuXHRcdGlmICh0aGlzLnRyZWUpIHtcblx0XHRcdHRoaXMudHJlZS5hcmlhTGFiZWwgPSB0aGlzLl90aXRsZTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VUaXRsZS5maXJlKHRoaXMuX3RpdGxlKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldCBkZXNjcmlwdGlvbigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9kZXNjcmlwdGlvbjtcblx0fVxuXG5cdHNldCBkZXNjcmlwdGlvbihkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fZGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbjtcblx0XHR0aGlzLl9vbkRpZENoYW5nZURlc2NyaXB0aW9uLmZpcmUodGhpcy5fZGVzY3JpcHRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfYmFkZ2U6IElWaWV3QmFkZ2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2aXR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblxuXHRnZXQgYmFkZ2UoKTogSVZpZXdCYWRnZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2JhZGdlO1xuXHR9XG5cblx0c2V0IGJhZGdlKGJhZGdlOiBJVmlld0JhZGdlIHwgdW5kZWZpbmVkKSB7XG5cblx0XHRpZiAodGhpcy5fYmFkZ2U/LnZhbHVlID09PSBiYWRnZT8udmFsdWUgJiZcblx0XHRcdHRoaXMuX2JhZGdlPy50b29sdGlwID09PSBiYWRnZT8udG9vbHRpcCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2JhZGdlID0gYmFkZ2U7XG5cdFx0aWYgKGJhZGdlKSB7XG5cdFx0XHRjb25zdCBhY3Rpdml0eSA9IHtcblx0XHRcdFx0YmFkZ2U6IG5ldyBOdW1iZXJCYWRnZShiYWRnZS52YWx1ZSwgKCkgPT4gYmFkZ2UudG9vbHRpcCksXG5cdFx0XHRcdHByaW9yaXR5OiA1MFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX2FjdGl2aXR5LnZhbHVlID0gdGhpcy5hY3Rpdml0eVNlcnZpY2Uuc2hvd1ZpZXdBY3Rpdml0eSh0aGlzLmlkLCBhY3Rpdml0eSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2FjdGl2aXR5LmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGNhblNlbGVjdE1hbnkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NhblNlbGVjdE1hbnk7XG5cdH1cblxuXHRzZXQgY2FuU2VsZWN0TWFueShjYW5TZWxlY3RNYW55OiBib29sZWFuKSB7XG5cdFx0Y29uc3Qgb2xkQ2FuU2VsZWN0TWFueSA9IHRoaXMuX2NhblNlbGVjdE1hbnk7XG5cdFx0dGhpcy5fY2FuU2VsZWN0TWFueSA9IGNhblNlbGVjdE1hbnk7XG5cdFx0aWYgKHRoaXMuX2NhblNlbGVjdE1hbnkgIT09IG9sZENhblNlbGVjdE1hbnkpIHtcblx0XHRcdHRoaXMudHJlZT8udXBkYXRlT3B0aW9ucyh7IG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogdGhpcy5jYW5TZWxlY3RNYW55IH0pO1xuXHRcdH1cblx0fVxuXG5cdGdldCBtYW51YWxseU1hbmFnZUNoZWNrYm94ZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX21hbnVhbGx5TWFuYWdlQ2hlY2tib3hlcztcblx0fVxuXG5cdHNldCBtYW51YWxseU1hbmFnZUNoZWNrYm94ZXMobWFudWFsbHlNYW5hZ2VDaGVja2JveGVzOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fbWFudWFsbHlNYW5hZ2VDaGVja2JveGVzID0gbWFudWFsbHlNYW5hZ2VDaGVja2JveGVzO1xuXHR9XG5cblx0Z2V0IGhhc0ljb25Gb3JQYXJlbnROb2RlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9oYXNJY29uRm9yUGFyZW50Tm9kZTtcblx0fVxuXG5cdGdldCBoYXNJY29uRm9yTGVhZk5vZGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2hhc0ljb25Gb3JMZWFmTm9kZTtcblx0fVxuXG5cdGdldCB2aXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlzVmlzaWJsZTtcblx0fVxuXG5cdHByaXZhdGUgaW5pdGlhbGl6ZVNob3dDb2xsYXBzZUFsbEFjdGlvbihzdGFydGluZ1ZhbHVlOiBib29sZWFuID0gZmFsc2UpIHtcblx0XHRpZiAoIXRoaXMuY29sbGFwc2VBbGxDb250ZXh0KSB7XG5cdFx0XHR0aGlzLmNvbGxhcHNlQWxsQ29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KGB0cmVlVmlldy4ke3RoaXMuaWR9LmVuYWJsZUNvbGxhcHNlQWxsYCwgc3RhcnRpbmdWYWx1ZSwgbG9jYWxpemUoJ3RyZWVWaWV3LmVuYWJsZUNvbGxhcHNlQWxsJywgXCJXaGV0aGVyIHRoZSB0cmVlIHZpZXcgd2l0aCBpZCB7MH0gZW5hYmxlcyBjb2xsYXBzZSBhbGwuXCIsIHRoaXMuaWQpKTtcblx0XHRcdHRoaXMuY29sbGFwc2VBbGxDb250ZXh0ID0gdGhpcy5jb2xsYXBzZUFsbENvbnRleHRLZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGdldCBzaG93Q29sbGFwc2VBbGxBY3Rpb24oKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5pbml0aWFsaXplU2hvd0NvbGxhcHNlQWxsQWN0aW9uKCk7XG5cdFx0cmV0dXJuICEhdGhpcy5jb2xsYXBzZUFsbENvbnRleHQ/LmdldCgpO1xuXHR9XG5cblx0c2V0IHNob3dDb2xsYXBzZUFsbEFjdGlvbihzaG93Q29sbGFwc2VBbGxBY3Rpb246IGJvb2xlYW4pIHtcblx0XHR0aGlzLmluaXRpYWxpemVTaG93Q29sbGFwc2VBbGxBY3Rpb24oc2hvd0NvbGxhcHNlQWxsQWN0aW9uKTtcblx0XHR0aGlzLmNvbGxhcHNlQWxsQ29udGV4dD8uc2V0KHNob3dDb2xsYXBzZUFsbEFjdGlvbik7XG5cdH1cblxuXG5cdHByaXZhdGUgaW5pdGlhbGl6ZVNob3dSZWZyZXNoQWN0aW9uKHN0YXJ0aW5nVmFsdWU6IGJvb2xlYW4gPSBmYWxzZSkge1xuXHRcdGlmICghdGhpcy5yZWZyZXNoQ29udGV4dCkge1xuXHRcdFx0dGhpcy5yZWZyZXNoQ29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KGB0cmVlVmlldy4ke3RoaXMuaWR9LmVuYWJsZVJlZnJlc2hgLCBzdGFydGluZ1ZhbHVlLCBsb2NhbGl6ZSgndHJlZVZpZXcuZW5hYmxlUmVmcmVzaCcsIFwiV2hldGhlciB0aGUgdHJlZSB2aWV3IHdpdGggaWQgezB9IGVuYWJsZXMgcmVmcmVzaC5cIiwgdGhpcy5pZCkpO1xuXHRcdFx0dGhpcy5yZWZyZXNoQ29udGV4dCA9IHRoaXMucmVmcmVzaENvbnRleHRLZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBzaG93UmVmcmVzaEFjdGlvbigpOiBib29sZWFuIHtcblx0XHR0aGlzLmluaXRpYWxpemVTaG93UmVmcmVzaEFjdGlvbigpO1xuXHRcdHJldHVybiAhIXRoaXMucmVmcmVzaENvbnRleHQ/LmdldCgpO1xuXHR9XG5cblx0c2V0IHNob3dSZWZyZXNoQWN0aW9uKHNob3dSZWZyZXNoQWN0aW9uOiBib29sZWFuKSB7XG5cdFx0dGhpcy5pbml0aWFsaXplU2hvd1JlZnJlc2hBY3Rpb24oc2hvd1JlZnJlc2hBY3Rpb24pO1xuXHRcdHRoaXMucmVmcmVzaENvbnRleHQ/LnNldChzaG93UmVmcmVzaEFjdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQWN0aW9ucygpIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9ucy50cmVlVmlldy4ke3RoYXQuaWR9LnJlZnJlc2hgLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncmVmcmVzaCcsIFwiUmVmcmVzaFwiKSxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCB0aGF0LmlkKSwgdGhhdC5yZWZyZXNoQ29udGV4dEtleSksXG5cdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdFx0b3JkZXI6IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSIC0gMSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGljb246IENvZGljb24ucmVmcmVzaFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0cmV0dXJuIHRoYXQucmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9ucy50cmVlVmlldy4ke3RoYXQuaWR9LmNvbGxhcHNlQWxsYCxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NvbGxhcHNlQWxsJywgXCJDb2xsYXBzZSBBbGxcIiksXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgdGhhdC5pZCksIHRoYXQuY29sbGFwc2VBbGxDb250ZXh0S2V5KSxcblx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHRvcmRlcjogTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IHRoYXQuY29sbGFwc2VBbGxUb2dnbGVDb250ZXh0S2V5LFxuXHRcdFx0XHRcdGljb246IENvZGljb24uY29sbGFwc2VBbGxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGlmICh0aGF0LnRyZWUpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IENvbGxhcHNlQWxsQWN0aW9uPElUcmVlSXRlbSwgSVRyZWVJdGVtLCBGdXp6eVNjb3JlPih0aGF0LnRyZWUsIHRydWUpLnJ1bigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0c2V0VmlzaWJpbGl0eShpc1Zpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHQvLyBUaHJvdWdob3V0IHNldFZpc2liaWxpdHkgd2UgbmVlZCB0byBjaGVjayBpZiB0aGUgdHJlZSB2aWV3J3MgZGF0YSBwcm92aWRlciBzdGlsbCBleGlzdHMuXG5cdFx0Ly8gVGhpcyBjYW4gaGFwcGVuIGJlY2F1c2UgdGhlIGBnZXRDaGlsZHJlbmAgY2FsbCB0byB0aGUgZXh0ZW5zaW9uIGNhbiByZXR1cm5cblx0XHQvLyBhZnRlciB0aGUgdHJlZSBoYXMgYmVlbiBkaXNwb3NlZC5cblxuXHRcdHRoaXMuaW5pdGlhbGl6ZSgpO1xuXHRcdGlzVmlzaWJsZSA9ICEhaXNWaXNpYmxlO1xuXHRcdGlmICh0aGlzLmlzVmlzaWJsZSA9PT0gaXNWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5pc1Zpc2libGUgPSBpc1Zpc2libGU7XG5cblx0XHRpZiAodGhpcy50cmVlKSB7XG5cdFx0XHRpZiAodGhpcy5pc1Zpc2libGUpIHtcblx0XHRcdFx0RE9NLnNob3codGhpcy50cmVlLmdldEhUTUxFbGVtZW50KCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0RE9NLmhpZGUodGhpcy50cmVlLmdldEhUTUxFbGVtZW50KCkpOyAvLyBtYWtlIHN1cmUgdGhlIHRyZWUgZ29lcyBvdXQgb2YgdGhlIHRhYmluZGV4IHdvcmxkIGJ5IGhpZGluZyBpdFxuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5pc1Zpc2libGUgJiYgdGhpcy5lbGVtZW50c1RvUmVmcmVzaC5sZW5ndGggJiYgdGhpcy5kYXRhUHJvdmlkZXIpIHtcblx0XHRcdFx0dGhpcy5kb1JlZnJlc2godGhpcy5lbGVtZW50c1RvUmVmcmVzaCk7XG5cdFx0XHRcdHRoaXMuZWxlbWVudHNUb1JlZnJlc2ggPSBbXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzZXRUaW1lb3V0MCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5kYXRhUHJvdmlkZXIpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmZpcmUodGhpcy5pc1Zpc2libGUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKHRoaXMudmlzaWJsZSkge1xuXHRcdFx0dGhpcy5hY3RpdmF0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhY3RpdmF0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJvdGVjdGVkIGFic3RyYWN0IGFjdGl2YXRlKCk6IHZvaWQ7XG5cblx0Zm9jdXMocmV2ZWFsOiBib29sZWFuID0gdHJ1ZSwgcmV2ZWFsSXRlbT86IElUcmVlSXRlbSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnRyZWUgJiYgdGhpcy5yb290LmNoaWxkcmVuICYmIHRoaXMucm9vdC5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG5cdFx0XHQvLyBNYWtlIHN1cmUgdGhlIGN1cnJlbnQgc2VsZWN0ZWQgZWxlbWVudCBpcyByZXZlYWxlZFxuXHRcdFx0Y29uc3QgZWxlbWVudCA9IHJldmVhbEl0ZW0gPz8gdGhpcy50cmVlLmdldFNlbGVjdGlvbigpWzBdO1xuXHRcdFx0aWYgKGVsZW1lbnQgJiYgcmV2ZWFsKSB7XG5cdFx0XHRcdHRoaXMudHJlZS5yZXZlYWwoZWxlbWVudCwgMC41KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUGFzcyBGb2N1cyB0byBWaWV3ZXJcblx0XHRcdHRoaXMudHJlZS5kb21Gb2N1cygpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy50cmVlICYmIHRoaXMudHJlZUNvbnRhaW5lciAmJiAhdGhpcy50cmVlQ29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnaGlkZScpKSB7XG5cdFx0XHR0aGlzLnRyZWUuZG9tRm9jdXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kb21Ob2RlLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0c2hvdyhjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdERPTS5hcHBlbmQoY29udGFpbmVyLCB0aGlzLmRvbU5vZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGUoKSB7XG5cdFx0dGhpcy5kb21Ob2RlID0gRE9NLiQoJy50cmVlLWV4cGxvcmVyLXZpZXdsZXQtdHJlZS12aWV3Jyk7XG5cdFx0dGhpcy5tZXNzYWdlRWxlbWVudCA9IERPTS5hcHBlbmQodGhpcy5kb21Ob2RlLCBET00uJCgnLm1lc3NhZ2UnKSk7XG5cdFx0dGhpcy51cGRhdGVNZXNzYWdlKCk7XG5cdFx0dGhpcy50cmVlQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmRvbU5vZGUsIERPTS4kKCcuY3VzdG9tdmlldy10cmVlJykpO1xuXHRcdHRoaXMudHJlZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdmaWxlLWljb24tdGhlbWFibGUtdHJlZScsICdzaG93LWZpbGUtaWNvbnMnKTtcblx0XHRjb25zdCBmb2N1c1RyYWNrZXIgPSB0aGlzLl9yZWdpc3RlcihET00udHJhY2tGb2N1cyh0aGlzLmRvbU5vZGUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiB0aGlzLmZvY3VzZWQgPSB0cnVlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZm9jdXNUcmFja2VyLm9uRGlkQmx1cigoKSA9PiB0aGlzLmZvY3VzZWQgPSBmYWxzZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSB0cmVlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByb3RlY3RlZCBjcmVhdGVUcmVlKCkge1xuXHRcdHRoaXMudHJlZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0Y29uc3QgYWN0aW9uVmlld0l0ZW1Qcm92aWRlciA9IGNyZWF0ZUFjdGlvblZpZXdJdGVtLmJpbmQodW5kZWZpbmVkLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB0cmVlTWVudXMgPSB0aGlzLnRyZWVEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUcmVlTWVudXMsIHRoaXMuaWQpKTtcblx0XHR0aGlzLnRyZWVMYWJlbHMgPSB0aGlzLnRyZWVEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxhYmVscywgdGhpcykpO1xuXHRcdGNvbnN0IGRhdGFTb3VyY2UgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyZWVEYXRhU291cmNlLCB0aGlzLCA8VD4odGFzazogUHJvbWlzZTxUPikgPT4gdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgbG9jYXRpb246IHRoaXMuaWQgfSwgKCkgPT4gdGFzaykpO1xuXHRcdGNvbnN0IGFsaWduZXIgPSB0aGlzLnRyZWVEaXNwb3NhYmxlcy5hZGQobmV3IEFsaWduZXIodGhpcy50aGVtZVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGNoZWNrYm94U3RhdGVIYW5kbGVyID0gdGhpcy50cmVlRGlzcG9zYWJsZXMuYWRkKG5ldyBDaGVja2JveFN0YXRlSGFuZGxlcigpKTtcblx0XHRjb25zdCByZW5kZXJlciA9IHRoaXMudHJlZURpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyZWVSZW5kZXJlciwgdGhpcy5pZCwgdHJlZU1lbnVzLCB0aGlzLnRyZWVMYWJlbHMsIGFjdGlvblZpZXdJdGVtUHJvdmlkZXIsIGFsaWduZXIsIGNoZWNrYm94U3RhdGVIYW5kbGVyLCAoKSA9PiB0aGlzLm1hbnVhbGx5TWFuYWdlQ2hlY2tib3hlcykpO1xuXHRcdHRoaXMudHJlZURpc3Bvc2FibGVzLmFkZChyZW5kZXJlci5vbkRpZENoYW5nZUNoZWNrYm94U3RhdGUoZSA9PiB0aGlzLl9vbkRpZENoYW5nZUNoZWNrYm94U3RhdGUuZmlyZShlKSkpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0QXJpYUxhYmVsID0gdGhpcy5fdGl0bGU7XG5cblx0XHR0aGlzLnRyZWUgPSB0aGlzLnRyZWVEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUcmVlLCB0aGlzLmlkLCB0aGlzLnRyZWVDb250YWluZXIhLCBuZXcgVHJlZVZpZXdEZWxlZ2F0ZSgpLCBbcmVuZGVyZXJdLFxuXHRcdFx0ZGF0YVNvdXJjZSwge1xuXHRcdFx0aWRlbnRpdHlQcm92aWRlcjogbmV3IFRyZWVWaWV3SWRlbnRpdHlQcm92aWRlcigpLFxuXHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdGdldEFyaWFMYWJlbChlbGVtZW50OiBJVHJlZUl0ZW0pOiBzdHJpbmcgfCBudWxsIHtcblx0XHRcdFx0XHRpZiAoZWxlbWVudC5hY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24pIHtcblx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbi5sYWJlbDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoaXNTdHJpbmcoZWxlbWVudC50b29sdGlwKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRyZWVNZW51cy5nZXRSZXNvdXJjZUFjdGlvbnMoW2VsZW1lbnRdKS5sZW5ndGggPiAwID8gbG9jYWxpemUoJ3RyZWVBcmlhTGFiZWxIYXNBY3Rpb25zVG9vbHRpcCcsIFwiezB9LCBoYXMgYWN0aW9uc1wiLCBlbGVtZW50LnRvb2x0aXApIDogZWxlbWVudC50b29sdGlwO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudC5yZXNvdXJjZVVyaSAmJiAhZWxlbWVudC5sYWJlbCkge1xuXHRcdFx0XHRcdFx0XHQvLyBUaGUgY3VzdG9tIHRyZWUgaGFzIG5vIGdvb2QgaW5mb3JtYXRpb24gb24gd2hhdCBzaG91bGQgYmUgdXNlZCBmb3IgdGhlIGFyaWEgbGFiZWwuXG5cdFx0XHRcdFx0XHRcdC8vIEFsbG93IHRoZSB0cmVlIHdpZGdldCdzIGRlZmF1bHQgYXJpYSBsYWJlbCB0byBiZSB1c2VkLlxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGxldCBidWlsZEFyaWFMYWJlbDogc3RyaW5nID0gJyc7XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudC5sYWJlbCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBsYWJlbFRleHQgPSBpc01hcmtkb3duU3RyaW5nKGVsZW1lbnQubGFiZWwubGFiZWwpID8gZWxlbWVudC5sYWJlbC5sYWJlbC52YWx1ZSA6IGVsZW1lbnQubGFiZWwubGFiZWw7XG5cdFx0XHRcdFx0XHRcdGJ1aWxkQXJpYUxhYmVsICs9IGxhYmVsVGV4dCArICcgJztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChlbGVtZW50LmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdGJ1aWxkQXJpYUxhYmVsICs9IGVsZW1lbnQuZGVzY3JpcHRpb247XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAodHJlZU1lbnVzLmdldFJlc291cmNlQWN0aW9ucyhbZWxlbWVudF0pLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0YnVpbGRBcmlhTGFiZWwgPSBidWlsZEFyaWFMYWJlbCA/IGxvY2FsaXplKCd0cmVlQXJpYUxhYmVsSGFzQWN0aW9uc1N1ZmZpeCcsIFwiezB9LCBoYXMgYWN0aW9uc1wiLCBidWlsZEFyaWFMYWJlbC50cmltKCkpIDogbG9jYWxpemUoJ3RyZWVBcmlhTGFiZWxIYXNBY3Rpb25zJywgXCJoYXMgYWN0aW9uc1wiKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBidWlsZEFyaWFMYWJlbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldFJvbGUoZWxlbWVudDogSVRyZWVJdGVtKTogQXJpYVJvbGUgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbj8ucm9sZSA/PyAndHJlZWl0ZW0nO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRcdFx0XHRyZXR1cm4gd2lkZ2V0QXJpYUxhYmVsO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjoge1xuXHRcdFx0XHRnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbDogKGl0ZW06IElUcmVlSXRlbSkgPT4ge1xuXHRcdFx0XHRcdGlmIChpdGVtLmxhYmVsKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gaXNNYXJrZG93blN0cmluZyhpdGVtLmxhYmVsLmxhYmVsKSA/IGl0ZW0ubGFiZWwubGFiZWwudmFsdWUgOiBpdGVtLmxhYmVsLmxhYmVsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gaXRlbS5yZXNvdXJjZVVyaSA/IGJhc2VuYW1lKFVSSS5yZXZpdmUoaXRlbS5yZXNvdXJjZVVyaSkpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrOiAoZTogSVRyZWVJdGVtKSA9PiB7XG5cdFx0XHRcdHJldHVybiAhIWUuY29tbWFuZCB8fCAhIWUuY2hlY2tib3ggfHwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnc2luZ2xlQ2xpY2snIHwgJ2RvdWJsZUNsaWNrJz4oJ3dvcmtiZW5jaC50cmVlLmV4cGFuZE1vZGUnKSA9PT0gJ2RvdWJsZUNsaWNrJztcblx0XHRcdH0sXG5cdFx0XHRjb2xsYXBzZUJ5RGVmYXVsdDogKGU6IElUcmVlSXRlbSk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0XHRyZXR1cm4gZS5jb2xsYXBzaWJsZVN0YXRlICE9PSBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuRXhwYW5kZWQ7XG5cdFx0XHR9LFxuXHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiB0aGlzLmNhblNlbGVjdE1hbnksXG5cdFx0XHRkbmQ6IHRoaXMudHJlZVZpZXdEbmQsXG5cdFx0XHRvdmVycmlkZVN0eWxlczogZ2V0TG9jYXRpb25CYXNlZFZpZXdDb2xvcnModGhpcy52aWV3TG9jYXRpb24pLmxpc3RPdmVycmlkZVN0eWxlc1xuXHRcdH0pKTtcblxuXHRcdHRoaXMudHJlZURpc3Bvc2FibGVzLmFkZChyZW5kZXJlci5vbkRpZENoYW5nZU1lbnVDb250ZXh0KGUgPT4gZS5mb3JFYWNoKGUgPT4gdGhpcy50cmVlPy5yZXJlbmRlcihlKSkpKTtcblxuXHRcdHRoaXMudHJlZURpc3Bvc2FibGVzLmFkZCh0aGlzLnRyZWUpO1xuXHRcdHRyZWVNZW51cy5zZXRDb250ZXh0S2V5U2VydmljZSh0aGlzLnRyZWUuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFsaWduZXIudHJlZSA9IHRoaXMudHJlZTtcblx0XHRjb25zdCBhY3Rpb25SdW5uZXIgPSB0aGlzLnRyZWVEaXNwb3NhYmxlcy5hZGQobmV3IE11bHRpcGxlU2VsZWN0aW9uQWN0aW9uUnVubmVyKHRoaXMubm90aWZpY2F0aW9uU2VydmljZSwgKCkgPT4gdGhpcy50cmVlIS5nZXRTZWxlY3Rpb24oKSkpO1xuXHRcdHJlbmRlcmVyLmFjdGlvblJ1bm5lciA9IGFjdGlvblJ1bm5lcjtcblxuXHRcdHRoaXMudHJlZS5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXk8Ym9vbGVhbj4odGhpcy5pZCwgdHJ1ZSk7XG5cdFx0Y29uc3QgY3VzdG9tVHJlZUtleSA9IFJhd0N1c3RvbVRyZWVWaWV3Q29udGV4dEtleS5iaW5kVG8odGhpcy50cmVlLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjdXN0b21UcmVlS2V5LnNldCh0cnVlKTtcblx0XHR0aGlzLnRyZWVEaXNwb3NhYmxlcy5hZGQodGhpcy50cmVlLm9uQ29udGV4dE1lbnUoZSA9PiB0aGlzLm9uQ29udGV4dE1lbnUodHJlZU1lbnVzLCBlLCBhY3Rpb25SdW5uZXIpKSk7XG5cblx0XHR0aGlzLnRyZWVEaXNwb3NhYmxlcy5hZGQodGhpcy50cmVlLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKGUgPT4ge1xuXHRcdFx0dGhpcy5sYXN0U2VsZWN0aW9uID0gZS5lbGVtZW50cztcblx0XHRcdHRoaXMubGFzdEFjdGl2ZSA9IHRoaXMudHJlZT8uZ2V0Rm9jdXMoKVswXSA/PyB0aGlzLmxhc3RBY3RpdmU7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbkFuZEZvY3VzLmZpcmUoeyBzZWxlY3Rpb246IHRoaXMubGFzdFNlbGVjdGlvbiwgZm9jdXM6IHRoaXMubGFzdEFjdGl2ZSB9KTtcblx0XHR9KSk7XG5cdFx0dGhpcy50cmVlRGlzcG9zYWJsZXMuYWRkKHRoaXMudHJlZS5vbkRpZENoYW5nZUZvY3VzKGUgPT4ge1xuXHRcdFx0aWYgKGUuZWxlbWVudHMubGVuZ3RoICYmIChlLmVsZW1lbnRzWzBdICE9PSB0aGlzLmxhc3RBY3RpdmUpKSB7XG5cdFx0XHRcdHRoaXMubGFzdEFjdGl2ZSA9IGUuZWxlbWVudHNbMF07XG5cdFx0XHRcdHRoaXMubGFzdFNlbGVjdGlvbiA9IHRoaXMudHJlZT8uZ2V0U2VsZWN0aW9uKCkgPz8gdGhpcy5sYXN0U2VsZWN0aW9uO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbkFuZEZvY3VzLmZpcmUoeyBzZWxlY3Rpb246IHRoaXMubGFzdFNlbGVjdGlvbiwgZm9jdXM6IHRoaXMubGFzdEFjdGl2ZSB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy50cmVlRGlzcG9zYWJsZXMuYWRkKHRoaXMudHJlZS5vbkRpZENoYW5nZUNvbGxhcHNlU3RhdGUoZSA9PiB7XG5cdFx0XHRpZiAoIWUubm9kZS5lbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZWxlbWVudDogSVRyZWVJdGVtID0gQXJyYXkuaXNBcnJheShlLm5vZGUuZWxlbWVudC5lbGVtZW50KSA/IGUubm9kZS5lbGVtZW50LmVsZW1lbnRbMF0gOiBlLm5vZGUuZWxlbWVudC5lbGVtZW50O1xuXHRcdFx0aWYgKGUubm9kZS5jb2xsYXBzZWQpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDb2xsYXBzZUl0ZW0uZmlyZShlbGVtZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkRXhwYW5kSXRlbS5maXJlKGVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnRyZWUuc2V0SW5wdXQodGhpcy5yb290KS50aGVuKCgpID0+IHRoaXMudXBkYXRlQ29udGVudEFyZWFzKCkpO1xuXG5cdFx0dGhpcy50cmVlRGlzcG9zYWJsZXMuYWRkKHRoaXMudHJlZS5vbkRpZE9wZW4oYXN5bmMgKGUpID0+IHtcblx0XHRcdGlmICghZS5icm93c2VyRXZlbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYnJvd3NlckV2ZW50LnRhcmdldCAmJiAoZS5icm93c2VyRXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QuY29udGFpbnMoVHJlZUl0ZW1DaGVja2JveC5jaGVja2JveENsYXNzKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLnRyZWUhLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGF3YWl0IHRoaXMucmVzb2x2ZUNvbW1hbmQoc2VsZWN0aW9uLmxlbmd0aCA9PT0gMSA/IHNlbGVjdGlvblswXSA6IHVuZGVmaW5lZCk7XG5cblx0XHRcdGlmIChjb21tYW5kICYmIGlzVHJlZUNvbW1hbmRFbmFibGVkKGNvbW1hbmQsIHRoaXMuY29udGV4dEtleVNlcnZpY2UpKSB7XG5cdFx0XHRcdGxldCBhcmdzID0gY29tbWFuZC5hcmd1bWVudHMgfHwgW107XG5cdFx0XHRcdGlmIChjb21tYW5kLmlkID09PSBBUElfT1BFTl9FRElUT1JfQ09NTUFORF9JRCB8fCBjb21tYW5kLmlkID09PSBBUElfT1BFTl9ESUZGX0VESVRPUl9DT01NQU5EX0lEKSB7XG5cdFx0XHRcdFx0Ly8gU29tZSBjb21tYW5kcyBvd25lZCBieSB1cyBzaG91bGQgcmVjZWl2ZSB0aGVcblx0XHRcdFx0XHQvLyBgSU9wZW5FdmVudGAgYXMgY29udGV4dCB0byBvcGVuIHByb3Blcmx5XG5cdFx0XHRcdFx0YXJncyA9IFsuLi5hcmdzLCBlXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kLmlkLCAuLi5hcmdzKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnRyZWVEaXNwb3NhYmxlcy5hZGQodHJlZU1lbnVzLm9uRGlkQ2hhbmdlKChjaGFuZ2VkKSA9PiB7XG5cdFx0XHRpZiAodGhpcy50cmVlPy5oYXNOb2RlKGNoYW5nZWQpKSB7XG5cdFx0XHRcdHRoaXMudHJlZT8ucmVyZW5kZXIoY2hhbmdlZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlQ29tbWFuZChlbGVtZW50OiBJVHJlZUl0ZW0gfCB1bmRlZmluZWQpOiBQcm9taXNlPFRyZWVDb21tYW5kIHwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IGNvbW1hbmQgPSBlbGVtZW50Py5jb21tYW5kO1xuXHRcdGlmIChlbGVtZW50ICYmICFjb21tYW5kKSB7XG5cdFx0XHRpZiAoKGVsZW1lbnQgaW5zdGFuY2VvZiBSZXNvbHZhYmxlVHJlZUl0ZW0pICYmIGVsZW1lbnQuaGFzUmVzb2x2ZSkge1xuXHRcdFx0XHRhd2FpdCBlbGVtZW50LnJlc29sdmUoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGNvbW1hbmQgPSBlbGVtZW50LmNvbW1hbmQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb21tYW5kO1xuXHR9XG5cblxuXHRwcml2YXRlIG9uQ29udGV4dE1lbnUodHJlZU1lbnVzOiBUcmVlTWVudXMsIHRyZWVFdmVudDogSVRyZWVDb250ZXh0TWVudUV2ZW50PElUcmVlSXRlbT4sIGFjdGlvblJ1bm5lcjogTXVsdGlwbGVTZWxlY3Rpb25BY3Rpb25SdW5uZXIpOiB2b2lkIHtcblx0XHR0aGlzLmhvdmVyU2VydmljZS5oaWRlSG92ZXIoKTtcblx0XHRjb25zdCBub2RlOiBJVHJlZUl0ZW0gfCBudWxsID0gdHJlZUV2ZW50LmVsZW1lbnQ7XG5cdFx0aWYgKG5vZGUgPT09IG51bGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZXZlbnQ6IFVJRXZlbnQgPSB0cmVlRXZlbnQuYnJvd3NlckV2ZW50O1xuXG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblxuXHRcdHRoaXMudHJlZSEuc2V0Rm9jdXMoW25vZGVdKTtcblx0XHRsZXQgc2VsZWN0ZWQgPSB0aGlzLmNhblNlbGVjdE1hbnkgPyB0aGlzLmdldFNlbGVjdGlvbigpIDogW107XG5cdFx0aWYgKCFzZWxlY3RlZC5maW5kKGl0ZW0gPT4gaXRlbS5oYW5kbGUgPT09IG5vZGUuaGFuZGxlKSkge1xuXHRcdFx0c2VsZWN0ZWQgPSBbbm9kZV07XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IHRyZWVNZW51cy5nZXRSZXNvdXJjZUNvbnRleHRBY3Rpb25zKHNlbGVjdGVkKTtcblx0XHRpZiAoIWFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IHRyZWVFdmVudC5hbmNob3IsXG5cblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cblx0XHRcdGdldEFjdGlvblZpZXdJdGVtOiAoYWN0aW9uKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKTtcblx0XHRcdFx0aWYgKGtleWJpbmRpbmcpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IEFjdGlvblZpZXdJdGVtKGFjdGlvbiwgYWN0aW9uLCB7IGxhYmVsOiB0cnVlLCBrZXliaW5kaW5nOiBrZXliaW5kaW5nLmdldExhYmVsKCkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cblx0XHRcdG9uSGlkZTogKHdhc0NhbmNlbGxlZD86IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0aWYgKHdhc0NhbmNlbGxlZCkge1xuXHRcdFx0XHRcdHRoaXMudHJlZSEuZG9tRm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblxuXHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+ICh7ICR0cmVlVmlld0lkOiB0aGlzLmlkLCAkdHJlZUl0ZW1IYW5kbGU6IG5vZGUuaGFuZGxlIH0gc2F0aXNmaWVzIFRyZWVWaWV3SXRlbUhhbmRsZUFyZyksXG5cblx0XHRcdGFjdGlvblJ1bm5lclxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZU1lc3NhZ2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX21lc3NhZ2UpIHtcblx0XHRcdHRoaXMuc2hvd01lc3NhZ2UodGhpcy5fbWVzc2FnZSk7XG5cdFx0fSBlbHNlIGlmICghdGhpcy5kYXRhUHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuc2hvd01lc3NhZ2Uobm9EYXRhUHJvdmlkZXJNZXNzYWdlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5oaWRlTWVzc2FnZSgpO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZUNvbnRlbnRBcmVhcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBwcm9jZXNzTWVzc2FnZShtZXNzYWdlOiBJTWFya2Rvd25TdHJpbmcsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgbGluZXMgPSBtZXNzYWdlLnZhbHVlLnNwbGl0KCdcXG4nKTtcblx0XHRjb25zdCByZXN1bHQ6IChJUmVuZGVyZWRNYXJrZG93biB8IEhUTUxFbGVtZW50KVtdID0gW107XG5cdFx0bGV0IGhhc0ZvdW5kQnV0dG9uID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0XHRjb25zdCBsaW5rZWRUZXh0ID0gcGFyc2VMaW5rZWRUZXh0KGxpbmUpO1xuXG5cdFx0XHRpZiAobGlua2VkVGV4dC5ub2Rlcy5sZW5ndGggPT09IDEgJiYgdHlwZW9mIGxpbmtlZFRleHQubm9kZXNbMF0gIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbnN0IG5vZGUgPSBsaW5rZWRUZXh0Lm5vZGVzWzBdO1xuXHRcdFx0XHRjb25zdCBidXR0b25Db250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0YnV0dG9uQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2J1dHRvbi1jb250YWluZXInKTtcblx0XHRcdFx0Y29uc3QgYnV0dG9uID0gbmV3IEJ1dHRvbihidXR0b25Db250YWluZXIsIHsgdGl0bGU6IG5vZGUudGl0bGUsIHNlY29uZGFyeTogaGFzRm91bmRCdXR0b24sIHN1cHBvcnRJY29uczogdHJ1ZSwgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcyB9KTtcblx0XHRcdFx0YnV0dG9uLmxhYmVsID0gbm9kZS5sYWJlbDtcblx0XHRcdFx0YnV0dG9uLm9uRGlkQ2xpY2soXyA9PiB7XG5cdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4obm9kZS5ocmVmLCB7IGFsbG93Q29tbWFuZHM6IHRydWUgfSk7XG5cdFx0XHRcdH0sIG51bGwsIGRpc3Bvc2FibGVzKTtcblxuXHRcdFx0XHRjb25zdCBocmVmID0gVVJJLnBhcnNlKG5vZGUuaHJlZik7XG5cdFx0XHRcdGlmIChocmVmLnNjaGVtZSA9PT0gU2NoZW1hcy5jb21tYW5kKSB7XG5cdFx0XHRcdFx0Y29uc3QgcHJlQ29uZGl0aW9ucyA9IGNvbW1hbmRQcmVjb25kaXRpb25zKGhyZWYucGF0aCk7XG5cdFx0XHRcdFx0aWYgKHByZUNvbmRpdGlvbnMpIHtcblx0XHRcdFx0XHRcdGJ1dHRvbi5lbmFibGVkID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHByZUNvbmRpdGlvbnMpO1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGUgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAoZS5hZmZlY3RzU29tZShuZXcgU2V0KHByZUNvbmRpdGlvbnMua2V5cygpKSkpIHtcblx0XHRcdFx0XHRcdFx0XHRidXR0b24uZW5hYmxlZCA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhwcmVDb25kaXRpb25zKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChidXR0b24pO1xuXHRcdFx0XHRoYXNGb3VuZEJ1dHRvbiA9IHRydWU7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGJ1dHRvbkNvbnRhaW5lcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoYXNGb3VuZEJ1dHRvbiA9IGZhbHNlO1xuXHRcdFx0XHRjb25zdCByZW5kZXJlZCA9IHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKG5ldyBNYXJrZG93blN0cmluZyhsaW5lLCB7IGlzVHJ1c3RlZDogbWVzc2FnZS5pc1RydXN0ZWQsIHN1cHBvcnRUaGVtZUljb25zOiBtZXNzYWdlLnN1cHBvcnRUaGVtZUljb25zLCBzdXBwb3J0SHRtbDogbWVzc2FnZS5zdXBwb3J0SHRtbCB9KSk7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHJlbmRlcmVkLmVsZW1lbnQpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQocmVuZGVyZWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdyZW5kZXJlZC1tZXNzYWdlJyk7XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiByZXN1bHQpIHtcblx0XHRcdGlmIChET00uaXNIVE1MRWxlbWVudChjaGlsZCkpIHtcblx0XHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGNoaWxkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChjaGlsZC5lbGVtZW50KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0fVxuXG5cdHByaXZhdGUgc2hvd01lc3NhZ2UobWVzc2FnZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKGlzUmVuZGVyZWRNZXNzYWdlVmFsdWUodGhpcy5fbWVzc2FnZVZhbHVlKSkge1xuXHRcdFx0dGhpcy5fbWVzc2FnZVZhbHVlLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0aWYgKGlzTWFya2Rvd25TdHJpbmcobWVzc2FnZSkpIHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgcmVuZGVyZWRNZXNzYWdlID0gdGhpcy5wcm9jZXNzTWVzc2FnZShtZXNzYWdlLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR0aGlzLl9tZXNzYWdlVmFsdWUgPSB7IGVsZW1lbnQ6IHJlbmRlcmVkTWVzc2FnZSwgZGlzcG9zYWJsZXMgfTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbWVzc2FnZVZhbHVlID0gbWVzc2FnZTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLm1lc3NhZ2VFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMubWVzc2FnZUVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZScpO1xuXHRcdHRoaXMucmVzZXRNZXNzYWdlRWxlbWVudCgpO1xuXHRcdGlmICh0eXBlb2YgdGhpcy5fbWVzc2FnZVZhbHVlID09PSAnc3RyaW5nJyAmJiAhaXNGYWxzeU9yV2hpdGVzcGFjZSh0aGlzLl9tZXNzYWdlVmFsdWUpKSB7XG5cdFx0XHR0aGlzLm1lc3NhZ2VFbGVtZW50LnRleHRDb250ZW50ID0gdGhpcy5fbWVzc2FnZVZhbHVlO1xuXHRcdH0gZWxzZSBpZiAoaXNSZW5kZXJlZE1lc3NhZ2VWYWx1ZSh0aGlzLl9tZXNzYWdlVmFsdWUpKSB7XG5cdFx0XHR0aGlzLm1lc3NhZ2VFbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuX21lc3NhZ2VWYWx1ZS5lbGVtZW50KTtcblx0XHR9XG5cdFx0dGhpcy5sYXlvdXQodGhpcy5faGVpZ2h0LCB0aGlzLl93aWR0aCk7XG5cdH1cblxuXHRwcml2YXRlIGhpZGVNZXNzYWdlKCk6IHZvaWQge1xuXHRcdHRoaXMucmVzZXRNZXNzYWdlRWxlbWVudCgpO1xuXHRcdHRoaXMubWVzc2FnZUVsZW1lbnQ/LmNsYXNzTGlzdC5hZGQoJ2hpZGUnKTtcblx0XHR0aGlzLmxheW91dCh0aGlzLl9oZWlnaHQsIHRoaXMuX3dpZHRoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzZXRNZXNzYWdlRWxlbWVudCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5tZXNzYWdlRWxlbWVudCkge1xuXHRcdFx0RE9NLmNsZWFyTm9kZSh0aGlzLm1lc3NhZ2VFbGVtZW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oZWlnaHQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX3dpZHRoOiBudW1iZXIgPSAwO1xuXHRsYXlvdXQoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpIHtcblx0XHRpZiAoaGVpZ2h0ICYmIHdpZHRoICYmIHRoaXMubWVzc2FnZUVsZW1lbnQgJiYgdGhpcy50cmVlQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLl9oZWlnaHQgPSBoZWlnaHQ7XG5cdFx0XHR0aGlzLl93aWR0aCA9IHdpZHRoO1xuXHRcdFx0Y29uc3QgdHJlZUhlaWdodCA9IGhlaWdodCAtIERPTS5nZXRUb3RhbEhlaWdodCh0aGlzLm1lc3NhZ2VFbGVtZW50KTtcblx0XHRcdHRoaXMudHJlZUNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSB0cmVlSGVpZ2h0ICsgJ3B4Jztcblx0XHRcdHRoaXMudHJlZT8ubGF5b3V0KHRyZWVIZWlnaHQsIHdpZHRoKTtcblx0XHR9XG5cdH1cblxuXHRnZXRPcHRpbWFsV2lkdGgoKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy50cmVlKSB7XG5cdFx0XHRjb25zdCBwYXJlbnROb2RlID0gdGhpcy50cmVlLmdldEhUTUxFbGVtZW50KCk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGNoaWxkTm9kZXMgPSAoW10gYXMgSFRNTEVsZW1lbnRbXSkuc2xpY2UuY2FsbChwYXJlbnROb2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5vdXRsaW5lLWl0ZW0tbGFiZWwgPiBhJykpO1xuXHRcdFx0cmV0dXJuIERPTS5nZXRMYXJnZXN0Q2hpbGRXaWR0aChwYXJlbnROb2RlLCBjaGlsZE5vZGVzKTtcblx0XHR9XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNoZWNrYm94ZXMoZWxlbWVudHM6IHJlYWRvbmx5IElUcmVlSXRlbVtdKTogSVRyZWVJdGVtW10ge1xuXHRcdHJldHVybiBzZXRDYXNjYWRpbmdDaGVja2JveFVwZGF0ZXMoZWxlbWVudHMpO1xuXHR9XG5cblx0YXN5bmMgcmVmcmVzaChlbGVtZW50cz86IHJlYWRvbmx5IElUcmVlSXRlbVtdLCBjaGVja2JveGVzPzogcmVhZG9ubHkgSVRyZWVJdGVtW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5kYXRhUHJvdmlkZXIgJiYgdGhpcy50cmVlKSB7XG5cdFx0XHRpZiAodGhpcy5yZWZyZXNoaW5nKSB7XG5cdFx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZSh0aGlzLl9vbkRpZENvbXBsZXRlUmVmcmVzaC5ldmVudCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWVsZW1lbnRzKSB7XG5cdFx0XHRcdGVsZW1lbnRzID0gW3RoaXMucm9vdF07XG5cdFx0XHRcdC8vIHJlbW92ZSBhbGwgd2FpdGluZyBlbGVtZW50cyB0byByZWZyZXNoIGlmIHJvb3QgaXMgYXNrZWQgdG8gcmVmcmVzaFxuXHRcdFx0XHR0aGlzLmVsZW1lbnRzVG9SZWZyZXNoID0gW107XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgZWxlbWVudHMpIHtcblx0XHRcdFx0ZWxlbWVudC5jaGlsZHJlbiA9IHVuZGVmaW5lZDsgLy8gcmVzZXQgY2hpbGRyZW5cblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmlzVmlzaWJsZSkge1xuXHRcdFx0XHRjb25zdCBhZmZlY3RlZEVsZW1lbnRzID0gdGhpcy51cGRhdGVDaGVja2JveGVzKGNoZWNrYm94ZXMgPz8gW10pO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5kb1JlZnJlc2goZWxlbWVudHMuY29uY2F0KGFmZmVjdGVkRWxlbWVudHMpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh0aGlzLmVsZW1lbnRzVG9SZWZyZXNoLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNvbnN0IHNlZW46IFNldDxzdHJpbmc+ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRcdFx0dGhpcy5lbGVtZW50c1RvUmVmcmVzaC5mb3JFYWNoKGVsZW1lbnQgPT4gc2Vlbi5hZGQoZWxlbWVudC5oYW5kbGUpKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgZWxlbWVudHMpIHtcblx0XHRcdFx0XHRcdGlmICghc2Vlbi5oYXMoZWxlbWVudC5oYW5kbGUpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZWxlbWVudHNUb1JlZnJlc2gucHVzaChlbGVtZW50KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5lbGVtZW50c1RvUmVmcmVzaC5wdXNoKC4uLmVsZW1lbnRzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZXhwYW5kKGl0ZW1Pckl0ZW1zOiBJVHJlZUl0ZW0gfCBJVHJlZUl0ZW1bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRyZWUgPSB0aGlzLnRyZWU7XG5cdFx0aWYgKCF0cmVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRpdGVtT3JJdGVtcyA9IEFycmF5LmlzQXJyYXkoaXRlbU9ySXRlbXMpID8gaXRlbU9ySXRlbXMgOiBbaXRlbU9ySXRlbXNdO1xuXHRcdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGl0ZW1Pckl0ZW1zKSB7XG5cdFx0XHRcdGF3YWl0IHRyZWUuZXhwYW5kKGVsZW1lbnQsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBUaGUgZXh0ZW5zaW9uIGNvdWxkIGhhdmUgY2hhbmdlZCB0aGUgdHJlZSBkdXJpbmcgdGhlIHJldmVhbC5cblx0XHRcdC8vIEJlY2F1c2Ugb2YgdGhhdCwgd2UgaWdub3JlIGVycm9ycy5cblx0XHR9XG5cdH1cblxuXHRpc0NvbGxhcHNlZChpdGVtOiBJVHJlZUl0ZW0pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLnRyZWU/LmlzQ29sbGFwc2VkKGl0ZW0pO1xuXHR9XG5cblx0c2V0U2VsZWN0aW9uKGl0ZW1zOiBJVHJlZUl0ZW1bXSk6IHZvaWQge1xuXHRcdHRoaXMudHJlZT8uc2V0U2VsZWN0aW9uKGl0ZW1zKTtcblx0fVxuXG5cdGdldFNlbGVjdGlvbigpOiBJVHJlZUl0ZW1bXSB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZT8uZ2V0U2VsZWN0aW9uKCkgPz8gW107XG5cdH1cblxuXHRzZXRGb2N1cyhpdGVtPzogSVRyZWVJdGVtKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudHJlZSkge1xuXHRcdFx0aWYgKGl0ZW0pIHtcblx0XHRcdFx0dGhpcy5mb2N1cyh0cnVlLCBpdGVtKTtcblx0XHRcdFx0dGhpcy50cmVlLnNldEZvY3VzKFtpdGVtXSk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMudHJlZS5nZXRGb2N1cygpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMoW10pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJldmVhbChpdGVtOiBJVHJlZUl0ZW0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy50cmVlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50cmVlLnJldmVhbChpdGVtKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2hpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBhc3luYyBkb1JlZnJlc2goZWxlbWVudHM6IHJlYWRvbmx5IElUcmVlSXRlbVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdHJlZSA9IHRoaXMudHJlZTtcblx0XHRpZiAodHJlZSAmJiB0aGlzLnZpc2libGUpIHtcblx0XHRcdHRoaXMucmVmcmVzaGluZyA9IHRydWU7XG5cdFx0XHRjb25zdCBvbGRTZWxlY3Rpb24gPSB0cmVlLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoZWxlbWVudHMubWFwKGVsZW1lbnQgPT4gdHJlZS51cGRhdGVDaGlsZHJlbihlbGVtZW50LCB0cnVlLCB0cnVlKSkpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHQvLyBXaGVuIG11bHRpcGxlIGNhbGxzIGFyZSBtYWRlIHRvIHJlZnJlc2ggdGhlIHRyZWUgaW4gcXVpY2sgc3VjY2Vzc2lvbixcblx0XHRcdFx0Ly8gd2UgY2FuIGdldCBhIFwiVHJlZSBlbGVtZW50IG5vdCBmb3VuZFwiIGVycm9yLiBUaGlzIGlzIGV4cGVjdGVkLlxuXHRcdFx0XHQvLyBJZGVhbGx5IHRoaXMgaXMgZml4YWJsZSwgc28gbG9nIGluc3RlYWQgb2YgaWdub3Jpbmcgc28gdGhlIGVycm9yIGlzIHByZXNlcnZlZC5cblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbmV3U2VsZWN0aW9uID0gdHJlZS5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGlmIChvbGRTZWxlY3Rpb24ubGVuZ3RoICE9PSBuZXdTZWxlY3Rpb24ubGVuZ3RoIHx8IG9sZFNlbGVjdGlvbi5zb21lKCh2YWx1ZSwgaW5kZXgpID0+IHZhbHVlLmhhbmRsZSAhPT0gbmV3U2VsZWN0aW9uW2luZGV4XS5oYW5kbGUpKSB7XG5cdFx0XHRcdHRoaXMubGFzdFNlbGVjdGlvbiA9IG5ld1NlbGVjdGlvbjtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb25BbmRGb2N1cy5maXJlKHsgc2VsZWN0aW9uOiB0aGlzLmxhc3RTZWxlY3Rpb24sIGZvY3VzOiB0aGlzLmxhc3RBY3RpdmUgfSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnJlZnJlc2hpbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuX29uRGlkQ29tcGxldGVSZWZyZXNoLmZpcmUoKTtcblx0XHRcdHRoaXMudXBkYXRlQ29udGVudEFyZWFzKCk7XG5cdFx0XHRpZiAodGhpcy5mb2N1c2VkKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXMoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy51cGRhdGVDb2xsYXBzZUFsbFRvZ2dsZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaW5pdGlhbGl6ZUNvbGxhcHNlQWxsVG9nZ2xlKCkge1xuXHRcdGlmICghdGhpcy5jb2xsYXBzZUFsbFRvZ2dsZUNvbnRleHQpIHtcblx0XHRcdHRoaXMuY29sbGFwc2VBbGxUb2dnbGVDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oYHRyZWVWaWV3LiR7dGhpcy5pZH0udG9nZ2xlQ29sbGFwc2VBbGxgLCBmYWxzZSwgbG9jYWxpemUoJ3RyZWVWaWV3LnRvZ2dsZUNvbGxhcHNlQWxsJywgXCJXaGV0aGVyIGNvbGxhcHNlIGFsbCBpcyB0b2dnbGVkIGZvciB0aGUgdHJlZSB2aWV3IHdpdGggaWQgezB9LlwiLCB0aGlzLmlkKSk7XG5cdFx0XHR0aGlzLmNvbGxhcHNlQWxsVG9nZ2xlQ29udGV4dCA9IHRoaXMuY29sbGFwc2VBbGxUb2dnbGVDb250ZXh0S2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbGxhcHNlQWxsVG9nZ2xlKCkge1xuXHRcdGlmICh0aGlzLnNob3dDb2xsYXBzZUFsbEFjdGlvbikge1xuXHRcdFx0dGhpcy5pbml0aWFsaXplQ29sbGFwc2VBbGxUb2dnbGUoKTtcblx0XHRcdHRoaXMuY29sbGFwc2VBbGxUb2dnbGVDb250ZXh0Py5zZXQoISF0aGlzLnJvb3QuY2hpbGRyZW4gJiYgKHRoaXMucm9vdC5jaGlsZHJlbi5sZW5ndGggPiAwKSAmJlxuXHRcdFx0XHR0aGlzLnJvb3QuY2hpbGRyZW4uc29tZSh2YWx1ZSA9PiB2YWx1ZS5jb2xsYXBzaWJsZVN0YXRlICE9PSBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29udGVudEFyZWFzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGlzVHJlZUVtcHR5ID0gIXRoaXMucm9vdC5jaGlsZHJlbiB8fCB0aGlzLnJvb3QuY2hpbGRyZW4ubGVuZ3RoID09PSAwO1xuXHRcdC8vIEhpZGUgdHJlZSBjb250YWluZXIgb25seSB3aGVuIHRoZXJlIGlzIGEgbWVzc2FnZSBhbmQgdHJlZSBpcyBlbXB0eSBhbmQgbm90IHJlZnJlc2hpbmdcblx0XHRpZiAodGhpcy5fbWVzc2FnZVZhbHVlICYmIGlzVHJlZUVtcHR5ICYmICF0aGlzLnJlZnJlc2hpbmcgJiYgdGhpcy50cmVlQ29udGFpbmVyKSB7XG5cdFx0XHQvLyBJZiB0aGVyZSdzIGEgZG5kIGNvbnRyb2xsZXIgdGhlbiBoaWRpbmcgdGhlIHRyZWUgcHJldmVudHMgaXQgZnJvbSBiZWluZyBkcmFnZ2VkIGludG8uXG5cdFx0XHRpZiAoIXRoaXMuZHJhZ0FuZERyb3BDb250cm9sbGVyKSB7XG5cdFx0XHRcdHRoaXMudHJlZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoaWRlJyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnRyZWVDb250YWluZXIpIHtcblx0XHRcdHRoaXMudHJlZUNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdoaWRlJyk7XG5cdFx0XHRpZiAodGhpcy5kb21Ob2RlID09PSBET00uZ2V0QWN0aXZlRWxlbWVudCgpKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuZG9tTm9kZS5yZW1vdmVBdHRyaWJ1dGUoJ3RhYmluZGV4Jyk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGNvbnRhaW5lcigpOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRhaW5lcjtcblx0fVxufVxuXG5jbGFzcyBUcmVlVmlld0lkZW50aXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJSWRlbnRpdHlQcm92aWRlcjxJVHJlZUl0ZW0+IHtcblx0Z2V0SWQoZWxlbWVudDogSVRyZWVJdGVtKTogeyB0b1N0cmluZygpOiBzdHJpbmcgfSB7XG5cdFx0cmV0dXJuIGVsZW1lbnQuaGFuZGxlO1xuXHR9XG59XG5cbmNsYXNzIFRyZWVWaWV3RGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxJVHJlZUl0ZW0+IHtcblxuXHRnZXRIZWlnaHQoZWxlbWVudDogSVRyZWVJdGVtKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gVHJlZVJlbmRlcmVyLklURU1fSEVJR0hUO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBJVHJlZUl0ZW0pOiBzdHJpbmcge1xuXHRcdHJldHVybiBUcmVlUmVuZGVyZXIuVFJFRV9URU1QTEFURV9JRDtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBkb0dldENoaWxkcmVuT3JCYXRjaChkYXRhUHJvdmlkZXI6IElUcmVlVmlld0RhdGFQcm92aWRlciwgbm9kZXM6IElUcmVlSXRlbVtdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTwocmVhZG9ubHkgSVRyZWVJdGVtW10pW10gfCB1bmRlZmluZWQ+IHtcblx0aWYgKGRhdGFQcm92aWRlci5nZXRDaGlsZHJlbkJhdGNoKSB7XG5cdFx0cmV0dXJuIGRhdGFQcm92aWRlci5nZXRDaGlsZHJlbkJhdGNoKG5vZGVzKTtcblx0fSBlbHNlIHtcblx0XHRpZiAobm9kZXMpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLmFsbChub2Rlcy5tYXAobm9kZSA9PiBkYXRhUHJvdmlkZXIuZ2V0Q2hpbGRyZW4obm9kZSkudGhlbihjaGlsZHJlbiA9PiBjaGlsZHJlbiA/PyBbXSkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIFthd2FpdCBkYXRhUHJvdmlkZXIuZ2V0Q2hpbGRyZW4oKV0uZmlsdGVyKGNoaWxkcmVuID0+IGNoaWxkcmVuICE9PSB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBUcmVlRGF0YVNvdXJjZSBpbXBsZW1lbnRzIElBc3luY0RhdGFTb3VyY2U8SVRyZWVJdGVtLCBJVHJlZUl0ZW0+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHRyZWVWaWV3OiBJVHJlZVZpZXcsXG5cdFx0cHJpdmF0ZSB3aXRoUHJvZ3Jlc3M6IDxUPih0YXNrOiBQcm9taXNlPFQ+KSA9PiBQcm9taXNlPFQ+XG5cdCkge1xuXHR9XG5cblx0aGFzQ2hpbGRyZW4oZWxlbWVudDogSVRyZWVJdGVtKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy50cmVlVmlldy5kYXRhUHJvdmlkZXIgJiYgKGVsZW1lbnQuY29sbGFwc2libGVTdGF0ZSAhPT0gVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLk5vbmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBiYXRjaDogSVRyZWVJdGVtW10gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYmF0Y2hQcm9taXNlOiBQcm9taXNlPChyZWFkb25seSBJVHJlZUl0ZW1bXSlbXSB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQ7XG5cdGFzeW5jIGdldENoaWxkcmVuKGVsZW1lbnQ6IElUcmVlSXRlbSk6IFByb21pc2U8cmVhZG9ubHkgSVRyZWVJdGVtW10+IHtcblx0XHRjb25zdCBkYXRhUHJvdmlkZXIgPSB0aGlzLnRyZWVWaWV3LmRhdGFQcm92aWRlcjtcblx0XHRpZiAoIWRhdGFQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRpZiAodGhpcy5iYXRjaCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmJhdGNoID0gW2VsZW1lbnRdO1xuXHRcdFx0dGhpcy5iYXRjaFByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYmF0Y2gucHVzaChlbGVtZW50KTtcblx0XHR9XG5cdFx0Y29uc3QgaW5kZXhJbkJhdGNoID0gdGhpcy5iYXRjaC5sZW5ndGggLSAxO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxyZWFkb25seSBJVHJlZUl0ZW1bXT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0c2V0VGltZW91dChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGJhdGNoID0gdGhpcy5iYXRjaDtcblx0XHRcdFx0dGhpcy5iYXRjaCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKCF0aGlzLmJhdGNoUHJvbWlzZSkge1xuXHRcdFx0XHRcdHRoaXMuYmF0Y2hQcm9taXNlID0gdGhpcy53aXRoUHJvZ3Jlc3MoZG9HZXRDaGlsZHJlbk9yQmF0Y2goZGF0YVByb3ZpZGVyLCBiYXRjaCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5iYXRjaFByb21pc2U7XG5cdFx0XHRcdFx0cmVzb2x2ZSgocmVzdWx0ICYmIChpbmRleEluQmF0Y2ggPCByZXN1bHQubGVuZ3RoKSkgPyByZXN1bHRbaW5kZXhJbkJhdGNoXSA6IFtdKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdGlmICghKDxzdHJpbmc+ZS5tZXNzYWdlKS5zdGFydHNXaXRoKCdCYWQgcHJvZ3Jlc3MgbG9jYXRpb246JykpIHtcblx0XHRcdFx0XHRcdHJlamVjdChlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sIDApO1xuXHRcdH0pO1xuXHR9XG59XG5cbmludGVyZmFjZSBJVHJlZUV4cGxvcmVyVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgcmVzb3VyY2VMYWJlbDogSVJlc291cmNlTGFiZWw7XG5cdHJlYWRvbmx5IGljb246IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBjaGVja2JveENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGNoZWNrYm94PzogVHJlZUl0ZW1DaGVja2JveDtcblx0cmVhZG9ubHkgYWN0aW9uQmFyOiBBY3Rpb25CYXI7XG59XG5cbmNsYXNzIFRyZWVSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPElUcmVlSXRlbSwgRnV6enlTY29yZSwgSVRyZWVFeHBsb3JlclRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSVRFTV9IRUlHSFQgPSAyMjtcblx0c3RhdGljIHJlYWRvbmx5IFRSRUVfVEVNUExBVEVfSUQgPSAndHJlZUV4cGxvcmVyJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNoZWNrYm94U3RhdGU6IEVtaXR0ZXI8cmVhZG9ubHkgSVRyZWVJdGVtW10+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8cmVhZG9ubHkgSVRyZWVJdGVtW10+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNoZWNrYm94U3RhdGU6IEV2ZW50PHJlYWRvbmx5IElUcmVlSXRlbVtdPiA9IHRoaXMuX29uRGlkQ2hhbmdlQ2hlY2tib3hTdGF0ZS5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZU1lbnVDb250ZXh0OiBFbWl0dGVyPHJlYWRvbmx5IElUcmVlSXRlbVtdPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHJlYWRvbmx5IElUcmVlSXRlbVtdPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNZW51Q29udGV4dDogRXZlbnQ8cmVhZG9ubHkgSVRyZWVJdGVtW10+ID0gdGhpcy5fb25EaWRDaGFuZ2VNZW51Q29udGV4dC5ldmVudDtcblxuXHRwcml2YXRlIF9hY3Rpb25SdW5uZXI6IE11bHRpcGxlU2VsZWN0aW9uQWN0aW9uUnVubmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9ob3ZlckRlbGVnYXRlOiBJSG92ZXJEZWxlZ2F0ZTtcblx0cHJpdmF0ZSBfaGFzQ2hlY2tib3g6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfcmVuZGVyZWRFbGVtZW50cyA9IG5ldyBNYXA8c3RyaW5nLCB7IG9yaWdpbmFsOiBJVHJlZU5vZGU8SVRyZWVJdGVtLCBGdXp6eVNjb3JlPjsgcmVuZGVyZWQ6IElUcmVlRXhwbG9yZXJUZW1wbGF0ZURhdGEgfVtdPigpOyAvLyB0cmVlIGl0ZW0gaGFuZGxlIHRvIHRlbXBsYXRlIGRhdGFcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHRyZWVWaWV3SWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIG1lbnVzOiBUcmVlTWVudXMsXG5cdFx0cHJpdmF0ZSBsYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdHByaXZhdGUgYWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogSUFjdGlvblZpZXdJdGVtUHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSBhbGlnbmVyOiBBbGlnbmVyLFxuXHRcdHByaXZhdGUgY2hlY2tib3hTdGF0ZUhhbmRsZXI6IENoZWNrYm94U3RhdGVIYW5kbGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWFudWFsbHlNYW5hZ2VDaGVja2JveGVzOiAoKSA9PiBib29sZWFuLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9ob3ZlckRlbGVnYXRlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSwgJ21vdXNlJywgdW5kZWZpbmVkLCB7fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkRmlsZUljb25UaGVtZUNoYW5nZSgoKSA9PiB0aGlzLnJlcmVuZGVyKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4gdGhpcy5yZXJlbmRlcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2hlY2tib3hTdGF0ZUhhbmRsZXIub25EaWRDaGFuZ2VDaGVja2JveFN0YXRlKGl0ZW1zID0+IHtcblx0XHRcdHRoaXMudXBkYXRlQ2hlY2tib3hlcyhpdGVtcyk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGUgPT4gdGhpcy5vbkRpZENoYW5nZUNvbnRleHQoZSkpKTtcblx0fVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFRyZWVSZW5kZXJlci5UUkVFX1RFTVBMQVRFX0lEO1xuXHR9XG5cblx0c2V0IGFjdGlvblJ1bm5lcihhY3Rpb25SdW5uZXI6IE11bHRpcGxlU2VsZWN0aW9uQWN0aW9uUnVubmVyKSB7XG5cdFx0dGhpcy5fYWN0aW9uUnVubmVyID0gYWN0aW9uUnVubmVyO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElUcmVlRXhwbG9yZXJUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjdXN0b20tdmlldy10cmVlLW5vZGUtaXRlbScpO1xuXG5cdFx0Y29uc3QgY2hlY2tib3hDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgRE9NLiQoJycpKTtcblx0XHRjb25zdCByZXNvdXJjZUxhYmVsID0gdGhpcy5sYWJlbHMuY3JlYXRlKGNvbnRhaW5lciwgeyBzdXBwb3J0SGlnaGxpZ2h0czogdHJ1ZSwgaG92ZXJEZWxlZ2F0ZTogdGhpcy5faG92ZXJEZWxlZ2F0ZSB9KTtcblx0XHRjb25zdCBpY29uID0gRE9NLnByZXBlbmQocmVzb3VyY2VMYWJlbC5lbGVtZW50LCBET00uJCgnLmN1c3RvbS12aWV3LXRyZWUtbm9kZS1pdGVtLWljb24nKSk7XG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IERPTS5hcHBlbmQocmVzb3VyY2VMYWJlbC5lbGVtZW50LCBET00uJCgnLmFjdGlvbnMnKSk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gbmV3IEFjdGlvbkJhcihhY3Rpb25zQ29udGFpbmVyLCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiB0aGlzLmFjdGlvblZpZXdJdGVtUHJvdmlkZXJcblx0XHR9KTtcblxuXHRcdHJldHVybiB7IHJlc291cmNlTGFiZWwsIGljb24sIGNoZWNrYm94Q29udGFpbmVyLCBhY3Rpb25CYXIsIGNvbnRhaW5lciB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRIb3ZlcihsYWJlbDogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkLCByZXNvdXJjZTogVVJJIHwgbnVsbCwgbm9kZTogSVRyZWVJdGVtKTogc3RyaW5nIHwgSU1hbmFnZWRIb3ZlclRvb2x0aXBNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCEobm9kZSBpbnN0YW5jZW9mIFJlc29sdmFibGVUcmVlSXRlbSkgfHwgIW5vZGUuaGFzUmVzb2x2ZSkge1xuXHRcdFx0aWYgKHJlc291cmNlICYmICFub2RlLnRvb2x0aXApIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0gZWxzZSBpZiAobm9kZS50b29sdGlwID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0aWYgKGlzTWFya2Rvd25TdHJpbmcobGFiZWwpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgbWFya2Rvd246IGxhYmVsLCBtYXJrZG93bk5vdFN1cHBvcnRlZEZhbGxiYWNrOiBsYWJlbC52YWx1ZSB9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBsYWJlbDtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICghaXNTdHJpbmcobm9kZS50b29sdGlwKSkge1xuXHRcdFx0XHRyZXR1cm4geyBtYXJrZG93bjogbm9kZS50b29sdGlwLCBtYXJrZG93bk5vdFN1cHBvcnRlZEZhbGxiYWNrOiByZXNvdXJjZSA/IHVuZGVmaW5lZCA6IHJlbmRlckFzUGxhaW50ZXh0KG5vZGUudG9vbHRpcCkgfTsgLy8gUGFzc2luZyB1bmRlZmluZWQgYXMgdGhlIGZhbGxiYWNrIGZvciBhIHJlc291cmNlIGZhbGxzIGJhY2sgdG8gdGhlIG9sZCBuYXRpdmUgaG92ZXJcblx0XHRcdH0gZWxzZSBpZiAobm9kZS50b29sdGlwICE9PSAnJykge1xuXHRcdFx0XHRyZXR1cm4gbm9kZS50b29sdGlwO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bWFya2Rvd246IHR5cGVvZiBub2RlLnRvb2x0aXAgPT09ICdzdHJpbmcnID8gbm9kZS50b29sdGlwIDpcblx0XHRcdFx0KHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SU1hcmtkb3duU3RyaW5nIHwgc3RyaW5nIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPElNYXJrZG93blN0cmluZyB8IHN0cmluZyB8IHVuZGVmaW5lZD4oKHJlc29sdmUpID0+IHtcblx0XHRcdFx0XHRcdG5vZGUucmVzb2x2ZSh0b2tlbikudGhlbigoKSA9PiByZXNvbHZlKG5vZGUudG9vbHRpcCkpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0bWFya2Rvd25Ob3RTdXBwb3J0ZWRGYWxsYmFjazogcmVzb3VyY2UgPyB1bmRlZmluZWQgOiAobGFiZWwgPyAoaXNNYXJrZG93blN0cmluZyhsYWJlbCkgPyBsYWJlbC52YWx1ZSA6IGxhYmVsKSA6ICcnKSAvLyBQYXNzaW5nIHVuZGVmaW5lZCBhcyB0aGUgZmFsbGJhY2sgZm9yIGEgcmVzb3VyY2UgZmFsbHMgYmFjayB0byB0aGUgb2xkIG5hdGl2ZSBob3ZlclxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHByb2Nlc3NMYWJlbChsYWJlbDogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkLCBtYXRjaGVzOiB7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyIH1bXSB8IHVuZGVmaW5lZCk6IHsgbGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDsgYm9sZD86IGJvb2xlYW47IGl0YWxpYz86IGJvb2xlYW47IHN0cmlrZXRocm91Z2g/OiBib29sZWFuOyBzdXBwb3J0SWNvbnM/OiBib29sZWFuIH0ge1xuXHRcdGlmICghaXNNYXJrZG93blN0cmluZyhsYWJlbCkpIHtcblx0XHRcdHJldHVybiB7IGxhYmVsIH07XG5cdFx0fVxuXG5cdFx0bGV0IHRleHQgPSBsYWJlbC52YWx1ZS50cmltKCk7XG5cdFx0bGV0IGJvbGQgPSBmYWxzZTtcblx0XHRsZXQgaXRhbGljID0gZmFsc2U7XG5cdFx0bGV0IHN0cmlrZXRocm91Z2ggPSBmYWxzZTtcblxuXHRcdGZ1bmN0aW9uIG1vdmVNYXRjaGVzKG9mZnNldDogbnVtYmVyKSB7XG5cdFx0XHRpZiAobWF0Y2hlcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcblx0XHRcdFx0XHRtYXRjaC5zdGFydCAtPSBvZmZzZXQ7XG5cdFx0XHRcdFx0bWF0Y2guZW5kIC09IG9mZnNldDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHN5bnRheGVzID0gW1xuXHRcdFx0eyBvcGVuOiAnfn4nLCBjbG9zZTogJ35+JywgbWFyazogKCkgPT4geyBzdHJpa2V0aHJvdWdoID0gdHJ1ZTsgfSB9LFxuXHRcdFx0eyBvcGVuOiAnKionLCBjbG9zZTogJyoqJywgbWFyazogKCkgPT4geyBib2xkID0gdHJ1ZTsgfSB9LFxuXHRcdFx0eyBvcGVuOiAnKicsIGNsb3NlOiAnKicsIG1hcms6ICgpID0+IHsgaXRhbGljID0gdHJ1ZTsgfSB9LFxuXHRcdFx0eyBvcGVuOiAnXycsIGNsb3NlOiAnXycsIG1hcms6ICgpID0+IHsgaXRhbGljID0gdHJ1ZTsgfSB9XG5cdFx0XTtcblxuXHRcdGZ1bmN0aW9uIGNoZWNrU3ludGF4ZXMoKTogYm9vbGVhbiB7XG5cdFx0XHRsZXQgZGlkQ2hhbmdlID0gZmFsc2U7XG5cdFx0XHRmb3IgKGNvbnN0IHN5bnRheCBvZiBzeW50YXhlcykge1xuXHRcdFx0XHRpZiAodGV4dC5zdGFydHNXaXRoKHN5bnRheC5vcGVuKSAmJiB0ZXh0LmVuZHNXaXRoKHN5bnRheC5jbG9zZSkpIHtcblx0XHRcdFx0XHQvLyBJZiB0aGVyZSBpcyBhIG1hdGNoIHdpdGhpbiB0aGUgbWFya2Vycywgc3RvcCBwcm9jZXNzaW5nXG5cdFx0XHRcdFx0aWYgKG1hdGNoZXM/LnNvbWUobWF0Y2ggPT4gbWF0Y2guc3RhcnQgPCBzeW50YXgub3Blbi5sZW5ndGggfHwgbWF0Y2guZW5kID4gdGV4dC5sZW5ndGggLSBzeW50YXguY2xvc2UubGVuZ3RoKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHN5bnRheC5tYXJrKCk7XG5cdFx0XHRcdFx0dGV4dCA9IHRleHQuc3Vic3RyaW5nKHN5bnRheC5vcGVuLmxlbmd0aCwgdGV4dC5sZW5ndGggLSBzeW50YXguY2xvc2UubGVuZ3RoKTtcblx0XHRcdFx0XHRtb3ZlTWF0Y2hlcyhzeW50YXgub3Blbi5sZW5ndGgpO1xuXHRcdFx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBkaWRDaGFuZ2U7XG5cdFx0fVxuXG5cdFx0Ly8gQXJiaXRyYXJ5IG1heCAjIG9mIGl0ZXJhdGlvbnNcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwOyBpKyspIHtcblx0XHRcdGlmICghY2hlY2tTeW50YXhlcygpKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogdGV4dCxcblx0XHRcdGJvbGQsXG5cdFx0XHRpdGFsaWMsXG5cdFx0XHRzdHJpa2V0aHJvdWdoLFxuXHRcdFx0c3VwcG9ydEljb25zOiBsYWJlbC5zdXBwb3J0VGhlbWVJY29uc1xuXHRcdH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxJVHJlZUl0ZW0sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElUcmVlRXhwbG9yZXJUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBub2RlID0gZWxlbWVudC5lbGVtZW50O1xuXHRcdGNvbnN0IHJlc291cmNlID0gbm9kZS5yZXNvdXJjZVVyaSA/IFVSSS5yZXZpdmUobm9kZS5yZXNvdXJjZVVyaSkgOiBudWxsO1xuXHRcdGNvbnN0IHRyZWVJdGVtTGFiZWw6IElUcmVlSXRlbUxhYmVsIHwgdW5kZWZpbmVkID0gbm9kZS5sYWJlbCA/IG5vZGUubGFiZWwgOiAocmVzb3VyY2UgPyB7IGxhYmVsOiBiYXNlbmFtZShyZXNvdXJjZSkgfSA6IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBpc1N0cmluZyhub2RlLmRlc2NyaXB0aW9uKSA/IG5vZGUuZGVzY3JpcHRpb24gOiByZXNvdXJjZSAmJiBub2RlLmRlc2NyaXB0aW9uID09PSB0cnVlID8gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZGlybmFtZShyZXNvdXJjZSksIHsgcmVsYXRpdmU6IHRydWUgfSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbGFiZWxTdHIgPSB0cmVlSXRlbUxhYmVsID8gaXNNYXJrZG93blN0cmluZyh0cmVlSXRlbUxhYmVsLmxhYmVsKSA/IHRyZWVJdGVtTGFiZWwubGFiZWwudmFsdWUgOiB0cmVlSXRlbUxhYmVsLmxhYmVsIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG1hdGNoZXMgPSAodHJlZUl0ZW1MYWJlbD8uaGlnaGxpZ2h0cyAmJiBsYWJlbFN0cikgPyB0cmVlSXRlbUxhYmVsLmhpZ2hsaWdodHMubWFwKChbc3RhcnQsIGVuZF0pID0+IHtcblx0XHRcdGlmIChzdGFydCA8IDApIHtcblx0XHRcdFx0c3RhcnQgPSBsYWJlbFN0ci5sZW5ndGggKyBzdGFydDtcblx0XHRcdH1cblx0XHRcdGlmIChlbmQgPCAwKSB7XG5cdFx0XHRcdGVuZCA9IGxhYmVsU3RyLmxlbmd0aCArIGVuZDtcblx0XHRcdH1cblx0XHRcdGlmICgoc3RhcnQgPj0gbGFiZWxTdHIubGVuZ3RoKSB8fCAoZW5kID4gbGFiZWxTdHIubGVuZ3RoKSkge1xuXHRcdFx0XHRyZXR1cm4gKHsgc3RhcnQ6IDAsIGVuZDogMCB9KTtcblx0XHRcdH1cblx0XHRcdGlmIChzdGFydCA+IGVuZCkge1xuXHRcdFx0XHRjb25zdCBzd2FwID0gc3RhcnQ7XG5cdFx0XHRcdHN0YXJ0ID0gZW5kO1xuXHRcdFx0XHRlbmQgPSBzd2FwO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICh7IHN0YXJ0LCBlbmQgfSk7XG5cdFx0fSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgeyBsYWJlbCwgYm9sZCwgaXRhbGljLCBzdHJpa2V0aHJvdWdoLCBzdXBwb3J0SWNvbnMgfSA9IHRoaXMucHJvY2Vzc0xhYmVsKHRyZWVJdGVtTGFiZWw/LmxhYmVsLCBtYXRjaGVzKTtcblx0XHRjb25zdCBpY29uID0gIWlzRGFyayh0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudHlwZSkgPyBub2RlLmljb24gOiBub2RlLmljb25EYXJrO1xuXHRcdGNvbnN0IGljb25VcmwgPSBpY29uID8gVVJJLnJldml2ZShpY29uKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCB0aXRsZSA9IHRoaXMuZ2V0SG92ZXIodHJlZUl0ZW1MYWJlbD8ubGFiZWwsIHJlc291cmNlLCBub2RlKTtcblxuXHRcdC8vIHJlc2V0XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdHRlbXBsYXRlRGF0YS5pY29uLnN0eWxlLmNvbG9yID0gJyc7XG5cblx0XHRsZXQgY29tbWFuZEVuYWJsZWQgPSB0cnVlO1xuXHRcdGlmIChub2RlLmNvbW1hbmQpIHtcblx0XHRcdGNvbW1hbmRFbmFibGVkID0gaXNUcmVlQ29tbWFuZEVuYWJsZWQobm9kZS5jb21tYW5kLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlckNoZWNrYm94KG5vZGUsIHRlbXBsYXRlRGF0YSk7XG5cblx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdGNvbnN0IGZpbGVEZWNvcmF0aW9ucyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyBjb2xvcnM6IGJvb2xlYW47IGJhZGdlczogYm9vbGVhbiB9PignZXhwbG9yZXIuZGVjb3JhdGlvbnMnKTtcblx0XHRcdGNvbnN0IGxhYmVsUmVzb3VyY2UgPSByZXNvdXJjZSA/IHJlc291cmNlIDogVVJJLnBhcnNlKCdtaXNzaW5nOl9pY29uX3Jlc291cmNlJyk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEucmVzb3VyY2VMYWJlbC5zZXRSZXNvdXJjZSh7IG5hbWU6IGxhYmVsLCBkZXNjcmlwdGlvbiwgcmVzb3VyY2U6IGxhYmVsUmVzb3VyY2UgfSwge1xuXHRcdFx0XHRmaWxlS2luZDogdGhpcy5nZXRGaWxlS2luZChub2RlKSxcblx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdGhpZGVJY29uOiB0aGlzLnNob3VsZEhpZGVSZXNvdXJjZUxhYmVsSWNvbihpY29uVXJsLCBub2RlLnRoZW1lSWNvbiksXG5cdFx0XHRcdGZpbGVEZWNvcmF0aW9ucyxcblx0XHRcdFx0ZXh0cmFDbGFzc2VzOiBbJ2N1c3RvbS12aWV3LXRyZWUtbm9kZS1pdGVtLXJlc291cmNlTGFiZWwnXSxcblx0XHRcdFx0bWF0Y2hlczogbWF0Y2hlcyA/IG1hdGNoZXMgOiBjcmVhdGVNYXRjaGVzKGVsZW1lbnQuZmlsdGVyRGF0YSksXG5cdFx0XHRcdGJvbGQsXG5cdFx0XHRcdGl0YWxpYyxcblx0XHRcdFx0c3RyaWtldGhyb3VnaCxcblx0XHRcdFx0ZGlzYWJsZWRDb21tYW5kOiAhY29tbWFuZEVuYWJsZWQsXG5cdFx0XHRcdGxhYmVsRXNjYXBlTmV3TGluZXM6IHRydWUsXG5cdFx0XHRcdGZvcmNlTGFiZWw6ICEhbm9kZS5sYWJlbCxcblx0XHRcdFx0c3VwcG9ydEljb25zXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLnJlc291cmNlTGFiZWwuc2V0UmVzb3VyY2UoeyBuYW1lOiBsYWJlbCwgZGVzY3JpcHRpb24gfSwge1xuXHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0aGlkZUljb246IHRydWUsXG5cdFx0XHRcdGV4dHJhQ2xhc3NlczogWydjdXN0b20tdmlldy10cmVlLW5vZGUtaXRlbS1yZXNvdXJjZUxhYmVsJ10sXG5cdFx0XHRcdG1hdGNoZXM6IG1hdGNoZXMgPyBtYXRjaGVzIDogY3JlYXRlTWF0Y2hlcyhlbGVtZW50LmZpbHRlckRhdGEpLFxuXHRcdFx0XHRib2xkLFxuXHRcdFx0XHRpdGFsaWMsXG5cdFx0XHRcdHN0cmlrZXRocm91Z2gsXG5cdFx0XHRcdGRpc2FibGVkQ29tbWFuZDogIWNvbW1hbmRFbmFibGVkLFxuXHRcdFx0XHRsYWJlbEVzY2FwZU5ld0xpbmVzOiB0cnVlLFxuXHRcdFx0XHRzdXBwb3J0SWNvbnNcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChpY29uVXJsKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuaWNvbi5jbGFzc05hbWUgPSAnY3VzdG9tLXZpZXctdHJlZS1ub2RlLWl0ZW0taWNvbic7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuaWNvbi5zdHlsZS5iYWNrZ3JvdW5kSW1hZ2UgPSBjc3NKcy5hc0NTU1VybChpY29uVXJsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IGljb25DbGFzczogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRoaXMuc2hvdWxkU2hvd1RoZW1lSWNvbighIXJlc291cmNlLCBub2RlLnRoZW1lSWNvbikpIHtcblx0XHRcdFx0aWNvbkNsYXNzID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKG5vZGUudGhlbWVJY29uKTtcblx0XHRcdFx0aWYgKG5vZGUudGhlbWVJY29uLmNvbG9yKSB7XG5cdFx0XHRcdFx0dGVtcGxhdGVEYXRhLmljb24uc3R5bGUuY29sb3IgPSB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkuZ2V0Q29sb3Iobm9kZS50aGVtZUljb24uY29sb3IuaWQpPy50b1N0cmluZygpID8/ICcnO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGljb25DbGFzcyA9IGljb25DbGFzcyArICcgY29kaWNvbi1jb2xvcmVkJztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NOYW1lID0gaWNvbkNsYXNzID8gYGN1c3RvbS12aWV3LXRyZWUtbm9kZS1pdGVtLWljb24gJHtpY29uQ2xhc3N9YCA6ICcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmljb24uc3R5bGUuYmFja2dyb3VuZEltYWdlID0gJyc7XG5cdFx0fVxuXG5cdFx0aWYgKCFjb21tYW5kRW5hYmxlZCkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NOYW1lID0gdGVtcGxhdGVEYXRhLmljb24uY2xhc3NOYW1lICsgJyBkaXNhYmxlZCc7XG5cdFx0XHRpZiAodGVtcGxhdGVEYXRhLmNvbnRhaW5lci5wYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIucGFyZW50RWxlbWVudC5jbGFzc05hbWUgPSB0ZW1wbGF0ZURhdGEuY29udGFpbmVyLnBhcmVudEVsZW1lbnQuY2xhc3NOYW1lICsgJyBkaXNhYmxlZCc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jb250ZXh0ID0geyAkdHJlZVZpZXdJZDogdGhpcy50cmVlVmlld0lkLCAkdHJlZUl0ZW1IYW5kbGU6IG5vZGUuaGFuZGxlIH0gc2F0aXNmaWVzIFRyZWVWaWV3SXRlbUhhbmRsZUFyZztcblxuXHRcdGNvbnN0IG1lbnVBY3Rpb25zID0gdGhpcy5tZW51cy5nZXRSZXNvdXJjZUFjdGlvbnMoW25vZGVdKTtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnB1c2gobWVudUFjdGlvbnMsIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXG5cdFx0Ly8gQXNzb2NpYXRlIHRoZSBpbmxpbmUgdG9vbGJhciB3aXRoIHRoZSB0cmVlIGl0ZW0gc28gc2NyZWVuIHJlYWRlcnNcblx0XHQvLyBhbm5vdW5jZSB3aGljaCBpdGVtIHRoZSBhY3Rpb25zIGJlbG9uZyB0byB3aGVuIGZvY3VzIG1vdmVzIHRvIHRoZW0uXG5cdFx0aWYgKG1lbnVBY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGl0ZW1OYW1lID0gW2xhYmVsLCBkZXNjcmlwdGlvbl0uZmlsdGVyKChwYXJ0KTogcGFydCBpcyBzdHJpbmcgPT4gISFwYXJ0KS5qb2luKCcgJykudHJpbSgpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5zZXRBcmlhTGFiZWwoaXRlbU5hbWUgPyBsb2NhbGl6ZSgndHJlZUFjdGlvbkJhckFyaWFMYWJlbCcsIFwiQWN0aW9ucyBmb3IgezB9XCIsIGl0ZW1OYW1lKSA6IGxvY2FsaXplKCd0cmVlQWN0aW9uQmFyQXJpYUxhYmVsTm9OYW1lJywgXCJBY3Rpb25zXCIpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5zZXRBcmlhTGFiZWwoJycpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9hY3Rpb25SdW5uZXIpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuYWN0aW9uUnVubmVyID0gdGhpcy5fYWN0aW9uUnVubmVyO1xuXHRcdH1cblx0XHR0aGlzLnNldEFsaWdubWVudCh0ZW1wbGF0ZURhdGEuY29udGFpbmVyLCBub2RlKTtcblxuXHRcdC8vIHJlbWVtYmVyIHJlbmRlcmVkIGVsZW1lbnQsIGFuIGVsZW1lbnQgY2FuIGJlIHJlbmRlcmVkIG11bHRpcGxlIHRpbWVzXG5cdFx0Y29uc3QgcmVuZGVyZWRJdGVtcyA9IHRoaXMuX3JlbmRlcmVkRWxlbWVudHMuZ2V0KGVsZW1lbnQuZWxlbWVudC5oYW5kbGUpID8/IFtdO1xuXHRcdHRoaXMuX3JlbmRlcmVkRWxlbWVudHMuc2V0KGVsZW1lbnQuZWxlbWVudC5oYW5kbGUsIFsuLi5yZW5kZXJlZEl0ZW1zLCB7IG9yaWdpbmFsOiBlbGVtZW50LCByZW5kZXJlZDogdGVtcGxhdGVEYXRhIH1dKTtcblx0fVxuXG5cdHByaXZhdGUgcmVyZW5kZXIoKSB7XG5cdFx0Ly8gQXMgd2UgYWRkIGl0ZW1zIHRvIHRoZSBtYXAgZHVyaW5nIHRoaXMgY2FsbCB3ZSBjYW4ndCBkaXJlY3RseSB1c2UgdGhlIG1hcCBpbiB0aGUgZm9yIGxvb3Bcblx0XHQvLyBidXQgaGF2ZSB0byBjcmVhdGUgYSBjb3B5IG9mIHRoZSBrZXlzIGZpcnN0XG5cdFx0Y29uc3Qga2V5cyA9IG5ldyBTZXQodGhpcy5fcmVuZGVyZWRFbGVtZW50cy5rZXlzKCkpO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcblx0XHRcdGNvbnN0IHZhbHVlcyA9IHRoaXMuX3JlbmRlcmVkRWxlbWVudHMuZ2V0KGtleSkgPz8gW107XG5cdFx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2VFbGVtZW50KHZhbHVlLm9yaWdpbmFsLCAwLCB2YWx1ZS5yZW5kZXJlZCk7XG5cdFx0XHRcdHRoaXMucmVuZGVyRWxlbWVudCh2YWx1ZS5vcmlnaW5hbCwgMCwgdmFsdWUucmVuZGVyZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ2hlY2tib3gobm9kZTogSVRyZWVJdGVtLCB0ZW1wbGF0ZURhdGE6IElUcmVlRXhwbG9yZXJUZW1wbGF0ZURhdGEpIHtcblx0XHRpZiAobm9kZS5jaGVja2JveCkge1xuXHRcdFx0Ly8gVGhlIGZpcnN0IHRpbWUgd2UgZmluZCBhIGNoZWNrYm94IHdlIHdhbnQgdG8gcmVyZW5kZXIgdGhlIHZpc2libGUgdHJlZSB0byBhZGFwdCB0aGUgYWxpZ25tZW50XG5cdFx0XHRpZiAoIXRoaXMuX2hhc0NoZWNrYm94KSB7XG5cdFx0XHRcdHRoaXMuX2hhc0NoZWNrYm94ID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5yZXJlbmRlcigpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0ZW1wbGF0ZURhdGEuY2hlY2tib3gpIHtcblx0XHRcdFx0Y29uc3QgY2hlY2tib3ggPSBuZXcgVHJlZUl0ZW1DaGVja2JveCh0ZW1wbGF0ZURhdGEuY2hlY2tib3hDb250YWluZXIsIHRoaXMuY2hlY2tib3hTdGF0ZUhhbmRsZXIsIHRoaXMuX2hvdmVyRGVsZWdhdGUsIHRoaXMuaG92ZXJTZXJ2aWNlKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmNoZWNrYm94ID0gY2hlY2tib3g7XG5cdFx0XHR9XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY2hlY2tib3gucmVuZGVyKG5vZGUpO1xuXHRcdH0gZWxzZSBpZiAodGVtcGxhdGVEYXRhLmNoZWNrYm94KSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY2hlY2tib3guZGlzcG9zZSgpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNoZWNrYm94ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0QWxpZ25tZW50KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRyZWVJdGVtOiBJVHJlZUl0ZW0pIHtcblx0XHRjb250YWluZXIucGFyZW50RWxlbWVudCEuY2xhc3NMaXN0LnRvZ2dsZSgnYWxpZ24taWNvbi13aXRoLXR3aXN0eScsIHRoaXMuYWxpZ25lci5hbGlnbkljb25XaXRoVHdpc3R5KHRyZWVJdGVtKSk7XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZEhpZGVSZXNvdXJjZUxhYmVsSWNvbihpY29uVXJsOiBVUkkgfCB1bmRlZmluZWQsIGljb246IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdC8vIFdlIGFsd2F5cyBoaWRlIHRoZSByZXNvdXJjZSBsYWJlbCBpbiBmYXZvciBvZiB0aGUgaWNvblVybCB3aGVuIGl0J3MgcHJvdmlkZWQuXG5cdFx0Ly8gV2hlbiBgVGhlbWVJY29uYCBpcyBwcm92aWRlZCwgd2UgaGlkZSB0aGUgcmVzb3VyY2UgbGFiZWwgaWNvbiBpbiBmYXZvciBvZiBpdCBvbmx5IGlmIGl0J3MgYSBub3QgYSBmaWxlIGljb24uXG5cdFx0cmV0dXJuICghIWljb25VcmwgfHwgKCEhaWNvbiAmJiAhdGhpcy5pc0ZpbGVLaW5kVGhlbWVJY29uKGljb24pKSk7XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZFNob3dUaGVtZUljb24oaGFzUmVzb3VyY2U6IGJvb2xlYW4sIGljb246IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCk6IGljb24gaXMgVGhlbWVJY29uIHtcblx0XHRpZiAoIWljb24pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGVyZSdzIGEgcmVzb3VyY2UgYW5kIHRoZSBpY29uIGlzIGEgZmlsZSBpY29uLCB0aGVuIHRoZSBpY29uIChvciBsYWNrIHRoZXJlb2YpIHdpbGwgYWxyZWFkeSBiZSBjb21pbmcgZnJvbSB0aGVcblx0XHQvLyBpY29uIHRoZW1lIGFuZCBzaG91bGQgdXNlIHdoYXRldmVyIHRoZSBpY29uIHRoZW1lIGhhcyBwcm92aWRlZC5cblx0XHRyZXR1cm4gIShoYXNSZXNvdXJjZSAmJiB0aGlzLmlzRmlsZUtpbmRUaGVtZUljb24oaWNvbikpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0ZpbGVLaW5kVGhlbWVJY29uKGljb246IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBUaGVtZUljb24uaXNGaWxlKGljb24pIHx8IFRoZW1lSWNvbi5pc0ZvbGRlcihpY29uKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RmlsZUtpbmQobm9kZTogSVRyZWVJdGVtKTogRmlsZUtpbmQge1xuXHRcdGlmIChub2RlLnRoZW1lSWNvbikge1xuXHRcdFx0c3dpdGNoIChub2RlLnRoZW1lSWNvbi5pZCkge1xuXHRcdFx0XHRjYXNlIEZpbGVUaGVtZUljb24uaWQ6XG5cdFx0XHRcdFx0cmV0dXJuIEZpbGVLaW5kLkZJTEU7XG5cdFx0XHRcdGNhc2UgRm9sZGVyVGhlbWVJY29uLmlkOlxuXHRcdFx0XHRcdHJldHVybiBGaWxlS2luZC5GT0xERVI7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBub2RlLmNvbGxhcHNpYmxlU3RhdGUgPT09IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWQgfHwgbm9kZS5jb2xsYXBzaWJsZVN0YXRlID09PSBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuRXhwYW5kZWQgPyBGaWxlS2luZC5GT0xERVIgOiBGaWxlS2luZC5GSUxFO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUNvbnRleHQoZTogSUNvbnRleHRLZXlDaGFuZ2VFdmVudCkge1xuXHRcdGNvbnN0IGFmZmVjdHNFbnRpcmVNZW51Q29udGV4dHMgPSBlLmFmZmVjdHNTb21lKHRoaXMubWVudXMuZ2V0RW50aXJlTWVudUNvbnRleHRzKCkpO1xuXG5cdFx0Y29uc3QgaXRlbXM6IElUcmVlSXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbXywgZWxlbWVudHNdIG9mIHRoaXMuX3JlbmRlcmVkRWxlbWVudHMpIHtcblx0XHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiBlbGVtZW50cykge1xuXHRcdFx0XHRpZiAoYWZmZWN0c0VudGlyZU1lbnVDb250ZXh0cyB8fCBlLmFmZmVjdHNTb21lKHRoaXMubWVudXMuZ2V0RWxlbWVudE92ZXJsYXlDb250ZXh0cyhlbGVtZW50Lm9yaWdpbmFsLmVsZW1lbnQpKSkge1xuXHRcdFx0XHRcdGl0ZW1zLnB1c2goZWxlbWVudC5vcmlnaW5hbC5lbGVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoaXRlbXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZU1lbnVDb250ZXh0LmZpcmUoaXRlbXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ2hlY2tib3hlcyhpdGVtczogSVRyZWVJdGVtW10pIHtcblx0XHRsZXQgYWxsSXRlbXM6IElUcmVlSXRlbVtdID0gW107XG5cblx0XHRpZiAoIXRoaXMubWFudWFsbHlNYW5hZ2VDaGVja2JveGVzKCkpIHtcblx0XHRcdGFsbEl0ZW1zID0gc2V0Q2FzY2FkaW5nQ2hlY2tib3hVcGRhdGVzKGl0ZW1zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YWxsSXRlbXMgPSBpdGVtcztcblx0XHR9XG5cblx0XHRhbGxJdGVtcy5mb3JFYWNoKGl0ZW0gPT4ge1xuXHRcdFx0Y29uc3QgcmVuZGVyZWRJdGVtcyA9IHRoaXMuX3JlbmRlcmVkRWxlbWVudHMuZ2V0KGl0ZW0uaGFuZGxlKTtcblx0XHRcdGlmIChyZW5kZXJlZEl0ZW1zKSB7XG5cdFx0XHRcdHJlbmRlcmVkSXRlbXMuZm9yRWFjaChyZW5kZXJlZEl0ZW1zID0+IHJlbmRlcmVkSXRlbXMucmVuZGVyZWQuY2hlY2tib3g/LnJlbmRlcihpdGVtKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDaGVja2JveFN0YXRlLmZpcmUoYWxsSXRlbXMpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQocmVzb3VyY2U6IElUcmVlTm9kZTxJVHJlZUl0ZW0sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElUcmVlRXhwbG9yZXJUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBpdGVtUmVuZGVycyA9IHRoaXMuX3JlbmRlcmVkRWxlbWVudHMuZ2V0KHJlc291cmNlLmVsZW1lbnQuaGFuZGxlKSA/PyBbXTtcblx0XHRjb25zdCByZW5kZXJlZEluZGV4ID0gaXRlbVJlbmRlcnMuZmluZEluZGV4KHJlbmRlcmVkSXRlbSA9PiB0ZW1wbGF0ZURhdGEgPT09IHJlbmRlcmVkSXRlbS5yZW5kZXJlZCk7XG5cblx0XHRpZiAoaXRlbVJlbmRlcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJlZEVsZW1lbnRzLmRlbGV0ZShyZXNvdXJjZS5lbGVtZW50LmhhbmRsZSk7XG5cdFx0fSBlbHNlIGlmIChpdGVtUmVuZGVycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRpdGVtUmVuZGVycy5zcGxpY2UocmVuZGVyZWRJbmRleCwgMSk7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLmNoZWNrYm94Py5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmNoZWNrYm94ID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVRyZWVFeHBsb3JlclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5yZXNvdXJjZUxhYmVsLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBBbGlnbmVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX3RyZWU6IFdvcmtiZW5jaEFzeW5jRGF0YVRyZWU8SVRyZWVJdGVtLCBJVHJlZUl0ZW0sIEZ1enp5U2NvcmU+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLCBwcml2YXRlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHNldCB0cmVlKHRyZWU6IFdvcmtiZW5jaEFzeW5jRGF0YVRyZWU8SVRyZWVJdGVtLCBJVHJlZUl0ZW0sIEZ1enp5U2NvcmU+KSB7XG5cdFx0dGhpcy5fdHJlZSA9IHRyZWU7XG5cdH1cblxuXHRwdWJsaWMgYWxpZ25JY29uV2l0aFR3aXN0eSh0cmVlSXRlbTogSVRyZWVJdGVtKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRyZWVJdGVtLmNvbGxhcHNpYmxlU3RhdGUgIT09IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5oYXNJY29uT3JDaGVja2JveCh0cmVlSXRlbSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fdHJlZSkge1xuXHRcdFx0Y29uc3Qgcm9vdCA9IHRoaXMuX3RyZWUuZ2V0SW5wdXQoKTtcblx0XHRcdGxldCBwYXJlbnQ6IElUcmVlSXRlbTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHBhcmVudCA9IHRoaXMuX3RyZWUuZ2V0UGFyZW50RWxlbWVudCh0cmVlSXRlbSkgfHwgcm9vdDtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW1RyZWVWaWV3XSBGYWlsZWQgdG8gcmVzb2x2ZSBwYXJlbnQgZm9yICR7dHJlZUl0ZW0uaGFuZGxlfWAsIGVycm9yKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuaGFzSWNvbk9yQ2hlY2tib3gocGFyZW50KSkge1xuXHRcdFx0XHRyZXR1cm4gISFwYXJlbnQuY2hpbGRyZW4gJiYgcGFyZW50LmNoaWxkcmVuLnNvbWUoYyA9PiBjLmNvbGxhcHNpYmxlU3RhdGUgIT09IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lICYmICF0aGlzLmhhc0ljb25PckNoZWNrYm94KGMpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiAhIXBhcmVudC5jaGlsZHJlbiAmJiBwYXJlbnQuY2hpbGRyZW4uZXZlcnkoYyA9PiBjLmNvbGxhcHNpYmxlU3RhdGUgPT09IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lIHx8ICF0aGlzLmhhc0ljb25PckNoZWNrYm94KGMpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFzSWNvbk9yQ2hlY2tib3gobm9kZTogSVRyZWVJdGVtKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaGFzSWNvbihub2RlKSB8fCAhIW5vZGUuY2hlY2tib3g7XG5cdH1cblxuXHRwcml2YXRlIGhhc0ljb24obm9kZTogSVRyZWVJdGVtKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaWNvbiA9ICFpc0RhcmsodGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLnR5cGUpID8gbm9kZS5pY29uIDogbm9kZS5pY29uRGFyaztcblx0XHRpZiAoaWNvbikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdC8vIGBmaWxlYCBhbmQgYGZvbGRlcmAgVGhlbWVJY29ucyBkZWZlciB0byB0aGUgZmlsZSBpY29uIHRoZW1lIG9ubHkgd2hlbiB0aGUgaXRlbSBoYXMgYSByZXNvdXJjZS5cblx0XHQvLyBBbnkgb3RoZXIgVGhlbWVJY29uLCBvciBhIGBmaWxlYC9gZm9sZGVyYCBUaGVtZUljb24gb24gYW4gaXRlbSB3aXRob3V0IGEgcmVzb3VyY2UsIGlzIGFsd2F5c1xuXHRcdC8vIHJlbmRlcmVkIGFzIGEgY29kaWNvbiBhbmQgdGhlcmVmb3JlIGFsd2F5cyBoYXMgYW4gaWNvbiByZWdhcmRsZXNzIG9mIHRoZSBmaWxlIGljb24gdGhlbWUuXG5cdFx0aWYgKG5vZGUudGhlbWVJY29uICYmICghbm9kZS5yZXNvdXJjZVVyaSB8fCAobm9kZS50aGVtZUljb24uaWQgIT09IEZpbGVUaGVtZUljb24uaWQgJiYgbm9kZS50aGVtZUljb24uaWQgIT09IEZvbGRlclRoZW1lSWNvbi5pZCkpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKG5vZGUucmVzb3VyY2VVcmkgfHwgbm9kZS50aGVtZUljb24pIHtcblx0XHRcdGNvbnN0IGZpbGVJY29uVGhlbWUgPSB0aGlzLnRoZW1lU2VydmljZS5nZXRGaWxlSWNvblRoZW1lKCk7XG5cdFx0XHRjb25zdCBpc0ZvbGRlciA9IG5vZGUudGhlbWVJY29uID8gbm9kZS50aGVtZUljb24uaWQgPT09IEZvbGRlclRoZW1lSWNvbi5pZCA6IG5vZGUuY29sbGFwc2libGVTdGF0ZSAhPT0gVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLk5vbmU7XG5cdFx0XHRpZiAoaXNGb2xkZXIpIHtcblx0XHRcdFx0cmV0dXJuIGZpbGVJY29uVGhlbWUuaGFzRmlsZUljb25zICYmIGZpbGVJY29uVGhlbWUuaGFzRm9sZGVySWNvbnM7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmlsZUljb25UaGVtZS5oYXNGaWxlSWNvbnM7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5jbGFzcyBNdWx0aXBsZVNlbGVjdGlvbkFjdGlvblJ1bm5lciBleHRlbmRzIEFjdGlvblJ1bm5lciB7XG5cblx0Y29uc3RydWN0b3Iobm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsIHByaXZhdGUgZ2V0U2VsZWN0ZWRSZXNvdXJjZXM6ICgoKSA9PiBJVHJlZUl0ZW1bXSkpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRSdW4oZSA9PiB7XG5cdFx0XHRpZiAoZS5lcnJvciAmJiAhaXNDYW5jZWxsYXRpb25FcnJvcihlLmVycm9yKSkge1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdjb21tYW5kLWVycm9yJywgJ0Vycm9yIHJ1bm5pbmcgY29tbWFuZCB7MX06IHswfS4gVGhpcyBpcyBsaWtlbHkgY2F1c2VkIGJ5IHRoZSBleHRlbnNpb24gdGhhdCBjb250cmlidXRlcyB7MX0uJywgZS5lcnJvci5tZXNzYWdlLCBlLmFjdGlvbi5pZCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBydW5BY3Rpb24oYWN0aW9uOiBJQWN0aW9uLCBjb250ZXh0OiBUcmVlVmlld0l0ZW1IYW5kbGVBcmcgfCBUcmVlVmlld1BhbmVIYW5kbGVBcmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLmdldFNlbGVjdGVkUmVzb3VyY2VzKCk7XG5cdFx0bGV0IHNlbGVjdGlvbkhhbmRsZUFyZ3M6IFRyZWVWaWV3SXRlbUhhbmRsZUFyZ1tdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBhY3Rpb25JblNlbGVjdGVkOiBib29sZWFuID0gZmFsc2U7XG5cdFx0aWYgKHNlbGVjdGlvbi5sZW5ndGggPiAxKSB7XG5cdFx0XHRzZWxlY3Rpb25IYW5kbGVBcmdzID0gc2VsZWN0aW9uLm1hcChzZWxlY3RlZCA9PiB7XG5cdFx0XHRcdGlmICgoc2VsZWN0ZWQuaGFuZGxlID09PSAoY29udGV4dCBhcyBUcmVlVmlld0l0ZW1IYW5kbGVBcmcpLiR0cmVlSXRlbUhhbmRsZSkgfHwgKGNvbnRleHQgYXMgVHJlZVZpZXdQYW5lSGFuZGxlQXJnKS4kc2VsZWN0ZWRUcmVlSXRlbXMpIHtcblx0XHRcdFx0XHRhY3Rpb25JblNlbGVjdGVkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyAkdHJlZVZpZXdJZDogY29udGV4dC4kdHJlZVZpZXdJZCwgJHRyZWVJdGVtSGFuZGxlOiBzZWxlY3RlZC5oYW5kbGUgfTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmICghYWN0aW9uSW5TZWxlY3RlZCAmJiBzZWxlY3Rpb25IYW5kbGVBcmdzKSB7XG5cdFx0XHRzZWxlY3Rpb25IYW5kbGVBcmdzID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGF3YWl0IGFjdGlvbi5ydW4oY29udGV4dCwgc2VsZWN0aW9uSGFuZGxlQXJncyk7XG5cdH1cbn1cblxuY2xhc3MgVHJlZU1lbnVzIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXHRwcml2YXRlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8SVRyZWVJdGVtPigpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGlkOiBzdHJpbmcsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2Vcblx0KSB7IH1cblxuXHQvKipcblx0ICogR2V0cyBvbmx5IHRoZSBhY3Rpb25zIHRoYXQgYXBwbHkgdG8gYWxsIG9mIHRoZSBnaXZlbiBlbGVtZW50cy5cblx0ICovXG5cdGdldFJlc291cmNlQWN0aW9ucyhlbGVtZW50czogSVRyZWVJdGVtW10pOiBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLmdldEFjdGlvbnModGhpcy5nZXRNZW51SWQoKSwgZWxlbWVudHMpO1xuXHRcdHJldHVybiBhY3Rpb25zLnByaW1hcnk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyBvbmx5IHRoZSBhY3Rpb25zIHRoYXQgYXBwbHkgdG8gYWxsIG9mIHRoZSBnaXZlbiBlbGVtZW50cy5cblx0ICovXG5cdGdldFJlc291cmNlQ29udGV4dEFjdGlvbnMoZWxlbWVudHM6IElUcmVlSXRlbVtdKTogSUFjdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRBY3Rpb25zKHRoaXMuZ2V0TWVudUlkKCksIGVsZW1lbnRzKS5zZWNvbmRhcnk7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q29udGV4dEtleVNlcnZpY2Uoc2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlKSB7XG5cdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZSA9IHNlcnZpY2U7XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlck5vblVuaXZlcnNhbEFjdGlvbnMoZ3JvdXBzOiBNYXA8c3RyaW5nLCBJQWN0aW9uPltdLCBuZXdBY3Rpb25zOiBJQWN0aW9uW10pIHtcblx0XHRjb25zdCBuZXdBY3Rpb25zU2V0OiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQobmV3QWN0aW9ucy5tYXAoYSA9PiBhLmlkKSk7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBncm91cC5rZXlzKCk7XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG5cdFx0XHRcdGlmICghbmV3QWN0aW9uc1NldC5oYXMoYWN0aW9uKSkge1xuXHRcdFx0XHRcdGdyb3VwLmRlbGV0ZShhY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBidWlsZE1lbnUoZ3JvdXBzOiBNYXA8c3RyaW5nLCBJQWN0aW9uPltdKTogSUFjdGlvbltdIHtcblx0XHRjb25zdCByZXN1bHQ6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG5cdFx0XHRpZiAoZ3JvdXAuc2l6ZSA+IDApIHtcblx0XHRcdFx0aWYgKHJlc3VsdC5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdC5wdXNoKC4uLmdyb3VwLnZhbHVlcygpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlR3JvdXBzKGFjdGlvbnM6IElBY3Rpb25bXSk6IE1hcDxzdHJpbmcsIElBY3Rpb24+W10ge1xuXHRcdGNvbnN0IGdyb3VwczogTWFwPHN0cmluZywgSUFjdGlvbj5bXSA9IFtdO1xuXHRcdGxldCBncm91cDogTWFwPHN0cmluZywgSUFjdGlvbj4gPSBuZXcgTWFwKCk7XG5cdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIFNlcGFyYXRvcikge1xuXHRcdFx0XHRncm91cHMucHVzaChncm91cCk7XG5cdFx0XHRcdGdyb3VwID0gbmV3IE1hcCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Z3JvdXAuc2V0KGFjdGlvbi5pZCwgYWN0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Z3JvdXBzLnB1c2goZ3JvdXApO1xuXHRcdHJldHVybiBncm91cHM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RWxlbWVudE92ZXJsYXlDb250ZXh0cyhlbGVtZW50OiBJVHJlZUl0ZW0pOiBNYXA8c3RyaW5nLCB1bmtub3duPiB7XG5cdFx0cmV0dXJuIG5ldyBNYXAoW1xuXHRcdFx0Wyd2aWV3JywgdGhpcy5pZF0sXG5cdFx0XHRbJ3ZpZXdJdGVtJywgZWxlbWVudC5jb250ZXh0VmFsdWVdXG5cdFx0XSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RW50aXJlTWVudUNvbnRleHRzKCk6IFJlYWRvbmx5U2V0PHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLm1lbnVTZXJ2aWNlLmdldE1lbnVDb250ZXh0cyh0aGlzLmdldE1lbnVJZCgpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRNZW51SWQoKTogTWVudUlkIHtcblx0XHRyZXR1cm4gTWVudUlkLlZpZXdJdGVtQ29udGV4dDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aW9ucyhtZW51SWQ6IE1lbnVJZCwgZWxlbWVudHM6IElUcmVlSXRlbVtdKTogeyBwcmltYXJ5OiBJQWN0aW9uW107IHNlY29uZGFyeTogSUFjdGlvbltdIH0ge1xuXHRcdGlmICghdGhpcy5jb250ZXh0S2V5U2VydmljZSkge1xuXHRcdFx0cmV0dXJuIHsgcHJpbWFyeTogW10sIHNlY29uZGFyeTogW10gfTtcblx0XHR9XG5cblx0XHRsZXQgcHJpbWFyeUdyb3VwczogTWFwPHN0cmluZywgSUFjdGlvbj5bXSA9IFtdO1xuXHRcdGxldCBzZWNvbmRhcnlHcm91cHM6IE1hcDxzdHJpbmcsIElBY3Rpb24+W10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gZWxlbWVudHNbaV07XG5cdFx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlT3ZlcmxheSh0aGlzLmdldEVsZW1lbnRPdmVybGF5Q29udGV4dHMoZWxlbWVudCkpO1xuXG5cdFx0XHRjb25zdCBtZW51RGF0YSA9IHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMobWVudUlkLCBjb250ZXh0S2V5U2VydmljZSwgeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0Q29udGV4dE1lbnVBY3Rpb25zKG1lbnVEYXRhLCAnaW5saW5lJyk7XG5cdFx0XHRpZiAoaSA9PT0gMCkge1xuXHRcdFx0XHRwcmltYXJ5R3JvdXBzID0gdGhpcy5jcmVhdGVHcm91cHMocmVzdWx0LnByaW1hcnkpO1xuXHRcdFx0XHRzZWNvbmRhcnlHcm91cHMgPSB0aGlzLmNyZWF0ZUdyb3VwcyhyZXN1bHQuc2Vjb25kYXJ5KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZmlsdGVyTm9uVW5pdmVyc2FsQWN0aW9ucyhwcmltYXJ5R3JvdXBzLCByZXN1bHQucHJpbWFyeSk7XG5cdFx0XHRcdHRoaXMuZmlsdGVyTm9uVW5pdmVyc2FsQWN0aW9ucyhzZWNvbmRhcnlHcm91cHMsIHJlc3VsdC5zZWNvbmRhcnkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IHByaW1hcnk6IHRoaXMuYnVpbGRNZW51KHByaW1hcnlHcm91cHMpLCBzZWNvbmRhcnk6IHRoaXMuYnVpbGRNZW51KHNlY29uZGFyeUdyb3VwcykgfTtcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEN1c3RvbVRyZWVWaWV3IGV4dGVuZHMgQWJzdHJhY3RUcmVlVmlldyB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHR0aXRsZTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uSWQ6IHN0cmluZyxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJQWN0aXZpdHlTZXJ2aWNlIGFjdGl2aXR5U2VydmljZTogSUFjdGl2aXR5U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoaWQsIHRpdGxlLCB0aGVtZVNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb21tYW5kU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHByb2dyZXNzU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBob3ZlclNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBhY3Rpdml0eVNlcnZpY2UsIGxvZ1NlcnZpY2UsIG9wZW5lclNlcnZpY2UsIG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhY3RpdmF0ZSgpIHtcblx0XHRpZiAoIXRoaXMuYWN0aXZhdGVkKSB7XG5cdFx0XHR0eXBlIEV4dGVuc2lvblZpZXdUZWxlbWV0cnkgPSB7XG5cdFx0XHRcdGV4dGVuc2lvbklkOiBUZWxlbWV0cnlUcnVzdGVkVmFsdWU8c3RyaW5nPjtcblx0XHRcdFx0aWQ6IHN0cmluZztcblx0XHRcdH07XG5cdFx0XHR0eXBlIEV4dGVuc2lvblZpZXdUZWxlbWV0cnlNZXRhID0ge1xuXHRcdFx0XHRleHRlbnNpb25JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0lkIG9mIHRoZSBleHRlbnNpb24nIH07XG5cdFx0XHRcdGlkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSWQgb2YgdGhlIHZpZXcnIH07XG5cdFx0XHRcdG93bmVyOiAnZGlnaXRhcmFsZCc7XG5cdFx0XHRcdGNvbW1lbnQ6ICdIZWxwcyB0byBnYWluIGluc2lnaHRzIG9uIHdoYXQgZXh0ZW5zaW9uIGNvbnRyaWJ1dGVkIHZpZXdzIGFyZSBtb3N0IHBvcHVsYXInO1xuXHRcdFx0fTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEV4dGVuc2lvblZpZXdUZWxlbWV0cnksIEV4dGVuc2lvblZpZXdUZWxlbWV0cnlNZXRhPignRXh0ZW5zaW9uOlZpZXdBY3RpdmF0ZScsIHtcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IG5ldyBUZWxlbWV0cnlUcnVzdGVkVmFsdWUodGhpcy5leHRlbnNpb25JZCksXG5cdFx0XHRcdGlkOiB0aGlzLmlkLFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmNyZWF0ZVRyZWUoKTtcblx0XHRcdHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7IGxvY2F0aW9uOiB0aGlzLmlkIH0sICgpID0+IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoYG9uVmlldzoke3RoaXMuaWR9YCkpXG5cdFx0XHRcdC50aGVuKCgpID0+IHRpbWVvdXQoMjAwMCkpXG5cdFx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZU1lc3NhZ2UoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR0aGlzLmFjdGl2YXRlZCA9IHRydWU7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUcmVlVmlldyBleHRlbmRzIEFic3RyYWN0VHJlZVZpZXcge1xuXG5cdHByb3RlY3RlZCBhY3RpdmF0ZSgpIHtcblx0XHRpZiAoIXRoaXMuYWN0aXZhdGVkKSB7XG5cdFx0XHR0aGlzLmNyZWF0ZVRyZWUoKTtcblx0XHRcdHRoaXMuYWN0aXZhdGVkID0gdHJ1ZTtcblx0XHR9XG5cdH1cbn1cblxuaW50ZXJmYWNlIFRyZWVEcmFnU291cmNlSW5mbyB7XG5cdGlkOiBzdHJpbmc7XG5cdGl0ZW1IYW5kbGVzOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNsYXNzIEN1c3RvbVRyZWVWaWV3RHJhZ0FuZERyb3AgaW1wbGVtZW50cyBJVHJlZURyYWdBbmREcm9wPElUcmVlSXRlbT4ge1xuXHRwcml2YXRlIHJlYWRvbmx5IHRyZWVNaW1lVHlwZTogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRyZWVJdGVtc1RyYW5zZmVyID0gTG9jYWxTZWxlY3Rpb25UcmFuc2Zlci5nZXRJbnN0YW5jZTxEcmFnZ2VkVHJlZUl0ZW1zSWRlbnRpZmllcj4oKTtcblx0cHJpdmF0ZSBkcmFnQ2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuU291cmNlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdHJlZUlkOiBzdHJpbmcsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUcmVlVmlld3NEbkRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdHJlZVZpZXdzRHJhZ0FuZERyb3BTZXJ2aWNlOiBJVHJlZVZpZXdzRG5EU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSkge1xuXHRcdHRoaXMudHJlZU1pbWVUeXBlID0gYGFwcGxpY2F0aW9uL3ZuZC5jb2RlLnRyZWUuJHt0cmVlSWQudG9Mb3dlckNhc2UoKX1gO1xuXHR9XG5cblx0cHJpdmF0ZSBkbmRDb250cm9sbGVyOiBJVHJlZVZpZXdEcmFnQW5kRHJvcENvbnRyb2xsZXIgfCB1bmRlZmluZWQ7XG5cdHNldCBjb250cm9sbGVyKGNvbnRyb2xsZXI6IElUcmVlVmlld0RyYWdBbmREcm9wQ29udHJvbGxlciB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuZG5kQ29udHJvbGxlciA9IGNvbnRyb2xsZXI7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZURyYWdBbmRMb2coZG5kQ29udHJvbGxlcjogSVRyZWVWaWV3RHJhZ0FuZERyb3BDb250cm9sbGVyLCBpdGVtSGFuZGxlczogc3RyaW5nW10sIHV1aWQ6IHN0cmluZywgZHJhZ0NhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VlNEYXRhVHJhbnNmZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gZG5kQ29udHJvbGxlci5oYW5kbGVEcmFnKGl0ZW1IYW5kbGVzLCB1dWlkLCBkcmFnQ2FuY2VsbGF0aW9uVG9rZW4pLnRoZW4oYWRkaXRpb25hbERhdGFUcmFuc2ZlciA9PiB7XG5cdFx0XHRpZiAoYWRkaXRpb25hbERhdGFUcmFuc2Zlcikge1xuXHRcdFx0XHRjb25zdCB1bmxpc3RlZFR5cGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgYWRkaXRpb25hbERhdGFUcmFuc2Zlcikge1xuXHRcdFx0XHRcdGlmICgoaXRlbVswXSAhPT0gdGhpcy50cmVlTWltZVR5cGUpICYmIChkbmRDb250cm9sbGVyLmRyYWdNaW1lVHlwZXMuZmluZEluZGV4KHZhbHVlID0+IHZhbHVlID09PSBpdGVtWzBdKSA8IDApKSB7XG5cdFx0XHRcdFx0XHR1bmxpc3RlZFR5cGVzLnB1c2goaXRlbVswXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh1bmxpc3RlZFR5cGVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBEcmFnIGFuZCBkcm9wIGNvbnRyb2xsZXIgZm9yIHRyZWUgJHt0aGlzLnRyZWVJZH0gYWRkcyB0aGUgZm9sbG93aW5nIGRhdGEgdHJhbnNmZXIgdHlwZXMgYnV0IGRvZXMgbm90IGRlY2xhcmUgdGhlbSBpbiBkcmFnTWltZVR5cGVzOiAke3VubGlzdGVkVHlwZXMuam9pbignLCAnKX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGFkZGl0aW9uYWxEYXRhVHJhbnNmZXI7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFkZEV4dGVuc2lvblByb3ZpZGVkVHJhbnNmZXJUeXBlcyhvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQsIGl0ZW1IYW5kbGVzOiBzdHJpbmdbXSkge1xuXHRcdGlmICghb3JpZ2luYWxFdmVudC5kYXRhVHJhbnNmZXIgfHwgIXRoaXMuZG5kQ29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB1dWlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cblx0XHR0aGlzLmRyYWdDYW5jZWxsYXRpb25Ub2tlbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMudHJlZVZpZXdzRHJhZ0FuZERyb3BTZXJ2aWNlLmFkZERyYWdPcGVyYXRpb25UcmFuc2Zlcih1dWlkLCB0aGlzLmhhbmRsZURyYWdBbmRMb2codGhpcy5kbmRDb250cm9sbGVyLCBpdGVtSGFuZGxlcywgdXVpZCwgdGhpcy5kcmFnQ2FuY2VsbGF0aW9uVG9rZW4udG9rZW4pKTtcblx0XHR0aGlzLnRyZWVJdGVtc1RyYW5zZmVyLnNldERhdGEoW25ldyBEcmFnZ2VkVHJlZUl0ZW1zSWRlbnRpZmllcih1dWlkKV0sIERyYWdnZWRUcmVlSXRlbXNJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0b3JpZ2luYWxFdmVudC5kYXRhVHJhbnNmZXIuY2xlYXJEYXRhKE1pbWVzLnRleHQpO1xuXHRcdGlmICh0aGlzLmRuZENvbnRyb2xsZXIuZHJhZ01pbWVUeXBlcy5maW5kKChlbGVtZW50KSA9PiBlbGVtZW50ID09PSBNaW1lcy51cmlMaXN0KSkge1xuXHRcdFx0Ly8gQWRkIHRoZSB0eXBlIHRoYXQgdGhlIGVkaXRvciBrbm93c1xuXHRcdFx0b3JpZ2luYWxFdmVudC5kYXRhVHJhbnNmZXI/LnNldERhdGEoRGF0YVRyYW5zZmVycy5SRVNPVVJDRVMsICcnKTtcblx0XHR9XG5cdFx0dGhpcy5kbmRDb250cm9sbGVyLmRyYWdNaW1lVHlwZXMuZm9yRWFjaChzdXBwb3J0ZWRUeXBlID0+IHtcblx0XHRcdG9yaWdpbmFsRXZlbnQuZGF0YVRyYW5zZmVyPy5zZXREYXRhKHN1cHBvcnRlZFR5cGUsICcnKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYWRkUmVzb3VyY2VJbmZvVG9UcmFuc2ZlcihvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQsIHJlc291cmNlczogVVJJW10pIHtcblx0XHRpZiAocmVzb3VyY2VzLmxlbmd0aCAmJiBvcmlnaW5hbEV2ZW50LmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0Ly8gQXBwbHkgc29tZSBkYXRhdHJhbnNmZXIgdHlwZXMgdG8gYWxsb3cgZm9yIGRyYWdnaW5nIHRoZSBlbGVtZW50IG91dHNpZGUgb2YgdGhlIGFwcGxpY2F0aW9uXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGZpbGxFZGl0b3JzRHJhZ0RhdGEoYWNjZXNzb3IsIHJlc291cmNlcywgb3JpZ2luYWxFdmVudCkpO1xuXG5cdFx0XHQvLyBUaGUgb25seSBjdXN0b20gZGF0YSB0cmFuc2ZlciB3ZSBzZXQgZnJvbSB0aGUgZXhwbG9yZXIgaXMgYSBmaWxlIHRyYW5zZmVyXG5cdFx0XHQvLyB0byBiZSBhYmxlIHRvIERORCBiZXR3ZWVuIG11bHRpcGxlIGNvZGUgZmlsZSBleHBsb3JlcnMgYWNyb3NzIHdpbmRvd3Ncblx0XHRcdGNvbnN0IGZpbGVSZXNvdXJjZXMgPSByZXNvdXJjZXMuZmlsdGVyKHMgPT4gcy5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkubWFwKHIgPT4gci5mc1BhdGgpO1xuXHRcdFx0aWYgKGZpbGVSZXNvdXJjZXMubGVuZ3RoKSB7XG5cdFx0XHRcdG9yaWdpbmFsRXZlbnQuZGF0YVRyYW5zZmVyLnNldERhdGEoQ29kZURhdGFUcmFuc2ZlcnMuRklMRVMsIEpTT04uc3RyaW5naWZ5KGZpbGVSZXNvdXJjZXMpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvbkRyYWdTdGFydChkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAob3JpZ2luYWxFdmVudC5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdGNvbnN0IHRyZWVJdGVtc0RhdGEgPSAoZGF0YSBhcyBFbGVtZW50c0RyYWdBbmREcm9wRGF0YTxJVHJlZUl0ZW0sIElUcmVlSXRlbVtdPikuZ2V0RGF0YSgpO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VzOiBVUklbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc291cmNlSW5mbzogVHJlZURyYWdTb3VyY2VJbmZvID0ge1xuXHRcdFx0XHRpZDogdGhpcy50cmVlSWQsXG5cdFx0XHRcdGl0ZW1IYW5kbGVzOiBbXVxuXHRcdFx0fTtcblx0XHRcdHRyZWVJdGVtc0RhdGEuZm9yRWFjaChpdGVtID0+IHtcblx0XHRcdFx0c291cmNlSW5mby5pdGVtSGFuZGxlcy5wdXNoKGl0ZW0uaGFuZGxlKTtcblx0XHRcdFx0aWYgKGl0ZW0ucmVzb3VyY2VVcmkpIHtcblx0XHRcdFx0XHRyZXNvdXJjZXMucHVzaChVUkkucmV2aXZlKGl0ZW0ucmVzb3VyY2VVcmkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmFkZFJlc291cmNlSW5mb1RvVHJhbnNmZXIob3JpZ2luYWxFdmVudCwgcmVzb3VyY2VzKTtcblx0XHRcdHRoaXMuYWRkRXh0ZW5zaW9uUHJvdmlkZWRUcmFuc2ZlclR5cGVzKG9yaWdpbmFsRXZlbnQsIHNvdXJjZUluZm8uaXRlbUhhbmRsZXMpO1xuXHRcdFx0b3JpZ2luYWxFdmVudC5kYXRhVHJhbnNmZXIuc2V0RGF0YSh0aGlzLnRyZWVNaW1lVHlwZSxcblx0XHRcdFx0SlNPTi5zdHJpbmdpZnkoc291cmNlSW5mbykpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZGVidWdMb2codHlwZXM6IFNldDxzdHJpbmc+KSB7XG5cdFx0aWYgKHR5cGVzLnNpemUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgVHJlZVZpZXcgZHJhZ2dlZCBtaW1lIHR5cGVzOiAke0FycmF5LmZyb20odHlwZXMpLmpvaW4oJywgJyl9YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgVHJlZVZpZXcgZHJhZ2dlZCB3aXRoIG5vIHN1cHBvcnRlZCBtaW1lIHR5cGVzLmApO1xuXHRcdH1cblx0fVxuXG5cdG9uRHJhZ092ZXIoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgdGFyZ2V0RWxlbWVudDogSVRyZWVJdGVtLCB0YXJnZXRJbmRleDogbnVtYmVyLCB0YXJnZXRTZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiBib29sZWFuIHwgSVRyZWVEcmFnT3ZlclJlYWN0aW9uIHtcblx0XHRjb25zdCBkYXRhVHJhbnNmZXIgPSB0b0V4dGVybmFsVlNEYXRhVHJhbnNmZXIob3JpZ2luYWxFdmVudC5kYXRhVHJhbnNmZXIhKTtcblxuXHRcdGNvbnN0IHR5cGVzID0gbmV3IFNldDxzdHJpbmc+KEFycmF5LmZyb20oZGF0YVRyYW5zZmVyLCB4ID0+IHhbMF0pKTtcblxuXHRcdGlmIChvcmlnaW5hbEV2ZW50LmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0Ly8gQWxzbyBhZGQgdXJpLWxpc3QgaWYgd2UgaGF2ZSBhbnkgZmlsZXMuIEF0IHRoaXMgc3RhZ2Ugd2UgY2FuJ3QgYWN0dWFsbHkgYWNjZXNzIHRoZSBmaWxlIGl0c2VsZiB0aG91Z2guXG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2Ygb3JpZ2luYWxFdmVudC5kYXRhVHJhbnNmZXIuaXRlbXMpIHtcblx0XHRcdFx0aWYgKGl0ZW0ua2luZCA9PT0gJ2ZpbGUnIHx8IGl0ZW0udHlwZSA9PT0gRGF0YVRyYW5zZmVycy5SRVNPVVJDRVMudG9Mb3dlckNhc2UoKSkge1xuXHRcdFx0XHRcdHR5cGVzLmFkZChNaW1lcy51cmlMaXN0KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuZGVidWdMb2codHlwZXMpO1xuXG5cdFx0Y29uc3QgZG5kQ29udHJvbGxlciA9IHRoaXMuZG5kQ29udHJvbGxlcjtcblx0XHRpZiAoIWRuZENvbnRyb2xsZXIgfHwgIW9yaWdpbmFsRXZlbnQuZGF0YVRyYW5zZmVyIHx8IChkbmRDb250cm9sbGVyLmRyb3BNaW1lVHlwZXMubGVuZ3RoID09PSAwKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBkcmFnQ29udGFpbmVyc1N1cHBvcnRlZFR5cGUgPSBBcnJheS5mcm9tKHR5cGVzKS5zb21lKCh2YWx1ZSwgaW5kZXgpID0+IHtcblx0XHRcdGlmICh2YWx1ZSA9PT0gdGhpcy50cmVlTWltZVR5cGUpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gZG5kQ29udHJvbGxlci5kcm9wTWltZVR5cGVzLmluZGV4T2YodmFsdWUpID49IDA7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0aWYgKGRyYWdDb250YWluZXJzU3VwcG9ydGVkVHlwZSkge1xuXHRcdFx0cmV0dXJuIHsgYWNjZXB0OiB0cnVlLCBidWJibGU6IFRyZWVEcmFnT3ZlckJ1YmJsZS5Eb3duLCBhdXRvRXhwYW5kOiB0cnVlIH07XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGdldERyYWdVUkkoZWxlbWVudDogSVRyZWVJdGVtKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLmRuZENvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gZWxlbWVudC5yZXNvdXJjZVVyaSA/IFVSSS5yZXZpdmUoZWxlbWVudC5yZXNvdXJjZVVyaSkudG9TdHJpbmcoKSA6IGVsZW1lbnQuaGFuZGxlO1xuXHR9XG5cblx0Z2V0RHJhZ0xhYmVsPyhlbGVtZW50czogSVRyZWVJdGVtW10pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5kbmRDb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudHMubGVuZ3RoID4gMSkge1xuXHRcdFx0cmV0dXJuIFN0cmluZyhlbGVtZW50cy5sZW5ndGgpO1xuXHRcdH1cblx0XHRjb25zdCBlbGVtZW50ID0gZWxlbWVudHNbMF07XG5cdFx0aWYgKGVsZW1lbnQubGFiZWwpIHtcblx0XHRcdHJldHVybiBpc01hcmtkb3duU3RyaW5nKGVsZW1lbnQubGFiZWwubGFiZWwpID8gZWxlbWVudC5sYWJlbC5sYWJlbC52YWx1ZSA6IGVsZW1lbnQubGFiZWwubGFiZWw7XG5cdFx0fVxuXHRcdHJldHVybiBlbGVtZW50LnJlc291cmNlVXJpID8gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoVVJJLnJldml2ZShlbGVtZW50LnJlc291cmNlVXJpKSkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBkcm9wKGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldE5vZGU6IElUcmVlSXRlbSB8IHVuZGVmaW5lZCwgdGFyZ2V0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZG5kQ29udHJvbGxlciA9IHRoaXMuZG5kQ29udHJvbGxlcjtcblx0XHRpZiAoIW9yaWdpbmFsRXZlbnQuZGF0YVRyYW5zZmVyIHx8ICFkbmRDb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHRyZWVTb3VyY2VJbmZvOiBUcmVlRHJhZ1NvdXJjZUluZm8gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHdpbGxEcm9wVXVpZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLnRyZWVJdGVtc1RyYW5zZmVyLmhhc0RhdGEoRHJhZ2dlZFRyZWVJdGVtc0lkZW50aWZpZXIucHJvdG90eXBlKSkge1xuXHRcdFx0d2lsbERyb3BVdWlkID0gdGhpcy50cmVlSXRlbXNUcmFuc2Zlci5nZXREYXRhKERyYWdnZWRUcmVlSXRlbXNJZGVudGlmaWVyLnByb3RvdHlwZSkhWzBdLmlkZW50aWZpZXI7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3JpZ2luYWxEYXRhVHJhbnNmZXIgPSB0b0V4dGVybmFsVlNEYXRhVHJhbnNmZXIob3JpZ2luYWxFdmVudC5kYXRhVHJhbnNmZXIsIHRydWUpO1xuXG5cdFx0Y29uc3Qgb3V0RGF0YVRyYW5zZmVyID0gbmV3IFZTRGF0YVRyYW5zZmVyKCk7XG5cdFx0Zm9yIChjb25zdCBbdHlwZSwgaXRlbV0gb2Ygb3JpZ2luYWxEYXRhVHJhbnNmZXIpIHtcblx0XHRcdGlmICh0eXBlID09PSB0aGlzLnRyZWVNaW1lVHlwZSB8fCBkbmRDb250cm9sbGVyLmRyb3BNaW1lVHlwZXMuaW5jbHVkZXModHlwZSkgfHwgKGl0ZW0uYXNGaWxlKCkgJiYgZG5kQ29udHJvbGxlci5kcm9wTWltZVR5cGVzLmluY2x1ZGVzKERhdGFUcmFuc2ZlcnMuRklMRVMudG9Mb3dlckNhc2UoKSkpKSB7XG5cdFx0XHRcdG91dERhdGFUcmFuc2Zlci5hcHBlbmQodHlwZSwgaXRlbSk7XG5cdFx0XHRcdGlmICh0eXBlID09PSB0aGlzLnRyZWVNaW1lVHlwZSkge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHR0cmVlU291cmNlSW5mbyA9IEpTT04ucGFyc2UoYXdhaXQgaXRlbS5hc1N0cmluZygpKTtcblx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdC8vIG5vb3Bcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBhZGRpdGlvbmFsRGF0YVRyYW5zZmVyID0gYXdhaXQgdGhpcy50cmVlVmlld3NEcmFnQW5kRHJvcFNlcnZpY2UucmVtb3ZlRHJhZ09wZXJhdGlvblRyYW5zZmVyKHdpbGxEcm9wVXVpZCk7XG5cdFx0aWYgKGFkZGl0aW9uYWxEYXRhVHJhbnNmZXIpIHtcblx0XHRcdGZvciAoY29uc3QgW3R5cGUsIGl0ZW1dIG9mIGFkZGl0aW9uYWxEYXRhVHJhbnNmZXIpIHtcblx0XHRcdFx0b3V0RGF0YVRyYW5zZmVyLmFwcGVuZCh0eXBlLCBpdGVtKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGRuZENvbnRyb2xsZXIuaGFuZGxlRHJvcChvdXREYXRhVHJhbnNmZXIsIHRhcmdldE5vZGUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsIHdpbGxEcm9wVXVpZCwgdHJlZVNvdXJjZUluZm8/LmlkLCB0cmVlU291cmNlSW5mbz8uaXRlbUhhbmRsZXMpO1xuXHR9XG5cblx0b25EcmFnRW5kKG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuXHRcdC8vIENoZWNrIGlmIHRoZSBkcmFnIHdhcyBjYW5jZWxsZWQuXG5cdFx0aWYgKG9yaWdpbmFsRXZlbnQuZGF0YVRyYW5zZmVyPy5kcm9wRWZmZWN0ID09PSAnbm9uZScpIHtcblx0XHRcdHRoaXMuZHJhZ0NhbmNlbGxhdGlvblRva2VuPy5jYW5jZWwoKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQgeyB9XG59XG5cbmZ1bmN0aW9uIHNldENhc2NhZGluZ0NoZWNrYm94VXBkYXRlcyhpdGVtczogcmVhZG9ubHkgSVRyZWVJdGVtW10pIHtcblx0Y29uc3QgYWRkaXRpb25hbEl0ZW1zOiBJVHJlZUl0ZW1bXSA9IFtdO1xuXG5cdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdGlmIChpdGVtLmNoZWNrYm94ICE9PSB1bmRlZmluZWQpIHtcblxuXHRcdFx0Y29uc3QgY2hlY2tDaGlsZHJlbiA9IChjdXJyZW50SXRlbTogSVRyZWVJdGVtKSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgKGN1cnJlbnRJdGVtLmNoaWxkcmVuID8/IFtdKSkge1xuXHRcdFx0XHRcdGlmICgoY2hpbGQuY2hlY2tib3ggIT09IHVuZGVmaW5lZCkgJiYgKGN1cnJlbnRJdGVtLmNoZWNrYm94ICE9PSB1bmRlZmluZWQpICYmIChjaGlsZC5jaGVja2JveC5pc0NoZWNrZWQgIT09IGN1cnJlbnRJdGVtLmNoZWNrYm94LmlzQ2hlY2tlZCkpIHtcblx0XHRcdFx0XHRcdGNoaWxkLmNoZWNrYm94LmlzQ2hlY2tlZCA9IGN1cnJlbnRJdGVtLmNoZWNrYm94LmlzQ2hlY2tlZDtcblx0XHRcdFx0XHRcdGFkZGl0aW9uYWxJdGVtcy5wdXNoKGNoaWxkKTtcblx0XHRcdFx0XHRcdGNoZWNrQ2hpbGRyZW4oY2hpbGQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGNoZWNrQ2hpbGRyZW4oaXRlbSk7XG5cblx0XHRcdGNvbnN0IHZpc2l0ZWRQYXJlbnRzOiBTZXQ8SVRyZWVJdGVtPiA9IG5ldyBTZXQoKTtcblx0XHRcdGNvbnN0IGNoZWNrUGFyZW50cyA9IChjdXJyZW50SXRlbTogSVRyZWVJdGVtKSA9PiB7XG5cdFx0XHRcdGlmIChjdXJyZW50SXRlbS5wYXJlbnQ/LmNoZWNrYm94ICE9PSB1bmRlZmluZWQgJiYgY3VycmVudEl0ZW0ucGFyZW50LmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0aWYgKHZpc2l0ZWRQYXJlbnRzLmhhcyhjdXJyZW50SXRlbS5wYXJlbnQpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHZpc2l0ZWRQYXJlbnRzLmFkZChjdXJyZW50SXRlbS5wYXJlbnQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGxldCBzb21lVW5jaGVja2VkID0gZmFsc2U7XG5cdFx0XHRcdFx0bGV0IHNvbWVDaGVja2VkID0gZmFsc2U7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBjdXJyZW50SXRlbS5wYXJlbnQuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRcdGlmIChzb21lVW5jaGVja2VkICYmIHNvbWVDaGVja2VkKSB7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGNoaWxkLmNoZWNrYm94ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGNoaWxkLmNoZWNrYm94LmlzQ2hlY2tlZCkge1xuXHRcdFx0XHRcdFx0XHRcdHNvbWVDaGVja2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRzb21lVW5jaGVja2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoc29tZUNoZWNrZWQgJiYgIXNvbWVVbmNoZWNrZWQgJiYgKGN1cnJlbnRJdGVtLnBhcmVudC5jaGVja2JveC5pc0NoZWNrZWQgIT09IHRydWUpKSB7XG5cdFx0XHRcdFx0XHRjdXJyZW50SXRlbS5wYXJlbnQuY2hlY2tib3guaXNDaGVja2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGFkZGl0aW9uYWxJdGVtcy5wdXNoKGN1cnJlbnRJdGVtLnBhcmVudCk7XG5cdFx0XHRcdFx0XHRjaGVja1BhcmVudHMoY3VycmVudEl0ZW0ucGFyZW50KTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHNvbWVVbmNoZWNrZWQgJiYgKGN1cnJlbnRJdGVtLnBhcmVudC5jaGVja2JveC5pc0NoZWNrZWQgIT09IGZhbHNlKSkge1xuXHRcdFx0XHRcdFx0Y3VycmVudEl0ZW0ucGFyZW50LmNoZWNrYm94LmlzQ2hlY2tlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0YWRkaXRpb25hbEl0ZW1zLnB1c2goY3VycmVudEl0ZW0ucGFyZW50KTtcblx0XHRcdFx0XHRcdGNoZWNrUGFyZW50cyhjdXJyZW50SXRlbS5wYXJlbnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGNoZWNrUGFyZW50cyhpdGVtKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gaXRlbXMuY29uY2F0KGFkZGl0aW9uYWxJdGVtcyk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMscUJBQXVDO0FBQ2hELFlBQVksU0FBUztBQUNyQixZQUFZLFdBQVc7QUFDdkIsU0FBNEIseUJBQXlCO0FBQ3JELFNBQVMsaUJBQTBDO0FBQ25ELFNBQVMsc0JBQXNCO0FBSS9CLFNBQXFILDBCQUEwQjtBQUMvSSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGNBQXVCLGlCQUFpQjtBQUNqRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHFCQUFpQztBQUMxQyxTQUEwQixrQkFBa0Isc0JBQXNCO0FBQ2xFLFNBQVMsWUFBWSxpQkFBOEIsbUJBQW1CLG9CQUFvQjtBQUMxRixTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsVUFBVSxlQUFlO0FBQ2xDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixPQUFPO0FBQ1AsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0IsNkJBQTZCO0FBQzVELFNBQVMsU0FBUyxjQUFjLFFBQVEsY0FBYyx1QkFBdUI7QUFDN0UsU0FBUyxrQkFBa0IsdUJBQXVCO0FBQ2xELFNBQVMsNkJBQTZCO0FBQ3RD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
