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
import { BrowserWindow } from "electron";
import { Event } from "../../../base/common/event.js";
import { isLinux, isMacintosh, isWindows } from "../../../base/common/platform.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { ILifecycleMainService } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import { IStateService } from "../../state/node/state.js";
import { hasNativeTitlebar, TitlebarStyle } from "../../window/common/window.js";
import { WindowMode } from "../../window/electron-main/window.js";
import { BaseWindow } from "../../windows/electron-main/windowImpl.js";
let AuxiliaryWindow = class extends BaseWindow {
  constructor(webContents, windowOptions, disableMaximize, environmentMainService, logService, configurationService, stateService, lifecycleMainService) {
    super(configurationService, stateService, environmentMainService, logService);
    this.webContents = webContents;
    this.windowOptions = windowOptions;
    this.disableMaximize = disableMaximize;
    this.lifecycleMainService = lifecycleMainService;
    this.parentId = -1;
    this.stateApplied = false;
    this.id = this.webContents.id;
    this.tryClaimWindow();
  }
  get win() {
    if (!super.win) {
      this.tryClaimWindow();
    }
    return super.win;
  }
  tryClaimWindow(options) {
    if (this._store.isDisposed || this.webContents.isDestroyed()) {
      return;
    }
    const effectiveOptions = options ?? this.windowOptions;
    this.doTryClaimWindow(effectiveOptions);
    if (effectiveOptions && !this.stateApplied) {
      this.stateApplied = true;
      this.applyState({
        x: effectiveOptions.x,
        y: effectiveOptions.y,
        width: effectiveOptions.width,
        height: effectiveOptions.height,
        // We currently do not support restoring fullscreen state for auxiliary
        // windows because we do not get hold of the original `features` string
        // that contains that info in `window-fullscreen`. However, we can
        // probe the `options.show` value for whether the window should be maximized
        // or not because we never show maximized windows initially to reduce flicker.
        mode: effectiveOptions.show === false ? WindowMode.Maximized : WindowMode.Normal
      });
    }
  }
  doTryClaimWindow(options) {
    if (this._win) {
      return;
    }
    const window = BrowserWindow.fromWebContents(this.webContents);
    if (window) {
      this.logService.trace("[aux window] Claimed browser window instance");
      this.setWin(window, options);
      window.setMenu(null);
      if ((isWindows || isLinux) && hasNativeTitlebar(
        this.configurationService,
        options?.titleBarStyle === "hidden" ? TitlebarStyle.CUSTOM : void 0
        /* unknown */
      )) {
        window.setAutoHideMenuBar(true);
      }
      this.lifecycleMainService.registerAuxWindow(this);
      if (options?.frame === false) {
        window.setMinimumSize(1, 1);
        if (isMacintosh) {
          window.setWindowButtonVisibility(false);
        }
      }
      if (options?.resizable === false) {
        window.setResizable(false);
      }
      if (this.disableMaximize) {
        this._register(Event.fromNodeEventEmitter(window, "maximize")(() => window.unmaximize()));
      }
    }
  }
  matches(webContents) {
    return this.webContents.id === webContents.id;
  }
};
AuxiliaryWindow = __decorateClass([
  __decorateParam(3, IEnvironmentMainService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IStateService),
  __decorateParam(7, ILifecycleMainService)
], AuxiliaryWindow);
export {
  AuxiliaryWindow
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYXV4aWxpYXJ5V2luZG93XFxlbGVjdHJvbi1tYWluXFxhdXhpbGlhcnlXaW5kb3cudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBCcm93c2VyV2luZG93LCBCcm93c2VyV2luZG93Q29uc3RydWN0b3JPcHRpb25zLCBXZWJDb250ZW50cyB9IGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9lbGVjdHJvbi1tYWluL2Vudmlyb25tZW50TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZU1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2VsZWN0cm9uLW1haW4vbGlmZWN5Y2xlTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc3RhdGUvbm9kZS9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBoYXNOYXRpdmVUaXRsZWJhciwgVGl0bGViYXJTdHlsZSB9IGZyb20gJy4uLy4uL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IElCYXNlV2luZG93LCBXaW5kb3dNb2RlIH0gZnJvbSAnLi4vLi4vd2luZG93L2VsZWN0cm9uLW1haW4vd2luZG93LmpzJztcbmltcG9ydCB7IEJhc2VXaW5kb3cgfSBmcm9tICcuLi8uLi93aW5kb3dzL2VsZWN0cm9uLW1haW4vd2luZG93SW1wbC5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUF1eGlsaWFyeVdpbmRvdyBleHRlbmRzIElCYXNlV2luZG93IHtcblx0cmVhZG9ubHkgcGFyZW50SWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIEF1eGlsaWFyeVdpbmRvdyBleHRlbmRzIEJhc2VXaW5kb3cgaW1wbGVtZW50cyBJQXV4aWxpYXJ5V2luZG93IHtcblxuXHRyZWFkb25seSBpZDogbnVtYmVyO1xuXHRwYXJlbnRJZCA9IC0xO1xuXG5cdG92ZXJyaWRlIGdldCB3aW4oKSB7XG5cdFx0aWYgKCFzdXBlci53aW4pIHtcblx0XHRcdHRoaXMudHJ5Q2xhaW1XaW5kb3coKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3VwZXIud2luO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0ZUFwcGxpZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdlYkNvbnRlbnRzOiBXZWJDb250ZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdpbmRvd09wdGlvbnM6IEJyb3dzZXJXaW5kb3dDb25zdHJ1Y3Rvck9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkaXNhYmxlTWF4aW1pemU6IGJvb2xlYW4sXG5cdFx0QElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIGVudmlyb25tZW50TWFpblNlcnZpY2U6IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElTdGF0ZVNlcnZpY2Ugc3RhdGVTZXJ2aWNlOiBJU3RhdGVTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVNYWluU2VydmljZTogSUxpZmVjeWNsZU1haW5TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBzdGF0ZVNlcnZpY2UsIGVudmlyb25tZW50TWFpblNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXG5cdFx0dGhpcy5pZCA9IHRoaXMud2ViQ29udGVudHMuaWQ7XG5cblx0XHQvLyBUcnkgdG8gY2xhaW0gd2luZG93XG5cdFx0dGhpcy50cnlDbGFpbVdpbmRvdygpO1xuXHR9XG5cblx0dHJ5Q2xhaW1XaW5kb3cob3B0aW9ucz86IEJyb3dzZXJXaW5kb3dDb25zdHJ1Y3Rvck9wdGlvbnMpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCB8fCB0aGlzLndlYkNvbnRlbnRzLmlzRGVzdHJveWVkKCkpIHtcblx0XHRcdHJldHVybjsgLy8gYWxyZWFkeSBkaXNwb3NlZFxuXHRcdH1cblxuXHRcdGNvbnN0IGVmZmVjdGl2ZU9wdGlvbnMgPSBvcHRpb25zID8/IHRoaXMud2luZG93T3B0aW9ucztcblxuXHRcdHRoaXMuZG9UcnlDbGFpbVdpbmRvdyhlZmZlY3RpdmVPcHRpb25zKTtcblxuXHRcdGlmIChlZmZlY3RpdmVPcHRpb25zICYmICF0aGlzLnN0YXRlQXBwbGllZCkge1xuXHRcdFx0dGhpcy5zdGF0ZUFwcGxpZWQgPSB0cnVlO1xuXG5cdFx0XHR0aGlzLmFwcGx5U3RhdGUoe1xuXHRcdFx0XHR4OiBlZmZlY3RpdmVPcHRpb25zLngsXG5cdFx0XHRcdHk6IGVmZmVjdGl2ZU9wdGlvbnMueSxcblx0XHRcdFx0d2lkdGg6IGVmZmVjdGl2ZU9wdGlvbnMud2lkdGgsXG5cdFx0XHRcdGhlaWdodDogZWZmZWN0aXZlT3B0aW9ucy5oZWlnaHQsXG5cdFx0XHRcdC8vIFdlIGN1cnJlbnRseSBkbyBub3Qgc3VwcG9ydCByZXN0b3JpbmcgZnVsbHNjcmVlbiBzdGF0ZSBmb3IgYXV4aWxpYXJ5XG5cdFx0XHRcdC8vIHdpbmRvd3MgYmVjYXVzZSB3ZSBkbyBub3QgZ2V0IGhvbGQgb2YgdGhlIG9yaWdpbmFsIGBmZWF0dXJlc2Agc3RyaW5nXG5cdFx0XHRcdC8vIHRoYXQgY29udGFpbnMgdGhhdCBpbmZvIGluIGB3aW5kb3ctZnVsbHNjcmVlbmAuIEhvd2V2ZXIsIHdlIGNhblxuXHRcdFx0XHQvLyBwcm9iZSB0aGUgYG9wdGlvbnMuc2hvd2AgdmFsdWUgZm9yIHdoZXRoZXIgdGhlIHdpbmRvdyBzaG91bGQgYmUgbWF4aW1pemVkXG5cdFx0XHRcdC8vIG9yIG5vdCBiZWNhdXNlIHdlIG5ldmVyIHNob3cgbWF4aW1pemVkIHdpbmRvd3MgaW5pdGlhbGx5IHRvIHJlZHVjZSBmbGlja2VyLlxuXHRcdFx0XHRtb2RlOiBlZmZlY3RpdmVPcHRpb25zLnNob3cgPT09IGZhbHNlID8gV2luZG93TW9kZS5NYXhpbWl6ZWQgOiBXaW5kb3dNb2RlLk5vcm1hbFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb1RyeUNsYWltV2luZG93KG9wdGlvbnM/OiBCcm93c2VyV2luZG93Q29uc3RydWN0b3JPcHRpb25zKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dpbikge1xuXHRcdFx0cmV0dXJuOyAvLyBhbHJlYWR5IGNsYWltZWRcblx0XHR9XG5cblx0XHRjb25zdCB3aW5kb3cgPSBCcm93c2VyV2luZG93LmZyb21XZWJDb250ZW50cyh0aGlzLndlYkNvbnRlbnRzKTtcblx0XHRpZiAod2luZG93KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1thdXggd2luZG93XSBDbGFpbWVkIGJyb3dzZXIgd2luZG93IGluc3RhbmNlJyk7XG5cblx0XHRcdC8vIFJlbWVtYmVyXG5cdFx0XHR0aGlzLnNldFdpbih3aW5kb3csIG9wdGlvbnMpO1xuXG5cdFx0XHQvLyBEaXNhYmxlIE1lbnVcblx0XHRcdHdpbmRvdy5zZXRNZW51KG51bGwpO1xuXHRcdFx0aWYgKChpc1dpbmRvd3MgfHwgaXNMaW51eCkgJiYgaGFzTmF0aXZlVGl0bGViYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgb3B0aW9ucz8udGl0bGVCYXJTdHlsZSA9PT0gJ2hpZGRlbicgPyBUaXRsZWJhclN0eWxlLkNVU1RPTSA6IHVuZGVmaW5lZCAvKiB1bmtub3duICovKSkge1xuXHRcdFx0XHR3aW5kb3cuc2V0QXV0b0hpZGVNZW51QmFyKHRydWUpOyAvLyBGaXggZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMDA2MTVcblx0XHRcdH1cblxuXHRcdFx0Ly8gTGlmZWN5Y2xlXG5cdFx0XHR0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLnJlZ2lzdGVyQXV4V2luZG93KHRoaXMpO1xuXG5cdFx0XHQvLyBBbGxvdyBmcmFtZWxlc3Mgd2luZG93cyB0byBzaXplIGRvd24gdG8gdGhlaXIgY29udGVudFxuXHRcdFx0aWYgKG9wdGlvbnM/LmZyYW1lID09PSBmYWxzZSkge1xuXHRcdFx0XHR3aW5kb3cuc2V0TWluaW11bVNpemUoMSwgMSk7XG5cblx0XHRcdFx0Ly8gSGlkZSBtYWNPUyB0cmFmZmljIGxpZ2h0IGJ1dHRvbnNcblx0XHRcdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRcdFx0d2luZG93LnNldFdpbmRvd0J1dHRvblZpc2liaWxpdHkoZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIERpc2FibGUgcmVzaXppbmcgZm9yIG5vbi1yZXNpemFibGUgd2luZG93c1xuXHRcdFx0aWYgKG9wdGlvbnM/LnJlc2l6YWJsZSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0d2luZG93LnNldFJlc2l6YWJsZShmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmRpc2FibGVNYXhpbWl6ZSkge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcih3aW5kb3csICdtYXhpbWl6ZScpKCgpID0+IHdpbmRvdy51bm1heGltaXplKCkpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRtYXRjaGVzKHdlYkNvbnRlbnRzOiBXZWJDb250ZW50cyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLndlYkNvbnRlbnRzLmlkID09PSB3ZWJDb250ZW50cy5pZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHFCQUFtRTtBQUM1RSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxTQUFTLGFBQWEsaUJBQWlCO0FBQ2hELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsbUJBQW1CLHFCQUFxQjtBQUNqRCxTQUFzQixrQkFBa0I7QUFDeEMsU0FBUyxrQkFBa0I7QUFNcEIsSUFBTSxrQkFBTixjQUE4QixXQUF1QztBQUFBLEVBZTNFLFlBQ2tCLGFBQ0EsZUFDQSxpQkFDUSx3QkFDWixZQUNVLHNCQUNSLGNBQ3lCLHNCQUN2QztBQUNELFVBQU0sc0JBQXNCLGNBQWMsd0JBQXdCLFVBQVU7QUFUM0Q7QUFDQTtBQUNBO0FBS3VCO0FBcEJ6QyxvQkFBVztBQVVYLFNBQVEsZUFBZTtBQWN0QixTQUFLLEtBQUssS0FBSyxZQUFZO0FBRzNCLFNBQUssZUFBZTtBQUFBLEVBQ3JCO0FBQUEsRUExQkEsSUFBYSxNQUFNO0FBQ2xCLFFBQUksQ0FBQyxNQUFNLEtBQUs7QUFDZixXQUFLLGVBQWU7QUFBQSxJQUNyQjtBQUVBLFdBQU8sTUFBTTtBQUFBLEVBQ2Q7QUFBQSxFQXNCQSxlQUFlLFNBQWlEO0FBQy9ELFFBQUksS0FBSyxPQUFPLGNBQWMsS0FBSyxZQUFZLFlBQVksR0FBRztBQUM3RDtBQUFBLElBQ0Q7QUFFQSxVQUFNLG1CQUFtQixXQUFXLEtBQUs7QUFFekMsU0FBSyxpQkFBaUIsZ0JBQWdCO0FBRXRDLFFBQUksb0JBQW9CLENBQUMsS0FBSyxjQUFjO0FBQzNDLFdBQUssZUFBZTtBQUVwQixXQUFLLFdBQVc7QUFBQSxRQUNmLEdBQUcsaUJBQWlCO0FBQUEsUUFDcEIsR0FBRyxpQkFBaUI7QUFBQSxRQUNwQixPQUFPLGlCQUFpQjtBQUFBLFFBQ3hCLFFBQVEsaUJBQWlCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFFBTXpCLE1BQU0saUJBQWlCLFNBQVMsUUFBUSxXQUFXLFlBQVksV0FBVztBQUFBLE1BQzNFLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRVEsaUJBQWlCLFNBQWlEO0FBQ3pFLFFBQUksS0FBSyxNQUFNO0FBQ2Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUFTLGNBQWMsZ0JBQWdCLEtBQUssV0FBVztBQUM3RCxRQUFJLFFBQVE7QUFDWCxXQUFLLFdBQVcsTUFBTSw4Q0FBOEM7QUFHcEUsV0FBSyxPQUFPLFFBQVEsT0FBTztBQUczQixhQUFPLFFBQVEsSUFBSTtBQUNuQixXQUFLLGFBQWEsWUFBWTtBQUFBLFFBQWtCLEtBQUs7QUFBQSxRQUFzQixTQUFTLGtCQUFrQixXQUFXLGNBQWMsU0FBUztBQUFBO0FBQUEsTUFBdUIsR0FBRztBQUNqSyxlQUFPLG1CQUFtQixJQUFJO0FBQUEsTUFDL0I7QUFHQSxXQUFLLHFCQUFxQixrQkFBa0IsSUFBSTtBQUdoRCxVQUFJLFNBQVMsVUFBVSxPQUFPO0FBQzdCLGVBQU8sZUFBZSxHQUFHLENBQUM7QUFHMUIsWUFBSSxhQUFhO0FBQ2hCLGlCQUFPLDBCQUEwQixLQUFLO0FBQUEsUUFDdkM7QUFBQSxNQUNEO0FBR0EsVUFBSSxTQUFTLGNBQWMsT0FBTztBQUNqQyxlQUFPLGFBQWEsS0FBSztBQUFBLE1BQzFCO0FBRUEsVUFBSSxLQUFLLGlCQUFpQjtBQUN6QixhQUFLLFVBQVUsTUFBTSxxQkFBcUIsUUFBUSxVQUFVLEVBQUUsTUFBTSxPQUFPLFdBQVcsQ0FBQyxDQUFDO0FBQUEsTUFDekY7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsUUFBUSxhQUFtQztBQUMxQyxXQUFPLEtBQUssWUFBWSxPQUFPLFlBQVk7QUFBQSxFQUM1QztBQUNEO0FBekdhLGtCQUFOO0FBQUEsRUFtQko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F2QlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
