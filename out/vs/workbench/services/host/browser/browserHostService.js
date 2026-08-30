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
import { Emitter, Event } from "../../../../base/common/event.js";
import { IHostService } from "./host.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { isFolderToOpen, isWorkspaceToOpen, isFileToOpen } from "../../../../platform/window/common/window.js";
import { isResourceEditorInput, pathsToEditors } from "../../../common/editor.js";
import { whenEditorClosed } from "../../../browser/editor.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILabelService, Verbosity } from "../../../../platform/label/common/label.js";
import { EventType, ModifierKeyEmitter, addDisposableListener, addDisposableThrottledListener, detectFullscreen, disposableWindowInterval, getActiveDocument, getActiveWindow, getWindowId, onDidRegisterWindow, trackFocus, getWindows as getDOMWindows } from "../../../../base/browser/dom.js";
import { Disposable, DisposableSet, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { IBrowserWorkbenchEnvironmentService } from "../../environment/browser/environmentService.js";
import { memoize } from "../../../../base/common/decorators.js";
import { parseLineAndColumnAware } from "../../../../base/common/extpath.js";
import { IWorkspaceEditingService } from "../../workspaces/common/workspaceEditing.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILifecycleService, ShutdownReason } from "../../lifecycle/common/lifecycle.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { getWorkspaceIdentifier } from "../../../../platform/workspaces/common/workspaceIdentifier.js";
import { localize } from "../../../../nls.js";
import Severity from "../../../../base/common/severity.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { DomEmitter } from "../../../../base/browser/event.js";
import { isUndefined } from "../../../../base/common/types.js";
import { isTemporaryWorkspace, IWorkspaceContextService, toWorkspaceIdentifier } from "../../../../platform/workspace/common/workspace.js";
import { Schemas } from "../../../../base/common/network.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { mainWindow, isAuxiliaryWindow } from "../../../../base/browser/window.js";
import { isIOS, isMacintosh } from "../../../../base/common/platform.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { showBrowserToast } from "./toasts.js";
var HostShutdownReason = /* @__PURE__ */ ((HostShutdownReason2) => {
  HostShutdownReason2[HostShutdownReason2["Unknown"] = 1] = "Unknown";
  HostShutdownReason2[HostShutdownReason2["Keyboard"] = 2] = "Keyboard";
  HostShutdownReason2[HostShutdownReason2["Api"] = 3] = "Api";
  return HostShutdownReason2;
})(HostShutdownReason || {});
let BrowserHostService = class extends Disposable {
  constructor(layoutService, configurationService, fileService, labelService, environmentService, instantiationService, lifecycleService, logService, dialogService, contextService, userDataProfilesService) {
    super();
    this.layoutService = layoutService;
    this.configurationService = configurationService;
    this.fileService = fileService;
    this.labelService = labelService;
    this.environmentService = environmentService;
    this.instantiationService = instantiationService;
    this.lifecycleService = lifecycleService;
    this.logService = logService;
    this.dialogService = dialogService;
    this.contextService = contextService;
    this.userDataProfilesService = userDataProfilesService;
    this.shutdownReason = 1 /* Unknown */;
    //#endregion
    //#region Toast Notifications
    this.activeToasts = this._register(new DisposableSet());
    if (environmentService.options?.workspaceProvider) {
      this.workspaceProvider = environmentService.options.workspaceProvider;
    } else {
      this.workspaceProvider = new class {
        constructor() {
          this.workspace = void 0;
          this.trusted = void 0;
        }
        async open() {
          return true;
        }
      }();
    }
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.lifecycleService.onBeforeShutdown((e) => this.onBeforeShutdown(e)));
    this._register(ModifierKeyEmitter.getInstance().event(() => this.updateShutdownReasonFromEvent()));
    this._register(this.onDidChangeFocus((focus) => {
      if (focus) {
        this.clearToasts();
      }
    }));
  }
  onBeforeShutdown(e) {
    switch (this.shutdownReason) {
      // Unknown / Keyboard shows veto depending on setting
      case 1 /* Unknown */:
      case 2 /* Keyboard */: {
        const confirmBeforeClose = this.configurationService.getValue("window.confirmBeforeClose");
        if (confirmBeforeClose === "always" || confirmBeforeClose === "keyboardOnly" && this.shutdownReason === 2 /* Keyboard */) {
          e.veto(true, "veto.confirmBeforeClose");
        }
        break;
      }
      // Api never shows veto
      case 3 /* Api */:
        break;
    }
    this.shutdownReason = 1 /* Unknown */;
  }
  updateShutdownReasonFromEvent() {
    if (this.shutdownReason === 3 /* Api */) {
      return;
    }
    if (ModifierKeyEmitter.getInstance().isModifierPressed) {
      this.shutdownReason = 2 /* Keyboard */;
    } else {
      this.shutdownReason = 1 /* Unknown */;
    }
  }
  get onDidChangeFocus() {
    const emitter = this._register(new Emitter());
    this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
      const focusTracker = disposables.add(trackFocus(window));
      const visibilityTracker = disposables.add(new DomEmitter(window.document, "visibilitychange"));
      Event.any(
        Event.map(focusTracker.onDidFocus, () => this.hasFocus, disposables),
        Event.map(focusTracker.onDidBlur, () => this.hasFocus, disposables),
        Event.map(visibilityTracker.event, () => this.hasFocus, disposables),
        Event.map(this.onDidChangeActiveWindow, () => this.hasFocus, disposables)
      )((focus) => emitter.fire(focus), void 0, disposables);
    }, { window: mainWindow, disposables: this._store }));
    return Event.latch(emitter.event, void 0, this._store);
  }
  get hasFocus() {
    return getActiveDocument().hasFocus();
  }
  async hadLastFocus() {
    return true;
  }
  async focus(targetWindow) {
    targetWindow.focus();
  }
  get onDidChangeActiveWindow() {
    const emitter = this._register(new Emitter());
    this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
      const windowId = getWindowId(window);
      const focusTracker = disposables.add(trackFocus(window));
      disposables.add(focusTracker.onDidFocus(() => emitter.fire(windowId)));
      if (isAuxiliaryWindow(window)) {
        disposables.add(disposableWindowInterval(window, () => {
          const hasFocus = window.document.hasFocus();
          if (hasFocus) {
            emitter.fire(windowId);
          }
          return hasFocus;
        }, 100, 20));
      }
    }, { window: mainWindow, disposables: this._store }));
    return Event.latch(emitter.event, void 0, this._store);
  }
  get onDidChangeFullScreen() {
    const emitter = this._register(new Emitter());
    this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
      const windowId = getWindowId(window);
      const viewport = isIOS && window.visualViewport ? window.visualViewport : window;
      for (const event of [EventType.FULLSCREEN_CHANGE, EventType.WK_FULLSCREEN_CHANGE]) {
        disposables.add(addDisposableListener(window.document, event, () => emitter.fire({ windowId, fullscreen: !!detectFullscreen(window) })));
      }
      disposables.add(addDisposableThrottledListener(
        viewport,
        EventType.RESIZE,
        () => emitter.fire({ windowId, fullscreen: !!detectFullscreen(window) }),
        void 0,
        isMacintosh ? 2e3 : 800
        /* can be throttled */
      ));
    }, { window: mainWindow, disposables: this._store }));
    return emitter.event;
  }
  openWindow(arg1, arg2) {
    if (Array.isArray(arg1)) {
      return this.doOpenWindow(arg1, arg2);
    }
    return this.doOpenEmptyWindow(arg1);
  }
  async doOpenWindow(toOpen, options) {
    const payload = this.preservePayload(false, options);
    const fileOpenables = [];
    const foldersToAdd = [];
    const foldersToRemove = [];
    for (const openable of toOpen) {
      openable.label = openable.label || this.getRecentLabel(openable);
      if (isFolderToOpen(openable)) {
        if (options?.addMode) {
          foldersToAdd.push({ uri: openable.folderUri });
        } else if (options?.removeMode) {
          foldersToRemove.push(openable.folderUri);
        } else {
          this.doOpen({ folderUri: openable.folderUri }, { reuse: this.shouldReuse(
            options,
            false
            /* no file */
          ), payload });
        }
      } else if (isWorkspaceToOpen(openable)) {
        this.doOpen({ workspaceUri: openable.workspaceUri }, { reuse: this.shouldReuse(
          options,
          false
          /* no file */
        ), payload });
      } else if (isFileToOpen(openable)) {
        fileOpenables.push(openable);
      }
    }
    if (foldersToAdd.length > 0 || foldersToRemove.length > 0) {
      this.withServices(async (accessor) => {
        const workspaceEditingService = accessor.get(IWorkspaceEditingService);
        if (foldersToAdd.length > 0) {
          await workspaceEditingService.addFolders(foldersToAdd);
        }
        if (foldersToRemove.length > 0) {
          await workspaceEditingService.removeFolders(foldersToRemove);
        }
      });
    }
    if (fileOpenables.length > 0) {
      this.withServices(async (accessor) => {
        const editorService = accessor.get(IEditorService);
        if (options?.mergeMode && fileOpenables.length === 4) {
          const editors = coalesce(await pathsToEditors(fileOpenables, this.fileService, this.logService));
          if (editors.length !== 4 || !isResourceEditorInput(editors[0]) || !isResourceEditorInput(editors[1]) || !isResourceEditorInput(editors[2]) || !isResourceEditorInput(editors[3])) {
            return;
          }
          if (this.shouldReuse(
            options,
            true
            /* file */
          )) {
            editorService.openEditor({
              input1: { resource: editors[0].resource },
              input2: { resource: editors[1].resource },
              base: { resource: editors[2].resource },
              result: { resource: editors[3].resource },
              options: { pinned: true }
            });
          } else {
            const environment = /* @__PURE__ */ new Map();
            environment.set("mergeFile1", editors[0].resource.toString());
            environment.set("mergeFile2", editors[1].resource.toString());
            environment.set("mergeFileBase", editors[2].resource.toString());
            environment.set("mergeFileResult", editors[3].resource.toString());
            this.doOpen(void 0, { payload: Array.from(environment.entries()) });
          }
        } else if (options?.diffMode && fileOpenables.length === 2) {
          const editors = coalesce(await pathsToEditors(fileOpenables, this.fileService, this.logService));
          if (editors.length !== 2 || !isResourceEditorInput(editors[0]) || !isResourceEditorInput(editors[1])) {
            return;
          }
          if (this.shouldReuse(
            options,
            true
            /* file */
          )) {
            editorService.openEditor({
              original: { resource: editors[0].resource },
              modified: { resource: editors[1].resource },
              options: { pinned: true }
            });
          } else {
            const environment = /* @__PURE__ */ new Map();
            environment.set("diffFileSecondary", editors[0].resource.toString());
            environment.set("diffFilePrimary", editors[1].resource.toString());
            this.doOpen(void 0, { payload: Array.from(environment.entries()) });
          }
        } else {
          for (const openable of fileOpenables) {
            if (this.shouldReuse(
              options,
              true
              /* file */
            )) {
              let openables = [];
              if (options?.gotoLineMode) {
                const pathColumnAware = parseLineAndColumnAware(openable.fileUri.path);
                openables = [{
                  fileUri: openable.fileUri.with({ path: pathColumnAware.path }),
                  options: {
                    selection: !isUndefined(pathColumnAware.line) ? { startLineNumber: pathColumnAware.line, startColumn: pathColumnAware.column || 1 } : void 0
                  }
                }];
              } else {
                openables = [openable];
              }
              editorService.openEditors(coalesce(await pathsToEditors(openables, this.fileService, this.logService)), void 0, { validateTrust: true });
            } else {
              const environment = /* @__PURE__ */ new Map();
              environment.set("openFile", openable.fileUri.toString());
              if (options?.gotoLineMode) {
                environment.set("gotoLineMode", "true");
              }
              this.doOpen(void 0, { payload: Array.from(environment.entries()) });
            }
          }
        }
        const waitMarkerFileURI = options?.waitMarkerFileURI;
        if (waitMarkerFileURI) {
          (async () => {
            const filesToWaitFor = [];
            if (options.mergeMode) {
              filesToWaitFor.push(
                fileOpenables[3].fileUri
                /* [3] is the resulting merge file */
              );
            } else {
              filesToWaitFor.push(...fileOpenables.map((fileOpenable) => fileOpenable.fileUri));
            }
            await this.instantiationService.invokeFunction((accessor2) => whenEditorClosed(accessor2, filesToWaitFor));
            await this.fileService.del(waitMarkerFileURI);
          })();
        }
      });
    }
  }
  withServices(fn) {
    this.instantiationService.invokeFunction((accessor) => fn(accessor));
  }
  preservePayload(isEmptyWindow, options) {
    const newPayload = [];
    if (!isEmptyWindow && this.environmentService.extensionDevelopmentLocationURI) {
      newPayload.push(["extensionDevelopmentPath", this.environmentService.extensionDevelopmentLocationURI.toString()]);
      if (this.environmentService.debugExtensionHost.debugId) {
        newPayload.push(["debugId", this.environmentService.debugExtensionHost.debugId]);
      }
      if (this.environmentService.debugExtensionHost.port) {
        newPayload.push(["inspect-brk-extensions", String(this.environmentService.debugExtensionHost.port)]);
      }
    }
    const newWindowProfile = options?.forceProfile ? this.userDataProfilesService.profiles.find((profile) => profile.name === options?.forceProfile) : void 0;
    if (newWindowProfile && !newWindowProfile.isDefault) {
      newPayload.push(["profile", newWindowProfile.name]);
    }
    return newPayload.length ? newPayload : void 0;
  }
  getRecentLabel(openable) {
    if (isFolderToOpen(openable)) {
      return this.labelService.getWorkspaceLabel(openable.folderUri, { verbose: Verbosity.LONG });
    }
    if (isWorkspaceToOpen(openable)) {
      return this.labelService.getWorkspaceLabel(getWorkspaceIdentifier(openable.workspaceUri), { verbose: Verbosity.LONG });
    }
    return this.labelService.getUriLabel(openable.fileUri, { appendWorkspaceSuffix: true });
  }
  shouldReuse(options = /* @__PURE__ */ Object.create(null), isFile) {
    if (options.waitMarkerFileURI) {
      return true;
    }
    const windowConfig = this.configurationService.getValue("window");
    const openInNewWindowConfig = isFile ? windowConfig?.openFilesInNewWindow || "off" : windowConfig?.openFoldersInNewWindow || "default";
    let openInNewWindow = (options.preferNewWindow || !!options.forceNewWindow) && !options.forceReuseWindow;
    if (!options.forceNewWindow && !options.forceReuseWindow && (openInNewWindowConfig === "on" || openInNewWindowConfig === "off")) {
      openInNewWindow = openInNewWindowConfig === "on";
    }
    return !openInNewWindow;
  }
  async doOpenEmptyWindow(options) {
    return this.doOpen(void 0, {
      reuse: options?.forceReuseWindow,
      payload: this.preservePayload(true, options)
    });
  }
  async doOpen(workspace, options) {
    if (workspace && isFolderToOpen(workspace) && workspace.folderUri.scheme === Schemas.file && isTemporaryWorkspace(this.contextService.getWorkspace())) {
      this.withServices(async (accessor) => {
        const workspaceEditingService = accessor.get(IWorkspaceEditingService);
        await workspaceEditingService.updateFolders(0, this.contextService.getWorkspace().folders.length, [{ uri: workspace.folderUri }]);
      });
      return;
    }
    if (options?.reuse) {
      await this.handleExpectedShutdown(ShutdownReason.LOAD);
    }
    const opened = await this.workspaceProvider.open(workspace, options);
    if (!opened) {
      await this.dialogService.prompt({
        type: Severity.Warning,
        message: workspace ? localize("unableToOpenExternalWorkspace", "The browser blocked opening a new tab or window for '{0}'. Press 'Retry' to try again.", this.getRecentLabel(workspace)) : localize("unableToOpenExternal", "The browser blocked opening a new tab or window. Press 'Retry' to try again."),
        custom: {
          markdownDetails: [{ markdown: new MarkdownString(localize("unableToOpenWindowDetail", "Please allow pop-ups for this website in your [browser settings]({0}).", "https://aka.ms/allow-vscode-popup"), true) }]
        },
        buttons: [
          {
            label: localize({ key: "retry", comment: ["&& denotes a mnemonic"] }, "&&Retry"),
            run: () => this.workspaceProvider.open(workspace, options)
          }
        ],
        cancelButton: true
      });
    }
  }
  async toggleFullScreen(targetWindow) {
    const target = this.layoutService.getContainer(targetWindow);
    if (targetWindow.document.fullscreen !== void 0) {
      if (!targetWindow.document.fullscreen) {
        try {
          return await target.requestFullscreen();
        } catch (error) {
          this.logService.warn("toggleFullScreen(): requestFullscreen failed");
        }
      } else {
        try {
          return await targetWindow.document.exitFullscreen();
        } catch (error) {
          this.logService.warn("toggleFullScreen(): exitFullscreen failed");
        }
      }
    }
    const webkitDocument = targetWindow.document;
    const webkitElement = target;
    if (webkitDocument.webkitIsFullScreen !== void 0) {
      try {
        if (!webkitDocument.webkitIsFullScreen) {
          webkitElement.webkitRequestFullscreen();
        } else {
          webkitDocument.webkitExitFullscreen();
        }
      } catch {
        this.logService.warn("toggleFullScreen(): requestFullscreen/exitFullscreen failed");
      }
    }
  }
  async moveTop(targetWindow) {
  }
  async setWindowDimmed(_targetWindow, _dimmed) {
  }
  async getCursorScreenPoint() {
    return void 0;
  }
  async getWindowPosition(targetWindow) {
    return {
      x: targetWindow.screenX,
      y: targetWindow.screenY,
      width: targetWindow.outerWidth,
      height: targetWindow.outerHeight
    };
  }
  async getWindows(options) {
    const activeWindow = getActiveWindow();
    const activeWindowId = getWindowId(activeWindow);
    const result = [{
      id: activeWindowId,
      title: activeWindow.document.title,
      workspace: toWorkspaceIdentifier(this.contextService.getWorkspace()),
      dirty: false
    }];
    if (options.includeAuxiliaryWindows) {
      for (const { window } of getDOMWindows()) {
        const windowId = getWindowId(window);
        if (windowId !== activeWindowId && isAuxiliaryWindow(window)) {
          result.push({
            id: windowId,
            title: window.document.title,
            parentId: activeWindowId
          });
        }
      }
    }
    return result;
  }
  //#endregion
  //#region Lifecycle
  async restart() {
    this.reload();
  }
  async reload() {
    await this.handleExpectedShutdown(ShutdownReason.RELOAD);
    mainWindow.location.reload();
  }
  async close() {
    await this.handleExpectedShutdown(ShutdownReason.CLOSE);
    mainWindow.close();
  }
  async shutdown() {
    return this.close();
  }
  async withExpectedShutdown(expectedShutdownTask) {
    const previousShutdownReason = this.shutdownReason;
    try {
      this.shutdownReason = 3 /* Api */;
      return await expectedShutdownTask();
    } finally {
      this.shutdownReason = previousShutdownReason;
    }
  }
  async handleExpectedShutdown(reason) {
    this.shutdownReason = 3 /* Api */;
    return this.lifecycleService.withExpectedShutdown(reason);
  }
  //#endregion
  //#region Screenshots
  async getScreenshot() {
    const store = new DisposableStore();
    const video = document.createElement("video");
    store.add(toDisposable(() => video.remove()));
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: true
      });
      video.srcObject = stream;
      video.play();
      await Promise.all([
        new Promise((r) => store.add(addDisposableListener(video, "loadedmetadata", () => r()))),
        new Promise((r) => store.add(addDisposableListener(video, "canplaythrough", () => r())))
      ]);
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return void 0;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob((blob2) => resolve(blob2), "image/jpeg", 0.95));
      if (!blob) {
        throw new Error("Failed to create blob from canvas");
      }
      const buf = await blob.bytes();
      return VSBuffer.wrap(buf);
    } catch (error) {
      console.error("Error taking screenshot:", error);
      return void 0;
    } finally {
      store.dispose();
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
    }
  }
  async getBrowserId() {
    return void 0;
  }
  //#endregion
  //#region Native Handle
  async getNativeWindowHandle(_windowId) {
    return void 0;
  }
  async showToast(options, token) {
    return showBrowserToast({
      onDidCreateToast: (disposable) => this.activeToasts.add(disposable),
      onDidDisposeToast: (disposable) => this.activeToasts.deleteAndDispose(disposable)
    }, options, token);
  }
  async clearToasts() {
    this.activeToasts.clearAndDisposeAll();
  }
  //#endregion
};
__decorateClass([
  memoize
], BrowserHostService.prototype, "onDidChangeFocus", 1);
__decorateClass([
  memoize
], BrowserHostService.prototype, "onDidChangeActiveWindow", 1);
__decorateClass([
  memoize
], BrowserHostService.prototype, "onDidChangeFullScreen", 1);
BrowserHostService = __decorateClass([
  __decorateParam(0, ILayoutService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IFileService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, IBrowserWorkbenchEnvironmentService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ILifecycleService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IWorkspaceContextService),
  __decorateParam(10, IUserDataProfilesService)
], BrowserHostService);
registerSingleton(IHostService, BrowserHostService, InstantiationType.Delayed);
export {
  BrowserHostService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxob3N0XFxicm93c2VyXFxicm93c2VySG9zdFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSwgSVRvYXN0T3B0aW9ucywgSVRvYXN0UmVzdWx0IH0gZnJvbSAnLi9ob3N0LmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVdpbmRvd1NldHRpbmdzLCBJV2luZG93T3BlbmFibGUsIElPcGVuV2luZG93T3B0aW9ucywgaXNGb2xkZXJUb09wZW4sIGlzV29ya3NwYWNlVG9PcGVuLCBpc0ZpbGVUb09wZW4sIElPcGVuRW1wdHlXaW5kb3dPcHRpb25zLCBJUGF0aERhdGEsIElGaWxlVG9PcGVuLCBJT3BlbmVkTWFpbldpbmRvdywgSU9wZW5lZEF1eGlsaWFyeVdpbmRvdywgSVJlY3RhbmdsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IGlzUmVzb3VyY2VFZGl0b3JJbnB1dCwgcGF0aHNUb0VkaXRvcnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IHdoZW5FZGl0b3JDbG9zZWQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlLCBJV29ya3NwYWNlUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dlYi5hcGkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UsIFZlcmJvc2l0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBFdmVudFR5cGUsIE1vZGlmaWVyS2V5RW1pdHRlciwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhZGREaXNwb3NhYmxlVGhyb3R0bGVkTGlzdGVuZXIsIGRldGVjdEZ1bGxzY3JlZW4sIGRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbCwgZ2V0QWN0aXZlRG9jdW1lbnQsIGdldEFjdGl2ZVdpbmRvdywgZ2V0V2luZG93SWQsIG9uRGlkUmVnaXN0ZXJXaW5kb3csIHRyYWNrRm9jdXMsIGdldFdpbmRvd3MgYXMgZ2V0RE9NV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVNldCwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBwYXJzZUxpbmVBbmRDb2x1bW5Bd2FyZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUZvbGRlckNyZWF0aW9uRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlRWRpdGluZy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBCZWZvcmVTaHV0ZG93bkV2ZW50LCBTaHV0ZG93blJlYXNvbiB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEJyb3dzZXJMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2Jyb3dzZXIvbGlmZWN5Y2xlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGdldFdvcmtzcGFjZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgRG9tRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9ldmVudC5qcyc7XG5pbXBvcnQgeyBpc1VuZGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGlzVGVtcG9yYXJ5V29ya3NwYWNlLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIHRvV29ya3NwYWNlSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3csIGlzQXV4aWxpYXJ5V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBpc0lPUywgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBzaG93QnJvd3NlclRvYXN0IH0gZnJvbSAnLi90b2FzdHMuanMnO1xuXG5lbnVtIEhvc3RTaHV0ZG93blJlYXNvbiB7XG5cblx0LyoqXG5cdCAqIEFuIHVua25vd24gc2h1dGRvd24gcmVhc29uLlxuXHQgKi9cblx0VW5rbm93biA9IDEsXG5cblx0LyoqXG5cdCAqIEEgc2h1dGRvd24gdGhhdCB3YXMgcG90ZW50aWFsbHkgdHJpZ2dlcmVkIGJ5IGtleWJvYXJkIHVzZS5cblx0ICovXG5cdEtleWJvYXJkID0gMixcblxuXHQvKipcblx0ICogQW4gZXhwbGljaXQgc2h1dGRvd24gdmlhIGNvZGUuXG5cdCAqL1xuXHRBcGkgPSAzXG59XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VySG9zdFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUhvc3RTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHdvcmtzcGFjZVByb3ZpZGVyOiBJV29ya3NwYWNlUHJvdmlkZXI7XG5cblx0cHJpdmF0ZSBzaHV0ZG93blJlYXNvbiA9IEhvc3RTaHV0ZG93blJlYXNvbi5Vbmtub3duO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxheW91dFNlcnZpY2U6IElMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlU2VydmljZTogQnJvd3NlckxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmIChlbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucz8ud29ya3NwYWNlUHJvdmlkZXIpIHtcblx0XHRcdHRoaXMud29ya3NwYWNlUHJvdmlkZXIgPSBlbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucy53b3Jrc3BhY2VQcm92aWRlcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy53b3Jrc3BhY2VQcm92aWRlciA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElXb3Jrc3BhY2VQcm92aWRlciB7XG5cdFx0XHRcdHJlYWRvbmx5IHdvcmtzcGFjZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0cmVhZG9ubHkgdHJ1c3RlZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0YXN5bmMgb3BlbigpIHsgcmV0dXJuIHRydWU7IH1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXG5cdFx0Ly8gVmV0byBzaHV0ZG93biBkZXBlbmRpbmcgb24gYHdpbmRvdy5jb25maXJtQmVmb3JlQ2xvc2VgIHNldHRpbmdcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpZmVjeWNsZVNlcnZpY2Uub25CZWZvcmVTaHV0ZG93bihlID0+IHRoaXMub25CZWZvcmVTaHV0ZG93bihlKSkpO1xuXG5cdFx0Ly8gVHJhY2sgbW9kaWZpZXIga2V5cyB0byBkZXRlY3Qga2V5YmluZGluZyB1c2FnZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKE1vZGlmaWVyS2V5RW1pdHRlci5nZXRJbnN0YW5jZSgpLmV2ZW50KCgpID0+IHRoaXMudXBkYXRlU2h1dGRvd25SZWFzb25Gcm9tRXZlbnQoKSkpO1xuXG5cdFx0Ly8gTWFrZSBzdXJlIHRvIGhpZGUgYWxsIHRvYXN0cyB3aGVuIHRoZSB3aW5kb3cgZ2FpbnMgZm9jdXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlRm9jdXMoZm9jdXMgPT4ge1xuXHRcdFx0aWYgKGZvY3VzKSB7XG5cdFx0XHRcdHRoaXMuY2xlYXJUb2FzdHMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIG9uQmVmb3JlU2h1dGRvd24oZTogQmVmb3JlU2h1dGRvd25FdmVudCk6IHZvaWQge1xuXG5cdFx0c3dpdGNoICh0aGlzLnNodXRkb3duUmVhc29uKSB7XG5cblx0XHRcdC8vIFVua25vd24gLyBLZXlib2FyZCBzaG93cyB2ZXRvIGRlcGVuZGluZyBvbiBzZXR0aW5nXG5cdFx0XHRjYXNlIEhvc3RTaHV0ZG93blJlYXNvbi5Vbmtub3duOlxuXHRcdFx0Y2FzZSBIb3N0U2h1dGRvd25SZWFzb24uS2V5Ym9hcmQ6IHtcblx0XHRcdFx0Y29uc3QgY29uZmlybUJlZm9yZUNsb3NlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnd2luZG93LmNvbmZpcm1CZWZvcmVDbG9zZScpO1xuXHRcdFx0XHRpZiAoY29uZmlybUJlZm9yZUNsb3NlID09PSAnYWx3YXlzJyB8fCAoY29uZmlybUJlZm9yZUNsb3NlID09PSAna2V5Ym9hcmRPbmx5JyAmJiB0aGlzLnNodXRkb3duUmVhc29uID09PSBIb3N0U2h1dGRvd25SZWFzb24uS2V5Ym9hcmQpKSB7XG5cdFx0XHRcdFx0ZS52ZXRvKHRydWUsICd2ZXRvLmNvbmZpcm1CZWZvcmVDbG9zZScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQXBpIG5ldmVyIHNob3dzIHZldG9cblx0XHRcdGNhc2UgSG9zdFNodXRkb3duUmVhc29uLkFwaTpcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0Ly8gVW5zZXQgZm9yIG5leHQgc2h1dGRvd25cblx0XHR0aGlzLnNodXRkb3duUmVhc29uID0gSG9zdFNodXRkb3duUmVhc29uLlVua25vd247XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNodXRkb3duUmVhc29uRnJvbUV2ZW50KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNodXRkb3duUmVhc29uID09PSBIb3N0U2h1dGRvd25SZWFzb24uQXBpKSB7XG5cdFx0XHRyZXR1cm47IC8vIGRvIG5vdCBvdmVyd3JpdGUgYW55IGV4cGxpY2l0bHkgc2V0IHNodXRkb3duIHJlYXNvblxuXHRcdH1cblxuXHRcdGlmIChNb2RpZmllcktleUVtaXR0ZXIuZ2V0SW5zdGFuY2UoKS5pc01vZGlmaWVyUHJlc3NlZCkge1xuXHRcdFx0dGhpcy5zaHV0ZG93blJlYXNvbiA9IEhvc3RTaHV0ZG93blJlYXNvbi5LZXlib2FyZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zaHV0ZG93blJlYXNvbiA9IEhvc3RTaHV0ZG93blJlYXNvbi5Vbmtub3duO1xuXHRcdH1cblx0fVxuXG5cdC8vI3JlZ2lvbiBGb2N1c1xuXG5cdEBtZW1vaXplXG5cdGdldCBvbkRpZENoYW5nZUZvY3VzKCk6IEV2ZW50PGJvb2xlYW4+IHtcblx0XHRjb25zdCBlbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUob25EaWRSZWdpc3RlcldpbmRvdywgKHsgd2luZG93LCBkaXNwb3NhYmxlcyB9KSA9PiB7XG5cdFx0XHRjb25zdCBmb2N1c1RyYWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQodHJhY2tGb2N1cyh3aW5kb3cpKTtcblx0XHRcdGNvbnN0IHZpc2liaWxpdHlUcmFja2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKHdpbmRvdy5kb2N1bWVudCwgJ3Zpc2liaWxpdHljaGFuZ2UnKSk7XG5cblx0XHRcdEV2ZW50LmFueShcblx0XHRcdFx0RXZlbnQubWFwKGZvY3VzVHJhY2tlci5vbkRpZEZvY3VzLCAoKSA9PiB0aGlzLmhhc0ZvY3VzLCBkaXNwb3NhYmxlcyksXG5cdFx0XHRcdEV2ZW50Lm1hcChmb2N1c1RyYWNrZXIub25EaWRCbHVyLCAoKSA9PiB0aGlzLmhhc0ZvY3VzLCBkaXNwb3NhYmxlcyksXG5cdFx0XHRcdEV2ZW50Lm1hcCh2aXNpYmlsaXR5VHJhY2tlci5ldmVudCwgKCkgPT4gdGhpcy5oYXNGb2N1cywgZGlzcG9zYWJsZXMpLFxuXHRcdFx0XHRFdmVudC5tYXAodGhpcy5vbkRpZENoYW5nZUFjdGl2ZVdpbmRvdywgKCkgPT4gdGhpcy5oYXNGb2N1cywgZGlzcG9zYWJsZXMpLFxuXHRcdFx0KShmb2N1cyA9PiBlbWl0dGVyLmZpcmUoZm9jdXMpLCB1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHR9LCB7IHdpbmRvdzogbWFpbldpbmRvdywgZGlzcG9zYWJsZXM6IHRoaXMuX3N0b3JlIH0pKTtcblxuXHRcdHJldHVybiBFdmVudC5sYXRjaChlbWl0dGVyLmV2ZW50LCB1bmRlZmluZWQsIHRoaXMuX3N0b3JlKTtcblx0fVxuXG5cdGdldCBoYXNGb2N1cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZ2V0QWN0aXZlRG9jdW1lbnQoKS5oYXNGb2N1cygpO1xuXHR9XG5cblx0YXN5bmMgaGFkTGFzdEZvY3VzKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0YXN5bmMgZm9jdXModGFyZ2V0V2luZG93OiBXaW5kb3cpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0YXJnZXRXaW5kb3cuZm9jdXMoKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cblx0Ly8jcmVnaW9uIFdpbmRvd1xuXG5cdEBtZW1vaXplXG5cdGdldCBvbkRpZENoYW5nZUFjdGl2ZVdpbmRvdygpOiBFdmVudDxudW1iZXI+IHtcblx0XHRjb25zdCBlbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZShvbkRpZFJlZ2lzdGVyV2luZG93LCAoeyB3aW5kb3csIGRpc3Bvc2FibGVzIH0pID0+IHtcblx0XHRcdGNvbnN0IHdpbmRvd0lkID0gZ2V0V2luZG93SWQod2luZG93KTtcblxuXHRcdFx0Ly8gRW1pdCB2aWEgZm9jdXMgdHJhY2tpbmdcblx0XHRcdGNvbnN0IGZvY3VzVHJhY2tlciA9IGRpc3Bvc2FibGVzLmFkZCh0cmFja0ZvY3VzKHdpbmRvdykpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGZvY3VzVHJhY2tlci5vbkRpZEZvY3VzKCgpID0+IGVtaXR0ZXIuZmlyZSh3aW5kb3dJZCkpKTtcblxuXHRcdFx0Ly8gRW1pdCB2aWEgaW50ZXJ2YWw6IGltbWVkaWF0ZWx5IHdoZW4gb3BlbmluZyBhbiBhdXhpbGlhcnkgd2luZG93LFxuXHRcdFx0Ly8gaXQgaXMgcG9zc2libGUgdGhhdCBkb2N1bWVudCBmb2N1cyBoYXMgbm90IHlldCBjaGFuZ2VkLCBzbyB3ZVxuXHRcdFx0Ly8gcG9sbCBmb3IgYSB3aGlsZSB0byBlbnN1cmUgd2UgY2F0Y2ggdGhlIGV2ZW50LlxuXHRcdFx0aWYgKGlzQXV4aWxpYXJ5V2luZG93KHdpbmRvdykpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbCh3aW5kb3csICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBoYXNGb2N1cyA9IHdpbmRvdy5kb2N1bWVudC5oYXNGb2N1cygpO1xuXHRcdFx0XHRcdGlmIChoYXNGb2N1cykge1xuXHRcdFx0XHRcdFx0ZW1pdHRlci5maXJlKHdpbmRvd0lkKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gaGFzRm9jdXM7XG5cdFx0XHRcdH0sIDEwMCwgMjApKTtcblx0XHRcdH1cblx0XHR9LCB7IHdpbmRvdzogbWFpbldpbmRvdywgZGlzcG9zYWJsZXM6IHRoaXMuX3N0b3JlIH0pKTtcblxuXHRcdHJldHVybiBFdmVudC5sYXRjaChlbWl0dGVyLmV2ZW50LCB1bmRlZmluZWQsIHRoaXMuX3N0b3JlKTtcblx0fVxuXG5cdEBtZW1vaXplXG5cdGdldCBvbkRpZENoYW5nZUZ1bGxTY3JlZW4oKTogRXZlbnQ8eyB3aW5kb3dJZDogbnVtYmVyOyBmdWxsc2NyZWVuOiBib29sZWFuIH0+IHtcblx0XHRjb25zdCBlbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyB3aW5kb3dJZDogbnVtYmVyOyBmdWxsc2NyZWVuOiBib29sZWFuIH0+KCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKG9uRGlkUmVnaXN0ZXJXaW5kb3csICh7IHdpbmRvdywgZGlzcG9zYWJsZXMgfSkgPT4ge1xuXHRcdFx0Y29uc3Qgd2luZG93SWQgPSBnZXRXaW5kb3dJZCh3aW5kb3cpO1xuXHRcdFx0Y29uc3Qgdmlld3BvcnQgPSBpc0lPUyAmJiB3aW5kb3cudmlzdWFsVmlld3BvcnQgPyB3aW5kb3cudmlzdWFsVmlld3BvcnQgLyoqIFZpc3VhbCB2aWV3cG9ydCAqLyA6IHdpbmRvdyAvKiogTGF5b3V0IHZpZXdwb3J0ICovO1xuXG5cdFx0XHQvLyBGdWxsc2NyZWVuIChCcm93c2VyKVxuXHRcdFx0Zm9yIChjb25zdCBldmVudCBvZiBbRXZlbnRUeXBlLkZVTExTQ1JFRU5fQ0hBTkdFLCBFdmVudFR5cGUuV0tfRlVMTFNDUkVFTl9DSEFOR0VdKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIod2luZG93LmRvY3VtZW50LCBldmVudCwgKCkgPT4gZW1pdHRlci5maXJlKHsgd2luZG93SWQsIGZ1bGxzY3JlZW46ICEhZGV0ZWN0RnVsbHNjcmVlbih3aW5kb3cpIH0pKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZ1bGxzY3JlZW4gKE5hdGl2ZSlcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlVGhyb3R0bGVkTGlzdGVuZXIodmlld3BvcnQsIEV2ZW50VHlwZS5SRVNJWkUsICgpID0+IGVtaXR0ZXIuZmlyZSh7IHdpbmRvd0lkLCBmdWxsc2NyZWVuOiAhIWRldGVjdEZ1bGxzY3JlZW4od2luZG93KSB9KSwgdW5kZWZpbmVkLCBpc01hY2ludG9zaCA/IDIwMDAgLyogYWRqdXN0IGZvciBtYWNPUyBhbmltYXRpb24gKi8gOiA4MDAgLyogY2FuIGJlIHRocm90dGxlZCAqLykpO1xuXHRcdH0sIHsgd2luZG93OiBtYWluV2luZG93LCBkaXNwb3NhYmxlczogdGhpcy5fc3RvcmUgfSkpO1xuXG5cdFx0cmV0dXJuIGVtaXR0ZXIuZXZlbnQ7XG5cdH1cblxuXHRvcGVuV2luZG93KG9wdGlvbnM/OiBJT3BlbkVtcHR5V2luZG93T3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cdG9wZW5XaW5kb3codG9PcGVuOiBJV2luZG93T3BlbmFibGVbXSwgb3B0aW9ucz86IElPcGVuV2luZG93T3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cdG9wZW5XaW5kb3coYXJnMT86IElPcGVuRW1wdHlXaW5kb3dPcHRpb25zIHwgSVdpbmRvd09wZW5hYmxlW10sIGFyZzI/OiBJT3BlbldpbmRvd09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShhcmcxKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9PcGVuV2luZG93KGFyZzEsIGFyZzIpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRvT3BlbkVtcHR5V2luZG93KGFyZzEpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb09wZW5XaW5kb3codG9PcGVuOiBJV2luZG93T3BlbmFibGVbXSwgb3B0aW9ucz86IElPcGVuV2luZG93T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBheWxvYWQgPSB0aGlzLnByZXNlcnZlUGF5bG9hZChmYWxzZSAvKiBub3QgYW4gZW1wdHkgd2luZG93ICovLCBvcHRpb25zKTtcblx0XHRjb25zdCBmaWxlT3BlbmFibGVzOiBJRmlsZVRvT3BlbltdID0gW107XG5cblx0XHRjb25zdCBmb2xkZXJzVG9BZGQ6IElXb3Jrc3BhY2VGb2xkZXJDcmVhdGlvbkRhdGFbXSA9IFtdO1xuXHRcdGNvbnN0IGZvbGRlcnNUb1JlbW92ZTogVVJJW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3Qgb3BlbmFibGUgb2YgdG9PcGVuKSB7XG5cdFx0XHRvcGVuYWJsZS5sYWJlbCA9IG9wZW5hYmxlLmxhYmVsIHx8IHRoaXMuZ2V0UmVjZW50TGFiZWwob3BlbmFibGUpO1xuXG5cdFx0XHQvLyBGb2xkZXJcblx0XHRcdGlmIChpc0ZvbGRlclRvT3BlbihvcGVuYWJsZSkpIHtcblx0XHRcdFx0aWYgKG9wdGlvbnM/LmFkZE1vZGUpIHtcblx0XHRcdFx0XHRmb2xkZXJzVG9BZGQucHVzaCh7IHVyaTogb3BlbmFibGUuZm9sZGVyVXJpIH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG9wdGlvbnM/LnJlbW92ZU1vZGUpIHtcblx0XHRcdFx0XHRmb2xkZXJzVG9SZW1vdmUucHVzaChvcGVuYWJsZS5mb2xkZXJVcmkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuZG9PcGVuKHsgZm9sZGVyVXJpOiBvcGVuYWJsZS5mb2xkZXJVcmkgfSwgeyByZXVzZTogdGhpcy5zaG91bGRSZXVzZShvcHRpb25zLCBmYWxzZSAvKiBubyBmaWxlICovKSwgcGF5bG9hZCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBXb3Jrc3BhY2Vcblx0XHRcdGVsc2UgaWYgKGlzV29ya3NwYWNlVG9PcGVuKG9wZW5hYmxlKSkge1xuXHRcdFx0XHR0aGlzLmRvT3Blbih7IHdvcmtzcGFjZVVyaTogb3BlbmFibGUud29ya3NwYWNlVXJpIH0sIHsgcmV1c2U6IHRoaXMuc2hvdWxkUmV1c2Uob3B0aW9ucywgZmFsc2UgLyogbm8gZmlsZSAqLyksIHBheWxvYWQgfSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZpbGUgKGhhbmRsZWQgbGF0ZXIgaW4gYnVsaylcblx0XHRcdGVsc2UgaWYgKGlzRmlsZVRvT3BlbihvcGVuYWJsZSkpIHtcblx0XHRcdFx0ZmlsZU9wZW5hYmxlcy5wdXNoKG9wZW5hYmxlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgRm9sZGVycyB0byBhZGQgb3IgcmVtb3ZlXG5cdFx0aWYgKGZvbGRlcnNUb0FkZC5sZW5ndGggPiAwIHx8IGZvbGRlcnNUb1JlbW92ZS5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLndpdGhTZXJ2aWNlcyhhc3luYyBhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlOiBJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlKTtcblx0XHRcdFx0aWYgKGZvbGRlcnNUb0FkZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0YXdhaXQgd29ya3NwYWNlRWRpdGluZ1NlcnZpY2UuYWRkRm9sZGVycyhmb2xkZXJzVG9BZGQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGZvbGRlcnNUb1JlbW92ZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0YXdhaXQgd29ya3NwYWNlRWRpdGluZ1NlcnZpY2UucmVtb3ZlRm9sZGVycyhmb2xkZXJzVG9SZW1vdmUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgRmlsZXNcblx0XHRpZiAoZmlsZU9wZW5hYmxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLndpdGhTZXJ2aWNlcyhhc3luYyBhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdFx0XHRcdC8vIFN1cHBvcnQgbWVyZ2VNb2RlXG5cdFx0XHRcdGlmIChvcHRpb25zPy5tZXJnZU1vZGUgJiYgZmlsZU9wZW5hYmxlcy5sZW5ndGggPT09IDQpIHtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3JzID0gY29hbGVzY2UoYXdhaXQgcGF0aHNUb0VkaXRvcnMoZmlsZU9wZW5hYmxlcywgdGhpcy5maWxlU2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlKSk7XG5cdFx0XHRcdFx0aWYgKGVkaXRvcnMubGVuZ3RoICE9PSA0IHx8ICFpc1Jlc291cmNlRWRpdG9ySW5wdXQoZWRpdG9yc1swXSkgfHwgIWlzUmVzb3VyY2VFZGl0b3JJbnB1dChlZGl0b3JzWzFdKSB8fCAhaXNSZXNvdXJjZUVkaXRvcklucHV0KGVkaXRvcnNbMl0pIHx8ICFpc1Jlc291cmNlRWRpdG9ySW5wdXQoZWRpdG9yc1szXSkpIHtcblx0XHRcdFx0XHRcdHJldHVybjsgLy8gaW52YWxpZCByZXNvdXJjZXNcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBTYW1lIFdpbmRvdzogb3BlbiB2aWEgZWRpdG9yIHNlcnZpY2UgaW4gY3VycmVudCB3aW5kb3dcblx0XHRcdFx0XHRpZiAodGhpcy5zaG91bGRSZXVzZShvcHRpb25zLCB0cnVlIC8qIGZpbGUgKi8pKSB7XG5cdFx0XHRcdFx0XHRlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdFx0XHRpbnB1dDE6IHsgcmVzb3VyY2U6IGVkaXRvcnNbMF0ucmVzb3VyY2UgfSxcblx0XHRcdFx0XHRcdFx0aW5wdXQyOiB7IHJlc291cmNlOiBlZGl0b3JzWzFdLnJlc291cmNlIH0sXG5cdFx0XHRcdFx0XHRcdGJhc2U6IHsgcmVzb3VyY2U6IGVkaXRvcnNbMl0ucmVzb3VyY2UgfSxcblx0XHRcdFx0XHRcdFx0cmVzdWx0OiB7IHJlc291cmNlOiBlZGl0b3JzWzNdLnJlc291cmNlIH0sXG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIE5ldyBXaW5kb3c6IG9wZW4gaW50byBlbXB0eSB3aW5kb3dcblx0XHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVudmlyb25tZW50ID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRcdFx0XHRcdGVudmlyb25tZW50LnNldCgnbWVyZ2VGaWxlMScsIGVkaXRvcnNbMF0ucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0XHRlbnZpcm9ubWVudC5zZXQoJ21lcmdlRmlsZTInLCBlZGl0b3JzWzFdLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdFx0ZW52aXJvbm1lbnQuc2V0KCdtZXJnZUZpbGVCYXNlJywgZWRpdG9yc1syXS5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRcdGVudmlyb25tZW50LnNldCgnbWVyZ2VGaWxlUmVzdWx0JywgZWRpdG9yc1szXS5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdFx0XHRcdFx0dGhpcy5kb09wZW4odW5kZWZpbmVkLCB7IHBheWxvYWQ6IEFycmF5LmZyb20oZW52aXJvbm1lbnQuZW50cmllcygpKSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTdXBwb3J0IGRpZmZNb2RlXG5cdFx0XHRcdGVsc2UgaWYgKG9wdGlvbnM/LmRpZmZNb2RlICYmIGZpbGVPcGVuYWJsZXMubGVuZ3RoID09PSAyKSB7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9ycyA9IGNvYWxlc2NlKGF3YWl0IHBhdGhzVG9FZGl0b3JzKGZpbGVPcGVuYWJsZXMsIHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSkpO1xuXHRcdFx0XHRcdGlmIChlZGl0b3JzLmxlbmd0aCAhPT0gMiB8fCAhaXNSZXNvdXJjZUVkaXRvcklucHV0KGVkaXRvcnNbMF0pIHx8ICFpc1Jlc291cmNlRWRpdG9ySW5wdXQoZWRpdG9yc1sxXSkpIHtcblx0XHRcdFx0XHRcdHJldHVybjsgLy8gaW52YWxpZCByZXNvdXJjZXNcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBTYW1lIFdpbmRvdzogb3BlbiB2aWEgZWRpdG9yIHNlcnZpY2UgaW4gY3VycmVudCB3aW5kb3dcblx0XHRcdFx0XHRpZiAodGhpcy5zaG91bGRSZXVzZShvcHRpb25zLCB0cnVlIC8qIGZpbGUgKi8pKSB7XG5cdFx0XHRcdFx0XHRlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogZWRpdG9yc1swXS5yZXNvdXJjZSB9LFxuXHRcdFx0XHRcdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogZWRpdG9yc1sxXS5yZXNvdXJjZSB9LFxuXHRcdFx0XHRcdFx0XHRvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBOZXcgV2luZG93OiBvcGVuIGludG8gZW1wdHkgd2luZG93XG5cdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlbnZpcm9ubWVudCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0XHRcdFx0XHRlbnZpcm9ubWVudC5zZXQoJ2RpZmZGaWxlU2Vjb25kYXJ5JywgZWRpdG9yc1swXS5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRcdGVudmlyb25tZW50LnNldCgnZGlmZkZpbGVQcmltYXJ5JywgZWRpdG9yc1sxXS5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdFx0XHRcdFx0dGhpcy5kb09wZW4odW5kZWZpbmVkLCB7IHBheWxvYWQ6IEFycmF5LmZyb20oZW52aXJvbm1lbnQuZW50cmllcygpKSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBKdXN0IG9wZW4gbm9ybWFsbHlcblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBvcGVuYWJsZSBvZiBmaWxlT3BlbmFibGVzKSB7XG5cblx0XHRcdFx0XHRcdC8vIFNhbWUgV2luZG93OiBvcGVuIHZpYSBlZGl0b3Igc2VydmljZSBpbiBjdXJyZW50IHdpbmRvd1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuc2hvdWxkUmV1c2Uob3B0aW9ucywgdHJ1ZSAvKiBmaWxlICovKSkge1xuXHRcdFx0XHRcdFx0XHRsZXQgb3BlbmFibGVzOiBJUGF0aERhdGE8SVRleHRFZGl0b3JPcHRpb25zPltdID0gW107XG5cblx0XHRcdFx0XHRcdFx0Ly8gU3VwcG9ydDogLS1nb3RvIHBhcmFtZXRlciB0byBvcGVuIG9uIGxpbmUvY29sXG5cdFx0XHRcdFx0XHRcdGlmIChvcHRpb25zPy5nb3RvTGluZU1vZGUpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBwYXRoQ29sdW1uQXdhcmUgPSBwYXJzZUxpbmVBbmRDb2x1bW5Bd2FyZShvcGVuYWJsZS5maWxlVXJpLnBhdGgpO1xuXHRcdFx0XHRcdFx0XHRcdG9wZW5hYmxlcyA9IFt7XG5cdFx0XHRcdFx0XHRcdFx0XHRmaWxlVXJpOiBvcGVuYWJsZS5maWxlVXJpLndpdGgoeyBwYXRoOiBwYXRoQ29sdW1uQXdhcmUucGF0aCB9KSxcblx0XHRcdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0c2VsZWN0aW9uOiAhaXNVbmRlZmluZWQocGF0aENvbHVtbkF3YXJlLmxpbmUpID8geyBzdGFydExpbmVOdW1iZXI6IHBhdGhDb2x1bW5Bd2FyZS5saW5lLCBzdGFydENvbHVtbjogcGF0aENvbHVtbkF3YXJlLmNvbHVtbiB8fCAxIH0gOiB1bmRlZmluZWRcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRvcGVuYWJsZXMgPSBbb3BlbmFibGVdO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0ZWRpdG9yU2VydmljZS5vcGVuRWRpdG9ycyhjb2FsZXNjZShhd2FpdCBwYXRoc1RvRWRpdG9ycyhvcGVuYWJsZXMsIHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSkpLCB1bmRlZmluZWQsIHsgdmFsaWRhdGVUcnVzdDogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gTmV3IFdpbmRvdzogb3BlbiBpbnRvIGVtcHR5IHdpbmRvd1xuXHRcdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGVudmlyb25tZW50ID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRcdFx0XHRcdFx0ZW52aXJvbm1lbnQuc2V0KCdvcGVuRmlsZScsIG9wZW5hYmxlLmZpbGVVcmkudG9TdHJpbmcoKSk7XG5cblx0XHRcdFx0XHRcdFx0aWYgKG9wdGlvbnM/LmdvdG9MaW5lTW9kZSkge1xuXHRcdFx0XHRcdFx0XHRcdGVudmlyb25tZW50LnNldCgnZ290b0xpbmVNb2RlJywgJ3RydWUnKTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdHRoaXMuZG9PcGVuKHVuZGVmaW5lZCwgeyBwYXlsb2FkOiBBcnJheS5mcm9tKGVudmlyb25tZW50LmVudHJpZXMoKSkgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU3VwcG9ydCB3YWl0IG1vZGVcblx0XHRcdFx0Y29uc3Qgd2FpdE1hcmtlckZpbGVVUkkgPSBvcHRpb25zPy53YWl0TWFya2VyRmlsZVVSSTtcblx0XHRcdFx0aWYgKHdhaXRNYXJrZXJGaWxlVVJJKSB7XG5cdFx0XHRcdFx0KGFzeW5jICgpID0+IHtcblxuXHRcdFx0XHRcdFx0Ly8gV2FpdCBmb3IgdGhlIHJlc291cmNlcyB0byBiZSBjbG9zZWQgaW4gdGhlIHRleHQgZWRpdG9yLi4uXG5cdFx0XHRcdFx0XHRjb25zdCBmaWxlc1RvV2FpdEZvcjogVVJJW10gPSBbXTtcblx0XHRcdFx0XHRcdGlmIChvcHRpb25zLm1lcmdlTW9kZSkge1xuXHRcdFx0XHRcdFx0XHRmaWxlc1RvV2FpdEZvci5wdXNoKGZpbGVPcGVuYWJsZXNbM10uZmlsZVVyaSAvKiBbM10gaXMgdGhlIHJlc3VsdGluZyBtZXJnZSBmaWxlICovKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGZpbGVzVG9XYWl0Rm9yLnB1c2goLi4uZmlsZU9wZW5hYmxlcy5tYXAoZmlsZU9wZW5hYmxlID0+IGZpbGVPcGVuYWJsZS5maWxlVXJpKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHdoZW5FZGl0b3JDbG9zZWQoYWNjZXNzb3IsIGZpbGVzVG9XYWl0Rm9yKSk7XG5cblx0XHRcdFx0XHRcdC8vIC4uLmJlZm9yZSBkZWxldGluZyB0aGUgd2FpdCBtYXJrZXIgZmlsZVxuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwod2FpdE1hcmtlckZpbGVVUkkpO1xuXHRcdFx0XHRcdH0pKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgd2l0aFNlcnZpY2VzKGZuOiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHVua25vd24pOiB2b2lkIHtcblx0XHQvLyBIb3N0IHNlcnZpY2UgaXMgdXNlZCBpbiBhIGxvdCBvZiBjb250ZXh0cyBhbmQgc29tZSBzZXJ2aWNlc1xuXHRcdC8vIG5lZWQgdG8gYmUgcmVzb2x2ZWQgZHluYW1pY2FsbHkgdG8gYXZvaWQgY3ljbGljIGRlcGVuZGVuY2llc1xuXHRcdC8vIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTA4NTIyKVxuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gZm4oYWNjZXNzb3IpKTtcblx0fVxuXG5cdHByaXZhdGUgcHJlc2VydmVQYXlsb2FkKGlzRW1wdHlXaW5kb3c6IGJvb2xlYW4sIG9wdGlvbnM/OiBJT3BlbldpbmRvd09wdGlvbnMpOiBBcnJheTx1bmtub3duPiB8IHVuZGVmaW5lZCB7XG5cblx0XHQvLyBTZWxlY3RpdmVseSBjb3B5IHBheWxvYWQ6IGZvciBub3cgb25seSBleHRlbnNpb24gZGVidWdnaW5nIHByb3BlcnRpZXMgYXJlIGNvbnNpZGVyZWRcblx0XHRjb25zdCBuZXdQYXlsb2FkOiBBcnJheTx1bmtub3duPiA9IFtdO1xuXHRcdGlmICghaXNFbXB0eVdpbmRvdyAmJiB0aGlzLmVudmlyb25tZW50U2VydmljZS5leHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9uVVJJKSB7XG5cdFx0XHRuZXdQYXlsb2FkLnB1c2goWydleHRlbnNpb25EZXZlbG9wbWVudFBhdGgnLCB0aGlzLmVudmlyb25tZW50U2VydmljZS5leHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9uVVJJLnRvU3RyaW5nKCldKTtcblxuXHRcdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmRlYnVnRXh0ZW5zaW9uSG9zdC5kZWJ1Z0lkKSB7XG5cdFx0XHRcdG5ld1BheWxvYWQucHVzaChbJ2RlYnVnSWQnLCB0aGlzLmVudmlyb25tZW50U2VydmljZS5kZWJ1Z0V4dGVuc2lvbkhvc3QuZGVidWdJZF0pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZGVidWdFeHRlbnNpb25Ib3N0LnBvcnQpIHtcblx0XHRcdFx0bmV3UGF5bG9hZC5wdXNoKFsnaW5zcGVjdC1icmstZXh0ZW5zaW9ucycsIFN0cmluZyh0aGlzLmVudmlyb25tZW50U2VydmljZS5kZWJ1Z0V4dGVuc2lvbkhvc3QucG9ydCldKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBuZXdXaW5kb3dQcm9maWxlID0gb3B0aW9ucz8uZm9yY2VQcm9maWxlXG5cdFx0XHQ/IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMuZmluZChwcm9maWxlID0+IHByb2ZpbGUubmFtZSA9PT0gb3B0aW9ucz8uZm9yY2VQcm9maWxlKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0aWYgKG5ld1dpbmRvd1Byb2ZpbGUgJiYgIW5ld1dpbmRvd1Byb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRuZXdQYXlsb2FkLnB1c2goWydwcm9maWxlJywgbmV3V2luZG93UHJvZmlsZS5uYW1lXSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ld1BheWxvYWQubGVuZ3RoID8gbmV3UGF5bG9hZCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVjZW50TGFiZWwob3BlbmFibGU6IElXaW5kb3dPcGVuYWJsZSk6IHN0cmluZyB7XG5cdFx0aWYgKGlzRm9sZGVyVG9PcGVuKG9wZW5hYmxlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMubGFiZWxTZXJ2aWNlLmdldFdvcmtzcGFjZUxhYmVsKG9wZW5hYmxlLmZvbGRlclVyaSwgeyB2ZXJib3NlOiBWZXJib3NpdHkuTE9ORyB9KTtcblx0XHR9XG5cblx0XHRpZiAoaXNXb3Jrc3BhY2VUb09wZW4ob3BlbmFibGUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0V29ya3NwYWNlTGFiZWwoZ2V0V29ya3NwYWNlSWRlbnRpZmllcihvcGVuYWJsZS53b3Jrc3BhY2VVcmkpLCB7IHZlcmJvc2U6IFZlcmJvc2l0eS5MT05HIH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChvcGVuYWJsZS5maWxlVXJpLCB7IGFwcGVuZFdvcmtzcGFjZVN1ZmZpeDogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkUmV1c2Uob3B0aW9uczogSU9wZW5XaW5kb3dPcHRpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKSwgaXNGaWxlOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0aWYgKG9wdGlvbnMud2FpdE1hcmtlckZpbGVVUkkpIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyBhbHdheXMgaGFuZGxlIC0td2FpdCBpbiBzYW1lIHdpbmRvd1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpbmRvd0NvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVdpbmRvd1NldHRpbmdzIHwgdW5kZWZpbmVkPignd2luZG93Jyk7XG5cdFx0Y29uc3Qgb3BlbkluTmV3V2luZG93Q29uZmlnID0gaXNGaWxlID8gKHdpbmRvd0NvbmZpZz8ub3BlbkZpbGVzSW5OZXdXaW5kb3cgfHwgJ29mZicgLyogZGVmYXVsdCAqLykgOiAod2luZG93Q29uZmlnPy5vcGVuRm9sZGVyc0luTmV3V2luZG93IHx8ICdkZWZhdWx0JyAvKiBkZWZhdWx0ICovKTtcblxuXHRcdGxldCBvcGVuSW5OZXdXaW5kb3cgPSAob3B0aW9ucy5wcmVmZXJOZXdXaW5kb3cgfHwgISFvcHRpb25zLmZvcmNlTmV3V2luZG93KSAmJiAhb3B0aW9ucy5mb3JjZVJldXNlV2luZG93O1xuXHRcdGlmICghb3B0aW9ucy5mb3JjZU5ld1dpbmRvdyAmJiAhb3B0aW9ucy5mb3JjZVJldXNlV2luZG93ICYmIChvcGVuSW5OZXdXaW5kb3dDb25maWcgPT09ICdvbicgfHwgb3BlbkluTmV3V2luZG93Q29uZmlnID09PSAnb2ZmJykpIHtcblx0XHRcdG9wZW5Jbk5ld1dpbmRvdyA9IChvcGVuSW5OZXdXaW5kb3dDb25maWcgPT09ICdvbicpO1xuXHRcdH1cblxuXHRcdHJldHVybiAhb3BlbkluTmV3V2luZG93O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb09wZW5FbXB0eVdpbmRvdyhvcHRpb25zPzogSU9wZW5FbXB0eVdpbmRvd09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5kb09wZW4odW5kZWZpbmVkLCB7XG5cdFx0XHRyZXVzZTogb3B0aW9ucz8uZm9yY2VSZXVzZVdpbmRvdyxcblx0XHRcdHBheWxvYWQ6IHRoaXMucHJlc2VydmVQYXlsb2FkKHRydWUgLyogZW1wdHkgd2luZG93ICovLCBvcHRpb25zKVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb09wZW4od29ya3NwYWNlOiBJV29ya3NwYWNlLCBvcHRpb25zPzogeyByZXVzZT86IGJvb2xlYW47IHBheWxvYWQ/OiBvYmplY3QgfSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gV2hlbiB3ZSBhcmUgaW4gYSB0ZW1wb3Jhcnkgd29ya3NwYWNlIGFuZCBhcmUgYXNrZWQgdG8gb3BlbiBhIGxvY2FsIGZvbGRlclxuXHRcdC8vIHdlIHN3YXAgdGhhdCBmb2xkZXIgaW50byB0aGUgd29ya3NwYWNlIHRvIGF2b2lkIGEgd2luZG93IHJlbG9hZC4gQWNjZXNzXG5cdFx0Ly8gdG8gbG9jYWwgcmVzb3VyY2VzIGlzIG9ubHkgcG9zc2libGUgd2l0aG91dCBhIHdpbmRvdyByZWxvYWQgYmVjYXVzZSBpdFxuXHRcdC8vIG5lZWRzIHVzZXIgYWN0aXZhdGlvbi5cblx0XHRpZiAod29ya3NwYWNlICYmIGlzRm9sZGVyVG9PcGVuKHdvcmtzcGFjZSkgJiYgd29ya3NwYWNlLmZvbGRlclVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSAmJiBpc1RlbXBvcmFyeVdvcmtzcGFjZSh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKSkge1xuXHRcdFx0dGhpcy53aXRoU2VydmljZXMoYXN5bmMgYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VFZGl0aW5nU2VydmljZTogSVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSk7XG5cblx0XHRcdFx0YXdhaXQgd29ya3NwYWNlRWRpdGluZ1NlcnZpY2UudXBkYXRlRm9sZGVycygwLCB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubGVuZ3RoLCBbeyB1cmk6IHdvcmtzcGFjZS5mb2xkZXJVcmkgfV0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBXZSBrbm93IHRoYXQgYHdvcmtzcGFjZVByb3ZpZGVyLm9wZW5gIHdpbGwgdHJpZ2dlciBhIHNodXRkb3duXG5cdFx0Ly8gd2l0aCBgb3B0aW9ucy5yZXVzZWAgc28gd2UgaGFuZGxlIHRoaXMgZXhwZWN0ZWQgc2h1dGRvd25cblx0XHRpZiAob3B0aW9ucz8ucmV1c2UpIHtcblx0XHRcdGF3YWl0IHRoaXMuaGFuZGxlRXhwZWN0ZWRTaHV0ZG93bihTaHV0ZG93blJlYXNvbi5MT0FEKTtcblx0XHR9XG5cblx0XHRjb25zdCBvcGVuZWQgPSBhd2FpdCB0aGlzLndvcmtzcGFjZVByb3ZpZGVyLm9wZW4od29ya3NwYWNlLCBvcHRpb25zKTtcblx0XHRpZiAoIW9wZW5lZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRcdHR5cGU6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdG1lc3NhZ2U6IHdvcmtzcGFjZSA/XG5cdFx0XHRcdFx0bG9jYWxpemUoJ3VuYWJsZVRvT3BlbkV4dGVybmFsV29ya3NwYWNlJywgXCJUaGUgYnJvd3NlciBibG9ja2VkIG9wZW5pbmcgYSBuZXcgdGFiIG9yIHdpbmRvdyBmb3IgJ3swfScuIFByZXNzICdSZXRyeScgdG8gdHJ5IGFnYWluLlwiLCB0aGlzLmdldFJlY2VudExhYmVsKHdvcmtzcGFjZSkpIDpcblx0XHRcdFx0XHRsb2NhbGl6ZSgndW5hYmxlVG9PcGVuRXh0ZXJuYWwnLCBcIlRoZSBicm93c2VyIGJsb2NrZWQgb3BlbmluZyBhIG5ldyB0YWIgb3Igd2luZG93LiBQcmVzcyAnUmV0cnknIHRvIHRyeSBhZ2Fpbi5cIiksXG5cdFx0XHRcdGN1c3RvbToge1xuXHRcdFx0XHRcdG1hcmtkb3duRGV0YWlsczogW3sgbWFya2Rvd246IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgndW5hYmxlVG9PcGVuV2luZG93RGV0YWlsJywgXCJQbGVhc2UgYWxsb3cgcG9wLXVwcyBmb3IgdGhpcyB3ZWJzaXRlIGluIHlvdXIgW2Jyb3dzZXIgc2V0dGluZ3NdKHswfSkuXCIsICdodHRwczovL2FrYS5tcy9hbGxvdy12c2NvZGUtcG9wdXAnKSwgdHJ1ZSkgfV1cblx0XHRcdFx0fSxcblx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ3JldHJ5JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUmV0cnlcIiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMud29ya3NwYWNlUHJvdmlkZXIub3Blbih3b3Jrc3BhY2UsIG9wdGlvbnMpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRjYW5jZWxCdXR0b246IHRydWVcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHRvZ2dsZUZ1bGxTY3JlZW4odGFyZ2V0V2luZG93OiBXaW5kb3cpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLmxheW91dFNlcnZpY2UuZ2V0Q29udGFpbmVyKHRhcmdldFdpbmRvdyk7XG5cblx0XHQvLyBDaHJvbWl1bVxuXHRcdGlmICh0YXJnZXRXaW5kb3cuZG9jdW1lbnQuZnVsbHNjcmVlbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAoIXRhcmdldFdpbmRvdy5kb2N1bWVudC5mdWxsc2NyZWVuKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cmV0dXJuIGF3YWl0IHRhcmdldC5yZXF1ZXN0RnVsbHNjcmVlbigpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCd0b2dnbGVGdWxsU2NyZWVuKCk6IHJlcXVlc3RGdWxsc2NyZWVuIGZhaWxlZCcpOyAvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvRWxlbWVudC9yZXF1ZXN0RnVsbHNjcmVlblxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJldHVybiBhd2FpdCB0YXJnZXRXaW5kb3cuZG9jdW1lbnQuZXhpdEZ1bGxzY3JlZW4oKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybigndG9nZ2xlRnVsbFNjcmVlbigpOiBleGl0RnVsbHNjcmVlbiBmYWlsZWQnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNhZmFyaSBhbmQgRWRnZSAxNCBhcmUgYWxsIHVzaW5nIHdlYmtpdCBwcmVmaXhcblxuXHRcdGludGVyZmFjZSBXZWJraXREb2N1bWVudCBleHRlbmRzIERvY3VtZW50IHtcblx0XHRcdHdlYmtpdEZ1bGxzY3JlZW5FbGVtZW50OiBFbGVtZW50IHwgbnVsbDtcblx0XHRcdHdlYmtpdEV4aXRGdWxsc2NyZWVuKCk6IFByb21pc2U8dm9pZD47XG5cdFx0XHR3ZWJraXRJc0Z1bGxTY3JlZW46IGJvb2xlYW47XG5cdFx0fVxuXG5cdFx0aW50ZXJmYWNlIFdlYmtpdEhUTUxFbGVtZW50IGV4dGVuZHMgSFRNTEVsZW1lbnQge1xuXHRcdFx0d2Via2l0UmVxdWVzdEZ1bGxzY3JlZW4oKTogUHJvbWlzZTx2b2lkPjtcblx0XHR9XG5cblx0XHRjb25zdCB3ZWJraXREb2N1bWVudCA9IHRhcmdldFdpbmRvdy5kb2N1bWVudCBhcyBXZWJraXREb2N1bWVudDtcblx0XHRjb25zdCB3ZWJraXRFbGVtZW50ID0gdGFyZ2V0IGFzIFdlYmtpdEhUTUxFbGVtZW50O1xuXHRcdGlmICh3ZWJraXREb2N1bWVudC53ZWJraXRJc0Z1bGxTY3JlZW4gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKCF3ZWJraXREb2N1bWVudC53ZWJraXRJc0Z1bGxTY3JlZW4pIHtcblx0XHRcdFx0XHR3ZWJraXRFbGVtZW50LndlYmtpdFJlcXVlc3RGdWxsc2NyZWVuKCk7IC8vIGl0J3MgYXN5bmMsIGJ1dCBkb2Vzbid0IHJldHVybiBhIHJlYWwgcHJvbWlzZVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHdlYmtpdERvY3VtZW50LndlYmtpdEV4aXRGdWxsc2NyZWVuKCk7IC8vIGl0J3MgYXN5bmMsIGJ1dCBkb2Vzbid0IHJldHVybiBhIHJlYWwgcHJvbWlzZVxuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ3RvZ2dsZUZ1bGxTY3JlZW4oKTogcmVxdWVzdEZ1bGxzY3JlZW4vZXhpdEZ1bGxzY3JlZW4gZmFpbGVkJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgbW92ZVRvcCh0YXJnZXRXaW5kb3c6IFdpbmRvdyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFRoZXJlIHNlZW1zIHRvIGJlIG5vIEFQSSB0byBicmluZyBhIHdpbmRvdyB0byBmcm9udCBpbiBicm93c2Vyc1xuXHR9XG5cblx0YXN5bmMgc2V0V2luZG93RGltbWVkKF90YXJnZXRXaW5kb3c6IFdpbmRvdywgX2RpbW1lZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIG5vdCBzdXBwb3J0ZWQgaW4gYnJvd3NlclxuXHR9XG5cblx0YXN5bmMgZ2V0Q3Vyc29yU2NyZWVuUG9pbnQoKTogUHJvbWlzZTx1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZ2V0V2luZG93UG9zaXRpb24odGFyZ2V0V2luZG93OiBXaW5kb3cpOiBQcm9taXNlPElSZWN0YW5nbGU+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0eDogdGFyZ2V0V2luZG93LnNjcmVlblgsXG5cdFx0XHR5OiB0YXJnZXRXaW5kb3cuc2NyZWVuWSxcblx0XHRcdHdpZHRoOiB0YXJnZXRXaW5kb3cub3V0ZXJXaWR0aCxcblx0XHRcdGhlaWdodDogdGFyZ2V0V2luZG93Lm91dGVySGVpZ2h0LFxuXHRcdH07XG5cdH1cblxuXHRnZXRXaW5kb3dzKG9wdGlvbnM6IHsgaW5jbHVkZUF1eGlsaWFyeVdpbmRvd3M6IHRydWUgfSk6IFByb21pc2U8QXJyYXk8SU9wZW5lZE1haW5XaW5kb3cgfCBJT3BlbmVkQXV4aWxpYXJ5V2luZG93Pj47XG5cdGdldFdpbmRvd3Mob3B0aW9uczogeyBpbmNsdWRlQXV4aWxpYXJ5V2luZG93czogZmFsc2UgfSk6IFByb21pc2U8QXJyYXk8SU9wZW5lZE1haW5XaW5kb3c+Pjtcblx0YXN5bmMgZ2V0V2luZG93cyhvcHRpb25zOiB7IGluY2x1ZGVBdXhpbGlhcnlXaW5kb3dzOiBib29sZWFuIH0pOiBQcm9taXNlPEFycmF5PElPcGVuZWRNYWluV2luZG93IHwgSU9wZW5lZEF1eGlsaWFyeVdpbmRvdz4+IHtcblx0XHRjb25zdCBhY3RpdmVXaW5kb3cgPSBnZXRBY3RpdmVXaW5kb3coKTtcblx0XHRjb25zdCBhY3RpdmVXaW5kb3dJZCA9IGdldFdpbmRvd0lkKGFjdGl2ZVdpbmRvdyk7XG5cblx0XHQvLyBNYWluIHdpbmRvd1xuXHRcdGNvbnN0IHJlc3VsdDogQXJyYXk8SU9wZW5lZE1haW5XaW5kb3cgfCBJT3BlbmVkQXV4aWxpYXJ5V2luZG93PiA9IFt7XG5cdFx0XHRpZDogYWN0aXZlV2luZG93SWQsXG5cdFx0XHR0aXRsZTogYWN0aXZlV2luZG93LmRvY3VtZW50LnRpdGxlLFxuXHRcdFx0d29ya3NwYWNlOiB0b1dvcmtzcGFjZUlkZW50aWZpZXIodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSksXG5cdFx0XHRkaXJ0eTogZmFsc2Vcblx0XHR9XTtcblxuXHRcdC8vIEF1eGlsaWFyeSB3aW5kb3dzXG5cdFx0aWYgKG9wdGlvbnMuaW5jbHVkZUF1eGlsaWFyeVdpbmRvd3MpIHtcblx0XHRcdGZvciAoY29uc3QgeyB3aW5kb3cgfSBvZiBnZXRET01XaW5kb3dzKCkpIHtcblx0XHRcdFx0Y29uc3Qgd2luZG93SWQgPSBnZXRXaW5kb3dJZCh3aW5kb3cpO1xuXHRcdFx0XHRpZiAod2luZG93SWQgIT09IGFjdGl2ZVdpbmRvd0lkICYmIGlzQXV4aWxpYXJ5V2luZG93KHdpbmRvdykpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0XHRpZDogd2luZG93SWQsXG5cdFx0XHRcdFx0XHR0aXRsZTogd2luZG93LmRvY3VtZW50LnRpdGxlLFxuXHRcdFx0XHRcdFx0cGFyZW50SWQ6IGFjdGl2ZVdpbmRvd0lkXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIExpZmVjeWNsZVxuXG5cdGFzeW5jIHJlc3RhcnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5yZWxvYWQoKTtcblx0fVxuXG5cdGFzeW5jIHJlbG9hZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmhhbmRsZUV4cGVjdGVkU2h1dGRvd24oU2h1dGRvd25SZWFzb24uUkVMT0FEKTtcblxuXHRcdG1haW5XaW5kb3cubG9jYXRpb24ucmVsb2FkKCk7XG5cdH1cblxuXHRhc3luYyBjbG9zZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmhhbmRsZUV4cGVjdGVkU2h1dGRvd24oU2h1dGRvd25SZWFzb24uQ0xPU0UpO1xuXG5cdFx0bWFpbldpbmRvdy5jbG9zZSgpO1xuXHR9XG5cblx0YXN5bmMgc2h1dGRvd24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuY2xvc2UoKTtcblx0fVxuXG5cdGFzeW5jIHdpdGhFeHBlY3RlZFNodXRkb3duPFQ+KGV4cGVjdGVkU2h1dGRvd25UYXNrOiAoKSA9PiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiB7XG5cdFx0Y29uc3QgcHJldmlvdXNTaHV0ZG93blJlYXNvbiA9IHRoaXMuc2h1dGRvd25SZWFzb247XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuc2h1dGRvd25SZWFzb24gPSBIb3N0U2h1dGRvd25SZWFzb24uQXBpO1xuXHRcdFx0cmV0dXJuIGF3YWl0IGV4cGVjdGVkU2h1dGRvd25UYXNrKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuc2h1dGRvd25SZWFzb24gPSBwcmV2aW91c1NodXRkb3duUmVhc29uO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlRXhwZWN0ZWRTaHV0ZG93bihyZWFzb246IFNodXRkb3duUmVhc29uKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBVcGRhdGUgc2h1dGRvd24gcmVhc29uIGluIGEgd2F5IHRoYXQgd2UgZG9cblx0XHQvLyBub3Qgc2hvdyBhIGRpYWxvZyBiZWNhdXNlIHRoaXMgaXMgYSBleHBlY3RlZFxuXHRcdC8vIHNodXRkb3duLlxuXHRcdHRoaXMuc2h1dGRvd25SZWFzb24gPSBIb3N0U2h1dGRvd25SZWFzb24uQXBpO1xuXG5cdFx0Ly8gU2lnbmFsIHNodXRkb3duIHJlYXNvbiB0byBsaWZlY3ljbGVcblx0XHRyZXR1cm4gdGhpcy5saWZlY3ljbGVTZXJ2aWNlLndpdGhFeHBlY3RlZFNodXRkb3duKHJlYXNvbik7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gU2NyZWVuc2hvdHNcblxuXHRhc3luYyBnZXRTY3JlZW5zaG90KCk6IFByb21pc2U8VlNCdWZmZXIgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBHZXRzIGEgc2NyZWVuc2hvdCBmcm9tIHRoZSBicm93c2VyLiBUaGlzIGdldHMgdGhlIHNjcmVlbnNob3QgdmlhIHRoZSBicm93c2VyJ3MgZGlzcGxheVxuXHRcdC8vIG1lZGlhIEFQSSB3aGljaCB3aWxsIHR5cGljYWxseSBvZmZlciBhIHBpY2tlciBvZiBhbGwgYXZhaWxhYmxlIHNjcmVlbnMgYW5kIHdpbmRvd3MgZm9yXG5cdFx0Ly8gdGhlIHVzZXIgdG8gc2VsZWN0LiBVc2luZyB0aGUgdmlkZW8gc3RyZWFtIHByb3ZpZGVkIGJ5IHRoZSBkaXNwbGF5IG1lZGlhIEFQSSwgdGhpcyB3aWxsXG5cdFx0Ly8gY2FwdHVyZSBhIHNpbmdsZSBmcmFtZSBvZiB0aGUgdmlkZW8gYW5kIGNvbnZlcnQgaXQgdG8gYSBKUEVHIGltYWdlLlxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgdmlkZW8gZWxlbWVudCB0byBwbGF5IHRoZSBjYXB0dXJlZCBzY3JlZW4gc291cmNlXG5cdFx0Y29uc3QgdmlkZW8gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd2aWRlbycpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdmlkZW8ucmVtb3ZlKCkpKTtcblx0XHRsZXQgc3RyZWFtOiBNZWRpYVN0cmVhbSB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0Ly8gQ3JlYXRlIGEgc3RyZWFtIGZyb20gdGhlIHNjcmVlbiBzb3VyY2UgKGNhcHR1cmUgc2NyZWVuIHdpdGhvdXQgYXVkaW8pXG5cdFx0XHRzdHJlYW0gPSBhd2FpdCBuYXZpZ2F0b3IubWVkaWFEZXZpY2VzLmdldERpc3BsYXlNZWRpYSh7XG5cdFx0XHRcdGF1ZGlvOiBmYWxzZSxcblx0XHRcdFx0dmlkZW86IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBTZXQgdGhlIHN0cmVhbSBhcyB0aGUgc291cmNlIG9mIHRoZSB2aWRlbyBlbGVtZW50XG5cdFx0XHR2aWRlby5zcmNPYmplY3QgPSBzdHJlYW07XG5cdFx0XHR2aWRlby5wbGF5KCk7XG5cblx0XHRcdC8vIFdhaXQgZm9yIHRoZSB2aWRlbyB0byBsb2FkIHByb3Blcmx5IGJlZm9yZSBjYXB0dXJpbmcgdGhlIHNjcmVlbnNob3Rcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0bmV3IFByb21pc2U8dm9pZD4ociA9PiBzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHZpZGVvLCAnbG9hZGVkbWV0YWRhdGEnLCAoKSA9PiByKCkpKSksXG5cdFx0XHRcdG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4gc3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih2aWRlbywgJ2NhbnBsYXl0aHJvdWdoJywgKCkgPT4gcigpKSkpXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG5cdFx0XHRjYW52YXMud2lkdGggPSB2aWRlby52aWRlb1dpZHRoO1xuXHRcdFx0Y2FudmFzLmhlaWdodCA9IHZpZGVvLnZpZGVvSGVpZ2h0O1xuXG5cdFx0XHRjb25zdCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcblx0XHRcdGlmICghY3R4KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIERyYXcgdGhlIHBvcnRpb24gb2YgdGhlIHZpZGVvICh4LCB5KSB3aXRoIHRoZSBzcGVjaWZpZWQgd2lkdGggYW5kIGhlaWdodFxuXHRcdFx0Y3R4LmRyYXdJbWFnZSh2aWRlbywgMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcblxuXHRcdFx0Ly8gQ29udmVydCB0aGUgY2FudmFzIHRvIGEgQmxvYiAoSlBFRyBmb3JtYXQpLCB1c2UgLjk1IGZvciBxdWFsaXR5XG5cdFx0XHRjb25zdCBibG9iOiBCbG9iIHwgbnVsbCA9IGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiBjYW52YXMudG9CbG9iKChibG9iKSA9PiByZXNvbHZlKGJsb2IpLCAnaW1hZ2UvanBlZycsIDAuOTUpKTtcblx0XHRcdGlmICghYmxvYikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBjcmVhdGUgYmxvYiBmcm9tIGNhbnZhcycpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBidWYgPSBhd2FpdCBibG9iLmJ5dGVzKCk7XG5cdFx0XHRyZXR1cm4gVlNCdWZmZXIud3JhcChidWYpO1xuXG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHRha2luZyBzY3JlZW5zaG90OicsIGVycm9yKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdGlmIChzdHJlYW0pIHtcblx0XHRcdFx0Zm9yIChjb25zdCB0cmFjayBvZiBzdHJlYW0uZ2V0VHJhY2tzKCkpIHtcblx0XHRcdFx0XHR0cmFjay5zdG9wKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRCcm93c2VySWQoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIE5hdGl2ZSBIYW5kbGVcblxuXHRhc3luYyBnZXROYXRpdmVXaW5kb3dIYW5kbGUoX3dpbmRvd0lkOiBudW1iZXIpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFRvYXN0IE5vdGlmaWNhdGlvbnNcblxuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGl2ZVRvYXN0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU2V0KCkpO1xuXG5cdGFzeW5jIHNob3dUb2FzdChvcHRpb25zOiBJVG9hc3RPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb2FzdFJlc3VsdD4ge1xuXHRcdHJldHVybiBzaG93QnJvd3NlclRvYXN0KHtcblx0XHRcdG9uRGlkQ3JlYXRlVG9hc3Q6IGRpc3Bvc2FibGUgPT4gdGhpcy5hY3RpdmVUb2FzdHMuYWRkKGRpc3Bvc2FibGUpLFxuXHRcdFx0b25EaWREaXNwb3NlVG9hc3Q6IGRpc3Bvc2FibGUgPT4gdGhpcy5hY3RpdmVUb2FzdHMuZGVsZXRlQW5kRGlzcG9zZShkaXNwb3NhYmxlKVxuXHRcdH0sIG9wdGlvbnMsIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2xlYXJUb2FzdHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5hY3RpdmVUb2FzdHMuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUhvc3RTZXJ2aWNlLCBCcm93c2VySG9zdFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLG9CQUFpRDtBQUMxRCxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBK0QsZ0JBQWdCLG1CQUFtQixvQkFBNEg7QUFDOU4sU0FBUyx1QkFBdUIsc0JBQXNCO0FBQ3RELFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZUFBZSxpQkFBaUI7QUFDekMsU0FBUyxXQUFXLG9CQUFvQix1QkFBdUIsZ0NBQWdDLGtCQUFrQiwwQkFBMEIsbUJBQW1CLGlCQUFpQixhQUFhLHFCQUFxQixZQUFZLGNBQWMscUJBQXFCO0FBQ2hRLFNBQVMsWUFBWSxlQUFlLGlCQUFpQixvQkFBb0I7QUFDekUsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQXdDLHNCQUFzQjtBQUV2RSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGdCQUFnQjtBQUN6QixPQUFPLGNBQWM7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
