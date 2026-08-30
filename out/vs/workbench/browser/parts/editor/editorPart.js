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
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { Part } from "../../part.js";
import { Dimension, $, EventHelper, addDisposableGenericMouseDownListener, getWindow, isAncestorOfActiveElement, getActiveElement, isHTMLElement } from "../../../../base/browser/dom.js";
import { Event, Emitter, Relay, PauseableEmitter } from "../../../../base/common/event.js";
import { contrastBorder, editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { GroupDirection, GroupsArrangement, GroupOrientation, MergeGroupMode, GroupsOrder, GroupLocation, GroupActivationReason } from "../../../services/editor/common/editorGroupsService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { orthogonal, LayoutPriority, Direction, SerializableGrid, Sizing, Orientation, isGridBranchNode, createSerializedGrid } from "../../../../base/browser/ui/grid/grid.js";
import { GroupModelChangeKind } from "../../../common/editor.js";
import { EDITOR_GROUP_BORDER, EDITOR_PANE_BACKGROUND } from "../../../common/theme.js";
import { distinct, coalesce } from "../../../../base/common/arrays.js";
import { getEditorPartOptions, impactsEditorPartOptions } from "./editor.js";
import { EditorGroupView } from "./editorGroupView.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { dispose, toDisposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { isSerializedEditorGroupModel } from "../../../common/editor/editorGroupModel.js";
import { EditorDropTarget } from "./editorDropTarget.js";
import { Color } from "../../../../base/common/color.js";
import { CenteredViewLayout } from "../../../../base/browser/ui/centered/centeredViewLayout.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Parts, IWorkbenchLayoutService, Position, FLOATING_PANEL_INNER_MARGIN, FLOATING_PANEL_MARGIN, getFloatingOuterEdgeOwners, getFloatingEditorVerticalMargins } from "../../../services/layout/browser/layoutService.js";
import { assertType } from "../../../../base/common/types.js";
import { CompositeDragAndDropObserver } from "../../dnd.js";
import { DeferredPromise, Promises } from "../../../../base/common/async.js";
import { findGroup } from "../../../services/editor/common/editorGroupFinder.js";
import { SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { EditorAreaFocusContext, EditorPartMaximizedEditorGroupContext, EditorPartMultipleEditorGroupsContext, EditorTabsVisibleContext, IsTopRightEditorGroupContext } from "../../../common/contextkeys.js";
import { mainWindow } from "../../../../base/browser/window.js";
const EDITOR_FRAME_BORDER_WIDTH = 1;
class GridWidgetView {
  constructor() {
    this.element = $(".grid-view-container");
    this._onDidChange = new Relay();
    this.onDidChange = this._onDidChange.event;
  }
  get minimumWidth() {
    return this.gridWidget ? this.gridWidget.minimumWidth : 0;
  }
  get maximumWidth() {
    return this.gridWidget ? this.gridWidget.maximumWidth : Number.POSITIVE_INFINITY;
  }
  get minimumHeight() {
    return this.gridWidget ? this.gridWidget.minimumHeight : 0;
  }
  get maximumHeight() {
    return this.gridWidget ? this.gridWidget.maximumHeight : Number.POSITIVE_INFINITY;
  }
  get gridWidget() {
    return this._gridWidget;
  }
  set gridWidget(grid) {
    this.element.textContent = "";
    if (grid) {
      this.element.appendChild(grid.element);
      this._onDidChange.input = grid.onDidChange;
    } else {
      this._onDidChange.input = Event.None;
    }
    this._gridWidget = grid;
  }
  layout(width, height, top, left) {
    this.gridWidget?.layout(width, height, top, left);
  }
  dispose() {
    this._onDidChange.dispose();
  }
}
let EditorPart = class extends Part {
  constructor(editorPartsView, id, groupsLabel, windowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService) {
    super(id, { hasTitle: false }, themeService, storageService, layoutService);
    this.editorPartsView = editorPartsView;
    this.groupsLabel = groupsLabel;
    this.windowId = windowId;
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    this.hostService = hostService;
    this.contextKeyService = contextKeyService;
    //#region Events
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidLayout = this._register(new Emitter());
    this.onDidLayout = this._onDidLayout.event;
    this._onDidChangeActiveGroup = this._register(new Emitter());
    this.onDidChangeActiveGroup = this._onDidChangeActiveGroup.event;
    this._onDidChangeGroupIndex = this._register(new Emitter());
    this.onDidChangeGroupIndex = this._onDidChangeGroupIndex.event;
    this._onDidChangeGroupLabel = this._register(new Emitter());
    this.onDidChangeGroupLabel = this._onDidChangeGroupLabel.event;
    this._onDidChangeGroupLocked = this._register(new Emitter());
    this.onDidChangeGroupLocked = this._onDidChangeGroupLocked.event;
    this._onDidChangeGroupMaximized = this._register(new Emitter());
    this.onDidChangeGroupMaximized = this._onDidChangeGroupMaximized.event;
    this._onDidActivateGroup = this._register(new Emitter());
    this.onDidActivateGroup = this._onDidActivateGroup.event;
    this._onDidAddGroup = this._register(new PauseableEmitter());
    this.onDidAddGroup = this._onDidAddGroup.event;
    this._onDidRemoveGroup = this._register(new PauseableEmitter());
    this.onDidRemoveGroup = this._onDidRemoveGroup.event;
    this._onDidMoveGroup = this._register(new Emitter());
    this.onDidMoveGroup = this._onDidMoveGroup.event;
    this.onDidSetGridWidget = this._register(new Emitter());
    this._onDidChangeSizeConstraints = this._register(new Relay());
    this.onDidChangeSizeConstraints = Event.any(this.onDidSetGridWidget.event, this._onDidChangeSizeConstraints.event);
    this._onDidScroll = this._register(new Relay());
    this.onDidScroll = Event.any(this.onDidSetGridWidget.event, this._onDidScroll.event);
    this._onDidChangeEditorPartOptions = this._register(new Emitter());
    this.onDidChangeEditorPartOptions = this._onDidChangeEditorPartOptions.event;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    //#endregion
    this.workspaceMemento = this.getMemento(StorageScope.WORKSPACE, StorageTarget.USER);
    this.profileMemento = this.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
    this.groupViews = /* @__PURE__ */ new Map();
    this.mostRecentActiveGroups = [];
    this.container = $(".content");
    this.gridWidgetDisposables = this._register(new DisposableStore());
    this.gridWidgetView = this._register(new GridWidgetView());
    this.enforcedPartOptions = [];
    this.top = 0;
    this.left = 0;
    this._contentRightInset = 0;
    this.sideGroup = {
      openEditor: async (editor, options) => {
        const findGroupResult = this.scopedInstantiationService.invokeFunction((accessor) => findGroup(accessor, { editor, options }, SIDE_GROUP));
        let group;
        if (findGroupResult instanceof Promise) {
          [group] = await findGroupResult;
        } else {
          [group] = findGroupResult;
        }
        return group.openEditor(editor, options);
      }
    };
    this._isReady = false;
    this.whenReadyPromise = new DeferredPromise();
    this.whenReady = this.whenReadyPromise.p;
    this.whenRestoredPromise = new DeferredPromise();
    this.whenRestored = this.whenRestoredPromise.p;
    this._willRestoreState = false;
    this.priority = LayoutPriority.High;
    this.scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.container));
    this.scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection(
      [IContextKeyService, this.scopedContextKeyService]
    )));
    this._partOptions = getEditorPartOptions(this.configurationService, this.themeService);
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationUpdated(e)));
    this._register(this.themeService.onDidFileIconThemeChange(() => this.handleChangedPartOptions()));
    this._register(this.onDidChangeMementoValue(StorageScope.WORKSPACE, this._store)((e) => this.onDidChangeMementoState(e)));
  }
  onConfigurationUpdated(event) {
    if (impactsEditorPartOptions(event)) {
      this.handleChangedPartOptions();
    }
  }
  handleChangedPartOptions() {
    const oldPartOptions = this._partOptions;
    const newPartOptions = getEditorPartOptions(this.configurationService, this.themeService);
    for (const enforcedPartOptions of this.enforcedPartOptions) {
      Object.assign(newPartOptions, enforcedPartOptions);
    }
    this._partOptions = newPartOptions;
    this._onDidChangeEditorPartOptions.fire({ oldPartOptions, newPartOptions });
  }
  get partOptions() {
    return this._partOptions;
  }
  enforcePartOptions(options) {
    this.enforcedPartOptions.push(options);
    this.handleChangedPartOptions();
    return toDisposable(() => {
      this.enforcedPartOptions.splice(this.enforcedPartOptions.indexOf(options), 1);
      this.handleChangedPartOptions();
    });
  }
  get contentDimension() {
    return this._contentDimension;
  }
  /**
   * Reserves an inset (px) on the right of the editor content of the group(s) at the
   * right edge of the editor part, while the title stays full width, so a docked panel
   * can sit beside the editor content under one full-width tab bar. Only the right-edge
   * groups (no neighbor to the right) are inset; interior groups in a split layout keep
   * full-width content. Recomputed when the group topology changes. `0` (default)
   * restores full-width content for all groups.
   */
  setContentRightInset(inset) {
    this._contentRightInset = Math.max(0, Math.round(inset));
    this.applyContentRightInset();
  }
  applyContentRightInset() {
    if (!this.gridWidget) {
      return;
    }
    for (const group of this.groupViews.values()) {
      if (!(group instanceof EditorGroupView)) {
        continue;
      }
      const atRightEdge = this._contentRightInset > 0 && this.gridWidget.getNeighborViews(group, Direction.Right).length === 0;
      group.setContentRightInset(atRightEdge ? this._contentRightInset : 0);
    }
  }
  get activeGroup() {
    return this._activeGroup;
  }
  get groups() {
    return Array.from(this.groupViews.values());
  }
  get count() {
    return this.groupViews.size;
  }
  get orientation() {
    return this.gridWidget && this.gridWidget.orientation === Orientation.VERTICAL ? GroupOrientation.VERTICAL : GroupOrientation.HORIZONTAL;
  }
  get isReady() {
    return this._isReady;
  }
  get hasRestorableState() {
    return !!this.workspaceMemento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY];
  }
  get willRestoreState() {
    return this._willRestoreState;
  }
  getGroups(order = GroupsOrder.CREATION_TIME) {
    switch (order) {
      case GroupsOrder.CREATION_TIME:
        return this.groups;
      case GroupsOrder.MOST_RECENTLY_ACTIVE: {
        const mostRecentActive = coalesce(this.mostRecentActiveGroups.map((groupId) => this.getGroup(groupId)));
        return distinct([...mostRecentActive, ...this.groups]);
      }
      case GroupsOrder.GRID_APPEARANCE: {
        const views = [];
        if (this.gridWidget) {
          this.fillGridNodes(views, this.gridWidget.getViews());
        }
        return views;
      }
    }
  }
  fillGridNodes(target, node) {
    if (isGridBranchNode(node)) {
      node.children.forEach((child) => this.fillGridNodes(target, child));
    } else {
      target.push(node.view);
    }
  }
  hasGroup(identifier) {
    return this.groupViews.has(identifier);
  }
  getGroup(identifier) {
    return this.groupViews.get(identifier);
  }
  findGroup(scope, source = this.activeGroup, wrap) {
    if (typeof scope.direction === "number") {
      return this.doFindGroupByDirection(scope.direction, source, wrap);
    }
    if (typeof scope.location === "number") {
      return this.doFindGroupByLocation(scope.location, source, wrap);
    }
    throw new Error("invalid arguments");
  }
  doFindGroupByDirection(direction, source, wrap) {
    const sourceGroupView = this.assertGroupView(source);
    const neighbours = this.gridWidget.getNeighborViews(sourceGroupView, this.toGridViewDirection(direction), wrap);
    neighbours.sort(((n1, n2) => this.mostRecentActiveGroups.indexOf(n1.id) - this.mostRecentActiveGroups.indexOf(n2.id)));
    return neighbours[0];
  }
  doFindGroupByLocation(location, source, wrap) {
    const sourceGroupView = this.assertGroupView(source);
    const groups = this.getGroups(GroupsOrder.GRID_APPEARANCE);
    const index = groups.indexOf(sourceGroupView);
    switch (location) {
      case GroupLocation.FIRST:
        return groups[0];
      case GroupLocation.LAST:
        return groups[groups.length - 1];
      case GroupLocation.NEXT: {
        let nextGroup = groups[index + 1];
        if (!nextGroup && wrap) {
          nextGroup = this.doFindGroupByLocation(GroupLocation.FIRST, source);
        }
        return nextGroup;
      }
      case GroupLocation.PREVIOUS: {
        let previousGroup = groups[index - 1];
        if (!previousGroup && wrap) {
          previousGroup = this.doFindGroupByLocation(GroupLocation.LAST, source);
        }
        return previousGroup;
      }
    }
  }
  activateGroup(group, preserveWindowOrder, reason) {
    const groupView = this.assertGroupView(group);
    this.doSetGroupActive(groupView, reason);
    if (!preserveWindowOrder) {
      this.hostService.moveTop(getWindow(this.element));
    }
    return groupView;
  }
  restoreGroup(group) {
    const groupView = this.assertGroupView(group);
    this.doRestoreGroup(groupView);
    return groupView;
  }
  getSize(group) {
    const groupView = this.assertGroupView(group);
    return this.gridWidget.getViewSize(groupView);
  }
  setSize(group, size) {
    const groupView = this.assertGroupView(group);
    this.gridWidget.resizeView(groupView, size);
  }
  arrangeGroups(arrangement, target = this.activeGroup) {
    if (this.count < 2) {
      return;
    }
    if (!this.gridWidget) {
      return;
    }
    const groupView = this.assertGroupView(target);
    switch (arrangement) {
      case GroupsArrangement.EVEN:
        this.gridWidget.distributeViewSizes();
        break;
      case GroupsArrangement.MAXIMIZE:
        if (this.groups.length < 2) {
          return;
        }
        this.gridWidget.maximizeView(groupView);
        groupView.focus();
        break;
      case GroupsArrangement.EXPAND:
        this.gridWidget.expandView(groupView);
        break;
    }
  }
  toggleMaximizeGroup(target = this.activeGroup) {
    if (this.hasMaximizedGroup()) {
      this.unmaximizeGroup();
    } else {
      this.arrangeGroups(GroupsArrangement.MAXIMIZE, target);
    }
  }
  toggleExpandGroup(target = this.activeGroup) {
    if (this.isGroupExpanded(this.activeGroup)) {
      this.arrangeGroups(GroupsArrangement.EVEN);
    } else {
      this.arrangeGroups(GroupsArrangement.EXPAND, target);
    }
  }
  unmaximizeGroup() {
    this.gridWidget.exitMaximizedView();
    this._activeGroup.focus();
  }
  hasMaximizedGroup() {
    return this.gridWidget.hasMaximizedView();
  }
  isGroupMaximized(targetGroup) {
    return this.gridWidget.isViewMaximized(targetGroup);
  }
  isGroupExpanded(targetGroup) {
    return this.gridWidget.isViewExpanded(targetGroup);
  }
  setGroupOrientation(orientation) {
    if (!this.gridWidget) {
      return;
    }
    const newOrientation = orientation === GroupOrientation.HORIZONTAL ? Orientation.HORIZONTAL : Orientation.VERTICAL;
    if (this.gridWidget.orientation !== newOrientation) {
      this.gridWidget.orientation = newOrientation;
    }
  }
  applyLayout(layout) {
    const restoreFocus = this.shouldRestoreFocus(this.container);
    let layoutGroupsCount = 0;
    function countGroups(groups) {
      for (const group of groups) {
        if (Array.isArray(group.groups)) {
          countGroups(group.groups);
        } else {
          layoutGroupsCount++;
        }
      }
    }
    countGroups(layout.groups);
    let currentGroupViews = this.getGroups(GroupsOrder.GRID_APPEARANCE);
    if (layoutGroupsCount < currentGroupViews.length) {
      const lastGroupInLayout = currentGroupViews[layoutGroupsCount - 1];
      currentGroupViews.forEach((group, index) => {
        if (index >= layoutGroupsCount) {
          this.mergeGroup(group, lastGroupInLayout);
        }
      });
      currentGroupViews = this.getGroups(GroupsOrder.GRID_APPEARANCE);
    }
    const activeGroup = this.activeGroup;
    const gridDescriptor = createSerializedGrid({
      orientation: this.toGridViewOrientation(
        layout.orientation,
        this.isTwoDimensionalGrid() ? this.gridWidget.orientation : (
          // preserve original orientation for 2-dimensional grids
          orthogonal(this.gridWidget.orientation)
        )
        // otherwise flip (fix https://github.com/microsoft/vscode/issues/52975)
      ),
      groups: layout.groups
    });
    this.doApplyGridState(gridDescriptor, activeGroup.id, currentGroupViews);
    if (restoreFocus) {
      this._activeGroup.focus();
    }
  }
  getLayout() {
    const serializedGrid = this.gridWidget.serialize();
    const orientation = serializedGrid.orientation === Orientation.HORIZONTAL ? GroupOrientation.HORIZONTAL : GroupOrientation.VERTICAL;
    const root = this.serializedNodeToGroupLayoutArgument(serializedGrid.root);
    return {
      orientation,
      groups: root.groups
    };
  }
  serializedNodeToGroupLayoutArgument(serializedNode) {
    if (serializedNode.type === "branch") {
      return {
        size: serializedNode.size,
        groups: serializedNode.data.map((node) => this.serializedNodeToGroupLayoutArgument(node))
      };
    }
    return { size: serializedNode.size };
  }
  shouldRestoreFocus(target) {
    if (!target) {
      return false;
    }
    const activeElement = getActiveElement();
    if (activeElement === target.ownerDocument.body) {
      return true;
    }
    return isAncestorOfActiveElement(target);
  }
  isTwoDimensionalGrid() {
    const views = this.gridWidget.getViews();
    if (isGridBranchNode(views)) {
      return views.children.some((child) => isGridBranchNode(child));
    }
    return false;
  }
  addGroup(location, direction, groupToCopy) {
    const locationView = this.assertGroupView(location);
    let newGroupView;
    if (locationView.groupsView === this) {
      const restoreFocus = this.shouldRestoreFocus(locationView.element);
      const shouldExpand = this.groupViews.size > 1 && this.isGroupExpanded(locationView);
      newGroupView = this.doCreateGroupView(groupToCopy);
      this.gridWidget.addView(
        newGroupView,
        this.getSplitSizingStyle(),
        locationView,
        this.toGridViewDirection(direction)
      );
      this.updateContainer();
      this._onDidAddGroup.fire(newGroupView);
      this.notifyGroupIndexChange();
      if (shouldExpand) {
        this.arrangeGroups(GroupsArrangement.EXPAND, newGroupView);
      }
      if (restoreFocus) {
        locationView.focus();
      }
    } else {
      newGroupView = locationView.groupsView.addGroup(locationView, direction, groupToCopy);
    }
    return newGroupView;
  }
  getSplitSizingStyle() {
    switch (this._partOptions.splitSizing) {
      case "distribute":
        return Sizing.Distribute;
      case "split":
        return Sizing.Split;
      default:
        return Sizing.Auto;
    }
  }
  /**
   * Base {@link IEditorGroupViewOptions} applied to every group this part creates.
   * Subclasses override to configure part-wide group behavior (e.g. header menus).
   */
  getGroupViewOptions() {
    return void 0;
  }
  doCreateGroupView(from, options) {
    const resolvedOptions = { ...this.getGroupViewOptions(), ...options };
    let groupView;
    if (from instanceof EditorGroupView) {
      groupView = EditorGroupView.createCopy(from, this.editorPartsView, this, this.groupsLabel, this.count, this.scopedInstantiationService, resolvedOptions);
    } else if (isSerializedEditorGroupModel(from)) {
      groupView = EditorGroupView.createFromSerialized(from, this.editorPartsView, this, this.groupsLabel, this.count, this.scopedInstantiationService, resolvedOptions);
    } else {
      groupView = EditorGroupView.createNew(this.editorPartsView, this, this.groupsLabel, this.count, this.scopedInstantiationService, resolvedOptions);
    }
    this.groupViews.set(groupView.id, groupView);
    const groupDisposables = new DisposableStore();
    groupDisposables.add(groupView.onDidFocus(() => {
      this.doSetGroupActive(groupView);
      this._onDidFocus.fire();
    }));
    groupDisposables.add(groupView.onDidModelChange((e) => {
      switch (e.kind) {
        case GroupModelChangeKind.GROUP_LOCKED:
          this._onDidChangeGroupLocked.fire(groupView);
          break;
        case GroupModelChangeKind.GROUP_INDEX:
          this._onDidChangeGroupIndex.fire(groupView);
          break;
        case GroupModelChangeKind.GROUP_LABEL:
          this._onDidChangeGroupLabel.fire(groupView);
          break;
      }
    }));
    groupDisposables.add(groupView.onDidActiveEditorChange(() => {
      this.updateContainer();
    }));
    Event.once(groupView.onWillDispose)(() => {
      dispose(groupDisposables);
      this.groupViews.delete(groupView.id);
      this.doUpdateMostRecentActive(groupView);
    });
    return groupView;
  }
  doSetGroupActive(group, reason = GroupActivationReason.DEFAULT) {
    if (this._activeGroup !== group) {
      const previousActiveGroup = this._activeGroup;
      this._activeGroup = group;
      this.doUpdateMostRecentActive(group, true);
      if (previousActiveGroup && !previousActiveGroup.disposed) {
        previousActiveGroup.setActive(false);
      }
      group.setActive(true);
      this.doRestoreGroup(group);
      this._onDidChangeActiveGroup.fire(group);
    }
    this._onDidActivateGroup.fire({ group, reason });
  }
  doRestoreGroup(group) {
    if (!this.gridWidget) {
      return;
    }
    try {
      if (this.hasMaximizedGroup() && !this.isGroupMaximized(group)) {
        this.unmaximizeGroup();
      }
      const viewSize = this.gridWidget.getViewSize(group);
      if (viewSize.width === group.minimumWidth || viewSize.height === group.minimumHeight) {
        this.arrangeGroups(GroupsArrangement.EXPAND, group);
      }
    } catch (error) {
    }
  }
  doUpdateMostRecentActive(group, makeMostRecentlyActive) {
    const index = this.mostRecentActiveGroups.indexOf(group.id);
    if (index !== -1) {
      this.mostRecentActiveGroups.splice(index, 1);
    }
    if (makeMostRecentlyActive) {
      this.mostRecentActiveGroups.unshift(group.id);
    }
  }
  toGridViewDirection(direction) {
    switch (direction) {
      case GroupDirection.UP:
        return Direction.Up;
      case GroupDirection.DOWN:
        return Direction.Down;
      case GroupDirection.LEFT:
        return Direction.Left;
      case GroupDirection.RIGHT:
        return Direction.Right;
    }
  }
  toGridViewOrientation(orientation, fallback) {
    if (typeof orientation === "number") {
      return orientation === GroupOrientation.HORIZONTAL ? Orientation.HORIZONTAL : Orientation.VERTICAL;
    }
    return fallback;
  }
  removeGroup(group, preserveFocus) {
    const groupView = this.assertGroupView(group);
    if (this.count === 1) {
      return;
    }
    if (groupView.isEmpty) {
      this.doRemoveEmptyGroup(groupView, preserveFocus);
    } else {
      this.doRemoveGroupWithEditors(groupView);
    }
  }
  doRemoveGroupWithEditors(groupView) {
    const mostRecentlyActiveGroups = this.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    let lastActiveGroup;
    if (this._activeGroup === groupView) {
      lastActiveGroup = mostRecentlyActiveGroups[1];
    } else {
      lastActiveGroup = mostRecentlyActiveGroups[0];
    }
    this.mergeGroup(groupView, lastActiveGroup);
  }
  doRemoveEmptyGroup(groupView, preserveFocus) {
    const restoreFocus = !preserveFocus && this.shouldRestoreFocus(this.container);
    if (this._activeGroup === groupView) {
      const mostRecentlyActiveGroups = this.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
      const nextActiveGroup = mostRecentlyActiveGroups[1];
      this.doSetGroupActive(nextActiveGroup);
    }
    this.gridWidget.removeView(groupView, this.getSplitSizingStyle());
    groupView.dispose();
    if (restoreFocus) {
      this._activeGroup.focus();
    }
    this.notifyGroupIndexChange();
    this.updateContainer();
    this._onDidRemoveGroup.fire(groupView);
  }
  moveGroup(group, location, direction) {
    const sourceView = this.assertGroupView(group);
    const targetView = this.assertGroupView(location);
    if (sourceView.id === targetView.id) {
      throw new Error("Cannot move group into its own");
    }
    const restoreFocus = this.shouldRestoreFocus(sourceView.element);
    let movedView;
    if (sourceView.groupsView === targetView.groupsView) {
      this.gridWidget.moveView(sourceView, this.getSplitSizingStyle(), targetView, this.toGridViewDirection(direction));
      movedView = sourceView;
    } else {
      movedView = targetView.groupsView.addGroup(targetView, direction, sourceView);
      sourceView.closeAllEditors({ force: true });
      this.removeGroup(sourceView, restoreFocus);
    }
    if (restoreFocus) {
      movedView.focus();
    }
    this._onDidMoveGroup.fire(movedView);
    this.notifyGroupIndexChange();
    return movedView;
  }
  copyGroup(group, location, direction) {
    const groupView = this.assertGroupView(group);
    const locationView = this.assertGroupView(location);
    const restoreFocus = this.shouldRestoreFocus(groupView.element);
    const copiedGroupView = this.addGroup(locationView, direction, groupView);
    if (restoreFocus) {
      copiedGroupView.focus();
    }
    return copiedGroupView;
  }
  mergeGroup(group, target, options) {
    const sourceView = this.assertGroupView(group);
    const targetView = this.assertGroupView(target);
    const editors = [];
    let index = options && typeof options.index === "number" ? options.index : targetView.count;
    for (const editor of sourceView.editors) {
      const inactive = !sourceView.isActive(editor) || this._activeGroup !== sourceView;
      let actualIndex;
      if (targetView.contains(editor) && // Do not configure an `index` for editors that are sticky in
      // the target, otherwise there is a chance of losing that state
      // when the editor is moved.
      // See https://github.com/microsoft/vscode/issues/239549
      (targetView.isSticky(editor) || // Do not configure an `index` when we are explicitly instructed
      options?.preserveExistingIndex)) {
      } else {
        actualIndex = index;
        index++;
      }
      editors.push({
        editor,
        options: {
          index: actualIndex,
          inactive,
          preserveFocus: inactive
        }
      });
    }
    let result = true;
    if (options?.mode === MergeGroupMode.COPY_EDITORS) {
      sourceView.copyEditors(editors, targetView);
    } else {
      result = sourceView.moveEditors(editors, targetView);
    }
    if (sourceView.isEmpty && !sourceView.disposed) {
      this.removeGroup(sourceView, true);
    }
    return result;
  }
  mergeAllGroups(target, options) {
    const targetView = this.assertGroupView(target);
    let result = true;
    for (const group of this.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
      if (group === targetView) {
        continue;
      }
      const merged = this.mergeGroup(group, targetView, options);
      if (!merged) {
        result = false;
      }
    }
    return result;
  }
  assertGroupView(group) {
    let groupView;
    if (typeof group === "number") {
      groupView = this.editorPartsView.getGroup(group);
    } else {
      groupView = group;
    }
    if (!groupView) {
      throw new Error("Invalid editor group provided!");
    }
    return groupView;
  }
  createEditorDropTarget(container, delegate) {
    assertType(isHTMLElement(container));
    return this.scopedInstantiationService.createInstance(EditorDropTarget, this, container, delegate);
  }
  //#region Part
  // TODO @sbatten @joao find something better to prevent editor taking over #79897
  get minimumWidth() {
    return Math.min(this.centeredLayoutWidget.minimumWidth, this.layoutService.getMaximumEditorDimensions(this.layoutService.getContainer(getWindow(this.container))).width);
  }
  get maximumWidth() {
    return this.centeredLayoutWidget.maximumWidth;
  }
  get minimumHeight() {
    return Math.min(this.centeredLayoutWidget.minimumHeight, this.layoutService.getMaximumEditorDimensions(this.layoutService.getContainer(getWindow(this.container))).height);
  }
  get maximumHeight() {
    return this.centeredLayoutWidget.maximumHeight;
  }
  get snap() {
    return this.layoutService.getPanelAlignment() === "center";
  }
  get onDidChange() {
    return Event.any(this.centeredLayoutWidget.onDidChange, this.onDidSetGridWidget.event);
  }
  get gridSeparatorBorder() {
    return this.theme.getColor(EDITOR_GROUP_BORDER) || this.theme.getColor(contrastBorder) || Color.transparent;
  }
  updateStyles() {
    this.container.style.backgroundColor = this.getColor(editorBackground) || "";
    const separatorBorderStyle = { separatorBorder: this.gridSeparatorBorder, background: this.theme.getColor(EDITOR_PANE_BACKGROUND) || Color.transparent };
    this.gridWidget.style(separatorBorderStyle);
    this.centeredLayoutWidget.styles(separatorBorderStyle);
  }
  createContentArea(parent, options) {
    this.element = parent;
    if (this.windowId !== mainWindow.vscodeWindowId) {
      this.container.classList.add("auxiliary");
    }
    parent.appendChild(this.container);
    this._willRestoreState = !options || options.restorePreviousState;
    this.doCreateGridControl();
    this.centeredLayoutWidget = this._register(new CenteredViewLayout(this.container, this.gridWidgetView, this.profileMemento[EditorPart.EDITOR_PART_CENTERED_VIEW_STORAGE_KEY], this._partOptions.centeredLayoutFixedWidth));
    this._register(this.onDidChangeEditorPartOptions((e) => this.centeredLayoutWidget.setFixedWidth(e.newPartOptions.centeredLayoutFixedWidth ?? false)));
    this.setupDragAndDropSupport(parent, this.container);
    this.handleContextKeys();
    this.whenReadyPromise.complete();
    this._isReady = true;
    Promises.settled(this.groups.map((group) => group.whenRestored)).finally(() => {
      this.whenRestoredPromise.complete();
    });
    return this.container;
  }
  handleContextKeys() {
    EditorAreaFocusContext.bindTo(this.scopedContextKeyService).set(true);
    const multipleEditorGroupsContext = EditorPartMultipleEditorGroupsContext.bindTo(this.scopedContextKeyService);
    const maximizedEditorGroupContext = EditorPartMaximizedEditorGroupContext.bindTo(this.scopedContextKeyService);
    const editorTabsVisibleContext = EditorTabsVisibleContext.bindTo(this.scopedContextKeyService);
    const updateContextKeys = () => {
      const groupCount = this.count;
      if (groupCount > 1) {
        multipleEditorGroupsContext.set(true);
      } else {
        multipleEditorGroupsContext.reset();
      }
      if (this.hasMaximizedGroup()) {
        maximizedEditorGroupContext.set(true);
      } else {
        maximizedEditorGroupContext.reset();
      }
    };
    const updateEditorTabsVisibleContext = () => {
      editorTabsVisibleContext.set(this.partOptions.showTabs === "multiple");
    };
    const updateTopRightGroupContextKey = () => {
      if (!this.gridWidget || !this._contentDimension) {
        return;
      }
      let topRightGroup;
      for (const group of this.groups) {
        if (this.gridWidget.getNeighborViews(group, Direction.Up).length === 0 && this.gridWidget.getNeighborViews(group, Direction.Right).length === 0) {
          topRightGroup = group;
          break;
        }
      }
      for (const group of this.groups) {
        const contextKey = this.editorPartsView.bind(IsTopRightEditorGroupContext, group);
        contextKey.set(group === topRightGroup);
      }
    };
    updateContextKeys();
    updateEditorTabsVisibleContext();
    updateTopRightGroupContextKey();
    this._register(this.onDidAddGroup(() => {
      updateContextKeys();
      updateTopRightGroupContextKey();
      this.applyContentRightInset();
    }));
    this._register(this.onDidRemoveGroup(() => {
      updateContextKeys();
      updateTopRightGroupContextKey();
      this.applyContentRightInset();
    }));
    this._register(this.onDidChangeGroupMaximized(() => {
      updateContextKeys();
      this.applyContentRightInset();
    }));
    this._register(this.onDidChangeEditorPartOptions(() => updateEditorTabsVisibleContext()));
    this._register(this.onDidMoveGroup(() => {
      updateTopRightGroupContextKey();
      this.applyContentRightInset();
    }));
    this._register(this.onDidLayout(() => updateTopRightGroupContextKey()));
  }
  setupDragAndDropSupport(parent, container) {
    this._register(this.createEditorDropTarget(container, /* @__PURE__ */ Object.create(null)));
    const overlay = $(".drop-block-overlay");
    parent.appendChild(overlay);
    this._register(addDisposableGenericMouseDownListener(overlay, () => overlay.classList.remove("visible")));
    this._register(CompositeDragAndDropObserver.INSTANCE.registerTarget(this.element, {
      onDragStart: (e) => overlay.classList.add("visible"),
      onDragEnd: (e) => overlay.classList.remove("visible")
    }));
    let horizontalOpenerTimeout;
    let verticalOpenerTimeout;
    let lastOpenHorizontalPosition;
    let lastOpenVerticalPosition;
    const openPartAtPosition = (position) => {
      if (!this.layoutService.isVisible(Parts.PANEL_PART) && position === this.layoutService.getPanelPosition()) {
        this.layoutService.setPartHidden(false, Parts.PANEL_PART);
      } else if (!this.layoutService.isVisible(Parts.AUXILIARYBAR_PART) && position === (this.layoutService.getSideBarPosition() === Position.RIGHT ? Position.LEFT : Position.RIGHT)) {
        this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
      }
    };
    const clearAllTimeouts = () => {
      if (horizontalOpenerTimeout) {
        clearTimeout(horizontalOpenerTimeout);
        horizontalOpenerTimeout = void 0;
      }
      if (verticalOpenerTimeout) {
        clearTimeout(verticalOpenerTimeout);
        verticalOpenerTimeout = void 0;
      }
    };
    this._register(CompositeDragAndDropObserver.INSTANCE.registerTarget(overlay, {
      onDragOver: (e) => {
        EventHelper.stop(e.eventData, true);
        if (e.eventData.dataTransfer) {
          e.eventData.dataTransfer.dropEffect = "none";
        }
        const boundingRect = overlay.getBoundingClientRect();
        let openHorizontalPosition = void 0;
        let openVerticalPosition = void 0;
        const proximity = 100;
        if (e.eventData.clientX < boundingRect.left + proximity) {
          openHorizontalPosition = Position.LEFT;
        }
        if (e.eventData.clientX > boundingRect.right - proximity) {
          openHorizontalPosition = Position.RIGHT;
        }
        if (e.eventData.clientY > boundingRect.bottom - proximity) {
          openVerticalPosition = Position.BOTTOM;
        }
        if (e.eventData.clientY < boundingRect.top + proximity) {
          openVerticalPosition = Position.TOP;
        }
        if (horizontalOpenerTimeout && openHorizontalPosition !== lastOpenHorizontalPosition) {
          clearTimeout(horizontalOpenerTimeout);
          horizontalOpenerTimeout = void 0;
        }
        if (verticalOpenerTimeout && openVerticalPosition !== lastOpenVerticalPosition) {
          clearTimeout(verticalOpenerTimeout);
          verticalOpenerTimeout = void 0;
        }
        if (!horizontalOpenerTimeout && openHorizontalPosition !== void 0) {
          lastOpenHorizontalPosition = openHorizontalPosition;
          horizontalOpenerTimeout = setTimeout(() => openPartAtPosition(openHorizontalPosition), 200);
        }
        if (!verticalOpenerTimeout && openVerticalPosition !== void 0) {
          lastOpenVerticalPosition = openVerticalPosition;
          verticalOpenerTimeout = setTimeout(() => openPartAtPosition(openVerticalPosition), 200);
        }
      },
      onDragLeave: () => clearAllTimeouts(),
      onDragEnd: () => clearAllTimeouts(),
      onDrop: () => clearAllTimeouts()
    }));
    this._register(toDisposable(() => clearAllTimeouts()));
  }
  centerLayout(active) {
    this.centeredLayoutWidget.activate(active);
  }
  isLayoutCentered() {
    if (this.centeredLayoutWidget) {
      return this.centeredLayoutWidget.isActive();
    }
    return false;
  }
  doCreateGridControl() {
    let restoreError = false;
    if (this._willRestoreState) {
      restoreError = !this.doCreateGridControlWithPreviousState();
    }
    if (!this.gridWidget || restoreError) {
      const initialGroup = this.doCreateGroupView();
      this.doSetGridWidget(new SerializableGrid(initialGroup));
      this.doSetGroupActive(initialGroup);
    }
    this.updateContainer();
    this.notifyGroupIndexChange();
  }
  doCreateGridControlWithPreviousState() {
    const state = this.loadState();
    if (state?.serializedGrid) {
      try {
        this.mostRecentActiveGroups = state.mostRecentActiveGroups;
        this.doCreateGridControlWithState(state.serializedGrid, state.activeGroup);
      } catch (error) {
        onUnexpectedError(new Error(`Error restoring editor grid widget: ${error} (with state: ${JSON.stringify(state)})`));
        this.disposeGroups();
        return false;
      }
    }
    return true;
  }
  doCreateGridControlWithState(serializedGrid, activeGroupId, editorGroupViewsToReuse, options) {
    let reuseGroupViews;
    if (editorGroupViewsToReuse) {
      reuseGroupViews = editorGroupViewsToReuse.slice(0);
    } else {
      reuseGroupViews = [];
    }
    const groupViews = [];
    const gridWidget = SerializableGrid.deserialize(serializedGrid, {
      fromJSON: (serializedEditorGroup) => {
        let groupView;
        if (reuseGroupViews.length > 0) {
          groupView = reuseGroupViews.shift();
        } else {
          groupView = this.doCreateGroupView(serializedEditorGroup, options);
        }
        groupViews.push(groupView);
        if (groupView.id === activeGroupId) {
          this.doSetGroupActive(groupView);
        }
        return groupView;
      }
    }, { styles: { separatorBorder: this.gridSeparatorBorder } });
    if (!this._activeGroup) {
      this.doSetGroupActive(groupViews[0]);
    }
    if (this.mostRecentActiveGroups.some((groupId) => !this.getGroup(groupId))) {
      this.mostRecentActiveGroups = groupViews.map((group) => group.id);
    }
    this.doSetGridWidget(gridWidget);
  }
  doSetGridWidget(gridWidget) {
    let boundarySashes = {};
    if (this.gridWidget) {
      boundarySashes = this.gridWidget.boundarySashes;
      this.gridWidget.dispose();
    }
    this.gridWidget = gridWidget;
    this.gridWidget.boundarySashes = boundarySashes;
    this.gridWidgetView.gridWidget = gridWidget;
    this._onDidChangeSizeConstraints.input = gridWidget.onDidChange;
    this._onDidScroll.input = gridWidget.onDidScroll;
    this.gridWidgetDisposables.clear();
    this.gridWidgetDisposables.add(gridWidget.onDidChangeViewMaximized((maximized) => this._onDidChangeGroupMaximized.fire(maximized)));
    this.onDidSetGridWidget.fire(void 0);
  }
  updateContainer() {
    this.container.classList.toggle("empty", this.isEmpty);
  }
  notifyGroupIndexChange() {
    this.getGroups(GroupsOrder.GRID_APPEARANCE).forEach((group, index) => group.notifyIndexChanged(index));
  }
  notifyGroupsLabelChange(newLabel) {
    for (const group of this.groups) {
      group.notifyLabelChanged(newLabel);
    }
  }
  get isEmpty() {
    return this.count === 1 && this._activeGroup.isEmpty;
  }
  setBoundarySashes(sashes) {
    this.gridWidget.boundarySashes = sashes;
    this.centeredLayoutWidget.boundarySashes = sashes;
  }
  layout(width, height, top, left) {
    this.top = top;
    this.left = left;
    if (this.windowId === mainWindow.vscodeWindowId && this.layoutService.isFloatingPanelsEnabled()) {
      const owners = getFloatingOuterEdgeOwners(this.layoutService);
      const outerLeft = owners.left === Parts.EDITOR_PART;
      const outerRight = owners.right === Parts.EDITOR_PART;
      const leftMargin = outerLeft ? FLOATING_PANEL_MARGIN * 2 : FLOATING_PANEL_MARGIN;
      const rightMargin = outerRight ? FLOATING_PANEL_MARGIN * 2 : FLOATING_PANEL_INNER_MARGIN;
      width = Math.max(0, width - leftMargin - rightMargin);
      const { top: top2, bottom } = getFloatingEditorVerticalMargins(this.layoutService, mainWindow);
      height = Math.max(0, height - top2 - bottom);
      if (!this.element.classList.contains("modal-editor-part")) {
        width = Math.max(0, width - EDITOR_FRAME_BORDER_WIDTH * 2);
        height = Math.max(0, height - EDITOR_FRAME_BORDER_WIDTH * 2);
      }
      this.element.classList.toggle("floating-editor-outer-left", outerLeft);
      this.element.classList.toggle("floating-editor-outer-right", outerRight);
    } else {
      this.element.classList.remove("floating-editor-outer-left", "floating-editor-outer-right");
    }
    const contentAreaSize = super.layoutContents(width, height).contentSize;
    this.doLayout(Dimension.lift(contentAreaSize), top, left);
  }
  doLayout(dimension, top = this.top, left = this.left) {
    this._contentDimension = dimension;
    this.centeredLayoutWidget.layout(this._contentDimension.width, this._contentDimension.height, top, left);
    this._onDidLayout.fire(dimension);
  }
  saveState() {
    if (this.gridWidget) {
      if (this.isEmpty) {
        delete this.workspaceMemento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY];
      } else {
        this.workspaceMemento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY] = this.createState();
      }
    }
    if (this.centeredLayoutWidget) {
      const centeredLayoutState = this.centeredLayoutWidget.state;
      if (this.centeredLayoutWidget.isDefault(centeredLayoutState)) {
        delete this.profileMemento[EditorPart.EDITOR_PART_CENTERED_VIEW_STORAGE_KEY];
      } else {
        this.profileMemento[EditorPart.EDITOR_PART_CENTERED_VIEW_STORAGE_KEY] = centeredLayoutState;
      }
    }
    super.saveState();
  }
  loadState() {
    return this.workspaceMemento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY];
  }
  createState() {
    return {
      serializedGrid: this.gridWidget.serialize(),
      activeGroup: this._activeGroup.id,
      mostRecentActiveGroups: this.mostRecentActiveGroups
    };
  }
  applyState(state, options) {
    if (state === "empty") {
      return this.doApplyEmptyState();
    } else {
      return this.doApplyState(state, options);
    }
  }
  async doApplyState(state, options) {
    const groups = await this.doPrepareApplyState();
    this._onDidAddGroup.pause();
    this._onDidRemoveGroup.pause();
    this.disposeGroups();
    this.mostRecentActiveGroups = state.mostRecentActiveGroups;
    try {
      this.doApplyGridState(state.serializedGrid, state.activeGroup, void 0, options);
    } finally {
      this._onDidRemoveGroup.resume();
      this._onDidAddGroup.resume();
    }
    await this.activeGroup.openEditors(
      groups.flatMap((group) => group.editors).filter((editor) => this.editorPartsView.groups.every((groupView) => !groupView.contains(editor))).map((editor) => ({
        editor,
        options: { pinned: true, preserveFocus: true, inactive: true }
      }))
    );
  }
  async doApplyEmptyState() {
    await this.doPrepareApplyState();
    this.mergeAllGroups(this.activeGroup);
  }
  async doPrepareApplyState() {
    const groups = this.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    for (const group of groups) {
      await group.closeAllEditors({ excludeConfirming: true, force: true });
    }
    return groups;
  }
  doApplyGridState(gridState, activeGroupId, editorGroupViewsToReuse, options) {
    this.doCreateGridControlWithState(gridState, activeGroupId, editorGroupViewsToReuse, options);
    if (this._contentDimension) {
      this.doLayout(this._contentDimension);
    }
    this.updateContainer();
    for (const groupView of this.getGroups(GroupsOrder.GRID_APPEARANCE)) {
      if (!editorGroupViewsToReuse?.includes(groupView)) {
        this._onDidAddGroup.fire(groupView);
      }
    }
    this.notifyGroupIndexChange();
  }
  onDidChangeMementoState(e) {
    if (e.external && e.scope === StorageScope.WORKSPACE) {
      this.reloadMemento(e.scope);
      const state = this.loadState();
      if (state) {
        this.applyState(state);
      }
    }
  }
  toJSON() {
    return {
      type: Parts.EDITOR_PART
    };
  }
  disposeGroups() {
    for (const group of this.groups) {
      group.dispose();
      this._onDidRemoveGroup.fire(group);
    }
    this.groupViews.clear();
    this.mostRecentActiveGroups = [];
  }
  dispose() {
    this._onWillDispose.fire();
    this.disposeGroups();
    this.gridWidget?.dispose();
    super.dispose();
  }
  //#endregion
};
EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY = "editorpart.state";
EditorPart.EDITOR_PART_CENTERED_VIEW_STORAGE_KEY = "editorpart.centeredview";
EditorPart = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IWorkbenchLayoutService),
  __decorateParam(9, IHostService),
  __decorateParam(10, IContextKeyService)
], EditorPart);
let MainEditorPart = class extends EditorPart {
  constructor(editorPartsView, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService) {
    super(editorPartsView, Parts.EDITOR_PART, "", mainWindow.vscodeWindowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService);
  }
};
MainEditorPart = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IWorkbenchLayoutService),
  __decorateParam(6, IHostService),
  __decorateParam(7, IContextKeyService)
], MainEditorPart);
export {
  EditorPart,
  MainEditorPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGVkaXRvclBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQYXJ0IH0gZnJvbSAnLi4vLi4vcGFydC5qcyc7XG5pbXBvcnQgeyBEaW1lbnNpb24sICQsIEV2ZW50SGVscGVyLCBhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyLCBnZXRXaW5kb3csIGlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQsIGdldEFjdGl2ZUVsZW1lbnQsIGlzSFRNTEVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyLCBSZWxheSwgUGF1c2VhYmxlRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNvbnRyYXN0Qm9yZGVyLCBlZGl0b3JCYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgR3JvdXBEaXJlY3Rpb24sIEdyb3Vwc0FycmFuZ2VtZW50LCBHcm91cE9yaWVudGF0aW9uLCBJTWVyZ2VHcm91cE9wdGlvbnMsIE1lcmdlR3JvdXBNb2RlLCBHcm91cHNPcmRlciwgR3JvdXBMb2NhdGlvbiwgSUZpbmRHcm91cFNjb3BlLCBFZGl0b3JHcm91cExheW91dCwgR3JvdXBMYXlvdXRBcmd1bWVudCwgSUVkaXRvclNpZGVHcm91cCwgSUVkaXRvckRyb3BUYXJnZXREZWxlZ2F0ZSwgSUVkaXRvclBhcnQsIEdyb3VwQWN0aXZhdGlvblJlYXNvbiwgSUVkaXRvckdyb3VwQWN0aXZhdGlvbkV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVZpZXcsIG9ydGhvZ29uYWwsIExheW91dFByaW9yaXR5LCBJVmlld1NpemUsIERpcmVjdGlvbiwgU2VyaWFsaXphYmxlR3JpZCwgU2l6aW5nLCBJU2VyaWFsaXplZEdyaWQsIElTZXJpYWxpemVkTm9kZSwgT3JpZW50YXRpb24sIEdyaWRCcmFuY2hOb2RlLCBpc0dyaWRCcmFuY2hOb2RlLCBHcmlkTm9kZSwgY3JlYXRlU2VyaWFsaXplZEdyaWQsIEdyaWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZ3JpZC9ncmlkLmpzJztcbmltcG9ydCB7IEdyb3VwSWRlbnRpZmllciwgRWRpdG9ySW5wdXRXaXRoT3B0aW9ucywgSUVkaXRvclBhcnRPcHRpb25zLCBJRWRpdG9yUGFydE9wdGlvbnNDaGFuZ2VFdmVudCwgR3JvdXBNb2RlbENoYW5nZUtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVESVRPUl9HUk9VUF9CT1JERVIsIEVESVRPUl9QQU5FX0JBQ0tHUk9VTkQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgZGlzdGluY3QsIGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cFZpZXcsIGdldEVkaXRvclBhcnRPcHRpb25zLCBpbXBhY3RzRWRpdG9yUGFydE9wdGlvbnMsIElFZGl0b3JQYXJ0Q3JlYXRpb25PcHRpb25zLCBJRWRpdG9yUGFydHNWaWV3LCBJRWRpdG9yR3JvdXBzVmlldywgSUVkaXRvckdyb3VwVmlld09wdGlvbnMgfSBmcm9tICcuL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JHcm91cFZpZXcgfSBmcm9tICcuL2VkaXRvckdyb3VwVmlldy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UsIElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBkaXNwb3NlLCB0b0Rpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIElTdG9yYWdlVmFsdWVDaGFuZ2VFdmVudCwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJU2VyaWFsaXplZEVkaXRvckdyb3VwTW9kZWwsIGlzU2VyaWFsaXplZEVkaXRvckdyb3VwTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvckdyb3VwTW9kZWwuanMnO1xuaW1wb3J0IHsgRWRpdG9yRHJvcFRhcmdldCB9IGZyb20gJy4vZWRpdG9yRHJvcFRhcmdldC5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IENlbnRlcmVkVmlld0xheW91dCwgQ2VudGVyZWRWaWV3U3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY2VudGVyZWQvY2VudGVyZWRWaWV3TGF5b3V0LmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFBhcnRzLCBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUG9zaXRpb24sIEZMT0FUSU5HX1BBTkVMX0lOTkVSX01BUkdJTiwgRkxPQVRJTkdfUEFORUxfTUFSR0lOLCBnZXRGbG9hdGluZ091dGVyRWRnZU93bmVycywgZ2V0RmxvYXRpbmdFZGl0b3JWZXJ0aWNhbE1hcmdpbnMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERlZXBQYXJ0aWFsLCBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgQ29tcG9zaXRlRHJhZ0FuZERyb3BPYnNlcnZlciB9IGZyb20gJy4uLy4uL2RuZC5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZmluZEdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cEZpbmRlci5qcyc7XG5pbXBvcnQgeyBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElCb3VuZGFyeVNhc2hlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckFyZWFGb2N1c0NvbnRleHQsIEVkaXRvclBhcnRNYXhpbWl6ZWRFZGl0b3JHcm91cENvbnRleHQsIEVkaXRvclBhcnRNdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHQsIEVkaXRvclRhYnNWaXNpYmxlQ29udGV4dCwgSXNUb3BSaWdodEVkaXRvckdyb3VwQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5cbi8qKlxuICogVGhlIHdpZHRoIChpbiBwaXhlbHMpIG9mIHRoZSBlZGl0b3IgY2FyZCBib3JkZXIgZHJhd24gb24gZXZlcnkgc2lkZSB3aGVuIHRoZVxuICogTW9kZXJuIFVJIFVwZGF0ZSBleHBlcmltZW50IGlzIGVuYWJsZWQgKGBzdHlsZU92ZXJyaWRlcy9tZWRpYS9lZGl0b3JCb3JkZXIuY3NzYCkuXG4gKiBUaGUgZWRpdG9yIHJlc2VydmVzIHRoaXMgdGhpY2tuZXNzIHdoZW4gbGF5aW5nIG91dCBpdHMgY29udGVudHMgc28gdGhleSBzaXRcbiAqIGluc2lkZSB0aGUgZnJhbWUgaW5zdGVhZCBvZiBvdmVyZmxvd2luZyAoYW5kIGJlaW5nIGNsaXBwZWQgYnkpIHRoZSBib3JkZXIuXG4gKiBLZWVwIGluIHN5bmMgd2l0aCB0aGUgYC0tdnNjb2RlLXN0cm9rZVRoaWNrbmVzc2AgKDFweCkgdG9rZW4gdXNlZCB0aGVyZS5cbiAqL1xuY29uc3QgRURJVE9SX0ZSQU1FX0JPUkRFUl9XSURUSCA9IDE7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUVkaXRvclBhcnRVSVN0YXRlIHtcblx0cmVhZG9ubHkgc2VyaWFsaXplZEdyaWQ6IElTZXJpYWxpemVkR3JpZDtcblx0cmVhZG9ubHkgYWN0aXZlR3JvdXA6IEdyb3VwSWRlbnRpZmllcjtcblx0cmVhZG9ubHkgbW9zdFJlY2VudEFjdGl2ZUdyb3VwczogR3JvdXBJZGVudGlmaWVyW107XG59XG5cbmludGVyZmFjZSBJRWRpdG9yUGFydE1lbWVudG8ge1xuXHQnZWRpdG9ycGFydC5zdGF0ZSc/OiBJRWRpdG9yUGFydFVJU3RhdGU7XG5cdCdlZGl0b3JwYXJ0LmNlbnRlcmVkdmlldyc/OiBDZW50ZXJlZFZpZXdTdGF0ZTtcbn1cblxuY2xhc3MgR3JpZFdpZGdldFZpZXc8VCBleHRlbmRzIElWaWV3PiBpbXBsZW1lbnRzIElWaWV3IHtcblxuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudCA9ICQoJy5ncmlkLXZpZXctY29udGFpbmVyJyk7XG5cblx0Z2V0IG1pbmltdW1XaWR0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5ncmlkV2lkZ2V0ID8gdGhpcy5ncmlkV2lkZ2V0Lm1pbmltdW1XaWR0aCA6IDA7IH1cblx0Z2V0IG1heGltdW1XaWR0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5ncmlkV2lkZ2V0ID8gdGhpcy5ncmlkV2lkZ2V0Lm1heGltdW1XaWR0aCA6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTsgfVxuXHRnZXQgbWluaW11bUhlaWdodCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5ncmlkV2lkZ2V0ID8gdGhpcy5ncmlkV2lkZ2V0Lm1pbmltdW1IZWlnaHQgOiAwOyB9XG5cdGdldCBtYXhpbXVtSGVpZ2h0KCk6IG51bWJlciB7IHJldHVybiB0aGlzLmdyaWRXaWRnZXQgPyB0aGlzLmdyaWRXaWRnZXQubWF4aW11bUhlaWdodCA6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTsgfVxuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlID0gbmV3IFJlbGF5PHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IHVuZGVmaW5lZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIF9ncmlkV2lkZ2V0OiBHcmlkPFQ+IHwgdW5kZWZpbmVkO1xuXG5cdGdldCBncmlkV2lkZ2V0KCk6IEdyaWQ8VD4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9ncmlkV2lkZ2V0O1xuXHR9XG5cblx0c2V0IGdyaWRXaWRnZXQoZ3JpZDogR3JpZDxUPiB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuZWxlbWVudC50ZXh0Q29udGVudCA9ICcnO1xuXG5cdFx0aWYgKGdyaWQpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZChncmlkLmVsZW1lbnQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuaW5wdXQgPSBncmlkLm9uRGlkQ2hhbmdlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5pbnB1dCA9IEV2ZW50Lk5vbmU7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZ3JpZFdpZGdldCA9IGdyaWQ7XG5cdH1cblxuXHRsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHRvcDogbnVtYmVyLCBsZWZ0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmdyaWRXaWRnZXQ/LmxheW91dCh3aWR0aCwgaGVpZ2h0LCB0b3AsIGxlZnQpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRvclBhcnQgZXh0ZW5kcyBQYXJ0PElFZGl0b3JQYXJ0TWVtZW50bz4gaW1wbGVtZW50cyBJRWRpdG9yUGFydCwgSUVkaXRvckdyb3Vwc1ZpZXcge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVESVRPUl9QQVJUX1VJX1NUQVRFX1NUT1JBR0VfS0VZID0gJ2VkaXRvcnBhcnQuc3RhdGUnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBFRElUT1JfUEFSVF9DRU5URVJFRF9WSUVXX1NUT1JBR0VfS0VZID0gJ2VkaXRvcnBhcnQuY2VudGVyZWR2aWV3JztcblxuXHQvLyNyZWdpb24gRXZlbnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGb2N1cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEZvY3VzID0gdGhpcy5fb25EaWRGb2N1cy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZExheW91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPERpbWVuc2lvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTGF5b3V0ID0gdGhpcy5fb25EaWRMYXlvdXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY3RpdmVHcm91cCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JHcm91cFZpZXc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZUdyb3VwID0gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVHcm91cC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUdyb3VwSW5kZXggPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRWRpdG9yR3JvdXBWaWV3PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VHcm91cEluZGV4ID0gdGhpcy5fb25EaWRDaGFuZ2VHcm91cEluZGV4LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlR3JvdXBMYWJlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JHcm91cFZpZXc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUdyb3VwTGFiZWwgPSB0aGlzLl9vbkRpZENoYW5nZUdyb3VwTGFiZWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VHcm91cExvY2tlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JHcm91cFZpZXc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUdyb3VwTG9ja2VkID0gdGhpcy5fb25EaWRDaGFuZ2VHcm91cExvY2tlZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUdyb3VwTWF4aW1pemVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlR3JvdXBNYXhpbWl6ZWQgPSB0aGlzLl9vbkRpZENoYW5nZUdyb3VwTWF4aW1pemVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWN0aXZhdGVHcm91cCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JHcm91cEFjdGl2YXRpb25FdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWN0aXZhdGVHcm91cCA9IHRoaXMuX29uRGlkQWN0aXZhdGVHcm91cC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFkZEdyb3VwID0gdGhpcy5fcmVnaXN0ZXIobmV3IFBhdXNlYWJsZUVtaXR0ZXI8SUVkaXRvckdyb3VwVmlldz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWRkR3JvdXAgPSB0aGlzLl9vbkRpZEFkZEdyb3VwLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVtb3ZlR3JvdXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgUGF1c2VhYmxlRW1pdHRlcjxJRWRpdG9yR3JvdXBWaWV3PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZW1vdmVHcm91cCA9IHRoaXMuX29uRGlkUmVtb3ZlR3JvdXAuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRNb3ZlR3JvdXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRWRpdG9yR3JvdXBWaWV3PigpKTtcblx0cmVhZG9ubHkgb25EaWRNb3ZlR3JvdXAgPSB0aGlzLl9vbkRpZE1vdmVHcm91cC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkU2V0R3JpZFdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IHVuZGVmaW5lZD4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTaXplQ29uc3RyYWludHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgUmVsYXk8eyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTaXplQ29uc3RyYWludHMgPSBFdmVudC5hbnkodGhpcy5vbkRpZFNldEdyaWRXaWRnZXQuZXZlbnQsIHRoaXMuX29uRGlkQ2hhbmdlU2l6ZUNvbnN0cmFpbnRzLmV2ZW50KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNjcm9sbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSZWxheTx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRTY3JvbGwgPSBFdmVudC5hbnkodGhpcy5vbkRpZFNldEdyaWRXaWRnZXQuZXZlbnQsIHRoaXMuX29uRGlkU2Nyb2xsLmV2ZW50KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUVkaXRvclBhcnRPcHRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvclBhcnRPcHRpb25zQ2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUVkaXRvclBhcnRPcHRpb25zID0gdGhpcy5fb25EaWRDaGFuZ2VFZGl0b3JQYXJ0T3B0aW9ucy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxEaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbERpc3Bvc2UgPSB0aGlzLl9vbldpbGxEaXNwb3NlLmV2ZW50O1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlTWVtZW50byA9IHRoaXMuZ2V0TWVtZW50byhTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb2ZpbGVNZW1lbnRvID0gdGhpcy5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZ3JvdXBWaWV3cyA9IG5ldyBNYXA8R3JvdXBJZGVudGlmaWVyLCBJRWRpdG9yR3JvdXBWaWV3PigpO1xuXHRwcml2YXRlIG1vc3RSZWNlbnRBY3RpdmVHcm91cHM6IEdyb3VwSWRlbnRpZmllcltdID0gW107XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRhaW5lciA9ICQoJy5jb250ZW50Jyk7XG5cblx0cmVhZG9ubHkgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cblx0cHJpdmF0ZSBjZW50ZXJlZExheW91dFdpZGdldCE6IENlbnRlcmVkVmlld0xheW91dDtcblxuXHRwcml2YXRlIGdyaWRXaWRnZXQhOiBTZXJpYWxpemFibGVHcmlkPElFZGl0b3JHcm91cFZpZXc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGdyaWRXaWRnZXREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZ3JpZFdpZGdldFZpZXcgPSB0aGlzLl9yZWdpc3RlcihuZXcgR3JpZFdpZGdldFZpZXc8SUVkaXRvckdyb3VwVmlldz4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGVkaXRvclBhcnRzVmlldzogSUVkaXRvclBhcnRzVmlldyxcblx0XHRpZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZ3JvdXBzTGFiZWw6IHN0cmluZyxcblx0XHRyZWFkb25seSB3aW5kb3dJZDogbnVtYmVyLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoaWQsIHsgaGFzVGl0bGU6IGZhbHNlIH0sIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxheW91dFNlcnZpY2UpO1xuXG5cdFx0dGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuY29udGFpbmVyKSk7XG5cdFx0dGhpcy5zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZV1cblx0XHQpKSk7XG5cblx0XHR0aGlzLl9wYXJ0T3B0aW9ucyA9IGdldEVkaXRvclBhcnRPcHRpb25zKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMudGhlbWVTZXJ2aWNlKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB0aGlzLm9uQ29uZmlndXJhdGlvblVwZGF0ZWQoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZEZpbGVJY29uVGhlbWVDaGFuZ2UoKCkgPT4gdGhpcy5oYW5kbGVDaGFuZ2VkUGFydE9wdGlvbnMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VNZW1lbnRvVmFsdWUoU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgdGhpcy5fc3RvcmUpKGUgPT4gdGhpcy5vbkRpZENoYW5nZU1lbWVudG9TdGF0ZShlKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbmZpZ3VyYXRpb25VcGRhdGVkKGV2ZW50OiBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGltcGFjdHNFZGl0b3JQYXJ0T3B0aW9ucyhldmVudCkpIHtcblx0XHRcdHRoaXMuaGFuZGxlQ2hhbmdlZFBhcnRPcHRpb25zKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVDaGFuZ2VkUGFydE9wdGlvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3Qgb2xkUGFydE9wdGlvbnMgPSB0aGlzLl9wYXJ0T3B0aW9ucztcblx0XHRjb25zdCBuZXdQYXJ0T3B0aW9ucyA9IGdldEVkaXRvclBhcnRPcHRpb25zKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMudGhlbWVTZXJ2aWNlKTtcblxuXHRcdGZvciAoY29uc3QgZW5mb3JjZWRQYXJ0T3B0aW9ucyBvZiB0aGlzLmVuZm9yY2VkUGFydE9wdGlvbnMpIHtcblx0XHRcdE9iamVjdC5hc3NpZ24obmV3UGFydE9wdGlvbnMsIGVuZm9yY2VkUGFydE9wdGlvbnMpOyAvLyBjaGVjayBmb3Igb3ZlcnJpZGVzXG5cdFx0fVxuXG5cdFx0dGhpcy5fcGFydE9wdGlvbnMgPSBuZXdQYXJ0T3B0aW9ucztcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRWRpdG9yUGFydE9wdGlvbnMuZmlyZSh7IG9sZFBhcnRPcHRpb25zLCBuZXdQYXJ0T3B0aW9ucyB9KTtcblx0fVxuXG5cdHByaXZhdGUgZW5mb3JjZWRQYXJ0T3B0aW9uczogRGVlcFBhcnRpYWw8SUVkaXRvclBhcnRPcHRpb25zPltdID0gW107XG5cblx0cHJpdmF0ZSBfcGFydE9wdGlvbnM6IElFZGl0b3JQYXJ0T3B0aW9ucztcblx0Z2V0IHBhcnRPcHRpb25zKCk6IElFZGl0b3JQYXJ0T3B0aW9ucyB7IHJldHVybiB0aGlzLl9wYXJ0T3B0aW9uczsgfVxuXG5cdGVuZm9yY2VQYXJ0T3B0aW9ucyhvcHRpb25zOiBEZWVwUGFydGlhbDxJRWRpdG9yUGFydE9wdGlvbnM+KTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuZW5mb3JjZWRQYXJ0T3B0aW9ucy5wdXNoKG9wdGlvbnMpO1xuXHRcdHRoaXMuaGFuZGxlQ2hhbmdlZFBhcnRPcHRpb25zKCk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuZW5mb3JjZWRQYXJ0T3B0aW9ucy5zcGxpY2UodGhpcy5lbmZvcmNlZFBhcnRPcHRpb25zLmluZGV4T2Yob3B0aW9ucyksIDEpO1xuXHRcdFx0dGhpcy5oYW5kbGVDaGFuZ2VkUGFydE9wdGlvbnMoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdG9wID0gMDtcblx0cHJpdmF0ZSBsZWZ0ID0gMDtcblx0cHJpdmF0ZSBfY29udGVudERpbWVuc2lvbiE6IERpbWVuc2lvbjtcblx0Z2V0IGNvbnRlbnREaW1lbnNpb24oKTogRGltZW5zaW9uIHsgcmV0dXJuIHRoaXMuX2NvbnRlbnREaW1lbnNpb247IH1cblxuXHRwcml2YXRlIF9jb250ZW50UmlnaHRJbnNldCA9IDA7XG5cblx0LyoqXG5cdCAqIFJlc2VydmVzIGFuIGluc2V0IChweCkgb24gdGhlIHJpZ2h0IG9mIHRoZSBlZGl0b3IgY29udGVudCBvZiB0aGUgZ3JvdXAocykgYXQgdGhlXG5cdCAqIHJpZ2h0IGVkZ2Ugb2YgdGhlIGVkaXRvciBwYXJ0LCB3aGlsZSB0aGUgdGl0bGUgc3RheXMgZnVsbCB3aWR0aCwgc28gYSBkb2NrZWQgcGFuZWxcblx0ICogY2FuIHNpdCBiZXNpZGUgdGhlIGVkaXRvciBjb250ZW50IHVuZGVyIG9uZSBmdWxsLXdpZHRoIHRhYiBiYXIuIE9ubHkgdGhlIHJpZ2h0LWVkZ2Vcblx0ICogZ3JvdXBzIChubyBuZWlnaGJvciB0byB0aGUgcmlnaHQpIGFyZSBpbnNldDsgaW50ZXJpb3IgZ3JvdXBzIGluIGEgc3BsaXQgbGF5b3V0IGtlZXBcblx0ICogZnVsbC13aWR0aCBjb250ZW50LiBSZWNvbXB1dGVkIHdoZW4gdGhlIGdyb3VwIHRvcG9sb2d5IGNoYW5nZXMuIGAwYCAoZGVmYXVsdClcblx0ICogcmVzdG9yZXMgZnVsbC13aWR0aCBjb250ZW50IGZvciBhbGwgZ3JvdXBzLlxuXHQgKi9cblx0c2V0Q29udGVudFJpZ2h0SW5zZXQoaW5zZXQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRlbnRSaWdodEluc2V0ID0gTWF0aC5tYXgoMCwgTWF0aC5yb3VuZChpbnNldCkpO1xuXHRcdHRoaXMuYXBwbHlDb250ZW50UmlnaHRJbnNldCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseUNvbnRlbnRSaWdodEluc2V0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5ncmlkV2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmdyb3VwVmlld3MudmFsdWVzKCkpIHtcblx0XHRcdGlmICghKGdyb3VwIGluc3RhbmNlb2YgRWRpdG9yR3JvdXBWaWV3KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT25seSBncm91cHMgYXQgdGhlIHJpZ2h0IGVkZ2Ugb2YgdGhlIGVkaXRvciBwYXJ0IChubyBuZWlnaGJvciB0byB0aGUgcmlnaHQpXG5cdFx0XHQvLyBzaXQgdW5kZXIgdGhlIGRvY2tlZCBwYW5lbCBvdmVybGF5OyBpbnRlcmlvciBncm91cHMga2VlcCBmdWxsLXdpZHRoIGNvbnRlbnQuXG5cdFx0XHRjb25zdCBhdFJpZ2h0RWRnZSA9IHRoaXMuX2NvbnRlbnRSaWdodEluc2V0ID4gMCAmJiB0aGlzLmdyaWRXaWRnZXQuZ2V0TmVpZ2hib3JWaWV3cyhncm91cCwgRGlyZWN0aW9uLlJpZ2h0KS5sZW5ndGggPT09IDA7XG5cdFx0XHRncm91cC5zZXRDb250ZW50UmlnaHRJbnNldChhdFJpZ2h0RWRnZSA/IHRoaXMuX2NvbnRlbnRSaWdodEluc2V0IDogMCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYWN0aXZlR3JvdXAhOiBJRWRpdG9yR3JvdXBWaWV3O1xuXHRnZXQgYWN0aXZlR3JvdXAoKTogSUVkaXRvckdyb3VwVmlldyB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGl2ZUdyb3VwO1xuXHR9XG5cblx0cmVhZG9ubHkgc2lkZUdyb3VwOiBJRWRpdG9yU2lkZUdyb3VwID0ge1xuXHRcdG9wZW5FZGl0b3I6IGFzeW5jIChlZGl0b3IsIG9wdGlvbnMpID0+IHtcblx0XHRcdGNvbnN0IGZpbmRHcm91cFJlc3VsdCA9IHRoaXMuc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gZmluZEdyb3VwKGFjY2Vzc29yLCB7IGVkaXRvciwgb3B0aW9ucyB9LCBTSURFX0dST1VQKSk7XG5cdFx0XHRsZXQgZ3JvdXA7XG5cdFx0XHRpZiAoZmluZEdyb3VwUmVzdWx0IGluc3RhbmNlb2YgUHJvbWlzZSkge1xuXHRcdFx0XHQoW2dyb3VwXSA9IGF3YWl0IGZpbmRHcm91cFJlc3VsdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQoW2dyb3VwXSA9IGZpbmRHcm91cFJlc3VsdCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZ3JvdXAub3BlbkVkaXRvcihlZGl0b3IsIG9wdGlvbnMpO1xuXHRcdH1cblx0fTtcblxuXHRnZXQgZ3JvdXBzKCk6IElFZGl0b3JHcm91cFZpZXdbXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5ncm91cFZpZXdzLnZhbHVlcygpKTtcblx0fVxuXG5cdGdldCBjb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmdyb3VwVmlld3Muc2l6ZTtcblx0fVxuXG5cdGdldCBvcmllbnRhdGlvbigpOiBHcm91cE9yaWVudGF0aW9uIHtcblx0XHRyZXR1cm4gKHRoaXMuZ3JpZFdpZGdldCAmJiB0aGlzLmdyaWRXaWRnZXQub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMKSA/IEdyb3VwT3JpZW50YXRpb24uVkVSVElDQUwgOiBHcm91cE9yaWVudGF0aW9uLkhPUklaT05UQUw7XG5cdH1cblxuXHRwcml2YXRlIF9pc1JlYWR5ID0gZmFsc2U7XG5cdGdldCBpc1JlYWR5KCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faXNSZWFkeTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgd2hlblJlYWR5UHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0cmVhZG9ubHkgd2hlblJlYWR5ID0gdGhpcy53aGVuUmVhZHlQcm9taXNlLnA7XG5cblx0cHJpdmF0ZSByZWFkb25seSB3aGVuUmVzdG9yZWRQcm9taXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRyZWFkb25seSB3aGVuUmVzdG9yZWQgPSB0aGlzLndoZW5SZXN0b3JlZFByb21pc2UucDtcblxuXHRnZXQgaGFzUmVzdG9yYWJsZVN0YXRlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMud29ya3NwYWNlTWVtZW50b1tFZGl0b3JQYXJ0LkVESVRPUl9QQVJUX1VJX1NUQVRFX1NUT1JBR0VfS0VZXTtcblx0fVxuXG5cdHByaXZhdGUgX3dpbGxSZXN0b3JlU3RhdGUgPSBmYWxzZTtcblx0Z2V0IHdpbGxSZXN0b3JlU3RhdGUoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl93aWxsUmVzdG9yZVN0YXRlOyB9XG5cblx0Z2V0R3JvdXBzKG9yZGVyID0gR3JvdXBzT3JkZXIuQ1JFQVRJT05fVElNRSk6IElFZGl0b3JHcm91cFZpZXdbXSB7XG5cdFx0c3dpdGNoIChvcmRlcikge1xuXHRcdFx0Y2FzZSBHcm91cHNPcmRlci5DUkVBVElPTl9USU1FOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5ncm91cHM7XG5cblx0XHRcdGNhc2UgR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkU6IHtcblx0XHRcdFx0Y29uc3QgbW9zdFJlY2VudEFjdGl2ZSA9IGNvYWxlc2NlKHRoaXMubW9zdFJlY2VudEFjdGl2ZUdyb3Vwcy5tYXAoZ3JvdXBJZCA9PiB0aGlzLmdldEdyb3VwKGdyb3VwSWQpKSk7XG5cblx0XHRcdFx0Ly8gdGhlcmUgY2FuIGJlIGdyb3VwcyB0aGF0IGdvdCBuZXZlciBhY3RpdmUsIGV2ZW4gdGhvdWdoIHRoZXkgZXhpc3QuIGluIHRoaXMgY2FzZVxuXHRcdFx0XHQvLyBtYWtlIHN1cmUgdG8ganVzdCBhcHBlbmQgdGhlbSBhdCB0aGUgZW5kIHNvIHRoYXQgYWxsIGdyb3VwcyBhcmUgcmV0dXJuZWQgcHJvcGVybHlcblx0XHRcdFx0cmV0dXJuIGRpc3RpbmN0KFsuLi5tb3N0UmVjZW50QWN0aXZlLCAuLi50aGlzLmdyb3Vwc10pO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBHcm91cHNPcmRlci5HUklEX0FQUEVBUkFOQ0U6IHtcblx0XHRcdFx0Y29uc3Qgdmlld3M6IElFZGl0b3JHcm91cFZpZXdbXSA9IFtdO1xuXHRcdFx0XHRpZiAodGhpcy5ncmlkV2lkZ2V0KSB7XG5cdFx0XHRcdFx0dGhpcy5maWxsR3JpZE5vZGVzKHZpZXdzLCB0aGlzLmdyaWRXaWRnZXQuZ2V0Vmlld3MoKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdmlld3M7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmaWxsR3JpZE5vZGVzKHRhcmdldDogSUVkaXRvckdyb3VwVmlld1tdLCBub2RlOiBHcmlkQnJhbmNoTm9kZTxJRWRpdG9yR3JvdXBWaWV3PiB8IEdyaWROb2RlPElFZGl0b3JHcm91cFZpZXc+KTogdm9pZCB7XG5cdFx0aWYgKGlzR3JpZEJyYW5jaE5vZGUobm9kZSkpIHtcblx0XHRcdG5vZGUuY2hpbGRyZW4uZm9yRWFjaChjaGlsZCA9PiB0aGlzLmZpbGxHcmlkTm9kZXModGFyZ2V0LCBjaGlsZCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0YXJnZXQucHVzaChub2RlLnZpZXcpO1xuXHRcdH1cblx0fVxuXG5cdGhhc0dyb3VwKGlkZW50aWZpZXI6IEdyb3VwSWRlbnRpZmllcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmdyb3VwVmlld3MuaGFzKGlkZW50aWZpZXIpO1xuXHR9XG5cblx0Z2V0R3JvdXAoaWRlbnRpZmllcjogR3JvdXBJZGVudGlmaWVyKTogSUVkaXRvckdyb3VwVmlldyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ3JvdXBWaWV3cy5nZXQoaWRlbnRpZmllcik7XG5cdH1cblxuXHRmaW5kR3JvdXAoc2NvcGU6IElGaW5kR3JvdXBTY29wZSwgc291cmNlOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyID0gdGhpcy5hY3RpdmVHcm91cCwgd3JhcD86IGJvb2xlYW4pOiBJRWRpdG9yR3JvdXBWaWV3IHwgdW5kZWZpbmVkIHtcblxuXHRcdC8vIGJ5IGRpcmVjdGlvblxuXHRcdGlmICh0eXBlb2Ygc2NvcGUuZGlyZWN0aW9uID09PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9GaW5kR3JvdXBCeURpcmVjdGlvbihzY29wZS5kaXJlY3Rpb24sIHNvdXJjZSwgd3JhcCk7XG5cdFx0fVxuXG5cdFx0Ly8gYnkgbG9jYXRpb25cblx0XHRpZiAodHlwZW9mIHNjb3BlLmxvY2F0aW9uID09PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9GaW5kR3JvdXBCeUxvY2F0aW9uKHNjb3BlLmxvY2F0aW9uLCBzb3VyY2UsIHdyYXApO1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcignaW52YWxpZCBhcmd1bWVudHMnKTtcblx0fVxuXG5cdHByaXZhdGUgZG9GaW5kR3JvdXBCeURpcmVjdGlvbihkaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uLCBzb3VyY2U6IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIsIHdyYXA/OiBib29sZWFuKTogSUVkaXRvckdyb3VwVmlldyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc291cmNlR3JvdXBWaWV3ID0gdGhpcy5hc3NlcnRHcm91cFZpZXcoc291cmNlKTtcblxuXHRcdC8vIEZpbmQgbmVpZ2hib3VycyBhbmQgc29ydCBieSBvdXIgTVJVIGxpc3Rcblx0XHRjb25zdCBuZWlnaGJvdXJzID0gdGhpcy5ncmlkV2lkZ2V0LmdldE5laWdoYm9yVmlld3Moc291cmNlR3JvdXBWaWV3LCB0aGlzLnRvR3JpZFZpZXdEaXJlY3Rpb24oZGlyZWN0aW9uKSwgd3JhcCk7XG5cdFx0bmVpZ2hib3Vycy5zb3J0KCgobjEsIG4yKSA9PiB0aGlzLm1vc3RSZWNlbnRBY3RpdmVHcm91cHMuaW5kZXhPZihuMS5pZCkgLSB0aGlzLm1vc3RSZWNlbnRBY3RpdmVHcm91cHMuaW5kZXhPZihuMi5pZCkpKTtcblxuXHRcdHJldHVybiBuZWlnaGJvdXJzWzBdO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0ZpbmRHcm91cEJ5TG9jYXRpb24obG9jYXRpb246IEdyb3VwTG9jYXRpb24sIHNvdXJjZTogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgd3JhcD86IGJvb2xlYW4pOiBJRWRpdG9yR3JvdXBWaWV3IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzb3VyY2VHcm91cFZpZXcgPSB0aGlzLmFzc2VydEdyb3VwVmlldyhzb3VyY2UpO1xuXHRcdGNvbnN0IGdyb3VwcyA9IHRoaXMuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLkdSSURfQVBQRUFSQU5DRSk7XG5cdFx0Y29uc3QgaW5kZXggPSBncm91cHMuaW5kZXhPZihzb3VyY2VHcm91cFZpZXcpO1xuXG5cdFx0c3dpdGNoIChsb2NhdGlvbikge1xuXHRcdFx0Y2FzZSBHcm91cExvY2F0aW9uLkZJUlNUOlxuXHRcdFx0XHRyZXR1cm4gZ3JvdXBzWzBdO1xuXHRcdFx0Y2FzZSBHcm91cExvY2F0aW9uLkxBU1Q6XG5cdFx0XHRcdHJldHVybiBncm91cHNbZ3JvdXBzLmxlbmd0aCAtIDFdO1xuXHRcdFx0Y2FzZSBHcm91cExvY2F0aW9uLk5FWFQ6IHtcblx0XHRcdFx0bGV0IG5leHRHcm91cDogSUVkaXRvckdyb3VwVmlldyB8IHVuZGVmaW5lZCA9IGdyb3Vwc1tpbmRleCArIDFdO1xuXHRcdFx0XHRpZiAoIW5leHRHcm91cCAmJiB3cmFwKSB7XG5cdFx0XHRcdFx0bmV4dEdyb3VwID0gdGhpcy5kb0ZpbmRHcm91cEJ5TG9jYXRpb24oR3JvdXBMb2NhdGlvbi5GSVJTVCwgc291cmNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBuZXh0R3JvdXA7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEdyb3VwTG9jYXRpb24uUFJFVklPVVM6IHtcblx0XHRcdFx0bGV0IHByZXZpb3VzR3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCB1bmRlZmluZWQgPSBncm91cHNbaW5kZXggLSAxXTtcblx0XHRcdFx0aWYgKCFwcmV2aW91c0dyb3VwICYmIHdyYXApIHtcblx0XHRcdFx0XHRwcmV2aW91c0dyb3VwID0gdGhpcy5kb0ZpbmRHcm91cEJ5TG9jYXRpb24oR3JvdXBMb2NhdGlvbi5MQVNULCBzb3VyY2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHByZXZpb3VzR3JvdXA7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YWN0aXZhdGVHcm91cChncm91cDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgcHJlc2VydmVXaW5kb3dPcmRlcj86IGJvb2xlYW4sIHJlYXNvbj86IEdyb3VwQWN0aXZhdGlvblJlYXNvbik6IElFZGl0b3JHcm91cFZpZXcge1xuXHRcdGNvbnN0IGdyb3VwVmlldyA9IHRoaXMuYXNzZXJ0R3JvdXBWaWV3KGdyb3VwKTtcblx0XHR0aGlzLmRvU2V0R3JvdXBBY3RpdmUoZ3JvdXBWaWV3LCByZWFzb24pO1xuXG5cdFx0Ly8gRW5zdXJlIHdpbmRvdyBvbiB0b3AgdW5sZXNzIGRpc2FibGVkXG5cdFx0aWYgKCFwcmVzZXJ2ZVdpbmRvd09yZGVyKSB7XG5cdFx0XHR0aGlzLmhvc3RTZXJ2aWNlLm1vdmVUb3AoZ2V0V2luZG93KHRoaXMuZWxlbWVudCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBncm91cFZpZXc7XG5cdH1cblxuXHRyZXN0b3JlR3JvdXAoZ3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIpOiBJRWRpdG9yR3JvdXBWaWV3IHtcblx0XHRjb25zdCBncm91cFZpZXcgPSB0aGlzLmFzc2VydEdyb3VwVmlldyhncm91cCk7XG5cdFx0dGhpcy5kb1Jlc3RvcmVHcm91cChncm91cFZpZXcpO1xuXG5cdFx0cmV0dXJuIGdyb3VwVmlldztcblx0fVxuXG5cdGdldFNpemUoZ3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIpOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0ge1xuXHRcdGNvbnN0IGdyb3VwVmlldyA9IHRoaXMuYXNzZXJ0R3JvdXBWaWV3KGdyb3VwKTtcblxuXHRcdHJldHVybiB0aGlzLmdyaWRXaWRnZXQuZ2V0Vmlld1NpemUoZ3JvdXBWaWV3KTtcblx0fVxuXG5cdHNldFNpemUoZ3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIsIHNpemU6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdGNvbnN0IGdyb3VwVmlldyA9IHRoaXMuYXNzZXJ0R3JvdXBWaWV3KGdyb3VwKTtcblxuXHRcdHRoaXMuZ3JpZFdpZGdldC5yZXNpemVWaWV3KGdyb3VwVmlldywgc2l6ZSk7XG5cdH1cblxuXHRhcnJhbmdlR3JvdXBzKGFycmFuZ2VtZW50OiBHcm91cHNBcnJhbmdlbWVudCwgdGFyZ2V0OiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyID0gdGhpcy5hY3RpdmVHcm91cCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNvdW50IDwgMikge1xuXHRcdFx0cmV0dXJuOyAvLyByZXF1aXJlIGF0IGxlYXN0IDIgZ3JvdXBzIHRvIHNob3dcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuZ3JpZFdpZGdldCkge1xuXHRcdFx0cmV0dXJuOyAvLyB3ZSBoYXZlIG5vdCBiZWVuIGNyZWF0ZWQgeWV0XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ3JvdXBWaWV3ID0gdGhpcy5hc3NlcnRHcm91cFZpZXcodGFyZ2V0KTtcblxuXHRcdHN3aXRjaCAoYXJyYW5nZW1lbnQpIHtcblx0XHRcdGNhc2UgR3JvdXBzQXJyYW5nZW1lbnQuRVZFTjpcblx0XHRcdFx0dGhpcy5ncmlkV2lkZ2V0LmRpc3RyaWJ1dGVWaWV3U2l6ZXMoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEdyb3Vwc0FycmFuZ2VtZW50Lk1BWElNSVpFOlxuXHRcdFx0XHRpZiAodGhpcy5ncm91cHMubGVuZ3RoIDwgMikge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gbmVlZCBhdCBsZWFzdCAyIGdyb3VwcyB0byBiZSBtYXhpbWl6ZWRcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmdyaWRXaWRnZXQubWF4aW1pemVWaWV3KGdyb3VwVmlldyk7XG5cdFx0XHRcdGdyb3VwVmlldy5mb2N1cygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgR3JvdXBzQXJyYW5nZW1lbnQuRVhQQU5EOlxuXHRcdFx0XHR0aGlzLmdyaWRXaWRnZXQuZXhwYW5kVmlldyhncm91cFZpZXcpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHR0b2dnbGVNYXhpbWl6ZUdyb3VwKHRhcmdldDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciA9IHRoaXMuYWN0aXZlR3JvdXApOiB2b2lkIHtcblx0XHRpZiAodGhpcy5oYXNNYXhpbWl6ZWRHcm91cCgpKSB7XG5cdFx0XHR0aGlzLnVubWF4aW1pemVHcm91cCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmFycmFuZ2VHcm91cHMoR3JvdXBzQXJyYW5nZW1lbnQuTUFYSU1JWkUsIHRhcmdldCk7XG5cdFx0fVxuXHR9XG5cblx0dG9nZ2xlRXhwYW5kR3JvdXAodGFyZ2V0OiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyID0gdGhpcy5hY3RpdmVHcm91cCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzR3JvdXBFeHBhbmRlZCh0aGlzLmFjdGl2ZUdyb3VwKSkge1xuXHRcdFx0dGhpcy5hcnJhbmdlR3JvdXBzKEdyb3Vwc0FycmFuZ2VtZW50LkVWRU4pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmFycmFuZ2VHcm91cHMoR3JvdXBzQXJyYW5nZW1lbnQuRVhQQU5ELCB0YXJnZXQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdW5tYXhpbWl6ZUdyb3VwKCk6IHZvaWQge1xuXHRcdHRoaXMuZ3JpZFdpZGdldC5leGl0TWF4aW1pemVkVmlldygpO1xuXHRcdHRoaXMuX2FjdGl2ZUdyb3VwLmZvY3VzKCk7IC8vIFdoZW4gbWFraW5nIHZpZXdzIHZpc2libGUgdGhlIGZvY3VzIGNhbiBiZSBhZmZlY3RlZCwgc28gcmVzdG9yZSBpdFxuXHR9XG5cblx0aGFzTWF4aW1pemVkR3JvdXAoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ3JpZFdpZGdldC5oYXNNYXhpbWl6ZWRWaWV3KCk7XG5cdH1cblxuXHRwcml2YXRlIGlzR3JvdXBNYXhpbWl6ZWQodGFyZ2V0R3JvdXA6IElFZGl0b3JHcm91cFZpZXcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5ncmlkV2lkZ2V0LmlzVmlld01heGltaXplZCh0YXJnZXRHcm91cCk7XG5cdH1cblxuXHRpc0dyb3VwRXhwYW5kZWQodGFyZ2V0R3JvdXA6IElFZGl0b3JHcm91cFZpZXcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5ncmlkV2lkZ2V0LmlzVmlld0V4cGFuZGVkKHRhcmdldEdyb3VwKTtcblx0fVxuXG5cdHNldEdyb3VwT3JpZW50YXRpb24ob3JpZW50YXRpb246IEdyb3VwT3JpZW50YXRpb24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZ3JpZFdpZGdldCkge1xuXHRcdFx0cmV0dXJuOyAvLyB3ZSBoYXZlIG5vdCBiZWVuIGNyZWF0ZWQgeWV0XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3T3JpZW50YXRpb24gPSAob3JpZW50YXRpb24gPT09IEdyb3VwT3JpZW50YXRpb24uSE9SSVpPTlRBTCkgPyBPcmllbnRhdGlvbi5IT1JJWk9OVEFMIDogT3JpZW50YXRpb24uVkVSVElDQUw7XG5cdFx0aWYgKHRoaXMuZ3JpZFdpZGdldC5vcmllbnRhdGlvbiAhPT0gbmV3T3JpZW50YXRpb24pIHtcblx0XHRcdHRoaXMuZ3JpZFdpZGdldC5vcmllbnRhdGlvbiA9IG5ld09yaWVudGF0aW9uO1xuXHRcdH1cblx0fVxuXG5cdGFwcGx5TGF5b3V0KGxheW91dDogRWRpdG9yR3JvdXBMYXlvdXQpOiB2b2lkIHtcblx0XHRjb25zdCByZXN0b3JlRm9jdXMgPSB0aGlzLnNob3VsZFJlc3RvcmVGb2N1cyh0aGlzLmNvbnRhaW5lcik7XG5cblx0XHQvLyBEZXRlcm1pbmUgaG93IG1hbnkgZ3JvdXBzIHdlIG5lZWQgb3ZlcmFsbFxuXHRcdGxldCBsYXlvdXRHcm91cHNDb3VudCA9IDA7XG5cdFx0ZnVuY3Rpb24gY291bnRHcm91cHMoZ3JvdXBzOiBHcm91cExheW91dEFyZ3VtZW50W10pOiB2b2lkIHtcblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KGdyb3VwLmdyb3VwcykpIHtcblx0XHRcdFx0XHRjb3VudEdyb3Vwcyhncm91cC5ncm91cHMpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxheW91dEdyb3Vwc0NvdW50Kys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y291bnRHcm91cHMobGF5b3V0Lmdyb3Vwcyk7XG5cblx0XHQvLyBJZiB3ZSBjdXJyZW50bHkgaGF2ZSB0b28gbWFueSBncm91cHMsIG1lcmdlIHRoZW0gaW50byB0aGUgbGFzdCBvbmVcblx0XHRsZXQgY3VycmVudEdyb3VwVmlld3MgPSB0aGlzLmdldEdyb3VwcyhHcm91cHNPcmRlci5HUklEX0FQUEVBUkFOQ0UpO1xuXHRcdGlmIChsYXlvdXRHcm91cHNDb3VudCA8IGN1cnJlbnRHcm91cFZpZXdzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgbGFzdEdyb3VwSW5MYXlvdXQgPSBjdXJyZW50R3JvdXBWaWV3c1tsYXlvdXRHcm91cHNDb3VudCAtIDFdO1xuXHRcdFx0Y3VycmVudEdyb3VwVmlld3MuZm9yRWFjaCgoZ3JvdXAsIGluZGV4KSA9PiB7XG5cdFx0XHRcdGlmIChpbmRleCA+PSBsYXlvdXRHcm91cHNDb3VudCkge1xuXHRcdFx0XHRcdHRoaXMubWVyZ2VHcm91cChncm91cCwgbGFzdEdyb3VwSW5MYXlvdXQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y3VycmVudEdyb3VwVmlld3MgPSB0aGlzLmdldEdyb3VwcyhHcm91cHNPcmRlci5HUklEX0FQUEVBUkFOQ0UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZUdyb3VwID0gdGhpcy5hY3RpdmVHcm91cDtcblxuXHRcdC8vIFByZXBhcmUgZ3JpZCBkZXNjcmlwdG9yIHRvIGNyZWF0ZSBuZXcgZ3JpZCBmcm9tXG5cdFx0Y29uc3QgZ3JpZERlc2NyaXB0b3IgPSBjcmVhdGVTZXJpYWxpemVkR3JpZCh7XG5cdFx0XHRvcmllbnRhdGlvbjogdGhpcy50b0dyaWRWaWV3T3JpZW50YXRpb24oXG5cdFx0XHRcdGxheW91dC5vcmllbnRhdGlvbixcblx0XHRcdFx0dGhpcy5pc1R3b0RpbWVuc2lvbmFsR3JpZCgpID9cblx0XHRcdFx0XHR0aGlzLmdyaWRXaWRnZXQub3JpZW50YXRpb24gOlx0XHRcdC8vIHByZXNlcnZlIG9yaWdpbmFsIG9yaWVudGF0aW9uIGZvciAyLWRpbWVuc2lvbmFsIGdyaWRzXG5cdFx0XHRcdFx0b3J0aG9nb25hbCh0aGlzLmdyaWRXaWRnZXQub3JpZW50YXRpb24pIC8vIG90aGVyd2lzZSBmbGlwIChmaXggaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzUyOTc1KVxuXHRcdFx0KSxcblx0XHRcdGdyb3VwczogbGF5b3V0Lmdyb3Vwc1xuXHRcdH0pO1xuXG5cdFx0Ly8gUmVjcmVhdGUgZ3JpZHdpZGdldCB3aXRoIGRlc2NyaXB0b3Jcblx0XHR0aGlzLmRvQXBwbHlHcmlkU3RhdGUoZ3JpZERlc2NyaXB0b3IsIGFjdGl2ZUdyb3VwLmlkLCBjdXJyZW50R3JvdXBWaWV3cyk7XG5cblx0XHQvLyBSZXN0b3JlIGZvY3VzIGFzIG5lZWRlZFxuXHRcdGlmIChyZXN0b3JlRm9jdXMpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0TGF5b3V0KCk6IEVkaXRvckdyb3VwTGF5b3V0IHtcblxuXHRcdC8vIEV4YW1wbGUgcmV0dXJuIHZhbHVlOlxuXHRcdC8vIHsgb3JpZW50YXRpb246IDAsIGdyb3VwczogWyB7IGdyb3VwczogWyB7IHNpemU6IDAuNCB9LCB7IHNpemU6IDAuNiB9IF0sIHNpemU6IDAuNSB9LCB7IGdyb3VwczogWyB7fSwge30gXSwgc2l6ZTogMC41IH0gXSB9XG5cblx0XHRjb25zdCBzZXJpYWxpemVkR3JpZCA9IHRoaXMuZ3JpZFdpZGdldC5zZXJpYWxpemUoKTtcblx0XHRjb25zdCBvcmllbnRhdGlvbiA9IHNlcmlhbGl6ZWRHcmlkLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gR3JvdXBPcmllbnRhdGlvbi5IT1JJWk9OVEFMIDogR3JvdXBPcmllbnRhdGlvbi5WRVJUSUNBTDtcblx0XHRjb25zdCByb290ID0gdGhpcy5zZXJpYWxpemVkTm9kZVRvR3JvdXBMYXlvdXRBcmd1bWVudChzZXJpYWxpemVkR3JpZC5yb290KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRvcmllbnRhdGlvbixcblx0XHRcdGdyb3Vwczogcm9vdC5ncm91cHMgYXMgR3JvdXBMYXlvdXRBcmd1bWVudFtdXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc2VyaWFsaXplZE5vZGVUb0dyb3VwTGF5b3V0QXJndW1lbnQoc2VyaWFsaXplZE5vZGU6IElTZXJpYWxpemVkTm9kZSk6IEdyb3VwTGF5b3V0QXJndW1lbnQge1xuXHRcdGlmIChzZXJpYWxpemVkTm9kZS50eXBlID09PSAnYnJhbmNoJykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c2l6ZTogc2VyaWFsaXplZE5vZGUuc2l6ZSxcblx0XHRcdFx0Z3JvdXBzOiBzZXJpYWxpemVkTm9kZS5kYXRhLm1hcChub2RlID0+IHRoaXMuc2VyaWFsaXplZE5vZGVUb0dyb3VwTGF5b3V0QXJndW1lbnQobm9kZSkpXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHNpemU6IHNlcmlhbGl6ZWROb2RlLnNpemUgfTtcblx0fVxuXG5cdHByb3RlY3RlZCBzaG91bGRSZXN0b3JlRm9jdXModGFyZ2V0OiBFbGVtZW50IHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gZ2V0QWN0aXZlRWxlbWVudCgpO1xuXHRcdGlmIChhY3RpdmVFbGVtZW50ID09PSB0YXJnZXQub3duZXJEb2N1bWVudC5ib2R5KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gYWx3YXlzIHJlc3RvcmUgZm9jdXMgaWYgbm90aGluZyBpcyBmb2N1c2VkIGN1cnJlbnRseVxuXHRcdH1cblxuXHRcdC8vIG90aGVyd2lzZSBjaGVjayBmb3IgdGhlIGFjdGl2ZSBlbGVtZW50IGJlaW5nIGFuIGFuY2VzdG9yIG9mIHRoZSB0YXJnZXRcblx0XHRyZXR1cm4gaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudCh0YXJnZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1R3b0RpbWVuc2lvbmFsR3JpZCgpOiBib29sZWFuIHtcblx0XHRjb25zdCB2aWV3cyA9IHRoaXMuZ3JpZFdpZGdldC5nZXRWaWV3cygpO1xuXHRcdGlmIChpc0dyaWRCcmFuY2hOb2RlKHZpZXdzKSkge1xuXHRcdFx0Ly8gdGhlIGdyaWQgaXMgMi1kaW1lbnNpb25hbCBpZiBhbnkgY2hpbGRyZW5cblx0XHRcdC8vIG9mIHRoZSBncmlkIGlzIGEgYnJhbmNoIG5vZGVcblx0XHRcdHJldHVybiB2aWV3cy5jaGlsZHJlbi5zb21lKGNoaWxkID0+IGlzR3JpZEJyYW5jaE5vZGUoY2hpbGQpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRhZGRHcm91cChsb2NhdGlvbjogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbiwgZ3JvdXBUb0NvcHk/OiBJRWRpdG9yR3JvdXBWaWV3KTogSUVkaXRvckdyb3VwVmlldyB7XG5cdFx0Y29uc3QgbG9jYXRpb25WaWV3ID0gdGhpcy5hc3NlcnRHcm91cFZpZXcobG9jYXRpb24pO1xuXG5cdFx0bGV0IG5ld0dyb3VwVmlldzogSUVkaXRvckdyb3VwVmlldztcblxuXHRcdC8vIFNhbWUgZ3JvdXBzIHZpZXc6IGFkZCB0byBncmlkIHdpZGdldCBkaXJlY3RseVxuXHRcdGlmIChsb2NhdGlvblZpZXcuZ3JvdXBzVmlldyA9PT0gdGhpcykge1xuXHRcdFx0Y29uc3QgcmVzdG9yZUZvY3VzID0gdGhpcy5zaG91bGRSZXN0b3JlRm9jdXMobG9jYXRpb25WaWV3LmVsZW1lbnQpO1xuXG5cdFx0XHRjb25zdCBzaG91bGRFeHBhbmQgPSB0aGlzLmdyb3VwVmlld3Muc2l6ZSA+IDEgJiYgdGhpcy5pc0dyb3VwRXhwYW5kZWQobG9jYXRpb25WaWV3KTtcblx0XHRcdG5ld0dyb3VwVmlldyA9IHRoaXMuZG9DcmVhdGVHcm91cFZpZXcoZ3JvdXBUb0NvcHkpO1xuXG5cdFx0XHQvLyBBZGQgdG8gZ3JpZCB3aWRnZXRcblx0XHRcdHRoaXMuZ3JpZFdpZGdldC5hZGRWaWV3KFxuXHRcdFx0XHRuZXdHcm91cFZpZXcsXG5cdFx0XHRcdHRoaXMuZ2V0U3BsaXRTaXppbmdTdHlsZSgpLFxuXHRcdFx0XHRsb2NhdGlvblZpZXcsXG5cdFx0XHRcdHRoaXMudG9HcmlkVmlld0RpcmVjdGlvbihkaXJlY3Rpb24pLFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gVXBkYXRlIGNvbnRhaW5lclxuXHRcdFx0dGhpcy51cGRhdGVDb250YWluZXIoKTtcblxuXHRcdFx0Ly8gRXZlbnRcblx0XHRcdHRoaXMuX29uRGlkQWRkR3JvdXAuZmlyZShuZXdHcm91cFZpZXcpO1xuXG5cdFx0XHQvLyBOb3RpZnkgZ3JvdXAgaW5kZXggY2hhbmdlIGdpdmVuIGEgbmV3IGdyb3VwIHdhcyBhZGRlZFxuXHRcdFx0dGhpcy5ub3RpZnlHcm91cEluZGV4Q2hhbmdlKCk7XG5cblx0XHRcdC8vIEV4cGFuZCBuZXcgZ3JvdXAsIGlmIHRoZSByZWZlcmVuY2UgdmlldyB3YXMgcHJldmlvdXNseSBleHBhbmRlZFxuXHRcdFx0aWYgKHNob3VsZEV4cGFuZCkge1xuXHRcdFx0XHR0aGlzLmFycmFuZ2VHcm91cHMoR3JvdXBzQXJyYW5nZW1lbnQuRVhQQU5ELCBuZXdHcm91cFZpZXcpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXN0b3JlIGZvY3VzIGlmIHdlIGhhZCBpdCBwcmV2aW91c2x5IGFmdGVyIGNvbXBsZXRpbmcgdGhlIGdyaWRcblx0XHRcdC8vIG9wZXJhdGlvbi4gVGhhdCBvcGVyYXRpb24gbWlnaHQgY2F1c2UgcmVwYXJlbnRpbmcgb2YgZ3JpZCB2aWV3c1xuXHRcdFx0Ly8gd2hpY2ggbW92ZXMgZm9jdXMgdG8gdGhlIDxib2R5PiBlbGVtZW50IG90aGVyd2lzZS5cblx0XHRcdGlmIChyZXN0b3JlRm9jdXMpIHtcblx0XHRcdFx0bG9jYXRpb25WaWV3LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRGlmZmVyZW50IGdyb3VwIHZpZXc6IGFkZCB0byBncmlkIHdpZGdldCBvZiB0aGF0IGdyb3VwXG5cdFx0ZWxzZSB7XG5cdFx0XHRuZXdHcm91cFZpZXcgPSBsb2NhdGlvblZpZXcuZ3JvdXBzVmlldy5hZGRHcm91cChsb2NhdGlvblZpZXcsIGRpcmVjdGlvbiwgZ3JvdXBUb0NvcHkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXdHcm91cFZpZXc7XG5cdH1cblxuXHRwcml2YXRlIGdldFNwbGl0U2l6aW5nU3R5bGUoKTogU2l6aW5nIHtcblx0XHRzd2l0Y2ggKHRoaXMuX3BhcnRPcHRpb25zLnNwbGl0U2l6aW5nKSB7XG5cdFx0XHRjYXNlICdkaXN0cmlidXRlJzpcblx0XHRcdFx0cmV0dXJuIFNpemluZy5EaXN0cmlidXRlO1xuXHRcdFx0Y2FzZSAnc3BsaXQnOlxuXHRcdFx0XHRyZXR1cm4gU2l6aW5nLlNwbGl0O1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIFNpemluZy5BdXRvO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBCYXNlIHtAbGluayBJRWRpdG9yR3JvdXBWaWV3T3B0aW9uc30gYXBwbGllZCB0byBldmVyeSBncm91cCB0aGlzIHBhcnQgY3JlYXRlcy5cblx0ICogU3ViY2xhc3NlcyBvdmVycmlkZSB0byBjb25maWd1cmUgcGFydC13aWRlIGdyb3VwIGJlaGF2aW9yIChlLmcuIGhlYWRlciBtZW51cykuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgZ2V0R3JvdXBWaWV3T3B0aW9ucygpOiBJRWRpdG9yR3JvdXBWaWV3T3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZG9DcmVhdGVHcm91cFZpZXcoZnJvbT86IElFZGl0b3JHcm91cFZpZXcgfCBJU2VyaWFsaXplZEVkaXRvckdyb3VwTW9kZWwgfCBudWxsLCBvcHRpb25zPzogSUVkaXRvckdyb3VwVmlld09wdGlvbnMpOiBJRWRpdG9yR3JvdXBWaWV3IHtcblxuXHRcdGNvbnN0IHJlc29sdmVkT3B0aW9uczogSUVkaXRvckdyb3VwVmlld09wdGlvbnMgfCB1bmRlZmluZWQgPSB7IC4uLnRoaXMuZ2V0R3JvdXBWaWV3T3B0aW9ucygpLCAuLi5vcHRpb25zIH07XG5cblx0XHQvLyBDcmVhdGUgZ3JvdXAgdmlld1xuXHRcdGxldCBncm91cFZpZXc6IElFZGl0b3JHcm91cFZpZXc7XG5cdFx0aWYgKGZyb20gaW5zdGFuY2VvZiBFZGl0b3JHcm91cFZpZXcpIHtcblx0XHRcdGdyb3VwVmlldyA9IEVkaXRvckdyb3VwVmlldy5jcmVhdGVDb3B5KGZyb20sIHRoaXMuZWRpdG9yUGFydHNWaWV3LCB0aGlzLCB0aGlzLmdyb3Vwc0xhYmVsLCB0aGlzLmNvdW50LCB0aGlzLnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLCByZXNvbHZlZE9wdGlvbnMpO1xuXHRcdH0gZWxzZSBpZiAoaXNTZXJpYWxpemVkRWRpdG9yR3JvdXBNb2RlbChmcm9tKSkge1xuXHRcdFx0Z3JvdXBWaWV3ID0gRWRpdG9yR3JvdXBWaWV3LmNyZWF0ZUZyb21TZXJpYWxpemVkKGZyb20sIHRoaXMuZWRpdG9yUGFydHNWaWV3LCB0aGlzLCB0aGlzLmdyb3Vwc0xhYmVsLCB0aGlzLmNvdW50LCB0aGlzLnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLCByZXNvbHZlZE9wdGlvbnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRncm91cFZpZXcgPSBFZGl0b3JHcm91cFZpZXcuY3JlYXRlTmV3KHRoaXMuZWRpdG9yUGFydHNWaWV3LCB0aGlzLCB0aGlzLmdyb3Vwc0xhYmVsLCB0aGlzLmNvdW50LCB0aGlzLnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLCByZXNvbHZlZE9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdC8vIEtlZXAgaW4gbWFwXG5cdFx0dGhpcy5ncm91cFZpZXdzLnNldChncm91cFZpZXcuaWQsIGdyb3VwVmlldyk7XG5cblx0XHQvLyBUcmFjayBmb2N1c1xuXHRcdGNvbnN0IGdyb3VwRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Z3JvdXBEaXNwb3NhYmxlcy5hZGQoZ3JvdXBWaWV3Lm9uRGlkRm9jdXMoKCkgPT4ge1xuXHRcdFx0dGhpcy5kb1NldEdyb3VwQWN0aXZlKGdyb3VwVmlldyk7XG5cblx0XHRcdHRoaXMuX29uRGlkRm9jdXMuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRyYWNrIGdyb3VwIGNoYW5nZXNcblx0XHRncm91cERpc3Bvc2FibGVzLmFkZChncm91cFZpZXcub25EaWRNb2RlbENoYW5nZShlID0+IHtcblx0XHRcdHN3aXRjaCAoZS5raW5kKSB7XG5cdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfTE9DS0VEOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlR3JvdXBMb2NrZWQuZmlyZShncm91cFZpZXcpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkdST1VQX0lOREVYOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlR3JvdXBJbmRleC5maXJlKGdyb3VwVmlldyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfTEFCRUw6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VHcm91cExhYmVsLmZpcmUoZ3JvdXBWaWV3KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBUcmFjayBhY3RpdmUgZWRpdG9yIGNoYW5nZSBhZnRlciBpdCBvY2N1cnJlZFxuXHRcdGdyb3VwRGlzcG9zYWJsZXMuYWRkKGdyb3VwVmlldy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbnRhaW5lcigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRyYWNrIGRpc3Bvc2Vcblx0XHRFdmVudC5vbmNlKGdyb3VwVmlldy5vbldpbGxEaXNwb3NlKSgoKSA9PiB7XG5cdFx0XHRkaXNwb3NlKGdyb3VwRGlzcG9zYWJsZXMpO1xuXHRcdFx0dGhpcy5ncm91cFZpZXdzLmRlbGV0ZShncm91cFZpZXcuaWQpO1xuXHRcdFx0dGhpcy5kb1VwZGF0ZU1vc3RSZWNlbnRBY3RpdmUoZ3JvdXBWaWV3KTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBncm91cFZpZXc7XG5cdH1cblxuXHRwcml2YXRlIGRvU2V0R3JvdXBBY3RpdmUoZ3JvdXA6IElFZGl0b3JHcm91cFZpZXcsIHJlYXNvbiA9IEdyb3VwQWN0aXZhdGlvblJlYXNvbi5ERUZBVUxUKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2FjdGl2ZUdyb3VwICE9PSBncm91cCkge1xuXHRcdFx0Y29uc3QgcHJldmlvdXNBY3RpdmVHcm91cCA9IHRoaXMuX2FjdGl2ZUdyb3VwO1xuXHRcdFx0dGhpcy5fYWN0aXZlR3JvdXAgPSBncm91cDtcblxuXHRcdFx0Ly8gVXBkYXRlIGxpc3Qgb2YgbW9zdCByZWNlbnRseSBhY3RpdmUgZ3JvdXBzXG5cdFx0XHR0aGlzLmRvVXBkYXRlTW9zdFJlY2VudEFjdGl2ZShncm91cCwgdHJ1ZSk7XG5cblx0XHRcdC8vIE1hcmsgcHJldmlvdXMgb25lIGFzIGluYWN0aXZlXG5cdFx0XHRpZiAocHJldmlvdXNBY3RpdmVHcm91cCAmJiAhcHJldmlvdXNBY3RpdmVHcm91cC5kaXNwb3NlZCkge1xuXHRcdFx0XHRwcmV2aW91c0FjdGl2ZUdyb3VwLnNldEFjdGl2ZShmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1hcmsgZ3JvdXAgYXMgbmV3IGFjdGl2ZVxuXHRcdFx0Z3JvdXAuc2V0QWN0aXZlKHRydWUpO1xuXG5cdFx0XHQvLyBFeHBhbmQgdGhlIGdyb3VwIGlmIGl0IGlzIGN1cnJlbnRseSBtaW5pbWl6ZWRcblx0XHRcdHRoaXMuZG9SZXN0b3JlR3JvdXAoZ3JvdXApO1xuXG5cdFx0XHQvLyBFdmVudFxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVHcm91cC5maXJlKGdyb3VwKTtcblx0XHR9XG5cblx0XHQvLyBBbHdheXMgZmlyZSB0aGUgZXZlbnQgdGhhdCBhIGdyb3VwIGhhcyBiZWVuIGFjdGl2YXRlZFxuXHRcdC8vIGV2ZW4gaWYgaXRzIHRoZSBzYW1lIGdyb3VwIHRoYXQgaXMgYWxyZWFkeSBhY3RpdmUgdG9cblx0XHQvLyBzaWduYWwgdGhlIGludGVudCBldmVuIHdoZW4gbm90aGluZyBoYXMgY2hhbmdlZC5cblx0XHR0aGlzLl9vbkRpZEFjdGl2YXRlR3JvdXAuZmlyZSh7IGdyb3VwLCByZWFzb24gfSk7XG5cdH1cblxuXHRwcml2YXRlIGRvUmVzdG9yZUdyb3VwKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmdyaWRXaWRnZXQpIHtcblx0XHRcdHJldHVybjsgLy8gbWV0aG9kIGlzIGNhbGxlZCBhcyBwYXJ0IG9mIHN0YXRlIHJlc3RvcmUgdmVyeSBlYXJseVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGhpcy5oYXNNYXhpbWl6ZWRHcm91cCgpICYmICF0aGlzLmlzR3JvdXBNYXhpbWl6ZWQoZ3JvdXApKSB7XG5cdFx0XHRcdHRoaXMudW5tYXhpbWl6ZUdyb3VwKCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHZpZXdTaXplID0gdGhpcy5ncmlkV2lkZ2V0LmdldFZpZXdTaXplKGdyb3VwKTtcblx0XHRcdGlmICh2aWV3U2l6ZS53aWR0aCA9PT0gZ3JvdXAubWluaW11bVdpZHRoIHx8IHZpZXdTaXplLmhlaWdodCA9PT0gZ3JvdXAubWluaW11bUhlaWdodCkge1xuXHRcdFx0XHR0aGlzLmFycmFuZ2VHcm91cHMoR3JvdXBzQXJyYW5nZW1lbnQuRVhQQU5ELCBncm91cCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8vIGlnbm9yZTogbWV0aG9kIG1pZ2h0IGJlIGNhbGxlZCB0b28gZWFybHkgYmVmb3JlIHZpZXcgaXMga25vd24gdG8gZ3JpZFxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9VcGRhdGVNb3N0UmVjZW50QWN0aXZlKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3LCBtYWtlTW9zdFJlY2VudGx5QWN0aXZlPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5tb3N0UmVjZW50QWN0aXZlR3JvdXBzLmluZGV4T2YoZ3JvdXAuaWQpO1xuXG5cdFx0Ly8gUmVtb3ZlIGZyb20gTVJVIGxpc3Rcblx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHR0aGlzLm1vc3RSZWNlbnRBY3RpdmVHcm91cHMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHR9XG5cblx0XHQvLyBBZGQgdG8gZnJvbnQgYXMgbmVlZGVkXG5cdFx0aWYgKG1ha2VNb3N0UmVjZW50bHlBY3RpdmUpIHtcblx0XHRcdHRoaXMubW9zdFJlY2VudEFjdGl2ZUdyb3Vwcy51bnNoaWZ0KGdyb3VwLmlkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRvR3JpZFZpZXdEaXJlY3Rpb24oZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbik6IERpcmVjdGlvbiB7XG5cdFx0c3dpdGNoIChkaXJlY3Rpb24pIHtcblx0XHRcdGNhc2UgR3JvdXBEaXJlY3Rpb24uVVA6IHJldHVybiBEaXJlY3Rpb24uVXA7XG5cdFx0XHRjYXNlIEdyb3VwRGlyZWN0aW9uLkRPV046IHJldHVybiBEaXJlY3Rpb24uRG93bjtcblx0XHRcdGNhc2UgR3JvdXBEaXJlY3Rpb24uTEVGVDogcmV0dXJuIERpcmVjdGlvbi5MZWZ0O1xuXHRcdFx0Y2FzZSBHcm91cERpcmVjdGlvbi5SSUdIVDogcmV0dXJuIERpcmVjdGlvbi5SaWdodDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRvR3JpZFZpZXdPcmllbnRhdGlvbihvcmllbnRhdGlvbjogR3JvdXBPcmllbnRhdGlvbiwgZmFsbGJhY2s6IE9yaWVudGF0aW9uKTogT3JpZW50YXRpb24ge1xuXHRcdGlmICh0eXBlb2Ygb3JpZW50YXRpb24gPT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gb3JpZW50YXRpb24gPT09IEdyb3VwT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IE9yaWVudGF0aW9uLkhPUklaT05UQUwgOiBPcmllbnRhdGlvbi5WRVJUSUNBTDtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsbGJhY2s7XG5cdH1cblxuXHRyZW1vdmVHcm91cChncm91cDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBncm91cFZpZXcgPSB0aGlzLmFzc2VydEdyb3VwVmlldyhncm91cCk7XG5cdFx0aWYgKHRoaXMuY291bnQgPT09IDEpIHtcblx0XHRcdHJldHVybjsgLy8gQ2Fubm90IHJlbW92ZSB0aGUgbGFzdCByb290IGdyb3VwXG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIGVtcHR5IGdyb3VwXG5cdFx0aWYgKGdyb3VwVmlldy5pc0VtcHR5KSB7XG5cdFx0XHR0aGlzLmRvUmVtb3ZlRW1wdHlHcm91cChncm91cFZpZXcsIHByZXNlcnZlRm9jdXMpO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBncm91cCB3aXRoIGVkaXRvcnNcblx0XHRlbHNlIHtcblx0XHRcdHRoaXMuZG9SZW1vdmVHcm91cFdpdGhFZGl0b3JzKGdyb3VwVmlldyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb1JlbW92ZUdyb3VwV2l0aEVkaXRvcnMoZ3JvdXBWaWV3OiBJRWRpdG9yR3JvdXBWaWV3KTogdm9pZCB7XG5cdFx0Y29uc3QgbW9zdFJlY2VudGx5QWN0aXZlR3JvdXBzID0gdGhpcy5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpO1xuXG5cdFx0bGV0IGxhc3RBY3RpdmVHcm91cDogSUVkaXRvckdyb3VwVmlldztcblx0XHRpZiAodGhpcy5fYWN0aXZlR3JvdXAgPT09IGdyb3VwVmlldykge1xuXHRcdFx0bGFzdEFjdGl2ZUdyb3VwID0gbW9zdFJlY2VudGx5QWN0aXZlR3JvdXBzWzFdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsYXN0QWN0aXZlR3JvdXAgPSBtb3N0UmVjZW50bHlBY3RpdmVHcm91cHNbMF07XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZpbmcgYSBncm91cCB3aXRoIGVkaXRvcnMgc2hvdWxkIG1lcmdlIHRoZXNlIGVkaXRvcnMgaW50byB0aGVcblx0XHQvLyBsYXN0IGFjdGl2ZSBncm91cCBhbmQgdGhlbiByZW1vdmUgdGhpcyBncm91cC5cblx0XHR0aGlzLm1lcmdlR3JvdXAoZ3JvdXBWaWV3LCBsYXN0QWN0aXZlR3JvdXApO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1JlbW92ZUVtcHR5R3JvdXAoZ3JvdXBWaWV3OiBJRWRpdG9yR3JvdXBWaWV3LCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHJlc3RvcmVGb2N1cyA9ICFwcmVzZXJ2ZUZvY3VzICYmIHRoaXMuc2hvdWxkUmVzdG9yZUZvY3VzKHRoaXMuY29udGFpbmVyKTtcblxuXHRcdC8vIEFjdGl2YXRlIG5leHQgZ3JvdXAgaWYgdGhlIHJlbW92ZWQgb25lIHdhcyBhY3RpdmVcblx0XHRpZiAodGhpcy5fYWN0aXZlR3JvdXAgPT09IGdyb3VwVmlldykge1xuXHRcdFx0Y29uc3QgbW9zdFJlY2VudGx5QWN0aXZlR3JvdXBzID0gdGhpcy5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpO1xuXHRcdFx0Y29uc3QgbmV4dEFjdGl2ZUdyb3VwID0gbW9zdFJlY2VudGx5QWN0aXZlR3JvdXBzWzFdOyAvLyBbMF0gd2lsbCBiZSB0aGUgY3VycmVudCBncm91cCB3ZSBhcmUgYWJvdXQgdG8gZGlzcG9zZVxuXHRcdFx0dGhpcy5kb1NldEdyb3VwQWN0aXZlKG5leHRBY3RpdmVHcm91cCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIGZyb20gZ3JpZCB3aWRnZXQgJiBkaXNwb3NlXG5cdFx0dGhpcy5ncmlkV2lkZ2V0LnJlbW92ZVZpZXcoZ3JvdXBWaWV3LCB0aGlzLmdldFNwbGl0U2l6aW5nU3R5bGUoKSk7XG5cdFx0Z3JvdXBWaWV3LmRpc3Bvc2UoKTtcblxuXHRcdC8vIFJlc3RvcmUgZm9jdXMgaWYgd2UgaGFkIGl0IHByZXZpb3VzbHkgYWZ0ZXIgY29tcGxldGluZyB0aGUgZ3JpZFxuXHRcdC8vIG9wZXJhdGlvbi4gVGhhdCBvcGVyYXRpb24gbWlnaHQgY2F1c2UgcmVwYXJlbnRpbmcgb2YgZ3JpZCB2aWV3c1xuXHRcdC8vIHdoaWNoIG1vdmVzIGZvY3VzIHRvIHRoZSA8Ym9keT4gZWxlbWVudCBvdGhlcndpc2UuXG5cdFx0aWYgKHJlc3RvcmVGb2N1cykge1xuXHRcdFx0dGhpcy5fYWN0aXZlR3JvdXAuZm9jdXMoKTtcblx0XHR9XG5cblx0XHQvLyBOb3RpZnkgZ3JvdXAgaW5kZXggY2hhbmdlIGdpdmVuIGEgZ3JvdXAgd2FzIHJlbW92ZWRcblx0XHR0aGlzLm5vdGlmeUdyb3VwSW5kZXhDaGFuZ2UoKTtcblxuXHRcdC8vIFVwZGF0ZSBjb250YWluZXJcblx0XHR0aGlzLnVwZGF0ZUNvbnRhaW5lcigpO1xuXG5cdFx0Ly8gRXZlbnRcblx0XHR0aGlzLl9vbkRpZFJlbW92ZUdyb3VwLmZpcmUoZ3JvdXBWaWV3KTtcblx0fVxuXG5cdG1vdmVHcm91cChncm91cDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgbG9jYXRpb246IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIsIGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24pOiBJRWRpdG9yR3JvdXBWaWV3IHtcblx0XHRjb25zdCBzb3VyY2VWaWV3ID0gdGhpcy5hc3NlcnRHcm91cFZpZXcoZ3JvdXApO1xuXHRcdGNvbnN0IHRhcmdldFZpZXcgPSB0aGlzLmFzc2VydEdyb3VwVmlldyhsb2NhdGlvbik7XG5cblx0XHRpZiAoc291cmNlVmlldy5pZCA9PT0gdGFyZ2V0Vmlldy5pZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgbW92ZSBncm91cCBpbnRvIGl0cyBvd24nKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN0b3JlRm9jdXMgPSB0aGlzLnNob3VsZFJlc3RvcmVGb2N1cyhzb3VyY2VWaWV3LmVsZW1lbnQpO1xuXHRcdGxldCBtb3ZlZFZpZXc6IElFZGl0b3JHcm91cFZpZXc7XG5cblx0XHQvLyBTYW1lIGdyb3VwcyB2aWV3OiBtb3ZlIHZpYSBncmlkIHdpZGdldCBBUElcblx0XHRpZiAoc291cmNlVmlldy5ncm91cHNWaWV3ID09PSB0YXJnZXRWaWV3Lmdyb3Vwc1ZpZXcpIHtcblx0XHRcdHRoaXMuZ3JpZFdpZGdldC5tb3ZlVmlldyhzb3VyY2VWaWV3LCB0aGlzLmdldFNwbGl0U2l6aW5nU3R5bGUoKSwgdGFyZ2V0VmlldywgdGhpcy50b0dyaWRWaWV3RGlyZWN0aW9uKGRpcmVjdGlvbikpO1xuXHRcdFx0bW92ZWRWaWV3ID0gc291cmNlVmlldztcblx0XHR9XG5cblx0XHQvLyBEaWZmZXJlbnQgZ3JvdXBzIHZpZXc6IG1vdmUgdmlhIGdyb3VwcyB2aWV3IEFQSVxuXHRcdGVsc2Uge1xuXHRcdFx0bW92ZWRWaWV3ID0gdGFyZ2V0Vmlldy5ncm91cHNWaWV3LmFkZEdyb3VwKHRhcmdldFZpZXcsIGRpcmVjdGlvbiwgc291cmNlVmlldyk7XG5cdFx0XHRzb3VyY2VWaWV3LmNsb3NlQWxsRWRpdG9ycyh7IGZvcmNlOiB0cnVlIH0pO1xuXHRcdFx0dGhpcy5yZW1vdmVHcm91cChzb3VyY2VWaWV3LCByZXN0b3JlRm9jdXMpO1xuXHRcdH1cblxuXHRcdC8vIFJlc3RvcmUgZm9jdXMgaWYgd2UgaGFkIGl0IHByZXZpb3VzbHkgYWZ0ZXIgY29tcGxldGluZyB0aGUgZ3JpZFxuXHRcdC8vIG9wZXJhdGlvbi4gVGhhdCBvcGVyYXRpb24gbWlnaHQgY2F1c2UgcmVwYXJlbnRpbmcgb2YgZ3JpZCB2aWV3c1xuXHRcdC8vIHdoaWNoIG1vdmVzIGZvY3VzIHRvIHRoZSA8Ym9keT4gZWxlbWVudCBvdGhlcndpc2UuXG5cdFx0aWYgKHJlc3RvcmVGb2N1cykge1xuXHRcdFx0bW92ZWRWaWV3LmZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRXZlbnRcblx0XHR0aGlzLl9vbkRpZE1vdmVHcm91cC5maXJlKG1vdmVkVmlldyk7XG5cblx0XHQvLyBOb3RpZnkgZ3JvdXAgaW5kZXggY2hhbmdlIGdpdmVuIGEgZ3JvdXAgd2FzIG1vdmVkXG5cdFx0dGhpcy5ub3RpZnlHcm91cEluZGV4Q2hhbmdlKCk7XG5cblx0XHRyZXR1cm4gbW92ZWRWaWV3O1xuXHR9XG5cblx0Y29weUdyb3VwKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyLCBsb2NhdGlvbjogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbik6IElFZGl0b3JHcm91cFZpZXcge1xuXHRcdGNvbnN0IGdyb3VwVmlldyA9IHRoaXMuYXNzZXJ0R3JvdXBWaWV3KGdyb3VwKTtcblx0XHRjb25zdCBsb2NhdGlvblZpZXcgPSB0aGlzLmFzc2VydEdyb3VwVmlldyhsb2NhdGlvbik7XG5cblx0XHRjb25zdCByZXN0b3JlRm9jdXMgPSB0aGlzLnNob3VsZFJlc3RvcmVGb2N1cyhncm91cFZpZXcuZWxlbWVudCk7XG5cblx0XHQvLyBDb3B5IHRoZSBncm91cCB2aWV3XG5cdFx0Y29uc3QgY29waWVkR3JvdXBWaWV3ID0gdGhpcy5hZGRHcm91cChsb2NhdGlvblZpZXcsIGRpcmVjdGlvbiwgZ3JvdXBWaWV3KTtcblxuXHRcdC8vIFJlc3RvcmUgZm9jdXMgaWYgd2UgaGFkIGl0XG5cdFx0aWYgKHJlc3RvcmVGb2N1cykge1xuXHRcdFx0Y29waWVkR3JvdXBWaWV3LmZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvcGllZEdyb3VwVmlldztcblx0fVxuXG5cdG1lcmdlR3JvdXAoZ3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIsIHRhcmdldDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgb3B0aW9ucz86IElNZXJnZUdyb3VwT3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNvdXJjZVZpZXcgPSB0aGlzLmFzc2VydEdyb3VwVmlldyhncm91cCk7XG5cdFx0Y29uc3QgdGFyZ2V0VmlldyA9IHRoaXMuYXNzZXJ0R3JvdXBWaWV3KHRhcmdldCk7XG5cblx0XHQvLyBDb2xsZWN0IGVkaXRvcnMgdG8gbW92ZS9jb3B5XG5cdFx0Y29uc3QgZWRpdG9yczogRWRpdG9ySW5wdXRXaXRoT3B0aW9uc1tdID0gW107XG5cdFx0bGV0IGluZGV4ID0gKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMuaW5kZXggPT09ICdudW1iZXInKSA/IG9wdGlvbnMuaW5kZXggOiB0YXJnZXRWaWV3LmNvdW50O1xuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIHNvdXJjZVZpZXcuZWRpdG9ycykge1xuXHRcdFx0Y29uc3QgaW5hY3RpdmUgPSAhc291cmNlVmlldy5pc0FjdGl2ZShlZGl0b3IpIHx8IHRoaXMuX2FjdGl2ZUdyb3VwICE9PSBzb3VyY2VWaWV3O1xuXG5cdFx0XHRsZXQgYWN0dWFsSW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0YXJnZXRWaWV3LmNvbnRhaW5zKGVkaXRvcikgJiZcblx0XHRcdFx0KFxuXHRcdFx0XHRcdC8vIERvIG5vdCBjb25maWd1cmUgYW4gYGluZGV4YCBmb3IgZWRpdG9ycyB0aGF0IGFyZSBzdGlja3kgaW5cblx0XHRcdFx0XHQvLyB0aGUgdGFyZ2V0LCBvdGhlcndpc2UgdGhlcmUgaXMgYSBjaGFuY2Ugb2YgbG9zaW5nIHRoYXQgc3RhdGVcblx0XHRcdFx0XHQvLyB3aGVuIHRoZSBlZGl0b3IgaXMgbW92ZWQuXG5cdFx0XHRcdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMzk1NDlcblx0XHRcdFx0XHR0YXJnZXRWaWV3LmlzU3RpY2t5KGVkaXRvcikgfHxcblx0XHRcdFx0XHQvLyBEbyBub3QgY29uZmlndXJlIGFuIGBpbmRleGAgd2hlbiB3ZSBhcmUgZXhwbGljaXRseSBpbnN0cnVjdGVkXG5cdFx0XHRcdFx0b3B0aW9ucz8ucHJlc2VydmVFeGlzdGluZ0luZGV4XG5cdFx0XHRcdClcblx0XHRcdCkge1xuXHRcdFx0XHQvLyBsZWF2ZSBgaW5kZXhgIGFzIGB1bmRlZmluZWRgXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhY3R1YWxJbmRleCA9IGluZGV4O1xuXHRcdFx0XHRpbmRleCsrO1xuXHRcdFx0fVxuXG5cdFx0XHRlZGl0b3JzLnB1c2goe1xuXHRcdFx0XHRlZGl0b3IsXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRpbmRleDogYWN0dWFsSW5kZXgsXG5cdFx0XHRcdFx0aW5hY3RpdmUsXG5cdFx0XHRcdFx0cHJlc2VydmVGb2N1czogaW5hY3RpdmVcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gTW92ZS9Db3B5IGVkaXRvcnMgb3ZlciBpbnRvIHRhcmdldFxuXHRcdGxldCByZXN1bHQgPSB0cnVlO1xuXHRcdGlmIChvcHRpb25zPy5tb2RlID09PSBNZXJnZUdyb3VwTW9kZS5DT1BZX0VESVRPUlMpIHtcblx0XHRcdHNvdXJjZVZpZXcuY29weUVkaXRvcnMoZWRpdG9ycywgdGFyZ2V0Vmlldyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdCA9IHNvdXJjZVZpZXcubW92ZUVkaXRvcnMoZWRpdG9ycywgdGFyZ2V0Vmlldyk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIHNvdXJjZSBpZiB0aGUgdmlldyBpcyBub3cgZW1wdHkgYW5kIG5vdCBhbHJlYWR5IHJlbW92ZWRcblx0XHRpZiAoc291cmNlVmlldy5pc0VtcHR5ICYmICFzb3VyY2VWaWV3LmRpc3Bvc2VkIC8qIGNvdWxkIGhhdmUgYmVlbiBkaXNwb3NlZCBhbHJlYWR5IHZpYSB3b3JrYmVuY2guZWRpdG9yLmNsb3NlRW1wdHlHcm91cHMgc2V0dGluZyAqLykge1xuXHRcdFx0dGhpcy5yZW1vdmVHcm91cChzb3VyY2VWaWV3LCB0cnVlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0bWVyZ2VBbGxHcm91cHModGFyZ2V0OiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyLCBvcHRpb25zPzogSU1lcmdlR3JvdXBPcHRpb25zKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdGFyZ2V0VmlldyA9IHRoaXMuYXNzZXJ0R3JvdXBWaWV3KHRhcmdldCk7XG5cblx0XHRsZXQgcmVzdWx0ID0gdHJ1ZTtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKSkge1xuXHRcdFx0aWYgKGdyb3VwID09PSB0YXJnZXRWaWV3KSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBrZWVwIHRhcmdldFxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtZXJnZWQgPSB0aGlzLm1lcmdlR3JvdXAoZ3JvdXAsIHRhcmdldFZpZXcsIG9wdGlvbnMpO1xuXHRcdFx0aWYgKCFtZXJnZWQpIHtcblx0XHRcdFx0cmVzdWx0ID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3NlcnRHcm91cFZpZXcoZ3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIpOiBJRWRpdG9yR3JvdXBWaWV3IHtcblx0XHRsZXQgZ3JvdXBWaWV3OiBJRWRpdG9yR3JvdXBWaWV3IHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0eXBlb2YgZ3JvdXAgPT09ICdudW1iZXInKSB7XG5cdFx0XHRncm91cFZpZXcgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5nZXRHcm91cChncm91cCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGdyb3VwVmlldyA9IGdyb3VwO1xuXHRcdH1cblxuXHRcdGlmICghZ3JvdXBWaWV3KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZWRpdG9yIGdyb3VwIHByb3ZpZGVkIScpO1xuXHRcdH1cblxuXHRcdHJldHVybiBncm91cFZpZXc7XG5cdH1cblxuXHRjcmVhdGVFZGl0b3JEcm9wVGFyZ2V0KGNvbnRhaW5lcjogdW5rbm93biwgZGVsZWdhdGU6IElFZGl0b3JEcm9wVGFyZ2V0RGVsZWdhdGUpOiBJRGlzcG9zYWJsZSB7XG5cdFx0YXNzZXJ0VHlwZShpc0hUTUxFbGVtZW50KGNvbnRhaW5lcikpO1xuXG5cdFx0cmV0dXJuIHRoaXMuc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yRHJvcFRhcmdldCwgdGhpcywgY29udGFpbmVyLCBkZWxlZ2F0ZSk7XG5cdH1cblxuXHQvLyNyZWdpb24gUGFydFxuXG5cdC8vIFRPRE8gQHNiYXR0ZW4gQGpvYW8gZmluZCBzb21ldGhpbmcgYmV0dGVyIHRvIHByZXZlbnQgZWRpdG9yIHRha2luZyBvdmVyICM3OTg5N1xuXHRnZXQgbWluaW11bVdpZHRoKCk6IG51bWJlciB7IHJldHVybiBNYXRoLm1pbih0aGlzLmNlbnRlcmVkTGF5b3V0V2lkZ2V0Lm1pbmltdW1XaWR0aCwgdGhpcy5sYXlvdXRTZXJ2aWNlLmdldE1heGltdW1FZGl0b3JEaW1lbnNpb25zKHRoaXMubGF5b3V0U2VydmljZS5nZXRDb250YWluZXIoZ2V0V2luZG93KHRoaXMuY29udGFpbmVyKSkpLndpZHRoKTsgfVxuXHRnZXQgbWF4aW11bVdpZHRoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLmNlbnRlcmVkTGF5b3V0V2lkZ2V0Lm1heGltdW1XaWR0aDsgfVxuXHRnZXQgbWluaW11bUhlaWdodCgpOiBudW1iZXIgeyByZXR1cm4gTWF0aC5taW4odGhpcy5jZW50ZXJlZExheW91dFdpZGdldC5taW5pbXVtSGVpZ2h0LCB0aGlzLmxheW91dFNlcnZpY2UuZ2V0TWF4aW11bUVkaXRvckRpbWVuc2lvbnModGhpcy5sYXlvdXRTZXJ2aWNlLmdldENvbnRhaW5lcihnZXRXaW5kb3codGhpcy5jb250YWluZXIpKSkuaGVpZ2h0KTsgfVxuXHRnZXQgbWF4aW11bUhlaWdodCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5jZW50ZXJlZExheW91dFdpZGdldC5tYXhpbXVtSGVpZ2h0OyB9XG5cblx0Z2V0IHNuYXAoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLmxheW91dFNlcnZpY2UuZ2V0UGFuZWxBbGlnbm1lbnQoKSA9PT0gJ2NlbnRlcic7IH1cblxuXHRvdmVycmlkZSBnZXQgb25EaWRDaGFuZ2UoKTogRXZlbnQ8SVZpZXdTaXplIHwgdW5kZWZpbmVkPiB7IHJldHVybiBFdmVudC5hbnkodGhpcy5jZW50ZXJlZExheW91dFdpZGdldC5vbkRpZENoYW5nZSwgdGhpcy5vbkRpZFNldEdyaWRXaWRnZXQuZXZlbnQpOyB9XG5cdHJlYWRvbmx5IHByaW9yaXR5OiBMYXlvdXRQcmlvcml0eSA9IExheW91dFByaW9yaXR5LkhpZ2g7XG5cblx0cHJpdmF0ZSBnZXQgZ3JpZFNlcGFyYXRvckJvcmRlcigpOiBDb2xvciB7XG5cdFx0cmV0dXJuIHRoaXMudGhlbWUuZ2V0Q29sb3IoRURJVE9SX0dST1VQX0JPUkRFUikgfHwgdGhpcy50aGVtZS5nZXRDb2xvcihjb250cmFzdEJvcmRlcikgfHwgQ29sb3IudHJhbnNwYXJlbnQ7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVTdHlsZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gdGhpcy5nZXRDb2xvcihlZGl0b3JCYWNrZ3JvdW5kKSB8fCAnJztcblxuXHRcdGNvbnN0IHNlcGFyYXRvckJvcmRlclN0eWxlID0geyBzZXBhcmF0b3JCb3JkZXI6IHRoaXMuZ3JpZFNlcGFyYXRvckJvcmRlciwgYmFja2dyb3VuZDogdGhpcy50aGVtZS5nZXRDb2xvcihFRElUT1JfUEFORV9CQUNLR1JPVU5EKSB8fCBDb2xvci50cmFuc3BhcmVudCB9O1xuXHRcdHRoaXMuZ3JpZFdpZGdldC5zdHlsZShzZXBhcmF0b3JCb3JkZXJTdHlsZSk7XG5cdFx0dGhpcy5jZW50ZXJlZExheW91dFdpZGdldC5zdHlsZXMoc2VwYXJhdG9yQm9yZGVyU3R5bGUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUNvbnRlbnRBcmVhKHBhcmVudDogSFRNTEVsZW1lbnQsIG9wdGlvbnM/OiBJRWRpdG9yUGFydENyZWF0aW9uT3B0aW9ucyk6IEhUTUxFbGVtZW50IHtcblxuXHRcdC8vIENvbnRhaW5lclxuXHRcdHRoaXMuZWxlbWVudCA9IHBhcmVudDtcblx0XHRpZiAodGhpcy53aW5kb3dJZCAhPT0gbWFpbldpbmRvdy52c2NvZGVXaW5kb3dJZCkge1xuXHRcdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnYXV4aWxpYXJ5Jyk7XG5cdFx0fVxuXHRcdHBhcmVudC5hcHBlbmRDaGlsZCh0aGlzLmNvbnRhaW5lcik7XG5cblx0XHQvLyBHcmlkIGNvbnRyb2xcblx0XHR0aGlzLl93aWxsUmVzdG9yZVN0YXRlID0gIW9wdGlvbnMgfHwgb3B0aW9ucy5yZXN0b3JlUHJldmlvdXNTdGF0ZTtcblx0XHR0aGlzLmRvQ3JlYXRlR3JpZENvbnRyb2woKTtcblxuXHRcdC8vIENlbnRlcmVkIGxheW91dCB3aWRnZXRcblx0XHR0aGlzLmNlbnRlcmVkTGF5b3V0V2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IENlbnRlcmVkVmlld0xheW91dCh0aGlzLmNvbnRhaW5lciwgdGhpcy5ncmlkV2lkZ2V0VmlldywgdGhpcy5wcm9maWxlTWVtZW50b1tFZGl0b3JQYXJ0LkVESVRPUl9QQVJUX0NFTlRFUkVEX1ZJRVdfU1RPUkFHRV9LRVldLCB0aGlzLl9wYXJ0T3B0aW9ucy5jZW50ZXJlZExheW91dEZpeGVkV2lkdGgpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlRWRpdG9yUGFydE9wdGlvbnMoZSA9PiB0aGlzLmNlbnRlcmVkTGF5b3V0V2lkZ2V0LnNldEZpeGVkV2lkdGgoZS5uZXdQYXJ0T3B0aW9ucy5jZW50ZXJlZExheW91dEZpeGVkV2lkdGggPz8gZmFsc2UpKSk7XG5cblx0XHQvLyBEcmFnICYgRHJvcCBzdXBwb3J0XG5cdFx0dGhpcy5zZXR1cERyYWdBbmREcm9wU3VwcG9ydChwYXJlbnQsIHRoaXMuY29udGFpbmVyKTtcblxuXHRcdC8vIENvbnRleHQga2V5c1xuXHRcdHRoaXMuaGFuZGxlQ29udGV4dEtleXMoKTtcblxuXHRcdC8vIFNpZ25hbCByZWFkeVxuXHRcdHRoaXMud2hlblJlYWR5UHJvbWlzZS5jb21wbGV0ZSgpO1xuXHRcdHRoaXMuX2lzUmVhZHkgPSB0cnVlO1xuXG5cdFx0Ly8gU2lnbmFsIHJlc3RvcmVkXG5cdFx0UHJvbWlzZXMuc2V0dGxlZCh0aGlzLmdyb3Vwcy5tYXAoZ3JvdXAgPT4gZ3JvdXAud2hlblJlc3RvcmVkKSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHR0aGlzLndoZW5SZXN0b3JlZFByb21pc2UuY29tcGxldGUoKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiB0aGlzLmNvbnRhaW5lcjtcblx0fVxuXG5cdHByb3RlY3RlZCBoYW5kbGVDb250ZXh0S2V5cygpOiB2b2lkIHtcblx0XHQvLyBCaW5kIGBlZGl0b3JBcmVhRm9jdXNgIHRvIHRoZSBlZGl0b3IgcGFydCdzIHNjb3BlZCBjb250ZXh0IGtleSBzZXJ2aWNlIHNvXG5cdFx0Ly8gaXQgZXZhbHVhdGVzIHRvIGB0cnVlYCBvbmx5IHdoZW4ga2V5Ym9hcmQgZm9jdXMgaXMgd2l0aGluIHRoZSBlZGl0b3IgYXJlYS5cblx0XHQvLyBBcHBsaWVzIHRvIGFsbCBlZGl0b3IgcGFydHMgKG1haW4sIG1vZGFsLCBhdXhpbGlhcnkpIHNvIGNhbGxlcnMgY2FuIGdhdGVcblx0XHQvLyBzaG9ydGN1dHMgb24gZm9jdXMgYmVpbmcgaW4gYW55IGVkaXRvciBhcmVhIHJlZ2FyZGxlc3Mgb2Ygd2hpY2ggcGFydC5cblx0XHRFZGl0b3JBcmVhRm9jdXNDb250ZXh0LmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKS5zZXQodHJ1ZSk7XG5cblx0XHRjb25zdCBtdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHQgPSBFZGl0b3JQYXJ0TXVsdGlwbGVFZGl0b3JHcm91cHNDb250ZXh0LmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBtYXhpbWl6ZWRFZGl0b3JHcm91cENvbnRleHQgPSBFZGl0b3JQYXJ0TWF4aW1pemVkRWRpdG9yR3JvdXBDb250ZXh0LmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JUYWJzVmlzaWJsZUNvbnRleHQgPSBFZGl0b3JUYWJzVmlzaWJsZUNvbnRleHQuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdXBkYXRlQ29udGV4dEtleXMgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBncm91cENvdW50ID0gdGhpcy5jb3VudDtcblx0XHRcdGlmIChncm91cENvdW50ID4gMSkge1xuXHRcdFx0XHRtdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHQuc2V0KHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bXVsdGlwbGVFZGl0b3JHcm91cHNDb250ZXh0LnJlc2V0KCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmhhc01heGltaXplZEdyb3VwKCkpIHtcblx0XHRcdFx0bWF4aW1pemVkRWRpdG9yR3JvdXBDb250ZXh0LnNldCh0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1heGltaXplZEVkaXRvckdyb3VwQ29udGV4dC5yZXNldCgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCB1cGRhdGVFZGl0b3JUYWJzVmlzaWJsZUNvbnRleHQgPSAoKSA9PiB7XG5cdFx0XHRlZGl0b3JUYWJzVmlzaWJsZUNvbnRleHQuc2V0KHRoaXMucGFydE9wdGlvbnMuc2hvd1RhYnMgPT09ICdtdWx0aXBsZScpO1xuXHRcdH07XG5cblx0XHRjb25zdCB1cGRhdGVUb3BSaWdodEdyb3VwQ29udGV4dEtleSA9ICgpID0+IHtcblx0XHRcdGlmICghdGhpcy5ncmlkV2lkZ2V0IHx8ICF0aGlzLl9jb250ZW50RGltZW5zaW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHRvcFJpZ2h0R3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCB1bmRlZmluZWQ7XG5cdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZ3JvdXBzKSB7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHR0aGlzLmdyaWRXaWRnZXQuZ2V0TmVpZ2hib3JWaWV3cyhncm91cCwgRGlyZWN0aW9uLlVwKS5sZW5ndGggPT09IDAgJiZcblx0XHRcdFx0XHR0aGlzLmdyaWRXaWRnZXQuZ2V0TmVpZ2hib3JWaWV3cyhncm91cCwgRGlyZWN0aW9uLlJpZ2h0KS5sZW5ndGggPT09IDBcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0dG9wUmlnaHRHcm91cCA9IGdyb3VwO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5ncm91cHMpIHtcblx0XHRcdFx0Y29uc3QgY29udGV4dEtleSA9IHRoaXMuZWRpdG9yUGFydHNWaWV3LmJpbmQoSXNUb3BSaWdodEVkaXRvckdyb3VwQ29udGV4dCwgZ3JvdXApO1xuXHRcdFx0XHRjb250ZXh0S2V5LnNldChncm91cCA9PT0gdG9wUmlnaHRHcm91cCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHVwZGF0ZUNvbnRleHRLZXlzKCk7XG5cdFx0dXBkYXRlRWRpdG9yVGFic1Zpc2libGVDb250ZXh0KCk7XG5cdFx0dXBkYXRlVG9wUmlnaHRHcm91cENvbnRleHRLZXkoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRBZGRHcm91cCgoKSA9PiB7XG5cdFx0XHR1cGRhdGVDb250ZXh0S2V5cygpO1xuXHRcdFx0dXBkYXRlVG9wUmlnaHRHcm91cENvbnRleHRLZXkoKTtcblx0XHRcdHRoaXMuYXBwbHlDb250ZW50UmlnaHRJbnNldCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkUmVtb3ZlR3JvdXAoKCkgPT4ge1xuXHRcdFx0dXBkYXRlQ29udGV4dEtleXMoKTtcblx0XHRcdHVwZGF0ZVRvcFJpZ2h0R3JvdXBDb250ZXh0S2V5KCk7XG5cdFx0XHR0aGlzLmFwcGx5Q29udGVudFJpZ2h0SW5zZXQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUdyb3VwTWF4aW1pemVkKCgpID0+IHtcblx0XHRcdHVwZGF0ZUNvbnRleHRLZXlzKCk7XG5cdFx0XHR0aGlzLmFwcGx5Q29udGVudFJpZ2h0SW5zZXQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUVkaXRvclBhcnRPcHRpb25zKCgpID0+IHVwZGF0ZUVkaXRvclRhYnNWaXNpYmxlQ29udGV4dCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZE1vdmVHcm91cCgoKSA9PiB7XG5cdFx0XHR1cGRhdGVUb3BSaWdodEdyb3VwQ29udGV4dEtleSgpO1xuXHRcdFx0dGhpcy5hcHBseUNvbnRlbnRSaWdodEluc2V0KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRMYXlvdXQoKCkgPT4gdXBkYXRlVG9wUmlnaHRHcm91cENvbnRleHRLZXkoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXR1cERyYWdBbmREcm9wU3VwcG9ydChwYXJlbnQ6IEhUTUxFbGVtZW50LCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cblx0XHQvLyBFZGl0b3IgZHJvcCB0YXJnZXRcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZUVkaXRvckRyb3BUYXJnZXQoY29udGFpbmVyLCBPYmplY3QuY3JlYXRlKG51bGwpKSk7XG5cblx0XHQvLyBObyBkcm9wIGluIHRoZSBlZGl0b3Jcblx0XHRjb25zdCBvdmVybGF5ID0gJCgnLmRyb3AtYmxvY2stb3ZlcmxheScpO1xuXHRcdHBhcmVudC5hcHBlbmRDaGlsZChvdmVybGF5KTtcblxuXHRcdC8vIEhpZGUgdGhlIGJsb2NrIGlmIGEgbW91c2UgZG93biBldmVudCBvY2N1cnMgIzk5MDY1XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lcihvdmVybGF5LCAoKSA9PiBvdmVybGF5LmNsYXNzTGlzdC5yZW1vdmUoJ3Zpc2libGUnKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoQ29tcG9zaXRlRHJhZ0FuZERyb3BPYnNlcnZlci5JTlNUQU5DRS5yZWdpc3RlclRhcmdldCh0aGlzLmVsZW1lbnQsIHtcblx0XHRcdG9uRHJhZ1N0YXJ0OiBlID0+IG92ZXJsYXkuY2xhc3NMaXN0LmFkZCgndmlzaWJsZScpLFxuXHRcdFx0b25EcmFnRW5kOiBlID0+IG92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZSgndmlzaWJsZScpXG5cdFx0fSkpO1xuXG5cdFx0bGV0IGhvcml6b250YWxPcGVuZXJUaW1lb3V0OiBUaW1lb3V0IHwgdW5kZWZpbmVkO1xuXHRcdGxldCB2ZXJ0aWNhbE9wZW5lclRpbWVvdXQ6IFRpbWVvdXQgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGxhc3RPcGVuSG9yaXpvbnRhbFBvc2l0aW9uOiBQb3NpdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgbGFzdE9wZW5WZXJ0aWNhbFBvc2l0aW9uOiBQb3NpdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBvcGVuUGFydEF0UG9zaXRpb24gPSAocG9zaXRpb246IFBvc2l0aW9uKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMubGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuUEFORUxfUEFSVCkgJiYgcG9zaXRpb24gPT09IHRoaXMubGF5b3V0U2VydmljZS5nZXRQYW5lbFBvc2l0aW9uKCkpIHtcblx0XHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4oZmFsc2UsIFBhcnRzLlBBTkVMX1BBUlQpO1xuXHRcdFx0fSBlbHNlIGlmICghdGhpcy5sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkgJiYgcG9zaXRpb24gPT09ICh0aGlzLmxheW91dFNlcnZpY2UuZ2V0U2lkZUJhclBvc2l0aW9uKCkgPT09IFBvc2l0aW9uLlJJR0hUID8gUG9zaXRpb24uTEVGVCA6IFBvc2l0aW9uLlJJR0hUKSkge1xuXHRcdFx0XHR0aGlzLmxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbihmYWxzZSwgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBjbGVhckFsbFRpbWVvdXRzID0gKCkgPT4ge1xuXHRcdFx0aWYgKGhvcml6b250YWxPcGVuZXJUaW1lb3V0KSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dChob3Jpem9udGFsT3BlbmVyVGltZW91dCk7XG5cdFx0XHRcdGhvcml6b250YWxPcGVuZXJUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodmVydGljYWxPcGVuZXJUaW1lb3V0KSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh2ZXJ0aWNhbE9wZW5lclRpbWVvdXQpO1xuXHRcdFx0XHR2ZXJ0aWNhbE9wZW5lclRpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbXBvc2l0ZURyYWdBbmREcm9wT2JzZXJ2ZXIuSU5TVEFOQ0UucmVnaXN0ZXJUYXJnZXQob3ZlcmxheSwge1xuXHRcdFx0b25EcmFnT3ZlcjogZSA9PiB7XG5cdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZS5ldmVudERhdGEsIHRydWUpO1xuXHRcdFx0XHRpZiAoZS5ldmVudERhdGEuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRcdFx0ZS5ldmVudERhdGEuZGF0YVRyYW5zZmVyLmRyb3BFZmZlY3QgPSAnbm9uZSc7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBib3VuZGluZ1JlY3QgPSBvdmVybGF5LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG5cdFx0XHRcdGxldCBvcGVuSG9yaXpvbnRhbFBvc2l0aW9uOiBQb3NpdGlvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0bGV0IG9wZW5WZXJ0aWNhbFBvc2l0aW9uOiBQb3NpdGlvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgcHJveGltaXR5ID0gMTAwO1xuXHRcdFx0XHRpZiAoZS5ldmVudERhdGEuY2xpZW50WCA8IGJvdW5kaW5nUmVjdC5sZWZ0ICsgcHJveGltaXR5KSB7XG5cdFx0XHRcdFx0b3Blbkhvcml6b250YWxQb3NpdGlvbiA9IFBvc2l0aW9uLkxFRlQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZS5ldmVudERhdGEuY2xpZW50WCA+IGJvdW5kaW5nUmVjdC5yaWdodCAtIHByb3hpbWl0eSkge1xuXHRcdFx0XHRcdG9wZW5Ib3Jpem9udGFsUG9zaXRpb24gPSBQb3NpdGlvbi5SSUdIVDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChlLmV2ZW50RGF0YS5jbGllbnRZID4gYm91bmRpbmdSZWN0LmJvdHRvbSAtIHByb3hpbWl0eSkge1xuXHRcdFx0XHRcdG9wZW5WZXJ0aWNhbFBvc2l0aW9uID0gUG9zaXRpb24uQk9UVE9NO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGUuZXZlbnREYXRhLmNsaWVudFkgPCBib3VuZGluZ1JlY3QudG9wICsgcHJveGltaXR5KSB7XG5cdFx0XHRcdFx0b3BlblZlcnRpY2FsUG9zaXRpb24gPSBQb3NpdGlvbi5UT1A7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaG9yaXpvbnRhbE9wZW5lclRpbWVvdXQgJiYgb3Blbkhvcml6b250YWxQb3NpdGlvbiAhPT0gbGFzdE9wZW5Ib3Jpem9udGFsUG9zaXRpb24pIHtcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQoaG9yaXpvbnRhbE9wZW5lclRpbWVvdXQpO1xuXHRcdFx0XHRcdGhvcml6b250YWxPcGVuZXJUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHZlcnRpY2FsT3BlbmVyVGltZW91dCAmJiBvcGVuVmVydGljYWxQb3NpdGlvbiAhPT0gbGFzdE9wZW5WZXJ0aWNhbFBvc2l0aW9uKSB7XG5cdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KHZlcnRpY2FsT3BlbmVyVGltZW91dCk7XG5cdFx0XHRcdFx0dmVydGljYWxPcGVuZXJUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFob3Jpem9udGFsT3BlbmVyVGltZW91dCAmJiBvcGVuSG9yaXpvbnRhbFBvc2l0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRsYXN0T3Blbkhvcml6b250YWxQb3NpdGlvbiA9IG9wZW5Ib3Jpem9udGFsUG9zaXRpb247XG5cdFx0XHRcdFx0aG9yaXpvbnRhbE9wZW5lclRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IG9wZW5QYXJ0QXRQb3NpdGlvbihvcGVuSG9yaXpvbnRhbFBvc2l0aW9uKSwgMjAwKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghdmVydGljYWxPcGVuZXJUaW1lb3V0ICYmIG9wZW5WZXJ0aWNhbFBvc2l0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRsYXN0T3BlblZlcnRpY2FsUG9zaXRpb24gPSBvcGVuVmVydGljYWxQb3NpdGlvbjtcblx0XHRcdFx0XHR2ZXJ0aWNhbE9wZW5lclRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IG9wZW5QYXJ0QXRQb3NpdGlvbihvcGVuVmVydGljYWxQb3NpdGlvbiksIDIwMCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRvbkRyYWdMZWF2ZTogKCkgPT4gY2xlYXJBbGxUaW1lb3V0cygpLFxuXHRcdFx0b25EcmFnRW5kOiAoKSA9PiBjbGVhckFsbFRpbWVvdXRzKCksXG5cdFx0XHRvbkRyb3A6ICgpID0+IGNsZWFyQWxsVGltZW91dHMoKVxuXHRcdH0pKTtcblxuXHRcdC8vIE1ha2Ugc3VyZSBwZW5kaW5nIG9wZW5lciB0aW1lb3V0cyBhcmUgY2xlYXJlZCB3aGVuIHRoZSBwYXJ0IGlzIGRpc3Bvc2VkXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IGNsZWFyQWxsVGltZW91dHMoKSkpO1xuXHR9XG5cblx0Y2VudGVyTGF5b3V0KGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuY2VudGVyZWRMYXlvdXRXaWRnZXQuYWN0aXZhdGUoYWN0aXZlKTtcblx0fVxuXG5cdGlzTGF5b3V0Q2VudGVyZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuY2VudGVyZWRMYXlvdXRXaWRnZXQpIHtcblx0XHRcdHJldHVybiB0aGlzLmNlbnRlcmVkTGF5b3V0V2lkZ2V0LmlzQWN0aXZlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0NyZWF0ZUdyaWRDb250cm9sKCk6IHZvaWQge1xuXG5cdFx0Ly8gR3JpZCBXaWRnZXQgKHdpdGggcHJldmlvdXMgVUkgc3RhdGUpXG5cdFx0bGV0IHJlc3RvcmVFcnJvciA9IGZhbHNlO1xuXHRcdGlmICh0aGlzLl93aWxsUmVzdG9yZVN0YXRlKSB7XG5cdFx0XHRyZXN0b3JlRXJyb3IgPSAhdGhpcy5kb0NyZWF0ZUdyaWRDb250cm9sV2l0aFByZXZpb3VzU3RhdGUoKTtcblx0XHR9XG5cblx0XHQvLyBHcmlkIFdpZGdldCAobm8gcHJldmlvdXMgVUkgc3RhdGUgb3IgZmFpbGVkIHRvIHJlc3RvcmUpXG5cdFx0aWYgKCF0aGlzLmdyaWRXaWRnZXQgfHwgcmVzdG9yZUVycm9yKSB7XG5cdFx0XHRjb25zdCBpbml0aWFsR3JvdXAgPSB0aGlzLmRvQ3JlYXRlR3JvdXBWaWV3KCk7XG5cdFx0XHR0aGlzLmRvU2V0R3JpZFdpZGdldChuZXcgU2VyaWFsaXphYmxlR3JpZChpbml0aWFsR3JvdXApKTtcblxuXHRcdFx0Ly8gRW5zdXJlIGEgZ3JvdXAgaXMgYWN0aXZlXG5cdFx0XHR0aGlzLmRvU2V0R3JvdXBBY3RpdmUoaW5pdGlhbEdyb3VwKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgY29udGFpbmVyXG5cdFx0dGhpcy51cGRhdGVDb250YWluZXIoKTtcblxuXHRcdC8vIE5vdGlmeSBncm91cCBpbmRleCBjaGFuZ2Ugd2UgY3JlYXRlZCB0aGUgZW50aXJlIGdyaWRcblx0XHR0aGlzLm5vdGlmeUdyb3VwSW5kZXhDaGFuZ2UoKTtcblx0fVxuXG5cdHByaXZhdGUgZG9DcmVhdGVHcmlkQ29udHJvbFdpdGhQcmV2aW91c1N0YXRlKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHN0YXRlOiBJRWRpdG9yUGFydFVJU3RhdGUgfCB1bmRlZmluZWQgPSB0aGlzLmxvYWRTdGF0ZSgpO1xuXHRcdGlmIChzdGF0ZT8uc2VyaWFsaXplZEdyaWQpIHtcblx0XHRcdHRyeSB7XG5cblx0XHRcdFx0Ly8gTVJVXG5cdFx0XHRcdHRoaXMubW9zdFJlY2VudEFjdGl2ZUdyb3VwcyA9IHN0YXRlLm1vc3RSZWNlbnRBY3RpdmVHcm91cHM7XG5cblx0XHRcdFx0Ly8gR3JpZCBXaWRnZXRcblx0XHRcdFx0dGhpcy5kb0NyZWF0ZUdyaWRDb250cm9sV2l0aFN0YXRlKHN0YXRlLnNlcmlhbGl6ZWRHcmlkLCBzdGF0ZS5hY3RpdmVHcm91cCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXG5cdFx0XHRcdC8vIExvZyBlcnJvclxuXHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihuZXcgRXJyb3IoYEVycm9yIHJlc3RvcmluZyBlZGl0b3IgZ3JpZCB3aWRnZXQ6ICR7ZXJyb3J9ICh3aXRoIHN0YXRlOiAke0pTT04uc3RyaW5naWZ5KHN0YXRlKX0pYCkpO1xuXG5cdFx0XHRcdC8vIENsZWFyIGFueSBzdGF0ZSB3ZSBoYXZlIGZyb20gdGhlIGZhaWxpbmcgcmVzdG9yZVxuXHRcdFx0XHR0aGlzLmRpc3Bvc2VHcm91cHMoKTtcblxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7IC8vIGZhaWx1cmVcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTsgLy8gc3VjY2Vzc1xuXHR9XG5cblx0cHJpdmF0ZSBkb0NyZWF0ZUdyaWRDb250cm9sV2l0aFN0YXRlKHNlcmlhbGl6ZWRHcmlkOiBJU2VyaWFsaXplZEdyaWQsIGFjdGl2ZUdyb3VwSWQ6IEdyb3VwSWRlbnRpZmllciwgZWRpdG9yR3JvdXBWaWV3c1RvUmV1c2U/OiBJRWRpdG9yR3JvdXBWaWV3W10sIG9wdGlvbnM/OiBJRWRpdG9yR3JvdXBWaWV3T3B0aW9ucyk6IHZvaWQge1xuXG5cdFx0Ly8gRGV0ZXJtaW5lIGdyb3VwIHZpZXdzIHRvIHJldXNlIGlmIGFueVxuXHRcdGxldCByZXVzZUdyb3VwVmlld3M6IElFZGl0b3JHcm91cFZpZXdbXTtcblx0XHRpZiAoZWRpdG9yR3JvdXBWaWV3c1RvUmV1c2UpIHtcblx0XHRcdHJldXNlR3JvdXBWaWV3cyA9IGVkaXRvckdyb3VwVmlld3NUb1JldXNlLnNsaWNlKDApOyAvLyBkbyBub3QgbW9kaWZ5IG9yaWdpbmFsIGFycmF5XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldXNlR3JvdXBWaWV3cyA9IFtdO1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBuZXdcblx0XHRjb25zdCBncm91cFZpZXdzOiBJRWRpdG9yR3JvdXBWaWV3W10gPSBbXTtcblx0XHRjb25zdCBncmlkV2lkZ2V0ID0gU2VyaWFsaXphYmxlR3JpZC5kZXNlcmlhbGl6ZShzZXJpYWxpemVkR3JpZCwge1xuXHRcdFx0ZnJvbUpTT046IChzZXJpYWxpemVkRWRpdG9yR3JvdXA6IElTZXJpYWxpemVkRWRpdG9yR3JvdXBNb2RlbCB8IG51bGwpID0+IHtcblx0XHRcdFx0bGV0IGdyb3VwVmlldzogSUVkaXRvckdyb3VwVmlldztcblx0XHRcdFx0aWYgKHJldXNlR3JvdXBWaWV3cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Z3JvdXBWaWV3ID0gcmV1c2VHcm91cFZpZXdzLnNoaWZ0KCkhO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGdyb3VwVmlldyA9IHRoaXMuZG9DcmVhdGVHcm91cFZpZXcoc2VyaWFsaXplZEVkaXRvckdyb3VwLCBvcHRpb25zKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGdyb3VwVmlld3MucHVzaChncm91cFZpZXcpO1xuXG5cdFx0XHRcdGlmIChncm91cFZpZXcuaWQgPT09IGFjdGl2ZUdyb3VwSWQpIHtcblx0XHRcdFx0XHR0aGlzLmRvU2V0R3JvdXBBY3RpdmUoZ3JvdXBWaWV3KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBncm91cFZpZXc7XG5cdFx0XHR9XG5cdFx0fSwgeyBzdHlsZXM6IHsgc2VwYXJhdG9yQm9yZGVyOiB0aGlzLmdyaWRTZXBhcmF0b3JCb3JkZXIgfSB9KTtcblxuXHRcdC8vIElmIHRoZSBhY3RpdmUgZ3JvdXAgd2FzIG5vdCBmb3VuZCB3aGVuIHJlc3RvcmluZyB0aGUgZ3JpZFxuXHRcdC8vIG1ha2Ugc3VyZSB0byBtYWtlIGF0IGxlYXN0IG9uZSBncm91cCBhY3RpdmUuIFdlIGFsd2F5cyBuZWVkXG5cdFx0Ly8gYW4gYWN0aXZlIGdyb3VwLlxuXHRcdGlmICghdGhpcy5fYWN0aXZlR3JvdXApIHtcblx0XHRcdHRoaXMuZG9TZXRHcm91cEFjdGl2ZShncm91cFZpZXdzWzBdKTtcblx0XHR9XG5cblx0XHQvLyBWYWxpZGF0ZSBNUlUgZ3JvdXAgdmlld3MgbWF0Y2hlcyBncmlkIHdpZGdldCBzdGF0ZVxuXHRcdGlmICh0aGlzLm1vc3RSZWNlbnRBY3RpdmVHcm91cHMuc29tZShncm91cElkID0+ICF0aGlzLmdldEdyb3VwKGdyb3VwSWQpKSkge1xuXHRcdFx0dGhpcy5tb3N0UmVjZW50QWN0aXZlR3JvdXBzID0gZ3JvdXBWaWV3cy5tYXAoZ3JvdXAgPT4gZ3JvdXAuaWQpO1xuXHRcdH1cblxuXHRcdC8vIFNldCBpdFxuXHRcdHRoaXMuZG9TZXRHcmlkV2lkZ2V0KGdyaWRXaWRnZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1NldEdyaWRXaWRnZXQoZ3JpZFdpZGdldDogU2VyaWFsaXphYmxlR3JpZDxJRWRpdG9yR3JvdXBWaWV3Pik6IHZvaWQge1xuXHRcdGxldCBib3VuZGFyeVNhc2hlczogSUJvdW5kYXJ5U2FzaGVzID0ge307XG5cblx0XHRpZiAodGhpcy5ncmlkV2lkZ2V0KSB7XG5cdFx0XHRib3VuZGFyeVNhc2hlcyA9IHRoaXMuZ3JpZFdpZGdldC5ib3VuZGFyeVNhc2hlcztcblx0XHRcdHRoaXMuZ3JpZFdpZGdldC5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5ncmlkV2lkZ2V0ID0gZ3JpZFdpZGdldDtcblx0XHR0aGlzLmdyaWRXaWRnZXQuYm91bmRhcnlTYXNoZXMgPSBib3VuZGFyeVNhc2hlcztcblx0XHR0aGlzLmdyaWRXaWRnZXRWaWV3LmdyaWRXaWRnZXQgPSBncmlkV2lkZ2V0O1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTaXplQ29uc3RyYWludHMuaW5wdXQgPSBncmlkV2lkZ2V0Lm9uRGlkQ2hhbmdlO1xuXHRcdHRoaXMuX29uRGlkU2Nyb2xsLmlucHV0ID0gZ3JpZFdpZGdldC5vbkRpZFNjcm9sbDtcblx0XHR0aGlzLmdyaWRXaWRnZXREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuZ3JpZFdpZGdldERpc3Bvc2FibGVzLmFkZChncmlkV2lkZ2V0Lm9uRGlkQ2hhbmdlVmlld01heGltaXplZChtYXhpbWl6ZWQgPT4gdGhpcy5fb25EaWRDaGFuZ2VHcm91cE1heGltaXplZC5maXJlKG1heGltaXplZCkpKTtcblxuXHRcdHRoaXMub25EaWRTZXRHcmlkV2lkZ2V0LmZpcmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29udGFpbmVyKCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2VtcHR5JywgdGhpcy5pc0VtcHR5KTtcblx0fVxuXG5cdHByaXZhdGUgbm90aWZ5R3JvdXBJbmRleENoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLmdldEdyb3VwcyhHcm91cHNPcmRlci5HUklEX0FQUEVBUkFOQ0UpLmZvckVhY2goKGdyb3VwLCBpbmRleCkgPT4gZ3JvdXAubm90aWZ5SW5kZXhDaGFuZ2VkKGluZGV4KSk7XG5cdH1cblxuXHRub3RpZnlHcm91cHNMYWJlbENoYW5nZShuZXdMYWJlbDogc3RyaW5nKSB7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmdyb3Vwcykge1xuXHRcdFx0Z3JvdXAubm90aWZ5TGFiZWxDaGFuZ2VkKG5ld0xhYmVsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldCBpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvdW50ID09PSAxICYmIHRoaXMuX2FjdGl2ZUdyb3VwLmlzRW1wdHk7XG5cdH1cblxuXHRzZXRCb3VuZGFyeVNhc2hlcyhzYXNoZXM6IElCb3VuZGFyeVNhc2hlcyk6IHZvaWQge1xuXHRcdHRoaXMuZ3JpZFdpZGdldC5ib3VuZGFyeVNhc2hlcyA9IHNhc2hlcztcblx0XHR0aGlzLmNlbnRlcmVkTGF5b3V0V2lkZ2V0LmJvdW5kYXJ5U2FzaGVzID0gc2FzaGVzO1xuXHR9XG5cblx0b3ZlcnJpZGUgbGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCB0b3A6IG51bWJlciwgbGVmdDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy50b3AgPSB0b3A7XG5cdFx0dGhpcy5sZWZ0ID0gbGVmdDtcblxuXHRcdC8vIFdoZW4gdGhlIGZsb2F0aW5nIHBhbmVscyBleHBlcmltZW50IGlzIGVuYWJsZWQsIHJlc2VydmUgYSBtYXJnaW4gYXJvdW5kIHRoZVxuXHRcdC8vIG1haW4gZWRpdG9yIHNvIGl0IGZsb2F0cyBsaWtlIHRoZSBzaWRlIGJhciBhbmQgcGFuZWwgY2FyZHMuIFNjb3BlIHRvIHRoZSBtYWluXG5cdFx0Ly8gd2luZG93IChhdXhpbGlhcnkgZWRpdG9yIHdpbmRvd3MgZG8gbm90IGFwcGx5IHRoZSBtYXRjaGluZyBDU1MpLlxuXHRcdGlmICh0aGlzLndpbmRvd0lkID09PSBtYWluV2luZG93LnZzY29kZVdpbmRvd0lkICYmIHRoaXMubGF5b3V0U2VydmljZS5pc0Zsb2F0aW5nUGFuZWxzRW5hYmxlZCgpKSB7XG5cblx0XHRcdC8vIFdoZW4gdGhlIGVkaXRvciBiZWNvbWVzIHRoZSBvdXRlcm1vc3QgY2FyZCBvbiBhIHNpZGUgKG5vIGZsb2F0aW5nIHBhcnRcblx0XHRcdC8vIHNpdHMgYmV0d2VlbiBpdCBhbmQgdGhlIHdpbmRvdyBlZGdlKSBpdCBhZG9wdHMgdGhlIHNhbWUgZG91YmxlZCBndXR0ZXIgdGhlXG5cdFx0XHQvLyBzaWRlL2F1eCBiYXJzIHVzZSwgc28gaXRzIGNvbnRlbnRzIGRvIG5vdCBodWcgdGhlIHdpbmRvdyBlZGdlLiBUaGUgbWF0Y2hpbmdcblx0XHRcdC8vIG1hcmdpbnMgYXJlIGFwcGxpZWQgaW4gQ1NTIHZpYSB0aGUgdG9nZ2xlZCBjbGFzc2VzIGJlbG93LlxuXHRcdFx0Y29uc3Qgb3duZXJzID0gZ2V0RmxvYXRpbmdPdXRlckVkZ2VPd25lcnModGhpcy5sYXlvdXRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG91dGVyTGVmdCA9IG93bmVycy5sZWZ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVDtcblx0XHRcdGNvbnN0IG91dGVyUmlnaHQgPSBvd25lcnMucmlnaHQgPT09IFBhcnRzLkVESVRPUl9QQVJUO1xuXG5cdFx0XHRjb25zdCBsZWZ0TWFyZ2luID0gb3V0ZXJMZWZ0ID8gRkxPQVRJTkdfUEFORUxfTUFSR0lOICogMiA6IEZMT0FUSU5HX1BBTkVMX01BUkdJTjtcblx0XHRcdGNvbnN0IHJpZ2h0TWFyZ2luID0gb3V0ZXJSaWdodCA/IEZMT0FUSU5HX1BBTkVMX01BUkdJTiAqIDIgOiBGTE9BVElOR19QQU5FTF9JTk5FUl9NQVJHSU47XG5cblx0XHRcdHdpZHRoID0gTWF0aC5tYXgoMCwgd2lkdGggLSBsZWZ0TWFyZ2luIC0gcmlnaHRNYXJnaW4pO1xuXHRcdFx0Y29uc3QgeyB0b3AsIGJvdHRvbSB9ID0gZ2V0RmxvYXRpbmdFZGl0b3JWZXJ0aWNhbE1hcmdpbnModGhpcy5sYXlvdXRTZXJ2aWNlLCBtYWluV2luZG93KTtcblx0XHRcdGhlaWdodCA9IE1hdGgubWF4KDAsIGhlaWdodCAtIHRvcCAtIGJvdHRvbSk7XG5cblx0XHRcdC8vIFJlc2VydmUgc3BhY2UgZm9yIHRoZSBNb2Rlcm4gVUkgZWRpdG9yIGJvcmRlciAoc3R5bGVPdmVycmlkZXMvbWVkaWEvZWRpdG9yQm9yZGVyLmNzcykgc28gY29udGVudCBkb2Vzbid0IGdldCBjbGlwcGVkLlxuXHRcdFx0aWYgKCF0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdtb2RhbC1lZGl0b3ItcGFydCcpKSB7XG5cdFx0XHRcdHdpZHRoID0gTWF0aC5tYXgoMCwgd2lkdGggLSBFRElUT1JfRlJBTUVfQk9SREVSX1dJRFRIICogMik7XG5cdFx0XHRcdGhlaWdodCA9IE1hdGgubWF4KDAsIGhlaWdodCAtIEVESVRPUl9GUkFNRV9CT1JERVJfV0lEVEggKiAyKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2Zsb2F0aW5nLWVkaXRvci1vdXRlci1sZWZ0Jywgb3V0ZXJMZWZ0KTtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdmbG9hdGluZy1lZGl0b3Itb3V0ZXItcmlnaHQnLCBvdXRlclJpZ2h0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2Zsb2F0aW5nLWVkaXRvci1vdXRlci1sZWZ0JywgJ2Zsb2F0aW5nLWVkaXRvci1vdXRlci1yaWdodCcpO1xuXHRcdH1cblxuXHRcdC8vIExheW91dCBjb250ZW50c1xuXHRcdGNvbnN0IGNvbnRlbnRBcmVhU2l6ZSA9IHN1cGVyLmxheW91dENvbnRlbnRzKHdpZHRoLCBoZWlnaHQpLmNvbnRlbnRTaXplO1xuXG5cdFx0Ly8gTGF5b3V0IGVkaXRvciBjb250YWluZXJcblx0XHR0aGlzLmRvTGF5b3V0KERpbWVuc2lvbi5saWZ0KGNvbnRlbnRBcmVhU2l6ZSksIHRvcCwgbGVmdCk7XG5cdH1cblxuXHRwcml2YXRlIGRvTGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uLCB0b3AgPSB0aGlzLnRvcCwgbGVmdCA9IHRoaXMubGVmdCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRlbnREaW1lbnNpb24gPSBkaW1lbnNpb247XG5cblx0XHQvLyBMYXlvdXQgR3JpZFxuXHRcdHRoaXMuY2VudGVyZWRMYXlvdXRXaWRnZXQubGF5b3V0KHRoaXMuX2NvbnRlbnREaW1lbnNpb24ud2lkdGgsIHRoaXMuX2NvbnRlbnREaW1lbnNpb24uaGVpZ2h0LCB0b3AsIGxlZnQpO1xuXG5cdFx0Ly8gRXZlbnRcblx0XHR0aGlzLl9vbkRpZExheW91dC5maXJlKGRpbWVuc2lvbik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2F2ZVN0YXRlKCk6IHZvaWQge1xuXG5cdFx0Ly8gUGVyc2lzdCBncmlkIFVJIHN0YXRlXG5cdFx0aWYgKHRoaXMuZ3JpZFdpZGdldCkge1xuXHRcdFx0aWYgKHRoaXMuaXNFbXB0eSkge1xuXHRcdFx0XHRkZWxldGUgdGhpcy53b3Jrc3BhY2VNZW1lbnRvW0VkaXRvclBhcnQuRURJVE9SX1BBUlRfVUlfU1RBVEVfU1RPUkFHRV9LRVldO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy53b3Jrc3BhY2VNZW1lbnRvW0VkaXRvclBhcnQuRURJVE9SX1BBUlRfVUlfU1RBVEVfU1RPUkFHRV9LRVldID0gdGhpcy5jcmVhdGVTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFBlcnNpc3QgY2VudGVyZWQgdmlldyBzdGF0ZVxuXHRcdGlmICh0aGlzLmNlbnRlcmVkTGF5b3V0V2lkZ2V0KSB7XG5cdFx0XHRjb25zdCBjZW50ZXJlZExheW91dFN0YXRlID0gdGhpcy5jZW50ZXJlZExheW91dFdpZGdldC5zdGF0ZTtcblx0XHRcdGlmICh0aGlzLmNlbnRlcmVkTGF5b3V0V2lkZ2V0LmlzRGVmYXVsdChjZW50ZXJlZExheW91dFN0YXRlKSkge1xuXHRcdFx0XHRkZWxldGUgdGhpcy5wcm9maWxlTWVtZW50b1tFZGl0b3JQYXJ0LkVESVRPUl9QQVJUX0NFTlRFUkVEX1ZJRVdfU1RPUkFHRV9LRVldO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5wcm9maWxlTWVtZW50b1tFZGl0b3JQYXJ0LkVESVRPUl9QQVJUX0NFTlRFUkVEX1ZJRVdfU1RPUkFHRV9LRVldID0gY2VudGVyZWRMYXlvdXRTdGF0ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzdXBlci5zYXZlU3RhdGUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBsb2FkU3RhdGUoKTogSUVkaXRvclBhcnRVSVN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VNZW1lbnRvW0VkaXRvclBhcnQuRURJVE9SX1BBUlRfVUlfU1RBVEVfU1RPUkFHRV9LRVldO1xuXHR9XG5cblx0Y3JlYXRlU3RhdGUoKTogSUVkaXRvclBhcnRVSVN0YXRlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2VyaWFsaXplZEdyaWQ6IHRoaXMuZ3JpZFdpZGdldC5zZXJpYWxpemUoKSxcblx0XHRcdGFjdGl2ZUdyb3VwOiB0aGlzLl9hY3RpdmVHcm91cC5pZCxcblx0XHRcdG1vc3RSZWNlbnRBY3RpdmVHcm91cHM6IHRoaXMubW9zdFJlY2VudEFjdGl2ZUdyb3Vwc1xuXHRcdH07XG5cdH1cblxuXHRhcHBseVN0YXRlKHN0YXRlOiBJRWRpdG9yUGFydFVJU3RhdGUgfCAnZW1wdHknLCBvcHRpb25zPzogSUVkaXRvckdyb3VwVmlld09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoc3RhdGUgPT09ICdlbXB0eScpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvQXBwbHlFbXB0eVN0YXRlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLmRvQXBwbHlTdGF0ZShzdGF0ZSwgb3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0FwcGx5U3RhdGUoc3RhdGU6IElFZGl0b3JQYXJ0VUlTdGF0ZSwgb3B0aW9ucz86IElFZGl0b3JHcm91cFZpZXdPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZ3JvdXBzID0gYXdhaXQgdGhpcy5kb1ByZXBhcmVBcHBseVN0YXRlKCk7XG5cblx0XHQvLyBQYXVzZSBhZGQvcmVtb3ZlIGV2ZW50cyBmb3IgZ3JvdXBzIGR1cmluZyB0aGUgZHVyYXRpb24gb2YgYXBwbHlpbmcgdGhlIHN0YXRlXG5cdFx0Ly8gVGhpcyBlbnN1cmVzIHRoYXQgd2UgY2FuIGRvIHRoaXMgdHJhbnNpdGlvbiBhdG9taWNhbGx5IHdpdGggdGhlIG5ldyBzdGF0ZVxuXHRcdC8vIGJlaW5nIHJlYWR5IHdoZW4gdGhlIGV2ZW50cyBhcmUgZmlyZWQuIFRoaXMgaXMgaW1wb3J0YW50IGJlY2F1c2UgdXN1YWxseSB0aGVyZVxuXHRcdC8vIGlzIG5ldmVyIHRoZSBzdGF0ZSB3aGVyZSBubyBncm91cHMgYXJlIHByZXNlbnQsIGJ1dCBmb3IgdGhpcyB0cmFuc2l0aW9uIHdlXG5cdFx0Ly8gbmVlZCB0byB0ZW1wb3JhcmlseSBkaXNwb3NlIGFsbCBncm91cHMgdG8gcmVzdG9yZSB0aGUgbmV3IHNldC5cblxuXHRcdHRoaXMuX29uRGlkQWRkR3JvdXAucGF1c2UoKTtcblx0XHR0aGlzLl9vbkRpZFJlbW92ZUdyb3VwLnBhdXNlKCk7XG5cblx0XHR0aGlzLmRpc3Bvc2VHcm91cHMoKTtcblxuXHRcdC8vIE1SVVxuXHRcdHRoaXMubW9zdFJlY2VudEFjdGl2ZUdyb3VwcyA9IHN0YXRlLm1vc3RSZWNlbnRBY3RpdmVHcm91cHM7XG5cblx0XHQvLyBHcmlkIFdpZGdldFxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLmRvQXBwbHlHcmlkU3RhdGUoc3RhdGUuc2VyaWFsaXplZEdyaWQsIHN0YXRlLmFjdGl2ZUdyb3VwLCB1bmRlZmluZWQsIG9wdGlvbnMpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHQvLyBJdCBpcyB2ZXJ5IGltcG9ydGFudCB0byBrZWVwIHRoaXMgb3JkZXI6IGZpcnN0IHJlc3VtZSB0aGUgZXZlbnRzIGZvclxuXHRcdFx0Ly8gcmVtb3ZlZCBncm91cHMgYW5kIHRoZW4gZm9yIGFkZGVkIGdyb3Vwcy4gTWFueSBsaXN0ZW5lcnMgbWF5IHN0b3JlXG5cdFx0XHQvLyBncm91cHMgaW4gc2V0cyBieSB0aGVpciBpZGVudGlmaWVyIGFuZCBncm91cHMgY2FuIGhhdmUgdGhlIHNhbWVcblx0XHRcdC8vIGlkZW50aWZpZXIgYmVmb3JlIGFuZCBhZnRlci5cblx0XHRcdHRoaXMuX29uRGlkUmVtb3ZlR3JvdXAucmVzdW1lKCk7XG5cdFx0XHR0aGlzLl9vbkRpZEFkZEdyb3VwLnJlc3VtZSgpO1xuXHRcdH1cblxuXHRcdC8vIFJlc3RvcmUgZWRpdG9ycyB0aGF0IHdlcmUgbm90IGNsb3NlZCBiZWZvcmUgYW5kIGFyZSBub3cgb3BlbmVkIG5vd1xuXHRcdGF3YWl0IHRoaXMuYWN0aXZlR3JvdXAub3BlbkVkaXRvcnMoXG5cdFx0XHRncm91cHNcblx0XHRcdFx0LmZsYXRNYXAoZ3JvdXAgPT4gZ3JvdXAuZWRpdG9ycylcblx0XHRcdFx0LmZpbHRlcihlZGl0b3IgPT4gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcuZ3JvdXBzLmV2ZXJ5KGdyb3VwVmlldyA9PiAhZ3JvdXBWaWV3LmNvbnRhaW5zKGVkaXRvcikpKVxuXHRcdFx0XHQubWFwKGVkaXRvciA9PiAoe1xuXHRcdFx0XHRcdGVkaXRvciwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUsIHByZXNlcnZlRm9jdXM6IHRydWUsIGluYWN0aXZlOiB0cnVlIH1cblx0XHRcdFx0fSkpXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9BcHBseUVtcHR5U3RhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5kb1ByZXBhcmVBcHBseVN0YXRlKCk7XG5cblx0XHR0aGlzLm1lcmdlQWxsR3JvdXBzKHRoaXMuYWN0aXZlR3JvdXApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1ByZXBhcmVBcHBseVN0YXRlKCk6IFByb21pc2U8SUVkaXRvckdyb3VwVmlld1tdPiB7XG5cblx0XHQvLyBCZWZvcmUgZGlzcG9zaW5nIGdyb3VwcywgdHJ5IHRvIGNsb3NlIGFzIG1hbnkgZWRpdG9ycyBhc1xuXHRcdC8vIHBvc3NpYmxlLCBidXQgc2tpcCBvdmVyIHRob3NlIHRoYXQgd291bGQgdHJpZ2dlciBhIGRpYWxvZ1xuXHRcdC8vIChmb3IgZXhhbXBsZSB3aGVuIGJlaW5nIGRpcnR5KS4gVGhpcyBpcyB0byBiZSBhYmxlIHRvIGxhdGVyXG5cdFx0Ly8gcmVzdG9yZSB0aGVzZSBlZGl0b3JzIGFmdGVyIHN0YXRlIGhhcyBiZWVuIGFwcGxpZWQuXG5cblx0XHRjb25zdCBncm91cHMgPSB0aGlzLmdldEdyb3VwcyhHcm91cHNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcblx0XHRcdGF3YWl0IGdyb3VwLmNsb3NlQWxsRWRpdG9ycyh7IGV4Y2x1ZGVDb25maXJtaW5nOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZ3JvdXBzO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0FwcGx5R3JpZFN0YXRlKGdyaWRTdGF0ZTogSVNlcmlhbGl6ZWRHcmlkLCBhY3RpdmVHcm91cElkOiBHcm91cElkZW50aWZpZXIsIGVkaXRvckdyb3VwVmlld3NUb1JldXNlPzogSUVkaXRvckdyb3VwVmlld1tdLCBvcHRpb25zPzogSUVkaXRvckdyb3VwVmlld09wdGlvbnMpOiB2b2lkIHtcblxuXHRcdC8vIFJlY3JlYXRlIGdyaWQgd2lkZ2V0IGZyb20gc3RhdGVcblx0XHR0aGlzLmRvQ3JlYXRlR3JpZENvbnRyb2xXaXRoU3RhdGUoZ3JpZFN0YXRlLCBhY3RpdmVHcm91cElkLCBlZGl0b3JHcm91cFZpZXdzVG9SZXVzZSwgb3B0aW9ucyk7XG5cblx0XHQvLyBMYXlvdXQsIGJ1dCBvbmx5IGlmIHRoZSBwYXJ0IGhhcyBhbHJlYWR5IGJlZW4gbGFpZCBvdXQgYXQgbGVhc3Qgb25jZS5cblx0XHQvLyBXaGVuIHJlc3RvcmluZyBhIHdvcmtpbmcgc2V0IGludG8gYW4gZWRpdG9yIHBhcnQgdGhhdCBoYXMgbmV2ZXIgYmVlblxuXHRcdC8vIHNob3duIChlLmcuIG9uIHJlbG9hZCB3aXRoIHRoZSBlZGl0b3IgYXJlYSBoaWRkZW4pLCBgX2NvbnRlbnREaW1lbnNpb25gXG5cdFx0Ly8gaXMgc3RpbGwgdW5kZWZpbmVkOyBsYXlpbmcgb3V0IGhlcmUgd291bGQgdGhyb3cgYW5kIGFib3J0IGJlZm9yZSB0aGVcblx0XHQvLyBgb25EaWRBZGRHcm91cGAgZXZlbnRzIGJlbG93IGFyZSBmaXJlZCAobGVhdmluZyB0aGUgcmVzdG9yZWQgZ3JvdXBzXG5cdFx0Ly8gdW5yZWdpc3RlcmVkIHdpdGggdGhlIGVkaXRvciBzZXJ2aWNlKS4gVGhlIGdyaWQgaXMgbGFpZCBvdXQgbGF0ZXIgd2hlblxuXHRcdC8vIHRoZSBwYXJ0IGlzIGZpcnN0IHNob3duLlxuXHRcdGlmICh0aGlzLl9jb250ZW50RGltZW5zaW9uKSB7XG5cdFx0XHR0aGlzLmRvTGF5b3V0KHRoaXMuX2NvbnRlbnREaW1lbnNpb24pO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBjb250YWluZXJcblx0XHR0aGlzLnVwZGF0ZUNvbnRhaW5lcigpO1xuXG5cdFx0Ly8gRXZlbnRzIGZvciBncm91cHMgdGhhdCBnb3QgYWRkZWRcblx0XHRmb3IgKGNvbnN0IGdyb3VwVmlldyBvZiB0aGlzLmdldEdyb3VwcyhHcm91cHNPcmRlci5HUklEX0FQUEVBUkFOQ0UpKSB7XG5cdFx0XHRpZiAoIWVkaXRvckdyb3VwVmlld3NUb1JldXNlPy5pbmNsdWRlcyhncm91cFZpZXcpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQWRkR3JvdXAuZmlyZShncm91cFZpZXcpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE5vdGlmeSBncm91cCBpbmRleCBjaGFuZ2UgZ2l2ZW4gbGF5b3V0IGhhcyBjaGFuZ2VkXG5cdFx0dGhpcy5ub3RpZnlHcm91cEluZGV4Q2hhbmdlKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlTWVtZW50b1N0YXRlKGU6IElTdG9yYWdlVmFsdWVDaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLmV4dGVybmFsICYmIGUuc2NvcGUgPT09IFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpIHtcblx0XHRcdHRoaXMucmVsb2FkTWVtZW50byhlLnNjb3BlKTtcblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLmxvYWRTdGF0ZSgpO1xuXHRcdFx0aWYgKHN0YXRlKSB7XG5cdFx0XHRcdHRoaXMuYXBwbHlTdGF0ZShzdGF0ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dG9KU09OKCk6IG9iamVjdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6IFBhcnRzLkVESVRPUl9QQVJUXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZGlzcG9zZUdyb3VwcygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZ3JvdXBzKSB7XG5cdFx0XHRncm91cC5kaXNwb3NlKCk7XG5cblx0XHRcdHRoaXMuX29uRGlkUmVtb3ZlR3JvdXAuZmlyZShncm91cCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5ncm91cFZpZXdzLmNsZWFyKCk7XG5cdFx0dGhpcy5tb3N0UmVjZW50QWN0aXZlR3JvdXBzID0gW107XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXG5cdFx0Ly8gRXZlbnRcblx0XHR0aGlzLl9vbldpbGxEaXNwb3NlLmZpcmUoKTtcblxuXHRcdC8vIEZvcndhcmQgdG8gYWxsIGdyb3Vwc1xuXHRcdHRoaXMuZGlzcG9zZUdyb3VwcygpO1xuXG5cdFx0Ly8gR3JpZCB3aWRnZXRcblx0XHR0aGlzLmdyaWRXaWRnZXQ/LmRpc3Bvc2UoKTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuXG5leHBvcnQgY2xhc3MgTWFpbkVkaXRvclBhcnQgZXh0ZW5kcyBFZGl0b3JQYXJ0IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3JQYXJ0c1ZpZXc6IElFZGl0b3JQYXJ0c1ZpZXcsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGVkaXRvclBhcnRzVmlldywgUGFydHMuRURJVE9SX1BBUlQsICcnLCBtYWluV2luZG93LnZzY29kZVdpbmRvd0lkLCBpbnN0YW50aWF0aW9uU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxheW91dFNlcnZpY2UsIGhvc3RTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsV0FBVyxHQUFHLGFBQWEsdUNBQXVDLFdBQVcsMkJBQTJCLGtCQUFrQixxQkFBcUI7QUFDeEosU0FBUyxPQUFPLFNBQVMsT0FBTyx3QkFBd0I7QUFDeEQsU0FBUyxnQkFBZ0Isd0JBQXdCO0FBQ2pELFNBQVMsZ0JBQWdCLG1CQUFtQixrQkFBc0MsZ0JBQWdCLGFBQWEsZUFBa0ksNkJBQTBEO0FBQzNTLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQWdCLFlBQVksZ0JBQTJCLFdBQVcsa0JBQWtCLFFBQTBDLGFBQTZCLGtCQUE0Qiw0QkFBa0M7QUFDek4sU0FBcUcs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
