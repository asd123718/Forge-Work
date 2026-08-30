import { $, addDisposableListener, EventType, getActiveElement, getWindow, isAncestor, isHTMLElement } from "../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { Menu } from "../../../base/browser/ui/menu/menu.js";
import { ActionRunner } from "../../../base/common/actions.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { combinedDisposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { defaultMenuStyles } from "../../theme/browser/defaultStyles.js";
class ContextMenuHandler {
  constructor(contextViewService, telemetryService, notificationService, keybindingService) {
    this.contextViewService = contextViewService;
    this.telemetryService = telemetryService;
    this.notificationService = notificationService;
    this.keybindingService = keybindingService;
    this.focusToReturn = null;
    this.lastContainer = null;
    this.block = null;
    this.blockDisposable = null;
    this.options = { blockMouse: true };
  }
  configure(options) {
    this.options = options;
  }
  showContextMenu(delegate) {
    const actions = delegate.getActions();
    if (!actions.length) {
      return;
    }
    this.focusToReturn = getActiveElement();
    let menu;
    const shadowRootElement = isHTMLElement(delegate.domForShadowRoot) ? delegate.domForShadowRoot : void 0;
    this.contextViewService.showContextView({
      getAnchor: () => delegate.getAnchor(),
      canRelayout: false,
      anchorAlignment: delegate.anchorAlignment,
      anchorAxisAlignment: delegate.anchorAxisAlignment,
      closeAnimation: delegate.closeAnimation,
      layer: delegate.layer,
      render: (container) => {
        this.lastContainer = container;
        const className = delegate.getMenuClassName ? delegate.getMenuClassName() : "";
        if (className) {
          container.className += " " + className;
        }
        if (this.options.blockMouse) {
          this.block = container.appendChild($(".context-view-block"));
          this.block.style.position = "fixed";
          this.block.style.cursor = "initial";
          this.block.style.left = "0";
          this.block.style.top = "0";
          this.block.style.width = "100%";
          this.block.style.height = "100%";
          this.block.style.zIndex = "-1";
          this.blockDisposable?.dispose();
          this.blockDisposable = addDisposableListener(this.block, EventType.MOUSE_DOWN, (e) => e.stopPropagation());
        }
        const menuDisposables = new DisposableStore();
        const actionRunner = delegate.actionRunner || menuDisposables.add(new ActionRunner());
        actionRunner.onWillRun((evt) => this.onActionRun(evt, !delegate.skipTelemetry), this, menuDisposables);
        actionRunner.onDidRun(this.onDidActionRun, this, menuDisposables);
        menu = new Menu(
          container,
          actions,
          {
            actionViewItemProvider: delegate.getActionViewItem,
            context: delegate.getActionsContext ? delegate.getActionsContext() : null,
            actionRunner,
            getKeyBinding: delegate.getKeyBinding ? delegate.getKeyBinding : (action) => this.keybindingService.lookupKeybinding(action.id)
          },
          defaultMenuStyles
        );
        menu.onDidCancel(() => this.contextViewService.hideContextView(true), null, menuDisposables);
        menu.onDidBlur(() => this.contextViewService.hideContextView(true), null, menuDisposables);
        const targetWindow = getWindow(container);
        menuDisposables.add(addDisposableListener(targetWindow, EventType.BLUR, () => this.contextViewService.hideContextView(true)));
        menuDisposables.add(addDisposableListener(targetWindow, EventType.MOUSE_DOWN, (e) => {
          if (e.defaultPrevented) {
            return;
          }
          const event = new StandardMouseEvent(targetWindow, e);
          let element = event.target;
          if (event.rightButton) {
            return;
          }
          while (element) {
            if (element === container) {
              return;
            }
            element = element.parentElement;
          }
          this.contextViewService.hideContextView(true);
        }));
        return combinedDisposable(menuDisposables, menu);
      },
      focus: () => {
        menu?.focus(!!delegate.autoSelectFirstItem);
      },
      onHide: (didCancel) => {
        delegate.onHide?.(!!didCancel);
        if (this.block) {
          this.block.remove();
          this.block = null;
        }
        this.blockDisposable?.dispose();
        this.blockDisposable = null;
        if (!!this.lastContainer && (getActiveElement() === this.lastContainer || isAncestor(getActiveElement(), this.lastContainer))) {
          this.focusToReturn?.focus();
        }
        this.lastContainer = null;
      }
    }, shadowRootElement, !!shadowRootElement);
  }
  onActionRun(e, logTelemetry) {
    if (logTelemetry) {
      this.telemetryService.publicLog2("workbenchActionExecuted", { id: e.action.id, from: "contextMenu" });
    }
    this.contextViewService.hideContextView(false);
  }
  onDidActionRun(e) {
    if (e.error && !isCancellationError(e.error)) {
      this.notificationService.error(e.error);
    }
  }
}
export {
  ContextMenuHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcY29udGV4dHZpZXdcXGJyb3dzZXJcXGNvbnRleHRNZW51SGFuZGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElDb250ZXh0TWVudURlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2NvbnRleHRtZW51LmpzJztcbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlLCBnZXRBY3RpdmVFbGVtZW50LCBnZXRXaW5kb3csIGlzQW5jZXN0b3IsIGlzSFRNTEVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IE1lbnUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbWVudS9tZW51LmpzJztcbmltcG9ydCB7IEFjdGlvblJ1bm5lciwgSVJ1bkV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0TWVudVN0eWxlcyB9IGZyb20gJy4uLy4uL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5cblxuZXhwb3J0IGludGVyZmFjZSBJQ29udGV4dE1lbnVIYW5kbGVyT3B0aW9ucyB7XG5cdGJsb2NrTW91c2U6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBDb250ZXh0TWVudUhhbmRsZXIge1xuXHRwcml2YXRlIGZvY3VzVG9SZXR1cm46IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgbGFzdENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBibG9jazogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBibG9ja0Rpc3Bvc2FibGU6IElEaXNwb3NhYmxlIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgb3B0aW9uczogSUNvbnRleHRNZW51SGFuZGxlck9wdGlvbnMgPSB7IGJsb2NrTW91c2U6IHRydWUgfTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRwcml2YXRlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGNvbmZpZ3VyZShvcHRpb25zOiBJQ29udGV4dE1lbnVIYW5kbGVyT3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cdH1cblxuXHRzaG93Q29udGV4dE1lbnUoZGVsZWdhdGU6IElDb250ZXh0TWVudURlbGVnYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGRlbGVnYXRlLmdldEFjdGlvbnMoKTtcblx0XHRpZiAoIWFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47IC8vIERvbid0IHJlbmRlciBhbiBlbXB0eSBjb250ZXh0IG1lbnVcblx0XHR9XG5cblx0XHR0aGlzLmZvY3VzVG9SZXR1cm4gPSBnZXRBY3RpdmVFbGVtZW50KCkgYXMgSFRNTEVsZW1lbnQ7XG5cblx0XHRsZXQgbWVudTogTWVudSB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHNoYWRvd1Jvb3RFbGVtZW50ID0gaXNIVE1MRWxlbWVudChkZWxlZ2F0ZS5kb21Gb3JTaGFkb3dSb290KSA/IGRlbGVnYXRlLmRvbUZvclNoYWRvd1Jvb3QgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5jb250ZXh0Vmlld1NlcnZpY2Uuc2hvd0NvbnRleHRWaWV3KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZGVsZWdhdGUuZ2V0QW5jaG9yKCksXG5cdFx0XHRjYW5SZWxheW91dDogZmFsc2UsXG5cdFx0XHRhbmNob3JBbGlnbm1lbnQ6IGRlbGVnYXRlLmFuY2hvckFsaWdubWVudCxcblx0XHRcdGFuY2hvckF4aXNBbGlnbm1lbnQ6IGRlbGVnYXRlLmFuY2hvckF4aXNBbGlnbm1lbnQsXG5cdFx0XHRjbG9zZUFuaW1hdGlvbjogZGVsZWdhdGUuY2xvc2VBbmltYXRpb24sXG5cdFx0XHRsYXllcjogZGVsZWdhdGUubGF5ZXIsXG5cdFx0XHRyZW5kZXI6IChjb250YWluZXIpID0+IHtcblx0XHRcdFx0dGhpcy5sYXN0Q29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdFx0XHRjb25zdCBjbGFzc05hbWUgPSBkZWxlZ2F0ZS5nZXRNZW51Q2xhc3NOYW1lID8gZGVsZWdhdGUuZ2V0TWVudUNsYXNzTmFtZSgpIDogJyc7XG5cblx0XHRcdFx0aWYgKGNsYXNzTmFtZSkge1xuXHRcdFx0XHRcdGNvbnRhaW5lci5jbGFzc05hbWUgKz0gJyAnICsgY2xhc3NOYW1lO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVuZGVyIGludmlzaWJsZSBkaXYgdG8gYmxvY2sgbW91c2UgaW50ZXJhY3Rpb24gaW4gdGhlIHJlc3Qgb2YgdGhlIFVJXG5cdFx0XHRcdGlmICh0aGlzLm9wdGlvbnMuYmxvY2tNb3VzZSkge1xuXHRcdFx0XHRcdHRoaXMuYmxvY2sgPSBjb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnLmNvbnRleHQtdmlldy1ibG9jaycpKTtcblx0XHRcdFx0XHR0aGlzLmJsb2NrLnN0eWxlLnBvc2l0aW9uID0gJ2ZpeGVkJztcblx0XHRcdFx0XHR0aGlzLmJsb2NrLnN0eWxlLmN1cnNvciA9ICdpbml0aWFsJztcblx0XHRcdFx0XHR0aGlzLmJsb2NrLnN0eWxlLmxlZnQgPSAnMCc7XG5cdFx0XHRcdFx0dGhpcy5ibG9jay5zdHlsZS50b3AgPSAnMCc7XG5cdFx0XHRcdFx0dGhpcy5ibG9jay5zdHlsZS53aWR0aCA9ICcxMDAlJztcblx0XHRcdFx0XHR0aGlzLmJsb2NrLnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblx0XHRcdFx0XHR0aGlzLmJsb2NrLnN0eWxlLnpJbmRleCA9ICctMSc7XG5cblx0XHRcdFx0XHR0aGlzLmJsb2NrRGlzcG9zYWJsZT8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHRoaXMuYmxvY2tEaXNwb3NhYmxlID0gYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuYmxvY2ssIEV2ZW50VHlwZS5NT1VTRV9ET1dOLCBlID0+IGUuc3RvcFByb3BhZ2F0aW9uKCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbWVudURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRcdGNvbnN0IGFjdGlvblJ1bm5lciA9IGRlbGVnYXRlLmFjdGlvblJ1bm5lciB8fCBtZW51RGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb25SdW5uZXIoKSk7XG5cdFx0XHRcdGFjdGlvblJ1bm5lci5vbldpbGxSdW4oZXZ0ID0+IHRoaXMub25BY3Rpb25SdW4oZXZ0LCAhZGVsZWdhdGUuc2tpcFRlbGVtZXRyeSksIHRoaXMsIG1lbnVEaXNwb3NhYmxlcyk7XG5cdFx0XHRcdGFjdGlvblJ1bm5lci5vbkRpZFJ1bih0aGlzLm9uRGlkQWN0aW9uUnVuLCB0aGlzLCBtZW51RGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRtZW51ID0gbmV3IE1lbnUoY29udGFpbmVyLCBhY3Rpb25zLCB7XG5cdFx0XHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogZGVsZWdhdGUuZ2V0QWN0aW9uVmlld0l0ZW0sXG5cdFx0XHRcdFx0Y29udGV4dDogZGVsZWdhdGUuZ2V0QWN0aW9uc0NvbnRleHQgPyBkZWxlZ2F0ZS5nZXRBY3Rpb25zQ29udGV4dCgpIDogbnVsbCxcblx0XHRcdFx0XHRhY3Rpb25SdW5uZXIsXG5cdFx0XHRcdFx0Z2V0S2V5QmluZGluZzogZGVsZWdhdGUuZ2V0S2V5QmluZGluZyA/IGRlbGVnYXRlLmdldEtleUJpbmRpbmcgOiBhY3Rpb24gPT4gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZClcblx0XHRcdFx0fSxcblx0XHRcdFx0XHRkZWZhdWx0TWVudVN0eWxlc1xuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdG1lbnUub25EaWRDYW5jZWwoKCkgPT4gdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UuaGlkZUNvbnRleHRWaWV3KHRydWUpLCBudWxsLCBtZW51RGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRtZW51Lm9uRGlkQmx1cigoKSA9PiB0aGlzLmNvbnRleHRWaWV3U2VydmljZS5oaWRlQ29udGV4dFZpZXcodHJ1ZSksIG51bGwsIG1lbnVEaXNwb3NhYmxlcyk7XG5cdFx0XHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGdldFdpbmRvdyhjb250YWluZXIpO1xuXHRcdFx0XHRtZW51RGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXRXaW5kb3csIEV2ZW50VHlwZS5CTFVSLCAoKSA9PiB0aGlzLmNvbnRleHRWaWV3U2VydmljZS5oaWRlQ29udGV4dFZpZXcodHJ1ZSkpKTtcblx0XHRcdFx0bWVudURpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0V2luZG93LCBFdmVudFR5cGUuTU9VU0VfRE9XTiwgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdFx0XHRpZiAoZS5kZWZhdWx0UHJldmVudGVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KHRhcmdldFdpbmRvdywgZSk7XG5cdFx0XHRcdFx0bGV0IGVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IGV2ZW50LnRhcmdldDtcblxuXHRcdFx0XHRcdC8vIERvbid0IGRvIGFueXRoaW5nIGFzIHdlIGFyZSBsaWtlbHkgY3JlYXRpbmcgYSBjb250ZXh0IG1lbnVcblx0XHRcdFx0XHRpZiAoZXZlbnQucmlnaHRCdXR0b24pIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR3aGlsZSAoZWxlbWVudCkge1xuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQgPT09IGNvbnRhaW5lcikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGVsZW1lbnQgPSBlbGVtZW50LnBhcmVudEVsZW1lbnQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5jb250ZXh0Vmlld1NlcnZpY2UuaGlkZUNvbnRleHRWaWV3KHRydWUpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0cmV0dXJuIGNvbWJpbmVkRGlzcG9zYWJsZShtZW51RGlzcG9zYWJsZXMsIG1lbnUpO1xuXHRcdFx0fSxcblxuXHRcdFx0Zm9jdXM6ICgpID0+IHtcblx0XHRcdFx0bWVudT8uZm9jdXMoISFkZWxlZ2F0ZS5hdXRvU2VsZWN0Rmlyc3RJdGVtKTtcblx0XHRcdH0sXG5cblx0XHRcdG9uSGlkZTogKGRpZENhbmNlbD86IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0ZGVsZWdhdGUub25IaWRlPy4oISFkaWRDYW5jZWwpO1xuXG5cdFx0XHRcdGlmICh0aGlzLmJsb2NrKSB7XG5cdFx0XHRcdFx0dGhpcy5ibG9jay5yZW1vdmUoKTtcblx0XHRcdFx0XHR0aGlzLmJsb2NrID0gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuYmxvY2tEaXNwb3NhYmxlPy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuYmxvY2tEaXNwb3NhYmxlID0gbnVsbDtcblxuXHRcdFx0XHRpZiAoISF0aGlzLmxhc3RDb250YWluZXIgJiYgKGdldEFjdGl2ZUVsZW1lbnQoKSA9PT0gdGhpcy5sYXN0Q29udGFpbmVyIHx8IGlzQW5jZXN0b3IoZ2V0QWN0aXZlRWxlbWVudCgpLCB0aGlzLmxhc3RDb250YWluZXIpKSkge1xuXHRcdFx0XHRcdHRoaXMuZm9jdXNUb1JldHVybj8uZm9jdXMoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMubGFzdENvbnRhaW5lciA9IG51bGw7XG5cdFx0XHR9XG5cdFx0fSwgc2hhZG93Um9vdEVsZW1lbnQsICEhc2hhZG93Um9vdEVsZW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkFjdGlvblJ1bihlOiBJUnVuRXZlbnQsIGxvZ1RlbGVtZXRyeTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChsb2dUZWxlbWV0cnkpIHtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHsgaWQ6IGUuYWN0aW9uLmlkLCBmcm9tOiAnY29udGV4dE1lbnUnIH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLmhpZGVDb250ZXh0VmlldyhmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQWN0aW9uUnVuKGU6IElSdW5FdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLmVycm9yICYmICFpc0NhbmNlbGxhdGlvbkVycm9yKGUuZXJyb3IpKSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZS5lcnJvcik7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLEdBQUcsdUJBQXVCLFdBQVcsa0JBQWtCLFdBQVcsWUFBWSxxQkFBcUI7QUFDNUcsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsb0JBQW9HO0FBQzdHLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CLHVCQUFvQztBQUtqRSxTQUFTLHlCQUF5QjtBQU8zQixNQUFNLG1CQUFtQjtB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
