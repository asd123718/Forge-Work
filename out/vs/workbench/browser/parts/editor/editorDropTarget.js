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
import "./media/editordroptarget.css";
import { DataTransfers } from "../../../../base/browser/dnd.js";
import { $, addDisposableListener, DragAndDropObserver, EventHelper, EventType, getWindow, isAncestor } from "../../../../base/browser/dom.js";
import { renderFormattedText } from "../../../../base/browser/formattedTextRenderer.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { toDisposable } from "../../../../base/common/lifecycle.js";
import { isMacintosh, isWeb } from "../../../../base/common/platform.js";
import { assertReturnsAllDefined, assertReturnsDefined } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { activeContrastBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { isTemporaryWorkspace, IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { CodeDataTransfers, containsDragType, Extensions as DragAndDropExtensions, LocalSelectionTransfer } from "../../../../platform/dnd/browser/dnd.js";
import { DraggedEditorGroupIdentifier, DraggedEditorIdentifier, extractTreeDropData, ResourcesDropHandler } from "../../dnd.js";
import { prepareMoveCopyEditors } from "./editor.js";
import { EditorInputCapabilities } from "../../../common/editor.js";
import { EDITOR_DRAG_AND_DROP_BACKGROUND, EDITOR_DROP_INTO_PROMPT_BACKGROUND, EDITOR_DROP_INTO_PROMPT_BORDER, EDITOR_DROP_INTO_PROMPT_FOREGROUND } from "../../../common/theme.js";
import { GroupDirection, IEditorGroupsService, MergeGroupMode } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ITreeViewsDnDService } from "../../../../editor/common/services/treeViewsDndService.js";
import { DraggedTreeItemsIdentifier } from "../../../../editor/common/services/treeViewsDnd.js";
function isDropIntoEditorEnabledGlobally(configurationService) {
  return configurationService.getValue("editor.dropIntoEditor.enabled");
}
function isDragIntoEditorEvent(e) {
  return e.shiftKey;
}
let DropOverlay = class extends Themable {
  constructor(groupView, themeService, configurationService, instantiationService, editorService, editorGroupService, treeViewsDragAndDropService, contextService) {
    super(themeService);
    this.groupView = groupView;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.editorService = editorService;
    this.editorGroupService = editorGroupService;
    this.treeViewsDragAndDropService = treeViewsDragAndDropService;
    this.contextService = contextService;
    this.editorTransfer = LocalSelectionTransfer.getInstance();
    this.groupTransfer = LocalSelectionTransfer.getInstance();
    this.treeItemsTransfer = LocalSelectionTransfer.getInstance();
    this.cleanupOverlayScheduler = this._register(new RunOnceScheduler(() => this.dispose(), 300));
    this.enableDropIntoEditor = isDropIntoEditorEnabledGlobally(this.configurationService) && this.isDropIntoActiveEditorEnabled();
    this.create();
  }
  get disposed() {
    return !!this._disposed;
  }
  create() {
    const overlayOffsetHeight = this.getOverlayOffsetHeight();
    const container = this.container = $("div", { id: DropOverlay.OVERLAY_ID });
    container.style.top = `${overlayOffsetHeight}px`;
    this.groupView.element.appendChild(container);
    this.groupView.element.classList.add("dragged-over");
    this._register(toDisposable(() => {
      container.remove();
      this.groupView.element.classList.remove("dragged-over");
    }));
    this.overlay = $(".editor-group-overlay-indicator");
    container.appendChild(this.overlay);
    if (this.enableDropIntoEditor) {
      this.dropIntoPromptElement = renderFormattedText(localize("dropIntoEditorPrompt", "Hold __{0}__ to drop into editor", isMacintosh ? "\u21E7" : "Shift"), {});
      this.dropIntoPromptElement.classList.add("editor-group-overlay-drop-into-prompt");
      this.overlay.appendChild(this.dropIntoPromptElement);
    }
    this.registerListeners(container);
    this.updateStyles();
  }
  updateStyles() {
    const overlay = assertReturnsDefined(this.overlay);
    overlay.style.backgroundColor = this.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND) || "";
    const activeContrastBorderColor = this.getColor(activeContrastBorder);
    overlay.style.outlineColor = activeContrastBorderColor || "";
    overlay.style.outlineOffset = activeContrastBorderColor ? "-2px" : "";
    overlay.style.outlineStyle = activeContrastBorderColor ? "dashed" : "";
    overlay.style.outlineWidth = activeContrastBorderColor ? "2px" : "";
    if (this.dropIntoPromptElement) {
      this.dropIntoPromptElement.style.backgroundColor = this.getColor(EDITOR_DROP_INTO_PROMPT_BACKGROUND) ?? "";
      this.dropIntoPromptElement.style.color = this.getColor(EDITOR_DROP_INTO_PROMPT_FOREGROUND) ?? "";
      const borderColor = this.getColor(EDITOR_DROP_INTO_PROMPT_BORDER);
      if (borderColor) {
        this.dropIntoPromptElement.style.borderWidth = "1px";
        this.dropIntoPromptElement.style.borderStyle = "solid";
        this.dropIntoPromptElement.style.borderColor = borderColor;
      } else {
        this.dropIntoPromptElement.style.borderWidth = "0";
      }
    }
  }
  registerListeners(container) {
    this._register(new DragAndDropObserver(container, {
      onDragOver: (e) => {
        if (this.enableDropIntoEditor && isDragIntoEditorEvent(e)) {
          this.dispose();
          return;
        }
        const isDraggingGroup = this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype);
        const isDraggingEditor = this.editorTransfer.hasData(DraggedEditorIdentifier.prototype);
        if (!isDraggingEditor && !isDraggingGroup && e.dataTransfer) {
          e.dataTransfer.dropEffect = "copy";
        }
        let isCopy = true;
        if (isDraggingGroup) {
          isCopy = this.isCopyOperation(e);
        } else if (isDraggingEditor) {
          const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
          if (Array.isArray(data) && data.length > 0) {
            isCopy = this.isCopyOperation(e, data[0].identifier);
          }
        }
        if (!isCopy) {
          const sourceGroupView = this.findSourceGroupView();
          if (sourceGroupView === this.groupView) {
            if (isDraggingGroup || isDraggingEditor && sourceGroupView.count < 2) {
              this.hideOverlay();
              return;
            }
          }
        }
        let splitOnDragAndDrop = !!this.groupView.groupsView.partOptions.splitOnDragAndDrop;
        if (this.isToggleSplitOperation(e)) {
          splitOnDragAndDrop = !splitOnDragAndDrop;
        }
        this.positionOverlay(e.offsetX, e.offsetY, isDraggingGroup, splitOnDragAndDrop);
        if (this.cleanupOverlayScheduler.isScheduled()) {
          this.cleanupOverlayScheduler.cancel();
        }
      },
      onDragLeave: (e) => this.dispose(),
      onDragEnd: (e) => this.dispose(),
      onDrop: (e) => {
        EventHelper.stop(e, true);
        this.dispose();
        if (this.currentDropOperation) {
          this.handleDrop(e, this.currentDropOperation.splitDirection);
        }
      }
    }));
    this._register(addDisposableListener(container, EventType.MOUSE_OVER, () => {
      if (!this.cleanupOverlayScheduler.isScheduled()) {
        this.cleanupOverlayScheduler.schedule();
      }
    }));
  }
  isDropIntoActiveEditorEnabled() {
    return !!this.groupView.activeEditor?.hasCapability(EditorInputCapabilities.CanDropIntoEditor);
  }
  findSourceGroupView() {
    if (this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) {
      const data = this.groupTransfer.getData(DraggedEditorGroupIdentifier.prototype);
      if (Array.isArray(data) && data.length > 0) {
        return this.editorGroupService.getGroup(data[0].identifier);
      }
    } else if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
      const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
      if (Array.isArray(data) && data.length > 0) {
        return this.editorGroupService.getGroup(data[0].identifier.groupId);
      }
    }
    return void 0;
  }
  async handleDrop(event, splitDirection) {
    const ensureTargetGroup = () => {
      let targetGroup;
      if (typeof splitDirection === "number") {
        targetGroup = this.editorGroupService.addGroup(this.groupView, splitDirection);
      } else {
        targetGroup = this.groupView;
      }
      return targetGroup;
    };
    if (this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) {
      const data = this.groupTransfer.getData(DraggedEditorGroupIdentifier.prototype);
      if (Array.isArray(data) && data.length > 0) {
        const sourceGroup = this.editorGroupService.getGroup(data[0].identifier);
        if (sourceGroup) {
          if (typeof splitDirection !== "number" && sourceGroup === this.groupView) {
            return;
          }
          let targetGroup;
          if (typeof splitDirection === "number") {
            if (this.isCopyOperation(event)) {
              targetGroup = this.editorGroupService.copyGroup(sourceGroup, this.groupView, splitDirection);
            } else {
              targetGroup = this.editorGroupService.moveGroup(sourceGroup, this.groupView, splitDirection);
            }
          } else {
            let mergeGroupOptions = void 0;
            if (this.isCopyOperation(event)) {
              mergeGroupOptions = { mode: MergeGroupMode.COPY_EDITORS };
            }
            this.editorGroupService.mergeGroup(sourceGroup, this.groupView, mergeGroupOptions);
          }
          if (targetGroup) {
            this.editorGroupService.activateGroup(targetGroup);
          }
        }
        this.groupTransfer.clearData(DraggedEditorGroupIdentifier.prototype);
      }
    } else if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
      const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
      if (Array.isArray(data) && data.length > 0) {
        const draggedEditors = data;
        const firstDraggedEditor = data[0].identifier;
        const sourceGroup = this.editorGroupService.getGroup(firstDraggedEditor.groupId);
        if (sourceGroup) {
          const copyEditor = this.isCopyOperation(event, firstDraggedEditor);
          let targetGroup = void 0;
          if (this.groupView.groupsView.partOptions.closeEmptyGroups && sourceGroup.count === 1 && typeof splitDirection === "number" && !copyEditor) {
            targetGroup = this.editorGroupService.moveGroup(sourceGroup, this.groupView, splitDirection);
          } else {
            targetGroup = ensureTargetGroup();
            if (sourceGroup === targetGroup) {
              return;
            }
            const editorsWithOptions = prepareMoveCopyEditors(this.groupView, draggedEditors.map((editor) => editor.identifier.editor));
            if (!copyEditor) {
              sourceGroup.moveEditors(editorsWithOptions, targetGroup);
            } else {
              sourceGroup.copyEditors(editorsWithOptions, targetGroup);
            }
          }
          targetGroup.focus();
        }
        this.editorTransfer.clearData(DraggedEditorIdentifier.prototype);
      }
    } else if (this.treeItemsTransfer.hasData(DraggedTreeItemsIdentifier.prototype)) {
      const data = this.treeItemsTransfer.getData(DraggedTreeItemsIdentifier.prototype);
      if (Array.isArray(data) && data.length > 0) {
        const editors = [];
        for (const id of data) {
          const dataTransferItem = await this.treeViewsDragAndDropService.removeDragOperationTransfer(id.identifier);
          if (dataTransferItem) {
            const treeDropData = await extractTreeDropData(dataTransferItem);
            editors.push(...treeDropData.map((editor) => ({ ...editor, options: { ...editor.options, pinned: true } })));
          }
        }
        if (editors.length) {
          this.editorService.openEditors(editors, ensureTargetGroup(), { validateTrust: true });
        }
      }
      this.treeItemsTransfer.clearData(DraggedTreeItemsIdentifier.prototype);
    } else {
      const dropHandler = this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: !isWeb || isTemporaryWorkspace(this.contextService.getWorkspace()) });
      dropHandler.handleDrop(event, getWindow(this.groupView.element), () => ensureTargetGroup(), (targetGroup) => targetGroup?.focus());
    }
  }
  isCopyOperation(e, draggedEditor) {
    if (draggedEditor?.editor.hasCapability(EditorInputCapabilities.Singleton)) {
      return false;
    }
    return e.ctrlKey && !isMacintosh || e.altKey && isMacintosh;
  }
  isToggleSplitOperation(e) {
    return e.altKey && !isMacintosh || e.shiftKey && isMacintosh;
  }
  positionOverlay(mousePosX, mousePosY, isDraggingGroup, enableSplitting) {
    const preferSplitVertically = this.groupView.groupsView.partOptions.openSideBySideDirection === "right";
    const editorControlWidth = this.groupView.element.clientWidth;
    const editorControlHeight = this.groupView.element.clientHeight - this.getOverlayOffsetHeight();
    let edgeWidthThresholdFactor;
    let edgeHeightThresholdFactor;
    if (enableSplitting) {
      if (isDraggingGroup) {
        edgeWidthThresholdFactor = preferSplitVertically ? 0.3 : 0.1;
      } else {
        edgeWidthThresholdFactor = 0.1;
      }
      if (isDraggingGroup) {
        edgeHeightThresholdFactor = preferSplitVertically ? 0.1 : 0.3;
      } else {
        edgeHeightThresholdFactor = 0.1;
      }
    } else {
      edgeWidthThresholdFactor = 0;
      edgeHeightThresholdFactor = 0;
    }
    const edgeWidthThreshold = editorControlWidth * edgeWidthThresholdFactor;
    const edgeHeightThreshold = editorControlHeight * edgeHeightThresholdFactor;
    const splitWidthThreshold = editorControlWidth / 3;
    const splitHeightThreshold = editorControlHeight / 3;
    let splitDirection;
    if (mousePosX > edgeWidthThreshold && mousePosX < editorControlWidth - edgeWidthThreshold && mousePosY > edgeHeightThreshold && mousePosY < editorControlHeight - edgeHeightThreshold) {
      splitDirection = void 0;
    } else {
      if (preferSplitVertically) {
        if (mousePosX < splitWidthThreshold) {
          splitDirection = GroupDirection.LEFT;
        } else if (mousePosX > splitWidthThreshold * 2) {
          splitDirection = GroupDirection.RIGHT;
        } else if (mousePosY < editorControlHeight / 2) {
          splitDirection = GroupDirection.UP;
        } else {
          splitDirection = GroupDirection.DOWN;
        }
      } else {
        if (mousePosY < splitHeightThreshold) {
          splitDirection = GroupDirection.UP;
        } else if (mousePosY > splitHeightThreshold * 2) {
          splitDirection = GroupDirection.DOWN;
        } else if (mousePosX < editorControlWidth / 2) {
          splitDirection = GroupDirection.LEFT;
        } else {
          splitDirection = GroupDirection.RIGHT;
        }
      }
    }
    switch (splitDirection) {
      case GroupDirection.UP:
        this.doPositionOverlay({ top: "0", left: "0", width: "100%", height: "50%" });
        this.toggleDropIntoPrompt(false);
        break;
      case GroupDirection.DOWN:
        this.doPositionOverlay({ top: "50%", left: "0", width: "100%", height: "50%" });
        this.toggleDropIntoPrompt(false);
        break;
      case GroupDirection.LEFT:
        this.doPositionOverlay({ top: "0", left: "0", width: "50%", height: "100%" });
        this.toggleDropIntoPrompt(false);
        break;
      case GroupDirection.RIGHT:
        this.doPositionOverlay({ top: "0", left: "50%", width: "50%", height: "100%" });
        this.toggleDropIntoPrompt(false);
        break;
      default:
        this.doPositionOverlay({ top: "0", left: "0", width: "100%", height: "100%" });
        this.toggleDropIntoPrompt(true);
    }
    const overlay = assertReturnsDefined(this.overlay);
    overlay.style.opacity = "1";
    setTimeout(() => overlay.classList.add("overlay-move-transition"), 0);
    this.currentDropOperation = { splitDirection };
  }
  doPositionOverlay(options) {
    const [container, overlay] = assertReturnsAllDefined(this.container, this.overlay);
    const offsetHeight = this.getOverlayOffsetHeight();
    if (offsetHeight) {
      container.style.height = `calc(100% - ${offsetHeight}px)`;
    } else {
      container.style.height = "100%";
    }
    overlay.style.top = options.top;
    overlay.style.left = options.left;
    overlay.style.width = options.width;
    overlay.style.height = options.height;
  }
  getOverlayOffsetHeight() {
    if (!this.groupView.isEmpty && this.groupView.groupsView.partOptions.showTabs === "multiple") {
      return this.groupView.titleHeight.offset;
    }
    return 0;
  }
  hideOverlay() {
    const overlay = assertReturnsDefined(this.overlay);
    this.doPositionOverlay({ top: "0", left: "0", width: "100%", height: "100%" });
    overlay.style.opacity = "0";
    overlay.classList.remove("overlay-move-transition");
    this.currentDropOperation = void 0;
  }
  toggleDropIntoPrompt(showing) {
    if (!this.dropIntoPromptElement) {
      return;
    }
    this.dropIntoPromptElement.style.opacity = showing ? "1" : "0";
  }
  contains(element) {
    return element === this.container || element === this.overlay;
  }
  dispose() {
    super.dispose();
    this._disposed = true;
  }
};
DropOverlay.OVERLAY_ID = "monaco-workbench-editor-drop-overlay";
DropOverlay = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, IEditorGroupsService),
  __decorateParam(6, ITreeViewsDnDService),
  __decorateParam(7, IWorkspaceContextService)
], DropOverlay);
let EditorDropTarget = class extends Themable {
  constructor(groupsView, container, delegate, editorGroupService, themeService, configurationService, instantiationService) {
    super(themeService);
    this.groupsView = groupsView;
    this.container = container;
    this.delegate = delegate;
    this.editorGroupService = editorGroupService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.counter = 0;
    this.editorTransfer = LocalSelectionTransfer.getInstance();
    this.groupTransfer = LocalSelectionTransfer.getInstance();
    this.registerListeners();
  }
  get overlay() {
    if (this._overlay && !this._overlay.disposed) {
      return this._overlay;
    }
    return void 0;
  }
  registerListeners() {
    this._register(addDisposableListener(this.container, EventType.DRAG_ENTER, (e) => this.onDragEnter(e)));
    this._register(addDisposableListener(this.container, EventType.DRAG_LEAVE, () => this.onDragLeave()));
    for (const target of [this.container, getWindow(this.container)]) {
      this._register(addDisposableListener(target, EventType.DRAG_END, () => this.onDragEnd()));
    }
  }
  onDragEnter(event) {
    if (isDropIntoEditorEnabledGlobally(this.configurationService) && isDragIntoEditorEvent(event)) {
      return;
    }
    this.counter++;
    if (!this.editorTransfer.hasData(DraggedEditorIdentifier.prototype) && !this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype) && event.dataTransfer) {
      const dndContributions = Registry.as(DragAndDropExtensions.DragAndDropContribution).getAll();
      const dndContributionKeys = Array.from(dndContributions).map((e) => e.dataFormatKey);
      if (!containsDragType(event, DataTransfers.FILES, CodeDataTransfers.FILES, DataTransfers.RESOURCES, CodeDataTransfers.EDITORS, ...dndContributionKeys)) {
        event.dataTransfer.dropEffect = "none";
        return;
      }
    }
    if (!this.groupsView.partOptions.allowDropIntoGroup) {
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "none";
      }
      return;
    }
    this.updateContainer(true);
    const target = event.target;
    if (target) {
      if (this.overlay && !this.overlay.contains(target)) {
        this.disposeOverlay();
      }
      if (!this.overlay) {
        const targetGroupView = this.findTargetGroupView(target);
        if (targetGroupView) {
          this._overlay = this.instantiationService.createInstance(DropOverlay, targetGroupView);
        }
      }
    }
  }
  onDragLeave() {
    this.counter--;
    if (this.counter === 0) {
      this.updateContainer(false);
    }
  }
  onDragEnd() {
    this.counter = 0;
    this.updateContainer(false);
    this.disposeOverlay();
  }
  findTargetGroupView(child) {
    const groups = this.editorGroupService.groups;
    return groups.find((groupView) => isAncestor(child, groupView.element) || this.delegate.containsGroup?.(groupView));
  }
  updateContainer(isDraggedOver) {
    this.container.classList.toggle("dragged-over", isDraggedOver);
  }
  dispose() {
    super.dispose();
    this.disposeOverlay();
  }
  disposeOverlay() {
    if (this.overlay) {
      this.overlay.dispose();
      this._overlay = void 0;
    }
  }
};
EditorDropTarget = __decorateClass([
  __decorateParam(3, IEditorGroupsService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IInstantiationService)
], EditorDropTarget);
export {
  EditorDropTarget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGVkaXRvckRyb3BUYXJnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvZWRpdG9yZHJvcHRhcmdldC5jc3MnO1xuaW1wb3J0IHsgRGF0YVRyYW5zZmVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBEcmFnQW5kRHJvcE9ic2VydmVyLCBFdmVudEhlbHBlciwgRXZlbnRUeXBlLCBnZXRXaW5kb3csIGlzQW5jZXN0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckZvcm1hdHRlZFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZm9ybWF0dGVkVGV4dFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2gsIGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0FsbERlZmluZWQsIGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSwgVGhlbWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzVGVtcG9yYXJ5V29ya3NwYWNlLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBDb2RlRGF0YVRyYW5zZmVycywgY29udGFpbnNEcmFnVHlwZSwgRXh0ZW5zaW9ucyBhcyBEcmFnQW5kRHJvcEV4dGVuc2lvbnMsIElEcmFnQW5kRHJvcENvbnRyaWJ1dGlvblJlZ2lzdHJ5LCBMb2NhbFNlbGVjdGlvblRyYW5zZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZG5kL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IERyYWdnZWRFZGl0b3JHcm91cElkZW50aWZpZXIsIERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLCBleHRyYWN0VHJlZURyb3BEYXRhLCBSZXNvdXJjZXNEcm9wSGFuZGxlciB9IGZyb20gJy4uLy4uL2RuZC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzVmlldywgSUVkaXRvckdyb3VwVmlldywgcHJlcGFyZU1vdmVDb3B5RWRpdG9ycyB9IGZyb20gJy4vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLCBJRWRpdG9ySWRlbnRpZmllciwgSVVudHlwZWRFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRURJVE9SX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCwgRURJVE9SX0RST1BfSU5UT19QUk9NUFRfQkFDS0dST1VORCwgRURJVE9SX0RST1BfSU5UT19QUk9NUFRfQk9SREVSLCBFRElUT1JfRFJPUF9JTlRPX1BST01QVF9GT1JFR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IEdyb3VwRGlyZWN0aW9uLCBJRWRpdG9yRHJvcFRhcmdldERlbGVnYXRlLCBJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cHNTZXJ2aWNlLCBJTWVyZ2VHcm91cE9wdGlvbnMsIE1lcmdlR3JvdXBNb2RlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUcmVlVmlld3NEbkRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90cmVlVmlld3NEbmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERyYWdnZWRUcmVlSXRlbXNJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90cmVlVmlld3NEbmQuanMnO1xuXG5pbnRlcmZhY2UgSURyb3BPcGVyYXRpb24ge1xuXHRzcGxpdERpcmVjdGlvbj86IEdyb3VwRGlyZWN0aW9uO1xufVxuXG5mdW5jdGlvbiBpc0Ryb3BJbnRvRWRpdG9yRW5hYmxlZEdsb2JhbGx5KGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpIHtcblx0cmV0dXJuIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdlZGl0b3IuZHJvcEludG9FZGl0b3IuZW5hYmxlZCcpO1xufVxuXG5mdW5jdGlvbiBpc0RyYWdJbnRvRWRpdG9yRXZlbnQoZTogRHJhZ0V2ZW50KTogYm9vbGVhbiB7XG5cdHJldHVybiBlLnNoaWZ0S2V5O1xufVxuXG5jbGFzcyBEcm9wT3ZlcmxheSBleHRlbmRzIFRoZW1hYmxlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBPVkVSTEFZX0lEID0gJ21vbmFjby13b3JrYmVuY2gtZWRpdG9yLWRyb3Atb3ZlcmxheSc7XG5cblx0cHJpdmF0ZSBjb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG92ZXJsYXk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGRyb3BJbnRvUHJvbXB0RWxlbWVudD86IEhUTUxTcGFuRWxlbWVudDtcblxuXHRwcml2YXRlIGN1cnJlbnREcm9wT3BlcmF0aW9uOiBJRHJvcE9wZXJhdGlvbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9kaXNwb3NlZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0Z2V0IGRpc3Bvc2VkKCk6IGJvb2xlYW4geyByZXR1cm4gISF0aGlzLl9kaXNwb3NlZDsgfVxuXG5cdHByaXZhdGUgY2xlYW51cE92ZXJsYXlTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JUcmFuc2ZlciA9IExvY2FsU2VsZWN0aW9uVHJhbnNmZXIuZ2V0SW5zdGFuY2U8RHJhZ2dlZEVkaXRvcklkZW50aWZpZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZ3JvdXBUcmFuc2ZlciA9IExvY2FsU2VsZWN0aW9uVHJhbnNmZXIuZ2V0SW5zdGFuY2U8RHJhZ2dlZEVkaXRvckdyb3VwSWRlbnRpZmllcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB0cmVlSXRlbXNUcmFuc2ZlciA9IExvY2FsU2VsZWN0aW9uVHJhbnNmZXIuZ2V0SW5zdGFuY2U8RHJhZ2dlZFRyZWVJdGVtc0lkZW50aWZpZXI+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBlbmFibGVEcm9wSW50b0VkaXRvcjogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGdyb3VwVmlldzogSUVkaXRvckdyb3VwVmlldyxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASVRyZWVWaWV3c0RuRFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0cmVlVmlld3NEcmFnQW5kRHJvcFNlcnZpY2U6IElUcmVlVmlld3NEbkRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHRoZW1lU2VydmljZSk7XG5cblx0XHR0aGlzLmNsZWFudXBPdmVybGF5U2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5kaXNwb3NlKCksIDMwMCkpO1xuXG5cdFx0dGhpcy5lbmFibGVEcm9wSW50b0VkaXRvciA9IGlzRHJvcEludG9FZGl0b3JFbmFibGVkR2xvYmFsbHkodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkgJiYgdGhpcy5pc0Ryb3BJbnRvQWN0aXZlRWRpdG9yRW5hYmxlZCgpO1xuXG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IG92ZXJsYXlPZmZzZXRIZWlnaHQgPSB0aGlzLmdldE92ZXJsYXlPZmZzZXRIZWlnaHQoKTtcblxuXHRcdC8vIENvbnRhaW5lclxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuY29udGFpbmVyID0gJCgnZGl2JywgeyBpZDogRHJvcE92ZXJsYXkuT1ZFUkxBWV9JRCB9KTtcblx0XHRjb250YWluZXIuc3R5bGUudG9wID0gYCR7b3ZlcmxheU9mZnNldEhlaWdodH1weGA7XG5cblx0XHQvLyBQYXJlbnRcblx0XHR0aGlzLmdyb3VwVmlldy5lbGVtZW50LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0dGhpcy5ncm91cFZpZXcuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdkcmFnZ2VkLW92ZXInKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Y29udGFpbmVyLnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5ncm91cFZpZXcuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdkcmFnZ2VkLW92ZXInKTtcblx0XHR9KSk7XG5cblx0XHQvLyBPdmVybGF5XG5cdFx0dGhpcy5vdmVybGF5ID0gJCgnLmVkaXRvci1ncm91cC1vdmVybGF5LWluZGljYXRvcicpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLm92ZXJsYXkpO1xuXG5cdFx0aWYgKHRoaXMuZW5hYmxlRHJvcEludG9FZGl0b3IpIHtcblx0XHRcdHRoaXMuZHJvcEludG9Qcm9tcHRFbGVtZW50ID0gcmVuZGVyRm9ybWF0dGVkVGV4dChsb2NhbGl6ZSgnZHJvcEludG9FZGl0b3JQcm9tcHQnLCBcIkhvbGQgX197MH1fXyB0byBkcm9wIGludG8gZWRpdG9yXCIsIGlzTWFjaW50b3NoID8gJ1x1MjFFNycgOiAnU2hpZnQnKSwge30pO1xuXHRcdFx0dGhpcy5kcm9wSW50b1Byb21wdEVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZWRpdG9yLWdyb3VwLW92ZXJsYXktZHJvcC1pbnRvLXByb21wdCcpO1xuXHRcdFx0dGhpcy5vdmVybGF5LmFwcGVuZENoaWxkKHRoaXMuZHJvcEludG9Qcm9tcHRFbGVtZW50KTtcblx0XHR9XG5cblx0XHQvLyBPdmVybGF5IEV2ZW50IEhhbmRsaW5nXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycyhjb250YWluZXIpO1xuXG5cdFx0Ly8gU3R5bGVzXG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRjb25zdCBvdmVybGF5ID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5vdmVybGF5KTtcblxuXHRcdC8vIE92ZXJsYXkgZHJvcCBiYWNrZ3JvdW5kXG5cdFx0b3ZlcmxheS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSB0aGlzLmdldENvbG9yKEVESVRPUl9EUkFHX0FORF9EUk9QX0JBQ0tHUk9VTkQpIHx8ICcnO1xuXG5cdFx0Ly8gT3ZlcmxheSBjb250cmFzdCBib3JkZXIgKGlmIGFueSlcblx0XHRjb25zdCBhY3RpdmVDb250cmFzdEJvcmRlckNvbG9yID0gdGhpcy5nZXRDb2xvcihhY3RpdmVDb250cmFzdEJvcmRlcik7XG5cdFx0b3ZlcmxheS5zdHlsZS5vdXRsaW5lQ29sb3IgPSBhY3RpdmVDb250cmFzdEJvcmRlckNvbG9yIHx8ICcnO1xuXHRcdG92ZXJsYXkuc3R5bGUub3V0bGluZU9mZnNldCA9IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyQ29sb3IgPyAnLTJweCcgOiAnJztcblx0XHRvdmVybGF5LnN0eWxlLm91dGxpbmVTdHlsZSA9IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyQ29sb3IgPyAnZGFzaGVkJyA6ICcnO1xuXHRcdG92ZXJsYXkuc3R5bGUub3V0bGluZVdpZHRoID0gYWN0aXZlQ29udHJhc3RCb3JkZXJDb2xvciA/ICcycHgnIDogJyc7XG5cblx0XHRpZiAodGhpcy5kcm9wSW50b1Byb21wdEVsZW1lbnQpIHtcblx0XHRcdHRoaXMuZHJvcEludG9Qcm9tcHRFbGVtZW50LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHRoaXMuZ2V0Q29sb3IoRURJVE9SX0RST1BfSU5UT19QUk9NUFRfQkFDS0dST1VORCkgPz8gJyc7XG5cdFx0XHR0aGlzLmRyb3BJbnRvUHJvbXB0RWxlbWVudC5zdHlsZS5jb2xvciA9IHRoaXMuZ2V0Q29sb3IoRURJVE9SX0RST1BfSU5UT19QUk9NUFRfRk9SRUdST1VORCkgPz8gJyc7XG5cblx0XHRcdGNvbnN0IGJvcmRlckNvbG9yID0gdGhpcy5nZXRDb2xvcihFRElUT1JfRFJPUF9JTlRPX1BST01QVF9CT1JERVIpO1xuXHRcdFx0aWYgKGJvcmRlckNvbG9yKSB7XG5cdFx0XHRcdHRoaXMuZHJvcEludG9Qcm9tcHRFbGVtZW50LnN0eWxlLmJvcmRlcldpZHRoID0gJzFweCc7XG5cdFx0XHRcdHRoaXMuZHJvcEludG9Qcm9tcHRFbGVtZW50LnN0eWxlLmJvcmRlclN0eWxlID0gJ3NvbGlkJztcblx0XHRcdFx0dGhpcy5kcm9wSW50b1Byb21wdEVsZW1lbnQuc3R5bGUuYm9yZGVyQ29sb3IgPSBib3JkZXJDb2xvcjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZHJvcEludG9Qcm9tcHRFbGVtZW50LnN0eWxlLmJvcmRlcldpZHRoID0gJzAnO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG5ldyBEcmFnQW5kRHJvcE9ic2VydmVyKGNvbnRhaW5lciwge1xuXHRcdFx0b25EcmFnT3ZlcjogZSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmVuYWJsZURyb3BJbnRvRWRpdG9yICYmIGlzRHJhZ0ludG9FZGl0b3JFdmVudChlKSkge1xuXHRcdFx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGlzRHJhZ2dpbmdHcm91cCA9IHRoaXMuZ3JvdXBUcmFuc2Zlci5oYXNEYXRhKERyYWdnZWRFZGl0b3JHcm91cElkZW50aWZpZXIucHJvdG90eXBlKTtcblx0XHRcdFx0Y29uc3QgaXNEcmFnZ2luZ0VkaXRvciA9IHRoaXMuZWRpdG9yVHJhbnNmZXIuaGFzRGF0YShEcmFnZ2VkRWRpdG9ySWRlbnRpZmllci5wcm90b3R5cGUpO1xuXG5cdFx0XHRcdC8vIFVwZGF0ZSB0aGUgZHJvcEVmZmVjdCB0byBcImNvcHlcIiBpZiB0aGVyZSBpcyBubyBsb2NhbCBkYXRhIHRvIGJlIGRyYWdnZWQgYmVjYXVzZVxuXHRcdFx0XHQvLyBpbiB0aGF0IGNhc2Ugd2UgY2FuIG9ubHkgY29weSB0aGUgZGF0YSBpbnRvIGFuZCBub3QgbW92ZSBpdCBmcm9tIGl0cyBzb3VyY2Vcblx0XHRcdFx0aWYgKCFpc0RyYWdnaW5nRWRpdG9yICYmICFpc0RyYWdnaW5nR3JvdXAgJiYgZS5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdFx0XHRlLmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ2NvcHknO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRmluZCBvdXQgaWYgb3BlcmF0aW9uIGlzIHZhbGlkXG5cdFx0XHRcdGxldCBpc0NvcHkgPSB0cnVlO1xuXHRcdFx0XHRpZiAoaXNEcmFnZ2luZ0dyb3VwKSB7XG5cdFx0XHRcdFx0aXNDb3B5ID0gdGhpcy5pc0NvcHlPcGVyYXRpb24oZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXNEcmFnZ2luZ0VkaXRvcikge1xuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLmVkaXRvclRyYW5zZmVyLmdldERhdGEoRHJhZ2dlZEVkaXRvcklkZW50aWZpZXIucHJvdG90eXBlKTtcblx0XHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShkYXRhKSAmJiBkYXRhLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGlzQ29weSA9IHRoaXMuaXNDb3B5T3BlcmF0aW9uKGUsIGRhdGFbMF0uaWRlbnRpZmllcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFpc0NvcHkpIHtcblx0XHRcdFx0XHRjb25zdCBzb3VyY2VHcm91cFZpZXcgPSB0aGlzLmZpbmRTb3VyY2VHcm91cFZpZXcoKTtcblx0XHRcdFx0XHRpZiAoc291cmNlR3JvdXBWaWV3ID09PSB0aGlzLmdyb3VwVmlldykge1xuXHRcdFx0XHRcdFx0aWYgKGlzRHJhZ2dpbmdHcm91cCB8fCAoaXNEcmFnZ2luZ0VkaXRvciAmJiBzb3VyY2VHcm91cFZpZXcuY291bnQgPCAyKSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmhpZGVPdmVybGF5KCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybjsgLy8gZG8gbm90IGFsbG93IHRvIGRyb3AgZ3JvdXAvZWRpdG9yIG9uIGl0c2VsZiBpZiB0aGlzIHJlc3VsdHMgaW4gYW4gZW1wdHkgZ3JvdXBcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBQb3NpdGlvbiBvdmVybGF5IGFuZCBjb25kaXRpb25hbGx5IGVuYWJsZSBvciBkaXNhYmxlXG5cdFx0XHRcdC8vIGVkaXRvciBncm91cCBzcGxpdHRpbmcgc3VwcG9ydCBiYXNlZCBvbiBzZXR0aW5nIGFuZFxuXHRcdFx0XHQvLyBrZXltb2RpZmllcnMgdXNlZC5cblx0XHRcdFx0bGV0IHNwbGl0T25EcmFnQW5kRHJvcCA9ICEhdGhpcy5ncm91cFZpZXcuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucy5zcGxpdE9uRHJhZ0FuZERyb3A7XG5cdFx0XHRcdGlmICh0aGlzLmlzVG9nZ2xlU3BsaXRPcGVyYXRpb24oZSkpIHtcblx0XHRcdFx0XHRzcGxpdE9uRHJhZ0FuZERyb3AgPSAhc3BsaXRPbkRyYWdBbmREcm9wO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMucG9zaXRpb25PdmVybGF5KGUub2Zmc2V0WCwgZS5vZmZzZXRZLCBpc0RyYWdnaW5nR3JvdXAsIHNwbGl0T25EcmFnQW5kRHJvcCk7XG5cblx0XHRcdFx0Ly8gTWFrZSBzdXJlIHRvIHN0b3AgYW55IHJ1bm5pbmcgY2xlYW51cCBzY2hlZHVsZXIgdG8gcmVtb3ZlIHRoZSBvdmVybGF5XG5cdFx0XHRcdGlmICh0aGlzLmNsZWFudXBPdmVybGF5U2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0XHR0aGlzLmNsZWFudXBPdmVybGF5U2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXG5cdFx0XHRvbkRyYWdMZWF2ZTogZSA9PiB0aGlzLmRpc3Bvc2UoKSxcblx0XHRcdG9uRHJhZ0VuZDogZSA9PiB0aGlzLmRpc3Bvc2UoKSxcblxuXHRcdFx0b25Ecm9wOiBlID0+IHtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblxuXHRcdFx0XHQvLyBEaXNwb3NlIG92ZXJsYXlcblx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cblx0XHRcdFx0Ly8gSGFuZGxlIGRyb3AgaWYgd2UgaGF2ZSBhIHZhbGlkIG9wZXJhdGlvblxuXHRcdFx0XHRpZiAodGhpcy5jdXJyZW50RHJvcE9wZXJhdGlvbikge1xuXHRcdFx0XHRcdHRoaXMuaGFuZGxlRHJvcChlLCB0aGlzLmN1cnJlbnREcm9wT3BlcmF0aW9uLnNwbGl0RGlyZWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb250YWluZXIsIEV2ZW50VHlwZS5NT1VTRV9PVkVSLCAoKSA9PiB7XG5cdFx0XHQvLyBVbmRlciBzb21lIGNpcmN1bXN0YW5jZXMgd2UgaGF2ZSBzZWVuIHJlcG9ydHMgd2hlcmUgdGhlIGRyb3Agb3ZlcmxheSBpcyBub3QgYmVpbmdcblx0XHRcdC8vIGNsZWFuZWQgdXAgYW5kIGFzIHN1Y2ggdGhlIGVkaXRvciBhcmVhIHJlbWFpbnMgdW5kZXIgdGhlIG92ZXJsYXkgc28gdGhhdCB5b3UgY2Fubm90XG5cdFx0XHQvLyB0eXBlIGludG8gdGhlIGVkaXRvciBhbnltb3JlLiBUaGlzIHNlZW1zIHJlbGF0ZWQgdG8gdXNpbmcgVk1zIGFuZCBETkQgdmlhIGhvc3QgYW5kXG5cdFx0XHQvLyBndWVzdCBPUywgdGhvdWdoIHNvbWUgdXNlcnMgYWxzbyBzYXcgaXQgd2l0aG91dCBWTXMuXG5cdFx0XHQvLyBUbyBwcm90ZWN0IGFnYWluc3QgdGhpcyBpc3N1ZSB3ZSBhbHdheXMgZGVzdHJveSB0aGUgb3ZlcmxheSBhcyBzb29uIGFzIHdlIGRldGVjdCBhXG5cdFx0XHQvLyBtb3VzZSBldmVudCBvdmVyIGl0LiBUaGUgZGVsYXkgaXMgdXNlZCB0byBndWFyYW50ZWUgd2UgYXJlIG5vdCBpbnRlcmZlcmluZyB3aXRoIHRoZVxuXHRcdFx0Ly8gYWN0dWFsIERST1AgZXZlbnQgdGhhdCBjYW4gYWxzbyB0cmlnZ2VyIGEgbW91c2Ugb3ZlciBldmVudC5cblx0XHRcdGlmICghdGhpcy5jbGVhbnVwT3ZlcmxheVNjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdHRoaXMuY2xlYW51cE92ZXJsYXlTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGlzRHJvcEludG9BY3RpdmVFZGl0b3JFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuZ3JvdXBWaWV3LmFjdGl2ZUVkaXRvcj8uaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5DYW5Ecm9wSW50b0VkaXRvcik7XG5cdH1cblxuXHRwcml2YXRlIGZpbmRTb3VyY2VHcm91cFZpZXcoKTogSUVkaXRvckdyb3VwIHwgdW5kZWZpbmVkIHtcblxuXHRcdC8vIENoZWNrIGZvciBncm91cCB0cmFuc2ZlclxuXHRcdGlmICh0aGlzLmdyb3VwVHJhbnNmZXIuaGFzRGF0YShEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyLnByb3RvdHlwZSkpIHtcblx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLmdyb3VwVHJhbnNmZXIuZ2V0RGF0YShEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShkYXRhKSAmJiBkYXRhLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmdldEdyb3VwKGRhdGFbMF0uaWRlbnRpZmllcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgZm9yIGVkaXRvciB0cmFuc2ZlclxuXHRcdGVsc2UgaWYgKHRoaXMuZWRpdG9yVHJhbnNmZXIuaGFzRGF0YShEcmFnZ2VkRWRpdG9ySWRlbnRpZmllci5wcm90b3R5cGUpKSB7XG5cdFx0XHRjb25zdCBkYXRhID0gdGhpcy5lZGl0b3JUcmFuc2Zlci5nZXREYXRhKERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShkYXRhKSAmJiBkYXRhLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmdldEdyb3VwKGRhdGFbMF0uaWRlbnRpZmllci5ncm91cElkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVEcm9wKGV2ZW50OiBEcmFnRXZlbnQsIHNwbGl0RGlyZWN0aW9uPzogR3JvdXBEaXJlY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIERldGVybWluZSB0YXJnZXQgZ3JvdXBcblx0XHRjb25zdCBlbnN1cmVUYXJnZXRHcm91cCA9ICgpID0+IHtcblx0XHRcdGxldCB0YXJnZXRHcm91cDogSUVkaXRvckdyb3VwO1xuXHRcdFx0aWYgKHR5cGVvZiBzcGxpdERpcmVjdGlvbiA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0dGFyZ2V0R3JvdXAgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hZGRHcm91cCh0aGlzLmdyb3VwVmlldywgc3BsaXREaXJlY3Rpb24pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGFyZ2V0R3JvdXAgPSB0aGlzLmdyb3VwVmlldztcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRhcmdldEdyb3VwO1xuXHRcdH07XG5cblx0XHQvLyBDaGVjayBmb3IgZ3JvdXAgdHJhbnNmZXJcblx0XHRpZiAodGhpcy5ncm91cFRyYW5zZmVyLmhhc0RhdGEoRHJhZ2dlZEVkaXRvckdyb3VwSWRlbnRpZmllci5wcm90b3R5cGUpKSB7XG5cdFx0XHRjb25zdCBkYXRhID0gdGhpcy5ncm91cFRyYW5zZmVyLmdldERhdGEoRHJhZ2dlZEVkaXRvckdyb3VwSWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoZGF0YSkgJiYgZGF0YS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZUdyb3VwID0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuZ2V0R3JvdXAoZGF0YVswXS5pZGVudGlmaWVyKTtcblx0XHRcdFx0aWYgKHNvdXJjZUdyb3VwKSB7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBzcGxpdERpcmVjdGlvbiAhPT0gJ251bWJlcicgJiYgc291cmNlR3JvdXAgPT09IHRoaXMuZ3JvdXBWaWV3KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gU3BsaXQgdG8gbmV3IGdyb3VwXG5cdFx0XHRcdFx0bGV0IHRhcmdldEdyb3VwOiBJRWRpdG9yR3JvdXAgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBzcGxpdERpcmVjdGlvbiA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLmlzQ29weU9wZXJhdGlvbihldmVudCkpIHtcblx0XHRcdFx0XHRcdFx0dGFyZ2V0R3JvdXAgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5jb3B5R3JvdXAoc291cmNlR3JvdXAsIHRoaXMuZ3JvdXBWaWV3LCBzcGxpdERpcmVjdGlvbik7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0YXJnZXRHcm91cCA9IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1vdmVHcm91cChzb3VyY2VHcm91cCwgdGhpcy5ncm91cFZpZXcsIHNwbGl0RGlyZWN0aW9uKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBNZXJnZSBpbnRvIGV4aXN0aW5nIGdyb3VwXG5cdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRsZXQgbWVyZ2VHcm91cE9wdGlvbnM6IElNZXJnZUdyb3VwT3B0aW9ucyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdGlmICh0aGlzLmlzQ29weU9wZXJhdGlvbihldmVudCkpIHtcblx0XHRcdFx0XHRcdFx0bWVyZ2VHcm91cE9wdGlvbnMgPSB7IG1vZGU6IE1lcmdlR3JvdXBNb2RlLkNPUFlfRURJVE9SUyB9O1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tZXJnZUdyb3VwKHNvdXJjZUdyb3VwLCB0aGlzLmdyb3VwVmlldywgbWVyZ2VHcm91cE9wdGlvbnMpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICh0YXJnZXRHcm91cCkge1xuXHRcdFx0XHRcdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZhdGVHcm91cCh0YXJnZXRHcm91cCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5ncm91cFRyYW5zZmVyLmNsZWFyRGF0YShEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgZm9yIGVkaXRvciB0cmFuc2ZlclxuXHRcdGVsc2UgaWYgKHRoaXMuZWRpdG9yVHJhbnNmZXIuaGFzRGF0YShEcmFnZ2VkRWRpdG9ySWRlbnRpZmllci5wcm90b3R5cGUpKSB7XG5cdFx0XHRjb25zdCBkYXRhID0gdGhpcy5lZGl0b3JUcmFuc2Zlci5nZXREYXRhKERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShkYXRhKSAmJiBkYXRhLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgZHJhZ2dlZEVkaXRvcnMgPSBkYXRhO1xuXHRcdFx0XHRjb25zdCBmaXJzdERyYWdnZWRFZGl0b3IgPSBkYXRhWzBdLmlkZW50aWZpZXI7XG5cblx0XHRcdFx0Y29uc3Qgc291cmNlR3JvdXAgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5nZXRHcm91cChmaXJzdERyYWdnZWRFZGl0b3IuZ3JvdXBJZCk7XG5cdFx0XHRcdGlmIChzb3VyY2VHcm91cCkge1xuXHRcdFx0XHRcdGNvbnN0IGNvcHlFZGl0b3IgPSB0aGlzLmlzQ29weU9wZXJhdGlvbihldmVudCwgZmlyc3REcmFnZ2VkRWRpdG9yKTtcblx0XHRcdFx0XHRsZXQgdGFyZ2V0R3JvdXA6IElFZGl0b3JHcm91cCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRcdC8vIE9wdGltaXphdGlvbjogaWYgd2UgbW92ZSB0aGUgbGFzdCBlZGl0b3Igb2YgYW4gZWRpdG9yIGdyb3VwXG5cdFx0XHRcdFx0Ly8gYW5kIHdlIGFyZSBjb25maWd1cmVkIHRvIGNsb3NlIGVtcHR5IGVkaXRvciBncm91cHMsIHdlIGNhblxuXHRcdFx0XHRcdC8vIHJhdGhlciBtb3ZlIHRoZSBlbnRpcmUgZWRpdG9yIGdyb3VwIGFjY29yZGluZyB0byB0aGUgZGlyZWN0aW9uXG5cdFx0XHRcdFx0aWYgKHRoaXMuZ3JvdXBWaWV3Lmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMuY2xvc2VFbXB0eUdyb3VwcyAmJiBzb3VyY2VHcm91cC5jb3VudCA9PT0gMSAmJiB0eXBlb2Ygc3BsaXREaXJlY3Rpb24gPT09ICdudW1iZXInICYmICFjb3B5RWRpdG9yKSB7XG5cdFx0XHRcdFx0XHR0YXJnZXRHcm91cCA9IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1vdmVHcm91cChzb3VyY2VHcm91cCwgdGhpcy5ncm91cFZpZXcsIHNwbGl0RGlyZWN0aW9uKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBJbiBhbnkgb3RoZXIgY2FzZSBkbyBhIG5vcm1hbCBtb3ZlL2NvcHkgb3BlcmF0aW9uXG5cdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHR0YXJnZXRHcm91cCA9IGVuc3VyZVRhcmdldEdyb3VwKCk7XG5cdFx0XHRcdFx0XHRpZiAoc291cmNlR3JvdXAgPT09IHRhcmdldEdyb3VwKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgZWRpdG9yc1dpdGhPcHRpb25zID0gcHJlcGFyZU1vdmVDb3B5RWRpdG9ycyh0aGlzLmdyb3VwVmlldywgZHJhZ2dlZEVkaXRvcnMubWFwKGVkaXRvciA9PiBlZGl0b3IuaWRlbnRpZmllci5lZGl0b3IpKTtcblx0XHRcdFx0XHRcdGlmICghY29weUVkaXRvcikge1xuXHRcdFx0XHRcdFx0XHRzb3VyY2VHcm91cC5tb3ZlRWRpdG9ycyhlZGl0b3JzV2l0aE9wdGlvbnMsIHRhcmdldEdyb3VwKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHNvdXJjZUdyb3VwLmNvcHlFZGl0b3JzKGVkaXRvcnNXaXRoT3B0aW9ucywgdGFyZ2V0R3JvdXApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIEVuc3VyZSB0YXJnZXQgaGFzIGZvY3VzXG5cdFx0XHRcdFx0dGFyZ2V0R3JvdXAuZm9jdXMoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuZWRpdG9yVHJhbnNmZXIuY2xlYXJEYXRhKERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgZm9yIHRyZWUgaXRlbXNcblx0XHRlbHNlIGlmICh0aGlzLnRyZWVJdGVtc1RyYW5zZmVyLmhhc0RhdGEoRHJhZ2dlZFRyZWVJdGVtc0lkZW50aWZpZXIucHJvdG90eXBlKSkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMudHJlZUl0ZW1zVHJhbnNmZXIuZ2V0RGF0YShEcmFnZ2VkVHJlZUl0ZW1zSWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoZGF0YSkgJiYgZGF0YS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvcnM6IElVbnR5cGVkRWRpdG9ySW5wdXRbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGlkIG9mIGRhdGEpIHtcblx0XHRcdFx0XHRjb25zdCBkYXRhVHJhbnNmZXJJdGVtID0gYXdhaXQgdGhpcy50cmVlVmlld3NEcmFnQW5kRHJvcFNlcnZpY2UucmVtb3ZlRHJhZ09wZXJhdGlvblRyYW5zZmVyKGlkLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRcdGlmIChkYXRhVHJhbnNmZXJJdGVtKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0cmVlRHJvcERhdGEgPSBhd2FpdCBleHRyYWN0VHJlZURyb3BEYXRhKGRhdGFUcmFuc2Zlckl0ZW0pO1xuXHRcdFx0XHRcdFx0ZWRpdG9ycy5wdXNoKC4uLnRyZWVEcm9wRGF0YS5tYXAoZWRpdG9yID0+ICh7IC4uLmVkaXRvciwgb3B0aW9uczogeyAuLi5lZGl0b3Iub3B0aW9ucywgcGlubmVkOiB0cnVlIH0gfSkpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGVkaXRvcnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3JzKGVkaXRvcnMsIGVuc3VyZVRhcmdldEdyb3VwKCksIHsgdmFsaWRhdGVUcnVzdDogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnRyZWVJdGVtc1RyYW5zZmVyLmNsZWFyRGF0YShEcmFnZ2VkVHJlZUl0ZW1zSWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBVUkkgdHJhbnNmZXJcblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IGRyb3BIYW5kbGVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZXNEcm9wSGFuZGxlciwgeyBhbGxvd1dvcmtzcGFjZU9wZW46ICFpc1dlYiB8fCBpc1RlbXBvcmFyeVdvcmtzcGFjZSh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKSB9KTtcblx0XHRcdGRyb3BIYW5kbGVyLmhhbmRsZURyb3AoZXZlbnQsIGdldFdpbmRvdyh0aGlzLmdyb3VwVmlldy5lbGVtZW50KSwgKCkgPT4gZW5zdXJlVGFyZ2V0R3JvdXAoKSwgdGFyZ2V0R3JvdXAgPT4gdGFyZ2V0R3JvdXA/LmZvY3VzKCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNDb3B5T3BlcmF0aW9uKGU6IERyYWdFdmVudCwgZHJhZ2dlZEVkaXRvcj86IElFZGl0b3JJZGVudGlmaWVyKTogYm9vbGVhbiB7XG5cdFx0aWYgKGRyYWdnZWRFZGl0b3I/LmVkaXRvci5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlNpbmdsZXRvbikpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gU2luZ2xldG9uIGVkaXRvcnMgY2Fubm90IGJlIHNwbGl0XG5cdFx0fVxuXG5cdFx0cmV0dXJuIChlLmN0cmxLZXkgJiYgIWlzTWFjaW50b3NoKSB8fCAoZS5hbHRLZXkgJiYgaXNNYWNpbnRvc2gpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1RvZ2dsZVNwbGl0T3BlcmF0aW9uKGU6IERyYWdFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoZS5hbHRLZXkgJiYgIWlzTWFjaW50b3NoKSB8fCAoZS5zaGlmdEtleSAmJiBpc01hY2ludG9zaCk7XG5cdH1cblxuXHRwcml2YXRlIHBvc2l0aW9uT3ZlcmxheShtb3VzZVBvc1g6IG51bWJlciwgbW91c2VQb3NZOiBudW1iZXIsIGlzRHJhZ2dpbmdHcm91cDogYm9vbGVhbiwgZW5hYmxlU3BsaXR0aW5nOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJlZmVyU3BsaXRWZXJ0aWNhbGx5ID0gdGhpcy5ncm91cFZpZXcuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucy5vcGVuU2lkZUJ5U2lkZURpcmVjdGlvbiA9PT0gJ3JpZ2h0JztcblxuXHRcdGNvbnN0IGVkaXRvckNvbnRyb2xXaWR0aCA9IHRoaXMuZ3JvdXBWaWV3LmVsZW1lbnQuY2xpZW50V2lkdGg7XG5cdFx0Y29uc3QgZWRpdG9yQ29udHJvbEhlaWdodCA9IHRoaXMuZ3JvdXBWaWV3LmVsZW1lbnQuY2xpZW50SGVpZ2h0IC0gdGhpcy5nZXRPdmVybGF5T2Zmc2V0SGVpZ2h0KCk7XG5cblx0XHRsZXQgZWRnZVdpZHRoVGhyZXNob2xkRmFjdG9yOiBudW1iZXI7XG5cdFx0bGV0IGVkZ2VIZWlnaHRUaHJlc2hvbGRGYWN0b3I6IG51bWJlcjtcblx0XHRpZiAoZW5hYmxlU3BsaXR0aW5nKSB7XG5cdFx0XHRpZiAoaXNEcmFnZ2luZ0dyb3VwKSB7XG5cdFx0XHRcdGVkZ2VXaWR0aFRocmVzaG9sZEZhY3RvciA9IHByZWZlclNwbGl0VmVydGljYWxseSA/IDAuMyA6IDAuMTsgLy8gZ2l2ZSBsYXJnZXIgdGhyZXNob2xkIHdoZW4gZHJhZ2dpbmcgZ3JvdXAgZGVwZW5kaW5nIG9uIHByZWZlcnJlZCBzcGxpdCBkaXJlY3Rpb25cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVkZ2VXaWR0aFRocmVzaG9sZEZhY3RvciA9IDAuMTsgLy8gMTAlIHRocmVzaG9sZCB0byBzcGxpdCBpZiBkcmFnZ2luZyBlZGl0b3JzXG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc0RyYWdnaW5nR3JvdXApIHtcblx0XHRcdFx0ZWRnZUhlaWdodFRocmVzaG9sZEZhY3RvciA9IHByZWZlclNwbGl0VmVydGljYWxseSA/IDAuMSA6IDAuMzsgLy8gZ2l2ZSBsYXJnZXIgdGhyZXNob2xkIHdoZW4gZHJhZ2dpbmcgZ3JvdXAgZGVwZW5kaW5nIG9uIHByZWZlcnJlZCBzcGxpdCBkaXJlY3Rpb25cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVkZ2VIZWlnaHRUaHJlc2hvbGRGYWN0b3IgPSAwLjE7IC8vIDEwJSB0aHJlc2hvbGQgdG8gc3BsaXQgaWYgZHJhZ2dpbmcgZWRpdG9yc1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRlZGdlV2lkdGhUaHJlc2hvbGRGYWN0b3IgPSAwO1xuXHRcdFx0ZWRnZUhlaWdodFRocmVzaG9sZEZhY3RvciA9IDA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRnZVdpZHRoVGhyZXNob2xkID0gZWRpdG9yQ29udHJvbFdpZHRoICogZWRnZVdpZHRoVGhyZXNob2xkRmFjdG9yO1xuXHRcdGNvbnN0IGVkZ2VIZWlnaHRUaHJlc2hvbGQgPSBlZGl0b3JDb250cm9sSGVpZ2h0ICogZWRnZUhlaWdodFRocmVzaG9sZEZhY3RvcjtcblxuXHRcdGNvbnN0IHNwbGl0V2lkdGhUaHJlc2hvbGQgPSBlZGl0b3JDb250cm9sV2lkdGggLyAzO1x0XHQvLyBvZmZlciB0byBzcGxpdCBsZWZ0L3JpZ2h0IGF0IDMzJVxuXHRcdGNvbnN0IHNwbGl0SGVpZ2h0VGhyZXNob2xkID0gZWRpdG9yQ29udHJvbEhlaWdodCAvIDM7XHQvLyBvZmZlciB0byBzcGxpdCB1cC9kb3duIGF0IDMzJVxuXG5cdFx0Ly8gTm8gc3BsaXQgaWYgbW91c2UgaXMgYWJvdmUgY2VydGFpbiB0aHJlc2hvbGQgaW4gdGhlIGNlbnRlciBvZiB0aGUgdmlld1xuXHRcdGxldCBzcGxpdERpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKFxuXHRcdFx0bW91c2VQb3NYID4gZWRnZVdpZHRoVGhyZXNob2xkICYmIG1vdXNlUG9zWCA8IGVkaXRvckNvbnRyb2xXaWR0aCAtIGVkZ2VXaWR0aFRocmVzaG9sZCAmJlxuXHRcdFx0bW91c2VQb3NZID4gZWRnZUhlaWdodFRocmVzaG9sZCAmJiBtb3VzZVBvc1kgPCBlZGl0b3JDb250cm9sSGVpZ2h0IC0gZWRnZUhlaWdodFRocmVzaG9sZFxuXHRcdCkge1xuXHRcdFx0c3BsaXREaXJlY3Rpb24gPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gT2ZmZXIgdG8gc3BsaXQgb3RoZXJ3aXNlXG5cdFx0ZWxzZSB7XG5cblx0XHRcdC8vIFVzZXIgcHJlZmVycyB0byBzcGxpdCB2ZXJ0aWNhbGx5OiBvZmZlciBhIGxhcmdlciBoaXR6b25lXG5cdFx0XHQvLyBmb3IgdGhpcyBkaXJlY3Rpb24gbGlrZSBzbzpcblx0XHRcdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0XHRcdC8vIHxcdFx0fFx0XHRTUExJVCBVUFx0XHR8XHRcdFx0fFxuXHRcdFx0Ly8gfCBTUExJVCBcdHwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLXxcdFNQTElUXHR8XG5cdFx0XHQvLyB8XHRcdHxcdFx0ICBNRVJHRVx0XHRcdHxcdFx0XHR8XG5cdFx0XHQvLyB8IExFRlRcdHwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLXxcdFJJR0hUXHR8XG5cdFx0XHQvLyB8XHRcdHxcdFx0U1BMSVQgRE9XTlx0XHR8XHRcdFx0fFxuXHRcdFx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHRcdFx0aWYgKHByZWZlclNwbGl0VmVydGljYWxseSkge1xuXHRcdFx0XHRpZiAobW91c2VQb3NYIDwgc3BsaXRXaWR0aFRocmVzaG9sZCkge1xuXHRcdFx0XHRcdHNwbGl0RGlyZWN0aW9uID0gR3JvdXBEaXJlY3Rpb24uTEVGVDtcblx0XHRcdFx0fSBlbHNlIGlmIChtb3VzZVBvc1ggPiBzcGxpdFdpZHRoVGhyZXNob2xkICogMikge1xuXHRcdFx0XHRcdHNwbGl0RGlyZWN0aW9uID0gR3JvdXBEaXJlY3Rpb24uUklHSFQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAobW91c2VQb3NZIDwgZWRpdG9yQ29udHJvbEhlaWdodCAvIDIpIHtcblx0XHRcdFx0XHRzcGxpdERpcmVjdGlvbiA9IEdyb3VwRGlyZWN0aW9uLlVQO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNwbGl0RGlyZWN0aW9uID0gR3JvdXBEaXJlY3Rpb24uRE9XTjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBVc2VyIHByZWZlcnMgdG8gc3BsaXQgaG9yaXpvbnRhbGx5OiBvZmZlciBhIGxhcmdlciBoaXR6b25lXG5cdFx0XHQvLyBmb3IgdGhpcyBkaXJlY3Rpb24gbGlrZSBzbzpcblx0XHRcdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0XHRcdC8vIHxcdFx0XHRcdFNQTElUIFVQXHRcdFx0XHRcdHxcblx0XHRcdC8vIHwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLXxcblx0XHRcdC8vIHwgIFNQTElUIExFRlQgIHxcdCAgIE1FUkdFXHR8ICBTUExJVCBSSUdIVCAgfFxuXHRcdFx0Ly8gfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tfFxuXHRcdFx0Ly8gfFx0XHRcdFx0U1BMSVQgRE9XTlx0XHRcdFx0XHR8XG5cdFx0XHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0aWYgKG1vdXNlUG9zWSA8IHNwbGl0SGVpZ2h0VGhyZXNob2xkKSB7XG5cdFx0XHRcdFx0c3BsaXREaXJlY3Rpb24gPSBHcm91cERpcmVjdGlvbi5VUDtcblx0XHRcdFx0fSBlbHNlIGlmIChtb3VzZVBvc1kgPiBzcGxpdEhlaWdodFRocmVzaG9sZCAqIDIpIHtcblx0XHRcdFx0XHRzcGxpdERpcmVjdGlvbiA9IEdyb3VwRGlyZWN0aW9uLkRPV047XG5cdFx0XHRcdH0gZWxzZSBpZiAobW91c2VQb3NYIDwgZWRpdG9yQ29udHJvbFdpZHRoIC8gMikge1xuXHRcdFx0XHRcdHNwbGl0RGlyZWN0aW9uID0gR3JvdXBEaXJlY3Rpb24uTEVGVDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzcGxpdERpcmVjdGlvbiA9IEdyb3VwRGlyZWN0aW9uLlJJR0hUO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRHJhdyBvdmVybGF5IGJhc2VkIG9uIHNwbGl0IGRpcmVjdGlvblxuXHRcdHN3aXRjaCAoc3BsaXREaXJlY3Rpb24pIHtcblx0XHRcdGNhc2UgR3JvdXBEaXJlY3Rpb24uVVA6XG5cdFx0XHRcdHRoaXMuZG9Qb3NpdGlvbk92ZXJsYXkoeyB0b3A6ICcwJywgbGVmdDogJzAnLCB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICc1MCUnIH0pO1xuXHRcdFx0XHR0aGlzLnRvZ2dsZURyb3BJbnRvUHJvbXB0KGZhbHNlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEdyb3VwRGlyZWN0aW9uLkRPV046XG5cdFx0XHRcdHRoaXMuZG9Qb3NpdGlvbk92ZXJsYXkoeyB0b3A6ICc1MCUnLCBsZWZ0OiAnMCcsIHdpZHRoOiAnMTAwJScsIGhlaWdodDogJzUwJScgfSk7XG5cdFx0XHRcdHRoaXMudG9nZ2xlRHJvcEludG9Qcm9tcHQoZmFsc2UpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgR3JvdXBEaXJlY3Rpb24uTEVGVDpcblx0XHRcdFx0dGhpcy5kb1Bvc2l0aW9uT3ZlcmxheSh7IHRvcDogJzAnLCBsZWZ0OiAnMCcsIHdpZHRoOiAnNTAlJywgaGVpZ2h0OiAnMTAwJScgfSk7XG5cdFx0XHRcdHRoaXMudG9nZ2xlRHJvcEludG9Qcm9tcHQoZmFsc2UpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgR3JvdXBEaXJlY3Rpb24uUklHSFQ6XG5cdFx0XHRcdHRoaXMuZG9Qb3NpdGlvbk92ZXJsYXkoeyB0b3A6ICcwJywgbGVmdDogJzUwJScsIHdpZHRoOiAnNTAlJywgaGVpZ2h0OiAnMTAwJScgfSk7XG5cdFx0XHRcdHRoaXMudG9nZ2xlRHJvcEludG9Qcm9tcHQoZmFsc2UpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRoaXMuZG9Qb3NpdGlvbk92ZXJsYXkoeyB0b3A6ICcwJywgbGVmdDogJzAnLCB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICcxMDAlJyB9KTtcblx0XHRcdFx0dGhpcy50b2dnbGVEcm9wSW50b1Byb21wdCh0cnVlKTtcblx0XHR9XG5cblx0XHQvLyBNYWtlIHN1cmUgdGhlIG92ZXJsYXkgaXMgdmlzaWJsZSBub3dcblx0XHRjb25zdCBvdmVybGF5ID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5vdmVybGF5KTtcblx0XHRvdmVybGF5LnN0eWxlLm9wYWNpdHkgPSAnMSc7XG5cblx0XHQvLyBFbmFibGUgdHJhbnNpdGlvbiBhZnRlciBhIHRpbWVvdXQgdG8gcHJldmVudCBpbml0aWFsIGFuaW1hdGlvblxuXHRcdHNldFRpbWVvdXQoKCkgPT4gb3ZlcmxheS5jbGFzc0xpc3QuYWRkKCdvdmVybGF5LW1vdmUtdHJhbnNpdGlvbicpLCAwKTtcblxuXHRcdC8vIFJlbWVtYmVyIGFzIGN1cnJlbnQgc3BsaXQgZGlyZWN0aW9uXG5cdFx0dGhpcy5jdXJyZW50RHJvcE9wZXJhdGlvbiA9IHsgc3BsaXREaXJlY3Rpb24gfTtcblx0fVxuXG5cdHByaXZhdGUgZG9Qb3NpdGlvbk92ZXJsYXkob3B0aW9uczogeyB0b3A6IHN0cmluZzsgbGVmdDogc3RyaW5nOyB3aWR0aDogc3RyaW5nOyBoZWlnaHQ6IHN0cmluZyB9KTogdm9pZCB7XG5cdFx0Y29uc3QgW2NvbnRhaW5lciwgb3ZlcmxheV0gPSBhc3NlcnRSZXR1cm5zQWxsRGVmaW5lZCh0aGlzLmNvbnRhaW5lciwgdGhpcy5vdmVybGF5KTtcblxuXHRcdC8vIENvbnRhaW5lclxuXHRcdGNvbnN0IG9mZnNldEhlaWdodCA9IHRoaXMuZ2V0T3ZlcmxheU9mZnNldEhlaWdodCgpO1xuXHRcdGlmIChvZmZzZXRIZWlnaHQpIHtcblx0XHRcdGNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgY2FsYygxMDAlIC0gJHtvZmZzZXRIZWlnaHR9cHgpYDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblx0XHR9XG5cblx0XHQvLyBPdmVybGF5XG5cdFx0b3ZlcmxheS5zdHlsZS50b3AgPSBvcHRpb25zLnRvcDtcblx0XHRvdmVybGF5LnN0eWxlLmxlZnQgPSBvcHRpb25zLmxlZnQ7XG5cdFx0b3ZlcmxheS5zdHlsZS53aWR0aCA9IG9wdGlvbnMud2lkdGg7XG5cdFx0b3ZlcmxheS5zdHlsZS5oZWlnaHQgPSBvcHRpb25zLmhlaWdodDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0T3ZlcmxheU9mZnNldEhlaWdodCgpOiBudW1iZXIge1xuXG5cdFx0Ly8gV2l0aCB0YWJzIGFuZCBvcGVuZWQgZWRpdG9yczogdXNlIHRoZSBhcmVhIGJlbG93IHRhYnMgYXMgZHJvcCB0YXJnZXRcblx0XHRpZiAoIXRoaXMuZ3JvdXBWaWV3LmlzRW1wdHkgJiYgdGhpcy5ncm91cFZpZXcuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucy5zaG93VGFicyA9PT0gJ211bHRpcGxlJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ3JvdXBWaWV3LnRpdGxlSGVpZ2h0Lm9mZnNldDtcblx0XHR9XG5cblx0XHQvLyBXaXRob3V0IHRhYnMgb3IgZW1wdHkgZ3JvdXA6IHVzZSBlbnRpcmUgZWRpdG9yIGFyZWEgYXMgZHJvcCB0YXJnZXRcblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdHByaXZhdGUgaGlkZU92ZXJsYXkoKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3ZlcmxheSA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMub3ZlcmxheSk7XG5cblx0XHQvLyBSZXNldCBvdmVybGF5XG5cdFx0dGhpcy5kb1Bvc2l0aW9uT3ZlcmxheSh7IHRvcDogJzAnLCBsZWZ0OiAnMCcsIHdpZHRoOiAnMTAwJScsIGhlaWdodDogJzEwMCUnIH0pO1xuXHRcdG92ZXJsYXkuc3R5bGUub3BhY2l0eSA9ICcwJztcblx0XHRvdmVybGF5LmNsYXNzTGlzdC5yZW1vdmUoJ292ZXJsYXktbW92ZS10cmFuc2l0aW9uJyk7XG5cblx0XHQvLyBSZXNldCBjdXJyZW50IG9wZXJhdGlvblxuXHRcdHRoaXMuY3VycmVudERyb3BPcGVyYXRpb24gPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHRvZ2dsZURyb3BJbnRvUHJvbXB0KHNob3dpbmc6IGJvb2xlYW4pIHtcblx0XHRpZiAoIXRoaXMuZHJvcEludG9Qcm9tcHRFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZHJvcEludG9Qcm9tcHRFbGVtZW50LnN0eWxlLm9wYWNpdHkgPSBzaG93aW5nID8gJzEnIDogJzAnO1xuXHR9XG5cblx0Y29udGFpbnMoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZWxlbWVudCA9PT0gdGhpcy5jb250YWluZXIgfHwgZWxlbWVudCA9PT0gdGhpcy5vdmVybGF5O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl9kaXNwb3NlZCA9IHRydWU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRvckRyb3BUYXJnZXQgZXh0ZW5kcyBUaGVtYWJsZSB7XG5cblx0cHJpdmF0ZSBfb3ZlcmxheT86IERyb3BPdmVybGF5O1xuXG5cdHByaXZhdGUgY291bnRlciA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JUcmFuc2ZlciA9IExvY2FsU2VsZWN0aW9uVHJhbnNmZXIuZ2V0SW5zdGFuY2U8RHJhZ2dlZEVkaXRvcklkZW50aWZpZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZ3JvdXBUcmFuc2ZlciA9IExvY2FsU2VsZWN0aW9uVHJhbnNmZXIuZ2V0SW5zdGFuY2U8RHJhZ2dlZEVkaXRvckdyb3VwSWRlbnRpZmllcj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGdyb3Vwc1ZpZXc6IElFZGl0b3JHcm91cHNWaWV3LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRlbGVnYXRlOiBJRWRpdG9yRHJvcFRhcmdldERlbGVnYXRlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHRoZW1lU2VydmljZSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBvdmVybGF5KCk6IERyb3BPdmVybGF5IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fb3ZlcmxheSAmJiAhdGhpcy5fb3ZlcmxheS5kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX292ZXJsYXk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGFpbmVyLCBFdmVudFR5cGUuRFJBR19FTlRFUiwgZSA9PiB0aGlzLm9uRHJhZ0VudGVyKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGFpbmVyLCBFdmVudFR5cGUuRFJBR19MRUFWRSwgKCkgPT4gdGhpcy5vbkRyYWdMZWF2ZSgpKSk7XG5cdFx0Zm9yIChjb25zdCB0YXJnZXQgb2YgW3RoaXMuY29udGFpbmVyLCBnZXRXaW5kb3codGhpcy5jb250YWluZXIpXSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldCwgRXZlbnRUeXBlLkRSQUdfRU5ELCAoKSA9PiB0aGlzLm9uRHJhZ0VuZCgpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRyYWdFbnRlcihldmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGlzRHJvcEludG9FZGl0b3JFbmFibGVkR2xvYmFsbHkodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkgJiYgaXNEcmFnSW50b0VkaXRvckV2ZW50KGV2ZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY291bnRlcisrO1xuXG5cdFx0Ly8gVmFsaWRhdGUgdHJhbnNmZXJcblx0XHRpZiAoXG5cdFx0XHQhdGhpcy5lZGl0b3JUcmFuc2Zlci5oYXNEYXRhKERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLnByb3RvdHlwZSkgJiZcblx0XHRcdCF0aGlzLmdyb3VwVHJhbnNmZXIuaGFzRGF0YShEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyLnByb3RvdHlwZSkgJiZcblx0XHRcdGV2ZW50LmRhdGFUcmFuc2ZlclxuXHRcdCkge1xuXHRcdFx0Y29uc3QgZG5kQ29udHJpYnV0aW9ucyA9IFJlZ2lzdHJ5LmFzPElEcmFnQW5kRHJvcENvbnRyaWJ1dGlvblJlZ2lzdHJ5PihEcmFnQW5kRHJvcEV4dGVuc2lvbnMuRHJhZ0FuZERyb3BDb250cmlidXRpb24pLmdldEFsbCgpO1xuXHRcdFx0Y29uc3QgZG5kQ29udHJpYnV0aW9uS2V5cyA9IEFycmF5LmZyb20oZG5kQ29udHJpYnV0aW9ucykubWFwKGUgPT4gZS5kYXRhRm9ybWF0S2V5KTtcblx0XHRcdGlmICghY29udGFpbnNEcmFnVHlwZShldmVudCwgRGF0YVRyYW5zZmVycy5GSUxFUywgQ29kZURhdGFUcmFuc2ZlcnMuRklMRVMsIERhdGFUcmFuc2ZlcnMuUkVTT1VSQ0VTLCBDb2RlRGF0YVRyYW5zZmVycy5FRElUT1JTLCAuLi5kbmRDb250cmlidXRpb25LZXlzKSkgeyAvLyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI1Nzg5XG5cdFx0XHRcdGV2ZW50LmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ25vbmUnO1xuXHRcdFx0XHRyZXR1cm47IC8vIHVuc3VwcG9ydGVkIHRyYW5zZmVyXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgZHJvcHBpbmcgaW50byBncm91cCBpcyBhbGxvd2VkXG5cdFx0aWYgKCF0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMuYWxsb3dEcm9wSW50b0dyb3VwKSB7XG5cdFx0XHRpZiAoZXZlbnQuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRcdGV2ZW50LmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ25vbmUnO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNpZ25hbCBETkQgc3RhcnRcblx0XHR0aGlzLnVwZGF0ZUNvbnRhaW5lcih0cnVlKTtcblxuXHRcdGNvbnN0IHRhcmdldCA9IGV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcblx0XHRpZiAodGFyZ2V0KSB7XG5cblx0XHRcdC8vIFNvbWVob3cgd2UgbWFuYWdlZCB0byBtb3ZlIHRoZSBtb3VzZSBxdWlja2x5IG91dCBvZiB0aGUgY3VycmVudCBvdmVybGF5LCBzbyBkZXN0cm95IGl0XG5cdFx0XHRpZiAodGhpcy5vdmVybGF5ICYmICF0aGlzLm92ZXJsYXkuY29udGFpbnModGFyZ2V0KSkge1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2VPdmVybGF5KCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENyZWF0ZSBvdmVybGF5IG92ZXIgdGFyZ2V0XG5cdFx0XHRpZiAoIXRoaXMub3ZlcmxheSkge1xuXHRcdFx0XHRjb25zdCB0YXJnZXRHcm91cFZpZXcgPSB0aGlzLmZpbmRUYXJnZXRHcm91cFZpZXcodGFyZ2V0KTtcblx0XHRcdFx0aWYgKHRhcmdldEdyb3VwVmlldykge1xuXHRcdFx0XHRcdHRoaXMuX292ZXJsYXkgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERyb3BPdmVybGF5LCB0YXJnZXRHcm91cFZpZXcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRyYWdMZWF2ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNvdW50ZXItLTtcblxuXHRcdGlmICh0aGlzLmNvdW50ZXIgPT09IDApIHtcblx0XHRcdHRoaXMudXBkYXRlQ29udGFpbmVyKGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRHJhZ0VuZCgpOiB2b2lkIHtcblx0XHR0aGlzLmNvdW50ZXIgPSAwO1xuXG5cdFx0dGhpcy51cGRhdGVDb250YWluZXIoZmFsc2UpO1xuXHRcdHRoaXMuZGlzcG9zZU92ZXJsYXkoKTtcblx0fVxuXG5cdHByaXZhdGUgZmluZFRhcmdldEdyb3VwVmlldyhjaGlsZDogSFRNTEVsZW1lbnQpOiBJRWRpdG9yR3JvdXBWaWV3IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBncm91cHMgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5ncm91cHMgYXMgSUVkaXRvckdyb3VwVmlld1tdO1xuXG5cdFx0cmV0dXJuIGdyb3Vwcy5maW5kKGdyb3VwVmlldyA9PiBpc0FuY2VzdG9yKGNoaWxkLCBncm91cFZpZXcuZWxlbWVudCkgfHwgdGhpcy5kZWxlZ2F0ZS5jb250YWluc0dyb3VwPy4oZ3JvdXBWaWV3KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbnRhaW5lcihpc0RyYWdnZWRPdmVyOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZHJhZ2dlZC1vdmVyJywgaXNEcmFnZ2VkT3Zlcik7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuZGlzcG9zZU92ZXJsYXkoKTtcblx0fVxuXG5cdHByaXZhdGUgZGlzcG9zZU92ZXJsYXkoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMub3ZlcmxheSkge1xuXHRcdFx0dGhpcy5vdmVybGF5LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX292ZXJsYXkgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztB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
