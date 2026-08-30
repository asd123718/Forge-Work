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
import "./media/suggest.css";
import * as dom from "../../../../base/browser/dom.js";
import { List } from "../../../../base/browser/ui/list/listWidget.js";
import { ResizableHTMLElement } from "../../../../base/browser/ui/resizable/resizable.js";
import { getAriaId, SimpleSuggestWidgetItemRenderer } from "./simpleSuggestWidgetRenderer.js";
import { createCancelablePromise, disposableTimeout, TimeoutTimer } from "../../../../base/common/async.js";
import { Emitter, PauseableEmitter } from "../../../../base/common/event.js";
import { MutableDisposable, Disposable } from "../../../../base/common/lifecycle.js";
import { clamp } from "../../../../base/common/numbers.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { SuggestWidgetStatus } from "../../../../editor/contrib/suggest/browser/suggestWidgetStatus.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { canExpandCompletionItem, SimpleSuggestDetailsOverlay, SimpleSuggestDetailsWidget } from "./simpleSuggestWidgetDetails.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import * as strings from "../../../../base/common/strings.js";
import { status } from "../../../../base/browser/ui/aria/aria.js";
import { isWindows } from "../../../../base/common/platform.js";
import { editorSuggestWidgetForeground, editorSuggestWidgetSelectedBackground } from "../../../../editor/contrib/suggest/browser/suggestWidget.js";
import { getListStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { activeContrastBorder, focusBorder } from "../../../../platform/theme/common/colorRegistry.js";
const $ = dom.$;
var State = /* @__PURE__ */ ((State2) => {
  State2[State2["Hidden"] = 0] = "Hidden";
  State2[State2["Loading"] = 1] = "Loading";
  State2[State2["Empty"] = 2] = "Empty";
  State2[State2["Open"] = 3] = "Open";
  State2[State2["Frozen"] = 4] = "Frozen";
  State2[State2["Details"] = 5] = "Details";
  return State2;
})(State || {});
var WidgetPositionPreference = /* @__PURE__ */ ((WidgetPositionPreference2) => {
  WidgetPositionPreference2[WidgetPositionPreference2["Above"] = 0] = "Above";
  WidgetPositionPreference2[WidgetPositionPreference2["Below"] = 1] = "Below";
  return WidgetPositionPreference2;
})(WidgetPositionPreference || {});
const SimpleSuggestContext = {
  HasFocusedSuggestion: new RawContextKey("simpleSuggestWidgetHasFocusedSuggestion", false, localize("simpleSuggestWidgetHasFocusedSuggestion", "Whether any simple suggestion is focused")),
  HasNavigated: new RawContextKey("simpleSuggestWidgetHasNavigated", false, localize("simpleSuggestWidgetHasNavigated", "Whether the simple suggestion widget has been navigated downwards")),
  FirstSuggestionFocused: new RawContextKey("simpleSuggestWidgetFirstSuggestionFocused", false, localize("simpleSuggestWidgetFirstSuggestionFocused", "Whether the first simple suggestion is focused")),
  ExplicitlyInvoked: new RawContextKey("simpleSuggestWidgetExplicitlyInvoked", false, localize("simpleSuggestWidgetExplicitlyInvoked", "Whether the simple suggestion widget was explicitly invoked"))
};
var SuggestSelectionMode = /* @__PURE__ */ ((SuggestSelectionMode2) => {
  SuggestSelectionMode2["Partial"] = "partial";
  SuggestSelectionMode2["Always"] = "always";
  SuggestSelectionMode2["Never"] = "never";
  return SuggestSelectionMode2;
})(SuggestSelectionMode || {});
var Classes = /* @__PURE__ */ ((Classes2) => {
  Classes2["PartialSelection"] = "partial-selection";
  return Classes2;
})(Classes || {});
let SimpleSuggestWidget = class extends Disposable {
  constructor(_container, _persistedSize, _options, _getFontInfo, _onDidFontConfigurationChange, _getAdvancedExplainModeDetails, _instantiationService, _configurationService, _storageService, _contextKeyService) {
    super();
    this._container = _container;
    this._persistedSize = _persistedSize;
    this._options = _options;
    this._getFontInfo = _getFontInfo;
    this._onDidFontConfigurationChange = _onDidFontConfigurationChange;
    this._getAdvancedExplainModeDetails = _getAdvancedExplainModeDetails;
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._storageService = _storageService;
    this._state = 0 /* Hidden */;
    this._forceRenderingAbove = false;
    this._explainMode = false;
    this._pendingShowDetails = this._register(new MutableDisposable());
    this._pendingLayout = this._register(new MutableDisposable());
    this._ignoreFocusEvents = false;
    this._showTimeout = this._register(new TimeoutTimer());
    this._onDidSelect = this._register(new Emitter());
    this.onDidSelect = this._onDidSelect.event;
    this._onDidHide = this._register(new Emitter());
    this.onDidHide = this._onDidHide.event;
    this._onDidShow = this._register(new Emitter());
    this.onDidShow = this._onDidShow.event;
    this._onDidFocus = new PauseableEmitter();
    this.onDidFocus = this._onDidFocus.event;
    this._onDidBlurDetails = this._register(new Emitter());
    this.onDidBlurDetails = this._onDidBlurDetails.event;
    this.element = this._register(new ResizableHTMLElement());
    this.element.domNode.classList.add("workbench-suggest-widget");
    this._container.appendChild(this.element.domNode);
    this._ctxSuggestWidgetHasFocusedSuggestion = SimpleSuggestContext.HasFocusedSuggestion.bindTo(_contextKeyService);
    this._ctxSuggestWidgetHasBeenNavigated = SimpleSuggestContext.HasNavigated.bindTo(_contextKeyService);
    this._ctxFirstSuggestionFocused = SimpleSuggestContext.FirstSuggestionFocused.bindTo(_contextKeyService);
    this._ctxSuggestWidgetExplicitlyInvoked = SimpleSuggestContext.ExplicitlyInvoked.bindTo(_contextKeyService);
    class ResizeState {
      constructor(persistedSize, currentSize, persistHeight = false, persistWidth = false) {
        this.persistedSize = persistedSize;
        this.currentSize = currentSize;
        this.persistHeight = persistHeight;
        this.persistWidth = persistWidth;
      }
    }
    let state;
    this._register(this.element.onDidWillResize(() => {
      state = new ResizeState(this._persistedSize.restore(), this.element.size);
    }));
    this._register(this.element.onDidResize((e) => {
      this._resize(e.dimension.width, e.dimension.height);
      if (state) {
        state.persistHeight = state.persistHeight || !!e.north || !!e.south;
        state.persistWidth = state.persistWidth || !!e.east || !!e.west;
      }
      if (!e.done) {
        return;
      }
      if (state) {
        const { itemHeight, defaultSize } = this._getLayoutInfo();
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
      state = void 0;
    }));
    const applyIconStyle = () => this.element.domNode.classList.toggle("no-icons", !_configurationService.getValue("editor.suggest.showIcons"));
    applyIconStyle();
    const renderer = this._instantiationService.createInstance(SimpleSuggestWidgetItemRenderer, this._getFontInfo.bind(this), this._onDidFontConfigurationChange.bind(this));
    this._register(renderer);
    this._listElement = dom.append(this.element.domNode, $(".tree"));
    this._list = this._register(new List("SuggestWidget", this._listElement, {
      getHeight: () => this._getLayoutInfo().itemHeight,
      getTemplateId: () => "suggestion"
    }, [renderer], {
      alwaysConsumeMouseWheel: true,
      useShadows: false,
      mouseSupport: false,
      multipleSelectionSupport: false,
      accessibilityProvider: {
        getRole: () => isWindows ? "listitem" : "option",
        getWidgetAriaLabel: () => localize("suggest", "Suggest"),
        getWidgetRole: () => "listbox",
        getAriaLabel: (item) => {
          let label = item.textLabel;
          const kindLabel = item.completion.kindLabel ?? "";
          if (typeof item.completion.label !== "string") {
            const { detail: detail2, description } = item.completion.label;
            if (detail2 && description) {
              label = localize("label.full", "{0}{1}, {2} {3}", label, detail2, description, kindLabel);
            } else if (detail2) {
              label = localize("label.detail", "{0}{1} {2}", label, detail2, kindLabel);
            } else if (description) {
              label = localize("label.desc", "{0}, {1} {2}", label, description, kindLabel);
            }
          } else {
            label = localize("label", "{0}, {1}", label, kindLabel);
          }
          const { documentation, detail } = item.completion;
          const docs = strings.format(
            "{0}{1}",
            detail || "",
            documentation ? typeof documentation === "string" ? documentation : documentation.value : ""
          );
          return localize("ariaCurrenttSuggestionReadDetails", "{0}, docs: {1}", label, docs);
        }
      }
    }));
    this._register(this._list.onDidChangeFocus((e) => {
      if (e.indexes.length && e.indexes[0] !== 0) {
        this._ctxSuggestWidgetHasBeenNavigated.set(true);
      }
    }));
    this._messageElement = dom.append(this.element.domNode, dom.$(".message"));
    const details = this._register(_instantiationService.createInstance(SimpleSuggestDetailsWidget, this._getFontInfo.bind(this), this._onDidFontConfigurationChange.bind(this), this._getAdvancedExplainModeDetails.bind(this)));
    this._register(details.onDidClose(() => this.toggleDetails()));
    this._details = this._register(new SimpleSuggestDetailsOverlay(details, this._listElement, this._options.preventDetailsPlacements));
    this._register(dom.addDisposableListener(this._details.widget.domNode, "blur", (e) => this._onDidBlurDetails.fire(e)));
    if (_options.statusBarMenuId && _options.showStatusBarSettingId && _configurationService.getValue(_options.showStatusBarSettingId)) {
      this._status = this._register(_instantiationService.createInstance(SuggestWidgetStatus, this.element.domNode, _options.statusBarMenuId, { showIconsNoKeybindings: true }));
      this.element.domNode.classList.toggle("with-status-bar", true);
    }
    this._register(this._list.onMouseDown((e) => this._onListMouseDownOrTap(e)));
    this._register(this._list.onTap((e) => this._onListMouseDownOrTap(e)));
    this._register(this._list.onDidChangeFocus((e) => this._onListFocus(e)));
    this._register(this._list.onDidChangeSelection((e) => this._onListSelection(e)));
    this._register(this._onDidFontConfigurationChange(() => {
      if (this._completionModel) {
        this._list.splice(0, this._completionModel.items.length, this._completionModel.items);
      }
    }));
    this._register(_configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.suggest.showIcons")) {
        applyIconStyle();
      }
      if (_options.statusBarMenuId && _options.showStatusBarSettingId && e.affectsConfiguration(_options.showStatusBarSettingId)) {
        const showStatusBar = _configurationService.getValue(_options.showStatusBarSettingId);
        if (showStatusBar && !this._status) {
          this._status = this._register(_instantiationService.createInstance(SuggestWidgetStatus, this.element.domNode, _options.statusBarMenuId, { showIconsNoKeybindings: true }));
          this._status.show();
        } else if (showStatusBar && this._status) {
          this._status.show();
        } else if (this._status) {
          this._status.element.remove();
          this._status.dispose();
          this._status = void 0;
          this._layout(void 0);
        }
        this.element.domNode.classList.toggle("with-status-bar", showStatusBar);
      }
    }));
  }
  get list() {
    return this._list;
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
        this._ctxSuggestWidgetHasFocusedSuggestion.set(false);
      }
      this._clearAriaActiveDescendant();
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
      const id = getAriaId(index);
      const node = dom.getActiveWindow().document.activeElement;
      if (node && id) {
        node.setAttribute("aria-haspopup", "true");
        node.setAttribute("aria-autocomplete", "list");
        node.setAttribute("aria-activedescendant", id);
      } else {
        this._clearAriaActiveDescendant();
      }
      this._currentSuggestionDetails = createCancelablePromise(async (token) => {
        const loading = disposableTimeout(() => {
          if (this._isDetailsVisible()) {
            this._showDetails(true, false);
          }
        }, 250);
        const sub = token.onCancellationRequested(() => loading.dispose());
        try {
          return await Promise.resolve();
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
      }).catch();
    }
    this._ctxFirstSuggestionFocused.set(index === 0);
    this._onDidFocus.fire({ item, index, model: this._completionModel });
  }
  _clearAriaActiveDescendant() {
    const node = dom.getActiveWindow().document.activeElement;
    if (!node) {
      return;
    }
    node.setAttribute("aria-haspopup", "false");
    node.setAttribute("aria-autocomplete", "both");
    node.removeAttribute("aria-activedescendant");
  }
  setCompletionModel(completionModel) {
    this._completionModel = completionModel;
  }
  hasCompletions() {
    return this._completionModel?.items.length !== 0;
  }
  resetWidgetSize() {
    this._persistedSize.reset();
  }
  relayout(cursorPosition) {
    if (this._state === 0 /* Hidden */) {
      return;
    }
    this._cursorPosition = cursorPosition;
    this._layout(this.element.size);
    this._afterRender();
  }
  showTriggered(explicitlyInvoked, cursorPosition) {
    if (this._state !== 0 /* Hidden */) {
      return;
    }
    this._cursorPosition = cursorPosition;
    this._ctxSuggestWidgetExplicitlyInvoked.set(!!explicitlyInvoked);
    if (this._ctxSuggestWidgetExplicitlyInvoked.get()) {
      this._loadingTimeout = disposableTimeout(() => this._setState(1 /* Loading */), 250);
    }
  }
  showSuggestions(selectionIndex, isFrozen, isAuto, cursorPosition) {
    this._cursorPosition = cursorPosition;
    this._loadingTimeout?.dispose();
    const selectionMode = this._options?.selectionModeSettingId ? this._configurationService.getValue(this._options.selectionModeSettingId) : void 0;
    const noFocus = !this._ctxSuggestWidgetExplicitlyInvoked.get() && selectionMode === "never" /* Never */;
    if (isFrozen && this._state !== 2 /* Empty */ && this._state !== 0 /* Hidden */) {
      this._setState(4 /* Frozen */);
      return;
    }
    const visibleCount = this._completionModel?.items.length ?? 0;
    const isEmpty = visibleCount === 0;
    if (isEmpty) {
      this._setState(isAuto ? 0 /* Hidden */ : 2 /* Empty */);
      this._completionModel = void 0;
      return;
    }
    try {
      this._list.splice(0, this._list.length, this._completionModel?.items ?? []);
      this._setState(isFrozen ? 4 /* Frozen */ : 3 /* Open */);
      this._list.reveal(selectionIndex, 0);
      this._list.setFocus(noFocus ? [] : [selectionIndex]);
    } finally {
    }
    this._pendingLayout.value = dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.element.domNode), () => {
      this._pendingLayout.clear();
      this._layout(this.element.size);
    });
    this._updateListStyles();
    this._afterRender();
  }
  _updateListStyles() {
    if (this._options.selectionModeSettingId) {
      const selectionMode = this._configurationService.getValue(this._options.selectionModeSettingId);
      const usePartialStyle = !this._ctxSuggestWidgetExplicitlyInvoked.get() && selectionMode === "partial" /* Partial */;
      this._list.style(getListStylesWithMode(usePartialStyle));
      this.element.domNode.classList.toggle("partial-selection" /* PartialSelection */, usePartialStyle);
    }
  }
  setLineContext(lineContext) {
    if (this._completionModel) {
      this._completionModel.lineContext = lineContext;
    }
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
        if (this._status) {
          dom.hide(this._status.element);
        }
        dom.hide(this._listElement);
        dom.hide(this._messageElement);
        dom.hide(this.element.domNode);
        this._details.hide(true);
        this._status?.hide();
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
        this._messageElement.textContent = SimpleSuggestWidget.LOADING_MESSAGE;
        dom.hide(this._listElement);
        if (this._status) {
          dom.hide(this._status.element);
        }
        dom.show(this._messageElement);
        this._details.hide();
        this._show();
        this._focusedItem = void 0;
        status(SimpleSuggestWidget.LOADING_MESSAGE);
        break;
      case 2 /* Empty */:
        this.element.domNode.classList.add("message");
        this._messageElement.textContent = SimpleSuggestWidget.NO_SUGGESTIONS_MESSAGE;
        dom.hide(this._listElement);
        if (this._status) {
          dom.hide(this._status.element);
        }
        dom.show(this._messageElement);
        this._details.hide();
        this._show();
        this._focusedItem = void 0;
        status(SimpleSuggestWidget.NO_SUGGESTIONS_MESSAGE);
        break;
      case 3 /* Open */:
        dom.hide(this._messageElement);
        this._showListAndStatus();
        this._show();
        break;
      case 4 /* Frozen */:
        dom.hide(this._messageElement);
        this._showListAndStatus();
        this._show();
        break;
      case 5 /* Details */:
        dom.hide(this._messageElement);
        this._showListAndStatus();
        this._details.show();
        this._show();
        break;
    }
  }
  _showListAndStatus() {
    if (this._status) {
      dom.show(this._listElement, this._status.element);
    } else {
      dom.show(this._listElement);
    }
  }
  _show() {
    this._status?.show();
    dom.show(this.element.domNode);
    this._layout(this._persistedSize.restore());
    this._onDidShow.fire(this);
    this._showTimeout.cancelAndSet(() => {
      this.element.domNode.classList.add("visible");
    }, 100);
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
      this._setDetailsVisible(false);
      this._details.hide();
      this.element.domNode.classList.remove("shows-details");
    } else if ((canExpandCompletionItem(this._list.getFocusedElements()[0]) || this._explainMode) && (this._state === 3 /* Open */ || this._state === 5 /* Details */ || this._state === 4 /* Frozen */)) {
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
  hide() {
    this._pendingLayout.clear();
    this._pendingShowDetails.clear();
    this._loadingTimeout?.dispose();
    this._ctxSuggestWidgetHasBeenNavigated.reset();
    this._ctxFirstSuggestionFocused.reset();
    this._ctxSuggestWidgetExplicitlyInvoked.reset();
    this._setState(0 /* Hidden */);
    this._onDidHide.fire(this);
    dom.hide(this.element.domNode);
    this.element.clearSashHoverState();
    const dim = this._persistedSize.restore();
    const minPersistedHeight = Math.ceil(this._getLayoutInfo().itemHeight * 4.3);
    if (dim && dim.height < minPersistedHeight) {
      this._persistedSize.store(dim.with(void 0, minPersistedHeight));
    }
  }
  _layout(size) {
    if (!this._cursorPosition) {
      return;
    }
    const bodyBox = dom.getClientArea(this._container.ownerDocument.body);
    const info = this._getLayoutInfo();
    if (!size) {
      size = info.defaultSize;
    }
    let height = size.height;
    let width = size.width;
    if (this._status) {
      this._status.element.style.height = `${info.itemHeight}px`;
    }
    const maxWidth = bodyBox.width - info.borderHeight - 2 * info.horizontalPadding;
    if (width > maxWidth) {
      width = maxWidth;
    }
    const preferredWidth = this._completionModel ? this._completionModel.stats.pLabelLen * info.typicalHalfwidthCharacterWidth : width;
    const cappedListContentHeight = Math.min(this._list.contentHeight, info.itemHeight * 12);
    const fullHeight = info.statusBarHeight + cappedListContentHeight + this._messageElement.clientHeight + info.borderHeight;
    const minHeight = info.itemHeight + info.statusBarHeight;
    const editorBox = dom.getDomNodePagePosition(this._container);
    const cursorBox = {
      top: this._cursorPosition.top - editorBox.top,
      left: this._cursorPosition.left,
      height: this._cursorPosition.height
    };
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
      this._preference = 0 /* Above */;
      this.element.enableSashes(true, true, false, false);
      maxHeight = maxHeightAbove;
    } else {
      this._preference = 1 /* Below */;
      this.element.enableSashes(false, true, true, false);
      maxHeight = maxHeightBelow;
    }
    this.element.preferredSize = new dom.Dimension(preferredWidth, info.defaultSize.height);
    this.element.maxSize = new dom.Dimension(maxWidth, maxHeight);
    this.element.minSize = new dom.Dimension(220, minHeight);
    this._cappedHeight = height === fullHeight ? { wanted: this._cappedHeight?.wanted ?? size.height, capped: height } : void 0;
    let anchorLeft = this._cursorPosition.left;
    const wouldOverflowRight = anchorLeft + width > bodyBox.width;
    if (wouldOverflowRight) {
      anchorLeft = this._cursorPosition.left - width;
    }
    this.element.domNode.style.left = `${anchorLeft}px`;
    if (this._preference === 0 /* Above */) {
      this.element.domNode.style.top = `${this._cursorPosition.top - height - info.borderHeight}px`;
    } else {
      this.element.domNode.style.top = `${this._cursorPosition.top + this._cursorPosition.height}px`;
    }
    this._resize(width, height);
  }
  _afterRender() {
    if (this._state === 2 /* Empty */ || this._state === 1 /* Loading */) {
      return;
    }
    if (this._isDetailsVisible() && !this._details.widget.isEmpty) {
      this._details.show();
    }
    this._positionDetails();
  }
  _resize(width, height) {
    const { width: maxWidth, height: maxHeight } = this.element.maxSize;
    width = Math.min(maxWidth, width);
    if (maxHeight) {
      height = Math.min(maxHeight, height);
    }
    const { statusBarHeight } = this._getLayoutInfo();
    this._list.layout(height - statusBarHeight, width);
    this._listElement.style.height = `${height - statusBarHeight}px`;
    this._listElement.style.width = `${width}px`;
    this.element.layout(height, width);
    if (this._cursorPosition && this._preference === 0 /* Above */) {
      this.element.domNode.style.top = `${this._cursorPosition.top - height}px`;
    }
    this._positionDetails();
  }
  _positionDetails() {
    if (this._isDetailsVisible()) {
      this._details.placeAtAnchor(this.element.domNode);
    }
  }
  _getLayoutInfo() {
    const fontInfo = this._getFontInfo();
    const itemHeight = clamp(fontInfo.lineHeight, 8, 1e3);
    const statusBarHeight = !this._options.statusBarMenuId || !this._options.showStatusBarSettingId || !this._configurationService.getValue(this._options.showStatusBarSettingId) || this._state === 2 /* Empty */ || this._state === 1 /* Loading */ ? 0 : itemHeight;
    const borderWidth = this._details.widget.borderWidth;
    const borderHeight = 2 * borderWidth;
    return {
      itemHeight,
      statusBarHeight,
      borderWidth,
      borderHeight,
      typicalHalfwidthCharacterWidth: 10,
      verticalPadding: 22,
      horizontalPadding: 14,
      defaultSize: new dom.Dimension(430, statusBarHeight + 12 * itemHeight + borderHeight)
    };
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
    }
  }
  selectNext() {
    this._clearPartialSelectionState();
    this._list.focusNext(1, true);
    const focus = this._list.getFocus();
    if (focus.length > 0) {
      this._list.reveal(focus[0]);
    }
    return true;
  }
  selectNextPage() {
    this._clearPartialSelectionState();
    this._list.focusNextPage();
    const focus = this._list.getFocus();
    if (focus.length > 0) {
      this._list.reveal(focus[0]);
    }
    return true;
  }
  selectPrevious() {
    this._clearPartialSelectionState();
    this._list.focusPrevious(1, true);
    const focus = this._list.getFocus();
    if (focus.length > 0) {
      this._list.reveal(focus[0]);
    }
    return true;
  }
  selectPreviousPage() {
    this._clearPartialSelectionState();
    this._list.focusPreviousPage();
    const focus = this._list.getFocus();
    if (focus.length > 0) {
      this._list.reveal(focus[0]);
    }
    return true;
  }
  _clearPartialSelectionState() {
    this._list.style(getListStylesWithMode(false));
    this.element.domNode.classList.remove("partial-selection" /* PartialSelection */);
  }
  getFocusedItem() {
    if (this._completionModel) {
      return {
        item: this._list.getFocusedElements()[0],
        index: this._list.getFocus()[0],
        model: this._completionModel
      };
    }
    return void 0;
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
SimpleSuggestWidget.LOADING_MESSAGE = localize("suggestWidget.loading", "Loading...");
SimpleSuggestWidget.NO_SUGGESTIONS_MESSAGE = localize("suggestWidget.noSuggestions", "No suggestions.");
SimpleSuggestWidget = __decorateClass([
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IStorageService),
  __decorateParam(9, IContextKeyService)
], SimpleSuggestWidget);
function getListStylesWithMode(partial) {
  if (partial) {
    return getListStyles({
      listInactiveFocusOutline: focusBorder,
      listInactiveFocusForeground: editorSuggestWidgetForeground
    });
  } else {
    return getListStyles({
      listInactiveFocusBackground: editorSuggestWidgetSelectedBackground,
      listInactiveFocusOutline: activeContrastBorder
    });
  }
}
export {
  SimpleSuggestContext,
  SimpleSuggestWidget,
  SuggestSelectionMode
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzdWdnZXN0XFxicm93c2VyXFxzaW1wbGVTdWdnZXN0V2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3N1Z2dlc3QuY3NzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElMaXN0RXZlbnQsIElMaXN0R2VzdHVyZUV2ZW50LCBJTGlzdE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElMaXN0U3R5bGVzLCBMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBSZXNpemFibGVIVE1MRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9yZXNpemFibGUvcmVzaXphYmxlLmpzJztcbmltcG9ydCB7IFNpbXBsZUNvbXBsZXRpb25JdGVtIH0gZnJvbSAnLi9zaW1wbGVDb21wbGV0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBMaW5lQ29udGV4dCwgU2ltcGxlQ29tcGxldGlvbk1vZGVsIH0gZnJvbSAnLi9zaW1wbGVDb21wbGV0aW9uTW9kZWwuanMnO1xuaW1wb3J0IHsgZ2V0QXJpYUlkLCBTaW1wbGVTdWdnZXN0V2lkZ2V0SXRlbVJlbmRlcmVyLCB0eXBlIElTaW1wbGVTdWdnZXN0V2lkZ2V0Rm9udEluZm8gfSBmcm9tICcuL3NpbXBsZVN1Z2dlc3RXaWRnZXRSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIGRpc3Bvc2FibGVUaW1lb3V0LCBUaW1lb3V0VGltZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCwgUGF1c2VhYmxlRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE11dGFibGVEaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjbGFtcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTdWdnZXN0V2lkZ2V0U3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3N1Z2dlc3RXaWRnZXRTdGF0dXMuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBjYW5FeHBhbmRDb21wbGV0aW9uSXRlbSwgU2ltcGxlU3VnZ2VzdERldGFpbHNPdmVybGF5LCBTaW1wbGVTdWdnZXN0RGV0YWlsc1dpZGdldCwgdHlwZSBTaW1wbGVTdWdnZXN0RGV0YWlsc1BsYWNlbWVudCB9IGZyb20gJy4vc2ltcGxlU3VnZ2VzdFdpZGdldERldGFpbHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IHN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZWRpdG9yU3VnZ2VzdFdpZGdldEZvcmVncm91bmQsIGVkaXRvclN1Z2dlc3RXaWRnZXRTZWxlY3RlZEJhY2tncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvc3VnZ2VzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBnZXRMaXN0U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyLCBmb2N1c0JvcmRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG5jb25zdCBlbnVtIFN0YXRlIHtcblx0SGlkZGVuLFxuXHRMb2FkaW5nLFxuXHRFbXB0eSxcblx0T3Blbixcblx0RnJvemVuLFxuXHREZXRhaWxzXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNpbXBsZVNlbGVjdGVkU3VnZ2VzdGlvbjxUIGV4dGVuZHMgU2ltcGxlQ29tcGxldGlvbkl0ZW0+IHtcblx0aXRlbTogVDtcblx0aW5kZXg6IG51bWJlcjtcblx0bW9kZWw6IFNpbXBsZUNvbXBsZXRpb25Nb2RlbDxUPjtcbn1cblxuaW50ZXJmYWNlIElQZXJzaXN0ZWRXaWRnZXRTaXplRGVsZWdhdGUge1xuXHRyZXN0b3JlKCk6IGRvbS5EaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cdHN0b3JlKHNpemU6IGRvbS5EaW1lbnNpb24pOiB2b2lkO1xuXHRyZXNldCgpOiB2b2lkO1xufVxuXG5jb25zdCBlbnVtIFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSB7XG5cdEFib3ZlLFxuXHRCZWxvd1xufVxuXG5leHBvcnQgY29uc3QgU2ltcGxlU3VnZ2VzdENvbnRleHQgPSB7XG5cdEhhc0ZvY3VzZWRTdWdnZXN0aW9uOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2ltcGxlU3VnZ2VzdFdpZGdldEhhc0ZvY3VzZWRTdWdnZXN0aW9uJywgZmFsc2UsIGxvY2FsaXplKCdzaW1wbGVTdWdnZXN0V2lkZ2V0SGFzRm9jdXNlZFN1Z2dlc3Rpb24nLCBcIldoZXRoZXIgYW55IHNpbXBsZSBzdWdnZXN0aW9uIGlzIGZvY3VzZWRcIikpLFxuXHRIYXNOYXZpZ2F0ZWQ6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzaW1wbGVTdWdnZXN0V2lkZ2V0SGFzTmF2aWdhdGVkJywgZmFsc2UsIGxvY2FsaXplKCdzaW1wbGVTdWdnZXN0V2lkZ2V0SGFzTmF2aWdhdGVkJywgXCJXaGV0aGVyIHRoZSBzaW1wbGUgc3VnZ2VzdGlvbiB3aWRnZXQgaGFzIGJlZW4gbmF2aWdhdGVkIGRvd253YXJkc1wiKSksXG5cdEZpcnN0U3VnZ2VzdGlvbkZvY3VzZWQ6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzaW1wbGVTdWdnZXN0V2lkZ2V0Rmlyc3RTdWdnZXN0aW9uRm9jdXNlZCcsIGZhbHNlLCBsb2NhbGl6ZSgnc2ltcGxlU3VnZ2VzdFdpZGdldEZpcnN0U3VnZ2VzdGlvbkZvY3VzZWQnLCBcIldoZXRoZXIgdGhlIGZpcnN0IHNpbXBsZSBzdWdnZXN0aW9uIGlzIGZvY3VzZWRcIikpLFxuXHRFeHBsaWNpdGx5SW52b2tlZDogbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3NpbXBsZVN1Z2dlc3RXaWRnZXRFeHBsaWNpdGx5SW52b2tlZCcsIGZhbHNlLCBsb2NhbGl6ZSgnc2ltcGxlU3VnZ2VzdFdpZGdldEV4cGxpY2l0bHlJbnZva2VkJywgXCJXaGV0aGVyIHRoZSBzaW1wbGUgc3VnZ2VzdGlvbiB3aWRnZXQgd2FzIGV4cGxpY2l0bHkgaW52b2tlZFwiKSksXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElXb3JrYmVuY2hTdWdnZXN0V2lkZ2V0T3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBUaGUge0BsaW5rIE1lbnVJZH0gdG8gdXNlIGZvciB0aGUgc3RhdHVzIGJhci4gSXRlbXMgb24gdGhlIG1lbnUgbXVzdCB1c2UgdGhlIGdyb3VwcyBgJ2xlZnQnYFxuXHQgKiBhbmQgYCdyaWdodCdgLlxuXHQgKi9cblx0c3RhdHVzQmFyTWVudUlkPzogTWVudUlkO1xuXG5cdC8qKlxuXHQgKiBUaGUgc2V0dGluZyBmb3Igc2hvd2luZyB0aGUgc3RhdHVzIGJhci5cblx0ICovXG5cdHNob3dTdGF0dXNCYXJTZXR0aW5nSWQ/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSBzZXR0aW5nIGZvciBzZWxlY3Rpb24gbW9kZS5cblx0ICovXG5cdHNlbGVjdGlvbk1vZGVTZXR0aW5nSWQ/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIERpc2FibGVzIHNwZWNpZmljIGRldGFpbCBwbGFjZW1lbnRzIHdoZW4gcG9zaXRpb25pbmcgdGhlIGRldGFpbHMgb3ZlcmxheS5cblx0ICovXG5cdHByZXZlbnREZXRhaWxzUGxhY2VtZW50cz86IHJlYWRvbmx5IFNpbXBsZVN1Z2dlc3REZXRhaWxzUGxhY2VtZW50W107XG59XG5cbi8qKlxuICogQ29udHJvbHMgaG93IHN1Z2dlc3Qgc2VsZWN0aW9uIHdvcmtzXG4qL1xuZXhwb3J0IGNvbnN0IGVudW0gU3VnZ2VzdFNlbGVjdGlvbk1vZGUge1xuXHQvKipcblx0ICogRGVmYXVsdC4gV2lsbCBzaG93IGEgYm9yZGVyIGFuZCBvbmx5IGFjY2VwdCB2aWEgVGFiIHVudGlsIG5hdmlnYXRpb24gaGFzIG9jY3VycmVkLiBBZnRlciB0aGF0LCBpdCB3aWxsIHNob3cgc2VsZWN0aW9uIGFuZCBhY2NlcHQgdmlhIEVudGVyIG9yIFRhYi5cblx0ICovXG5cdFBhcnRpYWwgPSAncGFydGlhbCcsXG5cdC8qKlxuXHQgKiBBbHdheXMgc2VsZWN0LCB3aGF0IGVudGVyIGRvZXMgZGVwZW5kcyBvbiBydW5PbkVudGVyLlxuXHQgKi9cblx0QWx3YXlzID0gJ2Fsd2F5cycsXG5cdC8qKlxuXHQgKiBVc2VyIG5lZWRzIHRvIHByZXNzIGRvd24gdG8gc2VsZWN0LlxuXHQgKi9cblx0TmV2ZXIgPSAnbmV2ZXInXG59XG5cbmNvbnN0IGVudW0gQ2xhc3NlcyB7XG5cdFBhcnRpYWxTZWxlY3Rpb24gPSAncGFydGlhbC1zZWxlY3Rpb24nLFxufVxuXG5leHBvcnQgY2xhc3MgU2ltcGxlU3VnZ2VzdFdpZGdldDxUTW9kZWwgZXh0ZW5kcyBTaW1wbGVDb21wbGV0aW9uTW9kZWw8VEl0ZW0+LCBUSXRlbSBleHRlbmRzIFNpbXBsZUNvbXBsZXRpb25JdGVtPiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIExPQURJTkdfTUVTU0FHRTogc3RyaW5nID0gbG9jYWxpemUoJ3N1Z2dlc3RXaWRnZXQubG9hZGluZycsIFwiTG9hZGluZy4uLlwiKTtcblx0cHJpdmF0ZSBzdGF0aWMgTk9fU1VHR0VTVElPTlNfTUVTU0FHRTogc3RyaW5nID0gbG9jYWxpemUoJ3N1Z2dlc3RXaWRnZXQubm9TdWdnZXN0aW9ucycsIFwiTm8gc3VnZ2VzdGlvbnMuXCIpO1xuXG5cdHByaXZhdGUgX3N0YXRlOiBTdGF0ZSA9IFN0YXRlLkhpZGRlbjtcblx0cHJpdmF0ZSBfbG9hZGluZ1RpbWVvdXQ/OiBJRGlzcG9zYWJsZTtcblx0cHJpdmF0ZSBfY29tcGxldGlvbk1vZGVsPzogVE1vZGVsO1xuXHRwcml2YXRlIF9jYXBwZWRIZWlnaHQ/OiB7IHdhbnRlZDogbnVtYmVyOyBjYXBwZWQ6IG51bWJlciB9O1xuXHRwcml2YXRlIF9mb3JjZVJlbmRlcmluZ0Fib3ZlOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2V4cGxhaW5Nb2RlOiBib29sZWFuID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBfcHJlZmVyZW5jZT86IFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1Nob3dEZXRhaWxzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nTGF5b3V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIF9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHM/OiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPjtcblx0cHJpdmF0ZSBfZm9jdXNlZEl0ZW0/OiBUSXRlbTtcblx0cHJpdmF0ZSBfaWdub3JlRm9jdXNFdmVudHM6IGJvb2xlYW4gPSBmYWxzZTtcblx0cmVhZG9ubHkgZWxlbWVudDogUmVzaXphYmxlSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21lc3NhZ2VFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfbGlzdEVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saXN0OiBMaXN0PFRJdGVtPjtcblx0cHJpdmF0ZSBfc3RhdHVzPzogU3VnZ2VzdFdpZGdldFN0YXR1cztcblx0cHJpdmF0ZSByZWFkb25seSBfZGV0YWlsczogU2ltcGxlU3VnZ2VzdERldGFpbHNPdmVybGF5O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nob3dUaW1lb3V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRpbWVvdXRUaW1lcigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNlbGVjdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTaW1wbGVTZWxlY3RlZFN1Z2dlc3Rpb248VEl0ZW0+PigpKTtcblx0cmVhZG9ubHkgb25EaWRTZWxlY3Q6IEV2ZW50PElTaW1wbGVTZWxlY3RlZFN1Z2dlc3Rpb248VEl0ZW0+PiA9IHRoaXMuX29uRGlkU2VsZWN0LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEhpZGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx0aGlzPigpKTtcblx0cmVhZG9ubHkgb25EaWRIaWRlOiBFdmVudDx0aGlzPiA9IHRoaXMuX29uRGlkSGlkZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTaG93ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dGhpcz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2hvdzogRXZlbnQ8dGhpcz4gPSB0aGlzLl9vbkRpZFNob3cuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRm9jdXMgPSBuZXcgUGF1c2VhYmxlRW1pdHRlcjxJU2ltcGxlU2VsZWN0ZWRTdWdnZXN0aW9uPFRJdGVtPj4oKTtcblx0cmVhZG9ubHkgb25EaWRGb2N1czogRXZlbnQ8SVNpbXBsZVNlbGVjdGVkU3VnZ2VzdGlvbjxUSXRlbT4+ID0gdGhpcy5fb25EaWRGb2N1cy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRCbHVyRGV0YWlscyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEZvY3VzRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEJsdXJEZXRhaWxzID0gdGhpcy5fb25EaWRCbHVyRGV0YWlscy5ldmVudDtcblxuXHRnZXQgbGlzdCgpOiBMaXN0PFRJdGVtPiB7IHJldHVybiB0aGlzLl9saXN0OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY3R4U3VnZ2VzdFdpZGdldEhhc0ZvY3VzZWRTdWdnZXN0aW9uOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY3R4U3VnZ2VzdFdpZGdldEhhc0JlZW5OYXZpZ2F0ZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdHhGaXJzdFN1Z2dlc3Rpb25Gb2N1c2VkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY3R4U3VnZ2VzdFdpZGdldEV4cGxpY2l0bHlJbnZva2VkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3BlcnNpc3RlZFNpemU6IElQZXJzaXN0ZWRXaWRnZXRTaXplRGVsZWdhdGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSVdvcmtiZW5jaFN1Z2dlc3RXaWRnZXRPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldEZvbnRJbmZvOiAoKSA9PiBJU2ltcGxlU3VnZ2VzdFdpZGdldEZvbnRJbmZvLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRm9udENvbmZpZ3VyYXRpb25DaGFuZ2U6IEV2ZW50PHZvaWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldEFkdmFuY2VkRXhwbGFpbk1vZGVEZXRhaWxzOiAoKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5lbGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJlc2l6YWJsZUhUTUxFbGVtZW50KCkpO1xuXHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3dvcmtiZW5jaC1zdWdnZXN0LXdpZGdldCcpO1xuXHRcdHRoaXMuX2NvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmVsZW1lbnQuZG9tTm9kZSk7XG5cdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldEhhc0ZvY3VzZWRTdWdnZXN0aW9uID0gU2ltcGxlU3VnZ2VzdENvbnRleHQuSGFzRm9jdXNlZFN1Z2dlc3Rpb24uYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldEhhc0JlZW5OYXZpZ2F0ZWQgPSBTaW1wbGVTdWdnZXN0Q29udGV4dC5IYXNOYXZpZ2F0ZWQuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fY3R4Rmlyc3RTdWdnZXN0aW9uRm9jdXNlZCA9IFNpbXBsZVN1Z2dlc3RDb250ZXh0LkZpcnN0U3VnZ2VzdGlvbkZvY3VzZWQuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldEV4cGxpY2l0bHlJbnZva2VkID0gU2ltcGxlU3VnZ2VzdENvbnRleHQuRXhwbGljaXRseUludm9rZWQuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjbGFzcyBSZXNpemVTdGF0ZSB7XG5cdFx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdFx0cmVhZG9ubHkgcGVyc2lzdGVkU2l6ZTogZG9tLkRpbWVuc2lvbiB8IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVhZG9ubHkgY3VycmVudFNpemU6IGRvbS5EaW1lbnNpb24sXG5cdFx0XHRcdHB1YmxpYyBwZXJzaXN0SGVpZ2h0ID0gZmFsc2UsXG5cdFx0XHRcdHB1YmxpYyBwZXJzaXN0V2lkdGggPSBmYWxzZSxcblx0XHRcdCkgeyB9XG5cdFx0fVxuXG5cdFx0bGV0IHN0YXRlOiBSZXNpemVTdGF0ZSB8IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVsZW1lbnQub25EaWRXaWxsUmVzaXplKCgpID0+IHtcblx0XHRcdC8vIHRoaXMuX3ByZWZlcmVuY2VMb2NrZWQgPSB0cnVlO1xuXHRcdFx0c3RhdGUgPSBuZXcgUmVzaXplU3RhdGUodGhpcy5fcGVyc2lzdGVkU2l6ZS5yZXN0b3JlKCksIHRoaXMuZWxlbWVudC5zaXplKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lbGVtZW50Lm9uRGlkUmVzaXplKGUgPT4ge1xuXG5cdFx0XHR0aGlzLl9yZXNpemUoZS5kaW1lbnNpb24ud2lkdGgsIGUuZGltZW5zaW9uLmhlaWdodCk7XG5cblx0XHRcdGlmIChzdGF0ZSkge1xuXHRcdFx0XHRzdGF0ZS5wZXJzaXN0SGVpZ2h0ID0gc3RhdGUucGVyc2lzdEhlaWdodCB8fCAhIWUubm9ydGggfHwgISFlLnNvdXRoO1xuXHRcdFx0XHRzdGF0ZS5wZXJzaXN0V2lkdGggPSBzdGF0ZS5wZXJzaXN0V2lkdGggfHwgISFlLmVhc3QgfHwgISFlLndlc3Q7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghZS5kb25lKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHN0YXRlKSB7XG5cdFx0XHRcdC8vIG9ubHkgc3RvcmUgd2lkdGggb3IgaGVpZ2h0IHZhbHVlIHRoYXQgaGF2ZSBjaGFuZ2VkIGFuZCBhbHNvXG5cdFx0XHRcdC8vIG9ubHkgc3RvcmUgY2hhbmdlcyB0aGF0IGFyZSBhYm92ZSBhIGNlcnRhaW4gdGhyZXNob2xkXG5cdFx0XHRcdGNvbnN0IHsgaXRlbUhlaWdodCwgZGVmYXVsdFNpemUgfSA9IHRoaXMuX2dldExheW91dEluZm8oKTtcblx0XHRcdFx0Y29uc3QgdGhyZXNob2xkID0gTWF0aC5yb3VuZChpdGVtSGVpZ2h0IC8gMik7XG5cdFx0XHRcdGxldCB7IHdpZHRoLCBoZWlnaHQgfSA9IHRoaXMuZWxlbWVudC5zaXplO1xuXHRcdFx0XHRpZiAoIXN0YXRlLnBlcnNpc3RIZWlnaHQgfHwgTWF0aC5hYnMoc3RhdGUuY3VycmVudFNpemUuaGVpZ2h0IC0gaGVpZ2h0KSA8PSB0aHJlc2hvbGQpIHtcblx0XHRcdFx0XHRoZWlnaHQgPSBzdGF0ZS5wZXJzaXN0ZWRTaXplPy5oZWlnaHQgPz8gZGVmYXVsdFNpemUuaGVpZ2h0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghc3RhdGUucGVyc2lzdFdpZHRoIHx8IE1hdGguYWJzKHN0YXRlLmN1cnJlbnRTaXplLndpZHRoIC0gd2lkdGgpIDw9IHRocmVzaG9sZCkge1xuXHRcdFx0XHRcdHdpZHRoID0gc3RhdGUucGVyc2lzdGVkU2l6ZT8ud2lkdGggPz8gZGVmYXVsdFNpemUud2lkdGg7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcGVyc2lzdGVkU2l6ZS5zdG9yZShuZXcgZG9tLkRpbWVuc2lvbih3aWR0aCwgaGVpZ2h0KSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHJlc2V0IHdvcmtpbmcgc3RhdGVcblx0XHRcdC8vIHRoaXMuX3ByZWZlcmVuY2VMb2NrZWQgPSBmYWxzZTtcblx0XHRcdHN0YXRlID0gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGFwcGx5SWNvblN0eWxlID0gKCkgPT4gdGhpcy5lbGVtZW50LmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnbm8taWNvbnMnLCAhX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdlZGl0b3Iuc3VnZ2VzdC5zaG93SWNvbnMnKSk7XG5cdFx0YXBwbHlJY29uU3R5bGUoKTtcblxuXHRcdGNvbnN0IHJlbmRlcmVyID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2ltcGxlU3VnZ2VzdFdpZGdldEl0ZW1SZW5kZXJlciwgdGhpcy5fZ2V0Rm9udEluZm8uYmluZCh0aGlzKSwgdGhpcy5fb25EaWRGb250Q29uZmlndXJhdGlvbkNoYW5nZS5iaW5kKHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZW5kZXJlcik7XG5cdFx0dGhpcy5fbGlzdEVsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudC5kb21Ob2RlLCAkKCcudHJlZScpKTtcblx0XHR0aGlzLl9saXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IExpc3Q8VEl0ZW0+KCdTdWdnZXN0V2lkZ2V0JywgdGhpcy5fbGlzdEVsZW1lbnQsIHtcblx0XHRcdGdldEhlaWdodDogKCk6IG51bWJlciA9PiB0aGlzLl9nZXRMYXlvdXRJbmZvKCkuaXRlbUhlaWdodCxcblx0XHRcdGdldFRlbXBsYXRlSWQ6ICgpOiBzdHJpbmcgPT4gJ3N1Z2dlc3Rpb24nXG5cdFx0fSwgW3JlbmRlcmVyXSwge1xuXHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IHRydWUsXG5cdFx0XHR1c2VTaGFkb3dzOiBmYWxzZSxcblx0XHRcdG1vdXNlU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdGdldFJvbGU6ICgpID0+IGlzV2luZG93cyA/ICdsaXN0aXRlbScgOiAnb3B0aW9uJyxcblx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsOiAoKSA9PiBsb2NhbGl6ZSgnc3VnZ2VzdCcsIFwiU3VnZ2VzdFwiKSxcblx0XHRcdFx0Z2V0V2lkZ2V0Um9sZTogKCkgPT4gJ2xpc3Rib3gnLFxuXHRcdFx0XHRnZXRBcmlhTGFiZWw6IChpdGVtOiBTaW1wbGVDb21wbGV0aW9uSXRlbSkgPT4ge1xuXHRcdFx0XHRcdGxldCBsYWJlbCA9IGl0ZW0udGV4dExhYmVsO1xuXHRcdFx0XHRcdGNvbnN0IGtpbmRMYWJlbCA9IGl0ZW0uY29tcGxldGlvbi5raW5kTGFiZWwgPz8gJyc7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBpdGVtLmNvbXBsZXRpb24ubGFiZWwgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB7IGRldGFpbCwgZGVzY3JpcHRpb24gfSA9IGl0ZW0uY29tcGxldGlvbi5sYWJlbDtcblx0XHRcdFx0XHRcdGlmIChkZXRhaWwgJiYgZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRcdFx0bGFiZWwgPSBsb2NhbGl6ZSgnbGFiZWwuZnVsbCcsICd7MH17MX0sIHsyfSB7M30nLCBsYWJlbCwgZGV0YWlsLCBkZXNjcmlwdGlvbiwga2luZExhYmVsKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoZGV0YWlsKSB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsID0gbG9jYWxpemUoJ2xhYmVsLmRldGFpbCcsICd7MH17MX0gezJ9JywgbGFiZWwsIGRldGFpbCwga2luZExhYmVsKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRcdFx0bGFiZWwgPSBsb2NhbGl6ZSgnbGFiZWwuZGVzYycsICd7MH0sIHsxfSB7Mn0nLCBsYWJlbCwgZGVzY3JpcHRpb24sIGtpbmRMYWJlbCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGxhYmVsID0gbG9jYWxpemUoJ2xhYmVsJywgJ3swfSwgezF9JywgbGFiZWwsIGtpbmRMYWJlbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHsgZG9jdW1lbnRhdGlvbiwgZGV0YWlsIH0gPSBpdGVtLmNvbXBsZXRpb247XG5cdFx0XHRcdFx0Y29uc3QgZG9jcyA9IHN0cmluZ3MuZm9ybWF0KFxuXHRcdFx0XHRcdFx0J3swfXsxfScsXG5cdFx0XHRcdFx0XHRkZXRhaWwgfHwgJycsXG5cdFx0XHRcdFx0XHRkb2N1bWVudGF0aW9uID8gKHR5cGVvZiBkb2N1bWVudGF0aW9uID09PSAnc3RyaW5nJyA/IGRvY3VtZW50YXRpb24gOiBkb2N1bWVudGF0aW9uLnZhbHVlKSA6ICcnKTtcblxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYXJpYUN1cnJlbnR0U3VnZ2VzdGlvblJlYWREZXRhaWxzJywgXCJ7MH0sIGRvY3M6IHsxfVwiLCBsYWJlbCwgZG9jcyk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xpc3Qub25EaWRDaGFuZ2VGb2N1cyhlID0+IHtcblx0XHRcdGlmIChlLmluZGV4ZXMubGVuZ3RoICYmIGUuaW5kZXhlc1swXSAhPT0gMCkge1xuXHRcdFx0XHR0aGlzLl9jdHhTdWdnZXN0V2lkZ2V0SGFzQmVlbk5hdmlnYXRlZC5zZXQodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX21lc3NhZ2VFbGVtZW50ID0gZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQuZG9tTm9kZSwgZG9tLiQoJy5tZXNzYWdlJykpO1xuXG5cdFx0Y29uc3QgZGV0YWlsczogU2ltcGxlU3VnZ2VzdERldGFpbHNXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihfaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2ltcGxlU3VnZ2VzdERldGFpbHNXaWRnZXQsIHRoaXMuX2dldEZvbnRJbmZvLmJpbmQodGhpcyksIHRoaXMuX29uRGlkRm9udENvbmZpZ3VyYXRpb25DaGFuZ2UuYmluZCh0aGlzKSwgdGhpcy5fZ2V0QWR2YW5jZWRFeHBsYWluTW9kZURldGFpbHMuYmluZCh0aGlzKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRldGFpbHMub25EaWRDbG9zZSgoKSA9PiB0aGlzLnRvZ2dsZURldGFpbHMoKSkpO1xuXHRcdHRoaXMuX2RldGFpbHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgU2ltcGxlU3VnZ2VzdERldGFpbHNPdmVybGF5KGRldGFpbHMsIHRoaXMuX2xpc3RFbGVtZW50LCB0aGlzLl9vcHRpb25zLnByZXZlbnREZXRhaWxzUGxhY2VtZW50cykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZGV0YWlscy53aWRnZXQuZG9tTm9kZSwgJ2JsdXInLCAoZSkgPT4gdGhpcy5fb25EaWRCbHVyRGV0YWlscy5maXJlKGUpKSk7XG5cblx0XHRpZiAoX29wdGlvbnMuc3RhdHVzQmFyTWVudUlkICYmIF9vcHRpb25zLnNob3dTdGF0dXNCYXJTZXR0aW5nSWQgJiYgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKF9vcHRpb25zLnNob3dTdGF0dXNCYXJTZXR0aW5nSWQpKSB7XG5cdFx0XHR0aGlzLl9zdGF0dXMgPSB0aGlzLl9yZWdpc3RlcihfaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3VnZ2VzdFdpZGdldFN0YXR1cywgdGhpcy5lbGVtZW50LmRvbU5vZGUsIF9vcHRpb25zLnN0YXR1c0Jhck1lbnVJZCwgeyBzaG93SWNvbnNOb0tleWJpbmRpbmdzOiB0cnVlIH0pKTtcblx0XHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ3dpdGgtc3RhdHVzLWJhcicsIHRydWUpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xpc3Qub25Nb3VzZURvd24oZSA9PiB0aGlzLl9vbkxpc3RNb3VzZURvd25PclRhcChlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xpc3Qub25UYXAoZSA9PiB0aGlzLl9vbkxpc3RNb3VzZURvd25PclRhcChlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xpc3Qub25EaWRDaGFuZ2VGb2N1cyhlID0+IHRoaXMuX29uTGlzdEZvY3VzKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGlzdC5vbkRpZENoYW5nZVNlbGVjdGlvbihlID0+IHRoaXMuX29uTGlzdFNlbGVjdGlvbihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX29uRGlkRm9udENvbmZpZ3VyYXRpb25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2NvbXBsZXRpb25Nb2RlbCkge1xuXHRcdFx0XHR0aGlzLl9saXN0LnNwbGljZSgwLCB0aGlzLl9jb21wbGV0aW9uTW9kZWwuaXRlbXMubGVuZ3RoLCB0aGlzLl9jb21wbGV0aW9uTW9kZWwhLml0ZW1zKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3Iuc3VnZ2VzdC5zaG93SWNvbnMnKSkge1xuXHRcdFx0XHRhcHBseUljb25TdHlsZSgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKF9vcHRpb25zLnN0YXR1c0Jhck1lbnVJZCAmJiBfb3B0aW9ucy5zaG93U3RhdHVzQmFyU2V0dGluZ0lkICYmIGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oX29wdGlvbnMuc2hvd1N0YXR1c0JhclNldHRpbmdJZCkpIHtcblx0XHRcdFx0Y29uc3Qgc2hvd1N0YXR1c0JhcjogYm9vbGVhbiA9IF9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShfb3B0aW9ucy5zaG93U3RhdHVzQmFyU2V0dGluZ0lkKTtcblx0XHRcdFx0aWYgKHNob3dTdGF0dXNCYXIgJiYgIXRoaXMuX3N0YXR1cykge1xuXHRcdFx0XHRcdHRoaXMuX3N0YXR1cyA9IHRoaXMuX3JlZ2lzdGVyKF9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTdWdnZXN0V2lkZ2V0U3RhdHVzLCB0aGlzLmVsZW1lbnQuZG9tTm9kZSwgX29wdGlvbnMuc3RhdHVzQmFyTWVudUlkLCB7IHNob3dJY29uc05vS2V5YmluZGluZ3M6IHRydWUgfSkpO1xuXHRcdFx0XHRcdHRoaXMuX3N0YXR1cy5zaG93KCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoc2hvd1N0YXR1c0JhciAmJiB0aGlzLl9zdGF0dXMpIHtcblx0XHRcdFx0XHR0aGlzLl9zdGF0dXMuc2hvdygpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuX3N0YXR1cykge1xuXHRcdFx0XHRcdHRoaXMuX3N0YXR1cy5lbGVtZW50LnJlbW92ZSgpO1xuXHRcdFx0XHRcdHRoaXMuX3N0YXR1cy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdHVzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRoaXMuX2xheW91dCh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ3dpdGgtc3RhdHVzLWJhcicsIHNob3dTdGF0dXNCYXIpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX29uTGlzdEZvY3VzKGU6IElMaXN0RXZlbnQ8VEl0ZW0+KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lnbm9yZUZvY3VzRXZlbnRzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3N0YXRlID09PSBTdGF0ZS5EZXRhaWxzKSB7XG5cdFx0XHQvLyBUaGlzIGNhbiBoYXBwZW4gd2hlbiBmb2N1cyBpcyBpbiB0aGUgZGV0YWlscy1wYW5lbCBhbmQgd2hlblxuXHRcdFx0Ly8gYXJyb3cga2V5cyBhcmUgcHJlc3NlZCB0byBzZWxlY3QgbmV4dC9wcmV2IGl0ZW1zXG5cdFx0XHR0aGlzLl9zZXRTdGF0ZShTdGF0ZS5PcGVuKTtcblx0XHR9XG5cblx0XHRpZiAoIWUuZWxlbWVudHMubGVuZ3RoKSB7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudFN1Z2dlc3Rpb25EZXRhaWxzKSB7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRTdWdnZXN0aW9uRGV0YWlscy5jYW5jZWwoKTtcblx0XHRcdFx0dGhpcy5fY3VycmVudFN1Z2dlc3Rpb25EZXRhaWxzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9mb2N1c2VkSXRlbSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldEhhc0ZvY3VzZWRTdWdnZXN0aW9uLnNldChmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jbGVhckFyaWFBY3RpdmVEZXNjZW5kYW50KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9jb21wbGV0aW9uTW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jdHhTdWdnZXN0V2lkZ2V0SGFzRm9jdXNlZFN1Z2dlc3Rpb24uc2V0KHRydWUpO1xuXHRcdGNvbnN0IGl0ZW0gPSBlLmVsZW1lbnRzWzBdO1xuXHRcdGNvbnN0IGluZGV4ID0gZS5pbmRleGVzWzBdO1xuXG5cdFx0aWYgKGl0ZW0gIT09IHRoaXMuX2ZvY3VzZWRJdGVtKSB7XG5cblx0XHRcdHRoaXMuX2N1cnJlbnRTdWdnZXN0aW9uRGV0YWlscz8uY2FuY2VsKCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHMgPSB1bmRlZmluZWQ7XG5cblx0XHRcdHRoaXMuX2ZvY3VzZWRJdGVtID0gaXRlbTtcblxuXHRcdFx0dGhpcy5fbGlzdC5yZXZlYWwoaW5kZXgpO1xuXG5cdFx0XHRjb25zdCBpZCA9IGdldEFyaWFJZChpbmRleCk7XG5cdFx0XHRjb25zdCBub2RlID0gZG9tLmdldEFjdGl2ZVdpbmRvdygpLmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0XHRpZiAobm9kZSAmJiBpZCkge1xuXHRcdFx0XHRub2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcsICd0cnVlJyk7XG5cdFx0XHRcdG5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWF1dG9jb21wbGV0ZScsICdsaXN0Jyk7XG5cdFx0XHRcdG5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWFjdGl2ZWRlc2NlbmRhbnQnLCBpZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9jbGVhckFyaWFBY3RpdmVEZXNjZW5kYW50KCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2N1cnJlbnRTdWdnZXN0aW9uRGV0YWlscyA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKGFzeW5jIHRva2VuID0+IHtcblx0XHRcdFx0Y29uc3QgbG9hZGluZyA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRpZiAodGhpcy5faXNEZXRhaWxzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zaG93RGV0YWlscyh0cnVlLCBmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCAyNTApO1xuXHRcdFx0XHRjb25zdCBzdWIgPSB0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBsb2FkaW5nLmRpc3Bvc2UoKSk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cmV0dXJuIGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdGxvYWRpbmcuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLl9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHMudGhlbigoKSA9PiB7XG5cdFx0XHRcdGlmIChpbmRleCA+PSB0aGlzLl9saXN0Lmxlbmd0aCB8fCBpdGVtICE9PSB0aGlzLl9saXN0LmVsZW1lbnQoaW5kZXgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gaXRlbSBjYW4gaGF2ZSBleHRyYSBpbmZvcm1hdGlvbiwgc28gcmUtcmVuZGVyXG5cdFx0XHRcdHRoaXMuX2lnbm9yZUZvY3VzRXZlbnRzID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fbGlzdC5zcGxpY2UoaW5kZXgsIDEsIFtpdGVtXSk7XG5cdFx0XHRcdHRoaXMuX2xpc3Quc2V0Rm9jdXMoW2luZGV4XSk7XG5cdFx0XHRcdHRoaXMuX2lnbm9yZUZvY3VzRXZlbnRzID0gZmFsc2U7XG5cblx0XHRcdFx0aWYgKHRoaXMuX2lzRGV0YWlsc1Zpc2libGUoKSkge1xuXHRcdFx0XHRcdHRoaXMuX3Nob3dEZXRhaWxzKGZhbHNlLCBmYWxzZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5lbGVtZW50LmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnZG9jcy1zaWRlJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fSkuY2F0Y2goKTtcblx0XHR9XG5cblx0XHR0aGlzLl9jdHhGaXJzdFN1Z2dlc3Rpb25Gb2N1c2VkLnNldChpbmRleCA9PT0gMCk7XG5cdFx0Ly8gZW1pdCBhbiBldmVudFxuXHRcdHRoaXMuX29uRGlkRm9jdXMuZmlyZSh7IGl0ZW0sIGluZGV4LCBtb2RlbDogdGhpcy5fY29tcGxldGlvbk1vZGVsIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJBcmlhQWN0aXZlRGVzY2VuZGFudCgpOiB2b2lkIHtcblx0XHRjb25zdCBub2RlID0gZG9tLmdldEFjdGl2ZVdpbmRvdygpLmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0aWYgKCFub2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdG5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWhhc3BvcHVwJywgJ2ZhbHNlJyk7XG5cdFx0bm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtYXV0b2NvbXBsZXRlJywgJ2JvdGgnKTtcblx0XHRub2RlLnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1hY3RpdmVkZXNjZW5kYW50Jyk7XG5cdH1cblxuXHRwcml2YXRlIF9jdXJzb3JQb3NpdGlvbj86IHsgdG9wOiBudW1iZXI7IGxlZnQ6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfTtcblxuXHRzZXRDb21wbGV0aW9uTW9kZWwoY29tcGxldGlvbk1vZGVsOiBUTW9kZWwpIHtcblx0XHR0aGlzLl9jb21wbGV0aW9uTW9kZWwgPSBjb21wbGV0aW9uTW9kZWw7XG5cdH1cblxuXHRoYXNDb21wbGV0aW9ucygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29tcGxldGlvbk1vZGVsPy5pdGVtcy5sZW5ndGggIT09IDA7XG5cdH1cblxuXHRyZXNldFdpZGdldFNpemUoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVyc2lzdGVkU2l6ZS5yZXNldCgpO1xuXHR9XG5cblx0cmVsYXlvdXQoY3Vyc29yUG9zaXRpb246IHsgdG9wOiBudW1iZXI7IGxlZnQ6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuSGlkZGVuKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2N1cnNvclBvc2l0aW9uID0gY3Vyc29yUG9zaXRpb247XG5cdFx0dGhpcy5fbGF5b3V0KHRoaXMuZWxlbWVudC5zaXplKTtcblx0XHR0aGlzLl9hZnRlclJlbmRlcigpO1xuXHR9XG5cblx0c2hvd1RyaWdnZXJlZChleHBsaWNpdGx5SW52b2tlZDogYm9vbGVhbiwgY3Vyc29yUG9zaXRpb246IHsgdG9wOiBudW1iZXI7IGxlZnQ6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSkge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSAhPT0gU3RhdGUuSGlkZGVuKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2N1cnNvclBvc2l0aW9uID0gY3Vyc29yUG9zaXRpb247XG5cdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldEV4cGxpY2l0bHlJbnZva2VkLnNldCghIWV4cGxpY2l0bHlJbnZva2VkKTtcblxuXHRcdGlmICh0aGlzLl9jdHhTdWdnZXN0V2lkZ2V0RXhwbGljaXRseUludm9rZWQuZ2V0KCkpIHtcblx0XHRcdHRoaXMuX2xvYWRpbmdUaW1lb3V0ID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4gdGhpcy5fc2V0U3RhdGUoU3RhdGUuTG9hZGluZyksIDI1MCk7XG5cdFx0fVxuXHR9XG5cblx0c2hvd1N1Z2dlc3Rpb25zKHNlbGVjdGlvbkluZGV4OiBudW1iZXIsIGlzRnJvemVuOiBib29sZWFuLCBpc0F1dG86IGJvb2xlYW4sIGN1cnNvclBvc2l0aW9uOiB7IHRvcDogbnVtYmVyOyBsZWZ0OiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0pOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJzb3JQb3NpdGlvbiA9IGN1cnNvclBvc2l0aW9uO1xuXG5cdFx0dGhpcy5fbG9hZGluZ1RpbWVvdXQ/LmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IHNlbGVjdGlvbk1vZGUgPSB0aGlzLl9vcHRpb25zPy5zZWxlY3Rpb25Nb2RlU2V0dGluZ0lkID8gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8U3VnZ2VzdFNlbGVjdGlvbk1vZGU+KHRoaXMuX29wdGlvbnMuc2VsZWN0aW9uTW9kZVNldHRpbmdJZCkgOiB1bmRlZmluZWQ7XG5cdFx0Ly8gV2hlbiBleHBsaWNpdGx5IGludm9rZWQgKG5vdCBhdXRvKSwgYWx3YXlzIHNlbGVjdCB0aGUgZmlyc3QgaXRlbSByZWdhcmRsZXNzIG9mIHNlbGVjdGlvbk1vZGVcblx0XHRjb25zdCBub0ZvY3VzID0gIXRoaXMuX2N0eFN1Z2dlc3RXaWRnZXRFeHBsaWNpdGx5SW52b2tlZC5nZXQoKSAmJiBzZWxlY3Rpb25Nb2RlID09PSBTdWdnZXN0U2VsZWN0aW9uTW9kZS5OZXZlcjtcblxuXHRcdC8vIHRoaXMuX2N1cnJlbnRTdWdnZXN0aW9uRGV0YWlscz8uY2FuY2VsKCk7XG5cdFx0Ly8gdGhpcy5fY3VycmVudFN1Z2dlc3Rpb25EZXRhaWxzID0gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGlzRnJvemVuICYmIHRoaXMuX3N0YXRlICE9PSBTdGF0ZS5FbXB0eSAmJiB0aGlzLl9zdGF0ZSAhPT0gU3RhdGUuSGlkZGVuKSB7XG5cdFx0XHR0aGlzLl9zZXRTdGF0ZShTdGF0ZS5Gcm96ZW4pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpc2libGVDb3VudCA9IHRoaXMuX2NvbXBsZXRpb25Nb2RlbD8uaXRlbXMubGVuZ3RoID8/IDA7XG5cdFx0Y29uc3QgaXNFbXB0eSA9IHZpc2libGVDb3VudCA9PT0gMDtcblx0XHQvLyB0aGlzLl9jdHhTdWdnZXN0V2lkZ2V0TXVsdGlwbGVTdWdnZXN0aW9ucy5zZXQodmlzaWJsZUNvdW50ID4gMSk7XG5cblx0XHRpZiAoaXNFbXB0eSkge1xuXHRcdFx0dGhpcy5fc2V0U3RhdGUoaXNBdXRvID8gU3RhdGUuSGlkZGVuIDogU3RhdGUuRW1wdHkpO1xuXHRcdFx0dGhpcy5fY29tcGxldGlvbk1vZGVsID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIHRoaXMuX2ZvY3VzZWRJdGVtID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gY2FsbGluZyBsaXN0LnNwbGljZSB0cmlnZ2VycyBmb2N1cyBldmVudCB3aGljaCB0aGlzIHdpZGdldCBmb3J3YXJkcy4gVGhhdCBjYW4gbGVhZCB0b1xuXHRcdC8vIHN1Z2dlc3Rpb25zIGJlaW5nIGNhbmNlbGxlZCBhbmQgdGhlIHdpZGdldCBiZWluZyBjbGVhcmVkIChhbmQgaGlkZGVuKS4gQWxsIHRoaXMgaGFwcGVuc1xuXHRcdC8vIGJlZm9yZSByZXZlYWxpbmcgYW5kIGZvY3VzaW5nIGlzIGRvbmUgd2hpY2ggbWVhbnMgcmV2ZWFsaW5nIGFuZCBmb2N1c2luZyB3aWxsIGZhaWwgd2hlblxuXHRcdC8vIHRoZXkgZ2V0IHJ1bi5cblx0XHQvLyB0aGlzLl9vbkRpZEZvY3VzLnBhdXNlKCk7XG5cdFx0Ly8gdGhpcy5fb25EaWRTZWxlY3QucGF1c2UoKTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fbGlzdC5zcGxpY2UoMCwgdGhpcy5fbGlzdC5sZW5ndGgsIHRoaXMuX2NvbXBsZXRpb25Nb2RlbD8uaXRlbXMgPz8gW10pO1xuXHRcdFx0dGhpcy5fc2V0U3RhdGUoaXNGcm96ZW4gPyBTdGF0ZS5Gcm96ZW4gOiBTdGF0ZS5PcGVuKTtcblx0XHRcdHRoaXMuX2xpc3QucmV2ZWFsKHNlbGVjdGlvbkluZGV4LCAwKTtcblx0XHRcdHRoaXMuX2xpc3Quc2V0Rm9jdXMobm9Gb2N1cyA/IFtdIDogW3NlbGVjdGlvbkluZGV4XSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdC8vIHRoaXMuX29uRGlkRm9jdXMucmVzdW1lKCk7XG5cdFx0XHQvLyB0aGlzLl9vbkRpZFNlbGVjdC5yZXN1bWUoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9wZW5kaW5nTGF5b3V0LnZhbHVlID0gZG9tLnJ1bkF0VGhpc09yU2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShkb20uZ2V0V2luZG93KHRoaXMuZWxlbWVudC5kb21Ob2RlKSwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fcGVuZGluZ0xheW91dC5jbGVhcigpO1xuXHRcdFx0dGhpcy5fbGF5b3V0KHRoaXMuZWxlbWVudC5zaXplKTtcblx0XHRcdC8vIFJlc2V0IGZvY3VzIGJvcmRlclxuXHRcdFx0Ly8gdGhpcy5fZGV0YWlscy53aWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdmb2N1c2VkJyk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fdXBkYXRlTGlzdFN0eWxlcygpO1xuXHRcdHRoaXMuX2FmdGVyUmVuZGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVMaXN0U3R5bGVzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9vcHRpb25zLnNlbGVjdGlvbk1vZGVTZXR0aW5nSWQpIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbk1vZGUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxTdWdnZXN0U2VsZWN0aW9uTW9kZT4odGhpcy5fb3B0aW9ucy5zZWxlY3Rpb25Nb2RlU2V0dGluZ0lkKTtcblx0XHRcdC8vIFdoZW4gZXhwbGljaXRseSBpbnZva2VkLCBhbHdheXMgc2hvdyBmdWxsIHNlbGVjdGlvbiAoYmFja2dyb3VuZCkgaW5zdGVhZCBvZiBwYXJ0aWFsIChib3JkZXIpXG5cdFx0XHRjb25zdCB1c2VQYXJ0aWFsU3R5bGUgPSAhdGhpcy5fY3R4U3VnZ2VzdFdpZGdldEV4cGxpY2l0bHlJbnZva2VkLmdldCgpICYmIHNlbGVjdGlvbk1vZGUgPT09IFN1Z2dlc3RTZWxlY3Rpb25Nb2RlLlBhcnRpYWw7XG5cdFx0XHR0aGlzLl9saXN0LnN0eWxlKGdldExpc3RTdHlsZXNXaXRoTW9kZSh1c2VQYXJ0aWFsU3R5bGUpKTtcblx0XHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoQ2xhc3Nlcy5QYXJ0aWFsU2VsZWN0aW9uLCB1c2VQYXJ0aWFsU3R5bGUpO1xuXHRcdH1cblx0fVxuXG5cdHNldExpbmVDb250ZXh0KGxpbmVDb250ZXh0OiBMaW5lQ29udGV4dCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb21wbGV0aW9uTW9kZWwpIHtcblx0XHRcdHRoaXMuX2NvbXBsZXRpb25Nb2RlbC5saW5lQ29udGV4dCA9IGxpbmVDb250ZXh0O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldFN0YXRlKHN0YXRlOiBTdGF0ZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gc3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3RhdGUgPSBzdGF0ZTtcblxuXHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2Zyb3plbicsIHN0YXRlID09PSBTdGF0ZS5Gcm96ZW4pO1xuXHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ21lc3NhZ2UnKTtcblxuXHRcdHN3aXRjaCAoc3RhdGUpIHtcblx0XHRcdGNhc2UgU3RhdGUuSGlkZGVuOlxuXHRcdFx0XHRpZiAodGhpcy5fc3RhdHVzKSB7XG5cdFx0XHRcdFx0ZG9tLmhpZGUodGhpcy5fc3RhdHVzLmVsZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRvbS5oaWRlKHRoaXMuX2xpc3RFbGVtZW50KTtcblx0XHRcdFx0ZG9tLmhpZGUodGhpcy5fbWVzc2FnZUVsZW1lbnQpO1xuXHRcdFx0XHRkb20uaGlkZSh0aGlzLmVsZW1lbnQuZG9tTm9kZSk7XG5cdFx0XHRcdHRoaXMuX2RldGFpbHMuaGlkZSh0cnVlKTtcblx0XHRcdFx0dGhpcy5fc3RhdHVzPy5oaWRlKCk7XG5cdFx0XHRcdC8vIHRoaXMuX2NvbnRlbnRXaWRnZXQuaGlkZSgpO1xuXHRcdFx0XHQvLyB0aGlzLl9jdHhTdWdnZXN0V2lkZ2V0VmlzaWJsZS5yZXNldCgpO1xuXHRcdFx0XHQvLyB0aGlzLl9jdHhTdWdnZXN0V2lkZ2V0TXVsdGlwbGVTdWdnZXN0aW9ucy5yZXNldCgpO1xuXHRcdFx0XHR0aGlzLl9jdHhTdWdnZXN0V2lkZ2V0SGFzRm9jdXNlZFN1Z2dlc3Rpb24ucmVzZXQoKTtcblx0XHRcdFx0dGhpcy5fc2hvd1RpbWVvdXQuY2FuY2VsKCk7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ3Zpc2libGUnKTtcblx0XHRcdFx0dGhpcy5fbGlzdC5zcGxpY2UoMCwgdGhpcy5fbGlzdC5sZW5ndGgpO1xuXHRcdFx0XHR0aGlzLl9mb2N1c2VkSXRlbSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fY2FwcGVkSGVpZ2h0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9leHBsYWluTW9kZSA9IGZhbHNlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU3RhdGUuTG9hZGluZzpcblx0XHRcdFx0dGhpcy5lbGVtZW50LmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnbWVzc2FnZScpO1xuXHRcdFx0XHR0aGlzLl9tZXNzYWdlRWxlbWVudC50ZXh0Q29udGVudCA9IFNpbXBsZVN1Z2dlc3RXaWRnZXQuTE9BRElOR19NRVNTQUdFO1xuXHRcdFx0XHRkb20uaGlkZSh0aGlzLl9saXN0RWxlbWVudCk7XG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0dXMpIHtcblx0XHRcdFx0XHRkb20uaGlkZSh0aGlzLl9zdGF0dXMuZWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZG9tLnNob3codGhpcy5fbWVzc2FnZUVsZW1lbnQpO1xuXHRcdFx0XHR0aGlzLl9kZXRhaWxzLmhpZGUoKTtcblx0XHRcdFx0dGhpcy5fc2hvdygpO1xuXHRcdFx0XHR0aGlzLl9mb2N1c2VkSXRlbSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0c3RhdHVzKFNpbXBsZVN1Z2dlc3RXaWRnZXQuTE9BRElOR19NRVNTQUdFKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlLkVtcHR5OlxuXHRcdFx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdtZXNzYWdlJyk7XG5cdFx0XHRcdHRoaXMuX21lc3NhZ2VFbGVtZW50LnRleHRDb250ZW50ID0gU2ltcGxlU3VnZ2VzdFdpZGdldC5OT19TVUdHRVNUSU9OU19NRVNTQUdFO1xuXHRcdFx0XHRkb20uaGlkZSh0aGlzLl9saXN0RWxlbWVudCk7XG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0dXMpIHtcblx0XHRcdFx0XHRkb20uaGlkZSh0aGlzLl9zdGF0dXMuZWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZG9tLnNob3codGhpcy5fbWVzc2FnZUVsZW1lbnQpO1xuXHRcdFx0XHR0aGlzLl9kZXRhaWxzLmhpZGUoKTtcblx0XHRcdFx0dGhpcy5fc2hvdygpO1xuXHRcdFx0XHR0aGlzLl9mb2N1c2VkSXRlbSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0c3RhdHVzKFNpbXBsZVN1Z2dlc3RXaWRnZXQuTk9fU1VHR0VTVElPTlNfTUVTU0FHRSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZS5PcGVuOlxuXHRcdFx0XHRkb20uaGlkZSh0aGlzLl9tZXNzYWdlRWxlbWVudCk7XG5cdFx0XHRcdHRoaXMuX3Nob3dMaXN0QW5kU3RhdHVzKCk7XG5cdFx0XHRcdHRoaXMuX3Nob3coKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlLkZyb3plbjpcblx0XHRcdFx0ZG9tLmhpZGUodGhpcy5fbWVzc2FnZUVsZW1lbnQpO1xuXHRcdFx0XHR0aGlzLl9zaG93TGlzdEFuZFN0YXR1cygpO1xuXHRcdFx0XHR0aGlzLl9zaG93KCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZS5EZXRhaWxzOlxuXHRcdFx0XHRkb20uaGlkZSh0aGlzLl9tZXNzYWdlRWxlbWVudCk7XG5cdFx0XHRcdHRoaXMuX3Nob3dMaXN0QW5kU3RhdHVzKCk7XG5cdFx0XHRcdHRoaXMuX2RldGFpbHMuc2hvdygpO1xuXHRcdFx0XHR0aGlzLl9zaG93KCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Nob3dMaXN0QW5kU3RhdHVzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0dXMpIHtcblx0XHRcdGRvbS5zaG93KHRoaXMuX2xpc3RFbGVtZW50LCB0aGlzLl9zdGF0dXMuZWxlbWVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRvbS5zaG93KHRoaXMuX2xpc3RFbGVtZW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zaG93KCk6IHZvaWQge1xuXHRcdC8vIHRoaXMuX2xheW91dCh0aGlzLl9wZXJzaXN0ZWRTaXplLnJlc3RvcmUoKSk7XG5cdFx0Ly8gZG9tLnNob3codGhpcy5lbGVtZW50LmRvbU5vZGUpO1xuXHRcdC8vIHRoaXMuX29uRGlkU2hvdy5maXJlKCk7XG5cblxuXHRcdHRoaXMuX3N0YXR1cz8uc2hvdygpO1xuXHRcdC8vIHRoaXMuX2NvbnRlbnRXaWRnZXQuc2hvdygpO1xuXHRcdGRvbS5zaG93KHRoaXMuZWxlbWVudC5kb21Ob2RlKTtcblx0XHR0aGlzLl9sYXlvdXQodGhpcy5fcGVyc2lzdGVkU2l6ZS5yZXN0b3JlKCkpO1xuXHRcdC8vIHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXRWaXNpYmxlLnNldCh0cnVlKTtcblxuXHRcdHRoaXMuX29uRGlkU2hvdy5maXJlKHRoaXMpO1xuXHRcdHRoaXMuX3Nob3dUaW1lb3V0LmNhbmNlbEFuZFNldCgoKSA9PiB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCd2aXNpYmxlJyk7XG5cdFx0fSwgMTAwKTtcblx0fVxuXG5cblx0dG9nZ2xlRGV0YWlsc0ZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuRGV0YWlscykge1xuXHRcdFx0Ly8gU2hvdWxkIHJldHVybiB0aGUgZm9jdXMgdG8gdGhlIGxpc3QgaXRlbS5cblx0XHRcdHRoaXMuX2xpc3Quc2V0Rm9jdXModGhpcy5fbGlzdC5nZXRGb2N1cygpKTtcblx0XHRcdHRoaXMuX3NldFN0YXRlKFN0YXRlLk9wZW4pO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fc3RhdGUgPT09IFN0YXRlLk9wZW4pIHtcblx0XHRcdHRoaXMuX3NldFN0YXRlKFN0YXRlLkRldGFpbHMpO1xuXHRcdFx0aWYgKCF0aGlzLl9pc0RldGFpbHNWaXNpYmxlKCkpIHtcblx0XHRcdFx0dGhpcy50b2dnbGVEZXRhaWxzKHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZGV0YWlscy53aWRnZXQuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR0b2dnbGVEZXRhaWxzKGZvY3VzZWQ6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0RldGFpbHNWaXNpYmxlKCkpIHtcblx0XHRcdC8vIGhpZGUgZGV0YWlscyB3aWRnZXRcblx0XHRcdHRoaXMuX3BlbmRpbmdTaG93RGV0YWlscy5jbGVhcigpO1xuXHRcdFx0Ly8gdGhpcy5fY3R4U3VnZ2VzdFdpZGdldERldGFpbHNWaXNpYmxlLnNldChmYWxzZSk7XG5cblx0XHRcdHRoaXMuX3NldERldGFpbHNWaXNpYmxlKGZhbHNlKTtcblx0XHRcdHRoaXMuX2RldGFpbHMuaGlkZSgpO1xuXHRcdFx0dGhpcy5lbGVtZW50LmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnc2hvd3MtZGV0YWlscycpO1xuXG5cdFx0fSBlbHNlIGlmICgoY2FuRXhwYW5kQ29tcGxldGlvbkl0ZW0odGhpcy5fbGlzdC5nZXRGb2N1c2VkRWxlbWVudHMoKVswXSkgfHwgdGhpcy5fZXhwbGFpbk1vZGUpICYmICh0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuT3BlbiB8fCB0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuRGV0YWlscyB8fCB0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuRnJvemVuKSkge1xuXHRcdFx0Ly8gc2hvdyBkZXRhaWxzIHdpZGdldCAoaWZmIHBvc3NpYmxlKVxuXHRcdFx0Ly8gdGhpcy5fY3R4U3VnZ2VzdFdpZGdldERldGFpbHNWaXNpYmxlLnNldCh0cnVlKTtcblxuXHRcdFx0dGhpcy5fc2V0RGV0YWlsc1Zpc2libGUodHJ1ZSk7XG5cdFx0XHR0aGlzLl9zaG93RGV0YWlscyhmYWxzZSwgZm9jdXNlZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0RldGFpbHMobG9hZGluZzogYm9vbGVhbiwgZm9jdXNlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdTaG93RGV0YWlscy52YWx1ZSA9IGRvbS5ydW5BdFRoaXNPclNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyh0aGlzLmVsZW1lbnQuZG9tTm9kZSksICgpID0+IHtcblx0XHRcdHRoaXMuX3BlbmRpbmdTaG93RGV0YWlscy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fZGV0YWlscy5zaG93KCk7XG5cdFx0XHRsZXQgZGlkRm9jdXNEZXRhaWxzID0gZmFsc2U7XG5cdFx0XHRpZiAobG9hZGluZykge1xuXHRcdFx0XHR0aGlzLl9kZXRhaWxzLndpZGdldC5yZW5kZXJMb2FkaW5nKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9kZXRhaWxzLndpZGdldC5yZW5kZXJJdGVtKHRoaXMuX2xpc3QuZ2V0Rm9jdXNlZEVsZW1lbnRzKClbMF0sIHRoaXMuX2V4cGxhaW5Nb2RlKTtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5fZGV0YWlscy53aWRnZXQuaXNFbXB0eSkge1xuXHRcdFx0XHR0aGlzLl9wb3NpdGlvbkRldGFpbHMoKTtcblx0XHRcdFx0dGhpcy5lbGVtZW50LmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnc2hvd3MtZGV0YWlscycpO1xuXHRcdFx0XHRpZiAoZm9jdXNlZCkge1xuXHRcdFx0XHRcdHRoaXMuX2RldGFpbHMud2lkZ2V0LmZvY3VzKCk7XG5cdFx0XHRcdFx0ZGlkRm9jdXNEZXRhaWxzID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZGV0YWlscy5oaWRlKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWRpZEZvY3VzRGV0YWlscykge1xuXHRcdFx0XHQvLyB0aGlzLmVkaXRvci5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0dG9nZ2xlRXhwbGFpbk1vZGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2xpc3QuZ2V0Rm9jdXNlZEVsZW1lbnRzKClbMF0pIHtcblx0XHRcdHRoaXMuX2V4cGxhaW5Nb2RlID0gIXRoaXMuX2V4cGxhaW5Nb2RlO1xuXHRcdFx0aWYgKCF0aGlzLl9pc0RldGFpbHNWaXNpYmxlKCkpIHtcblx0XHRcdFx0dGhpcy50b2dnbGVEZXRhaWxzKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9zaG93RGV0YWlscyhmYWxzZSwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGhpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ0xheW91dC5jbGVhcigpO1xuXHRcdHRoaXMuX3BlbmRpbmdTaG93RGV0YWlscy5jbGVhcigpO1xuXHRcdHRoaXMuX2xvYWRpbmdUaW1lb3V0Py5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldEhhc0JlZW5OYXZpZ2F0ZWQucmVzZXQoKTtcblx0XHR0aGlzLl9jdHhGaXJzdFN1Z2dlc3Rpb25Gb2N1c2VkLnJlc2V0KCk7XG5cdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldEV4cGxpY2l0bHlJbnZva2VkLnJlc2V0KCk7XG5cdFx0dGhpcy5fc2V0U3RhdGUoU3RhdGUuSGlkZGVuKTtcblx0XHR0aGlzLl9vbkRpZEhpZGUuZmlyZSh0aGlzKTtcblx0XHRkb20uaGlkZSh0aGlzLmVsZW1lbnQuZG9tTm9kZSk7XG5cdFx0dGhpcy5lbGVtZW50LmNsZWFyU2FzaEhvdmVyU3RhdGUoKTtcblx0XHQvLyBlbnN1cmUgdGhhdCBhIHJlYXNvbmFibGUgd2lkZ2V0IGhlaWdodCBpcyBwZXJzaXN0ZWQgc28gdGhhdFxuXHRcdC8vIGFjY2lkZW50aWFsIFwicmVzaXplLXRvLXNpbmdsZS1pdGVtc1wiIGNhc2VzIGFyZW4ndCBoYXBwZW5pbmdcblx0XHRjb25zdCBkaW0gPSB0aGlzLl9wZXJzaXN0ZWRTaXplLnJlc3RvcmUoKTtcblx0XHRjb25zdCBtaW5QZXJzaXN0ZWRIZWlnaHQgPSBNYXRoLmNlaWwodGhpcy5fZ2V0TGF5b3V0SW5mbygpLml0ZW1IZWlnaHQgKiA0LjMpO1xuXHRcdGlmIChkaW0gJiYgZGltLmhlaWdodCA8IG1pblBlcnNpc3RlZEhlaWdodCkge1xuXHRcdFx0dGhpcy5fcGVyc2lzdGVkU2l6ZS5zdG9yZShkaW0ud2l0aCh1bmRlZmluZWQsIG1pblBlcnNpc3RlZEhlaWdodCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2xheW91dChzaXplOiBkb20uRGltZW5zaW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jdXJzb3JQb3NpdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBpZiAoIXRoaXMuZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHQvLyBcdHJldHVybjtcblx0XHQvLyB9XG5cdFx0Ly8gaWYgKCF0aGlzLmVkaXRvci5nZXREb21Ob2RlKCkpIHtcblx0XHQvLyBcdC8vIGhhcHBlbnMgd2hlbiBydW5uaW5nIHRlc3RzXG5cdFx0Ly8gXHRyZXR1cm47XG5cdFx0Ly8gfVxuXG5cdFx0Y29uc3QgYm9keUJveCA9IGRvbS5nZXRDbGllbnRBcmVhKHRoaXMuX2NvbnRhaW5lci5vd25lckRvY3VtZW50LmJvZHkpO1xuXHRcdGNvbnN0IGluZm8gPSB0aGlzLl9nZXRMYXlvdXRJbmZvKCk7XG5cblx0XHRpZiAoIXNpemUpIHtcblx0XHRcdHNpemUgPSBpbmZvLmRlZmF1bHRTaXplO1xuXHRcdH1cblxuXHRcdGxldCBoZWlnaHQgPSBzaXplLmhlaWdodDtcblx0XHRsZXQgd2lkdGggPSBzaXplLndpZHRoO1xuXG5cdFx0Ly8gc3RhdHVzIGJhclxuXHRcdGlmICh0aGlzLl9zdGF0dXMpIHtcblx0XHRcdHRoaXMuX3N0YXR1cy5lbGVtZW50LnN0eWxlLmhlaWdodCA9IGAke2luZm8uaXRlbUhlaWdodH1weGA7XG5cdFx0fVxuXG5cdFx0Ly8gaWYgKHRoaXMuX3N0YXRlID09PSBTdGF0ZS5FbXB0eSB8fCB0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuTG9hZGluZykge1xuXHRcdC8vIFx0Ly8gc2hvd2luZyBhIG1lc3NhZ2Ugb25seVxuXHRcdC8vIFx0aGVpZ2h0ID0gaW5mby5pdGVtSGVpZ2h0ICsgaW5mby5ib3JkZXJIZWlnaHQ7XG5cdFx0Ly8gXHR3aWR0aCA9IGluZm8uZGVmYXVsdFNpemUud2lkdGggLyAyO1xuXHRcdC8vIFx0dGhpcy5lbGVtZW50LmVuYWJsZVNhc2hlcyhmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cdFx0Ly8gXHR0aGlzLmVsZW1lbnQubWluU2l6ZSA9IHRoaXMuZWxlbWVudC5tYXhTaXplID0gbmV3IGRvbS5EaW1lbnNpb24od2lkdGgsIGhlaWdodCk7XG5cdFx0Ly8gXHR0aGlzLl9wcmVmZXJlbmNlID0gV2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkJlbG93O1xuXG5cdFx0Ly8gfSBlbHNlIHtcblx0XHQvLyBzaG93aW5nIGl0ZW1zXG5cblx0XHQvLyB3aWR0aCBtYXRoXG5cdFx0Y29uc3QgbWF4V2lkdGggPSBib2R5Qm94LndpZHRoIC0gaW5mby5ib3JkZXJIZWlnaHQgLSAyICogaW5mby5ob3Jpem9udGFsUGFkZGluZztcblx0XHRpZiAod2lkdGggPiBtYXhXaWR0aCkge1xuXHRcdFx0d2lkdGggPSBtYXhXaWR0aDtcblx0XHR9XG5cdFx0Y29uc3QgcHJlZmVycmVkV2lkdGggPSB0aGlzLl9jb21wbGV0aW9uTW9kZWwgPyB0aGlzLl9jb21wbGV0aW9uTW9kZWwuc3RhdHMucExhYmVsTGVuICogaW5mby50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGggOiB3aWR0aDtcblxuXHRcdC8vIGhlaWdodCBtYXRoXG5cdFx0Ly8gQ2FwIGxpc3QgY29udGVudCBoZWlnaHQgdG8gYSByZWFzb25hYmxlIG1heGltdW0gKDEyIGl0ZW1zIHdvcnRoKSwgbWF0Y2hpbmcgc3VnZ2VzdFdpZGdldCBiZWhhdmlvclxuXHRcdGNvbnN0IGNhcHBlZExpc3RDb250ZW50SGVpZ2h0ID0gTWF0aC5taW4odGhpcy5fbGlzdC5jb250ZW50SGVpZ2h0LCBpbmZvLml0ZW1IZWlnaHQgKiAxMik7XG5cdFx0Y29uc3QgZnVsbEhlaWdodCA9IGluZm8uc3RhdHVzQmFySGVpZ2h0ICsgY2FwcGVkTGlzdENvbnRlbnRIZWlnaHQgKyB0aGlzLl9tZXNzYWdlRWxlbWVudC5jbGllbnRIZWlnaHQgKyBpbmZvLmJvcmRlckhlaWdodDtcblx0XHRjb25zdCBtaW5IZWlnaHQgPSBpbmZvLml0ZW1IZWlnaHQgKyBpbmZvLnN0YXR1c0JhckhlaWdodDtcblx0XHQvLyBjb25zdCBlZGl0b3JCb3ggPSBkb20uZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbih0aGlzLmVkaXRvci5nZXREb21Ob2RlKCkpO1xuXHRcdC8vIGNvbnN0IGN1cnNvckJveCA9IHRoaXMuZWRpdG9yLmdldFNjcm9sbGVkVmlzaWJsZVBvc2l0aW9uKHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCkpO1xuXHRcdGNvbnN0IGVkaXRvckJveCA9IGRvbS5nZXREb21Ob2RlUGFnZVBvc2l0aW9uKHRoaXMuX2NvbnRhaW5lcik7XG5cdFx0Ly8gQ29udmVydCBhYnNvbHV0ZSBjdXJzb3IgcG9zaXRpb24gdG8gcmVsYXRpdmUgcG9zaXRpb24gKHJlbGF0aXZlIHRvIGNvbnRhaW5lcilcblx0XHRjb25zdCBjdXJzb3JCb3ggPSB7XG5cdFx0XHR0b3A6IHRoaXMuX2N1cnNvclBvc2l0aW9uLnRvcCAtIGVkaXRvckJveC50b3AsXG5cdFx0XHRsZWZ0OiB0aGlzLl9jdXJzb3JQb3NpdGlvbi5sZWZ0LFxuXHRcdFx0aGVpZ2h0OiB0aGlzLl9jdXJzb3JQb3NpdGlvbi5oZWlnaHRcblx0XHR9O1xuXHRcdGNvbnN0IGN1cnNvckJvdHRvbSA9IGVkaXRvckJveC50b3AgKyBjdXJzb3JCb3gudG9wICsgY3Vyc29yQm94LmhlaWdodDtcblx0XHRjb25zdCBtYXhIZWlnaHRCZWxvdyA9IE1hdGgubWluKGJvZHlCb3guaGVpZ2h0IC0gY3Vyc29yQm90dG9tIC0gaW5mby52ZXJ0aWNhbFBhZGRpbmcsIGZ1bGxIZWlnaHQpO1xuXHRcdGNvbnN0IGF2YWlsYWJsZVNwYWNlQWJvdmUgPSBlZGl0b3JCb3gudG9wICsgY3Vyc29yQm94LnRvcCAtIGluZm8udmVydGljYWxQYWRkaW5nO1xuXHRcdGNvbnN0IG1heEhlaWdodEFib3ZlID0gTWF0aC5taW4oYXZhaWxhYmxlU3BhY2VBYm92ZSwgZnVsbEhlaWdodCk7XG5cdFx0bGV0IG1heEhlaWdodCA9IE1hdGgubWluKE1hdGgubWF4KG1heEhlaWdodEFib3ZlLCBtYXhIZWlnaHRCZWxvdykgKyBpbmZvLmJvcmRlckhlaWdodCwgZnVsbEhlaWdodCk7XG5cblx0XHRpZiAoaGVpZ2h0ID09PSB0aGlzLl9jYXBwZWRIZWlnaHQ/LmNhcHBlZCkge1xuXHRcdFx0Ly8gUmVzdG9yZSB0aGUgb2xkICh3YW50ZWQpIGhlaWdodCB3aGVuIHRoZSBjdXJyZW50XG5cdFx0XHQvLyBoZWlnaHQgaXMgY2FwcGVkIHRvIGZpdFxuXHRcdFx0aGVpZ2h0ID0gdGhpcy5fY2FwcGVkSGVpZ2h0LndhbnRlZDtcblx0XHR9XG5cblx0XHRpZiAoaGVpZ2h0IDwgbWluSGVpZ2h0KSB7XG5cdFx0XHRoZWlnaHQgPSBtaW5IZWlnaHQ7XG5cdFx0fVxuXHRcdGlmIChoZWlnaHQgPiBtYXhIZWlnaHQpIHtcblx0XHRcdGhlaWdodCA9IG1heEhlaWdodDtcblx0XHR9XG5cblx0XHRjb25zdCBmb3JjZVJlbmRlcmluZ0Fib3ZlUmVxdWlyZWRTcGFjZSA9IDE1MDtcblx0XHRpZiAoKGhlaWdodCA+IG1heEhlaWdodEJlbG93ICYmIG1heEhlaWdodEFib3ZlID4gbWF4SGVpZ2h0QmVsb3cpIHx8ICh0aGlzLl9mb3JjZVJlbmRlcmluZ0Fib3ZlICYmIGF2YWlsYWJsZVNwYWNlQWJvdmUgPiBmb3JjZVJlbmRlcmluZ0Fib3ZlUmVxdWlyZWRTcGFjZSkpIHtcblx0XHRcdHRoaXMuX3ByZWZlcmVuY2UgPSBXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQWJvdmU7XG5cdFx0XHR0aGlzLmVsZW1lbnQuZW5hYmxlU2FzaGVzKHRydWUsIHRydWUsIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHRtYXhIZWlnaHQgPSBtYXhIZWlnaHRBYm92ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcHJlZmVyZW5jZSA9IFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5CZWxvdztcblx0XHRcdHRoaXMuZWxlbWVudC5lbmFibGVTYXNoZXMoZmFsc2UsIHRydWUsIHRydWUsIGZhbHNlKTtcblx0XHRcdG1heEhlaWdodCA9IG1heEhlaWdodEJlbG93O1xuXHRcdH1cblx0XHR0aGlzLmVsZW1lbnQucHJlZmVycmVkU2l6ZSA9IG5ldyBkb20uRGltZW5zaW9uKHByZWZlcnJlZFdpZHRoLCBpbmZvLmRlZmF1bHRTaXplLmhlaWdodCk7XG5cdFx0dGhpcy5lbGVtZW50Lm1heFNpemUgPSBuZXcgZG9tLkRpbWVuc2lvbihtYXhXaWR0aCwgbWF4SGVpZ2h0KTtcblx0XHR0aGlzLmVsZW1lbnQubWluU2l6ZSA9IG5ldyBkb20uRGltZW5zaW9uKDIyMCwgbWluSGVpZ2h0KTtcblxuXHRcdC8vIEtub3cgd2hlbiB0aGUgaGVpZ2h0IHdhcyBjYXBwZWQgdG8gZml0IGFuZCByZW1lbWJlclxuXHRcdC8vIHRoZSB3YW50ZWQgaGVpZ2h0IGZvciBsYXRlci4gVGhpcyBpcyByZXF1aXJlZCB3aGVuIGdvaW5nXG5cdFx0Ly8gbGVmdCB0byB3aWRlbiBzdWdnZXN0aW9ucy5cblx0XHR0aGlzLl9jYXBwZWRIZWlnaHQgPSBoZWlnaHQgPT09IGZ1bGxIZWlnaHRcblx0XHRcdD8geyB3YW50ZWQ6IHRoaXMuX2NhcHBlZEhlaWdodD8ud2FudGVkID8/IHNpemUuaGVpZ2h0LCBjYXBwZWQ6IGhlaWdodCB9XG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHQvLyB9XG5cdFx0Ly8gSG9yaXpvbnRhbCBwb3NpdGlvbmluZzogUG9zaXRpb24gd2lkZ2V0IGF0IGN1cnNvciwgZmxpcCB0byBsZWZ0IGlmIHdvdWxkIG92ZXJmbG93IHJpZ2h0XG5cdFx0bGV0IGFuY2hvckxlZnQgPSB0aGlzLl9jdXJzb3JQb3NpdGlvbi5sZWZ0O1xuXHRcdGNvbnN0IHdvdWxkT3ZlcmZsb3dSaWdodCA9IGFuY2hvckxlZnQgKyB3aWR0aCA+IGJvZHlCb3gud2lkdGg7XG5cblx0XHRpZiAod291bGRPdmVyZmxvd1JpZ2h0KSB7XG5cdFx0XHQvLyBQb3NpdGlvbiByaWdodCBlZGdlIGF0IGN1cnNvciAoZXh0ZW5kcyBsZWZ0KVxuXHRcdFx0YW5jaG9yTGVmdCA9IHRoaXMuX2N1cnNvclBvc2l0aW9uLmxlZnQgLSB3aWR0aDtcblx0XHR9XG5cblx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5zdHlsZS5sZWZ0ID0gYCR7YW5jaG9yTGVmdH1weGA7XG5cdFx0aWYgKHRoaXMuX3ByZWZlcmVuY2UgPT09IFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5BYm92ZSkge1xuXHRcdFx0dGhpcy5lbGVtZW50LmRvbU5vZGUuc3R5bGUudG9wID0gYCR7dGhpcy5fY3Vyc29yUG9zaXRpb24udG9wIC0gaGVpZ2h0IC0gaW5mby5ib3JkZXJIZWlnaHR9cHhgO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5zdHlsZS50b3AgPSBgJHt0aGlzLl9jdXJzb3JQb3NpdGlvbi50b3AgKyB0aGlzLl9jdXJzb3JQb3NpdGlvbi5oZWlnaHR9cHhgO1xuXHRcdH1cblx0XHQvLyB9XG5cdFx0dGhpcy5fcmVzaXplKHdpZHRoLCBoZWlnaHQpO1xuXHR9XG5cblx0X2FmdGVyUmVuZGVyKCkge1xuXHRcdC8vIGlmIChwb3NpdGlvbiA9PT0gbnVsbCkge1xuXHRcdC8vIFx0aWYgKHRoaXMuX2lzRGV0YWlsc1Zpc2libGUoKSkge1xuXHRcdC8vIFx0XHR0aGlzLl9kZXRhaWxzLmhpZGUoKTsgLy90b2RvQGpyaWVrZW4gc29mdC1oaWRlXG5cdFx0Ly8gXHR9XG5cdFx0Ly8gXHRyZXR1cm47XG5cdFx0Ly8gfVxuXHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuRW1wdHkgfHwgdGhpcy5fc3RhdGUgPT09IFN0YXRlLkxvYWRpbmcpIHtcblx0XHRcdC8vIG5vIHNwZWNpYWwgcG9zaXRpb25pbmcgd2hlbiB3aWRnZXQgaXNuJ3Qgc2hvd2luZyBsaXN0XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9pc0RldGFpbHNWaXNpYmxlKCkgJiYgIXRoaXMuX2RldGFpbHMud2lkZ2V0LmlzRW1wdHkpIHtcblx0XHRcdHRoaXMuX2RldGFpbHMuc2hvdygpO1xuXHRcdH1cblx0XHR0aGlzLl9wb3NpdGlvbkRldGFpbHMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc2l6ZSh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHsgd2lkdGg6IG1heFdpZHRoLCBoZWlnaHQ6IG1heEhlaWdodCB9ID0gdGhpcy5lbGVtZW50Lm1heFNpemU7XG5cdFx0d2lkdGggPSBNYXRoLm1pbihtYXhXaWR0aCwgd2lkdGgpO1xuXHRcdGlmIChtYXhIZWlnaHQpIHtcblx0XHRcdGhlaWdodCA9IE1hdGgubWluKG1heEhlaWdodCwgaGVpZ2h0KTtcblx0XHR9XG5cblx0XHRjb25zdCB7IHN0YXR1c0JhckhlaWdodCB9ID0gdGhpcy5fZ2V0TGF5b3V0SW5mbygpO1xuXHRcdHRoaXMuX2xpc3QubGF5b3V0KGhlaWdodCAtIHN0YXR1c0JhckhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMuX2xpc3RFbGVtZW50LnN0eWxlLmhlaWdodCA9IGAke2hlaWdodCAtIHN0YXR1c0JhckhlaWdodH1weGA7XG5cblx0XHR0aGlzLl9saXN0RWxlbWVudC5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblx0XHR0aGlzLmVsZW1lbnQubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHRcdGlmICh0aGlzLl9jdXJzb3JQb3NpdGlvbiAmJiB0aGlzLl9wcmVmZXJlbmNlID09PSBXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQWJvdmUpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLnN0eWxlLnRvcCA9IGAke3RoaXMuX2N1cnNvclBvc2l0aW9uLnRvcCAtIGhlaWdodH1weGA7XG5cdFx0fVxuXHRcdHRoaXMuX3Bvc2l0aW9uRGV0YWlscygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcG9zaXRpb25EZXRhaWxzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0RldGFpbHNWaXNpYmxlKCkpIHtcblx0XHRcdHRoaXMuX2RldGFpbHMucGxhY2VBdEFuY2hvcih0aGlzLmVsZW1lbnQuZG9tTm9kZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TGF5b3V0SW5mbygpIHtcblx0XHRjb25zdCBmb250SW5mbyA9IHRoaXMuX2dldEZvbnRJbmZvKCk7XG5cdFx0Y29uc3QgaXRlbUhlaWdodCA9IGNsYW1wKGZvbnRJbmZvLmxpbmVIZWlnaHQsIDgsIDEwMDApO1xuXHRcdGNvbnN0IHN0YXR1c0JhckhlaWdodCA9ICF0aGlzLl9vcHRpb25zLnN0YXR1c0Jhck1lbnVJZCB8fCAhdGhpcy5fb3B0aW9ucy5zaG93U3RhdHVzQmFyU2V0dGluZ0lkIHx8ICF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSh0aGlzLl9vcHRpb25zLnNob3dTdGF0dXNCYXJTZXR0aW5nSWQpIHx8IHRoaXMuX3N0YXRlID09PSBTdGF0ZS5FbXB0eSB8fCB0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuTG9hZGluZyA/IDAgOiBpdGVtSGVpZ2h0O1xuXHRcdGNvbnN0IGJvcmRlcldpZHRoID0gdGhpcy5fZGV0YWlscy53aWRnZXQuYm9yZGVyV2lkdGg7XG5cdFx0Y29uc3QgYm9yZGVySGVpZ2h0ID0gMiAqIGJvcmRlcldpZHRoO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGl0ZW1IZWlnaHQsXG5cdFx0XHRzdGF0dXNCYXJIZWlnaHQsXG5cdFx0XHRib3JkZXJXaWR0aCxcblx0XHRcdGJvcmRlckhlaWdodCxcblx0XHRcdHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogMTAsXG5cdFx0XHR2ZXJ0aWNhbFBhZGRpbmc6IDIyLFxuXHRcdFx0aG9yaXpvbnRhbFBhZGRpbmc6IDE0LFxuXHRcdFx0ZGVmYXVsdFNpemU6IG5ldyBkb20uRGltZW5zaW9uKDQzMCwgc3RhdHVzQmFySGVpZ2h0ICsgMTIgKiBpdGVtSGVpZ2h0ICsgYm9yZGVySGVpZ2h0KVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9vbkxpc3RNb3VzZURvd25PclRhcChlOiBJTGlzdE1vdXNlRXZlbnQ8VEl0ZW0+IHwgSUxpc3RHZXN0dXJlRXZlbnQ8VEl0ZW0+KTogdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiBlLmVsZW1lbnQgPT09ICd1bmRlZmluZWQnIHx8IHR5cGVvZiBlLmluZGV4ID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIHByZXZlbnQgc3RlYWxpbmcgYnJvd3NlciBmb2N1cyBmcm9tIHRoZSB0ZXJtaW5hbFxuXHRcdGUuYnJvd3NlckV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZS5icm93c2VyRXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cblx0XHR0aGlzLl9zZWxlY3QoZS5lbGVtZW50LCBlLmluZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgX29uTGlzdFNlbGVjdGlvbihlOiBJTGlzdEV2ZW50PFRJdGVtPik6IHZvaWQge1xuXHRcdGlmIChlLmVsZW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fc2VsZWN0KGUuZWxlbWVudHNbMF0sIGUuaW5kZXhlc1swXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2VsZWN0KGl0ZW06IFRJdGVtLCBpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tcGxldGlvbk1vZGVsID0gdGhpcy5fY29tcGxldGlvbk1vZGVsO1xuXHRcdGlmIChjb21wbGV0aW9uTW9kZWwpIHtcblx0XHRcdHRoaXMuX29uRGlkU2VsZWN0LmZpcmUoeyBpdGVtLCBpbmRleCwgbW9kZWw6IGNvbXBsZXRpb25Nb2RlbCB9KTtcblx0XHR9XG5cdH1cblxuXHRzZWxlY3ROZXh0KCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX2NsZWFyUGFydGlhbFNlbGVjdGlvblN0YXRlKCk7XG5cdFx0dGhpcy5fbGlzdC5mb2N1c05leHQoMSwgdHJ1ZSk7XG5cdFx0Y29uc3QgZm9jdXMgPSB0aGlzLl9saXN0LmdldEZvY3VzKCk7XG5cdFx0aWYgKGZvY3VzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX2xpc3QucmV2ZWFsKGZvY3VzWzBdKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRzZWxlY3ROZXh0UGFnZSgpOiBib29sZWFuIHtcblx0XHR0aGlzLl9jbGVhclBhcnRpYWxTZWxlY3Rpb25TdGF0ZSgpO1xuXHRcdHRoaXMuX2xpc3QuZm9jdXNOZXh0UGFnZSgpO1xuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpO1xuXHRcdGlmIChmb2N1cy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9saXN0LnJldmVhbChmb2N1c1swXSk7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0c2VsZWN0UHJldmlvdXMoKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fY2xlYXJQYXJ0aWFsU2VsZWN0aW9uU3RhdGUoKTtcblx0XHR0aGlzLl9saXN0LmZvY3VzUHJldmlvdXMoMSwgdHJ1ZSk7XG5cdFx0Y29uc3QgZm9jdXMgPSB0aGlzLl9saXN0LmdldEZvY3VzKCk7XG5cdFx0aWYgKGZvY3VzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX2xpc3QucmV2ZWFsKGZvY3VzWzBdKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRzZWxlY3RQcmV2aW91c1BhZ2UoKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fY2xlYXJQYXJ0aWFsU2VsZWN0aW9uU3RhdGUoKTtcblx0XHR0aGlzLl9saXN0LmZvY3VzUHJldmlvdXNQYWdlKCk7XG5cdFx0Y29uc3QgZm9jdXMgPSB0aGlzLl9saXN0LmdldEZvY3VzKCk7XG5cdFx0aWYgKGZvY3VzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX2xpc3QucmV2ZWFsKGZvY3VzWzBdKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhclBhcnRpYWxTZWxlY3Rpb25TdGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9saXN0LnN0eWxlKGdldExpc3RTdHlsZXNXaXRoTW9kZShmYWxzZSkpO1xuXHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoQ2xhc3Nlcy5QYXJ0aWFsU2VsZWN0aW9uKTtcblx0fVxuXG5cdGdldEZvY3VzZWRJdGVtKCk6IElTaW1wbGVTZWxlY3RlZFN1Z2dlc3Rpb248VEl0ZW0+IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fY29tcGxldGlvbk1vZGVsKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpdGVtOiB0aGlzLl9saXN0LmdldEZvY3VzZWRFbGVtZW50cygpWzBdLFxuXHRcdFx0XHRpbmRleDogdGhpcy5fbGlzdC5nZXRGb2N1cygpWzBdLFxuXHRcdFx0XHRtb2RlbDogdGhpcy5fY29tcGxldGlvbk1vZGVsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNEZXRhaWxzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbignZXhwYW5kU3VnZ2VzdGlvbkRvY3MnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0RGV0YWlsc1Zpc2libGUodmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZSgnZXhwYW5kU3VnZ2VzdGlvbkRvY3MnLCB2YWx1ZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHRmb3JjZVJlbmRlcmluZ0Fib3ZlKCkge1xuXHRcdGlmICghdGhpcy5fZm9yY2VSZW5kZXJpbmdBYm92ZSkge1xuXHRcdFx0dGhpcy5fZm9yY2VSZW5kZXJpbmdBYm92ZSA9IHRydWU7XG5cdFx0XHR0aGlzLl9sYXlvdXQodGhpcy5fcGVyc2lzdGVkU2l6ZS5yZXN0b3JlKCkpO1xuXHRcdH1cblx0fVxuXG5cdHN0b3BGb3JjZVJlbmRlcmluZ0Fib3ZlKCkge1xuXHRcdHRoaXMuX2ZvcmNlUmVuZGVyaW5nQWJvdmUgPSBmYWxzZTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRMaXN0U3R5bGVzV2l0aE1vZGUocGFydGlhbD86IGJvb2xlYW4pOiBJTGlzdFN0eWxlcyB7XG5cdC8vIFRoZSBzdWdnZXN0IHdpZGdldCB1c2VzIHRoZSBsaXN0J3MgaW5hY3RpdmUgZm9jdXMgdG8gbWVhbiBzZWxlY3Rpb24gc2luY2UgaXQncyBub3QgYWN0dWFsbHlcblx0Ly8gZm9jdXNlZC5cblx0aWYgKHBhcnRpYWwpIHtcblx0XHRyZXR1cm4gZ2V0TGlzdFN0eWxlcyh7XG5cdFx0XHRsaXN0SW5hY3RpdmVGb2N1c091dGxpbmU6IGZvY3VzQm9yZGVyLFxuXHRcdFx0bGlzdEluYWN0aXZlRm9jdXNGb3JlZ3JvdW5kOiBlZGl0b3JTdWdnZXN0V2lkZ2V0Rm9yZWdyb3VuZCxcblx0XHR9KTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gZ2V0TGlzdFN0eWxlcyh7XG5cdFx0XHRsaXN0SW5hY3RpdmVGb2N1c0JhY2tncm91bmQ6IGVkaXRvclN1Z2dlc3RXaWRnZXRTZWxlY3RlZEJhY2tncm91bmQsXG5cdFx0XHRsaXN0SW5hY3RpdmVGb2N1c091dGxpbmU6IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyXG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUVyQixTQUFzQixZQUFZO0FBQ2xDLFNBQVMsNEJBQTRCO0FBR3JDLFNBQVMsV0FBVyx1Q0FBMEU7QUFDOUYsU0FBNEIseUJBQXlCLG1CQUFtQixvQkFBb0I7QUFDNUYsU0FBUyxTQUFnQix3QkFBd0I7QUFDakQsU0FBUyxtQkFBbUIsa0JBQStCO0FBQzNELFNBQVMsYUFBYTtBQUN0QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlCQUF5Qiw2QkFBNkIsa0NBQXNFO0FBQ3JJLFNBQXNCLG9CQUFvQixxQkFBcUI7QUFDL0QsWUFBWSxhQUFhO0FBQ3pC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QUFBLEVBQ1I7QUFBQSxFQUVBLHFCQUE4QjtBQUM3QixTQUFLLDRCQUE0QjtBQUNqQyxTQUFLLE1BQU0sa0JBQWtCO0FBQzdCLFVBQU0sUUFBUSxLQUFLLE1BQU0sU0FBUztBQUNsQyxRQUFJLE1BQU0sU0FBUyxHQUFHO0FBQ3JCLFdBQUssTUFBTSxPQUFPLE1BQU0sQ0FBQyxDQUFDO0FBQUEsSUFDM0I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsOEJBQW9DO0FBQzNDLFNBQUssTUFBTSxNQUFNLHNCQUFzQixLQUFLLENBQUM7QUFDN0MsU0FBSyxRQUFRLFFBQVEsVUFBVSxPQUFPLDBDQUF3QjtBQUFBLEVBQy9EO0FBQUEsRUFFQSxpQkFBK0Q7QUFDOUQsUUFBSSxLQUFLLGtCQUFrQjtBQUMxQixhQUFPO0FBQUEsUUFDTixNQUFNLEtBQUssTUFBTSxtQkFBbUIsRUFBRSxDQUFDO0FBQUEsUUFDdkMsT0FBTyxLQUFLLE1BQU0sU0FBUyxFQUFFLENBQUM7QUFBQSxRQUM5QixPQUFPLEtBQUs7QUFBQSxNQUNiO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxvQkFBNkI7QUFDcEMsV0FBTyxLQUFLLGdCQUFnQixXQUFXLHdCQUF3QixhQUFhLFNBQVMsS0FBSztBQUFBLEVBQzNGO0FBQUEsRUFFUSxtQkFBbUIsT0FBZ0I7QUFDMUMsU0FBSyxnQkFBZ0IsTUFBTSx3QkFBd0IsT0FBTyxhQUFhLFNBQVMsY0FBYyxJQUFJO0FBQUEsRUFDbkc7QUFBQSxFQUVBLHNCQUFzQjtBQUNyQixRQUFJLENBQUMsS0FBSyxzQkFBc0I7QUFDL0IsV0FBSyx1QkFBdUI7QUFDNUIsV0FBSyxRQUFRLEtBQUssZUFBZSxRQUFRLENBQUM7QUFBQSxJQUMzQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLDBCQUEwQjtBQUN6QixTQUFLLHVCQUF1QjtBQUFBLEVBQzdCO0FBQ0Q7QUFqM0JhLG9CQUVHLGtCQUEwQixTQUFTLHlCQUF5QixZQUFZO0FBRjNFLG9CQUdHLHlCQUFpQyxTQUFTLCtCQUErQixpQkFBaUI7QUFIN0Ysc0JBQU47QUFBQSxFQW9ESjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBdkRVO0FBbTNCYixTQUFTLHNCQUFzQixTQUFnQztBQUc5RCxNQUFJLFNBQVM7QUFDWixXQUFPLGNBQWM7QUFBQSxNQUNwQiwwQkFBMEI7QUFBQSxNQUMxQiw2QkFBNkI7QUFBQSxJQUM5QixDQUFDO0FBQUEsRUFDRixPQUFPO0FBQ04sV0FBTyxjQUFjO0FBQUEsTUFDcEIsNkJBQTZCO0FBQUEsTUFDN0IsMEJBQTBCO0FBQUEsSUFDM0IsQ0FBQztBQUFBLEVBQ0Y7QUFDRDsiLAogICJuYW1lcyI6IFsiU3RhdGUiLCAiV2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlIiwgIlN1Z2dlc3RTZWxlY3Rpb25Nb2RlIiwgIkNsYXNzZXMiLCAiZGV0YWlsIl0KfQo=
