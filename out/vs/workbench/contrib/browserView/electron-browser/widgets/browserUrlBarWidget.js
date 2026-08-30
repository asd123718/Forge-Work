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
import { localize } from "../../../../../nls.js";
import { $, addDisposableListener, AnimationFrameScheduler, EventType, isHTMLInputElement } from "../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IQuickInputService, QuickInputHideReason } from "../../../../../platform/quickinput/common/quickInput.js";
import {
  BrowserWidgetLocation
} from "../browserEditor.js";
let BrowserUrlBarWidget = class extends Disposable {
  constructor(_host, _quickInputService, hoverService) {
    super();
    this._host = _host;
    this._quickInputService = _quickInputService;
    this._urlRenderers = [];
    this._suggestionProviders = [];
    this._pickerActionProviders = [];
    this._picker = this._register(new MutableDisposable());
    this._suppressFocusOpen = false;
    this._suppressBlurRevert = false;
    this._pickerEdited = false;
    this._isSettingPickerValue = false;
    this.element = $(".browser-url-container");
    this._preUrlWidgetsContainer = $(".browser-pre-url-widgets");
    this._urlDisplay = $("div.browser-url-display");
    this._urlDisplay.spellcheck = false;
    this._urlDisplay.tabIndex = 0;
    this._urlDisplay.setAttribute("role", "textbox");
    this._urlDisplay.setAttribute("aria-multiline", "false");
    this._urlDisplay.setAttribute("data-placeholder", this._placeholder);
    this._updateReadonly();
    this._register(hoverService.setupManagedHover(
      getDefaultHoverDelegate("mouse"),
      this._urlDisplay,
      () => this._host.isReadonly ? localize("browser.addressLockedTooltip", "The address is read-only because the browser is locked to a file resource.") : void 0
    ));
    this._urlBarWidgetsContainer = $(".browser-url-bar-widgets");
    this.element.appendChild(this._preUrlWidgetsContainer);
    this.element.appendChild(this._urlDisplay);
    this.element.appendChild(this._urlBarWidgetsContainer);
    this._registerDisplayListeners();
  }
  /**
   * Notify the URL bar that the canonical URL (model.url) has changed and
   * the display should be re-rendered — unless the user is currently
   * editing, in which case we leave the typed text alone. Also keeps an
   * open picker in sync with the new URL.
   */
  refreshUrl() {
    this._updateReadonly();
    const isEditing = !!this._picker.value || this._urlDisplay.ownerDocument.activeElement === this._urlDisplay;
    if (!isEditing) {
      this._renderUrl();
    }
    this._urlDisplay.setAttribute("data-placeholder", this._placeholder);
    const picker = this._picker.value;
    if (picker && !this._pickerEdited) {
      this._isSettingPickerValue = true;
      try {
        picker.value = this._canonicalUrl;
      } finally {
        this._isSettingPickerValue = false;
      }
    }
  }
  /**
   * Optimistically render the given URL in the display while a navigation
   * is in flight. Skipped if the user is currently editing (picker open or
   * display focused) so we don't clobber their in-progress text.
   */
  previewUrl(url) {
    const isEditing = !!this._picker.value || this._urlDisplay.ownerDocument.activeElement === this._urlDisplay;
    if (!isEditing) {
      this._renderUrl(url);
    }
  }
  /**
   * Focus the URL display without opening the picker. Used for implicit/auto
   * focus (e.g. landing on a newly opened tab) where the user hasn't asked
   * to edit the URL yet.
   */
  focusUrlInput() {
    this._suppressFocusOpen = true;
    this._urlDisplay.focus();
    this._selectAll();
  }
  /**
   * Open the URL editing picker. Used when the user explicitly asks to
   * edit the URL (e.g. the "Focus URL Input" command / Ctrl+L).
   */
  openUrlPicker() {
    if (this._host.isReadonly) {
      this.focusUrlInput();
      return;
    }
    this._openPicker();
  }
  clear() {
    this._renderUrl();
    this._picker.value?.hide();
  }
  mountContributions(contributions) {
    const preUrl = [];
    const postUrl = [];
    for (const contribution of contributions) {
      for (const widget of contribution.widgets) {
        if (widget.location === BrowserWidgetLocation.PreUrl) {
          preUrl.push(widget);
        } else if (widget.location === BrowserWidgetLocation.PostUrl) {
          postUrl.push(widget);
        }
      }
      for (const renderer of contribution.urlRenderers) {
        this._urlRenderers.push(renderer);
        this._register(renderer.onDidChange(() => this._renderUrl()));
      }
      this._suggestionProviders.push(...contribution.urlSuggestionProviders);
      this._pickerActionProviders.push(...contribution.urlPickerActionProviders);
    }
    for (const widget of preUrl.sort((a, b) => a.order - b.order)) {
      this._preUrlWidgetsContainer.appendChild(widget.element);
    }
    for (const widget of postUrl.sort((a, b) => a.order - b.order)) {
      this._urlBarWidgetsContainer.appendChild(widget.element);
    }
    this._suggestionProviders.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this._pickerActionProviders.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this._renderUrl();
  }
  /** The canonical URL: model.url if attached, else the input's initial URL. */
  get _canonicalUrl() {
    return this._host.input?.url ?? "";
  }
  /** Placeholder text for the display and picker (host-provided or default). */
  get _placeholder() {
    return this._host.getPlaceholder?.() ?? localize("browser.urlPlaceholder", "Enter a URL");
  }
  _registerDisplayListeners() {
    let pendingMouseFocus = false;
    this._register(addDisposableListener(this._urlDisplay, EventType.POINTER_DOWN, () => {
      if (this._urlDisplay.ownerDocument.activeElement !== this._urlDisplay) {
        pendingMouseFocus = true;
      }
    }));
    this._register(addDisposableListener(this._urlDisplay, EventType.FOCUS, (event) => {
      if (this._suppressFocusOpen) {
        this._suppressFocusOpen = false;
        pendingMouseFocus = false;
        return;
      }
      if (this._host.isReadonly) {
        return;
      }
      if (!(event.relatedTarget instanceof Element) || event.relatedTarget.closest(".quick-input-widget")) {
        return;
      }
      if (pendingMouseFocus) {
        return;
      }
      this._openPicker();
    }));
    this._register(addDisposableListener(this._urlDisplay, EventType.BLUR, () => {
      pendingMouseFocus = false;
      this._urlDisplay.scrollLeft = 0;
      const sel = this._urlDisplay.ownerDocument.getSelection();
      if (sel && sel.anchorNode && this._urlDisplay.contains(sel.anchorNode)) {
        sel.removeAllRanges();
      }
      if (this._picker.value) {
        return;
      }
      if (this._suppressBlurRevert) {
        this._suppressBlurRevert = false;
        return;
      }
      if ((this._urlDisplay.textContent ?? "") !== this._canonicalUrl) {
        this._renderUrl();
      }
    }));
    this._register(addDisposableListener(this._urlDisplay, EventType.CLICK, () => {
      const isMouseFocusClick = pendingMouseFocus;
      pendingMouseFocus = false;
      if (!isMouseFocusClick || this._host.isReadonly) {
        return;
      }
      const selection = this._urlDisplay.ownerDocument.getSelection();
      if (selection && !selection.isCollapsed && selection.anchorNode && this._urlDisplay.contains(selection.anchorNode)) {
        return;
      }
      const value = this._urlDisplay.textContent ?? "";
      this._openPicker({ value, selection: [0, value.length], edited: false });
    }));
    this._register(addDisposableListener(this._urlDisplay, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.keyCode === KeyCode.Enter) {
        e.preventDefault();
        if (this._host.isReadonly) {
          return;
        }
        const value = this._urlDisplay.textContent?.trim() ?? "";
        if (value) {
          this._suppressBlurRevert = true;
          this._navigateText(value);
          this._host.ensureBrowserFocus();
        }
        return;
      }
      if (event.keyCode === KeyCode.Escape) {
        e.preventDefault();
        this._renderUrl();
        this._host.ensureBrowserFocus();
        return;
      }
      if (event.keyCode === KeyCode.KeyA && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
        e.preventDefault();
        event.stopPropagation();
        this._selectAll();
        return;
      }
    }));
    this._register(addDisposableListener(this._urlDisplay, "input", () => {
      if (this._picker.value) {
        return;
      }
      const value = this._urlDisplay.textContent ?? "";
      const caret = this._getCaretOffset();
      this._openPicker({ value, selection: [caret, caret], edited: true });
    }));
  }
  _selectAll() {
    const doc = this._urlDisplay.ownerDocument;
    const sel = doc.getSelection();
    if (!sel) {
      return;
    }
    const range = doc.createRange();
    range.selectNodeContents(this._urlDisplay);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  _updateReadonly() {
    const readonly = !!this._host.isReadonly;
    this._urlDisplay.contentEditable = readonly ? "false" : "plaintext-only";
    this._urlDisplay.setAttribute("aria-readonly", String(readonly));
    this._urlDisplay.setAttribute(
      "aria-label",
      readonly ? localize("browser.addressLockedAriaLabel", "Address. This address cannot be changed because the browser is locked to a file resource.") : localize("browser.address", "Address")
    );
    if (readonly) {
      this._picker.value?.hide();
    }
  }
  /** Character offset of the selection start within the display's text. */
  _getCaretOffset() {
    const doc = this._urlDisplay.ownerDocument;
    const sel = doc.getSelection();
    const total = this._urlDisplay.textContent?.length ?? 0;
    if (!sel || sel.rangeCount === 0) {
      return total;
    }
    const range = sel.getRangeAt(0);
    if (!this._urlDisplay.contains(range.startContainer)) {
      return total;
    }
    const pre = doc.createRange();
    pre.selectNodeContents(this._urlDisplay);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  }
  /** Place the selection at the given character range within the display. */
  _setSelection(start, end, direction = "forward") {
    const doc = this._urlDisplay.ownerDocument;
    const sel = doc.getSelection();
    if (!sel) {
      return;
    }
    const total = this._urlDisplay.textContent?.length ?? 0;
    const s = Math.max(0, Math.min(start, total));
    const e = Math.max(0, Math.min(end, total));
    const startPos = this._offsetToPosition(s);
    const endPos = this._offsetToPosition(e);
    if (direction === "backward") {
      sel.setBaseAndExtent(endPos.node, endPos.offset, startPos.node, startPos.offset);
    } else {
      sel.setBaseAndExtent(startPos.node, startPos.offset, endPos.node, endPos.offset);
    }
  }
  /** Walks the display's text nodes to map a character offset to a (node, offset) DOM position. */
  _offsetToPosition(offset) {
    const walker = this._urlDisplay.ownerDocument.createTreeWalker(this._urlDisplay, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let lastNode = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      lastNode = node;
      if (remaining <= node.data.length) {
        return { node, offset: remaining };
      }
      remaining -= node.data.length;
    }
    if (lastNode) {
      return { node: lastNode, offset: lastNode.data.length };
    }
    return { node: this._urlDisplay, offset: 0 };
  }
  /**
   * Render the given URL (defaults to the canonical URL from the model)
   * into the display. URL renderers are given a chance to decorate it
   * (e.g. red strikethrough on `https:` for cert errors); the first one to
   * claim the render wins. Passing an override lets callers preview an
   * in-progress edit (e.g. the picker mirroring its typed value).
   */
  _renderUrl(override) {
    const url = override ?? this._canonicalUrl;
    this._urlDisplay.textContent = "";
    for (const renderer of this._urlRenderers) {
      if (renderer.render(url, this._urlDisplay)) {
        return;
      }
    }
    if (url) {
      this._urlDisplay.textContent = url;
    }
  }
  /**
   * Build the synchronous primary picker item(s) for the current value: the
   * host's contextual items (e.g. Search and/or Go to), or a plain
   * "Go to <value>" fallback. Provider-contributed suggestions are loaded
   * asynchronously by {@link _loadProviderSuggestions} and appended below.
   */
  _buildSuggestionItems(value) {
    const items = [];
    const trimmed = value.trim();
    if (trimmed) {
      const primaryItems = this._host.getPrimaryActions?.(trimmed) ?? [];
      if (primaryItems.length > 0) {
        items.push(...primaryItems);
      } else {
        items.push({
          id: trimmed,
          label: localize("browser.goTo", "Go to {0}", trimmed),
          iconClass: ThemeIcon.asClassName(Codicon.arrowRight)
        });
      }
    }
    return items;
  }
  /**
   * Navigate from raw text the user committed directly (e.g. Enter on the
   * display, or accepting with no suggestion selected). Routes through the
   * host's default primary item so search-vs-URL resolution stays in the nav
   * bar; falls back to navigating the text as a URL when the host has no
   * primary items.
   */
  _navigateText(text) {
    const input = this._host.input;
    const trimmed = text.trim();
    if (!trimmed || !input) {
      return;
    }
    const primaryItems = this._host.getPrimaryActions?.(trimmed);
    const defaultItem = primaryItems?.[0];
    if (defaultItem?.apply) {
      void Promise.resolve(defaultItem.apply(input));
    } else {
      input.navigate(trimmed);
    }
  }
  /** Convert a provider suggestion to its picker-item representation. */
  _toPickerItem(s) {
    const item = {
      id: s.id,
      label: s.label,
      description: s.description,
      apply: s.apply
    };
    if (s.iconPath) {
      item.iconPath = s.iconPath;
    } else if (s.icon) {
      item.iconClass = ThemeIcon.asClassName(s.icon);
    }
    if (s.actions && s.actions.length > 0) {
      item.buttons = s.actions;
    }
    return item;
  }
  /**
   * Open the URL editing picker anchored to the URL container. While open,
   * the display is hidden (visibility:hidden, to preserve layout) so only
   * the picker is visible.
   *
   * @param initial Optional display state carried into the picker.
   */
  _openPicker(initial) {
    if (this._host.isReadonly) {
      return;
    }
    if (this._picker.value) {
      return;
    }
    this._urlDisplay.style.visibility = "hidden";
    const picker = this._quickInputService.createQuickPick({ useSeparators: true });
    picker.placeholder = this._placeholder;
    picker.ignoreFocusOut = false;
    picker.sortByLabel = false;
    picker.matchOnDescription = true;
    picker.anchor = this.element;
    picker.anchorPosition = "overlay";
    picker.filterValue = (filter) => filter.substring(0, 1e3);
    if (initial !== void 0) {
      picker.value = initial.value;
      picker.valueSelection = initial.selection;
    } else {
      picker.value = this._canonicalUrl;
      picker.valueSelection = [0, this._canonicalUrl.length];
    }
    this._pickerEdited = initial?.edited ?? false;
    const disposables = new DisposableStore();
    const providerStates = /* @__PURE__ */ new Map();
    disposables.add(toDisposable(() => {
      for (const state of providerStates.values()) {
        state.cts.value?.cancel();
      }
    }));
    for (const provider of this._suggestionProviders) {
      providerStates.set(provider, {
        suggestions: [],
        cts: disposables.add(new MutableDisposable())
      });
    }
    let currentValue = picker.value;
    const render = (preserveSelection) => {
      const previousActiveId = preserveSelection ? picker.activeItems[0]?.id : void 0;
      const defaultItems = this._buildSuggestionItems(currentValue);
      const items = [...defaultItems];
      for (const provider of this._suggestionProviders) {
        const state = providerStates.get(provider);
        if (!state || state.suggestions.length === 0) {
          continue;
        }
        if (provider.label) {
          items.push({
            type: "separator",
            label: provider.label,
            description: provider.description,
            buttons: provider.actions
          });
        }
        for (const s of state.suggestions) {
          items.push(this._toPickerItem(s));
        }
      }
      picker.items = items;
      const defaultActive = defaultItems.find((i) => i.type !== "separator");
      const restored = previousActiveId !== void 0 ? items.find((i) => i.type !== "separator" && i.id === previousActiveId) : void 0;
      const active = restored ?? defaultActive;
      if (picker.activeItems[0] !== active || picker.activeItems.length !== (active ? 1 : 0)) {
        picker.activeItems = active ? [active] : [];
      }
    };
    const renderScheduler = disposables.add(new AnimationFrameScheduler(this.element, () => render(true)));
    const refreshProvider = (provider) => {
      const state = providerStates.get(provider);
      const input = this._host.input;
      if (!state || !input) {
        return;
      }
      state.cts.value?.cancel();
      const cts = new CancellationTokenSource();
      state.cts.value = cts;
      void provider.getSuggestions({ text: currentValue, input }, cts.token).then(
        (results) => {
          if (cts.token.isCancellationRequested || this._picker.value !== picker) {
            return;
          }
          state.suggestions = results;
          renderScheduler.schedule();
        },
        () => {
        }
      );
    };
    const refreshAllProviders = () => {
      for (const provider of this._suggestionProviders) {
        refreshProvider(provider);
      }
    };
    render(false);
    refreshAllProviders();
    for (const provider of this._suggestionProviders) {
      if (provider.onDidChange) {
        disposables.add(provider.onDidChange(() => refreshProvider(provider)));
      }
    }
    let selectionAtHide;
    disposables.add(picker.onWillHide(() => {
      const active = this._urlDisplay.ownerDocument.activeElement;
      if (isHTMLInputElement(active) && active.selectionStart !== null && active.selectionEnd !== null) {
        selectionAtHide = {
          start: active.selectionStart,
          end: active.selectionEnd,
          direction: active.selectionDirection === "backward" ? "backward" : "forward"
        };
      }
    }));
    disposables.add(picker.onDidChangeValue((value) => {
      if (!this._isSettingPickerValue) {
        this._pickerEdited = true;
      }
      currentValue = value;
      renderScheduler.cancel();
      render(false);
      refreshAllProviders();
      this._renderUrl(value);
    }));
    const refreshButtons = () => {
      const input = this._host.input;
      if (!input) {
        picker.buttons = [];
        return;
      }
      const buttons = [];
      for (const provider of this._pickerActionProviders) {
        buttons.push(...provider.getActions(input));
      }
      picker.buttons = buttons;
    };
    refreshButtons();
    for (const provider of this._pickerActionProviders) {
      if (provider.onDidChange) {
        disposables.add(provider.onDidChange(refreshButtons));
      }
    }
    let actionTaken = false;
    disposables.add(picker.onDidTriggerButton((button) => {
      actionTaken = true;
      const action = button;
      const input = this._host.input;
      if (typeof action.run === "function" && input) {
        void Promise.resolve(action.run(input));
      }
    }));
    disposables.add(picker.onDidTriggerItemButton(({ button }) => {
      const action = button;
      const input = this._host.input;
      if (typeof action.run === "function" && input) {
        void Promise.resolve(action.run(input));
      }
    }));
    disposables.add(picker.onDidTriggerSeparatorButton(({ button }) => {
      const action = button;
      const input = this._host.input;
      if (typeof action.run === "function" && input) {
        void Promise.resolve(action.run(input));
      }
    }));
    disposables.add(picker.onDidAccept(() => {
      actionTaken = true;
      const active = picker.activeItems[0];
      const fallbackUrl = picker.value;
      const input = this._host.input;
      picker.hide();
      if (active?.apply) {
        if (input) {
          void Promise.resolve(active.apply(input));
        }
        return;
      }
      this._navigateText(active?.id ?? fallbackUrl);
    }));
    disposables.add(picker.onDidHide(({ reason }) => {
      this._urlDisplay.style.visibility = "";
      const replaced = this._quickInputService.currentQuickInput !== void 0 && this._quickInputService.currentQuickInput !== picker;
      const refocusDisplay = !actionTaken && reason !== QuickInputHideReason.Blur && !replaced;
      if (refocusDisplay) {
        this._urlDisplay.focus();
        if (selectionAtHide !== void 0) {
          this._setSelection(selectionAtHide.start, selectionAtHide.end, selectionAtHide.direction);
        }
      } else {
        this._renderUrl();
        if (actionTaken) {
          this._host.ensureBrowserFocus();
        }
      }
      disposables.dispose();
      this._pickerEdited = false;
      this._isSettingPickerValue = false;
      this._picker.clear();
    }));
    disposables.add(picker);
    this._picker.value = picker;
    picker.show();
  }
};
BrowserUrlBarWidget = __decorateClass([
  __decorateParam(1, IQuickInputService),
  __decorateParam(2, IHoverService)
], BrowserUrlBarWidget);
export {
  BrowserUrlBarWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFx3aWRnZXRzXFxicm93c2VyVXJsQmFyV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBBbmltYXRpb25GcmFtZVNjaGVkdWxlciwgRXZlbnRUeXBlLCBpc0hUTUxJbnB1dEVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2ssIElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrU2VwYXJhdG9yLCBRdWlja0lucHV0SGlkZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgQnJvd3NlckVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2Jyb3dzZXJFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQge1xuXHRCcm93c2VyRWRpdG9yQ29udHJpYnV0aW9uLFxuXHRCcm93c2VyV2lkZ2V0TG9jYXRpb24sXG5cdElCcm93c2VyRWRpdG9yV2lkZ2V0LFxuXHRJQnJvd3NlclVybFBpY2tlckFjdGlvbixcblx0SUJyb3dzZXJVcmxQaWNrZXJBY3Rpb25Qcm92aWRlcixcblx0SUJyb3dzZXJVcmxSZW5kZXJlcixcblx0SUJyb3dzZXJVcmxTdWdnZXN0aW9uLFxuXHRJQnJvd3NlclVybFN1Z2dlc3Rpb25BY3Rpb24sXG5cdElCcm93c2VyVXJsU3VnZ2VzdGlvblByb3ZpZGVyLFxufSBmcm9tICcuLi9icm93c2VyRWRpdG9yLmpzJztcblxuLyoqXG4gKiBRdWljay1waWNrIGl0ZW0gdXNlZCBieSB0aGUgVVJMIHBpY2tlci4gVGhlIGJ1aWx0LWluIFwiR28gdG9cIiBmYWxsYmFjayBlbnRyeVxuICogbGVhdmVzIHtAbGluayBhcHBseX0gdW5zZXQgYW5kIGlzIGhhbmRsZWQgaW5saW5lOyBob3N0LSBhbmRcbiAqIHByb3ZpZGVyLWNvbnRyaWJ1dGVkIGl0ZW1zIGNhcnJ5IHRoZWlyIG93biB7QGxpbmsgYXBwbHl9IGNhbGxiYWNrIHRoYXQgcnVuc1xuICogYWdhaW5zdCB0aGUgZWRpdG9yJ3MgaW5wdXQuXG4gKi9cbmV4cG9ydCB0eXBlIElVcmxQaWNrZXJJdGVtID0gSVF1aWNrUGlja0l0ZW0gJiB7XG5cdGFwcGx5PyhpbnB1dDogQnJvd3NlckVkaXRvcklucHV0KTogdm9pZCB8IFByb21pc2U8dm9pZD47XG59O1xuXG4vKipcbiAqIFRoZSBtaW5pbWFsIHN1cmZhY2Uge0BsaW5rIEJyb3dzZXJVcmxCYXJXaWRnZXR9IG5lZWRzIGZyb20gaXRzIG93bmluZ1xuICogZWRpdG9yOiB0aGUgY3VycmVudCBicm93c2VyIGlucHV0IChmb3IgdGhlIGNhbm9uaWNhbCBVUkwsIG5hdmlnYXRpb24sIGFuZFxuICogcHJvdmlkZXIgY29udGV4dCkgYW5kIGEgd2F5IHRvIHJlbGVhc2UgZm9jdXMgYmFjayBpbnRvIHRoZSBwYWdlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElCcm93c2VyVXJsQmFySG9zdCB7XG5cdHJlYWRvbmx5IGlucHV0OiBCcm93c2VyRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlzUmVhZG9ubHk/OiBib29sZWFuO1xuXHRlbnN1cmVCcm93c2VyRm9jdXMoKTogdm9pZDtcblx0LyoqXG5cdCAqIFJlc29sdmUgdGhlIGJ1aWx0LWluIHByaW1hcnkgcGlja2VyIGl0ZW0ocykgZm9yIHRoZSBnaXZlbiAodHJpbW1lZCxcblx0ICogbm9uLWVtcHR5KSB0ZXh0LiBUaGUgZmlyc3QgaXRlbSBpcyB0cmVhdGVkIGFzIHRoZSBkZWZhdWx0IGFjdGlvbiB3aGVuXG5cdCAqIHRoZSB1c2VyIGNvbW1pdHMgdGhlIHRleHQgZGlyZWN0bHkgKGUuZy4gcHJlc3NlcyBFbnRlciB3aXRob3V0IHBpY2tpbmcgYVxuXHQgKiBzdWdnZXN0aW9uKS4gUmV0dXJuaW5nIG11bHRpcGxlIGl0ZW1zIGxldHMgdGhlIGJhciBvZmZlciBhIGNob2ljZSAoZS5nLlxuXHQgKiBTZWFyY2ggdGhlbiBHbyB0byBmb3IgYW1iaWd1b3VzIGlucHV0KS4gV2hlbiBvbWl0dGVkIG9yIGVtcHR5LCB0aGVcblx0ICogd2lkZ2V0IGZhbGxzIGJhY2sgdG8gYSBwbGFpbiBcIkdvIHRvIHt0ZXh0fVwiIGVudHJ5LlxuXHQgKi9cblx0Z2V0UHJpbWFyeUFjdGlvbnM/KHRleHQ6IHN0cmluZyk6IHJlYWRvbmx5IElVcmxQaWNrZXJJdGVtW107XG5cdC8qKlxuXHQgKiBUaGUgcGxhY2Vob2xkZXIgc2hvd24gaW4gdGhlIFVSTCBkaXNwbGF5IGFuZCBwaWNrZXIuIFdoZW4gb21pdHRlZCB0aGVcblx0ICogd2lkZ2V0IHVzZXMgYSBwbGFpbiBcIkVudGVyIGEgVVJMXCIgcGxhY2Vob2xkZXIuXG5cdCAqL1xuXHRnZXRQbGFjZWhvbGRlcj8oKTogc3RyaW5nO1xufVxuXG4vKipcbiAqIFRoZSBVUkwgYmFyIHdpZGdldDogYSBjb250ZW50ZWRpdGFibGUgZGlzcGxheSBzaG93aW5nIHRoZSBjdXJyZW50IFVSTCxcbiAqIHdpdGggYSBxdWljay1waWNrIG92ZXJsYXkgYXMgdGhlIGVkaXRpbmcgc3VyZmFjZS4gSG9zdHMgcHJlL3Bvc3QtVVJMXG4gKiB3aWRnZXQgc2xvdHMsIFVSTCByZW5kZXJlcnMgKGUuZy4gY2VydC1lcnJvciBkZWNvcmF0aW9uKSwgc3VnZ2VzdGlvblxuICogcHJvdmlkZXJzLCBhbmQgcGVyLXBpY2tlciBjaHJvbWUgYWN0aW9uIHByb3ZpZGVycy5cbiAqXG4gKiBFZGl0aW5nIG1vZGVsOlxuICogIC0gU3RlYWR5IHN0YXRlOiB7QGxpbmsgX3VybERpc3BsYXl9IGlzIGEgYGNvbnRlbnRlZGl0YWJsZWAgZGl2IHRoYXQgaG9zdHNcbiAqICAgIHRoZSBVUkwgcmVuZGVyZXJzJyByaWNoIHJlbmRlcmluZyBhbmQgYWNjZXB0cyBuYXRpdmUgaW5wdXQgYmVoYXZpb3JzXG4gKiAgICAoY2FyZXQsIHR5cGluZywgYmFja3NwYWNlLCBwYXN0ZSkuXG4gKiAgLSBFeHBsaWNpdCB1c2VyIGFjdGl2YXRpb24gKGNsaWNrL1RhYiBvbiB0aGUgZGlzcGxheSwge0BsaW5rIG9wZW5VcmxQaWNrZXJ9LFxuICogICAgdHlwaW5nIGludG8gdGhlIGZvY3VzZWQgZGlzcGxheSk6IHRoZSBxdWljay1waWNrIGVkaXRpbmcgc3VyZmFjZSBvcGVucyxcbiAqICAgIG92ZXJsYXlpbmcgdGhlIFVSTCBjb250YWluZXIgd2l0aCBzdWdnZXN0aW9ucy5cbiAqL1xuZXhwb3J0IGNsYXNzIEJyb3dzZXJVcmxCYXJXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VybERpc3BsYXk6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmVVcmxXaWRnZXRzQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdXJsQmFyV2lkZ2V0c0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VybFJlbmRlcmVyczogSUJyb3dzZXJVcmxSZW5kZXJlcltdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1Z2dlc3Rpb25Qcm92aWRlcnM6IElCcm93c2VyVXJsU3VnZ2VzdGlvblByb3ZpZGVyW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGlja2VyQWN0aW9uUHJvdmlkZXJzOiBJQnJvd3NlclVybFBpY2tlckFjdGlvblByb3ZpZGVyW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGlja2VyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElRdWlja1BpY2s8SVVybFBpY2tlckl0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9Pj4oKSk7XG5cblx0cHJpdmF0ZSBfc3VwcHJlc3NGb2N1c09wZW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfc3VwcHJlc3NCbHVyUmV2ZXJ0ID0gZmFsc2U7XG5cdHByaXZhdGUgX3BpY2tlckVkaXRlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9pc1NldHRpbmdQaWNrZXJWYWx1ZSA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hvc3Q6IElCcm93c2VyVXJsQmFySG9zdCxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5lbGVtZW50ID0gJCgnLmJyb3dzZXItdXJsLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuX3ByZVVybFdpZGdldHNDb250YWluZXIgPSAkKCcuYnJvd3Nlci1wcmUtdXJsLXdpZGdldHMnKTtcblxuXHRcdC8vIFRoZSBVUkwgZGlzcGxheSBpcyBhIGNvbnRlbnRlZGl0YWJsZSBkaXYgc28gaXQgYmVoYXZlcyBsaWtlIGFuIGlucHV0XG5cdFx0Ly8gKGNhcmV0LCB0eXBpbmcsIGJhY2tzcGFjZSwgcGFzdGUpIHdoaWxlIHN0aWxsIHBlcm1pdHRpbmcgY2hpbGQgc3BhbnMgZm9yXG5cdFx0Ly8gVVJMIHJlbmRlcmVyIHN0eWxpbmcgKGUuZy4gcmVkIHN0cmlrZXRocm91Z2ggb24gYGh0dHBzOmAgZm9yIGNlcnQgZXJyb3JzKS5cblx0XHR0aGlzLl91cmxEaXNwbGF5ID0gJCgnZGl2LmJyb3dzZXItdXJsLWRpc3BsYXknKTtcblx0XHR0aGlzLl91cmxEaXNwbGF5LnNwZWxsY2hlY2sgPSBmYWxzZTtcblx0XHR0aGlzLl91cmxEaXNwbGF5LnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLl91cmxEaXNwbGF5LnNldEF0dHJpYnV0ZSgncm9sZScsICd0ZXh0Ym94Jyk7XG5cdFx0dGhpcy5fdXJsRGlzcGxheS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbXVsdGlsaW5lJywgJ2ZhbHNlJyk7XG5cdFx0dGhpcy5fdXJsRGlzcGxheS5zZXRBdHRyaWJ1dGUoJ2RhdGEtcGxhY2Vob2xkZXInLCB0aGlzLl9wbGFjZWhvbGRlcik7XG5cdFx0dGhpcy5fdXBkYXRlUmVhZG9ubHkoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoXG5cdFx0XHRnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSxcblx0XHRcdHRoaXMuX3VybERpc3BsYXksXG5cdFx0XHQoKSA9PiB0aGlzLl9ob3N0LmlzUmVhZG9ubHlcblx0XHRcdFx0PyBsb2NhbGl6ZSgnYnJvd3Nlci5hZGRyZXNzTG9ja2VkVG9vbHRpcCcsIFwiVGhlIGFkZHJlc3MgaXMgcmVhZC1vbmx5IGJlY2F1c2UgdGhlIGJyb3dzZXIgaXMgbG9ja2VkIHRvIGEgZmlsZSByZXNvdXJjZS5cIilcblx0XHRcdFx0OiB1bmRlZmluZWRcblx0XHQpKTtcblxuXHRcdHRoaXMuX3VybEJhcldpZGdldHNDb250YWluZXIgPSAkKCcuYnJvd3Nlci11cmwtYmFyLXdpZGdldHMnKTtcblxuXHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLl9wcmVVcmxXaWRnZXRzQ29udGFpbmVyKTtcblx0XHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5fdXJsRGlzcGxheSk7XG5cdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuX3VybEJhcldpZGdldHNDb250YWluZXIpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXJEaXNwbGF5TGlzdGVuZXJzKCk7XG5cdH1cblxuXHQvKipcblx0ICogTm90aWZ5IHRoZSBVUkwgYmFyIHRoYXQgdGhlIGNhbm9uaWNhbCBVUkwgKG1vZGVsLnVybCkgaGFzIGNoYW5nZWQgYW5kXG5cdCAqIHRoZSBkaXNwbGF5IHNob3VsZCBiZSByZS1yZW5kZXJlZCBcdTIwMTQgdW5sZXNzIHRoZSB1c2VyIGlzIGN1cnJlbnRseVxuXHQgKiBlZGl0aW5nLCBpbiB3aGljaCBjYXNlIHdlIGxlYXZlIHRoZSB0eXBlZCB0ZXh0IGFsb25lLiBBbHNvIGtlZXBzIGFuXG5cdCAqIG9wZW4gcGlja2VyIGluIHN5bmMgd2l0aCB0aGUgbmV3IFVSTC5cblx0ICovXG5cdHJlZnJlc2hVcmwoKTogdm9pZCB7XG5cdFx0dGhpcy5fdXBkYXRlUmVhZG9ubHkoKTtcblx0XHRjb25zdCBpc0VkaXRpbmcgPSAhIXRoaXMuX3BpY2tlci52YWx1ZSB8fCB0aGlzLl91cmxEaXNwbGF5Lm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gdGhpcy5fdXJsRGlzcGxheTtcblx0XHRpZiAoIWlzRWRpdGluZykge1xuXHRcdFx0dGhpcy5fcmVuZGVyVXJsKCk7XG5cdFx0fVxuXHRcdC8vIEtlZXAgdGhlIHBsYWNlaG9sZGVyIGluIHN5bmMgd2l0aCBob3N0IHN0YXRlIChlLmcuIHNlYXJjaCBlbmFibGVtZW50KS5cblx0XHR0aGlzLl91cmxEaXNwbGF5LnNldEF0dHJpYnV0ZSgnZGF0YS1wbGFjZWhvbGRlcicsIHRoaXMuX3BsYWNlaG9sZGVyKTtcblx0XHRjb25zdCBwaWNrZXIgPSB0aGlzLl9waWNrZXIudmFsdWU7XG5cdFx0aWYgKHBpY2tlciAmJiAhdGhpcy5fcGlja2VyRWRpdGVkKSB7XG5cdFx0XHR0aGlzLl9pc1NldHRpbmdQaWNrZXJWYWx1ZSA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRwaWNrZXIudmFsdWUgPSB0aGlzLl9jYW5vbmljYWxVcmw7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9pc1NldHRpbmdQaWNrZXJWYWx1ZSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBPcHRpbWlzdGljYWxseSByZW5kZXIgdGhlIGdpdmVuIFVSTCBpbiB0aGUgZGlzcGxheSB3aGlsZSBhIG5hdmlnYXRpb25cblx0ICogaXMgaW4gZmxpZ2h0LiBTa2lwcGVkIGlmIHRoZSB1c2VyIGlzIGN1cnJlbnRseSBlZGl0aW5nIChwaWNrZXIgb3BlbiBvclxuXHQgKiBkaXNwbGF5IGZvY3VzZWQpIHNvIHdlIGRvbid0IGNsb2JiZXIgdGhlaXIgaW4tcHJvZ3Jlc3MgdGV4dC5cblx0ICovXG5cdHByZXZpZXdVcmwodXJsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBpc0VkaXRpbmcgPSAhIXRoaXMuX3BpY2tlci52YWx1ZSB8fCB0aGlzLl91cmxEaXNwbGF5Lm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gdGhpcy5fdXJsRGlzcGxheTtcblx0XHRpZiAoIWlzRWRpdGluZykge1xuXHRcdFx0dGhpcy5fcmVuZGVyVXJsKHVybCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZvY3VzIHRoZSBVUkwgZGlzcGxheSB3aXRob3V0IG9wZW5pbmcgdGhlIHBpY2tlci4gVXNlZCBmb3IgaW1wbGljaXQvYXV0b1xuXHQgKiBmb2N1cyAoZS5nLiBsYW5kaW5nIG9uIGEgbmV3bHkgb3BlbmVkIHRhYikgd2hlcmUgdGhlIHVzZXIgaGFzbid0IGFza2VkXG5cdCAqIHRvIGVkaXQgdGhlIFVSTCB5ZXQuXG5cdCAqL1xuXHRmb2N1c1VybElucHV0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3N1cHByZXNzRm9jdXNPcGVuID0gdHJ1ZTtcblx0XHR0aGlzLl91cmxEaXNwbGF5LmZvY3VzKCk7XG5cdFx0dGhpcy5fc2VsZWN0QWxsKCk7XG5cdH1cblxuXHQvKipcblx0ICogT3BlbiB0aGUgVVJMIGVkaXRpbmcgcGlja2VyLiBVc2VkIHdoZW4gdGhlIHVzZXIgZXhwbGljaXRseSBhc2tzIHRvXG5cdCAqIGVkaXQgdGhlIFVSTCAoZS5nLiB0aGUgXCJGb2N1cyBVUkwgSW5wdXRcIiBjb21tYW5kIC8gQ3RybCtMKS5cblx0ICovXG5cdG9wZW5VcmxQaWNrZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2hvc3QuaXNSZWFkb25seSkge1xuXHRcdFx0dGhpcy5mb2N1c1VybElucHV0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX29wZW5QaWNrZXIoKTtcblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlclVybCgpO1xuXHRcdHRoaXMuX3BpY2tlci52YWx1ZT8uaGlkZSgpO1xuXHR9XG5cblx0bW91bnRDb250cmlidXRpb25zKGNvbnRyaWJ1dGlvbnM6IHJlYWRvbmx5IEJyb3dzZXJFZGl0b3JDb250cmlidXRpb25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IHByZVVybDogSUJyb3dzZXJFZGl0b3JXaWRnZXRbXSA9IFtdO1xuXHRcdGNvbnN0IHBvc3RVcmw6IElCcm93c2VyRWRpdG9yV2lkZ2V0W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiBjb250cmlidXRpb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiBjb250cmlidXRpb24ud2lkZ2V0cykge1xuXHRcdFx0XHRpZiAod2lkZ2V0LmxvY2F0aW9uID09PSBCcm93c2VyV2lkZ2V0TG9jYXRpb24uUHJlVXJsKSB7XG5cdFx0XHRcdFx0cHJlVXJsLnB1c2god2lkZ2V0KTtcblx0XHRcdFx0fSBlbHNlIGlmICh3aWRnZXQubG9jYXRpb24gPT09IEJyb3dzZXJXaWRnZXRMb2NhdGlvbi5Qb3N0VXJsKSB7XG5cdFx0XHRcdFx0cG9zdFVybC5wdXNoKHdpZGdldCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgcmVuZGVyZXIgb2YgY29udHJpYnV0aW9uLnVybFJlbmRlcmVycykge1xuXHRcdFx0XHR0aGlzLl91cmxSZW5kZXJlcnMucHVzaChyZW5kZXJlcik7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlbmRlcmVyLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX3JlbmRlclVybCgpKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdWdnZXN0aW9uUHJvdmlkZXJzLnB1c2goLi4uY29udHJpYnV0aW9uLnVybFN1Z2dlc3Rpb25Qcm92aWRlcnMpO1xuXHRcdFx0dGhpcy5fcGlja2VyQWN0aW9uUHJvdmlkZXJzLnB1c2goLi4uY29udHJpYnV0aW9uLnVybFBpY2tlckFjdGlvblByb3ZpZGVycyk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHByZVVybC5zb3J0KChhLCBiKSA9PiBhLm9yZGVyIC0gYi5vcmRlcikpIHtcblx0XHRcdHRoaXMuX3ByZVVybFdpZGdldHNDb250YWluZXIuYXBwZW5kQ2hpbGQod2lkZ2V0LmVsZW1lbnQpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiBwb3N0VXJsLnNvcnQoKGEsIGIpID0+IGEub3JkZXIgLSBiLm9yZGVyKSkge1xuXHRcdFx0dGhpcy5fdXJsQmFyV2lkZ2V0c0NvbnRhaW5lci5hcHBlbmRDaGlsZCh3aWRnZXQuZWxlbWVudCk7XG5cdFx0fVxuXHRcdHRoaXMuX3N1Z2dlc3Rpb25Qcm92aWRlcnMuc29ydCgoYSwgYikgPT4gKGEub3JkZXIgPz8gMCkgLSAoYi5vcmRlciA/PyAwKSk7XG5cdFx0dGhpcy5fcGlja2VyQWN0aW9uUHJvdmlkZXJzLnNvcnQoKGEsIGIpID0+IChhLm9yZGVyID8/IDApIC0gKGIub3JkZXIgPz8gMCkpO1xuXHRcdHRoaXMuX3JlbmRlclVybCgpO1xuXHR9XG5cblx0LyoqIFRoZSBjYW5vbmljYWwgVVJMOiBtb2RlbC51cmwgaWYgYXR0YWNoZWQsIGVsc2UgdGhlIGlucHV0J3MgaW5pdGlhbCBVUkwuICovXG5cdHByaXZhdGUgZ2V0IF9jYW5vbmljYWxVcmwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5faG9zdC5pbnB1dD8udXJsID8/ICcnO1xuXHR9XG5cblx0LyoqIFBsYWNlaG9sZGVyIHRleHQgZm9yIHRoZSBkaXNwbGF5IGFuZCBwaWNrZXIgKGhvc3QtcHJvdmlkZWQgb3IgZGVmYXVsdCkuICovXG5cdHByaXZhdGUgZ2V0IF9wbGFjZWhvbGRlcigpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9ob3N0LmdldFBsYWNlaG9sZGVyPy4oKSA/PyBsb2NhbGl6ZSgnYnJvd3Nlci51cmxQbGFjZWhvbGRlcicsIFwiRW50ZXIgYSBVUkxcIik7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckRpc3BsYXlMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0Ly8gRGlzcGxheSBpbnRlcmFjdGlvbiBzdGF0ZSBtYWNoaW5lOlxuXHRcdC8vICAgLSBLZXlib2FyZCBmb2N1cyAoVGFiKSBvcGVucyB0aGUgcGlja2VyIGltbWVkaWF0ZWx5LlxuXHRcdC8vICAgLSBNb3VzZSBmb2N1cyBkZWZlcnMgdGhlIGRlY2lzaW9uIHRvIGBjbGlja2Agc28gZHJhZy1zZWxlY3QgY2FuIGNvbXBsZXRlLlxuXHRcdC8vICAgLSBBbHJlYWR5LWZvY3VzZWQgY2xpY2tzIGtlZXAgZWRpdGluZyBpbiB0aGUgZGlzcGxheSAobm8gcGlja2VyIGF1dG8tb3BlbikuXG5cdFx0Ly8gICAtIFR5cGluZyBpbnRvIHRoZSBkaXNwbGF5IHByb21vdGVzIHRoZSBlZGl0IGludG8gdGhlIHBpY2tlciB2aWEgYGlucHV0YC5cblx0XHRsZXQgcGVuZGluZ01vdXNlRm9jdXMgPSBmYWxzZTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdXJsRGlzcGxheSwgRXZlbnRUeXBlLlBPSU5URVJfRE9XTiwgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3VybERpc3BsYXkub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50ICE9PSB0aGlzLl91cmxEaXNwbGF5KSB7XG5cdFx0XHRcdHBlbmRpbmdNb3VzZUZvY3VzID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3VybERpc3BsYXksIEV2ZW50VHlwZS5GT0NVUywgKGV2ZW50OiBGb2N1c0V2ZW50KSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fc3VwcHJlc3NGb2N1c09wZW4pIHtcblx0XHRcdFx0dGhpcy5fc3VwcHJlc3NGb2N1c09wZW4gPSBmYWxzZTtcblx0XHRcdFx0cGVuZGluZ01vdXNlRm9jdXMgPSBmYWxzZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2hvc3QuaXNSZWFkb25seSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBPbmx5IG9wZW4gdGhlIHBpY2tlciBpZiBmb2N1cyBpcyBhbHJlYWR5IHdpdGhpbiB0aGUgd29ya2JlbmNoLCBhbmQgbm90IGJlaW5nIHRyYW5zZmVycmVkIGZyb20gYSBxdWljayBpbnB1dC5cblx0XHRcdGlmICghKGV2ZW50LnJlbGF0ZWRUYXJnZXQgaW5zdGFuY2VvZiBFbGVtZW50KSB8fCBldmVudC5yZWxhdGVkVGFyZ2V0LmNsb3Nlc3QoJy5xdWljay1pbnB1dC13aWRnZXQnKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAocGVuZGluZ01vdXNlRm9jdXMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb3BlblBpY2tlcigpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdXJsRGlzcGxheSwgRXZlbnRUeXBlLkJMVVIsICgpID0+IHtcblx0XHRcdHBlbmRpbmdNb3VzZUZvY3VzID0gZmFsc2U7XG5cdFx0XHQvLyBTbmFwIHRoZSBkaXNwbGF5IGJhY2sgdG8gdGhlIHN0YXJ0IG9mIHRoZSBVUkwgc28gaXQgZG9lc24ndCBzdGF5XG5cdFx0XHQvLyBzY3JvbGxlZCB0byB3aGVyZXZlciB0aGUgY2FyZXQgd2FzIChlLmcuIGFmdGVyIGFycm93LWtleWluZyB0b1xuXHRcdFx0Ly8gdGhlIGVuZCBhbmQgdGhlbiBjbGlja2luZyBhd2F5KS5cblx0XHRcdHRoaXMuX3VybERpc3BsYXkuc2Nyb2xsTGVmdCA9IDA7XG5cdFx0XHQvLyBDbGVhciBhbnkgdGV4dCBzZWxlY3Rpb24gd2l0aGluIHRoZSBkaXNwbGF5IHNvIGl0IGRvZXNuJ3Qgc3RheVxuXHRcdFx0Ly8gaGlnaGxpZ2h0ZWQgYWZ0ZXIgZm9jdXMgbW92ZXMgYXdheSAoZS5nLiBpbnRvIHRoZSBicm93c2VyKS5cblx0XHRcdGNvbnN0IHNlbCA9IHRoaXMuX3VybERpc3BsYXkub3duZXJEb2N1bWVudC5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGlmIChzZWwgJiYgc2VsLmFuY2hvck5vZGUgJiYgdGhpcy5fdXJsRGlzcGxheS5jb250YWlucyhzZWwuYW5jaG9yTm9kZSkpIHtcblx0XHRcdFx0c2VsLnJlbW92ZUFsbFJhbmdlcygpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSWYgdGhlIHBpY2tlciBpcyBvcGVuIGl0IG93bnMgdGhlIHZhbHVlOyBsZWF2ZSB0aGUgZGlzcGxheSBhbG9uZS5cblx0XHRcdGlmICh0aGlzLl9waWNrZXIudmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gT25lLXNob3QgYnlwYXNzIGFmdGVyIGFuIEVudGVyLWNvbW1pdCBvbiB0aGUgZGlzcGxheToga2VlcCB0aGVcblx0XHRcdC8vIHR5cGVkIHZhbHVlIHZpc2libGUgdW50aWwgdGhlIG5hdmlnYXRpb24gY29tbWl0cy5cblx0XHRcdGlmICh0aGlzLl9zdXBwcmVzc0JsdXJSZXZlcnQpIHtcblx0XHRcdFx0dGhpcy5fc3VwcHJlc3NCbHVyUmV2ZXJ0ID0gZmFsc2U7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIFVzZXIgbGVmdCB0aGUgVVJMIGJhciB3aXRob3V0IG5hdmlnYXRpbmc7IGRpc2NhcmQgYW55IGluLXByb2dyZXNzXG5cdFx0XHQvLyBlZGl0IGFuZCBzbmFwIGJhY2sgdG8gdGhlIGNhbm9uaWNhbCBVUkwuXG5cdFx0XHRpZiAoKHRoaXMuX3VybERpc3BsYXkudGV4dENvbnRlbnQgPz8gJycpICE9PSB0aGlzLl9jYW5vbmljYWxVcmwpIHtcblx0XHRcdFx0dGhpcy5fcmVuZGVyVXJsKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl91cmxEaXNwbGF5LCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdGNvbnN0IGlzTW91c2VGb2N1c0NsaWNrID0gcGVuZGluZ01vdXNlRm9jdXM7XG5cdFx0XHRwZW5kaW5nTW91c2VGb2N1cyA9IGZhbHNlO1xuXHRcdFx0aWYgKCFpc01vdXNlRm9jdXNDbGljayB8fCB0aGlzLl9ob3N0LmlzUmVhZG9ubHkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUHJlc2VydmUgZHJhZy1zZWxlY3Rpb24gc28gdXNlcnMgY2FuIGNvcHkgcGFydHMgb2YgdGhlIFVSTC5cblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuX3VybERpc3BsYXkub3duZXJEb2N1bWVudC5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGlmIChzZWxlY3Rpb24gJiYgIXNlbGVjdGlvbi5pc0NvbGxhcHNlZCAmJiBzZWxlY3Rpb24uYW5jaG9yTm9kZSAmJiB0aGlzLl91cmxEaXNwbGF5LmNvbnRhaW5zKHNlbGVjdGlvbi5hbmNob3JOb2RlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBGaXJzdCBjbGljayBhZnRlciBtb3VzZS1mb2N1cyAod2l0aG91dCBhIGRyYWcpIG9wZW5zIHRoZSBwaWNrZXIgd2l0aCB0aGUgVVJMIGZ1bGx5XG5cdFx0XHQvLyBzZWxlY3RlZCAobWF0Y2hlcyBicm93c2VyIFVSTC1iYXIgY29udmVudGlvbjogY2xpY2sgXHUyMTkyIHJlYWR5IHRvXG5cdFx0XHQvLyByZXR5cGUgdGhlIHdob2xlIHRoaW5nKS5cblx0XHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fdXJsRGlzcGxheS50ZXh0Q29udGVudCA/PyAnJztcblx0XHRcdHRoaXMuX29wZW5QaWNrZXIoeyB2YWx1ZSwgc2VsZWN0aW9uOiBbMCwgdmFsdWUubGVuZ3RoXSwgZWRpdGVkOiBmYWxzZSB9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdXJsRGlzcGxheSwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIpIHtcblx0XHRcdFx0Ly8gUHJldmVudCBjb250ZW50ZWRpdGFibGUgZnJvbSBpbnNlcnRpbmcgYSBuZXdsaW5lLlxuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGlmICh0aGlzLl9ob3N0LmlzUmVhZG9ubHkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl91cmxEaXNwbGF5LnRleHRDb250ZW50Py50cmltKCkgPz8gJyc7XG5cdFx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRcdC8vIFN1cHByZXNzIHRoZSBuZXh0IEJMVVItcmV2ZXJ0OiB0aGUgdXNlciBjb21taXR0ZWQgdG9cblx0XHRcdFx0XHQvLyB0aGlzIHZhbHVlLCBzbyB3ZSBkb24ndCB3YW50IGl0IGRpc2NhcmRlZCBqdXN0IGJlY2F1c2Vcblx0XHRcdFx0XHQvLyBgbW9kZWwudXJsYCB3b24ndCBjYXRjaCB1cCB1bnRpbCBuYXZpZ2F0aW9uIGNvbW1pdHMuXG5cdFx0XHRcdFx0dGhpcy5fc3VwcHJlc3NCbHVyUmV2ZXJ0ID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLl9uYXZpZ2F0ZVRleHQodmFsdWUpO1xuXHRcdFx0XHRcdHRoaXMuX2hvc3QuZW5zdXJlQnJvd3NlckZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRXNjYXBlKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0dGhpcy5fcmVuZGVyVXJsKCk7IC8vIHJldmVydCBhbnkgaW4tcHJvZ3Jlc3MgZWRpdFxuXHRcdFx0XHR0aGlzLl9ob3N0LmVuc3VyZUJyb3dzZXJGb2N1cygpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBUaGUgd29ya2JlbmNoIGNhcHR1cmVzIEN0cmwvQ21kK0EgYXMgYSBnbG9iYWwgY29tbWFuZCBiZWZvcmVcblx0XHRcdC8vIGNvbnRlbnRlZGl0YWJsZSBjYW4gaGFuZGxlIGl0LCBzbyBkbyBzZWxlY3QtYWxsIG91cnNlbHZlcy5cblx0XHRcdGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLktleUEgJiYgKGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQubWV0YUtleSkgJiYgIWV2ZW50LnNoaWZ0S2V5ICYmICFldmVudC5hbHRLZXkpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fc2VsZWN0QWxsKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBBbnkgZGlyZWN0IGVkaXQgcHJvbW90ZXMgdG8gdGhlIHBpY2tlciwgY2FycnlpbmcgdGhlIHZhbHVlIGFuZCBjYXJldC5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdXJsRGlzcGxheSwgJ2lucHV0JywgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3BpY2tlci52YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuX3VybERpc3BsYXkudGV4dENvbnRlbnQgPz8gJyc7XG5cdFx0XHRjb25zdCBjYXJldCA9IHRoaXMuX2dldENhcmV0T2Zmc2V0KCk7XG5cdFx0XHR0aGlzLl9vcGVuUGlja2VyKHsgdmFsdWUsIHNlbGVjdGlvbjogW2NhcmV0LCBjYXJldF0sIGVkaXRlZDogdHJ1ZSB9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZWxlY3RBbGwoKTogdm9pZCB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fdXJsRGlzcGxheS5vd25lckRvY3VtZW50O1xuXHRcdGNvbnN0IHNlbCA9IGRvYy5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoIXNlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByYW5nZSA9IGRvYy5jcmVhdGVSYW5nZSgpO1xuXHRcdHJhbmdlLnNlbGVjdE5vZGVDb250ZW50cyh0aGlzLl91cmxEaXNwbGF5KTtcblx0XHRzZWwucmVtb3ZlQWxsUmFuZ2VzKCk7XG5cdFx0c2VsLmFkZFJhbmdlKHJhbmdlKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVJlYWRvbmx5KCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlYWRvbmx5ID0gISF0aGlzLl9ob3N0LmlzUmVhZG9ubHk7XG5cdFx0dGhpcy5fdXJsRGlzcGxheS5jb250ZW50RWRpdGFibGUgPSByZWFkb25seSA/ICdmYWxzZScgOiAncGxhaW50ZXh0LW9ubHknO1xuXHRcdHRoaXMuX3VybERpc3BsYXkuc2V0QXR0cmlidXRlKCdhcmlhLXJlYWRvbmx5JywgU3RyaW5nKHJlYWRvbmx5KSk7XG5cdFx0dGhpcy5fdXJsRGlzcGxheS5zZXRBdHRyaWJ1dGUoXG5cdFx0XHQnYXJpYS1sYWJlbCcsXG5cdFx0XHRyZWFkb25seVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdicm93c2VyLmFkZHJlc3NMb2NrZWRBcmlhTGFiZWwnLCBcIkFkZHJlc3MuIFRoaXMgYWRkcmVzcyBjYW5ub3QgYmUgY2hhbmdlZCBiZWNhdXNlIHRoZSBicm93c2VyIGlzIGxvY2tlZCB0byBhIGZpbGUgcmVzb3VyY2UuXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2Jyb3dzZXIuYWRkcmVzcycsIFwiQWRkcmVzc1wiKVxuXHRcdCk7XG5cdFx0aWYgKHJlYWRvbmx5KSB7XG5cdFx0XHR0aGlzLl9waWNrZXIudmFsdWU/LmhpZGUoKTtcblx0XHR9XG5cdH1cblxuXHQvKiogQ2hhcmFjdGVyIG9mZnNldCBvZiB0aGUgc2VsZWN0aW9uIHN0YXJ0IHdpdGhpbiB0aGUgZGlzcGxheSdzIHRleHQuICovXG5cdHByaXZhdGUgX2dldENhcmV0T2Zmc2V0KCk6IG51bWJlciB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fdXJsRGlzcGxheS5vd25lckRvY3VtZW50O1xuXHRcdGNvbnN0IHNlbCA9IGRvYy5nZXRTZWxlY3Rpb24oKTtcblx0XHRjb25zdCB0b3RhbCA9IHRoaXMuX3VybERpc3BsYXkudGV4dENvbnRlbnQ/Lmxlbmd0aCA/PyAwO1xuXHRcdGlmICghc2VsIHx8IHNlbC5yYW5nZUNvdW50ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdG90YWw7XG5cdFx0fVxuXHRcdGNvbnN0IHJhbmdlID0gc2VsLmdldFJhbmdlQXQoMCk7XG5cdFx0aWYgKCF0aGlzLl91cmxEaXNwbGF5LmNvbnRhaW5zKHJhbmdlLnN0YXJ0Q29udGFpbmVyKSkge1xuXHRcdFx0cmV0dXJuIHRvdGFsO1xuXHRcdH1cblx0XHRjb25zdCBwcmUgPSBkb2MuY3JlYXRlUmFuZ2UoKTtcblx0XHRwcmUuc2VsZWN0Tm9kZUNvbnRlbnRzKHRoaXMuX3VybERpc3BsYXkpO1xuXHRcdHByZS5zZXRFbmQocmFuZ2Uuc3RhcnRDb250YWluZXIsIHJhbmdlLnN0YXJ0T2Zmc2V0KTtcblx0XHRyZXR1cm4gcHJlLnRvU3RyaW5nKCkubGVuZ3RoO1xuXHR9XG5cblx0LyoqIFBsYWNlIHRoZSBzZWxlY3Rpb24gYXQgdGhlIGdpdmVuIGNoYXJhY3RlciByYW5nZSB3aXRoaW4gdGhlIGRpc3BsYXkuICovXG5cdHByaXZhdGUgX3NldFNlbGVjdGlvbihzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlciwgZGlyZWN0aW9uOiAnZm9yd2FyZCcgfCAnYmFja3dhcmQnID0gJ2ZvcndhcmQnKTogdm9pZCB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fdXJsRGlzcGxheS5vd25lckRvY3VtZW50O1xuXHRcdGNvbnN0IHNlbCA9IGRvYy5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoIXNlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0b3RhbCA9IHRoaXMuX3VybERpc3BsYXkudGV4dENvbnRlbnQ/Lmxlbmd0aCA/PyAwO1xuXHRcdGNvbnN0IHMgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihzdGFydCwgdG90YWwpKTtcblx0XHRjb25zdCBlID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oZW5kLCB0b3RhbCkpO1xuXHRcdGNvbnN0IHN0YXJ0UG9zID0gdGhpcy5fb2Zmc2V0VG9Qb3NpdGlvbihzKTtcblx0XHRjb25zdCBlbmRQb3MgPSB0aGlzLl9vZmZzZXRUb1Bvc2l0aW9uKGUpO1xuXHRcdGlmIChkaXJlY3Rpb24gPT09ICdiYWNrd2FyZCcpIHtcblx0XHRcdHNlbC5zZXRCYXNlQW5kRXh0ZW50KGVuZFBvcy5ub2RlLCBlbmRQb3Mub2Zmc2V0LCBzdGFydFBvcy5ub2RlLCBzdGFydFBvcy5vZmZzZXQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzZWwuc2V0QmFzZUFuZEV4dGVudChzdGFydFBvcy5ub2RlLCBzdGFydFBvcy5vZmZzZXQsIGVuZFBvcy5ub2RlLCBlbmRQb3Mub2Zmc2V0KTtcblx0XHR9XG5cdH1cblxuXHQvKiogV2Fsa3MgdGhlIGRpc3BsYXkncyB0ZXh0IG5vZGVzIHRvIG1hcCBhIGNoYXJhY3RlciBvZmZzZXQgdG8gYSAobm9kZSwgb2Zmc2V0KSBET00gcG9zaXRpb24uICovXG5cdHByaXZhdGUgX29mZnNldFRvUG9zaXRpb24ob2Zmc2V0OiBudW1iZXIpOiB7IG5vZGU6IE5vZGU7IG9mZnNldDogbnVtYmVyIH0ge1xuXHRcdGNvbnN0IHdhbGtlciA9IHRoaXMuX3VybERpc3BsYXkub3duZXJEb2N1bWVudC5jcmVhdGVUcmVlV2Fsa2VyKHRoaXMuX3VybERpc3BsYXksIE5vZGVGaWx0ZXIuU0hPV19URVhUKTtcblx0XHRsZXQgcmVtYWluaW5nID0gb2Zmc2V0O1xuXHRcdGxldCBsYXN0Tm9kZTogVGV4dCB8IG51bGwgPSBudWxsO1xuXHRcdGZvciAobGV0IG5vZGUgPSB3YWxrZXIubmV4dE5vZGUoKSBhcyBUZXh0IHwgbnVsbDsgbm9kZTsgbm9kZSA9IHdhbGtlci5uZXh0Tm9kZSgpIGFzIFRleHQgfCBudWxsKSB7XG5cdFx0XHRsYXN0Tm9kZSA9IG5vZGU7XG5cdFx0XHRpZiAocmVtYWluaW5nIDw9IG5vZGUuZGF0YS5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHsgbm9kZSwgb2Zmc2V0OiByZW1haW5pbmcgfTtcblx0XHRcdH1cblx0XHRcdHJlbWFpbmluZyAtPSBub2RlLmRhdGEubGVuZ3RoO1xuXHRcdH1cblx0XHRpZiAobGFzdE5vZGUpIHtcblx0XHRcdHJldHVybiB7IG5vZGU6IGxhc3ROb2RlLCBvZmZzZXQ6IGxhc3ROb2RlLmRhdGEubGVuZ3RoIH07XG5cdFx0fVxuXHRcdHJldHVybiB7IG5vZGU6IHRoaXMuX3VybERpc3BsYXksIG9mZnNldDogMCB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlciB0aGUgZ2l2ZW4gVVJMIChkZWZhdWx0cyB0byB0aGUgY2Fub25pY2FsIFVSTCBmcm9tIHRoZSBtb2RlbClcblx0ICogaW50byB0aGUgZGlzcGxheS4gVVJMIHJlbmRlcmVycyBhcmUgZ2l2ZW4gYSBjaGFuY2UgdG8gZGVjb3JhdGUgaXRcblx0ICogKGUuZy4gcmVkIHN0cmlrZXRocm91Z2ggb24gYGh0dHBzOmAgZm9yIGNlcnQgZXJyb3JzKTsgdGhlIGZpcnN0IG9uZSB0b1xuXHQgKiBjbGFpbSB0aGUgcmVuZGVyIHdpbnMuIFBhc3NpbmcgYW4gb3ZlcnJpZGUgbGV0cyBjYWxsZXJzIHByZXZpZXcgYW5cblx0ICogaW4tcHJvZ3Jlc3MgZWRpdCAoZS5nLiB0aGUgcGlja2VyIG1pcnJvcmluZyBpdHMgdHlwZWQgdmFsdWUpLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVuZGVyVXJsKG92ZXJyaWRlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdXJsID0gb3ZlcnJpZGUgPz8gdGhpcy5fY2Fub25pY2FsVXJsO1xuXG5cdFx0dGhpcy5fdXJsRGlzcGxheS50ZXh0Q29udGVudCA9ICcnO1xuXG5cdFx0Zm9yIChjb25zdCByZW5kZXJlciBvZiB0aGlzLl91cmxSZW5kZXJlcnMpIHtcblx0XHRcdGlmIChyZW5kZXJlci5yZW5kZXIodXJsLCB0aGlzLl91cmxEaXNwbGF5KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHVybCkge1xuXHRcdFx0dGhpcy5fdXJsRGlzcGxheS50ZXh0Q29udGVudCA9IHVybDtcblx0XHR9XG5cdFx0Ly8gV2hlbiBlbXB0eSwgbGVhdmUgdGV4dENvbnRlbnQgYmxhbms7IENTUyBgOmVtcHR5OjpiZWZvcmVgIHNob3dzIHRoZSBwbGFjZWhvbGRlci5cblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZCB0aGUgc3luY2hyb25vdXMgcHJpbWFyeSBwaWNrZXIgaXRlbShzKSBmb3IgdGhlIGN1cnJlbnQgdmFsdWU6IHRoZVxuXHQgKiBob3N0J3MgY29udGV4dHVhbCBpdGVtcyAoZS5nLiBTZWFyY2ggYW5kL29yIEdvIHRvKSwgb3IgYSBwbGFpblxuXHQgKiBcIkdvIHRvIDx2YWx1ZT5cIiBmYWxsYmFjay4gUHJvdmlkZXItY29udHJpYnV0ZWQgc3VnZ2VzdGlvbnMgYXJlIGxvYWRlZFxuXHQgKiBhc3luY2hyb25vdXNseSBieSB7QGxpbmsgX2xvYWRQcm92aWRlclN1Z2dlc3Rpb25zfSBhbmQgYXBwZW5kZWQgYmVsb3cuXG5cdCAqL1xuXHRwcml2YXRlIF9idWlsZFN1Z2dlc3Rpb25JdGVtcyh2YWx1ZTogc3RyaW5nKTogKElVcmxQaWNrZXJJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSB7XG5cdFx0Y29uc3QgaXRlbXM6IChJVXJsUGlja2VySXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10gPSBbXTtcblx0XHRjb25zdCB0cmltbWVkID0gdmFsdWUudHJpbSgpO1xuXHRcdGlmICh0cmltbWVkKSB7XG5cdFx0XHRjb25zdCBwcmltYXJ5SXRlbXMgPSB0aGlzLl9ob3N0LmdldFByaW1hcnlBY3Rpb25zPy4odHJpbW1lZCkgPz8gW107XG5cdFx0XHRpZiAocHJpbWFyeUl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0aXRlbXMucHVzaCguLi5wcmltYXJ5SXRlbXMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0aWQ6IHRyaW1tZWQsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VyLmdvVG8nLCBcIkdvIHRvIHswfVwiLCB0cmltbWVkKSxcblx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmFycm93UmlnaHQpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGl0ZW1zO1xuXHR9XG5cblx0LyoqXG5cdCAqIE5hdmlnYXRlIGZyb20gcmF3IHRleHQgdGhlIHVzZXIgY29tbWl0dGVkIGRpcmVjdGx5IChlLmcuIEVudGVyIG9uIHRoZVxuXHQgKiBkaXNwbGF5LCBvciBhY2NlcHRpbmcgd2l0aCBubyBzdWdnZXN0aW9uIHNlbGVjdGVkKS4gUm91dGVzIHRocm91Z2ggdGhlXG5cdCAqIGhvc3QncyBkZWZhdWx0IHByaW1hcnkgaXRlbSBzbyBzZWFyY2gtdnMtVVJMIHJlc29sdXRpb24gc3RheXMgaW4gdGhlIG5hdlxuXHQgKiBiYXI7IGZhbGxzIGJhY2sgdG8gbmF2aWdhdGluZyB0aGUgdGV4dCBhcyBhIFVSTCB3aGVuIHRoZSBob3N0IGhhcyBub1xuXHQgKiBwcmltYXJ5IGl0ZW1zLlxuXHQgKi9cblx0cHJpdmF0ZSBfbmF2aWdhdGVUZXh0KHRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGlucHV0ID0gdGhpcy5faG9zdC5pbnB1dDtcblx0XHRjb25zdCB0cmltbWVkID0gdGV4dC50cmltKCk7XG5cdFx0aWYgKCF0cmltbWVkIHx8ICFpbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwcmltYXJ5SXRlbXMgPSB0aGlzLl9ob3N0LmdldFByaW1hcnlBY3Rpb25zPy4odHJpbW1lZCk7XG5cdFx0Y29uc3QgZGVmYXVsdEl0ZW0gPSBwcmltYXJ5SXRlbXM/LlswXTtcblx0XHRpZiAoZGVmYXVsdEl0ZW0/LmFwcGx5KSB7XG5cdFx0XHR2b2lkIFByb21pc2UucmVzb2x2ZShkZWZhdWx0SXRlbS5hcHBseShpbnB1dCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpbnB1dC5uYXZpZ2F0ZSh0cmltbWVkKTtcblx0XHR9XG5cdH1cblxuXHQvKiogQ29udmVydCBhIHByb3ZpZGVyIHN1Z2dlc3Rpb24gdG8gaXRzIHBpY2tlci1pdGVtIHJlcHJlc2VudGF0aW9uLiAqL1xuXHRwcml2YXRlIF90b1BpY2tlckl0ZW0oczogSUJyb3dzZXJVcmxTdWdnZXN0aW9uKTogSVVybFBpY2tlckl0ZW0ge1xuXHRcdGNvbnN0IGl0ZW06IElVcmxQaWNrZXJJdGVtID0ge1xuXHRcdFx0aWQ6IHMuaWQsXG5cdFx0XHRsYWJlbDogcy5sYWJlbCxcblx0XHRcdGRlc2NyaXB0aW9uOiBzLmRlc2NyaXB0aW9uLFxuXHRcdFx0YXBwbHk6IHMuYXBwbHksXG5cdFx0fTtcblx0XHRpZiAocy5pY29uUGF0aCkge1xuXHRcdFx0aXRlbS5pY29uUGF0aCA9IHMuaWNvblBhdGg7XG5cdFx0fSBlbHNlIGlmIChzLmljb24pIHtcblx0XHRcdGl0ZW0uaWNvbkNsYXNzID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKHMuaWNvbik7XG5cdFx0fVxuXHRcdGlmIChzLmFjdGlvbnMgJiYgcy5hY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdC8vIFBlci1pdGVtIGJ1dHRvbnMuIFdlIHBhc3MgdGhlIGFjdGlvbiBvYmplY3RzIHRocm91Z2ggZGlyZWN0bHlcblx0XHRcdC8vIHNvIG9uRGlkVHJpZ2dlckl0ZW1CdXR0b24gaGFuZHMgdGhlbSBiYWNrIHRvIHVzIGFzIHRoZSBJQnJvd3NlclVybFN1Z2dlc3Rpb25BY3Rpb24uXG5cdFx0XHRpdGVtLmJ1dHRvbnMgPSBzLmFjdGlvbnM7XG5cdFx0fVxuXHRcdHJldHVybiBpdGVtO1xuXHR9XG5cblx0LyoqXG5cdCAqIE9wZW4gdGhlIFVSTCBlZGl0aW5nIHBpY2tlciBhbmNob3JlZCB0byB0aGUgVVJMIGNvbnRhaW5lci4gV2hpbGUgb3Blbixcblx0ICogdGhlIGRpc3BsYXkgaXMgaGlkZGVuICh2aXNpYmlsaXR5OmhpZGRlbiwgdG8gcHJlc2VydmUgbGF5b3V0KSBzbyBvbmx5XG5cdCAqIHRoZSBwaWNrZXIgaXMgdmlzaWJsZS5cblx0ICpcblx0ICogQHBhcmFtIGluaXRpYWwgT3B0aW9uYWwgZGlzcGxheSBzdGF0ZSBjYXJyaWVkIGludG8gdGhlIHBpY2tlci5cblx0ICovXG5cdHByaXZhdGUgX29wZW5QaWNrZXIoaW5pdGlhbD86IHsgdmFsdWU6IHN0cmluZzsgc2VsZWN0aW9uOiBbbnVtYmVyLCBudW1iZXJdOyBlZGl0ZWQ6IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9ob3N0LmlzUmVhZG9ubHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3BpY2tlci52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEhpZGUgdGhlIGRpc3BsYXkgd2hpbGUgdGhlIHBpY2tlciBpcyB0aGUgZWRpdGluZyBVSSAodmlzaWJpbGl0eTpoaWRkZW5cblx0XHQvLyBrZWVwcyB0aGUgbmF2YmFyIGxheW91dCBzdGFibGUgd2hpbGUgdGhlIHBpY2tlciBvdmVybGF5cykuXG5cdFx0dGhpcy5fdXJsRGlzcGxheS5zdHlsZS52aXNpYmlsaXR5ID0gJ2hpZGRlbic7XG5cblx0XHRjb25zdCBwaWNrZXIgPSB0aGlzLl9xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVVybFBpY2tlckl0ZW0+KHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KTtcblx0XHRwaWNrZXIucGxhY2Vob2xkZXIgPSB0aGlzLl9wbGFjZWhvbGRlcjtcblx0XHRwaWNrZXIuaWdub3JlRm9jdXNPdXQgPSBmYWxzZTtcblx0XHQvLyBQcmVzZXJ2ZSB0aGUgb3JkZXIgcHJvZHVjZWQgYnkgX2J1aWxkU3VnZ2VzdGlvbkl0ZW1zIChHbyB0byBmaXJzdCwgdGhlblxuXHRcdC8vIHRhYnMgaW4ga25vd24tdmlldyBvcmRlcikgc28gdGhlIFwiR28gdG9cIiBlbnRyeSBpcyBhbHdheXMgdGhlIHBpY2tlcidzXG5cdFx0Ly8gbmF0dXJhbCBhY3RpdmUgaXRlbSBhbmQgdGFiIGVudHJpZXMgYXJlIG5ldmVyIGF1dG8tc2VsZWN0ZWQuXG5cdFx0cGlja2VyLnNvcnRCeUxhYmVsID0gZmFsc2U7XG5cdFx0cGlja2VyLm1hdGNoT25EZXNjcmlwdGlvbiA9IHRydWU7XG5cdFx0cGlja2VyLmFuY2hvciA9IHRoaXMuZWxlbWVudDtcblx0XHRwaWNrZXIuYW5jaG9yUG9zaXRpb24gPSAnb3ZlcmxheSc7XG5cdFx0Ly8gUHV0IGEgY2FwIG9uIHRoZSBzdHJpbmcgbGVuZ3RoIHVzZWQgZm9yIGZpbHRlcmluZyB0byBhdm9pZCBwZXJmb3JtYW5jZSBpc3N1ZXMuXG5cdFx0cGlja2VyLmZpbHRlclZhbHVlID0gKGZpbHRlcikgPT4gZmlsdGVyLnN1YnN0cmluZygwLCAxMDAwKTtcblx0XHRpZiAoaW5pdGlhbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRwaWNrZXIudmFsdWUgPSBpbml0aWFsLnZhbHVlO1xuXHRcdFx0cGlja2VyLnZhbHVlU2VsZWN0aW9uID0gaW5pdGlhbC5zZWxlY3Rpb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdHBpY2tlci52YWx1ZSA9IHRoaXMuX2Nhbm9uaWNhbFVybDtcblx0XHRcdHBpY2tlci52YWx1ZVNlbGVjdGlvbiA9IFswLCB0aGlzLl9jYW5vbmljYWxVcmwubGVuZ3RoXTtcblx0XHR9XG5cdFx0dGhpcy5fcGlja2VyRWRpdGVkID0gaW5pdGlhbD8uZWRpdGVkID8/IGZhbHNlO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gRWFjaCBwcm92aWRlciBrZWVwcyBpdHMgb3duIGNhY2hlZCBzdWdnZXN0aW9ucyArIGNhbmNlbGxhdGlvbiBzbyBhXG5cdFx0Ly8gc2luZ2xlIHByb3ZpZGVyJ3Mgb25EaWRDaGFuZ2UgKG9yIGEgcGVyLXByb3ZpZGVyIHJlLWZldGNoKSB1cGRhdGVzXG5cdFx0Ly8ganVzdCB0aGF0IGdyb3VwLCB3aXRob3V0IHJlY29tcHV0aW5nIHRoZSByZXN0LiBDYW5jZWxsYXRpb24gdG9rZW5zXG5cdFx0Ly8gKG5vdCBqdXN0IGRpc3Bvc2FsKSBhcmUgbmVlZGVkIHNvIGFuIGluLWZsaWdodCBgLnRoZW5gIGZvciB0aGVcblx0XHQvLyBwcmV2aW91cyByZXF1ZXN0IGRvZXNuJ3Qgb3ZlcndyaXRlIG5ld2VyIGNhY2hlZCByZXN1bHRzLlxuXHRcdHR5cGUgUHJvdmlkZXJTdGF0ZSA9IHtcblx0XHRcdHN1Z2dlc3Rpb25zOiByZWFkb25seSBJQnJvd3NlclVybFN1Z2dlc3Rpb25bXTtcblx0XHRcdGN0czogTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+O1xuXHRcdH07XG5cdFx0Y29uc3QgcHJvdmlkZXJTdGF0ZXMgPSBuZXcgTWFwPElCcm93c2VyVXJsU3VnZ2VzdGlvblByb3ZpZGVyLCBQcm92aWRlclN0YXRlPigpO1xuXHRcdC8vIFJlZ2lzdGVyIHRoZSBjYW5jZWxsYXRpb24gaG9vayBiZWZvcmUgdGhlIHBlci1wcm92aWRlciBNdXRhYmxlRGlzcG9zYWJsZXNcblx0XHQvLyBzbyBpdCBydW5zIGZpcnN0IG9uIHBpY2tlciBjbG9zZS4gYENhbmNlbGxhdGlvblRva2VuU291cmNlLmRpc3Bvc2UoKWBcblx0XHQvLyBvbmx5IHJlbGVhc2VzIGludGVybmFsIHN0YXRlIFx1MjAxNCBpdCBkb2VzIE5PVCBjYW5jZWwgXHUyMDE0IHNvIHdpdGhvdXQgdGhpcyxcblx0XHQvLyBpbi1mbGlnaHQgcHJvdmlkZXIgcmVxdWVzdHMgd291bGQga2VlcCBydW5uaW5nIGFmdGVyIHRoZSBwaWNrZXIgaXMgZ29uZS5cblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3Qgc3RhdGUgb2YgcHJvdmlkZXJTdGF0ZXMudmFsdWVzKCkpIHtcblx0XHRcdFx0c3RhdGUuY3RzLnZhbHVlPy5jYW5jZWwoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLl9zdWdnZXN0aW9uUHJvdmlkZXJzKSB7XG5cdFx0XHRwcm92aWRlclN0YXRlcy5zZXQocHJvdmlkZXIsIHtcblx0XHRcdFx0c3VnZ2VzdGlvbnM6IFtdLFxuXHRcdFx0XHRjdHM6IGRpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0bGV0IGN1cnJlbnRWYWx1ZSA9IHBpY2tlci52YWx1ZTtcblxuXHRcdC8vIFJlYnVpbGQgYHBpY2tlci5pdGVtc2AgZnJvbSB0aGUgc3luY2hyb25vdXMgXCJHbyB0b1wiIGVudHJ5IHBsdXMgZWFjaFxuXHRcdC8vIHByb3ZpZGVyJ3MgY3VycmVudCBjYWNoZWQgc3VnZ2VzdGlvbnMsIGluIHByb3ZpZGVyIHNvcnQgb3JkZXIuXG5cdFx0Ly9cblx0XHQvLyBgcHJlc2VydmVTZWxlY3Rpb25gIGRpc3Rpbmd1aXNoZXMgdGhlIHR3byByZS1yZW5kZXIgdHJpZ2dlcnM6XG5cdFx0Ly8gIC0gVXNlciB0eXBpbmcgKGBmYWxzZWApOiByZXNldCB0aGUgYWN0aXZlIGl0ZW0gdG8gdGhlIGRlZmF1bHRcblx0XHQvLyAgICBcIkdvIHRvXCIgZW50cnkuIFN0YXJ0aW5nL2NvbnRpbnVpbmcgYSBxdWVyeSBzaG91bGQgYWx3YXlzIGRlZmF1bHRcblx0XHQvLyAgICBiYWNrIHRvIFwiR28gdG9cIiByYXRoZXIgdGhhbiBzdGlja2luZyBvbiBhIHN0cmVhbWVkLWluIHN1Z2dlc3Rpb24uXG5cdFx0Ly8gIC0gQmFja2dyb3VuZCBwcm92aWRlciByZWZyZXNoIChgdHJ1ZWApOiBrZWVwIHRoZSB1c2VyJ3MgY3VycmVudFxuXHRcdC8vICAgIHNlbGVjdGlvbiAoZS5nLiBhbiBhcnJvdy1rZXllZCBzdWdnZXN0aW9uKSBzbyB1cGRhdGluZyBvbmVcblx0XHQvLyAgICBwcm92aWRlcidzIHJlc3VsdHMgKGEgdGFiIG9wZW5pbmcvY2xvc2luZykgZG9lc24ndCB5YW5rIGZvY3VzXG5cdFx0Ly8gICAgYmFjayB0byBcIkdvIHRvXCIuXG5cdFx0Ly9cblx0XHQvLyBUaGUgYWN0aXZlIGl0ZW0gaXMgc2V0IGV4cGxpY2l0bHkgcmF0aGVyIHRoYW4gcmVseWluZyBvbiB0aGUgcXVpY2tcblx0XHQvLyBwaWNrJ3MgaW1wbGljaXQgZmlyc3Qtcm93IHNlbGVjdGlvbiwgd2hpY2ggY2FuIG90aGVyd2lzZSBsYW5kIG9uIGFcblx0XHQvLyBzdWdnZXN0aW9uIGFzIGFzeW5jaHJvbm91cyByZXN1bHRzIHN0cmVhbSBpbi5cblx0XHRjb25zdCByZW5kZXIgPSAocHJlc2VydmVTZWxlY3Rpb246IGJvb2xlYW4pID0+IHtcblx0XHRcdGNvbnN0IHByZXZpb3VzQWN0aXZlSWQgPSBwcmVzZXJ2ZVNlbGVjdGlvbiA/IHBpY2tlci5hY3RpdmVJdGVtc1swXT8uaWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBkZWZhdWx0SXRlbXMgPSB0aGlzLl9idWlsZFN1Z2dlc3Rpb25JdGVtcyhjdXJyZW50VmFsdWUpO1xuXHRcdFx0Y29uc3QgaXRlbXM6IChJVXJsUGlja2VySXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10gPSBbLi4uZGVmYXVsdEl0ZW1zXTtcblx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fc3VnZ2VzdGlvblByb3ZpZGVycykge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHByb3ZpZGVyU3RhdGVzLmdldChwcm92aWRlcik7XG5cdFx0XHRcdGlmICghc3RhdGUgfHwgc3RhdGUuc3VnZ2VzdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHByb3ZpZGVyLmxhYmVsKSB7XG5cdFx0XHRcdFx0Ly8gYGJ1dHRvbnM6IFtdYCBvcHRzIHRoZSBzZXBhcmF0b3IgaW50byBiZWluZyByZW5kZXJlZCBhc1xuXHRcdFx0XHRcdC8vIGl0cyBvd24gcm93IChhIHNlcGFyYXRvciB3aXRob3V0IGJ1dHRvbnMgaXMgb3RoZXJ3aXNlXG5cdFx0XHRcdFx0Ly8gY29sbGFwc2VkIGludG8gdGhlIGZpcnN0IGl0ZW0gYmVsb3cgaXQgYXMgYSBoZWFkZXIpLlxuXHRcdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0dHlwZTogJ3NlcGFyYXRvcicsXG5cdFx0XHRcdFx0XHRsYWJlbDogcHJvdmlkZXIubGFiZWwsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogcHJvdmlkZXIuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRidXR0b25zOiBwcm92aWRlci5hY3Rpb25zLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgcyBvZiBzdGF0ZS5zdWdnZXN0aW9ucykge1xuXHRcdFx0XHRcdGl0ZW1zLnB1c2godGhpcy5fdG9QaWNrZXJJdGVtKHMpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cGlja2VyLml0ZW1zID0gaXRlbXM7XG5cblx0XHRcdC8vIE9ubHkgdGhlIHN5bmNocm9ub3VzIGl0ZW1zIGZyb20gYF9idWlsZFN1Z2dlc3Rpb25JdGVtc2AgKGUuZy4gdGhlXG5cdFx0XHQvLyBcIkdvIHRvXCIgZW50cnkpIGFyZSBlbGlnaWJsZSBmb3IgZGVmYXVsdCBmb2N1czsgcHJvdmlkZXIgc3VnZ2VzdGlvbnNcblx0XHRcdC8vIGFyZSBuZXZlciBhdXRvLWZvY3VzZWQuIFJlc3RvcmUgdGhlIHByaW9yIHNlbGVjdGlvbiBvbiBhIGJhY2tncm91bmRcblx0XHRcdC8vIHJlZnJlc2g7IG90aGVyd2lzZSAodHlwaW5nLCBvciB0aGUgcHJpb3IgaXRlbSBkaXNhcHBlYXJlZCkgZmFsbCBiYWNrXG5cdFx0XHQvLyB0byB0aGUgZmlyc3QgZGVmYXVsdCBpdGVtLCBvciB0byBub3RoaW5nIHdoZW4gdGhlcmUgYXJlIG5vbmUuXG5cdFx0XHRjb25zdCBkZWZhdWx0QWN0aXZlID0gZGVmYXVsdEl0ZW1zLmZpbmQoKGkpOiBpIGlzIElVcmxQaWNrZXJJdGVtID0+IGkudHlwZSAhPT0gJ3NlcGFyYXRvcicpO1xuXHRcdFx0Y29uc3QgcmVzdG9yZWQgPSBwcmV2aW91c0FjdGl2ZUlkICE9PSB1bmRlZmluZWRcblx0XHRcdFx0PyBpdGVtcy5maW5kKChpKTogaSBpcyBJVXJsUGlja2VySXRlbSA9PiBpLnR5cGUgIT09ICdzZXBhcmF0b3InICYmIGkuaWQgPT09IHByZXZpb3VzQWN0aXZlSWQpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgYWN0aXZlID0gcmVzdG9yZWQgPz8gZGVmYXVsdEFjdGl2ZTtcblx0XHRcdGlmIChwaWNrZXIuYWN0aXZlSXRlbXNbMF0gIT09IGFjdGl2ZSB8fCBwaWNrZXIuYWN0aXZlSXRlbXMubGVuZ3RoICE9PSAoYWN0aXZlID8gMSA6IDApKSB7XG5cdFx0XHRcdHBpY2tlci5hY3RpdmVJdGVtcyA9IGFjdGl2ZSA/IFthY3RpdmVdIDogW107XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlbmRlclNjaGVkdWxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQW5pbWF0aW9uRnJhbWVTY2hlZHVsZXIodGhpcy5lbGVtZW50LCAoKSA9PiByZW5kZXIodHJ1ZSkpKTtcblxuXHRcdGNvbnN0IHJlZnJlc2hQcm92aWRlciA9IChwcm92aWRlcjogSUJyb3dzZXJVcmxTdWdnZXN0aW9uUHJvdmlkZXIpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gcHJvdmlkZXJTdGF0ZXMuZ2V0KHByb3ZpZGVyKTtcblx0XHRcdGNvbnN0IGlucHV0ID0gdGhpcy5faG9zdC5pbnB1dDtcblx0XHRcdGlmICghc3RhdGUgfHwgIWlucHV0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHN0YXRlLmN0cy52YWx1ZT8uY2FuY2VsKCk7XG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHN0YXRlLmN0cy52YWx1ZSA9IGN0cztcblx0XHRcdHZvaWQgcHJvdmlkZXIuZ2V0U3VnZ2VzdGlvbnMoeyB0ZXh0OiBjdXJyZW50VmFsdWUsIGlucHV0IH0sIGN0cy50b2tlbikudGhlbihcblx0XHRcdFx0cmVzdWx0cyA9PiB7XG5cdFx0XHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCB0aGlzLl9waWNrZXIudmFsdWUgIT09IHBpY2tlcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzdGF0ZS5zdWdnZXN0aW9ucyA9IHJlc3VsdHM7XG5cdFx0XHRcdFx0cmVuZGVyU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdCgpID0+IHsgLyoga2VlcCBwcmlvciBjYWNoZWQgc3VnZ2VzdGlvbnMgb24gZXJyb3IgKi8gfVxuXHRcdFx0KTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVmcmVzaEFsbFByb3ZpZGVycyA9ICgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fc3VnZ2VzdGlvblByb3ZpZGVycykge1xuXHRcdFx0XHRyZWZyZXNoUHJvdmlkZXIocHJvdmlkZXIpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRyZW5kZXIoZmFsc2UpO1xuXHRcdHJlZnJlc2hBbGxQcm92aWRlcnMoKTtcblxuXHRcdC8vIFBlci1wcm92aWRlciBzdGF0ZSBjaGFuZ2U6IHJlZnJlc2ggb25seSB0aGF0IHByb3ZpZGVyIHNvIHVucmVsYXRlZFxuXHRcdC8vIGdyb3VwcyBrZWVwIHRoZWlyIGNhY2hlZCBzdWdnZXN0aW9ucyBhbmQgc2VsZWN0aW9uLlxuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fc3VnZ2VzdGlvblByb3ZpZGVycykge1xuXHRcdFx0aWYgKHByb3ZpZGVyLm9uRGlkQ2hhbmdlKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZSgoKSA9PiByZWZyZXNoUHJvdmlkZXIocHJvdmlkZXIpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2FwdHVyZSB0aGUgcGlja2VyJ3Mgc2VsZWN0aW9uIGp1c3QgYmVmb3JlIGl0IGhpZGVzIHNvIHdlIGNhbiByZXN0b3JlIGl0XG5cdFx0Ly8gb24gdGhlIGRpc3BsYXkgd2hlbiBmb2N1cyByZXR1cm5zIHRoZXJlIChlLmcuIEVzY2FwZSkuXG5cdFx0bGV0IHNlbGVjdGlvbkF0SGlkZTogeyBzdGFydDogbnVtYmVyOyBlbmQ6IG51bWJlcjsgZGlyZWN0aW9uOiAnZm9yd2FyZCcgfCAnYmFja3dhcmQnIH0gfCB1bmRlZmluZWQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbldpbGxIaWRlKCgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZSA9IHRoaXMuX3VybERpc3BsYXkub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuXHRcdFx0aWYgKGlzSFRNTElucHV0RWxlbWVudChhY3RpdmUpICYmIGFjdGl2ZS5zZWxlY3Rpb25TdGFydCAhPT0gbnVsbCAmJiBhY3RpdmUuc2VsZWN0aW9uRW5kICE9PSBudWxsKSB7XG5cdFx0XHRcdHNlbGVjdGlvbkF0SGlkZSA9IHtcblx0XHRcdFx0XHRzdGFydDogYWN0aXZlLnNlbGVjdGlvblN0YXJ0LFxuXHRcdFx0XHRcdGVuZDogYWN0aXZlLnNlbGVjdGlvbkVuZCxcblx0XHRcdFx0XHRkaXJlY3Rpb246IGFjdGl2ZS5zZWxlY3Rpb25EaXJlY3Rpb24gPT09ICdiYWNrd2FyZCcgPyAnYmFja3dhcmQnIDogJ2ZvcndhcmQnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkQ2hhbmdlVmFsdWUodmFsdWUgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9pc1NldHRpbmdQaWNrZXJWYWx1ZSkge1xuXHRcdFx0XHR0aGlzLl9waWNrZXJFZGl0ZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y3VycmVudFZhbHVlID0gdmFsdWU7XG5cdFx0XHRyZW5kZXJTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0XHRyZW5kZXIoZmFsc2UpO1xuXHRcdFx0cmVmcmVzaEFsbFByb3ZpZGVycygpO1xuXHRcdFx0Ly8gTWlycm9yIHRoZSBwaWNrZXIncyB0eXBlZCB2YWx1ZSBpbnRvIHRoZSBkaXNwbGF5IGNvbnRpbnVvdXNseSxcblx0XHRcdC8vIHJ1bm5pbmcgVVJMIHJlbmRlcmVycyBzbyBkZWNvcmF0aW9ucyBzdGF5IGxpdmUuIFRoZSBwaWNrZXIgaXNcblx0XHRcdC8vIHRoZSBzb3VyY2Ugb2YgdHJ1dGggd2hpbGUgaXQncyBvcGVuLlxuXHRcdFx0dGhpcy5fcmVuZGVyVXJsKHZhbHVlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBNb3VudCBwcm92aWRlci1jb250cmlidXRlZCBwaWNrZXIgYWN0aW9ucy5cblx0XHQvLyBSZS1idWlsZCBidXR0b25zIHdoZW5ldmVyIGFueSBwcm92aWRlciByZXBvcnRzIGEgc3RhdGUgY2hhbmdlIHNvXG5cdFx0Ly8gZHluYW1pYyBhY3Rpb25zICh0b2dnbGVzLCBjb25kaXRpb25hbCBidXR0b25zKSBzdGF5IGluIHN5bmMuXG5cdFx0Y29uc3QgcmVmcmVzaEJ1dHRvbnMgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHRoaXMuX2hvc3QuaW5wdXQ7XG5cdFx0XHRpZiAoIWlucHV0KSB7XG5cdFx0XHRcdHBpY2tlci5idXR0b25zID0gW107XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJ1dHRvbnM6IElCcm93c2VyVXJsUGlja2VyQWN0aW9uW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fcGlja2VyQWN0aW9uUHJvdmlkZXJzKSB7XG5cdFx0XHRcdGJ1dHRvbnMucHVzaCguLi5wcm92aWRlci5nZXRBY3Rpb25zKGlucHV0KSk7XG5cdFx0XHR9XG5cdFx0XHRwaWNrZXIuYnV0dG9ucyA9IGJ1dHRvbnM7XG5cdFx0fTtcblx0XHRyZWZyZXNoQnV0dG9ucygpO1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fcGlja2VyQWN0aW9uUHJvdmlkZXJzKSB7XG5cdFx0XHRpZiAocHJvdmlkZXIub25EaWRDaGFuZ2UpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlKHJlZnJlc2hCdXR0b25zKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFRyYWNrIHdoZXRoZXIgYW4gYWN0aW9uIHdhcyB0YWtlbiBpbnNpZGUgdGhlIHBpY2tlciAoYWNjZXB0IC8gYnV0dG9uXG5cdFx0Ly8gY2xpY2spLiBPbiBoaWRlIHdlIHVzZSB0aGlzIHRvIGRlY2lkZSBiZXR3ZWVuIFwicGVyc2lzdCB0aGUgdHlwZWRcblx0XHQvLyB2YWx1ZSB0byB0aGUgZGlzcGxheVwiIChubyBhY3Rpb24gXHUyMDE0IHVzZXIgZGlzbWlzc2VkIG1pZC1lZGl0KSBhbmRcblx0XHQvLyBcImxldCB0aGUgY2Fub25pY2FsIFVSTCBzdGFuZFwiIChhY3Rpb24gcmFuIFx1MjAxNCBlaXRoZXIgYSBuYXZpZ2F0aW9uXG5cdFx0Ly8gcHJlZW1wdGl2ZWx5IHJlbmRlcmVkIHRoZSBkZXN0aW5hdGlvbiwgb3IgYSBidXR0b24gbXV0YXRlZCBzdGF0ZSkuXG5cdFx0bGV0IGFjdGlvblRha2VuID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZFRyaWdnZXJCdXR0b24oYnV0dG9uID0+IHtcblx0XHRcdGFjdGlvblRha2VuID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGJ1dHRvbiBhcyBJQnJvd3NlclVybFBpY2tlckFjdGlvbjtcblx0XHRcdGNvbnN0IGlucHV0ID0gdGhpcy5faG9zdC5pbnB1dDtcblx0XHRcdGlmICh0eXBlb2YgYWN0aW9uLnJ1biA9PT0gJ2Z1bmN0aW9uJyAmJiBpbnB1dCkge1xuXHRcdFx0XHR2b2lkIFByb21pc2UucmVzb2x2ZShhY3Rpb24ucnVuKGlucHV0KSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUGVyLWl0ZW0gYnV0dG9uLiBXZSBhdHRhY2hlZCB0aGUgSUJyb3dzZXJVcmxTdWdnZXN0aW9uQWN0aW9uIGRpcmVjdGx5XG5cdFx0Ly8gYXMgdGhlIHBpY2tlciBidXR0b24sIHNvIHRoZSBldmVudCBoYW5kcyBpdCBiYWNrIHRvIHVzIGJ5IHJlZmVyZW5jZS5cblx0XHQvLyBVbmxpa2Ugb25EaWRUcmlnZ2VyQnV0dG9uIHRoaXMgZG9lcyBOT1QgY291bnQgYXMgXCJ0aGUgdXNlciBhY2NlcHRlZCB0aGUgc3VnZ2VzdGlvblwiXG5cdFx0Ly8gXHUyMDE0IHRoZSBwaWNrZXIgc3RheXMgb3BlbiBhbmQgdGhlIGFjdGlvbiBydW5zIGluLXBsYWNlLlxuXHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRUcmlnZ2VySXRlbUJ1dHRvbigoeyBidXR0b24gfSkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gYnV0dG9uIGFzIElCcm93c2VyVXJsU3VnZ2VzdGlvbkFjdGlvbjtcblx0XHRcdGNvbnN0IGlucHV0ID0gdGhpcy5faG9zdC5pbnB1dDtcblx0XHRcdGlmICh0eXBlb2YgYWN0aW9uLnJ1biA9PT0gJ2Z1bmN0aW9uJyAmJiBpbnB1dCkge1xuXHRcdFx0XHR2b2lkIFByb21pc2UucmVzb2x2ZShhY3Rpb24ucnVuKGlucHV0KSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdC8vIFBlci1ncm91cCBzZXBhcmF0b3IgYnV0dG9uLiBSb3V0ZWQgdGhlIHNhbWUgd2F5IGFzIHBlci1pdGVtIGJ1dHRvbnNcblx0XHQvLyAodGhlIElCcm93c2VyVXJsU3VnZ2VzdGlvbkFjdGlvbiB3YXMgYXR0YWNoZWQgZGlyZWN0bHkgdG8gdGhlIHNlcGFyYXRvcikuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZFRyaWdnZXJTZXBhcmF0b3JCdXR0b24oKHsgYnV0dG9uIH0pID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGJ1dHRvbiBhcyBJQnJvd3NlclVybFN1Z2dlc3Rpb25BY3Rpb247XG5cdFx0XHRjb25zdCBpbnB1dCA9IHRoaXMuX2hvc3QuaW5wdXQ7XG5cdFx0XHRpZiAodHlwZW9mIGFjdGlvbi5ydW4gPT09ICdmdW5jdGlvbicgJiYgaW5wdXQpIHtcblx0XHRcdFx0dm9pZCBQcm9taXNlLnJlc29sdmUoYWN0aW9uLnJ1bihpbnB1dCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdGFjdGlvblRha2VuID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGFjdGl2ZSA9IHBpY2tlci5hY3RpdmVJdGVtc1swXTtcblx0XHRcdGNvbnN0IGZhbGxiYWNrVXJsID0gcGlja2VyLnZhbHVlO1xuXHRcdFx0Y29uc3QgaW5wdXQgPSB0aGlzLl9ob3N0LmlucHV0O1xuXHRcdFx0cGlja2VyLmhpZGUoKTtcblx0XHRcdGlmIChhY3RpdmU/LmFwcGx5KSB7XG5cdFx0XHRcdGlmIChpbnB1dCkge1xuXHRcdFx0XHRcdHZvaWQgUHJvbWlzZS5yZXNvbHZlKGFjdGl2ZS5hcHBseShpbnB1dCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX25hdmlnYXRlVGV4dChhY3RpdmU/LmlkID8/IGZhbGxiYWNrVXJsKTtcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZEhpZGUoKHsgcmVhc29uIH0pID0+IHtcblx0XHRcdHRoaXMuX3VybERpc3BsYXkuc3R5bGUudmlzaWJpbGl0eSA9ICcnO1xuXHRcdFx0Ly8gRGVjaWRlIHdoZXRoZXIgdG8ga2VlcCB0aGUgdXNlciBpbiB0aGUgVVJMIGJhciAocmVmb2N1cyB0aGVcblx0XHRcdC8vIGRpc3BsYXkgc28gdGhleSBjYW4ga2VlcCBlZGl0aW5nKSBvciByZWxlYXNlIGl0LiBXZSBvbmx5IGtlZXBcblx0XHRcdC8vIGl0IGZvciBhIHBsYWluIGRpc21pc3NhbCAoZS5nLiBFc2NhcGUpOiBub3Qgd2hlbiBhbiBhY3Rpb24gcmFuXG5cdFx0XHQvLyAobmF2aWdhdGlvbi9idXR0b24pLCBub3Qgd2hlbiB0aGUgdXNlciBmb2N1c2VkIGVsc2V3aGVyZVxuXHRcdFx0Ly8gKEJsdXIpLCBhbmQgbm90IHdoZW4gYW5vdGhlciBwaWNrZXIgdG9vayBvdmVyIChyZXBsYWNlZCkuXG5cdFx0XHRjb25zdCByZXBsYWNlZCA9IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmN1cnJlbnRRdWlja0lucHV0ICE9PSB1bmRlZmluZWRcblx0XHRcdFx0JiYgdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3VycmVudFF1aWNrSW5wdXQgIT09IHBpY2tlcjtcblx0XHRcdGNvbnN0IHJlZm9jdXNEaXNwbGF5ID0gIWFjdGlvblRha2VuICYmIHJlYXNvbiAhPT0gUXVpY2tJbnB1dEhpZGVSZWFzb24uQmx1ciAmJiAhcmVwbGFjZWQ7XG5cblx0XHRcdGlmIChyZWZvY3VzRGlzcGxheSkge1xuXHRcdFx0XHQvLyBQcmVzZXJ2ZSB0aGUgaW4tcHJvZ3Jlc3MgZWRpdCArIGNhcmV0L3NlbGVjdGlvbiBzbyB0aGVcblx0XHRcdFx0Ly8gdXNlciBjYW4gY29udGludWUgdHlwaW5nIGluIHRoZSBkaXNwbGF5LlxuXHRcdFx0XHR0aGlzLl91cmxEaXNwbGF5LmZvY3VzKCk7XG5cdFx0XHRcdGlmIChzZWxlY3Rpb25BdEhpZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX3NldFNlbGVjdGlvbihzZWxlY3Rpb25BdEhpZGUuc3RhcnQsIHNlbGVjdGlvbkF0SGlkZS5lbmQsIHNlbGVjdGlvbkF0SGlkZS5kaXJlY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBUaGUgVVJMIGJhciBpcyBiZWluZyByZWxlYXNlZCBcdTIwMTQgYWx3YXlzIHNob3cgdGhlIGNhbm9uaWNhbFxuXHRcdFx0XHQvLyBVUkwgKHJ1biByZW5kZXJlcnMpIHNvIGFueSBpbi1wcm9ncmVzcyBtaXJyb3IgdGV4dCBkb2Vzbid0XG5cdFx0XHRcdC8vIGxpbmdlciBhZnRlciBmb2N1cyBoYXMgbW92ZWQgYXdheS5cblx0XHRcdFx0dGhpcy5fcmVuZGVyVXJsKCk7XG5cdFx0XHRcdGlmIChhY3Rpb25UYWtlbikge1xuXHRcdFx0XHRcdC8vIE1vdmUgZm9jdXMgdG8gdGhlIGJyb3dzZXIgY29udGVudCBzbyB0aGUgdXNlciBjYW5cblx0XHRcdFx0XHQvLyBpbnRlcmFjdCB3aXRoIHRoZSBwYWdlLlxuXHRcdFx0XHRcdHRoaXMuX2hvc3QuZW5zdXJlQnJvd3NlckZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3BpY2tlckVkaXRlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5faXNTZXR0aW5nUGlja2VyVmFsdWUgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3BpY2tlci5jbGVhcigpO1xuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyKTtcblxuXHRcdHRoaXMuX3BpY2tlci52YWx1ZSA9IHBpY2tlcjtcblx0XHRwaWNrZXIuc2hvdygpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsR0FBRyx1QkFBdUIseUJBQXlCLFdBQVcsMEJBQTBCO0FBQ2pHLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUFpQixtQkFBbUIsb0JBQW9CO0FBQzdFLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0JBQXFFLDRCQUE0QjtBQUUxRztBQUFBLEVBRUM7QUFBQSxPQVFNO0FBbURBLElBQU0sc0JBQU4sY0FBa0MsV0FBVztBQUFBLEVBZW5ELFlBQ2tCLE9BQ29CLG9CQUN0QixjQUNkO0FBQ0QsVUFBTTtBQUpXO0FBQ29CO0FBWnRDLFNBQWlCLGdCQUF1QyxDQUFDO0FBQ3pELFNBQWlCLHVCQUF3RCxDQUFDO0FBQzFFLFNBQWlCLHlCQUE0RCxDQUFDO0FBQzlFLFNBQWlCLFVBQVUsS0FBSyxVQUFVLElBQUksa0JBQXVFLENBQUM7QUFFdEgsU0FBUSxxQkFBcUI7QUFDN0IsU0FBUSxzQkFBc0I7QUFDOUIsU0FBUSxnQkFBZ0I7QUFDeEIsU0FBUSx3QkFBd0I7QUFTL0IsU0FBSyxVQUFVLEVBQUUsd0JBQXdCO0FBQ3pDLFNBQUssMEJBQTBCLEVBQUUsMEJBQTBCO0FBSzNELFNBQUssY0FBYyxFQUFFLHlCQUF5QjtBQUM5QyxTQUFLLFlBQVksYUFBYTtBQUM5QixTQUFLLFlBQVksV0FBVztBQUM1QixTQUFLLFlBQVksYUFBYSxRQUFRLFNBQVM7QUFDL0MsU0FBSyxZQUFZLGFBQWEsa0JBQWtCLE9BQU87QUFDdkQsU0FBSyxZQUFZLGFBQWEsb0JBQW9CLEtBQUssWUFBWTtBQUNuRSxTQUFLLGdCQUFn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
