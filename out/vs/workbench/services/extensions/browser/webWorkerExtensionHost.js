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
import * as dom from "../../../../base/browser/dom.js";
import { parentOriginHash } from "../../../../base/browser/iframe.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { Barrier } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { canceled, onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { COI, FileAccess } from "../../../../base/common/network.js";
import * as platform from "../../../../base/common/platform.js";
import { joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { getNLSLanguage, getNLSMessages } from "../../../../nls.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { ILogService, ILoggerService } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IWorkbenchAssignmentService } from "../../assignment/common/assignmentService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { isLoggingOnly } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { WebWorkerDescriptor } from "../../../../platform/webWorker/browser/webWorkerDescriptor.js";
import { IWebWorkerService } from "../../../../platform/webWorker/browser/webWorkerService.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IBrowserWorkbenchEnvironmentService } from "../../environment/browser/environmentService.js";
import { IDefaultLogLevelsService } from "../../log/common/defaultLogLevels.js";
import { ExtensionHostExitCode, MessageType, UIKind, createMessageOfType, isMessageOfType } from "../common/extensionHostProtocol.js";
import { ExtensionHostStartup, resolveEnabledApiProposalsFallbackExperiment } from "../common/extensions.js";
let WebWorkerExtensionHost = class extends Disposable {
  constructor(runningLocation, startup, _initDataProvider, _telemetryService, _contextService, _labelService, _logService, _loggerService, _environmentService, _userDataProfilesService, _productService, _layoutService, _storageService, _webWorkerService, _defaultLogLevelsService, _workbenchAssignmentService) {
    super();
    this.runningLocation = runningLocation;
    this.startup = startup;
    this._initDataProvider = _initDataProvider;
    this._telemetryService = _telemetryService;
    this._contextService = _contextService;
    this._labelService = _labelService;
    this._logService = _logService;
    this._loggerService = _loggerService;
    this._environmentService = _environmentService;
    this._userDataProfilesService = _userDataProfilesService;
    this._productService = _productService;
    this._layoutService = _layoutService;
    this._storageService = _storageService;
    this._webWorkerService = _webWorkerService;
    this._defaultLogLevelsService = _defaultLogLevelsService;
    this._workbenchAssignmentService = _workbenchAssignmentService;
    this.pid = null;
    this.remoteAuthority = null;
    this.extensions = null;
    this._onDidExit = this._register(new Emitter());
    this.onExit = this._onDidExit.event;
    this._isTerminating = false;
    this._protocolPromise = null;
    this._protocol = null;
    this._extensionHostLogsLocation = joinPath(this._environmentService.extHostLogsPath, "webWorker");
  }
  async _getWebWorkerExtensionHostIframeSrc() {
    const suffixSearchParams = new URLSearchParams();
    if (this._environmentService.debugExtensionHost && this._environmentService.debugRenderer) {
      suffixSearchParams.set("debugged", "1");
    }
    COI.addSearchParam(suffixSearchParams, true, true);
    const suffix = `?${suffixSearchParams.toString()}`;
    const iframeModulePath = `vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html`;
    if (platform.isWeb) {
      const webEndpointUrlTemplate = this._productService.webEndpointUrlTemplate;
      const commit = this._productService.commit;
      const quality = this._productService.quality;
      if (webEndpointUrlTemplate && commit && quality) {
        const key = "webWorkerExtensionHostIframeStableOriginUUID";
        let stableOriginUUID = this._storageService.get(key, StorageScope.WORKSPACE);
        if (typeof stableOriginUUID === "undefined") {
          stableOriginUUID = generateUuid();
          this._storageService.store(key, stableOriginUUID, StorageScope.WORKSPACE, StorageTarget.MACHINE);
        }
        const hash = await parentOriginHash(mainWindow.origin, stableOriginUUID);
        const baseUrl = webEndpointUrlTemplate.replace("{{uuid}}", `v--${hash}`).replace("{{commit}}", commit).replace("{{quality}}", quality);
        const res = new URL(`${baseUrl}/out/${iframeModulePath}${suffix}`);
        res.searchParams.set("parentOrigin", mainWindow.origin);
        res.searchParams.set("salt", stableOriginUUID);
        return res.toString();
      }
      console.warn(`The web worker extension host is started in a same-origin iframe!`);
    }
    const relativeExtensionHostIframeSrc = this._webWorkerService.getWorkerUrl(new WebWorkerDescriptor({
      esmModuleLocation: FileAccess.asBrowserUri(iframeModulePath),
      esmModuleLocationBundler: new URL(`../worker/webWorkerExtensionHostIframe.html`, import.meta.url),
      label: "webWorkerExtensionHostIframe"
    }));
    return `${relativeExtensionHostIframeSrc}${suffix}`;
  }
  async start() {
    if (!this._protocolPromise) {
      this._protocolPromise = this._startInsideIframe();
      this._protocolPromise.then((protocol) => this._protocol = protocol);
    }
    return this._protocolPromise;
  }
  async _startInsideIframe() {
    const webWorkerExtensionHostIframeSrc = await this._getWebWorkerExtensionHostIframeSrc();
    const emitter = this._register(new Emitter());
    const iframe = document.createElement("iframe");
    iframe.setAttribute("class", "web-worker-ext-host-iframe");
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
    iframe.setAttribute("allow", "usb; serial; hid; cross-origin-isolated; local-network-access;");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.display = "none";
    const vscodeWebWorkerExtHostId = generateUuid();
    iframe.setAttribute("src", `${webWorkerExtensionHostIframeSrc}&vscodeWebWorkerExtHostId=${vscodeWebWorkerExtHostId}`);
    const barrier = new Barrier();
    let port;
    let barrierError = null;
    let barrierHasError = false;
    let startTimeout = void 0;
    const rejectBarrier = (exitCode, error) => {
      barrierError = error;
      barrierHasError = true;
      onUnexpectedError(barrierError);
      clearTimeout(startTimeout);
      this._onDidExit.fire([ExtensionHostExitCode.UnexpectedError, barrierError.message]);
      barrier.open();
    };
    const resolveBarrier = (messagePort) => {
      port = messagePort;
      clearTimeout(startTimeout);
      barrier.open();
    };
    startTimeout = setTimeout(() => {
      console.warn(`The Web Worker Extension Host did not start in 60s, that might be a problem.`);
    }, 6e4);
    this._register(dom.addDisposableListener(mainWindow, "message", (event) => {
      if (event.source !== iframe.contentWindow) {
        return;
      }
      if (event.data.vscodeWebWorkerExtHostId !== vscodeWebWorkerExtHostId) {
        return;
      }
      if (event.data.error) {
        const { name, message, stack } = event.data.error;
        const err = new Error();
        err.message = message;
        err.name = name;
        err.stack = stack;
        return rejectBarrier(ExtensionHostExitCode.UnexpectedError, err);
      }
      if (event.data.type === "vscode.bootstrap.nls") {
        iframe.contentWindow.postMessage({
          type: event.data.type,
          data: {
            workerUrl: this._webWorkerService.getWorkerUrl(extensionHostWorkerMainDescriptor),
            fileRoot: globalThis._VSCODE_FILE_ROOT,
            nls: {
              messages: getNLSMessages(),
              language: getNLSLanguage()
            }
          }
        }, "*");
        return;
      }
      const { data } = event.data;
      if (barrier.isOpen() || !(data instanceof MessagePort)) {
        console.warn("UNEXPECTED message", event);
        const err = new Error("UNEXPECTED message");
        return rejectBarrier(ExtensionHostExitCode.UnexpectedError, err);
      }
      resolveBarrier(data);
    }));
    this._layoutService.mainContainer.appendChild(iframe);
    this._register(toDisposable(() => iframe.remove()));
    await barrier.wait();
    if (barrierHasError) {
      throw barrierError;
    }
    const messagePorts = this._environmentService.options?.messagePorts ?? /* @__PURE__ */ new Map();
    iframe.contentWindow.postMessage({ type: "vscode.init", data: messagePorts }, "*", [...messagePorts.values()]);
    port.onmessage = (event) => {
      const { data } = event;
      if (!(data instanceof ArrayBuffer)) {
        console.warn("UNKNOWN data received", data);
        this._onDidExit.fire([77, "UNKNOWN data received"]);
        return;
      }
      emitter.fire(VSBuffer.wrap(new Uint8Array(data, 0, data.byteLength)));
    };
    const protocol = {
      onMessage: emitter.event,
      send: (vsbuf) => {
        const data = vsbuf.buffer.buffer.slice(vsbuf.buffer.byteOffset, vsbuf.buffer.byteOffset + vsbuf.buffer.byteLength);
        port.postMessage(data, [data]);
      }
    };
    return this._performHandshake(protocol);
  }
  async _performHandshake(protocol) {
    await Event.toPromise(Event.filter(protocol.onMessage, (msg) => isMessageOfType(msg, MessageType.Ready)));
    if (this._isTerminating) {
      throw canceled();
    }
    protocol.send(VSBuffer.fromString(JSON.stringify(await this._createExtHostInitData())));
    if (this._isTerminating) {
      throw canceled();
    }
    await Event.toPromise(Event.filter(protocol.onMessage, (msg) => isMessageOfType(msg, MessageType.Initialized)));
    if (this._isTerminating) {
      throw canceled();
    }
    return protocol;
  }
  dispose() {
    if (this._isTerminating) {
      return;
    }
    this._isTerminating = true;
    this._protocol?.send(createMessageOfType(MessageType.Terminate));
    super.dispose();
  }
  getInspectPort() {
    return void 0;
  }
  enableInspectPort() {
    return Promise.resolve(false);
  }
  async _createExtHostInitData() {
    const initData = await this._initDataProvider.getInitData();
    this.extensions = initData.extensions;
    const workspace = this._contextService.getWorkspace();
    const nlsBaseUrl = this._productService.extensionsGallery?.nlsBaseUrl;
    let nlsUrlWithDetails = void 0;
    if (nlsBaseUrl && this._productService.commit && !platform.Language.isDefaultVariant()) {
      nlsUrlWithDetails = URI.joinPath(URI.parse(nlsBaseUrl), this._productService.commit, this._productService.version, platform.Language.value());
    }
    const enabledApiProposalsFallback = await resolveEnabledApiProposalsFallbackExperiment(this._workbenchAssignmentService, this._productService.quality);
    return {
      commit: this._productService.commit,
      version: this._productService.version,
      quality: this._productService.quality,
      date: this._productService.date,
      parentPid: 0,
      enabledApiProposalsFallback,
      environment: {
        isExtensionDevelopmentDebug: this._environmentService.debugRenderer,
        appName: this._productService.nameLong,
        appHost: this._productService.embedderIdentifier ?? (platform.isWeb ? "web" : "desktop"),
        appUriScheme: this._productService.urlProtocol,
        appLanguage: platform.language,
        isExtensionTelemetryLoggingOnly: isLoggingOnly(this._productService, this._environmentService),
        isPortable: false,
        extensionDevelopmentLocationURI: this._environmentService.extensionDevelopmentLocationURI,
        extensionTestsLocationURI: this._environmentService.extensionTestsLocationURI,
        globalStorageHome: this._userDataProfilesService.defaultProfile.globalStorageHome,
        workspaceStorageHome: this._environmentService.workspaceStorageHome,
        extensionLogLevel: this._defaultLogLevelsService.defaultLogLevels.extensions,
        isSessionsWindow: this._environmentService.isSessionsWindow
      },
      workspace: this._contextService.getWorkbenchState() === WorkbenchState.EMPTY ? void 0 : {
        configuration: workspace.configuration || void 0,
        id: workspace.id,
        name: this._labelService.getWorkspaceLabel(workspace),
        transient: workspace.transient
      },
      consoleForward: {
        includeStack: false,
        logNative: this._environmentService.debugRenderer
      },
      extensions: this.extensions.toSnapshot(),
      nlsBaseUrl: nlsUrlWithDetails,
      telemetryInfo: {
        sessionId: this._telemetryService.sessionId,
        machineId: this._telemetryService.machineId,
        sqmId: this._telemetryService.sqmId,
        devDeviceId: this._telemetryService.devDeviceId ?? this._telemetryService.machineId,
        firstSessionDate: this._telemetryService.firstSessionDate,
        msftInternal: this._telemetryService.msftInternal
      },
      remoteExtensionTips: this._productService.remoteExtensionTips,
      virtualWorkspaceExtensionTips: this._productService.virtualWorkspaceExtensionTips,
      logLevel: this._logService.getLevel(),
      loggers: [...this._loggerService.getRegisteredLoggers()],
      logsLocation: this._extensionHostLogsLocation,
      autoStart: this.startup === ExtensionHostStartup.EagerAutoStart || this.startup === ExtensionHostStartup.LazyAutoStart,
      remote: {
        authority: this._environmentService.remoteAuthority,
        connectionData: null,
        isRemote: false
      },
      uiKind: platform.isWeb ? UIKind.Web : UIKind.Desktop
    };
  }
};
WebWorkerExtensionHost = __decorateClass([
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IWorkspaceContextService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, ILogService),
  __decorateParam(7, ILoggerService),
  __decorateParam(8, IBrowserWorkbenchEnvironmentService),
  __decorateParam(9, IUserDataProfilesService),
  __decorateParam(10, IProductService),
  __decorateParam(11, ILayoutService),
  __decorateParam(12, IStorageService),
  __decorateParam(13, IWebWorkerService),
  __decorateParam(14, IDefaultLogLevelsService),
  __decorateParam(15, IWorkbenchAssignmentService)
], WebWorkerExtensionHost);
const extensionHostWorkerMainDescriptor = new WebWorkerDescriptor({
  label: "extensionHostWorkerMain",
  esmModuleLocation: () => FileAccess.asBrowserUri("vs/workbench/api/worker/extensionHostWorkerMain.js"),
  esmModuleLocationBundler: () => new URL("../../../api/worker/extensionHostWorkerMain.ts?esm", import.meta.url)
});
export {
  WebWorkerExtensionHost
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25zXFxicm93c2VyXFx3ZWJXb3JrZXJFeHRlbnNpb25Ib3N0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcGFyZW50T3JpZ2luSGFzaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9pZnJhbWUuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgQmFycmllciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IGNhbmNlbGVkLCBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBBcHBSZXNvdXJjZVBhdGgsIENPSSwgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IGdldE5MU0xhbmd1YWdlLCBnZXROTFNNZXNzYWdlcyB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgSUxvZ2dlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9hc3NpZ25tZW50L2NvbW1vbi9hc3NpZ25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBpc0xvZ2dpbmdPbmx5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBXZWJXb3JrZXJEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2ViV29ya2VyL2Jyb3dzZXIvd2ViV29ya2VyRGVzY3JpcHRvci5qcyc7XG5pbXBvcnQgeyBJV2ViV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dlYldvcmtlci9icm93c2VyL3dlYldvcmtlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRMb2dMZXZlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9kZWZhdWx0TG9nTGV2ZWxzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvc3RFeGl0Q29kZSwgSUV4dGVuc2lvbkhvc3RJbml0RGF0YSwgTWVzc2FnZVR5cGUsIFVJS2luZCwgY3JlYXRlTWVzc2FnZU9mVHlwZSwgaXNNZXNzYWdlT2ZUeXBlIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbkhvc3RQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBMb2NhbFdlYldvcmtlclJ1bm5pbmdMb2NhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25SdW5uaW5nTG9jYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSG9zdEV4dGVuc2lvbnMsIEV4dGVuc2lvbkhvc3RTdGFydHVwLCBJRXh0ZW5zaW9uSG9zdCwgcmVzb2x2ZUVuYWJsZWRBcGlQcm9wb3NhbHNGYWxsYmFja0V4cGVyaW1lbnQgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdlYldvcmtlckV4dGVuc2lvbkhvc3RJbml0RGF0YSB7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbnM6IEV4dGVuc2lvbkhvc3RFeHRlbnNpb25zO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXZWJXb3JrZXJFeHRlbnNpb25Ib3N0RGF0YVByb3ZpZGVyIHtcblx0Z2V0SW5pdERhdGEoKTogUHJvbWlzZTxJV2ViV29ya2VyRXh0ZW5zaW9uSG9zdEluaXREYXRhPjtcbn1cblxuZXhwb3J0IGNsYXNzIFdlYldvcmtlckV4dGVuc2lvbkhvc3QgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbkhvc3Qge1xuXG5cdHB1YmxpYyByZWFkb25seSBwaWQgPSBudWxsO1xuXHRwdWJsaWMgcmVhZG9ubHkgcmVtb3RlQXV0aG9yaXR5ID0gbnVsbDtcblx0cHVibGljIGV4dGVuc2lvbnM6IEV4dGVuc2lvbkhvc3RFeHRlbnNpb25zIHwgbnVsbCA9IG51bGw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFeGl0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8W251bWJlciwgc3RyaW5nIHwgbnVsbF0+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25FeGl0OiBFdmVudDxbbnVtYmVyLCBzdHJpbmcgfCBudWxsXT4gPSB0aGlzLl9vbkRpZEV4aXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfaXNUZXJtaW5hdGluZzogYm9vbGVhbjtcblx0cHJpdmF0ZSBfcHJvdG9jb2xQcm9taXNlOiBQcm9taXNlPElNZXNzYWdlUGFzc2luZ1Byb3RvY29sPiB8IG51bGw7XG5cdHByaXZhdGUgX3Byb3RvY29sOiBJTWVzc2FnZVBhc3NpbmdQcm90b2NvbCB8IG51bGw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uSG9zdExvZ3NMb2NhdGlvbjogVVJJO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBydW5uaW5nTG9jYXRpb246IExvY2FsV2ViV29ya2VyUnVubmluZ0xvY2F0aW9uLFxuXHRcdHB1YmxpYyByZWFkb25seSBzdGFydHVwOiBFeHRlbnNpb25Ib3N0U3RhcnR1cCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pbml0RGF0YVByb3ZpZGVyOiBJV2ViV29ya2VyRXh0ZW5zaW9uSG9zdERhdGFQcm92aWRlcixcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElMb2dnZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ2dlclNlcnZpY2U6IElMb2dnZXJTZXJ2aWNlLFxuXHRcdEBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xheW91dFNlcnZpY2U6IElMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVdlYldvcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd2ViV29ya2VyU2VydmljZTogSVdlYldvcmtlclNlcnZpY2UsXG5cdFx0QElEZWZhdWx0TG9nTGV2ZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0TG9nTGV2ZWxzU2VydmljZTogSURlZmF1bHRMb2dMZXZlbHNTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2U6IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9pc1Rlcm1pbmF0aW5nID0gZmFsc2U7XG5cdFx0dGhpcy5fcHJvdG9jb2xQcm9taXNlID0gbnVsbDtcblx0XHR0aGlzLl9wcm90b2NvbCA9IG51bGw7XG5cdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdExvZ3NMb2NhdGlvbiA9IGpvaW5QYXRoKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5leHRIb3N0TG9nc1BhdGgsICd3ZWJXb3JrZXInKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFdlYldvcmtlckV4dGVuc2lvbkhvc3RJZnJhbWVTcmMoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBzdWZmaXhTZWFyY2hQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG5cdFx0aWYgKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5kZWJ1Z0V4dGVuc2lvbkhvc3QgJiYgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmRlYnVnUmVuZGVyZXIpIHtcblx0XHRcdHN1ZmZpeFNlYXJjaFBhcmFtcy5zZXQoJ2RlYnVnZ2VkJywgJzEnKTtcblx0XHR9XG5cdFx0Q09JLmFkZFNlYXJjaFBhcmFtKHN1ZmZpeFNlYXJjaFBhcmFtcywgdHJ1ZSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBzdWZmaXggPSBgPyR7c3VmZml4U2VhcmNoUGFyYW1zLnRvU3RyaW5nKCl9YDtcblxuXHRcdGNvbnN0IGlmcmFtZU1vZHVsZVBhdGg6IEFwcFJlc291cmNlUGF0aCA9IGB2cy93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9ucy93b3JrZXIvd2ViV29ya2VyRXh0ZW5zaW9uSG9zdElmcmFtZS5odG1sYDtcblx0XHRpZiAocGxhdGZvcm0uaXNXZWIpIHtcblx0XHRcdGNvbnN0IHdlYkVuZHBvaW50VXJsVGVtcGxhdGUgPSB0aGlzLl9wcm9kdWN0U2VydmljZS53ZWJFbmRwb2ludFVybFRlbXBsYXRlO1xuXHRcdFx0Y29uc3QgY29tbWl0ID0gdGhpcy5fcHJvZHVjdFNlcnZpY2UuY29tbWl0O1xuXHRcdFx0Y29uc3QgcXVhbGl0eSA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnF1YWxpdHk7XG5cdFx0XHRpZiAod2ViRW5kcG9pbnRVcmxUZW1wbGF0ZSAmJiBjb21taXQgJiYgcXVhbGl0eSkge1xuXHRcdFx0XHQvLyBUcnkgdG8ga2VlcCB0aGUgd2ViIHdvcmtlciBleHRlbnNpb24gaG9zdCBpZnJhbWUgb3JpZ2luIHN0YWJsZSBieSBzdG9yaW5nIGl0IGluIHdvcmtzcGFjZSBzdG9yYWdlXG5cdFx0XHRcdGNvbnN0IGtleSA9ICd3ZWJXb3JrZXJFeHRlbnNpb25Ib3N0SWZyYW1lU3RhYmxlT3JpZ2luVVVJRCc7XG5cdFx0XHRcdGxldCBzdGFibGVPcmlnaW5VVUlEID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KGtleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHRcdGlmICh0eXBlb2Ygc3RhYmxlT3JpZ2luVVVJRCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHRzdGFibGVPcmlnaW5VVUlEID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoa2V5LCBzdGFibGVPcmlnaW5VVUlELCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGhhc2ggPSBhd2FpdCBwYXJlbnRPcmlnaW5IYXNoKG1haW5XaW5kb3cub3JpZ2luLCBzdGFibGVPcmlnaW5VVUlEKTtcblx0XHRcdFx0Y29uc3QgYmFzZVVybCA9IChcblx0XHRcdFx0XHR3ZWJFbmRwb2ludFVybFRlbXBsYXRlXG5cdFx0XHRcdFx0XHQucmVwbGFjZSgne3t1dWlkfX0nLCBgdi0tJHtoYXNofWApIC8vIHVzaW5nIGB2LS1gIGFzIGEgbWFya2VyIHRvIHJlcXVpcmUgYHBhcmVudE9yaWdpbmAvYHNhbHRgIHZlcmlmaWNhdGlvblxuXHRcdFx0XHRcdFx0LnJlcGxhY2UoJ3t7Y29tbWl0fX0nLCBjb21taXQpXG5cdFx0XHRcdFx0XHQucmVwbGFjZSgne3txdWFsaXR5fX0nLCBxdWFsaXR5KVxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdGNvbnN0IHJlcyA9IG5ldyBVUkwoYCR7YmFzZVVybH0vb3V0LyR7aWZyYW1lTW9kdWxlUGF0aH0ke3N1ZmZpeH1gKTtcblx0XHRcdFx0cmVzLnNlYXJjaFBhcmFtcy5zZXQoJ3BhcmVudE9yaWdpbicsIG1haW5XaW5kb3cub3JpZ2luKTtcblx0XHRcdFx0cmVzLnNlYXJjaFBhcmFtcy5zZXQoJ3NhbHQnLCBzdGFibGVPcmlnaW5VVUlEKTtcblx0XHRcdFx0cmV0dXJuIHJlcy50b1N0cmluZygpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zb2xlLndhcm4oYFRoZSB3ZWIgd29ya2VyIGV4dGVuc2lvbiBob3N0IGlzIHN0YXJ0ZWQgaW4gYSBzYW1lLW9yaWdpbiBpZnJhbWUhYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVsYXRpdmVFeHRlbnNpb25Ib3N0SWZyYW1lU3JjID0gdGhpcy5fd2ViV29ya2VyU2VydmljZS5nZXRXb3JrZXJVcmwobmV3IFdlYldvcmtlckRlc2NyaXB0b3Ioe1xuXHRcdFx0ZXNtTW9kdWxlTG9jYXRpb246IEZpbGVBY2Nlc3MuYXNCcm93c2VyVXJpKGlmcmFtZU1vZHVsZVBhdGgpLFxuXHRcdFx0ZXNtTW9kdWxlTG9jYXRpb25CdW5kbGVyOiBuZXcgVVJMKGAuLi93b3JrZXIvd2ViV29ya2VyRXh0ZW5zaW9uSG9zdElmcmFtZS5odG1sYCwgaW1wb3J0Lm1ldGEudXJsKSxcblx0XHRcdGxhYmVsOiAnd2ViV29ya2VyRXh0ZW5zaW9uSG9zdElmcmFtZSdcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gYCR7cmVsYXRpdmVFeHRlbnNpb25Ib3N0SWZyYW1lU3JjfSR7c3VmZml4fWA7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc3RhcnQoKTogUHJvbWlzZTxJTWVzc2FnZVBhc3NpbmdQcm90b2NvbD4ge1xuXHRcdGlmICghdGhpcy5fcHJvdG9jb2xQcm9taXNlKSB7XG5cdFx0XHR0aGlzLl9wcm90b2NvbFByb21pc2UgPSB0aGlzLl9zdGFydEluc2lkZUlmcmFtZSgpO1xuXHRcdFx0dGhpcy5fcHJvdG9jb2xQcm9taXNlLnRoZW4ocHJvdG9jb2wgPT4gdGhpcy5fcHJvdG9jb2wgPSBwcm90b2NvbCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcm90b2NvbFByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zdGFydEluc2lkZUlmcmFtZSgpOiBQcm9taXNlPElNZXNzYWdlUGFzc2luZ1Byb3RvY29sPiB7XG5cdFx0Y29uc3Qgd2ViV29ya2VyRXh0ZW5zaW9uSG9zdElmcmFtZVNyYyA9IGF3YWl0IHRoaXMuX2dldFdlYldvcmtlckV4dGVuc2lvbkhvc3RJZnJhbWVTcmMoKTtcblx0XHRjb25zdCBlbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VlNCdWZmZXI+KCkpO1xuXG5cdFx0Y29uc3QgaWZyYW1lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaWZyYW1lJyk7XG5cdFx0aWZyYW1lLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCAnd2ViLXdvcmtlci1leHQtaG9zdC1pZnJhbWUnKTtcblx0XHRpZnJhbWUuc2V0QXR0cmlidXRlKCdzYW5kYm94JywgJ2FsbG93LXNjcmlwdHMgYWxsb3ctc2FtZS1vcmlnaW4nKTtcblx0XHRpZnJhbWUuc2V0QXR0cmlidXRlKCdhbGxvdycsICd1c2I7IHNlcmlhbDsgaGlkOyBjcm9zcy1vcmlnaW4taXNvbGF0ZWQ7IGxvY2FsLW5ldHdvcmstYWNjZXNzOycpO1xuXHRcdGlmcmFtZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRpZnJhbWUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdGNvbnN0IHZzY29kZVdlYldvcmtlckV4dEhvc3RJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGlmcmFtZS5zZXRBdHRyaWJ1dGUoJ3NyYycsIGAke3dlYldvcmtlckV4dGVuc2lvbkhvc3RJZnJhbWVTcmN9JnZzY29kZVdlYldvcmtlckV4dEhvc3RJZD0ke3ZzY29kZVdlYldvcmtlckV4dEhvc3RJZH1gKTtcblxuXHRcdGNvbnN0IGJhcnJpZXIgPSBuZXcgQmFycmllcigpO1xuXHRcdGxldCBwb3J0ITogTWVzc2FnZVBvcnQ7XG5cdFx0bGV0IGJhcnJpZXJFcnJvcjogRXJyb3IgfCBudWxsID0gbnVsbDtcblx0XHRsZXQgYmFycmllckhhc0Vycm9yID0gZmFsc2U7XG5cdFx0bGV0IHN0YXJ0VGltZW91dDogVGltZW91dCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHJlamVjdEJhcnJpZXIgPSAoZXhpdENvZGU6IG51bWJlciwgZXJyb3I6IEVycm9yKSA9PiB7XG5cdFx0XHRiYXJyaWVyRXJyb3IgPSBlcnJvcjtcblx0XHRcdGJhcnJpZXJIYXNFcnJvciA9IHRydWU7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihiYXJyaWVyRXJyb3IpO1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHN0YXJ0VGltZW91dCk7XG5cdFx0XHR0aGlzLl9vbkRpZEV4aXQuZmlyZShbRXh0ZW5zaW9uSG9zdEV4aXRDb2RlLlVuZXhwZWN0ZWRFcnJvciwgYmFycmllckVycm9yLm1lc3NhZ2VdKTtcblx0XHRcdGJhcnJpZXIub3BlbigpO1xuXHRcdH07XG5cblx0XHRjb25zdCByZXNvbHZlQmFycmllciA9IChtZXNzYWdlUG9ydDogTWVzc2FnZVBvcnQpID0+IHtcblx0XHRcdHBvcnQgPSBtZXNzYWdlUG9ydDtcblx0XHRcdGNsZWFyVGltZW91dChzdGFydFRpbWVvdXQpO1xuXHRcdFx0YmFycmllci5vcGVuKCk7XG5cdFx0fTtcblxuXHRcdHN0YXJ0VGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0Y29uc29sZS53YXJuKGBUaGUgV2ViIFdvcmtlciBFeHRlbnNpb24gSG9zdCBkaWQgbm90IHN0YXJ0IGluIDYwcywgdGhhdCBtaWdodCBiZSBhIHByb2JsZW0uYCk7XG5cdFx0fSwgNjAwMDApO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihtYWluV2luZG93LCAnbWVzc2FnZScsIChldmVudCkgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LnNvdXJjZSAhPT0gaWZyYW1lLmNvbnRlbnRXaW5kb3cpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV2ZW50LmRhdGEudnNjb2RlV2ViV29ya2VyRXh0SG9zdElkICE9PSB2c2NvZGVXZWJXb3JrZXJFeHRIb3N0SWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV2ZW50LmRhdGEuZXJyb3IpIHtcblx0XHRcdFx0Y29uc3QgeyBuYW1lLCBtZXNzYWdlLCBzdGFjayB9ID0gZXZlbnQuZGF0YS5lcnJvcjtcblx0XHRcdFx0Y29uc3QgZXJyID0gbmV3IEVycm9yKCk7XG5cdFx0XHRcdGVyci5tZXNzYWdlID0gbWVzc2FnZTtcblx0XHRcdFx0ZXJyLm5hbWUgPSBuYW1lO1xuXHRcdFx0XHRlcnIuc3RhY2sgPSBzdGFjaztcblx0XHRcdFx0cmV0dXJuIHJlamVjdEJhcnJpZXIoRXh0ZW5zaW9uSG9zdEV4aXRDb2RlLlVuZXhwZWN0ZWRFcnJvciwgZXJyKTtcblx0XHRcdH1cblx0XHRcdGlmIChldmVudC5kYXRhLnR5cGUgPT09ICd2c2NvZGUuYm9vdHN0cmFwLm5scycpIHtcblx0XHRcdFx0aWZyYW1lLmNvbnRlbnRXaW5kb3chLnBvc3RNZXNzYWdlKHtcblx0XHRcdFx0XHR0eXBlOiBldmVudC5kYXRhLnR5cGUsXG5cdFx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdFx0d29ya2VyVXJsOiB0aGlzLl93ZWJXb3JrZXJTZXJ2aWNlLmdldFdvcmtlclVybChleHRlbnNpb25Ib3N0V29ya2VyTWFpbkRlc2NyaXB0b3IpLFxuXHRcdFx0XHRcdFx0ZmlsZVJvb3Q6IGdsb2JhbFRoaXMuX1ZTQ09ERV9GSUxFX1JPT1QsXG5cdFx0XHRcdFx0XHRubHM6IHtcblx0XHRcdFx0XHRcdFx0bWVzc2FnZXM6IGdldE5MU01lc3NhZ2VzKCksXG5cdFx0XHRcdFx0XHRcdGxhbmd1YWdlOiBnZXROTFNMYW5ndWFnZSgpXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCAnKicpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB7IGRhdGEgfSA9IGV2ZW50LmRhdGE7XG5cdFx0XHRpZiAoYmFycmllci5pc09wZW4oKSB8fCAhKGRhdGEgaW5zdGFuY2VvZiBNZXNzYWdlUG9ydCkpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKCdVTkVYUEVDVEVEIG1lc3NhZ2UnLCBldmVudCk7XG5cdFx0XHRcdGNvbnN0IGVyciA9IG5ldyBFcnJvcignVU5FWFBFQ1RFRCBtZXNzYWdlJyk7XG5cdFx0XHRcdHJldHVybiByZWplY3RCYXJyaWVyKEV4dGVuc2lvbkhvc3RFeGl0Q29kZS5VbmV4cGVjdGVkRXJyb3IsIGVycik7XG5cdFx0XHR9XG5cdFx0XHRyZXNvbHZlQmFycmllcihkYXRhKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXIuYXBwZW5kQ2hpbGQoaWZyYW1lKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gaWZyYW1lLnJlbW92ZSgpKSk7XG5cblx0XHQvLyBhd2FpdCBNZXNzYWdlUG9ydCBhbmQgdXNlIGl0IHRvIGRpcmVjdGx5IGNvbW11bmljYXRlXG5cdFx0Ly8gd2l0aCB0aGUgd29ya2VyIGV4dGVuc2lvbiBob3N0XG5cdFx0YXdhaXQgYmFycmllci53YWl0KCk7XG5cblx0XHRpZiAoYmFycmllckhhc0Vycm9yKSB7XG5cdFx0XHR0aHJvdyBiYXJyaWVyRXJyb3I7XG5cdFx0fVxuXG5cdFx0Ly8gU2VuZCBvdmVyIG1lc3NhZ2UgcG9ydHMgZm9yIGV4dGVuc2lvbiBBUElcblx0XHRjb25zdCBtZXNzYWdlUG9ydHMgPSB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucz8ubWVzc2FnZVBvcnRzID8/IG5ldyBNYXAoKTtcblx0XHRpZnJhbWUuY29udGVudFdpbmRvdyEucG9zdE1lc3NhZ2UoeyB0eXBlOiAndnNjb2RlLmluaXQnLCBkYXRhOiBtZXNzYWdlUG9ydHMgfSwgJyonLCBbLi4ubWVzc2FnZVBvcnRzLnZhbHVlcygpXSk7XG5cblx0XHRwb3J0Lm9ubWVzc2FnZSA9IChldmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBkYXRhIH0gPSBldmVudDtcblx0XHRcdGlmICghKGRhdGEgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKCdVTktOT1dOIGRhdGEgcmVjZWl2ZWQnLCBkYXRhKTtcblx0XHRcdFx0dGhpcy5fb25EaWRFeGl0LmZpcmUoWzc3LCAnVU5LTk9XTiBkYXRhIHJlY2VpdmVkJ10pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRlbWl0dGVyLmZpcmUoVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShkYXRhLCAwLCBkYXRhLmJ5dGVMZW5ndGgpKSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByb3RvY29sOiBJTWVzc2FnZVBhc3NpbmdQcm90b2NvbCA9IHtcblx0XHRcdG9uTWVzc2FnZTogZW1pdHRlci5ldmVudCxcblx0XHRcdHNlbmQ6IHZzYnVmID0+IHtcblx0XHRcdFx0Y29uc3QgZGF0YSA9IHZzYnVmLmJ1ZmZlci5idWZmZXIuc2xpY2UodnNidWYuYnVmZmVyLmJ5dGVPZmZzZXQsIHZzYnVmLmJ1ZmZlci5ieXRlT2Zmc2V0ICsgdnNidWYuYnVmZmVyLmJ5dGVMZW5ndGgpO1xuXHRcdFx0XHRwb3J0LnBvc3RNZXNzYWdlKGRhdGEsIFtkYXRhXSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHJldHVybiB0aGlzLl9wZXJmb3JtSGFuZHNoYWtlKHByb3RvY29sKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3BlcmZvcm1IYW5kc2hha2UocHJvdG9jb2w6IElNZXNzYWdlUGFzc2luZ1Byb3RvY29sKTogUHJvbWlzZTxJTWVzc2FnZVBhc3NpbmdQcm90b2NvbD4ge1xuXHRcdC8vIGV4dGVuc2lvbiBob3N0IGhhbmRzaGFrZSBoYXBwZW5zIGJlbG93XG5cdFx0Ly8gKDEpIDw9PSB3YWl0IGZvcjogUmVhZHlcblx0XHQvLyAoMikgPT0+IHNlbmQ6IGluaXQgZGF0YVxuXHRcdC8vICgzKSA8PT0gd2FpdCBmb3I6IEluaXRpYWxpemVkXG5cblx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UoRXZlbnQuZmlsdGVyKHByb3RvY29sLm9uTWVzc2FnZSwgbXNnID0+IGlzTWVzc2FnZU9mVHlwZShtc2csIE1lc3NhZ2VUeXBlLlJlYWR5KSkpO1xuXHRcdGlmICh0aGlzLl9pc1Rlcm1pbmF0aW5nKSB7XG5cdFx0XHR0aHJvdyBjYW5jZWxlZCgpO1xuXHRcdH1cblx0XHRwcm90b2NvbC5zZW5kKFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoYXdhaXQgdGhpcy5fY3JlYXRlRXh0SG9zdEluaXREYXRhKCkpKSk7XG5cdFx0aWYgKHRoaXMuX2lzVGVybWluYXRpbmcpIHtcblx0XHRcdHRocm93IGNhbmNlbGVkKCk7XG5cdFx0fVxuXHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZShFdmVudC5maWx0ZXIocHJvdG9jb2wub25NZXNzYWdlLCBtc2cgPT4gaXNNZXNzYWdlT2ZUeXBlKG1zZywgTWVzc2FnZVR5cGUuSW5pdGlhbGl6ZWQpKSk7XG5cdFx0aWYgKHRoaXMuX2lzVGVybWluYXRpbmcpIHtcblx0XHRcdHRocm93IGNhbmNlbGVkKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb3RvY29sO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzVGVybWluYXRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faXNUZXJtaW5hdGluZyA9IHRydWU7XG5cdFx0dGhpcy5fcHJvdG9jb2w/LnNlbmQoY3JlYXRlTWVzc2FnZU9mVHlwZShNZXNzYWdlVHlwZS5UZXJtaW5hdGUpKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRnZXRJbnNwZWN0UG9ydCgpOiB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRlbmFibGVJbnNwZWN0UG9ydCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZUV4dEhvc3RJbml0RGF0YSgpOiBQcm9taXNlPElFeHRlbnNpb25Ib3N0SW5pdERhdGE+IHtcblx0XHRjb25zdCBpbml0RGF0YSA9IGF3YWl0IHRoaXMuX2luaXREYXRhUHJvdmlkZXIuZ2V0SW5pdERhdGEoKTtcblx0XHR0aGlzLmV4dGVuc2lvbnMgPSBpbml0RGF0YS5leHRlbnNpb25zO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdGNvbnN0IG5sc0Jhc2VVcmwgPSB0aGlzLl9wcm9kdWN0U2VydmljZS5leHRlbnNpb25zR2FsbGVyeT8ubmxzQmFzZVVybDtcblx0XHRsZXQgbmxzVXJsV2l0aERldGFpbHM6IFVSSSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHQvLyBPbmx5IHVzZSB0aGUgbmxzQmFzZVVybCBpZiB3ZSBhcmUgdXNpbmcgYSBsYW5ndWFnZSBvdGhlciB0aGFuIHRoZSBkZWZhdWx0LCBFbmdsaXNoLlxuXHRcdGlmIChubHNCYXNlVXJsICYmIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmNvbW1pdCAmJiAhcGxhdGZvcm0uTGFuZ3VhZ2UuaXNEZWZhdWx0VmFyaWFudCgpKSB7XG5cdFx0XHRubHNVcmxXaXRoRGV0YWlscyA9IFVSSS5qb2luUGF0aChVUkkucGFyc2UobmxzQmFzZVVybCksIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmNvbW1pdCwgdGhpcy5fcHJvZHVjdFNlcnZpY2UudmVyc2lvbiwgcGxhdGZvcm0uTGFuZ3VhZ2UudmFsdWUoKSk7XG5cdFx0fVxuXHRcdGNvbnN0IGVuYWJsZWRBcGlQcm9wb3NhbHNGYWxsYmFjayA9IGF3YWl0IHJlc29sdmVFbmFibGVkQXBpUHJvcG9zYWxzRmFsbGJhY2tFeHBlcmltZW50KHRoaXMuX3dvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlLCB0aGlzLl9wcm9kdWN0U2VydmljZS5xdWFsaXR5KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29tbWl0OiB0aGlzLl9wcm9kdWN0U2VydmljZS5jb21taXQsXG5cdFx0XHR2ZXJzaW9uOiB0aGlzLl9wcm9kdWN0U2VydmljZS52ZXJzaW9uLFxuXHRcdFx0cXVhbGl0eTogdGhpcy5fcHJvZHVjdFNlcnZpY2UucXVhbGl0eSxcblx0XHRcdGRhdGU6IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmRhdGUsXG5cdFx0XHRwYXJlbnRQaWQ6IDAsXG5cdFx0XHRlbmFibGVkQXBpUHJvcG9zYWxzRmFsbGJhY2ssXG5cdFx0XHRlbnZpcm9ubWVudDoge1xuXHRcdFx0XHRpc0V4dGVuc2lvbkRldmVsb3BtZW50RGVidWc6IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5kZWJ1Z1JlbmRlcmVyLFxuXHRcdFx0XHRhcHBOYW1lOiB0aGlzLl9wcm9kdWN0U2VydmljZS5uYW1lTG9uZyxcblx0XHRcdFx0YXBwSG9zdDogdGhpcy5fcHJvZHVjdFNlcnZpY2UuZW1iZWRkZXJJZGVudGlmaWVyID8/IChwbGF0Zm9ybS5pc1dlYiA/ICd3ZWInIDogJ2Rlc2t0b3AnKSxcblx0XHRcdFx0YXBwVXJpU2NoZW1lOiB0aGlzLl9wcm9kdWN0U2VydmljZS51cmxQcm90b2NvbCxcblx0XHRcdFx0YXBwTGFuZ3VhZ2U6IHBsYXRmb3JtLmxhbmd1YWdlLFxuXHRcdFx0XHRpc0V4dGVuc2lvblRlbGVtZXRyeUxvZ2dpbmdPbmx5OiBpc0xvZ2dpbmdPbmx5KHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLCB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UpLFxuXHRcdFx0XHRpc1BvcnRhYmxlOiBmYWxzZSxcblx0XHRcdFx0ZXh0ZW5zaW9uRGV2ZWxvcG1lbnRMb2NhdGlvblVSSTogdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmV4dGVuc2lvbkRldmVsb3BtZW50TG9jYXRpb25VUkksXG5cdFx0XHRcdGV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkk6IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5leHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJLFxuXHRcdFx0XHRnbG9iYWxTdG9yYWdlSG9tZTogdGhpcy5fdXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZ2xvYmFsU3RvcmFnZUhvbWUsXG5cdFx0XHRcdHdvcmtzcGFjZVN0b3JhZ2VIb21lOiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2Uud29ya3NwYWNlU3RvcmFnZUhvbWUsXG5cdFx0XHRcdGV4dGVuc2lvbkxvZ0xldmVsOiB0aGlzLl9kZWZhdWx0TG9nTGV2ZWxzU2VydmljZS5kZWZhdWx0TG9nTGV2ZWxzLmV4dGVuc2lvbnMsXG5cdFx0XHRcdGlzU2Vzc2lvbnNXaW5kb3c6IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93XG5cdFx0XHR9LFxuXHRcdFx0d29ya3NwYWNlOiB0aGlzLl9jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSA/IHVuZGVmaW5lZCA6IHtcblx0XHRcdFx0Y29uZmlndXJhdGlvbjogd29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRpZDogd29ya3NwYWNlLmlkLFxuXHRcdFx0XHRuYW1lOiB0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0V29ya3NwYWNlTGFiZWwod29ya3NwYWNlKSxcblx0XHRcdFx0dHJhbnNpZW50OiB3b3Jrc3BhY2UudHJhbnNpZW50XG5cdFx0XHR9LFxuXHRcdFx0Y29uc29sZUZvcndhcmQ6IHtcblx0XHRcdFx0aW5jbHVkZVN0YWNrOiBmYWxzZSxcblx0XHRcdFx0bG9nTmF0aXZlOiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuZGVidWdSZW5kZXJlclxuXHRcdFx0fSxcblx0XHRcdGV4dGVuc2lvbnM6IHRoaXMuZXh0ZW5zaW9ucy50b1NuYXBzaG90KCksXG5cdFx0XHRubHNCYXNlVXJsOiBubHNVcmxXaXRoRGV0YWlscyxcblx0XHRcdHRlbGVtZXRyeUluZm86IHtcblx0XHRcdFx0c2Vzc2lvbklkOiB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnNlc3Npb25JZCxcblx0XHRcdFx0bWFjaGluZUlkOiB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLm1hY2hpbmVJZCxcblx0XHRcdFx0c3FtSWQ6IHRoaXMuX3RlbGVtZXRyeVNlcnZpY2Uuc3FtSWQsXG5cdFx0XHRcdGRldkRldmljZUlkOiB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLmRldkRldmljZUlkID8/IHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UubWFjaGluZUlkLFxuXHRcdFx0XHRmaXJzdFNlc3Npb25EYXRlOiB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLmZpcnN0U2Vzc2lvbkRhdGUsXG5cdFx0XHRcdG1zZnRJbnRlcm5hbDogdGhpcy5fdGVsZW1ldHJ5U2VydmljZS5tc2Z0SW50ZXJuYWxcblx0XHRcdH0sXG5cdFx0XHRyZW1vdGVFeHRlbnNpb25UaXBzOiB0aGlzLl9wcm9kdWN0U2VydmljZS5yZW1vdGVFeHRlbnNpb25UaXBzLFxuXHRcdFx0dmlydHVhbFdvcmtzcGFjZUV4dGVuc2lvblRpcHM6IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnZpcnR1YWxXb3Jrc3BhY2VFeHRlbnNpb25UaXBzLFxuXHRcdFx0bG9nTGV2ZWw6IHRoaXMuX2xvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSxcblx0XHRcdGxvZ2dlcnM6IFsuLi50aGlzLl9sb2dnZXJTZXJ2aWNlLmdldFJlZ2lzdGVyZWRMb2dnZXJzKCldLFxuXHRcdFx0bG9nc0xvY2F0aW9uOiB0aGlzLl9leHRlbnNpb25Ib3N0TG9nc0xvY2F0aW9uLFxuXHRcdFx0YXV0b1N0YXJ0OiAodGhpcy5zdGFydHVwID09PSBFeHRlbnNpb25Ib3N0U3RhcnR1cC5FYWdlckF1dG9TdGFydCB8fCB0aGlzLnN0YXJ0dXAgPT09IEV4dGVuc2lvbkhvc3RTdGFydHVwLkxhenlBdXRvU3RhcnQpLFxuXHRcdFx0cmVtb3RlOiB7XG5cdFx0XHRcdGF1dGhvcml0eTogdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdFx0Y29ubmVjdGlvbkRhdGE6IG51bGwsXG5cdFx0XHRcdGlzUmVtb3RlOiBmYWxzZVxuXHRcdFx0fSxcblx0XHRcdHVpS2luZDogcGxhdGZvcm0uaXNXZWIgPyBVSUtpbmQuV2ViIDogVUlLaW5kLkRlc2t0b3Bcblx0XHR9O1xuXHR9XG59XG5cbmNvbnN0IGV4dGVuc2lvbkhvc3RXb3JrZXJNYWluRGVzY3JpcHRvciA9IG5ldyBXZWJXb3JrZXJEZXNjcmlwdG9yKHtcblx0bGFiZWw6ICdleHRlbnNpb25Ib3N0V29ya2VyTWFpbicsXG5cdGVzbU1vZHVsZUxvY2F0aW9uOiAoKSA9PiBGaWxlQWNjZXNzLmFzQnJvd3NlclVyaSgndnMvd29ya2JlbmNoL2FwaS93b3JrZXIvZXh0ZW5zaW9uSG9zdFdvcmtlck1haW4uanMnKSxcblx0ZXNtTW9kdWxlTG9jYXRpb25CdW5kbGVyOiAoKSA9PiBuZXcgVVJMKCcuLi8uLi8uLi9hcGkvd29ya2VyL2V4dGVuc2lvbkhvc3RXb3JrZXJNYWluLnRzP2VzbScsIGltcG9ydC5tZXRhLnVybCksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFVBQVUseUJBQXlCO0FBQzVDLFNB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
