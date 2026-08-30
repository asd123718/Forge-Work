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
import { Separator, toAction } from "../../../base/common/actions.js";
import { localize } from "../../../nls.js";
import { IWorkbenchLayoutService } from "../../services/layout/browser/layoutService.js";
import { IContextMenuService } from "../../../platform/contextview/browser/contextView.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { EventHelper, addDisposableListener, getActiveDocument, getWindow, isHTMLInputElement, isHTMLTextAreaElement } from "../../../base/browser/dom.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../common/contributions.js";
import { IClipboardService } from "../../../platform/clipboard/common/clipboardService.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { Event as BaseEvent } from "../../../base/common/event.js";
import { Lazy } from "../../../base/common/lazy.js";
import { ILogService } from "../../../platform/log/common/log.js";
function createTextInputActions(clipboardService, logService) {
  return [
    toAction({ id: "undo", label: localize("undo", "Undo"), run: () => getActiveDocument().execCommand("undo") }),
    toAction({ id: "redo", label: localize("redo", "Redo"), run: () => getActiveDocument().execCommand("redo") }),
    new Separator(),
    toAction({
      id: "editor.action.clipboardCutAction",
      label: localize("cut", "Cut"),
      run: () => {
        logService.trace("TextInputActionsProvider#cut");
        getActiveDocument().execCommand("cut");
      }
    }),
    toAction({
      id: "editor.action.clipboardCopyAction",
      label: localize("copy", "Copy"),
      run: () => {
        logService.trace("TextInputActionsProvider#copy");
        getActiveDocument().execCommand("copy");
      }
    }),
    toAction({
      id: "editor.action.clipboardPasteAction",
      label: localize("paste", "Paste"),
      run: async (element) => {
        logService.trace("TextInputActionsProvider#paste");
        const clipboardText = await clipboardService.readText();
        if (isHTMLTextAreaElement(element) || isHTMLInputElement(element)) {
          const selectionStart = element.selectionStart || 0;
          const selectionEnd = element.selectionEnd || 0;
          element.value = `${element.value.substring(0, selectionStart)}${clipboardText}${element.value.substring(selectionEnd, element.value.length)}`;
          element.selectionStart = selectionStart + clipboardText.length;
          element.selectionEnd = element.selectionStart;
          element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
        }
      }
    }),
    new Separator(),
    toAction({ id: "editor.action.selectAll", label: localize("selectAll", "Select All"), run: () => getActiveDocument().execCommand("selectAll") })
  ];
}
let TextInputActionsProvider = class extends Disposable {
  constructor(layoutService, contextMenuService, clipboardService, logService) {
    super();
    this.layoutService = layoutService;
    this.contextMenuService = contextMenuService;
    this.clipboardService = clipboardService;
    this.logService = logService;
    this.textInputActions = new Lazy(() => createTextInputActions(this.clipboardService, this.logService));
    this.registerListeners();
  }
  registerListeners() {
    this._register(BaseEvent.runAndSubscribe(this.layoutService.onDidAddContainer, ({ container, disposables }) => {
      disposables.add(addDisposableListener(container, "contextmenu", (e) => this.onContextMenu(getWindow(container), e)));
    }, { container: this.layoutService.mainContainer, disposables: this._store }));
  }
  onContextMenu(targetWindow, e) {
    if (e.defaultPrevented) {
      return;
    }
    const target = e.target;
    if (!isHTMLTextAreaElement(target) && !isHTMLInputElement(target)) {
      return;
    }
    EventHelper.stop(e, true);
    const event = new StandardMouseEvent(targetWindow, e);
    this.contextMenuService.showContextMenu({
      getAnchor: () => event,
      getActions: () => this.textInputActions.value,
      getActionsContext: () => target
    });
  }
};
TextInputActionsProvider.ID = "workbench.contrib.textInputActionsProvider";
TextInputActionsProvider = __decorateClass([
  __decorateParam(0, IWorkbenchLayoutService),
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IClipboardService),
  __decorateParam(3, ILogService)
], TextInputActionsProvider);
registerWorkbenchContribution2(
  TextInputActionsProvider.ID,
  TextInputActionsProvider,
  WorkbenchPhase.BlockRestore
  // Block to allow right-click into input fields before restore finished
);
export {
  TextInputActionsProvider,
  createTextInputActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXGFjdGlvbnNcXHRleHRJbnB1dEFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJQWN0aW9uLCBTZXBhcmF0b3IsIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFdmVudEhlbHBlciwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBnZXRBY3RpdmVEb2N1bWVudCwgZ2V0V2luZG93LCBpc0hUTUxJbnB1dEVsZW1lbnQsIGlzSFRNTFRleHRBcmVhRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UsIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IEV2ZW50IGFzIEJhc2VFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVGV4dElucHV0QWN0aW9ucyhjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpOiBJQWN0aW9uW10ge1xuXHRyZXR1cm4gW1xuXG5cdFx0dG9BY3Rpb24oeyBpZDogJ3VuZG8nLCBsYWJlbDogbG9jYWxpemUoJ3VuZG8nLCBcIlVuZG9cIiksIHJ1bjogKCkgPT4gZ2V0QWN0aXZlRG9jdW1lbnQoKS5leGVjQ29tbWFuZCgndW5kbycpIH0pLFxuXHRcdHRvQWN0aW9uKHsgaWQ6ICdyZWRvJywgbGFiZWw6IGxvY2FsaXplKCdyZWRvJywgXCJSZWRvXCIpLCBydW46ICgpID0+IGdldEFjdGl2ZURvY3VtZW50KCkuZXhlY0NvbW1hbmQoJ3JlZG8nKSB9KSxcblx0XHRuZXcgU2VwYXJhdG9yKCksXG5cdFx0dG9BY3Rpb24oe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmNsaXBib2FyZEN1dEFjdGlvbicsIGxhYmVsOiBsb2NhbGl6ZSgnY3V0JywgXCJDdXRcIiksIHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdUZXh0SW5wdXRBY3Rpb25zUHJvdmlkZXIjY3V0Jyk7XG5cdFx0XHRcdGdldEFjdGl2ZURvY3VtZW50KCkuZXhlY0NvbW1hbmQoJ2N1dCcpO1xuXHRcdFx0fVxuXHRcdH0pLFxuXHRcdHRvQWN0aW9uKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5jbGlwYm9hcmRDb3B5QWN0aW9uJywgbGFiZWw6IGxvY2FsaXplKCdjb3B5JywgXCJDb3B5XCIpLCBydW46ICgpID0+IHtcblx0XHRcdFx0bG9nU2VydmljZS50cmFjZSgnVGV4dElucHV0QWN0aW9uc1Byb3ZpZGVyI2NvcHknKTtcblx0XHRcdFx0Z2V0QWN0aXZlRG9jdW1lbnQoKS5leGVjQ29tbWFuZCgnY29weScpO1xuXHRcdFx0fVxuXHRcdH0pLFxuXHRcdHRvQWN0aW9uKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5jbGlwYm9hcmRQYXN0ZUFjdGlvbicsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Bhc3RlJywgXCJQYXN0ZVwiKSxcblx0XHRcdHJ1bjogYXN5bmMgKGVsZW1lbnQ6IHVua25vd24pID0+IHtcblx0XHRcdFx0bG9nU2VydmljZS50cmFjZSgnVGV4dElucHV0QWN0aW9uc1Byb3ZpZGVyI3Bhc3RlJyk7XG5cdFx0XHRcdGNvbnN0IGNsaXBib2FyZFRleHQgPSBhd2FpdCBjbGlwYm9hcmRTZXJ2aWNlLnJlYWRUZXh0KCk7XG5cdFx0XHRcdGlmIChpc0hUTUxUZXh0QXJlYUVsZW1lbnQoZWxlbWVudCkgfHwgaXNIVE1MSW5wdXRFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uU3RhcnQgPSBlbGVtZW50LnNlbGVjdGlvblN0YXJ0IHx8IDA7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uRW5kID0gZWxlbWVudC5zZWxlY3Rpb25FbmQgfHwgMDtcblxuXHRcdFx0XHRcdGVsZW1lbnQudmFsdWUgPSBgJHtlbGVtZW50LnZhbHVlLnN1YnN0cmluZygwLCBzZWxlY3Rpb25TdGFydCl9JHtjbGlwYm9hcmRUZXh0fSR7ZWxlbWVudC52YWx1ZS5zdWJzdHJpbmcoc2VsZWN0aW9uRW5kLCBlbGVtZW50LnZhbHVlLmxlbmd0aCl9YDtcblx0XHRcdFx0XHRlbGVtZW50LnNlbGVjdGlvblN0YXJ0ID0gc2VsZWN0aW9uU3RhcnQgKyBjbGlwYm9hcmRUZXh0Lmxlbmd0aDtcblx0XHRcdFx0XHRlbGVtZW50LnNlbGVjdGlvbkVuZCA9IGVsZW1lbnQuc2VsZWN0aW9uU3RhcnQ7XG5cdFx0XHRcdFx0ZWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSksXG5cdFx0bmV3IFNlcGFyYXRvcigpLFxuXHRcdHRvQWN0aW9uKHsgaWQ6ICdlZGl0b3IuYWN0aW9uLnNlbGVjdEFsbCcsIGxhYmVsOiBsb2NhbGl6ZSgnc2VsZWN0QWxsJywgXCJTZWxlY3QgQWxsXCIpLCBydW46ICgpID0+IGdldEFjdGl2ZURvY3VtZW50KCkuZXhlY0NvbW1hbmQoJ3NlbGVjdEFsbCcpIH0pXG5cdF07XG59XG5cbmV4cG9ydCBjbGFzcyBUZXh0SW5wdXRBY3Rpb25zUHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnRleHRJbnB1dEFjdGlvbnNQcm92aWRlcic7XG5cblx0cHJpdmF0ZSByZWFkb25seSB0ZXh0SW5wdXRBY3Rpb25zID0gbmV3IExhenk8SUFjdGlvbltdPigoKSA9PiBjcmVhdGVUZXh0SW5wdXRBY3Rpb25zKHRoaXMuY2xpcGJvYXJkU2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBDb250ZXh0IG1lbnUgc3VwcG9ydCBpbiBpbnB1dC90ZXh0YXJlYVxuXHRcdHRoaXMuX3JlZ2lzdGVyKEJhc2VFdmVudC5ydW5BbmRTdWJzY3JpYmUodGhpcy5sYXlvdXRTZXJ2aWNlLm9uRGlkQWRkQ29udGFpbmVyLCAoeyBjb250YWluZXIsIGRpc3Bvc2FibGVzIH0pID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoY29udGFpbmVyLCAnY29udGV4dG1lbnUnLCBlID0+IHRoaXMub25Db250ZXh0TWVudShnZXRXaW5kb3coY29udGFpbmVyKSwgZSkpKTtcblx0XHR9LCB7IGNvbnRhaW5lcjogdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXIsIGRpc3Bvc2FibGVzOiB0aGlzLl9zdG9yZSB9KSk7XG5cdH1cblxuXHRwcml2YXRlIG9uQ29udGV4dE1lbnUodGFyZ2V0V2luZG93OiBXaW5kb3csIGU6IE1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZS5kZWZhdWx0UHJldmVudGVkKSB7XG5cdFx0XHRyZXR1cm47IC8vIG1ha2Ugc3VyZSB0byBub3Qgc2hvdyB0aGVzZSBhY3Rpb25zIGJ5IGFjY2lkZW50IGlmIGNvbXBvbmVudCBpbmRpY2F0ZWQgdG8gcHJldmVudFxuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0O1xuXHRcdGlmICghaXNIVE1MVGV4dEFyZWFFbGVtZW50KHRhcmdldCkgJiYgIWlzSFRNTElucHV0RWxlbWVudCh0YXJnZXQpKSB7XG5cdFx0XHRyZXR1cm47IC8vIG9ubHkgZm9yIGlucHV0cyBvciB0ZXh0YXJlYXNcblx0XHR9XG5cblx0XHRFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXG5cdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KHRhcmdldFdpbmRvdywgZSk7XG5cblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBldmVudCxcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHRoaXMudGV4dElucHV0QWN0aW9ucy52YWx1ZSxcblx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiB0YXJnZXQsXG5cdFx0fSk7XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFxuXHRUZXh0SW5wdXRBY3Rpb25zUHJvdmlkZXIuSUQsXG5cdFRleHRJbnB1dEFjdGlvbnNQcm92aWRlcixcblx0V29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlIC8vIEJsb2NrIHRvIGFsbG93IHJpZ2h0LWNsaWNrIGludG8gaW5wdXQgZmllbGRzIGJlZm9y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
