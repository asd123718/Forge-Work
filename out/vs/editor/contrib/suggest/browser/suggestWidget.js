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
import * as dom from "../../../../base/browser/dom.js";
import "../../../../base/browser/ui/codicons/codiconStyles.js";
import { List } from "../../../../base/browser/ui/list/listWidget.js";
import { createCancelablePromise, disposableTimeout, TimeoutTimer } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter, PauseableEmitter } from "../../../../base/common/event.js";
import { DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { clamp } from "../../../../base/common/numbers.js";
import * as strings from "../../../../base/common/strings.js";
import "./media/suggest.css";
import { ContentWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { EmbeddedCodeEditorWidget } from "../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { SuggestWidgetStatus } from "./suggestWidgetStatus.js";
import "../../symbolIcons/browser/symbolIcons.js";
import * as nls from "../../../../nls.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { activeContrastBorder, editorForeground, editorWidgetBackground, editorWidgetBorder, listFocusHighlightForeground, listHighlightForeground, quickInputListFocusBackground, quickInputListFocusForeground, quickInputListFocusIconForeground, registerColor, transparent } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ResizableHTMLElement } from "../../../../base/browser/ui/resizable/resizable.js";
import { Context as SuggestContext, suggestWidgetStatusbarMenu } from "./suggest.js";
import { canExpandCompletionItem, SuggestDetailsOverlay, SuggestDetailsWidget } from "./suggestWidgetDetails.js";
import { ItemRenderer } from "./suggestWidgetRenderer.js";
import { getListStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { status } from "../../../../base/browser/ui/aria/aria.js";
import { CompletionItemKinds } from "../../../common/languages.js";
import { isWindows } from "../../../../base/common/platform.js";
const editorSuggestWidgetBackground = registerColor("editorSuggestWidget.background", editorWidgetBackground, nls.localize("editorSuggestWidgetBackground", "Background color of the suggest widget."));
registerColor("editorSuggestWidget.border", editorWidgetBorder, nls.localize("editorSuggestWidgetBorder", "Border color of the suggest widget."));
const editorSuggestWidgetForeground = registerColor("editorSuggestWidget.foreground", editorForeground, nls.localize("editorSuggestWidgetForeground", "Foreground color of the suggest widget."));
const editorSuggestWidgetSelectedForeground = registerColor("editorSuggestWidget.selectedForeground", { dark: quickInputListFocusForeground, light: quickInputListFocusForeground, hcDark: editorSuggestWidgetBackground, hcLight: editorSuggestWidgetBackground }, nls.localize("editorSuggestWidgetSelectedForeground", "Foreground color of the selected entry in the suggest widget."));
registerColor("editorSuggestWidget.selectedIconForeground", { dark: quickInputListFocusIconForeground, light: quickInputListFocusIconForeground, hcDark: editorSuggestWidgetBackground, hcLight: editorSuggestWidgetBackground }, nls.localize("editorSuggestWidgetSelectedIconForeground", "Icon foreground color of the selected entry in the suggest widget."));
const editorSuggestWidgetSelectedBackground = registerColor("editorSuggestWidget.selectedBackground", { dark: quickInputListFocusBackground, light: quickInputListFocusBackground, hcDark: editorSuggestWidgetForeground, hcLight: editorSuggestWidgetForeground }, nls.localize("editorSuggestWidgetSelectedBackground", "Background color of the selected entry in the suggest widget."));
const editorSuggestWidgetFocusOutline = registerColor("editorSuggestWidget.focusOutline", activeContrastBorder, nls.localize("editorSuggestWidgetFocusOutline", "Outline color of the focused (keyboard-navigated) entry in the suggest widget."));
registerColor("editorSuggestWidget.highlightForeground", listHighlightForeground, nls.localize("editorSuggestWidgetHighlightForeground", "Color of the match highlights in the suggest widget."));
registerColor("editorSuggestWidget.focusHighlightForeground", { dark: listFocusHighlightForeground, light: listFocusHighlightForeground, hcDark: editorSuggestWidgetSelectedForeground, hcLight: editorSuggestWidgetSelectedForeground }, nls.localize("editorSuggestWidgetFocusHighlightForeground", "Color of the match highlights in the suggest widget when an item is focused."));
registerColor("editorSuggestWidgetStatus.foreground", transparent(editorSuggestWidgetForeground, 0.5), nls.localize("editorSuggestWidgetStatusForeground", "Foreground color of the suggest widget status."));
var State = /* @__PURE__ */ ((State2) => {
  State2[State2["Hidden"] = 0] = "Hidden";
  State2[State2["Loading"] = 1] = "Loading";
  State2[State2["Empty"] = 2] = "Empty";
  State2[State2["Open"] = 3] = "Open";
  State2[State2["Frozen"] = 4] = "Frozen";
  State2[State2["Details"] = 5] = "Details";
  State2[State2["onDetailsKeyDown"] = 6] = "onDetailsKeyDown";
  return State2;
})(State || {});
class PersistedWidgetSize {
  constructor(_service, editor) {
    this._service = _service;
    this._key = `suggestWidget.size/${editor.getEditorType()}/${editor instanceof EmbeddedCodeEditorWidget}`;
  }
  restore() {
    const raw = this._service.get(this._key, StorageScope.PROFILE) ?? "";
    try {
      const obj = JSON.parse(raw);
      if (dom.Dimension.is(obj)) {
        return dom.Dimension.lift(obj);
      }
    } catch {
    }
    return void 0;
  }
  store(size) {
    this._service.store(this._key, JSON.stringify(size), StorageScope.PROFILE, StorageTarget.MACHINE);
  }
  reset() {
    this._service.remove(this._key, StorageScope.PROFILE);
  }
}
let SuggestWidget = class {
  constructor(editor, _storageService, _contextKeyService, _themeService, instantiationService) {
    this.editor = editor;
    this._storageService = _storageService;
    this._state = 0 /* Hidden */;
    this._isAuto = false;
    this._loadingTimeout = new MutableDisposable();
    this._pendingLayout = new MutableDisposable();
    this._pendingShowDetails = new MutableDisposable();
    this._ignoreFocusEvents = false;
    this._forceRenderingAbove = false;
    this._explainMode = false;
    this._showTimeout = new TimeoutTimer();
    this._disposables = new DisposableStore();
    this._onDidSelect = new PauseableEmitter();
    this._onDidFocus = new PauseableEmitter();
    this._onDidHide = new Emitter();
    this._onDidShow = new Emitter();
    this.onDidSelect = this._onDidSelect.event;
    this.onDidFocus = this._onDidFocus.event;
    this.onDidHide = this._onDidHide.event;
    this.onDidShow = this._onDidShow.event;
    this._onDetailsKeydown = new Emitter();
    this.onDetailsKeyDown = this._onDetailsKeydown.event;
    this.element = new ResizableHTMLElement();
    this.element.domNode.classList.add("editor-widget", "suggest-widget");
    this._contentWidget = new SuggestContentWidget(this, editor);
    this._persistedSize = new PersistedWidgetSize(_storageService, editor);
    class ResizeState {
      constructor(persistedSize, currentSize, persistHeight = false, persistWidth = false) {
        this.persistedSize = persistedSize;
        this.currentSize = currentSize;
        this.persistHeight = persistHeight;
        this.persistWidth = persistWidth;
      }
    }
    let state;
    this._disposables.add(this.element.onDidWillResize(() => {
      this._contentWidget.lockPreference();
      state = new ResizeState(this._persistedSize.restore(), this.element.size);
    }));
    this._disposables.add(this.element.onDidResize((e) => {
      this._resize(e.dimension.width, e.dimension.height);
      if (state) {
        state.persistHeight = state.persistHeight || !!e.north || !!e.south;
        state.persistWidth = state.persistWidth || !!e.east || !!e.west;
      }
      if (!e.done) {
        return;
      }
      if (state) {
        const { itemHeight, defaultSize } = this.getLayoutInfo();
        const threshold = Math.round(itemHeight / 2);
        let { width, height } = this.element.size;
        if (!state.persistHeight || Math.abs(state.currentSize.height - height) <= threshold) {
          height = state.persistedSize?.height ?? defaultSize.height;
        }
        if (!state.persistWidth || Math.abs(state.currentSize.width - width) <= threshold) {
          width = state.persistedSize?.width ?? defaultSize.width;
        }
        this._persistedSize.store(new dom.Dimension(width, height));
      }
      this._contentWidget.unlockPreference();
      state = void 0;
    }));
    this._messageElement = dom.append(this.element.domNode, dom.$(".message"));
    this._listElement = dom.append(this.element.domNode, dom.$(".tree"));
    const details = this._disposables.add(instantiationService.createInstance(SuggestDetailsWidget, this.editor));
    details.onDidClose(() => this.toggleDetails(), this, this._disposables);
    this._details = new SuggestDetailsOverlay(details, this.editor);
    const applyIconStyle = () => this.element.domNode.classList.toggle("no-icons", !this.editor.getOption(EditorOption.suggest).showIcons);
    applyIconStyle();
    const applyFitWidthStyle = () => this.element.domNode.classList.toggle("fit-width-to-details", this.editor.getOption(EditorOption.suggest).fitWidthToDetails);
    applyFitWidthStyle();
    const renderer = instantiationService.createInstance(ItemRenderer, this.editor);
    this._disposables.add(renderer);
    this._disposables.add(renderer.onDidToggleDetails(() => this.toggleDetails()));
    this._list = new List("SuggestWidget", this._listElement, {
      getHeight: (_element) => this.getLayoutInfo().itemHeight,
      getTemplateId: (_element) => "suggestion"
    }, [renderer], {
      alwaysConsumeMouseWheel: true,
      useShadows: false,
      mouseSupport: false,
      multipleSelectionSupport: false,
      accessibilityProvider: {
        getRole: () => isWindows ? "listitem" : "option",
        getWidgetAriaLabel: () => nls.localize("suggest", "Suggest"),
        getWidgetRole: () => "listbox",
        getAriaLabel: (item) => {
          let label = item.textLabel;
          const kindLabel = CompletionItemKinds.toLabel(item.completion.kind);
          if (typeof item.completion.label !== "string") {
            const { detail: detail2, description } = item.completion.label;
            if (detail2 && description) {
              label = nls.localize("label.full", "{0} {1}, {2}, {3}", label, detail2, description, kindLabel);
            } else if (detail2) {
              label = nls.localize("label.detail", "{0} {1}, {2}", label, detail2, kindLabel);
            } else if (description) {
              label = nls.localize("label.desc", "{0}, {1}, {2}", label, description, kindLabel);
            }
          } else {
            label = nls.localize("label", "{0}, {1}", label, kindLabel);
          }
          if (!item.isResolved || !this._isDetailsVisible()) {
            return label;
          }
          const { documentation, detail } = item.completion;
          const docs = strings.format(
            "{0}{1}",
            detail || "",
            documentation ? typeof documentation === "string" ? documentation : documentation.value : ""
          );
          return nls.localize("ariaCurrenttSuggestionReadDetails", "{0}, docs: {1}", label, docs);
        }
      }
    });
    this._list.style(getListStyles({
      listInactiveFocusBackground: editorSuggestWidgetSelectedBackground,
      listInactiveFocusOutline: editorSuggestWidgetFocusOutline
    }));
    this._status = instantiationService.createInstance(SuggestWidgetStatus, this.element.domNode, suggestWidgetStatusbarMenu, void 0);
    const applyStatusBarStyle = () => this.element.domNode.classList.toggle("with-status-bar", this.editor.getOption(EditorOption.suggest).showStatusBar);
    applyStatusBarStyle();
    this._disposables.add(this._list.onMouseDown((e) => this._onListMouseDownOrTap(e)));
    this._disposables.add(this._list.onTap((e) => this._onListMouseDownOrTap(e)));
    this._disposables.add(this._list.onDidChangeSelection((e) => this._onListSelection(e)));
    this._disposables.add(this._list.onDidChangeFocus((e) => this._onListFocus(e)));
    this._disposables.add(this.editor.onDidChangeCursorSelection(() => this._onCursorSelectionChanged()));
    this._disposables.add(this.editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.suggest)) {
        applyStatusBarStyle();
        applyIconStyle();
        applyFitWidthStyle();
      }
      if (this._completionModel && (e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.suggestFontSize) || e.hasChanged(EditorOption.suggestLineHeight))) {
        this._list.splice(0, this._list.length, this._completionModel.items);
      }
    }));
    this._ctxSuggestWidgetVisible = SuggestContext.Visible.bindTo(_contextKeyService);
    this._ctxSuggestWidgetDetailsVisible = SuggestContext.DetailsVisible.bindTo(_contextKeyService);
    this._ctxSuggestWidgetMultipleSuggestions = SuggestContext.MultipleSuggestions.bindTo(_contextKeyService);
    this._ctxSuggestWidgetHasFocusedSuggestion = SuggestContext.HasFocusedSuggestion.bindTo(_contextKeyService);
    this._ctxSuggestWidgetDetailsFocused = SuggestContext.DetailsFocused.bindTo(_contextKeyService);
    const detailsFocusTracker = dom.trackFocus(this._details.widget.domNode);
    this._disposables.add(detailsFocusTracker);
    this._disposables.add(detailsFocusTracker.onDidFocus(() => this._ctxSuggestWidgetDetailsFocused.set(true)));
    this._disposables.add(detailsFocusTracker.onDidBlur(() => this._ctxSuggestWidgetDetailsFocused.set(false)));
    this._disposables.add(dom.addStandardDisposableListener(this._details.widget.domNode, "keydown", (e) => {
      this._onDetailsKeydown.fire(e);
    }));
    this._disposables.add(this.editor.onMouseDown((e) => this._onEditorMouseDown(e)));
  }
  dispose() {
    this._details.widget.dispose();
    this._details.dispose();
    this._list.dispose();
    this._status.dispose();
    this._disposables.dispose();
    this._loadingTimeout.dispose();
    this._pendingLayout.dispose();
    this._pendingShowDetails.dispose();
    this._showTimeout.dispose();
    this._contentWidget.dispose();
    this.element.dispose();
    this._onDidSelect.dispose();
    this._onDidFocus.dispose();
    this._onDidHide.dispose();
    this._onDidShow.dispose();
    this._onDetailsKeydown.dispose();
  }
  _onEditorMouseDown(mouseEvent) {
    if (this._details.widget.domNode.contains(mouseEvent.target.element)) {
      this._details.widget.domNode.focus();
    } else {
      if (this.element.domNode.contains(mouseEvent.target.element)) {
        this.editor.focus();
      }
    }
  }
  _onCursorSelectionChanged() {
    if (this._state !== 0 /* Hidden */) {
      this._contentWidget.layout();
    }
  }
  _onListMouseDownOrTap(e) {
    if (typeof e.element === "undefined" || typeof e.index === "undefined") {
      return;
    }
    e.browserEvent.preventDefault();
    e.browserEvent.stopPropagation();
    this._select(e.element, e.index);
  }
  _onListSelection(e) {
    if (e.elements.length) {
      this._select(e.elements[0], e.indexes[0]);
    }
  }
  _select(item, index) {
    const completionModel = this._completionModel;
    if (completionModel) {
      this._onDidSelect.fire({ item, index, model: completionModel });
      this.editor.focus();
    }
  }
  _onListFocus(e) {
    if (this._ignoreFocusEvents) {
      return;
    }
    if (this._state === 5 /* Details */) {
      this._setState(3 /* Open */);
    }
    if (!e.elements.length) {
      if (this._currentSuggestionDetails) {
        this._currentSuggestionDetails.cancel();
        this._currentSuggestionDetails = void 0;
        this._focusedItem = void 0;
      }
      this.editor.setAriaOptions({ activeDescendant: void 0 });
      this._ctxSuggestWidgetHasFocusedSuggestion.set(false);
      return;
    }
    if (!this._completionModel) {
      return;
    }
    this._ctxSuggestWidgetHasFocusedSuggestion.set(true);
    const item = e.elements[0];
    const index = e.indexes[0];
    if (item !== this._focusedItem) {
      this._currentSuggestionDetails?.cancel();
      this._currentSuggestionDetails = void 0;
      this._focusedItem = item;
      this._list.reveal(index);
      this._currentSuggestionDetails = createCancelablePromise(async (token) => {
        const loading = disposableTimeout(() => {
          if (this._isDetailsVisible()) {
            this._showDetails(true, false);
          }
        }, 250);
        const sub = token.onCancellationRequested(() => loading.dispose());
        try {
          return await item.resolve(token);
        } finally {
          loading.dispose();
          sub.dispose();
        }
      });
      this._currentSuggestionDetails.then(() => {
        if (index >= this._list.length || item !== this._list.element(index)) {
          return;
        }
        this._ignoreFocusEvents = true;
        this._list.splice(index, 1, [item]);
        this._list.setFocus([index]);
        this._ignoreFocusEvents = false;
        if (this._isDetailsVisible()) {
          this._showDetails(false, false);
        } else {
          this.element.domNode.classList.remove("docs-side");
        }
        this.editor.setAriaOptions({ activeDescendant: this._list.getElementID(index) });
      }).catch(onUnexpectedError);
    }
    this._onDidFocus.fire({ item, index, model: this._completionModel });
  }
  _setState(state) {
    if (this._state === state) {
      return;
    }
    this._state = state;
    this.element.domNode.classList.toggle("frozen", state === 4 /* Frozen */);
    this.element.domNode.classList.remove("message");
    switch (state) {
      case 0 /* Hidden */:
        dom.hide(this._messageElement, this._listElement, this._status.element);
        this._details.hide(true);
        this._status.hide();
        this._contentWidget.hide();
        this._ctxSuggestWidgetVisible.reset();
        this._ctxSuggestWidgetMultipleSuggestions.reset();
        this._ctxSuggestWidgetHasFocusedSuggestion.reset();
        this._showTimeout.cancel();
        this.element.domNode.classList.remove("visible");
        this._list.splice(0, this._list.length);
        this._focusedItem = void 0;
        this._cappedHeight = void 0;
        this._explainMode = false;
        break;
      case 1 /* Loading */:
        this.element.domNode.classList.add("message");
        this._messageElement.textContent = SuggestWidget.LOADING_MESSAGE;
        dom.hide(this._listElement, this._status.element);
        dom.show(this._messageElement);
        this._details.hide();
        this._show();
        this._focusedItem = void 0;
        status(SuggestWidget.LOADING_MESSAGE);
        break;
      case 2 /* Empty */:
        this.element.domNode.classList.add("message");
        this._messageElement.textContent = SuggestWidget.NO_SUGGESTIONS_MESSAGE;
        dom.hide(this._listElement, this._status.element);
        dom.show(this._messageElement);
        this._details.hide();
        this._show();
        this._focusedItem = void 0;
        status(SuggestWidget.NO_SUGGESTIONS_MESSAGE);
        break;
      case 3 /* Open */:
        dom.hide(this._messageElement);
        dom.show(this._listElement, this._status.element);
        this._show();
        break;
      case 4 /* Frozen */:
        dom.hide(this._messageElement);
        dom.show(this._listElement, this._status.element);
        this._show();
        break;
      case 5 /* Details */:
        dom.hide(this._messageElement);
        dom.show(this._listElement, this._status.element);
        this._details.show();
        this._show();
        this._details.widget.focus();
        break;
    }
  }
  _show() {
    this._status.show();
    this._contentWidget.show();
    this._layout(this._persistedSize.restore());
    this._ctxSuggestWidgetVisible.set(true);
    this._showTimeout.cancelAndSet(() => {
      this.element.domNode.classList.add("visible");
      this._onDidShow.fire(this);
    }, 100);
  }
  showTriggered(auto, delay) {
    if (this._state !== 0 /* Hidden */) {
      return;
    }
    this._contentWidget.setPosition(this.editor.getPosition());
    this._isAuto = !!auto;
    if (!this._isAuto) {
      this._loadingTimeout.value = disposableTimeout(() => this._setState(1 /* Loading */), delay);
    }
  }
  showSuggestions(completionModel, selectionIndex, isFrozen, isAuto, noFocus) {
    this._contentWidget.setPosition(this.editor.getPosition());
    this._loadingTimeout.clear();
    this._currentSuggestionDetails?.cancel();
    this._currentSuggestionDetails = void 0;
    if (this._completionModel !== completionModel) {
      this._completionModel = completionModel;
    }
    if (isFrozen && this._state !== 2 /* Empty */ && this._state !== 0 /* Hidden */) {
      this._setState(4 /* Frozen */);
      return;
    }
    const visibleCount = this._completionModel.items.length;
    const isEmpty = visibleCount === 0;
    this._ctxSuggestWidgetMultipleSuggestions.set(visibleCount > 1);
    if (isEmpty) {
      this._setState(isAuto ? 0 /* Hidden */ : 2 /* Empty */);
      this._completionModel = void 0;
      return;
    }
    this._focusedItem = void 0;
    this._onDidFocus.pause();
    this._onDidSelect.pause();
    try {
      this._list.splice(0, this._list.length, this._completionModel.items);
      this._setState(isFrozen ? 4 /* Frozen */ : 3 /* Open */);
      this._list.reveal(selectionIndex, 0, selectionIndex === 0 ? 0 : this.getLayoutInfo().itemHeight * 0.33);
      this._list.setFocus(noFocus ? [] : [selectionIndex]);
    } finally {
      this._onDidFocus.resume();
      this._onDidSelect.resume();
    }
    this._pendingLayout.value = dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.element.domNode), () => {
      this._pendingLayout.clear();
      this._layout(this.element.size);
      this._details.widget.domNode.classList.remove("focused");
    });
  }
  focusSelected() {
    if (this._list.length > 0) {
      this._list.setFocus([0]);
    }
  }
  selectNextPage() {
    switch (this._state) {
      case 0 /* Hidden */:
        return false;
      case 5 /* Details */:
        this._details.widget.pageDown();
        return true;
      case 1 /* Loading */:
        return !this._isAuto;
      default:
        this._list.focusNextPage();
        return true;
    }
  }
  selectNext() {
    switch (this._state) {
      case 0 /* Hidden */:
        return false;
      case 1 /* Loading */:
        return !this._isAuto;
      default:
        this._list.focusNext(1, true);
        return true;
    }
  }
  selectLast() {
    switch (this._state) {
      case 0 /* Hidden */:
        return false;
      case 5 /* Details */:
        this._details.widget.scrollBottom();
        return true;
      case 1 /* Loading */:
        return !this._isAuto;
      default:
        this._list.focusLast();
        return true;
    }
  }
  selectPreviousPage() {
    switch (this._state) {
      case 0 /* Hidden */:
        return false;
      case 5 /* Details */:
        this._details.widget.pageUp();
        return true;
      case 1 /* Loading */:
        return !this._isAuto;
      default:
        this._list.focusPreviousPage();
        return true;
    }
  }
  selectPrevious() {
    switch (this._state) {
      case 0 /* Hidden */:
        return false;
      case 1 /* Loading */:
        return !this._isAuto;
      default:
        this._list.focusPrevious(1, true);
        return false;
    }
  }
  selectFirst() {
    switch (this._state) {
      case 0 /* Hidden */:
        return false;
      case 5 /* Details */:
        this._details.widget.scrollTop();
        return true;
      case 1 /* Loading */:
        return !this._isAuto;
      default:
        this._list.focusFirst();
        return true;
    }
  }
  getFocusedItem() {
    if (this._state !== 0 /* Hidden */ && this._state !== 2 /* Empty */ && this._state !== 1 /* Loading */ && this._completionModel && this._list.getFocus().length > 0) {
      return {
        item: this._list.getFocusedElements()[0],
        index: this._list.getFocus()[0],
        model: this._completionModel
      };
    }
    return void 0;
  }
  toggleDetailsFocus() {
    if (this._state === 5 /* Details */) {
      this._list.setFocus(this._list.getFocus());
      this._setState(3 /* Open */);
    } else if (this._state === 3 /* Open */) {
      this._setState(5 /* Details */);
      if (!this._isDetailsVisible()) {
        this.toggleDetails(true);
      } else {
        this._details.widget.focus();
      }
    }
  }
  toggleDetails(focused = false) {
    if (this._isDetailsVisible()) {
      this._pendingShowDetails.clear();
      this._ctxSuggestWidgetDetailsVisible.set(false);
      this._setDetailsVisible(false);
      this._details.hide();
      this.element.domNode.classList.remove("shows-details");
    } else if ((canExpandCompletionItem(this._list.getFocusedElements()[0]) || this._explainMode) && (this._state === 3 /* Open */ || this._state === 5 /* Details */ || this._state === 4 /* Frozen */)) {
      this._ctxSuggestWidgetDetailsVisible.set(true);
      this._setDetailsVisible(true);
      this._showDetails(false, focused);
    }
  }
  _showDetails(loading, focused) {
    this._pendingShowDetails.value = dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.element.domNode), () => {
      this._pendingShowDetails.clear();
      this._details.show();
      let didFocusDetails = false;
      if (loading) {
        this._details.widget.renderLoading();
      } else {
        this._details.widget.renderItem(this._list.getFocusedElements()[0], this._explainMode);
      }
      if (!this._details.widget.isEmpty) {
        this._positionDetails();
        this.element.domNode.classList.add("shows-details");
        if (focused) {
          this._details.widget.focus();
          didFocusDetails = true;
        }
      } else {
        this._details.hide();
      }
      if (!didFocusDetails) {
        this.editor.focus();
      }
    });
  }
  toggleExplainMode() {
    if (this._list.getFocusedElements()[0]) {
      this._explainMode = !this._explainMode;
      if (!this._isDetailsVisible()) {
        this.toggleDetails();
      } else {
        this._showDetails(false, false);
      }
    }
  }
  resetPersistedSize() {
    this._persistedSize.reset();
  }
  hideWidget() {
    this._pendingLayout.clear();
    this._pendingShowDetails.clear();
    this._loadingTimeout.clear();
    this._setState(0 /* Hidden */);
    this._onDidHide.fire(this);
    this.element.clearSashHoverState();
    const dim = this._persistedSize.restore();
    const minPersistedHeight = Math.ceil(this.getLayoutInfo().itemHeight * 4.3);
    if (dim && dim.height < minPersistedHeight) {
      this._persistedSize.store(dim.with(void 0, minPersistedHeight));
    }
  }
  isFrozen() {
    return this._state === 4 /* Frozen */;
  }
  _afterRender(position) {
    if (position === null) {
      if (this._isDetailsVisible()) {
        this._details.hide();
      }
      return;
    }
    if (this._state === 2 /* Empty */ || this._state === 1 /* Loading */) {
      return;
    }
    if (this._isDetailsVisible() && !this._details.widget.isEmpty) {
      this._details.show();
    }
    this._positionDetails();
  }
  _layout(size) {
    if (!this.editor.hasModel()) {
      return;
    }
    if (!this.editor.getDomNode()) {
      return;
    }
    const bodyBox = dom.getClientArea(this.element.domNode.ownerDocument.body);
    const info = this.getLayoutInfo();
    if (!size) {
      size = info.defaultSize;
    }
    let height = size.height;
    let width = size.width;
    this._status.element.style.height = `${info.itemHeight}px`;
    if (this._state === 2 /* Empty */ || this._state === 1 /* Loading */) {
      height = info.itemHeight + info.borderHeight;
      width = info.defaultSize.width / 2;
      this.element.enableSashes(false, false, false, false);
      this.element.minSize = this.element.maxSize = new dom.Dimension(width, height);
      this._contentWidget.setPreference(ContentWidgetPositionPreference.BELOW);
    } else {
      const maxWidth = bodyBox.width - info.borderHeight - 2 * info.horizontalPadding;
      if (width > maxWidth) {
        width = maxWidth;
      }
      let preferredWidth = this._completionModel ? this._completionModel.stats.pLabelLen * info.typicalHalfwidthCharacterWidth : width;
      if (this.editor.getOption(EditorOption.suggest).fitWidthToDetails && this._completionModel && !this._persistedSize.restore()) {
        const cap = Math.min(maxWidth, this.editor.getLayoutInfo().width);
        const fitWidth = Math.min(cap, this._measureContentWidth(info));
        width = Math.max(width, fitWidth);
        preferredWidth = Math.max(preferredWidth, fitWidth);
      }
      const fullHeight = info.statusBarHeight + this._list.contentHeight + info.borderHeight;
      const minHeight = info.itemHeight + info.statusBarHeight;
      const editorBox = dom.getDomNodePagePosition(this.editor.getDomNode());
      const cursorBox = this.editor.getScrolledVisiblePosition(this.editor.getPosition());
      const cursorBottom = editorBox.top + cursorBox.top + cursorBox.height;
      const maxHeightBelow = Math.min(bodyBox.height - cursorBottom - info.verticalPadding, fullHeight);
      const availableSpaceAbove = editorBox.top + cursorBox.top - info.verticalPadding;
      const maxHeightAbove = Math.min(availableSpaceAbove, fullHeight);
      let maxHeight = Math.min(Math.max(maxHeightAbove, maxHeightBelow) + info.borderHeight, fullHeight);
      if (height === this._cappedHeight?.capped) {
        height = this._cappedHeight.wanted;
      }
      if (height < minHeight) {
        height = minHeight;
      }
      if (height > maxHeight) {
        height = maxHeight;
      }
      const forceRenderingAboveRequiredSpace = 150;
      if (height > maxHeightBelow && maxHeightAbove > maxHeightBelow || this._forceRenderingAbove && availableSpaceAbove > forceRenderingAboveRequiredSpace) {
        this._contentWidget.setPreference(ContentWidgetPositionPreference.ABOVE);
        this.element.enableSashes(true, true, false, false);
        maxHeight = maxHeightAbove;
      } else {
        this._contentWidget.setPreference(ContentWidgetPositionPreference.BELOW);
        this.element.enableSashes(false, true, true, false);
        maxHeight = maxHeightBelow;
      }
      this.element.preferredSize = new dom.Dimension(preferredWidth, info.defaultSize.height);
      this.element.maxSize = new dom.Dimension(maxWidth, maxHeight);
      this.element.minSize = new dom.Dimension(220, minHeight);
      this._cappedHeight = height === fullHeight ? { wanted: this._cappedHeight?.wanted ?? size.height, capped: height } : void 0;
    }
    this._resize(width, height);
  }
  _resize(width, height) {
    const { width: maxWidth, height: maxHeight } = this.element.maxSize;
    width = Math.min(maxWidth, width);
    height = Math.min(maxHeight, height);
    const { statusBarHeight } = this.getLayoutInfo();
    this._list.layout(height - statusBarHeight, width);
    this._listElement.style.height = `${height - statusBarHeight}px`;
    this.element.layout(height, width);
    this._contentWidget.layout();
    this._positionDetails();
  }
  _positionDetails() {
    if (this._isDetailsVisible()) {
      this._details.placeAtAnchor(this.element.domNode, this._contentWidget.getPosition()?.preference[0] === ContentWidgetPositionPreference.BELOW);
    }
  }
  /**
   * Measures the pixel width needed to show the widest item's label together with
   * its inline detail text (signature + description), plus the surrounding chrome
   * (icon, inter-column gap, read-more affordance, padding and scrollbar). Cached
   * per completion model.
   */
  _measureContentWidth(info) {
    const model = this._completionModel;
    if (!model) {
      return 0;
    }
    if (this._fitContentWidth?.model === model) {
      return this._fitContentWidth.width;
    }
    if (this._measureContext === void 0) {
      this._measureContext = dom.$("canvas").getContext("2d");
    }
    let maxTextWidth;
    if (this._measureContext) {
      const options = this.editor.getOptions();
      const fontInfo = options.get(EditorOption.fontInfo);
      const fontSize = options.get(EditorOption.suggestFontSize) || fontInfo.fontSize;
      this._measureContext.font = `${fontInfo.fontWeight} ${fontSize}px ${fontInfo.getMassagedFontFamily()}`;
      maxTextWidth = 0;
      for (const item of model.items) {
        const { completion } = item;
        let text = item.textLabel;
        if (typeof completion.label === "string") {
          text += completion.detail ?? "";
        } else {
          text += (completion.label.detail ?? "") + (completion.label.description ?? "");
        }
        maxTextWidth = Math.max(maxTextWidth, this._measureContext.measureText(text).width);
      }
    } else {
      maxTextWidth = model.stats.pLabelLen * info.typicalHalfwidthCharacterWidth;
    }
    const chrome = 2 * info.itemHeight + 2 * info.horizontalPadding + 20;
    const width = maxTextWidth + chrome;
    this._fitContentWidth = { model, width };
    return width;
  }
  getLayoutInfo() {
    const fontInfo = this.editor.getOption(EditorOption.fontInfo);
    const itemHeight = clamp(this.editor.getOption(EditorOption.suggestLineHeight) || fontInfo.lineHeight, 8, 1e3);
    const statusBarHeight = !this.editor.getOption(EditorOption.suggest).showStatusBar || this._state === 2 /* Empty */ || this._state === 1 /* Loading */ ? 0 : itemHeight;
    const borderWidth = this._details.widget.getLayoutInfo().borderWidth;
    const borderHeight = 2 * borderWidth;
    return {
      itemHeight,
      statusBarHeight,
      borderWidth,
      borderHeight,
      typicalHalfwidthCharacterWidth: fontInfo.typicalHalfwidthCharacterWidth,
      verticalPadding: 22,
      horizontalPadding: 14,
      defaultSize: new dom.Dimension(430, statusBarHeight + 12 * itemHeight)
    };
  }
  _isDetailsVisible() {
    return this._storageService.getBoolean("expandSuggestionDocs", StorageScope.PROFILE, false);
  }
  _setDetailsVisible(value) {
    this._storageService.store("expandSuggestionDocs", value, StorageScope.PROFILE, StorageTarget.USER);
  }
  forceRenderingAbove() {
    if (!this._forceRenderingAbove) {
      this._forceRenderingAbove = true;
      this._layout(this._persistedSize.restore());
    }
  }
  stopForceRenderingAbove() {
    this._forceRenderingAbove = false;
  }
};
SuggestWidget.LOADING_MESSAGE = nls.localize("suggestWidget.loading", "Loading...");
SuggestWidget.NO_SUGGESTIONS_MESSAGE = nls.localize("suggestWidget.noSuggestions", "No suggestions.");
SuggestWidget = __decorateClass([
  __decorateParam(1, IStorageService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IThemeService),
  __decorateParam(4, IInstantiationService)
], SuggestWidget);
class SuggestContentWidget {
  constructor(_widget, _editor) {
    this._widget = _widget;
    this._editor = _editor;
    this.allowEditorOverflow = true;
    this.suppressMouseDown = false;
    this._preferenceLocked = false;
    this._added = false;
    this._hidden = false;
  }
  dispose() {
    if (this._added) {
      this._added = false;
      this._editor.removeContentWidget(this);
    }
  }
  getId() {
    return "editor.widget.suggestWidget";
  }
  getDomNode() {
    return this._widget.element.domNode;
  }
  show() {
    this._hidden = false;
    if (!this._added) {
      this._added = true;
      this._editor.addContentWidget(this);
    }
  }
  hide() {
    if (!this._hidden) {
      this._hidden = true;
      this.layout();
    }
  }
  layout() {
    this._editor.layoutContentWidget(this);
  }
  getPosition() {
    if (this._hidden || !this._position || !this._preference) {
      return null;
    }
    return {
      position: this._position,
      preference: [this._preference]
    };
  }
  beforeRender() {
    const { height, width } = this._widget.element.size;
    const { borderWidth, horizontalPadding } = this._widget.getLayoutInfo();
    return new dom.Dimension(width + 2 * borderWidth + horizontalPadding, height + 2 * borderWidth);
  }
  afterRender(position) {
    this._widget._afterRender(position);
  }
  setPreference(preference) {
    if (!this._preferenceLocked) {
      this._preference = preference;
    }
  }
  lockPreference() {
    this._preferenceLocked = true;
  }
  unlockPreference() {
    this._preferenceLocked = false;
  }
  setPosition(position) {
    this._position = position;
  }
}
export {
  SuggestContentWidget,
  SuggestWidget,
  editorSuggestWidgetFocusOutline,
  editorSuggestWidgetForeground,
  editorSuggestWidgetSelectedBackground
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHN1Z2dlc3RcXGJyb3dzZXJcXHN1Z2dlc3RXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvZGljb25zL2NvZGljb25TdHlsZXMuanMnOyAvLyBUaGUgY29kaWNvbiBzeW1ib2wgc3R5bGVzIGFyZSBkZWZpbmVkIGhlcmUgYW5kIG11c3QgYmUgbG9hZGVkXG5pbXBvcnQgeyBJTGlzdEV2ZW50LCBJTGlzdEdlc3R1cmVFdmVudCwgSUxpc3RNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIGRpc3Bvc2FibGVUaW1lb3V0LCBUaW1lb3V0VGltZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCwgUGF1c2VhYmxlRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0ICcuL21lZGlhL3N1Z2dlc3QuY3NzJztcbmltcG9ydCB7IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UsIElDb2RlRWRpdG9yLCBJQ29udGVudFdpZGdldCwgSUNvbnRlbnRXaWRnZXRQb3NpdGlvbiwgSUVkaXRvck1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9lbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFN1Z2dlc3RXaWRnZXRTdGF0dXMgfSBmcm9tICcuL3N1Z2dlc3RXaWRnZXRTdGF0dXMuanMnO1xuaW1wb3J0ICcuLi8uLi9zeW1ib2xJY29ucy9icm93c2VyL3N5bWJvbEljb25zLmpzJzsgLy8gVGhlIGNvZGljb24gc3ltYm9sIGNvbG9ycyBhcmUgZGVmaW5lZCBoZXJlIGFuZCBtdXN0IGJlIGxvYWRlZCB0byBnZXQgY29sb3JzXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyLCBlZGl0b3JGb3JlZ3JvdW5kLCBlZGl0b3JXaWRnZXRCYWNrZ3JvdW5kLCBlZGl0b3JXaWRnZXRCb3JkZXIsIGxpc3RGb2N1c0hpZ2hsaWdodEZvcmVncm91bmQsIGxpc3RIaWdobGlnaHRGb3JlZ3JvdW5kLCBxdWlja0lucHV0TGlzdEZvY3VzQmFja2dyb3VuZCwgcXVpY2tJbnB1dExpc3RGb2N1c0ZvcmVncm91bmQsIHF1aWNrSW5wdXRMaXN0Rm9jdXNJY29uRm9yZWdyb3VuZCwgcmVnaXN0ZXJDb2xvciwgdHJhbnNwYXJlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uTW9kZWwgfSBmcm9tICcuL2NvbXBsZXRpb25Nb2RlbC5qcyc7XG5pbXBvcnQgeyBSZXNpemFibGVIVE1MRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9yZXNpemFibGUvcmVzaXphYmxlLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25JdGVtLCBDb250ZXh0IGFzIFN1Z2dlc3RDb250ZXh0LCBzdWdnZXN0V2lkZ2V0U3RhdHVzYmFyTWVudSB9IGZyb20gJy4vc3VnZ2VzdC5qcyc7XG5pbXBvcnQgeyBjYW5FeHBhbmRDb21wbGV0aW9uSXRlbSwgU3VnZ2VzdERldGFpbHNPdmVybGF5LCBTdWdnZXN0RGV0YWlsc1dpZGdldCB9IGZyb20gJy4vc3VnZ2VzdFdpZGdldERldGFpbHMuanMnO1xuaW1wb3J0IHsgSXRlbVJlbmRlcmVyIH0gZnJvbSAnLi9zdWdnZXN0V2lkZ2V0UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgZ2V0TGlzdFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBzdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25JdGVtS2luZHMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcblxuLyoqXG4gKiBTdWdnZXN0IHdpZGdldCBjb2xvcnNcbiAqL1xuY29uc3QgZWRpdG9yU3VnZ2VzdFdpZGdldEJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JTdWdnZXN0V2lkZ2V0LmJhY2tncm91bmQnLCBlZGl0b3JXaWRnZXRCYWNrZ3JvdW5kLCBubHMubG9jYWxpemUoJ2VkaXRvclN1Z2dlc3RXaWRnZXRCYWNrZ3JvdW5kJywgJ0JhY2tncm91bmQgY29sb3Igb2YgdGhlIHN1Z2dlc3Qgd2lkZ2V0LicpKTtcbnJlZ2lzdGVyQ29sb3IoJ2VkaXRvclN1Z2dlc3RXaWRnZXQuYm9yZGVyJywgZWRpdG9yV2lkZ2V0Qm9yZGVyLCBubHMubG9jYWxpemUoJ2VkaXRvclN1Z2dlc3RXaWRnZXRCb3JkZXInLCAnQm9yZGVyIGNvbG9yIG9mIHRoZSBzdWdnZXN0IHdpZGdldC4nKSk7XG5leHBvcnQgY29uc3QgZWRpdG9yU3VnZ2VzdFdpZGdldEZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JTdWdnZXN0V2lkZ2V0LmZvcmVncm91bmQnLCBlZGl0b3JGb3JlZ3JvdW5kLCBubHMubG9jYWxpemUoJ2VkaXRvclN1Z2dlc3RXaWRnZXRGb3JlZ3JvdW5kJywgJ0ZvcmVncm91bmQgY29sb3Igb2YgdGhlIHN1Z2dlc3Qgd2lkZ2V0LicpKTtcbmNvbnN0IGVkaXRvclN1Z2dlc3RXaWRnZXRTZWxlY3RlZEZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JTdWdnZXN0V2lkZ2V0LnNlbGVjdGVkRm9yZWdyb3VuZCcsIHsgZGFyazogcXVpY2tJbnB1dExpc3RGb2N1c0ZvcmVncm91bmQsIGxpZ2h0OiBxdWlja0lucHV0TGlzdEZvY3VzRm9yZWdyb3VuZCwgaGNEYXJrOiBlZGl0b3JTdWdnZXN0V2lkZ2V0QmFja2dyb3VuZCwgaGNMaWdodDogZWRpdG9yU3VnZ2VzdFdpZGdldEJhY2tncm91bmQgfSwgbmxzLmxvY2FsaXplKCdlZGl0b3JTdWdnZXN0V2lkZ2V0U2VsZWN0ZWRGb3JlZ3JvdW5kJywgJ0ZvcmVncm91bmQgY29sb3Igb2YgdGhlIHNlbGVjdGVkIGVudHJ5IGluIHRoZSBzdWdnZXN0IHdpZGdldC4nKSk7XG5yZWdpc3RlckNvbG9yKCdlZGl0b3JTdWdnZXN0V2lkZ2V0LnNlbGVjdGVkSWNvbkZvcmVncm91bmQnLCB7IGRhcms6IHF1aWNrSW5wdXRMaXN0Rm9jdXNJY29uRm9yZWdyb3VuZCwgbGlnaHQ6IHF1aWNrSW5wdXRMaXN0Rm9jdXNJY29uRm9yZWdyb3VuZCwgaGNEYXJrOiBlZGl0b3JTdWdnZXN0V2lkZ2V0QmFja2dyb3VuZCwgaGNMaWdodDogZWRpdG9yU3VnZ2VzdFdpZGdldEJhY2tncm91bmQgfSwgbmxzLmxvY2FsaXplKCdlZGl0b3JTdWdnZXN0V2lkZ2V0U2VsZWN0ZWRJY29uRm9yZWdyb3VuZCcsICdJY29uIGZvcmVncm91bmQgY29sb3Igb2YgdGhlIHNlbGVjdGVkIGVudHJ5IGluIHRoZSBzdWdnZXN0IHdpZGdldC4nKSk7XG5leHBvcnQgY29uc3QgZWRpdG9yU3VnZ2VzdFdpZGdldFNlbGVjdGVkQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvclN1Z2dlc3RXaWRnZXQuc2VsZWN0ZWRCYWNrZ3JvdW5kJywgeyBkYXJrOiBxdWlja0lucHV0TGlzdEZvY3VzQmFja2dyb3VuZCwgbGlnaHQ6IHF1aWNrSW5wdXRMaXN0Rm9jdXNCYWNrZ3JvdW5kLCBoY0Rhcms6IGVkaXRvclN1Z2dlc3RXaWRnZXRGb3JlZ3JvdW5kLCBoY0xpZ2h0OiBlZGl0b3JTdWdnZXN0V2lkZ2V0Rm9yZWdyb3VuZCB9LCBubHMubG9jYWxpemUoJ2VkaXRvclN1Z2dlc3RXaWRnZXRTZWxlY3RlZEJhY2tncm91bmQnLCAnQmFja2dyb3VuZCBjb2xvciBvZiB0aGUgc2VsZWN0ZWQgZW50cnkgaW4gdGhlIHN1Z2dlc3Qgd2lkZ2V0LicpKTtcbmV4cG9ydCBjb25zdCBlZGl0b3JTdWdnZXN0V2lkZ2V0Rm9jdXNPdXRsaW5lID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yU3VnZ2VzdFdpZGdldC5mb2N1c091dGxpbmUnLCBhY3RpdmVDb250cmFzdEJvcmRlciwgbmxzLmxvY2FsaXplKCdlZGl0b3JTdWdnZXN0V2lkZ2V0Rm9jdXNPdXRsaW5lJywgJ091dGxpbmUgY29sb3Igb2YgdGhlIGZvY3VzZWQgKGtleWJvYXJkLW5hdmlnYXRlZCkgZW50cnkgaW4gdGhlIHN1Z2dlc3Qgd2lkZ2V0LicpKTtcbnJlZ2lzdGVyQ29sb3IoJ2VkaXRvclN1Z2dlc3RXaWRnZXQuaGlnaGxpZ2h0Rm9yZWdyb3VuZCcsIGxpc3RIaWdobGlnaHRGb3JlZ3JvdW5kLCBubHMubG9jYWxpemUoJ2VkaXRvclN1Z2dlc3RXaWRnZXRIaWdobGlnaHRGb3JlZ3JvdW5kJywgJ0NvbG9yIG9mIHRoZSBtYXRjaCBoaWdobGlnaHRzIGluIHRoZSBzdWdnZXN0IHdpZGdldC4nKSk7XG5yZWdpc3RlckNvbG9yKCdlZGl0b3JTdWdnZXN0V2lkZ2V0LmZvY3VzSGlnaGxpZ2h0Rm9yZWdyb3VuZCcsIHsgZGFyazogbGlzdEZvY3VzSGlnaGxpZ2h0Rm9yZWdyb3VuZCwgbGlnaHQ6IGxpc3RGb2N1c0hpZ2hsaWdodEZvcmVncm91bmQsIGhjRGFyazogZWRpdG9yU3VnZ2VzdFdpZGdldFNlbGVjdGVkRm9yZWdyb3VuZCwgaGNMaWdodDogZWRpdG9yU3VnZ2VzdFdpZGdldFNlbGVjdGVkRm9yZWdyb3VuZCB9LCBubHMubG9jYWxpemUoJ2VkaXRvclN1Z2dlc3RXaWRnZXRGb2N1c0hpZ2hsaWdodEZvcmVncm91bmQnLCAnQ29sb3Igb2YgdGhlIG1hdGNoIGhpZ2hsaWdodHMgaW4gdGhlIHN1Z2dlc3Qgd2lkZ2V0IHdoZW4gYW4gaXRlbSBpcyBmb2N1c2VkLicpKTtcbnJlZ2lzdGVyQ29sb3IoJ2VkaXRvclN1Z2dlc3RXaWRnZXRTdGF0dXMuZm9yZWdyb3VuZCcsIHRyYW5zcGFyZW50KGVkaXRvclN1Z2dlc3RXaWRnZXRGb3JlZ3JvdW5kLCAuNSksIG5scy5sb2NhbGl6ZSgnZWRpdG9yU3VnZ2VzdFdpZGdldFN0YXR1c0ZvcmVncm91bmQnLCAnRm9yZWdyb3VuZCBjb2xvciBvZiB0aGUgc3VnZ2VzdCB3aWRnZXQgc3RhdHVzLicpKTtcblxuY29uc3QgZW51bSBTdGF0ZSB7XG5cdEhpZGRlbixcblx0TG9hZGluZyxcblx0RW1wdHksXG5cdE9wZW4sXG5cdEZyb3plbixcblx0RGV0YWlscyxcblx0b25EZXRhaWxzS2V5RG93blxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZWxlY3RlZFN1Z2dlc3Rpb24ge1xuXHRpdGVtOiBDb21wbGV0aW9uSXRlbTtcblx0aW5kZXg6IG51bWJlcjtcblx0bW9kZWw6IENvbXBsZXRpb25Nb2RlbDtcbn1cblxuY2xhc3MgUGVyc2lzdGVkV2lkZ2V0U2l6ZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfa2V5OiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3Jcblx0KSB7XG5cdFx0dGhpcy5fa2V5ID0gYHN1Z2dlc3RXaWRnZXQuc2l6ZS8ke2VkaXRvci5nZXRFZGl0b3JUeXBlKCl9LyR7ZWRpdG9yIGluc3RhbmNlb2YgRW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0fWA7XG5cdH1cblxuXHRyZXN0b3JlKCk6IGRvbS5EaW1lbnNpb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuX3NlcnZpY2UuZ2V0KHRoaXMuX2tleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpID8/ICcnO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBvYmogPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRpZiAoZG9tLkRpbWVuc2lvbi5pcyhvYmopKSB7XG5cdFx0XHRcdHJldHVybiBkb20uRGltZW5zaW9uLmxpZnQob2JqKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIGlnbm9yZVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0c3RvcmUoc2l6ZTogZG9tLkRpbWVuc2lvbikge1xuXHRcdHRoaXMuX3NlcnZpY2Uuc3RvcmUodGhpcy5fa2V5LCBKU09OLnN0cmluZ2lmeShzaXplKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHRyZXNldCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXJ2aWNlLnJlbW92ZSh0aGlzLl9rZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3VnZ2VzdFdpZGdldCBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHN0YXRpYyBMT0FESU5HX01FU1NBR0U6IHN0cmluZyA9IG5scy5sb2NhbGl6ZSgnc3VnZ2VzdFdpZGdldC5sb2FkaW5nJywgXCJMb2FkaW5nLi4uXCIpO1xuXHRwcml2YXRlIHN0YXRpYyBOT19TVUdHRVNUSU9OU19NRVNTQUdFOiBzdHJpbmcgPSBubHMubG9jYWxpemUoJ3N1Z2dlc3RXaWRnZXQubm9TdWdnZXN0aW9ucycsIFwiTm8gc3VnZ2VzdGlvbnMuXCIpO1xuXG5cdHByaXZhdGUgX3N0YXRlOiBTdGF0ZSA9IFN0YXRlLkhpZGRlbjtcblx0cHJpdmF0ZSBfaXNBdXRvOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvYWRpbmdUaW1lb3V0ID0gbmV3IE11dGFibGVEaXNwb3NhYmxlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdMYXlvdXQgPSBuZXcgTXV0YWJsZURpc3Bvc2FibGUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1Nob3dEZXRhaWxzID0gbmV3IE11dGFibGVEaXNwb3NhYmxlKCk7XG5cdHByaXZhdGUgX2N1cnJlbnRTdWdnZXN0aW9uRGV0YWlscz86IENhbmNlbGFibGVQcm9taXNlPHZvaWQ+O1xuXHRwcml2YXRlIF9mb2N1c2VkSXRlbT86IENvbXBsZXRpb25JdGVtO1xuXHRwcml2YXRlIF9pZ25vcmVGb2N1c0V2ZW50czogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9jb21wbGV0aW9uTW9kZWw/OiBDb21wbGV0aW9uTW9kZWw7XG5cdHByaXZhdGUgX2NhcHBlZEhlaWdodD86IHsgd2FudGVkOiBudW1iZXI7IGNhcHBlZDogbnVtYmVyIH07XG5cdHByaXZhdGUgX2ZvcmNlUmVuZGVyaW5nQWJvdmU6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfZXhwbGFpbk1vZGU6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfbWVhc3VyZUNvbnRleHQ/OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQgfCBudWxsO1xuXHRwcml2YXRlIF9maXRDb250ZW50V2lkdGg/OiB7IG1vZGVsOiBDb21wbGV0aW9uTW9kZWw7IHdpZHRoOiBudW1iZXIgfTtcblxuXHRyZWFkb25seSBlbGVtZW50OiBSZXNpemFibGVIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfbWVzc2FnZUVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saXN0RWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpc3Q6IExpc3Q8Q29tcGxldGlvbkl0ZW0+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0dXM6IFN1Z2dlc3RXaWRnZXRTdGF0dXM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RldGFpbHM6IFN1Z2dlc3REZXRhaWxzT3ZlcmxheTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGVudFdpZGdldDogU3VnZ2VzdENvbnRlbnRXaWRnZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlcnNpc3RlZFNpemU6IFBlcnNpc3RlZFdpZGdldFNpemU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY3R4U3VnZ2VzdFdpZGdldFZpc2libGU6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdHhTdWdnZXN0V2lkZ2V0RGV0YWlsc1Zpc2libGU6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdHhTdWdnZXN0V2lkZ2V0TXVsdGlwbGVTdWdnZXN0aW9uczogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N0eFN1Z2dlc3RXaWRnZXRIYXNGb2N1c2VkU3VnZ2VzdGlvbjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N0eFN1Z2dlc3RXaWRnZXREZXRhaWxzRm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2hvd1RpbWVvdXQgPSBuZXcgVGltZW91dFRpbWVyKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZWxlY3QgPSBuZXcgUGF1c2VhYmxlRW1pdHRlcjxJU2VsZWN0ZWRTdWdnZXN0aW9uPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZvY3VzID0gbmV3IFBhdXNlYWJsZUVtaXR0ZXI8SVNlbGVjdGVkU3VnZ2VzdGlvbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRIaWRlID0gbmV3IEVtaXR0ZXI8dGhpcz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTaG93ID0gbmV3IEVtaXR0ZXI8dGhpcz4oKTtcblxuXHRyZWFkb25seSBvbkRpZFNlbGVjdDogRXZlbnQ8SVNlbGVjdGVkU3VnZ2VzdGlvbj4gPSB0aGlzLl9vbkRpZFNlbGVjdC5ldmVudDtcblx0cmVhZG9ubHkgb25EaWRGb2N1czogRXZlbnQ8SVNlbGVjdGVkU3VnZ2VzdGlvbj4gPSB0aGlzLl9vbkRpZEZvY3VzLmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZEhpZGU6IEV2ZW50PHRoaXM+ID0gdGhpcy5fb25EaWRIaWRlLmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZFNob3c6IEV2ZW50PHRoaXM+ID0gdGhpcy5fb25EaWRTaG93LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGV0YWlsc0tleWRvd24gPSBuZXcgRW1pdHRlcjxJS2V5Ym9hcmRFdmVudD4oKTtcblx0cmVhZG9ubHkgb25EZXRhaWxzS2V5RG93bjogRXZlbnQ8SUtleWJvYXJkRXZlbnQ+ID0gdGhpcy5fb25EZXRhaWxzS2V5ZG93bi5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuZWxlbWVudCA9IG5ldyBSZXNpemFibGVIVE1MRWxlbWVudCgpO1xuXHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2VkaXRvci13aWRnZXQnLCAnc3VnZ2VzdC13aWRnZXQnKTtcblxuXHRcdHRoaXMuX2NvbnRlbnRXaWRnZXQgPSBuZXcgU3VnZ2VzdENvbnRlbnRXaWRnZXQodGhpcywgZWRpdG9yKTtcblx0XHR0aGlzLl9wZXJzaXN0ZWRTaXplID0gbmV3IFBlcnNpc3RlZFdpZGdldFNpemUoX3N0b3JhZ2VTZXJ2aWNlLCBlZGl0b3IpO1xuXG5cdFx0Y2xhc3MgUmVzaXplU3RhdGUge1xuXHRcdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRcdHJlYWRvbmx5IHBlcnNpc3RlZFNpemU6IGRvbS5EaW1lbnNpb24gfCB1bmRlZmluZWQsXG5cdFx0XHRcdHJlYWRvbmx5IGN1cnJlbnRTaXplOiBkb20uRGltZW5zaW9uLFxuXHRcdFx0XHRwdWJsaWMgcGVyc2lzdEhlaWdodCA9IGZhbHNlLFxuXHRcdFx0XHRwdWJsaWMgcGVyc2lzdFdpZHRoID0gZmFsc2UsXG5cdFx0XHQpIHsgfVxuXHRcdH1cblxuXHRcdGxldCBzdGF0ZTogUmVzaXplU3RhdGUgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuZWxlbWVudC5vbkRpZFdpbGxSZXNpemUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29udGVudFdpZGdldC5sb2NrUHJlZmVyZW5jZSgpO1xuXHRcdFx0c3RhdGUgPSBuZXcgUmVzaXplU3RhdGUodGhpcy5fcGVyc2lzdGVkU2l6ZS5yZXN0b3JlKCksIHRoaXMuZWxlbWVudC5zaXplKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuZWxlbWVudC5vbkRpZFJlc2l6ZShlID0+IHtcblxuXHRcdFx0dGhpcy5fcmVzaXplKGUuZGltZW5zaW9uLndpZHRoLCBlLmRpbWVuc2lvbi5oZWlnaHQpO1xuXG5cdFx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdFx0c3RhdGUucGVyc2lzdEhlaWdodCA9IHN0YXRlLnBlcnNpc3RIZWlnaHQgfHwgISFlLm5vcnRoIHx8ICEhZS5zb3V0aDtcblx0XHRcdFx0c3RhdGUucGVyc2lzdFdpZHRoID0gc3RhdGUucGVyc2lzdFdpZHRoIHx8ICEhZS5lYXN0IHx8ICEhZS53ZXN0O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWUuZG9uZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzdGF0ZSkge1xuXHRcdFx0XHQvLyBvbmx5IHN0b3JlIHdpZHRoIG9yIGhlaWdodCB2YWx1ZSB0aGF0IGhhdmUgY2hhbmdlZCBhbmQgYWxzb1xuXHRcdFx0XHQvLyBvbmx5IHN0b3JlIGNoYW5nZXMgdGhhdCBhcmUgYWJvdmUgYSBjZXJ0YWluIHRocmVzaG9sZFxuXHRcdFx0XHRjb25zdCB7IGl0ZW1IZWlnaHQsIGRlZmF1bHRTaXplIH0gPSB0aGlzLmdldExheW91dEluZm8oKTtcblx0XHRcdFx0Y29uc3QgdGhyZXNob2xkID0gTWF0aC5yb3VuZChpdGVtSGVpZ2h0IC8gMik7XG5cdFx0XHRcdGxldCB7IHdpZHRoLCBoZWlnaHQgfSA9IHRoaXMuZWxlbWVudC5zaXplO1xuXHRcdFx0XHRpZiAoIXN0YXRlLnBlcnNpc3RIZWlnaHQgfHwgTWF0aC5hYnMoc3RhdGUuY3VycmVudFNpemUuaGVpZ2h0IC0gaGVpZ2h0KSA8PSB0aHJlc2hvbGQpIHtcblx0XHRcdFx0XHRoZWlnaHQgPSBzdGF0ZS5wZXJzaXN0ZWRTaXplPy5oZWlnaHQgPz8gZGVmYXVsdFNpemUuaGVpZ2h0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghc3RhdGUucGVyc2lzdFdpZHRoIHx8IE1hdGguYWJzKHN0YXRlLmN1cnJlbnRTaXplLndpZHRoIC0gd2lkdGgpIDw9IHRocmVzaG9sZCkge1xuXHRcdFx0XHRcdHdpZHRoID0gc3RhdGUucGVyc2lzdGVkU2l6ZT8ud2lkdGggPz8gZGVmYXVsdFNpemUud2lkdGg7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcGVyc2lzdGVkU2l6ZS5zdG9yZShuZXcgZG9tLkRpbWVuc2lvbih3aWR0aCwgaGVpZ2h0KSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHJlc2V0IHdvcmtpbmcgc3RhdGVcblx0XHRcdHRoaXMuX2NvbnRlbnRXaWRnZXQudW5sb2NrUHJlZmVyZW5jZSgpO1xuXHRcdFx0c3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fbWVzc2FnZUVsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudC5kb21Ob2RlLCBkb20uJCgnLm1lc3NhZ2UnKSk7XG5cdFx0dGhpcy5fbGlzdEVsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudC5kb21Ob2RlLCBkb20uJCgnLnRyZWUnKSk7XG5cblx0XHRjb25zdCBkZXRhaWxzID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN1Z2dlc3REZXRhaWxzV2lkZ2V0LCB0aGlzLmVkaXRvcikpO1xuXHRcdGRldGFpbHMub25EaWRDbG9zZSgoKSA9PiB0aGlzLnRvZ2dsZURldGFpbHMoKSwgdGhpcywgdGhpcy5fZGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMuX2RldGFpbHMgPSBuZXcgU3VnZ2VzdERldGFpbHNPdmVybGF5KGRldGFpbHMsIHRoaXMuZWRpdG9yKTtcblxuXHRcdGNvbnN0IGFwcGx5SWNvblN0eWxlID0gKCkgPT4gdGhpcy5lbGVtZW50LmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnbm8taWNvbnMnLCAhdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zdWdnZXN0KS5zaG93SWNvbnMpO1xuXHRcdGFwcGx5SWNvblN0eWxlKCk7XG5cblx0XHRjb25zdCBhcHBseUZpdFdpZHRoU3R5bGUgPSAoKSA9PiB0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdmaXQtd2lkdGgtdG8tZGV0YWlscycsIHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc3VnZ2VzdCkuZml0V2lkdGhUb0RldGFpbHMpO1xuXHRcdGFwcGx5Rml0V2lkdGhTdHlsZSgpO1xuXG5cdFx0Y29uc3QgcmVuZGVyZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJdGVtUmVuZGVyZXIsIHRoaXMuZWRpdG9yKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQocmVuZGVyZXIpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChyZW5kZXJlci5vbkRpZFRvZ2dsZURldGFpbHMoKCkgPT4gdGhpcy50b2dnbGVEZXRhaWxzKCkpKTtcblxuXHRcdHRoaXMuX2xpc3QgPSBuZXcgTGlzdCgnU3VnZ2VzdFdpZGdldCcsIHRoaXMuX2xpc3RFbGVtZW50LCB7XG5cdFx0XHRnZXRIZWlnaHQ6IChfZWxlbWVudDogQ29tcGxldGlvbkl0ZW0pOiBudW1iZXIgPT4gdGhpcy5nZXRMYXlvdXRJbmZvKCkuaXRlbUhlaWdodCxcblx0XHRcdGdldFRlbXBsYXRlSWQ6IChfZWxlbWVudDogQ29tcGxldGlvbkl0ZW0pOiBzdHJpbmcgPT4gJ3N1Z2dlc3Rpb24nXG5cdFx0fSwgW3JlbmRlcmVyXSwge1xuXHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IHRydWUsXG5cdFx0XHR1c2VTaGFkb3dzOiBmYWxzZSxcblx0XHRcdG1vdXNlU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdGdldFJvbGU6ICgpID0+IGlzV2luZG93cyA/ICdsaXN0aXRlbScgOiAnb3B0aW9uJyxcblx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsOiAoKSA9PiBubHMubG9jYWxpemUoJ3N1Z2dlc3QnLCBcIlN1Z2dlc3RcIiksXG5cdFx0XHRcdGdldFdpZGdldFJvbGU6ICgpID0+ICdsaXN0Ym94Jyxcblx0XHRcdFx0Z2V0QXJpYUxhYmVsOiAoaXRlbTogQ29tcGxldGlvbkl0ZW0pID0+IHtcblxuXHRcdFx0XHRcdGxldCBsYWJlbCA9IGl0ZW0udGV4dExhYmVsO1xuXHRcdFx0XHRcdGNvbnN0IGtpbmRMYWJlbCA9IENvbXBsZXRpb25JdGVtS2luZHMudG9MYWJlbChpdGVtLmNvbXBsZXRpb24ua2luZCk7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBpdGVtLmNvbXBsZXRpb24ubGFiZWwgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB7IGRldGFpbCwgZGVzY3JpcHRpb24gfSA9IGl0ZW0uY29tcGxldGlvbi5sYWJlbDtcblx0XHRcdFx0XHRcdGlmIChkZXRhaWwgJiYgZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRcdFx0bGFiZWwgPSBubHMubG9jYWxpemUoJ2xhYmVsLmZ1bGwnLCAnezB9IHsxfSwgezJ9LCB7M30nLCBsYWJlbCwgZGV0YWlsLCBkZXNjcmlwdGlvbiwga2luZExhYmVsKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoZGV0YWlsKSB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsID0gbmxzLmxvY2FsaXplKCdsYWJlbC5kZXRhaWwnLCAnezB9IHsxfSwgezJ9JywgbGFiZWwsIGRldGFpbCwga2luZExhYmVsKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRcdFx0bGFiZWwgPSBubHMubG9jYWxpemUoJ2xhYmVsLmRlc2MnLCAnezB9LCB7MX0sIHsyfScsIGxhYmVsLCBkZXNjcmlwdGlvbiwga2luZExhYmVsKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bGFiZWwgPSBubHMubG9jYWxpemUoJ2xhYmVsJywgJ3swfSwgezF9JywgbGFiZWwsIGtpbmRMYWJlbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghaXRlbS5pc1Jlc29sdmVkIHx8ICF0aGlzLl9pc0RldGFpbHNWaXNpYmxlKCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBsYWJlbDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCB7IGRvY3VtZW50YXRpb24sIGRldGFpbCB9ID0gaXRlbS5jb21wbGV0aW9uO1xuXHRcdFx0XHRcdGNvbnN0IGRvY3MgPSBzdHJpbmdzLmZvcm1hdChcblx0XHRcdFx0XHRcdCd7MH17MX0nLFxuXHRcdFx0XHRcdFx0ZGV0YWlsIHx8ICcnLFxuXHRcdFx0XHRcdFx0ZG9jdW1lbnRhdGlvbiA/ICh0eXBlb2YgZG9jdW1lbnRhdGlvbiA9PT0gJ3N0cmluZycgPyBkb2N1bWVudGF0aW9uIDogZG9jdW1lbnRhdGlvbi52YWx1ZSkgOiAnJyk7XG5cblx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdhcmlhQ3VycmVudHRTdWdnZXN0aW9uUmVhZERldGFpbHMnLCBcInswfSwgZG9jczogezF9XCIsIGxhYmVsLCBkb2NzKTtcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl9saXN0LnN0eWxlKGdldExpc3RTdHlsZXMoe1xuXHRcdFx0bGlzdEluYWN0aXZlRm9jdXNCYWNrZ3JvdW5kOiBlZGl0b3JTdWdnZXN0V2lkZ2V0U2VsZWN0ZWRCYWNrZ3JvdW5kLFxuXHRcdFx0bGlzdEluYWN0aXZlRm9jdXNPdXRsaW5lOiBlZGl0b3JTdWdnZXN0V2lkZ2V0Rm9jdXNPdXRsaW5lXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fc3RhdHVzID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3VnZ2VzdFdpZGdldFN0YXR1cywgdGhpcy5lbGVtZW50LmRvbU5vZGUsIHN1Z2dlc3RXaWRnZXRTdGF0dXNiYXJNZW51LCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IGFwcGx5U3RhdHVzQmFyU3R5bGUgPSAoKSA9PiB0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCd3aXRoLXN0YXR1cy1iYXInLCB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN1Z2dlc3QpLnNob3dTdGF0dXNCYXIpO1xuXHRcdGFwcGx5U3RhdHVzQmFyU3R5bGUoKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9saXN0Lm9uTW91c2VEb3duKGUgPT4gdGhpcy5fb25MaXN0TW91c2VEb3duT3JUYXAoZSkpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fbGlzdC5vblRhcChlID0+IHRoaXMuX29uTGlzdE1vdXNlRG93bk9yVGFwKGUpKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2xpc3Qub25EaWRDaGFuZ2VTZWxlY3Rpb24oZSA9PiB0aGlzLl9vbkxpc3RTZWxlY3Rpb24oZSkpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fbGlzdC5vbkRpZENoYW5nZUZvY3VzKGUgPT4gdGhpcy5fb25MaXN0Rm9jdXMoZSkpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oKCkgPT4gdGhpcy5fb25DdXJzb3JTZWxlY3Rpb25DaGFuZ2VkKCkpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uc3VnZ2VzdCkpIHtcblx0XHRcdFx0YXBwbHlTdGF0dXNCYXJTdHlsZSgpO1xuXHRcdFx0XHRhcHBseUljb25TdHlsZSgpO1xuXHRcdFx0XHRhcHBseUZpdFdpZHRoU3R5bGUoKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9jb21wbGV0aW9uTW9kZWwgJiYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uZm9udEluZm8pIHx8IGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uc3VnZ2VzdEZvbnRTaXplKSB8fCBlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLnN1Z2dlc3RMaW5lSGVpZ2h0KSkpIHtcblx0XHRcdFx0dGhpcy5fbGlzdC5zcGxpY2UoMCwgdGhpcy5fbGlzdC5sZW5ndGgsIHRoaXMuX2NvbXBsZXRpb25Nb2RlbC5pdGVtcyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldFZpc2libGUgPSBTdWdnZXN0Q29udGV4dC5WaXNpYmxlLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXREZXRhaWxzVmlzaWJsZSA9IFN1Z2dlc3RDb250ZXh0LkRldGFpbHNWaXNpYmxlLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXRNdWx0aXBsZVN1Z2dlc3Rpb25zID0gU3VnZ2VzdENvbnRleHQuTXVsdGlwbGVTdWdnZXN0aW9ucy5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jdHhTdWdnZXN0V2lkZ2V0SGFzRm9jdXNlZFN1Z2dlc3Rpb24gPSBTdWdnZXN0Q29udGV4dC5IYXNGb2N1c2VkU3VnZ2VzdGlvbi5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jdHhTdWdnZXN0V2lkZ2V0RGV0YWlsc0ZvY3VzZWQgPSBTdWdnZXN0Q29udGV4dC5EZXRhaWxzRm9jdXNlZC5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGRldGFpbHNGb2N1c1RyYWNrZXIgPSBkb20udHJhY2tGb2N1cyh0aGlzLl9kZXRhaWxzLndpZGdldC5kb21Ob2RlKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoZGV0YWlsc0ZvY3VzVHJhY2tlcik7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGRldGFpbHNGb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiB0aGlzLl9jdHhTdWdnZXN0V2lkZ2V0RGV0YWlsc0ZvY3VzZWQuc2V0KHRydWUpKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGRldGFpbHNGb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXREZXRhaWxzRm9jdXNlZC5zZXQoZmFsc2UpKSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RldGFpbHMud2lkZ2V0LmRvbU5vZGUsICdrZXlkb3duJywgZSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRldGFpbHNLZXlkb3duLmZpcmUoZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuZWRpdG9yLm9uTW91c2VEb3duKChlOiBJRWRpdG9yTW91c2VFdmVudCkgPT4gdGhpcy5fb25FZGl0b3JNb3VzZURvd24oZSkpKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGV0YWlscy53aWRnZXQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2RldGFpbHMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2xpc3QuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3N0YXR1cy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2xvYWRpbmdUaW1lb3V0LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9wZW5kaW5nTGF5b3V0LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9wZW5kaW5nU2hvd0RldGFpbHMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3Nob3dUaW1lb3V0LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9jb250ZW50V2lkZ2V0LmRpc3Bvc2UoKTtcblx0XHR0aGlzLmVsZW1lbnQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkU2VsZWN0LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZEZvY3VzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZEhpZGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkU2hvdy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EZXRhaWxzS2V5ZG93bi5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkVkaXRvck1vdXNlRG93bihtb3VzZUV2ZW50OiBJRWRpdG9yTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kZXRhaWxzLndpZGdldC5kb21Ob2RlLmNvbnRhaW5zKG1vdXNlRXZlbnQudGFyZ2V0LmVsZW1lbnQpKSB7XG5cdFx0XHQvLyBDbGlja2luZyBpbnNpZGUgZGV0YWlsc1xuXHRcdFx0dGhpcy5fZGV0YWlscy53aWRnZXQuZG9tTm9kZS5mb2N1cygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBDbGlja2luZyBvdXRzaWRlIGRldGFpbHMgYW5kIGluc2lkZSBzdWdnZXN0XG5cdFx0XHRpZiAodGhpcy5lbGVtZW50LmRvbU5vZGUuY29udGFpbnMobW91c2VFdmVudC50YXJnZXQuZWxlbWVudCkpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3IuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vbkN1cnNvclNlbGVjdGlvbkNoYW5nZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlICE9PSBTdGF0ZS5IaWRkZW4pIHtcblx0XHRcdHRoaXMuX2NvbnRlbnRXaWRnZXQubGF5b3V0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25MaXN0TW91c2VEb3duT3JUYXAoZTogSUxpc3RNb3VzZUV2ZW50PENvbXBsZXRpb25JdGVtPiB8IElMaXN0R2VzdHVyZUV2ZW50PENvbXBsZXRpb25JdGVtPik6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgZS5lbGVtZW50ID09PSAndW5kZWZpbmVkJyB8fCB0eXBlb2YgZS5pbmRleCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBwcmV2ZW50IHN0ZWFsaW5nIGJyb3dzZXIgZm9jdXMgZnJvbSB0aGUgZWRpdG9yXG5cdFx0ZS5icm93c2VyRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRlLmJyb3dzZXJFdmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblxuXHRcdHRoaXMuX3NlbGVjdChlLmVsZW1lbnQsIGUuaW5kZXgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25MaXN0U2VsZWN0aW9uKGU6IElMaXN0RXZlbnQ8Q29tcGxldGlvbkl0ZW0+KTogdm9pZCB7XG5cdFx0aWYgKGUuZWxlbWVudHMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9zZWxlY3QoZS5lbGVtZW50c1swXSwgZS5pbmRleGVzWzBdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZWxlY3QoaXRlbTogQ29tcGxldGlvbkl0ZW0sIGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBjb21wbGV0aW9uTW9kZWwgPSB0aGlzLl9jb21wbGV0aW9uTW9kZWw7XG5cdFx0aWYgKGNvbXBsZXRpb25Nb2RlbCkge1xuXHRcdFx0dGhpcy5fb25EaWRTZWxlY3QuZmlyZSh7IGl0ZW0sIGluZGV4LCBtb2RlbDogY29tcGxldGlvbk1vZGVsIH0pO1xuXHRcdFx0dGhpcy5lZGl0b3IuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vbkxpc3RGb2N1cyhlOiBJTGlzdEV2ZW50PENvbXBsZXRpb25JdGVtPik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pZ25vcmVGb2N1c0V2ZW50cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuRGV0YWlscykge1xuXHRcdFx0Ly8gVGhpcyBjYW4gaGFwcGVuIHdoZW4gZm9jdXMgaXMgaW4gdGhlIGRldGFpbHMtcGFuZWwgYW5kIHdoZW5cblx0XHRcdC8vIGFycm93IGtleXMgYXJlIHByZXNzZWQgdG8gc2VsZWN0IG5leHQvcHJldiBpdGVtc1xuXHRcdFx0dGhpcy5fc2V0U3RhdGUoU3RhdGUuT3Blbik7XG5cdFx0fVxuXG5cdFx0aWYgKCFlLmVsZW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRTdWdnZXN0aW9uRGV0YWlscykge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHMuY2FuY2VsKCk7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRTdWdnZXN0aW9uRGV0YWlscyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fZm9jdXNlZEl0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZWRpdG9yLnNldEFyaWFPcHRpb25zKHsgYWN0aXZlRGVzY2VuZGFudDogdW5kZWZpbmVkIH0pO1xuXHRcdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldEhhc0ZvY3VzZWRTdWdnZXN0aW9uLnNldChmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9jb21wbGV0aW9uTW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jdHhTdWdnZXN0V2lkZ2V0SGFzRm9jdXNlZFN1Z2dlc3Rpb24uc2V0KHRydWUpO1xuXHRcdGNvbnN0IGl0ZW0gPSBlLmVsZW1lbnRzWzBdO1xuXHRcdGNvbnN0IGluZGV4ID0gZS5pbmRleGVzWzBdO1xuXG5cdFx0aWYgKGl0ZW0gIT09IHRoaXMuX2ZvY3VzZWRJdGVtKSB7XG5cblx0XHRcdHRoaXMuX2N1cnJlbnRTdWdnZXN0aW9uRGV0YWlscz8uY2FuY2VsKCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHMgPSB1bmRlZmluZWQ7XG5cblx0XHRcdHRoaXMuX2ZvY3VzZWRJdGVtID0gaXRlbTtcblxuXHRcdFx0dGhpcy5fbGlzdC5yZXZlYWwoaW5kZXgpO1xuXG5cdFx0XHR0aGlzLl9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHMgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShhc3luYyB0b2tlbiA9PiB7XG5cdFx0XHRcdGNvbnN0IGxvYWRpbmcgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2lzRGV0YWlsc1Zpc2libGUoKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2hvd0RldGFpbHModHJ1ZSwgZmFsc2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgMjUwKTtcblx0XHRcdFx0Y29uc3Qgc3ViID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gbG9hZGluZy5kaXNwb3NlKCkpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJldHVybiBhd2FpdCBpdGVtLnJlc29sdmUodG9rZW4pO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdGxvYWRpbmcuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLl9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHMudGhlbigoKSA9PiB7XG5cdFx0XHRcdGlmIChpbmRleCA+PSB0aGlzLl9saXN0Lmxlbmd0aCB8fCBpdGVtICE9PSB0aGlzLl9saXN0LmVsZW1lbnQoaW5kZXgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gaXRlbSBjYW4gaGF2ZSBleHRyYSBpbmZvcm1hdGlvbiwgc28gcmUtcmVuZGVyXG5cdFx0XHRcdHRoaXMuX2lnbm9yZUZvY3VzRXZlbnRzID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fbGlzdC5zcGxpY2UoaW5kZXgsIDEsIFtpdGVtXSk7XG5cdFx0XHRcdHRoaXMuX2xpc3Quc2V0Rm9jdXMoW2luZGV4XSk7XG5cdFx0XHRcdHRoaXMuX2lnbm9yZUZvY3VzRXZlbnRzID0gZmFsc2U7XG5cblx0XHRcdFx0aWYgKHRoaXMuX2lzRGV0YWlsc1Zpc2libGUoKSkge1xuXHRcdFx0XHRcdHRoaXMuX3Nob3dEZXRhaWxzKGZhbHNlLCBmYWxzZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5lbGVtZW50LmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnZG9jcy1zaWRlJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmVkaXRvci5zZXRBcmlhT3B0aW9ucyh7IGFjdGl2ZURlc2NlbmRhbnQ6IHRoaXMuX2xpc3QuZ2V0RWxlbWVudElEKGluZGV4KSB9KTtcblx0XHRcdH0pLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHR9XG5cblx0XHQvLyBlbWl0IGFuIGV2ZW50XG5cdFx0dGhpcy5fb25EaWRGb2N1cy5maXJlKHsgaXRlbSwgaW5kZXgsIG1vZGVsOiB0aGlzLl9jb21wbGV0aW9uTW9kZWwgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRTdGF0ZShzdGF0ZTogU3RhdGUpOiB2b2lkIHtcblxuXHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gc3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3RhdGUgPSBzdGF0ZTtcblxuXHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2Zyb3plbicsIHN0YXRlID09PSBTdGF0ZS5Gcm96ZW4pO1xuXHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ21lc3NhZ2UnKTtcblxuXHRcdHN3aXRjaCAoc3RhdGUpIHtcblx0XHRcdGNhc2UgU3RhdGUuSGlkZGVuOlxuXHRcdFx0XHRkb20uaGlkZSh0aGlzLl9tZXNzYWdlRWxlbWVudCwgdGhpcy5fbGlzdEVsZW1lbnQsIHRoaXMuX3N0YXR1cy5lbGVtZW50KTtcblx0XHRcdFx0dGhpcy5fZGV0YWlscy5oaWRlKHRydWUpO1xuXHRcdFx0XHR0aGlzLl9zdGF0dXMuaGlkZSgpO1xuXHRcdFx0XHR0aGlzLl9jb250ZW50V2lkZ2V0LmhpZGUoKTtcblx0XHRcdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldFZpc2libGUucmVzZXQoKTtcblx0XHRcdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldE11bHRpcGxlU3VnZ2VzdGlvbnMucmVzZXQoKTtcblx0XHRcdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldEhhc0ZvY3VzZWRTdWdnZXN0aW9uLnJlc2V0KCk7XG5cdFx0XHRcdHRoaXMuX3Nob3dUaW1lb3V0LmNhbmNlbCgpO1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCd2aXNpYmxlJyk7XG5cdFx0XHRcdHRoaXMuX2xpc3Quc3BsaWNlKDAsIHRoaXMuX2xpc3QubGVuZ3RoKTtcblx0XHRcdFx0dGhpcy5fZm9jdXNlZEl0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2NhcHBlZEhlaWdodCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fZXhwbGFpbk1vZGUgPSBmYWxzZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlLkxvYWRpbmc6XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ21lc3NhZ2UnKTtcblx0XHRcdFx0dGhpcy5fbWVzc2FnZUVsZW1lbnQudGV4dENvbnRlbnQgPSBTdWdnZXN0V2lkZ2V0LkxPQURJTkdfTUVTU0FHRTtcblx0XHRcdFx0ZG9tLmhpZGUodGhpcy5fbGlzdEVsZW1lbnQsIHRoaXMuX3N0YXR1cy5lbGVtZW50KTtcblx0XHRcdFx0ZG9tLnNob3codGhpcy5fbWVzc2FnZUVsZW1lbnQpO1xuXHRcdFx0XHR0aGlzLl9kZXRhaWxzLmhpZGUoKTtcblx0XHRcdFx0dGhpcy5fc2hvdygpO1xuXHRcdFx0XHR0aGlzLl9mb2N1c2VkSXRlbSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0c3RhdHVzKFN1Z2dlc3RXaWRnZXQuTE9BRElOR19NRVNTQUdFKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlLkVtcHR5OlxuXHRcdFx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdtZXNzYWdlJyk7XG5cdFx0XHRcdHRoaXMuX21lc3NhZ2VFbGVtZW50LnRleHRDb250ZW50ID0gU3VnZ2VzdFdpZGdldC5OT19TVUdHRVNUSU9OU19NRVNTQUdFO1xuXHRcdFx0XHRkb20uaGlkZSh0aGlzLl9saXN0RWxlbWVudCwgdGhpcy5fc3RhdHVzLmVsZW1lbnQpO1xuXHRcdFx0XHRkb20uc2hvdyh0aGlzLl9tZXNzYWdlRWxlbWVudCk7XG5cdFx0XHRcdHRoaXMuX2RldGFpbHMuaGlkZSgpO1xuXHRcdFx0XHR0aGlzLl9zaG93KCk7XG5cdFx0XHRcdHRoaXMuX2ZvY3VzZWRJdGVtID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRzdGF0dXMoU3VnZ2VzdFdpZGdldC5OT19TVUdHRVNUSU9OU19NRVNTQUdFKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlLk9wZW46XG5cdFx0XHRcdGRvbS5oaWRlKHRoaXMuX21lc3NhZ2VFbGVtZW50KTtcblx0XHRcdFx0ZG9tLnNob3codGhpcy5fbGlzdEVsZW1lbnQsIHRoaXMuX3N0YXR1cy5lbGVtZW50KTtcblx0XHRcdFx0dGhpcy5fc2hvdygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU3RhdGUuRnJvemVuOlxuXHRcdFx0XHRkb20uaGlkZSh0aGlzLl9tZXNzYWdlRWxlbWVudCk7XG5cdFx0XHRcdGRvbS5zaG93KHRoaXMuX2xpc3RFbGVtZW50LCB0aGlzLl9zdGF0dXMuZWxlbWVudCk7XG5cdFx0XHRcdHRoaXMuX3Nob3coKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlLkRldGFpbHM6XG5cdFx0XHRcdGRvbS5oaWRlKHRoaXMuX21lc3NhZ2VFbGVtZW50KTtcblx0XHRcdFx0ZG9tLnNob3codGhpcy5fbGlzdEVsZW1lbnQsIHRoaXMuX3N0YXR1cy5lbGVtZW50KTtcblx0XHRcdFx0dGhpcy5fZGV0YWlscy5zaG93KCk7XG5cdFx0XHRcdHRoaXMuX3Nob3coKTtcblx0XHRcdFx0dGhpcy5fZGV0YWlscy53aWRnZXQuZm9jdXMoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2hvdygpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGF0dXMuc2hvdygpO1xuXHRcdHRoaXMuX2NvbnRlbnRXaWRnZXQuc2hvdygpO1xuXHRcdHRoaXMuX2xheW91dCh0aGlzLl9wZXJzaXN0ZWRTaXplLnJlc3RvcmUoKSk7XG5cdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldFZpc2libGUuc2V0KHRydWUpO1xuXG5cdFx0dGhpcy5fc2hvd1RpbWVvdXQuY2FuY2VsQW5kU2V0KCgpID0+IHtcblx0XHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3Zpc2libGUnKTtcblx0XHRcdHRoaXMuX29uRGlkU2hvdy5maXJlKHRoaXMpO1xuXHRcdH0sIDEwMCk7XG5cdH1cblxuXHRzaG93VHJpZ2dlcmVkKGF1dG86IGJvb2xlYW4sIGRlbGF5OiBudW1iZXIpIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgIT09IFN0YXRlLkhpZGRlbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jb250ZW50V2lkZ2V0LnNldFBvc2l0aW9uKHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCkpO1xuXHRcdHRoaXMuX2lzQXV0byA9ICEhYXV0bztcblxuXHRcdGlmICghdGhpcy5faXNBdXRvKSB7XG5cdFx0XHR0aGlzLl9sb2FkaW5nVGltZW91dC52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHRoaXMuX3NldFN0YXRlKFN0YXRlLkxvYWRpbmcpLCBkZWxheSk7XG5cdFx0fVxuXHR9XG5cblx0c2hvd1N1Z2dlc3Rpb25zKGNvbXBsZXRpb25Nb2RlbDogQ29tcGxldGlvbk1vZGVsLCBzZWxlY3Rpb25JbmRleDogbnVtYmVyLCBpc0Zyb3plbjogYm9vbGVhbiwgaXNBdXRvOiBib29sZWFuLCBub0ZvY3VzOiBib29sZWFuKTogdm9pZCB7XG5cblx0XHR0aGlzLl9jb250ZW50V2lkZ2V0LnNldFBvc2l0aW9uKHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCkpO1xuXHRcdHRoaXMuX2xvYWRpbmdUaW1lb3V0LmNsZWFyKCk7XG5cblx0XHR0aGlzLl9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHM/LmNhbmNlbCgpO1xuXHRcdHRoaXMuX2N1cnJlbnRTdWdnZXN0aW9uRGV0YWlscyA9IHVuZGVmaW5lZDtcblxuXHRcdGlmICh0aGlzLl9jb21wbGV0aW9uTW9kZWwgIT09IGNvbXBsZXRpb25Nb2RlbCkge1xuXHRcdFx0dGhpcy5fY29tcGxldGlvbk1vZGVsID0gY29tcGxldGlvbk1vZGVsO1xuXHRcdH1cblxuXHRcdGlmIChpc0Zyb3plbiAmJiB0aGlzLl9zdGF0ZSAhPT0gU3RhdGUuRW1wdHkgJiYgdGhpcy5fc3RhdGUgIT09IFN0YXRlLkhpZGRlbikge1xuXHRcdFx0dGhpcy5fc2V0U3RhdGUoU3RhdGUuRnJvemVuKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB2aXNpYmxlQ291bnQgPSB0aGlzLl9jb21wbGV0aW9uTW9kZWwuaXRlbXMubGVuZ3RoO1xuXHRcdGNvbnN0IGlzRW1wdHkgPSB2aXNpYmxlQ291bnQgPT09IDA7XG5cdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldE11bHRpcGxlU3VnZ2VzdGlvbnMuc2V0KHZpc2libGVDb3VudCA+IDEpO1xuXG5cdFx0aWYgKGlzRW1wdHkpIHtcblx0XHRcdHRoaXMuX3NldFN0YXRlKGlzQXV0byA/IFN0YXRlLkhpZGRlbiA6IFN0YXRlLkVtcHR5KTtcblx0XHRcdHRoaXMuX2NvbXBsZXRpb25Nb2RlbCA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9mb2N1c2VkSXRlbSA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIGNhbGxpbmcgbGlzdC5zcGxpY2UgdHJpZ2dlcnMgZm9jdXMgZXZlbnQgd2hpY2ggdGhpcyB3aWRnZXQgZm9yd2FyZHMuIFRoYXQgY2FuIGxlYWQgdG9cblx0XHQvLyBzdWdnZXN0aW9ucyBiZWluZyBjYW5jZWxsZWQgYW5kIHRoZSB3aWRnZXQgYmVpbmcgY2xlYXJlZCAoYW5kIGhpZGRlbikuIEFsbCB0aGlzIGhhcHBlbnNcblx0XHQvLyBiZWZvcmUgcmV2ZWFsaW5nIGFuZCBmb2N1c2luZyBpcyBkb25lIHdoaWNoIG1lYW5zIHJldmVhbGluZyBhbmQgZm9jdXNpbmcgd2lsbCBmYWlsIHdoZW5cblx0XHQvLyB0aGV5IGdldCBydW4uXG5cdFx0dGhpcy5fb25EaWRGb2N1cy5wYXVzZSgpO1xuXHRcdHRoaXMuX29uRGlkU2VsZWN0LnBhdXNlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2xpc3Quc3BsaWNlKDAsIHRoaXMuX2xpc3QubGVuZ3RoLCB0aGlzLl9jb21wbGV0aW9uTW9kZWwuaXRlbXMpO1xuXHRcdFx0dGhpcy5fc2V0U3RhdGUoaXNGcm96ZW4gPyBTdGF0ZS5Gcm96ZW4gOiBTdGF0ZS5PcGVuKTtcblx0XHRcdHRoaXMuX2xpc3QucmV2ZWFsKHNlbGVjdGlvbkluZGV4LCAwLCBzZWxlY3Rpb25JbmRleCA9PT0gMCA/IDAgOiB0aGlzLmdldExheW91dEluZm8oKS5pdGVtSGVpZ2h0ICogMC4zMyk7XG5cdFx0XHR0aGlzLl9saXN0LnNldEZvY3VzKG5vRm9jdXMgPyBbXSA6IFtzZWxlY3Rpb25JbmRleF0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9vbkRpZEZvY3VzLnJlc3VtZSgpO1xuXHRcdFx0dGhpcy5fb25EaWRTZWxlY3QucmVzdW1lKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcGVuZGluZ0xheW91dC52YWx1ZSA9IGRvbS5ydW5BdFRoaXNPclNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyh0aGlzLmVsZW1lbnQuZG9tTm9kZSksICgpID0+IHtcblx0XHRcdHRoaXMuX3BlbmRpbmdMYXlvdXQuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2xheW91dCh0aGlzLmVsZW1lbnQuc2l6ZSk7XG5cdFx0XHQvLyBSZXNldCBmb2N1cyBib3JkZXJcblx0XHRcdHRoaXMuX2RldGFpbHMud2lkZ2V0LmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnZm9jdXNlZCcpO1xuXHRcdH0pO1xuXHR9XG5cblx0Zm9jdXNTZWxlY3RlZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbGlzdC5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9saXN0LnNldEZvY3VzKFswXSk7XG5cdFx0fVxuXHR9XG5cblx0c2VsZWN0TmV4dFBhZ2UoKTogYm9vbGVhbiB7XG5cdFx0c3dpdGNoICh0aGlzLl9zdGF0ZSkge1xuXHRcdFx0Y2FzZSBTdGF0ZS5IaWRkZW46XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdGNhc2UgU3RhdGUuRGV0YWlsczpcblx0XHRcdFx0dGhpcy5fZGV0YWlscy53aWRnZXQucGFnZURvd24oKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIFN0YXRlLkxvYWRpbmc6XG5cdFx0XHRcdHJldHVybiAhdGhpcy5faXNBdXRvO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhpcy5fbGlzdC5mb2N1c05leHRQYWdlKCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHNlbGVjdE5leHQoKTogYm9vbGVhbiB7XG5cdFx0c3dpdGNoICh0aGlzLl9zdGF0ZSkge1xuXHRcdFx0Y2FzZSBTdGF0ZS5IaWRkZW46XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdGNhc2UgU3RhdGUuTG9hZGluZzpcblx0XHRcdFx0cmV0dXJuICF0aGlzLl9pc0F1dG87XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aGlzLl9saXN0LmZvY3VzTmV4dCgxLCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cblx0c2VsZWN0TGFzdCgpOiBib29sZWFuIHtcblx0XHRzd2l0Y2ggKHRoaXMuX3N0YXRlKSB7XG5cdFx0XHRjYXNlIFN0YXRlLkhpZGRlbjpcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0Y2FzZSBTdGF0ZS5EZXRhaWxzOlxuXHRcdFx0XHR0aGlzLl9kZXRhaWxzLndpZGdldC5zY3JvbGxCb3R0b20oKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIFN0YXRlLkxvYWRpbmc6XG5cdFx0XHRcdHJldHVybiAhdGhpcy5faXNBdXRvO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhpcy5fbGlzdC5mb2N1c0xhc3QoKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cblx0c2VsZWN0UHJldmlvdXNQYWdlKCk6IGJvb2xlYW4ge1xuXHRcdHN3aXRjaCAodGhpcy5fc3RhdGUpIHtcblx0XHRcdGNhc2UgU3RhdGUuSGlkZGVuOlxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRjYXNlIFN0YXRlLkRldGFpbHM6XG5cdFx0XHRcdHRoaXMuX2RldGFpbHMud2lkZ2V0LnBhZ2VVcCgpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgU3RhdGUuTG9hZGluZzpcblx0XHRcdFx0cmV0dXJuICF0aGlzLl9pc0F1dG87XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aGlzLl9saXN0LmZvY3VzUHJldmlvdXNQYWdlKCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHNlbGVjdFByZXZpb3VzKCk6IGJvb2xlYW4ge1xuXHRcdHN3aXRjaCAodGhpcy5fc3RhdGUpIHtcblx0XHRcdGNhc2UgU3RhdGUuSGlkZGVuOlxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRjYXNlIFN0YXRlLkxvYWRpbmc6XG5cdFx0XHRcdHJldHVybiAhdGhpcy5faXNBdXRvO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhpcy5fbGlzdC5mb2N1c1ByZXZpb3VzKDEsIHRydWUpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0c2VsZWN0Rmlyc3QoKTogYm9vbGVhbiB7XG5cdFx0c3dpdGNoICh0aGlzLl9zdGF0ZSkge1xuXHRcdFx0Y2FzZSBTdGF0ZS5IaWRkZW46XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdGNhc2UgU3RhdGUuRGV0YWlsczpcblx0XHRcdFx0dGhpcy5fZGV0YWlscy53aWRnZXQuc2Nyb2xsVG9wKCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSBTdGF0ZS5Mb2FkaW5nOlxuXHRcdFx0XHRyZXR1cm4gIXRoaXMuX2lzQXV0bztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRoaXMuX2xpc3QuZm9jdXNGaXJzdCgpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRnZXRGb2N1c2VkSXRlbSgpOiBJU2VsZWN0ZWRTdWdnZXN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgIT09IFN0YXRlLkhpZGRlblxuXHRcdFx0JiYgdGhpcy5fc3RhdGUgIT09IFN0YXRlLkVtcHR5XG5cdFx0XHQmJiB0aGlzLl9zdGF0ZSAhPT0gU3RhdGUuTG9hZGluZ1xuXHRcdFx0JiYgdGhpcy5fY29tcGxldGlvbk1vZGVsXG5cdFx0XHQmJiB0aGlzLl9saXN0LmdldEZvY3VzKCkubGVuZ3RoID4gMFxuXHRcdCkge1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpdGVtOiB0aGlzLl9saXN0LmdldEZvY3VzZWRFbGVtZW50cygpWzBdLFxuXHRcdFx0XHRpbmRleDogdGhpcy5fbGlzdC5nZXRGb2N1cygpWzBdLFxuXHRcdFx0XHRtb2RlbDogdGhpcy5fY29tcGxldGlvbk1vZGVsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0dG9nZ2xlRGV0YWlsc0ZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuRGV0YWlscykge1xuXHRcdFx0Ly8gU2hvdWxkIHJldHVybiB0aGUgZm9jdXMgdG8gdGhlIGxpc3QgaXRlbS5cblx0XHRcdHRoaXMuX2xpc3Quc2V0Rm9jdXModGhpcy5fbGlzdC5nZXRGb2N1cygpKTtcblx0XHRcdHRoaXMuX3NldFN0YXRlKFN0YXRlLk9wZW4pO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fc3RhdGUgPT09IFN0YXRlLk9wZW4pIHtcblx0XHRcdHRoaXMuX3NldFN0YXRlKFN0YXRlLkRldGFpbHMpO1xuXHRcdFx0aWYgKCF0aGlzLl9pc0RldGFpbHNWaXNpYmxlKCkpIHtcblx0XHRcdFx0dGhpcy50b2dnbGVEZXRhaWxzKHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZGV0YWlscy53aWRnZXQuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR0b2dnbGVEZXRhaWxzKGZvY3VzZWQ6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0RldGFpbHNWaXNpYmxlKCkpIHtcblx0XHRcdC8vIGhpZGUgZGV0YWlscyB3aWRnZXRcblx0XHRcdHRoaXMuX3BlbmRpbmdTaG93RGV0YWlscy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldERldGFpbHNWaXNpYmxlLnNldChmYWxzZSk7XG5cdFx0XHR0aGlzLl9zZXREZXRhaWxzVmlzaWJsZShmYWxzZSk7XG5cdFx0XHR0aGlzLl9kZXRhaWxzLmhpZGUoKTtcblx0XHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ3Nob3dzLWRldGFpbHMnKTtcblxuXHRcdH0gZWxzZSBpZiAoKGNhbkV4cGFuZENvbXBsZXRpb25JdGVtKHRoaXMuX2xpc3QuZ2V0Rm9jdXNlZEVsZW1lbnRzKClbMF0pIHx8IHRoaXMuX2V4cGxhaW5Nb2RlKSAmJiAodGhpcy5fc3RhdGUgPT09IFN0YXRlLk9wZW4gfHwgdGhpcy5fc3RhdGUgPT09IFN0YXRlLkRldGFpbHMgfHwgdGhpcy5fc3RhdGUgPT09IFN0YXRlLkZyb3plbikpIHtcblx0XHRcdC8vIHNob3cgZGV0YWlscyB3aWRnZXQgKGlmZiBwb3NzaWJsZSlcblx0XHRcdHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXREZXRhaWxzVmlzaWJsZS5zZXQodHJ1ZSk7XG5cdFx0XHR0aGlzLl9zZXREZXRhaWxzVmlzaWJsZSh0cnVlKTtcblx0XHRcdHRoaXMuX3Nob3dEZXRhaWxzKGZhbHNlLCBmb2N1c2VkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zaG93RGV0YWlscyhsb2FkaW5nOiBib29sZWFuLCBmb2N1c2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ1Nob3dEZXRhaWxzLnZhbHVlID0gZG9tLnJ1bkF0VGhpc09yU2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShkb20uZ2V0V2luZG93KHRoaXMuZWxlbWVudC5kb21Ob2RlKSwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1Nob3dEZXRhaWxzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9kZXRhaWxzLnNob3coKTtcblx0XHRcdGxldCBkaWRGb2N1c0RldGFpbHMgPSBmYWxzZTtcblx0XHRcdGlmIChsb2FkaW5nKSB7XG5cdFx0XHRcdHRoaXMuX2RldGFpbHMud2lkZ2V0LnJlbmRlckxvYWRpbmcoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2RldGFpbHMud2lkZ2V0LnJlbmRlckl0ZW0odGhpcy5fbGlzdC5nZXRGb2N1c2VkRWxlbWVudHMoKVswXSwgdGhpcy5fZXhwbGFpbk1vZGUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLl9kZXRhaWxzLndpZGdldC5pc0VtcHR5KSB7XG5cdFx0XHRcdHRoaXMuX3Bvc2l0aW9uRGV0YWlscygpO1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdzaG93cy1kZXRhaWxzJyk7XG5cdFx0XHRcdGlmIChmb2N1c2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5fZGV0YWlscy53aWRnZXQuZm9jdXMoKTtcblx0XHRcdFx0XHRkaWRGb2N1c0RldGFpbHMgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9kZXRhaWxzLmhpZGUoKTtcblx0XHRcdH1cblx0XHRcdGlmICghZGlkRm9jdXNEZXRhaWxzKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHR0b2dnbGVFeHBsYWluTW9kZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbGlzdC5nZXRGb2N1c2VkRWxlbWVudHMoKVswXSkge1xuXHRcdFx0dGhpcy5fZXhwbGFpbk1vZGUgPSAhdGhpcy5fZXhwbGFpbk1vZGU7XG5cdFx0XHRpZiAoIXRoaXMuX2lzRGV0YWlsc1Zpc2libGUoKSkge1xuXHRcdFx0XHR0aGlzLnRvZ2dsZURldGFpbHMoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dEZXRhaWxzKGZhbHNlLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmVzZXRQZXJzaXN0ZWRTaXplKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BlcnNpc3RlZFNpemUucmVzZXQoKTtcblx0fVxuXG5cdGhpZGVXaWRnZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ0xheW91dC5jbGVhcigpO1xuXHRcdHRoaXMuX3BlbmRpbmdTaG93RGV0YWlscy5jbGVhcigpO1xuXHRcdHRoaXMuX2xvYWRpbmdUaW1lb3V0LmNsZWFyKCk7XG5cblx0XHR0aGlzLl9zZXRTdGF0ZShTdGF0ZS5IaWRkZW4pO1xuXHRcdHRoaXMuX29uRGlkSGlkZS5maXJlKHRoaXMpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGVhclNhc2hIb3ZlclN0YXRlKCk7XG5cblx0XHQvLyBlbnN1cmUgdGhhdCBhIHJlYXNvbmFibGUgd2lkZ2V0IGhlaWdodCBpcyBwZXJzaXN0ZWQgc28gdGhhdFxuXHRcdC8vIGFjY2lkZW50aWFsIFwicmVzaXplLXRvLXNpbmdsZS1pdGVtc1wiIGNhc2VzIGFyZW4ndCBoYXBwZW5pbmdcblx0XHRjb25zdCBkaW0gPSB0aGlzLl9wZXJzaXN0ZWRTaXplLnJlc3RvcmUoKTtcblx0XHRjb25zdCBtaW5QZXJzaXN0ZWRIZWlnaHQgPSBNYXRoLmNlaWwodGhpcy5nZXRMYXlvdXRJbmZvKCkuaXRlbUhlaWdodCAqIDQuMyk7XG5cdFx0aWYgKGRpbSAmJiBkaW0uaGVpZ2h0IDwgbWluUGVyc2lzdGVkSGVpZ2h0KSB7XG5cdFx0XHR0aGlzLl9wZXJzaXN0ZWRTaXplLnN0b3JlKGRpbS53aXRoKHVuZGVmaW5lZCwgbWluUGVyc2lzdGVkSGVpZ2h0KSk7XG5cdFx0fVxuXHR9XG5cblx0aXNGcm96ZW4oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXRlID09PSBTdGF0ZS5Gcm96ZW47XG5cdH1cblxuXHRfYWZ0ZXJSZW5kZXIocG9zaXRpb246IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UgfCBudWxsKSB7XG5cdFx0aWYgKHBvc2l0aW9uID09PSBudWxsKSB7XG5cdFx0XHRpZiAodGhpcy5faXNEZXRhaWxzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMuX2RldGFpbHMuaGlkZSgpOyAvL3RvZG9AanJpZWtlbiBzb2Z0LWhpZGVcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0YXRlID09PSBTdGF0ZS5FbXB0eSB8fCB0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuTG9hZGluZykge1xuXHRcdFx0Ly8gbm8gc3BlY2lhbCBwb3NpdGlvbmluZyB3aGVuIHdpZGdldCBpc24ndCBzaG93aW5nIGxpc3Rcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2lzRGV0YWlsc1Zpc2libGUoKSAmJiAhdGhpcy5fZGV0YWlscy53aWRnZXQuaXNFbXB0eSkge1xuXHRcdFx0dGhpcy5fZGV0YWlscy5zaG93KCk7XG5cdFx0fVxuXHRcdHRoaXMuX3Bvc2l0aW9uRGV0YWlscygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0KHNpemU6IGRvbS5EaW1lbnNpb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmVkaXRvci5nZXREb21Ob2RlKCkpIHtcblx0XHRcdC8vIGhhcHBlbnMgd2hlbiBydW5uaW5nIHRlc3RzXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYm9keUJveCA9IGRvbS5nZXRDbGllbnRBcmVhKHRoaXMuZWxlbWVudC5kb21Ob2RlLm93bmVyRG9jdW1lbnQuYm9keSk7XG5cdFx0Y29uc3QgaW5mbyA9IHRoaXMuZ2V0TGF5b3V0SW5mbygpO1xuXG5cdFx0aWYgKCFzaXplKSB7XG5cdFx0XHRzaXplID0gaW5mby5kZWZhdWx0U2l6ZTtcblx0XHR9XG5cblx0XHRsZXQgaGVpZ2h0ID0gc2l6ZS5oZWlnaHQ7XG5cdFx0bGV0IHdpZHRoID0gc2l6ZS53aWR0aDtcblxuXHRcdC8vIHN0YXR1cyBiYXJcblx0XHR0aGlzLl9zdGF0dXMuZWxlbWVudC5zdHlsZS5oZWlnaHQgPSBgJHtpbmZvLml0ZW1IZWlnaHR9cHhgO1xuXG5cdFx0aWYgKHRoaXMuX3N0YXRlID09PSBTdGF0ZS5FbXB0eSB8fCB0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuTG9hZGluZykge1xuXHRcdFx0Ly8gc2hvd2luZyBhIG1lc3NhZ2Ugb25seVxuXHRcdFx0aGVpZ2h0ID0gaW5mby5pdGVtSGVpZ2h0ICsgaW5mby5ib3JkZXJIZWlnaHQ7XG5cdFx0XHR3aWR0aCA9IGluZm8uZGVmYXVsdFNpemUud2lkdGggLyAyO1xuXHRcdFx0dGhpcy5lbGVtZW50LmVuYWJsZVNhc2hlcyhmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHR0aGlzLmVsZW1lbnQubWluU2l6ZSA9IHRoaXMuZWxlbWVudC5tYXhTaXplID0gbmV3IGRvbS5EaW1lbnNpb24od2lkdGgsIGhlaWdodCk7XG5cdFx0XHR0aGlzLl9jb250ZW50V2lkZ2V0LnNldFByZWZlcmVuY2UoQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5CRUxPVyk7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gc2hvd2luZyBpdGVtc1xuXG5cdFx0XHQvLyB3aWR0aCBtYXRoXG5cdFx0XHRjb25zdCBtYXhXaWR0aCA9IGJvZHlCb3gud2lkdGggLSBpbmZvLmJvcmRlckhlaWdodCAtIDIgKiBpbmZvLmhvcml6b250YWxQYWRkaW5nO1xuXHRcdFx0aWYgKHdpZHRoID4gbWF4V2lkdGgpIHtcblx0XHRcdFx0d2lkdGggPSBtYXhXaWR0aDtcblx0XHRcdH1cblx0XHRcdGxldCBwcmVmZXJyZWRXaWR0aCA9IHRoaXMuX2NvbXBsZXRpb25Nb2RlbCA/IHRoaXMuX2NvbXBsZXRpb25Nb2RlbC5zdGF0cy5wTGFiZWxMZW4gKiBpbmZvLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCA6IHdpZHRoO1xuXG5cdFx0XHRpZiAodGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zdWdnZXN0KS5maXRXaWR0aFRvRGV0YWlscyAmJiB0aGlzLl9jb21wbGV0aW9uTW9kZWwgJiYgIXRoaXMuX3BlcnNpc3RlZFNpemUucmVzdG9yZSgpKSB7XG5cdFx0XHRcdC8vIEdyb3cgdG8gZml0IHRoZSBpbmxpbmUgZGV0YWlsIHRleHQsIGNhcHBlZCBhdCB0aGUgZWRpdG9yIHdpZGdldCdzIHdpZHRoLiBSZXNwZWN0cyBhIHVzZXItZHJhZ2dlZCBzaXplLlxuXHRcdFx0XHRjb25zdCBjYXAgPSBNYXRoLm1pbihtYXhXaWR0aCwgdGhpcy5lZGl0b3IuZ2V0TGF5b3V0SW5mbygpLndpZHRoKTtcblx0XHRcdFx0Y29uc3QgZml0V2lkdGggPSBNYXRoLm1pbihjYXAsIHRoaXMuX21lYXN1cmVDb250ZW50V2lkdGgoaW5mbykpO1xuXHRcdFx0XHR3aWR0aCA9IE1hdGgubWF4KHdpZHRoLCBmaXRXaWR0aCk7XG5cdFx0XHRcdHByZWZlcnJlZFdpZHRoID0gTWF0aC5tYXgocHJlZmVycmVkV2lkdGgsIGZpdFdpZHRoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gaGVpZ2h0IG1hdGhcblx0XHRcdGNvbnN0IGZ1bGxIZWlnaHQgPSBpbmZvLnN0YXR1c0JhckhlaWdodCArIHRoaXMuX2xpc3QuY29udGVudEhlaWdodCArIGluZm8uYm9yZGVySGVpZ2h0O1xuXHRcdFx0Y29uc3QgbWluSGVpZ2h0ID0gaW5mby5pdGVtSGVpZ2h0ICsgaW5mby5zdGF0dXNCYXJIZWlnaHQ7XG5cdFx0XHRjb25zdCBlZGl0b3JCb3ggPSBkb20uZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbih0aGlzLmVkaXRvci5nZXREb21Ob2RlKCkpO1xuXHRcdFx0Y29uc3QgY3Vyc29yQm94ID0gdGhpcy5lZGl0b3IuZ2V0U2Nyb2xsZWRWaXNpYmxlUG9zaXRpb24odGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKSk7XG5cdFx0XHRjb25zdCBjdXJzb3JCb3R0b20gPSBlZGl0b3JCb3gudG9wICsgY3Vyc29yQm94LnRvcCArIGN1cnNvckJveC5oZWlnaHQ7XG5cdFx0XHRjb25zdCBtYXhIZWlnaHRCZWxvdyA9IE1hdGgubWluKGJvZHlCb3guaGVpZ2h0IC0gY3Vyc29yQm90dG9tIC0gaW5mby52ZXJ0aWNhbFBhZGRpbmcsIGZ1bGxIZWlnaHQpO1xuXHRcdFx0Y29uc3QgYXZhaWxhYmxlU3BhY2VBYm92ZSA9IGVkaXRvckJveC50b3AgKyBjdXJzb3JCb3gudG9wIC0gaW5mby52ZXJ0aWNhbFBhZGRpbmc7XG5cdFx0XHRjb25zdCBtYXhIZWlnaHRBYm92ZSA9IE1hdGgubWluKGF2YWlsYWJsZVNwYWNlQWJvdmUsIGZ1bGxIZWlnaHQpO1xuXHRcdFx0bGV0IG1heEhlaWdodCA9IE1hdGgubWluKE1hdGgubWF4KG1heEhlaWdodEFib3ZlLCBtYXhIZWlnaHRCZWxvdykgKyBpbmZvLmJvcmRlckhlaWdodCwgZnVsbEhlaWdodCk7XG5cblx0XHRcdGlmIChoZWlnaHQgPT09IHRoaXMuX2NhcHBlZEhlaWdodD8uY2FwcGVkKSB7XG5cdFx0XHRcdC8vIFJlc3RvcmUgdGhlIG9sZCAod2FudGVkKSBoZWlnaHQgd2hlbiB0aGUgY3VycmVudFxuXHRcdFx0XHQvLyBoZWlnaHQgaXMgY2FwcGVkIHRvIGZpdFxuXHRcdFx0XHRoZWlnaHQgPSB0aGlzLl9jYXBwZWRIZWlnaHQud2FudGVkO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaGVpZ2h0IDwgbWluSGVpZ2h0KSB7XG5cdFx0XHRcdGhlaWdodCA9IG1pbkhlaWdodDtcblx0XHRcdH1cblx0XHRcdGlmIChoZWlnaHQgPiBtYXhIZWlnaHQpIHtcblx0XHRcdFx0aGVpZ2h0ID0gbWF4SGVpZ2h0O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmb3JjZVJlbmRlcmluZ0Fib3ZlUmVxdWlyZWRTcGFjZSA9IDE1MDtcblx0XHRcdGlmICgoaGVpZ2h0ID4gbWF4SGVpZ2h0QmVsb3cgJiYgbWF4SGVpZ2h0QWJvdmUgPiBtYXhIZWlnaHRCZWxvdykgfHwgKHRoaXMuX2ZvcmNlUmVuZGVyaW5nQWJvdmUgJiYgYXZhaWxhYmxlU3BhY2VBYm92ZSA+IGZvcmNlUmVuZGVyaW5nQWJvdmVSZXF1aXJlZFNwYWNlKSkge1xuXHRcdFx0XHR0aGlzLl9jb250ZW50V2lkZ2V0LnNldFByZWZlcmVuY2UoQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5BQk9WRSk7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5lbmFibGVTYXNoZXModHJ1ZSwgdHJ1ZSwgZmFsc2UsIGZhbHNlKTtcblx0XHRcdFx0bWF4SGVpZ2h0ID0gbWF4SGVpZ2h0QWJvdmU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9jb250ZW50V2lkZ2V0LnNldFByZWZlcmVuY2UoQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5CRUxPVyk7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5lbmFibGVTYXNoZXMoZmFsc2UsIHRydWUsIHRydWUsIGZhbHNlKTtcblx0XHRcdFx0bWF4SGVpZ2h0ID0gbWF4SGVpZ2h0QmVsb3c7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmVsZW1lbnQucHJlZmVycmVkU2l6ZSA9IG5ldyBkb20uRGltZW5zaW9uKHByZWZlcnJlZFdpZHRoLCBpbmZvLmRlZmF1bHRTaXplLmhlaWdodCk7XG5cdFx0XHR0aGlzLmVsZW1lbnQubWF4U2l6ZSA9IG5ldyBkb20uRGltZW5zaW9uKG1heFdpZHRoLCBtYXhIZWlnaHQpO1xuXHRcdFx0dGhpcy5lbGVtZW50Lm1pblNpemUgPSBuZXcgZG9tLkRpbWVuc2lvbigyMjAsIG1pbkhlaWdodCk7XG5cblx0XHRcdC8vIEtub3cgd2hlbiB0aGUgaGVpZ2h0IHdhcyBjYXBwZWQgdG8gZml0IGFuZCByZW1lbWJlclxuXHRcdFx0Ly8gdGhlIHdhbnRlZCBoZWlnaHQgZm9yIGxhdGVyLiBUaGlzIGlzIHJlcXVpcmVkIHdoZW4gZ29pbmdcblx0XHRcdC8vIGxlZnQgdG8gd2lkZW4gc3VnZ2VzdGlvbnMuXG5cdFx0XHR0aGlzLl9jYXBwZWRIZWlnaHQgPSBoZWlnaHQgPT09IGZ1bGxIZWlnaHRcblx0XHRcdFx0PyB7IHdhbnRlZDogdGhpcy5fY2FwcGVkSGVpZ2h0Py53YW50ZWQgPz8gc2l6ZS5oZWlnaHQsIGNhcHBlZDogaGVpZ2h0IH1cblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX3Jlc2l6ZSh3aWR0aCwgaGVpZ2h0KTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc2l6ZSh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXG5cdFx0Y29uc3QgeyB3aWR0aDogbWF4V2lkdGgsIGhlaWdodDogbWF4SGVpZ2h0IH0gPSB0aGlzLmVsZW1lbnQubWF4U2l6ZTtcblx0XHR3aWR0aCA9IE1hdGgubWluKG1heFdpZHRoLCB3aWR0aCk7XG5cdFx0aGVpZ2h0ID0gTWF0aC5taW4obWF4SGVpZ2h0LCBoZWlnaHQpO1xuXG5cdFx0Y29uc3QgeyBzdGF0dXNCYXJIZWlnaHQgfSA9IHRoaXMuZ2V0TGF5b3V0SW5mbygpO1xuXHRcdHRoaXMuX2xpc3QubGF5b3V0KGhlaWdodCAtIHN0YXR1c0JhckhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMuX2xpc3RFbGVtZW50LnN0eWxlLmhlaWdodCA9IGAke2hlaWdodCAtIHN0YXR1c0JhckhlaWdodH1weGA7XG5cdFx0dGhpcy5lbGVtZW50LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLl9jb250ZW50V2lkZ2V0LmxheW91dCgpO1xuXG5cdFx0dGhpcy5fcG9zaXRpb25EZXRhaWxzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9wb3NpdGlvbkRldGFpbHMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzRGV0YWlsc1Zpc2libGUoKSkge1xuXHRcdFx0dGhpcy5fZGV0YWlscy5wbGFjZUF0QW5jaG9yKHRoaXMuZWxlbWVudC5kb21Ob2RlLCB0aGlzLl9jb250ZW50V2lkZ2V0LmdldFBvc2l0aW9uKCk/LnByZWZlcmVuY2VbMF0gPT09IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQkVMT1cpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBNZWFzdXJlcyB0aGUgcGl4ZWwgd2lkdGggbmVlZGVkIHRvIHNob3cgdGhlIHdpZGVzdCBpdGVtJ3MgbGFiZWwgdG9nZXRoZXIgd2l0aFxuXHQgKiBpdHMgaW5saW5lIGRldGFpbCB0ZXh0IChzaWduYXR1cmUgKyBkZXNjcmlwdGlvbiksIHBsdXMgdGhlIHN1cnJvdW5kaW5nIGNocm9tZVxuXHQgKiAoaWNvbiwgaW50ZXItY29sdW1uIGdhcCwgcmVhZC1tb3JlIGFmZm9yZGFuY2UsIHBhZGRpbmcgYW5kIHNjcm9sbGJhcikuIENhY2hlZFxuXHQgKiBwZXIgY29tcGxldGlvbiBtb2RlbC5cblx0ICovXG5cdHByaXZhdGUgX21lYXN1cmVDb250ZW50V2lkdGgoaW5mbzogUmV0dXJuVHlwZTxTdWdnZXN0V2lkZ2V0WydnZXRMYXlvdXRJbmZvJ10+KTogbnVtYmVyIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2NvbXBsZXRpb25Nb2RlbDtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2ZpdENvbnRlbnRXaWR0aD8ubW9kZWwgPT09IG1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZml0Q29udGVudFdpZHRoLndpZHRoO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9tZWFzdXJlQ29udGV4dCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9tZWFzdXJlQ29udGV4dCA9IGRvbS4kPEhUTUxDYW52YXNFbGVtZW50PignY2FudmFzJykuZ2V0Q29udGV4dCgnMmQnKTtcblx0XHR9XG5cblx0XHRsZXQgbWF4VGV4dFdpZHRoOiBudW1iZXI7XG5cdFx0aWYgKHRoaXMuX21lYXN1cmVDb250ZXh0KSB7XG5cdFx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9ucygpO1xuXHRcdFx0Y29uc3QgZm9udEluZm8gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRcdFx0Y29uc3QgZm9udFNpemUgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uc3VnZ2VzdEZvbnRTaXplKSB8fCBmb250SW5mby5mb250U2l6ZTtcblx0XHRcdHRoaXMuX21lYXN1cmVDb250ZXh0LmZvbnQgPSBgJHtmb250SW5mby5mb250V2VpZ2h0fSAke2ZvbnRTaXplfXB4ICR7Zm9udEluZm8uZ2V0TWFzc2FnZWRGb250RmFtaWx5KCl9YDtcblx0XHRcdG1heFRleHRXaWR0aCA9IDA7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgbW9kZWwuaXRlbXMpIHtcblx0XHRcdFx0Y29uc3QgeyBjb21wbGV0aW9uIH0gPSBpdGVtO1xuXHRcdFx0XHRsZXQgdGV4dCA9IGl0ZW0udGV4dExhYmVsO1xuXHRcdFx0XHRpZiAodHlwZW9mIGNvbXBsZXRpb24ubGFiZWwgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0dGV4dCArPSBjb21wbGV0aW9uLmRldGFpbCA/PyAnJztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0ZXh0ICs9IChjb21wbGV0aW9uLmxhYmVsLmRldGFpbCA/PyAnJykgKyAoY29tcGxldGlvbi5sYWJlbC5kZXNjcmlwdGlvbiA/PyAnJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bWF4VGV4dFdpZHRoID0gTWF0aC5tYXgobWF4VGV4dFdpZHRoLCB0aGlzLl9tZWFzdXJlQ29udGV4dC5tZWFzdXJlVGV4dCh0ZXh0KS53aWR0aCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIENhbnZhcyBpcyB1bmF2YWlsYWJsZSAoZS5nLiBzb21lIHRlc3QgZW52aXJvbm1lbnRzKTogZmFsbCBiYWNrIHRvIGEgY2hhci1jb3VudCBlc3RpbWF0ZS5cblx0XHRcdG1heFRleHRXaWR0aCA9IG1vZGVsLnN0YXRzLnBMYWJlbExlbiAqIGluZm8udHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoO1xuXHRcdH1cblxuXHRcdC8vIENocm9tZSBhcm91bmQgdGhlIHRleHQ6IGljb24sIHJlYWQtbW9yZSBhZmZvcmRhbmNlLCBpbnRlci1jb2x1bW4gZ2FwLCBob3Jpem9udGFsIHBhZGRpbmcgYW5kIHNjcm9sbGJhci5cblx0XHRjb25zdCBjaHJvbWUgPSAyICogaW5mby5pdGVtSGVpZ2h0ICsgMiAqIGluZm8uaG9yaXpvbnRhbFBhZGRpbmcgKyAyMDtcblx0XHRjb25zdCB3aWR0aCA9IG1heFRleHRXaWR0aCArIGNocm9tZTtcblx0XHR0aGlzLl9maXRDb250ZW50V2lkdGggPSB7IG1vZGVsLCB3aWR0aCB9O1xuXHRcdHJldHVybiB3aWR0aDtcblx0fVxuXG5cdGdldExheW91dEluZm8oKSB7XG5cdFx0Y29uc3QgZm9udEluZm8gPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblx0XHRjb25zdCBpdGVtSGVpZ2h0ID0gY2xhbXAodGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zdWdnZXN0TGluZUhlaWdodCkgfHwgZm9udEluZm8ubGluZUhlaWdodCwgOCwgMTAwMCk7XG5cdFx0Y29uc3Qgc3RhdHVzQmFySGVpZ2h0ID0gIXRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc3VnZ2VzdCkuc2hvd1N0YXR1c0JhciB8fCB0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuRW1wdHkgfHwgdGhpcy5fc3RhdGUgPT09IFN0YXRlLkxvYWRpbmcgPyAwIDogaXRlbUhlaWdodDtcblx0XHRjb25zdCBib3JkZXJXaWR0aCA9IHRoaXMuX2RldGFpbHMud2lkZ2V0LmdldExheW91dEluZm8oKS5ib3JkZXJXaWR0aDtcblx0XHRjb25zdCBib3JkZXJIZWlnaHQgPSAyICogYm9yZGVyV2lkdGg7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aXRlbUhlaWdodCxcblx0XHRcdHN0YXR1c0JhckhlaWdodCxcblx0XHRcdGJvcmRlcldpZHRoLFxuXHRcdFx0Ym9yZGVySGVpZ2h0LFxuXHRcdFx0dHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiBmb250SW5mby50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGgsXG5cdFx0XHR2ZXJ0aWNhbFBhZGRpbmc6IDIyLFxuXHRcdFx0aG9yaXpvbnRhbFBhZGRpbmc6IDE0LFxuXHRcdFx0ZGVmYXVsdFNpemU6IG5ldyBkb20uRGltZW5zaW9uKDQzMCwgc3RhdHVzQmFySGVpZ2h0ICsgMTIgKiBpdGVtSGVpZ2h0KVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9pc0RldGFpbHNWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKCdleHBhbmRTdWdnZXN0aW9uRG9jcycsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXREZXRhaWxzVmlzaWJsZSh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdleHBhbmRTdWdnZXN0aW9uRG9jcycsIHZhbHVlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdGZvcmNlUmVuZGVyaW5nQWJvdmUoKSB7XG5cdFx0aWYgKCF0aGlzLl9mb3JjZVJlbmRlcmluZ0Fib3ZlKSB7XG5cdFx0XHR0aGlzLl9mb3JjZVJlbmRlcmluZ0Fib3ZlID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2xheW91dCh0aGlzLl9wZXJzaXN0ZWRTaXplLnJlc3RvcmUoKSk7XG5cdFx0fVxuXHR9XG5cblx0c3RvcEZvcmNlUmVuZGVyaW5nQWJvdmUoKSB7XG5cdFx0dGhpcy5fZm9yY2VSZW5kZXJpbmdBYm92ZSA9IGZhbHNlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTdWdnZXN0Q29udGVudFdpZGdldCBpbXBsZW1lbnRzIElDb250ZW50V2lkZ2V0IHtcblxuXHRyZWFkb25seSBhbGxvd0VkaXRvck92ZXJmbG93ID0gdHJ1ZTtcblx0cmVhZG9ubHkgc3VwcHJlc3NNb3VzZURvd24gPSBmYWxzZTtcblxuXHRwcml2YXRlIF9wb3NpdGlvbj86IElQb3NpdGlvbiB8IG51bGw7XG5cdHByaXZhdGUgX3ByZWZlcmVuY2U/OiBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlO1xuXHRwcml2YXRlIF9wcmVmZXJlbmNlTG9ja2VkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBfYWRkZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfaGlkZGVuOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfd2lkZ2V0OiBTdWdnZXN0V2lkZ2V0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3Jcblx0KSB7IH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9hZGRlZCkge1xuXHRcdFx0dGhpcy5fYWRkZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2VkaXRvci5yZW1vdmVDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdH1cblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICdlZGl0b3Iud2lkZ2V0LnN1Z2dlc3RXaWRnZXQnO1xuXHR9XG5cblx0Z2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldC5lbGVtZW50LmRvbU5vZGU7XG5cdH1cblxuXHRzaG93KCk6IHZvaWQge1xuXHRcdHRoaXMuX2hpZGRlbiA9IGZhbHNlO1xuXHRcdGlmICghdGhpcy5fYWRkZWQpIHtcblx0XHRcdHRoaXMuX2FkZGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2VkaXRvci5hZGRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdH1cblx0fVxuXG5cdGhpZGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9oaWRkZW4pIHtcblx0XHRcdHRoaXMuX2hpZGRlbiA9IHRydWU7XG5cdFx0XHR0aGlzLmxheW91dCgpO1xuXHRcdH1cblx0fVxuXG5cdGxheW91dCgpOiB2b2lkIHtcblx0XHR0aGlzLl9lZGl0b3IubGF5b3V0Q29udGVudFdpZGdldCh0aGlzKTtcblx0fVxuXG5cdGdldFBvc2l0aW9uKCk6IElDb250ZW50V2lkZ2V0UG9zaXRpb24gfCBudWxsIHtcblx0XHRpZiAodGhpcy5faGlkZGVuIHx8ICF0aGlzLl9wb3NpdGlvbiB8fCAhdGhpcy5fcHJlZmVyZW5jZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRwb3NpdGlvbjogdGhpcy5fcG9zaXRpb24sXG5cdFx0XHRwcmVmZXJlbmNlOiBbdGhpcy5fcHJlZmVyZW5jZV1cblx0XHR9O1xuXHR9XG5cblx0YmVmb3JlUmVuZGVyKCkge1xuXHRcdGNvbnN0IHsgaGVpZ2h0LCB3aWR0aCB9ID0gdGhpcy5fd2lkZ2V0LmVsZW1lbnQuc2l6ZTtcblx0XHRjb25zdCB7IGJvcmRlcldpZHRoLCBob3Jpem9udGFsUGFkZGluZyB9ID0gdGhpcy5fd2lkZ2V0LmdldExheW91dEluZm8oKTtcblx0XHRyZXR1cm4gbmV3IGRvbS5EaW1lbnNpb24od2lkdGggKyAyICogYm9yZGVyV2lkdGggKyBob3Jpem9udGFsUGFkZGluZywgaGVpZ2h0ICsgMiAqIGJvcmRlcldpZHRoKTtcblx0fVxuXG5cdGFmdGVyUmVuZGVyKHBvc2l0aW9uOiBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlIHwgbnVsbCkge1xuXHRcdHRoaXMuX3dpZGdldC5fYWZ0ZXJSZW5kZXIocG9zaXRpb24pO1xuXHR9XG5cblx0c2V0UHJlZmVyZW5jZShwcmVmZXJlbmNlOiBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlKSB7XG5cdFx0aWYgKCF0aGlzLl9wcmVmZXJlbmNlTG9ja2VkKSB7XG5cdFx0XHR0aGlzLl9wcmVmZXJlbmNlID0gcHJlZmVyZW5jZTtcblx0XHR9XG5cdH1cblxuXHRsb2NrUHJlZmVyZW5jZSgpIHtcblx0XHR0aGlzLl9wcmVmZXJlbmNlTG9ja2VkID0gdHJ1ZTtcblx0fVxuXG5cdHVubG9ja1ByZWZlcmVuY2UoKSB7XG5cdFx0dGhpcy5fcHJlZmVyZW5jZUxvY2tlZCA9IGZhbHNlO1xuXHR9XG5cblx0c2V0UG9zaXRpb24ocG9zaXRpb246IElQb3NpdGlvbiB8IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLl9wb3NpdGlvbiA9IHBvc2l0aW9uO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUVyQixPQUFPO0FBRVAsU0FBUyxZQUFZO0FBQ3JCLFNBQTRCLHlCQUF5QixtQkFBbUIsb0JBQW9CO0FBQzVGLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBZ0Isd0JBQXdCO0FBQ2pELFNBQVMsaUJBQThCLHlCQUF5QjtBQUNoRSxTQUFTLGFBQWE7QUFDdEIsWUFBWSxhQUFhO0FBQ3pCLE9BQU87QUFDUCxTQUFTLHVDQUErRztBQUN4SCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLDJCQUEyQjtBQUNwQyxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHNCQUFzQixrQkFBa0Isd0JBQXdCLG9CQUFvQiw4QkFBOEIseUJBQXlCLCtCQUErQiwrQkFBK0IsbUNBQW1DLGVBQWUsbUJBQW1CO0FBQ3ZSLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQXlCLFdBQVcsZ0JBQWdCLGtDQUFrQztBQUN0RixTQUFTLHlCQUF5Qix1QkFBdUIsNEJBQTRCO0FBQ3JGLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsY0FBYztBQUN2QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGlCQUFpQjtBQUsxQixNQUFNLGdDQUFnQyxjQUFjLGtDQUFrQyx3QkFBd0IsSUFBSSxTQUFTLGlDQUFpQyx5Q0FBeUMsQ0FBQztBQUN0TSxjQUFjLDhCQUE4QixvQkFBb0IsSUFBSSxTQUFTLDZCQUE2QixxQ0FBcUMsQ0FBQztBQUN6SSxNQUFNLGdDQUFnQyxjQUFjLGtDQUFrQyxrQkFBa0IsSUFBSSxTQUFTLGlDQUFpQyx5Q0FBeUMsQ0FBQztBQUN2TSxNQUFNLHdDQUF3QyxjQUFjLDBDQUEwQyxFQUFFLE1BQU0sK0JBQStCLE9BQU8sK0JBQStCLFFBQVEsK0JBQStCLFNBQVMsOEJBQThCLEdBQUcsSUFBSSxTQUFTLHlDQUF5QywrREFBK0QsQ0FBQztBQUMxWCxjQUFjLDhDQUE4QyxFQUFFLE1BQU0sbUNBQW1DLE9BQU8sbUNBQW1DLFFBQVEsK0JBQStCLFNBQVMsOEJBQThCLEdBQUcsSUFBSSxTQUFTLDZDQUE2QyxvRUFBb0UsQ0FBQztBQUMxVixNQUFNLHdDQUF3QyxjQUFjLDBDQUEwQyxFQUFFLE1BQU0sK0JBQStCLE9BQU8sK0JBQStCLFFBQVEsK0JBQStCLFNBQVMsOEJBQThCLEdBQUcsSUFBSSxTQUFTLHlDQUF5QywrREFBK0QsQ0FBQztBQUMxWCxNQUFNLGtDQUFrQyxjQUFjLG9DQUFvQyxzQkFBc0IsSUFBSSxTQUFTLG1DQUFtQyxnRkFBZ0YsQ0FBQztBQUN4UCxjQUFjLDJDQUEyQyx5QkFBeUIsSUFBSSxTQUFTLDBDQUEwQyxzREFBc0QsQ0FBQztBQUNoTSxjQUFjLGdEQUFnRCxFQUFFLE1BQU0sOEJBQThCLE9BQU8sOEJBQThCLFFBQVEsdUNBQXVDLFNBQVMsc0NBQXNDLEdBQUcsSUFBSSxTQUFTLCtDQUErQyw4RUFBOEUsQ0FBQztBQUNyWCxjQUFjLHdDQUF3QyxZQUFZLCtCQUErQixHQUFFLEdBQUcsSUFBSSxTQUFTLHVDQUF1QyxnREFBZ0QsQ0FBQztBQUUzTSxJQUFXLFFBQVgsa0JBQVdBLFdBQVg7QUFDQyxFQUFBQSxjQUFBO0FBQ0EsRUFBQUEsY0FBQTtBQUNBLEVBQUFBLGNBQUE7QUFDQSxFQUFBQSxjQUFBO0FBQ0EsRUFBQUEsY0FBQTtBQUNBLEVBQUFBLGNBQUE7QUFDQSxFQUFBQSxjQUFBO0FBUFUsU0FBQUE7QUFBQSxHQUFBO0FBZ0JYLE1BQU0sb0JBQW9CO0FBQUEsRUFJekIsWUFDa0IsVUFDakIsUUFDQztBQUZnQjtBQUdqQixTQUFLLE9BQU8sc0JBQXNCLE9BQU8sY0FBYyxDQUFDLElBQUksa0JBQWtCLHdCQUF3QjtBQUFBLEVBQ3ZHO0FBQUEsRUFFQSxVQUFxQztBQUNwQyxVQUFNLE1BQU0sS0FBSyxTQUFTLElBQUksS0FBSyxNQUFNLGFBQWEsT0FBTyxLQUFLO0FBQ2xFLFFBQUk7QUFDSCxZQUFNLE1BQU0sS0FBSyxNQUFNLEdBQUc7QUFDMUIsVUFBSSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUc7QUFDMUIsZUFBTyxJQUFJLFVBQVUsS0FBSyxHQUFHO0FBQUEsTUFDOUI7QUFBQSxJQUNELFFBQVE7QUFBQSxJQUVSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0sTUFBcUI7QUFDMUIsU0FBSyxTQUFTLE1BQU0sS0FBSyxNQUFNLEtBQUssVUFBVSxJQUFJLEdBQUcsYUFBYSxTQUFTLGNBQWMsT0FBTztBQUFBLEVBQ2pHO0FBQUEsRUFFQSxRQUFjO0FBQ2IsU0FBSyxTQUFTLE9BQU8sS0FBSyxNQUFNLGFBQWEsT0FBTztBQUFBLEVBQ3JEO0FBQ0Q7QUFFTyxJQUFNLGdCQUFOLE1BQTJDO0FBQUEsRUFvRGpELFlBQ2tCLFFBQ2lCLGlCQUNkLG9CQUNMLGVBQ1Esc0JBQ3RCO0FBTGdCO0FBQ2lCO0FBakRuQyxTQUFRLFNBQWdCO0FBQ3hCLFNBQVEsVUFBbUI7QUFDM0IsU0FBaUIsa0JBQWtCLElBQUksa0JBQWtCO0FBQ3pELFNBQWlCLGlCQUFpQixJQUFJLGtCQUFrQjtBQUN4RCxTQUFpQixzQkFBc0IsSUFBSSxrQkFBa0I7QUFHN0QsU0FBUSxxQkFBOEI7QUFHdEMsU0FBUSx1QkFBZ0M7QUFDeEMsU0FBUSxlQUF3QjtBQW1CaEMsU0FBaUIsZUFBZSxJQUFJLGFBQWE7QUFDakQsU0FBaUIsZUFBZSxJQUFJLGdCQUFnQjtBQUdwRCxTQUFpQixlQUFlLElBQUksaUJBQXNDO0FBQzFFLFNBQWlCLGNBQWMsSUFBSSxpQkFBc0M7QUFDekUsU0FBaUIsYUFBYSxJQUFJLFFBQWM7QUFDaEQsU0FBaUIsYUFBYSxJQUFJLFFBQWM7QUFFaEQsU0FBUyxjQUEwQyxLQUFLLGFBQWE7QUFDckUsU0FBUyxhQUF5QyxLQUFLLFlBQVk7QUFDbkUsU0FBUyxZQUF5QixLQUFLLFdBQVc7QUFDbEQsU0FBUyxZQUF5QixLQUFLLFdBQVc7QUFFbEQsU0FBaUIsb0JBQW9CLElBQUksUUFBd0I7QUFDakUsU0FBUyxtQkFBMEMsS0FBSyxrQkFBa0I7QUFTekUsU0FBSyxVQUFVLElBQUkscUJBQXFCO0FBQ3hDLFNBQUssUUFBUSxRQUFRLFVBQVUsSUFBSSxpQkFBaUIsZ0JBQWdCO0FBRXBFLFNBQUssaUJBQWlCLElBQUkscUJBQXFCLE1BQU0sTUFBTTtBQUMzRCxTQUFLLGlCQUFpQixJQUFJLG9CQUFvQixpQkFBaUIsTUFBTTtBQUFBLElBRXJFLE1BQU0sWUFBWTtBQUFBLE1BQ2pCLFlBQ1UsZUFDQSxhQUNGLGdCQUFnQixPQUNoQixlQUFlLE9BQ3JCO0FBSlE7QUFDQTtBQUNGO0FBQ0E7QUFBQSxNQUNKO0FBQUEsSUFDTDtBQUVBLFFBQUk7QUFDSixTQUFLLGFBQWEsSUFBSSxLQUFLLFFBQVEsZ0JBQWdCLE1BQU07QUFDeEQsV0FBSyxlQUFlLGVBQWU7QUFDbkMsY0FBUSxJQUFJLFlBQVksS0FBSyxlQUFlLFFBQVEsR0FBRyxLQUFLLFFBQVEsSUFBSTtBQUFBLElBQ3pFLENBQUMsQ0FBQztBQUNGLFNBQUssYUFBYSxJQUFJLEtBQUssUUFBUSxZQUFZLE9BQUs7QUFFbkQsV0FBSyxRQUFRLEVBQUUsVUFBVSxPQUFPLEVBQUUsVUFBVSxNQUFNO0FBRWxELFVBQUksT0FBTztBQUNWLGNBQU0sZ0JBQWdCLE1BQU0saUJBQWlCLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDLEVBQUU7QUFDOUQsY0FBTSxlQUFlLE1BQU0sZ0JBQWdCLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLEVBQUU7QUFBQSxNQUM1RDtBQUVBLFVBQUksQ0FBQyxFQUFFLE1BQU07QUFDWjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLE9BQU87QUFHVixjQUFNLEVBQUUsWUFBWSxZQUFZLElBQUksS0FBSyxjQUFjO0FBQ3ZELGNBQU0sWUFBWSxLQUFLLE1BQU0sYUFBYSxDQUFDO0FBQzNDLFlBQUksRUFBRSxPQUFPLE9BQU8sSUFBSSxLQUFLLFFBQVE7QUFDckMsWUFBSSxDQUFDLE1BQU0saUJBQWlCLEtBQUssSUFBSSxNQUFNLFlBQVksU0FBUyxNQUFNLEtBQUssV0FBVztBQUNyRixtQkFBUyxNQUFNLGVBQWUsVUFBVSxZQUFZO0FBQUEsUUFDckQ7QUFDQSxZQUFJLENBQUMsTUFBTSxnQkFBZ0IsS0FBSyxJQUFJLE1BQU0sWUFBWSxRQUFRLEtBQUssS0FBSyxXQUFXO0FBQ2xGLGtCQUFRLE1BQU0sZUFBZSxTQUFTLFlBQVk7QUFBQSxRQUNuRDtBQUNBLGFBQUssZUFBZSxNQUFNLElBQUksSUFBSSxVQUFVLE9BQU8sTUFBTSxDQUFDO0FBQUEsTUFDM0Q7QUFHQSxXQUFLLGVBQWUsaUJBQWlCO0FBQ3JDLGNBQVE7QUFBQSxJQUNULENBQUMsQ0FBQztBQUVGLFNBQUssa0JBQWtCLElBQUksT0FBTyxLQUFLLFFBQVEsU0FBUyxJQUFJLEVBQUUsVUFBVSxDQUFDO0FBQ3pFLFNBQUssZUFBZSxJQUFJLE9BQU8sS0FBSyxRQUFRLFNBQVMsSUFBSSxFQUFFLE9BQU8sQ0FBQztBQUVuRSxVQUFNLFVBQVUsS0FBSyxhQUFhLElBQUkscUJBQXFCLGVBQWUsc0JBQXNCLEtBQUssTUFBTSxDQUFDO0FBQzVHLFlBQVEsV0FBVyxNQUFNLEtBQUssY0FBYyxHQUFHLE1BQU0sS0FBSyxZQUFZO0FBQ3RFLFNBQUssV0FBVyxJQUFJLHNCQUFzQixTQUFTLEtBQUssTUFBTTtBQUU5RCxVQUFNLGlCQUFpQixNQUFNLEtBQUssUUFBUSxRQUFRLFVBQVUsT0FBTyxZQUFZLENBQUMsS0FBSyxPQUFPLFVBQVUsYUFBYSxPQUFPLEVBQUUsU0FBUztBQUNySSxtQkFBZTtBQUVmLFVBQU0scUJBQXFCLE1BQU0sS0FBSyxRQUFRLFFBQVEsVUFBVSxPQUFPLHdCQUF3QixLQUFLLE9BQU8sVUFBVSxhQUFhLE9BQU8sRUFBRSxpQkFBaUI7QUFDNUosdUJBQW1CO0FBRW5CLFVBQU0sV0FBVyxxQkFBcUIsZUFBZSxjQUFjLEtBQUssTUFBTTtBQUM5RSxTQUFLLGFBQWEsSUFBSSxRQUFRO0FBQzlCLFNBQUssYUFBYSxJQUFJLFNBQVMsbUJBQW1CLE1BQU0sS0FBSyxjQUFjLENBQUMsQ0FBQztBQUU3RSxTQUFLLFFBQVEsSUFBSSxLQUFLLGlCQUFpQixLQUFLLGNBQWM7QUFBQSxNQUN6RCxXQUFXLENBQUMsYUFBcUMsS0FBSyxjQUFjLEVBQUU7QUFBQSxNQUN0RSxlQUFlLENBQUMsYUFBcUM7QUFBQSxJQUN0RCxHQUFHLENBQUMsUUFBUSxHQUFHO0FBQUEsTUFDZCx5QkFBeUI7QUFBQSxNQUN6QixZQUFZO0FBQUEsTUFDWixjQUFjO0FBQUEsTUFDZCwwQkFBMEI7QUFBQSxNQUMxQix1QkFBdUI7QUFBQSxRQUN0QixTQUFTLE1BQU0sWUFBWSxhQUFhO0FBQUEsUUFDeEMsb0JBQW9CLE1BQU0sSUFBSSxTQUFTLFdBQVcsU0FBUztBQUFBLFFBQzNELGVBQWUsTUFBTTtBQUFBLFFBQ3JCLGNBQWMsQ0FBQyxTQUF5QjtBQUV2QyxjQUFJLFFBQVEsS0FBSztBQUNqQixnQkFBTSxZQUFZLG9CQUFvQixRQUFRLEtBQUssV0FBVyxJQUFJO0FBQ2xFLGNBQUksT0FBTyxLQUFLLFdBQVcsVUFBVSxVQUFVO0FBQzlDLGtCQUFNLEVBQUUsUUFBQUMsU0FBUSxZQUFZLElBQUksS0FBSyxXQUFXO0FBQ2hELGdCQUFJQSxXQUFVLGFBQWE7QUFDMUIsc0JBQVEsSUFBSSxTQUFTLGNBQWMscUJBQXFCLE9BQU9BLFNBQVEsYUFBYSxTQUFTO0FBQUEsWUFDOUYsV0FBV0EsU0FBUTtBQUNsQixzQkFBUSxJQUFJLFNBQVMsZ0JBQWdCLGdCQUFnQixPQUFPQSxTQUFRLFNBQVM7QUFBQSxZQUM5RSxXQUFXLGFBQWE7QUFDdkIsc0JBQVEsSUFBSSxTQUFTLGNBQWMsaUJBQWlCLE9BQU8sYUFBYSxTQUFTO0FBQUEsWUFDbEY7QUFBQSxVQUNELE9BQU87QUFDTixvQkFBUSxJQUFJLFNBQVMsU0FBUyxZQUFZLE9BQU8sU0FBUztBQUFBLFVBQzNEO0FBQ0EsY0FBSSxDQUFDLEtBQUssY0FBYyxDQUFDLEtBQUssa0JBQWtCLEdBQUc7QUFDbEQsbUJBQU87QUFBQSxVQUNSO0FBRUEsZ0JBQU0sRUFBRSxlQUFlLE9BQU8sSUFBSSxLQUFLO0FBQ3ZDLGdCQUFNLE9BQU8sUUFBUTtBQUFBLFlBQ3BCO0FBQUEsWUFDQSxVQUFVO0FBQUEsWUFDVixnQkFBaUIsT0FBTyxrQkFBa0IsV0FBVyxnQkFBZ0IsY0FBYyxRQUFTO0FBQUEsVUFBRTtBQUUvRixpQkFBTyxJQUFJLFNBQVMscUNBQXFDLGtCQUFrQixPQUFPLElBQUk7QUFBQSxRQUN2RjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFDRCxTQUFLLE1BQU0sTUFBTSxjQUFjO0FBQUEsTUFDOUIsNkJBQTZCO0FBQUEsTUFDN0IsMEJBQTBCO0FBQUEsSUFDM0IsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLHFCQUFxQixlQUFlLHFCQUFxQixLQUFLLFFBQVEsU0FBUyw0QkFBNEIsTUFBUztBQUNuSSxVQUFNLHNCQUFzQixNQUFNLEtBQUssUUFBUSxRQUFRLFVBQVUsT0FBTyxtQkFBbUIsS0FBSyxPQUFPLFVBQVUsYUFBYSxPQUFPLEVBQUUsYUFBYTtBQUNwSix3QkFBb0I7QUFFcEIsU0FBSyxhQUFhLElBQUksS0FBSyxNQUFNLFlBQVksT0FBSyxLQUFLLHNCQUFzQixDQUFDLENBQUMsQ0FBQztBQUNoRixTQUFLLGFBQWEsSUFBSSxLQUFLLE1BQU0sTUFBTSxPQUFLLEtBQUssc0JBQXNCLENBQUMsQ0FBQyxDQUFDO0FBQzFFLFNBQUssYUFBYSxJQUFJLEtBQUssTUFBTSxxQkFBcUIsT0FBSyxLQUFLLGlCQUFpQixDQUFDLENBQUMsQ0FBQztBQUNwRixTQUFLLGFBQWEsSUFBSSxLQUFLLE1BQU0saUJBQWlCLE9BQUssS0FBSyxhQUFhLENBQUMsQ0FBQyxDQUFDO0FBQzVFLFNBQUssYUFBYSxJQUFJLEtBQUssT0FBTywyQkFBMkIsTUFBTSxLQUFLLDBCQUEwQixDQUFDLENBQUM7QUFDcEcsU0FBSyxhQUFhLElBQUksS0FBSyxPQUFPLHlCQUF5QixPQUFLO0FBQy9ELFVBQUksRUFBRSxXQUFXLGFBQWEsT0FBTyxHQUFHO0FBQ3ZDLDRCQUFvQjtBQUNwQix1QkFBZTtBQUNmLDJCQUFtQjtBQUFBLE1BQ3BCO0FBQ0EsVUFBSSxLQUFLLHFCQUFxQixFQUFFLFdBQVcsYUFBYSxRQUFRLEtBQUssRUFBRSxXQUFXLGFBQWEsZUFBZSxLQUFLLEVBQUUsV0FBVyxhQUFhLGlCQUFpQixJQUFJO0FBQ2pLLGFBQUssTUFBTSxPQUFPLEdBQUcsS0FBSyxNQUFNLFFBQVEsS0FBSyxpQkFBaUIsS0FBSztBQUFBLE1BQ3BFO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLDJCQUEyQixlQUFlLFFBQVEsT0FBTyxrQkFBa0I7QUFDaEYsU0FBSyxrQ0FBa0MsZUFBZSxlQUFlLE9BQU8sa0JBQWtCO0FBQzlGLFNBQUssdUNBQXVDLGVBQWUsb0JBQW9CLE9BQU8sa0JBQWtCO0FBQ3hHLFNBQUssd0NBQXdDLGVBQWUscUJBQXFCLE9BQU8sa0JBQWtCO0FBQzFHLFNBQUssa0NBQWtDLGVBQWUsZUFBZSxPQUFPLGtCQUFrQjtBQUU5RixVQUFNLHNCQUFzQixJQUFJLFdBQVcsS0FBSyxTQUFTLE9BQU8sT0FBTztBQUN2RSxTQUFLLGFBQWEsSUFBSSxtQkFBbUI7QUFDekMsU0FBSyxhQUFhLElBQUksb0JBQW9CLFdBQVcsTUFBTSxLQUFLLGdDQUFnQyxJQUFJLElBQUksQ0FBQyxDQUFDO0FBQzFHLFNBQUssYUFBYSxJQUFJLG9CQUFvQixVQUFVLE1BQU0sS0FBSyxnQ0FBZ0MsSUFBSSxLQUFLLENBQUMsQ0FBQztBQUUxRyxTQUFLLGFBQWEsSUFBSSxJQUFJLDhCQUE4QixLQUFLLFNBQVMsT0FBTyxTQUFTLFdBQVcsT0FBSztBQUNyRyxXQUFLLGtCQUFrQixLQUFLLENBQUM7QUFBQSxJQUM5QixDQUFDLENBQUM7QUFFRixTQUFLLGFBQWEsSUFBSSxLQUFLLE9BQU8sWUFBWSxDQUFDLE1BQXlCLEtBQUssbUJBQW1CLENBQUMsQ0FBQyxDQUFDO0FBQUEsRUFDcEc7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsU0FBSyxTQUFTLE9BQU8sUUFBUTtBQUM3QixTQUFLLFNBQVMsUUFBUTtBQUN0QixTQUFLLE1BQU0sUUFBUTtBQUNuQixTQUFLLFFBQVEsUUFBUTtBQUNyQixTQUFLLGFBQWEsUUFBUTtBQUMxQixTQUFLLGdCQUFnQixRQUFRO0FBQzdCLFNBQUssZUFBZSxRQUFRO0FBQzVCLFNBQUssb0JBQW9CLFFBQVE7QUFDakMsU0FBSyxhQUFhLFFBQVE7QUFDMUIsU0FBSyxlQUFlLFFBQVE7QUFDNUIsU0FBSyxRQUFRLFFBQVE7QUFDckIsU0FBSyxhQUFhLFFBQVE7QUFDMUIsU0FBSyxZQUFZLFFBQVE7QUFDekIsU0FBSyxXQUFXLFFBQVE7QUFDeEIsU0FBSyxXQUFXLFFBQVE7QUFDeEIsU0FBSyxrQkFBa0IsUUFBUTtBQUFBLEVBQ2hDO0FBQUEsRUFFUSxtQkFBbUIsWUFBcUM7QUFDL0QsUUFBSSxLQUFLLFNBQVMsT0FBTyxRQUFRLFNBQVMsV0FBVyxPQUFPLE9BQU8sR0FBRztBQUVyRSxXQUFLLFNBQVMsT0FBTyxRQUFRLE1BQU07QUFBQSxJQUNwQyxPQUFPO0FBRU4sVUFBSSxLQUFLLFFBQVEsUUFBUSxTQUFTLFdBQVcsT0FBTyxPQUFPLEdBQUc7QUFDN0QsYUFBSyxPQUFPLE1BQU07QUFBQSxNQUNuQjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSw0QkFBa0M7QUFDekMsUUFBSSxLQUFLLFdBQVcsZ0JBQWM7QUFDakMsV0FBSyxlQUFlLE9BQU87QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHNCQUFzQixHQUE4RTtBQUMzRyxRQUFJLE9BQU8sRUFBRSxZQUFZLGVBQWUsT0FBTyxFQUFFLFVBQVUsYUFBYTtBQUN2RTtBQUFBLElBQ0Q7QUFHQSxNQUFFLGFBQWEsZUFBZTtBQUM5QixNQUFFLGFBQWEsZ0JBQWdCO0FBRS9CLFNBQUssUUFBUSxFQUFFLFNBQVMsRUFBRSxLQUFLO0FBQUEsRUFDaEM7QUFBQSxFQUVRLGlCQUFpQixHQUFxQztBQUM3RCxRQUFJLEVBQUUsU0FBUyxRQUFRO0FBQ3RCLFdBQUssUUFBUSxFQUFFLFNBQVMsQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFBQSxJQUN6QztBQUFBLEVBQ0Q7QUFBQSxFQUVRLFFBQVEsTUFBc0IsT0FBcUI7QUFDMUQsVUFBTSxrQkFBa0IsS0FBSztBQUM3QixRQUFJLGlCQUFpQjtBQUNwQixXQUFLLGFBQWEsS0FBSyxFQUFFLE1BQU0sT0FBTyxPQUFPLGdCQUFnQixDQUFDO0FBQzlELFdBQUssT0FBTyxNQUFNO0FBQUEsSUFDbkI7QUFBQSxFQUNEO0FBQUEsRUFFUSxhQUFhLEdBQXFDO0FBQ3pELFFBQUksS0FBSyxvQkFBb0I7QUFDNUI7QUFBQSxJQUNEO0FBRUEsUUFBSSxLQUFLLFdBQVcsaUJBQWU7QUFHbEMsV0FBSyxVQUFVLFlBQVU7QUFBQSxJQUMxQjtBQUVBLFFBQUksQ0FBQyxFQUFFLFNBQVMsUUFBUTtBQUN2QixVQUFJLEtBQUssMkJBQTJCO0FBQ25DLGFBQUssMEJBQTBCLE9BQU87QUFDdEMsYUFBSyw0QkFBNEI7QUFDakMsYUFBSyxlQUFlO0FBQUEsTUFDckI7QUFFQSxXQUFLLE9BQU8sZUFBZSxFQUFFLGtCQUFrQixPQUFVLENBQUM7QUFDMUQsV0FBSyxzQ0FBc0MsSUFBSSxLQUFLO0FBQ3BEO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxLQUFLLGtCQUFrQjtBQUMzQjtBQUFBLElBQ0Q7QUFFQSxTQUFLLHNDQUFzQyxJQUFJLElBQUk7QUFDbkQsVUFBTSxPQUFPLEVBQUUsU0FBUyxDQUFDO0FBQ3pCLFVBQU0sUUFBUSxFQUFFLFFBQVEsQ0FBQztBQUV6QixRQUFJLFNBQVMsS0FBSyxjQUFjO0FBRS9CLFdBQUssMkJBQTJCLE9BQU87QUFDdkMsV0FBSyw0QkFBNEI7QUFFakMsV0FBSyxlQUFlO0FBRXBCLFdBQUssTUFBTSxPQUFPLEtBQUs7QUFFdkIsV0FBSyw0QkFBNEIsd0JBQXdCLE9BQU0sVUFBUztBQUN2RSxjQUFNLFVBQVUsa0JBQWtCLE1BQU07QUFDdkMsY0FBSSxLQUFLLGtCQUFrQixHQUFHO0FBQzdCLGlCQUFLLGFBQWEsTUFBTSxLQUFLO0FBQUEsVUFDOUI7QUFBQSxRQUNELEdBQUcsR0FBRztBQUNOLGNBQU0sTUFBTSxNQUFNLHdCQUF3QixNQUFNLFFBQVEsUUFBUSxDQUFDO0FBQ2pFLFlBQUk7QUFDSCxpQkFBTyxNQUFNLEtBQUssUUFBUSxLQUFLO0FBQUEsUUFDaEMsVUFBRTtBQUNELGtCQUFRLFFBQVE7QUFDaEIsY0FBSSxRQUFRO0FBQUEsUUFDYjtBQUFBLE1BQ0QsQ0FBQztBQUVELFdBQUssMEJBQTBCLEtBQUssTUFBTTtBQUN6QyxZQUFJLFNBQVMsS0FBSyxNQUFNLFVBQVUsU0FBUyxLQUFLLE1BQU0sUUFBUSxLQUFLLEdBQUc7QUFDckU7QUFBQSxRQUNEO0FBR0EsYUFBSyxxQkFBcUI7QUFDMUIsYUFBSyxNQUFNLE9BQU8sT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDO0FBQ2xDLGFBQUssTUFBTSxTQUFTLENBQUMsS0FBSyxDQUFDO0FBQzNCLGFBQUsscUJBQXFCO0FBRTFCLFlBQUksS0FBSyxrQkFBa0IsR0FBRztBQUM3QixlQUFLLGFBQWEsT0FBTyxLQUFLO0FBQUEsUUFDL0IsT0FBTztBQUNOLGVBQUssUUFBUSxRQUFRLFVBQVUsT0FBTyxXQUFXO0FBQUEsUUFDbEQ7QUFFQSxhQUFLLE9BQU8sZUFBZSxFQUFFLGtCQUFrQixLQUFLLE1BQU0sYUFBYSxLQUFLLEVBQUUsQ0FBQztBQUFBLE1BQ2hGLENBQUMsRUFBRSxNQUFNLGlCQUFpQjtBQUFBLElBQzNCO0FBR0EsU0FBSyxZQUFZLEtBQUssRUFBRSxNQUFNLE9BQU8sT0FBTyxLQUFLLGlCQUFpQixDQUFDO0FBQUEsRUFDcEU7QUFBQSxFQUVRLFVBQVUsT0FBb0I7QUFFckMsUUFBSSxLQUFLLFdBQVcsT0FBTztBQUMxQjtBQUFBLElBQ0Q7QUFDQSxTQUFLLFNBQVM7QUFFZCxTQUFLLFFBQVEsUUFBUSxVQUFVLE9BQU8sVUFBVSxVQUFVLGNBQVk7QUFDdEUsU0FBSyxRQUFRLFFBQVEsVUFBVSxPQUFPLFNBQVM7QUFFL0MsWUFBUSxPQUFPO0FBQUEsTUFDZCxLQUFLO0FBQ0osWUFBSSxLQUFLLEtBQUssaUJBQWlCLEtBQUssY0FBYyxLQUFLLFFBQVEsT0FBTztBQUN0RSxhQUFLLFNBQVMsS0FBSyxJQUFJO0FBQ3ZCLGFBQUssUUFBUSxLQUFLO0FBQ2xCLGFBQUssZUFBZSxLQUFLO0FBQ3pCLGFBQUsseUJBQXlCLE1BQU07QUFDcEMsYUFBSyxxQ0FBcUMsTUFBTTtBQUNoRCxhQUFLLHNDQUFzQyxNQUFNO0FBQ2pELGFBQUssYUFBYSxPQUFPO0FBQ3pCLGFBQUssUUFBUSxRQUFRLFVBQVUsT0FBTyxTQUFTO0FBQy9DLGFBQUssTUFBTSxPQUFPLEdBQUcsS0FBSyxNQUFNLE1BQU07QUFDdEMsYUFBSyxlQUFlO0FBQ3BCLGFBQUssZ0JBQWdCO0FBQ3JCLGFBQUssZUFBZTtBQUNwQjtBQUFBLE1BQ0QsS0FBSztBQUNKLGFBQUssUUFBUSxRQUFRLFVBQVUsSUFBSSxTQUFTO0FBQzVDLGFBQUssZ0JBQWdCLGNBQWMsY0FBYztBQUNqRCxZQUFJLEtBQUssS0FBSyxjQUFjLEtBQUssUUFBUSxPQUFPO0FBQ2hELFlBQUksS0FBSyxLQUFLLGVBQWU7QUFDN0IsYUFBSyxTQUFTLEtBQUs7QUFDbkIsYUFBSyxNQUFNO0FBQ1gsYUFBSyxlQUFlO0FBQ3BCLGVBQU8sY0FBYyxlQUFlO0FBQ3BDO0FBQUEsTUFDRCxLQUFLO0FBQ0osYUFBSyxRQUFRLFFBQVEsVUFBVSxJQUFJLFNBQVM7QUFDNUMsYUFBSyxnQkFBZ0IsY0FBYyxjQUFjO0FBQ2pELFlBQUksS0FBSyxLQUFLLGNBQWMsS0FBSyxRQUFRLE9BQU87QUFDaEQsWUFBSSxLQUFLLEtBQUssZUFBZTtBQUM3QixhQUFLLFNBQVMsS0FBSztBQUNuQixhQUFLLE1BQU07QUFDWCxhQUFLLGVBQWU7QUFDcEIsZUFBTyxjQUFjLHNCQUFzQjtBQUMzQztBQUFBLE1BQ0QsS0FBSztBQUNKLFlBQUksS0FBSyxLQUFLLGVBQWU7QUFDN0IsWUFBSSxLQUFLLEtBQUssY0FBYyxLQUFLLFFBQVEsT0FBTztBQUNoRCxhQUFLLE1BQU07QUFDWDtBQUFBLE1BQ0QsS0FBSztBQUNKLFlBQUksS0FBSyxLQUFLLGVBQWU7QUFDN0IsWUFBSSxLQUFLLEtBQUssY0FBYyxLQUFLLFFBQVEsT0FBTztBQUNoRCxhQUFLLE1BQU07QUFDWDtBQUFBLE1BQ0QsS0FBSztBQUNKLFlBQUksS0FBSyxLQUFLLGVBQWU7QUFDN0IsWUFBSSxLQUFLLEtBQUssY0FBYyxLQUFLLFFBQVEsT0FBTztBQUNoRCxhQUFLLFNBQVMsS0FBSztBQUNuQixhQUFLLE1BQU07QUFDWCxhQUFLLFNBQVMsT0FBTyxNQUFNO0FBQzNCO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLFFBQWM7QUFDckIsU0FBSyxRQUFRLEtBQUs7QUFDbEIsU0FBSyxlQUFlLEtBQUs7QUFDekIsU0FBSyxRQUFRLEtBQUssZUFBZSxRQUFRLENBQUM7QUFDMUMsU0FBSyx5QkFBeUIsSUFBSSxJQUFJO0FBRXRDLFNBQUssYUFBYSxhQUFhLE1BQU07QUFDcEMsV0FBSyxRQUFRLFFBQVEsVUFBVSxJQUFJLFNBQVM7QUFDNUMsV0FBSyxXQUFXLEtBQUssSUFBSTtBQUFBLElBQzFCLEdBQUcsR0FBRztBQUFBLEVBQ1A7QUFBQSxFQUVBLGNBQWMsTUFBZSxPQUFlO0FBQzNDLFFBQUksS0FBSyxXQUFXLGdCQUFjO0FBQ2pDO0FBQUEsSUFDRDtBQUNBLFNBQUssZUFBZSxZQUFZLEtBQUssT0FBTyxZQUFZLENBQUM7QUFDekQsU0FBSyxVQUFVLENBQUMsQ0FBQztBQUVqQixRQUFJLENBQUMsS0FBSyxTQUFTO0FBQ2xCLFdBQUssZ0JBQWdCLFFBQVEsa0JBQWtCLE1BQU0sS0FBSyxVQUFVLGVBQWEsR0FBRyxLQUFLO0FBQUEsSUFDMUY7QUFBQSxFQUNEO0FBQUEsRUFFQSxnQkFBZ0IsaUJBQWtDLGdCQUF3QixVQUFtQixRQUFpQixTQUF3QjtBQUVySSxTQUFLLGVBQWUsWUFBWSxLQUFLLE9BQU8sWUFBWSxDQUFDO0FBQ3pELFNBQUssZ0JBQWdCLE1BQU07QUFFM0IsU0FBSywyQkFBMkIsT0FBTztBQUN2QyxTQUFLLDRCQUE0QjtBQUVqQyxRQUFJLEtBQUsscUJBQXFCLGlCQUFpQjtBQUM5QyxXQUFLLG1CQUFtQjtBQUFBLElBQ3pCO0FBRUEsUUFBSSxZQUFZLEtBQUssV0FBVyxpQkFBZSxLQUFLLFdBQVcsZ0JBQWM7QUFDNUUsV0FBSyxVQUFVLGNBQVk7QUFDM0I7QUFBQSxJQUNEO0FBRUEsVUFBTSxlQUFlLEtBQUssaUJBQWlCLE1BQU07QUFDakQsVUFBTSxVQUFVLGlCQUFpQjtBQUNqQyxTQUFLLHFDQUFxQyxJQUFJLGVBQWUsQ0FBQztBQUU5RCxRQUFJLFNBQVM7QUFDWixXQUFLLFVBQVUsU0FBUyxpQkFBZSxhQUFXO0FBQ2xELFdBQUssbUJBQW1CO0FBQ3hCO0FBQUEsSUFDRDtBQUVBLFNBQUssZUFBZTtBQU1wQixTQUFLLFlBQVksTUFBTTtBQUN2QixTQUFLLGFBQWEsTUFBTTtBQUN4QixRQUFJO0FBQ0gsV0FBSyxNQUFNLE9BQU8sR0FBRyxLQUFLLE1BQU0sUUFBUSxLQUFLLGlCQUFpQixLQUFLO0FBQ25FLFdBQUssVUFBVSxXQUFXLGlCQUFlLFlBQVU7QUFDbkQsV0FBSyxNQUFNLE9BQU8sZ0JBQWdCLEdBQUcsbUJBQW1CLElBQUksSUFBSSxLQUFLLGNBQWMsRUFBRSxhQUFhLElBQUk7QUFDdEcsV0FBSyxNQUFNLFNBQVMsVUFBVSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUM7QUFBQSxJQUNwRCxVQUFFO0FBQ0QsV0FBSyxZQUFZLE9BQU87QUFDeEIsV0FBSyxhQUFhLE9BQU87QUFBQSxJQUMxQjtBQUVBLFNBQUssZUFBZSxRQUFRLElBQUksd0NBQXdDLElBQUksVUFBVSxLQUFLLFFBQVEsT0FBTyxHQUFHLE1BQU07QUFDbEgsV0FBSyxlQUFlLE1BQU07QUFDMUIsV0FBSyxRQUFRLEtBQUssUUFBUSxJQUFJO0FBRTlCLFdBQUssU0FBUyxPQUFPLFFBQVEsVUFBVSxPQUFPLFNBQVM7QUFBQSxJQUN4RCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsZ0JBQXNCO0FBQ3JCLFFBQUksS0FBSyxNQUFNLFNBQVMsR0FBRztBQUMxQixXQUFLLE1BQU0sU0FBUyxDQUFDLENBQUMsQ0FBQztBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUFBLEVBRUEsaUJBQTBCO0FBQ3pCLFlBQVEsS0FBSyxRQUFRO0FBQUEsTUFDcEIsS0FBSztBQUNKLGVBQU87QUFBQSxNQUNSLEtBQUs7QUFDSixhQUFLLFNBQVMsT0FBTyxTQUFTO0FBQzlCLGVBQU87QUFBQSxNQUNSLEtBQUs7QUFDSixlQUFPLENBQUMsS0FBSztBQUFBLE1BQ2Q7QUFDQyxhQUFLLE1BQU0sY0FBYztBQUN6QixlQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGFBQXNCO0FBQ3JCLFlBQVEsS0FBSyxRQUFRO0FBQUEsTUFDcEIsS0FBSztBQUNKLGVBQU87QUFBQSxNQUNSLEtBQUs7QUFDSixlQUFPLENBQUMsS0FBSztBQUFBLE1BQ2Q7QUFDQyxhQUFLLE1BQU0sVUFBVSxHQUFHLElBQUk7QUFDNUIsZUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxhQUFzQjtBQUNyQixZQUFRLEtBQUssUUFBUTtBQUFBLE1BQ3BCLEtBQUs7QUFDSixlQUFPO0FBQUEsTUFDUixLQUFLO0FBQ0osYUFBSyxTQUFTLE9BQU8sYUFBYTtBQUNsQyxlQUFPO0FBQUEsTUFDUixLQUFLO0FBQ0osZUFBTyxDQUFDLEtBQUs7QUFBQSxNQUNkO0FBQ0MsYUFBSyxNQUFNLFVBQVU7QUFDckIsZUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxxQkFBOEI7QUFDN0IsWUFBUSxLQUFLLFFBQVE7QUFBQSxNQUNwQixLQUFLO0FBQ0osZUFBTztBQUFBLE1BQ1IsS0FBSztBQUNKLGFBQUssU0FBUyxPQUFPLE9BQU87QUFDNUIsZUFBTztBQUFBLE1BQ1IsS0FBSztBQUNKLGVBQU8sQ0FBQyxLQUFLO0FBQUEsTUFDZDtBQUNDLGFBQUssTUFBTSxrQkFBa0I7QUFDN0IsZUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxpQkFBMEI7QUFDekIsWUFBUSxLQUFLLFFBQVE7QUFBQSxNQUNwQixLQUFLO0FBQ0osZUFBTztBQUFBLE1BQ1IsS0FBSztBQUNKLGVBQU8sQ0FBQyxLQUFLO0FBQUEsTUFDZDtBQUNDLGFBQUssTUFBTSxjQUFjLEdBQUcsSUFBSTtBQUNoQyxlQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGNBQXVCO0FBQ3RCLFlBQVEsS0FBSyxRQUFRO0FBQUEsTUFDcEIsS0FBSztBQUNKLGVBQU87QUFBQSxNQUNSLEtBQUs7QUFDSixhQUFLLFNBQVMsT0FBTyxVQUFVO0FBQy9CLGVBQU87QUFBQSxNQUNSLEtBQUs7QUFDSixlQUFPLENBQUMsS0FBSztBQUFBLE1BQ2Q7QUFDQyxhQUFLLE1BQU0sV0FBVztBQUN0QixlQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGlCQUFrRDtBQUNqRCxRQUFJLEtBQUssV0FBVyxrQkFDaEIsS0FBSyxXQUFXLGlCQUNoQixLQUFLLFdBQVcsbUJBQ2hCLEtBQUssb0JBQ0wsS0FBSyxNQUFNLFNBQVMsRUFBRSxTQUFTLEdBQ2pDO0FBRUQsYUFBTztBQUFBLFFBQ04sTUFBTSxLQUFLLE1BQU0sbUJBQW1CLEVBQUUsQ0FBQztBQUFBLFFBQ3ZDLE9BQU8sS0FBSyxNQUFNLFNBQVMsRUFBRSxDQUFDO0FBQUEsUUFDOUIsT0FBTyxLQUFLO0FBQUEsTUFDYjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEscUJBQTJCO0FBQzFCLFFBQUksS0FBSyxXQUFXLGlCQUFlO0FBRWxDLFdBQUssTUFBTSxTQUFTLEtBQUssTUFBTSxTQUFTLENBQUM7QUFDekMsV0FBSyxVQUFVLFlBQVU7QUFBQSxJQUMxQixXQUFXLEtBQUssV0FBVyxjQUFZO0FBQ3RDLFdBQUssVUFBVSxlQUFhO0FBQzVCLFVBQUksQ0FBQyxLQUFLLGtCQUFrQixHQUFHO0FBQzlCLGFBQUssY0FBYyxJQUFJO0FBQUEsTUFDeEIsT0FBTztBQUNOLGFBQUssU0FBUyxPQUFPLE1BQU07QUFBQSxNQUM1QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxjQUFjLFVBQW1CLE9BQWE7QUFDN0MsUUFBSSxLQUFLLGtCQUFrQixHQUFHO0FBRTdCLFdBQUssb0JBQW9CLE1BQU07QUFDL0IsV0FBSyxnQ0FBZ0MsSUFBSSxLQUFLO0FBQzlDLFdBQUssbUJBQW1CLEtBQUs7QUFDN0IsV0FBSyxTQUFTLEtBQUs7QUFDbkIsV0FBSyxRQUFRLFFBQVEsVUFBVSxPQUFPLGVBQWU7QUFBQSxJQUV0RCxZQUFZLHdCQUF3QixLQUFLLE1BQU0sbUJBQW1CLEVBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSyxrQkFBa0IsS0FBSyxXQUFXLGdCQUFjLEtBQUssV0FBVyxtQkFBaUIsS0FBSyxXQUFXLGlCQUFlO0FBRS9MLFdBQUssZ0NBQWdDLElBQUksSUFBSTtBQUM3QyxXQUFLLG1CQUFtQixJQUFJO0FBQzVCLFdBQUssYUFBYSxPQUFPLE9BQU87QUFBQSxJQUNqQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLGFBQWEsU0FBa0IsU0FBd0I7QUFDOUQsU0FBSyxvQkFBb0IsUUFBUSxJQUFJLHdDQUF3QyxJQUFJLFVBQVUsS0FBSyxRQUFRLE9BQU8sR0FBRyxNQUFNO0FBQ3ZILFdBQUssb0JBQW9CLE1BQU07QUFDL0IsV0FBSyxTQUFTLEtBQUs7QUFDbkIsVUFBSSxrQkFBa0I7QUFDdEIsVUFBSSxTQUFTO0FBQ1osYUFBSyxTQUFTLE9BQU8sY0FBYztBQUFBLE1BQ3BDLE9BQU87QUFDTixhQUFLLFNBQVMsT0FBTyxXQUFXLEtBQUssTUFBTSxtQkFBbUIsRUFBRSxDQUFDLEdBQUcsS0FBSyxZQUFZO0FBQUEsTUFDdEY7QUFDQSxVQUFJLENBQUMsS0FBSyxTQUFTLE9BQU8sU0FBUztBQUNsQyxhQUFLLGlCQUFpQjtBQUN0QixhQUFLLFFBQVEsUUFBUSxVQUFVLElBQUksZUFBZTtBQUNsRCxZQUFJLFNBQVM7QUFDWixlQUFLLFNBQVMsT0FBTyxNQUFNO0FBQzNCLDRCQUFrQjtBQUFBLFFBQ25CO0FBQUEsTUFDRCxPQUFPO0FBQ04sYUFBSyxTQUFTLEtBQUs7QUFBQSxNQUNwQjtBQUNBLFVBQUksQ0FBQyxpQkFBaUI7QUFDckIsYUFBSyxPQUFPLE1BQU07QUFBQSxNQUNuQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLG9CQUEwQjtBQUN6QixRQUFJLEtBQUssTUFBTSxtQkFBbUIsRUFBRSxDQUFDLEdBQUc7QUFDdkMsV0FBSyxlQUFlLENBQUMsS0FBSztBQUMxQixVQUFJLENBQUMsS0FBSyxrQkFBa0IsR0FBRztBQUM5QixhQUFLLGNBQWM7QUFBQSxNQUNwQixPQUFPO0FBQ04sYUFBSyxhQUFhLE9BQU8sS0FBSztBQUFBLE1BQy9CO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLHFCQUEyQjtBQUMxQixTQUFLLGVBQWUsTUFBTTtBQUFBLEVBQzNCO0FBQUEsRUFFQSxhQUFtQjtBQUNsQixTQUFLLGVBQWUsTUFBTTtBQUMxQixTQUFLLG9CQUFvQixNQUFNO0FBQy9CLFNBQUssZ0JBQWdCLE1BQU07QUFFM0IsU0FBSyxVQUFVLGNBQVk7QUFDM0IsU0FBSyxXQUFXLEtBQUssSUFBSTtBQUN6QixTQUFLLFFBQVEsb0JBQW9CO0FBSWpDLFVBQU0sTUFBTSxLQUFLLGVBQWUsUUFBUTtBQUN4QyxVQUFNLHFCQUFxQixLQUFLLEtBQUssS0FBSyxjQUFjLEVBQUUsYUFBYSxHQUFHO0FBQzFFLFFBQUksT0FBTyxJQUFJLFNBQVMsb0JBQW9CO0FBQzNDLFdBQUssZUFBZSxNQUFNLElBQUksS0FBSyxRQUFXLGtCQUFrQixDQUFDO0FBQUEsSUFDbEU7QUFBQSxFQUNEO0FBQUEsRUFFQSxXQUFvQjtBQUNuQixXQUFPLEtBQUssV0FBVztBQUFBLEVBQ3hCO0FBQUEsRUFFQSxhQUFhLFVBQWtEO0FBQzlELFFBQUksYUFBYSxNQUFNO0FBQ3RCLFVBQUksS0FBSyxrQkFBa0IsR0FBRztBQUM3QixhQUFLLFNBQVMsS0FBSztBQUFBLE1BQ3BCO0FBQ0E7QUFBQSxJQUNEO0FBQ0EsUUFBSSxLQUFLLFdBQVcsaUJBQWUsS0FBSyxXQUFXLGlCQUFlO0FBRWpFO0FBQUEsSUFDRDtBQUNBLFFBQUksS0FBSyxrQkFBa0IsS0FBSyxDQUFDLEtBQUssU0FBUyxPQUFPLFNBQVM7QUFDOUQsV0FBSyxTQUFTLEtBQUs7QUFBQSxJQUNwQjtBQUNBLFNBQUssaUJBQWlCO0FBQUEsRUFDdkI7QUFBQSxFQUVRLFFBQVEsTUFBdUM7QUFDdEQsUUFBSSxDQUFDLEtBQUssT0FBTyxTQUFTLEdBQUc7QUFDNUI7QUFBQSxJQUNEO0FBQ0EsUUFBSSxDQUFDLEtBQUssT0FBTyxXQUFXLEdBQUc7QUFFOUI7QUFBQSxJQUNEO0FBRUEsVUFBTSxVQUFVLElBQUksY0FBYyxLQUFLLFFBQVEsUUFBUSxjQUFjLElBQUk7QUFDekUsVUFBTSxPQUFPLEtBQUssY0FBYztBQUVoQyxRQUFJLENBQUMsTUFBTTtBQUNWLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFFQSxRQUFJLFNBQVMsS0FBSztBQUNsQixRQUFJLFFBQVEsS0FBSztBQUdqQixTQUFLLFFBQVEsUUFBUSxNQUFNLFNBQVMsR0FBRyxLQUFLLFVBQVU7QUFFdEQsUUFBSSxLQUFLLFdBQVcsaUJBQWUsS0FBSyxXQUFXLGlCQUFlO0FBRWpFLGVBQVMsS0FBSyxhQUFhLEtBQUs7QUFDaEMsY0FBUSxLQUFLLFlBQVksUUFBUTtBQUNqQyxXQUFLLFFBQVEsYUFBYSxPQUFPLE9BQU8sT0FBTyxLQUFLO0FBQ3BELFdBQUssUUFBUSxVQUFVLEtBQUssUUFBUSxVQUFVLElBQUksSUFBSSxVQUFVLE9BQU8sTUFBTTtBQUM3RSxXQUFLLGVBQWUsY0FBYyxnQ0FBZ0MsS0FBSztBQUFBLElBRXhFLE9BQU87QUFJTixZQUFNLFdBQVcsUUFBUSxRQUFRLEtBQUssZUFBZSxJQUFJLEtBQUs7QUFDOUQsVUFBSSxRQUFRLFVBQVU7QUFDckIsZ0JBQVE7QUFBQSxNQUNUO0FBQ0EsVUFBSSxpQkFBaUIsS0FBSyxtQkFBbUIsS0FBSyxpQkFBaUIsTUFBTSxZQUFZLEtBQUssaUNBQWlDO0FBRTNILFVBQUksS0FBSyxPQUFPLFVBQVUsYUFBYSxPQUFPLEVBQUUscUJBQXFCLEtBQUssb0JBQW9CLENBQUMsS0FBSyxlQUFlLFFBQVEsR0FBRztBQUU3SCxjQUFNLE1BQU0sS0FBSyxJQUFJLFVBQVUsS0FBSyxPQUFPLGNBQWMsRUFBRSxLQUFLO0FBQ2hFLGNBQU0sV0FBVyxLQUFLLElBQUksS0FBSyxLQUFLLHFCQUFxQixJQUFJLENBQUM7QUFDOUQsZ0JBQVEsS0FBSyxJQUFJLE9BQU8sUUFBUTtBQUNoQyx5QkFBaUIsS0FBSyxJQUFJLGdCQUFnQixRQUFRO0FBQUEsTUFDbkQ7QUFHQSxZQUFNLGFBQWEsS0FBSyxrQkFBa0IsS0FBSyxNQUFNLGdCQUFnQixLQUFLO0FBQzFFLFlBQU0sWUFBWSxLQUFLLGFBQWEsS0FBSztBQUN6QyxZQUFNLFlBQVksSUFBSSx1QkFBdUIsS0FBSyxPQUFPLFdBQVcsQ0FBQztBQUNyRSxZQUFNLFlBQVksS0FBSyxPQUFPLDJCQUEyQixLQUFLLE9BQU8sWUFBWSxDQUFDO0FBQ2xGLFlBQU0sZUFBZSxVQUFVLE1BQU0sVUFBVSxNQUFNLFVBQVU7QUFDL0QsWUFBTSxpQkFBaUIsS0FBSyxJQUFJLFFBQVEsU0FBUyxlQUFlLEtBQUssaUJBQWlCLFVBQVU7QUFDaEcsWUFBTSxzQkFBc0IsVUFBVSxNQUFNLFVBQVUsTUFBTSxLQUFLO0FBQ2pFLFlBQU0saUJBQWlCLEtBQUssSUFBSSxxQkFBcUIsVUFBVTtBQUMvRCxVQUFJLFlBQVksS0FBSyxJQUFJLEtBQUssSUFBSSxnQkFBZ0IsY0FBYyxJQUFJLEtBQUssY0FBYyxVQUFVO0FBRWpHLFVBQUksV0FBVyxLQUFLLGVBQWUsUUFBUTtBQUcxQyxpQkFBUyxLQUFLLGNBQWM7QUFBQSxNQUM3QjtBQUVBLFVBQUksU0FBUyxXQUFXO0FBQ3ZCLGlCQUFTO0FBQUEsTUFDVjtBQUNBLFVBQUksU0FBUyxXQUFXO0FBQ3ZCLGlCQUFTO0FBQUEsTUFDVjtBQUVBLFlBQU0sbUNBQW1DO0FBQ3pDLFVBQUssU0FBUyxrQkFBa0IsaUJBQWlCLGtCQUFvQixLQUFLLHdCQUF3QixzQkFBc0Isa0NBQW1DO0FBQzFKLGFBQUssZUFBZSxjQUFjLGdDQUFnQyxLQUFLO0FBQ3ZFLGFBQUssUUFBUSxhQUFhLE1BQU0sTUFBTSxPQUFPLEtBQUs7QUFDbEQsb0JBQVk7QUFBQSxNQUNiLE9BQU87QUFDTixhQUFLLGVBQWUsY0FBYyxnQ0FBZ0MsS0FBSztBQUN2RSxhQUFLLFFBQVEsYUFBYSxPQUFPLE1BQU0sTUFBTSxLQUFLO0FBQ2xELG9CQUFZO0FBQUEsTUFDYjtBQUNBLFdBQUssUUFBUSxnQkFBZ0IsSUFBSSxJQUFJLFVBQVUsZ0JBQWdCLEtBQUssWUFBWSxNQUFNO0FBQ3RGLFdBQUssUUFBUSxVQUFVLElBQUksSUFBSSxVQUFVLFVBQVUsU0FBUztBQUM1RCxXQUFLLFFBQVEsVUFBVSxJQUFJLElBQUksVUFBVSxLQUFLLFNBQVM7QUFLdkQsV0FBSyxnQkFBZ0IsV0FBVyxhQUM3QixFQUFFLFFBQVEsS0FBSyxlQUFlLFVBQVUsS0FBSyxRQUFRLFFBQVEsT0FBTyxJQUNwRTtBQUFBLElBQ0o7QUFDQSxTQUFLLFFBQVEsT0FBTyxNQUFNO0FBQUEsRUFDM0I7QUFBQSxFQUVRLFFBQVEsT0FBZSxRQUFzQjtBQUVwRCxVQUFNLEVBQUUsT0FBTyxVQUFVLFFBQVEsVUFBVSxJQUFJLEtBQUssUUFBUTtBQUM1RCxZQUFRLEtBQUssSUFBSSxVQUFVLEtBQUs7QUFDaEMsYUFBUyxLQUFLLElBQUksV0FBVyxNQUFNO0FBRW5DLFVBQU0sRUFBRSxnQkFBZ0IsSUFBSSxLQUFLLGNBQWM7QUFDL0MsU0FBSyxNQUFNLE9BQU8sU0FBUyxpQkFBaUIsS0FBSztBQUNqRCxTQUFLLGFBQWEsTUFBTSxTQUFTLEdBQUcsU0FBUyxlQUFlO0FBQzVELFNBQUssUUFBUSxPQUFPLFFBQVEsS0FBSztBQUNqQyxTQUFLLGVBQWUsT0FBTztBQUUzQixTQUFLLGlCQUFpQjtBQUFBLEVBQ3ZCO0FBQUEsRUFFUSxtQkFBeUI7QUFDaEMsUUFBSSxLQUFLLGtCQUFrQixHQUFHO0FBQzdCLFdBQUssU0FBUyxjQUFjLEtBQUssUUFBUSxTQUFTLEtBQUssZUFBZSxZQUFZLEdBQUcsV0FBVyxDQUFDLE1BQU0sZ0NBQWdDLEtBQUs7QUFBQSxJQUM3STtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFRLHFCQUFxQixNQUEwRDtBQUN0RixVQUFNLFFBQVEsS0FBSztBQUNuQixRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxLQUFLLGtCQUFrQixVQUFVLE9BQU87QUFDM0MsYUFBTyxLQUFLLGlCQUFpQjtBQUFBLElBQzlCO0FBRUEsUUFBSSxLQUFLLG9CQUFvQixRQUFXO0FBQ3ZDLFdBQUssa0JBQWtCLElBQUksRUFBcUIsUUFBUSxFQUFFLFdBQVcsSUFBSTtBQUFBLElBQzFFO0FBRUEsUUFBSTtBQUNKLFFBQUksS0FBSyxpQkFBaUI7QUFDekIsWUFBTSxVQUFVLEtBQUssT0FBTyxXQUFXO0FBQ3ZDLFlBQU0sV0FBVyxRQUFRLElBQUksYUFBYSxRQUFRO0FBQ2xELFlBQU0sV0FBVyxRQUFRLElBQUksYUFBYSxlQUFlLEtBQUssU0FBUztBQUN2RSxXQUFLLGdCQUFnQixPQUFPLEdBQUcsU0FBUyxVQUFVLElBQUksUUFBUSxNQUFNLFNBQVMsc0JBQXNCLENBQUM7QUFDcEcscUJBQWU7QUFDZixpQkFBVyxRQUFRLE1BQU0sT0FBTztBQUMvQixjQUFNLEVBQUUsV0FBVyxJQUFJO0FBQ3ZCLFlBQUksT0FBTyxLQUFLO0FBQ2hCLFlBQUksT0FBTyxXQUFXLFVBQVUsVUFBVTtBQUN6QyxrQkFBUSxXQUFXLFVBQVU7QUFBQSxRQUM5QixPQUFPO0FBQ04sbUJBQVMsV0FBVyxNQUFNLFVBQVUsT0FBTyxXQUFXLE1BQU0sZUFBZTtBQUFBLFFBQzVFO0FBQ0EsdUJBQWUsS0FBSyxJQUFJLGNBQWMsS0FBSyxnQkFBZ0IsWUFBWSxJQUFJLEVBQUUsS0FBSztBQUFBLE1BQ25GO0FBQUEsSUFDRCxPQUFPO0FBRU4scUJBQWUsTUFBTSxNQUFNLFlBQVksS0FBSztBQUFBLElBQzdDO0FBR0EsVUFBTSxTQUFTLElBQUksS0FBSyxhQUFhLElBQUksS0FBSyxvQkFBb0I7QUFDbEUsVUFBTSxRQUFRLGVBQWU7QUFDN0IsU0FBSyxtQkFBbUIsRUFBRSxPQUFPLE1BQU07QUFDdkMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGdCQUFnQjtBQUNmLFVBQU0sV0FBVyxLQUFLLE9BQU8sVUFBVSxhQUFhLFFBQVE7QUFDNUQsVUFBTSxhQUFhLE1BQU0sS0FBSyxPQUFPLFVBQVUsYUFBYSxpQkFBaUIsS0FBSyxTQUFTLFlBQVksR0FBRyxHQUFJO0FBQzlHLFVBQU0sa0JBQWtCLENBQUMsS0FBSyxPQUFPLFVBQVUsYUFBYSxPQUFPLEVBQUUsaUJBQWlCLEtBQUssV0FBVyxpQkFBZSxLQUFLLFdBQVcsa0JBQWdCLElBQUk7QUFDekosVUFBTSxjQUFjLEtBQUssU0FBUyxPQUFPLGNBQWMsRUFBRTtBQUN6RCxVQUFNLGVBQWUsSUFBSTtBQUV6QixXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsZ0NBQWdDLFNBQVM7QUFBQSxNQUN6QyxpQkFBaUI7QUFBQSxNQUNqQixtQkFBbUI7QUFBQSxNQUNuQixhQUFhLElBQUksSUFBSSxVQUFVLEtBQUssa0JBQWtCLEtBQUssVUFBVTtBQUFBLElBQ3RFO0FBQUEsRUFDRDtBQUFBLEVBRVEsb0JBQTZCO0FBQ3BDLFdBQU8sS0FBSyxnQkFBZ0IsV0FBVyx3QkFBd0IsYUFBYSxTQUFTLEtBQUs7QUFBQSxFQUMzRjtBQUFBLEVBRVEsbUJBQW1CLE9BQWdCO0FBQzFDLFNBQUssZ0JBQWdCLE1BQU0sd0JBQXdCLE9BQU8sYUFBYSxTQUFTLGNBQWMsSUFBSTtBQUFBLEVBQ25HO0FBQUEsRUFFQSxzQkFBc0I7QUFDckIsUUFBSSxDQUFDLEtBQUssc0JBQXNCO0FBQy9CLFdBQUssdUJBQXVCO0FBQzVCLFdBQUssUUFBUSxLQUFLLGVBQWUsUUFBUSxDQUFDO0FBQUEsSUFDM0M7QUFBQSxFQUNEO0FBQUEsRUFFQSwwQkFBMEI7QUFDekIsU0FBSyx1QkFBdUI7QUFBQSxFQUM3QjtBQUNEO0FBejVCYSxjQUVHLGtCQUEwQixJQUFJLFNBQVMseUJBQXlCLFlBQVk7QUFGL0UsY0FHRyx5QkFBaUMsSUFBSSxTQUFTLCtCQUErQixpQkFBaUI7QUFIakcsZ0JBQU47QUFBQSxFQXNESjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBekRVO0FBMjVCTixNQUFNLHFCQUErQztBQUFBLEVBWTNELFlBQ2tCLFNBQ0EsU0FDaEI7QUFGZ0I7QUFDQTtBQVpsQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9CQUFvQjtBQUk3QixTQUFRLG9CQUFvQjtBQUU1QixTQUFRLFNBQWtCO0FBQzFCLFNBQVEsVUFBbUI7QUFBQSxFQUt2QjtBQUFBLEVBRUosVUFBZ0I7QUFDZixRQUFJLEtBQUssUUFBUTtBQUNoQixXQUFLLFNBQVM7QUFDZCxXQUFLLFFBQVEsb0JBQW9CLElBQUk7QUFBQSxJQUN0QztBQUFBLEVBQ0Q7QUFBQSxFQUVBLFFBQWdCO0FBQ2YsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGFBQTBCO0FBQ3pCLFdBQU8sS0FBSyxRQUFRLFFBQVE7QUFBQSxFQUM3QjtBQUFBLEVBRUEsT0FBYTtBQUNaLFNBQUssVUFBVTtBQUNmLFFBQUksQ0FBQyxLQUFLLFFBQVE7QUFDakIsV0FBSyxTQUFTO0FBQ2QsV0FBSyxRQUFRLGlCQUFpQixJQUFJO0FBQUEsSUFDbkM7QUFBQSxFQUNEO0FBQUEsRUFFQSxPQUFhO0FBQ1osUUFBSSxDQUFDLEtBQUssU0FBUztBQUNsQixXQUFLLFVBQVU7QUFDZixXQUFLLE9BQU87QUFBQSxJQUNiO0FBQUEsRUFDRDtBQUFBLEVBRUEsU0FBZTtBQUNkLFNBQUssUUFBUSxvQkFBb0IsSUFBSTtBQUFBLEVBQ3RDO0FBQUEsRUFFQSxjQUE2QztBQUM1QyxRQUFJLEtBQUssV0FBVyxDQUFDLEtBQUssYUFBYSxDQUFDLEtBQUssYUFBYTtBQUN6RCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxNQUNOLFVBQVUsS0FBSztBQUFBLE1BQ2YsWUFBWSxDQUFDLEtBQUssV0FBVztBQUFBLElBQzlCO0FBQUEsRUFDRDtBQUFBLEVBRUEsZUFBZTtBQUNkLFVBQU0sRUFBRSxRQUFRLE1BQU0sSUFBSSxLQUFLLFFBQVEsUUFBUTtBQUMvQyxVQUFNLEVBQUUsYUFBYSxrQkFBa0IsSUFBSSxLQUFLLFFBQVEsY0FBYztBQUN0RSxXQUFPLElBQUksSUFBSSxVQUFVLFFBQVEsSUFBSSxjQUFjLG1CQUFtQixTQUFTLElBQUksV0FBVztBQUFBLEVBQy9GO0FBQUEsRUFFQSxZQUFZLFVBQWtEO0FBQzdELFNBQUssUUFBUSxhQUFhLFFBQVE7QUFBQSxFQUNuQztBQUFBLEVBRUEsY0FBYyxZQUE2QztBQUMxRCxRQUFJLENBQUMsS0FBSyxtQkFBbUI7QUFDNUIsV0FBSyxjQUFjO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQUEsRUFFQSxpQkFBaUI7QUFDaEIsU0FBSyxvQkFBb0I7QUFBQSxFQUMxQjtBQUFBLEVBRUEsbUJBQW1CO0FBQ2xCLFNBQUssb0JBQW9CO0FBQUEsRUFDMUI7QUFBQSxFQUVBLFlBQVksVUFBa0M7QUFDN0MsU0FBSyxZQUFZO0FBQUEsRUFDbEI7QUFDRDsiLAogICJuYW1lcyI6IFsiU3RhdGUiLCAiZGV0YWlsIl0KfQo=
