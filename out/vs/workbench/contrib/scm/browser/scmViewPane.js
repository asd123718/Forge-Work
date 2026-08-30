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
import "./media/scm.css";
import { Event, Emitter } from "../../../../base/common/event.js";
import { basename, dirname } from "../../../../base/common/resources.js";
import { Disposable, DisposableStore, combinedDisposable, dispose, toDisposable, MutableDisposable, DisposableMap } from "../../../../base/common/lifecycle.js";
import { ViewPane, ViewAction } from "../../../browser/parts/views/viewPane.js";
import { append, $, clearNode, isPointerEvent, isActiveElement } from "../../../../base/browser/dom.js";
import { asCSSUrl } from "../../../../base/browser/cssValue.js";
import { ISCMViewService, ISCMService, VIEW_PANE_ID, ISCMRepositorySortKey, ViewMode, ISCMRepositorySelectionMode } from "../common/scm.js";
import { ResourceLabels } from "../../../browser/labels.js";
import { CountBadge } from "../../../../base/browser/ui/countBadge/countBadge.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IContextKeyService, ContextKeyExpr, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { MenuItemAction, IMenuService, registerAction2, MenuId, MenuRegistry, Action2 } from "../../../../platform/actions/common/actions.js";
import { ActionRunner, Separator, toAction } from "../../../../base/common/actions.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { isSCMResource, isSCMResourceGroup, isSCMRepository, isSCMInput, collectContextMenuActions, getActionViewItemProvider, isSCMActionButton, isSCMViewService, isSCMResourceNode, connectPrimaryMenu } from "./util.js";
import { WorkbenchCompressibleAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { disposableTimeout, Sequencer, Throttler } from "../../../../base/common/async.js";
import { ResourceTree } from "../../../../base/common/resourceTree.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { FileKind } from "../../../../platform/files/common/files.js";
import { compareFileNames, comparePaths } from "../../../../base/common/comparers.js";
import { createMatches } from "../../../../base/common/filters.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { localize } from "../../../../nls.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../common/editor.js";
import { compare } from "../../../../base/common/strings.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { RepositoryActionRunner, RepositoryRenderer } from "./scmRepositoryRenderer.js";
import { isDark } from "../../../../platform/theme/common/theme.js";
import { API_OPEN_DIFF_EDITOR_COMMAND_ID, API_OPEN_EDITOR_COMMAND_ID } from "../../../browser/parts/editor/editorCommands.js";
import { getFlatContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Button, ButtonWithDropdown } from "../../../../base/browser/ui/button/button.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { RepositoryContextKeys } from "./scmViewService.js";
import { defaultButtonStyles, defaultCountBadgeStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { Schemas } from "../../../../base/common/network.js";
import { fillEditorsDragData } from "../../../browser/dnd.js";
import { CodeDataTransfers } from "../../../../platform/dnd/browser/dnd.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { rot } from "../../../../base/common/numbers.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { OpenScmGroupAction } from "../../multiDiffEditor/browser/scmMultiDiffSourceResolver.js";
import { autorun } from "../../../../base/common/observable.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { AccessibilityCommandId } from "../../accessibility/common/accessibilityCommands.js";
import { SCMInputWidget } from "./scmInput.js";
function processResourceFilterData(uri, filterData) {
  if (!filterData) {
    return [void 0, void 0];
  }
  if (!filterData.label) {
    const matches2 = createMatches(filterData);
    return [matches2, void 0];
  }
  const fileName = basename(uri);
  const label = filterData.label;
  const pathLength = label.length - fileName.length;
  const matches = createMatches(filterData.score);
  if (label === fileName) {
    return [matches, void 0];
  }
  const labelMatches = [];
  const descriptionMatches = [];
  for (const match of matches) {
    if (match.start > pathLength) {
      labelMatches.push({
        start: match.start - pathLength,
        end: match.end - pathLength
      });
    } else if (match.end < pathLength) {
      descriptionMatches.push(match);
    } else {
      labelMatches.push({
        start: 0,
        end: match.end - pathLength
      });
      descriptionMatches.push({
        start: match.start,
        end: pathLength
      });
    }
  }
  return [labelMatches, descriptionMatches];
}
let ActionButtonRenderer = class {
  constructor(commandService, contextMenuService, notificationService) {
    this.commandService = commandService;
    this.contextMenuService = contextMenuService;
    this.notificationService = notificationService;
    this.actionButtons = /* @__PURE__ */ new Map();
  }
  get templateId() {
    return ActionButtonRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    container.parentElement.parentElement.classList.add("cursor-default", "force-no-hover");
    const buttonContainer = append(container, $(".button-container"));
    const actionButton = new SCMActionButton(buttonContainer, this.contextMenuService, this.commandService, this.notificationService);
    return { actionButton, disposable: Disposable.None, templateDisposable: actionButton };
  }
  renderElement(node, index, templateData) {
    templateData.disposable.dispose();
    const disposables = new DisposableStore();
    const actionButton = node.element;
    templateData.actionButton.setButton(node.element.button);
    this.actionButtons.set(actionButton, templateData.actionButton);
    disposables.add({ dispose: () => this.actionButtons.delete(actionButton) });
    templateData.disposable = disposables;
  }
  renderCompressedElements() {
    throw new Error("Should never happen since node is incompressible");
  }
  focusActionButton(actionButton) {
    this.actionButtons.get(actionButton)?.focus();
  }
  disposeElement(node, index, template) {
    template.disposable.dispose();
  }
  disposeTemplate(templateData) {
    templateData.disposable.dispose();
    templateData.templateDisposable.dispose();
  }
};
ActionButtonRenderer.DEFAULT_HEIGHT = 28;
ActionButtonRenderer.TEMPLATE_ID = "actionButton";
ActionButtonRenderer = __decorateClass([
  __decorateParam(0, ICommandService),
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, INotificationService)
], ActionButtonRenderer);
class SCMTreeDragAndDrop {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
  }
  getDragURI(element) {
    if (isSCMResource(element)) {
      return element.sourceUri.toString();
    }
    return null;
  }
  onDragStart(data, originalEvent) {
    const items = SCMTreeDragAndDrop.getResourcesFromDragAndDropData(data);
    if (originalEvent.dataTransfer && items?.length) {
      this.instantiationService.invokeFunction((accessor) => fillEditorsDragData(accessor, items, originalEvent));
      const fileResources = items.filter((s) => s.scheme === Schemas.file).map((r) => r.fsPath);
      if (fileResources.length) {
        originalEvent.dataTransfer.setData(CodeDataTransfers.FILES, JSON.stringify(fileResources));
      }
    }
  }
  getDragLabel(elements, originalEvent) {
    if (elements.length === 1) {
      const element = elements[0];
      if (isSCMResource(element)) {
        return basename(element.sourceUri);
      }
    }
    return String(elements.length);
  }
  onDragOver(data, targetElement, targetIndex, targetSector, originalEvent) {
    return true;
  }
  drop(data, targetElement, targetIndex, targetSector, originalEvent) {
  }
  static getResourcesFromDragAndDropData(data) {
    const uris = [];
    for (const element of [...data.context ?? [], ...data.elements]) {
      if (isSCMResource(element)) {
        uris.push(element.sourceUri);
      }
    }
    return uris;
  }
  dispose() {
  }
}
let InputRenderer = class {
  constructor(outerLayout, overflowWidgetsDomNode, updateHeight, instantiationService) {
    this.outerLayout = outerLayout;
    this.overflowWidgetsDomNode = overflowWidgetsDomNode;
    this.updateHeight = updateHeight;
    this.instantiationService = instantiationService;
    this.inputWidgets = /* @__PURE__ */ new Map();
    this.contentHeights = /* @__PURE__ */ new WeakMap();
    this.editorSelections = /* @__PURE__ */ new WeakMap();
  }
  get templateId() {
    return InputRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    container.parentElement.parentElement.classList.add("force-no-hover");
    const templateDisposable = new DisposableStore();
    const inputElement = append(container, $(".scm-input"));
    const inputWidget = this.instantiationService.createInstance(SCMInputWidget, inputElement, this.overflowWidgetsDomNode);
    templateDisposable.add(inputWidget);
    return { inputWidget, inputWidgetHeight: InputRenderer.DEFAULT_HEIGHT, elementDisposables: new DisposableStore(), templateDisposable };
  }
  renderElement(node, index, templateData) {
    const input = node.element;
    templateData.inputWidget.input = input;
    this.inputWidgets.set(input, templateData.inputWidget);
    templateData.elementDisposables.add({
      dispose: () => this.inputWidgets.delete(input)
    });
    const selections = this.editorSelections.get(input);
    if (selections) {
      templateData.inputWidget.selections = selections;
    }
    templateData.elementDisposables.add(toDisposable(() => {
      const selections2 = templateData.inputWidget.selections;
      if (selections2) {
        this.editorSelections.set(input, selections2);
      }
    }));
    templateData.inputWidgetHeight = InputRenderer.DEFAULT_HEIGHT;
    const onDidChangeContentHeight = () => {
      const contentHeight = templateData.inputWidget.getContentHeight();
      this.contentHeights.set(input, contentHeight);
      if (templateData.inputWidgetHeight !== contentHeight) {
        this.updateHeight(input, contentHeight + 10);
        templateData.inputWidgetHeight = contentHeight;
        templateData.inputWidget.layout();
      }
    };
    const startListeningContentHeightChange = () => {
      templateData.elementDisposables.add(templateData.inputWidget.onDidChangeContentHeight(onDidChangeContentHeight));
      onDidChangeContentHeight();
    };
    disposableTimeout(startListeningContentHeightChange, 0, templateData.elementDisposables);
    const layoutEditor = () => templateData.inputWidget.layout();
    templateData.elementDisposables.add(this.outerLayout.onDidChange(layoutEditor));
    layoutEditor();
  }
  renderCompressedElements() {
    throw new Error("Should never happen since node is incompressible");
  }
  disposeElement(group, index, template) {
    template.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.templateDisposable.dispose();
  }
  getHeight(input) {
    return (this.contentHeights.get(input) ?? InputRenderer.DEFAULT_HEIGHT) + 10;
  }
  getRenderedInputWidget(input) {
    return this.inputWidgets.get(input);
  }
  getFocusedInput() {
    for (const [input, inputWidget] of this.inputWidgets) {
      if (inputWidget.hasFocus()) {
        return input;
      }
    }
    return void 0;
  }
  clearValidation() {
    for (const [, inputWidget] of this.inputWidgets) {
      inputWidget.clearValidation();
    }
  }
};
InputRenderer.DEFAULT_HEIGHT = 26;
InputRenderer.TEMPLATE_ID = "input";
InputRenderer = __decorateClass([
  __decorateParam(3, IInstantiationService)
], InputRenderer);
let ResourceGroupRenderer = class {
  constructor(actionViewItemProvider, actionRunner, commandService, contextKeyService, contextMenuService, keybindingService, menuService, scmViewService, telemetryService) {
    this.actionViewItemProvider = actionViewItemProvider;
    this.actionRunner = actionRunner;
    this.commandService = commandService;
    this.contextKeyService = contextKeyService;
    this.contextMenuService = contextMenuService;
    this.keybindingService = keybindingService;
    this.menuService = menuService;
    this.scmViewService = scmViewService;
    this.telemetryService = telemetryService;
  }
  get templateId() {
    return ResourceGroupRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = append(container, $(".resource-group"));
    const name = append(element, $(".name"));
    const actionsContainer = append(element, $(".actions"));
    const actionBar = new WorkbenchToolBar(actionsContainer, {
      actionViewItemProvider: this.actionViewItemProvider,
      actionRunner: this.actionRunner
    }, this.menuService, this.contextKeyService, this.contextMenuService, this.keybindingService, this.commandService, this.telemetryService);
    const countContainer = append(element, $(".count"));
    const count = new CountBadge(countContainer, {}, defaultCountBadgeStyles);
    const disposables = combinedDisposable(actionBar, count);
    return { name, count, actionBar, elementDisposables: new DisposableStore(), disposables };
  }
  renderElement(node, index, template) {
    const group = node.element;
    template.name.textContent = group.label;
    template.count.setCount(group.resources.length);
    const menus = this.scmViewService.menus.getRepositoryMenus(group.provider);
    template.elementDisposables.add(connectPrimaryMenu(menus.getResourceGroupMenu(group), (primary) => {
      template.actionBar.setActions(primary);
    }, "inline"));
    template.actionBar.context = group;
  }
  renderCompressedElements(node) {
    throw new Error("Should never happen since node is incompressible");
  }
  disposeElement(group, index, template) {
    template.elementDisposables.clear();
  }
  disposeTemplate(template) {
    template.elementDisposables.dispose();
    template.disposables.dispose();
  }
};
ResourceGroupRenderer.TEMPLATE_ID = "resource group";
ResourceGroupRenderer = __decorateClass([
  __decorateParam(2, ICommandService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, IMenuService),
  __decorateParam(7, ISCMViewService),
  __decorateParam(8, ITelemetryService)
], ResourceGroupRenderer);
class RepositoryPaneActionRunner extends ActionRunner {
  constructor(getSelectedResources) {
    super();
    this.getSelectedResources = getSelectedResources;
  }
  async runAction(action, context) {
    if (!(action instanceof MenuItemAction)) {
      return super.runAction(action, context);
    }
    const isContextResourceGroup = isSCMResourceGroup(context);
    const selection = this.getSelectedResources().filter((r) => isSCMResourceGroup(r) === isContextResourceGroup);
    const contextIsSelected = selection.some((s) => s === context);
    const actualContext = contextIsSelected ? selection : [context];
    const args = actualContext.map((e) => ResourceTree.isResourceNode(e) ? ResourceTree.collect(e) : [e]).flat();
    await action.run(...args);
  }
}
let ResourceRenderer = class {
  constructor(viewMode, labels, actionViewItemProvider, actionRunner, commandService, contextKeyService, contextMenuService, keybindingService, labelService, menuService, scmViewService, telemetryService, themeService) {
    this.viewMode = viewMode;
    this.labels = labels;
    this.actionViewItemProvider = actionViewItemProvider;
    this.actionRunner = actionRunner;
    this.commandService = commandService;
    this.contextKeyService = contextKeyService;
    this.contextMenuService = contextMenuService;
    this.keybindingService = keybindingService;
    this.labelService = labelService;
    this.menuService = menuService;
    this.scmViewService = scmViewService;
    this.telemetryService = telemetryService;
    this.themeService = themeService;
    this.disposables = new DisposableStore();
    this.renderedResources = /* @__PURE__ */ new Map();
    themeService.onDidColorThemeChange(this.onDidColorThemeChange, this, this.disposables);
  }
  get templateId() {
    return ResourceRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = append(container, $(".resource"));
    const name = append(element, $(".name"));
    const fileLabel = this.labels.create(name, { supportDescriptionHighlights: true, supportHighlights: true });
    const actionsContainer = append(fileLabel.element, $(".actions"));
    const actionBar = new WorkbenchToolBar(actionsContainer, {
      actionViewItemProvider: this.actionViewItemProvider,
      actionRunner: this.actionRunner
    }, this.menuService, this.contextKeyService, this.contextMenuService, this.keybindingService, this.commandService, this.telemetryService);
    const decorationIcon = append(element, $(".decoration-icon"));
    const actionBarMenuListener = new MutableDisposable();
    const disposables = combinedDisposable(actionBar, fileLabel, actionBarMenuListener);
    return { element, name, fileLabel, decorationIcon, actionBar, actionBarMenu: void 0, actionBarMenuListener, elementDisposables: new DisposableStore(), disposables };
  }
  renderElement(node, index, template) {
    const resourceOrFolder = node.element;
    const iconResource = ResourceTree.isResourceNode(resourceOrFolder) ? resourceOrFolder.element : resourceOrFolder;
    const uri = ResourceTree.isResourceNode(resourceOrFolder) ? resourceOrFolder.uri : resourceOrFolder.sourceUri;
    const fileKind = ResourceTree.isResourceNode(resourceOrFolder) ? FileKind.FOLDER : FileKind.FILE;
    const tooltip = !ResourceTree.isResourceNode(resourceOrFolder) && resourceOrFolder.decorations.tooltip || "";
    const hidePath = this.viewMode() === ViewMode.Tree;
    let matches;
    let descriptionMatches;
    let strikethrough;
    if (ResourceTree.isResourceNode(resourceOrFolder)) {
      if (resourceOrFolder.element) {
        const menus = this.scmViewService.menus.getRepositoryMenus(resourceOrFolder.element.resourceGroup.provider);
        this._renderActionBar(template, resourceOrFolder, menus.getResourceMenu(resourceOrFolder.element));
        template.element.classList.toggle("faded", resourceOrFolder.element.decorations.faded);
        strikethrough = resourceOrFolder.element.decorations.strikeThrough;
      } else {
        const menus = this.scmViewService.menus.getRepositoryMenus(resourceOrFolder.context.provider);
        this._renderActionBar(template, resourceOrFolder, menus.getResourceFolderMenu(resourceOrFolder.context));
        matches = createMatches(node.filterData);
        template.element.classList.remove("faded");
      }
    } else {
      const menus = this.scmViewService.menus.getRepositoryMenus(resourceOrFolder.resourceGroup.provider);
      this._renderActionBar(template, resourceOrFolder, menus.getResourceMenu(resourceOrFolder));
      [matches, descriptionMatches] = processResourceFilterData(uri, node.filterData);
      template.element.classList.toggle("faded", resourceOrFolder.decorations.faded);
      strikethrough = resourceOrFolder.decorations.strikeThrough;
    }
    const renderedData = {
      tooltip,
      uri,
      fileLabelOptions: { hidePath, fileKind, matches, descriptionMatches, strikethrough },
      iconResource
    };
    this.renderIcon(template, renderedData);
    this.renderedResources.set(template, renderedData);
    template.elementDisposables.add(toDisposable(() => this.renderedResources.delete(template)));
    template.element.setAttribute("data-tooltip", tooltip);
  }
  disposeElement(resource, index, template) {
    template.elementDisposables.clear();
  }
  renderCompressedElements(node, index, template) {
    const compressed = node.element;
    const folder = compressed.elements[compressed.elements.length - 1];
    const label = compressed.elements.map((e) => e.name);
    const fileKind = FileKind.FOLDER;
    const matches = createMatches(node.filterData);
    template.fileLabel.setResource({ resource: folder.uri, name: label }, {
      fileDecorations: { colors: false, badges: true },
      fileKind,
      matches,
      separator: this.labelService.getSeparator(folder.uri.scheme)
    });
    const menus = this.scmViewService.menus.getRepositoryMenus(folder.context.provider);
    this._renderActionBar(template, folder, menus.getResourceFolderMenu(folder.context));
    template.name.classList.remove("strike-through");
    template.element.classList.remove("faded");
    template.decorationIcon.style.display = "none";
    template.decorationIcon.style.backgroundImage = "";
    template.element.setAttribute("data-tooltip", "");
  }
  disposeCompressedElements(node, index, template) {
    template.elementDisposables.clear();
  }
  disposeTemplate(template) {
    template.elementDisposables.dispose();
    template.disposables.dispose();
  }
  _renderActionBar(template, resourceOrFolder, menu) {
    if (!template.actionBarMenu || template.actionBarMenu !== menu) {
      template.actionBarMenu = menu;
      template.actionBarMenuListener.value = connectPrimaryMenu(menu, (primary) => {
        template.actionBar.setActions(primary);
      }, "inline");
    }
    template.actionBar.context = resourceOrFolder;
  }
  onDidColorThemeChange() {
    for (const [template, data] of this.renderedResources) {
      this.renderIcon(template, data);
    }
  }
  renderIcon(template, data) {
    const theme = this.themeService.getColorTheme();
    const icon = isDark(theme.type) ? data.iconResource?.decorations.iconDark : data.iconResource?.decorations.icon;
    template.fileLabel.setFile(data.uri, {
      ...data.fileLabelOptions,
      fileDecorations: { colors: false, badges: !icon }
    });
    if (icon) {
      if (ThemeIcon.isThemeIcon(icon)) {
        template.decorationIcon.className = `decoration-icon ${ThemeIcon.asClassName(icon)}`;
        if (icon.color) {
          template.decorationIcon.style.color = theme.getColor(icon.color.id)?.toString() ?? "";
        }
        template.decorationIcon.style.display = "";
        template.decorationIcon.style.backgroundImage = "";
      } else {
        template.decorationIcon.className = "decoration-icon";
        template.decorationIcon.style.color = "";
        template.decorationIcon.style.display = "";
        template.decorationIcon.style.backgroundImage = asCSSUrl(icon);
      }
      template.decorationIcon.title = data.tooltip;
    } else {
      template.decorationIcon.className = "decoration-icon";
      template.decorationIcon.style.color = "";
      template.decorationIcon.style.display = "none";
      template.decorationIcon.style.backgroundImage = "";
      template.decorationIcon.title = "";
    }
  }
  dispose() {
    this.disposables.dispose();
  }
};
ResourceRenderer.TEMPLATE_ID = "resource";
ResourceRenderer = __decorateClass([
  __decorateParam(4, ICommandService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, ILabelService),
  __decorateParam(9, IMenuService),
  __decorateParam(10, ISCMViewService),
  __decorateParam(11, ITelemetryService),
  __decorateParam(12, IThemeService)
], ResourceRenderer);
class ListDelegate {
  constructor(inputRenderer) {
    this.inputRenderer = inputRenderer;
  }
  getHeight(element) {
    if (isSCMInput(element)) {
      return this.inputRenderer.getHeight(element);
    } else if (isSCMActionButton(element)) {
      return ActionButtonRenderer.DEFAULT_HEIGHT + 8;
    } else {
      return 22;
    }
  }
  getTemplateId(element) {
    if (isSCMRepository(element)) {
      return RepositoryRenderer.TEMPLATE_ID;
    } else if (isSCMInput(element)) {
      return InputRenderer.TEMPLATE_ID;
    } else if (isSCMActionButton(element)) {
      return ActionButtonRenderer.TEMPLATE_ID;
    } else if (isSCMResourceGroup(element)) {
      return ResourceGroupRenderer.TEMPLATE_ID;
    } else if (isSCMResource(element) || isSCMResourceNode(element)) {
      return ResourceRenderer.TEMPLATE_ID;
    } else {
      throw new Error("Unknown element");
    }
  }
}
class SCMTreeCompressionDelegate {
  isIncompressible(element) {
    if (ResourceTree.isResourceNode(element)) {
      return element.childrenCount === 0 || !element.parent || !element.parent.parent;
    }
    return true;
  }
}
class SCMTreeFilter {
  filter(element) {
    if (isSCMResourceGroup(element)) {
      return element.resources.length > 0 || !element.hideWhenEmpty;
    } else {
      return true;
    }
  }
}
class SCMTreeSorter {
  constructor(viewMode, viewSortKey) {
    this.viewMode = viewMode;
    this.viewSortKey = viewSortKey;
  }
  compare(one, other) {
    if (isSCMRepository(one)) {
      if (!isSCMRepository(other)) {
        throw new Error("Invalid comparison");
      }
      return 0;
    }
    if (isSCMInput(one)) {
      return -1;
    } else if (isSCMInput(other)) {
      return 1;
    }
    if (isSCMActionButton(one)) {
      return -1;
    } else if (isSCMActionButton(other)) {
      return 1;
    }
    if (isSCMResourceGroup(one)) {
      return isSCMResourceGroup(other) ? 0 : -1;
    }
    if (this.viewMode() === ViewMode.List) {
      if (this.viewSortKey() === "name" /* Name */) {
        const oneName2 = basename(one.sourceUri);
        const otherName2 = basename(other.sourceUri);
        return compareFileNames(oneName2, otherName2);
      }
      if (this.viewSortKey() === "status" /* Status */) {
        const oneTooltip = one.decorations.tooltip ?? "";
        const otherTooltip = other.decorations.tooltip ?? "";
        if (oneTooltip !== otherTooltip) {
          return compare(oneTooltip, otherTooltip);
        }
      }
      const onePath = one.sourceUri.fsPath;
      const otherPath = other.sourceUri.fsPath;
      return comparePaths(onePath, otherPath);
    }
    const oneIsDirectory = ResourceTree.isResourceNode(one);
    const otherIsDirectory = ResourceTree.isResourceNode(other);
    if (oneIsDirectory !== otherIsDirectory) {
      return oneIsDirectory ? -1 : 1;
    }
    const oneName = ResourceTree.isResourceNode(one) ? one.name : basename(one.sourceUri);
    const otherName = ResourceTree.isResourceNode(other) ? other.name : basename(other.sourceUri);
    return compareFileNames(oneName, otherName);
  }
}
let SCMTreeKeyboardNavigationLabelProvider = class {
  constructor(viewMode, labelService) {
    this.viewMode = viewMode;
    this.labelService = labelService;
  }
  getKeyboardNavigationLabel(element) {
    if (ResourceTree.isResourceNode(element)) {
      return element.name;
    } else if (isSCMRepository(element) || isSCMInput(element) || isSCMActionButton(element)) {
      return void 0;
    } else if (isSCMResourceGroup(element)) {
      return element.label;
    } else {
      if (this.viewMode() === ViewMode.List) {
        const fileName = basename(element.sourceUri);
        const filePath = this.labelService.getUriLabel(element.sourceUri, { relative: true });
        return [fileName, filePath];
      } else {
        return basename(element.sourceUri);
      }
    }
  }
  getCompressedNodeKeyboardNavigationLabel(elements) {
    const folders = elements;
    return folders.map((e) => e.name).join("/");
  }
};
SCMTreeKeyboardNavigationLabelProvider = __decorateClass([
  __decorateParam(1, ILabelService)
], SCMTreeKeyboardNavigationLabelProvider);
function getSCMResourceId(element) {
  if (isSCMRepository(element)) {
    const provider = element.provider;
    return `repo:${provider.id}`;
  } else if (isSCMInput(element)) {
    const provider = element.repository.provider;
    return `input:${provider.id}`;
  } else if (isSCMActionButton(element)) {
    const provider = element.repository.provider;
    return `actionButton:${provider.id}`;
  } else if (isSCMResourceGroup(element)) {
    const provider = element.provider;
    return `resourceGroup:${provider.id}/${element.id}`;
  } else if (isSCMResource(element)) {
    const group = element.resourceGroup;
    const provider = group.provider;
    return `resource:${provider.id}/${group.id}/${element.sourceUri.toString()}`;
  } else if (isSCMResourceNode(element)) {
    const group = element.context;
    return `folder:${group.provider.id}/${group.id}/$FOLDER/${element.uri.toString()}`;
  } else {
    throw new Error("Invalid tree element");
  }
}
class SCMResourceIdentityProvider {
  getId(element) {
    return getSCMResourceId(element);
  }
}
let SCMAccessibilityProvider = class {
  constructor(accessibilityService, configurationService, keybindingService, labelService) {
    this.accessibilityService = accessibilityService;
    this.configurationService = configurationService;
    this.keybindingService = keybindingService;
    this.labelService = labelService;
  }
  getWidgetAriaLabel() {
    return localize("scm", "Source Control Management");
  }
  getAriaLabel(element) {
    if (ResourceTree.isResourceNode(element)) {
      return this.labelService.getUriLabel(element.uri, { relative: true, noPrefix: true }) || element.name;
    } else if (isSCMRepository(element)) {
      return `${element.provider.name} ${element.provider.label}`;
    } else if (isSCMInput(element)) {
      const verbosity = this.configurationService.getValue(AccessibilityVerbositySettingId.SourceControl) === true;
      if (!verbosity || !this.accessibilityService.isScreenReaderOptimized()) {
        return localize("scmInput", "Source Control Input");
      }
      const kbLabel = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
      return kbLabel ? localize("scmInputRow.accessibilityHelp", "Source Control Input, Use {0} to open Source Control Accessibility Help.", kbLabel) : localize("scmInputRow.accessibilityHelpNoKb", "Source Control Input, Run the Open Accessibility Help command for more information.");
    } else if (isSCMActionButton(element)) {
      return element.button?.command.title ?? "";
    } else if (isSCMResourceGroup(element)) {
      return element.label;
    } else {
      const result = [];
      result.push(basename(element.sourceUri));
      if (element.decorations.tooltip) {
        result.push(element.decorations.tooltip);
      }
      const path = this.labelService.getUriLabel(dirname(element.sourceUri), { relative: true, noPrefix: true });
      if (path) {
        result.push(path);
      }
      return result.join(", ");
    }
  }
};
SCMAccessibilityProvider = __decorateClass([
  __decorateParam(0, IAccessibilityService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, ILabelService)
], SCMAccessibilityProvider);
var ViewSortKey = /* @__PURE__ */ ((ViewSortKey2) => {
  ViewSortKey2["Path"] = "path";
  ViewSortKey2["Name"] = "name";
  ViewSortKey2["Status"] = "status";
  return ViewSortKey2;
})(ViewSortKey || {});
const Menus = {
  ViewSort: new MenuId("SCMViewSort"),
  Repositories: new MenuId("SCMRepositories"),
  ChangesSettings: new MenuId("SCMChangesSettings")
};
const ContextKeys = {
  SCMViewMode: new RawContextKey("scmViewMode", ViewMode.List),
  SCMViewSortKey: new RawContextKey("scmViewSortKey", "path" /* Path */),
  SCMViewAreAllRepositoriesCollapsed: new RawContextKey("scmViewAreAllRepositoriesCollapsed", false),
  SCMViewIsAnyRepositoryCollapsible: new RawContextKey("scmViewIsAnyRepositoryCollapsible", false),
  SCMProvider: new RawContextKey("scmProvider", void 0),
  SCMProviderRootUri: new RawContextKey("scmProviderRootUri", void 0),
  SCMProviderHasRootUri: new RawContextKey("scmProviderHasRootUri", void 0),
  SCMHistoryItemCount: new RawContextKey("scmHistoryItemCount", 0),
  SCMHistoryViewMode: new RawContextKey("scmHistoryViewMode", ViewMode.List),
  SCMCurrentHistoryItemRefHasRemote: new RawContextKey("scmCurrentHistoryItemRefHasRemote", false),
  SCMCurrentHistoryItemRefHasBase: new RawContextKey("scmCurrentHistoryItemRefHasBase", false),
  SCMCurrentHistoryItemRefInFilter: new RawContextKey("scmCurrentHistoryItemRefInFilter", false),
  RepositoryCount: new RawContextKey("scmRepositoryCount", 0),
  RepositoryVisibilityCount: new RawContextKey("scmRepositoryVisibleCount", 0),
  RepositoryVisibility(repository) {
    return new RawContextKey(`scmRepositoryVisible:${repository.provider.id}`, false);
  }
};
MenuRegistry.appendMenuItem(MenuId.SCMTitle, {
  title: localize("sortAction", "View & Sort"),
  submenu: Menus.ViewSort,
  when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_PANE_ID), ContextKeys.RepositoryCount.notEqualsTo(0)),
  group: "0_view&sort",
  order: 1
});
MenuRegistry.appendMenuItem(Menus.ViewSort, {
  title: localize("repositories", "Repositories"),
  submenu: Menus.Repositories,
  when: ContextKeyExpr.greater(ContextKeys.RepositoryCount.key, 1),
  group: "0_repositories"
});
class RepositoryVisibilityAction extends Action2 {
  constructor(repository) {
    super({
      id: `workbench.scm.action.toggleRepositoryVisibility.${repository.provider.id}`,
      title: repository.provider.name,
      f1: false,
      precondition: ContextKeyExpr.or(ContextKeys.RepositoryVisibilityCount.notEqualsTo(1), ContextKeys.RepositoryVisibility(repository).isEqualTo(false)),
      toggled: ContextKeys.RepositoryVisibility(repository).isEqualTo(true),
      menu: { id: Menus.Repositories, group: "0_repositories" }
    });
    this.repository = repository;
  }
  run(accessor) {
    const scmViewService = accessor.get(ISCMViewService);
    scmViewService.toggleVisibility(this.repository);
  }
}
let RepositoryVisibilityActionController = class {
  constructor(contextKeyService, scmViewService, scmService) {
    this.contextKeyService = contextKeyService;
    this.scmViewService = scmViewService;
    this.items = /* @__PURE__ */ new Map();
    this.disposables = new DisposableStore();
    this.repositoryCountContextKey = ContextKeys.RepositoryCount.bindTo(contextKeyService);
    this.repositoryVisibilityCountContextKey = ContextKeys.RepositoryVisibilityCount.bindTo(contextKeyService);
    scmViewService.onDidChangeVisibleRepositories(this.onDidChangeVisibleRepositories, this, this.disposables);
    scmService.onDidAddRepository(this.onDidAddRepository, this, this.disposables);
    scmService.onDidRemoveRepository(this.onDidRemoveRepository, this, this.disposables);
    for (const repository of scmService.repositories) {
      this.onDidAddRepository(repository);
    }
  }
  onDidAddRepository(repository) {
    if (repository.provider.isHidden) {
      return;
    }
    const action = registerAction2(class extends RepositoryVisibilityAction {
      constructor() {
        super(repository);
      }
    });
    const contextKey = ContextKeys.RepositoryVisibility(repository).bindTo(this.contextKeyService);
    contextKey.set(this.scmViewService.isVisible(repository));
    this.items.set(repository, {
      contextKey,
      dispose() {
        contextKey.reset();
        action.dispose();
      }
    });
    this.updateRepositoryContextKeys();
  }
  onDidRemoveRepository(repository) {
    this.items.get(repository)?.dispose();
    this.items.delete(repository);
    this.updateRepositoryContextKeys();
  }
  onDidChangeVisibleRepositories() {
    let count = 0;
    for (const [repository, item] of this.items) {
      const isVisible = this.scmViewService.isVisible(repository);
      item.contextKey.set(isVisible);
      if (isVisible) {
        count++;
      }
    }
    this.repositoryCountContextKey.set(this.items.size);
    this.repositoryVisibilityCountContextKey.set(count);
  }
  updateRepositoryContextKeys() {
    this.repositoryCountContextKey.set(this.items.size);
    this.repositoryVisibilityCountContextKey.set(Iterable.reduce(this.items.keys(), (r, repository) => r + (this.scmViewService.isVisible(repository) ? 1 : 0), 0));
  }
  dispose() {
    this.disposables.dispose();
    dispose(this.items.values());
    this.items.clear();
  }
};
RepositoryVisibilityActionController = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, ISCMViewService),
  __decorateParam(2, ISCMService)
], RepositoryVisibilityActionController);
class SetListViewModeAction extends ViewAction {
  constructor(id = "workbench.scm.action.setListViewMode", menu = {}) {
    super({
      id,
      title: localize("setListViewMode", "View as List"),
      viewId: VIEW_PANE_ID,
      f1: false,
      icon: Codicon.listTree,
      toggled: ContextKeys.SCMViewMode.isEqualTo(ViewMode.List),
      menu: { id: Menus.ViewSort, group: "1_viewmode", ...menu }
    });
  }
  async runInView(_, view) {
    view.viewMode = ViewMode.List;
  }
}
class SetListViewModeNavigationAction extends SetListViewModeAction {
  constructor() {
    super(
      "workbench.scm.action.setListViewModeNavigation",
      {
        id: MenuId.SCMTitle,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_PANE_ID), ContextKeys.RepositoryCount.notEqualsTo(0), ContextKeys.SCMViewMode.isEqualTo(ViewMode.Tree)),
        group: "navigation",
        isHiddenByDefault: true,
        order: -1e3
      }
    );
  }
}
class SetTreeViewModeAction extends ViewAction {
  constructor(id = "workbench.scm.action.setTreeViewMode", menu = {}) {
    super(
      {
        id,
        title: localize("setTreeViewMode", "View as Tree"),
        viewId: VIEW_PANE_ID,
        f1: false,
        icon: Codicon.listFlat,
        toggled: ContextKeys.SCMViewMode.isEqualTo(ViewMode.Tree),
        menu: { id: Menus.ViewSort, group: "1_viewmode", ...menu }
      }
    );
  }
  async runInView(_, view) {
    view.viewMode = ViewMode.Tree;
  }
}
class SetTreeViewModeNavigationAction extends SetTreeViewModeAction {
  constructor() {
    super(
      "workbench.scm.action.setTreeViewModeNavigation",
      {
        id: MenuId.SCMTitle,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_PANE_ID), ContextKeys.RepositoryCount.notEqualsTo(0), ContextKeys.SCMViewMode.isEqualTo(ViewMode.List)),
        group: "navigation",
        isHiddenByDefault: true,
        order: -1e3
      }
    );
  }
}
registerAction2(SetListViewModeAction);
registerAction2(SetTreeViewModeAction);
registerAction2(SetListViewModeNavigationAction);
registerAction2(SetTreeViewModeNavigationAction);
class RepositorySortAction extends Action2 {
  constructor(sortKey, title) {
    super({
      id: `workbench.scm.action.repositories.setSortKey.${sortKey}`,
      title,
      f1: false,
      toggled: RepositoryContextKeys.RepositorySortKey.isEqualTo(sortKey),
      menu: [
        {
          id: Menus.Repositories,
          group: "1_sort"
        },
        {
          id: MenuId.SCMSourceControlTitle,
          group: "1_sort"
        }
      ]
    });
    this.sortKey = sortKey;
  }
  run(accessor) {
    accessor.get(ISCMViewService).toggleSortKey(this.sortKey);
  }
}
class RepositorySortByDiscoveryTimeAction extends RepositorySortAction {
  constructor() {
    super(ISCMRepositorySortKey.DiscoveryTime, localize("repositorySortByDiscoveryTime", "Sort by Discovery Time"));
  }
}
class RepositorySortByNameAction extends RepositorySortAction {
  constructor() {
    super(ISCMRepositorySortKey.Name, localize("repositorySortByName", "Sort by Name"));
  }
}
class RepositorySortByPathAction extends RepositorySortAction {
  constructor() {
    super(ISCMRepositorySortKey.Path, localize("repositorySortByPath", "Sort by Path"));
  }
}
registerAction2(RepositorySortByDiscoveryTimeAction);
registerAction2(RepositorySortByNameAction);
registerAction2(RepositorySortByPathAction);
class RepositorySelectionModeAction extends Action2 {
  constructor(selectionMode, title, order) {
    super({
      id: `workbench.scm.action.repositories.setSelectionMode.${selectionMode}`,
      title,
      f1: false,
      toggled: RepositoryContextKeys.RepositorySelectionMode.isEqualTo(selectionMode),
      menu: [
        {
          id: Menus.Repositories,
          when: ContextKeyExpr.and(
            ContextKeyExpr.has("scm.providerCount"),
            ContextKeyExpr.greater("scm.providerCount", 1)
          ),
          group: "2_selectionMode",
          order
        },
        {
          id: MenuId.SCMSourceControlTitle,
          when: ContextKeyExpr.and(
            ContextKeyExpr.has("scm.providerCount"),
            ContextKeyExpr.greater("scm.providerCount", 1)
          ),
          group: "2_selectionMode",
          order
        }
      ]
    });
    this.selectionMode = selectionMode;
  }
  run(accessor) {
    accessor.get(ISCMViewService).toggleSelectionMode(this.selectionMode);
  }
}
class RepositorySingleSelectionModeAction extends RepositorySelectionModeAction {
  constructor() {
    super(ISCMRepositorySelectionMode.Single, localize("repositorySingleSelectionMode", "Select Single Repository"), 1);
  }
}
class RepositoryMultiSelectionModeAction extends RepositorySelectionModeAction {
  constructor() {
    super(ISCMRepositorySelectionMode.Multiple, localize("repositoryMultiSelectionMode", "Select Multiple Repositories"), 2);
  }
}
registerAction2(RepositorySingleSelectionModeAction);
registerAction2(RepositoryMultiSelectionModeAction);
class SetSortKeyAction extends ViewAction {
  constructor(sortKey, title) {
    super({
      id: `workbench.scm.action.setSortKey.${sortKey}`,
      title,
      viewId: VIEW_PANE_ID,
      f1: false,
      toggled: ContextKeys.SCMViewSortKey.isEqualTo(sortKey),
      precondition: ContextKeys.SCMViewMode.isEqualTo(ViewMode.List),
      menu: { id: Menus.ViewSort, group: "2_sort" }
    });
    this.sortKey = sortKey;
  }
  async runInView(_, view) {
    view.viewSortKey = this.sortKey;
  }
}
class SetSortByNameAction extends SetSortKeyAction {
  constructor() {
    super("name" /* Name */, localize("sortChangesByName", "Sort Changes by Name"));
  }
}
class SetSortByPathAction extends SetSortKeyAction {
  constructor() {
    super("path" /* Path */, localize("sortChangesByPath", "Sort Changes by Path"));
  }
}
class SetSortByStatusAction extends SetSortKeyAction {
  constructor() {
    super("status" /* Status */, localize("sortChangesByStatus", "Sort Changes by Status"));
  }
}
registerAction2(SetSortByNameAction);
registerAction2(SetSortByPathAction);
registerAction2(SetSortByStatusAction);
class CollapseAllRepositoriesAction extends ViewAction {
  constructor() {
    super({
      id: `workbench.scm.action.collapseAllRepositories`,
      title: localize("collapse all", "Collapse All Repositories"),
      viewId: VIEW_PANE_ID,
      f1: false,
      icon: Codicon.collapseAll,
      menu: {
        id: MenuId.SCMTitle,
        group: "navigation",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_PANE_ID), ContextKeys.SCMViewIsAnyRepositoryCollapsible.isEqualTo(true), ContextKeys.SCMViewAreAllRepositoriesCollapsed.isEqualTo(false))
      }
    });
  }
  async runInView(_, view) {
    view.collapseAllRepositories();
  }
}
class ExpandAllRepositoriesAction extends ViewAction {
  constructor() {
    super({
      id: `workbench.scm.action.expandAllRepositories`,
      title: localize("expand all", "Expand All Repositories"),
      viewId: VIEW_PANE_ID,
      f1: false,
      icon: Codicon.expandAll,
      menu: {
        id: MenuId.SCMTitle,
        group: "navigation",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_PANE_ID), ContextKeys.SCMViewIsAnyRepositoryCollapsible.isEqualTo(true), ContextKeys.SCMViewAreAllRepositoriesCollapsed.isEqualTo(true))
      }
    });
  }
  async runInView(_, view) {
    view.expandAllRepositories();
  }
}
registerAction2(CollapseAllRepositoriesAction);
registerAction2(ExpandAllRepositoriesAction);
class CollapseAllAction extends ViewAction {
  constructor() {
    super({
      id: `workbench.scm.action.collapseAll`,
      title: localize("scmCollapseAll", "Collapse All"),
      viewId: VIEW_PANE_ID,
      f1: false,
      icon: Codicon.collapseAll,
      menu: {
        id: MenuId.SCMResourceGroupContext,
        group: "9_collapse",
        when: ContextKeys.SCMViewMode.isEqualTo(ViewMode.Tree)
      }
    });
  }
  async runInView(_accessor, view, context) {
    if (context) {
      view.collapseAllResources(context);
    }
  }
}
registerAction2(CollapseAllAction);
let SCMViewPane = class extends ViewPane {
  constructor(options, commandService, editorService, menuService, scmService, scmViewService, storageService, uriIdentityService, keybindingService, themeService, contextMenuService, instantiationService, viewDescriptorService, configurationService, contextKeyService, openerService, hoverService) {
    super({ ...options, titleMenuId: MenuId.SCMTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.commandService = commandService;
    this.editorService = editorService;
    this.menuService = menuService;
    this.scmService = scmService;
    this.scmViewService = scmViewService;
    this.storageService = storageService;
    this.uriIdentityService = uriIdentityService;
    this._onDidChangeViewMode = this._register(new Emitter());
    this.onDidChangeViewMode = this._onDidChangeViewMode.event;
    this._onDidChangeViewSortKey = this._register(new Emitter());
    this.onDidChangeViewSortKey = this._onDidChangeViewSortKey.event;
    this.items = new DisposableMap();
    this.visibilityDisposables = new DisposableStore();
    this.treeOperationSequencer = new Sequencer();
    this.revealResourceThrottler = new Throttler();
    this.updateChildrenThrottler = new Throttler();
    this.disposables = new DisposableStore();
    this._viewMode = this.getViewMode();
    this._viewSortKey = this.getViewSortKey();
    this.viewModeContextKey = ContextKeys.SCMViewMode.bindTo(contextKeyService);
    this.viewModeContextKey.set(this._viewMode);
    this.viewSortKeyContextKey = ContextKeys.SCMViewSortKey.bindTo(contextKeyService);
    this.viewSortKeyContextKey.set(this.viewSortKey);
    this.areAllRepositoriesCollapsedContextKey = ContextKeys.SCMViewAreAllRepositoriesCollapsed.bindTo(contextKeyService);
    this.isAnyRepositoryCollapsibleContextKey = ContextKeys.SCMViewIsAnyRepositoryCollapsible.bindTo(contextKeyService);
    this.scmProviderContextKey = ContextKeys.SCMProvider.bindTo(contextKeyService);
    this.scmProviderRootUriContextKey = ContextKeys.SCMProviderRootUri.bindTo(contextKeyService);
    this.scmProviderHasRootUriContextKey = ContextKeys.SCMProviderHasRootUri.bindTo(contextKeyService);
    this._onDidLayout = this._register(new Emitter());
    this.layoutCache = { height: void 0, width: void 0, onDidChange: this._onDidLayout.event };
    this.storageService.onDidChangeValue(StorageScope.WORKSPACE, void 0, this.disposables)((e) => {
      switch (e.key) {
        case "scm.viewMode":
          this.viewMode = this.getViewMode();
          break;
        case "scm.viewSortKey":
          this.viewSortKey = this.getViewSortKey();
          break;
      }
    }, this, this.disposables);
    this.storageService.onWillSaveState((e) => {
      this.viewMode = this.getViewMode();
      this.viewSortKey = this.getViewSortKey();
      this.storeTreeViewState();
    }, this, this.disposables);
    Event.any(this.scmService.onDidAddRepository, this.scmService.onDidRemoveRepository)(() => this._onDidChangeViewWelcomeState.fire(), this, this.disposables);
    this.disposables.add(this.revealResourceThrottler);
    this.disposables.add(this.updateChildrenThrottler);
  }
  get viewMode() {
    return this._viewMode;
  }
  set viewMode(mode) {
    if (this._viewMode === mode) {
      return;
    }
    this._viewMode = mode;
    this.viewSortKey = this.getViewSortKey();
    this.updateChildren();
    this.onDidActiveEditorChange();
    this._onDidChangeViewMode.fire(mode);
    this.viewModeContextKey.set(mode);
    this.updateIndentStyles(this.themeService.getFileIconTheme());
    this.storageService.store(`scm.viewMode`, mode, StorageScope.WORKSPACE, StorageTarget.USER);
  }
  get viewSortKey() {
    return this._viewSortKey;
  }
  set viewSortKey(sortKey) {
    if (this._viewSortKey === sortKey) {
      return;
    }
    this._viewSortKey = sortKey;
    this.updateChildren();
    this.viewSortKeyContextKey.set(sortKey);
    this._onDidChangeViewSortKey.fire(sortKey);
    if (this._viewMode === ViewMode.List) {
      this.storageService.store(`scm.viewSortKey`, sortKey, StorageScope.WORKSPACE, StorageTarget.USER);
    }
  }
  layoutBody(height = this.layoutCache.height, width = this.layoutCache.width) {
    if (height === void 0) {
      return;
    }
    if (width !== void 0) {
      super.layoutBody(height, width);
    }
    this.layoutCache.height = height;
    this.layoutCache.width = width;
    this._onDidLayout.fire();
    this.treeContainer.style.height = `${height}px`;
    this.tree.layout(height, width);
  }
  renderBody(container) {
    super.renderBody(container);
    this.treeContainer = append(container, $(".scm-view.show-file-icons"));
    this.treeContainer.classList.add("file-icon-themable-tree");
    this.treeContainer.classList.add("show-file-icons");
    const updateActionsVisibility = () => this.treeContainer.classList.toggle("show-actions", this.configurationService.getValue("scm.alwaysShowActions"));
    Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("scm.alwaysShowActions"), this.disposables)(updateActionsVisibility, this, this.disposables);
    updateActionsVisibility();
    const updateProviderCountVisibility = () => {
      const value = this.configurationService.getValue("scm.providerCountBadge");
      this.treeContainer.classList.toggle("hide-provider-counts", value === "hidden");
      this.treeContainer.classList.toggle("auto-provider-counts", value === "auto");
    };
    Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("scm.providerCountBadge"), this.disposables)(updateProviderCountVisibility, this, this.disposables);
    updateProviderCountVisibility();
    const viewState = this.loadTreeViewState();
    this.createTree(this.treeContainer, viewState);
    this.onDidChangeBodyVisibility(async (visible) => {
      if (visible) {
        this.treeOperationSequencer.queue(async () => {
          await this.tree.setInput(this.scmViewService, viewState);
          Event.filter(
            this.configurationService.onDidChangeConfiguration,
            (e) => e.affectsConfiguration("scm.alwaysShowRepositories"),
            this.visibilityDisposables
          )(() => {
            this.updateActions();
            this.updateChildren();
          }, this, this.visibilityDisposables);
          Event.filter(
            this.configurationService.onDidChangeConfiguration,
            (e) => e.affectsConfiguration("scm.inputMinLineCount") || e.affectsConfiguration("scm.inputMaxLineCount") || e.affectsConfiguration("scm.showActionButton"),
            this.visibilityDisposables
          )(() => this.updateChildren(), this, this.visibilityDisposables);
          this.editorService.onDidActiveEditorChange(this.onDidActiveEditorChange, this, this.visibilityDisposables);
          this.scmViewService.onDidChangeVisibleRepositories(this.onDidChangeVisibleRepositories, this, this.visibilityDisposables);
          this.onDidChangeVisibleRepositories({ added: this.scmViewService.visibleRepositories, removed: Iterable.empty() });
          if (typeof this.treeScrollTop === "number") {
            this.tree.scrollTop = this.treeScrollTop;
            this.treeScrollTop = void 0;
          }
          this.updateRepositoryCollapseAllContextKeys();
        });
      } else {
        this.visibilityDisposables.clear();
        this.onDidChangeVisibleRepositories({ added: Iterable.empty(), removed: [...this.items.keys()] });
        this.treeScrollTop = this.tree.scrollTop;
        this.updateRepositoryCollapseAllContextKeys();
      }
    }, this, this.disposables);
    this.disposables.add(this.instantiationService.createInstance(RepositoryVisibilityActionController));
    this.themeService.onDidFileIconThemeChange(this.updateIndentStyles, this, this.disposables);
    this.updateIndentStyles(this.themeService.getFileIconTheme());
  }
  createTree(container, viewState) {
    const overflowWidgetsDomNode = $(".scm-overflow-widgets-container.monaco-editor");
    this.inputRenderer = this.instantiationService.createInstance(InputRenderer, this.layoutCache, overflowWidgetsDomNode, (input, height) => {
      try {
        this.tree.updateElementHeight(input, height);
      } catch {
      }
    });
    this.actionButtonRenderer = this.instantiationService.createInstance(ActionButtonRenderer);
    this.listLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
    this.disposables.add(this.listLabels);
    const resourceActionRunner = new RepositoryPaneActionRunner(() => this.getSelectedResources());
    resourceActionRunner.onWillRun(() => this.tree.domFocus(), this, this.disposables);
    this.disposables.add(resourceActionRunner);
    const treeDataSource = this.instantiationService.createInstance(SCMTreeDataSource, () => this.viewMode);
    this.disposables.add(treeDataSource);
    const compressionEnabled = observableConfigValue("scm.compactFolders", true, this.configurationService);
    this.tree = this.instantiationService.createInstance(
      WorkbenchCompressibleAsyncDataTree,
      "SCM Tree Repo",
      container,
      new ListDelegate(this.inputRenderer),
      new SCMTreeCompressionDelegate(),
      [
        this.inputRenderer,
        this.actionButtonRenderer,
        this.instantiationService.createInstance(RepositoryRenderer, MenuId.SCMTitle, getActionViewItemProvider(this.instantiationService)),
        this.instantiationService.createInstance(ResourceGroupRenderer, getActionViewItemProvider(this.instantiationService), resourceActionRunner),
        this.disposables.add(this.instantiationService.createInstance(ResourceRenderer, () => this.viewMode, this.listLabels, getActionViewItemProvider(this.instantiationService), resourceActionRunner))
      ],
      treeDataSource,
      {
        horizontalScrolling: false,
        setRowLineHeight: false,
        transformOptimization: false,
        filter: new SCMTreeFilter(),
        dnd: new SCMTreeDragAndDrop(this.instantiationService),
        identityProvider: new SCMResourceIdentityProvider(),
        sorter: new SCMTreeSorter(() => this.viewMode, () => this.viewSortKey),
        keyboardNavigationLabelProvider: this.instantiationService.createInstance(SCMTreeKeyboardNavigationLabelProvider, () => this.viewMode),
        overrideStyles: this.getLocationBasedColors().listOverrideStyles,
        compressionEnabled: compressionEnabled.get(),
        collapseByDefault: (e) => {
          return !(isSCMRepository(e) || isSCMResourceGroup(e) || isSCMResourceNode(e));
        },
        accessibilityProvider: this.instantiationService.createInstance(SCMAccessibilityProvider),
        twistieAdditionalCssClass: (e) => {
          if (isSCMActionButton(e) || isSCMInput(e)) {
            return "force-no-twistie";
          }
          return void 0;
        }
      }
    );
    this.disposables.add(this.tree);
    this.tree.onDidOpen(this.open, this, this.disposables);
    this.tree.onContextMenu(this.onListContextMenu, this, this.disposables);
    this.tree.onDidScroll(this.inputRenderer.clearValidation, this.inputRenderer, this.disposables);
    Event.filter(this.tree.onDidChangeCollapseState, (e) => isSCMRepository(e.node.element?.element), this.disposables)(this.updateRepositoryCollapseAllContextKeys, this, this.disposables);
    this.disposables.add(autorun((reader) => {
      this.tree.updateOptions({
        compressionEnabled: compressionEnabled.read(reader)
      });
    }));
    append(container, overflowWidgetsDomNode);
  }
  async open(e) {
    if (!e.element) {
      return;
    } else if (isSCMRepository(e.element)) {
      this.scmViewService.focus(e.element);
      return;
    } else if (isSCMInput(e.element)) {
      this.scmViewService.focus(e.element.repository);
      const widget = this.inputRenderer.getRenderedInputWidget(e.element);
      if (widget) {
        widget.focus();
        this.tree.setFocus([], e.browserEvent);
        const selection = this.tree.getSelection();
        if (selection.length === 1 && selection[0] === e.element) {
          setTimeout(() => this.tree.setSelection([]));
        }
      }
      return;
    } else if (isSCMActionButton(e.element)) {
      this.scmViewService.focus(e.element.repository);
      this.actionButtonRenderer.focusActionButton(e.element);
      this.tree.setFocus([], e.browserEvent);
      return;
    } else if (isSCMResourceGroup(e.element)) {
      const provider = e.element.provider;
      const repository = Iterable.find(this.scmService.repositories, (r) => r.provider === provider);
      if (repository) {
        this.scmViewService.focus(repository);
      }
      return;
    } else if (isSCMResource(e.element)) {
      if (e.element.command?.id === API_OPEN_EDITOR_COMMAND_ID || e.element.command?.id === API_OPEN_DIFF_EDITOR_COMMAND_ID) {
        if (isPointerEvent(e.browserEvent) && e.browserEvent.button === 1) {
          const resourceGroup = e.element.resourceGroup;
          const title = `${resourceGroup.provider.label}: ${resourceGroup.label}`;
          await OpenScmGroupAction.openMultiFileDiffEditor(this.editorService, title, resourceGroup.provider.rootUri, resourceGroup.id, {
            ...e.editorOptions,
            viewState: {
              revealData: {
                resource: {
                  original: e.element.multiDiffEditorOriginalUri,
                  modified: e.element.multiDiffEditorModifiedUri
                }
              }
            },
            preserveFocus: true
          });
        } else {
          await this.commandService.executeCommand(e.element.command.id, ...e.element.command.arguments || [], e);
        }
      } else {
        await e.element.open(!!e.editorOptions.preserveFocus);
        if (e.editorOptions.pinned) {
          const activeEditorPane = this.editorService.activeEditorPane;
          activeEditorPane?.group.pinEditor(activeEditorPane.input);
        }
      }
      const provider = e.element.resourceGroup.provider;
      const repository = Iterable.find(this.scmService.repositories, (r) => r.provider === provider);
      if (repository) {
        this.scmViewService.focus(repository);
      }
    } else if (isSCMResourceNode(e.element)) {
      const provider = e.element.context.provider;
      const repository = Iterable.find(this.scmService.repositories, (r) => r.provider === provider);
      if (repository) {
        this.scmViewService.focus(repository);
      }
      return;
    }
  }
  onDidActiveEditorChange() {
    if (!this.configurationService.getValue("scm.autoReveal")) {
      return;
    }
    const uri = EditorResourceAccessor.getOriginalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (!uri) {
      return;
    }
    if (this.tree.getFocus().some((e) => isSCMResource(e) && this.uriIdentityService.extUri.isEqual(e.sourceUri, uri)) && this.tree.getSelection().some((e) => isSCMResource(e) && this.uriIdentityService.extUri.isEqual(e.sourceUri, uri))) {
      return;
    }
    this.revealResourceThrottler.queue(
      () => this.treeOperationSequencer.queue(
        async () => {
          for (const repository of this.scmViewService.visibleRepositories) {
            const item = this.items.get(repository);
            if (!item) {
              continue;
            }
            for (let j = repository.provider.groups.length - 1; j >= 0; j--) {
              const groupItem = repository.provider.groups[j];
              const resource = this.viewMode === ViewMode.Tree ? groupItem.resourceTree.getNode(uri)?.element : groupItem.resources.find((r) => this.uriIdentityService.extUri.isEqual(r.sourceUri, uri));
              if (resource) {
                await this.tree.expandTo(resource);
                this.tree.reveal(resource);
                this.tree.setSelection([resource]);
                this.tree.setFocus([resource]);
                return;
              }
            }
          }
        }
      )
    );
  }
  onDidChangeVisibleRepositories({ added, removed }) {
    for (const repository of added) {
      const repositoryDisposables = new DisposableStore();
      repositoryDisposables.add(autorun((reader) => {
        repository.provider.actionButton.read(reader);
        this.updateChildren(repository);
      }));
      repositoryDisposables.add(repository.input.onDidChangeVisibility(() => this.updateChildren(repository)));
      repositoryDisposables.add(repository.provider.onDidChangeResourceGroups(() => this.updateChildren(repository)));
      const resourceGroupDisposables = repositoryDisposables.add(new DisposableMap());
      const onDidChangeResourceGroups = () => {
        for (const [resourceGroup] of resourceGroupDisposables) {
          if (!repository.provider.groups.includes(resourceGroup)) {
            resourceGroupDisposables.deleteAndDispose(resourceGroup);
          }
        }
        for (const resourceGroup of repository.provider.groups) {
          if (!resourceGroupDisposables.has(resourceGroup)) {
            const disposableStore = new DisposableStore();
            disposableStore.add(resourceGroup.onDidChange(() => this.updateChildren(repository)));
            disposableStore.add(resourceGroup.onDidChangeResources(() => this.updateChildren(repository)));
            resourceGroupDisposables.set(resourceGroup, disposableStore);
          }
        }
      };
      repositoryDisposables.add(repository.provider.onDidChangeResourceGroups(onDidChangeResourceGroups));
      onDidChangeResourceGroups();
      this.items.set(repository, repositoryDisposables);
    }
    for (const repository of removed) {
      this.items.deleteAndDispose(repository);
    }
    this.updateChildren();
    this.onDidActiveEditorChange();
  }
  onListContextMenu(e) {
    if (!e.element) {
      const menu = this.menuService.getMenuActions(Menus.ViewSort, this.contextKeyService);
      const actions2 = getFlatContextMenuActions(menu);
      return this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => actions2,
        onHide: () => {
        }
      });
    }
    const element = e.element;
    let context = element;
    let actions = [];
    const disposables = new DisposableStore();
    let actionRunner = new RepositoryPaneActionRunner(() => this.getSelectedResources());
    disposables.add(actionRunner);
    if (isSCMRepository(element)) {
      const menus = this.scmViewService.menus.getRepositoryMenus(element.provider);
      const menu = menus.getRepositoryContextMenu(element);
      context = element.provider;
      actionRunner = new RepositoryActionRunner(() => this.getSelectedRepositories());
      disposables.add(actionRunner);
      actions = collectContextMenuActions(menu);
    } else if (isSCMInput(element) || isSCMActionButton(element)) {
    } else if (isSCMResourceGroup(element)) {
      const menus = this.scmViewService.menus.getRepositoryMenus(element.provider);
      const menu = menus.getResourceGroupMenu(element);
      actions = collectContextMenuActions(menu);
    } else if (isSCMResource(element)) {
      const menus = this.scmViewService.menus.getRepositoryMenus(element.resourceGroup.provider);
      const menu = menus.getResourceMenu(element);
      actions = collectContextMenuActions(menu);
    } else if (isSCMResourceNode(element)) {
      if (element.element) {
        const menus = this.scmViewService.menus.getRepositoryMenus(element.element.resourceGroup.provider);
        const menu = menus.getResourceMenu(element.element);
        actions = collectContextMenuActions(menu);
      } else {
        const menus = this.scmViewService.menus.getRepositoryMenus(element.context.provider);
        const menu = menus.getResourceFolderMenu(element.context);
        actions = collectContextMenuActions(menu);
      }
    }
    disposables.add(actionRunner.onWillRun(() => this.tree.domFocus()));
    this.contextMenuService.showContextMenu({
      actionRunner,
      getAnchor: () => e.anchor,
      getActions: () => actions,
      getActionsContext: () => context,
      onHide: () => disposables.dispose()
    });
  }
  getSelectedRepositories() {
    const focusedRepositories = this.tree.getFocus().filter((r) => !!r && isSCMRepository(r));
    const selectedRepositories = this.tree.getSelection().filter((r) => !!r && isSCMRepository(r));
    return Array.from(/* @__PURE__ */ new Set([...focusedRepositories, ...selectedRepositories]));
  }
  getSelectedResources() {
    return this.tree.getSelection().filter((r) => isSCMResourceGroup(r) || isSCMResource(r) || isSCMResourceNode(r));
  }
  getViewMode() {
    let mode = this.configurationService.getValue("scm.defaultViewMode") === "list" ? ViewMode.List : ViewMode.Tree;
    const storageMode = this.storageService.get(`scm.viewMode`, StorageScope.WORKSPACE);
    if (typeof storageMode === "string") {
      mode = storageMode;
    }
    return mode;
  }
  getViewSortKey() {
    if (this._viewMode === ViewMode.Tree) {
      return "path" /* Path */;
    }
    let viewSortKey;
    const viewSortKeyString = this.configurationService.getValue("scm.defaultViewSortKey");
    switch (viewSortKeyString) {
      case "name":
        viewSortKey = "name" /* Name */;
        break;
      case "status":
        viewSortKey = "status" /* Status */;
        break;
      default:
        viewSortKey = "path" /* Path */;
        break;
    }
    const storageSortKey = this.storageService.get(`scm.viewSortKey`, StorageScope.WORKSPACE);
    if (typeof storageSortKey === "string") {
      viewSortKey = storageSortKey;
    }
    return viewSortKey;
  }
  loadTreeViewState() {
    const storageViewState = this.storageService.get("scm.viewState2", StorageScope.WORKSPACE);
    if (!storageViewState) {
      return void 0;
    }
    try {
      const treeViewState = JSON.parse(storageViewState);
      return treeViewState;
    } catch {
      return void 0;
    }
  }
  storeTreeViewState() {
    if (this.tree) {
      this.storageService.store("scm.viewState2", JSON.stringify(this.tree.getViewState()), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
  }
  updateChildren(element) {
    this.updateChildrenThrottler.queue(
      () => this.treeOperationSequencer.queue(
        async () => {
          const focusedInput = this.inputRenderer.getFocusedInput();
          if (element && this.tree.hasNode(element)) {
            await this.tree.updateChildren(element);
          } else {
            await this.tree.updateChildren(void 0);
          }
          if (focusedInput) {
            this.inputRenderer.getRenderedInputWidget(focusedInput)?.focus();
          }
          this.updateScmProviderContextKeys();
          this.updateRepositoryCollapseAllContextKeys();
        }
      )
    );
  }
  updateIndentStyles(theme) {
    this.treeContainer.classList.toggle("list-view-mode", this.viewMode === ViewMode.List);
    this.treeContainer.classList.toggle("tree-view-mode", this.viewMode === ViewMode.Tree);
    this.treeContainer.classList.toggle("align-icons-and-twisties", this.viewMode === ViewMode.List && theme.hasFileIcons || theme.hasFileIcons && !theme.hasFolderIcons);
    this.treeContainer.classList.toggle("hide-arrows", this.viewMode === ViewMode.Tree && theme.hidesExplorerArrows === true);
  }
  updateScmProviderContextKeys() {
    const alwaysShowRepositories = this.configurationService.getValue("scm.alwaysShowRepositories");
    if (!alwaysShowRepositories && this.items.size === 1) {
      const provider = Iterable.first(this.items.keys()).provider;
      this.scmProviderContextKey.set(provider.providerId);
      this.scmProviderRootUriContextKey.set(provider.rootUri?.toString());
      this.scmProviderHasRootUriContextKey.set(!!provider.rootUri);
    } else {
      this.scmProviderContextKey.set(void 0);
      this.scmProviderRootUriContextKey.set(void 0);
      this.scmProviderHasRootUriContextKey.set(false);
    }
  }
  updateRepositoryCollapseAllContextKeys() {
    if (!this.isBodyVisible() || this.items.size === 1) {
      this.isAnyRepositoryCollapsibleContextKey.set(false);
      this.areAllRepositoriesCollapsedContextKey.set(false);
      return;
    }
    this.isAnyRepositoryCollapsibleContextKey.set(this.scmViewService.visibleRepositories.some((r) => this.tree.hasNode(r) && this.tree.isCollapsible(r)));
    this.areAllRepositoriesCollapsedContextKey.set(this.scmViewService.visibleRepositories.every((r) => this.tree.hasNode(r) && (!this.tree.isCollapsible(r) || this.tree.isCollapsed(r))));
  }
  collapseAllRepositories() {
    for (const repository of this.scmViewService.visibleRepositories) {
      if (this.tree.isCollapsible(repository)) {
        this.tree.collapse(repository);
      }
    }
  }
  expandAllRepositories() {
    for (const repository of this.scmViewService.visibleRepositories) {
      if (this.tree.isCollapsible(repository)) {
        this.tree.expand(repository);
      }
    }
  }
  collapseAllResources(group) {
    for (const { element } of this.tree.getNode(group).children) {
      if (!isSCMViewService(element)) {
        this.tree.collapse(element, true);
      }
    }
  }
  focusPreviousInput() {
    this.treeOperationSequencer.queue(() => this.focusInput(-1));
  }
  focusNextInput() {
    this.treeOperationSequencer.queue(() => this.focusInput(1));
  }
  async focusInput(delta) {
    if (!this.scmViewService.focusedRepository || this.scmViewService.visibleRepositories.length === 0) {
      return;
    }
    let input = this.scmViewService.focusedRepository.input;
    const repositories = this.scmViewService.visibleRepositories;
    if (repositories.length === 1 && this.inputRenderer.getRenderedInputWidget(input)?.hasFocus() === true) {
      return;
    }
    if (repositories.length > 1 && this.inputRenderer.getRenderedInputWidget(input)?.hasFocus() === true) {
      const focusedRepositoryIndex = repositories.indexOf(this.scmViewService.focusedRepository);
      const newFocusedRepositoryIndex = rot(focusedRepositoryIndex + delta, repositories.length);
      input = repositories[newFocusedRepositoryIndex].input;
    }
    await this.tree.expandTo(input);
    this.tree.reveal(input);
    this.inputRenderer.getRenderedInputWidget(input)?.focus();
  }
  focusPreviousResourceGroup() {
    this.treeOperationSequencer.queue(() => this.focusResourceGroup(-1));
  }
  focusNextResourceGroup() {
    this.treeOperationSequencer.queue(() => this.focusResourceGroup(1));
  }
  async focusResourceGroup(delta) {
    if (!this.scmViewService.focusedRepository || this.scmViewService.visibleRepositories.length === 0) {
      return;
    }
    const treeHasDomFocus = isActiveElement(this.tree.getHTMLElement());
    const resourceGroups = this.scmViewService.focusedRepository.provider.groups;
    const focusedResourceGroup = this.tree.getFocus().find((e) => isSCMResourceGroup(e));
    const focusedResourceGroupIndex = treeHasDomFocus && focusedResourceGroup ? resourceGroups.indexOf(focusedResourceGroup) : -1;
    let resourceGroupNext;
    if (focusedResourceGroupIndex === -1) {
      for (const resourceGroup of resourceGroups) {
        if (this.tree.hasNode(resourceGroup)) {
          resourceGroupNext = resourceGroup;
          break;
        }
      }
    } else {
      let index = rot(focusedResourceGroupIndex + delta, resourceGroups.length);
      while (index !== focusedResourceGroupIndex) {
        if (this.tree.hasNode(resourceGroups[index])) {
          resourceGroupNext = resourceGroups[index];
          break;
        }
        index = rot(index + delta, resourceGroups.length);
      }
    }
    if (resourceGroupNext) {
      await this.tree.expandTo(resourceGroupNext);
      this.tree.reveal(resourceGroupNext);
      this.tree.setSelection([resourceGroupNext]);
      this.tree.setFocus([resourceGroupNext]);
      this.tree.domFocus();
    }
  }
  shouldShowWelcome() {
    return this.scmService.repositoryCount === 0;
  }
  getActionsContext() {
    return this.scmViewService.visibleRepositories.length === 1 ? this.scmViewService.visibleRepositories[0].provider : void 0;
  }
  focus() {
    super.focus();
    this.treeOperationSequencer.queue(() => {
      return new Promise((resolve) => {
        if (this.isExpanded()) {
          if (this.tree.getFocus().length === 0) {
            for (const repository of this.scmViewService.visibleRepositories) {
              const widget = this.inputRenderer.getRenderedInputWidget(repository.input);
              if (widget) {
                widget.focus();
                resolve();
                return;
              }
            }
          }
          this.tree.domFocus();
          resolve();
        }
      });
    });
  }
  dispose() {
    this._onDidChangeViewMode.dispose();
    this._onDidChangeViewSortKey.dispose();
    this.visibilityDisposables.dispose();
    this.disposables.dispose();
    this.items.dispose();
    super.dispose();
  }
};
SCMViewPane = __decorateClass([
  __decorateParam(1, ICommandService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IMenuService),
  __decorateParam(4, ISCMService),
  __decorateParam(5, ISCMViewService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IUriIdentityService),
  __decorateParam(8, IKeybindingService),
  __decorateParam(9, IThemeService),
  __decorateParam(10, IContextMenuService),
  __decorateParam(11, IInstantiationService),
  __decorateParam(12, IViewDescriptorService),
  __decorateParam(13, IConfigurationService),
  __decorateParam(14, IContextKeyService),
  __decorateParam(15, IOpenerService),
  __decorateParam(16, IHoverService)
], SCMViewPane);
let SCMTreeDataSource = class extends Disposable {
  constructor(viewMode, configurationService, scmViewService) {
    super();
    this.viewMode = viewMode;
    this.configurationService = configurationService;
    this.scmViewService = scmViewService;
  }
  async getChildren(inputOrElement) {
    const repositoryCount = this.scmViewService.visibleRepositories.length;
    const showActionButton = this.configurationService.getValue("scm.showActionButton") === true;
    const alwaysShowRepositories = this.configurationService.getValue("scm.alwaysShowRepositories") === true;
    if (isSCMViewService(inputOrElement) && (repositoryCount > 1 || alwaysShowRepositories)) {
      return this.scmViewService.visibleRepositories;
    } else if (isSCMViewService(inputOrElement) && repositoryCount === 1 && !alwaysShowRepositories || isSCMRepository(inputOrElement)) {
      const children = [];
      inputOrElement = isSCMRepository(inputOrElement) ? inputOrElement : this.scmViewService.visibleRepositories[0];
      const actionButton = inputOrElement.provider.actionButton.get();
      const resourceGroups = inputOrElement.provider.groups;
      if (inputOrElement.input.visible) {
        children.push(inputOrElement.input);
      }
      if (showActionButton && actionButton) {
        children.push({
          type: "actionButton",
          repository: inputOrElement,
          button: actionButton
        });
      }
      const hasSomeChanges = resourceGroups.some((group) => group.resources.length > 0);
      if (hasSomeChanges || repositoryCount === 1 && (!showActionButton || !actionButton)) {
        children.push(...resourceGroups);
      }
      return children;
    } else if (isSCMResourceGroup(inputOrElement)) {
      if (this.viewMode() === ViewMode.List) {
        return inputOrElement.resources;
      } else if (this.viewMode() === ViewMode.Tree) {
        const children = [];
        for (const node of inputOrElement.resourceTree.root.children) {
          children.push(node.element && node.childrenCount === 0 ? node.element : node);
        }
        return children;
      }
    } else if (isSCMResourceNode(inputOrElement)) {
      const children = [];
      for (const node of inputOrElement.children) {
        children.push(node.element && node.childrenCount === 0 ? node.element : node);
      }
      return children;
    }
    return [];
  }
  getParent(element) {
    if (isSCMResourceNode(element)) {
      if (element.parent === element.context.resourceTree.root) {
        return element.context;
      } else if (element.parent) {
        return element.parent;
      } else {
        throw new Error("Invalid element passed to getParent");
      }
    } else if (isSCMResource(element)) {
      if (this.viewMode() === ViewMode.List) {
        return element.resourceGroup;
      }
      const node = element.resourceGroup.resourceTree.getNode(element.sourceUri);
      const result = node?.parent;
      if (!result) {
        throw new Error("Invalid element passed to getParent");
      }
      if (result === element.resourceGroup.resourceTree.root) {
        return element.resourceGroup;
      }
      return result;
    } else if (isSCMInput(element)) {
      return element.repository;
    } else if (isSCMActionButton(element)) {
      return element.repository;
    } else if (isSCMResourceGroup(element)) {
      const repository = this.scmViewService.visibleRepositories.find((r) => r.provider === element.provider);
      if (!repository) {
        throw new Error("Invalid element passed to getParent");
      }
      return repository;
    } else if (isSCMRepository(element)) {
      return this.scmViewService;
    } else {
      throw new Error("Unexpected call to getParent");
    }
  }
  hasChildren(inputOrElement) {
    if (isSCMViewService(inputOrElement)) {
      return this.scmViewService.visibleRepositories.length !== 0;
    } else if (isSCMRepository(inputOrElement)) {
      return true;
    } else if (isSCMInput(inputOrElement)) {
      return false;
    } else if (isSCMActionButton(inputOrElement)) {
      return false;
    } else if (isSCMResourceGroup(inputOrElement)) {
      return true;
    } else if (isSCMResource(inputOrElement)) {
      return false;
    } else if (ResourceTree.isResourceNode(inputOrElement)) {
      return inputOrElement.childrenCount > 0;
    } else {
      throw new Error("hasChildren not implemented.");
    }
  }
};
SCMTreeDataSource = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ISCMViewService)
], SCMTreeDataSource);
class SCMActionButton {
  constructor(container, contextMenuService, commandService, notificationService) {
    this.container = container;
    this.contextMenuService = contextMenuService;
    this.commandService = commandService;
    this.notificationService = notificationService;
    this.disposables = new MutableDisposable();
  }
  dispose() {
    this.disposables?.dispose();
  }
  setButton(button) {
    this.clear();
    if (!button) {
      return;
    }
    if (button.secondaryCommands?.length) {
      const actions = [];
      for (let index = 0; index < button.secondaryCommands.length; index++) {
        const commands = button.secondaryCommands[index];
        for (const command of commands) {
          actions.push(toAction({
            id: command.id,
            label: command.title,
            enabled: true,
            run: async () => {
              await this.executeCommand(command.id, ...command.arguments || []);
            }
          }));
        }
        if (commands.length) {
          actions.push(new Separator());
        }
      }
      actions.pop();
      this.button = new ButtonWithDropdown(this.container, {
        actions,
        addPrimaryActionToDropdown: false,
        contextMenuProvider: this.contextMenuService,
        title: button.command.tooltip,
        supportIcons: true,
        ...defaultButtonStyles
      });
    } else {
      this.button = new Button(this.container, { supportIcons: true, supportShortLabel: !!button.command.shortTitle, title: button.command.tooltip, ...defaultButtonStyles });
    }
    this.button.enabled = button.enabled;
    this.button.label = button.command.title;
    if (this.button instanceof Button && button.command.shortTitle) {
      this.button.labelShort = button.command.shortTitle;
    }
    this.button.onDidClick(async () => await this.executeCommand(button.command.id, ...button.command.arguments || []), null, this.disposables.value);
    this.disposables.value.add(this.button);
  }
  focus() {
    this.button?.focus();
  }
  clear() {
    this.disposables.value = new DisposableStore();
    this.button = void 0;
    clearNode(this.container);
  }
  async executeCommand(commandId, ...args) {
    try {
      await this.commandService.executeCommand(commandId, ...args);
    } catch (ex) {
      this.notificationService.error(ex);
    }
  }
}
export {
  ActionButtonRenderer,
  ContextKeys,
  SCMAccessibilityProvider,
  SCMActionButton,
  SCMTreeKeyboardNavigationLabelProvider,
  SCMTreeSorter,
  SCMViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNjbVxcYnJvd3Nlclxcc2NtVmlld1BhbmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvc2NtLmNzcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIGNvbWJpbmVkRGlzcG9zYWJsZSwgZGlzcG9zZSwgdG9EaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBWaWV3UGFuZSwgSVZpZXdQYW5lT3B0aW9ucywgVmlld0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgYXBwZW5kLCAkLCBjbGVhck5vZGUsIGlzUG9pbnRlckV2ZW50LCBpc0FjdGl2ZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGFzQ1NTVXJsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Nzc1ZhbHVlLmpzJztcbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlLCBJSWRlbnRpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSVNDTVJlc291cmNlR3JvdXAsIElTQ01SZXNvdXJjZSwgSVNDTVJlcG9zaXRvcnksIElTQ01JbnB1dCwgSVNDTVZpZXdTZXJ2aWNlLCBJU0NNVmlld1Zpc2libGVSZXBvc2l0b3J5Q2hhbmdlRXZlbnQsIElTQ01TZXJ2aWNlLCBWSUVXX1BBTkVfSUQsIElTQ01BY3Rpb25CdXR0b24sIElTQ01BY3Rpb25CdXR0b25EZXNjcmlwdG9yLCBJU0NNUmVwb3NpdG9yeVNvcnRLZXksIFZpZXdNb2RlLCBJU0NNUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGUgfSBmcm9tICcuLi9jb21tb24vc2NtLmpzJztcbmltcG9ydCB7IFJlc291cmNlTGFiZWxzLCBJUmVzb3VyY2VMYWJlbCwgSUZpbGVMYWJlbE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBDb3VudEJhZGdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvdW50QmFkZ2UvY291bnRCYWRnZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSwgSUNvbnRleHRLZXksIENvbnRleHRLZXlFeHByLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBNZW51SXRlbUFjdGlvbiwgSU1lbnVTZXJ2aWNlLCByZWdpc3RlckFjdGlvbjIsIE1lbnVJZCwgSUFjdGlvbjJPcHRpb25zLCBNZW51UmVnaXN0cnksIEFjdGlvbjIsIElNZW51IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBBY3Rpb25SdW5uZXIsIFNlcGFyYXRvciwgSUFjdGlvblJ1bm5lciwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSwgSUZpbGVJY29uVGhlbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzU0NNUmVzb3VyY2UsIGlzU0NNUmVzb3VyY2VHcm91cCwgaXNTQ01SZXBvc2l0b3J5LCBpc1NDTUlucHV0LCBjb2xsZWN0Q29udGV4dE1lbnVBY3Rpb25zLCBnZXRBY3Rpb25WaWV3SXRlbVByb3ZpZGVyLCBpc1NDTUFjdGlvbkJ1dHRvbiwgaXNTQ01WaWV3U2VydmljZSwgaXNTQ01SZXNvdXJjZU5vZGUsIGNvbm5lY3RQcmltYXJ5TWVudSB9IGZyb20gJy4vdXRpbC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlLCBJT3BlbkV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQsIFNlcXVlbmNlciwgVGhyb3R0bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVRyZWVOb2RlLCBJVHJlZUZpbHRlciwgSVRyZWVTb3J0ZXIsIElUcmVlQ29udGV4dE1lbnVFdmVudCwgSVRyZWVEcmFnQW5kRHJvcCwgSVRyZWVEcmFnT3ZlclJlYWN0aW9uLCBJQXN5bmNEYXRhU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVRyZWUsIElSZXNvdXJjZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZVRyZWUuanMnO1xuaW1wb3J0IHsgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlciwgSUNvbXByZXNzaWJsZUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9vYmplY3RUcmVlLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgSUNvbXByZXNzZWRUcmVlTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2NvbXByZXNzZWRPYmplY3RUcmVlTW9kZWwuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEZpbGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGNvbXBhcmVGaWxlTmFtZXMsIGNvbXBhcmVQYXRocyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbXBhcmVycy5qcyc7XG5pbXBvcnQgeyBGdXp6eVNjb3JlLCBjcmVhdGVNYXRjaGVzLCBJTWF0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IEVkaXRvclJlc291cmNlQWNjZXNzb3IsIFNpZGVCeVNpZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IGNvbXBhcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFJlcG9zaXRvcnlBY3Rpb25SdW5uZXIsIFJlcG9zaXRvcnlSZW5kZXJlciB9IGZyb20gJy4vc2NtUmVwb3NpdG9yeVJlbmRlcmVyLmpzJztcbmltcG9ydCB7IGlzRGFyayB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBMYWJlbEZ1enp5U2NvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hYnN0cmFjdFRyZWUuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBBUElfT1BFTl9ESUZGX0VESVRPUl9DT01NQU5EX0lELCBBUElfT1BFTl9FRElUT1JfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvckNvbW1hbmRzLmpzJztcbmltcG9ydCB7IGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgQnV0dG9uLCBCdXR0b25XaXRoRGVzY3JpcHRpb24sIEJ1dHRvbldpdGhEcm9wZG93biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgUmVwb3NpdG9yeUNvbnRleHRLZXlzIH0gZnJvbSAnLi9zY21WaWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzLCBkZWZhdWx0Q291bnRCYWRnZVN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJRHJhZ0FuZERyb3BEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBmaWxsRWRpdG9yc0RyYWdEYXRhIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgRWxlbWVudHNEcmFnQW5kRHJvcERhdGEsIExpc3RWaWV3VGFyZ2V0U2VjdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFZpZXcuanMnO1xuaW1wb3J0IHsgQ29kZURhdGFUcmFuc2ZlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kbmQvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGUsIElUcmVlQ29tcHJlc3Npb25EZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2FzeW5jRGF0YVRyZWUuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgcm90IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBPcGVuU2NtR3JvdXBBY3Rpb24gfSBmcm9tICcuLi8uLi9tdWx0aURpZmZFZGl0b3IvYnJvd3Nlci9zY21NdWx0aURpZmZTb3VyY2VSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29uZmlnVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eUNvbW1hbmRJZCB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHlDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBTQ01JbnB1dFdpZGdldCB9IGZyb20gJy4vc2NtSW5wdXQuanMnO1xuXG50eXBlIFRyZWVFbGVtZW50ID0gSVNDTVJlcG9zaXRvcnkgfCBJU0NNSW5wdXQgfCBJU0NNQWN0aW9uQnV0dG9uIHwgSVNDTVJlc291cmNlR3JvdXAgfCBJU0NNUmVzb3VyY2UgfCBJUmVzb3VyY2VOb2RlPElTQ01SZXNvdXJjZSwgSVNDTVJlc291cmNlR3JvdXA+O1xuXG5mdW5jdGlvbiBwcm9jZXNzUmVzb3VyY2VGaWx0ZXJEYXRhKHVyaTogVVJJLCBmaWx0ZXJEYXRhOiBGdXp6eVNjb3JlIHwgTGFiZWxGdXp6eVNjb3JlIHwgdW5kZWZpbmVkKTogW0lNYXRjaFtdIHwgdW5kZWZpbmVkLCBJTWF0Y2hbXSB8IHVuZGVmaW5lZF0ge1xuXHRpZiAoIWZpbHRlckRhdGEpIHtcblx0XHRyZXR1cm4gW3VuZGVmaW5lZCwgdW5kZWZpbmVkXTtcblx0fVxuXG5cdGlmICghKGZpbHRlckRhdGEgYXMgTGFiZWxGdXp6eVNjb3JlKS5sYWJlbCkge1xuXHRcdGNvbnN0IG1hdGNoZXMgPSBjcmVhdGVNYXRjaGVzKGZpbHRlckRhdGEgYXMgRnV6enlTY29yZSk7XG5cdFx0cmV0dXJuIFttYXRjaGVzLCB1bmRlZmluZWRdO1xuXHR9XG5cblx0Y29uc3QgZmlsZU5hbWUgPSBiYXNlbmFtZSh1cmkpO1xuXHRjb25zdCBsYWJlbCA9IChmaWx0ZXJEYXRhIGFzIExhYmVsRnV6enlTY29yZSkubGFiZWw7XG5cdGNvbnN0IHBhdGhMZW5ndGggPSBsYWJlbC5sZW5ndGggLSBmaWxlTmFtZS5sZW5ndGg7XG5cdGNvbnN0IG1hdGNoZXMgPSBjcmVhdGVNYXRjaGVzKChmaWx0ZXJEYXRhIGFzIExhYmVsRnV6enlTY29yZSkuc2NvcmUpO1xuXG5cdC8vIEZpbGVOYW1lIG1hdGNoXG5cdGlmIChsYWJlbCA9PT0gZmlsZU5hbWUpIHtcblx0XHRyZXR1cm4gW21hdGNoZXMsIHVuZGVmaW5lZF07XG5cdH1cblxuXHQvLyBGaWxlUGF0aCBtYXRjaFxuXHRjb25zdCBsYWJlbE1hdGNoZXM6IElNYXRjaFtdID0gW107XG5cdGNvbnN0IGRlc2NyaXB0aW9uTWF0Y2hlczogSU1hdGNoW10gPSBbXTtcblxuXHRmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcblx0XHRpZiAobWF0Y2guc3RhcnQgPiBwYXRoTGVuZ3RoKSB7XG5cdFx0XHQvLyBMYWJlbCBtYXRjaFxuXHRcdFx0bGFiZWxNYXRjaGVzLnB1c2goe1xuXHRcdFx0XHRzdGFydDogbWF0Y2guc3RhcnQgLSBwYXRoTGVuZ3RoLFxuXHRcdFx0XHRlbmQ6IG1hdGNoLmVuZCAtIHBhdGhMZW5ndGhcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBpZiAobWF0Y2guZW5kIDwgcGF0aExlbmd0aCkge1xuXHRcdFx0Ly8gRGVzY3JpcHRpb24gbWF0Y2hcblx0XHRcdGRlc2NyaXB0aW9uTWF0Y2hlcy5wdXNoKG1hdGNoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gU3Bhbm5pbmcgbWF0Y2hcblx0XHRcdGxhYmVsTWF0Y2hlcy5wdXNoKHtcblx0XHRcdFx0c3RhcnQ6IDAsXG5cdFx0XHRcdGVuZDogbWF0Y2guZW5kIC0gcGF0aExlbmd0aFxuXHRcdFx0fSk7XG5cdFx0XHRkZXNjcmlwdGlvbk1hdGNoZXMucHVzaCh7XG5cdFx0XHRcdHN0YXJ0OiBtYXRjaC5zdGFydCxcblx0XHRcdFx0ZW5kOiBwYXRoTGVuZ3RoXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gW2xhYmVsTWF0Y2hlcywgZGVzY3JpcHRpb25NYXRjaGVzXTtcbn1cblxuaW50ZXJmYWNlIElTQ01MYXlvdXQge1xuXHRoZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0d2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+O1xufVxuXG5pbnRlcmZhY2UgQWN0aW9uQnV0dG9uVGVtcGxhdGUge1xuXHRyZWFkb25seSBhY3Rpb25CdXR0b246IFNDTUFjdGlvbkJ1dHRvbjtcblx0ZGlzcG9zYWJsZTogSURpc3Bvc2FibGU7XG5cdHJlYWRvbmx5IHRlbXBsYXRlRGlzcG9zYWJsZTogSURpc3Bvc2FibGU7XG59XG5cbmV4cG9ydCBjbGFzcyBBY3Rpb25CdXR0b25SZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8SVNDTUFjdGlvbkJ1dHRvbiwgRnV6enlTY29yZSwgQWN0aW9uQnV0dG9uVGVtcGxhdGU+IHtcblx0c3RhdGljIHJlYWRvbmx5IERFRkFVTFRfSEVJR0hUID0gMjg7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2FjdGlvbkJ1dHRvbic7XG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7IHJldHVybiBBY3Rpb25CdXR0b25SZW5kZXJlci5URU1QTEFURV9JRDsgfVxuXG5cdHByaXZhdGUgYWN0aW9uQnV0dG9ucyA9IG5ldyBNYXA8SVNDTUFjdGlvbkJ1dHRvbiwgU0NNQWN0aW9uQnV0dG9uPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBBY3Rpb25CdXR0b25UZW1wbGF0ZSB7XG5cdFx0Ly8gVXNlIGRlZmF1bHQgY3Vyc29yICYgZGlzYWJsZSBob3ZlciBmb3IgbGlzdCBpdGVtXG5cdFx0Y29udGFpbmVyLnBhcmVudEVsZW1lbnQhLnBhcmVudEVsZW1lbnQhLmNsYXNzTGlzdC5hZGQoJ2N1cnNvci1kZWZhdWx0JywgJ2ZvcmNlLW5vLWhvdmVyJyk7XG5cblx0XHRjb25zdCBidXR0b25Db250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuYnV0dG9uLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBhY3Rpb25CdXR0b24gPSBuZXcgU0NNQWN0aW9uQnV0dG9uKGJ1dHRvbkNvbnRhaW5lciwgdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsIHRoaXMuY29tbWFuZFNlcnZpY2UsIHRoaXMubm90aWZpY2F0aW9uU2VydmljZSk7XG5cblx0XHRyZXR1cm4geyBhY3Rpb25CdXR0b24sIGRpc3Bvc2FibGU6IERpc3Bvc2FibGUuTm9uZSwgdGVtcGxhdGVEaXNwb3NhYmxlOiBhY3Rpb25CdXR0b24gfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElTQ01BY3Rpb25CdXR0b24sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IEFjdGlvbkJ1dHRvblRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgYWN0aW9uQnV0dG9uID0gbm9kZS5lbGVtZW50O1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CdXR0b24uc2V0QnV0dG9uKG5vZGUuZWxlbWVudC5idXR0b24pO1xuXG5cdFx0Ly8gUmVtZW1iZXIgYWN0aW9uIGJ1dHRvblxuXHRcdHRoaXMuYWN0aW9uQnV0dG9ucy5zZXQoYWN0aW9uQnV0dG9uLCB0ZW1wbGF0ZURhdGEuYWN0aW9uQnV0dG9uKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiB0aGlzLmFjdGlvbkJ1dHRvbnMuZGVsZXRlKGFjdGlvbkJ1dHRvbikgfSk7XG5cblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZSA9IGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKCk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignU2hvdWxkIG5ldmVyIGhhcHBlbiBzaW5jZSBub2RlIGlzIGluY29tcHJlc3NpYmxlJyk7XG5cdH1cblxuXHRmb2N1c0FjdGlvbkJ1dHRvbihhY3Rpb25CdXR0b246IElTQ01BY3Rpb25CdXR0b24pOiB2b2lkIHtcblx0XHR0aGlzLmFjdGlvbkJ1dHRvbnMuZ2V0KGFjdGlvbkJ1dHRvbik/LmZvY3VzKCk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SVNDTUFjdGlvbkJ1dHRvbiwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBBY3Rpb25CdXR0b25UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogQWN0aW9uQnV0dG9uVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuXG5jbGFzcyBTQ01UcmVlRHJhZ0FuZERyb3AgaW1wbGVtZW50cyBJVHJlZURyYWdBbmREcm9wPFRyZWVFbGVtZW50PiB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkgeyB9XG5cblx0Z2V0RHJhZ1VSSShlbGVtZW50OiBUcmVlRWxlbWVudCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmIChpc1NDTVJlc291cmNlKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5zb3VyY2VVcmkudG9TdHJpbmcoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdG9uRHJhZ1N0YXJ0KGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGl0ZW1zID0gU0NNVHJlZURyYWdBbmREcm9wLmdldFJlc291cmNlc0Zyb21EcmFnQW5kRHJvcERhdGEoZGF0YSBhcyBFbGVtZW50c0RyYWdBbmREcm9wRGF0YTxUcmVlRWxlbWVudCwgVHJlZUVsZW1lbnRbXT4pO1xuXHRcdGlmIChvcmlnaW5hbEV2ZW50LmRhdGFUcmFuc2ZlciAmJiBpdGVtcz8ubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGZpbGxFZGl0b3JzRHJhZ0RhdGEoYWNjZXNzb3IsIGl0ZW1zLCBvcmlnaW5hbEV2ZW50KSk7XG5cblx0XHRcdGNvbnN0IGZpbGVSZXNvdXJjZXMgPSBpdGVtcy5maWx0ZXIocyA9PiBzLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKS5tYXAociA9PiByLmZzUGF0aCk7XG5cdFx0XHRpZiAoZmlsZVJlc291cmNlcy5sZW5ndGgpIHtcblx0XHRcdFx0b3JpZ2luYWxFdmVudC5kYXRhVHJhbnNmZXIuc2V0RGF0YShDb2RlRGF0YVRyYW5zZmVycy5GSUxFUywgSlNPTi5zdHJpbmdpZnkoZmlsZVJlc291cmNlcykpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldERyYWdMYWJlbChlbGVtZW50czogVHJlZUVsZW1lbnRbXSwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZWxlbWVudHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gZWxlbWVudHNbMF07XG5cdFx0XHRpZiAoaXNTQ01SZXNvdXJjZShlbGVtZW50KSkge1xuXHRcdFx0XHRyZXR1cm4gYmFzZW5hbWUoZWxlbWVudC5zb3VyY2VVcmkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBTdHJpbmcoZWxlbWVudHMubGVuZ3RoKTtcblx0fVxuXG5cdG9uRHJhZ092ZXIoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgdGFyZ2V0RWxlbWVudDogVHJlZUVsZW1lbnQgfCB1bmRlZmluZWQsIHRhcmdldEluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQsIHRhcmdldFNlY3RvcjogTGlzdFZpZXdUYXJnZXRTZWN0b3IgfCB1bmRlZmluZWQsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IGJvb2xlYW4gfCBJVHJlZURyYWdPdmVyUmVhY3Rpb24ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0ZHJvcChkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXRFbGVtZW50OiBUcmVlRWxlbWVudCB8IHVuZGVmaW5lZCwgdGFyZ2V0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogdm9pZCB7IH1cblxuXHRwcml2YXRlIHN0YXRpYyBnZXRSZXNvdXJjZXNGcm9tRHJhZ0FuZERyb3BEYXRhKGRhdGE6IEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhPFRyZWVFbGVtZW50LCBUcmVlRWxlbWVudFtdPik6IFVSSVtdIHtcblx0XHRjb25zdCB1cmlzOiBVUklbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiBbLi4uZGF0YS5jb250ZXh0ID8/IFtdLCAuLi5kYXRhLmVsZW1lbnRzXSkge1xuXHRcdFx0aWYgKGlzU0NNUmVzb3VyY2UoZWxlbWVudCkpIHtcblx0XHRcdFx0dXJpcy5wdXNoKGVsZW1lbnQuc291cmNlVXJpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVyaXM7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQgeyB9XG59XG5cbmludGVyZmFjZSBJbnB1dFRlbXBsYXRlIHtcblx0cmVhZG9ubHkgaW5wdXRXaWRnZXQ6IFNDTUlucHV0V2lkZ2V0O1xuXHRpbnB1dFdpZGdldEhlaWdodDogbnVtYmVyO1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVhZG9ubHkgdGVtcGxhdGVEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTtcbn1cblxuY2xhc3MgSW5wdXRSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8SVNDTUlucHV0LCBGdXp6eVNjb3JlLCBJbnB1dFRlbXBsYXRlPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IERFRkFVTFRfSEVJR0hUID0gMjY7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2lucHV0Jztcblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHsgcmV0dXJuIElucHV0UmVuZGVyZXIuVEVNUExBVEVfSUQ7IH1cblxuXHRwcml2YXRlIGlucHV0V2lkZ2V0cyA9IG5ldyBNYXA8SVNDTUlucHV0LCBTQ01JbnB1dFdpZGdldD4oKTtcblx0cHJpdmF0ZSBjb250ZW50SGVpZ2h0cyA9IG5ldyBXZWFrTWFwPElTQ01JbnB1dCwgbnVtYmVyPigpO1xuXHRwcml2YXRlIGVkaXRvclNlbGVjdGlvbnMgPSBuZXcgV2Vha01hcDxJU0NNSW5wdXQsIFNlbGVjdGlvbltdPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgb3V0ZXJMYXlvdXQ6IElTQ01MYXlvdXQsXG5cdFx0cHJpdmF0ZSBvdmVyZmxvd1dpZGdldHNEb21Ob2RlOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHVwZGF0ZUhlaWdodDogKGlucHV0OiBJU0NNSW5wdXQsIGhlaWdodDogbnVtYmVyKSA9PiB2b2lkLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElucHV0VGVtcGxhdGUge1xuXHRcdC8vIERpc2FibGUgaG92ZXIgZm9yIGxpc3QgaXRlbVxuXHRcdGNvbnRhaW5lci5wYXJlbnRFbGVtZW50IS5wYXJlbnRFbGVtZW50IS5jbGFzc0xpc3QuYWRkKCdmb3JjZS1uby1ob3ZlcicpO1xuXG5cdFx0Y29uc3QgdGVtcGxhdGVEaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGlucHV0RWxlbWVudCA9IGFwcGVuZChjb250YWluZXIsICQoJy5zY20taW5wdXQnKSk7XG5cdFx0Y29uc3QgaW5wdXRXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNDTUlucHV0V2lkZ2V0LCBpbnB1dEVsZW1lbnQsIHRoaXMub3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSk7XG5cdFx0dGVtcGxhdGVEaXNwb3NhYmxlLmFkZChpbnB1dFdpZGdldCk7XG5cblx0XHRyZXR1cm4geyBpbnB1dFdpZGdldCwgaW5wdXRXaWRnZXRIZWlnaHQ6IElucHV0UmVuZGVyZXIuREVGQVVMVF9IRUlHSFQsIGVsZW1lbnREaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpLCB0ZW1wbGF0ZURpc3Bvc2FibGUgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElTQ01JbnB1dCwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSW5wdXRUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGlucHV0ID0gbm9kZS5lbGVtZW50O1xuXHRcdHRlbXBsYXRlRGF0YS5pbnB1dFdpZGdldC5pbnB1dCA9IGlucHV0O1xuXG5cdFx0Ly8gUmVtZW1iZXIgd2lkZ2V0XG5cdFx0dGhpcy5pbnB1dFdpZGdldHMuc2V0KGlucHV0LCB0ZW1wbGF0ZURhdGEuaW5wdXRXaWRnZXQpO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHRoaXMuaW5wdXRXaWRnZXRzLmRlbGV0ZShpbnB1dClcblx0XHR9KTtcblxuXHRcdC8vIFdpZGdldCBjdXJzb3Igc2VsZWN0aW9uc1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLmVkaXRvclNlbGVjdGlvbnMuZ2V0KGlucHV0KTtcblxuXHRcdGlmIChzZWxlY3Rpb25zKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuaW5wdXRXaWRnZXQuc2VsZWN0aW9ucyA9IHNlbGVjdGlvbnM7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0ZW1wbGF0ZURhdGEuaW5wdXRXaWRnZXQuc2VsZWN0aW9ucztcblxuXHRcdFx0aWYgKHNlbGVjdGlvbnMpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3JTZWxlY3Rpb25zLnNldChpbnB1dCwgc2VsZWN0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVzZXQgd2lkZ2V0IGhlaWdodCBzbyBpdCdzIHJlY2FsY3VsYXRlZFxuXHRcdHRlbXBsYXRlRGF0YS5pbnB1dFdpZGdldEhlaWdodCA9IElucHV0UmVuZGVyZXIuREVGQVVMVF9IRUlHSFQ7XG5cblx0XHQvLyBSZXJlbmRlciB0aGUgZWxlbWVudCB3aGVuZXZlciB0aGUgZWRpdG9yIGNvbnRlbnQgaGVpZ2h0IGNoYW5nZXNcblx0XHRjb25zdCBvbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0gdGVtcGxhdGVEYXRhLmlucHV0V2lkZ2V0LmdldENvbnRlbnRIZWlnaHQoKTtcblx0XHRcdHRoaXMuY29udGVudEhlaWdodHMuc2V0KGlucHV0LCBjb250ZW50SGVpZ2h0KTtcblxuXHRcdFx0aWYgKHRlbXBsYXRlRGF0YS5pbnB1dFdpZGdldEhlaWdodCAhPT0gY29udGVudEhlaWdodCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUhlaWdodChpbnB1dCwgY29udGVudEhlaWdodCArIDEwKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmlucHV0V2lkZ2V0SGVpZ2h0ID0gY29udGVudEhlaWdodDtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmlucHV0V2lkZ2V0LmxheW91dCgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBzdGFydExpc3RlbmluZ0NvbnRlbnRIZWlnaHRDaGFuZ2UgPSAoKSA9PiB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0ZW1wbGF0ZURhdGEuaW5wdXRXaWRnZXQub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KG9uRGlkQ2hhbmdlQ29udGVudEhlaWdodCkpO1xuXHRcdFx0b25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KCk7XG5cdFx0fTtcblxuXHRcdC8vIFNldHVwIGhlaWdodCBjaGFuZ2UgbGlzdGVuZXIgb24gbmV4dCB0aWNrXG5cdFx0ZGlzcG9zYWJsZVRpbWVvdXQoc3RhcnRMaXN0ZW5pbmdDb250ZW50SGVpZ2h0Q2hhbmdlLCAwLCB0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzKTtcblxuXHRcdC8vIExheW91dCB0aGUgZWRpdG9yIHdoZW5ldmVyIHRoZSBvdXRlciBsYXlvdXQgaGFwcGVuc1xuXHRcdGNvbnN0IGxheW91dEVkaXRvciA9ICgpID0+IHRlbXBsYXRlRGF0YS5pbnB1dFdpZGdldC5sYXlvdXQoKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLm91dGVyTGF5b3V0Lm9uRGlkQ2hhbmdlKGxheW91dEVkaXRvcikpO1xuXHRcdGxheW91dEVkaXRvcigpO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKCk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignU2hvdWxkIG5ldmVyIGhhcHBlbiBzaW5jZSBub2RlIGlzIGluY29tcHJlc3NpYmxlJyk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChncm91cDogSVRyZWVOb2RlPElTQ01JbnB1dCwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBJbnB1dFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJbnB1dFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRnZXRIZWlnaHQoaW5wdXQ6IElTQ01JbnB1dCk6IG51bWJlciB7XG5cdFx0cmV0dXJuICh0aGlzLmNvbnRlbnRIZWlnaHRzLmdldChpbnB1dCkgPz8gSW5wdXRSZW5kZXJlci5ERUZBVUxUX0hFSUdIVCkgKyAxMDtcblx0fVxuXG5cdGdldFJlbmRlcmVkSW5wdXRXaWRnZXQoaW5wdXQ6IElTQ01JbnB1dCk6IFNDTUlucHV0V2lkZ2V0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dFdpZGdldHMuZ2V0KGlucHV0KTtcblx0fVxuXG5cdGdldEZvY3VzZWRJbnB1dCgpOiBJU0NNSW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgW2lucHV0LCBpbnB1dFdpZGdldF0gb2YgdGhpcy5pbnB1dFdpZGdldHMpIHtcblx0XHRcdGlmIChpbnB1dFdpZGdldC5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdHJldHVybiBpbnB1dDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y2xlYXJWYWxpZGF0aW9uKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgWywgaW5wdXRXaWRnZXRdIG9mIHRoaXMuaW5wdXRXaWRnZXRzKSB7XG5cdFx0XHRpbnB1dFdpZGdldC5jbGVhclZhbGlkYXRpb24oKTtcblx0XHR9XG5cdH1cbn1cblxuaW50ZXJmYWNlIFJlc291cmNlR3JvdXBUZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IG5hbWU6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBjb3VudDogQ291bnRCYWRnZTtcblx0cmVhZG9ubHkgYWN0aW9uQmFyOiBXb3JrYmVuY2hUb29sQmFyO1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVhZG9ubHkgZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlO1xufVxuXG5jbGFzcyBSZXNvdXJjZUdyb3VwUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPElTQ01SZXNvdXJjZUdyb3VwLCBGdXp6eVNjb3JlLCBSZXNvdXJjZUdyb3VwVGVtcGxhdGU+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAncmVzb3VyY2UgZ3JvdXAnO1xuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcgeyByZXR1cm4gUmVzb3VyY2VHcm91cFJlbmRlcmVyLlRFTVBMQVRFX0lEOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiBJQWN0aW9uVmlld0l0ZW1Qcm92aWRlcixcblx0XHRwcml2YXRlIGFjdGlvblJ1bm5lcjogQWN0aW9uUnVubmVyLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJU0NNVmlld1NlcnZpY2UgcHJpdmF0ZSBzY21WaWV3U2VydmljZTogSVNDTVZpZXdTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFJlc291cmNlR3JvdXBUZW1wbGF0ZSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGFwcGVuZChjb250YWluZXIsICQoJy5yZXNvdXJjZS1ncm91cCcpKTtcblx0XHRjb25zdCBuYW1lID0gYXBwZW5kKGVsZW1lbnQsICQoJy5uYW1lJykpO1xuXHRcdGNvbnN0IGFjdGlvbnNDb250YWluZXIgPSBhcHBlbmQoZWxlbWVudCwgJCgnLmFjdGlvbnMnKSk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gbmV3IFdvcmtiZW5jaFRvb2xCYXIoYWN0aW9uc0NvbnRhaW5lciwge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogdGhpcy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyLFxuXHRcdFx0YWN0aW9uUnVubmVyOiB0aGlzLmFjdGlvblJ1bm5lclxuXHRcdH0sIHRoaXMubWVudVNlcnZpY2UsIHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLmNvbW1hbmRTZXJ2aWNlLCB0aGlzLnRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvdW50Q29udGFpbmVyID0gYXBwZW5kKGVsZW1lbnQsICQoJy5jb3VudCcpKTtcblx0XHRjb25zdCBjb3VudCA9IG5ldyBDb3VudEJhZGdlKGNvdW50Q29udGFpbmVyLCB7fSwgZGVmYXVsdENvdW50QmFkZ2VTdHlsZXMpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gY29tYmluZWREaXNwb3NhYmxlKGFjdGlvbkJhciwgY291bnQpO1xuXG5cdFx0cmV0dXJuIHsgbmFtZSwgY291bnQsIGFjdGlvbkJhciwgZWxlbWVudERpc3Bvc2FibGVzOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCksIGRpc3Bvc2FibGVzIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJU0NNUmVzb3VyY2VHcm91cCwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBSZXNvdXJjZUdyb3VwVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBncm91cCA9IG5vZGUuZWxlbWVudDtcblx0XHR0ZW1wbGF0ZS5uYW1lLnRleHRDb250ZW50ID0gZ3JvdXAubGFiZWw7XG5cdFx0dGVtcGxhdGUuY291bnQuc2V0Q291bnQoZ3JvdXAucmVzb3VyY2VzLmxlbmd0aCk7XG5cblx0XHRjb25zdCBtZW51cyA9IHRoaXMuc2NtVmlld1NlcnZpY2UubWVudXMuZ2V0UmVwb3NpdG9yeU1lbnVzKGdyb3VwLnByb3ZpZGVyKTtcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGNvbm5lY3RQcmltYXJ5TWVudShtZW51cy5nZXRSZXNvdXJjZUdyb3VwTWVudShncm91cCksIHByaW1hcnkgPT4ge1xuXHRcdFx0dGVtcGxhdGUuYWN0aW9uQmFyLnNldEFjdGlvbnMocHJpbWFyeSk7XG5cdFx0fSwgJ2lubGluZScpKTtcblx0XHR0ZW1wbGF0ZS5hY3Rpb25CYXIuY29udGV4dCA9IGdyb3VwO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElTQ01SZXNvdXJjZUdyb3VwPiwgRnV6enlTY29yZT4pOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Nob3VsZCBuZXZlciBoYXBwZW4gc2luY2Ugbm9kZSBpcyBpbmNvbXByZXNzaWJsZScpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoZ3JvdXA6IElUcmVlTm9kZTxJU0NNUmVzb3VyY2VHcm91cCwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBSZXNvdXJjZUdyb3VwVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZTogUmVzb3VyY2VHcm91cFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIFJlc291cmNlVGVtcGxhdGUge1xuXHRlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0bmFtZTogSFRNTEVsZW1lbnQ7XG5cdGZpbGVMYWJlbDogSVJlc291cmNlTGFiZWw7XG5cdGRlY29yYXRpb25JY29uOiBIVE1MRWxlbWVudDtcblx0YWN0aW9uQmFyOiBXb3JrYmVuY2hUb29sQmFyO1xuXHRhY3Rpb25CYXJNZW51OiBJTWVudSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgYWN0aW9uQmFyTWVudUxpc3RlbmVyOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT47XG5cdHJlYWRvbmx5IGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogSURpc3Bvc2FibGU7XG59XG5cbmludGVyZmFjZSBSZW5kZXJlZFJlc291cmNlRGF0YSB7XG5cdHJlYWRvbmx5IHRvb2x0aXA6IHN0cmluZztcblx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdHJlYWRvbmx5IGZpbGVMYWJlbE9wdGlvbnM6IFBhcnRpYWw8SUZpbGVMYWJlbE9wdGlvbnM+O1xuXHRyZWFkb25seSBpY29uUmVzb3VyY2U6IElTQ01SZXNvdXJjZSB8IHVuZGVmaW5lZDtcbn1cblxuY2xhc3MgUmVwb3NpdG9yeVBhbmVBY3Rpb25SdW5uZXIgZXh0ZW5kcyBBY3Rpb25SdW5uZXIge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgZ2V0U2VsZWN0ZWRSZXNvdXJjZXM6ICgpID0+IChJU0NNUmVzb3VyY2VHcm91cCB8IElTQ01SZXNvdXJjZSB8IElSZXNvdXJjZU5vZGU8SVNDTVJlc291cmNlLCBJU0NNUmVzb3VyY2VHcm91cD4pW10pIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIHJ1bkFjdGlvbihhY3Rpb246IElBY3Rpb24sIGNvbnRleHQ6IElTQ01SZXNvdXJjZUdyb3VwIHwgSVNDTVJlc291cmNlIHwgSVJlc291cmNlTm9kZTxJU0NNUmVzb3VyY2UsIElTQ01SZXNvdXJjZUdyb3VwPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSkge1xuXHRcdFx0cmV0dXJuIHN1cGVyLnJ1bkFjdGlvbihhY3Rpb24sIGNvbnRleHQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzQ29udGV4dFJlc291cmNlR3JvdXAgPSBpc1NDTVJlc291cmNlR3JvdXAoY29udGV4dCk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5nZXRTZWxlY3RlZFJlc291cmNlcygpLmZpbHRlcihyID0+IGlzU0NNUmVzb3VyY2VHcm91cChyKSA9PT0gaXNDb250ZXh0UmVzb3VyY2VHcm91cCk7XG5cblx0XHRjb25zdCBjb250ZXh0SXNTZWxlY3RlZCA9IHNlbGVjdGlvbi5zb21lKHMgPT4gcyA9PT0gY29udGV4dCk7XG5cdFx0Y29uc3QgYWN0dWFsQ29udGV4dCA9IGNvbnRleHRJc1NlbGVjdGVkID8gc2VsZWN0aW9uIDogW2NvbnRleHRdO1xuXHRcdGNvbnN0IGFyZ3MgPSBhY3R1YWxDb250ZXh0Lm1hcChlID0+IFJlc291cmNlVHJlZS5pc1Jlc291cmNlTm9kZShlKSA/IFJlc291cmNlVHJlZS5jb2xsZWN0KGUpIDogW2VdKS5mbGF0KCk7XG5cdFx0YXdhaXQgYWN0aW9uLnJ1biguLi5hcmdzKTtcblx0fVxufVxuXG5jbGFzcyBSZXNvdXJjZVJlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxJU0NNUmVzb3VyY2UgfCBJUmVzb3VyY2VOb2RlPElTQ01SZXNvdXJjZSwgSVNDTVJlc291cmNlR3JvdXA+LCBGdXp6eVNjb3JlIHwgTGFiZWxGdXp6eVNjb3JlLCBSZXNvdXJjZVRlbXBsYXRlPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ3Jlc291cmNlJztcblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHsgcmV0dXJuIFJlc291cmNlUmVuZGVyZXIuVEVNUExBVEVfSUQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlbmRlcmVkUmVzb3VyY2VzID0gbmV3IE1hcDxSZXNvdXJjZVRlbXBsYXRlLCBSZW5kZXJlZFJlc291cmNlRGF0YT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHZpZXdNb2RlOiAoKSA9PiBWaWV3TW9kZSxcblx0XHRwcml2YXRlIGxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0cHJpdmF0ZSBhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiBJQWN0aW9uVmlld0l0ZW1Qcm92aWRlcixcblx0XHRwcml2YXRlIGFjdGlvblJ1bm5lcjogQWN0aW9uUnVubmVyLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJU0NNVmlld1NlcnZpY2UgcHJpdmF0ZSBzY21WaWV3U2VydmljZTogSVNDTVZpZXdTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlXG5cdCkge1xuXHRcdHRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UodGhpcy5vbkRpZENvbG9yVGhlbWVDaGFuZ2UsIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFJlc291cmNlVGVtcGxhdGUge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcucmVzb3VyY2UnKSk7XG5cdFx0Y29uc3QgbmFtZSA9IGFwcGVuZChlbGVtZW50LCAkKCcubmFtZScpKTtcblx0XHRjb25zdCBmaWxlTGFiZWwgPSB0aGlzLmxhYmVscy5jcmVhdGUobmFtZSwgeyBzdXBwb3J0RGVzY3JpcHRpb25IaWdobGlnaHRzOiB0cnVlLCBzdXBwb3J0SGlnaGxpZ2h0czogdHJ1ZSB9KTtcblx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gYXBwZW5kKGZpbGVMYWJlbC5lbGVtZW50LCAkKCcuYWN0aW9ucycpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSBuZXcgV29ya2JlbmNoVG9vbEJhcihhY3Rpb25zQ29udGFpbmVyLCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiB0aGlzLmFjdGlvblZpZXdJdGVtUHJvdmlkZXIsXG5cdFx0XHRhY3Rpb25SdW5uZXI6IHRoaXMuYWN0aW9uUnVubmVyXG5cdFx0fSwgdGhpcy5tZW51U2VydmljZSwgdGhpcy5jb250ZXh0S2V5U2VydmljZSwgdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsIHRoaXMua2V5YmluZGluZ1NlcnZpY2UsIHRoaXMuY29tbWFuZFNlcnZpY2UsIHRoaXMudGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRjb25zdCBkZWNvcmF0aW9uSWNvbiA9IGFwcGVuZChlbGVtZW50LCAkKCcuZGVjb3JhdGlvbi1pY29uJykpO1xuXHRcdGNvbnN0IGFjdGlvbkJhck1lbnVMaXN0ZW5lciA9IG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IGNvbWJpbmVkRGlzcG9zYWJsZShhY3Rpb25CYXIsIGZpbGVMYWJlbCwgYWN0aW9uQmFyTWVudUxpc3RlbmVyKTtcblxuXHRcdHJldHVybiB7IGVsZW1lbnQsIG5hbWUsIGZpbGVMYWJlbCwgZGVjb3JhdGlvbkljb24sIGFjdGlvbkJhciwgYWN0aW9uQmFyTWVudTogdW5kZWZpbmVkLCBhY3Rpb25CYXJNZW51TGlzdGVuZXIsIGVsZW1lbnREaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpLCBkaXNwb3NhYmxlcyB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SVNDTVJlc291cmNlLCBGdXp6eVNjb3JlIHwgTGFiZWxGdXp6eVNjb3JlPiB8IElUcmVlTm9kZTxJU0NNUmVzb3VyY2UgfCBJUmVzb3VyY2VOb2RlPElTQ01SZXNvdXJjZSwgSVNDTVJlc291cmNlR3JvdXA+LCBGdXp6eVNjb3JlIHwgTGFiZWxGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IFJlc291cmNlVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCByZXNvdXJjZU9yRm9sZGVyID0gbm9kZS5lbGVtZW50O1xuXHRcdGNvbnN0IGljb25SZXNvdXJjZSA9IFJlc291cmNlVHJlZS5pc1Jlc291cmNlTm9kZShyZXNvdXJjZU9yRm9sZGVyKSA/IHJlc291cmNlT3JGb2xkZXIuZWxlbWVudCA6IHJlc291cmNlT3JGb2xkZXI7XG5cdFx0Y29uc3QgdXJpID0gUmVzb3VyY2VUcmVlLmlzUmVzb3VyY2VOb2RlKHJlc291cmNlT3JGb2xkZXIpID8gcmVzb3VyY2VPckZvbGRlci51cmkgOiByZXNvdXJjZU9yRm9sZGVyLnNvdXJjZVVyaTtcblx0XHRjb25zdCBmaWxlS2luZCA9IFJlc291cmNlVHJlZS5pc1Jlc291cmNlTm9kZShyZXNvdXJjZU9yRm9sZGVyKSA/IEZpbGVLaW5kLkZPTERFUiA6IEZpbGVLaW5kLkZJTEU7XG5cdFx0Y29uc3QgdG9vbHRpcCA9ICFSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUocmVzb3VyY2VPckZvbGRlcikgJiYgcmVzb3VyY2VPckZvbGRlci5kZWNvcmF0aW9ucy50b29sdGlwIHx8ICcnO1xuXHRcdGNvbnN0IGhpZGVQYXRoID0gdGhpcy52aWV3TW9kZSgpID09PSBWaWV3TW9kZS5UcmVlO1xuXG5cdFx0bGV0IG1hdGNoZXM6IElNYXRjaFtdIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBkZXNjcmlwdGlvbk1hdGNoZXM6IElNYXRjaFtdIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBzdHJpa2V0aHJvdWdoOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKFJlc291cmNlVHJlZS5pc1Jlc291cmNlTm9kZShyZXNvdXJjZU9yRm9sZGVyKSkge1xuXHRcdFx0aWYgKHJlc291cmNlT3JGb2xkZXIuZWxlbWVudCkge1xuXHRcdFx0XHRjb25zdCBtZW51cyA9IHRoaXMuc2NtVmlld1NlcnZpY2UubWVudXMuZ2V0UmVwb3NpdG9yeU1lbnVzKHJlc291cmNlT3JGb2xkZXIuZWxlbWVudC5yZXNvdXJjZUdyb3VwLnByb3ZpZGVyKTtcblx0XHRcdFx0dGhpcy5fcmVuZGVyQWN0aW9uQmFyKHRlbXBsYXRlLCByZXNvdXJjZU9yRm9sZGVyLCBtZW51cy5nZXRSZXNvdXJjZU1lbnUocmVzb3VyY2VPckZvbGRlci5lbGVtZW50KSk7XG5cblx0XHRcdFx0dGVtcGxhdGUuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdmYWRlZCcsIHJlc291cmNlT3JGb2xkZXIuZWxlbWVudC5kZWNvcmF0aW9ucy5mYWRlZCk7XG5cdFx0XHRcdHN0cmlrZXRocm91Z2ggPSByZXNvdXJjZU9yRm9sZGVyLmVsZW1lbnQuZGVjb3JhdGlvbnMuc3RyaWtlVGhyb3VnaDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG1lbnVzID0gdGhpcy5zY21WaWV3U2VydmljZS5tZW51cy5nZXRSZXBvc2l0b3J5TWVudXMocmVzb3VyY2VPckZvbGRlci5jb250ZXh0LnByb3ZpZGVyKTtcblx0XHRcdFx0dGhpcy5fcmVuZGVyQWN0aW9uQmFyKHRlbXBsYXRlLCByZXNvdXJjZU9yRm9sZGVyLCBtZW51cy5nZXRSZXNvdXJjZUZvbGRlck1lbnUocmVzb3VyY2VPckZvbGRlci5jb250ZXh0KSk7XG5cblx0XHRcdFx0bWF0Y2hlcyA9IGNyZWF0ZU1hdGNoZXMobm9kZS5maWx0ZXJEYXRhIGFzIEZ1enp5U2NvcmUgfCB1bmRlZmluZWQpO1xuXHRcdFx0XHR0ZW1wbGF0ZS5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2ZhZGVkJyk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG1lbnVzID0gdGhpcy5zY21WaWV3U2VydmljZS5tZW51cy5nZXRSZXBvc2l0b3J5TWVudXMocmVzb3VyY2VPckZvbGRlci5yZXNvdXJjZUdyb3VwLnByb3ZpZGVyKTtcblx0XHRcdHRoaXMuX3JlbmRlckFjdGlvbkJhcih0ZW1wbGF0ZSwgcmVzb3VyY2VPckZvbGRlciwgbWVudXMuZ2V0UmVzb3VyY2VNZW51KHJlc291cmNlT3JGb2xkZXIpKTtcblxuXHRcdFx0W21hdGNoZXMsIGRlc2NyaXB0aW9uTWF0Y2hlc10gPSBwcm9jZXNzUmVzb3VyY2VGaWx0ZXJEYXRhKHVyaSwgbm9kZS5maWx0ZXJEYXRhKTtcblx0XHRcdHRlbXBsYXRlLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZmFkZWQnLCByZXNvdXJjZU9yRm9sZGVyLmRlY29yYXRpb25zLmZhZGVkKTtcblx0XHRcdHN0cmlrZXRocm91Z2ggPSByZXNvdXJjZU9yRm9sZGVyLmRlY29yYXRpb25zLnN0cmlrZVRocm91Z2g7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVuZGVyZWREYXRhOiBSZW5kZXJlZFJlc291cmNlRGF0YSA9IHtcblx0XHRcdHRvb2x0aXAsIHVyaSwgZmlsZUxhYmVsT3B0aW9uczogeyBoaWRlUGF0aCwgZmlsZUtpbmQsIG1hdGNoZXMsIGRlc2NyaXB0aW9uTWF0Y2hlcywgc3RyaWtldGhyb3VnaCB9LCBpY29uUmVzb3VyY2Vcblx0XHR9O1xuXG5cdFx0dGhpcy5yZW5kZXJJY29uKHRlbXBsYXRlLCByZW5kZXJlZERhdGEpO1xuXG5cdFx0dGhpcy5yZW5kZXJlZFJlc291cmNlcy5zZXQodGVtcGxhdGUsIHJlbmRlcmVkRGF0YSk7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5yZW5kZXJlZFJlc291cmNlcy5kZWxldGUodGVtcGxhdGUpKSk7XG5cblx0XHR0ZW1wbGF0ZS5lbGVtZW50LnNldEF0dHJpYnV0ZSgnZGF0YS10b29sdGlwJywgdG9vbHRpcCk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChyZXNvdXJjZTogSVRyZWVOb2RlPElTQ01SZXNvdXJjZSwgRnV6enlTY29yZSB8IExhYmVsRnV6enlTY29yZT4gfCBJVHJlZU5vZGU8SVJlc291cmNlTm9kZTxJU0NNUmVzb3VyY2UsIElTQ01SZXNvdXJjZUdyb3VwPiwgRnV6enlTY29yZSB8IExhYmVsRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBSZXNvdXJjZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SVNDTVJlc291cmNlPiB8IElDb21wcmVzc2VkVHJlZU5vZGU8SVJlc291cmNlTm9kZTxJU0NNUmVzb3VyY2UsIElTQ01SZXNvdXJjZUdyb3VwPj4sIEZ1enp5U2NvcmUgfCBMYWJlbEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZTogUmVzb3VyY2VUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbXByZXNzZWQgPSBub2RlLmVsZW1lbnQgYXMgSUNvbXByZXNzZWRUcmVlTm9kZTxJUmVzb3VyY2VOb2RlPElTQ01SZXNvdXJjZSwgSVNDTVJlc291cmNlR3JvdXA+Pjtcblx0XHRjb25zdCBmb2xkZXIgPSBjb21wcmVzc2VkLmVsZW1lbnRzW2NvbXByZXNzZWQuZWxlbWVudHMubGVuZ3RoIC0gMV07XG5cblx0XHRjb25zdCBsYWJlbCA9IGNvbXByZXNzZWQuZWxlbWVudHMubWFwKGUgPT4gZS5uYW1lKTtcblx0XHRjb25zdCBmaWxlS2luZCA9IEZpbGVLaW5kLkZPTERFUjtcblxuXHRcdGNvbnN0IG1hdGNoZXMgPSBjcmVhdGVNYXRjaGVzKG5vZGUuZmlsdGVyRGF0YSBhcyBGdXp6eVNjb3JlIHwgdW5kZWZpbmVkKTtcblx0XHR0ZW1wbGF0ZS5maWxlTGFiZWwuc2V0UmVzb3VyY2UoeyByZXNvdXJjZTogZm9sZGVyLnVyaSwgbmFtZTogbGFiZWwgfSwge1xuXHRcdFx0ZmlsZURlY29yYXRpb25zOiB7IGNvbG9yczogZmFsc2UsIGJhZGdlczogdHJ1ZSB9LFxuXHRcdFx0ZmlsZUtpbmQsXG5cdFx0XHRtYXRjaGVzLFxuXHRcdFx0c2VwYXJhdG9yOiB0aGlzLmxhYmVsU2VydmljZS5nZXRTZXBhcmF0b3IoZm9sZGVyLnVyaS5zY2hlbWUpXG5cdFx0fSk7XG5cblx0XHRjb25zdCBtZW51cyA9IHRoaXMuc2NtVmlld1NlcnZpY2UubWVudXMuZ2V0UmVwb3NpdG9yeU1lbnVzKGZvbGRlci5jb250ZXh0LnByb3ZpZGVyKTtcblx0XHR0aGlzLl9yZW5kZXJBY3Rpb25CYXIodGVtcGxhdGUsIGZvbGRlciwgbWVudXMuZ2V0UmVzb3VyY2VGb2xkZXJNZW51KGZvbGRlci5jb250ZXh0KSk7XG5cblx0XHR0ZW1wbGF0ZS5uYW1lLmNsYXNzTGlzdC5yZW1vdmUoJ3N0cmlrZS10aHJvdWdoJyk7XG5cdFx0dGVtcGxhdGUuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdmYWRlZCcpO1xuXHRcdHRlbXBsYXRlLmRlY29yYXRpb25JY29uLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGVtcGxhdGUuZGVjb3JhdGlvbkljb24uc3R5bGUuYmFja2dyb3VuZEltYWdlID0gJyc7XG5cblx0XHR0ZW1wbGF0ZS5lbGVtZW50LnNldEF0dHJpYnV0ZSgnZGF0YS10b29sdGlwJywgJycpO1xuXHR9XG5cblx0ZGlzcG9zZUNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJU0NNUmVzb3VyY2U+IHwgSUNvbXByZXNzZWRUcmVlTm9kZTxJUmVzb3VyY2VOb2RlPElTQ01SZXNvdXJjZSwgSVNDTVJlc291cmNlR3JvdXA+PiwgRnV6enlTY29yZSB8IExhYmVsRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBSZXNvdXJjZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGU6IFJlc291cmNlVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckFjdGlvbkJhcih0ZW1wbGF0ZTogUmVzb3VyY2VUZW1wbGF0ZSwgcmVzb3VyY2VPckZvbGRlcjogSVNDTVJlc291cmNlIHwgSVJlc291cmNlTm9kZTxJU0NNUmVzb3VyY2UsIElTQ01SZXNvdXJjZUdyb3VwPiwgbWVudTogSU1lbnUpOiB2b2lkIHtcblx0XHRpZiAoIXRlbXBsYXRlLmFjdGlvbkJhck1lbnUgfHwgdGVtcGxhdGUuYWN0aW9uQmFyTWVudSAhPT0gbWVudSkge1xuXHRcdFx0dGVtcGxhdGUuYWN0aW9uQmFyTWVudSA9IG1lbnU7XG5cdFx0XHR0ZW1wbGF0ZS5hY3Rpb25CYXJNZW51TGlzdGVuZXIudmFsdWUgPSBjb25uZWN0UHJpbWFyeU1lbnUobWVudSwgcHJpbWFyeSA9PiB7XG5cdFx0XHRcdHRlbXBsYXRlLmFjdGlvbkJhci5zZXRBY3Rpb25zKHByaW1hcnkpO1xuXHRcdFx0fSwgJ2lubGluZScpO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlLmFjdGlvbkJhci5jb250ZXh0ID0gcmVzb3VyY2VPckZvbGRlcjtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDb2xvclRoZW1lQ2hhbmdlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW3RlbXBsYXRlLCBkYXRhXSBvZiB0aGlzLnJlbmRlcmVkUmVzb3VyY2VzKSB7XG5cdFx0XHR0aGlzLnJlbmRlckljb24odGVtcGxhdGUsIGRhdGEpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVySWNvbih0ZW1wbGF0ZTogUmVzb3VyY2VUZW1wbGF0ZSwgZGF0YTogUmVuZGVyZWRSZXNvdXJjZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCB0aGVtZSA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHRjb25zdCBpY29uID0gaXNEYXJrKHRoZW1lLnR5cGUpID8gZGF0YS5pY29uUmVzb3VyY2U/LmRlY29yYXRpb25zLmljb25EYXJrIDogZGF0YS5pY29uUmVzb3VyY2U/LmRlY29yYXRpb25zLmljb247XG5cblx0XHR0ZW1wbGF0ZS5maWxlTGFiZWwuc2V0RmlsZShkYXRhLnVyaSwge1xuXHRcdFx0Li4uZGF0YS5maWxlTGFiZWxPcHRpb25zLFxuXHRcdFx0ZmlsZURlY29yYXRpb25zOiB7IGNvbG9yczogZmFsc2UsIGJhZGdlczogIWljb24gfSxcblx0XHR9KTtcblxuXHRcdGlmIChpY29uKSB7XG5cdFx0XHRpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKGljb24pKSB7XG5cdFx0XHRcdHRlbXBsYXRlLmRlY29yYXRpb25JY29uLmNsYXNzTmFtZSA9IGBkZWNvcmF0aW9uLWljb24gJHtUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbil9YDtcblx0XHRcdFx0aWYgKGljb24uY29sb3IpIHtcblx0XHRcdFx0XHR0ZW1wbGF0ZS5kZWNvcmF0aW9uSWNvbi5zdHlsZS5jb2xvciA9IHRoZW1lLmdldENvbG9yKGljb24uY29sb3IuaWQpPy50b1N0cmluZygpID8/ICcnO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRlbXBsYXRlLmRlY29yYXRpb25JY29uLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdFx0dGVtcGxhdGUuZGVjb3JhdGlvbkljb24uc3R5bGUuYmFja2dyb3VuZEltYWdlID0gJyc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0ZW1wbGF0ZS5kZWNvcmF0aW9uSWNvbi5jbGFzc05hbWUgPSAnZGVjb3JhdGlvbi1pY29uJztcblx0XHRcdFx0dGVtcGxhdGUuZGVjb3JhdGlvbkljb24uc3R5bGUuY29sb3IgPSAnJztcblx0XHRcdFx0dGVtcGxhdGUuZGVjb3JhdGlvbkljb24uc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHR0ZW1wbGF0ZS5kZWNvcmF0aW9uSWNvbi5zdHlsZS5iYWNrZ3JvdW5kSW1hZ2UgPSBhc0NTU1VybChpY29uKTtcblx0XHRcdH1cblx0XHRcdHRlbXBsYXRlLmRlY29yYXRpb25JY29uLnRpdGxlID0gZGF0YS50b29sdGlwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZS5kZWNvcmF0aW9uSWNvbi5jbGFzc05hbWUgPSAnZGVjb3JhdGlvbi1pY29uJztcblx0XHRcdHRlbXBsYXRlLmRlY29yYXRpb25JY29uLnN0eWxlLmNvbG9yID0gJyc7XG5cdFx0XHR0ZW1wbGF0ZS5kZWNvcmF0aW9uSWNvbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGVtcGxhdGUuZGVjb3JhdGlvbkljb24uc3R5bGUuYmFja2dyb3VuZEltYWdlID0gJyc7XG5cdFx0XHR0ZW1wbGF0ZS5kZWNvcmF0aW9uSWNvbi50aXRsZSA9ICcnO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgTGlzdERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8VHJlZUVsZW1lbnQ+IHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGlucHV0UmVuZGVyZXI6IElucHV0UmVuZGVyZXIpIHsgfVxuXG5cdGdldEhlaWdodChlbGVtZW50OiBUcmVlRWxlbWVudCkge1xuXHRcdGlmIChpc1NDTUlucHV0KGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnB1dFJlbmRlcmVyLmdldEhlaWdodChlbGVtZW50KTtcblx0XHR9IGVsc2UgaWYgKGlzU0NNQWN0aW9uQnV0dG9uKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gQWN0aW9uQnV0dG9uUmVuZGVyZXIuREVGQVVMVF9IRUlHSFQgKyA4O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gMjI7XG5cdFx0fVxuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBUcmVlRWxlbWVudCkge1xuXHRcdGlmIChpc1NDTVJlcG9zaXRvcnkoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBSZXBvc2l0b3J5UmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUlucHV0KGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gSW5wdXRSZW5kZXJlci5URU1QTEFURV9JRDtcblx0XHR9IGVsc2UgaWYgKGlzU0NNQWN0aW9uQnV0dG9uKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gQWN0aW9uQnV0dG9uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdFx0fSBlbHNlIGlmIChpc1NDTVJlc291cmNlR3JvdXAoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBSZXNvdXJjZUdyb3VwUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdFx0fSBlbHNlIGlmIChpc1NDTVJlc291cmNlKGVsZW1lbnQpIHx8IGlzU0NNUmVzb3VyY2VOb2RlKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gUmVzb3VyY2VSZW5kZXJlci5URU1QTEFURV9JRDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVsZW1lbnQnKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgU0NNVHJlZUNvbXByZXNzaW9uRGVsZWdhdGUgaW1wbGVtZW50cyBJVHJlZUNvbXByZXNzaW9uRGVsZWdhdGU8VHJlZUVsZW1lbnQ+IHtcblxuXHRpc0luY29tcHJlc3NpYmxlKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKFJlc291cmNlVHJlZS5pc1Jlc291cmNlTm9kZShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuY2hpbGRyZW5Db3VudCA9PT0gMCB8fCAhZWxlbWVudC5wYXJlbnQgfHwgIWVsZW1lbnQucGFyZW50LnBhcmVudDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG59XG5cbmNsYXNzIFNDTVRyZWVGaWx0ZXIgaW1wbGVtZW50cyBJVHJlZUZpbHRlcjxUcmVlRWxlbWVudD4ge1xuXG5cdGZpbHRlcihlbGVtZW50OiBUcmVlRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChpc1NDTVJlc291cmNlR3JvdXAoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LnJlc291cmNlcy5sZW5ndGggPiAwIHx8ICFlbGVtZW50LmhpZGVXaGVuRW1wdHk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU0NNVHJlZVNvcnRlciBpbXBsZW1lbnRzIElUcmVlU29ydGVyPFRyZWVFbGVtZW50PiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2aWV3TW9kZTogKCkgPT4gVmlld01vZGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2aWV3U29ydEtleTogKCkgPT4gVmlld1NvcnRLZXkpIHsgfVxuXG5cdGNvbXBhcmUob25lOiBUcmVlRWxlbWVudCwgb3RoZXI6IFRyZWVFbGVtZW50KTogbnVtYmVyIHtcblx0XHRpZiAoaXNTQ01SZXBvc2l0b3J5KG9uZSkpIHtcblx0XHRcdGlmICghaXNTQ01SZXBvc2l0b3J5KG90aGVyKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgY29tcGFyaXNvbicpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRpZiAoaXNTQ01JbnB1dChvbmUpKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUlucHV0KG90aGVyKSkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXG5cdFx0aWYgKGlzU0NNQWN0aW9uQnV0dG9uKG9uZSkpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9IGVsc2UgaWYgKGlzU0NNQWN0aW9uQnV0dG9uKG90aGVyKSkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXG5cdFx0aWYgKGlzU0NNUmVzb3VyY2VHcm91cChvbmUpKSB7XG5cdFx0XHRyZXR1cm4gaXNTQ01SZXNvdXJjZUdyb3VwKG90aGVyKSA/IDAgOiAtMTtcblx0XHR9XG5cblx0XHQvLyBSZXNvdXJjZSAoTGlzdClcblx0XHRpZiAodGhpcy52aWV3TW9kZSgpID09PSBWaWV3TW9kZS5MaXN0KSB7XG5cdFx0XHQvLyBGaWxlTmFtZVxuXHRcdFx0aWYgKHRoaXMudmlld1NvcnRLZXkoKSA9PT0gVmlld1NvcnRLZXkuTmFtZSkge1xuXHRcdFx0XHRjb25zdCBvbmVOYW1lID0gYmFzZW5hbWUoKG9uZSBhcyBJU0NNUmVzb3VyY2UpLnNvdXJjZVVyaSk7XG5cdFx0XHRcdGNvbnN0IG90aGVyTmFtZSA9IGJhc2VuYW1lKChvdGhlciBhcyBJU0NNUmVzb3VyY2UpLnNvdXJjZVVyaSk7XG5cblx0XHRcdFx0cmV0dXJuIGNvbXBhcmVGaWxlTmFtZXMob25lTmFtZSwgb3RoZXJOYW1lKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU3RhdHVzXG5cdFx0XHRpZiAodGhpcy52aWV3U29ydEtleSgpID09PSBWaWV3U29ydEtleS5TdGF0dXMpIHtcblx0XHRcdFx0Y29uc3Qgb25lVG9vbHRpcCA9IChvbmUgYXMgSVNDTVJlc291cmNlKS5kZWNvcmF0aW9ucy50b29sdGlwID8/ICcnO1xuXHRcdFx0XHRjb25zdCBvdGhlclRvb2x0aXAgPSAob3RoZXIgYXMgSVNDTVJlc291cmNlKS5kZWNvcmF0aW9ucy50b29sdGlwID8/ICcnO1xuXG5cdFx0XHRcdGlmIChvbmVUb29sdGlwICE9PSBvdGhlclRvb2x0aXApIHtcblx0XHRcdFx0XHRyZXR1cm4gY29tcGFyZShvbmVUb29sdGlwLCBvdGhlclRvb2x0aXApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFBhdGggKGRlZmF1bHQpXG5cdFx0XHRjb25zdCBvbmVQYXRoID0gKG9uZSBhcyBJU0NNUmVzb3VyY2UpLnNvdXJjZVVyaS5mc1BhdGg7XG5cdFx0XHRjb25zdCBvdGhlclBhdGggPSAob3RoZXIgYXMgSVNDTVJlc291cmNlKS5zb3VyY2VVcmkuZnNQYXRoO1xuXG5cdFx0XHRyZXR1cm4gY29tcGFyZVBhdGhzKG9uZVBhdGgsIG90aGVyUGF0aCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzb3VyY2UgKFRyZWUpXG5cdFx0Y29uc3Qgb25lSXNEaXJlY3RvcnkgPSBSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUob25lKTtcblx0XHRjb25zdCBvdGhlcklzRGlyZWN0b3J5ID0gUmVzb3VyY2VUcmVlLmlzUmVzb3VyY2VOb2RlKG90aGVyKTtcblxuXHRcdGlmIChvbmVJc0RpcmVjdG9yeSAhPT0gb3RoZXJJc0RpcmVjdG9yeSkge1xuXHRcdFx0cmV0dXJuIG9uZUlzRGlyZWN0b3J5ID8gLTEgOiAxO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9uZU5hbWUgPSBSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUob25lKSA/IG9uZS5uYW1lIDogYmFzZW5hbWUoKG9uZSBhcyBJU0NNUmVzb3VyY2UpLnNvdXJjZVVyaSk7XG5cdFx0Y29uc3Qgb3RoZXJOYW1lID0gUmVzb3VyY2VUcmVlLmlzUmVzb3VyY2VOb2RlKG90aGVyKSA/IG90aGVyLm5hbWUgOiBiYXNlbmFtZSgob3RoZXIgYXMgSVNDTVJlc291cmNlKS5zb3VyY2VVcmkpO1xuXG5cdFx0cmV0dXJuIGNvbXBhcmVGaWxlTmFtZXMob25lTmFtZSwgb3RoZXJOYW1lKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU0NNVHJlZUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjxUcmVlRWxlbWVudD4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgdmlld01vZGU6ICgpID0+IFZpZXdNb2RlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogeyB0b1N0cmluZygpOiBzdHJpbmcgfSB8IHsgdG9TdHJpbmcoKTogc3RyaW5nIH1bXSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKFJlc291cmNlVHJlZS5pc1Jlc291cmNlTm9kZShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQubmFtZTtcblx0XHR9IGVsc2UgaWYgKGlzU0NNUmVwb3NpdG9yeShlbGVtZW50KSB8fCBpc1NDTUlucHV0KGVsZW1lbnQpIHx8IGlzU0NNQWN0aW9uQnV0dG9uKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01SZXNvdXJjZUdyb3VwKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5sYWJlbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMudmlld01vZGUoKSA9PT0gVmlld01vZGUuTGlzdCkge1xuXHRcdFx0XHQvLyBJbiBMaXN0IG1vZGUgbWF0Y2ggdXNpbmcgdGhlIGZpbGUgbmFtZSBhbmQgdGhlIHBhdGguXG5cdFx0XHRcdC8vIFNpbmNlIHdlIHdhbnQgdG8gbWF0Y2ggYm90aCBvbiB0aGUgZmlsZSBuYW1lIGFuZCB0aGVcblx0XHRcdFx0Ly8gZnVsbCBwYXRoIHdlIHJldHVybiBhbiBhcnJheSBvZiBsYWJlbHMuIEEgbWF0Y2ggaW4gdGhlXG5cdFx0XHRcdC8vIGZpbGUgbmFtZSB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgYSBtYXRjaCBpbiB0aGUgcGF0aC5cblx0XHRcdFx0Y29uc3QgZmlsZU5hbWUgPSBiYXNlbmFtZShlbGVtZW50LnNvdXJjZVVyaSk7XG5cdFx0XHRcdGNvbnN0IGZpbGVQYXRoID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZWxlbWVudC5zb3VyY2VVcmksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cblx0XHRcdFx0cmV0dXJuIFtmaWxlTmFtZSwgZmlsZVBhdGhdO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gSW4gVHJlZSBtb2RlIG9ubHkgbWF0Y2ggdXNpbmcgdGhlIGZpbGUgbmFtZVxuXHRcdFx0XHRyZXR1cm4gYmFzZW5hbWUoZWxlbWVudC5zb3VyY2VVcmkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldENvbXByZXNzZWROb2RlS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWwoZWxlbWVudHM6IFRyZWVFbGVtZW50W10pOiB7IHRvU3RyaW5nKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmb2xkZXJzID0gZWxlbWVudHMgYXMgSVJlc291cmNlTm9kZTxJU0NNUmVzb3VyY2UsIElTQ01SZXNvdXJjZUdyb3VwPltdO1xuXHRcdHJldHVybiBmb2xkZXJzLm1hcChlID0+IGUubmFtZSkuam9pbignLycpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFNDTVJlc291cmNlSWQoZWxlbWVudDogVHJlZUVsZW1lbnQpOiBzdHJpbmcge1xuXHRpZiAoaXNTQ01SZXBvc2l0b3J5KGVsZW1lbnQpKSB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBlbGVtZW50LnByb3ZpZGVyO1xuXHRcdHJldHVybiBgcmVwbzoke3Byb3ZpZGVyLmlkfWA7XG5cdH0gZWxzZSBpZiAoaXNTQ01JbnB1dChlbGVtZW50KSkge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZWxlbWVudC5yZXBvc2l0b3J5LnByb3ZpZGVyO1xuXHRcdHJldHVybiBgaW5wdXQ6JHtwcm92aWRlci5pZH1gO1xuXHR9IGVsc2UgaWYgKGlzU0NNQWN0aW9uQnV0dG9uKGVsZW1lbnQpKSB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBlbGVtZW50LnJlcG9zaXRvcnkucHJvdmlkZXI7XG5cdFx0cmV0dXJuIGBhY3Rpb25CdXR0b246JHtwcm92aWRlci5pZH1gO1xuXHR9IGVsc2UgaWYgKGlzU0NNUmVzb3VyY2VHcm91cChlbGVtZW50KSkge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZWxlbWVudC5wcm92aWRlcjtcblx0XHRyZXR1cm4gYHJlc291cmNlR3JvdXA6JHtwcm92aWRlci5pZH0vJHtlbGVtZW50LmlkfWA7XG5cdH0gZWxzZSBpZiAoaXNTQ01SZXNvdXJjZShlbGVtZW50KSkge1xuXHRcdGNvbnN0IGdyb3VwID0gZWxlbWVudC5yZXNvdXJjZUdyb3VwO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZ3JvdXAucHJvdmlkZXI7XG5cdFx0cmV0dXJuIGByZXNvdXJjZToke3Byb3ZpZGVyLmlkfS8ke2dyb3VwLmlkfS8ke2VsZW1lbnQuc291cmNlVXJpLnRvU3RyaW5nKCl9YDtcblx0fSBlbHNlIGlmIChpc1NDTVJlc291cmNlTm9kZShlbGVtZW50KSkge1xuXHRcdGNvbnN0IGdyb3VwID0gZWxlbWVudC5jb250ZXh0O1xuXHRcdHJldHVybiBgZm9sZGVyOiR7Z3JvdXAucHJvdmlkZXIuaWR9LyR7Z3JvdXAuaWR9LyRGT0xERVIvJHtlbGVtZW50LnVyaS50b1N0cmluZygpfWA7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHRyZWUgZWxlbWVudCcpO1xuXHR9XG59XG5cbmNsYXNzIFNDTVJlc291cmNlSWRlbnRpdHlQcm92aWRlciBpbXBsZW1lbnRzIElJZGVudGl0eVByb3ZpZGVyPFRyZWVFbGVtZW50PiB7XG5cblx0Z2V0SWQoZWxlbWVudDogVHJlZUVsZW1lbnQpOiBzdHJpbmcge1xuXHRcdHJldHVybiBnZXRTQ01SZXNvdXJjZUlkKGVsZW1lbnQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTQ01BY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxUcmVlRWxlbWVudD4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlXG5cdCkgeyB9XG5cblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdzY20nLCBcIlNvdXJjZSBDb250cm9sIE1hbmFnZW1lbnRcIik7XG5cdH1cblxuXHRnZXRBcmlhTGFiZWwoZWxlbWVudDogVHJlZUVsZW1lbnQpOiBzdHJpbmcge1xuXHRcdGlmIChSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChlbGVtZW50LnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSwgbm9QcmVmaXg6IHRydWUgfSkgfHwgZWxlbWVudC5uYW1lO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01SZXBvc2l0b3J5KGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gYCR7ZWxlbWVudC5wcm92aWRlci5uYW1lfSAke2VsZW1lbnQucHJvdmlkZXIubGFiZWx9YDtcblx0XHR9IGVsc2UgaWYgKGlzU0NNSW5wdXQoZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IHZlcmJvc2l0eSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5Tb3VyY2VDb250cm9sKSA9PT0gdHJ1ZTtcblxuXHRcdFx0aWYgKCF2ZXJib3NpdHkgfHwgIXRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSkge1xuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NjbUlucHV0JywgXCJTb3VyY2UgQ29udHJvbCBJbnB1dFwiKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qga2JMYWJlbCA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhBY2Nlc3NpYmlsaXR5Q29tbWFuZElkLk9wZW5BY2Nlc3NpYmlsaXR5SGVscCk/LmdldExhYmVsKCk7XG5cdFx0XHRyZXR1cm4ga2JMYWJlbFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdzY21JbnB1dFJvdy5hY2Nlc3NpYmlsaXR5SGVscCcsIFwiU291cmNlIENvbnRyb2wgSW5wdXQsIFVzZSB7MH0gdG8gb3BlbiBTb3VyY2UgQ29udHJvbCBBY2Nlc3NpYmlsaXR5IEhlbHAuXCIsIGtiTGFiZWwpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3NjbUlucHV0Um93LmFjY2Vzc2liaWxpdHlIZWxwTm9LYicsIFwiU291cmNlIENvbnRyb2wgSW5wdXQsIFJ1biB0aGUgT3BlbiBBY2Nlc3NpYmlsaXR5IEhlbHAgY29tbWFuZCBmb3IgbW9yZSBpbmZvcm1hdGlvbi5cIik7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUFjdGlvbkJ1dHRvbihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuYnV0dG9uPy5jb21tYW5kLnRpdGxlID8/ICcnO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01SZXNvdXJjZUdyb3VwKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5sYWJlbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0XHRyZXN1bHQucHVzaChiYXNlbmFtZShlbGVtZW50LnNvdXJjZVVyaSkpO1xuXG5cdFx0XHRpZiAoZWxlbWVudC5kZWNvcmF0aW9ucy50b29sdGlwKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGVsZW1lbnQuZGVjb3JhdGlvbnMudG9vbHRpcCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBhdGggPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChkaXJuYW1lKGVsZW1lbnQuc291cmNlVXJpKSwgeyByZWxhdGl2ZTogdHJ1ZSwgbm9QcmVmaXg6IHRydWUgfSk7XG5cblx0XHRcdGlmIChwYXRoKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHBhdGgpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzdWx0LmpvaW4oJywgJyk7XG5cdFx0fVxuXHR9XG59XG5cbmNvbnN0IGVudW0gVmlld1NvcnRLZXkge1xuXHRQYXRoID0gJ3BhdGgnLFxuXHROYW1lID0gJ25hbWUnLFxuXHRTdGF0dXMgPSAnc3RhdHVzJ1xufVxuXG5jb25zdCBNZW51cyA9IHtcblx0Vmlld1NvcnQ6IG5ldyBNZW51SWQoJ1NDTVZpZXdTb3J0JyksXG5cdFJlcG9zaXRvcmllczogbmV3IE1lbnVJZCgnU0NNUmVwb3NpdG9yaWVzJyksXG5cdENoYW5nZXNTZXR0aW5nczogbmV3IE1lbnVJZCgnU0NNQ2hhbmdlc1NldHRpbmdzJyksXG59O1xuXG5leHBvcnQgY29uc3QgQ29udGV4dEtleXMgPSB7XG5cdFNDTVZpZXdNb2RlOiBuZXcgUmF3Q29udGV4dEtleTxWaWV3TW9kZT4oJ3NjbVZpZXdNb2RlJywgVmlld01vZGUuTGlzdCksXG5cdFNDTVZpZXdTb3J0S2V5OiBuZXcgUmF3Q29udGV4dEtleTxWaWV3U29ydEtleT4oJ3NjbVZpZXdTb3J0S2V5JywgVmlld1NvcnRLZXkuUGF0aCksXG5cdFNDTVZpZXdBcmVBbGxSZXBvc2l0b3JpZXNDb2xsYXBzZWQ6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzY21WaWV3QXJlQWxsUmVwb3NpdG9yaWVzQ29sbGFwc2VkJywgZmFsc2UpLFxuXHRTQ01WaWV3SXNBbnlSZXBvc2l0b3J5Q29sbGFwc2libGU6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzY21WaWV3SXNBbnlSZXBvc2l0b3J5Q29sbGFwc2libGUnLCBmYWxzZSksXG5cdFNDTVByb3ZpZGVyOiBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmcgfCB1bmRlZmluZWQ+KCdzY21Qcm92aWRlcicsIHVuZGVmaW5lZCksXG5cdFNDTVByb3ZpZGVyUm9vdFVyaTogbmV3IFJhd0NvbnRleHRLZXk8c3RyaW5nIHwgdW5kZWZpbmVkPignc2NtUHJvdmlkZXJSb290VXJpJywgdW5kZWZpbmVkKSxcblx0U0NNUHJvdmlkZXJIYXNSb290VXJpOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2NtUHJvdmlkZXJIYXNSb290VXJpJywgdW5kZWZpbmVkKSxcblx0U0NNSGlzdG9yeUl0ZW1Db3VudDogbmV3IFJhd0NvbnRleHRLZXk8bnVtYmVyPignc2NtSGlzdG9yeUl0ZW1Db3VudCcsIDApLFxuXHRTQ01IaXN0b3J5Vmlld01vZGU6IG5ldyBSYXdDb250ZXh0S2V5PFZpZXdNb2RlPignc2NtSGlzdG9yeVZpZXdNb2RlJywgVmlld01vZGUuTGlzdCksXG5cdFNDTUN1cnJlbnRIaXN0b3J5SXRlbVJlZkhhc1JlbW90ZTogbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3NjbUN1cnJlbnRIaXN0b3J5SXRlbVJlZkhhc1JlbW90ZScsIGZhbHNlKSxcblx0U0NNQ3VycmVudEhpc3RvcnlJdGVtUmVmSGFzQmFzZTogbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3NjbUN1cnJlbnRIaXN0b3J5SXRlbVJlZkhhc0Jhc2UnLCBmYWxzZSksXG5cdFNDTUN1cnJlbnRIaXN0b3J5SXRlbVJlZkluRmlsdGVyOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2NtQ3VycmVudEhpc3RvcnlJdGVtUmVmSW5GaWx0ZXInLCBmYWxzZSksXG5cdFJlcG9zaXRvcnlDb3VudDogbmV3IFJhd0NvbnRleHRLZXk8bnVtYmVyPignc2NtUmVwb3NpdG9yeUNvdW50JywgMCksXG5cdFJlcG9zaXRvcnlWaXNpYmlsaXR5Q291bnQ6IG5ldyBSYXdDb250ZXh0S2V5PG51bWJlcj4oJ3NjbVJlcG9zaXRvcnlWaXNpYmxlQ291bnQnLCAwKSxcblx0UmVwb3NpdG9yeVZpc2liaWxpdHkocmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnkpIHtcblx0XHRyZXR1cm4gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oYHNjbVJlcG9zaXRvcnlWaXNpYmxlOiR7cmVwb3NpdG9yeS5wcm92aWRlci5pZH1gLCBmYWxzZSk7XG5cdH1cbn07XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuU0NNVGl0bGUsIHtcblx0dGl0bGU6IGxvY2FsaXplKCdzb3J0QWN0aW9uJywgXCJWaWV3ICYgU29ydFwiKSxcblx0c3VibWVudTogTWVudXMuVmlld1NvcnQsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBWSUVXX1BBTkVfSUQpLCBDb250ZXh0S2V5cy5SZXBvc2l0b3J5Q291bnQubm90RXF1YWxzVG8oMCkpLFxuXHRncm91cDogJzBfdmlldyZzb3J0Jyxcblx0b3JkZXI6IDFcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudXMuVmlld1NvcnQsIHtcblx0dGl0bGU6IGxvY2FsaXplKCdyZXBvc2l0b3JpZXMnLCBcIlJlcG9zaXRvcmllc1wiKSxcblx0c3VibWVudTogTWVudXMuUmVwb3NpdG9yaWVzLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5ncmVhdGVyKENvbnRleHRLZXlzLlJlcG9zaXRvcnlDb3VudC5rZXksIDEpLFxuXHRncm91cDogJzBfcmVwb3NpdG9yaWVzJ1xufSk7XG5cbmNsYXNzIFJlcG9zaXRvcnlWaXNpYmlsaXR5QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0cHJpdmF0ZSByZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeTtcblxuXHRjb25zdHJ1Y3RvcihyZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeSkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBgd29ya2JlbmNoLnNjbS5hY3Rpb24udG9nZ2xlUmVwb3NpdG9yeVZpc2liaWxpdHkuJHtyZXBvc2l0b3J5LnByb3ZpZGVyLmlkfWAsXG5cdFx0XHR0aXRsZTogcmVwb3NpdG9yeS5wcm92aWRlci5uYW1lLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5vcihDb250ZXh0S2V5cy5SZXBvc2l0b3J5VmlzaWJpbGl0eUNvdW50Lm5vdEVxdWFsc1RvKDEpLCBDb250ZXh0S2V5cy5SZXBvc2l0b3J5VmlzaWJpbGl0eShyZXBvc2l0b3J5KS5pc0VxdWFsVG8oZmFsc2UpKSxcblx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlzLlJlcG9zaXRvcnlWaXNpYmlsaXR5KHJlcG9zaXRvcnkpLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdG1lbnU6IHsgaWQ6IE1lbnVzLlJlcG9zaXRvcmllcywgZ3JvdXA6ICcwX3JlcG9zaXRvcmllcycgfVxuXHRcdH0pO1xuXHRcdHRoaXMucmVwb3NpdG9yeSA9IHJlcG9zaXRvcnk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBzY21WaWV3U2VydmljZSA9IGFjY2Vzc29yLmdldChJU0NNVmlld1NlcnZpY2UpO1xuXHRcdHNjbVZpZXdTZXJ2aWNlLnRvZ2dsZVZpc2liaWxpdHkodGhpcy5yZXBvc2l0b3J5KTtcblx0fVxufVxuXG5pbnRlcmZhY2UgUmVwb3NpdG9yeVZpc2liaWxpdHlJdGVtIHtcblx0cmVhZG9ubHkgY29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdGRpc3Bvc2UoKTogdm9pZDtcbn1cblxuY2xhc3MgUmVwb3NpdG9yeVZpc2liaWxpdHlBY3Rpb25Db250cm9sbGVyIHtcblxuXHRwcml2YXRlIGl0ZW1zID0gbmV3IE1hcDxJU0NNUmVwb3NpdG9yeSwgUmVwb3NpdG9yeVZpc2liaWxpdHlJdGVtPigpO1xuXHRwcml2YXRlIHJlcG9zaXRvcnlDb3VudENvbnRleHRLZXk6IElDb250ZXh0S2V5PG51bWJlcj47XG5cdHByaXZhdGUgcmVwb3NpdG9yeVZpc2liaWxpdHlDb3VudENvbnRleHRLZXk6IElDb250ZXh0S2V5PG51bWJlcj47XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElTQ01WaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNjbVZpZXdTZXJ2aWNlOiBJU0NNVmlld1NlcnZpY2UsXG5cdFx0QElTQ01TZXJ2aWNlIHNjbVNlcnZpY2U6IElTQ01TZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMucmVwb3NpdG9yeUNvdW50Q29udGV4dEtleSA9IENvbnRleHRLZXlzLlJlcG9zaXRvcnlDb3VudC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMucmVwb3NpdG9yeVZpc2liaWxpdHlDb3VudENvbnRleHRLZXkgPSBDb250ZXh0S2V5cy5SZXBvc2l0b3J5VmlzaWJpbGl0eUNvdW50LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRzY21WaWV3U2VydmljZS5vbkRpZENoYW5nZVZpc2libGVSZXBvc2l0b3JpZXModGhpcy5vbkRpZENoYW5nZVZpc2libGVSZXBvc2l0b3JpZXMsIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdHNjbVNlcnZpY2Uub25EaWRBZGRSZXBvc2l0b3J5KHRoaXMub25EaWRBZGRSZXBvc2l0b3J5LCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0XHRzY21TZXJ2aWNlLm9uRGlkUmVtb3ZlUmVwb3NpdG9yeSh0aGlzLm9uRGlkUmVtb3ZlUmVwb3NpdG9yeSwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cblx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2Ygc2NtU2VydmljZS5yZXBvc2l0b3JpZXMpIHtcblx0XHRcdHRoaXMub25EaWRBZGRSZXBvc2l0b3J5KHJlcG9zaXRvcnkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRBZGRSZXBvc2l0b3J5KHJlcG9zaXRvcnk6IElTQ01SZXBvc2l0b3J5KTogdm9pZCB7XG5cdFx0aWYgKHJlcG9zaXRvcnkucHJvdmlkZXIuaXNIaWRkZW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhY3Rpb24gPSByZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBSZXBvc2l0b3J5VmlzaWJpbGl0eUFjdGlvbiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIocmVwb3NpdG9yeSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjb250ZXh0S2V5ID0gQ29udGV4dEtleXMuUmVwb3NpdG9yeVZpc2liaWxpdHkocmVwb3NpdG9yeSkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnRleHRLZXkuc2V0KHRoaXMuc2NtVmlld1NlcnZpY2UuaXNWaXNpYmxlKHJlcG9zaXRvcnkpKTtcblxuXHRcdHRoaXMuaXRlbXMuc2V0KHJlcG9zaXRvcnksIHtcblx0XHRcdGNvbnRleHRLZXksXG5cdFx0XHRkaXNwb3NlKCkge1xuXHRcdFx0XHRjb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0XHRcdGFjdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnVwZGF0ZVJlcG9zaXRvcnlDb250ZXh0S2V5cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFJlbW92ZVJlcG9zaXRvcnkocmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnkpOiB2b2lkIHtcblx0XHR0aGlzLml0ZW1zLmdldChyZXBvc2l0b3J5KT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuaXRlbXMuZGVsZXRlKHJlcG9zaXRvcnkpO1xuXHRcdHRoaXMudXBkYXRlUmVwb3NpdG9yeUNvbnRleHRLZXlzKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlVmlzaWJsZVJlcG9zaXRvcmllcygpOiB2b2lkIHtcblx0XHRsZXQgY291bnQgPSAwO1xuXG5cdFx0Zm9yIChjb25zdCBbcmVwb3NpdG9yeSwgaXRlbV0gb2YgdGhpcy5pdGVtcykge1xuXHRcdFx0Y29uc3QgaXNWaXNpYmxlID0gdGhpcy5zY21WaWV3U2VydmljZS5pc1Zpc2libGUocmVwb3NpdG9yeSk7XG5cdFx0XHRpdGVtLmNvbnRleHRLZXkuc2V0KGlzVmlzaWJsZSk7XG5cblx0XHRcdGlmIChpc1Zpc2libGUpIHtcblx0XHRcdFx0Y291bnQrKztcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnJlcG9zaXRvcnlDb3VudENvbnRleHRLZXkuc2V0KHRoaXMuaXRlbXMuc2l6ZSk7XG5cdFx0dGhpcy5yZXBvc2l0b3J5VmlzaWJpbGl0eUNvdW50Q29udGV4dEtleS5zZXQoY291bnQpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVSZXBvc2l0b3J5Q29udGV4dEtleXMoKTogdm9pZCB7XG5cdFx0dGhpcy5yZXBvc2l0b3J5Q291bnRDb250ZXh0S2V5LnNldCh0aGlzLml0ZW1zLnNpemUpO1xuXHRcdHRoaXMucmVwb3NpdG9yeVZpc2liaWxpdHlDb3VudENvbnRleHRLZXkuc2V0KEl0ZXJhYmxlLnJlZHVjZSh0aGlzLml0ZW1zLmtleXMoKSwgKHIsIHJlcG9zaXRvcnkpID0+IHIgKyAodGhpcy5zY21WaWV3U2VydmljZS5pc1Zpc2libGUocmVwb3NpdG9yeSkgPyAxIDogMCksIDApKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0ZGlzcG9zZSh0aGlzLml0ZW1zLnZhbHVlcygpKTtcblx0XHR0aGlzLml0ZW1zLmNsZWFyKCk7XG5cdH1cbn1cblxuY2xhc3MgU2V0TGlzdFZpZXdNb2RlQWN0aW9uIGV4dGVuZHMgVmlld0FjdGlvbjxTQ01WaWV3UGFuZT4ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZCA9ICd3b3JrYmVuY2guc2NtLmFjdGlvbi5zZXRMaXN0Vmlld01vZGUnLFxuXHRcdG1lbnU6IFBhcnRpYWw8SUFjdGlvbjJPcHRpb25zWydtZW51J10+ID0ge30pIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2V0TGlzdFZpZXdNb2RlJywgXCJWaWV3IGFzIExpc3RcIiksXG5cdFx0XHR2aWV3SWQ6IFZJRVdfUEFORV9JRCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGljb246IENvZGljb24ubGlzdFRyZWUsXG5cdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5cy5TQ01WaWV3TW9kZS5pc0VxdWFsVG8oVmlld01vZGUuTGlzdCksXG5cdFx0XHRtZW51OiB7IGlkOiBNZW51cy5WaWV3U29ydCwgZ3JvdXA6ICcxX3ZpZXdtb2RlJywgLi4ubWVudSB9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5JblZpZXcoXzogU2VydmljZXNBY2Nlc3NvciwgdmlldzogU0NNVmlld1BhbmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR2aWV3LnZpZXdNb2RlID0gVmlld01vZGUuTGlzdDtcblx0fVxufVxuXG5jbGFzcyBTZXRMaXN0Vmlld01vZGVOYXZpZ2F0aW9uQWN0aW9uIGV4dGVuZHMgU2V0TGlzdFZpZXdNb2RlQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHQnd29ya2JlbmNoLnNjbS5hY3Rpb24uc2V0TGlzdFZpZXdNb2RlTmF2aWdhdGlvbicsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuU0NNVGl0bGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBWSUVXX1BBTkVfSUQpLCBDb250ZXh0S2V5cy5SZXBvc2l0b3J5Q291bnQubm90RXF1YWxzVG8oMCksIENvbnRleHRLZXlzLlNDTVZpZXdNb2RlLmlzRXF1YWxUbyhWaWV3TW9kZS5UcmVlKSksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRvcmRlcjogLTEwMDBcblx0XHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIFNldFRyZWVWaWV3TW9kZUFjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248U0NNVmlld1BhbmU+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0aWQgPSAnd29ya2JlbmNoLnNjbS5hY3Rpb24uc2V0VHJlZVZpZXdNb2RlJyxcblx0XHRtZW51OiBQYXJ0aWFsPElBY3Rpb24yT3B0aW9uc1snbWVudSddPiA9IHt9KSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NldFRyZWVWaWV3TW9kZScsIFwiVmlldyBhcyBUcmVlXCIpLFxuXHRcdFx0XHR2aWV3SWQ6IFZJRVdfUEFORV9JRCxcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmxpc3RGbGF0LFxuXHRcdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5cy5TQ01WaWV3TW9kZS5pc0VxdWFsVG8oVmlld01vZGUuVHJlZSksXG5cdFx0XHRcdG1lbnU6IHsgaWQ6IE1lbnVzLlZpZXdTb3J0LCBncm91cDogJzFfdmlld21vZGUnLCAuLi5tZW51IH1cblx0XHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KF86IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFNDTVZpZXdQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dmlldy52aWV3TW9kZSA9IFZpZXdNb2RlLlRyZWU7XG5cdH1cbn1cblxuY2xhc3MgU2V0VHJlZVZpZXdNb2RlTmF2aWdhdGlvbkFjdGlvbiBleHRlbmRzIFNldFRyZWVWaWV3TW9kZUFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0J3dvcmtiZW5jaC5zY20uYWN0aW9uLnNldFRyZWVWaWV3TW9kZU5hdmlnYXRpb24nLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlNDTVRpdGxlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVklFV19QQU5FX0lEKSwgQ29udGV4dEtleXMuUmVwb3NpdG9yeUNvdW50Lm5vdEVxdWFsc1RvKDApLCBDb250ZXh0S2V5cy5TQ01WaWV3TW9kZS5pc0VxdWFsVG8oVmlld01vZGUuTGlzdCkpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0b3JkZXI6IC0xMDAwXG5cdFx0XHR9KTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoU2V0TGlzdFZpZXdNb2RlQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihTZXRUcmVlVmlld01vZGVBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFNldExpc3RWaWV3TW9kZU5hdmlnYXRpb25BY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFNldFRyZWVWaWV3TW9kZU5hdmlnYXRpb25BY3Rpb24pO1xuXG5hYnN0cmFjdCBjbGFzcyBSZXBvc2l0b3J5U29ydEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHNvcnRLZXk6IElTQ01SZXBvc2l0b3J5U29ydEtleSwgdGl0bGU6IHN0cmluZykge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBgd29ya2JlbmNoLnNjbS5hY3Rpb24ucmVwb3NpdG9yaWVzLnNldFNvcnRLZXkuJHtzb3J0S2V5fWAsXG5cdFx0XHR0aXRsZSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHRvZ2dsZWQ6IFJlcG9zaXRvcnlDb250ZXh0S2V5cy5SZXBvc2l0b3J5U29ydEtleS5pc0VxdWFsVG8oc29ydEtleSksXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudXMuUmVwb3NpdG9yaWVzLFxuXHRcdFx0XHRcdGdyb3VwOiAnMV9zb3J0J1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5TQ01Tb3VyY2VDb250cm9sVGl0bGUsXG5cdFx0XHRcdFx0Z3JvdXA6ICcxX3NvcnQnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0YWNjZXNzb3IuZ2V0KElTQ01WaWV3U2VydmljZSkudG9nZ2xlU29ydEtleSh0aGlzLnNvcnRLZXkpO1xuXHR9XG59XG5cblxuY2xhc3MgUmVwb3NpdG9yeVNvcnRCeURpc2NvdmVyeVRpbWVBY3Rpb24gZXh0ZW5kcyBSZXBvc2l0b3J5U29ydEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKElTQ01SZXBvc2l0b3J5U29ydEtleS5EaXNjb3ZlcnlUaW1lLCBsb2NhbGl6ZSgncmVwb3NpdG9yeVNvcnRCeURpc2NvdmVyeVRpbWUnLCBcIlNvcnQgYnkgRGlzY292ZXJ5IFRpbWVcIikpO1xuXHR9XG59XG5cbmNsYXNzIFJlcG9zaXRvcnlTb3J0QnlOYW1lQWN0aW9uIGV4dGVuZHMgUmVwb3NpdG9yeVNvcnRBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihJU0NNUmVwb3NpdG9yeVNvcnRLZXkuTmFtZSwgbG9jYWxpemUoJ3JlcG9zaXRvcnlTb3J0QnlOYW1lJywgXCJTb3J0IGJ5IE5hbWVcIikpO1xuXHR9XG59XG5cbmNsYXNzIFJlcG9zaXRvcnlTb3J0QnlQYXRoQWN0aW9uIGV4dGVuZHMgUmVwb3NpdG9yeVNvcnRBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihJU0NNUmVwb3NpdG9yeVNvcnRLZXkuUGF0aCwgbG9jYWxpemUoJ3JlcG9zaXRvcnlTb3J0QnlQYXRoJywgXCJTb3J0IGJ5IFBhdGhcIikpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihSZXBvc2l0b3J5U29ydEJ5RGlzY292ZXJ5VGltZUFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoUmVwb3NpdG9yeVNvcnRCeU5hbWVBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFJlcG9zaXRvcnlTb3J0QnlQYXRoQWN0aW9uKTtcblxuYWJzdHJhY3QgY2xhc3MgUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBzZWxlY3Rpb25Nb2RlOiBJU0NNUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGUsIHRpdGxlOiBzdHJpbmcsIG9yZGVyOiBudW1iZXIpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogYHdvcmtiZW5jaC5zY20uYWN0aW9uLnJlcG9zaXRvcmllcy5zZXRTZWxlY3Rpb25Nb2RlLiR7c2VsZWN0aW9uTW9kZX1gLFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHR0b2dnbGVkOiBSZXBvc2l0b3J5Q29udGV4dEtleXMuUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGUuaXNFcXVhbFRvKHNlbGVjdGlvbk1vZGUpLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVzLlJlcG9zaXRvcmllcyxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ3NjbS5wcm92aWRlckNvdW50JyksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5ncmVhdGVyKCdzY20ucHJvdmlkZXJDb3VudCcsIDEpKSxcblx0XHRcdFx0XHRncm91cDogJzJfc2VsZWN0aW9uTW9kZScsXG5cdFx0XHRcdFx0b3JkZXJcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuU0NNU291cmNlQ29udHJvbFRpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnc2NtLnByb3ZpZGVyQ291bnQnKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmdyZWF0ZXIoJ3NjbS5wcm92aWRlckNvdW50JywgMSkpLFxuXHRcdFx0XHRcdGdyb3VwOiAnMl9zZWxlY3Rpb25Nb2RlJyxcblx0XHRcdFx0XHRvcmRlclxuXHRcdFx0XHR9LFxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0YWNjZXNzb3IuZ2V0KElTQ01WaWV3U2VydmljZSkudG9nZ2xlU2VsZWN0aW9uTW9kZSh0aGlzLnNlbGVjdGlvbk1vZGUpO1xuXHR9XG59XG5cbmNsYXNzIFJlcG9zaXRvcnlTaW5nbGVTZWxlY3Rpb25Nb2RlQWN0aW9uIGV4dGVuZHMgUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGVBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihJU0NNUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGUuU2luZ2xlLCBsb2NhbGl6ZSgncmVwb3NpdG9yeVNpbmdsZVNlbGVjdGlvbk1vZGUnLCBcIlNlbGVjdCBTaW5nbGUgUmVwb3NpdG9yeVwiKSwgMSk7XG5cdH1cbn1cblxuY2xhc3MgUmVwb3NpdG9yeU11bHRpU2VsZWN0aW9uTW9kZUFjdGlvbiBleHRlbmRzIFJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoSVNDTVJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlLk11bHRpcGxlLCBsb2NhbGl6ZSgncmVwb3NpdG9yeU11bHRpU2VsZWN0aW9uTW9kZScsIFwiU2VsZWN0IE11bHRpcGxlIFJlcG9zaXRvcmllc1wiKSwgMik7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKFJlcG9zaXRvcnlTaW5nbGVTZWxlY3Rpb25Nb2RlQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihSZXBvc2l0b3J5TXVsdGlTZWxlY3Rpb25Nb2RlQWN0aW9uKTtcblxuYWJzdHJhY3QgY2xhc3MgU2V0U29ydEtleUFjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248U0NNVmlld1BhbmU+IHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSBzb3J0S2V5OiBWaWV3U29ydEtleSwgdGl0bGU6IHN0cmluZykge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBgd29ya2JlbmNoLnNjbS5hY3Rpb24uc2V0U29ydEtleS4ke3NvcnRLZXl9YCxcblx0XHRcdHRpdGxlLFxuXHRcdFx0dmlld0lkOiBWSUVXX1BBTkVfSUQsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5cy5TQ01WaWV3U29ydEtleS5pc0VxdWFsVG8oc29ydEtleSksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlzLlNDTVZpZXdNb2RlLmlzRXF1YWxUbyhWaWV3TW9kZS5MaXN0KSxcblx0XHRcdG1lbnU6IHsgaWQ6IE1lbnVzLlZpZXdTb3J0LCBncm91cDogJzJfc29ydCcgfVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KF86IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFNDTVZpZXdQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dmlldy52aWV3U29ydEtleSA9IHRoaXMuc29ydEtleTtcblx0fVxufVxuXG5jbGFzcyBTZXRTb3J0QnlOYW1lQWN0aW9uIGV4dGVuZHMgU2V0U29ydEtleUFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFZpZXdTb3J0S2V5Lk5hbWUsIGxvY2FsaXplKCdzb3J0Q2hhbmdlc0J5TmFtZScsIFwiU29ydCBDaGFuZ2VzIGJ5IE5hbWVcIikpO1xuXHR9XG59XG5cbmNsYXNzIFNldFNvcnRCeVBhdGhBY3Rpb24gZXh0ZW5kcyBTZXRTb3J0S2V5QWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoVmlld1NvcnRLZXkuUGF0aCwgbG9jYWxpemUoJ3NvcnRDaGFuZ2VzQnlQYXRoJywgXCJTb3J0IENoYW5nZXMgYnkgUGF0aFwiKSk7XG5cdH1cbn1cblxuY2xhc3MgU2V0U29ydEJ5U3RhdHVzQWN0aW9uIGV4dGVuZHMgU2V0U29ydEtleUFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFZpZXdTb3J0S2V5LlN0YXR1cywgbG9jYWxpemUoJ3NvcnRDaGFuZ2VzQnlTdGF0dXMnLCBcIlNvcnQgQ2hhbmdlcyBieSBTdGF0dXNcIikpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihTZXRTb3J0QnlOYW1lQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihTZXRTb3J0QnlQYXRoQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihTZXRTb3J0QnlTdGF0dXNBY3Rpb24pO1xuXG5jbGFzcyBDb2xsYXBzZUFsbFJlcG9zaXRvcmllc0FjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248U0NNVmlld1BhbmU+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogYHdvcmtiZW5jaC5zY20uYWN0aW9uLmNvbGxhcHNlQWxsUmVwb3NpdG9yaWVzYCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29sbGFwc2UgYWxsJywgXCJDb2xsYXBzZSBBbGwgUmVwb3NpdG9yaWVzXCIpLFxuXHRcdFx0dmlld0lkOiBWSUVXX1BBTkVfSUQsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRpY29uOiBDb2RpY29uLmNvbGxhcHNlQWxsLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlNDTVRpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVklFV19QQU5FX0lEKSwgQ29udGV4dEtleXMuU0NNVmlld0lzQW55UmVwb3NpdG9yeUNvbGxhcHNpYmxlLmlzRXF1YWxUbyh0cnVlKSwgQ29udGV4dEtleXMuU0NNVmlld0FyZUFsbFJlcG9zaXRvcmllc0NvbGxhcHNlZC5pc0VxdWFsVG8oZmFsc2UpKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KF86IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFNDTVZpZXdQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dmlldy5jb2xsYXBzZUFsbFJlcG9zaXRvcmllcygpO1xuXHR9XG59XG5cbmNsYXNzIEV4cGFuZEFsbFJlcG9zaXRvcmllc0FjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248U0NNVmlld1BhbmU+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogYHdvcmtiZW5jaC5zY20uYWN0aW9uLmV4cGFuZEFsbFJlcG9zaXRvcmllc2AsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2V4cGFuZCBhbGwnLCBcIkV4cGFuZCBBbGwgUmVwb3NpdG9yaWVzXCIpLFxuXHRcdFx0dmlld0lkOiBWSUVXX1BBTkVfSUQsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRpY29uOiBDb2RpY29uLmV4cGFuZEFsbCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5TQ01UaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFZJRVdfUEFORV9JRCksIENvbnRleHRLZXlzLlNDTVZpZXdJc0FueVJlcG9zaXRvcnlDb2xsYXBzaWJsZS5pc0VxdWFsVG8odHJ1ZSksIENvbnRleHRLZXlzLlNDTVZpZXdBcmVBbGxSZXBvc2l0b3JpZXNDb2xsYXBzZWQuaXNFcXVhbFRvKHRydWUpKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KF86IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFNDTVZpZXdQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dmlldy5leHBhbmRBbGxSZXBvc2l0b3JpZXMoKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoQ29sbGFwc2VBbGxSZXBvc2l0b3JpZXNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEV4cGFuZEFsbFJlcG9zaXRvcmllc0FjdGlvbik7XG5cbmNsYXNzIENvbGxhcHNlQWxsQWN0aW9uIGV4dGVuZHMgVmlld0FjdGlvbjxTQ01WaWV3UGFuZT4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogYHdvcmtiZW5jaC5zY20uYWN0aW9uLmNvbGxhcHNlQWxsYCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2NtQ29sbGFwc2VBbGwnLCBcIkNvbGxhcHNlIEFsbFwiKSxcblx0XHRcdHZpZXdJZDogVklFV19QQU5FX0lELFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jb2xsYXBzZUFsbCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5TQ01SZXNvdXJjZUdyb3VwQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICc5X2NvbGxhcHNlJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleXMuU0NNVmlld01vZGUuaXNFcXVhbFRvKFZpZXdNb2RlLlRyZWUpLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogU0NNVmlld1BhbmUsIGNvbnRleHQ/OiBJU0NNUmVzb3VyY2VHcm91cCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChjb250ZXh0KSB7XG5cdFx0XHR2aWV3LmNvbGxhcHNlQWxsUmVzb3VyY2VzKGNvbnRleHQpO1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoQ29sbGFwc2VBbGxBY3Rpb24pO1xuXG5leHBvcnQgY2xhc3MgU0NNVmlld1BhbmUgZXh0ZW5kcyBWaWV3UGFuZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRMYXlvdXQ6IEVtaXR0ZXI8dm9pZD47XG5cdHByaXZhdGUgbGF5b3V0Q2FjaGU6IElTQ01MYXlvdXQ7XG5cblx0cHJpdmF0ZSB0cmVlU2Nyb2xsVG9wOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdHJlZUNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRyZWUhOiBXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlPElTQ01WaWV3U2VydmljZSwgVHJlZUVsZW1lbnQsIEZ1enp5U2NvcmU+O1xuXG5cdHByaXZhdGUgbGlzdExhYmVscyE6IFJlc291cmNlTGFiZWxzO1xuXHRwcml2YXRlIGlucHV0UmVuZGVyZXIhOiBJbnB1dFJlbmRlcmVyO1xuXHRwcml2YXRlIGFjdGlvbkJ1dHRvblJlbmRlcmVyITogQWN0aW9uQnV0dG9uUmVuZGVyZXI7XG5cblx0cHJpdmF0ZSBfdmlld01vZGU6IFZpZXdNb2RlO1xuXHRnZXQgdmlld01vZGUoKTogVmlld01vZGUgeyByZXR1cm4gdGhpcy5fdmlld01vZGU7IH1cblx0c2V0IHZpZXdNb2RlKG1vZGU6IFZpZXdNb2RlKSB7XG5cdFx0aWYgKHRoaXMuX3ZpZXdNb2RlID09PSBtb2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fdmlld01vZGUgPSBtb2RlO1xuXG5cdFx0Ly8gVXBkYXRlIHNvcnQga2V5IGJhc2VkIG9uIHZpZXcgbW9kZVxuXHRcdHRoaXMudmlld1NvcnRLZXkgPSB0aGlzLmdldFZpZXdTb3J0S2V5KCk7XG5cblx0XHR0aGlzLnVwZGF0ZUNoaWxkcmVuKCk7XG5cdFx0dGhpcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlld01vZGUuZmlyZShtb2RlKTtcblx0XHR0aGlzLnZpZXdNb2RlQ29udGV4dEtleS5zZXQobW9kZSk7XG5cblx0XHR0aGlzLnVwZGF0ZUluZGVudFN0eWxlcyh0aGlzLnRoZW1lU2VydmljZS5nZXRGaWxlSWNvblRoZW1lKCkpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoYHNjbS52aWV3TW9kZWAsIG1vZGUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpZXdNb2RlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Vmlld01vZGU+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpZXdNb2RlID0gdGhpcy5fb25EaWRDaGFuZ2VWaWV3TW9kZS5ldmVudDtcblxuXHRwcml2YXRlIF92aWV3U29ydEtleTogVmlld1NvcnRLZXk7XG5cdGdldCB2aWV3U29ydEtleSgpOiBWaWV3U29ydEtleSB7IHJldHVybiB0aGlzLl92aWV3U29ydEtleTsgfVxuXHRzZXQgdmlld1NvcnRLZXkoc29ydEtleTogVmlld1NvcnRLZXkpIHtcblx0XHRpZiAodGhpcy5fdmlld1NvcnRLZXkgPT09IHNvcnRLZXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl92aWV3U29ydEtleSA9IHNvcnRLZXk7XG5cblx0XHR0aGlzLnVwZGF0ZUNoaWxkcmVuKCk7XG5cdFx0dGhpcy52aWV3U29ydEtleUNvbnRleHRLZXkuc2V0KHNvcnRLZXkpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlld1NvcnRLZXkuZmlyZShzb3J0S2V5KTtcblxuXHRcdGlmICh0aGlzLl92aWV3TW9kZSA9PT0gVmlld01vZGUuTGlzdCkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShgc2NtLnZpZXdTb3J0S2V5YCwgc29ydEtleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpZXdTb3J0S2V5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Vmlld1NvcnRLZXk+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpZXdTb3J0S2V5ID0gdGhpcy5fb25EaWRDaGFuZ2VWaWV3U29ydEtleS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGl0ZW1zID0gbmV3IERpc3Bvc2FibGVNYXA8SVNDTVJlcG9zaXRvcnksIElEaXNwb3NhYmxlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHZpc2liaWxpdHlEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHRyZWVPcGVyYXRpb25TZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmV2ZWFsUmVzb3VyY2VUaHJvdHRsZXIgPSBuZXcgVGhyb3R0bGVyKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdXBkYXRlQ2hpbGRyZW5UaHJvdHRsZXIgPSBuZXcgVGhyb3R0bGVyKCk7XG5cblx0cHJpdmF0ZSB2aWV3TW9kZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PFZpZXdNb2RlPjtcblx0cHJpdmF0ZSB2aWV3U29ydEtleUNvbnRleHRLZXk6IElDb250ZXh0S2V5PFZpZXdTb3J0S2V5Pjtcblx0cHJpdmF0ZSBhcmVBbGxSZXBvc2l0b3JpZXNDb2xsYXBzZWRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBpc0FueVJlcG9zaXRvcnlDb2xsYXBzaWJsZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgc2NtUHJvdmlkZXJDb250ZXh0S2V5OiBJQ29udGV4dEtleTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHNjbVByb3ZpZGVyUm9vdFVyaUNvbnRleHRLZXk6IElDb250ZXh0S2V5PHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgc2NtUHJvdmlkZXJIYXNSb290VXJpQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld1BhbmVPcHRpb25zLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJU0NNU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNjbVNlcnZpY2U6IElTQ01TZXJ2aWNlLFxuXHRcdEBJU0NNVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzY21WaWV3U2VydmljZTogSVNDTVZpZXdTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih7IC4uLm9wdGlvbnMsIHRpdGxlTWVudUlkOiBNZW51SWQuU0NNVGl0bGUgfSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cblx0XHQvLyBWaWV3IG1vZGUgYW5kIHNvcnQga2V5XG5cdFx0dGhpcy5fdmlld01vZGUgPSB0aGlzLmdldFZpZXdNb2RlKCk7XG5cdFx0dGhpcy5fdmlld1NvcnRLZXkgPSB0aGlzLmdldFZpZXdTb3J0S2V5KCk7XG5cblx0XHQvLyBDb250ZXh0IEtleXNcblx0XHR0aGlzLnZpZXdNb2RlQ29udGV4dEtleSA9IENvbnRleHRLZXlzLlNDTVZpZXdNb2RlLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy52aWV3TW9kZUNvbnRleHRLZXkuc2V0KHRoaXMuX3ZpZXdNb2RlKTtcblx0XHR0aGlzLnZpZXdTb3J0S2V5Q29udGV4dEtleSA9IENvbnRleHRLZXlzLlNDTVZpZXdTb3J0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy52aWV3U29ydEtleUNvbnRleHRLZXkuc2V0KHRoaXMudmlld1NvcnRLZXkpO1xuXHRcdHRoaXMuYXJlQWxsUmVwb3NpdG9yaWVzQ29sbGFwc2VkQ29udGV4dEtleSA9IENvbnRleHRLZXlzLlNDTVZpZXdBcmVBbGxSZXBvc2l0b3JpZXNDb2xsYXBzZWQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmlzQW55UmVwb3NpdG9yeUNvbGxhcHNpYmxlQ29udGV4dEtleSA9IENvbnRleHRLZXlzLlNDTVZpZXdJc0FueVJlcG9zaXRvcnlDb2xsYXBzaWJsZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2NtUHJvdmlkZXJDb250ZXh0S2V5ID0gQ29udGV4dEtleXMuU0NNUHJvdmlkZXIuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNjbVByb3ZpZGVyUm9vdFVyaUNvbnRleHRLZXkgPSBDb250ZXh0S2V5cy5TQ01Qcm92aWRlclJvb3RVcmkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNjbVByb3ZpZGVySGFzUm9vdFVyaUNvbnRleHRLZXkgPSBDb250ZXh0S2V5cy5TQ01Qcm92aWRlckhhc1Jvb3RVcmkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX29uRGlkTGF5b3V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0dGhpcy5sYXlvdXRDYWNoZSA9IHsgaGVpZ2h0OiB1bmRlZmluZWQsIHdpZHRoOiB1bmRlZmluZWQsIG9uRGlkQ2hhbmdlOiB0aGlzLl9vbkRpZExheW91dC5ldmVudCB9O1xuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIHVuZGVmaW5lZCwgdGhpcy5kaXNwb3NhYmxlcykoZSA9PiB7XG5cdFx0XHRzd2l0Y2ggKGUua2V5KSB7XG5cdFx0XHRcdGNhc2UgJ3NjbS52aWV3TW9kZSc6XG5cdFx0XHRcdFx0dGhpcy52aWV3TW9kZSA9IHRoaXMuZ2V0Vmlld01vZGUoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnc2NtLnZpZXdTb3J0S2V5Jzpcblx0XHRcdFx0XHR0aGlzLnZpZXdTb3J0S2V5ID0gdGhpcy5nZXRWaWV3U29ydEtleSgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0sIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoZSA9PiB7XG5cdFx0XHR0aGlzLnZpZXdNb2RlID0gdGhpcy5nZXRWaWV3TW9kZSgpO1xuXHRcdFx0dGhpcy52aWV3U29ydEtleSA9IHRoaXMuZ2V0Vmlld1NvcnRLZXkoKTtcblxuXHRcdFx0dGhpcy5zdG9yZVRyZWVWaWV3U3RhdGUoKTtcblx0XHR9LCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblxuXHRcdEV2ZW50LmFueSh0aGlzLnNjbVNlcnZpY2Uub25EaWRBZGRSZXBvc2l0b3J5LCB0aGlzLnNjbVNlcnZpY2Uub25EaWRSZW1vdmVSZXBvc2l0b3J5KSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZVZpZXdXZWxjb21lU3RhdGUuZmlyZSgpLCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMucmV2ZWFsUmVzb3VyY2VUaHJvdHRsZXIpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMudXBkYXRlQ2hpbGRyZW5UaHJvdHRsZXIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQgPSB0aGlzLmxheW91dENhY2hlLmhlaWdodCwgd2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZCA9IHRoaXMubGF5b3V0Q2FjaGUud2lkdGgpOiB2b2lkIHtcblx0XHRpZiAoaGVpZ2h0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAod2lkdGggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHR9XG5cblx0XHR0aGlzLmxheW91dENhY2hlLmhlaWdodCA9IGhlaWdodDtcblx0XHR0aGlzLmxheW91dENhY2hlLndpZHRoID0gd2lkdGg7XG5cdFx0dGhpcy5fb25EaWRMYXlvdXQuZmlyZSgpO1xuXG5cdFx0dGhpcy50cmVlQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0dGhpcy50cmVlLmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KGNvbnRhaW5lcik7XG5cblx0XHQvLyBUcmVlXG5cdFx0dGhpcy50cmVlQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNjbS12aWV3LnNob3ctZmlsZS1pY29ucycpKTtcblx0XHR0aGlzLnRyZWVDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZmlsZS1pY29uLXRoZW1hYmxlLXRyZWUnKTtcblx0XHR0aGlzLnRyZWVDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc2hvdy1maWxlLWljb25zJyk7XG5cblx0XHRjb25zdCB1cGRhdGVBY3Rpb25zVmlzaWJpbGl0eSA9ICgpID0+IHRoaXMudHJlZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzaG93LWFjdGlvbnMnLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdzY20uYWx3YXlzU2hvd0FjdGlvbnMnKSk7XG5cdFx0RXZlbnQuZmlsdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3NjbS5hbHdheXNTaG93QWN0aW9ucycpLCB0aGlzLmRpc3Bvc2FibGVzKSh1cGRhdGVBY3Rpb25zVmlzaWJpbGl0eSwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0dXBkYXRlQWN0aW9uc1Zpc2liaWxpdHkoKTtcblxuXHRcdGNvbnN0IHVwZGF0ZVByb3ZpZGVyQ291bnRWaXNpYmlsaXR5ID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdoaWRkZW4nIHwgJ2F1dG8nIHwgJ3Zpc2libGUnPignc2NtLnByb3ZpZGVyQ291bnRCYWRnZScpO1xuXHRcdFx0dGhpcy50cmVlQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGUtcHJvdmlkZXItY291bnRzJywgdmFsdWUgPT09ICdoaWRkZW4nKTtcblx0XHRcdHRoaXMudHJlZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdhdXRvLXByb3ZpZGVyLWNvdW50cycsIHZhbHVlID09PSAnYXV0bycpO1xuXHRcdH07XG5cdFx0RXZlbnQuZmlsdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3NjbS5wcm92aWRlckNvdW50QmFkZ2UnKSwgdGhpcy5kaXNwb3NhYmxlcykodXBkYXRlUHJvdmlkZXJDb3VudFZpc2liaWxpdHksIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdHVwZGF0ZVByb3ZpZGVyQ291bnRWaXNpYmlsaXR5KCk7XG5cblx0XHRjb25zdCB2aWV3U3RhdGUgPSB0aGlzLmxvYWRUcmVlVmlld1N0YXRlKCk7XG5cdFx0dGhpcy5jcmVhdGVUcmVlKHRoaXMudHJlZUNvbnRhaW5lciwgdmlld1N0YXRlKTtcblxuXHRcdHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eShhc3luYyB2aXNpYmxlID0+IHtcblx0XHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMudHJlZU9wZXJhdGlvblNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy50cmVlLnNldElucHV0KHRoaXMuc2NtVmlld1NlcnZpY2UsIHZpZXdTdGF0ZSk7XG5cblx0XHRcdFx0XHRFdmVudC5maWx0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sXG5cdFx0XHRcdFx0XHRlID0+XG5cdFx0XHRcdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3NjbS5hbHdheXNTaG93UmVwb3NpdG9yaWVzJyksXG5cdFx0XHRcdFx0XHR0aGlzLnZpc2liaWxpdHlEaXNwb3NhYmxlcylcblx0XHRcdFx0XHRcdCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMudXBkYXRlQWN0aW9ucygpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUNoaWxkcmVuKCk7XG5cdFx0XHRcdFx0XHR9LCB0aGlzLCB0aGlzLnZpc2liaWxpdHlEaXNwb3NhYmxlcyk7XG5cblx0XHRcdFx0XHRFdmVudC5maWx0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sXG5cdFx0XHRcdFx0XHRlID0+XG5cdFx0XHRcdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3NjbS5pbnB1dE1pbkxpbmVDb3VudCcpIHx8XG5cdFx0XHRcdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3NjbS5pbnB1dE1heExpbmVDb3VudCcpIHx8XG5cdFx0XHRcdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3NjbS5zaG93QWN0aW9uQnV0dG9uJyksXG5cdFx0XHRcdFx0XHR0aGlzLnZpc2liaWxpdHlEaXNwb3NhYmxlcylcblx0XHRcdFx0XHRcdCgoKSA9PiB0aGlzLnVwZGF0ZUNoaWxkcmVuKCksIHRoaXMsIHRoaXMudmlzaWJpbGl0eURpc3Bvc2FibGVzKTtcblxuXHRcdFx0XHRcdC8vIEFkZCB2aXNpYmxlIHJlcG9zaXRvcmllc1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSh0aGlzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLCB0aGlzLCB0aGlzLnZpc2liaWxpdHlEaXNwb3NhYmxlcyk7XG5cdFx0XHRcdFx0dGhpcy5zY21WaWV3U2VydmljZS5vbkRpZENoYW5nZVZpc2libGVSZXBvc2l0b3JpZXModGhpcy5vbkRpZENoYW5nZVZpc2libGVSZXBvc2l0b3JpZXMsIHRoaXMsIHRoaXMudmlzaWJpbGl0eURpc3Bvc2FibGVzKTtcblx0XHRcdFx0XHR0aGlzLm9uRGlkQ2hhbmdlVmlzaWJsZVJlcG9zaXRvcmllcyh7IGFkZGVkOiB0aGlzLnNjbVZpZXdTZXJ2aWNlLnZpc2libGVSZXBvc2l0b3JpZXMsIHJlbW92ZWQ6IEl0ZXJhYmxlLmVtcHR5KCkgfSk7XG5cblx0XHRcdFx0XHQvLyBSZXN0b3JlIHNjcm9sbCBwb3NpdGlvblxuXHRcdFx0XHRcdGlmICh0eXBlb2YgdGhpcy50cmVlU2Nyb2xsVG9wID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0dGhpcy50cmVlLnNjcm9sbFRvcCA9IHRoaXMudHJlZVNjcm9sbFRvcDtcblx0XHRcdFx0XHRcdHRoaXMudHJlZVNjcm9sbFRvcCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVJlcG9zaXRvcnlDb2xsYXBzZUFsbENvbnRleHRLZXlzKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy52aXNpYmlsaXR5RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5vbkRpZENoYW5nZVZpc2libGVSZXBvc2l0b3JpZXMoeyBhZGRlZDogSXRlcmFibGUuZW1wdHkoKSwgcmVtb3ZlZDogWy4uLnRoaXMuaXRlbXMua2V5cygpXSB9KTtcblx0XHRcdFx0dGhpcy50cmVlU2Nyb2xsVG9wID0gdGhpcy50cmVlLnNjcm9sbFRvcDtcblxuXHRcdFx0XHR0aGlzLnVwZGF0ZVJlcG9zaXRvcnlDb2xsYXBzZUFsbENvbnRleHRLZXlzKCk7XG5cdFx0XHR9XG5cdFx0fSwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlcG9zaXRvcnlWaXNpYmlsaXR5QWN0aW9uQ29udHJvbGxlcikpO1xuXG5cdFx0dGhpcy50aGVtZVNlcnZpY2Uub25EaWRGaWxlSWNvblRoZW1lQ2hhbmdlKHRoaXMudXBkYXRlSW5kZW50U3R5bGVzLCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0XHR0aGlzLnVwZGF0ZUluZGVudFN0eWxlcyh0aGlzLnRoZW1lU2VydmljZS5nZXRGaWxlSWNvblRoZW1lKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUcmVlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHZpZXdTdGF0ZT86IElBc3luY0RhdGFUcmVlVmlld1N0YXRlKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSA9ICQoJy5zY20tb3ZlcmZsb3ctd2lkZ2V0cy1jb250YWluZXIubW9uYWNvLWVkaXRvcicpO1xuXG5cdFx0dGhpcy5pbnB1dFJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnB1dFJlbmRlcmVyLCB0aGlzLmxheW91dENhY2hlLCBvdmVyZmxvd1dpZGdldHNEb21Ob2RlLCAoaW5wdXQsIGhlaWdodCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Ly8gQXR0ZW1wdCB0byB1cGRhdGUgdGhlIGlucHV0IGVsZW1lbnQgaGVpZ2h0LiBUaGVyZSBpcyBhblxuXHRcdFx0XHQvLyBlZGdlIGNhc2Ugd2hlcmUgdGhlIGlucHV0IGhhcyBhbHJlYWR5IGJlZW4gZGlzcG9zZWQgYW5kXG5cdFx0XHRcdC8vIHVwZGF0aW5nIHRoZSBoZWlnaHQgd291bGQgZmFpbC5cblx0XHRcdFx0dGhpcy50cmVlLnVwZGF0ZUVsZW1lbnRIZWlnaHQoaW5wdXQsIGhlaWdodCk7XG5cdFx0XHR9XG5cdFx0XHRjYXRjaCB7IH1cblx0XHR9KTtcblx0XHR0aGlzLmFjdGlvbkJ1dHRvblJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBY3Rpb25CdXR0b25SZW5kZXJlcik7XG5cblx0XHR0aGlzLmxpc3RMYWJlbHMgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCB7IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogdGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5IH0pO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMubGlzdExhYmVscyk7XG5cblx0XHRjb25zdCByZXNvdXJjZUFjdGlvblJ1bm5lciA9IG5ldyBSZXBvc2l0b3J5UGFuZUFjdGlvblJ1bm5lcigoKSA9PiB0aGlzLmdldFNlbGVjdGVkUmVzb3VyY2VzKCkpO1xuXHRcdHJlc291cmNlQWN0aW9uUnVubmVyLm9uV2lsbFJ1bigoKSA9PiB0aGlzLnRyZWUuZG9tRm9jdXMoKSwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQocmVzb3VyY2VBY3Rpb25SdW5uZXIpO1xuXG5cdFx0Y29uc3QgdHJlZURhdGFTb3VyY2UgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNDTVRyZWVEYXRhU291cmNlLCAoKSA9PiB0aGlzLnZpZXdNb2RlKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0cmVlRGF0YVNvdXJjZSk7XG5cblx0XHRjb25zdCBjb21wcmVzc2lvbkVuYWJsZWQgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWUoJ3NjbS5jb21wYWN0Rm9sZGVycycsIHRydWUsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy50cmVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWUsXG5cdFx0XHQnU0NNIFRyZWUgUmVwbycsXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRuZXcgTGlzdERlbGVnYXRlKHRoaXMuaW5wdXRSZW5kZXJlciksXG5cdFx0XHRuZXcgU0NNVHJlZUNvbXByZXNzaW9uRGVsZWdhdGUoKSxcblx0XHRcdFtcblx0XHRcdFx0dGhpcy5pbnB1dFJlbmRlcmVyLFxuXHRcdFx0XHR0aGlzLmFjdGlvbkJ1dHRvblJlbmRlcmVyLFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlcG9zaXRvcnlSZW5kZXJlciwgTWVudUlkLlNDTVRpdGxlLCBnZXRBY3Rpb25WaWV3SXRlbVByb3ZpZGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUdyb3VwUmVuZGVyZXIsIGdldEFjdGlvblZpZXdJdGVtUHJvdmlkZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSksIHJlc291cmNlQWN0aW9uUnVubmVyKSxcblx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZVJlbmRlcmVyLCAoKSA9PiB0aGlzLnZpZXdNb2RlLCB0aGlzLmxpc3RMYWJlbHMsIGdldEFjdGlvblZpZXdJdGVtUHJvdmlkZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSksIHJlc291cmNlQWN0aW9uUnVubmVyKSlcblx0XHRcdF0sXG5cdFx0XHR0cmVlRGF0YVNvdXJjZSxcblx0XHRcdHtcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRcdHNldFJvd0xpbmVIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHR0cmFuc2Zvcm1PcHRpbWl6YXRpb246IGZhbHNlLFxuXHRcdFx0XHRmaWx0ZXI6IG5ldyBTQ01UcmVlRmlsdGVyKCksXG5cdFx0XHRcdGRuZDogbmV3IFNDTVRyZWVEcmFnQW5kRHJvcCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjogbmV3IFNDTVJlc291cmNlSWRlbnRpdHlQcm92aWRlcigpLFxuXHRcdFx0XHRzb3J0ZXI6IG5ldyBTQ01UcmVlU29ydGVyKCgpID0+IHRoaXMudmlld01vZGUsICgpID0+IHRoaXMudmlld1NvcnRLZXkpLFxuXHRcdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNDTVRyZWVLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyLCAoKSA9PiB0aGlzLnZpZXdNb2RlKSxcblx0XHRcdFx0b3ZlcnJpZGVTdHlsZXM6IHRoaXMuZ2V0TG9jYXRpb25CYXNlZENvbG9ycygpLmxpc3RPdmVycmlkZVN0eWxlcyxcblx0XHRcdFx0Y29tcHJlc3Npb25FbmFibGVkOiBjb21wcmVzc2lvbkVuYWJsZWQuZ2V0KCksXG5cdFx0XHRcdGNvbGxhcHNlQnlEZWZhdWx0OiAoZTogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRcdC8vIFJlcG9zaXRvcnksIFJlc291cmNlIEdyb3VwLCBSZXNvdXJjZSBGb2xkZXIgKFRyZWUpIGFyZSBub3QgY29sbGFwc2VkIGJ5IGRlZmF1bHRcblx0XHRcdFx0XHRyZXR1cm4gIShpc1NDTVJlcG9zaXRvcnkoZSkgfHwgaXNTQ01SZXNvdXJjZUdyb3VwKGUpIHx8IGlzU0NNUmVzb3VyY2VOb2RlKGUpKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNDTUFjY2Vzc2liaWxpdHlQcm92aWRlciksXG5cdFx0XHRcdHR3aXN0aWVBZGRpdGlvbmFsQ3NzQ2xhc3M6IChlOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGlzU0NNQWN0aW9uQnV0dG9uKGUpIHx8IGlzU0NNSW5wdXQoZSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiAnZm9yY2Utbm8tdHdpc3RpZSc7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fSxcblx0XHRcdH0pIGFzIFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8SVNDTVZpZXdTZXJ2aWNlLCBUcmVlRWxlbWVudCwgRnV6enlTY29yZT47XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLnRyZWUpO1xuXG5cdFx0dGhpcy50cmVlLm9uRGlkT3Blbih0aGlzLm9wZW4sIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMudHJlZS5vbkNvbnRleHRNZW51KHRoaXMub25MaXN0Q29udGV4dE1lbnUsIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMudHJlZS5vbkRpZFNjcm9sbCh0aGlzLmlucHV0UmVuZGVyZXIuY2xlYXJWYWxpZGF0aW9uLCB0aGlzLmlucHV0UmVuZGVyZXIsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdEV2ZW50LmZpbHRlcih0aGlzLnRyZWUub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlLCBlID0+IGlzU0NNUmVwb3NpdG9yeShlLm5vZGUuZWxlbWVudD8uZWxlbWVudCksIHRoaXMuZGlzcG9zYWJsZXMpKHRoaXMudXBkYXRlUmVwb3NpdG9yeUNvbGxhcHNlQWxsQ29udGV4dEtleXMsIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy50cmVlLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0XHRjb21wcmVzc2lvbkVuYWJsZWQ6IGNvbXByZXNzaW9uRW5hYmxlZC5yZWFkKHJlYWRlcilcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdGFwcGVuZChjb250YWluZXIsIG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuKGU6IElPcGVuRXZlbnQ8VHJlZUVsZW1lbnQgfCB1bmRlZmluZWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFlLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9IGVsc2UgaWYgKGlzU0NNUmVwb3NpdG9yeShlLmVsZW1lbnQpKSB7XG5cdFx0XHR0aGlzLnNjbVZpZXdTZXJ2aWNlLmZvY3VzKGUuZWxlbWVudCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fSBlbHNlIGlmIChpc1NDTUlucHV0KGUuZWxlbWVudCkpIHtcblx0XHRcdHRoaXMuc2NtVmlld1NlcnZpY2UuZm9jdXMoZS5lbGVtZW50LnJlcG9zaXRvcnkpO1xuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmlucHV0UmVuZGVyZXIuZ2V0UmVuZGVyZWRJbnB1dFdpZGdldChlLmVsZW1lbnQpO1xuXG5cdFx0XHRpZiAod2lkZ2V0KSB7XG5cdFx0XHRcdHdpZGdldC5mb2N1cygpO1xuXHRcdFx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMoW10sIGUuYnJvd3NlckV2ZW50KTtcblxuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCk7XG5cblx0XHRcdFx0aWYgKHNlbGVjdGlvbi5sZW5ndGggPT09IDEgJiYgc2VsZWN0aW9uWzBdID09PSBlLmVsZW1lbnQpIHtcblx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW10pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm47XG5cdFx0fSBlbHNlIGlmIChpc1NDTUFjdGlvbkJ1dHRvbihlLmVsZW1lbnQpKSB7XG5cdFx0XHR0aGlzLnNjbVZpZXdTZXJ2aWNlLmZvY3VzKGUuZWxlbWVudC5yZXBvc2l0b3J5KTtcblxuXHRcdFx0Ly8gRm9jdXMgdGhlIGFjdGlvbiBidXR0b25cblx0XHRcdHRoaXMuYWN0aW9uQnV0dG9uUmVuZGVyZXIuZm9jdXNBY3Rpb25CdXR0b24oZS5lbGVtZW50KTtcblx0XHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbXSwgZS5icm93c2VyRXZlbnQpO1xuXG5cdFx0XHRyZXR1cm47XG5cdFx0fSBlbHNlIGlmIChpc1NDTVJlc291cmNlR3JvdXAoZS5lbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBlLmVsZW1lbnQucHJvdmlkZXI7XG5cdFx0XHRjb25zdCByZXBvc2l0b3J5ID0gSXRlcmFibGUuZmluZCh0aGlzLnNjbVNlcnZpY2UucmVwb3NpdG9yaWVzLCByID0+IHIucHJvdmlkZXIgPT09IHByb3ZpZGVyKTtcblx0XHRcdGlmIChyZXBvc2l0b3J5KSB7XG5cdFx0XHRcdHRoaXMuc2NtVmlld1NlcnZpY2UuZm9jdXMocmVwb3NpdG9yeSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fSBlbHNlIGlmIChpc1NDTVJlc291cmNlKGUuZWxlbWVudCkpIHtcblx0XHRcdGlmIChlLmVsZW1lbnQuY29tbWFuZD8uaWQgPT09IEFQSV9PUEVOX0VESVRPUl9DT01NQU5EX0lEIHx8IGUuZWxlbWVudC5jb21tYW5kPy5pZCA9PT0gQVBJX09QRU5fRElGRl9FRElUT1JfQ09NTUFORF9JRCkge1xuXHRcdFx0XHRpZiAoaXNQb2ludGVyRXZlbnQoZS5icm93c2VyRXZlbnQpICYmIGUuYnJvd3NlckV2ZW50LmJ1dHRvbiA9PT0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc291cmNlR3JvdXAgPSBlLmVsZW1lbnQucmVzb3VyY2VHcm91cDtcblx0XHRcdFx0XHRjb25zdCB0aXRsZSA9IGAke3Jlc291cmNlR3JvdXAucHJvdmlkZXIubGFiZWx9OiAke3Jlc291cmNlR3JvdXAubGFiZWx9YDtcblx0XHRcdFx0XHRhd2FpdCBPcGVuU2NtR3JvdXBBY3Rpb24ub3Blbk11bHRpRmlsZURpZmZFZGl0b3IodGhpcy5lZGl0b3JTZXJ2aWNlLCB0aXRsZSwgcmVzb3VyY2VHcm91cC5wcm92aWRlci5yb290VXJpLCByZXNvdXJjZUdyb3VwLmlkLCB7XG5cdFx0XHRcdFx0XHQuLi5lLmVkaXRvck9wdGlvbnMsXG5cdFx0XHRcdFx0XHR2aWV3U3RhdGU6IHtcblx0XHRcdFx0XHRcdFx0cmV2ZWFsRGF0YToge1xuXHRcdFx0XHRcdFx0XHRcdHJlc291cmNlOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRvcmlnaW5hbDogZS5lbGVtZW50Lm11bHRpRGlmZkVkaXRvck9yaWdpbmFsVXJpLFxuXHRcdFx0XHRcdFx0XHRcdFx0bW9kaWZpZWQ6IGUuZWxlbWVudC5tdWx0aURpZmZFZGl0b3JNb2RpZmllZFVyaSxcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiB0cnVlLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoZS5lbGVtZW50LmNvbW1hbmQuaWQsIC4uLihlLmVsZW1lbnQuY29tbWFuZC5hcmd1bWVudHMgfHwgW10pLCBlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgZS5lbGVtZW50Lm9wZW4oISFlLmVkaXRvck9wdGlvbnMucHJlc2VydmVGb2N1cyk7XG5cblx0XHRcdFx0aWYgKGUuZWRpdG9yT3B0aW9ucy5waW5uZWQpIHtcblx0XHRcdFx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cblx0XHRcdFx0XHRhY3RpdmVFZGl0b3JQYW5lPy5ncm91cC5waW5FZGl0b3IoYWN0aXZlRWRpdG9yUGFuZS5pbnB1dCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBlLmVsZW1lbnQucmVzb3VyY2VHcm91cC5wcm92aWRlcjtcblx0XHRcdGNvbnN0IHJlcG9zaXRvcnkgPSBJdGVyYWJsZS5maW5kKHRoaXMuc2NtU2VydmljZS5yZXBvc2l0b3JpZXMsIHIgPT4gci5wcm92aWRlciA9PT0gcHJvdmlkZXIpO1xuXG5cdFx0XHRpZiAocmVwb3NpdG9yeSkge1xuXHRcdFx0XHR0aGlzLnNjbVZpZXdTZXJ2aWNlLmZvY3VzKHJlcG9zaXRvcnkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNTQ01SZXNvdXJjZU5vZGUoZS5lbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBlLmVsZW1lbnQuY29udGV4dC5wcm92aWRlcjtcblx0XHRcdGNvbnN0IHJlcG9zaXRvcnkgPSBJdGVyYWJsZS5maW5kKHRoaXMuc2NtU2VydmljZS5yZXBvc2l0b3JpZXMsIHIgPT4gci5wcm92aWRlciA9PT0gcHJvdmlkZXIpO1xuXHRcdFx0aWYgKHJlcG9zaXRvcnkpIHtcblx0XHRcdFx0dGhpcy5zY21WaWV3U2VydmljZS5mb2N1cyhyZXBvc2l0b3J5KTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignc2NtLmF1dG9SZXZlYWwnKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVyaSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkodGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXG5cdFx0aWYgKCF1cmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEbyBub3Qgc2V0IGZvY3VzL3NlbGVjdGlvbiB3aGVuIHRoZSByZXNvdXJjZSBpcyBhbHJlYWR5IGZvY3VzZWQgYW5kIHNlbGVjdGVkXG5cdFx0aWYgKHRoaXMudHJlZS5nZXRGb2N1cygpLnNvbWUoZSA9PiBpc1NDTVJlc291cmNlKGUpICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGUuc291cmNlVXJpLCB1cmkpKSAmJlxuXHRcdFx0dGhpcy50cmVlLmdldFNlbGVjdGlvbigpLnNvbWUoZSA9PiBpc1NDTVJlc291cmNlKGUpICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGUuc291cmNlVXJpLCB1cmkpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucmV2ZWFsUmVzb3VyY2VUaHJvdHRsZXIucXVldWUoXG5cdFx0XHQoKSA9PiB0aGlzLnRyZWVPcGVyYXRpb25TZXF1ZW5jZXIucXVldWUoXG5cdFx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2YgdGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtID0gdGhpcy5pdGVtcy5nZXQocmVwb3NpdG9yeSk7XG5cblx0XHRcdFx0XHRcdGlmICghaXRlbSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gZ28gYmFja3dhcmRzIGZyb20gbGFzdCBncm91cFxuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaiA9IHJlcG9zaXRvcnkucHJvdmlkZXIuZ3JvdXBzLmxlbmd0aCAtIDE7IGogPj0gMDsgai0tKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGdyb3VwSXRlbSA9IHJlcG9zaXRvcnkucHJvdmlkZXIuZ3JvdXBzW2pdO1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMudmlld01vZGUgPT09IFZpZXdNb2RlLlRyZWVcblx0XHRcdFx0XHRcdFx0XHQ/IGdyb3VwSXRlbS5yZXNvdXJjZVRyZWUuZ2V0Tm9kZSh1cmkpPy5lbGVtZW50XG5cdFx0XHRcdFx0XHRcdFx0OiBncm91cEl0ZW0ucmVzb3VyY2VzLmZpbmQociA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChyLnNvdXJjZVVyaSwgdXJpKSk7XG5cblx0XHRcdFx0XHRcdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy50cmVlLmV4cGFuZFRvKHJlc291cmNlKTtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnRyZWUucmV2ZWFsKHJlc291cmNlKTtcblxuXHRcdFx0XHRcdFx0XHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW3Jlc291cmNlXSk7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy50cmVlLnNldEZvY3VzKFtyZXNvdXJjZV0pO1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVZpc2libGVSZXBvc2l0b3JpZXMoeyBhZGRlZCwgcmVtb3ZlZCB9OiBJU0NNVmlld1Zpc2libGVSZXBvc2l0b3J5Q2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHQvLyBBZGRlZCByZXBvc2l0b3JpZXNcblx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2YgYWRkZWQpIHtcblx0XHRcdGNvbnN0IHJlcG9zaXRvcnlEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0cmVwb3NpdG9yeURpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gYWN0aW9uIGJ1dHRvbiAqL1xuXHRcdFx0XHRyZXBvc2l0b3J5LnByb3ZpZGVyLmFjdGlvbkJ1dHRvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHRoaXMudXBkYXRlQ2hpbGRyZW4ocmVwb3NpdG9yeSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHJlcG9zaXRvcnlEaXNwb3NhYmxlcy5hZGQocmVwb3NpdG9yeS5pbnB1dC5vbkRpZENoYW5nZVZpc2liaWxpdHkoKCkgPT4gdGhpcy51cGRhdGVDaGlsZHJlbihyZXBvc2l0b3J5KSkpO1xuXHRcdFx0cmVwb3NpdG9yeURpc3Bvc2FibGVzLmFkZChyZXBvc2l0b3J5LnByb3ZpZGVyLm9uRGlkQ2hhbmdlUmVzb3VyY2VHcm91cHMoKCkgPT4gdGhpcy51cGRhdGVDaGlsZHJlbihyZXBvc2l0b3J5KSkpO1xuXG5cdFx0XHRjb25zdCByZXNvdXJjZUdyb3VwRGlzcG9zYWJsZXMgPSByZXBvc2l0b3J5RGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlTWFwPElTQ01SZXNvdXJjZUdyb3VwLCBJRGlzcG9zYWJsZT4oKSk7XG5cblx0XHRcdGNvbnN0IG9uRGlkQ2hhbmdlUmVzb3VyY2VHcm91cHMgPSAoKSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgW3Jlc291cmNlR3JvdXBdIG9mIHJlc291cmNlR3JvdXBEaXNwb3NhYmxlcykge1xuXHRcdFx0XHRcdGlmICghcmVwb3NpdG9yeS5wcm92aWRlci5ncm91cHMuaW5jbHVkZXMocmVzb3VyY2VHcm91cCkpIHtcblx0XHRcdFx0XHRcdHJlc291cmNlR3JvdXBEaXNwb3NhYmxlcy5kZWxldGVBbmREaXNwb3NlKHJlc291cmNlR3JvdXApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2VHcm91cCBvZiByZXBvc2l0b3J5LnByb3ZpZGVyLmdyb3Vwcykge1xuXHRcdFx0XHRcdGlmICghcmVzb3VyY2VHcm91cERpc3Bvc2FibGVzLmhhcyhyZXNvdXJjZUdyb3VwKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHJlc291cmNlR3JvdXAub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy51cGRhdGVDaGlsZHJlbihyZXBvc2l0b3J5KSkpO1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChyZXNvdXJjZUdyb3VwLm9uRGlkQ2hhbmdlUmVzb3VyY2VzKCgpID0+IHRoaXMudXBkYXRlQ2hpbGRyZW4ocmVwb3NpdG9yeSkpKTtcblx0XHRcdFx0XHRcdHJlc291cmNlR3JvdXBEaXNwb3NhYmxlcy5zZXQocmVzb3VyY2VHcm91cCwgZGlzcG9zYWJsZVN0b3JlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdHJlcG9zaXRvcnlEaXNwb3NhYmxlcy5hZGQocmVwb3NpdG9yeS5wcm92aWRlci5vbkRpZENoYW5nZVJlc291cmNlR3JvdXBzKG9uRGlkQ2hhbmdlUmVzb3VyY2VHcm91cHMpKTtcblx0XHRcdG9uRGlkQ2hhbmdlUmVzb3VyY2VHcm91cHMoKTtcblxuXHRcdFx0dGhpcy5pdGVtcy5zZXQocmVwb3NpdG9yeSwgcmVwb3NpdG9yeURpc3Bvc2FibGVzKTtcblx0XHR9XG5cblx0XHQvLyBSZW1vdmVkIHJlcG9zaXRvcmllc1xuXHRcdGZvciAoY29uc3QgcmVwb3NpdG9yeSBvZiByZW1vdmVkKSB7XG5cdFx0XHR0aGlzLml0ZW1zLmRlbGV0ZUFuZERpc3Bvc2UocmVwb3NpdG9yeSk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVDaGlsZHJlbigpO1xuXHRcdHRoaXMub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKTtcblx0fVxuXG5cdHByaXZhdGUgb25MaXN0Q29udGV4dE1lbnUoZTogSVRyZWVDb250ZXh0TWVudUV2ZW50PFRyZWVFbGVtZW50IHwgbnVsbD4pOiB2b2lkIHtcblx0XHRpZiAoIWUuZWxlbWVudCkge1xuXHRcdFx0Y29uc3QgbWVudSA9IHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudXMuVmlld1NvcnQsIHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMobWVudSk7XG5cblx0XHRcdHJldHVybiB0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdFx0XHRvbkhpZGU6ICgpID0+IHsgfVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWxlbWVudCA9IGUuZWxlbWVudDtcblx0XHRsZXQgY29udGV4dDogdW5rbm93biA9IGVsZW1lbnQ7XG5cdFx0bGV0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bGV0IGFjdGlvblJ1bm5lcjogSUFjdGlvblJ1bm5lciA9IG5ldyBSZXBvc2l0b3J5UGFuZUFjdGlvblJ1bm5lcigoKSA9PiB0aGlzLmdldFNlbGVjdGVkUmVzb3VyY2VzKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhY3Rpb25SdW5uZXIpO1xuXG5cdFx0aWYgKGlzU0NNUmVwb3NpdG9yeShlbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgbWVudXMgPSB0aGlzLnNjbVZpZXdTZXJ2aWNlLm1lbnVzLmdldFJlcG9zaXRvcnlNZW51cyhlbGVtZW50LnByb3ZpZGVyKTtcblx0XHRcdGNvbnN0IG1lbnUgPSBtZW51cy5nZXRSZXBvc2l0b3J5Q29udGV4dE1lbnUoZWxlbWVudCk7XG5cdFx0XHRjb250ZXh0ID0gZWxlbWVudC5wcm92aWRlcjtcblx0XHRcdGFjdGlvblJ1bm5lciA9IG5ldyBSZXBvc2l0b3J5QWN0aW9uUnVubmVyKCgpID0+IHRoaXMuZ2V0U2VsZWN0ZWRSZXBvc2l0b3JpZXMoKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWN0aW9uUnVubmVyKTtcblx0XHRcdGFjdGlvbnMgPSBjb2xsZWN0Q29udGV4dE1lbnVBY3Rpb25zKG1lbnUpO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01JbnB1dChlbGVtZW50KSB8fCBpc1NDTUFjdGlvbkJ1dHRvbihlbGVtZW50KSkge1xuXHRcdFx0Ly8gbm9vcFxuXHRcdH0gZWxzZSBpZiAoaXNTQ01SZXNvdXJjZUdyb3VwKGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBtZW51cyA9IHRoaXMuc2NtVmlld1NlcnZpY2UubWVudXMuZ2V0UmVwb3NpdG9yeU1lbnVzKGVsZW1lbnQucHJvdmlkZXIpO1xuXHRcdFx0Y29uc3QgbWVudSA9IG1lbnVzLmdldFJlc291cmNlR3JvdXBNZW51KGVsZW1lbnQpO1xuXHRcdFx0YWN0aW9ucyA9IGNvbGxlY3RDb250ZXh0TWVudUFjdGlvbnMobWVudSk7XG5cdFx0fSBlbHNlIGlmIChpc1NDTVJlc291cmNlKGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBtZW51cyA9IHRoaXMuc2NtVmlld1NlcnZpY2UubWVudXMuZ2V0UmVwb3NpdG9yeU1lbnVzKGVsZW1lbnQucmVzb3VyY2VHcm91cC5wcm92aWRlcik7XG5cdFx0XHRjb25zdCBtZW51ID0gbWVudXMuZ2V0UmVzb3VyY2VNZW51KGVsZW1lbnQpO1xuXHRcdFx0YWN0aW9ucyA9IGNvbGxlY3RDb250ZXh0TWVudUFjdGlvbnMobWVudSk7XG5cdFx0fSBlbHNlIGlmIChpc1NDTVJlc291cmNlTm9kZShlbGVtZW50KSkge1xuXHRcdFx0aWYgKGVsZW1lbnQuZWxlbWVudCkge1xuXHRcdFx0XHRjb25zdCBtZW51cyA9IHRoaXMuc2NtVmlld1NlcnZpY2UubWVudXMuZ2V0UmVwb3NpdG9yeU1lbnVzKGVsZW1lbnQuZWxlbWVudC5yZXNvdXJjZUdyb3VwLnByb3ZpZGVyKTtcblx0XHRcdFx0Y29uc3QgbWVudSA9IG1lbnVzLmdldFJlc291cmNlTWVudShlbGVtZW50LmVsZW1lbnQpO1xuXHRcdFx0XHRhY3Rpb25zID0gY29sbGVjdENvbnRleHRNZW51QWN0aW9ucyhtZW51KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG1lbnVzID0gdGhpcy5zY21WaWV3U2VydmljZS5tZW51cy5nZXRSZXBvc2l0b3J5TWVudXMoZWxlbWVudC5jb250ZXh0LnByb3ZpZGVyKTtcblx0XHRcdFx0Y29uc3QgbWVudSA9IG1lbnVzLmdldFJlc291cmNlRm9sZGVyTWVudShlbGVtZW50LmNvbnRleHQpO1xuXHRcdFx0XHRhY3Rpb25zID0gY29sbGVjdENvbnRleHRNZW51QWN0aW9ucyhtZW51KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoYWN0aW9uUnVubmVyLm9uV2lsbFJ1bigoKSA9PiB0aGlzLnRyZWUuZG9tRm9jdXMoKSkpO1xuXG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGFjdGlvblJ1bm5lcixcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IGNvbnRleHQsXG5cdFx0XHRvbkhpZGU6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZWxlY3RlZFJlcG9zaXRvcmllcygpOiBJU0NNUmVwb3NpdG9yeVtdIHtcblx0XHRjb25zdCBmb2N1c2VkUmVwb3NpdG9yaWVzID0gdGhpcy50cmVlLmdldEZvY3VzKCkuZmlsdGVyKHIgPT4gISFyICYmIGlzU0NNUmVwb3NpdG9yeShyKSkhIGFzIElTQ01SZXBvc2l0b3J5W107XG5cdFx0Y29uc3Qgc2VsZWN0ZWRSZXBvc2l0b3JpZXMgPSB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCkuZmlsdGVyKHIgPT4gISFyICYmIGlzU0NNUmVwb3NpdG9yeShyKSkhIGFzIElTQ01SZXBvc2l0b3J5W107XG5cblx0XHRyZXR1cm4gQXJyYXkuZnJvbShuZXcgU2V0PElTQ01SZXBvc2l0b3J5PihbLi4uZm9jdXNlZFJlcG9zaXRvcmllcywgLi4uc2VsZWN0ZWRSZXBvc2l0b3JpZXNdKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFNlbGVjdGVkUmVzb3VyY2VzKCk6IChJU0NNUmVzb3VyY2VHcm91cCB8IElTQ01SZXNvdXJjZSB8IElSZXNvdXJjZU5vZGU8SVNDTVJlc291cmNlLCBJU0NNUmVzb3VyY2VHcm91cD4pW10ge1xuXHRcdHJldHVybiB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCkuZmlsdGVyKHIgPT4gaXNTQ01SZXNvdXJjZUdyb3VwKHIpIHx8IGlzU0NNUmVzb3VyY2UocikgfHwgaXNTQ01SZXNvdXJjZU5vZGUocikpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRWaWV3TW9kZSgpOiBWaWV3TW9kZSB7XG5cdFx0bGV0IG1vZGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCd0cmVlJyB8ICdsaXN0Jz4oJ3NjbS5kZWZhdWx0Vmlld01vZGUnKSA9PT0gJ2xpc3QnID8gVmlld01vZGUuTGlzdCA6IFZpZXdNb2RlLlRyZWU7XG5cdFx0Y29uc3Qgc3RvcmFnZU1vZGUgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChgc2NtLnZpZXdNb2RlYCwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSkgYXMgVmlld01vZGU7XG5cdFx0aWYgKHR5cGVvZiBzdG9yYWdlTW9kZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdG1vZGUgPSBzdG9yYWdlTW9kZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbW9kZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Vmlld1NvcnRLZXkoKTogVmlld1NvcnRLZXkge1xuXHRcdC8vIFRyZWVcblx0XHRpZiAodGhpcy5fdmlld01vZGUgPT09IFZpZXdNb2RlLlRyZWUpIHtcblx0XHRcdHJldHVybiBWaWV3U29ydEtleS5QYXRoO1xuXHRcdH1cblxuXHRcdC8vIExpc3Rcblx0XHRsZXQgdmlld1NvcnRLZXk6IFZpZXdTb3J0S2V5O1xuXHRcdGNvbnN0IHZpZXdTb3J0S2V5U3RyaW5nID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwncGF0aCcgfCAnbmFtZScgfCAnc3RhdHVzJz4oJ3NjbS5kZWZhdWx0Vmlld1NvcnRLZXknKTtcblx0XHRzd2l0Y2ggKHZpZXdTb3J0S2V5U3RyaW5nKSB7XG5cdFx0XHRjYXNlICduYW1lJzpcblx0XHRcdFx0dmlld1NvcnRLZXkgPSBWaWV3U29ydEtleS5OYW1lO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3N0YXR1cyc6XG5cdFx0XHRcdHZpZXdTb3J0S2V5ID0gVmlld1NvcnRLZXkuU3RhdHVzO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHZpZXdTb3J0S2V5ID0gVmlld1NvcnRLZXkuUGF0aDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RvcmFnZVNvcnRLZXkgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChgc2NtLnZpZXdTb3J0S2V5YCwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSkgYXMgVmlld1NvcnRLZXk7XG5cdFx0aWYgKHR5cGVvZiBzdG9yYWdlU29ydEtleSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHZpZXdTb3J0S2V5ID0gc3RvcmFnZVNvcnRLZXk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHZpZXdTb3J0S2V5O1xuXHR9XG5cblx0cHJpdmF0ZSBsb2FkVHJlZVZpZXdTdGF0ZSgpOiBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc3RvcmFnZVZpZXdTdGF0ZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KCdzY20udmlld1N0YXRlMicsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGlmICghc3RvcmFnZVZpZXdTdGF0ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdHJlZVZpZXdTdGF0ZSA9IEpTT04ucGFyc2Uoc3RvcmFnZVZpZXdTdGF0ZSk7XG5cdFx0XHRyZXR1cm4gdHJlZVZpZXdTdGF0ZTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdG9yZVRyZWVWaWV3U3RhdGUoKSB7XG5cdFx0aWYgKHRoaXMudHJlZSkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZSgnc2NtLnZpZXdTdGF0ZTInLCBKU09OLnN0cmluZ2lmeSh0aGlzLnRyZWUuZ2V0Vmlld1N0YXRlKCkpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ2hpbGRyZW4oZWxlbWVudD86IElTQ01SZXBvc2l0b3J5KSB7XG5cdFx0dGhpcy51cGRhdGVDaGlsZHJlblRocm90dGxlci5xdWV1ZShcblx0XHRcdCgpID0+IHRoaXMudHJlZU9wZXJhdGlvblNlcXVlbmNlci5xdWV1ZShcblx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGZvY3VzZWRJbnB1dCA9IHRoaXMuaW5wdXRSZW5kZXJlci5nZXRGb2N1c2VkSW5wdXQoKTtcblxuXHRcdFx0XHRcdGlmIChlbGVtZW50ICYmIHRoaXMudHJlZS5oYXNOb2RlKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHQvLyBSZWZyZXNoIHNwZWNpZmljIHJlcG9zaXRvcnlcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMudHJlZS51cGRhdGVDaGlsZHJlbihlbGVtZW50KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gUmVmcmVzaCB0aGUgZW50aXJlIHRyZWVcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMudHJlZS51cGRhdGVDaGlsZHJlbih1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChmb2N1c2VkSW5wdXQpIHtcblx0XHRcdFx0XHRcdHRoaXMuaW5wdXRSZW5kZXJlci5nZXRSZW5kZXJlZElucHV0V2lkZ2V0KGZvY3VzZWRJbnB1dCk/LmZvY3VzKCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy51cGRhdGVTY21Qcm92aWRlckNvbnRleHRLZXlzKCk7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVSZXBvc2l0b3J5Q29sbGFwc2VBbGxDb250ZXh0S2V5cygpO1xuXHRcdFx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUluZGVudFN0eWxlcyh0aGVtZTogSUZpbGVJY29uVGhlbWUpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnbGlzdC12aWV3LW1vZGUnLCB0aGlzLnZpZXdNb2RlID09PSBWaWV3TW9kZS5MaXN0KTtcblx0XHR0aGlzLnRyZWVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgndHJlZS12aWV3LW1vZGUnLCB0aGlzLnZpZXdNb2RlID09PSBWaWV3TW9kZS5UcmVlKTtcblx0XHR0aGlzLnRyZWVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYWxpZ24taWNvbnMtYW5kLXR3aXN0aWVzJywgKHRoaXMudmlld01vZGUgPT09IFZpZXdNb2RlLkxpc3QgJiYgdGhlbWUuaGFzRmlsZUljb25zKSB8fCAodGhlbWUuaGFzRmlsZUljb25zICYmICF0aGVtZS5oYXNGb2xkZXJJY29ucykpO1xuXHRcdHRoaXMudHJlZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRlLWFycm93cycsIHRoaXMudmlld01vZGUgPT09IFZpZXdNb2RlLlRyZWUgJiYgdGhlbWUuaGlkZXNFeHBsb3JlckFycm93cyA9PT0gdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNjbVByb3ZpZGVyQ29udGV4dEtleXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgYWx3YXlzU2hvd1JlcG9zaXRvcmllcyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3NjbS5hbHdheXNTaG93UmVwb3NpdG9yaWVzJyk7XG5cblx0XHRpZiAoIWFsd2F5c1Nob3dSZXBvc2l0b3JpZXMgJiYgdGhpcy5pdGVtcy5zaXplID09PSAxKSB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IEl0ZXJhYmxlLmZpcnN0KHRoaXMuaXRlbXMua2V5cygpKSEucHJvdmlkZXI7XG5cdFx0XHR0aGlzLnNjbVByb3ZpZGVyQ29udGV4dEtleS5zZXQocHJvdmlkZXIucHJvdmlkZXJJZCk7XG5cdFx0XHR0aGlzLnNjbVByb3ZpZGVyUm9vdFVyaUNvbnRleHRLZXkuc2V0KHByb3ZpZGVyLnJvb3RVcmk/LnRvU3RyaW5nKCkpO1xuXHRcdFx0dGhpcy5zY21Qcm92aWRlckhhc1Jvb3RVcmlDb250ZXh0S2V5LnNldCghIXByb3ZpZGVyLnJvb3RVcmkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNjbVByb3ZpZGVyQ29udGV4dEtleS5zZXQodW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuc2NtUHJvdmlkZXJSb290VXJpQ29udGV4dEtleS5zZXQodW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuc2NtUHJvdmlkZXJIYXNSb290VXJpQ29udGV4dEtleS5zZXQoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUmVwb3NpdG9yeUNvbGxhcHNlQWxsQ29udGV4dEtleXMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzQm9keVZpc2libGUoKSB8fCB0aGlzLml0ZW1zLnNpemUgPT09IDEpIHtcblx0XHRcdHRoaXMuaXNBbnlSZXBvc2l0b3J5Q29sbGFwc2libGVDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0XHR0aGlzLmFyZUFsbFJlcG9zaXRvcmllc0NvbGxhcHNlZENvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmlzQW55UmVwb3NpdG9yeUNvbGxhcHNpYmxlQ29udGV4dEtleS5zZXQodGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzLnNvbWUociA9PiB0aGlzLnRyZWUuaGFzTm9kZShyKSAmJiB0aGlzLnRyZWUuaXNDb2xsYXBzaWJsZShyKSkpO1xuXHRcdHRoaXMuYXJlQWxsUmVwb3NpdG9yaWVzQ29sbGFwc2VkQ29udGV4dEtleS5zZXQodGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzLmV2ZXJ5KHIgPT4gdGhpcy50cmVlLmhhc05vZGUocikgJiYgKCF0aGlzLnRyZWUuaXNDb2xsYXBzaWJsZShyKSB8fCB0aGlzLnRyZWUuaXNDb2xsYXBzZWQocikpKSk7XG5cdH1cblxuXHRjb2xsYXBzZUFsbFJlcG9zaXRvcmllcygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2YgdGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzKSB7XG5cdFx0XHRpZiAodGhpcy50cmVlLmlzQ29sbGFwc2libGUocmVwb3NpdG9yeSkpIHtcblx0XHRcdFx0dGhpcy50cmVlLmNvbGxhcHNlKHJlcG9zaXRvcnkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGV4cGFuZEFsbFJlcG9zaXRvcmllcygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2YgdGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzKSB7XG5cdFx0XHRpZiAodGhpcy50cmVlLmlzQ29sbGFwc2libGUocmVwb3NpdG9yeSkpIHtcblx0XHRcdFx0dGhpcy50cmVlLmV4cGFuZChyZXBvc2l0b3J5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjb2xsYXBzZUFsbFJlc291cmNlcyhncm91cDogSVNDTVJlc291cmNlR3JvdXApOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHsgZWxlbWVudCB9IG9mIHRoaXMudHJlZS5nZXROb2RlKGdyb3VwKS5jaGlsZHJlbikge1xuXHRcdFx0aWYgKCFpc1NDTVZpZXdTZXJ2aWNlKGVsZW1lbnQpKSB7XG5cdFx0XHRcdHRoaXMudHJlZS5jb2xsYXBzZShlbGVtZW50LCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRmb2N1c1ByZXZpb3VzSW5wdXQoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlT3BlcmF0aW9uU2VxdWVuY2VyLnF1ZXVlKCgpID0+IHRoaXMuZm9jdXNJbnB1dCgtMSkpO1xuXHR9XG5cblx0Zm9jdXNOZXh0SW5wdXQoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlT3BlcmF0aW9uU2VxdWVuY2VyLnF1ZXVlKCgpID0+IHRoaXMuZm9jdXNJbnB1dCgxKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGZvY3VzSW5wdXQoZGVsdGE6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5zY21WaWV3U2VydmljZS5mb2N1c2VkUmVwb3NpdG9yeSB8fFxuXHRcdFx0dGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBpbnB1dCA9IHRoaXMuc2NtVmlld1NlcnZpY2UuZm9jdXNlZFJlcG9zaXRvcnkuaW5wdXQ7XG5cdFx0Y29uc3QgcmVwb3NpdG9yaWVzID0gdGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzO1xuXG5cdFx0Ly8gT25lIHZpc2libGUgcmVwb3NpdG9yeSBhbmQgdGhlIGlucHV0IGlzIGFscmVhZHkgZm9jdXNlZFxuXHRcdGlmIChyZXBvc2l0b3JpZXMubGVuZ3RoID09PSAxICYmIHRoaXMuaW5wdXRSZW5kZXJlci5nZXRSZW5kZXJlZElucHV0V2lkZ2V0KGlucHV0KT8uaGFzRm9jdXMoKSA9PT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE11bHRpcGxlIHZpc2libGUgcmVwb3NpdG9yaWVzIGFuZCB0aGUgaW5wdXQgYWxyZWFkeSBmb2N1c2VkXG5cdFx0aWYgKHJlcG9zaXRvcmllcy5sZW5ndGggPiAxICYmIHRoaXMuaW5wdXRSZW5kZXJlci5nZXRSZW5kZXJlZElucHV0V2lkZ2V0KGlucHV0KT8uaGFzRm9jdXMoKSA9PT0gdHJ1ZSkge1xuXHRcdFx0Y29uc3QgZm9jdXNlZFJlcG9zaXRvcnlJbmRleCA9IHJlcG9zaXRvcmllcy5pbmRleE9mKHRoaXMuc2NtVmlld1NlcnZpY2UuZm9jdXNlZFJlcG9zaXRvcnkpO1xuXHRcdFx0Y29uc3QgbmV3Rm9jdXNlZFJlcG9zaXRvcnlJbmRleCA9IHJvdChmb2N1c2VkUmVwb3NpdG9yeUluZGV4ICsgZGVsdGEsIHJlcG9zaXRvcmllcy5sZW5ndGgpO1xuXHRcdFx0aW5wdXQgPSByZXBvc2l0b3JpZXNbbmV3Rm9jdXNlZFJlcG9zaXRvcnlJbmRleF0uaW5wdXQ7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy50cmVlLmV4cGFuZFRvKGlucHV0KTtcblxuXHRcdHRoaXMudHJlZS5yZXZlYWwoaW5wdXQpO1xuXHRcdHRoaXMuaW5wdXRSZW5kZXJlci5nZXRSZW5kZXJlZElucHV0V2lkZ2V0KGlucHV0KT8uZm9jdXMoKTtcblx0fVxuXG5cdGZvY3VzUHJldmlvdXNSZXNvdXJjZUdyb3VwKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZU9wZXJhdGlvblNlcXVlbmNlci5xdWV1ZSgoKSA9PiB0aGlzLmZvY3VzUmVzb3VyY2VHcm91cCgtMSkpO1xuXHR9XG5cblx0Zm9jdXNOZXh0UmVzb3VyY2VHcm91cCgpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWVPcGVyYXRpb25TZXF1ZW5jZXIucXVldWUoKCkgPT4gdGhpcy5mb2N1c1Jlc291cmNlR3JvdXAoMSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBmb2N1c1Jlc291cmNlR3JvdXAoZGVsdGE6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5zY21WaWV3U2VydmljZS5mb2N1c2VkUmVwb3NpdG9yeSB8fFxuXHRcdFx0dGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRyZWVIYXNEb21Gb2N1cyA9IGlzQWN0aXZlRWxlbWVudCh0aGlzLnRyZWUuZ2V0SFRNTEVsZW1lbnQoKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2VHcm91cHMgPSB0aGlzLnNjbVZpZXdTZXJ2aWNlLmZvY3VzZWRSZXBvc2l0b3J5LnByb3ZpZGVyLmdyb3Vwcztcblx0XHRjb25zdCBmb2N1c2VkUmVzb3VyY2VHcm91cCA9IHRoaXMudHJlZS5nZXRGb2N1cygpLmZpbmQoZSA9PiBpc1NDTVJlc291cmNlR3JvdXAoZSkpO1xuXHRcdGNvbnN0IGZvY3VzZWRSZXNvdXJjZUdyb3VwSW5kZXggPSB0cmVlSGFzRG9tRm9jdXMgJiYgZm9jdXNlZFJlc291cmNlR3JvdXAgPyByZXNvdXJjZUdyb3Vwcy5pbmRleE9mKGZvY3VzZWRSZXNvdXJjZUdyb3VwKSA6IC0xO1xuXG5cdFx0bGV0IHJlc291cmNlR3JvdXBOZXh0OiBJU0NNUmVzb3VyY2VHcm91cCB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChmb2N1c2VkUmVzb3VyY2VHcm91cEluZGV4ID09PSAtMSkge1xuXHRcdFx0Ly8gRmlyc3QgdmlzaWJsZSByZXNvdXJjZSBncm91cFxuXHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZUdyb3VwIG9mIHJlc291cmNlR3JvdXBzKSB7XG5cdFx0XHRcdGlmICh0aGlzLnRyZWUuaGFzTm9kZShyZXNvdXJjZUdyb3VwKSkge1xuXHRcdFx0XHRcdHJlc291cmNlR3JvdXBOZXh0ID0gcmVzb3VyY2VHcm91cDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBOZXh0L1ByZXZpb3VzIHZpc2libGUgcmVzb3VyY2UgZ3JvdXBcblx0XHRcdGxldCBpbmRleCA9IHJvdChmb2N1c2VkUmVzb3VyY2VHcm91cEluZGV4ICsgZGVsdGEsIHJlc291cmNlR3JvdXBzLmxlbmd0aCk7XG5cdFx0XHR3aGlsZSAoaW5kZXggIT09IGZvY3VzZWRSZXNvdXJjZUdyb3VwSW5kZXgpIHtcblx0XHRcdFx0aWYgKHRoaXMudHJlZS5oYXNOb2RlKHJlc291cmNlR3JvdXBzW2luZGV4XSkpIHtcblx0XHRcdFx0XHRyZXNvdXJjZUdyb3VwTmV4dCA9IHJlc291cmNlR3JvdXBzW2luZGV4XTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRpbmRleCA9IHJvdChpbmRleCArIGRlbHRhLCByZXNvdXJjZUdyb3Vwcy5sZW5ndGgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChyZXNvdXJjZUdyb3VwTmV4dCkge1xuXHRcdFx0YXdhaXQgdGhpcy50cmVlLmV4cGFuZFRvKHJlc291cmNlR3JvdXBOZXh0KTtcblx0XHRcdHRoaXMudHJlZS5yZXZlYWwocmVzb3VyY2VHcm91cE5leHQpO1xuXG5cdFx0XHR0aGlzLnRyZWUuc2V0U2VsZWN0aW9uKFtyZXNvdXJjZUdyb3VwTmV4dF0pO1xuXHRcdFx0dGhpcy50cmVlLnNldEZvY3VzKFtyZXNvdXJjZUdyb3VwTmV4dF0pO1xuXHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgc2hvdWxkU2hvd1dlbGNvbWUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuc2NtU2VydmljZS5yZXBvc2l0b3J5Q291bnQgPT09IDA7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRBY3Rpb25zQ29udGV4dCgpOiB1bmtub3duIHtcblx0XHRyZXR1cm4gdGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzLmxlbmd0aCA9PT0gMSA/IHRoaXMuc2NtVmlld1NlcnZpY2UudmlzaWJsZVJlcG9zaXRvcmllc1swXS5wcm92aWRlciA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cblx0XHR0aGlzLnRyZWVPcGVyYXRpb25TZXF1ZW5jZXIucXVldWUoKCkgPT4ge1xuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5pc0V4cGFuZGVkKCkpIHtcblx0XHRcdFx0XHRpZiAodGhpcy50cmVlLmdldEZvY3VzKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2YgdGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuaW5wdXRSZW5kZXJlci5nZXRSZW5kZXJlZElucHV0V2lkZ2V0KHJlcG9zaXRvcnkuaW5wdXQpO1xuXG5cdFx0XHRcdFx0XHRcdGlmICh3aWRnZXQpIHtcblx0XHRcdFx0XHRcdFx0XHR3aWRnZXQuZm9jdXMoKTtcblx0XHRcdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VWaWV3TW9kZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VWaWV3U29ydEtleS5kaXNwb3NlKCk7XG5cdFx0dGhpcy52aXNpYmlsaXR5RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuaXRlbXMuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBTQ01UcmVlRGF0YVNvdXJjZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQXN5bmNEYXRhU291cmNlPElTQ01WaWV3U2VydmljZSwgVHJlZUVsZW1lbnQ+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2aWV3TW9kZTogKCkgPT4gVmlld01vZGUsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElTQ01WaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNjbVZpZXdTZXJ2aWNlOiBJU0NNVmlld1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIGdldENoaWxkcmVuKGlucHV0T3JFbGVtZW50OiBJU0NNVmlld1NlcnZpY2UgfCBUcmVlRWxlbWVudCk6IFByb21pc2U8SXRlcmFibGU8VHJlZUVsZW1lbnQ+PiB7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeUNvdW50ID0gdGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzLmxlbmd0aDtcblxuXHRcdGNvbnN0IHNob3dBY3Rpb25CdXR0b24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdzY20uc2hvd0FjdGlvbkJ1dHRvbicpID09PSB0cnVlO1xuXHRcdGNvbnN0IGFsd2F5c1Nob3dSZXBvc2l0b3JpZXMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdzY20uYWx3YXlzU2hvd1JlcG9zaXRvcmllcycpID09PSB0cnVlO1xuXG5cdFx0aWYgKGlzU0NNVmlld1NlcnZpY2UoaW5wdXRPckVsZW1lbnQpICYmIChyZXBvc2l0b3J5Q291bnQgPiAxIHx8IGFsd2F5c1Nob3dSZXBvc2l0b3JpZXMpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzO1xuXHRcdH0gZWxzZSBpZiAoKGlzU0NNVmlld1NlcnZpY2UoaW5wdXRPckVsZW1lbnQpICYmIHJlcG9zaXRvcnlDb3VudCA9PT0gMSAmJiAhYWx3YXlzU2hvd1JlcG9zaXRvcmllcykgfHwgaXNTQ01SZXBvc2l0b3J5KGlucHV0T3JFbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgY2hpbGRyZW46IFRyZWVFbGVtZW50W10gPSBbXTtcblxuXHRcdFx0aW5wdXRPckVsZW1lbnQgPSBpc1NDTVJlcG9zaXRvcnkoaW5wdXRPckVsZW1lbnQpID8gaW5wdXRPckVsZW1lbnQgOiB0aGlzLnNjbVZpZXdTZXJ2aWNlLnZpc2libGVSZXBvc2l0b3JpZXNbMF07XG5cdFx0XHRjb25zdCBhY3Rpb25CdXR0b24gPSBpbnB1dE9yRWxlbWVudC5wcm92aWRlci5hY3Rpb25CdXR0b24uZ2V0KCk7XG5cdFx0XHRjb25zdCByZXNvdXJjZUdyb3VwcyA9IGlucHV0T3JFbGVtZW50LnByb3ZpZGVyLmdyb3VwcztcblxuXHRcdFx0Ly8gU0NNIElucHV0XG5cdFx0XHRpZiAoaW5wdXRPckVsZW1lbnQuaW5wdXQudmlzaWJsZSkge1xuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKGlucHV0T3JFbGVtZW50LmlucHV0KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQWN0aW9uIEJ1dHRvblxuXHRcdFx0aWYgKHNob3dBY3Rpb25CdXR0b24gJiYgYWN0aW9uQnV0dG9uKSB7XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2goe1xuXHRcdFx0XHRcdHR5cGU6ICdhY3Rpb25CdXR0b24nLFxuXHRcdFx0XHRcdHJlcG9zaXRvcnk6IGlucHV0T3JFbGVtZW50LFxuXHRcdFx0XHRcdGJ1dHRvbjogYWN0aW9uQnV0dG9uXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElTQ01BY3Rpb25CdXR0b24pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXNvdXJjZUdyb3Vwc1xuXHRcdFx0Y29uc3QgaGFzU29tZUNoYW5nZXMgPSByZXNvdXJjZUdyb3Vwcy5zb21lKGdyb3VwID0+IGdyb3VwLnJlc291cmNlcy5sZW5ndGggPiAwKTtcblx0XHRcdGlmIChoYXNTb21lQ2hhbmdlcyB8fCAocmVwb3NpdG9yeUNvdW50ID09PSAxICYmICghc2hvd0FjdGlvbkJ1dHRvbiB8fCAhYWN0aW9uQnV0dG9uKSkpIHtcblx0XHRcdFx0Y2hpbGRyZW4ucHVzaCguLi5yZXNvdXJjZUdyb3Vwcyk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjaGlsZHJlbjtcblx0XHR9IGVsc2UgaWYgKGlzU0NNUmVzb3VyY2VHcm91cChpbnB1dE9yRWxlbWVudCkpIHtcblx0XHRcdGlmICh0aGlzLnZpZXdNb2RlKCkgPT09IFZpZXdNb2RlLkxpc3QpIHtcblx0XHRcdFx0Ly8gUmVzb3VyY2VzIChMaXN0KVxuXHRcdFx0XHRyZXR1cm4gaW5wdXRPckVsZW1lbnQucmVzb3VyY2VzO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLnZpZXdNb2RlKCkgPT09IFZpZXdNb2RlLlRyZWUpIHtcblx0XHRcdFx0Ly8gUmVzb3VyY2VzIChUcmVlKVxuXHRcdFx0XHRjb25zdCBjaGlsZHJlbjogVHJlZUVsZW1lbnRbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IG5vZGUgb2YgaW5wdXRPckVsZW1lbnQucmVzb3VyY2VUcmVlLnJvb3QuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRjaGlsZHJlbi5wdXNoKG5vZGUuZWxlbWVudCAmJiBub2RlLmNoaWxkcmVuQ291bnQgPT09IDAgPyBub2RlLmVsZW1lbnQgOiBub2RlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBjaGlsZHJlbjtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGlzU0NNUmVzb3VyY2VOb2RlKGlucHV0T3JFbGVtZW50KSkge1xuXHRcdFx0Ly8gUmVzb3VyY2VzIChUcmVlKSwgSGlzdG9yeSBpdGVtIGNoYW5nZXMgKFRyZWUpXG5cdFx0XHRjb25zdCBjaGlsZHJlbjogVHJlZUVsZW1lbnRbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIGlucHV0T3JFbGVtZW50LmNoaWxkcmVuKSB7XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2gobm9kZS5lbGVtZW50ICYmIG5vZGUuY2hpbGRyZW5Db3VudCA9PT0gMCA/IG5vZGUuZWxlbWVudCA6IG5vZGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gY2hpbGRyZW47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Z2V0UGFyZW50KGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogSVNDTVZpZXdTZXJ2aWNlIHwgVHJlZUVsZW1lbnQge1xuXHRcdGlmIChpc1NDTVJlc291cmNlTm9kZShlbGVtZW50KSkge1xuXHRcdFx0aWYgKGVsZW1lbnQucGFyZW50ID09PSBlbGVtZW50LmNvbnRleHQucmVzb3VyY2VUcmVlLnJvb3QpIHtcblx0XHRcdFx0cmV0dXJuIGVsZW1lbnQuY29udGV4dDtcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudC5wYXJlbnQpIHtcblx0XHRcdFx0cmV0dXJuIGVsZW1lbnQucGFyZW50O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGVsZW1lbnQgcGFzc2VkIHRvIGdldFBhcmVudCcpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNTQ01SZXNvdXJjZShlbGVtZW50KSkge1xuXHRcdFx0aWYgKHRoaXMudmlld01vZGUoKSA9PT0gVmlld01vZGUuTGlzdCkge1xuXHRcdFx0XHRyZXR1cm4gZWxlbWVudC5yZXNvdXJjZUdyb3VwO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBub2RlID0gZWxlbWVudC5yZXNvdXJjZUdyb3VwLnJlc291cmNlVHJlZS5nZXROb2RlKGVsZW1lbnQuc291cmNlVXJpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG5vZGU/LnBhcmVudDtcblxuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGVsZW1lbnQgcGFzc2VkIHRvIGdldFBhcmVudCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVzdWx0ID09PSBlbGVtZW50LnJlc291cmNlR3JvdXAucmVzb3VyY2VUcmVlLnJvb3QpIHtcblx0XHRcdFx0cmV0dXJuIGVsZW1lbnQucmVzb3VyY2VHcm91cDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGVsc2UgaWYgKGlzU0NNSW5wdXQoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LnJlcG9zaXRvcnk7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUFjdGlvbkJ1dHRvbihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQucmVwb3NpdG9yeTtcblx0XHR9IGVsc2UgaWYgKGlzU0NNUmVzb3VyY2VHcm91cChlbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuc2NtVmlld1NlcnZpY2UudmlzaWJsZVJlcG9zaXRvcmllcy5maW5kKHIgPT4gci5wcm92aWRlciA9PT0gZWxlbWVudC5wcm92aWRlcik7XG5cdFx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGVsZW1lbnQgcGFzc2VkIHRvIGdldFBhcmVudCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVwb3NpdG9yeTtcblx0XHR9IGVsc2UgaWYgKGlzU0NNUmVwb3NpdG9yeShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2NtVmlld1NlcnZpY2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBjYWxsIHRvIGdldFBhcmVudCcpO1xuXHRcdH1cblx0fVxuXG5cdGhhc0NoaWxkcmVuKGlucHV0T3JFbGVtZW50OiBJU0NNVmlld1NlcnZpY2UgfCBUcmVlRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChpc1NDTVZpZXdTZXJ2aWNlKGlucHV0T3JFbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2NtVmlld1NlcnZpY2UudmlzaWJsZVJlcG9zaXRvcmllcy5sZW5ndGggIT09IDA7XG5cdFx0fSBlbHNlIGlmIChpc1NDTVJlcG9zaXRvcnkoaW5wdXRPckVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKGlzU0NNSW5wdXQoaW5wdXRPckVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUFjdGlvbkJ1dHRvbihpbnB1dE9yRWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9IGVsc2UgaWYgKGlzU0NNUmVzb3VyY2VHcm91cChpbnB1dE9yRWxlbWVudCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01SZXNvdXJjZShpbnB1dE9yRWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9IGVsc2UgaWYgKFJlc291cmNlVHJlZS5pc1Jlc291cmNlTm9kZShpbnB1dE9yRWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBpbnB1dE9yRWxlbWVudC5jaGlsZHJlbkNvdW50ID4gMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdoYXNDaGlsZHJlbiBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTQ01BY3Rpb25CdXR0b24gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgYnV0dG9uOiBCdXR0b24gfCBCdXR0b25XaXRoRGVzY3JpcHRpb24gfCBCdXR0b25XaXRoRHJvcGRvd24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZVxuXHQpIHtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcz8uZGlzcG9zZSgpO1xuXHR9XG5cblx0c2V0QnV0dG9uKGJ1dHRvbjogSVNDTUFjdGlvbkJ1dHRvbkRlc2NyaXB0b3IgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHQvLyBDbGVhciBvbGQgYnV0dG9uXG5cdFx0dGhpcy5jbGVhcigpO1xuXHRcdGlmICghYnV0dG9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGJ1dHRvbi5zZWNvbmRhcnlDb21tYW5kcz8ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBidXR0b24uc2Vjb25kYXJ5Q29tbWFuZHMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRzID0gYnV0dG9uLnNlY29uZGFyeUNvbW1hbmRzW2luZGV4XTtcblx0XHRcdFx0Zm9yIChjb25zdCBjb21tYW5kIG9mIGNvbW1hbmRzKSB7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdGlkOiBjb21tYW5kLmlkLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGNvbW1hbmQudGl0bGUsXG5cdFx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZC5pZCwgLi4uKGNvbW1hbmQuYXJndW1lbnRzIHx8IFtdKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjb21tYW5kcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gUmVtb3ZlIGxhc3Qgc2VwYXJhdG9yXG5cdFx0XHRhY3Rpb25zLnBvcCgpO1xuXG5cdFx0XHQvLyBCdXR0b25XaXRoRHJvcGRvd25cblx0XHRcdHRoaXMuYnV0dG9uID0gbmV3IEJ1dHRvbldpdGhEcm9wZG93bih0aGlzLmNvbnRhaW5lciwge1xuXHRcdFx0XHRhY3Rpb25zOiBhY3Rpb25zLFxuXHRcdFx0XHRhZGRQcmltYXJ5QWN0aW9uVG9Ecm9wZG93bjogZmFsc2UsXG5cdFx0XHRcdGNvbnRleHRNZW51UHJvdmlkZXI6IHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdFx0XHR0aXRsZTogYnV0dG9uLmNvbW1hbmQudG9vbHRpcCxcblx0XHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQnV0dG9uXG5cdFx0XHR0aGlzLmJ1dHRvbiA9IG5ldyBCdXR0b24odGhpcy5jb250YWluZXIsIHsgc3VwcG9ydEljb25zOiB0cnVlLCBzdXBwb3J0U2hvcnRMYWJlbDogISFidXR0b24uY29tbWFuZC5zaG9ydFRpdGxlLCB0aXRsZTogYnV0dG9uLmNvbW1hbmQudG9vbHRpcCwgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcyB9KTtcblx0XHR9XG5cblx0XHR0aGlzLmJ1dHRvbi5lbmFibGVkID0gYnV0dG9uLmVuYWJsZWQ7XG5cdFx0dGhpcy5idXR0b24ubGFiZWwgPSBidXR0b24uY29tbWFuZC50aXRsZTtcblx0XHRpZiAodGhpcy5idXR0b24gaW5zdGFuY2VvZiBCdXR0b24gJiYgYnV0dG9uLmNvbW1hbmQuc2hvcnRUaXRsZSkge1xuXHRcdFx0dGhpcy5idXR0b24ubGFiZWxTaG9ydCA9IGJ1dHRvbi5jb21tYW5kLnNob3J0VGl0bGU7XG5cdFx0fVxuXHRcdHRoaXMuYnV0dG9uLm9uRGlkQ2xpY2soYXN5bmMgKCkgPT4gYXdhaXQgdGhpcy5leGVjdXRlQ29tbWFuZChidXR0b24uY29tbWFuZC5pZCwgLi4uKGJ1dHRvbi5jb21tYW5kLmFyZ3VtZW50cyB8fCBbXSkpLCBudWxsLCB0aGlzLmRpc3Bvc2FibGVzLnZhbHVlKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMudmFsdWUhLmFkZCh0aGlzLmJ1dHRvbik7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLmJ1dHRvbj8uZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLmJ1dHRvbiA9IHVuZGVmaW5lZDtcblx0XHRjbGVhck5vZGUodGhpcy5jb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBleGVjdXRlQ29tbWFuZChjb21tYW5kSWQ6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZElkLCAuLi5hcmdzKTtcblx0XHR9IGNhdGNoIChleCkge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGV4KTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsT0FBTyxlQUFlO0FBQy9CLFNBQVMsVUFBVSxlQUFlO0FBQ2xDLFNBQXNCLFlBQVksaUJBQWlCLG9CQUFvQixTQUFTLGNBQWMsbUJBQW1CLHFCQUFxQjtBQUN0SSxTQUFTLFVBQTRCLGtCQUFrQjtBQUN2RCxTQUFTLFFBQVEsR0FBRyxXQUFXLGdCQUFnQix1QkFBdUI7QUFDdEUsU0FBUyxnQkFBZ0I7QUFFekIsU0FBcUUsaUJBQXVELGFBQWEsY0FBNEQsdUJBQXVCLFVBQVUsbUNBQW1DO0FBQ3pRLFNBQVMsc0JBQXlEO0FBQ2xFLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQWlDLGdCQUFnQixxQkFBcUI7QUFDL0UsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQkFBZ0IsY0FBYyxpQkFBaUIsUUFBeUIsY0FBYyxlQUFzQjtBQUNySCxT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QUNULEtBQUssWUFBWTtBQUNoQixvQkFBTSxLQUFLLGVBQWUsUUFBUSxJQUFJLEdBQUksUUFBUSxhQUFhLENBQUMsQ0FBRTtBQUFBLFlBQ25FO0FBQUEsVUFDRCxDQUFDLENBQUM7QUFBQSxRQUNIO0FBQ0EsWUFBSSxTQUFTLFFBQVE7QUFDcEIsa0JBQVEsS0FBSyxJQUFJLFVBQVUsQ0FBQztBQUFBLFFBQzdCO0FBQUEsTUFDRDtBQUVBLGNBQVEsSUFBSTtBQUdaLFdBQUssU0FBUyxJQUFJLG1CQUFtQixLQUFLLFdBQVc7QUFBQSxRQUNwRDtBQUFBLFFBQ0EsNEJBQTRCO0FBQUEsUUFDNUIscUJBQXFCLEtBQUs7QUFBQSxRQUMxQixPQUFPLE9BQU8sUUFBUTtBQUFBLFFBQ3RCLGNBQWM7QUFBQSxRQUNkLEdBQUc7QUFBQSxNQUNKLENBQUM7QUFBQSxJQUNGLE9BQU87QUFFTixXQUFLLFNBQVMsSUFBSSxPQUFPLEtBQUssV0FBVyxFQUFFLGNBQWMsTUFBTSxtQkFBbUIsQ0FBQyxDQUFDLE9BQU8sUUFBUSxZQUFZLE9BQU8sT0FBTyxRQUFRLFNBQVMsR0FBRyxvQkFBb0IsQ0FBQztBQUFBLElBQ3ZLO0FBRUEsU0FBSyxPQUFPLFVBQVUsT0FBTztBQUM3QixTQUFLLE9BQU8sUUFBUSxPQUFPLFFBQVE7QUFDbkMsUUFBSSxLQUFLLGtCQUFrQixVQUFVLE9BQU8sUUFBUSxZQUFZO0FBQy9ELFdBQUssT0FBTyxhQUFhLE9BQU8sUUFBUTtBQUFBLElBQ3pDO0FBQ0EsU0FBSyxPQUFPLFdBQVcsWUFBWSxNQUFNLEtBQUssZUFBZSxPQUFPLFFBQVEsSUFBSSxHQUFJLE9BQU8sUUFBUSxhQUFhLENBQUMsQ0FBRSxHQUFHLE1BQU0sS0FBSyxZQUFZLEtBQUs7QUFFbEosU0FBSyxZQUFZLE1BQU8sSUFBSSxLQUFLLE1BQU07QUFBQSxFQUN4QztBQUFBLEVBRUEsUUFBYztBQUNiLFNBQUssUUFBUSxNQUFNO0FBQUEsRUFDcEI7QUFBQSxFQUVRLFFBQWM7QUFDckIsU0FBSyxZQUFZLFFBQVEsSUFBSSxnQkFBZ0I7QUFDN0MsU0FBSyxTQUFTO0FBQ2QsY0FBVSxLQUFLLFNBQVM7QUFBQSxFQUN6QjtBQUFBLEVBRUEsTUFBYyxlQUFlLGNBQXNCLE1BQWdDO0FBQ2xGLFFBQUk7QUFDSCxZQUFNLEtBQUssZUFBZSxlQUFlLFdBQVcsR0FBRyxJQUFJO0FBQUEsSUFDNUQsU0FBUyxJQUFJO0FBQ1osV0FBSyxvQkFBb0IsTUFBTSxFQUFFO0FBQUEsSUFDbEM7QUFBQSxFQUNEO0FBQ0Q7IiwKICAibmFtZXMiOiBbIm1hdGNoZXMiLCAic2VsZWN0aW9ucyIsICJvbmVOYW1lIiwgIm90aGVyTmFtZSIsICJWaWV3U29ydEtleSIsICJhY3Rpb25zIl0KfQo=
