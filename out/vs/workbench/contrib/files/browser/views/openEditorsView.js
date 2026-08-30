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
import "./media/openeditors.css";
import * as nls from "../../../../../nls.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { ActionRunner } from "../../../../../base/common/actions.js";
import * as dom from "../../../../../base/browser/dom.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IEditorGroupsService, GroupsOrder, GroupOrientation } from "../../../../services/editor/common/editorGroupsService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { Verbosity, EditorResourceAccessor, SideBySideEditor, GroupModelChangeKind, preventEditorClose, EditorCloseMethod } from "../../../../common/editor.js";
import { SaveAllInGroupAction, CloseGroupAction } from "../fileActions.js";
import { OpenEditorsFocusedContext, ExplorerFocusedContext, OpenEditor } from "../../common/files.js";
import { CloseAllEditorsAction, CloseEditorAction, UnpinEditorAction } from "../../../../browser/parts/editor/editorActions.js";
import { IContextKeyService, ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { asCssVariable, badgeBackground, badgeForeground, contrastBorder } from "../../../../../platform/theme/common/colorRegistry.js";
import { WorkbenchList } from "../../../../../platform/list/browser/listService.js";
import { ListDragOverEffectPosition, ListDragOverEffectType } from "../../../../../base/browser/ui/list/list.js";
import { ResourceLabels } from "../../../../browser/labels.js";
import { ActionBar } from "../../../../../base/browser/ui/actionbar/actionbar.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { DisposableMap, dispose } from "../../../../../base/common/lifecycle.js";
import { MenuId, Action2, registerAction2, MenuRegistry } from "../../../../../platform/actions/common/actions.js";
import { OpenEditorsDirtyEditorContext, OpenEditorsGroupContext, OpenEditorsReadonlyEditorContext, SAVE_ALL_LABEL, SAVE_ALL_COMMAND_ID, NEW_UNTITLED_FILE_COMMAND_ID, OpenEditorsSelectedFileOrUntitledContext } from "../fileConstants.js";
import { ResourceContextKey, MultipleEditorGroupsContext } from "../../../../common/contextkeys.js";
import { CodeDataTransfers, containsDragType } from "../../../../../platform/dnd/browser/dnd.js";
import { ResourcesDropHandler, fillEditorsDragData } from "../../../../browser/dnd.js";
import { ViewPane } from "../../../../browser/parts/views/viewPane.js";
import { DataTransfers } from "../../../../../base/browser/dnd.js";
import { memoize } from "../../../../../base/common/decorators.js";
import { ElementsDragAndDropData, ListViewTargetSector, NativeDragAndDropData } from "../../../../../base/browser/ui/list/listView.js";
import { IWorkingCopyService } from "../../../../services/workingCopy/common/workingCopyService.js";
import { WorkingCopyCapabilities } from "../../../../services/workingCopy/common/workingCopy.js";
import { IFilesConfigurationService } from "../../../../services/filesConfiguration/common/filesConfigurationService.js";
import { IViewDescriptorService } from "../../../../common/views.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { Orientation } from "../../../../../base/browser/ui/splitview/splitview.js";
import { compareFileNamesDefault } from "../../../../../base/common/comparers.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { Schemas } from "../../../../../base/common/network.js";
import { extUriIgnorePathCase } from "../../../../../base/common/resources.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { EditorGroupView } from "../../../../browser/parts/editor/editorGroupView.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { EventType as TouchEventType, Gesture } from "../../../../../base/browser/touch.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
const $ = dom.$;
function findFirstDirtyEditor(groups) {
  for (const group of groups) {
    for (const editor of group.editors) {
      if (editor.isDirty()) {
        return new OpenEditor(editor, group);
      }
    }
  }
  return void 0;
}
let OpenEditorsView = class extends ViewPane {
  constructor(options, instantiationService, viewDescriptorService, contextMenuService, editorGroupService, configurationService, keybindingService, contextKeyService, themeService, telemetryService, hoverService, workingCopyService, filesConfigurationService, openerService, fileService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.editorGroupService = editorGroupService;
    this.telemetryService = telemetryService;
    this.workingCopyService = workingCopyService;
    this.filesConfigurationService = filesConfigurationService;
    this.fileService = fileService;
    this.needsRefresh = false;
    this.elements = [];
    this.blockFocusActiveEditorTracking = false;
    this.preserveSelectionOnRefresh = false;
    this.editorIds = /* @__PURE__ */ new WeakMap();
    this.editorIdPool = 0;
    this.structuralRefreshDelay = 0;
    this.sortOrder = configurationService.getValue("explorer.openEditors.sortOrder");
    this.registerUpdateEvents();
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationChange(e)));
    this._register(this.workingCopyService.onDidChangeDirty((workingCopy) => this.updateDirtyIndicator(workingCopy)));
  }
  registerUpdateEvents() {
    const updateWholeList = () => {
      if (!this.isBodyVisible() || !this.list) {
        this.needsRefresh = true;
        return;
      }
      this.scheduleListRefresh(false, this.structuralRefreshDelay);
    };
    const groupDisposables = this._register(new DisposableMap());
    const addGroupListener = (group) => {
      const groupModelChangeListener = group.onDidModelChange((e) => {
        if (this.listRefreshScheduler?.isScheduled()) {
          switch (e.kind) {
            case GroupModelChangeKind.EDITOR_ACTIVE:
            case GroupModelChangeKind.EDITOR_OPEN:
            case GroupModelChangeKind.EDITOR_MOVE:
            case GroupModelChangeKind.EDITOR_CLOSE:
              this.preserveSelectionOnRefresh = false;
          }
          return;
        }
        if (!this.isBodyVisible() || !this.list) {
          this.needsRefresh = true;
          return;
        }
        const index = this.getIndex(group, e.editor);
        switch (e.kind) {
          case GroupModelChangeKind.EDITOR_ACTIVE:
            this.focusActiveEditor();
            break;
          case GroupModelChangeKind.GROUP_INDEX:
          case GroupModelChangeKind.GROUP_LABEL:
            if (index >= 0) {
              this.list.splice(index, 1, [group]);
            }
            break;
          case GroupModelChangeKind.EDITOR_DIRTY:
          case GroupModelChangeKind.EDITOR_STICKY:
          case GroupModelChangeKind.EDITOR_CAPABILITIES:
          case GroupModelChangeKind.EDITOR_PIN:
          case GroupModelChangeKind.EDITOR_LABEL:
            this.list.splice(index, 1, [new OpenEditor(e.editor, group)]);
            this.focusActiveEditor(true);
            break;
          case GroupModelChangeKind.EDITOR_OPEN:
          case GroupModelChangeKind.EDITOR_MOVE:
          case GroupModelChangeKind.EDITOR_CLOSE:
            updateWholeList();
            break;
        }
      });
      groupDisposables.set(group.id, groupModelChangeListener);
    };
    this.editorGroupService.groups.forEach((g) => addGroupListener(g));
    this._register(this.editorGroupService.onDidAddGroup((group) => {
      addGroupListener(group);
      updateWholeList();
    }));
    this._register(this.editorGroupService.onDidMoveGroup(() => updateWholeList()));
    this._register(this.editorGroupService.onDidChangeActiveGroup(() => this.focusActiveEditor()));
    this._register(this.editorGroupService.onDidRemoveGroup((group) => {
      groupDisposables.deleteAndDispose(group.id);
      updateWholeList();
    }));
  }
  renderHeaderTitle(container) {
    super.renderHeaderTitle(container, this.title);
    const count = dom.append(container, $(".open-editors-dirty-count-container"));
    this.dirtyCountElement = dom.append(count, $(".dirty-count.monaco-count-badge.long"));
    this.dirtyCountElement.style.backgroundColor = asCssVariable(badgeBackground);
    this.dirtyCountElement.style.color = asCssVariable(badgeForeground);
    this.dirtyCountElement.style.border = `1px solid ${asCssVariable(contrastBorder)}`;
    this.dirtyCountElement.tabIndex = 0;
    this.dirtyCountElement.setAttribute("role", "button");
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), this.dirtyCountElement, nls.localize("openUnsavedEditor", "Open Unsaved Editor")));
    this._register(Gesture.addTarget(this.dirtyCountElement));
    for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
      this._register(dom.addDisposableListener(this.dirtyCountElement, eventType, (e) => {
        dom.EventHelper.stop(e, true);
        this.openFirstDirtyEditor();
      }));
    }
    this._register(dom.addDisposableListener(this.dirtyCountElement, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        dom.EventHelper.stop(e, true);
        this.openFirstDirtyEditor();
      }
    }));
    this.updateDirtyIndicator();
  }
  openFirstDirtyEditor() {
    const openEditor = findFirstDirtyEditor(this.editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE));
    if (openEditor) {
      this.openEditor(openEditor, { pinned: true });
    }
  }
  renderBody(container) {
    super.renderBody(container);
    container.classList.add("open-editors");
    container.classList.add("show-file-icons");
    const delegate = new OpenEditorsDelegate();
    if (this.list) {
      this.list.dispose();
    }
    if (this.listLabels) {
      this.listLabels.clear();
    }
    this.dnd = new OpenEditorsDragAndDrop(this.sortOrder, this.instantiationService, this.editorGroupService);
    this.listLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
    this.list = this.instantiationService.createInstance(WorkbenchList, "OpenEditors", container, delegate, [
      new EditorGroupRenderer(this.keybindingService, this.instantiationService),
      new OpenEditorRenderer(this.listLabels, this.instantiationService, this.keybindingService, this.configurationService)
    ], {
      identityProvider: { getId: (element) => this.getElementId(element) },
      dnd: this.dnd,
      overrideStyles: this.getLocationBasedColors().listOverrideStyles,
      accessibilityProvider: new OpenEditorsAccessibilityProvider(),
      openOnSingleClick: true
    });
    this._register(this.list);
    this._register(this.listLabels);
    let labelChangeListeners = [];
    this.listRefreshScheduler = this._register(new RunOnceScheduler(() => {
      const preserveSelection = this.preserveSelectionOnRefresh;
      this.preserveSelectionOnRefresh = false;
      if (!this.list) {
        return;
      }
      labelChangeListeners = dispose(labelChangeListeners);
      const previousLength = this.list.length;
      const elements = this.getElements();
      this.list.splice(0, this.list.length, elements);
      this.focusActiveEditor(preserveSelection);
      if (previousLength !== this.list.length) {
        this.updateSize();
      }
      this.needsRefresh = false;
      if (this.sortOrder === "alphabetical" || this.sortOrder === "fullPath") {
        elements.forEach((e) => {
          if (e instanceof OpenEditor) {
            labelChangeListeners.push(e.editor.onDidChangeLabel(() => this.scheduleListRefresh(true)));
          }
        });
      }
    }, this.structuralRefreshDelay));
    this.updateSize();
    this.handleContextKeys();
    this._register(this.list.onContextMenu((e) => this.onListContextMenu(e)));
    this._register(this.list.onMouseMiddleClick((e) => {
      if (e && e.element instanceof OpenEditor) {
        if (preventEditorClose(e.element.group, e.element.editor, EditorCloseMethod.MOUSE, this.editorGroupService.partOptions)) {
          return;
        }
        e.element.group.closeEditor(e.element.editor, { preserveFocus: true });
      }
    }));
    this._register(this.list.onDidOpen((e) => {
      const element = e.element;
      if (!element) {
        return;
      } else if (element instanceof OpenEditor) {
        if (dom.isMouseEvent(e.browserEvent) && e.browserEvent.button === 1) {
          return;
        }
        this.withActiveEditorFocusTrackingDisabled(() => {
          this.openEditor(element, { preserveFocus: e.editorOptions.preserveFocus, pinned: e.editorOptions.pinned, sideBySide: e.sideBySide });
        });
      } else {
        this.withActiveEditorFocusTrackingDisabled(() => {
          this.editorGroupService.activateGroup(element);
          if (!e.editorOptions.preserveFocus) {
            element.focus();
          }
        });
      }
    }));
    this.scheduleListRefresh(false, 0);
    this._register(this.onDidChangeBodyVisibility((visible) => {
      if (visible && this.needsRefresh) {
        this.scheduleListRefresh(false, 0);
      }
    }));
    const containerModel = this.viewDescriptorService.getViewContainerModel(this.viewDescriptorService.getViewContainerByViewId(this.id));
    this._register(containerModel.onDidChangeAllViewDescriptors(() => {
      this.updateSize();
    }));
  }
  handleContextKeys() {
    if (!this.list) {
      return;
    }
    OpenEditorsFocusedContext.bindTo(this.list.contextKeyService);
    ExplorerFocusedContext.bindTo(this.list.contextKeyService);
    const groupFocusedContext = OpenEditorsGroupContext.bindTo(this.contextKeyService);
    const dirtyEditorFocusedContext = OpenEditorsDirtyEditorContext.bindTo(this.contextKeyService);
    const readonlyEditorFocusedContext = OpenEditorsReadonlyEditorContext.bindTo(this.contextKeyService);
    const openEditorsSelectedFileOrUntitledContext = OpenEditorsSelectedFileOrUntitledContext.bindTo(this.contextKeyService);
    const resourceContext = this.instantiationService.createInstance(ResourceContextKey);
    this._register(resourceContext);
    this._register(this.list.onDidChangeFocus((e) => {
      resourceContext.reset();
      groupFocusedContext.reset();
      dirtyEditorFocusedContext.reset();
      readonlyEditorFocusedContext.reset();
      const element = e.elements.length ? e.elements[0] : void 0;
      if (element instanceof OpenEditor) {
        const resource = element.getResource();
        dirtyEditorFocusedContext.set(element.editor.isDirty() && !element.editor.isSaving());
        readonlyEditorFocusedContext.set(!!element.editor.isReadonly());
        resourceContext.set(resource ?? null);
      } else if (element) {
        groupFocusedContext.set(true);
      }
    }));
    this._register(this.list.onDidChangeSelection((e) => {
      const selectedAreFileOrUntitled = e.elements.every((e2) => {
        if (e2 instanceof OpenEditor) {
          const resource = e2.getResource();
          return resource && (resource.scheme === Schemas.untitled || this.fileService.hasProvider(resource));
        }
        return false;
      });
      openEditorsSelectedFileOrUntitledContext.set(selectedAreFileOrUntitled);
    }));
  }
  focus() {
    super.focus();
    this.list?.domFocus();
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.list?.layout(height, width);
  }
  get showGroups() {
    return this.editorGroupService.groups.length > 1;
  }
  getElements() {
    this.elements = [];
    this.editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE).forEach((g) => {
      if (this.showGroups) {
        this.elements.push(g);
      }
      let editors = g.editors.map((ei) => new OpenEditor(ei, g));
      if (this.sortOrder === "alphabetical") {
        editors = editors.sort((first, second) => compareFileNamesDefault(first.editor.getName(), second.editor.getName()));
      } else if (this.sortOrder === "fullPath") {
        editors = editors.sort((first, second) => {
          const firstResource = first.editor.resource;
          const secondResource = second.editor.resource;
          if (firstResource === void 0 && secondResource === void 0) {
            return compareFileNamesDefault(first.editor.getName(), second.editor.getName());
          } else if (firstResource === void 0) {
            return -1;
          } else if (secondResource === void 0) {
            return 1;
          } else {
            const firstScheme = firstResource.scheme;
            const secondScheme = secondResource.scheme;
            if (firstScheme !== Schemas.file && secondScheme !== Schemas.file) {
              return extUriIgnorePathCase.compare(firstResource, secondResource);
            } else if (firstScheme !== Schemas.file) {
              return -1;
            } else if (secondScheme !== Schemas.file) {
              return 1;
            } else {
              return extUriIgnorePathCase.compare(firstResource, secondResource);
            }
          }
        });
      }
      this.elements.push(...editors);
    });
    return this.elements;
  }
  getIndex(group, editor) {
    if (!editor) {
      return this.elements.findIndex((e) => !(e instanceof OpenEditor) && e.id === group.id);
    }
    return this.elements.findIndex((e) => e instanceof OpenEditor && e.editor === editor && e.group.id === group.id);
  }
  openEditor(element, options) {
    if (element) {
      this.telemetryService.publicLog2("workbenchActionExecuted", { id: "workbench.files.openFile", from: "openEditors" });
      const preserveActivateGroup = options.sideBySide && options.preserveFocus;
      if (!preserveActivateGroup) {
        this.editorGroupService.activateGroup(element.group);
      }
      const targetGroup = options.sideBySide ? this.editorGroupService.sideGroup : element.group;
      targetGroup.openEditor(element.editor, options);
    }
  }
  onListContextMenu(e) {
    if (!e.element) {
      return;
    }
    const element = e.element;
    this.contextMenuService.showContextMenu({
      menuId: MenuId.OpenEditorsContext,
      menuActionOptions: { shouldForwardArgs: true, arg: element instanceof OpenEditor ? EditorResourceAccessor.getOriginalUri(element.editor) : {} },
      contextKeyService: this.list?.contextKeyService,
      getAnchor: () => e.anchor,
      getActionsContext: () => element instanceof OpenEditor ? { groupId: element.groupId, editorIndex: element.group.getIndexOfEditor(element.editor) } : { groupId: element.id }
    });
  }
  withActiveEditorFocusTrackingDisabled(fn) {
    this.blockFocusActiveEditorTracking = true;
    try {
      fn();
    } finally {
      this.blockFocusActiveEditorTracking = false;
    }
  }
  scheduleListRefresh(preserveSelection, delay) {
    if (!this.listRefreshScheduler) {
      return;
    }
    if (!preserveSelection || !this.listRefreshScheduler.isScheduled()) {
      this.preserveSelectionOnRefresh = preserveSelection;
    }
    this.listRefreshScheduler.schedule(delay);
  }
  getElementId(element) {
    if (!(element instanceof OpenEditor)) {
      return element.id.toString();
    }
    let editorId = this.editorIds.get(element.editor);
    if (editorId === void 0) {
      editorId = this.editorIdPool++;
      this.editorIds.set(element.editor, editorId);
    }
    return `openeditor:${element.groupId}:${editorId}`;
  }
  focusActiveEditor(preserveSelection = false) {
    if (!this.list || this.blockFocusActiveEditorTracking) {
      return;
    }
    if (this.list.length && this.editorGroupService.activeGroup) {
      const index = this.getIndex(this.editorGroupService.activeGroup, this.editorGroupService.activeGroup.activeEditor);
      if (index >= 0) {
        try {
          this.list.setFocus([index]);
          if (!preserveSelection) {
            this.list.setSelection([index]);
          }
          this.list.reveal(index);
        } catch (e) {
        }
        return;
      }
    }
    this.list.setFocus([]);
    if (!preserveSelection) {
      this.list.setSelection([]);
    }
  }
  onConfigurationChange(event) {
    if (event.affectsConfiguration("explorer.openEditors")) {
      this.updateSize();
    }
    if (event.affectsConfiguration("explorer.decorations") || event.affectsConfiguration("explorer.openEditors.sortOrder")) {
      this.sortOrder = this.configurationService.getValue("explorer.openEditors.sortOrder");
      if (this.dnd) {
        this.dnd.sortOrder = this.sortOrder;
      }
      this.scheduleListRefresh(false);
    }
  }
  updateSize() {
    this.minimumBodySize = this.orientation === Orientation.VERTICAL ? this.getMinExpandedBodySize() : 170;
    this.maximumBodySize = this.orientation === Orientation.VERTICAL ? this.getMaxExpandedBodySize() : Number.POSITIVE_INFINITY;
  }
  updateDirtyIndicator(workingCopy) {
    if (workingCopy) {
      const gotDirty = workingCopy.isDirty();
      if (gotDirty && !(workingCopy.capabilities & WorkingCopyCapabilities.Untitled) && this.filesConfigurationService.hasShortAutoSaveDelay(workingCopy.resource)) {
        return;
      }
    }
    const dirty = this.workingCopyService.dirtyCount;
    if (dirty === 0) {
      this.dirtyCountElement.classList.add("hidden");
    } else {
      this.dirtyCountElement.textContent = nls.localize("dirtyCounter", "{0} unsaved", dirty);
      this.dirtyCountElement.setAttribute("aria-label", nls.localize("dirtyCounterAriaLabel", "{0} unsaved, open unsaved editor", dirty));
      this.dirtyCountElement.classList.remove("hidden");
    }
  }
  get elementCount() {
    return this.editorGroupService.groups.map((g) => g.count).reduce((first, second) => first + second, this.showGroups ? this.editorGroupService.groups.length : 0);
  }
  getMaxExpandedBodySize() {
    let minVisibleOpenEditors = this.configurationService.getValue("explorer.openEditors.minVisible");
    if (typeof minVisibleOpenEditors !== "number") {
      minVisibleOpenEditors = OpenEditorsView.DEFAULT_MIN_VISIBLE_OPEN_EDITORS;
    }
    const containerModel = this.viewDescriptorService.getViewContainerModel(this.viewDescriptorService.getViewContainerByViewId(this.id));
    if (containerModel.visibleViewDescriptors.length <= 1) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(this.elementCount, minVisibleOpenEditors) * OpenEditorsDelegate.ITEM_HEIGHT;
  }
  getMinExpandedBodySize() {
    let visibleOpenEditors = this.configurationService.getValue("explorer.openEditors.visible");
    if (typeof visibleOpenEditors !== "number") {
      visibleOpenEditors = OpenEditorsView.DEFAULT_VISIBLE_OPEN_EDITORS;
    }
    return this.computeMinExpandedBodySize(visibleOpenEditors);
  }
  computeMinExpandedBodySize(visibleOpenEditors = OpenEditorsView.DEFAULT_VISIBLE_OPEN_EDITORS) {
    const itemsToShow = Math.min(Math.max(visibleOpenEditors, 1), this.elementCount);
    return itemsToShow * OpenEditorsDelegate.ITEM_HEIGHT;
  }
  setStructuralRefreshDelay(delay) {
    this.structuralRefreshDelay = delay;
  }
  getOptimalWidth() {
    if (!this.list) {
      return super.getOptimalWidth();
    }
    const parentNode = this.list.getHTMLElement();
    const childNodes = [].slice.call(parentNode.querySelectorAll(".open-editor > a"));
    return dom.getLargestChildWidth(parentNode, childNodes);
  }
};
OpenEditorsView.DEFAULT_VISIBLE_OPEN_EDITORS = 9;
OpenEditorsView.DEFAULT_MIN_VISIBLE_OPEN_EDITORS = 0;
OpenEditorsView.ID = "workbench.explorer.openEditorsView";
OpenEditorsView.NAME = nls.localize2({ key: "openEditors", comment: ["Open is an adjective"] }, "Open Editors");
OpenEditorsView = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IViewDescriptorService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IEditorGroupsService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, IHoverService),
  __decorateParam(11, IWorkingCopyService),
  __decorateParam(12, IFilesConfigurationService),
  __decorateParam(13, IOpenerService),
  __decorateParam(14, IFileService)
], OpenEditorsView);
class OpenEditorActionRunner extends ActionRunner {
  async run(action) {
    if (!this.editor) {
      return;
    }
    return super.run(action, { groupId: this.editor.groupId, editorIndex: this.editor.group.getIndexOfEditor(this.editor.editor) });
  }
}
const _OpenEditorsDelegate = class _OpenEditorsDelegate {
  getHeight(_element) {
    return _OpenEditorsDelegate.ITEM_HEIGHT;
  }
  getTemplateId(element) {
    if (element instanceof OpenEditor) {
      return OpenEditorRenderer.ID;
    }
    return EditorGroupRenderer.ID;
  }
};
_OpenEditorsDelegate.ITEM_HEIGHT = 22;
let OpenEditorsDelegate = _OpenEditorsDelegate;
const _EditorGroupRenderer = class _EditorGroupRenderer {
  constructor(keybindingService, instantiationService) {
    this.keybindingService = keybindingService;
    this.instantiationService = instantiationService;
  }
  get templateId() {
    return _EditorGroupRenderer.ID;
  }
  renderTemplate(container) {
    const editorGroupTemplate = /* @__PURE__ */ Object.create(null);
    editorGroupTemplate.root = dom.append(container, $(".editor-group"));
    editorGroupTemplate.name = dom.append(editorGroupTemplate.root, $("span.name"));
    editorGroupTemplate.actionBar = new ActionBar(container);
    const saveAllInGroupAction = this.instantiationService.createInstance(SaveAllInGroupAction, SaveAllInGroupAction.ID, SaveAllInGroupAction.LABEL);
    const saveAllInGroupKey = this.keybindingService.lookupKeybinding(saveAllInGroupAction.id);
    editorGroupTemplate.actionBar.push(saveAllInGroupAction, { icon: true, label: false, keybinding: saveAllInGroupKey ? saveAllInGroupKey.getLabel() : void 0 });
    const closeGroupAction = this.instantiationService.createInstance(CloseGroupAction, CloseGroupAction.ID, CloseGroupAction.LABEL);
    const closeGroupActionKey = this.keybindingService.lookupKeybinding(closeGroupAction.id);
    editorGroupTemplate.actionBar.push(closeGroupAction, { icon: true, label: false, keybinding: closeGroupActionKey ? closeGroupActionKey.getLabel() : void 0 });
    return editorGroupTemplate;
  }
  renderElement(editorGroup, _index, templateData) {
    templateData.editorGroup = editorGroup;
    templateData.name.textContent = editorGroup.label;
    templateData.actionBar.context = { groupId: editorGroup.id };
  }
  disposeTemplate(templateData) {
    templateData.actionBar.dispose();
  }
};
_EditorGroupRenderer.ID = "editorgroup";
let EditorGroupRenderer = _EditorGroupRenderer;
const _OpenEditorRenderer = class _OpenEditorRenderer {
  constructor(labels, instantiationService, keybindingService, configurationService) {
    this.labels = labels;
    this.instantiationService = instantiationService;
    this.keybindingService = keybindingService;
    this.configurationService = configurationService;
    this.closeEditorAction = this.instantiationService.createInstance(CloseEditorAction, CloseEditorAction.ID, CloseEditorAction.LABEL);
    this.unpinEditorAction = this.instantiationService.createInstance(UnpinEditorAction, UnpinEditorAction.ID, UnpinEditorAction.LABEL);
  }
  get templateId() {
    return _OpenEditorRenderer.ID;
  }
  renderTemplate(container) {
    const editorTemplate = /* @__PURE__ */ Object.create(null);
    editorTemplate.container = container;
    editorTemplate.actionRunner = new OpenEditorActionRunner();
    editorTemplate.actionBar = new ActionBar(container, { actionRunner: editorTemplate.actionRunner });
    editorTemplate.root = this.labels.create(container);
    return editorTemplate;
  }
  renderElement(openedEditor, _index, templateData) {
    const editor = openedEditor.editor;
    templateData.actionRunner.editor = openedEditor;
    templateData.container.classList.toggle("dirty", editor.isDirty() && !editor.isSaving());
    templateData.container.classList.toggle("sticky", openedEditor.isSticky());
    templateData.root.setResource({
      resource: EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.BOTH }),
      name: editor.getName(),
      description: editor.getDescription(Verbosity.MEDIUM)
    }, {
      italic: openedEditor.isPreview(),
      extraClasses: ["open-editor"].concat(openedEditor.editor.getLabelExtraClasses()),
      fileDecorations: this.configurationService.getValue().explorer.decorations,
      title: editor.getTitle(Verbosity.LONG),
      icon: editor.getIcon()
    });
    const editorAction = openedEditor.isSticky() ? this.unpinEditorAction : this.closeEditorAction;
    if (!templateData.actionBar.hasAction(editorAction)) {
      if (!templateData.actionBar.isEmpty()) {
        templateData.actionBar.clear();
      }
      templateData.actionBar.push(editorAction, { icon: true, label: false, keybinding: this.keybindingService.lookupKeybinding(editorAction.id)?.getLabel() });
    }
  }
  disposeTemplate(templateData) {
    templateData.actionBar.dispose();
    templateData.root.dispose();
    templateData.actionRunner.dispose();
  }
};
_OpenEditorRenderer.ID = "openeditor";
let OpenEditorRenderer = _OpenEditorRenderer;
class OpenEditorsDragAndDrop {
  constructor(sortOrder, instantiationService, editorGroupService) {
    this.instantiationService = instantiationService;
    this.editorGroupService = editorGroupService;
    this._sortOrder = sortOrder;
  }
  set sortOrder(value) {
    this._sortOrder = value;
  }
  get dropHandler() {
    return this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: false });
  }
  getDragURI(element) {
    if (element instanceof OpenEditor) {
      const resource = element.getResource();
      if (resource) {
        return resource.toString();
      }
    }
    return null;
  }
  getDragLabel(elements) {
    if (elements.length > 1) {
      return String(elements.length);
    }
    const element = elements[0];
    return element instanceof OpenEditor ? element.editor.getName() : element.label;
  }
  onDragStart(data, originalEvent) {
    const items = data.elements;
    const editors = [];
    if (items) {
      for (const item of items) {
        if (item instanceof OpenEditor) {
          editors.push(item);
        }
      }
    }
    if (editors.length) {
      this.instantiationService.invokeFunction(fillEditorsDragData, editors, originalEvent);
    }
  }
  onDragOver(data, _targetElement, _targetIndex, targetSector, originalEvent) {
    if (data instanceof NativeDragAndDropData) {
      if (!containsDragType(originalEvent, DataTransfers.FILES, CodeDataTransfers.FILES)) {
        return false;
      }
    }
    if (this._sortOrder !== "editorOrder") {
      if (data instanceof ElementsDragAndDropData) {
        return false;
      } else {
        return { accept: true, effect: { type: ListDragOverEffectType.Move }, feedback: [-1] };
      }
    }
    let dropEffectPosition = void 0;
    switch (targetSector) {
      case ListViewTargetSector.TOP:
      case ListViewTargetSector.CENTER_TOP:
        dropEffectPosition = _targetIndex === 0 && _targetElement instanceof EditorGroupView ? ListDragOverEffectPosition.After : ListDragOverEffectPosition.Before;
        break;
      case ListViewTargetSector.CENTER_BOTTOM:
      case ListViewTargetSector.BOTTOM:
        dropEffectPosition = ListDragOverEffectPosition.After;
        break;
    }
    return { accept: true, effect: { type: ListDragOverEffectType.Move, position: dropEffectPosition }, feedback: [_targetIndex] };
  }
  drop(data, targetElement, _targetIndex, targetSector, originalEvent) {
    let group = targetElement instanceof OpenEditor ? targetElement.group : targetElement || this.editorGroupService.groups[this.editorGroupService.count - 1];
    let targetEditorIndex = targetElement instanceof OpenEditor ? targetElement.group.getIndexOfEditor(targetElement.editor) : 0;
    switch (targetSector) {
      case ListViewTargetSector.TOP:
      case ListViewTargetSector.CENTER_TOP:
        if (targetElement instanceof EditorGroupView && group.index !== 0) {
          group = this.editorGroupService.groups[group.index - 1];
          targetEditorIndex = group.count;
        }
        break;
      case ListViewTargetSector.BOTTOM:
      case ListViewTargetSector.CENTER_BOTTOM:
        if (targetElement instanceof OpenEditor) {
          targetEditorIndex++;
        }
        break;
    }
    if (data instanceof ElementsDragAndDropData) {
      for (const oe of data.elements) {
        const sourceEditorIndex = oe.group.getIndexOfEditor(oe.editor);
        if (oe.group === group && sourceEditorIndex < targetEditorIndex) {
          targetEditorIndex--;
        }
        oe.group.moveEditor(oe.editor, group, { index: targetEditorIndex, preserveFocus: true });
        targetEditorIndex++;
      }
      this.editorGroupService.activateGroup(group);
    } else {
      this.dropHandler.handleDrop(originalEvent, mainWindow, () => group, () => group.focus(), { index: targetEditorIndex });
    }
  }
  dispose() {
  }
}
__decorateClass([
  memoize
], OpenEditorsDragAndDrop.prototype, "dropHandler", 1);
class OpenEditorsAccessibilityProvider {
  getWidgetAriaLabel() {
    return nls.localize("openEditors", "Open Editors");
  }
  getAriaLabel(element) {
    if (element instanceof OpenEditor) {
      return `${element.editor.getName()}, ${element.editor.getDescription()}`;
    }
    return element.ariaLabel;
  }
}
const toggleEditorGroupLayoutId = "workbench.action.toggleEditorGroupLayout";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleEditorGroupLayout",
      title: nls.localize2("flipLayout", "Toggle Vertical/Horizontal Editor Layout"),
      f1: true,
      keybinding: {
        primary: KeyMod.Shift | KeyMod.Alt | KeyCode.Digit0,
        mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Digit0 },
        weight: KeybindingWeight.WorkbenchContrib
      },
      icon: Codicon.editorLayout,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", OpenEditorsView.ID), MultipleEditorGroupsContext),
        order: 10
      }
    });
  }
  async run(accessor) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    const newOrientation = editorGroupService.orientation === GroupOrientation.VERTICAL ? GroupOrientation.HORIZONTAL : GroupOrientation.VERTICAL;
    editorGroupService.setGroupOrientation(newOrientation);
    editorGroupService.activeGroup.focus();
  }
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "5_flip",
  command: {
    id: toggleEditorGroupLayoutId,
    title: {
      ...nls.localize2("miToggleEditorLayoutWithoutMnemonic", "Flip Layout"),
      mnemonicTitle: nls.localize({ key: "miToggleEditorLayout", comment: ["&& denotes a mnemonic"] }, "Flip &&Layout")
    }
  },
  order: 1
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.files.saveAll",
      title: SAVE_ALL_LABEL,
      f1: true,
      icon: Codicon.saveAll,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.equals("view", OpenEditorsView.ID),
        order: 20
      }
    });
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    await commandService.executeCommand(SAVE_ALL_COMMAND_ID);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "openEditors.closeAll",
      title: CloseAllEditorsAction.LABEL,
      f1: false,
      icon: Codicon.closeAll,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.equals("view", OpenEditorsView.ID),
        order: 30
      }
    });
  }
  async run(accessor) {
    const instantiationService = accessor.get(IInstantiationService);
    const closeAll = new CloseAllEditorsAction();
    await instantiationService.invokeFunction((accessor2) => closeAll.run(accessor2));
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "openEditors.newUntitledFile",
      title: nls.localize2("newUntitledFile", "New Untitled Text File"),
      f1: false,
      icon: Codicon.newFile,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.equals("view", OpenEditorsView.ID),
        order: 5
      }
    });
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    await commandService.executeCommand(NEW_UNTITLED_FILE_COMMAND_ID);
  }
});
export {
  OpenEditorsView,
  findFirstDirtyEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFxicm93c2VyXFx2aWV3c1xcb3BlbkVkaXRvcnNWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL29wZW5lZGl0b3JzLmNzcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBBY3Rpb25SdW5uZXIsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UsIElFZGl0b3JHcm91cCwgR3JvdXBzT3JkZXIsIEdyb3VwT3JpZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IFZlcmJvc2l0eSwgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgU2lkZUJ5U2lkZUVkaXRvciwgSUVkaXRvcklkZW50aWZpZXIsIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLCBwcmV2ZW50RWRpdG9yQ2xvc2UsIEVkaXRvckNsb3NlTWV0aG9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgU2F2ZUFsbEluR3JvdXBBY3Rpb24sIENsb3NlR3JvdXBBY3Rpb24gfSBmcm9tICcuLi9maWxlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBPcGVuRWRpdG9yc0ZvY3VzZWRDb250ZXh0LCBFeHBsb3JlckZvY3VzZWRDb250ZXh0LCBJRmlsZXNDb25maWd1cmF0aW9uLCBPcGVuRWRpdG9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IENsb3NlQWxsRWRpdG9yc0FjdGlvbiwgQ2xvc2VFZGl0b3JBY3Rpb24sIFVucGluRWRpdG9yQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UsIENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlLCBiYWRnZUJhY2tncm91bmQsIGJhZGdlRm9yZWdyb3VuZCwgY29udHJhc3RCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlLCBJTGlzdFJlbmRlcmVyLCBJTGlzdENvbnRleHRNZW51RXZlbnQsIElMaXN0RHJhZ0FuZERyb3AsIElMaXN0RHJhZ092ZXJSZWFjdGlvbiwgTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24sIExpc3REcmFnT3ZlckVmZmVjdFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IFJlc291cmNlTGFiZWxzLCBJUmVzb3VyY2VMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZU1hcCwgSURpc3Bvc2FibGUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWVudUlkLCBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgT3BlbkVkaXRvcnNEaXJ0eUVkaXRvckNvbnRleHQsIE9wZW5FZGl0b3JzR3JvdXBDb250ZXh0LCBPcGVuRWRpdG9yc1JlYWRvbmx5RWRpdG9yQ29udGV4dCwgU0FWRV9BTExfTEFCRUwsIFNBVkVfQUxMX0NPTU1BTkRfSUQsIE5FV19VTlRJVExFRF9GSUxFX0NPTU1BTkRfSUQsIE9wZW5FZGl0b3JzU2VsZWN0ZWRGaWxlT3JVbnRpdGxlZENvbnRleHQgfSBmcm9tICcuLi9maWxlQ29uc3RhbnRzLmpzJztcbmltcG9ydCB7IFJlc291cmNlQ29udGV4dEtleSwgTXVsdGlwbGVFZGl0b3JHcm91cHNDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IENvZGVEYXRhVHJhbnNmZXJzLCBjb250YWluc0RyYWdUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZG5kL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IFJlc291cmNlc0Ryb3BIYW5kbGVyLCBmaWxsRWRpdG9yc0RyYWdEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3bGV0Vmlld09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdzVmlld2xldC5qcyc7XG5pbXBvcnQgeyBJRHJhZ0FuZERyb3BEYXRhLCBEYXRhVHJhbnNmZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBFbGVtZW50c0RyYWdBbmREcm9wRGF0YSwgTGlzdFZpZXdUYXJnZXRTZWN0b3IsIE5hdGl2ZURyYWdBbmREcm9wRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RWaWV3LmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weSwgV29ya2luZ0NvcHlDYXBhYmlsaXRpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IE9yaWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NwbGl0dmlldy9zcGxpdHZpZXcuanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IGNvbXBhcmVGaWxlTmFtZXNEZWZhdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29tcGFyZXJzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZXh0VXJpSWdub3JlUGF0aENhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSUxvY2FsaXplZFN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEVkaXRvckdyb3VwVmlldyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvckdyb3VwVmlldy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUsIEdlc3R1cmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG4vKipcbiAqIEZpbmRzIHRoZSBmaXJzdCBlZGl0b3Igd2l0aCB1bnNhdmVkIGNoYW5nZXMgaW4gaW5kZXggb3JkZXIsIGkuZS4gdGhlIGZpcnN0XG4gKiB1bnNhdmVkIGVkaXRvciBvZiB0aGUgZmlyc3QgZ3JvdXAgdGhhdCBoYXMgb25lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZmluZEZpcnN0RGlydHlFZGl0b3IoZ3JvdXBzOiByZWFkb25seSBJRWRpdG9yR3JvdXBbXSk6IE9wZW5FZGl0b3IgfCB1bmRlZmluZWQge1xuXHRmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwcykge1xuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGdyb3VwLmVkaXRvcnMpIHtcblx0XHRcdGlmIChlZGl0b3IuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgT3BlbkVkaXRvcihlZGl0b3IsIGdyb3VwKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgT3BlbkVkaXRvcnNWaWV3IGV4dGVuZHMgVmlld1BhbmUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERFRkFVTFRfVklTSUJMRV9PUEVOX0VESVRPUlMgPSA5O1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBERUZBVUxUX01JTl9WSVNJQkxFX09QRU5fRURJVE9SUyA9IDA7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZXhwbG9yZXIub3BlbkVkaXRvcnNWaWV3Jztcblx0c3RhdGljIHJlYWRvbmx5IE5BTUU6IElMb2NhbGl6ZWRTdHJpbmcgPSBubHMubG9jYWxpemUyKHsga2V5OiAnb3BlbkVkaXRvcnMnLCBjb21tZW50OiBbJ09wZW4gaXMgYW4gYWRqZWN0aXZlJ10gfSwgXCJPcGVuIEVkaXRvcnNcIik7XG5cblx0cHJpdmF0ZSBkaXJ0eUNvdW50RWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGxpc3RSZWZyZXNoU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHN0cnVjdHVyYWxSZWZyZXNoRGVsYXk6IG51bWJlcjtcblx0cHJpdmF0ZSBkbmQ6IE9wZW5FZGl0b3JzRHJhZ0FuZERyb3AgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbGlzdDogV29ya2JlbmNoTGlzdDxPcGVuRWRpdG9yIHwgSUVkaXRvckdyb3VwPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBsaXN0TGFiZWxzOiBSZXNvdXJjZUxhYmVscyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBuZWVkc1JlZnJlc2ggPSBmYWxzZTtcblx0cHJpdmF0ZSBlbGVtZW50czogKE9wZW5FZGl0b3IgfCBJRWRpdG9yR3JvdXApW10gPSBbXTtcblx0cHJpdmF0ZSBzb3J0T3JkZXI6ICdlZGl0b3JPcmRlcicgfCAnYWxwaGFiZXRpY2FsJyB8ICdmdWxsUGF0aCc7XG5cdHByaXZhdGUgYmxvY2tGb2N1c0FjdGl2ZUVkaXRvclRyYWNraW5nID0gZmFsc2U7XG5cdHByaXZhdGUgcHJlc2VydmVTZWxlY3Rpb25PblJlZnJlc2ggPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JJZHMgPSBuZXcgV2Vha01hcDxFZGl0b3JJbnB1dCwgbnVtYmVyPigpO1xuXHRwcml2YXRlIGVkaXRvcklkUG9vbCA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSVZpZXdsZXRWaWV3T3B0aW9ucyxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JraW5nQ29weVNlcnZpY2U6IElXb3JraW5nQ29weVNlcnZpY2UsXG5cdFx0QElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKG9wdGlvbnMsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXG5cdFx0dGhpcy5zdHJ1Y3R1cmFsUmVmcmVzaERlbGF5ID0gMDtcblx0XHR0aGlzLnNvcnRPcmRlciA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdleHBsb3Jlci5vcGVuRWRpdG9ycy5zb3J0T3JkZXInKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJVcGRhdGVFdmVudHMoKTtcblxuXHRcdC8vIEFsc28gaGFuZGxlIGNvbmZpZ3VyYXRpb24gdXBkYXRlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4gdGhpcy5vbkNvbmZpZ3VyYXRpb25DaGFuZ2UoZSkpKTtcblxuXHRcdC8vIEhhbmRsZSBkaXJ0eSBjb3VudGVyXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3JraW5nQ29weVNlcnZpY2Uub25EaWRDaGFuZ2VEaXJ0eSh3b3JraW5nQ29weSA9PiB0aGlzLnVwZGF0ZURpcnR5SW5kaWNhdG9yKHdvcmtpbmdDb3B5KSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclVwZGF0ZUV2ZW50cygpOiB2b2lkIHtcblx0XHRjb25zdCB1cGRhdGVXaG9sZUxpc3QgPSAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuaXNCb2R5VmlzaWJsZSgpIHx8ICF0aGlzLmxpc3QpIHtcblx0XHRcdFx0dGhpcy5uZWVkc1JlZnJlc2ggPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuc2NoZWR1bGVMaXN0UmVmcmVzaChmYWxzZSwgdGhpcy5zdHJ1Y3R1cmFsUmVmcmVzaERlbGF5KTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZ3JvdXBEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlcj4oKSk7XG5cdFx0Y29uc3QgYWRkR3JvdXBMaXN0ZW5lciA9IChncm91cDogSUVkaXRvckdyb3VwKSA9PiB7XG5cdFx0XHRjb25zdCBncm91cE1vZGVsQ2hhbmdlTGlzdGVuZXIgPSBncm91cC5vbkRpZE1vZGVsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5saXN0UmVmcmVzaFNjaGVkdWxlcj8uaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHRcdHN3aXRjaCAoZS5raW5kKSB7XG5cdFx0XHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9BQ1RJVkU6XG5cdFx0XHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9PUEVOOlxuXHRcdFx0XHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfTU9WRTpcblx0XHRcdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0NMT1NFOlxuXHRcdFx0XHRcdFx0XHR0aGlzLnByZXNlcnZlU2VsZWN0aW9uT25SZWZyZXNoID0gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXRoaXMuaXNCb2R5VmlzaWJsZSgpIHx8ICF0aGlzLmxpc3QpIHtcblx0XHRcdFx0XHR0aGlzLm5lZWRzUmVmcmVzaCA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLmdldEluZGV4KGdyb3VwLCBlLmVkaXRvcik7XG5cdFx0XHRcdHN3aXRjaCAoZS5raW5kKSB7XG5cdFx0XHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfQUNUSVZFOlxuXHRcdFx0XHRcdFx0dGhpcy5mb2N1c0FjdGl2ZUVkaXRvcigpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5HUk9VUF9JTkRFWDpcblx0XHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkdST1VQX0xBQkVMOlxuXHRcdFx0XHRcdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5saXN0LnNwbGljZShpbmRleCwgMSwgW2dyb3VwXSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9ESVJUWTpcblx0XHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9TVElDS1k6XG5cdFx0XHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfQ0FQQUJJTElUSUVTOlxuXHRcdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX1BJTjpcblx0XHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9MQUJFTDpcblx0XHRcdFx0XHRcdHRoaXMubGlzdC5zcGxpY2UoaW5kZXgsIDEsIFtuZXcgT3BlbkVkaXRvcihlLmVkaXRvciEsIGdyb3VwKV0pO1xuXHRcdFx0XHRcdFx0dGhpcy5mb2N1c0FjdGl2ZUVkaXRvcih0cnVlKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX09QRU46XG5cdFx0XHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfTU9WRTpcblx0XHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9DTE9TRTpcblx0XHRcdFx0XHRcdHVwZGF0ZVdob2xlTGlzdCgpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Z3JvdXBEaXNwb3NhYmxlcy5zZXQoZ3JvdXAuaWQsIGdyb3VwTW9kZWxDaGFuZ2VMaXN0ZW5lcik7XG5cdFx0fTtcblxuXHRcdHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmdyb3Vwcy5mb3JFYWNoKGcgPT4gYWRkR3JvdXBMaXN0ZW5lcihnKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JHcm91cFNlcnZpY2Uub25EaWRBZGRHcm91cChncm91cCA9PiB7XG5cdFx0XHRhZGRHcm91cExpc3RlbmVyKGdyb3VwKTtcblx0XHRcdHVwZGF0ZVdob2xlTGlzdCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvckdyb3VwU2VydmljZS5vbkRpZE1vdmVHcm91cCgoKSA9PiB1cGRhdGVXaG9sZUxpc3QoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm9uRGlkQ2hhbmdlQWN0aXZlR3JvdXAoKCkgPT4gdGhpcy5mb2N1c0FjdGl2ZUVkaXRvcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JHcm91cFNlcnZpY2Uub25EaWRSZW1vdmVHcm91cChncm91cCA9PiB7XG5cdFx0XHRncm91cERpc3Bvc2FibGVzLmRlbGV0ZUFuZERpc3Bvc2UoZ3JvdXAuaWQpO1xuXHRcdFx0dXBkYXRlV2hvbGVMaXN0KCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckhlYWRlclRpdGxlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJIZWFkZXJUaXRsZShjb250YWluZXIsIHRoaXMudGl0bGUpO1xuXG5cdFx0Y29uc3QgY291bnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm9wZW4tZWRpdG9ycy1kaXJ0eS1jb3VudC1jb250YWluZXInKSk7XG5cdFx0dGhpcy5kaXJ0eUNvdW50RWxlbWVudCA9IGRvbS5hcHBlbmQoY291bnQsICQoJy5kaXJ0eS1jb3VudC5tb25hY28tY291bnQtYmFkZ2UubG9uZycpKTtcblxuXHRcdHRoaXMuZGlydHlDb3VudEVsZW1lbnQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYXNDc3NWYXJpYWJsZShiYWRnZUJhY2tncm91bmQpO1xuXHRcdHRoaXMuZGlydHlDb3VudEVsZW1lbnQuc3R5bGUuY29sb3IgPSBhc0Nzc1ZhcmlhYmxlKGJhZGdlRm9yZWdyb3VuZCk7XG5cdFx0dGhpcy5kaXJ0eUNvdW50RWxlbWVudC5zdHlsZS5ib3JkZXIgPSBgMXB4IHNvbGlkICR7YXNDc3NWYXJpYWJsZShjb250cmFzdEJvcmRlcil9YDtcblxuXHRcdC8vIFRoZSBiYWRnZSBhY3RzIGFzIGEgc2hvcnRjdXQgdG8gdGhlIGZpcnN0IGVkaXRvciB3aXRoIHVuc2F2ZWQgY2hhbmdlc1xuXHRcdHRoaXMuZGlydHlDb3VudEVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdHRoaXMuZGlydHlDb3VudEVsZW1lbnQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHRoaXMuZGlydHlDb3VudEVsZW1lbnQsIG5scy5sb2NhbGl6ZSgnb3BlblVuc2F2ZWRFZGl0b3InLCBcIk9wZW4gVW5zYXZlZCBFZGl0b3JcIikpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihHZXN0dXJlLmFkZFRhcmdldCh0aGlzLmRpcnR5Q291bnRFbGVtZW50KSk7XG5cdFx0Zm9yIChjb25zdCBldmVudFR5cGUgb2YgW2RvbS5FdmVudFR5cGUuQ0xJQ0ssIFRvdWNoRXZlbnRUeXBlLlRhcF0pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kaXJ0eUNvdW50RWxlbWVudCwgZXZlbnRUeXBlLCBlID0+IHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7IC8vIHByZXZlbnQgdGhlIHBhbmUgZnJvbSB0b2dnbGluZyBpdHMgZXhwYW5kZWQgc3RhdGVcblx0XHRcdFx0dGhpcy5vcGVuRmlyc3REaXJ0eUVkaXRvcigpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZGlydHlDb3VudEVsZW1lbnQsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7IC8vIHByZXZlbnQgdGhlIHBhbmUgZnJvbSB0b2dnbGluZyBpdHMgZXhwYW5kZWQgc3RhdGVcblx0XHRcdFx0dGhpcy5vcGVuRmlyc3REaXJ0eUVkaXRvcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMudXBkYXRlRGlydHlJbmRpY2F0b3IoKTtcblx0fVxuXG5cdHByaXZhdGUgb3BlbkZpcnN0RGlydHlFZGl0b3IoKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3BlbkVkaXRvciA9IGZpbmRGaXJzdERpcnR5RWRpdG9yKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmdldEdyb3VwcyhHcm91cHNPcmRlci5HUklEX0FQUEVBUkFOQ0UpKTtcblx0XHRpZiAob3BlbkVkaXRvcikge1xuXHRcdFx0dGhpcy5vcGVuRWRpdG9yKG9wZW5FZGl0b3IsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KGNvbnRhaW5lcik7XG5cblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnb3Blbi1lZGl0b3JzJyk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Nob3ctZmlsZS1pY29ucycpO1xuXG5cdFx0Y29uc3QgZGVsZWdhdGUgPSBuZXcgT3BlbkVkaXRvcnNEZWxlZ2F0ZSgpO1xuXG5cdFx0aWYgKHRoaXMubGlzdCkge1xuXHRcdFx0dGhpcy5saXN0LmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMubGlzdExhYmVscykge1xuXHRcdFx0dGhpcy5saXN0TGFiZWxzLmNsZWFyKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kbmQgPSBuZXcgT3BlbkVkaXRvcnNEcmFnQW5kRHJvcCh0aGlzLnNvcnRPcmRlciwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UpO1xuXG5cdFx0dGhpcy5saXN0TGFiZWxzID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxhYmVscywgeyBvbkRpZENoYW5nZVZpc2liaWxpdHk6IHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSB9KTtcblx0XHR0aGlzLmxpc3QgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaExpc3QsICdPcGVuRWRpdG9ycycsIGNvbnRhaW5lciwgZGVsZWdhdGUsIFtcblx0XHRcdG5ldyBFZGl0b3JHcm91cFJlbmRlcmVyKHRoaXMua2V5YmluZGluZ1NlcnZpY2UsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpLFxuXHRcdFx0bmV3IE9wZW5FZGl0b3JSZW5kZXJlcih0aGlzLmxpc3RMYWJlbHMsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoaXMua2V5YmluZGluZ1NlcnZpY2UsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpXG5cdFx0XSwge1xuXHRcdFx0aWRlbnRpdHlQcm92aWRlcjogeyBnZXRJZDogKGVsZW1lbnQ6IE9wZW5FZGl0b3IgfCBJRWRpdG9yR3JvdXApID0+IHRoaXMuZ2V0RWxlbWVudElkKGVsZW1lbnQpIH0sXG5cdFx0XHRkbmQ6IHRoaXMuZG5kLFxuXHRcdFx0b3ZlcnJpZGVTdHlsZXM6IHRoaXMuZ2V0TG9jYXRpb25CYXNlZENvbG9ycygpLmxpc3RPdmVycmlkZVN0eWxlcyxcblx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IE9wZW5FZGl0b3JzQWNjZXNzaWJpbGl0eVByb3ZpZGVyKCksXG5cdFx0XHRvcGVuT25TaW5nbGVDbGljazogdHJ1ZVxuXHRcdH0pIGFzIFdvcmtiZW5jaExpc3Q8T3BlbkVkaXRvciB8IElFZGl0b3JHcm91cD47XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpc3RMYWJlbHMpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIHJlZnJlc2ggc2NoZWR1bGVyXG5cdFx0bGV0IGxhYmVsQ2hhbmdlTGlzdGVuZXJzOiBJRGlzcG9zYWJsZVtdID0gW107XG5cdFx0dGhpcy5saXN0UmVmcmVzaFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdGNvbnN0IHByZXNlcnZlU2VsZWN0aW9uID0gdGhpcy5wcmVzZXJ2ZVNlbGVjdGlvbk9uUmVmcmVzaDtcblx0XHRcdHRoaXMucHJlc2VydmVTZWxlY3Rpb25PblJlZnJlc2ggPSBmYWxzZTtcblxuXHRcdFx0Ly8gTm8gbmVlZCB0byByZWZyZXNoIHRoZSBsaXN0IGlmIGl0J3Mgbm90IHJlbmRlcmVkXG5cdFx0XHRpZiAoIXRoaXMubGlzdCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRsYWJlbENoYW5nZUxpc3RlbmVycyA9IGRpc3Bvc2UobGFiZWxDaGFuZ2VMaXN0ZW5lcnMpO1xuXHRcdFx0Y29uc3QgcHJldmlvdXNMZW5ndGggPSB0aGlzLmxpc3QubGVuZ3RoO1xuXHRcdFx0Y29uc3QgZWxlbWVudHMgPSB0aGlzLmdldEVsZW1lbnRzKCk7XG5cdFx0XHR0aGlzLmxpc3Quc3BsaWNlKDAsIHRoaXMubGlzdC5sZW5ndGgsIGVsZW1lbnRzKTtcblx0XHRcdHRoaXMuZm9jdXNBY3RpdmVFZGl0b3IocHJlc2VydmVTZWxlY3Rpb24pO1xuXHRcdFx0aWYgKHByZXZpb3VzTGVuZ3RoICE9PSB0aGlzLmxpc3QubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU2l6ZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5uZWVkc1JlZnJlc2ggPSBmYWxzZTtcblxuXHRcdFx0aWYgKHRoaXMuc29ydE9yZGVyID09PSAnYWxwaGFiZXRpY2FsJyB8fCB0aGlzLnNvcnRPcmRlciA9PT0gJ2Z1bGxQYXRoJykge1xuXHRcdFx0XHQvLyBXZSBuZWVkIHRvIHJlc29ydCB0aGUgbGlzdCBpZiB0aGUgZWRpdG9yIGxhYmVsIGNoYW5nZWRcblx0XHRcdFx0ZWxlbWVudHMuZm9yRWFjaChlID0+IHtcblx0XHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIE9wZW5FZGl0b3IpIHtcblx0XHRcdFx0XHRcdGxhYmVsQ2hhbmdlTGlzdGVuZXJzLnB1c2goZS5lZGl0b3Iub25EaWRDaGFuZ2VMYWJlbCgoKSA9PiB0aGlzLnNjaGVkdWxlTGlzdFJlZnJlc2godHJ1ZSkpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0sIHRoaXMuc3RydWN0dXJhbFJlZnJlc2hEZWxheSkpO1xuXG5cdFx0dGhpcy51cGRhdGVTaXplKCk7XG5cblx0XHR0aGlzLmhhbmRsZUNvbnRleHRLZXlzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0Lm9uQ29udGV4dE1lbnUoZSA9PiB0aGlzLm9uTGlzdENvbnRleHRNZW51KGUpKSk7XG5cblx0XHQvLyBPcGVuIHdoZW4gc2VsZWN0aW5nIHZpYSBrZXlib2FyZFxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdC5vbk1vdXNlTWlkZGxlQ2xpY2soZSA9PiB7XG5cdFx0XHRpZiAoZSAmJiBlLmVsZW1lbnQgaW5zdGFuY2VvZiBPcGVuRWRpdG9yKSB7XG5cdFx0XHRcdGlmIChwcmV2ZW50RWRpdG9yQ2xvc2UoZS5lbGVtZW50Lmdyb3VwLCBlLmVsZW1lbnQuZWRpdG9yLCBFZGl0b3JDbG9zZU1ldGhvZC5NT1VTRSwgdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UucGFydE9wdGlvbnMpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZS5lbGVtZW50Lmdyb3VwLmNsb3NlRWRpdG9yKGUuZWxlbWVudC5lZGl0b3IsIHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0Lm9uRGlkT3BlbihlID0+IHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBlLmVsZW1lbnQ7XG5cdFx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBlbHNlIGlmIChlbGVtZW50IGluc3RhbmNlb2YgT3BlbkVkaXRvcikge1xuXHRcdFx0XHRpZiAoZG9tLmlzTW91c2VFdmVudChlLmJyb3dzZXJFdmVudCkgJiYgZS5icm93c2VyRXZlbnQuYnV0dG9uID09PSAxKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBtaWRkbGUgY2xpY2sgYWxyZWFkeSBoYW5kbGVkIGFib3ZlOiBjbG9zZXMgdGhlIGVkaXRvclxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy53aXRoQWN0aXZlRWRpdG9yRm9jdXNUcmFja2luZ0Rpc2FibGVkKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLm9wZW5FZGl0b3IoZWxlbWVudCwgeyBwcmVzZXJ2ZUZvY3VzOiBlLmVkaXRvck9wdGlvbnMucHJlc2VydmVGb2N1cywgcGlubmVkOiBlLmVkaXRvck9wdGlvbnMucGlubmVkLCBzaWRlQnlTaWRlOiBlLnNpZGVCeVNpZGUgfSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy53aXRoQWN0aXZlRWRpdG9yRm9jdXNUcmFja2luZ0Rpc2FibGVkKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmF0ZUdyb3VwKGVsZW1lbnQpO1xuXHRcdFx0XHRcdGlmICghZS5lZGl0b3JPcHRpb25zLnByZXNlcnZlRm9jdXMpIHtcblx0XHRcdFx0XHRcdGVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuc2NoZWR1bGVMaXN0UmVmcmVzaChmYWxzZSwgMCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkodmlzaWJsZSA9PiB7XG5cdFx0XHRpZiAodmlzaWJsZSAmJiB0aGlzLm5lZWRzUmVmcmVzaCkge1xuXHRcdFx0XHR0aGlzLnNjaGVkdWxlTGlzdFJlZnJlc2goZmFsc2UsIDApO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lck1vZGVsID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZCh0aGlzLmlkKSEpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbnRhaW5lck1vZGVsLm9uRGlkQ2hhbmdlQWxsVmlld0Rlc2NyaXB0b3JzKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlU2l6ZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlQ29udGV4dEtleXMoKSB7XG5cdFx0aWYgKCF0aGlzLmxpc3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBCaW5kIGNvbnRleHQga2V5c1xuXHRcdE9wZW5FZGl0b3JzRm9jdXNlZENvbnRleHQuYmluZFRvKHRoaXMubGlzdC5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0RXhwbG9yZXJGb2N1c2VkQ29udGV4dC5iaW5kVG8odGhpcy5saXN0LmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGdyb3VwRm9jdXNlZENvbnRleHQgPSBPcGVuRWRpdG9yc0dyb3VwQ29udGV4dC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgZGlydHlFZGl0b3JGb2N1c2VkQ29udGV4dCA9IE9wZW5FZGl0b3JzRGlydHlFZGl0b3JDb250ZXh0LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCByZWFkb25seUVkaXRvckZvY3VzZWRDb250ZXh0ID0gT3BlbkVkaXRvcnNSZWFkb25seUVkaXRvckNvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IG9wZW5FZGl0b3JzU2VsZWN0ZWRGaWxlT3JVbnRpdGxlZENvbnRleHQgPSBPcGVuRWRpdG9yc1NlbGVjdGVkRmlsZU9yVW50aXRsZWRDb250ZXh0LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlc291cmNlQ29udGV4dCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VDb250ZXh0S2V5KTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZXNvdXJjZUNvbnRleHQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0Lm9uRGlkQ2hhbmdlRm9jdXMoZSA9PiB7XG5cdFx0XHRyZXNvdXJjZUNvbnRleHQucmVzZXQoKTtcblx0XHRcdGdyb3VwRm9jdXNlZENvbnRleHQucmVzZXQoKTtcblx0XHRcdGRpcnR5RWRpdG9yRm9jdXNlZENvbnRleHQucmVzZXQoKTtcblx0XHRcdHJlYWRvbmx5RWRpdG9yRm9jdXNlZENvbnRleHQucmVzZXQoKTtcblxuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGUuZWxlbWVudHMubGVuZ3RoID8gZS5lbGVtZW50c1swXSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgT3BlbkVkaXRvcikge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IGVsZW1lbnQuZ2V0UmVzb3VyY2UoKTtcblx0XHRcdFx0ZGlydHlFZGl0b3JGb2N1c2VkQ29udGV4dC5zZXQoZWxlbWVudC5lZGl0b3IuaXNEaXJ0eSgpICYmICFlbGVtZW50LmVkaXRvci5pc1NhdmluZygpKTtcblx0XHRcdFx0cmVhZG9ubHlFZGl0b3JGb2N1c2VkQ29udGV4dC5zZXQoISFlbGVtZW50LmVkaXRvci5pc1JlYWRvbmx5KCkpO1xuXHRcdFx0XHRyZXNvdXJjZUNvbnRleHQuc2V0KHJlc291cmNlID8/IG51bGwpO1xuXHRcdFx0fSBlbHNlIGlmIChlbGVtZW50KSB7XG5cdFx0XHRcdGdyb3VwRm9jdXNlZENvbnRleHQuc2V0KHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdC5vbkRpZENoYW5nZVNlbGVjdGlvbihlID0+IHtcblx0XHRcdGNvbnN0IHNlbGVjdGVkQXJlRmlsZU9yVW50aXRsZWQgPSBlLmVsZW1lbnRzLmV2ZXJ5KGUgPT4ge1xuXHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIE9wZW5FZGl0b3IpIHtcblx0XHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IGUuZ2V0UmVzb3VyY2UoKTtcblx0XHRcdFx0XHRyZXR1cm4gcmVzb3VyY2UgJiYgKHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCB8fCB0aGlzLmZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKHJlc291cmNlKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSk7XG5cdFx0XHRvcGVuRWRpdG9yc1NlbGVjdGVkRmlsZU9yVW50aXRsZWRDb250ZXh0LnNldChzZWxlY3RlZEFyZUZpbGVPclVudGl0bGVkKTtcblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXG5cdFx0dGhpcy5saXN0Py5kb21Gb2N1cygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMubGlzdD8ubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgc2hvd0dyb3VwcygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuZ3JvdXBzLmxlbmd0aCA+IDE7XG5cdH1cblxuXHRwcml2YXRlIGdldEVsZW1lbnRzKCk6IEFycmF5PElFZGl0b3JHcm91cCB8IE9wZW5FZGl0b3I+IHtcblx0XHR0aGlzLmVsZW1lbnRzID0gW107XG5cdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLkdSSURfQVBQRUFSQU5DRSkuZm9yRWFjaChnID0+IHtcblx0XHRcdGlmICh0aGlzLnNob3dHcm91cHMpIHtcblx0XHRcdFx0dGhpcy5lbGVtZW50cy5wdXNoKGcpO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGVkaXRvcnMgPSBnLmVkaXRvcnMubWFwKGVpID0+IG5ldyBPcGVuRWRpdG9yKGVpLCBnKSk7XG5cdFx0XHRpZiAodGhpcy5zb3J0T3JkZXIgPT09ICdhbHBoYWJldGljYWwnKSB7XG5cdFx0XHRcdGVkaXRvcnMgPSBlZGl0b3JzLnNvcnQoKGZpcnN0LCBzZWNvbmQpID0+IGNvbXBhcmVGaWxlTmFtZXNEZWZhdWx0KGZpcnN0LmVkaXRvci5nZXROYW1lKCksIHNlY29uZC5lZGl0b3IuZ2V0TmFtZSgpKSk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuc29ydE9yZGVyID09PSAnZnVsbFBhdGgnKSB7XG5cdFx0XHRcdGVkaXRvcnMgPSBlZGl0b3JzLnNvcnQoKGZpcnN0LCBzZWNvbmQpID0+IHtcblx0XHRcdFx0XHRjb25zdCBmaXJzdFJlc291cmNlID0gZmlyc3QuZWRpdG9yLnJlc291cmNlO1xuXHRcdFx0XHRcdGNvbnN0IHNlY29uZFJlc291cmNlID0gc2Vjb25kLmVkaXRvci5yZXNvdXJjZTtcblx0XHRcdFx0XHQvL3B1dCAnc3lzdGVtJyBlZGl0b3JzIGJlZm9yZSBldmVyeXRoaW5nXG5cdFx0XHRcdFx0aWYgKGZpcnN0UmVzb3VyY2UgPT09IHVuZGVmaW5lZCAmJiBzZWNvbmRSZXNvdXJjZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gY29tcGFyZUZpbGVOYW1lc0RlZmF1bHQoZmlyc3QuZWRpdG9yLmdldE5hbWUoKSwgc2Vjb25kLmVkaXRvci5nZXROYW1lKCkpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZmlyc3RSZXNvdXJjZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChzZWNvbmRSZXNvdXJjZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgZmlyc3RTY2hlbWUgPSBmaXJzdFJlc291cmNlLnNjaGVtZTtcblx0XHRcdFx0XHRcdGNvbnN0IHNlY29uZFNjaGVtZSA9IHNlY29uZFJlc291cmNlLnNjaGVtZTtcblx0XHRcdFx0XHRcdC8vcHV0IG5vbi1maWxlIGVkaXRvcnMgYmVmb3JlIGZpbGVzXG5cdFx0XHRcdFx0XHRpZiAoZmlyc3RTY2hlbWUgIT09IFNjaGVtYXMuZmlsZSAmJiBzZWNvbmRTY2hlbWUgIT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZXh0VXJpSWdub3JlUGF0aENhc2UuY29tcGFyZShmaXJzdFJlc291cmNlLCBzZWNvbmRSZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGZpcnN0U2NoZW1lICE9PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChzZWNvbmRTY2hlbWUgIT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBleHRVcmlJZ25vcmVQYXRoQ2FzZS5jb21wYXJlKGZpcnN0UmVzb3VyY2UsIHNlY29uZFJlc291cmNlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5lbGVtZW50cy5wdXNoKC4uLmVkaXRvcnMpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHRoaXMuZWxlbWVudHM7XG5cdH1cblxuXHRwcml2YXRlIGdldEluZGV4KGdyb3VwOiBJRWRpdG9yR3JvdXAsIGVkaXRvcjogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQgfCBudWxsKTogbnVtYmVyIHtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZWxlbWVudHMuZmluZEluZGV4KGUgPT4gIShlIGluc3RhbmNlb2YgT3BlbkVkaXRvcikgJiYgZS5pZCA9PT0gZ3JvdXAuaWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmVsZW1lbnRzLmZpbmRJbmRleChlID0+IGUgaW5zdGFuY2VvZiBPcGVuRWRpdG9yICYmIGUuZWRpdG9yID09PSBlZGl0b3IgJiYgZS5ncm91cC5pZCA9PT0gZ3JvdXAuaWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBvcGVuRWRpdG9yKGVsZW1lbnQ6IE9wZW5FZGl0b3IsIG9wdGlvbnM6IHsgcHJlc2VydmVGb2N1cz86IGJvb2xlYW47IHBpbm5lZD86IGJvb2xlYW47IHNpZGVCeVNpZGU/OiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHRpZiAoZWxlbWVudCkge1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogJ3dvcmtiZW5jaC5maWxlcy5vcGVuRmlsZScsIGZyb206ICdvcGVuRWRpdG9ycycgfSk7XG5cblx0XHRcdGNvbnN0IHByZXNlcnZlQWN0aXZhdGVHcm91cCA9IG9wdGlvbnMuc2lkZUJ5U2lkZSAmJiBvcHRpb25zLnByZXNlcnZlRm9jdXM7IC8vIG5lZWRlZCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzQyMzk5XG5cdFx0XHRpZiAoIXByZXNlcnZlQWN0aXZhdGVHcm91cCkge1xuXHRcdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmF0ZUdyb3VwKGVsZW1lbnQuZ3JvdXApOyAvLyBuZWVkZWQgZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy82NjcyXG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0YXJnZXRHcm91cCA9IG9wdGlvbnMuc2lkZUJ5U2lkZSA/IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLnNpZGVHcm91cCA6IGVsZW1lbnQuZ3JvdXA7XG5cdFx0XHR0YXJnZXRHcm91cC5vcGVuRWRpdG9yKGVsZW1lbnQuZWRpdG9yLCBvcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uTGlzdENvbnRleHRNZW51KGU6IElMaXN0Q29udGV4dE1lbnVFdmVudDxPcGVuRWRpdG9yIHwgSUVkaXRvckdyb3VwPik6IHZvaWQge1xuXHRcdGlmICghZS5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWxlbWVudCA9IGUuZWxlbWVudDtcblxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRtZW51SWQ6IE1lbnVJZC5PcGVuRWRpdG9yc0NvbnRleHQsXG5cdFx0XHRtZW51QWN0aW9uT3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSwgYXJnOiBlbGVtZW50IGluc3RhbmNlb2YgT3BlbkVkaXRvciA/IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWxlbWVudC5lZGl0b3IpIDoge30gfSxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiB0aGlzLmxpc3Q/LmNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiBlbGVtZW50IGluc3RhbmNlb2YgT3BlbkVkaXRvciA/IHsgZ3JvdXBJZDogZWxlbWVudC5ncm91cElkLCBlZGl0b3JJbmRleDogZWxlbWVudC5ncm91cC5nZXRJbmRleE9mRWRpdG9yKGVsZW1lbnQuZWRpdG9yKSB9IDogeyBncm91cElkOiBlbGVtZW50LmlkIH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgd2l0aEFjdGl2ZUVkaXRvckZvY3VzVHJhY2tpbmdEaXNhYmxlZChmbjogKCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHRoaXMuYmxvY2tGb2N1c0FjdGl2ZUVkaXRvclRyYWNraW5nID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0Zm4oKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5ibG9ja0ZvY3VzQWN0aXZlRWRpdG9yVHJhY2tpbmcgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNjaGVkdWxlTGlzdFJlZnJlc2gocHJlc2VydmVTZWxlY3Rpb246IGJvb2xlYW4sIGRlbGF5PzogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmxpc3RSZWZyZXNoU2NoZWR1bGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFwcmVzZXJ2ZVNlbGVjdGlvbiB8fCAhdGhpcy5saXN0UmVmcmVzaFNjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHR0aGlzLnByZXNlcnZlU2VsZWN0aW9uT25SZWZyZXNoID0gcHJlc2VydmVTZWxlY3Rpb247XG5cdFx0fVxuXHRcdHRoaXMubGlzdFJlZnJlc2hTY2hlZHVsZXIuc2NoZWR1bGUoZGVsYXkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFbGVtZW50SWQoZWxlbWVudDogT3BlbkVkaXRvciB8IElFZGl0b3JHcm91cCk6IHN0cmluZyB7XG5cdFx0aWYgKCEoZWxlbWVudCBpbnN0YW5jZW9mIE9wZW5FZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5pZC50b1N0cmluZygpO1xuXHRcdH1cblxuXHRcdGxldCBlZGl0b3JJZCA9IHRoaXMuZWRpdG9ySWRzLmdldChlbGVtZW50LmVkaXRvcik7XG5cdFx0aWYgKGVkaXRvcklkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGVkaXRvcklkID0gdGhpcy5lZGl0b3JJZFBvb2wrKztcblx0XHRcdHRoaXMuZWRpdG9ySWRzLnNldChlbGVtZW50LmVkaXRvciwgZWRpdG9ySWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBgb3BlbmVkaXRvcjoke2VsZW1lbnQuZ3JvdXBJZH06JHtlZGl0b3JJZH1gO1xuXHR9XG5cblx0cHJpdmF0ZSBmb2N1c0FjdGl2ZUVkaXRvcihwcmVzZXJ2ZVNlbGVjdGlvbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmxpc3QgfHwgdGhpcy5ibG9ja0ZvY3VzQWN0aXZlRWRpdG9yVHJhY2tpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5saXN0Lmxlbmd0aCAmJiB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cCkge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLmdldEluZGV4KHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwLCB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cC5hY3RpdmVFZGl0b3IpO1xuXHRcdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR0aGlzLmxpc3Quc2V0Rm9jdXMoW2luZGV4XSk7XG5cdFx0XHRcdFx0aWYgKCFwcmVzZXJ2ZVNlbGVjdGlvbikge1xuXHRcdFx0XHRcdFx0dGhpcy5saXN0LnNldFNlbGVjdGlvbihbaW5kZXhdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5saXN0LnJldmVhbChpbmRleCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHQvLyBub29wIGxpc3QgdXBkYXRlZCBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5saXN0LnNldEZvY3VzKFtdKTtcblx0XHRpZiAoIXByZXNlcnZlU2VsZWN0aW9uKSB7XG5cdFx0XHR0aGlzLmxpc3Quc2V0U2VsZWN0aW9uKFtdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uQ29uZmlndXJhdGlvbkNoYW5nZShldmVudDogSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmIChldmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbignZXhwbG9yZXIub3BlbkVkaXRvcnMnKSkge1xuXHRcdFx0dGhpcy51cGRhdGVTaXplKCk7XG5cdFx0fVxuXHRcdC8vIFRyaWdnZXIgYSAncmVwYWludCcgd2hlbiBkZWNvcmF0aW9uIHNldHRpbmdzIGNoYW5nZSBvciB0aGUgc29ydCBvcmRlciBjaGFuZ2VkXG5cdFx0aWYgKGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKCdleHBsb3Jlci5kZWNvcmF0aW9ucycpIHx8IGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKCdleHBsb3Jlci5vcGVuRWRpdG9ycy5zb3J0T3JkZXInKSkge1xuXHRcdFx0dGhpcy5zb3J0T3JkZXIgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdleHBsb3Jlci5vcGVuRWRpdG9ycy5zb3J0T3JkZXInKTtcblx0XHRcdGlmICh0aGlzLmRuZCkge1xuXHRcdFx0XHR0aGlzLmRuZC5zb3J0T3JkZXIgPSB0aGlzLnNvcnRPcmRlcjtcblx0XHRcdH1cblx0XHRcdHRoaXMuc2NoZWR1bGVMaXN0UmVmcmVzaChmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTaXplKCk6IHZvaWQge1xuXHRcdC8vIEFkanVzdCBleHBhbmRlZCBib2R5IHNpemVcblx0XHR0aGlzLm1pbmltdW1Cb2R5U2l6ZSA9IHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMID8gdGhpcy5nZXRNaW5FeHBhbmRlZEJvZHlTaXplKCkgOiAxNzA7XG5cdFx0dGhpcy5tYXhpbXVtQm9keVNpemUgPSB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCA/IHRoaXMuZ2V0TWF4RXhwYW5kZWRCb2R5U2l6ZSgpIDogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVEaXJ0eUluZGljYXRvcih3b3JraW5nQ29weT86IElXb3JraW5nQ29weSk6IHZvaWQge1xuXHRcdGlmICh3b3JraW5nQ29weSkge1xuXHRcdFx0Y29uc3QgZ290RGlydHkgPSB3b3JraW5nQ29weS5pc0RpcnR5KCk7XG5cdFx0XHRpZiAoZ290RGlydHkgJiYgISh3b3JraW5nQ29weS5jYXBhYmlsaXRpZXMgJiBXb3JraW5nQ29weUNhcGFiaWxpdGllcy5VbnRpdGxlZCkgJiYgdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmhhc1Nob3J0QXV0b1NhdmVEZWxheSh3b3JraW5nQ29weS5yZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBkbyBub3QgaW5kaWNhdGUgZGlydHkgb2Ygd29ya2luZyBjb3BpZXMgdGhhdCBhcmUgYXV0byBzYXZlZCBhZnRlciBzaG9ydCBkZWxheVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGRpcnR5ID0gdGhpcy53b3JraW5nQ29weVNlcnZpY2UuZGlydHlDb3VudDtcblx0XHRpZiAoZGlydHkgPT09IDApIHtcblx0XHRcdHRoaXMuZGlydHlDb3VudEVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZGlydHlDb3VudEVsZW1lbnQudGV4dENvbnRlbnQgPSBubHMubG9jYWxpemUoJ2RpcnR5Q291bnRlcicsIFwiezB9IHVuc2F2ZWRcIiwgZGlydHkpO1xuXHRcdFx0dGhpcy5kaXJ0eUNvdW50RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBubHMubG9jYWxpemUoJ2RpcnR5Q291bnRlckFyaWFMYWJlbCcsIFwiezB9IHVuc2F2ZWQsIG9wZW4gdW5zYXZlZCBlZGl0b3JcIiwgZGlydHkpKTtcblx0XHRcdHRoaXMuZGlydHlDb3VudEVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgZWxlbWVudENvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmdyb3Vwcy5tYXAoZyA9PiBnLmNvdW50KVxuXHRcdFx0LnJlZHVjZSgoZmlyc3QsIHNlY29uZCkgPT4gZmlyc3QgKyBzZWNvbmQsIHRoaXMuc2hvd0dyb3VwcyA/IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmdyb3Vwcy5sZW5ndGggOiAwKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TWF4RXhwYW5kZWRCb2R5U2l6ZSgpOiBudW1iZXIge1xuXHRcdGxldCBtaW5WaXNpYmxlT3BlbkVkaXRvcnMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ2V4cGxvcmVyLm9wZW5FZGl0b3JzLm1pblZpc2libGUnKTtcblx0XHQvLyBJZiBpdCdzIG5vdCBhIG51bWJlciBzZXR0aW5nIGl0IHRvIDAgd2lsbCByZXN1bHQgaW4gZHluYW1pYyByZXNpemluZy5cblx0XHRpZiAodHlwZW9mIG1pblZpc2libGVPcGVuRWRpdG9ycyAhPT0gJ251bWJlcicpIHtcblx0XHRcdG1pblZpc2libGVPcGVuRWRpdG9ycyA9IE9wZW5FZGl0b3JzVmlldy5ERUZBVUxUX01JTl9WSVNJQkxFX09QRU5fRURJVE9SUztcblx0XHR9XG5cdFx0Y29uc3QgY29udGFpbmVyTW9kZWwgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHRoaXMuaWQpISk7XG5cdFx0aWYgKGNvbnRhaW5lck1vZGVsLnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoIDw9IDEpIHtcblx0XHRcdHJldHVybiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIChNYXRoLm1heCh0aGlzLmVsZW1lbnRDb3VudCwgbWluVmlzaWJsZU9wZW5FZGl0b3JzKSkgKiBPcGVuRWRpdG9yc0RlbGVnYXRlLklURU1fSEVJR0hUO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNaW5FeHBhbmRlZEJvZHlTaXplKCk6IG51bWJlciB7XG5cdFx0bGV0IHZpc2libGVPcGVuRWRpdG9ycyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPignZXhwbG9yZXIub3BlbkVkaXRvcnMudmlzaWJsZScpO1xuXHRcdGlmICh0eXBlb2YgdmlzaWJsZU9wZW5FZGl0b3JzICE9PSAnbnVtYmVyJykge1xuXHRcdFx0dmlzaWJsZU9wZW5FZGl0b3JzID0gT3BlbkVkaXRvcnNWaWV3LkRFRkFVTFRfVklTSUJMRV9PUEVOX0VESVRPUlM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuY29tcHV0ZU1pbkV4cGFuZGVkQm9keVNpemUodmlzaWJsZU9wZW5FZGl0b3JzKTtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZU1pbkV4cGFuZGVkQm9keVNpemUodmlzaWJsZU9wZW5FZGl0b3JzID0gT3BlbkVkaXRvcnNWaWV3LkRFRkFVTFRfVklTSUJMRV9PUEVOX0VESVRPUlMpOiBudW1iZXIge1xuXHRcdGNvbnN0IGl0ZW1zVG9TaG93ID0gTWF0aC5taW4oTWF0aC5tYXgodmlzaWJsZU9wZW5FZGl0b3JzLCAxKSwgdGhpcy5lbGVtZW50Q291bnQpO1xuXHRcdHJldHVybiBpdGVtc1RvU2hvdyAqIE9wZW5FZGl0b3JzRGVsZWdhdGUuSVRFTV9IRUlHSFQ7XG5cdH1cblxuXHRzZXRTdHJ1Y3R1cmFsUmVmcmVzaERlbGF5KGRlbGF5OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLnN0cnVjdHVyYWxSZWZyZXNoRGVsYXkgPSBkZWxheTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldE9wdGltYWxXaWR0aCgpOiBudW1iZXIge1xuXHRcdGlmICghdGhpcy5saXN0KSB7XG5cdFx0XHRyZXR1cm4gc3VwZXIuZ2V0T3B0aW1hbFdpZHRoKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyZW50Tm9kZSA9IHRoaXMubGlzdC5nZXRIVE1MRWxlbWVudCgpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGNoaWxkTm9kZXM6IEhUTUxFbGVtZW50W10gPSBbXS5zbGljZS5jYWxsKHBhcmVudE5vZGUucXVlcnlTZWxlY3RvckFsbCgnLm9wZW4tZWRpdG9yID4gYScpKTtcblxuXHRcdHJldHVybiBkb20uZ2V0TGFyZ2VzdENoaWxkV2lkdGgocGFyZW50Tm9kZSwgY2hpbGROb2Rlcyk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElPcGVuRWRpdG9yVGVtcGxhdGVEYXRhIHtcblx0Y29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cm9vdDogSVJlc291cmNlTGFiZWw7XG5cdGFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHRhY3Rpb25SdW5uZXI6IE9wZW5FZGl0b3JBY3Rpb25SdW5uZXI7XG59XG5cbmludGVyZmFjZSBJRWRpdG9yR3JvdXBUZW1wbGF0ZURhdGEge1xuXHRyb290OiBIVE1MRWxlbWVudDtcblx0bmFtZTogSFRNTFNwYW5FbGVtZW50O1xuXHRhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0ZWRpdG9yR3JvdXA6IElFZGl0b3JHcm91cDtcbn1cblxuY2xhc3MgT3BlbkVkaXRvckFjdGlvblJ1bm5lciBleHRlbmRzIEFjdGlvblJ1bm5lciB7XG5cdHB1YmxpYyBlZGl0b3I6IE9wZW5FZGl0b3IgfCB1bmRlZmluZWQ7XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjdGlvbjogSUFjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5lZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3VwZXIucnVuKGFjdGlvbiwgeyBncm91cElkOiB0aGlzLmVkaXRvci5ncm91cElkLCBlZGl0b3JJbmRleDogdGhpcy5lZGl0b3IuZ3JvdXAuZ2V0SW5kZXhPZkVkaXRvcih0aGlzLmVkaXRvci5lZGl0b3IpIH0pO1xuXHR9XG59XG5cbmNsYXNzIE9wZW5FZGl0b3JzRGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxPcGVuRWRpdG9yIHwgSUVkaXRvckdyb3VwPiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJVEVNX0hFSUdIVCA9IDIyO1xuXG5cdGdldEhlaWdodChfZWxlbWVudDogT3BlbkVkaXRvciB8IElFZGl0b3JHcm91cCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIE9wZW5FZGl0b3JzRGVsZWdhdGUuSVRFTV9IRUlHSFQ7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IE9wZW5FZGl0b3IgfCBJRWRpdG9yR3JvdXApOiBzdHJpbmcge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgT3BlbkVkaXRvcikge1xuXHRcdFx0cmV0dXJuIE9wZW5FZGl0b3JSZW5kZXJlci5JRDtcblx0XHR9XG5cblx0XHRyZXR1cm4gRWRpdG9yR3JvdXBSZW5kZXJlci5JRDtcblx0fVxufVxuXG5jbGFzcyBFZGl0b3JHcm91cFJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cFRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yZ3JvdXAnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRwcml2YXRlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdC8vIG5vb3Bcblx0fVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCkge1xuXHRcdHJldHVybiBFZGl0b3JHcm91cFJlbmRlcmVyLklEO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElFZGl0b3JHcm91cFRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBUZW1wbGF0ZTogSUVkaXRvckdyb3VwVGVtcGxhdGVEYXRhID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRlZGl0b3JHcm91cFRlbXBsYXRlLnJvb3QgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmVkaXRvci1ncm91cCcpKTtcblx0XHRlZGl0b3JHcm91cFRlbXBsYXRlLm5hbWUgPSBkb20uYXBwZW5kKGVkaXRvckdyb3VwVGVtcGxhdGUucm9vdCwgJCgnc3Bhbi5uYW1lJykpO1xuXHRcdGVkaXRvckdyb3VwVGVtcGxhdGUuYWN0aW9uQmFyID0gbmV3IEFjdGlvbkJhcihjb250YWluZXIpO1xuXG5cdFx0Y29uc3Qgc2F2ZUFsbEluR3JvdXBBY3Rpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNhdmVBbGxJbkdyb3VwQWN0aW9uLCBTYXZlQWxsSW5Hcm91cEFjdGlvbi5JRCwgU2F2ZUFsbEluR3JvdXBBY3Rpb24uTEFCRUwpO1xuXHRcdGNvbnN0IHNhdmVBbGxJbkdyb3VwS2V5ID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKHNhdmVBbGxJbkdyb3VwQWN0aW9uLmlkKTtcblx0XHRlZGl0b3JHcm91cFRlbXBsYXRlLmFjdGlvbkJhci5wdXNoKHNhdmVBbGxJbkdyb3VwQWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSwga2V5YmluZGluZzogc2F2ZUFsbEluR3JvdXBLZXkgPyBzYXZlQWxsSW5Hcm91cEtleS5nZXRMYWJlbCgpIDogdW5kZWZpbmVkIH0pO1xuXG5cdFx0Y29uc3QgY2xvc2VHcm91cEFjdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2xvc2VHcm91cEFjdGlvbiwgQ2xvc2VHcm91cEFjdGlvbi5JRCwgQ2xvc2VHcm91cEFjdGlvbi5MQUJFTCk7XG5cdFx0Y29uc3QgY2xvc2VHcm91cEFjdGlvbktleSA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhjbG9zZUdyb3VwQWN0aW9uLmlkKTtcblx0XHRlZGl0b3JHcm91cFRlbXBsYXRlLmFjdGlvbkJhci5wdXNoKGNsb3NlR3JvdXBBY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlLCBrZXliaW5kaW5nOiBjbG9zZUdyb3VwQWN0aW9uS2V5ID8gY2xvc2VHcm91cEFjdGlvbktleS5nZXRMYWJlbCgpIDogdW5kZWZpbmVkIH0pO1xuXG5cdFx0cmV0dXJuIGVkaXRvckdyb3VwVGVtcGxhdGU7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVkaXRvckdyb3VwOiBJRWRpdG9yR3JvdXAsIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElFZGl0b3JHcm91cFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lZGl0b3JHcm91cCA9IGVkaXRvckdyb3VwO1xuXHRcdHRlbXBsYXRlRGF0YS5uYW1lLnRleHRDb250ZW50ID0gZWRpdG9yR3JvdXAubGFiZWw7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jb250ZXh0ID0geyBncm91cElkOiBlZGl0b3JHcm91cC5pZCB9O1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUVkaXRvckdyb3VwVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgT3BlbkVkaXRvclJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxPcGVuRWRpdG9yLCBJT3BlbkVkaXRvclRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnb3BlbmVkaXRvcic7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjbG9zZUVkaXRvckFjdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSB1bnBpbkVkaXRvckFjdGlvbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0cHJpdmF0ZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdHByaXZhdGUga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRwcml2YXRlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5jbG9zZUVkaXRvckFjdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2xvc2VFZGl0b3JBY3Rpb24sIENsb3NlRWRpdG9yQWN0aW9uLklELCBDbG9zZUVkaXRvckFjdGlvbi5MQUJFTCk7XG5cdFx0dGhpcy51bnBpbkVkaXRvckFjdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW5waW5FZGl0b3JBY3Rpb24sIFVucGluRWRpdG9yQWN0aW9uLklELCBVbnBpbkVkaXRvckFjdGlvbi5MQUJFTCk7XG5cdFx0Ly8gbm9vcFxuXHR9XG5cblx0Z2V0IHRlbXBsYXRlSWQoKSB7XG5cdFx0cmV0dXJuIE9wZW5FZGl0b3JSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJT3BlbkVkaXRvclRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZWRpdG9yVGVtcGxhdGU6IElPcGVuRWRpdG9yVGVtcGxhdGVEYXRhID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRlZGl0b3JUZW1wbGF0ZS5jb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0ZWRpdG9yVGVtcGxhdGUuYWN0aW9uUnVubmVyID0gbmV3IE9wZW5FZGl0b3JBY3Rpb25SdW5uZXIoKTtcblx0XHRlZGl0b3JUZW1wbGF0ZS5hY3Rpb25CYXIgPSBuZXcgQWN0aW9uQmFyKGNvbnRhaW5lciwgeyBhY3Rpb25SdW5uZXI6IGVkaXRvclRlbXBsYXRlLmFjdGlvblJ1bm5lciB9KTtcblx0XHRlZGl0b3JUZW1wbGF0ZS5yb290ID0gdGhpcy5sYWJlbHMuY3JlYXRlKGNvbnRhaW5lcik7XG5cblx0XHRyZXR1cm4gZWRpdG9yVGVtcGxhdGU7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG9wZW5lZEVkaXRvcjogT3BlbkVkaXRvciwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSU9wZW5FZGl0b3JUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBlZGl0b3IgPSBvcGVuZWRFZGl0b3IuZWRpdG9yO1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25SdW5uZXIuZWRpdG9yID0gb3BlbmVkRWRpdG9yO1xuXHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZGlydHknLCBlZGl0b3IuaXNEaXJ0eSgpICYmICFlZGl0b3IuaXNTYXZpbmcoKSk7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzdGlja3knLCBvcGVuZWRFZGl0b3IuaXNTdGlja3koKSk7XG5cdFx0dGVtcGxhdGVEYXRhLnJvb3Quc2V0UmVzb3VyY2Uoe1xuXHRcdFx0cmVzb3VyY2U6IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkJPVEggfSksXG5cdFx0XHRuYW1lOiBlZGl0b3IuZ2V0TmFtZSgpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGVkaXRvci5nZXREZXNjcmlwdGlvbihWZXJib3NpdHkuTUVESVVNKVxuXHRcdH0sIHtcblx0XHRcdGl0YWxpYzogb3BlbmVkRWRpdG9yLmlzUHJldmlldygpLFxuXHRcdFx0ZXh0cmFDbGFzc2VzOiBbJ29wZW4tZWRpdG9yJ10uY29uY2F0KG9wZW5lZEVkaXRvci5lZGl0b3IuZ2V0TGFiZWxFeHRyYUNsYXNzZXMoKSksXG5cdFx0XHRmaWxlRGVjb3JhdGlvbnM6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUZpbGVzQ29uZmlndXJhdGlvbj4oKS5leHBsb3Jlci5kZWNvcmF0aW9ucyxcblx0XHRcdHRpdGxlOiBlZGl0b3IuZ2V0VGl0bGUoVmVyYm9zaXR5LkxPTkcpLFxuXHRcdFx0aWNvbjogZWRpdG9yLmdldEljb24oKVxuXHRcdH0pO1xuXHRcdGNvbnN0IGVkaXRvckFjdGlvbiA9IG9wZW5lZEVkaXRvci5pc1N0aWNreSgpID8gdGhpcy51bnBpbkVkaXRvckFjdGlvbiA6IHRoaXMuY2xvc2VFZGl0b3JBY3Rpb247XG5cdFx0aWYgKCF0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmhhc0FjdGlvbihlZGl0b3JBY3Rpb24pKSB7XG5cdFx0XHRpZiAoIXRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuaXNFbXB0eSgpKSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY2xlYXIoKTtcblx0XHRcdH1cblx0XHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIucHVzaChlZGl0b3JBY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlLCBrZXliaW5kaW5nOiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoZWRpdG9yQWN0aW9uLmlkKT8uZ2V0TGFiZWwoKSB9KTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJT3BlbkVkaXRvclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5yb290LmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uUnVubmVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBPcGVuRWRpdG9yc0RyYWdBbmREcm9wIGltcGxlbWVudHMgSUxpc3REcmFnQW5kRHJvcDxPcGVuRWRpdG9yIHwgSUVkaXRvckdyb3VwPiB7XG5cblx0cHJpdmF0ZSBfc29ydE9yZGVyOiAnZWRpdG9yT3JkZXInIHwgJ2FscGhhYmV0aWNhbCcgfCAnZnVsbFBhdGgnO1xuXHRwdWJsaWMgc2V0IHNvcnRPcmRlcih2YWx1ZTogJ2VkaXRvck9yZGVyJyB8ICdhbHBoYWJldGljYWwnIHwgJ2Z1bGxQYXRoJykge1xuXHRcdHRoaXMuX3NvcnRPcmRlciA9IHZhbHVlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0c29ydE9yZGVyOiAnZWRpdG9yT3JkZXInIHwgJ2FscGhhYmV0aWNhbCcgfCAnZnVsbFBhdGgnLFxuXHRcdHByaXZhdGUgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fc29ydE9yZGVyID0gc29ydE9yZGVyO1xuXHR9XG5cblx0QG1lbW9pemUgcHJpdmF0ZSBnZXQgZHJvcEhhbmRsZXIoKTogUmVzb3VyY2VzRHJvcEhhbmRsZXIge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlc0Ryb3BIYW5kbGVyLCB7IGFsbG93V29ya3NwYWNlT3BlbjogZmFsc2UgfSk7XG5cdH1cblxuXHRnZXREcmFnVVJJKGVsZW1lbnQ6IE9wZW5FZGl0b3IgfCBJRWRpdG9yR3JvdXApOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIE9wZW5FZGl0b3IpIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gZWxlbWVudC5nZXRSZXNvdXJjZSgpO1xuXHRcdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdHJldHVybiByZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGdldERyYWdMYWJlbD8oZWxlbWVudHM6IChPcGVuRWRpdG9yIHwgSUVkaXRvckdyb3VwKVtdKTogc3RyaW5nIHtcblx0XHRpZiAoZWxlbWVudHMubGVuZ3RoID4gMSkge1xuXHRcdFx0cmV0dXJuIFN0cmluZyhlbGVtZW50cy5sZW5ndGgpO1xuXHRcdH1cblx0XHRjb25zdCBlbGVtZW50ID0gZWxlbWVudHNbMF07XG5cblx0XHRyZXR1cm4gZWxlbWVudCBpbnN0YW5jZW9mIE9wZW5FZGl0b3IgPyBlbGVtZW50LmVkaXRvci5nZXROYW1lKCkgOiBlbGVtZW50LmxhYmVsO1xuXHR9XG5cblx0b25EcmFnU3RhcnQoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgaXRlbXMgPSAoZGF0YSBhcyBFbGVtZW50c0RyYWdBbmREcm9wRGF0YTxPcGVuRWRpdG9yIHwgSUVkaXRvckdyb3VwPikuZWxlbWVudHM7XG5cdFx0Y29uc3QgZWRpdG9yczogSUVkaXRvcklkZW50aWZpZXJbXSA9IFtdO1xuXHRcdGlmIChpdGVtcykge1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRcdGlmIChpdGVtIGluc3RhbmNlb2YgT3BlbkVkaXRvcikge1xuXHRcdFx0XHRcdGVkaXRvcnMucHVzaChpdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChlZGl0b3JzLmxlbmd0aCkge1xuXHRcdFx0Ly8gQXBwbHkgc29tZSBkYXRhdHJhbnNmZXIgdHlwZXMgdG8gYWxsb3cgZm9yIGRyYWdnaW5nIHRoZSBlbGVtZW50IG91dHNpZGUgb2YgdGhlIGFwcGxpY2F0aW9uXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZpbGxFZGl0b3JzRHJhZ0RhdGEsIGVkaXRvcnMsIG9yaWdpbmFsRXZlbnQpO1xuXHRcdH1cblx0fVxuXG5cdG9uRHJhZ092ZXIoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgX3RhcmdldEVsZW1lbnQ6IE9wZW5FZGl0b3IgfCBJRWRpdG9yR3JvdXAsIF90YXJnZXRJbmRleDogbnVtYmVyLCB0YXJnZXRTZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiBib29sZWFuIHwgSUxpc3REcmFnT3ZlclJlYWN0aW9uIHtcblx0XHRpZiAoZGF0YSBpbnN0YW5jZW9mIE5hdGl2ZURyYWdBbmREcm9wRGF0YSkge1xuXHRcdFx0aWYgKCFjb250YWluc0RyYWdUeXBlKG9yaWdpbmFsRXZlbnQsIERhdGFUcmFuc2ZlcnMuRklMRVMsIENvZGVEYXRhVHJhbnNmZXJzLkZJTEVTKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3NvcnRPcmRlciAhPT0gJ2VkaXRvck9yZGVyJykge1xuXHRcdFx0aWYgKGRhdGEgaW5zdGFuY2VvZiBFbGVtZW50c0RyYWdBbmREcm9wRGF0YSkge1xuXHRcdFx0XHQvLyBObyByZW9yZGVyaW5nIHN1cHBvcnRlZCB3aGVuIHNvcnRlZFxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBBbGxvdyBkcm9waW5nIGZpbGVzIHRvIG9wZW4gdGhlbVxuXHRcdFx0XHRyZXR1cm4geyBhY2NlcHQ6IHRydWUsIGVmZmVjdDogeyB0eXBlOiBMaXN0RHJhZ092ZXJFZmZlY3RUeXBlLk1vdmUgfSwgZmVlZGJhY2s6IFstMV0gfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgZHJvcEVmZmVjdFBvc2l0aW9uOiBMaXN0RHJhZ092ZXJFZmZlY3RQb3NpdGlvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRzd2l0Y2ggKHRhcmdldFNlY3Rvcikge1xuXHRcdFx0Y2FzZSBMaXN0Vmlld1RhcmdldFNlY3Rvci5UT1A6XG5cdFx0XHRjYXNlIExpc3RWaWV3VGFyZ2V0U2VjdG9yLkNFTlRFUl9UT1A6XG5cdFx0XHRcdGRyb3BFZmZlY3RQb3NpdGlvbiA9IChfdGFyZ2V0SW5kZXggPT09IDAgJiYgX3RhcmdldEVsZW1lbnQgaW5zdGFuY2VvZiBFZGl0b3JHcm91cFZpZXcpID8gTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24uQWZ0ZXIgOiBMaXN0RHJhZ092ZXJFZmZlY3RQb3NpdGlvbi5CZWZvcmU7IGJyZWFrO1xuXHRcdFx0Y2FzZSBMaXN0Vmlld1RhcmdldFNlY3Rvci5DRU5URVJfQk9UVE9NOlxuXHRcdFx0Y2FzZSBMaXN0Vmlld1RhcmdldFNlY3Rvci5CT1RUT006XG5cdFx0XHRcdGRyb3BFZmZlY3RQb3NpdGlvbiA9IExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uLkFmdGVyOyBicmVhaztcblx0XHR9XG5cblx0XHRyZXR1cm4geyBhY2NlcHQ6IHRydWUsIGVmZmVjdDogeyB0eXBlOiBMaXN0RHJhZ092ZXJFZmZlY3RUeXBlLk1vdmUsIHBvc2l0aW9uOiBkcm9wRWZmZWN0UG9zaXRpb24gfSwgZmVlZGJhY2s6IFtfdGFyZ2V0SW5kZXhdIH07XG5cdH1cblxuXHRkcm9wKGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldEVsZW1lbnQ6IE9wZW5FZGl0b3IgfCBJRWRpdG9yR3JvdXAgfCB1bmRlZmluZWQsIF90YXJnZXRJbmRleDogbnVtYmVyLCB0YXJnZXRTZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHRsZXQgZ3JvdXAgPSB0YXJnZXRFbGVtZW50IGluc3RhbmNlb2YgT3BlbkVkaXRvciA/IHRhcmdldEVsZW1lbnQuZ3JvdXAgOiB0YXJnZXRFbGVtZW50IHx8IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmdyb3Vwc1t0aGlzLmVkaXRvckdyb3VwU2VydmljZS5jb3VudCAtIDFdO1xuXHRcdGxldCB0YXJnZXRFZGl0b3JJbmRleCA9IHRhcmdldEVsZW1lbnQgaW5zdGFuY2VvZiBPcGVuRWRpdG9yID8gdGFyZ2V0RWxlbWVudC5ncm91cC5nZXRJbmRleE9mRWRpdG9yKHRhcmdldEVsZW1lbnQuZWRpdG9yKSA6IDA7XG5cblx0XHRzd2l0Y2ggKHRhcmdldFNlY3Rvcikge1xuXHRcdFx0Y2FzZSBMaXN0Vmlld1RhcmdldFNlY3Rvci5UT1A6XG5cdFx0XHRjYXNlIExpc3RWaWV3VGFyZ2V0U2VjdG9yLkNFTlRFUl9UT1A6XG5cdFx0XHRcdGlmICh0YXJnZXRFbGVtZW50IGluc3RhbmNlb2YgRWRpdG9yR3JvdXBWaWV3ICYmIGdyb3VwLmluZGV4ICE9PSAwKSB7XG5cdFx0XHRcdFx0Z3JvdXAgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5ncm91cHNbZ3JvdXAuaW5kZXggLSAxXTtcblx0XHRcdFx0XHR0YXJnZXRFZGl0b3JJbmRleCA9IGdyb3VwLmNvdW50O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBMaXN0Vmlld1RhcmdldFNlY3Rvci5CT1RUT006XG5cdFx0XHRjYXNlIExpc3RWaWV3VGFyZ2V0U2VjdG9yLkNFTlRFUl9CT1RUT006XG5cdFx0XHRcdGlmICh0YXJnZXRFbGVtZW50IGluc3RhbmNlb2YgT3BlbkVkaXRvcikge1xuXHRcdFx0XHRcdHRhcmdldEVkaXRvckluZGV4Kys7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0aWYgKGRhdGEgaW5zdGFuY2VvZiBFbGVtZW50c0RyYWdBbmREcm9wRGF0YSkge1xuXHRcdFx0Zm9yIChjb25zdCBvZSBvZiBkYXRhLmVsZW1lbnRzKSB7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZUVkaXRvckluZGV4ID0gb2UuZ3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihvZS5lZGl0b3IpO1xuXHRcdFx0XHRpZiAob2UuZ3JvdXAgPT09IGdyb3VwICYmIHNvdXJjZUVkaXRvckluZGV4IDwgdGFyZ2V0RWRpdG9ySW5kZXgpIHtcblx0XHRcdFx0XHR0YXJnZXRFZGl0b3JJbmRleC0tO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9lLmdyb3VwLm1vdmVFZGl0b3Iob2UuZWRpdG9yLCBncm91cCwgeyBpbmRleDogdGFyZ2V0RWRpdG9ySW5kZXgsIHByZXNlcnZlRm9jdXM6IHRydWUgfSk7XG5cdFx0XHRcdHRhcmdldEVkaXRvckluZGV4Kys7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmF0ZUdyb3VwKGdyb3VwKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kcm9wSGFuZGxlci5oYW5kbGVEcm9wKG9yaWdpbmFsRXZlbnQsIG1haW5XaW5kb3csICgpID0+IGdyb3VwLCAoKSA9PiBncm91cC5mb2N1cygpLCB7IGluZGV4OiB0YXJnZXRFZGl0b3JJbmRleCB9KTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQgeyB9XG59XG5cbmNsYXNzIE9wZW5FZGl0b3JzQWNjZXNzaWJpbGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8T3BlbkVkaXRvciB8IElFZGl0b3JHcm91cD4ge1xuXG5cdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBubHMubG9jYWxpemUoJ29wZW5FZGl0b3JzJywgXCJPcGVuIEVkaXRvcnNcIik7XG5cdH1cblxuXHRnZXRBcmlhTGFiZWwoZWxlbWVudDogT3BlbkVkaXRvciB8IElFZGl0b3JHcm91cCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgT3BlbkVkaXRvcikge1xuXHRcdFx0cmV0dXJuIGAke2VsZW1lbnQuZWRpdG9yLmdldE5hbWUoKX0sICR7ZWxlbWVudC5lZGl0b3IuZ2V0RGVzY3JpcHRpb24oKX1gO1xuXHRcdH1cblxuXHRcdHJldHVybiBlbGVtZW50LmFyaWFMYWJlbDtcblx0fVxufVxuXG5jb25zdCB0b2dnbGVFZGl0b3JHcm91cExheW91dElkID0gJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlRWRpdG9yR3JvdXBMYXlvdXQnO1xucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVFZGl0b3JHcm91cExheW91dCcsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignZmxpcExheW91dCcsIFwiVG9nZ2xlIFZlcnRpY2FsL0hvcml6b250YWwgRWRpdG9yIExheW91dFwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5EaWdpdDAsXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLkRpZ2l0MCB9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdGljb246IENvZGljb24uZWRpdG9yTGF5b3V0LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIE9wZW5FZGl0b3JzVmlldy5JRCksIE11bHRpcGxlRWRpdG9yR3JvdXBzQ29udGV4dCksXG5cdFx0XHRcdG9yZGVyOiAxMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRjb25zdCBuZXdPcmllbnRhdGlvbiA9IChlZGl0b3JHcm91cFNlcnZpY2Uub3JpZW50YXRpb24gPT09IEdyb3VwT3JpZW50YXRpb24uVkVSVElDQUwpID8gR3JvdXBPcmllbnRhdGlvbi5IT1JJWk9OVEFMIDogR3JvdXBPcmllbnRhdGlvbi5WRVJUSUNBTDtcblx0XHRlZGl0b3JHcm91cFNlcnZpY2Uuc2V0R3JvdXBPcmllbnRhdGlvbihuZXdPcmllbnRhdGlvbik7XG5cdFx0ZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdH1cbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJMYXlvdXRNZW51LCB7XG5cdGdyb3VwOiAnNV9mbGlwJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiB0b2dnbGVFZGl0b3JHcm91cExheW91dElkLFxuXHRcdHRpdGxlOiB7XG5cdFx0XHQuLi5ubHMubG9jYWxpemUyKCdtaVRvZ2dsZUVkaXRvckxheW91dFdpdGhvdXRNbmVtb25pYycsIFwiRmxpcCBMYXlvdXRcIiksXG5cdFx0XHRtbmVtb25pY1RpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaVRvZ2dsZUVkaXRvckxheW91dCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJGbGlwICYmTGF5b3V0XCIpXG5cdFx0fVxuXHR9LFxuXHRvcmRlcjogMVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMuc2F2ZUFsbCcsXG5cdFx0XHR0aXRsZTogU0FWRV9BTExfTEFCRUwsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGljb246IENvZGljb24uc2F2ZUFsbCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIE9wZW5FZGl0b3JzVmlldy5JRCksXG5cdFx0XHRcdG9yZGVyOiAyMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChTQVZFX0FMTF9DT01NQU5EX0lEKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ29wZW5FZGl0b3JzLmNsb3NlQWxsJyxcblx0XHRcdHRpdGxlOiBDbG9zZUFsbEVkaXRvcnNBY3Rpb24uTEFCRUwsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRpY29uOiBDb2RpY29uLmNsb3NlQWxsLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgT3BlbkVkaXRvcnNWaWV3LklEKSxcblx0XHRcdFx0b3JkZXI6IDMwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY2xvc2VBbGwgPSBuZXcgQ2xvc2VBbGxFZGl0b3JzQWN0aW9uKCk7XG5cdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gY2xvc2VBbGwucnVuKGFjY2Vzc29yKSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdvcGVuRWRpdG9ycy5uZXdVbnRpdGxlZEZpbGUnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ25ld1VudGl0bGVkRmlsZScsIFwiTmV3IFVudGl0bGVkIFRleHQgRmlsZVwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGljb246IENvZGljb24ubmV3RmlsZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIE9wZW5FZGl0b3JzVmlldy5JRCksXG5cdFx0XHRcdG9yZGVyOiA1XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE5FV19VTlRJVExFRF9GSUxFX0NPTU1BTkRfSUQpO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFrQixvQkFBeUY7QUFDM0csWUFBWSxTQUFTO0FBQ3JCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsc0JBQW9DLGFBQWEsd0JBQXdCO0FBQ2xGLFNBQVMsNkJBQXdEO0FBQ2pFLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsV0FBVyx3QkFBd0Isa0JBQXFDLHNCQUFzQixvQkFBb0IseUJBQXlCO0FBRXBKLFNBQVMsc0JBQXNCLHdCQUF3QjtBQUN2RCxTQUFTLDJCQUEyQix3QkFBNkMsa0JBQWtCO0FBQ25HLFNBQVMsdUJBQXVCLG1CQUFtQix5QkFBeUI7QUFDNUUs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
