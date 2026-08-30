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
import { $, addDisposableGenericMouseDownListener, addDisposableListener, addStandardDisposableListener, DisposableResizeObserver, EventType, getWindow, isMouseEvent } from "../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { autorun, observableSignalFromEvent } from "../../../base/common/observable.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { localize } from "../../../nls.js";
import { ISessionsManagementService } from "../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../services/sessions/browser/sessionsService.js";
import { getUntitledSessionTitle } from "../../services/sessions/common/session.js";
import { ActionRunner } from "../../../base/common/actions.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../platform/actions/browser/toolbar.js";
import { MenuItemAction } from "../../../platform/actions/common/actions.js";
import { IContextMenuService } from "../../../platform/contextview/browser/contextView.js";
import { Menus } from "../menus.js";
import { LocalSelectionTransfer } from "../../../platform/dnd/browser/dnd.js";
import { DraggedSessionIdentifier, SessionsDataTransfers } from "../dnd.js";
import { applyDragImage } from "../../../base/browser/ui/dnd/dnd.js";
import { applySessionBarThemeColors } from "./sessionBarStyles.js";
import { IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { onUnexpectedError } from "../../../base/common/errors.js";
import { SessionStatusIcon } from "../sessionStatusIcon.js";
import { SessionHeaderMetaActionViewItem } from "./sessionHeaderMetaActionViewItem.js";
class SessionActivatingActionRunner extends ActionRunner {
  constructor(_getSession, _sessionsService) {
    super();
    this._getSession = _getSession;
    this._sessionsService = _sessionsService;
  }
  async runAction(action, context) {
    const session = this._getSession();
    if (session) {
      this._sessionsService.setActive(session);
    }
    await super.runAction(action, context);
  }
}
let SessionHeader = class extends Disposable {
  constructor(_themeService, instantiationService, _contextMenuService, _contextKeyService, _sessionsManagementService, _sessionsService) {
    super();
    this._themeService = _themeService;
    this._contextMenuService = _contextMenuService;
    this._contextKeyService = _contextKeyService;
    this._sessionsManagementService = _sessionsManagementService;
    this._sessionsService = _sessionsService;
    this._sessionDisposables = this._register(new MutableDisposable());
    this._editingDisposables = this._register(new MutableDisposable());
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._visible = false;
    this._sessionTransfer = LocalSelectionTransfer.getInstance();
    this._container = $(".chat-composite-bar.session-header-bar");
    const header = $(".chat-composite-bar-header");
    this._container.appendChild(header);
    this._iconEl = $(".chat-composite-bar-session-icon");
    header.appendChild(this._iconEl);
    this._statusIcon = this._register(instantiationService.createInstance(SessionStatusIcon, this._iconEl));
    const main = $(".chat-composite-bar-header-main");
    header.appendChild(main);
    const titleRow = $(".chat-composite-bar-title-row");
    main.appendChild(titleRow);
    this._titleEl = $(".chat-composite-bar-session-title");
    titleRow.appendChild(this._titleEl);
    this._titleTextEl = $("span.chat-composite-bar-session-title-text");
    this._titleEl.appendChild(this._titleTextEl);
    this._register(addDisposableListener(this._titleEl, EventType.CLICK, () => {
      this.startTitleEditing();
    }));
    const titleActions = $(".chat-composite-bar-title-actions");
    titleRow.appendChild(titleActions);
    this._titleActionsEl = titleActions;
    const toolbarContainer = $(".chat-composite-bar-toolbar");
    titleActions.appendChild(toolbarContainer);
    this._toolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, Menus.SessionBarToolbar, {
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      menuOptions: { shouldForwardArgs: true },
      highlightToggledItems: true,
      // Render every group in the primary slot with a separator between groups
      // so the actions stay visually grouped.
      toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true }
    }));
    this._metaRow = $(".chat-composite-bar-meta-row");
    main.appendChild(this._metaRow);
    const metaToolbarContainer = $(".chat-composite-bar-meta-toolbar");
    this._metaRow.appendChild(metaToolbarContainer);
    const metaActionRunner = this._register(new SessionActivatingActionRunner(() => this._session, this._sessionsService));
    this._metaToolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, metaToolbarContainer, Menus.SessionHeaderMeta, {
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      menuOptions: { shouldForwardArgs: true },
      actionRunner: metaActionRunner,
      // Render every meta action as a consistent `icon title` pill unless it
      // registers its own action view item via IActionViewItemService.
      actionViewItemProvider: (action, options) => {
        if (action instanceof MenuItemAction) {
          return instantiationService.createInstance(SessionHeaderMetaActionViewItem, void 0, action, options);
        }
        return void 0;
      }
    }));
    this._metaActionsSignal = observableSignalFromEvent(this, this._metaToolbar.onDidChangeMenuItems);
    const heightObserver = this._register(new DisposableResizeObserver("SessionHeader.height", () => {
      this._onDidChangeHeight.fire();
    }));
    this._register(heightObserver.observe(this._container));
    this._setVisible(false);
    this._updateStyles();
    this._register(this._themeService.onDidColorThemeChange(() => this._updateStyles()));
    this._registerDragSource();
    this._registerContextMenu();
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
  _registerContextMenu() {
    this._register(addDisposableListener(this._container, EventType.CONTEXT_MENU, (e) => {
      const session = this._session;
      if (!session) {
        return;
      }
      let anchor = this._container;
      if (isMouseEvent(e)) {
        anchor = new StandardMouseEvent(getWindow(this._container), e);
      }
      e.preventDefault();
      e.stopPropagation();
      this._contextMenuService.showContextMenu({
        menuId: Menus.SessionHeaderContext,
        menuActionOptions: { shouldForwardArgs: true, arg: session },
        getAnchor: () => anchor,
        contextKeyService: this._contextKeyService
      });
    }));
  }
  _registerDragSource() {
    this._container.draggable = true;
    this._register(addDisposableGenericMouseDownListener(this._container, (e) => {
      this._lastPointerDownTarget = e.target ?? void 0;
    }));
    this._register(addDisposableListener(this._container, EventType.DRAG_START, (e) => {
      const session = this._session;
      if (!session || !e.dataTransfer) {
        e.preventDefault();
        return;
      }
      const target = this._lastPointerDownTarget;
      if (target && (this._titleActionsEl.contains(target) || this._metaRow.contains(target))) {
        e.preventDefault();
        return;
      }
      if (this._renameInput) {
        e.preventDefault();
        return;
      }
      this._sessionTransfer.setData(
        [new DraggedSessionIdentifier(session.sessionId, session.resource)],
        DraggedSessionIdentifier.prototype
      );
      const payload = JSON.stringify({ sessionId: session.sessionId, resource: session.resource.toString() });
      e.dataTransfer.setData(SessionsDataTransfers.SESSION, payload);
      e.dataTransfer.effectAllowed = "move";
      applyDragImage(e, this._container, session.title.get());
    }));
    this._register(addDisposableListener(this._container, EventType.DRAG_END, () => {
      this._sessionTransfer.clearData(DraggedSessionIdentifier.prototype);
    }));
  }
  /**
   * Tells the header which session is currently relevant. Pass `undefined` to clear.
   */
  setSession(session) {
    if (this._session === session) {
      return;
    }
    this._cancelTitleEditing();
    this._session = session;
    this._toolbar.context = session;
    this._metaToolbar.context = session;
    this._statusIcon.reset();
    const store = new DisposableStore();
    this._sessionDisposables.value = store;
    if (!session) {
      this._setVisible(false);
      return;
    }
    store.add(autorun((reader) => {
      this._updateHeader(session, reader);
    }));
    store.add(autorun((reader) => {
      this._setVisible(session.isCreated.read(reader));
    }));
  }
  _updateHeader(session, reader) {
    const status = session.status.read(reader);
    const isRead = session.isRead.read(reader);
    const isArchived = session.isArchived.read(reader);
    this._statusIcon.setStatus(status, isRead, isArchived);
    const isQuickChat = session.isQuickChat?.read(reader) ?? false;
    this._titleTextEl.textContent = session.title.read(reader) || getUntitledSessionTitle(isQuickChat);
    this._titleEl.classList.toggle("editable", this._isTitleEditable());
    this._metaActionsSignal.read(reader);
    const hasMetaActions = !this._metaToolbar.isEmpty();
    this._metaRow.style.display = hasMetaActions ? "" : "none";
    this._onDidChangeHeight.fire();
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
  /**
   * The title is editable when the backing provider declares it supports
   * renaming the session (`capabilities.supportsRename`). This is the same
   * signal that gates the `Rename...` context menu action in the sessions list.
   */
  _isTitleEditable() {
    return !!this._session && (this._session.capabilities.get().supportsRename ?? false);
  }
  startTitleEditing() {
    if (!this._isTitleEditable() || this._renameInput) {
      return;
    }
    this._startTitleEditing();
  }
  /**
   * Replace the rendered title text with an `<input>` containing the current
   * title (pre-selected). Enter commits via {@link ISessionsManagementService.renameChat},
   * Escape or blur cancels.
   */
  _startTitleEditing() {
    const session = this._session;
    if (!session || this._renameInput) {
      return;
    }
    const initialTitle = session.title.get();
    const fallbackTitle = getUntitledSessionTitle(session.isQuickChat?.get() ?? false);
    const input = document.createElement("input");
    input.type = "text";
    input.className = "chat-composite-bar-session-title-input";
    input.value = initialTitle;
    input.placeholder = fallbackTitle;
    input.setAttribute("aria-label", localize("renameSession.aria", "Rename session"));
    input.spellcheck = false;
    this._titleTextEl.style.display = "none";
    this._titleEl.appendChild(input);
    this._titleEl.classList.add("editing");
    this._renameInput = input;
    input.focus();
    input.select();
    const store = new DisposableStore();
    this._editingDisposables.value = store;
    let finished = false;
    const finish = (commit) => {
      if (finished) {
        return;
      }
      finished = true;
      const newTitle = input.value.trim();
      this._endTitleEditing();
      if (commit && newTitle && newTitle !== initialTitle) {
        this._sessionsManagementService.renameSession(session, newTitle).catch(onUnexpectedError);
      }
    };
    store.add(addStandardDisposableListener(input, EventType.KEY_DOWN, (e) => {
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
    store.add(addDisposableListener(input, EventType.BLUR, () => {
      finish(false);
    }));
    store.add(addDisposableGenericMouseDownListener(input, (e) => e.stopPropagation()));
    store.add(addDisposableListener(input, EventType.CLICK, (e) => e.stopPropagation()));
  }
  _cancelTitleEditing() {
    if (!this._renameInput) {
      return;
    }
    this._endTitleEditing();
  }
  _endTitleEditing() {
    if (this._renameInput) {
      this._renameInput.remove();
      this._renameInput = void 0;
    }
    this._titleTextEl.style.display = "";
    this._titleEl.classList.remove("editing");
    this._editingDisposables.clear();
  }
};
SessionHeader = __decorateClass([
  __decorateParam(0, IThemeService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, ISessionsManagementService),
  __decorateParam(5, ISessionsService)
], SessionHeader);
let SessionViewFloatingToolbar = class extends Disposable {
  constructor(instantiationService) {
    super();
    this._sessionDisposables = this._register(new MutableDisposable());
    this._container = $(".chat-composite-bar.chat-composite-bar-toolbar-floating");
    const toolbar = $(".chat-composite-bar-toolbar");
    this._container.appendChild(toolbar);
    this._toolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, toolbar, Menus.SessionBarToolbar, {
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      menuOptions: { shouldForwardArgs: true },
      highlightToggledItems: true,
      toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true }
    }));
    this._setVisible(false);
  }
  get element() {
    return this._container;
  }
  setSession(session) {
    if (this._session === session) {
      return;
    }
    this._session = session;
    this._toolbar.context = session;
    const store = new DisposableStore();
    this._sessionDisposables.value = store;
    if (!session) {
      this._setVisible(false);
      return;
    }
    store.add(autorun((reader) => {
      this._setVisible(!session.isCreated.read(reader));
    }));
  }
  _setVisible(visible) {
    this._container.style.display = visible ? "" : "none";
  }
};
SessionViewFloatingToolbar = __decorateClass([
  __decorateParam(0, IInstantiationService)
], SessionViewFloatingToolbar);
export {
  SessionHeader,
  SessionViewFloatingToolbar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcYnJvd3NlclxccGFydHNcXHNlc3Npb25IZWFkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvY2hhdENvbXBvc2l0ZUJhci5jc3MnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIsIERpc3Bvc2FibGVSZXNpemVPYnNlcnZlciwgRXZlbnRUeXBlLCBnZXRXaW5kb3csIGlzTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSU9ic2VydmFibGUsIElSZWFkZXIsIG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uLCBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFVudGl0bGVkU2Vzc2lvblRpdGxlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgQWN0aW9uUnVubmVyLCBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEhpZGRlbkl0ZW1TdHJhdGVneSwgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgTWVudXMgfSBmcm9tICcuLi9tZW51cy5qcyc7XG5pbXBvcnQgeyBMb2NhbFNlbGVjdGlvblRyYW5zZmVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZG5kL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IERyYWdnZWRTZXNzaW9uSWRlbnRpZmllciwgU2Vzc2lvbnNEYXRhVHJhbnNmZXJzIH0gZnJvbSAnLi4vZG5kLmpzJztcbmltcG9ydCB7IGFwcGx5RHJhZ0ltYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2RuZC9kbmQuanMnO1xuaW1wb3J0IHsgYXBwbHlTZXNzaW9uQmFyVGhlbWVDb2xvcnMgfSBmcm9tICcuL3Nlc3Npb25CYXJTdHlsZXMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uU3RhdHVzSWNvbiB9IGZyb20gJy4uL3Nlc3Npb25TdGF0dXNJY29uLmpzJztcbmltcG9ydCB7IFNlc3Npb25IZWFkZXJNZXRhQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuL3Nlc3Npb25IZWFkZXJNZXRhQWN0aW9uVmlld0l0ZW0uanMnO1xuXG4vKipcbiAqIEFuIGFjdGlvbiBydW5uZXIgZm9yIHRoZSBzZXNzaW9uIGhlYWRlciB0b29sYmFycyB0aGF0IHByb21vdGVzIHRoZSBoZWFkZXInc1xuICogc2Vzc2lvbiB0byBiZSB0aGUgYWN0aXZlIHNlc3Npb24gYmVmb3JlIHJ1bm5pbmcgYW55IGNvbnRyaWJ1dGVkIGNvbW1hbmQuIFRoaXNcbiAqIGVuc3VyZXMgY29tbWFuZHMgKGUuZy4gVmlldyBBbGwgQ2hhbmdlcykgb3BlcmF0ZSBvbiB0aGUgY2xpY2tlZCBzZXNzaW9uIGV2ZW4gd2hlblxuICogYSBkaWZmZXJlbnQgc2Vzc2lvbiBpcyBjdXJyZW50bHkgYWN0aXZlLlxuICovXG5jbGFzcyBTZXNzaW9uQWN0aXZhdGluZ0FjdGlvblJ1bm5lciBleHRlbmRzIEFjdGlvblJ1bm5lciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0U2Vzc2lvbjogKCkgPT4gSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIHJ1bkFjdGlvbihhY3Rpb246IElBY3Rpb24sIGNvbnRleHQ/OiB1bmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2dldFNlc3Npb24oKTtcblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLnNldEFjdGl2ZShzZXNzaW9uKTtcblx0XHR9XG5cdFx0YXdhaXQgc3VwZXIucnVuQWN0aW9uKGFjdGlvbiwgY29udGV4dCk7XG5cdH1cbn1cblxuLyoqXG4gKiBUaGUgc2Vzc2lvbiBoZWFkZXIgc2hvd24gYXQgdGhlIHRvcCBvZiBhIHNlc3Npb24gdmlldy4gSXQgc3VyZmFjZXMgdGhlIHNlc3Npb25cbiAqIGlkZW50aXR5IChzdGF0dXMgaWNvbiArIHRpdGxlKSwgYSBtZXRhIHJvdyAoY29udHJpYnV0ZWQgd29ya3NwYWNlIGZvbGRlciAvXG4gKiBjaGFuZ2VzIC8gcHVsbCByZXF1ZXN0IHBpbGxzKSwgYW5kIHRoZSBzZXNzaW9uIHRvb2xiYXJzIChlLmcuIFJ1biwgT3BlbiBpblxuICogVlMgQ29kZSwgTmV3IENoYXQpLlxuICpcbiAqIEl0IGlzIGludGVudGlvbmFsbHkgZGVjb3VwbGVkIGZyb20gdGhlIHtAbGluayBDaGF0Q29tcG9zaXRlQmFyfSAodGhlIGNoYXQgdGFiXG4gKiBzdHJpcCkgc28gdGhlIHR3byBzdXJmYWNlcyBldm9sdmUgaW5kZXBlbmRlbnRseS4gVGhlIGhvc3RpbmcgdmlldyB0ZWxscyB0aGVcbiAqIGhlYWRlciB3aGljaCBzZXNzaW9uIGlzIHJlbGV2YW50IHZpYSB7QGxpbmsgc2V0U2Vzc2lvbn0uXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXNzaW9uSGVhZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfaWNvbkVsOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGVFbDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpdGxlVGV4dEVsOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfbWV0YVJvdzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xiYXI6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXRhVG9vbGJhcjogTWVudVdvcmtiZW5jaFRvb2xCYXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpdGxlQWN0aW9uc0VsOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdGluZ0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgX3JlbmFtZUlucHV0OiBIVE1MSW5wdXRFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zZXNzaW9uOiBJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblxuXHQvLyBkcmFnc3RhcnQncyBvd24gdGFyZ2V0IGlzIGFsd2F5cyB0aGUgZHJhZ2dhYmxlIGNvbnRhaW5lciwgc28gdGhpcyB0cmFja3MgdGhlXG5cdC8vIHByZWNlZGluZyBwb2ludGVyZG93bidzIHRhcmdldCB0byBrbm93IHdoZXJlIHRoZSBnZXN0dXJlIGFjdHVhbGx5IGJlZ2FuLlxuXHRwcml2YXRlIF9sYXN0UG9pbnRlckRvd25UYXJnZXQ6IE5vZGUgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWaXNpYmlsaXR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogRXZlbnQ8Ym9vbGVhbj4gPSB0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VIZWlnaHQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfdmlzaWJsZSA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25UcmFuc2ZlciA9IExvY2FsU2VsZWN0aW9uVHJhbnNmZXIuZ2V0SW5zdGFuY2U8RHJhZ2dlZFNlc3Npb25JZGVudGlmaWVyPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21ldGFBY3Rpb25zU2lnbmFsOiBJT2JzZXJ2YWJsZTx2b2lkPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0dXNJY29uOiBTZXNzaW9uU3RhdHVzSWNvbjtcblxuXHRnZXQgZWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRhaW5lcjtcblx0fVxuXG5cdGdldCB2aXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl92aXNpYmxlO1xuXHR9XG5cblx0Z2V0IGhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl92aXNpYmxlID8gdGhpcy5fY29udGFpbmVyLm9mZnNldEhlaWdodCA6IDA7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2NvbnRhaW5lciA9ICQoJy5jaGF0LWNvbXBvc2l0ZS1iYXIuc2Vzc2lvbi1oZWFkZXItYmFyJyk7XG5cblx0XHQvLyBIZWFkZXI6IGEgc3RhdHVzIGljb24gY29sdW1uIGFsb25nc2lkZSBhIG1haW4gY29sdW1uIHRoYXQgc3RhY2tzIHRoZSB0aXRsZVxuXHRcdC8vIHJvdyAodGl0bGUgKyBhY3Rpb25zKSBhbmQgdGhlIG1ldGEgcm93ICh3b3Jrc3BhY2UgXHUwMEI3IGRpZmYpLiBUaGlzIG1pcnJvcnMgdGhlXG5cdFx0Ly8gc2Vzc2lvbnMgbGlzdCBzbyB0aGUgbWV0YSByb3cgYWxpZ25zIHVuZGVyIHRoZSB0aXRsZSByYXRoZXIgdGhhbiB1bmRlciB0aGVcblx0XHQvLyBzdGF0dXMgaWNvbi5cblx0XHRjb25zdCBoZWFkZXIgPSAkKCcuY2hhdC1jb21wb3NpdGUtYmFyLWhlYWRlcicpO1xuXHRcdHRoaXMuX2NvbnRhaW5lci5hcHBlbmRDaGlsZChoZWFkZXIpO1xuXG5cdFx0dGhpcy5faWNvbkVsID0gJCgnLmNoYXQtY29tcG9zaXRlLWJhci1zZXNzaW9uLWljb24nKTtcblx0XHRoZWFkZXIuYXBwZW5kQ2hpbGQodGhpcy5faWNvbkVsKTtcblx0XHR0aGlzLl9zdGF0dXNJY29uID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvblN0YXR1c0ljb24sIHRoaXMuX2ljb25FbCkpO1xuXG5cdFx0Y29uc3QgbWFpbiA9ICQoJy5jaGF0LWNvbXBvc2l0ZS1iYXItaGVhZGVyLW1haW4nKTtcblx0XHRoZWFkZXIuYXBwZW5kQ2hpbGQobWFpbik7XG5cblx0XHRjb25zdCB0aXRsZVJvdyA9ICQoJy5jaGF0LWNvbXBvc2l0ZS1iYXItdGl0bGUtcm93Jyk7XG5cdFx0bWFpbi5hcHBlbmRDaGlsZCh0aXRsZVJvdyk7XG5cblx0XHR0aGlzLl90aXRsZUVsID0gJCgnLmNoYXQtY29tcG9zaXRlLWJhci1zZXNzaW9uLXRpdGxlJyk7XG5cdFx0dGl0bGVSb3cuYXBwZW5kQ2hpbGQodGhpcy5fdGl0bGVFbCk7XG5cblx0XHQvLyBXcmFwIHRoZSB0aXRsZSB0ZXh0IGluIGEgc3BhbiBzbyB3ZSBjYW4gc3dhcCBpdCBmb3IgYW4gaW5wdXQgd2hlblxuXHRcdC8vIHRoZSB1c2VyIGNsaWNrcyB0byByZW5hbWUgd2l0aG91dCByZWJ1aWxkaW5nIHRoZSB0aXRsZSBzbG90IGl0c2VsZi5cblx0XHR0aGlzLl90aXRsZVRleHRFbCA9ICQoJ3NwYW4uY2hhdC1jb21wb3NpdGUtYmFyLXNlc3Npb24tdGl0bGUtdGV4dCcpO1xuXHRcdHRoaXMuX3RpdGxlRWwuYXBwZW5kQ2hpbGQodGhpcy5fdGl0bGVUZXh0RWwpO1xuXG5cdFx0Ly8gQ2xpY2sgdGhlIHRpdGxlIHRvIHN0YXJ0IGFuIGlubGluZSByZW5hbWUuIENsaWNrIGlzIHByZWZlcnJlZCBvdmVyXG5cdFx0Ly8gbW91c2Vkb3duIHNvIHRoYXQgaW5pdGlhdGluZyBhIGRyYWcgZnJvbSB0aGUgdGl0bGUgZG9lc24ndCBhbHNvXG5cdFx0Ly8gZmxpcCBpbnRvIGVkaXQgbW9kZS5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdGl0bGVFbCwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHR0aGlzLnN0YXJ0VGl0bGVFZGl0aW5nKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdGl0bGVBY3Rpb25zID0gJCgnLmNoYXQtY29tcG9zaXRlLWJhci10aXRsZS1hY3Rpb25zJyk7XG5cdFx0dGl0bGVSb3cuYXBwZW5kQ2hpbGQodGl0bGVBY3Rpb25zKTtcblx0XHR0aGlzLl90aXRsZUFjdGlvbnNFbCA9IHRpdGxlQWN0aW9ucztcblxuXHRcdGNvbnN0IHRvb2xiYXJDb250YWluZXIgPSAkKCcuY2hhdC1jb21wb3NpdGUtYmFyLXRvb2xiYXInKTtcblx0XHR0aXRsZUFjdGlvbnMuYXBwZW5kQ2hpbGQodG9vbGJhckNvbnRhaW5lcik7XG5cdFx0dGhpcy5fdG9vbGJhciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB0b29sYmFyQ29udGFpbmVyLCBNZW51cy5TZXNzaW9uQmFyVG9vbGJhciwge1xuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuSWdub3JlLFxuXHRcdFx0bWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHRcdGhpZ2hsaWdodFRvZ2dsZWRJdGVtczogdHJ1ZSxcblx0XHRcdC8vIFJlbmRlciBldmVyeSBncm91cCBpbiB0aGUgcHJpbWFyeSBzbG90IHdpdGggYSBzZXBhcmF0b3IgYmV0d2VlbiBncm91cHNcblx0XHRcdC8vIHNvIHRoZSBhY3Rpb25zIHN0YXkgdmlzdWFsbHkgZ3JvdXBlZC5cblx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHByaW1hcnlHcm91cDogKCkgPT4gdHJ1ZSwgdXNlU2VwYXJhdG9yc0luUHJpbWFyeUFjdGlvbnM6IHRydWUgfSxcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9tZXRhUm93ID0gJCgnLmNoYXQtY29tcG9zaXRlLWJhci1tZXRhLXJvdycpO1xuXHRcdG1haW4uYXBwZW5kQ2hpbGQodGhpcy5fbWV0YVJvdyk7XG5cblx0XHQvLyBTZXNzaW9uIGhlYWRlciBtZXRhIHRvb2xiYXIuIEFjdGlvbnMgYXJlIGNvbnRyaWJ1dGVkIGludG8gdGhlIGdlbmVyaWNcblx0XHQvLyBNZW51cy5TZXNzaW9uSGVhZGVyTWV0YSBtZW51OiB0aGUgZmlsZXMgdmlldyBjb250cmlidXRlcyB0aGUgd29ya3NwYWNlXG5cdFx0Ly8gZm9sZGVyIHBpbGwgKG9wZW5zIHRoZSBGaWxlcyB2aWV3KSwgdGhlIGNoYW5nZXMgdmlldyBjb250cmlidXRlcyB0aGVcblx0XHQvLyBkaWZmLXN0YXRzIGFjdGlvbiAob3BlbnMgdGhlIG11bHRpLWZpbGUgZGlmZiBlZGl0b3IpIGFuZCB0aGUgR2l0SHViXG5cdFx0Ly8gY29udHJpYnV0aW9uIGNvbnRyaWJ1dGVzIHRoZSBwdWxsIHJlcXVlc3QgcGlsbCAob3BlbnMgdGhlIFBSIG9uIEdpdEh1YiksXG5cdFx0Ly8gZWFjaCByZW5kZXJlZCBhcyBhIGNvbXBhY3Qgc2Vjb25kYXJ5IGJ1dHRvbiBwaWxsIHZpYVxuXHRcdC8vIFNlc3Npb25IZWFkZXJNZXRhQWN0aW9uVmlld0l0ZW0uXG5cdFx0Y29uc3QgbWV0YVRvb2xiYXJDb250YWluZXIgPSAkKCcuY2hhdC1jb21wb3NpdGUtYmFyLW1ldGEtdG9vbGJhcicpO1xuXHRcdHRoaXMuX21ldGFSb3cuYXBwZW5kQ2hpbGQobWV0YVRvb2xiYXJDb250YWluZXIpO1xuXHRcdC8vIENvbW1hbmRzIGNvbnRyaWJ1dGVkIGludG8gdGhlIGhlYWRlciBtZXRhIHRvb2xiYXIgKGUuZy4gVmlldyBBbGwgQ2hhbmdlcylcblx0XHQvLyBvcGVyYXRlIG9uIHRoaXMgdmlldydzIHNlc3Npb24uIFByb21vdGUgaXQgdG8gdGhlIGFjdGl2ZSBzZXNzaW9uIGJlZm9yZVxuXHRcdC8vIHJ1bm5pbmcgYW55IG9mIHRoZW0gdmlhIGEgY3VzdG9tIGFjdGlvbiBydW5uZXIsIHNvIHRoZSBjb21tYW5kIGFsd2F5c1xuXHRcdC8vIHRhcmdldHMgdGhlIGNsaWNrZWQgc2Vzc2lvbiBldmVuIHdoZW4gYW5vdGhlciBzZXNzaW9uIGlzIGFjdGl2ZS5cblx0XHRjb25zdCBtZXRhQWN0aW9uUnVubmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNlc3Npb25BY3RpdmF0aW5nQWN0aW9uUnVubmVyKCgpID0+IHRoaXMuX3Nlc3Npb24sIHRoaXMuX3Nlc3Npb25zU2VydmljZSkpO1xuXHRcdHRoaXMuX21ldGFUb29sYmFyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIG1ldGFUb29sYmFyQ29udGFpbmVyLCBNZW51cy5TZXNzaW9uSGVhZGVyTWV0YSwge1xuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuSWdub3JlLFxuXHRcdFx0bWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHRcdGFjdGlvblJ1bm5lcjogbWV0YUFjdGlvblJ1bm5lcixcblx0XHRcdC8vIFJlbmRlciBldmVyeSBtZXRhIGFjdGlvbiBhcyBhIGNvbnNpc3RlbnQgYGljb24gdGl0bGVgIHBpbGwgdW5sZXNzIGl0XG5cdFx0XHQvLyByZWdpc3RlcnMgaXRzIG93biBhY3Rpb24gdmlldyBpdGVtIHZpYSBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLlxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkhlYWRlck1ldGFBY3Rpb25WaWV3SXRlbSwgdW5kZWZpbmVkLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHQvLyBUaGUgbWV0YSByb3cgc2VwYXJhdG9yL3Zpc2liaWxpdHkgdHJhY2tzIHdoZXRoZXIgdGhlIG1ldGEgdG9vbGJhciBoYXMgYW55XG5cdFx0Ly8gY29udHJpYnV0ZWQgYWN0aW9ucywgc28gcmVjb21wdXRlIHRoZSBoZWFkZXIgd2hlbmV2ZXIgdGhleSBjaGFuZ2UuXG5cdFx0dGhpcy5fbWV0YUFjdGlvbnNTaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50KHRoaXMsIHRoaXMuX21ldGFUb29sYmFyLm9uRGlkQ2hhbmdlTWVudUl0ZW1zKTtcblxuXHRcdC8vIFJlcG9ydCBoZWlnaHQgY2hhbmdlcyAoZS5nLiBtZXRhIHJvdyBjb250ZW50IHdyYXBwaW5nKSBzbyB0aGUgaG9zdCBjYW4gcmUtbGF5b3V0XG5cdFx0Y29uc3QgaGVpZ2h0T2JzZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdTZXNzaW9uSGVhZGVyLmhlaWdodCcsICgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaGVpZ2h0T2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLl9jb250YWluZXIpKTtcblxuXHRcdHRoaXMuX3NldFZpc2libGUoZmFsc2UpO1xuXHRcdHRoaXMuX3VwZGF0ZVN0eWxlcygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4gdGhpcy5fdXBkYXRlU3R5bGVzKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyRHJhZ1NvdXJjZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyQ29udGV4dE1lbnUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyQ29udGV4dE1lbnUoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2NvbnRhaW5lciwgRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uO1xuXHRcdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGFuY2hvcjogSFRNTEVsZW1lbnQgfCBTdGFuZGFyZE1vdXNlRXZlbnQgPSB0aGlzLl9jb250YWluZXI7XG5cdFx0XHRpZiAoaXNNb3VzZUV2ZW50KGUpKSB7XG5cdFx0XHRcdGFuY2hvciA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZ2V0V2luZG93KHRoaXMuX2NvbnRhaW5lciksIGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdG1lbnVJZDogTWVudXMuU2Vzc2lvbkhlYWRlckNvbnRleHQsXG5cdFx0XHRcdG1lbnVBY3Rpb25PcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlLCBhcmc6IHNlc3Npb24gfSxcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBhbmNob3IsXG5cdFx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiB0aGlzLl9jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyRHJhZ1NvdXJjZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250YWluZXIuZHJhZ2dhYmxlID0gdHJ1ZTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIodGhpcy5fY29udGFpbmVyLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0dGhpcy5fbGFzdFBvaW50ZXJEb3duVGFyZ2V0ID0gKGUudGFyZ2V0IGFzIE5vZGUgfCBudWxsKSA/PyB1bmRlZmluZWQ7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2NvbnRhaW5lciwgRXZlbnRUeXBlLkRSQUdfU1RBUlQsIChlOiBEcmFnRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uO1xuXHRcdFx0aWYgKCFzZXNzaW9uIHx8ICFlLmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRG9uJ3Qgc3dhbGxvdyBhIGNsaWNrIG9uIHRoZSB0b29sYmFyIG9yIG1ldGEgcm93IHBpbGxzIGludG8gYSBzZXNzaW9uIGRyYWcuXG5cdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9sYXN0UG9pbnRlckRvd25UYXJnZXQ7XG5cdFx0XHRpZiAodGFyZ2V0ICYmICh0aGlzLl90aXRsZUFjdGlvbnNFbC5jb250YWlucyh0YXJnZXQpIHx8IHRoaXMuX21ldGFSb3cuY29udGFpbnModGFyZ2V0KSkpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIERvbid0IGluaXRpYXRlIGEgZHJhZyB3aGlsZSB0aGUgdGl0bGUgaXMgYmVpbmcgcmVuYW1lZC5cblx0XHRcdGlmICh0aGlzLl9yZW5hbWVJbnB1dCkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fc2Vzc2lvblRyYW5zZmVyLnNldERhdGEoXG5cdFx0XHRcdFtuZXcgRHJhZ2dlZFNlc3Npb25JZGVudGlmaWVyKHNlc3Npb24uc2Vzc2lvbklkLCBzZXNzaW9uLnJlc291cmNlKV0sXG5cdFx0XHRcdERyYWdnZWRTZXNzaW9uSWRlbnRpZmllci5wcm90b3R5cGUsXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBwYXlsb2FkID0gSlNPTi5zdHJpbmdpZnkoeyBzZXNzaW9uSWQ6IHNlc3Npb24uc2Vzc2lvbklkLCByZXNvdXJjZTogc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpIH0pO1xuXHRcdFx0ZS5kYXRhVHJhbnNmZXIuc2V0RGF0YShTZXNzaW9uc0RhdGFUcmFuc2ZlcnMuU0VTU0lPTiwgcGF5bG9hZCk7XG5cdFx0XHRlLmRhdGFUcmFuc2Zlci5lZmZlY3RBbGxvd2VkID0gJ21vdmUnO1xuXG5cdFx0XHRhcHBseURyYWdJbWFnZShlLCB0aGlzLl9jb250YWluZXIsIHNlc3Npb24udGl0bGUuZ2V0KCkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9jb250YWluZXIsIEV2ZW50VHlwZS5EUkFHX0VORCwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fc2Vzc2lvblRyYW5zZmVyLmNsZWFyRGF0YShEcmFnZ2VkU2Vzc2lvbklkZW50aWZpZXIucHJvdG90eXBlKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogVGVsbHMgdGhlIGhlYWRlciB3aGljaCBzZXNzaW9uIGlzIGN1cnJlbnRseSByZWxldmFudC4gUGFzcyBgdW5kZWZpbmVkYCB0byBjbGVhci5cblx0ICovXG5cdHNldFNlc3Npb24oc2Vzc2lvbjogSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2Vzc2lvbiA9PT0gc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBDYW5jZWwgYW55IGluLWZsaWdodCByZW5hbWUgd2hlbiBzd2l0Y2hpbmcgc2Vzc2lvbnMuXG5cdFx0dGhpcy5fY2FuY2VsVGl0bGVFZGl0aW5nKCk7XG5cdFx0dGhpcy5fc2Vzc2lvbiA9IHNlc3Npb247XG5cdFx0dGhpcy5fdG9vbGJhci5jb250ZXh0ID0gc2Vzc2lvbjtcblx0XHR0aGlzLl9tZXRhVG9vbGJhci5jb250ZXh0ID0gc2Vzc2lvbjtcblx0XHR0aGlzLl9zdGF0dXNJY29uLnJlc2V0KCk7XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9zZXNzaW9uRGlzcG9zYWJsZXMudmFsdWUgPSBzdG9yZTtcblxuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fc2V0VmlzaWJsZShmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZUhlYWRlcihzZXNzaW9uLCByZWFkZXIpO1xuXHRcdH0pKTtcblxuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl9zZXRWaXNpYmxlKHNlc3Npb24uaXNDcmVhdGVkLnJlYWQocmVhZGVyKSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlSGVhZGVyKHNlc3Npb246IElBY3RpdmVTZXNzaW9uLCByZWFkZXI6IElSZWFkZXIpOiB2b2lkIHtcblx0XHQvLyBTZXNzaW9uIGljb24gXHUyMDE0IHRoZSBTZXNzaW9uU3RhdHVzSWNvbiB3aWRnZXQgb3ducyB0aGUgcmVuZGVyaW5nIChzcGlubmVyIHZzLlxuXHRcdC8vIGNvZGljb24sIGNyb3NzLWZhZGUsIHJlZHVjZWQtbW90aW9uKTsgaGVyZSB3ZSBqdXN0IGZlZWQgaXQgdGhlIGxhdGVzdCBzdGF0ZS5cblx0XHQvLyBUaGUgcHVsbCByZXF1ZXN0IGlzIHN1cmZhY2VkIGluIHRoZSBtZXRhIHJvdywgc28gaW4gdGVybWluYWwvZGVmYXVsdCBzdGF0ZXMgdGhlXG5cdFx0Ly8gdGl0bGUgc2hvd3MgdGhlIHJlYWQvdW5yZWFkIGRvdCBpbmRpY2F0b3IgKG5vIHNlc3Npb24gdHlwZSBvciBQUiBpY29uKS5cblx0XHRjb25zdCBzdGF0dXMgPSBzZXNzaW9uLnN0YXR1cy5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgaXNSZWFkID0gc2Vzc2lvbi5pc1JlYWQucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGlzQXJjaGl2ZWQgPSBzZXNzaW9uLmlzQXJjaGl2ZWQucmVhZChyZWFkZXIpO1xuXHRcdHRoaXMuX3N0YXR1c0ljb24uc2V0U3RhdHVzKHN0YXR1cywgaXNSZWFkLCBpc0FyY2hpdmVkKTtcblxuXHRcdC8vIFNlc3Npb24gdGl0bGUgXHUyMDE0IHF1aWNrIGNoYXRzIHVzZSBcIk5ldyBDaGF0XCIgYXMgdGhlIHVudGl0bGVkIGZhbGxiYWNrLlxuXHRcdGNvbnN0IGlzUXVpY2tDaGF0ID0gc2Vzc2lvbi5pc1F1aWNrQ2hhdD8ucmVhZChyZWFkZXIpID8/IGZhbHNlO1xuXHRcdHRoaXMuX3RpdGxlVGV4dEVsLnRleHRDb250ZW50ID0gc2Vzc2lvbi50aXRsZS5yZWFkKHJlYWRlcikgfHwgZ2V0VW50aXRsZWRTZXNzaW9uVGl0bGUoaXNRdWlja0NoYXQpO1xuXHRcdHRoaXMuX3RpdGxlRWwuY2xhc3NMaXN0LnRvZ2dsZSgnZWRpdGFibGUnLCB0aGlzLl9pc1RpdGxlRWRpdGFibGUoKSk7XG5cblx0XHQvLyBNZXRhIHJvdzogY29udHJpYnV0ZWQgYWN0aW9uIHBpbGxzICh3b3Jrc3BhY2UgZm9sZGVyIFx1MDBCNyBkaWZmIHN0YXRzIFx1MDBCNyBwdWxsIHJlcXVlc3QpLlxuXHRcdC8vIFJlYWRpbmcgdGhlIHNpZ25hbCByZS1ydW5zIHRoaXMgb24gbWVudSBjaGFuZ2VzLlxuXHRcdHRoaXMuX21ldGFBY3Rpb25zU2lnbmFsLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBoYXNNZXRhQWN0aW9ucyA9ICF0aGlzLl9tZXRhVG9vbGJhci5pc0VtcHR5KCk7XG5cblx0XHR0aGlzLl9tZXRhUm93LnN0eWxlLmRpc3BsYXkgPSBoYXNNZXRhQWN0aW9ucyA/ICcnIDogJ25vbmUnO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHdhc1Zpc2libGUgPSB0aGlzLl92aXNpYmxlO1xuXHRcdHRoaXMuX3Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gdGhpcy5fdmlzaWJsZSA/ICcnIDogJ25vbmUnO1xuXHRcdGlmICh3YXNWaXNpYmxlICE9PSB0aGlzLl92aXNpYmxlKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZmlyZSh0aGlzLl92aXNpYmxlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTdHlsZXMoKTogdm9pZCB7XG5cdFx0YXBwbHlTZXNzaW9uQmFyVGhlbWVDb2xvcnModGhpcy5fY29udGFpbmVyLCB0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgdGl0bGUgaXMgZWRpdGFibGUgd2hlbiB0aGUgYmFja2luZyBwcm92aWRlciBkZWNsYXJlcyBpdCBzdXBwb3J0c1xuXHQgKiByZW5hbWluZyB0aGUgc2Vzc2lvbiAoYGNhcGFiaWxpdGllcy5zdXBwb3J0c1JlbmFtZWApLiBUaGlzIGlzIHRoZSBzYW1lXG5cdCAqIHNpZ25hbCB0aGF0IGdhdGVzIHRoZSBgUmVuYW1lLi4uYCBjb250ZXh0IG1lbnUgYWN0aW9uIGluIHRoZSBzZXNzaW9ucyBsaXN0LlxuXHQgKi9cblx0cHJpdmF0ZSBfaXNUaXRsZUVkaXRhYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX3Nlc3Npb24gJiYgKHRoaXMuX3Nlc3Npb24uY2FwYWJpbGl0aWVzLmdldCgpLnN1cHBvcnRzUmVuYW1lID8/IGZhbHNlKTtcblx0fVxuXG5cdHN0YXJ0VGl0bGVFZGl0aW5nKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNUaXRsZUVkaXRhYmxlKCkgfHwgdGhpcy5fcmVuYW1lSW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3RhcnRUaXRsZUVkaXRpbmcoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXBsYWNlIHRoZSByZW5kZXJlZCB0aXRsZSB0ZXh0IHdpdGggYW4gYDxpbnB1dD5gIGNvbnRhaW5pbmcgdGhlIGN1cnJlbnRcblx0ICogdGl0bGUgKHByZS1zZWxlY3RlZCkuIEVudGVyIGNvbW1pdHMgdmlhIHtAbGluayBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5yZW5hbWVDaGF0fSxcblx0ICogRXNjYXBlIG9yIGJsdXIgY2FuY2Vscy5cblx0ICovXG5cdHByaXZhdGUgX3N0YXJ0VGl0bGVFZGl0aW5nKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uO1xuXHRcdGlmICghc2Vzc2lvbiB8fCB0aGlzLl9yZW5hbWVJbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluaXRpYWxUaXRsZSA9IHNlc3Npb24udGl0bGUuZ2V0KCk7XG5cdFx0Ly8gV2hlbiB0aGUgc3RvcmVkIHRpdGxlIGlzIGVtcHR5IHRoZSBoZWFkZXIgc2hvd3MgYSBsb2NhbGl6ZWQgZmFsbGJhY2suXG5cdFx0Ly8gUmVmbGVjdCB0aGF0IGFzIGEgcGxhY2Vob2xkZXIgcmF0aGVyIHRoYW4gc2VlZGluZyB0aGUgaW5wdXQgd2l0aCBpdCwgc29cblx0XHQvLyB0aGUgdXNlciBuZWl0aGVyIHNlZXMgYSBibGFuayBmaWVsZCBub3IgYWNjaWRlbnRhbGx5IGNvbW1pdHMgdGhlIGZhbGxiYWNrLlxuXHRcdGNvbnN0IGZhbGxiYWNrVGl0bGUgPSBnZXRVbnRpdGxlZFNlc3Npb25UaXRsZShzZXNzaW9uLmlzUXVpY2tDaGF0Py5nZXQoKSA/PyBmYWxzZSk7XG5cblx0XHRjb25zdCBpbnB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lucHV0Jyk7XG5cdFx0aW5wdXQudHlwZSA9ICd0ZXh0Jztcblx0XHRpbnB1dC5jbGFzc05hbWUgPSAnY2hhdC1jb21wb3NpdGUtYmFyLXNlc3Npb24tdGl0bGUtaW5wdXQnO1xuXHRcdGlucHV0LnZhbHVlID0gaW5pdGlhbFRpdGxlO1xuXHRcdGlucHV0LnBsYWNlaG9sZGVyID0gZmFsbGJhY2tUaXRsZTtcblx0XHRpbnB1dC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgncmVuYW1lU2Vzc2lvbi5hcmlhJywgXCJSZW5hbWUgc2Vzc2lvblwiKSk7XG5cdFx0aW5wdXQuc3BlbGxjaGVjayA9IGZhbHNlO1xuXG5cdFx0dGhpcy5fdGl0bGVUZXh0RWwuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLl90aXRsZUVsLmFwcGVuZENoaWxkKGlucHV0KTtcblx0XHR0aGlzLl90aXRsZUVsLmNsYXNzTGlzdC5hZGQoJ2VkaXRpbmcnKTtcblx0XHR0aGlzLl9yZW5hbWVJbnB1dCA9IGlucHV0O1xuXG5cdFx0aW5wdXQuZm9jdXMoKTtcblx0XHRpbnB1dC5zZWxlY3QoKTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX2VkaXRpbmdEaXNwb3NhYmxlcy52YWx1ZSA9IHN0b3JlO1xuXG5cdFx0bGV0IGZpbmlzaGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgZmluaXNoID0gKGNvbW1pdDogYm9vbGVhbikgPT4ge1xuXHRcdFx0aWYgKGZpbmlzaGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGZpbmlzaGVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IG5ld1RpdGxlID0gaW5wdXQudmFsdWUudHJpbSgpO1xuXHRcdFx0dGhpcy5fZW5kVGl0bGVFZGl0aW5nKCk7XG5cdFx0XHRpZiAoY29tbWl0ICYmIG5ld1RpdGxlICYmIG5ld1RpdGxlICE9PSBpbml0aWFsVGl0bGUpIHtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZVxuXHRcdFx0XHRcdC5yZW5hbWVTZXNzaW9uKHNlc3Npb24sIG5ld1RpdGxlKVxuXHRcdFx0XHRcdC5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZChhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dCwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogSUtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGZpbmlzaCh0cnVlKTtcblx0XHRcdH0gZWxzZSBpZiAoZS5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0ZmluaXNoKGZhbHNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIERvbid0IGxldCB0eXBpbmcgbGVhayBvdXQgdG8gd29ya2JlbmNoIHNob3J0Y3V0cyAoZS5nLiBTcGFjZSkuXG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dCwgRXZlbnRUeXBlLkJMVVIsICgpID0+IHtcblx0XHRcdGZpbmlzaChmYWxzZSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU3dhbGxvdyBjbGljay9wb2ludGVyZG93biBvbiB0aGUgaW5wdXQgc28gdGhlIHRpdGxlJ3MgY2xpY2sgaGFuZGxlclxuXHRcdC8vIGRvZXNuJ3QgdHJ5IHRvIHJlLWVudGVyIGVkaXRpbmcgbW9kZS4gVXNlIHRoZSBnZW5lcmljIG1vdXNlZG93blxuXHRcdC8vIGhlbHBlciB3aGljaCByb3V0ZXMgdGhyb3VnaCBgcG9pbnRlcmRvd25gIG9uIGlPUyB3aGVyZSBtb3VzZSBldmVudHNcblx0XHQvLyBkb24ndCBmaXJlLlxuXHRcdHN0b3JlLmFkZChhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKGlucHV0LCBlID0+IGUuc3RvcFByb3BhZ2F0aW9uKCkpKTtcblx0XHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0LCBFdmVudFR5cGUuQ0xJQ0ssIGUgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsVGl0bGVFZGl0aW5nKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fcmVuYW1lSW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZW5kVGl0bGVFZGl0aW5nKCk7XG5cdH1cblxuXHRwcml2YXRlIF9lbmRUaXRsZUVkaXRpbmcoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3JlbmFtZUlucHV0KSB7XG5cdFx0XHR0aGlzLl9yZW5hbWVJbnB1dC5yZW1vdmUoKTtcblx0XHRcdHRoaXMuX3JlbmFtZUlucHV0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl90aXRsZVRleHRFbC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0dGhpcy5fdGl0bGVFbC5jbGFzc0xpc3QucmVtb3ZlKCdlZGl0aW5nJyk7XG5cdFx0dGhpcy5fZWRpdGluZ0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBBIGxpZ2h0d2VpZ2h0IHRvb2xiYXIgdGhhdCByZW5kZXJzIG9ubHkgdGhlIHtAbGluayBNZW51cy5TZXNzaW9uQmFyVG9vbGJhcn0gbWVudVxuICogdXNpbmcgdGhlIHNhbWUgYC5jaGF0LWNvbXBvc2l0ZS1iYXItdG9vbGJhcmAgc3R5bGluZy4gVW5saWtlIHRoZSBmdWxsXG4gKiB7QGxpbmsgU2Vzc2lvbkhlYWRlcn0sIHRoaXMgdG9vbGJhciBpcyBhYnNvbHV0ZWx5IHBvc2l0aW9uZWQgYXQgdGhlIHRvcC1yaWdodCBvZlxuICogdGhlIHNlc3Npb24gdmlldyBhbmQgZG9lcyBub3QgYWxsb2NhdGUgYW55IHZlcnRpY2FsIHNwYWNlLlxuICpcbiAqIEl0IGlzIHNob3duIG9ubHkgd2hlbiB0aGUgaG9zdGVkIHNlc3Npb24gZXhpc3RzIGJ1dCBoYXMgbm90IHlldCBiZWVuIGNyZWF0ZWQuXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXNzaW9uVmlld0Zsb2F0aW5nVG9vbGJhciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xiYXI6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXHRwcml2YXRlIF9zZXNzaW9uOiBJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cblx0Z2V0IGVsZW1lbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9jb250YWluZXI7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9jb250YWluZXIgPSAkKCcuY2hhdC1jb21wb3NpdGUtYmFyLmNoYXQtY29tcG9zaXRlLWJhci10b29sYmFyLWZsb2F0aW5nJyk7XG5cdFx0Y29uc3QgdG9vbGJhciA9ICQoJy5jaGF0LWNvbXBvc2l0ZS1iYXItdG9vbGJhcicpO1xuXHRcdHRoaXMuX2NvbnRhaW5lci5hcHBlbmRDaGlsZCh0b29sYmFyKTtcblxuXHRcdHRoaXMuX3Rvb2xiYXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdG9vbGJhciwgTWVudXMuU2Vzc2lvbkJhclRvb2xiYXIsIHtcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lklnbm9yZSxcblx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHRoaWdobGlnaHRUb2dnbGVkSXRlbXM6IHRydWUsXG5cdFx0XHR0b29sYmFyT3B0aW9uczogeyBwcmltYXJ5R3JvdXA6ICgpID0+IHRydWUsIHVzZVNlcGFyYXRvcnNJblByaW1hcnlBY3Rpb25zOiB0cnVlIH0sXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fc2V0VmlzaWJsZShmYWxzZSk7XG5cdH1cblxuXHRzZXRTZXNzaW9uKHNlc3Npb246IElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Nlc3Npb24gPT09IHNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2Vzc2lvbiA9IHNlc3Npb247XG5cdFx0dGhpcy5fdG9vbGJhci5jb250ZXh0ID0gc2Vzc2lvbjtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy52YWx1ZSA9IHN0b3JlO1xuXG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9zZXRWaXNpYmxlKGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fc2V0VmlzaWJsZSghc2Vzc2lvbi5pc0NyZWF0ZWQucmVhZChyZWFkZXIpKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9jb250YWluZXIuc3R5bGUuZGlzcGxheSA9IHZpc2libGUgPyAnJyA6ICdub25lJztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxZQUFZLGlCQUFpQix5QkFBeUI7QUFDL0QsU0FBUyxlQUFzQjtBQUMvQixTQUFTLEdBQUcsdUNBQXVDLHVCQUF1QiwrQkFBK0IsMEJBQTBCLFdBQVcsV0FBVyxvQkFBb0I7QUFDN0ssU0FBUywwQkFBMEI7QUFFbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBK0IsaUNBQWlDO0FBQ3pFLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQXlCLGtDQUFrQztBQUMzRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG9CQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQiw0QkFBNEI7QUFDekQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxh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
