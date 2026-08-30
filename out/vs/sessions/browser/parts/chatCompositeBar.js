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
import "./media/chatCompositeBar.css";
import { Disposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { Emitter } from "../../../base/common/event.js";
import { $, addDisposableGenericMouseDownListener, addDisposableGenericMouseUpListener, addDisposableListener, addStandardDisposableListener, DisposableResizeObserver, EventHelper, EventType, getWindow, isHTMLElement, reset } from "../../../base/browser/dom.js";
import { applyDragImage } from "../../../base/browser/ui/dnd/dnd.js";
import { ScrollableElement } from "../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ScrollbarVisibility } from "../../../base/common/scrollable.js";
import { autorun } from "../../../base/common/observable.js";
import { isLinux } from "../../../base/common/platform.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { Action } from "../../../base/common/actions.js";
import { ActionBar } from "../../../base/browser/ui/actionbar/actionbar.js";
import { InputBox } from "../../../base/browser/ui/inputbox/inputBox.js";
import { defaultInputBoxStyles } from "../../../platform/theme/browser/defaultStyles.js";
import { Codicon } from "../../../base/common/codicons.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { IContextMenuService, IContextViewService } from "../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../platform/actions/browser/toolbar.js";
import { Menus } from "../menus.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { onUnexpectedError } from "../../../base/common/errors.js";
import { localize } from "../../../nls.js";
import { ChatInteractivity, getChatCapabilities, SessionStatus } from "../../services/sessions/common/session.js";
import { ISessionsManagementService } from "../../services/sessions/common/sessionsManagement.js";
import { clearChatReferenceDragData, fillChatReferenceDragData, fillSessionChatDragData } from "../dnd.js";
import { IHoverService } from "../../../platform/hover/browser/hover.js";
import { getDefaultHoverDelegate } from "../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { applySessionBarThemeColors } from "./sessionBarStyles.js";
import { ISessionsProvidersService } from "../../services/sessions/browser/sessionsProvidersService.js";
import { isAgentHostProvider } from "../../common/agentHostSessionsProvider.js";
import { ICommandService } from "../../../platform/commands/common/commands.js";
import { CLOSE_CHAT_COMMAND_ID } from "../../common/sessionCommands.js";
let ChatCompositeBar = class extends Disposable {
  constructor(_themeService, _sessionsManagementService, _contextMenuService, _contextViewService, _hoverService, _instantiationService, _sessionsProvidersService, _commandService) {
    super();
    this._themeService = _themeService;
    this._sessionsManagementService = _sessionsManagementService;
    this._contextMenuService = _contextMenuService;
    this._contextViewService = _contextViewService;
    this._hoverService = _hoverService;
    this._instantiationService = _instantiationService;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._commandService = _commandService;
    this._tabs = [];
    this._tabDisposables = this._register(new DisposableStore());
    this._groupDisposables = this._register(new MutableDisposable());
    this._editingDisposables = this._register(new MutableDisposable());
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._visible = false;
    this._container = $(".chat-composite-bar.session-chat-tabs-bar");
    this._tabsRow = $(".chat-composite-bar-tabs-row");
    this._container.appendChild(this._tabsRow);
    this._tabsContainer = $(".chat-composite-bar-tabs");
    this._tabsContainer.setAttribute("role", "tablist");
    this._tabsContainer.setAttribute("aria-label", localize("chatTabsAriaLabel", "Chats"));
    this._tabsScrollbar = this._register(new ScrollableElement(this._tabsContainer, {
      horizontal: ScrollbarVisibility.Hidden,
      vertical: ScrollbarVisibility.Hidden,
      scrollYToX: true,
      useShadows: false
    }));
    this._tabsRow.appendChild(this._tabsScrollbar.getDomNode());
    const preventMiddleButtonDefault = (e) => {
      if (e.button === 1 && !this._isInTabInput(e)) {
        e.preventDefault();
      }
    };
    this._register(addDisposableGenericMouseDownListener(this._tabsContainer, preventMiddleButtonDefault));
    if (isLinux) {
      this._register(addDisposableGenericMouseUpListener(this._tabsContainer, preventMiddleButtonDefault));
    }
    const newChatAction = this._newChatAction = this._register(new Action(
      "chatCompositeBar.addChat",
      localize("chatCompositeBar.addChat", "New Chat"),
      ThemeIcon.asClassName(Codicon.add),
      true,
      async () => this._delegate?.newChat()
    ));
    const newChatActionBar = this._register(new ActionBar(this._tabsRow, { actionViewItemProvider: void 0 }));
    newChatActionBar.push(newChatAction, { icon: true, label: false });
    this._newChatContainer = newChatActionBar.getContainer();
    this._newChatContainer.classList.add("chat-composite-bar-new-chat");
    this._register(addDisposableListener(this._tabsContainer, EventType.SCROLL, () => {
      this._tabsScrollbar.setScrollPosition({ scrollLeft: this._tabsContainer.scrollLeft });
    }));
    this._register(this._tabsScrollbar.onScroll((e) => {
      if (e.scrollLeftChanged) {
        this._tabsContainer.scrollLeft = e.scrollLeft;
      }
    }));
    const resizeObserver = this._register(new DisposableResizeObserver("ChatCompositeBar.activeTabReveal", () => {
      this._updateScrollDimensions();
      this._revealActiveTab();
    }));
    this._register(resizeObserver.observe(this._tabsContainer));
    const heightObserver = this._register(new DisposableResizeObserver("ChatCompositeBar.height", () => {
      this._onDidChangeHeight.fire();
    }));
    this._register(heightObserver.observe(this._container));
    this._setVisible(false);
    this._updateStyles();
    this._register(this._themeService.onDidColorThemeChange(() => this._updateStyles()));
  }
  get element() {
    return this._container;
  }
  get visible() {
    return this._visible;
  }
  get height() {
    return this._visible ? this._container.offsetHeight : 0;
  }
  /**
   * Tells the bar which chat group to render. The bar will display the chats
   * of the given group and track its active chat. Pass `undefined` to clear.
   */
  setGroup(delegate) {
    if (this._delegate === delegate) {
      return;
    }
    this._delegate = delegate;
    const store = new DisposableStore();
    this._groupDisposables.value = store;
    if (!delegate) {
      this._rebuildTabs([], "", "");
      this._setVisible(false);
      return;
    }
    this._setVisible(false);
    store.add(autorun((reader) => {
      const chats = delegate.chats.read(reader);
      const activeChatUri = delegate.activeChatResource.read(reader);
      const mainChatUri = delegate.mainChatResource.read(reader);
      this._rebuildTabs(chats, activeChatUri, mainChatUri);
      const supportsMultipleChats = delegate.session.capabilities.read(reader).supportsMultipleChats;
      this._newChatContainer.classList.toggle("hidden", !supportsMultipleChats);
      this._newChatAction.enabled = supportsMultipleChats && !delegate.session.isArchived.read(reader);
      this._setVisible(delegate.visible.read(reader));
    }));
  }
  setAriaLabel(label) {
    this._tabsContainer.setAttribute("aria-label", label);
  }
  _rebuildTabs(chats, activeChatId, mainChatId) {
    this._cancelTabEditing();
    this._tabDisposables.clear();
    this._tabs.length = 0;
    reset(this._tabsContainer);
    for (const chat of chats) {
      this._createTab(chat, chat.resource.toString() === mainChatId, activeChatId);
    }
    this._updateActiveTab(activeChatId);
    this._updateScrollDimensions();
    this._onDidChangeHeight.fire();
  }
  _updateScrollDimensions() {
    this._tabsScrollbar.setScrollDimensions({
      width: this._tabsContainer.clientWidth,
      scrollWidth: this._tabsContainer.scrollWidth
    });
  }
  _createTab(chat, isMainChat, _activeChatId) {
    const delegate = this._delegate;
    const session = delegate?.session;
    const tab = $(".chat-composite-bar-tab.modern-ui-editor-tab");
    tab.tabIndex = 0;
    tab.setAttribute("role", "tab");
    tab.draggable = true;
    tab.dataset.chatResource = chat.resource.toString();
    tab.dataset.isMainChat = String(isMainChat);
    const tabFill = $(".chat-composite-bar-tab-fill.modern-ui-editor-tab-fill", { "aria-hidden": true });
    tab.appendChild(tabFill);
    const labelEl = $(".chat-composite-bar-tab-label.modern-ui-editor-tab-label");
    this._tabDisposables.add(autorun((reader) => {
      const title = chat.title.read(reader);
      labelEl.textContent = title;
    }));
    const lockIcon = $(".chat-composite-bar-tab-lock");
    lockIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.lock));
    tab.appendChild(lockIcon);
    this._tabDisposables.add(autorun((reader) => {
      const isReadOnly = chat.interactivity.read(reader) === ChatInteractivity.ReadOnly;
      tab.classList.toggle("read-only", isReadOnly);
      tab.dataset.interactivity = chat.interactivity.read(reader);
    }));
    tab.appendChild(labelEl);
    const inputContainer = $(".chat-composite-bar-tab-input-container");
    tab.appendChild(inputContainer);
    this._tabDisposables.add(this._hoverService.setupManagedHover(
      getDefaultHoverDelegate("element"),
      tab,
      () => chat.title.get()
    ));
    this._tabDisposables.add(autorun((reader) => {
      const status = chat.status.read(reader);
      tab.classList.toggle("untitled", status === SessionStatus.Untitled);
    }));
    const indicator = $(".chat-composite-bar-tab-indicator");
    const indicatorIcon = $(".chat-composite-bar-tab-indicator-icon");
    indicator.appendChild(indicatorIcon);
    this._tabDisposables.add(autorun((reader) => {
      const isActive = delegate?.activeChatResource.read(reader) === chat.resource.toString();
      const status = chat.status.read(reader);
      const isRead = chat.isRead.read(reader);
      let mode = "none";
      if (status === SessionStatus.NeedsInput) {
        mode = "needs-input";
      } else if (status === SessionStatus.InProgress) {
        mode = "in-progress";
      } else if (!isRead && !isActive) {
        mode = "unread";
      }
      tab.classList.toggle("needs-input", mode === "needs-input");
      tab.classList.toggle("unread", mode === "unread");
      tab.classList.toggle("in-progress", mode === "in-progress");
      indicatorIcon.className = "chat-composite-bar-tab-indicator-icon";
      if (mode === "in-progress") {
        indicatorIcon.classList.add(...ThemeIcon.asClassNameArray(ThemeIcon.modify(Codicon.loading, "spin")));
      }
    }));
    tab.appendChild(indicator);
    if (!isMainChat && session) {
      const actionsContainer = $(".chat-composite-bar-tab-actions");
      tab.appendChild(actionsContainer);
      const tabToolbar = this._tabDisposables.add(this._instantiationService.createInstance(MenuWorkbenchToolBar, actionsContainer, Menus.SessionChatTab, {
        hiddenItemStrategy: HiddenItemStrategy.Ignore,
        menuOptions: { shouldForwardArgs: true },
        toolbarOptions: { primaryGroup: () => true }
      }));
      tabToolbar.context = { session, chat };
    }
    this._tabsContainer.appendChild(tab);
    const chatTab = { chat, element: tab, inputContainer };
    this._tabDisposables.add(addDisposableListener(tab, EventType.CLICK, () => {
      this._cancelTabEditing();
      this._delegate?.openChat(chat.resource);
    }));
    this._tabDisposables.add(addDisposableListener(tab, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._delegate?.openChat(chat.resource);
      }
    }));
    this._tabDisposables.add(addDisposableListener(tab, EventType.AUXCLICK, (e) => {
      if (e.button !== 1) {
        return;
      }
      if (this._isInTabInput(e)) {
        return;
      }
      EventHelper.stop(e, true);
      if (isMainChat || !session) {
        return;
      }
      this._cancelTabEditing();
      void this._commandService.executeCommand(CLOSE_CHAT_COMMAND_ID, { session, chat }).catch(onUnexpectedError);
    }));
    this._tabDisposables.add(addDisposableListener(tab, EventType.DRAG_START, (e) => {
      if (!delegate || !e.dataTransfer) {
        e.preventDefault();
        return;
      }
      const target = e.target;
      if (target?.closest(".chat-composite-bar-tab-actions")) {
        e.preventDefault();
        return;
      }
      if (this._editingTab) {
        e.preventDefault();
        return;
      }
      this._cancelTabEditing();
      fillSessionChatDragData(e, delegate.session.sessionId, chat.resource);
      const backendChatResource = this._backendChatResource(chat);
      if (backendChatResource) {
        fillChatReferenceDragData(e, backendChatResource, chat.resource, chat.title.get());
      }
      e.dataTransfer.effectAllowed = "copyMove";
      applyDragImage(e, tab, chat.title.get());
      delegate.onTabDragStart?.(chat.resource);
    }));
    this._tabDisposables.add(addDisposableListener(tab, EventType.DRAG_END, () => {
      clearChatReferenceDragData();
      this._delegate?.onTabDragEnd?.();
    }));
    const renameAction = this._tabDisposables.add(new Action("sessionCompositeBar.renameChat", localize("renameChat", "Rename"), void 0, true, async () => {
      this._startTabEditing(chatTab);
    }));
    const deleteAction = this._tabDisposables.add(new Action("sessionCompositeBar.deleteChat", localize("deleteChat", "Delete Chat"), void 0, true, async () => {
      if (delegate) {
        await this._sessionsManagementService.deleteChat(delegate.session, chat.resource);
      }
    }));
    this._tabDisposables.add(addDisposableListener(tab, EventType.DBLCLICK, (e) => {
      if (chat.status.get() === SessionStatus.Untitled || !getChatCapabilities(chat, session, void 0).canRename) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this._startTabEditing(chatTab);
    }));
    this._tabDisposables.add(addDisposableListener(tab, EventType.CONTEXT_MENU, (e) => {
      if (chat.status.get() === SessionStatus.Untitled) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const event = new StandardMouseEvent(getWindow(tab), e);
      this._contextMenuService.showContextMenu({
        getAnchor: () => event,
        getActions: () => {
          const capabilities = getChatCapabilities(chat, session, void 0);
          const actions = [];
          if (capabilities.canRename) {
            actions.push(renameAction);
          }
          if (capabilities.canDelete) {
            actions.push(deleteAction);
          }
          return actions;
        }
      });
    }));
    this._tabs.push(chatTab);
  }
  _isInTabInput(event) {
    return isHTMLElement(event.target) && !!event.target.closest(".chat-composite-bar-tab-input-container");
  }
  /**
   * Resolves the opaque backend chat URI for a chat tab so a dragged `#chat:`
   * reference can carry it. Reaches the owning agent-host provider by id and
   * asks it to look up the host-supplied backend resource. Returns `undefined`
   * when the session is not agent-host backed or the provider has no hydrated
   * state for the chat — the caller then offers no chat-reference payload.
   */
  _backendChatResource(chat) {
    const providerId = this._delegate?.session.providerId;
    if (!providerId) {
      return void 0;
    }
    const provider = this._sessionsProvidersService.getProvider(providerId);
    return provider && isAgentHostProvider(provider) ? provider.getBackendChatResource(chat.resource) : void 0;
  }
  /**
   * Start an inline rename for the given tab. Enter commits via
   * {@link ISessionsManagementService.renameChat}; Escape or blur cancels.
   */
  _startTabEditing(chatTab) {
    const delegate = this._delegate;
    if (!delegate || this._editingTab) {
      return;
    }
    const { chat, element: tab, inputContainer } = chatTab;
    const initialTitle = chat.title.get();
    this._editingTab = chatTab;
    tab.classList.add("editing");
    const store = new DisposableStore();
    this._editingDisposables.value = store;
    const inputBox = store.add(new InputBox(inputContainer, this._contextViewService, {
      ariaLabel: localize("renameChat.aria", "Rename chat"),
      inputBoxStyles: defaultInputBoxStyles
    }));
    inputBox.element.classList.add("chat-composite-bar-tab-input");
    inputBox.value = initialTitle;
    inputBox.focus();
    inputBox.select();
    let finished = false;
    const finish = (commit) => {
      if (finished) {
        return;
      }
      finished = true;
      const newTitle = inputBox.value.trim();
      this._endTabEditing();
      if (commit && newTitle && newTitle !== initialTitle) {
        this._sessionsManagementService.renameChat(delegate.session, chat.resource, newTitle).catch(onUnexpectedError);
      }
    };
    store.add(addStandardDisposableListener(inputBox.inputElement, EventType.KEY_DOWN, (e) => {
      if (e.equals(KeyCode.Enter)) {
        e.preventDefault();
        e.stopPropagation();
        finish(true);
      } else if (e.equals(KeyCode.Escape)) {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      } else {
        e.stopPropagation();
      }
    }));
    store.add(addDisposableListener(inputBox.inputElement, EventType.BLUR, () => finish(false)));
    store.add(addDisposableListener(inputBox.element, EventType.CLICK, (e) => e.stopPropagation()));
    store.add(addDisposableListener(inputBox.element, EventType.DBLCLICK, (e) => e.stopPropagation()));
  }
  _cancelTabEditing() {
    if (!this._editingTab) {
      return;
    }
    this._endTabEditing();
  }
  _endTabEditing() {
    const editingTab = this._editingTab;
    this._editingTab = void 0;
    this._editingDisposables.clear();
    if (editingTab) {
      editingTab.element.classList.remove("editing");
      reset(editingTab.inputContainer);
    }
  }
  _updateActiveTab(activeChatId) {
    for (const tab of this._tabs) {
      const isActive = tab.chat.resource.toString() === activeChatId;
      tab.element.classList.toggle("active", isActive);
      tab.element.setAttribute("aria-selected", String(isActive));
      if (isActive) {
        tab.element.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
  }
  _revealActiveTab() {
    const activeTab = this._tabs.find((t) => t.element.classList.contains("active"));
    activeTab?.element.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  _setVisible(visible) {
    const wasVisible = this._visible;
    this._visible = visible;
    this._container.style.display = this._visible ? "" : "none";
    if (wasVisible !== this._visible) {
      this._onDidChangeVisibility.fire(this._visible);
    }
  }
  _updateStyles() {
    applySessionBarThemeColors(this._container, this._themeService.getColorTheme());
  }
};
ChatCompositeBar = __decorateClass([
  __decorateParam(0, IThemeService),
  __decorateParam(1, ISessionsManagementService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IContextViewService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ISessionsProvidersService),
  __decorateParam(7, ICommandService)
], ChatCompositeBar);
export {
  ChatCompositeBar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcYnJvd3NlclxccGFydHNcXGNoYXRDb21wb3NpdGVCYXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvY2hhdENvbXBvc2l0ZUJhci5jc3MnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyLCBhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlVXBMaXN0ZW5lciwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lciwgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyLCBFdmVudEhlbHBlciwgRXZlbnRUeXBlLCBnZXRXaW5kb3csIGlzSFRNTEVsZW1lbnQsIHJlc2V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBhcHBseURyYWdJbWFnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kbmQvZG5kLmpzJztcbmltcG9ydCB7IFNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNMaW51eCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSW5wdXRCb3ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaW5wdXRib3gvaW5wdXRCb3guanMnO1xuaW1wb3J0IHsgZGVmYXVsdElucHV0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSwgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBIaWRkZW5JdGVtU3RyYXRlZ3ksIE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgTWVudXMgfSBmcm9tICcuLi9tZW51cy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDaGF0SW50ZXJhY3Rpdml0eSwgZ2V0Q2hhdENhcGFiaWxpdGllcywgSUNoYXQsIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiwgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGNsZWFyQ2hhdFJlZmVyZW5jZURyYWdEYXRhLCBmaWxsQ2hhdFJlZmVyZW5jZURyYWdEYXRhLCBmaWxsU2Vzc2lvbkNoYXREcmFnRGF0YSB9IGZyb20gJy4uL2RuZC5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBhcHBseVNlc3Npb25CYXJUaGVtZUNvbG9ycyB9IGZyb20gJy4vc2Vzc2lvbkJhclN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNBZ2VudEhvc3RQcm92aWRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDTE9TRV9DSEFUX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkNvbW1hbmRzLmpzJztcblxuaW50ZXJmYWNlIElDaGF0VGFiIHtcblx0cmVhZG9ubHkgY2hhdDogSUNoYXQ7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBpbnB1dENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG59XG5cbi8qKlxuICogVGhlIGRhdGEgKyBjYWxsYmFja3MgYSB7QGxpbmsgQ2hhdENvbXBvc2l0ZUJhcn0gbmVlZHMgdG8gcmVuZGVyIHRoZSB0YWJzIG9mIGFcbiAqIHNpbmdsZSBjaGF0IGdyb3VwLiBTdXBwbGllZCBieSB0aGUgb3duaW5nIHtAbGluayBDaGF0R3JvdXBWaWV3fSBzbyB0aGUgYmFyXG4gKiByZW5kZXJzIG9uZSBncm91cCdzIGNoYXRzIHdoaWxlIHJvdXRpbmcgY2hhdCBhY3RpdmF0aW9uL2NyZWF0aW9uIGJhY2sgdG8gdGhlXG4gKiBncmlkIG9yY2hlc3RyYXRvciBpbnN0ZWFkIG9mIHJlYWNoaW5nIGludG8gc2Vzc2lvbiBuYXZpZ2F0aW9uIGRpcmVjdGx5LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0Q29tcG9zaXRlQmFyRGVsZWdhdGUge1xuXG5cdC8qKlxuXHQgKiBUaGUgc2Vzc2lvbiB3aG9zZSBjaGF0cyBhcmUgcGFydGl0aW9uZWQgYWNyb3NzIGdyb3Vwcy4gVGhlIGJhciByZWFkcyBpdCBmb3Jcblx0ICogdGhlIGNvbnRyaWJ1dGVkIHRhYiBtZW51cyAod2hvc2UgYWN0aW9ucyBhY3Qgb24gYHsgc2Vzc2lvbiwgY2hhdCB9YCksIGNoYXRcblx0ICogY2FwYWJpbGl0aWVzLCByZW5hbWUvZGVsZXRlLCBhbmQgdGhlIHRyYWlsaW5nIFwiTmV3IENoYXRcIiBnYXRpbmcuXG5cdCAqL1xuXHRyZWFkb25seSBzZXNzaW9uOiBJQWN0aXZlU2Vzc2lvbjtcblxuXHQvKiogVGhlIGNoYXRzIGFzc2lnbmVkIHRvIHRoaXMgZ3JvdXAsIGluIHRhYiBvcmRlci4gKi9cblx0cmVhZG9ubHkgY2hhdHM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElDaGF0W10+O1xuXG5cdC8qKiBUaGUgcmVzb3VyY2UgKGFzIGEgc3RyaW5nKSBvZiB0aGUgY2hhdCBzaG93biBieSB0aGlzIGdyb3VwLiAqL1xuXHRyZWFkb25seSBhY3RpdmVDaGF0UmVzb3VyY2U6IElPYnNlcnZhYmxlPHN0cmluZz47XG5cblx0LyoqIFRoZSBzZXNzaW9uJ3MgbWFpbiBjaGF0IHJlc291cmNlIChhcyBhIHN0cmluZyk7IGl0cyB0YWIgaXMgbm90IGNsb3NlYWJsZS4gKi9cblx0cmVhZG9ubHkgbWFpbkNoYXRSZXNvdXJjZTogSU9ic2VydmFibGU8c3RyaW5nPjtcblxuXHQvKiogV2hldGhlciB0aGUgdGFiIHN0cmlwIHNob3VsZCBiZSBzaG93bi4gKi9cblx0cmVhZG9ubHkgdmlzaWJsZTogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0LyoqIEFjdGl2YXRlIChzaG93ICsgZm9jdXMpIHRoZSBnaXZlbiBjaGF0IHdpdGhpbiB0aGlzIGdyb3VwLiAqL1xuXHRvcGVuQ2hhdChyZXNvdXJjZTogVVJJKTogdm9pZDtcblxuXHQvKiogU3RhcnQgYSBuZXcgY2hhdCB3aXRoaW4gdGhpcyBncm91cC4gKi9cblx0bmV3Q2hhdCgpOiB2b2lkO1xuXG5cdC8qKiBBIGNoYXQgdGFiIGRyYWcgaGFzIHN0YXJ0ZWQgZm9yIHRoZSBnaXZlbiBjaGF0LiAqL1xuXHRvblRhYkRyYWdTdGFydD8ocmVzb3VyY2U6IFVSSSk6IHZvaWQ7XG5cblx0LyoqIEEgY2hhdCB0YWIgZHJhZyBoYXMgZW5kZWQuICovXG5cdG9uVGFiRHJhZ0VuZD8oKTogdm9pZDtcbn1cblxuLyoqXG4gKiBBIGNvbXBvc2l0ZSBiYXIgdGhhdCBkaXNwbGF5cyB0aGUgY2hhdHMgb2YgYSBzaW5nbGUgY2hhdCBncm91cCBhcyB0YWJzLlxuICogU2VsZWN0aW5nIGEgdGFiIGFjdGl2YXRlcyB0aGF0IGNoYXQgd2l0aGluIHRoZSBncm91cDsgdGFicyBjYW4gYmUgZHJhZ2dlZCB0b1xuICogYW5vdGhlciBncm91cCAob3IgdG8gYW4gZWRnZSB0byBzcGxpdCBpbnRvIGEgbmV3IGdyb3VwKS5cbiAqXG4gKiBUaGUgYmFyIGlzIGEgcGFzc2l2ZSByZW5kZXJlciBkcml2ZW4gYnkgYW4ge0BsaW5rIElDaGF0Q29tcG9zaXRlQmFyRGVsZWdhdGV9XG4gKiBzdXBwbGllZCB2aWEge0BsaW5rIHNldEdyb3VwfS5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRDb21wb3NpdGVCYXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90YWJzUm93OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdGFic0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RhYnNTY3JvbGxiYXI6IFNjcm9sbGFibGVFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90YWJzOiBJQ2hhdFRhYltdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RhYkRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9ncm91cERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRpbmdEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIF9lZGl0aW5nVGFiOiBJQ2hhdFRhYiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGVsZWdhdGU6IElDaGF0Q29tcG9zaXRlQmFyRGVsZWdhdGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX25ld0NoYXRBY3Rpb246IEFjdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfbmV3Q2hhdENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWaXNpYmlsaXR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogRXZlbnQ8Ym9vbGVhbj4gPSB0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VIZWlnaHQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfdmlzaWJsZSA9IGZhbHNlO1xuXG5cdGdldCBlbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGFpbmVyO1xuXHR9XG5cblx0Z2V0IHZpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Zpc2libGU7XG5cdH1cblxuXHRnZXQgaGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3Zpc2libGUgPyB0aGlzLl9jb250YWluZXIub2Zmc2V0SGVpZ2h0IDogMDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZTogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9jb250YWluZXIgPSAkKCcuY2hhdC1jb21wb3NpdGUtYmFyLnNlc3Npb24tY2hhdC10YWJzLWJhcicpO1xuXG5cdFx0Ly8gVGFicyByb3cgXHUyMDE0IG9ubHkgc2hvd24gd2hlbiB0aGUgZ3JvdXAgaGFzIG11bHRpcGxlIGNoYXRzIG9yIGlzIHNwbGl0IG91dC5cblx0XHR0aGlzLl90YWJzUm93ID0gJCgnLmNoYXQtY29tcG9zaXRlLWJhci10YWJzLXJvdycpO1xuXHRcdHRoaXMuX2NvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl90YWJzUm93KTtcblxuXHRcdHRoaXMuX3RhYnNDb250YWluZXIgPSAkKCcuY2hhdC1jb21wb3NpdGUtYmFyLXRhYnMnKTtcblx0XHR0aGlzLl90YWJzQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgncm9sZScsICd0YWJsaXN0Jyk7XG5cdFx0dGhpcy5fdGFic0NvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnY2hhdFRhYnNBcmlhTGFiZWwnLCBcIkNoYXRzXCIpKTtcblx0XHR0aGlzLl90YWJzU2Nyb2xsYmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNjcm9sbGFibGVFbGVtZW50KHRoaXMuX3RhYnNDb250YWluZXIsIHtcblx0XHRcdGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuLFxuXHRcdFx0dmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuLFxuXHRcdFx0c2Nyb2xsWVRvWDogdHJ1ZSxcblx0XHRcdHVzZVNoYWRvd3M6IGZhbHNlLFxuXHRcdH0pKTtcblx0XHR0aGlzLl90YWJzUm93LmFwcGVuZENoaWxkKHRoaXMuX3RhYnNTY3JvbGxiYXIuZ2V0RG9tTm9kZSgpKTtcblxuXHRcdGNvbnN0IHByZXZlbnRNaWRkbGVCdXR0b25EZWZhdWx0ID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLmJ1dHRvbiA9PT0gMSAmJiAhdGhpcy5faXNJblRhYklucHV0KGUpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIodGhpcy5fdGFic0NvbnRhaW5lciwgcHJldmVudE1pZGRsZUJ1dHRvbkRlZmF1bHQpKTtcblx0XHQvLyBQcmV2ZW50IExpbnV4IHByaW1hcnktc2VsZWN0aW9uIHBhc3RlIGFmdGVyIHRoZSBtaWRkbGUtYnV0dG9uIHJlbGVhc2UgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMDE2OTYpLlxuXHRcdGlmIChpc0xpbnV4KSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlVXBMaXN0ZW5lcih0aGlzLl90YWJzQ29udGFpbmVyLCBwcmV2ZW50TWlkZGxlQnV0dG9uRGVmYXVsdCkpO1xuXHRcdH1cblxuXHRcdC8vIFwiTmV3IENoYXRcIiBidXR0b24gcGlubmVkIGF0IHRoZSBlbmQgb2YgdGhlIHRhYiBzdHJpcC4gU3RhcnRpbmcgYSBuZXcgY2hhdFxuXHRcdC8vIGlzIG9mZmVyZWQgaGVyZSB3aGlsZSB0aGUgdGFicyBhcmUgc2hvd247IHdoZW4gdGhlIHNlc3Npb24gaGFzIGEgc2luZ2xlXG5cdFx0Ly8gY2hhdCB0aGUgc2Vzc2lvbiBoZWFkZXIgdG9vbGJhciBvZmZlcnMgaXQgaW5zdGVhZC5cblx0XHRjb25zdCBuZXdDaGF0QWN0aW9uID0gdGhpcy5fbmV3Q2hhdEFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb24oXG5cdFx0XHQnY2hhdENvbXBvc2l0ZUJhci5hZGRDaGF0Jyxcblx0XHRcdGxvY2FsaXplKCdjaGF0Q29tcG9zaXRlQmFyLmFkZENoYXQnLCBcIk5ldyBDaGF0XCIpLFxuXHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uYWRkKSxcblx0XHRcdHRydWUsXG5cdFx0XHRhc3luYyAoKSA9PiB0aGlzLl9kZWxlZ2F0ZT8ubmV3Q2hhdCgpLFxuXHRcdCkpO1xuXHRcdGNvbnN0IG5ld0NoYXRBY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKHRoaXMuX3RhYnNSb3csIHsgYWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogdW5kZWZpbmVkIH0pKTtcblx0XHRuZXdDaGF0QWN0aW9uQmFyLnB1c2gobmV3Q2hhdEFjdGlvbiwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0dGhpcy5fbmV3Q2hhdENvbnRhaW5lciA9IG5ld0NoYXRBY3Rpb25CYXIuZ2V0Q29udGFpbmVyKCk7XG5cdFx0dGhpcy5fbmV3Q2hhdENvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LWNvbXBvc2l0ZS1iYXItbmV3LWNoYXQnKTtcblxuXHRcdC8vIEtlZXAgdGhlIHZpc3VhbCBzY3JvbGxiYXIgaW4gc3luYyB3aXRoIG5hdGl2ZSBzY3JvbGxpbmcgaW5zaWRlIHRoZSB0YWJzIGNvbnRhaW5lclxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl90YWJzQ29udGFpbmVyLCBFdmVudFR5cGUuU0NST0xMLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl90YWJzU2Nyb2xsYmFyLnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsTGVmdDogdGhpcy5fdGFic0NvbnRhaW5lci5zY3JvbGxMZWZ0IH0pO1xuXHRcdH0pKTtcblxuXHRcdC8vIEZvcndhcmQgc2Nyb2xsYmFyIGNoYW5nZXMgKGUuZy4gZnJvbSBtb3VzZSB3aGVlbCkgYmFjayB0byB0aGUgbmF0aXZlIHNjcm9sbCBwb3NpdGlvblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RhYnNTY3JvbGxiYXIub25TY3JvbGwoZSA9PiB7XG5cdFx0XHRpZiAoZS5zY3JvbGxMZWZ0Q2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLl90YWJzQ29udGFpbmVyLnNjcm9sbExlZnQgPSBlLnNjcm9sbExlZnQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU2Nyb2xsIGFjdGl2ZSB0YWIgaW50byB2aWV3ICsgdXBkYXRlIHNjcm9sbCBkaW1lbnNpb25zIG9uIHJlc2l6ZVxuXHRcdGNvbnN0IHJlc2l6ZU9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVSZXNpemVPYnNlcnZlcignQ2hhdENvbXBvc2l0ZUJhci5hY3RpdmVUYWJSZXZlYWwnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVTY3JvbGxEaW1lbnNpb25zKCk7XG5cdFx0XHR0aGlzLl9yZXZlYWxBY3RpdmVUYWIoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLl90YWJzQ29udGFpbmVyKSk7XG5cblx0XHQvLyBSZXBvcnQgaGVpZ2h0IGNoYW5nZXMgc28gdGhlIGhvc3QgY2FuIHJlLWxheW91dFxuXHRcdGNvbnN0IGhlaWdodE9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVSZXNpemVPYnNlcnZlcignQ2hhdENvbXBvc2l0ZUJhci5oZWlnaHQnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGhlaWdodE9ic2VydmVyLm9ic2VydmUodGhpcy5fY29udGFpbmVyKSk7XG5cblx0XHR0aGlzLl9zZXRWaXNpYmxlKGZhbHNlKTtcblx0XHR0aGlzLl91cGRhdGVTdHlsZXMoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKCgpID0+IHRoaXMuX3VwZGF0ZVN0eWxlcygpKSk7XG5cdH1cblxuXHQvKipcblx0ICogVGVsbHMgdGhlIGJhciB3aGljaCBjaGF0IGdyb3VwIHRvIHJlbmRlci4gVGhlIGJhciB3aWxsIGRpc3BsYXkgdGhlIGNoYXRzXG5cdCAqIG9mIHRoZSBnaXZlbiBncm91cCBhbmQgdHJhY2sgaXRzIGFjdGl2ZSBjaGF0LiBQYXNzIGB1bmRlZmluZWRgIHRvIGNsZWFyLlxuXHQgKi9cblx0c2V0R3JvdXAoZGVsZWdhdGU6IElDaGF0Q29tcG9zaXRlQmFyRGVsZWdhdGUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGVsZWdhdGUgPT09IGRlbGVnYXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGVsZWdhdGUgPSBkZWxlZ2F0ZTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX2dyb3VwRGlzcG9zYWJsZXMudmFsdWUgPSBzdG9yZTtcblxuXHRcdGlmICghZGVsZWdhdGUpIHtcblx0XHRcdHRoaXMuX3JlYnVpbGRUYWJzKFtdLCAnJywgJycpO1xuXHRcdFx0dGhpcy5fc2V0VmlzaWJsZShmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVmlzaWJpbGl0eSBpcyBkcml2ZW4gcmVhY3RpdmVseSBieSB0aGUgb3duaW5nIGdyb3VwIHZpYSBgZGVsZWdhdGUudmlzaWJsZWAuXG5cdFx0dGhpcy5fc2V0VmlzaWJsZShmYWxzZSk7XG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNoYXRzID0gZGVsZWdhdGUuY2hhdHMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYWN0aXZlQ2hhdFVyaSA9IGRlbGVnYXRlLmFjdGl2ZUNoYXRSZXNvdXJjZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBtYWluQ2hhdFVyaSA9IGRlbGVnYXRlLm1haW5DaGF0UmVzb3VyY2UucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fcmVidWlsZFRhYnMoY2hhdHMsIGFjdGl2ZUNoYXRVcmksIG1haW5DaGF0VXJpKTtcblxuXHRcdFx0Ly8gVGhlIHRyYWlsaW5nIFwiTmV3IENoYXRcIiBhY3Rpb24gb25seSBhcHBsaWVzIHRvIHNlc3Npb25zIHRoYXQgc3VwcG9ydFxuXHRcdFx0Ly8gdXNlci1jcmVhdGVkIHBlZXIgY2hhdHMuIFN1YmFnZW50IChyZWFkLW9ubHkpIHRhYnMgY2FuIHN1cmZhY2UgaW5cblx0XHRcdC8vIHNlc3Npb25zIHdpdGhvdXQgdGhhdCBjYXBhYmlsaXR5LCBzbyBnYXRlIHRoZSBhY3Rpb24gb24gdGhlXG5cdFx0XHQvLyBjYXBhYmlsaXR5IHJhdGhlciB0aGFuIG9uIHRhYi1zdHJpcCB2aXNpYmlsaXR5LlxuXHRcdFx0Y29uc3Qgc3VwcG9ydHNNdWx0aXBsZUNoYXRzID0gZGVsZWdhdGUuc2Vzc2lvbi5jYXBhYmlsaXRpZXMucmVhZChyZWFkZXIpLnN1cHBvcnRzTXVsdGlwbGVDaGF0cztcblx0XHRcdHRoaXMuX25ld0NoYXRDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIXN1cHBvcnRzTXVsdGlwbGVDaGF0cyk7XG5cdFx0XHQvLyBBcmNoaXZlZCBzZXNzaW9ucyBhcmUgcmVhZC1vbmx5LCBzbyBkaXNhYmxlIHRoZSB0cmFpbGluZyBOZXcgQ2hhdFxuXHRcdFx0Ly8gYWN0aW9uIChtaXJyb3JzIHRoZSBoZWFkZXIgYWN0aW9uJ3MgU2Vzc2lvbklzQXJjaGl2ZWRDb250ZXh0IGdhdGluZykuXG5cdFx0XHR0aGlzLl9uZXdDaGF0QWN0aW9uLmVuYWJsZWQgPSBzdXBwb3J0c011bHRpcGxlQ2hhdHMgJiYgIWRlbGVnYXRlLnNlc3Npb24uaXNBcmNoaXZlZC5yZWFkKHJlYWRlcik7XG5cblx0XHRcdHRoaXMuX3NldFZpc2libGUoZGVsZWdhdGUudmlzaWJsZS5yZWFkKHJlYWRlcikpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHNldEFyaWFMYWJlbChsYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdGFic0NvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsYWJlbCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWJ1aWxkVGFicyhjaGF0czogcmVhZG9ubHkgSUNoYXRbXSwgYWN0aXZlQ2hhdElkOiBzdHJpbmcsIG1haW5DaGF0SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2NhbmNlbFRhYkVkaXRpbmcoKTtcblx0XHR0aGlzLl90YWJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX3RhYnMubGVuZ3RoID0gMDtcblx0XHRyZXNldCh0aGlzLl90YWJzQ29udGFpbmVyKTtcblxuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBjaGF0cykge1xuXHRcdFx0dGhpcy5fY3JlYXRlVGFiKGNoYXQsIGNoYXQucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gbWFpbkNoYXRJZCwgYWN0aXZlQ2hhdElkKTtcblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVBY3RpdmVUYWIoYWN0aXZlQ2hhdElkKTtcblx0XHR0aGlzLl91cGRhdGVTY3JvbGxEaW1lbnNpb25zKCk7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTY3JvbGxEaW1lbnNpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuX3RhYnNTY3JvbGxiYXIuc2V0U2Nyb2xsRGltZW5zaW9ucyh7XG5cdFx0XHR3aWR0aDogdGhpcy5fdGFic0NvbnRhaW5lci5jbGllbnRXaWR0aCxcblx0XHRcdHNjcm9sbFdpZHRoOiB0aGlzLl90YWJzQ29udGFpbmVyLnNjcm9sbFdpZHRoLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlVGFiKGNoYXQ6IElDaGF0LCBpc01haW5DaGF0OiBib29sZWFuLCBfYWN0aXZlQ2hhdElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBkZWxlZ2F0ZSA9IHRoaXMuX2RlbGVnYXRlO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBkZWxlZ2F0ZT8uc2Vzc2lvbjtcblx0XHRjb25zdCB0YWIgPSAkKCcuY2hhdC1jb21wb3NpdGUtYmFyLXRhYi5tb2Rlcm4tdWktZWRpdG9yLXRhYicpO1xuXHRcdHRhYi50YWJJbmRleCA9IDA7XG5cdFx0dGFiLnNldEF0dHJpYnV0ZSgncm9sZScsICd0YWInKTtcblx0XHR0YWIuZHJhZ2dhYmxlID0gdHJ1ZTtcblx0XHQvLyBFeHBvc2UgdGhlIGJvdW5kIGNoYXQgcmVzb3VyY2UgZm9yIGRpYWdub3N0aWNzIC8gdGVzdCBhdXRvbWF0aW9uLlxuXHRcdHRhYi5kYXRhc2V0LmNoYXRSZXNvdXJjZSA9IGNoYXQucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHR0YWIuZGF0YXNldC5pc01haW5DaGF0ID0gU3RyaW5nKGlzTWFpbkNoYXQpO1xuXG5cdFx0Y29uc3QgdGFiRmlsbCA9ICQoJy5jaGF0LWNvbXBvc2l0ZS1iYXItdGFiLWZpbGwubW9kZXJuLXVpLWVkaXRvci10YWItZmlsbCcsIHsgJ2FyaWEtaGlkZGVuJzogdHJ1ZSB9KTtcblx0XHR0YWIuYXBwZW5kQ2hpbGQodGFiRmlsbCk7XG5cblx0XHRjb25zdCBsYWJlbEVsID0gJCgnLmNoYXQtY29tcG9zaXRlLWJhci10YWItbGFiZWwubW9kZXJuLXVpLWVkaXRvci10YWItbGFiZWwnKTtcblx0XHR0aGlzLl90YWJEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBjaGF0LnRpdGxlLnJlYWQocmVhZGVyKTtcblx0XHRcdGxhYmVsRWwudGV4dENvbnRlbnQgPSB0aXRsZTtcblx0XHR9KSk7XG5cblx0XHQvLyBMb2NrIGljb24gc2hvd24gZm9yIHJlYWQtb25seSAobm9uLWludGVyYWN0aXZlKSBjaGF0cy5cblx0XHRjb25zdCBsb2NrSWNvbiA9ICQoJy5jaGF0LWNvbXBvc2l0ZS1iYXItdGFiLWxvY2snKTtcblx0XHRsb2NrSWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ubG9jaykpO1xuXHRcdHRhYi5hcHBlbmRDaGlsZChsb2NrSWNvbik7XG5cdFx0dGhpcy5fdGFiRGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGlzUmVhZE9ubHkgPSBjaGF0LmludGVyYWN0aXZpdHkucmVhZChyZWFkZXIpID09PSBDaGF0SW50ZXJhY3Rpdml0eS5SZWFkT25seTtcblx0XHRcdHRhYi5jbGFzc0xpc3QudG9nZ2xlKCdyZWFkLW9ubHknLCBpc1JlYWRPbmx5KTtcblx0XHRcdHRhYi5kYXRhc2V0LmludGVyYWN0aXZpdHkgPSBjaGF0LmludGVyYWN0aXZpdHkucmVhZChyZWFkZXIpO1xuXHRcdH0pKTtcblxuXHRcdHRhYi5hcHBlbmRDaGlsZChsYWJlbEVsKTtcblxuXHRcdC8vIEVtcHR5IHJlbmFtZSBob3N0OyBhbiBJbnB1dEJveCBpcyBjcmVhdGVkIGluc2lkZSBpdCBvbmx5IHdoaWxlIGVkaXRpbmcuXG5cdFx0Y29uc3QgaW5wdXRDb250YWluZXIgPSAkKCcuY2hhdC1jb21wb3NpdGUtYmFyLXRhYi1pbnB1dC1jb250YWluZXInKTtcblx0XHR0YWIuYXBwZW5kQ2hpbGQoaW5wdXRDb250YWluZXIpO1xuXG5cdFx0Ly8gRGVsYXllZCBob3ZlciBzaG93aW5nIHRoZSBmdWxsIGNoYXQgdGl0bGUgKHVzZWZ1bCB3aGVuIHRoZSB0aXRsZSBpcyB0cnVuY2F0ZWQpXG5cdFx0dGhpcy5fdGFiRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcihcblx0XHRcdGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksXG5cdFx0XHR0YWIsXG5cdFx0XHQoKSA9PiBjaGF0LnRpdGxlLmdldCgpLFxuXHRcdCkpO1xuXG5cdFx0Ly8gVHJhY2sgdW50aXRsZWQgc3RhdGUgZm9yIHN0eWxpbmcgKGRpcnR5IGRvdCArIGNsb3NlIGJ1dHRvbilcblx0XHR0aGlzLl90YWJEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdHVzID0gY2hhdC5zdGF0dXMucmVhZChyZWFkZXIpO1xuXHRcdFx0dGFiLmNsYXNzTGlzdC50b2dnbGUoJ3VudGl0bGVkJywgc3RhdHVzID09PSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKTtcblx0XHR9KSk7XG5cblx0XHQvLyBUcmFjayB1bnJlYWQgLyBuZWVkcy1pbnB1dCAvIGluLXByb2dyZXNzIHN0YXRlIGZvciB0aGUgaW5kaWNhdG9yLlxuXHRcdC8vIFByZWNlZGVuY2U6IG5lZWRzLWlucHV0ICh1bnJlYWQpID4gaW4tcHJvZ3Jlc3MgKHNwaW5uZXIpID4gdW5yZWFkIHdoZW4gbm90IGFjdGl2ZS5cblx0XHQvLyBBdCBtb3N0IG9uZSBpbmRpY2F0b3IgaXMgc2hvd24gYXQgYSB0aW1lLlxuXHRcdGNvbnN0IGluZGljYXRvciA9ICQoJy5jaGF0LWNvbXBvc2l0ZS1iYXItdGFiLWluZGljYXRvcicpO1xuXHRcdGNvbnN0IGluZGljYXRvckljb24gPSAkKCcuY2hhdC1jb21wb3NpdGUtYmFyLXRhYi1pbmRpY2F0b3ItaWNvbicpO1xuXHRcdGluZGljYXRvci5hcHBlbmRDaGlsZChpbmRpY2F0b3JJY29uKTtcblx0XHR0aGlzLl90YWJEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgaXNBY3RpdmUgPSBkZWxlZ2F0ZT8uYWN0aXZlQ2hhdFJlc291cmNlLnJlYWQocmVhZGVyKSA9PT0gY2hhdC5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3Qgc3RhdHVzID0gY2hhdC5zdGF0dXMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaXNSZWFkID0gY2hhdC5pc1JlYWQucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRsZXQgbW9kZTogJ25lZWRzLWlucHV0JyB8ICd1bnJlYWQnIHwgJ2luLXByb2dyZXNzJyB8ICdub25lJyA9ICdub25lJztcblx0XHRcdGlmIChzdGF0dXMgPT09IFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCkge1xuXHRcdFx0XHRtb2RlID0gJ25lZWRzLWlucHV0Jztcblx0XHRcdH0gZWxzZSBpZiAoc3RhdHVzID09PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpIHtcblx0XHRcdFx0bW9kZSA9ICdpbi1wcm9ncmVzcyc7XG5cdFx0XHR9IGVsc2UgaWYgKCFpc1JlYWQgJiYgIWlzQWN0aXZlKSB7XG5cdFx0XHRcdG1vZGUgPSAndW5yZWFkJztcblx0XHRcdH1cblxuXHRcdFx0dGFiLmNsYXNzTGlzdC50b2dnbGUoJ25lZWRzLWlucHV0JywgbW9kZSA9PT0gJ25lZWRzLWlucHV0Jyk7XG5cdFx0XHR0YWIuY2xhc3NMaXN0LnRvZ2dsZSgndW5yZWFkJywgbW9kZSA9PT0gJ3VucmVhZCcpO1xuXHRcdFx0dGFiLmNsYXNzTGlzdC50b2dnbGUoJ2luLXByb2dyZXNzJywgbW9kZSA9PT0gJ2luLXByb2dyZXNzJyk7XG5cblx0XHRcdGluZGljYXRvckljb24uY2xhc3NOYW1lID0gJ2NoYXQtY29tcG9zaXRlLWJhci10YWItaW5kaWNhdG9yLWljb24nO1xuXHRcdFx0aWYgKG1vZGUgPT09ICdpbi1wcm9ncmVzcycpIHtcblx0XHRcdFx0aW5kaWNhdG9ySWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KFRoZW1lSWNvbi5tb2RpZnkoQ29kaWNvbi5sb2FkaW5nLCAnc3BpbicpKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGFiLmFwcGVuZENoaWxkKGluZGljYXRvcik7XG5cblx0XHQvLyBDbG9zZSBidXR0b24gXHUyMDE0IGNvbnRyaWJ1dGVkIHZpYSBNZW51cy5TZXNzaW9uQ2hhdFRhYiAodGhlIGNoYXQgdGFiIG1lbnUpLlxuXHRcdC8vIE9ubHkgbm9uLW1haW4gY2hhdHMgY2FuIGJlIGNsb3NlZDsgdGhlIG1haW4gY2hhdCBsaXZlcyBhbmQgZGllcyB3aXRoIGl0c1xuXHRcdC8vIHNlc3Npb24sIHNvIGl0cyB0YWIgcmVuZGVycyBubyBhY3Rpb25zIHRvb2xiYXIuIFRoZSB0YWIncyBjaGF0IChhbmQgaXRzXG5cdFx0Ly8gc2Vzc2lvbikgaXMgZm9yd2FyZGVkIGFzIHRoZSBhY3Rpb24gYXJndW1lbnQuXG5cdFx0aWYgKCFpc01haW5DaGF0ICYmIHNlc3Npb24pIHtcblx0XHRcdGNvbnN0IGFjdGlvbnNDb250YWluZXIgPSAkKCcuY2hhdC1jb21wb3NpdGUtYmFyLXRhYi1hY3Rpb25zJyk7XG5cdFx0XHR0YWIuYXBwZW5kQ2hpbGQoYWN0aW9uc0NvbnRhaW5lcik7XG5cdFx0XHRjb25zdCB0YWJUb29sYmFyID0gdGhpcy5fdGFiRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBhY3Rpb25zQ29udGFpbmVyLCBNZW51cy5TZXNzaW9uQ2hhdFRhYiwge1xuXHRcdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5JZ25vcmUsXG5cdFx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHByaW1hcnlHcm91cDogKCkgPT4gdHJ1ZSB9LFxuXHRcdFx0fSkpO1xuXHRcdFx0dGFiVG9vbGJhci5jb250ZXh0ID0geyBzZXNzaW9uLCBjaGF0IH07XG5cdFx0fVxuXG5cdFx0dGhpcy5fdGFic0NvbnRhaW5lci5hcHBlbmRDaGlsZCh0YWIpO1xuXG5cdFx0Y29uc3QgY2hhdFRhYjogSUNoYXRUYWIgPSB7IGNoYXQsIGVsZW1lbnQ6IHRhYiwgaW5wdXRDb250YWluZXIgfTtcblxuXHRcdHRoaXMuX3RhYkRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFiLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdC8vIENhbmNlbCBhbnkgaW4tcHJvZ3Jlc3MgcmVuYW1lIGJlZm9yZSBzd2l0Y2hpbmcgdG8gdGhlIGNsaWNrZWQgdGFiLlxuXHRcdFx0dGhpcy5fY2FuY2VsVGFiRWRpdGluZygpO1xuXHRcdFx0dGhpcy5fZGVsZWdhdGU/Lm9wZW5DaGF0KGNoYXQucmVzb3VyY2UpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3RhYkRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFiLCBFdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHRoaXMuX2RlbGVnYXRlPy5vcGVuQ2hhdChjaGF0LnJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl90YWJEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhYiwgRXZlbnRUeXBlLkFVWENMSUNLLCBlID0+IHtcblx0XHRcdGlmIChlLmJ1dHRvbiAhPT0gMSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5faXNJblRhYklucHV0KGUpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdGlmIChpc01haW5DaGF0IHx8ICFzZXNzaW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fY2FuY2VsVGFiRWRpdGluZygpO1xuXHRcdFx0dm9pZCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChDTE9TRV9DSEFUX0NPTU1BTkRfSUQsIHsgc2Vzc2lvbiwgY2hhdCB9KS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQSB0YWIgZHJhZyBjYXJyaWVzIHR3byBwYXlsb2FkczogYSBncm91cC1tb3ZlIHBheWxvYWQgKHRvIG1vdmUvc3BsaXQgdGhlXG5cdFx0Ly8gY2hhdCBiZXR3ZWVuIGdyaWQgZ3JvdXBzKSBhbmQgYSBjaGF0LXJlZmVyZW5jZSBwYXlsb2FkICh0byBkcm9wIGludG8gYW5cblx0XHQvLyBhZ2VudC1ob3N0IGNoYXQgaW5wdXQgYXMgYW4gaW5saW5lIGAjY2hhdDpgIHJlZmVyZW5jZSkuXG5cdFx0dGhpcy5fdGFiRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWIsIEV2ZW50VHlwZS5EUkFHX1NUQVJULCAoZTogRHJhZ0V2ZW50KSA9PiB7XG5cdFx0XHRpZiAoIWRlbGVnYXRlIHx8ICFlLmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIERvbid0IHN0YXJ0IGEgZHJhZyBmcm9tIHRoZSB0YWIncyBhY3Rpb25zIHRvb2xiYXIgKGUuZy4gY2xvc2UpLCBhXG5cdFx0XHQvLyBzbWFsbCBwb2ludGVyIG1vdmUgZHVyaW5nIGEgYnV0dG9uIGNsaWNrIHdvdWxkIG90aGVyd2lzZSBzd2FsbG93IGl0LlxuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdFx0aWYgKHRhcmdldD8uY2xvc2VzdCgnLmNoYXQtY29tcG9zaXRlLWJhci10YWItYWN0aW9ucycpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRG9uJ3Qgc3RhcnQgYSBkcmFnIHdoaWxlIGFueSB0YWIgcmVuYW1lIGlzIGluIHByb2dyZXNzLlxuXHRcdFx0aWYgKHRoaXMuX2VkaXRpbmdUYWIpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jYW5jZWxUYWJFZGl0aW5nKCk7XG5cblx0XHRcdC8vIEdyb3VwLW1vdmUgcGF5bG9hZCAob24gZGF0YVRyYW5zZmVyLCBub3QgdGhlIHNoYXJlZCBMb2NhbFNlbGVjdGlvblRyYW5zZmVyXG5cdFx0XHQvLyBzaW5nbGV0b24pIGxldHMgdGhlIGNoYXQgYmUgbW92ZWQgYmV0d2VlbiBncm91cHMgLyBzcGxpdCBvdXQuIEl0IG11c3Qgbm90XG5cdFx0XHQvLyB1c2UgdGhlIHNpbmdsZXRvbiBiZWNhdXNlIHRoZSBjaGF0LXJlZmVyZW5jZSBwYXlsb2FkIGJlbG93IGFsc28gdXNlcyBpdCxcblx0XHRcdC8vIGFuZCB0aGUgc2luZ2xldG9uIGhvbGRzIG9ubHkgb25lIHBheWxvYWQgYXQgYSB0aW1lLlxuXHRcdFx0ZmlsbFNlc3Npb25DaGF0RHJhZ0RhdGEoZSwgZGVsZWdhdGUuc2Vzc2lvbi5zZXNzaW9uSWQsIGNoYXQucmVzb3VyY2UpO1xuXG5cdFx0XHQvLyBDaGF0LXJlZmVyZW5jZSBwYXlsb2FkOiByZXF1aXJlcyB0aGUgb3BhcXVlIGJhY2tlbmQgY2hhdCBVUkksIHdoaWNoXG5cdFx0XHQvLyBvbmx5IHRoZSBvd25pbmcgYWdlbnQtaG9zdCBwcm92aWRlciBrbm93cy4gV2hlbiBpdCBpcyB1bmF2YWlsYWJsZVxuXHRcdFx0Ly8gKG5vdCBhZ2VudC1ob3N0IGJhY2tlZCwgb3Igc3RhdGUgbm90IHlldCBoeWRyYXRlZCkgdGhlIGRyYWcgc2ltcGx5XG5cdFx0XHQvLyBjYXJyaWVzIG5vIHJlZmVyZW5jZS5cblx0XHRcdGNvbnN0IGJhY2tlbmRDaGF0UmVzb3VyY2UgPSB0aGlzLl9iYWNrZW5kQ2hhdFJlc291cmNlKGNoYXQpO1xuXHRcdFx0aWYgKGJhY2tlbmRDaGF0UmVzb3VyY2UpIHtcblx0XHRcdFx0ZmlsbENoYXRSZWZlcmVuY2VEcmFnRGF0YShlLCBiYWNrZW5kQ2hhdFJlc291cmNlLCBjaGF0LnJlc291cmNlLCBjaGF0LnRpdGxlLmdldCgpKTtcblx0XHRcdH1cblxuXHRcdFx0ZS5kYXRhVHJhbnNmZXIuZWZmZWN0QWxsb3dlZCA9ICdjb3B5TW92ZSc7XG5cdFx0XHRhcHBseURyYWdJbWFnZShlLCB0YWIsIGNoYXQudGl0bGUuZ2V0KCkpO1xuXHRcdFx0ZGVsZWdhdGUub25UYWJEcmFnU3RhcnQ/LihjaGF0LnJlc291cmNlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl90YWJEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhYiwgRXZlbnRUeXBlLkRSQUdfRU5ELCAoKSA9PiB7XG5cdFx0XHRjbGVhckNoYXRSZWZlcmVuY2VEcmFnRGF0YSgpO1xuXHRcdFx0dGhpcy5fZGVsZWdhdGU/Lm9uVGFiRHJhZ0VuZD8uKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVuYW1lQWN0aW9uID0gdGhpcy5fdGFiRGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oJ3Nlc3Npb25Db21wb3NpdGVCYXIucmVuYW1lQ2hhdCcsIGxvY2FsaXplKCdyZW5hbWVDaGF0JywgXCJSZW5hbWVcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5fc3RhcnRUYWJFZGl0aW5nKGNoYXRUYWIpO1xuXHRcdH0pKTtcblxuXHRcdC8vIERlbGV0ZSBwZXJtYW5lbnRseSByZW1vdmVzIHRoZSBjaGF0IChkZXN0cnVjdGl2ZSkuIE9ubHkgbm9uLW1haW4gY2hhdHNcblx0XHQvLyBjYW4gYmUgZGVsZXRlZDsgdGhlIG1haW4gY2hhdCBsaXZlcyBhbmQgZGllcyB3aXRoIGl0cyBzZXNzaW9uLlxuXHRcdGNvbnN0IGRlbGV0ZUFjdGlvbiA9IHRoaXMuX3RhYkRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKCdzZXNzaW9uQ29tcG9zaXRlQmFyLmRlbGV0ZUNoYXQnLCBsb2NhbGl6ZSgnZGVsZXRlQ2hhdCcsIFwiRGVsZXRlIENoYXRcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKGRlbGVnYXRlKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZGVsZXRlQ2hhdChkZWxlZ2F0ZS5zZXNzaW9uLCBjaGF0LnJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBEb3VibGUtY2xpY2sgdGhlIHRhYiB0byBzdGFydCBhbiBpbmxpbmUgcmVuYW1lLCBtaXJyb3JpbmcgdGhlIHNlc3Npb24gdGl0bGUuXG5cdFx0dGhpcy5fdGFiRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWIsIEV2ZW50VHlwZS5EQkxDTElDSywgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGlmIChjaGF0LnN0YXR1cy5nZXQoKSA9PT0gU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCB8fCAhZ2V0Q2hhdENhcGFiaWxpdGllcyhjaGF0LCBzZXNzaW9uLCB1bmRlZmluZWQpLmNhblJlbmFtZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5fc3RhcnRUYWJFZGl0aW5nKGNoYXRUYWIpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3RhYkRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFiLCBFdmVudFR5cGUuQ09OVEVYVF9NRU5VLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0Ly8gTm8gY29udGV4dCBtZW51IGZvciB1bnRpdGxlZCBjaGF0c1xuXHRcdFx0aWYgKGNoYXQuc3RhdHVzLmdldCgpID09PSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudChnZXRXaW5kb3codGFiKSwgZSk7XG5cdFx0XHR0aGlzLl9jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBldmVudCxcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNhcGFiaWxpdGllcyA9IGdldENoYXRDYXBhYmlsaXRpZXMoY2hhdCwgc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb25zID0gW107XG5cdFx0XHRcdFx0aWYgKGNhcGFiaWxpdGllcy5jYW5SZW5hbWUpIHtcblx0XHRcdFx0XHRcdGFjdGlvbnMucHVzaChyZW5hbWVBY3Rpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoY2FwYWJpbGl0aWVzLmNhbkRlbGV0ZSkge1xuXHRcdFx0XHRcdFx0YWN0aW9ucy5wdXNoKGRlbGV0ZUFjdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBhY3Rpb25zO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl90YWJzLnB1c2goY2hhdFRhYik7XG5cdH1cblxuXHRwcml2YXRlIF9pc0luVGFiSW5wdXQoZXZlbnQ6IE1vdXNlRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNIVE1MRWxlbWVudChldmVudC50YXJnZXQpICYmICEhZXZlbnQudGFyZ2V0LmNsb3Nlc3QoJy5jaGF0LWNvbXBvc2l0ZS1iYXItdGFiLWlucHV0LWNvbnRhaW5lcicpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBvcGFxdWUgYmFja2VuZCBjaGF0IFVSSSBmb3IgYSBjaGF0IHRhYiBzbyBhIGRyYWdnZWQgYCNjaGF0OmBcblx0ICogcmVmZXJlbmNlIGNhbiBjYXJyeSBpdC4gUmVhY2hlcyB0aGUgb3duaW5nIGFnZW50LWhvc3QgcHJvdmlkZXIgYnkgaWQgYW5kXG5cdCAqIGFza3MgaXQgdG8gbG9vayB1cCB0aGUgaG9zdC1zdXBwbGllZCBiYWNrZW5kIHJlc291cmNlLiBSZXR1cm5zIGB1bmRlZmluZWRgXG5cdCAqIHdoZW4gdGhlIHNlc3Npb24gaXMgbm90IGFnZW50LWhvc3QgYmFja2VkIG9yIHRoZSBwcm92aWRlciBoYXMgbm8gaHlkcmF0ZWRcblx0ICogc3RhdGUgZm9yIHRoZSBjaGF0IFx1MjAxNCB0aGUgY2FsbGVyIHRoZW4gb2ZmZXJzIG5vIGNoYXQtcmVmZXJlbmNlIHBheWxvYWQuXG5cdCAqL1xuXHRwcml2YXRlIF9iYWNrZW5kQ2hhdFJlc291cmNlKGNoYXQ6IElDaGF0KTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwcm92aWRlcklkID0gdGhpcy5fZGVsZWdhdGU/LnNlc3Npb24ucHJvdmlkZXJJZDtcblx0XHRpZiAoIXByb3ZpZGVySWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVyKHByb3ZpZGVySWQpO1xuXHRcdHJldHVybiBwcm92aWRlciAmJiBpc0FnZW50SG9zdFByb3ZpZGVyKHByb3ZpZGVyKSA/IHByb3ZpZGVyLmdldEJhY2tlbmRDaGF0UmVzb3VyY2UoY2hhdC5yZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogU3RhcnQgYW4gaW5saW5lIHJlbmFtZSBmb3IgdGhlIGdpdmVuIHRhYi4gRW50ZXIgY29tbWl0cyB2aWFcblx0ICoge0BsaW5rIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnJlbmFtZUNoYXR9OyBFc2NhcGUgb3IgYmx1ciBjYW5jZWxzLlxuXHQgKi9cblx0cHJpdmF0ZSBfc3RhcnRUYWJFZGl0aW5nKGNoYXRUYWI6IElDaGF0VGFiKTogdm9pZCB7XG5cdFx0Y29uc3QgZGVsZWdhdGUgPSB0aGlzLl9kZWxlZ2F0ZTtcblx0XHRpZiAoIWRlbGVnYXRlIHx8IHRoaXMuX2VkaXRpbmdUYWIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IGNoYXQsIGVsZW1lbnQ6IHRhYiwgaW5wdXRDb250YWluZXIgfSA9IGNoYXRUYWI7XG5cdFx0Y29uc3QgaW5pdGlhbFRpdGxlID0gY2hhdC50aXRsZS5nZXQoKTtcblxuXHRcdHRoaXMuX2VkaXRpbmdUYWIgPSBjaGF0VGFiO1xuXHRcdHRhYi5jbGFzc0xpc3QuYWRkKCdlZGl0aW5nJyk7XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9lZGl0aW5nRGlzcG9zYWJsZXMudmFsdWUgPSBzdG9yZTtcblxuXHRcdGNvbnN0IGlucHV0Qm94ID0gc3RvcmUuYWRkKG5ldyBJbnB1dEJveChpbnB1dENvbnRhaW5lciwgdGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLCB7XG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdyZW5hbWVDaGF0LmFyaWEnLCBcIlJlbmFtZSBjaGF0XCIpLFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlcyxcblx0XHR9KSk7XG5cdFx0aW5wdXRCb3guZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LWNvbXBvc2l0ZS1iYXItdGFiLWlucHV0Jyk7XG5cdFx0aW5wdXRCb3gudmFsdWUgPSBpbml0aWFsVGl0bGU7XG5cdFx0aW5wdXRCb3guZm9jdXMoKTtcblx0XHRpbnB1dEJveC5zZWxlY3QoKTtcblxuXHRcdGxldCBmaW5pc2hlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IGZpbmlzaCA9IChjb21taXQ6IGJvb2xlYW4pID0+IHtcblx0XHRcdGlmIChmaW5pc2hlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRmaW5pc2hlZCA9IHRydWU7XG5cdFx0XHRjb25zdCBuZXdUaXRsZSA9IGlucHV0Qm94LnZhbHVlLnRyaW0oKTtcblx0XHRcdHRoaXMuX2VuZFRhYkVkaXRpbmcoKTtcblx0XHRcdGlmIChjb21taXQgJiYgbmV3VGl0bGUgJiYgbmV3VGl0bGUgIT09IGluaXRpYWxUaXRsZSkge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlXG5cdFx0XHRcdFx0LnJlbmFtZUNoYXQoZGVsZWdhdGUuc2Vzc2lvbiwgY2hhdC5yZXNvdXJjZSwgbmV3VGl0bGUpXG5cdFx0XHRcdFx0LmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0Qm94LmlucHV0RWxlbWVudCwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogSUtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGZpbmlzaCh0cnVlKTtcblx0XHRcdH0gZWxzZSBpZiAoZS5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0ZmluaXNoKGZhbHNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIERvbid0IGxldCB0eXBpbmcgbGVhayBvdXQgdG8gd29ya2JlbmNoIHNob3J0Y3V0cyAoZS5nLiBTcGFjZSkuXG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dEJveC5pbnB1dEVsZW1lbnQsIEV2ZW50VHlwZS5CTFVSLCAoKSA9PiBmaW5pc2goZmFsc2UpKSk7XG5cblx0XHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0Qm94LmVsZW1lbnQsIEV2ZW50VHlwZS5DTElDSywgZSA9PiBlLnN0b3BQcm9wYWdhdGlvbigpKSk7XG5cdFx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dEJveC5lbGVtZW50LCBFdmVudFR5cGUuREJMQ0xJQ0ssIGUgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsVGFiRWRpdGluZygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRpbmdUYWIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZW5kVGFiRWRpdGluZygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5kVGFiRWRpdGluZygpOiB2b2lkIHtcblx0XHRjb25zdCBlZGl0aW5nVGFiID0gdGhpcy5fZWRpdGluZ1RhYjtcblx0XHR0aGlzLl9lZGl0aW5nVGFiID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2VkaXRpbmdEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGlmIChlZGl0aW5nVGFiKSB7XG5cdFx0XHRlZGl0aW5nVGFiLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZWRpdGluZycpO1xuXHRcdFx0Ly8gSW5wdXRCb3guZGlzcG9zZSgpIGRvZXMgbm90IGRldGFjaCBpdHMgbm9kZSwgc28gZW1wdHkgdGhlIGNvbnRhaW5lci5cblx0XHRcdHJlc2V0KGVkaXRpbmdUYWIuaW5wdXRDb250YWluZXIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUFjdGl2ZVRhYihhY3RpdmVDaGF0SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgdGFiIG9mIHRoaXMuX3RhYnMpIHtcblx0XHRcdGNvbnN0IGlzQWN0aXZlID0gdGFiLmNoYXQucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gYWN0aXZlQ2hhdElkO1xuXHRcdFx0dGFiLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgaXNBY3RpdmUpO1xuXHRcdFx0dGFiLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJywgU3RyaW5nKGlzQWN0aXZlKSk7XG5cdFx0XHRpZiAoaXNBY3RpdmUpIHtcblx0XHRcdFx0dGFiLmVsZW1lbnQuc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ25lYXJlc3QnLCBpbmxpbmU6ICduZWFyZXN0JyB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXZlYWxBY3RpdmVUYWIoKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZlVGFiID0gdGhpcy5fdGFicy5maW5kKHQgPT4gdC5lbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnYWN0aXZlJykpO1xuXHRcdGFjdGl2ZVRhYj8uZWxlbWVudC5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnbmVhcmVzdCcsIGlubGluZTogJ25lYXJlc3QnIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2FzVmlzaWJsZSA9IHRoaXMuX3Zpc2libGU7XG5cdFx0dGhpcy5fdmlzaWJsZSA9IHZpc2libGU7XG5cdFx0dGhpcy5fY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSB0aGlzLl92aXNpYmxlID8gJycgOiAnbm9uZSc7XG5cdFx0aWYgKHdhc1Zpc2libGUgIT09IHRoaXMuX3Zpc2libGUpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5maXJlKHRoaXMuX3Zpc2libGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRhcHBseVNlc3Npb25CYXJUaGVtZUNvbG9ycyh0aGlzLl9jb250YWluZXIsIHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLFlBQVksaUJBQWlCLHlCQUF5QjtBQUUvRCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsR0FBRyx1Q0FBdUMscUNBQXFDLHVCQUF1QiwrQkFBK0IsMEJBQTBCLGFBQWEsV0FBVyxXQUFXLGVBQWUsYUFBYTtBQUN2TyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGVBQTRCO0FBQ3JDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMscUJBQXFCLDJCQUEyQjtBQUN6RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQiw0QkFBNEI7QUFDekQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQixxQkFBNEIscUJBQXFCO0FBQzdFLFNBQXlCLGtDQUFrQztBQUMzRCxTQUFTLDRCQUE0QiwyQkFBMkIsK0JBQStCO0FBQy9GLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBd0QvQixJQUFNLG1CQUFOLGNBQStCLFdBQVc7QUFBQSxFQW9DaEQsWUFDaUMsZUFDYSw0QkFDUCxxQkFDQSxxQkFDTixlQUNRLHVCQUNJLDJCQUNWLGlCQUNqQztBQUNELFVBQU07QUFUMEI7QUFDYTtBQUNQO0FBQ0E7QUFDTjtBQUNRO0FBQ0k7QUFDVjtBQXRDbkMsU0FBaUIsUUFBb0IsQ0FBQztBQUN0QyxTQUFpQixrQkFBa0IsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFFdkUsU0FBaUIsb0JBQW9CLEtBQUssVUFBVSxJQUFJLGtCQUFtQyxDQUFDO0FBQzVGLFNBQWlCLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxrQkFBbUMsQ0FBQztBQU05RixTQUFpQix5QkFBeUIsS0FBSyxVQUFVLElBQUksUUFBaUIsQ0FBQztBQUMvRSxTQUFTLHdCQUF3QyxLQUFLLHVCQUF1QjtBQUU3RSxTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ3hFLFNBQVMsb0JBQWlDLEtBQUssbUJBQW1CO0FBRWxFLFNBQVEsV0FBVztBQTBCbEIsU0FBSyxhQUFhLEVBQUUsMkNBQTJDO0FBRy9ELFNBQUssV0FBVyxFQUFFLDhCQUE4QjtBQUNoRCxTQUFLLFdBQVcsWUFBWSxLQUFLLFFBQVE7QUFFekMsU0FBSyxpQkFBaUIsRUFBRSwwQkFBMEI7QUFDbEQsU0FBSyxlQUFlLGFBQWEsUUFBUSxTQUFTO0FBQ2xELFNBQUssZUFBZSxhQUFhLGNBQWMsU0FBUyxxQkFBcUIsT0FBTyxDQUFDO0FBQ3JGLFNBQUssaUJBQWlCLEtBQUssVUFBVSxJQUFJLGtCQUFrQixLQUFLLGdCQUFnQjtBQUFBLE1BQy9FLFlBQVksb0JBQW9CO0FBQUEsTUFDaEMsVUFBVSxvQkFBb0I7QUFBQSxNQUM5QixZQUFZO0FBQUEsTUFDWixZQUFZO0FBQUEsSUFDYixDQUFDLENBQUM7QUFDRixTQUFLLFNBQVMsWUFBWSxLQUFLLGVBQWUsV0FBVyxDQUFDO0FBRTFELFVBQU0sNkJBQTZCLENBQUMsTUFBa0I7QUFDckQsVUFBSSxFQUFFLFdBQVcsS0FBSyxDQUFDLEtBQUssY0FBYyxDQUFDLEdBQUc7QUFDN0MsVUFBRSxlQUFlO0FBQUEsTUFDbEI7QUFBQSxJQUNEO0FBQ0EsU0FBSyxVQUFVLHNDQUFzQyxLQUFLLGdCQUFnQiwwQkFBMEIsQ0FBQztBQUVyRyxRQUFJLFNBQVM7QUFDWixXQUFLLFVBQVUsb0NBQW9DLEtBQUssZ0JBQWdCLDBCQUEwQixDQUFDO0FBQUEsSUFDcEc7QUFLQSxVQUFNLGdCQUFnQixLQUFLLGlCQUFpQixLQUFLLFVBQVUsSUFBSTtBQUFBLE1BQzlEO0FBQUEsTUFDQSxTQUFTLDRCQUE0QixVQUFVO0FBQUEsTUFDL0MsVUFBVSxZQUFZLFFBQVEsR0FBRztBQUFBLE1BQ2pDO0FBQUEsTUFDQSxZQUFZLEtBQUssV0FBVyxRQUFRO0FBQUEsSUFDckMsQ0FBQztBQUNELFVBQU0sbUJBQW1CLEtBQUssVUFBVSxJQUFJLFVBQVUsS0FBSyxVQUFVLEVBQUUsd0JBQXdCLE9BQVUsQ0FBQyxDQUFDO0FBQzNHLHFCQUFpQixLQUFLLGVBQWUsRUFBRSxNQUFNLE1BQU0sT0FBTyxNQUFNLENBQUM7QUFDakUsU0FBSyxvQkFBb0IsaUJBQWlCLGFBQWE7QUFDdkQsU0FBSyxrQkFBa0IsVUFBVSxJQUFJLDZCQUE2QjtBQUdsRSxTQUFLLFVBQVUsc0JBQXNCLEtBQUssZ0JBQWdCLFVBQVUsUUFBUSxNQUFNO0FBQ2pGLFdBQUssZUFBZSxrQkFBa0IsRUFBRSxZQUFZLEtBQUssZUFBZSxXQUFXLENBQUM7QUFBQSxJQUNyRixDQUFDLENBQUM7QUFHRixTQUFLLFVBQVUsS0FBSyxlQUFlLFNBQVMsT0FBSztBQUNoRCxVQUFJLEVBQUUsbUJBQW1CO0FBQ3hCLGFBQUssZUFBZSxhQUFhLEVBQUU7QUFBQSxNQUNwQztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YsVUFBTSxpQkFBaUIsS0FBSyxVQUFVLElBQUkseUJBQXlCLG9DQUFvQyxNQUFNO0FBQzVHLFdBQUssd0JBQXdCO0FBQzdCLFdBQUssaUJBQWlCO0FBQUEsSUFDdkIsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLGVBQWUsUUFBUSxLQUFLLGNBQWMsQ0FBQztBQUcxRCxVQUFNLGlCQUFpQixLQUFLLFVBQVUsSUFBSSx5QkFBeUIsMkJBQTJCLE1BQU07QUFDbkcsV0FBSyxtQkFBbUIsS0FBSztBQUFBLElBQzlCLENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxlQUFlLFFBQVEsS0FBSyxVQUFVLENBQUM7QUFFdEQsU0FBSyxZQUFZLEtBQUs7QUFDdEIsU0FBSyxjQUFjO0FBQ25CLFNBQUssVUFBVSxLQUFLLGNBQWMsc0JBQXNCLE1BQU0sS0FBSyxjQUFjLENBQUMsQ0FBQztBQUFBLEVBQ3BGO0FBQUEsRUEvRkEsSUFBSSxVQUF1QjtBQUMxQixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLFVBQW1CO0FBQ3RCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksU0FBaUI7QUFDcEIsV0FBTyxLQUFLLFdBQVcsS0FBSyxXQUFXLGVBQWU7QUFBQSxFQUN2RDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUEyRkEsU0FBUyxVQUF1RDtBQUMvRCxRQUFJLEtBQUssY0FBYyxVQUFVO0FBQ2hDO0FBQUEsSUFDRDtBQUVBLFNBQUssWUFBWTtBQUVqQixVQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsU0FBSyxrQkFBa0IsUUFBUTtBQUUvQixRQUFJLENBQUMsVUFBVTtBQUNkLFdBQUssYUFBYSxDQUFDLEdBQUcsSUFBSSxFQUFFO0FBQzVCLFdBQUssWUFBWSxLQUFLO0FBQ3RCO0FBQUEsSUFDRDtBQUdBLFNBQUssWUFBWSxLQUFLO0FBQ3RCLFVBQU0sSUFBSSxRQUFRLFlBQVU7QUFDM0IsWUFBTSxRQUFRLFNBQVMsTUFBTSxLQUFLLE1BQU07QUFDeEMsWUFBTSxnQkFBZ0IsU0FBUyxtQkFBbUIsS0FBSyxNQUFNO0FBQzdELFlBQU0sY0FBYyxTQUFTLGlCQUFpQixLQUFLLE1BQU07QUFDekQsV0FBSyxhQUFhLE9BQU8sZUFBZSxXQUFXO0FBTW5ELFlBQU0sd0JBQXdCLFNBQVMsUUFBUSxhQUFhLEtBQUssTUFBTSxFQUFFO0FBQ3pFLFdBQUssa0JBQWtCLFVBQVUsT0FBTyxVQUFVLENBQUMscUJBQXFCO0FBR3hFLFdBQUssZUFBZSxVQUFVLHlCQUF5QixDQUFDLFNBQVMsUUFBUSxXQUFXLEtBQUssTUFBTTtBQUUvRixXQUFLLFlBQVksU0FBUyxRQUFRLEtBQUssTUFBTSxDQUFDO0FBQUEsSUFDL0MsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsYUFBYSxPQUFxQjtBQUNqQyxTQUFLLGVBQWUsYUFBYSxjQUFjLEtBQUs7QUFBQSxFQUNyRDtBQUFBLEVBRVEsYUFBYSxPQUF5QixjQUFzQixZQUEwQjtBQUM3RixTQUFLLGtCQUFrQjtBQUN2QixTQUFLLGdCQUFnQixNQUFNO0FBQzNCLFNBQUssTUFBTSxTQUFTO0FBQ3BCLFVBQU0sS0FBSyxjQUFjO0FBRXpCLGVBQVcsUUFBUSxPQUFPO0FBQ3pCLFdBQUssV0FBVyxNQUFNLEtBQUssU0FBUyxTQUFTLE1BQU0sWUFBWSxZQUFZO0FBQUEsSUFDNUU7QUFFQSxTQUFLLGlCQUFpQixZQUFZO0FBQ2xDLFNBQUssd0JBQXdCO0FBRTdCLFNBQUssbUJBQW1CLEtBQUs7QUFBQSxFQUM5QjtBQUFBLEVBRVEsMEJBQWdDO0FBQ3ZDLFNBQUssZUFBZSxvQkFBb0I7QUFBQSxNQUN2QyxPQUFPLEtBQUssZUFBZTtBQUFBLE1BQzNCLGFBQWEsS0FBSyxlQUFlO0FBQUEsSUFDbEMsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLFdBQVcsTUFBYSxZQUFxQixlQUE2QjtBQUNqRixVQUFNLFdBQVcsS0FBSztBQUN0QixVQUFNLFVBQVUsVUFBVTtBQUMxQixVQUFNLE1BQU0sRUFBRSw4Q0FBOEM7QUFDNUQsUUFBSSxXQUFXO0FBQ2YsUUFBSSxhQUFhLFFBQVEsS0FBSztBQUM5QixRQUFJLFlBQVk7QUFFaEIsUUFBSSxRQUFRLGVBQWUsS0FBSyxTQUFTLFNBQVM7QUFDbEQsUUFBSSxRQUFRLGFBQWEsT0FBTyxVQUFVO0FBRTFDLFVBQU0sVUFBVSxFQUFFLDBEQUEwRCxFQUFFLGVBQWUsS0FBSyxDQUFDO0FBQ25HLFFBQUksWUFBWSxPQUFPO0FBRXZCLFVBQU0sVUFBVSxFQUFFLDBEQUEwRDtBQUM1RSxTQUFLLGdCQUFnQixJQUFJLFFBQVEsWUFBVTtBQUMxQyxZQUFNLFFBQVEsS0FBSyxNQUFNLEtBQUssTUFBTTtBQUNwQyxjQUFRLGNBQWM7QUFBQSxJQUN2QixDQUFDLENBQUM7QUFHRixVQUFNLFdBQVcsRUFBRSw4QkFBOEI7QUFDakQsYUFBUyxVQUFVLElBQUksR0FBRyxVQUFVLGlCQUFpQixRQUFRLElBQUksQ0FBQztBQUNsRSxRQUFJLFlBQVksUUFBUTtBQUN4QixTQUFLLGdCQUFnQixJQUFJLFFBQVEsWUFBVTtBQUMxQyxZQUFNLGFBQWEsS0FBSyxjQUFjLEtBQUssTUFBTSxNQUFNLGtCQUFrQjtBQUN6RSxVQUFJLFVBQVUsT0FBTyxhQUFhLFVBQVU7QUFDNUMsVUFBSSxRQUFRLGdCQUFnQixLQUFLLGNBQWMsS0FBSyxNQUFNO0FBQUEsSUFDM0QsQ0FBQyxDQUFDO0FBRUYsUUFBSSxZQUFZLE9BQU87QUFHdkIsVUFBTSxpQkFBaUIsRUFBRSx5Q0FBeUM7QUFDbEUsUUFBSSxZQUFZLGNBQWM7QUFHOUIsU0FBSyxnQkFBZ0IsSUFBSSxLQUFLLGNBQWM7QUFBQSxNQUMzQyx3QkFBd0IsU0FBUztBQUFBLE1BQ2pDO0FBQUEsTUFDQSxNQUFNLEtBQUssTUFBTSxJQUFJO0FBQUEsSUFDdEIsQ0FBQztBQUdELFNBQUssZ0JBQWdCLElBQUksUUFBUSxZQUFVO0FBQzFDLFlBQU0sU0FBUyxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQ3RDLFVBQUksVUFBVSxPQUFPLFlBQVksV0FBVyxjQUFjLFFBQVE7QUFBQSxJQUNuRSxDQUFDLENBQUM7QUFLRixVQUFNLFlBQVksRUFBRSxtQ0FBbUM7QUFDdkQsVUFBTSxnQkFBZ0IsRUFBRSx3Q0FBd0M7QUFDaEUsY0FBVSxZQUFZLGFBQWE7QUFDbkMsU0FBSyxnQkFBZ0IsSUFBSSxRQUFRLFlBQVU7QUFDMUMsWUFBTSxXQUFXLFVBQVUsbUJBQW1CLEtBQUssTUFBTSxNQUFNLEtBQUssU0FBUyxTQUFTO0FBQ3RGLFlBQU0sU0FBUyxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQ3RDLFlBQU0sU0FBUyxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBRXRDLFVBQUksT0FBMEQ7QUFDOUQsVUFBSSxXQUFXLGNBQWMsWUFBWTtBQUN4QyxlQUFPO0FBQUEsTUFDUixXQUFXLFdBQVcsY0FBYyxZQUFZO0FBQy9DLGVBQU87QUFBQSxNQUNSLFdBQVcsQ0FBQyxVQUFVLENBQUMsVUFBVTtBQUNoQyxlQUFPO0FBQUEsTUFDUjtBQUVBLFVBQUksVUFBVSxPQUFPLGVBQWUsU0FBUyxhQUFhO0FBQzFELFVBQUksVUFBVSxPQUFPLFVBQVUsU0FBUyxRQUFRO0FBQ2hELFVBQUksVUFBVSxPQUFPLGVBQWUsU0FBUyxhQUFhO0FBRTFELG9CQUFjLFlBQVk7QUFDMUIsVUFBSSxTQUFTLGVBQWU7QUFDM0Isc0JBQWMsVUFBVSxJQUFJLEdBQUcsVUFBVSxpQkFBaUIsVUFBVSxPQUFPLFFBQVEsU0FBUyxNQUFNLENBQUMsQ0FBQztBQUFBLE1BQ3JHO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixRQUFJLFlBQVksU0FBUztBQU16QixRQUFJLENBQUMsY0FBYyxTQUFTO0FBQzNCLFlBQU0sbUJBQW1CLEVBQUUsaUNBQWlDO0FBQzVELFVBQUksWUFBWSxnQkFBZ0I7QUFDaEMsWUFBTSxhQUFhLEtBQUssZ0JBQWdCLElBQUksS0FBSyxzQkFBc0IsZUFBZSxzQkFBc0Isa0JBQWtCLE1BQU0sZ0JBQWdCO0FBQUEsUUFDbkosb0JBQW9CLG1CQUFtQjtBQUFBLFFBQ3ZDLGFBQWEsRUFBRSxtQkFBbUIsS0FBSztBQUFBLFFBQ3ZDLGdCQUFnQixFQUFFLGNBQWMsTUFBTSxLQUFLO0FBQUEsTUFDNUMsQ0FBQyxDQUFDO0FBQ0YsaUJBQVcsVUFBVSxFQUFFLFNBQVMsS0FBSztBQUFBLElBQ3RDO0FBRUEsU0FBSyxlQUFlLFlBQVksR0FBRztBQUVuQyxVQUFNLFVBQW9CLEVBQUUsTUFBTSxTQUFTLEtBQUssZUFBZTtBQUUvRCxTQUFLLGdCQUFnQixJQUFJLHNCQUFzQixLQUFLLFVBQVUsT0FBTyxNQUFNO0FBRTFFLFdBQUssa0JBQWtCO0FBQ3ZCLFdBQUssV0FBVyxTQUFTLEtBQUssUUFBUTtBQUFBLElBQ3ZDLENBQUMsQ0FBQztBQUVGLFNBQUssZ0JBQWdCLElBQUksc0JBQXNCLEtBQUssVUFBVSxVQUFVLENBQUMsTUFBcUI7QUFDN0YsVUFBSSxFQUFFLFFBQVEsV0FBVyxFQUFFLFFBQVEsS0FBSztBQUN2QyxVQUFFLGVBQWU7QUFDakIsYUFBSyxXQUFXLFNBQVMsS0FBSyxRQUFRO0FBQUEsTUFDdkM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssZ0JBQWdCLElBQUksc0JBQXNCLEtBQUssVUFBVSxVQUFVLE9BQUs7QUFDNUUsVUFBSSxFQUFFLFdBQVcsR0FBRztBQUNuQjtBQUFBLE1BQ0Q7QUFDQSxVQUFJLEtBQUssY0FBYyxDQUFDLEdBQUc7QUFDMUI7QUFBQSxNQUNEO0FBRUEsa0JBQVksS0FBSyxHQUFHLElBQUk7QUFDeEIsVUFBSSxjQUFjLENBQUMsU0FBUztBQUMzQjtBQUFBLE1BQ0Q7QUFFQSxXQUFLLGtCQUFrQjtBQUN2QixXQUFLLEtBQUssZ0JBQWdCLGVBQWUsdUJBQXVCLEVBQUUsU0FBUyxLQUFLLENBQUMsRUFBRSxNQUFNLGlCQUFpQjtBQUFBLElBQzNHLENBQUMsQ0FBQztBQUtGLFNBQUssZ0JBQWdCLElBQUksc0JBQXNCLEtBQUssVUFBVSxZQUFZLENBQUMsTUFBaUI7QUFDM0YsVUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLGNBQWM7QUFDakMsVUFBRSxlQUFlO0FBQ2pCO0FBQUEsTUFDRDtBQUdBLFlBQU0sU0FBUyxFQUFFO0FBQ2pCLFVBQUksUUFBUSxRQUFRLGlDQUFpQyxHQUFHO0FBQ3ZELFVBQUUsZUFBZTtBQUNqQjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLEtBQUssYUFBYTtBQUNyQixVQUFFLGVBQWU7QUFDakI7QUFBQSxNQUNEO0FBQ0EsV0FBSyxrQkFBa0I7QUFNdkIsOEJBQXdCLEdBQUcsU0FBUyxRQUFRLFdBQVcsS0FBSyxRQUFRO0FBTXBFLFlBQU0sc0JBQXNCLEtBQUsscUJBQXFCLElBQUk7QUFDMUQsVUFBSSxxQkFBcUI7QUFDeEIsa0NBQTBCLEdBQUcscUJBQXFCLEtBQUssVUFBVSxLQUFLLE1BQU0sSUFBSSxDQUFDO0FBQUEsTUFDbEY7QUFFQSxRQUFFLGFBQWEsZ0JBQWdCO0FBQy9CLHFCQUFlLEdBQUcsS0FBSyxLQUFLLE1BQU0sSUFBSSxDQUFDO0FBQ3ZDLGVBQVMsaUJBQWlCLEtBQUssUUFBUTtBQUFBLElBQ3hDLENBQUMsQ0FBQztBQUVGLFNBQUssZ0JBQWdCLElBQUksc0JBQXNCLEtBQUssVUFBVSxVQUFVLE1BQU07QUFDN0UsaUNBQTJCO0FBQzNCLFdBQUssV0FBVyxlQUFlO0FBQUEsSUFDaEMsQ0FBQyxDQUFDO0FBRUYsVUFBTSxlQUFlLEtBQUssZ0JBQWdCLElBQUksSUFBSSxPQUFPLGtDQUFrQyxTQUFTLGNBQWMsUUFBUSxHQUFHLFFBQVcsTUFBTSxZQUFZO0FBQ3pKLFdBQUssaUJBQWlCLE9BQU87QUFBQSxJQUM5QixDQUFDLENBQUM7QUFJRixVQUFNLGVBQWUsS0FBSyxnQkFBZ0IsSUFBSSxJQUFJLE9BQU8sa0NBQWtDLFNBQVMsY0FBYyxhQUFhLEdBQUcsUUFBVyxNQUFNLFlBQVk7QUFDOUosVUFBSSxVQUFVO0FBQ2IsY0FBTSxLQUFLLDJCQUEyQixXQUFXLFNBQVMsU0FBUyxLQUFLLFFBQVE7QUFBQSxNQUNqRjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YsU0FBSyxnQkFBZ0IsSUFBSSxzQkFBc0IsS0FBSyxVQUFVLFVBQVUsQ0FBQyxNQUFrQjtBQUMxRixVQUFJLEtBQUssT0FBTyxJQUFJLE1BQU0sY0FBYyxZQUFZLENBQUMsb0JBQW9CLE1BQU0sU0FBUyxNQUFTLEVBQUUsV0FBVztBQUM3RztBQUFBLE1BQ0Q7QUFDQSxRQUFFLGVBQWU7QUFDakIsUUFBRSxnQkFBZ0I7QUFDbEIsV0FBSyxpQkFBaUIsT0FBTztBQUFBLElBQzlCLENBQUMsQ0FBQztBQUVGLFNBQUssZ0JBQWdCLElBQUksc0JBQXNCLEtBQUssVUFBVSxjQUFjLENBQUMsTUFBa0I7QUFFOUYsVUFBSSxLQUFLLE9BQU8sSUFBSSxNQUFNLGNBQWMsVUFBVTtBQUNqRCxVQUFFLGVBQWU7QUFDakI7QUFBQSxNQUNEO0FBQ0EsUUFBRSxlQUFlO0FBQ2pCLFFBQUUsZ0JBQWdCO0FBQ2xCLFlBQU0sUUFBUSxJQUFJLG1CQUFtQixVQUFVLEdBQUcsR0FBRyxDQUFDO0FBQ3RELFdBQUssb0JBQW9CLGdCQUFnQjtBQUFBLFFBQ3hDLFdBQVcsTUFBTTtBQUFBLFFBQ2pCLFlBQVksTUFBTTtBQUNqQixnQkFBTSxlQUFlLG9CQUFvQixNQUFNLFNBQVMsTUFBUztBQUNqRSxnQkFBTSxVQUFVLENBQUM7QUFDakIsY0FBSSxhQUFhLFdBQVc7QUFDM0Isb0JBQVEsS0FBSyxZQUFZO0FBQUEsVUFDMUI7QUFDQSxjQUFJLGFBQWEsV0FBVztBQUMzQixvQkFBUSxLQUFLLFlBQVk7QUFBQSxVQUMxQjtBQUNBLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBRUYsU0FBSyxNQUFNLEtBQUssT0FBTztBQUFBLEVBQ3hCO0FBQUEsRUFFUSxjQUFjLE9BQTRCO0FBQ2pELFdBQU8sY0FBYyxNQUFNLE1BQU0sS0FBSyxDQUFDLENBQUMsTUFBTSxPQUFPLFFBQVEseUNBQXlDO0FBQUEsRUFDdkc7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBU1EscUJBQXFCLE1BQThCO0FBQzFELFVBQU0sYUFBYSxLQUFLLFdBQVcsUUFBUTtBQUMzQyxRQUFJLENBQUMsWUFBWTtBQUNoQixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sV0FBVyxLQUFLLDBCQUEwQixZQUFZLFVBQVU7QUFDdEUsV0FBTyxZQUFZLG9CQUFvQixRQUFRLElBQUksU0FBUyx1QkFBdUIsS0FBSyxRQUFRLElBQUk7QUFBQSxFQUNyRztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxpQkFBaUIsU0FBeUI7QUFDakQsVUFBTSxXQUFXLEtBQUs7QUFDdEIsUUFBSSxDQUFDLFlBQVksS0FBSyxhQUFhO0FBQ2xDO0FBQUEsSUFDRDtBQUVBLFVBQU0sRUFBRSxNQUFNLFNBQVMsS0FBSyxlQUFlLElBQUk7QUFDL0MsVUFBTSxlQUFlLEtBQUssTUFBTSxJQUFJO0FBRXBDLFNBQUssY0FBYztBQUNuQixRQUFJLFVBQVUsSUFBSSxTQUFTO0FBRTNCLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxTQUFLLG9CQUFvQixRQUFRO0FBRWpDLFVBQU0sV0FBVyxNQUFNLElBQUksSUFBSSxTQUFTLGdCQUFnQixLQUFLLHFCQUFxQjtBQUFBLE1BQ2pGLFdBQVcsU0FBUyxtQkFBbUIsYUFBYTtBQUFBLE1BQ3BELGdCQUFnQjtBQUFBLElBQ2pCLENBQUMsQ0FBQztBQUNGLGFBQVMsUUFBUSxVQUFVLElBQUksOEJBQThCO0FBQzdELGFBQVMsUUFBUTtBQUNqQixhQUFTLE1BQU07QUFDZixhQUFTLE9BQU87QUFFaEIsUUFBSSxXQUFXO0FBQ2YsVUFBTSxTQUFTLENBQUMsV0FBb0I7QUFDbkMsVUFBSSxVQUFVO0FBQ2I7QUFBQSxNQUNEO0FBQ0EsaUJBQVc7QUFDWCxZQUFNLFdBQVcsU0FBUyxNQUFNLEtBQUs7QUFDckMsV0FBSyxlQUFlO0FBQ3BCLFVBQUksVUFBVSxZQUFZLGFBQWEsY0FBYztBQUNwRCxhQUFLLDJCQUNILFdBQVcsU0FBUyxTQUFTLEtBQUssVUFBVSxRQUFRLEVBQ3BELE1BQU0saUJBQWlCO0FBQUEsTUFDMUI7QUFBQSxJQUNEO0FBRUEsVUFBTSxJQUFJLDhCQUE4QixTQUFTLGNBQWMsVUFBVSxVQUFVLENBQUMsTUFBc0I7QUFDekcsVUFBSSxFQUFFLE9BQU8sUUFBUSxLQUFLLEdBQUc7QUFDNUIsVUFBRSxlQUFlO0FBQ2pCLFVBQUUsZ0JBQWdCO0FBQ2xCLGVBQU8sSUFBSTtBQUFBLE1BQ1osV0FBVyxFQUFFLE9BQU8sUUFBUSxNQUFNLEdBQUc7QUFDcEMsVUFBRSxlQUFlO0FBQ2pCLFVBQUUsZ0JBQWdCO0FBQ2xCLGVBQU8sS0FBSztBQUFBLE1BQ2IsT0FBTztBQUVOLFVBQUUsZ0JBQWdCO0FBQUEsTUFDbkI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFVBQU0sSUFBSSxzQkFBc0IsU0FBUyxjQUFjLFVBQVUsTUFBTSxNQUFNLE9BQU8sS0FBSyxDQUFDLENBQUM7QUFFM0YsVUFBTSxJQUFJLHNCQUFzQixTQUFTLFNBQVMsVUFBVSxPQUFPLE9BQUssRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQzVGLFVBQU0sSUFBSSxzQkFBc0IsU0FBUyxTQUFTLFVBQVUsVUFBVSxPQUFLLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztBQUFBLEVBQ2hHO0FBQUEsRUFFUSxvQkFBMEI7QUFDakMsUUFBSSxDQUFDLEtBQUssYUFBYTtBQUN0QjtBQUFBLElBQ0Q7QUFDQSxTQUFLLGVBQWU7QUFBQSxFQUNyQjtBQUFBLEVBRVEsaUJBQXVCO0FBQzlCLFVBQU0sYUFBYSxLQUFLO0FBQ3hCLFNBQUssY0FBYztBQUNuQixTQUFLLG9CQUFvQixNQUFNO0FBQy9CLFFBQUksWUFBWTtBQUNmLGlCQUFXLFFBQVEsVUFBVSxPQUFPLFNBQVM7QUFFN0MsWUFBTSxXQUFXLGNBQWM7QUFBQSxJQUNoQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLGlCQUFpQixjQUE0QjtBQUNwRCxlQUFXLE9BQU8sS0FBSyxPQUFPO0FBQzdCLFlBQU0sV0FBVyxJQUFJLEtBQUssU0FBUyxTQUFTLE1BQU07QUFDbEQsVUFBSSxRQUFRLFVBQVUsT0FBTyxVQUFVLFFBQVE7QUFDL0MsVUFBSSxRQUFRLGFBQWEsaUJBQWlCLE9BQU8sUUFBUSxDQUFDO0FBQzFELFVBQUksVUFBVTtBQUNiLFlBQUksUUFBUSxlQUFlLEVBQUUsT0FBTyxXQUFXLFFBQVEsVUFBVSxDQUFDO0FBQUEsTUFDbkU7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsbUJBQXlCO0FBQ2hDLFVBQU0sWUFBWSxLQUFLLE1BQU0sS0FBSyxPQUFLLEVBQUUsUUFBUSxVQUFVLFNBQVMsUUFBUSxDQUFDO0FBQzdFLGVBQVcsUUFBUSxlQUFlLEVBQUUsT0FBTyxXQUFXLFFBQVEsVUFBVSxDQUFDO0FBQUEsRUFDMUU7QUFBQSxFQUVRLFlBQVksU0FBd0I7QUFDM0MsVUFBTSxhQUFhLEtBQUs7QUFDeEIsU0FBSyxXQUFXO0FBQ2hCLFNBQUssV0FBVyxNQUFNLFVBQVUsS0FBSyxXQUFXLEtBQUs7QUFDckQsUUFBSSxlQUFlLEtBQUssVUFBVTtBQUNqQyxXQUFLLHVCQUF1QixLQUFLLEtBQUssUUFBUTtBQUFBLElBQy9DO0FBQUEsRUFDRDtBQUFBLEVBRVEsZ0JBQXNCO0FBQzdCLCtCQUEyQixLQUFLLFlBQVksS0FBSyxjQUFjLGNBQWMsQ0FBQztBQUFBLEVBQy9FO0FBQ0Q7QUFuaUJhLG1CQUFOO0FBQUEsRUFxQ0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0E1Q1U7IiwKICAibmFtZXMiOiBbXQp9Cg==
