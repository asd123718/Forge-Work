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
import * as dom from "../../../../../base/browser/dom.js";
import { Orientation } from "../../../../../base/browser/ui/sash/sash.js";
import { Sizing, SplitView } from "../../../../../base/browser/ui/splitview/splitview.js";
import { Color } from "../../../../../base/common/color.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { DisposableStore, dispose } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { basenameOrAuthority, dirname } from "../../../../../base/common/resources.js";
import "./referencesWidget.css";
import { EmbeddedCodeEditorWidget } from "../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { Range } from "../../../../common/core/range.js";
import { ScrollType } from "../../../../common/editorCommon.js";
import { TrackedRangeStickiness } from "../../../../common/model.js";
import { ModelDecorationOptions, TextModel } from "../../../../common/model/textModel.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../common/languages/modesRegistry.js";
import { ITextModelService } from "../../../../common/services/resolverService.js";
import { AccessibilityProvider, DataSource, Delegate, FileReferencesRenderer, IdentityProvider, OneReferenceRenderer, StringRepresentationProvider } from "./referencesTree.js";
import * as peekView from "../../../peekView/browser/peekView.js";
import * as nls from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { WorkbenchAsyncDataTree } from "../../../../../platform/list/browser/listService.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { FileReferences, OneReference } from "../referencesModel.js";
import { DataTransfers } from "../../../../../base/browser/dnd.js";
import { withSelection } from "../../../../../platform/opener/common/opener.js";
const _DecorationsManager = class _DecorationsManager {
  constructor(_editor, _model) {
    this._editor = _editor;
    this._model = _model;
    this._decorations = /* @__PURE__ */ new Map();
    this._decorationIgnoreSet = /* @__PURE__ */ new Set();
    this._callOnDispose = new DisposableStore();
    this._callOnModelChange = new DisposableStore();
    this._callOnDispose.add(this._editor.onDidChangeModel(() => this._onModelChanged()));
    this._onModelChanged();
  }
  dispose() {
    this._callOnModelChange.dispose();
    this._callOnDispose.dispose();
    this.removeDecorations();
  }
  _onModelChanged() {
    this._callOnModelChange.clear();
    const model = this._editor.getModel();
    if (!model) {
      return;
    }
    for (const ref of this._model.references) {
      if (ref.uri.toString() === model.uri.toString()) {
        this._addDecorations(ref.parent);
        return;
      }
    }
  }
  _addDecorations(reference) {
    if (!this._editor.hasModel()) {
      return;
    }
    this._callOnModelChange.add(this._editor.getModel().onDidChangeDecorations(() => this._onDecorationChanged()));
    const newDecorations = [];
    const newDecorationsActualIndex = [];
    for (let i = 0, len = reference.children.length; i < len; i++) {
      const oneReference = reference.children[i];
      if (this._decorationIgnoreSet.has(oneReference.id)) {
        continue;
      }
      if (oneReference.uri.toString() !== this._editor.getModel().uri.toString()) {
        continue;
      }
      newDecorations.push({
        range: oneReference.range,
        options: _DecorationsManager.DecorationOptions
      });
      newDecorationsActualIndex.push(i);
    }
    this._editor.changeDecorations((changeAccessor) => {
      const decorations = changeAccessor.deltaDecorations([], newDecorations);
      for (let i = 0; i < decorations.length; i++) {
        this._decorations.set(decorations[i], reference.children[newDecorationsActualIndex[i]]);
      }
    });
  }
  _onDecorationChanged() {
    const toRemove = [];
    const model = this._editor.getModel();
    if (!model) {
      return;
    }
    for (const [decorationId, reference] of this._decorations) {
      const newRange = model.getDecorationRange(decorationId);
      if (!newRange) {
        continue;
      }
      let ignore = false;
      if (Range.equalsRange(newRange, reference.range)) {
        continue;
      }
      if (Range.spansMultipleLines(newRange)) {
        ignore = true;
      } else {
        const lineLength = reference.range.endColumn - reference.range.startColumn;
        const newLineLength = newRange.endColumn - newRange.startColumn;
        if (lineLength !== newLineLength) {
          ignore = true;
        }
      }
      if (ignore) {
        this._decorationIgnoreSet.add(reference.id);
        toRemove.push(decorationId);
      } else {
        reference.range = newRange;
      }
    }
    for (let i = 0, len = toRemove.length; i < len; i++) {
      this._decorations.delete(toRemove[i]);
    }
    this._editor.removeDecorations(toRemove);
  }
  removeDecorations() {
    this._editor.removeDecorations([...this._decorations.keys()]);
    this._decorations.clear();
  }
};
_DecorationsManager.DecorationOptions = ModelDecorationOptions.register({
  description: "reference-decoration",
  stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
  className: "reference-decoration"
});
let DecorationsManager = _DecorationsManager;
class LayoutData {
  constructor() {
    this.ratio = 0.7;
    this.heightInLines = 18;
  }
  static fromJSON(raw) {
    let ratio;
    let heightInLines;
    try {
      const data = JSON.parse(raw);
      ratio = data.ratio;
      heightInLines = data.heightInLines;
    } catch {
    }
    return {
      ratio: ratio || 0.7,
      heightInLines: heightInLines || 18
    };
  }
}
class ReferencesTree extends WorkbenchAsyncDataTree {
}
let ReferencesDragAndDrop = class {
  constructor(labelService) {
    this.labelService = labelService;
    this.disposables = new DisposableStore();
  }
  getDragURI(element) {
    if (element instanceof FileReferences) {
      return element.uri.toString();
    } else if (element instanceof OneReference) {
      return withSelection(element.uri, element.range).toString();
    }
    return null;
  }
  getDragLabel(elements) {
    if (elements.length === 0) {
      return void 0;
    }
    const labels = elements.map((e) => this.labelService.getUriBasenameLabel(e.uri));
    return labels.join(", ");
  }
  onDragStart(data, originalEvent) {
    if (!originalEvent.dataTransfer) {
      return;
    }
    const elements = data.elements;
    const resources = elements.map((e) => this.getDragURI(e)).filter(Boolean);
    if (resources.length) {
      originalEvent.dataTransfer.setData(DataTransfers.RESOURCES, JSON.stringify(resources));
      originalEvent.dataTransfer.setData(DataTransfers.TEXT, resources.join("\n"));
    }
  }
  onDragOver() {
    return false;
  }
  drop() {
  }
  dispose() {
    this.disposables.dispose();
  }
};
ReferencesDragAndDrop = __decorateClass([
  __decorateParam(0, ILabelService)
], ReferencesDragAndDrop);
let ReferenceWidget = class extends peekView.PeekViewWidget {
  // whether or not a dispose is already in progress
  constructor(editor, _defaultTreeKeyboardSupport, layoutData, themeService, _textModelResolverService, _instantiationService, _peekViewService, _uriLabel, _keybindingService) {
    super(editor, { showFrame: false, showArrow: true, isResizeable: true, isAccessible: true, supportOnTitleClick: true }, _instantiationService);
    this._defaultTreeKeyboardSupport = _defaultTreeKeyboardSupport;
    this.layoutData = layoutData;
    this._textModelResolverService = _textModelResolverService;
    this._instantiationService = _instantiationService;
    this._peekViewService = _peekViewService;
    this._uriLabel = _uriLabel;
    this._keybindingService = _keybindingService;
    this._disposeOnNewModel = new DisposableStore();
    this._callOnDispose = new DisposableStore();
    this._onDidSelectReference = this._callOnDispose.add(new Emitter());
    this.onDidSelectReference = this._onDidSelectReference.event;
    this._dim = new dom.Dimension(0, 0);
    this._isClosing = false;
    this._applyTheme(themeService.getColorTheme());
    this._callOnDispose.add(themeService.onDidColorThemeChange(this._applyTheme.bind(this)));
    this._peekViewService.addExclusiveWidget(editor, this);
    this.create();
  }
  get isClosing() {
    return this._isClosing;
  }
  dispose() {
    this._isClosing = true;
    this.setModel(void 0);
    this._callOnDispose.dispose();
    this._disposeOnNewModel.dispose();
    dispose(this._preview);
    dispose(this._previewNotAvailableMessage);
    dispose(this._tree);
    dispose(this._previewModelReference);
    this._splitView.dispose();
    super.dispose();
  }
  _applyTheme(theme) {
    const borderColor = theme.getColor(peekView.peekViewBorder) || Color.transparent;
    this.style({
      arrowColor: borderColor,
      frameColor: borderColor,
      headerBackgroundColor: theme.getColor(peekView.peekViewTitleBackground) || Color.transparent,
      primaryHeadingColor: theme.getColor(peekView.peekViewTitleForeground),
      secondaryHeadingColor: theme.getColor(peekView.peekViewTitleInfoForeground)
    });
  }
  show(where) {
    super.show(where, this.layoutData.heightInLines || 18);
  }
  focusOnReferenceTree() {
    this._tree.domFocus();
  }
  focusOnPreviewEditor() {
    this._preview.focus();
  }
  isPreviewEditorFocused() {
    return this._preview.hasTextFocus();
  }
  _onTitleClick(e) {
    if (this._preview && this._preview.getModel()) {
      this._onDidSelectReference.fire({
        element: this._getFocusedReference(),
        kind: e.ctrlKey || e.metaKey || e.altKey ? "side" : "open",
        source: "title"
      });
    }
  }
  _fillBody(containerElement) {
    this.setCssClass("reference-zone-widget");
    this._messageContainer = dom.append(containerElement, dom.$("div.messages"));
    dom.hide(this._messageContainer);
    this._splitView = new SplitView(containerElement, { orientation: Orientation.HORIZONTAL });
    this._previewContainer = dom.append(containerElement, dom.$("div.preview.inline"));
    const options = {
      scrollBeyondLastLine: false,
      scrollbar: {
        verticalScrollbarSize: 14,
        horizontal: "auto",
        useShadows: true,
        verticalHasArrows: false,
        horizontalHasArrows: false,
        alwaysConsumeMouseWheel: true
      },
      overviewRulerLanes: 2,
      fixedOverflowWidgets: true,
      minimap: {
        enabled: false
      }
    };
    this._preview = this._instantiationService.createInstance(EmbeddedCodeEditorWidget, this._previewContainer, options, {}, this.editor);
    dom.hide(this._previewContainer);
    this._previewNotAvailableMessage = this._instantiationService.createInstance(TextModel, nls.localize("missingPreviewMessage", "no preview available"), PLAINTEXT_LANGUAGE_ID, TextModel.DEFAULT_CREATION_OPTIONS, null);
    this._treeContainer = dom.append(containerElement, dom.$("div.ref-tree.inline"));
    const treeOptions = {
      keyboardSupport: this._defaultTreeKeyboardSupport,
      accessibilityProvider: new AccessibilityProvider(),
      keyboardNavigationLabelProvider: this._instantiationService.createInstance(StringRepresentationProvider),
      identityProvider: new IdentityProvider(),
      openOnSingleClick: true,
      selectionNavigation: true,
      overrideStyles: {
        listBackground: peekView.peekViewResultsBackground
      },
      dnd: this._instantiationService.createInstance(ReferencesDragAndDrop)
    };
    if (this._defaultTreeKeyboardSupport) {
      this._callOnDispose.add(dom.addStandardDisposableListener(this._treeContainer, "keydown", (e) => {
        if (e.equals(KeyCode.Escape)) {
          this._keybindingService.dispatchEvent(e, e.target);
          e.stopPropagation();
        }
      }, true));
    }
    this._tree = this._instantiationService.createInstance(
      ReferencesTree,
      "ReferencesWidget",
      this._treeContainer,
      new Delegate(),
      [
        this._instantiationService.createInstance(FileReferencesRenderer),
        this._instantiationService.createInstance(OneReferenceRenderer)
      ],
      this._instantiationService.createInstance(DataSource),
      treeOptions
    );
    this._splitView.addView({
      onDidChange: Event.None,
      element: this._previewContainer,
      minimumSize: 200,
      maximumSize: Number.MAX_VALUE,
      layout: (width) => {
        this._preview.layout({ height: this._dim.height, width });
      }
    }, Sizing.Distribute);
    this._splitView.addView({
      onDidChange: Event.None,
      element: this._treeContainer,
      minimumSize: 100,
      maximumSize: Number.MAX_VALUE,
      layout: (width) => {
        this._treeContainer.style.height = `${this._dim.height}px`;
        this._treeContainer.style.width = `${width}px`;
        this._tree.layout(this._dim.height, width);
      }
    }, Sizing.Distribute);
    this._disposables.add(this._splitView.onDidSashChange(() => {
      if (this._dim.width) {
        this.layoutData.ratio = this._splitView.getViewSize(0) / this._dim.width;
      }
    }, void 0));
    const onEvent = (element, kind) => {
      if (element instanceof OneReference) {
        if (kind === "show") {
          this._revealReference(element, false);
        }
        this._onDidSelectReference.fire({ element, kind, source: "tree" });
      }
    };
    this._disposables.add(this._tree.onDidOpen((e) => {
      if (e.sideBySide) {
        onEvent(e.element, "side");
      } else if (e.editorOptions.pinned) {
        onEvent(e.element, "goto");
      } else {
        onEvent(e.element, "show");
      }
    }));
    dom.hide(this._treeContainer);
  }
  _onWidth(width) {
    if (this._dim) {
      this._doLayoutBody(this._dim.height, width);
    }
  }
  _doLayoutBody(heightInPixel, widthInPixel) {
    super._doLayoutBody(heightInPixel, widthInPixel);
    this._dim = new dom.Dimension(widthInPixel, heightInPixel);
    this.layoutData.heightInLines = this._viewZone ? this._viewZone.heightInLines : this.layoutData.heightInLines;
    this._splitView.layout(widthInPixel);
    this._splitView.resizeView(0, widthInPixel * this.layoutData.ratio);
  }
  setSelection(selection) {
    return this._revealReference(selection, true).then(() => {
      if (!this._model) {
        return;
      }
      this._tree.setSelection([selection]);
      this._tree.setFocus([selection]);
    });
  }
  setModel(newModel) {
    this._disposeOnNewModel.clear();
    this._model = newModel;
    if (this._model) {
      return this._onNewModel();
    }
    return Promise.resolve();
  }
  _onNewModel() {
    if (!this._model) {
      return Promise.resolve(void 0);
    }
    if (this._model.isEmpty) {
      this.setTitle("");
      this._messageContainer.innerText = nls.localize("noResults", "No results");
      dom.show(this._messageContainer);
      return Promise.resolve(void 0);
    }
    dom.hide(this._messageContainer);
    this._decorationsManager = new DecorationsManager(this._preview, this._model);
    this._disposeOnNewModel.add(this._decorationsManager);
    this._disposeOnNewModel.add(this._model.onDidChangeReferenceRange((reference) => this._tree.rerender(reference)));
    this._disposeOnNewModel.add(this._preview.onMouseDown((e) => {
      const { event, target } = e;
      if (event.detail !== 2) {
        return;
      }
      const element = this._getFocusedReference();
      if (!element) {
        return;
      }
      this._onDidSelectReference.fire({
        element: { uri: element.uri, range: target.range },
        kind: event.ctrlKey || event.metaKey || event.altKey ? "side" : "open",
        source: "editor"
      });
    }));
    this.container.classList.add("results-loaded");
    dom.show(this._treeContainer);
    dom.show(this._previewContainer);
    this._splitView.layout(this._dim.width);
    this.focusOnReferenceTree();
    return this._tree.setInput(this._model.groups.length === 1 ? this._model.groups[0] : this._model);
  }
  _getFocusedReference() {
    const [element] = this._tree.getFocus();
    if (element instanceof OneReference) {
      return element;
    } else if (element instanceof FileReferences) {
      if (element.children.length > 0) {
        return element.children[0];
      }
    }
    return void 0;
  }
  async revealReference(reference) {
    await this._revealReference(reference, false);
    this._onDidSelectReference.fire({ element: reference, kind: "goto", source: "tree" });
  }
  async _revealReference(reference, revealParent) {
    if (this._revealedReference === reference) {
      return;
    }
    this._revealedReference = reference;
    if (reference.uri.scheme !== Schemas.inMemory) {
      this.setTitle(basenameOrAuthority(reference.uri), this._uriLabel.getUriLabel(dirname(reference.uri)));
    } else {
      this.setTitle(nls.localize("peekView.alternateTitle", "References"));
    }
    const promise = this._textModelResolverService.createModelReference(reference.uri);
    if (this._tree.getInput() === reference.parent) {
      this._tree.reveal(reference);
    } else {
      if (revealParent) {
        this._tree.reveal(reference.parent);
      }
      await this._tree.expand(reference.parent);
      this._tree.reveal(reference);
    }
    const ref = await promise;
    if (!this._model) {
      ref.dispose();
      return;
    }
    dispose(this._previewModelReference);
    const model = ref.object;
    if (model) {
      const scrollType = this._preview.getModel() === model.textEditorModel ? ScrollType.Smooth : ScrollType.Immediate;
      const sel = Range.lift(reference.range).collapseToStart();
      this._previewModelReference = ref;
      this._preview.setModel(model.textEditorModel);
      this._preview.setSelection(sel);
      this._preview.revealRangeInCenter(sel, scrollType);
    } else {
      this._preview.setModel(this._previewNotAvailableMessage);
      ref.dispose();
    }
  }
};
ReferenceWidget = __decorateClass([
  __decorateParam(3, IThemeService),
  __decorateParam(4, ITextModelService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, peekView.IPeekViewService),
  __decorateParam(7, ILabelService),
  __decorateParam(8, IKeybindingService)
], ReferenceWidget);
export {
  LayoutData,
  ReferenceWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGdvdG9TeW1ib2xcXGJyb3dzZXJcXHBlZWtcXHJlZmVyZW5jZXNXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IE9yaWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Nhc2gvc2FzaC5qcyc7XG5pbXBvcnQgeyBTaXppbmcsIFNwbGl0VmlldyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zcGxpdHZpZXcvc3BsaXR2aWV3LmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSwgSVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZU9yQXV0aG9yaXR5LCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCAnLi9yZWZlcmVuY2VzV2lkZ2V0LmNzcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2VtYmVkZGVkQ29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMsIFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvck1vZGVsLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVByb3ZpZGVyLCBEYXRhU291cmNlLCBEZWxlZ2F0ZSwgRmlsZVJlZmVyZW5jZXNSZW5kZXJlciwgSWRlbnRpdHlQcm92aWRlciwgT25lUmVmZXJlbmNlUmVuZGVyZXIsIFN0cmluZ1JlcHJlc2VudGF0aW9uUHJvdmlkZXIsIFRyZWVFbGVtZW50IH0gZnJvbSAnLi9yZWZlcmVuY2VzVHJlZS5qcyc7XG5pbXBvcnQgKiBhcyBwZWVrVmlldyBmcm9tICcuLi8uLi8uLi9wZWVrVmlldy9icm93c2VyL3BlZWtWaWV3LmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEFzeW5jRGF0YVRyZWVPcHRpb25zLCBXb3JrYmVuY2hBc3luY0RhdGFUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb2xvclRoZW1lLCBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBGaWxlUmVmZXJlbmNlcywgT25lUmVmZXJlbmNlLCBSZWZlcmVuY2VzTW9kZWwgfSBmcm9tICcuLi9yZWZlcmVuY2VzTW9kZWwuanMnO1xuaW1wb3J0IHsgSVRyZWVEcmFnQW5kRHJvcCwgSVRyZWVEcmFnT3ZlclJlYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBEYXRhVHJhbnNmZXJzLCBJRHJhZ0FuZERyb3BEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBFbGVtZW50c0RyYWdBbmREcm9wRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RWaWV3LmpzJztcbmltcG9ydCB7IHdpdGhTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5cbmNsYXNzIERlY29yYXRpb25zTWFuYWdlciBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBEZWNvcmF0aW9uT3B0aW9ucyA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoe1xuXHRcdGRlc2NyaXB0aW9uOiAncmVmZXJlbmNlLWRlY29yYXRpb24nLFxuXHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLFxuXHRcdGNsYXNzTmFtZTogJ3JlZmVyZW5jZS1kZWNvcmF0aW9uJ1xuXHR9KTtcblxuXHRwcml2YXRlIF9kZWNvcmF0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBPbmVSZWZlcmVuY2U+KCk7XG5cdHByaXZhdGUgX2RlY29yYXRpb25JZ25vcmVTZXQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FsbE9uRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FsbE9uTW9kZWxDaGFuZ2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBfZWRpdG9yOiBJQ29kZUVkaXRvciwgcHJpdmF0ZSBfbW9kZWw6IFJlZmVyZW5jZXNNb2RlbCkge1xuXHRcdHRoaXMuX2NhbGxPbkRpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHRoaXMuX29uTW9kZWxDaGFuZ2VkKCkpKTtcblx0XHR0aGlzLl9vbk1vZGVsQ2hhbmdlZCgpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jYWxsT25Nb2RlbENoYW5nZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY2FsbE9uRGlzcG9zZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5yZW1vdmVEZWNvcmF0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25Nb2RlbENoYW5nZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FsbE9uTW9kZWxDaGFuZ2UuY2xlYXIoKTtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCByZWYgb2YgdGhpcy5fbW9kZWwucmVmZXJlbmNlcykge1xuXHRcdFx0aWYgKHJlZi51cmkudG9TdHJpbmcoKSA9PT0gbW9kZWwudXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0dGhpcy5fYWRkRGVjb3JhdGlvbnMocmVmLnBhcmVudCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hZGREZWNvcmF0aW9ucyhyZWZlcmVuY2U6IEZpbGVSZWZlcmVuY2VzKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jYWxsT25Nb2RlbENoYW5nZS5hZGQodGhpcy5fZWRpdG9yLmdldE1vZGVsKCkub25EaWRDaGFuZ2VEZWNvcmF0aW9ucygoKSA9PiB0aGlzLl9vbkRlY29yYXRpb25DaGFuZ2VkKCkpKTtcblxuXHRcdGNvbnN0IG5ld0RlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IG5ld0RlY29yYXRpb25zQWN0dWFsSW5kZXg6IG51bWJlcltdID0gW107XG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gcmVmZXJlbmNlLmNoaWxkcmVuLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBvbmVSZWZlcmVuY2UgPSByZWZlcmVuY2UuY2hpbGRyZW5baV07XG5cdFx0XHRpZiAodGhpcy5fZGVjb3JhdGlvbklnbm9yZVNldC5oYXMob25lUmVmZXJlbmNlLmlkKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChvbmVSZWZlcmVuY2UudXJpLnRvU3RyaW5nKCkgIT09IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpLnVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0bmV3RGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdHJhbmdlOiBvbmVSZWZlcmVuY2UucmFuZ2UsXG5cdFx0XHRcdG9wdGlvbnM6IERlY29yYXRpb25zTWFuYWdlci5EZWNvcmF0aW9uT3B0aW9uc1xuXHRcdFx0fSk7XG5cdFx0XHRuZXdEZWNvcmF0aW9uc0FjdHVhbEluZGV4LnB1c2goaSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWRpdG9yLmNoYW5nZURlY29yYXRpb25zKChjaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSBjaGFuZ2VBY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zKFtdLCBuZXdEZWNvcmF0aW9ucyk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGRlY29yYXRpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHRoaXMuX2RlY29yYXRpb25zLnNldChkZWNvcmF0aW9uc1tpXSwgcmVmZXJlbmNlLmNoaWxkcmVuW25ld0RlY29yYXRpb25zQWN0dWFsSW5kZXhbaV1dKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX29uRGVjb3JhdGlvbkNoYW5nZWQoKTogdm9pZCB7XG5cdFx0Y29uc3QgdG9SZW1vdmU6IHN0cmluZ1tdID0gW107XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IFtkZWNvcmF0aW9uSWQsIHJlZmVyZW5jZV0gb2YgdGhpcy5fZGVjb3JhdGlvbnMpIHtcblxuXHRcdFx0Y29uc3QgbmV3UmFuZ2UgPSBtb2RlbC5nZXREZWNvcmF0aW9uUmFuZ2UoZGVjb3JhdGlvbklkKTtcblxuXHRcdFx0aWYgKCFuZXdSYW5nZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGlnbm9yZSA9IGZhbHNlO1xuXHRcdFx0aWYgKFJhbmdlLmVxdWFsc1JhbmdlKG5ld1JhbmdlLCByZWZlcmVuY2UucmFuZ2UpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXG5cdFx0XHR9XG5cblx0XHRcdGlmIChSYW5nZS5zcGFuc011bHRpcGxlTGluZXMobmV3UmFuZ2UpKSB7XG5cdFx0XHRcdGlnbm9yZSA9IHRydWU7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVMZW5ndGggPSByZWZlcmVuY2UucmFuZ2UuZW5kQ29sdW1uIC0gcmVmZXJlbmNlLnJhbmdlLnN0YXJ0Q29sdW1uO1xuXHRcdFx0XHRjb25zdCBuZXdMaW5lTGVuZ3RoID0gbmV3UmFuZ2UuZW5kQ29sdW1uIC0gbmV3UmFuZ2Uuc3RhcnRDb2x1bW47XG5cblx0XHRcdFx0aWYgKGxpbmVMZW5ndGggIT09IG5ld0xpbmVMZW5ndGgpIHtcblx0XHRcdFx0XHRpZ25vcmUgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpZ25vcmUpIHtcblx0XHRcdFx0dGhpcy5fZGVjb3JhdGlvbklnbm9yZVNldC5hZGQocmVmZXJlbmNlLmlkKTtcblx0XHRcdFx0dG9SZW1vdmUucHVzaChkZWNvcmF0aW9uSWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVmZXJlbmNlLnJhbmdlID0gbmV3UmFuZ2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRvUmVtb3ZlLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9ucy5kZWxldGUodG9SZW1vdmVbaV0pO1xuXHRcdH1cblx0XHR0aGlzLl9lZGl0b3IucmVtb3ZlRGVjb3JhdGlvbnModG9SZW1vdmUpO1xuXHR9XG5cblx0cmVtb3ZlRGVjb3JhdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdG9yLnJlbW92ZURlY29yYXRpb25zKFsuLi50aGlzLl9kZWNvcmF0aW9ucy5rZXlzKCldKTtcblx0XHR0aGlzLl9kZWNvcmF0aW9ucy5jbGVhcigpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBMYXlvdXREYXRhIHtcblx0cmF0aW86IG51bWJlciA9IDAuNztcblx0aGVpZ2h0SW5MaW5lczogbnVtYmVyID0gMTg7XG5cblx0c3RhdGljIGZyb21KU09OKHJhdzogc3RyaW5nKTogTGF5b3V0RGF0YSB7XG5cdFx0bGV0IHJhdGlvOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGhlaWdodEluTGluZXM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IDxMYXlvdXREYXRhPkpTT04ucGFyc2UocmF3KTtcblx0XHRcdHJhdGlvID0gZGF0YS5yYXRpbztcblx0XHRcdGhlaWdodEluTGluZXMgPSBkYXRhLmhlaWdodEluTGluZXM7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvL1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmF0aW86IHJhdGlvIHx8IDAuNyxcblx0XHRcdGhlaWdodEluTGluZXM6IGhlaWdodEluTGluZXMgfHwgMThcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VsZWN0aW9uRXZlbnQge1xuXHRyZWFkb25seSBraW5kOiAnZ290bycgfCAnc2hvdycgfCAnc2lkZScgfCAnb3Blbic7XG5cdHJlYWRvbmx5IHNvdXJjZTogJ2VkaXRvcicgfCAndHJlZScgfCAndGl0bGUnO1xuXHRyZWFkb25seSBlbGVtZW50PzogTG9jYXRpb247XG59XG5cbmNsYXNzIFJlZmVyZW5jZXNUcmVlIGV4dGVuZHMgV29ya2JlbmNoQXN5bmNEYXRhVHJlZTxSZWZlcmVuY2VzTW9kZWwgfCBGaWxlUmVmZXJlbmNlcywgVHJlZUVsZW1lbnQsIEZ1enp5U2NvcmU+IHsgfVxuXG5jbGFzcyBSZWZlcmVuY2VzRHJhZ0FuZERyb3AgaW1wbGVtZW50cyBJVHJlZURyYWdBbmREcm9wPFRyZWVFbGVtZW50PiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3RvcihASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSkgeyB9XG5cblx0Z2V0RHJhZ1VSSShlbGVtZW50OiBUcmVlRWxlbWVudCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgRmlsZVJlZmVyZW5jZXMpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LnVyaS50b1N0cmluZygpO1xuXHRcdH0gZWxzZSBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIE9uZVJlZmVyZW5jZSkge1xuXHRcdFx0cmV0dXJuIHdpdGhTZWxlY3Rpb24oZWxlbWVudC51cmksIGVsZW1lbnQucmFuZ2UpLnRvU3RyaW5nKCk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Z2V0RHJhZ0xhYmVsKGVsZW1lbnRzOiBUcmVlRWxlbWVudFtdKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZWxlbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBsYWJlbHMgPSBlbGVtZW50cy5tYXAoZSA9PiB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKGUudXJpKSk7XG5cdFx0cmV0dXJuIGxhYmVscy5qb2luKCcsICcpO1xuXHR9XG5cblx0b25EcmFnU3RhcnQoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCFvcmlnaW5hbEV2ZW50LmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVsZW1lbnRzID0gKGRhdGEgYXMgRWxlbWVudHNEcmFnQW5kRHJvcERhdGE8VHJlZUVsZW1lbnQsIFRyZWVFbGVtZW50W10+KS5lbGVtZW50cztcblx0XHRjb25zdCByZXNvdXJjZXMgPSBlbGVtZW50cy5tYXAoZSA9PiB0aGlzLmdldERyYWdVUkkoZSkpLmZpbHRlcihCb29sZWFuKTtcblxuXHRcdGlmIChyZXNvdXJjZXMubGVuZ3RoKSB7XG5cdFx0XHQvLyBBcHBseSByZXNvdXJjZXMgYXMgcmVzb3VyY2UtbGlzdFxuXHRcdFx0b3JpZ2luYWxFdmVudC5kYXRhVHJhbnNmZXIuc2V0RGF0YShEYXRhVHJhbnNmZXJzLlJFU09VUkNFUywgSlNPTi5zdHJpbmdpZnkocmVzb3VyY2VzKSk7XG5cblx0XHRcdC8vIEFsc28gYWRkIGFzIHBsYWluIHRleHQgZm9yIG91dHNpZGUgY29uc3VtZXJzXG5cdFx0XHRvcmlnaW5hbEV2ZW50LmRhdGFUcmFuc2Zlci5zZXREYXRhKERhdGFUcmFuc2ZlcnMuVEVYVCwgcmVzb3VyY2VzLmpvaW4oJ1xcbicpKTtcblx0XHR9XG5cdH1cblxuXHRvbkRyYWdPdmVyKCk6IGJvb2xlYW4gfCBJVHJlZURyYWdPdmVyUmVhY3Rpb24geyByZXR1cm4gZmFsc2U7IH1cblx0ZHJvcCgpOiB2b2lkIHsgfVxuXHRkaXNwb3NlKCk6IHZvaWQgeyB0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTsgfVxufVxuXG4vKipcbiAqIFpvbmVXaWRnZXQgdGhhdCBpcyBzaG93biBpbnNpZGUgdGhlIGVkaXRvclxuICovXG5leHBvcnQgY2xhc3MgUmVmZXJlbmNlV2lkZ2V0IGV4dGVuZHMgcGVla1ZpZXcuUGVla1ZpZXdXaWRnZXQge1xuXG5cdHByaXZhdGUgX21vZGVsPzogUmVmZXJlbmNlc01vZGVsO1xuXHRwcml2YXRlIF9kZWNvcmF0aW9uc01hbmFnZXI/OiBEZWNvcmF0aW9uc01hbmFnZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zZU9uTmV3TW9kZWwgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhbGxPbkRpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZWxlY3RSZWZlcmVuY2UgPSB0aGlzLl9jYWxsT25EaXNwb3NlLmFkZChuZXcgRW1pdHRlcjxTZWxlY3Rpb25FdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2VsZWN0UmVmZXJlbmNlID0gdGhpcy5fb25EaWRTZWxlY3RSZWZlcmVuY2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfdHJlZSE6IFJlZmVyZW5jZXNUcmVlO1xuXHRwcml2YXRlIF90cmVlQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3NwbGl0VmlldyE6IFNwbGl0Vmlldztcblx0cHJpdmF0ZSBfcHJldmlldyE6IElDb2RlRWRpdG9yO1xuXHRwcml2YXRlIF9wcmV2aWV3TW9kZWxSZWZlcmVuY2UhOiBJUmVmZXJlbmNlPElUZXh0RWRpdG9yTW9kZWw+O1xuXHRwcml2YXRlIF9wcmV2aWV3Tm90QXZhaWxhYmxlTWVzc2FnZSE6IFRleHRNb2RlbDtcblx0cHJpdmF0ZSBfcHJldmlld0NvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9tZXNzYWdlQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2RpbSA9IG5ldyBkb20uRGltZW5zaW9uKDAsIDApO1xuXHRwcml2YXRlIF9pc0Nsb3NpbmcgPSBmYWxzZTsgLy8gd2hldGhlciBvciBub3QgYSBkaXNwb3NlIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3NcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgX2RlZmF1bHRUcmVlS2V5Ym9hcmRTdXBwb3J0OiBib29sZWFuLFxuXHRcdHB1YmxpYyBsYXlvdXREYXRhOiBMYXlvdXREYXRhLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QHBlZWtWaWV3LklQZWVrVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGVla1ZpZXdTZXJ2aWNlOiBwZWVrVmlldy5JUGVla1ZpZXdTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VyaUxhYmVsOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoZWRpdG9yLCB7IHNob3dGcmFtZTogZmFsc2UsIHNob3dBcnJvdzogdHJ1ZSwgaXNSZXNpemVhYmxlOiB0cnVlLCBpc0FjY2Vzc2libGU6IHRydWUsIHN1cHBvcnRPblRpdGxlQ2xpY2s6IHRydWUgfSwgX2luc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2FwcGx5VGhlbWUodGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKSk7XG5cdFx0dGhpcy5fY2FsbE9uRGlzcG9zZS5hZGQodGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSh0aGlzLl9hcHBseVRoZW1lLmJpbmQodGhpcykpKTtcblx0XHR0aGlzLl9wZWVrVmlld1NlcnZpY2UuYWRkRXhjbHVzaXZlV2lkZ2V0KGVkaXRvciwgdGhpcyk7XG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0fVxuXG5cdGdldCBpc0Nsb3NpbmcoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzQ2xvc2luZztcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNDbG9zaW5nID0gdHJ1ZTtcblx0XHR0aGlzLnNldE1vZGVsKHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fY2FsbE9uRGlzcG9zZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZGlzcG9zZU9uTmV3TW9kZWwuZGlzcG9zZSgpO1xuXHRcdGRpc3Bvc2UodGhpcy5fcHJldmlldyk7XG5cdFx0ZGlzcG9zZSh0aGlzLl9wcmV2aWV3Tm90QXZhaWxhYmxlTWVzc2FnZSk7XG5cdFx0ZGlzcG9zZSh0aGlzLl90cmVlKTtcblx0XHRkaXNwb3NlKHRoaXMuX3ByZXZpZXdNb2RlbFJlZmVyZW5jZSk7XG5cdFx0dGhpcy5fc3BsaXRWaWV3LmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseVRoZW1lKHRoZW1lOiBJQ29sb3JUaGVtZSkge1xuXHRcdGNvbnN0IGJvcmRlckNvbG9yID0gdGhlbWUuZ2V0Q29sb3IocGVla1ZpZXcucGVla1ZpZXdCb3JkZXIpIHx8IENvbG9yLnRyYW5zcGFyZW50O1xuXHRcdHRoaXMuc3R5bGUoe1xuXHRcdFx0YXJyb3dDb2xvcjogYm9yZGVyQ29sb3IsXG5cdFx0XHRmcmFtZUNvbG9yOiBib3JkZXJDb2xvcixcblx0XHRcdGhlYWRlckJhY2tncm91bmRDb2xvcjogdGhlbWUuZ2V0Q29sb3IocGVla1ZpZXcucGVla1ZpZXdUaXRsZUJhY2tncm91bmQpIHx8IENvbG9yLnRyYW5zcGFyZW50LFxuXHRcdFx0cHJpbWFyeUhlYWRpbmdDb2xvcjogdGhlbWUuZ2V0Q29sb3IocGVla1ZpZXcucGVla1ZpZXdUaXRsZUZvcmVncm91bmQpLFxuXHRcdFx0c2Vjb25kYXJ5SGVhZGluZ0NvbG9yOiB0aGVtZS5nZXRDb2xvcihwZWVrVmlldy5wZWVrVmlld1RpdGxlSW5mb0ZvcmVncm91bmQpXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBzaG93KHdoZXJlOiBJUmFuZ2UpIHtcblx0XHRzdXBlci5zaG93KHdoZXJlLCB0aGlzLmxheW91dERhdGEuaGVpZ2h0SW5MaW5lcyB8fCAxOCk7XG5cdH1cblxuXHRmb2N1c09uUmVmZXJlbmNlVHJlZSgpOiB2b2lkIHtcblx0XHR0aGlzLl90cmVlLmRvbUZvY3VzKCk7XG5cdH1cblxuXHRmb2N1c09uUHJldmlld0VkaXRvcigpOiB2b2lkIHtcblx0XHR0aGlzLl9wcmV2aWV3LmZvY3VzKCk7XG5cdH1cblxuXHRpc1ByZXZpZXdFZGl0b3JGb2N1c2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9wcmV2aWV3Lmhhc1RleHRGb2N1cygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vblRpdGxlQ2xpY2soZTogSU1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcHJldmlldyAmJiB0aGlzLl9wcmV2aWV3LmdldE1vZGVsKCkpIHtcblx0XHRcdHRoaXMuX29uRGlkU2VsZWN0UmVmZXJlbmNlLmZpcmUoe1xuXHRcdFx0XHRlbGVtZW50OiB0aGlzLl9nZXRGb2N1c2VkUmVmZXJlbmNlKCksXG5cdFx0XHRcdGtpbmQ6IGUuY3RybEtleSB8fCBlLm1ldGFLZXkgfHwgZS5hbHRLZXkgPyAnc2lkZScgOiAnb3BlbicsXG5cdFx0XHRcdHNvdXJjZTogJ3RpdGxlJ1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9maWxsQm9keShjb250YWluZXJFbGVtZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuc2V0Q3NzQ2xhc3MoJ3JlZmVyZW5jZS16b25lLXdpZGdldCcpO1xuXG5cdFx0Ly8gbWVzc2FnZSBwYW5lXG5cdFx0dGhpcy5fbWVzc2FnZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29udGFpbmVyRWxlbWVudCwgZG9tLiQoJ2Rpdi5tZXNzYWdlcycpKTtcblx0XHRkb20uaGlkZSh0aGlzLl9tZXNzYWdlQ29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3NwbGl0VmlldyA9IG5ldyBTcGxpdFZpZXcoY29udGFpbmVyRWxlbWVudCwgeyBvcmllbnRhdGlvbjogT3JpZW50YXRpb24uSE9SSVpPTlRBTCB9KTtcblxuXHRcdC8vIGVkaXRvclxuXHRcdHRoaXMuX3ByZXZpZXdDb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lckVsZW1lbnQsIGRvbS4kKCdkaXYucHJldmlldy5pbmxpbmUnKSk7XG5cdFx0Y29uc3Qgb3B0aW9uczogSUVkaXRvck9wdGlvbnMgPSB7XG5cdFx0XHRzY3JvbGxCZXlvbmRMYXN0TGluZTogZmFsc2UsXG5cdFx0XHRzY3JvbGxiYXI6IHtcblx0XHRcdFx0dmVydGljYWxTY3JvbGxiYXJTaXplOiAxNCxcblx0XHRcdFx0aG9yaXpvbnRhbDogJ2F1dG8nLFxuXHRcdFx0XHR1c2VTaGFkb3dzOiB0cnVlLFxuXHRcdFx0XHR2ZXJ0aWNhbEhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRcdGhvcml6b250YWxIYXNBcnJvd3M6IGZhbHNlLFxuXHRcdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdG92ZXJ2aWV3UnVsZXJMYW5lczogMixcblx0XHRcdGZpeGVkT3ZlcmZsb3dXaWRnZXRzOiB0cnVlLFxuXHRcdFx0bWluaW1hcDoge1xuXHRcdFx0XHRlbmFibGVkOiBmYWxzZVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5fcHJldmlldyA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCwgdGhpcy5fcHJldmlld0NvbnRhaW5lciwgb3B0aW9ucywge30sIHRoaXMuZWRpdG9yKTtcblx0XHRkb20uaGlkZSh0aGlzLl9wcmV2aWV3Q29udGFpbmVyKTtcblx0XHR0aGlzLl9wcmV2aWV3Tm90QXZhaWxhYmxlTWVzc2FnZSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRNb2RlbCwgbmxzLmxvY2FsaXplKCdtaXNzaW5nUHJldmlld01lc3NhZ2UnLCBcIm5vIHByZXZpZXcgYXZhaWxhYmxlXCIpLCBQTEFJTlRFWFRfTEFOR1VBR0VfSUQsIFRleHRNb2RlbC5ERUZBVUxUX0NSRUFUSU9OX09QVElPTlMsIG51bGwpO1xuXG5cdFx0Ly8gdHJlZVxuXHRcdHRoaXMuX3RyZWVDb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lckVsZW1lbnQsIGRvbS4kKCdkaXYucmVmLXRyZWUuaW5saW5lJykpO1xuXHRcdGNvbnN0IHRyZWVPcHRpb25zOiBJV29ya2JlbmNoQXN5bmNEYXRhVHJlZU9wdGlvbnM8VHJlZUVsZW1lbnQsIEZ1enp5U2NvcmU+ID0ge1xuXHRcdFx0a2V5Ym9hcmRTdXBwb3J0OiB0aGlzLl9kZWZhdWx0VHJlZUtleWJvYXJkU3VwcG9ydCxcblx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IEFjY2Vzc2liaWxpdHlQcm92aWRlcigpLFxuXHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjogdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3RyaW5nUmVwcmVzZW50YXRpb25Qcm92aWRlciksXG5cdFx0XHRpZGVudGl0eVByb3ZpZGVyOiBuZXcgSWRlbnRpdHlQcm92aWRlcigpLFxuXHRcdFx0b3Blbk9uU2luZ2xlQ2xpY2s6IHRydWUsXG5cdFx0XHRzZWxlY3Rpb25OYXZpZ2F0aW9uOiB0cnVlLFxuXHRcdFx0b3ZlcnJpZGVTdHlsZXM6IHtcblx0XHRcdFx0bGlzdEJhY2tncm91bmQ6IHBlZWtWaWV3LnBlZWtWaWV3UmVzdWx0c0JhY2tncm91bmRcblx0XHRcdH0sXG5cdFx0XHRkbmQ6IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlZmVyZW5jZXNEcmFnQW5kRHJvcClcblx0XHR9O1xuXHRcdGlmICh0aGlzLl9kZWZhdWx0VHJlZUtleWJvYXJkU3VwcG9ydCkge1xuXHRcdFx0Ly8gdGhlIHRyZWUgd2lsbCBjb25zdW1lIGBFc2NhcGVgIGFuZCBwcmV2ZW50IHRoZSB3aWRnZXQgZnJvbSBjbG9zaW5nXG5cdFx0XHR0aGlzLl9jYWxsT25EaXNwb3NlLmFkZChkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdHJlZUNvbnRhaW5lciwgJ2tleWRvd24nLCAoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fa2V5YmluZGluZ1NlcnZpY2UuZGlzcGF0Y2hFdmVudChlLCBlLnRhcmdldCk7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgdHJ1ZSkpO1xuXHRcdH1cblx0XHR0aGlzLl90cmVlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRSZWZlcmVuY2VzVHJlZSxcblx0XHRcdCdSZWZlcmVuY2VzV2lkZ2V0Jyxcblx0XHRcdHRoaXMuX3RyZWVDb250YWluZXIsXG5cdFx0XHRuZXcgRGVsZWdhdGUoKSxcblx0XHRcdFtcblx0XHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZVJlZmVyZW5jZXNSZW5kZXJlciksXG5cdFx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE9uZVJlZmVyZW5jZVJlbmRlcmVyKSxcblx0XHRcdF0sXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEYXRhU291cmNlKSxcblx0XHRcdHRyZWVPcHRpb25zLFxuXHRcdCk7XG5cblx0XHQvLyBzcGxpdCBzdHVmZlxuXHRcdHRoaXMuX3NwbGl0Vmlldy5hZGRWaWV3KHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0ZWxlbWVudDogdGhpcy5fcHJldmlld0NvbnRhaW5lcixcblx0XHRcdG1pbmltdW1TaXplOiAyMDAsXG5cdFx0XHRtYXhpbXVtU2l6ZTogTnVtYmVyLk1BWF9WQUxVRSxcblx0XHRcdGxheW91dDogKHdpZHRoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3ByZXZpZXcubGF5b3V0KHsgaGVpZ2h0OiB0aGlzLl9kaW0uaGVpZ2h0LCB3aWR0aCB9KTtcblx0XHRcdH1cblx0XHR9LCBTaXppbmcuRGlzdHJpYnV0ZSk7XG5cblx0XHR0aGlzLl9zcGxpdFZpZXcuYWRkVmlldyh7XG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdGVsZW1lbnQ6IHRoaXMuX3RyZWVDb250YWluZXIsXG5cdFx0XHRtaW5pbXVtU2l6ZTogMTAwLFxuXHRcdFx0bWF4aW11bVNpemU6IE51bWJlci5NQVhfVkFMVUUsXG5cdFx0XHRsYXlvdXQ6ICh3aWR0aCkgPT4ge1xuXHRcdFx0XHR0aGlzLl90cmVlQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke3RoaXMuX2RpbS5oZWlnaHR9cHhgO1xuXHRcdFx0XHR0aGlzLl90cmVlQ29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRcdFx0XHR0aGlzLl90cmVlLmxheW91dCh0aGlzLl9kaW0uaGVpZ2h0LCB3aWR0aCk7XG5cdFx0XHR9XG5cdFx0fSwgU2l6aW5nLkRpc3RyaWJ1dGUpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3NwbGl0Vmlldy5vbkRpZFNhc2hDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2RpbS53aWR0aCkge1xuXHRcdFx0XHR0aGlzLmxheW91dERhdGEucmF0aW8gPSB0aGlzLl9zcGxpdFZpZXcuZ2V0Vmlld1NpemUoMCkgLyB0aGlzLl9kaW0ud2lkdGg7XG5cdFx0XHR9XG5cdFx0fSwgdW5kZWZpbmVkKSk7XG5cblx0XHQvLyBsaXN0ZW4gb24gc2VsZWN0aW9uIGFuZCBmb2N1c1xuXHRcdGNvbnN0IG9uRXZlbnQgPSAoZWxlbWVudDogVHJlZUVsZW1lbnQgfCB1bmRlZmluZWQsIGtpbmQ6ICdzaG93JyB8ICdnb3RvJyB8ICdzaWRlJykgPT4ge1xuXHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBPbmVSZWZlcmVuY2UpIHtcblx0XHRcdFx0aWYgKGtpbmQgPT09ICdzaG93Jykge1xuXHRcdFx0XHRcdHRoaXMuX3JldmVhbFJlZmVyZW5jZShlbGVtZW50LCBmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fb25EaWRTZWxlY3RSZWZlcmVuY2UuZmlyZSh7IGVsZW1lbnQsIGtpbmQsIHNvdXJjZTogJ3RyZWUnIH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3RyZWUub25EaWRPcGVuKGUgPT4ge1xuXHRcdFx0aWYgKGUuc2lkZUJ5U2lkZSkge1xuXHRcdFx0XHRvbkV2ZW50KGUuZWxlbWVudCwgJ3NpZGUnKTtcblx0XHRcdH0gZWxzZSBpZiAoZS5lZGl0b3JPcHRpb25zLnBpbm5lZCkge1xuXHRcdFx0XHRvbkV2ZW50KGUuZWxlbWVudCwgJ2dvdG8nKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG9uRXZlbnQoZS5lbGVtZW50LCAnc2hvdycpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRvbS5oaWRlKHRoaXMuX3RyZWVDb250YWluZXIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vbldpZHRoKHdpZHRoOiBudW1iZXIpIHtcblx0XHRpZiAodGhpcy5fZGltKSB7XG5cdFx0XHR0aGlzLl9kb0xheW91dEJvZHkodGhpcy5fZGltLmhlaWdodCwgd2lkdGgpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZG9MYXlvdXRCb2R5KGhlaWdodEluUGl4ZWw6IG51bWJlciwgd2lkdGhJblBpeGVsOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5fZG9MYXlvdXRCb2R5KGhlaWdodEluUGl4ZWwsIHdpZHRoSW5QaXhlbCk7XG5cdFx0dGhpcy5fZGltID0gbmV3IGRvbS5EaW1lbnNpb24od2lkdGhJblBpeGVsLCBoZWlnaHRJblBpeGVsKTtcblx0XHR0aGlzLmxheW91dERhdGEuaGVpZ2h0SW5MaW5lcyA9IHRoaXMuX3ZpZXdab25lID8gdGhpcy5fdmlld1pvbmUuaGVpZ2h0SW5MaW5lcyA6IHRoaXMubGF5b3V0RGF0YS5oZWlnaHRJbkxpbmVzO1xuXHRcdHRoaXMuX3NwbGl0Vmlldy5sYXlvdXQod2lkdGhJblBpeGVsKTtcblx0XHR0aGlzLl9zcGxpdFZpZXcucmVzaXplVmlldygwLCB3aWR0aEluUGl4ZWwgKiB0aGlzLmxheW91dERhdGEucmF0aW8pO1xuXHR9XG5cblx0c2V0U2VsZWN0aW9uKHNlbGVjdGlvbjogT25lUmVmZXJlbmNlKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JldmVhbFJlZmVyZW5jZShzZWxlY3Rpb24sIHRydWUpLnRoZW4oKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9tb2RlbCkge1xuXHRcdFx0XHQvLyBkaXNwb3NlZFxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBzaG93IGluIHRyZWVcblx0XHRcdHRoaXMuX3RyZWUuc2V0U2VsZWN0aW9uKFtzZWxlY3Rpb25dKTtcblx0XHRcdHRoaXMuX3RyZWUuc2V0Rm9jdXMoW3NlbGVjdGlvbl0pO1xuXHRcdH0pO1xuXHR9XG5cblx0c2V0TW9kZWwobmV3TW9kZWw6IFJlZmVyZW5jZXNNb2RlbCB8IHVuZGVmaW5lZCk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdC8vIGNsZWFuIHVwXG5cdFx0dGhpcy5fZGlzcG9zZU9uTmV3TW9kZWwuY2xlYXIoKTtcblx0XHR0aGlzLl9tb2RlbCA9IG5ld01vZGVsO1xuXHRcdGlmICh0aGlzLl9tb2RlbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX29uTmV3TW9kZWwoKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25OZXdNb2RlbCgpOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRpZiAoIXRoaXMuX21vZGVsKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX21vZGVsLmlzRW1wdHkpIHtcblx0XHRcdHRoaXMuc2V0VGl0bGUoJycpO1xuXHRcdFx0dGhpcy5fbWVzc2FnZUNvbnRhaW5lci5pbm5lclRleHQgPSBubHMubG9jYWxpemUoJ25vUmVzdWx0cycsIFwiTm8gcmVzdWx0c1wiKTtcblx0XHRcdGRvbS5zaG93KHRoaXMuX21lc3NhZ2VDb250YWluZXIpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGRvbS5oaWRlKHRoaXMuX21lc3NhZ2VDb250YWluZXIpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zTWFuYWdlciA9IG5ldyBEZWNvcmF0aW9uc01hbmFnZXIodGhpcy5fcHJldmlldywgdGhpcy5fbW9kZWwpO1xuXHRcdHRoaXMuX2Rpc3Bvc2VPbk5ld01vZGVsLmFkZCh0aGlzLl9kZWNvcmF0aW9uc01hbmFnZXIpO1xuXG5cdFx0Ly8gbGlzdGVuIG9uIG1vZGVsIGNoYW5nZXNcblx0XHR0aGlzLl9kaXNwb3NlT25OZXdNb2RlbC5hZGQodGhpcy5fbW9kZWwub25EaWRDaGFuZ2VSZWZlcmVuY2VSYW5nZShyZWZlcmVuY2UgPT4gdGhpcy5fdHJlZS5yZXJlbmRlcihyZWZlcmVuY2UpKSk7XG5cblx0XHQvLyBsaXN0ZW4gb24gZWRpdG9yXG5cdFx0dGhpcy5fZGlzcG9zZU9uTmV3TW9kZWwuYWRkKHRoaXMuX3ByZXZpZXcub25Nb3VzZURvd24oZSA9PiB7XG5cdFx0XHRjb25zdCB7IGV2ZW50LCB0YXJnZXQgfSA9IGU7XG5cdFx0XHRpZiAoZXZlbnQuZGV0YWlsICE9PSAyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLl9nZXRGb2N1c2VkUmVmZXJlbmNlKCk7XG5cdFx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRTZWxlY3RSZWZlcmVuY2UuZmlyZSh7XG5cdFx0XHRcdGVsZW1lbnQ6IHsgdXJpOiBlbGVtZW50LnVyaSwgcmFuZ2U6IHRhcmdldC5yYW5nZSEgfSxcblx0XHRcdFx0a2luZDogKGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQubWV0YUtleSB8fCBldmVudC5hbHRLZXkpID8gJ3NpZGUnIDogJ29wZW4nLFxuXHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHQvLyBtYWtlIHN1cmUgdGhpbmdzIGFyZSByZW5kZXJlZFxuXHRcdHRoaXMuY29udGFpbmVyIS5jbGFzc0xpc3QuYWRkKCdyZXN1bHRzLWxvYWRlZCcpO1xuXHRcdGRvbS5zaG93KHRoaXMuX3RyZWVDb250YWluZXIpO1xuXHRcdGRvbS5zaG93KHRoaXMuX3ByZXZpZXdDb250YWluZXIpO1xuXHRcdHRoaXMuX3NwbGl0Vmlldy5sYXlvdXQodGhpcy5fZGltLndpZHRoKTtcblx0XHR0aGlzLmZvY3VzT25SZWZlcmVuY2VUcmVlKCk7XG5cblx0XHQvLyBwaWNrIGlucHV0IGFuZCBhIHJlZmVyZW5jZSB0byBiZWdpbiB3aXRoXG5cdFx0cmV0dXJuIHRoaXMuX3RyZWUuc2V0SW5wdXQodGhpcy5fbW9kZWwuZ3JvdXBzLmxlbmd0aCA9PT0gMSA/IHRoaXMuX21vZGVsLmdyb3Vwc1swXSA6IHRoaXMuX21vZGVsKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEZvY3VzZWRSZWZlcmVuY2UoKTogT25lUmVmZXJlbmNlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBbZWxlbWVudF0gPSB0aGlzLl90cmVlLmdldEZvY3VzKCk7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBPbmVSZWZlcmVuY2UpIHtcblx0XHRcdHJldHVybiBlbGVtZW50O1xuXHRcdH0gZWxzZSBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEZpbGVSZWZlcmVuY2VzKSB7XG5cdFx0XHRpZiAoZWxlbWVudC5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJldHVybiBlbGVtZW50LmNoaWxkcmVuWzBdO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgcmV2ZWFsUmVmZXJlbmNlKHJlZmVyZW5jZTogT25lUmVmZXJlbmNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcmV2ZWFsUmVmZXJlbmNlKHJlZmVyZW5jZSwgZmFsc2UpO1xuXHRcdHRoaXMuX29uRGlkU2VsZWN0UmVmZXJlbmNlLmZpcmUoeyBlbGVtZW50OiByZWZlcmVuY2UsIGtpbmQ6ICdnb3RvJywgc291cmNlOiAndHJlZScgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXZlYWxlZFJlZmVyZW5jZT86IE9uZVJlZmVyZW5jZTtcblxuXHRwcml2YXRlIGFzeW5jIF9yZXZlYWxSZWZlcmVuY2UocmVmZXJlbmNlOiBPbmVSZWZlcmVuY2UsIHJldmVhbFBhcmVudDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gY2hlY2sgaWYgdGhlcmUgaXMgYW55dGhpbmcgdG8gZG8uLi5cblx0XHRpZiAodGhpcy5fcmV2ZWFsZWRSZWZlcmVuY2UgPT09IHJlZmVyZW5jZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZXZlYWxlZFJlZmVyZW5jZSA9IHJlZmVyZW5jZTtcblxuXHRcdC8vIFVwZGF0ZSB3aWRnZXQgaGVhZGVyXG5cdFx0aWYgKHJlZmVyZW5jZS51cmkuc2NoZW1lICE9PSBTY2hlbWFzLmluTWVtb3J5KSB7XG5cdFx0XHR0aGlzLnNldFRpdGxlKGJhc2VuYW1lT3JBdXRob3JpdHkocmVmZXJlbmNlLnVyaSksIHRoaXMuX3VyaUxhYmVsLmdldFVyaUxhYmVsKGRpcm5hbWUocmVmZXJlbmNlLnVyaSkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZXRUaXRsZShubHMubG9jYWxpemUoJ3BlZWtWaWV3LmFsdGVybmF0ZVRpdGxlJywgXCJSZWZlcmVuY2VzXCIpKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9taXNlID0gdGhpcy5fdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHJlZmVyZW5jZS51cmkpO1xuXG5cdFx0aWYgKHRoaXMuX3RyZWUuZ2V0SW5wdXQoKSA9PT0gcmVmZXJlbmNlLnBhcmVudCkge1xuXHRcdFx0dGhpcy5fdHJlZS5yZXZlYWwocmVmZXJlbmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHJldmVhbFBhcmVudCkge1xuXHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChyZWZlcmVuY2UucGFyZW50KTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX3RyZWUuZXhwYW5kKHJlZmVyZW5jZS5wYXJlbnQpO1xuXHRcdFx0dGhpcy5fdHJlZS5yZXZlYWwocmVmZXJlbmNlKTtcblx0XHR9XG5cblx0XHRjb25zdCByZWYgPSBhd2FpdCBwcm9taXNlO1xuXG5cdFx0aWYgKCF0aGlzLl9tb2RlbCkge1xuXHRcdFx0Ly8gZGlzcG9zZWRcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZGlzcG9zZSh0aGlzLl9wcmV2aWV3TW9kZWxSZWZlcmVuY2UpO1xuXG5cdFx0Ly8gc2hvdyBpbiBlZGl0b3Jcblx0XHRjb25zdCBtb2RlbCA9IHJlZi5vYmplY3Q7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRjb25zdCBzY3JvbGxUeXBlID0gdGhpcy5fcHJldmlldy5nZXRNb2RlbCgpID09PSBtb2RlbC50ZXh0RWRpdG9yTW9kZWwgPyBTY3JvbGxUeXBlLlNtb290aCA6IFNjcm9sbFR5cGUuSW1tZWRpYXRlO1xuXHRcdFx0Y29uc3Qgc2VsID0gUmFuZ2UubGlmdChyZWZlcmVuY2UucmFuZ2UpLmNvbGxhcHNlVG9TdGFydCgpO1xuXHRcdFx0dGhpcy5fcHJldmlld01vZGVsUmVmZXJlbmNlID0gcmVmO1xuXHRcdFx0dGhpcy5fcHJldmlldy5zZXRNb2RlbChtb2RlbC50ZXh0RWRpdG9yTW9kZWwpO1xuXHRcdFx0dGhpcy5fcHJldmlldy5zZXRTZWxlY3Rpb24oc2VsKTtcblx0XHRcdHRoaXMuX3ByZXZpZXcucmV2ZWFsUmFuZ2VJbkNlbnRlcihzZWwsIHNjcm9sbFR5cGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9wcmV2aWV3LnNldE1vZGVsKHRoaXMuX3ByZXZpZXdOb3RBdmFpbGFibGVNZXNzYWdlKTtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUVyQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFFBQVEsaUJBQWlCO0FBQ2xDLFNBQVMsYUFBYTtBQUN0QixTQUFTLFNBQVMsYUFBYTtBQUUvQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUIsZUFBd0M7QUFDbEUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMscUJBQXFCLGVBQWU7QUFDN0MsT0FBTztBQUVQLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQWlCLGFBQWE7QUFDOUIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBZ0MsOEJBQThCO0FBQzlELFNBQVMsd0JBQXdCLGlCQUFpQjtBQUVsRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUEyQix5QkFBeUI7QUFDcEQsU0FBUyx1QkFBdUIsWUFBWSxVQUFVLHdCQUF3QixrQkFBa0Isc0JBQXNCLG9DQUFpRDtBQUN2SyxZQUFZLGNBQWM7QUFDMUIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCO0FBQzlCLFNBQXlDLDhCQUE4QjtBQUN2RSxTQUFzQixxQkFBcUI7QUFDM0MsU0FBUyxnQkFBZ0Isb0JBQXFDO0FBRTlELFNBQVMscUJBQXVDO0FBRWhELFNBQVMscUJBQXFCO0FBRTlCLE1BQU0sc0JBQU4sTUFBTSxvQkFBMEM7QUFBQSxFQWEvQyxZQUFvQixTQUE4QixRQUF5QjtBQUF2RDtBQUE4QjtBQUxsRCxTQUFRLGVBQWUsb0JBQUksSUFBMEI7QUFDckQsU0FBUSx1QkFBdUIsb0JBQUksSUFBWTtBQUMvQyxTQUFpQixpQkFBaUIsSUFBSSxnQkFBZ0I7QUFDdEQsU0FBaUIscUJBQXFCLElBQUksZ0JBQWdCO0FBR3pELFNBQUssZUFBZSxJQUFJLEtBQUssUUFBUSxpQkFBaUIsTUFBTSxL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
