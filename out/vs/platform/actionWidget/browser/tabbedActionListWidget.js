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
import * as dom from "../../../base/browser/dom.js";
import { Radio } from "../../../base/browser/ui/radio/radio.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { IContextViewService } from "../../contextview/browser/contextView.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { ActionList } from "./actionList.js";
import "./tabbedActionListWidget.css";
let TabbedActionListWidget = class extends Disposable {
  constructor(_contextViewService, _instantiationService) {
    super();
    this._contextViewService = _contextViewService;
    this._instantiationService = _instantiationService;
    this._onDidChangeTab = this._register(new Emitter());
    this.onDidChangeTab = this._onDidChangeTab.event;
    this._onDidHide = this._register(new Emitter());
    this.onDidHide = this._onDidHide.event;
    this._activePopup = this._register(new MutableDisposable());
    this._swappingTab = false;
  }
  get isVisible() {
    return !!this._activePopup.value;
  }
  /**
   * Shows the popup anchored to {@link ITabbedActionListShowOptions.anchor}.
   * If a popup is already visible, it is replaced in place.
   */
  show(options) {
    const isSwap = this.isVisible;
    if (isSwap) {
      this._swappingTab = true;
      this._activePopup.value = void 0;
    }
    let activeTab = options.initialTab;
    const popupDisposables = new DisposableStore();
    const hide = () => {
      if (this._activePopup.value === popupDisposables) {
        this._activePopup.value = void 0;
      }
    };
    this._activePopup.value = popupDisposables;
    popupDisposables.add(toDisposable(() => {
      this._contextViewService.hideContextView();
    }));
    let listRef;
    this._contextViewService.showContextView({
      getAnchor: () => options.anchor,
      render: (container) => {
        const renderDisposables = new DisposableStore();
        const widget = dom.append(container, dom.$(".action-widget"));
        const tabBar = dom.append(widget, dom.$(".tabbed-action-list-tabbar"));
        if (options.tabBarClassName) {
          tabBar.classList.add(options.tabBarClassName);
        }
        const radio = renderDisposables.add(new Radio({
          items: options.tabs.map((tab) => {
            const label = tab.label ?? tab.id;
            const text = tab.icon ? `$(${tab.icon.id}) ${label}` : label;
            return { text, tooltip: tab.tooltip ?? label, isActive: tab.id === activeTab };
          })
        }));
        tabBar.appendChild(radio.domNode);
        const activateTab = (next) => {
          if (next === activeTab) {
            return;
          }
          activeTab = next;
          this._onDidChangeTab.fire(next);
          this.show({ ...options, initialTab: next });
        };
        renderDisposables.add(radio.onDidSelect((index) => {
          const next = options.tabs[index];
          if (next) {
            activateTab(next.id);
          }
        }));
        const { items, listOptions } = options.createActionList(activeTab);
        const list = renderDisposables.add(this._instantiationService.createInstance(
          ActionList,
          options.user,
          false,
          items,
          options.delegate,
          options.accessibilityProvider,
          listOptions,
          options.anchor
        ));
        listRef = list;
        if (list.filterContainer) {
          widget.appendChild(list.filterContainer);
        }
        widget.appendChild(list.domNode);
        const width = list.layout(0);
        widget.style.width = `${options.width ?? width}px`;
        list.focus();
        renderDisposables.add(dom.addStandardDisposableListener(widget, "keydown", (e) => {
          const target = e.target;
          const onTabBar = !!target?.closest(".tabbed-action-list-tabbar");
          const onEditable = !!target?.closest('input, textarea, [contenteditable="true"]');
          if (e.keyCode === KeyCode.Escape) {
            dom.EventHelper.stop(e, true);
            hide();
            return;
          }
          if (e.keyCode === KeyCode.Enter && !onTabBar) {
            dom.EventHelper.stop(e, true);
            list.acceptSelected();
            return;
          }
          if (e.keyCode === KeyCode.UpArrow && !onTabBar) {
            dom.EventHelper.stop(e, true);
            list.focusPrevious();
            return;
          }
          if (e.keyCode === KeyCode.DownArrow && !onTabBar) {
            dom.EventHelper.stop(e, true);
            list.focusNext();
            return;
          }
          if (e.keyCode !== KeyCode.LeftArrow && e.keyCode !== KeyCode.RightArrow) {
            return;
          }
          if (onEditable && !onTabBar) {
            return;
          }
          const currentIndex = options.tabs.findIndex((t) => t.id === activeTab);
          if (currentIndex < 0) {
            return;
          }
          const delta = e.keyCode === KeyCode.RightArrow ? 1 : -1;
          const nextIndex = (currentIndex + delta + options.tabs.length) % options.tabs.length;
          e.preventDefault();
          e.stopPropagation();
          activateTab(options.tabs[nextIndex].id);
        }));
        const focusTracker = renderDisposables.add(dom.trackFocus(container));
        renderDisposables.add(focusTracker.onDidBlur(() => {
          if (this._swappingTab) {
            return;
          }
          const activeElement = dom.getActiveElement();
          if (activeElement && (activeElement.closest(".action-widget-hover") || activeElement.closest(".action-list-submenu-panel"))) {
            return;
          }
          hide();
        }));
        return renderDisposables;
      },
      onHide: () => {
        listRef = void 0;
        if (this._swappingTab) {
          return;
        }
        if (this._activePopup.value === popupDisposables) {
          this._activePopup.value = void 0;
        }
        options.delegate.onHide?.();
        this._onDidHide.fire();
      },
      get anchorPosition() {
        return listRef?.anchorPosition;
      }
    }, options.container, false);
    if (isSwap) {
      this._swappingTab = false;
    }
  }
  hide() {
    this._activePopup.value = void 0;
  }
  dispose() {
    this._activePopup.value = void 0;
    super.dispose();
  }
};
TabbedActionListWidget = __decorateClass([
  __decorateParam(0, IContextViewService),
  __decorateParam(1, IInstantiationService)
], TabbedActionListWidget);
export {
  TabbedActionListWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWN0aW9uV2lkZ2V0XFxicm93c2VyXFx0YWJiZWRBY3Rpb25MaXN0V2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUFuY2hvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgUmFkaW8gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcmFkaW8vcmFkaW8uanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQWN0aW9uTGlzdCwgSUFjdGlvbkxpc3REZWxlZ2F0ZSwgSUFjdGlvbkxpc3RJdGVtLCBJQWN0aW9uTGlzdE9wdGlvbnMgfSBmcm9tICcuL2FjdGlvbkxpc3QuanMnO1xuaW1wb3J0ICcuL3RhYmJlZEFjdGlvbkxpc3RXaWRnZXQuY3NzJztcblxuLyoqXG4gKiBSZXN1bHQgb2Yge0BsaW5rIElUYWJiZWRBY3Rpb25MaXN0U2hvd09wdGlvbnMuY3JlYXRlQWN0aW9uTGlzdH0uIFRoZSBsaXN0XG4gKiBvcHRpb25zIGFyZSByZWNvbXB1dGVkIG9uIGV2ZXJ5IHRhYiBzd2l0Y2ggc28gY2FsbGVycyBjYW4gdmFyeSBmaWx0ZXJcbiAqIHZpc2liaWxpdHksIHdpZHRoLCBldGMuIGJ5IHRhYi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGFiYmVkQWN0aW9uTGlzdEJ1aWxkUmVzdWx0PFQ+IHtcblx0cmVhZG9ubHkgaXRlbXM6IHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxUPltdO1xuXHRyZWFkb25seSBsaXN0T3B0aW9ucz86IElBY3Rpb25MaXN0T3B0aW9ucztcbn1cblxuLyoqXG4gKiBEZXNjcmliZXMgb25lIHRhYiBpbiBhIHtAbGluayBUYWJiZWRBY3Rpb25MaXN0V2lkZ2V0fS4gVGhlIHtAbGluayBpZH1cbiAqIGlzIHRoZSBzdGFibGUgaWRlbnRpdHkgdXNlZCBldmVyeXdoZXJlIHRoZSB3aWRnZXQgcmVhc29ucyBhYm91dCBhXG4gKiB0YWIgKGluaXRpYWwgc2VsZWN0aW9uLCBjaGFuZ2UgZXZlbnRzLCBgY3JlYXRlQWN0aW9uTGlzdGAgY2FsbGJhY2spO1xuICoge0BsaW5rIGxhYmVsfSwge0BsaW5rIHRvb2x0aXB9LCBhbmQge0BsaW5rIGljb259IGFyZSBwcmVzZW50YXRpb24gb25seS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGFiRGVzY3JpcHRvciB7XG5cdC8qKiBTdGFibGUgaWRlbnRpZmllciB1c2VkIGZvciB0YWIgaWRlbnRpdHkgYW5kIHNlbGVjdGlvbiBjYWxsYmFja3MuICovXG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdC8qKiBWaXNpYmxlIGxhYmVsLiBEZWZhdWx0cyB0byB7QGxpbmsgaWR9LiBMb2NhbGl6ZSBhdCB0aGUgY2FsbCBzaXRlLiAqL1xuXHRyZWFkb25seSBsYWJlbD86IHN0cmluZztcblx0LyoqIEhvdmVyIHRvb2x0aXAuIERlZmF1bHRzIHRvIHtAbGluayBsYWJlbH0gPz8ge0BsaW5rIGlkfS4gKi9cblx0cmVhZG9ubHkgdG9vbHRpcD86IHN0cmluZztcblx0LyoqIE9wdGlvbmFsIGxlYWRpbmcgaWNvbiByZW5kZXJlZCBiZWZvcmUgdGhlIGxhYmVsLiAqL1xuXHRyZWFkb25seSBpY29uPzogVGhlbWVJY29uO1xufVxuXG4vKipcbiAqIE9wdGlvbnMgZm9yIHtAbGluayBUYWJiZWRBY3Rpb25MaXN0V2lkZ2V0LnNob3d9LiBUaGUgd2lkZ2V0IHJlbmRlcnMgYVxuICogdGFiIGJhciBhYm92ZSBhbiBgQWN0aW9uTGlzdGAgaW5zaWRlIGEgc2luZ2xlIHBvcHVwLiBDb25zdW1lcnMgZGVzY3JpYmVcbiAqIGhvdyB0byBjb21wdXRlIGl0ZW1zIGZvciBlYWNoIHRhYjsgdGhlIHdpZGdldCBoYW5kbGVzIHRhYiBzd2l0Y2hpbmcgYW5kXG4gKiBsaWZlY3ljbGUgaW50ZXJuYWxseS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGFiYmVkQWN0aW9uTGlzdFNob3dPcHRpb25zPFQ+IHtcblx0LyoqIExvZ2ljYWwgdXNlciAvIHNvdXJjZSBpZGVudGlmaWVyIHBhc3NlZCB0aHJvdWdoIHRvIHtAbGluayBBY3Rpb25MaXN0fS4gKi9cblx0cmVhZG9ubHkgdXNlcjogc3RyaW5nO1xuXHQvKiogRWxlbWVudCBvciBleHBsaWNpdCBjb29yZGluYXRlcyB0aGUgcG9wdXAgaXMgYW5jaG9yZWQgdG8uICovXG5cdHJlYWRvbmx5IGFuY2hvcjogSFRNTEVsZW1lbnQgfCBJQW5jaG9yO1xuXHQvKiogT3B0aW9uYWwgY29udGV4dC12aWV3IGNvbnRhaW5lci4gRGVmYXVsdHMgdG8gdGhlIGFjdGl2ZSBsYXlvdXQgY29udGFpbmVyLiAqL1xuXHRyZWFkb25seSBjb250YWluZXI/OiBIVE1MRWxlbWVudDtcblx0LyoqIFRhYnMgcmVuZGVyZWQgaW4gb3JkZXIuICovXG5cdHJlYWRvbmx5IHRhYnM6IHJlYWRvbmx5IElUYWJEZXNjcmlwdG9yW107XG5cdC8qKiBJbml0aWFsbHkgYWN0aXZlIHRhYiBpZC4gTXVzdCBtYXRjaCBhbiBlbnRyeSBpbiB7QGxpbmsgdGFic30uICovXG5cdHJlYWRvbmx5IGluaXRpYWxUYWI6IHN0cmluZztcblx0LyoqIENvbXB1dGVzIHRoZSBsaXN0IGl0ZW1zIGFuZCBwZXItdGFiIG9wdGlvbnMgc2hvd24gd2hlbiB0aGUgZ2l2ZW4gdGFiIGlzIGFjdGl2ZS4gKi9cblx0Y3JlYXRlQWN0aW9uTGlzdChhY3RpdmVUYWI6IHN0cmluZyk6IElUYWJiZWRBY3Rpb25MaXN0QnVpbGRSZXN1bHQ8VD47XG5cdC8qKiBJdGVtIGRlbGVnYXRlIChzZWxlY3Rpb24sIGhpZGUsIGZvY3VzKS4gKi9cblx0cmVhZG9ubHkgZGVsZWdhdGU6IElBY3Rpb25MaXN0RGVsZWdhdGU8VD47XG5cdC8qKiBPcHRpb25hbCBhY2Nlc3NpYmlsaXR5IHByb3ZpZGVyIHBhc3NlZCB0byB0aGUgdW5kZXJseWluZyBsaXN0LiAqL1xuXHRyZWFkb25seSBhY2Nlc3NpYmlsaXR5UHJvdmlkZXI/OiBQYXJ0aWFsPElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPElBY3Rpb25MaXN0SXRlbTxUPj4+O1xuXHQvKiogT3B0aW9uYWwgZml4ZWQgcG9wdXAgd2lkdGguICovXG5cdHJlYWRvbmx5IHdpZHRoPzogbnVtYmVyO1xuXHQvKiogT3B0aW9uYWwgY2xhc3MgbmFtZSB0byBhZGQgdG8gdGhlIHRhYiBiYXIgZWxlbWVudCAoaW4gYWRkaXRpb24gdG8gYC50YWJiZWQtYWN0aW9uLWxpc3QtdGFiYmFyYCkuIE11c3QgYmUgYSBzaW5nbGUgY2xhc3MuICovXG5cdHJlYWRvbmx5IHRhYkJhckNsYXNzTmFtZT86IHN0cmluZztcbn1cblxuLyoqXG4gKiBBIHdpZGdldCB0aGF0IHNob3dzIGEgdGFiYmVkIGFjdGlvbiBsaXN0IGluIGEgY29udGV4dCB2aWV3IHBvcHVwXG4gKi9cbmV4cG9ydCBjbGFzcyBUYWJiZWRBY3Rpb25MaXN0V2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VUYWIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVRhYiA9IHRoaXMuX29uRGlkQ2hhbmdlVGFiLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSGlkZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEhpZGUgPSB0aGlzLl9vbkRpZEhpZGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlUG9wdXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgX3N3YXBwaW5nVGFiID0gZmFsc2U7XG5cblx0Z2V0IGlzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl9hY3RpdmVQb3B1cC52YWx1ZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQvKipcblx0ICogU2hvd3MgdGhlIHBvcHVwIGFuY2hvcmVkIHRvIHtAbGluayBJVGFiYmVkQWN0aW9uTGlzdFNob3dPcHRpb25zLmFuY2hvcn0uXG5cdCAqIElmIGEgcG9wdXAgaXMgYWxyZWFkeSB2aXNpYmxlLCBpdCBpcyByZXBsYWNlZCBpbiBwbGFjZS5cblx0ICovXG5cdHNob3c8VD4ob3B0aW9uczogSVRhYmJlZEFjdGlvbkxpc3RTaG93T3B0aW9uczxUPik6IHZvaWQge1xuXHRcdGNvbnN0IGlzU3dhcCA9IHRoaXMuaXNWaXNpYmxlO1xuXHRcdGlmIChpc1N3YXApIHtcblx0XHRcdHRoaXMuX3N3YXBwaW5nVGFiID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2FjdGl2ZVBvcHVwLnZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCBhY3RpdmVUYWIgPSBvcHRpb25zLmluaXRpYWxUYWI7XG5cdFx0Y29uc3QgcG9wdXBEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGhpZGUgPSAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fYWN0aXZlUG9wdXAudmFsdWUgPT09IHBvcHVwRGlzcG9zYWJsZXMpIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZlUG9wdXAudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIFJlc2VydmUgdGhlIGRpc3Bvc2FibGUgc2xvdCB1cC1mcm9udCBzbyBhbnkgc3luY2hyb25vdXMgaGlkZVxuXHRcdC8vIHRyaWdnZXJlZCBkdXJpbmcgcmVuZGVyIChlLmcuIGFuIGltbWVkaWF0ZSBzZWxlY3Rpb24pIGZpbmRzIHRoZVxuXHRcdC8vIGV4cGVjdGVkIGRpc3Bvc2FibGUgdG8gY2xlYXIuXG5cdFx0dGhpcy5fYWN0aXZlUG9wdXAudmFsdWUgPSBwb3B1cERpc3Bvc2FibGVzO1xuXHRcdHBvcHVwRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2UuaGlkZUNvbnRleHRWaWV3KCk7XG5cdFx0fSkpO1xuXG5cdFx0bGV0IGxpc3RSZWY6IEFjdGlvbkxpc3Q8VD4gfCB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2Uuc2hvd0NvbnRleHRWaWV3KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gb3B0aW9ucy5hbmNob3IsXG5cdFx0XHRyZW5kZXI6IChjb250YWluZXI6IEhUTUxFbGVtZW50KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlbmRlckRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRcdGNvbnN0IHdpZGdldCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLmFjdGlvbi13aWRnZXQnKSk7XG5cblx0XHRcdFx0Y29uc3QgdGFiQmFyID0gZG9tLmFwcGVuZCh3aWRnZXQsIGRvbS4kKCcudGFiYmVkLWFjdGlvbi1saXN0LXRhYmJhcicpKTtcblx0XHRcdFx0aWYgKG9wdGlvbnMudGFiQmFyQ2xhc3NOYW1lKSB7XG5cdFx0XHRcdFx0dGFiQmFyLmNsYXNzTGlzdC5hZGQob3B0aW9ucy50YWJCYXJDbGFzc05hbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJhZGlvID0gcmVuZGVyRGlzcG9zYWJsZXMuYWRkKG5ldyBSYWRpbyh7XG5cdFx0XHRcdFx0aXRlbXM6IG9wdGlvbnMudGFicy5tYXAodGFiID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gdGFiLmxhYmVsID8/IHRhYi5pZDtcblx0XHRcdFx0XHRcdGNvbnN0IHRleHQgPSB0YWIuaWNvbiA/IGAkKCR7dGFiLmljb24uaWR9KSAke2xhYmVsfWAgOiBsYWJlbDtcblx0XHRcdFx0XHRcdHJldHVybiB7IHRleHQsIHRvb2x0aXA6IHRhYi50b29sdGlwID8/IGxhYmVsLCBpc0FjdGl2ZTogdGFiLmlkID09PSBhY3RpdmVUYWIgfTtcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHR0YWJCYXIuYXBwZW5kQ2hpbGQocmFkaW8uZG9tTm9kZSk7XG5cblx0XHRcdFx0Y29uc3QgYWN0aXZhdGVUYWIgPSAobmV4dDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0aWYgKG5leHQgPT09IGFjdGl2ZVRhYikge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhY3RpdmVUYWIgPSBuZXh0O1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVGFiLmZpcmUobmV4dCk7XG5cdFx0XHRcdFx0dGhpcy5zaG93KHsgLi4ub3B0aW9ucywgaW5pdGlhbFRhYjogbmV4dCB9KTtcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRyZW5kZXJEaXNwb3NhYmxlcy5hZGQocmFkaW8ub25EaWRTZWxlY3QoaW5kZXggPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG5leHQgPSBvcHRpb25zLnRhYnNbaW5kZXhdO1xuXHRcdFx0XHRcdGlmIChuZXh0KSB7XG5cdFx0XHRcdFx0XHRhY3RpdmF0ZVRhYihuZXh0LmlkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRjb25zdCB7IGl0ZW1zLCBsaXN0T3B0aW9ucyB9ID0gb3B0aW9ucy5jcmVhdGVBY3Rpb25MaXN0KGFjdGl2ZVRhYik7XG5cdFx0XHRcdGNvbnN0IGxpc3QgPSByZW5kZXJEaXNwb3NhYmxlcy5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFx0QWN0aW9uTGlzdDxUPixcblx0XHRcdFx0XHRvcHRpb25zLnVzZXIsXG5cdFx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdFx0aXRlbXMsXG5cdFx0XHRcdFx0b3B0aW9ucy5kZWxlZ2F0ZSxcblx0XHRcdFx0XHRvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlcixcblx0XHRcdFx0XHRsaXN0T3B0aW9ucyxcblx0XHRcdFx0XHRvcHRpb25zLmFuY2hvcixcblx0XHRcdFx0KSk7XG5cdFx0XHRcdGxpc3RSZWYgPSBsaXN0O1xuXG5cdFx0XHRcdGlmIChsaXN0LmZpbHRlckNvbnRhaW5lcikge1xuXHRcdFx0XHRcdHdpZGdldC5hcHBlbmRDaGlsZChsaXN0LmZpbHRlckNvbnRhaW5lcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0d2lkZ2V0LmFwcGVuZENoaWxkKGxpc3QuZG9tTm9kZSk7XG5cblx0XHRcdFx0Y29uc3Qgd2lkdGggPSBsaXN0LmxheW91dCgwKTtcblx0XHRcdFx0d2lkZ2V0LnN0eWxlLndpZHRoID0gYCR7b3B0aW9ucy53aWR0aCA/PyB3aWR0aH1weGA7XG5cdFx0XHRcdGxpc3QuZm9jdXMoKTtcblxuXHRcdFx0XHQvLyBLZXlib2FyZCBuYXYuIEJvdW5kIHRvIHRoZSBwb3B1cCB3aWRnZXQgc28gd2UgZG9uJ3Rcblx0XHRcdFx0Ly8gb2JzZXJ2ZSB1bnJlbGF0ZWQgZG9jdW1lbnQtd2lkZSBrZXlwcmVzc2VzLlxuXHRcdFx0XHRyZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHdpZGdldCwgJ2tleWRvd24nLCBlID0+IHtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0XHRcdFx0Y29uc3Qgb25UYWJCYXIgPSAhIXRhcmdldD8uY2xvc2VzdCgnLnRhYmJlZC1hY3Rpb24tbGlzdC10YWJiYXInKTtcblx0XHRcdFx0XHRjb25zdCBvbkVkaXRhYmxlID0gISF0YXJnZXQ/LmNsb3Nlc3QoJ2lucHV0LCB0ZXh0YXJlYSwgW2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl0nKTtcblxuXHRcdFx0XHRcdGlmIChlLmtleUNvZGUgPT09IEtleUNvZGUuRXNjYXBlKSB7XG5cdFx0XHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0XHRcdGhpZGUoKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGUua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlciAmJiAhb25UYWJCYXIpIHtcblx0XHRcdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHRcdFx0bGlzdC5hY2NlcHRTZWxlY3RlZCgpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLlVwQXJyb3cgJiYgIW9uVGFiQmFyKSB7XG5cdFx0XHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0XHRcdGxpc3QuZm9jdXNQcmV2aW91cygpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLkRvd25BcnJvdyAmJiAhb25UYWJCYXIpIHtcblx0XHRcdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHRcdFx0bGlzdC5mb2N1c05leHQoKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGUua2V5Q29kZSAhPT0gS2V5Q29kZS5MZWZ0QXJyb3cgJiYgZS5rZXlDb2RlICE9PSBLZXlDb2RlLlJpZ2h0QXJyb3cpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG9uRWRpdGFibGUgJiYgIW9uVGFiQmFyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRJbmRleCA9IG9wdGlvbnMudGFicy5maW5kSW5kZXgodCA9PiB0LmlkID09PSBhY3RpdmVUYWIpO1xuXHRcdFx0XHRcdGlmIChjdXJyZW50SW5kZXggPCAwKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGRlbHRhID0gZS5rZXlDb2RlID09PSBLZXlDb2RlLlJpZ2h0QXJyb3cgPyAxIDogLTE7XG5cdFx0XHRcdFx0Y29uc3QgbmV4dEluZGV4ID0gKGN1cnJlbnRJbmRleCArIGRlbHRhICsgb3B0aW9ucy50YWJzLmxlbmd0aCkgJSBvcHRpb25zLnRhYnMubGVuZ3RoO1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdGFjdGl2YXRlVGFiKG9wdGlvbnMudGFic1tuZXh0SW5kZXhdLmlkKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIERpc21pc3Mgd2hlbiBmb2N1cyBsZWF2ZXMgdGhlIHBvcHVwLiBTdXBwcmVzc2VkIGR1cmluZyBhXG5cdFx0XHRcdC8vIHRhYiBzd2FwIHNvIHRoZSB0ZWFyZG93biBvZiB0aGUgcHJldmlvdXMgcG9wdXAgZG9lc24ndFxuXHRcdFx0XHQvLyB0YWtlIHRoZSBuZXcgb25lIGRvd24gd2l0aCBpdC5cblx0XHRcdFx0Y29uc3QgZm9jdXNUcmFja2VyID0gcmVuZGVyRGlzcG9zYWJsZXMuYWRkKGRvbS50cmFja0ZvY3VzKGNvbnRhaW5lcikpO1xuXHRcdFx0XHRyZW5kZXJEaXNwb3NhYmxlcy5hZGQoZm9jdXNUcmFja2VyLm9uRGlkQmx1cigoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3N3YXBwaW5nVGFiKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBkb20uZ2V0QWN0aXZlRWxlbWVudCgpO1xuXHRcdFx0XHRcdGlmIChhY3RpdmVFbGVtZW50ICYmIChhY3RpdmVFbGVtZW50LmNsb3Nlc3QoJy5hY3Rpb24td2lkZ2V0LWhvdmVyJykgfHwgYWN0aXZlRWxlbWVudC5jbG9zZXN0KCcuYWN0aW9uLWxpc3Qtc3VibWVudS1wYW5lbCcpKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRoaWRlKCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRyZXR1cm4gcmVuZGVyRGlzcG9zYWJsZXM7XG5cdFx0XHR9LFxuXHRcdFx0b25IaWRlOiAoKSA9PiB7XG5cdFx0XHRcdGxpc3RSZWYgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdC8vIFNraXAgY29uc3VtZXIgY2FsbGJhY2tzIGR1cmluZyBhIHRhYiBzd2FwIFx1MjAxNCB3ZSBhcmUgYWJvdXRcblx0XHRcdFx0Ly8gdG8gcmUtc2hvdyB3aXRoIHRoZSBzYW1lIGFuY2hvciwgc28gdGhlIGNvbnN1bWVyIHNob3VsZFxuXHRcdFx0XHQvLyBub3QgZS5nLiByZWZvY3VzIHRoZSB0cmlnZ2VyIGJ1dHRvbiBiZXR3ZWVuIGhpZGUgYW5kIHNob3cuXG5cdFx0XHRcdGlmICh0aGlzLl9zd2FwcGluZ1RhYikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBFeHRlcm5hbCBkaXNtaXNzYWwgKEVzY2FwZSwgY2xpY2sgb3V0c2lkZSkgXHUyMDE0IGNsZWFyIG91clxuXHRcdFx0XHQvLyBvd24gdHJhY2tlciBzbyBgaXNWaXNpYmxlYCByZWZsZWN0cyByZWFsaXR5LiBEb25lIGJlZm9yZVxuXHRcdFx0XHQvLyBmaXJpbmcgY29uc3VtZXIgY2FsbGJhY2tzIGluIGNhc2UgdGhleSByZS1zaG93LlxuXHRcdFx0XHRpZiAodGhpcy5fYWN0aXZlUG9wdXAudmFsdWUgPT09IHBvcHVwRGlzcG9zYWJsZXMpIHtcblx0XHRcdFx0XHR0aGlzLl9hY3RpdmVQb3B1cC52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRvcHRpb25zLmRlbGVnYXRlLm9uSGlkZT8uKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkSGlkZS5maXJlKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGFuY2hvclBvc2l0aW9uKCkgeyByZXR1cm4gbGlzdFJlZj8uYW5jaG9yUG9zaXRpb247IH0sXG5cdFx0fSwgb3B0aW9ucy5jb250YWluZXIsIGZhbHNlKTtcblxuXHRcdGlmIChpc1N3YXApIHtcblx0XHRcdHRoaXMuX3N3YXBwaW5nVGFiID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0aGlkZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmVQb3B1cC52YWx1ZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZlUG9wdXAudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUdyQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksaUJBQWlCLG1CQUFtQixvQkFBb0I7QUFFN0UsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQkFBNEU7QUFDckYsT0FBTztBQTZEQSxJQUFNLHlCQUFOLGNBQXFDLFdBQVc7QUFBQSxFQWV0RCxZQUN1QyxxQkFDRSx1QkFDdkM7QUFDRCxVQUFNO0FBSGdDO0FBQ0U7QUFmekMsU0FBaUIsa0JBQWtCLEtBQUssVUFBVSxJQUFJLFFBQWdCLENBQUM7QUFDdkUsU0FBUyxpQkFBaUIsS0FBSyxnQkFBZ0I7QUFFL0MsU0FBaUIsYUFBYSxLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFD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
