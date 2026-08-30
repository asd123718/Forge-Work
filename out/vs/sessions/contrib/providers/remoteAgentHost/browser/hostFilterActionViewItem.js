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
import "./media/hostFilter.css";
import * as dom from "../../../../../base/browser/dom.js";
import { Gesture, EventType as TouchEventType } from "../../../../../base/browser/touch.js";
import { renderLabelWithIcons } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { BaseActionViewItem } from "../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { StandardMouseEvent } from "../../../../../base/browser/mouseEvent.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { Action } from "../../../../../base/common/actions.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { defaultButtonStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { AgentHostFilterConnectionStatus, IAgentHostFilterService } from "../../../../services/agentHostFilter/common/agentHostFilter.js";
let HostFilterActionViewItem = class extends BaseActionViewItem {
  constructor(action, _appearance = "titlebar", _filterService, _contextMenuService, _hoverService) {
    super(void 0, action);
    this._appearance = _appearance;
    this._filterService = _filterService;
    this._contextMenuService = _contextMenuService;
    this._hoverService = _hoverService;
    this._dropdownHover = this._register(new MutableDisposable());
    this._connectHover = this._register(new MutableDisposable());
    this._register(this._filterService.onDidChange(() => this._update()));
    this._register(this._filterService.onDidChangeDiscovering(() => this._update()));
  }
  render(container) {
    super.render(container);
    if (!this.element) {
      return;
    }
    this.element.classList.add("agent-host-filter-combo");
    if (this._appearance === "sidebar") {
      this.element.classList.add("sidebar");
      this._renderSidebar();
    } else {
      this._renderTitlebar();
    }
    this._update();
  }
  /**
   * Original compact pill rendered in the desktop titlebar's left toolbar.
   * Custom DOM driven directly by click handlers + context menu service.
   */
  _renderTitlebar() {
    if (!this.element) {
      return;
    }
    this._dropdownElement = dom.append(this.element, dom.$("div.agent-host-filter-dropdown"));
    const iconEl = dom.append(this._dropdownElement, dom.$("span.agent-host-filter-icon"));
    iconEl.append(...renderLabelWithIcons(`$(${Codicon.remote.id})`));
    this._labelElement = dom.append(this._dropdownElement, dom.$("span.agent-host-filter-label"));
    this._chevronElement = dom.append(this._dropdownElement, dom.$("span.agent-host-filter-chevron"));
    this._chevronElement.append(...renderLabelWithIcons(`$(${Codicon.chevronDown.id})`));
    this._register(Gesture.addTarget(this._dropdownElement));
    for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
      this._register(dom.addDisposableListener(this._dropdownElement, eventType, (e) => {
        if (!this._isInteractive()) {
          return;
        }
        dom.EventHelper.stop(e, true);
        this._showMenu(e);
      }));
    }
    this._register(dom.addDisposableListener(this._dropdownElement, dom.EventType.KEY_DOWN, (e) => {
      if (!this._isInteractive()) {
        return;
      }
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        dom.EventHelper.stop(e, true);
        this._showMenu(e);
      }
    }));
    this._connectElement = dom.append(this.element, dom.$("div.agent-host-filter-connect"));
    this._wireConnectButton(this._connectElement);
  }
  /**
   * Sidebar appearance — full-width row matching the Customizations links
   * (`CustomizationLinkViewItem`). Same Monaco `Button` shell, same
   * `.sidebar-action-button` styling, same `supportIcons` label rendering.
   * The trailing connect indicator is rendered alongside the picker
   * button as a sibling control, so the row visually mirrors the
   * Customizations rows in the toolbar above without making the
   * indicator part of the picker label.
   */
  _renderSidebar() {
    if (!this.element) {
      return;
    }
    this.element.classList.add("sidebar-action");
    const buttonContainer = dom.append(this.element, dom.$(".customization-link-button-container"));
    this._sidebarButton = this._register(new Button(buttonContainer, {
      ...defaultButtonStyles,
      secondary: true,
      title: false,
      supportIcons: true,
      buttonSecondaryBackground: "transparent",
      buttonSecondaryHoverBackground: void 0,
      buttonSecondaryForeground: void 0,
      buttonSecondaryBorder: void 0
    }));
    this._sidebarButton.element.classList.add("customization-link-button", "sidebar-action-button", "agent-host-filter-button", "monaco-text-button");
    this._dropdownElement = this._sidebarButton.element;
    this._sidebarLeadingIcon = dom.append(this._sidebarButton.element, dom.$("span.agent-host-filter-leading-icon"));
    this._sidebarLeadingIcon.classList.add("codicon", `codicon-${Codicon.remote.id}`);
    this._labelElement = dom.append(this._sidebarButton.element, dom.$("span.agent-host-filter-label"));
    this._sidebarTrailingIcon = dom.$("span.agent-host-filter-trailing-icon.codicon");
    this._sidebarTrailingIcon.classList.add(`codicon-${Codicon.chevronDown.id}`);
    this._register(this._sidebarButton.onDidClick((e) => {
      if (!this._isInteractive()) {
        return;
      }
      this._showMenu(e);
    }));
    this._connectElement = dom.append(this.element, dom.$("div.agent-host-filter-connect"));
    this._wireConnectButton(this._connectElement);
  }
  _wireConnectButton(connectElement) {
    this._register(Gesture.addTarget(connectElement));
    for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
      this._register(dom.addDisposableListener(connectElement, eventType, (e) => {
        dom.EventHelper.stop(e, true);
        this._onConnectClick();
      }));
    }
    this._register(dom.addDisposableListener(connectElement, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        dom.EventHelper.stop(e, true);
        this._onConnectClick();
      }
    }));
  }
  _renderSidebarButtonAffordances(interactive, canRetry) {
    if (!this._sidebarButton || !this._sidebarTrailingIcon) {
      return;
    }
    const showChevron = interactive && !canRetry;
    if (showChevron) {
      if (!this._sidebarTrailingIcon.isConnected) {
        this._sidebarButton.element.appendChild(this._sidebarTrailingIcon);
      }
    } else {
      this._sidebarTrailingIcon.remove();
    }
  }
  _isInteractive() {
    const hosts = this._filterService.hosts;
    return hosts.length === 0 || hosts.length > 1;
  }
  _update() {
    if (!this.element || !this._dropdownElement || !this._labelElement || !this._connectElement) {
      return;
    }
    if (!this._sidebarButton && !this._chevronElement) {
      return;
    }
    const hosts = this._filterService.hosts;
    const selectedId = this._filterService.selectedProviderId;
    const selected = selectedId === void 0 ? void 0 : hosts.find((h) => h.providerId === selectedId);
    const hasMenu = hosts.length > 1;
    const canRetry = hosts.length === 0;
    const interactive = hasMenu || canRetry;
    const discovering = this._filterService.isDiscovering;
    const text = selected ? selected.label : discovering ? localize("agentHostFilter.searching", "Searching\u2026") : localize("agentHostFilter.none", "No Host");
    if (this._sidebarButton) {
      this._labelElement.textContent = text;
      this._renderSidebarButtonAffordances(interactive, canRetry);
    } else {
      this._labelElement.textContent = text;
    }
    this.element.classList.toggle("single-host", !interactive);
    this._dropdownElement.classList.toggle("discovering", discovering);
    this._dropdownElement.classList.toggle("no-hosts", canRetry);
    if (this._chevronElement) {
      dom.clearNode(this._chevronElement);
      const chevronIconId = canRetry ? Codicon.refresh.id : Codicon.chevronDown.id;
      this._chevronElement.append(...renderLabelWithIcons(`$(${chevronIconId})`));
    }
    if (interactive) {
      if (!this._sidebarButton) {
        this._dropdownElement.tabIndex = 0;
        this._dropdownElement.role = "button";
        if (hasMenu) {
          this._dropdownElement.setAttribute("aria-haspopup", "menu");
        } else {
          this._dropdownElement.removeAttribute("aria-haspopup");
        }
      } else if (hasMenu) {
        this._dropdownElement.setAttribute("aria-haspopup", "menu");
      } else {
        this._dropdownElement.removeAttribute("aria-haspopup");
      }
      const ariaLabel = selected ? localize("agentHostFilter.aria.selected", "Sessions scoped to host {0}. Click to change host.", selected.label) : canRetry ? localize("agentHostFilter.aria.retry", "No hosts found. Click to re-discover hosts.") : localize("agentHostFilter.aria.none", "No agent host selected.");
      this._dropdownElement.setAttribute("aria-label", ariaLabel);
      const hoverText = canRetry ? discovering ? localize("agentHostFilter.hover.searching", "Searching for hosts\u2026") : localize("agentHostFilter.hover.retry", "Re-discover hosts") : localize("agentHostFilter.hover", "Change the host the sessions list is scoped to");
      this._dropdownHover.value = this._hoverService.setupManagedHover(
        getDefaultHoverDelegate("element"),
        this._dropdownElement,
        () => hoverText
      );
    } else {
      if (!this._sidebarButton) {
        this._dropdownElement.removeAttribute("tabindex");
        this._dropdownElement.removeAttribute("role");
      }
      this._dropdownElement.removeAttribute("aria-haspopup");
      this._dropdownElement.setAttribute("aria-label", selected ? localize("agentHostFilter.aria.singleSelected", "Sessions scoped to host {0}", selected.label) : localize("agentHostFilter.aria.none", "No agent host selected."));
      this._dropdownHover.clear();
    }
    this._updateConnectButton(selected, canRetry, discovering);
  }
  _updateConnectButton(selected, canRetry, discovering) {
    if (!this._connectElement) {
      return;
    }
    dom.clearNode(this._connectElement);
    this._connectElement.classList.remove("connected", "connecting", "disconnected", "rediscover", "hidden");
    this._connectHover.clear();
    if (!selected && this._sidebarButton && canRetry) {
      this._connectElement.setAttribute("role", "button");
      this._connectElement.tabIndex = 0;
      this._connectElement.classList.add("rediscover");
      this._connectElement.append(...renderLabelWithIcons(`$(${Codicon.refresh.id})`));
      const hoverText2 = discovering ? localize("agentHostFilter.hover.searching", "Searching for hosts\u2026") : localize("agentHostFilter.hover.retry", "Re-discover hosts");
      this._connectElement.setAttribute("aria-label", hoverText2);
      this._connectHover.value = this._hoverService.setupManagedHover(
        getDefaultHoverDelegate("element"),
        this._connectElement,
        () => hoverText2
      );
      return;
    }
    if (!selected) {
      this._connectElement.classList.add("hidden");
      this._connectElement.removeAttribute("role");
      this._connectElement.removeAttribute("tabindex");
      return;
    }
    this._connectElement.setAttribute("role", "button");
    this._connectElement.tabIndex = 0;
    let iconId;
    let hoverText;
    switch (selected.status) {
      case AgentHostFilterConnectionStatus.Connected:
        iconId = Codicon.debugConnected.id;
        this._connectElement.classList.add("connected");
        hoverText = localize("agentHostFilter.status.connected", "Connected to {0}. Click to disconnect.", selected.label);
        break;
      case AgentHostFilterConnectionStatus.Connecting:
        iconId = Codicon.debugConnected.id;
        this._connectElement.classList.add("connecting");
        hoverText = localize("agentHostFilter.status.connecting", "Connecting to {0}\u2026 Click to cancel.", selected.label);
        break;
      case AgentHostFilterConnectionStatus.Disconnected:
      default:
        iconId = Codicon.debugDisconnect.id;
        this._connectElement.classList.add("disconnected");
        hoverText = localize("agentHostFilter.status.disconnected", "Disconnected from {0}. Click to connect.", selected.label);
        break;
    }
    this._connectElement.append(...renderLabelWithIcons(`$(${iconId})`));
    this._connectElement.setAttribute("aria-label", hoverText);
    const connectHoverDelegate = getDefaultHoverDelegate("element");
    this._connectHover.value = this._hoverService.setupManagedHover(
      connectHoverDelegate,
      this._connectElement,
      () => hoverText
    );
  }
  _onConnectClick() {
    if (this._connectElement?.classList.contains("rediscover")) {
      if (!this._filterService.isDiscovering) {
        this._filterService.rediscover();
      }
      return;
    }
    const selectedId = this._filterService.selectedProviderId;
    if (selectedId === void 0) {
      return;
    }
    const selected = this._filterService.hosts.find((h) => h.providerId === selectedId);
    if (!selected) {
      return;
    }
    if (selected.status === AgentHostFilterConnectionStatus.Disconnected) {
      this._filterService.reconnect(selectedId);
    } else {
      this._filterService.disconnect(selectedId);
    }
  }
  _showMenu(e) {
    if (!this._dropdownElement) {
      return;
    }
    const hosts = this._filterService.hosts;
    if (hosts.length === 0) {
      if (!this._filterService.isDiscovering) {
        this._filterService.rediscover();
      }
      return;
    }
    if (hosts.length === 1) {
      return;
    }
    const selectedId = this._filterService.selectedProviderId;
    const actions = [];
    for (const host of hosts) {
      const label = host.status === AgentHostFilterConnectionStatus.Connected ? host.label : host.status === AgentHostFilterConnectionStatus.Connecting ? localize("agentHostFilter.hostConnecting", "{0} (connecting\u2026)", host.label) : localize("agentHostFilter.hostDisconnected", "{0} (disconnected)", host.label);
      actions.push(new Action(
        `agentHostFilter.host.${host.providerId}`,
        label,
        selectedId === host.providerId ? "codicon codicon-check" : void 0,
        true,
        async () => this._filterService.setSelectedProviderId(host.providerId)
      ));
    }
    const anchor = dom.isMouseEvent(e) ? new StandardMouseEvent(dom.getWindow(this._dropdownElement), e) : this._dropdownElement;
    this._contextMenuService.showContextMenu({
      getAnchor: () => anchor,
      getActions: () => actions,
      domForShadowRoot: this._dropdownElement
    });
  }
};
HostFilterActionViewItem = __decorateClass([
  __decorateParam(2, IAgentHostFilterService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IHoverService)
], HostFilterActionViewItem);
export {
  HostFilterActionViewItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxyZW1vdGVBZ2VudEhvc3RcXGJyb3dzZXJcXGhvc3RGaWx0ZXJBY3Rpb25WaWV3SXRlbS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9ob3N0RmlsdGVyLmNzcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBHZXN0dXJlLCBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgcmVuZGVyTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQmFzZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0RmlsdGVyQ29ubmVjdGlvblN0YXR1cywgSUFnZW50SG9zdEZpbHRlckVudHJ5LCBJQWdlbnRIb3N0RmlsdGVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2FnZW50SG9zdEZpbHRlci9jb21tb24vYWdlbnRIb3N0RmlsdGVyLmpzJztcblxuLyoqXG4gKiBWaXN1YWwgYXBwZWFyYW5jZSBvZiB7QGxpbmsgSG9zdEZpbHRlckFjdGlvblZpZXdJdGVtfS5cbiAqXG4gKiAtIGB0aXRsZWJhcmAgXHUyMDE0IHRoZSBvcmlnaW5hbCBjb21wYWN0IHBpbGwgZGVzaWduZWQgZm9yIHRoZSBkZXNrdG9wXG4gKiAgIHRpdGxlYmFyJ3MgbGVmdCB0b29sYmFyLiBGaXhlZC1oZWlnaHQgcGlsbCB3aXRoIGAtLXZzY29kZS10aXRsZUJhci1cdTIwMjZgXG4gKiAgIHRleHQgY29sb3JzIGFuZCBhIGBtYXgtd2lkdGhgIHNvIGl0IG5ldmVyIGdyb3dzIHRvbyB3aWRlLlxuICogLSBgc2lkZWJhcmAgXHUyMDE0IGZ1bGwtd2lkdGggcm93IGFsaWduZWQgd2l0aCB0aGUgcmVzdCBvZiB0aGUgYWdlbnRzXG4gKiAgIHNpZGViYXIgKG1hdGNoZXMgYC5zaWRlYmFyLWFjdGlvbi1idXR0b25gJ3Mgcmh5dGhtKSwgdXNlZCBieSB0aGVcbiAqICAge0BsaW5rIEFnZW50SG9zdFNob3J0Y3V0c1dpZGdldH0gb24gd2ViIGRlc2t0b3AuXG4gKi9cbmV4cG9ydCB0eXBlIEhvc3RGaWx0ZXJBcHBlYXJhbmNlID0gJ3RpdGxlYmFyJyB8ICdzaWRlYmFyJztcblxuLyoqXG4gKiBDb21wb3VuZCB3aWRnZXQgc2hvd2luZyB0aGUgYWdlbnQgaG9zdCBwaWNrZXIgcGx1cyBhIGNvbm5lY3Rpb24tc3RhdGVcbiAqIGJ1dHRvbi4gT3JpZ2luYWxseSBsaXZlZCBpbiB0aGUgZGVza3RvcCB0aXRsZWJhciwgbm93IGFsc28gcmVuZGVyZWQgYXMgYVxuICogc2lkZWJhciByb3cgdmlhIHtAbGluayBIb3N0RmlsdGVyQXBwZWFyYW5jZX0uXG4gKi9cbmV4cG9ydCBjbGFzcyBIb3N0RmlsdGVyQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByaXZhdGUgX2Ryb3Bkb3duRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhYmVsRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NoZXZyb25FbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29ubmVjdEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zaWRlYmFyQnV0dG9uOiBCdXR0b24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NpZGViYXJMZWFkaW5nSWNvbjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NpZGViYXJUcmFpbGluZ0ljb246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Ryb3Bkb3duSG92ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3RIb3ZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYXBwZWFyYW5jZTogSG9zdEZpbHRlckFwcGVhcmFuY2UgPSAndGl0bGViYXInLFxuXHRcdEBJQWdlbnRIb3N0RmlsdGVyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2ZpbHRlclNlcnZpY2U6IElBZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgYWN0aW9uKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZpbHRlclNlcnZpY2Uub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fdXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9maWx0ZXJTZXJ2aWNlLm9uRGlkQ2hhbmdlRGlzY292ZXJpbmcoKCkgPT4gdGhpcy5fdXBkYXRlKCkpKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cblx0XHRpZiAoIXRoaXMuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdhZ2VudC1ob3N0LWZpbHRlci1jb21ibycpO1xuXHRcdGlmICh0aGlzLl9hcHBlYXJhbmNlID09PSAnc2lkZWJhcicpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdzaWRlYmFyJyk7XG5cdFx0XHR0aGlzLl9yZW5kZXJTaWRlYmFyKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3JlbmRlclRpdGxlYmFyKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdXBkYXRlKCk7XG5cdH1cblxuXHQvKipcblx0ICogT3JpZ2luYWwgY29tcGFjdCBwaWxsIHJlbmRlcmVkIGluIHRoZSBkZXNrdG9wIHRpdGxlYmFyJ3MgbGVmdCB0b29sYmFyLlxuXHQgKiBDdXN0b20gRE9NIGRyaXZlbiBkaXJlY3RseSBieSBjbGljayBoYW5kbGVycyArIGNvbnRleHQgbWVudSBzZXJ2aWNlLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVuZGVyVGl0bGViYXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyAtLS0gRHJvcGRvd24gcGlsbCAobGVmdCkgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0XHR0aGlzLl9kcm9wZG93bkVsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudCwgZG9tLiQoJ2Rpdi5hZ2VudC1ob3N0LWZpbHRlci1kcm9wZG93bicpKTtcblxuXHRcdGNvbnN0IGljb25FbCA9IGRvbS5hcHBlbmQodGhpcy5fZHJvcGRvd25FbGVtZW50LCBkb20uJCgnc3Bhbi5hZ2VudC1ob3N0LWZpbHRlci1pY29uJykpO1xuXHRcdGljb25FbC5hcHBlbmQoLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMoYCQoJHtDb2RpY29uLnJlbW90ZS5pZH0pYCkpO1xuXG5cdFx0dGhpcy5fbGFiZWxFbGVtZW50ID0gZG9tLmFwcGVuZCh0aGlzLl9kcm9wZG93bkVsZW1lbnQsIGRvbS4kKCdzcGFuLmFnZW50LWhvc3QtZmlsdGVyLWxhYmVsJykpO1xuXG5cdFx0dGhpcy5fY2hldnJvbkVsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuX2Ryb3Bkb3duRWxlbWVudCwgZG9tLiQoJ3NwYW4uYWdlbnQtaG9zdC1maWx0ZXItY2hldnJvbicpKTtcblx0XHR0aGlzLl9jaGV2cm9uRWxlbWVudC5hcHBlbmQoLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMoYCQoJHtDb2RpY29uLmNoZXZyb25Eb3duLmlkfSlgKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihHZXN0dXJlLmFkZFRhcmdldCh0aGlzLl9kcm9wZG93bkVsZW1lbnQpKTtcblx0XHRmb3IgKGNvbnN0IGV2ZW50VHlwZSBvZiBbZG9tLkV2ZW50VHlwZS5DTElDSywgVG91Y2hFdmVudFR5cGUuVGFwXSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9kcm9wZG93bkVsZW1lbnQsIGV2ZW50VHlwZSwgZSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5faXNJbnRlcmFjdGl2ZSgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHR0aGlzLl9zaG93TWVudShlKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9kcm9wZG93bkVsZW1lbnQsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9pc0ludGVyYWN0aXZlKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuX3Nob3dNZW51KGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIC0tLSBDb25uZWN0aW9uIGJ1dHRvbiAocmlnaHQpIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHRcdHRoaXMuX2Nvbm5lY3RFbGVtZW50ID0gZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQsIGRvbS4kKCdkaXYuYWdlbnQtaG9zdC1maWx0ZXItY29ubmVjdCcpKTtcblx0XHR0aGlzLl93aXJlQ29ubmVjdEJ1dHRvbih0aGlzLl9jb25uZWN0RWxlbWVudCk7XG5cdH1cblxuXHQvKipcblx0ICogU2lkZWJhciBhcHBlYXJhbmNlIFx1MjAxNCBmdWxsLXdpZHRoIHJvdyBtYXRjaGluZyB0aGUgQ3VzdG9taXphdGlvbnMgbGlua3Ncblx0ICogKGBDdXN0b21pemF0aW9uTGlua1ZpZXdJdGVtYCkuIFNhbWUgTW9uYWNvIGBCdXR0b25gIHNoZWxsLCBzYW1lXG5cdCAqIGAuc2lkZWJhci1hY3Rpb24tYnV0dG9uYCBzdHlsaW5nLCBzYW1lIGBzdXBwb3J0SWNvbnNgIGxhYmVsIHJlbmRlcmluZy5cblx0ICogVGhlIHRyYWlsaW5nIGNvbm5lY3QgaW5kaWNhdG9yIGlzIHJlbmRlcmVkIGFsb25nc2lkZSB0aGUgcGlja2VyXG5cdCAqIGJ1dHRvbiBhcyBhIHNpYmxpbmcgY29udHJvbCwgc28gdGhlIHJvdyB2aXN1YWxseSBtaXJyb3JzIHRoZVxuXHQgKiBDdXN0b21pemF0aW9ucyByb3dzIGluIHRoZSB0b29sYmFyIGFib3ZlIHdpdGhvdXQgbWFraW5nIHRoZVxuXHQgKiBpbmRpY2F0b3IgcGFydCBvZiB0aGUgcGlja2VyIGxhYmVsLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVuZGVyU2lkZWJhcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdzaWRlYmFyLWFjdGlvbicpO1xuXG5cdFx0Ly8gUGlja2VyIGJ1dHRvbiBcdTIwMTQgc2FtZSBzaGVsbCBhcyBgQ3VzdG9taXphdGlvbkxpbmtWaWV3SXRlbWAuIFdlXG5cdFx0Ly8gZHJpdmUgdGhlIGJ1dHRvbiBjb250ZW50IG1hbnVhbGx5IChyYXRoZXIgdGhhbiB2aWEgYEJ1dHRvbi5sYWJlbGApXG5cdFx0Ly8gc28gdGhlIGhvc3QgbmFtZSBzcGFuIGNhbiBgZmxleDogMWAgYW5kIHB1c2ggdGhlIGNoZXZyb24gYWxsXG5cdFx0Ly8gdGhlIHdheSB0byB0aGUgdHJhaWxpbmcgZWRnZS5cblx0XHRjb25zdCBidXR0b25Db250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudCwgZG9tLiQoJy5jdXN0b21pemF0aW9uLWxpbmstYnV0dG9uLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLl9zaWRlYmFyQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihidXR0b25Db250YWluZXIsIHtcblx0XHRcdC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsXG5cdFx0XHRzZWNvbmRhcnk6IHRydWUsXG5cdFx0XHR0aXRsZTogZmFsc2UsXG5cdFx0XHRzdXBwb3J0SWNvbnM6IHRydWUsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kOiAndHJhbnNwYXJlbnQnLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5SG92ZXJCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlGb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlCb3JkZXI6IHVuZGVmaW5lZCxcblx0XHR9KSk7XG5cdFx0dGhpcy5fc2lkZWJhckJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2N1c3RvbWl6YXRpb24tbGluay1idXR0b24nLCAnc2lkZWJhci1hY3Rpb24tYnV0dG9uJywgJ2FnZW50LWhvc3QtZmlsdGVyLWJ1dHRvbicsICdtb25hY28tdGV4dC1idXR0b24nKTtcblxuXHRcdHRoaXMuX2Ryb3Bkb3duRWxlbWVudCA9IHRoaXMuX3NpZGViYXJCdXR0b24uZWxlbWVudDtcblx0XHQvLyBCdWlsZCB0aGUgYnV0dG9uIGNvbnRlbnQgbWFudWFsbHkgYXMgdGhyZWUgZGlyZWN0IGNoaWxkcmVuIHNvXG5cdFx0Ly8gd2UgY2FuIGtlZXAgc3RhYmxlIHJlZmVyZW5jZXMgdG8gZWFjaCBlbGVtZW50IChpY29uIFx1MDBCNyBsYWJlbCBcdTAwQjdcblx0XHQvLyBjaGV2cm9uKSB3aXRob3V0IERPTSBxdWVyeWluZy4gVGhlIGxhYmVsIHRha2VzIGBmbGV4OiAxYCBzb1xuXHRcdC8vIHRoZSB0cmFpbGluZyBjaGV2cm9uIGlzIHB1c2hlZCB0byB0aGUgcmlnaHQgZWRnZS5cblx0XHR0aGlzLl9zaWRlYmFyTGVhZGluZ0ljb24gPSBkb20uYXBwZW5kKHRoaXMuX3NpZGViYXJCdXR0b24uZWxlbWVudCwgZG9tLiQoJ3NwYW4uYWdlbnQtaG9zdC1maWx0ZXItbGVhZGluZy1pY29uJykpO1xuXHRcdHRoaXMuX3NpZGViYXJMZWFkaW5nSWNvbi5jbGFzc0xpc3QuYWRkKCdjb2RpY29uJywgYGNvZGljb24tJHtDb2RpY29uLnJlbW90ZS5pZH1gKTtcblx0XHR0aGlzLl9sYWJlbEVsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuX3NpZGViYXJCdXR0b24uZWxlbWVudCwgZG9tLiQoJ3NwYW4uYWdlbnQtaG9zdC1maWx0ZXItbGFiZWwnKSk7XG5cdFx0Ly8gVHJhaWxpbmcgY2hldnJvbiBpcyBjcmVhdGVkIHVwLWZyb250IGJ1dCBvbmx5IGF0dGFjaGVkIHRvIHRoZVxuXHRcdC8vIGJ1dHRvbiB3aGVuIHRoaXMgaXMgYSByZWFsIHBpY2tlciAoMisgaG9zdHMpLiBTZWVcblx0XHQvLyBgX3JlbmRlclNpZGViYXJCdXR0b25BZmZvcmRhbmNlc2AuXG5cdFx0dGhpcy5fc2lkZWJhclRyYWlsaW5nSWNvbiA9IGRvbS4kKCdzcGFuLmFnZW50LWhvc3QtZmlsdGVyLXRyYWlsaW5nLWljb24uY29kaWNvbicpO1xuXHRcdHRoaXMuX3NpZGViYXJUcmFpbGluZ0ljb24uY2xhc3NMaXN0LmFkZChgY29kaWNvbi0ke0NvZGljb24uY2hldnJvbkRvd24uaWR9YCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zaWRlYmFyQnV0dG9uLm9uRGlkQ2xpY2soZSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzSW50ZXJhY3RpdmUoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBQYXNzIHRoZSBvcmlnaW5hbCBldmVudCB0aHJvdWdoIHRvIGBfc2hvd01lbnVgLiBJdCB3aWxsXG5cdFx0XHQvLyBhbmNob3Igb24gdGhlIG1vdXNlIHBvc2l0aW9uIHdoZW4gYGVgIGlzIGEgcmVhbFxuXHRcdFx0Ly8gYE1vdXNlRXZlbnRgIGFuZCBvdGhlcndpc2UgZmFsbCBiYWNrIHRvIGFuY2hvcmluZyBvbiB0aGVcblx0XHRcdC8vIGRyb3Bkb3duIGVsZW1lbnQgKHRoZSByaWdodCBiZWhhdmlvciBmb3Iga2V5Ym9hcmQgL1xuXHRcdFx0Ly8gdG91Y2ggLyBnZXN0dXJlIGFjdGl2YXRpb25zKS4gV2hlbiB0aGVyZSBhcmUgbm8gaG9zdHMsXG5cdFx0XHQvLyBgX3Nob3dNZW51YCB0cmlnZ2VycyByZS1kaXNjb3ZlcnkgaW5zdGVhZCBvZiBvcGVuaW5nIHRoZVxuXHRcdFx0Ly8gbWVudSBcdTIwMTQgc2FtZSBhcyB0aGUgZGVkaWNhdGVkIHJlZnJlc2ggYnV0dG9uIG5leHQgdG8gaXQuXG5cdFx0XHR0aGlzLl9zaG93TWVudShlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBDb25uZWN0IGluZGljYXRvciBcdTIwMTQgc2libGluZyBvZiB0aGUgcGlja2VyIGJ1dHRvbiBzbyBpdCByZWFkcyBhc1xuXHRcdC8vIGFuIGluZGVwZW5kZW50IGNvbnRyb2wgKG5vdCBwYXJ0IG9mIHRoZSBwaWNrZXIgbGFiZWwpLlxuXHRcdHRoaXMuX2Nvbm5lY3RFbGVtZW50ID0gZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQsIGRvbS4kKCdkaXYuYWdlbnQtaG9zdC1maWx0ZXItY29ubmVjdCcpKTtcblx0XHR0aGlzLl93aXJlQ29ubmVjdEJ1dHRvbih0aGlzLl9jb25uZWN0RWxlbWVudCk7XG5cdH1cblxuXHRwcml2YXRlIF93aXJlQ29ubmVjdEJ1dHRvbihjb25uZWN0RWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihHZXN0dXJlLmFkZFRhcmdldChjb25uZWN0RWxlbWVudCkpO1xuXHRcdGZvciAoY29uc3QgZXZlbnRUeXBlIG9mIFtkb20uRXZlbnRUeXBlLkNMSUNLLCBUb3VjaEV2ZW50VHlwZS5UYXBdKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbm5lY3RFbGVtZW50LCBldmVudFR5cGUsIGUgPT4ge1xuXHRcdFx0XHQvLyBTdG9wIHByb3BhZ2F0aW9uIHNvIHRoZSBob3N0IG1lbnUgKHBhcmVudCBidXR0b24gY2xpY2spXG5cdFx0XHRcdC8vIGRvZXNuJ3Qgb3BlbiB3aGVuIHRvZ2dsaW5nIHRoZSBjb25uZWN0aW9uLlxuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5fb25Db25uZWN0Q2xpY2soKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb25uZWN0RWxlbWVudCwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpIHx8IGV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSkge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5fb25Db25uZWN0Q2xpY2soKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJTaWRlYmFyQnV0dG9uQWZmb3JkYW5jZXMoaW50ZXJhY3RpdmU6IGJvb2xlYW4sIGNhblJldHJ5OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zaWRlYmFyQnV0dG9uIHx8ICF0aGlzLl9zaWRlYmFyVHJhaWxpbmdJY29uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVHJhaWxpbmcgY2hldnJvbiBcdTIwMTQgb25seSBhdHRhY2hlZCB3aGVuIHRoaXMgaXMgYSByZWFsIHBpY2tlclxuXHRcdC8vIChpLmUuIHRoZXJlIGFyZSAyKyBob3N0cyB0byBjaG9vc2UgZnJvbSkuIEZvciBjYW5SZXRyeSAvXG5cdFx0Ly8gc2luZ2xlLWhvc3QgdGhlIGJ1dHRvbiBpcyAqbm90KiBhIGRyb3Bkb3duIFx1MjAxNCBpbiBjYW5SZXRyeSB0aGVcblx0XHQvLyByZWZyZXNoIGFjdGlvbiBsaXZlcyBpbiB0aGUgdHJhaWxpbmcgY29ubmVjdCBzbG90IGluc3RlYWQsXG5cdFx0Ly8gbWlycm9yaW5nIHRoZSBkaXNjb25uZWN0IGJ1dHRvbiBzaGFwZS5cblx0XHRjb25zdCBzaG93Q2hldnJvbiA9IGludGVyYWN0aXZlICYmICFjYW5SZXRyeTtcblx0XHRpZiAoc2hvd0NoZXZyb24pIHtcblx0XHRcdGlmICghdGhpcy5fc2lkZWJhclRyYWlsaW5nSWNvbi5pc0Nvbm5lY3RlZCkge1xuXHRcdFx0XHR0aGlzLl9zaWRlYmFyQnV0dG9uLmVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5fc2lkZWJhclRyYWlsaW5nSWNvbik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3NpZGViYXJUcmFpbGluZ0ljb24ucmVtb3ZlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9pc0ludGVyYWN0aXZlKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGhvc3RzID0gdGhpcy5fZmlsdGVyU2VydmljZS5ob3N0cztcblx0XHQvLyBJbnRlcmFjdGl2ZSB3aGVuIHRoZXJlIGlzIHNvbWV0aGluZyB0byBkbzogcGljayBmcm9tIGEgbWVudSAoPjFcblx0XHQvLyBob3N0cykgb3IgdHJpZ2dlciByZS1kaXNjb3ZlcnkgKDAgaG9zdHMpLiBXaXRoIGV4YWN0bHkgMSBob3N0IHRoZVxuXHRcdC8vIHBpbGwgaXMgYSBzdGF0aWMgbGFiZWwuXG5cdFx0cmV0dXJuIGhvc3RzLmxlbmd0aCA9PT0gMCB8fCBob3N0cy5sZW5ndGggPiAxO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5lbGVtZW50IHx8ICF0aGlzLl9kcm9wZG93bkVsZW1lbnQgfHwgIXRoaXMuX2xhYmVsRWxlbWVudCB8fCAhdGhpcy5fY29ubmVjdEVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUaXRsZWJhciBhcHBlYXJhbmNlIGhhcyBhIGNoZXZyb24gZWxlbWVudDsgc2lkZWJhciBkb2VzIG5vdC4gQmFpbFxuXHRcdC8vIG9ubHkgd2hlbiBhIHJlcXVpcmVkIGVsZW1lbnQgZm9yIHRoZSBhY3RpdmUgYXBwZWFyYW5jZSBpcyBtaXNzaW5nLlxuXHRcdGlmICghdGhpcy5fc2lkZWJhckJ1dHRvbiAmJiAhdGhpcy5fY2hldnJvbkVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBob3N0cyA9IHRoaXMuX2ZpbHRlclNlcnZpY2UuaG9zdHM7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRJZCA9IHRoaXMuX2ZpbHRlclNlcnZpY2Uuc2VsZWN0ZWRQcm92aWRlcklkO1xuXHRcdGNvbnN0IHNlbGVjdGVkID0gc2VsZWN0ZWRJZCA9PT0gdW5kZWZpbmVkXG5cdFx0XHQ/IHVuZGVmaW5lZFxuXHRcdFx0OiBob3N0cy5maW5kKGggPT4gaC5wcm92aWRlcklkID09PSBzZWxlY3RlZElkKTtcblxuXHRcdGNvbnN0IGhhc01lbnUgPSBob3N0cy5sZW5ndGggPiAxO1xuXHRcdGNvbnN0IGNhblJldHJ5ID0gaG9zdHMubGVuZ3RoID09PSAwO1xuXHRcdGNvbnN0IGludGVyYWN0aXZlID0gaGFzTWVudSB8fCBjYW5SZXRyeTtcblx0XHRjb25zdCBkaXNjb3ZlcmluZyA9IHRoaXMuX2ZpbHRlclNlcnZpY2UuaXNEaXNjb3ZlcmluZztcblxuXHRcdC8vIERyb3Bkb3duIGxhYmVsICsgYXJpYVxuXHRcdGNvbnN0IHRleHQgPSBzZWxlY3RlZFxuXHRcdFx0PyBzZWxlY3RlZC5sYWJlbFxuXHRcdFx0OiBkaXNjb3ZlcmluZ1xuXHRcdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEhvc3RGaWx0ZXIuc2VhcmNoaW5nJywgXCJTZWFyY2hpbmdcdTIwMjZcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRIb3N0RmlsdGVyLm5vbmUnLCBcIk5vIEhvc3RcIik7XG5cblx0XHRpZiAodGhpcy5fc2lkZWJhckJ1dHRvbikge1xuXHRcdFx0Ly8gU2lkZWJhciBhcHBlYXJhbmNlOiB3cml0ZSB0aGUgaG9zdCBuYW1lIGludG8gb3VyIG93biBsYWJlbFxuXHRcdFx0Ly8gc3BhbiAod2hpY2ggaXMgYGZsZXg6IDFgIHNvIGl0IGNvbnN1bWVzIHJlbWFpbmluZyBzcGFjZSkgYW5kXG5cdFx0XHQvLyAocmUpcG9zaXRpb24gdGhlIGxlYWRpbmcgaG9zdCBpY29uICsgdHJhaWxpbmcgY2hldnJvblxuXHRcdFx0Ly8gYXJvdW5kIGl0LiBUaGUgY2hldnJvbiB1c2VzIGAkKHJlZnJlc2gpYCB3aGVuIHRoZXJlIGFyZSBub1xuXHRcdFx0Ly8gaG9zdHMgKGNsaWNraW5nIHJlLXJ1bnMgZGlzY292ZXJ5KSBhbmQgaXMgb21pdHRlZCBlbnRpcmVseVxuXHRcdFx0Ly8gZm9yIHRoZSBub24taW50ZXJhY3RpdmUgc2luZ2xlLWhvc3QgY2FzZS5cblx0XHRcdHRoaXMuX2xhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9IHRleHQ7XG5cdFx0XHR0aGlzLl9yZW5kZXJTaWRlYmFyQnV0dG9uQWZmb3JkYW5jZXMoaW50ZXJhY3RpdmUsIGNhblJldHJ5KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbGFiZWxFbGVtZW50LnRleHRDb250ZW50ID0gdGV4dDtcblx0XHR9XG5cblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnc2luZ2xlLWhvc3QnLCAhaW50ZXJhY3RpdmUpO1xuXHRcdC8vIFdoaWxlIGRpc2NvdmVyeSBpcyBydW5uaW5nLCBzdXBwcmVzcyB0aGUgbGFiZWwgc28gdGhlIHBpbGwgY29sbGFwc2VzXG5cdFx0Ly8gdG8gYSBzbWFsbCBwdWxzaW5nIGljb24gKGEgbGEgXCJjaGVja2luZ1x1MjAyNlwiKS4gT25jZSBkaXNjb3ZlcnkgZmluaXNoZXMsXG5cdFx0Ly8gdGhlIGxhYmVsIHJlLWFwcGVhcnMuXG5cdFx0dGhpcy5fZHJvcGRvd25FbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2NvdmVyaW5nJywgZGlzY292ZXJpbmcpO1xuXHRcdHRoaXMuX2Ryb3Bkb3duRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCduby1ob3N0cycsIGNhblJldHJ5KTtcblxuXHRcdC8vIFN3YXAgdGhlIGNoZXZyb24gY29udGVudCBiYXNlZCBvbiB0aGUgY2xpY2sgYWZmb3JkYW5jZTogYSBjaGV2cm9uXG5cdFx0Ly8gd2hlbiB0aGUgcGlsbCBvcGVucyBhIG1lbnUsIGEgcmVmcmVzaCBpY29uIHdoZW4gaXQgdHJpZ2dlcnMgcmUtXG5cdFx0Ly8gZGlzY292ZXJ5LiBDbGVhcmluZyBmaXJzdCBhdm9pZHMgc3RhY2tpbmcgaWNvbiBub2Rlcy4gU2lkZWJhclxuXHRcdC8vIG1vZGUgaGFzIG5vIGNoZXZyb24gXHUyMDE0IHRoZSBidXR0b24gbGFiZWwgaXMgdGhlIHdob2xlIGludGVyYWN0aXZlXG5cdFx0Ly8gc3VyZmFjZS5cblx0XHRpZiAodGhpcy5fY2hldnJvbkVsZW1lbnQpIHtcblx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy5fY2hldnJvbkVsZW1lbnQpO1xuXHRcdFx0Y29uc3QgY2hldnJvbkljb25JZCA9IGNhblJldHJ5ID8gQ29kaWNvbi5yZWZyZXNoLmlkIDogQ29kaWNvbi5jaGV2cm9uRG93bi5pZDtcblx0XHRcdHRoaXMuX2NoZXZyb25FbGVtZW50LmFwcGVuZCguLi5yZW5kZXJMYWJlbFdpdGhJY29ucyhgJCgke2NoZXZyb25JY29uSWR9KWApKTtcblx0XHR9XG5cblx0XHRpZiAoaW50ZXJhY3RpdmUpIHtcblx0XHRcdGlmICghdGhpcy5fc2lkZWJhckJ1dHRvbikge1xuXHRcdFx0XHQvLyBUaXRsZWJhcjogZHJpdmUgdGFiSW5kZXggLyByb2xlIG9uIHRoZSBkcm9wZG93biBESVYgbWFudWFsbHkuXG5cdFx0XHRcdC8vIFRoZSBCdXR0b24gdXNlZCBpbiB0aGUgc2lkZWJhciBhcHBlYXJhbmNlIGFscmVhZHkgcHJvdmlkZXNcblx0XHRcdFx0Ly8gaXRzIG93biBmb2N1c2FiaWxpdHksIHJvbGUsIGFuZCBrZXlib2FyZCBhY3RpdmF0aW9uLlxuXHRcdFx0XHR0aGlzLl9kcm9wZG93bkVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdFx0XHR0aGlzLl9kcm9wZG93bkVsZW1lbnQucm9sZSA9ICdidXR0b24nO1xuXHRcdFx0XHRpZiAoaGFzTWVudSkge1xuXHRcdFx0XHRcdHRoaXMuX2Ryb3Bkb3duRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGFzcG9wdXAnLCAnbWVudScpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2Ryb3Bkb3duRWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtaGFzcG9wdXAnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChoYXNNZW51KSB7XG5cdFx0XHRcdHRoaXMuX2Ryb3Bkb3duRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGFzcG9wdXAnLCAnbWVudScpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZHJvcGRvd25FbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYXJpYUxhYmVsID0gc2VsZWN0ZWRcblx0XHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRIb3N0RmlsdGVyLmFyaWEuc2VsZWN0ZWQnLCBcIlNlc3Npb25zIHNjb3BlZCB0byBob3N0IHswfS4gQ2xpY2sgdG8gY2hhbmdlIGhvc3QuXCIsIHNlbGVjdGVkLmxhYmVsKVxuXHRcdFx0XHQ6IGNhblJldHJ5XG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRIb3N0RmlsdGVyLmFyaWEucmV0cnknLCBcIk5vIGhvc3RzIGZvdW5kLiBDbGljayB0byByZS1kaXNjb3ZlciBob3N0cy5cIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3RGaWx0ZXIuYXJpYS5ub25lJywgXCJObyBhZ2VudCBob3N0IHNlbGVjdGVkLlwiKTtcblx0XHRcdHRoaXMuX2Ryb3Bkb3duRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBhcmlhTGFiZWwpO1xuXHRcdFx0Y29uc3QgaG92ZXJUZXh0ID0gY2FuUmV0cnlcblx0XHRcdFx0PyAoZGlzY292ZXJpbmdcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEhvc3RGaWx0ZXIuaG92ZXIuc2VhcmNoaW5nJywgXCJTZWFyY2hpbmcgZm9yIGhvc3RzXHUyMDI2XCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRIb3N0RmlsdGVyLmhvdmVyLnJldHJ5JywgXCJSZS1kaXNjb3ZlciBob3N0c1wiKSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRIb3N0RmlsdGVyLmhvdmVyJywgXCJDaGFuZ2UgdGhlIGhvc3QgdGhlIHNlc3Npb25zIGxpc3QgaXMgc2NvcGVkIHRvXCIpO1xuXHRcdFx0dGhpcy5fZHJvcGRvd25Ib3Zlci52YWx1ZSA9IHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcihcblx0XHRcdFx0Z2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSxcblx0XHRcdFx0dGhpcy5fZHJvcGRvd25FbGVtZW50LFxuXHRcdFx0XHQoKSA9PiBob3ZlclRleHQsXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIXRoaXMuX3NpZGViYXJCdXR0b24pIHtcblx0XHRcdFx0dGhpcy5fZHJvcGRvd25FbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgndGFiaW5kZXgnKTtcblx0XHRcdFx0dGhpcy5fZHJvcGRvd25FbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgncm9sZScpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZHJvcGRvd25FbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcpO1xuXHRcdFx0dGhpcy5fZHJvcGRvd25FbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHNlbGVjdGVkXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdEZpbHRlci5hcmlhLnNpbmdsZVNlbGVjdGVkJywgXCJTZXNzaW9ucyBzY29wZWQgdG8gaG9zdCB7MH1cIiwgc2VsZWN0ZWQubGFiZWwpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2FnZW50SG9zdEZpbHRlci5hcmlhLm5vbmUnLCBcIk5vIGFnZW50IGhvc3Qgc2VsZWN0ZWQuXCIpKTtcblx0XHRcdHRoaXMuX2Ryb3Bkb3duSG92ZXIuY2xlYXIoKTtcblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVDb25uZWN0QnV0dG9uKHNlbGVjdGVkLCBjYW5SZXRyeSwgZGlzY292ZXJpbmcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ29ubmVjdEJ1dHRvbihzZWxlY3RlZDogSUFnZW50SG9zdEZpbHRlckVudHJ5IHwgdW5kZWZpbmVkLCBjYW5SZXRyeTogYm9vbGVhbiwgZGlzY292ZXJpbmc6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2Nvbm5lY3RFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLl9jb25uZWN0RWxlbWVudCk7XG5cdFx0dGhpcy5fY29ubmVjdEVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnY29ubmVjdGVkJywgJ2Nvbm5lY3RpbmcnLCAnZGlzY29ubmVjdGVkJywgJ3JlZGlzY292ZXInLCAnaGlkZGVuJyk7XG5cdFx0dGhpcy5fY29ubmVjdEhvdmVyLmNsZWFyKCk7XG5cblx0XHQvLyBTaWRlYmFyIGFwcGVhcmFuY2U6IHdoZW4gdGhlcmUgYXJlIG5vIGtub3duIGhvc3RzLCByZXB1cnBvc2Vcblx0XHQvLyB0aGlzIHRyYWlsaW5nIHNsb3QgYXMgYSBcIlJlLWRpc2NvdmVyIGhvc3RzXCIgYnV0dG9uIHNvIHRoZVxuXHRcdC8vIHVzZXIgaGFzIGFuIGluZGVwZW5kZW50IGNvbnRyb2wgbmV4dCB0byB0aGUgXCJObyBIb3N0XCIgcGlja2VyXG5cdFx0Ly8gXHUyMDE0IHNhbWUgc2hhcGUgYXMgZGlzY29ubmVjdC9jb25uZWN0IG9uIGEgcmVhbCBob3N0LlxuXHRcdGlmICghc2VsZWN0ZWQgJiYgdGhpcy5fc2lkZWJhckJ1dHRvbiAmJiBjYW5SZXRyeSkge1xuXHRcdFx0dGhpcy5fY29ubmVjdEVsZW1lbnQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdFx0dGhpcy5fY29ubmVjdEVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdFx0dGhpcy5fY29ubmVjdEVsZW1lbnQuY2xhc3NMaXN0LmFkZCgncmVkaXNjb3ZlcicpO1xuXHRcdFx0dGhpcy5fY29ubmVjdEVsZW1lbnQuYXBwZW5kKC4uLnJlbmRlckxhYmVsV2l0aEljb25zKGAkKCR7Q29kaWNvbi5yZWZyZXNoLmlkfSlgKSk7XG5cdFx0XHRjb25zdCBob3ZlclRleHQgPSBkaXNjb3ZlcmluZ1xuXHRcdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEhvc3RGaWx0ZXIuaG92ZXIuc2VhcmNoaW5nJywgXCJTZWFyY2hpbmcgZm9yIGhvc3RzXHUyMDI2XCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2FnZW50SG9zdEZpbHRlci5ob3Zlci5yZXRyeScsIFwiUmUtZGlzY292ZXIgaG9zdHNcIik7XG5cdFx0XHR0aGlzLl9jb25uZWN0RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBob3ZlclRleHQpO1xuXHRcdFx0dGhpcy5fY29ubmVjdEhvdmVyLnZhbHVlID0gdGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKFxuXHRcdFx0XHRnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLFxuXHRcdFx0XHR0aGlzLl9jb25uZWN0RWxlbWVudCxcblx0XHRcdFx0KCkgPT4gaG92ZXJUZXh0LFxuXHRcdFx0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXNlbGVjdGVkKSB7XG5cdFx0XHR0aGlzLl9jb25uZWN0RWxlbWVudC5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHRcdHRoaXMuX2Nvbm5lY3RFbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgncm9sZScpO1xuXHRcdFx0dGhpcy5fY29ubmVjdEVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCd0YWJpbmRleCcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEFsd2F5cyByZW5kZXIgYXMgYSBidXR0b247IGNsaWNraW5nIGZvcmNlcyBhIGZyZXNoIGNvbm5lY3QgYXR0ZW1wdFxuXHRcdC8vIHJlZ2FyZGxlc3Mgb2YgY3VycmVudCBzdGF0ZSAodGhlIHBsYXRmb3JtIHNlcnZpY2UgdGVhcnMgZG93biBhbnlcblx0XHQvLyBleGlzdGluZyBjb25uZWN0aW9uIGJlZm9yZSByZWNvbm5lY3RpbmcpLlxuXHRcdHRoaXMuX2Nvbm5lY3RFbGVtZW50LnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHR0aGlzLl9jb25uZWN0RWxlbWVudC50YWJJbmRleCA9IDA7XG5cblx0XHRsZXQgaWNvbklkOiBzdHJpbmc7XG5cdFx0bGV0IGhvdmVyVGV4dDogc3RyaW5nO1xuXHRcdHN3aXRjaCAoc2VsZWN0ZWQuc3RhdHVzKSB7XG5cdFx0XHRjYXNlIEFnZW50SG9zdEZpbHRlckNvbm5lY3Rpb25TdGF0dXMuQ29ubmVjdGVkOlxuXHRcdFx0XHRpY29uSWQgPSBDb2RpY29uLmRlYnVnQ29ubmVjdGVkLmlkO1xuXHRcdFx0XHR0aGlzLl9jb25uZWN0RWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjb25uZWN0ZWQnKTtcblx0XHRcdFx0aG92ZXJUZXh0ID0gbG9jYWxpemUoJ2FnZW50SG9zdEZpbHRlci5zdGF0dXMuY29ubmVjdGVkJywgXCJDb25uZWN0ZWQgdG8gezB9LiBDbGljayB0byBkaXNjb25uZWN0LlwiLCBzZWxlY3RlZC5sYWJlbCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBZ2VudEhvc3RGaWx0ZXJDb25uZWN0aW9uU3RhdHVzLkNvbm5lY3Rpbmc6XG5cdFx0XHRcdGljb25JZCA9IENvZGljb24uZGVidWdDb25uZWN0ZWQuaWQ7XG5cdFx0XHRcdHRoaXMuX2Nvbm5lY3RFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2Nvbm5lY3RpbmcnKTtcblx0XHRcdFx0aG92ZXJUZXh0ID0gbG9jYWxpemUoJ2FnZW50SG9zdEZpbHRlci5zdGF0dXMuY29ubmVjdGluZycsIFwiQ29ubmVjdGluZyB0byB7MH1cdTIwMjYgQ2xpY2sgdG8gY2FuY2VsLlwiLCBzZWxlY3RlZC5sYWJlbCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBZ2VudEhvc3RGaWx0ZXJDb25uZWN0aW9uU3RhdHVzLkRpc2Nvbm5lY3RlZDpcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGljb25JZCA9IENvZGljb24uZGVidWdEaXNjb25uZWN0LmlkO1xuXHRcdFx0XHR0aGlzLl9jb25uZWN0RWxlbWVudC5jbGFzc0xpc3QuYWRkKCdkaXNjb25uZWN0ZWQnKTtcblx0XHRcdFx0aG92ZXJUZXh0ID0gbG9jYWxpemUoJ2FnZW50SG9zdEZpbHRlci5zdGF0dXMuZGlzY29ubmVjdGVkJywgXCJEaXNjb25uZWN0ZWQgZnJvbSB7MH0uIENsaWNrIHRvIGNvbm5lY3QuXCIsIHNlbGVjdGVkLmxhYmVsKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdHRoaXMuX2Nvbm5lY3RFbGVtZW50LmFwcGVuZCguLi5yZW5kZXJMYWJlbFdpdGhJY29ucyhgJCgke2ljb25JZH0pYCkpO1xuXHRcdHRoaXMuX2Nvbm5lY3RFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGhvdmVyVGV4dCk7XG5cblx0XHRjb25zdCBjb25uZWN0SG92ZXJEZWxlZ2F0ZSA9IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50Jyk7XG5cdFx0dGhpcy5fY29ubmVjdEhvdmVyLnZhbHVlID0gdGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKFxuXHRcdFx0Y29ubmVjdEhvdmVyRGVsZWdhdGUsXG5cdFx0XHR0aGlzLl9jb25uZWN0RWxlbWVudCxcblx0XHRcdCgpID0+IGhvdmVyVGV4dCxcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25Db25uZWN0Q2xpY2soKTogdm9pZCB7XG5cdFx0Ly8gU2lkZWJhciBcIm5vIGhvc3RzXCIgc3RhdGU6IHRoZSBjb25uZWN0IHNsb3QgZG91YmxlcyBhcyBhXG5cdFx0Ly8gcmUtZGlzY292ZXJ5IGFmZm9yZGFuY2UgKHJlZnJlc2ggaWNvbikuIFRyaWdnZXIgZGlzY292ZXJ5IHdoZW5cblx0XHQvLyB3ZSByZWNvZ25pc2UgdGhhdCBtb2RlLlxuXHRcdGlmICh0aGlzLl9jb25uZWN0RWxlbWVudD8uY2xhc3NMaXN0LmNvbnRhaW5zKCdyZWRpc2NvdmVyJykpIHtcblx0XHRcdGlmICghdGhpcy5fZmlsdGVyU2VydmljZS5pc0Rpc2NvdmVyaW5nKSB7XG5cdFx0XHRcdHRoaXMuX2ZpbHRlclNlcnZpY2UucmVkaXNjb3ZlcigpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGVkSWQgPSB0aGlzLl9maWx0ZXJTZXJ2aWNlLnNlbGVjdGVkUHJvdmlkZXJJZDtcblx0XHRpZiAoc2VsZWN0ZWRJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlbGVjdGVkID0gdGhpcy5fZmlsdGVyU2VydmljZS5ob3N0cy5maW5kKGggPT4gaC5wcm92aWRlcklkID09PSBzZWxlY3RlZElkKTtcblx0XHRpZiAoIXNlbGVjdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChzZWxlY3RlZC5zdGF0dXMgPT09IEFnZW50SG9zdEZpbHRlckNvbm5lY3Rpb25TdGF0dXMuRGlzY29ubmVjdGVkKSB7XG5cdFx0XHR0aGlzLl9maWx0ZXJTZXJ2aWNlLnJlY29ubmVjdChzZWxlY3RlZElkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQ29ubmVjdGVkIG9yIENvbm5lY3RpbmcgXHUyMDE0IGNsaWNraW5nIHRlYXJzIGRvd24gdGhlIGN1cnJlbnRcblx0XHRcdC8vIGNvbm5lY3Rpb24gLyBjYW5jZWxzIHRoZSBpbi1mbGlnaHQgYXR0ZW1wdC5cblx0XHRcdHRoaXMuX2ZpbHRlclNlcnZpY2UuZGlzY29ubmVjdChzZWxlY3RlZElkKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3Nob3dNZW51KGU6IEV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9kcm9wZG93bkVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBob3N0cyA9IHRoaXMuX2ZpbHRlclNlcnZpY2UuaG9zdHM7XG5cdFx0Ly8gWmVybyBob3N0czogdGhlIHBpbGwgaXMgYSByZS1kaXNjb3ZlcnkgdHJpZ2dlciwgbm90IGEgbWVudS4gRmlyZVxuXHRcdC8vIHJlZGlzY292ZXIoKSB1bmxlc3Mgb25lIGlzIGFscmVhZHkgaW4gZmxpZ2h0LlxuXHRcdGlmIChob3N0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdGlmICghdGhpcy5fZmlsdGVyU2VydmljZS5pc0Rpc2NvdmVyaW5nKSB7XG5cdFx0XHRcdHRoaXMuX2ZpbHRlclNlcnZpY2UucmVkaXNjb3ZlcigpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoaG9zdHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0ZWRJZCA9IHRoaXMuX2ZpbHRlclNlcnZpY2Uuc2VsZWN0ZWRQcm92aWRlcklkO1xuXG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBob3N0IG9mIGhvc3RzKSB7XG5cdFx0XHRjb25zdCBsYWJlbCA9IGhvc3Quc3RhdHVzID09PSBBZ2VudEhvc3RGaWx0ZXJDb25uZWN0aW9uU3RhdHVzLkNvbm5lY3RlZFxuXHRcdFx0XHQ/IGhvc3QubGFiZWxcblx0XHRcdFx0OiBob3N0LnN0YXR1cyA9PT0gQWdlbnRIb3N0RmlsdGVyQ29ubmVjdGlvblN0YXR1cy5Db25uZWN0aW5nXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRIb3N0RmlsdGVyLmhvc3RDb25uZWN0aW5nJywgXCJ7MH0gKGNvbm5lY3RpbmdcdTIwMjYpXCIsIGhvc3QubGFiZWwpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRIb3N0RmlsdGVyLmhvc3REaXNjb25uZWN0ZWQnLCBcInswfSAoZGlzY29ubmVjdGVkKVwiLCBob3N0LmxhYmVsKTtcblx0XHRcdGFjdGlvbnMucHVzaChuZXcgQWN0aW9uKFxuXHRcdFx0XHRgYWdlbnRIb3N0RmlsdGVyLmhvc3QuJHtob3N0LnByb3ZpZGVySWR9YCxcblx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdHNlbGVjdGVkSWQgPT09IGhvc3QucHJvdmlkZXJJZCA/ICdjb2RpY29uIGNvZGljb24tY2hlY2snIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRhc3luYyAoKSA9PiB0aGlzLl9maWx0ZXJTZXJ2aWNlLnNldFNlbGVjdGVkUHJvdmlkZXJJZChob3N0LnByb3ZpZGVySWQpLFxuXHRcdFx0KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYW5jaG9yID0gZG9tLmlzTW91c2VFdmVudChlKVxuXHRcdFx0PyBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGRvbS5nZXRXaW5kb3codGhpcy5fZHJvcGRvd25FbGVtZW50KSwgZSlcblx0XHRcdDogdGhpcy5fZHJvcGRvd25FbGVtZW50O1xuXG5cdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGFuY2hvcixcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRkb21Gb3JTaGFkb3dSb290OiB0aGlzLl9kcm9wZG93bkVsZW1lbnQsXG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixTQUFTLFNBQVMsYUFBYSxzQkFBc0I7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LFdBQVcsS0FBSyxlQUFlLE1BQU0sS0FBSyxPQUFLLEVBQUUsZUFBZSxVQUFVO0FBQ2hGLFFBQUksQ0FBQyxVQUFVO0FBQ2Q7QUFBQSxJQUNEO0FBQ0EsUUFBSSxTQUFTLFdBQVcsZ0NBQWdDLGNBQWM7QUFDckUsV0FBSyxlQUFlLFVBQVUsVUFBVTtBQUFBLElBQ3pDLE9BQU87QUFHTixXQUFLLGVBQWUsV0FBVyxVQUFVO0FBQUEsSUFDMUM7QUFBQSxFQUNEO0FBQUEsRUFFVSxVQUFVLEdBQWdCO0FBQ25DLFFBQUksQ0FBQyxLQUFLLGtCQUFrQjtBQUMzQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFFBQVEsS0FBSyxlQUFlO0FBR2xDLFFBQUksTUFBTSxXQUFXLEdBQUc7QUFDdkIsVUFBSSxDQUFDLEtBQUssZUFBZSxlQUFlO0FBQ3ZDLGFBQUssZUFBZSxXQUFXO0FBQUEsTUFDaEM7QUFDQTtBQUFBLElBQ0Q7QUFDQSxRQUFJLE1BQU0sV0FBVyxHQUFHO0FBQ3ZCO0FBQUEsSUFDRDtBQUVBLFVBQU0sYUFBYSxLQUFLLGVBQWU7QUFFdkMsVUFBTSxVQUFxQixDQUFDO0FBQzVCLGVBQVcsUUFBUSxPQUFPO0FBQ3pCLFlBQU0sUUFBUSxLQUFLLFdBQVcsZ0NBQWdDLFlBQzNELEtBQUssUUFDTCxLQUFLLFdBQVcsZ0NBQWdDLGFBQy9DLFNBQVMsa0NBQWtDLDBCQUFxQixLQUFLLEtBQUssSUFDMUUsU0FBUyxvQ0FBb0Msc0JBQXNCLEtBQUssS0FBSztBQUNqRixjQUFRLEtBQUssSUFBSTtBQUFBLFFBQ2hCLHdCQUF3QixLQUFLLFVBQVU7QUFBQSxRQUN2QztBQUFBLFFBQ0EsZUFBZSxLQUFLLGFBQWEsMEJBQTBCO0FBQUEsUUFDM0Q7QUFBQSxRQUNBLFlBQVksS0FBSyxlQUFlLHNCQUFzQixLQUFLLFVBQVU7QUFBQSxNQUN0RSxDQUFDO0FBQUEsSUFDRjtBQUVBLFVBQU0sU0FBUyxJQUFJLGFBQWEsQ0FBQyxJQUM5QixJQUFJLG1CQUFtQixJQUFJLFVBQVUsS0FBSyxnQkFBZ0IsR0FBRyxDQUFDLElBQzlELEtBQUs7QUFFUixTQUFLLG9CQUFvQixnQkFBZ0I7QUFBQSxNQUN4QyxXQUFXLE1BQU07QUFBQSxNQUNqQixZQUFZLE1BQU07QUFBQSxNQUNsQixrQkFBa0IsS0FBSztBQUFBLElBQ3hCLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUE1Y2EsMkJBQU47QUFBQSxFQWdCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FsQlU7IiwKICAibmFtZXMiOiBbImhvdmVyVGV4dCJdCn0K
