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
import { getWindow, h, scheduleAtNextAnimationFrame } from "../../../../base/browser/dom.js";
import { SmoothScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { compareBy, numberComparator } from "../../../../base/common/arrays.js";
import { findFirstMax } from "../../../../base/common/arraysFind.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, autorunWithStore, derived, disposableObservableValue, globalTransaction, observableFromEvent, observableValue, transaction } from "../../../../base/common/observable.js";
import { Scrollable, ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { localize } from "../../../../nls.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { OffsetRange } from "../../../common/core/ranges/offsetRange.js";
import { Selection } from "../../../common/core/selection.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { ObservableElementSizeObserver } from "../diffEditor/utils.js";
import { DiffEditorItemTemplate, TemplateData } from "./diffEditorItemTemplate.js";
import { ObjectPool } from "./objectPool.js";
import "./style.css";
let MultiDiffEditorWidgetImpl = class extends Disposable {
  constructor(_element, _dimension, _viewModel, _workbenchUIElementFactory, _renderSideBySide, _diffEditorOptions, _parentContextKeyService, _parentInstantiationService) {
    super();
    this._element = _element;
    this._dimension = _dimension;
    this._viewModel = _viewModel;
    this._workbenchUIElementFactory = _workbenchUIElementFactory;
    this._renderSideBySide = _renderSideBySide;
    this._diffEditorOptions = _diffEditorOptions;
    this._parentContextKeyService = _parentContextKeyService;
    this._parentInstantiationService = _parentInstantiationService;
    /**
     * When `true`, the automatic "select the first change" initialization that
     * runs once the view model finishes loading does not move keyboard focus
     * into the editor. Driven by {@link setPreserveFocusOnLoad} so a
     * `preserveFocus` open (e.g. restored in the background or on a session
     * switch) does not steal focus, while a normal user-initiated open does.
     */
    this._preserveFocusOnLoad = false;
    this._scrollableElements = h("div.scrollContent", [
      h("div@content", {
        style: {
          overflow: "hidden"
        }
      }),
      h("div.monaco-editor@overflowWidgetsDomNode", {})
    ]);
    this._scrollable = this._register(new Scrollable({
      forceIntegerValues: false,
      scheduleAtNextAnimationFrame: (cb) => scheduleAtNextAnimationFrame(getWindow(this._element), cb),
      smoothScrollDuration: 100
    }));
    this._scrollableElement = this._register(new SmoothScrollableElement(this._scrollableElements.root, {
      vertical: ScrollbarVisibility.Auto,
      horizontal: ScrollbarVisibility.Auto,
      useShadows: false
    }, this._scrollable));
    this._elements = h("div.monaco-component.multiDiffEditor", {}, [
      h("div", {}, [this._scrollableElement.getDomNode()]),
      h("div.placeholder@placeholder", {}, [h("div")])
    ]);
    this._sizeObserver = this._register(new ObservableElementSizeObserver(this._element, void 0));
    this._optionsOverride = derived(this, (reader) => {
      const renderSideBySide = this._renderSideBySide.read(reader);
      const options = renderSideBySide === void 0 ? {} : { renderSideBySide, useInlineViewWhenSpaceIsLimited: false };
      return { ...this._diffEditorOptions, ...options };
    });
    this._objectPool = this._register(new ObjectPool((data) => {
      const template = this._instantiationService.createInstance(
        DiffEditorItemTemplate,
        this._scrollableElements.content,
        this._scrollableElements.overflowWidgetsDomNode,
        this._workbenchUIElementFactory,
        this._optionsOverride
      );
      template.setData(data);
      return template;
    }));
    this.scrollTop = observableFromEvent(this, this._scrollableElement.onScroll, () => (
      /** @description scrollTop */
      this._scrollableElement.getScrollPosition().scrollTop
    ));
    this.scrollLeft = observableFromEvent(this, this._scrollableElement.onScroll, () => (
      /** @description scrollLeft */
      this._scrollableElement.getScrollPosition().scrollLeft
    ));
    this._viewItemsInfo = derived(
      this,
      (reader) => {
        const vm = this._viewModel.read(reader);
        if (!vm) {
          return { items: [], getItem: (_d) => {
            throw new BugIndicatingError();
          } };
        }
        const viewModels = vm.items.read(reader);
        const map = /* @__PURE__ */ new Map();
        const items = viewModels.map((d) => {
          const item = reader.store.add(new VirtualizedViewItem(d, this._objectPool, this.scrollLeft, (delta) => {
            this._scrollableElement.setScrollPosition({ scrollTop: this._scrollableElement.getScrollPosition().scrollTop + delta });
          }));
          const data = this._lastDocStates?.[item.getKey()];
          if (data) {
            transaction((tx) => {
              item.setViewState(data, tx);
            });
          }
          map.set(d, item);
          return item;
        });
        return { items, getItem: (d) => map.get(d) };
      }
    );
    this._viewItems = this._viewItemsInfo.map(this, (items) => items.items);
    this._spaceBetweenPx = 0;
    this._totalHeight = this._viewItems.map(this, (items, reader) => items.reduce((r, i) => r + i.contentHeight.read(reader) + this._spaceBetweenPx, 0));
    this.activeControl = derived(this, (reader) => {
      const activeDiffItem = this._viewModel.read(reader)?.activeDiffItem.read(reader);
      if (!activeDiffItem) {
        return void 0;
      }
      const viewItem = this._viewItemsInfo.read(reader).getItem(activeDiffItem);
      return viewItem.template.read(reader)?.editor;
    });
    this._contextKeyService = this._register(this._parentContextKeyService.createScoped(this._element));
    this._instantiationService = this._register(this._parentInstantiationService.createChild(
      new ServiceCollection([IContextKeyService, this._contextKeyService])
    ));
    this._contextKeyService.createKey(EditorContextKeys.inMultiDiffEditor.key, true);
    this._lastDocStates = {};
    this._register(autorunWithStore((reader, store) => {
      const viewModel = this._viewModel.read(reader);
      if (viewModel && viewModel.contextKeys) {
        for (const [key, value] of Object.entries(viewModel.contextKeys)) {
          const contextKey = this._contextKeyService.createKey(key, void 0);
          contextKey.set(value);
          store.add(toDisposable(() => contextKey.reset()));
        }
      }
    }));
    const ctxAllCollapsed = this._parentContextKeyService.createKey(EditorContextKeys.multiDiffEditorAllCollapsed.key, false);
    this._register(autorun((reader) => {
      const viewModel = this._viewModel.read(reader);
      if (viewModel) {
        const allCollapsed = viewModel.items.read(reader).every((item) => item.collapsed.read(reader));
        ctxAllCollapsed.set(allCollapsed);
      }
    }));
    const ctxRenderSideBySide = this._parentContextKeyService.createKey(EditorContextKeys.multiDiffEditorRenderSideBySide.key, true);
    this._register(autorun((reader) => {
      const renderSideBySide = this._renderSideBySide.read(reader);
      if (renderSideBySide !== void 0) {
        ctxRenderSideBySide.set(renderSideBySide);
      }
    }));
    this._register(autorun((reader) => {
      const dimension = this._dimension.read(reader);
      this._sizeObserver.observe(dimension);
    }));
    const placeholderMessage = derived((reader) => {
      const items = this._viewItems.read(reader);
      if (items.length > 0) {
        return void 0;
      }
      const vm = this._viewModel.read(reader);
      return !vm || vm.isLoading.read(reader) ? localize("loading", "Loading...") : localize("noChangedFiles", "No Changed Files");
    });
    this._register(autorun((reader) => {
      const message = placeholderMessage.read(reader);
      this._elements.placeholder.innerText = message ?? "";
      this._elements.placeholder.classList.toggle("visible", !!message);
    }));
    this._scrollableElements.content.style.position = "relative";
    this._register(autorun((reader) => {
      const height = this._sizeObserver.height.read(reader);
      this._scrollableElements.root.style.height = `${height}px`;
      const totalHeight = this._totalHeight.read(reader);
      this._scrollableElements.content.style.height = `${totalHeight}px`;
      const width = this._sizeObserver.width.read(reader);
      let scrollWidth = width;
      const viewItems = this._viewItems.read(reader);
      const max = findFirstMax(viewItems, compareBy((i) => i.maxScroll.read(reader).maxScroll, numberComparator));
      if (max) {
        const maxScroll = max.maxScroll.read(reader);
        scrollWidth = width + maxScroll.maxScroll;
      }
      this._scrollableElement.setScrollDimensions({
        width,
        height,
        scrollHeight: totalHeight,
        scrollWidth
      });
      this._applyPendingScrollState();
    }));
    _element.replaceChildren(this._elements.root);
    this._register(toDisposable(() => {
      _element.replaceChildren();
    }));
    this._register(autorun((reader) => {
      const viewModel = this._viewModel.read(reader);
      if (!viewModel) {
        return;
      }
      if (!viewModel.isLoading.read(reader)) {
        const items = viewModel.items.read(reader);
        if (items.length === 0) {
          return;
        }
        const activeDiffItem = viewModel.activeDiffItem.read(reader);
        if (activeDiffItem) {
          return;
        }
        if (this._restorePendingActiveDiffItem(viewModel, items)) {
          return;
        }
        this._navigateToChange("next", !this._preserveFocusOnLoad);
      }
    }));
    this._register(this._register(autorun((reader) => {
      globalTransaction((tx) => {
        this.render(reader);
      });
    })));
  }
  setScrollState(scrollState) {
    this._pendingScrollState = scrollState;
    this._applyPendingScrollState();
  }
  /**
   * Applies a restored scroll offset once the scrollable dimensions can
   * accommodate it; retries on subsequent dimension updates until it sticks (so
   * a fresh/reloaded widget whose content height is not yet known does not clamp
   * the offset to 0). Consumed once it lands.
   */
  _applyPendingScrollState() {
    const pending = this._pendingScrollState;
    if (!pending) {
      return;
    }
    this._scrollableElement.setScrollPosition({ scrollLeft: pending.left, scrollTop: pending.top });
    const applied = this._scrollableElement.getScrollPosition();
    const topLanded = pending.top === void 0 || applied.scrollTop >= pending.top;
    const leftLanded = pending.left === void 0 || applied.scrollLeft >= pending.left;
    if (topLanded && leftLanded) {
      this._pendingScrollState = void 0;
    }
  }
  /**
   * Clears any pending restoration state (documents, active item, scroll). Called
   * when a new model is installed without a view state, so it cannot inherit the
   * previous model's state for overlapping diff keys.
   */
  clearPendingRestorationState() {
    this._lastDocStates = void 0;
    this._lastActiveDiffItemKey = void 0;
    this._pendingScrollState = void 0;
  }
  /**
   * Controls whether the automatic first-change selection that runs once the
   * view model finishes loading preserves focus instead of moving it into the
   * editor. Set to `true` for `preserveFocus` opens so focus is not stolen
   * from elsewhere.
   */
  setPreserveFocusOnLoad(preserveFocus) {
    this._preserveFocusOnLoad = preserveFocus;
  }
  getRootElement() {
    return this._elements.root;
  }
  getContextKeyService() {
    return this._contextKeyService;
  }
  getScopedInstantiationService() {
    return this._instantiationService;
  }
  reveal(resource, options) {
    const viewItems = this._viewItems.get();
    const index = viewItems.findIndex(
      (item) => item.viewModel.originalUri?.toString() === resource.original?.toString() && item.viewModel.modifiedUri?.toString() === resource.modified?.toString()
    );
    if (index === -1) {
      throw new BugIndicatingError("Resource not found in diff editor");
    }
    const viewItem = viewItems[index];
    this._viewModel.get().activeDiffItem.setCache(viewItem.viewModel, void 0);
    let scrollTop = 0;
    for (let i = 0; i < index; i++) {
      scrollTop += viewItems[i].contentHeight.get() + this._spaceBetweenPx;
    }
    this._scrollableElement.setScrollPosition({ scrollTop });
    const diffEditor = viewItem.template.get()?.editor;
    const editor = "original" in resource ? diffEditor?.getOriginalEditor() : diffEditor?.getModifiedEditor();
    if (editor && options?.range) {
      editor.revealRangeInCenter(options.range);
      highlightRange(editor, options.range);
    }
  }
  getViewState() {
    return {
      scrollState: {
        top: this.scrollTop.get(),
        left: this.scrollLeft.get()
      },
      docStates: Object.fromEntries(this._viewItems.get().map((i) => [i.getKey(), i.getViewState()])),
      activeDiffItemKey: this._viewModel.get()?.activeDiffItem.get()?.getKey()
    };
  }
  setViewState(viewState, tx) {
    this.setScrollState(viewState.scrollState);
    this._lastDocStates = viewState.docStates;
    this._lastActiveDiffItemKey = viewState.activeDiffItemKey;
    const applyDocStates = (tx2) => {
      if (viewState.docStates) {
        for (const i of this._viewItems.get()) {
          const state = viewState.docStates[i.getKey()];
          if (state) {
            i.setViewState(state, tx2);
          }
        }
      }
    };
    if (tx) {
      applyDocStates(tx);
    } else {
      transaction(applyDocStates);
    }
    const viewModel = this._viewModel.get();
    if (viewModel) {
      this._restorePendingActiveDiffItem(viewModel, viewModel.items.get());
    }
  }
  /**
   * Restores the persisted active diff item (if any) onto the view model, so the
   * automatic first-change navigation is skipped. On an explicit (non-preserve-focus)
   * open it also moves focus into the restored item's editor, mirroring the
   * first-change navigation it replaces. Returns whether it was applied.
   */
  _restorePendingActiveDiffItem(viewModel, items) {
    const key = this._lastActiveDiffItemKey;
    if (key === void 0 || items.length === 0) {
      return false;
    }
    this._lastActiveDiffItemKey = void 0;
    const target = items.find((i) => i.getKey() === key);
    if (!target) {
      return false;
    }
    viewModel.activeDiffItem.setCache(target, void 0);
    if (!this._preserveFocusOnLoad) {
      this._viewItemsInfo.get().getItem(target).template.get()?.editor.focus();
    }
    return true;
  }
  findDocumentDiffItem(resource) {
    const item = this._viewItems.get().find(
      (v) => v.viewModel.diffEditorViewModel.model.modified.uri.toString() === resource.toString() || v.viewModel.diffEditorViewModel.model.original.uri.toString() === resource.toString()
    );
    return item?.viewModel.documentDiffItem;
  }
  tryGetCodeEditor(resource) {
    const item = this._viewItems.get().find(
      (v) => v.viewModel.diffEditorViewModel.model.modified.uri.toString() === resource.toString() || v.viewModel.diffEditorViewModel.model.original.uri.toString() === resource.toString()
    );
    const editor = item?.template.get()?.editor;
    if (!editor) {
      return void 0;
    }
    if (item.viewModel.diffEditorViewModel.model.modified.uri.toString() === resource.toString()) {
      return { diffEditor: editor, editor: editor.getModifiedEditor() };
    } else {
      return { diffEditor: editor, editor: editor.getOriginalEditor() };
    }
  }
  goToNextChange() {
    this._navigateToChange("next");
  }
  goToPreviousChange() {
    this._navigateToChange("previous");
  }
  _navigateToChange(direction, focusEditor = true) {
    const viewItems = this._viewItems.get();
    if (viewItems.length === 0) {
      return;
    }
    const activeViewModel = this._viewModel.get()?.activeDiffItem.get();
    const currentIndex = activeViewModel ? viewItems.findIndex((v) => v.viewModel === activeViewModel) : -1;
    if (currentIndex === -1) {
      this._goToFile(0, "first", focusEditor);
      return;
    }
    const currentItem = viewItems[currentIndex];
    if (currentItem.viewModel.collapsed.get()) {
      currentItem.viewModel.collapsed.set(false, void 0);
    }
    const editor = currentItem.template.get()?.editor;
    if (editor?.getDiffComputationResult()?.changes2?.length) {
      const pos = editor.getModifiedEditor().getPosition()?.lineNumber || 1;
      const changes = editor.getDiffComputationResult().changes2;
      const hasNext = direction === "next" ? changes.some((c) => c.modified.startLineNumber > pos) : changes.some((c) => c.modified.endLineNumberExclusive <= pos);
      if (hasNext) {
        editor.goToDiff(direction);
        return;
      }
    }
    const nextIndex = (currentIndex + (direction === "next" ? 1 : -1) + viewItems.length) % viewItems.length;
    this._goToFile(nextIndex, direction === "next" ? "first" : "last", focusEditor);
  }
  _goToFile(index, position, focusEditor = true) {
    const item = this._viewItems.get()[index];
    if (item.viewModel.collapsed.get()) {
      item.viewModel.collapsed.set(false, void 0);
    }
    this.reveal({ original: item.viewModel.originalUri, modified: item.viewModel.modifiedUri });
    const editor = item.template.get()?.editor;
    if (editor?.getDiffComputationResult()?.changes2?.length) {
      if (position === "first") {
        editor.revealFirstDiff();
      } else {
        const lastChange = editor.getDiffComputationResult().changes2.at(-1);
        const modifiedEditor = editor.getModifiedEditor();
        modifiedEditor.setPosition({ lineNumber: lastChange.modified.startLineNumber, column: 1 });
        modifiedEditor.revealLineInCenter(lastChange.modified.startLineNumber);
      }
    }
    if (focusEditor) {
      editor?.focus();
    }
  }
  render(reader) {
    const scrollTop = this.scrollTop.read(reader);
    let contentScrollOffsetToScrollOffset = 0;
    let itemHeightSumBefore = 0;
    let itemContentHeightSumBefore = 0;
    const viewPortHeight = this._sizeObserver.height.read(reader);
    const contentViewPort = OffsetRange.ofStartAndLength(scrollTop, viewPortHeight);
    const width = this._sizeObserver.width.read(reader);
    for (const v of this._viewItems.read(reader)) {
      const itemContentHeight = v.contentHeight.read(reader);
      const itemHeight = Math.min(itemContentHeight, viewPortHeight);
      const itemRange = OffsetRange.ofStartAndLength(itemHeightSumBefore, itemHeight);
      const itemContentRange = OffsetRange.ofStartAndLength(itemContentHeightSumBefore, itemContentHeight);
      if (itemContentRange.isBefore(contentViewPort)) {
        contentScrollOffsetToScrollOffset -= itemContentHeight - itemHeight;
        v.hide();
      } else if (itemContentRange.isAfter(contentViewPort)) {
        v.hide();
      } else {
        const scroll = Math.max(0, Math.min(contentViewPort.start - itemContentRange.start, itemContentHeight - itemHeight));
        contentScrollOffsetToScrollOffset -= scroll;
        const viewPort = OffsetRange.ofStartAndLength(scrollTop + contentScrollOffsetToScrollOffset, viewPortHeight);
        v.render(itemRange, scroll, width, viewPort);
      }
      itemHeightSumBefore += itemHeight + this._spaceBetweenPx;
      itemContentHeightSumBefore += itemContentHeight + this._spaceBetweenPx;
    }
    this._scrollableElements.content.style.transform = `translateY(${-(scrollTop + contentScrollOffsetToScrollOffset)}px)`;
  }
};
MultiDiffEditorWidgetImpl = __decorateClass([
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IInstantiationService)
], MultiDiffEditorWidgetImpl);
function highlightRange(targetEditor, range) {
  const modelNow = targetEditor.getModel();
  const decorations = targetEditor.createDecorationsCollection([{ range, options: { description: "symbol-navigate-action-highlight", className: "symbolHighlight" } }]);
  setTimeout(() => {
    if (targetEditor.getModel() === modelNow) {
      decorations.clear();
    }
  }, 350);
}
class VirtualizedViewItem extends Disposable {
  constructor(viewModel, _objectPool, _scrollLeft, _deltaScrollVertical) {
    super();
    this.viewModel = viewModel;
    this._objectPool = _objectPool;
    this._scrollLeft = _scrollLeft;
    this._deltaScrollVertical = _deltaScrollVertical;
    this._templateRef = this._register(disposableObservableValue(this, void 0));
    this.contentHeight = derived(
      this,
      (reader) => this._templateRef.read(reader)?.object.contentHeight?.read(reader) ?? this.viewModel.lastTemplateData.read(reader).contentHeight
    );
    this.maxScroll = derived(this, (reader) => this._templateRef.read(reader)?.object.maxScroll.read(reader) ?? { maxScroll: 0, scrollWidth: 0 });
    this.template = derived(this, (reader) => this._templateRef.read(reader)?.object);
    this._isHidden = observableValue(this, false);
    this._isFocused = derived(this, (reader) => this.template.read(reader)?.isFocused.read(reader) ?? false);
    this.viewModel.setIsFocused(this._isFocused, void 0);
    this._register(autorun((reader) => {
      const scrollLeft = this._scrollLeft.read(reader);
      this._templateRef.read(reader)?.object.setScrollLeft(scrollLeft);
    }));
    this._register(autorun((reader) => {
      const ref = this._templateRef.read(reader);
      if (!ref) {
        return;
      }
      const isHidden = this._isHidden.read(reader);
      if (!isHidden) {
        return;
      }
      const isFocused = ref.object.isFocused.read(reader);
      if (isFocused) {
        return;
      }
      this._clear();
    }));
  }
  dispose() {
    this._clear();
    super.dispose();
  }
  toString() {
    return `VirtualViewItem(${this.viewModel.documentDiffItem.modified?.uri.toString()})`;
  }
  getKey() {
    return this.viewModel.getKey();
  }
  getViewState() {
    transaction((tx) => {
      this._updateTemplateData(tx);
    });
    return {
      collapsed: this.viewModel.collapsed.get(),
      selections: this.viewModel.lastTemplateData.get().selections
    };
  }
  setViewState(viewState, tx) {
    this.viewModel.collapsed.set(viewState.collapsed, tx);
    this._updateTemplateData(tx);
    const data = this.viewModel.lastTemplateData.get();
    const selections = viewState.selections?.map(Selection.liftSelection);
    this.viewModel.lastTemplateData.set({
      ...data,
      selections
    }, tx);
    const ref = this._templateRef.get();
    if (ref) {
      if (selections) {
        ref.object.editor.setSelections(selections);
      }
    }
  }
  _updateTemplateData(tx) {
    const ref = this._templateRef.get();
    if (!ref) {
      return;
    }
    this.viewModel.lastTemplateData.set({
      contentHeight: ref.object.contentHeight.get(),
      selections: ref.object.editor.getSelections() ?? void 0
    }, tx);
  }
  _clear() {
    const ref = this._templateRef.get();
    if (!ref) {
      return;
    }
    transaction((tx) => {
      this._updateTemplateData(tx);
      ref.object.hide();
      this._templateRef.set(void 0, tx);
    });
  }
  hide() {
    this._isHidden.set(true, void 0);
  }
  render(verticalSpace, offset, width, viewPort) {
    this._isHidden.set(false, void 0);
    let ref = this._templateRef.get();
    if (!ref) {
      ref = this._objectPool.getUnusedObj(new TemplateData(this.viewModel, this._deltaScrollVertical));
      this._templateRef.set(ref, void 0);
      const selections = this.viewModel.lastTemplateData.get().selections;
      if (selections) {
        ref.object.editor.setSelections(selections);
      }
    }
    ref.object.render(verticalSpace, width, offset, viewPort);
  }
}
export {
  MultiDiffEditorWidgetImpl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHdpZGdldFxcbXVsdGlEaWZmRWRpdG9yXFxtdWx0aURpZmZFZGl0b3JXaWRnZXRJbXBsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGltZW5zaW9uLCBnZXRXaW5kb3csIGgsIHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFNtb290aFNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBjb21wYXJlQnksIG51bWJlckNvbXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgZmluZEZpcnN0TWF4IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzRmluZC5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSVJlZmVyZW5jZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBJUmVhZGVyLCBJVHJhbnNhY3Rpb24sIGF1dG9ydW4sIGF1dG9ydW5XaXRoU3RvcmUsIGRlcml2ZWQsIGRpc3Bvc2FibGVPYnNlcnZhYmxlVmFsdWUsIGdsb2JhbFRyYW5zYWN0aW9uLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxhYmxlLCBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleVZhbHVlLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBJRGlmZkVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVNlbGVjdGlvbiwgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElEaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgT2JzZXJ2YWJsZUVsZW1lbnRTaXplT2JzZXJ2ZXIgfSBmcm9tICcuLi9kaWZmRWRpdG9yL3V0aWxzLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JJdGVtVGVtcGxhdGUsIFRlbXBsYXRlRGF0YSB9IGZyb20gJy4vZGlmZkVkaXRvckl0ZW1UZW1wbGF0ZS5qcyc7XG5pbXBvcnQgeyBJRG9jdW1lbnREaWZmSXRlbSB9IGZyb20gJy4vbW9kZWwuanMnO1xuaW1wb3J0IHsgRG9jdW1lbnREaWZmSXRlbVZpZXdNb2RlbCwgTXVsdGlEaWZmRWRpdG9yVmlld01vZGVsIH0gZnJvbSAnLi9tdWx0aURpZmZFZGl0b3JWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgUmV2ZWFsT3B0aW9ucyB9IGZyb20gJy4vbXVsdGlEaWZmRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IE9iamVjdFBvb2wgfSBmcm9tICcuL29iamVjdFBvb2wuanMnO1xuaW1wb3J0ICcuL3N0eWxlLmNzcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoVUlFbGVtZW50RmFjdG9yeSB9IGZyb20gJy4vd29ya2JlbmNoVUlFbGVtZW50RmFjdG9yeS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBNdWx0aURpZmZFZGl0b3JXaWRnZXRJbXBsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Njcm9sbGFibGVFbGVtZW50cztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zY3JvbGxhYmxlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Njcm9sbGFibGVFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VsZW1lbnRzO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NpemVPYnNlcnZlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vYmplY3RQb29sO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnNPdmVycmlkZTogSU9ic2VydmFibGU8SURpZmZFZGl0b3JPcHRpb25zPjtcblxuXHRwdWJsaWMgcmVhZG9ubHkgc2Nyb2xsVG9wO1xuXHRwdWJsaWMgcmVhZG9ubHkgc2Nyb2xsTGVmdDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF92aWV3SXRlbXNJbmZvO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdJdGVtcztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zcGFjZUJldHdlZW5QeDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90b3RhbEhlaWdodDtcblx0cHVibGljIHJlYWRvbmx5IGFjdGl2ZUNvbnRyb2w7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdC8qKlxuXHQgKiBXaGVuIGB0cnVlYCwgdGhlIGF1dG9tYXRpYyBcInNlbGVjdCB0aGUgZmlyc3QgY2hhbmdlXCIgaW5pdGlhbGl6YXRpb24gdGhhdFxuXHQgKiBydW5zIG9uY2UgdGhlIHZpZXcgbW9kZWwgZmluaXNoZXMgbG9hZGluZyBkb2VzIG5vdCBtb3ZlIGtleWJvYXJkIGZvY3VzXG5cdCAqIGludG8gdGhlIGVkaXRvci4gRHJpdmVuIGJ5IHtAbGluayBzZXRQcmVzZXJ2ZUZvY3VzT25Mb2FkfSBzbyBhXG5cdCAqIGBwcmVzZXJ2ZUZvY3VzYCBvcGVuIChlLmcuIHJlc3RvcmVkIGluIHRoZSBiYWNrZ3JvdW5kIG9yIG9uIGEgc2Vzc2lvblxuXHQgKiBzd2l0Y2gpIGRvZXMgbm90IHN0ZWFsIGZvY3VzLCB3aGlsZSBhIG5vcm1hbCB1c2VyLWluaXRpYXRlZCBvcGVuIGRvZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9wcmVzZXJ2ZUZvY3VzT25Mb2FkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWxlbWVudDogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGltZW5zaW9uOiBJT2JzZXJ2YWJsZTxEaW1lbnNpb24gfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdNb2RlbDogSU9ic2VydmFibGU8TXVsdGlEaWZmRWRpdG9yVmlld01vZGVsIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF93b3JrYmVuY2hVSUVsZW1lbnRGYWN0b3J5OiBJV29ya2JlbmNoVUlFbGVtZW50RmFjdG9yeSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJTaWRlQnlTaWRlOiBJT2JzZXJ2YWJsZTxib29sZWFuIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmRWRpdG9yT3B0aW9uczogSURpZmZFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGFyZW50Q29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3BhcmVudEluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnRzID0gaCgnZGl2LnNjcm9sbENvbnRlbnQnLCBbXG5cdFx0XHRoKCdkaXZAY29udGVudCcsIHtcblx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRvdmVyZmxvdzogJ2hpZGRlbicsXG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdFx0aCgnZGl2Lm1vbmFjby1lZGl0b3JAb3ZlcmZsb3dXaWRnZXRzRG9tTm9kZScsIHtcblx0XHRcdH0pLFxuXHRcdF0pO1xuXHRcdHRoaXMuX3Njcm9sbGFibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgU2Nyb2xsYWJsZSh7XG5cdFx0XHRmb3JjZUludGVnZXJWYWx1ZXM6IGZhbHNlLFxuXHRcdFx0c2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZTogKGNiKSA9PiBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGdldFdpbmRvdyh0aGlzLl9lbGVtZW50KSwgY2IpLFxuXHRcdFx0c21vb3RoU2Nyb2xsRHVyYXRpb246IDEwMCxcblx0XHR9KSk7XG5cdFx0dGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgU21vb3RoU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnRzLnJvb3QsIHtcblx0XHRcdHZlcnRpY2FsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0XHR1c2VTaGFkb3dzOiBmYWxzZSxcblx0XHR9LCB0aGlzLl9zY3JvbGxhYmxlKSk7XG5cdFx0dGhpcy5fZWxlbWVudHMgPSBoKCdkaXYubW9uYWNvLWNvbXBvbmVudC5tdWx0aURpZmZFZGl0b3InLCB7fSwgW1xuXHRcdFx0aCgnZGl2Jywge30sIFt0aGlzLl9zY3JvbGxhYmxlRWxlbWVudC5nZXREb21Ob2RlKCldKSxcblx0XHRcdGgoJ2Rpdi5wbGFjZWhvbGRlckBwbGFjZWhvbGRlcicsIHt9LCBbaCgnZGl2JyldKSxcblx0XHRdKTtcblx0XHR0aGlzLl9zaXplT2JzZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgT2JzZXJ2YWJsZUVsZW1lbnRTaXplT2JzZXJ2ZXIodGhpcy5fZWxlbWVudCwgdW5kZWZpbmVkKSk7XG5cdFx0dGhpcy5fb3B0aW9uc092ZXJyaWRlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcmVuZGVyU2lkZUJ5U2lkZSA9IHRoaXMuX3JlbmRlclNpZGVCeVNpZGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Ly8gQWxzbyBwaW4gYHVzZUlubGluZVZpZXdXaGVuU3BhY2VJc0xpbWl0ZWRgIG9mZiBzbyB0aGUgdG9nZ2xlIGRldGVybWluaXN0aWNhbGx5XG5cdFx0XHQvLyBjb250cm9scyBpbmxpbmUgdnMuIHNpZGUtYnktc2lkZSByZWdhcmRsZXNzIG9mIHRoZSBhdmFpbGFibGUgd2lkdGguXG5cdFx0XHRjb25zdCBvcHRpb25zOiBJRGlmZkVkaXRvck9wdGlvbnMgPSByZW5kZXJTaWRlQnlTaWRlID09PSB1bmRlZmluZWQgPyB7fSA6IHsgcmVuZGVyU2lkZUJ5U2lkZSwgdXNlSW5saW5lVmlld1doZW5TcGFjZUlzTGltaXRlZDogZmFsc2UgfTtcblx0XHRcdHJldHVybiB7IC4uLnRoaXMuX2RpZmZFZGl0b3JPcHRpb25zLCAuLi5vcHRpb25zIH07XG5cdFx0fSk7XG5cdFx0dGhpcy5fb2JqZWN0UG9vbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBPYmplY3RQb29sPFRlbXBsYXRlRGF0YSwgRGlmZkVkaXRvckl0ZW1UZW1wbGF0ZT4oKGRhdGEpID0+IHtcblx0XHRcdGNvbnN0IHRlbXBsYXRlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdERpZmZFZGl0b3JJdGVtVGVtcGxhdGUsXG5cdFx0XHRcdHRoaXMuX3Njcm9sbGFibGVFbGVtZW50cy5jb250ZW50LFxuXHRcdFx0XHR0aGlzLl9zY3JvbGxhYmxlRWxlbWVudHMub3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSxcblx0XHRcdFx0dGhpcy5fd29ya2JlbmNoVUlFbGVtZW50RmFjdG9yeSxcblx0XHRcdFx0dGhpcy5fb3B0aW9uc092ZXJyaWRlLFxuXHRcdFx0KTtcblx0XHRcdHRlbXBsYXRlLnNldERhdGEoZGF0YSk7XG5cdFx0XHRyZXR1cm4gdGVtcGxhdGU7XG5cdFx0fSkpO1xuXHRcdHRoaXMuc2Nyb2xsVG9wID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCB0aGlzLl9zY3JvbGxhYmxlRWxlbWVudC5vblNjcm9sbCwgKCkgPT4gLyoqIEBkZXNjcmlwdGlvbiBzY3JvbGxUb3AgKi8gdGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0U2Nyb2xsUG9zaXRpb24oKS5zY3JvbGxUb3ApO1xuXHRcdHRoaXMuc2Nyb2xsTGVmdCA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgdGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnQub25TY3JvbGwsICgpID0+IC8qKiBAZGVzY3JpcHRpb24gc2Nyb2xsTGVmdCAqLyB0aGlzLl9zY3JvbGxhYmxlRWxlbWVudC5nZXRTY3JvbGxQb3NpdGlvbigpLnNjcm9sbExlZnQpO1xuXHRcdHRoaXMuX3ZpZXdJdGVtc0luZm8gPSBkZXJpdmVkPHsgaXRlbXM6IHJlYWRvbmx5IFZpcnR1YWxpemVkVmlld0l0ZW1bXTsgZ2V0SXRlbTogKHZpZXdNb2RlbDogRG9jdW1lbnREaWZmSXRlbVZpZXdNb2RlbCkgPT4gVmlydHVhbGl6ZWRWaWV3SXRlbSB9Pih0aGlzLFxuXHRcdFx0KHJlYWRlcikgPT4ge1xuXHRcdFx0XHRjb25zdCB2bSA9IHRoaXMuX3ZpZXdNb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmICghdm0pIHtcblx0XHRcdFx0XHRyZXR1cm4geyBpdGVtczogW10sIGdldEl0ZW06IF9kID0+IHsgdGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcigpOyB9IH07XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgdmlld01vZGVscyA9IHZtLml0ZW1zLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgbWFwID0gbmV3IE1hcDxEb2N1bWVudERpZmZJdGVtVmlld01vZGVsLCBWaXJ0dWFsaXplZFZpZXdJdGVtPigpO1xuXHRcdFx0XHRjb25zdCBpdGVtcyA9IHZpZXdNb2RlbHMubWFwKGQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSByZWFkZXIuc3RvcmUuYWRkKG5ldyBWaXJ0dWFsaXplZFZpZXdJdGVtKGQsIHRoaXMuX29iamVjdFBvb2wsIHRoaXMuc2Nyb2xsTGVmdCwgZGVsdGEgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IHRoaXMuX3Njcm9sbGFibGVFbGVtZW50LmdldFNjcm9sbFBvc2l0aW9uKCkuc2Nyb2xsVG9wICsgZGVsdGEgfSk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9sYXN0RG9jU3RhdGVzPy5baXRlbS5nZXRLZXkoKV07XG5cdFx0XHRcdFx0aWYgKGRhdGEpIHtcblx0XHRcdFx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0XHRcdFx0aXRlbS5zZXRWaWV3U3RhdGUoZGF0YSwgdHgpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdG1hcC5zZXQoZCwgaXRlbSk7XG5cdFx0XHRcdFx0cmV0dXJuIGl0ZW07XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4geyBpdGVtcywgZ2V0SXRlbTogZCA9PiBtYXAuZ2V0KGQpISB9O1xuXHRcdFx0fVxuXHRcdCk7XG5cdFx0dGhpcy5fdmlld0l0ZW1zID0gdGhpcy5fdmlld0l0ZW1zSW5mby5tYXAodGhpcywgaXRlbXMgPT4gaXRlbXMuaXRlbXMpO1xuXHRcdHRoaXMuX3NwYWNlQmV0d2VlblB4ID0gMDtcblx0XHR0aGlzLl90b3RhbEhlaWdodCA9IHRoaXMuX3ZpZXdJdGVtcy5tYXAodGhpcywgKGl0ZW1zLCByZWFkZXIpID0+IGl0ZW1zLnJlZHVjZSgociwgaSkgPT4gciArIGkuY29udGVudEhlaWdodC5yZWFkKHJlYWRlcikgKyB0aGlzLl9zcGFjZUJldHdlZW5QeCwgMCkpO1xuXHRcdHRoaXMuYWN0aXZlQ29udHJvbCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZURpZmZJdGVtID0gdGhpcy5fdmlld01vZGVsLnJlYWQocmVhZGVyKT8uYWN0aXZlRGlmZkl0ZW0ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFhY3RpdmVEaWZmSXRlbSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRjb25zdCB2aWV3SXRlbSA9IHRoaXMuX3ZpZXdJdGVtc0luZm8ucmVhZChyZWFkZXIpLmdldEl0ZW0oYWN0aXZlRGlmZkl0ZW0pO1xuXHRcdFx0cmV0dXJuIHZpZXdJdGVtLnRlbXBsYXRlLnJlYWQocmVhZGVyKT8uZWRpdG9yO1xuXHRcdH0pO1xuXHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fcGFyZW50Q29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuX2VsZW1lbnQpKTtcblx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3BhcmVudEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKFxuXHRcdFx0bmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlXSlcblx0XHQpKTtcblxuXHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShFZGl0b3JDb250ZXh0S2V5cy5pbk11bHRpRGlmZkVkaXRvci5rZXksIHRydWUpO1xuXG5cdFx0dGhpcy5fbGFzdERvY1N0YXRlcyA9IHt9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bldpdGhTdG9yZSgocmVhZGVyLCBzdG9yZSkgPT4ge1xuXHRcdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5fdmlld01vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICh2aWV3TW9kZWwgJiYgdmlld01vZGVsLmNvbnRleHRLZXlzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHZpZXdNb2RlbC5jb250ZXh0S2V5cykpIHtcblx0XHRcdFx0XHRjb25zdCBjb250ZXh0S2V5ID0gdGhpcy5fY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5PENvbnRleHRLZXlWYWx1ZT4oa2V5LCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGNvbnRleHRLZXkuc2V0KHZhbHVlKTtcblx0XHRcdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbnRleHRLZXkucmVzZXQoKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY3R4QWxsQ29sbGFwc2VkID0gdGhpcy5fcGFyZW50Q29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5PGJvb2xlYW4+KEVkaXRvckNvbnRleHRLZXlzLm11bHRpRGlmZkVkaXRvckFsbENvbGxhcHNlZC5rZXksIGZhbHNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKChyZWFkZXIpID0+IHtcblx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuX3ZpZXdNb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAodmlld01vZGVsKSB7XG5cdFx0XHRcdGNvbnN0IGFsbENvbGxhcHNlZCA9IHZpZXdNb2RlbC5pdGVtcy5yZWFkKHJlYWRlcikuZXZlcnkoaXRlbSA9PiBpdGVtLmNvbGxhcHNlZC5yZWFkKHJlYWRlcikpO1xuXHRcdFx0XHRjdHhBbGxDb2xsYXBzZWQuc2V0KGFsbENvbGxhcHNlZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY3R4UmVuZGVyU2lkZUJ5U2lkZSA9IHRoaXMuX3BhcmVudENvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleTxib29sZWFuPihFZGl0b3JDb250ZXh0S2V5cy5tdWx0aURpZmZFZGl0b3JSZW5kZXJTaWRlQnlTaWRlLmtleSwgdHJ1ZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bigocmVhZGVyKSA9PiB7XG5cdFx0XHRjb25zdCByZW5kZXJTaWRlQnlTaWRlID0gdGhpcy5fcmVuZGVyU2lkZUJ5U2lkZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAocmVuZGVyU2lkZUJ5U2lkZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGN0eFJlbmRlclNpZGVCeVNpZGUuc2V0KHJlbmRlclNpZGVCeVNpZGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4oKHJlYWRlcikgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBVcGRhdGUgd2lkZ2V0IGRpbWVuc2lvbiAqL1xuXHRcdFx0Y29uc3QgZGltZW5zaW9uID0gdGhpcy5fZGltZW5zaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3NpemVPYnNlcnZlci5vYnNlcnZlKGRpbWVuc2lvbik7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcGxhY2Vob2xkZXJNZXNzYWdlID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSB0aGlzLl92aWV3SXRlbXMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGl0ZW1zLmxlbmd0aCA+IDApIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdFx0XHRjb25zdCB2bSA9IHRoaXMuX3ZpZXdNb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gKCF2bSB8fCB2bS5pc0xvYWRpbmcucmVhZChyZWFkZXIpKVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdsb2FkaW5nJywgJ0xvYWRpbmcuLi4nKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdub0NoYW5nZWRGaWxlcycsICdObyBDaGFuZ2VkIEZpbGVzJyk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKChyZWFkZXIpID0+IHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBwbGFjZWhvbGRlck1lc3NhZ2UucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fZWxlbWVudHMucGxhY2Vob2xkZXIuaW5uZXJUZXh0ID0gbWVzc2FnZSA/PyAnJztcblx0XHRcdHRoaXMuX2VsZW1lbnRzLnBsYWNlaG9sZGVyLmNsYXNzTGlzdC50b2dnbGUoJ3Zpc2libGUnLCAhIW1lc3NhZ2UpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3Njcm9sbGFibGVFbGVtZW50cy5jb250ZW50LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4oKHJlYWRlcikgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBVcGRhdGUgc2Nyb2xsIGRpbWVuc2lvbnMgKi9cblx0XHRcdGNvbnN0IGhlaWdodCA9IHRoaXMuX3NpemVPYnNlcnZlci5oZWlnaHQucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnRzLnJvb3Quc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0XHRcdGNvbnN0IHRvdGFsSGVpZ2h0ID0gdGhpcy5fdG90YWxIZWlnaHQucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnRzLmNvbnRlbnQuc3R5bGUuaGVpZ2h0ID0gYCR7dG90YWxIZWlnaHR9cHhgO1xuXG5cdFx0XHRjb25zdCB3aWR0aCA9IHRoaXMuX3NpemVPYnNlcnZlci53aWR0aC5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGxldCBzY3JvbGxXaWR0aCA9IHdpZHRoO1xuXHRcdFx0Y29uc3Qgdmlld0l0ZW1zID0gdGhpcy5fdmlld0l0ZW1zLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IG1heCA9IGZpbmRGaXJzdE1heCh2aWV3SXRlbXMsIGNvbXBhcmVCeShpID0+IGkubWF4U2Nyb2xsLnJlYWQocmVhZGVyKS5tYXhTY3JvbGwsIG51bWJlckNvbXBhcmF0b3IpKTtcblx0XHRcdGlmIChtYXgpIHtcblx0XHRcdFx0Y29uc3QgbWF4U2Nyb2xsID0gbWF4Lm1heFNjcm9sbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHNjcm9sbFdpZHRoID0gd2lkdGggKyBtYXhTY3JvbGwubWF4U2Nyb2xsO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9zY3JvbGxhYmxlRWxlbWVudC5zZXRTY3JvbGxEaW1lbnNpb25zKHtcblx0XHRcdFx0d2lkdGg6IHdpZHRoLFxuXHRcdFx0XHRoZWlnaHQ6IGhlaWdodCxcblx0XHRcdFx0c2Nyb2xsSGVpZ2h0OiB0b3RhbEhlaWdodCxcblx0XHRcdFx0c2Nyb2xsV2lkdGgsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQSByZXN0b3JlZCBzY3JvbGwgb2Zmc2V0IGFwcGxpZWQgYmVmb3JlIHRoZSBtb2RlbCB1cGRhdGVkIHRoZXNlXG5cdFx0XHQvLyBkaW1lbnNpb25zIHdvdWxkIGJlIGNsYW1wZWQgYWdhaW5zdCBhIHN0YWxlIChvZnRlbiAwKSBzY3JvbGxIZWlnaHQsIHNvXG5cdFx0XHQvLyBhcHBseSBpdCBoZXJlIG9uY2UgdGhlIGRpbWVuc2lvbnMgYXJlIGtub3duLlxuXHRcdFx0dGhpcy5fYXBwbHlQZW5kaW5nU2Nyb2xsU3RhdGUoKTtcblx0XHR9KSk7XG5cblx0XHRfZWxlbWVudC5yZXBsYWNlQ2hpbGRyZW4odGhpcy5fZWxlbWVudHMucm9vdCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdF9lbGVtZW50LnJlcGxhY2VDaGlsZHJlbigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEF1dG9tYXRpY2FsbHkgc2VsZWN0IHRoZSBmaXJzdCBjaGFuZ2UgaW4gdGhlIGZpcnN0IGZpbGUgd2hlbiBpdGVtcyBhcmUgbG9hZGVkXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBJbml0aWFsaXplIGZpcnN0IGNoYW5nZSAqL1xuXHRcdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5fdmlld01vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghdmlld01vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT25seSBpbml0aWFsaXplIHdoZW4gbG9hZGluZyBpcyBjb21wbGV0ZVxuXHRcdFx0aWYgKCF2aWV3TW9kZWwuaXNMb2FkaW5nLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRjb25zdCBpdGVtcyA9IHZpZXdNb2RlbC5pdGVtcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChpdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPbmx5IGluaXRpYWxpemUgaWYgdGhlcmUncyBubyBhY3RpdmUgaXRlbSB5ZXRcblx0XHRcdFx0Y29uc3QgYWN0aXZlRGlmZkl0ZW0gPSB2aWV3TW9kZWwuYWN0aXZlRGlmZkl0ZW0ucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoYWN0aXZlRGlmZkl0ZW0pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZXN0b3JlIHRoZSBwZXJzaXN0ZWQgYWN0aXZlIGl0ZW0gaW5zdGVhZCBvZiBzZWxlY3RpbmcgdGhlIGZpcnN0XG5cdFx0XHRcdC8vIGNoYW5nZSwgc28gdGhlIHJlc3RvcmVkIHNjcm9sbC9jb2xsYXBzZWQgc3RhdGUgaXMgcHJlc2VydmVkLlxuXHRcdFx0XHRpZiAodGhpcy5fcmVzdG9yZVBlbmRpbmdBY3RpdmVEaWZmSXRlbSh2aWV3TW9kZWwsIGl0ZW1zKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIE5hdmlnYXRlIHRvIHRoZSBmaXJzdCBjaGFuZ2UgdXNpbmcgdGhlIGV4aXN0aW5nIG5hdmlnYXRpb25cblx0XHRcdFx0Ly8gbG9naWMuIFdoZXRoZXIgdGhpcyBhbHNvIG1vdmVzIGtleWJvYXJkIGZvY3VzIGludG8gdGhlIGVkaXRvclxuXHRcdFx0XHQvLyBpcyBkcml2ZW4gYnkgdGhlIGxhc3QgYHNldFZpZXdNb2RlbGAgY2FsbDogYW4gZWRpdG9yIG9wZW5lZFxuXHRcdFx0XHQvLyB3aXRoIGBwcmVzZXJ2ZUZvY3VzYCAoZS5nLiByZXN0b3JlZCBpbiB0aGUgYmFja2dyb3VuZCBvciBvbiBhXG5cdFx0XHRcdC8vIHNlc3Npb24gc3dpdGNoKSBtdXN0IG5vdCBzdGVhbCBmb2N1cyBmcm9tIHdoZXJldmVyIHRoZSB1c2VyIGlzXG5cdFx0XHRcdC8vIChzdWNoIGFzIHRoZSBjaGF0IGlucHV0KSwgd2hpbGUgYSBub3JtYWwgdXNlci1pbml0aWF0ZWQgb3BlblxuXHRcdFx0XHQvLyBmb2N1c2VzIHRoZSBmaXJzdCBjaGFuZ2Ugc28gdGhlIGVkaXRvciBpcyByZWFkeSB0byB1c2UuXG5cdFx0XHRcdHRoaXMuX25hdmlnYXRlVG9DaGFuZ2UoJ25leHQnLCAhdGhpcy5fcHJlc2VydmVGb2N1c09uTG9hZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBSZW5kZXIgYWxsICovXG5cdFx0XHRnbG9iYWxUcmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdHRoaXMucmVuZGVyKHJlYWRlcik7XG5cdFx0XHR9KTtcblx0XHR9KSkpO1xuXHR9XG5cblx0cHVibGljIHNldFNjcm9sbFN0YXRlKHNjcm9sbFN0YXRlOiB7IHRvcD86IG51bWJlcjsgbGVmdD86IG51bWJlciB9KTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ1Njcm9sbFN0YXRlID0gc2Nyb2xsU3RhdGU7XG5cdFx0dGhpcy5fYXBwbHlQZW5kaW5nU2Nyb2xsU3RhdGUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBsaWVzIGEgcmVzdG9yZWQgc2Nyb2xsIG9mZnNldCBvbmNlIHRoZSBzY3JvbGxhYmxlIGRpbWVuc2lvbnMgY2FuXG5cdCAqIGFjY29tbW9kYXRlIGl0OyByZXRyaWVzIG9uIHN1YnNlcXVlbnQgZGltZW5zaW9uIHVwZGF0ZXMgdW50aWwgaXQgc3RpY2tzIChzb1xuXHQgKiBhIGZyZXNoL3JlbG9hZGVkIHdpZGdldCB3aG9zZSBjb250ZW50IGhlaWdodCBpcyBub3QgeWV0IGtub3duIGRvZXMgbm90IGNsYW1wXG5cdCAqIHRoZSBvZmZzZXQgdG8gMCkuIENvbnN1bWVkIG9uY2UgaXQgbGFuZHMuXG5cdCAqL1xuXHRwcml2YXRlIF9hcHBseVBlbmRpbmdTY3JvbGxTdGF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ1Njcm9sbFN0YXRlO1xuXHRcdGlmICghcGVuZGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zY3JvbGxhYmxlRWxlbWVudC5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbExlZnQ6IHBlbmRpbmcubGVmdCwgc2Nyb2xsVG9wOiBwZW5kaW5nLnRvcCB9KTtcblx0XHRjb25zdCBhcHBsaWVkID0gdGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0U2Nyb2xsUG9zaXRpb24oKTtcblx0XHRjb25zdCB0b3BMYW5kZWQgPSBwZW5kaW5nLnRvcCA9PT0gdW5kZWZpbmVkIHx8IGFwcGxpZWQuc2Nyb2xsVG9wID49IHBlbmRpbmcudG9wO1xuXHRcdGNvbnN0IGxlZnRMYW5kZWQgPSBwZW5kaW5nLmxlZnQgPT09IHVuZGVmaW5lZCB8fCBhcHBsaWVkLnNjcm9sbExlZnQgPj0gcGVuZGluZy5sZWZ0O1xuXHRcdGlmICh0b3BMYW5kZWQgJiYgbGVmdExhbmRlZCkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1Njcm9sbFN0YXRlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDbGVhcnMgYW55IHBlbmRpbmcgcmVzdG9yYXRpb24gc3RhdGUgKGRvY3VtZW50cywgYWN0aXZlIGl0ZW0sIHNjcm9sbCkuIENhbGxlZFxuXHQgKiB3aGVuIGEgbmV3IG1vZGVsIGlzIGluc3RhbGxlZCB3aXRob3V0IGEgdmlldyBzdGF0ZSwgc28gaXQgY2Fubm90IGluaGVyaXQgdGhlXG5cdCAqIHByZXZpb3VzIG1vZGVsJ3Mgc3RhdGUgZm9yIG92ZXJsYXBwaW5nIGRpZmYga2V5cy5cblx0ICovXG5cdHB1YmxpYyBjbGVhclBlbmRpbmdSZXN0b3JhdGlvblN0YXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xhc3REb2NTdGF0ZXMgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbGFzdEFjdGl2ZURpZmZJdGVtS2V5ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3BlbmRpbmdTY3JvbGxTdGF0ZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRoZSBhdXRvbWF0aWMgZmlyc3QtY2hhbmdlIHNlbGVjdGlvbiB0aGF0IHJ1bnMgb25jZSB0aGVcblx0ICogdmlldyBtb2RlbCBmaW5pc2hlcyBsb2FkaW5nIHByZXNlcnZlcyBmb2N1cyBpbnN0ZWFkIG9mIG1vdmluZyBpdCBpbnRvIHRoZVxuXHQgKiBlZGl0b3IuIFNldCB0byBgdHJ1ZWAgZm9yIGBwcmVzZXJ2ZUZvY3VzYCBvcGVucyBzbyBmb2N1cyBpcyBub3Qgc3RvbGVuXG5cdCAqIGZyb20gZWxzZXdoZXJlLlxuXHQgKi9cblx0cHVibGljIHNldFByZXNlcnZlRm9jdXNPbkxvYWQocHJlc2VydmVGb2N1czogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3ByZXNlcnZlRm9jdXNPbkxvYWQgPSBwcmVzZXJ2ZUZvY3VzO1xuXHR9XG5cblx0cHVibGljIGdldFJvb3RFbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fZWxlbWVudHMucm9vdDtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb250ZXh0S2V5U2VydmljZSgpOiBJQ29udGV4dEtleVNlcnZpY2Uge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZXh0S2V5U2VydmljZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSgpOiBJSW5zdGFudGlhdGlvblNlcnZpY2Uge1xuXHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZTtcblx0fVxuXHRwdWJsaWMgcmV2ZWFsKHJlc291cmNlOiBJTXVsdGlEaWZmUmVzb3VyY2VJZCwgb3B0aW9ucz86IFJldmVhbE9wdGlvbnMpOiB2b2lkIHtcblx0XHRjb25zdCB2aWV3SXRlbXMgPSB0aGlzLl92aWV3SXRlbXMuZ2V0KCk7XG5cdFx0Y29uc3QgaW5kZXggPSB2aWV3SXRlbXMuZmluZEluZGV4KFxuXHRcdFx0KGl0ZW0pID0+IGl0ZW0udmlld01vZGVsLm9yaWdpbmFsVXJpPy50b1N0cmluZygpID09PSByZXNvdXJjZS5vcmlnaW5hbD8udG9TdHJpbmcoKVxuXHRcdFx0XHQmJiBpdGVtLnZpZXdNb2RlbC5tb2RpZmllZFVyaT8udG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UubW9kaWZpZWQ/LnRvU3RyaW5nKClcblx0XHQpO1xuXHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ1Jlc291cmNlIG5vdCBmb3VuZCBpbiBkaWZmIGVkaXRvcicpO1xuXHRcdH1cblx0XHRjb25zdCB2aWV3SXRlbSA9IHZpZXdJdGVtc1tpbmRleF07XG5cdFx0dGhpcy5fdmlld01vZGVsLmdldCgpIS5hY3RpdmVEaWZmSXRlbS5zZXRDYWNoZSh2aWV3SXRlbS52aWV3TW9kZWwsIHVuZGVmaW5lZCk7XG5cblx0XHRsZXQgc2Nyb2xsVG9wID0gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGluZGV4OyBpKyspIHtcblx0XHRcdHNjcm9sbFRvcCArPSB2aWV3SXRlbXNbaV0uY29udGVudEhlaWdodC5nZXQoKSArIHRoaXMuX3NwYWNlQmV0d2VlblB4O1xuXHRcdH1cblx0XHR0aGlzLl9zY3JvbGxhYmxlRWxlbWVudC5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcCB9KTtcblxuXHRcdGNvbnN0IGRpZmZFZGl0b3IgPSB2aWV3SXRlbS50ZW1wbGF0ZS5nZXQoKT8uZWRpdG9yO1xuXHRcdGNvbnN0IGVkaXRvciA9ICdvcmlnaW5hbCcgaW4gcmVzb3VyY2UgPyBkaWZmRWRpdG9yPy5nZXRPcmlnaW5hbEVkaXRvcigpIDogZGlmZkVkaXRvcj8uZ2V0TW9kaWZpZWRFZGl0b3IoKTtcblx0XHRpZiAoZWRpdG9yICYmIG9wdGlvbnM/LnJhbmdlKSB7XG5cdFx0XHRlZGl0b3IucmV2ZWFsUmFuZ2VJbkNlbnRlcihvcHRpb25zLnJhbmdlKTtcblx0XHRcdGhpZ2hsaWdodFJhbmdlKGVkaXRvciwgb3B0aW9ucy5yYW5nZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldFZpZXdTdGF0ZSgpOiBJTXVsdGlEaWZmRWRpdG9yVmlld1N0YXRlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2Nyb2xsU3RhdGU6IHtcblx0XHRcdFx0dG9wOiB0aGlzLnNjcm9sbFRvcC5nZXQoKSxcblx0XHRcdFx0bGVmdDogdGhpcy5zY3JvbGxMZWZ0LmdldCgpLFxuXHRcdFx0fSxcblx0XHRcdGRvY1N0YXRlczogT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMuX3ZpZXdJdGVtcy5nZXQoKS5tYXAoaSA9PiBbaS5nZXRLZXkoKSwgaS5nZXRWaWV3U3RhdGUoKV0pKSxcblx0XHRcdGFjdGl2ZURpZmZJdGVtS2V5OiB0aGlzLl92aWV3TW9kZWwuZ2V0KCk/LmFjdGl2ZURpZmZJdGVtLmdldCgpPy5nZXRLZXkoKSxcblx0XHR9O1xuXHR9XG5cblx0LyoqIFRoaXMgYWNjb3VudHMgZm9yIGRvY3VtZW50cyB0aGF0IGFyZSBub3QgbG9hZGVkIHlldC4gKi9cblx0cHJpdmF0ZSBfbGFzdERvY1N0YXRlczogSU11bHRpRGlmZkVkaXRvclZpZXdTdGF0ZVsnZG9jU3RhdGVzJ107XG5cblx0LyoqXG5cdCAqIFRoZSBhY3RpdmUgZGlmZiBpdGVtIHRvIHJlc3RvcmUgb25jZSB0aGUgZG9jdW1lbnRzIGFyZSBsb2FkZWQuIFJlc3RvcmluZyBpdFxuXHQgKiBzdXBwcmVzc2VzIHRoZSBhdXRvbWF0aWMgZmlyc3QtY2hhbmdlIG5hdmlnYXRpb24gKHdoaWNoIHdvdWxkIGV4cGFuZCB0aGVcblx0ICogZmlyc3QgZmlsZSBhbmQgcmVzZXQgc2Nyb2xsKSwgc28gdGhlIHJlc3RvcmVkIHN0YXRlIHdpbnMuIENvbnN1bWVkIG9uY2UuXG5cdCAqL1xuXHRwcml2YXRlIF9sYXN0QWN0aXZlRGlmZkl0ZW1LZXk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvKiogQSByZXN0b3JlZCBzY3JvbGwgb2Zmc2V0IHdhaXRpbmcgZm9yIHRoZSBzY3JvbGxhYmxlIGRpbWVuc2lvbnMgdG8gYmUga25vd24uICovXG5cdHByaXZhdGUgX3BlbmRpbmdTY3JvbGxTdGF0ZTogeyB0b3A/OiBudW1iZXI7IGxlZnQ/OiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblxuXHRwdWJsaWMgc2V0Vmlld1N0YXRlKHZpZXdTdGF0ZTogSU11bHRpRGlmZkVkaXRvclZpZXdTdGF0ZSwgdHg/OiBJVHJhbnNhY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLnNldFNjcm9sbFN0YXRlKHZpZXdTdGF0ZS5zY3JvbGxTdGF0ZSk7XG5cblx0XHR0aGlzLl9sYXN0RG9jU3RhdGVzID0gdmlld1N0YXRlLmRvY1N0YXRlcztcblx0XHR0aGlzLl9sYXN0QWN0aXZlRGlmZkl0ZW1LZXkgPSB2aWV3U3RhdGUuYWN0aXZlRGlmZkl0ZW1LZXk7XG5cblx0XHRjb25zdCBhcHBseURvY1N0YXRlcyA9ICh0eDogSVRyYW5zYWN0aW9uKSA9PiB7XG5cdFx0XHRpZiAodmlld1N0YXRlLmRvY1N0YXRlcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGkgb2YgdGhpcy5fdmlld0l0ZW1zLmdldCgpKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdGUgPSB2aWV3U3RhdGUuZG9jU3RhdGVzW2kuZ2V0S2V5KCldO1xuXHRcdFx0XHRcdGlmIChzdGF0ZSkge1xuXHRcdFx0XHRcdFx0aS5zZXRWaWV3U3RhdGUoc3RhdGUsIHR4KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdGlmICh0eCkge1xuXHRcdFx0YXBwbHlEb2NTdGF0ZXModHgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0cmFuc2FjdGlvbihhcHBseURvY1N0YXRlcyk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIGRvY3VtZW50cyBhcmUgYWxyZWFkeSBsb2FkZWQsIHJlc3RvcmUgdGhlIGFjdGl2ZSBpdGVtIG5vdyAodGhpc1xuXHRcdC8vIG92ZXJyaWRlcyB0aGUgZmlyc3QtY2hhbmdlIHNlbGVjdGlvbiB0aGUgaW5pdCBhdXRvcnVuIG1heSBoYXZlIG1hZGUpO1xuXHRcdC8vIG90aGVyd2lzZSB0aGUgaW5pdCBhdXRvcnVuIHJlc3RvcmVzIGl0IG9uY2UgbG9hZGluZyBjb21wbGV0ZXMuXG5cdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5fdmlld01vZGVsLmdldCgpO1xuXHRcdGlmICh2aWV3TW9kZWwpIHtcblx0XHRcdHRoaXMuX3Jlc3RvcmVQZW5kaW5nQWN0aXZlRGlmZkl0ZW0odmlld01vZGVsLCB2aWV3TW9kZWwuaXRlbXMuZ2V0KCkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXN0b3JlcyB0aGUgcGVyc2lzdGVkIGFjdGl2ZSBkaWZmIGl0ZW0gKGlmIGFueSkgb250byB0aGUgdmlldyBtb2RlbCwgc28gdGhlXG5cdCAqIGF1dG9tYXRpYyBmaXJzdC1jaGFuZ2UgbmF2aWdhdGlvbiBpcyBza2lwcGVkLiBPbiBhbiBleHBsaWNpdCAobm9uLXByZXNlcnZlLWZvY3VzKVxuXHQgKiBvcGVuIGl0IGFsc28gbW92ZXMgZm9jdXMgaW50byB0aGUgcmVzdG9yZWQgaXRlbSdzIGVkaXRvciwgbWlycm9yaW5nIHRoZVxuXHQgKiBmaXJzdC1jaGFuZ2UgbmF2aWdhdGlvbiBpdCByZXBsYWNlcy4gUmV0dXJucyB3aGV0aGVyIGl0IHdhcyBhcHBsaWVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzdG9yZVBlbmRpbmdBY3RpdmVEaWZmSXRlbSh2aWV3TW9kZWw6IE11bHRpRGlmZkVkaXRvclZpZXdNb2RlbCwgaXRlbXM6IHJlYWRvbmx5IERvY3VtZW50RGlmZkl0ZW1WaWV3TW9kZWxbXSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX2xhc3RBY3RpdmVEaWZmSXRlbUtleTtcblx0XHRpZiAoa2V5ID09PSB1bmRlZmluZWQgfHwgaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3RBY3RpdmVEaWZmSXRlbUtleSA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCB0YXJnZXQgPSBpdGVtcy5maW5kKGkgPT4gaS5nZXRLZXkoKSA9PT0ga2V5KTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR2aWV3TW9kZWwuYWN0aXZlRGlmZkl0ZW0uc2V0Q2FjaGUodGFyZ2V0LCB1bmRlZmluZWQpO1xuXG5cdFx0aWYgKCF0aGlzLl9wcmVzZXJ2ZUZvY3VzT25Mb2FkKSB7XG5cdFx0XHR0aGlzLl92aWV3SXRlbXNJbmZvLmdldCgpLmdldEl0ZW0odGFyZ2V0KS50ZW1wbGF0ZS5nZXQoKT8uZWRpdG9yLmZvY3VzKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIGZpbmREb2N1bWVudERpZmZJdGVtKHJlc291cmNlOiBVUkkpOiBJRG9jdW1lbnREaWZmSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMuX3ZpZXdJdGVtcy5nZXQoKS5maW5kKHYgPT5cblx0XHRcdHYudmlld01vZGVsLmRpZmZFZGl0b3JWaWV3TW9kZWwubW9kZWwubW9kaWZpZWQudXJpLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKClcblx0XHRcdHx8IHYudmlld01vZGVsLmRpZmZFZGl0b3JWaWV3TW9kZWwubW9kZWwub3JpZ2luYWwudXJpLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKClcblx0XHQpO1xuXHRcdHJldHVybiBpdGVtPy52aWV3TW9kZWwuZG9jdW1lbnREaWZmSXRlbTtcblx0fVxuXG5cdHB1YmxpYyB0cnlHZXRDb2RlRWRpdG9yKHJlc291cmNlOiBVUkkpOiB7IGRpZmZFZGl0b3I6IElEaWZmRWRpdG9yOyBlZGl0b3I6IElDb2RlRWRpdG9yIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl92aWV3SXRlbXMuZ2V0KCkuZmluZCh2ID0+XG5cdFx0XHR2LnZpZXdNb2RlbC5kaWZmRWRpdG9yVmlld01vZGVsLm1vZGVsLm1vZGlmaWVkLnVyaS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpXG5cdFx0XHR8fCB2LnZpZXdNb2RlbC5kaWZmRWRpdG9yVmlld01vZGVsLm1vZGVsLm9yaWdpbmFsLnVyaS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpXG5cdFx0KTtcblx0XHRjb25zdCBlZGl0b3IgPSBpdGVtPy50ZW1wbGF0ZS5nZXQoKT8uZWRpdG9yO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChpdGVtLnZpZXdNb2RlbC5kaWZmRWRpdG9yVmlld01vZGVsLm1vZGVsLm1vZGlmaWVkLnVyaS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm4geyBkaWZmRWRpdG9yOiBlZGl0b3IsIGVkaXRvcjogZWRpdG9yLmdldE1vZGlmaWVkRWRpdG9yKCkgfTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHsgZGlmZkVkaXRvcjogZWRpdG9yLCBlZGl0b3I6IGVkaXRvci5nZXRPcmlnaW5hbEVkaXRvcigpIH07XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdvVG9OZXh0Q2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMuX25hdmlnYXRlVG9DaGFuZ2UoJ25leHQnKTtcblx0fVxuXG5cdHB1YmxpYyBnb1RvUHJldmlvdXNDaGFuZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fbmF2aWdhdGVUb0NoYW5nZSgncHJldmlvdXMnKTtcblx0fVxuXG5cdHByaXZhdGUgX25hdmlnYXRlVG9DaGFuZ2UoZGlyZWN0aW9uOiAnbmV4dCcgfCAncHJldmlvdXMnLCBmb2N1c0VkaXRvcjogYm9vbGVhbiA9IHRydWUpOiB2b2lkIHtcblx0XHRjb25zdCB2aWV3SXRlbXMgPSB0aGlzLl92aWV3SXRlbXMuZ2V0KCk7XG5cdFx0aWYgKHZpZXdJdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVWaWV3TW9kZWwgPSB0aGlzLl92aWV3TW9kZWwuZ2V0KCk/LmFjdGl2ZURpZmZJdGVtLmdldCgpO1xuXHRcdGNvbnN0IGN1cnJlbnRJbmRleCA9IGFjdGl2ZVZpZXdNb2RlbCA/IHZpZXdJdGVtcy5maW5kSW5kZXgodiA9PiB2LnZpZXdNb2RlbCA9PT0gYWN0aXZlVmlld01vZGVsKSA6IC0xO1xuXG5cdFx0Ly8gU3RhcnQgd2l0aCBmaXJzdCBmaWxlIGlmIG5vIGFjdGl2ZSBpdGVtXG5cdFx0aWYgKGN1cnJlbnRJbmRleCA9PT0gLTEpIHtcblx0XHRcdHRoaXMuX2dvVG9GaWxlKDAsICdmaXJzdCcsIGZvY3VzRWRpdG9yKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUcnkgY3VycmVudCBmaWxlIGZpcnN0IC0gZXhwYW5kIGlmIGNvbGxhcHNlZFxuXHRcdGNvbnN0IGN1cnJlbnRJdGVtID0gdmlld0l0ZW1zW2N1cnJlbnRJbmRleF07XG5cdFx0aWYgKGN1cnJlbnRJdGVtLnZpZXdNb2RlbC5jb2xsYXBzZWQuZ2V0KCkpIHtcblx0XHRcdGN1cnJlbnRJdGVtLnZpZXdNb2RlbC5jb2xsYXBzZWQuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvciA9IGN1cnJlbnRJdGVtLnRlbXBsYXRlLmdldCgpPy5lZGl0b3I7XG5cdFx0aWYgKGVkaXRvcj8uZ2V0RGlmZkNvbXB1dGF0aW9uUmVzdWx0KCk/LmNoYW5nZXMyPy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHBvcyA9IGVkaXRvci5nZXRNb2RpZmllZEVkaXRvcigpLmdldFBvc2l0aW9uKCk/LmxpbmVOdW1iZXIgfHwgMTtcblx0XHRcdGNvbnN0IGNoYW5nZXMgPSBlZGl0b3IuZ2V0RGlmZkNvbXB1dGF0aW9uUmVzdWx0KCkhLmNoYW5nZXMyITtcblx0XHRcdGNvbnN0IGhhc05leHQgPSBkaXJlY3Rpb24gPT09ICduZXh0JyA/IGNoYW5nZXMuc29tZShjID0+IGMubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyID4gcG9zKSA6IGNoYW5nZXMuc29tZShjID0+IGMubW9kaWZpZWQuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSA8PSBwb3MpO1xuXG5cdFx0XHRpZiAoaGFzTmV4dCkge1xuXHRcdFx0XHRlZGl0b3IuZ29Ub0RpZmYoZGlyZWN0aW9uKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE1vdmUgdG8gbmV4dC9wcmV2aW91cyBmaWxlXG5cdFx0Y29uc3QgbmV4dEluZGV4ID0gKGN1cnJlbnRJbmRleCArIChkaXJlY3Rpb24gPT09ICduZXh0JyA/IDEgOiAtMSkgKyB2aWV3SXRlbXMubGVuZ3RoKSAlIHZpZXdJdGVtcy5sZW5ndGg7XG5cdFx0dGhpcy5fZ29Ub0ZpbGUobmV4dEluZGV4LCBkaXJlY3Rpb24gPT09ICduZXh0JyA/ICdmaXJzdCcgOiAnbGFzdCcsIGZvY3VzRWRpdG9yKTtcblx0fVxuXG5cdHByaXZhdGUgX2dvVG9GaWxlKGluZGV4OiBudW1iZXIsIHBvc2l0aW9uOiAnZmlyc3QnIHwgJ2xhc3QnLCBmb2N1c0VkaXRvcjogYm9vbGVhbiA9IHRydWUpOiB2b2lkIHtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5fdmlld0l0ZW1zLmdldCgpW2luZGV4XTtcblx0XHRpZiAoaXRlbS52aWV3TW9kZWwuY29sbGFwc2VkLmdldCgpKSB7XG5cdFx0XHRpdGVtLnZpZXdNb2RlbC5jb2xsYXBzZWQuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdHRoaXMucmV2ZWFsKHsgb3JpZ2luYWw6IGl0ZW0udmlld01vZGVsLm9yaWdpbmFsVXJpLCBtb2RpZmllZDogaXRlbS52aWV3TW9kZWwubW9kaWZpZWRVcmkgfSk7XG5cblx0XHRjb25zdCBlZGl0b3IgPSBpdGVtLnRlbXBsYXRlLmdldCgpPy5lZGl0b3I7XG5cdFx0aWYgKGVkaXRvcj8uZ2V0RGlmZkNvbXB1dGF0aW9uUmVzdWx0KCk/LmNoYW5nZXMyPy5sZW5ndGgpIHtcblx0XHRcdGlmIChwb3NpdGlvbiA9PT0gJ2ZpcnN0Jykge1xuXHRcdFx0XHRlZGl0b3IucmV2ZWFsRmlyc3REaWZmKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBsYXN0Q2hhbmdlID0gZWRpdG9yLmdldERpZmZDb21wdXRhdGlvblJlc3VsdCgpIS5jaGFuZ2VzMiEuYXQoLTEpITtcblx0XHRcdFx0Y29uc3QgbW9kaWZpZWRFZGl0b3IgPSBlZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKTtcblx0XHRcdFx0bW9kaWZpZWRFZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiBsYXN0Q2hhbmdlLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlciwgY29sdW1uOiAxIH0pO1xuXHRcdFx0XHRtb2RpZmllZEVkaXRvci5yZXZlYWxMaW5lSW5DZW50ZXIobGFzdENoYW5nZS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoZm9jdXNFZGl0b3IpIHtcblx0XHRcdGVkaXRvcj8uZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcihyZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQpIHtcblx0XHRjb25zdCBzY3JvbGxUb3AgPSB0aGlzLnNjcm9sbFRvcC5yZWFkKHJlYWRlcik7XG5cdFx0bGV0IGNvbnRlbnRTY3JvbGxPZmZzZXRUb1Njcm9sbE9mZnNldCA9IDA7XG5cdFx0bGV0IGl0ZW1IZWlnaHRTdW1CZWZvcmUgPSAwO1xuXHRcdGxldCBpdGVtQ29udGVudEhlaWdodFN1bUJlZm9yZSA9IDA7XG5cdFx0Y29uc3Qgdmlld1BvcnRIZWlnaHQgPSB0aGlzLl9zaXplT2JzZXJ2ZXIuaGVpZ2h0LnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBjb250ZW50Vmlld1BvcnQgPSBPZmZzZXRSYW5nZS5vZlN0YXJ0QW5kTGVuZ3RoKHNjcm9sbFRvcCwgdmlld1BvcnRIZWlnaHQpO1xuXG5cdFx0Y29uc3Qgd2lkdGggPSB0aGlzLl9zaXplT2JzZXJ2ZXIud2lkdGgucmVhZChyZWFkZXIpO1xuXG5cdFx0Zm9yIChjb25zdCB2IG9mIHRoaXMuX3ZpZXdJdGVtcy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdGNvbnN0IGl0ZW1Db250ZW50SGVpZ2h0ID0gdi5jb250ZW50SGVpZ2h0LnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGl0ZW1IZWlnaHQgPSBNYXRoLm1pbihpdGVtQ29udGVudEhlaWdodCwgdmlld1BvcnRIZWlnaHQpO1xuXHRcdFx0Y29uc3QgaXRlbVJhbmdlID0gT2Zmc2V0UmFuZ2Uub2ZTdGFydEFuZExlbmd0aChpdGVtSGVpZ2h0U3VtQmVmb3JlLCBpdGVtSGVpZ2h0KTtcblx0XHRcdGNvbnN0IGl0ZW1Db250ZW50UmFuZ2UgPSBPZmZzZXRSYW5nZS5vZlN0YXJ0QW5kTGVuZ3RoKGl0ZW1Db250ZW50SGVpZ2h0U3VtQmVmb3JlLCBpdGVtQ29udGVudEhlaWdodCk7XG5cblx0XHRcdGlmIChpdGVtQ29udGVudFJhbmdlLmlzQmVmb3JlKGNvbnRlbnRWaWV3UG9ydCkpIHtcblx0XHRcdFx0Y29udGVudFNjcm9sbE9mZnNldFRvU2Nyb2xsT2Zmc2V0IC09IGl0ZW1Db250ZW50SGVpZ2h0IC0gaXRlbUhlaWdodDtcblx0XHRcdFx0di5oaWRlKCk7XG5cdFx0XHR9IGVsc2UgaWYgKGl0ZW1Db250ZW50UmFuZ2UuaXNBZnRlcihjb250ZW50Vmlld1BvcnQpKSB7XG5cdFx0XHRcdHYuaGlkZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3Qgc2Nyb2xsID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oY29udGVudFZpZXdQb3J0LnN0YXJ0IC0gaXRlbUNvbnRlbnRSYW5nZS5zdGFydCwgaXRlbUNvbnRlbnRIZWlnaHQgLSBpdGVtSGVpZ2h0KSk7XG5cdFx0XHRcdGNvbnRlbnRTY3JvbGxPZmZzZXRUb1Njcm9sbE9mZnNldCAtPSBzY3JvbGw7XG5cdFx0XHRcdGNvbnN0IHZpZXdQb3J0ID0gT2Zmc2V0UmFuZ2Uub2ZTdGFydEFuZExlbmd0aChzY3JvbGxUb3AgKyBjb250ZW50U2Nyb2xsT2Zmc2V0VG9TY3JvbGxPZmZzZXQsIHZpZXdQb3J0SGVpZ2h0KTtcblx0XHRcdFx0di5yZW5kZXIoaXRlbVJhbmdlLCBzY3JvbGwsIHdpZHRoLCB2aWV3UG9ydCk7XG5cdFx0XHR9XG5cblx0XHRcdGl0ZW1IZWlnaHRTdW1CZWZvcmUgKz0gaXRlbUhlaWdodCArIHRoaXMuX3NwYWNlQmV0d2VlblB4O1xuXHRcdFx0aXRlbUNvbnRlbnRIZWlnaHRTdW1CZWZvcmUgKz0gaXRlbUNvbnRlbnRIZWlnaHQgKyB0aGlzLl9zcGFjZUJldHdlZW5QeDtcblx0XHR9XG5cblx0XHR0aGlzLl9zY3JvbGxhYmxlRWxlbWVudHMuY29udGVudC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlWSgkey0oc2Nyb2xsVG9wICsgY29udGVudFNjcm9sbE9mZnNldFRvU2Nyb2xsT2Zmc2V0KX1weClgO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGhpZ2hsaWdodFJhbmdlKHRhcmdldEVkaXRvcjogSUNvZGVFZGl0b3IsIHJhbmdlOiBJUmFuZ2UpIHtcblx0Y29uc3QgbW9kZWxOb3cgPSB0YXJnZXRFZGl0b3IuZ2V0TW9kZWwoKTtcblx0Y29uc3QgZGVjb3JhdGlvbnMgPSB0YXJnZXRFZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKFt7IHJhbmdlLCBvcHRpb25zOiB7IGRlc2NyaXB0aW9uOiAnc3ltYm9sLW5hdmlnYXRlLWFjdGlvbi1oaWdobGlnaHQnLCBjbGFzc05hbWU6ICdzeW1ib2xIaWdobGlnaHQnIH0gfV0pO1xuXHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRpZiAodGFyZ2V0RWRpdG9yLmdldE1vZGVsKCkgPT09IG1vZGVsTm93KSB7XG5cdFx0XHRkZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdH1cblx0fSwgMzUwKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTXVsdGlEaWZmRWRpdG9yVmlld1N0YXRlIHtcblx0c2Nyb2xsU3RhdGU6IHsgdG9wOiBudW1iZXI7IGxlZnQ6IG51bWJlciB9O1xuXHRkb2NTdGF0ZXM/OiBSZWNvcmQ8c3RyaW5nLCBJTXVsdGlEaWZmRG9jU3RhdGU+O1xuXHQvKiogS2V5ICh7QGxpbmsgRG9jdW1lbnREaWZmSXRlbVZpZXdNb2RlbC5nZXRLZXl9KSBvZiB0aGUgYWN0aXZlIGRpZmYgaXRlbSwgaWYgYW55LiAqL1xuXHRhY3RpdmVEaWZmSXRlbUtleT86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElNdWx0aURpZmZEb2NTdGF0ZSB7XG5cdGNvbGxhcHNlZDogYm9vbGVhbjtcblx0c2VsZWN0aW9ucz86IElTZWxlY3Rpb25bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTXVsdGlEaWZmRWRpdG9yT3B0aW9ucyBleHRlbmRzIElUZXh0RWRpdG9yT3B0aW9ucyB7XG5cdHZpZXdTdGF0ZT86IElNdWx0aURpZmZFZGl0b3JPcHRpb25zVmlld1N0YXRlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNdWx0aURpZmZFZGl0b3JPcHRpb25zVmlld1N0YXRlIHtcblx0cmV2ZWFsRGF0YT86IHtcblx0XHRyZXNvdXJjZTogSU11bHRpRGlmZlJlc291cmNlSWQ7XG5cdFx0cmFuZ2U/OiBJUmFuZ2U7XG5cdH07XG59XG5cbmV4cG9ydCB0eXBlIElNdWx0aURpZmZSZXNvdXJjZUlkID0geyBvcmlnaW5hbDogVVJJIHwgdW5kZWZpbmVkOyBtb2RpZmllZDogVVJJIHwgdW5kZWZpbmVkIH07XG5cbmNsYXNzIFZpcnR1YWxpemVkVmlld0l0ZW0gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfdGVtcGxhdGVSZWYgPSB0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlT2JzZXJ2YWJsZVZhbHVlPElSZWZlcmVuY2U8RGlmZkVkaXRvckl0ZW1UZW1wbGF0ZT4gfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCkpO1xuXG5cdHB1YmxpYyByZWFkb25seSBjb250ZW50SGVpZ2h0ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT5cblx0XHR0aGlzLl90ZW1wbGF0ZVJlZi5yZWFkKHJlYWRlcik/Lm9iamVjdC5jb250ZW50SGVpZ2h0Py5yZWFkKHJlYWRlcikgPz8gdGhpcy52aWV3TW9kZWwubGFzdFRlbXBsYXRlRGF0YS5yZWFkKHJlYWRlcikuY29udGVudEhlaWdodFxuXHQpO1xuXG5cdHB1YmxpYyByZWFkb25seSBtYXhTY3JvbGwgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLl90ZW1wbGF0ZVJlZi5yZWFkKHJlYWRlcik/Lm9iamVjdC5tYXhTY3JvbGwucmVhZChyZWFkZXIpID8/IHsgbWF4U2Nyb2xsOiAwLCBzY3JvbGxXaWR0aDogMCB9KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgdGVtcGxhdGUgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLl90ZW1wbGF0ZVJlZi5yZWFkKHJlYWRlcik/Lm9iamVjdCk7XG5cdHByaXZhdGUgX2lzSGlkZGVuID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0ZvY3VzZWQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLnRlbXBsYXRlLnJlYWQocmVhZGVyKT8uaXNGb2N1c2VkLnJlYWQocmVhZGVyKSA/PyBmYWxzZSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHZpZXdNb2RlbDogRG9jdW1lbnREaWZmSXRlbVZpZXdNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vYmplY3RQb29sOiBPYmplY3RQb29sPFRlbXBsYXRlRGF0YSwgRGlmZkVkaXRvckl0ZW1UZW1wbGF0ZT4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2Nyb2xsTGVmdDogSU9ic2VydmFibGU8bnVtYmVyPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kZWx0YVNjcm9sbFZlcnRpY2FsOiAoZGVsdGE6IG51bWJlcikgPT4gdm9pZCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMudmlld01vZGVsLnNldElzRm9jdXNlZCh0aGlzLl9pc0ZvY3VzZWQsIHVuZGVmaW5lZCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKChyZWFkZXIpID0+IHtcblx0XHRcdGNvbnN0IHNjcm9sbExlZnQgPSB0aGlzLl9zY3JvbGxMZWZ0LnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3RlbXBsYXRlUmVmLnJlYWQocmVhZGVyKT8ub2JqZWN0LnNldFNjcm9sbExlZnQoc2Nyb2xsTGVmdCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcmVmID0gdGhpcy5fdGVtcGxhdGVSZWYucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFyZWYpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBpc0hpZGRlbiA9IHRoaXMuX2lzSGlkZGVuLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghaXNIaWRkZW4pIHsgcmV0dXJuOyB9XG5cblx0XHRcdGNvbnN0IGlzRm9jdXNlZCA9IHJlZi5vYmplY3QuaXNGb2N1c2VkLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChpc0ZvY3VzZWQpIHsgcmV0dXJuOyB9XG5cblx0XHRcdHRoaXMuX2NsZWFyKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgVmlydHVhbFZpZXdJdGVtKCR7dGhpcy52aWV3TW9kZWwuZG9jdW1lbnREaWZmSXRlbS5tb2RpZmllZD8udXJpLnRvU3RyaW5nKCl9KWA7XG5cdH1cblxuXHRwdWJsaWMgZ2V0S2V5KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMudmlld01vZGVsLmdldEtleSgpO1xuXHR9XG5cblx0cHVibGljIGdldFZpZXdTdGF0ZSgpOiBJTXVsdGlEaWZmRG9jU3RhdGUge1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVRlbXBsYXRlRGF0YSh0eCk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbGxhcHNlZDogdGhpcy52aWV3TW9kZWwuY29sbGFwc2VkLmdldCgpLFxuXHRcdFx0c2VsZWN0aW9uczogdGhpcy52aWV3TW9kZWwubGFzdFRlbXBsYXRlRGF0YS5nZXQoKS5zZWxlY3Rpb25zLFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgc2V0Vmlld1N0YXRlKHZpZXdTdGF0ZTogSU11bHRpRGlmZkRvY1N0YXRlLCB0eDogSVRyYW5zYWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3TW9kZWwuY29sbGFwc2VkLnNldCh2aWV3U3RhdGUuY29sbGFwc2VkLCB0eCk7XG5cblx0XHR0aGlzLl91cGRhdGVUZW1wbGF0ZURhdGEodHgpO1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLnZpZXdNb2RlbC5sYXN0VGVtcGxhdGVEYXRhLmdldCgpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB2aWV3U3RhdGUuc2VsZWN0aW9ucz8ubWFwKFNlbGVjdGlvbi5saWZ0U2VsZWN0aW9uKTtcblx0XHR0aGlzLnZpZXdNb2RlbC5sYXN0VGVtcGxhdGVEYXRhLnNldCh7XG5cdFx0XHQuLi5kYXRhLFxuXHRcdFx0c2VsZWN0aW9ucyxcblx0XHR9LCB0eCk7XG5cdFx0Y29uc3QgcmVmID0gdGhpcy5fdGVtcGxhdGVSZWYuZ2V0KCk7XG5cdFx0aWYgKHJlZikge1xuXHRcdFx0aWYgKHNlbGVjdGlvbnMpIHtcblx0XHRcdFx0cmVmLm9iamVjdC5lZGl0b3Iuc2V0U2VsZWN0aW9ucyhzZWxlY3Rpb25zKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVUZW1wbGF0ZURhdGEodHg6IElUcmFuc2FjdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IHJlZiA9IHRoaXMuX3RlbXBsYXRlUmVmLmdldCgpO1xuXHRcdGlmICghcmVmKSB7IHJldHVybjsgfVxuXHRcdHRoaXMudmlld01vZGVsLmxhc3RUZW1wbGF0ZURhdGEuc2V0KHtcblx0XHRcdGNvbnRlbnRIZWlnaHQ6IHJlZi5vYmplY3QuY29udGVudEhlaWdodC5nZXQoKSxcblx0XHRcdHNlbGVjdGlvbnM6IHJlZi5vYmplY3QuZWRpdG9yLmdldFNlbGVjdGlvbnMoKSA/PyB1bmRlZmluZWQsXG5cdFx0fSwgdHgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVmID0gdGhpcy5fdGVtcGxhdGVSZWYuZ2V0KCk7XG5cdFx0aWYgKCFyZWYpIHsgcmV0dXJuOyB9XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlVGVtcGxhdGVEYXRhKHR4KTtcblx0XHRcdHJlZi5vYmplY3QuaGlkZSgpO1xuXHRcdFx0dGhpcy5fdGVtcGxhdGVSZWYuc2V0KHVuZGVmaW5lZCwgdHgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGhpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNIaWRkZW4uc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyKHZlcnRpY2FsU3BhY2U6IE9mZnNldFJhbmdlLCBvZmZzZXQ6IG51bWJlciwgd2lkdGg6IG51bWJlciwgdmlld1BvcnQ6IE9mZnNldFJhbmdlKTogdm9pZCB7XG5cdFx0dGhpcy5faXNIaWRkZW4uc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXG5cdFx0bGV0IHJlZiA9IHRoaXMuX3RlbXBsYXRlUmVmLmdldCgpO1xuXHRcdGlmICghcmVmKSB7XG5cdFx0XHRyZWYgPSB0aGlzLl9vYmplY3RQb29sLmdldFVudXNlZE9iaihuZXcgVGVtcGxhdGVEYXRhKHRoaXMudmlld01vZGVsLCB0aGlzLl9kZWx0YVNjcm9sbFZlcnRpY2FsKSk7XG5cdFx0XHR0aGlzLl90ZW1wbGF0ZVJlZi5zZXQocmVmLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGhpcy52aWV3TW9kZWwubGFzdFRlbXBsYXRlRGF0YS5nZXQoKS5zZWxlY3Rpb25zO1xuXHRcdFx0aWYgKHNlbGVjdGlvbnMpIHtcblx0XHRcdFx0cmVmLm9iamVjdC5lZGl0b3Iuc2V0U2VsZWN0aW9ucyhzZWxlY3Rpb25zKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmVmLm9iamVjdC5yZW5kZXIodmVydGljYWxTcGFjZSwgd2lkdGgsIG9mZnNldCwgdmlld1BvcnQpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQW9CLFdBQVcsR0FBRyxvQ0FBb0M7QUFDdEUsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxXQUFXLHdCQUF3QjtBQUM1QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLFlBQXdCLG9CQUFvQjtBQUNyRCxTQUE2QyxTQUFTLGtCQUFrQixTQUFTLDJCQUEyQixtQkFBbUIscUJBQXFCLGlCQUFpQixtQkFBbUI7QUFDeEwsU0FBUyxZQUFZLDJCQUEyQjtBQUVo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
