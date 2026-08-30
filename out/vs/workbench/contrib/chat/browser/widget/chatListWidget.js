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
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableMap, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { Mimes } from "../../../../../base/common/mime.js";
import { localize } from "../../../../../nls.js";
import { MenuId } from "../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { WorkbenchObjectTree } from "../../../../../platform/list/browser/listService.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { asCssVariable, asCssVariableWithDefault, buttonSecondaryBackground, buttonSecondaryForeground } from "../../../../../platform/theme/common/colorRegistry.js";
import { katexContainerClassName } from "../../../markdown/common/markedKatexExtension.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { ChatConfiguration, ChatModeKind } from "../../common/constants.js";
import { isRequestVM, isResponseVM } from "../../common/model/chatViewModel.js";
import { ChatAccessibilityProvider } from "../accessibility/chatAccessibilityProvider.js";
import { IChatAccessibilityService } from "../chat.js";
import { ChatCollapsibleContentPart } from "./chatContentParts/chatCollapsibleContentPart.js";
import { ChatListDelegate, ChatListItemRenderer } from "./chatListRenderer.js";
import { sanitizeChatClipboardFragment } from "./chatClipboard.js";
import { ChatEditorOptions } from "./chatOptions.js";
import { ChatPendingDragController } from "./chatPendingDragAndDrop.js";
class AutoScrollHolds {
  constructor() {
    this._count = 0;
  }
  get isHeld() {
    return this._count > 0;
  }
  acquire() {
    this._count++;
    let released = false;
    return toDisposable(() => {
      if (!released) {
        released = true;
        this._count--;
      }
    });
  }
}
class UserToggleResizeState {
  constructor(requiredStableFrames) {
    this.requiredStableFrames = requiredStableFrames;
    this.framesUntilSettled = 0;
    this.transitionInProgress = false;
  }
  get isActive() {
    return this.transitionInProgress || this.framesUntilSettled > 0;
  }
  start() {
    this.framesUntilSettled = this.requiredStableFrames;
  }
  markResized() {
    if (this.isActive) {
      this.framesUntilSettled = this.requiredStableFrames;
    }
  }
  startTransition() {
    this.transitionInProgress = true;
  }
  endTransition() {
    this.transitionInProgress = false;
    this.framesUntilSettled = this.requiredStableFrames;
  }
  advanceFrame() {
    if (this.isActive) {
      this.framesUntilSettled--;
    }
  }
}
function getAnchoredScrollTop(scrollTop, currentTargetTop, anchorTargetTop) {
  return scrollTop + currentTargetTop - anchorTargetTop;
}
function computeScrollDownState(isScrolledToBottom, scrollLock) {
  return {
    showButton: !isScrolledToBottom,
    atBottom: isScrolledToBottom || scrollLock
  };
}
class UserToggleResizeTracker extends Disposable {
  constructor(target, restoreScrollPosition, onDidSettle) {
    super();
    this.restoreScrollPosition = restoreScrollPosition;
    this.onDidSettle = onDidSettle;
    this.state = new UserToggleResizeState(2);
    this.pendingFrame = this._register(new MutableDisposable());
    const targetWindow = dom.getWindow(target);
    const resizeObserver = this._register(new dom.DisposableResizeObserver("ChatListWidget.userToggleResize", () => {
      this.state.markResized();
      this.scheduleFrame(targetWindow);
    }, targetWindow));
    this._register(resizeObserver.observe(target));
    this._register(dom.addDisposableListener(target, "transitionrun", (e) => {
      if (e.propertyName === "grid-template-rows") {
        this.state.startTransition();
        this.scheduleFrame(targetWindow);
      }
    }));
    const finishTransition = (e) => {
      if (e.propertyName === "grid-template-rows") {
        this.state.endTransition();
        this.scheduleFrame(targetWindow);
      }
    };
    this._register(dom.addDisposableListener(target, "transitionend", finishTransition));
    this._register(dom.addDisposableListener(target, "transitioncancel", finishTransition));
    this.state.start();
    this.scheduleFrame(targetWindow);
  }
  restoreScrollAnchor() {
    this.restoreScrollPosition?.();
  }
  cancelScrollRestoration() {
    this.restoreScrollPosition = void 0;
  }
  scheduleFrame(targetWindow) {
    if (this.pendingFrame.value) {
      return;
    }
    this.pendingFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, () => {
      this.pendingFrame.clear();
      this.restoreScrollPosition?.();
      this.state.advanceFrame();
      if (this.state.isActive) {
        this.scheduleFrame(targetWindow);
      } else {
        this.onDidSettle();
      }
    });
  }
}
let ChatListWidget = class extends Disposable {
  //#endregion
  constructor(container, options, instantiationService, contextKeyService, chatService, contextMenuService, logService, configurationService, chatAccessibilityService) {
    super();
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.chatService = chatService;
    this.contextMenuService = contextMenuService;
    this.logService = logService;
    this.configurationService = configurationService;
    this.chatAccessibilityService = chatAccessibilityService;
    //#region Events
    this._onDidScroll = this._register(new Emitter());
    this.onDidScroll = this._onDidScroll.event;
    this._onDidChangeContentHeight = this._register(new Emitter());
    this.onDidChangeContentHeight = this._onDidChangeContentHeight.event;
    this._onDidClickFollowup = this._register(new Emitter());
    this.onDidClickFollowup = this._onDidClickFollowup.event;
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidChangeItemHeight = this._register(new Emitter());
    /** Event fired when an item's height changes. Used for dynamic layout mode. */
    this.onDidChangeItemHeight = this._onDidChangeItemHeight.event;
    this._visible = true;
    this._mostRecentlyFocusedItemIndex = -1;
    this._scrollLock = true;
    this._autoScrollHolds = new AutoScrollHolds();
    this._settingChangeCounter = 0;
    this._visibleChangeCount = 0;
    this._userToggleResizeTrackers = this._register(new DisposableMap());
    this._viewModel = options.viewModel;
    this._location = options.location;
    this._getSelectedModelRequestOptions = options.getSelectedModelRequestOptions;
    this._getCurrentModeInfo = options.getCurrentModeInfo;
    this._lastItemIdContextKey = ChatContextKeys.lastItemId.bindTo(this.contextKeyService);
    this._container = container;
    const updateInlineReferencesStyle = () => {
      const style = this.configurationService.getValue(ChatConfiguration.InlineReferencesStyle);
      this._container.classList.toggle("chat-inline-references-link-style", style === "link");
    };
    updateInlineReferencesStyle();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.InlineReferencesStyle)) {
        updateInlineReferencesStyle();
      }
    }));
    const scopedInstantiationService = this._register(this.instantiationService.createChild(
      new ServiceCollection([IContextKeyService, this.contextKeyService])
    ));
    const overflowWidgetsContainer = options.overflowWidgetsDomNode ?? document.createElement("div");
    if (!options.overflowWidgetsDomNode) {
      overflowWidgetsContainer.classList.add("chat-overflow-widget-container", "monaco-editor");
      this._container.append(overflowWidgetsContainer);
      this._register(toDisposable(() => overflowWidgetsContainer.remove()));
    }
    const editorOptions = options.editorOptions ?? this._register(scopedInstantiationService.createInstance(
      ChatEditorOptions,
      options.viewId,
      "foreground",
      options.inputEditorBackground ?? "chat.requestEditor.background",
      options.resultEditorBackground ?? "chat.responseEditor.background"
    ));
    this._delegate = scopedInstantiationService.createInstance(
      ChatListDelegate,
      options.defaultElementHeight ?? 200
    );
    const rendererDelegate = {
      getListLength: () => this._tree.getNode(null).visibleChildrenCount,
      onDidScroll: this.onDidScroll,
      container: this._container,
      currentChatMode: options.currentChatMode ?? (() => ChatModeKind.Ask)
    };
    this._renderer = this._register(scopedInstantiationService.createInstance(
      ChatListItemRenderer,
      editorOptions,
      options.rendererOptions ?? {},
      rendererDelegate,
      overflowWidgetsContainer,
      this._viewModel
    ));
    this._register(this._renderer.onDidClickFollowup((item) => {
      this._onDidClickFollowup.fire(item);
    }));
    this._register(this._renderer.onDidChangeItemHeight((e) => {
      this._updateElementHeight(e.element, e.height);
      this._onDidChangeItemHeight.fire(e);
    }));
    this._register(this._renderer.onDidClickRerunWithAgentOrCommandDetection((e) => {
      const request = this.chatService.getSession(e.sessionResource)?.getRequests().find((candidate) => candidate.id === e.requestId);
      if (request) {
        const sendOptions = {
          noCommandDetection: true,
          attempt: request.attempt + 1,
          location: this._location,
          ...this._getSelectedModelRequestOptions?.(),
          modeInfo: this._getCurrentModeInfo?.()
        };
        this.chatAccessibilityService.acceptRequest(e.sessionResource);
        this.chatService.resendRequest(request, sendOptions).catch((e2) => this.logService.error("FAILED to rerun request", e2));
      }
    }));
    this._renderer.pendingDragController = this._register(
      scopedInstantiationService.createInstance(ChatPendingDragController, this._container, () => this._viewModel)
    );
    const styles = options.styles ?? {};
    this._tree = this._register(scopedInstantiationService.createInstance(
      WorkbenchObjectTree,
      "ChatList",
      this._container,
      this._delegate,
      [this._renderer],
      {
        identityProvider: { getId: (e) => e.id },
        horizontalScrolling: false,
        alwaysConsumeMouseWheel: false,
        supportDynamicHeights: true,
        hideTwistiesOfChildlessElements: true,
        accessibilityProvider: this.instantiationService.createInstance(ChatAccessibilityProvider),
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (e) => isRequestVM(e) ? e.message : isResponseVM(e) ? e.response.value : ""
        },
        setRowLineHeight: false,
        scrollToActiveElement: true,
        filter: options.filter,
        overrideStyles: {
          listFocusBackground: styles.listBackground,
          listInactiveFocusBackground: styles.listBackground,
          listActiveSelectionBackground: styles.listBackground,
          listFocusAndSelectionBackground: styles.listBackground,
          listInactiveSelectionBackground: styles.listBackground,
          listHoverBackground: styles.listBackground,
          listBackground: styles.listBackground,
          listFocusForeground: styles.listForeground,
          listHoverForeground: styles.listForeground,
          listInactiveFocusForeground: styles.listForeground,
          listInactiveSelectionForeground: styles.listForeground,
          listActiveSelectionForeground: styles.listForeground,
          listFocusAndSelectionForeground: styles.listForeground,
          listActiveSelectionIconForeground: void 0,
          listInactiveSelectionIconForeground: void 0
        }
      }
    ));
    const scrollToBottomLabel = localize("chat.scrollToBottom", "Scroll to Bottom");
    const scrollToBottomBackground = asCssVariableWithDefault("chat.list.background", asCssVariable(buttonSecondaryBackground));
    this._scrollDownButton = this._register(new Button(this._container, {
      title: scrollToBottomLabel,
      ariaLabel: scrollToBottomLabel,
      buttonBackground: scrollToBottomBackground,
      buttonForeground: asCssVariable(buttonSecondaryForeground),
      buttonHoverBackground: scrollToBottomBackground,
      buttonSecondaryBackground: void 0,
      buttonSecondaryForeground: void 0,
      buttonSecondaryHoverBackground: void 0,
      buttonSeparator: void 0,
      supportIcons: true
    }));
    this._scrollDownButton.element.classList.add("chat-scroll-down");
    this._scrollDownButton.label = `$(${Codicon.chevronDown.id})`;
    this._scrollDownButton.element.style.display = "none";
    this._register(this._scrollDownButton.onDidClick(() => {
      this.cancelUserToggleScrollRestoration();
      this.setScrollLock(true);
      this.scrollToEnd();
    }));
    this._register(this._tree.onDidChangeContentHeight(() => {
      this._onDidChangeContentHeight.fire();
    }));
    this._register(this._tree.onDidFocus(() => {
      this._onDidFocus.fire();
    }));
    this._register(this._tree.onDidChangeFocus(() => {
      const focused = this.getFocus();
      if (focused && focused.length > 0) {
        const focusedItem = focused[0];
        const items = this.getItems();
        const idx = items.findIndex((i) => i === focusedItem);
        if (idx !== -1) {
          this._mostRecentlyFocusedItemIndex = idx;
        }
      }
    }));
    this._register(this._tree.onDidScroll((e) => {
      this._onDidScroll.fire(e);
      this.updateScrollDownButtonVisibility();
    }));
    this.updateScrollDownButtonVisibility();
    this._register(dom.addDisposableListener(this._container, ChatCollapsibleContentPart.userToggleEvent, (e) => {
      if (!dom.isHTMLElement(e.target)) {
        return;
      }
      const element = this._renderer.getElementFromNode(e.target);
      if (element) {
        this.trackUserToggleResize(element, e.target);
      }
    }));
    this._register(dom.addDisposableListener(this._container, dom.EventType.WHEEL, () => this.cancelUserToggleScrollRestoration()));
    this._register(dom.addDisposableListener(this._container, dom.EventType.POINTER_DOWN, () => this.cancelUserToggleScrollRestoration()));
    this._register(dom.addDisposableListener(this._container, dom.EventType.KEY_DOWN, (e) => {
      const keyCode = new StandardKeyboardEvent(e).keyCode;
      if (keyCode === KeyCode.UpArrow || keyCode === KeyCode.DownArrow || keyCode === KeyCode.PageUp || keyCode === KeyCode.PageDown || keyCode === KeyCode.Home || keyCode === KeyCode.End) {
        this.cancelUserToggleScrollRestoration();
      }
    }, true));
    this._register(this._tree.onContextMenu((e) => {
      this.handleContextMenu(e);
    }));
    this._register(dom.addDisposableListener(this._container, "copy", (e) => this.handleCopy(e)));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.EditRequests) || e.affectsConfiguration(ChatConfiguration.CheckpointsEnabled) || e.affectsConfiguration(ChatConfiguration.RichLinks)) {
        this._settingChangeCounter++;
        this.refresh();
      }
    }));
  }
  /**
   * Event fired when a request item is clicked.
   */
  get onDidClickRequest() {
    return this._renderer.onDidClickRequest;
  }
  /**
   * Event fired when an item is re-rendered.
   */
  get onDidRerender() {
    return this._renderer.onDidRerender;
  }
  /**
   * Event fired when a template is disposed.
   */
  get onDidDispose() {
    return this._renderer.onDidDispose;
  }
  /**
   * Event fired when focus moves outside the editing area.
   */
  get onDidFocusOutside() {
    return this._renderer.onDidFocusOutside;
  }
  //#endregion
  //#region Properties
  get domNode() {
    return this._container;
  }
  get scrollTop() {
    return this._tree.scrollTop;
  }
  set scrollTop(value) {
    this._tree.scrollTop = value;
  }
  get scrollHeight() {
    return this._tree.scrollHeight;
  }
  get renderHeight() {
    return this._tree.renderHeight;
  }
  get contentHeight() {
    return this._tree.contentHeight;
  }
  /**
   * Whether the list is scrolled to the bottom.
   */
  get isScrolledToBottom() {
    return this._tree.scrollTop + this._tree.renderHeight >= this._tree.scrollHeight - 2;
  }
  /**
   * The last item in the list.
   */
  get lastItem() {
    return this._lastItem;
  }
  //#region Internal event handlers
  /**
   * Rewrites the rich-text flavor of a copied selection so links that only resolve here
   * don't paste as `vscode-file:` targets or local paths. Selections whose links all resolve
   * elsewhere are left to the browser, which keeps the styling other apps rely on.
   */
  handleCopy(e) {
    const selection = dom.getWindow(this._container).getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !e.clipboardData) {
      return;
    }
    const touched = Array.from(this._container.querySelectorAll("a, img")).filter((element) => selection.containsNode(element, true));
    if (!touched.length) {
      return;
    }
    const ranges = [];
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i);
      if (!dom.isAncestor(range.commonAncestorContainer, this._container)) {
        return;
      }
      ranges.push(range);
    }
    const fragments = ranges.map((range) => this.cloneSelectedContents(range));
    if (!fragments.map((fragment) => sanitizeChatClipboardFragment(fragment)).some(Boolean)) {
      return;
    }
    const holder = dom.$("div");
    for (const fragment of fragments) {
      holder.appendChild(fragment);
    }
    e.clipboardData.setData(Mimes.text, selection.toString());
    e.clipboardData.setData(Mimes.html, holder.innerHTML);
    e.preventDefault();
  }
  /**
   * Clones a range along with the elements it sits inside. `cloneContents` returns only what
   * lies between the range boundaries, which drops both the heading or list item giving the
   * text its shape and, for a partly selected link, the rest of its label.
   */
  cloneSelectedContents(range) {
    let content = range.cloneContents();
    for (let ancestor = range.commonAncestorContainer; ancestor && ancestor !== this._container; ancestor = ancestor.parentNode) {
      if (!dom.isHTMLElement(ancestor)) {
        continue;
      }
      if (ancestor.tagName === "A") {
        content = ancestor.cloneNode(true);
        continue;
      }
      const wrapper = ancestor.cloneNode(false);
      wrapper.appendChild(content);
      content = wrapper;
    }
    if (content.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      return content;
    }
    const fragment = this._container.ownerDocument.createDocumentFragment();
    fragment.appendChild(content);
    return fragment;
  }
  /**
   * Update scroll-down button visibility based on scroll position and scroll lock.
   */
  updateScrollDownButtonVisibility() {
    const { showButton, atBottom } = computeScrollDownState(this.isScrolledToBottom, this._scrollLock);
    this._scrollDownButton.element.style.display = showButton ? "flex" : "none";
    this._container.classList.toggle("chat-list-at-bottom", atBottom);
  }
  /**
   * Handle context menu events.
   */
  handleContextMenu(e) {
    e.browserEvent.preventDefault();
    e.browserEvent.stopPropagation();
    const selected = e.element;
    const target = e.browserEvent.target;
    const isKatexElement = target.closest(`.${katexContainerClassName}`) !== null;
    const scopedContextKeyService = this.contextKeyService.createOverlay([
      [ChatContextKeys.isResponse.key, isResponseVM(selected)],
      [ChatContextKeys.responseIsFiltered.key, isResponseVM(selected) && !!selected.errorDetails?.responseIsFiltered],
      [ChatContextKeys.isKatexMathElement.key, isKatexElement]
    ]);
    this.contextMenuService.showContextMenu({
      menuId: MenuId.ChatContext,
      menuActionOptions: { shouldForwardArgs: true },
      contextKeyService: scopedContextKeyService,
      getAnchor: () => e.anchor,
      getActionsContext: () => selected
    });
  }
  //#endregion
  //#region ViewModel methods
  /**
   * Set the view model for the list to render.
   */
  setViewModel(viewModel) {
    this._viewModel = viewModel;
    this._renderer.updateViewModel(viewModel);
  }
  /**
   * Refresh the list from the current view model.
   * Uses internal state for diff identity calculation.
   */
  refresh() {
    if (!this._viewModel) {
      this._tree.setChildren(null, []);
      this._lastItem = void 0;
      this._lastItemIdContextKey.set([]);
      return;
    }
    const items = this._viewModel.getItems();
    this._lastItem = items.at(-1);
    this._lastItemIdContextKey.set(this._lastItem ? [this._lastItem.id] : []);
    const treeItems = items.map((item) => ({
      element: item,
      collapsed: false,
      collapsible: false
    }));
    const editing = this._viewModel.editing;
    this._withPersistedAutoScroll(() => {
      this._tree.setChildren(null, treeItems, {
        diffIdentityProvider: {
          getId: (element) => {
            const baseId = isRequestVM(element) || isResponseVM(element) ? element.dataId : element.id;
            const disablement = isRequestVM(element) || isResponseVM(element) ? element.shouldBeRemovedOnSend : void 0;
            const isEditTarget = isRequestVM(element) && editing?.id === element.id;
            const isBlocked = isRequestVM(element) || isResponseVM(element) ? element.shouldBeBlocked.get() : false;
            return baseId + // If a response is in the process of progressive rendering, we need to ensure that it will
            // be re-rendered so progressive rendering is restarted, even if the model wasn't updated.
            `${isResponseVM(element) && element.renderData ? `_${this._visibleChangeCount}` : ""}` + // Re-render once content references are loaded
            (isResponseVM(element) ? `_${element.contentReferences.length}` : "") + // Re-render if element becomes hidden due to undo/redo
            `_${disablement ? `${disablement.afterUndoStop || "1"}` : "0"}_${isEditTarget ? "edit" : ""}_${isBlocked ? "blocked" : ""}` + // Re-render requests when editing starts/stops (for hover button visibility, click handlers)
            (isRequestVM(element) ? `_${editing ? "1" : "0"}` : "") + // Re-render all if invoked by setting change
            `_setting${this._settingChangeCounter}` + // Rerender request if we got new content references in the response
            // since this may change how we render the corresponding attachments in the request
            (isRequestVM(element) && element.contentReferences ? `_${element.contentReferences?.length}` : "");
          }
        }
      });
    });
  }
  /**
   * Set scroll lock state.
   */
  setScrollLock(value) {
    this._scrollLock = value;
    this.updateScrollDownButtonVisibility();
  }
  /**
   * Get scroll lock state.
   */
  get scrollLock() {
    return this._scrollLock;
  }
  /**
   * Set the visible change count (for diff identity).
   */
  setVisibleChangeCount(value) {
    this._visibleChangeCount = value;
  }
  /**
   * Scroll to reveal an element if editing.
   */
  scrollToCurrentItem(currentElement) {
    if (!this._viewModel?.editing || !currentElement) {
      return;
    }
    if (!this._tree.hasElement(currentElement)) {
      return;
    }
    const relativeTop = this._tree.getRelativeTop(currentElement);
    if (relativeTop === null || relativeTop < 0 || relativeTop > 1) {
      this._tree.reveal(currentElement, 0);
    }
  }
  //#endregion
  //#region Tree methods
  /**
   * Rerender the tree.
   */
  rerender() {
    this._tree.rerender();
  }
  getItems() {
    const items = [];
    const root = this._tree.getNode(null);
    for (const child of root.children) {
      if (child.element) {
        items.push(child.element);
      }
    }
    return items;
  }
  /**
   * Delegate scroll events from a mouse wheel event to the tree.
   */
  delegateScrollFromMouseWheelEvent(event) {
    this.cancelUserToggleScrollRestoration();
    this._tree.delegateScrollFromMouseWheelEvent(event);
  }
  /**
   * Whether the tree has a specific element.
   */
  hasElement(element) {
    return this._tree.hasElement(element);
  }
  /**
   * Update the height of an element.
   */
  _updateElementHeight(element, height) {
    if (this._tree.hasElement(element) && this._visible) {
      const userToggleResizeTracker = this._userToggleResizeTrackers.get(element);
      if (userToggleResizeTracker) {
        this._tree.updateElementHeight(element, height);
        userToggleResizeTracker.restoreScrollAnchor();
        return;
      }
      this._withPersistedAutoScroll(() => {
        this._tree.updateElementHeight(element, height);
      });
    }
  }
  trackUserToggleResize(element, target) {
    const anchorTargetTop = this.isScrolledToBottom ? target.getBoundingClientRect().top : void 0;
    const restoreScrollPosition = anchorTargetTop === void 0 ? void 0 : () => {
      if (target.isConnected) {
        this._tree.scrollTop = getAnchoredScrollTop(this._tree.scrollTop, target.getBoundingClientRect().top, anchorTargetTop);
      }
    };
    const tracker = new UserToggleResizeTracker(target, restoreScrollPosition, () => {
      if (this._userToggleResizeTrackers.get(element) === tracker) {
        this._userToggleResizeTrackers.deleteAndDispose(element);
      }
    });
    this._userToggleResizeTrackers.set(element, tracker);
  }
  cancelUserToggleScrollRestoration() {
    for (const tracker of this._userToggleResizeTrackers.values()) {
      tracker.cancelScrollRestoration();
    }
  }
  /**
   * Scroll to reveal an element.
   */
  reveal(element, relativeTop) {
    this._tree.reveal(element, relativeTop);
  }
  /**
   * The top offset of an element in transcript content space (same space as
   * `scrollTop`/`scrollHeight`), or `undefined` if it is not in the list. Reads
   * the layout height model, so it also resolves off-screen elements.
   */
  getElementTop(element) {
    if (!this._tree.hasElement(element)) {
      return void 0;
    }
    return this._tree.getElementTop(element);
  }
  /**
   * Get the focused elements.
   */
  getFocus() {
    return this._tree.getFocus().filter((e) => e !== null);
  }
  /**
   * Set the focused elements.
   */
  setFocus(elements) {
    this._tree.setFocus(elements);
  }
  focusItem(item) {
    if (!this.hasElement(item)) {
      return;
    }
    this._tree.setFocus([item]);
    this._tree.domFocus();
  }
  /**
   * Focus the last item in the list. Returns the index of the focused item.
   * @param useMostRecentlyFocusedIndex If true, use the mostRecentlyFocusedIndex if valid
   */
  focusLastItem(useMostRecentlyFocusedIndex) {
    const items = this.getItems();
    if (items.length === 0) {
      return -1;
    }
    let focusIndex;
    if (useMostRecentlyFocusedIndex && this._mostRecentlyFocusedItemIndex >= 0 && this._mostRecentlyFocusedItemIndex < items.length) {
      focusIndex = this._mostRecentlyFocusedItemIndex;
    } else {
      focusIndex = items.length - 1;
    }
    this._tree.setFocus([items[focusIndex]]);
    this._tree.domFocus();
    return focusIndex;
  }
  /**
   * Scroll the list to reveal the last item.
   */
  scrollToEnd() {
    const lastElement = this._tree.getNode(null).children.at(-1)?.element;
    if (lastElement) {
      const offset = Math.max(lastElement.currentRenderedHeight ?? 0, 1e6);
      this._tree.reveal(lastElement, offset);
    }
  }
  /**
   * Suppresses auto-scrolling to the bottom until the returned disposable is
   * disposed. Holds compose, so unrelated features (request editing, an open
   * text selection) can suppress concurrently without clobbering each other;
   * auto-scroll resumes only once the last hold is released.
   */
  acquireAutoScrollHold() {
    return this._autoScrollHolds.acquire();
  }
  /** Whether any {@link acquireAutoScrollHold} hold is currently active. */
  get isAutoScrollHeld() {
    return this._autoScrollHolds.isHeld;
  }
  _withPersistedAutoScroll(fn) {
    if (this.isAutoScrollHeld) {
      fn();
      return;
    }
    const wasScrolledToBottom = this.isScrolledToBottom;
    fn();
    if (wasScrolledToBottom) {
      this.scrollToEnd();
    }
  }
  /**
   * Focus the list.
   */
  focus() {
    this._tree.domFocus();
  }
  /**
   * Get the DOM focus state.
   */
  isDOMFocused() {
    return this._tree.isDOMFocused();
  }
  //#endregion
  //#region Renderer methods
  /**
   * Get code block info for a response.
   */
  getCodeBlockInfosForResponse(response) {
    return this._renderer.getCodeBlockInfosForResponse(response);
  }
  /**
   * Get code block info by URI.
   */
  getCodeBlockInfoForEditor(uri) {
    return this._renderer.getCodeBlockInfoForEditor(uri);
  }
  /**
   * Get file tree info for a response.
   */
  getFileTreeInfosForResponse(response) {
    return this._renderer.getFileTreeInfosForResponse(response);
  }
  /**
   * Get the last focused file tree for a response.
   */
  getLastFocusedFileTreeForResponse(response) {
    return this._renderer.getLastFocusedFileTreeForResponse(response);
  }
  /**
   * Get editors currently in use.
   */
  editorsInUse() {
    return this._renderer.editorsInUse();
  }
  /**
   * Get template data for a request ID.
   */
  getTemplateDataForRequestId(requestId) {
    if (!requestId) {
      return void 0;
    }
    return this._renderer.getTemplateDataForRequestId(requestId);
  }
  /**
   * Returns the currently rendered chat item containing the node.
   */
  getElementFromNode(node) {
    return this._renderer.getElementFromNode(node);
  }
  /**
   * Update renderer options.
   */
  updateRendererOptions(options) {
    this._renderer.updateOptions(options);
  }
  /**
   * Update the list/tree color overrides. Re-applies the same fan-out from
   * `listBackground`/`listForeground` to all interaction states that was
   * originally configured at construction time.
   */
  setStyles(styles) {
    this._tree.updateOptions({
      overrideStyles: {
        listFocusBackground: styles.listBackground,
        listInactiveFocusBackground: styles.listBackground,
        listActiveSelectionBackground: styles.listBackground,
        listFocusAndSelectionBackground: styles.listBackground,
        listInactiveSelectionBackground: styles.listBackground,
        listHoverBackground: styles.listBackground,
        listBackground: styles.listBackground,
        listFocusForeground: styles.listForeground,
        listHoverForeground: styles.listForeground,
        listInactiveFocusForeground: styles.listForeground,
        listInactiveSelectionForeground: styles.listForeground,
        listActiveSelectionForeground: styles.listForeground,
        listFocusAndSelectionForeground: styles.listForeground,
        listActiveSelectionIconForeground: void 0,
        listInactiveSelectionIconForeground: void 0
      }
    });
  }
  /**
   * Set the visibility of the list.
   */
  setVisible(visible) {
    this._visible = visible;
    this._renderer.setVisible(visible);
  }
  /**
   * Layout the list.
   */
  layout(height, width) {
    this._tree.layout(height, width);
    this._renderer.layout(width ?? this._container.clientWidth);
  }
  //#endregion
};
ChatListWidget = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IChatService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IChatAccessibilityService)
], ChatListWidget);
export {
  AutoScrollHolds,
  ChatListWidget,
  UserToggleResizeState,
  computeScrollDownState,
  getAnchoredScrollTop
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdExpc3RXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBJTW91c2VXaGVlbEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgSVRyZWVDb250ZXh0TWVudUV2ZW50LCBJVHJlZUVsZW1lbnQsIElUcmVlRmlsdGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWltZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IFNjcm9sbEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hPYmplY3RUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSwgYXNDc3NWYXJpYWJsZVdpdGhEZWZhdWx0LCBidXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kLCBidXR0b25TZWNvbmRhcnlGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsga2F0ZXhDb250YWluZXJDbGFzc05hbWUgfSBmcm9tICcuLi8uLi8uLi9tYXJrZG93bi9jb21tb24vbWFya2VkS2F0ZXhFeHRlbnNpb24uanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElDaGF0Rm9sbG93dXAsIElDaGF0U2VuZFJlcXVlc3RPcHRpb25zLCBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdE1vZGVJbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RWaWV3TW9kZWwsIElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIElDaGF0Vmlld01vZGVsLCBpc1JlcXVlc3RWTSwgaXNSZXNwb25zZVZNIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdEFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uL2FjY2Vzc2liaWxpdHkvY2hhdEFjY2Vzc2liaWxpdHlQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBDaGF0VHJlZUl0ZW0sIElDaGF0QWNjZXNzaWJpbGl0eVNlcnZpY2UsIElDaGF0Q29kZUJsb2NrSW5mbywgSUNoYXRGaWxlVHJlZUluZm8sIElDaGF0TGlzdEl0ZW1SZW5kZXJlck9wdGlvbnMgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IENvZGVCbG9ja1BhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY29kZUJsb2NrUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29sbGFwc2libGVDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29sbGFwc2libGVDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0TGlzdERlbGVnYXRlLCBDaGF0TGlzdEl0ZW1SZW5kZXJlciwgSUNoYXRMaXN0SXRlbVRlbXBsYXRlLCBJQ2hhdFJlbmRlcmVyRGVsZWdhdGUgfSBmcm9tICcuL2NoYXRMaXN0UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgc2FuaXRpemVDaGF0Q2xpcGJvYXJkRnJhZ21lbnQgfSBmcm9tICcuL2NoYXRDbGlwYm9hcmQuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRvck9wdGlvbnMgfSBmcm9tICcuL2NoYXRPcHRpb25zLmpzJztcbmltcG9ydCB7IENoYXRQZW5kaW5nRHJhZ0NvbnRyb2xsZXIgfSBmcm9tICcuL2NoYXRQZW5kaW5nRHJhZ0FuZERyb3AuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0TGlzdFdpZGdldFN0eWxlcyB7XG5cdGxpc3RGb3JlZ3JvdW5kPzogc3RyaW5nO1xuXHRsaXN0QmFja2dyb3VuZD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBSZWYtY291bnRlZCBzdXBwcmVzc2lvbiBvZiBhdXRvLXNjcm9sbGluZyB0byB0aGUgYm90dG9tLiBIb2xkcyBjb21wb3NlLCBzb1xuICogdW5yZWxhdGVkIGZlYXR1cmVzIChyZXF1ZXN0IGVkaXRpbmcsIGFuIG9wZW4gdGV4dCBzZWxlY3Rpb24pIGNhbiBzdXBwcmVzc1xuICogY29uY3VycmVudGx5IHdpdGhvdXQgY2xvYmJlcmluZyBlYWNoIG90aGVyOyBhdXRvLXNjcm9sbCByZXN1bWVzIG9ubHkgb25jZSB0aGVcbiAqIGxhc3QgaG9sZCBpcyByZWxlYXNlZC5cbiAqL1xuZXhwb3J0IGNsYXNzIEF1dG9TY3JvbGxIb2xkcyB7XG5cblx0cHJpdmF0ZSBfY291bnQgPSAwO1xuXG5cdGdldCBpc0hlbGQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvdW50ID4gMDtcblx0fVxuXG5cdGFjcXVpcmUoKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuX2NvdW50Kys7XG5cdFx0Ly8gSWRlbXBvdGVudCBzbyBhIGRvdWJsZS1kaXNwb3NlIHJlbGVhc2VzIG9uZSBob2xkIHJhdGhlciB0aGFuXG5cdFx0Ly8gZGVjcmVtZW50aW5nIHBhc3QgaXQgYW5kIHNpbGVudGx5IGNhbmNlbGxpbmcgc29tZWJvZHkgZWxzZSdzLlxuXHRcdGxldCByZWxlYXNlZCA9IGZhbHNlO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKCFyZWxlYXNlZCkge1xuXHRcdFx0XHRyZWxlYXNlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2NvdW50LS07XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuLyoqXG4gKiBUcmFja3Mgd2hlbiBhIHVzZXItdHJpZ2dlcmVkIHJlc2l6ZSBoYXMgcmVtYWluZWQgc3RhYmxlIGFjcm9zcyBhbmltYXRpb24gZnJhbWVzLlxuICovXG5leHBvcnQgY2xhc3MgVXNlclRvZ2dsZVJlc2l6ZVN0YXRlIHtcblxuXHRwcml2YXRlIGZyYW1lc1VudGlsU2V0dGxlZCA9IDA7XG5cdHByaXZhdGUgdHJhbnNpdGlvbkluUHJvZ3Jlc3MgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHJlcXVpcmVkU3RhYmxlRnJhbWVzOiBudW1iZXIpIHsgfVxuXG5cdGdldCBpc0FjdGl2ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy50cmFuc2l0aW9uSW5Qcm9ncmVzcyB8fCB0aGlzLmZyYW1lc1VudGlsU2V0dGxlZCA+IDA7XG5cdH1cblxuXHRzdGFydCgpOiB2b2lkIHtcblx0XHR0aGlzLmZyYW1lc1VudGlsU2V0dGxlZCA9IHRoaXMucmVxdWlyZWRTdGFibGVGcmFtZXM7XG5cdH1cblxuXHRtYXJrUmVzaXplZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc0FjdGl2ZSkge1xuXHRcdFx0dGhpcy5mcmFtZXNVbnRpbFNldHRsZWQgPSB0aGlzLnJlcXVpcmVkU3RhYmxlRnJhbWVzO1xuXHRcdH1cblx0fVxuXG5cdHN0YXJ0VHJhbnNpdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLnRyYW5zaXRpb25JblByb2dyZXNzID0gdHJ1ZTtcblx0fVxuXG5cdGVuZFRyYW5zaXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy50cmFuc2l0aW9uSW5Qcm9ncmVzcyA9IGZhbHNlO1xuXHRcdHRoaXMuZnJhbWVzVW50aWxTZXR0bGVkID0gdGhpcy5yZXF1aXJlZFN0YWJsZUZyYW1lcztcblx0fVxuXG5cdGFkdmFuY2VGcmFtZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc0FjdGl2ZSkge1xuXHRcdFx0dGhpcy5mcmFtZXNVbnRpbFNldHRsZWQtLTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFuY2hvcmVkU2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyLCBjdXJyZW50VGFyZ2V0VG9wOiBudW1iZXIsIGFuY2hvclRhcmdldFRvcDogbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuIHNjcm9sbFRvcCArIGN1cnJlbnRUYXJnZXRUb3AgLSBhbmNob3JUYXJnZXRUb3A7XG59XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIHNjcm9sbC1kb3duIHN0YXRlIGZvciB0aGUgY2hhdCBsaXN0LCBrZWVwaW5nIHR3byBjb25jZXJucyBkZWNvdXBsZWQ6XG4gKlxuICogLSBgc2hvd0J1dHRvbmA6IHdoZXRoZXIgdGhlIFwic2Nyb2xsIHRvIGJvdHRvbVwiIGFmZm9yZGFuY2UgaXMgc2hvd24uIERyaXZlbiBwdXJlbHkgYnkgdGhlIGFjdHVhbFxuICogICBzY3JvbGwgcG9zaXRpb24gc28gdGhlIHVzZXIgY2FuIGFsd2F5cyBqdW1wIHRvIHRoZSBsYXRlc3QgY29udGVudCB3aGVuIHRoZSB2aWV3IGlzIG5vdCBhdCB0aGVcbiAqICAgYm90dG9tIFx1MjAxNCBpbmNsdWRpbmcgZHVyaW5nIGFuIGF1dG8tc2Nyb2xsIChhZ2VudCkgdHVybiB3aGVyZSB0aGUgdmlldyBoYXMgZmFsbGVuIGJlaGluZC4gU2VlXG4gKiAgIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zMjY5NTIgKHByZXZpb3VzbHkgdGhpcyB3YXMgYWxzbyBzdXBwcmVzc2VkIGJ5IHRoZVxuICogICBzY3JvbGwgbG9jaywgaGlkaW5nIHRoZSBidXR0b24gZm9yIHRoZSB3aG9sZSBhZ2VudCB0dXJuKS5cbiAqIC0gYGF0Qm90dG9tYDogdGhlIGBjaGF0LWxpc3QtYXQtYm90dG9tYCB2aXN1YWwgc3RhdGUgdGhhdCByZXNlcnZlcyBzdHJlYW1pbmctcmVzcG9uc2UgcGFkZGluZy5cbiAqICAgSW50ZW50aW9uYWxseSBzdGlsbCBob25vdXJzIHRoZSBzY3JvbGwgbG9jayBzbyBwYWRkaW5nIGR1cmluZyBhdXRvLXNjcm9sbCB0dXJucyBpcyB1bmNoYW5nZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wdXRlU2Nyb2xsRG93blN0YXRlKGlzU2Nyb2xsZWRUb0JvdHRvbTogYm9vbGVhbiwgc2Nyb2xsTG9jazogYm9vbGVhbik6IHsgc2hvd0J1dHRvbjogYm9vbGVhbjsgYXRCb3R0b206IGJvb2xlYW4gfSB7XG5cdHJldHVybiB7XG5cdFx0c2hvd0J1dHRvbjogIWlzU2Nyb2xsZWRUb0JvdHRvbSxcblx0XHRhdEJvdHRvbTogaXNTY3JvbGxlZFRvQm90dG9tIHx8IHNjcm9sbExvY2ssXG5cdH07XG59XG5cbmNsYXNzIFVzZXJUb2dnbGVSZXNpemVUcmFja2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzdGF0ZSA9IG5ldyBVc2VyVG9nZ2xlUmVzaXplU3RhdGUoMik7XG5cdHByaXZhdGUgcmVhZG9ubHkgcGVuZGluZ0ZyYW1lID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR0YXJnZXQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVzdG9yZVNjcm9sbFBvc2l0aW9uOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvbkRpZFNldHRsZTogKCkgPT4gdm9pZCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGRvbS5nZXRXaW5kb3codGFyZ2V0KTtcblx0XHRjb25zdCByZXNpemVPYnNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBkb20uRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdDaGF0TGlzdFdpZGdldC51c2VyVG9nZ2xlUmVzaXplJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5zdGF0ZS5tYXJrUmVzaXplZCgpO1xuXHRcdFx0dGhpcy5zY2hlZHVsZUZyYW1lKHRhcmdldFdpbmRvdyk7XG5cdFx0fSwgdGFyZ2V0V2luZG93KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZSh0YXJnZXQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldCwgJ3RyYW5zaXRpb25ydW4nLCBlID0+IHtcblx0XHRcdGlmIChlLnByb3BlcnR5TmFtZSA9PT0gJ2dyaWQtdGVtcGxhdGUtcm93cycpIHtcblx0XHRcdFx0dGhpcy5zdGF0ZS5zdGFydFRyYW5zaXRpb24oKTtcblx0XHRcdFx0dGhpcy5zY2hlZHVsZUZyYW1lKHRhcmdldFdpbmRvdyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IGZpbmlzaFRyYW5zaXRpb24gPSAoZTogVHJhbnNpdGlvbkV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS5wcm9wZXJ0eU5hbWUgPT09ICdncmlkLXRlbXBsYXRlLXJvd3MnKSB7XG5cdFx0XHRcdHRoaXMuc3RhdGUuZW5kVHJhbnNpdGlvbigpO1xuXHRcdFx0XHR0aGlzLnNjaGVkdWxlRnJhbWUodGFyZ2V0V2luZG93KTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0LCAndHJhbnNpdGlvbmVuZCcsIGZpbmlzaFRyYW5zaXRpb24pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldCwgJ3RyYW5zaXRpb25jYW5jZWwnLCBmaW5pc2hUcmFuc2l0aW9uKSk7XG5cblx0XHR0aGlzLnN0YXRlLnN0YXJ0KCk7XG5cdFx0dGhpcy5zY2hlZHVsZUZyYW1lKHRhcmdldFdpbmRvdyk7XG5cdH1cblxuXHRyZXN0b3JlU2Nyb2xsQW5jaG9yKCk6IHZvaWQge1xuXHRcdHRoaXMucmVzdG9yZVNjcm9sbFBvc2l0aW9uPy4oKTtcblx0fVxuXG5cdGNhbmNlbFNjcm9sbFJlc3RvcmF0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMucmVzdG9yZVNjcm9sbFBvc2l0aW9uID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBzY2hlZHVsZUZyYW1lKHRhcmdldFdpbmRvdzogV2luZG93KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucGVuZGluZ0ZyYW1lLnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5wZW5kaW5nRnJhbWUudmFsdWUgPSBkb20uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSh0YXJnZXRXaW5kb3csICgpID0+IHtcblx0XHRcdHRoaXMucGVuZGluZ0ZyYW1lLmNsZWFyKCk7XG5cdFx0XHR0aGlzLnJlc3RvcmVTY3JvbGxQb3NpdGlvbj8uKCk7XG5cdFx0XHR0aGlzLnN0YXRlLmFkdmFuY2VGcmFtZSgpO1xuXHRcdFx0aWYgKHRoaXMuc3RhdGUuaXNBY3RpdmUpIHtcblx0XHRcdFx0dGhpcy5zY2hlZHVsZUZyYW1lKHRhcmdldFdpbmRvdyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLm9uRGlkU2V0dGxlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdExpc3RXaWRnZXRPcHRpb25zIHtcblx0LyoqXG5cdCAqIE9wdGlvbnMgZm9yIHRoZSBsaXN0IGl0ZW0gcmVuZGVyZXIuXG5cdCAqL1xuXHRyZWFkb25seSByZW5kZXJlck9wdGlvbnM/OiBJQ2hhdExpc3RJdGVtUmVuZGVyZXJPcHRpb25zO1xuXG5cdC8qKlxuXHQgKiBEZWZhdWx0IGhlaWdodCBmb3IgbGlzdCBlbGVtZW50cy5cblx0ICovXG5cdHJlYWRvbmx5IGRlZmF1bHRFbGVtZW50SGVpZ2h0PzogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBET00gbm9kZSBmb3Igb3ZlcmZsb3cgd2lkZ2V0cyAoZS5nLiwgY29kZSBlZGl0b3JzKS5cblx0ICovXG5cdHJlYWRvbmx5IG92ZXJmbG93V2lkZ2V0c0RvbU5vZGU/OiBIVE1MRWxlbWVudDtcblxuXHQvKipcblx0ICogT3B0aW9uYWwgc3R5bGUgb3ZlcnJpZGVzIGZvciB0aGUgbGlzdC5cblx0ICovXG5cdHJlYWRvbmx5IHN0eWxlcz86IElDaGF0TGlzdFdpZGdldFN0eWxlcztcblxuXHQvKipcblx0ICogQ2FsbGJhY2sgdG8gZ2V0IHRoZSBjdXJyZW50IGNoYXQgbW9kZS5cblx0ICovXG5cdHJlYWRvbmx5IGN1cnJlbnRDaGF0TW9kZT86ICgpID0+IENoYXRNb2RlS2luZDtcblxuXHQvKipcblx0ICogVmlldyBJRCBmb3IgZWRpdG9yIG9wdGlvbnMgKHVzZWQgaW4gQ2hhdFdpZGdldCBjb250ZXh0KS5cblx0ICovXG5cdHJlYWRvbmx5IHZpZXdJZD86IHN0cmluZztcblxuXHQvKipcblx0ICogSW5wdXQgZWRpdG9yIGJhY2tncm91bmQgY29sb3Iga2V5LlxuXHQgKi9cblx0cmVhZG9ubHkgaW5wdXRFZGl0b3JCYWNrZ3JvdW5kPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBSZXN1bHQgZWRpdG9yIGJhY2tncm91bmQgY29sb3Iga2V5LlxuXHQgKi9cblx0cmVhZG9ubHkgcmVzdWx0RWRpdG9yQmFja2dyb3VuZD86IHN0cmluZztcblxuXHQvKipcblx0ICogT3B0aW9uYWwgZmlsdGVyIGZvciB0aGUgdHJlZS5cblx0ICovXG5cdHJlYWRvbmx5IGZpbHRlcj86IElUcmVlRmlsdGVyPENoYXRUcmVlSXRlbSwgRnV6enlTY29yZT47XG5cblx0LyoqXG5cdCAqIEluaXRpYWwgdmlldyBtb2RlbC5cblx0ICovXG5cdHJlYWRvbmx5IHZpZXdNb2RlbD86IElDaGF0Vmlld01vZGVsO1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBwcmUtY3JlYXRlZCBlZGl0b3Igb3B0aW9ucy5cblx0ICogSWYgcHJvdmlkZWQsIHRoZXNlIHdpbGwgYmUgdXNlZCBpbnN0ZWFkIG9mIGNyZWF0aW5nIG5ldyBvbmVzLlxuXHQgKi9cblx0cmVhZG9ubHkgZWRpdG9yT3B0aW9ucz86IENoYXRFZGl0b3JPcHRpb25zO1xuXG5cdC8qKlxuXHQgKiBUaGUgY2hhdCBsb2NhdGlvbiAoZm9yIHJlcnVuIHJlcXVlc3RzKS5cblx0ICovXG5cdHJlYWRvbmx5IGxvY2F0aW9uPzogQ2hhdEFnZW50TG9jYXRpb247XG5cblx0LyoqXG5cdCAqIENhbGxiYWNrIHRvIGdldCB0aGUgc2VsZWN0ZWQgbGFuZ3VhZ2UgbW9kZWwgcmVxdWVzdCBvcHRpb25zIChmb3IgcmVydW4gcmVxdWVzdHMpLlxuXHQgKi9cblx0cmVhZG9ubHkgZ2V0U2VsZWN0ZWRNb2RlbFJlcXVlc3RPcHRpb25zPzogKCkgPT4gUGljazxJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucywgJ3VzZXJTZWxlY3RlZE1vZGVsSWQnIHwgJ3VzZXJTZWxlY3RlZE1vZGVsQ29uZmlndXJhdGlvbic+O1xuXG5cdC8qKlxuXHQgKiBDYWxsYmFjayB0byBnZXQgY3VycmVudCBtb2RlIGluZm8gKGZvciByZXJ1biByZXF1ZXN0cykuXG5cdCAqL1xuXHRyZWFkb25seSBnZXRDdXJyZW50TW9kZUluZm8/OiAoKSA9PiBJQ2hhdFJlcXVlc3RNb2RlSW5mbyB8IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBBIHJldXNhYmxlIHdpZGdldCB0aGF0IGVuY2Fwc3VsYXRlcyBjaGF0IGxpc3QvdHJlZSByZW5kZXJpbmcuXG4gKiBUaGlzIGNhbiBiZSB1c2VkIGluIHZhcmlvdXMgY29udGV4dHMgc3VjaCBhcyB0aGUgbWFpbiBjaGF0IHdpZGdldCxcbiAqIGhvdmVyIHByZXZpZXdzLCBldGMuXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGF0TGlzdFdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdC8vI3JlZ2lvbiBFdmVudHNcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNjcm9sbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFNjcm9sbEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRTY3JvbGw6IEV2ZW50PFNjcm9sbEV2ZW50PiA9IHRoaXMuX29uRGlkU2Nyb2xsLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudEhlaWdodCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2tGb2xsb3d1cCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDaGF0Rm9sbG93dXA+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsaWNrRm9sbG93dXA6IEV2ZW50PElDaGF0Rm9sbG93dXA+ID0gdGhpcy5fb25EaWRDbGlja0ZvbGxvd3VwLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRm9jdXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRGb2N1czogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZEZvY3VzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSXRlbUhlaWdodCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgZWxlbWVudDogQ2hhdFRyZWVJdGVtOyBoZWlnaHQ6IG51bWJlciB9PigpKTtcblx0LyoqIEV2ZW50IGZpcmVkIHdoZW4gYW4gaXRlbSdzIGhlaWdodCBjaGFuZ2VzLiBVc2VkIGZvciBkeW5hbWljIGxheW91dCBtb2RlLiAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUl0ZW1IZWlnaHQ6IEV2ZW50PHsgZWxlbWVudDogQ2hhdFRyZWVJdGVtOyBoZWlnaHQ6IG51bWJlciB9PiA9IHRoaXMuX29uRGlkQ2hhbmdlSXRlbUhlaWdodC5ldmVudDtcblxuXHQvKipcblx0ICogRXZlbnQgZmlyZWQgd2hlbiBhIHJlcXVlc3QgaXRlbSBpcyBjbGlja2VkLlxuXHQgKi9cblx0Z2V0IG9uRGlkQ2xpY2tSZXF1ZXN0KCk6IEV2ZW50PElDaGF0TGlzdEl0ZW1UZW1wbGF0ZT4ge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlci5vbkRpZENsaWNrUmVxdWVzdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBFdmVudCBmaXJlZCB3aGVuIGFuIGl0ZW0gaXMgcmUtcmVuZGVyZWQuXG5cdCAqL1xuXHRnZXQgb25EaWRSZXJlbmRlcigpOiBFdmVudDxJQ2hhdExpc3RJdGVtVGVtcGxhdGU+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZXIub25EaWRSZXJlbmRlcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBFdmVudCBmaXJlZCB3aGVuIGEgdGVtcGxhdGUgaXMgZGlzcG9zZWQuXG5cdCAqL1xuXHRnZXQgb25EaWREaXNwb3NlKCk6IEV2ZW50PElDaGF0TGlzdEl0ZW1UZW1wbGF0ZT4ge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlci5vbkRpZERpc3Bvc2U7XG5cdH1cblxuXHQvKipcblx0ICogRXZlbnQgZmlyZWQgd2hlbiBmb2N1cyBtb3ZlcyBvdXRzaWRlIHRoZSBlZGl0aW5nIGFyZWEuXG5cdCAqL1xuXHRnZXQgb25EaWRGb2N1c091dHNpZGUoKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlci5vbkRpZEZvY3VzT3V0c2lkZTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBQcml2YXRlIGZpZWxkc1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyZWU6IFdvcmtiZW5jaE9iamVjdFRyZWU8Q2hhdFRyZWVJdGVtLCBGdXp6eVNjb3JlPjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVsZWdhdGU6IENoYXRMaXN0RGVsZWdhdGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlcmVyOiBDaGF0TGlzdEl0ZW1SZW5kZXJlcjtcblxuXHRwcml2YXRlIF92aWV3TW9kZWw6IElDaGF0Vmlld01vZGVsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF92aXNpYmxlID0gdHJ1ZTtcblx0cHJpdmF0ZSBfbGFzdEl0ZW06IENoYXRUcmVlSXRlbSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbW9zdFJlY2VudGx5Rm9jdXNlZEl0ZW1JbmRleDogbnVtYmVyID0gLTE7XG5cdHByaXZhdGUgX3Njcm9sbExvY2s6IGJvb2xlYW4gPSB0cnVlO1xuXHRwcml2YXRlIF9hdXRvU2Nyb2xsSG9sZHMgPSBuZXcgQXV0b1Njcm9sbEhvbGRzKCk7XG5cdHByaXZhdGUgX3NldHRpbmdDaGFuZ2VDb3VudGVyOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF92aXNpYmxlQ2hhbmdlQ291bnQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VzZXJUb2dnbGVSZXNpemVUcmFja2VycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPENoYXRUcmVlSXRlbSwgVXNlclRvZ2dsZVJlc2l6ZVRyYWNrZXI+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Njcm9sbERvd25CdXR0b246IEJ1dHRvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfbGFzdEl0ZW1JZENvbnRleHRLZXk6IElDb250ZXh0S2V5PHN0cmluZ1tdPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2dldFNlbGVjdGVkTW9kZWxSZXF1ZXN0T3B0aW9uczogKCgpID0+IFBpY2s8SUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMsICd1c2VyU2VsZWN0ZWRNb2RlbElkJyB8ICd1c2VyU2VsZWN0ZWRNb2RlbENvbmZpZ3VyYXRpb24nPikgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2dldEN1cnJlbnRNb2RlSW5mbzogKCgpID0+IElDaGF0UmVxdWVzdE1vZGVJbmZvIHwgdW5kZWZpbmVkKSB8IHVuZGVmaW5lZDtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gUHJvcGVydGllc1xuXG5cdGdldCBkb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGFpbmVyO1xuXHR9XG5cblx0Z2V0IHNjcm9sbFRvcCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl90cmVlLnNjcm9sbFRvcDtcblx0fVxuXG5cdHNldCBzY3JvbGxUb3AodmFsdWU6IG51bWJlcikge1xuXHRcdHRoaXMuX3RyZWUuc2Nyb2xsVG9wID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgc2Nyb2xsSGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWUuc2Nyb2xsSGVpZ2h0O1xuXHR9XG5cblx0Z2V0IHJlbmRlckhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl90cmVlLnJlbmRlckhlaWdodDtcblx0fVxuXG5cdGdldCBjb250ZW50SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWUuY29udGVudEhlaWdodDtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBsaXN0IGlzIHNjcm9sbGVkIHRvIHRoZSBib3R0b20uXG5cdCAqL1xuXHRnZXQgaXNTY3JvbGxlZFRvQm90dG9tKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl90cmVlLnNjcm9sbFRvcCArIHRoaXMuX3RyZWUucmVuZGVySGVpZ2h0ID49IHRoaXMuX3RyZWUuc2Nyb2xsSGVpZ2h0IC0gMjtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgbGFzdCBpdGVtIGluIHRoZSBsaXN0LlxuXHQgKi9cblx0Z2V0IGxhc3RJdGVtKCk6IENoYXRUcmVlSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhc3RJdGVtO1xuXHR9XG5cblxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0b3B0aW9uczogSUNoYXRMaXN0V2lkZ2V0T3B0aW9ucyxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZTogSUNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3ZpZXdNb2RlbCA9IG9wdGlvbnMudmlld01vZGVsO1xuXHRcdHRoaXMuX2xvY2F0aW9uID0gb3B0aW9ucy5sb2NhdGlvbjtcblx0XHR0aGlzLl9nZXRTZWxlY3RlZE1vZGVsUmVxdWVzdE9wdGlvbnMgPSBvcHRpb25zLmdldFNlbGVjdGVkTW9kZWxSZXF1ZXN0T3B0aW9ucztcblx0XHR0aGlzLl9nZXRDdXJyZW50TW9kZUluZm8gPSBvcHRpb25zLmdldEN1cnJlbnRNb2RlSW5mbztcblx0XHR0aGlzLl9sYXN0SXRlbUlkQ29udGV4dEtleSA9IENoYXRDb250ZXh0S2V5cy5sYXN0SXRlbUlkLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jb250YWluZXIgPSBjb250YWluZXI7XG5cblx0XHQvLyBUb2dnbGUgbGluay1zdHlsZSBmb3IgaW5saW5lIHJlZmVyZW5jZSB3aWRnZXRzIGJhc2VkIG9uIGNvbmZpZ3VyYXRpb24gKHNpbmdsZSBsaXN0ZW5lciBmb3IgYWxsIHdpZGdldHMpXG5cdFx0Y29uc3QgdXBkYXRlSW5saW5lUmVmZXJlbmNlc1N0eWxlID0gKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3R5bGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oQ2hhdENvbmZpZ3VyYXRpb24uSW5saW5lUmVmZXJlbmNlc1N0eWxlKTtcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LWlubGluZS1yZWZlcmVuY2VzLWxpbmstc3R5bGUnLCBzdHlsZSA9PT0gJ2xpbmsnKTtcblx0XHR9O1xuXHRcdHVwZGF0ZUlubGluZVJlZmVyZW5jZXNTdHlsZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uSW5saW5lUmVmZXJlbmNlc1N0eWxlKSkge1xuXHRcdFx0XHR1cGRhdGVJbmxpbmVSZWZlcmVuY2VzU3R5bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQoXG5cdFx0XHRuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5jb250ZXh0S2V5U2VydmljZV0pXG5cdFx0KSk7XG5cblx0XHQvLyBDcmVhdGUgb3ZlcmZsb3cgd2lkZ2V0cyBjb250YWluZXJcblx0XHRjb25zdCBvdmVyZmxvd1dpZGdldHNDb250YWluZXIgPSBvcHRpb25zLm92ZXJmbG93V2lkZ2V0c0RvbU5vZGUgPz8gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0aWYgKCFvcHRpb25zLm92ZXJmbG93V2lkZ2V0c0RvbU5vZGUpIHtcblx0XHRcdG92ZXJmbG93V2lkZ2V0c0NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LW92ZXJmbG93LXdpZGdldC1jb250YWluZXInLCAnbW9uYWNvLWVkaXRvcicpO1xuXHRcdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZChvdmVyZmxvd1dpZGdldHNDb250YWluZXIpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IG92ZXJmbG93V2lkZ2V0c0NvbnRhaW5lci5yZW1vdmUoKSkpO1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBlZGl0b3Igb3B0aW9ucyAodXNlIHByb3ZpZGVkIG9yIGNyZWF0ZSBuZXcpXG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9ucyA9IG9wdGlvbnMuZWRpdG9yT3B0aW9ucyA/PyB0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRFZGl0b3JPcHRpb25zLFxuXHRcdFx0b3B0aW9ucy52aWV3SWQsXG5cdFx0XHQnZm9yZWdyb3VuZCcsXG5cdFx0XHRvcHRpb25zLmlucHV0RWRpdG9yQmFja2dyb3VuZCA/PyAnY2hhdC5yZXF1ZXN0RWRpdG9yLmJhY2tncm91bmQnLFxuXHRcdFx0b3B0aW9ucy5yZXN1bHRFZGl0b3JCYWNrZ3JvdW5kID8/ICdjaGF0LnJlc3BvbnNlRWRpdG9yLmJhY2tncm91bmQnXG5cdFx0KSk7XG5cblx0XHQvLyBDcmVhdGUgZGVsZWdhdGVcblx0XHR0aGlzLl9kZWxlZ2F0ZSA9IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdExpc3REZWxlZ2F0ZSxcblx0XHRcdG9wdGlvbnMuZGVmYXVsdEVsZW1lbnRIZWlnaHQgPz8gMjAwXG5cdFx0KTtcblxuXHRcdC8vIENyZWF0ZSByZW5kZXJlciBkZWxlZ2F0ZVxuXHRcdGNvbnN0IHJlbmRlcmVyRGVsZWdhdGU6IElDaGF0UmVuZGVyZXJEZWxlZ2F0ZSA9IHtcblx0XHRcdGdldExpc3RMZW5ndGg6ICgpID0+IHRoaXMuX3RyZWUuZ2V0Tm9kZShudWxsKS52aXNpYmxlQ2hpbGRyZW5Db3VudCxcblx0XHRcdG9uRGlkU2Nyb2xsOiB0aGlzLm9uRGlkU2Nyb2xsLFxuXHRcdFx0Y29udGFpbmVyOiB0aGlzLl9jb250YWluZXIsXG5cdFx0XHRjdXJyZW50Q2hhdE1vZGU6IG9wdGlvbnMuY3VycmVudENoYXRNb2RlID8/ICgoKSA9PiBDaGF0TW9kZUtpbmQuQXNrKSxcblx0XHR9O1xuXG5cdFx0Ly8gQ3JlYXRlIHJlbmRlcmVyXG5cdFx0dGhpcy5fcmVuZGVyZXIgPSB0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRMaXN0SXRlbVJlbmRlcmVyLFxuXHRcdFx0ZWRpdG9yT3B0aW9ucyxcblx0XHRcdG9wdGlvbnMucmVuZGVyZXJPcHRpb25zID8/IHt9LFxuXHRcdFx0cmVuZGVyZXJEZWxlZ2F0ZSxcblx0XHRcdG92ZXJmbG93V2lkZ2V0c0NvbnRhaW5lcixcblx0XHRcdHRoaXMuX3ZpZXdNb2RlbCxcblx0XHQpKTtcblxuXHRcdC8vIFdpcmUgdXAgcmVuZGVyZXIgZXZlbnRzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVuZGVyZXIub25EaWRDbGlja0ZvbGxvd3VwKGl0ZW0gPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDbGlja0ZvbGxvd3VwLmZpcmUoaXRlbSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVuZGVyZXIub25EaWRDaGFuZ2VJdGVtSGVpZ2h0KGUgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlRWxlbWVudEhlaWdodChlLmVsZW1lbnQsIGUuaGVpZ2h0KTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbUhlaWdodC5maXJlKGUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEhhbmRsZSByZXJ1biB3aXRoIGFnZW50IG9yIGNvbW1hbmQgZGV0ZWN0aW9uIGludGVybmFsbHlcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZW5kZXJlci5vbkRpZENsaWNrUmVydW5XaXRoQWdlbnRPckNvbW1hbmREZXRlY3Rpb24oZSA9PiB7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKGUuc2Vzc2lvblJlc291cmNlKT8uZ2V0UmVxdWVzdHMoKS5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuaWQgPT09IGUucmVxdWVzdElkKTtcblx0XHRcdGlmIChyZXF1ZXN0KSB7XG5cdFx0XHRcdGNvbnN0IHNlbmRPcHRpb25zOiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucyA9IHtcblx0XHRcdFx0XHRub0NvbW1hbmREZXRlY3Rpb246IHRydWUsXG5cdFx0XHRcdFx0YXR0ZW1wdDogcmVxdWVzdC5hdHRlbXB0ICsgMSxcblx0XHRcdFx0XHRsb2NhdGlvbjogdGhpcy5fbG9jYXRpb24sXG5cdFx0XHRcdFx0Li4udGhpcy5fZ2V0U2VsZWN0ZWRNb2RlbFJlcXVlc3RPcHRpb25zPy4oKSxcblx0XHRcdFx0XHRtb2RlSW5mbzogdGhpcy5fZ2V0Q3VycmVudE1vZGVJbmZvPy4oKSxcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy5jaGF0QWNjZXNzaWJpbGl0eVNlcnZpY2UuYWNjZXB0UmVxdWVzdChlLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuY2hhdFNlcnZpY2UucmVzZW5kUmVxdWVzdChyZXF1ZXN0LCBzZW5kT3B0aW9ucykuY2F0Y2goZSA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZBSUxFRCB0byByZXJ1biByZXF1ZXN0JywgZSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIENyZWF0ZSBkcmFnLWFuZC1kcm9wIGNvbnRyb2xsZXIgZm9yIHJlb3JkZXJpbmcgcGVuZGluZyByZXF1ZXN0c1xuXHRcdHRoaXMuX3JlbmRlcmVyLnBlbmRpbmdEcmFnQ29udHJvbGxlciA9IHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0c2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFBlbmRpbmdEcmFnQ29udHJvbGxlciwgdGhpcy5fY29udGFpbmVyLCAoKSA9PiB0aGlzLl92aWV3TW9kZWwpXG5cdFx0KTtcblxuXHRcdC8vIENyZWF0ZSB0cmVlXG5cdFx0Y29uc3Qgc3R5bGVzID0gb3B0aW9ucy5zdHlsZXMgPz8ge307XG5cdFx0dGhpcy5fdHJlZSA9IHRoaXMuX3JlZ2lzdGVyKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoT2JqZWN0VHJlZTxDaGF0VHJlZUl0ZW0sIEZ1enp5U2NvcmU+LFxuXHRcdFx0J0NoYXRMaXN0Jyxcblx0XHRcdHRoaXMuX2NvbnRhaW5lcixcblx0XHRcdHRoaXMuX2RlbGVnYXRlLFxuXHRcdFx0W3RoaXMuX3JlbmRlcmVyXSxcblx0XHRcdHtcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjogeyBnZXRJZDogKGU6IENoYXRUcmVlSXRlbSkgPT4gZS5pZCB9LFxuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlLFxuXHRcdFx0XHRzdXBwb3J0RHluYW1pY0hlaWdodHM6IHRydWUsXG5cdFx0XHRcdGhpZGVUd2lzdGllc09mQ2hpbGRsZXNzRWxlbWVudHM6IHRydWUsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0QWNjZXNzaWJpbGl0eVByb3ZpZGVyKSxcblx0XHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsOiAoZTogQ2hhdFRyZWVJdGVtKSA9PlxuXHRcdFx0XHRcdFx0aXNSZXF1ZXN0Vk0oZSkgPyBlLm1lc3NhZ2UgOiBpc1Jlc3BvbnNlVk0oZSkgPyBlLnJlc3BvbnNlLnZhbHVlIDogJydcblx0XHRcdFx0fSxcblx0XHRcdFx0c2V0Um93TGluZUhlaWdodDogZmFsc2UsXG5cdFx0XHRcdHNjcm9sbFRvQWN0aXZlRWxlbWVudDogdHJ1ZSxcblx0XHRcdFx0ZmlsdGVyOiBvcHRpb25zLmZpbHRlcixcblx0XHRcdFx0b3ZlcnJpZGVTdHlsZXM6IHtcblx0XHRcdFx0XHRsaXN0Rm9jdXNCYWNrZ3JvdW5kOiBzdHlsZXMubGlzdEJhY2tncm91bmQsXG5cdFx0XHRcdFx0bGlzdEluYWN0aXZlRm9jdXNCYWNrZ3JvdW5kOiBzdHlsZXMubGlzdEJhY2tncm91bmQsXG5cdFx0XHRcdFx0bGlzdEFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQ6IHN0eWxlcy5saXN0QmFja2dyb3VuZCxcblx0XHRcdFx0XHRsaXN0Rm9jdXNBbmRTZWxlY3Rpb25CYWNrZ3JvdW5kOiBzdHlsZXMubGlzdEJhY2tncm91bmQsXG5cdFx0XHRcdFx0bGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZDogc3R5bGVzLmxpc3RCYWNrZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RIb3ZlckJhY2tncm91bmQ6IHN0eWxlcy5saXN0QmFja2dyb3VuZCxcblx0XHRcdFx0XHRsaXN0QmFja2dyb3VuZDogc3R5bGVzLmxpc3RCYWNrZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RGb2N1c0ZvcmVncm91bmQ6IHN0eWxlcy5saXN0Rm9yZWdyb3VuZCxcblx0XHRcdFx0XHRsaXN0SG92ZXJGb3JlZ3JvdW5kOiBzdHlsZXMubGlzdEZvcmVncm91bmQsXG5cdFx0XHRcdFx0bGlzdEluYWN0aXZlRm9jdXNGb3JlZ3JvdW5kOiBzdHlsZXMubGlzdEZvcmVncm91bmQsXG5cdFx0XHRcdFx0bGlzdEluYWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZDogc3R5bGVzLmxpc3RGb3JlZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RBY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kOiBzdHlsZXMubGlzdEZvcmVncm91bmQsXG5cdFx0XHRcdFx0bGlzdEZvY3VzQW5kU2VsZWN0aW9uRm9yZWdyb3VuZDogc3R5bGVzLmxpc3RGb3JlZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RBY3RpdmVTZWxlY3Rpb25JY29uRm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkljb25Gb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdC8vIENyZWF0ZSBzY3JvbGwtZG93biBidXR0b25cblx0XHRjb25zdCBzY3JvbGxUb0JvdHRvbUxhYmVsID0gbG9jYWxpemUoJ2NoYXQuc2Nyb2xsVG9Cb3R0b20nLCBcIlNjcm9sbCB0byBCb3R0b21cIik7XG5cdFx0Y29uc3Qgc2Nyb2xsVG9Cb3R0b21CYWNrZ3JvdW5kID0gYXNDc3NWYXJpYWJsZVdpdGhEZWZhdWx0KCdjaGF0Lmxpc3QuYmFja2dyb3VuZCcsIGFzQ3NzVmFyaWFibGUoYnV0dG9uU2Vjb25kYXJ5QmFja2dyb3VuZCkpO1xuXHRcdHRoaXMuX3Njcm9sbERvd25CdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKHRoaXMuX2NvbnRhaW5lciwge1xuXHRcdFx0dGl0bGU6IHNjcm9sbFRvQm90dG9tTGFiZWwsXG5cdFx0XHRhcmlhTGFiZWw6IHNjcm9sbFRvQm90dG9tTGFiZWwsXG5cdFx0XHRidXR0b25CYWNrZ3JvdW5kOiBzY3JvbGxUb0JvdHRvbUJhY2tncm91bmQsXG5cdFx0XHRidXR0b25Gb3JlZ3JvdW5kOiBhc0Nzc1ZhcmlhYmxlKGJ1dHRvblNlY29uZGFyeUZvcmVncm91bmQpLFxuXHRcdFx0YnV0dG9uSG92ZXJCYWNrZ3JvdW5kOiBzY3JvbGxUb0JvdHRvbUJhY2tncm91bmQsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlGb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlIb3ZlckJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvblNlcGFyYXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdH0pKTtcblx0XHR0aGlzLl9zY3JvbGxEb3duQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1zY3JvbGwtZG93bicpO1xuXHRcdHRoaXMuX3Njcm9sbERvd25CdXR0b24ubGFiZWwgPSBgJCgke0NvZGljb24uY2hldnJvbkRvd24uaWR9KWA7XG5cdFx0dGhpcy5fc2Nyb2xsRG93bkJ1dHRvbi5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IC8vIEhpZGRlbiBieSBkZWZhdWx0XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zY3JvbGxEb3duQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0dGhpcy5jYW5jZWxVc2VyVG9nZ2xlU2Nyb2xsUmVzdG9yYXRpb24oKTtcblx0XHRcdHRoaXMuc2V0U2Nyb2xsTG9jayh0cnVlKTtcblx0XHRcdHRoaXMuc2Nyb2xsVG9FbmQoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBXaXJlIHVwIHRyZWUgZXZlbnRzXG5cblx0XHQvLyBIYW5kbGUgY29udGVudCBoZWlnaHQgY2hhbmdlcyAoZmlyZXMgaGlnaC1sZXZlbCBldmVudCwgaW50ZXJuYWwgc2Nyb2xsIGhhbmRsaW5nKVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RyZWUub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudEhlaWdodC5maXJlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdHJlZS5vbkRpZEZvY3VzKCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkRm9jdXMuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEhhbmRsZSBmb2N1cyBjaGFuZ2VzIGludGVybmFsbHkgKHVwZGF0ZSBtb3N0UmVjZW50bHlGb2N1c2VkSXRlbUluZGV4KVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RyZWUub25EaWRDaGFuZ2VGb2N1cygoKSA9PiB7XG5cdFx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5nZXRGb2N1cygpO1xuXHRcdFx0aWYgKGZvY3VzZWQgJiYgZm9jdXNlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGZvY3VzZWRJdGVtID0gZm9jdXNlZFswXTtcblx0XHRcdFx0Y29uc3QgaXRlbXMgPSB0aGlzLmdldEl0ZW1zKCk7XG5cdFx0XHRcdGNvbnN0IGlkeCA9IGl0ZW1zLmZpbmRJbmRleChpID0+IGkgPT09IGZvY3VzZWRJdGVtKTtcblx0XHRcdFx0aWYgKGlkeCAhPT0gLTEpIHtcblx0XHRcdFx0XHR0aGlzLl9tb3N0UmVjZW50bHlGb2N1c2VkSXRlbUluZGV4ID0gaWR4O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSGFuZGxlIHNjcm9sbCBldmVudHMgKGZpcmUgcHVibGljIGV2ZW50IGFuZCBtYW5hZ2Ugc2Nyb2xsLWRvd24gYnV0dG9uKVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RyZWUub25EaWRTY3JvbGwoKGUpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkU2Nyb2xsLmZpcmUoZSk7XG5cdFx0XHR0aGlzLnVwZGF0ZVNjcm9sbERvd25CdXR0b25WaXNpYmlsaXR5KCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU2V0IGluaXRpYWwgYXQtYm90dG9tIHN0YXRlIChzY3JvbGxMb2NrIGRlZmF1bHRzIHRvIHRydWUpXG5cdFx0dGhpcy51cGRhdGVTY3JvbGxEb3duQnV0dG9uVmlzaWJpbGl0eSgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9jb250YWluZXIsIENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0LnVzZXJUb2dnbGVFdmVudCwgZSA9PiB7XG5cdFx0XHRpZiAoIWRvbS5pc0hUTUxFbGVtZW50KGUudGFyZ2V0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLl9yZW5kZXJlci5nZXRFbGVtZW50RnJvbU5vZGUoZS50YXJnZXQpO1xuXHRcdFx0aWYgKGVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy50cmFja1VzZXJUb2dnbGVSZXNpemUoZWxlbWVudCwgZS50YXJnZXQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2NvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5XSEVFTCwgKCkgPT4gdGhpcy5jYW5jZWxVc2VyVG9nZ2xlU2Nyb2xsUmVzdG9yYXRpb24oKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fY29udGFpbmVyLCBkb20uRXZlbnRUeXBlLlBPSU5URVJfRE9XTiwgKCkgPT4gdGhpcy5jYW5jZWxVc2VyVG9nZ2xlU2Nyb2xsUmVzdG9yYXRpb24oKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fY29udGFpbmVyLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGNvbnN0IGtleUNvZGUgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpLmtleUNvZGU7XG5cdFx0XHRpZiAoa2V5Q29kZSA9PT0gS2V5Q29kZS5VcEFycm93XG5cdFx0XHRcdHx8IGtleUNvZGUgPT09IEtleUNvZGUuRG93bkFycm93XG5cdFx0XHRcdHx8IGtleUNvZGUgPT09IEtleUNvZGUuUGFnZVVwXG5cdFx0XHRcdHx8IGtleUNvZGUgPT09IEtleUNvZGUuUGFnZURvd25cblx0XHRcdFx0fHwga2V5Q29kZSA9PT0gS2V5Q29kZS5Ib21lXG5cdFx0XHRcdHx8IGtleUNvZGUgPT09IEtleUNvZGUuRW5kKSB7XG5cdFx0XHRcdHRoaXMuY2FuY2VsVXNlclRvZ2dsZVNjcm9sbFJlc3RvcmF0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSwgdHJ1ZSkpO1xuXG5cdFx0Ly8gSGFuZGxlIGNvbnRleHQgbWVudSBpbnRlcm5hbGx5XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdHJlZS5vbkNvbnRleHRNZW51KGUgPT4ge1xuXHRcdFx0dGhpcy5oYW5kbGVDb250ZXh0TWVudShlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2NvbnRhaW5lciwgJ2NvcHknLCBlID0+IHRoaXMuaGFuZGxlQ29weShlKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGUpID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkVkaXRSZXF1ZXN0cylcblx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5DaGVja3BvaW50c0VuYWJsZWQpXG5cdFx0XHRcdHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uUmljaExpbmtzKSkge1xuXHRcdFx0XHR0aGlzLl9zZXR0aW5nQ2hhbmdlQ291bnRlcisrO1xuXHRcdFx0XHR0aGlzLnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvLyNyZWdpb24gSW50ZXJuYWwgZXZlbnQgaGFuZGxlcnNcblxuXHQvKipcblx0ICogUmV3cml0ZXMgdGhlIHJpY2gtdGV4dCBmbGF2b3Igb2YgYSBjb3BpZWQgc2VsZWN0aW9uIHNvIGxpbmtzIHRoYXQgb25seSByZXNvbHZlIGhlcmVcblx0ICogZG9uJ3QgcGFzdGUgYXMgYHZzY29kZS1maWxlOmAgdGFyZ2V0cyBvciBsb2NhbCBwYXRocy4gU2VsZWN0aW9ucyB3aG9zZSBsaW5rcyBhbGwgcmVzb2x2ZVxuXHQgKiBlbHNld2hlcmUgYXJlIGxlZnQgdG8gdGhlIGJyb3dzZXIsIHdoaWNoIGtlZXBzIHRoZSBzdHlsaW5nIG90aGVyIGFwcHMgcmVseSBvbi5cblx0ICovXG5cdHByaXZhdGUgaGFuZGxlQ29weShlOiBDbGlwYm9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGRvbS5nZXRXaW5kb3codGhpcy5fY29udGFpbmVyKS5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoIXNlbGVjdGlvbiB8fCBzZWxlY3Rpb24uaXNDb2xsYXBzZWQgfHwgc2VsZWN0aW9uLnJhbmdlQ291bnQgPT09IDAgfHwgIWUuY2xpcGJvYXJkRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENsb25pbmcgYSByYW5nZSBuZXZlciB5aWVsZHMgdGhlIGFuY2hvcnMgYXJvdW5kIGl0LCBzbyBhc2sgdGhlIHNlbGVjdGlvbiB3aGF0IGl0XG5cdFx0Ly8gdG91Y2hlczogb3RoZXJ3aXNlIGEgc2VsZWN0aW9uIGluc2lkZSBhIGxpbmsgbG9va3MgY2xlYW4gd2hpbGUgdGhlIGJyb3dzZXIgc3RpbGxcblx0XHQvLyBjb3BpZXMgdGhlIGVuY2xvc2luZyBhbmNob3IuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgdG91Y2hlZCA9IEFycmF5LmZyb20odGhpcy5fY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJ2EsIGltZycpKVxuXHRcdFx0LmZpbHRlcihlbGVtZW50ID0+IHNlbGVjdGlvbi5jb250YWluc05vZGUoZWxlbWVudCwgdHJ1ZSkpO1xuXHRcdGlmICghdG91Y2hlZC5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByYW5nZXM6IFJhbmdlW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNlbGVjdGlvbi5yYW5nZUNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IHJhbmdlID0gc2VsZWN0aW9uLmdldFJhbmdlQXQoaSk7XG5cdFx0XHRpZiAoIWRvbS5pc0FuY2VzdG9yKHJhbmdlLmNvbW1vbkFuY2VzdG9yQ29udGFpbmVyLCB0aGlzLl9jb250YWluZXIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHJhbmdlcy5wdXNoKHJhbmdlKTtcblx0XHR9XG5cblx0XHRjb25zdCBmcmFnbWVudHMgPSByYW5nZXMubWFwKHJhbmdlID0+IHRoaXMuY2xvbmVTZWxlY3RlZENvbnRlbnRzKHJhbmdlKSk7XG5cdFx0aWYgKCFmcmFnbWVudHMubWFwKGZyYWdtZW50ID0+IHNhbml0aXplQ2hhdENsaXBib2FyZEZyYWdtZW50KGZyYWdtZW50KSkuc29tZShCb29sZWFuKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhvbGRlciA9IGRvbS4kKCdkaXYnKTtcblx0XHRmb3IgKGNvbnN0IGZyYWdtZW50IG9mIGZyYWdtZW50cykge1xuXHRcdFx0aG9sZGVyLmFwcGVuZENoaWxkKGZyYWdtZW50KTtcblx0XHR9XG5cblx0XHRlLmNsaXBib2FyZERhdGEuc2V0RGF0YShNaW1lcy50ZXh0LCBzZWxlY3Rpb24udG9TdHJpbmcoKSk7XG5cdFx0ZS5jbGlwYm9hcmREYXRhLnNldERhdGEoTWltZXMuaHRtbCwgaG9sZGVyLmlubmVySFRNTCk7XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENsb25lcyBhIHJhbmdlIGFsb25nIHdpdGggdGhlIGVsZW1lbnRzIGl0IHNpdHMgaW5zaWRlLiBgY2xvbmVDb250ZW50c2AgcmV0dXJucyBvbmx5IHdoYXRcblx0ICogbGllcyBiZXR3ZWVuIHRoZSByYW5nZSBib3VuZGFyaWVzLCB3aGljaCBkcm9wcyBib3RoIHRoZSBoZWFkaW5nIG9yIGxpc3QgaXRlbSBnaXZpbmcgdGhlXG5cdCAqIHRleHQgaXRzIHNoYXBlIGFuZCwgZm9yIGEgcGFydGx5IHNlbGVjdGVkIGxpbmssIHRoZSByZXN0IG9mIGl0cyBsYWJlbC5cblx0ICovXG5cdHByaXZhdGUgY2xvbmVTZWxlY3RlZENvbnRlbnRzKHJhbmdlOiBSYW5nZSk6IERvY3VtZW50RnJhZ21lbnQge1xuXHRcdGxldCBjb250ZW50OiBOb2RlID0gcmFuZ2UuY2xvbmVDb250ZW50cygpO1xuXG5cdFx0Zm9yIChcblx0XHRcdGxldCBhbmNlc3RvciA9IHJhbmdlLmNvbW1vbkFuY2VzdG9yQ29udGFpbmVyO1xuXHRcdFx0YW5jZXN0b3IgJiYgYW5jZXN0b3IgIT09IHRoaXMuX2NvbnRhaW5lcjtcblx0XHRcdGFuY2VzdG9yID0gYW5jZXN0b3IucGFyZW50Tm9kZSBhcyBOb2RlXG5cdFx0KSB7XG5cdFx0XHRpZiAoIWRvbS5pc0hUTUxFbGVtZW50KGFuY2VzdG9yKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQSBsaW5rIGlzIG9uZSB1bml0OiBzZWxlY3RpbmcgcGFydCBvZiBgZm9vLnRzOjQyYCBzaG91bGQgc3RpbGwgY29weSB0aGUgd2hvbGVcblx0XHRcdC8vIHJlZmVyZW5jZSByYXRoZXIgdGhhbiBhIGZyYWdtZW50IG9mIGl0cyBsYWJlbC5cblx0XHRcdGlmIChhbmNlc3Rvci50YWdOYW1lID09PSAnQScpIHtcblx0XHRcdFx0Y29udGVudCA9IGFuY2VzdG9yLmNsb25lTm9kZSh0cnVlKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdyYXBwZXIgPSBhbmNlc3Rvci5jbG9uZU5vZGUoZmFsc2UpO1xuXHRcdFx0d3JhcHBlci5hcHBlbmRDaGlsZChjb250ZW50KTtcblx0XHRcdGNvbnRlbnQgPSB3cmFwcGVyO1xuXHRcdH1cblxuXHRcdGlmIChjb250ZW50Lm5vZGVUeXBlID09PSBOb2RlLkRPQ1VNRU5UX0ZSQUdNRU5UX05PREUpIHtcblx0XHRcdHJldHVybiBjb250ZW50IGFzIERvY3VtZW50RnJhZ21lbnQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZnJhZ21lbnQgPSB0aGlzLl9jb250YWluZXIub3duZXJEb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG5cdFx0ZnJhZ21lbnQuYXBwZW5kQ2hpbGQoY29udGVudCk7XG5cdFx0cmV0dXJuIGZyYWdtZW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZSBzY3JvbGwtZG93biBidXR0b24gdmlzaWJpbGl0eSBiYXNlZCBvbiBzY3JvbGwgcG9zaXRpb24gYW5kIHNjcm9sbCBsb2NrLlxuXHQgKi9cblx0cHJpdmF0ZSB1cGRhdGVTY3JvbGxEb3duQnV0dG9uVmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHRjb25zdCB7IHNob3dCdXR0b24sIGF0Qm90dG9tIH0gPSBjb21wdXRlU2Nyb2xsRG93blN0YXRlKHRoaXMuaXNTY3JvbGxlZFRvQm90dG9tLCB0aGlzLl9zY3JvbGxMb2NrKTtcblx0XHQvLyBVc2UgYW4gZXhwbGljaXQgYGZsZXhgICh0aGUgYC5tb25hY28tYnV0dG9uYCBkZWZhdWx0KSByYXRoZXIgdGhhbiAnJyB3aGVuIHNob3dpbmc6IHRoZVxuXHRcdC8vIHN0eWxlc2hlZXQgYXBwbGllcyBgZGlzcGxheTogbm9uZWAgdG8gYC5pbnRlcmFjdGl2ZS1zZXNzaW9uIC5jaGF0LXNjcm9sbC1kb3duYCwgc28gY2xlYXJpbmdcblx0XHQvLyB0aGUgaW5saW5lIHN0eWxlIHdvdWxkIGxldCB0aGF0IHJ1bGUgd2luIGFuZCBrZWVwIHRoZSBidXR0b24gaGlkZGVuLlxuXHRcdHRoaXMuX3Njcm9sbERvd25CdXR0b24uZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gc2hvd0J1dHRvbiA/ICdmbGV4JyA6ICdub25lJztcblx0XHR0aGlzLl9jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC1saXN0LWF0LWJvdHRvbScsIGF0Qm90dG9tKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGUgY29udGV4dCBtZW51IGV2ZW50cy5cblx0ICovXG5cdHByaXZhdGUgaGFuZGxlQ29udGV4dE1lbnUoZTogSVRyZWVDb250ZXh0TWVudUV2ZW50PENoYXRUcmVlSXRlbSB8IG51bGw+KTogdm9pZCB7XG5cdFx0ZS5icm93c2VyRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRlLmJyb3dzZXJFdmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblxuXHRcdGNvbnN0IHNlbGVjdGVkID0gZS5lbGVtZW50O1xuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIGNvbnRleHQgbWVudSB3YXMgb3BlbmVkIG9uIGEgS2FUZVggZWxlbWVudFxuXHRcdGNvbnN0IHRhcmdldCA9IGUuYnJvd3NlckV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcblx0XHRjb25zdCBpc0thdGV4RWxlbWVudCA9IHRhcmdldC5jbG9zZXN0KGAuJHtrYXRleENvbnRhaW5lckNsYXNzTmFtZX1gKSAhPT0gbnVsbDtcblxuXHRcdGNvbnN0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVPdmVybGF5KFtcblx0XHRcdFtDaGF0Q29udGV4dEtleXMuaXNSZXNwb25zZS5rZXksIGlzUmVzcG9uc2VWTShzZWxlY3RlZCldLFxuXHRcdFx0W0NoYXRDb250ZXh0S2V5cy5yZXNwb25zZUlzRmlsdGVyZWQua2V5LCBpc1Jlc3BvbnNlVk0oc2VsZWN0ZWQpICYmICEhc2VsZWN0ZWQuZXJyb3JEZXRhaWxzPy5yZXNwb25zZUlzRmlsdGVyZWRdLFxuXHRcdFx0W0NoYXRDb250ZXh0S2V5cy5pc0thdGV4TWF0aEVsZW1lbnQua2V5LCBpc0thdGV4RWxlbWVudF1cblx0XHRdKTtcblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0bWVudUlkOiBNZW51SWQuQ2hhdENvbnRleHQsXG5cdFx0XHRtZW51QWN0aW9uT3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9LFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiBzZWxlY3RlZCxcblx0XHR9KTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBWaWV3TW9kZWwgbWV0aG9kc1xuXG5cdC8qKlxuXHQgKiBTZXQgdGhlIHZpZXcgbW9kZWwgZm9yIHRoZSBsaXN0IHRvIHJlbmRlci5cblx0ICovXG5cdHNldFZpZXdNb2RlbCh2aWV3TW9kZWw6IElDaGF0Vmlld01vZGVsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlld01vZGVsID0gdmlld01vZGVsO1xuXHRcdHRoaXMuX3JlbmRlcmVyLnVwZGF0ZVZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlZnJlc2ggdGhlIGxpc3QgZnJvbSB0aGUgY3VycmVudCB2aWV3IG1vZGVsLlxuXHQgKiBVc2VzIGludGVybmFsIHN0YXRlIGZvciBkaWZmIGlkZW50aXR5IGNhbGN1bGF0aW9uLlxuXHQgKi9cblx0cmVmcmVzaCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3ZpZXdNb2RlbCkge1xuXHRcdFx0dGhpcy5fdHJlZS5zZXRDaGlsZHJlbihudWxsLCBbXSk7XG5cdFx0XHR0aGlzLl9sYXN0SXRlbSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2xhc3RJdGVtSWRDb250ZXh0S2V5LnNldChbXSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLl92aWV3TW9kZWwuZ2V0SXRlbXMoKTtcblx0XHR0aGlzLl9sYXN0SXRlbSA9IGl0ZW1zLmF0KC0xKTtcblx0XHR0aGlzLl9sYXN0SXRlbUlkQ29udGV4dEtleS5zZXQodGhpcy5fbGFzdEl0ZW0gPyBbdGhpcy5fbGFzdEl0ZW0uaWRdIDogW10pO1xuXG5cdFx0Y29uc3QgdHJlZUl0ZW1zOiBJVHJlZUVsZW1lbnQ8Q2hhdFRyZWVJdGVtPltdID0gaXRlbXMubWFwKGl0ZW0gPT4gKHtcblx0XHRcdGVsZW1lbnQ6IGl0ZW0sXG5cdFx0XHRjb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0Y29sbGFwc2libGU6IGZhbHNlLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGVkaXRpbmcgPSB0aGlzLl92aWV3TW9kZWwuZWRpdGluZztcblxuXHRcdHRoaXMuX3dpdGhQZXJzaXN0ZWRBdXRvU2Nyb2xsKCgpID0+IHtcblx0XHRcdHRoaXMuX3RyZWUuc2V0Q2hpbGRyZW4obnVsbCwgdHJlZUl0ZW1zLCB7XG5cdFx0XHRcdGRpZmZJZGVudGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0SWQ6IChlbGVtZW50KSA9PiB7XG5cdFx0XHRcdFx0XHQvLyBQZW5kaW5nIHR5cGVzIG9ubHkgaGF2ZSAnaWQnLCByZXF1ZXN0L3Jlc3BvbnNlIGhhdmUgJ2RhdGFJZCdcblx0XHRcdFx0XHRcdGNvbnN0IGJhc2VJZCA9IChpc1JlcXVlc3RWTShlbGVtZW50KSB8fCBpc1Jlc3BvbnNlVk0oZWxlbWVudCkpID8gZWxlbWVudC5kYXRhSWQgOiBlbGVtZW50LmlkO1xuXHRcdFx0XHRcdFx0Y29uc3QgZGlzYWJsZW1lbnQgPSAoaXNSZXF1ZXN0Vk0oZWxlbWVudCkgfHwgaXNSZXNwb25zZVZNKGVsZW1lbnQpKSA/IGVsZW1lbnQuc2hvdWxkQmVSZW1vdmVkT25TZW5kIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0Ly8gUGVyLWVsZW1lbnQgZWRpdGluZyBzdGF0ZTogb25seSByZS1yZW5kZXIgaXRlbXMgd2hvc2UgZWRpdGluZyByb2xlIGNoYW5nZWRcblx0XHRcdFx0XHRcdGNvbnN0IGlzRWRpdFRhcmdldCA9IGlzUmVxdWVzdFZNKGVsZW1lbnQpICYmIGVkaXRpbmc/LmlkID09PSBlbGVtZW50LmlkO1xuXHRcdFx0XHRcdFx0Y29uc3QgaXNCbG9ja2VkID0gKGlzUmVxdWVzdFZNKGVsZW1lbnQpIHx8IGlzUmVzcG9uc2VWTShlbGVtZW50KSkgPyBlbGVtZW50LnNob3VsZEJlQmxvY2tlZC5nZXQoKSA6IGZhbHNlO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGJhc2VJZCArXG5cdFx0XHRcdFx0XHRcdC8vIElmIGEgcmVzcG9uc2UgaXMgaW4gdGhlIHByb2Nlc3Mgb2YgcHJvZ3Jlc3NpdmUgcmVuZGVyaW5nLCB3ZSBuZWVkIHRvIGVuc3VyZSB0aGF0IGl0IHdpbGxcblx0XHRcdFx0XHRcdFx0Ly8gYmUgcmUtcmVuZGVyZWQgc28gcHJvZ3Jlc3NpdmUgcmVuZGVyaW5nIGlzIHJlc3RhcnRlZCwgZXZlbiBpZiB0aGUgbW9kZWwgd2Fzbid0IHVwZGF0ZWQuXG5cdFx0XHRcdFx0XHRcdGAke2lzUmVzcG9uc2VWTShlbGVtZW50KSAmJiBlbGVtZW50LnJlbmRlckRhdGEgPyBgXyR7dGhpcy5fdmlzaWJsZUNoYW5nZUNvdW50fWAgOiAnJ31gICtcblx0XHRcdFx0XHRcdFx0Ly8gUmUtcmVuZGVyIG9uY2UgY29udGVudCByZWZlcmVuY2VzIGFyZSBsb2FkZWRcblx0XHRcdFx0XHRcdFx0KGlzUmVzcG9uc2VWTShlbGVtZW50KSA/IGBfJHtlbGVtZW50LmNvbnRlbnRSZWZlcmVuY2VzLmxlbmd0aH1gIDogJycpICtcblx0XHRcdFx0XHRcdFx0Ly8gUmUtcmVuZGVyIGlmIGVsZW1lbnQgYmVjb21lcyBoaWRkZW4gZHVlIHRvIHVuZG8vcmVkb1xuXHRcdFx0XHRcdFx0XHRgXyR7ZGlzYWJsZW1lbnQgPyBgJHtkaXNhYmxlbWVudC5hZnRlclVuZG9TdG9wIHx8ICcxJ31gIDogJzAnfWAgK1xuXHRcdFx0XHRcdFx0XHQvLyBSZS1yZW5kZXIgdGhlIHJlcXVlc3QgYmVpbmcgZWRpdGVkIGFuZCByZXF1ZXN0cyB3aG9zZSBibG9ja2VkIHN0YXRlIGNoYW5nZWRcblx0XHRcdFx0XHRcdFx0YF8ke2lzRWRpdFRhcmdldCA/ICdlZGl0JyA6ICcnfWAgK1xuXHRcdFx0XHRcdFx0XHRgXyR7aXNCbG9ja2VkID8gJ2Jsb2NrZWQnIDogJyd9YCArXG5cdFx0XHRcdFx0XHRcdC8vIFJlLXJlbmRlciByZXF1ZXN0cyB3aGVuIGVkaXRpbmcgc3RhcnRzL3N0b3BzIChmb3IgaG92ZXIgYnV0dG9uIHZpc2liaWxpdHksIGNsaWNrIGhhbmRsZXJzKVxuXHRcdFx0XHRcdFx0XHQoaXNSZXF1ZXN0Vk0oZWxlbWVudCkgPyBgXyR7ZWRpdGluZyA/ICcxJyA6ICcwJ31gIDogJycpICtcblx0XHRcdFx0XHRcdFx0Ly8gUmUtcmVuZGVyIGFsbCBpZiBpbnZva2VkIGJ5IHNldHRpbmcgY2hhbmdlXG5cdFx0XHRcdFx0XHRcdGBfc2V0dGluZyR7dGhpcy5fc2V0dGluZ0NoYW5nZUNvdW50ZXJ9YCArXG5cdFx0XHRcdFx0XHRcdC8vIFJlcmVuZGVyIHJlcXVlc3QgaWYgd2UgZ290IG5ldyBjb250ZW50IHJlZmVyZW5jZXMgaW4gdGhlIHJlc3BvbnNlXG5cdFx0XHRcdFx0XHRcdC8vIHNpbmNlIHRoaXMgbWF5IGNoYW5nZSBob3cgd2UgcmVuZGVyIHRoZSBjb3JyZXNwb25kaW5nIGF0dGFjaG1lbnRzIGluIHRoZSByZXF1ZXN0XG5cdFx0XHRcdFx0XHRcdChpc1JlcXVlc3RWTShlbGVtZW50KSAmJiBlbGVtZW50LmNvbnRlbnRSZWZlcmVuY2VzID8gYF8ke2VsZW1lbnQuY29udGVudFJlZmVyZW5jZXM/Lmxlbmd0aH1gIDogJycpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldCBzY3JvbGwgbG9jayBzdGF0ZS5cblx0ICovXG5cdHNldFNjcm9sbExvY2sodmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9zY3JvbGxMb2NrID0gdmFsdWU7XG5cdFx0dGhpcy51cGRhdGVTY3JvbGxEb3duQnV0dG9uVmlzaWJpbGl0eSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCBzY3JvbGwgbG9jayBzdGF0ZS5cblx0ICovXG5cdGdldCBzY3JvbGxMb2NrKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9zY3JvbGxMb2NrO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldCB0aGUgdmlzaWJsZSBjaGFuZ2UgY291bnQgKGZvciBkaWZmIGlkZW50aXR5KS5cblx0ICovXG5cdHNldFZpc2libGVDaGFuZ2VDb3VudCh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlzaWJsZUNoYW5nZUNvdW50ID0gdmFsdWU7XG5cdH1cblxuXHQvKipcblx0ICogU2Nyb2xsIHRvIHJldmVhbCBhbiBlbGVtZW50IGlmIGVkaXRpbmcuXG5cdCAqL1xuXHRzY3JvbGxUb0N1cnJlbnRJdGVtKGN1cnJlbnRFbGVtZW50OiBJQ2hhdFJlcXVlc3RWaWV3TW9kZWwpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3ZpZXdNb2RlbD8uZWRpdGluZyB8fCAhY3VycmVudEVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl90cmVlLmhhc0VsZW1lbnQoY3VycmVudEVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlbGF0aXZlVG9wID0gdGhpcy5fdHJlZS5nZXRSZWxhdGl2ZVRvcChjdXJyZW50RWxlbWVudCk7XG5cdFx0aWYgKHJlbGF0aXZlVG9wID09PSBudWxsIHx8IHJlbGF0aXZlVG9wIDwgMCB8fCByZWxhdGl2ZVRvcCA+IDEpIHtcblx0XHRcdHRoaXMuX3RyZWUucmV2ZWFsKGN1cnJlbnRFbGVtZW50LCAwKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gVHJlZSBtZXRob2RzXG5cblx0LyoqXG5cdCAqIFJlcmVuZGVyIHRoZSB0cmVlLlxuXHQgKi9cblx0cmVyZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJlZS5yZXJlbmRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRJdGVtcygpOiBDaGF0VHJlZUl0ZW1bXSB7XG5cdFx0Y29uc3QgaXRlbXM6IENoYXRUcmVlSXRlbVtdID0gW107XG5cdFx0Y29uc3Qgcm9vdCA9IHRoaXMuX3RyZWUuZ2V0Tm9kZShudWxsKTtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHJvb3QuY2hpbGRyZW4pIHtcblx0XHRcdGlmIChjaGlsZC5lbGVtZW50KSB7XG5cdFx0XHRcdGl0ZW1zLnB1c2goY2hpbGQuZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBpdGVtcztcblx0fVxuXG5cblx0LyoqXG5cdCAqIERlbGVnYXRlIHNjcm9sbCBldmVudHMgZnJvbSBhIG1vdXNlIHdoZWVsIGV2ZW50IHRvIHRoZSB0cmVlLlxuXHQgKi9cblx0ZGVsZWdhdGVTY3JvbGxGcm9tTW91c2VXaGVlbEV2ZW50KGV2ZW50OiBJTW91c2VXaGVlbEV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5jYW5jZWxVc2VyVG9nZ2xlU2Nyb2xsUmVzdG9yYXRpb24oKTtcblx0XHR0aGlzLl90cmVlLmRlbGVnYXRlU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChldmVudCk7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgdHJlZSBoYXMgYSBzcGVjaWZpYyBlbGVtZW50LlxuXHQgKi9cblx0aGFzRWxlbWVudChlbGVtZW50OiBDaGF0VHJlZUl0ZW0pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdHJlZS5oYXNFbGVtZW50KGVsZW1lbnQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZSB0aGUgaGVpZ2h0IG9mIGFuIGVsZW1lbnQuXG5cdCAqL1xuXHRwcml2YXRlIF91cGRhdGVFbGVtZW50SGVpZ2h0KGVsZW1lbnQ6IENoYXRUcmVlSXRlbSwgaGVpZ2h0PzogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3RyZWUuaGFzRWxlbWVudChlbGVtZW50KSAmJiB0aGlzLl92aXNpYmxlKSB7XG5cdFx0XHRjb25zdCB1c2VyVG9nZ2xlUmVzaXplVHJhY2tlciA9IHRoaXMuX3VzZXJUb2dnbGVSZXNpemVUcmFja2Vycy5nZXQoZWxlbWVudCk7XG5cdFx0XHRpZiAodXNlclRvZ2dsZVJlc2l6ZVRyYWNrZXIpIHtcblx0XHRcdFx0dGhpcy5fdHJlZS51cGRhdGVFbGVtZW50SGVpZ2h0KGVsZW1lbnQsIGhlaWdodCk7XG5cdFx0XHRcdHVzZXJUb2dnbGVSZXNpemVUcmFja2VyLnJlc3RvcmVTY3JvbGxBbmNob3IoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fd2l0aFBlcnNpc3RlZEF1dG9TY3JvbGwoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl90cmVlLnVwZGF0ZUVsZW1lbnRIZWlnaHQoZWxlbWVudCwgaGVpZ2h0KTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdHJhY2tVc2VyVG9nZ2xlUmVzaXplKGVsZW1lbnQ6IENoYXRUcmVlSXRlbSwgdGFyZ2V0OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGFuY2hvclRhcmdldFRvcCA9IHRoaXMuaXNTY3JvbGxlZFRvQm90dG9tID8gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnRvcCA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZXN0b3JlU2Nyb2xsUG9zaXRpb24gPSBhbmNob3JUYXJnZXRUb3AgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6ICgpID0+IHtcblx0XHRcdGlmICh0YXJnZXQuaXNDb25uZWN0ZWQpIHtcblx0XHRcdFx0dGhpcy5fdHJlZS5zY3JvbGxUb3AgPSBnZXRBbmNob3JlZFNjcm9sbFRvcCh0aGlzLl90cmVlLnNjcm9sbFRvcCwgdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnRvcCwgYW5jaG9yVGFyZ2V0VG9wKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHRyYWNrZXI6IFVzZXJUb2dnbGVSZXNpemVUcmFja2VyID0gbmV3IFVzZXJUb2dnbGVSZXNpemVUcmFja2VyKHRhcmdldCwgcmVzdG9yZVNjcm9sbFBvc2l0aW9uLCAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fdXNlclRvZ2dsZVJlc2l6ZVRyYWNrZXJzLmdldChlbGVtZW50KSA9PT0gdHJhY2tlcikge1xuXHRcdFx0XHR0aGlzLl91c2VyVG9nZ2xlUmVzaXplVHJhY2tlcnMuZGVsZXRlQW5kRGlzcG9zZShlbGVtZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl91c2VyVG9nZ2xlUmVzaXplVHJhY2tlcnMuc2V0KGVsZW1lbnQsIHRyYWNrZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBjYW5jZWxVc2VyVG9nZ2xlU2Nyb2xsUmVzdG9yYXRpb24oKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB0cmFja2VyIG9mIHRoaXMuX3VzZXJUb2dnbGVSZXNpemVUcmFja2Vycy52YWx1ZXMoKSkge1xuXHRcdFx0dHJhY2tlci5jYW5jZWxTY3JvbGxSZXN0b3JhdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTY3JvbGwgdG8gcmV2ZWFsIGFuIGVsZW1lbnQuXG5cdCAqL1xuXHRyZXZlYWwoZWxlbWVudDogQ2hhdFRyZWVJdGVtLCByZWxhdGl2ZVRvcD86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3RyZWUucmV2ZWFsKGVsZW1lbnQsIHJlbGF0aXZlVG9wKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgdG9wIG9mZnNldCBvZiBhbiBlbGVtZW50IGluIHRyYW5zY3JpcHQgY29udGVudCBzcGFjZSAoc2FtZSBzcGFjZSBhc1xuXHQgKiBgc2Nyb2xsVG9wYC9gc2Nyb2xsSGVpZ2h0YCksIG9yIGB1bmRlZmluZWRgIGlmIGl0IGlzIG5vdCBpbiB0aGUgbGlzdC4gUmVhZHNcblx0ICogdGhlIGxheW91dCBoZWlnaHQgbW9kZWwsIHNvIGl0IGFsc28gcmVzb2x2ZXMgb2ZmLXNjcmVlbiBlbGVtZW50cy5cblx0ICovXG5cdGdldEVsZW1lbnRUb3AoZWxlbWVudDogQ2hhdFRyZWVJdGVtKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX3RyZWUuaGFzRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWUuZ2V0RWxlbWVudFRvcChlbGVtZW50KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGZvY3VzZWQgZWxlbWVudHMuXG5cdCAqL1xuXHRnZXRGb2N1cygpOiBDaGF0VHJlZUl0ZW1bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWUuZ2V0Rm9jdXMoKS5maWx0ZXIoKGUpOiBlIGlzIENoYXRUcmVlSXRlbSA9PiBlICE9PSBudWxsKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXQgdGhlIGZvY3VzZWQgZWxlbWVudHMuXG5cdCAqL1xuXHRzZXRGb2N1cyhlbGVtZW50czogQ2hhdFRyZWVJdGVtW10pOiB2b2lkIHtcblx0XHR0aGlzLl90cmVlLnNldEZvY3VzKGVsZW1lbnRzKTtcblx0fVxuXG5cdGZvY3VzSXRlbShpdGVtOiBDaGF0VHJlZUl0ZW0pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaGFzRWxlbWVudChpdGVtKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl90cmVlLnNldEZvY3VzKFtpdGVtXSk7XG5cdFx0dGhpcy5fdHJlZS5kb21Gb2N1cygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvY3VzIHRoZSBsYXN0IGl0ZW0gaW4gdGhlIGxpc3QuIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBmb2N1c2VkIGl0ZW0uXG5cdCAqIEBwYXJhbSB1c2VNb3N0UmVjZW50bHlGb2N1c2VkSW5kZXggSWYgdHJ1ZSwgdXNlIHRoZSBtb3N0UmVjZW50bHlGb2N1c2VkSW5kZXggaWYgdmFsaWRcblx0ICovXG5cdGZvY3VzTGFzdEl0ZW0odXNlTW9zdFJlY2VudGx5Rm9jdXNlZEluZGV4PzogYm9vbGVhbik6IG51bWJlciB7XG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLmdldEl0ZW1zKCk7XG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblxuXHRcdGxldCBmb2N1c0luZGV4OiBudW1iZXI7XG5cdFx0aWYgKHVzZU1vc3RSZWNlbnRseUZvY3VzZWRJbmRleCAmJiB0aGlzLl9tb3N0UmVjZW50bHlGb2N1c2VkSXRlbUluZGV4ID49IDAgJiYgdGhpcy5fbW9zdFJlY2VudGx5Rm9jdXNlZEl0ZW1JbmRleCA8IGl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0Zm9jdXNJbmRleCA9IHRoaXMuX21vc3RSZWNlbnRseUZvY3VzZWRJdGVtSW5kZXg7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZvY3VzSW5kZXggPSBpdGVtcy5sZW5ndGggLSAxO1xuXHRcdH1cblxuXHRcdHRoaXMuX3RyZWUuc2V0Rm9jdXMoW2l0ZW1zW2ZvY3VzSW5kZXhdXSk7XG5cdFx0dGhpcy5fdHJlZS5kb21Gb2N1cygpO1xuXHRcdHJldHVybiBmb2N1c0luZGV4O1xuXHR9XG5cblx0LyoqXG5cdCAqIFNjcm9sbCB0aGUgbGlzdCB0byByZXZlYWwgdGhlIGxhc3QgaXRlbS5cblx0ICovXG5cdHNjcm9sbFRvRW5kKCk6IHZvaWQge1xuXHRcdC8vIFJldmVhbCB0aGUgdHJlZSdzIGFjdHVhbCBsYXN0IG5vZGUgcmF0aGVyIHRoYW4gdGhlIGhlbGQgYF9sYXN0SXRlbWAuIGByZXZlYWxgIHJlbGlhYmx5XG5cdFx0Ly8gc2Nyb2xscyBhbGwgdGhlIHdheSBkb3duIGV2ZW4gd2hpbGUgaXRlbSBoZWlnaHRzIGFyZSBzdGlsbCBzZXR0bGluZyAoc2VlICMyMzQwODkpXG5cdFx0Y29uc3QgbGFzdEVsZW1lbnQgPSB0aGlzLl90cmVlLmdldE5vZGUobnVsbCkuY2hpbGRyZW4uYXQoLTEpPy5lbGVtZW50O1xuXHRcdGlmIChsYXN0RWxlbWVudCkge1xuXHRcdFx0Y29uc3Qgb2Zmc2V0ID0gTWF0aC5tYXgobGFzdEVsZW1lbnQuY3VycmVudFJlbmRlcmVkSGVpZ2h0ID8/IDAsIDFlNik7XG5cdFx0XHR0aGlzLl90cmVlLnJldmVhbChsYXN0RWxlbWVudCwgb2Zmc2V0KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU3VwcHJlc3NlcyBhdXRvLXNjcm9sbGluZyB0byB0aGUgYm90dG9tIHVudGlsIHRoZSByZXR1cm5lZCBkaXNwb3NhYmxlIGlzXG5cdCAqIGRpc3Bvc2VkLiBIb2xkcyBjb21wb3NlLCBzbyB1bnJlbGF0ZWQgZmVhdHVyZXMgKHJlcXVlc3QgZWRpdGluZywgYW4gb3BlblxuXHQgKiB0ZXh0IHNlbGVjdGlvbikgY2FuIHN1cHByZXNzIGNvbmN1cnJlbnRseSB3aXRob3V0IGNsb2JiZXJpbmcgZWFjaCBvdGhlcjtcblx0ICogYXV0by1zY3JvbGwgcmVzdW1lcyBvbmx5IG9uY2UgdGhlIGxhc3QgaG9sZCBpcyByZWxlYXNlZC5cblx0ICovXG5cdGFjcXVpcmVBdXRvU2Nyb2xsSG9sZCgpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2F1dG9TY3JvbGxIb2xkcy5hY3F1aXJlKCk7XG5cdH1cblxuXHQvKiogV2hldGhlciBhbnkge0BsaW5rIGFjcXVpcmVBdXRvU2Nyb2xsSG9sZH0gaG9sZCBpcyBjdXJyZW50bHkgYWN0aXZlLiAqL1xuXHRnZXQgaXNBdXRvU2Nyb2xsSGVsZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYXV0b1Njcm9sbEhvbGRzLmlzSGVsZDtcblx0fVxuXG5cdHByaXZhdGUgX3dpdGhQZXJzaXN0ZWRBdXRvU2Nyb2xsKGZuOiAoKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNBdXRvU2Nyb2xsSGVsZCkge1xuXHRcdFx0Zm4oKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgd2FzU2Nyb2xsZWRUb0JvdHRvbSA9IHRoaXMuaXNTY3JvbGxlZFRvQm90dG9tO1xuXHRcdGZuKCk7XG5cdFx0aWYgKHdhc1Njcm9sbGVkVG9Cb3R0b20pIHtcblx0XHRcdHRoaXMuc2Nyb2xsVG9FbmQoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRm9jdXMgdGhlIGxpc3QuXG5cdCAqL1xuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl90cmVlLmRvbUZvY3VzKCk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBET00gZm9jdXMgc3RhdGUuXG5cdCAqL1xuXHRpc0RPTUZvY3VzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWUuaXNET01Gb2N1c2VkKCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gUmVuZGVyZXIgbWV0aG9kc1xuXG5cdC8qKlxuXHQgKiBHZXQgY29kZSBibG9jayBpbmZvIGZvciBhIHJlc3BvbnNlLlxuXHQgKi9cblx0Z2V0Q29kZUJsb2NrSW5mb3NGb3JSZXNwb25zZShyZXNwb25zZTogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCk6IElDaGF0Q29kZUJsb2NrSW5mb1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZXIuZ2V0Q29kZUJsb2NrSW5mb3NGb3JSZXNwb25zZShyZXNwb25zZSk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IGNvZGUgYmxvY2sgaW5mbyBieSBVUkkuXG5cdCAqL1xuXHRnZXRDb2RlQmxvY2tJbmZvRm9yRWRpdG9yKHVyaTogVVJJKTogSUNoYXRDb2RlQmxvY2tJbmZvIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZXIuZ2V0Q29kZUJsb2NrSW5mb0ZvckVkaXRvcih1cmkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCBmaWxlIHRyZWUgaW5mbyBmb3IgYSByZXNwb25zZS5cblx0ICovXG5cdGdldEZpbGVUcmVlSW5mb3NGb3JSZXNwb25zZShyZXNwb25zZTogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCk6IElDaGF0RmlsZVRyZWVJbmZvW10ge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlci5nZXRGaWxlVHJlZUluZm9zRm9yUmVzcG9uc2UocmVzcG9uc2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgbGFzdCBmb2N1c2VkIGZpbGUgdHJlZSBmb3IgYSByZXNwb25zZS5cblx0ICovXG5cdGdldExhc3RGb2N1c2VkRmlsZVRyZWVGb3JSZXNwb25zZShyZXNwb25zZTogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCk6IElDaGF0RmlsZVRyZWVJbmZvIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZXIuZ2V0TGFzdEZvY3VzZWRGaWxlVHJlZUZvclJlc3BvbnNlKHJlc3BvbnNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgZWRpdG9ycyBjdXJyZW50bHkgaW4gdXNlLlxuXHQgKi9cblx0ZWRpdG9yc0luVXNlKCk6IEl0ZXJhYmxlPENvZGVCbG9ja1BhcnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZXIuZWRpdG9yc0luVXNlKCk7XG5cdH1cblxuXG5cblx0LyoqXG5cdCAqIEdldCB0ZW1wbGF0ZSBkYXRhIGZvciBhIHJlcXVlc3QgSUQuXG5cdCAqL1xuXHRnZXRUZW1wbGF0ZURhdGFGb3JSZXF1ZXN0SWQocmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUgfCB1bmRlZmluZWQge1xuXHRcdGlmICghcmVxdWVzdElkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZXIuZ2V0VGVtcGxhdGVEYXRhRm9yUmVxdWVzdElkKHJlcXVlc3RJZCk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY3VycmVudGx5IHJlbmRlcmVkIGNoYXQgaXRlbSBjb250YWluaW5nIHRoZSBub2RlLlxuXHQgKi9cblx0Z2V0RWxlbWVudEZyb21Ob2RlKG5vZGU6IEhUTUxFbGVtZW50KTogQ2hhdFRyZWVJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZXIuZ2V0RWxlbWVudEZyb21Ob2RlKG5vZGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZSByZW5kZXJlciBvcHRpb25zLlxuXHQgKi9cblx0dXBkYXRlUmVuZGVyZXJPcHRpb25zKG9wdGlvbnM6IElDaGF0TGlzdEl0ZW1SZW5kZXJlck9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLl9yZW5kZXJlci51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZSB0aGUgbGlzdC90cmVlIGNvbG9yIG92ZXJyaWRlcy4gUmUtYXBwbGllcyB0aGUgc2FtZSBmYW4tb3V0IGZyb21cblx0ICogYGxpc3RCYWNrZ3JvdW5kYC9gbGlzdEZvcmVncm91bmRgIHRvIGFsbCBpbnRlcmFjdGlvbiBzdGF0ZXMgdGhhdCB3YXNcblx0ICogb3JpZ2luYWxseSBjb25maWd1cmVkIGF0IGNvbnN0cnVjdGlvbiB0aW1lLlxuXHQgKi9cblx0c2V0U3R5bGVzKHN0eWxlczogSUNoYXRMaXN0V2lkZ2V0U3R5bGVzKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJlZS51cGRhdGVPcHRpb25zKHtcblx0XHRcdG92ZXJyaWRlU3R5bGVzOiB7XG5cdFx0XHRcdGxpc3RGb2N1c0JhY2tncm91bmQ6IHN0eWxlcy5saXN0QmFja2dyb3VuZCxcblx0XHRcdFx0bGlzdEluYWN0aXZlRm9jdXNCYWNrZ3JvdW5kOiBzdHlsZXMubGlzdEJhY2tncm91bmQsXG5cdFx0XHRcdGxpc3RBY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kOiBzdHlsZXMubGlzdEJhY2tncm91bmQsXG5cdFx0XHRcdGxpc3RGb2N1c0FuZFNlbGVjdGlvbkJhY2tncm91bmQ6IHN0eWxlcy5saXN0QmFja2dyb3VuZCxcblx0XHRcdFx0bGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZDogc3R5bGVzLmxpc3RCYWNrZ3JvdW5kLFxuXHRcdFx0XHRsaXN0SG92ZXJCYWNrZ3JvdW5kOiBzdHlsZXMubGlzdEJhY2tncm91bmQsXG5cdFx0XHRcdGxpc3RCYWNrZ3JvdW5kOiBzdHlsZXMubGlzdEJhY2tncm91bmQsXG5cdFx0XHRcdGxpc3RGb2N1c0ZvcmVncm91bmQ6IHN0eWxlcy5saXN0Rm9yZWdyb3VuZCxcblx0XHRcdFx0bGlzdEhvdmVyRm9yZWdyb3VuZDogc3R5bGVzLmxpc3RGb3JlZ3JvdW5kLFxuXHRcdFx0XHRsaXN0SW5hY3RpdmVGb2N1c0ZvcmVncm91bmQ6IHN0eWxlcy5saXN0Rm9yZWdyb3VuZCxcblx0XHRcdFx0bGlzdEluYWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZDogc3R5bGVzLmxpc3RGb3JlZ3JvdW5kLFxuXHRcdFx0XHRsaXN0QWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZDogc3R5bGVzLmxpc3RGb3JlZ3JvdW5kLFxuXHRcdFx0XHRsaXN0Rm9jdXNBbmRTZWxlY3Rpb25Gb3JlZ3JvdW5kOiBzdHlsZXMubGlzdEZvcmVncm91bmQsXG5cdFx0XHRcdGxpc3RBY3RpdmVTZWxlY3Rpb25JY29uRm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRsaXN0SW5hY3RpdmVTZWxlY3Rpb25JY29uRm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldCB0aGUgdmlzaWJpbGl0eSBvZiB0aGUgbGlzdC5cblx0ICovXG5cdHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdHRoaXMuX3JlbmRlcmVyLnNldFZpc2libGUodmlzaWJsZSk7XG5cdH1cblxuXHQvKipcblx0ICogTGF5b3V0IHRoZSBsaXN0LlxuXHQgKi9cblx0bGF5b3V0KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJlZS5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy5fcmVuZGVyZXIubGF5b3V0KHdpZHRoID8/IHRoaXMuX2NvbnRhaW5lci5jbGllbnRXaWR0aCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxjQUFjO0FBRXZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQXNCO0FBRS9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksZUFBNEIsbUJBQW1CLG9CQUFvQjtBQUN4RixTQUFTLGFBQWE7QUFHdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGVBQWUsMEJBQTBCLDJCQUEyQixpQ0FBaUM7QUFDOUcsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBaUQsb0JBQW9CO0FBQ3JFLFNBQTRCLG1CQUFtQixvQkFBb0I7QUFFbkUsU0FBd0UsYUFBYSxvQkFBb0I7QUFDekcsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBdUIsaUNBQXNHO0FBRTdILFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsa0JBQWtCLDRCQUEwRTtBQUNyRyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGlDQUFpQztBQWFuQyxNQUFNLGdCQUFnQjtBQUFBLEVBQXRCO0FBRU4sU0FBUSxTQUFTO0FBQUE7QUFBQSxFQUVqQixJQUFJLFNBQWtCO0FBQ3JCLFdBQU8sS0FBSyxTQUFTO0FBQUEsRUFDdEI7QUFBQSxFQUVBLFVBQXVCO0FBQ3RCLFNBQUs7QUFHTCxRQUFJ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YUFBYTtBQUFBLEVBQ3BDO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPQSw0QkFBNEIsV0FBa0U7QUFDN0YsUUFBSSxDQUFDLFdBQVc7QUFDZixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sS0FBSyxVQUFVLDRCQUE0QixTQUFTO0FBQUEsRUFDNUQ7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLG1CQUFtQixNQUE2QztBQUMvRCxXQUFPLEtBQUssVUFBVSxtQkFBbUIsSUFBSTtBQUFBLEVBQzlDO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxzQkFBc0IsU0FBNkM7QUFDbEUsU0FBSyxVQUFVLGNBQWMsT0FBTztBQUFBLEVBQ3JDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT0EsVUFBVSxRQUFxQztBQUM5QyxTQUFLLE1BQU0sY0FBYztBQUFBLE1BQ3hCLGdCQUFnQjtBQUFBLFFBQ2YscUJBQXFCLE9BQU87QUFBQSxRQUM1Qiw2QkFBNkIsT0FBTztBQUFBLFFBQ3BDLCtCQUErQixPQUFPO0FBQUEsUUFDdEMsaUNBQWlDLE9BQU87QUFBQSxRQUN4QyxpQ0FBaUMsT0FBTztBQUFBLFFBQ3hDLHFCQUFxQixPQUFPO0FBQUEsUUFDNUIsZ0JBQWdCLE9BQU87QUFBQSxRQUN2QixxQkFBcUIsT0FBTztBQUFBLFFBQzVCLHFCQUFxQixPQUFPO0FBQUEsUUFDNUIsNkJBQTZCLE9BQU87QUFBQSxRQUNwQyxpQ0FBaUMsT0FBTztBQUFBLFFBQ3hDLCtCQUErQixPQUFPO0FBQUEsUUFDdEMsaUNBQWlDLE9BQU87QUFBQSxRQUN4QyxtQ0FBbUM7QUFBQSxRQUNuQyxxQ0FBcUM7QUFBQSxNQUN0QztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLFdBQVcsU0FBd0I7QUFDbEMsU0FBSyxXQUFXO0FBQ2hCLFNBQUssVUFBVSxXQUFXLE9BQU87QUFBQSxFQUNsQztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsT0FBTyxRQUFnQixPQUFxQjtBQUMzQyxTQUFLLE1BQU0sT0FBTyxRQUFRLEtBQUs7QUFDL0IsU0FBSyxVQUFVLE9BQU8sU0FBUyxLQUFLLFdBQVcsV0FBVztBQUFBLEVBQzNEO0FBQUE7QUFJRDtBQXg0QmEsaUJBQU47QUFBQSxFQTJISjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBaklVOyIsCiAgIm5hbWVzIjogWyJlIl0KfQo=
