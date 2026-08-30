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
import { app, BrowserWindow, desktopCapturer, globalShortcut, powerMonitor, protocol, screen as electronScreen, session, systemPreferences } from "electron";
import { addUNCHostToAllowlist, disableUNCAccessRestrictions } from "../../base/node/unc.js";
import { validatedIpcMain } from "../../base/parts/ipc/electron-main/ipcMain.js";
import { hostname, release } from "os";
import { initWindowsVersionInfo } from "../../base/node/windowsVersion.js";
import { VSBuffer } from "../../base/common/buffer.js";
import { toErrorMessage } from "../../base/common/errorMessage.js";
import { Event } from "../../base/common/event.js";
import { parse } from "../../base/common/jsonc.js";
import { getPathLabel } from "../../base/common/labels.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../base/common/lifecycle.js";
import { Schemas, VSCODE_AUTHORITY } from "../../base/common/network.js";
import { join, posix } from "../../base/common/path.js";
import { isLinux, isLinuxSnap, isMacintosh, isWindows, OS } from "../../base/common/platform.js";
import { assertType } from "../../base/common/types.js";
import { URI } from "../../base/common/uri.js";
import { generateUuid } from "../../base/common/uuid.js";
import { registerContextMenuListener } from "../../base/parts/contextmenu/electron-main/contextmenu.js";
import { getDelayedChannel, ProxyChannel, StaticRouter } from "../../base/parts/ipc/common/ipc.js";
import { Server as ElectronIPCServer } from "../../base/parts/ipc/electron-main/ipc.electron.js";
import { Client as MessagePortClient } from "../../base/parts/ipc/electron-main/ipc.mp.js";
import { IProxyAuthService, ProxyAuthService } from "../../platform/native/electron-main/auth.js";
import { localize } from "../../nls.js";
import { IBackupMainService } from "../../platform/backup/electron-main/backup.js";
import { BackupMainService } from "../../platform/backup/electron-main/backupMainService.js";
import { IConfigurationService } from "../../platform/configuration/common/configuration.js";
import { ElectronExtensionHostDebugBroadcastChannel } from "../../platform/debug/electron-main/extensionHostDebugIpc.js";
import { IDiagnosticsService } from "../../platform/diagnostics/common/diagnostics.js";
import { DiagnosticsMainService, IDiagnosticsMainService } from "../../platform/diagnostics/electron-main/diagnosticsMainService.js";
import { DialogMainService, IDialogMainService } from "../../platform/dialogs/electron-main/dialogMainService.js";
import { IEncryptionMainService } from "../../platform/encryption/common/encryptionService.js";
import { EncryptionMainService } from "../../platform/encryption/electron-main/encryptionMainService.js";
import { ipcBrowserViewChannelName } from "../../platform/browserView/common/browserView.js";
import { ipcBrowserViewGroupChannelName } from "../../platform/browserView/common/browserViewGroup.js";
import { BrowserViewMainService, IBrowserViewMainService } from "../../platform/browserView/electron-main/browserViewMainService.js";
import { BrowserViewGroupMainService, IBrowserViewGroupMainService } from "../../platform/browserView/electron-main/browserViewGroupMainService.js";
import { IEnvironmentMainService } from "../../platform/environment/electron-main/environmentMainService.js";
import { isLaunchedFromCli } from "../../platform/environment/node/argvHelper.js";
import { getResolvedShellEnv } from "../../platform/shell/node/shellEnv.js";
import { IExtensionHostStarter, ipcExtensionHostStarterChannelName } from "../../platform/extensions/common/extensionHostStarter.js";
import { ExtensionHostStarter } from "../../platform/extensions/electron-main/extensionHostStarter.js";
import { IExternalTerminalMainService } from "../../platform/externalTerminal/electron-main/externalTerminal.js";
import { LinuxExternalTerminalService, MacExternalTerminalService, WindowsExternalTerminalService } from "../../platform/externalTerminal/node/externalTerminalService.js";
import { ISandboxHelperMainService } from "../../platform/sandbox/electron-main/sandboxHelperService.js";
import { SandboxHelperService } from "../../platform/sandbox/node/sandboxHelper.js";
import { LOCAL_FILE_SYSTEM_CHANNEL_NAME } from "../../platform/files/common/diskFileSystemProviderClient.js";
import { IFileService } from "../../platform/files/common/files.js";
import { DiskFileSystemProviderChannel } from "../../platform/files/electron-main/diskFileSystemProviderServer.js";
import { DiskFileSystemProvider } from "../../platform/files/node/diskFileSystemProvider.js";
import { SyncDescriptor } from "../../platform/instantiation/common/descriptors.js";
import { IInstantiationService } from "../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../platform/instantiation/common/serviceCollection.js";
import { ProcessMainService } from "../../platform/process/electron-main/processMainService.js";
import { IKeyboardLayoutMainService, KeyboardLayoutMainService } from "../../platform/keyboardLayout/electron-main/keyboardLayoutMainService.js";
import { ILaunchMainService, LaunchMainService } from "../../platform/launch/electron-main/launchMainService.js";
import { ILifecycleMainService, LifecycleMainPhase, ShutdownReason } from "../../platform/lifecycle/electron-main/lifecycleMainService.js";
import { ILoggerService, ILogService } from "../../platform/log/common/log.js";
import { IMenubarMainService, MenubarMainService } from "../../platform/menubar/electron-main/menubarMainService.js";
import { INativeHostMainService, NativeHostMainService } from "../../platform/native/electron-main/nativeHostMainService.js";
import { GlobalKeybindingsMainService, IGlobalKeybindingsMainService } from "../../platform/globalKeybindings/electron-main/globalKeybindingsMainService.js";
import { IMeteredConnectionService } from "../../platform/meteredConnection/common/meteredConnection.js";
import { METERED_CONNECTION_CHANNEL } from "../../platform/meteredConnection/common/meteredConnectionIpc.js";
import { MeteredConnectionChannel } from "../../platform/meteredConnection/electron-main/meteredConnectionChannel.js";
import { MeteredConnectionMainService } from "../../platform/meteredConnection/electron-main/meteredConnectionMainService.js";
import { IProductService } from "../../platform/product/common/productService.js";
import { getRemoteAuthority } from "../../platform/remote/common/remoteHosts.js";
import { SharedProcess } from "../../platform/sharedProcess/electron-main/sharedProcess.js";
import { ISignService } from "../../platform/sign/common/sign.js";
import { IStateService } from "../../platform/state/node/state.js";
import { StorageDatabaseChannel } from "../../platform/storage/electron-main/storageIpc.js";
import { ApplicationStorageMainService, IApplicationStorageMainService, IStorageMainService, StorageMainService } from "../../platform/storage/electron-main/storageMainService.js";
import { resolveCommonProperties } from "../../platform/telemetry/common/commonProperties.js";
import { ITelemetryService, TelemetryLevel } from "../../platform/telemetry/common/telemetry.js";
import { TelemetryAppenderClient } from "../../platform/telemetry/common/telemetryIpc.js";
import { TelemetryService } from "../../platform/telemetry/common/telemetryService.js";
import { getPiiPathsFromEnvironment, getTelemetryLevel, isInternalTelemetry, NullTelemetryService, supportsTelemetry } from "../../platform/telemetry/common/telemetryUtils.js";
import { IUpdateService } from "../../platform/update/common/update.js";
import { UpdateChannel } from "../../platform/update/common/updateIpc.js";
import { NotAvailableUpdateDialog } from "../../platform/update/electron-main/notAvailableUpdateDialog.js";
import { DarwinUpdateService } from "../../platform/update/electron-main/updateService.darwin.js";
import { LinuxUpdateService } from "../../platform/update/electron-main/updateService.linux.js";
import { SnapUpdateService } from "../../platform/update/electron-main/updateService.snap.js";
import { Win32UpdateService } from "../../platform/update/electron-main/updateService.win32.js";
import { isInnoSetupInstall } from "../../platform/update/electron-main/win32UpdateType.js";
import { IURLService } from "../../platform/url/common/url.js";
import { URLHandlerChannelClient, URLHandlerRouter } from "../../platform/url/common/urlIpc.js";
import { NativeURLService } from "../../platform/url/common/urlService.js";
import { ElectronURLListener } from "../../platform/url/electron-main/electronUrlListener.js";
import { IWebviewManagerService } from "../../platform/webview/common/webviewManagerService.js";
import { WebviewMainService } from "../../platform/webview/electron-main/webviewMainService.js";
import { isFolderToOpen, isWorkspaceToOpen } from "../../platform/window/common/window.js";
import { getAllWindowsExcludingOffscreen, IWindowsMainService, OpenContext } from "../../platform/windows/electron-main/windows.js";
import { WindowsMainService } from "../../platform/windows/electron-main/windowsMainService.js";
import { ActiveWindowManager } from "../../platform/windows/node/windowTracker.js";
import { hasWorkspaceFileExtension } from "../../platform/workspace/common/workspace.js";
import { IWorkspacesService } from "../../platform/workspaces/common/workspaces.js";
import { IWorkspacesHistoryMainService, WorkspacesHistoryMainService } from "../../platform/workspaces/electron-main/workspacesHistoryMainService.js";
import { WorkspacesMainService } from "../../platform/workspaces/electron-main/workspacesMainService.js";
import { IWorkspacesManagementMainService, WorkspacesManagementMainService } from "../../platform/workspaces/electron-main/workspacesManagementMainService.js";
import { IPolicyService } from "../../platform/policy/common/policy.js";
import { INativeManagedSettingsService, IFileManagedSettingsService } from "../../platform/policy/common/copilotManagedSettings.js";
import { NativeManagedSettingsChannel } from "../../platform/policy/common/nativeManagedSettingsIpc.js";
import { FileManagedSettingsChannel } from "../../platform/policy/common/fileManagedSettingsIpc.js";
import { PolicyChannel } from "../../platform/policy/common/policyIpc.js";
import { IUserDataProfilesMainService } from "../../platform/userDataProfile/electron-main/userDataProfile.js";
import { IExtensionsProfileScannerService } from "../../platform/extensionManagement/common/extensionsProfileScannerService.js";
import { IExtensionsScannerService } from "../../platform/extensionManagement/common/extensionsScannerService.js";
import { ExtensionsScannerService } from "../../platform/extensionManagement/node/extensionsScannerService.js";
import { UserDataProfilesHandler } from "../../platform/userDataProfile/electron-main/userDataProfilesHandler.js";
import { ProfileStorageChangesListenerChannel } from "../../platform/userDataProfile/electron-main/userDataProfileStorageIpc.js";
import { Promises, RunOnceScheduler, runWhenGlobalIdle } from "../../base/common/async.js";
import { CancellationToken } from "../../base/common/cancellation.js";
import { resolveMachineId, resolveSqmId, resolveDevDeviceId, validateDevDeviceId } from "../../platform/telemetry/electron-main/telemetryUtils.js";
import { ExtensionsProfileScannerService } from "../../platform/extensionManagement/node/extensionsProfileScannerService.js";
import { LoggerChannel } from "../../platform/log/electron-main/logIpc.js";
import { ILoggerMainService } from "../../platform/log/electron-main/loggerService.js";
import { IUtilityProcessWorkerMainService, UtilityProcessWorkerMainService } from "../../platform/utilityProcess/electron-main/utilityProcessWorkerMainService.js";
import { ipcUtilityProcessWorkerChannelName } from "../../platform/utilityProcess/common/utilityProcessWorkerService.js";
import { ILocalPtyService, LocalReconnectConstants, TerminalIpcChannels, TerminalSettingId } from "../../platform/terminal/common/terminal.js";
import { ElectronPtyHostStarter } from "../../platform/terminal/electron-main/electronPtyHostStarter.js";
import { PtyHostService } from "../../platform/terminal/node/ptyHostService.js";
import { ElectronAgentHostStarter } from "../../platform/agentHost/electron-main/electronAgentHostStarter.js";
import { AgentHostProcessManager } from "../../platform/agentHost/node/agentHostService.js";
import { NODE_REMOTE_RESOURCE_CHANNEL_NAME, NODE_REMOTE_RESOURCE_IPC_METHOD_NAME, NodeRemoteResourceRouter } from "../../platform/remote/common/electronRemoteResources.js";
import { Lazy } from "../../base/common/lazy.js";
import { IAuxiliaryWindowsMainService } from "../../platform/auxiliaryWindow/electron-main/auxiliaryWindows.js";
import { AuxiliaryWindowsMainService } from "../../platform/auxiliaryWindow/electron-main/auxiliaryWindowsMainService.js";
import { normalizeNFC } from "../../base/common/normalization.js";
import { ICSSDevelopmentService, CSSDevelopmentService } from "../../platform/cssDev/node/cssDevService.js";
import { INativeMcpDiscoveryHelperService, NativeMcpDiscoveryHelperChannelName } from "../../platform/mcp/common/nativeMcpDiscoveryHelper.js";
import { NativeMcpDiscoveryHelperService } from "../../platform/mcp/node/nativeMcpDiscoveryHelperService.js";
import { IMcpGatewayService, McpGatewayChannelName } from "../../platform/mcp/common/mcpGateway.js";
import { McpGatewayService } from "../../platform/mcp/node/mcpGatewayService.js";
import { McpGatewayChannel } from "../../platform/mcp/node/mcpGatewayChannel.js";
import { IWebContentExtractorService } from "../../platform/webContentExtractor/common/webContentExtractor.js";
import { NativeWebContentExtractorService } from "../../platform/webContentExtractor/electron-main/webContentExtractorService.js";
import { AgentNetworkFilterService, IAgentNetworkFilterService } from "../../platform/networkFilter/common/networkFilterService.js";
import { ITerminalSandboxService, NullTerminalSandboxService } from "../../platform/sandbox/common/terminalSandboxService.js";
import ErrorTelemetry from "../../platform/telemetry/electron-main/errorTelemetry.js";
let CodeApplication = class extends Disposable {
  constructor(mainProcessNodeIpcServer, userEnv, mainInstantiationService, logService, loggerService, environmentMainService, lifecycleMainService, configurationService, stateService, fileService, productService, userDataProfilesMainService) {
    super();
    this.mainProcessNodeIpcServer = mainProcessNodeIpcServer;
    this.userEnv = userEnv;
    this.mainInstantiationService = mainInstantiationService;
    this.logService = logService;
    this.loggerService = loggerService;
    this.environmentMainService = environmentMainService;
    this.lifecycleMainService = lifecycleMainService;
    this.configurationService = configurationService;
    this.stateService = stateService;
    this.fileService = fileService;
    this.productService = productService;
    this.userDataProfilesMainService = userDataProfilesMainService;
    this.configureSession();
    this.registerListeners();
  }
  configureSession() {
    const isUrlFromWindow = (requestingUrl) => requestingUrl?.startsWith(`${Schemas.vscodeFileResource}://${VSCODE_AUTHORITY}`);
    const isUrlFromWebview = (requestingUrl) => requestingUrl?.startsWith(`${Schemas.vscodeWebview}://`);
    const isUrlFromAuxiliaryWindow = (webContents, requestingUrl, isMainFrame) => isMainFrame && requestingUrl === "about:blank" && !!(webContents && this.auxiliaryWindowsMainService?.getWindowByWebContents(webContents));
    const isRequestFromWindow = (webContents, requestingUrl, isMainFrame) => isUrlFromWindow(requestingUrl) || isUrlFromAuxiliaryWindow(webContents, requestingUrl, isMainFrame);
    const alwaysAllowedPermissions = /* @__PURE__ */ new Set(["pointerLock", "notifications"]);
    const allowedPermissionsInWebview = /* @__PURE__ */ new Set([
      ...alwaysAllowedPermissions,
      "clipboard-read",
      "clipboard-sanitized-write",
      // TODO(deepak1556): Should be removed once migration is complete
      // https://github.com/microsoft/vscode/issues/239228
      "deprecated-sync-clipboard-read"
    ]);
    const allowedPermissionsInCore = /* @__PURE__ */ new Set([
      ...alwaysAllowedPermissions,
      "media",
      "local-fonts",
      // TODO(deepak1556): Should be removed once migration is complete
      // https://github.com/microsoft/vscode/issues/239228
      "deprecated-sync-clipboard-read"
    ]);
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      if (isUrlFromWebview(details.requestingUrl)) {
        return callback(allowedPermissionsInWebview.has(permission));
      }
      if (isRequestFromWindow(webContents, details.requestingUrl, details.isMainFrame)) {
        return callback(allowedPermissionsInCore.has(permission));
      }
      return callback(false);
    });
    session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details) => {
      if (isUrlFromWebview(details.requestingUrl)) {
        return allowedPermissionsInWebview.has(permission);
      }
      if (isRequestFromWindow(webContents, details.requestingUrl, details.isMainFrame)) {
        return allowedPermissionsInCore.has(permission);
      }
      return false;
    });
    let cachedScreenSources;
    const invalidateScreenSourceCache = () => {
      cachedScreenSources = void 0;
    };
    electronScreen.on("display-added", invalidateScreenSourceCache);
    electronScreen.on("display-removed", invalidateScreenSourceCache);
    electronScreen.on("display-metrics-changed", invalidateScreenSourceCache);
    this._register(toDisposable(() => {
      electronScreen.off("display-added", invalidateScreenSourceCache);
      electronScreen.off("display-removed", invalidateScreenSourceCache);
      electronScreen.off("display-metrics-changed", invalidateScreenSourceCache);
    }));
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
      try {
        const frame = request.frame;
        const win = frame ? BrowserWindow.getAllWindows().find((w) => w.webContents.mainFrame === frame) : void 0;
        const displays = electronScreen.getAllDisplays();
        let targetDisplay = displays[0];
        if (win) {
          const winBounds = win.getBounds();
          targetDisplay = electronScreen.getDisplayNearestPoint({
            x: winBounds.x + winBounds.width / 2,
            y: winBounds.y + winBounds.height / 2
          });
        }
        if (!cachedScreenSources) {
          cachedScreenSources = await desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: 0, height: 0 }
          });
        }
        let match = cachedScreenSources.find((s) => s.display_id === String(targetDisplay.id));
        if (!match) {
          cachedScreenSources = await desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: 0, height: 0 }
          });
          match = cachedScreenSources.find((s) => s.display_id === String(targetDisplay.id));
        }
        const chosen = match ?? cachedScreenSources[0];
        if (!chosen) {
          callback({});
          return;
        }
        callback({ video: chosen });
      } catch {
        callback({});
      }
    });
    const supportedSvgSchemes = /* @__PURE__ */ new Set([Schemas.file, Schemas.vscodeFileResource, Schemas.vscodeRemoteResource, Schemas.vscodeManagedRemoteResource, "devtools"]);
    const isSafeFrame = (requestFrame) => {
      for (let frame = requestFrame; frame; frame = frame.parent) {
        if (frame.isDestroyed()) {
          return false;
        }
        if (frame.url.startsWith(`${Schemas.vscodeWebview}://`)) {
          return true;
        }
      }
      return false;
    };
    const isSvgRequestFromSafeContext = (details) => {
      return details.resourceType === "xhr" || isSafeFrame(details.frame);
    };
    const isAllowedVsCodeFileRequest = (details) => {
      const frame = details.frame;
      if (!frame || frame.isDestroyed() || !this.windowsMainService) {
        return false;
      }
      const windows = getAllWindowsExcludingOffscreen();
      for (const window of windows) {
        if (frame.processId === window.webContents.mainFrame.processId) {
          return true;
        }
      }
      return false;
    };
    const isAllowedWebviewRequest = (uri, details) => {
      if (uri.path !== "/index.html") {
        return true;
      }
      const frame = details.frame;
      if (!frame || frame.isDestroyed() || !this.windowsMainService) {
        return false;
      }
      for (const window of this.windowsMainService.getWindows()) {
        if (window.win) {
          if (frame.processId === window.win.webContents.mainFrame.processId) {
            return true;
          }
        }
      }
      return false;
    };
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const uri = URI.parse(details.url);
      if (uri.scheme === Schemas.vscodeWebview) {
        if (!isAllowedWebviewRequest(uri, details)) {
          this.logService.error("Blocked vscode-webview request", details.url);
          return callback({ cancel: true });
        }
      }
      if (uri.scheme === Schemas.vscodeFileResource) {
        if (!isAllowedVsCodeFileRequest(details)) {
          this.logService.error("Blocked vscode-file request", details.url);
          return callback({ cancel: true });
        }
      }
      if (uri.path.endsWith(".svg")) {
        const isSafeResourceUrl = supportedSvgSchemes.has(uri.scheme);
        if (!isSafeResourceUrl) {
          return callback({ cancel: !isSvgRequestFromSafeContext(details) });
        }
      }
      return callback({ cancel: false });
    });
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = details.responseHeaders;
      const contentTypes = responseHeaders["content-type"] || responseHeaders["Content-Type"];
      if (contentTypes && Array.isArray(contentTypes)) {
        const uri = URI.parse(details.url);
        if (uri.path.endsWith(".svg")) {
          if (supportedSvgSchemes.has(uri.scheme)) {
            responseHeaders["Content-Type"] = ["image/svg+xml"];
            return callback({ cancel: false, responseHeaders });
          }
        }
        if (!uri.path.endsWith(Schemas.vscodeRemoteResource) && contentTypes.some((contentType) => contentType.toLowerCase().includes("image/svg"))) {
          return callback({ cancel: !isSvgRequestFromSafeContext(details) });
        }
      }
      return callback({ cancel: false });
    });
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      if (details.url.startsWith("https://vscode.download.prss.microsoft.com/")) {
        const responseHeaders = details.responseHeaders ?? /* @__PURE__ */ Object.create(null);
        if (responseHeaders["Access-Control-Allow-Origin"] === void 0) {
          responseHeaders["Access-Control-Allow-Origin"] = ["*"];
          return callback({ cancel: false, responseHeaders });
        }
      }
      return callback({ cancel: false });
    });
    const defaultSession = session.defaultSession;
    if (typeof defaultSession.setCodeCachePath === "function" && this.environmentMainService.codeCachePath) {
      defaultSession.setCodeCachePath(join(this.environmentMainService.codeCachePath, "chrome"));
    }
    if (isWindows) {
      if (this.configurationService.getValue("security.restrictUNCAccess") === false) {
        disableUNCAccessRestrictions();
      } else {
        addUNCHostToAllowlist(this.configurationService.getValue("security.allowedUNCHosts"));
      }
    }
  }
  registerListeners() {
    Event.once(this.lifecycleMainService.onWillShutdown)(() => this.dispose());
    registerContextMenuListener();
    app.on("accessibility-support-changed", (event, accessibilitySupportEnabled) => {
      this.windowsMainService?.sendToAll("vscode:accessibilitySupportChanged", accessibilitySupportEnabled);
    });
    app.on("activate", async (event, hasVisibleWindows) => {
      this.logService.trace("app#activate");
      if (!hasVisibleWindows) {
        await this.windowsMainService?.openEmptyWindow({ context: OpenContext.DOCK });
      }
    });
    app.on("web-contents-created", (event, contents) => {
      if (contents?.opener?.url.startsWith(`${Schemas.vscodeFileResource}://${VSCODE_AUTHORITY}/`)) {
        this.logService.trace('[aux window]  app.on("web-contents-created"): Registering auxiliary window');
        this.auxiliaryWindowsMainService?.registerWindow(contents);
      }
      contents.on("will-navigate", (event2) => {
        if (BrowserViewMainService.isBrowserViewWebContents(contents)) {
          return;
        }
        this.logService.error("webContents#will-navigate: Prevented webcontent navigation");
        event2.preventDefault();
      });
      contents.setWindowOpenHandler((details) => {
        if (details.url === "about:blank") {
          this.logService.trace("[aux window] webContents#setWindowOpenHandler: Allowing auxiliary window to open on about:blank");
          return {
            action: "allow",
            overrideBrowserWindowOptions: this.auxiliaryWindowsMainService?.createWindow(details)
          };
        } else {
          this.logService.trace(`webContents#setWindowOpenHandler: Prevented opening window with URL ${details.url}}`);
          this.nativeHostMainService?.openExternal(void 0, details.url);
          return { action: "deny" };
        }
      });
    });
    let macOpenFileURIs = [];
    let runningTimeout = void 0;
    app.on("open-file", (event, path) => {
      path = normalizeNFC(path);
      this.logService.trace("app#open-file: ", path);
      event.preventDefault();
      macOpenFileURIs.push(hasWorkspaceFileExtension(path) ? { workspaceUri: URI.file(path) } : { fileUri: URI.file(path) });
      if (runningTimeout !== void 0) {
        clearTimeout(runningTimeout);
        runningTimeout = void 0;
      }
      runningTimeout = setTimeout(async () => {
        await this.windowsMainService?.open({
          context: OpenContext.DOCK,
          cli: this.environmentMainService.args,
          urisToOpen: macOpenFileURIs,
          gotoLineMode: false,
          preferNewWindow: true
          /* dropping on the dock or opening from finder prefers to open in a new window */
        });
        macOpenFileURIs = [];
        runningTimeout = void 0;
      }, 100);
    });
    app.on("new-window-for-tab", async () => {
      await this.windowsMainService?.openEmptyWindow({ context: OpenContext.DESKTOP });
    });
    validatedIpcMain.handle("vscode:fetchShellEnv", (event) => {
      const window = this.windowsMainService?.getWindowByWebContents(event.sender);
      let args;
      let env;
      if (window?.config) {
        args = window.config;
        env = { ...process.env, ...window.config.userEnv };
      } else {
        args = this.environmentMainService.args;
        env = process.env;
      }
      return this.resolveShellEnvironment(args, env, false);
    });
    validatedIpcMain.on("vscode:toggleDevTools", (event) => event.sender.toggleDevTools());
    validatedIpcMain.on("vscode:openDevTools", (event) => event.sender.openDevTools());
    validatedIpcMain.on("vscode:reloadWindow", (event) => event.sender.reload());
    validatedIpcMain.handle("vscode:notifyZoomLevel", async (event, zoomLevel) => {
      const window = this.windowsMainService?.getWindowByWebContents(event.sender);
      if (window) {
        window.notifyZoomLevel(zoomLevel);
      }
    });
  }
  async startup() {
    this.logService.debug("Starting VS Code");
    this.logService.debug(`from: ${this.environmentMainService.appRoot}`);
    this.logService.debug("args:", this.environmentMainService.args);
    const win32AppUserModelId = this.productService.win32AppUserModelId;
    if (isWindows && win32AppUserModelId) {
      app.setAppUserModelId(win32AppUserModelId);
    }
    try {
      if (isMacintosh && this.configurationService.getValue("window.nativeTabs") === true && !systemPreferences.getUserDefault("NSUseImprovedLayoutPass", "boolean")) {
        systemPreferences.setUserDefault("NSUseImprovedLayoutPass", "boolean", true);
      }
    } catch (error) {
      this.logService.error(error);
    }
    const mainProcessElectronServer = new ElectronIPCServer();
    Event.once(this.lifecycleMainService.onWillShutdown)((e) => {
      if (e.reason === ShutdownReason.KILL) {
        mainProcessElectronServer.dispose();
      }
    });
    const [machineId, sqmId, devDeviceId] = await Promise.all([
      resolveMachineId(this.stateService, this.logService),
      resolveSqmId(this.stateService, this.logService),
      resolveDevDeviceId(this.stateService, this.logService)
    ]);
    const { sharedProcessReady, sharedProcessClient } = this.setupSharedProcess(machineId, sqmId, devDeviceId);
    const appInstantiationService = await this.initServices(machineId, sqmId, devDeviceId, sharedProcessReady);
    appInstantiationService.invokeFunction((accessor) => this._register(new ErrorTelemetry(accessor.get(ILogService), accessor.get(ITelemetryService))));
    const agentHostStarter = appInstantiationService.createInstance(ElectronAgentHostStarter, { machineId, sqmId, devDeviceId });
    appInstantiationService.createInstance(AgentHostProcessManager, agentHostStarter, process.platform);
    appInstantiationService.invokeFunction((accessor) => {
      accessor.get(IMeteredConnectionService).setTelemetryService(accessor.get(ITelemetryService));
    });
    appInstantiationService.invokeFunction((accessor) => accessor.get(IProxyAuthService));
    this._register(appInstantiationService.createInstance(UserDataProfilesHandler));
    appInstantiationService.invokeFunction((accessor) => this.initChannels(accessor, mainProcessElectronServer, sharedProcessClient));
    const initialProtocolUrls = await appInstantiationService.invokeFunction((accessor) => this.setupProtocolUrlHandlers(accessor, mainProcessElectronServer));
    this.setupManagedRemoteResourceUrlHandler(mainProcessElectronServer);
    this.lifecycleMainService.phase = LifecycleMainPhase.Ready;
    await appInstantiationService.invokeFunction((accessor) => this.openFirstWindow(accessor, initialProtocolUrls));
    this.lifecycleMainService.phase = LifecycleMainPhase.AfterWindowOpen;
    this.afterWindowOpen(appInstantiationService);
    const eventuallyPhaseScheduler = this._register(new RunOnceScheduler(() => {
      this._register(runWhenGlobalIdle(() => {
        this.lifecycleMainService.phase = LifecycleMainPhase.Eventually;
        this.eventuallyAfterWindowOpen(appInstantiationService);
      }, 2500));
    }, 2500));
    eventuallyPhaseScheduler.schedule();
  }
  async setupProtocolUrlHandlers(accessor, mainProcessElectronServer) {
    const windowsMainService = this.windowsMainService = accessor.get(IWindowsMainService);
    const urlService = accessor.get(IURLService);
    const nativeHostMainService = this.nativeHostMainService = accessor.get(INativeHostMainService);
    const dialogMainService = accessor.get(IDialogMainService);
    const app2 = this;
    urlService.registerHandler({
      async handleURL(uri, options) {
        return app2.handleProtocolUrl(windowsMainService, dialogMainService, urlService, uri, options);
      }
    });
    const activeWindowManager = this._register(new ActiveWindowManager({
      onDidOpenMainWindow: nativeHostMainService.onDidOpenMainWindow,
      onDidFocusMainWindow: nativeHostMainService.onDidFocusMainWindow,
      getActiveWindowId: () => nativeHostMainService.getActiveWindowId(-1)
    }));
    const activeWindowRouter = new StaticRouter((ctx) => activeWindowManager.getActiveClientId().then((id) => ctx === id));
    const urlHandlerRouter = new URLHandlerRouter(activeWindowRouter, this.logService);
    const urlHandlerChannel = mainProcessElectronServer.getChannel("urlHandler", urlHandlerRouter);
    urlService.registerHandler(new URLHandlerChannelClient(urlHandlerChannel));
    const initialProtocolUrls = await this.resolveInitialProtocolUrls(windowsMainService, dialogMainService);
    this._register(new ElectronURLListener(initialProtocolUrls?.urls, urlService, windowsMainService, this.environmentMainService, this.productService, this.logService));
    return initialProtocolUrls;
  }
  setupManagedRemoteResourceUrlHandler(mainProcessElectronServer) {
    const notFound = () => ({ statusCode: 404, data: "Not found" });
    const remoteResourceChannel = new Lazy(() => mainProcessElectronServer.getChannel(
      NODE_REMOTE_RESOURCE_CHANNEL_NAME,
      new NodeRemoteResourceRouter()
    ));
    protocol.registerBufferProtocol(Schemas.vscodeManagedRemoteResource, (request, callback) => {
      const url = URI.parse(request.url);
      if (!url.authority.startsWith("window:")) {
        return callback(notFound());
      }
      remoteResourceChannel.value.call(NODE_REMOTE_RESOURCE_IPC_METHOD_NAME, [url]).then(
        (r) => callback({ ...r, data: Buffer.from(r.body, "base64") }),
        (err) => {
          this.logService.warn("error dispatching remote resource call", err);
          callback({ statusCode: 500, data: String(err) });
        }
      );
    });
  }
  async resolveInitialProtocolUrls(windowsMainService, dialogMainService) {
    const protocolUrlsFromCommandLine = this.environmentMainService.args["open-url"] ? this.environmentMainService.args._urls || [] : [];
    if (protocolUrlsFromCommandLine.length > 0) {
      this.logService.trace("app#resolveInitialProtocolUrls() protocol urls from command line:", protocolUrlsFromCommandLine);
    }
    const protocolUrlsFromEvent = global.getOpenUrls?.() || [];
    if (protocolUrlsFromEvent.length > 0) {
      this.logService.trace(`app#resolveInitialProtocolUrls() protocol urls from macOS 'open-url' event:`, protocolUrlsFromEvent);
    }
    if (protocolUrlsFromCommandLine.length + protocolUrlsFromEvent.length === 0) {
      return void 0;
    }
    const protocolUrls = [
      ...protocolUrlsFromCommandLine,
      ...protocolUrlsFromEvent
    ].map((url) => {
      try {
        return { uri: URI.parse(url), originalUrl: url };
      } catch {
        this.logService.trace("app#resolveInitialProtocolUrls() protocol url failed to parse:", url);
        return void 0;
      }
    });
    const openables = [];
    const urls = [];
    for (const protocolUrl of protocolUrls) {
      if (!protocolUrl) {
        continue;
      }
      const windowOpenable = this.getWindowOpenableFromProtocolUrl(protocolUrl.uri);
      if (windowOpenable) {
        if (await this.shouldBlockOpenable(windowOpenable, windowsMainService, dialogMainService)) {
          this.logService.trace("app#resolveInitialProtocolUrls() protocol url was blocked:", protocolUrl.uri.toString(true));
          continue;
        } else {
          this.logService.trace("app#resolveInitialProtocolUrls() protocol url will be handled as window to open:", protocolUrl.uri.toString(true), windowOpenable);
          openables.push(windowOpenable);
        }
      } else {
        this.logService.trace("app#resolveInitialProtocolUrls() protocol url will be passed to active window for handling:", protocolUrl.uri.toString(true));
        urls.push(protocolUrl);
      }
    }
    return { urls, openables };
  }
  async shouldBlockOpenable(openable, windowsMainService, dialogMainService) {
    let openableUri;
    let message;
    if (isWorkspaceToOpen(openable)) {
      openableUri = openable.workspaceUri;
      message = localize("confirmOpenMessageWorkspace", "An external application wants to open '{0}' in {1}. Do you want to open this workspace file?", openableUri.scheme === Schemas.file ? getPathLabel(openableUri, { os: OS, tildify: this.environmentMainService }) : openableUri.toString(true), this.productService.nameShort);
    } else if (isFolderToOpen(openable)) {
      openableUri = openable.folderUri;
      message = localize("confirmOpenMessageFolder", "An external application wants to open '{0}' in {1}. Do you want to open this folder?", openableUri.scheme === Schemas.file ? getPathLabel(openableUri, { os: OS, tildify: this.environmentMainService }) : openableUri.toString(true), this.productService.nameShort);
    } else {
      openableUri = openable.fileUri;
      message = localize("confirmOpenMessageFileOrFolder", "An external application wants to open '{0}' in {1}. Do you want to open this file or folder?", openableUri.scheme === Schemas.file ? getPathLabel(openableUri, { os: OS, tildify: this.environmentMainService }) : openableUri.toString(true), this.productService.nameShort);
    }
    if (openableUri.scheme !== Schemas.file && openableUri.scheme !== Schemas.vscodeRemote) {
      return false;
    }
    const askForConfirmation = this.configurationService.getValue(CodeApplication.SECURITY_PROTOCOL_HANDLING_CONFIRMATION_SETTING_KEY[openableUri.scheme]);
    if (askForConfirmation === false) {
      return false;
    }
    const { response, checkboxChecked } = await dialogMainService.showMessageBox({
      type: "warning",
      buttons: [
        localize({ key: "open", comment: ["&& denotes a mnemonic"] }, "&&Yes"),
        localize({ key: "cancel", comment: ["&& denotes a mnemonic"] }, "&&No")
      ],
      message,
      detail: localize("confirmOpenDetail", "If you did not initiate this request, it may represent an attempted attack on your system. Unless you took an explicit action to initiate this request, you should press 'No'"),
      checkboxLabel: openableUri.scheme === Schemas.file ? localize("doNotAskAgainLocal", "Allow opening local paths without asking") : localize("doNotAskAgainRemote", "Allow opening remote paths without asking"),
      cancelId: 1
    });
    if (response !== 0) {
      return true;
    }
    if (checkboxChecked) {
      const request = { channel: "vscode:disablePromptForProtocolHandling", args: openableUri.scheme === Schemas.file ? "local" : "remote" };
      windowsMainService.sendToFocused(request.channel, request.args);
      windowsMainService.sendToOpeningWindow(request.channel, request.args);
    }
    return false;
  }
  getWindowOpenableFromProtocolUrl(uri) {
    if (!uri.path) {
      return void 0;
    }
    if (uri.authority === Schemas.file) {
      const fileUri = URI.file(uri.fsPath);
      if (hasWorkspaceFileExtension(fileUri)) {
        return { workspaceUri: fileUri };
      }
      return { fileUri };
    } else if (uri.authority === Schemas.vscodeRemote) {
      const secondSlash = uri.path.indexOf(
        posix.sep,
        1
        /* skip over the leading slash */
      );
      let authority;
      let path;
      if (secondSlash !== -1) {
        authority = uri.path.substring(1, secondSlash);
        path = uri.path.substring(secondSlash);
      } else {
        authority = uri.path.substring(1);
        path = "/";
      }
      let query = uri.query;
      const params = new URLSearchParams(uri.query);
      if (params.get("windowId") === "_blank") {
        params.delete("windowId");
        query = params.toString();
      }
      const remoteUri = URI.from({ scheme: Schemas.vscodeRemote, authority, path, query, fragment: uri.fragment });
      if (hasWorkspaceFileExtension(path)) {
        return { workspaceUri: remoteUri };
      }
      if (/:[\d]+$/.test(path)) {
        return { fileUri: remoteUri };
      }
      return { folderUri: remoteUri };
    }
    return void 0;
  }
  async handleProtocolUrl(windowsMainService, dialogMainService, urlService, uri, options) {
    this.logService.trace("app#handleProtocolUrl():", uri.toString(true), options);
    if (uri.scheme === this.productService.urlProtocol && uri.path === "workspace") {
      uri = uri.with({
        authority: Schemas.file,
        path: URI.parse(uri.query).path,
        query: ""
      });
    }
    let shouldOpenInNewWindow = false;
    const params = new URLSearchParams(uri.query);
    if (params.get("windowId") === "_blank") {
      this.logService.trace(`app#handleProtocolUrl() found 'windowId=_blank' as parameter, setting shouldOpenInNewWindow=true:`, uri.toString(true));
      params.delete("windowId");
      uri = uri.with({ query: params.toString() });
      shouldOpenInNewWindow = true;
    } else if (isMacintosh && windowsMainService.getWindowCount() === 0) {
      this.logService.trace(`app#handleProtocolUrl() running on macOS with no window open, setting shouldOpenInNewWindow=true:`, uri.toString(true));
      shouldOpenInNewWindow = true;
    }
    const continueOn = params.get("continueOn");
    if (continueOn !== null) {
      this.logService.trace(`app#handleProtocolUrl() found 'continueOn' as parameter:`, uri.toString(true));
      params.delete("continueOn");
      uri = uri.with({ query: params.toString() });
      this.environmentMainService.continueOn = continueOn ?? void 0;
    }
    const session2 = params.get("session");
    if (session2 !== null) {
      this.logService.trace(`app#handleProtocolUrl() found 'session' as parameter:`, uri.toString(true));
      params.delete("session");
      uri = uri.with({ query: params.toString() });
    }
    const windowOpenableFromProtocolUrl = this.getWindowOpenableFromProtocolUrl(uri);
    if (windowOpenableFromProtocolUrl) {
      if (await this.shouldBlockOpenable(windowOpenableFromProtocolUrl, windowsMainService, dialogMainService)) {
        this.logService.trace("app#handleProtocolUrl() protocol url was blocked:", uri.toString(true));
        return true;
      } else {
        this.logService.trace("app#handleProtocolUrl() opening protocol url as window:", windowOpenableFromProtocolUrl, uri.toString(true));
        const window = (await windowsMainService.open({
          context: OpenContext.LINK,
          cli: { ...this.environmentMainService.args },
          urisToOpen: [windowOpenableFromProtocolUrl],
          forceNewWindow: shouldOpenInNewWindow,
          gotoLineMode: true
          // remoteAuthority: will be determined based on windowOpenableFromProtocolUrl
        })).at(0);
        window?.focus();
        if (window && session2) {
          window.sendWhenReady("vscode:openChatSession", CancellationToken.None, session2);
        }
        return true;
      }
    }
    if (shouldOpenInNewWindow) {
      this.logService.trace("app#handleProtocolUrl() opening empty window and passing in protocol url:", uri.toString(true));
      const window = (await windowsMainService.open({
        context: OpenContext.LINK,
        cli: { ...this.environmentMainService.args },
        forceNewWindow: true,
        forceEmpty: true,
        gotoLineMode: true,
        remoteAuthority: getRemoteAuthority(uri)
      })).at(0);
      await window?.ready();
      return urlService.open(uri, options);
    }
    this.logService.trace("app#handleProtocolUrl(): not handled", uri.toString(true), options);
    return false;
  }
  setupSharedProcess(machineId, sqmId, devDeviceId) {
    const sharedProcess = this._register(this.mainInstantiationService.createInstance(SharedProcess, machineId, sqmId, devDeviceId));
    this._register(sharedProcess.onDidCrash(() => this.windowsMainService?.sendToFocused("vscode:reportSharedProcessCrash")));
    const sharedProcessClient = (async () => {
      this.logService.trace("Main->SharedProcess#connect");
      const port = await sharedProcess.connect();
      this.logService.trace("Main->SharedProcess#connect: connection established");
      return new MessagePortClient(port, "main");
    })();
    const sharedProcessReady = (async () => {
      await sharedProcess.whenReady();
      return sharedProcessClient;
    })();
    return { sharedProcessReady, sharedProcessClient };
  }
  async initServices(machineId, sqmId, devDeviceId, sharedProcessReady) {
    const services = new ServiceCollection();
    switch (process.platform) {
      case "win32":
        services.set(IUpdateService, new SyncDescriptor(Win32UpdateService));
        break;
      case "linux":
        if (isLinuxSnap) {
          services.set(IUpdateService, new SyncDescriptor(SnapUpdateService, [process.env["SNAP"], process.env["SNAP_REVISION"]]));
        } else {
          services.set(IUpdateService, new SyncDescriptor(LinuxUpdateService));
        }
        break;
      case "darwin":
        services.set(IUpdateService, new SyncDescriptor(DarwinUpdateService));
        break;
    }
    services.set(IWindowsMainService, new SyncDescriptor(WindowsMainService, [machineId, sqmId, devDeviceId, this.userEnv], false));
    services.set(IAuxiliaryWindowsMainService, new SyncDescriptor(AuxiliaryWindowsMainService, void 0, false));
    const dialogMainService = new DialogMainService(this.logService, this.productService);
    services.set(IDialogMainService, dialogMainService);
    services.set(ILaunchMainService, new SyncDescriptor(
      LaunchMainService,
      void 0,
      false
      /* proxied to other processes */
    ));
    services.set(IDiagnosticsMainService, new SyncDescriptor(
      DiagnosticsMainService,
      void 0,
      false
      /* proxied to other processes */
    ));
    services.set(IDiagnosticsService, ProxyChannel.toService(getDelayedChannel(sharedProcessReady.then((client) => client.getChannel("diagnostics")))));
    services.set(IEncryptionMainService, new SyncDescriptor(EncryptionMainService));
    services.set(IBrowserViewMainService, new SyncDescriptor(
      BrowserViewMainService,
      void 0,
      false
      /* proxied to other processes */
    ));
    services.set(IBrowserViewGroupMainService, new SyncDescriptor(
      BrowserViewGroupMainService,
      void 0,
      false
      /* proxied to other processes */
    ));
    services.set(IKeyboardLayoutMainService, new SyncDescriptor(KeyboardLayoutMainService));
    services.set(INativeHostMainService, new SyncDescriptor(
      NativeHostMainService,
      void 0,
      false
      /* proxied to other processes */
    ));
    services.set(IGlobalKeybindingsMainService, new SyncDescriptor(GlobalKeybindingsMainService, [globalShortcut]));
    const meteredConnectionService = new MeteredConnectionMainService(this.configurationService);
    services.set(IMeteredConnectionService, meteredConnectionService);
    services.set(ITerminalSandboxService, new SyncDescriptor(NullTerminalSandboxService));
    services.set(IAgentNetworkFilterService, new SyncDescriptor(AgentNetworkFilterService, void 0, true));
    services.set(IWebContentExtractorService, new SyncDescriptor(
      NativeWebContentExtractorService,
      void 0,
      false
      /* proxied to other processes */
    ));
    services.set(IWebviewManagerService, new SyncDescriptor(WebviewMainService));
    services.set(IMenubarMainService, new SyncDescriptor(MenubarMainService));
    services.set(IExtensionHostStarter, new SyncDescriptor(ExtensionHostStarter));
    services.set(IStorageMainService, new SyncDescriptor(StorageMainService));
    services.set(IApplicationStorageMainService, new SyncDescriptor(ApplicationStorageMainService));
    const ptyHostStarter = new ElectronPtyHostStarter({
      graceTime: LocalReconnectConstants.GraceTime,
      shortGraceTime: LocalReconnectConstants.ShortGraceTime,
      scrollback: this.configurationService.getValue(TerminalSettingId.PersistentSessionScrollback) ?? 100
    }, this.configurationService, this.environmentMainService, this.lifecycleMainService, this.logService);
    const ptyHostService = new PtyHostService(
      ptyHostStarter,
      this.configurationService,
      this.logService,
      this.loggerService
    );
    services.set(ILocalPtyService, ptyHostService);
    if (isWindows) {
      services.set(IExternalTerminalMainService, new SyncDescriptor(WindowsExternalTerminalService));
    } else if (isMacintosh) {
      services.set(IExternalTerminalMainService, new SyncDescriptor(MacExternalTerminalService));
    } else if (isLinux) {
      services.set(IExternalTerminalMainService, new SyncDescriptor(LinuxExternalTerminalService));
    }
    services.set(ISandboxHelperMainService, new SyncDescriptor(SandboxHelperService));
    const backupMainService = new BackupMainService(this.environmentMainService, this.configurationService, this.logService, this.stateService);
    services.set(IBackupMainService, backupMainService);
    const workspacesManagementMainService = new WorkspacesManagementMainService(this.environmentMainService, this.logService, this.userDataProfilesMainService, backupMainService, dialogMainService);
    services.set(IWorkspacesManagementMainService, workspacesManagementMainService);
    services.set(IWorkspacesService, new SyncDescriptor(
      WorkspacesMainService,
      void 0,
      false
      /* proxied to other processes */
    ));
    services.set(IWorkspacesHistoryMainService, new SyncDescriptor(WorkspacesHistoryMainService, void 0, false));
    services.set(IURLService, new SyncDescriptor(
      NativeURLService,
      void 0,
      false
      /* proxied to other processes */
    ));
    if (supportsTelemetry(this.productService, this.environmentMainService)) {
      const isInternal = isInternalTelemetry(this.productService, this.configurationService);
      const channel = getDelayedChannel(sharedProcessReady.then((client) => client.getChannel("telemetryAppender")));
      const appender = new TelemetryAppenderClient(channel);
      const commonProperties = resolveCommonProperties(release(), hostname(), process.arch, this.productService.commit, this.productService.version, machineId, sqmId, devDeviceId, isInternal, this.productService.date);
      const piiPaths = getPiiPathsFromEnvironment(this.environmentMainService);
      const config = { appenders: [appender], commonProperties, piiPaths, sendErrorTelemetry: true };
      services.set(ITelemetryService, new SyncDescriptor(TelemetryService, [config], false));
    } else {
      services.set(ITelemetryService, NullTelemetryService);
    }
    services.set(IExtensionsProfileScannerService, new SyncDescriptor(ExtensionsProfileScannerService, void 0, true));
    services.set(IExtensionsScannerService, new SyncDescriptor(ExtensionsScannerService, void 0, true));
    services.set(IUtilityProcessWorkerMainService, new SyncDescriptor(UtilityProcessWorkerMainService, void 0, true));
    services.set(IProxyAuthService, new SyncDescriptor(ProxyAuthService));
    services.set(INativeMcpDiscoveryHelperService, new SyncDescriptor(NativeMcpDiscoveryHelperService));
    services.set(IMcpGatewayService, new SyncDescriptor(McpGatewayService));
    services.set(ICSSDevelopmentService, new SyncDescriptor(CSSDevelopmentService, void 0, true));
    await Promises.settled([
      backupMainService.initialize(),
      workspacesManagementMainService.initialize()
    ]);
    return this.mainInstantiationService.createChild(services);
  }
  initChannels(accessor, mainProcessElectronServer, sharedProcessClient) {
    const disposables = this._register(new DisposableStore());
    const launchChannel = ProxyChannel.fromService(accessor.get(ILaunchMainService), disposables, { disableMarshalling: true });
    this.mainProcessNodeIpcServer.registerChannel("launch", launchChannel);
    const diagnosticsChannel = ProxyChannel.fromService(accessor.get(IDiagnosticsMainService), disposables, { disableMarshalling: true });
    this.mainProcessNodeIpcServer.registerChannel("diagnostics", diagnosticsChannel);
    const policyChannel = disposables.add(new PolicyChannel(accessor.get(IPolicyService)));
    mainProcessElectronServer.registerChannel("policy", policyChannel);
    sharedProcessClient.then((client) => client.registerChannel("policy", policyChannel));
    const nativeManagedSettingsChannel = disposables.add(new NativeManagedSettingsChannel(accessor.get(INativeManagedSettingsService)));
    mainProcessElectronServer.registerChannel("nativeManagedSettings", nativeManagedSettingsChannel);
    const fileManagedSettingsChannel = disposables.add(new FileManagedSettingsChannel(accessor.get(IFileManagedSettingsService)));
    mainProcessElectronServer.registerChannel("fileManagedSettings", fileManagedSettingsChannel);
    const diskFileSystemProvider = this.fileService.getProvider(Schemas.file);
    assertType(diskFileSystemProvider instanceof DiskFileSystemProvider);
    const fileSystemProviderChannel = disposables.add(new DiskFileSystemProviderChannel(diskFileSystemProvider, this.logService, this.environmentMainService));
    mainProcessElectronServer.registerChannel(LOCAL_FILE_SYSTEM_CHANNEL_NAME, fileSystemProviderChannel);
    sharedProcessClient.then((client) => client.registerChannel(LOCAL_FILE_SYSTEM_CHANNEL_NAME, fileSystemProviderChannel));
    const userDataProfilesService = ProxyChannel.fromService(accessor.get(IUserDataProfilesMainService), disposables);
    mainProcessElectronServer.registerChannel("userDataProfiles", userDataProfilesService);
    sharedProcessClient.then((client) => client.registerChannel("userDataProfiles", userDataProfilesService));
    const updateService = accessor.get(IUpdateService);
    const updateChannel = new UpdateChannel(updateService);
    mainProcessElectronServer.registerChannel("update", updateChannel);
    this._register(new NotAvailableUpdateDialog(updateService, accessor.get(IDialogMainService), accessor.get(IWindowsMainService)));
    const meteredConnectionChannel = new MeteredConnectionChannel(accessor.get(IMeteredConnectionService));
    mainProcessElectronServer.registerChannel(METERED_CONNECTION_CHANNEL, meteredConnectionChannel);
    sharedProcessClient.then((client) => client.registerChannel(METERED_CONNECTION_CHANNEL, meteredConnectionChannel));
    const processChannel = ProxyChannel.fromService(new ProcessMainService(this.logService, accessor.get(IDiagnosticsService), accessor.get(IDiagnosticsMainService)), disposables);
    mainProcessElectronServer.registerChannel("process", processChannel);
    const encryptionChannel = ProxyChannel.fromService(accessor.get(IEncryptionMainService), disposables);
    mainProcessElectronServer.registerChannel("encryption", encryptionChannel);
    const browserViewChannel = ProxyChannel.fromService(accessor.get(IBrowserViewMainService), disposables);
    mainProcessElectronServer.registerChannel(ipcBrowserViewChannelName, browserViewChannel);
    sharedProcessClient.then((client) => client.registerChannel(ipcBrowserViewChannelName, browserViewChannel));
    const browserViewGroupChannel = ProxyChannel.fromService(accessor.get(IBrowserViewGroupMainService), disposables);
    mainProcessElectronServer.registerChannel(ipcBrowserViewGroupChannelName, browserViewGroupChannel);
    sharedProcessClient.then((client) => client.registerChannel(ipcBrowserViewGroupChannelName, browserViewGroupChannel));
    const signChannel = ProxyChannel.fromService(accessor.get(ISignService), disposables);
    mainProcessElectronServer.registerChannel("sign", signChannel);
    const keyboardLayoutChannel = ProxyChannel.fromService(accessor.get(IKeyboardLayoutMainService), disposables);
    mainProcessElectronServer.registerChannel("keyboardLayout", keyboardLayoutChannel);
    this.nativeHostMainService = accessor.get(INativeHostMainService);
    const nativeHostChannel = ProxyChannel.fromService(this.nativeHostMainService, disposables, {
      // This event has main-process consumers but no IPC consumer, so its buffer would never drain.
      unbufferedEvents: ["onDidBlurMainWindow"]
    });
    mainProcessElectronServer.registerChannel("nativeHost", nativeHostChannel);
    sharedProcessClient.then((client) => client.registerChannel("nativeHost", nativeHostChannel));
    const webContentExtractorChannel = ProxyChannel.fromService(accessor.get(IWebContentExtractorService), disposables);
    mainProcessElectronServer.registerChannel("webContentExtractor", webContentExtractorChannel);
    const workspacesChannel = ProxyChannel.fromService(accessor.get(IWorkspacesService), disposables);
    mainProcessElectronServer.registerChannel("workspaces", workspacesChannel);
    const menubarChannel = ProxyChannel.fromService(accessor.get(IMenubarMainService), disposables);
    mainProcessElectronServer.registerChannel("menubar", menubarChannel);
    const urlChannel = ProxyChannel.fromService(accessor.get(IURLService), disposables);
    mainProcessElectronServer.registerChannel("url", urlChannel);
    const webviewChannel = ProxyChannel.fromService(accessor.get(IWebviewManagerService), disposables);
    mainProcessElectronServer.registerChannel("webview", webviewChannel);
    const storageChannel = disposables.add(new StorageDatabaseChannel(this.logService, accessor.get(IStorageMainService)));
    mainProcessElectronServer.registerChannel("storage", storageChannel);
    sharedProcessClient.then((client) => client.registerChannel("storage", storageChannel));
    const profileStorageListener = disposables.add(new ProfileStorageChangesListenerChannel(accessor.get(IStorageMainService), accessor.get(IUserDataProfilesMainService), this.logService));
    sharedProcessClient.then((client) => client.registerChannel("profileStorageListener", profileStorageListener));
    const ptyHostChannel = ProxyChannel.fromService(accessor.get(ILocalPtyService), disposables);
    mainProcessElectronServer.registerChannel(TerminalIpcChannels.LocalPty, ptyHostChannel);
    const externalTerminalChannel = ProxyChannel.fromService(accessor.get(IExternalTerminalMainService), disposables);
    mainProcessElectronServer.registerChannel("externalTerminal", externalTerminalChannel);
    const sandboxHelperChannel = ProxyChannel.fromService(accessor.get(ISandboxHelperMainService), disposables);
    mainProcessElectronServer.registerChannel("sandboxHelper", sandboxHelperChannel);
    const mcpDiscoveryChannel = ProxyChannel.fromService(accessor.get(INativeMcpDiscoveryHelperService), disposables);
    mainProcessElectronServer.registerChannel(NativeMcpDiscoveryHelperChannelName, mcpDiscoveryChannel);
    const mcpGatewayChannel = this._register(new McpGatewayChannel(mainProcessElectronServer, accessor.get(IMcpGatewayService), accessor.get(ILoggerMainService)));
    mainProcessElectronServer.registerChannel(McpGatewayChannelName, mcpGatewayChannel);
    const loggerChannel = this._register(new LoggerChannel(accessor.get(ILoggerMainService)));
    mainProcessElectronServer.registerChannel("logger", loggerChannel);
    sharedProcessClient.then((client) => client.registerChannel("logger", loggerChannel));
    const electronExtensionHostDebugBroadcastChannel = new ElectronExtensionHostDebugBroadcastChannel(accessor.get(IWindowsMainService));
    mainProcessElectronServer.registerChannel("extensionhostdebugservice", electronExtensionHostDebugBroadcastChannel);
    const extensionHostStarterChannel = ProxyChannel.fromService(accessor.get(IExtensionHostStarter), disposables);
    mainProcessElectronServer.registerChannel(ipcExtensionHostStarterChannelName, extensionHostStarterChannel);
    const utilityProcessWorkerChannel = ProxyChannel.fromService(accessor.get(IUtilityProcessWorkerMainService), disposables);
    mainProcessElectronServer.registerChannel(ipcUtilityProcessWorkerChannelName, utilityProcessWorkerChannel);
  }
  async openFirstWindow(accessor, initialProtocolUrls) {
    const windowsMainService = this.windowsMainService = accessor.get(IWindowsMainService);
    this.auxiliaryWindowsMainService = accessor.get(IAuxiliaryWindowsMainService);
    const context = isLaunchedFromCli(process.env) ? OpenContext.CLI : OpenContext.DESKTOP;
    const args = this.environmentMainService.args;
    if (args["agents"]) {
      return windowsMainService.openAgentsWindow({
        context,
        cli: args,
        initialStartup: true
      });
    }
    if (initialProtocolUrls) {
      if (initialProtocolUrls.openables.length > 0) {
        return windowsMainService.open({
          context,
          cli: args,
          urisToOpen: initialProtocolUrls.openables,
          gotoLineMode: true,
          initialStartup: true
          // remoteAuthority: will be determined based on openables
        });
      }
      if (initialProtocolUrls.urls.length > 0) {
        for (const protocolUrl of initialProtocolUrls.urls) {
          const params = new URLSearchParams(protocolUrl.uri.query);
          if (params.get("windowId") === "_blank") {
            params.delete("windowId");
            protocolUrl.originalUrl = protocolUrl.uri.toString(true);
            protocolUrl.uri = protocolUrl.uri.with({ query: params.toString() });
            return windowsMainService.open({
              context,
              cli: args,
              forceNewWindow: true,
              forceEmpty: true,
              gotoLineMode: true,
              initialStartup: true
              // remoteAuthority: will be determined based on openables
            });
          }
        }
      }
    }
    const macOpenFiles = global.macOpenFiles ?? [];
    const hasCliArgs = args._.length;
    const hasFolderURIs = !!args["folder-uri"];
    const hasFileURIs = !!args["file-uri"];
    const noRecentEntry = args["skip-add-to-recently-opened"] === true;
    const waitMarkerFileURI = args.wait && args.waitMarkerFilePath ? URI.file(args.waitMarkerFilePath) : void 0;
    const remoteAuthority = args.remote || void 0;
    const forceProfile = args.profile;
    const forceTempProfile = args["profile-temp"];
    if (!hasCliArgs && !hasFolderURIs && !hasFileURIs) {
      if (args["new-window"] || forceProfile || forceTempProfile) {
        return windowsMainService.open({
          context,
          cli: args,
          forceNewWindow: true,
          forceEmpty: true,
          noRecentEntry,
          waitMarkerFileURI,
          initialStartup: true,
          remoteAuthority,
          forceProfile,
          forceTempProfile
        });
      }
      if (macOpenFiles.length) {
        return windowsMainService.open({
          context: OpenContext.DOCK,
          cli: args,
          urisToOpen: macOpenFiles.map((path) => {
            path = normalizeNFC(path);
            return hasWorkspaceFileExtension(path) ? { workspaceUri: URI.file(path) } : { fileUri: URI.file(path) };
          }),
          noRecentEntry,
          waitMarkerFileURI,
          initialStartup: true
          // remoteAuthority: will be determined based on macOpenFiles
        });
      }
    }
    return windowsMainService.open({
      context,
      cli: args,
      forceNewWindow: args["new-window"],
      diffMode: args.diff,
      mergeMode: args.merge,
      noRecentEntry,
      waitMarkerFileURI,
      gotoLineMode: args.goto,
      initialStartup: true,
      remoteAuthority,
      forceProfile,
      forceTempProfile
    });
  }
  afterWindowOpen(instantiationService) {
    if (isWindows) {
      initWindowsVersionInfo();
    }
    this.installMutex();
    protocol.registerHttpProtocol(Schemas.vscodeRemoteResource, (request, callback) => {
      callback({
        url: request.url.replace(/^vscode-remote-resource:/, "http:"),
        method: request.method
      });
    });
    this.resolveShellEnvironment(this.environmentMainService.args, process.env, true);
    this.updateCrashReporterEnablement();
    if (isMacintosh && app.runningUnderARM64Translation) {
      this.windowsMainService?.sendToFocused("vscode:showTranslatedBuildWarning");
    }
    instantiationService.invokeFunction((accessor) => {
      const telemetryService = accessor.get(ITelemetryService);
      const getPowerEventData = () => ({
        idleState: powerMonitor.getSystemIdleState(60),
        idleTime: powerMonitor.getSystemIdleTime(),
        thermalState: powerMonitor.getCurrentThermalState(),
        onBattery: powerMonitor.isOnBatteryPower()
      });
      this._register(Event.fromNodeEventEmitter(powerMonitor, "suspend")(() => {
        telemetryService.publicLog2("power.suspend", getPowerEventData());
      }));
      this._register(Event.fromNodeEventEmitter(powerMonitor, "resume")(() => {
        telemetryService.publicLog2("power.resume", getPowerEventData());
      }));
    });
    if (isMacintosh) {
      instantiationService.invokeFunction((accessor) => {
        const telemetryService = accessor.get(ITelemetryService);
        const initialGpuFeatureStatus = app.getGPUFeatureStatus();
        const skiaGraphiteEnabled = initialGpuFeatureStatus["skia_graphite"];
        if (skiaGraphiteEnabled === "enabled") {
          const gpuInfoUpdate = Event.fromNodeEventEmitter(app, "gpu-info-update");
          const pendingGpuInfoListener = this._register(new MutableDisposable());
          this._register(Event.fromNodeEventEmitter(app, "child-process-gone", (event, details) => ({ event, details }))(({ details }) => {
            if (details.type === "GPU" && details.reason === "crashed") {
              pendingGpuInfoListener.value = Event.once(gpuInfoUpdate)(() => {
                const currentGpuFeatureStatus = app.getGPUFeatureStatus();
                const currentRasterizationStatus = currentGpuFeatureStatus["rasterization"];
                if (currentRasterizationStatus !== "enabled") {
                  let gpuLogMessages = [];
                  const customApp = app;
                  if (typeof customApp.getGPULogMessages === "function") {
                    gpuLogMessages = customApp.getGPULogMessages().slice(-10).map((log) => log.message);
                  }
                  telemetryService.publicLog2("gpu.crash.fallback", {
                    gpuFeatureStatus: JSON.stringify(currentGpuFeatureStatus),
                    gpuLogMessages: JSON.stringify(gpuLogMessages)
                  });
                }
              });
            }
          }));
        }
      });
    }
    {
      const customApp = app;
      instantiationService.invokeFunction((accessor) => {
        const telemetryService = accessor.get(ITelemetryService);
        this._register(Event.fromNodeEventEmitter(customApp, "network-process-launched", (_event, details) => details)((details) => {
          this.logService.info(`[network process] launched with pid ${details.pid}`);
          telemetryService.publicLog2("networkProcess.launched", {});
        }));
        this._register(Event.fromNodeEventEmitter(customApp, "network-process-gone", (_event, details) => details)((details) => {
          this.logService.info(`[network process] gone - pid: ${details.pid}, exitCode: ${details.exitCode}, crashed: ${details.crashed}, crashedPreIPC: ${details.crashedPreIPC}`);
          telemetryService.publicLog2("networkProcess.gone", {
            exitCode: details.exitCode,
            crashed: details.crashed,
            crashedPreIPC: details.crashedPreIPC
          });
        }));
      });
    }
  }
  async installMutex() {
    const win32MutexName = this.productService.win32MutexName;
    if (isWindows && win32MutexName && isInnoSetupInstall()) {
      try {
        const WindowsMutex = await import("@vscode/windows-mutex");
        const mutex = new WindowsMutex.Mutex(win32MutexName);
        Event.once(this.lifecycleMainService.onWillShutdown)(() => mutex.release());
      } catch (error) {
        this.logService.error(error);
      }
    }
  }
  async resolveShellEnvironment(args, env, notifyOnError) {
    try {
      return await getResolvedShellEnv(this.configurationService, this.logService, args, env);
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      if (notifyOnError) {
        this.windowsMainService?.sendToFocused("vscode:showResolveShellEnvError", errorMessage);
      } else {
        this.logService.error(errorMessage);
      }
    }
    return {};
  }
  async updateCrashReporterEnablement() {
    try {
      const argvContent = await this.fileService.readFile(this.environmentMainService.argvResource);
      const argvString = argvContent.value.toString();
      const argvJSON = parse(argvString);
      const telemetryLevel = getTelemetryLevel(this.configurationService);
      const enableCrashReporter = telemetryLevel >= TelemetryLevel.CRASH;
      if (argvJSON["enable-crash-reporter"] === void 0) {
        const additionalArgvContent = [
          "",
          "	// Allows to disable crash reporting.",
          "	// Should restart the app if the value is changed.",
          `	"enable-crash-reporter": ${enableCrashReporter},`,
          "",
          "	// Unique id used for correlating crash reports sent from this instance.",
          "	// Do not edit this value.",
          `	"crash-reporter-id": "${generateUuid()}"`,
          "}"
        ];
        const newArgvString = argvString.substring(0, argvString.length - 2).concat(",\n", additionalArgvContent.join("\n"));
        await this.fileService.writeFile(this.environmentMainService.argvResource, VSBuffer.fromString(newArgvString));
      } else {
        const newArgvString = argvString.replace(/"enable-crash-reporter": .*,/, `"enable-crash-reporter": ${enableCrashReporter},`);
        if (newArgvString !== argvString) {
          await this.fileService.writeFile(this.environmentMainService.argvResource, VSBuffer.fromString(newArgvString));
        }
      }
    } catch (error) {
      this.logService.error(error);
      this.windowsMainService?.sendToFocused("vscode:showArgvParseWarning");
    }
  }
  eventuallyAfterWindowOpen(instantiationService) {
    validateDevDeviceId(this.stateService, this.logService);
    instantiationService.invokeFunction((accessor) => {
      const telemetryService = accessor.get(ITelemetryService);
      if (telemetryService.telemetryLevel < TelemetryLevel.USAGE) {
        return;
      }
      const nativeHostMainService = accessor.get(INativeHostMainService);
      void this.logOSProxyConfigTelemetry(nativeHostMainService, telemetryService);
    });
  }
  async logOSProxyConfigTelemetry(nativeHostMainService, telemetryService) {
    const startTime = Date.now();
    try {
      const config = await nativeHostMainService.readProxyConfigWithPackage(void 0);
      const durationMs = Date.now() - startTime;
      const pacScriptStats = config.pac ? getPACScriptStats(config.pac.content) : void 0;
      telemetryService.publicLog2("osProxyConfig", {
        success: true,
        durationMs,
        platformKind: config.platform?.kind ?? "none",
        autoDetect: config.autoDetect,
        httpProxyEnvironmentState: getOSProxyEnvironmentState(config.environment.httpProxy),
        httpsProxyEnvironmentState: getOSProxyEnvironmentState(config.environment.httpsProxy),
        allProxyEnvironmentState: getOSProxyEnvironmentState(config.environment.allProxy),
        noProxyEnvironmentState: getOSProxyEnvironmentState(config.environment.noProxy),
        wpadDhcpState: config.wpadDhcp.state,
        wpadDnsState: config.wpadDns.state,
        configuredPacState: config.configuredPac.state,
        hasConfiguredPac: !!config.pacUrl,
        hasLoadedPac: !!config.pac,
        pacSource: config.pac?.source ?? "none",
        pacScriptCharacterCount: pacScriptStats?.characterCount,
        pacScriptLineCount: pacScriptStats?.lineCount,
        pacScriptReturnCount: pacScriptStats?.returnCount,
        hasHttpProxy: !!config.staticRules?.http,
        hasHttpsProxy: !!config.staticRules?.https,
        hasSocksProxy: !!config.staticRules?.socks,
        hasBypassRules: hasOSProxyBypassRules(config),
        excludeSimpleHostnames: config.platform?.kind === "macos" ? config.platform.excludeSimpleHostnames : void 0
      });
    } catch {
      telemetryService.publicLog2("osProxyConfig", {
        success: false,
        durationMs: Date.now() - startTime
      });
    }
  }
};
CodeApplication.SECURITY_PROTOCOL_HANDLING_CONFIRMATION_SETTING_KEY = {
  [Schemas.file]: "security.promptForLocalFileProtocolHandling",
  [Schemas.vscodeRemote]: "security.promptForRemoteFileProtocolHandling"
};
CodeApplication = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ILogService),
  __decorateParam(4, ILoggerService),
  __decorateParam(5, IEnvironmentMainService),
  __decorateParam(6, ILifecycleMainService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IStateService),
  __decorateParam(9, IFileService),
  __decorateParam(10, IProductService),
  __decorateParam(11, IUserDataProfilesMainService)
], CodeApplication);
function hasOSProxyBypassRules(config) {
  switch (config.platform?.kind) {
    case "windows":
      return !!config.platform.proxyBypass;
    case "macos":
      return config.platform.excludeSimpleHostnames || config.platform.exceptions.length > 0;
    case "linux":
      return config.platform.ignoreHosts.length > 0;
    default:
      return false;
  }
}
function getOSProxyEnvironmentState(status) {
  return status ? status.error ? "invalid" : "configured" : "unset";
}
function getPACScriptStats(content) {
  return {
    characterCount: content.length,
    lineCount: content.length === 0 ? 0 : content.split(/\r\n|\r|\n/).length,
    returnCount: content.match(/\breturn\b/g)?.length ?? 0
  };
}
export {
  CodeApplication
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxjb2RlXFxlbGVjdHJvbi1tYWluXFxhcHAudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhcHAsIEJyb3dzZXJXaW5kb3csIGRlc2t0b3BDYXB0dXJlciwgRGV0YWlscywgZ2xvYmFsU2hvcnRjdXQsIEdQVUZlYXR1cmVTdGF0dXMsIHBvd2VyTW9uaXRvciwgcHJvdG9jb2wsIHNjcmVlbiBhcyBlbGVjdHJvblNjcmVlbiwgc2Vzc2lvbiwgU2Vzc2lvbiwgc3lzdGVtUHJlZmVyZW5jZXMsIFdlYkZyYW1lTWFpbiB9IGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB7IGFkZFVOQ0hvc3RUb0FsbG93bGlzdCwgZGlzYWJsZVVOQ0FjY2Vzc1Jlc3RyaWN0aW9ucyB9IGZyb20gJy4uLy4uL2Jhc2Uvbm9kZS91bmMuanMnO1xuaW1wb3J0IHsgdmFsaWRhdGVkSXBjTWFpbiB9IGZyb20gJy4uLy4uL2Jhc2UvcGFydHMvaXBjL2VsZWN0cm9uLW1haW4vaXBjTWFpbi5qcyc7XG5pbXBvcnQgeyBob3N0bmFtZSwgcmVsZWFzZSB9IGZyb20gJ29zJztcbmltcG9ydCB7IGluaXRXaW5kb3dzVmVyc2lvbkluZm8gfSBmcm9tICcuLi8uLi9iYXNlL25vZGUvd2luZG93c1ZlcnNpb24uanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2pzb25jLmpzJztcbmltcG9ydCB7IGdldFBhdGhMYWJlbCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcywgVlNDT0RFX0FVVEhPUklUWSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgam9pbiwgcG9zaXggfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IElQcm9jZXNzRW52aXJvbm1lbnQsIGlzTGludXgsIGlzTGludXhTbmFwLCBpc01hY2ludG9zaCwgaXNXaW5kb3dzLCBPUyB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNvbnRleHRNZW51TGlzdGVuZXIgfSBmcm9tICcuLi8uLi9iYXNlL3BhcnRzL2NvbnRleHRtZW51L2VsZWN0cm9uLW1haW4vY29udGV4dG1lbnUuanMnO1xuaW1wb3J0IHsgZ2V0RGVsYXllZENoYW5uZWwsIFByb3h5Q2hhbm5lbCwgU3RhdGljUm91dGVyIH0gZnJvbSAnLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBTZXJ2ZXIgYXMgRWxlY3Ryb25JUENTZXJ2ZXIgfSBmcm9tICcuLi8uLi9iYXNlL3BhcnRzL2lwYy9lbGVjdHJvbi1tYWluL2lwYy5lbGVjdHJvbi5qcyc7XG5pbXBvcnQgeyBDbGllbnQgYXMgTWVzc2FnZVBvcnRDbGllbnQgfSBmcm9tICcuLi8uLi9iYXNlL3BhcnRzL2lwYy9lbGVjdHJvbi1tYWluL2lwYy5tcC5qcyc7XG5pbXBvcnQgeyBTZXJ2ZXIgYXMgTm9kZUlQQ1NlcnZlciB9IGZyb20gJy4uLy4uL2Jhc2UvcGFydHMvaXBjL25vZGUvaXBjLm5ldC5qcyc7XG5pbXBvcnQgeyBJUHJveHlBdXRoU2VydmljZSwgUHJveHlBdXRoU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9lbGVjdHJvbi1tYWluL2F1dGguanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUJhY2t1cE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vYmFja3VwL2VsZWN0cm9uLW1haW4vYmFja3VwLmpzJztcbmltcG9ydCB7IEJhY2t1cE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vYmFja3VwL2VsZWN0cm9uLW1haW4vYmFja3VwTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbGVjdHJvbkV4dGVuc2lvbkhvc3REZWJ1Z0Jyb2FkY2FzdENoYW5uZWwgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9kZWJ1Zy9lbGVjdHJvbi1tYWluL2V4dGVuc2lvbkhvc3REZWJ1Z0lwYy5qcyc7XG5pbXBvcnQgeyBJRGlhZ25vc3RpY3NTZXJ2aWNlLCBJR1BVTG9nTWVzc2FnZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2RpYWdub3N0aWNzL2NvbW1vbi9kaWFnbm9zdGljcy5qcyc7XG5pbXBvcnQgeyBEaWFnbm9zdGljc01haW5TZXJ2aWNlLCBJRGlhZ25vc3RpY3NNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2RpYWdub3N0aWNzL2VsZWN0cm9uLW1haW4vZGlhZ25vc3RpY3NNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEaWFsb2dNYWluU2VydmljZSwgSURpYWxvZ01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9lbGVjdHJvbi1tYWluL2RpYWxvZ01haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFbmNyeXB0aW9uTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9lbmNyeXB0aW9uL2NvbW1vbi9lbmNyeXB0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFbmNyeXB0aW9uTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9lbmNyeXB0aW9uL2VsZWN0cm9uLW1haW4vZW5jcnlwdGlvbk1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlwY0Jyb3dzZXJWaWV3Q2hhbm5lbE5hbWUgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgaXBjQnJvd3NlclZpZXdHcm91cENoYW5uZWxOYW1lIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJWaWV3R3JvdXAuanMnO1xuaW1wb3J0IHsgQnJvd3NlclZpZXdNYWluU2VydmljZSwgSUJyb3dzZXJWaWV3TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9lbGVjdHJvbi1tYWluL2Jyb3dzZXJWaWV3TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQnJvd3NlclZpZXdHcm91cE1haW5TZXJ2aWNlLCBJQnJvd3NlclZpZXdHcm91cE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvZWxlY3Ryb24tbWFpbi9icm93c2VyVmlld0dyb3VwTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTmF0aXZlUGFyc2VkQXJncyB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9hcmd2LmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvZWxlY3Ryb24tbWFpbi9lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzTGF1bmNoZWRGcm9tQ2xpIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvbm9kZS9hcmd2SGVscGVyLmpzJztcbmltcG9ydCB7IGdldFJlc29sdmVkU2hlbGxFbnYgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9zaGVsbC9ub2RlL3NoZWxsRW52LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25Ib3N0U3RhcnRlciwgaXBjRXh0ZW5zaW9uSG9zdFN0YXJ0ZXJDaGFubmVsTmFtZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbkhvc3RTdGFydGVyLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvc3RTdGFydGVyIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9lbGVjdHJvbi1tYWluL2V4dGVuc2lvbkhvc3RTdGFydGVyLmpzJztcbmltcG9ydCB7IElFeHRlcm5hbFRlcm1pbmFsTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9leHRlcm5hbFRlcm1pbmFsL2VsZWN0cm9uLW1haW4vZXh0ZXJuYWxUZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBMaW51eEV4dGVybmFsVGVybWluYWxTZXJ2aWNlLCBNYWNFeHRlcm5hbFRlcm1pbmFsU2VydmljZSwgV2luZG93c0V4dGVybmFsVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZXh0ZXJuYWxUZXJtaW5hbC9ub2RlL2V4dGVybmFsVGVybWluYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTYW5kYm94SGVscGVyTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9zYW5kYm94L2VsZWN0cm9uLW1haW4vc2FuZGJveEhlbHBlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2FuZGJveEhlbHBlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9zYW5kYm94L25vZGUvc2FuZGJveEhlbHBlci5qcyc7XG5pbXBvcnQgeyBMT0NBTF9GSUxFX1NZU1RFTV9DSEFOTkVMX05BTUUgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZGlza0ZpbGVTeXN0ZW1Qcm92aWRlckNsaWVudC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRGlza0ZpbGVTeXN0ZW1Qcm92aWRlckNoYW5uZWwgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9maWxlcy9lbGVjdHJvbi1tYWluL2Rpc2tGaWxlU3lzdGVtUHJvdmlkZXJTZXJ2ZXIuanMnO1xuaW1wb3J0IHsgRGlza0ZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2ZpbGVzL25vZGUvZGlza0ZpbGVTeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBQcm9jZXNzTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9wcm9jZXNzL2VsZWN0cm9uLW1haW4vcHJvY2Vzc01haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElLZXlib2FyZExheW91dE1haW5TZXJ2aWNlLCBLZXlib2FyZExheW91dE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0va2V5Ym9hcmRMYXlvdXQvZWxlY3Ryb24tbWFpbi9rZXlib2FyZExheW91dE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYXVuY2hNYWluU2VydmljZSwgTGF1bmNoTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sYXVuY2gvZWxlY3Ryb24tbWFpbi9sYXVuY2hNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlTWFpblNlcnZpY2UsIExpZmVjeWNsZU1haW5QaGFzZSwgU2h1dGRvd25SZWFzb24gfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9saWZlY3ljbGUvZWxlY3Ryb24tbWFpbi9saWZlY3ljbGVNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyU2VydmljZSwgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTWVudWJhck1haW5TZXJ2aWNlLCBNZW51YmFyTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9tZW51YmFyL2VsZWN0cm9uLW1haW4vbWVudWJhck1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSU9TUHJveHlDb25maWcgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdE1haW5TZXJ2aWNlLCBOYXRpdmVIb3N0TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9uYXRpdmUvZWxlY3Ryb24tbWFpbi9uYXRpdmVIb3N0TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2xvYmFsS2V5YmluZGluZ3NNYWluU2VydmljZSwgSUdsb2JhbEtleWJpbmRpbmdzTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9nbG9iYWxLZXliaW5kaW5ncy9lbGVjdHJvbi1tYWluL2dsb2JhbEtleWJpbmRpbmdzTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL21ldGVyZWRDb25uZWN0aW9uL2NvbW1vbi9tZXRlcmVkQ29ubmVjdGlvbi5qcyc7XG5pbXBvcnQgeyBNRVRFUkVEX0NPTk5FQ1RJT05fQ0hBTk5FTCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL21ldGVyZWRDb25uZWN0aW9uL2NvbW1vbi9tZXRlcmVkQ29ubmVjdGlvbklwYy5qcyc7XG5pbXBvcnQgeyBNZXRlcmVkQ29ubmVjdGlvbkNoYW5uZWwgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9tZXRlcmVkQ29ubmVjdGlvbi9lbGVjdHJvbi1tYWluL21ldGVyZWRDb25uZWN0aW9uQ2hhbm5lbC5qcyc7XG5pbXBvcnQgeyBNZXRlcmVkQ29ubmVjdGlvbk1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbWV0ZXJlZENvbm5lY3Rpb24vZWxlY3Ryb24tbWFpbi9tZXRlcmVkQ29ubmVjdGlvbk1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFJlbW90ZUF1dGhvcml0eSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlSG9zdHMuanMnO1xuaW1wb3J0IHsgU2hhcmVkUHJvY2VzcyB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3NoYXJlZFByb2Nlc3MvZWxlY3Ryb24tbWFpbi9zaGFyZWRQcm9jZXNzLmpzJztcbmltcG9ydCB7IElTaWduU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3NpZ24vY29tbW9uL3NpZ24uanMnO1xuaW1wb3J0IHsgSVN0YXRlU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3N0YXRlL25vZGUvc3RhdGUuanMnO1xuaW1wb3J0IHsgU3RvcmFnZURhdGFiYXNlQ2hhbm5lbCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvZWxlY3Ryb24tbWFpbi9zdG9yYWdlSXBjLmpzJztcbmltcG9ydCB7IEFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlLCBJQXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UsIElTdG9yYWdlTWFpblNlcnZpY2UsIFN0b3JhZ2VNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvZWxlY3Ryb24tbWFpbi9zdG9yYWdlTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZUNvbW1vblByb3BlcnRpZXMgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL2NvbW1vblByb3BlcnRpZXMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UsIFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgVGVsZW1ldHJ5QXBwZW5kZXJDbGllbnQgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeUlwYy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZUNvbmZpZywgVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRQaWlQYXRoc0Zyb21FbnZpcm9ubWVudCwgZ2V0VGVsZW1ldHJ5TGV2ZWwsIGlzSW50ZXJuYWxUZWxlbWV0cnksIE51bGxUZWxlbWV0cnlTZXJ2aWNlLCBzdXBwb3J0c1RlbGVtZXRyeSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSVVwZGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91cGRhdGUvY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBVcGRhdGVDaGFubmVsIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2NvbW1vbi91cGRhdGVJcGMuanMnO1xuaW1wb3J0IHsgTm90QXZhaWxhYmxlVXBkYXRlRGlhbG9nIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2VsZWN0cm9uLW1haW4vbm90QXZhaWxhYmxlVXBkYXRlRGlhbG9nLmpzJztcbmltcG9ydCB7IERhcndpblVwZGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91cGRhdGUvZWxlY3Ryb24tbWFpbi91cGRhdGVTZXJ2aWNlLmRhcndpbi5qcyc7XG5pbXBvcnQgeyBMaW51eFVwZGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91cGRhdGUvZWxlY3Ryb24tbWFpbi91cGRhdGVTZXJ2aWNlLmxpbnV4LmpzJztcbmltcG9ydCB7IFNuYXBVcGRhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2VsZWN0cm9uLW1haW4vdXBkYXRlU2VydmljZS5zbmFwLmpzJztcbmltcG9ydCB7IFdpbjMyVXBkYXRlU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3VwZGF0ZS9lbGVjdHJvbi1tYWluL3VwZGF0ZVNlcnZpY2Uud2luMzIuanMnO1xuaW1wb3J0IHsgaXNJbm5vU2V0dXBJbnN0YWxsIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2VsZWN0cm9uLW1haW4vd2luMzJVcGRhdGVUeXBlLmpzJztcbmltcG9ydCB7IElPcGVuVVJMT3B0aW9ucywgSVVSTFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91cmwvY29tbW9uL3VybC5qcyc7XG5pbXBvcnQgeyBVUkxIYW5kbGVyQ2hhbm5lbENsaWVudCwgVVJMSGFuZGxlclJvdXRlciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3VybC9jb21tb24vdXJsSXBjLmpzJztcbmltcG9ydCB7IE5hdGl2ZVVSTFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91cmwvY29tbW9uL3VybFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWxlY3Ryb25VUkxMaXN0ZW5lciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3VybC9lbGVjdHJvbi1tYWluL2VsZWN0cm9uVXJsTGlzdGVuZXIuanMnO1xuaW1wb3J0IHsgSVdlYnZpZXdNYW5hZ2VyU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3dlYnZpZXcvY29tbW9uL3dlYnZpZXdNYW5hZ2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBXZWJ2aWV3TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS93ZWJ2aWV3L2VsZWN0cm9uLW1haW4vd2Vidmlld01haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzRm9sZGVyVG9PcGVuLCBpc1dvcmtzcGFjZVRvT3BlbiwgSVdpbmRvd09wZW5hYmxlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgZ2V0QWxsV2luZG93c0V4Y2x1ZGluZ09mZnNjcmVlbiwgSVdpbmRvd3NNYWluU2VydmljZSwgT3BlbkNvbnRleHQgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS93aW5kb3dzL2VsZWN0cm9uLW1haW4vd2luZG93cy5qcyc7XG5pbXBvcnQgeyBJQ29kZVdpbmRvdyB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9lbGVjdHJvbi1tYWluL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBXaW5kb3dzTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS93aW5kb3dzL2VsZWN0cm9uLW1haW4vd2luZG93c01haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGl2ZVdpbmRvd01hbmFnZXIgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS93aW5kb3dzL25vZGUvd2luZG93VHJhY2tlci5qcyc7XG5pbXBvcnQgeyBoYXNXb3Jrc3BhY2VGaWxlRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZSwgV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZXMvZWxlY3Ryb24tbWFpbi93b3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZXNNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZXMvZWxlY3Ryb24tbWFpbi93b3Jrc3BhY2VzTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UsIFdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL2VsZWN0cm9uLW1haW4vd29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUG9saWN5U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3BvbGljeS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IElOYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLCBJRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9wb2xpY3kvY29tbW9uL2NvcGlsb3RNYW5hZ2VkU2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgTmF0aXZlTWFuYWdlZFNldHRpbmdzQ2hhbm5lbCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3BvbGljeS9jb21tb24vbmF0aXZlTWFuYWdlZFNldHRpbmdzSXBjLmpzJztcbmltcG9ydCB7IEZpbGVNYW5hZ2VkU2V0dGluZ3NDaGFubmVsIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcG9saWN5L2NvbW1vbi9maWxlTWFuYWdlZFNldHRpbmdzSXBjLmpzJztcbmltcG9ydCB7IFBvbGljeUNoYW5uZWwgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9wb2xpY3kvY29tbW9uL3BvbGljeUlwYy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2VsZWN0cm9uLW1haW4vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNTY2FubmVyU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvbm9kZS9leHRlbnNpb25zU2Nhbm5lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFQcm9maWxlc0hhbmRsZXIgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvZWxlY3Ryb24tbWFpbi91c2VyRGF0YVByb2ZpbGVzSGFuZGxlci5qcyc7XG5pbXBvcnQgeyBQcm9maWxlU3RvcmFnZUNoYW5nZXNMaXN0ZW5lckNoYW5uZWwgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvZWxlY3Ryb24tbWFpbi91c2VyRGF0YVByb2ZpbGVTdG9yYWdlSXBjLmpzJztcbmltcG9ydCB7IFByb21pc2VzLCBSdW5PbmNlU2NoZWR1bGVyLCBydW5XaGVuR2xvYmFsSWRsZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IHJlc29sdmVNYWNoaW5lSWQsIHJlc29sdmVTcW1JZCwgcmVzb2x2ZURldkRldmljZUlkLCB2YWxpZGF0ZURldkRldmljZUlkIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2VsZWN0cm9uLW1haW4vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvbm9kZS9leHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExvZ2dlckNoYW5uZWwgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sb2cvZWxlY3Ryb24tbWFpbi9sb2dJcGMuanMnO1xuaW1wb3J0IHsgSUxvZ2dlck1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbG9nL2VsZWN0cm9uLW1haW4vbG9nZ2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5pdGlhbFByb3RvY29sVXJscywgSVByb3RvY29sVXJsIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdXJsL2VsZWN0cm9uLW1haW4vdXJsLmpzJztcbmltcG9ydCB7IElVdGlsaXR5UHJvY2Vzc1dvcmtlck1haW5TZXJ2aWNlLCBVdGlsaXR5UHJvY2Vzc1dvcmtlck1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdXRpbGl0eVByb2Nlc3MvZWxlY3Ryb24tbWFpbi91dGlsaXR5UHJvY2Vzc1dvcmtlck1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlwY1V0aWxpdHlQcm9jZXNzV29ya2VyQ2hhbm5lbE5hbWUgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91dGlsaXR5UHJvY2Vzcy9jb21tb24vdXRpbGl0eVByb2Nlc3NXb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2NhbFB0eVNlcnZpY2UsIExvY2FsUmVjb25uZWN0Q29uc3RhbnRzLCBUZXJtaW5hbElwY0NoYW5uZWxzLCBUZXJtaW5hbFNldHRpbmdJZCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBFbGVjdHJvblB0eUhvc3RTdGFydGVyIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvZWxlY3Ryb24tbWFpbi9lbGVjdHJvblB0eUhvc3RTdGFydGVyLmpzJztcbmltcG9ydCB7IFB0eUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvbm9kZS9wdHlIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFbGVjdHJvbkFnZW50SG9zdFN0YXJ0ZXIgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvZWxlY3Ryb24tbWFpbi9lbGVjdHJvbkFnZW50SG9zdFN0YXJ0ZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0UHJvY2Vzc01hbmFnZXIgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3Qvbm9kZS9hZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5PREVfUkVNT1RFX1JFU09VUkNFX0NIQU5ORUxfTkFNRSwgTk9ERV9SRU1PVEVfUkVTT1VSQ0VfSVBDX01FVEhPRF9OQU1FLCBOb2RlUmVtb3RlUmVzb3VyY2VSZXNwb25zZSwgTm9kZVJlbW90ZVJlc291cmNlUm91dGVyIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9lbGVjdHJvblJlbW90ZVJlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBJQXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vYXV4aWxpYXJ5V2luZG93L2VsZWN0cm9uLW1haW4vYXV4aWxpYXJ5V2luZG93cy5qcyc7XG5pbXBvcnQgeyBBdXhpbGlhcnlXaW5kb3dzTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9hdXhpbGlhcnlXaW5kb3cvZWxlY3Ryb24tbWFpbi9hdXhpbGlhcnlXaW5kb3dzTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbm9ybWFsaXplTkZDIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbm9ybWFsaXphdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ1NTRGV2ZWxvcG1lbnRTZXJ2aWNlLCBDU1NEZXZlbG9wbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9jc3NEZXYvbm9kZS9jc3NEZXZTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOYXRpdmVNY3BEaXNjb3ZlcnlIZWxwZXJTZXJ2aWNlLCBOYXRpdmVNY3BEaXNjb3ZlcnlIZWxwZXJDaGFubmVsTmFtZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbmF0aXZlTWNwRGlzY292ZXJ5SGVscGVyLmpzJztcbmltcG9ydCB7IE5hdGl2ZU1jcERpc2NvdmVyeUhlbHBlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9tY3Avbm9kZS9uYXRpdmVNY3BEaXNjb3ZlcnlIZWxwZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNY3BHYXRld2F5U2VydmljZSwgTWNwR2F0ZXdheUNoYW5uZWxOYW1lIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BHYXRld2F5LmpzJztcbmltcG9ydCB7IE1jcEdhdGV3YXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbWNwL25vZGUvbWNwR2F0ZXdheVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWNwR2F0ZXdheUNoYW5uZWwgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9tY3Avbm9kZS9tY3BHYXRld2F5Q2hhbm5lbC5qcyc7XG5pbXBvcnQgeyBJV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS93ZWJDb250ZW50RXh0cmFjdG9yL2NvbW1vbi93ZWJDb250ZW50RXh0cmFjdG9yLmpzJztcbmltcG9ydCB7IE5hdGl2ZVdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vd2ViQ29udGVudEV4dHJhY3Rvci9lbGVjdHJvbi1tYWluL3dlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UsIElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbmV0d29ya0ZpbHRlci9jb21tb24vbmV0d29ya0ZpbHRlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsU2FuZGJveFNlcnZpY2UsIE51bGxUZXJtaW5hbFNhbmRib3hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vc2FuZGJveC9jb21tb24vdGVybWluYWxTYW5kYm94U2VydmljZS5qcyc7XG5pbXBvcnQgRXJyb3JUZWxlbWV0cnkgZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2VsZWN0cm9uLW1haW4vZXJyb3JUZWxlbWV0cnkuanMnO1xuXG50eXBlIE9TUHJveHlDb25maWdFdmVudCA9IHtcblx0cmVhZG9ubHkgc3VjY2VzczogYm9vbGVhbjtcblx0cmVhZG9ubHkgZHVyYXRpb25NczogbnVtYmVyO1xuXHRyZWFkb25seSBwbGF0Zm9ybUtpbmQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGF1dG9EZXRlY3Q/OiBib29sZWFuO1xuXHRyZWFkb25seSBodHRwUHJveHlFbnZpcm9ubWVudFN0YXRlPzogc3RyaW5nO1xuXHRyZWFkb25seSBodHRwc1Byb3h5RW52aXJvbm1lbnRTdGF0ZT86IHN0cmluZztcblx0cmVhZG9ubHkgYWxsUHJveHlFbnZpcm9ubWVudFN0YXRlPzogc3RyaW5nO1xuXHRyZWFkb25seSBub1Byb3h5RW52aXJvbm1lbnRTdGF0ZT86IHN0cmluZztcblx0cmVhZG9ubHkgd3BhZERoY3BTdGF0ZT86IHN0cmluZztcblx0cmVhZG9ubHkgd3BhZERuc1N0YXRlPzogc3RyaW5nO1xuXHRyZWFkb25seSBjb25maWd1cmVkUGFjU3RhdGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGhhc0NvbmZpZ3VyZWRQYWM/OiBib29sZWFuO1xuXHRyZWFkb25seSBoYXNMb2FkZWRQYWM/OiBib29sZWFuO1xuXHRyZWFkb25seSBwYWNTb3VyY2U/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhY1NjcmlwdENoYXJhY3RlckNvdW50PzogbnVtYmVyO1xuXHRyZWFkb25seSBwYWNTY3JpcHRMaW5lQ291bnQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IHBhY1NjcmlwdFJldHVybkNvdW50PzogbnVtYmVyO1xuXHRyZWFkb25seSBoYXNIdHRwUHJveHk/OiBib29sZWFuO1xuXHRyZWFkb25seSBoYXNIdHRwc1Byb3h5PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaGFzU29ja3NQcm94eT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGhhc0J5cGFzc1J1bGVzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZXhjbHVkZVNpbXBsZUhvc3RuYW1lcz86IGJvb2xlYW47XG59O1xuXG50eXBlIE9TUHJveHlDb25maWdDbGFzc2lmaWNhdGlvbiA9IHtcblx0c3VjY2VzczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1doZXRoZXIgcmVhZGluZyB0aGUgb3BlcmF0aW5nIHN5c3RlbSBwcm94eSBjb25maWd1cmF0aW9uIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHkuJyB9O1xuXHRkdXJhdGlvbk1zOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2FsbC1jbG9jayBkdXJhdGlvbiBvZiB0aGUgb3BlcmF0aW5nIHN5c3RlbSBwcm94eSBjb25maWd1cmF0aW9uIHJlYWQgaW4gbWlsbGlzZWNvbmRzLicgfTtcblx0cGxhdGZvcm1LaW5kPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBvcGVyYXRpbmcgc3lzdGVtIHByb3h5IGNvbmZpZ3VyYXRpb24gc291cmNlICh3aW5kb3dzLCBtYWNvcywgbGludXgsIHVua25vd24sIG9yIG5vbmUpLicgfTtcblx0YXV0b0RldGVjdD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIGF1dG9tYXRpYyBwcm94eSBkaXNjb3ZlcnkgaXMgZW5hYmxlZC4nIH07XG5cdGh0dHBQcm94eUVudmlyb25tZW50U3RhdGU/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgZWZmZWN0aXZlIEhUVFAgcHJveHkgZW52aXJvbm1lbnQgdmFyaWFibGUgaXMgdW5zZXQsIGNvbmZpZ3VyZWQsIG9yIGludmFsaWQuIFRoZSB2YXJpYWJsZSBuYW1lIGFuZCB2YWx1ZSBhcmUgbm90IGNvbGxlY3RlZC4nIH07XG5cdGh0dHBzUHJveHlFbnZpcm9ubWVudFN0YXRlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIGVmZmVjdGl2ZSBIVFRQUyBwcm94eSBlbnZpcm9ubWVudCB2YXJpYWJsZSBpcyB1bnNldCwgY29uZmlndXJlZCwgb3IgaW52YWxpZC4gVGhlIHZhcmlhYmxlIG5hbWUgYW5kIHZhbHVlIGFyZSBub3QgY29sbGVjdGVkLicgfTtcblx0YWxsUHJveHlFbnZpcm9ubWVudFN0YXRlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIGVmZmVjdGl2ZSBhbGwtcHJveHkgZW52aXJvbm1lbnQgdmFyaWFibGUgaXMgdW5zZXQsIGNvbmZpZ3VyZWQsIG9yIGludmFsaWQuIFRoZSB2YXJpYWJsZSBuYW1lIGFuZCB2YWx1ZSBhcmUgbm90IGNvbGxlY3RlZC4nIH07XG5cdG5vUHJveHlFbnZpcm9ubWVudFN0YXRlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIGVmZmVjdGl2ZSBuby1wcm94eSBlbnZpcm9ubWVudCB2YXJpYWJsZSBpcyB1bnNldCwgY29uZmlndXJlZCwgb3IgaW52YWxpZC4gVGhlIHZhcmlhYmxlIG5hbWUgYW5kIHZhbHVlIGFyZSBub3QgY29sbGVjdGVkLicgfTtcblx0d3BhZERoY3BTdGF0ZT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgREhDUCBXUEFEIGluc3BlY3Rpb24gc3RhdGUuIERpc2NvdmVyZWQgVVJMcyBhbmQgZXJyb3JzIGFyZSBub3QgY29sbGVjdGVkLicgfTtcblx0d3BhZERuc1N0YXRlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBETlMgV1BBRCBpbnNwZWN0aW9uIHN0YXRlLiBEaXNjb3ZlcmVkIFVSTHMgYW5kIGVycm9ycyBhcmUgbm90IGNvbGxlY3RlZC4nIH07XG5cdGNvbmZpZ3VyZWRQYWNTdGF0ZT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgY29uZmlndXJlZCBQQUMgaW5zcGVjdGlvbiBzdGF0ZS4gQ29uZmlndXJlZCBVUkxzIGFuZCBlcnJvcnMgYXJlIG5vdCBjb2xsZWN0ZWQuJyB9O1xuXHRoYXNDb25maWd1cmVkUGFjPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1doZXRoZXIgdGhlIG9wZXJhdGluZyBzeXN0ZW0gaGFzIGEgUEFDIFVSTCBjb25maWd1cmVkLiBUaGUgVVJMIGlzIG5vdCBjb2xsZWN0ZWQuJyB9O1xuXHRoYXNMb2FkZWRQYWM/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2hldGhlciBhIFBBQyBzY3JpcHQgd2FzIGRpc2NvdmVyZWQgYW5kIGxvYWRlZC4gVGhlIFVSTCBhbmQgc2NyaXB0IGNvbnRlbnRzIGFyZSBub3QgY29sbGVjdGVkLicgfTtcblx0cGFjU291cmNlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0hvdyB0aGUgbG9hZGVkIFBBQyBzY3JpcHQgd2FzIHNlbGVjdGVkICh3cGFkLWRoY3AsIHdwYWQtZG5zLCBjb25maWd1cmVkLCB1bmtub3duLCBvciBub25lKS4nIH07XG5cdHBhY1NjcmlwdENoYXJhY3RlckNvdW50PzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBjaGFyYWN0ZXJzIGluIHRoZSBsb2FkZWQgUEFDIHNjcmlwdC4gVGhlIHNjcmlwdCBjb250ZW50cyBhcmUgbm90IGNvbGxlY3RlZC4nIH07XG5cdHBhY1NjcmlwdExpbmVDb3VudD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgbGluZXMgaW4gdGhlIGxvYWRlZCBQQUMgc2NyaXB0LiBUaGUgc2NyaXB0IGNvbnRlbnRzIGFyZSBub3QgY29sbGVjdGVkLicgfTtcblx0cGFjU2NyaXB0UmV0dXJuQ291bnQ/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIHJldHVybiBrZXl3b3JkIG9jY3VycmVuY2VzIGluIHRoZSBsb2FkZWQgUEFDIHNjcmlwdC4gVGhlIHNjcmlwdCBjb250ZW50cyBhcmUgbm90IGNvbGxlY3RlZC4nIH07XG5cdGhhc0h0dHBQcm94eT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIG5vcm1hbGl6ZWQgc3RhdGljIEhUVFAgcHJveHkgc2V0dGluZ3MgYXJlIHByZXNlbnQuIFByb3h5IGFkZHJlc3NlcyBhcmUgbm90IGNvbGxlY3RlZC4nIH07XG5cdGhhc0h0dHBzUHJveHk/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2hldGhlciBub3JtYWxpemVkIHN0YXRpYyBIVFRQUyBwcm94eSBzZXR0aW5ncyBhcmUgcHJlc2VudC4gUHJveHkgYWRkcmVzc2VzIGFyZSBub3QgY29sbGVjdGVkLicgfTtcblx0aGFzU29ja3NQcm94eT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIG5vcm1hbGl6ZWQgc3RhdGljIFNPQ0tTIHByb3h5IHNldHRpbmdzIGFyZSBwcmVzZW50LiBQcm94eSBhZGRyZXNzZXMgYXJlIG5vdCBjb2xsZWN0ZWQuJyB9O1xuXHRoYXNCeXBhc3NSdWxlcz86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIG9wZXJhdGluZyBzeXN0ZW0gcHJveHkgYnlwYXNzIHJ1bGVzIGFyZSBwcmVzZW50LiBCeXBhc3MgZW50cmllcyBhcmUgbm90IGNvbGxlY3RlZC4nIH07XG5cdGV4Y2x1ZGVTaW1wbGVIb3N0bmFtZXM/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2hldGhlciBtYWNPUyBleGNsdWRlcyBzaW1wbGUgaG9zdG5hbWVzIGZyb20gcHJveHlpbmcuIFVuZGVmaW5lZCBvbiBvdGhlciBwbGF0Zm9ybXMuJyB9O1xuXHRvd25lcjogJ2Nocm1hcnRpJztcblx0Y29tbWVudDogJ1RyYWNrcyBjYXRlZ29yaXplZCBvcGVyYXRpbmcgc3lzdGVtIHByb3h5IGNvbmZpZ3VyYXRpb24gYWZ0ZXIgc3RhcnR1cCB3aXRob3V0IGNvbGxlY3RpbmcgcHJveHkgYWRkcmVzc2VzLCBVUkxzLCBzY3JpcHRzLCBieXBhc3MgZW50cmllcywgb3IgZXJyb3IgdGV4dC4nO1xufTtcblxuLyoqXG4gKiBUaGUgbWFpbiBWUyBDb2RlIGFwcGxpY2F0aW9uLiBUaGVyZSB3aWxsIG9ubHkgZXZlciBiZSBvbmUgaW5zdGFuY2UsXG4gKiBldmVuIGlmIHRoZSB1c2VyIHN0YXJ0cyBtYW55IGluc3RhbmNlcyAoZS5nLiBmcm9tIHRoZSBjb21tYW5kIGxpbmUpLlxuICovXG5leHBvcnQgY2xhc3MgQ29kZUFwcGxpY2F0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VDVVJJVFlfUFJPVE9DT0xfSEFORExJTkdfQ09ORklSTUFUSU9OX1NFVFRJTkdfS0VZID0ge1xuXHRcdFtTY2hlbWFzLmZpbGVdOiAnc2VjdXJpdHkucHJvbXB0Rm9yTG9jYWxGaWxlUHJvdG9jb2xIYW5kbGluZycgYXMgY29uc3QsXG5cdFx0W1NjaGVtYXMudnNjb2RlUmVtb3RlXTogJ3NlY3VyaXR5LnByb21wdEZvclJlbW90ZUZpbGVQcm90b2NvbEhhbmRsaW5nJyBhcyBjb25zdFxuXHR9O1xuXG5cdHByaXZhdGUgd2luZG93c01haW5TZXJ2aWNlOiBJV2luZG93c01haW5TZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZTogSUF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBuYXRpdmVIb3N0TWFpblNlcnZpY2U6IElOYXRpdmVIb3N0TWFpblNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtYWluUHJvY2Vzc05vZGVJcGNTZXJ2ZXI6IE5vZGVJUENTZXJ2ZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1c2VyRW52OiBJUHJvY2Vzc0Vudmlyb25tZW50LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYWluSW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUxvZ2dlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dnZXJTZXJ2aWNlOiBJTG9nZ2VyU2VydmljZSxcblx0XHRASUVudmlyb25tZW50TWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudE1haW5TZXJ2aWNlOiBJRW52aXJvbm1lbnRNYWluU2VydmljZSxcblx0XHRASUxpZmVjeWNsZU1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlTWFpblNlcnZpY2U6IElMaWZlY3ljbGVNYWluU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0YXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0YXRlU2VydmljZTogSVN0YXRlU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5jb25maWd1cmVTZXNzaW9uKCk7XG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb25maWd1cmVTZXNzaW9uKCk6IHZvaWQge1xuXG5cdFx0Ly8jcmVnaW9uIFNlY3VyaXR5IHJlbGF0ZWQgbWVhc3VyZXMgKGh0dHBzOi8vZWxlY3Ryb25qcy5vcmcvZG9jcy90dXRvcmlhbC9zZWN1cml0eSlcblx0XHQvL1xuXHRcdC8vICEhISBETyBOT1QgQ0hBTkdFIHdpdGhvdXQgY29uc3VsdGluZyB0aGUgZG9jdW1lbnRhdGlvbiAhISFcblx0XHQvL1xuXG5cdFx0Y29uc3QgaXNVcmxGcm9tV2luZG93ID0gKHJlcXVlc3RpbmdVcmw/OiBzdHJpbmcgfCB1bmRlZmluZWQpID0+IHJlcXVlc3RpbmdVcmw/LnN0YXJ0c1dpdGgoYCR7U2NoZW1hcy52c2NvZGVGaWxlUmVzb3VyY2V9Oi8vJHtWU0NPREVfQVVUSE9SSVRZfWApO1xuXHRcdGNvbnN0IGlzVXJsRnJvbVdlYnZpZXcgPSAocmVxdWVzdGluZ1VybDogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiByZXF1ZXN0aW5nVXJsPy5zdGFydHNXaXRoKGAke1NjaGVtYXMudnNjb2RlV2Vidmlld306Ly9gKTtcblx0XHRjb25zdCBpc1VybEZyb21BdXhpbGlhcnlXaW5kb3cgPSAod2ViQ29udGVudHM6IEVsZWN0cm9uLldlYkNvbnRlbnRzIHwgbnVsbCwgcmVxdWVzdGluZ1VybDogc3RyaW5nIHwgdW5kZWZpbmVkLCBpc01haW5GcmFtZTogYm9vbGVhbikgPT5cblx0XHRcdGlzTWFpbkZyYW1lICYmIHJlcXVlc3RpbmdVcmwgPT09ICdhYm91dDpibGFuaycgJiYgISEod2ViQ29udGVudHMgJiYgdGhpcy5hdXhpbGlhcnlXaW5kb3dzTWFpblNlcnZpY2U/LmdldFdpbmRvd0J5V2ViQ29udGVudHMod2ViQ29udGVudHMpKTtcblx0XHRjb25zdCBpc1JlcXVlc3RGcm9tV2luZG93ID0gKHdlYkNvbnRlbnRzOiBFbGVjdHJvbi5XZWJDb250ZW50cyB8IG51bGwsIHJlcXVlc3RpbmdVcmw6IHN0cmluZyB8IHVuZGVmaW5lZCwgaXNNYWluRnJhbWU6IGJvb2xlYW4pID0+XG5cdFx0XHRpc1VybEZyb21XaW5kb3cocmVxdWVzdGluZ1VybCkgfHwgaXNVcmxGcm9tQXV4aWxpYXJ5V2luZG93KHdlYkNvbnRlbnRzLCByZXF1ZXN0aW5nVXJsLCBpc01haW5GcmFtZSk7XG5cblx0XHRjb25zdCBhbHdheXNBbGxvd2VkUGVybWlzc2lvbnMgPSBuZXcgU2V0KFsncG9pbnRlckxvY2snLCAnbm90aWZpY2F0aW9ucyddKTtcblxuXHRcdGNvbnN0IGFsbG93ZWRQZXJtaXNzaW9uc0luV2VidmlldyA9IG5ldyBTZXQoW1xuXHRcdFx0Li4uYWx3YXlzQWxsb3dlZFBlcm1pc3Npb25zLFxuXHRcdFx0J2NsaXBib2FyZC1yZWFkJyxcblx0XHRcdCdjbGlwYm9hcmQtc2FuaXRpemVkLXdyaXRlJyxcblx0XHRcdC8vIFRPRE8oZGVlcGFrMTU1Nik6IFNob3VsZCBiZSByZW1vdmVkIG9uY2UgbWlncmF0aW9uIGlzIGNvbXBsZXRlXG5cdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjM5MjI4XG5cdFx0XHQnZGVwcmVjYXRlZC1zeW5jLWNsaXBib2FyZC1yZWFkJyxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGFsbG93ZWRQZXJtaXNzaW9uc0luQ29yZSA9IG5ldyBTZXQoW1xuXHRcdFx0Li4uYWx3YXlzQWxsb3dlZFBlcm1pc3Npb25zLFxuXHRcdFx0J21lZGlhJyxcblx0XHRcdCdsb2NhbC1mb250cycsXG5cdFx0XHQvLyBUT0RPKGRlZXBhazE1NTYpOiBTaG91bGQgYmUgcmVtb3ZlZCBvbmNlIG1pZ3JhdGlvbiBpcyBjb21wbGV0ZVxuXHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIzOTIyOFxuXHRcdFx0J2RlcHJlY2F0ZWQtc3luYy1jbGlwYm9hcmQtcmVhZCcsXG5cdFx0XSk7XG5cblx0XHRzZXNzaW9uLmRlZmF1bHRTZXNzaW9uLnNldFBlcm1pc3Npb25SZXF1ZXN0SGFuZGxlcigod2ViQ29udGVudHMsIHBlcm1pc3Npb24sIGNhbGxiYWNrLCBkZXRhaWxzKSA9PiB7XG5cdFx0XHRpZiAoaXNVcmxGcm9tV2VidmlldyhkZXRhaWxzLnJlcXVlc3RpbmdVcmwpKSB7XG5cdFx0XHRcdHJldHVybiBjYWxsYmFjayhhbGxvd2VkUGVybWlzc2lvbnNJbldlYnZpZXcuaGFzKHBlcm1pc3Npb24pKTtcblx0XHRcdH1cblx0XHRcdGlmIChpc1JlcXVlc3RGcm9tV2luZG93KHdlYkNvbnRlbnRzLCBkZXRhaWxzLnJlcXVlc3RpbmdVcmwsIGRldGFpbHMuaXNNYWluRnJhbWUpKSB7XG5cdFx0XHRcdHJldHVybiBjYWxsYmFjayhhbGxvd2VkUGVybWlzc2lvbnNJbkNvcmUuaGFzKHBlcm1pc3Npb24pKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBjYWxsYmFjayhmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHRzZXNzaW9uLmRlZmF1bHRTZXNzaW9uLnNldFBlcm1pc3Npb25DaGVja0hhbmRsZXIoKHdlYkNvbnRlbnRzLCBwZXJtaXNzaW9uLCBfb3JpZ2luLCBkZXRhaWxzKSA9PiB7XG5cdFx0XHRpZiAoaXNVcmxGcm9tV2VidmlldyhkZXRhaWxzLnJlcXVlc3RpbmdVcmwpKSB7XG5cdFx0XHRcdHJldHVybiBhbGxvd2VkUGVybWlzc2lvbnNJbldlYnZpZXcuaGFzKHBlcm1pc3Npb24pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzUmVxdWVzdEZyb21XaW5kb3cod2ViQ29udGVudHMsIGRldGFpbHMucmVxdWVzdGluZ1VybCwgZGV0YWlscy5pc01haW5GcmFtZSkpIHtcblx0XHRcdFx0cmV0dXJuIGFsbG93ZWRQZXJtaXNzaW9uc0luQ29yZS5oYXMocGVybWlzc2lvbik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSk7XG5cblx0XHRsZXQgY2FjaGVkU2NyZWVuU291cmNlczogRWxlY3Ryb24uRGVza3RvcENhcHR1cmVyU291cmNlW10gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaW52YWxpZGF0ZVNjcmVlblNvdXJjZUNhY2hlID0gKCkgPT4ge1xuXHRcdFx0Y2FjaGVkU2NyZWVuU291cmNlcyA9IHVuZGVmaW5lZDtcblx0XHR9O1xuXHRcdGVsZWN0cm9uU2NyZWVuLm9uKCdkaXNwbGF5LWFkZGVkJywgaW52YWxpZGF0ZVNjcmVlblNvdXJjZUNhY2hlKTtcblx0XHRlbGVjdHJvblNjcmVlbi5vbignZGlzcGxheS1yZW1vdmVkJywgaW52YWxpZGF0ZVNjcmVlblNvdXJjZUNhY2hlKTtcblx0XHRlbGVjdHJvblNjcmVlbi5vbignZGlzcGxheS1tZXRyaWNzLWNoYW5nZWQnLCBpbnZhbGlkYXRlU2NyZWVuU291cmNlQ2FjaGUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRlbGVjdHJvblNjcmVlbi5vZmYoJ2Rpc3BsYXktYWRkZWQnLCBpbnZhbGlkYXRlU2NyZWVuU291cmNlQ2FjaGUpO1xuXHRcdFx0ZWxlY3Ryb25TY3JlZW4ub2ZmKCdkaXNwbGF5LXJlbW92ZWQnLCBpbnZhbGlkYXRlU2NyZWVuU291cmNlQ2FjaGUpO1xuXHRcdFx0ZWxlY3Ryb25TY3JlZW4ub2ZmKCdkaXNwbGF5LW1ldHJpY3MtY2hhbmdlZCcsIGludmFsaWRhdGVTY3JlZW5Tb3VyY2VDYWNoZSk7XG5cdFx0fSkpO1xuXHRcdHNlc3Npb24uZGVmYXVsdFNlc3Npb24uc2V0RGlzcGxheU1lZGlhUmVxdWVzdEhhbmRsZXIoYXN5bmMgKHJlcXVlc3QsIGNhbGxiYWNrKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBmcmFtZSA9IHJlcXVlc3QuZnJhbWU7XG5cdFx0XHRcdGNvbnN0IHdpbiA9IGZyYW1lID8gQnJvd3NlcldpbmRvdy5nZXRBbGxXaW5kb3dzKCkuZmluZCh3ID0+IHcud2ViQ29udGVudHMubWFpbkZyYW1lID09PSBmcmFtZSkgOiB1bmRlZmluZWQ7XG5cblx0XHRcdFx0Y29uc3QgZGlzcGxheXMgPSBlbGVjdHJvblNjcmVlbi5nZXRBbGxEaXNwbGF5cygpO1xuXHRcdFx0XHRsZXQgdGFyZ2V0RGlzcGxheSA9IGRpc3BsYXlzWzBdO1xuXHRcdFx0XHRpZiAod2luKSB7XG5cdFx0XHRcdFx0Y29uc3Qgd2luQm91bmRzID0gd2luLmdldEJvdW5kcygpO1xuXHRcdFx0XHRcdHRhcmdldERpc3BsYXkgPSBlbGVjdHJvblNjcmVlbi5nZXREaXNwbGF5TmVhcmVzdFBvaW50KHtcblx0XHRcdFx0XHRcdHg6IHdpbkJvdW5kcy54ICsgd2luQm91bmRzLndpZHRoIC8gMixcblx0XHRcdFx0XHRcdHk6IHdpbkJvdW5kcy55ICsgd2luQm91bmRzLmhlaWdodCAvIDIsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWNhY2hlZFNjcmVlblNvdXJjZXMpIHtcblx0XHRcdFx0XHRjYWNoZWRTY3JlZW5Tb3VyY2VzID0gYXdhaXQgZGVza3RvcENhcHR1cmVyLmdldFNvdXJjZXMoe1xuXHRcdFx0XHRcdFx0dHlwZXM6IFsnc2NyZWVuJ10sXG5cdFx0XHRcdFx0XHR0aHVtYm5haWxTaXplOiB7IHdpZHRoOiAwLCBoZWlnaHQ6IDAgfSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBtYXRjaCA9IGNhY2hlZFNjcmVlblNvdXJjZXMuZmluZChzID0+IHMuZGlzcGxheV9pZCA9PT0gU3RyaW5nKHRhcmdldERpc3BsYXkuaWQpKTtcblx0XHRcdFx0aWYgKCFtYXRjaCkge1xuXHRcdFx0XHRcdC8vIENhY2hlIG1heSBiZSBzdGFsZSBldmVuIHdpdGhvdXQgYSB0b3BvbG9neSBldmVudFxuXHRcdFx0XHRcdGNhY2hlZFNjcmVlblNvdXJjZXMgPSBhd2FpdCBkZXNrdG9wQ2FwdHVyZXIuZ2V0U291cmNlcyh7XG5cdFx0XHRcdFx0XHR0eXBlczogWydzY3JlZW4nXSxcblx0XHRcdFx0XHRcdHRodW1ibmFpbFNpemU6IHsgd2lkdGg6IDAsIGhlaWdodDogMCB9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdG1hdGNoID0gY2FjaGVkU2NyZWVuU291cmNlcy5maW5kKHMgPT4gcy5kaXNwbGF5X2lkID09PSBTdHJpbmcodGFyZ2V0RGlzcGxheS5pZCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY2hvc2VuID0gbWF0Y2ggPz8gY2FjaGVkU2NyZWVuU291cmNlc1swXTtcblx0XHRcdFx0aWYgKCFjaG9zZW4pIHtcblx0XHRcdFx0XHQvLyBObyBzY3JlZW4gc291cmNlcyBhdmFpbGFibGUgKHBlcm1pc3Npb24gZGVuaWVkIG9yIHRyYW5zaWVudCBmYWlsdXJlKS5cblx0XHRcdFx0XHRjYWxsYmFjayh7fSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhbGxiYWNrKHsgdmlkZW86IGNob3NlbiB9KTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRjYWxsYmFjayh7fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyNlbmRyZWdpb25cblxuXHRcdC8vI3JlZ2lvbiBSZXF1ZXN0IGZpbHRlcmluZ1xuXG5cdFx0Ly8gQmxvY2sgYWxsIFNWRyByZXF1ZXN0cyBmcm9tIHVuc3VwcG9ydGVkIG9yaWdpbnNcblx0XHRjb25zdCBzdXBwb3J0ZWRTdmdTY2hlbWVzID0gbmV3IFNldChbU2NoZW1hcy5maWxlLCBTY2hlbWFzLnZzY29kZUZpbGVSZXNvdXJjZSwgU2NoZW1hcy52c2NvZGVSZW1vdGVSZXNvdXJjZSwgU2NoZW1hcy52c2NvZGVNYW5hZ2VkUmVtb3RlUmVzb3VyY2UsICdkZXZ0b29scyddKTtcblxuXHRcdC8vIEJ1dCBhbGxvdyB0aGVtIGlmIHRoZXkgYXJlIG1hZGUgZnJvbSBpbnNpZGUgYW4gd2Vidmlld1xuXHRcdGNvbnN0IGlzU2FmZUZyYW1lID0gKHJlcXVlc3RGcmFtZTogV2ViRnJhbWVNYWluIHwgbnVsbCB8IHVuZGVmaW5lZCk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0Zm9yIChsZXQgZnJhbWU6IFdlYkZyYW1lTWFpbiB8IG51bGwgfCB1bmRlZmluZWQgPSByZXF1ZXN0RnJhbWU7IGZyYW1lOyBmcmFtZSA9IGZyYW1lLnBhcmVudCkge1xuXHRcdFx0XHQvLyBUaGUgcmVuZGVyIGZyYW1lIGJhY2tpbmcgdGhpcyBXZWJGcmFtZU1haW4gbWF5IGFscmVhZHkgYmUgZGlzcG9zZWRcblx0XHRcdFx0Ly8gKGUuZy4gdGhlIG9yaWdpbmF0aW5nIHdlYnZpZXcvd2luZG93IHdhcyBjbG9zZWQgb3IgbmF2aWdhdGVkIGF3YXkpXG5cdFx0XHRcdC8vIGJ5IHRoZSB0aW1lIHRoaXMgd2ViUmVxdWVzdCBjYWxsYmFjayBydW5zLiBBY2Nlc3NpbmcgYW55IHByb3BlcnR5XG5cdFx0XHRcdC8vIG9mIGEgZGlzcG9zZWQgZnJhbWUgdGhyb3dzIFwiUmVuZGVyIGZyYW1lIHdhcyBkaXNwb3NlZCBiZWZvcmVcblx0XHRcdFx0Ly8gV2ViRnJhbWVNYWluIGNvdWxkIGJlIGFjY2Vzc2VkXCIsIHNvIGd1YXJkIGJlZm9yZSByZWFkaW5nIGl0LlxuXHRcdFx0XHRpZiAoZnJhbWUuaXNEZXN0cm95ZWQoKSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZnJhbWUudXJsLnN0YXJ0c1dpdGgoYCR7U2NoZW1hcy52c2NvZGVXZWJ2aWV3fTovL2ApKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgaXNTdmdSZXF1ZXN0RnJvbVNhZmVDb250ZXh0ID0gKGRldGFpbHM6IEVsZWN0cm9uLk9uQmVmb3JlUmVxdWVzdExpc3RlbmVyRGV0YWlscyB8IEVsZWN0cm9uLk9uSGVhZGVyc1JlY2VpdmVkTGlzdGVuZXJEZXRhaWxzKTogYm9vbGVhbiA9PiB7XG5cdFx0XHRyZXR1cm4gZGV0YWlscy5yZXNvdXJjZVR5cGUgPT09ICd4aHInIHx8IGlzU2FmZUZyYW1lKGRldGFpbHMuZnJhbWUpO1xuXHRcdH07XG5cblx0XHRjb25zdCBpc0FsbG93ZWRWc0NvZGVGaWxlUmVxdWVzdCA9IChkZXRhaWxzOiBFbGVjdHJvbi5PbkJlZm9yZVJlcXVlc3RMaXN0ZW5lckRldGFpbHMpID0+IHtcblx0XHRcdGNvbnN0IGZyYW1lID0gZGV0YWlscy5mcmFtZTtcblx0XHRcdGlmICghZnJhbWUgfHwgZnJhbWUuaXNEZXN0cm95ZWQoKSB8fCAhdGhpcy53aW5kb3dzTWFpblNlcnZpY2UpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayB0byBzZWUgaWYgdGhlIHJlcXVlc3QgY29tZXMgZnJvbSBvbmUgb2YgdGhlIG1haW4gd2luZG93cyAob3Igc2hhcmVkIHByb2Nlc3MpIGFuZCBub3QgZnJvbSBlbWJlZGRlZCBjb250ZW50XG5cdFx0XHRjb25zdCB3aW5kb3dzID0gZ2V0QWxsV2luZG93c0V4Y2x1ZGluZ09mZnNjcmVlbigpO1xuXHRcdFx0Zm9yIChjb25zdCB3aW5kb3cgb2Ygd2luZG93cykge1xuXHRcdFx0XHRpZiAoZnJhbWUucHJvY2Vzc0lkID09PSB3aW5kb3cud2ViQ29udGVudHMubWFpbkZyYW1lLnByb2Nlc3NJZCkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgaXNBbGxvd2VkV2Vidmlld1JlcXVlc3QgPSAodXJpOiBVUkksIGRldGFpbHM6IEVsZWN0cm9uLk9uQmVmb3JlUmVxdWVzdExpc3RlbmVyRGV0YWlscyk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0aWYgKHVyaS5wYXRoICE9PSAnL2luZGV4Lmh0bWwnKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlOyAvLyBPbmx5IHJlc3RyaWN0IHRvcCBsZXZlbCBwYWdlIG9mIHdlYnZpZXdzOiBpbmRleC5odG1sXG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZyYW1lID0gZGV0YWlscy5mcmFtZTtcblx0XHRcdGlmICghZnJhbWUgfHwgZnJhbWUuaXNEZXN0cm95ZWQoKSB8fCAhdGhpcy53aW5kb3dzTWFpblNlcnZpY2UpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayB0byBzZWUgaWYgdGhlIHJlcXVlc3QgY29tZXMgZnJvbSBvbmUgb2YgdGhlIG1haW4gZWRpdG9yIHdpbmRvd3MuXG5cdFx0XHRmb3IgKGNvbnN0IHdpbmRvdyBvZiB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dzKCkpIHtcblx0XHRcdFx0aWYgKHdpbmRvdy53aW4pIHtcblx0XHRcdFx0XHRpZiAoZnJhbWUucHJvY2Vzc0lkID09PSB3aW5kb3cud2luLndlYkNvbnRlbnRzLm1haW5GcmFtZS5wcm9jZXNzSWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fTtcblxuXHRcdHNlc3Npb24uZGVmYXVsdFNlc3Npb24ud2ViUmVxdWVzdC5vbkJlZm9yZVJlcXVlc3QoKGRldGFpbHMsIGNhbGxiYWNrKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoZGV0YWlscy51cmwpO1xuXHRcdFx0aWYgKHVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlV2Vidmlldykge1xuXHRcdFx0XHRpZiAoIWlzQWxsb3dlZFdlYnZpZXdSZXF1ZXN0KHVyaSwgZGV0YWlscykpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0Jsb2NrZWQgdnNjb2RlLXdlYnZpZXcgcmVxdWVzdCcsIGRldGFpbHMudXJsKTtcblx0XHRcdFx0XHRyZXR1cm4gY2FsbGJhY2soeyBjYW5jZWw6IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlRmlsZVJlc291cmNlKSB7XG5cdFx0XHRcdGlmICghaXNBbGxvd2VkVnNDb2RlRmlsZVJlcXVlc3QoZGV0YWlscykpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0Jsb2NrZWQgdnNjb2RlLWZpbGUgcmVxdWVzdCcsIGRldGFpbHMudXJsKTtcblx0XHRcdFx0XHRyZXR1cm4gY2FsbGJhY2soeyBjYW5jZWw6IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQmxvY2sgbW9zdCBzdmdzXG5cdFx0XHRpZiAodXJpLnBhdGguZW5kc1dpdGgoJy5zdmcnKSkge1xuXHRcdFx0XHRjb25zdCBpc1NhZmVSZXNvdXJjZVVybCA9IHN1cHBvcnRlZFN2Z1NjaGVtZXMuaGFzKHVyaS5zY2hlbWUpO1xuXHRcdFx0XHRpZiAoIWlzU2FmZVJlc291cmNlVXJsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNhbGxiYWNrKHsgY2FuY2VsOiAhaXNTdmdSZXF1ZXN0RnJvbVNhZmVDb250ZXh0KGRldGFpbHMpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjYWxsYmFjayh7IGNhbmNlbDogZmFsc2UgfSk7XG5cdFx0fSk7XG5cblx0XHQvLyBDb25maWd1cmUgU1ZHIGhlYWRlciBjb250ZW50IHR5cGUgcHJvcGVybHlcblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvOTc1NjRcblx0XHRzZXNzaW9uLmRlZmF1bHRTZXNzaW9uLndlYlJlcXVlc3Qub25IZWFkZXJzUmVjZWl2ZWQoKGRldGFpbHMsIGNhbGxiYWNrKSA9PiB7XG5cdFx0XHRjb25zdCByZXNwb25zZUhlYWRlcnMgPSBkZXRhaWxzLnJlc3BvbnNlSGVhZGVycyBhcyBSZWNvcmQ8c3RyaW5nLCAoc3RyaW5nKSB8IChzdHJpbmdbXSk+O1xuXHRcdFx0Y29uc3QgY29udGVudFR5cGVzID0gKHJlc3BvbnNlSGVhZGVyc1snY29udGVudC10eXBlJ10gfHwgcmVzcG9uc2VIZWFkZXJzWydDb250ZW50LVR5cGUnXSk7XG5cblx0XHRcdGlmIChjb250ZW50VHlwZXMgJiYgQXJyYXkuaXNBcnJheShjb250ZW50VHlwZXMpKSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShkZXRhaWxzLnVybCk7XG5cdFx0XHRcdGlmICh1cmkucGF0aC5lbmRzV2l0aCgnLnN2ZycpKSB7XG5cdFx0XHRcdFx0aWYgKHN1cHBvcnRlZFN2Z1NjaGVtZXMuaGFzKHVyaS5zY2hlbWUpKSB7XG5cdFx0XHRcdFx0XHRyZXNwb25zZUhlYWRlcnNbJ0NvbnRlbnQtVHlwZSddID0gWydpbWFnZS9zdmcreG1sJ107XG5cblx0XHRcdFx0XHRcdHJldHVybiBjYWxsYmFjayh7IGNhbmNlbDogZmFsc2UsIHJlc3BvbnNlSGVhZGVycyB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyByZW1vdGUgZXh0ZW5zaW9uIHNjaGVtZXMgaGF2ZSB0aGUgZm9sbG93aW5nIGZvcm1hdFxuXHRcdFx0XHQvLyBodHRwOi8vMTI3LjAuMC4xOjxwb3J0Pi92c2NvZGUtcmVtb3RlLXJlc291cmNlP3BhdGg9XG5cdFx0XHRcdGlmICghdXJpLnBhdGguZW5kc1dpdGgoU2NoZW1hcy52c2NvZGVSZW1vdGVSZXNvdXJjZSkgJiYgY29udGVudFR5cGVzLnNvbWUoY29udGVudFR5cGUgPT4gY29udGVudFR5cGUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnaW1hZ2Uvc3ZnJykpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNhbGxiYWNrKHsgY2FuY2VsOiAhaXNTdmdSZXF1ZXN0RnJvbVNhZmVDb250ZXh0KGRldGFpbHMpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjYWxsYmFjayh7IGNhbmNlbDogZmFsc2UgfSk7XG5cdFx0fSk7XG5cblx0XHQvLyNlbmRyZWdpb25cblxuXHRcdC8vI3JlZ2lvbiBBbGxvdyBDT1JTIGZvciB0aGUgUFJTUyBDRE5cblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlLXJlbW90ZS1yZWxlYXNlL2lzc3Vlcy85MjQ2XG5cdFx0c2Vzc2lvbi5kZWZhdWx0U2Vzc2lvbi53ZWJSZXF1ZXN0Lm9uSGVhZGVyc1JlY2VpdmVkKChkZXRhaWxzLCBjYWxsYmFjaykgPT4ge1xuXHRcdFx0aWYgKGRldGFpbHMudXJsLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vdnNjb2RlLmRvd25sb2FkLnByc3MubWljcm9zb2Z0LmNvbS8nKSkge1xuXHRcdFx0XHRjb25zdCByZXNwb25zZUhlYWRlcnMgPSBkZXRhaWxzLnJlc3BvbnNlSGVhZGVycyA/PyBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG5cdFx0XHRcdGlmIChyZXNwb25zZUhlYWRlcnNbJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbiddID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXNwb25zZUhlYWRlcnNbJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbiddID0gWycqJ107XG5cdFx0XHRcdFx0cmV0dXJuIGNhbGxiYWNrKHsgY2FuY2VsOiBmYWxzZSwgcmVzcG9uc2VIZWFkZXJzIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjYWxsYmFjayh7IGNhbmNlbDogZmFsc2UgfSk7XG5cdFx0fSk7XG5cblx0XHQvLyNlbmRyZWdpb25cblxuXHRcdC8vI3JlZ2lvbiBDb2RlIENhY2hlXG5cblx0XHR0eXBlIFNlc3Npb25XaXRoQ29kZUNhY2hlUGF0aFN1cHBvcnQgPSBTZXNzaW9uICYge1xuXHRcdFx0LyoqXG5cdFx0XHQgKiBTZXRzIGNvZGUgY2FjaGUgZGlyZWN0b3J5LiBCeSBkZWZhdWx0LCB0aGUgZGlyZWN0b3J5IHdpbGwgYmUgYENvZGUgQ2FjaGVgIHVuZGVyXG5cdFx0XHQgKiB0aGUgcmVzcGVjdGl2ZSB1c2VyIGRhdGEgZm9sZGVyLlxuXHRcdFx0ICovXG5cdFx0XHRzZXRDb2RlQ2FjaGVQYXRoPyhwYXRoOiBzdHJpbmcpOiB2b2lkO1xuXHRcdH07XG5cblx0XHRjb25zdCBkZWZhdWx0U2Vzc2lvbiA9IHNlc3Npb24uZGVmYXVsdFNlc3Npb24gYXMgdW5rbm93biBhcyBTZXNzaW9uV2l0aENvZGVDYWNoZVBhdGhTdXBwb3J0O1xuXHRcdGlmICh0eXBlb2YgZGVmYXVsdFNlc3Npb24uc2V0Q29kZUNhY2hlUGF0aCA9PT0gJ2Z1bmN0aW9uJyAmJiB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuY29kZUNhY2hlUGF0aCkge1xuXHRcdFx0Ly8gTWFrZSBzdXJlIHRvIHBhcnRpdGlvbiBDaHJvbWUncyBjb2RlIGNhY2hlIGZvbGRlclxuXHRcdFx0Ly8gaW4gdGhlIHNhbWUgd2F5IGFzIG91ciBjb2RlIGNhY2hlIHBhdGggdG8gaGVscFxuXHRcdFx0Ly8gaW52YWxpZGF0ZSBjYWNoZXMgdGhhdCB3ZSBrbm93IGFyZSBpbnZhbGlkXG5cdFx0XHQvLyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyMDY1NSlcblx0XHRcdGRlZmF1bHRTZXNzaW9uLnNldENvZGVDYWNoZVBhdGgoam9pbih0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuY29kZUNhY2hlUGF0aCwgJ2Nocm9tZScpKTtcblx0XHR9XG5cblx0XHQvLyNlbmRyZWdpb25cblxuXHRcdC8vI3JlZ2lvbiBVTkMgSG9zdCBBbGxvd2xpc3QgKFdpbmRvd3MpXG5cblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnc2VjdXJpdHkucmVzdHJpY3RVTkNBY2Nlc3MnKSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0ZGlzYWJsZVVOQ0FjY2Vzc1Jlc3RyaWN0aW9ucygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YWRkVU5DSG9zdFRvQWxsb3dsaXN0KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3NlY3VyaXR5LmFsbG93ZWRVTkNIb3N0cycpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyNlbmRyZWdpb25cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBEaXNwb3NlIG9uIHNodXRkb3duXG5cdFx0RXZlbnQub25jZSh0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLm9uV2lsbFNodXRkb3duKSgoKSA9PiB0aGlzLmRpc3Bvc2UoKSk7XG5cblx0XHQvLyBDb250ZXh0bWVudSB2aWEgSVBDIHN1cHBvcnRcblx0XHRyZWdpc3RlckNvbnRleHRNZW51TGlzdGVuZXIoKTtcblxuXHRcdC8vIEFjY2Vzc2liaWxpdHkgY2hhbmdlIGV2ZW50XG5cdFx0YXBwLm9uKCdhY2Nlc3NpYmlsaXR5LXN1cHBvcnQtY2hhbmdlZCcsIChldmVudCwgYWNjZXNzaWJpbGl0eVN1cHBvcnRFbmFibGVkKSA9PiB7XG5cdFx0XHR0aGlzLndpbmRvd3NNYWluU2VydmljZT8uc2VuZFRvQWxsKCd2c2NvZGU6YWNjZXNzaWJpbGl0eVN1cHBvcnRDaGFuZ2VkJywgYWNjZXNzaWJpbGl0eVN1cHBvcnRFbmFibGVkKTtcblx0XHR9KTtcblxuXHRcdC8vIG1hY09TIGRvY2sgYWN0aXZhdGVcblx0XHRhcHAub24oJ2FjdGl2YXRlJywgYXN5bmMgKGV2ZW50LCBoYXNWaXNpYmxlV2luZG93cykgPT4ge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdhcHAjYWN0aXZhdGUnKTtcblxuXHRcdFx0Ly8gTWFjIG9ubHkgZXZlbnQ6IG9wZW4gbmV3IHdpbmRvdyB3aGVuIHdlIGdldCBhY3RpdmF0ZWRcblx0XHRcdGlmICghaGFzVmlzaWJsZVdpbmRvd3MpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy53aW5kb3dzTWFpblNlcnZpY2U/Lm9wZW5FbXB0eVdpbmRvdyh7IGNvbnRleHQ6IE9wZW5Db250ZXh0LkRPQ0sgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyNyZWdpb24gU2VjdXJpdHkgcmVsYXRlZCBtZWFzdXJlcyAoaHR0cHM6Ly9lbGVjdHJvbmpzLm9yZy9kb2NzL3R1dG9yaWFsL3NlY3VyaXR5KVxuXHRcdC8vXG5cdFx0Ly8gISEhIERPIE5PVCBDSEFOR0Ugd2l0aG91dCBjb25zdWx0aW5nIHRoZSBkb2N1bWVudGF0aW9uICEhIVxuXHRcdC8vXG5cdFx0YXBwLm9uKCd3ZWItY29udGVudHMtY3JlYXRlZCcsIChldmVudCwgY29udGVudHMpID0+IHtcblxuXHRcdFx0Ly8gQXV4aWxpYXJ5IFdpbmRvdzogZGVsZWdhdGUgdG8gYEF1eGlsaWFyeVdpbmRvd2AgY2xhc3Ncblx0XHRcdGlmIChjb250ZW50cz8ub3BlbmVyPy51cmwuc3RhcnRzV2l0aChgJHtTY2hlbWFzLnZzY29kZUZpbGVSZXNvdXJjZX06Ly8ke1ZTQ09ERV9BVVRIT1JJVFl9L2ApKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW2F1eCB3aW5kb3ddICBhcHAub24oXCJ3ZWItY29udGVudHMtY3JlYXRlZFwiKTogUmVnaXN0ZXJpbmcgYXV4aWxpYXJ5IHdpbmRvdycpO1xuXG5cdFx0XHRcdHRoaXMuYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlPy5yZWdpc3RlcldpbmRvdyhjb250ZW50cyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEhhbmRsZSBhbnkgaW4tcGFnZSBuYXZpZ2F0aW9uXG5cdFx0XHRjb250ZW50cy5vbignd2lsbC1uYXZpZ2F0ZScsIGV2ZW50ID0+IHtcblx0XHRcdFx0aWYgKEJyb3dzZXJWaWV3TWFpblNlcnZpY2UuaXNCcm93c2VyVmlld1dlYkNvbnRlbnRzKGNvbnRlbnRzKSkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gQWxsb3cgbmF2aWdhdGlvbiBpbiBpbnRlZ3JhdGVkIGJyb3dzZXIgdmlld3Ncblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignd2ViQ29udGVudHMjd2lsbC1uYXZpZ2F0ZTogUHJldmVudGVkIHdlYmNvbnRlbnQgbmF2aWdhdGlvbicpO1xuXG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7IC8vIFByZXZlbnQgYW55IGluLXBhZ2UgbmF2aWdhdGlvblxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEFsbCBXaW5kb3dzOiBvbmx5IGFsbG93IGFib3V0OmJsYW5rIGF1eGlsaWFyeSB3aW5kb3dzIHRvIG9wZW5cblx0XHRcdC8vIEZvciBhbGwgb3RoZXIgVVJMcywgZGVsZWdhdGUgdG8gdGhlIE9TLlxuXHRcdFx0Y29udGVudHMuc2V0V2luZG93T3BlbkhhbmRsZXIoZGV0YWlscyA9PiB7XG5cblx0XHRcdFx0Ly8gYWJvdXQ6Ymxhbmsgd2luZG93cyBjYW4gb3BlbiBhcyB3aW5kb3cgd2l0aG8gb3VyIGRlZmF1bHQgb3B0aW9uc1xuXHRcdFx0XHRpZiAoZGV0YWlscy51cmwgPT09ICdhYm91dDpibGFuaycpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1thdXggd2luZG93XSB3ZWJDb250ZW50cyNzZXRXaW5kb3dPcGVuSGFuZGxlcjogQWxsb3dpbmcgYXV4aWxpYXJ5IHdpbmRvdyB0byBvcGVuIG9uIGFib3V0OmJsYW5rJyk7XG5cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0YWN0aW9uOiAnYWxsb3cnLFxuXHRcdFx0XHRcdFx0b3ZlcnJpZGVCcm93c2VyV2luZG93T3B0aW9uczogdGhpcy5hdXhpbGlhcnlXaW5kb3dzTWFpblNlcnZpY2U/LmNyZWF0ZVdpbmRvdyhkZXRhaWxzKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBBbnkgb3RoZXIgVVJMOiBkZWxlZ2F0ZSB0byBPU1xuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYHdlYkNvbnRlbnRzI3NldFdpbmRvd09wZW5IYW5kbGVyOiBQcmV2ZW50ZWQgb3BlbmluZyB3aW5kb3cgd2l0aCBVUkwgJHtkZXRhaWxzLnVybH19YCk7XG5cblx0XHRcdFx0XHR0aGlzLm5hdGl2ZUhvc3RNYWluU2VydmljZT8ub3BlbkV4dGVybmFsKHVuZGVmaW5lZCwgZGV0YWlscy51cmwpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHsgYWN0aW9uOiAnZGVueScgfTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHQvLyNlbmRyZWdpb25cblxuXHRcdGxldCBtYWNPcGVuRmlsZVVSSXM6IElXaW5kb3dPcGVuYWJsZVtdID0gW107XG5cdFx0bGV0IHJ1bm5pbmdUaW1lb3V0OiBUaW1lb3V0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGFwcC5vbignb3Blbi1maWxlJywgKGV2ZW50LCBwYXRoKSA9PiB7XG5cdFx0XHRwYXRoID0gbm9ybWFsaXplTkZDKHBhdGgpOyAvLyBtYWNPUyBvbmx5OiBub3JtYWxpemUgcGF0aHMgdG8gTkZDIGZvcm1cblxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdhcHAjb3Blbi1maWxlOiAnLCBwYXRoKTtcblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cblx0XHRcdC8vIEtlZXAgaW4gYXJyYXkgYmVjYXVzZSBtb3JlIG1pZ2h0IGNvbWUhXG5cdFx0XHRtYWNPcGVuRmlsZVVSSXMucHVzaChoYXNXb3Jrc3BhY2VGaWxlRXh0ZW5zaW9uKHBhdGgpID8geyB3b3Jrc3BhY2VVcmk6IFVSSS5maWxlKHBhdGgpIH0gOiB7IGZpbGVVcmk6IFVSSS5maWxlKHBhdGgpIH0pO1xuXG5cdFx0XHQvLyBDbGVhciBwcmV2aW91cyBoYW5kbGVyIGlmIGFueVxuXHRcdFx0aWYgKHJ1bm5pbmdUaW1lb3V0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHJ1bm5pbmdUaW1lb3V0KTtcblx0XHRcdFx0cnVubmluZ1RpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEhhbmRsZSBwYXRocyBkZWxheWVkIGluIGNhc2UgbW9yZSBhcmUgY29taW5nIVxuXHRcdFx0cnVubmluZ1RpbWVvdXQgPSBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy53aW5kb3dzTWFpblNlcnZpY2U/Lm9wZW4oe1xuXHRcdFx0XHRcdGNvbnRleHQ6IE9wZW5Db250ZXh0LkRPQ0sgLyogY2FuIGFsc28gYmUgb3BlbmluZyBmcm9tIGZpbmRlciB3aGlsZSBhcHAgaXMgcnVubmluZyAqLyxcblx0XHRcdFx0XHRjbGk6IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzLFxuXHRcdFx0XHRcdHVyaXNUb09wZW46IG1hY09wZW5GaWxlVVJJcyxcblx0XHRcdFx0XHRnb3RvTGluZU1vZGU6IGZhbHNlLFxuXHRcdFx0XHRcdHByZWZlck5ld1dpbmRvdzogdHJ1ZSAvKiBkcm9wcGluZyBvbiB0aGUgZG9jayBvciBvcGVuaW5nIGZyb20gZmluZGVyIHByZWZlcnMgdG8gb3BlbiBpbiBhIG5ldyB3aW5kb3cgKi9cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0bWFjT3BlbkZpbGVVUklzID0gW107XG5cdFx0XHRcdHJ1bm5pbmdUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fSwgMTAwKTtcblx0XHR9KTtcblxuXHRcdGFwcC5vbignbmV3LXdpbmRvdy1mb3ItdGFiJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy53aW5kb3dzTWFpblNlcnZpY2U/Lm9wZW5FbXB0eVdpbmRvdyh7IGNvbnRleHQ6IE9wZW5Db250ZXh0LkRFU0tUT1AgfSk7IC8vbWFjT1MgbmF0aXZlIHRhYiBcIitcIiBidXR0b25cblx0XHR9KTtcblxuXHRcdC8vI3JlZ2lvbiBCb290c3RyYXAgSVBDIEhhbmRsZXJzXG5cblx0XHR2YWxpZGF0ZWRJcGNNYWluLmhhbmRsZSgndnNjb2RlOmZldGNoU2hlbGxFbnYnLCBldmVudCA9PiB7XG5cblx0XHRcdC8vIFByZWZlciB0byB1c2UgdGhlIGFyZ3MgYW5kIGVudiBmcm9tIHRoZSB0YXJnZXQgd2luZG93XG5cdFx0XHQvLyB3aGVuIHJlc29sdmluZyB0aGUgc2hlbGwgZW52LiBJdCBpcyBwb3NzaWJsZSB0aGF0XG5cdFx0XHQvLyBhIGZpcnN0IHdpbmRvdyB3YXMgb3BlbmVkIGZyb20gdGhlIFVJIGJ1dCBhIHNlY29uZFxuXHRcdFx0Ly8gZnJvbSB0aGUgQ0xJIGFuZCB0aGF0IGhhcyBpbXBsaWNhdGlvbnMgZm9yIHdoZXRoZXIgdG9cblx0XHRcdC8vIHJlc29sdmUgdGhlIHNoZWxsIGVudmlyb25tZW50IG9yIG5vdC5cblx0XHRcdC8vXG5cdFx0XHQvLyBXaW5kb3cgY2FuIGJlIHVuZGVmaW5lZCBmb3IgZS5nLiB0aGUgc2hhcmVkIHByb2Nlc3Ncblx0XHRcdC8vIHRoYXQgaXMgbm90IHBhcnQgb2Ygb3VyIHdpbmRvd3MgcmVnaXN0cnkhXG5cdFx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZT8uZ2V0V2luZG93QnlXZWJDb250ZW50cyhldmVudC5zZW5kZXIpOyAvLyBOb3RlOiB0aGlzIGNhbiBiZSBgdW5kZWZpbmVkYCBmb3IgdGhlIHNoYXJlZCBwcm9jZXNzXG5cdFx0XHRsZXQgYXJnczogTmF0aXZlUGFyc2VkQXJncztcblx0XHRcdGxldCBlbnY6IElQcm9jZXNzRW52aXJvbm1lbnQ7XG5cdFx0XHRpZiAod2luZG93Py5jb25maWcpIHtcblx0XHRcdFx0YXJncyA9IHdpbmRvdy5jb25maWc7XG5cdFx0XHRcdGVudiA9IHsgLi4ucHJvY2Vzcy5lbnYsIC4uLndpbmRvdy5jb25maWcudXNlckVudiB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXJncyA9IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzO1xuXHRcdFx0XHRlbnYgPSBwcm9jZXNzLmVudjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVzb2x2ZSBzaGVsbCBlbnZcblx0XHRcdHJldHVybiB0aGlzLnJlc29sdmVTaGVsbEVudmlyb25tZW50KGFyZ3MsIGVudiwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dmFsaWRhdGVkSXBjTWFpbi5vbigndnNjb2RlOnRvZ2dsZURldlRvb2xzJywgZXZlbnQgPT4gZXZlbnQuc2VuZGVyLnRvZ2dsZURldlRvb2xzKCkpO1xuXHRcdHZhbGlkYXRlZElwY01haW4ub24oJ3ZzY29kZTpvcGVuRGV2VG9vbHMnLCBldmVudCA9PiBldmVudC5zZW5kZXIub3BlbkRldlRvb2xzKCkpO1xuXG5cdFx0dmFsaWRhdGVkSXBjTWFpbi5vbigndnNjb2RlOnJlbG9hZFdpbmRvdycsIGV2ZW50ID0+IGV2ZW50LnNlbmRlci5yZWxvYWQoKSk7XG5cblx0XHR2YWxpZGF0ZWRJcGNNYWluLmhhbmRsZSgndnNjb2RlOm5vdGlmeVpvb21MZXZlbCcsIGFzeW5jIChldmVudCwgem9vbUxldmVsOiBudW1iZXIgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93c01haW5TZXJ2aWNlPy5nZXRXaW5kb3dCeVdlYkNvbnRlbnRzKGV2ZW50LnNlbmRlcik7XG5cdFx0XHRpZiAod2luZG93KSB7XG5cdFx0XHRcdHdpbmRvdy5ub3RpZnlab29tTGV2ZWwoem9vbUxldmVsKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vI2VuZHJlZ2lvblxuXHR9XG5cblx0YXN5bmMgc3RhcnR1cCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1N0YXJ0aW5nIFZTIENvZGUnKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYGZyb206ICR7dGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFwcFJvb3R9YCk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdhcmdzOicsIHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzKTtcblxuXHRcdC8vIE1ha2Ugc3VyZSB3ZSBhc3NvY2lhdGUgdGhlIHByb2dyYW0gd2l0aCB0aGUgYXBwIHVzZXIgbW9kZWwgaWRcblx0XHQvLyBUaGlzIHdpbGwgaGVscCBXaW5kb3dzIHRvIGFzc29jaWF0ZSB0aGUgcnVubmluZyBwcm9ncmFtIHdpdGhcblx0XHQvLyBhbnkgc2hvcnRjdXQgdGhhdCBpcyBwaW5uZWQgdG8gdGhlIHRhc2tiYXIgYW5kIHByZXZlbnQgc2hvd2luZ1xuXHRcdC8vIHR3byBpY29ucyBpbiB0aGUgdGFza2JhciBmb3IgdGhlIHNhbWUgYXBwLlxuXHRcdGNvbnN0IHdpbjMyQXBwVXNlck1vZGVsSWQgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLndpbjMyQXBwVXNlck1vZGVsSWQ7XG5cdFx0aWYgKGlzV2luZG93cyAmJiB3aW4zMkFwcFVzZXJNb2RlbElkKSB7XG5cdFx0XHRhcHAuc2V0QXBwVXNlck1vZGVsSWQod2luMzJBcHBVc2VyTW9kZWxJZCk7XG5cdFx0fVxuXG5cdFx0Ly8gRml4IG5hdGl2ZSB0YWJzIG9uIG1hY09TIDEwLjEzXG5cdFx0Ly8gbWFjT1MgZW5hYmxlcyBhIGNvbXBhdGliaWxpdHkgcGF0Y2ggZm9yIGFueSBidW5kbGUgSUQgYmVnaW5uaW5nIHdpdGhcblx0XHQvLyBcImNvbS5taWNyb3NvZnQuXCIsIHdoaWNoIGJyZWFrcyBuYXRpdmUgdGFicyBmb3IgVlMgQ29kZSB3aGVuIHVzaW5nIHRoaXNcblx0XHQvLyBpZGVudGlmaWVyIChmcm9tIHRoZSBvZmZpY2lhbCBidWlsZCkuXG5cdFx0Ly8gRXhwbGljaXRseSBvcHQgb3V0IG9mIHRoZSBwYXRjaCBoZXJlIGJlZm9yZSBjcmVhdGluZyBhbnkgd2luZG93cy5cblx0XHQvLyBTZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zNTM2MSNpc3N1ZWNvbW1lbnQtMzk5Nzk0MDg1XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChpc01hY2ludG9zaCAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd3aW5kb3cubmF0aXZlVGFicycpID09PSB0cnVlICYmICFzeXN0ZW1QcmVmZXJlbmNlcy5nZXRVc2VyRGVmYXVsdCgnTlNVc2VJbXByb3ZlZExheW91dFBhc3MnLCAnYm9vbGVhbicpKSB7XG5cdFx0XHRcdHN5c3RlbVByZWZlcmVuY2VzLnNldFVzZXJEZWZhdWx0KCdOU1VzZUltcHJvdmVkTGF5b3V0UGFzcycsICdib29sZWFuJywgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0fVxuXG5cdFx0Ly8gTWFpbiBwcm9jZXNzIHNlcnZlciAoZWxlY3Ryb24gSVBDIGJhc2VkKVxuXHRcdGNvbnN0IG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIgPSBuZXcgRWxlY3Ryb25JUENTZXJ2ZXIoKTtcblx0XHRFdmVudC5vbmNlKHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2Uub25XaWxsU2h1dGRvd24pKGUgPT4ge1xuXHRcdFx0aWYgKGUucmVhc29uID09PSBTaHV0ZG93blJlYXNvbi5LSUxMKSB7XG5cdFx0XHRcdC8vIFdoZW4gd2UgZ28gZG93biBhYm5vcm1hbGx5LCBtYWtlIHN1cmUgdG8gZnJlZSB1cFxuXHRcdFx0XHQvLyBhbnkgSVBDIHdlIGFjY2VwdCBmcm9tIG90aGVyIHdpbmRvd3MgdG8gcmVkdWNlXG5cdFx0XHRcdC8vIHRoZSBjaGFuY2Ugb2YgZG9pbmcgd29yayBhZnRlciB3ZSBnbyBkb3duLiBLaWxsXG5cdFx0XHRcdC8vIGlzIHNwZWNpYWwgaW4gdGhhdCBpdCBkb2VzIG5vdCBvcmRlcmx5IHNodXRkb3duXG5cdFx0XHRcdC8vIHdpbmRvd3MuXG5cdFx0XHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gUmVzb2x2ZSB1bmlxdWUgbWFjaGluZSBJRFxuXHRcdGNvbnN0IFttYWNoaW5lSWQsIHNxbUlkLCBkZXZEZXZpY2VJZF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRyZXNvbHZlTWFjaGluZUlkKHRoaXMuc3RhdGVTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpLFxuXHRcdFx0cmVzb2x2ZVNxbUlkKHRoaXMuc3RhdGVTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpLFxuXHRcdFx0cmVzb2x2ZURldkRldmljZUlkKHRoaXMuc3RhdGVTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpXG5cdFx0XSk7XG5cblx0XHQvLyBTaGFyZWQgcHJvY2Vzc1xuXHRcdGNvbnN0IHsgc2hhcmVkUHJvY2Vzc1JlYWR5LCBzaGFyZWRQcm9jZXNzQ2xpZW50IH0gPSB0aGlzLnNldHVwU2hhcmVkUHJvY2VzcyhtYWNoaW5lSWQsIHNxbUlkLCBkZXZEZXZpY2VJZCk7XG5cblx0XHQvLyBTZXJ2aWNlc1xuXHRcdGNvbnN0IGFwcEluc3RhbnRpYXRpb25TZXJ2aWNlID0gYXdhaXQgdGhpcy5pbml0U2VydmljZXMobWFjaGluZUlkLCBzcW1JZCwgZGV2RGV2aWNlSWQsIHNoYXJlZFByb2Nlc3NSZWFkeSk7XG5cblx0XHQvLyBFcnJvciB0ZWxlbWV0cnlcblx0XHRhcHBJbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB0aGlzLl9yZWdpc3RlcihuZXcgRXJyb3JUZWxlbWV0cnkoYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElUZWxlbWV0cnlTZXJ2aWNlKSkpKTtcblxuXHRcdC8vIEFnZW50IEhvc3Rcblx0XHQvLyBBbHdheXMgaW5zdGFudGlhdGUgdGhlIHN0YXJ0ZXIgKyBtYW5hZ2VyLiBUaGV5IGFyZSBjaGVhcCAodGhlXG5cdFx0Ly8gY29uc3RydWN0b3JzIG9ubHkgcmVnaXN0ZXIgYW4gSVBDIGxpc3RlbmVyIGFuZCBlbWl0dGVycykgYW5kIHRoZSBhZ2VudFxuXHRcdC8vIGhvc3QgdXRpbGl0eSBwcm9jZXNzIGlzIHNwYXduZWQgbGF6aWx5IG9uIHRoZSBmaXJzdCB3aW5kb3cgY29ubmVjdGlvblxuXHRcdC8vIHJlcXVlc3QuIFRoZSByZW5kZXJlciBvbmx5IHJlcXVlc3RzIGEgY29ubmVjdGlvbiB3aGVuIHRoZSBydW50aW1lIGlzXG5cdFx0Ly8gYXZhaWxhYmxlIGFuZCBBSSBmZWF0dXJlcyBhcmUgZW5hYmxlZCB0aGVyZSwgd2hpY2ggdGhlIG1haW4gcHJvY2Vzc1xuXHRcdC8vIGNhbm5vdCBmdWxseSBvYnNlcnZlLlxuXHRcdGNvbnN0IGFnZW50SG9zdFN0YXJ0ZXIgPSBhcHBJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbGVjdHJvbkFnZW50SG9zdFN0YXJ0ZXIsIHsgbWFjaGluZUlkLCBzcW1JZCwgZGV2RGV2aWNlSWQgfSk7XG5cdFx0Ly8gVGhpcyBtYW5hZ2VyIHNlbGYtZGlzcG9zZXMgYWZ0ZXIgaXRzIGxpZmVjeWNsZSBqb2luOyBDb2RlQXBwbGljYXRpb24gZGlzcG9zZXMgYmVmb3JlIGxhdGVyIHNodXRkb3duIGxpc3RlbmVycyBydW4uXG5cdFx0YXBwSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0UHJvY2Vzc01hbmFnZXIsIGFnZW50SG9zdFN0YXJ0ZXIsIHByb2Nlc3MucGxhdGZvcm0pO1xuXG5cdFx0Ly8gTWV0ZXJlZCBjb25uZWN0aW9uIHRlbGVtZXRyeVxuXHRcdGFwcEluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdChhY2Nlc3Nvci5nZXQoSU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSkgYXMgTWV0ZXJlZENvbm5lY3Rpb25NYWluU2VydmljZSkuc2V0VGVsZW1ldHJ5U2VydmljZShhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHR9KTtcblxuXHRcdC8vIEF1dGggSGFuZGxlclxuXHRcdGFwcEluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjY2Vzc29yLmdldChJUHJveHlBdXRoU2VydmljZSkpO1xuXG5cdFx0Ly8gVHJhbnNpZW50IHByb2ZpbGVzIGhhbmRsZXJcblx0XHR0aGlzLl9yZWdpc3RlcihhcHBJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVByb2ZpbGVzSGFuZGxlcikpO1xuXG5cdFx0Ly8gSW5pdCBDaGFubmVsc1xuXHRcdGFwcEluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHRoaXMuaW5pdENoYW5uZWxzKGFjY2Vzc29yLCBtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLCBzaGFyZWRQcm9jZXNzQ2xpZW50KSk7XG5cblx0XHQvLyBTZXR1cCBQcm90b2NvbCBVUkwgSGFuZGxlcnNcblx0XHRjb25zdCBpbml0aWFsUHJvdG9jb2xVcmxzID0gYXdhaXQgYXBwSW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gdGhpcy5zZXR1cFByb3RvY29sVXJsSGFuZGxlcnMoYWNjZXNzb3IsIG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIpKTtcblxuXHRcdC8vIFNldHVwIHZzY29kZS1yZW1vdGUtcmVzb3VyY2UgcHJvdG9jb2wgaGFuZGxlclxuXHRcdHRoaXMuc2V0dXBNYW5hZ2VkUmVtb3RlUmVzb3VyY2VVcmxIYW5kbGVyKG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIpO1xuXG5cdFx0Ly8gU2lnbmFsIHBoYXNlOiByZWFkeSAtIGJlZm9yZSBvcGVuaW5nIGZpcnN0IHdpbmRvd1xuXHRcdHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2UucGhhc2UgPSBMaWZlY3ljbGVNYWluUGhhc2UuUmVhZHk7XG5cblx0XHQvLyBPcGVuIFdpbmRvd3Ncblx0XHRhd2FpdCBhcHBJbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB0aGlzLm9wZW5GaXJzdFdpbmRvdyhhY2Nlc3NvciwgaW5pdGlhbFByb3RvY29sVXJscykpO1xuXG5cdFx0Ly8gU2lnbmFsIHBoYXNlOiBhZnRlciB3aW5kb3cgb3BlblxuXHRcdHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2UucGhhc2UgPSBMaWZlY3ljbGVNYWluUGhhc2UuQWZ0ZXJXaW5kb3dPcGVuO1xuXG5cdFx0Ly8gUG9zdCBPcGVuIFdpbmRvd3MgVGFza3Ncblx0XHR0aGlzLmFmdGVyV2luZG93T3BlbihhcHBJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHQvLyBTZXQgbGlmZWN5Y2xlIHBoYXNlIHRvIGBFdmVudHVhbGx5YCBhZnRlciBhIHNob3J0IGRlbGF5IGFuZCB3aGVuIGlkbGUgKG1pbiAyLjVzZWMsIG1heCA1c2VjKVxuXHRcdGNvbnN0IGV2ZW50dWFsbHlQaGFzZVNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJ1bldoZW5HbG9iYWxJZGxlKCgpID0+IHtcblxuXHRcdFx0XHQvLyBTaWduYWwgcGhhc2U6IGV2ZW50dWFsbHlcblx0XHRcdFx0dGhpcy5saWZlY3ljbGVNYWluU2VydmljZS5waGFzZSA9IExpZmVjeWNsZU1haW5QaGFzZS5FdmVudHVhbGx5O1xuXG5cdFx0XHRcdC8vIEV2ZW50dWFsbHkgUG9zdCBPcGVuIFdpbmRvdyBUYXNrc1xuXHRcdFx0XHR0aGlzLmV2ZW50dWFsbHlBZnRlcldpbmRvd09wZW4oYXBwSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0fSwgMjUwMCkpO1xuXHRcdH0sIDI1MDApKTtcblx0XHRldmVudHVhbGx5UGhhc2VTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2V0dXBQcm90b2NvbFVybEhhbmRsZXJzKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyOiBFbGVjdHJvbklQQ1NlcnZlcik6IFByb21pc2U8SUluaXRpYWxQcm90b2NvbFVybHMgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB3aW5kb3dzTWFpblNlcnZpY2UgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZSA9IGFjY2Vzc29yLmdldChJV2luZG93c01haW5TZXJ2aWNlKTtcblx0XHRjb25zdCB1cmxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElVUkxTZXJ2aWNlKTtcblx0XHRjb25zdCBuYXRpdmVIb3N0TWFpblNlcnZpY2UgPSB0aGlzLm5hdGl2ZUhvc3RNYWluU2VydmljZSA9IGFjY2Vzc29yLmdldChJTmF0aXZlSG9zdE1haW5TZXJ2aWNlKTtcblx0XHRjb25zdCBkaWFsb2dNYWluU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nTWFpblNlcnZpY2UpO1xuXG5cdFx0Ly8gSW5zdGFsbCBVUkwgaGFuZGxlcnMgdGhhdCBkZWFsIHdpdGggcHJvdG9jbCBVUkxzIGVpdGhlclxuXHRcdC8vIGZyb20gdGhpcyBwcm9jZXNzIGJ5IG9wZW5pbmcgd2luZG93cyBhbmQvb3IgYnkgZm9yd2FyZGluZ1xuXHRcdC8vIHRoZSBVUkxzIGludG8gYSB3aW5kb3cgcHJvY2VzcyB0byBiZSBoYW5kbGVkIHRoZXJlLlxuXG5cdFx0Y29uc3QgYXBwID0gdGhpcztcblx0XHR1cmxTZXJ2aWNlLnJlZ2lzdGVySGFuZGxlcih7XG5cdFx0XHRhc3luYyBoYW5kbGVVUkwodXJpOiBVUkksIG9wdGlvbnM/OiBJT3BlblVSTE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRcdFx0cmV0dXJuIGFwcC5oYW5kbGVQcm90b2NvbFVybCh3aW5kb3dzTWFpblNlcnZpY2UsIGRpYWxvZ01haW5TZXJ2aWNlLCB1cmxTZXJ2aWNlLCB1cmksIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYWN0aXZlV2luZG93TWFuYWdlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3RpdmVXaW5kb3dNYW5hZ2VyKHtcblx0XHRcdG9uRGlkT3Blbk1haW5XaW5kb3c6IG5hdGl2ZUhvc3RNYWluU2VydmljZS5vbkRpZE9wZW5NYWluV2luZG93LFxuXHRcdFx0b25EaWRGb2N1c01haW5XaW5kb3c6IG5hdGl2ZUhvc3RNYWluU2VydmljZS5vbkRpZEZvY3VzTWFpbldpbmRvdyxcblx0XHRcdGdldEFjdGl2ZVdpbmRvd0lkOiAoKSA9PiBuYXRpdmVIb3N0TWFpblNlcnZpY2UuZ2V0QWN0aXZlV2luZG93SWQoLTEpXG5cdFx0fSkpO1xuXHRcdGNvbnN0IGFjdGl2ZVdpbmRvd1JvdXRlciA9IG5ldyBTdGF0aWNSb3V0ZXIoY3R4ID0+IGFjdGl2ZVdpbmRvd01hbmFnZXIuZ2V0QWN0aXZlQ2xpZW50SWQoKS50aGVuKGlkID0+IGN0eCA9PT0gaWQpKTtcblx0XHRjb25zdCB1cmxIYW5kbGVyUm91dGVyID0gbmV3IFVSTEhhbmRsZXJSb3V0ZXIoYWN0aXZlV2luZG93Um91dGVyLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHVybEhhbmRsZXJDaGFubmVsID0gbWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5nZXRDaGFubmVsKCd1cmxIYW5kbGVyJywgdXJsSGFuZGxlclJvdXRlcik7XG5cdFx0dXJsU2VydmljZS5yZWdpc3RlckhhbmRsZXIobmV3IFVSTEhhbmRsZXJDaGFubmVsQ2xpZW50KHVybEhhbmRsZXJDaGFubmVsKSk7XG5cblx0XHRjb25zdCBpbml0aWFsUHJvdG9jb2xVcmxzID0gYXdhaXQgdGhpcy5yZXNvbHZlSW5pdGlhbFByb3RvY29sVXJscyh3aW5kb3dzTWFpblNlcnZpY2UsIGRpYWxvZ01haW5TZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihuZXcgRWxlY3Ryb25VUkxMaXN0ZW5lcihpbml0aWFsUHJvdG9jb2xVcmxzPy51cmxzLCB1cmxTZXJ2aWNlLCB3aW5kb3dzTWFpblNlcnZpY2UsIHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZSwgdGhpcy5wcm9kdWN0U2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlKSk7XG5cblx0XHRyZXR1cm4gaW5pdGlhbFByb3RvY29sVXJscztcblx0fVxuXG5cdHByaXZhdGUgc2V0dXBNYW5hZ2VkUmVtb3RlUmVzb3VyY2VVcmxIYW5kbGVyKG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXI6IEVsZWN0cm9uSVBDU2VydmVyKSB7XG5cdFx0Y29uc3Qgbm90Rm91bmQgPSAoKTogRWxlY3Ryb24uUHJvdG9jb2xSZXNwb25zZSA9PiAoeyBzdGF0dXNDb2RlOiA0MDQsIGRhdGE6ICdOb3QgZm91bmQnIH0pO1xuXHRcdGNvbnN0IHJlbW90ZVJlc291cmNlQ2hhbm5lbCA9IG5ldyBMYXp5KCgpID0+IG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIuZ2V0Q2hhbm5lbChcblx0XHRcdE5PREVfUkVNT1RFX1JFU09VUkNFX0NIQU5ORUxfTkFNRSxcblx0XHRcdG5ldyBOb2RlUmVtb3RlUmVzb3VyY2VSb3V0ZXIoKSxcblx0XHQpKTtcblxuXHRcdHByb3RvY29sLnJlZ2lzdGVyQnVmZmVyUHJvdG9jb2woU2NoZW1hcy52c2NvZGVNYW5hZ2VkUmVtb3RlUmVzb3VyY2UsIChyZXF1ZXN0LCBjYWxsYmFjaykgPT4ge1xuXHRcdFx0Y29uc3QgdXJsID0gVVJJLnBhcnNlKHJlcXVlc3QudXJsKTtcblx0XHRcdGlmICghdXJsLmF1dGhvcml0eS5zdGFydHNXaXRoKCd3aW5kb3c6JykpIHtcblx0XHRcdFx0cmV0dXJuIGNhbGxiYWNrKG5vdEZvdW5kKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZW1vdGVSZXNvdXJjZUNoYW5uZWwudmFsdWUuY2FsbDxOb2RlUmVtb3RlUmVzb3VyY2VSZXNwb25zZT4oTk9ERV9SRU1PVEVfUkVTT1VSQ0VfSVBDX01FVEhPRF9OQU1FLCBbdXJsXSkudGhlbihcblx0XHRcdFx0ciA9PiBjYWxsYmFjayh7IC4uLnIsIGRhdGE6IEJ1ZmZlci5mcm9tKHIuYm9keSwgJ2Jhc2U2NCcpIH0pLFxuXHRcdFx0XHRlcnIgPT4ge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdlcnJvciBkaXNwYXRjaGluZyByZW1vdGUgcmVzb3VyY2UgY2FsbCcsIGVycik7XG5cdFx0XHRcdFx0Y2FsbGJhY2soeyBzdGF0dXNDb2RlOiA1MDAsIGRhdGE6IFN0cmluZyhlcnIpIH0pO1xuXHRcdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUluaXRpYWxQcm90b2NvbFVybHMod2luZG93c01haW5TZXJ2aWNlOiBJV2luZG93c01haW5TZXJ2aWNlLCBkaWFsb2dNYWluU2VydmljZTogSURpYWxvZ01haW5TZXJ2aWNlKTogUHJvbWlzZTxJSW5pdGlhbFByb3RvY29sVXJscyB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0LyoqXG5cdFx0ICogUHJvdG9jb2wgVVJMIGhhbmRsaW5nIG9uIHN0YXJ0dXAgaXMgY29tcGxleCwgcmVmZXIgdG9cblx0XHQgKiB7QGxpbmsgSUluaXRpYWxQcm90b2NvbFVybHN9IGZvciBhbiBleHBsYWluZXIuXG5cdFx0ICovXG5cblx0XHQvLyBXaW5kb3dzL0xpbnV4OiBwcm90b2NvbCBoYW5kbGVyIGludm9rZXMgQ0xJIHdpdGggLS1vcGVuLXVybFxuXHRcdGNvbnN0IHByb3RvY29sVXJsc0Zyb21Db21tYW5kTGluZSA9IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzWydvcGVuLXVybCddID8gdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFyZ3MuX3VybHMgfHwgW10gOiBbXTtcblx0XHRpZiAocHJvdG9jb2xVcmxzRnJvbUNvbW1hbmRMaW5lLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnYXBwI3Jlc29sdmVJbml0aWFsUHJvdG9jb2xVcmxzKCkgcHJvdG9jb2wgdXJscyBmcm9tIGNvbW1hbmQgbGluZTonLCBwcm90b2NvbFVybHNGcm9tQ29tbWFuZExpbmUpO1xuXHRcdH1cblxuXHRcdC8vIG1hY09TOiBvcGVuLXVybCBldmVudHMgdGhhdCB3ZXJlIHJlY2VpdmVkIGJlZm9yZSB0aGUgYXBwIGlzIHJlYWR5XG5cdFx0Y29uc3QgcHJvdG9jb2xVcmxzRnJvbUV2ZW50ID0gKChnbG9iYWwgYXMgeyBnZXRPcGVuVXJscz86ICgpID0+IHN0cmluZ1tdIH0pLmdldE9wZW5VcmxzPy4oKSB8fCBbXSk7XG5cdFx0aWYgKHByb3RvY29sVXJsc0Zyb21FdmVudC5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYGFwcCNyZXNvbHZlSW5pdGlhbFByb3RvY29sVXJscygpIHByb3RvY29sIHVybHMgZnJvbSBtYWNPUyAnb3Blbi11cmwnIGV2ZW50OmAsIHByb3RvY29sVXJsc0Zyb21FdmVudCk7XG5cdFx0fVxuXG5cdFx0aWYgKHByb3RvY29sVXJsc0Zyb21Db21tYW5kTGluZS5sZW5ndGggKyBwcm90b2NvbFVybHNGcm9tRXZlbnQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3RvY29sVXJscyA9IFtcblx0XHRcdC4uLnByb3RvY29sVXJsc0Zyb21Db21tYW5kTGluZSxcblx0XHRcdC4uLnByb3RvY29sVXJsc0Zyb21FdmVudFxuXHRcdF0ubWFwKHVybCA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4geyB1cmk6IFVSSS5wYXJzZSh1cmwpLCBvcmlnaW5hbFVybDogdXJsIH07XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdhcHAjcmVzb2x2ZUluaXRpYWxQcm90b2NvbFVybHMoKSBwcm90b2NvbCB1cmwgZmFpbGVkIHRvIHBhcnNlOicsIHVybCk7XG5cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IG9wZW5hYmxlczogSVdpbmRvd09wZW5hYmxlW10gPSBbXTtcblx0XHRjb25zdCB1cmxzOiBJUHJvdG9jb2xVcmxbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBwcm90b2NvbFVybCBvZiBwcm90b2NvbFVybHMpIHtcblx0XHRcdGlmICghcHJvdG9jb2xVcmwpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIGludmFsaWRcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgd2luZG93T3BlbmFibGUgPSB0aGlzLmdldFdpbmRvd09wZW5hYmxlRnJvbVByb3RvY29sVXJsKHByb3RvY29sVXJsLnVyaSk7XG5cdFx0XHRpZiAod2luZG93T3BlbmFibGUpIHtcblx0XHRcdFx0aWYgKGF3YWl0IHRoaXMuc2hvdWxkQmxvY2tPcGVuYWJsZSh3aW5kb3dPcGVuYWJsZSwgd2luZG93c01haW5TZXJ2aWNlLCBkaWFsb2dNYWluU2VydmljZSkpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ2FwcCNyZXNvbHZlSW5pdGlhbFByb3RvY29sVXJscygpIHByb3RvY29sIHVybCB3YXMgYmxvY2tlZDonLCBwcm90b2NvbFVybC51cmkudG9TdHJpbmcodHJ1ZSkpO1xuXG5cdFx0XHRcdFx0Y29udGludWU7IC8vIGJsb2NrZWRcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ2FwcCNyZXNvbHZlSW5pdGlhbFByb3RvY29sVXJscygpIHByb3RvY29sIHVybCB3aWxsIGJlIGhhbmRsZWQgYXMgd2luZG93IHRvIG9wZW46JywgcHJvdG9jb2xVcmwudXJpLnRvU3RyaW5nKHRydWUpLCB3aW5kb3dPcGVuYWJsZSk7XG5cblx0XHRcdFx0XHRvcGVuYWJsZXMucHVzaCh3aW5kb3dPcGVuYWJsZSk7IC8vIGhhbmRsZWQgYXMgd2luZG93IHRvIG9wZW5cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdhcHAjcmVzb2x2ZUluaXRpYWxQcm90b2NvbFVybHMoKSBwcm90b2NvbCB1cmwgd2lsbCBiZSBwYXNzZWQgdG8gYWN0aXZlIHdpbmRvdyBmb3IgaGFuZGxpbmc6JywgcHJvdG9jb2xVcmwudXJpLnRvU3RyaW5nKHRydWUpKTtcblxuXHRcdFx0XHR1cmxzLnB1c2gocHJvdG9jb2xVcmwpOyAvLyBoYW5kbGVkIHdpdGhpbiBhY3RpdmUgd2luZG93XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgdXJscywgb3BlbmFibGVzIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNob3VsZEJsb2NrT3BlbmFibGUob3BlbmFibGU6IElXaW5kb3dPcGVuYWJsZSwgd2luZG93c01haW5TZXJ2aWNlOiBJV2luZG93c01haW5TZXJ2aWNlLCBkaWFsb2dNYWluU2VydmljZTogSURpYWxvZ01haW5TZXJ2aWNlKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0bGV0IG9wZW5hYmxlVXJpOiBVUkk7XG5cdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblx0XHRpZiAoaXNXb3Jrc3BhY2VUb09wZW4ob3BlbmFibGUpKSB7XG5cdFx0XHRvcGVuYWJsZVVyaSA9IG9wZW5hYmxlLndvcmtzcGFjZVVyaTtcblx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnY29uZmlybU9wZW5NZXNzYWdlV29ya3NwYWNlJywgXCJBbiBleHRlcm5hbCBhcHBsaWNhdGlvbiB3YW50cyB0byBvcGVuICd7MH0nIGluIHsxfS4gRG8geW91IHdhbnQgdG8gb3BlbiB0aGlzIHdvcmtzcGFjZSBmaWxlP1wiLCBvcGVuYWJsZVVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSA/IGdldFBhdGhMYWJlbChvcGVuYWJsZVVyaSwgeyBvczogT1MsIHRpbGRpZnk6IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZSB9KSA6IG9wZW5hYmxlVXJpLnRvU3RyaW5nKHRydWUpLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCk7XG5cdFx0fSBlbHNlIGlmIChpc0ZvbGRlclRvT3BlbihvcGVuYWJsZSkpIHtcblx0XHRcdG9wZW5hYmxlVXJpID0gb3BlbmFibGUuZm9sZGVyVXJpO1xuXHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdjb25maXJtT3Blbk1lc3NhZ2VGb2xkZXInLCBcIkFuIGV4dGVybmFsIGFwcGxpY2F0aW9uIHdhbnRzIHRvIG9wZW4gJ3swfScgaW4gezF9LiBEbyB5b3Ugd2FudCB0byBvcGVuIHRoaXMgZm9sZGVyP1wiLCBvcGVuYWJsZVVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSA/IGdldFBhdGhMYWJlbChvcGVuYWJsZVVyaSwgeyBvczogT1MsIHRpbGRpZnk6IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZSB9KSA6IG9wZW5hYmxlVXJpLnRvU3RyaW5nKHRydWUpLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG9wZW5hYmxlVXJpID0gb3BlbmFibGUuZmlsZVVyaTtcblx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnY29uZmlybU9wZW5NZXNzYWdlRmlsZU9yRm9sZGVyJywgXCJBbiBleHRlcm5hbCBhcHBsaWNhdGlvbiB3YW50cyB0byBvcGVuICd7MH0nIGluIHsxfS4gRG8geW91IHdhbnQgdG8gb3BlbiB0aGlzIGZpbGUgb3IgZm9sZGVyP1wiLCBvcGVuYWJsZVVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSA/IGdldFBhdGhMYWJlbChvcGVuYWJsZVVyaSwgeyBvczogT1MsIHRpbGRpZnk6IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZSB9KSA6IG9wZW5hYmxlVXJpLnRvU3RyaW5nKHRydWUpLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wZW5hYmxlVXJpLnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlICYmIG9wZW5hYmxlVXJpLnNjaGVtZSAhPT0gU2NoZW1hcy52c2NvZGVSZW1vdGUpIHtcblxuXHRcdFx0Ly8gISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhIVxuXHRcdFx0Ly9cblx0XHRcdC8vIE5PVEU6IHdlIGN1cnJlbnRseSBvbmx5IGFzayBmb3IgY29uZmlybWF0aW9uIGZvciBgZmlsZWAgYW5kIGB2c2NvZGUtcmVtb3RlYFxuXHRcdFx0Ly8gYXV0aG9yaXRpZXMgaGVyZS4gVGhlcmUgaXMgYW4gYWRkaXRpb25hbCBjb25maXJtYXRpb24gZm9yIGBleHRlbnNpb24uaWRgXG5cdFx0XHQvLyBhdXRob3JpdGllcyBmcm9tIHdpdGhpbiB0aGUgd2luZG93LlxuXHRcdFx0Ly9cblx0XHRcdC8vIElGIFlPVSBBUkUgUExBTk5JTkcgT04gQURESU5HIEFOT1RIRVIgQVVUSE9SSVRZIEhFUkUsIE1BS0UgU1VSRSBUTyBBTFNPXG5cdFx0XHQvLyBBREQgSVQgVE8gVEhFIENPTkZJUk1BVElPTiBDT0RFIEJFTE9XIE9SIElOU0lERSBUSEUgV0lORE9XIVxuXHRcdFx0Ly9cblx0XHRcdC8vICEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISFcblxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFza0ZvckNvbmZpcm1hdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8dW5rbm93bj4oQ29kZUFwcGxpY2F0aW9uLlNFQ1VSSVRZX1BST1RPQ09MX0hBTkRMSU5HX0NPTkZJUk1BVElPTl9TRVRUSU5HX0tFWVtvcGVuYWJsZVVyaS5zY2hlbWVdKTtcblx0XHRpZiAoYXNrRm9yQ29uZmlybWF0aW9uID09PSBmYWxzZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBub3QgYmxvY2tlZCB2aWEgc2V0dGluZ3Ncblx0XHR9XG5cblx0XHRjb25zdCB7IHJlc3BvbnNlLCBjaGVja2JveENoZWNrZWQgfSA9IGF3YWl0IGRpYWxvZ01haW5TZXJ2aWNlLnNob3dNZXNzYWdlQm94KHtcblx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoeyBrZXk6ICdvcGVuJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmWWVzXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSh7IGtleTogJ2NhbmNlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk5vXCIpXG5cdFx0XHRdLFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2NvbmZpcm1PcGVuRGV0YWlsJywgXCJJZiB5b3UgZGlkIG5vdCBpbml0aWF0ZSB0aGlzIHJlcXVlc3QsIGl0IG1heSByZXByZXNlbnQgYW4gYXR0ZW1wdGVkIGF0dGFjayBvbiB5b3VyIHN5c3RlbS4gVW5sZXNzIHlvdSB0b29rIGFuIGV4cGxpY2l0IGFjdGlvbiB0byBpbml0aWF0ZSB0aGlzIHJlcXVlc3QsIHlvdSBzaG91bGQgcHJlc3MgJ05vJ1wiKSxcblx0XHRcdGNoZWNrYm94TGFiZWw6IG9wZW5hYmxlVXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlID8gbG9jYWxpemUoJ2RvTm90QXNrQWdhaW5Mb2NhbCcsIFwiQWxsb3cgb3BlbmluZyBsb2NhbCBwYXRocyB3aXRob3V0IGFza2luZ1wiKSA6IGxvY2FsaXplKCdkb05vdEFza0FnYWluUmVtb3RlJywgXCJBbGxvdyBvcGVuaW5nIHJlbW90ZSBwYXRocyB3aXRob3V0IGFza2luZ1wiKSxcblx0XHRcdGNhbmNlbElkOiAxXG5cdFx0fSk7XG5cblx0XHRpZiAocmVzcG9uc2UgIT09IDApIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyBibG9ja2VkIGJ5IHVzZXIgY2hvaWNlXG5cdFx0fVxuXG5cdFx0aWYgKGNoZWNrYm94Q2hlY2tlZCkge1xuXHRcdFx0Ly8gRHVlIHRvIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xOTU0MzYsIHdlIGNhbiBvbmx5XG5cdFx0XHQvLyB1cGRhdGUgc2V0dGluZ3MgZnJvbSB3aXRoaW4gYSB3aW5kb3cuIEJ1dCB3ZSBkbyBub3Qga25vdyBpZiBhIHdpbmRvd1xuXHRcdFx0Ly8gaXMgYWJvdXQgdG8gb3BlbiBvciBjYW4gYWxyZWFkeSBoYW5kbGUgdGhlIHJlcXVlc3QsIHNvIHdlIGhhdmUgdG8gc2VuZFxuXHRcdFx0Ly8gdG8gYW55IGN1cnJlbnQgd2luZG93IGFuZCBhbnkgbmV3bHkgb3BlbmluZyB3aW5kb3cuXG5cdFx0XHRjb25zdCByZXF1ZXN0ID0geyBjaGFubmVsOiAndnNjb2RlOmRpc2FibGVQcm9tcHRGb3JQcm90b2NvbEhhbmRsaW5nJywgYXJnczogb3BlbmFibGVVcmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgPyAnbG9jYWwnIDogJ3JlbW90ZScgfTtcblx0XHRcdHdpbmRvd3NNYWluU2VydmljZS5zZW5kVG9Gb2N1c2VkKHJlcXVlc3QuY2hhbm5lbCwgcmVxdWVzdC5hcmdzKTtcblx0XHRcdHdpbmRvd3NNYWluU2VydmljZS5zZW5kVG9PcGVuaW5nV2luZG93KHJlcXVlc3QuY2hhbm5lbCwgcmVxdWVzdC5hcmdzKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7IC8vIG5vdCBibG9ja2VkIGJ5IHVzZXIgY2hvaWNlXG5cdH1cblxuXHRwcml2YXRlIGdldFdpbmRvd09wZW5hYmxlRnJvbVByb3RvY29sVXJsKHVyaTogVVJJKTogSVdpbmRvd09wZW5hYmxlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXVyaS5wYXRoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIEZpbGUgcGF0aFxuXHRcdGlmICh1cmkuYXV0aG9yaXR5ID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdGNvbnN0IGZpbGVVcmkgPSBVUkkuZmlsZSh1cmkuZnNQYXRoKTtcblxuXHRcdFx0aWYgKGhhc1dvcmtzcGFjZUZpbGVFeHRlbnNpb24oZmlsZVVyaSkpIHtcblx0XHRcdFx0cmV0dXJuIHsgd29ya3NwYWNlVXJpOiBmaWxlVXJpIH07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IGZpbGVVcmkgfTtcblx0XHR9XG5cblx0XHQvLyBSZW1vdGUgcGF0aFxuXHRcdGVsc2UgaWYgKHVyaS5hdXRob3JpdHkgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlKSB7XG5cblx0XHRcdC8vIEV4YW1wbGUgY29udmVyc2lvbjpcblx0XHRcdC8vIEZyb206IHZzY29kZTovL3ZzY29kZS1yZW1vdGUvd3NsK3VidW50dS9tbnQvYy9HaXREZXZlbG9wbWVudC9tb25hY29cblx0XHRcdC8vICAgVG86IHZzY29kZS1yZW1vdGU6Ly93c2wrdWJ1bnR1L21udC9jL0dpdERldmVsb3BtZW50L21vbmFjb1xuXG5cdFx0XHRjb25zdCBzZWNvbmRTbGFzaCA9IHVyaS5wYXRoLmluZGV4T2YocG9zaXguc2VwLCAxIC8qIHNraXAgb3ZlciB0aGUgbGVhZGluZyBzbGFzaCAqLyk7XG5cdFx0XHRsZXQgYXV0aG9yaXR5OiBzdHJpbmc7XG5cdFx0XHRsZXQgcGF0aDogc3RyaW5nO1xuXHRcdFx0aWYgKHNlY29uZFNsYXNoICE9PSAtMSkge1xuXHRcdFx0XHRhdXRob3JpdHkgPSB1cmkucGF0aC5zdWJzdHJpbmcoMSwgc2Vjb25kU2xhc2gpO1xuXHRcdFx0XHRwYXRoID0gdXJpLnBhdGguc3Vic3RyaW5nKHNlY29uZFNsYXNoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF1dGhvcml0eSA9IHVyaS5wYXRoLnN1YnN0cmluZygxKTtcblx0XHRcdFx0cGF0aCA9ICcvJztcblx0XHRcdH1cblxuXHRcdFx0bGV0IHF1ZXJ5ID0gdXJpLnF1ZXJ5O1xuXHRcdFx0Y29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh1cmkucXVlcnkpO1xuXHRcdFx0aWYgKHBhcmFtcy5nZXQoJ3dpbmRvd0lkJykgPT09ICdfYmxhbmsnKSB7XG5cdFx0XHRcdC8vIE1ha2Ugc3VyZSB0byB1bnNldCBhbnkgYHdpbmRvd0lkPV9ibGFua2AgaGVyZVxuXHRcdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTkxOTAyXG5cdFx0XHRcdHBhcmFtcy5kZWxldGUoJ3dpbmRvd0lkJyk7XG5cdFx0XHRcdHF1ZXJ5ID0gcGFyYW1zLnRvU3RyaW5nKCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlbW90ZVVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZVJlbW90ZSwgYXV0aG9yaXR5LCBwYXRoLCBxdWVyeSwgZnJhZ21lbnQ6IHVyaS5mcmFnbWVudCB9KTtcblxuXHRcdFx0aWYgKGhhc1dvcmtzcGFjZUZpbGVFeHRlbnNpb24ocGF0aCkpIHtcblx0XHRcdFx0cmV0dXJuIHsgd29ya3NwYWNlVXJpOiByZW1vdGVVcmkgfTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKC86W1xcZF0rJC8udGVzdChwYXRoKSkge1xuXHRcdFx0XHQvLyBwYXRoIHdpdGggOmxpbmU6Y29sdW1uIHN5bnRheFxuXHRcdFx0XHRyZXR1cm4geyBmaWxlVXJpOiByZW1vdGVVcmkgfTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHsgZm9sZGVyVXJpOiByZW1vdGVVcmkgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlUHJvdG9jb2xVcmwod2luZG93c01haW5TZXJ2aWNlOiBJV2luZG93c01haW5TZXJ2aWNlLCBkaWFsb2dNYWluU2VydmljZTogSURpYWxvZ01haW5TZXJ2aWNlLCB1cmxTZXJ2aWNlOiBJVVJMU2VydmljZSwgdXJpOiBVUkksIG9wdGlvbnM/OiBJT3BlblVSTE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ2FwcCNoYW5kbGVQcm90b2NvbFVybCgpOicsIHVyaS50b1N0cmluZyh0cnVlKSwgb3B0aW9ucyk7XG5cblx0XHQvLyBTdXBwb3J0ICd3b3Jrc3BhY2UnIFVSTHMgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMjQyNjMpXG5cdFx0aWYgKHVyaS5zY2hlbWUgPT09IHRoaXMucHJvZHVjdFNlcnZpY2UudXJsUHJvdG9jb2wgJiYgdXJpLnBhdGggPT09ICd3b3Jrc3BhY2UnKSB7XG5cdFx0XHR1cmkgPSB1cmkud2l0aCh7XG5cdFx0XHRcdGF1dGhvcml0eTogU2NoZW1hcy5maWxlLFxuXHRcdFx0XHRwYXRoOiBVUkkucGFyc2UodXJpLnF1ZXJ5KS5wYXRoLFxuXHRcdFx0XHRxdWVyeTogJydcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGxldCBzaG91bGRPcGVuSW5OZXdXaW5kb3cgPSBmYWxzZTtcblxuXHRcdC8vIFdlIHNob3VsZCBoYW5kbGUgdGhlIFVSSSBpbiBhIG5ldyB3aW5kb3cgaWYgdGhlIFVSTCBjb250YWlucyBgd2luZG93SWQ9X2JsYW5rYFxuXHRcdGNvbnN0IHBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXModXJpLnF1ZXJ5KTtcblx0XHRpZiAocGFyYW1zLmdldCgnd2luZG93SWQnKSA9PT0gJ19ibGFuaycpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgYXBwI2hhbmRsZVByb3RvY29sVXJsKCkgZm91bmQgJ3dpbmRvd0lkPV9ibGFuaycgYXMgcGFyYW1ldGVyLCBzZXR0aW5nIHNob3VsZE9wZW5Jbk5ld1dpbmRvdz10cnVlOmAsIHVyaS50b1N0cmluZyh0cnVlKSk7XG5cblx0XHRcdHBhcmFtcy5kZWxldGUoJ3dpbmRvd0lkJyk7XG5cdFx0XHR1cmkgPSB1cmkud2l0aCh7IHF1ZXJ5OiBwYXJhbXMudG9TdHJpbmcoKSB9KTtcblxuXHRcdFx0c2hvdWxkT3BlbkluTmV3V2luZG93ID0gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBvciBpZiBubyB3aW5kb3cgaXMgb3BlbiAobWFjT1Mgb25seSlcblx0XHRlbHNlIGlmIChpc01hY2ludG9zaCAmJiB3aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93Q291bnQoKSA9PT0gMCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBhcHAjaGFuZGxlUHJvdG9jb2xVcmwoKSBydW5uaW5nIG9uIG1hY09TIHdpdGggbm8gd2luZG93IG9wZW4sIHNldHRpbmcgc2hvdWxkT3BlbkluTmV3V2luZG93PXRydWU6YCwgdXJpLnRvU3RyaW5nKHRydWUpKTtcblxuXHRcdFx0c2hvdWxkT3BlbkluTmV3V2luZG93ID0gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBQYXNzIGFsb25nIHdoZXRoZXIgdGhlIGFwcGxpY2F0aW9uIGlzIGJlaW5nIG9wZW5lZCB2aWEgYSBDb250aW51ZSBPbiBmbG93XG5cdFx0Y29uc3QgY29udGludWVPbiA9IHBhcmFtcy5nZXQoJ2NvbnRpbnVlT24nKTtcblx0XHRpZiAoY29udGludWVPbiAhPT0gbnVsbCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBhcHAjaGFuZGxlUHJvdG9jb2xVcmwoKSBmb3VuZCAnY29udGludWVPbicgYXMgcGFyYW1ldGVyOmAsIHVyaS50b1N0cmluZyh0cnVlKSk7XG5cblx0XHRcdHBhcmFtcy5kZWxldGUoJ2NvbnRpbnVlT24nKTtcblx0XHRcdHVyaSA9IHVyaS53aXRoKHsgcXVlcnk6IHBhcmFtcy50b1N0cmluZygpIH0pO1xuXG5cdFx0XHR0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuY29udGludWVPbiA9IGNvbnRpbnVlT24gPz8gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIEV4dHJhY3Qgc2Vzc2lvbiBwYXJhbWV0ZXIgdG8gb3BlbiBhIHNwZWNpZmljIGNoYXQgc2Vzc2lvbiBpbiB0aGUgdGFyZ2V0IHdpbmRvd1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwYXJhbXMuZ2V0KCdzZXNzaW9uJyk7XG5cdFx0aWYgKHNlc3Npb24gIT09IG51bGwpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgYXBwI2hhbmRsZVByb3RvY29sVXJsKCkgZm91bmQgJ3Nlc3Npb24nIGFzIHBhcmFtZXRlcjpgLCB1cmkudG9TdHJpbmcodHJ1ZSkpO1xuXG5cdFx0XHRwYXJhbXMuZGVsZXRlKCdzZXNzaW9uJyk7XG5cdFx0XHR1cmkgPSB1cmkud2l0aCh7IHF1ZXJ5OiBwYXJhbXMudG9TdHJpbmcoKSB9KTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiB0aGUgcHJvdG9jb2wgVVJMIGlzIGEgd2luZG93IG9wZW5hYmxlIHRvIG9wZW4uLi5cblx0XHRjb25zdCB3aW5kb3dPcGVuYWJsZUZyb21Qcm90b2NvbFVybCA9IHRoaXMuZ2V0V2luZG93T3BlbmFibGVGcm9tUHJvdG9jb2xVcmwodXJpKTtcblx0XHRpZiAod2luZG93T3BlbmFibGVGcm9tUHJvdG9jb2xVcmwpIHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLnNob3VsZEJsb2NrT3BlbmFibGUod2luZG93T3BlbmFibGVGcm9tUHJvdG9jb2xVcmwsIHdpbmRvd3NNYWluU2VydmljZSwgZGlhbG9nTWFpblNlcnZpY2UpKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnYXBwI2hhbmRsZVByb3RvY29sVXJsKCkgcHJvdG9jb2wgdXJsIHdhcyBibG9ja2VkOicsIHVyaS50b1N0cmluZyh0cnVlKSk7XG5cblx0XHRcdFx0cmV0dXJuIHRydWU7IC8vIElmIG9wZW5hYmxlIHNob3VsZCBiZSBibG9ja2VkLCBiZWhhdmUgYXMgaWYgaXQncyBoYW5kbGVkXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ2FwcCNoYW5kbGVQcm90b2NvbFVybCgpIG9wZW5pbmcgcHJvdG9jb2wgdXJsIGFzIHdpbmRvdzonLCB3aW5kb3dPcGVuYWJsZUZyb21Qcm90b2NvbFVybCwgdXJpLnRvU3RyaW5nKHRydWUpKTtcblxuXHRcdFx0XHRjb25zdCB3aW5kb3cgPSAoYXdhaXQgd2luZG93c01haW5TZXJ2aWNlLm9wZW4oe1xuXHRcdFx0XHRcdGNvbnRleHQ6IE9wZW5Db250ZXh0LkxJTkssXG5cdFx0XHRcdFx0Y2xpOiB7IC4uLnRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzIH0sXG5cdFx0XHRcdFx0dXJpc1RvT3BlbjogW3dpbmRvd09wZW5hYmxlRnJvbVByb3RvY29sVXJsXSxcblx0XHRcdFx0XHRmb3JjZU5ld1dpbmRvdzogc2hvdWxkT3BlbkluTmV3V2luZG93LFxuXHRcdFx0XHRcdGdvdG9MaW5lTW9kZTogdHJ1ZVxuXHRcdFx0XHRcdC8vIHJlbW90ZUF1dGhvcml0eTogd2lsbCBiZSBkZXRlcm1pbmVkIGJhc2VkIG9uIHdpbmRvd09wZW5hYmxlRnJvbVByb3RvY29sVXJsXG5cdFx0XHRcdH0pKS5hdCgwKTtcblxuXHRcdFx0XHR3aW5kb3c/LmZvY3VzKCk7IC8vIHRoaXMgc2hvdWxkIGhlbHAgZW5zdXJpbmcgdGhhdCB0aGUgcmlnaHQgd2luZG93IGdldHMgZm9jdXMgd2hlbiBtdWx0aXBsZSBhcmUgb3BlbmVkXG5cblx0XHRcdFx0Ly8gT3BlbiBjaGF0IHNlc3Npb24gaW4gdGhlIHRhcmdldCB3aW5kb3cgaWYgcmVxdWVzdGVkXG5cdFx0XHRcdGlmICh3aW5kb3cgJiYgc2Vzc2lvbikge1xuXHRcdFx0XHRcdHdpbmRvdy5zZW5kV2hlblJlYWR5KCd2c2NvZGU6b3BlbkNoYXRTZXNzaW9uJywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgc2Vzc2lvbik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyAuLi5vciBpZiB3ZSBzaG91bGQgb3BlbiBpbiBhIG5ldyB3aW5kb3cgYW5kIHRoZW4gaGFuZGxlIGl0IHdpdGhpbiB0aGF0IHdpbmRvd1xuXHRcdGlmIChzaG91bGRPcGVuSW5OZXdXaW5kb3cpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnYXBwI2hhbmRsZVByb3RvY29sVXJsKCkgb3BlbmluZyBlbXB0eSB3aW5kb3cgYW5kIHBhc3NpbmcgaW4gcHJvdG9jb2wgdXJsOicsIHVyaS50b1N0cmluZyh0cnVlKSk7XG5cblx0XHRcdGNvbnN0IHdpbmRvdyA9IChhd2FpdCB3aW5kb3dzTWFpblNlcnZpY2Uub3Blbih7XG5cdFx0XHRcdGNvbnRleHQ6IE9wZW5Db250ZXh0LkxJTkssXG5cdFx0XHRcdGNsaTogeyAuLi50aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXJncyB9LFxuXHRcdFx0XHRmb3JjZU5ld1dpbmRvdzogdHJ1ZSxcblx0XHRcdFx0Zm9yY2VFbXB0eTogdHJ1ZSxcblx0XHRcdFx0Z290b0xpbmVNb2RlOiB0cnVlLFxuXHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IGdldFJlbW90ZUF1dGhvcml0eSh1cmkpXG5cdFx0XHR9KSkuYXQoMCk7XG5cblx0XHRcdGF3YWl0IHdpbmRvdz8ucmVhZHkoKTtcblxuXHRcdFx0cmV0dXJuIHVybFNlcnZpY2Uub3Blbih1cmksIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnYXBwI2hhbmRsZVByb3RvY29sVXJsKCk6IG5vdCBoYW5kbGVkJywgdXJpLnRvU3RyaW5nKHRydWUpLCBvcHRpb25zKTtcblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgc2V0dXBTaGFyZWRQcm9jZXNzKG1hY2hpbmVJZDogc3RyaW5nLCBzcW1JZDogc3RyaW5nLCBkZXZEZXZpY2VJZDogc3RyaW5nKTogeyBzaGFyZWRQcm9jZXNzUmVhZHk6IFByb21pc2U8TWVzc2FnZVBvcnRDbGllbnQ+OyBzaGFyZWRQcm9jZXNzQ2xpZW50OiBQcm9taXNlPE1lc3NhZ2VQb3J0Q2xpZW50PiB9IHtcblx0XHRjb25zdCBzaGFyZWRQcm9jZXNzID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5tYWluSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2hhcmVkUHJvY2VzcywgbWFjaGluZUlkLCBzcW1JZCwgZGV2RGV2aWNlSWQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHNoYXJlZFByb2Nlc3Mub25EaWRDcmFzaCgoKSA9PiB0aGlzLndpbmRvd3NNYWluU2VydmljZT8uc2VuZFRvRm9jdXNlZCgndnNjb2RlOnJlcG9ydFNoYXJlZFByb2Nlc3NDcmFzaCcpKSk7XG5cblx0XHRjb25zdCBzaGFyZWRQcm9jZXNzQ2xpZW50ID0gKGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnTWFpbi0+U2hhcmVkUHJvY2VzcyNjb25uZWN0Jyk7XG5cblx0XHRcdGNvbnN0IHBvcnQgPSBhd2FpdCBzaGFyZWRQcm9jZXNzLmNvbm5lY3QoKTtcblxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdNYWluLT5TaGFyZWRQcm9jZXNzI2Nvbm5lY3Q6IGNvbm5lY3Rpb24gZXN0YWJsaXNoZWQnKTtcblxuXHRcdFx0cmV0dXJuIG5ldyBNZXNzYWdlUG9ydENsaWVudChwb3J0LCAnbWFpbicpO1xuXHRcdH0pKCk7XG5cblx0XHRjb25zdCBzaGFyZWRQcm9jZXNzUmVhZHkgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgc2hhcmVkUHJvY2Vzcy53aGVuUmVhZHkoKTtcblxuXHRcdFx0cmV0dXJuIHNoYXJlZFByb2Nlc3NDbGllbnQ7XG5cdFx0fSkoKTtcblxuXHRcdHJldHVybiB7IHNoYXJlZFByb2Nlc3NSZWFkeSwgc2hhcmVkUHJvY2Vzc0NsaWVudCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0U2VydmljZXMobWFjaGluZUlkOiBzdHJpbmcsIHNxbUlkOiBzdHJpbmcsIGRldkRldmljZUlkOiBzdHJpbmcsIHNoYXJlZFByb2Nlc3NSZWFkeTogUHJvbWlzZTxNZXNzYWdlUG9ydENsaWVudD4pOiBQcm9taXNlPElJbnN0YW50aWF0aW9uU2VydmljZT4ge1xuXHRcdGNvbnN0IHNlcnZpY2VzID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cblx0XHQvLyBVcGRhdGVcblx0XHRzd2l0Y2ggKHByb2Nlc3MucGxhdGZvcm0pIHtcblx0XHRcdGNhc2UgJ3dpbjMyJzpcblx0XHRcdFx0c2VydmljZXMuc2V0KElVcGRhdGVTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoV2luMzJVcGRhdGVTZXJ2aWNlKSk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdsaW51eCc6XG5cdFx0XHRcdGlmIChpc0xpbnV4U25hcCkge1xuXHRcdFx0XHRcdHNlcnZpY2VzLnNldChJVXBkYXRlU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFNuYXBVcGRhdGVTZXJ2aWNlLCBbcHJvY2Vzcy5lbnZbJ1NOQVAnXSwgcHJvY2Vzcy5lbnZbJ1NOQVBfUkVWSVNJT04nXV0pKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzZXJ2aWNlcy5zZXQoSVVwZGF0ZVNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihMaW51eFVwZGF0ZVNlcnZpY2UpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSAnZGFyd2luJzpcblx0XHRcdFx0c2VydmljZXMuc2V0KElVcGRhdGVTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoRGFyd2luVXBkYXRlU2VydmljZSkpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHQvLyBXaW5kb3dzXG5cdFx0c2VydmljZXMuc2V0KElXaW5kb3dzTWFpblNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihXaW5kb3dzTWFpblNlcnZpY2UsIFttYWNoaW5lSWQsIHNxbUlkLCBkZXZEZXZpY2VJZCwgdGhpcy51c2VyRW52XSwgZmFsc2UpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKEF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZSwgdW5kZWZpbmVkLCBmYWxzZSkpO1xuXG5cdFx0Ly8gRGlhbG9nc1xuXHRcdGNvbnN0IGRpYWxvZ01haW5TZXJ2aWNlID0gbmV3IERpYWxvZ01haW5TZXJ2aWNlKHRoaXMubG9nU2VydmljZSwgdGhpcy5wcm9kdWN0U2VydmljZSk7XG5cdFx0c2VydmljZXMuc2V0KElEaWFsb2dNYWluU2VydmljZSwgZGlhbG9nTWFpblNlcnZpY2UpO1xuXG5cdFx0Ly8gTGF1bmNoXG5cdFx0c2VydmljZXMuc2V0KElMYXVuY2hNYWluU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKExhdW5jaE1haW5TZXJ2aWNlLCB1bmRlZmluZWQsIGZhbHNlIC8qIHByb3hpZWQgdG8gb3RoZXIgcHJvY2Vzc2VzICovKSk7XG5cblx0XHQvLyBEaWFnbm9zdGljc1xuXHRcdHNlcnZpY2VzLnNldChJRGlhZ25vc3RpY3NNYWluU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKERpYWdub3N0aWNzTWFpblNlcnZpY2UsIHVuZGVmaW5lZCwgZmFsc2UgLyogcHJveGllZCB0byBvdGhlciBwcm9jZXNzZXMgKi8pKTtcblx0XHRzZXJ2aWNlcy5zZXQoSURpYWdub3N0aWNzU2VydmljZSwgUHJveHlDaGFubmVsLnRvU2VydmljZShnZXREZWxheWVkQ2hhbm5lbChzaGFyZWRQcm9jZXNzUmVhZHkudGhlbihjbGllbnQgPT4gY2xpZW50LmdldENoYW5uZWwoJ2RpYWdub3N0aWNzJykpKSkpO1xuXG5cdFx0Ly8gRW5jcnlwdGlvblxuXHRcdHNlcnZpY2VzLnNldChJRW5jcnlwdGlvbk1haW5TZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoRW5jcnlwdGlvbk1haW5TZXJ2aWNlKSk7XG5cblx0XHQvLyBCcm93c2VyIFZpZXdcblx0XHRzZXJ2aWNlcy5zZXQoSUJyb3dzZXJWaWV3TWFpblNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihCcm93c2VyVmlld01haW5TZXJ2aWNlLCB1bmRlZmluZWQsIGZhbHNlIC8qIHByb3hpZWQgdG8gb3RoZXIgcHJvY2Vzc2VzICovKSk7XG5cdFx0c2VydmljZXMuc2V0KElCcm93c2VyVmlld0dyb3VwTWFpblNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihCcm93c2VyVmlld0dyb3VwTWFpblNlcnZpY2UsIHVuZGVmaW5lZCwgZmFsc2UgLyogcHJveGllZCB0byBvdGhlciBwcm9jZXNzZXMgKi8pKTtcblxuXHRcdC8vIEtleWJvYXJkIExheW91dFxuXHRcdHNlcnZpY2VzLnNldChJS2V5Ym9hcmRMYXlvdXRNYWluU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKEtleWJvYXJkTGF5b3V0TWFpblNlcnZpY2UpKTtcblxuXHRcdC8vIE5hdGl2ZSBIb3N0XG5cdFx0c2VydmljZXMuc2V0KElOYXRpdmVIb3N0TWFpblNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihOYXRpdmVIb3N0TWFpblNlcnZpY2UsIHVuZGVmaW5lZCwgZmFsc2UgLyogcHJveGllZCB0byBvdGhlciBwcm9jZXNzZXMgKi8pKTtcblxuXHRcdC8vIFN5c3RlbS13aWRlIChPUyBnbG9iYWwpIGtleWJpbmRpbmdzXG5cdFx0c2VydmljZXMuc2V0KElHbG9iYWxLZXliaW5kaW5nc01haW5TZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoR2xvYmFsS2V5YmluZGluZ3NNYWluU2VydmljZSwgW2dsb2JhbFNob3J0Y3V0XSkpO1xuXG5cdFx0Ly8gTWV0ZXJlZCBDb25uZWN0aW9uXG5cdFx0Y29uc3QgbWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlID0gbmV3IE1ldGVyZWRDb25uZWN0aW9uTWFpblNlcnZpY2UodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0c2VydmljZXMuc2V0KElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UsIG1ldGVyZWRDb25uZWN0aW9uU2VydmljZSk7XG5cblx0XHQvLyBXZWIgQ29udGVudHMgRXh0cmFjdG9yXG5cdFx0c2VydmljZXMuc2V0KElUZXJtaW5hbFNhbmRib3hTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTnVsbFRlcm1pbmFsU2FuZGJveFNlcnZpY2UpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlLCB1bmRlZmluZWQsIHRydWUpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTmF0aXZlV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UsIHVuZGVmaW5lZCwgZmFsc2UgLyogcHJveGllZCB0byBvdGhlciBwcm9jZXNzZXMgKi8pKTtcblxuXHRcdC8vIFdlYnZpZXcgTWFuYWdlclxuXHRcdHNlcnZpY2VzLnNldChJV2Vidmlld01hbmFnZXJTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoV2Vidmlld01haW5TZXJ2aWNlKSk7XG5cblx0XHQvLyBNZW51YmFyXG5cdFx0c2VydmljZXMuc2V0KElNZW51YmFyTWFpblNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihNZW51YmFyTWFpblNlcnZpY2UpKTtcblxuXHRcdC8vIEV4dGVuc2lvbiBIb3N0IFN0YXJ0ZXJcblx0XHRzZXJ2aWNlcy5zZXQoSUV4dGVuc2lvbkhvc3RTdGFydGVyLCBuZXcgU3luY0Rlc2NyaXB0b3IoRXh0ZW5zaW9uSG9zdFN0YXJ0ZXIpKTtcblxuXHRcdC8vIFN0b3JhZ2Vcblx0XHRzZXJ2aWNlcy5zZXQoSVN0b3JhZ2VNYWluU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFN0b3JhZ2VNYWluU2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJQXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihBcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZSkpO1xuXG5cdFx0Ly8gVGVybWluYWxcblx0XHRjb25zdCBwdHlIb3N0U3RhcnRlciA9IG5ldyBFbGVjdHJvblB0eUhvc3RTdGFydGVyKHtcblx0XHRcdGdyYWNlVGltZTogTG9jYWxSZWNvbm5lY3RDb25zdGFudHMuR3JhY2VUaW1lLFxuXHRcdFx0c2hvcnRHcmFjZVRpbWU6IExvY2FsUmVjb25uZWN0Q29uc3RhbnRzLlNob3J0R3JhY2VUaW1lLFxuXHRcdFx0c2Nyb2xsYmFjazogdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KFRlcm1pbmFsU2V0dGluZ0lkLlBlcnNpc3RlbnRTZXNzaW9uU2Nyb2xsYmFjaykgPz8gMTAwXG5cdFx0fSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLCB0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHB0eUhvc3RTZXJ2aWNlID0gbmV3IFB0eUhvc3RTZXJ2aWNlKFxuXHRcdFx0cHR5SG9zdFN0YXJ0ZXIsXG5cdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLFxuXHRcdFx0dGhpcy5sb2dnZXJTZXJ2aWNlXG5cdFx0KTtcblx0XHRzZXJ2aWNlcy5zZXQoSUxvY2FsUHR5U2VydmljZSwgcHR5SG9zdFNlcnZpY2UpO1xuXG5cdFx0Ly8gRXh0ZXJuYWwgdGVybWluYWxcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRzZXJ2aWNlcy5zZXQoSUV4dGVybmFsVGVybWluYWxNYWluU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFdpbmRvd3NFeHRlcm5hbFRlcm1pbmFsU2VydmljZSkpO1xuXHRcdH0gZWxzZSBpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdHNlcnZpY2VzLnNldChJRXh0ZXJuYWxUZXJtaW5hbE1haW5TZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTWFjRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UpKTtcblx0XHR9IGVsc2UgaWYgKGlzTGludXgpIHtcblx0XHRcdHNlcnZpY2VzLnNldChJRXh0ZXJuYWxUZXJtaW5hbE1haW5TZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTGludXhFeHRlcm5hbFRlcm1pbmFsU2VydmljZSkpO1xuXHRcdH1cblx0XHRzZXJ2aWNlcy5zZXQoSVNhbmRib3hIZWxwZXJNYWluU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFNhbmRib3hIZWxwZXJTZXJ2aWNlKSk7XG5cblx0XHQvLyBCYWNrdXBzXG5cdFx0Y29uc3QgYmFja3VwTWFpblNlcnZpY2UgPSBuZXcgQmFja3VwTWFpblNlcnZpY2UodGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMuc3RhdGVTZXJ2aWNlKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUJhY2t1cE1haW5TZXJ2aWNlLCBiYWNrdXBNYWluU2VydmljZSk7XG5cblx0XHQvLyBXb3Jrc3BhY2VzXG5cdFx0Y29uc3Qgd29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZSA9IG5ldyBXb3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlKHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZSwgYmFja3VwTWFpblNlcnZpY2UsIGRpYWxvZ01haW5TZXJ2aWNlKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UsIHdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UpO1xuXHRcdHNlcnZpY2VzLnNldChJV29ya3NwYWNlc1NlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihXb3Jrc3BhY2VzTWFpblNlcnZpY2UsIHVuZGVmaW5lZCwgZmFsc2UgLyogcHJveGllZCB0byBvdGhlciBwcm9jZXNzZXMgKi8pKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVdvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihXb3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlLCB1bmRlZmluZWQsIGZhbHNlKSk7XG5cblx0XHQvLyBVUkwgaGFuZGxpbmdcblx0XHRzZXJ2aWNlcy5zZXQoSVVSTFNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihOYXRpdmVVUkxTZXJ2aWNlLCB1bmRlZmluZWQsIGZhbHNlIC8qIHByb3hpZWQgdG8gb3RoZXIgcHJvY2Vzc2VzICovKSk7XG5cblx0XHQvLyBUZWxlbWV0cnlcblx0XHRpZiAoc3VwcG9ydHNUZWxlbWV0cnkodGhpcy5wcm9kdWN0U2VydmljZSwgdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlKSkge1xuXHRcdFx0Y29uc3QgaXNJbnRlcm5hbCA9IGlzSW50ZXJuYWxUZWxlbWV0cnkodGhpcy5wcm9kdWN0U2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCBjaGFubmVsID0gZ2V0RGVsYXllZENoYW5uZWwoc2hhcmVkUHJvY2Vzc1JlYWR5LnRoZW4oY2xpZW50ID0+IGNsaWVudC5nZXRDaGFubmVsKCd0ZWxlbWV0cnlBcHBlbmRlcicpKSk7XG5cdFx0XHRjb25zdCBhcHBlbmRlciA9IG5ldyBUZWxlbWV0cnlBcHBlbmRlckNsaWVudChjaGFubmVsKTtcblx0XHRcdGNvbnN0IGNvbW1vblByb3BlcnRpZXMgPSByZXNvbHZlQ29tbW9uUHJvcGVydGllcyhyZWxlYXNlKCksIGhvc3RuYW1lKCksIHByb2Nlc3MuYXJjaCwgdGhpcy5wcm9kdWN0U2VydmljZS5jb21taXQsIHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbiwgbWFjaGluZUlkLCBzcW1JZCwgZGV2RGV2aWNlSWQsIGlzSW50ZXJuYWwsIHRoaXMucHJvZHVjdFNlcnZpY2UuZGF0ZSk7XG5cdFx0XHRjb25zdCBwaWlQYXRocyA9IGdldFBpaVBhdGhzRnJvbUVudmlyb25tZW50KHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZSk7XG5cdFx0XHRjb25zdCBjb25maWc6IElUZWxlbWV0cnlTZXJ2aWNlQ29uZmlnID0geyBhcHBlbmRlcnM6IFthcHBlbmRlcl0sIGNvbW1vblByb3BlcnRpZXMsIHBpaVBhdGhzLCBzZW5kRXJyb3JUZWxlbWV0cnk6IHRydWUgfTtcblxuXHRcdFx0c2VydmljZXMuc2V0KElUZWxlbWV0cnlTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoVGVsZW1ldHJ5U2VydmljZSwgW2NvbmZpZ10sIGZhbHNlKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNlcnZpY2VzLnNldChJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdH1cblxuXHRcdC8vIERlZmF1bHQgRXh0ZW5zaW9ucyBQcm9maWxlIEluaXRcblx0XHRzZXJ2aWNlcy5zZXQoSUV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLCB1bmRlZmluZWQsIHRydWUpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKEV4dGVuc2lvbnNTY2FubmVyU2VydmljZSwgdW5kZWZpbmVkLCB0cnVlKSk7XG5cblx0XHQvLyBVdGlsaXR5IFByb2Nlc3MgV29ya2VyXG5cdFx0c2VydmljZXMuc2V0KElVdGlsaXR5UHJvY2Vzc1dvcmtlck1haW5TZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoVXRpbGl0eVByb2Nlc3NXb3JrZXJNYWluU2VydmljZSwgdW5kZWZpbmVkLCB0cnVlKSk7XG5cblx0XHQvLyBQcm94eSBBdXRoXG5cdFx0c2VydmljZXMuc2V0KElQcm94eUF1dGhTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoUHJveHlBdXRoU2VydmljZSkpO1xuXG5cdFx0Ly8gTUNQXG5cdFx0c2VydmljZXMuc2V0KElOYXRpdmVNY3BEaXNjb3ZlcnlIZWxwZXJTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTmF0aXZlTWNwRGlzY292ZXJ5SGVscGVyU2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJTWNwR2F0ZXdheVNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihNY3BHYXRld2F5U2VydmljZSkpO1xuXG5cdFx0Ly8gRGV2IE9ubHk6IENTUyBzZXJ2aWNlIChmb3IgRVNNKVxuXHRcdHNlcnZpY2VzLnNldChJQ1NTRGV2ZWxvcG1lbnRTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoQ1NTRGV2ZWxvcG1lbnRTZXJ2aWNlLCB1bmRlZmluZWQsIHRydWUpKTtcblxuXHRcdC8vIEluaXQgc2VydmljZXMgdGhhdCByZXF1aXJlIGl0XG5cdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChbXG5cdFx0XHRiYWNrdXBNYWluU2VydmljZS5pbml0aWFsaXplKCksXG5cdFx0XHR3b3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlLmluaXRpYWxpemUoKVxuXHRcdF0pO1xuXG5cdFx0cmV0dXJuIHRoaXMubWFpbkluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKHNlcnZpY2VzKTtcblx0fVxuXG5cdHByaXZhdGUgaW5pdENoYW5uZWxzKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyOiBFbGVjdHJvbklQQ1NlcnZlciwgc2hhcmVkUHJvY2Vzc0NsaWVudDogUHJvbWlzZTxNZXNzYWdlUG9ydENsaWVudD4pOiB2b2lkIHtcblxuXHRcdC8vIENoYW5uZWxzIHJlZ2lzdGVyZWQgdG8gbm9kZS5qcyBhcmUgZXhwb3NlZCB0byBzZWNvbmQgaW5zdGFuY2VzXG5cdFx0Ly8gbGF1bmNoaW5nIGJlY2F1c2UgdGhhdCBpcyB0aGUgb25seSB3YXkgdGhlIHNlY29uZCBpbnN0YW5jZVxuXHRcdC8vIGNhbiB0YWxrIHRvIHRoZSBmaXJzdCBpbnN0YW5jZS4gRWxlY3Ryb24gSVBDIGRvZXMgbm90IHdvcmtcblx0XHQvLyBhY3Jvc3MgYXBwcyB1bnRpbCBgcmVxdWVzdFNpbmdsZUluc3RhbmNlYCBBUElzIGFyZSBhZG9wdGVkLlxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdFx0Y29uc3QgbGF1bmNoQ2hhbm5lbCA9IFByb3h5Q2hhbm5lbC5mcm9tU2VydmljZShhY2Nlc3Nvci5nZXQoSUxhdW5jaE1haW5TZXJ2aWNlKSwgZGlzcG9zYWJsZXMsIHsgZGlzYWJsZU1hcnNoYWxsaW5nOiB0cnVlIH0pO1xuXHRcdHRoaXMubWFpblByb2Nlc3NOb2RlSXBjU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbCgnbGF1bmNoJywgbGF1bmNoQ2hhbm5lbCk7XG5cblx0XHRjb25zdCBkaWFnbm9zdGljc0NoYW5uZWwgPSBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2UoYWNjZXNzb3IuZ2V0KElEaWFnbm9zdGljc01haW5TZXJ2aWNlKSwgZGlzcG9zYWJsZXMsIHsgZGlzYWJsZU1hcnNoYWxsaW5nOiB0cnVlIH0pO1xuXHRcdHRoaXMubWFpblByb2Nlc3NOb2RlSXBjU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbCgnZGlhZ25vc3RpY3MnLCBkaWFnbm9zdGljc0NoYW5uZWwpO1xuXG5cdFx0Ly8gUG9saWNpZXMgKG1haW4gJiBzaGFyZWQgcHJvY2Vzcylcblx0XHRjb25zdCBwb2xpY3lDaGFubmVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBQb2xpY3lDaGFubmVsKGFjY2Vzc29yLmdldChJUG9saWN5U2VydmljZSkpKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbCgncG9saWN5JywgcG9saWN5Q2hhbm5lbCk7XG5cdFx0c2hhcmVkUHJvY2Vzc0NsaWVudC50aGVuKGNsaWVudCA9PiBjbGllbnQucmVnaXN0ZXJDaGFubmVsKCdwb2xpY3knLCBwb2xpY3lDaGFubmVsKSk7XG5cblx0XHRjb25zdCBuYXRpdmVNYW5hZ2VkU2V0dGluZ3NDaGFubmVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBOYXRpdmVNYW5hZ2VkU2V0dGluZ3NDaGFubmVsKGFjY2Vzc29yLmdldChJTmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSkpKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbCgnbmF0aXZlTWFuYWdlZFNldHRpbmdzJywgbmF0aXZlTWFuYWdlZFNldHRpbmdzQ2hhbm5lbCk7XG5cblx0XHRjb25zdCBmaWxlTWFuYWdlZFNldHRpbmdzQ2hhbm5lbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZU1hbmFnZWRTZXR0aW5nc0NoYW5uZWwoYWNjZXNzb3IuZ2V0KElGaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZSkpKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbCgnZmlsZU1hbmFnZWRTZXR0aW5ncycsIGZpbGVNYW5hZ2VkU2V0dGluZ3NDaGFubmVsKTtcblxuXHRcdC8vIExvY2FsIEZpbGVzXG5cdFx0Y29uc3QgZGlza0ZpbGVTeXN0ZW1Qcm92aWRlciA9IHRoaXMuZmlsZVNlcnZpY2UuZ2V0UHJvdmlkZXIoU2NoZW1hcy5maWxlKTtcblx0XHRhc3NlcnRUeXBlKGRpc2tGaWxlU3lzdGVtUHJvdmlkZXIgaW5zdGFuY2VvZiBEaXNrRmlsZVN5c3RlbVByb3ZpZGVyKTtcblx0XHRjb25zdCBmaWxlU3lzdGVtUHJvdmlkZXJDaGFubmVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNrRmlsZVN5c3RlbVByb3ZpZGVyQ2hhbm5lbChkaXNrRmlsZVN5c3RlbVByb3ZpZGVyLCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZSkpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKExPQ0FMX0ZJTEVfU1lTVEVNX0NIQU5ORUxfTkFNRSwgZmlsZVN5c3RlbVByb3ZpZGVyQ2hhbm5lbCk7XG5cdFx0c2hhcmVkUHJvY2Vzc0NsaWVudC50aGVuKGNsaWVudCA9PiBjbGllbnQucmVnaXN0ZXJDaGFubmVsKExPQ0FMX0ZJTEVfU1lTVEVNX0NIQU5ORUxfTkFNRSwgZmlsZVN5c3RlbVByb3ZpZGVyQ2hhbm5lbCkpO1xuXG5cdFx0Ly8gVXNlciBEYXRhIFByb2ZpbGVzXG5cdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UgPSBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2UoYWNjZXNzb3IuZ2V0KElVc2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2UpLCBkaXNwb3NhYmxlcyk7XG5cdFx0bWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5yZWdpc3RlckNoYW5uZWwoJ3VzZXJEYXRhUHJvZmlsZXMnLCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSk7XG5cdFx0c2hhcmVkUHJvY2Vzc0NsaWVudC50aGVuKGNsaWVudCA9PiBjbGllbnQucmVnaXN0ZXJDaGFubmVsKCd1c2VyRGF0YVByb2ZpbGVzJywgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UpKTtcblxuXHRcdC8vIFVwZGF0ZVxuXHRcdGNvbnN0IHVwZGF0ZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVwZGF0ZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHVwZGF0ZUNoYW5uZWwgPSBuZXcgVXBkYXRlQ2hhbm5lbCh1cGRhdGVTZXJ2aWNlKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbCgndXBkYXRlJywgdXBkYXRlQ2hhbm5lbCk7XG5cblx0XHQvLyBTaG93IGEgbmF0aXZlIFwibm8gdXBkYXRlcyBhdmFpbGFibGVcIiBkaWFsb2cgZnJvbSB0aGUgbWFpbiBwcm9jZXNzIG9ubHkgaW4gd2luZG93bGVzcyBtYWNPUyBjYXNlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKG5ldyBOb3RBdmFpbGFibGVVcGRhdGVEaWFsb2codXBkYXRlU2VydmljZSwgYWNjZXNzb3IuZ2V0KElEaWFsb2dNYWluU2VydmljZSksIGFjY2Vzc29yLmdldChJV2luZG93c01haW5TZXJ2aWNlKSkpO1xuXG5cdFx0Ly8gTWV0ZXJlZCBDb25uZWN0aW9uXG5cdFx0Y29uc3QgbWV0ZXJlZENvbm5lY3Rpb25DaGFubmVsID0gbmV3IE1ldGVyZWRDb25uZWN0aW9uQ2hhbm5lbChhY2Nlc3Nvci5nZXQoSU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSkgYXMgTWV0ZXJlZENvbm5lY3Rpb25NYWluU2VydmljZSk7XG5cdFx0bWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5yZWdpc3RlckNoYW5uZWwoTUVURVJFRF9DT05ORUNUSU9OX0NIQU5ORUwsIG1ldGVyZWRDb25uZWN0aW9uQ2hhbm5lbCk7XG5cdFx0c2hhcmVkUHJvY2Vzc0NsaWVudC50aGVuKGNsaWVudCA9PiBjbGllbnQucmVnaXN0ZXJDaGFubmVsKE1FVEVSRURfQ09OTkVDVElPTl9DSEFOTkVMLCBtZXRlcmVkQ29ubmVjdGlvbkNoYW5uZWwpKTtcblxuXHRcdC8vIFByb2Nlc3Ncblx0XHRjb25zdCBwcm9jZXNzQ2hhbm5lbCA9IFByb3h5Q2hhbm5lbC5mcm9tU2VydmljZShuZXcgUHJvY2Vzc01haW5TZXJ2aWNlKHRoaXMubG9nU2VydmljZSwgYWNjZXNzb3IuZ2V0KElEaWFnbm9zdGljc1NlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSURpYWdub3N0aWNzTWFpblNlcnZpY2UpKSwgZGlzcG9zYWJsZXMpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKCdwcm9jZXNzJywgcHJvY2Vzc0NoYW5uZWwpO1xuXG5cdFx0Ly8gRW5jcnlwdGlvblxuXHRcdGNvbnN0IGVuY3J5cHRpb25DaGFubmVsID0gUHJveHlDaGFubmVsLmZyb21TZXJ2aWNlKGFjY2Vzc29yLmdldChJRW5jcnlwdGlvbk1haW5TZXJ2aWNlKSwgZGlzcG9zYWJsZXMpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKCdlbmNyeXB0aW9uJywgZW5jcnlwdGlvbkNoYW5uZWwpO1xuXG5cdFx0Ly8gQnJvd3NlciBWaWV3XG5cdFx0Y29uc3QgYnJvd3NlclZpZXdDaGFubmVsID0gUHJveHlDaGFubmVsLmZyb21TZXJ2aWNlKGFjY2Vzc29yLmdldChJQnJvd3NlclZpZXdNYWluU2VydmljZSksIGRpc3Bvc2FibGVzKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbChpcGNCcm93c2VyVmlld0NoYW5uZWxOYW1lLCBicm93c2VyVmlld0NoYW5uZWwpO1xuXHRcdHNoYXJlZFByb2Nlc3NDbGllbnQudGhlbihjbGllbnQgPT4gY2xpZW50LnJlZ2lzdGVyQ2hhbm5lbChpcGNCcm93c2VyVmlld0NoYW5uZWxOYW1lLCBicm93c2VyVmlld0NoYW5uZWwpKTtcblxuXHRcdC8vIEJyb3dzZXIgVmlldyBHcm91cFxuXHRcdGNvbnN0IGJyb3dzZXJWaWV3R3JvdXBDaGFubmVsID0gUHJveHlDaGFubmVsLmZyb21TZXJ2aWNlKGFjY2Vzc29yLmdldChJQnJvd3NlclZpZXdHcm91cE1haW5TZXJ2aWNlKSwgZGlzcG9zYWJsZXMpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKGlwY0Jyb3dzZXJWaWV3R3JvdXBDaGFubmVsTmFtZSwgYnJvd3NlclZpZXdHcm91cENoYW5uZWwpO1xuXHRcdHNoYXJlZFByb2Nlc3NDbGllbnQudGhlbihjbGllbnQgPT4gY2xpZW50LnJlZ2lzdGVyQ2hhbm5lbChpcGNCcm93c2VyVmlld0dyb3VwQ2hhbm5lbE5hbWUsIGJyb3dzZXJWaWV3R3JvdXBDaGFubmVsKSk7XG5cblx0XHQvLyBTaWduaW5nXG5cdFx0Y29uc3Qgc2lnbkNoYW5uZWwgPSBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2UoYWNjZXNzb3IuZ2V0KElTaWduU2VydmljZSksIGRpc3Bvc2FibGVzKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbCgnc2lnbicsIHNpZ25DaGFubmVsKTtcblxuXHRcdC8vIEtleWJvYXJkIExheW91dFxuXHRcdGNvbnN0IGtleWJvYXJkTGF5b3V0Q2hhbm5lbCA9IFByb3h5Q2hhbm5lbC5mcm9tU2VydmljZShhY2Nlc3Nvci5nZXQoSUtleWJvYXJkTGF5b3V0TWFpblNlcnZpY2UpLCBkaXNwb3NhYmxlcyk7XG5cdFx0bWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5yZWdpc3RlckNoYW5uZWwoJ2tleWJvYXJkTGF5b3V0Jywga2V5Ym9hcmRMYXlvdXRDaGFubmVsKTtcblxuXHRcdC8vIE5hdGl2ZSBob3N0IChtYWluICYgc2hhcmVkIHByb2Nlc3MpXG5cdFx0dGhpcy5uYXRpdmVIb3N0TWFpblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5hdGl2ZUhvc3RNYWluU2VydmljZSk7XG5cdFx0Y29uc3QgbmF0aXZlSG9zdENoYW5uZWwgPSBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2UodGhpcy5uYXRpdmVIb3N0TWFpblNlcnZpY2UsIGRpc3Bvc2FibGVzLCB7XG5cdFx0XHQvLyBUaGlzIGV2ZW50IGhhcyBtYWluLXByb2Nlc3MgY29uc3VtZXJzIGJ1dCBubyBJUEMgY29uc3VtZXIsIHNvIGl0cyBidWZmZXIgd291bGQgbmV2ZXIgZHJhaW4uXG5cdFx0XHR1bmJ1ZmZlcmVkRXZlbnRzOiBbJ29uRGlkQmx1ck1haW5XaW5kb3cnXVxuXHRcdH0pO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKCduYXRpdmVIb3N0JywgbmF0aXZlSG9zdENoYW5uZWwpO1xuXHRcdHNoYXJlZFByb2Nlc3NDbGllbnQudGhlbihjbGllbnQgPT4gY2xpZW50LnJlZ2lzdGVyQ2hhbm5lbCgnbmF0aXZlSG9zdCcsIG5hdGl2ZUhvc3RDaGFubmVsKSk7XG5cblx0XHQvLyBXZWIgQ29udGVudCBFeHRyYWN0b3Jcblx0XHRjb25zdCB3ZWJDb250ZW50RXh0cmFjdG9yQ2hhbm5lbCA9IFByb3h5Q2hhbm5lbC5mcm9tU2VydmljZShhY2Nlc3Nvci5nZXQoSVdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKSwgZGlzcG9zYWJsZXMpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKCd3ZWJDb250ZW50RXh0cmFjdG9yJywgd2ViQ29udGVudEV4dHJhY3RvckNoYW5uZWwpO1xuXG5cdFx0Ly8gV29ya3NwYWNlc1xuXHRcdGNvbnN0IHdvcmtzcGFjZXNDaGFubmVsID0gUHJveHlDaGFubmVsLmZyb21TZXJ2aWNlKGFjY2Vzc29yLmdldChJV29ya3NwYWNlc1NlcnZpY2UpLCBkaXNwb3NhYmxlcyk7XG5cdFx0bWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5yZWdpc3RlckNoYW5uZWwoJ3dvcmtzcGFjZXMnLCB3b3Jrc3BhY2VzQ2hhbm5lbCk7XG5cblx0XHQvLyBNZW51YmFyXG5cdFx0Y29uc3QgbWVudWJhckNoYW5uZWwgPSBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2UoYWNjZXNzb3IuZ2V0KElNZW51YmFyTWFpblNlcnZpY2UpLCBkaXNwb3NhYmxlcyk7XG5cdFx0bWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5yZWdpc3RlckNoYW5uZWwoJ21lbnViYXInLCBtZW51YmFyQ2hhbm5lbCk7XG5cblx0XHQvLyBVUkwgaGFuZGxpbmdcblx0XHRjb25zdCB1cmxDaGFubmVsID0gUHJveHlDaGFubmVsLmZyb21TZXJ2aWNlKGFjY2Vzc29yLmdldChJVVJMU2VydmljZSksIGRpc3Bvc2FibGVzKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbCgndXJsJywgdXJsQ2hhbm5lbCk7XG5cblx0XHQvLyBXZWJ2aWV3IE1hbmFnZXJcblx0XHRjb25zdCB3ZWJ2aWV3Q2hhbm5lbCA9IFByb3h5Q2hhbm5lbC5mcm9tU2VydmljZShhY2Nlc3Nvci5nZXQoSVdlYnZpZXdNYW5hZ2VyU2VydmljZSksIGRpc3Bvc2FibGVzKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbCgnd2VidmlldycsIHdlYnZpZXdDaGFubmVsKTtcblxuXHRcdC8vIFN0b3JhZ2UgKG1haW4gJiBzaGFyZWQgcHJvY2Vzcylcblx0XHRjb25zdCBzdG9yYWdlQ2hhbm5lbCA9IGRpc3Bvc2FibGVzLmFkZCgobmV3IFN0b3JhZ2VEYXRhYmFzZUNoYW5uZWwodGhpcy5sb2dTZXJ2aWNlLCBhY2Nlc3Nvci5nZXQoSVN0b3JhZ2VNYWluU2VydmljZSkpKSk7XG5cdFx0bWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5yZWdpc3RlckNoYW5uZWwoJ3N0b3JhZ2UnLCBzdG9yYWdlQ2hhbm5lbCk7XG5cdFx0c2hhcmVkUHJvY2Vzc0NsaWVudC50aGVuKGNsaWVudCA9PiBjbGllbnQucmVnaXN0ZXJDaGFubmVsKCdzdG9yYWdlJywgc3RvcmFnZUNoYW5uZWwpKTtcblxuXHRcdC8vIFByb2ZpbGUgU3RvcmFnZSBDaGFuZ2VzIExpc3RlbmVyIChzaGFyZWQgcHJvY2Vzcylcblx0XHRjb25zdCBwcm9maWxlU3RvcmFnZUxpc3RlbmVyID0gZGlzcG9zYWJsZXMuYWRkKChuZXcgUHJvZmlsZVN0b3JhZ2VDaGFuZ2VzTGlzdGVuZXJDaGFubmVsKGFjY2Vzc29yLmdldChJU3RvcmFnZU1haW5TZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElVc2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2UpLCB0aGlzLmxvZ1NlcnZpY2UpKSk7XG5cdFx0c2hhcmVkUHJvY2Vzc0NsaWVudC50aGVuKGNsaWVudCA9PiBjbGllbnQucmVnaXN0ZXJDaGFubmVsKCdwcm9maWxlU3RvcmFnZUxpc3RlbmVyJywgcHJvZmlsZVN0b3JhZ2VMaXN0ZW5lcikpO1xuXG5cdFx0Ly8gVGVybWluYWxcblx0XHRjb25zdCBwdHlIb3N0Q2hhbm5lbCA9IFByb3h5Q2hhbm5lbC5mcm9tU2VydmljZShhY2Nlc3Nvci5nZXQoSUxvY2FsUHR5U2VydmljZSksIGRpc3Bvc2FibGVzKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbChUZXJtaW5hbElwY0NoYW5uZWxzLkxvY2FsUHR5LCBwdHlIb3N0Q2hhbm5lbCk7XG5cblx0XHQvLyBFeHRlcm5hbCBUZXJtaW5hbFxuXHRcdGNvbnN0IGV4dGVybmFsVGVybWluYWxDaGFubmVsID0gUHJveHlDaGFubmVsLmZyb21TZXJ2aWNlKGFjY2Vzc29yLmdldChJRXh0ZXJuYWxUZXJtaW5hbE1haW5TZXJ2aWNlKSwgZGlzcG9zYWJsZXMpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKCdleHRlcm5hbFRlcm1pbmFsJywgZXh0ZXJuYWxUZXJtaW5hbENoYW5uZWwpO1xuXG5cdFx0Ly8gU2FuZGJveCBIZWxwZXJcblx0XHRjb25zdCBzYW5kYm94SGVscGVyQ2hhbm5lbCA9IFByb3h5Q2hhbm5lbC5mcm9tU2VydmljZShhY2Nlc3Nvci5nZXQoSVNhbmRib3hIZWxwZXJNYWluU2VydmljZSksIGRpc3Bvc2FibGVzKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbCgnc2FuZGJveEhlbHBlcicsIHNhbmRib3hIZWxwZXJDaGFubmVsKTtcblxuXHRcdC8vIE1DUFxuXHRcdGNvbnN0IG1jcERpc2NvdmVyeUNoYW5uZWwgPSBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2UoYWNjZXNzb3IuZ2V0KElOYXRpdmVNY3BEaXNjb3ZlcnlIZWxwZXJTZXJ2aWNlKSwgZGlzcG9zYWJsZXMpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKE5hdGl2ZU1jcERpc2NvdmVyeUhlbHBlckNoYW5uZWxOYW1lLCBtY3BEaXNjb3ZlcnlDaGFubmVsKTtcblx0XHRjb25zdCBtY3BHYXRld2F5Q2hhbm5lbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNY3BHYXRld2F5Q2hhbm5lbChtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLCBhY2Nlc3Nvci5nZXQoSU1jcEdhdGV3YXlTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElMb2dnZXJNYWluU2VydmljZSkpKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbChNY3BHYXRld2F5Q2hhbm5lbE5hbWUsIG1jcEdhdGV3YXlDaGFubmVsKTtcblxuXHRcdC8vIExvZ2dlclxuXHRcdGNvbnN0IGxvZ2dlckNoYW5uZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgTG9nZ2VyQ2hhbm5lbChhY2Nlc3Nvci5nZXQoSUxvZ2dlck1haW5TZXJ2aWNlKSkpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKCdsb2dnZXInLCBsb2dnZXJDaGFubmVsKTtcblx0XHRzaGFyZWRQcm9jZXNzQ2xpZW50LnRoZW4oY2xpZW50ID0+IGNsaWVudC5yZWdpc3RlckNoYW5uZWwoJ2xvZ2dlcicsIGxvZ2dlckNoYW5uZWwpKTtcblxuXHRcdC8vIEV4dGVuc2lvbiBIb3N0IERlYnVnIEJyb2FkY2FzdGluZ1xuXHRcdGNvbnN0IGVsZWN0cm9uRXh0ZW5zaW9uSG9zdERlYnVnQnJvYWRjYXN0Q2hhbm5lbCA9IG5ldyBFbGVjdHJvbkV4dGVuc2lvbkhvc3REZWJ1Z0Jyb2FkY2FzdENoYW5uZWwoYWNjZXNzb3IuZ2V0KElXaW5kb3dzTWFpblNlcnZpY2UpKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbCgnZXh0ZW5zaW9uaG9zdGRlYnVnc2VydmljZScsIGVsZWN0cm9uRXh0ZW5zaW9uSG9zdERlYnVnQnJvYWRjYXN0Q2hhbm5lbCk7XG5cblx0XHQvLyBFeHRlbnNpb24gSG9zdCBTdGFydGVyXG5cdFx0Y29uc3QgZXh0ZW5zaW9uSG9zdFN0YXJ0ZXJDaGFubmVsID0gUHJveHlDaGFubmVsLmZyb21TZXJ2aWNlKGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uSG9zdFN0YXJ0ZXIpLCBkaXNwb3NhYmxlcyk7XG5cdFx0bWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5yZWdpc3RlckNoYW5uZWwoaXBjRXh0ZW5zaW9uSG9zdFN0YXJ0ZXJDaGFubmVsTmFtZSwgZXh0ZW5zaW9uSG9zdFN0YXJ0ZXJDaGFubmVsKTtcblxuXHRcdC8vIFV0aWxpdHkgUHJvY2VzcyBXb3JrZXJcblx0XHRjb25zdCB1dGlsaXR5UHJvY2Vzc1dvcmtlckNoYW5uZWwgPSBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2UoYWNjZXNzb3IuZ2V0KElVdGlsaXR5UHJvY2Vzc1dvcmtlck1haW5TZXJ2aWNlKSwgZGlzcG9zYWJsZXMpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKGlwY1V0aWxpdHlQcm9jZXNzV29ya2VyQ2hhbm5lbE5hbWUsIHV0aWxpdHlQcm9jZXNzV29ya2VyQ2hhbm5lbCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5GaXJzdFdpbmRvdyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaW5pdGlhbFByb3RvY29sVXJsczogSUluaXRpYWxQcm90b2NvbFVybHMgfCB1bmRlZmluZWQpOiBQcm9taXNlPElDb2RlV2luZG93W10+IHtcblx0XHRjb25zdCB3aW5kb3dzTWFpblNlcnZpY2UgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZSA9IGFjY2Vzc29yLmdldChJV2luZG93c01haW5TZXJ2aWNlKTtcblx0XHR0aGlzLmF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZSA9IGFjY2Vzc29yLmdldChJQXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNvbnRleHQgPSBpc0xhdW5jaGVkRnJvbUNsaShwcm9jZXNzLmVudikgPyBPcGVuQ29udGV4dC5DTEkgOiBPcGVuQ29udGV4dC5ERVNLVE9QO1xuXHRcdGNvbnN0IGFyZ3MgPSB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXJncztcblxuXHRcdC8vIEhhbmRsZSBhZ2VudHMgd2luZG93IGZpcnN0IGJhc2VkIG9uIGNvbnRleHRcblx0XHRpZiAoYXJnc1snYWdlbnRzJ10pIHtcblx0XHRcdHJldHVybiB3aW5kb3dzTWFpblNlcnZpY2Uub3BlbkFnZW50c1dpbmRvdyh7XG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdGNsaTogYXJncyxcblx0XHRcdFx0aW5pdGlhbFN0YXJ0dXA6IHRydWVcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIFRoZW4gY2hlY2sgZm9yIHdpbmRvd3MgZnJvbSBwcm90b2NvbCBsaW5rcyB0byBvcGVuXG5cdFx0aWYgKGluaXRpYWxQcm90b2NvbFVybHMpIHtcblxuXHRcdFx0Ly8gT3BlbmFibGVzIGNhbiBvcGVuIGFzIHdpbmRvd3MgZGlyZWN0bHlcblx0XHRcdGlmIChpbml0aWFsUHJvdG9jb2xVcmxzLm9wZW5hYmxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJldHVybiB3aW5kb3dzTWFpblNlcnZpY2Uub3Blbih7XG5cdFx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0XHRjbGk6IGFyZ3MsXG5cdFx0XHRcdFx0dXJpc1RvT3BlbjogaW5pdGlhbFByb3RvY29sVXJscy5vcGVuYWJsZXMsXG5cdFx0XHRcdFx0Z290b0xpbmVNb2RlOiB0cnVlLFxuXHRcdFx0XHRcdGluaXRpYWxTdGFydHVwOiB0cnVlXG5cdFx0XHRcdFx0Ly8gcmVtb3RlQXV0aG9yaXR5OiB3aWxsIGJlIGRldGVybWluZWQgYmFzZWQgb24gb3BlbmFibGVzXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBQcm90b2NvbCBsaW5rcyB3aXRoIGB3aW5kb3dJZD1fYmxhbmtgIG9uIHN0YXJ0dXBcblx0XHRcdC8vIHNob3VsZCBiZSBoYW5kbGVkIGluIGEgc3BlY2lhbCB3YXk6XG5cdFx0XHQvLyBXZSB0YWtlIHRoZSBmaXJzdCBvbmUgb2YgdGhlc2UgYW5kIG9wZW4gYW4gZW1wdHlcblx0XHRcdC8vIHdpbmRvdyBmb3IgaXQuIFRoaXMgZW5zdXJlcyB3ZSBhcmUgbm90IHJlc3RvcmluZ1xuXHRcdFx0Ly8gYWxsIHdpbmRvd3Mgb2YgdGhlIHByZXZpb3VzIHNlc3Npb24uXG5cdFx0XHQvLyBJZiB0aGVyZSBhcmUgYW55IG1vcmUgVVJMcyBsaWtlIHRoZXNlLCB0aGV5IHdpbGxcblx0XHRcdC8vIGJlIGhhbmRsZWQgZnJvbSB0aGUgVVJMIGxpc3RlbmVycyBpbnN0YWxsZWQgbGF0ZXIuXG5cblx0XHRcdGlmIChpbml0aWFsUHJvdG9jb2xVcmxzLnVybHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHByb3RvY29sVXJsIG9mIGluaXRpYWxQcm90b2NvbFVybHMudXJscykge1xuXHRcdFx0XHRcdGNvbnN0IHBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMocHJvdG9jb2xVcmwudXJpLnF1ZXJ5KTtcblx0XHRcdFx0XHRpZiAocGFyYW1zLmdldCgnd2luZG93SWQnKSA9PT0gJ19ibGFuaycpIHtcblxuXHRcdFx0XHRcdFx0Ly8gSXQgaXMgaW1wb3J0YW50IGhlcmUgdGhhdCB3ZSByZW1vdmUgYHdpbmRvd0lkPV9ibGFua2AgZnJvbVxuXHRcdFx0XHRcdFx0Ly8gdGhpcyBVUkwgYmVjYXVzZSBoZXJlIHdlIG9wZW4gYW4gZW1wdHkgd2luZG93IGZvciBpdC5cblxuXHRcdFx0XHRcdFx0cGFyYW1zLmRlbGV0ZSgnd2luZG93SWQnKTtcblx0XHRcdFx0XHRcdHByb3RvY29sVXJsLm9yaWdpbmFsVXJsID0gcHJvdG9jb2xVcmwudXJpLnRvU3RyaW5nKHRydWUpO1xuXHRcdFx0XHRcdFx0cHJvdG9jb2xVcmwudXJpID0gcHJvdG9jb2xVcmwudXJpLndpdGgoeyBxdWVyeTogcGFyYW1zLnRvU3RyaW5nKCkgfSk7XG5cblx0XHRcdFx0XHRcdHJldHVybiB3aW5kb3dzTWFpblNlcnZpY2Uub3Blbih7XG5cdFx0XHRcdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdFx0XHRcdGNsaTogYXJncyxcblx0XHRcdFx0XHRcdFx0Zm9yY2VOZXdXaW5kb3c6IHRydWUsXG5cdFx0XHRcdFx0XHRcdGZvcmNlRW1wdHk6IHRydWUsXG5cdFx0XHRcdFx0XHRcdGdvdG9MaW5lTW9kZTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0aW5pdGlhbFN0YXJ0dXA6IHRydWVcblx0XHRcdFx0XHRcdFx0Ly8gcmVtb3RlQXV0aG9yaXR5OiB3aWxsIGJlIGRldGVybWluZWQgYmFzZWQgb24gb3BlbmFibGVzXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtYWNPcGVuRmlsZXM6IHN0cmluZ1tdID0gKGdsb2JhbCBhcyB7IG1hY09wZW5GaWxlcz86IHN0cmluZ1tdIH0pLm1hY09wZW5GaWxlcyA/PyBbXTtcblx0XHRjb25zdCBoYXNDbGlBcmdzID0gYXJncy5fLmxlbmd0aDtcblx0XHRjb25zdCBoYXNGb2xkZXJVUklzID0gISFhcmdzWydmb2xkZXItdXJpJ107XG5cdFx0Y29uc3QgaGFzRmlsZVVSSXMgPSAhIWFyZ3NbJ2ZpbGUtdXJpJ107XG5cdFx0Y29uc3Qgbm9SZWNlbnRFbnRyeSA9IGFyZ3NbJ3NraXAtYWRkLXRvLXJlY2VudGx5LW9wZW5lZCddID09PSB0cnVlO1xuXHRcdGNvbnN0IHdhaXRNYXJrZXJGaWxlVVJJID0gYXJncy53YWl0ICYmIGFyZ3Mud2FpdE1hcmtlckZpbGVQYXRoID8gVVJJLmZpbGUoYXJncy53YWl0TWFya2VyRmlsZVBhdGgpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IGFyZ3MucmVtb3RlIHx8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBmb3JjZVByb2ZpbGUgPSBhcmdzLnByb2ZpbGU7XG5cdFx0Y29uc3QgZm9yY2VUZW1wUHJvZmlsZSA9IGFyZ3NbJ3Byb2ZpbGUtdGVtcCddO1xuXG5cdFx0Ly8gU3RhcnRlZCB3aXRob3V0IGZpbGUvZm9sZGVyIGFyZ3VtZW50c1xuXHRcdGlmICghaGFzQ2xpQXJncyAmJiAhaGFzRm9sZGVyVVJJcyAmJiAhaGFzRmlsZVVSSXMpIHtcblxuXHRcdFx0Ly8gRm9yY2UgbmV3IHdpbmRvd1xuXHRcdFx0aWYgKGFyZ3NbJ25ldy13aW5kb3cnXSB8fCBmb3JjZVByb2ZpbGUgfHwgZm9yY2VUZW1wUHJvZmlsZSkge1xuXHRcdFx0XHRyZXR1cm4gd2luZG93c01haW5TZXJ2aWNlLm9wZW4oe1xuXHRcdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdFx0Y2xpOiBhcmdzLFxuXHRcdFx0XHRcdGZvcmNlTmV3V2luZG93OiB0cnVlLFxuXHRcdFx0XHRcdGZvcmNlRW1wdHk6IHRydWUsXG5cdFx0XHRcdFx0bm9SZWNlbnRFbnRyeSxcblx0XHRcdFx0XHR3YWl0TWFya2VyRmlsZVVSSSxcblx0XHRcdFx0XHRpbml0aWFsU3RhcnR1cDogdHJ1ZSxcblx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHksXG5cdFx0XHRcdFx0Zm9yY2VQcm9maWxlLFxuXHRcdFx0XHRcdGZvcmNlVGVtcFByb2ZpbGVcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIG1hYzogb3Blbi1maWxlIGV2ZW50IHJlY2VpdmVkIG9uIHN0YXJ0dXBcblx0XHRcdGlmIChtYWNPcGVuRmlsZXMubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiB3aW5kb3dzTWFpblNlcnZpY2Uub3Blbih7XG5cdFx0XHRcdFx0Y29udGV4dDogT3BlbkNvbnRleHQuRE9DSyxcblx0XHRcdFx0XHRjbGk6IGFyZ3MsXG5cdFx0XHRcdFx0dXJpc1RvT3BlbjogbWFjT3BlbkZpbGVzLm1hcChwYXRoID0+IHtcblx0XHRcdFx0XHRcdHBhdGggPSBub3JtYWxpemVORkMocGF0aCk7IC8vIG1hY09TIG9ubHk6IG5vcm1hbGl6ZSBwYXRocyB0byBORkMgZm9ybVxuXG5cdFx0XHRcdFx0XHRyZXR1cm4gKGhhc1dvcmtzcGFjZUZpbGVFeHRlbnNpb24ocGF0aCkgPyB7IHdvcmtzcGFjZVVyaTogVVJJLmZpbGUocGF0aCkgfSA6IHsgZmlsZVVyaTogVVJJLmZpbGUocGF0aCkgfSk7XG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0bm9SZWNlbnRFbnRyeSxcblx0XHRcdFx0XHR3YWl0TWFya2VyRmlsZVVSSSxcblx0XHRcdFx0XHRpbml0aWFsU3RhcnR1cDogdHJ1ZSxcblx0XHRcdFx0XHQvLyByZW1vdGVBdXRob3JpdHk6IHdpbGwgYmUgZGV0ZXJtaW5lZCBiYXNlZCBvbiBtYWNPcGVuRmlsZXNcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gZGVmYXVsdDogcmVhZCBwYXRocyBmcm9tIGNsaVxuXHRcdHJldHVybiB3aW5kb3dzTWFpblNlcnZpY2Uub3Blbih7XG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0Y2xpOiBhcmdzLFxuXHRcdFx0Zm9yY2VOZXdXaW5kb3c6IGFyZ3NbJ25ldy13aW5kb3cnXSxcblx0XHRcdGRpZmZNb2RlOiBhcmdzLmRpZmYsXG5cdFx0XHRtZXJnZU1vZGU6IGFyZ3MubWVyZ2UsXG5cdFx0XHRub1JlY2VudEVudHJ5LFxuXHRcdFx0d2FpdE1hcmtlckZpbGVVUkksXG5cdFx0XHRnb3RvTGluZU1vZGU6IGFyZ3MuZ290byxcblx0XHRcdGluaXRpYWxTdGFydHVwOiB0cnVlLFxuXHRcdFx0cmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0Zm9yY2VQcm9maWxlLFxuXHRcdFx0Zm9yY2VUZW1wUHJvZmlsZVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhZnRlcldpbmRvd09wZW4oaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IHZvaWQge1xuXG5cdFx0Ly8gQWNjdXJhdGUgV2luZG93cyB2ZXJzaW9uIGluZm9cblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRpbml0V2luZG93c1ZlcnNpb25JbmZvKCk7XG5cdFx0fVxuXG5cdFx0Ly8gV2luZG93czogbXV0ZXhcblx0XHR0aGlzLmluc3RhbGxNdXRleCgpO1xuXG5cdFx0Ly8gUmVtb3RlIEF1dGhvcml0aWVzXG5cdFx0cHJvdG9jb2wucmVnaXN0ZXJIdHRwUHJvdG9jb2woU2NoZW1hcy52c2NvZGVSZW1vdGVSZXNvdXJjZSwgKHJlcXVlc3QsIGNhbGxiYWNrKSA9PiB7XG5cdFx0XHRjYWxsYmFjayh7XG5cdFx0XHRcdHVybDogcmVxdWVzdC51cmwucmVwbGFjZSgvXnZzY29kZS1yZW1vdGUtcmVzb3VyY2U6LywgJ2h0dHA6JyksXG5cdFx0XHRcdG1ldGhvZDogcmVxdWVzdC5tZXRob2Rcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gU3RhcnQgdG8gZmV0Y2ggc2hlbGwgZW52aXJvbm1lbnQgKGlmIG5lZWRlZCkgYWZ0ZXIgd2luZG93IGhhcyBvcGVuZWRcblx0XHQvLyBTaW5jZSB0aGlzIG9wZXJhdGlvbiBjYW4gdGFrZSBhIGxvbmcgdGltZSwgd2Ugd2FudCB0byB3YXJtIGl0IHVwIHdoaWxlXG5cdFx0Ly8gdGhlIHdpbmRvdyBpcyBvcGVuaW5nLlxuXHRcdC8vIFdlIGFsc28gc2hvdyBhbiBlcnJvciB0byB0aGUgdXNlciBpbiBjYXNlIHRoaXMgZmFpbHMuXG5cdFx0dGhpcy5yZXNvbHZlU2hlbGxFbnZpcm9ubWVudCh0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXJncywgcHJvY2Vzcy5lbnYsIHRydWUpO1xuXG5cdFx0Ly8gQ3Jhc2ggcmVwb3J0ZXJcblx0XHR0aGlzLnVwZGF0ZUNyYXNoUmVwb3J0ZXJFbmFibGVtZW50KCk7XG5cblx0XHQvLyBtYWNPUzogcm9zZXR0YSB0cmFuc2xhdGlvbiB3YXJuaW5nXG5cdFx0aWYgKGlzTWFjaW50b3NoICYmIGFwcC5ydW5uaW5nVW5kZXJBUk02NFRyYW5zbGF0aW9uKSB7XG5cdFx0XHR0aGlzLndpbmRvd3NNYWluU2VydmljZT8uc2VuZFRvRm9jdXNlZCgndnNjb2RlOnNob3dUcmFuc2xhdGVkQnVpbGRXYXJuaW5nJyk7XG5cdFx0fVxuXG5cdFx0Ly8gUG93ZXIgdGVsZW1ldHJ5XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRcdHR5cGUgUG93ZXJFdmVudCA9IHtcblx0XHRcdFx0cmVhZG9ubHkgaWRsZVN0YXRlOiBzdHJpbmc7XG5cdFx0XHRcdHJlYWRvbmx5IGlkbGVUaW1lOiBudW1iZXI7XG5cdFx0XHRcdHJlYWRvbmx5IHRoZXJtYWxTdGF0ZTogc3RyaW5nO1xuXHRcdFx0XHRyZWFkb25seSBvbkJhdHRlcnk6IGJvb2xlYW47XG5cdFx0XHR9O1xuXHRcdFx0dHlwZSBQb3dlckV2ZW50Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdGlkbGVTdGF0ZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBzeXN0ZW0gaWRsZSBzdGF0ZSAoYWN0aXZlLCBpZGxlLCBsb2NrZWQsIHVua25vd24pLicgfTtcblx0XHRcdFx0aWRsZVRpbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUaGUgc3lzdGVtIGlkbGUgdGltZSBpbiBzZWNvbmRzLicgfTtcblx0XHRcdFx0dGhlcm1hbFN0YXRlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHN5c3RlbSB0aGVybWFsIHN0YXRlICh1bmtub3duLCBub21pbmFsLCBmYWlyLCBzZXJpb3VzLCBjcml0aWNhbCkuJyB9O1xuXHRcdFx0XHRvbkJhdHRlcnk6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBzeXN0ZW0gaXMgcnVubmluZyBvbiBiYXR0ZXJ5IHBvd2VyLicgfTtcblx0XHRcdFx0b3duZXI6ICdjaHJtYXJ0aSc7XG5cdFx0XHRcdGNvbW1lbnQ6ICdUcmFja3MgT1MgcG93ZXIgc3VzcGVuZCBhbmQgcmVzdW1lIGV2ZW50cyBmb3IgcmVsaWFiaWxpdHkgaW5zaWdodHMuJztcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGdldFBvd2VyRXZlbnREYXRhID0gKCk6IFBvd2VyRXZlbnQgPT4gKHtcblx0XHRcdFx0aWRsZVN0YXRlOiBwb3dlck1vbml0b3IuZ2V0U3lzdGVtSWRsZVN0YXRlKDYwKSxcblx0XHRcdFx0aWRsZVRpbWU6IHBvd2VyTW9uaXRvci5nZXRTeXN0ZW1JZGxlVGltZSgpLFxuXHRcdFx0XHR0aGVybWFsU3RhdGU6IHBvd2VyTW9uaXRvci5nZXRDdXJyZW50VGhlcm1hbFN0YXRlKCksXG5cdFx0XHRcdG9uQmF0dGVyeTogcG93ZXJNb25pdG9yLmlzT25CYXR0ZXJ5UG93ZXIoKVxuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHBvd2VyTW9uaXRvciwgJ3N1c3BlbmQnKSgoKSA9PiB7XG5cdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxQb3dlckV2ZW50LCBQb3dlckV2ZW50Q2xhc3NpZmljYXRpb24+KCdwb3dlci5zdXNwZW5kJywgZ2V0UG93ZXJFdmVudERhdGEoKSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHBvd2VyTW9uaXRvciwgJ3Jlc3VtZScpKCgpID0+IHtcblx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFBvd2VyRXZlbnQsIFBvd2VyRXZlbnRDbGFzc2lmaWNhdGlvbj4oJ3Bvd2VyLnJlc3VtZScsIGdldFBvd2VyRXZlbnREYXRhKCkpO1xuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gR1BVIGNyYXNoIHRlbGVtZXRyeSBmb3Igc2tpYSBncmFwaGl0ZSBvdXQgb2Ygb3JkZXIgcmVjb3JkaW5nIGZhaWx1cmVzXG5cdFx0Ly8gUmVmcyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjg0MTYyXG5cdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdFx0XHR0eXBlIEdQVUZlYXR1cmVTdGF0dXNXaXRoU2tpYUdyYXBoaXRlID0gR1BVRmVhdHVyZVN0YXR1cyAmIHtcblx0XHRcdFx0XHRza2lhX2dyYXBoaXRlOiBzdHJpbmc7XG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IGluaXRpYWxHcHVGZWF0dXJlU3RhdHVzID0gYXBwLmdldEdQVUZlYXR1cmVTdGF0dXMoKSBhcyBHUFVGZWF0dXJlU3RhdHVzV2l0aFNraWFHcmFwaGl0ZTtcblx0XHRcdFx0Y29uc3Qgc2tpYUdyYXBoaXRlRW5hYmxlZDogc3RyaW5nID0gaW5pdGlhbEdwdUZlYXR1cmVTdGF0dXNbJ3NraWFfZ3JhcGhpdGUnXTtcblx0XHRcdFx0aWYgKHNraWFHcmFwaGl0ZUVuYWJsZWQgPT09ICdlbmFibGVkJykge1xuXHRcdFx0XHRcdGNvbnN0IGdwdUluZm9VcGRhdGUgPSBFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcihhcHAsICdncHUtaW5mby11cGRhdGUnKTtcblx0XHRcdFx0XHRjb25zdCBwZW5kaW5nR3B1SW5mb0xpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyPHsgZGV0YWlsczogRGV0YWlscyB9PihhcHAsICdjaGlsZC1wcm9jZXNzLWdvbmUnLCAoZXZlbnQsIGRldGFpbHMpID0+ICh7IGV2ZW50LCBkZXRhaWxzIH0pKSgoeyBkZXRhaWxzIH0pID0+IHtcblx0XHRcdFx0XHRcdGlmIChkZXRhaWxzLnR5cGUgPT09ICdHUFUnICYmIGRldGFpbHMucmVhc29uID09PSAnY3Jhc2hlZCcpIHtcblx0XHRcdFx0XHRcdFx0Ly8gV2FpdCBmb3IgZ3B1LWluZm8tdXBkYXRlIHdoaWNoIGZpcmVzIGFmdGVyIHRoZSBHUFUgcHJvY2Vzc1xuXHRcdFx0XHRcdFx0XHQvLyByZXN0YXJ0cyBhbmQgdGhlIGZlYXR1cmUgc3RhdHVzIGlzIHJlZnJlc2hlZC4gQXQgdGhlIHRpbWVcblx0XHRcdFx0XHRcdFx0Ly8gY2hpbGQtcHJvY2Vzcy1nb25lIGZpcmVzLCBnZXRHUFVGZWF0dXJlU3RhdHVzKCkgc3RpbGxcblx0XHRcdFx0XHRcdFx0Ly8gcmV0dXJucyB0aGUgcHJlLWNyYXNoIHN0YXR1cy5cblx0XHRcdFx0XHRcdFx0cGVuZGluZ0dwdUluZm9MaXN0ZW5lci52YWx1ZSA9IEV2ZW50Lm9uY2UoZ3B1SW5mb1VwZGF0ZSkoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRHcHVGZWF0dXJlU3RhdHVzID0gYXBwLmdldEdQVUZlYXR1cmVTdGF0dXMoKTtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBjdXJyZW50UmFzdGVyaXphdGlvblN0YXR1czogc3RyaW5nID0gY3VycmVudEdwdUZlYXR1cmVTdGF0dXNbJ3Jhc3Rlcml6YXRpb24nXTtcblx0XHRcdFx0XHRcdFx0XHRpZiAoY3VycmVudFJhc3Rlcml6YXRpb25TdGF0dXMgIT09ICdlbmFibGVkJykge1xuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gR2V0IGxhc3QgMTAgR1BVIGxvZyBtZXNzYWdlcyAob25seSB0aGUgbWVzc2FnZSBmaWVsZClcblx0XHRcdFx0XHRcdFx0XHRcdGxldCBncHVMb2dNZXNzYWdlczogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGUgQXBwV2l0aEdQVUxvZ01ldGhvZCA9IHR5cGVvZiBhcHAgJiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGdldEdQVUxvZ01lc3NhZ2VzKCk6IElHUFVMb2dNZXNzYWdlW107XG5cdFx0XHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgY3VzdG9tQXBwID0gYXBwIGFzIEFwcFdpdGhHUFVMb2dNZXRob2Q7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAodHlwZW9mIGN1c3RvbUFwcC5nZXRHUFVMb2dNZXNzYWdlcyA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRncHVMb2dNZXNzYWdlcyA9IGN1c3RvbUFwcC5nZXRHUFVMb2dNZXNzYWdlcygpLnNsaWNlKC0xMCkubWFwKGxvZyA9PiBsb2cubWVzc2FnZSk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHRcdHR5cGUgR3B1Q3Jhc2hFdmVudCA9IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cmVhZG9ubHkgZ3B1RmVhdHVyZVN0YXR1czogc3RyaW5nO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRyZWFkb25seSBncHVMb2dNZXNzYWdlczogc3RyaW5nO1xuXHRcdFx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGUgR3B1Q3Jhc2hDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Z3B1RmVhdHVyZVN0YXR1czogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0N1cnJlbnQgR1BVIGZlYXR1cmUgc3RhdHVzLicgfTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Z3B1TG9nTWVzc2FnZXM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdMYXN0IDEwIEdQVSBsb2cgbWVzc2FnZXMgY29sbGVjdGVkIGFmdGVyIHRoZSBjcmFzaCBhbmQgR1BVIHByb2Nlc3MgcmVzdGFydC4nIH07XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG93bmVyOiAnZGVlcGFrMTU1Nic7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbW1lbnQ6ICdUcmFja3MgR1BVIHByb2Nlc3MgY3Jhc2hlcyB0aGF0IHdvdWxkIHJlc3VsdCBpbiBmYWxsYmFjayBtb2RlLic7XG5cdFx0XHRcdFx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0XHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8R3B1Q3Jhc2hFdmVudCwgR3B1Q3Jhc2hDbGFzc2lmaWNhdGlvbj4oJ2dwdS5jcmFzaC5mYWxsYmFjaycsIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Z3B1RmVhdHVyZVN0YXR1czogSlNPTi5zdHJpbmdpZnkoY3VycmVudEdwdUZlYXR1cmVTdGF0dXMpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRncHVMb2dNZXNzYWdlczogSlNPTi5zdHJpbmdpZnkoZ3B1TG9nTWVzc2FnZXMpXG5cdFx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0e1xuXHRcdFx0aW50ZXJmYWNlIE5ldHdvcmtQcm9jZXNzTGF1bmNoZWREZXRhaWxzIHtcblx0XHRcdFx0cmVhZG9ubHkgcGlkOiBudW1iZXI7XG5cdFx0XHR9XG5cdFx0XHRpbnRlcmZhY2UgTmV0d29ya1Byb2Nlc3NHb25lRGV0YWlscyB7XG5cdFx0XHRcdHJlYWRvbmx5IHBpZDogbnVtYmVyO1xuXHRcdFx0XHRyZWFkb25seSBleGl0Q29kZTogbnVtYmVyO1xuXHRcdFx0XHRyZWFkb25seSBjcmFzaGVkOiBib29sZWFuO1xuXHRcdFx0XHRyZWFkb25seSBjcmFzaGVkUHJlSVBDOiBib29sZWFuO1xuXHRcdFx0fVxuXG5cdFx0XHR0eXBlIEFwcFdpdGhOZXR3b3JrUHJvY2Vzc0V2ZW50cyA9IHR5cGVvZiBhcHAgJiB7XG5cdFx0XHRcdG9uKGV2ZW50OiAnbmV0d29yay1wcm9jZXNzLWxhdW5jaGVkJywgbGlzdGVuZXI6IChldmVudDogRWxlY3Ryb24uRXZlbnQsIGRldGFpbHM6IE5ldHdvcmtQcm9jZXNzTGF1bmNoZWREZXRhaWxzKSA9PiB2b2lkKTogdHlwZW9mIGFwcDtcblx0XHRcdFx0b24oZXZlbnQ6ICduZXR3b3JrLXByb2Nlc3MtZ29uZScsIGxpc3RlbmVyOiAoZXZlbnQ6IEVsZWN0cm9uLkV2ZW50LCBkZXRhaWxzOiBOZXR3b3JrUHJvY2Vzc0dvbmVEZXRhaWxzKSA9PiB2b2lkKTogdHlwZW9mIGFwcDtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGN1c3RvbUFwcCA9IGFwcCBhcyBBcHBXaXRoTmV0d29ya1Byb2Nlc3NFdmVudHM7XG5cblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRcdFx0dHlwZSBOZXR3b3JrUHJvY2Vzc0xhdW5jaGVkQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdFx0b3duZXI6ICdkZWVwYWsxNTU2Jztcblx0XHRcdFx0XHRjb21tZW50OiAnVHJhY2tzIG5ldHdvcmsgcHJvY2VzcyBsYXVuY2ggZXZlbnRzLic7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0dHlwZSBOZXR3b3JrUHJvY2Vzc0dvbmVDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0XHRleGl0Q29kZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSBleGl0IGNvZGUgb2YgdGhlIG5ldHdvcmsgcHJvY2Vzcy4nIH07XG5cdFx0XHRcdFx0Y3Jhc2hlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1doZXRoZXIgdGhlIG5ldHdvcmsgcHJvY2VzcyBjcmFzaGVkLicgfTtcblx0XHRcdFx0XHRjcmFzaGVkUHJlSVBDOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnV2hldGhlciB0aGUgbmV0d29yayBwcm9jZXNzIGNyYXNoZWQgYmVmb3JlIElQQyB3YXMgZXN0YWJsaXNoZWQuJyB9O1xuXHRcdFx0XHRcdG93bmVyOiAnZGVlcGFrMTU1Nic7XG5cdFx0XHRcdFx0Y29tbWVudDogJ1RyYWNrcyBuZXR3b3JrIHByb2Nlc3MgZ29uZSBldmVudHMgZm9yIHJlbGlhYmlsaXR5IGluc2lnaHRzLic7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXI8TmV0d29ya1Byb2Nlc3NMYXVuY2hlZERldGFpbHM+KGN1c3RvbUFwcCwgJ25ldHdvcmstcHJvY2Vzcy1sYXVuY2hlZCcsIChfZXZlbnQsIGRldGFpbHMpID0+IGRldGFpbHMpKGRldGFpbHMgPT4ge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBbbmV0d29yayBwcm9jZXNzXSBsYXVuY2hlZCB3aXRoIHBpZCAke2RldGFpbHMucGlkfWApO1xuXG5cdFx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHt9LCBOZXR3b3JrUHJvY2Vzc0xhdW5jaGVkQ2xhc3NpZmljYXRpb24+KCduZXR3b3JrUHJvY2Vzcy5sYXVuY2hlZCcsIHt9KTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyPE5ldHdvcmtQcm9jZXNzR29uZURldGFpbHM+KGN1c3RvbUFwcCwgJ25ldHdvcmstcHJvY2Vzcy1nb25lJywgKF9ldmVudCwgZGV0YWlscykgPT4gZGV0YWlscykoZGV0YWlscyA9PiB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFtuZXR3b3JrIHByb2Nlc3NdIGdvbmUgLSBwaWQ6ICR7ZGV0YWlscy5waWR9LCBleGl0Q29kZTogJHtkZXRhaWxzLmV4aXRDb2RlfSwgY3Jhc2hlZDogJHtkZXRhaWxzLmNyYXNoZWR9LCBjcmFzaGVkUHJlSVBDOiAke2RldGFpbHMuY3Jhc2hlZFByZUlQQ31gKTtcblxuXHRcdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7IGV4aXRDb2RlOiBudW1iZXI7IGNyYXNoZWQ6IGJvb2xlYW47IGNyYXNoZWRQcmVJUEM6IGJvb2xlYW4gfSwgTmV0d29ya1Byb2Nlc3NHb25lQ2xhc3NpZmljYXRpb24+KCduZXR3b3JrUHJvY2Vzcy5nb25lJywge1xuXHRcdFx0XHRcdFx0ZXhpdENvZGU6IGRldGFpbHMuZXhpdENvZGUsXG5cdFx0XHRcdFx0XHRjcmFzaGVkOiBkZXRhaWxzLmNyYXNoZWQsXG5cdFx0XHRcdFx0XHRjcmFzaGVkUHJlSVBDOiBkZXRhaWxzLmNyYXNoZWRQcmVJUENcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluc3RhbGxNdXRleCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3aW4zMk11dGV4TmFtZSA9IHRoaXMucHJvZHVjdFNlcnZpY2Uud2luMzJNdXRleE5hbWU7XG5cdFx0aWYgKGlzV2luZG93cyAmJiB3aW4zMk11dGV4TmFtZSAmJiBpc0lubm9TZXR1cEluc3RhbGwoKSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgV2luZG93c011dGV4ID0gYXdhaXQgaW1wb3J0KCdAdnNjb2RlL3dpbmRvd3MtbXV0ZXgnKTtcblx0XHRcdFx0Y29uc3QgbXV0ZXggPSBuZXcgV2luZG93c011dGV4Lk11dGV4KHdpbjMyTXV0ZXhOYW1lKTtcblx0XHRcdFx0RXZlbnQub25jZSh0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLm9uV2lsbFNodXRkb3duKSgoKSA9PiBtdXRleC5yZWxlYXNlKCkpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVTaGVsbEVudmlyb25tZW50KGFyZ3M6IE5hdGl2ZVBhcnNlZEFyZ3MsIGVudjogSVByb2Nlc3NFbnZpcm9ubWVudCwgbm90aWZ5T25FcnJvcjogYm9vbGVhbik6IFByb21pc2U8dHlwZW9mIHByb2Nlc3MuZW52PiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBnZXRSZXNvbHZlZFNoZWxsRW52KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMubG9nU2VydmljZSwgYXJncywgZW52KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gdG9FcnJvck1lc3NhZ2UoZXJyb3IpO1xuXHRcdFx0aWYgKG5vdGlmeU9uRXJyb3IpIHtcblx0XHRcdFx0dGhpcy53aW5kb3dzTWFpblNlcnZpY2U/LnNlbmRUb0ZvY3VzZWQoJ3ZzY29kZTpzaG93UmVzb2x2ZVNoZWxsRW52RXJyb3InLCBlcnJvck1lc3NhZ2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yTWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVDcmFzaFJlcG9ydGVyRW5hYmxlbWVudCgpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIElmIGVuYWJsZS1jcmFzaC1yZXBvcnRlciBhcmd2IGlzIHVuZGVmaW5lZCB0aGVuIHRoaXMgaXMgYSBmcmVzaCBzdGFydCxcblx0XHQvLyBiYXNlZCBvbiBgdGVsZW1ldHJ5LmVuYWJsZUNyYXNocmVwb3J0ZXJgIHNldHRpbmdzLCBnZW5lcmF0ZSBhIFVVSUQgd2hpY2hcblx0XHQvLyB3aWxsIGJlIHVzZWQgYXMgY3Jhc2ggcmVwb3J0ZXIgaWQgYW5kIGFsc28gdXBkYXRlIHRoZSBqc29uIGZpbGUuXG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYXJndkNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmd2UmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgYXJndlN0cmluZyA9IGFyZ3ZDb250ZW50LnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBhcmd2SlNPTiA9IHBhcnNlPHsgJ2VuYWJsZS1jcmFzaC1yZXBvcnRlcic/OiBib29sZWFuIH0+KGFyZ3ZTdHJpbmcpO1xuXHRcdFx0Y29uc3QgdGVsZW1ldHJ5TGV2ZWwgPSBnZXRUZWxlbWV0cnlMZXZlbCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGVuYWJsZUNyYXNoUmVwb3J0ZXIgPSB0ZWxlbWV0cnlMZXZlbCA+PSBUZWxlbWV0cnlMZXZlbC5DUkFTSDtcblxuXHRcdFx0Ly8gSW5pdGlhbCBzdGFydHVwXG5cdFx0XHRpZiAoYXJndkpTT05bJ2VuYWJsZS1jcmFzaC1yZXBvcnRlciddID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgYWRkaXRpb25hbEFyZ3ZDb250ZW50ID0gW1xuXHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdCdcdC8vIEFsbG93cyB0byBkaXNhYmxlIGNyYXNoIHJlcG9ydGluZy4nLFxuXHRcdFx0XHRcdCdcdC8vIFNob3VsZCByZXN0YXJ0IHRoZSBhcHAgaWYgdGhlIHZhbHVlIGlzIGNoYW5nZWQuJyxcblx0XHRcdFx0XHRgXHRcImVuYWJsZS1jcmFzaC1yZXBvcnRlclwiOiAke2VuYWJsZUNyYXNoUmVwb3J0ZXJ9LGAsXG5cdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0J1x0Ly8gVW5pcXVlIGlkIHVzZWQgZm9yIGNvcnJlbGF0aW5nIGNyYXNoIHJlcG9ydHMgc2VudCBmcm9tIHRoaXMgaW5zdGFuY2UuJyxcblx0XHRcdFx0XHQnXHQvLyBEbyBub3QgZWRpdCB0aGlzIHZhbHVlLicsXG5cdFx0XHRcdFx0YFx0XCJjcmFzaC1yZXBvcnRlci1pZFwiOiBcIiR7Z2VuZXJhdGVVdWlkKCl9XCJgLFxuXHRcdFx0XHRcdCd9J1xuXHRcdFx0XHRdO1xuXHRcdFx0XHRjb25zdCBuZXdBcmd2U3RyaW5nID0gYXJndlN0cmluZy5zdWJzdHJpbmcoMCwgYXJndlN0cmluZy5sZW5ndGggLSAyKS5jb25jYXQoJyxcXG4nLCBhZGRpdGlvbmFsQXJndkNvbnRlbnQuam9pbignXFxuJykpO1xuXG5cdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmd2UmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3QXJndlN0cmluZykpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTdWJzZXF1ZW50IHN0YXJ0dXA6IHVwZGF0ZSBjcmFzaCByZXBvcnRlciB2YWx1ZSBpZiBjaGFuZ2VkXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Y29uc3QgbmV3QXJndlN0cmluZyA9IGFyZ3ZTdHJpbmcucmVwbGFjZSgvXCJlbmFibGUtY3Jhc2gtcmVwb3J0ZXJcIjogLiosLywgYFwiZW5hYmxlLWNyYXNoLXJlcG9ydGVyXCI6ICR7ZW5hYmxlQ3Jhc2hSZXBvcnRlcn0sYCk7XG5cdFx0XHRcdGlmIChuZXdBcmd2U3RyaW5nICE9PSBhcmd2U3RyaW5nKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUodGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFyZ3ZSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdBcmd2U3RyaW5nKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblxuXHRcdFx0Ly8gSW5mb3JtIHRoZSB1c2VyIHZpYSBub3RpZmljYXRpb25cblx0XHRcdHRoaXMud2luZG93c01haW5TZXJ2aWNlPy5zZW5kVG9Gb2N1c2VkKCd2c2NvZGU6c2hvd0FyZ3ZQYXJzZVdhcm5pbmcnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGV2ZW50dWFsbHlBZnRlcldpbmRvd09wZW4oaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IHZvaWQge1xuXG5cdFx0Ly8gVmFsaWRhdGUgRGV2aWNlIElEIGlzIHVwIHRvIGRhdGUgKGRlbGF5IHRoaXMgYXMgaXQgaGFzIHNob3duIHNpZ25pZmljYW50IHBlcmYgaW1wYWN0KVxuXHRcdC8vIFJlZnM6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMzQwNjRcblx0XHR2YWxpZGF0ZURldkRldmljZUlkKHRoaXMuc3RhdGVTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0XHRpZiAodGVsZW1ldHJ5U2VydmljZS50ZWxlbWV0cnlMZXZlbCA8IFRlbGVtZXRyeUxldmVsLlVTQUdFKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmF0aXZlSG9zdE1haW5TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOYXRpdmVIb3N0TWFpblNlcnZpY2UpO1xuXHRcdFx0dm9pZCB0aGlzLmxvZ09TUHJveHlDb25maWdUZWxlbWV0cnkobmF0aXZlSG9zdE1haW5TZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9nT1NQcm94eUNvbmZpZ1RlbGVtZXRyeShuYXRpdmVIb3N0TWFpblNlcnZpY2U6IElOYXRpdmVIb3N0TWFpblNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29uZmlnID0gYXdhaXQgbmF0aXZlSG9zdE1haW5TZXJ2aWNlLnJlYWRQcm94eUNvbmZpZ1dpdGhQYWNrYWdlKHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBkdXJhdGlvbk1zID0gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZTtcblx0XHRcdGNvbnN0IHBhY1NjcmlwdFN0YXRzID0gY29uZmlnLnBhYyA/IGdldFBBQ1NjcmlwdFN0YXRzKGNvbmZpZy5wYWMuY29udGVudCkgOiB1bmRlZmluZWQ7XG5cdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8T1NQcm94eUNvbmZpZ0V2ZW50LCBPU1Byb3h5Q29uZmlnQ2xhc3NpZmljYXRpb24+KCdvc1Byb3h5Q29uZmlnJywge1xuXHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRkdXJhdGlvbk1zLFxuXHRcdFx0XHRwbGF0Zm9ybUtpbmQ6IGNvbmZpZy5wbGF0Zm9ybT8ua2luZCA/PyAnbm9uZScsXG5cdFx0XHRcdGF1dG9EZXRlY3Q6IGNvbmZpZy5hdXRvRGV0ZWN0LFxuXHRcdFx0XHRodHRwUHJveHlFbnZpcm9ubWVudFN0YXRlOiBnZXRPU1Byb3h5RW52aXJvbm1lbnRTdGF0ZShjb25maWcuZW52aXJvbm1lbnQuaHR0cFByb3h5KSxcblx0XHRcdFx0aHR0cHNQcm94eUVudmlyb25tZW50U3RhdGU6IGdldE9TUHJveHlFbnZpcm9ubWVudFN0YXRlKGNvbmZpZy5lbnZpcm9ubWVudC5odHRwc1Byb3h5KSxcblx0XHRcdFx0YWxsUHJveHlFbnZpcm9ubWVudFN0YXRlOiBnZXRPU1Byb3h5RW52aXJvbm1lbnRTdGF0ZShjb25maWcuZW52aXJvbm1lbnQuYWxsUHJveHkpLFxuXHRcdFx0XHRub1Byb3h5RW52aXJvbm1lbnRTdGF0ZTogZ2V0T1NQcm94eUVudmlyb25tZW50U3RhdGUoY29uZmlnLmVudmlyb25tZW50Lm5vUHJveHkpLFxuXHRcdFx0XHR3cGFkRGhjcFN0YXRlOiBjb25maWcud3BhZERoY3Auc3RhdGUsXG5cdFx0XHRcdHdwYWREbnNTdGF0ZTogY29uZmlnLndwYWREbnMuc3RhdGUsXG5cdFx0XHRcdGNvbmZpZ3VyZWRQYWNTdGF0ZTogY29uZmlnLmNvbmZpZ3VyZWRQYWMuc3RhdGUsXG5cdFx0XHRcdGhhc0NvbmZpZ3VyZWRQYWM6ICEhY29uZmlnLnBhY1VybCxcblx0XHRcdFx0aGFzTG9hZGVkUGFjOiAhIWNvbmZpZy5wYWMsXG5cdFx0XHRcdHBhY1NvdXJjZTogY29uZmlnLnBhYz8uc291cmNlID8/ICdub25lJyxcblx0XHRcdFx0cGFjU2NyaXB0Q2hhcmFjdGVyQ291bnQ6IHBhY1NjcmlwdFN0YXRzPy5jaGFyYWN0ZXJDb3VudCxcblx0XHRcdFx0cGFjU2NyaXB0TGluZUNvdW50OiBwYWNTY3JpcHRTdGF0cz8ubGluZUNvdW50LFxuXHRcdFx0XHRwYWNTY3JpcHRSZXR1cm5Db3VudDogcGFjU2NyaXB0U3RhdHM/LnJldHVybkNvdW50LFxuXHRcdFx0XHRoYXNIdHRwUHJveHk6ICEhY29uZmlnLnN0YXRpY1J1bGVzPy5odHRwLFxuXHRcdFx0XHRoYXNIdHRwc1Byb3h5OiAhIWNvbmZpZy5zdGF0aWNSdWxlcz8uaHR0cHMsXG5cdFx0XHRcdGhhc1NvY2tzUHJveHk6ICEhY29uZmlnLnN0YXRpY1J1bGVzPy5zb2Nrcyxcblx0XHRcdFx0aGFzQnlwYXNzUnVsZXM6IGhhc09TUHJveHlCeXBhc3NSdWxlcyhjb25maWcpLFxuXHRcdFx0XHRleGNsdWRlU2ltcGxlSG9zdG5hbWVzOiBjb25maWcucGxhdGZvcm0/LmtpbmQgPT09ICdtYWNvcycgPyBjb25maWcucGxhdGZvcm0uZXhjbHVkZVNpbXBsZUhvc3RuYW1lcyA6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPE9TUHJveHlDb25maWdFdmVudCwgT1NQcm94eUNvbmZpZ0NsYXNzaWZpY2F0aW9uPignb3NQcm94eUNvbmZpZycsIHtcblx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdGR1cmF0aW9uTXM6IERhdGUubm93KCkgLSBzdGFydFRpbWUsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gaGFzT1NQcm94eUJ5cGFzc1J1bGVzKGNvbmZpZzogSU9TUHJveHlDb25maWcpOiBib29sZWFuIHtcblx0c3dpdGNoIChjb25maWcucGxhdGZvcm0/LmtpbmQpIHtcblx0XHRjYXNlICd3aW5kb3dzJzogcmV0dXJuICEhY29uZmlnLnBsYXRmb3JtLnByb3h5QnlwYXNzO1xuXHRcdGNhc2UgJ21hY29zJzogcmV0dXJuIGNvbmZpZy5wbGF0Zm9ybS5leGNsdWRlU2ltcGxlSG9zdG5hbWVzIHx8IGNvbmZpZy5wbGF0Zm9ybS5leGNlcHRpb25zLmxlbmd0aCA+IDA7XG5cdFx0Y2FzZSAnbGludXgnOiByZXR1cm4gY29uZmlnLnBsYXRmb3JtLmlnbm9yZUhvc3RzLmxlbmd0aCA+IDA7XG5cdFx0ZGVmYXVsdDogcmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldE9TUHJveHlFbnZpcm9ubWVudFN0YXRlKHN0YXR1czogSU9TUHJveHlDb25maWdbJ2Vudmlyb25tZW50J11bJ2h0dHBQcm94eSddKTogJ3Vuc2V0JyB8ICdjb25maWd1cmVkJyB8ICdpbnZhbGlkJyB7XG5cdHJldHVybiBzdGF0dXMgPyBzdGF0dXMuZXJyb3IgPyAnaW52YWxpZCcgOiAnY29uZmlndXJlZCcgOiAndW5zZXQnO1xufVxuXG5mdW5jdGlvbiBnZXRQQUNTY3JpcHRTdGF0cyhjb250ZW50OiBzdHJpbmcpOiB7IGNoYXJhY3RlckNvdW50OiBudW1iZXI7IGxpbmVDb3VudDogbnVtYmVyOyByZXR1cm5Db3VudDogbnVtYmVyIH0ge1xuXHRyZXR1cm4ge1xuXHRcdGNoYXJhY3RlckNvdW50OiBjb250ZW50Lmxlbmd0aCxcblx0XHRsaW5lQ291bnQ6IGNvbnRlbnQubGVuZ3RoID09PSAwID8gMCA6IGNvbnRlbnQuc3BsaXQoL1xcclxcbnxcXHJ8XFxuLykubGVuZ3RoLFxuXHRcdHJldHVybkNvdW50OiBjb250ZW50Lm1hdGNoKC9cXGJyZXR1cm5cXGIvZyk/Lmxlbmd0aCA/PyAwLFxuXHR9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLEtBQUssZUFBZSxpQkFBMEIsZ0JBQWtDLGNBQWMsVUFBVSxVQUFVLGdCQUFnQixTQUFrQix5QkFBdUM7QUFDcE0sU0FBUyx1QkFBdUIsb0NBQW9DO0FBQ3BFLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsVUFBVSxlQUFlO0FBQ2xDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JB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
