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
import * as DOM from "../../../../../base/browser/dom.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { IMenuService, MenuItemAction } from "../../../../../platform/actions/common/actions.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { CodiconActionViewItem } from "../view/cellParts/cellActionView.js";
let ListTopCellToolbar = class extends Disposable {
  constructor(notebookEditor, notebookOptions, instantiationService, contextMenuService, menuService) {
    super();
    this.notebookEditor = notebookEditor;
    this.notebookOptions = notebookOptions;
    this.instantiationService = instantiationService;
    this.contextMenuService = contextMenuService;
    this.menuService = menuService;
    this.viewZone = this._register(new MutableDisposable());
    this._modelDisposables = this._register(new DisposableStore());
    this.topCellToolbarContainer = DOM.$("div");
    this.topCellToolbar = DOM.$(".cell-list-top-cell-toolbar-container");
    this.topCellToolbarContainer.appendChild(this.topCellToolbar);
    this._register(this.notebookEditor.onDidAttachViewModel(() => {
      this.updateTopToolbar();
    }));
    this._register(this.notebookOptions.onDidChangeOptions((e) => {
      if (e.insertToolbarAlignment || e.insertToolbarPosition || e.cellToolbarLocation) {
        this.updateTopToolbar();
      }
    }));
  }
  updateTopToolbar() {
    const layoutInfo = this.notebookOptions.getLayoutConfiguration();
    this.viewZone.value = new DisposableStore();
    if (layoutInfo.insertToolbarPosition === "hidden" || layoutInfo.insertToolbarPosition === "notebookToolbar") {
      const height = this.notebookOptions.computeTopInsertToolbarHeight(this.notebookEditor.textModel?.viewType);
      if (height !== 0) {
        this.notebookEditor.changeViewZones((accessor) => {
          const id = accessor.addZone({
            afterModelPosition: 0,
            heightInPx: height,
            domNode: DOM.$("div")
          });
          accessor.layoutZone(id);
          this.viewZone.value?.add({
            dispose: () => {
              if (!this.notebookEditor.isDisposed) {
                this.notebookEditor.changeViewZones((accessor2) => {
                  accessor2.removeZone(id);
                });
              }
            }
          });
        });
      }
      return;
    }
    this.notebookEditor.changeViewZones((accessor) => {
      const height = this.notebookOptions.computeTopInsertToolbarHeight(this.notebookEditor.textModel?.viewType);
      const id = accessor.addZone({
        afterModelPosition: 0,
        heightInPx: height,
        domNode: this.topCellToolbarContainer
      });
      accessor.layoutZone(id);
      this.viewZone.value?.add({
        dispose: () => {
          if (!this.notebookEditor.isDisposed) {
            this.notebookEditor.changeViewZones((accessor2) => {
              accessor2.removeZone(id);
            });
          }
        }
      });
      DOM.clearNode(this.topCellToolbar);
      const toolbar = this.instantiationService.createInstance(MenuWorkbenchToolBar, this.topCellToolbar, this.notebookEditor.creationOptions.menuIds.cellTopInsertToolbar, {
        actionViewItemProvider: (action, options) => {
          if (action instanceof MenuItemAction) {
            const item = this.instantiationService.createInstance(CodiconActionViewItem, action, { hoverDelegate: options.hoverDelegate });
            return item;
          }
          return void 0;
        },
        menuOptions: {
          shouldForwardArgs: true
        },
        toolbarOptions: {
          primaryGroup: (g) => /^inline/.test(g)
        },
        hiddenItemStrategy: HiddenItemStrategy.Ignore
      });
      if (this.notebookEditor.hasModel()) {
        toolbar.context = {
          notebookEditor: this.notebookEditor
        };
      }
      this.viewZone.value?.add(toolbar);
      this.viewZone.value?.add(this.notebookEditor.onDidChangeModel(() => {
        this._modelDisposables.clear();
        if (this.notebookEditor.hasModel()) {
          this._modelDisposables.add(this.notebookEditor.onDidChangeViewCells(() => {
            this.updateClass();
          }));
          this.updateClass();
        }
      }));
      this.updateClass();
    });
  }
  updateClass() {
    if (this.notebookEditor.hasModel() && this.notebookEditor.getLength() === 0) {
      this.topCellToolbar.classList.add("emptyNotebook");
    } else {
      this.topCellToolbar.classList.remove("emptyNotebook");
    }
  }
};
ListTopCellToolbar = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IMenuService)
], ListTopCellToolbar);
export {
  ListTopCellToolbar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3UGFydHNcXG5vdGVib29rVG9wQ2VsbFRvb2xiYXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEhpZGRlbkl0ZW1TdHJhdGVneSwgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0FjdGlvbkNvbnRleHQgfSBmcm9tICcuLi9jb250cm9sbGVyL2NvcmVBY3Rpb25zLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvckRlbGVnYXRlIH0gZnJvbSAnLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IE5vdGVib29rT3B0aW9ucyB9IGZyb20gJy4uL25vdGVib29rT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi92aWV3L2NlbGxQYXJ0cy9jZWxsQWN0aW9uVmlldy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBMaXN0VG9wQ2VsbFRvb2xiYXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSB0b3BDZWxsVG9vbGJhckNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdG9wQ2VsbFRvb2xiYXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IHZpZXdab25lOiBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rT3B0aW9uczogTm90ZWJvb2tPcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnRvcENlbGxUb29sYmFyQ29udGFpbmVyID0gRE9NLiQoJ2RpdicpO1xuXHRcdHRoaXMudG9wQ2VsbFRvb2xiYXIgPSBET00uJCgnLmNlbGwtbGlzdC10b3AtY2VsbC10b29sYmFyLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMudG9wQ2VsbFRvb2xiYXJDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy50b3BDZWxsVG9vbGJhcik7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm5vdGVib29rRWRpdG9yLm9uRGlkQXR0YWNoVmlld01vZGVsKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlVG9wVG9vbGJhcigpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubm90ZWJvb2tPcHRpb25zLm9uRGlkQ2hhbmdlT3B0aW9ucyhlID0+IHtcblx0XHRcdGlmIChlLmluc2VydFRvb2xiYXJBbGlnbm1lbnQgfHwgZS5pbnNlcnRUb29sYmFyUG9zaXRpb24gfHwgZS5jZWxsVG9vbGJhckxvY2F0aW9uKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlVG9wVG9vbGJhcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVG9wVG9vbGJhcigpIHtcblx0XHRjb25zdCBsYXlvdXRJbmZvID0gdGhpcy5ub3RlYm9va09wdGlvbnMuZ2V0TGF5b3V0Q29uZmlndXJhdGlvbigpO1xuXHRcdHRoaXMudmlld1pvbmUudmFsdWUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRpZiAobGF5b3V0SW5mby5pbnNlcnRUb29sYmFyUG9zaXRpb24gPT09ICdoaWRkZW4nIHx8IGxheW91dEluZm8uaW5zZXJ0VG9vbGJhclBvc2l0aW9uID09PSAnbm90ZWJvb2tUb29sYmFyJykge1xuXHRcdFx0Y29uc3QgaGVpZ2h0ID0gdGhpcy5ub3RlYm9va09wdGlvbnMuY29tcHV0ZVRvcEluc2VydFRvb2xiYXJIZWlnaHQodGhpcy5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWw/LnZpZXdUeXBlKTtcblxuXHRcdFx0aWYgKGhlaWdodCAhPT0gMCkge1xuXHRcdFx0XHQvLyByZXNlcnZlIHdoaXRlc3BhY2UgdG8gYXZvaWQgb3ZlcmxhcCB3aXRoIGNlbGwgdG9vbGJhclxuXHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmNoYW5nZVZpZXdab25lcyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgaWQgPSBhY2Nlc3Nvci5hZGRab25lKHtcblx0XHRcdFx0XHRcdGFmdGVyTW9kZWxQb3NpdGlvbjogMCxcblx0XHRcdFx0XHRcdGhlaWdodEluUHg6IGhlaWdodCxcblx0XHRcdFx0XHRcdGRvbU5vZGU6IERPTS4kKCdkaXYnKVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGFjY2Vzc29yLmxheW91dFpvbmUoaWQpO1xuXHRcdFx0XHRcdHRoaXMudmlld1pvbmUudmFsdWU/LmFkZCh7XG5cdFx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmICghdGhpcy5ub3RlYm9va0VkaXRvci5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0YWNjZXNzb3IucmVtb3ZlWm9uZShpZCk7XG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cblx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmNoYW5nZVZpZXdab25lcyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCBoZWlnaHQgPSB0aGlzLm5vdGVib29rT3B0aW9ucy5jb21wdXRlVG9wSW5zZXJ0VG9vbGJhckhlaWdodCh0aGlzLm5vdGVib29rRWRpdG9yLnRleHRNb2RlbD8udmlld1R5cGUpO1xuXHRcdFx0Y29uc3QgaWQgPSBhY2Nlc3Nvci5hZGRab25lKHtcblx0XHRcdFx0YWZ0ZXJNb2RlbFBvc2l0aW9uOiAwLFxuXHRcdFx0XHRoZWlnaHRJblB4OiBoZWlnaHQsXG5cdFx0XHRcdGRvbU5vZGU6IHRoaXMudG9wQ2VsbFRvb2xiYXJDb250YWluZXJcblx0XHRcdH0pO1xuXHRcdFx0YWNjZXNzb3IubGF5b3V0Wm9uZShpZCk7XG5cblx0XHRcdHRoaXMudmlld1pvbmUudmFsdWU/LmFkZCh7XG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRpZiAoIXRoaXMubm90ZWJvb2tFZGl0b3IuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVab25lKGlkKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdERPTS5jbGVhck5vZGUodGhpcy50b3BDZWxsVG9vbGJhcik7XG5cblx0XHRcdGNvbnN0IHRvb2xiYXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB0aGlzLnRvcENlbGxUb29sYmFyLCB0aGlzLm5vdGVib29rRWRpdG9yLmNyZWF0aW9uT3B0aW9ucy5tZW51SWRzLmNlbGxUb3BJbnNlcnRUb29sYmFyLCB7XG5cdFx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGljb25BY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB7IGhvdmVyRGVsZWdhdGU6IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSB9KTtcblx0XHRcdFx0XHRcdHJldHVybiBpdGVtO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1lbnVPcHRpb25zOiB7XG5cdFx0XHRcdFx0c2hvdWxkRm9yd2FyZEFyZ3M6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0dG9vbGJhck9wdGlvbnM6IHtcblx0XHRcdFx0XHRwcmltYXJ5R3JvdXA6IChnOiBzdHJpbmcpID0+IC9eaW5saW5lLy50ZXN0KGcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5JZ25vcmUsXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHRoaXMubm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHR0b29sYmFyLmNvbnRleHQgPSB7XG5cdFx0XHRcdFx0bm90ZWJvb2tFZGl0b3I6IHRoaXMubm90ZWJvb2tFZGl0b3Jcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSU5vdGVib29rQWN0aW9uQ29udGV4dDtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy52aWV3Wm9uZS52YWx1ZT8uYWRkKHRvb2xiYXIpO1xuXG5cdFx0XHQvLyB1cGRhdGUgdG9vbGJhciBjb250YWluZXIgY3NzIGJhc2VkIG9uIGNlbGwgbGlzdCBsZW5ndGhcblx0XHRcdHRoaXMudmlld1pvbmUudmFsdWU/LmFkZCh0aGlzLm5vdGVib29rRWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9tb2RlbERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRcdFx0aWYgKHRoaXMubm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRcdHRoaXMuX21vZGVsRGlzcG9zYWJsZXMuYWRkKHRoaXMubm90ZWJvb2tFZGl0b3Iub25EaWRDaGFuZ2VWaWV3Q2VsbHMoKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVDbGFzcygpO1xuXHRcdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRcdHRoaXMudXBkYXRlQ2xhc3MoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLnVwZGF0ZUNsYXNzKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNsYXNzKCkge1xuXHRcdGlmICh0aGlzLm5vdGVib29rRWRpdG9yLmhhc01vZGVsKCkgJiYgdGhpcy5ub3RlYm9va0VkaXRvci5nZXRMZW5ndGgoKSA9PT0gMCkge1xuXHRcdFx0dGhpcy50b3BDZWxsVG9vbGJhci5jbGFzc0xpc3QuYWRkKCdlbXB0eU5vdGVib29rJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudG9wQ2VsbFRvb2xiYXIuY2xhc3NMaXN0LnJlbW92ZSgnZW1wdHlOb3RlYm9vaycpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxZQUFZLGlCQUFpQix5QkFBeUI7QUFDL0QsU0FBUyxvQkFBb0IsNEJBQTRCO0FBQ3pELFNBQVMsY0FBYyxzQkFBc0I7QUFDN0MsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFJdEMsU0FBUyw2QkFBNkI7QUFFL0IsSUFB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
