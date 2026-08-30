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
import "./media/sidebysideeditor.css";
import { localize } from "../../../../nls.js";
import { Dimension, $, clearNode } from "../../../../base/browser/dom.js";
import { multibyteAwareBtoa } from "../../../../base/common/strings.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorExtensions, SIDE_BY_SIDE_EDITOR_ID, SideBySideEditor as Side, isEditorPaneWithSelection, EditorPaneSelectionCompareResult } from "../../../common/editor.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { SplitView, Sizing, Orientation } from "../../../../base/browser/ui/splitview/splitview.js";
import { Event, Relay, Emitter } from "../../../../base/common/event.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { DEFAULT_EDITOR_MIN_DIMENSIONS } from "./editor.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { SIDE_BY_SIDE_EDITOR_HORIZONTAL_BORDER, SIDE_BY_SIDE_EDITOR_VERTICAL_BORDER } from "../../../common/theme.js";
import { AbstractEditorWithViewState } from "./editorWithViewState.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
function isSideBySideEditorViewState(thing) {
  const candidate = thing;
  return typeof candidate?.primary === "object" && typeof candidate.secondary === "object";
}
let SideBySideEditor = class extends AbstractEditorWithViewState {
  constructor(group, telemetryService, instantiationService, themeService, storageService, configurationService, textResourceConfigurationService, editorService, editorGroupService) {
    super(SideBySideEditor.ID, group, SideBySideEditor.VIEW_STATE_PREFERENCE_KEY, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService);
    this.configurationService = configurationService;
    //#endregion
    //#region Events
    this.onDidCreateEditors = this._register(new Emitter());
    this._onDidChangeSizeConstraints = this._register(new Relay());
    this.onDidChangeSizeConstraints = Event.any(this.onDidCreateEditors.event, this._onDidChangeSizeConstraints.event);
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    //#endregion
    this.primaryEditorPane = void 0;
    this.secondaryEditorPane = void 0;
    this.splitviewDisposables = this._register(new DisposableStore());
    this.editorDisposables = this._register(new DisposableStore());
    this.dimension = new Dimension(0, 0);
    this.lastFocusedSide = void 0;
    this.orientation = this.configurationService.getValue(SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING) === "vertical" ? Orientation.VERTICAL : Orientation.HORIZONTAL;
    this.registerListeners();
  }
  //#region Layout Constraints
  get minimumPrimaryWidth() {
    return this.primaryEditorPane ? this.primaryEditorPane.minimumWidth : 0;
  }
  get maximumPrimaryWidth() {
    return this.primaryEditorPane ? this.primaryEditorPane.maximumWidth : Number.POSITIVE_INFINITY;
  }
  get minimumPrimaryHeight() {
    return this.primaryEditorPane ? this.primaryEditorPane.minimumHeight : 0;
  }
  get maximumPrimaryHeight() {
    return this.primaryEditorPane ? this.primaryEditorPane.maximumHeight : Number.POSITIVE_INFINITY;
  }
  get minimumSecondaryWidth() {
    return this.secondaryEditorPane ? this.secondaryEditorPane.minimumWidth : 0;
  }
  get maximumSecondaryWidth() {
    return this.secondaryEditorPane ? this.secondaryEditorPane.maximumWidth : Number.POSITIVE_INFINITY;
  }
  get minimumSecondaryHeight() {
    return this.secondaryEditorPane ? this.secondaryEditorPane.minimumHeight : 0;
  }
  get maximumSecondaryHeight() {
    return this.secondaryEditorPane ? this.secondaryEditorPane.maximumHeight : Number.POSITIVE_INFINITY;
  }
  set minimumWidth(value) {
  }
  set maximumWidth(value) {
  }
  set minimumHeight(value) {
  }
  set maximumHeight(value) {
  }
  get minimumWidth() {
    return this.minimumPrimaryWidth + this.minimumSecondaryWidth;
  }
  get maximumWidth() {
    return this.maximumPrimaryWidth + this.maximumSecondaryWidth;
  }
  get minimumHeight() {
    return this.minimumPrimaryHeight + this.minimumSecondaryHeight;
  }
  get maximumHeight() {
    return this.maximumPrimaryHeight + this.maximumSecondaryHeight;
  }
  registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationUpdated(e)));
  }
  onConfigurationUpdated(event) {
    if (event.affectsConfiguration(SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING)) {
      this.orientation = this.configurationService.getValue(SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING) === "vertical" ? Orientation.VERTICAL : Orientation.HORIZONTAL;
      if (this.splitview) {
        this.recreateSplitview();
      }
    }
  }
  recreateSplitview() {
    const container = assertReturnsDefined(this.getContainer());
    const ratio = this.getSplitViewRatio();
    if (this.splitview) {
      this.splitview.el.remove();
      this.splitviewDisposables.clear();
    }
    this.createSplitView(container, ratio);
    this.layout(this.dimension);
  }
  getSplitViewRatio() {
    let ratio = void 0;
    if (this.splitview) {
      const leftViewSize = this.splitview.getViewSize(0);
      const rightViewSize = this.splitview.getViewSize(1);
      if (Math.abs(leftViewSize - rightViewSize) > 1) {
        const totalSize = this.splitview.orientation === Orientation.HORIZONTAL ? this.dimension.width : this.dimension.height;
        ratio = leftViewSize / totalSize;
      }
    }
    return ratio;
  }
  createEditor(parent) {
    parent.classList.add("side-by-side-editor");
    this.secondaryEditorContainer = $(".side-by-side-editor-container.editor-instance");
    this.primaryEditorContainer = $(".side-by-side-editor-container.editor-instance");
    this.createSplitView(parent);
  }
  createSplitView(parent, ratio) {
    this.splitview = this.splitviewDisposables.add(new SplitView(parent, { orientation: this.orientation }));
    this.splitviewDisposables.add(this.splitview.onDidSashReset(() => this.splitview?.distributeViewSizes()));
    if (this.orientation === Orientation.HORIZONTAL) {
      this.splitview.orthogonalEndSash = this._boundarySashes?.bottom;
    } else {
      this.splitview.orthogonalStartSash = this._boundarySashes?.left;
      this.splitview.orthogonalEndSash = this._boundarySashes?.right;
    }
    let leftSizing = Sizing.Distribute;
    let rightSizing = Sizing.Distribute;
    if (ratio) {
      const totalSize = this.splitview.orientation === Orientation.HORIZONTAL ? this.dimension.width : this.dimension.height;
      leftSizing = Math.round(totalSize * ratio);
      rightSizing = totalSize - leftSizing;
      this.splitview.layout(this.orientation === Orientation.HORIZONTAL ? this.dimension.width : this.dimension.height);
    }
    const secondaryEditorContainer = assertReturnsDefined(this.secondaryEditorContainer);
    this.splitview.addView({
      element: secondaryEditorContainer,
      layout: (size) => this.layoutPane(this.secondaryEditorPane, size),
      minimumSize: this.orientation === Orientation.HORIZONTAL ? DEFAULT_EDITOR_MIN_DIMENSIONS.width : DEFAULT_EDITOR_MIN_DIMENSIONS.height,
      maximumSize: Number.POSITIVE_INFINITY,
      onDidChange: Event.None
    }, leftSizing);
    const primaryEditorContainer = assertReturnsDefined(this.primaryEditorContainer);
    this.splitview.addView({
      element: primaryEditorContainer,
      layout: (size) => this.layoutPane(this.primaryEditorPane, size),
      minimumSize: this.orientation === Orientation.HORIZONTAL ? DEFAULT_EDITOR_MIN_DIMENSIONS.width : DEFAULT_EDITOR_MIN_DIMENSIONS.height,
      maximumSize: Number.POSITIVE_INFINITY,
      onDidChange: Event.None
    }, rightSizing);
    this.updateStyles();
  }
  getTitle() {
    if (this.input) {
      return this.input.getName();
    }
    return localize("sideBySideEditor", "Side by Side Editor");
  }
  async setInput(input, options, context, token) {
    const oldInput = this.input;
    await super.setInput(input, options, context, token);
    if (!oldInput || !input.matches(oldInput)) {
      if (oldInput) {
        this.disposeEditors();
      }
      this.createEditors(input);
    }
    const { primary, secondary, viewState } = this.loadViewState(input, options, context);
    this.lastFocusedSide = viewState?.focus;
    if (typeof viewState?.ratio === "number" && this.splitview) {
      const totalSize = this.splitview.orientation === Orientation.HORIZONTAL ? this.dimension.width : this.dimension.height;
      this.splitview.resizeView(0, Math.round(totalSize * viewState.ratio));
    } else {
      this.splitview?.distributeViewSizes();
    }
    await Promise.all([
      this.secondaryEditorPane?.setInput(input.secondary, secondary, context, token),
      this.primaryEditorPane?.setInput(input.primary, primary, context, token)
    ]);
    if (typeof options?.target === "number") {
      this.lastFocusedSide = options.target;
    }
  }
  loadViewState(input, options, context) {
    const viewState = isSideBySideEditorViewState(options?.viewState) ? options?.viewState : this.loadEditorViewState(input, context);
    let primaryOptions = /* @__PURE__ */ Object.create(null);
    let secondaryOptions = void 0;
    if (options?.target === Side.SECONDARY) {
      secondaryOptions = { ...options };
    } else {
      primaryOptions = { ...options };
    }
    primaryOptions.viewState = viewState?.primary;
    if (viewState?.secondary) {
      if (!secondaryOptions) {
        secondaryOptions = { viewState: viewState.secondary };
      } else {
        secondaryOptions.viewState = viewState?.secondary;
      }
    }
    return { primary: primaryOptions, secondary: secondaryOptions, viewState };
  }
  createEditors(newInput) {
    this.secondaryEditorPane = this.doCreateEditor(newInput.secondary, assertReturnsDefined(this.secondaryEditorContainer));
    this.primaryEditorPane = this.doCreateEditor(newInput.primary, assertReturnsDefined(this.primaryEditorContainer));
    this.layout(this.dimension);
    this._onDidChangeSizeConstraints.input = Event.any(
      Event.map(this.secondaryEditorPane.onDidChangeSizeConstraints, () => void 0),
      Event.map(this.primaryEditorPane.onDidChangeSizeConstraints, () => void 0)
    );
    this.onDidCreateEditors.fire(void 0);
    this.editorDisposables.add(this.primaryEditorPane.onDidFocus(() => this.onDidFocusChange(Side.PRIMARY)));
    this.editorDisposables.add(this.secondaryEditorPane.onDidFocus(() => this.onDidFocusChange(Side.SECONDARY)));
  }
  doCreateEditor(editorInput, container) {
    const editorPaneDescriptor = Registry.as(EditorExtensions.EditorPane).getEditorPane(editorInput);
    if (!editorPaneDescriptor) {
      throw new Error("No editor pane descriptor for editor found");
    }
    const editorPane = editorPaneDescriptor.instantiate(this.instantiationService, this.group);
    editorPane.create(container);
    editorPane.setVisible(this.isVisible());
    if (isEditorPaneWithSelection(editorPane)) {
      this.editorDisposables.add(editorPane.onDidChangeSelection((e) => this._onDidChangeSelection.fire(e)));
    }
    this.editorDisposables.add(editorPane);
    return editorPane;
  }
  onDidFocusChange(side) {
    this.lastFocusedSide = side;
    this._onDidChangeControl.fire();
  }
  getSelection() {
    const lastFocusedEditorPane = this.getLastFocusedEditorPane();
    if (isEditorPaneWithSelection(lastFocusedEditorPane)) {
      const selection = lastFocusedEditorPane.getSelection();
      if (selection) {
        return new SideBySideAwareEditorPaneSelection(selection, lastFocusedEditorPane === this.primaryEditorPane ? Side.PRIMARY : Side.SECONDARY);
      }
    }
    return void 0;
  }
  setOptions(options) {
    super.setOptions(options);
    if (typeof options?.target === "number") {
      this.lastFocusedSide = options.target;
    }
    this.getLastFocusedEditorPane()?.setOptions(options);
  }
  setEditorVisible(visible) {
    this.primaryEditorPane?.setVisible(visible);
    this.secondaryEditorPane?.setVisible(visible);
    super.setEditorVisible(visible);
  }
  clearInput() {
    super.clearInput();
    this.primaryEditorPane?.clearInput();
    this.secondaryEditorPane?.clearInput();
    this.disposeEditors();
  }
  focus() {
    super.focus();
    this.getLastFocusedEditorPane()?.focus();
  }
  getLastFocusedEditorPane() {
    if (this.lastFocusedSide === Side.SECONDARY) {
      return this.secondaryEditorPane;
    }
    return this.primaryEditorPane;
  }
  layout(dimension) {
    this.dimension = dimension;
    const splitview = assertReturnsDefined(this.splitview);
    splitview.layout(this.orientation === Orientation.HORIZONTAL ? dimension.width : dimension.height);
  }
  setBoundarySashes(sashes) {
    this._boundarySashes = sashes;
    if (this.splitview) {
      this.splitview.orthogonalEndSash = sashes.bottom;
    }
  }
  layoutPane(pane, size) {
    pane?.layout(this.orientation === Orientation.HORIZONTAL ? new Dimension(size, this.dimension.height) : new Dimension(this.dimension.width, size));
  }
  getControl() {
    return this.getLastFocusedEditorPane()?.getControl();
  }
  getPrimaryEditorPane() {
    return this.primaryEditorPane;
  }
  getSecondaryEditorPane() {
    return this.secondaryEditorPane;
  }
  tracksEditorViewState(input) {
    return input instanceof SideBySideEditorInput;
  }
  computeEditorViewState(resource) {
    if (!this.input || !isEqual(resource, this.toEditorViewStateResource(this.input))) {
      return;
    }
    const primarViewState = this.primaryEditorPane?.getViewState();
    const secondaryViewState = this.secondaryEditorPane?.getViewState();
    if (!primarViewState || !secondaryViewState) {
      return;
    }
    return {
      primary: primarViewState,
      secondary: secondaryViewState,
      focus: this.lastFocusedSide,
      ratio: this.getSplitViewRatio()
    };
  }
  toEditorViewStateResource(input) {
    let primary;
    let secondary;
    if (input instanceof SideBySideEditorInput) {
      primary = input.primary.resource;
      secondary = input.secondary.resource;
    }
    if (!secondary || !primary) {
      return void 0;
    }
    return URI.from({ scheme: "sideBySide", path: `${multibyteAwareBtoa(secondary.toString())}${multibyteAwareBtoa(primary.toString())}` });
  }
  updateStyles() {
    super.updateStyles();
    if (this.primaryEditorContainer) {
      if (this.orientation === Orientation.HORIZONTAL) {
        this.primaryEditorContainer.style.borderLeftWidth = "1px";
        this.primaryEditorContainer.style.borderLeftStyle = "solid";
        this.primaryEditorContainer.style.borderLeftColor = this.getColor(SIDE_BY_SIDE_EDITOR_VERTICAL_BORDER) ?? "";
        this.primaryEditorContainer.style.borderTopWidth = "0";
      } else {
        this.primaryEditorContainer.style.borderTopWidth = "1px";
        this.primaryEditorContainer.style.borderTopStyle = "solid";
        this.primaryEditorContainer.style.borderTopColor = this.getColor(SIDE_BY_SIDE_EDITOR_HORIZONTAL_BORDER) ?? "";
        this.primaryEditorContainer.style.borderLeftWidth = "0";
      }
    }
  }
  dispose() {
    this.disposeEditors();
    super.dispose();
  }
  disposeEditors() {
    this.editorDisposables.clear();
    this.secondaryEditorPane = void 0;
    this.primaryEditorPane = void 0;
    this.lastFocusedSide = void 0;
    if (this.secondaryEditorContainer) {
      clearNode(this.secondaryEditorContainer);
    }
    if (this.primaryEditorContainer) {
      clearNode(this.primaryEditorContainer);
    }
  }
};
SideBySideEditor.ID = SIDE_BY_SIDE_EDITOR_ID;
SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING = "workbench.editor.splitInGroupLayout";
SideBySideEditor.VIEW_STATE_PREFERENCE_KEY = "sideBySideEditorViewState";
SideBySideEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IThemeService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ITextResourceConfigurationService),
  __decorateParam(7, IEditorService),
  __decorateParam(8, IEditorGroupsService)
], SideBySideEditor);
class SideBySideAwareEditorPaneSelection {
  constructor(selection, side) {
    this.selection = selection;
    this.side = side;
  }
  compare(other) {
    if (!(other instanceof SideBySideAwareEditorPaneSelection)) {
      return EditorPaneSelectionCompareResult.DIFFERENT;
    }
    if (this.side !== other.side) {
      return EditorPaneSelectionCompareResult.DIFFERENT;
    }
    return this.selection.compare(other.selection);
  }
  restore(options) {
    const sideBySideEditorOptions = {
      ...options,
      target: this.side
    };
    return this.selection.restore(sideBySideEditorOptions);
  }
}
export {
  SideBySideEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXHNpZGVCeVNpZGVFZGl0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvc2lkZWJ5c2lkZWVkaXRvci5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRGltZW5zaW9uLCAkLCBjbGVhck5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IG11bHRpYnl0ZUF3YXJlQnRvYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyb2wsIElFZGl0b3JQYW5lLCBJRWRpdG9yT3BlbkNvbnRleHQsIEVkaXRvckV4dGVuc2lvbnMsIFNJREVfQllfU0lERV9FRElUT1JfSUQsIFNpZGVCeVNpZGVFZGl0b3IgYXMgU2lkZSwgSUVkaXRvclBhbmVTZWxlY3Rpb24sIElFZGl0b3JQYW5lV2l0aFNlbGVjdGlvbiwgSUVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VFdmVudCwgaXNFZGl0b3JQYW5lV2l0aFNlbGVjdGlvbiwgRWRpdG9yUGFuZVNlbGVjdGlvbkNvbXBhcmVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IFNpZGVCeVNpZGVFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3Ivc2lkZUJ5U2lkZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lIH0gZnJvbSAnLi9lZGl0b3JQYW5lLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUGFuZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vZWRpdG9yLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgU3BsaXRWaWV3LCBTaXppbmcsIE9yaWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NwbGl0dmlldy9zcGxpdHZpZXcuanMnO1xuaW1wb3J0IHsgRXZlbnQsIFJlbGF5LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0VESVRPUl9NSU5fRElNRU5TSU9OUyB9IGZyb20gJy4vZWRpdG9yLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTSURFX0JZX1NJREVfRURJVE9SX0hPUklaT05UQUxfQk9SREVSLCBTSURFX0JZX1NJREVfRURJVE9SX1ZFUlRJQ0FMX0JPUkRFUiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdEVkaXRvcldpdGhWaWV3U3RhdGUgfSBmcm9tICcuL2VkaXRvcldpdGhWaWV3U3RhdGUuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElCb3VuZGFyeVNhc2hlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuXG5pbnRlcmZhY2UgSVNpZGVCeVNpZGVFZGl0b3JWaWV3U3RhdGUge1xuXHRwcmltYXJ5OiBvYmplY3Q7XG5cdHNlY29uZGFyeTogb2JqZWN0O1xuXHRmb2N1czogU2lkZS5QUklNQVJZIHwgU2lkZS5TRUNPTkRBUlkgfCB1bmRlZmluZWQ7XG5cdHJhdGlvOiBudW1iZXIgfCB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGlzU2lkZUJ5U2lkZUVkaXRvclZpZXdTdGF0ZSh0aGluZzogdW5rbm93bik6IHRoaW5nIGlzIElTaWRlQnlTaWRlRWRpdG9yVmlld1N0YXRlIHtcblx0Y29uc3QgY2FuZGlkYXRlID0gdGhpbmcgYXMgSVNpZGVCeVNpZGVFZGl0b3JWaWV3U3RhdGUgfCB1bmRlZmluZWQ7XG5cblx0cmV0dXJuIHR5cGVvZiBjYW5kaWRhdGU/LnByaW1hcnkgPT09ICdvYmplY3QnICYmIHR5cGVvZiBjYW5kaWRhdGUuc2Vjb25kYXJ5ID09PSAnb2JqZWN0Jztcbn1cblxuaW50ZXJmYWNlIElTaWRlQnlTaWRlRWRpdG9yT3B0aW9ucyBleHRlbmRzIElFZGl0b3JPcHRpb25zIHtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgZWRpdG9yIG9wdGlvbnMgc2hvdWxkIGFwcGx5IHRvXG5cdCAqIHRoZSBwcmltYXJ5IG9yIHNlY29uZGFyeSBzaWRlLlxuXHQgKlxuXHQgKiBJZiBhIHRhcmdldCBzaWRlIGlzIHByb3ZpZGVkLCB0aGF0IHNpZGUgd2lsbFxuXHQgKiBhbHNvIHJlY2VpdmUga2V5Ym9hcmQgZm9jdXMgdW5sZXNzIGZvY3VzIGlzXG5cdCAqIHRvIGJlIHByZXNlcnZlZC5cblx0ICovXG5cdHRhcmdldD86IFNpZGUuUFJJTUFSWSB8IFNpZGUuU0VDT05EQVJZO1xufVxuXG5leHBvcnQgY2xhc3MgU2lkZUJ5U2lkZUVkaXRvciBleHRlbmRzIEFic3RyYWN0RWRpdG9yV2l0aFZpZXdTdGF0ZTxJU2lkZUJ5U2lkZUVkaXRvclZpZXdTdGF0ZT4gaW1wbGVtZW50cyBJRWRpdG9yUGFuZVdpdGhTZWxlY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRDogc3RyaW5nID0gU0lERV9CWV9TSURFX0VESVRPUl9JRDtcblxuXHRzdGF0aWMgU0lERV9CWV9TSURFX0xBWU9VVF9TRVRUSU5HID0gJ3dvcmtiZW5jaC5lZGl0b3Iuc3BsaXRJbkdyb3VwTGF5b3V0JztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBWSUVXX1NUQVRFX1BSRUZFUkVOQ0VfS0VZID0gJ3NpZGVCeVNpZGVFZGl0b3JWaWV3U3RhdGUnO1xuXG5cdC8vI3JlZ2lvbiBMYXlvdXQgQ29uc3RyYWludHNcblxuXHRwcml2YXRlIGdldCBtaW5pbXVtUHJpbWFyeVdpZHRoKCkgeyByZXR1cm4gdGhpcy5wcmltYXJ5RWRpdG9yUGFuZSA/IHRoaXMucHJpbWFyeUVkaXRvclBhbmUubWluaW11bVdpZHRoIDogMDsgfVxuXHRwcml2YXRlIGdldCBtYXhpbXVtUHJpbWFyeVdpZHRoKCkgeyByZXR1cm4gdGhpcy5wcmltYXJ5RWRpdG9yUGFuZSA/IHRoaXMucHJpbWFyeUVkaXRvclBhbmUubWF4aW11bVdpZHRoIDogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZOyB9XG5cdHByaXZhdGUgZ2V0IG1pbmltdW1QcmltYXJ5SGVpZ2h0KCkgeyByZXR1cm4gdGhpcy5wcmltYXJ5RWRpdG9yUGFuZSA/IHRoaXMucHJpbWFyeUVkaXRvclBhbmUubWluaW11bUhlaWdodCA6IDA7IH1cblx0cHJpdmF0ZSBnZXQgbWF4aW11bVByaW1hcnlIZWlnaHQoKSB7IHJldHVybiB0aGlzLnByaW1hcnlFZGl0b3JQYW5lID8gdGhpcy5wcmltYXJ5RWRpdG9yUGFuZS5tYXhpbXVtSGVpZ2h0IDogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZOyB9XG5cblx0cHJpdmF0ZSBnZXQgbWluaW11bVNlY29uZGFyeVdpZHRoKCkgeyByZXR1cm4gdGhpcy5zZWNvbmRhcnlFZGl0b3JQYW5lID8gdGhpcy5zZWNvbmRhcnlFZGl0b3JQYW5lLm1pbmltdW1XaWR0aCA6IDA7IH1cblx0cHJpdmF0ZSBnZXQgbWF4aW11bVNlY29uZGFyeVdpZHRoKCkgeyByZXR1cm4gdGhpcy5zZWNvbmRhcnlFZGl0b3JQYW5lID8gdGhpcy5zZWNvbmRhcnlFZGl0b3JQYW5lLm1heGltdW1XaWR0aCA6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTsgfVxuXHRwcml2YXRlIGdldCBtaW5pbXVtU2Vjb25kYXJ5SGVpZ2h0KCkgeyByZXR1cm4gdGhpcy5zZWNvbmRhcnlFZGl0b3JQYW5lID8gdGhpcy5zZWNvbmRhcnlFZGl0b3JQYW5lLm1pbmltdW1IZWlnaHQgOiAwOyB9XG5cdHByaXZhdGUgZ2V0IG1heGltdW1TZWNvbmRhcnlIZWlnaHQoKSB7IHJldHVybiB0aGlzLnNlY29uZGFyeUVkaXRvclBhbmUgPyB0aGlzLnNlY29uZGFyeUVkaXRvclBhbmUubWF4aW11bUhlaWdodCA6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTsgfVxuXG5cdG92ZXJyaWRlIHNldCBtaW5pbXVtV2lkdGgodmFsdWU6IG51bWJlcikgeyAvKiBub29wICovIH1cblx0b3ZlcnJpZGUgc2V0IG1heGltdW1XaWR0aCh2YWx1ZTogbnVtYmVyKSB7IC8qIG5vb3AgKi8gfVxuXHRvdmVycmlkZSBzZXQgbWluaW11bUhlaWdodCh2YWx1ZTogbnVtYmVyKSB7IC8qIG5vb3AgKi8gfVxuXHRvdmVycmlkZSBzZXQgbWF4aW11bUhlaWdodCh2YWx1ZTogbnVtYmVyKSB7IC8qIG5vb3AgKi8gfVxuXG5cdG92ZXJyaWRlIGdldCBtaW5pbXVtV2lkdGgoKSB7IHJldHVybiB0aGlzLm1pbmltdW1QcmltYXJ5V2lkdGggKyB0aGlzLm1pbmltdW1TZWNvbmRhcnlXaWR0aDsgfVxuXHRvdmVycmlkZSBnZXQgbWF4aW11bVdpZHRoKCkgeyByZXR1cm4gdGhpcy5tYXhpbXVtUHJpbWFyeVdpZHRoICsgdGhpcy5tYXhpbXVtU2Vjb25kYXJ5V2lkdGg7IH1cblx0b3ZlcnJpZGUgZ2V0IG1pbmltdW1IZWlnaHQoKSB7IHJldHVybiB0aGlzLm1pbmltdW1QcmltYXJ5SGVpZ2h0ICsgdGhpcy5taW5pbXVtU2Vjb25kYXJ5SGVpZ2h0OyB9XG5cdG92ZXJyaWRlIGdldCBtYXhpbXVtSGVpZ2h0KCkgeyByZXR1cm4gdGhpcy5tYXhpbXVtUHJpbWFyeUhlaWdodCArIHRoaXMubWF4aW11bVNlY29uZGFyeUhlaWdodDsgfVxuXG5cdHByaXZhdGUgX2JvdW5kYXJ5U2FzaGVzOiBJQm91bmRhcnlTYXNoZXMgfCB1bmRlZmluZWQ7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEV2ZW50c1xuXG5cdHByaXZhdGUgb25EaWRDcmVhdGVFZGl0b3JzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHwgdW5kZWZpbmVkPigpKTtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZVNpemVDb25zdHJhaW50cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSZWxheTx7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0gfCB1bmRlZmluZWQ+KCkpO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNpemVDb25zdHJhaW50cyA9IEV2ZW50LmFueSh0aGlzLm9uRGlkQ3JlYXRlRWRpdG9ycy5ldmVudCwgdGhpcy5fb25EaWRDaGFuZ2VTaXplQ29uc3RyYWludHMuZXZlbnQpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZXZlbnQ7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSBwcmltYXJ5RWRpdG9yUGFuZTogRWRpdG9yUGFuZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzZWNvbmRhcnlFZGl0b3JQYW5lOiBFZGl0b3JQYW5lIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcHJpbWFyeUVkaXRvckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2Vjb25kYXJ5RWRpdG9yQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHNwbGl0dmlldzogU3BsaXRWaWV3IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3BsaXR2aWV3RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRwcml2YXRlIG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbjtcblx0cHJpdmF0ZSBkaW1lbnNpb24gPSBuZXcgRGltZW5zaW9uKDAsIDApO1xuXG5cdHByaXZhdGUgbGFzdEZvY3VzZWRTaWRlOiBTaWRlLlBSSU1BUlkgfCBTaWRlLlNFQ09OREFSWSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRncm91cDogSUVkaXRvckdyb3VwLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKFNpZGVCeVNpZGVFZGl0b3IuSUQsIGdyb3VwLCBTaWRlQnlTaWRlRWRpdG9yLlZJRVdfU1RBVEVfUFJFRkVSRU5DRV9LRVksIHRlbGVtZXRyeVNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsIHRoZW1lU2VydmljZSwgZWRpdG9yU2VydmljZSwgZWRpdG9yR3JvdXBTZXJ2aWNlKTtcblxuXHRcdHRoaXMub3JpZW50YXRpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCd2ZXJ0aWNhbCcgfCAnaG9yaXpvbnRhbCc+KFNpZGVCeVNpZGVFZGl0b3IuU0lERV9CWV9TSURFX0xBWU9VVF9TRVRUSU5HKSA9PT0gJ3ZlcnRpY2FsJyA/IE9yaWVudGF0aW9uLlZFUlRJQ0FMIDogT3JpZW50YXRpb24uSE9SSVpPTlRBTDtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB0aGlzLm9uQ29uZmlndXJhdGlvblVwZGF0ZWQoZSkpKTtcblx0fVxuXG5cdHByaXZhdGUgb25Db25maWd1cmF0aW9uVXBkYXRlZChldmVudDogSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmIChldmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbihTaWRlQnlTaWRlRWRpdG9yLlNJREVfQllfU0lERV9MQVlPVVRfU0VUVElORykpIHtcblx0XHRcdHRoaXMub3JpZW50YXRpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCd2ZXJ0aWNhbCcgfCAnaG9yaXpvbnRhbCc+KFNpZGVCeVNpZGVFZGl0b3IuU0lERV9CWV9TSURFX0xBWU9VVF9TRVRUSU5HKSA9PT0gJ3ZlcnRpY2FsJyA/IE9yaWVudGF0aW9uLlZFUlRJQ0FMIDogT3JpZW50YXRpb24uSE9SSVpPTlRBTDtcblxuXHRcdFx0Ly8gSWYgY29uZmlnIHVwZGF0ZWQgZnJvbSBldmVudCwgcmUtY3JlYXRlIHRoZSBzcGxpdFxuXHRcdFx0Ly8gZWRpdG9yIHVzaW5nIHRoZSBuZXcgbGF5b3V0IG9yaWVudGF0aW9uIGlmIGl0IHdhc1xuXHRcdFx0Ly8gYWxyZWFkeSBjcmVhdGVkLlxuXHRcdFx0aWYgKHRoaXMuc3BsaXR2aWV3KSB7XG5cdFx0XHRcdHRoaXMucmVjcmVhdGVTcGxpdHZpZXcoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlY3JlYXRlU3BsaXR2aWV3KCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuZ2V0Q29udGFpbmVyKCkpO1xuXG5cdFx0Ly8gQ2xlYXIgb2xkIChpZiBhbnkpIGJ1dCByZW1lbWJlciByYXRpb1xuXHRcdGNvbnN0IHJhdGlvID0gdGhpcy5nZXRTcGxpdFZpZXdSYXRpbygpO1xuXHRcdGlmICh0aGlzLnNwbGl0dmlldykge1xuXHRcdFx0dGhpcy5zcGxpdHZpZXcuZWwucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLnNwbGl0dmlld0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIG5ld1xuXHRcdHRoaXMuY3JlYXRlU3BsaXRWaWV3KGNvbnRhaW5lciwgcmF0aW8pO1xuXG5cdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTcGxpdFZpZXdSYXRpbygpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGxldCByYXRpbzogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHRoaXMuc3BsaXR2aWV3KSB7XG5cdFx0XHRjb25zdCBsZWZ0Vmlld1NpemUgPSB0aGlzLnNwbGl0dmlldy5nZXRWaWV3U2l6ZSgwKTtcblx0XHRcdGNvbnN0IHJpZ2h0Vmlld1NpemUgPSB0aGlzLnNwbGl0dmlldy5nZXRWaWV3U2l6ZSgxKTtcblxuXHRcdFx0Ly8gT25seSByZXR1cm4gYSByYXRpbyB3aGVuIHRoZSB2aWV3IHNpemUgaXMgc2lnbmlmaWNhbnRseVxuXHRcdFx0Ly8gZW5vdWdoIGRpZmZlcmVudCBmb3IgbGVmdCBhbmQgcmlnaHQgdmlldyBzaXplc1xuXHRcdFx0aWYgKE1hdGguYWJzKGxlZnRWaWV3U2l6ZSAtIHJpZ2h0Vmlld1NpemUpID4gMSkge1xuXHRcdFx0XHRjb25zdCB0b3RhbFNpemUgPSB0aGlzLnNwbGl0dmlldy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IHRoaXMuZGltZW5zaW9uLndpZHRoIDogdGhpcy5kaW1lbnNpb24uaGVpZ2h0O1xuXHRcdFx0XHRyYXRpbyA9IGxlZnRWaWV3U2l6ZSAvIHRvdGFsU2l6ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmF0aW87XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlRWRpdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRwYXJlbnQuY2xhc3NMaXN0LmFkZCgnc2lkZS1ieS1zaWRlLWVkaXRvcicpO1xuXG5cdFx0Ly8gRWRpdG9yIHBhbmUgY29udGFpbmVyc1xuXHRcdHRoaXMuc2Vjb25kYXJ5RWRpdG9yQ29udGFpbmVyID0gJCgnLnNpZGUtYnktc2lkZS1lZGl0b3ItY29udGFpbmVyLmVkaXRvci1pbnN0YW5jZScpO1xuXHRcdHRoaXMucHJpbWFyeUVkaXRvckNvbnRhaW5lciA9ICQoJy5zaWRlLWJ5LXNpZGUtZWRpdG9yLWNvbnRhaW5lci5lZGl0b3ItaW5zdGFuY2UnKTtcblxuXHRcdC8vIFNwbGl0IHZpZXdcblx0XHR0aGlzLmNyZWF0ZVNwbGl0VmlldyhwYXJlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTcGxpdFZpZXcocGFyZW50OiBIVE1MRWxlbWVudCwgcmF0aW8/OiBudW1iZXIpOiB2b2lkIHtcblxuXHRcdC8vIFNwbGl0dmlldyB3aWRnZXRcblx0XHR0aGlzLnNwbGl0dmlldyA9IHRoaXMuc3BsaXR2aWV3RGlzcG9zYWJsZXMuYWRkKG5ldyBTcGxpdFZpZXcocGFyZW50LCB7IG9yaWVudGF0aW9uOiB0aGlzLm9yaWVudGF0aW9uIH0pKTtcblx0XHR0aGlzLnNwbGl0dmlld0Rpc3Bvc2FibGVzLmFkZCh0aGlzLnNwbGl0dmlldy5vbkRpZFNhc2hSZXNldCgoKSA9PiB0aGlzLnNwbGl0dmlldz8uZGlzdHJpYnV0ZVZpZXdTaXplcygpKSk7XG5cblx0XHRpZiAodGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCkge1xuXHRcdFx0dGhpcy5zcGxpdHZpZXcub3J0aG9nb25hbEVuZFNhc2ggPSB0aGlzLl9ib3VuZGFyeVNhc2hlcz8uYm90dG9tO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNwbGl0dmlldy5vcnRob2dvbmFsU3RhcnRTYXNoID0gdGhpcy5fYm91bmRhcnlTYXNoZXM/LmxlZnQ7XG5cdFx0XHR0aGlzLnNwbGl0dmlldy5vcnRob2dvbmFsRW5kU2FzaCA9IHRoaXMuX2JvdW5kYXJ5U2FzaGVzPy5yaWdodDtcblx0XHR9XG5cblx0XHQvLyBGaWd1cmUgb3V0IHNpemluZ1xuXHRcdGxldCBsZWZ0U2l6aW5nOiBudW1iZXIgfCBTaXppbmcgPSBTaXppbmcuRGlzdHJpYnV0ZTtcblx0XHRsZXQgcmlnaHRTaXppbmc6IG51bWJlciB8IFNpemluZyA9IFNpemluZy5EaXN0cmlidXRlO1xuXHRcdGlmIChyYXRpbykge1xuXHRcdFx0Y29uc3QgdG90YWxTaXplID0gdGhpcy5zcGxpdHZpZXcub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyB0aGlzLmRpbWVuc2lvbi53aWR0aCA6IHRoaXMuZGltZW5zaW9uLmhlaWdodDtcblxuXHRcdFx0bGVmdFNpemluZyA9IE1hdGgucm91bmQodG90YWxTaXplICogcmF0aW8pO1xuXHRcdFx0cmlnaHRTaXppbmcgPSB0b3RhbFNpemUgLSBsZWZ0U2l6aW5nO1xuXG5cdFx0XHQvLyBXZSBuZWVkIHRvIGNhbGwgYGxheW91dGAgZm9yIHRoZSBgcmF0aW9gIHRvIGhhdmUgYW55IGVmZmVjdFxuXHRcdFx0dGhpcy5zcGxpdHZpZXcubGF5b3V0KHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyB0aGlzLmRpbWVuc2lvbi53aWR0aCA6IHRoaXMuZGltZW5zaW9uLmhlaWdodCk7XG5cdFx0fVxuXG5cdFx0Ly8gU2Vjb25kYXJ5IChsZWZ0KVxuXHRcdGNvbnN0IHNlY29uZGFyeUVkaXRvckNvbnRhaW5lciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuc2Vjb25kYXJ5RWRpdG9yQ29udGFpbmVyKTtcblx0XHR0aGlzLnNwbGl0dmlldy5hZGRWaWV3KHtcblx0XHRcdGVsZW1lbnQ6IHNlY29uZGFyeUVkaXRvckNvbnRhaW5lcixcblx0XHRcdGxheW91dDogc2l6ZSA9PiB0aGlzLmxheW91dFBhbmUodGhpcy5zZWNvbmRhcnlFZGl0b3JQYW5lLCBzaXplKSxcblx0XHRcdG1pbmltdW1TaXplOiB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gREVGQVVMVF9FRElUT1JfTUlOX0RJTUVOU0lPTlMud2lkdGggOiBERUZBVUxUX0VESVRPUl9NSU5fRElNRU5TSU9OUy5oZWlnaHQsXG5cdFx0XHRtYXhpbXVtU2l6ZTogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLFxuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmVcblx0XHR9LCBsZWZ0U2l6aW5nKTtcblxuXHRcdC8vIFByaW1hcnkgKHJpZ2h0KVxuXHRcdGNvbnN0IHByaW1hcnlFZGl0b3JDb250YWluZXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLnByaW1hcnlFZGl0b3JDb250YWluZXIpO1xuXHRcdHRoaXMuc3BsaXR2aWV3LmFkZFZpZXcoe1xuXHRcdFx0ZWxlbWVudDogcHJpbWFyeUVkaXRvckNvbnRhaW5lcixcblx0XHRcdGxheW91dDogc2l6ZSA9PiB0aGlzLmxheW91dFBhbmUodGhpcy5wcmltYXJ5RWRpdG9yUGFuZSwgc2l6ZSksXG5cdFx0XHRtaW5pbXVtU2l6ZTogdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IERFRkFVTFRfRURJVE9SX01JTl9ESU1FTlNJT05TLndpZHRoIDogREVGQVVMVF9FRElUT1JfTUlOX0RJTUVOU0lPTlMuaGVpZ2h0LFxuXHRcdFx0bWF4aW11bVNpemU6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSxcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lXG5cdFx0fSwgcmlnaHRTaXppbmcpO1xuXG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFRpdGxlKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuaW5wdXQpIHtcblx0XHRcdHJldHVybiB0aGlzLmlucHV0LmdldE5hbWUoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbG9jYWxpemUoJ3NpZGVCeVNpZGVFZGl0b3InLCBcIlNpZGUgYnkgU2lkZSBFZGl0b3JcIik7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzZXRJbnB1dChpbnB1dDogU2lkZUJ5U2lkZUVkaXRvcklucHV0LCBvcHRpb25zOiBJU2lkZUJ5U2lkZUVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb2xkSW5wdXQgPSB0aGlzLmlucHV0O1xuXHRcdGF3YWl0IHN1cGVyLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbik7XG5cblx0XHQvLyBDcmVhdGUgbmV3IHNpZGUgYnkgc2lkZSBlZGl0b3JzIGlmIGVpdGhlciB3ZSBoYXZlIG5vdFxuXHRcdC8vIGJlZW4gY3JlYXRlZCBiZWZvcmUgb3IgdGhlIGlucHV0IG5vIGxvbmdlciBtYXRjaGVzLlxuXHRcdGlmICghb2xkSW5wdXQgfHwgIWlucHV0Lm1hdGNoZXMob2xkSW5wdXQpKSB7XG5cdFx0XHRpZiAob2xkSW5wdXQpIHtcblx0XHRcdFx0dGhpcy5kaXNwb3NlRWRpdG9ycygpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmNyZWF0ZUVkaXRvcnMoaW5wdXQpO1xuXHRcdH1cblxuXHRcdC8vIFJlc3RvcmUgYW55IHByZXZpb3VzIHZpZXcgc3RhdGVcblx0XHRjb25zdCB7IHByaW1hcnksIHNlY29uZGFyeSwgdmlld1N0YXRlIH0gPSB0aGlzLmxvYWRWaWV3U3RhdGUoaW5wdXQsIG9wdGlvbnMsIGNvbnRleHQpO1xuXHRcdHRoaXMubGFzdEZvY3VzZWRTaWRlID0gdmlld1N0YXRlPy5mb2N1cztcblxuXHRcdGlmICh0eXBlb2Ygdmlld1N0YXRlPy5yYXRpbyA9PT0gJ251bWJlcicgJiYgdGhpcy5zcGxpdHZpZXcpIHtcblx0XHRcdGNvbnN0IHRvdGFsU2l6ZSA9IHRoaXMuc3BsaXR2aWV3Lm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gdGhpcy5kaW1lbnNpb24ud2lkdGggOiB0aGlzLmRpbWVuc2lvbi5oZWlnaHQ7XG5cblx0XHRcdHRoaXMuc3BsaXR2aWV3LnJlc2l6ZVZpZXcoMCwgTWF0aC5yb3VuZCh0b3RhbFNpemUgKiB2aWV3U3RhdGUucmF0aW8pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zcGxpdHZpZXc/LmRpc3RyaWJ1dGVWaWV3U2l6ZXMoKTtcblx0XHR9XG5cblx0XHQvLyBTZXQgaW5wdXQgdG8gYm90aCBzaWRlc1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuc2Vjb25kYXJ5RWRpdG9yUGFuZT8uc2V0SW5wdXQoaW5wdXQuc2Vjb25kYXJ5LCBzZWNvbmRhcnksIGNvbnRleHQsIHRva2VuKSxcblx0XHRcdHRoaXMucHJpbWFyeUVkaXRvclBhbmU/LnNldElucHV0KGlucHV0LnByaW1hcnksIHByaW1hcnksIGNvbnRleHQsIHRva2VuKVxuXHRcdF0pO1xuXG5cdFx0Ly8gVXBkYXRlIGZvY3VzIGlmIHRhcmdldCBpcyBwcm92aWRlZFxuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucz8udGFyZ2V0ID09PSAnbnVtYmVyJykge1xuXHRcdFx0dGhpcy5sYXN0Rm9jdXNlZFNpZGUgPSBvcHRpb25zLnRhcmdldDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGxvYWRWaWV3U3RhdGUoaW5wdXQ6IFNpZGVCeVNpZGVFZGl0b3JJbnB1dCwgb3B0aW9uczogSVNpZGVCeVNpZGVFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQpOiB7IHByaW1hcnk6IElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkOyBzZWNvbmRhcnk6IElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkOyB2aWV3U3RhdGU6IElTaWRlQnlTaWRlRWRpdG9yVmlld1N0YXRlIHwgdW5kZWZpbmVkIH0ge1xuXHRcdGNvbnN0IHZpZXdTdGF0ZSA9IGlzU2lkZUJ5U2lkZUVkaXRvclZpZXdTdGF0ZShvcHRpb25zPy52aWV3U3RhdGUpID8gb3B0aW9ucz8udmlld1N0YXRlIDogdGhpcy5sb2FkRWRpdG9yVmlld1N0YXRlKGlucHV0LCBjb250ZXh0KTtcblxuXHRcdGxldCBwcmltYXJ5T3B0aW9uczogSUVkaXRvck9wdGlvbnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGxldCBzZWNvbmRhcnlPcHRpb25zOiBJRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIERlcGVuZGluZyBvbiB0aGUgb3B0aW9uYWwgYHRhcmdldGAgcHJvcGVydHksIHdlIGFwcGx5XG5cdFx0Ly8gdGhlIHByb3ZpZGVkIG9wdGlvbnMgdG8gZWl0aGVyIHRoZSBwcmltYXJ5IG9yIHNlY29uZGFyeVxuXHRcdC8vIHNpZGVcblxuXHRcdGlmIChvcHRpb25zPy50YXJnZXQgPT09IFNpZGUuU0VDT05EQVJZKSB7XG5cdFx0XHRzZWNvbmRhcnlPcHRpb25zID0geyAuLi5vcHRpb25zIH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHByaW1hcnlPcHRpb25zID0geyAuLi5vcHRpb25zIH07XG5cdFx0fVxuXG5cdFx0cHJpbWFyeU9wdGlvbnMudmlld1N0YXRlID0gdmlld1N0YXRlPy5wcmltYXJ5O1xuXG5cdFx0aWYgKHZpZXdTdGF0ZT8uc2Vjb25kYXJ5KSB7XG5cdFx0XHRpZiAoIXNlY29uZGFyeU9wdGlvbnMpIHtcblx0XHRcdFx0c2Vjb25kYXJ5T3B0aW9ucyA9IHsgdmlld1N0YXRlOiB2aWV3U3RhdGUuc2Vjb25kYXJ5IH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzZWNvbmRhcnlPcHRpb25zLnZpZXdTdGF0ZSA9IHZpZXdTdGF0ZT8uc2Vjb25kYXJ5O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IHByaW1hcnk6IHByaW1hcnlPcHRpb25zLCBzZWNvbmRhcnk6IHNlY29uZGFyeU9wdGlvbnMsIHZpZXdTdGF0ZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVFZGl0b3JzKG5ld0lucHV0OiBTaWRlQnlTaWRlRWRpdG9ySW5wdXQpOiB2b2lkIHtcblxuXHRcdC8vIENyZWF0ZSBlZGl0b3JzXG5cdFx0dGhpcy5zZWNvbmRhcnlFZGl0b3JQYW5lID0gdGhpcy5kb0NyZWF0ZUVkaXRvcihuZXdJbnB1dC5zZWNvbmRhcnksIGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuc2Vjb25kYXJ5RWRpdG9yQ29udGFpbmVyKSk7XG5cdFx0dGhpcy5wcmltYXJ5RWRpdG9yUGFuZSA9IHRoaXMuZG9DcmVhdGVFZGl0b3IobmV3SW5wdXQucHJpbWFyeSwgYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5wcmltYXJ5RWRpdG9yQ29udGFpbmVyKSk7XG5cblx0XHQvLyBMYXlvdXRcblx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbik7XG5cblx0XHQvLyBFdmVudGluZ1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2l6ZUNvbnN0cmFpbnRzLmlucHV0ID0gRXZlbnQuYW55KFxuXHRcdFx0RXZlbnQubWFwKHRoaXMuc2Vjb25kYXJ5RWRpdG9yUGFuZS5vbkRpZENoYW5nZVNpemVDb25zdHJhaW50cywgKCkgPT4gdW5kZWZpbmVkKSxcblx0XHRcdEV2ZW50Lm1hcCh0aGlzLnByaW1hcnlFZGl0b3JQYW5lLm9uRGlkQ2hhbmdlU2l6ZUNvbnN0cmFpbnRzLCAoKSA9PiB1bmRlZmluZWQpXG5cdFx0KTtcblx0XHR0aGlzLm9uRGlkQ3JlYXRlRWRpdG9ycy5maXJlKHVuZGVmaW5lZCk7XG5cblx0XHQvLyBUcmFjayBmb2N1cyBhbmQgc2lnbmFsIGFjdGl2ZSBjb250cm9sIGNoYW5nZSB2aWEgZXZlbnRcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLnByaW1hcnlFZGl0b3JQYW5lLm9uRGlkRm9jdXMoKCkgPT4gdGhpcy5vbkRpZEZvY3VzQ2hhbmdlKFNpZGUuUFJJTUFSWSkpKTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLnNlY29uZGFyeUVkaXRvclBhbmUub25EaWRGb2N1cygoKSA9PiB0aGlzLm9uRGlkRm9jdXNDaGFuZ2UoU2lkZS5TRUNPTkRBUlkpKSk7XG5cdH1cblxuXHRwcml2YXRlIGRvQ3JlYXRlRWRpdG9yKGVkaXRvcklucHV0OiBFZGl0b3JJbnB1dCwgY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IEVkaXRvclBhbmUge1xuXHRcdGNvbnN0IGVkaXRvclBhbmVEZXNjcmlwdG9yID0gUmVnaXN0cnkuYXM8SUVkaXRvclBhbmVSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JQYW5lKS5nZXRFZGl0b3JQYW5lKGVkaXRvcklucHV0KTtcblx0XHRpZiAoIWVkaXRvclBhbmVEZXNjcmlwdG9yKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIGVkaXRvciBwYW5lIGRlc2NyaXB0b3IgZm9yIGVkaXRvciBmb3VuZCcpO1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBlZGl0b3IgcGFuZSBhbmQgbWFrZSB2aXNpYmxlXG5cdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGVkaXRvclBhbmVEZXNjcmlwdG9yLmluc3RhbnRpYXRlKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoaXMuZ3JvdXApO1xuXHRcdGVkaXRvclBhbmUuY3JlYXRlKGNvbnRhaW5lcik7XG5cdFx0ZWRpdG9yUGFuZS5zZXRWaXNpYmxlKHRoaXMuaXNWaXNpYmxlKCkpO1xuXG5cdFx0Ly8gVHJhY2sgc2VsZWN0aW9ucyBpZiBzdXBwb3J0ZWRcblx0XHRpZiAoaXNFZGl0b3JQYW5lV2l0aFNlbGVjdGlvbihlZGl0b3JQYW5lKSkge1xuXHRcdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQoZWRpdG9yUGFuZS5vbkRpZENoYW5nZVNlbGVjdGlvbihlID0+IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUoZSkpKTtcblx0XHR9XG5cblx0XHQvLyBUcmFjayBmb3IgZGlzcG9zYWxcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChlZGl0b3JQYW5lKTtcblxuXHRcdHJldHVybiBlZGl0b3JQYW5lO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZEZvY3VzQ2hhbmdlKHNpZGU6IFNpZGUuUFJJTUFSWSB8IFNpZGUuU0VDT05EQVJZKTogdm9pZCB7XG5cdFx0dGhpcy5sYXN0Rm9jdXNlZFNpZGUgPSBzaWRlO1xuXG5cdFx0Ly8gU2lnbmFsIHRvIG91dHNpZGUgdGhhdCBvdXIgYWN0aXZlIGNvbnRyb2wgY2hhbmdlZFxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udHJvbC5maXJlKCk7XG5cdH1cblxuXHRnZXRTZWxlY3Rpb24oKTogSUVkaXRvclBhbmVTZWxlY3Rpb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGxhc3RGb2N1c2VkRWRpdG9yUGFuZSA9IHRoaXMuZ2V0TGFzdEZvY3VzZWRFZGl0b3JQYW5lKCk7XG5cdFx0aWYgKGlzRWRpdG9yUGFuZVdpdGhTZWxlY3Rpb24obGFzdEZvY3VzZWRFZGl0b3JQYW5lKSkge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gbGFzdEZvY3VzZWRFZGl0b3JQYW5lLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0aWYgKHNlbGVjdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFNpZGVCeVNpZGVBd2FyZUVkaXRvclBhbmVTZWxlY3Rpb24oc2VsZWN0aW9uLCBsYXN0Rm9jdXNlZEVkaXRvclBhbmUgPT09IHRoaXMucHJpbWFyeUVkaXRvclBhbmUgPyBTaWRlLlBSSU1BUlkgOiBTaWRlLlNFQ09OREFSWSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIHNldE9wdGlvbnMob3B0aW9uczogSVNpZGVCeVNpZGVFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0T3B0aW9ucyhvcHRpb25zKTtcblxuXHRcdC8vIFVwZGF0ZSBmb2N1cyBpZiB0YXJnZXQgaXMgcHJvdmlkZWRcblx0XHRpZiAodHlwZW9mIG9wdGlvbnM/LnRhcmdldCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMubGFzdEZvY3VzZWRTaWRlID0gb3B0aW9ucy50YXJnZXQ7XG5cdFx0fVxuXG5cdFx0Ly8gQXBwbHkgdG8gZm9jdXNlZCBzaWRlXG5cdFx0dGhpcy5nZXRMYXN0Rm9jdXNlZEVkaXRvclBhbmUoKT8uc2V0T3B0aW9ucyhvcHRpb25zKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzZXRFZGl0b3JWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblxuXHRcdC8vIEZvcndhcmQgdG8gYm90aCBzaWRlc1xuXHRcdHRoaXMucHJpbWFyeUVkaXRvclBhbmU/LnNldFZpc2libGUodmlzaWJsZSk7XG5cdFx0dGhpcy5zZWNvbmRhcnlFZGl0b3JQYW5lPy5zZXRWaXNpYmxlKHZpc2libGUpO1xuXG5cdFx0c3VwZXIuc2V0RWRpdG9yVmlzaWJsZSh2aXNpYmxlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNsZWFySW5wdXQoKTogdm9pZCB7XG5cdFx0c3VwZXIuY2xlYXJJbnB1dCgpO1xuXG5cdFx0Ly8gRm9yd2FyZCB0byBib3RoIHNpZGVzXG5cdFx0dGhpcy5wcmltYXJ5RWRpdG9yUGFuZT8uY2xlYXJJbnB1dCgpO1xuXHRcdHRoaXMuc2Vjb25kYXJ5RWRpdG9yUGFuZT8uY2xlYXJJbnB1dCgpO1xuXG5cdFx0Ly8gU2luY2Ugd2UgZG8gbm90IGtlZXAgc2lkZSBlZGl0b3JzIGFsaXZlXG5cdFx0Ly8gd2UgZGlzcG9zZSBhbnkgZWRpdG9yIGNyZWF0ZWQgZm9yIHJlY3JlYXRpb25cblx0XHR0aGlzLmRpc3Bvc2VFZGl0b3JzKCk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXG5cdFx0dGhpcy5nZXRMYXN0Rm9jdXNlZEVkaXRvclBhbmUoKT8uZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TGFzdEZvY3VzZWRFZGl0b3JQYW5lKCk6IEVkaXRvclBhbmUgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmxhc3RGb2N1c2VkU2lkZSA9PT0gU2lkZS5TRUNPTkRBUlkpIHtcblx0XHRcdHJldHVybiB0aGlzLnNlY29uZGFyeUVkaXRvclBhbmU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucHJpbWFyeUVkaXRvclBhbmU7XG5cdH1cblxuXHRsYXlvdXQoZGltZW5zaW9uOiBEaW1lbnNpb24pOiB2b2lkIHtcblx0XHR0aGlzLmRpbWVuc2lvbiA9IGRpbWVuc2lvbjtcblxuXHRcdGNvbnN0IHNwbGl0dmlldyA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuc3BsaXR2aWV3KTtcblx0XHRzcGxpdHZpZXcubGF5b3V0KHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyBkaW1lbnNpb24ud2lkdGggOiBkaW1lbnNpb24uaGVpZ2h0KTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldEJvdW5kYXJ5U2FzaGVzKHNhc2hlczogSUJvdW5kYXJ5U2FzaGVzKSB7XG5cdFx0dGhpcy5fYm91bmRhcnlTYXNoZXMgPSBzYXNoZXM7XG5cblx0XHRpZiAodGhpcy5zcGxpdHZpZXcpIHtcblx0XHRcdHRoaXMuc3BsaXR2aWV3Lm9ydGhvZ29uYWxFbmRTYXNoID0gc2FzaGVzLmJvdHRvbTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGxheW91dFBhbmUocGFuZTogRWRpdG9yUGFuZSB8IHVuZGVmaW5lZCwgc2l6ZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0cGFuZT8ubGF5b3V0KHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyBuZXcgRGltZW5zaW9uKHNpemUsIHRoaXMuZGltZW5zaW9uLmhlaWdodCkgOiBuZXcgRGltZW5zaW9uKHRoaXMuZGltZW5zaW9uLndpZHRoLCBzaXplKSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRDb250cm9sKCk6IElFZGl0b3JDb250cm9sIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRMYXN0Rm9jdXNlZEVkaXRvclBhbmUoKT8uZ2V0Q29udHJvbCgpO1xuXHR9XG5cblx0Z2V0UHJpbWFyeUVkaXRvclBhbmUoKTogSUVkaXRvclBhbmUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnByaW1hcnlFZGl0b3JQYW5lO1xuXHR9XG5cblx0Z2V0U2Vjb25kYXJ5RWRpdG9yUGFuZSgpOiBJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc2Vjb25kYXJ5RWRpdG9yUGFuZTtcblx0fVxuXG5cdHByb3RlY3RlZCB0cmFja3NFZGl0b3JWaWV3U3RhdGUoaW5wdXQ6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlucHV0IGluc3RhbmNlb2YgU2lkZUJ5U2lkZUVkaXRvcklucHV0O1xuXHR9XG5cblx0cHJvdGVjdGVkIGNvbXB1dGVFZGl0b3JWaWV3U3RhdGUocmVzb3VyY2U6IFVSSSk6IElTaWRlQnlTaWRlRWRpdG9yVmlld1N0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuaW5wdXQgfHwgIWlzRXF1YWwocmVzb3VyY2UsIHRoaXMudG9FZGl0b3JWaWV3U3RhdGVSZXNvdXJjZSh0aGlzLmlucHV0KSkpIHtcblx0XHRcdHJldHVybjsgLy8gdW5leHBlY3RlZCBzdGF0ZVxuXHRcdH1cblxuXHRcdGNvbnN0IHByaW1hclZpZXdTdGF0ZSA9IHRoaXMucHJpbWFyeUVkaXRvclBhbmU/LmdldFZpZXdTdGF0ZSgpO1xuXHRcdGNvbnN0IHNlY29uZGFyeVZpZXdTdGF0ZSA9IHRoaXMuc2Vjb25kYXJ5RWRpdG9yUGFuZT8uZ2V0Vmlld1N0YXRlKCk7XG5cblx0XHRpZiAoIXByaW1hclZpZXdTdGF0ZSB8fCAhc2Vjb25kYXJ5Vmlld1N0YXRlKSB7XG5cdFx0XHRyZXR1cm47IC8vIHdlIGFjdHVhbGx5IG5lZWQgdmlldyBzdGF0ZXNcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cHJpbWFyeTogcHJpbWFyVmlld1N0YXRlLFxuXHRcdFx0c2Vjb25kYXJ5OiBzZWNvbmRhcnlWaWV3U3RhdGUsXG5cdFx0XHRmb2N1czogdGhpcy5sYXN0Rm9jdXNlZFNpZGUsXG5cdFx0XHRyYXRpbzogdGhpcy5nZXRTcGxpdFZpZXdSYXRpbygpXG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCB0b0VkaXRvclZpZXdTdGF0ZVJlc291cmNlKGlucHV0OiBFZGl0b3JJbnB1dCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHByaW1hcnk6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgc2Vjb25kYXJ5OiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAoaW5wdXQgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9ySW5wdXQpIHtcblx0XHRcdHByaW1hcnkgPSBpbnB1dC5wcmltYXJ5LnJlc291cmNlO1xuXHRcdFx0c2Vjb25kYXJ5ID0gaW5wdXQuc2Vjb25kYXJ5LnJlc291cmNlO1xuXHRcdH1cblxuXHRcdGlmICghc2Vjb25kYXJ5IHx8ICFwcmltYXJ5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIGNyZWF0ZSBhIFVSSSB0aGF0IGlzIHRoZSBCYXNlNjQgY29uY2F0ZW5hdGlvbiBvZiBvcmlnaW5hbCArIG1vZGlmaWVkIHJlc291cmNlXG5cdFx0cmV0dXJuIFVSSS5mcm9tKHsgc2NoZW1lOiAnc2lkZUJ5U2lkZScsIHBhdGg6IGAke211bHRpYnl0ZUF3YXJlQnRvYShzZWNvbmRhcnkudG9TdHJpbmcoKSl9JHttdWx0aWJ5dGVBd2FyZUJ0b2EocHJpbWFyeS50b1N0cmluZygpKX1gIH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlU3R5bGVzKCk6IHZvaWQge1xuXHRcdHN1cGVyLnVwZGF0ZVN0eWxlcygpO1xuXG5cdFx0aWYgKHRoaXMucHJpbWFyeUVkaXRvckNvbnRhaW5lcikge1xuXHRcdFx0aWYgKHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwpIHtcblx0XHRcdFx0dGhpcy5wcmltYXJ5RWRpdG9yQ29udGFpbmVyLnN0eWxlLmJvcmRlckxlZnRXaWR0aCA9ICcxcHgnO1xuXHRcdFx0XHR0aGlzLnByaW1hcnlFZGl0b3JDb250YWluZXIuc3R5bGUuYm9yZGVyTGVmdFN0eWxlID0gJ3NvbGlkJztcblx0XHRcdFx0dGhpcy5wcmltYXJ5RWRpdG9yQ29udGFpbmVyLnN0eWxlLmJvcmRlckxlZnRDb2xvciA9IHRoaXMuZ2V0Q29sb3IoU0lERV9CWV9TSURFX0VESVRPUl9WRVJUSUNBTF9CT1JERVIpID8/ICcnO1xuXG5cdFx0XHRcdHRoaXMucHJpbWFyeUVkaXRvckNvbnRhaW5lci5zdHlsZS5ib3JkZXJUb3BXaWR0aCA9ICcwJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMucHJpbWFyeUVkaXRvckNvbnRhaW5lci5zdHlsZS5ib3JkZXJUb3BXaWR0aCA9ICcxcHgnO1xuXHRcdFx0XHR0aGlzLnByaW1hcnlFZGl0b3JDb250YWluZXIuc3R5bGUuYm9yZGVyVG9wU3R5bGUgPSAnc29saWQnO1xuXHRcdFx0XHR0aGlzLnByaW1hcnlFZGl0b3JDb250YWluZXIuc3R5bGUuYm9yZGVyVG9wQ29sb3IgPSB0aGlzLmdldENvbG9yKFNJREVfQllfU0lERV9FRElUT1JfSE9SSVpPTlRBTF9CT1JERVIpID8/ICcnO1xuXG5cdFx0XHRcdHRoaXMucHJpbWFyeUVkaXRvckNvbnRhaW5lci5zdHlsZS5ib3JkZXJMZWZ0V2lkdGggPSAnMCc7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2VFZGl0b3JzKCk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIGRpc3Bvc2VFZGl0b3JzKCk6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdHRoaXMuc2Vjb25kYXJ5RWRpdG9yUGFuZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnByaW1hcnlFZGl0b3JQYW5lID0gdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5sYXN0Rm9jdXNlZFNpZGUgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAodGhpcy5zZWNvbmRhcnlFZGl0b3JDb250YWluZXIpIHtcblx0XHRcdGNsZWFyTm9kZSh0aGlzLnNlY29uZGFyeUVkaXRvckNvbnRhaW5lcik7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucHJpbWFyeUVkaXRvckNvbnRhaW5lcikge1xuXHRcdFx0Y2xlYXJOb2RlKHRoaXMucHJpbWFyeUVkaXRvckNvbnRhaW5lcik7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFNpZGVCeVNpZGVBd2FyZUVkaXRvclBhbmVTZWxlY3Rpb24gaW1wbGVtZW50cyBJRWRpdG9yUGFuZVNlbGVjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZWxlY3Rpb246IElFZGl0b3JQYW5lU2VsZWN0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2lkZTogU2lkZS5QUklNQVJZIHwgU2lkZS5TRUNPTkRBUllcblx0KSB7IH1cblxuXHRjb21wYXJlKG90aGVyOiBJRWRpdG9yUGFuZVNlbGVjdGlvbik6IEVkaXRvclBhbmVTZWxlY3Rpb25Db21wYXJlUmVzdWx0IHtcblx0XHRpZiAoIShvdGhlciBpbnN0YW5jZW9mIFNpZGVCeVNpZGVBd2FyZUVkaXRvclBhbmVTZWxlY3Rpb24pKSB7XG5cdFx0XHRyZXR1cm4gRWRpdG9yUGFuZVNlbGVjdGlvbkNvbXBhcmVSZXN1bHQuRElGRkVSRU5UO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNpZGUgIT09IG90aGVyLnNpZGUpIHtcblx0XHRcdHJldHVybiBFZGl0b3JQYW5lU2VsZWN0aW9uQ29tcGFyZVJlc3VsdC5ESUZGRVJFTlQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuc2VsZWN0aW9uLmNvbXBhcmUob3RoZXIuc2VsZWN0aW9uKTtcblx0fVxuXG5cdHJlc3RvcmUob3B0aW9uczogSUVkaXRvck9wdGlvbnMpOiBJU2lkZUJ5U2lkZUVkaXRvck9wdGlvbnMge1xuXHRcdGNvbnN0IHNpZGVCeVNpZGVFZGl0b3JPcHRpb25zOiBJU2lkZUJ5U2lkZUVkaXRvck9wdGlvbnMgPSB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0dGFyZ2V0OiB0aGlzLnNpZGVcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHRoaXMuc2VsZWN0aW9uLnJlc3RvcmUoc2lkZUJ5U2lkZUVkaXRvck9wdGlvbnMpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVcsR0FBRyxpQkFBaUI7QUFDeEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBMEQsa0JBQWtCLHdCQUF3QixvQkFBb0IsTUFBdUYsMkJBQTJCLHdDQUF3QztBQUNsUixTQUFTLDZCQUE2QjtBQUd0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUc5QixTQUF1Qiw0QkFBNEI7QUFDbkQsU0FBUyxXQUFXLFFBQVEsbUJBQW1CO0FBQy9DLFNBQVMsT0FBTyxPQUFPLGVBQWU7QUFDdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw0QkFBNEI7QUFFckMsU0FBb0MsNkJBQTZCO0FBQ2pF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
