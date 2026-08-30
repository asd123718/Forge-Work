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
import "./media/window.css";
import { localize } from "../../nls.js";
import { URI } from "../../base/common/uri.js";
import { equals } from "../../base/common/objects.js";
import { EventType, EventHelper, addDisposableListener, ModifierKeyEmitter, getActiveElement, hasWindow, getWindowById, getWindows, $ } from "../../base/browser/dom.js";
import { Action, Separator } from "../../base/common/actions.js";
import { IFileService } from "../../platform/files/common/files.js";
import { EditorResourceAccessor, SideBySideEditor, pathsToEditors, isResourceEditorInput } from "../common/editor.js";
import { IEditorService } from "../services/editor/common/editorService.js";
import { ITelemetryService } from "../../platform/telemetry/common/telemetry.js";
import { WindowMinimumSize, hasNativeTitlebar } from "../../platform/window/common/window.js";
import { ITitleService } from "../services/title/browser/titleService.js";
import { IWorkbenchThemeService } from "../services/themes/common/workbenchThemeService.js";
import { ApplyZoomTarget, applyZoom } from "../../platform/window/electron-browser/window.js";
import { setFullscreen, getZoomLevel, onDidChangeZoomLevel, getZoomFactor } from "../../base/browser/browser.js";
import { ICommandService, CommandsRegistry } from "../../platform/commands/common/commands.js";
import { ipcRenderer, process } from "../../base/parts/sandbox/electron-browser/globals.js";
import { IWorkspaceEditingService } from "../services/workspaces/common/workspaceEditing.js";
import { IMenuService, MenuId, MenuItemAction, MenuRegistry } from "../../platform/actions/common/actions.js";
import { getFlatActionBarActions } from "../../platform/actions/browser/menuEntryActionViewItem.js";
import { RunOnceScheduler } from "../../base/common/async.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../base/common/lifecycle.js";
import { LifecyclePhase, ILifecycleService, ShutdownReason } from "../services/lifecycle/common/lifecycle.js";
import { IIntegrityService } from "../services/integrity/common/integrity.js";
import { isWindows, isMacintosh } from "../../base/common/platform.js";
import { IProductService } from "../../platform/product/common/productService.js";
import { INotificationService, NeverShowAgainScope, NotificationPriority, Severity } from "../../platform/notification/common/notification.js";
import { IKeybindingService } from "../../platform/keybinding/common/keybinding.js";
import { INativeWorkbenchEnvironmentService } from "../services/environment/electron-browser/environmentService.js";
import { IAccessibilityService, AccessibilitySupport } from "../../platform/accessibility/common/accessibility.js";
import { WorkbenchState, IWorkspaceContextService } from "../../platform/workspace/common/workspace.js";
import { coalesce } from "../../base/common/arrays.js";
import { ConfigurationTarget, IConfigurationService } from "../../platform/configuration/common/configuration.js";
import { IStorageService, StorageScope, StorageTarget } from "../../platform/storage/common/storage.js";
import { IOpenerService } from "../../platform/opener/common/opener.js";
import { Schemas } from "../../base/common/network.js";
import { INativeHostService } from "../../platform/native/common/native.js";
import { posix } from "../../base/common/path.js";
import { ITunnelService, extractLocalHostUriMetaDataForPortMapping, extractQueryLocalHostUriMetaDataForPortMapping } from "../../platform/tunnel/common/tunnel.js";
import { IWorkbenchLayoutService, positionFromString, Position } from "../services/layout/browser/layoutService.js";
import { IWorkingCopyService } from "../services/workingCopy/common/workingCopyService.js";
import { WorkingCopyCapabilities } from "../services/workingCopy/common/workingCopy.js";
import { IFilesConfigurationService } from "../services/filesConfiguration/common/filesConfigurationService.js";
import { Event } from "../../base/common/event.js";
import { IRemoteAuthorityResolverService } from "../../platform/remote/common/remoteAuthorityResolver.js";
import { IEditorGroupsService } from "../services/editor/common/editorGroupsService.js";
import { IDialogService } from "../../platform/dialogs/common/dialogs.js";
import { ILogService } from "../../platform/log/common/log.js";
import { IInstantiationService } from "../../platform/instantiation/common/instantiation.js";
import { whenEditorClosed } from "../browser/editor.js";
import { ISharedProcessService } from "../../platform/ipc/electron-browser/services.js";
import { IProgressService, ProgressLocation } from "../../platform/progress/common/progress.js";
import { toErrorMessage } from "../../base/common/errorMessage.js";
import { ILabelService } from "../../platform/label/common/label.js";
import { dirname } from "../../base/common/resources.js";
import { IBannerService } from "../services/banner/browser/bannerService.js";
import { Codicon } from "../../base/common/codicons.js";
import { IUriIdentityService } from "../../platform/uriIdentity/common/uriIdentity.js";
import { IPreferencesService } from "../services/preferences/common/preferences.js";
import { IUtilityProcessWorkerWorkbenchService } from "../services/utilityProcess/electron-browser/utilityProcessWorkerWorkbenchService.js";
import { registerWindowDriver } from "../services/driver/browser/driver.js";
import { mainWindow } from "../../base/browser/window.js";
import { BaseWindow } from "../browser/window.js";
import { IHostService } from "../services/host/browser/host.js";
import { IStatusbarService, ShowTooltipCommand, StatusbarAlignment } from "../services/statusbar/browser/statusbar.js";
import { ActionBar } from "../../base/browser/ui/actionbar/actionbar.js";
import { ThemeIcon } from "../../base/common/themables.js";
import { getWorkbenchContribution } from "../common/contributions.js";
import { DynamicWorkbenchSecurityConfiguration } from "../common/configuration.js";
import { nativeHoverDelegate } from "../../platform/hover/browser/hover.js";
import { WINDOW_ACTIVE_BORDER, WINDOW_INACTIVE_BORDER } from "../common/theme.js";
import { IContextMenuService } from "../../platform/contextview/browser/contextView.js";
let NativeWindow = class extends BaseWindow {
  constructor(editorService, editorGroupService, configurationService, titleService, themeService, notificationService, commandService, keybindingService, telemetryService, workspaceEditingService, fileService, menuService, lifecycleService, integrityService, nativeEnvironmentService, accessibilityService, contextService, openerService, nativeHostService, tunnelService, layoutService, workingCopyService, filesConfigurationService, productService, remoteAuthorityResolverService, dialogService, storageService, logService, instantiationService, sharedProcessService, progressService, labelService, bannerService, uriIdentityService, preferencesService, utilityProcessWorkerWorkbenchService, hostService, contextMenuService) {
    super(mainWindow, void 0, hostService, nativeEnvironmentService, contextMenuService, layoutService);
    this.editorService = editorService;
    this.editorGroupService = editorGroupService;
    this.configurationService = configurationService;
    this.titleService = titleService;
    this.themeService = themeService;
    this.notificationService = notificationService;
    this.commandService = commandService;
    this.keybindingService = keybindingService;
    this.telemetryService = telemetryService;
    this.workspaceEditingService = workspaceEditingService;
    this.fileService = fileService;
    this.menuService = menuService;
    this.lifecycleService = lifecycleService;
    this.integrityService = integrityService;
    this.nativeEnvironmentService = nativeEnvironmentService;
    this.accessibilityService = accessibilityService;
    this.contextService = contextService;
    this.openerService = openerService;
    this.nativeHostService = nativeHostService;
    this.tunnelService = tunnelService;
    this.workingCopyService = workingCopyService;
    this.filesConfigurationService = filesConfigurationService;
    this.productService = productService;
    this.remoteAuthorityResolverService = remoteAuthorityResolverService;
    this.dialogService = dialogService;
    this.storageService = storageService;
    this.logService = logService;
    this.instantiationService = instantiationService;
    this.sharedProcessService = sharedProcessService;
    this.progressService = progressService;
    this.labelService = labelService;
    this.bannerService = bannerService;
    this.uriIdentityService = uriIdentityService;
    this.preferencesService = preferencesService;
    this.utilityProcessWorkerWorkbenchService = utilityProcessWorkerWorkbenchService;
    this.customTitleContextMenuDisposable = this._register(new DisposableStore());
    this.addRemoveFoldersScheduler = this._register(new RunOnceScheduler(() => this.doAddRemoveFolders(), 100));
    this.pendingFoldersToAdd = [];
    this.pendingFoldersToRemove = [];
    this.isDocumentedEdited = false;
    this.touchBarDisposables = this._register(new DisposableStore());
    //#region Window Zoom
    this.mapWindowIdToZoomStatusEntry = /* @__PURE__ */ new Map();
    this.configuredWindowZoomLevel = this.resolveConfiguredWindowZoomLevel();
    this.registerListeners();
    this.create();
  }
  registerListeners() {
    this._register(addDisposableListener(mainWindow, EventType.RESIZE, () => this.layoutService.layout()));
    this._register(this.editorService.onDidActiveEditorChange(() => this.updateTouchbarMenu()));
    for (const event of [EventType.DRAG_OVER, EventType.DROP]) {
      this._register(addDisposableListener(mainWindow.document.body, event, (e) => {
        EventHelper.stop(e);
      }));
    }
    ipcRenderer.on("vscode:runAction", async (event, ...argsRaw) => {
      const request = argsRaw[0];
      const args = request.args || [];
      if (request.from === "touchbar") {
        const activeEditor = this.editorService.activeEditor;
        if (activeEditor) {
          const resource = EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
          if (resource) {
            args.push(resource);
          }
        }
      } else if (request.from === "systemWideKeybinding") {
      } else {
        args.push({ from: request.from });
      }
      try {
        await this.commandService.executeCommand(request.id, ...args);
        this.telemetryService.publicLog2("workbenchActionExecuted", { id: request.id, from: request.from });
      } catch (error) {
        this.notificationService.error(error);
      }
    });
    ipcRenderer.on("vscode:runKeybinding", (event, ...argsRaw) => {
      const request = argsRaw[0];
      const activeElement = getActiveElement();
      if (activeElement) {
        this.keybindingService.dispatchByUserSettingsLabel(request.userSettingsLabel, activeElement);
      }
    });
    ipcRenderer.on("vscode:reportSharedProcessCrash", (event, ...argsRaw) => {
      this.notificationService.prompt(
        Severity.Error,
        localize("sharedProcessCrash", "A shared background process terminated unexpectedly. Please restart the application to recover."),
        [{
          label: localize("restart", "Restart"),
          run: () => this.nativeHostService.relaunch()
        }],
        {
          priority: NotificationPriority.URGENT
        }
      );
    });
    ipcRenderer.on("vscode:openFiles", (event, ...argsRaw) => {
      this.onOpenFiles(argsRaw[0]);
    });
    ipcRenderer.on("vscode:addRemoveFolders", (event, ...argsRaw) => this.onAddRemoveFoldersRequest(argsRaw[0]));
    ipcRenderer.on("vscode:showInfoMessage", (event, ...argsRaw) => this.notificationService.info(argsRaw[0]));
    ipcRenderer.on("vscode:showResolveShellEnvError", (event, ...argsRaw) => {
      const message = argsRaw[0];
      this.notificationService.prompt(
        Severity.Error,
        message,
        [
          {
            label: localize("restart", "Restart"),
            run: () => this.nativeHostService.relaunch()
          },
          {
            label: localize("configure", "Configure"),
            run: () => this.preferencesService.openUserSettings({ query: "application.shellEnvironmentResolutionTimeout" })
          },
          {
            label: localize("learnMore", "Learn More"),
            run: () => this.openerService.open("https://go.microsoft.com/fwlink/?linkid=2149667")
          }
        ]
      );
    });
    ipcRenderer.on("vscode:showCredentialsError", (event, ...argsRaw) => {
      const message = argsRaw[0];
      this.notificationService.prompt(
        Severity.Error,
        localize("keychainWriteError", "Writing login information to the keychain failed with error '{0}'.", message),
        [{
          label: localize("troubleshooting", "Troubleshooting Guide"),
          run: () => this.openerService.open("https://go.microsoft.com/fwlink/?linkid=2190713")
        }]
      );
    });
    ipcRenderer.on("vscode:showTranslatedBuildWarning", () => {
      this.notificationService.prompt(
        Severity.Warning,
        localize("runningTranslated", "You are running an emulated version of {0}. For better performance download the native arm64 version of {0} build for your machine.", this.productService.nameLong),
        [{
          label: localize("downloadArmBuild", "Download"),
          run: () => {
            const quality = this.productService.quality;
            const stableURL = "https://code.visualstudio.com/docs/?dv=osx";
            const insidersURL = "https://code.visualstudio.com/docs/?dv=osx&build=insiders";
            this.openerService.open(quality === "stable" ? stableURL : insidersURL);
          }
        }],
        {
          priority: NotificationPriority.URGENT
        }
      );
    });
    ipcRenderer.on("vscode:showArgvParseWarning", () => {
      this.notificationService.prompt(
        Severity.Warning,
        localize("showArgvParseWarning", "The runtime arguments file 'argv.json' contains errors. Please correct them and restart."),
        [{
          label: localize("showArgvParseWarningAction", "Open File"),
          run: () => this.editorService.openEditor({ resource: this.nativeEnvironmentService.argvResource })
        }],
        {
          priority: NotificationPriority.URGENT
        }
      );
    });
    ipcRenderer.on("vscode:enterFullScreen", () => setFullscreen(true, mainWindow));
    ipcRenderer.on("vscode:leaveFullScreen", () => setFullscreen(false, mainWindow));
    ipcRenderer.on("vscode:openProxyAuthenticationDialog", async (event, ...argsRaw) => {
      const payload = argsRaw[0];
      const rememberCredentialsKey = "window.rememberProxyCredentials";
      const rememberCredentials = this.storageService.getBoolean(rememberCredentialsKey, StorageScope.APPLICATION);
      const result = await this.dialogService.input({
        type: "warning",
        message: localize("proxyAuthRequired", "Proxy Authentication Required"),
        primaryButton: localize({ key: "loginButton", comment: ["&& denotes a mnemonic"] }, "&&Log In"),
        inputs: [
          { placeholder: localize("username", "Username"), value: payload.username },
          { placeholder: localize("password", "Password"), type: "password", value: payload.password }
        ],
        detail: localize("proxyDetail", "The proxy {0} requires a username and password.", `${payload.authInfo.host}:${payload.authInfo.port}`),
        checkbox: {
          label: localize("rememberCredentials", "Remember my credentials"),
          checked: rememberCredentials
        }
      });
      if (!result.confirmed || !result.values) {
        ipcRenderer.send(payload.replyChannel);
      } else {
        if (result.checkboxChecked) {
          this.storageService.store(rememberCredentialsKey, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
        } else {
          this.storageService.remove(rememberCredentialsKey, StorageScope.APPLICATION);
        }
        const [username, password] = result.values;
        ipcRenderer.send(payload.replyChannel, { username, password, remember: !!result.checkboxChecked });
      }
    });
    ipcRenderer.on("vscode:accessibilitySupportChanged", (event, ...argsRaw) => {
      const accessibilitySupportEnabled = argsRaw[0];
      this.accessibilityService.setAccessibilitySupport(accessibilitySupportEnabled ? AccessibilitySupport.Enabled : AccessibilitySupport.Disabled);
    });
    ipcRenderer.on("vscode:configureAllowedUNCHost", async (event, ...argsRaw) => {
      const host = argsRaw[0];
      if (!isWindows) {
        return;
      }
      const allowedUncHosts = /* @__PURE__ */ new Set();
      const configuredAllowedUncHosts = this.configurationService.getValue("security.allowedUNCHosts") ?? [];
      if (Array.isArray(configuredAllowedUncHosts)) {
        for (const configuredAllowedUncHost of configuredAllowedUncHosts) {
          if (typeof configuredAllowedUncHost === "string") {
            allowedUncHosts.add(configuredAllowedUncHost);
          }
        }
      }
      if (!allowedUncHosts.has(host)) {
        allowedUncHosts.add(host);
        await getWorkbenchContribution(DynamicWorkbenchSecurityConfiguration.ID).ready;
        this.configurationService.updateValue("security.allowedUNCHosts", [...allowedUncHosts.values()], ConfigurationTarget.USER);
      }
    });
    ipcRenderer.on("vscode:disablePromptForProtocolHandling", (event, ...argsRaw) => {
      const kind = argsRaw[0];
      const setting = kind === "local" ? "security.promptForLocalFileProtocolHandling" : "security.promptForRemoteFileProtocolHandling";
      this.configurationService.updateValue(setting, false);
    });
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("window.zoomLevel") || e.affectsConfiguration("window.zoomPerWindow") && this.configurationService.getValue("window.zoomPerWindow") === false) {
        this.onDidChangeConfiguredWindowZoomLevel();
      } else if (e.affectsConfiguration("keyboard.touchbar.enabled") || e.affectsConfiguration("keyboard.touchbar.ignored")) {
        this.updateTouchbarMenu();
      } else if (e.affectsConfiguration("window.border")) {
        this.updateWindowBorder();
      }
    }));
    this._register(onDidChangeZoomLevel((targetWindowId) => this.handleOnDidChangeZoomLevel(targetWindowId)));
    for (const part of this.editorGroupService.parts) {
      this.createWindowZoomStatusEntry(part);
    }
    this._register(this.editorGroupService.onDidCreateAuxiliaryEditorPart((part) => this.createWindowZoomStatusEntry(part)));
    this._register(Event.debounce(this.editorService.onDidVisibleEditorsChange, () => void 0, 0, void 0, void 0, void 0, this._store)(() => this.maybeCloseWindow()));
    const filesToWait = this.nativeEnvironmentService.filesToWait;
    if (filesToWait) {
      this.trackClosedWaitFiles(filesToWait.waitMarkerFileUri, coalesce(filesToWait.paths.map((path) => path.fileUri)));
    }
    if (isMacintosh) {
      for (const part of this.editorGroupService.parts) {
        this.handleRepresentedFilename(part);
      }
      this._register(this.editorGroupService.onDidCreateAuxiliaryEditorPart((part) => this.handleRepresentedFilename(part)));
    }
    this._register(this.workingCopyService.onDidChangeDirty((workingCopy) => {
      const gotDirty = workingCopy.isDirty();
      if (gotDirty && !(workingCopy.capabilities & WorkingCopyCapabilities.Untitled) && this.filesConfigurationService.hasShortAutoSaveDelay(workingCopy.resource)) {
        return;
      }
      this.updateDocumentEdited(gotDirty ? true : void 0);
    }));
    this.updateDocumentEdited(void 0);
    this._register(Event.any(
      Event.map(Event.filter(this.nativeHostService.onDidMaximizeWindow, (windowId) => !!hasWindow(windowId)), (windowId) => ({ maximized: true, windowId })),
      Event.map(Event.filter(this.nativeHostService.onDidUnmaximizeWindow, (windowId) => !!hasWindow(windowId)), (windowId) => ({ maximized: false, windowId }))
    )((e) => this.layoutService.updateWindowMaximizedState(getWindowById(e.windowId).window, e.maximized)));
    this.layoutService.updateWindowMaximizedState(mainWindow, this.nativeEnvironmentService.window.maximized ?? false);
    this._register(this.layoutService.onDidChangePanelPosition((pos) => this.onDidChangePanelPosition(positionFromString(pos))));
    this.onDidChangePanelPosition(this.layoutService.getPanelPosition());
    this._register(this.themeService.onDidColorThemeChange(() => this.updateWindowBorder()));
    this._register(this.hostService.onDidChangeActiveWindow(() => this.updateWindowBorder()));
    this._register(this.hostService.onDidChangeFocus(() => this.updateWindowBorder()));
    this._register(this.lifecycleService.onBeforeShutdown((e) => this.onBeforeShutdown(e)));
    this._register(this.lifecycleService.onBeforeShutdownError((e) => this.onBeforeShutdownError(e)));
    this._register(this.lifecycleService.onWillShutdown((e) => this.onWillShutdown(e)));
  }
  handleRepresentedFilename(part) {
    const disposables = new DisposableStore();
    Event.once(part.onWillDispose)(() => disposables.dispose());
    this.editorGroupService.getScopedInstantiationService(part).invokeFunction((accessor) => {
      const editorService = accessor.get(IEditorService);
      disposables.add(editorService.onDidActiveEditorChange(() => this.updateRepresentedFilename(editorService, part.windowId)));
    });
  }
  updateRepresentedFilename(editorService, targetWindowId) {
    const file = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY, filterByScheme: Schemas.file });
    this.nativeHostService.setRepresentedFilename(file?.fsPath ?? "", { targetWindowId });
    if (targetWindowId === mainWindow.vscodeWindowId) {
      this.provideCustomTitleContextMenu(file?.fsPath);
    }
  }
  //#region Window Lifecycle
  onBeforeShutdown({ veto, reason }) {
    if (reason === ShutdownReason.CLOSE) {
      const confirmBeforeCloseSetting = this.configurationService.getValue("window.confirmBeforeClose");
      const confirmBeforeClose = confirmBeforeCloseSetting === "always" || confirmBeforeCloseSetting === "keyboardOnly" && ModifierKeyEmitter.getInstance().isModifierPressed;
      if (confirmBeforeClose) {
        return veto((async () => {
          let actualReason = reason;
          if (reason === ShutdownReason.CLOSE && !isMacintosh) {
            const windowCount = await this.nativeHostService.getWindowCount();
            if (windowCount === 1) {
              actualReason = ShutdownReason.QUIT;
            }
          }
          let confirmed = true;
          if (confirmBeforeClose) {
            confirmed = await this.instantiationService.invokeFunction((accessor) => NativeWindow.confirmOnShutdown(accessor, actualReason));
          }
          if (confirmed) {
            this.progressOnBeforeShutdown(reason);
          }
          return !confirmed;
        })(), "veto.confirmBeforeClose");
      }
    }
    this.progressOnBeforeShutdown(reason);
  }
  progressOnBeforeShutdown(reason) {
    this.progressService.withProgress({
      location: ProgressLocation.Window,
      // use window progress to not be too annoying about this operation
      delay: 800,
      // delay so that it only appears when operation takes a long time
      title: this.toShutdownLabel(reason, false)
    }, () => {
      return Event.toPromise(Event.any(
        this.lifecycleService.onWillShutdown,
        // dismiss this dialog when we shutdown
        this.lifecycleService.onShutdownVeto,
        // or when shutdown was vetoed
        this.dialogService.onWillShowDialog
        // or when a dialog asks for input
      ));
    });
  }
  onBeforeShutdownError({ error, reason }) {
    this.dialogService.error(this.toShutdownLabel(reason, true), localize("shutdownErrorDetail", "Error: {0}", toErrorMessage(error)));
  }
  onWillShutdown({ reason, force, joiners }) {
    const shutdownDialogScheduler = new RunOnceScheduler(() => {
      const pendingJoiners = joiners();
      this.progressService.withProgress({
        location: ProgressLocation.Dialog,
        // use a dialog to prevent the user from making any more interactions now
        buttons: [this.toForceShutdownLabel(reason)],
        // allow to force shutdown anyway
        cancellable: false,
        // do not allow to cancel
        sticky: true,
        // do not allow to dismiss
        title: this.toShutdownLabel(reason, false),
        detail: pendingJoiners.length > 0 ? localize("willShutdownDetail", "The following operations are still running: \n{0}", pendingJoiners.map((joiner) => `- ${joiner.label}`).join("\n")) : void 0
      }, () => {
        return Event.toPromise(this.lifecycleService.onDidShutdown);
      }, () => {
        force();
      });
    }, 1200);
    shutdownDialogScheduler.schedule();
    Event.once(this.lifecycleService.onDidShutdown)(() => shutdownDialogScheduler.dispose());
  }
  toShutdownLabel(reason, isError) {
    if (isError) {
      switch (reason) {
        case ShutdownReason.CLOSE:
          return localize("shutdownErrorClose", "An unexpected error prevented the window to close");
        case ShutdownReason.QUIT:
          return localize("shutdownErrorQuit", "An unexpected error prevented the application to quit");
        case ShutdownReason.RELOAD:
          return localize("shutdownErrorReload", "An unexpected error prevented the window to reload");
        case ShutdownReason.LOAD:
          return localize("shutdownErrorLoad", "An unexpected error prevented to change the workspace");
      }
    }
    switch (reason) {
      case ShutdownReason.CLOSE:
        return localize("shutdownTitleClose", "Closing the window is taking a bit longer...");
      case ShutdownReason.QUIT:
        return localize("shutdownTitleQuit", "Quitting the application is taking a bit longer...");
      case ShutdownReason.RELOAD:
        return localize("shutdownTitleReload", "Reloading the window is taking a bit longer...");
      case ShutdownReason.LOAD:
        return localize("shutdownTitleLoad", "Changing the workspace is taking a bit longer...");
    }
  }
  toForceShutdownLabel(reason) {
    switch (reason) {
      case ShutdownReason.CLOSE:
        return localize("shutdownForceClose", "Close Anyway");
      case ShutdownReason.QUIT:
        return localize("shutdownForceQuit", "Quit Anyway");
      case ShutdownReason.RELOAD:
        return localize("shutdownForceReload", "Reload Anyway");
      case ShutdownReason.LOAD:
        return localize("shutdownForceLoad", "Change Anyway");
    }
  }
  //#endregion
  updateDocumentEdited(documentEdited) {
    let setDocumentEdited;
    if (typeof documentEdited === "boolean") {
      setDocumentEdited = documentEdited;
    } else {
      setDocumentEdited = this.workingCopyService.hasDirty;
    }
    if (!this.isDocumentedEdited && setDocumentEdited || this.isDocumentedEdited && !setDocumentEdited) {
      this.isDocumentedEdited = setDocumentEdited;
      this.nativeHostService.setDocumentEdited(setDocumentEdited);
    }
  }
  getWindowMinimumWidth(panelPosition = this.layoutService.getPanelPosition()) {
    const panelOnSide = panelPosition === Position.LEFT || panelPosition === Position.RIGHT;
    if (panelOnSide) {
      return WindowMinimumSize.WIDTH_WITH_VERTICAL_PANEL;
    }
    return WindowMinimumSize.WIDTH;
  }
  onDidChangePanelPosition(pos) {
    const minWidth = this.getWindowMinimumWidth(pos);
    this.nativeHostService.setMinimumSize(minWidth, void 0);
  }
  maybeCloseWindow() {
    const closeWhenEmpty = this.configurationService.getValue("window.closeWhenEmpty") || this.nativeEnvironmentService.args.wait;
    if (!closeWhenEmpty) {
      return;
    }
    for (const editorPart of this.editorGroupService.parts) {
      if (editorPart.groups.some((group) => !group.isEmpty)) {
        continue;
      }
      if (editorPart === this.editorGroupService.mainPart && (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY || // only for empty windows
      this.environmentService.isExtensionDevelopment || // not when developing an extension
      this.editorService.visibleEditors.length > 0)) {
        continue;
      }
      if (editorPart === this.editorGroupService.mainPart) {
        this.nativeHostService.closeWindow();
      } else {
        editorPart.removeGroup(editorPart.activeGroup);
      }
    }
  }
  provideCustomTitleContextMenu(filePath) {
    this.customTitleContextMenuDisposable.clear();
    if (!filePath || hasNativeTitlebar(this.configurationService)) {
      return;
    }
    const segments = filePath.split(posix.sep);
    for (let i = segments.length; i > 0; i--) {
      const isFile = i === segments.length;
      let pathOffset = i;
      if (!isFile) {
        pathOffset++;
      }
      const path = URI.file(segments.slice(0, pathOffset).join(posix.sep));
      let label;
      if (!isFile) {
        label = this.labelService.getUriBasenameLabel(dirname(path));
      } else {
        label = this.labelService.getUriBasenameLabel(path);
      }
      const commandId = `workbench.action.revealPathInFinder${i}`;
      this.customTitleContextMenuDisposable.add(CommandsRegistry.registerCommand(commandId, () => this.nativeHostService.showItemInFolder(path.fsPath)));
      this.customTitleContextMenuDisposable.add(MenuRegistry.appendMenuItem(MenuId.TitleBarTitleContext, { command: { id: commandId, title: label || posix.sep }, order: -i, group: "1_file" }));
    }
  }
  create() {
    this.setupOpenHandlers();
    this.lifecycleService.when(LifecyclePhase.Ready).then(() => this.nativeHostService.notifyReady());
    this.lifecycleService.when(LifecyclePhase.Restored).then(() => {
      this.sharedProcessService.notifyRestored();
      this.utilityProcessWorkerWorkbenchService.notifyRestored();
    });
    this.handleWarnings();
    this.updateTouchbarMenu();
    this.updateWindowBorder();
    if (this.environmentService.enableSmokeTestDriver) {
      registerWindowDriver(this.instantiationService);
    }
  }
  async handleWarnings() {
    await this.lifecycleService.when(LifecyclePhase.Restored);
    (async () => {
      const isAdmin = await this.nativeHostService.isAdmin();
      const { isPure } = await this.integrityService.isPure();
      this.titleService.updateProperties({ isPure, isAdmin });
      if (isAdmin && !isWindows) {
        this.notificationService.warn(localize("runningAsRoot", "It is not recommended to run {0} as root user.", this.productService.nameShort));
      }
    })();
    if (this.environmentService.isBuilt && !this.environmentService.extensionDevelopmentLocationURI?.length) {
      let installLocationUri;
      if (isMacintosh) {
        installLocationUri = dirname(dirname(dirname(URI.file(this.nativeEnvironmentService.appRoot))));
      } else {
        installLocationUri = dirname(dirname(URI.file(this.nativeEnvironmentService.appRoot)));
      }
      for (const folder of this.contextService.getWorkspace().folders) {
        if (this.uriIdentityService.extUri.isEqualOrParent(folder.uri, installLocationUri)) {
          this.bannerService.show({
            id: "appRootWarning.banner",
            message: localize("appRootWarning.banner", "Files you store within the installation folder ('{0}') may be OVERWRITTEN or DELETED IRREVERSIBLY without warning at update time.", this.labelService.getUriLabel(installLocationUri)),
            icon: Codicon.warning
          });
          break;
        }
      }
    }
    if (isMacintosh) {
      const majorVersion = this.nativeEnvironmentService.os.release.split(".")[0];
      const eolReleases = /* @__PURE__ */ new Map([
        ["20", "macOS Big Sur"]
      ]);
      if (eolReleases.has(majorVersion)) {
        const message = localize("macoseolmessage", "{0} on {1} will soon stop receiving updates. Consider upgrading your macOS version.", this.productService.nameLong, eolReleases.get(majorVersion));
        this.notificationService.prompt(
          Severity.Warning,
          message,
          [{
            label: localize("learnMore", "Learn More"),
            run: () => this.openerService.open(URI.parse("https://aka.ms/vscode-faq-old-macOS"))
          }],
          {
            neverShowAgain: { id: "macoseol", isSecondary: true, scope: NeverShowAgainScope.APPLICATION },
            priority: NotificationPriority.URGENT,
            sticky: true
          }
        );
      }
    }
    const shellEnv = process.shellEnv();
    this.progressService.withProgress({
      title: localize("resolveShellEnvironment", "Resolving shell environment..."),
      location: ProgressLocation.Window,
      delay: 1600,
      buttons: [localize("learnMore", "Learn More")]
    }, () => shellEnv, () => this.openerService.open("https://go.microsoft.com/fwlink/?linkid=2149667"));
  }
  async resolveExternalUri(uri, options) {
    let queryTunnel;
    if (options?.allowTunneling) {
      const portMappingRequest = extractLocalHostUriMetaDataForPortMapping(uri);
      const queryPortMapping = extractQueryLocalHostUriMetaDataForPortMapping(uri);
      if (queryPortMapping) {
        queryTunnel = await this.openTunnel(queryPortMapping.address, queryPortMapping.port);
        if (queryTunnel && typeof queryTunnel !== "string") {
          if (queryTunnel.tunnelRemotePort !== queryPortMapping.port) {
            queryTunnel.dispose();
            queryTunnel = void 0;
          } else {
            if (!portMappingRequest) {
              const tunnel = queryTunnel;
              return {
                resolved: uri,
                dispose: () => tunnel.dispose()
              };
            }
          }
        }
      }
      if (portMappingRequest) {
        const tunnel = await this.openTunnel(portMappingRequest.address, portMappingRequest.port);
        if (tunnel && typeof tunnel !== "string") {
          const addressAsUri = URI.parse(tunnel.localAddress).with({ path: uri.path });
          const resolved = addressAsUri.scheme.startsWith(uri.scheme) ? addressAsUri : uri.with({ authority: tunnel.localAddress });
          return {
            resolved,
            dispose() {
              tunnel.dispose();
              if (queryTunnel && typeof queryTunnel !== "string") {
                queryTunnel.dispose();
              }
            }
          };
        }
      }
    }
    if (!options?.openExternal) {
      const canHandleResource = await this.fileService.canHandleResource(uri);
      if (canHandleResource) {
        return {
          resolved: URI.from({
            scheme: this.productService.urlProtocol,
            path: "workspace",
            query: uri.toString()
          }),
          dispose() {
          }
        };
      }
    }
    return void 0;
  }
  async openTunnel(address, port) {
    const remoteAuthority = this.environmentService.remoteAuthority;
    const addressProvider = remoteAuthority ? {
      getAddress: async () => {
        return (await this.remoteAuthorityResolverService.resolveAuthority(remoteAuthority)).authority;
      }
    } : void 0;
    const tunnel = await this.tunnelService.getExistingTunnel(address, port);
    if (!tunnel || typeof tunnel === "string") {
      return this.tunnelService.openTunnel(addressProvider, address, port);
    }
    return tunnel;
  }
  setupOpenHandlers() {
    this.openerService.setDefaultExternalOpener({
      openExternal: async (href) => {
        const success = await this.nativeHostService.openExternal(href, this.configurationService.getValue("workbench.externalBrowser"));
        if (!success) {
          const fileCandidate = URI.parse(href);
          if (fileCandidate.scheme === Schemas.file) {
            await this.nativeHostService.showItemInFolder(fileCandidate.fsPath);
          }
        }
        return true;
      }
    });
    this.openerService.registerExternalUriResolver({
      resolveExternalUri: async (uri, options) => {
        return this.resolveExternalUri(uri, options);
      }
    });
  }
  updateTouchbarMenu() {
    if (!isMacintosh) {
      return;
    }
    this.touchBarDisposables.clear();
    this.touchBarMenu = void 0;
    const scheduler = this.touchBarDisposables.add(new RunOnceScheduler(() => this.doUpdateTouchbarMenu(scheduler), 300));
    scheduler.schedule();
  }
  doUpdateTouchbarMenu(scheduler) {
    if (!this.touchBarMenu) {
      const scopedContextKeyService = this.editorService.activeEditorPane?.scopedContextKeyService || this.editorGroupService.activeGroup.scopedContextKeyService;
      this.touchBarMenu = this.menuService.createMenu(MenuId.TouchBarContext, scopedContextKeyService);
      this.touchBarDisposables.add(this.touchBarMenu);
      this.touchBarDisposables.add(this.touchBarMenu.onDidChange(() => scheduler.schedule()));
    }
    const disabled = this.configurationService.getValue("keyboard.touchbar.enabled") === false;
    const touchbarIgnored = this.configurationService.getValue("keyboard.touchbar.ignored");
    const ignoredItems = Array.isArray(touchbarIgnored) ? touchbarIgnored : [];
    const actions = getFlatActionBarActions(this.touchBarMenu.getActions());
    const items = [];
    let group = [];
    if (!disabled) {
      for (const action of actions) {
        if (action instanceof MenuItemAction) {
          if (ignoredItems.indexOf(action.item.id) >= 0) {
            continue;
          }
          group.push(action.item);
        } else if (action instanceof Separator) {
          if (group.length) {
            items.push(group);
          }
          group = [];
        }
      }
      if (group.length) {
        items.push(group);
      }
    }
    if (!equals(this.lastInstalledTouchedBar, items)) {
      this.lastInstalledTouchedBar = items;
      this.nativeHostService.updateTouchBar(items);
    }
  }
  //#endregion
  //#region Window Border
  updateWindowBorder() {
    if (!isWindows) {
      return;
    }
    const theme = this.themeService.getColorTheme();
    let activeBorder = theme.getColor(WINDOW_ACTIVE_BORDER)?.toString();
    let inactiveBorder = theme.getColor(WINDOW_INACTIVE_BORDER)?.toString();
    const borderSetting = this.configurationService.getValue("window.border");
    if (borderSetting === "off") {
      activeBorder = "off";
      inactiveBorder = void 0;
    } else if (borderSetting === "default") {
      activeBorder = activeBorder ?? "default";
    } else if (borderSetting === "system") {
      activeBorder = "default";
      inactiveBorder = void 0;
    } else {
      activeBorder = borderSetting;
      inactiveBorder = void 0;
    }
    this.nativeHostService.updateWindowAccentColor(activeBorder, inactiveBorder);
  }
  //#endregion
  onAddRemoveFoldersRequest(request) {
    this.pendingFoldersToAdd.push(...request.foldersToAdd.map((folder) => URI.revive(folder)));
    this.pendingFoldersToRemove.push(...request.foldersToRemove.map((folder) => URI.revive(folder)));
    if (!this.addRemoveFoldersScheduler.isScheduled()) {
      this.addRemoveFoldersScheduler.schedule();
    }
  }
  async doAddRemoveFolders() {
    const foldersToAdd = this.pendingFoldersToAdd.map((folder) => ({ uri: folder }));
    const foldersToRemove = this.pendingFoldersToRemove.slice(0);
    this.pendingFoldersToAdd = [];
    this.pendingFoldersToRemove = [];
    if (foldersToAdd.length) {
      await this.workspaceEditingService.addFolders(foldersToAdd);
    }
    if (foldersToRemove.length) {
      await this.workspaceEditingService.removeFolders(foldersToRemove);
    }
  }
  async onOpenFiles(request) {
    const diffMode = !!(request.filesToDiff && request.filesToDiff.length === 2);
    const mergeMode = !!(request.filesToMerge && request.filesToMerge.length === 4);
    const inputs = coalesce(await pathsToEditors(mergeMode ? request.filesToMerge : diffMode ? request.filesToDiff : request.filesToOpenOrCreate, this.fileService, this.logService));
    if (inputs.length) {
      const openedEditorPanes = await this.openResources(inputs, diffMode, mergeMode);
      if (request.filesToWait) {
        if (openedEditorPanes.length) {
          return this.trackClosedWaitFiles(URI.revive(request.filesToWait.waitMarkerFileUri), coalesce(request.filesToWait.paths.map((path) => URI.revive(path.fileUri))));
        } else {
          return this.fileService.del(URI.revive(request.filesToWait.waitMarkerFileUri));
        }
      }
    }
  }
  async trackClosedWaitFiles(waitMarkerFile, resourcesToWaitFor) {
    await this.instantiationService.invokeFunction((accessor) => whenEditorClosed(accessor, resourcesToWaitFor));
    await this.fileService.del(waitMarkerFile);
  }
  async openResources(resources, diffMode, mergeMode) {
    const editors = [];
    if (mergeMode && isResourceEditorInput(resources[0]) && isResourceEditorInput(resources[1]) && isResourceEditorInput(resources[2]) && isResourceEditorInput(resources[3])) {
      const mergeEditor = {
        input1: { resource: resources[0].resource },
        input2: { resource: resources[1].resource },
        base: { resource: resources[2].resource },
        result: { resource: resources[3].resource },
        options: { pinned: true }
      };
      editors.push(mergeEditor);
    } else if (diffMode && isResourceEditorInput(resources[0]) && isResourceEditorInput(resources[1])) {
      const diffEditor = {
        original: { resource: resources[0].resource },
        modified: { resource: resources[1].resource },
        options: { pinned: true }
      };
      editors.push(diffEditor);
    } else {
      editors.push(...resources);
    }
    return this.editorService.openEditors(editors, void 0, { validateTrust: true });
  }
  resolveConfiguredWindowZoomLevel() {
    const windowZoomLevel = this.configurationService.getValue("window.zoomLevel");
    return typeof windowZoomLevel === "number" ? windowZoomLevel : 0;
  }
  handleOnDidChangeZoomLevel(targetWindowId) {
    this.updateWindowZoomStatusEntry(targetWindowId);
    if (targetWindowId === mainWindow.vscodeWindowId) {
      const currentWindowZoomLevel = getZoomLevel(mainWindow);
      let notifyZoomLevel = void 0;
      if (this.configuredWindowZoomLevel !== currentWindowZoomLevel) {
        notifyZoomLevel = currentWindowZoomLevel;
      }
      ipcRenderer.invoke("vscode:notifyZoomLevel", notifyZoomLevel);
    }
  }
  createWindowZoomStatusEntry(part) {
    const disposables = new DisposableStore();
    Event.once(part.onWillDispose)(() => disposables.dispose());
    const scopedInstantiationService = this.editorGroupService.getScopedInstantiationService(part);
    this.mapWindowIdToZoomStatusEntry.set(part.windowId, disposables.add(scopedInstantiationService.createInstance(ZoomStatusEntry)));
    disposables.add(toDisposable(() => this.mapWindowIdToZoomStatusEntry.delete(part.windowId)));
    this.updateWindowZoomStatusEntry(part.windowId);
  }
  updateWindowZoomStatusEntry(targetWindowId) {
    const targetWindow = getWindowById(targetWindowId);
    const entry = this.mapWindowIdToZoomStatusEntry.get(targetWindowId);
    if (entry && targetWindow) {
      const currentZoomLevel = getZoomLevel(targetWindow.window);
      let text = void 0;
      if (currentZoomLevel < this.configuredWindowZoomLevel) {
        text = "$(zoom-out)";
      } else if (currentZoomLevel > this.configuredWindowZoomLevel) {
        text = "$(zoom-in)";
      }
      entry.updateZoomEntry(text ?? false, targetWindowId);
    }
  }
  onDidChangeConfiguredWindowZoomLevel() {
    this.configuredWindowZoomLevel = this.resolveConfiguredWindowZoomLevel();
    let applyZoomLevel = false;
    for (const { window } of getWindows()) {
      if (getZoomLevel(window) !== this.configuredWindowZoomLevel) {
        applyZoomLevel = true;
        break;
      }
    }
    if (applyZoomLevel) {
      applyZoom(this.configuredWindowZoomLevel, ApplyZoomTarget.ALL_WINDOWS);
    }
    for (const [windowId] of this.mapWindowIdToZoomStatusEntry) {
      this.updateWindowZoomStatusEntry(windowId);
    }
  }
  //#endregion
  dispose() {
    super.dispose();
    for (const [, entry] of this.mapWindowIdToZoomStatusEntry) {
      entry.dispose();
    }
  }
};
NativeWindow = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IEditorGroupsService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, ITitleService),
  __decorateParam(4, IWorkbenchThemeService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, ITelemetryService),
  __decorateParam(9, IWorkspaceEditingService),
  __decorateParam(10, IFileService),
  __decorateParam(11, IMenuService),
  __decorateParam(12, ILifecycleService),
  __decorateParam(13, IIntegrityService),
  __decorateParam(14, INativeWorkbenchEnvironmentService),
  __decorateParam(15, IAccessibilityService),
  __decorateParam(16, IWorkspaceContextService),
  __decorateParam(17, IOpenerService),
  __decorateParam(18, INativeHostService),
  __decorateParam(19, ITunnelService),
  __decorateParam(20, IWorkbenchLayoutService),
  __decorateParam(21, IWorkingCopyService),
  __decorateParam(22, IFilesConfigurationService),
  __decorateParam(23, IProductService),
  __decorateParam(24, IRemoteAuthorityResolverService),
  __decorateParam(25, IDialogService),
  __decorateParam(26, IStorageService),
  __decorateParam(27, ILogService),
  __decorateParam(28, IInstantiationService),
  __decorateParam(29, ISharedProcessService),
  __decorateParam(30, IProgressService),
  __decorateParam(31, ILabelService),
  __decorateParam(32, IBannerService),
  __decorateParam(33, IUriIdentityService),
  __decorateParam(34, IPreferencesService),
  __decorateParam(35, IUtilityProcessWorkerWorkbenchService),
  __decorateParam(36, IHostService),
  __decorateParam(37, IContextMenuService)
], NativeWindow);
let ZoomStatusEntry = class extends Disposable {
  constructor(statusbarService, commandService, keybindingService) {
    super();
    this.statusbarService = statusbarService;
    this.commandService = commandService;
    this.keybindingService = keybindingService;
    this.disposable = this._register(new MutableDisposable());
    this.zoomLevelLabel = void 0;
  }
  updateZoomEntry(visibleOrText, targetWindowId) {
    if (typeof visibleOrText === "string") {
      if (!this.disposable.value) {
        this.createZoomEntry(visibleOrText);
      }
      this.updateZoomLevelLabel(targetWindowId);
    } else {
      this.disposable.clear();
    }
  }
  createZoomEntry(visibleOrText) {
    const disposables = new DisposableStore();
    this.disposable.value = disposables;
    const container = $(".zoom-status");
    const left = $(".zoom-status-left");
    container.appendChild(left);
    const zoomOutAction = disposables.add(new Action("workbench.action.zoomOut", localize("zoomOut", "Zoom Out"), ThemeIcon.asClassName(Codicon.remove), true, () => this.commandService.executeCommand(zoomOutAction.id)));
    const zoomInAction = disposables.add(new Action("workbench.action.zoomIn", localize("zoomIn", "Zoom In"), ThemeIcon.asClassName(Codicon.plus), true, () => this.commandService.executeCommand(zoomInAction.id)));
    const zoomResetAction = disposables.add(new Action("workbench.action.zoomReset", localize("zoomReset", "Reset"), void 0, true, () => this.commandService.executeCommand(zoomResetAction.id)));
    zoomResetAction.tooltip = this.keybindingService.appendKeybinding(zoomResetAction.label, zoomResetAction.id);
    const zoomSettingsAction = disposables.add(new Action("workbench.action.openSettings", localize("zoomSettings", "Settings"), ThemeIcon.asClassName(Codicon.settingsGear), true, () => this.commandService.executeCommand(zoomSettingsAction.id, "window.zoom")));
    const zoomLevelLabel = disposables.add(new Action("zoomLabel", void 0, void 0, false));
    this.zoomLevelLabel = zoomLevelLabel;
    disposables.add(toDisposable(() => this.zoomLevelLabel = void 0));
    const actionBarLeft = disposables.add(new ActionBar(left, { hoverDelegate: nativeHoverDelegate }));
    actionBarLeft.push(zoomOutAction, { icon: true, label: false, keybinding: this.keybindingService.lookupKeybinding(zoomOutAction.id)?.getLabel() });
    actionBarLeft.push(this.zoomLevelLabel, { icon: false, label: true });
    actionBarLeft.push(zoomInAction, { icon: true, label: false, keybinding: this.keybindingService.lookupKeybinding(zoomInAction.id)?.getLabel() });
    const right = $(".zoom-status-right");
    container.appendChild(right);
    const actionBarRight = disposables.add(new ActionBar(right, { hoverDelegate: nativeHoverDelegate }));
    actionBarRight.push(zoomResetAction, { icon: false, label: true });
    actionBarRight.push(zoomSettingsAction, { icon: true, label: false, keybinding: this.keybindingService.lookupKeybinding(zoomSettingsAction.id)?.getLabel() });
    const name = localize("status.windowZoom", "Window Zoom");
    disposables.add(this.statusbarService.addEntry({
      name,
      text: visibleOrText,
      tooltip: container,
      ariaLabel: name,
      command: ShowTooltipCommand,
      kind: "prominent"
    }, "status.windowZoom", StatusbarAlignment.RIGHT, 102));
  }
  updateZoomLevelLabel(targetWindowId) {
    if (this.zoomLevelLabel) {
      const targetWindow = getWindowById(targetWindowId, true).window;
      const zoomFactor = Math.round(getZoomFactor(targetWindow) * 100);
      const zoomLevel = getZoomLevel(targetWindow);
      this.zoomLevelLabel.label = `${zoomLevel}`;
      this.zoomLevelLabel.tooltip = localize("zoomNumber", "Zoom Level: {0} ({1}%)", zoomLevel, zoomFactor);
    }
  }
};
ZoomStatusEntry = __decorateClass([
  __decorateParam(0, IStatusbarService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, IKeybindingService)
], ZoomStatusEntry);
export {
  NativeWindow
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGVsZWN0cm9uLWJyb3dzZXJcXHdpbmRvdy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS93aW5kb3cuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IEV2ZW50VHlwZSwgRXZlbnRIZWxwZXIsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgTW9kaWZpZXJLZXlFbWl0dGVyLCBnZXRBY3RpdmVFbGVtZW50LCBoYXNXaW5kb3csIGdldFdpbmRvd0J5SWQsIGdldFdpbmRvd3MsICQgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgU2VwYXJhdG9yLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50IH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgSVVudGl0bGVkVGV4dFJlc291cmNlRWRpdG9ySW5wdXQsIFNpZGVCeVNpZGVFZGl0b3IsIHBhdGhzVG9FZGl0b3JzLCBJUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQsIElVbnR5cGVkRWRpdG9ySW5wdXQsIElFZGl0b3JQYW5lLCBpc1Jlc291cmNlRWRpdG9ySW5wdXQsIElSZXNvdXJjZU1lcmdlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgV2luZG93TWluaW11bVNpemUsIElPcGVuRmlsZVJlcXVlc3QsIElBZGRSZW1vdmVGb2xkZXJzUmVxdWVzdCwgSU5hdGl2ZVJ1bkFjdGlvbkluV2luZG93UmVxdWVzdCwgSU5hdGl2ZVJ1bktleWJpbmRpbmdJbldpbmRvd1JlcXVlc3QsIElOYXRpdmVPcGVuRmlsZVJlcXVlc3QsIGhhc05hdGl2ZVRpdGxlYmFyIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSVRpdGxlU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL3RpdGxlL2Jyb3dzZXIvdGl0bGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL3dvcmtiZW5jaFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBcHBseVpvb21UYXJnZXQsIGFwcGx5Wm9vbSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9lbGVjdHJvbi1icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBzZXRGdWxsc2NyZWVuLCBnZXRab29tTGV2ZWwsIG9uRGlkQ2hhbmdlWm9vbUxldmVsLCBnZXRab29tRmFjdG9yIH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlLCBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgaXBjUmVuZGVyZXIsIHByb2Nlc3MgfSBmcm9tICcuLi8uLi9iYXNlL3BhcnRzL3NhbmRib3gvZWxlY3Ryb24tYnJvd3Nlci9nbG9iYWxzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZUVkaXRpbmcuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIElNZW51LCBNZW51SXRlbUFjdGlvbiwgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZEFjdGlvbiB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IGdldEZsYXRBY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UsIElMaWZlY3ljbGVTZXJ2aWNlLCBXaWxsU2h1dGRvd25FdmVudCwgU2h1dGRvd25SZWFzb24sIEJlZm9yZVNodXRkb3duRXJyb3JFdmVudCwgQmVmb3JlU2h1dGRvd25FdmVudCB9IGZyb20gJy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VGb2xkZXJDcmVhdGlvbkRhdGEgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VzLmpzJztcbmltcG9ydCB7IElJbnRlZ3JpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvaW50ZWdyaXR5L2NvbW1vbi9pbnRlZ3JpdHkuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzLCBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBOZXZlclNob3dBZ2FpblNjb3BlLCBOb3RpZmljYXRpb25Qcmlvcml0eSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9lbGVjdHJvbi1icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsIEFjY2Vzc2liaWxpdHlTdXBwb3J0IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hTdGF0ZSwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UsIElSZXNvbHZlZEV4dGVybmFsVXJpLCBPcGVuT3B0aW9ucyB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IHBvc2l4IH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBJVHVubmVsU2VydmljZSwgUmVtb3RlVHVubmVsLCBleHRyYWN0TG9jYWxIb3N0VXJpTWV0YURhdGFGb3JQb3J0TWFwcGluZywgZXh0cmFjdFF1ZXJ5TG9jYWxIb3N0VXJpTWV0YURhdGFGb3JQb3J0TWFwcGluZyB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3R1bm5lbC9jb21tb24vdHVubmVsLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBwb3NpdGlvbkZyb21TdHJpbmcsIFBvc2l0aW9uIH0gZnJvbSAnLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBXb3JraW5nQ29weUNhcGFiaWxpdGllcyB9IGZyb20gJy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUF1dGhvcml0eVJlc29sdmVyLmpzJztcbmltcG9ydCB7IElBZGRyZXNzUHJvdmlkZXIsIElBZGRyZXNzIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudENvbm5lY3Rpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UsIElFZGl0b3JQYXJ0IH0gZnJvbSAnLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBBdXRoSW5mbyB9IGZyb20gJy4uLy4uL2Jhc2UvcGFydHMvc2FuZGJveC9lbGVjdHJvbi1icm93c2VyL2VsZWN0cm9uVHlwZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IHdoZW5FZGl0b3JDbG9zZWQgfSBmcm9tICcuLi9icm93c2VyL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJU2hhcmVkUHJvY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9pcGMvZWxlY3Ryb24tYnJvd3Nlci9zZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgZGlybmFtZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJQmFubmVyU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2Jhbm5lci9icm93c2VyL2Jhbm5lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBJVXRpbGl0eVByb2Nlc3NXb3JrZXJXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvdXRpbGl0eVByb2Nlc3MvZWxlY3Ryb24tYnJvd3Nlci91dGlsaXR5UHJvY2Vzc1dvcmtlcldvcmtiZW5jaFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJXaW5kb3dEcml2ZXIgfSBmcm9tICcuLi9zZXJ2aWNlcy9kcml2ZXIvYnJvd3Nlci9kcml2ZXIuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgQmFzZVdpbmRvdyB9IGZyb20gJy4uL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElTdGF0dXNiYXJTZXJ2aWNlLCBTaG93VG9vbHRpcENvbW1hbmQsIFN0YXR1c2JhckFsaWdubWVudCB9IGZyb20gJy4uL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgZ2V0V29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgRHluYW1pY1dvcmtiZW5jaFNlY3VyaXR5Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IG5hdGl2ZUhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IFdJTkRPV19BQ1RJVkVfQk9SREVSLCBXSU5ET1dfSU5BQ1RJVkVfQk9SREVSIH0gZnJvbSAnLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcblxuZXhwb3J0IGNsYXNzIE5hdGl2ZVdpbmRvdyBleHRlbmRzIEJhc2VXaW5kb3cge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY3VzdG9tVGl0bGVDb250ZXh0TWVudURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWRkUmVtb3ZlRm9sZGVyc1NjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuZG9BZGRSZW1vdmVGb2xkZXJzKCksIDEwMCkpO1xuXHRwcml2YXRlIHBlbmRpbmdGb2xkZXJzVG9BZGQ6IFVSSVtdID0gW107XG5cdHByaXZhdGUgcGVuZGluZ0ZvbGRlcnNUb1JlbW92ZTogVVJJW10gPSBbXTtcblxuXHRwcml2YXRlIGlzRG9jdW1lbnRlZEVkaXRlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUaXRsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aXRsZVNlcnZpY2U6IElUaXRsZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hUaGVtZVNlcnZpY2UgcHJvdGVjdGVkIHRoZW1lU2VydmljZTogSVdvcmtiZW5jaFRoZW1lU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlRWRpdGluZ1NlcnZpY2U6IElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASUludGVncml0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnRlZ3JpdHlTZXJ2aWNlOiBJSW50ZWdyaXR5U2VydmljZSxcblx0XHRASU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5hdGl2ZUVudmlyb25tZW50U2VydmljZTogSU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASU5hdGl2ZUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZSxcblx0XHRASVR1bm5lbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0dW5uZWxTZXJ2aWNlOiBJVHVubmVsU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JraW5nQ29weVNlcnZpY2U6IElXb3JraW5nQ29weVNlcnZpY2UsXG5cdFx0QElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2U6IElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTaGFyZWRQcm9jZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNoYXJlZFByb2Nlc3NTZXJ2aWNlOiBJU2hhcmVkUHJvY2Vzc1NlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElCYW5uZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYmFubmVyU2VydmljZTogSUJhbm5lclNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElQcmVmZXJlbmNlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2UsXG5cdFx0QElVdGlsaXR5UHJvY2Vzc1dvcmtlcldvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1dGlsaXR5UHJvY2Vzc1dvcmtlcldvcmtiZW5jaFNlcnZpY2U6IElVdGlsaXR5UHJvY2Vzc1dvcmtlcldvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobWFpbldpbmRvdywgdW5kZWZpbmVkLCBob3N0U2VydmljZSwgbmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGxheW91dFNlcnZpY2UpO1xuXG5cdFx0dGhpcy5jb25maWd1cmVkV2luZG93Wm9vbUxldmVsID0gdGhpcy5yZXNvbHZlQ29uZmlndXJlZFdpbmRvd1pvb21MZXZlbCgpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHRcdHRoaXMuY3JlYXRlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBMYXlvdXRcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIobWFpbldpbmRvdywgRXZlbnRUeXBlLlJFU0laRSwgKCkgPT4gdGhpcy5sYXlvdXRTZXJ2aWNlLmxheW91dCgpKSk7XG5cblx0XHQvLyBSZWFjdCB0byBlZGl0b3IgaW5wdXQgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB0aGlzLnVwZGF0ZVRvdWNoYmFyTWVudSgpKSk7XG5cblx0XHQvLyBQcmV2ZW50IG9wZW5pbmcgYSByZWFsIFVSTCBpbnNpZGUgdGhlIHdpbmRvd1xuXHRcdGZvciAoY29uc3QgZXZlbnQgb2YgW0V2ZW50VHlwZS5EUkFHX09WRVIsIEV2ZW50VHlwZS5EUk9QXSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keSwgZXZlbnQsIChlOiBEcmFnRXZlbnQpID0+IHtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBTdXBwb3J0IGBydW5BY3Rpb25gIGV2ZW50XG5cdFx0aXBjUmVuZGVyZXIub24oJ3ZzY29kZTpydW5BY3Rpb24nLCBhc3luYyAoZXZlbnQ6IHVua25vd24sIC4uLmFyZ3NSYXc6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IGFyZ3NSYXdbMF0gYXMgSU5hdGl2ZVJ1bkFjdGlvbkluV2luZG93UmVxdWVzdDtcblx0XHRcdGNvbnN0IGFyZ3M6IHVua25vd25bXSA9IHJlcXVlc3QuYXJncyB8fCBbXTtcblxuXHRcdFx0Ly8gSWYgd2UgcnVuIGFuIGFjdGlvbiBmcm9tIHRoZSB0b3VjaGJhciwgd2UgZmlsbCBpbiB0aGUgY3VycmVudGx5IGFjdGl2ZSByZXNvdXJjZVxuXHRcdFx0Ly8gYXMgcGF5bG9hZCBiZWNhdXNlIHRoZSB0b3VjaCBiYXIgaXRlbXMgYXJlIGNvbnRleHQgYXdhcmUgZGVwZW5kaW5nIG9uIHRoZSBlZGl0b3Jcblx0XHRcdGlmIChyZXF1ZXN0LmZyb20gPT09ICd0b3VjaGJhcicpIHtcblx0XHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcjtcblx0XHRcdFx0aWYgKGFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRcdGNvbnN0IHJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShhY3RpdmVFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblx0XHRcdFx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdGFyZ3MucHVzaChyZXNvdXJjZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHJlcXVlc3QuZnJvbSA9PT0gJ3N5c3RlbVdpZGVLZXliaW5kaW5nJykge1xuXHRcdFx0XHQvLyBBIHN5c3RlbS13aWRlIChPUyBnbG9iYWwpIGtleWJpbmRpbmcgcnVucyB0aGUgY29tbWFuZCB3aXRoIGV4YWN0bHkgdGhlIGFyZ3VtZW50c1xuXHRcdFx0XHQvLyBjb25maWd1cmVkIGluIGBrZXliaW5kaW5ncy5qc29uYCAoYWxyZWFkeSBpbiBgcmVxdWVzdC5hcmdzYCkuIFdlIGludGVudGlvbmFsbHkgZG9cblx0XHRcdFx0Ly8gbm90IGFwcGVuZCBhIGB7IGZyb20gfWAgc2VudGluZWwgc28gdGhhdCBjb21tYW5kcyB0YWtpbmcgcG9zaXRpb25hbCBhcmd1bWVudHNcblx0XHRcdFx0Ly8gcmVjZWl2ZSB0aGUgc2FtZSBwYXlsb2FkIHRoZXkgd291bGQgZnJvbSBhIHJlZ3VsYXIgaW4td2luZG93IGtleWJpbmRpbmcuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhcmdzLnB1c2goeyBmcm9tOiByZXF1ZXN0LmZyb20gfSk7XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQocmVxdWVzdC5pZCwgLi4uYXJncyk7XG5cblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogcmVxdWVzdC5pZCwgZnJvbTogcmVxdWVzdC5mcm9tIH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIFN1cHBvcnQgcnVuS2V5YmluZGluZyBldmVudFxuXHRcdGlwY1JlbmRlcmVyLm9uKCd2c2NvZGU6cnVuS2V5YmluZGluZycsIChldmVudDogdW5rbm93biwgLi4uYXJnc1JhdzogdW5rbm93bltdKSA9PiB7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gYXJnc1Jhd1swXSBhcyBJTmF0aXZlUnVuS2V5YmluZGluZ0luV2luZG93UmVxdWVzdDtcblx0XHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBnZXRBY3RpdmVFbGVtZW50KCk7XG5cdFx0XHRpZiAoYWN0aXZlRWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmRpc3BhdGNoQnlVc2VyU2V0dGluZ3NMYWJlbChyZXF1ZXN0LnVzZXJTZXR0aW5nc0xhYmVsLCBhY3RpdmVFbGVtZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIFNoYXJlZCBQcm9jZXNzIGNyYXNoIHJlcG9ydGVkIGZyb20gbWFpblxuXHRcdGlwY1JlbmRlcmVyLm9uKCd2c2NvZGU6cmVwb3J0U2hhcmVkUHJvY2Vzc0NyYXNoJywgKGV2ZW50OiB1bmtub3duLCAuLi5hcmdzUmF3OiB1bmtub3duW10pID0+IHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2hhcmVkUHJvY2Vzc0NyYXNoJywgXCJBIHNoYXJlZCBiYWNrZ3JvdW5kIHByb2Nlc3MgdGVybWluYXRlZCB1bmV4cGVjdGVkbHkuIFBsZWFzZSByZXN0YXJ0IHRoZSBhcHBsaWNhdGlvbiB0byByZWNvdmVyLlwiKSxcblx0XHRcdFx0W3tcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Jlc3RhcnQnLCBcIlJlc3RhcnRcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLnJlbGF1bmNoKClcblx0XHRcdFx0fV0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHkuVVJHRU5UXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHQvLyBTdXBwb3J0IG9wZW5GaWxlcyBldmVudCBmb3IgZXhpc3RpbmcgYW5kIG5ldyBmaWxlc1xuXHRcdGlwY1JlbmRlcmVyLm9uKCd2c2NvZGU6b3BlbkZpbGVzJywgKGV2ZW50OiB1bmtub3duLCAuLi5hcmdzUmF3OiB1bmtub3duW10pID0+IHsgdGhpcy5vbk9wZW5GaWxlcyhhcmdzUmF3WzBdIGFzIElPcGVuRmlsZVJlcXVlc3QpOyB9KTtcblxuXHRcdC8vIFN1cHBvcnQgYWRkUmVtb3ZlRm9sZGVycyBldmVudCBmb3Igd29ya3NwYWNlIG1hbmFnZW1lbnRcblx0XHRpcGNSZW5kZXJlci5vbigndnNjb2RlOmFkZFJlbW92ZUZvbGRlcnMnLCAoZXZlbnQ6IHVua25vd24sIC4uLmFyZ3NSYXc6IHVua25vd25bXSkgPT4gdGhpcy5vbkFkZFJlbW92ZUZvbGRlcnNSZXF1ZXN0KGFyZ3NSYXdbMF0gYXMgSUFkZFJlbW92ZUZvbGRlcnNSZXF1ZXN0KSk7XG5cblx0XHQvLyBNZXNzYWdlIHN1cHBvcnRcblx0XHRpcGNSZW5kZXJlci5vbigndnNjb2RlOnNob3dJbmZvTWVzc2FnZScsIChldmVudDogdW5rbm93biwgLi4uYXJnc1JhdzogdW5rbm93bltdKSA9PiB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhhcmdzUmF3WzBdIGFzIHN0cmluZykpO1xuXG5cdFx0Ly8gU2hlbGwgRW52aXJvbm1lbnQgSXNzdWUgTm90aWZpY2F0aW9uc1xuXHRcdGlwY1JlbmRlcmVyLm9uKCd2c2NvZGU6c2hvd1Jlc29sdmVTaGVsbEVudkVycm9yJywgKGV2ZW50OiB1bmtub3duLCAuLi5hcmdzUmF3OiB1bmtub3duW10pID0+IHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBhcmdzUmF3WzBdIGFzIHN0cmluZztcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRbe1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVzdGFydCcsIFwiUmVzdGFydFwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMubmF0aXZlSG9zdFNlcnZpY2UucmVsYXVuY2goKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjb25maWd1cmUnLCBcIkNvbmZpZ3VyZVwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Vc2VyU2V0dGluZ3MoeyBxdWVyeTogJ2FwcGxpY2F0aW9uLnNoZWxsRW52aXJvbm1lbnRSZXNvbHV0aW9uVGltZW91dCcgfSlcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbGVhcm5Nb3JlJywgXCJMZWFybiBNb3JlXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oJ2h0dHBzOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP2xpbmtpZD0yMTQ5NjY3Jylcblx0XHRcdFx0fV1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHRpcGNSZW5kZXJlci5vbigndnNjb2RlOnNob3dDcmVkZW50aWFsc0Vycm9yJywgKGV2ZW50OiB1bmtub3duLCAuLi5hcmdzUmF3OiB1bmtub3duW10pID0+IHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBhcmdzUmF3WzBdIGFzIHN0cmluZztcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRsb2NhbGl6ZSgna2V5Y2hhaW5Xcml0ZUVycm9yJywgXCJXcml0aW5nIGxvZ2luIGluZm9ybWF0aW9uIHRvIHRoZSBrZXljaGFpbiBmYWlsZWQgd2l0aCBlcnJvciAnezB9Jy5cIiwgbWVzc2FnZSksXG5cdFx0XHRcdFt7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd0cm91Ymxlc2hvb3RpbmcnLCBcIlRyb3VibGVzaG9vdGluZyBHdWlkZVwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKCdodHRwczovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9saW5raWQ9MjE5MDcxMycpXG5cdFx0XHRcdH1dXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0aXBjUmVuZGVyZXIub24oJ3ZzY29kZTpzaG93VHJhbnNsYXRlZEJ1aWxkV2FybmluZycsICgpID0+IHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdGxvY2FsaXplKFwicnVubmluZ1RyYW5zbGF0ZWRcIiwgXCJZb3UgYXJlIHJ1bm5pbmcgYW4gZW11bGF0ZWQgdmVyc2lvbiBvZiB7MH0uIEZvciBiZXR0ZXIgcGVyZm9ybWFuY2UgZG93bmxvYWQgdGhlIG5hdGl2ZSBhcm02NCB2ZXJzaW9uIG9mIHswfSBidWlsZCBmb3IgeW91ciBtYWNoaW5lLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKSxcblx0XHRcdFx0W3tcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2Rvd25sb2FkQXJtQnVpbGQnLCBcIkRvd25sb2FkXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgcXVhbGl0eSA9IHRoaXMucHJvZHVjdFNlcnZpY2UucXVhbGl0eTtcblx0XHRcdFx0XHRcdGNvbnN0IHN0YWJsZVVSTCA9ICdodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzLz9kdj1vc3gnO1xuXHRcdFx0XHRcdFx0Y29uc3QgaW5zaWRlcnNVUkwgPSAnaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy8/ZHY9b3N4JmJ1aWxkPWluc2lkZXJzJztcblx0XHRcdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKHF1YWxpdHkgPT09ICdzdGFibGUnID8gc3RhYmxlVVJMIDogaW5zaWRlcnNVUkwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHkuVVJHRU5UXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHRpcGNSZW5kZXJlci5vbigndnNjb2RlOnNob3dBcmd2UGFyc2VXYXJuaW5nJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFx0U2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0bG9jYWxpemUoXCJzaG93QXJndlBhcnNlV2FybmluZ1wiLCBcIlRoZSBydW50aW1lIGFyZ3VtZW50cyBmaWxlICdhcmd2Lmpzb24nIGNvbnRhaW5zIGVycm9ycy4gUGxlYXNlIGNvcnJlY3QgdGhlbSBhbmQgcmVzdGFydC5cIiksXG5cdFx0XHRcdFt7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzaG93QXJndlBhcnNlV2FybmluZ0FjdGlvbicsIFwiT3BlbiBGaWxlXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogdGhpcy5uYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UuYXJndlJlc291cmNlIH0pXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5LlVSR0VOVFxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gRnVsbHNjcmVlbiBFdmVudHNcblx0XHRpcGNSZW5kZXJlci5vbigndnNjb2RlOmVudGVyRnVsbFNjcmVlbicsICgpID0+IHNldEZ1bGxzY3JlZW4odHJ1ZSwgbWFpbldpbmRvdykpO1xuXHRcdGlwY1JlbmRlcmVyLm9uKCd2c2NvZGU6bGVhdmVGdWxsU2NyZWVuJywgKCkgPT4gc2V0RnVsbHNjcmVlbihmYWxzZSwgbWFpbldpbmRvdykpO1xuXG5cdFx0Ly8gUHJveHkgTG9naW4gRGlhbG9nXG5cdFx0aXBjUmVuZGVyZXIub24oJ3ZzY29kZTpvcGVuUHJveHlBdXRoZW50aWNhdGlvbkRpYWxvZycsIGFzeW5jIChldmVudDogdW5rbm93biwgLi4uYXJnc1JhdzogdW5rbm93bltdKSA9PiB7XG5cdFx0XHRjb25zdCBwYXlsb2FkID0gYXJnc1Jhd1swXSBhcyB7IGF1dGhJbmZvOiBBdXRoSW5mbzsgdXNlcm5hbWU/OiBzdHJpbmc7IHBhc3N3b3JkPzogc3RyaW5nOyByZXBseUNoYW5uZWw6IHN0cmluZyB9O1xuXHRcdFx0Y29uc3QgcmVtZW1iZXJDcmVkZW50aWFsc0tleSA9ICd3aW5kb3cucmVtZW1iZXJQcm94eUNyZWRlbnRpYWxzJztcblx0XHRcdGNvbnN0IHJlbWVtYmVyQ3JlZGVudGlhbHMgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4ocmVtZW1iZXJDcmVkZW50aWFsc0tleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5pbnB1dCh7XG5cdFx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3Byb3h5QXV0aFJlcXVpcmVkJywgXCJQcm94eSBBdXRoZW50aWNhdGlvbiBSZXF1aXJlZFwiKSxcblx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdsb2dpbkJ1dHRvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkxvZyBJblwiKSxcblx0XHRcdFx0aW5wdXRzOlxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdHsgcGxhY2Vob2xkZXI6IGxvY2FsaXplKCd1c2VybmFtZScsIFwiVXNlcm5hbWVcIiksIHZhbHVlOiBwYXlsb2FkLnVzZXJuYW1lIH0sXG5cdFx0XHRcdFx0XHR7IHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgncGFzc3dvcmQnLCBcIlBhc3N3b3JkXCIpLCB0eXBlOiAncGFzc3dvcmQnLCB2YWx1ZTogcGF5bG9hZC5wYXNzd29yZCB9XG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgncHJveHlEZXRhaWwnLCBcIlRoZSBwcm94eSB7MH0gcmVxdWlyZXMgYSB1c2VybmFtZSBhbmQgcGFzc3dvcmQuXCIsIGAke3BheWxvYWQuYXV0aEluZm8uaG9zdH06JHtwYXlsb2FkLmF1dGhJbmZvLnBvcnR9YCksXG5cdFx0XHRcdGNoZWNrYm94OiB7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdyZW1lbWJlckNyZWRlbnRpYWxzJywgXCJSZW1lbWJlciBteSBjcmVkZW50aWFsc1wiKSxcblx0XHRcdFx0XHRjaGVja2VkOiByZW1lbWJlckNyZWRlbnRpYWxzXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBSZXBseSBiYWNrIHRvIHRoZSBjaGFubmVsIHdpdGhvdXQgcmVzdWx0IHRvIGluZGljYXRlXG5cdFx0XHQvLyB0aGF0IHRoZSBsb2dpbiBkaWFsb2cgd2FzIGNhbmNlbGxlZFxuXHRcdFx0aWYgKCFyZXN1bHQuY29uZmlybWVkIHx8ICFyZXN1bHQudmFsdWVzKSB7XG5cdFx0XHRcdGlwY1JlbmRlcmVyLnNlbmQocGF5bG9hZC5yZXBseUNoYW5uZWwpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPdGhlciByZXBseSBiYWNrIHdpdGggdGhlIHBpY2tlZCBjcmVkZW50aWFsc1xuXHRcdFx0ZWxzZSB7XG5cblx0XHRcdFx0Ly8gVXBkYXRlIHN0YXRlIGJhc2VkIG9uIGNoZWNrYm94XG5cdFx0XHRcdGlmIChyZXN1bHQuY2hlY2tib3hDaGVja2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShyZW1lbWJlckNyZWRlbnRpYWxzS2V5LCB0cnVlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUocmVtZW1iZXJDcmVkZW50aWFsc0tleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlcGx5IGJhY2sgdG8gbWFpbiBzaWRlIHdpdGggY3JlZGVudGlhbHNcblx0XHRcdFx0Y29uc3QgW3VzZXJuYW1lLCBwYXNzd29yZF0gPSByZXN1bHQudmFsdWVzO1xuXHRcdFx0XHRpcGNSZW5kZXJlci5zZW5kKHBheWxvYWQucmVwbHlDaGFubmVsLCB7IHVzZXJuYW1lLCBwYXNzd29yZCwgcmVtZW1iZXI6ICEhcmVzdWx0LmNoZWNrYm94Q2hlY2tlZCB9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIEFjY2Vzc2liaWxpdHkgc3VwcG9ydCBjaGFuZ2VkIGV2ZW50XG5cdFx0aXBjUmVuZGVyZXIub24oJ3ZzY29kZTphY2Nlc3NpYmlsaXR5U3VwcG9ydENoYW5nZWQnLCAoZXZlbnQ6IHVua25vd24sIC4uLmFyZ3NSYXc6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0Y29uc3QgYWNjZXNzaWJpbGl0eVN1cHBvcnRFbmFibGVkID0gYXJnc1Jhd1swXSBhcyBib29sZWFuO1xuXHRcdFx0dGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5zZXRBY2Nlc3NpYmlsaXR5U3VwcG9ydChhY2Nlc3NpYmlsaXR5U3VwcG9ydEVuYWJsZWQgPyBBY2Nlc3NpYmlsaXR5U3VwcG9ydC5FbmFibGVkIDogQWNjZXNzaWJpbGl0eVN1cHBvcnQuRGlzYWJsZWQpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQWxsb3cgdG8gdXBkYXRlIHNlY3VyaXR5IHNldHRpbmdzIGFyb3VuZCBhbGxvd2VkIFVOQyBIb3N0XG5cdFx0aXBjUmVuZGVyZXIub24oJ3ZzY29kZTpjb25maWd1cmVBbGxvd2VkVU5DSG9zdCcsIGFzeW5jIChldmVudDogdW5rbm93biwgLi4uYXJnc1JhdzogdW5rbm93bltdKSA9PiB7XG5cdFx0XHRjb25zdCBob3N0ID0gYXJnc1Jhd1swXSBhcyBzdHJpbmc7XG5cdFx0XHRpZiAoIWlzV2luZG93cykge1xuXHRcdFx0XHRyZXR1cm47IC8vIG9ubHkgc3VwcG9ydGVkIG9uIFdpbmRvd3Ncblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWxsb3dlZFVuY0hvc3RzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRBbGxvd2VkVW5jSG9zdHMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZ1tdIHwgdW5kZWZpbmVkPignc2VjdXJpdHkuYWxsb3dlZFVOQ0hvc3RzJywpID8/IFtdO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoY29uZmlndXJlZEFsbG93ZWRVbmNIb3N0cykpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBjb25maWd1cmVkQWxsb3dlZFVuY0hvc3Qgb2YgY29uZmlndXJlZEFsbG93ZWRVbmNIb3N0cykge1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgY29uZmlndXJlZEFsbG93ZWRVbmNIb3N0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0YWxsb3dlZFVuY0hvc3RzLmFkZChjb25maWd1cmVkQWxsb3dlZFVuY0hvc3QpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWFsbG93ZWRVbmNIb3N0cy5oYXMoaG9zdCkpIHtcblx0XHRcdFx0YWxsb3dlZFVuY0hvc3RzLmFkZChob3N0KTtcblxuXHRcdFx0XHRhd2FpdCBnZXRXb3JrYmVuY2hDb250cmlidXRpb248RHluYW1pY1dvcmtiZW5jaFNlY3VyaXR5Q29uZmlndXJhdGlvbj4oRHluYW1pY1dvcmtiZW5jaFNlY3VyaXR5Q29uZmlndXJhdGlvbi5JRCkucmVhZHk7IC8vIGVuc3VyZSB0aGlzIHNldHRpbmcgaXMgcmVnaXN0ZXJlZFxuXHRcdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCdzZWN1cml0eS5hbGxvd2VkVU5DSG9zdHMnLCBbLi4uYWxsb3dlZFVuY0hvc3RzLnZhbHVlcygpXSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIEFsbG93IHRvIHVwZGF0ZSBzZWN1cml0eSBzZXR0aW5ncyBhcm91bmQgcHJvdG9jb2wgaGFuZGxlcnNcblx0XHRpcGNSZW5kZXJlci5vbigndnNjb2RlOmRpc2FibGVQcm9tcHRGb3JQcm90b2NvbEhhbmRsaW5nJywgKGV2ZW50OiB1bmtub3duLCAuLi5hcmdzUmF3OiB1bmtub3duW10pID0+IHtcblx0XHRcdGNvbnN0IGtpbmQgPSBhcmdzUmF3WzBdIGFzICdsb2NhbCcgfCAncmVtb3RlJztcblx0XHRcdGNvbnN0IHNldHRpbmcgPSBraW5kID09PSAnbG9jYWwnID8gJ3NlY3VyaXR5LnByb21wdEZvckxvY2FsRmlsZVByb3RvY29sSGFuZGxpbmcnIDogJ3NlY3VyaXR5LnByb21wdEZvclJlbW90ZUZpbGVQcm90b2NvbEhhbmRsaW5nJztcblx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoc2V0dGluZywgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gV2luZG93IFNldHRpbmdzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignd2luZG93Lnpvb21MZXZlbCcpIHx8IChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCd3aW5kb3cuem9vbVBlcldpbmRvdycpICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3dpbmRvdy56b29tUGVyV2luZG93JykgPT09IGZhbHNlKSkge1xuXHRcdFx0XHR0aGlzLm9uRGlkQ2hhbmdlQ29uZmlndXJlZFdpbmRvd1pvb21MZXZlbCgpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdrZXlib2FyZC50b3VjaGJhci5lbmFibGVkJykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbigna2V5Ym9hcmQudG91Y2hiYXIuaWdub3JlZCcpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlVG91Y2hiYXJNZW51KCk7XG5cdFx0XHR9IGVsc2UgaWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3dpbmRvdy5ib3JkZXInKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVdpbmRvd0JvcmRlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkQ2hhbmdlWm9vbUxldmVsKHRhcmdldFdpbmRvd0lkID0+IHRoaXMuaGFuZGxlT25EaWRDaGFuZ2Vab29tTGV2ZWwodGFyZ2V0V2luZG93SWQpKSk7XG5cblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UucGFydHMpIHtcblx0XHRcdHRoaXMuY3JlYXRlV2luZG93Wm9vbVN0YXR1c0VudHJ5KHBhcnQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm9uRGlkQ3JlYXRlQXV4aWxpYXJ5RWRpdG9yUGFydChwYXJ0ID0+IHRoaXMuY3JlYXRlV2luZG93Wm9vbVN0YXR1c0VudHJ5KHBhcnQpKSk7XG5cblx0XHQvLyBMaXN0ZW4gdG8gdmlzaWJsZSBlZGl0b3IgY2hhbmdlcyAoZGVib3VuY2VkIGluIGNhc2UgYSBuZXcgZWRpdG9yIG9wZW5zIGltbWVkaWF0ZWx5IGFmdGVyKVxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmRlYm91bmNlKHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZFZpc2libGVFZGl0b3JzQ2hhbmdlLCAoKSA9PiB1bmRlZmluZWQsIDAsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRoaXMuX3N0b3JlKSgoKSA9PiB0aGlzLm1heWJlQ2xvc2VXaW5kb3coKSkpO1xuXG5cdFx0Ly8gTGlzdGVuIHRvIGVkaXRvciBjbG9zaW5nIChpZiB3ZSBydW4gd2l0aCAtLXdhaXQpXG5cdFx0Y29uc3QgZmlsZXNUb1dhaXQgPSB0aGlzLm5hdGl2ZUVudmlyb25tZW50U2VydmljZS5maWxlc1RvV2FpdDtcblx0XHRpZiAoZmlsZXNUb1dhaXQpIHtcblx0XHRcdHRoaXMudHJhY2tDbG9zZWRXYWl0RmlsZXMoZmlsZXNUb1dhaXQud2FpdE1hcmtlckZpbGVVcmksIGNvYWxlc2NlKGZpbGVzVG9XYWl0LnBhdGhzLm1hcChwYXRoID0+IHBhdGguZmlsZVVyaSkpKTtcblx0XHR9XG5cblx0XHQvLyBtYWNPUyBPUyBpbnRlZ3JhdGlvbjogcmVwcmVzZW50ZWQgZmlsZSBuYW1lXG5cdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UucGFydHMpIHtcblx0XHRcdFx0dGhpcy5oYW5kbGVSZXByZXNlbnRlZEZpbGVuYW1lKHBhcnQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvckdyb3VwU2VydmljZS5vbkRpZENyZWF0ZUF1eGlsaWFyeUVkaXRvclBhcnQocGFydCA9PiB0aGlzLmhhbmRsZVJlcHJlc2VudGVkRmlsZW5hbWUocGFydCkpKTtcblx0XHR9XG5cblx0XHQvLyBEb2N1bWVudCBlZGl0ZWQ6IGluZGljYXRlIGZvciBkaXJ0eSB3b3JraW5nIGNvcGllc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya2luZ0NvcHlTZXJ2aWNlLm9uRGlkQ2hhbmdlRGlydHkod29ya2luZ0NvcHkgPT4ge1xuXHRcdFx0Y29uc3QgZ290RGlydHkgPSB3b3JraW5nQ29weS5pc0RpcnR5KCk7XG5cdFx0XHRpZiAoZ290RGlydHkgJiYgISh3b3JraW5nQ29weS5jYXBhYmlsaXRpZXMgJiBXb3JraW5nQ29weUNhcGFiaWxpdGllcy5VbnRpdGxlZCkgJiYgdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmhhc1Nob3J0QXV0b1NhdmVEZWxheSh3b3JraW5nQ29weS5yZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBkbyBub3QgaW5kaWNhdGUgZGlydHkgb2Ygd29ya2luZyBjb3BpZXMgdGhhdCBhcmUgYXV0byBzYXZlZCBhZnRlciBzaG9ydCBkZWxheVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnVwZGF0ZURvY3VtZW50RWRpdGVkKGdvdERpcnR5ID8gdHJ1ZSA6IHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy51cGRhdGVEb2N1bWVudEVkaXRlZCh1bmRlZmluZWQpO1xuXG5cdFx0Ly8gRGV0ZWN0IG1pbmltaXplIC8gbWF4aW1pemVcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkoXG5cdFx0XHRFdmVudC5tYXAoRXZlbnQuZmlsdGVyKHRoaXMubmF0aXZlSG9zdFNlcnZpY2Uub25EaWRNYXhpbWl6ZVdpbmRvdywgd2luZG93SWQgPT4gISFoYXNXaW5kb3cod2luZG93SWQpKSwgd2luZG93SWQgPT4gKHsgbWF4aW1pemVkOiB0cnVlLCB3aW5kb3dJZCB9KSksXG5cdFx0XHRFdmVudC5tYXAoRXZlbnQuZmlsdGVyKHRoaXMubmF0aXZlSG9zdFNlcnZpY2Uub25EaWRVbm1heGltaXplV2luZG93LCB3aW5kb3dJZCA9PiAhIWhhc1dpbmRvdyh3aW5kb3dJZCkpLCB3aW5kb3dJZCA9PiAoeyBtYXhpbWl6ZWQ6IGZhbHNlLCB3aW5kb3dJZCB9KSlcblx0XHQpKGUgPT4gdGhpcy5sYXlvdXRTZXJ2aWNlLnVwZGF0ZVdpbmRvd01heGltaXplZFN0YXRlKGdldFdpbmRvd0J5SWQoZS53aW5kb3dJZCkhLndpbmRvdywgZS5tYXhpbWl6ZWQpKSk7XG5cdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLnVwZGF0ZVdpbmRvd01heGltaXplZFN0YXRlKG1haW5XaW5kb3csIHRoaXMubmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLndpbmRvdy5tYXhpbWl6ZWQgPz8gZmFsc2UpO1xuXG5cdFx0Ly8gRGV0ZWN0IHBhbmVsIHBvc2l0aW9uIHRvIGRldGVybWluZSBtaW5pbXVtIHdpZHRoXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYXlvdXRTZXJ2aWNlLm9uRGlkQ2hhbmdlUGFuZWxQb3NpdGlvbihwb3MgPT4gdGhpcy5vbkRpZENoYW5nZVBhbmVsUG9zaXRpb24ocG9zaXRpb25Gcm9tU3RyaW5nKHBvcykpKSk7XG5cdFx0dGhpcy5vbkRpZENoYW5nZVBhbmVsUG9zaXRpb24odGhpcy5sYXlvdXRTZXJ2aWNlLmdldFBhbmVsUG9zaXRpb24oKSk7XG5cblx0XHQvLyBCb3JkZXJcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4gdGhpcy51cGRhdGVXaW5kb3dCb3JkZXIoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VBY3RpdmVXaW5kb3coKCkgPT4gdGhpcy51cGRhdGVXaW5kb3dCb3JkZXIoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1cygoKSA9PiB0aGlzLnVwZGF0ZVdpbmRvd0JvcmRlcigpKSk7XG5cblx0XHQvLyBMaWZlY3ljbGVcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpZmVjeWNsZVNlcnZpY2Uub25CZWZvcmVTaHV0ZG93bihlID0+IHRoaXMub25CZWZvcmVTaHV0ZG93bihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlmZWN5Y2xlU2VydmljZS5vbkJlZm9yZVNodXRkb3duRXJyb3IoZSA9PiB0aGlzLm9uQmVmb3JlU2h1dGRvd25FcnJvcihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlmZWN5Y2xlU2VydmljZS5vbldpbGxTaHV0ZG93bihlID0+IHRoaXMub25XaWxsU2h1dGRvd24oZSkpKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlUmVwcmVzZW50ZWRGaWxlbmFtZShwYXJ0OiBJRWRpdG9yUGFydCk6IHZvaWQge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdEV2ZW50Lm9uY2UocGFydC5vbldpbGxEaXNwb3NlKSgoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpO1xuXG5cdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuZ2V0U2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UocGFydCkuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB0aGlzLnVwZGF0ZVJlcHJlc2VudGVkRmlsZW5hbWUoZWRpdG9yU2VydmljZSwgcGFydC53aW5kb3dJZCkpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUmVwcmVzZW50ZWRGaWxlbmFtZShlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSwgdGFyZ2V0V2luZG93SWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGZpbGUgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlksIGZpbHRlckJ5U2NoZW1lOiBTY2hlbWFzLmZpbGUgfSk7XG5cblx0XHQvLyBSZXByZXNlbnRlZCBGaWxlbmFtZVxuXHRcdHRoaXMubmF0aXZlSG9zdFNlcnZpY2Uuc2V0UmVwcmVzZW50ZWRGaWxlbmFtZShmaWxlPy5mc1BhdGggPz8gJycsIHsgdGFyZ2V0V2luZG93SWQgfSk7XG5cblx0XHQvLyBDdXN0b20gdGl0bGUgbWVudSAobWFpbiB3aW5kb3cgb25seSBjdXJyZW50bHkpXG5cdFx0aWYgKHRhcmdldFdpbmRvd0lkID09PSBtYWluV2luZG93LnZzY29kZVdpbmRvd0lkKSB7XG5cdFx0XHR0aGlzLnByb3ZpZGVDdXN0b21UaXRsZUNvbnRleHRNZW51KGZpbGU/LmZzUGF0aCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jcmVnaW9uIFdpbmRvdyBMaWZlY3ljbGVcblxuXHRwcml2YXRlIG9uQmVmb3JlU2h1dGRvd24oeyB2ZXRvLCByZWFzb24gfTogQmVmb3JlU2h1dGRvd25FdmVudCk6IHZvaWQge1xuXHRcdGlmIChyZWFzb24gPT09IFNodXRkb3duUmVhc29uLkNMT1NFKSB7XG5cdFx0XHRjb25zdCBjb25maXJtQmVmb3JlQ2xvc2VTZXR0aW5nID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnYWx3YXlzJyB8ICduZXZlcicgfCAna2V5Ym9hcmRPbmx5Jz4oJ3dpbmRvdy5jb25maXJtQmVmb3JlQ2xvc2UnKTtcblxuXHRcdFx0Y29uc3QgY29uZmlybUJlZm9yZUNsb3NlID0gY29uZmlybUJlZm9yZUNsb3NlU2V0dGluZyA9PT0gJ2Fsd2F5cycgfHwgKGNvbmZpcm1CZWZvcmVDbG9zZVNldHRpbmcgPT09ICdrZXlib2FyZE9ubHknICYmIE1vZGlmaWVyS2V5RW1pdHRlci5nZXRJbnN0YW5jZSgpLmlzTW9kaWZpZXJQcmVzc2VkKTtcblx0XHRcdGlmIChjb25maXJtQmVmb3JlQ2xvc2UpIHtcblxuXHRcdFx0XHQvLyBXaGVuIHdlIG5lZWQgdG8gY29uZmlybSBvbiBjbG9zZSBvciBxdWl0LCB2ZXRvIHRoZSBzaHV0ZG93blxuXHRcdFx0XHQvLyB3aXRoIGEgbG9uZyBydW5uaW5nIHByb21pc2UgdG8gZmlndXJlIG91dCB3aGV0aGVyIHNodXRkb3duXG5cdFx0XHRcdC8vIGNhbiBwcm9jZWVkIG9yIG5vdC5cblxuXHRcdFx0XHRyZXR1cm4gdmV0bygoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGxldCBhY3R1YWxSZWFzb246IFNodXRkb3duUmVhc29uID0gcmVhc29uO1xuXHRcdFx0XHRcdGlmIChyZWFzb24gPT09IFNodXRkb3duUmVhc29uLkNMT1NFICYmICFpc01hY2ludG9zaCkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgd2luZG93Q291bnQgPSBhd2FpdCB0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLmdldFdpbmRvd0NvdW50KCk7XG5cdFx0XHRcdFx0XHRpZiAod2luZG93Q291bnQgPT09IDEpIHtcblx0XHRcdFx0XHRcdFx0YWN0dWFsUmVhc29uID0gU2h1dGRvd25SZWFzb24uUVVJVDsgLy8gV2luZG93cy9MaW51eDogY2xvc2luZyBsYXN0IHdpbmRvdyBtZWFucyB0byBRVUlUXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0bGV0IGNvbmZpcm1lZCA9IHRydWU7XG5cdFx0XHRcdFx0aWYgKGNvbmZpcm1CZWZvcmVDbG9zZSkge1xuXHRcdFx0XHRcdFx0Y29uZmlybWVkID0gYXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBOYXRpdmVXaW5kb3cuY29uZmlybU9uU2h1dGRvd24oYWNjZXNzb3IsIGFjdHVhbFJlYXNvbikpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFByb2dyZXNzIGZvciBsb25nIHJ1bm5pbmcgc2h1dGRvd25cblx0XHRcdFx0XHRpZiAoY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnByb2dyZXNzT25CZWZvcmVTaHV0ZG93bihyZWFzb24pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiAhY29uZmlybWVkO1xuXHRcdFx0XHR9KSgpLCAndmV0by5jb25maXJtQmVmb3JlQ2xvc2UnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBQcm9ncmVzcyBmb3IgbG9uZyBydW5uaW5nIHNodXRkb3duXG5cdFx0dGhpcy5wcm9ncmVzc09uQmVmb3JlU2h1dGRvd24ocmVhc29uKTtcblx0fVxuXG5cdHByaXZhdGUgcHJvZ3Jlc3NPbkJlZm9yZVNodXRkb3duKHJlYXNvbjogU2h1dGRvd25SZWFzb24pOiB2b2lkIHtcblx0XHR0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uV2luZG93LCBcdC8vIHVzZSB3aW5kb3cgcHJvZ3Jlc3MgdG8gbm90IGJlIHRvbyBhbm5veWluZyBhYm91dCB0aGlzIG9wZXJhdGlvblxuXHRcdFx0ZGVsYXk6IDgwMCxcdFx0XHRcdFx0XHRcdC8vIGRlbGF5IHNvIHRoYXQgaXQgb25seSBhcHBlYXJzIHdoZW4gb3BlcmF0aW9uIHRha2VzIGEgbG9uZyB0aW1lXG5cdFx0XHR0aXRsZTogdGhpcy50b1NodXRkb3duTGFiZWwocmVhc29uLCBmYWxzZSksXG5cdFx0fSwgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIEV2ZW50LnRvUHJvbWlzZShFdmVudC5hbnkoXG5cdFx0XHRcdHRoaXMubGlmZWN5Y2xlU2VydmljZS5vbldpbGxTaHV0ZG93biwgXHQvLyBkaXNtaXNzIHRoaXMgZGlhbG9nIHdoZW4gd2Ugc2h1dGRvd25cblx0XHRcdFx0dGhpcy5saWZlY3ljbGVTZXJ2aWNlLm9uU2h1dGRvd25WZXRvLCBcdC8vIG9yIHdoZW4gc2h1dGRvd24gd2FzIHZldG9lZFxuXHRcdFx0XHR0aGlzLmRpYWxvZ1NlcnZpY2Uub25XaWxsU2hvd0RpYWxvZ1x0XHQvLyBvciB3aGVuIGEgZGlhbG9nIGFza3MgZm9yIGlucHV0XG5cdFx0XHQpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgb25CZWZvcmVTaHV0ZG93bkVycm9yKHsgZXJyb3IsIHJlYXNvbiB9OiBCZWZvcmVTaHV0ZG93bkVycm9yRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmRpYWxvZ1NlcnZpY2UuZXJyb3IodGhpcy50b1NodXRkb3duTGFiZWwocmVhc29uLCB0cnVlKSwgbG9jYWxpemUoJ3NodXRkb3duRXJyb3JEZXRhaWwnLCBcIkVycm9yOiB7MH1cIiwgdG9FcnJvck1lc3NhZ2UoZXJyb3IpKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uV2lsbFNodXRkb3duKHsgcmVhc29uLCBmb3JjZSwgam9pbmVycyB9OiBXaWxsU2h1dGRvd25FdmVudCk6IHZvaWQge1xuXG5cdFx0Ly8gRGVsYXkgc28gdGhhdCB0aGUgZGlhbG9nIG9ubHkgYXBwZWFycyBhZnRlciB0aW1lb3V0XG5cdFx0Y29uc3Qgc2h1dGRvd25EaWFsb2dTY2hlZHVsZXIgPSBuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHRjb25zdCBwZW5kaW5nSm9pbmVycyA9IGpvaW5lcnMoKTtcblxuXHRcdFx0dGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHtcblx0XHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uRGlhbG9nLCBcdFx0XHRcdC8vIHVzZSBhIGRpYWxvZyB0byBwcmV2ZW50IHRoZSB1c2VyIGZyb20gbWFraW5nIGFueSBtb3JlIGludGVyYWN0aW9ucyBub3dcblx0XHRcdFx0YnV0dG9uczogW3RoaXMudG9Gb3JjZVNodXRkb3duTGFiZWwocmVhc29uKV0sXHQvLyBhbGxvdyB0byBmb3JjZSBzaHV0ZG93biBhbnl3YXlcblx0XHRcdFx0Y2FuY2VsbGFibGU6IGZhbHNlLFx0XHRcdFx0XHRcdFx0XHQvLyBkbyBub3QgYWxsb3cgdG8gY2FuY2VsXG5cdFx0XHRcdHN0aWNreTogdHJ1ZSxcdFx0XHRcdFx0XHRcdFx0XHQvLyBkbyBub3QgYWxsb3cgdG8gZGlzbWlzc1xuXHRcdFx0XHR0aXRsZTogdGhpcy50b1NodXRkb3duTGFiZWwocmVhc29uLCBmYWxzZSksXG5cdFx0XHRcdGRldGFpbDogcGVuZGluZ0pvaW5lcnMubGVuZ3RoID4gMCA/IGxvY2FsaXplKCd3aWxsU2h1dGRvd25EZXRhaWwnLCBcIlRoZSBmb2xsb3dpbmcgb3BlcmF0aW9ucyBhcmUgc3RpbGwgcnVubmluZzogXFxuezB9XCIsIHBlbmRpbmdKb2luZXJzLm1hcChqb2luZXIgPT4gYC0gJHtqb2luZXIubGFiZWx9YCkuam9pbignXFxuJykpIDogdW5kZWZpbmVkXG5cdFx0XHR9LCAoKSA9PiB7XG5cdFx0XHRcdHJldHVybiBFdmVudC50b1Byb21pc2UodGhpcy5saWZlY3ljbGVTZXJ2aWNlLm9uRGlkU2h1dGRvd24pOyAvLyBkaXNtaXNzIHRoaXMgZGlhbG9nIHdoZW4gd2UgYWN0dWFsbHkgc2h1dGRvd25cblx0XHRcdH0sICgpID0+IHtcblx0XHRcdFx0Zm9yY2UoKTtcblx0XHRcdH0pO1xuXHRcdH0sIDEyMDApO1xuXHRcdHNodXRkb3duRGlhbG9nU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cblx0XHQvLyBEaXNwb3NlIHNjaGVkdWxlciB3aGVuIHdlIGFjdHVhbGx5IHNodXRkb3duXG5cdFx0RXZlbnQub25jZSh0aGlzLmxpZmVjeWNsZVNlcnZpY2Uub25EaWRTaHV0ZG93bikoKCkgPT4gc2h1dGRvd25EaWFsb2dTY2hlZHVsZXIuZGlzcG9zZSgpKTtcblx0fVxuXG5cdHByaXZhdGUgdG9TaHV0ZG93bkxhYmVsKHJlYXNvbjogU2h1dGRvd25SZWFzb24sIGlzRXJyb3I6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdGlmIChpc0Vycm9yKSB7XG5cdFx0XHRzd2l0Y2ggKHJlYXNvbikge1xuXHRcdFx0XHRjYXNlIFNodXRkb3duUmVhc29uLkNMT1NFOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2h1dGRvd25FcnJvckNsb3NlJywgXCJBbiB1bmV4cGVjdGVkIGVycm9yIHByZXZlbnRlZCB0aGUgd2luZG93IHRvIGNsb3NlXCIpO1xuXHRcdFx0XHRjYXNlIFNodXRkb3duUmVhc29uLlFVSVQ6XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzaHV0ZG93bkVycm9yUXVpdCcsIFwiQW4gdW5leHBlY3RlZCBlcnJvciBwcmV2ZW50ZWQgdGhlIGFwcGxpY2F0aW9uIHRvIHF1aXRcIik7XG5cdFx0XHRcdGNhc2UgU2h1dGRvd25SZWFzb24uUkVMT0FEOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2h1dGRvd25FcnJvclJlbG9hZCcsIFwiQW4gdW5leHBlY3RlZCBlcnJvciBwcmV2ZW50ZWQgdGhlIHdpbmRvdyB0byByZWxvYWRcIik7XG5cdFx0XHRcdGNhc2UgU2h1dGRvd25SZWFzb24uTE9BRDpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NodXRkb3duRXJyb3JMb2FkJywgXCJBbiB1bmV4cGVjdGVkIGVycm9yIHByZXZlbnRlZCB0byBjaGFuZ2UgdGhlIHdvcmtzcGFjZVwiKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzd2l0Y2ggKHJlYXNvbikge1xuXHRcdFx0Y2FzZSBTaHV0ZG93blJlYXNvbi5DTE9TRTpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzaHV0ZG93blRpdGxlQ2xvc2UnLCBcIkNsb3NpbmcgdGhlIHdpbmRvdyBpcyB0YWtpbmcgYSBiaXQgbG9uZ2VyLi4uXCIpO1xuXHRcdFx0Y2FzZSBTaHV0ZG93blJlYXNvbi5RVUlUOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NodXRkb3duVGl0bGVRdWl0JywgXCJRdWl0dGluZyB0aGUgYXBwbGljYXRpb24gaXMgdGFraW5nIGEgYml0IGxvbmdlci4uLlwiKTtcblx0XHRcdGNhc2UgU2h1dGRvd25SZWFzb24uUkVMT0FEOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NodXRkb3duVGl0bGVSZWxvYWQnLCBcIlJlbG9hZGluZyB0aGUgd2luZG93IGlzIHRha2luZyBhIGJpdCBsb25nZXIuLi5cIik7XG5cdFx0XHRjYXNlIFNodXRkb3duUmVhc29uLkxPQUQ6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2h1dGRvd25UaXRsZUxvYWQnLCBcIkNoYW5naW5nIHRoZSB3b3Jrc3BhY2UgaXMgdGFraW5nIGEgYml0IGxvbmdlci4uLlwiKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRvRm9yY2VTaHV0ZG93bkxhYmVsKHJlYXNvbjogU2h1dGRvd25SZWFzb24pOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAocmVhc29uKSB7XG5cdFx0XHRjYXNlIFNodXRkb3duUmVhc29uLkNMT1NFOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NodXRkb3duRm9yY2VDbG9zZScsIFwiQ2xvc2UgQW55d2F5XCIpO1xuXHRcdFx0Y2FzZSBTaHV0ZG93blJlYXNvbi5RVUlUOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NodXRkb3duRm9yY2VRdWl0JywgXCJRdWl0IEFueXdheVwiKTtcblx0XHRcdGNhc2UgU2h1dGRvd25SZWFzb24uUkVMT0FEOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NodXRkb3duRm9yY2VSZWxvYWQnLCBcIlJlbG9hZCBBbnl3YXlcIik7XG5cdFx0XHRjYXNlIFNodXRkb3duUmVhc29uLkxPQUQ6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2h1dGRvd25Gb3JjZUxvYWQnLCBcIkNoYW5nZSBBbnl3YXlcIik7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSB1cGRhdGVEb2N1bWVudEVkaXRlZChkb2N1bWVudEVkaXRlZDogdHJ1ZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGxldCBzZXREb2N1bWVudEVkaXRlZDogYm9vbGVhbjtcblx0XHRpZiAodHlwZW9mIGRvY3VtZW50RWRpdGVkID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHNldERvY3VtZW50RWRpdGVkID0gZG9jdW1lbnRFZGl0ZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNldERvY3VtZW50RWRpdGVkID0gdGhpcy53b3JraW5nQ29weVNlcnZpY2UuaGFzRGlydHk7XG5cdFx0fVxuXG5cdFx0aWYgKCghdGhpcy5pc0RvY3VtZW50ZWRFZGl0ZWQgJiYgc2V0RG9jdW1lbnRFZGl0ZWQpIHx8ICh0aGlzLmlzRG9jdW1lbnRlZEVkaXRlZCAmJiAhc2V0RG9jdW1lbnRFZGl0ZWQpKSB7XG5cdFx0XHR0aGlzLmlzRG9jdW1lbnRlZEVkaXRlZCA9IHNldERvY3VtZW50RWRpdGVkO1xuXG5cdFx0XHR0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLnNldERvY3VtZW50RWRpdGVkKHNldERvY3VtZW50RWRpdGVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFdpbmRvd01pbmltdW1XaWR0aChwYW5lbFBvc2l0aW9uOiBQb3NpdGlvbiA9IHRoaXMubGF5b3V0U2VydmljZS5nZXRQYW5lbFBvc2l0aW9uKCkpOiBudW1iZXIge1xuXG5cdFx0Ly8gaWYgcGFuZWwgaXMgb24gdGhlIHNpZGUsIHRoZW4gcmV0dXJuIHRoZSBsYXJnZXIgbWlud2lkdGhcblx0XHRjb25zdCBwYW5lbE9uU2lkZSA9IHBhbmVsUG9zaXRpb24gPT09IFBvc2l0aW9uLkxFRlQgfHwgcGFuZWxQb3NpdGlvbiA9PT0gUG9zaXRpb24uUklHSFQ7XG5cdFx0aWYgKHBhbmVsT25TaWRlKSB7XG5cdFx0XHRyZXR1cm4gV2luZG93TWluaW11bVNpemUuV0lEVEhfV0lUSF9WRVJUSUNBTF9QQU5FTDtcblx0XHR9XG5cblx0XHRyZXR1cm4gV2luZG93TWluaW11bVNpemUuV0lEVEg7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlUGFuZWxQb3NpdGlvbihwb3M6IFBvc2l0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgbWluV2lkdGggPSB0aGlzLmdldFdpbmRvd01pbmltdW1XaWR0aChwb3MpO1xuXG5cdFx0dGhpcy5uYXRpdmVIb3N0U2VydmljZS5zZXRNaW5pbXVtU2l6ZShtaW5XaWR0aCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgbWF5YmVDbG9zZVdpbmRvdygpOiB2b2lkIHtcblx0XHRjb25zdCBjbG9zZVdoZW5FbXB0eSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3dpbmRvdy5jbG9zZVdoZW5FbXB0eScpIHx8IHRoaXMubmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3Mud2FpdDtcblx0XHRpZiAoIWNsb3NlV2hlbkVtcHR5KSB7XG5cdFx0XHRyZXR1cm47IC8vIHJldHVybiBlYXJseSBpZiBjb25maWd1cmVkIHRvIG5vdCBjbG9zZSB3aGVuIGVtcHR5XG5cdFx0fVxuXG5cdFx0Ly8gQ2xvc2UgZW1wdHkgZWRpdG9yIGdyb3VwcyBiYXNlZCBvbiBzZXR0aW5nIGFuZCBlbnZpcm9ubWVudFxuXHRcdGZvciAoY29uc3QgZWRpdG9yUGFydCBvZiB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5wYXJ0cykge1xuXHRcdFx0aWYgKGVkaXRvclBhcnQuZ3JvdXBzLnNvbWUoZ3JvdXAgPT4gIWdyb3VwLmlzRW1wdHkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBub3QgZW1wdHlcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVkaXRvclBhcnQgPT09IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0ICYmIChcblx0XHRcdFx0dGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpICE9PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSB8fFx0Ly8gb25seSBmb3IgZW1wdHkgd2luZG93c1xuXHRcdFx0XHR0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0V4dGVuc2lvbkRldmVsb3BtZW50IHx8XHRcdFx0XHRcdC8vIG5vdCB3aGVuIGRldmVsb3BpbmcgYW4gZXh0ZW5zaW9uXG5cdFx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS52aXNpYmxlRWRpdG9ycy5sZW5ndGggPiAwXHRcdFx0XHRcdFx0Ly8gbm90IHdoZW4gdGhlcmUgYXJlIHN0aWxsIGVkaXRvcnMgb3BlbiBpbiBvdGhlciB3aW5kb3dzXG5cdFx0XHQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWRpdG9yUGFydCA9PT0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UubWFpblBhcnQpIHtcblx0XHRcdFx0dGhpcy5uYXRpdmVIb3N0U2VydmljZS5jbG9zZVdpbmRvdygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZWRpdG9yUGFydC5yZW1vdmVHcm91cChlZGl0b3JQYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHByb3ZpZGVDdXN0b21UaXRsZUNvbnRleHRNZW51KGZpbGVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblxuXHRcdC8vIENsZWFyIG9sZCBtZW51XG5cdFx0dGhpcy5jdXN0b21UaXRsZUNvbnRleHRNZW51RGlzcG9zYWJsZS5jbGVhcigpO1xuXG5cdFx0Ly8gT25seSBwcm92aWRlIGEgbWVudSB3aGVuIHdlIGhhdmUgYSBmaWxlIHBhdGggYW5kIGN1c3RvbSB0aXRsZWJhclxuXHRcdGlmICghZmlsZVBhdGggfHwgaGFzTmF0aXZlVGl0bGViYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTcGxpdCB1cCBmaWxlcGF0aCBpbnRvIHNlZ21lbnRzXG5cdFx0Y29uc3Qgc2VnbWVudHMgPSBmaWxlUGF0aC5zcGxpdChwb3NpeC5zZXApO1xuXHRcdGZvciAobGV0IGkgPSBzZWdtZW50cy5sZW5ndGg7IGkgPiAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IGlzRmlsZSA9IChpID09PSBzZWdtZW50cy5sZW5ndGgpO1xuXG5cdFx0XHRsZXQgcGF0aE9mZnNldCA9IGk7XG5cdFx0XHRpZiAoIWlzRmlsZSkge1xuXHRcdFx0XHRwYXRoT2Zmc2V0Kys7IC8vIGZvciBzZWdtZW50cyB3aGljaCBhcmUgbm90IHRoZSBmaWxlIG5hbWUgd2Ugd2FudCB0byBvcGVuIHRoZSBmb2xkZXJcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcGF0aCA9IFVSSS5maWxlKHNlZ21lbnRzLnNsaWNlKDAsIHBhdGhPZmZzZXQpLmpvaW4ocG9zaXguc2VwKSk7XG5cblx0XHRcdGxldCBsYWJlbDogc3RyaW5nO1xuXHRcdFx0aWYgKCFpc0ZpbGUpIHtcblx0XHRcdFx0bGFiZWwgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKGRpcm5hbWUocGF0aCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGFiZWwgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHBhdGgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb21tYW5kSWQgPSBgd29ya2JlbmNoLmFjdGlvbi5yZXZlYWxQYXRoSW5GaW5kZXIke2l9YDtcblx0XHRcdHRoaXMuY3VzdG9tVGl0bGVDb250ZXh0TWVudURpc3Bvc2FibGUuYWRkKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKGNvbW1hbmRJZCwgKCkgPT4gdGhpcy5uYXRpdmVIb3N0U2VydmljZS5zaG93SXRlbUluRm9sZGVyKHBhdGguZnNQYXRoKSkpO1xuXHRcdFx0dGhpcy5jdXN0b21UaXRsZUNvbnRleHRNZW51RGlzcG9zYWJsZS5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5UaXRsZUJhclRpdGxlQ29udGV4dCwgeyBjb21tYW5kOiB7IGlkOiBjb21tYW5kSWQsIHRpdGxlOiBsYWJlbCB8fCBwb3NpeC5zZXAgfSwgb3JkZXI6IC1pLCBncm91cDogJzFfZmlsZScgfSkpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGUoKTogdm9pZCB7XG5cblx0XHQvLyBIYW5kbGUgb3BlbiBjYWxsc1xuXHRcdHRoaXMuc2V0dXBPcGVuSGFuZGxlcnMoKTtcblxuXHRcdC8vIE5vdGlmeSBzb21lIHNlcnZpY2VzIGFib3V0IGxpZmVjeWNsZSBwaGFzZXNcblx0XHR0aGlzLmxpZmVjeWNsZVNlcnZpY2Uud2hlbihMaWZlY3ljbGVQaGFzZS5SZWFkeSkudGhlbigoKSA9PiB0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLm5vdGlmeVJlYWR5KCkpO1xuXHRcdHRoaXMubGlmZWN5Y2xlU2VydmljZS53aGVuKExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKS50aGVuKCgpID0+IHtcblx0XHRcdHRoaXMuc2hhcmVkUHJvY2Vzc1NlcnZpY2Uubm90aWZ5UmVzdG9yZWQoKTtcblx0XHRcdHRoaXMudXRpbGl0eVByb2Nlc3NXb3JrZXJXb3JrYmVuY2hTZXJ2aWNlLm5vdGlmeVJlc3RvcmVkKCk7XG5cdFx0fSk7XG5cblx0XHQvLyBDaGVjayBmb3Igc2l0dWF0aW9ucyB0aGF0IGFyZSB3b3J0aCB3YXJuaW5nIHRoZSB1c2VyIGFib3V0XG5cdFx0dGhpcy5oYW5kbGVXYXJuaW5ncygpO1xuXG5cdFx0Ly8gVG91Y2hiYXIgbWVudSAoaWYgZW5hYmxlZClcblx0XHR0aGlzLnVwZGF0ZVRvdWNoYmFyTWVudSgpO1xuXG5cdFx0Ly8gV2luZG93IGJvcmRlclxuXHRcdHRoaXMudXBkYXRlV2luZG93Qm9yZGVyKCk7XG5cblx0XHQvLyBTbW9rZSBUZXN0IERyaXZlclxuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5lbmFibGVTbW9rZVRlc3REcml2ZXIpIHtcblx0XHRcdHJlZ2lzdGVyV2luZG93RHJpdmVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlV2FybmluZ3MoKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBBZnRlciByZXN0b3JlZCBwaGFzZSBpcyBmaW5lIGZvciB0aGUgZm9sbG93aW5nIG9uZXNcblx0XHRhd2FpdCB0aGlzLmxpZmVjeWNsZVNlcnZpY2Uud2hlbihMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG5cblx0XHQvLyBJbnRlZ3JpdHkgLyBSb290IHdhcm5pbmdcblx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXNBZG1pbiA9IGF3YWl0IHRoaXMubmF0aXZlSG9zdFNlcnZpY2UuaXNBZG1pbigpO1xuXHRcdFx0Y29uc3QgeyBpc1B1cmUgfSA9IGF3YWl0IHRoaXMuaW50ZWdyaXR5U2VydmljZS5pc1B1cmUoKTtcblxuXHRcdFx0Ly8gVXBkYXRlIHRvIHRpdGxlXG5cdFx0XHR0aGlzLnRpdGxlU2VydmljZS51cGRhdGVQcm9wZXJ0aWVzKHsgaXNQdXJlLCBpc0FkbWluIH0pO1xuXG5cdFx0XHQvLyBTaG93IHdhcm5pbmcgbWVzc2FnZSAodW5peCBvbmx5KVxuXHRcdFx0aWYgKGlzQWRtaW4gJiYgIWlzV2luZG93cykge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgncnVubmluZ0FzUm9vdCcsIFwiSXQgaXMgbm90IHJlY29tbWVuZGVkIHRvIHJ1biB7MH0gYXMgcm9vdCB1c2VyLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCkpO1xuXHRcdFx0fVxuXHRcdH0pKCk7XG5cblx0XHQvLyBJbnN0YWxsYXRpb24gRGlyIFdhcm5pbmdcblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCAmJiAhdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uRGV2ZWxvcG1lbnRMb2NhdGlvblVSST8ubGVuZ3RoKSB7XG5cdFx0XHRsZXQgaW5zdGFsbExvY2F0aW9uVXJpOiBVUkk7XG5cdFx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdFx0Ly8gYXBwUm9vdCA9IC9BcHBsaWNhdGlvbnMvVmlzdWFsIFN0dWRpbyBDb2RlIC0gSW5zaWRlcnMuYXBwL0NvbnRlbnRzL1Jlc291cmNlcy9hcHBcblx0XHRcdFx0aW5zdGFsbExvY2F0aW9uVXJpID0gZGlybmFtZShkaXJuYW1lKGRpcm5hbWUoVVJJLmZpbGUodGhpcy5uYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UuYXBwUm9vdCkpKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBhcHBSb290ID0gQzpcXFVzZXJzXFw8bmFtZT5cXEFwcERhdGFcXExvY2FsXFxQcm9ncmFtc1xcTWljcm9zb2Z0IFZTIENvZGUgSW5zaWRlcnNcXHJlc291cmNlc1xcYXBwXG5cdFx0XHRcdC8vIGFwcFJvb3QgPSAvdXNyL3NoYXJlL2NvZGUtaW5zaWRlcnMvcmVzb3VyY2VzL2FwcFxuXHRcdFx0XHRpbnN0YWxsTG9jYXRpb25VcmkgPSBkaXJuYW1lKGRpcm5hbWUoVVJJLmZpbGUodGhpcy5uYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UuYXBwUm9vdCkpKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzKSB7XG5cdFx0XHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbE9yUGFyZW50KGZvbGRlci51cmksIGluc3RhbGxMb2NhdGlvblVyaSkpIHtcblx0XHRcdFx0XHR0aGlzLmJhbm5lclNlcnZpY2Uuc2hvdyh7XG5cdFx0XHRcdFx0XHRpZDogJ2FwcFJvb3RXYXJuaW5nLmJhbm5lcicsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnYXBwUm9vdFdhcm5pbmcuYmFubmVyJywgXCJGaWxlcyB5b3Ugc3RvcmUgd2l0aGluIHRoZSBpbnN0YWxsYXRpb24gZm9sZGVyICgnezB9JykgbWF5IGJlIE9WRVJXUklUVEVOIG9yIERFTEVURUQgSVJSRVZFUlNJQkxZIHdpdGhvdXQgd2FybmluZyBhdCB1cGRhdGUgdGltZS5cIiwgdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoaW5zdGFsbExvY2F0aW9uVXJpKSksXG5cdFx0XHRcdFx0XHRpY29uOiBDb2RpY29uLndhcm5pbmdcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gbWFjT1MgMTEgd2FybmluZ1xuXHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0Y29uc3QgbWFqb3JWZXJzaW9uID0gdGhpcy5uYXRpdmVFbnZpcm9ubWVudFNlcnZpY2Uub3MucmVsZWFzZS5zcGxpdCgnLicpWzBdO1xuXHRcdFx0Y29uc3QgZW9sUmVsZWFzZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPihbXG5cdFx0XHRcdFsnMjAnLCAnbWFjT1MgQmlnIFN1ciddLFxuXHRcdFx0XSk7XG5cblx0XHRcdGlmIChlb2xSZWxlYXNlcy5oYXMobWFqb3JWZXJzaW9uKSkge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gbG9jYWxpemUoJ21hY29zZW9sbWVzc2FnZScsIFwiezB9IG9uIHsxfSB3aWxsIHNvb24gc3RvcCByZWNlaXZpbmcgdXBkYXRlcy4gQ29uc2lkZXIgdXBncmFkaW5nIHlvdXIgbWFjT1MgdmVyc2lvbi5cIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZywgZW9sUmVsZWFzZXMuZ2V0KG1ham9yVmVyc2lvbikpO1xuXG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFx0U2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2xlYXJuTW9yZScsIFwiTGVhcm4gTW9yZVwiKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKCdodHRwczovL2FrYS5tcy92c2NvZGUtZmFxLW9sZC1tYWNPUycpKVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG5ldmVyU2hvd0FnYWluOiB7IGlkOiAnbWFjb3Nlb2wnLCBpc1NlY29uZGFyeTogdHJ1ZSwgc2NvcGU6IE5ldmVyU2hvd0FnYWluU2NvcGUuQVBQTElDQVRJT04gfSxcblx0XHRcdFx0XHRcdHByaW9yaXR5OiBOb3RpZmljYXRpb25Qcmlvcml0eS5VUkdFTlQsXG5cdFx0XHRcdFx0XHRzdGlja3k6IHRydWVcblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2xvdyBzaGVsbCBlbnZpcm9ubWVudCBwcm9ncmVzcyBpbmRpY2F0b3Jcblx0XHRjb25zdCBzaGVsbEVudiA9IHByb2Nlc3Muc2hlbGxFbnYoKTtcblx0XHR0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdyZXNvbHZlU2hlbGxFbnZpcm9ubWVudCcsIFwiUmVzb2x2aW5nIHNoZWxsIGVudmlyb25tZW50Li4uXCIpLFxuXHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uV2luZG93LFxuXHRcdFx0ZGVsYXk6IDE2MDAsXG5cdFx0XHRidXR0b25zOiBbbG9jYWxpemUoJ2xlYXJuTW9yZScsIFwiTGVhcm4gTW9yZVwiKV1cblx0XHR9LCAoKSA9PiBzaGVsbEVudiwgKCkgPT4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oJ2h0dHBzOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP2xpbmtpZD0yMTQ5NjY3JykpO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUV4dGVybmFsVXJpKHVyaTogVVJJLCBvcHRpb25zPzogT3Blbk9wdGlvbnMpOiBQcm9taXNlPElSZXNvbHZlZEV4dGVybmFsVXJpIHwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IHF1ZXJ5VHVubmVsOiBSZW1vdGVUdW5uZWwgfCBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG9wdGlvbnM/LmFsbG93VHVubmVsaW5nKSB7XG5cdFx0XHRjb25zdCBwb3J0TWFwcGluZ1JlcXVlc3QgPSBleHRyYWN0TG9jYWxIb3N0VXJpTWV0YURhdGFGb3JQb3J0TWFwcGluZyh1cmkpO1xuXHRcdFx0Y29uc3QgcXVlcnlQb3J0TWFwcGluZyA9IGV4dHJhY3RRdWVyeUxvY2FsSG9zdFVyaU1ldGFEYXRhRm9yUG9ydE1hcHBpbmcodXJpKTtcblx0XHRcdGlmIChxdWVyeVBvcnRNYXBwaW5nKSB7XG5cdFx0XHRcdHF1ZXJ5VHVubmVsID0gYXdhaXQgdGhpcy5vcGVuVHVubmVsKHF1ZXJ5UG9ydE1hcHBpbmcuYWRkcmVzcywgcXVlcnlQb3J0TWFwcGluZy5wb3J0KTtcblx0XHRcdFx0aWYgKHF1ZXJ5VHVubmVsICYmICh0eXBlb2YgcXVlcnlUdW5uZWwgIT09ICdzdHJpbmcnKSkge1xuXHRcdFx0XHRcdC8vIElmIHRoZSB0dW5uZWwgd2FzIG1hcHBlZCB0byBhIGRpZmZlcmVudCBwb3J0LCBkaXNwb3NlIGl0LCBiZWNhdXNlIHNvbWUgc2VydmljZXNcblx0XHRcdFx0XHQvLyB2YWxpZGF0ZSB0aGUgcG9ydCBudW1iZXIgaW4gdGhlIHF1ZXJ5IHN0cmluZy5cblx0XHRcdFx0XHRpZiAocXVlcnlUdW5uZWwudHVubmVsUmVtb3RlUG9ydCAhPT0gcXVlcnlQb3J0TWFwcGluZy5wb3J0KSB7XG5cdFx0XHRcdFx0XHRxdWVyeVR1bm5lbC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRxdWVyeVR1bm5lbCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKCFwb3J0TWFwcGluZ1JlcXVlc3QpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgdHVubmVsID0gcXVlcnlUdW5uZWw7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdFx0cmVzb2x2ZWQ6IHVyaSxcblx0XHRcdFx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB0dW5uZWwuZGlzcG9zZSgpXG5cdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwb3J0TWFwcGluZ1JlcXVlc3QpIHtcblx0XHRcdFx0Y29uc3QgdHVubmVsID0gYXdhaXQgdGhpcy5vcGVuVHVubmVsKHBvcnRNYXBwaW5nUmVxdWVzdC5hZGRyZXNzLCBwb3J0TWFwcGluZ1JlcXVlc3QucG9ydCk7XG5cdFx0XHRcdGlmICh0dW5uZWwgJiYgKHR5cGVvZiB0dW5uZWwgIT09ICdzdHJpbmcnKSkge1xuXHRcdFx0XHRcdGNvbnN0IGFkZHJlc3NBc1VyaSA9IFVSSS5wYXJzZSh0dW5uZWwubG9jYWxBZGRyZXNzKS53aXRoKHsgcGF0aDogdXJpLnBhdGggfSk7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBhZGRyZXNzQXNVcmkuc2NoZW1lLnN0YXJ0c1dpdGgodXJpLnNjaGVtZSkgPyBhZGRyZXNzQXNVcmkgOiB1cmkud2l0aCh7IGF1dGhvcml0eTogdHVubmVsLmxvY2FsQWRkcmVzcyB9KTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZWQsXG5cdFx0XHRcdFx0XHRkaXNwb3NlKCkge1xuXHRcdFx0XHRcdFx0XHR0dW5uZWwuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHRpZiAocXVlcnlUdW5uZWwgJiYgKHR5cGVvZiBxdWVyeVR1bm5lbCAhPT0gJ3N0cmluZycpKSB7XG5cdFx0XHRcdFx0XHRcdFx0cXVlcnlUdW5uZWwuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghb3B0aW9ucz8ub3BlbkV4dGVybmFsKSB7XG5cdFx0XHRjb25zdCBjYW5IYW5kbGVSZXNvdXJjZSA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY2FuSGFuZGxlUmVzb3VyY2UodXJpKTtcblx0XHRcdGlmIChjYW5IYW5kbGVSZXNvdXJjZSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJlc29sdmVkOiBVUkkuZnJvbSh7XG5cdFx0XHRcdFx0XHRzY2hlbWU6IHRoaXMucHJvZHVjdFNlcnZpY2UudXJsUHJvdG9jb2wsXG5cdFx0XHRcdFx0XHRwYXRoOiAnd29ya3NwYWNlJyxcblx0XHRcdFx0XHRcdHF1ZXJ5OiB1cmkudG9TdHJpbmcoKVxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdGRpc3Bvc2UoKSB7IH1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuVHVubmVsKGFkZHJlc3M6IHN0cmluZywgcG9ydDogbnVtYmVyKTogUHJvbWlzZTxSZW1vdGVUdW5uZWwgfCBzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdFx0Y29uc3QgYWRkcmVzc1Byb3ZpZGVyOiBJQWRkcmVzc1Byb3ZpZGVyIHwgdW5kZWZpbmVkID0gcmVtb3RlQXV0aG9yaXR5ID8ge1xuXHRcdFx0Z2V0QWRkcmVzczogYXN5bmMgKCk6IFByb21pc2U8SUFkZHJlc3M+ID0+IHtcblx0XHRcdFx0cmV0dXJuIChhd2FpdCB0aGlzLnJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZS5yZXNvbHZlQXV0aG9yaXR5KHJlbW90ZUF1dGhvcml0eSkpLmF1dGhvcml0eTtcblx0XHRcdH1cblx0XHR9IDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgdHVubmVsID0gYXdhaXQgdGhpcy50dW5uZWxTZXJ2aWNlLmdldEV4aXN0aW5nVHVubmVsKGFkZHJlc3MsIHBvcnQpO1xuXHRcdGlmICghdHVubmVsIHx8ICh0eXBlb2YgdHVubmVsID09PSAnc3RyaW5nJykpIHtcblx0XHRcdHJldHVybiB0aGlzLnR1bm5lbFNlcnZpY2Uub3BlblR1bm5lbChhZGRyZXNzUHJvdmlkZXIsIGFkZHJlc3MsIHBvcnQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0dW5uZWw7XG5cdH1cblxuXHRwcml2YXRlIHNldHVwT3BlbkhhbmRsZXJzKCk6IHZvaWQge1xuXG5cdFx0Ly8gSGFuZGxlIGV4dGVybmFsIG9wZW4oKSBjYWxsc1xuXHRcdHRoaXMub3BlbmVyU2VydmljZS5zZXREZWZhdWx0RXh0ZXJuYWxPcGVuZXIoe1xuXHRcdFx0b3BlbkV4dGVybmFsOiBhc3luYyAoaHJlZjogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLm9wZW5FeHRlcm5hbChocmVmLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ3dvcmtiZW5jaC5leHRlcm5hbEJyb3dzZXInKSk7XG5cdFx0XHRcdGlmICghc3VjY2Vzcykge1xuXHRcdFx0XHRcdGNvbnN0IGZpbGVDYW5kaWRhdGUgPSBVUkkucGFyc2UoaHJlZik7XG5cdFx0XHRcdFx0aWYgKGZpbGVDYW5kaWRhdGUuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0XHRcdC8vIGlmIG9wZW5pbmcgZmFpbGVkLCBhbmQgdGhpcyBpcyBhIGZpbGUsIHdlIGNhbiBzdGlsbCB0cnkgdG8gcmV2ZWFsIGl0XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLnNob3dJdGVtSW5Gb2xkZXIoZmlsZUNhbmRpZGF0ZS5mc1BhdGgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgZXh0ZXJuYWwgVVJJIHJlc29sdmVyXG5cdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLnJlZ2lzdGVyRXh0ZXJuYWxVcmlSZXNvbHZlcih7XG5cdFx0XHRyZXNvbHZlRXh0ZXJuYWxVcmk6IGFzeW5jICh1cmk6IFVSSSwgb3B0aW9ucz86IE9wZW5PcHRpb25zKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlc29sdmVFeHRlcm5hbFVyaSh1cmksIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Ly8jcmVnaW9uIFRvdWNoYmFyXG5cblx0cHJpdmF0ZSB0b3VjaEJhck1lbnU6IElNZW51IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRvdWNoQmFyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIGxhc3RJbnN0YWxsZWRUb3VjaGVkQmFyOiBJQ29tbWFuZEFjdGlvbltdW10gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSB1cGRhdGVUb3VjaGJhck1lbnUoKTogdm9pZCB7XG5cdFx0aWYgKCFpc01hY2ludG9zaCkge1xuXHRcdFx0cmV0dXJuOyAvLyBtYWNPUyBvbmx5XG5cdFx0fVxuXG5cdFx0Ly8gRGlzcG9zZSBvbGRcblx0XHR0aGlzLnRvdWNoQmFyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLnRvdWNoQmFyTWVudSA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIENyZWF0ZSBuZXcgKGRlbGF5ZWQpXG5cdFx0Y29uc3Qgc2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyID0gdGhpcy50b3VjaEJhckRpc3Bvc2FibGVzLmFkZChuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLmRvVXBkYXRlVG91Y2hiYXJNZW51KHNjaGVkdWxlciksIDMwMCkpO1xuXHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1VwZGF0ZVRvdWNoYmFyTWVudShzY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudG91Y2hCYXJNZW51KSB7XG5cdFx0XHRjb25zdCBzY29wZWRDb250ZXh0S2V5U2VydmljZSA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lPy5zY29wZWRDb250ZXh0S2V5U2VydmljZSB8fCB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cC5zY29wZWRDb250ZXh0S2V5U2VydmljZTtcblx0XHRcdHRoaXMudG91Y2hCYXJNZW51ID0gdGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5Ub3VjaEJhckNvbnRleHQsIHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdHRoaXMudG91Y2hCYXJEaXNwb3NhYmxlcy5hZGQodGhpcy50b3VjaEJhck1lbnUpO1xuXHRcdFx0dGhpcy50b3VjaEJhckRpc3Bvc2FibGVzLmFkZCh0aGlzLnRvdWNoQmFyTWVudS5vbkRpZENoYW5nZSgoKSA9PiBzY2hlZHVsZXIuc2NoZWR1bGUoKSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc2FibGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgna2V5Ym9hcmQudG91Y2hiYXIuZW5hYmxlZCcpID09PSBmYWxzZTtcblx0XHRjb25zdCB0b3VjaGJhcklnbm9yZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdrZXlib2FyZC50b3VjaGJhci5pZ25vcmVkJyk7XG5cdFx0Y29uc3QgaWdub3JlZEl0ZW1zID0gQXJyYXkuaXNBcnJheSh0b3VjaGJhcklnbm9yZWQpID8gdG91Y2hiYXJJZ25vcmVkIDogW107XG5cblx0XHQvLyBGaWxsIGFjdGlvbnMgaW50byBncm91cHMgcmVzcGVjdGluZyBvcmRlclxuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyh0aGlzLnRvdWNoQmFyTWVudS5nZXRBY3Rpb25zKCkpO1xuXG5cdFx0Ly8gQ29udmVydCBpbnRvIGNvbW1hbmQgYWN0aW9uIG11bHRpIGFycmF5XG5cdFx0Y29uc3QgaXRlbXM6IElDb21tYW5kQWN0aW9uW11bXSA9IFtdO1xuXHRcdGxldCBncm91cDogSUNvbW1hbmRBY3Rpb25bXSA9IFtdO1xuXHRcdGlmICghZGlzYWJsZWQpIHtcblx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblxuXHRcdFx0XHQvLyBDb21tYW5kXG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdGlmIChpZ25vcmVkSXRlbXMuaW5kZXhPZihhY3Rpb24uaXRlbS5pZCkgPj0gMCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7IC8vIGlnbm9yZWRcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRncm91cC5wdXNoKGFjdGlvbi5pdGVtKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFNlcGFyYXRvclxuXHRcdFx0XHRlbHNlIGlmIChhY3Rpb24gaW5zdGFuY2VvZiBTZXBhcmF0b3IpIHtcblx0XHRcdFx0XHRpZiAoZ3JvdXAubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRpdGVtcy5wdXNoKGdyb3VwKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRncm91cCA9IFtdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChncm91cC5sZW5ndGgpIHtcblx0XHRcdFx0aXRlbXMucHVzaChncm91cCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gT25seSB1cGRhdGUgaWYgdGhlIGFjdGlvbnMgaGF2ZSBjaGFuZ2VkXG5cdFx0aWYgKCFlcXVhbHModGhpcy5sYXN0SW5zdGFsbGVkVG91Y2hlZEJhciwgaXRlbXMpKSB7XG5cdFx0XHR0aGlzLmxhc3RJbnN0YWxsZWRUb3VjaGVkQmFyID0gaXRlbXM7XG5cdFx0XHR0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLnVwZGF0ZVRvdWNoQmFyKGl0ZW1zKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gV2luZG93IEJvcmRlclxuXG5cdHByaXZhdGUgdXBkYXRlV2luZG93Qm9yZGVyKCk6IHZvaWQge1xuXHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRyZXR1cm47IC8vIHdpbmRvd3Mgb25seVxuXHRcdH1cblxuXHRcdGNvbnN0IHRoZW1lID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXG5cdFx0bGV0IGFjdGl2ZUJvcmRlciA9IHRoZW1lLmdldENvbG9yKFdJTkRPV19BQ1RJVkVfQk9SREVSKT8udG9TdHJpbmcoKTtcblx0XHRsZXQgaW5hY3RpdmVCb3JkZXIgPSB0aGVtZS5nZXRDb2xvcihXSU5ET1dfSU5BQ1RJVkVfQk9SREVSKT8udG9TdHJpbmcoKTtcblxuXHRcdGNvbnN0IGJvcmRlclNldHRpbmcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ3dpbmRvdy5ib3JkZXInKTtcblx0XHRpZiAoYm9yZGVyU2V0dGluZyA9PT0gJ29mZicpIHtcblx0XHRcdGFjdGl2ZUJvcmRlciA9ICdvZmYnO1xuXHRcdFx0aW5hY3RpdmVCb3JkZXIgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmIChib3JkZXJTZXR0aW5nID09PSAnZGVmYXVsdCcpIHtcblx0XHRcdGFjdGl2ZUJvcmRlciA9IGFjdGl2ZUJvcmRlciA/PyAnZGVmYXVsdCc7XG5cdFx0fSBlbHNlIGlmIChib3JkZXJTZXR0aW5nID09PSAnc3lzdGVtJykge1xuXHRcdFx0YWN0aXZlQm9yZGVyID0gJ2RlZmF1bHQnO1xuXHRcdFx0aW5hY3RpdmVCb3JkZXIgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFjdGl2ZUJvcmRlciA9IGJvcmRlclNldHRpbmc7XG5cdFx0XHRpbmFjdGl2ZUJvcmRlciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLnVwZGF0ZVdpbmRvd0FjY2VudENvbG9yKGFjdGl2ZUJvcmRlciwgaW5hY3RpdmVCb3JkZXIpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSBvbkFkZFJlbW92ZUZvbGRlcnNSZXF1ZXN0KHJlcXVlc3Q6IElBZGRSZW1vdmVGb2xkZXJzUmVxdWVzdCk6IHZvaWQge1xuXG5cdFx0Ly8gQnVmZmVyIGFsbCBwZW5kaW5nIHJlcXVlc3RzXG5cdFx0dGhpcy5wZW5kaW5nRm9sZGVyc1RvQWRkLnB1c2goLi4ucmVxdWVzdC5mb2xkZXJzVG9BZGQubWFwKGZvbGRlciA9PiBVUkkucmV2aXZlKGZvbGRlcikpKTtcblx0XHR0aGlzLnBlbmRpbmdGb2xkZXJzVG9SZW1vdmUucHVzaCguLi5yZXF1ZXN0LmZvbGRlcnNUb1JlbW92ZS5tYXAoZm9sZGVyID0+IFVSSS5yZXZpdmUoZm9sZGVyKSkpO1xuXG5cdFx0Ly8gRGVsYXkgdGhlIGFkZGluZyBvZiBmb2xkZXJzIGEgYml0IHRvIGJ1ZmZlciBpbiBjYXNlIG1vcmUgcmVxdWVzdHMgYXJlIGNvbWluZ1xuXHRcdGlmICghdGhpcy5hZGRSZW1vdmVGb2xkZXJzU2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdHRoaXMuYWRkUmVtb3ZlRm9sZGVyc1NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9BZGRSZW1vdmVGb2xkZXJzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZvbGRlcnNUb0FkZDogSVdvcmtzcGFjZUZvbGRlckNyZWF0aW9uRGF0YVtdID0gdGhpcy5wZW5kaW5nRm9sZGVyc1RvQWRkLm1hcChmb2xkZXIgPT4gKHsgdXJpOiBmb2xkZXIgfSkpO1xuXHRcdGNvbnN0IGZvbGRlcnNUb1JlbW92ZSA9IHRoaXMucGVuZGluZ0ZvbGRlcnNUb1JlbW92ZS5zbGljZSgwKTtcblxuXHRcdHRoaXMucGVuZGluZ0ZvbGRlcnNUb0FkZCA9IFtdO1xuXHRcdHRoaXMucGVuZGluZ0ZvbGRlcnNUb1JlbW92ZSA9IFtdO1xuXG5cdFx0aWYgKGZvbGRlcnNUb0FkZC5sZW5ndGgpIHtcblx0XHRcdGF3YWl0IHRoaXMud29ya3NwYWNlRWRpdGluZ1NlcnZpY2UuYWRkRm9sZGVycyhmb2xkZXJzVG9BZGQpO1xuXHRcdH1cblxuXHRcdGlmIChmb2xkZXJzVG9SZW1vdmUubGVuZ3RoKSB7XG5cdFx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlLnJlbW92ZUZvbGRlcnMoZm9sZGVyc1RvUmVtb3ZlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uT3BlbkZpbGVzKHJlcXVlc3Q6IElOYXRpdmVPcGVuRmlsZVJlcXVlc3QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkaWZmTW9kZSA9ICEhKHJlcXVlc3QuZmlsZXNUb0RpZmYgJiYgKHJlcXVlc3QuZmlsZXNUb0RpZmYubGVuZ3RoID09PSAyKSk7XG5cdFx0Y29uc3QgbWVyZ2VNb2RlID0gISEocmVxdWVzdC5maWxlc1RvTWVyZ2UgJiYgKHJlcXVlc3QuZmlsZXNUb01lcmdlLmxlbmd0aCA9PT0gNCkpO1xuXG5cdFx0Y29uc3QgaW5wdXRzID0gY29hbGVzY2UoYXdhaXQgcGF0aHNUb0VkaXRvcnMobWVyZ2VNb2RlID8gcmVxdWVzdC5maWxlc1RvTWVyZ2UgOiBkaWZmTW9kZSA/IHJlcXVlc3QuZmlsZXNUb0RpZmYgOiByZXF1ZXN0LmZpbGVzVG9PcGVuT3JDcmVhdGUsIHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSkpO1xuXHRcdGlmIChpbnB1dHMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBvcGVuZWRFZGl0b3JQYW5lcyA9IGF3YWl0IHRoaXMub3BlblJlc291cmNlcyhpbnB1dHMsIGRpZmZNb2RlLCBtZXJnZU1vZGUpO1xuXG5cdFx0XHRpZiAocmVxdWVzdC5maWxlc1RvV2FpdCkge1xuXG5cdFx0XHRcdC8vIEluIHdhaXQgbW9kZSwgbGlzdGVuIHRvIGNoYW5nZXMgdG8gdGhlIGVkaXRvcnMgYW5kIHdhaXQgdW50aWwgdGhlIGZpbGVzXG5cdFx0XHRcdC8vIGFyZSBjbG9zZWQgdGhhdCB0aGUgdXNlciB3YW50cyB0byB3YWl0IGZvci4gV2hlbiB0aGlzIGhhcHBlbnMgd2UgZGVsZXRlXG5cdFx0XHRcdC8vIHRoZSB3YWl0IG1hcmtlciBmaWxlIHRvIHNpZ25hbCB0byB0aGUgb3V0c2lkZSB0aGF0IGVkaXRpbmcgaXMgZG9uZS5cblx0XHRcdFx0Ly8gSG93ZXZlciwgaXQgaXMgcG9zc2libGUgdGhhdCBvcGVuaW5nIG9mIHRoZSBlZGl0b3JzIGZhaWxlZCwgYXMgc3VjaCB3ZVxuXHRcdFx0XHQvLyBjaGVjayBmb3Igd2hldGhlciBlZGl0b3IgcGFuZXMgZ290IG9wZW5lZCBhbmQgb3RoZXJ3aXNlIGRlbGV0ZSB0aGUgbWFya2VyXG5cdFx0XHRcdC8vIHJpZ2h0IGF3YXkuXG5cblx0XHRcdFx0aWYgKG9wZW5lZEVkaXRvclBhbmVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnRyYWNrQ2xvc2VkV2FpdEZpbGVzKFVSSS5yZXZpdmUocmVxdWVzdC5maWxlc1RvV2FpdC53YWl0TWFya2VyRmlsZVVyaSksIGNvYWxlc2NlKHJlcXVlc3QuZmlsZXNUb1dhaXQucGF0aHMubWFwKHBhdGggPT4gVVJJLnJldml2ZShwYXRoLmZpbGVVcmkpKSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmZpbGVTZXJ2aWNlLmRlbChVUkkucmV2aXZlKHJlcXVlc3QuZmlsZXNUb1dhaXQud2FpdE1hcmtlckZpbGVVcmkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdHJhY2tDbG9zZWRXYWl0RmlsZXMod2FpdE1hcmtlckZpbGU6IFVSSSwgcmVzb3VyY2VzVG9XYWl0Rm9yOiBVUklbXSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gV2FpdCBmb3IgdGhlIHJlc291cmNlcyB0byBiZSBjbG9zZWQgaW4gdGhlIHRleHQgZWRpdG9yLi4uXG5cdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB3aGVuRWRpdG9yQ2xvc2VkKGFjY2Vzc29yLCByZXNvdXJjZXNUb1dhaXRGb3IpKTtcblxuXHRcdC8vIC4uLmJlZm9yZSBkZWxldGluZyB0aGUgd2FpdCBtYXJrZXIgZmlsZVxuXHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHdhaXRNYXJrZXJGaWxlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlblJlc291cmNlcyhyZXNvdXJjZXM6IEFycmF5PElSZXNvdXJjZUVkaXRvcklucHV0IHwgSVVudGl0bGVkVGV4dFJlc291cmNlRWRpdG9ySW5wdXQ+LCBkaWZmTW9kZTogYm9vbGVhbiwgbWVyZ2VNb2RlOiBib29sZWFuKTogUHJvbWlzZTxyZWFkb25seSBJRWRpdG9yUGFuZVtdPiB7XG5cdFx0Y29uc3QgZWRpdG9yczogSVVudHlwZWRFZGl0b3JJbnB1dFtdID0gW107XG5cblx0XHRpZiAobWVyZ2VNb2RlICYmIGlzUmVzb3VyY2VFZGl0b3JJbnB1dChyZXNvdXJjZXNbMF0pICYmIGlzUmVzb3VyY2VFZGl0b3JJbnB1dChyZXNvdXJjZXNbMV0pICYmIGlzUmVzb3VyY2VFZGl0b3JJbnB1dChyZXNvdXJjZXNbMl0pICYmIGlzUmVzb3VyY2VFZGl0b3JJbnB1dChyZXNvdXJjZXNbM10pKSB7XG5cdFx0XHRjb25zdCBtZXJnZUVkaXRvcjogSVJlc291cmNlTWVyZ2VFZGl0b3JJbnB1dCA9IHtcblx0XHRcdFx0aW5wdXQxOiB7IHJlc291cmNlOiByZXNvdXJjZXNbMF0ucmVzb3VyY2UgfSxcblx0XHRcdFx0aW5wdXQyOiB7IHJlc291cmNlOiByZXNvdXJjZXNbMV0ucmVzb3VyY2UgfSxcblx0XHRcdFx0YmFzZTogeyByZXNvdXJjZTogcmVzb3VyY2VzWzJdLnJlc291cmNlIH0sXG5cdFx0XHRcdHJlc3VsdDogeyByZXNvdXJjZTogcmVzb3VyY2VzWzNdLnJlc291cmNlIH0sXG5cdFx0XHRcdG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH1cblx0XHRcdH07XG5cdFx0XHRlZGl0b3JzLnB1c2gobWVyZ2VFZGl0b3IpO1xuXHRcdH0gZWxzZSBpZiAoZGlmZk1vZGUgJiYgaXNSZXNvdXJjZUVkaXRvcklucHV0KHJlc291cmNlc1swXSkgJiYgaXNSZXNvdXJjZUVkaXRvcklucHV0KHJlc291cmNlc1sxXSkpIHtcblx0XHRcdGNvbnN0IGRpZmZFZGl0b3I6IElSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCA9IHtcblx0XHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IHJlc291cmNlc1swXS5yZXNvdXJjZSB9LFxuXHRcdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogcmVzb3VyY2VzWzFdLnJlc291cmNlIH0sXG5cdFx0XHRcdG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH1cblx0XHRcdH07XG5cdFx0XHRlZGl0b3JzLnB1c2goZGlmZkVkaXRvcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVkaXRvcnMucHVzaCguLi5yZXNvdXJjZXMpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcnMoZWRpdG9ycywgdW5kZWZpbmVkLCB7IHZhbGlkYXRlVHJ1c3Q6IHRydWUgfSk7XG5cdH1cblxuXHQvLyNyZWdpb24gV2luZG93IFpvb21cblxuXHRwcml2YXRlIHJlYWRvbmx5IG1hcFdpbmRvd0lkVG9ab29tU3RhdHVzRW50cnkgPSBuZXcgTWFwPG51bWJlciwgWm9vbVN0YXR1c0VudHJ5PigpO1xuXG5cdHByaXZhdGUgY29uZmlndXJlZFdpbmRvd1pvb21MZXZlbDogbnVtYmVyO1xuXG5cdHByaXZhdGUgcmVzb2x2ZUNvbmZpZ3VyZWRXaW5kb3dab29tTGV2ZWwoKTogbnVtYmVyIHtcblx0XHRjb25zdCB3aW5kb3dab29tTGV2ZWwgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd3aW5kb3cuem9vbUxldmVsJyk7XG5cblx0XHRyZXR1cm4gdHlwZW9mIHdpbmRvd1pvb21MZXZlbCA9PT0gJ251bWJlcicgPyB3aW5kb3dab29tTGV2ZWwgOiAwO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVPbkRpZENoYW5nZVpvb21MZXZlbCh0YXJnZXRXaW5kb3dJZDogbnVtYmVyKTogdm9pZCB7XG5cblx0XHQvLyBab29tIHN0YXR1cyBlbnRyeVxuXHRcdHRoaXMudXBkYXRlV2luZG93Wm9vbVN0YXR1c0VudHJ5KHRhcmdldFdpbmRvd0lkKTtcblxuXHRcdC8vIE5vdGlmeSBtYWluIHByb2Nlc3MgYWJvdXQgYSBjdXN0b20gem9vbSBsZXZlbFxuXHRcdGlmICh0YXJnZXRXaW5kb3dJZCA9PT0gbWFpbldpbmRvdy52c2NvZGVXaW5kb3dJZCkge1xuXHRcdFx0Y29uc3QgY3VycmVudFdpbmRvd1pvb21MZXZlbCA9IGdldFpvb21MZXZlbChtYWluV2luZG93KTtcblxuXHRcdFx0bGV0IG5vdGlmeVpvb21MZXZlbDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRoaXMuY29uZmlndXJlZFdpbmRvd1pvb21MZXZlbCAhPT0gY3VycmVudFdpbmRvd1pvb21MZXZlbCkge1xuXHRcdFx0XHRub3RpZnlab29tTGV2ZWwgPSBjdXJyZW50V2luZG93Wm9vbUxldmVsO1xuXHRcdFx0fVxuXG5cdFx0XHRpcGNSZW5kZXJlci5pbnZva2UoJ3ZzY29kZTpub3RpZnlab29tTGV2ZWwnLCBub3RpZnlab29tTGV2ZWwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlV2luZG93Wm9vbVN0YXR1c0VudHJ5KHBhcnQ6IElFZGl0b3JQYXJ0KTogdm9pZCB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0RXZlbnQub25jZShwYXJ0Lm9uV2lsbERpc3Bvc2UpKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cblx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmdldFNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlKHBhcnQpO1xuXHRcdHRoaXMubWFwV2luZG93SWRUb1pvb21TdGF0dXNFbnRyeS5zZXQocGFydC53aW5kb3dJZCwgZGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFpvb21TdGF0dXNFbnRyeSkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMubWFwV2luZG93SWRUb1pvb21TdGF0dXNFbnRyeS5kZWxldGUocGFydC53aW5kb3dJZCkpKTtcblxuXHRcdHRoaXMudXBkYXRlV2luZG93Wm9vbVN0YXR1c0VudHJ5KHBhcnQud2luZG93SWQpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVXaW5kb3dab29tU3RhdHVzRW50cnkodGFyZ2V0V2luZG93SWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGdldFdpbmRvd0J5SWQodGFyZ2V0V2luZG93SWQpO1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5tYXBXaW5kb3dJZFRvWm9vbVN0YXR1c0VudHJ5LmdldCh0YXJnZXRXaW5kb3dJZCk7XG5cdFx0aWYgKGVudHJ5ICYmIHRhcmdldFdpbmRvdykge1xuXHRcdFx0Y29uc3QgY3VycmVudFpvb21MZXZlbCA9IGdldFpvb21MZXZlbCh0YXJnZXRXaW5kb3cud2luZG93KTtcblxuXHRcdFx0bGV0IHRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGlmIChjdXJyZW50Wm9vbUxldmVsIDwgdGhpcy5jb25maWd1cmVkV2luZG93Wm9vbUxldmVsKSB7XG5cdFx0XHRcdHRleHQgPSAnJCh6b29tLW91dCknO1xuXHRcdFx0fSBlbHNlIGlmIChjdXJyZW50Wm9vbUxldmVsID4gdGhpcy5jb25maWd1cmVkV2luZG93Wm9vbUxldmVsKSB7XG5cdFx0XHRcdHRleHQgPSAnJCh6b29tLWluKSc7XG5cdFx0XHR9XG5cblx0XHRcdGVudHJ5LnVwZGF0ZVpvb21FbnRyeSh0ZXh0ID8/IGZhbHNlLCB0YXJnZXRXaW5kb3dJZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUNvbmZpZ3VyZWRXaW5kb3dab29tTGV2ZWwoKTogdm9pZCB7XG5cdFx0dGhpcy5jb25maWd1cmVkV2luZG93Wm9vbUxldmVsID0gdGhpcy5yZXNvbHZlQ29uZmlndXJlZFdpbmRvd1pvb21MZXZlbCgpO1xuXG5cdFx0bGV0IGFwcGx5Wm9vbUxldmVsID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCB7IHdpbmRvdyB9IG9mIGdldFdpbmRvd3MoKSkge1xuXHRcdFx0aWYgKGdldFpvb21MZXZlbCh3aW5kb3cpICE9PSB0aGlzLmNvbmZpZ3VyZWRXaW5kb3dab29tTGV2ZWwpIHtcblx0XHRcdFx0YXBwbHlab29tTGV2ZWwgPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoYXBwbHlab29tTGV2ZWwpIHtcblx0XHRcdGFwcGx5Wm9vbSh0aGlzLmNvbmZpZ3VyZWRXaW5kb3dab29tTGV2ZWwsIEFwcGx5Wm9vbVRhcmdldC5BTExfV0lORE9XUyk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBbd2luZG93SWRdIG9mIHRoaXMubWFwV2luZG93SWRUb1pvb21TdGF0dXNFbnRyeSkge1xuXHRcdFx0dGhpcy51cGRhdGVXaW5kb3dab29tU3RhdHVzRW50cnkod2luZG93SWQpO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0Zm9yIChjb25zdCBbLCBlbnRyeV0gb2YgdGhpcy5tYXBXaW5kb3dJZFRvWm9vbVN0YXR1c0VudHJ5KSB7XG5cdFx0XHRlbnRyeS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFpvb21TdGF0dXNFbnRyeSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXG5cdHByaXZhdGUgem9vbUxldmVsTGFiZWw6IEFjdGlvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVN0YXR1c2JhclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdGF0dXNiYXJTZXJ2aWNlOiBJU3RhdHVzYmFyU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0dXBkYXRlWm9vbUVudHJ5KHZpc2libGVPclRleHQ6IGZhbHNlIHwgc3RyaW5nLCB0YXJnZXRXaW5kb3dJZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiB2aXNpYmxlT3JUZXh0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0aWYgKCF0aGlzLmRpc3Bvc2FibGUudmFsdWUpIHtcblx0XHRcdFx0dGhpcy5jcmVhdGVab29tRW50cnkodmlzaWJsZU9yVGV4dCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudXBkYXRlWm9vbUxldmVsTGFiZWwodGFyZ2V0V2luZG93SWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmRpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVpvb21FbnRyeSh2aXNpYmxlT3JUZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLmRpc3Bvc2FibGUudmFsdWUgPSBkaXNwb3NhYmxlcztcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9ICQoJy56b29tLXN0YXR1cycpO1xuXG5cdFx0Y29uc3QgbGVmdCA9ICQoJy56b29tLXN0YXR1cy1sZWZ0Jyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGxlZnQpO1xuXG5cdFx0Y29uc3Qgem9vbU91dEFjdGlvbjogQWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oJ3dvcmtiZW5jaC5hY3Rpb24uem9vbU91dCcsIGxvY2FsaXplKCd6b29tT3V0JywgXCJab29tIE91dFwiKSwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24ucmVtb3ZlKSwgdHJ1ZSwgKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCh6b29tT3V0QWN0aW9uLmlkKSkpO1xuXHRcdGNvbnN0IHpvb21JbkFjdGlvbjogQWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oJ3dvcmtiZW5jaC5hY3Rpb24uem9vbUluJywgbG9jYWxpemUoJ3pvb21JbicsIFwiWm9vbSBJblwiKSwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24ucGx1cyksIHRydWUsICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoem9vbUluQWN0aW9uLmlkKSkpO1xuXHRcdGNvbnN0IHpvb21SZXNldEFjdGlvbjogQWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oJ3dvcmtiZW5jaC5hY3Rpb24uem9vbVJlc2V0JywgbG9jYWxpemUoJ3pvb21SZXNldCcsIFwiUmVzZXRcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCh6b29tUmVzZXRBY3Rpb24uaWQpKSk7XG5cdFx0em9vbVJlc2V0QWN0aW9uLnRvb2x0aXAgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcoem9vbVJlc2V0QWN0aW9uLmxhYmVsLCB6b29tUmVzZXRBY3Rpb24uaWQpO1xuXHRcdGNvbnN0IHpvb21TZXR0aW5nc0FjdGlvbjogQWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJywgbG9jYWxpemUoJ3pvb21TZXR0aW5ncycsIFwiU2V0dGluZ3NcIiksIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnNldHRpbmdzR2VhciksIHRydWUsICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoem9vbVNldHRpbmdzQWN0aW9uLmlkLCAnd2luZG93Lnpvb20nKSkpO1xuXHRcdGNvbnN0IHpvb21MZXZlbExhYmVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oJ3pvb21MYWJlbCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZSkpO1xuXG5cdFx0dGhpcy56b29tTGV2ZWxMYWJlbCA9IHpvb21MZXZlbExhYmVsO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy56b29tTGV2ZWxMYWJlbCA9IHVuZGVmaW5lZCkpO1xuXG5cdFx0Y29uc3QgYWN0aW9uQmFyTGVmdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uQmFyKGxlZnQsIHsgaG92ZXJEZWxlZ2F0ZTogbmF0aXZlSG92ZXJEZWxlZ2F0ZSB9KSk7XG5cdFx0YWN0aW9uQmFyTGVmdC5wdXNoKHpvb21PdXRBY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlLCBrZXliaW5kaW5nOiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoem9vbU91dEFjdGlvbi5pZCk/LmdldExhYmVsKCkgfSk7XG5cdFx0YWN0aW9uQmFyTGVmdC5wdXNoKHRoaXMuem9vbUxldmVsTGFiZWwsIHsgaWNvbjogZmFsc2UsIGxhYmVsOiB0cnVlIH0pO1xuXHRcdGFjdGlvbkJhckxlZnQucHVzaCh6b29tSW5BY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlLCBrZXliaW5kaW5nOiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoem9vbUluQWN0aW9uLmlkKT8uZ2V0TGFiZWwoKSB9KTtcblxuXHRcdGNvbnN0IHJpZ2h0ID0gJCgnLnpvb20tc3RhdHVzLXJpZ2h0Jyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHJpZ2h0KTtcblxuXHRcdGNvbnN0IGFjdGlvbkJhclJpZ2h0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb25CYXIocmlnaHQsIHsgaG92ZXJEZWxlZ2F0ZTogbmF0aXZlSG92ZXJEZWxlZ2F0ZSB9KSk7XG5cblx0XHRhY3Rpb25CYXJSaWdodC5wdXNoKHpvb21SZXNldEFjdGlvbiwgeyBpY29uOiBmYWxzZSwgbGFiZWw6IHRydWUgfSk7XG5cdFx0YWN0aW9uQmFyUmlnaHQucHVzaCh6b29tU2V0dGluZ3NBY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlLCBrZXliaW5kaW5nOiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoem9vbVNldHRpbmdzQWN0aW9uLmlkKT8uZ2V0TGFiZWwoKSB9KTtcblxuXHRcdGNvbnN0IG5hbWUgPSBsb2NhbGl6ZSgnc3RhdHVzLndpbmRvd1pvb20nLCBcIldpbmRvdyBab29tXCIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLnN0YXR1c2JhclNlcnZpY2UuYWRkRW50cnkoe1xuXHRcdFx0bmFtZSxcblx0XHRcdHRleHQ6IHZpc2libGVPclRleHQsXG5cdFx0XHR0b29sdGlwOiBjb250YWluZXIsXG5cdFx0XHRhcmlhTGFiZWw6IG5hbWUsXG5cdFx0XHRjb21tYW5kOiBTaG93VG9vbHRpcENvbW1hbmQsXG5cdFx0XHRraW5kOiAncHJvbWluZW50J1xuXHRcdH0sICdzdGF0dXMud2luZG93Wm9vbScsIFN0YXR1c2JhckFsaWdubWVudC5SSUdIVCwgMTAyKSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVpvb21MZXZlbExhYmVsKHRhcmdldFdpbmRvd0lkOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy56b29tTGV2ZWxMYWJlbCkge1xuXHRcdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZ2V0V2luZG93QnlJZCh0YXJnZXRXaW5kb3dJZCwgdHJ1ZSkud2luZG93O1xuXHRcdFx0Y29uc3Qgem9vbUZhY3RvciA9IE1hdGgucm91bmQoZ2V0Wm9vbUZhY3Rvcih0YXJnZXRXaW5kb3cpICogMTAwKTtcblx0XHRcdGNvbnN0IHpvb21MZXZlbCA9IGdldFpvb21MZXZlbCh0YXJnZXRXaW5kb3cpO1xuXG5cdFx0XHR0aGlzLnpvb21MZXZlbExhYmVsLmxhYmVsID0gYCR7em9vbUxldmVsfWA7XG5cdFx0XHR0aGlzLnpvb21MZXZlbExhYmVsLnRvb2x0aXAgPSBsb2NhbGl6ZSgnem9vbU51bWJlcicsIFwiWm9vbSBMZXZlbDogezB9ICh7MX0lKVwiLCB6b29tTGV2ZWwsIHpvb21GYWN0b3IpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7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
