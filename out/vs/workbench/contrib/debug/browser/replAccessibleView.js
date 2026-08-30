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
import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewService } from "../../../../platform/accessibility/browser/accessibleView.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { getReplView } from "./repl.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Position } from "../../../../editor/common/core/position.js";
class ReplAccessibleView {
  constructor() {
    this.priority = 70;
    this.name = "debugConsole";
    this.when = ContextKeyExpr.equals("focusedView", "workbench.panel.repl.view");
    this.type = AccessibleViewType.View;
  }
  getProvider(accessor) {
    const viewsService = accessor.get(IViewsService);
    const accessibleViewService = accessor.get(IAccessibleViewService);
    const replView = getReplView(viewsService);
    if (!replView) {
      return void 0;
    }
    const focusedElement = replView.getFocusedElement();
    return new ReplOutputAccessibleViewProvider(replView, focusedElement, accessibleViewService);
  }
}
let ReplOutputAccessibleViewProvider = class extends Disposable {
  constructor(_replView, _focusedElement, _accessibleViewService) {
    super();
    this._replView = _replView;
    this._focusedElement = _focusedElement;
    this._accessibleViewService = _accessibleViewService;
    this.id = AccessibleViewProviderId.Repl;
    this._onDidChangeContent = this._register(new Emitter());
    this.onDidChangeContent = this._onDidChangeContent.event;
    this._onDidResolveChildren = this._register(new Emitter());
    this.onDidResolveChildren = this._onDidResolveChildren.event;
    this.verbositySettingKey = AccessibilityVerbositySettingId.Debug;
    this.options = {
      type: AccessibleViewType.View
    };
    this._elementPositionMap = /* @__PURE__ */ new Map();
    this._treeHadFocus = false;
    this._treeHadFocus = !!_focusedElement;
  }
  provideContent() {
    const debugSession = this._replView.getDebugSession();
    if (!debugSession) {
      return "No debug session available.";
    }
    const elements = debugSession.getReplElements();
    if (!elements.length) {
      return "No output in the debug console.";
    }
    if (!this._content) {
      this._updateContent(elements);
    }
    return this._content ?? elements.map((e) => e.toString(true)).join("\n");
  }
  onClose() {
    this._content = void 0;
    this._elementPositionMap.clear();
    if (this._treeHadFocus) {
      return this._replView.focusTree();
    }
    this._replView.getReplInput().focus();
  }
  onOpen() {
    this._register(this.onDidResolveChildren(() => {
      this._onDidChangeContent.fire();
      queueMicrotask(() => {
        if (this._focusedElement) {
          const position = this._elementPositionMap.get(this._focusedElement.getId());
          if (position) {
            this._accessibleViewService.setPosition(position, true);
          }
        }
      });
    }));
  }
  async _updateContent(elements) {
    const dataSource = this._replView.getReplDataSource();
    if (!dataSource) {
      return;
    }
    let line = 1;
    const content = [];
    for (const e of elements) {
      content.push(e.toString().replace(/\n/g, ""));
      this._elementPositionMap.set(e.getId(), new Position(line, 1));
      line++;
      if (dataSource.hasChildren(e)) {
        const childContent = [];
        const children = await dataSource.getChildren(e);
        for (const child of children) {
          const id = child.getId();
          if (!this._elementPositionMap.has(id)) {
            this._elementPositionMap.set(id, new Position(line, 1));
          }
          childContent.push("  " + child.toString());
          line++;
        }
        content.push(childContent.join("\n"));
      }
    }
    this._content = content.join("\n");
    this._onDidResolveChildren.fire();
  }
};
ReplOutputAccessibleViewProvider = __decorateClass([
  __decorateParam(2, IAccessibleViewService)
], ReplOutputAccessibleViewProvider);
export {
  ReplAccessibleView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxyZXBsQWNjZXNzaWJsZVZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQsIEFjY2Vzc2libGVWaWV3VHlwZSwgSUFjY2Vzc2libGVWaWV3Q29udGVudFByb3ZpZGVyLCBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVJlcGxFbGVtZW50IH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmxlVmlld0ltcGxlbWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgZ2V0UmVwbFZpZXcsIFJlcGwgfSBmcm9tICcuL3JlcGwuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5cbmV4cG9ydCBjbGFzcyBSZXBsQWNjZXNzaWJsZVZpZXcgaW1wbGVtZW50cyBJQWNjZXNzaWJsZVZpZXdJbXBsZW1lbnRhdGlvbiB7XG5cdHByaW9yaXR5ID0gNzA7XG5cdG5hbWUgPSAnZGVidWdDb25zb2xlJztcblx0d2hlbiA9IENvbnRleHRLZXlFeHByLmVxdWFscygnZm9jdXNlZFZpZXcnLCAnd29ya2JlbmNoLnBhbmVsLnJlcGwudmlldycpO1xuXHR0eXBlOiBBY2Nlc3NpYmxlVmlld1R5cGUgPSBBY2Nlc3NpYmxlVmlld1R5cGUuVmlldztcblx0Z2V0UHJvdmlkZXIoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3QgYWNjZXNzaWJsZVZpZXdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBY2Nlc3NpYmxlVmlld1NlcnZpY2UpO1xuXHRcdGNvbnN0IHJlcGxWaWV3ID0gZ2V0UmVwbFZpZXcodmlld3NTZXJ2aWNlKTtcblx0XHRpZiAoIXJlcGxWaWV3KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvY3VzZWRFbGVtZW50ID0gcmVwbFZpZXcuZ2V0Rm9jdXNlZEVsZW1lbnQoKTtcblx0XHRyZXR1cm4gbmV3IFJlcGxPdXRwdXRBY2Nlc3NpYmxlVmlld1Byb3ZpZGVyKHJlcGxWaWV3LCBmb2N1c2VkRWxlbWVudCwgYWNjZXNzaWJsZVZpZXdTZXJ2aWNlKTtcblx0fVxufVxuXG5jbGFzcyBSZXBsT3V0cHV0QWNjZXNzaWJsZVZpZXdQcm92aWRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWNjZXNzaWJsZVZpZXdDb250ZW50UHJvdmlkZXIge1xuXHRwdWJsaWMgcmVhZG9ubHkgaWQgPSBBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuUmVwbDtcblx0cHJpdmF0ZSBfY29udGVudDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbnRlbnQ6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGVudDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVzb2x2ZUNoaWxkcmVuOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZFJlc29sdmVDaGlsZHJlbjogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZFJlc29sdmVDaGlsZHJlbi5ldmVudDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgdmVyYm9zaXR5U2V0dGluZ0tleSA9IEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuRGVidWc7XG5cdHB1YmxpYyByZWFkb25seSBvcHRpb25zID0ge1xuXHRcdHR5cGU6IEFjY2Vzc2libGVWaWV3VHlwZS5WaWV3XG5cdH07XG5cblx0cHJpdmF0ZSBfZWxlbWVudFBvc2l0aW9uTWFwOiBNYXA8c3RyaW5nLCBQb3NpdGlvbj4gPSBuZXcgTWFwPHN0cmluZywgUG9zaXRpb24+KCk7XG5cdHByaXZhdGUgX3RyZWVIYWRGb2N1cyA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JlcGxWaWV3OiBSZXBsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2ZvY3VzZWRFbGVtZW50OiBJUmVwbEVsZW1lbnQgfCB1bmRlZmluZWQsXG5cdFx0QElBY2Nlc3NpYmxlVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJsZVZpZXdTZXJ2aWNlOiBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl90cmVlSGFkRm9jdXMgPSAhIV9mb2N1c2VkRWxlbWVudDtcblx0fVxuXHRwdWJsaWMgcHJvdmlkZUNvbnRlbnQoKTogc3RyaW5nIHtcblx0XHRjb25zdCBkZWJ1Z1Nlc3Npb24gPSB0aGlzLl9yZXBsVmlldy5nZXREZWJ1Z1Nlc3Npb24oKTtcblx0XHRpZiAoIWRlYnVnU2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuICdObyBkZWJ1ZyBzZXNzaW9uIGF2YWlsYWJsZS4nO1xuXHRcdH1cblx0XHRjb25zdCBlbGVtZW50cyA9IGRlYnVnU2Vzc2lvbi5nZXRSZXBsRWxlbWVudHMoKTtcblx0XHRpZiAoIWVsZW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuICdObyBvdXRwdXQgaW4gdGhlIGRlYnVnIGNvbnNvbGUuJztcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9jb250ZW50KSB7XG5cdFx0XHR0aGlzLl91cGRhdGVDb250ZW50KGVsZW1lbnRzKTtcblx0XHR9XG5cdFx0Ly8gQ29udGVudCBpcyBsb2FkZWQgYXN5bmNocm9ub3VzbHksIHNvIHdlIG5lZWQgdG8gY2hlY2sgaWYgaXQncyBhdmFpbGFibGUgb3IgZmFsbGJhY2sgdG8gdGhlIGVsZW1lbnRzIHRoYXQgYXJlIGFscmVhZHkgYXZhaWxhYmxlLlxuXHRcdHJldHVybiB0aGlzLl9jb250ZW50ID8/IGVsZW1lbnRzLm1hcChlID0+IGUudG9TdHJpbmcodHJ1ZSkpLmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0cHVibGljIG9uQ2xvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGVudCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9lbGVtZW50UG9zaXRpb25NYXAuY2xlYXIoKTtcblx0XHRpZiAodGhpcy5fdHJlZUhhZEZvY3VzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVwbFZpZXcuZm9jdXNUcmVlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlcGxWaWV3LmdldFJlcGxJbnB1dCgpLmZvY3VzKCk7XG5cdH1cblxuXHRwdWJsaWMgb25PcGVuKCk6IHZvaWQge1xuXHRcdC8vIENoaWxkcmVuIGFyZSByZXNvbHZlZCBhc3luYywgc28gd2UgbmVlZCB0byB1cGRhdGUgdGhlIGNvbnRlbnQgd2hlbiB0aGV5IGFyZSByZXNvbHZlZC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkUmVzb2x2ZUNoaWxkcmVuKCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudC5maXJlKCk7XG5cdFx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9mb2N1c2VkRWxlbWVudCkge1xuXHRcdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fZWxlbWVudFBvc2l0aW9uTWFwLmdldCh0aGlzLl9mb2N1c2VkRWxlbWVudC5nZXRJZCgpKTtcblx0XHRcdFx0XHRpZiAocG9zaXRpb24pIHtcblx0XHRcdFx0XHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3U2VydmljZS5zZXRQb3NpdGlvbihwb3NpdGlvbiwgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVDb250ZW50KGVsZW1lbnRzOiBJUmVwbEVsZW1lbnRbXSkge1xuXHRcdGNvbnN0IGRhdGFTb3VyY2UgPSB0aGlzLl9yZXBsVmlldy5nZXRSZXBsRGF0YVNvdXJjZSgpO1xuXHRcdGlmICghZGF0YVNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgbGluZSA9IDE7XG5cdFx0Y29uc3QgY29udGVudDogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGUgb2YgZWxlbWVudHMpIHtcblx0XHRcdGNvbnRlbnQucHVzaChlLnRvU3RyaW5nKCkucmVwbGFjZSgvXFxuL2csICcnKSk7XG5cdFx0XHR0aGlzLl9lbGVtZW50UG9zaXRpb25NYXAuc2V0KGUuZ2V0SWQoKSwgbmV3IFBvc2l0aW9uKGxpbmUsIDEpKTtcblx0XHRcdGxpbmUrKztcblx0XHRcdGlmIChkYXRhU291cmNlLmhhc0NoaWxkcmVuKGUpKSB7XG5cdFx0XHRcdGNvbnN0IGNoaWxkQ29udGVudDogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgY2hpbGRyZW4gPSBhd2FpdCBkYXRhU291cmNlLmdldENoaWxkcmVuKGUpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0Y29uc3QgaWQgPSBjaGlsZC5nZXRJZCgpO1xuXHRcdFx0XHRcdGlmICghdGhpcy5fZWxlbWVudFBvc2l0aW9uTWFwLmhhcyhpZCkpIHtcblx0XHRcdFx0XHRcdC8vIGRvbid0IG92ZXJ3cml0ZSBwYXJlbnQgcG9zaXRpb25cblx0XHRcdFx0XHRcdHRoaXMuX2VsZW1lbnRQb3NpdGlvbk1hcC5zZXQoaWQsIG5ldyBQb3NpdGlvbihsaW5lLCAxKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNoaWxkQ29udGVudC5wdXNoKCcgICcgKyBjaGlsZC50b1N0cmluZygpKTtcblx0XHRcdFx0XHRsaW5lKys7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGVudC5wdXNoKGNoaWxkQ29udGVudC5qb2luKCdcXG4nKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29udGVudCA9IGNvbnRlbnQuam9pbignXFxuJyk7XG5cdFx0dGhpcy5fb25EaWRSZXNvbHZlQ2hpbGRyZW4uZmlyZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsMEJBQTBCLG9CQUFvRCw4QkFBOEI7QUFDckgsU0FBUyx1Q0FBdUM7QUFJaEQsU0FBUyxtQkFBeUI7QUFDbEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUVsQixNQUFNLG1CQUE0RDtBQUFBLEVBQWxFO0FBQ04sb0JBQVc7QUFDWCxnQkFBTztBQUNQLGdCQUFPLGVBQWUsT0FBTyxlQUFlLDJCQUEyQjtBQUN2RSxnQkFBMkIsbUJBQW1CO0FBQUE7QUFBQSxFQUM5QyxZQUFZLFVBQTRCO0FBQ3ZDLFVBQU0sZUFBZSxTQUFTLElBQUksYUFBYTtBQUMvQyxVQUFNLHdCQUF3QixTQUFTLElBQUksc0JBQXNCO0FBQ2pFLFVBQU0sV0FBVyxZQUFZLFlBQVk7QUFDekMsUUFBSSxDQUFDLFVBQVU7QUFDZCxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0saUJBQWlCLFNBQVMsa0JBQWtCO0FBQ2xELFdBQU8sSUFBSSxpQ0FBaUMsVUFBVSxnQkFBZ0IscUJBQXFCO0FBQUEsRUFDNUY7QUFDRDtBQUVBLElBQU0sbUNBQU4sY0FBK0MsV0FBcUQ7QUFBQSxFQWdCbkcsWUFD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
