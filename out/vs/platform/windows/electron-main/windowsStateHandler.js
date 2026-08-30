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
import electron from "electron";
import { Disposable } from "../../../base/common/lifecycle.js";
import { isMacintosh } from "../../../base/common/platform.js";
import { extUriBiasedIgnorePathCase } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { ILifecycleMainService } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import { IStateService } from "../../state/node/state.js";
import { IWindowsMainService } from "./windows.js";
import { defaultWindowState, WindowMode } from "../../window/electron-main/window.js";
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from "../../workspace/common/workspace.js";
let WindowsStateHandler = class extends Disposable {
  constructor(windowsMainService, stateService, lifecycleMainService, logService, configurationService) {
    super();
    this.windowsMainService = windowsMainService;
    this.stateService = stateService;
    this.lifecycleMainService = lifecycleMainService;
    this.logService = logService;
    this.configurationService = configurationService;
    this.lastClosedState = void 0;
    this.shuttingDown = false;
    this._state = restoreWindowsState(this.stateService.getItem(WindowsStateHandler.windowsStateStorageKey));
    this.registerListeners();
  }
  get state() {
    return this._state;
  }
  registerListeners() {
    electron.app.on("browser-window-blur", () => {
      if (!this.shuttingDown) {
        this.saveWindowsState();
      }
    });
    this._register(this.lifecycleMainService.onBeforeCloseWindow((window) => this.onBeforeCloseWindow(window)));
    this._register(this.lifecycleMainService.onBeforeShutdown(() => this.onBeforeShutdown()));
    this._register(this.windowsMainService.onDidChangeWindowsCount((e) => {
      if (e.newCount - e.oldCount > 0) {
        this.lastClosedState = void 0;
      }
    }));
    this._register(this.windowsMainService.onDidDestroyWindow((window) => this.onBeforeCloseWindow(window)));
  }
  // Note that onBeforeShutdown() and onBeforeCloseWindow() are fired in different order depending on the OS:
  // - macOS: since the app will not quit when closing the last window, you will always first get
  //          the onBeforeShutdown() event followed by N onBeforeCloseWindow() events for each window
  // - other: on other OS, closing the last window will quit the app so the order depends on the
  //          user interaction: closing the last window will first trigger onBeforeCloseWindow()
  //          and then onBeforeShutdown(). Using the quit action however will first issue onBeforeShutdown()
  //          and then onBeforeCloseWindow().
  //
  // Here is the behavior on different OS depending on action taken (Electron 1.7.x):
  //
  // Legend
  // -  quit(N): quit application with N windows opened
  // - close(1): close one window via the window close button
  // - closeAll: close all windows via the taskbar command
  // - onBeforeShutdown(N): number of windows reported in this event handler
  // - onBeforeCloseWindow(N, M): number of windows reported and quitRequested boolean in this event handler
  //
  // macOS
  // 	-     quit(1): onBeforeShutdown(1), onBeforeCloseWindow(1, true)
  // 	-     quit(2): onBeforeShutdown(2), onBeforeCloseWindow(2, true), onBeforeCloseWindow(2, true)
  // 	-     quit(0): onBeforeShutdown(0)
  // 	-    close(1): onBeforeCloseWindow(1, false)
  //
  // Windows
  // 	-     quit(1): onBeforeShutdown(1), onBeforeCloseWindow(1, true)
  // 	-     quit(2): onBeforeShutdown(2), onBeforeCloseWindow(2, true), onBeforeCloseWindow(2, true)
  // 	-    close(1): onBeforeCloseWindow(2, false)[not last window]
  // 	-    close(1): onBeforeCloseWindow(1, false), onBeforeShutdown(0)[last window]
  // 	- closeAll(2): onBeforeCloseWindow(2, false), onBeforeCloseWindow(2, false), onBeforeShutdown(0)
  //
  // Linux
  // 	-     quit(1): onBeforeShutdown(1), onBeforeCloseWindow(1, true)
  // 	-     quit(2): onBeforeShutdown(2), onBeforeCloseWindow(2, true), onBeforeCloseWindow(2, true)
  // 	-    close(1): onBeforeCloseWindow(2, false)[not last window]
  // 	-    close(1): onBeforeCloseWindow(1, false), onBeforeShutdown(0)[last window]
  // 	- closeAll(2): onBeforeCloseWindow(2, false), onBeforeCloseWindow(2, false), onBeforeShutdown(0)
  //
  onBeforeShutdown() {
    this.shuttingDown = true;
    this.saveWindowsState();
  }
  saveWindowsState() {
    const displaysWithFullScreenWindow = /* @__PURE__ */ new Set();
    const currentWindowsState = {
      openedWindows: [],
      lastPluginDevelopmentHostWindow: this._state.lastPluginDevelopmentHostWindow,
      lastActiveWindow: this.lastClosedState
    };
    if (!currentWindowsState.lastActiveWindow) {
      let activeWindow = this.windowsMainService.getLastActiveWindow();
      if (!activeWindow || activeWindow.isExtensionDevelopmentHost) {
        activeWindow = this.windowsMainService.getWindows().find((window) => !window.isExtensionDevelopmentHost);
      }
      if (activeWindow) {
        currentWindowsState.lastActiveWindow = this.toWindowState(activeWindow);
        if (currentWindowsState.lastActiveWindow.uiState.mode === WindowMode.Fullscreen) {
          displaysWithFullScreenWindow.add(currentWindowsState.lastActiveWindow.uiState.display);
        }
      }
    }
    const extensionHostWindow = this.windowsMainService.getWindows().find((window) => window.isExtensionDevelopmentHost && !window.isExtensionTestHost);
    if (extensionHostWindow) {
      currentWindowsState.lastPluginDevelopmentHostWindow = this.toWindowState(extensionHostWindow);
      if (currentWindowsState.lastPluginDevelopmentHostWindow.uiState.mode === WindowMode.Fullscreen) {
        if (displaysWithFullScreenWindow.has(currentWindowsState.lastPluginDevelopmentHostWindow.uiState.display)) {
          if (isMacintosh && !extensionHostWindow.win?.isSimpleFullScreen()) {
            currentWindowsState.lastPluginDevelopmentHostWindow.uiState.mode = WindowMode.Normal;
          }
        } else {
          displaysWithFullScreenWindow.add(currentWindowsState.lastPluginDevelopmentHostWindow.uiState.display);
        }
      }
    }
    if (this.windowsMainService.getWindowCount() > 1) {
      currentWindowsState.openedWindows = this.windowsMainService.getWindows().filter((window) => !window.isExtensionDevelopmentHost).map((window) => {
        const windowState = this.toWindowState(window);
        if (windowState.uiState.mode === WindowMode.Fullscreen) {
          if (displaysWithFullScreenWindow.has(windowState.uiState.display)) {
            if (isMacintosh && windowState.windowId !== currentWindowsState.lastActiveWindow?.windowId && !window.win?.isSimpleFullScreen()) {
              windowState.uiState.mode = WindowMode.Normal;
            }
          } else {
            displaysWithFullScreenWindow.add(windowState.uiState.display);
          }
        }
        return windowState;
      });
    }
    const state = getWindowsStateStoreData(currentWindowsState);
    this.stateService.setItem(WindowsStateHandler.windowsStateStorageKey, state);
    if (this.shuttingDown) {
      this.logService.trace("[WindowsStateHandler] onBeforeShutdown", state);
    }
  }
  // See note on #onBeforeShutdown() for details how these events are flowing
  onBeforeCloseWindow(window) {
    if (this.lifecycleMainService.quitRequested) {
      return;
    }
    const state = this.toWindowState(window);
    if (window.isExtensionDevelopmentHost && !window.isExtensionTestHost) {
      this._state.lastPluginDevelopmentHostWindow = state;
    } else if (!window.isExtensionDevelopmentHost && window.openedWorkspace) {
      this._state.openedWindows.forEach((openedWindow) => {
        const sameWorkspace = isWorkspaceIdentifier(window.openedWorkspace) && openedWindow.workspace?.id === window.openedWorkspace.id;
        const sameFolder = isSingleFolderWorkspaceIdentifier(window.openedWorkspace) && openedWindow.folderUri && extUriBiasedIgnorePathCase.isEqual(openedWindow.folderUri, window.openedWorkspace.uri);
        if (sameWorkspace || sameFolder) {
          openedWindow.uiState = state.uiState;
        }
      });
    }
    if (this.windowsMainService.getWindowCount() === 1) {
      this.lastClosedState = state;
    }
  }
  toWindowState(window) {
    return {
      windowId: window.id,
      workspace: isWorkspaceIdentifier(window.openedWorkspace) ? window.openedWorkspace : void 0,
      folderUri: isSingleFolderWorkspaceIdentifier(window.openedWorkspace) ? window.openedWorkspace.uri : void 0,
      backupPath: window.backupPath,
      remoteAuthority: window.remoteAuthority,
      uiState: window.serializeWindowState()
    };
  }
  getNewWindowState(configuration) {
    const state = this.doGetNewWindowState(configuration);
    const windowConfig = this.configurationService.getValue("window");
    if (state.mode === WindowMode.Fullscreen) {
      let allowFullscreen;
      if (state.hasDefaultState) {
        allowFullscreen = !!(windowConfig?.newWindowDimensions && ["fullscreen", "inherit", "offset"].indexOf(windowConfig.newWindowDimensions) >= 0);
      } else {
        allowFullscreen = !!(this.lifecycleMainService.wasRestarted || windowConfig?.restoreFullscreen);
      }
      if (!allowFullscreen) {
        state.mode = WindowMode.Normal;
      }
    }
    return state;
  }
  doGetNewWindowState(configuration) {
    const lastActive = this.windowsMainService.getLastActiveWindow();
    if (!configuration.extensionTestsPath) {
      if (!!configuration.extensionDevelopmentPath && this.state.lastPluginDevelopmentHostWindow) {
        return this.state.lastPluginDevelopmentHostWindow.uiState;
      }
      const workspace = configuration.workspace;
      if (isWorkspaceIdentifier(workspace)) {
        const stateForWorkspace = this.state.openedWindows.filter((openedWindow) => openedWindow.workspace && openedWindow.workspace.id === workspace.id).map((openedWindow) => openedWindow.uiState);
        if (stateForWorkspace.length) {
          return stateForWorkspace[0];
        }
      }
      if (isSingleFolderWorkspaceIdentifier(workspace)) {
        const stateForFolder = this.state.openedWindows.filter((openedWindow) => openedWindow.folderUri && extUriBiasedIgnorePathCase.isEqual(openedWindow.folderUri, workspace.uri)).map((openedWindow) => openedWindow.uiState);
        if (stateForFolder.length) {
          return stateForFolder[0];
        }
      } else if (configuration.backupPath) {
        const stateForEmptyWindow = this.state.openedWindows.filter((openedWindow) => openedWindow.backupPath === configuration.backupPath).map((openedWindow) => openedWindow.uiState);
        if (stateForEmptyWindow.length) {
          return stateForEmptyWindow[0];
        }
      }
      const lastActiveState = this.lastClosedState || this.state.lastActiveWindow;
      if (!lastActive && lastActiveState) {
        return lastActiveState.uiState;
      }
    }
    let displayToUse;
    const displays = electron.screen.getAllDisplays();
    if (displays.length === 1) {
      displayToUse = displays[0];
    } else {
      if (isMacintosh) {
        const cursorPoint = electron.screen.getCursorScreenPoint();
        displayToUse = electron.screen.getDisplayNearestPoint(cursorPoint);
      }
      if (!displayToUse && lastActive) {
        displayToUse = electron.screen.getDisplayMatching(lastActive.getBounds());
      }
      if (!displayToUse) {
        displayToUse = electron.screen.getPrimaryDisplay() || displays[0];
      }
    }
    let state = defaultWindowState(void 0, isWorkspaceIdentifier(configuration.workspace) || isSingleFolderWorkspaceIdentifier(configuration.workspace));
    state.x = Math.round(displayToUse.bounds.x + displayToUse.bounds.width / 2 - state.width / 2);
    state.y = Math.round(displayToUse.bounds.y + displayToUse.bounds.height / 2 - state.height / 2);
    const windowConfig = this.configurationService.getValue("window");
    let ensureNoOverlap = true;
    if (windowConfig?.newWindowDimensions) {
      if (windowConfig.newWindowDimensions === "maximized") {
        state.mode = WindowMode.Maximized;
        ensureNoOverlap = false;
      } else if (windowConfig.newWindowDimensions === "fullscreen") {
        state.mode = WindowMode.Fullscreen;
        ensureNoOverlap = false;
      } else if ((windowConfig.newWindowDimensions === "inherit" || windowConfig.newWindowDimensions === "offset") && lastActive) {
        const lastActiveState = lastActive.serializeWindowState();
        if (lastActiveState.mode === WindowMode.Fullscreen) {
          state.mode = WindowMode.Fullscreen;
        } else {
          state = {
            ...lastActiveState,
            zoomLevel: void 0
            // do not inherit zoom level
          };
        }
        ensureNoOverlap = state.mode !== WindowMode.Fullscreen && windowConfig.newWindowDimensions === "offset";
      }
    }
    if (ensureNoOverlap) {
      state = this.ensureNoOverlap(state);
    }
    state.hasDefaultState = true;
    return state;
  }
  ensureNoOverlap(state) {
    if (this.windowsMainService.getWindows().length === 0) {
      return state;
    }
    state.x = typeof state.x === "number" ? state.x : 0;
    state.y = typeof state.y === "number" ? state.y : 0;
    const existingWindowBounds = this.windowsMainService.getWindows().map((window) => window.getBounds());
    while (existingWindowBounds.some((bounds) => bounds.x === state.x || bounds.y === state.y)) {
      state.x += 30;
      state.y += 30;
    }
    return state;
  }
};
WindowsStateHandler.windowsStateStorageKey = "windowsState";
WindowsStateHandler = __decorateClass([
  __decorateParam(0, IWindowsMainService),
  __decorateParam(1, IStateService),
  __decorateParam(2, ILifecycleMainService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IConfigurationService)
], WindowsStateHandler);
function restoreWindowsState(data) {
  const result = { openedWindows: [] };
  const windowsState = data || { openedWindows: [] };
  if (windowsState.lastActiveWindow) {
    result.lastActiveWindow = restoreWindowState(windowsState.lastActiveWindow);
  }
  if (windowsState.lastPluginDevelopmentHostWindow) {
    result.lastPluginDevelopmentHostWindow = restoreWindowState(windowsState.lastPluginDevelopmentHostWindow);
  }
  if (Array.isArray(windowsState.openedWindows)) {
    result.openedWindows = windowsState.openedWindows.map((windowState) => restoreWindowState(windowState));
  }
  return result;
}
function restoreWindowState(windowState) {
  const result = { uiState: windowState.uiState };
  if (windowState.backupPath) {
    result.backupPath = windowState.backupPath;
  }
  if (windowState.remoteAuthority) {
    result.remoteAuthority = windowState.remoteAuthority;
  }
  if (windowState.folder) {
    result.folderUri = URI.parse(windowState.folder);
  }
  if (windowState.workspaceIdentifier) {
    result.workspace = { id: windowState.workspaceIdentifier.id, configPath: URI.parse(windowState.workspaceIdentifier.configURIPath) };
  }
  return result;
}
function getWindowsStateStoreData(windowsState) {
  return {
    lastActiveWindow: windowsState.lastActiveWindow && serializeWindowState(windowsState.lastActiveWindow),
    lastPluginDevelopmentHostWindow: windowsState.lastPluginDevelopmentHostWindow && serializeWindowState(windowsState.lastPluginDevelopmentHostWindow),
    openedWindows: windowsState.openedWindows.map((ws) => serializeWindowState(ws))
  };
}
function serializeWindowState(windowState) {
  return {
    workspaceIdentifier: windowState.workspace && { id: windowState.workspace.id, configURIPath: windowState.workspace.configPath.toString() },
    folder: windowState.folderUri?.toString(),
    backupPath: windowState.backupPath,
    remoteAuthority: windowState.remoteAuthority,
    uiState: windowState.uiState
  };
}
export {
  WindowsStateHandler,
  getWindowsStateStoreData,
  restoreWindowsState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcd2luZG93c1xcZWxlY3Ryb24tbWFpblxcd2luZG93c1N0YXRlSGFuZGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBlbGVjdHJvbiBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZU1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2VsZWN0cm9uLW1haW4vbGlmZWN5Y2xlTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc3RhdGUvbm9kZS9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlV2luZG93Q29uZmlndXJhdGlvbiwgSVdpbmRvd1NldHRpbmdzIH0gZnJvbSAnLi4vLi4vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSVdpbmRvd3NNYWluU2VydmljZSB9IGZyb20gJy4vd2luZG93cy5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0V2luZG93U3RhdGUsIElDb2RlV2luZG93LCBJV2luZG93U3RhdGUgYXMgSVdpbmRvd1VJU3RhdGUsIFdpbmRvd01vZGUgfSBmcm9tICcuLi8uLi93aW5kb3cvZWxlY3Ryb24tbWFpbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyLCBpc1dvcmtzcGFjZUlkZW50aWZpZXIsIElXb3Jrc3BhY2VJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElXaW5kb3dTdGF0ZSB7XG5cdHJlYWRvbmx5IHdpbmRvd0lkPzogbnVtYmVyO1xuXHR3b3Jrc3BhY2U/OiBJV29ya3NwYWNlSWRlbnRpZmllcjtcblx0Zm9sZGVyVXJpPzogVVJJO1xuXHRiYWNrdXBQYXRoPzogc3RyaW5nO1xuXHRyZW1vdGVBdXRob3JpdHk/OiBzdHJpbmc7XG5cdHVpU3RhdGU6IElXaW5kb3dVSVN0YXRlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXaW5kb3dzU3RhdGUge1xuXHRsYXN0QWN0aXZlV2luZG93PzogSVdpbmRvd1N0YXRlO1xuXHRsYXN0UGx1Z2luRGV2ZWxvcG1lbnRIb3N0V2luZG93PzogSVdpbmRvd1N0YXRlO1xuXHRvcGVuZWRXaW5kb3dzOiBJV2luZG93U3RhdGVbXTtcbn1cblxuaW50ZXJmYWNlIElOZXdXaW5kb3dTdGF0ZSBleHRlbmRzIElXaW5kb3dVSVN0YXRlIHtcblx0aGFzRGVmYXVsdFN0YXRlPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElTZXJpYWxpemVkV2luZG93c1N0YXRlIHtcblx0cmVhZG9ubHkgbGFzdEFjdGl2ZVdpbmRvdz86IElTZXJpYWxpemVkV2luZG93U3RhdGU7XG5cdHJlYWRvbmx5IGxhc3RQbHVnaW5EZXZlbG9wbWVudEhvc3RXaW5kb3c/OiBJU2VyaWFsaXplZFdpbmRvd1N0YXRlO1xuXHRyZWFkb25seSBvcGVuZWRXaW5kb3dzOiBJU2VyaWFsaXplZFdpbmRvd1N0YXRlW107XG59XG5cbmludGVyZmFjZSBJU2VyaWFsaXplZFdpbmRvd1N0YXRlIHtcblx0cmVhZG9ubHkgd29ya3NwYWNlSWRlbnRpZmllcj86IHsgaWQ6IHN0cmluZzsgY29uZmlnVVJJUGF0aDogc3RyaW5nIH07XG5cdHJlYWRvbmx5IGZvbGRlcj86IHN0cmluZztcblx0cmVhZG9ubHkgYmFja3VwUGF0aD86IHN0cmluZztcblx0cmVhZG9ubHkgcmVtb3RlQXV0aG9yaXR5Pzogc3RyaW5nO1xuXHRyZWFkb25seSB1aVN0YXRlOiBJV2luZG93VUlTdGF0ZTtcbn1cblxuZXhwb3J0IGNsYXNzIFdpbmRvd3NTdGF0ZUhhbmRsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSB3aW5kb3dzU3RhdGVTdG9yYWdlS2V5ID0gJ3dpbmRvd3NTdGF0ZSc7XG5cblx0Z2V0IHN0YXRlKCkgeyByZXR1cm4gdGhpcy5fc3RhdGU7IH1cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGU6IElXaW5kb3dzU3RhdGU7XG5cblx0cHJpdmF0ZSBsYXN0Q2xvc2VkU3RhdGU6IElXaW5kb3dTdGF0ZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHNodXR0aW5nRG93biA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV2luZG93c01haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd2luZG93c01haW5TZXJ2aWNlOiBJV2luZG93c01haW5TZXJ2aWNlLFxuXHRcdEBJU3RhdGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RhdGVTZXJ2aWNlOiBJU3RhdGVTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVNYWluU2VydmljZTogSUxpZmVjeWNsZU1haW5TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9zdGF0ZSA9IHJlc3RvcmVXaW5kb3dzU3RhdGUodGhpcy5zdGF0ZVNlcnZpY2UuZ2V0SXRlbTxJU2VyaWFsaXplZFdpbmRvd3NTdGF0ZT4oV2luZG93c1N0YXRlSGFuZGxlci53aW5kb3dzU3RhdGVTdG9yYWdlS2V5KSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXG5cdFx0Ly8gV2hlbiBhIHdpbmRvdyBsb29zZXMgZm9jdXMsIHNhdmUgYWxsIHdpbmRvd3Mgc3RhdGUuIFRoaXMgYWxsb3dzIHRvXG5cdFx0Ly8gcHJldmVudCBsb3NzIG9mIHdpbmRvdy1zdGF0ZSBkYXRhIHdoZW4gT1MgaXMgcmVzdGFydGVkIHdpdGhvdXQgcHJvcGVybHlcblx0XHQvLyBzaHV0dGluZyBkb3duIHRoZSBhcHBsaWNhdGlvbiAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzg3MTcxKVxuXHRcdGVsZWN0cm9uLmFwcC5vbignYnJvd3Nlci13aW5kb3ctYmx1cicsICgpID0+IHtcblx0XHRcdGlmICghdGhpcy5zaHV0dGluZ0Rvd24pIHtcblx0XHRcdFx0dGhpcy5zYXZlV2luZG93c1N0YXRlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBIYW5kbGUgdmFyaW91cyBsaWZlY3ljbGUgZXZlbnRzIGFyb3VuZCB3aW5kb3dzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saWZlY3ljbGVNYWluU2VydmljZS5vbkJlZm9yZUNsb3NlV2luZG93KHdpbmRvdyA9PiB0aGlzLm9uQmVmb3JlQ2xvc2VXaW5kb3cod2luZG93KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2Uub25CZWZvcmVTaHV0ZG93bigoKSA9PiB0aGlzLm9uQmVmb3JlU2h1dGRvd24oKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud2luZG93c01haW5TZXJ2aWNlLm9uRGlkQ2hhbmdlV2luZG93c0NvdW50KGUgPT4ge1xuXHRcdFx0aWYgKGUubmV3Q291bnQgLSBlLm9sZENvdW50ID4gMCkge1xuXHRcdFx0XHQvLyBjbGVhciBsYXN0IGNsb3NlZCB3aW5kb3cgc3RhdGUgd2hlbiBhIG5ldyB3aW5kb3cgb3BlbnMuIHRoaXMgaGVscHMgb24gbWFjT1Mgd2hlcmVcblx0XHRcdFx0Ly8gb3RoZXJ3aXNlIGNsb3NpbmcgdGhlIGxhc3Qgd2luZG93LCBvcGVuaW5nIGEgbmV3IHdpbmRvdyBhbmQgdGhlbiBxdWl0dGluZyB3b3VsZFxuXHRcdFx0XHQvLyB1c2UgdGhlIHN0YXRlIG9mIHRoZSBwcmV2aW91c2x5IGNsb3NlZCB3aW5kb3cgd2hlbiByZXN0YXJ0aW5nLlxuXHRcdFx0XHR0aGlzLmxhc3RDbG9zZWRTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyB0cnkgdG8gc2F2ZSBzdGF0ZSBiZWZvcmUgZGVzdHJveSBiZWNhdXNlIGNsb3NlIHdpbGwgbm90IGZpcmVcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndpbmRvd3NNYWluU2VydmljZS5vbkRpZERlc3Ryb3lXaW5kb3cod2luZG93ID0+IHRoaXMub25CZWZvcmVDbG9zZVdpbmRvdyh3aW5kb3cpKSk7XG5cdH1cblxuXHQvLyBOb3RlIHRoYXQgb25CZWZvcmVTaHV0ZG93bigpIGFuZCBvbkJlZm9yZUNsb3NlV2luZG93KCkgYXJlIGZpcmVkIGluIGRpZmZlcmVudCBvcmRlciBkZXBlbmRpbmcgb24gdGhlIE9TOlxuXHQvLyAtIG1hY09TOiBzaW5jZSB0aGUgYXBwIHdpbGwgbm90IHF1aXQgd2hlbiBjbG9zaW5nIHRoZSBsYXN0IHdpbmRvdywgeW91IHdpbGwgYWx3YXlzIGZpcnN0IGdldFxuXHQvLyAgICAgICAgICB0aGUgb25CZWZvcmVTaHV0ZG93bigpIGV2ZW50IGZvbGxvd2VkIGJ5IE4gb25CZWZvcmVDbG9zZVdpbmRvdygpIGV2ZW50cyBmb3IgZWFjaCB3aW5kb3dcblx0Ly8gLSBvdGhlcjogb24gb3RoZXIgT1MsIGNsb3NpbmcgdGhlIGxhc3Qgd2luZG93IHdpbGwgcXVpdCB0aGUgYXBwIHNvIHRoZSBvcmRlciBkZXBlbmRzIG9uIHRoZVxuXHQvLyAgICAgICAgICB1c2VyIGludGVyYWN0aW9uOiBjbG9zaW5nIHRoZSBsYXN0IHdpbmRvdyB3aWxsIGZpcnN0IHRyaWdnZXIgb25CZWZvcmVDbG9zZVdpbmRvdygpXG5cdC8vICAgICAgICAgIGFuZCB0aGVuIG9uQmVmb3JlU2h1dGRvd24oKS4gVXNpbmcgdGhlIHF1aXQgYWN0aW9uIGhvd2V2ZXIgd2lsbCBmaXJzdCBpc3N1ZSBvbkJlZm9yZVNodXRkb3duKClcblx0Ly8gICAgICAgICAgYW5kIHRoZW4gb25CZWZvcmVDbG9zZVdpbmRvdygpLlxuXHQvL1xuXHQvLyBIZXJlIGlzIHRoZSBiZWhhdmlvciBvbiBkaWZmZXJlbnQgT1MgZGVwZW5kaW5nIG9uIGFjdGlvbiB0YWtlbiAoRWxlY3Ryb24gMS43LngpOlxuXHQvL1xuXHQvLyBMZWdlbmRcblx0Ly8gLSAgcXVpdChOKTogcXVpdCBhcHBsaWNhdGlvbiB3aXRoIE4gd2luZG93cyBvcGVuZWRcblx0Ly8gLSBjbG9zZSgxKTogY2xvc2Ugb25lIHdpbmRvdyB2aWEgdGhlIHdpbmRvdyBjbG9zZSBidXR0b25cblx0Ly8gLSBjbG9zZUFsbDogY2xvc2UgYWxsIHdpbmRvd3MgdmlhIHRoZSB0YXNrYmFyIGNvbW1hbmRcblx0Ly8gLSBvbkJlZm9yZVNodXRkb3duKE4pOiBudW1iZXIgb2Ygd2luZG93cyByZXBvcnRlZCBpbiB0aGlzIGV2ZW50IGhhbmRsZXJcblx0Ly8gLSBvbkJlZm9yZUNsb3NlV2luZG93KE4sIE0pOiBudW1iZXIgb2Ygd2luZG93cyByZXBvcnRlZCBhbmQgcXVpdFJlcXVlc3RlZCBib29sZWFuIGluIHRoaXMgZXZlbnQgaGFuZGxlclxuXHQvL1xuXHQvLyBtYWNPU1xuXHQvLyBcdC0gICAgIHF1aXQoMSk6IG9uQmVmb3JlU2h1dGRvd24oMSksIG9uQmVmb3JlQ2xvc2VXaW5kb3coMSwgdHJ1ZSlcblx0Ly8gXHQtICAgICBxdWl0KDIpOiBvbkJlZm9yZVNodXRkb3duKDIpLCBvbkJlZm9yZUNsb3NlV2luZG93KDIsIHRydWUpLCBvbkJlZm9yZUNsb3NlV2luZG93KDIsIHRydWUpXG5cdC8vIFx0LSAgICAgcXVpdCgwKTogb25CZWZvcmVTaHV0ZG93bigwKVxuXHQvLyBcdC0gICAgY2xvc2UoMSk6IG9uQmVmb3JlQ2xvc2VXaW5kb3coMSwgZmFsc2UpXG5cdC8vXG5cdC8vIFdpbmRvd3Ncblx0Ly8gXHQtICAgICBxdWl0KDEpOiBvbkJlZm9yZVNodXRkb3duKDEpLCBvbkJlZm9yZUNsb3NlV2luZG93KDEsIHRydWUpXG5cdC8vIFx0LSAgICAgcXVpdCgyKTogb25CZWZvcmVTaHV0ZG93bigyKSwgb25CZWZvcmVDbG9zZVdpbmRvdygyLCB0cnVlKSwgb25CZWZvcmVDbG9zZVdpbmRvdygyLCB0cnVlKVxuXHQvLyBcdC0gICAgY2xvc2UoMSk6IG9uQmVmb3JlQ2xvc2VXaW5kb3coMiwgZmFsc2UpW25vdCBsYXN0IHdpbmRvd11cblx0Ly8gXHQtICAgIGNsb3NlKDEpOiBvbkJlZm9yZUNsb3NlV2luZG93KDEsIGZhbHNlKSwgb25CZWZvcmVTaHV0ZG93bigwKVtsYXN0IHdpbmRvd11cblx0Ly8gXHQtIGNsb3NlQWxsKDIpOiBvbkJlZm9yZUNsb3NlV2luZG93KDIsIGZhbHNlKSwgb25CZWZvcmVDbG9zZVdpbmRvdygyLCBmYWxzZSksIG9uQmVmb3JlU2h1dGRvd24oMClcblx0Ly9cblx0Ly8gTGludXhcblx0Ly8gXHQtICAgICBxdWl0KDEpOiBvbkJlZm9yZVNodXRkb3duKDEpLCBvbkJlZm9yZUNsb3NlV2luZG93KDEsIHRydWUpXG5cdC8vIFx0LSAgICAgcXVpdCgyKTogb25CZWZvcmVTaHV0ZG93bigyKSwgb25CZWZvcmVDbG9zZVdpbmRvdygyLCB0cnVlKSwgb25CZWZvcmVDbG9zZVdpbmRvdygyLCB0cnVlKVxuXHQvLyBcdC0gICAgY2xvc2UoMSk6IG9uQmVmb3JlQ2xvc2VXaW5kb3coMiwgZmFsc2UpW25vdCBsYXN0IHdpbmRvd11cblx0Ly8gXHQtICAgIGNsb3NlKDEpOiBvbkJlZm9yZUNsb3NlV2luZG93KDEsIGZhbHNlKSwgb25CZWZvcmVTaHV0ZG93bigwKVtsYXN0IHdpbmRvd11cblx0Ly8gXHQtIGNsb3NlQWxsKDIpOiBvbkJlZm9yZUNsb3NlV2luZG93KDIsIGZhbHNlKSwgb25CZWZvcmVDbG9zZVdpbmRvdygyLCBmYWxzZSksIG9uQmVmb3JlU2h1dGRvd24oMClcblx0Ly9cblx0cHJpdmF0ZSBvbkJlZm9yZVNodXRkb3duKCk6IHZvaWQge1xuXHRcdHRoaXMuc2h1dHRpbmdEb3duID0gdHJ1ZTtcblxuXHRcdHRoaXMuc2F2ZVdpbmRvd3NTdGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzYXZlV2luZG93c1N0YXRlKCk6IHZvaWQge1xuXG5cdFx0Ly8gVE9ET0BlbGVjdHJvbiB3b3JrYXJvdW5kIGZvciBFbGVjdHJvbiBub3QgYmVpbmcgYWJsZSB0byByZXN0b3JlXG5cdFx0Ly8gbXVsdGlwbGUgKG5hdGl2ZSkgZnVsbHNjcmVlbiB3aW5kb3dzIG9uIHRoZSBzYW1lIGRpc3BsYXkgYXQgb25jZVxuXHRcdC8vIG9uIG1hY09TLlxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9lbGVjdHJvbi9lbGVjdHJvbi9pc3N1ZXMvMzQzNjdcblx0XHRjb25zdCBkaXNwbGF5c1dpdGhGdWxsU2NyZWVuV2luZG93ID0gbmV3IFNldDxudW1iZXIgfCB1bmRlZmluZWQ+KCk7XG5cblx0XHRjb25zdCBjdXJyZW50V2luZG93c1N0YXRlOiBJV2luZG93c1N0YXRlID0ge1xuXHRcdFx0b3BlbmVkV2luZG93czogW10sXG5cdFx0XHRsYXN0UGx1Z2luRGV2ZWxvcG1lbnRIb3N0V2luZG93OiB0aGlzLl9zdGF0ZS5sYXN0UGx1Z2luRGV2ZWxvcG1lbnRIb3N0V2luZG93LFxuXHRcdFx0bGFzdEFjdGl2ZVdpbmRvdzogdGhpcy5sYXN0Q2xvc2VkU3RhdGVcblx0XHR9O1xuXG5cdFx0Ly8gMS4pIEZpbmQgYSBsYXN0IGFjdGl2ZSB3aW5kb3cgKHBpY2sgYW55IG90aGVyIGZpcnN0IHdpbmRvdyBvdGhlcndpc2UpXG5cdFx0aWYgKCFjdXJyZW50V2luZG93c1N0YXRlLmxhc3RBY3RpdmVXaW5kb3cpIHtcblx0XHRcdGxldCBhY3RpdmVXaW5kb3cgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRMYXN0QWN0aXZlV2luZG93KCk7XG5cdFx0XHRpZiAoIWFjdGl2ZVdpbmRvdyB8fCBhY3RpdmVXaW5kb3cuaXNFeHRlbnNpb25EZXZlbG9wbWVudEhvc3QpIHtcblx0XHRcdFx0YWN0aXZlV2luZG93ID0gdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93cygpLmZpbmQod2luZG93ID0+ICF3aW5kb3cuaXNFeHRlbnNpb25EZXZlbG9wbWVudEhvc3QpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYWN0aXZlV2luZG93KSB7XG5cdFx0XHRcdGN1cnJlbnRXaW5kb3dzU3RhdGUubGFzdEFjdGl2ZVdpbmRvdyA9IHRoaXMudG9XaW5kb3dTdGF0ZShhY3RpdmVXaW5kb3cpO1xuXG5cdFx0XHRcdGlmIChjdXJyZW50V2luZG93c1N0YXRlLmxhc3RBY3RpdmVXaW5kb3cudWlTdGF0ZS5tb2RlID09PSBXaW5kb3dNb2RlLkZ1bGxzY3JlZW4pIHtcblx0XHRcdFx0XHRkaXNwbGF5c1dpdGhGdWxsU2NyZWVuV2luZG93LmFkZChjdXJyZW50V2luZG93c1N0YXRlLmxhc3RBY3RpdmVXaW5kb3cudWlTdGF0ZS5kaXNwbGF5KTsgLy8gYWx3YXlzIGFsbG93IGZ1bGxzY3JlZW4gZm9yIGFjdGl2ZSB3aW5kb3dcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIDIuKSBGaW5kIGV4dGVuc2lvbiBob3N0IHdpbmRvd1xuXHRcdGNvbnN0IGV4dGVuc2lvbkhvc3RXaW5kb3cgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dzKCkuZmluZCh3aW5kb3cgPT4gd2luZG93LmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnRIb3N0ICYmICF3aW5kb3cuaXNFeHRlbnNpb25UZXN0SG9zdCk7XG5cdFx0aWYgKGV4dGVuc2lvbkhvc3RXaW5kb3cpIHtcblx0XHRcdGN1cnJlbnRXaW5kb3dzU3RhdGUubGFzdFBsdWdpbkRldmVsb3BtZW50SG9zdFdpbmRvdyA9IHRoaXMudG9XaW5kb3dTdGF0ZShleHRlbnNpb25Ib3N0V2luZG93KTtcblxuXHRcdFx0aWYgKGN1cnJlbnRXaW5kb3dzU3RhdGUubGFzdFBsdWdpbkRldmVsb3BtZW50SG9zdFdpbmRvdy51aVN0YXRlLm1vZGUgPT09IFdpbmRvd01vZGUuRnVsbHNjcmVlbikge1xuXHRcdFx0XHRpZiAoZGlzcGxheXNXaXRoRnVsbFNjcmVlbldpbmRvdy5oYXMoY3VycmVudFdpbmRvd3NTdGF0ZS5sYXN0UGx1Z2luRGV2ZWxvcG1lbnRIb3N0V2luZG93LnVpU3RhdGUuZGlzcGxheSkpIHtcblx0XHRcdFx0XHRpZiAoaXNNYWNpbnRvc2ggJiYgIWV4dGVuc2lvbkhvc3RXaW5kb3cud2luPy5pc1NpbXBsZUZ1bGxTY3JlZW4oKSkge1xuXHRcdFx0XHRcdFx0Y3VycmVudFdpbmRvd3NTdGF0ZS5sYXN0UGx1Z2luRGV2ZWxvcG1lbnRIb3N0V2luZG93LnVpU3RhdGUubW9kZSA9IFdpbmRvd01vZGUuTm9ybWFsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkaXNwbGF5c1dpdGhGdWxsU2NyZWVuV2luZG93LmFkZChjdXJyZW50V2luZG93c1N0YXRlLmxhc3RQbHVnaW5EZXZlbG9wbWVudEhvc3RXaW5kb3cudWlTdGF0ZS5kaXNwbGF5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIDMuKSBBbGwgd2luZG93cyAoZXhjZXB0IGV4dGVuc2lvbiBob3N0KSBmb3IgTiA+PSAyIHRvIHN1cHBvcnQgYHJlc3RvcmVXaW5kb3dzOiBhbGxgIG9yIGZvciBhdXRvIHVwZGF0ZVxuXHRcdC8vXG5cdFx0Ly8gQ2FyZWZ1bCBoZXJlOiBhc2tpbmcgYSB3aW5kb3cgZm9yIGl0cyB3aW5kb3cgc3RhdGUgYWZ0ZXIgaXQgaGFzIGJlZW4gY2xvc2VkIHJldHVybnMgYm9ndXMgdmFsdWVzICh3aWR0aDogMCwgaGVpZ2h0OiAwKVxuXHRcdC8vIHNvIGlmIHdlIGV2ZXIgd2FudCB0byBwZXJzaXN0IHRoZSBVSSBzdGF0ZSBvZiB0aGUgbGFzdCBjbG9zZWQgd2luZG93ICh3aW5kb3cgY291bnQgPT09IDEpLCBpdCBoYXNcblx0XHQvLyB0byBjb21lIGZyb20gdGhlIHN0b3JlZCBsYXN0Q2xvc2VkV2luZG93U3RhdGUgb24gV2luL0xpbnV4IGF0IGxlYXN0XG5cdFx0aWYgKHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0NvdW50KCkgPiAxKSB7XG5cdFx0XHRjdXJyZW50V2luZG93c1N0YXRlLm9wZW5lZFdpbmRvd3MgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dzKCkuZmlsdGVyKHdpbmRvdyA9PiAhd2luZG93LmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnRIb3N0KS5tYXAod2luZG93ID0+IHtcblx0XHRcdFx0Y29uc3Qgd2luZG93U3RhdGUgPSB0aGlzLnRvV2luZG93U3RhdGUod2luZG93KTtcblxuXHRcdFx0XHRpZiAod2luZG93U3RhdGUudWlTdGF0ZS5tb2RlID09PSBXaW5kb3dNb2RlLkZ1bGxzY3JlZW4pIHtcblx0XHRcdFx0XHRpZiAoZGlzcGxheXNXaXRoRnVsbFNjcmVlbldpbmRvdy5oYXMod2luZG93U3RhdGUudWlTdGF0ZS5kaXNwbGF5KSkge1xuXHRcdFx0XHRcdFx0aWYgKGlzTWFjaW50b3NoICYmIHdpbmRvd1N0YXRlLndpbmRvd0lkICE9PSBjdXJyZW50V2luZG93c1N0YXRlLmxhc3RBY3RpdmVXaW5kb3c/LndpbmRvd0lkICYmICF3aW5kb3cud2luPy5pc1NpbXBsZUZ1bGxTY3JlZW4oKSkge1xuXHRcdFx0XHRcdFx0XHR3aW5kb3dTdGF0ZS51aVN0YXRlLm1vZGUgPSBXaW5kb3dNb2RlLk5vcm1hbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZGlzcGxheXNXaXRoRnVsbFNjcmVlbldpbmRvdy5hZGQod2luZG93U3RhdGUudWlTdGF0ZS5kaXNwbGF5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gd2luZG93U3RhdGU7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBQZXJzaXN0XG5cdFx0Y29uc3Qgc3RhdGUgPSBnZXRXaW5kb3dzU3RhdGVTdG9yZURhdGEoY3VycmVudFdpbmRvd3NTdGF0ZSk7XG5cdFx0dGhpcy5zdGF0ZVNlcnZpY2Uuc2V0SXRlbShXaW5kb3dzU3RhdGVIYW5kbGVyLndpbmRvd3NTdGF0ZVN0b3JhZ2VLZXksIHN0YXRlKTtcblxuXHRcdGlmICh0aGlzLnNodXR0aW5nRG93bikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbV2luZG93c1N0YXRlSGFuZGxlcl0gb25CZWZvcmVTaHV0ZG93bicsIHN0YXRlKTtcblx0XHR9XG5cdH1cblxuXHQvLyBTZWUgbm90ZSBvbiAjb25CZWZvcmVTaHV0ZG93bigpIGZvciBkZXRhaWxzIGhvdyB0aGVzZSBldmVudHMgYXJlIGZsb3dpbmdcblx0cHJpdmF0ZSBvbkJlZm9yZUNsb3NlV2luZG93KHdpbmRvdzogSUNvZGVXaW5kb3cpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5saWZlY3ljbGVNYWluU2VydmljZS5xdWl0UmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47IC8vIGR1cmluZyBxdWl0LCBtYW55IHdpbmRvd3MgY2xvc2UgaW4gcGFyYWxsZWwgc28gbGV0IGl0IGJlIGhhbmRsZWQgaW4gdGhlIGJlZm9yZS1xdWl0IGhhbmRsZXJcblx0XHR9XG5cblx0XHQvLyBPbiBXaW5kb3cgY2xvc2UsIHVwZGF0ZSBvdXIgc3RvcmVkIFVJIHN0YXRlIG9mIHRoaXMgd2luZG93XG5cdFx0Y29uc3Qgc3RhdGU6IElXaW5kb3dTdGF0ZSA9IHRoaXMudG9XaW5kb3dTdGF0ZSh3aW5kb3cpO1xuXHRcdGlmICh3aW5kb3cuaXNFeHRlbnNpb25EZXZlbG9wbWVudEhvc3QgJiYgIXdpbmRvdy5pc0V4dGVuc2lvblRlc3RIb3N0KSB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5sYXN0UGx1Z2luRGV2ZWxvcG1lbnRIb3N0V2luZG93ID0gc3RhdGU7IC8vIGRvIG5vdCBsZXQgdGVzdCBydW4gd2luZG93IHN0YXRlIG92ZXJ3cml0ZSBvdXIgZXh0ZW5zaW9uIGRldmVsb3BtZW50IHN0YXRlXG5cdFx0fVxuXG5cdFx0Ly8gQW55IG5vbiBleHRlbnNpb24gaG9zdCB3aW5kb3cgd2l0aCBzYW1lIHdvcmtzcGFjZSBvciBmb2xkZXJcblx0XHRlbHNlIGlmICghd2luZG93LmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnRIb3N0ICYmIHdpbmRvdy5vcGVuZWRXb3Jrc3BhY2UpIHtcblx0XHRcdHRoaXMuX3N0YXRlLm9wZW5lZFdpbmRvd3MuZm9yRWFjaChvcGVuZWRXaW5kb3cgPT4ge1xuXHRcdFx0XHRjb25zdCBzYW1lV29ya3NwYWNlID0gaXNXb3Jrc3BhY2VJZGVudGlmaWVyKHdpbmRvdy5vcGVuZWRXb3Jrc3BhY2UpICYmIG9wZW5lZFdpbmRvdy53b3Jrc3BhY2U/LmlkID09PSB3aW5kb3cub3BlbmVkV29ya3NwYWNlLmlkO1xuXHRcdFx0XHRjb25zdCBzYW1lRm9sZGVyID0gaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKHdpbmRvdy5vcGVuZWRXb3Jrc3BhY2UpICYmIG9wZW5lZFdpbmRvdy5mb2xkZXJVcmkgJiYgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbChvcGVuZWRXaW5kb3cuZm9sZGVyVXJpLCB3aW5kb3cub3BlbmVkV29ya3NwYWNlLnVyaSk7XG5cblx0XHRcdFx0aWYgKHNhbWVXb3Jrc3BhY2UgfHwgc2FtZUZvbGRlcikge1xuXHRcdFx0XHRcdG9wZW5lZFdpbmRvdy51aVN0YXRlID0gc3RhdGUudWlTdGF0ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gT24gV2luZG93cyBhbmQgTGludXggY2xvc2luZyB0aGUgbGFzdCB3aW5kb3cgd2lsbCB0cmlnZ2VyIHF1aXQuIFNpbmNlIHdlIGFyZSBzdG9yaW5nIGFsbCBVSSBzdGF0ZVxuXHRcdC8vIGJlZm9yZSBxdWl0dGluZywgd2UgbmVlZCB0byByZW1lbWJlciB0aGUgVUkgc3RhdGUgb2YgdGhpcyB3aW5kb3cgdG8gYmUgYWJsZSB0byBwZXJzaXN0IGl0LlxuXHRcdC8vIE9uIG1hY09TIHdlIGtlZXAgdGhlIGxhc3QgY2xvc2VkIHdpbmRvdyBzdGF0ZSByZWFkeSBpbiBjYXNlIHRoZSB1c2VyIHdhbnRzIHRvIHF1aXQgcmlnaHQgYWZ0ZXIgb3Jcblx0XHQvLyB3YW50cyB0byBvcGVuIGFub3RoZXIgd2luZG93LCBpbiB3aGljaCBjYXNlIHdlIHVzZSB0aGlzIHN0YXRlIG92ZXIgdGhlIHBlcnNpc3RlZCBvbmUuXG5cdFx0aWYgKHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0NvdW50KCkgPT09IDEpIHtcblx0XHRcdHRoaXMubGFzdENsb3NlZFN0YXRlID0gc3RhdGU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0b1dpbmRvd1N0YXRlKHdpbmRvdzogSUNvZGVXaW5kb3cpOiBJV2luZG93U3RhdGUge1xuXHRcdHJldHVybiB7XG5cdFx0XHR3aW5kb3dJZDogd2luZG93LmlkLFxuXHRcdFx0d29ya3NwYWNlOiBpc1dvcmtzcGFjZUlkZW50aWZpZXIod2luZG93Lm9wZW5lZFdvcmtzcGFjZSkgPyB3aW5kb3cub3BlbmVkV29ya3NwYWNlIDogdW5kZWZpbmVkLFxuXHRcdFx0Zm9sZGVyVXJpOiBpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIod2luZG93Lm9wZW5lZFdvcmtzcGFjZSkgPyB3aW5kb3cub3BlbmVkV29ya3NwYWNlLnVyaSA6IHVuZGVmaW5lZCxcblx0XHRcdGJhY2t1cFBhdGg6IHdpbmRvdy5iYWNrdXBQYXRoLFxuXHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB3aW5kb3cucmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0dWlTdGF0ZTogd2luZG93LnNlcmlhbGl6ZVdpbmRvd1N0YXRlKClcblx0XHR9O1xuXHR9XG5cblx0Z2V0TmV3V2luZG93U3RhdGUoY29uZmlndXJhdGlvbjogSU5hdGl2ZVdpbmRvd0NvbmZpZ3VyYXRpb24pOiBJTmV3V2luZG93U3RhdGUge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5kb0dldE5ld1dpbmRvd1N0YXRlKGNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbnN0IHdpbmRvd0NvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVdpbmRvd1NldHRpbmdzIHwgdW5kZWZpbmVkPignd2luZG93Jyk7XG5cblx0XHQvLyBGdWxsc2NyZWVuIHN0YXRlIGdldHMgc3BlY2lhbCB0cmVhdG1lbnRcblx0XHRpZiAoc3RhdGUubW9kZSA9PT0gV2luZG93TW9kZS5GdWxsc2NyZWVuKSB7XG5cblx0XHRcdC8vIFdpbmRvdyBzdGF0ZSBpcyBub3QgZnJvbSBhIHByZXZpb3VzIHNlc3Npb246IG9ubHkgYWxsb3cgZnVsbHNjcmVlbiBpZiB3ZSBpbmhlcml0IGl0IG9yIHVzZXIgd2FudHMgZnVsbHNjcmVlblxuXHRcdFx0bGV0IGFsbG93RnVsbHNjcmVlbjogYm9vbGVhbjtcblx0XHRcdGlmIChzdGF0ZS5oYXNEZWZhdWx0U3RhdGUpIHtcblx0XHRcdFx0YWxsb3dGdWxsc2NyZWVuID0gISEod2luZG93Q29uZmlnPy5uZXdXaW5kb3dEaW1lbnNpb25zICYmIFsnZnVsbHNjcmVlbicsICdpbmhlcml0JywgJ29mZnNldCddLmluZGV4T2Yod2luZG93Q29uZmlnLm5ld1dpbmRvd0RpbWVuc2lvbnMpID49IDApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBXaW5kb3cgc3RhdGUgaXMgZnJvbSBhIHByZXZpb3VzIHNlc3Npb246IG9ubHkgYWxsb3cgZnVsbHNjcmVlbiB3aGVuIHdlIGdvdCB1cGRhdGVkIG9yIHVzZXIgd2FudHMgdG8gcmVzdG9yZVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGFsbG93RnVsbHNjcmVlbiA9ICEhKHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2Uud2FzUmVzdGFydGVkIHx8IHdpbmRvd0NvbmZpZz8ucmVzdG9yZUZ1bGxzY3JlZW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWFsbG93RnVsbHNjcmVlbikge1xuXHRcdFx0XHRzdGF0ZS5tb2RlID0gV2luZG93TW9kZS5Ob3JtYWw7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0dldE5ld1dpbmRvd1N0YXRlKGNvbmZpZ3VyYXRpb246IElOYXRpdmVXaW5kb3dDb25maWd1cmF0aW9uKTogSU5ld1dpbmRvd1N0YXRlIHtcblx0XHRjb25zdCBsYXN0QWN0aXZlID0gdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0TGFzdEFjdGl2ZVdpbmRvdygpO1xuXG5cdFx0Ly8gUmVzdG9yZSBzdGF0ZSB1bmxlc3Mgd2UgYXJlIHJ1bm5pbmcgZXh0ZW5zaW9uIHRlc3RzXG5cdFx0aWYgKCFjb25maWd1cmF0aW9uLmV4dGVuc2lvblRlc3RzUGF0aCkge1xuXG5cdFx0XHQvLyBleHRlbnNpb24gZGV2ZWxvcG1lbnQgaG9zdCBXaW5kb3cgLSBsb2FkIGZyb20gc3RvcmVkIHNldHRpbmdzIGlmIGFueVxuXHRcdFx0aWYgKCEhY29uZmlndXJhdGlvbi5leHRlbnNpb25EZXZlbG9wbWVudFBhdGggJiYgdGhpcy5zdGF0ZS5sYXN0UGx1Z2luRGV2ZWxvcG1lbnRIb3N0V2luZG93KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnN0YXRlLmxhc3RQbHVnaW5EZXZlbG9wbWVudEhvc3RXaW5kb3cudWlTdGF0ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gS25vd24gV29ya3NwYWNlIC0gbG9hZCBmcm9tIHN0b3JlZCBzZXR0aW5nc1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gY29uZmlndXJhdGlvbi53b3Jrc3BhY2U7XG5cdFx0XHRpZiAoaXNXb3Jrc3BhY2VJZGVudGlmaWVyKHdvcmtzcGFjZSkpIHtcblx0XHRcdFx0Y29uc3Qgc3RhdGVGb3JXb3Jrc3BhY2UgPSB0aGlzLnN0YXRlLm9wZW5lZFdpbmRvd3MuZmlsdGVyKG9wZW5lZFdpbmRvdyA9PiBvcGVuZWRXaW5kb3cud29ya3NwYWNlICYmIG9wZW5lZFdpbmRvdy53b3Jrc3BhY2UuaWQgPT09IHdvcmtzcGFjZS5pZCkubWFwKG9wZW5lZFdpbmRvdyA9PiBvcGVuZWRXaW5kb3cudWlTdGF0ZSk7XG5cdFx0XHRcdGlmIChzdGF0ZUZvcldvcmtzcGFjZS5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZXR1cm4gc3RhdGVGb3JXb3Jrc3BhY2VbMF07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gS25vd24gRm9sZGVyIC0gbG9hZCBmcm9tIHN0b3JlZCBzZXR0aW5nc1xuXHRcdFx0aWYgKGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcih3b3Jrc3BhY2UpKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlRm9yRm9sZGVyID0gdGhpcy5zdGF0ZS5vcGVuZWRXaW5kb3dzLmZpbHRlcihvcGVuZWRXaW5kb3cgPT4gb3BlbmVkV2luZG93LmZvbGRlclVyaSAmJiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKG9wZW5lZFdpbmRvdy5mb2xkZXJVcmksIHdvcmtzcGFjZS51cmkpKS5tYXAob3BlbmVkV2luZG93ID0+IG9wZW5lZFdpbmRvdy51aVN0YXRlKTtcblx0XHRcdFx0aWYgKHN0YXRlRm9yRm9sZGVyLmxlbmd0aCkge1xuXHRcdFx0XHRcdHJldHVybiBzdGF0ZUZvckZvbGRlclswXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBFbXB0eSB3aW5kb3dzIHdpdGggYmFja3Vwc1xuXHRcdFx0ZWxzZSBpZiAoY29uZmlndXJhdGlvbi5iYWNrdXBQYXRoKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlRm9yRW1wdHlXaW5kb3cgPSB0aGlzLnN0YXRlLm9wZW5lZFdpbmRvd3MuZmlsdGVyKG9wZW5lZFdpbmRvdyA9PiBvcGVuZWRXaW5kb3cuYmFja3VwUGF0aCA9PT0gY29uZmlndXJhdGlvbi5iYWNrdXBQYXRoKS5tYXAob3BlbmVkV2luZG93ID0+IG9wZW5lZFdpbmRvdy51aVN0YXRlKTtcblx0XHRcdFx0aWYgKHN0YXRlRm9yRW1wdHlXaW5kb3cubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHN0YXRlRm9yRW1wdHlXaW5kb3dbMF07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gRmlyc3QgV2luZG93XG5cdFx0XHRjb25zdCBsYXN0QWN0aXZlU3RhdGUgPSB0aGlzLmxhc3RDbG9zZWRTdGF0ZSB8fCB0aGlzLnN0YXRlLmxhc3RBY3RpdmVXaW5kb3c7XG5cdFx0XHRpZiAoIWxhc3RBY3RpdmUgJiYgbGFzdEFjdGl2ZVN0YXRlKSB7XG5cdFx0XHRcdHJldHVybiBsYXN0QWN0aXZlU3RhdGUudWlTdGF0ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvL1xuXHRcdC8vIEluIGFueSBvdGhlciBjYXNlLCB3ZSBkbyBub3QgaGF2ZSBhbnkgc3RvcmVkIHNldHRpbmdzIGZvciB0aGUgd2luZG93IHN0YXRlLCBzbyB3ZSBjb21lIHVwIHdpdGggc29tZXRoaW5nIHNtYXJ0XG5cdFx0Ly9cblxuXHRcdC8vIFdlIHdhbnQgdGhlIG5ldyB3aW5kb3cgdG8gb3BlbiBvbiB0aGUgc2FtZSBkaXNwbGF5IHRoYXQgdGhlIGxhc3QgYWN0aXZlIG9uZSBpcyBpblxuXHRcdGxldCBkaXNwbGF5VG9Vc2U6IGVsZWN0cm9uLkRpc3BsYXkgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZGlzcGxheXMgPSBlbGVjdHJvbi5zY3JlZW4uZ2V0QWxsRGlzcGxheXMoKTtcblxuXHRcdC8vIFNpbmdsZSBEaXNwbGF5XG5cdFx0aWYgKGRpc3BsYXlzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0ZGlzcGxheVRvVXNlID0gZGlzcGxheXNbMF07XG5cdFx0fVxuXG5cdFx0Ly8gTXVsdGkgRGlzcGxheVxuXHRcdGVsc2Uge1xuXG5cdFx0XHQvLyBvbiBtYWMgdGhlcmUgaXMgMSBtZW51IHBlciB3aW5kb3cgc28gd2UgbmVlZCB0byB1c2UgdGhlIG1vbml0b3Igd2hlcmUgdGhlIGN1cnNvciBjdXJyZW50bHkgaXNcblx0XHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0XHRjb25zdCBjdXJzb3JQb2ludCA9IGVsZWN0cm9uLnNjcmVlbi5nZXRDdXJzb3JTY3JlZW5Qb2ludCgpO1xuXHRcdFx0XHRkaXNwbGF5VG9Vc2UgPSBlbGVjdHJvbi5zY3JlZW4uZ2V0RGlzcGxheU5lYXJlc3RQb2ludChjdXJzb3JQb2ludCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGlmIHdlIGhhdmUgYSBsYXN0IGFjdGl2ZSB3aW5kb3csIHVzZSB0aGF0IGRpc3BsYXkgZm9yIHRoZSBuZXcgd2luZG93XG5cdFx0XHRpZiAoIWRpc3BsYXlUb1VzZSAmJiBsYXN0QWN0aXZlKSB7XG5cdFx0XHRcdGRpc3BsYXlUb1VzZSA9IGVsZWN0cm9uLnNjcmVlbi5nZXREaXNwbGF5TWF0Y2hpbmcobGFzdEFjdGl2ZS5nZXRCb3VuZHMoKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGZhbGxiYWNrIHRvIHByaW1hcnkgZGlzcGxheSBvciBmaXJzdCBkaXNwbGF5XG5cdFx0XHRpZiAoIWRpc3BsYXlUb1VzZSkge1xuXHRcdFx0XHRkaXNwbGF5VG9Vc2UgPSBlbGVjdHJvbi5zY3JlZW4uZ2V0UHJpbWFyeURpc3BsYXkoKSB8fCBkaXNwbGF5c1swXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDb21wdXRlIHgveSBiYXNlZCBvbiBkaXNwbGF5IGJvdW5kc1xuXHRcdC8vIE5vdGU6IGltcG9ydGFudCB0byB1c2UgTWF0aC5yb3VuZCgpIGJlY2F1c2UgRWxlY3Ryb24gZG9lcyBub3Qgc2VlbSB0byBiZSB0b28gaGFwcHkgYWJvdXRcblx0XHQvLyBkaXNwbGF5IGNvb3JkaW5hdGVzIHRoYXQgYXJlIG5vdCBhYnNvbHV0ZSBudW1iZXJzLlxuXHRcdGxldCBzdGF0ZSA9IGRlZmF1bHRXaW5kb3dTdGF0ZSh1bmRlZmluZWQsIGlzV29ya3NwYWNlSWRlbnRpZmllcihjb25maWd1cmF0aW9uLndvcmtzcGFjZSkgfHwgaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKGNvbmZpZ3VyYXRpb24ud29ya3NwYWNlKSk7XG5cdFx0c3RhdGUueCA9IE1hdGgucm91bmQoZGlzcGxheVRvVXNlLmJvdW5kcy54ICsgKGRpc3BsYXlUb1VzZS5ib3VuZHMud2lkdGggLyAyKSAtIChzdGF0ZS53aWR0aCEgLyAyKSk7XG5cdFx0c3RhdGUueSA9IE1hdGgucm91bmQoZGlzcGxheVRvVXNlLmJvdW5kcy55ICsgKGRpc3BsYXlUb1VzZS5ib3VuZHMuaGVpZ2h0IC8gMikgLSAoc3RhdGUuaGVpZ2h0ISAvIDIpKTtcblxuXHRcdC8vIENoZWNrIGZvciBuZXdXaW5kb3dEaW1lbnNpb25zIHNldHRpbmcgYW5kIGFkanVzdCBhY2NvcmRpbmdseVxuXHRcdGNvbnN0IHdpbmRvd0NvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVdpbmRvd1NldHRpbmdzIHwgdW5kZWZpbmVkPignd2luZG93Jyk7XG5cdFx0bGV0IGVuc3VyZU5vT3ZlcmxhcCA9IHRydWU7XG5cdFx0aWYgKHdpbmRvd0NvbmZpZz8ubmV3V2luZG93RGltZW5zaW9ucykge1xuXHRcdFx0aWYgKHdpbmRvd0NvbmZpZy5uZXdXaW5kb3dEaW1lbnNpb25zID09PSAnbWF4aW1pemVkJykge1xuXHRcdFx0XHRzdGF0ZS5tb2RlID0gV2luZG93TW9kZS5NYXhpbWl6ZWQ7XG5cdFx0XHRcdGVuc3VyZU5vT3ZlcmxhcCA9IGZhbHNlO1xuXHRcdFx0fSBlbHNlIGlmICh3aW5kb3dDb25maWcubmV3V2luZG93RGltZW5zaW9ucyA9PT0gJ2Z1bGxzY3JlZW4nKSB7XG5cdFx0XHRcdHN0YXRlLm1vZGUgPSBXaW5kb3dNb2RlLkZ1bGxzY3JlZW47XG5cdFx0XHRcdGVuc3VyZU5vT3ZlcmxhcCA9IGZhbHNlO1xuXHRcdFx0fSBlbHNlIGlmICgod2luZG93Q29uZmlnLm5ld1dpbmRvd0RpbWVuc2lvbnMgPT09ICdpbmhlcml0JyB8fCB3aW5kb3dDb25maWcubmV3V2luZG93RGltZW5zaW9ucyA9PT0gJ29mZnNldCcpICYmIGxhc3RBY3RpdmUpIHtcblx0XHRcdFx0Y29uc3QgbGFzdEFjdGl2ZVN0YXRlID0gbGFzdEFjdGl2ZS5zZXJpYWxpemVXaW5kb3dTdGF0ZSgpO1xuXHRcdFx0XHRpZiAobGFzdEFjdGl2ZVN0YXRlLm1vZGUgPT09IFdpbmRvd01vZGUuRnVsbHNjcmVlbikge1xuXHRcdFx0XHRcdHN0YXRlLm1vZGUgPSBXaW5kb3dNb2RlLkZ1bGxzY3JlZW47IC8vIG9ubHkgdGFrZSBtb2RlIChmaXhlcyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTkzMzEpXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c3RhdGUgPSB7XG5cdFx0XHRcdFx0XHQuLi5sYXN0QWN0aXZlU3RhdGUsXG5cdFx0XHRcdFx0XHR6b29tTGV2ZWw6IHVuZGVmaW5lZCAvLyBkbyBub3QgaW5oZXJpdCB6b29tIGxldmVsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGVuc3VyZU5vT3ZlcmxhcCA9IHN0YXRlLm1vZGUgIT09IFdpbmRvd01vZGUuRnVsbHNjcmVlbiAmJiB3aW5kb3dDb25maWcubmV3V2luZG93RGltZW5zaW9ucyA9PT0gJ29mZnNldCc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVuc3VyZU5vT3ZlcmxhcCkge1xuXHRcdFx0c3RhdGUgPSB0aGlzLmVuc3VyZU5vT3ZlcmxhcChzdGF0ZSk7XG5cdFx0fVxuXG5cdFx0KHN0YXRlIGFzIElOZXdXaW5kb3dTdGF0ZSkuaGFzRGVmYXVsdFN0YXRlID0gdHJ1ZTsgLy8gZmxhZyBhcyBkZWZhdWx0IHN0YXRlXG5cblx0XHRyZXR1cm4gc3RhdGU7XG5cdH1cblxuXHRwcml2YXRlIGVuc3VyZU5vT3ZlcmxhcChzdGF0ZTogSVdpbmRvd1VJU3RhdGUpOiBJV2luZG93VUlTdGF0ZSB7XG5cdFx0aWYgKHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd3MoKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHR9XG5cblx0XHRzdGF0ZS54ID0gdHlwZW9mIHN0YXRlLnggPT09ICdudW1iZXInID8gc3RhdGUueCA6IDA7XG5cdFx0c3RhdGUueSA9IHR5cGVvZiBzdGF0ZS55ID09PSAnbnVtYmVyJyA/IHN0YXRlLnkgOiAwO1xuXG5cdFx0Y29uc3QgZXhpc3RpbmdXaW5kb3dCb3VuZHMgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dzKCkubWFwKHdpbmRvdyA9PiB3aW5kb3cuZ2V0Qm91bmRzKCkpO1xuXHRcdHdoaWxlIChleGlzdGluZ1dpbmRvd0JvdW5kcy5zb21lKGJvdW5kcyA9PiBib3VuZHMueCA9PT0gc3RhdGUueCB8fCBib3VuZHMueSA9PT0gc3RhdGUueSkpIHtcblx0XHRcdHN0YXRlLnggKz0gMzA7XG5cdFx0XHRzdGF0ZS55ICs9IDMwO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzdG9yZVdpbmRvd3NTdGF0ZShkYXRhOiBJU2VyaWFsaXplZFdpbmRvd3NTdGF0ZSB8IHVuZGVmaW5lZCk6IElXaW5kb3dzU3RhdGUge1xuXHRjb25zdCByZXN1bHQ6IElXaW5kb3dzU3RhdGUgPSB7IG9wZW5lZFdpbmRvd3M6IFtdIH07XG5cdGNvbnN0IHdpbmRvd3NTdGF0ZSA9IGRhdGEgfHwgeyBvcGVuZWRXaW5kb3dzOiBbXSB9O1xuXG5cdGlmICh3aW5kb3dzU3RhdGUubGFzdEFjdGl2ZVdpbmRvdykge1xuXHRcdHJlc3VsdC5sYXN0QWN0aXZlV2luZG93ID0gcmVzdG9yZVdpbmRvd1N0YXRlKHdpbmRvd3NTdGF0ZS5sYXN0QWN0aXZlV2luZG93KTtcblx0fVxuXG5cdGlmICh3aW5kb3dzU3RhdGUubGFzdFBsdWdpbkRldmVsb3BtZW50SG9zdFdpbmRvdykge1xuXHRcdHJlc3VsdC5sYXN0UGx1Z2luRGV2ZWxvcG1lbnRIb3N0V2luZG93ID0gcmVzdG9yZVdpbmRvd1N0YXRlKHdpbmRvd3NTdGF0ZS5sYXN0UGx1Z2luRGV2ZWxvcG1lbnRIb3N0V2luZG93KTtcblx0fVxuXG5cdGlmIChBcnJheS5pc0FycmF5KHdpbmRvd3NTdGF0ZS5vcGVuZWRXaW5kb3dzKSkge1xuXHRcdHJlc3VsdC5vcGVuZWRXaW5kb3dzID0gd2luZG93c1N0YXRlLm9wZW5lZFdpbmRvd3MubWFwKHdpbmRvd1N0YXRlID0+IHJlc3RvcmVXaW5kb3dTdGF0ZSh3aW5kb3dTdGF0ZSkpO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gcmVzdG9yZVdpbmRvd1N0YXRlKHdpbmRvd1N0YXRlOiBJU2VyaWFsaXplZFdpbmRvd1N0YXRlKTogSVdpbmRvd1N0YXRlIHtcblx0Y29uc3QgcmVzdWx0OiBJV2luZG93U3RhdGUgPSB7IHVpU3RhdGU6IHdpbmRvd1N0YXRlLnVpU3RhdGUgfTtcblx0aWYgKHdpbmRvd1N0YXRlLmJhY2t1cFBhdGgpIHtcblx0XHRyZXN1bHQuYmFja3VwUGF0aCA9IHdpbmRvd1N0YXRlLmJhY2t1cFBhdGg7XG5cdH1cblxuXHRpZiAod2luZG93U3RhdGUucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0cmVzdWx0LnJlbW90ZUF1dGhvcml0eSA9IHdpbmRvd1N0YXRlLnJlbW90ZUF1dGhvcml0eTtcblx0fVxuXG5cdGlmICh3aW5kb3dTdGF0ZS5mb2xkZXIpIHtcblx0XHRyZXN1bHQuZm9sZGVyVXJpID0gVVJJLnBhcnNlKHdpbmRvd1N0YXRlLmZvbGRlcik7XG5cdH1cblxuXHRpZiAod2luZG93U3RhdGUud29ya3NwYWNlSWRlbnRpZmllcikge1xuXHRcdHJlc3VsdC53b3Jrc3BhY2UgPSB7IGlkOiB3aW5kb3dTdGF0ZS53b3Jrc3BhY2VJZGVudGlmaWVyLmlkLCBjb25maWdQYXRoOiBVUkkucGFyc2Uod2luZG93U3RhdGUud29ya3NwYWNlSWRlbnRpZmllci5jb25maWdVUklQYXRoKSB9O1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFdpbmRvd3NTdGF0ZVN0b3JlRGF0YSh3aW5kb3dzU3RhdGU6IElXaW5kb3dzU3RhdGUpOiBJV2luZG93c1N0YXRlIHtcblx0cmV0dXJuIHtcblx0XHRsYXN0QWN0aXZlV2luZG93OiB3aW5kb3dzU3RhdGUubGFzdEFjdGl2ZVdpbmRvdyAmJiBzZXJpYWxpemVXaW5kb3dTdGF0ZSh3aW5kb3dzU3RhdGUubGFzdEFjdGl2ZVdpbmRvdyksXG5cdFx0bGFzdFBsdWdpbkRldmVsb3BtZW50SG9zdFdpbmRvdzogd2luZG93c1N0YXRlLmxhc3RQbHVnaW5EZXZlbG9wbWVudEhvc3RXaW5kb3cgJiYgc2VyaWFsaXplV2luZG93U3RhdGUod2luZG93c1N0YXRlLmxhc3RQbHVnaW5EZXZlbG9wbWVudEhvc3RXaW5kb3cpLFxuXHRcdG9wZW5lZFdpbmRvd3M6IHdpbmRvd3NTdGF0ZS5vcGVuZWRXaW5kb3dzLm1hcCh3cyA9PiBzZXJpYWxpemVXaW5kb3dTdGF0ZSh3cykpXG5cdH07XG59XG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZVdpbmRvd1N0YXRlKHdpbmRvd1N0YXRlOiBJV2luZG93U3RhdGUpOiBJU2VyaWFsaXplZFdpbmRvd1N0YXRlIHtcblx0cmV0dXJuIHtcblx0XHR3b3Jrc3BhY2VJZGVudGlmaWVyOiB3aW5kb3dTdGF0ZS53b3Jrc3BhY2UgJiYgeyBpZDogd2luZG93U3RhdGUud29ya3NwYWNlLmlkLCBjb25maWdVUklQYXRoOiB3aW5kb3dTdGF0ZS53b3Jrc3BhY2UuY29uZmlnUGF0aC50b1N0cmluZygpIH0sXG5cdFx0Zm9sZGVyOiB3aW5kb3dTdGF0ZS5mb2xkZXJVcmk/LnRvU3RyaW5nKCksXG5cdFx0YmFja3VwUGF0aDogd2luZG93U3RhdGUuYmFja3VwUGF0aCxcblx0XHRyZW1vdGVBdXRob3JpdHk6IHdpbmRvd1N0YXRlLnJlbW90ZUF1dGhvcml0eSxcblx0XHR1aVN0YXRlOiB3aW5kb3dTdGF0ZS51aVN0YXRlXG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU8sY0FBYztBQUNyQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBaUUsa0JBQWtCO0FBQzVGLFNBQVMsbUNBQW1DLDZCQUFtRDtBQW1DeEYsSUFBTSxzQkFBTixjQUFrQyxXQUFXO0FBQUEsRUFX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
