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
import { ActionViewItem } from "../../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { MenuWorkbenchToolBar, HiddenItemStrategy } from "../../../../../../platform/actions/browser/toolbar.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { CellEditState } from "../../../../notebook/browser/notebookBrowser.js";
import { CellKind } from "../../../../notebook/common/notebookCommon.js";
let OverlayToolbarDecorator = class extends Disposable {
  constructor(notebookEditor, notebookModel, instantiationService, accessibilitySignalService) {
    super();
    this.notebookEditor = notebookEditor;
    this.notebookModel = notebookModel;
    this.instantiationService = instantiationService;
    this.accessibilitySignalService = accessibilitySignalService;
    this._timeout = void 0;
    this.overlayDisposables = this._register(new DisposableStore());
  }
  decorate(changes) {
    if (this._timeout !== void 0) {
      clearTimeout(this._timeout);
    }
    this._timeout = setTimeout(() => {
      this._timeout = void 0;
      this.createMarkdownPreviewToolbars(changes);
    }, 100);
  }
  createMarkdownPreviewToolbars(changes) {
    this.overlayDisposables.clear();
    const accessibilitySignalService = this.accessibilitySignalService;
    const editor = this.notebookEditor;
    for (const change of changes) {
      const cellViewModel = this.getCellViewModel(change);
      if (!cellViewModel || cellViewModel.cellKind !== CellKind.Markup) {
        continue;
      }
      const toolbarContainer = document.createElement("div");
      let overlayId = void 0;
      editor.changeCellOverlays((accessor) => {
        toolbarContainer.style.right = "44px";
        overlayId = accessor.addOverlay({
          cell: cellViewModel,
          domNode: toolbarContainer
        });
      });
      const removeOverlay = () => {
        editor.changeCellOverlays((accessor) => {
          if (overlayId) {
            accessor.removeOverlay(overlayId);
          }
        });
      };
      this.overlayDisposables.add({ dispose: removeOverlay });
      const toolbar = document.createElement("div");
      toolbarContainer.appendChild(toolbar);
      toolbar.className = "chat-diff-change-content-widget";
      toolbar.classList.add("hover");
      toolbar.style.position = "relative";
      toolbar.style.top = "18px";
      toolbar.style.zIndex = "10";
      toolbar.style.display = cellViewModel.getEditState() === CellEditState.Editing ? "none" : "block";
      this.overlayDisposables.add(cellViewModel.onDidChangeState((e) => {
        if (e.editStateChanged) {
          if (cellViewModel.getEditState() === CellEditState.Editing) {
            toolbar.style.display = "none";
          } else {
            toolbar.style.display = "block";
          }
        }
      }));
      const scopedInstaService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.notebookEditor.scopedContextKeyService])));
      const toolbarWidget = scopedInstaService.createInstance(MenuWorkbenchToolBar, toolbar, MenuId.ChatEditingEditorHunk, {
        telemetrySource: "chatEditingNotebookHunk",
        hiddenItemStrategy: HiddenItemStrategy.NoHide,
        toolbarOptions: { primaryGroup: () => true },
        menuOptions: {
          renderShortTitle: true,
          arg: {
            async accept() {
              accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
              removeOverlay();
              toolbarWidget.dispose();
              for (const singleChange of change.diff.get().changes) {
                await change.keep(singleChange);
              }
              return true;
            },
            async reject() {
              accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
              removeOverlay();
              toolbarWidget.dispose();
              for (const singleChange of change.diff.get().changes) {
                await change.undo(singleChange);
              }
              return true;
            }
          }
        },
        actionViewItemProvider: (action, options) => {
          if (!action.class) {
            return new class extends ActionViewItem {
              constructor() {
                super(void 0, action, { ...options, keybindingNotRenderedWithLabel: true, icon: false, label: true });
              }
            }();
          }
          return void 0;
        }
      });
      this.overlayDisposables.add(toolbarWidget);
    }
  }
  getCellViewModel(change) {
    if (change.type === "delete" || change.modifiedCellIndex === void 0) {
      return void 0;
    }
    const cell = this.notebookModel.cells[change.modifiedCellIndex];
    const cellViewModel = this.notebookEditor.getViewModel()?.viewCells.find((c) => c.handle === cell.handle);
    return cellViewModel;
  }
  dispose() {
    super.dispose();
    if (this._timeout !== void 0) {
      clearTimeout(this._timeout);
    }
  }
};
OverlayToolbarDecorator = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IAccessibilitySignalService)
], OverlayToolbarDecorator);
export {
  OverlayToolbarDecorator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxub3RlYm9va1xcb3ZlcmxheVRvb2xiYXJEZWNvcmF0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWVudVdvcmtiZW5jaFRvb2xCYXIsIEhpZGRlbkl0ZW1TdHJhdGVneSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRTdGF0ZSwgSU5vdGVib29rRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbW9kZWwvbm90ZWJvb2tUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU1vZGlmaWVkRmlsZUVudHJ5Q2hhbmdlSHVuayB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2VsbERpZmZJbmZvIH0gZnJvbSAnLi9ub3RlYm9va0NlbGxDaGFuZ2VzLmpzJztcblxuXG5leHBvcnQgY2xhc3MgT3ZlcmxheVRvb2xiYXJEZWNvcmF0b3IgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF90aW1lb3V0OiBUaW1lb3V0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IG92ZXJsYXlEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tNb2RlbDogTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRkZWNvcmF0ZShjaGFuZ2VzOiBJQ2VsbERpZmZJbmZvW10pIHtcblx0XHRpZiAodGhpcy5fdGltZW91dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fdGltZW91dCk7XG5cdFx0fVxuXHRcdHRoaXMuX3RpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX3RpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmNyZWF0ZU1hcmtkb3duUHJldmlld1Rvb2xiYXJzKGNoYW5nZXMpO1xuXHRcdH0sIDEwMCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU1hcmtkb3duUHJldmlld1Rvb2xiYXJzKGNoYW5nZXM6IElDZWxsRGlmZkluZm9bXSkge1xuXHRcdHRoaXMub3ZlcmxheURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSA9IHRoaXMuYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U7XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5ub3RlYm9va0VkaXRvcjtcblx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBjaGFuZ2VzKSB7XG5cdFx0XHRjb25zdCBjZWxsVmlld01vZGVsID0gdGhpcy5nZXRDZWxsVmlld01vZGVsKGNoYW5nZSk7XG5cblx0XHRcdGlmICghY2VsbFZpZXdNb2RlbCB8fCBjZWxsVmlld01vZGVsLmNlbGxLaW5kICE9PSBDZWxsS2luZC5NYXJrdXApIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0b29sYmFyQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0XHRcdGxldCBvdmVybGF5SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGVkaXRvci5jaGFuZ2VDZWxsT3ZlcmxheXMoKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdHRvb2xiYXJDb250YWluZXIuc3R5bGUucmlnaHQgPSAnNDRweCc7XG5cdFx0XHRcdG92ZXJsYXlJZCA9IGFjY2Vzc29yLmFkZE92ZXJsYXkoe1xuXHRcdFx0XHRcdGNlbGw6IGNlbGxWaWV3TW9kZWwsXG5cdFx0XHRcdFx0ZG9tTm9kZTogdG9vbGJhckNvbnRhaW5lcixcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVtb3ZlT3ZlcmxheSA9ICgpID0+IHtcblx0XHRcdFx0ZWRpdG9yLmNoYW5nZUNlbGxPdmVybGF5cyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdFx0aWYgKG92ZXJsYXlJZCkge1xuXHRcdFx0XHRcdFx0YWNjZXNzb3IucmVtb3ZlT3ZlcmxheShvdmVybGF5SWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLm92ZXJsYXlEaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiByZW1vdmVPdmVybGF5IH0pO1xuXG5cdFx0XHRjb25zdCB0b29sYmFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHR0b29sYmFyQ29udGFpbmVyLmFwcGVuZENoaWxkKHRvb2xiYXIpO1xuXHRcdFx0dG9vbGJhci5jbGFzc05hbWUgPSAnY2hhdC1kaWZmLWNoYW5nZS1jb250ZW50LXdpZGdldCc7XG5cdFx0XHR0b29sYmFyLmNsYXNzTGlzdC5hZGQoJ2hvdmVyJyk7IC8vIFNob3cgYnkgZGVmYXVsdFxuXHRcdFx0dG9vbGJhci5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cdFx0XHR0b29sYmFyLnN0eWxlLnRvcCA9ICcxOHB4Jztcblx0XHRcdHRvb2xiYXIuc3R5bGUuekluZGV4ID0gJzEwJztcblx0XHRcdHRvb2xiYXIuc3R5bGUuZGlzcGxheSA9IGNlbGxWaWV3TW9kZWwuZ2V0RWRpdFN0YXRlKCkgPT09IENlbGxFZGl0U3RhdGUuRWRpdGluZyA/ICdub25lJyA6ICdibG9jayc7XG5cblx0XHRcdHRoaXMub3ZlcmxheURpc3Bvc2FibGVzLmFkZChjZWxsVmlld01vZGVsLm9uRGlkQ2hhbmdlU3RhdGUoKGUpID0+IHtcblx0XHRcdFx0aWYgKGUuZWRpdFN0YXRlQ2hhbmdlZCkge1xuXHRcdFx0XHRcdGlmIChjZWxsVmlld01vZGVsLmdldEVkaXRTdGF0ZSgpID09PSBDZWxsRWRpdFN0YXRlLkVkaXRpbmcpIHtcblx0XHRcdFx0XHRcdHRvb2xiYXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dG9vbGJhci5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3Qgc2NvcGVkSW5zdGFTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5ub3RlYm9va0VkaXRvci5zY29wZWRDb250ZXh0S2V5U2VydmljZV0pKSk7XG5cdFx0XHRjb25zdCB0b29sYmFyV2lkZ2V0ID0gc2NvcGVkSW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB0b29sYmFyLCBNZW51SWQuQ2hhdEVkaXRpbmdFZGl0b3JIdW5rLCB7XG5cdFx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ2NoYXRFZGl0aW5nTm90ZWJvb2tIdW5rJyxcblx0XHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdFx0XHR0b29sYmFyT3B0aW9uczogeyBwcmltYXJ5R3JvdXA6ICgpID0+IHRydWUgfSxcblx0XHRcdFx0bWVudU9wdGlvbnM6IHtcblx0XHRcdFx0XHRyZW5kZXJTaG9ydFRpdGxlOiB0cnVlLFxuXHRcdFx0XHRcdGFyZzoge1xuXHRcdFx0XHRcdFx0YXN5bmMgYWNjZXB0KCkge1xuXHRcdFx0XHRcdFx0XHRhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwuZWRpdHNLZXB0LCB7IGFsbG93TWFueUluUGFyYWxsZWw6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHRcdHJlbW92ZU92ZXJsYXkoKTtcblx0XHRcdFx0XHRcdFx0dG9vbGJhcldpZGdldC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3Qgc2luZ2xlQ2hhbmdlIG9mIGNoYW5nZS5kaWZmLmdldCgpLmNoYW5nZXMpIHtcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCBjaGFuZ2Uua2VlcChzaW5nbGVDaGFuZ2UpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGFzeW5jIHJlamVjdCgpIHtcblx0XHRcdFx0XHRcdFx0YWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmVkaXRzVW5kb25lLCB7IGFsbG93TWFueUluUGFyYWxsZWw6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHRcdHJlbW92ZU92ZXJsYXkoKTtcblx0XHRcdFx0XHRcdFx0dG9vbGJhcldpZGdldC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3Qgc2luZ2xlQ2hhbmdlIG9mIGNoYW5nZS5kaWZmLmdldCgpLmNoYW5nZXMpIHtcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCBjaGFuZ2UudW5kbyhzaW5nbGVDaGFuZ2UpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIElNb2RpZmllZEZpbGVFbnRyeUNoYW5nZUh1bmssXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0XHRpZiAoIWFjdGlvbi5jbGFzcykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIEFjdGlvblZpZXdJdGVtIHtcblx0XHRcdFx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0XHRcdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywga2V5YmluZGluZ05vdFJlbmRlcmVkV2l0aExhYmVsOiB0cnVlIC8qIGhpZGUga2V5YmluZGluZyBmb3IgYWN0aW9ucyB3aXRob3V0IGljb24gKi8sIGljb246IGZhbHNlLCBsYWJlbDogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMub3ZlcmxheURpc3Bvc2FibGVzLmFkZCh0b29sYmFyV2lkZ2V0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldENlbGxWaWV3TW9kZWwoY2hhbmdlOiBJQ2VsbERpZmZJbmZvKSB7XG5cdFx0aWYgKGNoYW5nZS50eXBlID09PSAnZGVsZXRlJyB8fCBjaGFuZ2UubW9kaWZpZWRDZWxsSW5kZXggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgY2VsbCA9IHRoaXMubm90ZWJvb2tNb2RlbC5jZWxsc1tjaGFuZ2UubW9kaWZpZWRDZWxsSW5kZXhdO1xuXHRcdGNvbnN0IGNlbGxWaWV3TW9kZWwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldFZpZXdNb2RlbCgpPy52aWV3Q2VsbHMuZmluZChjID0+IGMuaGFuZGxlID09PSBjZWxsLmhhbmRsZSk7XG5cdFx0cmV0dXJuIGNlbGxWaWV3TW9kZWw7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHRpZiAodGhpcy5fdGltZW91dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fdGltZW91dCk7XG5cdFx0fVxuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLHFCQUFxQixtQ0FBbUM7QUFDakUsU0FBUyxzQkFBc0IsMEJBQTBCO0FBQ3pELFNBQVMsY0FBYztBQUN2QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFzQztBQUUvQyxTQUFTLGdCQUFnQjtBQUtsQixJQUFNLDBCQUFOLGNBQXNDLFdBQVc7QUFBQSxFQUt2RCxZQUNrQixnQkFDQSxlQUN1QixzQkFDTSw0QkFDN0M7QUFDRCxVQUFNO0FBTFc7QUFDQTtBQUN1QjtBQUNNO0FBUC9DLFNBQVEsV0FBZ0M7QUFDeEMsU0FBaUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBQUEsRUFTMUU7QUFBQSxFQUVBLFNBQVMsU0FBMEI7QUFDbEMsUUFBSSxLQUFLLGFBQWEsUUFBVztBQUNoQyxtQkFBYSxLQUFLLFFBQVE7QUFBQSxJQUMzQjtBQUNBLFNBQUssV0FBVyxXQUFXLE1BQU07QUFDaEMsV0FBSyxXQUFXO0FBQ2hCLFdBQUssOEJBQThCLE9BQU87QUFBQSxJQUMzQyxHQUFHLEdBQUc7QUFBQSxFQUNQO0FBQUEsRUFFUSw4QkFBOEIsU0FBMEI7QUFDL0QsU0FBSyxtQkFBbUIsTUFBTTtBQUU5QixVQUFNLDZCQUE2QixLQUFLO0FBQ3hDLFVBQU0sU0FBUyxLQUFLO0FBQ3BCLGVBQVcsVUFBVSxTQUFTO0FBQzdCLFlBQU0sZ0JBQWdCLEtBQUssaUJBQWlCLE1BQU07QUFFbEQsVUFBSSxDQUFDLGlCQUFpQixjQUFjLGFBQWEsU0FBUyxRQUFRO0FBQ2pFO0FBQUEsTUFDRDtBQUNBLFlBQU0sbUJBQW1CLFNBQVMsY0FBYyxLQUFLO0FBRXJELFVBQUksWUFBZ0M7QUFDcEMsYUFBTyxtQkFBbUIsQ0FBQyxhQUFhO0FBQ3ZDLHlCQUFpQixNQUFNLFFBQVE7QUFDL0Isb0JBQVksU0FBUyxXQUFXO0FBQUEsVUFDL0IsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFFBQ1YsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUVELFlBQU0sZ0JBQWdCLE1BQU07QUFDM0IsZUFBTyxtQkFBbUIsY0FBWTtBQUNyQyxjQUFJLFdBQVc7QUFDZCxxQkFBUyxjQUFjLFNBQVM7QUFBQSxVQUNqQztBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFFQSxXQUFLLG1CQUFtQixJQUFJLEVBQUUsU0FBUyxjQUFjLENBQUM7QUFFdEQsWUFBTSxVQUFVLFNBQVMsY0FBYyxLQUFLO0FBQzVDLHVCQUFpQixZQUFZLE9BQU87QUFDcEMsY0FBUSxZQUFZO0FBQ3BCLGNBQVEsVUFBVSxJQUFJLE9BQU87QUFDN0IsY0FBUSxNQUFNLFdBQVc7QUFDekIsY0FBUSxNQUFNLE1BQU07QUFDcEIsY0FBUSxNQUFNLFNBQVM7QUFDdkIsY0FBUSxNQUFNLFVBQVUsY0FBYyxhQUFhLE1BQU0sY0FBYyxVQUFVLFNBQVM7QUFFMUYsV0FBSyxtQkFBbUIsSUFBSSxjQUFjLGlCQUFpQixDQUFDLE1BQU07QUFDakUsWUFBSSxFQUFFLGtCQUFrQjtBQUN2QixjQUFJLGNBQWMsYUFBYSxNQUFNLGNBQWMsU0FBUztBQUMzRCxvQkFBUSxNQUFNLFVBQVU7QUFBQSxVQUN6QixPQUFPO0FBQ04sb0JBQVEsTUFBTSxVQUFVO0FBQUEsVUFDekI7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFFRixZQUFNLHFCQUFxQixLQUFLLFVBQVUsS0FBSyxxQkFBcUIsWUFBWSxJQUFJLGtCQUFrQixDQUFDLG9CQUFvQixLQUFLLGVBQWUsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO0FBQ3pLLFlBQU0sZ0JBQWdCLG1CQUFtQixlQUFlLHNCQUFzQixTQUFTLE9BQU8sdUJBQXVCO0FBQUEsUUFDcEgsaUJBQWlCO0FBQUEsUUFDakIsb0JBQW9CLG1CQUFtQjtBQUFBLFFBQ3ZDLGdCQUFnQixFQUFFLGNBQWMsTUFBTSxLQUFLO0FBQUEsUUFDM0MsYUFBYTtBQUFBLFVBQ1osa0JBQWtCO0FBQUEsVUFDbEIsS0FBSztBQUFBLFlBQ0osTUFBTSxTQUFTO0FBQ2QseUNBQTJCLFdBQVcsb0JBQW9CLFdBQVcsRUFBRSxxQkFBcUIsS0FBSyxDQUFDO0FBQ2xHLDRCQUFjO0FBQ2QsNEJBQWMsUUFBUTtBQUN0Qix5QkFBVyxnQkFBZ0IsT0FBTyxLQUFLLElBQUksRUFBRSxTQUFTO0FBQ3JELHNCQUFNLE9BQU8sS0FBSyxZQUFZO0FBQUEsY0FDL0I7QUFDQSxxQkFBTztBQUFBLFlBQ1I7QUFBQSxZQUNBLE1BQU0sU0FBUztBQUNkLHlDQUEyQixXQUFXLG9CQUFvQixhQUFhLEVBQUUscUJBQXFCLEtBQUssQ0FBQztBQUNwRyw0QkFBYztBQUNkLDRCQUFjLFFBQVE7QUFDdEIseUJBQVcsZ0JBQWdCLE9BQU8sS0FBSyxJQUFJLEVBQUUsU0FBUztBQUNyRCxzQkFBTSxPQUFPLEtBQUssWUFBWTtBQUFBLGNBQy9CO0FBQ0EscUJBQU87QUFBQSxZQUNSO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBLHdCQUF3QixDQUFDLFFBQVEsWUFBWTtBQUM1QyxjQUFJLENBQUMsT0FBTyxPQUFPO0FBQ2xCLG1CQUFPLElBQUksY0FBYyxlQUFlO0FBQUEsY0FDdkMsY0FBYztBQUNiLHNCQUFNLFFBQVcsUUFBUSxFQUFFLEdBQUcsU0FBUyxnQ0FBZ0MsTUFBcUQsTUFBTSxPQUFPLE9BQU8sS0FBSyxDQUFDO0FBQUEsY0FDdko7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUNBLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0QsQ0FBQztBQUVELFdBQUssbUJBQW1CLElBQUksYUFBYTtBQUFBLElBQzFDO0FBQUEsRUFDRDtBQUFBLEVBRVEsaUJBQWlCLFFBQXVCO0FBQy9DLFFBQUksT0FBTyxTQUFTLFlBQVksT0FBTyxzQkFBc0IsUUFBVztBQUN2RSxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sT0FBTyxLQUFLLGNBQWMsTUFBTSxPQUFPLGlCQUFpQjtBQUM5RCxVQUFNLGdCQUFnQixLQUFLLGVBQWUsYUFBYSxHQUFHLFVBQVUsS0FBSyxPQUFLLEVBQUUsV0FBVyxLQUFLLE1BQU07QUFDdEcsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFVBQU0sUUFBUTtBQUNkLFFBQUksS0FBSyxhQUFhLFFBQVc7QUFDaEMsbUJBQWEsS0FBSyxRQUFRO0FBQUEsSUFDM0I7QUFBQSxFQUNEO0FBRUQ7QUF2SWEsMEJBQU47QUFBQSxFQVFKO0FBQUEsRUFDQTtBQUFBLEdBVFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
