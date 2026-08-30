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
import "./media/editorgroupview.css";
import { EditorGroupModel, isGroupEditorCloseEvent, isGroupEditorOpenEvent, isSerializedEditorGroupModel } from "../../../common/editor/editorGroupModel.js";
import { CloseDirection, SaveReason, EditorsOrder, EditorResourceAccessor, EditorInputCapabilities, DEFAULT_EDITOR_ASSOCIATION, SideBySideEditor, EditorCloseContext, GroupModelChangeKind, TEXT_DIFF_EDITOR_ID } from "../../../common/editor.js";
import { ActiveEditorGroupLockedContext, ActiveEditorDirtyContext, EditorGroupEditorsCountContext, ActiveEditorStickyContext, ActiveEditorPinnedContext, ActiveEditorLastInGroupContext, ActiveEditorFirstInGroupContext, ResourceContextKey, applyAvailableEditorIds, ActiveEditorAvailableEditorIdsContext, ActiveEditorCanSplitInGroupContext, SideBySideEditorActiveContext, TextCompareEditorVisibleContext, TextCompareEditorActiveContext, ActiveEditorContext, ActiveEditorReadonlyContext, ActiveEditorCanRevertContext, ActiveEditorCanToggleReadonlyContext, ActiveCompareEditorCanSwapContext, MultipleEditorsSelectedInGroupContext, TwoEditorsSelectedInGroupContext, SelectedEditorsInGroupFileOrUntitledResourceContextKey, ActiveEditorCannotCloseContext } from "../../../common/contextkeys.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { Emitter, Relay } from "../../../../base/common/event.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Dimension, trackFocus, addDisposableListener, EventType, EventHelper, findParentWithClass, isAncestor, isMouseEvent, isActiveElement, getWindow, getActiveElement, $ } from "../../../../base/browser/dom.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ProgressBar } from "../../../../base/browser/ui/progressbar/progressbar.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { editorBackground, contrastBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { EDITOR_GROUP_HEADER_TABS_BACKGROUND, EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND, EDITOR_GROUP_EMPTY_BACKGROUND, EDITOR_GROUP_HEADER_BORDER } from "../../../common/theme.js";
import { GroupsOrder } from "../../../services/editor/common/editorGroupsService.js";
import { EditorPanes } from "./editorPanes.js";
import { IEditorProgressService } from "../../../../platform/progress/common/progress.js";
import { EditorProgressIndicator } from "../../../services/progress/browser/progressIndicator.js";
import { localize } from "../../../../nls.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { DeferredPromise, Promises, RunOnceWorker } from "../../../../base/common/async.js";
import { EventType as TouchEventType } from "../../../../base/browser/touch.js";
import { fillActiveEditorViewState } from "./editor.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { Separator, SubmenuAction } from "../../../../base/common/actions.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { getActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { createEditorTypeActions, getAvailableEditorTypes } from "./editorTypePicker.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { hash } from "../../../../base/common/hash.js";
import { getMimeTypes } from "../../../../editor/common/services/languagesAssociations.js";
import { extname, isEqual } from "../../../../base/common/resources.js";
import { Schemas } from "../../../../base/common/network.js";
import { EditorActivation } from "../../../../platform/editor/common/editor.js";
import { IFileDialogService, ConfirmResult, IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFilesConfigurationService, AutoSaveMode } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { URI } from "../../../../base/common/uri.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { isLinux, isMacintosh, isNative, isWindows } from "../../../../base/common/platform.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { TelemetryTrustedValue } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { defaultProgressBarStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { EditorGroupWatermark } from "./editorGroupWatermark.js";
import { EditorTitleControl } from "./editorTitleControl.js";
import { EditorPane } from "./editorPane.js";
import { IEditorResolverService } from "../../../services/editor/common/editorResolverService.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { DiffEditorInput } from "../../../common/editor/diffEditorInput.js";
import { FileSystemProviderCapabilities, IFileService } from "../../../../platform/files/common/files.js";
let EditorGroupView = class extends Themable {
  constructor(from, editorPartsView, groupsView, groupsLabel, _index, options, instantiationService, contextKeyService, themeService, telemetryService, keybindingService, menuService, contextMenuService, fileDialogService, editorService, filesConfigurationService, uriIdentityService, logService, editorResolverService, hostService, dialogService, fileService, commandService) {
    super(themeService);
    this.editorPartsView = editorPartsView;
    this.groupsView = groupsView;
    this.groupsLabel = groupsLabel;
    this._index = _index;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.telemetryService = telemetryService;
    this.keybindingService = keybindingService;
    this.menuService = menuService;
    this.contextMenuService = contextMenuService;
    this.fileDialogService = fileDialogService;
    this.editorService = editorService;
    this.filesConfigurationService = filesConfigurationService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this.editorResolverService = editorResolverService;
    this.hostService = hostService;
    this.dialogService = dialogService;
    this.fileService = fileService;
    this.commandService = commandService;
    //#region events
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this._onDidModelChange = this._register(new Emitter());
    this.onDidModelChange = this._onDidModelChange.event;
    this._onDidActiveEditorChange = this._register(new Emitter());
    this.onDidActiveEditorChange = this._onDidActiveEditorChange.event;
    this._onDidOpenEditorFail = this._register(new Emitter());
    this.onDidOpenEditorFail = this._onDidOpenEditorFail.event;
    this._onWillCloseEditor = this._register(new Emitter());
    this.onWillCloseEditor = this._onWillCloseEditor.event;
    this._onDidCloseEditor = this._register(new Emitter());
    this.onDidCloseEditor = this._onDidCloseEditor.event;
    this._onWillMoveEditor = this._register(new Emitter());
    this.onWillMoveEditor = this._onWillMoveEditor.event;
    this._onWillOpenEditor = this._register(new Emitter());
    this.onWillOpenEditor = this._onWillOpenEditor.event;
    /**
     * Optional inset (in px) reserved on the right of the editor pane while the
     * title control keeps the full group width. Used by the Agents window to dock
     * the detail panel beside the editor content under one full-width tab bar.
     * `0` (default) is a no-op for all other layouts.
     */
    this._contentRightInset = 0;
    this._onDidRelayout = this._register(new Emitter());
    this.onDidRelayout = this._onDidRelayout.event;
    this.disposedEditorsWorker = this._register(new RunOnceWorker((editors) => this.handleDisposedEditors(editors), 0));
    this.mapEditorToPendingConfirmation = /* @__PURE__ */ new Map();
    this.containerToolBarMenuDisposable = this._register(new MutableDisposable());
    this.whenRestoredPromise = new DeferredPromise();
    this.whenRestored = this.whenRestoredPromise.p;
    this._disposed = false;
    //#endregion
    //#region ISerializableView
    this.element = $("div");
    this._onDidChange = this._register(new Relay());
    this.onDidChange = this._onDidChange.event;
    if (from instanceof EditorGroupView) {
      this.model = this._register(from.model.clone());
    } else if (isSerializedEditorGroupModel(from)) {
      this.model = this._register(instantiationService.createInstance(EditorGroupModel, from));
    } else {
      this.model = this._register(instantiationService.createInstance(EditorGroupModel, void 0));
    }
    {
      this.scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.element));
      this.element.classList.add(...coalesce(["editor-group-container", this.model.isLocked ? "locked" : void 0]));
      this.registerContainerListeners();
      this.createContainerToolbar();
      this.createContainerContextMenu();
      this._register(this.instantiationService.createInstance(EditorGroupWatermark, this.element));
      this.progressBar = this._register(new ProgressBar(this.element, defaultProgressBarStyles));
      this.progressBar.hide();
      this.scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection(
        [IContextKeyService, this.scopedContextKeyService],
        [IEditorProgressService, this._register(new EditorProgressIndicator(this.progressBar, this))]
      )));
      this.resourceContext = this._register(this.scopedInstantiationService.createInstance(ResourceContextKey));
      this.handleGroupContextKeys();
      this.titleContainer = $(".title");
      this.element.appendChild(this.titleContainer);
      this.titleControl = this._register(this.scopedInstantiationService.createInstance(EditorTitleControl, this.titleContainer, this.editorPartsView, this.groupsView, this, this.model, options?.menuIds, options?.showHeader === true));
      this.editorContainer = $(".editor-container");
      this.element.appendChild(this.editorContainer);
      this.editorPane = this._register(this.scopedInstantiationService.createInstance(EditorPanes, this.element, this.editorContainer, this));
      this._onDidChange.input = this.editorPane.onDidChangeSizeConstraints;
      this.doTrackFocus();
      this.updateTitleContainer();
      this.updateContainer();
      this.updateStyles();
    }
    const restoreEditorsPromise = this.restoreEditors(from, options) ?? Promise.resolve();
    restoreEditorsPromise.finally(() => {
      this.whenRestoredPromise.complete();
    });
    this.registerListeners();
  }
  //#region factory
  static createNew(editorPartsView, groupsView, groupsLabel, groupIndex, instantiationService, options) {
    return instantiationService.createInstance(EditorGroupView, null, editorPartsView, groupsView, groupsLabel, groupIndex, options);
  }
  static createFromSerialized(serialized, editorPartsView, groupsView, groupsLabel, groupIndex, instantiationService, options) {
    return instantiationService.createInstance(EditorGroupView, serialized, editorPartsView, groupsView, groupsLabel, groupIndex, options);
  }
  static createCopy(copyFrom, editorPartsView, groupsView, groupsLabel, groupIndex, instantiationService, options) {
    return instantiationService.createInstance(EditorGroupView, copyFrom, editorPartsView, groupsView, groupsLabel, groupIndex, options);
  }
  handleGroupContextKeys() {
    const groupActiveEditorDirtyContext = this.editorPartsView.bind(ActiveEditorDirtyContext, this);
    const groupActiveEditorPinnedContext = this.editorPartsView.bind(ActiveEditorPinnedContext, this);
    const groupActiveEditorFirstContext = this.editorPartsView.bind(ActiveEditorFirstInGroupContext, this);
    const groupActiveEditorLastContext = this.editorPartsView.bind(ActiveEditorLastInGroupContext, this);
    const groupActiveEditorStickyContext = this.editorPartsView.bind(ActiveEditorStickyContext, this);
    const groupEditorsCountContext = this.editorPartsView.bind(EditorGroupEditorsCountContext, this);
    const groupLockedContext = this.editorPartsView.bind(ActiveEditorGroupLockedContext, this);
    const multipleEditorsSelectedContext = MultipleEditorsSelectedInGroupContext.bindTo(this.scopedContextKeyService);
    const twoEditorsSelectedContext = TwoEditorsSelectedInGroupContext.bindTo(this.scopedContextKeyService);
    const selectedEditorsHaveFileOrUntitledResourceContext = SelectedEditorsInGroupFileOrUntitledResourceContextKey.bindTo(this.scopedContextKeyService);
    const groupActiveEditorContext = this.editorPartsView.bind(ActiveEditorContext, this);
    const groupActiveEditorIsReadonly = this.editorPartsView.bind(ActiveEditorReadonlyContext, this);
    const groupActiveEditorCanRevert = this.editorPartsView.bind(ActiveEditorCanRevertContext, this);
    const groupActiveEditorCanToggleReadonly = this.editorPartsView.bind(ActiveEditorCanToggleReadonlyContext, this);
    const groupActiveCompareEditorCanSwap = this.editorPartsView.bind(ActiveCompareEditorCanSwapContext, this);
    const groupTextCompareEditorVisibleContext = this.editorPartsView.bind(TextCompareEditorVisibleContext, this);
    const groupTextCompareEditorActiveContext = this.editorPartsView.bind(TextCompareEditorActiveContext, this);
    const groupActiveEditorAvailableEditorIds = this.editorPartsView.bind(ActiveEditorAvailableEditorIdsContext, this);
    const groupActiveEditorCanSplitInGroupContext = this.editorPartsView.bind(ActiveEditorCanSplitInGroupContext, this);
    const groupActiveEditorCannotCloseContext = this.editorPartsView.bind(ActiveEditorCannotCloseContext, this);
    const groupActiveEditorIsSideBySideEditorContext = this.editorPartsView.bind(SideBySideEditorActiveContext, this);
    const activeEditorListener = this._register(new MutableDisposable());
    const observeActiveEditor = () => {
      activeEditorListener.clear();
      this.scopedContextKeyService.bufferChangeEvents(() => {
        const activeEditor = this.activeEditor;
        const activeEditorPane = this.activeEditorPane;
        this.resourceContext.set(EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY }));
        applyAvailableEditorIds(groupActiveEditorAvailableEditorIds, activeEditor, this.editorResolverService);
        if (activeEditor) {
          groupActiveEditorCanSplitInGroupContext.set(activeEditor.hasCapability(EditorInputCapabilities.CanSplitInGroup));
          groupActiveEditorCannotCloseContext.set(activeEditor.hasCapability(EditorInputCapabilities.CannotClose));
          groupActiveEditorIsSideBySideEditorContext.set(activeEditor.typeId === SideBySideEditorInput.ID);
          groupActiveEditorDirtyContext.set(activeEditor.isDirty() && !activeEditor.isSaving());
          activeEditorListener.value = activeEditor.onDidChangeDirty(() => {
            groupActiveEditorDirtyContext.set(activeEditor.isDirty() && !activeEditor.isSaving());
          });
        } else {
          groupActiveEditorCanSplitInGroupContext.set(false);
          groupActiveEditorCannotCloseContext.set(false);
          groupActiveEditorIsSideBySideEditorContext.set(false);
          groupActiveEditorDirtyContext.set(false);
        }
        if (activeEditorPane) {
          groupActiveEditorContext.set(activeEditorPane.getId());
          groupActiveEditorCanRevert.set(!activeEditorPane.input.hasCapability(EditorInputCapabilities.Untitled));
          groupActiveEditorIsReadonly.set(!!activeEditorPane.input.isReadonly());
          const primaryEditorResource = EditorResourceAccessor.getOriginalUri(activeEditorPane.input, { supportSideBySide: SideBySideEditor.PRIMARY });
          const secondaryEditorResource = EditorResourceAccessor.getOriginalUri(activeEditorPane.input, { supportSideBySide: SideBySideEditor.SECONDARY });
          groupActiveCompareEditorCanSwap.set(activeEditorPane.input instanceof DiffEditorInput && !activeEditorPane.input.original.isReadonly() && !!primaryEditorResource && (this.fileService.hasProvider(primaryEditorResource) || primaryEditorResource.scheme === Schemas.untitled) && !!secondaryEditorResource && (this.fileService.hasProvider(secondaryEditorResource) || secondaryEditorResource.scheme === Schemas.untitled));
          groupActiveEditorCanToggleReadonly.set(!!primaryEditorResource && this.fileService.hasProvider(primaryEditorResource) && !this.fileService.hasCapability(primaryEditorResource, FileSystemProviderCapabilities.Readonly));
          const activePaneDiffEditor = activeEditorPane?.getId() === TEXT_DIFF_EDITOR_ID;
          groupTextCompareEditorActiveContext.set(activePaneDiffEditor);
          groupTextCompareEditorVisibleContext.set(activePaneDiffEditor);
        } else {
          groupActiveEditorContext.reset();
          groupActiveEditorCanRevert.reset();
          groupActiveEditorIsReadonly.reset();
          groupActiveCompareEditorCanSwap.reset();
          groupActiveEditorCanToggleReadonly.reset();
        }
      });
    };
    const updateGroupContextKeys = (e) => {
      switch (e.kind) {
        case GroupModelChangeKind.GROUP_LOCKED:
          groupLockedContext.set(this.isLocked);
          break;
        case GroupModelChangeKind.EDITOR_ACTIVE:
          groupActiveEditorFirstContext.set(this.model.isFirst(this.model.activeEditor));
          groupActiveEditorLastContext.set(this.model.isLast(this.model.activeEditor));
          groupActiveEditorPinnedContext.set(this.model.activeEditor ? this.model.isPinned(this.model.activeEditor) : false);
          groupActiveEditorStickyContext.set(this.model.activeEditor ? this.model.isSticky(this.model.activeEditor) : false);
          break;
        case GroupModelChangeKind.EDITOR_CLOSE:
          groupActiveEditorPinnedContext.set(this.model.activeEditor ? this.model.isPinned(this.model.activeEditor) : false);
          groupActiveEditorStickyContext.set(this.model.activeEditor ? this.model.isSticky(this.model.activeEditor) : false);
          break;
        case GroupModelChangeKind.EDITOR_OPEN:
        case GroupModelChangeKind.EDITOR_MOVE:
          groupActiveEditorFirstContext.set(this.model.isFirst(this.model.activeEditor));
          groupActiveEditorLastContext.set(this.model.isLast(this.model.activeEditor));
          break;
        case GroupModelChangeKind.EDITOR_PIN:
          if (e.editor && e.editor === this.model.activeEditor) {
            groupActiveEditorPinnedContext.set(this.model.isPinned(this.model.activeEditor));
          }
          break;
        case GroupModelChangeKind.EDITOR_STICKY:
          if (e.editor && e.editor === this.model.activeEditor) {
            groupActiveEditorStickyContext.set(this.model.isSticky(this.model.activeEditor));
          }
          break;
        case GroupModelChangeKind.EDITOR_CAPABILITIES:
          if (e.editor && e.editor === this.model.activeEditor) {
            observeActiveEditor();
          }
          break;
        case GroupModelChangeKind.EDITORS_SELECTION:
          multipleEditorsSelectedContext.set(this.model.selectedEditors.length > 1);
          twoEditorsSelectedContext.set(this.model.selectedEditors.length === 2);
          selectedEditorsHaveFileOrUntitledResourceContext.set(this.model.selectedEditors.every((e2) => e2.resource && (this.fileService.hasProvider(e2.resource) || e2.resource.scheme === Schemas.untitled)));
          break;
      }
      groupEditorsCountContext.set(this.count);
    };
    this._register(this.onDidModelChange((e) => updateGroupContextKeys(e)));
    this._register(this.onDidActiveEditorChange(() => observeActiveEditor()));
    observeActiveEditor();
    updateGroupContextKeys({ kind: GroupModelChangeKind.EDITOR_ACTIVE });
    updateGroupContextKeys({ kind: GroupModelChangeKind.GROUP_LOCKED });
  }
  registerContainerListeners() {
    this._register(addDisposableListener(this.element, EventType.DBLCLICK, (e) => {
      if (this.isEmpty) {
        EventHelper.stop(e);
        this.editorService.openEditor({
          resource: void 0,
          options: {
            pinned: true,
            override: DEFAULT_EDITOR_ASSOCIATION.id
          }
        }, this.id);
      }
    }));
    this._register(addDisposableListener(this.element, EventType.AUXCLICK, (e) => {
      if (this.isEmpty && e.button === 1) {
        EventHelper.stop(e, true);
        this.groupsView.removeGroup(this);
      }
    }));
  }
  createContainerToolbar() {
    const toolbarContainer = $(".editor-group-container-toolbar");
    this.element.appendChild(toolbarContainer);
    const containerToolbar = this._register(new ActionBar(toolbarContainer, {
      ariaLabel: localize("ariaLabelGroupActions", "Empty editor group actions"),
      highlightToggledItems: true
    }));
    const containerToolbarMenu = this._register(this.menuService.createMenu(MenuId.EmptyEditorGroup, this.scopedContextKeyService));
    const updateContainerToolbar = () => {
      this.containerToolBarMenuDisposable.value = toDisposable(() => containerToolbar.clear());
      const actions = getActionBarActions(
        containerToolbarMenu.getActions({ arg: { groupId: this.id }, shouldForwardArgs: true }),
        "navigation"
      );
      for (const action of [...actions.primary, ...actions.secondary]) {
        const keybinding = this.keybindingService.lookupKeybinding(action.id);
        containerToolbar.push(action, { icon: true, label: false, keybinding: keybinding?.getLabel() });
      }
    };
    updateContainerToolbar();
    this._register(containerToolbarMenu.onDidChange(updateContainerToolbar));
  }
  createContainerContextMenu() {
    this._register(addDisposableListener(this.element, EventType.CONTEXT_MENU, (e) => this.onShowContainerContextMenu(e)));
    this._register(addDisposableListener(this.element, TouchEventType.Contextmenu, () => this.onShowContainerContextMenu()));
  }
  onShowContainerContextMenu(e) {
    if (!this.isEmpty) {
      return;
    }
    let anchor = this.element;
    if (e) {
      anchor = new StandardMouseEvent(getWindow(this.element), e);
    }
    this.contextMenuService.showContextMenu({
      menuId: MenuId.EmptyEditorGroupContext,
      contextKeyService: this.contextKeyService,
      getAnchor: () => anchor,
      onHide: () => this.focus()
    });
  }
  doTrackFocus() {
    const containerFocusTracker = this._register(trackFocus(this.element));
    this._register(containerFocusTracker.onDidFocus(() => {
      if (this.isEmpty) {
        this._onDidFocus.fire();
      }
    }));
    const handleTitleClickOrTouch = (e) => {
      let target;
      if (isMouseEvent(e)) {
        if (e.button !== 0 || isMacintosh && e.ctrlKey) {
          return void 0;
        }
        target = e.target;
      } else {
        target = e.initialTarget;
      }
      if (findParentWithClass(target, "monaco-action-bar", this.titleContainer) || findParentWithClass(target, "monaco-breadcrumb-item", this.titleContainer)) {
        return;
      }
      setTimeout(() => {
        this.focus();
      });
    };
    this._register(addDisposableListener(this.titleContainer, EventType.MOUSE_DOWN, (e) => handleTitleClickOrTouch(e)));
    this._register(addDisposableListener(this.titleContainer, TouchEventType.Tap, (e) => handleTitleClickOrTouch(e)));
    this._register(this.editorPane.onDidFocus(() => {
      this._onDidFocus.fire();
    }));
  }
  updateContainer() {
    if (this.isEmpty) {
      this.element.classList.add("empty");
      this.element.tabIndex = 0;
      this.element.setAttribute("aria-label", localize("emptyEditorGroup", "{0} (empty)", this.ariaLabel));
    } else {
      this.element.classList.remove("empty");
      this.element.removeAttribute("tabIndex");
      this.element.removeAttribute("aria-label");
    }
    this.updateStyles();
  }
  updateTitleContainer() {
    this.titleContainer.classList.toggle("tabs", this.groupsView.partOptions.showTabs === "multiple");
    this.titleContainer.classList.toggle("show-file-icons", this.groupsView.partOptions.showIcons);
  }
  restoreEditors(from, groupViewOptions) {
    if (this.count === 0) {
      return;
    }
    let options;
    if (from instanceof EditorGroupView) {
      options = fillActiveEditorViewState(from);
    } else {
      options = /* @__PURE__ */ Object.create(null);
    }
    const activeEditor = this.model.activeEditor;
    if (!activeEditor) {
      return;
    }
    options.pinned = this.model.isPinned(activeEditor);
    options.sticky = this.model.isSticky(activeEditor);
    options.preserveFocus = true;
    const internalOptions = {
      preserveWindowOrder: true,
      // handle window order after editor is restored
      skipTitleUpdate: true
      // update the title later for all editors at once
    };
    const activeElement = getActiveElement();
    const result = this.doShowEditor(activeEditor, {
      active: true,
      isNew: false
      /* restored */
    }, options, internalOptions).then(() => {
      if (this.groupsView.activeGroup === this && activeElement && isActiveElement(activeElement) && !groupViewOptions?.preserveFocus) {
        this.focus();
      }
    });
    this.titleControl.openEditors(this.editors);
    return result;
  }
  //#region event handling
  registerListeners() {
    this._register(this.model.onDidModelChange((e) => this.onDidGroupModelChange(e)));
    this._register(this.groupsView.onDidChangeEditorPartOptions((e) => this.onDidChangeEditorPartOptions(e)));
    this._register(this.groupsView.onDidVisibilityChange((e) => this.onDidVisibilityChange(e)));
    this._register(this.onDidFocus(() => this.onDidGainFocus()));
  }
  onDidGroupModelChange(e) {
    this._onDidModelChange.fire(e);
    switch (e.kind) {
      case GroupModelChangeKind.GROUP_LOCKED:
        this.element.classList.toggle("locked", this.isLocked);
        break;
      case GroupModelChangeKind.EDITORS_SELECTION:
        this.onDidChangeEditorSelection();
        break;
    }
    if (!e.editor) {
      return;
    }
    switch (e.kind) {
      case GroupModelChangeKind.EDITOR_OPEN:
        if (isGroupEditorOpenEvent(e)) {
          this.onDidOpenEditor(e.editor, e.editorIndex);
        }
        break;
      case GroupModelChangeKind.EDITOR_CLOSE:
        if (isGroupEditorCloseEvent(e)) {
          this.handleOnDidCloseEditor(e.editor, e.editorIndex, e.context, e.sticky);
        }
        break;
      case GroupModelChangeKind.EDITOR_WILL_DISPOSE:
        this.onWillDisposeEditor(e.editor);
        break;
      case GroupModelChangeKind.EDITOR_DIRTY:
        this.onDidChangeEditorDirty(e.editor);
        break;
      case GroupModelChangeKind.EDITOR_TRANSIENT:
        this.onDidChangeEditorTransient(e.editor);
        break;
      case GroupModelChangeKind.EDITOR_LABEL:
        this.onDidChangeEditorLabel(e.editor);
        break;
      case GroupModelChangeKind.EDITOR_CAPABILITIES:
        this.onDidChangeEditorCapabilities(e.editor);
        break;
    }
  }
  onDidOpenEditor(editor, editorIndex) {
    this.telemetryService.publicLog("editorOpened", this.toEditorTelemetryDescriptor(editor));
    this.updateContainer();
  }
  handleOnDidCloseEditor(editor, editorIndex, context, sticky) {
    this._onWillCloseEditor.fire({ groupId: this.id, editor, context, index: editorIndex, sticky });
    const editorsToClose = [editor];
    if (editor instanceof SideBySideEditorInput) {
      editorsToClose.push(editor.primary, editor.secondary);
    }
    for (const editor2 of editorsToClose) {
      if (this.canDispose(editor2)) {
        editor2.dispose();
      }
    }
    this.updateContainer();
    this._onDidCloseEditor.fire({ groupId: this.id, editor, context, index: editorIndex, sticky });
  }
  canDispose(editor) {
    for (const groupView of this.editorPartsView.groups) {
      if (groupView instanceof EditorGroupView && groupView.model.contains(editor, {
        strictEquals: true,
        // only if this input is not shared across editor groups
        supportSideBySide: SideBySideEditor.ANY
        // include any side of an opened side by side editor
      })) {
        return false;
      }
    }
    return true;
  }
  toResourceTelemetryDescriptor(resource) {
    if (!resource) {
      return void 0;
    }
    const path = resource ? resource.scheme === Schemas.file ? resource.fsPath : resource.path : void 0;
    if (!path) {
      return void 0;
    }
    let resourceExt = extname(resource);
    const queryStringLocation = resourceExt.indexOf("?");
    resourceExt = queryStringLocation !== -1 ? resourceExt.substr(0, queryStringLocation) : resourceExt;
    return {
      mimeType: new TelemetryTrustedValue(getMimeTypes(resource).join(", ")),
      scheme: resource.scheme,
      ext: resourceExt,
      path: hash(path)
    };
  }
  toEditorTelemetryDescriptor(editor) {
    const descriptor = editor.getTelemetryDescriptor();
    const resource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.BOTH });
    if (URI.isUri(resource)) {
      descriptor["resource"] = this.toResourceTelemetryDescriptor(resource);
      return descriptor;
    } else if (resource) {
      if (resource.primary) {
        descriptor["resource"] = this.toResourceTelemetryDescriptor(resource.primary);
      }
      if (resource.secondary) {
        descriptor["resourceSecondary"] = this.toResourceTelemetryDescriptor(resource.secondary);
      }
      return descriptor;
    }
    return descriptor;
  }
  onWillDisposeEditor(editor) {
    this.disposedEditorsWorker.work(editor);
  }
  handleDisposedEditors(disposedEditors) {
    let activeEditor;
    const inactiveEditors = [];
    for (const disposedEditor of disposedEditors) {
      const editorFindResult = this.model.findEditor(disposedEditor);
      if (!editorFindResult) {
        continue;
      }
      const editor = editorFindResult[0];
      if (!editor.isDisposed()) {
        continue;
      }
      if (this.model.isActive(editor)) {
        activeEditor = editor;
      } else {
        inactiveEditors.push(editor);
      }
    }
    for (const inactiveEditor of inactiveEditors) {
      this.doCloseEditor(inactiveEditor, true);
    }
    if (activeEditor) {
      this.doCloseEditor(activeEditor, true);
    }
  }
  onDidChangeEditorPartOptions(event) {
    this.updateTitleContainer();
    this.titleControl.updateOptions(event.oldPartOptions, event.newPartOptions);
    if (event.oldPartOptions.showTabs !== event.newPartOptions.showTabs || event.oldPartOptions.tabHeight !== event.newPartOptions.tabHeight || event.oldPartOptions.showTabs === "multiple" && event.oldPartOptions.pinnedTabsOnSeparateRow !== event.newPartOptions.pinnedTabsOnSeparateRow) {
      this.relayout();
      if (this.model.activeEditor) {
        this.titleControl.openEditors(this.model.getEditors(EditorsOrder.SEQUENTIAL));
      }
    }
    this.updateStyles();
    if (event.oldPartOptions.enablePreview && !event.newPartOptions.enablePreview) {
      if (this.model.previewEditor) {
        this.pinEditor(this.model.previewEditor);
      }
    }
  }
  onDidChangeEditorDirty(editor) {
    this.pinEditor(editor);
    this.titleControl.updateEditorDirty(editor);
  }
  onDidChangeEditorTransient(editor) {
    const transient = this.model.isTransient(editor);
    if (!transient && !this.groupsView.partOptions.enablePreview) {
      this.pinEditor(editor);
    }
  }
  onDidChangeEditorLabel(editor) {
    this.titleControl.updateEditorLabel(editor);
  }
  onDidChangeEditorCapabilities(editor) {
    this.titleControl.updateEditorCapabilities(editor);
  }
  onDidChangeEditorSelection() {
    this.titleControl.updateEditorSelections();
  }
  onDidVisibilityChange(visible) {
    this.editorPane.setVisible(visible);
  }
  onDidGainFocus() {
    if (this.activeEditor) {
      this.model.setTransient(this.activeEditor, false);
    }
  }
  //#endregion
  //#region IEditorGroupView
  get index() {
    return this._index;
  }
  get label() {
    if (this.groupsLabel) {
      return localize("groupLabelLong", "{0}: Group {1}", this.groupsLabel, this._index + 1);
    }
    return localize("groupLabel", "Group {0}", this._index + 1);
  }
  get ariaLabel() {
    if (this.groupsLabel) {
      return localize("groupAriaLabelLong", "{0}: Editor Group {1}", this.groupsLabel, this._index + 1);
    }
    return localize("groupAriaLabel", "Editor Group {0}", this._index + 1);
  }
  get disposed() {
    return this._disposed;
  }
  get isEmpty() {
    return this.count === 0;
  }
  get titleHeight() {
    return this.titleControl.getHeight();
  }
  notifyIndexChanged(newIndex) {
    if (this._index !== newIndex) {
      this._index = newIndex;
      this.model.setIndex(newIndex);
    }
  }
  notifyLabelChanged(newLabel) {
    if (this.groupsLabel !== newLabel) {
      this.groupsLabel = newLabel;
      this.model.setLabel(newLabel);
    }
  }
  setActive(isActive) {
    this.active = isActive;
    if (!isActive && this.activeEditor && this.selectedEditors.length > 1) {
      this.setSelection(this.activeEditor, []);
    }
    this.element.classList.toggle("active", isActive);
    this.element.classList.toggle("inactive", !isActive);
    this.titleControl.setActive(isActive);
    this.updateStyles();
    this.model.setActive(
      void 0
      /* entire group got active */
    );
  }
  //#endregion
  //#region basics()
  get id() {
    return this.model.id;
  }
  get windowId() {
    return this.groupsView.windowId;
  }
  get editors() {
    return this.model.getEditors(EditorsOrder.SEQUENTIAL);
  }
  get count() {
    return this.model.count;
  }
  get stickyCount() {
    return this.model.stickyCount;
  }
  /** The container that bounds the editor pane, excluding any docked content inset. */
  get editorPaneContainer() {
    return this.editorContainer;
  }
  get activeEditorPane() {
    return this.editorPane ? this.editorPane.activeEditorPane ?? void 0 : void 0;
  }
  get activeEditor() {
    return this.model.activeEditor;
  }
  get selectedEditors() {
    return this.model.selectedEditors;
  }
  get previewEditor() {
    return this.model.previewEditor;
  }
  isPinned(editorOrIndex) {
    return this.model.isPinned(editorOrIndex);
  }
  isSticky(editorOrIndex) {
    return this.model.isSticky(editorOrIndex);
  }
  isSelected(editor) {
    return this.model.isSelected(editor);
  }
  isTransient(editorOrIndex) {
    return this.model.isTransient(editorOrIndex);
  }
  isActive(editor) {
    return this.model.isActive(editor);
  }
  async setSelection(activeSelectedEditor, inactiveSelectedEditors) {
    if (!this.isActive(activeSelectedEditor)) {
      await this.openEditor(activeSelectedEditor, { activation: EditorActivation.ACTIVATE }, { inactiveSelection: inactiveSelectedEditors });
    } else {
      this.model.setSelection(activeSelectedEditor, inactiveSelectedEditors);
    }
  }
  contains(candidate, options) {
    return this.model.contains(candidate, options);
  }
  getEditors(order, options) {
    return this.model.getEditors(order, options);
  }
  findEditors(resource, options) {
    const canonicalResource = this.uriIdentityService.asCanonicalUri(resource);
    return this.getEditors(options?.order ?? EditorsOrder.SEQUENTIAL).filter((editor) => {
      if (editor.resource && isEqual(editor.resource, canonicalResource)) {
        return true;
      }
      if (options?.supportSideBySide === SideBySideEditor.PRIMARY || options?.supportSideBySide === SideBySideEditor.ANY) {
        const primaryResource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
        if (primaryResource && isEqual(primaryResource, canonicalResource)) {
          return true;
        }
      }
      if (options?.supportSideBySide === SideBySideEditor.SECONDARY || options?.supportSideBySide === SideBySideEditor.ANY) {
        const secondaryResource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.SECONDARY });
        if (secondaryResource && isEqual(secondaryResource, canonicalResource)) {
          return true;
        }
      }
      return false;
    });
  }
  getEditorByIndex(index) {
    return this.model.getEditorByIndex(index);
  }
  getIndexOfEditor(editor) {
    return this.model.indexOf(editor);
  }
  isFirst(editor) {
    return this.model.isFirst(editor);
  }
  isLast(editor) {
    return this.model.isLast(editor);
  }
  focus() {
    if (this.activeEditorPane) {
      this.activeEditorPane.focus();
    } else {
      this.element.focus();
    }
    this._onDidFocus.fire();
  }
  pinEditor(candidate = this.activeEditor || void 0) {
    if (candidate && !this.model.isPinned(candidate)) {
      const editor = this.model.pin(candidate);
      if (editor) {
        this.titleControl.pinEditor(editor);
      }
    }
  }
  stickEditor(candidate = this.activeEditor || void 0) {
    this.doStickEditor(candidate, true);
  }
  unstickEditor(candidate = this.activeEditor || void 0) {
    this.doStickEditor(candidate, false);
  }
  doStickEditor(candidate, sticky) {
    if (candidate && this.model.isSticky(candidate) !== sticky) {
      const oldIndexOfEditor = this.getIndexOfEditor(candidate);
      const editor = sticky ? this.model.stick(candidate) : this.model.unstick(candidate);
      if (!editor) {
        return;
      }
      const newIndexOfEditor = this.getIndexOfEditor(editor);
      if (newIndexOfEditor !== oldIndexOfEditor) {
        this.titleControl.moveEditor(editor, oldIndexOfEditor, newIndexOfEditor, true);
      }
      if (sticky) {
        this.titleControl.stickEditor(editor);
      } else {
        this.titleControl.unstickEditor(editor);
      }
    }
  }
  //#endregion
  //#region openEditor()
  async openEditor(editor, options, internalOptions) {
    return this.doOpenEditor(editor, options, {
      // Appply given internal open options
      ...internalOptions,
      // Allow to match on a side-by-side editor when same
      // editor is opened on both sides. In that case we
      // do not want to open a new editor but reuse that one.
      supportSideBySide: SideBySideEditor.BOTH
    });
  }
  async doOpenEditor(editor, options, internalOptions) {
    if (!editor || editor.isDisposed()) {
      return;
    }
    this._onWillOpenEditor.fire({ editor, groupId: this.id });
    const pinned = options?.sticky || !this.groupsView.partOptions.enablePreview && !options?.transient || editor.isDirty() || (options?.pinned ?? typeof options?.index === "number") || typeof options?.index === "number" && this.model.isSticky(options.index) || editor.hasCapability(EditorInputCapabilities.Scratchpad);
    const openEditorOptions = {
      index: options ? options.index : void 0,
      pinned,
      sticky: options?.sticky || typeof options?.index === "number" && this.model.isSticky(options.index),
      transient: !!options?.transient,
      inactiveSelection: internalOptions?.inactiveSelection,
      active: this.count === 0 || !options?.inactive,
      supportSideBySide: internalOptions?.supportSideBySide
    };
    if (!openEditorOptions.active && !openEditorOptions.pinned && this.model.activeEditor && !this.model.isPinned(this.model.activeEditor)) {
      openEditorOptions.active = true;
    }
    let activateGroup = false;
    let restoreGroup = false;
    if (options?.activation === EditorActivation.ACTIVATE) {
      activateGroup = true;
    } else if (options?.activation === EditorActivation.RESTORE) {
      restoreGroup = true;
    } else if (options?.activation === EditorActivation.PRESERVE) {
      activateGroup = false;
      restoreGroup = false;
    } else if (openEditorOptions.active) {
      activateGroup = !options?.preserveFocus;
      restoreGroup = !activateGroup;
    }
    if (typeof openEditorOptions.index === "number") {
      const indexOfEditor = this.model.indexOf(editor);
      if (indexOfEditor !== -1 && indexOfEditor !== openEditorOptions.index) {
        this.doMoveEditorInsideGroup(editor, openEditorOptions);
      }
    }
    const { editor: openedEditor, isNew } = this.model.openEditor(editor, openEditorOptions);
    if (isNew && // only if this editor was new for the group
    this.count === 1 && // only when this editor was the first editor in the group
    this.editorPartsView.groups.length > 1) {
      if (openedEditor.editorId && this.groupsView.partOptions.autoLockGroups?.has(openedEditor.editorId)) {
        this.lock(true);
      }
    }
    const showEditorResult = this.doShowEditor(openedEditor, { active: !!openEditorOptions.active, isNew }, options, internalOptions);
    if (activateGroup) {
      this.groupsView.activateGroup(this);
    } else if (restoreGroup) {
      this.groupsView.restoreGroup(this);
    }
    return showEditorResult;
  }
  doShowEditor(editor, context, options, internalOptions) {
    let openEditorPromise;
    if (context.active) {
      openEditorPromise = (async () => {
        const { pane, changed, cancelled, error } = await this.editorPane.openEditor(editor, options, internalOptions, { newInGroup: context.isNew });
        if (cancelled) {
          return void 0;
        }
        if (changed) {
          this._onDidActiveEditorChange.fire({ editor, isExplicit: options?.isExplicit });
        }
        if (error) {
          this._onDidOpenEditorFail.fire(editor);
        }
        if (!pane && this.activeEditor === editor) {
          this.doCloseEditor(editor, options?.preserveFocus, { fromError: true });
        }
        return pane;
      })();
    } else {
      openEditorPromise = Promise.resolve(void 0);
    }
    if (!internalOptions?.skipTitleUpdate) {
      this.titleControl.openEditor(editor, internalOptions);
    }
    return openEditorPromise;
  }
  //#endregion
  //#region openEditors()
  async openEditors(editors) {
    const editorsToOpen = coalesce(editors).filter(({ editor }) => !editor.isDisposed());
    const firstEditor = editorsToOpen.at(0);
    if (!firstEditor) {
      return;
    }
    const openEditorsOptions = {
      // Allow to match on a side-by-side editor when same
      // editor is opened on both sides. In that case we
      // do not want to open a new editor but reuse that one.
      supportSideBySide: SideBySideEditor.BOTH
    };
    await this.doOpenEditor(firstEditor.editor, firstEditor.options, openEditorsOptions);
    const inactiveEditors = editorsToOpen.slice(1);
    const startingIndex = this.getIndexOfEditor(firstEditor.editor) + 1;
    await Promises.settled(inactiveEditors.map(({ editor, options }, index) => {
      return this.doOpenEditor(editor, {
        ...options,
        inactive: true,
        pinned: true,
        index: startingIndex + index
      }, {
        ...openEditorsOptions,
        // optimization: update the title control later
        // https://github.com/microsoft/vscode/issues/130634
        skipTitleUpdate: true
      });
    }));
    this.titleControl.openEditors(inactiveEditors.map(({ editor }) => editor));
    return this.editorPane.activeEditorPane ?? void 0;
  }
  //#endregion
  //#region moveEditor()
  moveEditors(editors, target) {
    const internalOptions = {
      skipTitleUpdate: this !== target
    };
    let moveFailed = false;
    const movedEditors = /* @__PURE__ */ new Set();
    for (const { editor, options } of editors) {
      if (this.moveEditor(editor, target, options, internalOptions)) {
        movedEditors.add(editor);
      } else {
        moveFailed = true;
      }
    }
    if (internalOptions.skipTitleUpdate) {
      target.titleControl.openEditors(Array.from(movedEditors));
      this.titleControl.closeEditors(Array.from(movedEditors));
    }
    return !moveFailed;
  }
  moveEditor(editor, target, options, internalOptions) {
    if (this === target) {
      this.doMoveEditorInsideGroup(editor, options);
      return true;
    } else {
      return this.doMoveOrCopyEditorAcrossGroups(editor, target, options, { ...internalOptions, keepCopy: false });
    }
  }
  doMoveEditorInsideGroup(candidate, options) {
    const moveToIndex = options ? options.index : void 0;
    if (typeof moveToIndex !== "number") {
      return;
    }
    const currentIndex = this.model.indexOf(candidate);
    const editor = this.model.getEditorByIndex(currentIndex);
    if (!editor) {
      return;
    }
    if (currentIndex !== moveToIndex) {
      const oldStickyCount = this.model.stickyCount;
      this.model.moveEditor(editor, moveToIndex);
      this.model.pin(editor);
      this.titleControl.moveEditor(editor, currentIndex, moveToIndex, oldStickyCount !== this.model.stickyCount);
      this.titleControl.pinEditor(editor);
    }
    if (options?.sticky) {
      this.stickEditor(editor);
    }
  }
  doMoveOrCopyEditorAcrossGroups(editor, target, openOptions, internalOptions) {
    const keepCopy = internalOptions?.keepCopy;
    if (!keepCopy || editor.hasCapability(EditorInputCapabilities.Singleton)) {
      const canMoveVeto = editor.canMove(this.id, target.id);
      if (typeof canMoveVeto === "string") {
        this.dialogService.error(canMoveVeto, localize("moveErrorDetails", "Try saving or reverting the editor first and then try again."));
        return false;
      }
    }
    const options = fillActiveEditorViewState(this, editor, {
      ...openOptions,
      pinned: true,
      // always pin moved editor
      sticky: openOptions?.sticky ?? (!keepCopy && this.model.isSticky(editor))
      // preserve sticky state only if editor is moved or explicitly wanted (https://github.com/microsoft/vscode/issues/99035)
    });
    if (!keepCopy) {
      this._onWillMoveEditor.fire({
        groupId: this.id,
        editor,
        target: target.id
      });
    }
    target.doOpenEditor(keepCopy ? editor.copy() : editor, options, internalOptions);
    if (!keepCopy) {
      this.doCloseEditor(editor, true, { ...internalOptions, context: EditorCloseContext.MOVE });
    }
    return true;
  }
  //#endregion
  //#region copyEditor()
  copyEditors(editors, target) {
    const internalOptions = {
      skipTitleUpdate: this !== target
    };
    for (const { editor, options } of editors) {
      this.copyEditor(editor, target, options, internalOptions);
    }
    if (internalOptions.skipTitleUpdate) {
      const copiedEditors = editors.map(({ editor }) => editor);
      target.titleControl.openEditors(copiedEditors);
    }
  }
  copyEditor(editor, target, options, internalOptions) {
    if (this === target) {
      this.doMoveEditorInsideGroup(editor, options);
    } else {
      this.doMoveOrCopyEditorAcrossGroups(editor, target, options, { ...internalOptions, keepCopy: true });
    }
  }
  //#endregion
  //#region closeEditor()
  async closeEditor(editor = this.activeEditor || void 0, options) {
    return this.doCloseEditorWithConfirmationHandling(editor, options);
  }
  async doCloseEditorWithConfirmationHandling(editor = this.activeEditor || void 0, options, internalOptions) {
    if (!editor) {
      return false;
    }
    if (!options?.force && !internalOptions?.force && editor.hasCapability(EditorInputCapabilities.CannotClose)) {
      return false;
    }
    const veto = await this.handleCloseConfirmation([editor]);
    if (veto) {
      return false;
    }
    this.doCloseEditor(editor, options?.preserveFocus, internalOptions);
    return true;
  }
  doCloseEditor(editor, preserveFocus = this.groupsView.activeGroup !== this, internalOptions) {
    if (!internalOptions?.skipTitleUpdate) {
      this.titleControl.beforeCloseEditor(editor);
    }
    if (this.model.isActive(editor)) {
      this.doCloseActiveEditor(preserveFocus, internalOptions);
    } else {
      this.doCloseInactiveEditor(editor, internalOptions);
    }
    if (!internalOptions?.skipTitleUpdate) {
      this.titleControl.closeEditor(editor);
    }
  }
  doCloseActiveEditor(preserveFocus = this.groupsView.activeGroup !== this, internalOptions) {
    const editorToClose = this.activeEditor;
    const restoreFocus = !preserveFocus && this.shouldRestoreFocus(this.element);
    const closeEmptyGroup = this.groupsView.partOptions.closeEmptyGroups;
    if (closeEmptyGroup && this.active && this.count === 1) {
      const mostRecentlyActiveGroups = this.groupsView.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
      const nextActiveGroup = mostRecentlyActiveGroups[1];
      if (nextActiveGroup) {
        if (restoreFocus) {
          nextActiveGroup.focus();
        } else {
          this.groupsView.activateGroup(nextActiveGroup, true);
        }
      }
    }
    if (editorToClose) {
      this.model.closeEditor(editorToClose, internalOptions?.context);
    }
    const nextActiveEditor = this.model.activeEditor;
    if (nextActiveEditor) {
      let activation = void 0;
      if (preserveFocus && this.groupsView.activeGroup !== this) {
        activation = EditorActivation.PRESERVE;
      }
      const options = {
        preserveFocus,
        activation,
        // When closing an editor due to an error we can end up in a loop where we continue closing
        // editors that fail to open (e.g. when the file no longer exists). We do not want to show
        // repeated errors in this case to the user. As such, if we open the next editor and we are
        // in a scope of a previous editor failing, we silence the input errors until the editor is
        // opened by setting ignoreError: true.
        ignoreError: internalOptions?.fromError
      };
      const internalEditorOpenOptions = {
        // When closing an editor, we reveal the next one in the group.
        // However, this can be a result of moving an editor to another
        // window so we explicitly disable window reordering in this case.
        preserveWindowOrder: true
      };
      this.doOpenEditor(nextActiveEditor, options, internalEditorOpenOptions);
    } else {
      if (editorToClose) {
        this.editorPane.closeEditor(editorToClose);
      }
      if (restoreFocus && !closeEmptyGroup) {
        this.focus();
      }
      this._onDidActiveEditorChange.fire({ editor: void 0 });
      if (closeEmptyGroup) {
        this.groupsView.removeGroup(this, preserveFocus);
      }
    }
  }
  shouldRestoreFocus(target) {
    const activeElement = getActiveElement();
    if (activeElement === target.ownerDocument.body) {
      return true;
    }
    return isAncestor(activeElement, target);
  }
  doCloseInactiveEditor(editor, internalOptions) {
    this.model.closeEditor(editor, internalOptions?.context);
  }
  async handleCloseConfirmation(editors) {
    if (!editors.length) {
      return false;
    }
    const editor = editors.shift();
    let handleCloseConfirmationPromise = this.mapEditorToPendingConfirmation.get(editor);
    if (!handleCloseConfirmationPromise) {
      handleCloseConfirmationPromise = this.doHandleCloseConfirmation(editor);
      this.mapEditorToPendingConfirmation.set(editor, handleCloseConfirmationPromise);
    }
    let veto;
    try {
      veto = await handleCloseConfirmationPromise;
    } finally {
      this.mapEditorToPendingConfirmation.delete(editor);
    }
    if (veto) {
      return veto;
    }
    return this.handleCloseConfirmation(editors);
  }
  async doHandleCloseConfirmation(editor, options) {
    if (!this.shouldConfirmClose(editor)) {
      return false;
    }
    if (editor instanceof SideBySideEditorInput && this.model.contains(editor.primary)) {
      return false;
    }
    if (this.editorPartsView.groups.some((groupView) => {
      if (groupView === this) {
        return false;
      }
      const otherGroup = groupView;
      if (otherGroup.contains(editor, { supportSideBySide: SideBySideEditor.BOTH })) {
        return true;
      }
      if (editor instanceof SideBySideEditorInput && otherGroup.contains(editor.primary)) {
        return true;
      }
      return false;
    })) {
      return false;
    }
    let confirmation = ConfirmResult.CANCEL;
    let saveReason = SaveReason.EXPLICIT;
    let autoSave = false;
    if (!editor.hasCapability(EditorInputCapabilities.Untitled) && !options?.skipAutoSave && !editor.closeHandler) {
      if (this.filesConfigurationService.getAutoSaveMode(editor).mode === AutoSaveMode.ON_FOCUS_CHANGE) {
        autoSave = true;
        confirmation = ConfirmResult.SAVE;
        saveReason = SaveReason.FOCUS_CHANGE;
      } else if (isNative && (isWindows || isLinux) && this.filesConfigurationService.getAutoSaveMode(editor).mode === AutoSaveMode.ON_WINDOW_CHANGE) {
        autoSave = true;
        confirmation = ConfirmResult.SAVE;
        saveReason = SaveReason.WINDOW_CHANGE;
      }
    }
    if (!autoSave) {
      if (!this.activeEditor?.matches(editor)) {
        await this.doOpenEditor(editor);
      }
      await this.hostService.focus(getWindow(this.element));
      let handlerDidError = false;
      if (typeof editor.closeHandler?.confirm === "function") {
        try {
          confirmation = await editor.closeHandler.confirm([{ editor, groupId: this.id }]);
        } catch (e) {
          this.logService.error(e);
          handlerDidError = true;
        }
      }
      if (typeof editor.closeHandler?.confirm !== "function" || handlerDidError) {
        let name;
        if (editor instanceof SideBySideEditorInput) {
          name = editor.primary.getName();
        } else {
          name = editor.getName();
        }
        confirmation = await this.fileDialogService.showSaveConfirm([name]);
      }
    }
    if (!editor.closeHandler && !this.shouldConfirmClose(editor)) {
      return confirmation === ConfirmResult.CANCEL;
    }
    switch (confirmation) {
      case ConfirmResult.SAVE: {
        const result = await editor.save(this.id, { reason: saveReason });
        if (!result && autoSave) {
          return this.doHandleCloseConfirmation(editor, { skipAutoSave: true });
        }
        return editor.isDirty();
      }
      case ConfirmResult.DONT_SAVE:
        try {
          await editor.revert(this.id);
          return editor.isDirty();
        } catch (error) {
          this.logService.error(error);
          await editor.revert(this.id, { soft: true });
          return editor.isDirty();
        }
      case ConfirmResult.CANCEL:
        return true;
    }
  }
  shouldConfirmClose(editor) {
    if (editor.closeHandler) {
      try {
        return editor.closeHandler.showConfirm();
      } catch (error) {
        this.logService.error(error);
      }
    }
    return editor.isDirty() && !editor.isSaving();
  }
  //#endregion
  //#region closeEditors()
  async closeEditors(args, options) {
    if (this.isEmpty) {
      return true;
    }
    const editors = this.doGetEditorsToClose(args).filter((editor) => options?.force || !editor.hasCapability(EditorInputCapabilities.CannotClose));
    if (!editors.length) {
      return true;
    }
    const veto = await this.handleCloseConfirmation(editors.slice(0));
    if (veto) {
      return false;
    }
    this.doCloseEditors(editors, options);
    return true;
  }
  doGetEditorsToClose(args) {
    if (Array.isArray(args)) {
      return args;
    }
    const filter = args;
    const hasDirection = typeof filter.direction === "number";
    let editorsToClose = this.model.getEditors(hasDirection ? EditorsOrder.SEQUENTIAL : EditorsOrder.MOST_RECENTLY_ACTIVE, filter);
    if (filter.savedOnly) {
      editorsToClose = editorsToClose.filter((editor) => !editor.isDirty() || editor.isSaving());
    } else if (hasDirection && filter.except) {
      editorsToClose = filter.direction === CloseDirection.LEFT ? editorsToClose.slice(0, this.model.indexOf(filter.except, editorsToClose)) : editorsToClose.slice(this.model.indexOf(filter.except, editorsToClose) + 1);
    } else if (filter.except) {
      editorsToClose = editorsToClose.filter((editor) => filter.except && !editor.matches(filter.except));
    }
    return editorsToClose;
  }
  doCloseEditors(editors, options) {
    let closeActiveEditor = false;
    for (const editor of editors) {
      if (!this.isActive(editor)) {
        this.doCloseInactiveEditor(editor);
      } else {
        closeActiveEditor = true;
      }
    }
    if (closeActiveEditor) {
      this.doCloseActiveEditor(options?.preserveFocus);
    }
    if (editors.length) {
      this.titleControl.closeEditors(editors);
    }
  }
  closeAllEditors(options) {
    if (this.isEmpty) {
      if (this.groupsView.partOptions.closeEmptyGroups) {
        this.groupsView.removeGroup(this);
      }
      return true;
    }
    if (options?.excludeConfirming) {
      this.doCloseAllEditors(options);
      return true;
    }
    const editors = this.model.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, options).filter((editor) => options?.force || !editor.hasCapability(EditorInputCapabilities.CannotClose));
    if (!editors.length) {
      return true;
    }
    return this.handleCloseConfirmation(editors).then((veto) => {
      if (veto) {
        return false;
      }
      this.doCloseAllEditors(options);
      return true;
    });
  }
  doCloseAllEditors(options) {
    let editors = this.model.getEditors(EditorsOrder.SEQUENTIAL, options).filter((editor) => options?.force || !editor.hasCapability(EditorInputCapabilities.CannotClose));
    if (options?.excludeConfirming) {
      editors = editors.filter((editor) => !this.shouldConfirmClose(editor));
    }
    const editorsToClose = [];
    for (const editor of editors) {
      if (!this.isActive(editor)) {
        this.doCloseInactiveEditor(editor);
      }
      editorsToClose.push(editor);
    }
    if (this.activeEditor && editorsToClose.includes(this.activeEditor)) {
      this.doCloseActiveEditor();
    }
    if (editorsToClose.length) {
      this.titleControl.closeEditors(editorsToClose);
    }
  }
  //#endregion
  //#region replaceEditors()
  async replaceEditors(editors) {
    let activeReplacement;
    const inactiveReplacements = [];
    for (let { editor, replacement, forceReplaceDirty, options } of editors) {
      const index = this.getIndexOfEditor(editor);
      if (index >= 0) {
        const isActiveEditor = this.isActive(editor);
        if (options) {
          options.index = index;
        } else {
          options = { index };
        }
        options.inactive = !isActiveEditor;
        options.pinned = options.pinned ?? true;
        const editorToReplace = { editor, replacement, forceReplaceDirty, options };
        if (isActiveEditor) {
          activeReplacement = editorToReplace;
        } else {
          inactiveReplacements.push(editorToReplace);
        }
      }
    }
    for (const { editor, replacement, forceReplaceDirty, options } of inactiveReplacements) {
      await this.doOpenEditor(replacement, options);
      if (!editor.matches(replacement)) {
        let closed = false;
        if (forceReplaceDirty) {
          this.doCloseEditor(editor, true, { context: EditorCloseContext.REPLACE });
          closed = true;
        } else {
          closed = await this.doCloseEditorWithConfirmationHandling(editor, { preserveFocus: true }, { context: EditorCloseContext.REPLACE, force: true });
        }
        if (!closed) {
          return;
        }
      }
    }
    if (activeReplacement) {
      const openEditorResult = this.doOpenEditor(activeReplacement.replacement, activeReplacement.options);
      if (!activeReplacement.editor.matches(activeReplacement.replacement)) {
        if (activeReplacement.forceReplaceDirty) {
          this.doCloseEditor(activeReplacement.editor, true, { context: EditorCloseContext.REPLACE });
        } else {
          await this.doCloseEditorWithConfirmationHandling(activeReplacement.editor, { preserveFocus: true }, { context: EditorCloseContext.REPLACE, force: true });
        }
      }
      await openEditorResult;
    }
  }
  //#endregion
  //#region Locking
  get isLocked() {
    return this.model.isLocked;
  }
  lock(locked) {
    this.model.lock(locked);
  }
  //#endregion
  //#region Editor Actions
  createEditorActions(disposables, menuId = MenuId.EditorTitle) {
    let actions = { primary: [], secondary: [] };
    let onDidChange;
    const activeEditorPane = this.activeEditorPane;
    if (activeEditorPane instanceof EditorPane) {
      const editorScopedContextKeyService = activeEditorPane.scopedContextKeyService ?? this.scopedContextKeyService;
      const editorTitleMenu = disposables.add(this.menuService.createMenu(menuId, editorScopedContextKeyService, { emitEventsForSubmenuChanges: true, eventDebounceDelay: 0 }));
      onDidChange = editorTitleMenu.onDidChange;
      const shouldInlineGroup = (action, group) => group === "navigation" && action.actions.length <= 1;
      actions = getActionBarActions(
        editorTitleMenu.getActions({ arg: this.resourceContext.get(), shouldForwardArgs: true, renderShortTitle: true }),
        "navigation",
        shouldInlineGroup
      );
      if (menuId === MenuId.EditorTitle) {
        const available = getAvailableEditorTypes(this.activeEditor, this.editorResolverService);
        if (available) {
          const editorTypeActions = createEditorTypeActions(available, this.editorResolverService, this.commandService, this.editorService);
          const reopenWithSubmenu = new SubmenuAction("editor.reopenWith", localize("reopenWith", "Reopen Editor With"), editorTypeActions);
          if (actions.secondary.length) {
            actions.secondary.push(new Separator());
          }
          actions.secondary.push(reopenWithSubmenu);
        }
      }
    } else {
      const onDidChangeEmitter = disposables.add(new Emitter());
      onDidChange = onDidChangeEmitter.event;
      disposables.add(this.onDidActiveEditorChange(() => onDidChangeEmitter.fire()));
    }
    return { actions, onDidChange };
  }
  //#endregion
  //#region Themable
  updateStyles() {
    const isEmpty = this.isEmpty;
    if (isEmpty) {
      this.element.style.backgroundColor = this.getColor(EDITOR_GROUP_EMPTY_BACKGROUND) || "";
    } else {
      this.element.style.backgroundColor = "";
    }
    const borderColor = this.getColor(EDITOR_GROUP_HEADER_BORDER) || this.getColor(contrastBorder);
    if (!isEmpty && borderColor) {
      this.titleContainer.classList.add("title-border-bottom");
      this.titleContainer.style.setProperty("--title-border-bottom-color", borderColor);
    } else {
      this.titleContainer.classList.remove("title-border-bottom");
      this.titleContainer.style.removeProperty("--title-border-bottom-color");
    }
    const { showTabs } = this.groupsView.partOptions;
    this.titleContainer.style.backgroundColor = this.getColor(showTabs === "multiple" ? EDITOR_GROUP_HEADER_TABS_BACKGROUND : EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND) || "";
    this.editorContainer.style.backgroundColor = this.getColor(editorBackground) || "";
  }
  get minimumWidth() {
    return this.editorPane.minimumWidth;
  }
  get minimumHeight() {
    return this.editorPane.minimumHeight;
  }
  get maximumWidth() {
    return this.editorPane.maximumWidth;
  }
  get maximumHeight() {
    return this.editorPane.maximumHeight;
  }
  get proportionalLayout() {
    if (!this.lastLayout) {
      return true;
    }
    return !(this.lastLayout.width === this.minimumWidth || this.lastLayout.height === this.minimumHeight);
  }
  layout(width, height, top, left) {
    this.lastLayout = { width, height, top, left };
    this.element.classList.toggle("max-height-478px", height <= 478);
    const titleControlSize = this.titleControl.layout({
      container: new Dimension(width, height),
      available: new Dimension(width, height - this.editorPane.minimumHeight)
    });
    this.progressBar.getContainer().style.top = `${Math.max(this.titleHeight.offset - 2, 0)}px`;
    const contentWidth = Math.max(0, width - this._contentRightInset);
    const editorHeight = Math.max(0, height - titleControlSize.height);
    this.editorContainer.style.width = `${contentWidth}px`;
    this.editorContainer.style.height = `${editorHeight}px`;
    this.editorPane.layout({ width: contentWidth, height: editorHeight, top: top + titleControlSize.height, left });
  }
  /**
   * Sets the right inset reserved beside the breadcrumbs and editor pane while tabs remain full-width.
   * `0` restores the default full-width content.
   */
  setContentRightInset(inset) {
    const next = Math.max(0, Math.round(inset));
    if (next === this._contentRightInset) {
      return;
    }
    this._contentRightInset = next;
    this.relayout();
  }
  relayout() {
    if (this.lastLayout) {
      const { width, height, top, left } = this.lastLayout;
      this.layout(width, height, top, left);
      this._onDidRelayout.fire();
    }
  }
  setBoundarySashes(sashes) {
    this.editorPane.setBoundarySashes(sashes);
  }
  toJSON() {
    return this.model.serialize();
  }
  //#endregion
  dispose() {
    this._disposed = true;
    this._onWillDispose.fire();
    super.dispose();
  }
};
EditorGroupView = __decorateClass([
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, IKeybindingService),
  __decorateParam(11, IMenuService),
  __decorateParam(12, IContextMenuService),
  __decorateParam(13, IFileDialogService),
  __decorateParam(14, IEditorService),
  __decorateParam(15, IFilesConfigurationService),
  __decorateParam(16, IUriIdentityService),
  __decorateParam(17, ILogService),
  __decorateParam(18, IEditorResolverService),
  __decorateParam(19, IHostService),
  __decorateParam(20, IDialogService),
  __decorateParam(21, IFileService),
  __decorateParam(22, ICommandService)
], EditorGroupView);
export {
  EditorGroupView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGVkaXRvckdyb3VwVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9lZGl0b3Jncm91cHZpZXcuY3NzJztcbmltcG9ydCB7IEVkaXRvckdyb3VwTW9kZWwsIElFZGl0b3JPcGVuT3B0aW9ucywgSUdyb3VwTW9kZWxDaGFuZ2VFdmVudCwgSVNlcmlhbGl6ZWRFZGl0b3JHcm91cE1vZGVsLCBpc0dyb3VwRWRpdG9yQ2xvc2VFdmVudCwgaXNHcm91cEVkaXRvck9wZW5FdmVudCwgaXNTZXJpYWxpemVkRWRpdG9yR3JvdXBNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9yR3JvdXBNb2RlbC5qcyc7XG5pbXBvcnQgeyBHcm91cElkZW50aWZpZXIsIENsb3NlRGlyZWN0aW9uLCBJRWRpdG9yQ2xvc2VFdmVudCwgSUVkaXRvclBhbmUsIFNhdmVSZWFzb24sIElFZGl0b3JQYXJ0T3B0aW9uc0NoYW5nZUV2ZW50LCBFZGl0b3JzT3JkZXIsIElWaXNpYmxlRWRpdG9yUGFuZSwgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMsIElVbnR5cGVkRWRpdG9ySW5wdXQsIERFRkFVTFRfRURJVE9SX0FTU09DSUFUSU9OLCBTaWRlQnlTaWRlRWRpdG9yLCBFZGl0b3JDbG9zZUNvbnRleHQsIElFZGl0b3JXaWxsTW92ZUV2ZW50LCBJRWRpdG9yV2lsbE9wZW5FdmVudCwgSU1hdGNoRWRpdG9yT3B0aW9ucywgR3JvdXBNb2RlbENoYW5nZUtpbmQsIElBY3RpdmVFZGl0b3JDaGFuZ2VFdmVudCwgSUZpbmRFZGl0b3JPcHRpb25zLCBURVhUX0RJRkZfRURJVE9SX0lEIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBBY3RpdmVFZGl0b3JHcm91cExvY2tlZENvbnRleHQsIEFjdGl2ZUVkaXRvckRpcnR5Q29udGV4dCwgRWRpdG9yR3JvdXBFZGl0b3JzQ291bnRDb250ZXh0LCBBY3RpdmVFZGl0b3JTdGlja3lDb250ZXh0LCBBY3RpdmVFZGl0b3JQaW5uZWRDb250ZXh0LCBBY3RpdmVFZGl0b3JMYXN0SW5Hcm91cENvbnRleHQsIEFjdGl2ZUVkaXRvckZpcnN0SW5Hcm91cENvbnRleHQsIFJlc291cmNlQ29udGV4dEtleSwgYXBwbHlBdmFpbGFibGVFZGl0b3JJZHMsIEFjdGl2ZUVkaXRvckF2YWlsYWJsZUVkaXRvcklkc0NvbnRleHQsIEFjdGl2ZUVkaXRvckNhblNwbGl0SW5Hcm91cENvbnRleHQsIFNpZGVCeVNpZGVFZGl0b3JBY3RpdmVDb250ZXh0LCBUZXh0Q29tcGFyZUVkaXRvclZpc2libGVDb250ZXh0LCBUZXh0Q29tcGFyZUVkaXRvckFjdGl2ZUNvbnRleHQsIEFjdGl2ZUVkaXRvckNvbnRleHQsIEFjdGl2ZUVkaXRvclJlYWRvbmx5Q29udGV4dCwgQWN0aXZlRWRpdG9yQ2FuUmV2ZXJ0Q29udGV4dCwgQWN0aXZlRWRpdG9yQ2FuVG9nZ2xlUmVhZG9ubHlDb250ZXh0LCBBY3RpdmVDb21wYXJlRWRpdG9yQ2FuU3dhcENvbnRleHQsIE11bHRpcGxlRWRpdG9yc1NlbGVjdGVkSW5Hcm91cENvbnRleHQsIFR3b0VkaXRvcnNTZWxlY3RlZEluR3JvdXBDb250ZXh0LCBTZWxlY3RlZEVkaXRvcnNJbkdyb3VwRmlsZU9yVW50aXRsZWRSZXNvdXJjZUNvbnRleHRLZXksIEFjdGl2ZUVkaXRvckNhbm5vdENsb3NlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgU2lkZUJ5U2lkZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9zaWRlQnlTaWRlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQsIFJlbGF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaW1lbnNpb24sIHRyYWNrRm9jdXMsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlLCBFdmVudEhlbHBlciwgZmluZFBhcmVudFdpdGhDbGFzcywgaXNBbmNlc3RvciwgSURvbU5vZGVQYWdlUG9zaXRpb24sIGlzTW91c2VFdmVudCwgaXNBY3RpdmVFbGVtZW50LCBnZXRXaW5kb3csIGdldEFjdGl2ZUVsZW1lbnQsICQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBQcm9ncmVzc0JhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9wcm9ncmVzc2Jhci9wcm9ncmVzc2Jhci5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlLCBUaGVtYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZWRpdG9yQmFja2dyb3VuZCwgY29udHJhc3RCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBFRElUT1JfR1JPVVBfSEVBREVSX1RBQlNfQkFDS0dST1VORCwgRURJVE9SX0dST1VQX0hFQURFUl9OT19UQUJTX0JBQ0tHUk9VTkQsIEVESVRPUl9HUk9VUF9FTVBUWV9CQUNLR1JPVU5ELCBFRElUT1JfR1JPVVBfSEVBREVSX0JPUkRFUiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJQ2xvc2VFZGl0b3JzRmlsdGVyLCBHcm91cHNPcmRlciwgSUNsb3NlRWRpdG9yT3B0aW9ucywgSUNsb3NlQWxsRWRpdG9yc09wdGlvbnMsIElFZGl0b3JSZXBsYWNlbWVudCwgSUFjdGl2ZUVkaXRvckFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZXMgfSBmcm9tICcuL2VkaXRvclBhbmVzLmpzJztcbmltcG9ydCB7IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgRWRpdG9yUHJvZ3Jlc3NJbmRpY2F0b3IgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcm9ncmVzcy9icm93c2VyL3Byb2dyZXNzSW5kaWNhdG9yLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5RGF0YSwgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIFByb21pc2VzLCBSdW5PbmNlV29ya2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlLCBHZXN0dXJlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1ZpZXcsIElFZGl0b3JHcm91cFZpZXcsIGZpbGxBY3RpdmVFZGl0b3JWaWV3U3RhdGUsIEVkaXRvclNlcnZpY2VJbXBsLCBJRWRpdG9yR3JvdXBUaXRsZUhlaWdodCwgSUludGVybmFsRWRpdG9yT3Blbk9wdGlvbnMsIElJbnRlcm5hbE1vdmVDb3B5T3B0aW9ucywgSUludGVybmFsRWRpdG9yQ2xvc2VPcHRpb25zLCBJSW50ZXJuYWxFZGl0b3JUaXRsZUNvbnRyb2xPcHRpb25zLCBJRWRpdG9yUGFydHNWaWV3LCBJRWRpdG9yR3JvdXBWaWV3T3B0aW9ucyB9IGZyb20gJy4vZWRpdG9yLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgU2VwYXJhdG9yLCBTdWJtZW51QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTWVudUNoYW5nZUV2ZW50LCBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aW9uQmFyQWN0aW9ucywgUHJpbWFyeUFuZFNlY29uZGFyeUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlRWRpdG9yVHlwZUFjdGlvbnMsIGdldEF2YWlsYWJsZUVkaXRvclR5cGVzIH0gZnJvbSAnLi9lZGl0b3JUeXBlUGlja2VyLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBnZXRNaW1lVHlwZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlc0Fzc29jaWF0aW9ucy5qcyc7XG5pbXBvcnQgeyBleHRuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGl2YXRpb24sIElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlLCBDb25maXJtUmVzdWx0LCBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsIEF1dG9TYXZlTW9kZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBpc0xpbnV4LCBpc01hY2ludG9zaCwgaXNOYXRpdmUsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0UHJvZ3Jlc3NCYXJTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSUJvdW5kYXJ5U2FzaGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Nhc2gvc2FzaC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JHcm91cFdhdGVybWFyayB9IGZyb20gJy4vZWRpdG9yR3JvdXBXYXRlcm1hcmsuanMnO1xuaW1wb3J0IHsgRWRpdG9yVGl0bGVDb250cm9sIH0gZnJvbSAnLi9lZGl0b3JUaXRsZUNvbnRyb2wuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZSB9IGZyb20gJy4vZWRpdG9yUGFuZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9kaWZmRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuXG5leHBvcnQgY2xhc3MgRWRpdG9yR3JvdXBWaWV3IGV4dGVuZHMgVGhlbWFibGUgaW1wbGVtZW50cyBJRWRpdG9yR3JvdXBWaWV3IHtcblxuXHQvLyNyZWdpb24gZmFjdG9yeVxuXG5cdHN0YXRpYyBjcmVhdGVOZXcoZWRpdG9yUGFydHNWaWV3OiBJRWRpdG9yUGFydHNWaWV3LCBncm91cHNWaWV3OiBJRWRpdG9yR3JvdXBzVmlldywgZ3JvdXBzTGFiZWw6IHN0cmluZywgZ3JvdXBJbmRleDogbnVtYmVyLCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcHRpb25zPzogSUVkaXRvckdyb3VwVmlld09wdGlvbnMpOiBJRWRpdG9yR3JvdXBWaWV3IHtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yR3JvdXBWaWV3LCBudWxsLCBlZGl0b3JQYXJ0c1ZpZXcsIGdyb3Vwc1ZpZXcsIGdyb3Vwc0xhYmVsLCBncm91cEluZGV4LCBvcHRpb25zKTtcblx0fVxuXG5cdHN0YXRpYyBjcmVhdGVGcm9tU2VyaWFsaXplZChzZXJpYWxpemVkOiBJU2VyaWFsaXplZEVkaXRvckdyb3VwTW9kZWwsIGVkaXRvclBhcnRzVmlldzogSUVkaXRvclBhcnRzVmlldywgZ3JvdXBzVmlldzogSUVkaXRvckdyb3Vwc1ZpZXcsIGdyb3Vwc0xhYmVsOiBzdHJpbmcsIGdyb3VwSW5kZXg6IG51bWJlciwgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgb3B0aW9ucz86IElFZGl0b3JHcm91cFZpZXdPcHRpb25zKTogSUVkaXRvckdyb3VwVmlldyB7XG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvckdyb3VwVmlldywgc2VyaWFsaXplZCwgZWRpdG9yUGFydHNWaWV3LCBncm91cHNWaWV3LCBncm91cHNMYWJlbCwgZ3JvdXBJbmRleCwgb3B0aW9ucyk7XG5cdH1cblxuXHRzdGF0aWMgY3JlYXRlQ29weShjb3B5RnJvbTogSUVkaXRvckdyb3VwVmlldywgZWRpdG9yUGFydHNWaWV3OiBJRWRpdG9yUGFydHNWaWV3LCBncm91cHNWaWV3OiBJRWRpdG9yR3JvdXBzVmlldywgZ3JvdXBzTGFiZWw6IHN0cmluZywgZ3JvdXBJbmRleDogbnVtYmVyLCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcHRpb25zPzogSUVkaXRvckdyb3VwVmlld09wdGlvbnMpOiBJRWRpdG9yR3JvdXBWaWV3IHtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yR3JvdXBWaWV3LCBjb3B5RnJvbSwgZWRpdG9yUGFydHNWaWV3LCBncm91cHNWaWV3LCBncm91cHNMYWJlbCwgZ3JvdXBJbmRleCwgb3B0aW9ucyk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvKipcblx0ICogQWNjZXNzIHRvIHRoZSBjb250ZXh0IGtleSBzZXJ2aWNlIHNjb3BlZCB0byB0aGlzIGVkaXRvciBncm91cC5cblx0ICovXG5cdHJlYWRvbmx5IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cblx0Ly8jcmVnaW9uIGV2ZW50c1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRm9jdXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRGb2N1cyA9IHRoaXMuX29uRGlkRm9jdXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsRGlzcG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbldpbGxEaXNwb3NlID0gdGhpcy5fb25XaWxsRGlzcG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE1vZGVsQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUdyb3VwTW9kZWxDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTW9kZWxDaGFuZ2UgPSB0aGlzLl9vbkRpZE1vZGVsQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUFjdGl2ZUVkaXRvckNoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UgPSB0aGlzLl9vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE9wZW5FZGl0b3JGYWlsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RWRpdG9ySW5wdXQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZE9wZW5FZGl0b3JGYWlsID0gdGhpcy5fb25EaWRPcGVuRWRpdG9yRmFpbC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxDbG9zZUVkaXRvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JDbG9zZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25XaWxsQ2xvc2VFZGl0b3IgPSB0aGlzLl9vbldpbGxDbG9zZUVkaXRvci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsb3NlRWRpdG9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvckNsb3NlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsb3NlRWRpdG9yID0gdGhpcy5fb25EaWRDbG9zZUVkaXRvci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxNb3ZlRWRpdG9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvcldpbGxNb3ZlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbldpbGxNb3ZlRWRpdG9yID0gdGhpcy5fb25XaWxsTW92ZUVkaXRvci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxPcGVuRWRpdG9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvcldpbGxPcGVuRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbldpbGxPcGVuRWRpdG9yID0gdGhpcy5fb25XaWxsT3BlbkVkaXRvci5ldmVudDtcblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsOiBFZGl0b3JHcm91cE1vZGVsO1xuXG5cdHByaXZhdGUgYWN0aXZlOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGxhc3RMYXlvdXQ6IElEb21Ob2RlUGFnZVBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlc291cmNlQ29udGV4dDogUmVzb3VyY2VDb250ZXh0S2V5O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdGl0bGVDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IHRpdGxlQ29udHJvbDogRWRpdG9yVGl0bGVDb250cm9sO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NCYXI6IFByb2dyZXNzQmFyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JQYW5lOiBFZGl0b3JQYW5lcztcblxuXHQvKipcblx0ICogT3B0aW9uYWwgaW5zZXQgKGluIHB4KSByZXNlcnZlZCBvbiB0aGUgcmlnaHQgb2YgdGhlIGVkaXRvciBwYW5lIHdoaWxlIHRoZVxuXHQgKiB0aXRsZSBjb250cm9sIGtlZXBzIHRoZSBmdWxsIGdyb3VwIHdpZHRoLiBVc2VkIGJ5IHRoZSBBZ2VudHMgd2luZG93IHRvIGRvY2tcblx0ICogdGhlIGRldGFpbCBwYW5lbCBiZXNpZGUgdGhlIGVkaXRvciBjb250ZW50IHVuZGVyIG9uZSBmdWxsLXdpZHRoIHRhYiBiYXIuXG5cdCAqIGAwYCAoZGVmYXVsdCkgaXMgYSBuby1vcCBmb3IgYWxsIG90aGVyIGxheW91dHMuXG5cdCAqL1xuXHRwcml2YXRlIF9jb250ZW50UmlnaHRJbnNldCA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWxheW91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlbGF5b3V0ID0gdGhpcy5fb25EaWRSZWxheW91dC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2VkRWRpdG9yc1dvcmtlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlV29ya2VyPEVkaXRvcklucHV0PihlZGl0b3JzID0+IHRoaXMuaGFuZGxlRGlzcG9zZWRFZGl0b3JzKGVkaXRvcnMpLCAwKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtYXBFZGl0b3JUb1BlbmRpbmdDb25maXJtYXRpb24gPSBuZXcgTWFwPEVkaXRvcklucHV0LCBQcm9taXNlPGJvb2xlYW4+PigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyVG9vbEJhck1lbnVEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgd2hlblJlc3RvcmVkUHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0cmVhZG9ubHkgd2hlblJlc3RvcmVkID0gdGhpcy53aGVuUmVzdG9yZWRQcm9taXNlLnA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZnJvbTogSUVkaXRvckdyb3VwVmlldyB8IElTZXJpYWxpemVkRWRpdG9yR3JvdXBNb2RlbCB8IG51bGwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JQYXJ0c1ZpZXc6IElFZGl0b3JQYXJ0c1ZpZXcsXG5cdFx0cmVhZG9ubHkgZ3JvdXBzVmlldzogSUVkaXRvckdyb3Vwc1ZpZXcsXG5cdFx0cHJpdmF0ZSBncm91cHNMYWJlbDogc3RyaW5nLFxuXHRcdHByaXZhdGUgX2luZGV4OiBudW1iZXIsXG5cdFx0b3B0aW9uczogSUVkaXRvckdyb3VwVmlld09wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IEVkaXRvclNlcnZpY2VJbXBsLFxuXHRcdEBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2U6IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlOiBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHRoZW1lU2VydmljZSk7XG5cblx0XHRpZiAoZnJvbSBpbnN0YW5jZW9mIEVkaXRvckdyb3VwVmlldykge1xuXHRcdFx0dGhpcy5tb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKGZyb20ubW9kZWwuY2xvbmUoKSk7XG5cdFx0fSBlbHNlIGlmIChpc1NlcmlhbGl6ZWRFZGl0b3JHcm91cE1vZGVsKGZyb20pKSB7XG5cdFx0XHR0aGlzLm1vZGVsID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yR3JvdXBNb2RlbCwgZnJvbSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm1vZGVsID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yR3JvdXBNb2RlbCwgdW5kZWZpbmVkKSk7XG5cdFx0fVxuXG5cdFx0Ly8jcmVnaW9uIGNyZWF0ZSgpXG5cdFx0e1xuXHRcdFx0Ly8gU2NvcGVkIGNvbnRleHQga2V5IHNlcnZpY2Vcblx0XHRcdHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh0aGlzLmVsZW1lbnQpKTtcblxuXHRcdFx0Ly8gQ29udGFpbmVyXG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCguLi5jb2FsZXNjZShbJ2VkaXRvci1ncm91cC1jb250YWluZXInLCB0aGlzLm1vZGVsLmlzTG9ja2VkID8gJ2xvY2tlZCcgOiB1bmRlZmluZWRdKSk7XG5cblx0XHRcdC8vIENvbnRhaW5lciBsaXN0ZW5lcnNcblx0XHRcdHRoaXMucmVnaXN0ZXJDb250YWluZXJMaXN0ZW5lcnMoKTtcblxuXHRcdFx0Ly8gQ29udGFpbmVyIHRvb2xiYXJcblx0XHRcdHRoaXMuY3JlYXRlQ29udGFpbmVyVG9vbGJhcigpO1xuXG5cdFx0XHQvLyBDb250YWluZXIgY29udGV4dCBtZW51XG5cdFx0XHR0aGlzLmNyZWF0ZUNvbnRhaW5lckNvbnRleHRNZW51KCk7XG5cblx0XHRcdC8vIFdhdGVybWFyayAmIHNob3J0Y3V0c1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JHcm91cFdhdGVybWFyaywgdGhpcy5lbGVtZW50KSk7XG5cblx0XHRcdC8vIFByb2dyZXNzIGJhclxuXHRcdFx0dGhpcy5wcm9ncmVzc0JhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBQcm9ncmVzc0Jhcih0aGlzLmVsZW1lbnQsIGRlZmF1bHRQcm9ncmVzc0JhclN0eWxlcykpO1xuXHRcdFx0dGhpcy5wcm9ncmVzc0Jhci5oaWRlKCk7XG5cblx0XHRcdC8vIFNjb3BlZCBpbnN0YW50aWF0aW9uIHNlcnZpY2Vcblx0XHRcdHRoaXMuc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFx0W0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZV0sXG5cdFx0XHRcdFtJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLCB0aGlzLl9yZWdpc3RlcihuZXcgRWRpdG9yUHJvZ3Jlc3NJbmRpY2F0b3IodGhpcy5wcm9ncmVzc0JhciwgdGhpcykpXVxuXHRcdFx0KSkpO1xuXG5cdFx0XHQvLyBDb250ZXh0IGtleXNcblx0XHRcdHRoaXMucmVzb3VyY2VDb250ZXh0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUNvbnRleHRLZXkpKTtcblx0XHRcdHRoaXMuaGFuZGxlR3JvdXBDb250ZXh0S2V5cygpO1xuXG5cdFx0XHQvLyBUaXRsZSBjb250YWluZXJcblx0XHRcdHRoaXMudGl0bGVDb250YWluZXIgPSAkKCcudGl0bGUnKTtcblx0XHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLnRpdGxlQ29udGFpbmVyKTtcblxuXHRcdFx0Ly8gVGl0bGUgY29udHJvbFxuXHRcdFx0dGhpcy50aXRsZUNvbnRyb2wgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvclRpdGxlQ29udHJvbCwgdGhpcy50aXRsZUNvbnRhaW5lciwgdGhpcy5lZGl0b3JQYXJ0c1ZpZXcsIHRoaXMuZ3JvdXBzVmlldywgdGhpcywgdGhpcy5tb2RlbCwgb3B0aW9ucz8ubWVudUlkcywgb3B0aW9ucz8uc2hvd0hlYWRlciA9PT0gdHJ1ZSkpO1xuXG5cdFx0XHQvLyBFZGl0b3IgY29udGFpbmVyXG5cdFx0XHR0aGlzLmVkaXRvckNvbnRhaW5lciA9ICQoJy5lZGl0b3ItY29udGFpbmVyJyk7XG5cdFx0XHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5lZGl0b3JDb250YWluZXIpO1xuXG5cdFx0XHQvLyBFZGl0b3IgcGFuZVxuXHRcdFx0dGhpcy5lZGl0b3JQYW5lID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JQYW5lcywgdGhpcy5lbGVtZW50LCB0aGlzLmVkaXRvckNvbnRhaW5lciwgdGhpcykpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuaW5wdXQgPSB0aGlzLmVkaXRvclBhbmUub25EaWRDaGFuZ2VTaXplQ29uc3RyYWludHM7XG5cblx0XHRcdC8vIFRyYWNrIEZvY3VzXG5cdFx0XHR0aGlzLmRvVHJhY2tGb2N1cygpO1xuXG5cdFx0XHQvLyBVcGRhdGUgY29udGFpbmVyc1xuXHRcdFx0dGhpcy51cGRhdGVUaXRsZUNvbnRhaW5lcigpO1xuXHRcdFx0dGhpcy51cGRhdGVDb250YWluZXIoKTtcblxuXHRcdFx0Ly8gVXBkYXRlIHN0eWxlc1xuXHRcdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0XHR9XG5cdFx0Ly8jZW5kcmVnaW9uXG5cblx0XHQvLyBSZXN0b3JlIGVkaXRvcnMgaWYgcHJvdmlkZWRcblx0XHRjb25zdCByZXN0b3JlRWRpdG9yc1Byb21pc2UgPSB0aGlzLnJlc3RvcmVFZGl0b3JzKGZyb20sIG9wdGlvbnMpID8/IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0Ly8gU2lnbmFsIHJlc3RvcmVkIG9uY2UgZWRpdG9ycyBoYXZlIHJlc3RvcmVkXG5cdFx0cmVzdG9yZUVkaXRvcnNQcm9taXNlLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0dGhpcy53aGVuUmVzdG9yZWRQcm9taXNlLmNvbXBsZXRlKCk7XG5cdFx0fSk7XG5cblx0XHQvLyBSZWdpc3RlciBMaXN0ZW5lcnNcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUdyb3VwQ29udGV4dEtleXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgZ3JvdXBBY3RpdmVFZGl0b3JEaXJ0eUNvbnRleHQgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5iaW5kKEFjdGl2ZUVkaXRvckRpcnR5Q29udGV4dCwgdGhpcyk7XG5cdFx0Y29uc3QgZ3JvdXBBY3RpdmVFZGl0b3JQaW5uZWRDb250ZXh0ID0gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcuYmluZChBY3RpdmVFZGl0b3JQaW5uZWRDb250ZXh0LCB0aGlzKTtcblx0XHRjb25zdCBncm91cEFjdGl2ZUVkaXRvckZpcnN0Q29udGV4dCA9IHRoaXMuZWRpdG9yUGFydHNWaWV3LmJpbmQoQWN0aXZlRWRpdG9yRmlyc3RJbkdyb3VwQ29udGV4dCwgdGhpcyk7XG5cdFx0Y29uc3QgZ3JvdXBBY3RpdmVFZGl0b3JMYXN0Q29udGV4dCA9IHRoaXMuZWRpdG9yUGFydHNWaWV3LmJpbmQoQWN0aXZlRWRpdG9yTGFzdEluR3JvdXBDb250ZXh0LCB0aGlzKTtcblx0XHRjb25zdCBncm91cEFjdGl2ZUVkaXRvclN0aWNreUNvbnRleHQgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5iaW5kKEFjdGl2ZUVkaXRvclN0aWNreUNvbnRleHQsIHRoaXMpO1xuXHRcdGNvbnN0IGdyb3VwRWRpdG9yc0NvdW50Q29udGV4dCA9IHRoaXMuZWRpdG9yUGFydHNWaWV3LmJpbmQoRWRpdG9yR3JvdXBFZGl0b3JzQ291bnRDb250ZXh0LCB0aGlzKTtcblx0XHRjb25zdCBncm91cExvY2tlZENvbnRleHQgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5iaW5kKEFjdGl2ZUVkaXRvckdyb3VwTG9ja2VkQ29udGV4dCwgdGhpcyk7XG5cblx0XHRjb25zdCBtdWx0aXBsZUVkaXRvcnNTZWxlY3RlZENvbnRleHQgPSBNdWx0aXBsZUVkaXRvcnNTZWxlY3RlZEluR3JvdXBDb250ZXh0LmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCB0d29FZGl0b3JzU2VsZWN0ZWRDb250ZXh0ID0gVHdvRWRpdG9yc1NlbGVjdGVkSW5Hcm91cENvbnRleHQuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlbGVjdGVkRWRpdG9yc0hhdmVGaWxlT3JVbnRpdGxlZFJlc291cmNlQ29udGV4dCA9IFNlbGVjdGVkRWRpdG9yc0luR3JvdXBGaWxlT3JVbnRpdGxlZFJlc291cmNlQ29udGV4dEtleS5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBncm91cEFjdGl2ZUVkaXRvckNvbnRleHQgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5iaW5kKEFjdGl2ZUVkaXRvckNvbnRleHQsIHRoaXMpO1xuXHRcdGNvbnN0IGdyb3VwQWN0aXZlRWRpdG9ySXNSZWFkb25seSA9IHRoaXMuZWRpdG9yUGFydHNWaWV3LmJpbmQoQWN0aXZlRWRpdG9yUmVhZG9ubHlDb250ZXh0LCB0aGlzKTtcblx0XHRjb25zdCBncm91cEFjdGl2ZUVkaXRvckNhblJldmVydCA9IHRoaXMuZWRpdG9yUGFydHNWaWV3LmJpbmQoQWN0aXZlRWRpdG9yQ2FuUmV2ZXJ0Q29udGV4dCwgdGhpcyk7XG5cdFx0Y29uc3QgZ3JvdXBBY3RpdmVFZGl0b3JDYW5Ub2dnbGVSZWFkb25seSA9IHRoaXMuZWRpdG9yUGFydHNWaWV3LmJpbmQoQWN0aXZlRWRpdG9yQ2FuVG9nZ2xlUmVhZG9ubHlDb250ZXh0LCB0aGlzKTtcblx0XHRjb25zdCBncm91cEFjdGl2ZUNvbXBhcmVFZGl0b3JDYW5Td2FwID0gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcuYmluZChBY3RpdmVDb21wYXJlRWRpdG9yQ2FuU3dhcENvbnRleHQsIHRoaXMpO1xuXHRcdGNvbnN0IGdyb3VwVGV4dENvbXBhcmVFZGl0b3JWaXNpYmxlQ29udGV4dCA9IHRoaXMuZWRpdG9yUGFydHNWaWV3LmJpbmQoVGV4dENvbXBhcmVFZGl0b3JWaXNpYmxlQ29udGV4dCwgdGhpcyk7XG5cdFx0Y29uc3QgZ3JvdXBUZXh0Q29tcGFyZUVkaXRvckFjdGl2ZUNvbnRleHQgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5iaW5kKFRleHRDb21wYXJlRWRpdG9yQWN0aXZlQ29udGV4dCwgdGhpcyk7XG5cblx0XHRjb25zdCBncm91cEFjdGl2ZUVkaXRvckF2YWlsYWJsZUVkaXRvcklkcyA9IHRoaXMuZWRpdG9yUGFydHNWaWV3LmJpbmQoQWN0aXZlRWRpdG9yQXZhaWxhYmxlRWRpdG9ySWRzQ29udGV4dCwgdGhpcyk7XG5cdFx0Y29uc3QgZ3JvdXBBY3RpdmVFZGl0b3JDYW5TcGxpdEluR3JvdXBDb250ZXh0ID0gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcuYmluZChBY3RpdmVFZGl0b3JDYW5TcGxpdEluR3JvdXBDb250ZXh0LCB0aGlzKTtcblx0XHRjb25zdCBncm91cEFjdGl2ZUVkaXRvckNhbm5vdENsb3NlQ29udGV4dCA9IHRoaXMuZWRpdG9yUGFydHNWaWV3LmJpbmQoQWN0aXZlRWRpdG9yQ2Fubm90Q2xvc2VDb250ZXh0LCB0aGlzKTtcblx0XHRjb25zdCBncm91cEFjdGl2ZUVkaXRvcklzU2lkZUJ5U2lkZUVkaXRvckNvbnRleHQgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5iaW5kKFNpZGVCeVNpZGVFZGl0b3JBY3RpdmVDb250ZXh0LCB0aGlzKTtcblxuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvckxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdFx0Y29uc3Qgb2JzZXJ2ZUFjdGl2ZUVkaXRvciA9ICgpID0+IHtcblx0XHRcdGFjdGl2ZUVkaXRvckxpc3RlbmVyLmNsZWFyKCk7XG5cblx0XHRcdHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuYnVmZmVyQ2hhbmdlRXZlbnRzKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gdGhpcy5hY3RpdmVFZGl0b3I7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSB0aGlzLmFjdGl2ZUVkaXRvclBhbmU7XG5cblx0XHRcdFx0dGhpcy5yZXNvdXJjZUNvbnRleHQuc2V0KEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoYWN0aXZlRWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSkpO1xuXG5cdFx0XHRcdGFwcGx5QXZhaWxhYmxlRWRpdG9ySWRzKGdyb3VwQWN0aXZlRWRpdG9yQXZhaWxhYmxlRWRpdG9ySWRzLCBhY3RpdmVFZGl0b3IsIHRoaXMuZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKTtcblxuXHRcdFx0XHRpZiAoYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdFx0Z3JvdXBBY3RpdmVFZGl0b3JDYW5TcGxpdEluR3JvdXBDb250ZXh0LnNldChhY3RpdmVFZGl0b3IuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5DYW5TcGxpdEluR3JvdXApKTtcblx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvckNhbm5vdENsb3NlQ29udGV4dC5zZXQoYWN0aXZlRWRpdG9yLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuQ2Fubm90Q2xvc2UpKTtcblx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvcklzU2lkZUJ5U2lkZUVkaXRvckNvbnRleHQuc2V0KGFjdGl2ZUVkaXRvci50eXBlSWQgPT09IFNpZGVCeVNpZGVFZGl0b3JJbnB1dC5JRCk7XG5cblx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvckRpcnR5Q29udGV4dC5zZXQoYWN0aXZlRWRpdG9yLmlzRGlydHkoKSAmJiAhYWN0aXZlRWRpdG9yLmlzU2F2aW5nKCkpO1xuXHRcdFx0XHRcdGFjdGl2ZUVkaXRvckxpc3RlbmVyLnZhbHVlID0gYWN0aXZlRWRpdG9yLm9uRGlkQ2hhbmdlRGlydHkoKCkgPT4ge1xuXHRcdFx0XHRcdFx0Z3JvdXBBY3RpdmVFZGl0b3JEaXJ0eUNvbnRleHQuc2V0KGFjdGl2ZUVkaXRvci5pc0RpcnR5KCkgJiYgIWFjdGl2ZUVkaXRvci5pc1NhdmluZygpKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvckNhblNwbGl0SW5Hcm91cENvbnRleHQuc2V0KGZhbHNlKTtcblx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvckNhbm5vdENsb3NlQ29udGV4dC5zZXQoZmFsc2UpO1xuXHRcdFx0XHRcdGdyb3VwQWN0aXZlRWRpdG9ySXNTaWRlQnlTaWRlRWRpdG9yQ29udGV4dC5zZXQoZmFsc2UpO1xuXHRcdFx0XHRcdGdyb3VwQWN0aXZlRWRpdG9yRGlydHlDb250ZXh0LnNldChmYWxzZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoYWN0aXZlRWRpdG9yUGFuZSkge1xuXHRcdFx0XHRcdGdyb3VwQWN0aXZlRWRpdG9yQ29udGV4dC5zZXQoYWN0aXZlRWRpdG9yUGFuZS5nZXRJZCgpKTtcblx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvckNhblJldmVydC5zZXQoIWFjdGl2ZUVkaXRvclBhbmUuaW5wdXQuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5VbnRpdGxlZCkpO1xuXHRcdFx0XHRcdGdyb3VwQWN0aXZlRWRpdG9ySXNSZWFkb25seS5zZXQoISFhY3RpdmVFZGl0b3JQYW5lLmlucHV0LmlzUmVhZG9ubHkoKSk7XG5cblx0XHRcdFx0XHRjb25zdCBwcmltYXJ5RWRpdG9yUmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGFjdGl2ZUVkaXRvclBhbmUuaW5wdXQsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblx0XHRcdFx0XHRjb25zdCBzZWNvbmRhcnlFZGl0b3JSZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoYWN0aXZlRWRpdG9yUGFuZS5pbnB1dCwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5TRUNPTkRBUlkgfSk7XG5cdFx0XHRcdFx0Z3JvdXBBY3RpdmVDb21wYXJlRWRpdG9yQ2FuU3dhcC5zZXQoYWN0aXZlRWRpdG9yUGFuZS5pbnB1dCBpbnN0YW5jZW9mIERpZmZFZGl0b3JJbnB1dCAmJiAhYWN0aXZlRWRpdG9yUGFuZS5pbnB1dC5vcmlnaW5hbC5pc1JlYWRvbmx5KCkgJiYgISFwcmltYXJ5RWRpdG9yUmVzb3VyY2UgJiYgKHRoaXMuZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIocHJpbWFyeUVkaXRvclJlc291cmNlKSB8fCBwcmltYXJ5RWRpdG9yUmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKSAmJiAhIXNlY29uZGFyeUVkaXRvclJlc291cmNlICYmICh0aGlzLmZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKHNlY29uZGFyeUVkaXRvclJlc291cmNlKSB8fCBzZWNvbmRhcnlFZGl0b3JSZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpKTtcblx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvckNhblRvZ2dsZVJlYWRvbmx5LnNldCghIXByaW1hcnlFZGl0b3JSZXNvdXJjZSAmJiB0aGlzLmZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKHByaW1hcnlFZGl0b3JSZXNvdXJjZSkgJiYgIXRoaXMuZmlsZVNlcnZpY2UuaGFzQ2FwYWJpbGl0eShwcmltYXJ5RWRpdG9yUmVzb3VyY2UsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5SZWFkb25seSkpO1xuXG5cdFx0XHRcdFx0Y29uc3QgYWN0aXZlUGFuZURpZmZFZGl0b3IgPSBhY3RpdmVFZGl0b3JQYW5lPy5nZXRJZCgpID09PSBURVhUX0RJRkZfRURJVE9SX0lEO1xuXHRcdFx0XHRcdGdyb3VwVGV4dENvbXBhcmVFZGl0b3JBY3RpdmVDb250ZXh0LnNldChhY3RpdmVQYW5lRGlmZkVkaXRvcik7XG5cdFx0XHRcdFx0Z3JvdXBUZXh0Q29tcGFyZUVkaXRvclZpc2libGVDb250ZXh0LnNldChhY3RpdmVQYW5lRGlmZkVkaXRvcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Z3JvdXBBY3RpdmVFZGl0b3JDb250ZXh0LnJlc2V0KCk7XG5cdFx0XHRcdFx0Z3JvdXBBY3RpdmVFZGl0b3JDYW5SZXZlcnQucmVzZXQoKTtcblx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvcklzUmVhZG9ubHkucmVzZXQoKTtcblx0XHRcdFx0XHRncm91cEFjdGl2ZUNvbXBhcmVFZGl0b3JDYW5Td2FwLnJlc2V0KCk7XG5cdFx0XHRcdFx0Z3JvdXBBY3RpdmVFZGl0b3JDYW5Ub2dnbGVSZWFkb25seS5yZXNldCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9O1xuXG5cdFx0Ly8gVXBkYXRlIGdyb3VwIGNvbnRleHRzIGJhc2VkIG9uIGdyb3VwIGNoYW5nZXNcblx0XHRjb25zdCB1cGRhdGVHcm91cENvbnRleHRLZXlzID0gKGU6IElHcm91cE1vZGVsQ2hhbmdlRXZlbnQpID0+IHtcblx0XHRcdHN3aXRjaCAoZS5raW5kKSB7XG5cdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfTE9DS0VEOlxuXHRcdFx0XHRcdGdyb3VwTG9ja2VkQ29udGV4dC5zZXQodGhpcy5pc0xvY2tlZCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0FDVElWRTpcblx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvckZpcnN0Q29udGV4dC5zZXQodGhpcy5tb2RlbC5pc0ZpcnN0KHRoaXMubW9kZWwuYWN0aXZlRWRpdG9yKSk7XG5cdFx0XHRcdFx0Z3JvdXBBY3RpdmVFZGl0b3JMYXN0Q29udGV4dC5zZXQodGhpcy5tb2RlbC5pc0xhc3QodGhpcy5tb2RlbC5hY3RpdmVFZGl0b3IpKTtcblx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvclBpbm5lZENvbnRleHQuc2V0KHRoaXMubW9kZWwuYWN0aXZlRWRpdG9yID8gdGhpcy5tb2RlbC5pc1Bpbm5lZCh0aGlzLm1vZGVsLmFjdGl2ZUVkaXRvcikgOiBmYWxzZSk7XG5cdFx0XHRcdFx0Z3JvdXBBY3RpdmVFZGl0b3JTdGlja3lDb250ZXh0LnNldCh0aGlzLm1vZGVsLmFjdGl2ZUVkaXRvciA/IHRoaXMubW9kZWwuaXNTdGlja3kodGhpcy5tb2RlbC5hY3RpdmVFZGl0b3IpIDogZmFsc2UpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9DTE9TRTpcblx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvclBpbm5lZENvbnRleHQuc2V0KHRoaXMubW9kZWwuYWN0aXZlRWRpdG9yID8gdGhpcy5tb2RlbC5pc1Bpbm5lZCh0aGlzLm1vZGVsLmFjdGl2ZUVkaXRvcikgOiBmYWxzZSk7XG5cdFx0XHRcdFx0Z3JvdXBBY3RpdmVFZGl0b3JTdGlja3lDb250ZXh0LnNldCh0aGlzLm1vZGVsLmFjdGl2ZUVkaXRvciA/IHRoaXMubW9kZWwuaXNTdGlja3kodGhpcy5tb2RlbC5hY3RpdmVFZGl0b3IpIDogZmFsc2UpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9PUEVOOlxuXHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9NT1ZFOlxuXHRcdFx0XHRcdGdyb3VwQWN0aXZlRWRpdG9yRmlyc3RDb250ZXh0LnNldCh0aGlzLm1vZGVsLmlzRmlyc3QodGhpcy5tb2RlbC5hY3RpdmVFZGl0b3IpKTtcblx0XHRcdFx0XHRncm91cEFjdGl2ZUVkaXRvckxhc3RDb250ZXh0LnNldCh0aGlzLm1vZGVsLmlzTGFzdCh0aGlzLm1vZGVsLmFjdGl2ZUVkaXRvcikpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9QSU46XG5cdFx0XHRcdFx0aWYgKGUuZWRpdG9yICYmIGUuZWRpdG9yID09PSB0aGlzLm1vZGVsLmFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRcdFx0Z3JvdXBBY3RpdmVFZGl0b3JQaW5uZWRDb250ZXh0LnNldCh0aGlzLm1vZGVsLmlzUGlubmVkKHRoaXMubW9kZWwuYWN0aXZlRWRpdG9yKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9TVElDS1k6XG5cdFx0XHRcdFx0aWYgKGUuZWRpdG9yICYmIGUuZWRpdG9yID09PSB0aGlzLm1vZGVsLmFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRcdFx0Z3JvdXBBY3RpdmVFZGl0b3JTdGlja3lDb250ZXh0LnNldCh0aGlzLm1vZGVsLmlzU3RpY2t5KHRoaXMubW9kZWwuYWN0aXZlRWRpdG9yKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9DQVBBQklMSVRJRVM6XG5cdFx0XHRcdFx0aWYgKGUuZWRpdG9yICYmIGUuZWRpdG9yID09PSB0aGlzLm1vZGVsLmFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRcdFx0b2JzZXJ2ZUFjdGl2ZUVkaXRvcigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JTX1NFTEVDVElPTjpcblx0XHRcdFx0XHRtdWx0aXBsZUVkaXRvcnNTZWxlY3RlZENvbnRleHQuc2V0KHRoaXMubW9kZWwuc2VsZWN0ZWRFZGl0b3JzLmxlbmd0aCA+IDEpO1xuXHRcdFx0XHRcdHR3b0VkaXRvcnNTZWxlY3RlZENvbnRleHQuc2V0KHRoaXMubW9kZWwuc2VsZWN0ZWRFZGl0b3JzLmxlbmd0aCA9PT0gMik7XG5cdFx0XHRcdFx0c2VsZWN0ZWRFZGl0b3JzSGF2ZUZpbGVPclVudGl0bGVkUmVzb3VyY2VDb250ZXh0LnNldCh0aGlzLm1vZGVsLnNlbGVjdGVkRWRpdG9ycy5ldmVyeShlID0+IGUucmVzb3VyY2UgJiYgKHRoaXMuZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIoZS5yZXNvdXJjZSkgfHwgZS5yZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEdyb3VwIGVkaXRvcnMgY291bnQgY29udGV4dFxuXHRcdFx0Z3JvdXBFZGl0b3JzQ291bnRDb250ZXh0LnNldCh0aGlzLmNvdW50KTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZE1vZGVsQ2hhbmdlKGUgPT4gdXBkYXRlR3JvdXBDb250ZXh0S2V5cyhlKSkpO1xuXG5cdFx0Ly8gVHJhY2sgdGhlIGFjdGl2ZSBlZGl0b3IgYW5kIHVwZGF0ZSBjb250ZXh0IGtleSB0aGF0IHJlZmxlY3RzXG5cdFx0Ly8gdGhlIGRpcnR5IHN0YXRlIG9mIHRoaXMgZWRpdG9yXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiBvYnNlcnZlQWN0aXZlRWRpdG9yKCkpKTtcblxuXHRcdC8vIFVwZGF0ZSBjb250ZXh0IGtleXMgb24gc3RhcnR1cFxuXHRcdG9ic2VydmVBY3RpdmVFZGl0b3IoKTtcblx0XHR1cGRhdGVHcm91cENvbnRleHRLZXlzKHsga2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0FDVElWRSB9KTtcblx0XHR1cGRhdGVHcm91cENvbnRleHRLZXlzKHsga2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfTE9DS0VEIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNvbnRhaW5lckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIE9wZW4gbmV3IGZpbGUgdmlhIGRvdWJsZWNsaWNrIG9uIGVtcHR5IGNvbnRhaW5lclxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsZW1lbnQsIEV2ZW50VHlwZS5EQkxDTElDSywgZSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc0VtcHR5KSB7XG5cdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSk7XG5cblx0XHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdHJlc291cmNlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0cGlubmVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0b3ZlcnJpZGU6IERFRkFVTFRfRURJVE9SX0FTU09DSUFUSU9OLmlkXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCB0aGlzLmlkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBDbG9zZSBlbXB0eSBlZGl0b3IgZ3JvdXAgdmlhIG1pZGRsZSBtb3VzZSBjbGlja1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsZW1lbnQsIEV2ZW50VHlwZS5BVVhDTElDSywgZSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc0VtcHR5ICYmIGUuYnV0dG9uID09PSAxIC8qIE1pZGRsZSBCdXR0b24gKi8pIHtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblxuXHRcdFx0XHR0aGlzLmdyb3Vwc1ZpZXcucmVtb3ZlR3JvdXAodGhpcyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDb250YWluZXJUb29sYmFyKCk6IHZvaWQge1xuXG5cdFx0Ly8gVG9vbGJhciBDb250YWluZXJcblx0XHRjb25zdCB0b29sYmFyQ29udGFpbmVyID0gJCgnLmVkaXRvci1ncm91cC1jb250YWluZXItdG9vbGJhcicpO1xuXHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCh0b29sYmFyQ29udGFpbmVyKTtcblxuXHRcdC8vIFRvb2xiYXJcblx0XHRjb25zdCBjb250YWluZXJUb29sYmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbkJhcih0b29sYmFyQ29udGFpbmVyLCB7XG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdhcmlhTGFiZWxHcm91cEFjdGlvbnMnLCBcIkVtcHR5IGVkaXRvciBncm91cCBhY3Rpb25zXCIpLFxuXHRcdFx0aGlnaGxpZ2h0VG9nZ2xlZEl0ZW1zOiB0cnVlXG5cdFx0fSkpO1xuXG5cdFx0Ly8gVG9vbGJhciBhY3Rpb25zXG5cdFx0Y29uc3QgY29udGFpbmVyVG9vbGJhck1lbnUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLkVtcHR5RWRpdG9yR3JvdXAsIHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpKTtcblx0XHRjb25zdCB1cGRhdGVDb250YWluZXJUb29sYmFyID0gKCkgPT4ge1xuXG5cdFx0XHQvLyBDbGVhciBvbGQgYWN0aW9uc1xuXHRcdFx0dGhpcy5jb250YWluZXJUb29sQmFyTWVudURpc3Bvc2FibGUudmFsdWUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4gY29udGFpbmVyVG9vbGJhci5jbGVhcigpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIG5ldyBhY3Rpb25zXG5cdFx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uQmFyQWN0aW9ucyhcblx0XHRcdFx0Y29udGFpbmVyVG9vbGJhck1lbnUuZ2V0QWN0aW9ucyh7IGFyZzogeyBncm91cElkOiB0aGlzLmlkIH0sIHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pLFxuXHRcdFx0XHQnbmF2aWdhdGlvbidcblx0XHRcdCk7XG5cblx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIFsuLi5hY3Rpb25zLnByaW1hcnksIC4uLmFjdGlvbnMuc2Vjb25kYXJ5XSkge1xuXHRcdFx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCk7XG5cdFx0XHRcdGNvbnRhaW5lclRvb2xiYXIucHVzaChhY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlLCBrZXliaW5kaW5nOiBrZXliaW5kaW5nPy5nZXRMYWJlbCgpIH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dXBkYXRlQ29udGFpbmVyVG9vbGJhcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbnRhaW5lclRvb2xiYXJNZW51Lm9uRGlkQ2hhbmdlKHVwZGF0ZUNvbnRhaW5lclRvb2xiYXIpKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQ29udGFpbmVyQ29udGV4dE1lbnUoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgZSA9PiB0aGlzLm9uU2hvd0NvbnRhaW5lckNvbnRleHRNZW51KGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgVG91Y2hFdmVudFR5cGUuQ29udGV4dG1lbnUsICgpID0+IHRoaXMub25TaG93Q29udGFpbmVyQ29udGV4dE1lbnUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblNob3dDb250YWluZXJDb250ZXh0TWVudShlPzogTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc0VtcHR5KSB7XG5cdFx0XHRyZXR1cm47IC8vIG9ubHkgZm9yIGVtcHR5IGVkaXRvciBncm91cHNcblx0XHR9XG5cblx0XHQvLyBGaW5kIHRhcmdldCBhbmNob3Jcblx0XHRsZXQgYW5jaG9yOiBIVE1MRWxlbWVudCB8IFN0YW5kYXJkTW91c2VFdmVudCA9IHRoaXMuZWxlbWVudDtcblx0XHRpZiAoZSkge1xuXHRcdFx0YW5jaG9yID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudChnZXRXaW5kb3codGhpcy5lbGVtZW50KSwgZSk7XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyBpdFxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRtZW51SWQ6IE1lbnVJZC5FbXB0eUVkaXRvckdyb3VwQ29udGV4dCxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBhbmNob3IsXG5cdFx0XHRvbkhpZGU6ICgpID0+IHRoaXMuZm9jdXMoKVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1RyYWNrRm9jdXMoKTogdm9pZCB7XG5cblx0XHQvLyBDb250YWluZXJcblx0XHRjb25zdCBjb250YWluZXJGb2N1c1RyYWNrZXIgPSB0aGlzLl9yZWdpc3Rlcih0cmFja0ZvY3VzKHRoaXMuZWxlbWVudCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbnRhaW5lckZvY3VzVHJhY2tlci5vbkRpZEZvY3VzKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzRW1wdHkpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRGb2N1cy5maXJlKCk7IC8vIG9ubHkgd2hlbiBlbXB0eSB0byBwcmV2ZW50IGR1cGxpY2F0ZSBldmVudHMgZnJvbSBgZWRpdG9yUGFuZS5vbkRpZEZvY3VzYFxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFRpdGxlIENvbnRhaW5lclxuXHRcdGNvbnN0IGhhbmRsZVRpdGxlQ2xpY2tPclRvdWNoID0gKGU6IE1vdXNlRXZlbnQgfCBHZXN0dXJlRXZlbnQpOiB2b2lkID0+IHtcblx0XHRcdGxldCB0YXJnZXQ6IEhUTUxFbGVtZW50O1xuXHRcdFx0aWYgKGlzTW91c2VFdmVudChlKSkge1xuXHRcdFx0XHRpZiAoZS5idXR0b24gIT09IDAgLyogbWlkZGxlL3JpZ2h0IG1vdXNlIGJ1dHRvbiAqLyB8fCAoaXNNYWNpbnRvc2ggJiYgZS5jdHJsS2V5IC8qIG1hY09TIGNvbnRleHQgbWVudSAqLykpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0YXJnZXQgPSAoZSBhcyBHZXN0dXJlRXZlbnQpLmluaXRpYWxUYXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmaW5kUGFyZW50V2l0aENsYXNzKHRhcmdldCwgJ21vbmFjby1hY3Rpb24tYmFyJywgdGhpcy50aXRsZUNvbnRhaW5lcikgfHxcblx0XHRcdFx0ZmluZFBhcmVudFdpdGhDbGFzcyh0YXJnZXQsICdtb25hY28tYnJlYWRjcnVtYi1pdGVtJywgdGhpcy50aXRsZUNvbnRhaW5lcilcblx0XHRcdCkge1xuXHRcdFx0XHRyZXR1cm47IC8vIG5vdCB3aGVuIGNsaWNraW5nIG9uIGFjdGlvbnMgb3IgYnJlYWRjcnVtYnNcblx0XHRcdH1cblxuXHRcdFx0Ly8gdGltZW91dCB0byBrZWVwIGZvY3VzIGluIGVkaXRvciBhZnRlciBtb3VzZSB1cFxuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHRcdH0pO1xuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy50aXRsZUNvbnRhaW5lciwgRXZlbnRUeXBlLk1PVVNFX0RPV04sIGUgPT4gaGFuZGxlVGl0bGVDbGlja09yVG91Y2goZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy50aXRsZUNvbnRhaW5lciwgVG91Y2hFdmVudFR5cGUuVGFwLCBlID0+IGhhbmRsZVRpdGxlQ2xpY2tPclRvdWNoKGUpKSk7XG5cblx0XHQvLyBFZGl0b3IgcGFuZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yUGFuZS5vbkRpZEZvY3VzKCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkRm9jdXMuZmlyZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29udGFpbmVyKCk6IHZvaWQge1xuXG5cdFx0Ly8gRW1wdHkgQ29udGFpbmVyOiBhZGQgc29tZSBlbXB0eSBjb250YWluZXIgYXR0cmlidXRlc1xuXHRcdGlmICh0aGlzLmlzRW1wdHkpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdlbXB0eScpO1xuXHRcdFx0dGhpcy5lbGVtZW50LnRhYkluZGV4ID0gMDtcblx0XHRcdHRoaXMuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnZW1wdHlFZGl0b3JHcm91cCcsIFwiezB9IChlbXB0eSlcIiwgdGhpcy5hcmlhTGFiZWwpKTtcblx0XHR9XG5cblx0XHQvLyBOb24tRW1wdHkgQ29udGFpbmVyOiByZXZlcnQgZW1wdHkgY29udGFpbmVyIGF0dHJpYnV0ZXNcblx0XHRlbHNlIHtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdlbXB0eScpO1xuXHRcdFx0dGhpcy5lbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgndGFiSW5kZXgnKTtcblx0XHRcdHRoaXMuZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgc3R5bGVzXG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGl0bGVDb250YWluZXIoKTogdm9pZCB7XG5cdFx0dGhpcy50aXRsZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCd0YWJzJywgdGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLnNob3dUYWJzID09PSAnbXVsdGlwbGUnKTtcblx0XHR0aGlzLnRpdGxlQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3Nob3ctZmlsZS1pY29ucycsIHRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucy5zaG93SWNvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXN0b3JlRWRpdG9ycyhmcm9tOiBJRWRpdG9yR3JvdXBWaWV3IHwgSVNlcmlhbGl6ZWRFZGl0b3JHcm91cE1vZGVsIHwgbnVsbCwgZ3JvdXBWaWV3T3B0aW9ucz86IElFZGl0b3JHcm91cFZpZXdPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuY291bnQgPT09IDApIHtcblx0XHRcdHJldHVybjsgLy8gbm90aGluZyB0byBzaG93XG5cdFx0fVxuXG5cdFx0Ly8gRGV0ZXJtaW5lIGVkaXRvciBvcHRpb25zXG5cdFx0bGV0IG9wdGlvbnM6IElFZGl0b3JPcHRpb25zO1xuXHRcdGlmIChmcm9tIGluc3RhbmNlb2YgRWRpdG9yR3JvdXBWaWV3KSB7XG5cdFx0XHRvcHRpb25zID0gZmlsbEFjdGl2ZUVkaXRvclZpZXdTdGF0ZShmcm9tKTsgLy8gaWYgd2UgY29weSBmcm9tIGFub3RoZXIgZ3JvdXAsIGVuc3VyZSB0byBjb3B5IGl0cyBhY3RpdmUgZWRpdG9yIHZpZXdzdGF0ZVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRvcHRpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSB0aGlzLm1vZGVsLmFjdGl2ZUVkaXRvcjtcblx0XHRpZiAoIWFjdGl2ZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdG9wdGlvbnMucGlubmVkID0gdGhpcy5tb2RlbC5pc1Bpbm5lZChhY3RpdmVFZGl0b3IpO1x0Ly8gcHJlc2VydmUgcGlubmVkIHN0YXRlXG5cdFx0b3B0aW9ucy5zdGlja3kgPSB0aGlzLm1vZGVsLmlzU3RpY2t5KGFjdGl2ZUVkaXRvcik7XHQvLyBwcmVzZXJ2ZSBzdGlja3kgc3RhdGVcblx0XHRvcHRpb25zLnByZXNlcnZlRm9jdXMgPSB0cnVlO1x0XHRcdFx0XHRcdC8vIGhhbmRsZSBmb2N1cyBhZnRlciBlZGl0b3IgaXMgcmVzdG9yZWRcblxuXHRcdGNvbnN0IGludGVybmFsT3B0aW9uczogSUludGVybmFsRWRpdG9yT3Blbk9wdGlvbnMgPSB7XG5cdFx0XHRwcmVzZXJ2ZVdpbmRvd09yZGVyOiB0cnVlLFx0XHRcdFx0XHRcdC8vIGhhbmRsZSB3aW5kb3cgb3JkZXIgYWZ0ZXIgZWRpdG9yIGlzIHJlc3RvcmVkXG5cdFx0XHRza2lwVGl0bGVVcGRhdGU6IHRydWUsXHRcdFx0XHRcdFx0XHQvLyB1cGRhdGUgdGhlIHRpdGxlIGxhdGVyIGZvciBhbGwgZWRpdG9ycyBhdCBvbmNlXG5cdFx0fTtcblxuXHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBnZXRBY3RpdmVFbGVtZW50KCk7XG5cblx0XHQvLyBTaG93IGFjdGl2ZSBlZGl0b3IgKGludGVudGlvbmFsbHkgbm90IHVzaW5nIGFzeW5jIHRvIGtlZXBcblx0XHQvLyBgcmVzdG9yZUVkaXRvcnNgIGZyb20gZXhlY3V0aW5nIGluIHNhbWUgc3RhY2spXG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5kb1Nob3dFZGl0b3IoYWN0aXZlRWRpdG9yLCB7IGFjdGl2ZTogdHJ1ZSwgaXNOZXc6IGZhbHNlIC8qIHJlc3RvcmVkICovIH0sIG9wdGlvbnMsIGludGVybmFsT3B0aW9ucykudGhlbigoKSA9PiB7XG5cblx0XHRcdC8vIFNldCBmb2N1c2VkIG5vdyBpZiB0aGlzIGlzIHRoZSBhY3RpdmUgZ3JvdXAgYW5kIGZvY3VzIGhhc1xuXHRcdFx0Ly8gbm90IGNoYW5nZWQgbWVhbndoaWxlLiBUaGlzIHByZXZlbnRzIGZvY3VzIGZyb20gYmVpbmdcblx0XHRcdC8vIHN0b2xlbiBhY2NpZGVudGFsbHkgb24gc3RhcnR1cCB3aGVuIHRoZSB1c2VyIGFscmVhZHlcblx0XHRcdC8vIGNsaWNrZWQgc29tZXdoZXJlLlxuXG5cdFx0XHRpZiAodGhpcy5ncm91cHNWaWV3LmFjdGl2ZUdyb3VwID09PSB0aGlzICYmIGFjdGl2ZUVsZW1lbnQgJiYgaXNBY3RpdmVFbGVtZW50KGFjdGl2ZUVsZW1lbnQpICYmICFncm91cFZpZXdPcHRpb25zPy5wcmVzZXJ2ZUZvY3VzKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIFJlc3RvcmUgZWRpdG9ycyBpbiB0aXRsZSBjb250cm9sXG5cdFx0dGhpcy50aXRsZUNvbnRyb2wub3BlbkVkaXRvcnModGhpcy5lZGl0b3JzKTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvLyNyZWdpb24gZXZlbnQgaGFuZGxpbmdcblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXG5cdFx0Ly8gTW9kZWwgRXZlbnRzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tb2RlbC5vbkRpZE1vZGVsQ2hhbmdlKGUgPT4gdGhpcy5vbkRpZEdyb3VwTW9kZWxDaGFuZ2UoZSkpKTtcblxuXHRcdC8vIE9wdGlvbiBDaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ncm91cHNWaWV3Lm9uRGlkQ2hhbmdlRWRpdG9yUGFydE9wdGlvbnMoZSA9PiB0aGlzLm9uRGlkQ2hhbmdlRWRpdG9yUGFydE9wdGlvbnMoZSkpKTtcblxuXHRcdC8vIFZpc2liaWxpdHlcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmdyb3Vwc1ZpZXcub25EaWRWaXNpYmlsaXR5Q2hhbmdlKGUgPT4gdGhpcy5vbkRpZFZpc2liaWxpdHlDaGFuZ2UoZSkpKTtcblxuXHRcdC8vIEZvY3VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZEZvY3VzKCgpID0+IHRoaXMub25EaWRHYWluRm9jdXMoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZEdyb3VwTW9kZWxDaGFuZ2UoZTogSUdyb3VwTW9kZWxDaGFuZ2VFdmVudCk6IHZvaWQge1xuXG5cdFx0Ly8gUmUtZW1pdCB0byBvdXRzaWRlXG5cdFx0dGhpcy5fb25EaWRNb2RlbENoYW5nZS5maXJlKGUpO1xuXG5cdFx0Ly8gSGFuZGxlIHdpdGhpblxuXG5cdFx0c3dpdGNoIChlLmtpbmQpIHtcblx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfTE9DS0VEOlxuXHRcdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnbG9ja2VkJywgdGhpcy5pc0xvY2tlZCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JTX1NFTEVDVElPTjpcblx0XHRcdFx0dGhpcy5vbkRpZENoYW5nZUVkaXRvclNlbGVjdGlvbigpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRpZiAoIWUuZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChlLmtpbmQpIHtcblx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX09QRU46XG5cdFx0XHRcdGlmIChpc0dyb3VwRWRpdG9yT3BlbkV2ZW50KGUpKSB7XG5cdFx0XHRcdFx0dGhpcy5vbkRpZE9wZW5FZGl0b3IoZS5lZGl0b3IsIGUuZWRpdG9ySW5kZXgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfQ0xPU0U6XG5cdFx0XHRcdGlmIChpc0dyb3VwRWRpdG9yQ2xvc2VFdmVudChlKSkge1xuXHRcdFx0XHRcdHRoaXMuaGFuZGxlT25EaWRDbG9zZUVkaXRvcihlLmVkaXRvciwgZS5lZGl0b3JJbmRleCwgZS5jb250ZXh0LCBlLnN0aWNreSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9XSUxMX0RJU1BPU0U6XG5cdFx0XHRcdHRoaXMub25XaWxsRGlzcG9zZUVkaXRvcihlLmVkaXRvcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfRElSVFk6XG5cdFx0XHRcdHRoaXMub25EaWRDaGFuZ2VFZGl0b3JEaXJ0eShlLmVkaXRvcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfVFJBTlNJRU5UOlxuXHRcdFx0XHR0aGlzLm9uRGlkQ2hhbmdlRWRpdG9yVHJhbnNpZW50KGUuZWRpdG9yKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9MQUJFTDpcblx0XHRcdFx0dGhpcy5vbkRpZENoYW5nZUVkaXRvckxhYmVsKGUuZWRpdG9yKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9DQVBBQklMSVRJRVM6XG5cdFx0XHRcdHRoaXMub25EaWRDaGFuZ2VFZGl0b3JDYXBhYmlsaXRpZXMoZS5lZGl0b3IpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkT3BlbkVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0LCBlZGl0b3JJbmRleDogbnVtYmVyKTogdm9pZCB7XG5cblx0XHQvKiBfX0dEUFJfX1xuXHRcdFx0XCJlZGl0b3JPcGVuZWRcIiA6IHtcblx0XHRcdFx0XCJvd25lclwiOiBcImlzaWRvcm5cIixcblx0XHRcdFx0XCIke2luY2x1ZGV9XCI6IFtcblx0XHRcdFx0XHRcIiR7RWRpdG9yVGVsZW1ldHJ5RGVzY3JpcHRvcn1cIlxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0Ki9cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nKCdlZGl0b3JPcGVuZWQnLCB0aGlzLnRvRWRpdG9yVGVsZW1ldHJ5RGVzY3JpcHRvcihlZGl0b3IpKTtcblxuXHRcdC8vIFVwZGF0ZSBjb250YWluZXJcblx0XHR0aGlzLnVwZGF0ZUNvbnRhaW5lcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVPbkRpZENsb3NlRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQsIGVkaXRvckluZGV4OiBudW1iZXIsIGNvbnRleHQ6IEVkaXRvckNsb3NlQ29udGV4dCwgc3RpY2t5OiBib29sZWFuKTogdm9pZCB7XG5cblx0XHQvLyBCZWZvcmUgY2xvc2Vcblx0XHR0aGlzLl9vbldpbGxDbG9zZUVkaXRvci5maXJlKHsgZ3JvdXBJZDogdGhpcy5pZCwgZWRpdG9yLCBjb250ZXh0LCBpbmRleDogZWRpdG9ySW5kZXgsIHN0aWNreSB9KTtcblxuXHRcdC8vIEhhbmRsZSBldmVudFxuXHRcdGNvbnN0IGVkaXRvcnNUb0Nsb3NlOiBFZGl0b3JJbnB1dFtdID0gW2VkaXRvcl07XG5cblx0XHQvLyBJbmNsdWRlIGJvdGggc2lkZXMgb2Ygc2lkZSBieSBzaWRlIGVkaXRvcnMgd2hlbiBiZWluZyBjbG9zZWRcblx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgU2lkZUJ5U2lkZUVkaXRvcklucHV0KSB7XG5cdFx0XHRlZGl0b3JzVG9DbG9zZS5wdXNoKGVkaXRvci5wcmltYXJ5LCBlZGl0b3Iuc2Vjb25kYXJ5KTtcblx0XHR9XG5cblx0XHQvLyBGb3IgZWFjaCBlZGl0b3IgdG8gY2xvc2UsIHdlIGNhbGwgZGlzcG9zZSgpIHRvIGZyZWUgdXAgYW55IHJlc291cmNlcy5cblx0XHQvLyBIb3dldmVyLCBjZXJ0YWluIGVkaXRvcnMgbWlnaHQgYmUgc2hhcmVkIGFjcm9zcyBtdWx0aXBsZSBlZGl0b3IgZ3JvdXBzXG5cdFx0Ly8gKGluY2x1ZGluZyBiZWluZyB2aXNpYmxlIGluIHNpZGUgYnkgc2lkZSAvIGRpZmYgZWRpdG9ycykgYW5kIGFzIHN1Y2ggd2Vcblx0XHQvLyBvbmx5IGRpc3Bvc2Ugd2hlbiB0aGV5IGFyZSBub3Qgb3BlbmVkIGVsc2V3aGVyZS5cblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBlZGl0b3JzVG9DbG9zZSkge1xuXHRcdFx0aWYgKHRoaXMuY2FuRGlzcG9zZShlZGl0b3IpKSB7XG5cdFx0XHRcdGVkaXRvci5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGNvbnRhaW5lclxuXHRcdHRoaXMudXBkYXRlQ29udGFpbmVyKCk7XG5cblx0XHQvLyBFdmVudFxuXHRcdHRoaXMuX29uRGlkQ2xvc2VFZGl0b3IuZmlyZSh7IGdyb3VwSWQ6IHRoaXMuaWQsIGVkaXRvciwgY29udGV4dCwgaW5kZXg6IGVkaXRvckluZGV4LCBzdGlja3kgfSk7XG5cdH1cblxuXHRwcml2YXRlIGNhbkRpc3Bvc2UoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdGZvciAoY29uc3QgZ3JvdXBWaWV3IG9mIHRoaXMuZWRpdG9yUGFydHNWaWV3Lmdyb3Vwcykge1xuXHRcdFx0aWYgKGdyb3VwVmlldyBpbnN0YW5jZW9mIEVkaXRvckdyb3VwVmlldyAmJiBncm91cFZpZXcubW9kZWwuY29udGFpbnMoZWRpdG9yLCB7XG5cdFx0XHRcdHN0cmljdEVxdWFsczogdHJ1ZSxcdFx0XHRcdFx0XHQvLyBvbmx5IGlmIHRoaXMgaW5wdXQgaXMgbm90IHNoYXJlZCBhY3Jvc3MgZWRpdG9yIGdyb3Vwc1xuXHRcdFx0XHRzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5BTlkgLy8gaW5jbHVkZSBhbnkgc2lkZSBvZiBhbiBvcGVuZWQgc2lkZSBieSBzaWRlIGVkaXRvclxuXHRcdFx0fSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSB0b1Jlc291cmNlVGVsZW1ldHJ5RGVzY3JpcHRvcihyZXNvdXJjZTogVVJJKTogb2JqZWN0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhdGggPSByZXNvdXJjZSA/IHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlID8gcmVzb3VyY2UuZnNQYXRoIDogcmVzb3VyY2UucGF0aCA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXBhdGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIHF1ZXJ5IHBhcmFtZXRlcnMgZnJvbSB0aGUgcmVzb3VyY2UgZXh0ZW5zaW9uXG5cdFx0bGV0IHJlc291cmNlRXh0ID0gZXh0bmFtZShyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcXVlcnlTdHJpbmdMb2NhdGlvbiA9IHJlc291cmNlRXh0LmluZGV4T2YoJz8nKTtcblx0XHRyZXNvdXJjZUV4dCA9IHF1ZXJ5U3RyaW5nTG9jYXRpb24gIT09IC0xID8gcmVzb3VyY2VFeHQuc3Vic3RyKDAsIHF1ZXJ5U3RyaW5nTG9jYXRpb24pIDogcmVzb3VyY2VFeHQ7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bWltZVR5cGU6IG5ldyBUZWxlbWV0cnlUcnVzdGVkVmFsdWUoZ2V0TWltZVR5cGVzKHJlc291cmNlKS5qb2luKCcsICcpKSxcblx0XHRcdHNjaGVtZTogcmVzb3VyY2Uuc2NoZW1lLFxuXHRcdFx0ZXh0OiByZXNvdXJjZUV4dCxcblx0XHRcdHBhdGg6IGhhc2gocGF0aClcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSB0b0VkaXRvclRlbGVtZXRyeURlc2NyaXB0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IElUZWxlbWV0cnlEYXRhIHtcblx0XHRjb25zdCBkZXNjcmlwdG9yID0gZWRpdG9yLmdldFRlbGVtZXRyeURlc2NyaXB0b3IoKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShlZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQk9USCB9KTtcblx0XHRpZiAoVVJJLmlzVXJpKHJlc291cmNlKSkge1xuXHRcdFx0ZGVzY3JpcHRvclsncmVzb3VyY2UnXSA9IHRoaXMudG9SZXNvdXJjZVRlbGVtZXRyeURlc2NyaXB0b3IocmVzb3VyY2UpO1xuXG5cdFx0XHQvKiBfX0dEUFJfX0ZSQUdNRU5UX19cblx0XHRcdFx0XCJFZGl0b3JUZWxlbWV0cnlEZXNjcmlwdG9yXCIgOiB7XG5cdFx0XHRcdFx0XCJyZXNvdXJjZVwiOiB7IFwiJHtpbmxpbmV9XCI6IFsgXCIke1VSSURlc2NyaXB0b3J9XCIgXSB9XG5cdFx0XHRcdH1cblx0XHRcdCovXG5cdFx0XHRyZXR1cm4gZGVzY3JpcHRvcjtcblx0XHR9IGVsc2UgaWYgKHJlc291cmNlKSB7XG5cdFx0XHRpZiAocmVzb3VyY2UucHJpbWFyeSkge1xuXHRcdFx0XHRkZXNjcmlwdG9yWydyZXNvdXJjZSddID0gdGhpcy50b1Jlc291cmNlVGVsZW1ldHJ5RGVzY3JpcHRvcihyZXNvdXJjZS5wcmltYXJ5KTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXNvdXJjZS5zZWNvbmRhcnkpIHtcblx0XHRcdFx0ZGVzY3JpcHRvclsncmVzb3VyY2VTZWNvbmRhcnknXSA9IHRoaXMudG9SZXNvdXJjZVRlbGVtZXRyeURlc2NyaXB0b3IocmVzb3VyY2Uuc2Vjb25kYXJ5KTtcblx0XHRcdH1cblx0XHRcdC8qIF9fR0RQUl9fRlJBR01FTlRfX1xuXHRcdFx0XHRcIkVkaXRvclRlbGVtZXRyeURlc2NyaXB0b3JcIiA6IHtcblx0XHRcdFx0XHRcInJlc291cmNlXCI6IHsgXCIke2lubGluZX1cIjogWyBcIiR7VVJJRGVzY3JpcHRvcn1cIiBdIH0sXG5cdFx0XHRcdFx0XCJyZXNvdXJjZVNlY29uZGFyeVwiOiB7IFwiJHtpbmxpbmV9XCI6IFsgXCIke1VSSURlc2NyaXB0b3J9XCIgXSB9XG5cdFx0XHRcdH1cblx0XHRcdCovXG5cdFx0XHRyZXR1cm4gZGVzY3JpcHRvcjtcblx0XHR9XG5cblx0XHRyZXR1cm4gZGVzY3JpcHRvcjtcblx0fVxuXG5cdHByaXZhdGUgb25XaWxsRGlzcG9zZUVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZCB7XG5cblx0XHQvLyBUbyBwcmV2ZW50IHJhY2UgY29uZGl0aW9ucywgd2UgaGFuZGxlIGRpc3Bvc2VkIGVkaXRvcnMgaW4gb3VyIHdvcmtlciB3aXRoIGEgdGltZW91dFxuXHRcdC8vIGJlY2F1c2UgaXQgY2FuIGhhcHBlbiB0aGF0IGFuIGlucHV0IGlzIGJlaW5nIGRpc3Bvc2VkIHdpdGggdGhlIGludGVudCB0byByZXBsYWNlXG5cdFx0Ly8gaXQgd2l0aCBzb21lIG90aGVyIGlucHV0IHJpZ2h0IGFmdGVyLlxuXHRcdHRoaXMuZGlzcG9zZWRFZGl0b3JzV29ya2VyLndvcmsoZWRpdG9yKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlRGlzcG9zZWRFZGl0b3JzKGRpc3Bvc2VkRWRpdG9yczogRWRpdG9ySW5wdXRbXSk6IHZvaWQge1xuXG5cdFx0Ly8gU3BsaXQgYmV0d2VlbiB2aXNpYmxlIGFuZCBoaWRkZW4gZWRpdG9yc1xuXHRcdGxldCBhY3RpdmVFZGl0b3I6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGluYWN0aXZlRWRpdG9yczogRWRpdG9ySW5wdXRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZGlzcG9zZWRFZGl0b3Igb2YgZGlzcG9zZWRFZGl0b3JzKSB7XG5cdFx0XHRjb25zdCBlZGl0b3JGaW5kUmVzdWx0ID0gdGhpcy5tb2RlbC5maW5kRWRpdG9yKGRpc3Bvc2VkRWRpdG9yKTtcblx0XHRcdGlmICghZWRpdG9yRmluZFJlc3VsdCkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gbm90IHBhcnQgb2YgdGhlIG1vZGVsIGFueW1vcmVcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZWRpdG9yID0gZWRpdG9yRmluZFJlc3VsdFswXTtcblx0XHRcdGlmICghZWRpdG9yLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gZWRpdG9yIGdvdCByZW9wZW5lZCBtZWFud2hpbGVcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMubW9kZWwuaXNBY3RpdmUoZWRpdG9yKSkge1xuXHRcdFx0XHRhY3RpdmVFZGl0b3IgPSBlZGl0b3I7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpbmFjdGl2ZUVkaXRvcnMucHVzaChlZGl0b3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENsb3NlIGFsbCBpbmFjdGl2ZSBlZGl0b3JzIGZpcnN0IHRvIHByZXZlbnQgVUkgZmxpY2tlclxuXHRcdGZvciAoY29uc3QgaW5hY3RpdmVFZGl0b3Igb2YgaW5hY3RpdmVFZGl0b3JzKSB7XG5cdFx0XHR0aGlzLmRvQ2xvc2VFZGl0b3IoaW5hY3RpdmVFZGl0b3IsIHRydWUpO1xuXHRcdH1cblxuXHRcdC8vIENsb3NlIGFjdGl2ZSBvbmUgbGFzdFxuXHRcdGlmIChhY3RpdmVFZGl0b3IpIHtcblx0XHRcdHRoaXMuZG9DbG9zZUVkaXRvcihhY3RpdmVFZGl0b3IsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VFZGl0b3JQYXJ0T3B0aW9ucyhldmVudDogSUVkaXRvclBhcnRPcHRpb25zQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblxuXHRcdC8vIFRpdGxlIGNvbnRhaW5lclxuXHRcdHRoaXMudXBkYXRlVGl0bGVDb250YWluZXIoKTtcblxuXHRcdC8vIFRpdGxlIGNvbnRyb2xcblx0XHR0aGlzLnRpdGxlQ29udHJvbC51cGRhdGVPcHRpb25zKGV2ZW50Lm9sZFBhcnRPcHRpb25zLCBldmVudC5uZXdQYXJ0T3B0aW9ucyk7XG5cblx0XHQvLyBUaXRsZSBjb250cm9sIHN3aXRjaCBiZXR3ZWVuIHNpbmdsZUVkaXRvclRhYnMsIG11bHRpRWRpdG9yVGFicyBhbmQgbXVsdGlSb3dFZGl0b3JUYWJzXG5cdFx0aWYgKFxuXHRcdFx0ZXZlbnQub2xkUGFydE9wdGlvbnMuc2hvd1RhYnMgIT09IGV2ZW50Lm5ld1BhcnRPcHRpb25zLnNob3dUYWJzIHx8XG5cdFx0XHRldmVudC5vbGRQYXJ0T3B0aW9ucy50YWJIZWlnaHQgIT09IGV2ZW50Lm5ld1BhcnRPcHRpb25zLnRhYkhlaWdodCB8fFxuXHRcdFx0KGV2ZW50Lm9sZFBhcnRPcHRpb25zLnNob3dUYWJzID09PSAnbXVsdGlwbGUnICYmIGV2ZW50Lm9sZFBhcnRPcHRpb25zLnBpbm5lZFRhYnNPblNlcGFyYXRlUm93ICE9PSBldmVudC5uZXdQYXJ0T3B0aW9ucy5waW5uZWRUYWJzT25TZXBhcmF0ZVJvdylcblx0XHQpIHtcblxuXHRcdFx0Ly8gUmUtbGF5b3V0XG5cdFx0XHR0aGlzLnJlbGF5b3V0KCk7XG5cblx0XHRcdC8vIEVuc3VyZSB0byBzaG93IGFjdGl2ZSBlZGl0b3IgaWYgYW55XG5cdFx0XHRpZiAodGhpcy5tb2RlbC5hY3RpdmVFZGl0b3IpIHtcblx0XHRcdFx0dGhpcy50aXRsZUNvbnRyb2wub3BlbkVkaXRvcnModGhpcy5tb2RlbC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU3R5bGVzXG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblxuXHRcdC8vIFBpbiBwcmV2aWV3IGVkaXRvciBvbmNlIHVzZXIgZGlzYWJsZXMgcHJldmlld1xuXHRcdGlmIChldmVudC5vbGRQYXJ0T3B0aW9ucy5lbmFibGVQcmV2aWV3ICYmICFldmVudC5uZXdQYXJ0T3B0aW9ucy5lbmFibGVQcmV2aWV3KSB7XG5cdFx0XHRpZiAodGhpcy5tb2RlbC5wcmV2aWV3RWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMucGluRWRpdG9yKHRoaXMubW9kZWwucHJldmlld0VkaXRvcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUVkaXRvckRpcnR5KGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkIHtcblxuXHRcdC8vIEFsd2F5cyBzaG93IGRpcnR5IGVkaXRvcnMgcGlubmVkXG5cdFx0dGhpcy5waW5FZGl0b3IoZWRpdG9yKTtcblxuXHRcdC8vIEZvcndhcmQgdG8gdGl0bGUgY29udHJvbFxuXHRcdHRoaXMudGl0bGVDb250cm9sLnVwZGF0ZUVkaXRvckRpcnR5KGVkaXRvcik7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlRWRpdG9yVHJhbnNpZW50KGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkIHtcblx0XHRjb25zdCB0cmFuc2llbnQgPSB0aGlzLm1vZGVsLmlzVHJhbnNpZW50KGVkaXRvcik7XG5cblx0XHQvLyBUcmFuc2llbnQgc3RhdGUgb3ZlcnJpZGVzIHRoZSBgZW5hYmxlUHJldmlld2Agc2V0dGluZyxcblx0XHQvLyBzbyB3aGVuIGFuIGVkaXRvciBsZWF2ZXMgdGhlIHRyYW5zaWVudCBzdGF0ZSwgd2UgaGF2ZVxuXHRcdC8vIHRvIGVuc3VyZSBpdHMgcHJldmlldyBzdGF0ZSBpcyBhbHNvIGNsZWFyZWQuXG5cdFx0aWYgKCF0cmFuc2llbnQgJiYgIXRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucy5lbmFibGVQcmV2aWV3KSB7XG5cdFx0XHR0aGlzLnBpbkVkaXRvcihlZGl0b3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VFZGl0b3JMYWJlbChlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZCB7XG5cblx0XHQvLyBGb3J3YXJkIHRvIHRpdGxlIGNvbnRyb2xcblx0XHR0aGlzLnRpdGxlQ29udHJvbC51cGRhdGVFZGl0b3JMYWJlbChlZGl0b3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUVkaXRvckNhcGFiaWxpdGllcyhlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZCB7XG5cdFx0dGhpcy50aXRsZUNvbnRyb2wudXBkYXRlRWRpdG9yQ2FwYWJpbGl0aWVzKGVkaXRvcik7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlRWRpdG9yU2VsZWN0aW9uKCk6IHZvaWQge1xuXG5cdFx0Ly8gRm9yd2FyZCB0byB0aXRsZSBjb250cm9sXG5cdFx0dGhpcy50aXRsZUNvbnRyb2wudXBkYXRlRWRpdG9yU2VsZWN0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFZpc2liaWxpdHlDaGFuZ2UodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXG5cdFx0Ly8gRm9yd2FyZCB0byBhY3RpdmUgZWRpdG9yIHBhbmVcblx0XHR0aGlzLmVkaXRvclBhbmUuc2V0VmlzaWJsZSh2aXNpYmxlKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRHYWluRm9jdXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuYWN0aXZlRWRpdG9yKSB7XG5cblx0XHRcdC8vIFdlIGFnZ3Jlc3NpdmVseSBjbGVhciB0aGUgdHJhbnNpZW50IHN0YXRlIG9mIGVkaXRvcnNcblx0XHRcdC8vIGFzIHNvb24gYXMgdGhlIGdyb3VwIGdhaW5zIGZvY3VzLiBUaGlzIGlzIHRvIGVuc3VyZVxuXHRcdFx0Ly8gdGhhdCB0aGUgdHJhbnNpZW50IHN0YXRlIGlzIG5vdCBzdGF5aW5nIGFyb3VuZCB3aGVuXG5cdFx0XHQvLyB0aGUgdXNlciBpbnRlcmFjdHMgd2l0aCB0aGUgZWRpdG9yLlxuXG5cdFx0XHR0aGlzLm1vZGVsLnNldFRyYW5zaWVudCh0aGlzLmFjdGl2ZUVkaXRvciwgZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBJRWRpdG9yR3JvdXBWaWV3XG5cblx0Z2V0IGluZGV4KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2luZGV4O1xuXHR9XG5cblx0Z2V0IGxhYmVsKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuZ3JvdXBzTGFiZWwpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnZ3JvdXBMYWJlbExvbmcnLCBcInswfTogR3JvdXAgezF9XCIsIHRoaXMuZ3JvdXBzTGFiZWwsIHRoaXMuX2luZGV4ICsgMSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxvY2FsaXplKCdncm91cExhYmVsJywgXCJHcm91cCB7MH1cIiwgdGhpcy5faW5kZXggKyAxKTtcblx0fVxuXG5cdGdldCBhcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5ncm91cHNMYWJlbCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdncm91cEFyaWFMYWJlbExvbmcnLCBcInswfTogRWRpdG9yIEdyb3VwIHsxfVwiLCB0aGlzLmdyb3Vwc0xhYmVsLCB0aGlzLl9pbmRleCArIDEpO1xuXHRcdH1cblxuXHRcdHJldHVybiBsb2NhbGl6ZSgnZ3JvdXBBcmlhTGFiZWwnLCBcIkVkaXRvciBHcm91cCB7MH1cIiwgdGhpcy5faW5kZXggKyAxKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VkID0gZmFsc2U7XG5cdGdldCBkaXNwb3NlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZGlzcG9zZWQ7XG5cdH1cblxuXHRnZXQgaXNFbXB0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb3VudCA9PT0gMDtcblx0fVxuXG5cdGdldCB0aXRsZUhlaWdodCgpOiBJRWRpdG9yR3JvdXBUaXRsZUhlaWdodCB7XG5cdFx0cmV0dXJuIHRoaXMudGl0bGVDb250cm9sLmdldEhlaWdodCgpO1xuXHR9XG5cblx0bm90aWZ5SW5kZXhDaGFuZ2VkKG5ld0luZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faW5kZXggIT09IG5ld0luZGV4KSB7XG5cdFx0XHR0aGlzLl9pbmRleCA9IG5ld0luZGV4O1xuXHRcdFx0dGhpcy5tb2RlbC5zZXRJbmRleChuZXdJbmRleCk7XG5cdFx0fVxuXHR9XG5cblx0bm90aWZ5TGFiZWxDaGFuZ2VkKG5ld0xhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5ncm91cHNMYWJlbCAhPT0gbmV3TGFiZWwpIHtcblx0XHRcdHRoaXMuZ3JvdXBzTGFiZWwgPSBuZXdMYWJlbDtcblx0XHRcdHRoaXMubW9kZWwuc2V0TGFiZWwobmV3TGFiZWwpO1xuXHRcdH1cblx0fVxuXG5cdHNldEFjdGl2ZShpc0FjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuYWN0aXZlID0gaXNBY3RpdmU7XG5cblx0XHQvLyBDbGVhciBzZWxlY3Rpb24gd2hlbiBncm91cCBubyBsb25nZXIgYWN0aXZlXG5cdFx0aWYgKCFpc0FjdGl2ZSAmJiB0aGlzLmFjdGl2ZUVkaXRvciAmJiB0aGlzLnNlbGVjdGVkRWRpdG9ycy5sZW5ndGggPiAxKSB7XG5cdFx0XHR0aGlzLnNldFNlbGVjdGlvbih0aGlzLmFjdGl2ZUVkaXRvciwgW10pO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBjb250YWluZXJcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgaXNBY3RpdmUpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdpbmFjdGl2ZScsICFpc0FjdGl2ZSk7XG5cblx0XHQvLyBVcGRhdGUgdGl0bGUgY29udHJvbFxuXHRcdHRoaXMudGl0bGVDb250cm9sLnNldEFjdGl2ZShpc0FjdGl2ZSk7XG5cblx0XHQvLyBVcGRhdGUgc3R5bGVzXG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblxuXHRcdC8vIFVwZGF0ZSBtb2RlbFxuXHRcdHRoaXMubW9kZWwuc2V0QWN0aXZlKHVuZGVmaW5lZCAvKiBlbnRpcmUgZ3JvdXAgZ290IGFjdGl2ZSAqLyk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gYmFzaWNzKClcblxuXHRnZXQgaWQoKTogR3JvdXBJZGVudGlmaWVyIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5pZDtcblx0fVxuXG5cdGdldCB3aW5kb3dJZCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmdyb3Vwc1ZpZXcud2luZG93SWQ7XG5cdH1cblxuXHRnZXQgZWRpdG9ycygpOiBFZGl0b3JJbnB1dFtdIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKTtcblx0fVxuXG5cdGdldCBjb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmNvdW50O1xuXHR9XG5cblx0Z2V0IHN0aWNreUNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuc3RpY2t5Q291bnQ7XG5cdH1cblxuXHQvKiogVGhlIGNvbnRhaW5lciB0aGF0IGJvdW5kcyB0aGUgZWRpdG9yIHBhbmUsIGV4Y2x1ZGluZyBhbnkgZG9ja2VkIGNvbnRlbnQgaW5zZXQuICovXG5cdGdldCBlZGl0b3JQYW5lQ29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JDb250YWluZXI7XG5cdH1cblxuXHRnZXQgYWN0aXZlRWRpdG9yUGFuZSgpOiBJVmlzaWJsZUVkaXRvclBhbmUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmVkaXRvclBhbmUgPyB0aGlzLmVkaXRvclBhbmUuYWN0aXZlRWRpdG9yUGFuZSA/PyB1bmRlZmluZWQgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgYWN0aXZlRWRpdG9yKCk6IEVkaXRvcklucHV0IHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuYWN0aXZlRWRpdG9yO1xuXHR9XG5cblx0Z2V0IHNlbGVjdGVkRWRpdG9ycygpOiBFZGl0b3JJbnB1dFtdIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5zZWxlY3RlZEVkaXRvcnM7XG5cdH1cblxuXHRnZXQgcHJldmlld0VkaXRvcigpOiBFZGl0b3JJbnB1dCB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLnByZXZpZXdFZGl0b3I7XG5cdH1cblxuXHRpc1Bpbm5lZChlZGl0b3JPckluZGV4OiBFZGl0b3JJbnB1dCB8IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmlzUGlubmVkKGVkaXRvck9ySW5kZXgpO1xuXHR9XG5cblx0aXNTdGlja3koZWRpdG9yT3JJbmRleDogRWRpdG9ySW5wdXQgfCBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5pc1N0aWNreShlZGl0b3JPckluZGV4KTtcblx0fVxuXG5cdGlzU2VsZWN0ZWQoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmlzU2VsZWN0ZWQoZWRpdG9yKTtcblx0fVxuXG5cdGlzVHJhbnNpZW50KGVkaXRvck9ySW5kZXg6IEVkaXRvcklucHV0IHwgbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuaXNUcmFuc2llbnQoZWRpdG9yT3JJbmRleCk7XG5cdH1cblxuXHRpc0FjdGl2ZShlZGl0b3I6IEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmlzQWN0aXZlKGVkaXRvcik7XG5cdH1cblxuXHRhc3luYyBzZXRTZWxlY3Rpb24oYWN0aXZlU2VsZWN0ZWRFZGl0b3I6IEVkaXRvcklucHV0LCBpbmFjdGl2ZVNlbGVjdGVkRWRpdG9yczogRWRpdG9ySW5wdXRbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5pc0FjdGl2ZShhY3RpdmVTZWxlY3RlZEVkaXRvcikpIHtcblx0XHRcdC8vIFRoZSBhY3RpdmUgc2VsZWN0ZWQgZWRpdG9yIGlzIG5vdCB5ZXQgb3BlbmVkLCBzbyB3ZSBnb1xuXHRcdFx0Ly8gdGhyb3VnaCBgb3BlbkVkaXRvcmAgdG8gc2hvdyBpdC4gV2UgcGFzcyB0aGUgaW5hY3RpdmVcblx0XHRcdC8vIHNlbGVjdGlvbiBhcyBpbnRlcm5hbCBvcHRpb25zXG5cdFx0XHRhd2FpdCB0aGlzLm9wZW5FZGl0b3IoYWN0aXZlU2VsZWN0ZWRFZGl0b3IsIHsgYWN0aXZhdGlvbjogRWRpdG9yQWN0aXZhdGlvbi5BQ1RJVkFURSB9LCB7IGluYWN0aXZlU2VsZWN0aW9uOiBpbmFjdGl2ZVNlbGVjdGVkRWRpdG9ycyB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tb2RlbC5zZXRTZWxlY3Rpb24oYWN0aXZlU2VsZWN0ZWRFZGl0b3IsIGluYWN0aXZlU2VsZWN0ZWRFZGl0b3JzKTtcblx0XHR9XG5cdH1cblxuXHRjb250YWlucyhjYW5kaWRhdGU6IEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCwgb3B0aW9ucz86IElNYXRjaEVkaXRvck9wdGlvbnMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5jb250YWlucyhjYW5kaWRhdGUsIG9wdGlvbnMpO1xuXHR9XG5cblx0Z2V0RWRpdG9ycyhvcmRlcjogRWRpdG9yc09yZGVyLCBvcHRpb25zPzogeyBleGNsdWRlU3RpY2t5PzogYm9vbGVhbiB9KTogRWRpdG9ySW5wdXRbXSB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0RWRpdG9ycyhvcmRlciwgb3B0aW9ucyk7XG5cdH1cblxuXHRmaW5kRWRpdG9ycyhyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSUZpbmRFZGl0b3JPcHRpb25zKTogRWRpdG9ySW5wdXRbXSB7XG5cdFx0Y29uc3QgY2Fub25pY2FsUmVzb3VyY2UgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5hc0Nhbm9uaWNhbFVyaShyZXNvdXJjZSk7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0RWRpdG9ycyhvcHRpb25zPy5vcmRlciA/PyBFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkuZmlsdGVyKGVkaXRvciA9PiB7XG5cdFx0XHRpZiAoZWRpdG9yLnJlc291cmNlICYmIGlzRXF1YWwoZWRpdG9yLnJlc291cmNlLCBjYW5vbmljYWxSZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN1cHBvcnQgc2lkZSBieSBzaWRlIGVkaXRvciBwcmltYXJ5IHNpZGUgaWYgc3BlY2lmaWVkXG5cdFx0XHRpZiAob3B0aW9ucz8uc3VwcG9ydFNpZGVCeVNpZGUgPT09IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB8fCBvcHRpb25zPy5zdXBwb3J0U2lkZUJ5U2lkZSA9PT0gU2lkZUJ5U2lkZUVkaXRvci5BTlkpIHtcblx0XHRcdFx0Y29uc3QgcHJpbWFyeVJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0XHRcdGlmIChwcmltYXJ5UmVzb3VyY2UgJiYgaXNFcXVhbChwcmltYXJ5UmVzb3VyY2UsIGNhbm9uaWNhbFJlc291cmNlKSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN1cHBvcnQgc2lkZSBieSBzaWRlIGVkaXRvciBzZWNvbmRhcnkgc2lkZSBpZiBzcGVjaWZpZWRcblx0XHRcdGlmIChvcHRpb25zPy5zdXBwb3J0U2lkZUJ5U2lkZSA9PT0gU2lkZUJ5U2lkZUVkaXRvci5TRUNPTkRBUlkgfHwgb3B0aW9ucz8uc3VwcG9ydFNpZGVCeVNpZGUgPT09IFNpZGVCeVNpZGVFZGl0b3IuQU5ZKSB7XG5cdFx0XHRcdGNvbnN0IHNlY29uZGFyeVJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlNFQ09OREFSWSB9KTtcblx0XHRcdFx0aWYgKHNlY29uZGFyeVJlc291cmNlICYmIGlzRXF1YWwoc2Vjb25kYXJ5UmVzb3VyY2UsIGNhbm9uaWNhbFJlc291cmNlKSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KTtcblx0fVxuXG5cdGdldEVkaXRvckJ5SW5kZXgoaW5kZXg6IG51bWJlcik6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRFZGl0b3JCeUluZGV4KGluZGV4KTtcblx0fVxuXG5cdGdldEluZGV4T2ZFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuaW5kZXhPZihlZGl0b3IpO1xuXHR9XG5cblx0aXNGaXJzdChlZGl0b3I6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuaXNGaXJzdChlZGl0b3IpO1xuXHR9XG5cblx0aXNMYXN0KGVkaXRvcjogRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5pc0xhc3QoZWRpdG9yKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXG5cdFx0Ly8gUGFzcyBmb2N1cyB0byBlZGl0b3IgcGFuZXNcblx0XHRpZiAodGhpcy5hY3RpdmVFZGl0b3JQYW5lKSB7XG5cdFx0XHR0aGlzLmFjdGl2ZUVkaXRvclBhbmUuZm9jdXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbGVtZW50LmZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRXZlbnRcblx0XHR0aGlzLl9vbkRpZEZvY3VzLmZpcmUoKTtcblx0fVxuXG5cdHBpbkVkaXRvcihjYW5kaWRhdGU6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkID0gdGhpcy5hY3RpdmVFZGl0b3IgfHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKGNhbmRpZGF0ZSAmJiAhdGhpcy5tb2RlbC5pc1Bpbm5lZChjYW5kaWRhdGUpKSB7XG5cblx0XHRcdC8vIFVwZGF0ZSBtb2RlbFxuXHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5tb2RlbC5waW4oY2FuZGlkYXRlKTtcblxuXHRcdFx0Ly8gRm9yd2FyZCB0byB0aXRsZSBjb250cm9sXG5cdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMudGl0bGVDb250cm9sLnBpbkVkaXRvcihlZGl0b3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHN0aWNrRWRpdG9yKGNhbmRpZGF0ZTogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQgPSB0aGlzLmFjdGl2ZUVkaXRvciB8fCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLmRvU3RpY2tFZGl0b3IoY2FuZGlkYXRlLCB0cnVlKTtcblx0fVxuXG5cdHVuc3RpY2tFZGl0b3IoY2FuZGlkYXRlOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCA9IHRoaXMuYWN0aXZlRWRpdG9yIHx8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuZG9TdGlja0VkaXRvcihjYW5kaWRhdGUsIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgZG9TdGlja0VkaXRvcihjYW5kaWRhdGU6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkLCBzdGlja3k6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoY2FuZGlkYXRlICYmIHRoaXMubW9kZWwuaXNTdGlja3koY2FuZGlkYXRlKSAhPT0gc3RpY2t5KSB7XG5cdFx0XHRjb25zdCBvbGRJbmRleE9mRWRpdG9yID0gdGhpcy5nZXRJbmRleE9mRWRpdG9yKGNhbmRpZGF0ZSk7XG5cblx0XHRcdC8vIFVwZGF0ZSBtb2RlbFxuXHRcdFx0Y29uc3QgZWRpdG9yID0gc3RpY2t5ID8gdGhpcy5tb2RlbC5zdGljayhjYW5kaWRhdGUpIDogdGhpcy5tb2RlbC51bnN0aWNrKGNhbmRpZGF0ZSk7XG5cdFx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHRoZSBpbmRleCBvZiB0aGUgZWRpdG9yIGNoYW5nZWQsIHdlIG5lZWQgdG8gZm9yd2FyZCB0aGlzIHRvXG5cdFx0XHQvLyB0aXRsZSBjb250cm9sIGFuZCBhbHNvIG1ha2Ugc3VyZSB0byBlbWl0IHRoaXMgYXMgYW4gZXZlbnRcblx0XHRcdGNvbnN0IG5ld0luZGV4T2ZFZGl0b3IgPSB0aGlzLmdldEluZGV4T2ZFZGl0b3IoZWRpdG9yKTtcblx0XHRcdGlmIChuZXdJbmRleE9mRWRpdG9yICE9PSBvbGRJbmRleE9mRWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMudGl0bGVDb250cm9sLm1vdmVFZGl0b3IoZWRpdG9yLCBvbGRJbmRleE9mRWRpdG9yLCBuZXdJbmRleE9mRWRpdG9yLCB0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRm9yd2FyZCBzdGlja3kgc3RhdGUgdG8gdGl0bGUgY29udHJvbFxuXHRcdFx0aWYgKHN0aWNreSkge1xuXHRcdFx0XHR0aGlzLnRpdGxlQ29udHJvbC5zdGlja0VkaXRvcihlZGl0b3IpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy50aXRsZUNvbnRyb2wudW5zdGlja0VkaXRvcihlZGl0b3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBvcGVuRWRpdG9yKClcblxuXHRhc3luYyBvcGVuRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQsIG9wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucywgaW50ZXJuYWxPcHRpb25zPzogSUludGVybmFsRWRpdG9yT3Blbk9wdGlvbnMpOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZG9PcGVuRWRpdG9yKGVkaXRvciwgb3B0aW9ucywge1xuXHRcdFx0Ly8gQXBwcGx5IGdpdmVuIGludGVybmFsIG9wZW4gb3B0aW9uc1xuXHRcdFx0Li4uaW50ZXJuYWxPcHRpb25zLFxuXHRcdFx0Ly8gQWxsb3cgdG8gbWF0Y2ggb24gYSBzaWRlLWJ5LXNpZGUgZWRpdG9yIHdoZW4gc2FtZVxuXHRcdFx0Ly8gZWRpdG9yIGlzIG9wZW5lZCBvbiBib3RoIHNpZGVzLiBJbiB0aGF0IGNhc2Ugd2Vcblx0XHRcdC8vIGRvIG5vdCB3YW50IHRvIG9wZW4gYSBuZXcgZWRpdG9yIGJ1dCByZXVzZSB0aGF0IG9uZS5cblx0XHRcdHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkJPVEhcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9PcGVuRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQsIG9wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucywgaW50ZXJuYWxPcHRpb25zPzogSUludGVybmFsRWRpdG9yT3Blbk9wdGlvbnMpOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cblx0XHQvLyBHdWFyZCBhZ2FpbnN0IGludmFsaWQgZWRpdG9ycy4gRGlzcG9zZWQgZWRpdG9yc1xuXHRcdC8vIHNob3VsZCBuZXZlciBvcGVuIGJlY2F1c2UgdGhleSBlbWl0IG5vIGV2ZW50c1xuXHRcdC8vIGUuZy4gdG8gaW5kaWNhdGUgZGlydHkgY2hhbmdlcy5cblx0XHRpZiAoIWVkaXRvciB8fCBlZGl0b3IuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRmlyZSB0aGUgZXZlbnQgbGV0dGluZyBldmVyeW9uZSBrbm93IHdlIGFyZSBhYm91dCB0byBvcGVuIGFuIGVkaXRvclxuXHRcdHRoaXMuX29uV2lsbE9wZW5FZGl0b3IuZmlyZSh7IGVkaXRvciwgZ3JvdXBJZDogdGhpcy5pZCB9KTtcblxuXHRcdC8vIERldGVybWluZSBvcHRpb25zXG5cdFx0Y29uc3QgcGlubmVkID0gb3B0aW9ucz8uc3RpY2t5XG5cdFx0XHR8fCAoIXRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucy5lbmFibGVQcmV2aWV3ICYmICFvcHRpb25zPy50cmFuc2llbnQpXG5cdFx0XHR8fCBlZGl0b3IuaXNEaXJ0eSgpXG5cdFx0XHR8fCAob3B0aW9ucz8ucGlubmVkID8/IHR5cGVvZiBvcHRpb25zPy5pbmRleCA9PT0gJ251bWJlcicgLyogdW5sZXNzIHNwZWNpZmllZCwgcHJlZmVyIHRvIHBpbiB3aGVuIG9wZW5pbmcgd2l0aCBpbmRleCAqLylcblx0XHRcdHx8ICh0eXBlb2Ygb3B0aW9ucz8uaW5kZXggPT09ICdudW1iZXInICYmIHRoaXMubW9kZWwuaXNTdGlja3kob3B0aW9ucy5pbmRleCkpXG5cdFx0XHR8fCBlZGl0b3IuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5TY3JhdGNocGFkKTtcblx0XHRjb25zdCBvcGVuRWRpdG9yT3B0aW9uczogSUVkaXRvck9wZW5PcHRpb25zID0ge1xuXHRcdFx0aW5kZXg6IG9wdGlvbnMgPyBvcHRpb25zLmluZGV4IDogdW5kZWZpbmVkLFxuXHRcdFx0cGlubmVkLFxuXHRcdFx0c3RpY2t5OiBvcHRpb25zPy5zdGlja3kgfHwgKHR5cGVvZiBvcHRpb25zPy5pbmRleCA9PT0gJ251bWJlcicgJiYgdGhpcy5tb2RlbC5pc1N0aWNreShvcHRpb25zLmluZGV4KSksXG5cdFx0XHR0cmFuc2llbnQ6ICEhb3B0aW9ucz8udHJhbnNpZW50LFxuXHRcdFx0aW5hY3RpdmVTZWxlY3Rpb246IGludGVybmFsT3B0aW9ucz8uaW5hY3RpdmVTZWxlY3Rpb24sXG5cdFx0XHRhY3RpdmU6IHRoaXMuY291bnQgPT09IDAgfHwgIW9wdGlvbnM/LmluYWN0aXZlLFxuXHRcdFx0c3VwcG9ydFNpZGVCeVNpZGU6IGludGVybmFsT3B0aW9ucz8uc3VwcG9ydFNpZGVCeVNpZGVcblx0XHR9O1xuXG5cdFx0aWYgKCFvcGVuRWRpdG9yT3B0aW9ucy5hY3RpdmUgJiYgIW9wZW5FZGl0b3JPcHRpb25zLnBpbm5lZCAmJiB0aGlzLm1vZGVsLmFjdGl2ZUVkaXRvciAmJiAhdGhpcy5tb2RlbC5pc1Bpbm5lZCh0aGlzLm1vZGVsLmFjdGl2ZUVkaXRvcikpIHtcblx0XHRcdC8vIFNwZWNpYWwgY2FzZTogd2UgYXJlIHRvIG9wZW4gYW4gZWRpdG9yIGluYWN0aXZlIGFuZCBub3QgcGlubmVkLCBidXQgdGhlIGN1cnJlbnQgYWN0aXZlXG5cdFx0XHQvLyBlZGl0b3IgaXMgYWxzbyBub3QgcGlubmVkLCB3aGljaCBtZWFucyBpdCB3aWxsIGdldCByZXBsYWNlZCB3aXRoIHRoaXMgb25lLiBBcyBzdWNoLFxuXHRcdFx0Ly8gdGhlIGVkaXRvciBjYW4gb25seSBiZSBhY3RpdmUuXG5cdFx0XHRvcGVuRWRpdG9yT3B0aW9ucy5hY3RpdmUgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGxldCBhY3RpdmF0ZUdyb3VwID0gZmFsc2U7XG5cdFx0bGV0IHJlc3RvcmVHcm91cCA9IGZhbHNlO1xuXG5cdFx0aWYgKG9wdGlvbnM/LmFjdGl2YXRpb24gPT09IEVkaXRvckFjdGl2YXRpb24uQUNUSVZBVEUpIHtcblx0XHRcdC8vIFJlc3BlY3Qgb3B0aW9uIHRvIGZvcmNlIGFjdGl2YXRlIGFuIGVkaXRvciBncm91cC5cblx0XHRcdGFjdGl2YXRlR3JvdXAgPSB0cnVlO1xuXHRcdH0gZWxzZSBpZiAob3B0aW9ucz8uYWN0aXZhdGlvbiA9PT0gRWRpdG9yQWN0aXZhdGlvbi5SRVNUT1JFKSB7XG5cdFx0XHQvLyBSZXNwZWN0IG9wdGlvbiB0byBmb3JjZSByZXN0b3JlIGFuIGVkaXRvciBncm91cC5cblx0XHRcdHJlc3RvcmVHcm91cCA9IHRydWU7XG5cdFx0fSBlbHNlIGlmIChvcHRpb25zPy5hY3RpdmF0aW9uID09PSBFZGl0b3JBY3RpdmF0aW9uLlBSRVNFUlZFKSB7XG5cdFx0XHQvLyBSZXNwZWN0IG9wdGlvbiB0byBwcmVzZXJ2ZSBhY3RpdmUgZWRpdG9yIGdyb3VwLlxuXHRcdFx0YWN0aXZhdGVHcm91cCA9IGZhbHNlO1xuXHRcdFx0cmVzdG9yZUdyb3VwID0gZmFsc2U7XG5cdFx0fSBlbHNlIGlmIChvcGVuRWRpdG9yT3B0aW9ucy5hY3RpdmUpIHtcblx0XHRcdC8vIEZpbmFsbHksIHdlIG9ubHkgYWN0aXZhdGUvcmVzdG9yZSBhbiBlZGl0b3Igd2hpY2ggaXNcblx0XHRcdC8vIG9wZW5pbmcgYXMgYWN0aXZlIGVkaXRvci5cblx0XHRcdC8vIElmIHByZXNlcnZlRm9jdXMgaXMgZW5hYmxlZCwgd2Ugb25seSByZXN0b3JlIGJ1dCBuZXZlclxuXHRcdFx0Ly8gYWN0aXZhdGUgdGhlIGdyb3VwLlxuXHRcdFx0YWN0aXZhdGVHcm91cCA9ICFvcHRpb25zPy5wcmVzZXJ2ZUZvY3VzO1xuXHRcdFx0cmVzdG9yZUdyb3VwID0gIWFjdGl2YXRlR3JvdXA7XG5cdFx0fVxuXG5cdFx0Ly8gQWN0dWFsbHkgbW92ZSB0aGUgZWRpdG9yIGlmIGEgc3BlY2lmaWMgaW5kZXggaXMgcHJvdmlkZWQgYW5kIHdlIGZpZ3VyZVxuXHRcdC8vIG91dCB0aGF0IHRoZSBlZGl0b3IgaXMgYWxyZWFkeSBvcGVuZWQgYXQgYSBkaWZmZXJlbnQgaW5kZXguIFRoaXNcblx0XHQvLyBlbnN1cmVzIHRoZSByaWdodCBzZXQgb2YgZXZlbnRzIGFyZSBmaXJlZCB0byB0aGUgb3V0c2lkZS5cblx0XHRpZiAodHlwZW9mIG9wZW5FZGl0b3JPcHRpb25zLmluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0Y29uc3QgaW5kZXhPZkVkaXRvciA9IHRoaXMubW9kZWwuaW5kZXhPZihlZGl0b3IpO1xuXHRcdFx0aWYgKGluZGV4T2ZFZGl0b3IgIT09IC0xICYmIGluZGV4T2ZFZGl0b3IgIT09IG9wZW5FZGl0b3JPcHRpb25zLmluZGV4KSB7XG5cdFx0XHRcdHRoaXMuZG9Nb3ZlRWRpdG9ySW5zaWRlR3JvdXAoZWRpdG9yLCBvcGVuRWRpdG9yT3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIG1vZGVsIGFuZCBtYWtlIHN1cmUgdG8gY29udGludWUgdG8gdXNlIHRoZSBlZGl0b3Igd2UgZ2V0IGZyb21cblx0XHQvLyB0aGUgbW9kZWwuIEl0IGlzIHBvc3NpYmxlIHRoYXQgdGhlIGVkaXRvciB3YXMgYWxyZWFkeSBvcGVuZWQgYW5kIHdlXG5cdFx0Ly8gd2FudCB0byBlbnN1cmUgdGhhdCB3ZSB1c2UgdGhlIGV4aXN0aW5nIGluc3RhbmNlIGluIHRoYXQgY2FzZS5cblx0XHRjb25zdCB7IGVkaXRvcjogb3BlbmVkRWRpdG9yLCBpc05ldyB9ID0gdGhpcy5tb2RlbC5vcGVuRWRpdG9yKGVkaXRvciwgb3BlbkVkaXRvck9wdGlvbnMpO1xuXG5cdFx0Ly8gQ29uZGl0aW9uYWxseSBsb2NrIHRoZSBncm91cFxuXHRcdGlmIChcblx0XHRcdGlzTmV3ICYmXHRcdFx0XHRcdFx0XHRcdC8vIG9ubHkgaWYgdGhpcyBlZGl0b3Igd2FzIG5ldyBmb3IgdGhlIGdyb3VwXG5cdFx0XHR0aGlzLmNvdW50ID09PSAxICYmXHRcdFx0XHRcdFx0Ly8gb25seSB3aGVuIHRoaXMgZWRpdG9yIHdhcyB0aGUgZmlyc3QgZWRpdG9yIGluIHRoZSBncm91cFxuXHRcdFx0dGhpcy5lZGl0b3JQYXJ0c1ZpZXcuZ3JvdXBzLmxlbmd0aCA+IDEgXHQvLyBvbmx5IGFsbG93IGF1dG8gbG9ja2luZyBpZiBtb3JlIHRoYW4gMSBncm91cCBpcyBvcGVuZWRcblx0XHQpIHtcblx0XHRcdC8vIG9ubHkgd2hlbiB0aGUgZWRpdG9yIGlkZW50aWZpZXIgaXMgY29uZmlndXJlZCBhcyBzdWNoXG5cdFx0XHRpZiAob3BlbmVkRWRpdG9yLmVkaXRvcklkICYmIHRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucy5hdXRvTG9ja0dyb3Vwcz8uaGFzKG9wZW5lZEVkaXRvci5lZGl0b3JJZCkpIHtcblx0XHRcdFx0dGhpcy5sb2NrKHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNob3cgZWRpdG9yXG5cdFx0Y29uc3Qgc2hvd0VkaXRvclJlc3VsdCA9IHRoaXMuZG9TaG93RWRpdG9yKG9wZW5lZEVkaXRvciwgeyBhY3RpdmU6ICEhb3BlbkVkaXRvck9wdGlvbnMuYWN0aXZlLCBpc05ldyB9LCBvcHRpb25zLCBpbnRlcm5hbE9wdGlvbnMpO1xuXG5cdFx0Ly8gRmluYWxseSBtYWtlIHN1cmUgdGhlIGdyb3VwIGlzIGFjdGl2ZSBvciByZXN0b3JlZCBhcyBpbnN0cnVjdGVkXG5cdFx0aWYgKGFjdGl2YXRlR3JvdXApIHtcblx0XHRcdHRoaXMuZ3JvdXBzVmlldy5hY3RpdmF0ZUdyb3VwKHRoaXMpO1xuXHRcdH0gZWxzZSBpZiAocmVzdG9yZUdyb3VwKSB7XG5cdFx0XHR0aGlzLmdyb3Vwc1ZpZXcucmVzdG9yZUdyb3VwKHRoaXMpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzaG93RWRpdG9yUmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBkb1Nob3dFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCwgY29udGV4dDogeyBhY3RpdmU6IGJvb2xlYW47IGlzTmV3OiBib29sZWFuIH0sIG9wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucywgaW50ZXJuYWxPcHRpb25zPzogSUludGVybmFsRWRpdG9yT3Blbk9wdGlvbnMpOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cblx0XHQvLyBTaG93IGluIGVkaXRvciBjb250cm9sIGlmIHRoZSBhY3RpdmUgZWRpdG9yIGNoYW5nZWRcblx0XHRsZXQgb3BlbkVkaXRvclByb21pc2U6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+O1xuXHRcdGlmIChjb250ZXh0LmFjdGl2ZSkge1xuXHRcdFx0b3BlbkVkaXRvclByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IHBhbmUsIGNoYW5nZWQsIGNhbmNlbGxlZCwgZXJyb3IgfSA9IGF3YWl0IHRoaXMuZWRpdG9yUGFuZS5vcGVuRWRpdG9yKGVkaXRvciwgb3B0aW9ucywgaW50ZXJuYWxPcHRpb25zLCB7IG5ld0luR3JvdXA6IGNvbnRleHQuaXNOZXcgfSk7XG5cblx0XHRcdFx0Ly8gUmV0dXJuIGVhcmx5IGlmIHRoZSBvcGVyYXRpb24gd2FzIGNhbmNlbGxlZCBieSBhbm90aGVyIG9wZXJhdGlvblxuXHRcdFx0XHRpZiAoY2FuY2VsbGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEVkaXRvciBjaGFuZ2UgZXZlbnRcblx0XHRcdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKHsgZWRpdG9yLCBpc0V4cGxpY2l0OiBvcHRpb25zPy5pc0V4cGxpY2l0IH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSW5kaWNhdGUgZXJyb3IgYXMgYW4gZXZlbnQgYnV0IGRvIG5vdCBidWJibGUgdGhlbSB1cFxuXHRcdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZE9wZW5FZGl0b3JGYWlsLmZpcmUoZWRpdG9yKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFdpdGhvdXQgYW4gZWRpdG9yIHBhbmUsIHJlY292ZXIgYnkgY2xvc2luZyB0aGUgYWN0aXZlIGVkaXRvclxuXHRcdFx0XHQvLyAoaWYgdGhlIGlucHV0IGlzIHN0aWxsIHRoZSBhY3RpdmUgb25lKVxuXHRcdFx0XHRpZiAoIXBhbmUgJiYgdGhpcy5hY3RpdmVFZGl0b3IgPT09IGVkaXRvcikge1xuXHRcdFx0XHRcdHRoaXMuZG9DbG9zZUVkaXRvcihlZGl0b3IsIG9wdGlvbnM/LnByZXNlcnZlRm9jdXMsIHsgZnJvbUVycm9yOiB0cnVlIH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHBhbmU7XG5cdFx0XHR9KSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRvcGVuRWRpdG9yUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpOyAvLyBpbmFjdGl2ZTogcmV0dXJuIHVuZGVmaW5lZCBhcyByZXN1bHQgdG8gc2lnbmFsIHRoaXNcblx0XHR9XG5cblx0XHQvLyBTaG93IGluIHRpdGxlIGNvbnRyb2wgYWZ0ZXIgZWRpdG9yIGNvbnRyb2wgYmVjYXVzZSBzb21lIGFjdGlvbnMgZGVwZW5kIG9uIGl0XG5cdFx0Ly8gYnV0IHJlc3BlY3QgdGhlIGludGVybmFsIG9wdGlvbnMgaW4gY2FzZSB0aXRsZSBjb250cm9sIHVwZGF0ZXMgc2hvdWxkIHNraXAuXG5cdFx0aWYgKCFpbnRlcm5hbE9wdGlvbnM/LnNraXBUaXRsZVVwZGF0ZSkge1xuXHRcdFx0dGhpcy50aXRsZUNvbnRyb2wub3BlbkVkaXRvcihlZGl0b3IsIGludGVybmFsT3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG9wZW5FZGl0b3JQcm9taXNlO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIG9wZW5FZGl0b3JzKClcblxuXHRhc3luYyBvcGVuRWRpdG9ycyhlZGl0b3JzOiB7IGVkaXRvcjogRWRpdG9ySW5wdXQ7IG9wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucyB9W10pOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cblx0XHQvLyBHdWFyZCBhZ2FpbnN0IGludmFsaWQgZWRpdG9ycy4gRGlzcG9zZWQgZWRpdG9yc1xuXHRcdC8vIHNob3VsZCBuZXZlciBvcGVuIGJlY2F1c2UgdGhleSBlbWl0IG5vIGV2ZW50c1xuXHRcdC8vIGUuZy4gdG8gaW5kaWNhdGUgZGlydHkgY2hhbmdlcy5cblx0XHRjb25zdCBlZGl0b3JzVG9PcGVuID0gY29hbGVzY2UoZWRpdG9ycykuZmlsdGVyKCh7IGVkaXRvciB9KSA9PiAhZWRpdG9yLmlzRGlzcG9zZWQoKSk7XG5cblx0XHQvLyBVc2UgdGhlIGZpcnN0IGVkaXRvciBhcyBhY3RpdmUgZWRpdG9yXG5cdFx0Y29uc3QgZmlyc3RFZGl0b3IgPSBlZGl0b3JzVG9PcGVuLmF0KDApO1xuXHRcdGlmICghZmlyc3RFZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvcGVuRWRpdG9yc09wdGlvbnM6IElJbnRlcm5hbEVkaXRvck9wZW5PcHRpb25zID0ge1xuXHRcdFx0Ly8gQWxsb3cgdG8gbWF0Y2ggb24gYSBzaWRlLWJ5LXNpZGUgZWRpdG9yIHdoZW4gc2FtZVxuXHRcdFx0Ly8gZWRpdG9yIGlzIG9wZW5lZCBvbiBib3RoIHNpZGVzLiBJbiB0aGF0IGNhc2Ugd2Vcblx0XHRcdC8vIGRvIG5vdCB3YW50IHRvIG9wZW4gYSBuZXcgZWRpdG9yIGJ1dCByZXVzZSB0aGF0IG9uZS5cblx0XHRcdHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkJPVEhcblx0XHR9O1xuXG5cdFx0YXdhaXQgdGhpcy5kb09wZW5FZGl0b3IoZmlyc3RFZGl0b3IuZWRpdG9yLCBmaXJzdEVkaXRvci5vcHRpb25zLCBvcGVuRWRpdG9yc09wdGlvbnMpO1xuXG5cdFx0Ly8gT3BlbiB0aGUgb3RoZXIgb25lcyBpbmFjdGl2ZVxuXHRcdGNvbnN0IGluYWN0aXZlRWRpdG9ycyA9IGVkaXRvcnNUb09wZW4uc2xpY2UoMSk7XG5cdFx0Y29uc3Qgc3RhcnRpbmdJbmRleCA9IHRoaXMuZ2V0SW5kZXhPZkVkaXRvcihmaXJzdEVkaXRvci5lZGl0b3IpICsgMTtcblx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKGluYWN0aXZlRWRpdG9ycy5tYXAoKHsgZWRpdG9yLCBvcHRpb25zIH0sIGluZGV4KSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb09wZW5FZGl0b3IoZWRpdG9yLCB7XG5cdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdGluYWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRwaW5uZWQ6IHRydWUsXG5cdFx0XHRcdGluZGV4OiBzdGFydGluZ0luZGV4ICsgaW5kZXhcblx0XHRcdH0sIHtcblx0XHRcdFx0Li4ub3BlbkVkaXRvcnNPcHRpb25zLFxuXHRcdFx0XHQvLyBvcHRpbWl6YXRpb246IHVwZGF0ZSB0aGUgdGl0bGUgY29udHJvbCBsYXRlclxuXHRcdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTMwNjM0XG5cdFx0XHRcdHNraXBUaXRsZVVwZGF0ZTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVXBkYXRlIHRoZSB0aXRsZSBjb250cm9sIGFsbCBhdCBvbmNlIHdpdGggYWxsIGVkaXRvcnNcblx0XHR0aGlzLnRpdGxlQ29udHJvbC5vcGVuRWRpdG9ycyhpbmFjdGl2ZUVkaXRvcnMubWFwKCh7IGVkaXRvciB9KSA9PiBlZGl0b3IpKTtcblxuXHRcdC8vIE9wZW5pbmcgbWFueSBlZGl0b3JzIGF0IG9uY2UgY2FuIHB1dCBhbnkgZWRpdG9yIHRvIGJlXG5cdFx0Ly8gdGhlIGFjdGl2ZSBvbmUgZGVwZW5kaW5nIG9uIG9wdGlvbnMuIEFzIHN1Y2gsIHdlIHNpbXBseVxuXHRcdC8vIHJldHVybiB0aGUgYWN0aXZlIGVkaXRvciBwYW5lIGFmdGVyIHRoaXMgb3BlcmF0aW9uLlxuXHRcdHJldHVybiB0aGlzLmVkaXRvclBhbmUuYWN0aXZlRWRpdG9yUGFuZSA/PyB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gbW92ZUVkaXRvcigpXG5cblx0bW92ZUVkaXRvcnMoZWRpdG9yczogeyBlZGl0b3I6IEVkaXRvcklucHV0OyBvcHRpb25zPzogSUVkaXRvck9wdGlvbnMgfVtdLCB0YXJnZXQ6IEVkaXRvckdyb3VwVmlldyk6IGJvb2xlYW4ge1xuXG5cdFx0Ly8gT3B0aW1pemF0aW9uOiBrbm93aW5nIHRoYXQgd2UgbW92ZSBtYW55IGVkaXRvcnMsIHdlXG5cdFx0Ly8gZGVsYXkgdGhlIHRpdGxlIHVwZGF0ZSB0byBhIGxhdGVyIHBvaW50IGZvciB0aGlzIGdyb3VwXG5cdFx0Ly8gdGhyb3VnaCBhIG1ldGhvZCB0aGF0IGFsbG93cyBmb3IgYnVsayB1cGRhdGVzIGJ1dCBvbmx5XG5cdFx0Ly8gd2hlbiBtb3ZpbmcgdG8gYSBkaWZmZXJlbnQgZ3JvdXAgd2hlcmUgbWFueSBlZGl0b3JzXG5cdFx0Ly8gYXJlIG1vcmUgbGlrZWx5IHRvIG9jY3VyLlxuXHRcdGNvbnN0IGludGVybmFsT3B0aW9uczogSUludGVybmFsTW92ZUNvcHlPcHRpb25zID0ge1xuXHRcdFx0c2tpcFRpdGxlVXBkYXRlOiB0aGlzICE9PSB0YXJnZXRcblx0XHR9O1xuXG5cdFx0bGV0IG1vdmVGYWlsZWQgPSBmYWxzZTtcblxuXHRcdGNvbnN0IG1vdmVkRWRpdG9ycyA9IG5ldyBTZXQ8RWRpdG9ySW5wdXQ+KCk7XG5cdFx0Zm9yIChjb25zdCB7IGVkaXRvciwgb3B0aW9ucyB9IG9mIGVkaXRvcnMpIHtcblx0XHRcdGlmICh0aGlzLm1vdmVFZGl0b3IoZWRpdG9yLCB0YXJnZXQsIG9wdGlvbnMsIGludGVybmFsT3B0aW9ucykpIHtcblx0XHRcdFx0bW92ZWRFZGl0b3JzLmFkZChlZGl0b3IpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bW92ZUZhaWxlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRoZSB0aXRsZSBjb250cm9sIGFsbCBhdCBvbmNlIHdpdGggYWxsIGVkaXRvcnNcblx0XHQvLyBpbiBzb3VyY2UgYW5kIHRhcmdldCBpZiB0aGUgdGl0bGUgdXBkYXRlIHdhcyBza2lwcGVkXG5cdFx0aWYgKGludGVybmFsT3B0aW9ucy5za2lwVGl0bGVVcGRhdGUpIHtcblx0XHRcdHRhcmdldC50aXRsZUNvbnRyb2wub3BlbkVkaXRvcnMoQXJyYXkuZnJvbShtb3ZlZEVkaXRvcnMpKTtcblx0XHRcdHRoaXMudGl0bGVDb250cm9sLmNsb3NlRWRpdG9ycyhBcnJheS5mcm9tKG1vdmVkRWRpdG9ycykpO1xuXHRcdH1cblxuXHRcdHJldHVybiAhbW92ZUZhaWxlZDtcblx0fVxuXG5cdG1vdmVFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCwgdGFyZ2V0OiBFZGl0b3JHcm91cFZpZXcsIG9wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucywgaW50ZXJuYWxPcHRpb25zPzogSUludGVybmFsTW92ZUNvcHlPcHRpb25zKTogYm9vbGVhbiB7XG5cblx0XHQvLyBNb3ZlIHdpdGhpbiBzYW1lIGdyb3VwXG5cdFx0aWYgKHRoaXMgPT09IHRhcmdldCkge1xuXHRcdFx0dGhpcy5kb01vdmVFZGl0b3JJbnNpZGVHcm91cChlZGl0b3IsIG9wdGlvbnMpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gTW92ZSBhY3Jvc3MgZ3JvdXBzXG5cdFx0ZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb01vdmVPckNvcHlFZGl0b3JBY3Jvc3NHcm91cHMoZWRpdG9yLCB0YXJnZXQsIG9wdGlvbnMsIHsgLi4uaW50ZXJuYWxPcHRpb25zLCBrZWVwQ29weTogZmFsc2UgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb01vdmVFZGl0b3JJbnNpZGVHcm91cChjYW5kaWRhdGU6IEVkaXRvcklucHV0LCBvcHRpb25zPzogSUVkaXRvck9wZW5PcHRpb25zKTogdm9pZCB7XG5cdFx0Y29uc3QgbW92ZVRvSW5kZXggPSBvcHRpb25zID8gb3B0aW9ucy5pbmRleCA6IHVuZGVmaW5lZDtcblx0XHRpZiAodHlwZW9mIG1vdmVUb0luZGV4ICE9PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuOyAvLyBkbyBub3RoaW5nIGlmIHdlIG1vdmUgaW50byBzYW1lIGdyb3VwIHdpdGhvdXQgaW5kZXhcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgbW9kZWwgYW5kIG1ha2Ugc3VyZSB0byBjb250aW51ZSB0byB1c2UgdGhlIGVkaXRvciB3ZSBnZXQgZnJvbVxuXHRcdC8vIHRoZSBtb2RlbC4gSXQgaXMgcG9zc2libGUgdGhhdCB0aGUgZWRpdG9yIHdhcyBhbHJlYWR5IG9wZW5lZCBhbmQgd2Vcblx0XHQvLyB3YW50IHRvIGVuc3VyZSB0aGF0IHdlIHVzZSB0aGUgZXhpc3RpbmcgaW5zdGFuY2UgaW4gdGhhdCBjYXNlLlxuXHRcdGNvbnN0IGN1cnJlbnRJbmRleCA9IHRoaXMubW9kZWwuaW5kZXhPZihjYW5kaWRhdGUpO1xuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMubW9kZWwuZ2V0RWRpdG9yQnlJbmRleChjdXJyZW50SW5kZXgpO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTW92ZSB3aGVuIGluZGV4IGhhcyBhY3R1YWxseSBjaGFuZ2VkXG5cdFx0aWYgKGN1cnJlbnRJbmRleCAhPT0gbW92ZVRvSW5kZXgpIHtcblx0XHRcdGNvbnN0IG9sZFN0aWNreUNvdW50ID0gdGhpcy5tb2RlbC5zdGlja3lDb3VudDtcblxuXHRcdFx0Ly8gVXBkYXRlIG1vZGVsXG5cdFx0XHR0aGlzLm1vZGVsLm1vdmVFZGl0b3IoZWRpdG9yLCBtb3ZlVG9JbmRleCk7XG5cdFx0XHR0aGlzLm1vZGVsLnBpbihlZGl0b3IpO1xuXG5cdFx0XHQvLyBGb3J3YXJkIHRvIHRpdGxlIGNvbnRyb2xcblx0XHRcdHRoaXMudGl0bGVDb250cm9sLm1vdmVFZGl0b3IoZWRpdG9yLCBjdXJyZW50SW5kZXgsIG1vdmVUb0luZGV4LCBvbGRTdGlja3lDb3VudCAhPT0gdGhpcy5tb2RlbC5zdGlja3lDb3VudCk7XG5cdFx0XHR0aGlzLnRpdGxlQ29udHJvbC5waW5FZGl0b3IoZWRpdG9yKTtcblx0XHR9XG5cblx0XHQvLyBTdXBwb3J0IHRoZSBvcHRpb24gdG8gc3RpY2sgdGhlIGVkaXRvciBldmVuIGlmIGl0IGlzIG1vdmVkLlxuXHRcdC8vIEl0IGlzIGltcG9ydGFudCB0aGF0IHdlIGNhbGwgdGhpcyBtZXRob2QgYWZ0ZXIgd2UgaGF2ZSBtb3ZlZFxuXHRcdC8vIHRoZSBlZGl0b3IgYmVjYXVzZSB0aGUgcmVzdWx0IG9mIG1vdmluZyB0aGUgZWRpdG9yIGNvdWxkIGhhdmVcblx0XHQvLyBjYXVzZWQgYSBjaGFuZ2UgaW4gc3RpY2t5IHN0YXRlLlxuXHRcdGlmIChvcHRpb25zPy5zdGlja3kpIHtcblx0XHRcdHRoaXMuc3RpY2tFZGl0b3IoZWRpdG9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRvTW92ZU9yQ29weUVkaXRvckFjcm9zc0dyb3VwcyhlZGl0b3I6IEVkaXRvcklucHV0LCB0YXJnZXQ6IEVkaXRvckdyb3VwVmlldywgb3Blbk9wdGlvbnM/OiBJRWRpdG9yT3Blbk9wdGlvbnMsIGludGVybmFsT3B0aW9ucz86IElJbnRlcm5hbE1vdmVDb3B5T3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGtlZXBDb3B5ID0gaW50ZXJuYWxPcHRpb25zPy5rZWVwQ29weTtcblxuXHRcdC8vIFZhbGlkYXRlIHRoYXQgd2UgY2FuIG1vdmVcblx0XHRpZiAoIWtlZXBDb3B5IHx8IGVkaXRvci5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlNpbmdsZXRvbikgLyogc2luZ2xldG9uIGVkaXRvcnMgd2lsbCBhbHdheXMgbW92ZSAqLykge1xuXHRcdFx0Y29uc3QgY2FuTW92ZVZldG8gPSBlZGl0b3IuY2FuTW92ZSh0aGlzLmlkLCB0YXJnZXQuaWQpO1xuXHRcdFx0aWYgKHR5cGVvZiBjYW5Nb3ZlVmV0byA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0dGhpcy5kaWFsb2dTZXJ2aWNlLmVycm9yKGNhbk1vdmVWZXRvLCBsb2NhbGl6ZSgnbW92ZUVycm9yRGV0YWlscycsIFwiVHJ5IHNhdmluZyBvciByZXZlcnRpbmcgdGhlIGVkaXRvciBmaXJzdCBhbmQgdGhlbiB0cnkgYWdhaW4uXCIpKTtcblxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiBtb3ZpbmcvY29weWluZyBhbiBlZGl0b3IsIHRyeSB0byBwcmVzZXJ2ZSBhcyBtdWNoIHZpZXcgc3RhdGUgYXMgcG9zc2libGVcblx0XHQvLyBieSBjaGVja2luZyBmb3IgdGhlIGVkaXRvciB0byBiZSBhIHRleHQgZWRpdG9yIGFuZCBjcmVhdGluZyB0aGUgb3B0aW9ucyBhY2NvcmRpbmdseVxuXHRcdC8vIGlmIHNvXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGZpbGxBY3RpdmVFZGl0b3JWaWV3U3RhdGUodGhpcywgZWRpdG9yLCB7XG5cdFx0XHQuLi5vcGVuT3B0aW9ucyxcblx0XHRcdHBpbm5lZDogdHJ1ZSwgXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQvLyBhbHdheXMgcGluIG1vdmVkIGVkaXRvclxuXHRcdFx0c3RpY2t5OiBvcGVuT3B0aW9ucz8uc3RpY2t5ID8/ICgha2VlcENvcHkgJiYgdGhpcy5tb2RlbC5pc1N0aWNreShlZGl0b3IpKVx0Ly8gcHJlc2VydmUgc3RpY2t5IHN0YXRlIG9ubHkgaWYgZWRpdG9yIGlzIG1vdmVkIG9yIGV4cGxpY2l0bHkgd2FudGVkIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvOTkwMzUpXG5cdFx0fSk7XG5cblx0XHQvLyBJbmRpY2F0ZSB3aWxsIG1vdmUgZXZlbnRcblx0XHRpZiAoIWtlZXBDb3B5KSB7XG5cdFx0XHR0aGlzLl9vbldpbGxNb3ZlRWRpdG9yLmZpcmUoe1xuXHRcdFx0XHRncm91cElkOiB0aGlzLmlkLFxuXHRcdFx0XHRlZGl0b3IsXG5cdFx0XHRcdHRhcmdldDogdGFyZ2V0LmlkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBBIG1vdmUgdG8gYW5vdGhlciBncm91cCBpcyBhbiBvcGVuIGZpcnN0Li4uXG5cdFx0dGFyZ2V0LmRvT3BlbkVkaXRvcihrZWVwQ29weSA/IGVkaXRvci5jb3B5KCkgOiBlZGl0b3IsIG9wdGlvbnMsIGludGVybmFsT3B0aW9ucyk7XG5cblx0XHQvLyAuLi5hbmQgYSBjbG9zZSBhZnRlcndhcmRzICh1bmxlc3Mgd2UgY29weSlcblx0XHRpZiAoIWtlZXBDb3B5KSB7XG5cdFx0XHR0aGlzLmRvQ2xvc2VFZGl0b3IoZWRpdG9yLCB0cnVlIC8qIGRvIG5vdCBmb2N1cyBuZXh0IG9uZSBiZWhpbmQgaWYgYW55ICovLCB7IC4uLmludGVybmFsT3B0aW9ucywgY29udGV4dDogRWRpdG9yQ2xvc2VDb250ZXh0Lk1PVkUgfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gY29weUVkaXRvcigpXG5cblx0Y29weUVkaXRvcnMoZWRpdG9yczogeyBlZGl0b3I6IEVkaXRvcklucHV0OyBvcHRpb25zPzogSUVkaXRvck9wdGlvbnMgfVtdLCB0YXJnZXQ6IEVkaXRvckdyb3VwVmlldyk6IHZvaWQge1xuXG5cdFx0Ly8gT3B0aW1pemF0aW9uOiBrbm93aW5nIHRoYXQgd2UgbW92ZSBtYW55IGVkaXRvcnMsIHdlXG5cdFx0Ly8gZGVsYXkgdGhlIHRpdGxlIHVwZGF0ZSB0byBhIGxhdGVyIHBvaW50IGZvciB0aGlzIGdyb3VwXG5cdFx0Ly8gdGhyb3VnaCBhIG1ldGhvZCB0aGF0IGFsbG93cyBmb3IgYnVsayB1cGRhdGVzIGJ1dCBvbmx5XG5cdFx0Ly8gd2hlbiBtb3ZpbmcgdG8gYSBkaWZmZXJlbnQgZ3JvdXAgd2hlcmUgbWFueSBlZGl0b3JzXG5cdFx0Ly8gYXJlIG1vcmUgbGlrZWx5IHRvIG9jY3VyLlxuXHRcdGNvbnN0IGludGVybmFsT3B0aW9uczogSUludGVybmFsTW92ZUNvcHlPcHRpb25zID0ge1xuXHRcdFx0c2tpcFRpdGxlVXBkYXRlOiB0aGlzICE9PSB0YXJnZXRcblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCB7IGVkaXRvciwgb3B0aW9ucyB9IG9mIGVkaXRvcnMpIHtcblx0XHRcdHRoaXMuY29weUVkaXRvcihlZGl0b3IsIHRhcmdldCwgb3B0aW9ucywgaW50ZXJuYWxPcHRpb25zKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgdGhlIHRpdGxlIGNvbnRyb2wgYWxsIGF0IG9uY2Ugd2l0aCBhbGwgZWRpdG9yc1xuXHRcdC8vIGluIHRhcmdldCBpZiB0aGUgdGl0bGUgdXBkYXRlIHdhcyBza2lwcGVkXG5cdFx0aWYgKGludGVybmFsT3B0aW9ucy5za2lwVGl0bGVVcGRhdGUpIHtcblx0XHRcdGNvbnN0IGNvcGllZEVkaXRvcnMgPSBlZGl0b3JzLm1hcCgoeyBlZGl0b3IgfSkgPT4gZWRpdG9yKTtcblx0XHRcdHRhcmdldC50aXRsZUNvbnRyb2wub3BlbkVkaXRvcnMoY29waWVkRWRpdG9ycyk7XG5cdFx0fVxuXHR9XG5cblx0Y29weUVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0LCB0YXJnZXQ6IEVkaXRvckdyb3VwVmlldywgb3B0aW9ucz86IElFZGl0b3JPcHRpb25zLCBpbnRlcm5hbE9wdGlvbnM/OiBJSW50ZXJuYWxFZGl0b3JUaXRsZUNvbnRyb2xPcHRpb25zKTogdm9pZCB7XG5cblx0XHQvLyBNb3ZlIHdpdGhpbiBzYW1lIGdyb3VwIGJlY2F1c2Ugd2UgZG8gbm90IHN1cHBvcnQgdG8gc2hvdyB0aGUgc2FtZSBlZGl0b3Jcblx0XHQvLyBtdWx0aXBsZSB0aW1lcyBpbiB0aGUgc2FtZSBncm91cFxuXHRcdGlmICh0aGlzID09PSB0YXJnZXQpIHtcblx0XHRcdHRoaXMuZG9Nb3ZlRWRpdG9ySW5zaWRlR3JvdXAoZWRpdG9yLCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHQvLyBDb3B5IGFjcm9zcyBncm91cHNcblx0XHRlbHNlIHtcblx0XHRcdHRoaXMuZG9Nb3ZlT3JDb3B5RWRpdG9yQWNyb3NzR3JvdXBzKGVkaXRvciwgdGFyZ2V0LCBvcHRpb25zLCB7IC4uLmludGVybmFsT3B0aW9ucywga2VlcENvcHk6IHRydWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIGNsb3NlRWRpdG9yKClcblxuXHRhc3luYyBjbG9zZUVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkID0gdGhpcy5hY3RpdmVFZGl0b3IgfHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSUNsb3NlRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLmRvQ2xvc2VFZGl0b3JXaXRoQ29uZmlybWF0aW9uSGFuZGxpbmcoZWRpdG9yLCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9DbG9zZUVkaXRvcldpdGhDb25maXJtYXRpb25IYW5kbGluZyhlZGl0b3I6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkID0gdGhpcy5hY3RpdmVFZGl0b3IgfHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSUNsb3NlRWRpdG9yT3B0aW9ucywgaW50ZXJuYWxPcHRpb25zPzogSUludGVybmFsRWRpdG9yQ2xvc2VPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIW9wdGlvbnM/LmZvcmNlICYmICFpbnRlcm5hbE9wdGlvbnM/LmZvcmNlICYmIGVkaXRvci5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLkNhbm5vdENsb3NlKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBjb25maXJtYXRpb24gYW5kIHZldG9cblx0XHRjb25zdCB2ZXRvID0gYXdhaXQgdGhpcy5oYW5kbGVDbG9zZUNvbmZpcm1hdGlvbihbZWRpdG9yXSk7XG5cdFx0aWYgKHZldG8pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBEbyBjbG9zZVxuXHRcdHRoaXMuZG9DbG9zZUVkaXRvcihlZGl0b3IsIG9wdGlvbnM/LnByZXNlcnZlRm9jdXMsIGludGVybmFsT3B0aW9ucyk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgZG9DbG9zZUVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0LCBwcmVzZXJ2ZUZvY3VzID0gKHRoaXMuZ3JvdXBzVmlldy5hY3RpdmVHcm91cCAhPT0gdGhpcyksIGludGVybmFsT3B0aW9ucz86IElJbnRlcm5hbEVkaXRvckNsb3NlT3B0aW9ucyk6IHZvaWQge1xuXG5cdFx0Ly8gRm9yd2FyZCB0byB0aXRsZSBjb250cm9sIHVubGVzcyBza2lwcGVkIHZpYSBpbnRlcm5hbCBvcHRpb25zXG5cdFx0aWYgKCFpbnRlcm5hbE9wdGlvbnM/LnNraXBUaXRsZVVwZGF0ZSkge1xuXHRcdFx0dGhpcy50aXRsZUNvbnRyb2wuYmVmb3JlQ2xvc2VFZGl0b3IoZWRpdG9yKTtcblx0XHR9XG5cblx0XHQvLyBDbG9zaW5nIHRoZSBhY3RpdmUgZWRpdG9yIG9mIHRoZSBncm91cCBpcyBhIGJpdCBtb3JlIHdvcmtcblx0XHRpZiAodGhpcy5tb2RlbC5pc0FjdGl2ZShlZGl0b3IpKSB7XG5cdFx0XHR0aGlzLmRvQ2xvc2VBY3RpdmVFZGl0b3IocHJlc2VydmVGb2N1cywgaW50ZXJuYWxPcHRpb25zKTtcblx0XHR9XG5cblx0XHQvLyBDbG9zaW5nIGluYWN0aXZlIGVkaXRvciBpcyBqdXN0IGEgbW9kZWwgdXBkYXRlXG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLmRvQ2xvc2VJbmFjdGl2ZUVkaXRvcihlZGl0b3IsIGludGVybmFsT3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Ly8gRm9yd2FyZCB0byB0aXRsZSBjb250cm9sIHVubGVzcyBza2lwcGVkIHZpYSBpbnRlcm5hbCBvcHRpb25zXG5cdFx0aWYgKCFpbnRlcm5hbE9wdGlvbnM/LnNraXBUaXRsZVVwZGF0ZSkge1xuXHRcdFx0dGhpcy50aXRsZUNvbnRyb2wuY2xvc2VFZGl0b3IoZWRpdG9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRvQ2xvc2VBY3RpdmVFZGl0b3IocHJlc2VydmVGb2N1cyA9ICh0aGlzLmdyb3Vwc1ZpZXcuYWN0aXZlR3JvdXAgIT09IHRoaXMpLCBpbnRlcm5hbE9wdGlvbnM/OiBJSW50ZXJuYWxFZGl0b3JDbG9zZU9wdGlvbnMpOiB2b2lkIHtcblx0XHRjb25zdCBlZGl0b3JUb0Nsb3NlID0gdGhpcy5hY3RpdmVFZGl0b3I7XG5cdFx0Y29uc3QgcmVzdG9yZUZvY3VzID0gIXByZXNlcnZlRm9jdXMgJiYgdGhpcy5zaG91bGRSZXN0b3JlRm9jdXModGhpcy5lbGVtZW50KTtcblxuXHRcdC8vIE9wdGltaXphdGlvbjogaWYgd2UgYXJlIGFib3V0IHRvIGNsb3NlIHRoZSBsYXN0IGVkaXRvciBpbiB0aGlzIGdyb3VwIGFuZCBzZXR0aW5nc1xuXHRcdC8vIGFyZSBjb25maWd1cmVkIHRvIGNsb3NlIHRoZSBncm91cCBzaW5jZSBpdCB3aWxsIGJlIGVtcHR5LCB3ZSBmaXJzdCBzZXQgdGhlIGxhc3Rcblx0XHQvLyBhY3RpdmUgZ3JvdXAgYXMgZW1wdHkgYmVmb3JlIGNsb3NpbmcgdGhlIGVkaXRvci4gVGhpcyByZWR1Y2VzIHRoZSBhbW91bnQgb2YgZWRpdG9yXG5cdFx0Ly8gY2hhbmdlIGV2ZW50cyB0aGF0IHRoaXMgb3BlcmF0aW9uIGVtaXRzIGFuZCB3aWxsIHJlZHVjZSBmbGlja2VyLiBXaXRob3V0IHRoaXNcblx0XHQvLyBvcHRpbWl6YXRpb24sIHRoaXMgZ3JvdXAgKGlmIGFjdGl2ZSkgd291bGQgZmlyc3QgdHJpZ2dlciBhIGFjdGl2ZSBlZGl0b3IgY2hhbmdlXG5cdFx0Ly8gZXZlbnQgYmVjYXVzZSBpdCBiZWNhbWUgZW1wdHksIG9ubHkgdG8gdGhlbiB0cmlnZ2VyIGFub3RoZXIgb25lIHdoZW4gdGhlIG5leHRcblx0XHQvLyBncm91cCBnZXRzIGFjdGl2ZS5cblx0XHRjb25zdCBjbG9zZUVtcHR5R3JvdXAgPSB0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMuY2xvc2VFbXB0eUdyb3Vwcztcblx0XHRpZiAoY2xvc2VFbXB0eUdyb3VwICYmIHRoaXMuYWN0aXZlICYmIHRoaXMuY291bnQgPT09IDEpIHtcblx0XHRcdGNvbnN0IG1vc3RSZWNlbnRseUFjdGl2ZUdyb3VwcyA9IHRoaXMuZ3JvdXBzVmlldy5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpO1xuXHRcdFx0Y29uc3QgbmV4dEFjdGl2ZUdyb3VwID0gbW9zdFJlY2VudGx5QWN0aXZlR3JvdXBzWzFdOyAvLyBbMF0gd2lsbCBiZSB0aGUgY3VycmVudCBvbmUsIHNvIHRha2UgWzFdXG5cdFx0XHRpZiAobmV4dEFjdGl2ZUdyb3VwKSB7XG5cdFx0XHRcdGlmIChyZXN0b3JlRm9jdXMpIHtcblx0XHRcdFx0XHRuZXh0QWN0aXZlR3JvdXAuZm9jdXMoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmdyb3Vwc1ZpZXcuYWN0aXZhdGVHcm91cChuZXh0QWN0aXZlR3JvdXAsIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIG1vZGVsXG5cdFx0aWYgKGVkaXRvclRvQ2xvc2UpIHtcblx0XHRcdHRoaXMubW9kZWwuY2xvc2VFZGl0b3IoZWRpdG9yVG9DbG9zZSwgaW50ZXJuYWxPcHRpb25zPy5jb250ZXh0KTtcblx0XHR9XG5cblx0XHQvLyBPcGVuIG5leHQgYWN0aXZlIGlmIHRoZXJlIGFyZSBtb3JlIHRvIHNob3dcblx0XHRjb25zdCBuZXh0QWN0aXZlRWRpdG9yID0gdGhpcy5tb2RlbC5hY3RpdmVFZGl0b3I7XG5cdFx0aWYgKG5leHRBY3RpdmVFZGl0b3IpIHtcblx0XHRcdGxldCBhY3RpdmF0aW9uOiBFZGl0b3JBY3RpdmF0aW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHByZXNlcnZlRm9jdXMgJiYgdGhpcy5ncm91cHNWaWV3LmFjdGl2ZUdyb3VwICE9PSB0aGlzKSB7XG5cdFx0XHRcdC8vIElmIHdlIGFyZSBvcGVuaW5nIHRoZSBuZXh0IGVkaXRvciBpbiBhbiBpbmFjdGl2ZSBncm91cFxuXHRcdFx0XHQvLyB3aXRob3V0IGZvY3Vzc2luZyBpdCwgZW5zdXJlIHdlIHByZXNlcnZlIHRoZSBlZGl0b3Jcblx0XHRcdFx0Ly8gZ3JvdXAgc2l6ZXMgaW4gY2FzZSB0aGF0IGdyb3VwIGlzIG1pbmltaXplZC5cblx0XHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExNzY4NlxuXHRcdFx0XHRhY3RpdmF0aW9uID0gRWRpdG9yQWN0aXZhdGlvbi5QUkVTRVJWRTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb3B0aW9uczogSUVkaXRvck9wdGlvbnMgPSB7XG5cdFx0XHRcdHByZXNlcnZlRm9jdXMsXG5cdFx0XHRcdGFjdGl2YXRpb24sXG5cdFx0XHRcdC8vIFdoZW4gY2xvc2luZyBhbiBlZGl0b3IgZHVlIHRvIGFuIGVycm9yIHdlIGNhbiBlbmQgdXAgaW4gYSBsb29wIHdoZXJlIHdlIGNvbnRpbnVlIGNsb3Npbmdcblx0XHRcdFx0Ly8gZWRpdG9ycyB0aGF0IGZhaWwgdG8gb3BlbiAoZS5nLiB3aGVuIHRoZSBmaWxlIG5vIGxvbmdlciBleGlzdHMpLiBXZSBkbyBub3Qgd2FudCB0byBzaG93XG5cdFx0XHRcdC8vIHJlcGVhdGVkIGVycm9ycyBpbiB0aGlzIGNhc2UgdG8gdGhlIHVzZXIuIEFzIHN1Y2gsIGlmIHdlIG9wZW4gdGhlIG5leHQgZWRpdG9yIGFuZCB3ZSBhcmVcblx0XHRcdFx0Ly8gaW4gYSBzY29wZSBvZiBhIHByZXZpb3VzIGVkaXRvciBmYWlsaW5nLCB3ZSBzaWxlbmNlIHRoZSBpbnB1dCBlcnJvcnMgdW50aWwgdGhlIGVkaXRvciBpc1xuXHRcdFx0XHQvLyBvcGVuZWQgYnkgc2V0dGluZyBpZ25vcmVFcnJvcjogdHJ1ZS5cblx0XHRcdFx0aWdub3JlRXJyb3I6IGludGVybmFsT3B0aW9ucz8uZnJvbUVycm9yXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBpbnRlcm5hbEVkaXRvck9wZW5PcHRpb25zOiBJSW50ZXJuYWxFZGl0b3JPcGVuT3B0aW9ucyA9IHtcblx0XHRcdFx0Ly8gV2hlbiBjbG9zaW5nIGFuIGVkaXRvciwgd2UgcmV2ZWFsIHRoZSBuZXh0IG9uZSBpbiB0aGUgZ3JvdXAuXG5cdFx0XHRcdC8vIEhvd2V2ZXIsIHRoaXMgY2FuIGJlIGEgcmVzdWx0IG9mIG1vdmluZyBhbiBlZGl0b3IgdG8gYW5vdGhlclxuXHRcdFx0XHQvLyB3aW5kb3cgc28gd2UgZXhwbGljaXRseSBkaXNhYmxlIHdpbmRvdyByZW9yZGVyaW5nIGluIHRoaXMgY2FzZS5cblx0XHRcdFx0cHJlc2VydmVXaW5kb3dPcmRlcjogdHJ1ZVxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5kb09wZW5FZGl0b3IobmV4dEFjdGl2ZUVkaXRvciwgb3B0aW9ucywgaW50ZXJuYWxFZGl0b3JPcGVuT3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIHdlIGFyZSBlbXB0eSwgc28gY2xlYXIgZnJvbSBlZGl0b3IgY29udHJvbCBhbmQgc2VuZCBldmVudFxuXHRcdGVsc2Uge1xuXG5cdFx0XHQvLyBGb3J3YXJkIHRvIGVkaXRvciBwYW5lXG5cdFx0XHRpZiAoZWRpdG9yVG9DbG9zZSkge1xuXHRcdFx0XHR0aGlzLmVkaXRvclBhbmUuY2xvc2VFZGl0b3IoZWRpdG9yVG9DbG9zZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlc3RvcmUgZm9jdXMgdG8gZ3JvdXAgY29udGFpbmVyIGFzIG5lZWRlZCB1bmxlc3MgZ3JvdXAgZ2V0cyBjbG9zZWRcblx0XHRcdGlmIChyZXN0b3JlRm9jdXMgJiYgIWNsb3NlRW1wdHlHcm91cCkge1xuXHRcdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEV2ZW50c1xuXHRcdFx0dGhpcy5fb25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSh7IGVkaXRvcjogdW5kZWZpbmVkIH0pO1xuXG5cdFx0XHQvLyBSZW1vdmUgZW1wdHkgZ3JvdXAgaWYgd2Ugc2hvdWxkXG5cdFx0XHRpZiAoY2xvc2VFbXB0eUdyb3VwKSB7XG5cdFx0XHRcdHRoaXMuZ3JvdXBzVmlldy5yZW1vdmVHcm91cCh0aGlzLCBwcmVzZXJ2ZUZvY3VzKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZFJlc3RvcmVGb2N1cyh0YXJnZXQ6IEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gZ2V0QWN0aXZlRWxlbWVudCgpO1xuXHRcdGlmIChhY3RpdmVFbGVtZW50ID09PSB0YXJnZXQub3duZXJEb2N1bWVudC5ib2R5KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gYWx3YXlzIHJlc3RvcmUgZm9jdXMgaWYgbm90aGluZyBpcyBmb2N1c2VkIGN1cnJlbnRseVxuXHRcdH1cblxuXHRcdC8vIG90aGVyd2lzZSBjaGVjayBmb3IgdGhlIGFjdGl2ZSBlbGVtZW50IGJlaW5nIGFuIGFuY2VzdG9yIG9mIHRoZSB0YXJnZXRcblx0XHRyZXR1cm4gaXNBbmNlc3RvcihhY3RpdmVFbGVtZW50LCB0YXJnZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0Nsb3NlSW5hY3RpdmVFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCwgaW50ZXJuYWxPcHRpb25zPzogSUludGVybmFsRWRpdG9yQ2xvc2VPcHRpb25zKTogdm9pZCB7XG5cblx0XHQvLyBVcGRhdGUgbW9kZWxcblx0XHR0aGlzLm1vZGVsLmNsb3NlRWRpdG9yKGVkaXRvciwgaW50ZXJuYWxPcHRpb25zPy5jb250ZXh0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlQ2xvc2VDb25maXJtYXRpb24oZWRpdG9yczogRWRpdG9ySW5wdXRbXSk6IFByb21pc2U8Ym9vbGVhbiAvKiB2ZXRvICovPiB7XG5cdFx0aWYgKCFlZGl0b3JzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBubyB2ZXRvXG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yID0gZWRpdG9ycy5zaGlmdCgpITtcblxuXHRcdC8vIFRvIHByZXZlbnQgbXVsdGlwbGUgY29uZmlybWF0aW9uIGRpYWxvZ3MgZnJvbSBzaG93aW5nIHVwIG9uZSBhZnRlciB0aGUgb3RoZXJcblx0XHQvLyB3ZSBjaGVjayBpZiBhIHBlbmRpbmcgY29uZmlybWF0aW9uIGlzIGN1cnJlbnRseSBzaG93aW5nIGFuZCBpZiBzbywgam9pbiB0aGF0XG5cdFx0bGV0IGhhbmRsZUNsb3NlQ29uZmlybWF0aW9uUHJvbWlzZSA9IHRoaXMubWFwRWRpdG9yVG9QZW5kaW5nQ29uZmlybWF0aW9uLmdldChlZGl0b3IpO1xuXHRcdGlmICghaGFuZGxlQ2xvc2VDb25maXJtYXRpb25Qcm9taXNlKSB7XG5cdFx0XHRoYW5kbGVDbG9zZUNvbmZpcm1hdGlvblByb21pc2UgPSB0aGlzLmRvSGFuZGxlQ2xvc2VDb25maXJtYXRpb24oZWRpdG9yKTtcblx0XHRcdHRoaXMubWFwRWRpdG9yVG9QZW5kaW5nQ29uZmlybWF0aW9uLnNldChlZGl0b3IsIGhhbmRsZUNsb3NlQ29uZmlybWF0aW9uUHJvbWlzZSk7XG5cdFx0fVxuXG5cdFx0bGV0IHZldG86IGJvb2xlYW47XG5cdFx0dHJ5IHtcblx0XHRcdHZldG8gPSBhd2FpdCBoYW5kbGVDbG9zZUNvbmZpcm1hdGlvblByb21pc2U7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMubWFwRWRpdG9yVG9QZW5kaW5nQ29uZmlybWF0aW9uLmRlbGV0ZShlZGl0b3IpO1xuXHRcdH1cblxuXHRcdC8vIFJldHVybiBmb3IgdGhlIGZpcnN0IHZldG8gd2UgZ290XG5cdFx0aWYgKHZldG8pIHtcblx0XHRcdHJldHVybiB2ZXRvO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSBjb250aW51ZSB3aXRoIHRoZSByZW1haW5kZXJzXG5cdFx0cmV0dXJuIHRoaXMuaGFuZGxlQ2xvc2VDb25maXJtYXRpb24oZWRpdG9ycyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvSGFuZGxlQ2xvc2VDb25maXJtYXRpb24oZWRpdG9yOiBFZGl0b3JJbnB1dCwgb3B0aW9ucz86IHsgc2tpcEF1dG9TYXZlOiBib29sZWFuIH0pOiBQcm9taXNlPGJvb2xlYW4gLyogdmV0byAqLz4ge1xuXHRcdGlmICghdGhpcy5zaG91bGRDb25maXJtQ2xvc2UoZWRpdG9yKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBubyB2ZXRvXG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIFNpZGVCeVNpZGVFZGl0b3JJbnB1dCAmJiB0aGlzLm1vZGVsLmNvbnRhaW5zKGVkaXRvci5wcmltYXJ5KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBwcmltYXJ5LXNpZGUgb2YgZWRpdG9yIGlzIHN0aWxsIG9wZW5lZCBzb21ld2hlcmUgZWxzZVxuXHRcdH1cblxuXHRcdC8vIE5vdGU6IHdlIGV4cGxpY2l0bHkgZGVjaWRlIHRvIGFzayBmb3IgY29uZmlybSBpZiBjbG9zaW5nIGEgbm9ybWFsIGVkaXRvciBldmVuXG5cdFx0Ly8gaWYgaXQgaXMgb3BlbmVkIGluIGEgc2lkZS1ieS1zaWRlIGVkaXRvciBpbiB0aGUgZ3JvdXAuIFRoaXMgZGVjaXNpb24gaXMgbWFkZVxuXHRcdC8vIGJlY2F1c2UgaXQgbWF5IGJlIGxlc3Mgb2J2aW91cyB0aGF0IG9uZSBzaWRlIG9mIGEgc2lkZSBieSBzaWRlIGVkaXRvciBpcyBkaXJ0eVxuXHRcdC8vIGFuZCBjYW4gc3RpbGwgYmUgY2hhbmdlZC5cblx0XHQvLyBUaGUgb25seSBleGNlcHRpb24gaXMgd2hlbiB0aGUgc2FtZSBlZGl0b3IgaXMgb3BlbmVkIG9uIGJvdGggc2lkZXMgb2YgYSBzaWRlXG5cdFx0Ly8gYnkgc2lkZSBlZGl0b3IgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMzg0NDIpXG5cblx0XHRpZiAodGhpcy5lZGl0b3JQYXJ0c1ZpZXcuZ3JvdXBzLnNvbWUoZ3JvdXBWaWV3ID0+IHtcblx0XHRcdGlmIChncm91cFZpZXcgPT09IHRoaXMpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBza2lwICh3ZSBhbHJlYWR5IGhhbmRsZWQgb3VyIGdyb3VwIGFib3ZlKVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvdGhlckdyb3VwID0gZ3JvdXBWaWV3O1xuXHRcdFx0aWYgKG90aGVyR3JvdXAuY29udGFpbnMoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkJPVEggfSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7IC8vIGV4YWN0IGVkaXRvciBzdGlsbCBvcGVuZWQgKGVpdGhlciBzaW5nbGUsIG9yIHNwbGl0LWluLWdyb3VwKVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgU2lkZUJ5U2lkZUVkaXRvcklucHV0ICYmIG90aGVyR3JvdXAuY29udGFpbnMoZWRpdG9yLnByaW1hcnkpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlOyAvLyBwcmltYXJ5IHNpZGUgb2Ygc2lkZSBieSBzaWRlIGVkaXRvciBzdGlsbCBvcGVuZWRcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIGVkaXRvciBpcyBzdGlsbCBlZGl0YWJsZSBzb21ld2hlcmUgZWxzZVxuXHRcdH1cblxuXHRcdC8vIEluIHNvbWUgY2FzZXMgdHJpZ2dlciBzYXZlIGJlZm9yZSBvcGVuaW5nIHRoZSBkaWFsb2cgZGVwZW5kaW5nXG5cdFx0Ly8gb24gYXV0by1zYXZlIGNvbmZpZ3VyYXRpb24uXG5cdFx0Ly8gSG93ZXZlciwgbWFrZSBzdXJlIHRvIHJlc3BlY3QgYHNraXBBdXRvU2F2ZWAgb3B0aW9uIGluIGNhc2UgdGhlIGF1dG9tYXRlZFxuXHRcdC8vIHNhdmUgZmFpbHMgd2hpY2ggd291bGQgcmVzdWx0IGluIHRoZSBlZGl0b3IgbmV2ZXIgY2xvc2luZy5cblx0XHQvLyBBbHNvLCB3ZSBvbmx5IGRvIHRoaXMgaWYgbm8gY3VzdG9tIGNvbmZpcm1hdGlvbiBoYW5kbGluZyBpcyBpbXBsZW1lbnRlZC5cblx0XHRsZXQgY29uZmlybWF0aW9uID0gQ29uZmlybVJlc3VsdC5DQU5DRUw7XG5cdFx0bGV0IHNhdmVSZWFzb24gPSBTYXZlUmVhc29uLkVYUExJQ0lUO1xuXHRcdGxldCBhdXRvU2F2ZSA9IGZhbHNlO1xuXHRcdGlmICghZWRpdG9yLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQpICYmICFvcHRpb25zPy5za2lwQXV0b1NhdmUgJiYgIWVkaXRvci5jbG9zZUhhbmRsZXIpIHtcblxuXHRcdFx0Ly8gQXV0by1zYXZlIG9uIGZvY3VzIGNoYW5nZTogc2F2ZSwgYmVjYXVzZSBhIGRpYWxvZyB3b3VsZCBzdGVhbCBmb2N1c1xuXHRcdFx0Ly8gKHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTA4NzUyKVxuXHRcdFx0aWYgKHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5nZXRBdXRvU2F2ZU1vZGUoZWRpdG9yKS5tb2RlID09PSBBdXRvU2F2ZU1vZGUuT05fRk9DVVNfQ0hBTkdFKSB7XG5cdFx0XHRcdGF1dG9TYXZlID0gdHJ1ZTtcblx0XHRcdFx0Y29uZmlybWF0aW9uID0gQ29uZmlybVJlc3VsdC5TQVZFO1xuXHRcdFx0XHRzYXZlUmVhc29uID0gU2F2ZVJlYXNvbi5GT0NVU19DSEFOR0U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEF1dG8tc2F2ZSBvbiB3aW5kb3cgY2hhbmdlOiBzYXZlLCBiZWNhdXNlIG9uIFdpbmRvd3MgYW5kIExpbnV4LCBhXG5cdFx0XHQvLyBuYXRpdmUgZGlhbG9nIHRyaWdnZXJzIHRoZSB3aW5kb3cgZm9jdXMgY2hhbmdlXG5cdFx0XHQvLyAoc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMzQyNTApXG5cdFx0XHRlbHNlIGlmICgoaXNOYXRpdmUgJiYgKGlzV2luZG93cyB8fCBpc0xpbnV4KSkgJiYgdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEF1dG9TYXZlTW9kZShlZGl0b3IpLm1vZGUgPT09IEF1dG9TYXZlTW9kZS5PTl9XSU5ET1dfQ0hBTkdFKSB7XG5cdFx0XHRcdGF1dG9TYXZlID0gdHJ1ZTtcblx0XHRcdFx0Y29uZmlybWF0aW9uID0gQ29uZmlybVJlc3VsdC5TQVZFO1xuXHRcdFx0XHRzYXZlUmVhc29uID0gU2F2ZVJlYXNvbi5XSU5ET1dfQ0hBTkdFO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE5vIGF1dG8tc2F2ZSBvbiBmb2N1cyBjaGFuZ2Ugb3IgY3VzdG9tIGNvbmZpcm1hdGlvbiBoYW5kbGVyOiBhc2sgdXNlclxuXHRcdGlmICghYXV0b1NhdmUpIHtcblxuXHRcdFx0Ly8gU3dpdGNoIHRvIGVkaXRvciB0aGF0IHdlIHdhbnQgdG8gaGFuZGxlIGZvciBjb25maXJtYXRpb24gdW5sZXNzIHNob3dpbmcgYWxyZWFkeVxuXHRcdFx0aWYgKCF0aGlzLmFjdGl2ZUVkaXRvcj8ubWF0Y2hlcyhlZGl0b3IpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZG9PcGVuRWRpdG9yKGVkaXRvcik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEVuc3VyZSBvdXIgd2luZG93IGhhcyBmb2N1cyBzaW5jZSB3ZSBhcmUgYWJvdXQgdG8gc2hvdyBhIGRpYWxvZ1xuXHRcdFx0YXdhaXQgdGhpcy5ob3N0U2VydmljZS5mb2N1cyhnZXRXaW5kb3codGhpcy5lbGVtZW50KSk7XG5cblx0XHRcdC8vIExldCBlZGl0b3IgaGFuZGxlIGNvbmZpcm1hdGlvbiBpZiBpbXBsZW1lbnRlZFxuXHRcdFx0bGV0IGhhbmRsZXJEaWRFcnJvciA9IGZhbHNlO1xuXHRcdFx0aWYgKHR5cGVvZiBlZGl0b3IuY2xvc2VIYW5kbGVyPy5jb25maXJtID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uID0gYXdhaXQgZWRpdG9yLmNsb3NlSGFuZGxlci5jb25maXJtKFt7IGVkaXRvciwgZ3JvdXBJZDogdGhpcy5pZCB9XSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0XHRcdFx0aGFuZGxlckRpZEVycm9yID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBTaG93IGEgZmlsZSBzcGVjaWZpYyBjb25maXJtYXRpb24gaWYgdGhlcmUgaXMgbm8gaGFuZGxlciBvciBpdCBlcnJvcmVkXG5cdFx0XHRpZiAodHlwZW9mIGVkaXRvci5jbG9zZUhhbmRsZXI/LmNvbmZpcm0gIT09ICdmdW5jdGlvbicgfHwgaGFuZGxlckRpZEVycm9yKSB7XG5cdFx0XHRcdGxldCBuYW1lOiBzdHJpbmc7XG5cdFx0XHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0XHRuYW1lID0gZWRpdG9yLnByaW1hcnkuZ2V0TmFtZSgpOyAvLyBwcmVmZXIgc2hvcnRlciBuYW1lcyBieSB1c2luZyBwcmltYXJ5J3MgbmFtZSBpbiB0aGlzIGNhc2Vcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRuYW1lID0gZWRpdG9yLmdldE5hbWUoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbmZpcm1hdGlvbiA9IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd1NhdmVDb25maXJtKFtuYW1lXSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSXQgY291bGQgYmUgdGhhdCB0aGUgZWRpdG9yJ3MgY2hvaWNlIG9mIGNvbmZpcm1hdGlvbiBoYXMgY2hhbmdlZFxuXHRcdC8vIGdpdmVuIHRoZSBjaGVjayBmb3IgY29uZmlybWF0aW9uIGlzIGxvbmcgcnVubmluZywgc28gd2UgY2hlY2tcblx0XHQvLyBhZ2FpbiB0byBzZWUgaWYgYW55dGhpbmcgbmVlZHMgdG8gaGFwcGVuIGJlZm9yZSBjbG9zaW5nIGZvciBnb29kLlxuXHRcdC8vIFRoaXMgY2FuIGhhcHBlbiBmb3IgZXhhbXBsZSBpZiBgYXV0b1NhdmU6IG9uRm9jdXNDaGFuZ2VgIGlzIGNvbmZpZ3VyZWRcblx0XHQvLyBzbyB0aGF0IHRoZSBzYXZlIGhhcHBlbnMgd2hlbiB0aGUgZGlhbG9nIG9wZW5zLlxuXHRcdC8vIEhvd2V2ZXIsIHdlIG9ubHkgZG8gdGhpcyB1bmxlc3MgYSBjdXN0b20gY29uZmlybSBoYW5kbGVyIGlzIGluc3RhbGxlZFxuXHRcdC8vIHRoYXQgbWF5IG5vdCBiZSBmaXQgdG8gYmUgYXNrZWQgYSBzZWNvbmQgdGltZSByaWdodCBhZnRlci5cblx0XHRpZiAoIWVkaXRvci5jbG9zZUhhbmRsZXIgJiYgIXRoaXMuc2hvdWxkQ29uZmlybUNsb3NlKGVkaXRvcikpIHtcblx0XHRcdHJldHVybiBjb25maXJtYXRpb24gPT09IENvbmZpcm1SZXN1bHQuQ0FOQ0VMO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSwgaGFuZGxlIGFjY29yZGluZ2x5XG5cdFx0c3dpdGNoIChjb25maXJtYXRpb24pIHtcblx0XHRcdGNhc2UgQ29uZmlybVJlc3VsdC5TQVZFOiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGVkaXRvci5zYXZlKHRoaXMuaWQsIHsgcmVhc29uOiBzYXZlUmVhc29uIH0pO1xuXHRcdFx0XHRpZiAoIXJlc3VsdCAmJiBhdXRvU2F2ZSkge1xuXHRcdFx0XHRcdC8vIFNhdmUgZmFpbGVkIGFuZCB3ZSBuZWVkIHRvIHNpZ25hbCB0aGlzIGJhY2sgdG8gdGhlIHVzZXIsIHNvXG5cdFx0XHRcdFx0Ly8gd2UgaGFuZGxlIHRoZSBkaXJ0eSBlZGl0b3IgYWdhaW4gYnV0IHRoaXMgdGltZSBlbnN1cmluZyB0b1xuXHRcdFx0XHRcdC8vIHNob3cgdGhlIGNvbmZpcm0gZGlhbG9nXG5cdFx0XHRcdFx0Ly8gKHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTA4NzUyKVxuXHRcdFx0XHRcdHJldHVybiB0aGlzLmRvSGFuZGxlQ2xvc2VDb25maXJtYXRpb24oZWRpdG9yLCB7IHNraXBBdXRvU2F2ZTogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBlZGl0b3IuaXNEaXJ0eSgpOyAvLyB2ZXRvIGlmIHN0aWxsIGRpcnR5XG5cdFx0XHR9XG5cdFx0XHRjYXNlIENvbmZpcm1SZXN1bHQuRE9OVF9TQVZFOlxuXHRcdFx0XHR0cnkge1xuXG5cdFx0XHRcdFx0Ly8gZmlyc3QgdHJ5IGEgbm9ybWFsIHJldmVydCB3aGVyZSB0aGUgY29udGVudHMgb2YgdGhlIGVkaXRvciBhcmUgcmVzdG9yZWRcblx0XHRcdFx0XHRhd2FpdCBlZGl0b3IucmV2ZXJ0KHRoaXMuaWQpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIGVkaXRvci5pc0RpcnR5KCk7IC8vIHZldG8gaWYgc3RpbGwgZGlydHlcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXG5cdFx0XHRcdFx0Ly8gaWYgdGhhdCBmYWlscywgc2luY2Ugd2UgYXJlIGFib3V0IHRvIGNsb3NlIHRoZSBlZGl0b3IsIHdlIGFjY2VwdCB0aGF0XG5cdFx0XHRcdFx0Ly8gdGhlIGVkaXRvciBjYW5ub3QgYmUgcmV2ZXJ0ZWQgYW5kIGluc3RlYWQgZG8gYSBzb2Z0IHJldmVydCB0aGF0IGp1c3Rcblx0XHRcdFx0XHQvLyBlbmFibGVzIHVzIHRvIGNsb3NlIHRoZSBlZGl0b3IuIFdpdGggdGhpcywgYSB1c2VyIGNhbiBhbHdheXMgY2xvc2UgYVxuXHRcdFx0XHRcdC8vIGRpcnR5IGVkaXRvciBldmVuIHdoZW4gcmV2ZXJ0aW5nIGZhaWxzLlxuXG5cdFx0XHRcdFx0YXdhaXQgZWRpdG9yLnJldmVydCh0aGlzLmlkLCB7IHNvZnQ6IHRydWUgfSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gZWRpdG9yLmlzRGlydHkoKTsgLy8gdmV0byBpZiBzdGlsbCBkaXJ0eVxuXHRcdFx0XHR9XG5cdFx0XHRjYXNlIENvbmZpcm1SZXN1bHQuQ0FOQ0VMOlxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gdmV0b1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkQ29uZmlybUNsb3NlKGVkaXRvcjogRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRpZiAoZWRpdG9yLmNsb3NlSGFuZGxlcikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIGVkaXRvci5jbG9zZUhhbmRsZXIuc2hvd0NvbmZpcm0oKTsgLy8gY3VzdG9tIGhhbmRsaW5nIG9mIGNvbmZpcm1hdGlvbiBvbiBjbG9zZVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZWRpdG9yLmlzRGlydHkoKSAmJiAhZWRpdG9yLmlzU2F2aW5nKCk7IC8vIGVkaXRvciBtdXN0IGJlIGRpcnR5IGFuZCBub3Qgc2F2aW5nXG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gY2xvc2VFZGl0b3JzKClcblxuXHRhc3luYyBjbG9zZUVkaXRvcnMoYXJnczogRWRpdG9ySW5wdXRbXSB8IElDbG9zZUVkaXRvcnNGaWx0ZXIsIG9wdGlvbnM/OiBJQ2xvc2VFZGl0b3JPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHRoaXMuaXNFbXB0eSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9ycyA9IHRoaXMuZG9HZXRFZGl0b3JzVG9DbG9zZShhcmdzKS5maWx0ZXIoZWRpdG9yID0+IG9wdGlvbnM/LmZvcmNlIHx8ICFlZGl0b3IuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5DYW5ub3RDbG9zZSkpO1xuXHRcdGlmICghZWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBjb25maXJtYXRpb24gYW5kIHZldG9cblx0XHRjb25zdCB2ZXRvID0gYXdhaXQgdGhpcy5oYW5kbGVDbG9zZUNvbmZpcm1hdGlvbihlZGl0b3JzLnNsaWNlKDApKTtcblx0XHRpZiAodmV0bykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIERvIGNsb3NlXG5cdFx0dGhpcy5kb0Nsb3NlRWRpdG9ycyhlZGl0b3JzLCBvcHRpb25zKTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0dldEVkaXRvcnNUb0Nsb3NlKGFyZ3M6IEVkaXRvcklucHV0W10gfCBJQ2xvc2VFZGl0b3JzRmlsdGVyKTogRWRpdG9ySW5wdXRbXSB7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoYXJncykpIHtcblx0XHRcdHJldHVybiBhcmdzO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbHRlciA9IGFyZ3M7XG5cdFx0Y29uc3QgaGFzRGlyZWN0aW9uID0gdHlwZW9mIGZpbHRlci5kaXJlY3Rpb24gPT09ICdudW1iZXInO1xuXG5cdFx0bGV0IGVkaXRvcnNUb0Nsb3NlID0gdGhpcy5tb2RlbC5nZXRFZGl0b3JzKGhhc0RpcmVjdGlvbiA/IEVkaXRvcnNPcmRlci5TRVFVRU5USUFMIDogRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFLCBmaWx0ZXIpOyAvLyBpbiBNUlUgb3JkZXIgb25seSBpZiBkaXJlY3Rpb24gaXMgbm90IHNwZWNpZmllZFxuXG5cdFx0Ly8gRmlsdGVyOiBzYXZlZCBvciBzYXZpbmcgb25seVxuXHRcdGlmIChmaWx0ZXIuc2F2ZWRPbmx5KSB7XG5cdFx0XHRlZGl0b3JzVG9DbG9zZSA9IGVkaXRvcnNUb0Nsb3NlLmZpbHRlcihlZGl0b3IgPT4gIWVkaXRvci5pc0RpcnR5KCkgfHwgZWRpdG9yLmlzU2F2aW5nKCkpO1xuXHRcdH1cblxuXHRcdC8vIEZpbHRlcjogZGlyZWN0aW9uIChsZWZ0IC8gcmlnaHQpXG5cdFx0ZWxzZSBpZiAoaGFzRGlyZWN0aW9uICYmIGZpbHRlci5leGNlcHQpIHtcblx0XHRcdGVkaXRvcnNUb0Nsb3NlID0gKGZpbHRlci5kaXJlY3Rpb24gPT09IENsb3NlRGlyZWN0aW9uLkxFRlQpID9cblx0XHRcdFx0ZWRpdG9yc1RvQ2xvc2Uuc2xpY2UoMCwgdGhpcy5tb2RlbC5pbmRleE9mKGZpbHRlci5leGNlcHQsIGVkaXRvcnNUb0Nsb3NlKSkgOlxuXHRcdFx0XHRlZGl0b3JzVG9DbG9zZS5zbGljZSh0aGlzLm1vZGVsLmluZGV4T2YoZmlsdGVyLmV4Y2VwdCwgZWRpdG9yc1RvQ2xvc2UpICsgMSk7XG5cdFx0fVxuXG5cdFx0Ly8gRmlsdGVyOiBleGNlcHRcblx0XHRlbHNlIGlmIChmaWx0ZXIuZXhjZXB0KSB7XG5cdFx0XHRlZGl0b3JzVG9DbG9zZSA9IGVkaXRvcnNUb0Nsb3NlLmZpbHRlcihlZGl0b3IgPT4gZmlsdGVyLmV4Y2VwdCAmJiAhZWRpdG9yLm1hdGNoZXMoZmlsdGVyLmV4Y2VwdCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBlZGl0b3JzVG9DbG9zZTtcblx0fVxuXG5cdHByaXZhdGUgZG9DbG9zZUVkaXRvcnMoZWRpdG9yczogRWRpdG9ySW5wdXRbXSwgb3B0aW9ucz86IElDbG9zZUVkaXRvck9wdGlvbnMpOiB2b2lkIHtcblxuXHRcdC8vIENsb3NlIGFsbCBpbmFjdGl2ZSBlZGl0b3JzIGZpcnN0XG5cdFx0bGV0IGNsb3NlQWN0aXZlRWRpdG9yID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgZWRpdG9ycykge1xuXHRcdFx0aWYgKCF0aGlzLmlzQWN0aXZlKGVkaXRvcikpIHtcblx0XHRcdFx0dGhpcy5kb0Nsb3NlSW5hY3RpdmVFZGl0b3IoZWRpdG9yKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNsb3NlQWN0aXZlRWRpdG9yID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDbG9zZSBhY3RpdmUgZWRpdG9yIGxhc3QgaWYgY29udGFpbmVkIGluIGVkaXRvcnMgbGlzdCB0byBjbG9zZVxuXHRcdGlmIChjbG9zZUFjdGl2ZUVkaXRvcikge1xuXHRcdFx0dGhpcy5kb0Nsb3NlQWN0aXZlRWRpdG9yKG9wdGlvbnM/LnByZXNlcnZlRm9jdXMpO1xuXHRcdH1cblxuXHRcdC8vIEZvcndhcmQgdG8gdGl0bGUgY29udHJvbFxuXHRcdGlmIChlZGl0b3JzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy50aXRsZUNvbnRyb2wuY2xvc2VFZGl0b3JzKGVkaXRvcnMpO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBjbG9zZUFsbEVkaXRvcnMoKVxuXG5cdGNsb3NlQWxsRWRpdG9ycyhvcHRpb25zOiB7IGV4Y2x1ZGVDb25maXJtaW5nOiB0cnVlOyBmb3JjZT86IGJvb2xlYW4gfSk6IGJvb2xlYW47XG5cdGNsb3NlQWxsRWRpdG9ycyhvcHRpb25zPzogSUNsb3NlQWxsRWRpdG9yc09wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+O1xuXHRjbG9zZUFsbEVkaXRvcnMob3B0aW9ucz86IElDbG9zZUFsbEVkaXRvcnNPcHRpb25zKTogYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLmlzRW1wdHkpIHtcblxuXHRcdFx0Ly8gSWYgdGhlIGdyb3VwIGlzIGVtcHR5IGFuZCB0aGUgcmVxdWVzdCBpcyB0byBjbG9zZSBhbGwgZWRpdG9ycywgd2Ugc3RpbGwgY2xvc2Vcblx0XHRcdC8vIHRoZSBlZGl0b3IgZ3JvdXAgaXMgdGhlIHJlbGF0ZWQgc2V0dGluZyB0byBjbG9zZSBlbXB0eSBncm91cHMgaXMgZW5hYmxlZCBmb3Jcblx0XHRcdC8vIGEgY29udmVuaWVudCB3YXkgb2YgcmVtb3ZpbmcgZW1wdHkgZWRpdG9yIGdyb3VwcyBmb3IgdGhlIHVzZXIuXG5cdFx0XHRpZiAodGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLmNsb3NlRW1wdHlHcm91cHMpIHtcblx0XHRcdFx0dGhpcy5ncm91cHNWaWV3LnJlbW92ZUdyb3VwKHRoaXMpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBXZSBjYW4gZ28gYWhlYWQgYW5kIGNsb3NlIFwic3luY1wiIHdoZW4gd2UgZXhjbHVkZSBjb25maXJtaW5nIGVkaXRvcnNcblx0XHRpZiAob3B0aW9ucz8uZXhjbHVkZUNvbmZpcm1pbmcpIHtcblx0XHRcdHRoaXMuZG9DbG9zZUFsbEVkaXRvcnMob3B0aW9ucyk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UgZ28gdGhyb3VnaCBwb3RlbnRpYWwgY29uZmlybWF0aW9uIFwiYXN5bmNcIlxuXHRcdGNvbnN0IGVkaXRvcnMgPSB0aGlzLm1vZGVsLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFLCBvcHRpb25zKS5maWx0ZXIoZWRpdG9yID0+IG9wdGlvbnM/LmZvcmNlIHx8ICFlZGl0b3IuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5DYW5ub3RDbG9zZSkpO1xuXHRcdGlmICghZWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmhhbmRsZUNsb3NlQ29uZmlybWF0aW9uKGVkaXRvcnMpLnRoZW4odmV0byA9PiB7XG5cdFx0XHRpZiAodmV0bykge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZG9DbG9zZUFsbEVkaXRvcnMob3B0aW9ucyk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZG9DbG9zZUFsbEVkaXRvcnMob3B0aW9ucz86IElDbG9zZUFsbEVkaXRvcnNPcHRpb25zKTogdm9pZCB7XG5cdFx0bGV0IGVkaXRvcnMgPSB0aGlzLm1vZGVsLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwsIG9wdGlvbnMpLmZpbHRlcihlZGl0b3IgPT4gb3B0aW9ucz8uZm9yY2UgfHwgIWVkaXRvci5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLkNhbm5vdENsb3NlKSk7XG5cdFx0aWYgKG9wdGlvbnM/LmV4Y2x1ZGVDb25maXJtaW5nKSB7XG5cdFx0XHRlZGl0b3JzID0gZWRpdG9ycy5maWx0ZXIoZWRpdG9yID0+ICF0aGlzLnNob3VsZENvbmZpcm1DbG9zZShlZGl0b3IpKTtcblx0XHR9XG5cblx0XHQvLyBDbG9zZSBhbGwgaW5hY3RpdmUgZWRpdG9ycyBmaXJzdFxuXHRcdGNvbnN0IGVkaXRvcnNUb0Nsb3NlOiBFZGl0b3JJbnB1dFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgZWRpdG9ycykge1xuXHRcdFx0aWYgKCF0aGlzLmlzQWN0aXZlKGVkaXRvcikpIHtcblx0XHRcdFx0dGhpcy5kb0Nsb3NlSW5hY3RpdmVFZGl0b3IoZWRpdG9yKTtcblx0XHRcdH1cblxuXHRcdFx0ZWRpdG9yc1RvQ2xvc2UucHVzaChlZGl0b3IpO1xuXHRcdH1cblxuXHRcdC8vIENsb3NlIGFjdGl2ZSBlZGl0b3IgbGFzdCAodW5sZXNzIHdlIHNraXAgaXQsIGUuZy4gYmVjYXVzZSBpdCBpcyBzdGlja3kpXG5cdFx0aWYgKHRoaXMuYWN0aXZlRWRpdG9yICYmIGVkaXRvcnNUb0Nsb3NlLmluY2x1ZGVzKHRoaXMuYWN0aXZlRWRpdG9yKSkge1xuXHRcdFx0dGhpcy5kb0Nsb3NlQWN0aXZlRWRpdG9yKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRm9yd2FyZCB0byB0aXRsZSBjb250cm9sXG5cdFx0aWYgKGVkaXRvcnNUb0Nsb3NlLmxlbmd0aCkge1xuXHRcdFx0dGhpcy50aXRsZUNvbnRyb2wuY2xvc2VFZGl0b3JzKGVkaXRvcnNUb0Nsb3NlKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gcmVwbGFjZUVkaXRvcnMoKVxuXG5cdGFzeW5jIHJlcGxhY2VFZGl0b3JzKGVkaXRvcnM6IEVkaXRvclJlcGxhY2VtZW50W10pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIEV4dHJhY3QgYWN0aXZlIHZzLiBpbmFjdGl2ZSByZXBsYWNlbWVudHNcblx0XHRsZXQgYWN0aXZlUmVwbGFjZW1lbnQ6IEVkaXRvclJlcGxhY2VtZW50IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGluYWN0aXZlUmVwbGFjZW1lbnRzOiBFZGl0b3JSZXBsYWNlbWVudFtdID0gW107XG5cdFx0Zm9yIChsZXQgeyBlZGl0b3IsIHJlcGxhY2VtZW50LCBmb3JjZVJlcGxhY2VEaXJ0eSwgb3B0aW9ucyB9IG9mIGVkaXRvcnMpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5nZXRJbmRleE9mRWRpdG9yKGVkaXRvcik7XG5cdFx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0XHRjb25zdCBpc0FjdGl2ZUVkaXRvciA9IHRoaXMuaXNBY3RpdmUoZWRpdG9yKTtcblxuXHRcdFx0XHQvLyBtYWtlIHN1cmUgd2UgcmVzcGVjdCB0aGUgaW5kZXggb2YgdGhlIGVkaXRvciB0byByZXBsYWNlXG5cdFx0XHRcdGlmIChvcHRpb25zKSB7XG5cdFx0XHRcdFx0b3B0aW9ucy5pbmRleCA9IGluZGV4O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG9wdGlvbnMgPSB7IGluZGV4IH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRvcHRpb25zLmluYWN0aXZlID0gIWlzQWN0aXZlRWRpdG9yO1xuXHRcdFx0XHRvcHRpb25zLnBpbm5lZCA9IG9wdGlvbnMucGlubmVkID8/IHRydWU7IC8vIHVubGVzcyBzcGVjaWZpZWQsIHByZWZlciB0byBwaW4gdXBvbiByZXBsYWNlXG5cblx0XHRcdFx0Y29uc3QgZWRpdG9yVG9SZXBsYWNlID0geyBlZGl0b3IsIHJlcGxhY2VtZW50LCBmb3JjZVJlcGxhY2VEaXJ0eSwgb3B0aW9ucyB9O1xuXHRcdFx0XHRpZiAoaXNBY3RpdmVFZGl0b3IpIHtcblx0XHRcdFx0XHRhY3RpdmVSZXBsYWNlbWVudCA9IGVkaXRvclRvUmVwbGFjZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpbmFjdGl2ZVJlcGxhY2VtZW50cy5wdXNoKGVkaXRvclRvUmVwbGFjZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgaW5hY3RpdmUgZmlyc3Rcblx0XHRmb3IgKGNvbnN0IHsgZWRpdG9yLCByZXBsYWNlbWVudCwgZm9yY2VSZXBsYWNlRGlydHksIG9wdGlvbnMgfSBvZiBpbmFjdGl2ZVJlcGxhY2VtZW50cykge1xuXG5cdFx0XHQvLyBPcGVuIGluYWN0aXZlIGVkaXRvclxuXHRcdFx0YXdhaXQgdGhpcy5kb09wZW5FZGl0b3IocmVwbGFjZW1lbnQsIG9wdGlvbnMpO1xuXG5cdFx0XHQvLyBDbG9zZSByZXBsYWNlZCBpbmFjdGl2ZSBlZGl0b3IgdW5sZXNzIHRoZXkgbWF0Y2hcblx0XHRcdGlmICghZWRpdG9yLm1hdGNoZXMocmVwbGFjZW1lbnQpKSB7XG5cdFx0XHRcdGxldCBjbG9zZWQgPSBmYWxzZTtcblx0XHRcdFx0aWYgKGZvcmNlUmVwbGFjZURpcnR5KSB7XG5cdFx0XHRcdFx0dGhpcy5kb0Nsb3NlRWRpdG9yKGVkaXRvciwgdHJ1ZSwgeyBjb250ZXh0OiBFZGl0b3JDbG9zZUNvbnRleHQuUkVQTEFDRSB9KTtcblx0XHRcdFx0XHRjbG9zZWQgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNsb3NlZCA9IGF3YWl0IHRoaXMuZG9DbG9zZUVkaXRvcldpdGhDb25maXJtYXRpb25IYW5kbGluZyhlZGl0b3IsIHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9LCB7IGNvbnRleHQ6IEVkaXRvckNsb3NlQ29udGV4dC5SRVBMQUNFLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghY2xvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBjYW5jZWxlZFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGFjdGl2ZSBsYXN0XG5cdFx0aWYgKGFjdGl2ZVJlcGxhY2VtZW50KSB7XG5cblx0XHRcdC8vIE9wZW4gcmVwbGFjZW1lbnQgYXMgYWN0aXZlIGVkaXRvclxuXHRcdFx0Y29uc3Qgb3BlbkVkaXRvclJlc3VsdCA9IHRoaXMuZG9PcGVuRWRpdG9yKGFjdGl2ZVJlcGxhY2VtZW50LnJlcGxhY2VtZW50LCBhY3RpdmVSZXBsYWNlbWVudC5vcHRpb25zKTtcblxuXHRcdFx0Ly8gQ2xvc2UgcmVwbGFjZWQgYWN0aXZlIGVkaXRvciB1bmxlc3MgdGhleSBtYXRjaFxuXHRcdFx0aWYgKCFhY3RpdmVSZXBsYWNlbWVudC5lZGl0b3IubWF0Y2hlcyhhY3RpdmVSZXBsYWNlbWVudC5yZXBsYWNlbWVudCkpIHtcblx0XHRcdFx0aWYgKGFjdGl2ZVJlcGxhY2VtZW50LmZvcmNlUmVwbGFjZURpcnR5KSB7XG5cdFx0XHRcdFx0dGhpcy5kb0Nsb3NlRWRpdG9yKGFjdGl2ZVJlcGxhY2VtZW50LmVkaXRvciwgdHJ1ZSwgeyBjb250ZXh0OiBFZGl0b3JDbG9zZUNvbnRleHQuUkVQTEFDRSB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRvQ2xvc2VFZGl0b3JXaXRoQ29uZmlybWF0aW9uSGFuZGxpbmcoYWN0aXZlUmVwbGFjZW1lbnQuZWRpdG9yLCB7IHByZXNlcnZlRm9jdXM6IHRydWUgfSwgeyBjb250ZXh0OiBFZGl0b3JDbG9zZUNvbnRleHQuUkVQTEFDRSwgZm9yY2U6IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgb3BlbkVkaXRvclJlc3VsdDtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTG9ja2luZ1xuXG5cdGdldCBpc0xvY2tlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5pc0xvY2tlZDtcblx0fVxuXG5cdGxvY2sobG9ja2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbC5sb2NrKGxvY2tlZCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRWRpdG9yIEFjdGlvbnNcblxuXHRjcmVhdGVFZGl0b3JBY3Rpb25zKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIG1lbnVJZCA9IE1lbnVJZC5FZGl0b3JUaXRsZSk6IElBY3RpdmVFZGl0b3JBY3Rpb25zIHtcblx0XHRsZXQgYWN0aW9uczogUHJpbWFyeUFuZFNlY29uZGFyeUFjdGlvbnMgPSB7IHByaW1hcnk6IFtdLCBzZWNvbmRhcnk6IFtdIH07XG5cdFx0bGV0IG9uRGlkQ2hhbmdlOiBFdmVudDxJTWVudUNoYW5nZUV2ZW50IHwgdm9pZD4gfCB1bmRlZmluZWQ7XG5cblx0XHQvLyBFZGl0b3IgYWN0aW9ucyByZXF1aXJlIHRoZSBlZGl0b3IgY29udHJvbCB0byBiZSB0aGVyZSwgc28gd2UgcmV0cmlldmUgaXQgdmlhIHNlcnZpY2Vcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gdGhpcy5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmIChhY3RpdmVFZGl0b3JQYW5lIGluc3RhbmNlb2YgRWRpdG9yUGFuZSkge1xuXHRcdFx0Y29uc3QgZWRpdG9yU2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSBhY3RpdmVFZGl0b3JQYW5lLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID8/IHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2U7XG5cdFx0XHRjb25zdCBlZGl0b3JUaXRsZU1lbnUgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KG1lbnVJZCwgZWRpdG9yU2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIHsgZW1pdEV2ZW50c0ZvclN1Ym1lbnVDaGFuZ2VzOiB0cnVlLCBldmVudERlYm91bmNlRGVsYXk6IDAgfSkpO1xuXHRcdFx0b25EaWRDaGFuZ2UgPSBlZGl0b3JUaXRsZU1lbnUub25EaWRDaGFuZ2U7XG5cblx0XHRcdGNvbnN0IHNob3VsZElubGluZUdyb3VwID0gKGFjdGlvbjogU3VibWVudUFjdGlvbiwgZ3JvdXA6IHN0cmluZykgPT4gZ3JvdXAgPT09ICduYXZpZ2F0aW9uJyAmJiBhY3Rpb24uYWN0aW9ucy5sZW5ndGggPD0gMTtcblxuXHRcdFx0YWN0aW9ucyA9IGdldEFjdGlvbkJhckFjdGlvbnMoXG5cdFx0XHRcdGVkaXRvclRpdGxlTWVudS5nZXRBY3Rpb25zKHsgYXJnOiB0aGlzLnJlc291cmNlQ29udGV4dC5nZXQoKSwgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUsIHJlbmRlclNob3J0VGl0bGU6IHRydWUgfSksXG5cdFx0XHRcdCduYXZpZ2F0aW9uJyxcblx0XHRcdFx0c2hvdWxkSW5saW5lR3JvdXBcblx0XHRcdCk7XG5cblx0XHRcdC8vIEFkZCBhIFwiUmVvcGVuIEVkaXRvciBXaXRoXCIgc3VibWVudSB0byB0aGUgb3ZlcmZsb3cgKC4uLikgbWVudSB3aGVuIHRoZSBhY3RpdmUgZWRpdG9yJ3Ncblx0XHRcdC8vIHJlc291cmNlIGNhbiBiZSBvcGVuZWQgYnkgbW9yZSB0aGFuIG9uZSBlZGl0b3IgdHlwZSAoZS5nLiBUZXh0IEVkaXRvciB2cy4gTWFya2Rvd25cblx0XHRcdC8vIFByZXZpZXcpLiBUaGlzIG1pcnJvcnMgdGhlIGVkaXRvciB0eXBlIGRyb3Bkb3duIHNob3duIGluIHRoZSBicmVhZGNydW1icyBiYXIuIEl0IGlzXG5cdFx0XHQvLyBidWlsdCBwZXIgZ3JvdXAgc28gaXQgcmVmbGVjdHMgdGhhdCBncm91cCdzIGFjdGl2ZSBlZGl0b3IuXG5cdFx0XHRpZiAobWVudUlkID09PSBNZW51SWQuRWRpdG9yVGl0bGUpIHtcblx0XHRcdFx0Y29uc3QgYXZhaWxhYmxlID0gZ2V0QXZhaWxhYmxlRWRpdG9yVHlwZXModGhpcy5hY3RpdmVFZGl0b3IsIHRoaXMuZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKTtcblx0XHRcdFx0aWYgKGF2YWlsYWJsZSkge1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvclR5cGVBY3Rpb25zID0gY3JlYXRlRWRpdG9yVHlwZUFjdGlvbnMoYXZhaWxhYmxlLCB0aGlzLmVkaXRvclJlc29sdmVyU2VydmljZSwgdGhpcy5jb21tYW5kU2VydmljZSwgdGhpcy5lZGl0b3JTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCByZW9wZW5XaXRoU3VibWVudSA9IG5ldyBTdWJtZW51QWN0aW9uKCdlZGl0b3IucmVvcGVuV2l0aCcsIGxvY2FsaXplKCdyZW9wZW5XaXRoJywgXCJSZW9wZW4gRWRpdG9yIFdpdGhcIiksIGVkaXRvclR5cGVBY3Rpb25zKTtcblx0XHRcdFx0XHRpZiAoYWN0aW9ucy5zZWNvbmRhcnkubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRhY3Rpb25zLnNlY29uZGFyeS5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGFjdGlvbnMuc2Vjb25kYXJ5LnB1c2gocmVvcGVuV2l0aFN1Ym1lbnUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIElmIHRoZXJlIGlzIG5vIGFjdGl2ZSBwYW5lIGluIHRoZSBncm91cCAoaXQncyB0aGUgbGFzdCBncm91cCBhbmQgaXQncyBlbXB0eSlcblx0XHRcdC8vIFRyaWdnZXIgdGhlIGNoYW5nZSBldmVudCB3aGVuIHRoZSBhY3RpdmUgZWRpdG9yIGNoYW5nZXNcblx0XHRcdGNvbnN0IG9uRGlkQ2hhbmdlRW1pdHRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRcdG9uRGlkQ2hhbmdlID0gb25EaWRDaGFuZ2VFbWl0dGVyLmV2ZW50O1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4gb25EaWRDaGFuZ2VFbWl0dGVyLmZpcmUoKSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGFjdGlvbnMsIG9uRGlkQ2hhbmdlIH07XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gVGhlbWFibGVcblxuXHRvdmVycmlkZSB1cGRhdGVTdHlsZXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgaXNFbXB0eSA9IHRoaXMuaXNFbXB0eTtcblxuXHRcdC8vIENvbnRhaW5lclxuXHRcdGlmIChpc0VtcHR5KSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gdGhpcy5nZXRDb2xvcihFRElUT1JfR1JPVVBfRU1QVFlfQkFDS0dST1VORCkgfHwgJyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAnJztcblx0XHR9XG5cblx0XHQvLyBUaXRsZSBjb250cm9sXG5cdFx0Y29uc3QgYm9yZGVyQ29sb3IgPSB0aGlzLmdldENvbG9yKEVESVRPUl9HUk9VUF9IRUFERVJfQk9SREVSKSB8fCB0aGlzLmdldENvbG9yKGNvbnRyYXN0Qm9yZGVyKTtcblx0XHRpZiAoIWlzRW1wdHkgJiYgYm9yZGVyQ29sb3IpIHtcblx0XHRcdHRoaXMudGl0bGVDb250YWluZXIuY2xhc3NMaXN0LmFkZCgndGl0bGUtYm9yZGVyLWJvdHRvbScpO1xuXHRcdFx0dGhpcy50aXRsZUNvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnLS10aXRsZS1ib3JkZXItYm90dG9tLWNvbG9yJywgYm9yZGVyQ29sb3IpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRpdGxlQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ3RpdGxlLWJvcmRlci1ib3R0b20nKTtcblx0XHRcdHRoaXMudGl0bGVDb250YWluZXIuc3R5bGUucmVtb3ZlUHJvcGVydHkoJy0tdGl0bGUtYm9yZGVyLWJvdHRvbS1jb2xvcicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgc2hvd1RhYnMgfSA9IHRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucztcblx0XHR0aGlzLnRpdGxlQ29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHRoaXMuZ2V0Q29sb3Ioc2hvd1RhYnMgPT09ICdtdWx0aXBsZScgPyBFRElUT1JfR1JPVVBfSEVBREVSX1RBQlNfQkFDS0dST1VORCA6IEVESVRPUl9HUk9VUF9IRUFERVJfTk9fVEFCU19CQUNLR1JPVU5EKSB8fCAnJztcblxuXHRcdC8vIEVkaXRvciBjb250YWluZXJcblx0XHR0aGlzLmVkaXRvckNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSB0aGlzLmdldENvbG9yKGVkaXRvckJhY2tncm91bmQpIHx8ICcnO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIElTZXJpYWxpemFibGVWaWV3XG5cblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQgPSAkKCdkaXYnKTtcblxuXHRnZXQgbWluaW11bVdpZHRoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLmVkaXRvclBhbmUubWluaW11bVdpZHRoOyB9XG5cdGdldCBtaW5pbXVtSGVpZ2h0KCk6IG51bWJlciB7IHJldHVybiB0aGlzLmVkaXRvclBhbmUubWluaW11bUhlaWdodDsgfVxuXHRnZXQgbWF4aW11bVdpZHRoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLmVkaXRvclBhbmUubWF4aW11bVdpZHRoOyB9XG5cdGdldCBtYXhpbXVtSGVpZ2h0KCk6IG51bWJlciB7IHJldHVybiB0aGlzLmVkaXRvclBhbmUubWF4aW11bUhlaWdodDsgfVxuXG5cdGdldCBwcm9wb3J0aW9uYWxMYXlvdXQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmxhc3RMYXlvdXQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiAhKHRoaXMubGFzdExheW91dC53aWR0aCA9PT0gdGhpcy5taW5pbXVtV2lkdGggfHwgdGhpcy5sYXN0TGF5b3V0LmhlaWdodCA9PT0gdGhpcy5taW5pbXVtSGVpZ2h0KTtcblx0fVxuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJlbGF5PHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0bGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCB0b3A6IG51bWJlciwgbGVmdDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5sYXN0TGF5b3V0ID0geyB3aWR0aCwgaGVpZ2h0LCB0b3AsIGxlZnQgfTtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnbWF4LWhlaWdodC00NzhweCcsIGhlaWdodCA8PSA0NzgpO1xuXG5cdFx0Ly8gS2VlcCB0aXRsZSBjb250ZW50IGZ1bGwtd2lkdGggd2hpbGUgdGhlIGVkaXRvciBwYW5lIGZvbGxvd3MgdGhlIGNvbnRlbnQgaW5zZXQuXG5cdFx0Y29uc3QgdGl0bGVDb250cm9sU2l6ZSA9IHRoaXMudGl0bGVDb250cm9sLmxheW91dCh7XG5cdFx0XHRjb250YWluZXI6IG5ldyBEaW1lbnNpb24od2lkdGgsIGhlaWdodCksXG5cdFx0XHRhdmFpbGFibGU6IG5ldyBEaW1lbnNpb24od2lkdGgsIGhlaWdodCAtIHRoaXMuZWRpdG9yUGFuZS5taW5pbXVtSGVpZ2h0KVxuXHRcdH0pO1xuXG5cdFx0Ly8gVXBkYXRlIHByb2dyZXNzIGJhciBsb2NhdGlvblxuXHRcdHRoaXMucHJvZ3Jlc3NCYXIuZ2V0Q29udGFpbmVyKCkuc3R5bGUudG9wID0gYCR7TWF0aC5tYXgodGhpcy50aXRsZUhlaWdodC5vZmZzZXQgLSAyLCAwKX1weGA7XG5cblx0XHQvLyBUaGUgZWRpdG9yIHBhbmUgaXMgaW5zZXQgb24gdGhlIHJpZ2h0IGJ5IGBfY29udGVudFJpZ2h0SW5zZXRgIHNvIGEgZG9ja2VkXG5cdFx0Ly8gcGFuZWwgY2FuIHNpdCBiZXNpZGUgaXQgdW5kZXIgdGhlIGZ1bGwtd2lkdGggdGl0bGUgKDAgPSBmaWxsIHRoZSBncm91cCkuXG5cdFx0Y29uc3QgY29udGVudFdpZHRoID0gTWF0aC5tYXgoMCwgd2lkdGggLSB0aGlzLl9jb250ZW50UmlnaHRJbnNldCk7XG5cdFx0Y29uc3QgZWRpdG9ySGVpZ2h0ID0gTWF0aC5tYXgoMCwgaGVpZ2h0IC0gdGl0bGVDb250cm9sU2l6ZS5oZWlnaHQpO1xuXHRcdHRoaXMuZWRpdG9yQ29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7Y29udGVudFdpZHRofXB4YDtcblx0XHR0aGlzLmVkaXRvckNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtlZGl0b3JIZWlnaHR9cHhgO1xuXHRcdHRoaXMuZWRpdG9yUGFuZS5sYXlvdXQoeyB3aWR0aDogY29udGVudFdpZHRoLCBoZWlnaHQ6IGVkaXRvckhlaWdodCwgdG9wOiB0b3AgKyB0aXRsZUNvbnRyb2xTaXplLmhlaWdodCwgbGVmdCB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXRzIHRoZSByaWdodCBpbnNldCByZXNlcnZlZCBiZXNpZGUgdGhlIGJyZWFkY3J1bWJzIGFuZCBlZGl0b3IgcGFuZSB3aGlsZSB0YWJzIHJlbWFpbiBmdWxsLXdpZHRoLlxuXHQgKiBgMGAgcmVzdG9yZXMgdGhlIGRlZmF1bHQgZnVsbC13aWR0aCBjb250ZW50LlxuXHQgKi9cblx0c2V0Q29udGVudFJpZ2h0SW5zZXQoaW5zZXQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IG5leHQgPSBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKGluc2V0KSk7XG5cdFx0aWYgKG5leHQgPT09IHRoaXMuX2NvbnRlbnRSaWdodEluc2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2NvbnRlbnRSaWdodEluc2V0ID0gbmV4dDtcblx0XHR0aGlzLnJlbGF5b3V0KCk7XG5cdH1cblxuXHRyZWxheW91dCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5sYXN0TGF5b3V0KSB7XG5cdFx0XHRjb25zdCB7IHdpZHRoLCBoZWlnaHQsIHRvcCwgbGVmdCB9ID0gdGhpcy5sYXN0TGF5b3V0O1xuXHRcdFx0dGhpcy5sYXlvdXQod2lkdGgsIGhlaWdodCwgdG9wLCBsZWZ0KTtcblx0XHRcdHRoaXMuX29uRGlkUmVsYXlvdXQuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHNldEJvdW5kYXJ5U2FzaGVzKHNhc2hlczogSUJvdW5kYXJ5U2FzaGVzKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3JQYW5lLnNldEJvdW5kYXJ5U2FzaGVzKHNhc2hlcyk7XG5cdH1cblxuXHR0b0pTT04oKTogSVNlcmlhbGl6ZWRFZGl0b3JHcm91cE1vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5zZXJpYWxpemUoKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zZWQgPSB0cnVlO1xuXG5cdFx0dGhpcy5fb25XaWxsRGlzcG9zZS5maXJlKCk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBFZGl0b3JSZXBsYWNlbWVudCBleHRlbmRzIElFZGl0b3JSZXBsYWNlbWVudCB7XG5cdHJlYWRvbmx5IGVkaXRvcjogRWRpdG9ySW5wdXQ7XG5cdHJlYWRvbmx5IHJlcGxhY2VtZW50OiBFZGl0b3JJbnB1dDtcblx0cmVhZG9ubHkgb3B0aW9ucz86IElFZGl0b3JPcHRpb25zO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxrQkFBMkYseUJBQXlCLHdCQUF3QixvQ0FBb0M7QUFDekwsU0FBMEIsZ0JBQWdELFlBQTJDLGNBQWtDLHdCQUF3Qix5QkFBOEMsNEJBQTRCLGtCQUFrQixvQkFBcUYsc0JBQW9FLDJCQUEyQjtBQUMvYixTQUFTLGdDQUFnQywwQkFBMEIsZ0NBQWdDLDJCQUEyQiwyQkFBMkIsZ0NBQWdDLGlDQUFpQyxvQkFBb0IseUJBQXlCLHVDQUF1QyxvQ0FBb0MsK0JBQStCLGlDQUFpQyxnQ0FBZ0MscUJBQXFCLDZCQUE2Qiw4QkFBOEIsc0NBQXNDLG1DQUFtQyx1Q0FBdUMsa0NBQWtDLHdEQUF3RCxzQ0FBc0M7QUFFbHZCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsU0FBZ0IsYUFBYTtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLFdBQVcsWUFBWSx1QkFBdUIsV0FBVyxhQUFhLHFCQUFxQixZQUFrQyxjQUFjLGlCQUFpQixXQUFXLGtCQUFrQixTQUFTO0FBQzNNLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZUFBZSxnQkFBZ0I7QUFDeEMsU0FBUyxrQkFBa0Isc0JBQXNCO0FBQ2pELFNBQVMs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
