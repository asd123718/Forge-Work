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
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { MenuEntryActionViewItem, TextOnlyMenuEntryActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
let SuggestWidgetStatus = class {
  constructor(container, _menuId, options, instantiationService, _menuService, _contextKeyService) {
    this._menuId = _menuId;
    this._menuService = _menuService;
    this._contextKeyService = _contextKeyService;
    this._menuDisposables = new DisposableStore();
    this.element = dom.append(container, dom.$(".suggest-status-bar"));
    const actionViewItemProvider = ((action) => {
      if (options?.showIconsNoKeybindings) {
        return action instanceof MenuItemAction ? instantiationService.createInstance(MenuEntryActionViewItem, action, void 0) : void 0;
      } else {
        return action instanceof MenuItemAction ? instantiationService.createInstance(TextOnlyMenuEntryActionViewItem, action, { useComma: false }) : void 0;
      }
    });
    this._leftActions = new ActionBar(this.element, { actionViewItemProvider });
    this._rightActions = new ActionBar(this.element, { actionViewItemProvider });
    this._leftActions.domNode.classList.add("left");
    this._rightActions.domNode.classList.add("right");
  }
  dispose() {
    this._menuDisposables.dispose();
    this._leftActions.dispose();
    this._rightActions.dispose();
    this.element.remove();
  }
  show() {
    const menu = this._menuService.createMenu(this._menuId, this._contextKeyService);
    const renderMenu = () => {
      const left = [];
      const right = [];
      for (const [group, actions] of menu.getActions()) {
        if (group === "left") {
          left.push(...actions);
        } else {
          right.push(...actions);
        }
      }
      this._leftActions.clear();
      this._leftActions.push(left);
      this._rightActions.clear();
      this._rightActions.push(right);
    };
    this._menuDisposables.add(menu.onDidChange(() => renderMenu()));
    this._menuDisposables.add(menu);
  }
  hide() {
    this._menuDisposables.clear();
  }
};
SuggestWidgetStatus = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IContextKeyService)
], SuggestWidgetStatus);
export {
  SuggestWidgetStatus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHN1Z2dlc3RcXGJyb3dzZXJcXHN1Z2dlc3RXaWRnZXRTdGF0dXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIsIElBY3Rpb25WaWV3SXRlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtLCBUZXh0T25seU1lbnVFbnRyeUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUlkLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJU3VnZ2VzdFdpZGdldFN0YXR1c09wdGlvbnMge1xuXHQvKipcblx0ICogV2hldGhlciB0byBzaG93IGljb25zIGluc3RlYWQgb2YgdGV4dCB3aGVyZSBwb3NzaWJsZSBhbmQgYXZvaWRcblx0ICoga2V5YmluZGluZ3MgYWxsIHRvZ2V0aGVyLlxuXHQgKi9cblx0cmVhZG9ubHkgc2hvd0ljb25zTm9LZXliaW5kaW5ncz86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBTdWdnZXN0V2lkZ2V0U3RhdHVzIHtcblxuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sZWZ0QWN0aW9uczogQWN0aW9uQmFyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yaWdodEFjdGlvbnM6IEFjdGlvbkJhcjtcblx0cHJpdmF0ZSByZWFkb25seSBfbWVudURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbWVudUlkOiBNZW51SWQsXG5cdFx0b3B0aW9uczogSVN1Z2dlc3RXaWRnZXRTdGF0dXNPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgX21lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmVsZW1lbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5zdWdnZXN0LXN0YXR1cy1iYXInKSk7XG5cblx0XHRjb25zdCBhY3Rpb25WaWV3SXRlbVByb3ZpZGVyID0gPElBY3Rpb25WaWV3SXRlbVByb3ZpZGVyPihhY3Rpb24gPT4ge1xuXHRcdFx0aWYgKG9wdGlvbnM/LnNob3dJY29uc05vS2V5YmluZGluZ3MpIHtcblx0XHRcdFx0cmV0dXJuIGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uID8gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgdW5kZWZpbmVkKSA6IHVuZGVmaW5lZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbiA/IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRPbmx5TWVudUVudHJ5QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgeyB1c2VDb21tYTogZmFsc2UgfSkgOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fbGVmdEFjdGlvbnMgPSBuZXcgQWN0aW9uQmFyKHRoaXMuZWxlbWVudCwgeyBhY3Rpb25WaWV3SXRlbVByb3ZpZGVyIH0pO1xuXHRcdHRoaXMuX3JpZ2h0QWN0aW9ucyA9IG5ldyBBY3Rpb25CYXIodGhpcy5lbGVtZW50LCB7IGFjdGlvblZpZXdJdGVtUHJvdmlkZXIgfSk7XG5cblx0XHR0aGlzLl9sZWZ0QWN0aW9ucy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2xlZnQnKTtcblx0XHR0aGlzLl9yaWdodEFjdGlvbnMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdyaWdodCcpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9tZW51RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2xlZnRBY3Rpb25zLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9yaWdodEFjdGlvbnMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZWxlbWVudC5yZW1vdmUoKTtcblx0fVxuXG5cdHNob3coKTogdm9pZCB7XG5cdFx0Y29uc3QgbWVudSA9IHRoaXMuX21lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUodGhpcy5fbWVudUlkLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgcmVuZGVyTWVudSA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGxlZnQ6IElBY3Rpb25bXSA9IFtdO1xuXHRcdFx0Y29uc3QgcmlnaHQ6IElBY3Rpb25bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBbZ3JvdXAsIGFjdGlvbnNdIG9mIG1lbnUuZ2V0QWN0aW9ucygpKSB7XG5cdFx0XHRcdGlmIChncm91cCA9PT0gJ2xlZnQnKSB7XG5cdFx0XHRcdFx0bGVmdC5wdXNoKC4uLmFjdGlvbnMpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJpZ2h0LnB1c2goLi4uYWN0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX2xlZnRBY3Rpb25zLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9sZWZ0QWN0aW9ucy5wdXNoKGxlZnQpO1xuXHRcdFx0dGhpcy5fcmlnaHRBY3Rpb25zLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9yaWdodEFjdGlvbnMucHVzaChyaWdodCk7XG5cdFx0fTtcblx0XHR0aGlzLl9tZW51RGlzcG9zYWJsZXMuYWRkKG1lbnUub25EaWRDaGFuZ2UoKCkgPT4gcmVuZGVyTWVudSgpKSk7XG5cdFx0dGhpcy5fbWVudURpc3Bvc2FibGVzLmFkZChtZW51KTtcblx0fVxuXG5cdGhpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fbWVudURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsaUJBQTBDO0FBRW5ELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCLHVDQUF1QztBQUN6RSxTQUFTLGNBQXNCLHNCQUFzQjtBQUNyRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQVUvQixJQUFNLHNCQUFOLE1BQTBCO0FBQUEsRUFRaEMsWUFDQyxXQUNpQixTQUNqQixTQUN1QixzQkFDRCxjQUNNLG9CQUMzQjtBQUxnQjtBQUdLO0FBQ007QUFSN0IsU0FBaUIsbUJBQW1CLElBQUksZ0JBQWdCO0FBVXZELFNBQUssVUFBVSxJQUFJLE9BQU8sV0FBVyxJQUFJLEVBQUUscUJBQXFCLENBQUM7QUFFakUsVUFBTSwwQkFBbUQsWUFBVTtBQUNsRSxVQUFJLFNBQVMsd0JBQXdCO0FBQ3BDLGVBQU8sa0JBQWtCLGlCQUFpQixxQkFBcUIsZUFBZSx5QkFBeUIsUUFBUSxNQUFTLElBQUk7QUFBQSxNQUM3SCxPQUFPO0FBQ04sZUFBTyxrQkFBa0IsaUJBQWlCLHFCQUFxQixlQUFlLGlDQUFpQyxRQUFRLEVBQUUsVUFBVSxNQUFNLENBQUMsSUFBSTtBQUFBLE1BQy9JO0FBQUEsSUFDRDtBQUNBLFNBQUssZUFBZSxJQUFJLFVBQVUsS0FBSyxTQUFTLEVBQUUsdUJBQXVCLENBQUM7QUFDMUUsU0FBSyxnQkFBZ0IsSUFBSSxVQUFVLEtBQUssU0FBUyxFQUFFLHVCQUF1QixDQUFDO0FBRTNFLFNBQUssYUFBYSxRQUFRLFVBQVUsSUFBSSxNQUFNO0FBQzlDLFNBQUssY0FBYyxRQUFRLFVBQVUsSUFBSSxPQUFPO0FBQUEsRUFDakQ7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsU0FBSyxpQkFBaUIsUUFBUTtBQUM5QixTQUFLLGFBQWEsUUFBUTtBQUMxQixTQUFLLGNBQWMsUUFBUTtBQUMzQixTQUFLLFFBQVEsT0FBTztBQUFBLEVBQ3JCO0FBQUEsRUFFQSxPQUFhO0FBQ1osVUFBTSxPQUFPLEtBQUssYUFBYSxXQUFXLEtBQUssU0FBUyxLQUFLLGtCQUFrQjtBQUMvRSxVQUFNLGFBQWEsTUFBTTtBQUN4QixZQUFNLE9BQWtCLENBQUM7QUFDekIsWUFBTSxRQUFtQixDQUFDO0FBQzFCLGlCQUFXLENBQUMsT0FBTyxPQUFPLEtBQUssS0FBSyxXQUFXLEdBQUc7QUFDakQsWUFBSSxVQUFVLFFBQVE7QUFDckIsZUFBSyxLQUFLLEdBQUcsT0FBTztBQUFBLFFBQ3JCLE9BQU87QUFDTixnQkFBTSxLQUFLLEdBQUcsT0FBTztBQUFBLFFBQ3RCO0FBQUEsTUFDRDtBQUNBLFdBQUssYUFBYSxNQUFNO0FBQ3hCLFdBQUssYUFBYSxLQUFLLElBQUk7QUFDM0IsV0FBSyxjQUFjLE1BQU07QUFDekIsV0FBSyxjQUFjLEtBQUssS0FBSztBQUFBLElBQzlCO0FBQ0EsU0FBSyxpQkFBaUIsSUFBSSxLQUFLLFlBQVksTUFBTSxXQUFXLENBQUMsQ0FBQztBQUM5RCxTQUFLLGlCQUFpQixJQUFJLElBQUk7QUFBQSxFQUMvQjtBQUFBLEVBRUEsT0FBYTtBQUNaLFNBQUssaUJBQWlCLE1BQU07QUFBQSxFQUM3QjtBQUNEO0FBL0RhLHNCQUFOO0FBQUEsRUFZSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FkVTsiLAogICJuYW1lcyI6IFtdCn0K
