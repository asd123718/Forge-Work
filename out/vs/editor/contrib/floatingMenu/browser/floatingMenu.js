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
import { Separator } from "../../../../base/common/actions.js";
import { h } from "../../../../base/browser/dom.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, constObservable, derived, observableFromEvent } from "../../../../base/common/observable.js";
import { getActionBarActions, MenuEntryActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { IMenuService, MenuId, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { OverlayWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { observableCodeEditor } from "../../../browser/observableCodeEditor.js";
let FloatingEditorToolbar = class extends Disposable {
  constructor(editor, instantiationService, keybindingService, menuService) {
    super();
    const editorObs = this._register(observableCodeEditor(editor));
    const editorUriObs = derived((reader) => editorObs.model.read(reader)?.uri);
    const widget = this._register(instantiationService.createInstance(
      FloatingEditorToolbarWidget,
      MenuId.EditorContent,
      editor.contextKeyService,
      editorUriObs
    ));
    this._register(autorun((reader) => {
      const hasActions = widget.hasActions.read(reader);
      if (!hasActions) {
        return;
      }
      reader.store.add(editorObs.createOverlayWidget({
        allowEditorOverflow: false,
        domNode: widget.element,
        minContentWidthInPx: constObservable(0),
        position: constObservable({
          preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
        })
      }));
    }));
  }
};
FloatingEditorToolbar.ID = "editor.contrib.floatingToolbar";
FloatingEditorToolbar = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IMenuService)
], FloatingEditorToolbar);
let FloatingEditorToolbarWidget = class extends Disposable {
  constructor(_menuId, _scopedContextKeyService, _toolbarContext, instantiationService, keybindingService, menuService) {
    super();
    const menu = this._register(menuService.createMenu(_menuId, _scopedContextKeyService));
    const menuGroupsObs = observableFromEvent(this, menu.onDidChange, () => menu.getActions());
    const menuPrimaryActionsObs = derived((reader) => {
      const menuGroups = menuGroupsObs.read(reader);
      const { primary } = getActionBarActions(menuGroups, () => true);
      return primary.filter((a) => a.id !== Separator.ID);
    });
    this.hasActions = derived((reader) => menuPrimaryActionsObs.read(reader).length > 0);
    this.element = h("div.floating-menu-overlay-widget").root;
    this._register(toDisposable(() => this.element.remove()));
    this._register(autorun((reader) => {
      const primaryActions = menuPrimaryActionsObs.read(reader);
      const hasActions = primaryActions.length > 0;
      const menuPrimaryActionId = hasActions ? primaryActions[0].id : void 0;
      const isSingleButton = primaryActions.length === 1;
      this.element.classList.toggle("single-button", isSingleButton);
      this.element.style.height = isSingleButton ? "28px" : "26px";
      if (!hasActions) {
        return;
      }
      const toolbar = instantiationService.createInstance(MenuWorkbenchToolBar, this.element, _menuId, {
        actionViewItemProvider: (action, options) => {
          if (!(action instanceof MenuItemAction)) {
            return void 0;
          }
          return instantiationService.createInstance(class extends MenuEntryActionViewItem {
            render(container) {
              super.render(container);
              if (action.id === menuPrimaryActionId) {
                this.element?.classList.add("primary");
              }
            }
            updateLabel() {
              const keybinding = keybindingService.lookupKeybinding(action.id);
              const keybindingLabel = keybinding ? keybinding.getLabel() : void 0;
              if (this.options.label && this.label) {
                this.label.textContent = keybindingLabel ? `${this._commandAction.label} (${keybindingLabel})` : this._commandAction.label;
              }
            }
          }, action, { ...options, keybindingNotRenderedWithLabel: true });
        },
        hiddenItemStrategy: HiddenItemStrategy.Ignore,
        menuOptions: {
          shouldForwardArgs: true
        },
        telemetrySource: "editor.overlayToolbar",
        toolbarOptions: {
          primaryGroup: () => true,
          useSeparatorsInPrimaryActions: true
        }
      });
      reader.store.add(toolbar);
      reader.store.add(autorun((reader2) => {
        const context = _toolbarContext.read(reader2);
        toolbar.context = context;
      }));
    }));
  }
};
FloatingEditorToolbarWidget = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IMenuService)
], FloatingEditorToolbarWidget);
export {
  FloatingEditorToolbar,
  FloatingEditorToolbarWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGZsb2F0aW5nTWVudVxcYnJvd3NlclxcZmxvYXRpbmdNZW51LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgY29uc3RPYnNlcnZhYmxlLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZUZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdldEFjdGlvbkJhckFjdGlvbnMsIE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IEhpZGRlbkl0ZW1TdHJhdGVneSwgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBPdmVybGF5V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9vYnNlcnZhYmxlQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5cbmV4cG9ydCBjbGFzcyBGbG9hdGluZ0VkaXRvclRvb2xiYXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuY29udHJpYi5mbG9hdGluZ1Rvb2xiYXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGVkaXRvck9icyA9IHRoaXMuX3JlZ2lzdGVyKG9ic2VydmFibGVDb2RlRWRpdG9yKGVkaXRvcikpO1xuXHRcdGNvbnN0IGVkaXRvclVyaU9icyA9IGRlcml2ZWQocmVhZGVyID0+IGVkaXRvck9icy5tb2RlbC5yZWFkKHJlYWRlcik/LnVyaSk7XG5cblx0XHQvLyBXaWRnZXRcblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdEZsb2F0aW5nRWRpdG9yVG9vbGJhcldpZGdldCxcblx0XHRcdE1lbnVJZC5FZGl0b3JDb250ZW50LFxuXHRcdFx0ZWRpdG9yLmNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0ZWRpdG9yVXJpT2JzKSk7XG5cblx0XHQvLyBSZW5kZXIgd2lkZ2V0XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgaGFzQWN0aW9ucyA9IHdpZGdldC5oYXNBY3Rpb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghaGFzQWN0aW9ucykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIE92ZXJsYXkgd2lkZ2V0XG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKGVkaXRvck9icy5jcmVhdGVPdmVybGF5V2lkZ2V0KHtcblx0XHRcdFx0YWxsb3dFZGl0b3JPdmVyZmxvdzogZmFsc2UsXG5cdFx0XHRcdGRvbU5vZGU6IHdpZGdldC5lbGVtZW50LFxuXHRcdFx0XHRtaW5Db250ZW50V2lkdGhJblB4OiBjb25zdE9ic2VydmFibGUoMCksXG5cdFx0XHRcdHBvc2l0aW9uOiBjb25zdE9ic2VydmFibGUoe1xuXHRcdFx0XHRcdHByZWZlcmVuY2U6IE92ZXJsYXlXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQk9UVE9NX1JJR0hUX0NPUk5FUlxuXHRcdFx0XHR9KVxuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRmxvYXRpbmdFZGl0b3JUb29sYmFyV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBoYXNBY3Rpb25zOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRfbWVudUlkOiBNZW51SWQsXG5cdFx0X3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0X3Rvb2xiYXJDb250ZXh0OiBJT2JzZXJ2YWJsZTxVUkkgfCB1bmRlZmluZWQ+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBtZW51ID0gdGhpcy5fcmVnaXN0ZXIobWVudVNlcnZpY2UuY3JlYXRlTWVudShfbWVudUlkLCBfc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpKTtcblx0XHRjb25zdCBtZW51R3JvdXBzT2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCBtZW51Lm9uRGlkQ2hhbmdlLCAoKSA9PiBtZW51LmdldEFjdGlvbnMoKSk7XG5cblx0XHRjb25zdCBtZW51UHJpbWFyeUFjdGlvbnNPYnMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBtZW51R3JvdXBzID0gbWVudUdyb3Vwc09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB7IHByaW1hcnkgfSA9IGdldEFjdGlvbkJhckFjdGlvbnMobWVudUdyb3VwcywgKCkgPT4gdHJ1ZSk7XG5cdFx0XHRyZXR1cm4gcHJpbWFyeS5maWx0ZXIoYSA9PiBhLmlkICE9PSBTZXBhcmF0b3IuSUQpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5oYXNBY3Rpb25zID0gZGVyaXZlZChyZWFkZXIgPT4gbWVudVByaW1hcnlBY3Rpb25zT2JzLnJlYWQocmVhZGVyKS5sZW5ndGggPiAwKTtcblxuXHRcdHRoaXMuZWxlbWVudCA9IGgoJ2Rpdi5mbG9hdGluZy1tZW51LW92ZXJsYXktd2lkZ2V0Jykucm9vdDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5lbGVtZW50LnJlbW92ZSgpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBwcmltYXJ5QWN0aW9ucyA9IG1lbnVQcmltYXJ5QWN0aW9uc09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBoYXNBY3Rpb25zID0gcHJpbWFyeUFjdGlvbnMubGVuZ3RoID4gMDtcblx0XHRcdGNvbnN0IG1lbnVQcmltYXJ5QWN0aW9uSWQgPSBoYXNBY3Rpb25zID8gcHJpbWFyeUFjdGlvbnNbMF0uaWQgOiB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IGlzU2luZ2xlQnV0dG9uID0gcHJpbWFyeUFjdGlvbnMubGVuZ3RoID09PSAxO1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3NpbmdsZS1idXR0b24nLCBpc1NpbmdsZUJ1dHRvbik7XG5cdFx0XHQvLyBTZXQgaGVpZ2h0IGV4cGxpY2l0bHkgdG8gZW5zdXJlIHRoYXQgdGhlIGZsb2F0aW5nIG1lbnUgZWxlbWVudFxuXHRcdFx0Ly8gaXMgcmVuZGVyZWQgaW4gdGhlIGxvd2VyIHJpZ2h0IGNvcm5lciBhdCB0aGUgY29ycmVjdCBwb3NpdGlvbi5cblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5oZWlnaHQgPSBpc1NpbmdsZUJ1dHRvbiA/ICcyOHB4JyA6ICcyNnB4JztcblxuXHRcdFx0aWYgKCFoYXNBY3Rpb25zKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVG9vbGJhclxuXHRcdFx0Y29uc3QgdG9vbGJhciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB0aGlzLmVsZW1lbnQsIF9tZW51SWQsIHtcblx0XHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRcdGlmICghKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoY2xhc3MgZXh0ZW5kcyBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSB7XG5cdFx0XHRcdFx0XHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdFx0XHRcdFx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblxuXHRcdFx0XHRcdFx0XHQvLyBIaWdobGlnaHQgcHJpbWFyeSBhY3Rpb25cblx0XHRcdFx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gbWVudVByaW1hcnlBY3Rpb25JZCkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuZWxlbWVudD8uY2xhc3NMaXN0LmFkZCgncHJpbWFyeScpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVMYWJlbCgpOiB2b2lkIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IGtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKTtcblx0XHRcdFx0XHRcdFx0Y29uc3Qga2V5YmluZGluZ0xhYmVsID0ga2V5YmluZGluZyA/IGtleWJpbmRpbmcuZ2V0TGFiZWwoKSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRcdFx0XHRpZiAodGhpcy5vcHRpb25zLmxhYmVsICYmIHRoaXMubGFiZWwpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmxhYmVsLnRleHRDb250ZW50ID0ga2V5YmluZGluZ0xhYmVsXG5cdFx0XHRcdFx0XHRcdFx0XHQ/IGAke3RoaXMuX2NvbW1hbmRBY3Rpb24ubGFiZWx9ICgke2tleWJpbmRpbmdMYWJlbH0pYFxuXHRcdFx0XHRcdFx0XHRcdFx0OiB0aGlzLl9jb21tYW5kQWN0aW9uLmxhYmVsO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIGtleWJpbmRpbmdOb3RSZW5kZXJlZFdpdGhMYWJlbDogdHJ1ZSB9KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuSWdub3JlLFxuXHRcdFx0XHRtZW51T3B0aW9uczoge1xuXHRcdFx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ2VkaXRvci5vdmVybGF5VG9vbGJhcicsXG5cdFx0XHRcdHRvb2xiYXJPcHRpb25zOiB7XG5cdFx0XHRcdFx0cHJpbWFyeUdyb3VwOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRcdHVzZVNlcGFyYXRvcnNJblByaW1hcnlBY3Rpb25zOiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZCh0b29sYmFyKTtcblx0XHRcdHJlYWRlci5zdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250ZXh0ID0gX3Rvb2xiYXJDb250ZXh0LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0dG9vbGJhci5jb250ZXh0ID0gY29udGV4dDtcblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxTQUFTO0FBQ2xCLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBUyxTQUFTLGlCQUFpQixTQUFzQiwyQkFBMkI7QUFFcEYsU0FBUyxxQkFBcUIsK0JBQStCO0FBQzdELFNBQVMsb0JBQW9CLDRCQUE0QjtBQUN6RCxTQUFTLGNBQWMsUUFBUSxzQkFBc0I7QUFFckQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBc0IsdUNBQXVDO0FBQzdELFNBQVMsNEJBQTRCO0FBRzlCLElBQU0sd0JBQU4sY0FBb0MsV0FBMEM7QUFBQSxFQUdwRixZQUNDLFFBQ3VCLHNCQUNILG1CQUNOLGFBQ2I7QUFDRCxVQUFNO0FBRU4sVUFBTSxZQUFZLEtBQUssVUFBVSxxQkFBcUIsTUFBTSxDQUFDO0FBQzdELFVBQU0sZUFBZSxRQUFRLFlBQVUsVUFBVSxNQUFNLEtBQUssTUFBTSxHQUFHLEdBQUc7QUFHeEUsVUFBTSxTQUFTLEtBQUssVUFBVSxxQkFBcUI7QUFBQSxNQUNsRDtBQUFBLE1BQ0EsT0FBTztBQUFBLE1BQ1AsT0FBTztBQUFBLE1BQ1A7QUFBQSxJQUFZLENBQUM7QUFHZCxTQUFLLFVBQVUsUUFBUSxZQUFV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
