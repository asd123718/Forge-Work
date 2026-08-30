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
import { timeout } from "../../../../base/common/async.js";
import { encodeBase64, VSBuffer } from "../../../../base/common/buffer.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import * as objects from "../../../../base/common/objects.js";
import * as platform from "../../../../base/common/platform.js";
import { removeDangerousEnvVariables } from "../../../../base/common/processes.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { BufferedEmitter } from "../../../../base/parts/ipc/common/ipc.net.js";
import { acquirePort } from "../../../../base/parts/ipc/electron-browser/ipc.mp.js";
import * as nls from "../../../../nls.js";
import { IExtensionHostDebugService } from "../../../../platform/debug/common/extensionHostDebug.js";
import { extensionHostGraceTimeMs, IExtensionHostStarter } from "../../../../platform/extensions/common/extensionHostStarter.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILogService, ILoggerService } from "../../../../platform/log/common/log.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IWorkbenchAssignmentService } from "../../assignment/common/assignmentService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { isLoggingOnly } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IWorkspaceContextService, WorkbenchState, isUntitledWorkspace } from "../../../../platform/workspace/common/workspace.js";
import { INativeWorkbenchEnvironmentService } from "../../environment/electron-browser/environmentService.js";
import { IShellEnvironmentService } from "../../environment/electron-browser/shellEnvironmentService.js";
import { MessagePortExtHostConnection, writeExtHostConnection } from "../common/extensionHostEnv.js";
import { createMessageOfType, MessageType, NativeLogMarkers, UIKind, isMessageOfType } from "../common/extensionHostProtocol.js";
import { ExtensionHostStartup, resolveEnabledApiProposalsFallbackExperiment } from "../common/extensions.js";
import { IHostService } from "../../host/browser/host.js";
import { ILifecycleService } from "../../lifecycle/common/lifecycle.js";
import { parseExtensionDevOptions } from "../common/extensionDevOptions.js";
import { IDefaultLogLevelsService } from "../../log/common/defaultLogLevels.js";
class ExtensionHostProcess {
  constructor(id, _extensionHostStarter) {
    this._extensionHostStarter = _extensionHostStarter;
    this._id = id;
  }
  get onStdout() {
    return this._extensionHostStarter.onDynamicStdout(this._id);
  }
  get onStderr() {
    return this._extensionHostStarter.onDynamicStderr(this._id);
  }
  get onMessage() {
    return this._extensionHostStarter.onDynamicMessage(this._id);
  }
  get onExit() {
    return this._extensionHostStarter.onDynamicExit(this._id);
  }
  start(opts) {
    return this._extensionHostStarter.start(this._id, opts);
  }
  enableInspectPort() {
    return this._extensionHostStarter.enableInspectPort(this._id);
  }
  waitForExit(maxWaitTimeMs) {
    return this._extensionHostStarter.waitForExit(this._id, maxWaitTimeMs);
  }
  kill() {
    return this._extensionHostStarter.kill(this._id);
  }
}
let NativeLocalProcessExtensionHost = class extends Disposable {
  constructor(runningLocation, startup, _initDataProvider, _contextService, _notificationService, _nativeHostService, _lifecycleService, _environmentService, _userDataProfilesService, _telemetryService, _logService, _loggerService, _labelService, _extensionHostDebugService, _hostService, _productService, _shellEnvironmentService, _extensionHostStarter, _defaultLogLevelsService, _workbenchAssignmentService) {
    super();
    this.runningLocation = runningLocation;
    this.startup = startup;
    this._initDataProvider = _initDataProvider;
    this._contextService = _contextService;
    this._notificationService = _notificationService;
    this._nativeHostService = _nativeHostService;
    this._lifecycleService = _lifecycleService;
    this._environmentService = _environmentService;
    this._userDataProfilesService = _userDataProfilesService;
    this._telemetryService = _telemetryService;
    this._logService = _logService;
    this._loggerService = _loggerService;
    this._labelService = _labelService;
    this._extensionHostDebugService = _extensionHostDebugService;
    this._hostService = _hostService;
    this._productService = _productService;
    this._shellEnvironmentService = _shellEnvironmentService;
    this._extensionHostStarter = _extensionHostStarter;
    this._defaultLogLevelsService = _defaultLogLevelsService;
    this._workbenchAssignmentService = _workbenchAssignmentService;
    this.pid = null;
    this.remoteAuthority = null;
    this.extensions = null;
    this._onExit = this._register(new Emitter());
    this.onExit = this._onExit.event;
    this._onDidSetInspectPort = this._register(new Emitter());
    const devOpts = parseExtensionDevOptions(this._environmentService);
    this._isExtensionDevHost = devOpts.isExtensionDevHost;
    this._isExtensionDevDebug = devOpts.isExtensionDevDebug;
    this._isExtensionDevDebugBrk = devOpts.isExtensionDevDebugBrk;
    this._isExtensionDevTestFromCli = devOpts.isExtensionDevTestFromCli;
    this._terminating = false;
    this._mainProcessHandlesExtHostShutdown = false;
    this._inspectListener = null;
    this._extensionHostProcess = null;
    this._messageProtocol = null;
    this._register(this._lifecycleService.onWillShutdown((e) => this._onWillShutdown(e)));
    this._register(this._extensionHostDebugService.onClose((event) => {
      if (this._isExtensionDevHost && this._environmentService.debugExtensionHost.debugId === event.sessionId) {
        this._nativeHostService.closeWindow();
      }
    }));
    this._register(this._extensionHostDebugService.onReload((event) => {
      if (this._isExtensionDevHost && this._environmentService.debugExtensionHost.debugId === event.sessionId) {
        this._hostService.reload();
      }
    }));
  }
  dispose() {
    if (!this._terminating) {
      this._terminating = true;
    }
    super.dispose();
    this._messageProtocol = null;
  }
  async disconnect() {
    this._terminating = true;
    if (this._messageProtocol) {
      try {
        const protocol = await Promise.race([
          this._messageProtocol.then((protocol2) => protocol2, () => void 0),
          timeout(1e3).then(() => void 0)
        ]);
        protocol?.send(createMessageOfType(MessageType.Terminate));
      } catch {
      }
    }
    if (this._extensionHostProcess && !this._mainProcessHandlesExtHostShutdown) {
      this._extensionHostProcess.waitForExit(extensionHostGraceTimeMs).catch(() => {
      });
    }
    this._messageProtocol = null;
  }
  start() {
    if (this._terminating) {
      throw new CancellationError();
    }
    if (!this._messageProtocol) {
      this._messageProtocol = this._start();
    }
    return this._messageProtocol;
  }
  async _start() {
    const [extensionHostCreationResult, portNumber, processEnv] = await Promise.all([
      this._extensionHostStarter.createExtensionHost(),
      this._tryFindDebugPort(),
      this._shellEnvironmentService.getShellEnv()
    ]);
    this._extensionHostProcess = new ExtensionHostProcess(extensionHostCreationResult.id, this._extensionHostStarter);
    const env = objects.mixin(processEnv, {
      VSCODE_ESM_ENTRYPOINT: "vs/workbench/api/node/extensionHostProcess",
      VSCODE_HANDLES_UNCAUGHT_ERRORS: true
    });
    if (this._environmentService.debugExtensionHost.env) {
      objects.mixin(env, this._environmentService.debugExtensionHost.env);
    }
    removeDangerousEnvVariables(env);
    if (this._isExtensionDevHost) {
      delete env["VSCODE_CODE_CACHE_PATH"];
    }
    const opts = {
      responseWindowId: this._nativeHostService.windowId,
      responseChannel: "vscode:startExtensionHostMessagePortResult",
      responseNonce: generateUuid(),
      env,
      // We only detach the extension host on windows. Linux and Mac orphan by default
      // and detach under Linux and Mac create another process group.
      // We detach because we have noticed that when the renderer exits, its child processes
      // (i.e. extension host) are taken down in a brutal fashion by the OS
      detached: !!platform.isWindows,
      execArgv: void 0,
      silent: true
    };
    const inspectHost = "127.0.0.1";
    if (portNumber !== 0) {
      opts.execArgv = [
        "--nolazy",
        (this._isExtensionDevDebugBrk ? "--inspect-brk=" : "--inspect=") + `${inspectHost}:${portNumber}`
      ];
    } else {
      opts.execArgv = ["--inspect-port=0"];
    }
    if (this._environmentService.extensionTestsLocationURI) {
      opts.execArgv.unshift("--expose-gc");
    }
    if (this._environmentService.args["prof-v8-extensions"]) {
      opts.execArgv.unshift("--prof");
    }
    opts.execArgv.unshift("--dns-result-order=ipv4first", "--experimental-network-inspection");
    const onStdout = this._register(this._handleProcessOutputStream(this._extensionHostProcess.onStdout));
    const onStderr = this._register(this._handleProcessOutputStream(this._extensionHostProcess.onStderr));
    const onOutput = Event.any(
      Event.map(onStdout.event, (o) => ({ data: `%c${o}`, format: [""] })),
      Event.map(onStderr.event, (o) => ({ data: `%c${o}`, format: ["color: red"] }))
    );
    if (this._environmentService.args["enable-smoke-test-driver"]) {
      this._register(onStdout.event((line) => this._logService.info(`[Extension Host (stdout)] ${line.replace(/\r?\n$/, "")}`)));
      this._register(onStderr.event((line) => this._logService.error(`[Extension Host (stderr)] ${line.replace(/\r?\n$/, "")}`)));
    }
    const onDebouncedOutput = Event.debounce(onOutput, (r, o) => {
      return r ? { data: r.data + o.data, format: [...r.format, ...o.format] } : { data: o.data, format: o.format };
    }, 100);
    this._register(onDebouncedOutput((output) => {
      const inspectorUrlMatch = output.data && output.data.match(/ws:\/\/([^\s]+):(\d+)\/([^\s]+)/);
      if (inspectorUrlMatch) {
        const [, host, port, auth] = inspectorUrlMatch;
        const devtoolsUrl = `devtools://devtools/bundled/js_app.html?v8only=true&ws=${host}:${port}/${auth}`;
        if (!this._environmentService.isBuilt && !this._isExtensionDevTestFromCli) {
          console.debug(`%c[Extension Host] %cdebugger inspector at ${devtoolsUrl}`, "color: blue", "color:");
        }
        if (!this._inspectListener || !this._inspectListener.devtoolsUrl) {
          this._inspectListener = { host, port: Number(port), devtoolsUrl };
          this._onDidSetInspectPort.fire();
        }
      } else {
        if (!this._isExtensionDevTestFromCli) {
          console.group("Extension Host");
          console.log(output.data, ...output.format);
          console.groupEnd();
        }
      }
    }));
    this._register(this._extensionHostProcess.onExit(({ code, signal }) => this._onExtHostProcessExit(code, signal)));
    if (portNumber) {
      if (this._isExtensionDevHost && this._isExtensionDevDebug && this._environmentService.debugExtensionHost.debugId) {
        this._extensionHostDebugService.attachSession(this._environmentService.debugExtensionHost.debugId, portNumber);
      }
      this._inspectListener = { port: portNumber, host: inspectHost };
      this._onDidSetInspectPort.fire();
    }
    let startupTimeoutHandle;
    if (!this._environmentService.isBuilt && !this._environmentService.remoteAuthority || this._isExtensionDevHost) {
      startupTimeoutHandle = setTimeout(() => {
        this._logService.error(`[LocalProcessExtensionHost]: Extension host did not start in 10 seconds (debugBrk: ${this._isExtensionDevDebugBrk})`);
        const msg = this._isExtensionDevDebugBrk ? nls.localize("extensionHost.startupFailDebug", "Extension host did not start in 10 seconds, it might be stopped on the first line and needs a debugger to continue.") : nls.localize("extensionHost.startupFail", "Extension host did not start in 10 seconds, that might be a problem.");
        this._notificationService.prompt(
          Severity.Warning,
          msg,
          [{
            label: nls.localize("reloadWindow", "Reload Window"),
            run: () => this._hostService.reload()
          }],
          {
            sticky: true,
            priority: NotificationPriority.URGENT
          }
        );
      }, 1e4);
    }
    const protocol = await this._establishProtocol(this._extensionHostProcess, opts);
    await this._performHandshake(protocol);
    clearTimeout(startupTimeoutHandle);
    return protocol;
  }
  /**
   * Find a free port if extension host debugging is enabled.
   */
  async _tryFindDebugPort() {
    if (typeof this._environmentService.debugExtensionHost.port !== "number") {
      return 0;
    }
    const expected = this._environmentService.debugExtensionHost.port;
    const port = await this._nativeHostService.findFreePort(
      expected,
      10,
      5e3,
      2048
      /* skip 2048 ports between attempts */
    );
    if (!this._isExtensionDevTestFromCli) {
      if (!port) {
        console.warn("%c[Extension Host] %cCould not find a free port for debugging", "color: blue", "color:");
      } else {
        if (port !== expected) {
          console.warn(`%c[Extension Host] %cProvided debugging port ${expected} is not free, using ${port} instead.`, "color: blue", "color:");
        }
        if (this._isExtensionDevDebugBrk) {
          console.warn(`%c[Extension Host] %cSTOPPED on first line for debugging on port ${port}`, "color: blue", "color:");
        } else {
          console.debug(`%c[Extension Host] %cdebugger listening on port ${port}`, "color: blue", "color:");
        }
      }
    }
    return port || 0;
  }
  _establishProtocol(extensionHostProcess, opts) {
    writeExtHostConnection(new MessagePortExtHostConnection(), opts.env);
    const portPromise = acquirePort(void 0, opts.responseChannel, opts.responseNonce);
    return new Promise((resolve, reject) => {
      const handle = setTimeout(() => {
        reject("The local extension host took longer than 60s to connect.");
      }, 60 * 1e3);
      portPromise.then((port) => {
        this._register(toDisposable(() => {
          port.close();
          port.onmessage = null;
        }));
        clearTimeout(handle);
        const onMessage = new BufferedEmitter();
        port.onmessage = ((e) => {
          if (e.data) {
            onMessage.fire(VSBuffer.wrap(e.data));
          }
        });
        port.start();
        resolve({
          onMessage: onMessage.event,
          send: (message) => port.postMessage(message.buffer)
        });
      });
      const sw = StopWatch.create(false);
      extensionHostProcess.start(opts).then(({ pid }) => {
        if (pid) {
          this.pid = pid;
        }
        this._logService.info(`Started local extension host with pid ${pid}.`);
        const duration = sw.elapsed();
        if (platform.isCI) {
          this._logService.info(`IExtensionHostStarter.start() took ${duration} ms.`);
        }
      }, (err) => {
        reject(err);
      });
    });
  }
  _performHandshake(protocol) {
    return new Promise((resolve, reject) => {
      let timeoutHandle;
      const installTimeoutCheck = () => {
        timeoutHandle = setTimeout(() => {
          reject("The local extension host took longer than 60s to send its ready message.");
        }, 60 * 1e3);
      };
      const uninstallTimeoutCheck = () => {
        clearTimeout(timeoutHandle);
      };
      installTimeoutCheck();
      const disposable = protocol.onMessage((msg) => {
        if (isMessageOfType(msg, MessageType.Ready)) {
          uninstallTimeoutCheck();
          this._createExtHostInitData().then((data) => {
            installTimeoutCheck();
            protocol.send(VSBuffer.fromString(JSON.stringify(data)));
          });
          return;
        }
        if (isMessageOfType(msg, MessageType.Initialized)) {
          uninstallTimeoutCheck();
          disposable.dispose();
          resolve();
          return;
        }
        console.error(`received unexpected message during handshake phase from the extension host: `, msg);
      });
    });
  }
  async _createExtHostInitData() {
    const initData = await this._initDataProvider.getInitData();
    this.extensions = initData.extensions;
    const workspace = this._contextService.getWorkspace();
    const enabledApiProposalsFallback = await resolveEnabledApiProposalsFallbackExperiment(this._workbenchAssignmentService, this._productService.quality);
    return {
      commit: this._productService.commit,
      version: this._productService.version,
      quality: this._productService.quality,
      date: this._productService.date,
      parentPid: 0,
      enabledApiProposalsFallback,
      environment: {
        isExtensionDevelopmentDebug: this._isExtensionDevDebug,
        appRoot: this._environmentService.appRoot ? URI.file(this._environmentService.appRoot) : void 0,
        appName: this._productService.nameLong,
        appHost: (this._environmentService.isSessionsWindow ? this._productService.agentsTelemetryAppName : void 0) || this._productService.embedderIdentifier || "desktop",
        appUriScheme: this._productService.urlProtocol,
        isExtensionTelemetryLoggingOnly: isLoggingOnly(this._productService, this._environmentService),
        isPortable: this._environmentService.isPortable,
        appLanguage: platform.language,
        extensionDevelopmentLocationURI: this._environmentService.extensionDevelopmentLocationURI,
        extensionTestsLocationURI: this._environmentService.extensionTestsLocationURI,
        globalStorageHome: this._userDataProfilesService.defaultProfile.globalStorageHome,
        workspaceStorageHome: this._environmentService.workspaceStorageHome,
        extensionLogLevel: this._defaultLogLevelsService.defaultLogLevels.extensions,
        isSessionsWindow: this._environmentService.isSessionsWindow
      },
      workspace: this._contextService.getWorkbenchState() === WorkbenchState.EMPTY ? void 0 : {
        configuration: workspace.configuration ?? void 0,
        id: workspace.id,
        name: this._labelService.getWorkspaceLabel(workspace),
        isUntitled: workspace.configuration ? isUntitledWorkspace(workspace.configuration, this._environmentService) : false,
        transient: workspace.transient
      },
      remote: {
        authority: this._environmentService.remoteAuthority,
        connectionData: null,
        isRemote: false
      },
      consoleForward: {
        includeStack: !this._isExtensionDevTestFromCli && (this._isExtensionDevHost || !this._environmentService.isBuilt || this._productService.quality !== "stable" || this._environmentService.verbose),
        logNative: !this._isExtensionDevTestFromCli && this._isExtensionDevHost
      },
      extensions: this.extensions.toSnapshot(),
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
      logsLocation: this._environmentService.extHostLogsPath,
      autoStart: this.startup === ExtensionHostStartup.EagerAutoStart,
      uiKind: UIKind.Desktop,
      handle: this._environmentService.window.handle ? encodeBase64(this._environmentService.window.handle) : void 0
    };
  }
  _onExtHostProcessExit(code, signal) {
    if (this._terminating) {
      return;
    }
    this._onExit.fire([code, signal]);
  }
  _handleProcessOutputStream(stream) {
    let last = "";
    let isOmitting = false;
    const event = new Emitter();
    stream((chunk) => {
      last += chunk;
      const lines = last.split(/\r?\n/g);
      last = lines.pop();
      if (last.length > 1e4) {
        lines.push(last);
        last = "";
      }
      for (const line of lines) {
        if (isOmitting) {
          if (line === NativeLogMarkers.End) {
            isOmitting = false;
          }
        } else if (line === NativeLogMarkers.Start) {
          isOmitting = true;
        } else if (line.length) {
          event.fire(line + "\n");
        }
      }
    }, void 0, this._store);
    return event;
  }
  async enableInspectPort() {
    if (!!this._inspectListener) {
      return true;
    }
    if (!this._extensionHostProcess) {
      return false;
    }
    const result = await this._extensionHostProcess.enableInspectPort();
    if (!result) {
      return false;
    }
    await Promise.race([Event.toPromise(this._onDidSetInspectPort.event), timeout(1e3)]);
    return !!this._inspectListener;
  }
  getInspectPort() {
    return this._inspectListener ?? void 0;
  }
  _onWillShutdown(event) {
    this._mainProcessHandlesExtHostShutdown = true;
    if (this._isExtensionDevHost && !this._isExtensionDevTestFromCli && !this._isExtensionDevDebug && this._environmentService.debugExtensionHost.debugId) {
      this._extensionHostDebugService.terminateSession(this._environmentService.debugExtensionHost.debugId);
      event.join(timeout(
        100
        /* wait a bit for IPC to get delivered */
      ), { id: "join.extensionDevelopment", label: nls.localize("join.extensionDevelopment", "Terminating extension debug session") });
    }
  }
};
NativeLocalProcessExtensionHost = __decorateClass([
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, INativeHostService),
  __decorateParam(6, ILifecycleService),
  __decorateParam(7, INativeWorkbenchEnvironmentService),
  __decorateParam(8, IUserDataProfilesService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, ILogService),
  __decorateParam(11, ILoggerService),
  __decorateParam(12, ILabelService),
  __decorateParam(13, IExtensionHostDebugService),
  __decorateParam(14, IHostService),
  __decorateParam(15, IProductService),
  __decorateParam(16, IShellEnvironmentService),
  __decorateParam(17, IExtensionHostStarter),
  __decorateParam(18, IDefaultLogLevelsService),
  __decorateParam(19, IWorkbenchAssignmentService)
], NativeLocalProcessExtensionHost);
export {
  ExtensionHostProcess,
  NativeLocalProcessExtensionHost
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25zXFxlbGVjdHJvbi1icm93c2VyXFxsb2NhbFByb2Nlc3NFeHRlbnNpb25Ib3N0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGVuY29kZUJhc2U2NCwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgb2JqZWN0cyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IHJlbW92ZURhbmdlcm91c0VudlZhcmlhYmxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3Nlcy5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IEJ1ZmZlcmVkRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMubmV0LmpzJztcbmltcG9ydCB7IGFjcXVpcmVQb3J0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvZWxlY3Ryb24tYnJvd3Nlci9pcGMubXAuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uSG9zdERlYnVnU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RlYnVnL2NvbW1vbi9leHRlbnNpb25Ib3N0RGVidWcuanMnO1xuaW1wb3J0IHsgZXh0ZW5zaW9uSG9zdEdyYWNlVGltZU1zLCBJRXh0ZW5zaW9uSG9zdFByb2Nlc3NPcHRpb25zLCBJRXh0ZW5zaW9uSG9zdFN0YXJ0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25Ib3N0U3RhcnRlci5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBJTG9nZ2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBOb3RpZmljYXRpb25Qcmlvcml0eSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9hc3NpZ25tZW50L2NvbW1vbi9hc3NpZ25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGlzTG9nZ2luZ09ubHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUsIGlzVW50aXRsZWRXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvZWxlY3Ryb24tYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNoZWxsRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvZWxlY3Ryb24tYnJvd3Nlci9zaGVsbEVudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlUG9ydEV4dEhvc3RDb25uZWN0aW9uLCB3cml0ZUV4dEhvc3RDb25uZWN0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbkhvc3RFbnYuanMnO1xuaW1wb3J0IHsgY3JlYXRlTWVzc2FnZU9mVHlwZSwgSUV4dGVuc2lvbkhvc3RJbml0RGF0YSwgTWVzc2FnZVR5cGUsIE5hdGl2ZUxvZ01hcmtlcnMsIFVJS2luZCwgaXNNZXNzYWdlT2ZUeXBlIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbkhvc3RQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBMb2NhbFByb2Nlc3NSdW5uaW5nTG9jYXRpb24gfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvc3RFeHRlbnNpb25zLCBFeHRlbnNpb25Ib3N0U3RhcnR1cCwgSUV4dGVuc2lvbkhvc3QsIElFeHRlbnNpb25JbnNwZWN0SW5mbywgcmVzb2x2ZUVuYWJsZWRBcGlQcm9wb3NhbHNGYWxsYmFja0V4cGVyaW1lbnQgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgV2lsbFNodXRkb3duRXZlbnQgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBwYXJzZUV4dGVuc2lvbkRldk9wdGlvbnMgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uRGV2T3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdExvZ0xldmVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2RlZmF1bHRMb2dMZXZlbHMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElMb2NhbFByb2Nlc3NFeHRlbnNpb25Ib3N0SW5pdERhdGEge1xuXHRyZWFkb25seSBleHRlbnNpb25zOiBFeHRlbnNpb25Ib3N0RXh0ZW5zaW9ucztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdERhdGFQcm92aWRlciB7XG5cdGdldEluaXREYXRhKCk6IFByb21pc2U8SUxvY2FsUHJvY2Vzc0V4dGVuc2lvbkhvc3RJbml0RGF0YT47XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25Ib3N0UHJvY2VzcyB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaWQ6IHN0cmluZztcblxuXHRwdWJsaWMgZ2V0IG9uU3Rkb3V0KCk6IEV2ZW50PHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25Ib3N0U3RhcnRlci5vbkR5bmFtaWNTdGRvdXQodGhpcy5faWQpO1xuXHR9XG5cblx0cHVibGljIGdldCBvblN0ZGVycigpOiBFdmVudDxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fZXh0ZW5zaW9uSG9zdFN0YXJ0ZXIub25EeW5hbWljU3RkZXJyKHRoaXMuX2lkKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25NZXNzYWdlKCk6IEV2ZW50PHVua25vd24+IHtcblx0XHRyZXR1cm4gdGhpcy5fZXh0ZW5zaW9uSG9zdFN0YXJ0ZXIub25EeW5hbWljTWVzc2FnZSh0aGlzLl9pZCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRXhpdCgpOiBFdmVudDx7IGNvZGU6IG51bWJlcjsgc2lnbmFsOiBzdHJpbmcgfT4ge1xuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25Ib3N0U3RhcnRlci5vbkR5bmFtaWNFeGl0KHRoaXMuX2lkKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uSG9zdFN0YXJ0ZXI6IElFeHRlbnNpb25Ib3N0U3RhcnRlcixcblx0KSB7XG5cdFx0dGhpcy5faWQgPSBpZDtcblx0fVxuXG5cdHB1YmxpYyBzdGFydChvcHRzOiBJRXh0ZW5zaW9uSG9zdFByb2Nlc3NPcHRpb25zKTogUHJvbWlzZTx7IHBpZDogbnVtYmVyIHwgdW5kZWZpbmVkIH0+IHtcblx0XHRyZXR1cm4gdGhpcy5fZXh0ZW5zaW9uSG9zdFN0YXJ0ZXIuc3RhcnQodGhpcy5faWQsIG9wdHMpO1xuXHR9XG5cblx0cHVibGljIGVuYWJsZUluc3BlY3RQb3J0KCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25Ib3N0U3RhcnRlci5lbmFibGVJbnNwZWN0UG9ydCh0aGlzLl9pZCk7XG5cdH1cblxuXHRwdWJsaWMgd2FpdEZvckV4aXQobWF4V2FpdFRpbWVNczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4dGVuc2lvbkhvc3RTdGFydGVyLndhaXRGb3JFeGl0KHRoaXMuX2lkLCBtYXhXYWl0VGltZU1zKTtcblx0fVxuXG5cdHB1YmxpYyBraWxsKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25Ib3N0U3RhcnRlci5raWxsKHRoaXMuX2lkKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTmF0aXZlTG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uSG9zdCB7XG5cblx0cHVibGljIHBpZDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cdHB1YmxpYyByZWFkb25seSByZW1vdGVBdXRob3JpdHkgPSBudWxsO1xuXHRwdWJsaWMgZXh0ZW5zaW9uczogRXh0ZW5zaW9uSG9zdEV4dGVuc2lvbnMgfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkV4aXQ6IEVtaXR0ZXI8W251bWJlciwgc3RyaW5nXT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxbbnVtYmVyLCBzdHJpbmddPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRXhpdDogRXZlbnQ8W251bWJlciwgc3RyaW5nXT4gPSB0aGlzLl9vbkV4aXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZXRJbnNwZWN0UG9ydCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXG5cblx0cHJpdmF0ZSByZWFkb25seSBfaXNFeHRlbnNpb25EZXZIb3N0OiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0V4dGVuc2lvbkRldkRlYnVnOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0V4dGVuc2lvbkRldkRlYnVnQnJrOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0V4dGVuc2lvbkRldlRlc3RGcm9tQ2xpOiBib29sZWFuO1xuXG5cdC8vIFN0YXRlXG5cdHByaXZhdGUgX3Rlcm1pbmF0aW5nOiBib29sZWFuO1xuXHRwcml2YXRlIF9tYWluUHJvY2Vzc0hhbmRsZXNFeHRIb3N0U2h1dGRvd246IGJvb2xlYW47XG5cblx0Ly8gUmVzb3VyY2VzLCBpbiBvcmRlciB0aGV5IGdldCBhY3F1aXJlZC9jcmVhdGVkIHdoZW4gLnN0YXJ0KCkgaXMgY2FsbGVkOlxuXHRwcml2YXRlIF9pbnNwZWN0TGlzdGVuZXI6IElFeHRlbnNpb25JbnNwZWN0SW5mbyB8IG51bGw7XG5cdHByaXZhdGUgX2V4dGVuc2lvbkhvc3RQcm9jZXNzOiBFeHRlbnNpb25Ib3N0UHJvY2VzcyB8IG51bGw7XG5cdHByaXZhdGUgX21lc3NhZ2VQcm90b2NvbDogUHJvbWlzZTxJTWVzc2FnZVBhc3NpbmdQcm90b2NvbD4gfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBydW5uaW5nTG9jYXRpb246IExvY2FsUHJvY2Vzc1J1bm5pbmdMb2NhdGlvbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgc3RhcnR1cDogRXh0ZW5zaW9uSG9zdFN0YXJ0dXAuRWFnZXJBdXRvU3RhcnQgfCBFeHRlbnNpb25Ib3N0U3RhcnR1cC5FYWdlck1hbnVhbFN0YXJ0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2luaXREYXRhUHJvdmlkZXI6IElMb2NhbFByb2Nlc3NFeHRlbnNpb25Ib3N0RGF0YVByb3ZpZGVyLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElOYXRpdmVIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9uYXRpdmVIb3N0U2VydmljZTogSU5hdGl2ZUhvc3RTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9saWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElMb2dnZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ2dlclNlcnZpY2U6IElMb2dnZXJTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUV4dGVuc2lvbkhvc3REZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uSG9zdERlYnVnU2VydmljZTogSUV4dGVuc2lvbkhvc3REZWJ1Z1NlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVNoZWxsRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3NoZWxsRW52aXJvbm1lbnRTZXJ2aWNlOiBJU2hlbGxFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25Ib3N0U3RhcnRlciBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25Ib3N0U3RhcnRlcjogSUV4dGVuc2lvbkhvc3RTdGFydGVyLFxuXHRcdEBJRGVmYXVsdExvZ0xldmVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdExvZ0xldmVsc1NlcnZpY2U6IElEZWZhdWx0TG9nTGV2ZWxzU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3QgZGV2T3B0cyA9IHBhcnNlRXh0ZW5zaW9uRGV2T3B0aW9ucyh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdHRoaXMuX2lzRXh0ZW5zaW9uRGV2SG9zdCA9IGRldk9wdHMuaXNFeHRlbnNpb25EZXZIb3N0O1xuXHRcdHRoaXMuX2lzRXh0ZW5zaW9uRGV2RGVidWcgPSBkZXZPcHRzLmlzRXh0ZW5zaW9uRGV2RGVidWc7XG5cdFx0dGhpcy5faXNFeHRlbnNpb25EZXZEZWJ1Z0JyayA9IGRldk9wdHMuaXNFeHRlbnNpb25EZXZEZWJ1Z0Jyaztcblx0XHR0aGlzLl9pc0V4dGVuc2lvbkRldlRlc3RGcm9tQ2xpID0gZGV2T3B0cy5pc0V4dGVuc2lvbkRldlRlc3RGcm9tQ2xpO1xuXG5cdFx0dGhpcy5fdGVybWluYXRpbmcgPSBmYWxzZTtcblx0XHR0aGlzLl9tYWluUHJvY2Vzc0hhbmRsZXNFeHRIb3N0U2h1dGRvd24gPSBmYWxzZTtcblxuXHRcdHRoaXMuX2luc3BlY3RMaXN0ZW5lciA9IG51bGw7XG5cdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3MgPSBudWxsO1xuXHRcdHRoaXMuX21lc3NhZ2VQcm90b2NvbCA9IG51bGw7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saWZlY3ljbGVTZXJ2aWNlLm9uV2lsbFNodXRkb3duKGUgPT4gdGhpcy5fb25XaWxsU2h1dGRvd24oZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9leHRlbnNpb25Ib3N0RGVidWdTZXJ2aWNlLm9uQ2xvc2UoZXZlbnQgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzRXh0ZW5zaW9uRGV2SG9zdCAmJiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuZGVidWdFeHRlbnNpb25Ib3N0LmRlYnVnSWQgPT09IGV2ZW50LnNlc3Npb25JZCkge1xuXHRcdFx0XHR0aGlzLl9uYXRpdmVIb3N0U2VydmljZS5jbG9zZVdpbmRvdygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9leHRlbnNpb25Ib3N0RGVidWdTZXJ2aWNlLm9uUmVsb2FkKGV2ZW50ID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc0V4dGVuc2lvbkRldkhvc3QgJiYgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmRlYnVnRXh0ZW5zaW9uSG9zdC5kZWJ1Z0lkID09PSBldmVudC5zZXNzaW9uSWQpIHtcblx0XHRcdFx0dGhpcy5faG9zdFNlcnZpY2UucmVsb2FkKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90ZXJtaW5hdGluZykge1xuXHRcdFx0dGhpcy5fdGVybWluYXRpbmcgPSB0cnVlO1xuXHRcdH1cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fbWVzc2FnZVByb3RvY29sID0gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBkaXNjb25uZWN0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3Rlcm1pbmF0aW5nID0gdHJ1ZTtcblxuXHRcdC8vIFNlbmQgdGhlIFRlcm1pbmF0ZSBtZXNzYWdlIHNvIHRoZSBleHRlbnNpb24gaG9zdCBjYW4gcnVuXG5cdFx0Ly8gZGVhY3RpdmF0aW9uIGhhbmRsZXJzIGFuZCBleGl0IGdyYWNlZnVsbHkuXG5cdFx0aWYgKHRoaXMuX21lc3NhZ2VQcm90b2NvbCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcHJvdG9jb2wgPSBhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0XHRcdHRoaXMuX21lc3NhZ2VQcm90b2NvbC50aGVuKHByb3RvY29sID0+IHByb3RvY29sLCAoKSA9PiB1bmRlZmluZWQpLFxuXHRcdFx0XHRcdHRpbWVvdXQoMTAwMCkudGhlbigoKSA9PiB1bmRlZmluZWQpXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRwcm90b2NvbD8uc2VuZChjcmVhdGVNZXNzYWdlT2ZUeXBlKE1lc3NhZ2VUeXBlLlRlcm1pbmF0ZSkpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSAtIGV4dGVuc2lvbiBob3N0IG1heSBoYXZlIGFscmVhZHkgZXhpdGVkXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRm9yIHRoZSByZXN0YXJ0IGNhc2Ugd2hlcmUgdGhlIG1haW4gcHJvY2VzcyBkb2VzIG5vdCBoYW5kbGUgdGhlXG5cdFx0Ly8gZXh0ZW5zaW9uIGhvc3Qgc2h1dGRvd24sIHNpZ25hbCB0aGUgbWFpbiBwcm9jZXNzIHRvIHN0YXJ0IHRoZSBncmFjZVxuXHRcdC8vIHRpbWVyIChmaXJlLWFuZC1mb3JnZXQpLiBBZnRlciB0aGUgdGltZW91dCB0aGUgZXh0ZW5zaW9uIGhvc3Qgd2lsbFxuXHRcdC8vIGJlIGZvcmNlZnVsbHkga2lsbGVkIGlmIGl0IGhhc24ndCBleGl0ZWQgb24gaXRzIG93bi4gRm9yIGFsbFxuXHRcdC8vIHdpbmRvdy1saWZlY3ljbGUgc2h1dGRvd24gcmVhc29ucyAoY2xvc2UvcXVpdC9yZWxvYWQvbG9hZCksIHRoZVxuXHRcdC8vIG1haW4gcHJvY2VzcyBhbHJlYWR5IGhhbmRsZXMgdGhpcyB2aWFcblx0XHQvLyBXaW5kb3dVdGlsaXR5UHJvY2Vzcy5yZWdpc3RlcldpbmRvd0xpc3RlbmVycy5cblx0XHRpZiAodGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3MgJiYgIXRoaXMuX21haW5Qcm9jZXNzSGFuZGxlc0V4dEhvc3RTaHV0ZG93bikge1xuXHRcdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3Mud2FpdEZvckV4aXQoZXh0ZW5zaW9uSG9zdEdyYWNlVGltZU1zKS5jYXRjaCgoKSA9PiB7IC8qIGJlc3QtZWZmb3J0ICovIH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX21lc3NhZ2VQcm90b2NvbCA9IG51bGw7XG5cdH1cblxuXHRwdWJsaWMgc3RhcnQoKTogUHJvbWlzZTxJTWVzc2FnZVBhc3NpbmdQcm90b2NvbD4ge1xuXHRcdGlmICh0aGlzLl90ZXJtaW5hdGluZykge1xuXHRcdFx0Ly8gLnRlcm1pbmF0ZSgpIHdhcyBjYWxsZWRcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fbWVzc2FnZVByb3RvY29sKSB7XG5cdFx0XHR0aGlzLl9tZXNzYWdlUHJvdG9jb2wgPSB0aGlzLl9zdGFydCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9tZXNzYWdlUHJvdG9jb2w7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zdGFydCgpOiBQcm9taXNlPElNZXNzYWdlUGFzc2luZ1Byb3RvY29sPiB7XG5cdFx0Y29uc3QgW2V4dGVuc2lvbkhvc3RDcmVhdGlvblJlc3VsdCwgcG9ydE51bWJlciwgcHJvY2Vzc0Vudl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR0aGlzLl9leHRlbnNpb25Ib3N0U3RhcnRlci5jcmVhdGVFeHRlbnNpb25Ib3N0KCksXG5cdFx0XHR0aGlzLl90cnlGaW5kRGVidWdQb3J0KCksXG5cdFx0XHR0aGlzLl9zaGVsbEVudmlyb25tZW50U2VydmljZS5nZXRTaGVsbEVudigpLFxuXHRcdF0pO1xuXG5cdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3MgPSBuZXcgRXh0ZW5zaW9uSG9zdFByb2Nlc3MoZXh0ZW5zaW9uSG9zdENyZWF0aW9uUmVzdWx0LmlkLCB0aGlzLl9leHRlbnNpb25Ib3N0U3RhcnRlcik7XG5cblx0XHRjb25zdCBlbnYgPSBvYmplY3RzLm1peGluKHByb2Nlc3NFbnYsIHtcblx0XHRcdFZTQ09ERV9FU01fRU5UUllQT0lOVDogJ3ZzL3dvcmtiZW5jaC9hcGkvbm9kZS9leHRlbnNpb25Ib3N0UHJvY2VzcycsXG5cdFx0XHRWU0NPREVfSEFORExFU19VTkNBVUdIVF9FUlJPUlM6IHRydWVcblx0XHR9KTtcblxuXHRcdGlmICh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuZGVidWdFeHRlbnNpb25Ib3N0LmVudikge1xuXHRcdFx0b2JqZWN0cy5taXhpbihlbnYsIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5kZWJ1Z0V4dGVuc2lvbkhvc3QuZW52KTtcblx0XHR9XG5cblx0XHRyZW1vdmVEYW5nZXJvdXNFbnZWYXJpYWJsZXMoZW52KTtcblxuXHRcdGlmICh0aGlzLl9pc0V4dGVuc2lvbkRldkhvc3QpIHtcblx0XHRcdC8vIFVuc2V0IGBWU0NPREVfQ09ERV9DQUNIRV9QQVRIYCB3aGVuIGRldmVsb3BpbmcgZXh0ZW5zaW9ucyBiZWNhdXNlIGl0IG1pZ2h0XG5cdFx0XHQvLyBiZSB0aGF0IGRlcGVuZGVuY2llcywgdGhhdCBvdGhlcndpc2Ugd291bGQgYmUgY2FjaGVkLCBnZXQgbW9kaWZpZWQuXG5cdFx0XHRkZWxldGUgZW52WydWU0NPREVfQ09ERV9DQUNIRV9QQVRIJ107XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3B0czogSUV4dGVuc2lvbkhvc3RQcm9jZXNzT3B0aW9ucyA9IHtcblx0XHRcdHJlc3BvbnNlV2luZG93SWQ6IHRoaXMuX25hdGl2ZUhvc3RTZXJ2aWNlLndpbmRvd0lkLFxuXHRcdFx0cmVzcG9uc2VDaGFubmVsOiAndnNjb2RlOnN0YXJ0RXh0ZW5zaW9uSG9zdE1lc3NhZ2VQb3J0UmVzdWx0Jyxcblx0XHRcdHJlc3BvbnNlTm9uY2U6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0ZW52LFxuXHRcdFx0Ly8gV2Ugb25seSBkZXRhY2ggdGhlIGV4dGVuc2lvbiBob3N0IG9uIHdpbmRvd3MuIExpbnV4IGFuZCBNYWMgb3JwaGFuIGJ5IGRlZmF1bHRcblx0XHRcdC8vIGFuZCBkZXRhY2ggdW5kZXIgTGludXggYW5kIE1hYyBjcmVhdGUgYW5vdGhlciBwcm9jZXNzIGdyb3VwLlxuXHRcdFx0Ly8gV2UgZGV0YWNoIGJlY2F1c2Ugd2UgaGF2ZSBub3RpY2VkIHRoYXQgd2hlbiB0aGUgcmVuZGVyZXIgZXhpdHMsIGl0cyBjaGlsZCBwcm9jZXNzZXNcblx0XHRcdC8vIChpLmUuIGV4dGVuc2lvbiBob3N0KSBhcmUgdGFrZW4gZG93biBpbiBhIGJydXRhbCBmYXNoaW9uIGJ5IHRoZSBPU1xuXHRcdFx0ZGV0YWNoZWQ6ICEhcGxhdGZvcm0uaXNXaW5kb3dzLFxuXHRcdFx0ZXhlY0FyZ3Y6IHVuZGVmaW5lZCBhcyBzdHJpbmdbXSB8IHVuZGVmaW5lZCxcblx0XHRcdHNpbGVudDogdHJ1ZVxuXHRcdH07XG5cblx0XHRjb25zdCBpbnNwZWN0SG9zdCA9ICcxMjcuMC4wLjEnO1xuXHRcdGlmIChwb3J0TnVtYmVyICE9PSAwKSB7XG5cdFx0XHRvcHRzLmV4ZWNBcmd2ID0gW1xuXHRcdFx0XHQnLS1ub2xhenknLFxuXHRcdFx0XHQodGhpcy5faXNFeHRlbnNpb25EZXZEZWJ1Z0JyayA/ICctLWluc3BlY3QtYnJrPScgOiAnLS1pbnNwZWN0PScpICsgYCR7aW5zcGVjdEhvc3R9OiR7cG9ydE51bWJlcn1gXG5cdFx0XHRdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRvcHRzLmV4ZWNBcmd2ID0gWyctLWluc3BlY3QtcG9ydD0wJ107XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5leHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJKSB7XG5cdFx0XHRvcHRzLmV4ZWNBcmd2LnVuc2hpZnQoJy0tZXhwb3NlLWdjJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcmdzWydwcm9mLXY4LWV4dGVuc2lvbnMnXSkge1xuXHRcdFx0b3B0cy5leGVjQXJndi51bnNoaWZ0KCctLXByb2YnKTtcblx0XHR9XG5cblx0XHQvLyBSZWZzIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xODk4MDVcblx0XHQvL1xuXHRcdC8vIEVuYWJsZSBleHBlcmltZW50YWwgbmV0d29yayBpbnNwZWN0aW9uXG5cdFx0Ly8gaW5zcGVjdG9yIGFnZW50IGlzIGFsd2F5cyBzZXR1cCBoZW5jZSBhZGQgdGhpcyBmbGFnXG5cdFx0Ly8gdW5jb25kaXRpb25hbGx5LlxuXHRcdG9wdHMuZXhlY0FyZ3YudW5zaGlmdCgnLS1kbnMtcmVzdWx0LW9yZGVyPWlwdjRmaXJzdCcsICctLWV4cGVyaW1lbnRhbC1uZXR3b3JrLWluc3BlY3Rpb24nKTtcblxuXHRcdC8vIENhdGNoIGFsbCBvdXRwdXQgY29taW5nIGZyb20gdGhlIGV4dGVuc2lvbiBob3N0IHByb2Nlc3Ncblx0XHR0eXBlIE91dHB1dCA9IHsgZGF0YTogc3RyaW5nOyBmb3JtYXQ6IHN0cmluZ1tdIH07XG5cdFx0Y29uc3Qgb25TdGRvdXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9oYW5kbGVQcm9jZXNzT3V0cHV0U3RyZWFtKHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzLm9uU3Rkb3V0KSk7XG5cdFx0Y29uc3Qgb25TdGRlcnIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9oYW5kbGVQcm9jZXNzT3V0cHV0U3RyZWFtKHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzLm9uU3RkZXJyKSk7XG5cdFx0Y29uc3Qgb25PdXRwdXQgPSBFdmVudC5hbnkoXG5cdFx0XHRFdmVudC5tYXAob25TdGRvdXQuZXZlbnQsIG8gPT4gKHsgZGF0YTogYCVjJHtvfWAsIGZvcm1hdDogWycnXSB9KSksXG5cdFx0XHRFdmVudC5tYXAob25TdGRlcnIuZXZlbnQsIG8gPT4gKHsgZGF0YTogYCVjJHtvfWAsIGZvcm1hdDogWydjb2xvcjogcmVkJ10gfSkpXG5cdFx0KTtcblxuXHRcdC8vIFBlcnNpc3QgdGhlIHJhdyBleHRlbnNpb24gaG9zdCBwcm9jZXNzIG91dHB1dCAoc3Rkb3V0L3N0ZGVycikgdG8gdGhlXG5cdFx0Ly8gcmVuZGVyZXIgbG9nLiBUaGUgb3V0cHV0IGlzIG90aGVyd2lzZSBvbmx5IGZvcndhcmRlZCAoZGVib3VuY2VkKSB0byB0aGVcblx0XHQvLyByZW5kZXJlciBEZXZUb29scyBjb25zb2xlLiBBIG5hdGl2ZSBjcmFzaCBvZiB0aGUgZXh0ZW5zaW9uIGhvc3QgcHJvY2Vzc1xuXHRcdC8vIC0gZS5nLiBhIGZhdWx0eSBuYXRpdmUgYWRkb24gLSBwcmludHMgdG8gdGhlIHByb2Nlc3MnIHN0ZGVyciBidXQgbmV2ZXJcblx0XHQvLyByZWFjaGVzIHRoZSBKYXZhU2NyaXB0IGxheWVyLCBzbyBpdCBoYXMgbm8gSlMgc3RhY2sgYW5kIChmb3IgdXRpbGl0eVxuXHRcdC8vIHByb2Nlc3NlcykgZnJlcXVlbnRseSBwcm9kdWNlcyBubyBjcmFzaCBkdW1wOyBpdCBhbHNvIGNhbm5vdCBnbyB0aHJvdWdoXG5cdFx0Ly8gdGhlIGV4dGVuc2lvbiBob3N0J3Mgb3duIGxvZyBzZXJ2aWNlLCB3aGljaCBsaXZlcyBpbiB0aGUgZHlpbmcgcHJvY2Vzcy5cblx0XHQvLyBDYXB0dXJpbmcgdGhlIHJhdyBvdXRwdXQgZnJvbSB0aGUgKHN1cnZpdmluZykgcmVuZGVyZXIga2VlcHMgc3VjaFxuXHRcdC8vIGNyYXNoZXMgZGlhZ25vc2FibGUgZnJvbSB0aGUgbG9ncy4gR2F0ZWQgdG8gc21va2UgdGVzdHNcblx0XHQvLyAoYC0tZW5hYmxlLXNtb2tlLXRlc3QtZHJpdmVyYCkgc28gaXQgZG9lcyBub3QgYWZmZWN0IHJlZ3VsYXIgc2Vzc2lvbnMuXG5cdFx0aWYgKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcmdzWydlbmFibGUtc21va2UtdGVzdC1kcml2ZXInXSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIob25TdGRvdXQuZXZlbnQobGluZSA9PiB0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtFeHRlbnNpb24gSG9zdCAoc3Rkb3V0KV0gJHtsaW5lLnJlcGxhY2UoL1xccj9cXG4kLywgJycpfWApKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihvblN0ZGVyci5ldmVudChsaW5lID0+IHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtFeHRlbnNpb24gSG9zdCAoc3RkZXJyKV0gJHtsaW5lLnJlcGxhY2UoL1xccj9cXG4kLywgJycpfWApKSk7XG5cdFx0fVxuXG5cdFx0Ly8gRGVib3VuY2UgYWxsIG91dHB1dCwgc28gd2UgY2FuIHJlbmRlciBpdCBpbiB0aGUgQ2hyb21lIGNvbnNvbGUgYXMgYSBncm91cFxuXHRcdGNvbnN0IG9uRGVib3VuY2VkT3V0cHV0ID0gRXZlbnQuZGVib3VuY2U8T3V0cHV0Pihvbk91dHB1dCwgKHIsIG8pID0+IHtcblx0XHRcdHJldHVybiByXG5cdFx0XHRcdD8geyBkYXRhOiByLmRhdGEgKyBvLmRhdGEsIGZvcm1hdDogWy4uLnIuZm9ybWF0LCAuLi5vLmZvcm1hdF0gfVxuXHRcdFx0XHQ6IHsgZGF0YTogby5kYXRhLCBmb3JtYXQ6IG8uZm9ybWF0IH07XG5cdFx0fSwgMTAwKTtcblxuXHRcdC8vIFByaW50IG91dCBleHRlbnNpb24gaG9zdCBvdXRwdXRcblx0XHR0aGlzLl9yZWdpc3RlcihvbkRlYm91bmNlZE91dHB1dChvdXRwdXQgPT4ge1xuXHRcdFx0Y29uc3QgaW5zcGVjdG9yVXJsTWF0Y2ggPSBvdXRwdXQuZGF0YSAmJiBvdXRwdXQuZGF0YS5tYXRjaCgvd3M6XFwvXFwvKFteXFxzXSspOihcXGQrKVxcLyhbXlxcc10rKS8pO1xuXHRcdFx0aWYgKGluc3BlY3RvclVybE1hdGNoKSB7XG5cdFx0XHRcdGNvbnN0IFssIGhvc3QsIHBvcnQsIGF1dGhdID0gaW5zcGVjdG9yVXJsTWF0Y2g7XG5cdFx0XHRcdGNvbnN0IGRldnRvb2xzVXJsID0gYGRldnRvb2xzOi8vZGV2dG9vbHMvYnVuZGxlZC9qc19hcHAuaHRtbD92OG9ubHk9dHJ1ZSZ3cz0ke2hvc3R9OiR7cG9ydH0vJHthdXRofWA7XG5cdFx0XHRcdGlmICghdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzQnVpbHQgJiYgIXRoaXMuX2lzRXh0ZW5zaW9uRGV2VGVzdEZyb21DbGkpIHtcblx0XHRcdFx0XHRjb25zb2xlLmRlYnVnKGAlY1tFeHRlbnNpb24gSG9zdF0gJWNkZWJ1Z2dlciBpbnNwZWN0b3IgYXQgJHtkZXZ0b29sc1VybH1gLCAnY29sb3I6IGJsdWUnLCAnY29sb3I6Jyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCF0aGlzLl9pbnNwZWN0TGlzdGVuZXIgfHwgIXRoaXMuX2luc3BlY3RMaXN0ZW5lci5kZXZ0b29sc1VybCkge1xuXHRcdFx0XHRcdHRoaXMuX2luc3BlY3RMaXN0ZW5lciA9IHsgaG9zdCwgcG9ydDogTnVtYmVyKHBvcnQpLCBkZXZ0b29sc1VybCB9O1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkU2V0SW5zcGVjdFBvcnQuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2lzRXh0ZW5zaW9uRGV2VGVzdEZyb21DbGkpIHtcblx0XHRcdFx0XHRjb25zb2xlLmdyb3VwKCdFeHRlbnNpb24gSG9zdCcpO1xuXHRcdFx0XHRcdGNvbnNvbGUubG9nKG91dHB1dC5kYXRhLCAuLi5vdXRwdXQuZm9ybWF0KTtcblx0XHRcdFx0XHRjb25zb2xlLmdyb3VwRW5kKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBMaWZlY3ljbGVcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzLm9uRXhpdCgoeyBjb2RlLCBzaWduYWwgfSkgPT4gdGhpcy5fb25FeHRIb3N0UHJvY2Vzc0V4aXQoY29kZSwgc2lnbmFsKSkpO1xuXG5cdFx0Ly8gTm90aWZ5IGRlYnVnZ2VyIHRoYXQgd2UgYXJlIHJlYWR5IHRvIGF0dGFjaCB0byB0aGUgcHJvY2VzcyBpZiB3ZSBydW4gYSBkZXZlbG9wbWVudCBleHRlbnNpb25cblx0XHRpZiAocG9ydE51bWJlcikge1xuXHRcdFx0aWYgKHRoaXMuX2lzRXh0ZW5zaW9uRGV2SG9zdCAmJiB0aGlzLl9pc0V4dGVuc2lvbkRldkRlYnVnICYmIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5kZWJ1Z0V4dGVuc2lvbkhvc3QuZGVidWdJZCkge1xuXHRcdFx0XHR0aGlzLl9leHRlbnNpb25Ib3N0RGVidWdTZXJ2aWNlLmF0dGFjaFNlc3Npb24odGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmRlYnVnRXh0ZW5zaW9uSG9zdC5kZWJ1Z0lkLCBwb3J0TnVtYmVyKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2luc3BlY3RMaXN0ZW5lciA9IHsgcG9ydDogcG9ydE51bWJlciwgaG9zdDogaW5zcGVjdEhvc3QgfTtcblx0XHRcdHRoaXMuX29uRGlkU2V0SW5zcGVjdFBvcnQuZmlyZSgpO1xuXHRcdH1cblxuXHRcdC8vIEhlbHAgaW4gY2FzZSB3ZSBmYWlsIHRvIHN0YXJ0IGl0XG5cdFx0bGV0IHN0YXJ0dXBUaW1lb3V0SGFuZGxlOiBUaW1lb3V0IHwgdW5kZWZpbmVkO1xuXHRcdGlmICghdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzQnVpbHQgJiYgIXRoaXMuX2Vudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkgfHwgdGhpcy5faXNFeHRlbnNpb25EZXZIb3N0KSB7XG5cdFx0XHRzdGFydHVwVGltZW91dEhhbmRsZSA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbTG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdF06IEV4dGVuc2lvbiBob3N0IGRpZCBub3Qgc3RhcnQgaW4gMTAgc2Vjb25kcyAoZGVidWdCcms6ICR7dGhpcy5faXNFeHRlbnNpb25EZXZEZWJ1Z0Jya30pYCk7XG5cblx0XHRcdFx0Y29uc3QgbXNnID0gdGhpcy5faXNFeHRlbnNpb25EZXZEZWJ1Z0Jya1xuXHRcdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdleHRlbnNpb25Ib3N0LnN0YXJ0dXBGYWlsRGVidWcnLCBcIkV4dGVuc2lvbiBob3N0IGRpZCBub3Qgc3RhcnQgaW4gMTAgc2Vjb25kcywgaXQgbWlnaHQgYmUgc3RvcHBlZCBvbiB0aGUgZmlyc3QgbGluZSBhbmQgbmVlZHMgYSBkZWJ1Z2dlciB0byBjb250aW51ZS5cIilcblx0XHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgnZXh0ZW5zaW9uSG9zdC5zdGFydHVwRmFpbCcsIFwiRXh0ZW5zaW9uIGhvc3QgZGlkIG5vdCBzdGFydCBpbiAxMCBzZWNvbmRzLCB0aGF0IG1pZ2h0IGJlIGEgcHJvYmxlbS5cIik7XG5cblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuV2FybmluZywgbXNnLFxuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdyZWxvYWRXaW5kb3cnLCBcIlJlbG9hZCBXaW5kb3dcIiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuX2hvc3RTZXJ2aWNlLnJlbG9hZCgpXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c3RpY2t5OiB0cnVlLFxuXHRcdFx0XHRcdFx0cHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5LlVSR0VOVFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0KTtcblx0XHRcdH0sIDEwMDAwKTtcblx0XHR9XG5cblx0XHQvLyBJbml0aWFsaXplIGV4dGVuc2lvbiBob3N0IHByb2Nlc3Mgd2l0aCBoYW5kIHNoYWtlc1xuXHRcdGNvbnN0IHByb3RvY29sID0gYXdhaXQgdGhpcy5fZXN0YWJsaXNoUHJvdG9jb2wodGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3MsIG9wdHMpO1xuXHRcdGF3YWl0IHRoaXMuX3BlcmZvcm1IYW5kc2hha2UocHJvdG9jb2wpO1xuXHRcdGNsZWFyVGltZW91dChzdGFydHVwVGltZW91dEhhbmRsZSk7XG5cdFx0cmV0dXJuIHByb3RvY29sO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpbmQgYSBmcmVlIHBvcnQgaWYgZXh0ZW5zaW9uIGhvc3QgZGVidWdnaW5nIGlzIGVuYWJsZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF90cnlGaW5kRGVidWdQb3J0KCk6IFByb21pc2U8bnVtYmVyPiB7XG5cblx0XHRpZiAodHlwZW9mIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5kZWJ1Z0V4dGVuc2lvbkhvc3QucG9ydCAhPT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmRlYnVnRXh0ZW5zaW9uSG9zdC5wb3J0O1xuXHRcdGNvbnN0IHBvcnQgPSBhd2FpdCB0aGlzLl9uYXRpdmVIb3N0U2VydmljZS5maW5kRnJlZVBvcnQoZXhwZWN0ZWQsIDEwIC8qIHRyeSAxMCBwb3J0cyAqLywgNTAwMCAvKiB0cnkgdXAgdG8gNSBzZWNvbmRzICovLCAyMDQ4IC8qIHNraXAgMjA0OCBwb3J0cyBiZXR3ZWVuIGF0dGVtcHRzICovKTtcblxuXHRcdGlmICghdGhpcy5faXNFeHRlbnNpb25EZXZUZXN0RnJvbUNsaSkge1xuXHRcdFx0aWYgKCFwb3J0KSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybignJWNbRXh0ZW5zaW9uIEhvc3RdICVjQ291bGQgbm90IGZpbmQgYSBmcmVlIHBvcnQgZm9yIGRlYnVnZ2luZycsICdjb2xvcjogYmx1ZScsICdjb2xvcjonKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChwb3J0ICE9PSBleHBlY3RlZCkge1xuXHRcdFx0XHRcdGNvbnNvbGUud2FybihgJWNbRXh0ZW5zaW9uIEhvc3RdICVjUHJvdmlkZWQgZGVidWdnaW5nIHBvcnQgJHtleHBlY3RlZH0gaXMgbm90IGZyZWUsIHVzaW5nICR7cG9ydH0gaW5zdGVhZC5gLCAnY29sb3I6IGJsdWUnLCAnY29sb3I6Jyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuX2lzRXh0ZW5zaW9uRGV2RGVidWdCcmspIHtcblx0XHRcdFx0XHRjb25zb2xlLndhcm4oYCVjW0V4dGVuc2lvbiBIb3N0XSAlY1NUT1BQRUQgb24gZmlyc3QgbGluZSBmb3IgZGVidWdnaW5nIG9uIHBvcnQgJHtwb3J0fWAsICdjb2xvcjogYmx1ZScsICdjb2xvcjonKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zb2xlLmRlYnVnKGAlY1tFeHRlbnNpb24gSG9zdF0gJWNkZWJ1Z2dlciBsaXN0ZW5pbmcgb24gcG9ydCAke3BvcnR9YCwgJ2NvbG9yOiBibHVlJywgJ2NvbG9yOicpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBvcnQgfHwgMDtcblx0fVxuXG5cdHByaXZhdGUgX2VzdGFibGlzaFByb3RvY29sKGV4dGVuc2lvbkhvc3RQcm9jZXNzOiBFeHRlbnNpb25Ib3N0UHJvY2Vzcywgb3B0czogSUV4dGVuc2lvbkhvc3RQcm9jZXNzT3B0aW9ucyk6IFByb21pc2U8SU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2w+IHtcblxuXHRcdHdyaXRlRXh0SG9zdENvbm5lY3Rpb24obmV3IE1lc3NhZ2VQb3J0RXh0SG9zdENvbm5lY3Rpb24oKSwgb3B0cy5lbnYpO1xuXG5cdFx0Ly8gR2V0IHJlYWR5IHRvIGFjcXVpcmUgdGhlIG1lc3NhZ2UgcG9ydCBmcm9tIHRoZSBzaGFyZWQgcHJvY2VzcyB3b3JrZXJcblx0XHRjb25zdCBwb3J0UHJvbWlzZSA9IGFjcXVpcmVQb3J0KHVuZGVmaW5lZCAvKiB3ZSB0cmlnZ2VyIHRoZSByZXF1ZXN0IHZpYSBzZXJ2aWNlIGNhbGwhICovLCBvcHRzLnJlc3BvbnNlQ2hhbm5lbCwgb3B0cy5yZXNwb25zZU5vbmNlKTtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxJTWVzc2FnZVBhc3NpbmdQcm90b2NvbD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXG5cdFx0XHRjb25zdCBoYW5kbGUgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0cmVqZWN0KCdUaGUgbG9jYWwgZXh0ZW5zaW9uIGhvc3QgdG9vayBsb25nZXIgdGhhbiA2MHMgdG8gY29ubmVjdC4nKTtcblx0XHRcdH0sIDYwICogMTAwMCk7XG5cblx0XHRcdHBvcnRQcm9taXNlLnRoZW4oKHBvcnQpID0+IHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0XHQvLyBDbG9zZSB0aGUgbWVzc2FnZSBwb3J0IHdoZW4gdGhlIGV4dGVuc2lvbiBob3N0IGlzIGRpc3Bvc2VkXG5cdFx0XHRcdFx0cG9ydC5jbG9zZSgpO1xuXHRcdFx0XHRcdHBvcnQub25tZXNzYWdlID0gbnVsbDtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRjbGVhclRpbWVvdXQoaGFuZGxlKTtcblxuXHRcdFx0XHRjb25zdCBvbk1lc3NhZ2UgPSBuZXcgQnVmZmVyZWRFbWl0dGVyPFZTQnVmZmVyPigpO1xuXHRcdFx0XHRwb3J0Lm9ubWVzc2FnZSA9ICgoZSkgPT4ge1xuXHRcdFx0XHRcdGlmIChlLmRhdGEpIHtcblx0XHRcdFx0XHRcdG9uTWVzc2FnZS5maXJlKFZTQnVmZmVyLndyYXAoZS5kYXRhKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cG9ydC5zdGFydCgpO1xuXG5cdFx0XHRcdHJlc29sdmUoe1xuXHRcdFx0XHRcdG9uTWVzc2FnZTogb25NZXNzYWdlLmV2ZW50LFxuXHRcdFx0XHRcdHNlbmQ6IG1lc3NhZ2UgPT4gcG9ydC5wb3N0TWVzc2FnZShtZXNzYWdlLmJ1ZmZlciksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIE5vdyB0aGF0IHRoZSBtZXNzYWdlIHBvcnQgbGlzdGVuZXIgaXMgaW5zdGFsbGVkLCBzdGFydCB0aGUgZXh0IGhvc3QgcHJvY2Vzc1xuXHRcdFx0Y29uc3Qgc3cgPSBTdG9wV2F0Y2guY3JlYXRlKGZhbHNlKTtcblx0XHRcdGV4dGVuc2lvbkhvc3RQcm9jZXNzLnN0YXJ0KG9wdHMpLnRoZW4oKHsgcGlkIH0pID0+IHtcblx0XHRcdFx0aWYgKHBpZCkge1xuXHRcdFx0XHRcdHRoaXMucGlkID0gcGlkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgU3RhcnRlZCBsb2NhbCBleHRlbnNpb24gaG9zdCB3aXRoIHBpZCAke3BpZH0uYCk7XG5cdFx0XHRcdGNvbnN0IGR1cmF0aW9uID0gc3cuZWxhcHNlZCgpO1xuXHRcdFx0XHRpZiAocGxhdGZvcm0uaXNDSSkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgSUV4dGVuc2lvbkhvc3RTdGFydGVyLnN0YXJ0KCkgdG9vayAke2R1cmF0aW9ufSBtcy5gKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgKGVycikgPT4ge1xuXHRcdFx0XHQvLyBTdGFydGluZyB0aGUgZXh0IGhvc3QgcHJvY2VzcyByZXN1bHRlZCBpbiBhbiBlcnJvclxuXHRcdFx0XHRyZWplY3QoZXJyKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGVyZm9ybUhhbmRzaGFrZShwcm90b2NvbDogSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyAxKSB3YWl0IGZvciB0aGUgaW5jb21pbmcgYHJlYWR5YCBldmVudCBhbmQgc2VuZCB0aGUgaW5pdGlhbGl6YXRpb24gZGF0YS5cblx0XHQvLyAyKSB3YWl0IGZvciB0aGUgaW5jb21pbmcgYGluaXRpYWxpemVkYCBldmVudC5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXG5cdFx0XHRsZXQgdGltZW91dEhhbmRsZTogVGltZW91dDtcblx0XHRcdGNvbnN0IGluc3RhbGxUaW1lb3V0Q2hlY2sgPSAoKSA9PiB7XG5cdFx0XHRcdHRpbWVvdXRIYW5kbGUgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRyZWplY3QoJ1RoZSBsb2NhbCBleHRlbnNpb24gaG9zdCB0b29rIGxvbmdlciB0aGFuIDYwcyB0byBzZW5kIGl0cyByZWFkeSBtZXNzYWdlLicpO1xuXHRcdFx0XHR9LCA2MCAqIDEwMDApO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHVuaW5zdGFsbFRpbWVvdXRDaGVjayA9ICgpID0+IHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVvdXRIYW5kbGUpO1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gV2FpdCA2MHMgZm9yIHRoZSByZWFkeSBtZXNzYWdlXG5cdFx0XHRpbnN0YWxsVGltZW91dENoZWNrKCk7XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBwcm90b2NvbC5vbk1lc3NhZ2UobXNnID0+IHtcblxuXHRcdFx0XHRpZiAoaXNNZXNzYWdlT2ZUeXBlKG1zZywgTWVzc2FnZVR5cGUuUmVhZHkpKSB7XG5cblx0XHRcdFx0XHQvLyAxKSBFeHRlbnNpb24gSG9zdCBpcyByZWFkeSB0byByZWNlaXZlIG1lc3NhZ2VzLCBpbml0aWFsaXplIGl0XG5cdFx0XHRcdFx0dW5pbnN0YWxsVGltZW91dENoZWNrKCk7XG5cblx0XHRcdFx0XHR0aGlzLl9jcmVhdGVFeHRIb3N0SW5pdERhdGEoKS50aGVuKGRhdGEgPT4ge1xuXG5cdFx0XHRcdFx0XHQvLyBXYWl0IDYwcyBmb3IgdGhlIGluaXRpYWxpemVkIG1lc3NhZ2Vcblx0XHRcdFx0XHRcdGluc3RhbGxUaW1lb3V0Q2hlY2soKTtcblxuXHRcdFx0XHRcdFx0cHJvdG9jb2wuc2VuZChWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KGRhdGEpKSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGlzTWVzc2FnZU9mVHlwZShtc2csIE1lc3NhZ2VUeXBlLkluaXRpYWxpemVkKSkge1xuXG5cdFx0XHRcdFx0Ly8gMikgRXh0ZW5zaW9uIEhvc3QgaXMgaW5pdGlhbGl6ZWRcblx0XHRcdFx0XHR1bmluc3RhbGxUaW1lb3V0Q2hlY2soKTtcblxuXHRcdFx0XHRcdC8vIHN0b3AgbGlzdGVuaW5nIGZvciBtZXNzYWdlcyBoZXJlXG5cdFx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cblx0XHRcdFx0XHQvLyByZWxlYXNlIHRoaXMgcHJvbWlzZVxuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zb2xlLmVycm9yKGByZWNlaXZlZCB1bmV4cGVjdGVkIG1lc3NhZ2UgZHVyaW5nIGhhbmRzaGFrZSBwaGFzZSBmcm9tIHRoZSBleHRlbnNpb24gaG9zdDogYCwgbXNnKTtcblx0XHRcdH0pO1xuXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVFeHRIb3N0SW5pdERhdGEoKTogUHJvbWlzZTxJRXh0ZW5zaW9uSG9zdEluaXREYXRhPiB7XG5cdFx0Y29uc3QgaW5pdERhdGEgPSBhd2FpdCB0aGlzLl9pbml0RGF0YVByb3ZpZGVyLmdldEluaXREYXRhKCk7XG5cdFx0dGhpcy5leHRlbnNpb25zID0gaW5pdERhdGEuZXh0ZW5zaW9ucztcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLl9jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRjb25zdCBlbmFibGVkQXBpUHJvcG9zYWxzRmFsbGJhY2sgPSBhd2FpdCByZXNvbHZlRW5hYmxlZEFwaVByb3Bvc2Fsc0ZhbGxiYWNrRXhwZXJpbWVudCh0aGlzLl93b3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSwgdGhpcy5fcHJvZHVjdFNlcnZpY2UucXVhbGl0eSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbW1pdDogdGhpcy5fcHJvZHVjdFNlcnZpY2UuY29tbWl0LFxuXHRcdFx0dmVyc2lvbjogdGhpcy5fcHJvZHVjdFNlcnZpY2UudmVyc2lvbixcblx0XHRcdHF1YWxpdHk6IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnF1YWxpdHksXG5cdFx0XHRkYXRlOiB0aGlzLl9wcm9kdWN0U2VydmljZS5kYXRlLFxuXHRcdFx0cGFyZW50UGlkOiAwLFxuXHRcdFx0ZW5hYmxlZEFwaVByb3Bvc2Fsc0ZhbGxiYWNrLFxuXHRcdFx0ZW52aXJvbm1lbnQ6IHtcblx0XHRcdFx0aXNFeHRlbnNpb25EZXZlbG9wbWVudERlYnVnOiB0aGlzLl9pc0V4dGVuc2lvbkRldkRlYnVnLFxuXHRcdFx0XHRhcHBSb290OiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXBwUm9vdCA/IFVSSS5maWxlKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcHBSb290KSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0YXBwTmFtZTogdGhpcy5fcHJvZHVjdFNlcnZpY2UubmFtZUxvbmcsXG5cdFx0XHRcdGFwcEhvc3Q6ICh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdyA/IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmFnZW50c1RlbGVtZXRyeUFwcE5hbWUgOiB1bmRlZmluZWQpIHx8IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmVtYmVkZGVySWRlbnRpZmllciB8fCAnZGVza3RvcCcsXG5cdFx0XHRcdGFwcFVyaVNjaGVtZTogdGhpcy5fcHJvZHVjdFNlcnZpY2UudXJsUHJvdG9jb2wsXG5cdFx0XHRcdGlzRXh0ZW5zaW9uVGVsZW1ldHJ5TG9nZ2luZ09ubHk6IGlzTG9nZ2luZ09ubHkodGhpcy5fcHJvZHVjdFNlcnZpY2UsIHRoaXMuX2Vudmlyb25tZW50U2VydmljZSksXG5cdFx0XHRcdGlzUG9ydGFibGU6IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5pc1BvcnRhYmxlLFxuXHRcdFx0XHRhcHBMYW5ndWFnZTogcGxhdGZvcm0ubGFuZ3VhZ2UsXG5cdFx0XHRcdGV4dGVuc2lvbkRldmVsb3BtZW50TG9jYXRpb25VUkk6IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5leHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9uVVJJLFxuXHRcdFx0XHRleHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJOiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSxcblx0XHRcdFx0Z2xvYmFsU3RvcmFnZUhvbWU6IHRoaXMuX3VzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmdsb2JhbFN0b3JhZ2VIb21lLFxuXHRcdFx0XHR3b3Jrc3BhY2VTdG9yYWdlSG9tZTogdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLndvcmtzcGFjZVN0b3JhZ2VIb21lLFxuXHRcdFx0XHRleHRlbnNpb25Mb2dMZXZlbDogdGhpcy5fZGVmYXVsdExvZ0xldmVsc1NlcnZpY2UuZGVmYXVsdExvZ0xldmVscy5leHRlbnNpb25zLFxuXHRcdFx0XHRpc1Nlc3Npb25zV2luZG93OiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvd1xuXHRcdFx0fSxcblx0XHRcdHdvcmtzcGFjZTogdGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFkgPyB1bmRlZmluZWQgOiB7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHdvcmtzcGFjZS5jb25maWd1cmF0aW9uID8/IHVuZGVmaW5lZCxcblx0XHRcdFx0aWQ6IHdvcmtzcGFjZS5pZCxcblx0XHRcdFx0bmFtZTogdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFdvcmtzcGFjZUxhYmVsKHdvcmtzcGFjZSksXG5cdFx0XHRcdGlzVW50aXRsZWQ6IHdvcmtzcGFjZS5jb25maWd1cmF0aW9uID8gaXNVbnRpdGxlZFdvcmtzcGFjZSh3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiwgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlKSA6IGZhbHNlLFxuXHRcdFx0XHR0cmFuc2llbnQ6IHdvcmtzcGFjZS50cmFuc2llbnRcblx0XHRcdH0sXG5cdFx0XHRyZW1vdGU6IHtcblx0XHRcdFx0YXV0aG9yaXR5OiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0XHRjb25uZWN0aW9uRGF0YTogbnVsbCxcblx0XHRcdFx0aXNSZW1vdGU6IGZhbHNlXG5cdFx0XHR9LFxuXHRcdFx0Y29uc29sZUZvcndhcmQ6IHtcblx0XHRcdFx0aW5jbHVkZVN0YWNrOiAhdGhpcy5faXNFeHRlbnNpb25EZXZUZXN0RnJvbUNsaSAmJiAodGhpcy5faXNFeHRlbnNpb25EZXZIb3N0IHx8ICF0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCB8fCB0aGlzLl9wcm9kdWN0U2VydmljZS5xdWFsaXR5ICE9PSAnc3RhYmxlJyB8fCB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UudmVyYm9zZSksXG5cdFx0XHRcdGxvZ05hdGl2ZTogIXRoaXMuX2lzRXh0ZW5zaW9uRGV2VGVzdEZyb21DbGkgJiYgdGhpcy5faXNFeHRlbnNpb25EZXZIb3N0XG5cdFx0XHR9LFxuXHRcdFx0ZXh0ZW5zaW9uczogdGhpcy5leHRlbnNpb25zLnRvU25hcHNob3QoKSxcblx0XHRcdHRlbGVtZXRyeUluZm86IHtcblx0XHRcdFx0c2Vzc2lvbklkOiB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnNlc3Npb25JZCxcblx0XHRcdFx0bWFjaGluZUlkOiB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLm1hY2hpbmVJZCxcblx0XHRcdFx0c3FtSWQ6IHRoaXMuX3RlbGVtZXRyeVNlcnZpY2Uuc3FtSWQsXG5cdFx0XHRcdGRldkRldmljZUlkOiB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLmRldkRldmljZUlkID8/IHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UubWFjaGluZUlkLFxuXHRcdFx0XHRmaXJzdFNlc3Npb25EYXRlOiB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLmZpcnN0U2Vzc2lvbkRhdGUsXG5cdFx0XHRcdG1zZnRJbnRlcm5hbDogdGhpcy5fdGVsZW1ldHJ5U2VydmljZS5tc2Z0SW50ZXJuYWxcblx0XHRcdH0sXG5cdFx0XHRyZW1vdGVFeHRlbnNpb25UaXBzOiB0aGlzLl9wcm9kdWN0U2VydmljZS5yZW1vdGVFeHRlbnNpb25UaXBzLFxuXHRcdFx0dmlydHVhbFdvcmtzcGFjZUV4dGVuc2lvblRpcHM6IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnZpcnR1YWxXb3Jrc3BhY2VFeHRlbnNpb25UaXBzLFxuXHRcdFx0bG9nTGV2ZWw6IHRoaXMuX2xvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSxcblx0XHRcdGxvZ2dlcnM6IFsuLi50aGlzLl9sb2dnZXJTZXJ2aWNlLmdldFJlZ2lzdGVyZWRMb2dnZXJzKCldLFxuXHRcdFx0bG9nc0xvY2F0aW9uOiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuZXh0SG9zdExvZ3NQYXRoLFxuXHRcdFx0YXV0b1N0YXJ0OiAodGhpcy5zdGFydHVwID09PSBFeHRlbnNpb25Ib3N0U3RhcnR1cC5FYWdlckF1dG9TdGFydCksXG5cdFx0XHR1aUtpbmQ6IFVJS2luZC5EZXNrdG9wLFxuXHRcdFx0aGFuZGxlOiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2Uud2luZG93LmhhbmRsZSA/IGVuY29kZUJhc2U2NCh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2Uud2luZG93LmhhbmRsZSkgOiB1bmRlZmluZWRcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfb25FeHRIb3N0UHJvY2Vzc0V4aXQoY29kZTogbnVtYmVyLCBzaWduYWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl90ZXJtaW5hdGluZykge1xuXHRcdFx0Ly8gRXhwZWN0ZWQgdGVybWluYXRpb24gcGF0aCAod2UgYXNrZWQgdGhlIHByb2Nlc3MgdG8gdGVybWluYXRlKVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRXhpdC5maXJlKFtjb2RlLCBzaWduYWxdKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVByb2Nlc3NPdXRwdXRTdHJlYW0oc3RyZWFtOiBFdmVudDxzdHJpbmc+KSB7XG5cdFx0bGV0IGxhc3QgPSAnJztcblx0XHRsZXQgaXNPbWl0dGluZyA9IGZhbHNlO1xuXHRcdGNvbnN0IGV2ZW50ID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXHRcdHN0cmVhbSgoY2h1bmspID0+IHtcblx0XHRcdC8vIG5vdCBhIGZhbmN5IGFwcHJvYWNoLCBidXQgdGhpcyBpcyB0aGUgc2FtZSBhcHByb2FjaCB1c2VkIGJ5IHRoZSBzcGxpdDJcblx0XHRcdC8vIG1vZHVsZSB3aGljaCBpcyB3ZWxsLW9wdGltaXplZCAoaHR0cHM6Ly9naXRodWIuY29tL21jb2xsaW5hL3NwbGl0Milcblx0XHRcdGxhc3QgKz0gY2h1bms7XG5cdFx0XHRjb25zdCBsaW5lcyA9IGxhc3Quc3BsaXQoL1xccj9cXG4vZyk7XG5cdFx0XHRsYXN0ID0gbGluZXMucG9wKCkhO1xuXG5cdFx0XHQvLyBwcm90ZWN0ZWQgYWdhaW5zdCBhbiBleHRlbnNpb24gc3BhbW1pbmcgYW5kIGxlYWtpbmcgbWVtb3J5IGlmIG5vIG5ldyBsaW5lIGlzIHdyaXR0ZW4uXG5cdFx0XHRpZiAobGFzdC5sZW5ndGggPiAxMF8wMDApIHtcblx0XHRcdFx0bGluZXMucHVzaChsYXN0KTtcblx0XHRcdFx0bGFzdCA9ICcnO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcblx0XHRcdFx0aWYgKGlzT21pdHRpbmcpIHtcblx0XHRcdFx0XHRpZiAobGluZSA9PT0gTmF0aXZlTG9nTWFya2Vycy5FbmQpIHtcblx0XHRcdFx0XHRcdGlzT21pdHRpbmcgPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAobGluZSA9PT0gTmF0aXZlTG9nTWFya2Vycy5TdGFydCkge1xuXHRcdFx0XHRcdGlzT21pdHRpbmcgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGxpbmUubGVuZ3RoKSB7XG5cdFx0XHRcdFx0ZXZlbnQuZmlyZShsaW5lICsgJ1xcbicpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSwgdW5kZWZpbmVkLCB0aGlzLl9zdG9yZSk7XG5cblx0XHRyZXR1cm4gZXZlbnQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZW5hYmxlSW5zcGVjdFBvcnQoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCEhdGhpcy5faW5zcGVjdExpc3RlbmVyKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3MuZW5hYmxlSW5zcGVjdFBvcnQoKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGF3YWl0IFByb21pc2UucmFjZShbRXZlbnQudG9Qcm9taXNlKHRoaXMuX29uRGlkU2V0SW5zcGVjdFBvcnQuZXZlbnQpLCB0aW1lb3V0KDEwMDApXSk7XG5cdFx0cmV0dXJuICEhdGhpcy5faW5zcGVjdExpc3RlbmVyO1xuXHR9XG5cblx0cHVibGljIGdldEluc3BlY3RQb3J0KCk6IElFeHRlbnNpb25JbnNwZWN0SW5mbyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2luc3BlY3RMaXN0ZW5lciA/PyB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9vbldpbGxTaHV0ZG93bihldmVudDogV2lsbFNodXRkb3duRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9tYWluUHJvY2Vzc0hhbmRsZXNFeHRIb3N0U2h1dGRvd24gPSB0cnVlO1xuXG5cdFx0Ly8gSWYgdGhlIGV4dGVuc2lvbiBkZXZlbG9wbWVudCBob3N0IHdhcyBzdGFydGVkIHdpdGhvdXQgZGVidWdnZXIgYXR0YWNoZWQgd2UgbmVlZFxuXHRcdC8vIHRvIGNvbW11bmljYXRlIHRoaXMgYmFjayB0byB0aGUgbWFpbiBzaWRlIHRvIHRlcm1pbmF0ZSB0aGUgZGVidWcgc2Vzc2lvblxuXHRcdGlmICh0aGlzLl9pc0V4dGVuc2lvbkRldkhvc3QgJiYgIXRoaXMuX2lzRXh0ZW5zaW9uRGV2VGVzdEZyb21DbGkgJiYgIXRoaXMuX2lzRXh0ZW5zaW9uRGV2RGVidWcgJiYgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmRlYnVnRXh0ZW5zaW9uSG9zdC5kZWJ1Z0lkKSB7XG5cdFx0XHR0aGlzLl9leHRlbnNpb25Ib3N0RGVidWdTZXJ2aWNlLnRlcm1pbmF0ZVNlc3Npb24odGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmRlYnVnRXh0ZW5zaW9uSG9zdC5kZWJ1Z0lkKTtcblx0XHRcdGV2ZW50LmpvaW4odGltZW91dCgxMDAgLyogd2FpdCBhIGJpdCBmb3IgSVBDIHRvIGdldCBkZWxpdmVyZWQgKi8pLCB7IGlkOiAnam9pbi5leHRlbnNpb25EZXZlbG9wbWVudCcsIGxhYmVsOiBubHMubG9jYWxpemUoJ2pvaW4uZXh0ZW5zaW9uRGV2ZWxvcG1lbnQnLCBcIlRlcm1pbmF0aW5nIGV4dGVuc2lvbiBkZWJ1ZyBzZXNzaW9uXCIpIH0pO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxjQUFjLGdCQUFnQjtBQUN2QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksb0JBQW9CO0FBQ3pDLFlBQVksYUFBYTtBQUN6QixZQUFZLGNBQWM7QUFDMUIsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBQzVCLFlBQVksU0FBUztBQUNyQixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDBCQUF3RCw2QkFBNkI7QUFDOUYsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQixzQkFBc0IsZ0JBQWdCO0FBQ3JFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMEJBQTBCLGdCQUFnQiwyQkFBMkI7QUFDOUUsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw4QkFBOEIsOEJBQThCO0FBQ3JFLFNBQVMscUJBQTZDLGFBQWEsa0JBQWtCLFFBQVEsdUJBQXVCO0FBRXBILFNBQWtDLHNCQUE2RCxvREFBb0Q7QUFDbkosU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBNEM7QUFDckQs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
