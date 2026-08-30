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
import * as fs from "fs";
import { exec } from "child_process";
import { timeout } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import * as path from "../../../base/common/path.js";
import { isLinux, isMacintosh, isWindows } from "../../../base/common/platform.js";
import { findExecutable } from "../../../base/node/processes.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { ILogService, LogLevel } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { FlowControlConstants, ProcessPropertyType, PosixShellType, GeneralShellType } from "../common/terminal.js";
import { ChildProcessMonitor } from "./childProcessMonitor.js";
import { getShellIntegrationInjection, sanitizeEnvForLogging } from "./terminalEnvironment.js";
import { WindowsShellHelper } from "./windowsShellHelper.js";
import { spawn } from "node-pty";
import { isNumber } from "../../../base/common/types.js";
import { getWindowsBuildNumberSync } from "../../../base/node/windowsVersion.js";
var ShutdownConstants = /* @__PURE__ */ ((ShutdownConstants2) => {
  ShutdownConstants2[ShutdownConstants2["DataFlushTimeout"] = 250] = "DataFlushTimeout";
  ShutdownConstants2[ShutdownConstants2["MaximumShutdownTime"] = 5e3] = "MaximumShutdownTime";
  return ShutdownConstants2;
})(ShutdownConstants || {});
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["KillSpawnThrottleInterval"] = 250] = "KillSpawnThrottleInterval";
  Constants2[Constants2["KillSpawnSpacingDuration"] = 50] = "KillSpawnSpacingDuration";
  return Constants2;
})(Constants || {});
const posixShellTypeMap = /* @__PURE__ */ new Map([
  ["bash", PosixShellType.Bash],
  ["csh", PosixShellType.Csh],
  ["fish", PosixShellType.Fish],
  ["ksh", PosixShellType.Ksh],
  ["sh", PosixShellType.Sh],
  ["zsh", PosixShellType.Zsh]
]);
const generalShellTypeMap = /* @__PURE__ */ new Map([
  ["claude", GeneralShellType.Claude],
  ["codex", GeneralShellType.Codex],
  ["commandcode", GeneralShellType.CommandCode],
  ["copilot", GeneralShellType.Copilot],
  ["gemini", GeneralShellType.Gemini],
  ["pwsh", GeneralShellType.PowerShell],
  ["powershell", GeneralShellType.PowerShell],
  ["python", GeneralShellType.Python],
  ["julia", GeneralShellType.Julia],
  ["nu", GeneralShellType.NuShell],
  ["node", GeneralShellType.Node],
  ["xonsh", GeneralShellType.Xonsh]
]);
let TerminalProcess = class extends Disposable {
  constructor(shellLaunchConfig, cwd, cols, rows, env, _executableEnv, _options, _logService, _productService) {
    super();
    this.shellLaunchConfig = shellLaunchConfig;
    this._executableEnv = _executableEnv;
    this._options = _options;
    this._logService = _logService;
    this._productService = _productService;
    this.id = 0;
    this.shouldPersist = false;
    this._properties = {
      cwd: "",
      initialCwd: "",
      fixedDimensions: { cols: void 0, rows: void 0 },
      title: "",
      shellType: void 0,
      hasChildProcesses: true,
      resolvedShellLaunchConfig: {},
      overrideDimensions: void 0,
      failedShellIntegrationActivation: false,
      usedShellIntegrationInjection: void 0,
      shellIntegrationInjectionFailureReason: void 0
    };
    this._currentTitle = "";
    this._isPtyPaused = false;
    this._unacknowledgedCharCount = 0;
    this._onProcessData = this._register(new Emitter());
    this.onProcessData = this._onProcessData.event;
    this._onProcessReady = this._register(new Emitter());
    this.onProcessReady = this._onProcessReady.event;
    this._onDidChangeProperty = this._register(new Emitter());
    this.onDidChangeProperty = this._onDidChangeProperty.event;
    this._onProcessExit = this._register(new Emitter());
    this.onProcessExit = this._onProcessExit.event;
    let name;
    if (isWindows) {
      name = path.basename(this.shellLaunchConfig.executable || "");
    } else {
      name = "xterm-256color";
    }
    this._initialCwd = cwd;
    this._properties[ProcessPropertyType.InitialCwd] = this._initialCwd;
    this._properties[ProcessPropertyType.Cwd] = this._initialCwd;
    const useConpty = process.platform === "win32" && getWindowsBuildNumberSync() >= 18309;
    const useConptyDll = useConpty && this._options.windowsUseConptyDll;
    this._ptyOptions = {
      name,
      cwd,
      // TODO: When node-pty is updated this cast can be removed
      env,
      cols,
      rows,
      useConpty,
      useConptyDll,
      // This option will force conpty to not redraw the whole viewport on launch
      conptyInheritCursor: useConpty && !!shellLaunchConfig.initialText
    };
    if (isWindows) {
      if (useConpty && cols === 0 && rows === 0 && this.shellLaunchConfig.executable?.endsWith("Git\\bin\\bash.exe")) {
        this._delayedResizer = this._register(new DelayedResizer());
        this._register(this._delayedResizer.onTrigger((dimensions) => {
          this._delayedResizer?.dispose();
          this._delayedResizer = void 0;
          if (dimensions.cols && dimensions.rows) {
            this.resize(dimensions.cols, dimensions.rows);
          }
        }));
      }
      this._register(this.onProcessReady((e) => {
        this._windowsShellHelper = this._register(new WindowsShellHelper(e.pid));
        this._register(this._windowsShellHelper.onShellTypeChanged((e2) => this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellType, value: e2 })));
        this._register(this._windowsShellHelper.onShellNameChanged((e2) => this._onDidChangeProperty.fire({ type: ProcessPropertyType.Title, value: e2 })));
      }));
    }
    this._register(toDisposable(() => {
      if (this._titleInterval) {
        clearInterval(this._titleInterval);
        this._titleInterval = void 0;
      }
    }));
    this._register(toDisposable(() => {
      this._ptyProcess = void 0;
      this._processStartupComplete = void 0;
    }));
  }
  get exitMessage() {
    return this._exitMessage;
  }
  get currentTitle() {
    return this._windowsShellHelper?.shellTitle || this._currentTitle;
  }
  get shellType() {
    return isWindows ? this._windowsShellHelper?.shellType : posixShellTypeMap.get(this._currentTitle) || generalShellTypeMap.get(this._currentTitle);
  }
  get hasChildProcesses() {
    return this._childProcessMonitor?.hasChildProcesses || false;
  }
  async start() {
    const results = await Promise.all([this._validateCwd(), this._validateExecutable()]);
    const firstError = results.find((r) => r !== void 0);
    if (firstError) {
      return firstError;
    }
    const injection = await getShellIntegrationInjection(this.shellLaunchConfig, this._options, this._ptyOptions.env, this._logService, this._productService);
    if (injection.type === "injection") {
      this._onDidChangeProperty.fire({ type: ProcessPropertyType.UsedShellIntegrationInjection, value: true });
      if (injection.envMixin) {
        for (const [key, value] of Object.entries(injection.envMixin)) {
          this._ptyOptions.env ||= {};
          this._ptyOptions.env[key] = value;
        }
      }
      if (injection.filesToCopy) {
        for (const f of injection.filesToCopy) {
          try {
            await fs.promises.mkdir(path.dirname(f.dest), { recursive: true });
            await fs.promises.copyFile(f.source, f.dest);
          } catch {
          }
        }
      }
    } else {
      this._onDidChangeProperty.fire({ type: ProcessPropertyType.FailedShellIntegrationActivation, value: true });
      this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellIntegrationInjectionFailureReason, value: injection.reason });
      if (this._options.shellIntegration.nonce) {
        this._ptyOptions.env ||= {};
        this._ptyOptions.env["VSCODE_NONCE"] = this._options.shellIntegration.nonce;
      }
    }
    try {
      const injectionConfig = injection.type === "injection" ? injection : void 0;
      await this.setupPtyProcess(this.shellLaunchConfig, this._ptyOptions, injectionConfig);
      if (injectionConfig?.newArgs) {
        return { injectedArgs: injectionConfig.newArgs };
      }
      return void 0;
    } catch (err) {
      this._logService.trace("node-pty.node-pty.IPty#spawn native exception", err);
      const errorMessage = err.message;
      if (errorMessage?.includes("Cannot launch conpty")) {
        return { message: localize("conptyLaunchFailed", "A native exception occurred during launch (Cannot launch conpty). Winpty has been removed, see {0} for more details. You can also try enabling the `{1}` setting.", "https://code.visualstudio.com/updates/v1_109#_removal-of-winpty-support", "terminal.integrated.windowsUseConptyDll") };
      }
      return { message: `A native exception occurred during launch (${errorMessage})` };
    }
  }
  async _validateCwd() {
    try {
      const result = await fs.promises.stat(this._initialCwd);
      if (!result.isDirectory()) {
        return { message: localize("launchFail.cwdNotDirectory", 'Starting directory (cwd) "{0}" is not a directory', this._initialCwd.toString()) };
      }
    } catch (err) {
      if (err?.code === "ENOENT") {
        return { message: localize("launchFail.cwdDoesNotExist", 'Starting directory (cwd) "{0}" does not exist', this._initialCwd.toString()) };
      }
    }
    this._onDidChangeProperty.fire({ type: ProcessPropertyType.InitialCwd, value: this._initialCwd });
    return void 0;
  }
  async _validateExecutable() {
    const slc = this.shellLaunchConfig;
    if (!slc.executable) {
      throw new Error("IShellLaunchConfig.executable not set");
    }
    const cwd = slc.cwd instanceof URI ? slc.cwd.path : slc.cwd;
    const envPaths = slc.env && slc.env.PATH ? slc.env.PATH.split(path.delimiter) : void 0;
    const executable = await findExecutable(slc.executable, cwd, envPaths, this._executableEnv);
    if (!executable) {
      return { message: localize("launchFail.executableDoesNotExist", 'Path to shell executable "{0}" does not exist', slc.executable) };
    }
    try {
      const result = await fs.promises.stat(executable);
      if (!result.isFile() && !result.isSymbolicLink()) {
        return { message: localize("launchFail.executableIsNotFileOrSymlink", 'Path to shell executable "{0}" is not a file or a symlink', slc.executable) };
      }
      slc.executable = executable;
    } catch (err) {
      if (err?.code === "EACCES") {
      } else {
        throw err;
      }
    }
    return void 0;
  }
  async setupPtyProcess(shellLaunchConfig, options, shellIntegrationInjection) {
    const args = shellIntegrationInjection?.newArgs || shellLaunchConfig.args || [];
    await this._throttleKillSpawn();
    const sanitizedOptions = { ...options, env: sanitizeEnvForLogging(options.env) };
    this._logService.trace("node-pty.IPty#spawn", shellLaunchConfig.executable, args, sanitizedOptions);
    const ptyProcess = spawn(shellLaunchConfig.executable, args, options);
    this._ptyProcess = ptyProcess;
    this._childProcessMonitor = this._register(new ChildProcessMonitor(ptyProcess.pid, this._logService));
    this._register(this._childProcessMonitor.onDidChangeHasChildProcesses((value) => this._onDidChangeProperty.fire({ type: ProcessPropertyType.HasChildProcesses, value })));
    this._processStartupComplete = new Promise((c) => {
      this._register(this.onProcessReady(() => c()));
    });
    this._register(ptyProcess.onData((data) => {
      this._unacknowledgedCharCount += data.length;
      if (!this._isPtyPaused && this._unacknowledgedCharCount > FlowControlConstants.HighWatermarkChars) {
        this._logService.trace(`Flow control: Pause (${this._unacknowledgedCharCount} > ${FlowControlConstants.HighWatermarkChars})`);
        this._isPtyPaused = true;
        ptyProcess.pause();
      }
      this._logService.trace("node-pty.IPty#onData", data);
      this._onProcessData.fire(data);
      if (this._closeTimeout) {
        this._queueProcessExit();
      }
      this._windowsShellHelper?.checkShell();
      this._childProcessMonitor?.handleOutput();
    }));
    this._register(ptyProcess.onExit((e) => {
      this._exitCode = e.exitCode;
      this._queueProcessExit();
    }));
    if (ptyProcess.pid > 0) {
      this._sendProcessId(ptyProcess.pid);
    } else {
      const dataListener = ptyProcess.onData(() => {
        dataListener.dispose();
        this._childProcessMonitor?.setPid(ptyProcess.pid);
        this._sendProcessId(ptyProcess.pid);
      });
      this._register(dataListener);
    }
    this._setupTitlePolling(ptyProcess);
  }
  _setupTitlePolling(ptyProcess) {
    setTimeout(() => this._sendProcessTitle(ptyProcess));
    if (!isWindows) {
      this._titleInterval = setInterval(() => {
        if (this._currentTitle !== ptyProcess.process) {
          this._sendProcessTitle(ptyProcess);
        }
      }, 200);
    }
  }
  // Allow any trailing data events to be sent before the exit event is sent.
  // See https://github.com/microsoft/node-pty/issues/72
  _queueProcessExit() {
    if (this._logService.getLevel() === LogLevel.Trace) {
      this._logService.trace("TerminalProcess#_queueProcessExit", new Error().stack?.replace(/^Error/, ""));
    }
    if (this._closeTimeout) {
      clearTimeout(this._closeTimeout);
    }
    this._closeTimeout = setTimeout(() => {
      this._closeTimeout = void 0;
      this._kill();
    }, 250 /* DataFlushTimeout */);
  }
  async _kill() {
    await this._processStartupComplete;
    if (this._store.isDisposed) {
      return;
    }
    try {
      if (this._ptyProcess) {
        await this._throttleKillSpawn();
        this._logService.trace("node-pty.IPty#kill");
        this._ptyProcess.kill();
      }
    } catch (ex) {
    }
    this._onProcessExit.fire(this._exitCode || 0);
    this.dispose();
  }
  async _throttleKillSpawn() {
    if (!isWindows || !hasConptyOption(this._ptyOptions) || !this._ptyOptions.useConpty) {
      return;
    }
    if (this._ptyOptions.useConptyDll) {
      return;
    }
    while (Date.now() - TerminalProcess._lastKillOrStart < 250 /* KillSpawnThrottleInterval */) {
      this._logService.trace("Throttling kill/spawn call");
      await timeout(250 /* KillSpawnThrottleInterval */ - (Date.now() - TerminalProcess._lastKillOrStart) + 50 /* KillSpawnSpacingDuration */);
    }
    TerminalProcess._lastKillOrStart = Date.now();
  }
  _sendProcessId(pid) {
    this._onProcessReady.fire({
      pid,
      cwd: this._initialCwd,
      windowsPty: this.getWindowsPty()
    });
  }
  _sendProcessTitle(ptyProcess) {
    if (this._store.isDisposed) {
      return;
    }
    this._currentTitle = ptyProcess.process ?? "";
    this._onDidChangeProperty.fire({ type: ProcessPropertyType.Title, value: this._currentTitle });
    let sanitizedTitle = this.currentTitle.replace(/ \(figterm\)$/g, "");
    if (!isWindows) {
      sanitizedTitle = path.basename(sanitizedTitle);
    }
    if (sanitizedTitle.toLowerCase().startsWith("python")) {
      this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellType, value: GeneralShellType.Python });
    } else if (sanitizedTitle.toLowerCase().startsWith("julia")) {
      this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellType, value: GeneralShellType.Julia });
    } else {
      const shellTypeValue = posixShellTypeMap.get(sanitizedTitle) || generalShellTypeMap.get(sanitizedTitle);
      this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellType, value: shellTypeValue });
    }
  }
  shutdown(immediate) {
    if (this._logService.getLevel() === LogLevel.Trace) {
      this._logService.trace("TerminalProcess#shutdown", new Error().stack?.replace(/^Error/, ""));
    }
    if (immediate && !isWindows) {
      this._kill();
    } else {
      if (!this._closeTimeout && !this._store.isDisposed) {
        this._queueProcessExit();
        setTimeout(() => {
          if (this._closeTimeout && !this._store.isDisposed) {
            this._closeTimeout = void 0;
            this._kill();
          }
        }, 5e3 /* MaximumShutdownTime */);
      }
    }
  }
  input(data, isBinary = false) {
    this._logService.trace("node-pty.IPty#write", data, isBinary);
    if (isBinary) {
      this._ptyProcess.write(Buffer.from(data, "binary"));
    } else {
      this._ptyProcess.write(data);
    }
    this._childProcessMonitor?.handleInput();
  }
  sendSignal(signal) {
    if (this._store.isDisposed || !this._ptyProcess) {
      return;
    }
    this._ptyProcess.kill(signal);
  }
  async processBinary(data) {
    this.input(data, true);
  }
  async refreshProperty(type) {
    switch (type) {
      case ProcessPropertyType.Cwd: {
        const newCwd = await this.getCwd();
        if (newCwd !== this._properties.cwd) {
          this._properties.cwd = newCwd;
          this._onDidChangeProperty.fire({ type: ProcessPropertyType.Cwd, value: this._properties.cwd });
        }
        return newCwd;
      }
      case ProcessPropertyType.InitialCwd: {
        const initialCwd = await this.getInitialCwd();
        if (initialCwd !== this._properties.initialCwd) {
          this._properties.initialCwd = initialCwd;
          this._onDidChangeProperty.fire({ type: ProcessPropertyType.InitialCwd, value: this._properties.initialCwd });
        }
        return initialCwd;
      }
      case ProcessPropertyType.Title:
        return this.currentTitle;
      default:
        return this.shellType;
    }
  }
  async updateProperty(type, value) {
    if (type === ProcessPropertyType.FixedDimensions) {
      this._properties.fixedDimensions = value;
    }
  }
  resize(cols, rows, pixelWidth, pixelHeight) {
    if (this._store.isDisposed) {
      return;
    }
    if (!isNumber(cols) || !isNumber(rows)) {
      return;
    }
    if (this._ptyProcess) {
      cols = Math.max(cols, 1);
      rows = Math.max(rows, 1);
      if (this._delayedResizer) {
        this._delayedResizer.cols = cols;
        this._delayedResizer.rows = rows;
        return;
      }
      this._logService.trace("node-pty.IPty#resize", cols, rows);
      try {
        const pixelSize = pixelWidth !== void 0 && pixelHeight !== void 0 ? { width: pixelWidth, height: pixelHeight } : void 0;
        this._ptyProcess.resize(cols, rows, pixelSize);
      } catch (e) {
        this._logService.trace("node-pty.IPty#resize exception " + e.message);
        if (this._exitCode !== void 0 && e.message !== "ioctl(2) failed, EBADF" && e.message !== "Cannot resize a pty that has already exited") {
          throw e;
        }
      }
    }
  }
  clearBuffer() {
    this._ptyProcess?.clear();
  }
  acknowledgeDataEvent(charCount) {
    this._unacknowledgedCharCount = Math.max(this._unacknowledgedCharCount - charCount, 0);
    this._logService.trace(`Flow control: Ack ${charCount} chars (unacknowledged: ${this._unacknowledgedCharCount})`);
    if (this._isPtyPaused && this._unacknowledgedCharCount < FlowControlConstants.LowWatermarkChars) {
      this._logService.trace(`Flow control: Resume (${this._unacknowledgedCharCount} < ${FlowControlConstants.LowWatermarkChars})`);
      this._ptyProcess?.resume();
      this._isPtyPaused = false;
    }
  }
  clearUnacknowledgedChars() {
    this._unacknowledgedCharCount = 0;
    this._logService.trace(`Flow control: Cleared all unacknowledged chars, forcing resume`);
    if (this._isPtyPaused) {
      this._ptyProcess?.resume();
      this._isPtyPaused = false;
    }
  }
  async setUnicodeVersion(version) {
  }
  getInitialCwd() {
    return Promise.resolve(this._initialCwd);
  }
  async getCwd() {
    if (isMacintosh) {
      return new Promise((resolve) => {
        if (!this._ptyProcess) {
          resolve(this._initialCwd);
          return;
        }
        this._logService.trace("node-pty.IPty#pid");
        exec("lsof -OPln -p " + this._ptyProcess.pid + " | grep cwd", { env: { ...process.env, LANG: "en_US.UTF-8" } }, (error, stdout, stderr) => {
          if (!error && stdout !== "") {
            resolve(stdout.substring(stdout.indexOf("/"), stdout.length - 1));
          } else {
            this._logService.error("lsof did not run successfully, it may not be on the $PATH?", error, stdout, stderr);
            resolve(this._initialCwd);
          }
        });
      });
    }
    if (isLinux) {
      if (!this._ptyProcess) {
        return this._initialCwd;
      }
      this._logService.trace("node-pty.IPty#pid");
      try {
        return await fs.promises.readlink(`/proc/${this._ptyProcess.pid}/cwd`);
      } catch (error) {
        return this._initialCwd;
      }
    }
    return this._initialCwd;
  }
  getWindowsPty() {
    return isWindows ? {
      backend: "conpty",
      buildNumber: getWindowsBuildNumberSync()
    } : void 0;
  }
};
TerminalProcess._lastKillOrStart = 0;
TerminalProcess = __decorateClass([
  __decorateParam(7, ILogService),
  __decorateParam(8, IProductService)
], TerminalProcess);
class DelayedResizer extends Disposable {
  constructor() {
    super();
    this._onTrigger = this._register(new Emitter());
    this._timeout = setTimeout(() => {
      this._onTrigger.fire({ rows: this.rows, cols: this.cols });
    }, 1e3);
    this._register(toDisposable(() => clearTimeout(this._timeout)));
  }
  get onTrigger() {
    return this._onTrigger.event;
  }
}
function hasConptyOption(obj) {
  return "useConpty" in obj;
}
export {
  TerminalProcess
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXG5vZGVcXHRlcm1pbmFsUHJvY2Vzcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB7IGV4ZWMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgSVByb2Nlc3NFbnZpcm9ubWVudCwgaXNMaW51eCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGZpbmRFeGVjdXRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3Byb2Nlc3Nlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIExvZ0xldmVsIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRmxvd0NvbnRyb2xDb25zdGFudHMsIElTaGVsbExhdW5jaENvbmZpZywgSVRlcm1pbmFsQ2hpbGRQcm9jZXNzLCBJVGVybWluYWxMYXVuY2hFcnJvciwgSVByb2Nlc3NQcm9wZXJ0eSwgSVByb2Nlc3NQcm9wZXJ0eU1hcCwgUHJvY2Vzc1Byb3BlcnR5VHlwZSwgVGVybWluYWxTaGVsbFR5cGUsIElQcm9jZXNzUmVhZHlFdmVudCwgSVRlcm1pbmFsUHJvY2Vzc09wdGlvbnMsIFBvc2l4U2hlbGxUeXBlLCBJUHJvY2Vzc1JlYWR5V2luZG93c1B0eSwgR2VuZXJhbFNoZWxsVHlwZSwgSVRlcm1pbmFsTGF1bmNoUmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IENoaWxkUHJvY2Vzc01vbml0b3IgfSBmcm9tICcuL2NoaWxkUHJvY2Vzc01vbml0b3IuanMnO1xuaW1wb3J0IHsgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbiwgSVNoZWxsSW50ZWdyYXRpb25Db25maWdJbmplY3Rpb24sIHNhbml0aXplRW52Rm9yTG9nZ2luZyB9IGZyb20gJy4vdGVybWluYWxFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBXaW5kb3dzU2hlbGxIZWxwZXIgfSBmcm9tICcuL3dpbmRvd3NTaGVsbEhlbHBlci5qcyc7XG5pbXBvcnQgeyBJUHR5LCBJUHR5Rm9ya09wdGlvbnMsIElXaW5kb3dzUHR5Rm9ya09wdGlvbnMsIHNwYXduIH0gZnJvbSAnbm9kZS1wdHknO1xuaW1wb3J0IHsgaXNOdW1iZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBnZXRXaW5kb3dzQnVpbGROdW1iZXJTeW5jIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3dpbmRvd3NWZXJzaW9uLmpzJztcblxuY29uc3QgZW51bSBTaHV0ZG93bkNvbnN0YW50cyB7XG5cdC8qKlxuXHQgKiBUaGUgYW1vdW50IG9mIG1zIHRoYXQgbXVzdCBwYXNzIGJldHdlZW4gZGF0YSBldmVudHMgYWZ0ZXIgZXhpdCBpcyBxdWV1ZWQgYmVmb3JlIHRoZSBhY3R1YWxcblx0ICoga2lsbCBjYWxsIGlzIHRyaWdnZXJlZC4gVGhpcyBkYXRhIGZsdXNoIG1lY2hhbmlzbSB3b3JrcyBhcm91bmQgYW4gW2lzc3VlIGluIG5vZGUtcHR5XVsxXVxuXHQgKiB3aGVyZSBub3QgYWxsIGRhdGEgaXMgZmx1c2hlZCB3aGljaCBjYXVzZXMgcHJvYmxlbXMgZm9yIHRhc2sgcHJvYmxlbSBtYXRjaGVycy4gQWRkaXRpb25hbGx5XG5cdCAqIG9uIFdpbmRvd3MgdW5kZXIgY29ucHR5LCBraWxsaW5nIGEgcHJvY2VzcyB3aGlsZSBkYXRhIGlzIGJlaW5nIG91dHB1dCB3aWxsIGNhdXNlIHRoZSBbY29uaG9zdFxuXHQgKiBmbHVzaCB0byBoYW5nIHRoZSBwdHkgaG9zdF1bMl0gYmVjYXVzZSBbY29uaG9zdCBzaG91bGQgYmUgaG9zdGVkIG9uIGFub3RoZXIgdGhyZWFkXVszXS5cblx0ICpcblx0ICogWzFdOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L25vZGUtcHR5L2lzc3Vlcy83MlxuXHQgKiBbMl06IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy83MTk2NlxuXHQgKiBbM106IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvbm9kZS1wdHkvcHVsbC80MTVcblx0ICovXG5cdERhdGFGbHVzaFRpbWVvdXQgPSAyNTAsXG5cdC8qKlxuXHQgKiBUaGUgbWF4aW11bSBtcyB0byBhbGxvdyBhZnRlciBkaXNwb3NlIGlzIGNhbGxlZCBiZWNhdXNlIGZvcmNlZnVsbHkga2lsbGluZyB0aGUgcHJvY2Vzcy5cblx0ICovXG5cdE1heGltdW1TaHV0ZG93blRpbWUgPSA1MDAwXG59XG5cbmNvbnN0IGVudW0gQ29uc3RhbnRzIHtcblx0LyoqXG5cdCAqIFRoZSBtaW5pbXVtIGR1cmF0aW9uIGJldHdlZW4ga2lsbCBhbmQgc3Bhd24gY2FsbHMgb24gV2luZG93cy9jb25wdHkgYXMgYSBtaXRpZ2F0aW9uIGZvciBhXG5cdCAqIGhhbmcgaXNzdWUuIFNlZTpcblx0ICogLSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNzE5NjZcblx0ICogLSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE3OTU2XG5cdCAqIC0gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyMTMzNlxuXHQgKi9cblx0S2lsbFNwYXduVGhyb3R0bGVJbnRlcnZhbCA9IDI1MCxcblx0LyoqXG5cdCAqIFRoZSBhbW91bnQgb2YgdGltZSB0byB3YWl0IHdoZW4gYSBjYWxsIGlzIHRocm90dGxlZCBiZXlvbmQgdGhlIGV4YWN0IGFtb3VudCwgdGhpcyBpcyB1c2VkIHRvXG5cdCAqIHRyeSBwcmV2ZW50IGVhcmx5IHRpbWVvdXRzIGNhdXNpbmcgYSBraWxsL3NwYXduIGNhbGwgdG8gaGFwcGVuIGF0IGRvdWJsZSB0aGUgcmVndWxhclxuXHQgKiBpbnRlcnZhbC5cblx0ICovXG5cdEtpbGxTcGF3blNwYWNpbmdEdXJhdGlvbiA9IDUwLFxufVxuXG5jb25zdCBwb3NpeFNoZWxsVHlwZU1hcCA9IG5ldyBNYXA8c3RyaW5nLCBQb3NpeFNoZWxsVHlwZT4oW1xuXHRbJ2Jhc2gnLCBQb3NpeFNoZWxsVHlwZS5CYXNoXSxcblx0Wydjc2gnLCBQb3NpeFNoZWxsVHlwZS5Dc2hdLFxuXHRbJ2Zpc2gnLCBQb3NpeFNoZWxsVHlwZS5GaXNoXSxcblx0Wydrc2gnLCBQb3NpeFNoZWxsVHlwZS5Lc2hdLFxuXHRbJ3NoJywgUG9zaXhTaGVsbFR5cGUuU2hdLFxuXHRbJ3pzaCcsIFBvc2l4U2hlbGxUeXBlLlpzaF1cbl0pO1xuXG5jb25zdCBnZW5lcmFsU2hlbGxUeXBlTWFwID0gbmV3IE1hcDxzdHJpbmcsIEdlbmVyYWxTaGVsbFR5cGU+KFtcblx0WydjbGF1ZGUnLCBHZW5lcmFsU2hlbGxUeXBlLkNsYXVkZV0sXG5cdFsnY29kZXgnLCBHZW5lcmFsU2hlbGxUeXBlLkNvZGV4XSxcblx0Wydjb21tYW5kY29kZScsIEdlbmVyYWxTaGVsbFR5cGUuQ29tbWFuZENvZGVdLFxuXHRbJ2NvcGlsb3QnLCBHZW5lcmFsU2hlbGxUeXBlLkNvcGlsb3RdLFxuXHRbJ2dlbWluaScsIEdlbmVyYWxTaGVsbFR5cGUuR2VtaW5pXSxcblx0Wydwd3NoJywgR2VuZXJhbFNoZWxsVHlwZS5Qb3dlclNoZWxsXSxcblx0Wydwb3dlcnNoZWxsJywgR2VuZXJhbFNoZWxsVHlwZS5Qb3dlclNoZWxsXSxcblx0WydweXRob24nLCBHZW5lcmFsU2hlbGxUeXBlLlB5dGhvbl0sXG5cdFsnanVsaWEnLCBHZW5lcmFsU2hlbGxUeXBlLkp1bGlhXSxcblx0WydudScsIEdlbmVyYWxTaGVsbFR5cGUuTnVTaGVsbF0sXG5cdFsnbm9kZScsIEdlbmVyYWxTaGVsbFR5cGUuTm9kZV0sXG5cdFsneG9uc2gnLCBHZW5lcmFsU2hlbGxUeXBlLlhvbnNoXSxcbl0pO1xuZXhwb3J0IGNsYXNzIFRlcm1pbmFsUHJvY2VzcyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGVybWluYWxDaGlsZFByb2Nlc3Mge1xuXHRyZWFkb25seSBpZCA9IDA7XG5cdHJlYWRvbmx5IHNob3VsZFBlcnNpc3QgPSBmYWxzZTtcblxuXHRwcml2YXRlIF9wcm9wZXJ0aWVzOiBJUHJvY2Vzc1Byb3BlcnR5TWFwID0ge1xuXHRcdGN3ZDogJycsXG5cdFx0aW5pdGlhbEN3ZDogJycsXG5cdFx0Zml4ZWREaW1lbnNpb25zOiB7IGNvbHM6IHVuZGVmaW5lZCwgcm93czogdW5kZWZpbmVkIH0sXG5cdFx0dGl0bGU6ICcnLFxuXHRcdHNoZWxsVHlwZTogdW5kZWZpbmVkLFxuXHRcdGhhc0NoaWxkUHJvY2Vzc2VzOiB0cnVlLFxuXHRcdHJlc29sdmVkU2hlbGxMYXVuY2hDb25maWc6IHt9LFxuXHRcdG92ZXJyaWRlRGltZW5zaW9uczogdW5kZWZpbmVkLFxuXHRcdGZhaWxlZFNoZWxsSW50ZWdyYXRpb25BY3RpdmF0aW9uOiBmYWxzZSxcblx0XHR1c2VkU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbjogdW5kZWZpbmVkLFxuXHRcdHNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlUmVhc29uOiB1bmRlZmluZWQsXG5cdH07XG5cdHByaXZhdGUgc3RhdGljIF9sYXN0S2lsbE9yU3RhcnQgPSAwO1xuXHRwcml2YXRlIF9leGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9leGl0TWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jbG9zZVRpbWVvdXQ6IFRpbWVvdXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3B0eVByb2Nlc3M6IElQdHkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2N1cnJlbnRUaXRsZTogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgX3Byb2Nlc3NTdGFydHVwQ29tcGxldGU6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3dpbmRvd3NTaGVsbEhlbHBlcjogV2luZG93c1NoZWxsSGVscGVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jaGlsZFByb2Nlc3NNb25pdG9yOiBDaGlsZFByb2Nlc3NNb25pdG9yIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90aXRsZUludGVydmFsOiBUaW1lb3V0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kZWxheWVkUmVzaXplcjogRGVsYXllZFJlc2l6ZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luaXRpYWxDd2Q6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBfcHR5T3B0aW9uczogSVB0eUZvcmtPcHRpb25zIHwgSVdpbmRvd3NQdHlGb3JrT3B0aW9ucztcblxuXHRwcml2YXRlIF9pc1B0eVBhdXNlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF91bmFja25vd2xlZGdlZENoYXJDb3VudDogbnVtYmVyID0gMDtcblx0Z2V0IGV4aXRNZXNzYWdlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9leGl0TWVzc2FnZTsgfVxuXG5cdGdldCBjdXJyZW50VGl0bGUoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuX3dpbmRvd3NTaGVsbEhlbHBlcj8uc2hlbGxUaXRsZSB8fCB0aGlzLl9jdXJyZW50VGl0bGU7IH1cblx0Z2V0IHNoZWxsVHlwZSgpOiBUZXJtaW5hbFNoZWxsVHlwZSB8IHVuZGVmaW5lZCB7IHJldHVybiBpc1dpbmRvd3MgPyB0aGlzLl93aW5kb3dzU2hlbGxIZWxwZXI/LnNoZWxsVHlwZSA6IHBvc2l4U2hlbGxUeXBlTWFwLmdldCh0aGlzLl9jdXJyZW50VGl0bGUpIHx8IGdlbmVyYWxTaGVsbFR5cGVNYXAuZ2V0KHRoaXMuX2N1cnJlbnRUaXRsZSk7IH1cblx0Z2V0IGhhc0NoaWxkUHJvY2Vzc2VzKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fY2hpbGRQcm9jZXNzTW9uaXRvcj8uaGFzQ2hpbGRQcm9jZXNzZXMgfHwgZmFsc2U7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb2Nlc3NEYXRhID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25Qcm9jZXNzRGF0YSA9IHRoaXMuX29uUHJvY2Vzc0RhdGEuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc1JlYWR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVByb2Nlc3NSZWFkeUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25Qcm9jZXNzUmVhZHkgPSB0aGlzLl9vblByb2Nlc3NSZWFkeS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQcm9wZXJ0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElQcm9jZXNzUHJvcGVydHk+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVByb3BlcnR5ID0gdGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzRXhpdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdHJlYWRvbmx5IG9uUHJvY2Vzc0V4aXQgPSB0aGlzLl9vblByb2Nlc3NFeGl0LmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcsXG5cdFx0Y3dkOiBzdHJpbmcsXG5cdFx0Y29sczogbnVtYmVyLFxuXHRcdHJvd3M6IG51bWJlcixcblx0XHRlbnY6IElQcm9jZXNzRW52aXJvbm1lbnQsXG5cdFx0LyoqXG5cdFx0ICogZW52aXJvbm1lbnQgdXNlZCBmb3IgYGZpbmRFeGVjdXRhYmxlYFxuXHRcdCAqL1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4ZWN1dGFibGVFbnY6IElQcm9jZXNzRW52aXJvbm1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSVRlcm1pbmFsUHJvY2Vzc09wdGlvbnMsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGxldCBuYW1lOiBzdHJpbmc7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0bmFtZSA9IHBhdGguYmFzZW5hbWUodGhpcy5zaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlIHx8ICcnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVXNpbmcgJ3h0ZXJtLTI1NmNvbG9yJyBoZXJlIGhlbHBzIGVuc3VyZSB0aGF0IHRoZSBtYWpvcml0eSBvZiBMaW51eCBkaXN0cmlidXRpb25zIHdpbGwgdXNlIGFcblx0XHRcdC8vIGNvbG9yIHByb21wdCBhcyBkZWZpbmVkIGluIHRoZSBkZWZhdWx0IH4vLmJhc2hyYyBmaWxlLlxuXHRcdFx0bmFtZSA9ICd4dGVybS0yNTZjb2xvcic7XG5cdFx0fVxuXHRcdHRoaXMuX2luaXRpYWxDd2QgPSBjd2Q7XG5cdFx0dGhpcy5fcHJvcGVydGllc1tQcm9jZXNzUHJvcGVydHlUeXBlLkluaXRpYWxDd2RdID0gdGhpcy5faW5pdGlhbEN3ZDtcblx0XHR0aGlzLl9wcm9wZXJ0aWVzW1Byb2Nlc3NQcm9wZXJ0eVR5cGUuQ3dkXSA9IHRoaXMuX2luaXRpYWxDd2Q7XG5cdFx0Y29uc3QgdXNlQ29ucHR5ID0gcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyAmJiBnZXRXaW5kb3dzQnVpbGROdW1iZXJTeW5jKCkgPj0gMTgzMDk7XG5cdFx0Y29uc3QgdXNlQ29ucHR5RGxsID0gdXNlQ29ucHR5ICYmIHRoaXMuX29wdGlvbnMud2luZG93c1VzZUNvbnB0eURsbDtcblx0XHR0aGlzLl9wdHlPcHRpb25zID0ge1xuXHRcdFx0bmFtZSxcblx0XHRcdGN3ZCxcblx0XHRcdC8vIFRPRE86IFdoZW4gbm9kZS1wdHkgaXMgdXBkYXRlZCB0aGlzIGNhc3QgY2FuIGJlIHJlbW92ZWRcblx0XHRcdGVudjogZW52IGFzIHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0sXG5cdFx0XHRjb2xzLFxuXHRcdFx0cm93cyxcblx0XHRcdHVzZUNvbnB0eSxcblx0XHRcdHVzZUNvbnB0eURsbCxcblx0XHRcdC8vIFRoaXMgb3B0aW9uIHdpbGwgZm9yY2UgY29ucHR5IHRvIG5vdCByZWRyYXcgdGhlIHdob2xlIHZpZXdwb3J0IG9uIGxhdW5jaFxuXHRcdFx0Y29ucHR5SW5oZXJpdEN1cnNvcjogdXNlQ29ucHR5ICYmICEhc2hlbGxMYXVuY2hDb25maWcuaW5pdGlhbFRleHRcblx0XHR9O1xuXHRcdC8vIERlbGF5IHJlc2l6ZXMgdG8gYXZvaWQgY29ucHR5IG5vdCByZXNwZWN0aW5nIHZlcnkgZWFybHkgcmVzaXplIGNhbGxzXG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0aWYgKHVzZUNvbnB0eSAmJiBjb2xzID09PSAwICYmIHJvd3MgPT09IDAgJiYgdGhpcy5zaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlPy5lbmRzV2l0aCgnR2l0XFxcXGJpblxcXFxiYXNoLmV4ZScpKSB7XG5cdFx0XHRcdHRoaXMuX2RlbGF5ZWRSZXNpemVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZWRSZXNpemVyKCkpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9kZWxheWVkUmVzaXplci5vblRyaWdnZXIoZGltZW5zaW9ucyA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fZGVsYXllZFJlc2l6ZXI/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLl9kZWxheWVkUmVzaXplciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAoZGltZW5zaW9ucy5jb2xzICYmIGRpbWVuc2lvbnMucm93cykge1xuXHRcdFx0XHRcdFx0dGhpcy5yZXNpemUoZGltZW5zaW9ucy5jb2xzLCBkaW1lbnNpb25zLnJvd3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gV2luZG93c1NoZWxsSGVscGVyIGlzIHVzZWQgdG8gZmV0Y2ggdGhlIHByb2Nlc3MgdGl0bGUgYW5kIHNoZWxsIHR5cGVcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25Qcm9jZXNzUmVhZHkoZSA9PiB7XG5cdFx0XHRcdHRoaXMuX3dpbmRvd3NTaGVsbEhlbHBlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBXaW5kb3dzU2hlbGxIZWxwZXIoZS5waWQpKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fd2luZG93c1NoZWxsSGVscGVyLm9uU2hlbGxUeXBlQ2hhbmdlZChlID0+IHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZmlyZSh7IHR5cGU6IFByb2Nlc3NQcm9wZXJ0eVR5cGUuU2hlbGxUeXBlLCB2YWx1ZTogZSB9KSkpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl93aW5kb3dzU2hlbGxIZWxwZXIub25TaGVsbE5hbWVDaGFuZ2VkKGUgPT4gdGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5maXJlKHsgdHlwZTogUHJvY2Vzc1Byb3BlcnR5VHlwZS5UaXRsZSwgdmFsdWU6IGUgfSkpKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl90aXRsZUludGVydmFsKSB7XG5cdFx0XHRcdGNsZWFySW50ZXJ2YWwodGhpcy5fdGl0bGVJbnRlcnZhbCk7XG5cdFx0XHRcdHRoaXMuX3RpdGxlSW50ZXJ2YWwgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9wdHlQcm9jZXNzID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fcHJvY2Vzc1N0YXJ0dXBDb21wbGV0ZSA9IHVuZGVmaW5lZDtcblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBzdGFydCgpOiBQcm9taXNlPElUZXJtaW5hbExhdW5jaEVycm9yIHwgSVRlcm1pbmFsTGF1bmNoUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKFt0aGlzLl92YWxpZGF0ZUN3ZCgpLCB0aGlzLl92YWxpZGF0ZUV4ZWN1dGFibGUoKV0pO1xuXHRcdGNvbnN0IGZpcnN0RXJyb3IgPSByZXN1bHRzLmZpbmQociA9PiByICE9PSB1bmRlZmluZWQpO1xuXHRcdGlmIChmaXJzdEVycm9yKSB7XG5cdFx0XHRyZXR1cm4gZmlyc3RFcnJvcjtcblx0XHR9XG5cblx0XHRjb25zdCBpbmplY3Rpb24gPSBhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHRoaXMuc2hlbGxMYXVuY2hDb25maWcsIHRoaXMuX29wdGlvbnMsIHRoaXMuX3B0eU9wdGlvbnMuZW52LCB0aGlzLl9sb2dTZXJ2aWNlLCB0aGlzLl9wcm9kdWN0U2VydmljZSk7XG5cdFx0aWYgKGluamVjdGlvbi50eXBlID09PSAnaW5qZWN0aW9uJykge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5maXJlKHsgdHlwZTogUHJvY2Vzc1Byb3BlcnR5VHlwZS5Vc2VkU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbiwgdmFsdWU6IHRydWUgfSk7XG5cdFx0XHRpZiAoaW5qZWN0aW9uLmVudk1peGluKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGluamVjdGlvbi5lbnZNaXhpbikpIHtcblx0XHRcdFx0XHR0aGlzLl9wdHlPcHRpb25zLmVudiB8fD0ge307XG5cdFx0XHRcdFx0dGhpcy5fcHR5T3B0aW9ucy5lbnZba2V5XSA9IHZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoaW5qZWN0aW9uLmZpbGVzVG9Db3B5KSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZiBvZiBpbmplY3Rpb24uZmlsZXNUb0NvcHkpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgZnMucHJvbWlzZXMubWtkaXIocGF0aC5kaXJuYW1lKGYuZGVzdCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0YXdhaXQgZnMucHJvbWlzZXMuY29weUZpbGUoZi5zb3VyY2UsIGYuZGVzdCk7XG5cdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHQvLyBTd2FsbG93IGVycm9yLCB0aGlzIHNob3VsZCBvbmx5IGhhcHBlbiB3aGVuIG11bHRpcGxlIHVzZXJzIGFyZSBvbiB0aGUgc2FtZVxuXHRcdFx0XHRcdFx0Ly8gbWFjaGluZS4gU2luY2UgdGhlIHNoZWxsIGludGVncmF0aW9uIHNjcmlwdHMgcmFyZWx5IGNoYW5nZSwgcGx1cyB0aGUgb3RoZXIgdXNlclxuXHRcdFx0XHRcdFx0Ly8gc2hvdWxkIGJlIHVzaW5nIHRoZSBzYW1lIHZlcnNpb24gb2YgdGhlIHNlcnZlciBpbiB0aGlzIGNhc2UsIGFzc3VtZSB0aGUgc2NyaXB0IGlzXG5cdFx0XHRcdFx0XHQvLyBmaW5lIGlmIGNvcHkgZmFpbHMgYW5kIHN3YWxsb3cgdGhlIGVycm9yLlxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVByb3BlcnR5LmZpcmUoeyB0eXBlOiBQcm9jZXNzUHJvcGVydHlUeXBlLkZhaWxlZFNoZWxsSW50ZWdyYXRpb25BY3RpdmF0aW9uLCB2YWx1ZTogdHJ1ZSB9KTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZmlyZSh7IHR5cGU6IFByb2Nlc3NQcm9wZXJ0eVR5cGUuU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb24sIHZhbHVlOiBpbmplY3Rpb24ucmVhc29uIH0pO1xuXHRcdFx0Ly8gRXZlbiBpZiBzaGVsbCBpbnRlZ3JhdGlvbiBpbmplY3Rpb24gZmFpbGVkLCBzdGlsbCBzZXQgdGhlIG5vbmNlIGlmIG9uZSB3YXMgcHJvdmlkZWRcblx0XHRcdC8vIFRoaXMgYWxsb3dzIGV4dGVuc2lvbnMgdG8gdXNlIHNoZWxsIGludGVncmF0aW9uIHdpdGggY3VzdG9tIHNoZWxsc1xuXHRcdFx0aWYgKHRoaXMuX29wdGlvbnMuc2hlbGxJbnRlZ3JhdGlvbi5ub25jZSkge1xuXHRcdFx0XHR0aGlzLl9wdHlPcHRpb25zLmVudiB8fD0ge307XG5cdFx0XHRcdHRoaXMuX3B0eU9wdGlvbnMuZW52WydWU0NPREVfTk9OQ0UnXSA9IHRoaXMuX29wdGlvbnMuc2hlbGxJbnRlZ3JhdGlvbi5ub25jZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaW5qZWN0aW9uQ29uZmlnOiBJU2hlbGxJbnRlZ3JhdGlvbkNvbmZpZ0luamVjdGlvbiB8IHVuZGVmaW5lZCA9IGluamVjdGlvbi50eXBlID09PSAnaW5qZWN0aW9uJyA/IGluamVjdGlvbiA6IHVuZGVmaW5lZDtcblx0XHRcdGF3YWl0IHRoaXMuc2V0dXBQdHlQcm9jZXNzKHRoaXMuc2hlbGxMYXVuY2hDb25maWcsIHRoaXMuX3B0eU9wdGlvbnMsIGluamVjdGlvbkNvbmZpZyk7XG5cdFx0XHRpZiAoaW5qZWN0aW9uQ29uZmlnPy5uZXdBcmdzKSB7XG5cdFx0XHRcdHJldHVybiB7IGluamVjdGVkQXJnczogaW5qZWN0aW9uQ29uZmlnLm5ld0FyZ3MgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdub2RlLXB0eS5ub2RlLXB0eS5JUHR5I3NwYXduIG5hdGl2ZSBleGNlcHRpb24nLCBlcnIpO1xuXHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gZXJyLm1lc3NhZ2U7XG5cdFx0XHRpZiAoZXJyb3JNZXNzYWdlPy5pbmNsdWRlcygnQ2Fubm90IGxhdW5jaCBjb25wdHknKSkge1xuXHRcdFx0XHRyZXR1cm4geyBtZXNzYWdlOiBsb2NhbGl6ZSgnY29ucHR5TGF1bmNoRmFpbGVkJywgXCJBIG5hdGl2ZSBleGNlcHRpb24gb2NjdXJyZWQgZHVyaW5nIGxhdW5jaCAoQ2Fubm90IGxhdW5jaCBjb25wdHkpLiBXaW5wdHkgaGFzIGJlZW4gcmVtb3ZlZCwgc2VlIHswfSBmb3IgbW9yZSBkZXRhaWxzLiBZb3UgY2FuIGFsc28gdHJ5IGVuYWJsaW5nIHRoZSBgezF9YCBzZXR0aW5nLlwiLCAnaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vdXBkYXRlcy92MV8xMDkjX3JlbW92YWwtb2Ytd2lucHR5LXN1cHBvcnQnLCAndGVybWluYWwuaW50ZWdyYXRlZC53aW5kb3dzVXNlQ29ucHR5RGxsJykgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IG1lc3NhZ2U6IGBBIG5hdGl2ZSBleGNlcHRpb24gb2NjdXJyZWQgZHVyaW5nIGxhdW5jaCAoJHtlcnJvck1lc3NhZ2V9KWAgfTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF92YWxpZGF0ZUN3ZCgpOiBQcm9taXNlPHVuZGVmaW5lZCB8IElUZXJtaW5hbExhdW5jaEVycm9yPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZzLnByb21pc2VzLnN0YXQodGhpcy5faW5pdGlhbEN3ZCk7XG5cdFx0XHRpZiAoIXJlc3VsdC5pc0RpcmVjdG9yeSgpKSB7XG5cdFx0XHRcdHJldHVybiB7IG1lc3NhZ2U6IGxvY2FsaXplKCdsYXVuY2hGYWlsLmN3ZE5vdERpcmVjdG9yeScsIFwiU3RhcnRpbmcgZGlyZWN0b3J5IChjd2QpIFxcXCJ7MH1cXFwiIGlzIG5vdCBhIGRpcmVjdG9yeVwiLCB0aGlzLl9pbml0aWFsQ3dkLnRvU3RyaW5nKCkpIH07XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoZXJyPy5jb2RlID09PSAnRU5PRU5UJykge1xuXHRcdFx0XHRyZXR1cm4geyBtZXNzYWdlOiBsb2NhbGl6ZSgnbGF1bmNoRmFpbC5jd2REb2VzTm90RXhpc3QnLCBcIlN0YXJ0aW5nIGRpcmVjdG9yeSAoY3dkKSBcXFwiezB9XFxcIiBkb2VzIG5vdCBleGlzdFwiLCB0aGlzLl9pbml0aWFsQ3dkLnRvU3RyaW5nKCkpIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZmlyZSh7IHR5cGU6IFByb2Nlc3NQcm9wZXJ0eVR5cGUuSW5pdGlhbEN3ZCwgdmFsdWU6IHRoaXMuX2luaXRpYWxDd2QgfSk7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3ZhbGlkYXRlRXhlY3V0YWJsZSgpOiBQcm9taXNlPHVuZGVmaW5lZCB8IElUZXJtaW5hbExhdW5jaEVycm9yPiB7XG5cdFx0Y29uc3Qgc2xjID0gdGhpcy5zaGVsbExhdW5jaENvbmZpZztcblx0XHRpZiAoIXNsYy5leGVjdXRhYmxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0lTaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlIG5vdCBzZXQnKTtcblx0XHR9XG5cblx0XHRjb25zdCBjd2QgPSBzbGMuY3dkIGluc3RhbmNlb2YgVVJJID8gc2xjLmN3ZC5wYXRoIDogc2xjLmN3ZDtcblx0XHRjb25zdCBlbnZQYXRoczogc3RyaW5nW10gfCB1bmRlZmluZWQgPSAoc2xjLmVudiAmJiBzbGMuZW52LlBBVEgpID8gc2xjLmVudi5QQVRILnNwbGl0KHBhdGguZGVsaW1pdGVyKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBleGVjdXRhYmxlID0gYXdhaXQgZmluZEV4ZWN1dGFibGUoc2xjLmV4ZWN1dGFibGUsIGN3ZCwgZW52UGF0aHMsIHRoaXMuX2V4ZWN1dGFibGVFbnYpO1xuXHRcdGlmICghZXhlY3V0YWJsZSkge1xuXHRcdFx0cmV0dXJuIHsgbWVzc2FnZTogbG9jYWxpemUoJ2xhdW5jaEZhaWwuZXhlY3V0YWJsZURvZXNOb3RFeGlzdCcsIFwiUGF0aCB0byBzaGVsbCBleGVjdXRhYmxlIFxcXCJ7MH1cXFwiIGRvZXMgbm90IGV4aXN0XCIsIHNsYy5leGVjdXRhYmxlKSB9O1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmcy5wcm9taXNlcy5zdGF0KGV4ZWN1dGFibGUpO1xuXHRcdFx0aWYgKCFyZXN1bHQuaXNGaWxlKCkgJiYgIXJlc3VsdC5pc1N5bWJvbGljTGluaygpKSB7XG5cdFx0XHRcdHJldHVybiB7IG1lc3NhZ2U6IGxvY2FsaXplKCdsYXVuY2hGYWlsLmV4ZWN1dGFibGVJc05vdEZpbGVPclN5bWxpbmsnLCBcIlBhdGggdG8gc2hlbGwgZXhlY3V0YWJsZSBcXFwiezB9XFxcIiBpcyBub3QgYSBmaWxlIG9yIGEgc3ltbGlua1wiLCBzbGMuZXhlY3V0YWJsZSkgfTtcblx0XHRcdH1cblx0XHRcdC8vIFNldCB0aGUgZXhlY3V0YWJsZSBleHBsaWNpdGx5IGhlcmUgc28gdGhhdCBub2RlLXB0eSBkb2Vzbid0IG5lZWQgdG8gc2VhcmNoIHRoZVxuXHRcdFx0Ly8gJFBBVEggdG9vLlxuXHRcdFx0c2xjLmV4ZWN1dGFibGUgPSBleGVjdXRhYmxlO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKGVycj8uY29kZSA9PT0gJ0VBQ0NFUycpIHtcblx0XHRcdFx0Ly8gU3dhbGxvd1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZXR1cFB0eVByb2Nlc3MoXG5cdFx0c2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZyxcblx0XHRvcHRpb25zOiBJUHR5Rm9ya09wdGlvbnMsXG5cdFx0c2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbjogSVNoZWxsSW50ZWdyYXRpb25Db25maWdJbmplY3Rpb24gfCB1bmRlZmluZWRcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYXJncyA9IHNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24/Lm5ld0FyZ3MgfHwgc2hlbGxMYXVuY2hDb25maWcuYXJncyB8fCBbXTtcblx0XHRhd2FpdCB0aGlzLl90aHJvdHRsZUtpbGxTcGF3bigpO1xuXHRcdGNvbnN0IHNhbml0aXplZE9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIGVudjogc2FuaXRpemVFbnZGb3JMb2dnaW5nKG9wdGlvbnMuZW52IGFzIElQcm9jZXNzRW52aXJvbm1lbnQgfCB1bmRlZmluZWQpIH07XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnbm9kZS1wdHkuSVB0eSNzcGF3bicsIHNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUsIGFyZ3MsIHNhbml0aXplZE9wdGlvbnMpO1xuXHRcdGNvbnN0IHB0eVByb2Nlc3MgPSBzcGF3bihzaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlISwgYXJncywgb3B0aW9ucyk7XG5cdFx0dGhpcy5fcHR5UHJvY2VzcyA9IHB0eVByb2Nlc3M7XG5cdFx0dGhpcy5fY2hpbGRQcm9jZXNzTW9uaXRvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDaGlsZFByb2Nlc3NNb25pdG9yKHB0eVByb2Nlc3MucGlkLCB0aGlzLl9sb2dTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hpbGRQcm9jZXNzTW9uaXRvci5vbkRpZENoYW5nZUhhc0NoaWxkUHJvY2Vzc2VzKHZhbHVlID0+IHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZmlyZSh7IHR5cGU6IFByb2Nlc3NQcm9wZXJ0eVR5cGUuSGFzQ2hpbGRQcm9jZXNzZXMsIHZhbHVlIH0pKSk7XG5cdFx0dGhpcy5fcHJvY2Vzc1N0YXJ0dXBDb21wbGV0ZSA9IG5ldyBQcm9taXNlPHZvaWQ+KGMgPT4ge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vblByb2Nlc3NSZWFkeSgoKSA9PiBjKCkpKTtcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3RlcihwdHlQcm9jZXNzLm9uRGF0YShkYXRhID0+IHtcblx0XHRcdC8vIEhhbmRsZSBmbG93IGNvbnRyb2xcblx0XHRcdHRoaXMuX3VuYWNrbm93bGVkZ2VkQ2hhckNvdW50ICs9IGRhdGEubGVuZ3RoO1xuXHRcdFx0aWYgKCF0aGlzLl9pc1B0eVBhdXNlZCAmJiB0aGlzLl91bmFja25vd2xlZGdlZENoYXJDb3VudCA+IEZsb3dDb250cm9sQ29uc3RhbnRzLkhpZ2hXYXRlcm1hcmtDaGFycykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBGbG93IGNvbnRyb2w6IFBhdXNlICgke3RoaXMuX3VuYWNrbm93bGVkZ2VkQ2hhckNvdW50fSA+ICR7Rmxvd0NvbnRyb2xDb25zdGFudHMuSGlnaFdhdGVybWFya0NoYXJzfSlgKTtcblx0XHRcdFx0dGhpcy5faXNQdHlQYXVzZWQgPSB0cnVlO1xuXHRcdFx0XHRwdHlQcm9jZXNzLnBhdXNlKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlZmlyZSB0aGUgZGF0YSBldmVudFxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnbm9kZS1wdHkuSVB0eSNvbkRhdGEnLCBkYXRhKTtcblx0XHRcdHRoaXMuX29uUHJvY2Vzc0RhdGEuZmlyZShkYXRhKTtcblx0XHRcdGlmICh0aGlzLl9jbG9zZVRpbWVvdXQpIHtcblx0XHRcdFx0dGhpcy5fcXVldWVQcm9jZXNzRXhpdCgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fd2luZG93c1NoZWxsSGVscGVyPy5jaGVja1NoZWxsKCk7XG5cdFx0XHR0aGlzLl9jaGlsZFByb2Nlc3NNb25pdG9yPy5oYW5kbGVPdXRwdXQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocHR5UHJvY2Vzcy5vbkV4aXQoZSA9PiB7XG5cdFx0XHR0aGlzLl9leGl0Q29kZSA9IGUuZXhpdENvZGU7XG5cdFx0XHR0aGlzLl9xdWV1ZVByb2Nlc3NFeGl0KCk7XG5cdFx0fSkpO1xuXHRcdC8vIG5vZGUtcHR5ID49IDEuMi4wLWJldGEuMTEgZGVmZXJzIGNvbnB0eU5hdGl2ZS5jb25uZWN0KCkgb24gV2luZG93cywgc29cblx0XHQvLyBwdHlQcm9jZXNzLnBpZCBtYXkgYmUgMCBpbW1lZGlhdGVseSBhZnRlciBzcGF3bi4gSW4gdGhhdCBjYXNlIHdlIHdhaXRcblx0XHQvLyBmb3IgdGhlIGZpcnN0IGRhdGEgZXZlbnQgd2hpY2ggb25seSBmaXJlcyBhZnRlciB0aGUgY29ubmVjdGlvbiBjb21wbGV0ZXNcblx0XHQvLyBhbmQgdGhlIHJlYWwgcGlkIGlzIGF2YWlsYWJsZS4gU2VlIG1pY3Jvc29mdC9ub2RlLXB0eSM4ODUuXG5cdFx0aWYgKHB0eVByb2Nlc3MucGlkID4gMCkge1xuXHRcdFx0dGhpcy5fc2VuZFByb2Nlc3NJZChwdHlQcm9jZXNzLnBpZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGRhdGFMaXN0ZW5lciA9IHB0eVByb2Nlc3Mub25EYXRhKCgpID0+IHtcblx0XHRcdFx0ZGF0YUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fY2hpbGRQcm9jZXNzTW9uaXRvcj8uc2V0UGlkKHB0eVByb2Nlc3MucGlkKTtcblx0XHRcdFx0dGhpcy5fc2VuZFByb2Nlc3NJZChwdHlQcm9jZXNzLnBpZCk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRhdGFMaXN0ZW5lcik7XG5cdFx0fVxuXHRcdHRoaXMuX3NldHVwVGl0bGVQb2xsaW5nKHB0eVByb2Nlc3MpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0dXBUaXRsZVBvbGxpbmcocHR5UHJvY2VzczogSVB0eSkge1xuXHRcdC8vIFNlbmQgaW5pdGlhbCB0aW1lb3V0IGFzeW5jIHRvIGdpdmUgZXZlbnQgbGlzdGVuZXJzIGEgY2hhbmNlIHRvIGluaXRcblx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMuX3NlbmRQcm9jZXNzVGl0bGUocHR5UHJvY2VzcykpO1xuXHRcdC8vIFNldHVwIHBvbGxpbmcgZm9yIG5vbi1XaW5kb3dzLCBmb3IgV2luZG93cyBgcHJvY2Vzc2AgZG9lc24ndCBjaGFuZ2Vcblx0XHRpZiAoIWlzV2luZG93cykge1xuXHRcdFx0dGhpcy5fdGl0bGVJbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRUaXRsZSAhPT0gcHR5UHJvY2Vzcy5wcm9jZXNzKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2VuZFByb2Nlc3NUaXRsZShwdHlQcm9jZXNzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgMjAwKTtcblx0XHR9XG5cdH1cblxuXHQvLyBBbGxvdyBhbnkgdHJhaWxpbmcgZGF0YSBldmVudHMgdG8gYmUgc2VudCBiZWZvcmUgdGhlIGV4aXQgZXZlbnQgaXMgc2VudC5cblx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvbm9kZS1wdHkvaXNzdWVzLzcyXG5cdHByaXZhdGUgX3F1ZXVlUHJvY2Vzc0V4aXQoKSB7XG5cdFx0aWYgKHRoaXMuX2xvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSA9PT0gTG9nTGV2ZWwuVHJhY2UpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1Rlcm1pbmFsUHJvY2VzcyNfcXVldWVQcm9jZXNzRXhpdCcsIG5ldyBFcnJvcigpLnN0YWNrPy5yZXBsYWNlKC9eRXJyb3IvLCAnJykpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY2xvc2VUaW1lb3V0KSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fY2xvc2VUaW1lb3V0KTtcblx0XHR9XG5cdFx0dGhpcy5fY2xvc2VUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jbG9zZVRpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9raWxsKCk7XG5cdFx0fSwgU2h1dGRvd25Db25zdGFudHMuRGF0YUZsdXNoVGltZW91dCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9raWxsKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFdhaXQgdG8ga2lsbCB0byBwcm9jZXNzIHVudGlsIHRoZSBzdGFydCB1cCBjb2RlIGhhcyBydW4uIFRoaXMgcHJldmVudHMgdXMgZnJvbSBmaXJpbmcgYSBwcm9jZXNzIGV4aXQgYmVmb3JlIGFcblx0XHQvLyBwcm9jZXNzIHN0YXJ0LlxuXHRcdGF3YWl0IHRoaXMuX3Byb2Nlc3NTdGFydHVwQ29tcGxldGU7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQXR0ZW1wdCB0byBraWxsIHRoZSBwdHksIGl0IG1heSBoYXZlIGFscmVhZHkgYmVlbiBraWxsZWQgYXQgdGhpc1xuXHRcdC8vIHBvaW50IGJ1dCB3ZSB3YW50IHRvIG1ha2Ugc3VyZVxuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGhpcy5fcHR5UHJvY2Vzcykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl90aHJvdHRsZUtpbGxTcGF3bigpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdub2RlLXB0eS5JUHR5I2tpbGwnKTtcblx0XHRcdFx0dGhpcy5fcHR5UHJvY2Vzcy5raWxsKCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXgpIHtcblx0XHRcdC8vIFN3YWxsb3csIHRoZSBwdHkgaGFzIGFscmVhZHkgYmVlbiBraWxsZWRcblx0XHR9XG5cdFx0dGhpcy5fb25Qcm9jZXNzRXhpdC5maXJlKHRoaXMuX2V4aXRDb2RlIHx8IDApO1xuXHRcdHRoaXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdGhyb3R0bGVLaWxsU3Bhd24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gT25seSB0aHJvdHRsZSBvbiBXaW5kb3dzL2NvbnB0eVxuXHRcdGlmICghaXNXaW5kb3dzIHx8ICFoYXNDb25wdHlPcHRpb24odGhpcy5fcHR5T3B0aW9ucykgfHwgIXRoaXMuX3B0eU9wdGlvbnMudXNlQ29ucHR5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIERvbid0IHRocm90dGxlIHdoZW4gdXNpbmcgY29ucHR5LmRsbCBhcyBpdCBzZWVtcyB0byBoYXZlIGJlZW4gZml4ZWQgaW4gbGF0ZXIgdmVyc2lvbnNcblx0XHRpZiAodGhpcy5fcHR5T3B0aW9ucy51c2VDb25wdHlEbGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gVXNlIGEgbG9vcCB0byBlbnN1cmUgbXVsdGlwbGUgY2FsbHMgaW4gYSBzaW5nbGUgaW50ZXJ2YWwgc3BhY2Ugb3V0XG5cdFx0d2hpbGUgKERhdGUubm93KCkgLSBUZXJtaW5hbFByb2Nlc3MuX2xhc3RLaWxsT3JTdGFydCA8IENvbnN0YW50cy5LaWxsU3Bhd25UaHJvdHRsZUludGVydmFsKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdUaHJvdHRsaW5nIGtpbGwvc3Bhd24gY2FsbCcpO1xuXHRcdFx0YXdhaXQgdGltZW91dChDb25zdGFudHMuS2lsbFNwYXduVGhyb3R0bGVJbnRlcnZhbCAtIChEYXRlLm5vdygpIC0gVGVybWluYWxQcm9jZXNzLl9sYXN0S2lsbE9yU3RhcnQpICsgQ29uc3RhbnRzLktpbGxTcGF3blNwYWNpbmdEdXJhdGlvbik7XG5cdFx0fVxuXHRcdFRlcm1pbmFsUHJvY2Vzcy5fbGFzdEtpbGxPclN0YXJ0ID0gRGF0ZS5ub3coKTtcblx0fVxuXG5cdHByaXZhdGUgX3NlbmRQcm9jZXNzSWQocGlkOiBudW1iZXIpIHtcblx0XHR0aGlzLl9vblByb2Nlc3NSZWFkeS5maXJlKHtcblx0XHRcdHBpZCxcblx0XHRcdGN3ZDogdGhpcy5faW5pdGlhbEN3ZCxcblx0XHRcdHdpbmRvd3NQdHk6IHRoaXMuZ2V0V2luZG93c1B0eSgpXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZW5kUHJvY2Vzc1RpdGxlKHB0eVByb2Nlc3M6IElQdHkpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBIQUNLOiBUaGUgbm9kZS1wdHkgQVBJIGNhbiByZXR1cm4gdW5kZWZpbmVkIHNvbWVob3cgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIyMjMyM1xuXHRcdHRoaXMuX2N1cnJlbnRUaXRsZSA9IChwdHlQcm9jZXNzLnByb2Nlc3MgPz8gJycpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZmlyZSh7IHR5cGU6IFByb2Nlc3NQcm9wZXJ0eVR5cGUuVGl0bGUsIHZhbHVlOiB0aGlzLl9jdXJyZW50VGl0bGUgfSk7XG5cdFx0Ly8gSWYgZmlnIGlzIGluc3RhbGxlZCBpdCBtYXkgY2hhbmdlIHRoZSB0aXRsZSBvZiB0aGUgcHJvY2Vzc1xuXHRcdGxldCBzYW5pdGl6ZWRUaXRsZSA9IHRoaXMuY3VycmVudFRpdGxlLnJlcGxhY2UoLyBcXChmaWd0ZXJtXFwpJC9nLCAnJyk7XG5cdFx0Ly8gRW5zdXJlIGFueSBwcmVmaXhlZCBwYXRoIGlzIHJlbW92ZWQgc28gdGhhdCB0aGUgZXhlY3V0YWJsZSBuYW1lIHNpbmNlIHdlIHVzZSB0aGlzIHRvXG5cdFx0Ly8gZGV0ZWN0IHRoZSBzaGVsbCB0eXBlXG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdHNhbml0aXplZFRpdGxlID0gcGF0aC5iYXNlbmFtZShzYW5pdGl6ZWRUaXRsZSk7XG5cdFx0fVxuXG5cdFx0aWYgKHNhbml0aXplZFRpdGxlLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgncHl0aG9uJykpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZmlyZSh7IHR5cGU6IFByb2Nlc3NQcm9wZXJ0eVR5cGUuU2hlbGxUeXBlLCB2YWx1ZTogR2VuZXJhbFNoZWxsVHlwZS5QeXRob24gfSk7XG5cdFx0fSBlbHNlIGlmIChzYW5pdGl6ZWRUaXRsZS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoJ2p1bGlhJykpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZmlyZSh7IHR5cGU6IFByb2Nlc3NQcm9wZXJ0eVR5cGUuU2hlbGxUeXBlLCB2YWx1ZTogR2VuZXJhbFNoZWxsVHlwZS5KdWxpYSB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgc2hlbGxUeXBlVmFsdWUgPSBwb3NpeFNoZWxsVHlwZU1hcC5nZXQoc2FuaXRpemVkVGl0bGUpIHx8IGdlbmVyYWxTaGVsbFR5cGVNYXAuZ2V0KHNhbml0aXplZFRpdGxlKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZmlyZSh7IHR5cGU6IFByb2Nlc3NQcm9wZXJ0eVR5cGUuU2hlbGxUeXBlLCB2YWx1ZTogc2hlbGxUeXBlVmFsdWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0c2h1dGRvd24oaW1tZWRpYXRlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2xvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSA9PT0gTG9nTGV2ZWwuVHJhY2UpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1Rlcm1pbmFsUHJvY2VzcyNzaHV0ZG93bicsIG5ldyBFcnJvcigpLnN0YWNrPy5yZXBsYWNlKC9eRXJyb3IvLCAnJykpO1xuXHRcdH1cblx0XHQvLyBkb24ndCBmb3JjZSBpbW1lZGlhdGUgZGlzcG9zYWwgb2YgdGhlIHRlcm1pbmFsIHByb2Nlc3NlcyBvbiBXaW5kb3dzIGFzIGFuIGFkZGl0aW9uYWxcblx0XHQvLyBtaXRpZ2F0aW9uIGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNzE5NjYgd2hpY2ggY2F1c2VzIHRoZSBwdHkgaG9zdFxuXHRcdC8vIHRvIGJlY29tZSB1bnJlc3BvbnNpdmUsIGRpc2Nvbm5lY3RpbmcgYWxsIHRlcm1pbmFscyBhY3Jvc3MgYWxsIHdpbmRvd3MuXG5cdFx0aWYgKGltbWVkaWF0ZSAmJiAhaXNXaW5kb3dzKSB7XG5cdFx0XHR0aGlzLl9raWxsKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICghdGhpcy5fY2xvc2VUaW1lb3V0ICYmICF0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHRoaXMuX3F1ZXVlUHJvY2Vzc0V4aXQoKTtcblx0XHRcdFx0Ly8gQWxsb3cgYSBtYXhpbXVtIGFtb3VudCBvZiB0aW1lIGZvciB0aGUgcHJvY2VzcyB0byBleGl0LCBvdGhlcndpc2UgZm9yY2Uga2lsbCBpdFxuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRpZiAodGhpcy5fY2xvc2VUaW1lb3V0ICYmICF0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9jbG9zZVRpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR0aGlzLl9raWxsKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCBTaHV0ZG93bkNvbnN0YW50cy5NYXhpbXVtU2h1dGRvd25UaW1lKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpbnB1dChkYXRhOiBzdHJpbmcsIGlzQmluYXJ5OiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdub2RlLXB0eS5JUHR5I3dyaXRlJywgZGF0YSwgaXNCaW5hcnkpO1xuXHRcdGlmIChpc0JpbmFyeSkge1xuXHRcdFx0dGhpcy5fcHR5UHJvY2VzcyEud3JpdGUoQnVmZmVyLmZyb20oZGF0YSwgJ2JpbmFyeScpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcHR5UHJvY2VzcyEud3JpdGUoZGF0YSk7XG5cdFx0fVxuXHRcdHRoaXMuX2NoaWxkUHJvY2Vzc01vbml0b3I/LmhhbmRsZUlucHV0KCk7XG5cdH1cblxuXHRzZW5kU2lnbmFsKHNpZ25hbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgfHwgIXRoaXMuX3B0eVByb2Nlc3MpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcHR5UHJvY2Vzcy5raWxsKHNpZ25hbCk7XG5cdH1cblxuXHRhc3luYyBwcm9jZXNzQmluYXJ5KGRhdGE6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuaW5wdXQoZGF0YSwgdHJ1ZSk7XG5cdH1cblxuXHRhc3luYyByZWZyZXNoUHJvcGVydHk8VCBleHRlbmRzIFByb2Nlc3NQcm9wZXJ0eVR5cGU+KHR5cGU6IFQpOiBQcm9taXNlPElQcm9jZXNzUHJvcGVydHlNYXBbVF0+IHtcblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdGNhc2UgUHJvY2Vzc1Byb3BlcnR5VHlwZS5Dd2Q6IHtcblx0XHRcdFx0Y29uc3QgbmV3Q3dkID0gYXdhaXQgdGhpcy5nZXRDd2QoKTtcblx0XHRcdFx0aWYgKG5ld0N3ZCAhPT0gdGhpcy5fcHJvcGVydGllcy5jd2QpIHtcblx0XHRcdFx0XHR0aGlzLl9wcm9wZXJ0aWVzLmN3ZCA9IG5ld0N3ZDtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVByb3BlcnR5LmZpcmUoeyB0eXBlOiBQcm9jZXNzUHJvcGVydHlUeXBlLkN3ZCwgdmFsdWU6IHRoaXMuX3Byb3BlcnRpZXMuY3dkIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBuZXdDd2QgYXMgSVByb2Nlc3NQcm9wZXJ0eU1hcFtUXTtcblx0XHRcdH1cblx0XHRcdGNhc2UgUHJvY2Vzc1Byb3BlcnR5VHlwZS5Jbml0aWFsQ3dkOiB7XG5cdFx0XHRcdGNvbnN0IGluaXRpYWxDd2QgPSBhd2FpdCB0aGlzLmdldEluaXRpYWxDd2QoKTtcblx0XHRcdFx0aWYgKGluaXRpYWxDd2QgIT09IHRoaXMuX3Byb3BlcnRpZXMuaW5pdGlhbEN3ZCkge1xuXHRcdFx0XHRcdHRoaXMuX3Byb3BlcnRpZXMuaW5pdGlhbEN3ZCA9IGluaXRpYWxDd2Q7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5maXJlKHsgdHlwZTogUHJvY2Vzc1Byb3BlcnR5VHlwZS5Jbml0aWFsQ3dkLCB2YWx1ZTogdGhpcy5fcHJvcGVydGllcy5pbml0aWFsQ3dkIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBpbml0aWFsQ3dkIGFzIElQcm9jZXNzUHJvcGVydHlNYXBbVF07XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFByb2Nlc3NQcm9wZXJ0eVR5cGUuVGl0bGU6XG5cdFx0XHRcdHJldHVybiB0aGlzLmN1cnJlbnRUaXRsZSBhcyBJUHJvY2Vzc1Byb3BlcnR5TWFwW1RdO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2hlbGxUeXBlIGFzIElQcm9jZXNzUHJvcGVydHlNYXBbVF07XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgdXBkYXRlUHJvcGVydHk8VCBleHRlbmRzIFByb2Nlc3NQcm9wZXJ0eVR5cGU+KHR5cGU6IFQsIHZhbHVlOiBJUHJvY2Vzc1Byb3BlcnR5TWFwW1RdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHR5cGUgPT09IFByb2Nlc3NQcm9wZXJ0eVR5cGUuRml4ZWREaW1lbnNpb25zKSB7XG5cdFx0XHR0aGlzLl9wcm9wZXJ0aWVzLmZpeGVkRGltZW5zaW9ucyA9IHZhbHVlIGFzIElQcm9jZXNzUHJvcGVydHlNYXBbUHJvY2Vzc1Byb3BlcnR5VHlwZS5GaXhlZERpbWVuc2lvbnNdO1xuXHRcdH1cblx0fVxuXG5cdHJlc2l6ZShjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlciwgcGl4ZWxXaWR0aD86IG51bWJlciwgcGl4ZWxIZWlnaHQ/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIWlzTnVtYmVyKGNvbHMpIHx8ICFpc051bWJlcihyb3dzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBFbnN1cmUgdGhhdCBjb2xzIGFuZCByb3dzIGFyZSBhbHdheXMgPj0gMSwgdGhpcyBwcmV2ZW50cyBhIG5hdGl2ZSBleGNlcHRpb24gaW4gd2lucHR5LlxuXHRcdC8vIFRPRE86IEhhbmRsZSB0aGlzIGRpcmVjdGx5IG9uIG5vZGUtcHR5IGluc3RlYWQ6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvbm9kZS1wdHkvaXNzdWVzLzg3N1xuXHRcdGlmICh0aGlzLl9wdHlQcm9jZXNzKSB7XG5cdFx0XHRjb2xzID0gTWF0aC5tYXgoY29scywgMSk7XG5cdFx0XHRyb3dzID0gTWF0aC5tYXgocm93cywgMSk7XG5cblx0XHRcdC8vIERlbGF5IHJlc2l6ZSBpZiBuZWVkZWRcblx0XHRcdGlmICh0aGlzLl9kZWxheWVkUmVzaXplcikge1xuXHRcdFx0XHR0aGlzLl9kZWxheWVkUmVzaXplci5jb2xzID0gY29scztcblx0XHRcdFx0dGhpcy5fZGVsYXllZFJlc2l6ZXIucm93cyA9IHJvd3M7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnbm9kZS1wdHkuSVB0eSNyZXNpemUnLCBjb2xzLCByb3dzKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBpeGVsU2l6ZSA9IHBpeGVsV2lkdGggIT09IHVuZGVmaW5lZCAmJiBwaXhlbEhlaWdodCAhPT0gdW5kZWZpbmVkXG5cdFx0XHRcdFx0PyB7IHdpZHRoOiBwaXhlbFdpZHRoLCBoZWlnaHQ6IHBpeGVsSGVpZ2h0IH1cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fcHR5UHJvY2Vzcy5yZXNpemUoY29scywgcm93cywgcGl4ZWxTaXplKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Ly8gU3dhbGxvdyBlcnJvciBpZiB0aGUgcHR5IGhhcyBhbHJlYWR5IGV4aXRlZFxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdub2RlLXB0eS5JUHR5I3Jlc2l6ZSBleGNlcHRpb24gJyArIGUubWVzc2FnZSk7XG5cdFx0XHRcdGlmICh0aGlzLl9leGl0Q29kZSAhPT0gdW5kZWZpbmVkICYmXG5cdFx0XHRcdFx0ZS5tZXNzYWdlICE9PSAnaW9jdGwoMikgZmFpbGVkLCBFQkFERicgJiZcblx0XHRcdFx0XHRlLm1lc3NhZ2UgIT09ICdDYW5ub3QgcmVzaXplIGEgcHR5IHRoYXQgaGFzIGFscmVhZHkgZXhpdGVkJykge1xuXHRcdFx0XHRcdHRocm93IGU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjbGVhckJ1ZmZlcigpOiB2b2lkIHtcblx0XHR0aGlzLl9wdHlQcm9jZXNzPy5jbGVhcigpO1xuXHR9XG5cblx0YWNrbm93bGVkZ2VEYXRhRXZlbnQoY2hhckNvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBQcmV2ZW50IGxvd2VyIHRoYW4gMCB0byBoZWFsIGZyb20gZXJyb3JzXG5cdFx0dGhpcy5fdW5hY2tub3dsZWRnZWRDaGFyQ291bnQgPSBNYXRoLm1heCh0aGlzLl91bmFja25vd2xlZGdlZENoYXJDb3VudCAtIGNoYXJDb3VudCwgMCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgRmxvdyBjb250cm9sOiBBY2sgJHtjaGFyQ291bnR9IGNoYXJzICh1bmFja25vd2xlZGdlZDogJHt0aGlzLl91bmFja25vd2xlZGdlZENoYXJDb3VudH0pYCk7XG5cdFx0aWYgKHRoaXMuX2lzUHR5UGF1c2VkICYmIHRoaXMuX3VuYWNrbm93bGVkZ2VkQ2hhckNvdW50IDwgRmxvd0NvbnRyb2xDb25zdGFudHMuTG93V2F0ZXJtYXJrQ2hhcnMpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYEZsb3cgY29udHJvbDogUmVzdW1lICgke3RoaXMuX3VuYWNrbm93bGVkZ2VkQ2hhckNvdW50fSA8ICR7Rmxvd0NvbnRyb2xDb25zdGFudHMuTG93V2F0ZXJtYXJrQ2hhcnN9KWApO1xuXHRcdFx0dGhpcy5fcHR5UHJvY2Vzcz8ucmVzdW1lKCk7XG5cdFx0XHR0aGlzLl9pc1B0eVBhdXNlZCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdGNsZWFyVW5hY2tub3dsZWRnZWRDaGFycygpOiB2b2lkIHtcblx0XHR0aGlzLl91bmFja25vd2xlZGdlZENoYXJDb3VudCA9IDA7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgRmxvdyBjb250cm9sOiBDbGVhcmVkIGFsbCB1bmFja25vd2xlZGdlZCBjaGFycywgZm9yY2luZyByZXN1bWVgKTtcblx0XHRpZiAodGhpcy5faXNQdHlQYXVzZWQpIHtcblx0XHRcdHRoaXMuX3B0eVByb2Nlc3M/LnJlc3VtZSgpO1xuXHRcdFx0dGhpcy5faXNQdHlQYXVzZWQgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzZXRVbmljb2RlVmVyc2lvbih2ZXJzaW9uOiAnNicgfCAnMTEnKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gTm8tb3Bcblx0fVxuXG5cdGdldEluaXRpYWxDd2QoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuX2luaXRpYWxDd2QpO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q3dkKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHQvLyBGcm9tIEJpZyBTdXIgKGRhcndpbiB2MjApIHRoZXJlIGlzIGEgc3Bhd24gYmxvY2tpbmcgdGhyZWFkIGlzc3VlIG9uIEVsZWN0cm9uLFxuXHRcdFx0Ly8gdGhpcyBpcyBmaXhlZCBpbiBWUyBDb2RlJ3MgaW50ZXJuYWwgRWxlY3Ryb24uXG5cdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vTWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTA1NDQ2XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8c3RyaW5nPihyZXNvbHZlID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLl9wdHlQcm9jZXNzKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh0aGlzLl9pbml0aWFsQ3dkKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnbm9kZS1wdHkuSVB0eSNwaWQnKTtcblx0XHRcdFx0ZXhlYygnbHNvZiAtT1BsbiAtcCAnICsgdGhpcy5fcHR5UHJvY2Vzcy5waWQgKyAnIHwgZ3JlcCBjd2QnLCB7IGVudjogeyAuLi5wcm9jZXNzLmVudiwgTEFORzogJ2VuX1VTLlVURi04JyB9IH0sIChlcnJvciwgc3Rkb3V0LCBzdGRlcnIpID0+IHtcblx0XHRcdFx0XHRpZiAoIWVycm9yICYmIHN0ZG91dCAhPT0gJycpIHtcblx0XHRcdFx0XHRcdHJlc29sdmUoc3Rkb3V0LnN1YnN0cmluZyhzdGRvdXQuaW5kZXhPZignLycpLCBzdGRvdXQubGVuZ3RoIC0gMSkpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdsc29mIGRpZCBub3QgcnVuIHN1Y2Nlc3NmdWxseSwgaXQgbWF5IG5vdCBiZSBvbiB0aGUgJFBBVEg/JywgZXJyb3IsIHN0ZG91dCwgc3RkZXJyKTtcblx0XHRcdFx0XHRcdHJlc29sdmUodGhpcy5faW5pdGlhbEN3ZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChpc0xpbnV4KSB7XG5cdFx0XHRpZiAoIXRoaXMuX3B0eVByb2Nlc3MpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2luaXRpYWxDd2Q7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdub2RlLXB0eS5JUHR5I3BpZCcpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IGZzLnByb21pc2VzLnJlYWRsaW5rKGAvcHJvYy8ke3RoaXMuX3B0eVByb2Nlc3MucGlkfS9jd2RgKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9pbml0aWFsQ3dkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9pbml0aWFsQ3dkO1xuXHR9XG5cblx0Z2V0V2luZG93c1B0eSgpOiBJUHJvY2Vzc1JlYWR5V2luZG93c1B0eSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGlzV2luZG93cyA/IHtcblx0XHRcdGJhY2tlbmQ6ICdjb25wdHknLFxuXHRcdFx0YnVpbGROdW1iZXI6IGdldFdpbmRvd3NCdWlsZE51bWJlclN5bmMoKVxuXHRcdH0gOiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuLyoqXG4gKiBUcmFja3MgdGhlIGxhdGVzdCByZXNpemUgZXZlbnQgdG8gYmUgdHJpZ2dlciBhdCBhIGxhdGVyIHBvaW50LlxuICovXG5jbGFzcyBEZWxheWVkUmVzaXplciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRyb3dzOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGNvbHM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdGltZW91dDogVGltZW91dDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblRyaWdnZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJvd3M/OiBudW1iZXI7IGNvbHM/OiBudW1iZXIgfT4oKSk7XG5cdGdldCBvblRyaWdnZXIoKTogRXZlbnQ8eyByb3dzPzogbnVtYmVyOyBjb2xzPzogbnVtYmVyIH0+IHsgcmV0dXJuIHRoaXMuX29uVHJpZ2dlci5ldmVudDsgfVxuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25UcmlnZ2VyLmZpcmUoeyByb3dzOiB0aGlzLnJvd3MsIGNvbHM6IHRoaXMuY29scyB9KTtcblx0XHR9LCAxMDAwKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gY2xlYXJUaW1lb3V0KHRoaXMuX3RpbWVvdXQpKSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gaGFzQ29ucHR5T3B0aW9uKG9iajogSVB0eUZvcmtPcHRpb25zIHwgSVdpbmRvd3NQdHlGb3JrT3B0aW9ucyk6IG9iaiBpcyBJV2luZG93c1B0eUZvcmtPcHRpb25zIHtcblx0cmV0dXJuICd1c2VDb25wdHknIGluIG9iajtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksb0JBQW9CO0FBQ3pDLFlBQVksVUFBVTtBQUN0QixTQUE4QixTQUFTLGFBQWEsaUJBQWlCO0FBQ3JFLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWEs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eEM7QUFBQSxFQUVBLE1BQU0sU0FBMEI7QUFDL0IsUUFBSSxhQUFhO0FBSWhCLGFBQU8sSUFBSSxRQUFnQixhQUFXO0FBQ3JDLFlBQUksQ0FBQyxLQUFLLGFBQWE7QUFDdEIsa0JBQVEsS0FBSyxXQUFXO0FBQ3hCO0FBQUEsUUFDRDtBQUNBLGFBQUssWUFBWSxNQUFNLG1CQUFtQjtBQUMxQyxhQUFLLG1CQUFtQixLQUFLLFlBQVksTUFBTSxlQUFlLEVBQUUsS0FBSyxFQUFFLEdBQUcsUUFBUSxLQUFLLE1BQU0sY0FBYyxFQUFFLEdBQUcsQ0FBQyxPQUFPLFFBQVEsV0FBVztBQUMxSSxjQUFJLENBQUMsU0FBUyxXQUFXLElBQUk7QUFDNUIsb0JBQVEsT0FBTyxVQUFVLE9BQU8sUUFBUSxHQUFHLEdBQUcsT0FBTyxTQUFTLENBQUMsQ0FBQztBQUFBLFVBQ2pFLE9BQU87QUFDTixpQkFBSyxZQUFZLE1BQU0sOERBQThELE9BQU8sUUFBUSxNQUFNO0FBQzFHLG9CQUFRLEtBQUssV0FBVztBQUFBLFVBQ3pCO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDRjtBQUVBLFFBQUksU0FBUztBQUNaLFVBQUksQ0FBQyxLQUFLLGFBQWE7QUFDdEIsZUFBTyxLQUFLO0FBQUEsTUFDYjtBQUNBLFdBQUssWUFBWSxNQUFNLG1CQUFtQjtBQUMxQyxVQUFJO0FBQ0gsZUFBTyxNQUFNLEdBQUcsU0FBUyxTQUFTLFNBQVMsS0FBSyxZQUFZLEdBQUcsTUFBTTtBQUFBLE1BQ3RFLFNBQVMsT0FBTztBQUNmLGVBQU8sS0FBSztBQUFBLE1BQ2I7QUFBQSxJQUNEO0FBRUEsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsZ0JBQXFEO0FBQ3BELFdBQU8sWUFBWTtBQUFBLE1BQ2xCLFNBQVM7QUFBQSxNQUNULGFBQWEsMEJBQTBCO0FBQUEsSUFDeEMsSUFBSTtBQUFBLEVBQ0w7QUFDRDtBQXJqQmEsZ0JBaUJHLG1CQUFtQjtBQWpCdEIsa0JBQU47QUFBQSxFQTJESjtBQUFBLEVBQ0E7QUFBQSxHQTVEVTtBQTBqQmIsTUFBTSx1QkFBdUIsV0FBVztBQUFBLEVBUXZDLGNBQWM7QUFDYixVQUFNO0FBSlAsU0FBaUIsYUFBYSxLQUFLLFVBQVUsSUFBSSxRQUEwQyxDQUFDO0FBSzNGLFNBQUssV0FBVyxXQUFXLE1BQU07QUFDaEMsV0FBSyxXQUFXLEtBQUssRUFBRSxNQUFNLEtBQUssTUFBTSxNQUFNLEtBQUssS0FBSyxDQUFDO0FBQUEsSUFDMUQsR0FBRyxHQUFJO0FBQ1AsU0FBSyxVQUFVLGFBQWEsTUFBTSxhQUFhLEtBQUssUUFBUSxDQUFDLENBQUM7QUFBQSxFQUMvRDtBQUFBLEVBUkEsSUFBSSxZQUFxRDtBQUFFLFdBQU8sS0FBSyxXQUFXO0FBQUEsRUFBTztBQVMxRjtBQUVBLFNBQVMsZ0JBQWdCLEtBQThFO0FBQ3RHLFNBQU8sZUFBZTtBQUN2QjsiLAogICJuYW1lcyI6IFsiU2h1dGRvd25Db25zdGFudHMiLCAiQ29uc3RhbnRzIiwgImUiXQp9Cg==
