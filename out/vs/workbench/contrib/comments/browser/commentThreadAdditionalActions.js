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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../base/common/marshallingIds.js";
import { CommentFormActions } from "./commentFormActions.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
let CommentThreadAdditionalActions = class extends Disposable {
  constructor(container, _commentThread, _contextKeyService, _commentMenus, _actionRunDelegate, _keybindingService, _contextMenuService) {
    super();
    this._commentThread = _commentThread;
    this._contextKeyService = _contextKeyService;
    this._commentMenus = _commentMenus;
    this._actionRunDelegate = _actionRunDelegate;
    this._keybindingService = _keybindingService;
    this._contextMenuService = _contextMenuService;
    this._container = dom.append(container, dom.$(".comment-additional-actions"));
    dom.append(this._container, dom.$(".section-separator"));
    this._buttonBar = dom.append(this._container, dom.$(".button-bar"));
    this._createAdditionalActions(this._buttonBar);
  }
  _showMenu() {
    this._container?.classList.remove("hidden");
  }
  _hideMenu() {
    this._container?.classList.add("hidden");
  }
  _enableDisableMenu(menu) {
    const groups = menu.getActions({ shouldForwardArgs: true });
    for (const group of groups) {
      const [, actions] = group;
      for (const action of actions) {
        if (action.enabled) {
          this._showMenu();
          return;
        }
        for (const subAction of action.actions ?? []) {
          if (subAction.enabled) {
            this._showMenu();
            return;
          }
        }
      }
    }
    this._hideMenu();
  }
  _createAdditionalActions(container) {
    const menu = this._commentMenus.getCommentThreadAdditionalActions(this._contextKeyService);
    this._register(menu);
    this._register(menu.onDidChange(() => {
      this._commentFormActions.setActions(
        menu,
        /*hasOnlySecondaryActions*/
        true
      );
      this._enableDisableMenu(menu);
    }));
    this._commentFormActions = new CommentFormActions(this._keybindingService, this._contextKeyService, this._contextMenuService, container, async (action) => {
      this._actionRunDelegate?.();
      action.run({
        thread: this._commentThread,
        $mid: MarshalledId.CommentThreadInstance
      });
    }, 4, true);
    this._register(this._commentFormActions);
    this._commentFormActions.setActions(
      menu,
      /*hasOnlySecondaryActions*/
      true
    );
    this._enableDisableMenu(menu);
  }
};
CommentThreadAdditionalActions = __decorateClass([
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, IContextMenuService)
], CommentThreadAdditionalActions);
export {
  CommentThreadAdditionalActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvbW1lbnRzXFxicm93c2VyXFxjb21tZW50VGhyZWFkQWRkaXRpb25hbEFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5cbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElNZW51LCBTdWJtZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0ICogYXMgbGFuZ3VhZ2VzIGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ29tbWVudEZvcm1BY3Rpb25zIH0gZnJvbSAnLi9jb21tZW50Rm9ybUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWVudE1lbnVzIH0gZnJvbSAnLi9jb21tZW50TWVudXMuanMnO1xuaW1wb3J0IHsgSUNlbGxSYW5nZSB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va1JhbmdlLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuXG5leHBvcnQgY2xhc3MgQ29tbWVudFRocmVhZEFkZGl0aW9uYWxBY3Rpb25zPFQgZXh0ZW5kcyBJUmFuZ2UgfCBJQ2VsbFJhbmdlPiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9jb250YWluZXI6IEhUTUxFbGVtZW50IHwgbnVsbDtcblx0cHJpdmF0ZSBfYnV0dG9uQmFyOiBIVE1MRWxlbWVudCB8IG51bGw7XG5cdHByaXZhdGUgX2NvbW1lbnRGb3JtQWN0aW9ucyE6IENvbW1lbnRGb3JtQWN0aW9ucztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgX2NvbW1lbnRUaHJlYWQ6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkPFQ+LFxuXHRcdHByaXZhdGUgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBfY29tbWVudE1lbnVzOiBDb21tZW50TWVudXMsXG5cdFx0cHJpdmF0ZSBfYWN0aW9uUnVuRGVsZWdhdGU6ICgoKSA9PiB2b2lkKSB8IG51bGwsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2NvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLmNvbW1lbnQtYWRkaXRpb25hbC1hY3Rpb25zJykpO1xuXHRcdGRvbS5hcHBlbmQodGhpcy5fY29udGFpbmVyLCBkb20uJCgnLnNlY3Rpb24tc2VwYXJhdG9yJykpO1xuXG5cdFx0dGhpcy5fYnV0dG9uQmFyID0gZG9tLmFwcGVuZCh0aGlzLl9jb250YWluZXIsIGRvbS4kKCcuYnV0dG9uLWJhcicpKTtcblx0XHR0aGlzLl9jcmVhdGVBZGRpdGlvbmFsQWN0aW9ucyh0aGlzLl9idXR0b25CYXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd01lbnUoKSB7XG5cdFx0dGhpcy5fY29udGFpbmVyPy5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcblx0fVxuXG5cdHByaXZhdGUgX2hpZGVNZW51KCkge1xuXHRcdHRoaXMuX2NvbnRhaW5lcj8uY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdH1cblxuXHRwcml2YXRlIF9lbmFibGVEaXNhYmxlTWVudShtZW51OiBJTWVudSkge1xuXHRcdGNvbnN0IGdyb3VwcyA9IG1lbnUuZ2V0QWN0aW9ucyh7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pO1xuXG5cdFx0Ly8gU2hvdyB0aGUgbWVudSBpZiBhdCBsZWFzdCBvbmUgYWN0aW9uIGlzIGVuYWJsZWQuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcblx0XHRcdGNvbnN0IFssIGFjdGlvbnNdID0gZ3JvdXA7XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG5cdFx0XHRcdGlmIChhY3Rpb24uZW5hYmxlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3Nob3dNZW51KCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yIChjb25zdCBzdWJBY3Rpb24gb2YgKGFjdGlvbiBhcyBTdWJtZW51SXRlbUFjdGlvbikuYWN0aW9ucyA/PyBbXSkge1xuXHRcdFx0XHRcdGlmIChzdWJBY3Rpb24uZW5hYmxlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2hvd01lbnUoKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9oaWRlTWVudSgpO1xuXHR9XG5cblxuXHRwcml2YXRlIF9jcmVhdGVBZGRpdGlvbmFsQWN0aW9ucyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0Y29uc3QgbWVudSA9IHRoaXMuX2NvbW1lbnRNZW51cy5nZXRDb21tZW50VGhyZWFkQWRkaXRpb25hbEFjdGlvbnModGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG1lbnUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG1lbnUub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29tbWVudEZvcm1BY3Rpb25zLnNldEFjdGlvbnMobWVudSwgLypoYXNPbmx5U2Vjb25kYXJ5QWN0aW9ucyovIHRydWUpO1xuXHRcdFx0dGhpcy5fZW5hYmxlRGlzYWJsZU1lbnUobWVudSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fY29tbWVudEZvcm1BY3Rpb25zID0gbmV3IENvbW1lbnRGb3JtQWN0aW9ucyh0aGlzLl9rZXliaW5kaW5nU2VydmljZSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsIHRoaXMuX2NvbnRleHRNZW51U2VydmljZSwgY29udGFpbmVyLCBhc3luYyAoYWN0aW9uOiBJQWN0aW9uKSA9PiB7XG5cdFx0XHR0aGlzLl9hY3Rpb25SdW5EZWxlZ2F0ZT8uKCk7XG5cblx0XHRcdGFjdGlvbi5ydW4oe1xuXHRcdFx0XHR0aHJlYWQ6IHRoaXMuX2NvbW1lbnRUaHJlYWQsXG5cdFx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5Db21tZW50VGhyZWFkSW5zdGFuY2Vcblx0XHRcdH0pO1xuXHRcdH0sIDQsIHRydWUpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29tbWVudEZvcm1BY3Rpb25zKTtcblx0XHR0aGlzLl9jb21tZW50Rm9ybUFjdGlvbnMuc2V0QWN0aW9ucyhtZW51LCAvKmhhc09ubHlTZWNvbmRhcnlBY3Rpb25zKi8gdHJ1ZSk7XG5cdFx0dGhpcy5fZW5hYmxlRGlzYWJsZU1lbnUobWVudSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBSXJCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsb0JBQW9CO0FBSTdCLFNBQVMsMEJBQTBCO0FBR25DLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBRTdCLElBQU0saUNBQU4sY0FBNEUsV0FBVztBQUFBLEVBSzdGLFlBQ0MsV0FDUSxnQkFDQSxvQkFDQSxlQUNBLG9CQUNvQixvQkFDQyxxQkFDNUI7QUFDRCxVQUFNO0FBUEU7QUFDQTtBQUNBO0FBQ0E7QUFDb0I7QUFDQztBQUk3QixTQUFLLGFBQWEsSUFBSSxPQUFPLFdBQVcsSUFBSSxFQUFFLDZCQUE2QixDQUFDO0FBQzVFLFFBQUksT0FBTyxLQUFLLFlBQVksSUFBSSxFQUFFLG9CQUFvQixDQUFDO0FBRXZELFNBQUssYUFBYSxJQUFJLE9BQU8sS0FBSyxZQUFZLElBQUksRUFBRSxhQUFhLENBQUM7QUFDbEUsU0FBSyx5QkFBeUIsS0FBSyxVQUFVO0FBQUEsRUFDOUM7QUFBQSxFQUVRLFlBQVk7QUFDbkIsU0FBSyxZQUFZLFVBQVUsT0FBTyxRQUFRO0FBQUEsRUFDM0M7QUFBQSxFQUVRLFlBQVk7QUFDbkIsU0FBSyxZQUFZLFVBQVUsSUFBSSxRQUFRO0FBQUEsRUFDeEM7QUFBQSxFQUVRLG1CQUFtQixNQUFhO0FBQ3ZDLFVBQU0sU0FBUyxLQUFLLFdBQVcsRUFBRSxtQkFBbUIsS0FBSyxDQUFDO0FBRzFELGVBQVcsU0FBUyxRQUFRO0FBQzNCLFlBQU0sQ0FBQyxFQUFFLE9BQU8sSUFBSTtBQUNwQixpQkFBVyxVQUFVLFNBQVM7QUFDN0IsWUFBSSxPQUFPLFNBQVM7QUFDbkIsZUFBSyxVQUFVO0FBQ2Y7QUFBQSxRQUNEO0FBRUEsbUJBQVcsYUFBYyxPQUE2QixXQUFXLENBQUMsR0FBRztBQUNwRSxjQUFJLFVBQVUsU0FBUztBQUN0QixpQkFBSyxVQUFVO0FBQ2Y7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsU0FBSyxVQUFVO0FBQUEsRUFDaEI7QUFBQSxFQUdRLHlCQUF5QixXQUF3QjtBQUN4RCxVQUFNLE9BQU8sS0FBSyxjQUFjLGtDQUFrQyxLQUFLLGtCQUFrQjtBQUN6RixTQUFLLFVBQVUsSUFBSTtBQUNuQixTQUFLLFVBQVUsS0FBSyxZQUFZLE1BQU07QUFDckMsV0FBSyxvQkFBb0I7QUFBQSxRQUFXO0FBQUE7QUFBQSxRQUFrQztBQUFBLE1BQUk7QUFDMUUsV0FBSyxtQkFBbUIsSUFBSTtBQUFBLElBQzdCLENBQUMsQ0FBQztBQUVGLFNBQUssc0JBQXNCLElBQUksbUJBQW1CLEtBQUssb0JBQW9CLEtBQUssb0JBQW9CLEtBQUsscUJBQXFCLFdBQVcsT0FBTyxXQUFvQjtBQUNuSyxXQUFLLHFCQUFxQjtBQUUxQixhQUFPLElBQUk7QUFBQSxRQUNWLFFBQVEsS0FBSztBQUFBLFFBQ2IsTUFBTSxhQUFhO0FBQUEsTUFDcEIsQ0FBQztBQUFBLElBQ0YsR0FBRyxHQUFHLElBQUk7QUFFVixTQUFLLFVBQVUsS0FBSyxtQkFBbUI7QUFDdkMsU0FBSyxvQkFBb0I7QUFBQSxNQUFXO0FBQUE7QUFBQSxNQUFrQztBQUFBLElBQUk7QUFDMUUsU0FBSyxtQkFBbUIsSUFBSTtBQUFBLEVBQzdCO0FBQ0Q7QUE3RWEsaUNBQU47QUFBQSxFQVdKO0FBQUEsRUFDQTtBQUFBLEdBWlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
