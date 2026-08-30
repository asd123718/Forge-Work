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
import { execFile, exec } from "child_process";
import { AutoOpenBarrier, ProcessTimeRunOnceScheduler, Promises, Queue, timeout } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { isWindows, OS } from "../../../base/common/platform.js";
import { getSystemShell } from "../../../base/node/shell.js";
import { LogLevel } from "../../log/common/log.js";
import { RequestStore } from "../common/requestStore.js";
import { TitleEventSource, ProcessPropertyType, PosixShellType } from "../common/terminal.js";
import { TerminalDataBufferer } from "../common/terminalDataBuffering.js";
import { escapeNonWindowsPath } from "../common/terminalEnvironment.js";
import { sanitizeEnvForLogging } from "./terminalEnvironment.js";
import { TerminalProcess } from "./terminalProcess.js";
import { localize } from "../../../nls.js";
import { ignoreProcessNames } from "./childProcessMonitor.js";
import { ErrorNoTelemetry } from "../../../base/common/errors.js";
import { ShellIntegrationAddon } from "../common/xterm/shellIntegrationAddon.js";
import { formatMessageForTerminal } from "../common/terminalStrings.js";
import { join } from "../../../base/common/path.js";
import { memoize } from "../../../base/common/decorators.js";
import * as performance from "../../../base/common/performance.js";
import pkg from "@xterm/headless";
import { AutoRepliesPtyServiceContribution } from "./terminalContrib/autoReplies/autoRepliesContribController.js";
import { hasKey, isFunction, isNumber, isString } from "../../../base/common/types.js";
import { getWindowsBuildNumberAsync } from "../../../base/node/windowsVersion.js";
const { Terminal: XtermTerminal } = pkg;
function sanitizeArgsForLogging(fnName, args) {
  if (fnName === "createProcess" && args.length > 5) {
    const sanitizedArgs = [...args];
    if (args[5] && typeof args[5] === "object") {
      sanitizedArgs[5] = sanitizeEnvForLogging(args[5]);
    }
    if (args[6] && typeof args[6] === "object") {
      sanitizedArgs[6] = sanitizeEnvForLogging(args[6]);
    }
    return sanitizedArgs;
  }
  return args;
}
function traceRpc(_target, key, descriptor) {
  if (!isFunction(descriptor.value)) {
    throw new Error("not supported");
  }
  const fnKey = "value";
  const fn = descriptor.value;
  descriptor[fnKey] = async function(...args) {
    if (this.traceRpcArgs.logService.getLevel() === LogLevel.Trace) {
      const sanitizedArgs = sanitizeArgsForLogging(fn.name, args);
      this.traceRpcArgs.logService.trace(`[RPC Request] PtyService#${fn.name}(${sanitizedArgs.map((e) => JSON.stringify(e)).join(", ")})`);
    }
    if (this.traceRpcArgs.simulatedLatency) {
      await timeout(this.traceRpcArgs.simulatedLatency);
    }
    let result;
    try {
      result = await fn.apply(this, args);
    } catch (e) {
      this.traceRpcArgs.logService.error(`[RPC Response] PtyService#${fn.name}`, e);
      throw e;
    }
    if (this.traceRpcArgs.logService.getLevel() === LogLevel.Trace) {
      this.traceRpcArgs.logService.trace(`[RPC Response] PtyService#${fn.name}`, result);
    }
    return result;
  };
}
let SerializeAddon;
let Unicode11Addon;
class PtyService extends Disposable {
  constructor(_logService, _productService, _reconnectConstants, _simulatedLatency) {
    super();
    this._logService = _logService;
    this._productService = _productService;
    this._reconnectConstants = _reconnectConstants;
    this._simulatedLatency = _simulatedLatency;
    this._ptys = /* @__PURE__ */ new Map();
    this._workspaceLayoutInfos = /* @__PURE__ */ new Map();
    this._revivedPtyIdMap = /* @__PURE__ */ new Map();
    this._lastPtyId = 0;
    this._onHeartbeat = this._register(new Emitter());
    this.onHeartbeat = this._traceEvent("_onHeartbeat", this._onHeartbeat.event);
    this._onProcessData = this._register(new Emitter());
    this.onProcessData = this._traceEvent("_onProcessData", this._onProcessData.event);
    this._onProcessReplay = this._register(new Emitter());
    this.onProcessReplay = this._traceEvent("_onProcessReplay", this._onProcessReplay.event);
    this._onProcessReady = this._register(new Emitter());
    this.onProcessReady = this._traceEvent("_onProcessReady", this._onProcessReady.event);
    this._onProcessExit = this._register(new Emitter());
    this.onProcessExit = this._traceEvent("_onProcessExit", this._onProcessExit.event);
    this._onProcessOrphanQuestion = this._register(new Emitter());
    this.onProcessOrphanQuestion = this._traceEvent("_onProcessOrphanQuestion", this._onProcessOrphanQuestion.event);
    this._onDidRequestDetach = this._register(new Emitter());
    this.onDidRequestDetach = this._traceEvent("_onDidRequestDetach", this._onDidRequestDetach.event);
    this._onDidChangeProperty = this._register(new Emitter());
    this.onDidChangeProperty = this._traceEvent("_onDidChangeProperty", this._onDidChangeProperty.event);
    this._register(toDisposable(() => {
      for (const pty of this._ptys.values()) {
        pty.shutdown(true);
      }
      this._ptys.clear();
    }));
    this._detachInstanceRequestStore = this._register(new RequestStore(void 0, this._logService));
    this._register(this._detachInstanceRequestStore.onCreateRequest(this._onDidRequestDetach.fire, this._onDidRequestDetach));
    this._autoRepliesContribution = new AutoRepliesPtyServiceContribution(this._logService);
    this._contributions = [this._autoRepliesContribution];
  }
  async installAutoReply(match, reply) {
    await this._autoRepliesContribution.installAutoReply(match, reply);
  }
  async uninstallAllAutoReplies() {
    await this._autoRepliesContribution.uninstallAllAutoReplies();
  }
  _traceEvent(name, event) {
    event((e) => {
      if (this._logService.getLevel() === LogLevel.Trace) {
        this._logService.trace(`[RPC Event] PtyService#${name}.fire(${JSON.stringify(e)})`);
      }
    });
    return event;
  }
  get traceRpcArgs() {
    return {
      logService: this._logService,
      simulatedLatency: this._simulatedLatency
    };
  }
  async refreshIgnoreProcessNames(names) {
    ignoreProcessNames.length = 0;
    ignoreProcessNames.push(...names);
  }
  async requestDetachInstance(workspaceId, instanceId) {
    return this._detachInstanceRequestStore.createRequest({ workspaceId, instanceId });
  }
  async acceptDetachInstanceReply(requestId, persistentProcessId) {
    let processDetails = void 0;
    const pty = this._ptys.get(persistentProcessId);
    if (pty) {
      processDetails = await this._buildProcessDetails(persistentProcessId, pty);
    }
    this._detachInstanceRequestStore.acceptReply(requestId, processDetails);
  }
  async freePortKillProcess(port) {
    const stdout = await new Promise((resolve, reject) => {
      exec(isWindows ? `netstat -ano | findstr "${port}"` : `lsof -nP -iTCP -sTCP:LISTEN | grep ${port}`, {}, (err, stdout2) => {
        if (err) {
          return reject("Problem occurred when listing active processes");
        }
        resolve(stdout2);
      });
    });
    const processesForPort = stdout.split(/\r?\n/).filter((s) => !!s.trim());
    if (processesForPort.length >= 1) {
      const capturePid = /\s+(\d+)(?:\s+|$)/;
      const processId = processesForPort[0].match(capturePid)?.[1];
      if (processId) {
        try {
          process.kill(Number.parseInt(processId));
        } catch {
        }
      } else {
        throw new Error(`Processes for port ${port} were not found`);
      }
      return { port, processId };
    }
    throw new Error(`Could not kill process with port ${port}`);
  }
  async serializeTerminalState(ids) {
    const promises = [];
    for (const [persistentProcessId, persistentProcess] of this._ptys.entries()) {
      if (persistentProcess.hasWrittenData && ids.indexOf(persistentProcessId) !== -1) {
        promises.push(Promises.withAsyncBody(async (r) => {
          r({
            id: persistentProcessId,
            shellLaunchConfig: persistentProcess.shellLaunchConfig,
            processDetails: await this._buildProcessDetails(persistentProcessId, persistentProcess),
            processLaunchConfig: persistentProcess.processLaunchOptions,
            unicodeVersion: persistentProcess.unicodeVersion,
            replayEvent: await persistentProcess.serializeNormalBuffer(),
            timestamp: Date.now()
          });
        }));
      }
    }
    const serialized = {
      version: 1,
      state: await Promise.all(promises)
    };
    return JSON.stringify(serialized);
  }
  async reviveTerminalProcesses(workspaceId, state, dateTimeFormatLocale) {
    const promises = [];
    for (const terminal of state) {
      promises.push(this._reviveTerminalProcess(workspaceId, terminal));
    }
    await Promise.all(promises);
  }
  async _reviveTerminalProcess(workspaceId, terminal) {
    const restoreMessage = localize("terminal-history-restored", "History restored");
    let postRestoreMessage = "";
    if (isWindows) {
      const lastReplayEvent = terminal.replayEvent.events.length > 0 ? terminal.replayEvent.events.at(-1) : void 0;
      if (lastReplayEvent) {
        postRestoreMessage += "\r\n".repeat(lastReplayEvent.rows - 1) + `\x1B[H`;
      }
    }
    const newId = await this.createProcess(
      {
        ...terminal.shellLaunchConfig,
        cwd: terminal.processDetails.cwd,
        color: terminal.processDetails.color,
        icon: terminal.processDetails.icon,
        name: terminal.processDetails.titleSource === TitleEventSource.Api ? terminal.processDetails.title : void 0,
        initialText: terminal.replayEvent.events[0].data + formatMessageForTerminal(restoreMessage, { loudFormatting: true }) + postRestoreMessage
      },
      terminal.processDetails.cwd,
      terminal.replayEvent.events[0].cols,
      terminal.replayEvent.events[0].rows,
      terminal.unicodeVersion,
      terminal.processLaunchConfig.env,
      terminal.processLaunchConfig.executableEnv,
      terminal.processLaunchConfig.options,
      true,
      terminal.processDetails.workspaceId,
      terminal.processDetails.workspaceName,
      true,
      terminal.replayEvent.events[0].data
    );
    const oldId = this._getRevivingProcessId(workspaceId, terminal.id);
    this._revivedPtyIdMap.set(oldId, { newId, state: terminal });
    this._logService.info(`Revived process, old id ${oldId} -> new id ${newId}`);
  }
  async shutdownAll() {
    this.dispose();
  }
  async createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, executableEnv, options, shouldPersist, workspaceId, workspaceName, isReviving, rawReviveBuffer) {
    if (shellLaunchConfig.attachPersistentProcess) {
      throw new Error("Attempt to create a process when attach object was provided");
    }
    const id = ++this._lastPtyId;
    const process2 = new TerminalProcess(shellLaunchConfig, cwd, cols, rows, env, executableEnv, options, this._logService, this._productService);
    const processLaunchOptions = {
      env,
      executableEnv,
      options
    };
    const persistentProcess = new PersistentTerminalProcess(id, process2, workspaceId, workspaceName, shouldPersist, cols, rows, processLaunchOptions, unicodeVersion, this._reconnectConstants, this._logService, isReviving && isString(shellLaunchConfig.initialText) ? shellLaunchConfig.initialText : void 0, rawReviveBuffer, shellLaunchConfig.icon, shellLaunchConfig.color, shellLaunchConfig.name, shellLaunchConfig.fixedDimensions);
    process2.onProcessExit((event) => {
      for (const contrib of this._contributions) {
        contrib.handleProcessDispose(id);
      }
      persistentProcess.dispose();
      this._ptys.delete(id);
      this._onProcessExit.fire({ id, event });
    });
    persistentProcess.onProcessData((event) => this._onProcessData.fire({ id, event }));
    persistentProcess.onProcessReplay((event) => this._onProcessReplay.fire({ id, event }));
    persistentProcess.onProcessReady((event) => this._onProcessReady.fire({ id, event }));
    persistentProcess.onProcessOrphanQuestion(() => this._onProcessOrphanQuestion.fire({ id }));
    persistentProcess.onDidChangeProperty((property) => this._onDidChangeProperty.fire({ id, property }));
    persistentProcess.onPersistentProcessReady(() => {
      for (const contrib of this._contributions) {
        contrib.handleProcessReady(id, process2);
      }
    });
    this._ptys.set(id, persistentProcess);
    return id;
  }
  async attachToProcess(id) {
    try {
      await this._throwIfNoPty(id).attach();
      this._logService.info(`Persistent process reconnection "${id}"`);
    } catch (e) {
      this._logService.warn(`Persistent process reconnection "${id}" failed`, e.message);
      throw e;
    }
  }
  async updateTitle(id, title, titleSource) {
    this._throwIfNoPty(id).setTitle(title, titleSource);
  }
  async updateIcon(id, userInitiated, icon, color) {
    this._throwIfNoPty(id).setIcon(userInitiated, icon, color);
  }
  async clearBuffer(id) {
    this._throwIfNoPty(id).clearBuffer();
  }
  async refreshProperty(id, type) {
    return this._throwIfNoPty(id).refreshProperty(type);
  }
  async updateProperty(id, type, value) {
    return this._throwIfNoPty(id).updateProperty(type, value);
  }
  async detachFromProcess(id, forcePersist) {
    return this._throwIfNoPty(id).detach(forcePersist);
  }
  async reduceConnectionGraceTime() {
    for (const pty of this._ptys.values()) {
      pty.reduceGraceTime();
    }
  }
  async listProcesses() {
    const persistentProcesses = Array.from(this._ptys.entries()).filter(([_, pty]) => pty.shouldPersistTerminal);
    this._logService.info(`Listing ${persistentProcesses.length} persistent terminals, ${this._ptys.size} total terminals`);
    const promises = persistentProcesses.map(async ([id, terminalProcessData]) => this._buildProcessDetails(id, terminalProcessData));
    const allTerminals = await Promise.all(promises);
    return allTerminals.filter((entry) => entry.isOrphan);
  }
  async getPerformanceMarks() {
    return performance.getMarks();
  }
  async start(id) {
    const pty = this._ptys.get(id);
    return pty ? pty.start() : { message: `Could not find pty with id "${id}"` };
  }
  async shutdown(id, immediate) {
    return this._ptys.get(id)?.shutdown(immediate);
  }
  async input(id, data) {
    const pty = this._throwIfNoPty(id);
    if (pty) {
      for (const contrib of this._contributions) {
        contrib.handleProcessInput(id, data);
      }
      pty.input(data);
    }
  }
  async sendSignal(id, signal) {
    return this._throwIfNoPty(id).sendSignal(signal);
  }
  async processBinary(id, data) {
    return this._throwIfNoPty(id).writeBinary(data);
  }
  async resize(id, cols, rows, pixelWidth, pixelHeight) {
    const pty = this._throwIfNoPty(id);
    if (pty) {
      for (const contrib of this._contributions) {
        contrib.handleProcessResize(id, cols, rows, pixelWidth, pixelHeight);
      }
      pty.resize(cols, rows, pixelWidth, pixelHeight);
    }
  }
  async getInitialCwd(id) {
    return this._throwIfNoPty(id).getInitialCwd();
  }
  async getCwd(id) {
    return this._throwIfNoPty(id).getCwd();
  }
  async acknowledgeDataEvent(id, charCount) {
    return this._throwIfNoPty(id).acknowledgeDataEvent(charCount);
  }
  async setUnicodeVersion(id, version) {
    return this._throwIfNoPty(id).setUnicodeVersion(version);
  }
  async setNextCommandId(id, commandLine, commandId) {
    return this._throwIfNoPty(id).setNextCommandId(commandLine, commandId);
  }
  async getLatency() {
    return [];
  }
  async orphanQuestionReply(id) {
    return this._throwIfNoPty(id).orphanQuestionReply();
  }
  async getDefaultSystemShell(osOverride = OS) {
    return getSystemShell(osOverride, process.env);
  }
  async getEnvironment() {
    return { ...process.env };
  }
  async getWslPath(original, direction) {
    if (direction === "win-to-unix") {
      if (!isWindows) {
        return original;
      }
      if (await getWindowsBuildNumberAsync() < 17063) {
        return original.replace(/\\/g, "/");
      }
      const wslExecutable = await this._getWSLExecutablePath();
      if (!wslExecutable) {
        return original;
      }
      return new Promise((c) => {
        const proc = execFile(wslExecutable, ["-e", "wslpath", original], {}, (error, stdout, stderr) => {
          c(error ? original : escapeNonWindowsPath(stdout.trim(), PosixShellType.Bash));
        });
        proc.stdin.end();
      });
    }
    if (direction === "unix-to-win") {
      if (isWindows) {
        if (await getWindowsBuildNumberAsync() < 17063) {
          return original;
        }
        const wslExecutable = await this._getWSLExecutablePath();
        if (!wslExecutable) {
          return original;
        }
        return new Promise((c) => {
          const proc = execFile(wslExecutable, ["-e", "wslpath", "-w", original], {}, (error, stdout, stderr) => {
            c(error ? original : stdout.trim());
          });
          proc.stdin.end();
        });
      }
    }
    return original;
  }
  async _getWSLExecutablePath() {
    const useWSLexe = await getWindowsBuildNumberAsync() >= 16299;
    const is32ProcessOn64Windows = process.env.hasOwnProperty("PROCESSOR_ARCHITEW6432");
    const systemRoot = process.env["SystemRoot"];
    if (systemRoot) {
      return join(systemRoot, is32ProcessOn64Windows ? "Sysnative" : "System32", useWSLexe ? "wsl.exe" : "bash.exe");
    }
    return void 0;
  }
  async getRevivedPtyNewId(workspaceId, id) {
    try {
      return this._revivedPtyIdMap.get(this._getRevivingProcessId(workspaceId, id))?.newId;
    } catch (e) {
      this._logService.warn(`Couldn't find terminal ID ${workspaceId}-${id}`, e.message);
    }
    return void 0;
  }
  async setTerminalLayoutInfo(args) {
    this._workspaceLayoutInfos.set(args.workspaceId, args);
  }
  async getTerminalLayoutInfo(args) {
    performance.mark("code/willGetTerminalLayoutInfo");
    const layout = this._workspaceLayoutInfos.get(args.workspaceId);
    if (layout) {
      const doneSet = /* @__PURE__ */ new Set();
      const expandedTabs = await Promise.all(layout.tabs.map(async (tab) => this._expandTerminalTab(args.workspaceId, tab, doneSet)));
      const tabs = expandedTabs.filter((t) => t.terminals.length > 0);
      const expandedBackground = (await Promise.all(layout.background?.map((b) => this._expandTerminalInstance(args.workspaceId, b, doneSet)) ?? [])).filter((b) => b.terminal !== null).map((b) => b.terminal);
      performance.mark("code/didGetTerminalLayoutInfo");
      return { tabs, background: expandedBackground };
    }
    performance.mark("code/didGetTerminalLayoutInfo");
    return void 0;
  }
  async _expandTerminalTab(workspaceId, tab, doneSet) {
    const expandedTerminals = await Promise.all(tab.terminals.map((t) => this._expandTerminalInstance(workspaceId, t, doneSet)));
    const filtered = expandedTerminals.filter((term) => term.terminal !== null);
    return {
      isActive: tab.isActive,
      activePersistentProcessId: tab.activePersistentProcessId,
      terminals: filtered
    };
  }
  async _expandTerminalInstance(workspaceId, t, doneSet) {
    const hasLayout = !isNumber(t);
    const ptyId = hasLayout ? t.terminal : t;
    try {
      const oldId = this._getRevivingProcessId(workspaceId, ptyId);
      const revivedPtyId = this._revivedPtyIdMap.get(oldId)?.newId;
      this._logService.info(`Expanding terminal instance, old id ${oldId} -> new id ${revivedPtyId}`);
      this._revivedPtyIdMap.delete(oldId);
      const persistentProcessId = revivedPtyId ?? ptyId;
      if (doneSet.has(persistentProcessId)) {
        throw new Error(`Terminal ${persistentProcessId} has already been expanded`);
      }
      doneSet.add(persistentProcessId);
      const persistentProcess = this._throwIfNoPty(persistentProcessId);
      const processDetails = persistentProcess && await this._buildProcessDetails(ptyId, persistentProcess, revivedPtyId !== void 0);
      return {
        terminal: { ...processDetails, id: persistentProcessId },
        relativeSize: hasLayout ? t.relativeSize : 0
      };
    } catch (e) {
      this._logService.warn(`Couldn't get layout info, a terminal was probably disconnected`, e.message);
      this._logService.debug("Reattach to wrong terminal debug info - layout info by id", t);
      this._logService.debug("Reattach to wrong terminal debug info - _revivePtyIdMap", Array.from(this._revivedPtyIdMap.values()));
      this._logService.debug("Reattach to wrong terminal debug info - _ptys ids", Array.from(this._ptys.keys()));
      return {
        terminal: null,
        relativeSize: hasLayout ? t.relativeSize : 0
      };
    }
  }
  _getRevivingProcessId(workspaceId, ptyId) {
    return `${workspaceId}-${ptyId}`;
  }
  async _buildProcessDetails(id, persistentProcess, wasRevived = false) {
    performance.mark(`code/willBuildProcessDetails/${id}`);
    const [cwd, isOrphan] = await Promise.all([persistentProcess.getCwd(), wasRevived ? true : persistentProcess.isOrphaned()]);
    const result = {
      id,
      title: persistentProcess.title,
      titleSource: persistentProcess.titleSource,
      pid: persistentProcess.pid,
      workspaceId: persistentProcess.workspaceId,
      workspaceName: persistentProcess.workspaceName,
      cwd,
      isOrphan,
      icon: persistentProcess.icon,
      color: persistentProcess.color,
      fixedDimensions: persistentProcess.fixedDimensions,
      environmentVariableCollections: persistentProcess.processLaunchOptions.options.environmentVariableCollections,
      reconnectionProperties: persistentProcess.shellLaunchConfig.reconnectionProperties,
      waitOnExit: persistentProcess.shellLaunchConfig.waitOnExit,
      hideFromUser: persistentProcess.shellLaunchConfig.hideFromUser,
      isFeatureTerminal: persistentProcess.shellLaunchConfig.isFeatureTerminal,
      type: persistentProcess.shellLaunchConfig.type,
      hasChildProcesses: persistentProcess.hasChildProcesses,
      shellIntegrationNonce: persistentProcess.processLaunchOptions.options.shellIntegration.nonce,
      tabActions: persistentProcess.shellLaunchConfig.tabActions
    };
    performance.mark(`code/didBuildProcessDetails/${id}`);
    return result;
  }
  _throwIfNoPty(id) {
    const pty = this._ptys.get(id);
    if (!pty) {
      throw new ErrorNoTelemetry(`Could not find pty ${id} on pty host`);
    }
    return pty;
  }
}
__decorateClass([
  traceRpc
], PtyService.prototype, "installAutoReply", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "uninstallAllAutoReplies", 1);
__decorateClass([
  memoize
], PtyService.prototype, "traceRpcArgs", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "refreshIgnoreProcessNames", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "requestDetachInstance", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "acceptDetachInstanceReply", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "freePortKillProcess", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "serializeTerminalState", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "reviveTerminalProcesses", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "shutdownAll", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "createProcess", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "attachToProcess", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "updateTitle", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "updateIcon", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "clearBuffer", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "refreshProperty", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "updateProperty", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "detachFromProcess", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "reduceConnectionGraceTime", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "listProcesses", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "getPerformanceMarks", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "start", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "shutdown", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "input", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "sendSignal", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "processBinary", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "resize", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "getInitialCwd", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "getCwd", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "acknowledgeDataEvent", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "setUnicodeVersion", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "setNextCommandId", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "getLatency", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "orphanQuestionReply", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "getDefaultSystemShell", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "getEnvironment", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "getWslPath", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "getRevivedPtyNewId", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "setTerminalLayoutInfo", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "getTerminalLayoutInfo", 1);
var InteractionState = /* @__PURE__ */ ((InteractionState2) => {
  InteractionState2["None"] = "None";
  InteractionState2["ReplayOnly"] = "ReplayOnly";
  InteractionState2["Session"] = "Session";
  return InteractionState2;
})(InteractionState || {});
class PersistentTerminalProcess extends Disposable {
  constructor(_persistentProcessId, _terminalProcess, workspaceId, workspaceName, shouldPersistTerminal, cols, rows, processLaunchOptions, unicodeVersion, reconnectConstants, _logService, reviveBuffer, rawReviveBuffer, _icon, _color, name, fixedDimensions) {
    super();
    this._persistentProcessId = _persistentProcessId;
    this._terminalProcess = _terminalProcess;
    this.workspaceId = workspaceId;
    this.workspaceName = workspaceName;
    this.shouldPersistTerminal = shouldPersistTerminal;
    this.processLaunchOptions = processLaunchOptions;
    this.unicodeVersion = unicodeVersion;
    this._logService = _logService;
    this._icon = _icon;
    this._color = _color;
    this._pendingCommands = /* @__PURE__ */ new Map();
    this._isStarted = false;
    this._orphanRequestQueue = new Queue();
    this._onProcessReplay = this._register(new Emitter());
    this.onProcessReplay = this._onProcessReplay.event;
    this._onProcessReady = this._register(new Emitter());
    this.onProcessReady = this._onProcessReady.event;
    this._onPersistentProcessReady = this._register(new Emitter());
    /** Fired when the persistent process has a ready process and has finished its replay. */
    this.onPersistentProcessReady = this._onPersistentProcessReady.event;
    this._onProcessData = this._register(new Emitter());
    this.onProcessData = this._onProcessData.event;
    this._onProcessOrphanQuestion = this._register(new Emitter());
    this.onProcessOrphanQuestion = this._onProcessOrphanQuestion.event;
    this._onDidChangeProperty = this._register(new Emitter());
    this.onDidChangeProperty = this._onDidChangeProperty.event;
    this._inReplay = false;
    this._pid = -1;
    this._cwd = "";
    this._titleSource = TitleEventSource.Process;
    this._interactionState = new MutationLogger(`Persistent process "${this._persistentProcessId}" interaction state`, "None" /* None */, this._logService);
    this._wasRevived = reviveBuffer !== void 0;
    this._serializer = new XtermSerializer(
      cols,
      rows,
      reconnectConstants.scrollback,
      unicodeVersion,
      reviveBuffer,
      processLaunchOptions.options.shellIntegration.nonce,
      shouldPersistTerminal ? rawReviveBuffer : void 0,
      this._logService
    );
    if (name) {
      this.setTitle(name, TitleEventSource.Api);
    }
    this._fixedDimensions = fixedDimensions;
    this._orphanQuestionBarrier = null;
    this._orphanQuestionReplyTime = 0;
    this._disconnectRunner1 = this._register(new ProcessTimeRunOnceScheduler(() => {
      this._logService.info(`Persistent process "${this._persistentProcessId}": The reconnection grace time of ${printTime(reconnectConstants.graceTime)} has expired, shutting down pid "${this._pid}"`);
      this.shutdown(true);
    }, reconnectConstants.graceTime));
    this._disconnectRunner2 = this._register(new ProcessTimeRunOnceScheduler(() => {
      this._logService.info(`Persistent process "${this._persistentProcessId}": The short reconnection grace time of ${printTime(reconnectConstants.shortGraceTime)} has expired, shutting down pid ${this._pid}`);
      this.shutdown(true);
    }, reconnectConstants.shortGraceTime));
    this._register(this._terminalProcess.onProcessExit(() => this._bufferer.stopBuffering(this._persistentProcessId)));
    this._register(this._terminalProcess.onProcessReady((e) => {
      this._pid = e.pid;
      this._cwd = e.cwd;
      this._onProcessReady.fire(e);
    }));
    this._register(this._terminalProcess.onDidChangeProperty((e) => {
      this._onDidChangeProperty.fire(e);
    }));
    this._bufferer = new TerminalDataBufferer((_, data) => this._onProcessData.fire(data));
    this._register(this._bufferer.startBuffering(this._persistentProcessId, this._terminalProcess.onProcessData));
    this._register(this.onProcessData((e) => this._serializer.handleData(e)));
  }
  get pid() {
    return this._pid;
  }
  get shellLaunchConfig() {
    return this._terminalProcess.shellLaunchConfig;
  }
  get hasWrittenData() {
    return this._interactionState.value !== "None" /* None */;
  }
  get title() {
    return this._title || this._terminalProcess.currentTitle;
  }
  get titleSource() {
    return this._titleSource;
  }
  get icon() {
    return this._icon;
  }
  get color() {
    return this._color;
  }
  get fixedDimensions() {
    return this._fixedDimensions;
  }
  get hasChildProcesses() {
    return this._terminalProcess.hasChildProcesses;
  }
  setTitle(title, titleSource) {
    if (titleSource === TitleEventSource.Api) {
      this._interactionState.setValue("Session" /* Session */, "setTitle");
      this._serializer.freeRawReviveBuffer();
    }
    this._title = title;
    this._titleSource = titleSource;
  }
  setIcon(userInitiated, icon, color) {
    if (!this._icon || hasKey(icon, { id: true }) && hasKey(this._icon, { id: true }) && icon.id !== this._icon.id || !this.color || color !== this._color) {
      this._serializer.freeRawReviveBuffer();
      if (userInitiated) {
        this._interactionState.setValue("Session" /* Session */, "setIcon");
      }
    }
    this._icon = icon;
    this._color = color;
  }
  _setFixedDimensions(fixedDimensions) {
    this._fixedDimensions = fixedDimensions;
  }
  async attach() {
    if (!this._disconnectRunner1.isScheduled() && !this._disconnectRunner2.isScheduled()) {
      this._logService.warn(`Persistent process "${this._persistentProcessId}": Process had no disconnect runners but was an orphan`);
    }
    this._disconnectRunner1.cancel();
    this._disconnectRunner2.cancel();
  }
  async detach(forcePersist) {
    if (this.shouldPersistTerminal && (this._interactionState.value !== "None" /* None */ || forcePersist)) {
      this._disconnectRunner1.schedule();
    } else {
      this.shutdown(true);
    }
  }
  serializeNormalBuffer() {
    return this._serializer.generateReplayEvent(true, this._interactionState.value !== "Session" /* Session */);
  }
  async refreshProperty(type) {
    return this._terminalProcess.refreshProperty(type);
  }
  async updateProperty(type, value) {
    if (type === ProcessPropertyType.FixedDimensions) {
      return this._setFixedDimensions(value);
    }
  }
  async start() {
    if (!this._isStarted) {
      const result = await this._terminalProcess.start();
      if (result && hasKey(result, { message: true })) {
        return result;
      }
      this._isStarted = true;
      if (this._wasRevived) {
        this.triggerReplay();
      } else {
        this._onPersistentProcessReady.fire();
      }
      return result;
    }
    this._onProcessReady.fire({ pid: this._pid, cwd: this._cwd, windowsPty: this._terminalProcess.getWindowsPty() });
    this._onDidChangeProperty.fire({ type: ProcessPropertyType.Title, value: this._terminalProcess.currentTitle });
    this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellType, value: this._terminalProcess.shellType });
    this.triggerReplay();
    return void 0;
  }
  shutdown(immediate) {
    return this._terminalProcess.shutdown(immediate);
  }
  input(data) {
    this._interactionState.setValue("Session" /* Session */, "input");
    this._serializer.freeRawReviveBuffer();
    if (this._inReplay) {
      return;
    }
    return this._terminalProcess.input(data);
  }
  sendSignal(signal) {
    if (this._inReplay) {
      return;
    }
    return this._terminalProcess.sendSignal(signal);
  }
  writeBinary(data) {
    return this._terminalProcess.processBinary(data);
  }
  resize(cols, rows, pixelWidth, pixelHeight) {
    if (this._inReplay) {
      return;
    }
    this._serializer.handleResize(cols, rows);
    this._bufferer.flushBuffer(this._persistentProcessId);
    return this._terminalProcess.resize(cols, rows, pixelWidth, pixelHeight);
  }
  async clearBuffer() {
    this._serializer.clearBuffer();
    this._terminalProcess.clearBuffer();
  }
  setUnicodeVersion(version) {
    this.unicodeVersion = version;
    this._serializer.setUnicodeVersion?.(version);
  }
  async setNextCommandId(commandLine, commandId) {
    this._serializer.setNextCommandId?.(commandLine, commandId);
  }
  acknowledgeDataEvent(charCount) {
    if (this._inReplay) {
      return;
    }
    return this._terminalProcess.acknowledgeDataEvent(charCount);
  }
  getInitialCwd() {
    return this._terminalProcess.getInitialCwd();
  }
  getCwd() {
    return this._terminalProcess.getCwd();
  }
  async triggerReplay() {
    if (this._interactionState.value === "None" /* None */) {
      this._interactionState.setValue("ReplayOnly" /* ReplayOnly */, "triggerReplay");
    }
    const ev = await this._serializer.generateReplayEvent();
    let dataLength = 0;
    for (const e of ev.events) {
      dataLength += e.data.length;
    }
    this._logService.info(`Persistent process "${this._persistentProcessId}": Replaying ${dataLength} chars and ${ev.events.length} size events`);
    this._onProcessReplay.fire(ev);
    this._terminalProcess.clearUnacknowledgedChars();
    this._onPersistentProcessReady.fire();
  }
  sendCommandResult(reqId, isError, serializedPayload) {
    const data = this._pendingCommands.get(reqId);
    if (!data) {
      return;
    }
    this._pendingCommands.delete(reqId);
  }
  orphanQuestionReply() {
    this._orphanQuestionReplyTime = Date.now();
    if (this._orphanQuestionBarrier) {
      const barrier = this._orphanQuestionBarrier;
      this._orphanQuestionBarrier = null;
      barrier.open();
    }
  }
  reduceGraceTime() {
    if (this._disconnectRunner2.isScheduled()) {
      return;
    }
    if (this._disconnectRunner1.isScheduled()) {
      this._disconnectRunner2.schedule();
    }
  }
  async isOrphaned() {
    return await this._orphanRequestQueue.queue(async () => this._isOrphaned());
  }
  async _isOrphaned() {
    if (this._disconnectRunner1.isScheduled() || this._disconnectRunner2.isScheduled()) {
      return true;
    }
    if (!this._orphanQuestionBarrier) {
      this._orphanQuestionBarrier = new AutoOpenBarrier(4e3);
      this._orphanQuestionReplyTime = 0;
      this._onProcessOrphanQuestion.fire();
    }
    await this._orphanQuestionBarrier.wait();
    return Date.now() - this._orphanQuestionReplyTime > 500;
  }
}
class MutationLogger {
  constructor(_name, _value, _logService) {
    this._name = _name;
    this._value = _value;
    this._logService = _logService;
    this._log("initialized");
  }
  get value() {
    return this._value;
  }
  setValue(value, reason) {
    if (this._value !== value) {
      this._value = value;
      this._log(reason);
    }
  }
  _log(reason) {
    this._logService.debug(`MutationLogger "${this._name}" set to "${this._value}", reason: ${reason}`);
  }
}
class XtermSerializer {
  constructor(cols, rows, scrollback, unicodeVersion, reviveBufferWithRestoreMessage, shellIntegrationNonce, _rawReviveBuffer, logService) {
    this._rawReviveBuffer = _rawReviveBuffer;
    this._xterm = new XtermTerminal({
      cols,
      rows,
      scrollback,
      allowProposedApi: true
    });
    if (reviveBufferWithRestoreMessage) {
      this._xterm.writeln(reviveBufferWithRestoreMessage);
    }
    this.setUnicodeVersion(unicodeVersion);
    this._shellIntegrationAddon = new ShellIntegrationAddon(shellIntegrationNonce, true, void 0, void 0, logService);
    this._xterm.loadAddon(this._shellIntegrationAddon);
  }
  freeRawReviveBuffer() {
    this._rawReviveBuffer = void 0;
  }
  handleData(data) {
    this._xterm.write(data);
  }
  handleResize(cols, rows) {
    this._xterm.resize(cols, rows);
  }
  clearBuffer() {
    this._xterm.clear();
  }
  setNextCommandId(commandLine, commandId) {
    this._shellIntegrationAddon.setNextCommandId(commandLine, commandId);
  }
  async generateReplayEvent(normalBufferOnly, restoreToLastReviveBuffer) {
    const serialize = new (await this._getSerializeConstructor())();
    this._xterm.loadAddon(serialize);
    const options = {
      scrollback: this._xterm.options.scrollback
    };
    if (normalBufferOnly) {
      options.excludeAltBuffer = true;
      options.excludeModes = true;
    }
    let serialized;
    if (restoreToLastReviveBuffer && this._rawReviveBuffer) {
      serialized = this._rawReviveBuffer;
    } else {
      serialized = serialize.serialize(options);
    }
    return {
      events: [
        {
          cols: this._xterm.cols,
          rows: this._xterm.rows,
          data: serialized
        }
      ],
      commands: this._shellIntegrationAddon.serialize()
    };
  }
  async setUnicodeVersion(version) {
    if (this._xterm.unicode.activeVersion === version) {
      return;
    }
    if (version === "11") {
      this._unicodeAddon = new (await this._getUnicode11Constructor())();
      this._xterm.loadAddon(this._unicodeAddon);
    } else {
      this._unicodeAddon?.dispose();
      this._unicodeAddon = void 0;
    }
    this._xterm.unicode.activeVersion = version;
  }
  async _getUnicode11Constructor() {
    if (!Unicode11Addon) {
      Unicode11Addon = (await import("@xterm/addon-unicode11")).Unicode11Addon;
    }
    return Unicode11Addon;
  }
  async _getSerializeConstructor() {
    if (!SerializeAddon) {
      SerializeAddon = (await import("@xterm/addon-serialize")).SerializeAddon;
    }
    return SerializeAddon;
  }
}
function printTime(ms) {
  let h = 0;
  let m = 0;
  let s = 0;
  if (ms >= 1e3) {
    s = Math.floor(ms / 1e3);
    ms -= s * 1e3;
  }
  if (s >= 60) {
    m = Math.floor(s / 60);
    s -= m * 60;
  }
  if (m >= 60) {
    h = Math.floor(m / 60);
    m -= h * 60;
  }
  const _h = h ? `${h}h` : ``;
  const _m = m ? `${m}m` : ``;
  const _s = s ? `${s}s` : ``;
  const _ms = ms ? `${ms}ms` : ``;
  return `${_h}${_m}${_s}${_ms}`;
}
export {
  PtyService,
  traceRpc
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXG5vZGVcXHB0eVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBleGVjRmlsZSwgZXhlYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgQXV0b09wZW5CYXJyaWVyLCBQcm9jZXNzVGltZVJ1bk9uY2VTY2hlZHVsZXIsIFByb21pc2VzLCBRdWV1ZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElQcm9jZXNzRW52aXJvbm1lbnQsIGlzV2luZG93cywgT3BlcmF0aW5nU3lzdGVtLCBPUyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZXRTeXN0ZW1TaGVsbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9zaGVsbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBSZXF1ZXN0U3RvcmUgfSBmcm9tICcuLi9jb21tb24vcmVxdWVzdFN0b3JlLmpzJztcbmltcG9ydCB7IElQcm9jZXNzRGF0YUV2ZW50LCBJUHJvY2Vzc1JlYWR5RXZlbnQsIElQdHlTZXJ2aWNlLCBJUmF3VGVybWluYWxJbnN0YW5jZUxheW91dEluZm8sIElSZWNvbm5lY3RDb25zdGFudHMsIElTaGVsbExhdW5jaENvbmZpZywgSVRlcm1pbmFsSW5zdGFuY2VMYXlvdXRJbmZvQnlJZCwgSVRlcm1pbmFsTGF1bmNoRXJyb3IsIElUZXJtaW5hbHNMYXlvdXRJbmZvLCBJVGVybWluYWxUYWJMYXlvdXRJbmZvQnlJZCwgVGVybWluYWxJY29uLCBJUHJvY2Vzc1Byb3BlcnR5LCBUaXRsZUV2ZW50U291cmNlLCBQcm9jZXNzUHJvcGVydHlUeXBlLCBJUHJvY2Vzc1Byb3BlcnR5TWFwLCBJRml4ZWRUZXJtaW5hbERpbWVuc2lvbnMsIElQZXJzaXN0ZW50VGVybWluYWxQcm9jZXNzTGF1bmNoQ29uZmlnLCBJQ3Jvc3NWZXJzaW9uU2VyaWFsaXplZFRlcm1pbmFsU3RhdGUsIElTZXJpYWxpemVkVGVybWluYWxTdGF0ZSwgSVRlcm1pbmFsUHJvY2Vzc09wdGlvbnMsIElQdHlIb3N0TGF0ZW5jeU1lYXN1cmVtZW50LCB0eXBlIElQdHlTZXJ2aWNlQ29udHJpYnV0aW9uLCBQb3NpeFNoZWxsVHlwZSwgSVRlcm1pbmFsTGF1bmNoUmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsRGF0YUJ1ZmZlcmVyIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsRGF0YUJ1ZmZlcmluZy5qcyc7XG5pbXBvcnQgeyBlc2NhcGVOb25XaW5kb3dzUGF0aCB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbEVudmlyb25tZW50LmpzJztcbmltcG9ydCB0eXBlIHsgSVNlcmlhbGl6ZU9wdGlvbnMsIFNlcmlhbGl6ZUFkZG9uIGFzIFh0ZXJtU2VyaWFsaXplQWRkb24gfSBmcm9tICdAeHRlcm0vYWRkb24tc2VyaWFsaXplJztcbmltcG9ydCB0eXBlIHsgVW5pY29kZTExQWRkb24gYXMgWHRlcm1Vbmljb2RlMTFBZGRvbiB9IGZyb20gJ0B4dGVybS9hZGRvbi11bmljb2RlMTEnO1xuaW1wb3J0IHsgSUdldFRlcm1pbmFsTGF5b3V0SW5mb0FyZ3MsIElQcm9jZXNzRGV0YWlscywgSVNldFRlcm1pbmFsTGF5b3V0SW5mb0FyZ3MsIElUZXJtaW5hbFRhYkxheW91dEluZm9EdG8gfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxQcm9jZXNzLmpzJztcbmltcG9ydCB7IHNhbml0aXplRW52Rm9yTG9nZ2luZyB9IGZyb20gJy4vdGVybWluYWxFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFByb2Nlc3MgfSBmcm9tICcuL3Rlcm1pbmFsUHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBpZ25vcmVQcm9jZXNzTmFtZXMgfSBmcm9tICcuL2NoaWxkUHJvY2Vzc01vbml0b3IuanMnO1xuaW1wb3J0IHsgRXJyb3JOb1RlbGVtZXRyeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBTaGVsbEludGVncmF0aW9uQWRkb24gfSBmcm9tICcuLi9jb21tb24veHRlcm0vc2hlbGxJbnRlZ3JhdGlvbkFkZG9uLmpzJztcbmltcG9ydCB7IGZvcm1hdE1lc3NhZ2VGb3JUZXJtaW5hbCB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbFN0cmluZ3MuanMnO1xuaW1wb3J0IHsgSVB0eUhvc3RQcm9jZXNzUmVwbGF5RXZlbnQgfSBmcm9tICcuLi9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgKiBhcyBwZXJmb3JtYW5jZSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgcGtnIGZyb20gJ0B4dGVybS9oZWFkbGVzcyc7XG5pbXBvcnQgeyBBdXRvUmVwbGllc1B0eVNlcnZpY2VDb250cmlidXRpb24gfSBmcm9tICcuL3Rlcm1pbmFsQ29udHJpYi9hdXRvUmVwbGllcy9hdXRvUmVwbGllc0NvbnRyaWJDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IGhhc0tleSwgaXNGdW5jdGlvbiwgaXNOdW1iZXIsIGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZ2V0V2luZG93c0J1aWxkTnVtYmVyQXN5bmMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvd2luZG93c1ZlcnNpb24uanMnO1xuXG50eXBlIFh0ZXJtVGVybWluYWwgPSBwa2cuVGVybWluYWw7XG5jb25zdCB7IFRlcm1pbmFsOiBYdGVybVRlcm1pbmFsIH0gPSBwa2c7XG5cbi8qKlxuICogU2FuaXRpemVzIGFyZ3VtZW50cyBmb3IgbG9nZ2luZywgc3BlY2lmaWNhbGx5IGhhbmRsaW5nIGVudiBvYmplY3RzIGluIGNyZWF0ZVByb2Nlc3MgY2FsbHMuXG4gKi9cbmZ1bmN0aW9uIHNhbml0aXplQXJnc0ZvckxvZ2dpbmcoZm5OYW1lOiBzdHJpbmcsIGFyZ3M6IHVua25vd25bXSk6IHVua25vd25bXSB7XG5cdC8vIGNyZWF0ZVByb2Nlc3Mgc2lnbmF0dXJlOiBzaGVsbExhdW5jaENvbmZpZywgY3dkLCBjb2xzLCByb3dzLCB1bmljb2RlVmVyc2lvbiwgZW52IChpbmRleCA1KSwgZXhlY3V0YWJsZUVudiAoaW5kZXggNiksIC4uLlxuXHRpZiAoZm5OYW1lID09PSAnY3JlYXRlUHJvY2VzcycgJiYgYXJncy5sZW5ndGggPiA1KSB7XG5cdFx0Y29uc3Qgc2FuaXRpemVkQXJncyA9IFsuLi5hcmdzXTtcblx0XHRpZiAoYXJnc1s1XSAmJiB0eXBlb2YgYXJnc1s1XSA9PT0gJ29iamVjdCcpIHtcblx0XHRcdHNhbml0aXplZEFyZ3NbNV0gPSBzYW5pdGl6ZUVudkZvckxvZ2dpbmcoYXJnc1s1XSBhcyBJUHJvY2Vzc0Vudmlyb25tZW50KTtcblx0XHR9XG5cdFx0aWYgKGFyZ3NbNl0gJiYgdHlwZW9mIGFyZ3NbNl0gPT09ICdvYmplY3QnKSB7XG5cdFx0XHRzYW5pdGl6ZWRBcmdzWzZdID0gc2FuaXRpemVFbnZGb3JMb2dnaW5nKGFyZ3NbNl0gYXMgSVByb2Nlc3NFbnZpcm9ubWVudCk7XG5cdFx0fVxuXHRcdHJldHVybiBzYW5pdGl6ZWRBcmdzO1xuXHR9XG5cdHJldHVybiBhcmdzO1xufVxuXG5pbnRlcmZhY2UgSVRyYWNlUnBjQXJncyB7XG5cdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlO1xuXHRzaW11bGF0ZWRMYXRlbmN5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmFjZVJwYyhfdGFyZ2V0OiBPYmplY3QsIGtleTogc3RyaW5nLCBkZXNjcmlwdG9yOiBQcm9wZXJ0eURlc2NyaXB0b3IpIHtcblx0aWYgKCFpc0Z1bmN0aW9uKGRlc2NyaXB0b3IudmFsdWUpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3Qgc3VwcG9ydGVkJyk7XG5cdH1cblx0Y29uc3QgZm5LZXkgPSAndmFsdWUnO1xuXHRjb25zdCBmbiA9IGRlc2NyaXB0b3IudmFsdWU7XG5cdGRlc2NyaXB0b3JbZm5LZXldID0gYXN5bmMgZnVuY3Rpb24gPFRUaGlzIGV4dGVuZHMgeyB0cmFjZVJwY0FyZ3M6IElUcmFjZVJwY0FyZ3MgfT4odGhpczogVFRoaXMsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGlmICh0aGlzLnRyYWNlUnBjQXJncy5sb2dTZXJ2aWNlLmdldExldmVsKCkgPT09IExvZ0xldmVsLlRyYWNlKSB7XG5cdFx0XHRjb25zdCBzYW5pdGl6ZWRBcmdzID0gc2FuaXRpemVBcmdzRm9yTG9nZ2luZyhmbi5uYW1lLCBhcmdzKTtcblx0XHRcdHRoaXMudHJhY2VScGNBcmdzLmxvZ1NlcnZpY2UudHJhY2UoYFtSUEMgUmVxdWVzdF0gUHR5U2VydmljZSMke2ZuLm5hbWV9KCR7c2FuaXRpemVkQXJncy5tYXAoZSA9PiBKU09OLnN0cmluZ2lmeShlKSkuam9pbignLCAnKX0pYCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnRyYWNlUnBjQXJncy5zaW11bGF0ZWRMYXRlbmN5KSB7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KHRoaXMudHJhY2VScGNBcmdzLnNpbXVsYXRlZExhdGVuY3kpO1xuXHRcdH1cblx0XHRsZXQgcmVzdWx0OiB1bmtub3duO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXN1bHQgPSBhd2FpdCBmbi5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLnRyYWNlUnBjQXJncy5sb2dTZXJ2aWNlLmVycm9yKGBbUlBDIFJlc3BvbnNlXSBQdHlTZXJ2aWNlIyR7Zm4ubmFtZX1gLCBlKTtcblx0XHRcdHRocm93IGU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnRyYWNlUnBjQXJncy5sb2dTZXJ2aWNlLmdldExldmVsKCkgPT09IExvZ0xldmVsLlRyYWNlKSB7XG5cdFx0XHR0aGlzLnRyYWNlUnBjQXJncy5sb2dTZXJ2aWNlLnRyYWNlKGBbUlBDIFJlc3BvbnNlXSBQdHlTZXJ2aWNlIyR7Zm4ubmFtZX1gLCByZXN1bHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9O1xufVxuXG50eXBlIFdvcmtzcGFjZUlkID0gc3RyaW5nO1xuXG5sZXQgU2VyaWFsaXplQWRkb246IHR5cGVvZiBYdGVybVNlcmlhbGl6ZUFkZG9uO1xubGV0IFVuaWNvZGUxMUFkZG9uOiB0eXBlb2YgWHRlcm1Vbmljb2RlMTFBZGRvbjtcblxuZXhwb3J0IGNsYXNzIFB0eVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVB0eVNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wdHlzOiBNYXA8bnVtYmVyLCBQZXJzaXN0ZW50VGVybWluYWxQcm9jZXNzPiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlTGF5b3V0SW5mb3MgPSBuZXcgTWFwPFdvcmtzcGFjZUlkLCBJU2V0VGVybWluYWxMYXlvdXRJbmZvQXJncz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGV0YWNoSW5zdGFuY2VSZXF1ZXN0U3RvcmU6IFJlcXVlc3RTdG9yZTxJUHJvY2Vzc0RldGFpbHMgfCB1bmRlZmluZWQsIHsgd29ya3NwYWNlSWQ6IHN0cmluZzsgaW5zdGFuY2VJZDogbnVtYmVyIH0+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXZpdmVkUHR5SWRNYXA6IE1hcDxzdHJpbmcsIHsgbmV3SWQ6IG51bWJlcjsgc3RhdGU6IElTZXJpYWxpemVkVGVybWluYWxTdGF0ZSB9PiA9IG5ldyBNYXAoKTtcblxuXHQvLyAjcmVnaW9uIFB0eSBzZXJ2aWNlIGNvbnRyaWJ1dGlvbiBSUEMgY2FsbHNcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hdXRvUmVwbGllc0NvbnRyaWJ1dGlvbjogQXV0b1JlcGxpZXNQdHlTZXJ2aWNlQ29udHJpYnV0aW9uO1xuXHRAdHJhY2VScGNcblx0YXN5bmMgaW5zdGFsbEF1dG9SZXBseShtYXRjaDogc3RyaW5nLCByZXBseTogc3RyaW5nKSB7XG5cdFx0YXdhaXQgdGhpcy5fYXV0b1JlcGxpZXNDb250cmlidXRpb24uaW5zdGFsbEF1dG9SZXBseShtYXRjaCwgcmVwbHkpO1xuXHR9XG5cdEB0cmFjZVJwY1xuXHRhc3luYyB1bmluc3RhbGxBbGxBdXRvUmVwbGllcygpIHtcblx0XHRhd2FpdCB0aGlzLl9hdXRvUmVwbGllc0NvbnRyaWJ1dGlvbi51bmluc3RhbGxBbGxBdXRvUmVwbGllcygpO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRyaWJ1dGlvbnM6IElQdHlTZXJ2aWNlQ29udHJpYnV0aW9uW107XG5cblx0cHJpdmF0ZSBfbGFzdFB0eUlkOiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uSGVhcnRiZWF0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uSGVhcnRiZWF0ID0gdGhpcy5fdHJhY2VFdmVudCgnX29uSGVhcnRiZWF0JywgdGhpcy5fb25IZWFydGJlYXQuZXZlbnQpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc0RhdGEgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGlkOiBudW1iZXI7IGV2ZW50OiBJUHJvY2Vzc0RhdGFFdmVudCB8IHN0cmluZyB9PigpKTtcblx0cmVhZG9ubHkgb25Qcm9jZXNzRGF0YSA9IHRoaXMuX3RyYWNlRXZlbnQoJ19vblByb2Nlc3NEYXRhJywgdGhpcy5fb25Qcm9jZXNzRGF0YS5ldmVudCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc1JlcGxheSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgaWQ6IG51bWJlcjsgZXZlbnQ6IElQdHlIb3N0UHJvY2Vzc1JlcGxheUV2ZW50IH0+KCkpO1xuXHRyZWFkb25seSBvblByb2Nlc3NSZXBsYXkgPSB0aGlzLl90cmFjZUV2ZW50KCdfb25Qcm9jZXNzUmVwbGF5JywgdGhpcy5fb25Qcm9jZXNzUmVwbGF5LmV2ZW50KTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzUmVhZHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGlkOiBudW1iZXI7IGV2ZW50OiBJUHJvY2Vzc1JlYWR5RXZlbnQgfT4oKSk7XG5cdHJlYWRvbmx5IG9uUHJvY2Vzc1JlYWR5ID0gdGhpcy5fdHJhY2VFdmVudCgnX29uUHJvY2Vzc1JlYWR5JywgdGhpcy5fb25Qcm9jZXNzUmVhZHkuZXZlbnQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb2Nlc3NFeGl0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBpZDogbnVtYmVyOyBldmVudDogbnVtYmVyIHwgdW5kZWZpbmVkIH0+KCkpO1xuXHRyZWFkb25seSBvblByb2Nlc3NFeGl0ID0gdGhpcy5fdHJhY2VFdmVudCgnX29uUHJvY2Vzc0V4aXQnLCB0aGlzLl9vblByb2Nlc3NFeGl0LmV2ZW50KTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzT3JwaGFuUXVlc3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGlkOiBudW1iZXIgfT4oKSk7XG5cdHJlYWRvbmx5IG9uUHJvY2Vzc09ycGhhblF1ZXN0aW9uID0gdGhpcy5fdHJhY2VFdmVudCgnX29uUHJvY2Vzc09ycGhhblF1ZXN0aW9uJywgdGhpcy5fb25Qcm9jZXNzT3JwaGFuUXVlc3Rpb24uZXZlbnQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3REZXRhY2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJlcXVlc3RJZDogbnVtYmVyOyB3b3Jrc3BhY2VJZDogc3RyaW5nOyBpbnN0YW5jZUlkOiBudW1iZXIgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdERldGFjaCA9IHRoaXMuX3RyYWNlRXZlbnQoJ19vbkRpZFJlcXVlc3REZXRhY2gnLCB0aGlzLl9vbkRpZFJlcXVlc3REZXRhY2guZXZlbnQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVByb3BlcnR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBpZDogbnVtYmVyOyBwcm9wZXJ0eTogSVByb2Nlc3NQcm9wZXJ0eSB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQcm9wZXJ0eSA9IHRoaXMuX3RyYWNlRXZlbnQoJ19vbkRpZENoYW5nZVByb3BlcnR5JywgdGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5ldmVudCk7XG5cblx0cHJpdmF0ZSBfdHJhY2VFdmVudDxUPihuYW1lOiBzdHJpbmcsIGV2ZW50OiBFdmVudDxUPik6IEV2ZW50PFQ+IHtcblx0XHRldmVudChlID0+IHtcblx0XHRcdGlmICh0aGlzLl9sb2dTZXJ2aWNlLmdldExldmVsKCkgPT09IExvZ0xldmVsLlRyYWNlKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtSUEMgRXZlbnRdIFB0eVNlcnZpY2UjJHtuYW1lfS5maXJlKCR7SlNPTi5zdHJpbmdpZnkoZSl9KWApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiBldmVudDtcblx0fVxuXG5cdEBtZW1vaXplXG5cdGdldCB0cmFjZVJwY0FyZ3MoKTogSVRyYWNlUnBjQXJncyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxvZ1NlcnZpY2U6IHRoaXMuX2xvZ1NlcnZpY2UsXG5cdFx0XHRzaW11bGF0ZWRMYXRlbmN5OiB0aGlzLl9zaW11bGF0ZWRMYXRlbmN5XG5cdFx0fTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVjb25uZWN0Q29uc3RhbnRzOiBJUmVjb25uZWN0Q29uc3RhbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NpbXVsYXRlZExhdGVuY3k6IG51bWJlclxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgcHR5IG9mIHRoaXMuX3B0eXMudmFsdWVzKCkpIHtcblx0XHRcdFx0cHR5LnNodXRkb3duKHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcHR5cy5jbGVhcigpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2RldGFjaEluc3RhbmNlUmVxdWVzdFN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJlcXVlc3RTdG9yZSh1bmRlZmluZWQsIHRoaXMuX2xvZ1NlcnZpY2UpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9kZXRhY2hJbnN0YW5jZVJlcXVlc3RTdG9yZS5vbkNyZWF0ZVJlcXVlc3QodGhpcy5fb25EaWRSZXF1ZXN0RGV0YWNoLmZpcmUsIHRoaXMuX29uRGlkUmVxdWVzdERldGFjaCkpO1xuXG5cdFx0dGhpcy5fYXV0b1JlcGxpZXNDb250cmlidXRpb24gPSBuZXcgQXV0b1JlcGxpZXNQdHlTZXJ2aWNlQ29udHJpYnV0aW9uKHRoaXMuX2xvZ1NlcnZpY2UpO1xuXG5cdFx0dGhpcy5fY29udHJpYnV0aW9ucyA9IFt0aGlzLl9hdXRvUmVwbGllc0NvbnRyaWJ1dGlvbl07XG5cblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyByZWZyZXNoSWdub3JlUHJvY2Vzc05hbWVzKG5hbWVzOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlnbm9yZVByb2Nlc3NOYW1lcy5sZW5ndGggPSAwO1xuXHRcdGlnbm9yZVByb2Nlc3NOYW1lcy5wdXNoKC4uLm5hbWVzKTtcblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyByZXF1ZXN0RGV0YWNoSW5zdGFuY2Uod29ya3NwYWNlSWQ6IHN0cmluZywgaW5zdGFuY2VJZDogbnVtYmVyKTogUHJvbWlzZTxJUHJvY2Vzc0RldGFpbHMgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZGV0YWNoSW5zdGFuY2VSZXF1ZXN0U3RvcmUuY3JlYXRlUmVxdWVzdCh7IHdvcmtzcGFjZUlkLCBpbnN0YW5jZUlkIH0pO1xuXHR9XG5cblx0QHRyYWNlUnBjXG5cdGFzeW5jIGFjY2VwdERldGFjaEluc3RhbmNlUmVwbHkocmVxdWVzdElkOiBudW1iZXIsIHBlcnNpc3RlbnRQcm9jZXNzSWQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBwcm9jZXNzRGV0YWlsczogSVByb2Nlc3NEZXRhaWxzIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHB0eSA9IHRoaXMuX3B0eXMuZ2V0KHBlcnNpc3RlbnRQcm9jZXNzSWQpO1xuXHRcdGlmIChwdHkpIHtcblx0XHRcdHByb2Nlc3NEZXRhaWxzID0gYXdhaXQgdGhpcy5fYnVpbGRQcm9jZXNzRGV0YWlscyhwZXJzaXN0ZW50UHJvY2Vzc0lkLCBwdHkpO1xuXHRcdH1cblx0XHR0aGlzLl9kZXRhY2hJbnN0YW5jZVJlcXVlc3RTdG9yZS5hY2NlcHRSZXBseShyZXF1ZXN0SWQsIHByb2Nlc3NEZXRhaWxzKTtcblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyBmcmVlUG9ydEtpbGxQcm9jZXNzKHBvcnQ6IHN0cmluZyk6IFByb21pc2U8eyBwb3J0OiBzdHJpbmc7IHByb2Nlc3NJZDogc3RyaW5nIH0+IHtcblx0XHRjb25zdCBzdGRvdXQgPSBhd2FpdCBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGV4ZWMoaXNXaW5kb3dzID8gYG5ldHN0YXQgLWFubyB8IGZpbmRzdHIgXCIke3BvcnR9XCJgIDogYGxzb2YgLW5QIC1pVENQIC1zVENQOkxJU1RFTiB8IGdyZXAgJHtwb3J0fWAsIHt9LCAoZXJyLCBzdGRvdXQpID0+IHtcblx0XHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdHJldHVybiByZWplY3QoJ1Byb2JsZW0gb2NjdXJyZWQgd2hlbiBsaXN0aW5nIGFjdGl2ZSBwcm9jZXNzZXMnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXNvbHZlKHN0ZG91dCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRjb25zdCBwcm9jZXNzZXNGb3JQb3J0ID0gc3Rkb3V0LnNwbGl0KC9cXHI/XFxuLykuZmlsdGVyKHMgPT4gISFzLnRyaW0oKSk7XG5cdFx0aWYgKHByb2Nlc3Nlc0ZvclBvcnQubGVuZ3RoID49IDEpIHtcblx0XHRcdGNvbnN0IGNhcHR1cmVQaWQgPSAvXFxzKyhcXGQrKSg/Olxccyt8JCkvO1xuXHRcdFx0Y29uc3QgcHJvY2Vzc0lkID0gcHJvY2Vzc2VzRm9yUG9ydFswXS5tYXRjaChjYXB0dXJlUGlkKT8uWzFdO1xuXHRcdFx0aWYgKHByb2Nlc3NJZCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHByb2Nlc3Mua2lsbChOdW1iZXIucGFyc2VJbnQocHJvY2Vzc0lkKSk7XG5cdFx0XHRcdH0gY2F0Y2ggeyB9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFByb2Nlc3NlcyBmb3IgcG9ydCAke3BvcnR9IHdlcmUgbm90IGZvdW5kYCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBwb3J0LCBwcm9jZXNzSWQgfTtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3Qga2lsbCBwcm9jZXNzIHdpdGggcG9ydCAke3BvcnR9YCk7XG5cdH1cblxuXHRAdHJhY2VScGNcblx0YXN5bmMgc2VyaWFsaXplVGVybWluYWxTdGF0ZShpZHM6IG51bWJlcltdKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTxJU2VyaWFsaXplZFRlcm1pbmFsU3RhdGU+W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtwZXJzaXN0ZW50UHJvY2Vzc0lkLCBwZXJzaXN0ZW50UHJvY2Vzc10gb2YgdGhpcy5fcHR5cy5lbnRyaWVzKCkpIHtcblx0XHRcdC8vIE9ubHkgc2VyaWFsaXplIHBlcnNpc3RlbnQgcHJvY2Vzc2VzIHRoYXQgaGF2ZSBoYWQgZGF0YSB3cml0dGVuIG9yIHBlcmZvcm1lZCBhIHJlcGxheVxuXHRcdFx0aWYgKHBlcnNpc3RlbnRQcm9jZXNzLmhhc1dyaXR0ZW5EYXRhICYmIGlkcy5pbmRleE9mKHBlcnNpc3RlbnRQcm9jZXNzSWQpICE9PSAtMSkge1xuXHRcdFx0XHRwcm9taXNlcy5wdXNoKFByb21pc2VzLndpdGhBc3luY0JvZHk8SVNlcmlhbGl6ZWRUZXJtaW5hbFN0YXRlPihhc3luYyByID0+IHtcblx0XHRcdFx0XHRyKHtcblx0XHRcdFx0XHRcdGlkOiBwZXJzaXN0ZW50UHJvY2Vzc0lkLFxuXHRcdFx0XHRcdFx0c2hlbGxMYXVuY2hDb25maWc6IHBlcnNpc3RlbnRQcm9jZXNzLnNoZWxsTGF1bmNoQ29uZmlnLFxuXHRcdFx0XHRcdFx0cHJvY2Vzc0RldGFpbHM6IGF3YWl0IHRoaXMuX2J1aWxkUHJvY2Vzc0RldGFpbHMocGVyc2lzdGVudFByb2Nlc3NJZCwgcGVyc2lzdGVudFByb2Nlc3MpLFxuXHRcdFx0XHRcdFx0cHJvY2Vzc0xhdW5jaENvbmZpZzogcGVyc2lzdGVudFByb2Nlc3MucHJvY2Vzc0xhdW5jaE9wdGlvbnMsXG5cdFx0XHRcdFx0XHR1bmljb2RlVmVyc2lvbjogcGVyc2lzdGVudFByb2Nlc3MudW5pY29kZVZlcnNpb24sXG5cdFx0XHRcdFx0XHRyZXBsYXlFdmVudDogYXdhaXQgcGVyc2lzdGVudFByb2Nlc3Muc2VyaWFsaXplTm9ybWFsQnVmZmVyKCksXG5cdFx0XHRcdFx0XHR0aW1lc3RhbXA6IERhdGUubm93KClcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBzZXJpYWxpemVkOiBJQ3Jvc3NWZXJzaW9uU2VyaWFsaXplZFRlcm1pbmFsU3RhdGUgPSB7XG5cdFx0XHR2ZXJzaW9uOiAxLFxuXHRcdFx0c3RhdGU6IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKVxuXHRcdH07XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHNlcmlhbGl6ZWQpO1xuXHR9XG5cblx0QHRyYWNlUnBjXG5cdGFzeW5jIHJldml2ZVRlcm1pbmFsUHJvY2Vzc2VzKHdvcmtzcGFjZUlkOiBzdHJpbmcsIHN0YXRlOiBJU2VyaWFsaXplZFRlcm1pbmFsU3RhdGVbXSwgZGF0ZVRpbWVGb3JtYXRMb2NhbGU6IHN0cmluZykge1xuXHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHRlcm1pbmFsIG9mIHN0YXRlKSB7XG5cdFx0XHRwcm9taXNlcy5wdXNoKHRoaXMuX3Jldml2ZVRlcm1pbmFsUHJvY2Vzcyh3b3Jrc3BhY2VJZCwgdGVybWluYWwpKTtcblx0XHR9XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmV2aXZlVGVybWluYWxQcm9jZXNzKHdvcmtzcGFjZUlkOiBzdHJpbmcsIHRlcm1pbmFsOiBJU2VyaWFsaXplZFRlcm1pbmFsU3RhdGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXN0b3JlTWVzc2FnZSA9IGxvY2FsaXplKCd0ZXJtaW5hbC1oaXN0b3J5LXJlc3RvcmVkJywgXCJIaXN0b3J5IHJlc3RvcmVkXCIpO1xuXG5cdFx0Ly8gQ29ucHR5IHYxLjIyKyB1c2VzIHBhc3N0aHJvdWdoIGFuZCBkb2Vzbid0IHJlcHJpbnQgdGhlIGJ1ZmZlciBvZnRlbiwgdGhpcyBtZWFucyB0aGF0IHdoZW5cblx0XHQvLyB0aGUgdGVybWluYWwgaXMgcmV2aXZlZCwgdGhlIGN1cnNvciB3b3VsZCBiZSBhdCB0aGUgYm90dG9tIG9mIHRoZSBidWZmZXIgdGhlbiB3aGVuXG5cdFx0Ly8gUFNSZWFkTGluZSByZXF1ZXN0cyBgR2V0Q29uc29sZUN1cnNvckluZm9gIGl0IHdpbGwgYmUgaGFuZGxlZCBieSBjb25wdHkgaXRzZWxmIGJ5IGRlc2lnbi5cblx0XHQvLyBUaGlzIGNhdXNlcyB0aGUgY3Vyc29yIHRvIG1vdmUgdG8gdGhlIHRvcCBpbnRvIHRoZSByZXBsYXllZCB0ZXJtaW5hbCBjb250ZW50cy4gVG8gYXZvaWRcblx0XHQvLyB0aGlzLCB0aGUgcG9zdCByZXN0b3JlIG1lc3NhZ2Ugd2lsbCBwcmludCBuZXcgbGluZXMgdG8gZ2V0IGEgY2xlYXIgdmlld3BvcnQgYW5kIHB1dCB0aGVcblx0XHQvLyBjdXJzb3IgYmFjayBhdCB0byB0b3AgbGVmdC5cblx0XHRsZXQgcG9zdFJlc3RvcmVNZXNzYWdlID0gJyc7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0Y29uc3QgbGFzdFJlcGxheUV2ZW50ID0gdGVybWluYWwucmVwbGF5RXZlbnQuZXZlbnRzLmxlbmd0aCA+IDAgPyB0ZXJtaW5hbC5yZXBsYXlFdmVudC5ldmVudHMuYXQoLTEpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGxhc3RSZXBsYXlFdmVudCkge1xuXHRcdFx0XHRwb3N0UmVzdG9yZU1lc3NhZ2UgKz0gJ1xcclxcbicucmVwZWF0KGxhc3RSZXBsYXlFdmVudC5yb3dzIC0gMSkgKyBgXFx4MWJbSGA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVE9ETzogV2UgbWF5IGF0IHNvbWUgcG9pbnQgd2FudCB0byBzaG93IGRhdGUgaW5mb3JtYXRpb24gaW4gYSBob3ZlciB2aWEgYSBjdXN0b20gc2VxdWVuY2U6XG5cdFx0Ly8gICBuZXcgRGF0ZSh0ZXJtaW5hbC50aW1lc3RhbXApLnRvTG9jYWxlRGF0ZVN0cmluZyhkYXRlVGltZUZvcm1hdExvY2FsZSlcblx0XHQvLyAgIG5ldyBEYXRlKHRlcm1pbmFsLnRpbWVzdGFtcCkudG9Mb2NhbGVUaW1lU3RyaW5nKGRhdGVUaW1lRm9ybWF0TG9jYWxlKVxuXHRcdGNvbnN0IG5ld0lkID0gYXdhaXQgdGhpcy5jcmVhdGVQcm9jZXNzKFxuXHRcdFx0e1xuXHRcdFx0XHQuLi50ZXJtaW5hbC5zaGVsbExhdW5jaENvbmZpZyxcblx0XHRcdFx0Y3dkOiB0ZXJtaW5hbC5wcm9jZXNzRGV0YWlscy5jd2QsXG5cdFx0XHRcdGNvbG9yOiB0ZXJtaW5hbC5wcm9jZXNzRGV0YWlscy5jb2xvcixcblx0XHRcdFx0aWNvbjogdGVybWluYWwucHJvY2Vzc0RldGFpbHMuaWNvbixcblx0XHRcdFx0bmFtZTogdGVybWluYWwucHJvY2Vzc0RldGFpbHMudGl0bGVTb3VyY2UgPT09IFRpdGxlRXZlbnRTb3VyY2UuQXBpID8gdGVybWluYWwucHJvY2Vzc0RldGFpbHMudGl0bGUgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGluaXRpYWxUZXh0OiB0ZXJtaW5hbC5yZXBsYXlFdmVudC5ldmVudHNbMF0uZGF0YSArIGZvcm1hdE1lc3NhZ2VGb3JUZXJtaW5hbChyZXN0b3JlTWVzc2FnZSwgeyBsb3VkRm9ybWF0dGluZzogdHJ1ZSB9KSArIHBvc3RSZXN0b3JlTWVzc2FnZVxuXHRcdFx0fSxcblx0XHRcdHRlcm1pbmFsLnByb2Nlc3NEZXRhaWxzLmN3ZCxcblx0XHRcdHRlcm1pbmFsLnJlcGxheUV2ZW50LmV2ZW50c1swXS5jb2xzLFxuXHRcdFx0dGVybWluYWwucmVwbGF5RXZlbnQuZXZlbnRzWzBdLnJvd3MsXG5cdFx0XHR0ZXJtaW5hbC51bmljb2RlVmVyc2lvbixcblx0XHRcdHRlcm1pbmFsLnByb2Nlc3NMYXVuY2hDb25maWcuZW52LFxuXHRcdFx0dGVybWluYWwucHJvY2Vzc0xhdW5jaENvbmZpZy5leGVjdXRhYmxlRW52LFxuXHRcdFx0dGVybWluYWwucHJvY2Vzc0xhdW5jaENvbmZpZy5vcHRpb25zLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHRlcm1pbmFsLnByb2Nlc3NEZXRhaWxzLndvcmtzcGFjZUlkLFxuXHRcdFx0dGVybWluYWwucHJvY2Vzc0RldGFpbHMud29ya3NwYWNlTmFtZSxcblx0XHRcdHRydWUsXG5cdFx0XHR0ZXJtaW5hbC5yZXBsYXlFdmVudC5ldmVudHNbMF0uZGF0YVxuXHRcdCk7XG5cdFx0Ly8gRG9uJ3Qgc3RhcnQgdGhlIHByb2Nlc3MgaGVyZSBhcyB0aGVyZSdzIG5vIHRlcm1pbmFsIHRvIGFuc3dlciBDUFJcblx0XHRjb25zdCBvbGRJZCA9IHRoaXMuX2dldFJldml2aW5nUHJvY2Vzc0lkKHdvcmtzcGFjZUlkLCB0ZXJtaW5hbC5pZCk7XG5cdFx0dGhpcy5fcmV2aXZlZFB0eUlkTWFwLnNldChvbGRJZCwgeyBuZXdJZCwgc3RhdGU6IHRlcm1pbmFsIH0pO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgUmV2aXZlZCBwcm9jZXNzLCBvbGQgaWQgJHtvbGRJZH0gLT4gbmV3IGlkICR7bmV3SWR9YCk7XG5cdH1cblxuXHRAdHJhY2VScGNcblx0YXN5bmMgc2h1dGRvd25BbGwoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRAdHJhY2VScGNcblx0YXN5bmMgY3JlYXRlUHJvY2Vzcyhcblx0XHRzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnLFxuXHRcdGN3ZDogc3RyaW5nLFxuXHRcdGNvbHM6IG51bWJlcixcblx0XHRyb3dzOiBudW1iZXIsXG5cdFx0dW5pY29kZVZlcnNpb246ICc2JyB8ICcxMScsXG5cdFx0ZW52OiBJUHJvY2Vzc0Vudmlyb25tZW50LFxuXHRcdGV4ZWN1dGFibGVFbnY6IElQcm9jZXNzRW52aXJvbm1lbnQsXG5cdFx0b3B0aW9uczogSVRlcm1pbmFsUHJvY2Vzc09wdGlvbnMsXG5cdFx0c2hvdWxkUGVyc2lzdDogYm9vbGVhbixcblx0XHR3b3Jrc3BhY2VJZDogc3RyaW5nLFxuXHRcdHdvcmtzcGFjZU5hbWU6IHN0cmluZyxcblx0XHRpc1Jldml2aW5nPzogYm9vbGVhbixcblx0XHRyYXdSZXZpdmVCdWZmZXI/OiBzdHJpbmdcblx0KTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRpZiAoc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQXR0ZW1wdCB0byBjcmVhdGUgYSBwcm9jZXNzIHdoZW4gYXR0YWNoIG9iamVjdCB3YXMgcHJvdmlkZWQnKTtcblx0XHR9XG5cdFx0Y29uc3QgaWQgPSArK3RoaXMuX2xhc3RQdHlJZDtcblx0XHRjb25zdCBwcm9jZXNzID0gbmV3IFRlcm1pbmFsUHJvY2VzcyhzaGVsbExhdW5jaENvbmZpZywgY3dkLCBjb2xzLCByb3dzLCBlbnYsIGV4ZWN1dGFibGVFbnYsIG9wdGlvbnMsIHRoaXMuX2xvZ1NlcnZpY2UsIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9jZXNzTGF1bmNoT3B0aW9uczogSVBlcnNpc3RlbnRUZXJtaW5hbFByb2Nlc3NMYXVuY2hDb25maWcgPSB7XG5cdFx0XHRlbnYsXG5cdFx0XHRleGVjdXRhYmxlRW52LFxuXHRcdFx0b3B0aW9uc1xuXHRcdH07XG5cdFx0Y29uc3QgcGVyc2lzdGVudFByb2Nlc3MgPSBuZXcgUGVyc2lzdGVudFRlcm1pbmFsUHJvY2VzcyhpZCwgcHJvY2Vzcywgd29ya3NwYWNlSWQsIHdvcmtzcGFjZU5hbWUsIHNob3VsZFBlcnNpc3QsIGNvbHMsIHJvd3MsIHByb2Nlc3NMYXVuY2hPcHRpb25zLCB1bmljb2RlVmVyc2lvbiwgdGhpcy5fcmVjb25uZWN0Q29uc3RhbnRzLCB0aGlzLl9sb2dTZXJ2aWNlLCBpc1Jldml2aW5nICYmIGlzU3RyaW5nKHNoZWxsTGF1bmNoQ29uZmlnLmluaXRpYWxUZXh0KSA/IHNoZWxsTGF1bmNoQ29uZmlnLmluaXRpYWxUZXh0IDogdW5kZWZpbmVkLCByYXdSZXZpdmVCdWZmZXIsIHNoZWxsTGF1bmNoQ29uZmlnLmljb24sIHNoZWxsTGF1bmNoQ29uZmlnLmNvbG9yLCBzaGVsbExhdW5jaENvbmZpZy5uYW1lLCBzaGVsbExhdW5jaENvbmZpZy5maXhlZERpbWVuc2lvbnMpO1xuXHRcdHByb2Nlc3Mub25Qcm9jZXNzRXhpdChldmVudCA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGNvbnRyaWIgb2YgdGhpcy5fY29udHJpYnV0aW9ucykge1xuXHRcdFx0XHRjb250cmliLmhhbmRsZVByb2Nlc3NEaXNwb3NlKGlkKTtcblx0XHRcdH1cblx0XHRcdHBlcnNpc3RlbnRQcm9jZXNzLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3B0eXMuZGVsZXRlKGlkKTtcblx0XHRcdHRoaXMuX29uUHJvY2Vzc0V4aXQuZmlyZSh7IGlkLCBldmVudCB9KTtcblx0XHR9KTtcblx0XHRwZXJzaXN0ZW50UHJvY2Vzcy5vblByb2Nlc3NEYXRhKGV2ZW50ID0+IHRoaXMuX29uUHJvY2Vzc0RhdGEuZmlyZSh7IGlkLCBldmVudCB9KSk7XG5cdFx0cGVyc2lzdGVudFByb2Nlc3Mub25Qcm9jZXNzUmVwbGF5KGV2ZW50ID0+IHRoaXMuX29uUHJvY2Vzc1JlcGxheS5maXJlKHsgaWQsIGV2ZW50IH0pKTtcblx0XHRwZXJzaXN0ZW50UHJvY2Vzcy5vblByb2Nlc3NSZWFkeShldmVudCA9PiB0aGlzLl9vblByb2Nlc3NSZWFkeS5maXJlKHsgaWQsIGV2ZW50IH0pKTtcblx0XHRwZXJzaXN0ZW50UHJvY2Vzcy5vblByb2Nlc3NPcnBoYW5RdWVzdGlvbigoKSA9PiB0aGlzLl9vblByb2Nlc3NPcnBoYW5RdWVzdGlvbi5maXJlKHsgaWQgfSkpO1xuXHRcdHBlcnNpc3RlbnRQcm9jZXNzLm9uRGlkQ2hhbmdlUHJvcGVydHkocHJvcGVydHkgPT4gdGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5maXJlKHsgaWQsIHByb3BlcnR5IH0pKTtcblx0XHRwZXJzaXN0ZW50UHJvY2Vzcy5vblBlcnNpc3RlbnRQcm9jZXNzUmVhZHkoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBjb250cmliIG9mIHRoaXMuX2NvbnRyaWJ1dGlvbnMpIHtcblx0XHRcdFx0Y29udHJpYi5oYW5kbGVQcm9jZXNzUmVhZHkoaWQsIHByb2Nlc3MpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX3B0eXMuc2V0KGlkLCBwZXJzaXN0ZW50UHJvY2Vzcyk7XG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cblx0QHRyYWNlUnBjXG5cdGFzeW5jIGF0dGFjaFRvUHJvY2VzcyhpZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3Rocm93SWZOb1B0eShpZCkuYXR0YWNoKCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFBlcnNpc3RlbnQgcHJvY2VzcyByZWNvbm5lY3Rpb24gXCIke2lkfVwiYCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBQZXJzaXN0ZW50IHByb2Nlc3MgcmVjb25uZWN0aW9uIFwiJHtpZH1cIiBmYWlsZWRgLCBlLm1lc3NhZ2UpO1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cdH1cblxuXHRAdHJhY2VScGNcblx0YXN5bmMgdXBkYXRlVGl0bGUoaWQ6IG51bWJlciwgdGl0bGU6IHN0cmluZywgdGl0bGVTb3VyY2U6IFRpdGxlRXZlbnRTb3VyY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl90aHJvd0lmTm9QdHkoaWQpLnNldFRpdGxlKHRpdGxlLCB0aXRsZVNvdXJjZSk7XG5cdH1cblxuXHRAdHJhY2VScGNcblx0YXN5bmMgdXBkYXRlSWNvbihpZDogbnVtYmVyLCB1c2VySW5pdGlhdGVkOiBib29sZWFuLCBpY29uOiBVUkkgfCB7IGxpZ2h0OiBVUkk7IGRhcms6IFVSSSB9IHwgeyBpZDogc3RyaW5nOyBjb2xvcj86IHsgaWQ6IHN0cmluZyB9IH0sIGNvbG9yPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fdGhyb3dJZk5vUHR5KGlkKS5zZXRJY29uKHVzZXJJbml0aWF0ZWQsIGljb24sIGNvbG9yKTtcblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyBjbGVhckJ1ZmZlcihpZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fdGhyb3dJZk5vUHR5KGlkKS5jbGVhckJ1ZmZlcigpO1xuXHR9XG5cblx0QHRyYWNlUnBjXG5cdGFzeW5jIHJlZnJlc2hQcm9wZXJ0eTxUIGV4dGVuZHMgUHJvY2Vzc1Byb3BlcnR5VHlwZT4oaWQ6IG51bWJlciwgdHlwZTogVCk6IFByb21pc2U8SVByb2Nlc3NQcm9wZXJ0eU1hcFtUXT4ge1xuXHRcdHJldHVybiB0aGlzLl90aHJvd0lmTm9QdHkoaWQpLnJlZnJlc2hQcm9wZXJ0eSh0eXBlKTtcblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyB1cGRhdGVQcm9wZXJ0eTxUIGV4dGVuZHMgUHJvY2Vzc1Byb3BlcnR5VHlwZT4oaWQ6IG51bWJlciwgdHlwZTogVCwgdmFsdWU6IElQcm9jZXNzUHJvcGVydHlNYXBbVF0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdGhyb3dJZk5vUHR5KGlkKS51cGRhdGVQcm9wZXJ0eSh0eXBlLCB2YWx1ZSk7XG5cdH1cblxuXHRAdHJhY2VScGNcblx0YXN5bmMgZGV0YWNoRnJvbVByb2Nlc3MoaWQ6IG51bWJlciwgZm9yY2VQZXJzaXN0PzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl90aHJvd0lmTm9QdHkoaWQpLmRldGFjaChmb3JjZVBlcnNpc3QpO1xuXHR9XG5cblx0QHRyYWNlUnBjXG5cdGFzeW5jIHJlZHVjZUNvbm5lY3Rpb25HcmFjZVRpbWUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCBwdHkgb2YgdGhpcy5fcHR5cy52YWx1ZXMoKSkge1xuXHRcdFx0cHR5LnJlZHVjZUdyYWNlVGltZSgpO1xuXHRcdH1cblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyBsaXN0UHJvY2Vzc2VzKCk6IFByb21pc2U8SVByb2Nlc3NEZXRhaWxzW10+IHtcblx0XHRjb25zdCBwZXJzaXN0ZW50UHJvY2Vzc2VzID0gQXJyYXkuZnJvbSh0aGlzLl9wdHlzLmVudHJpZXMoKSkuZmlsdGVyKChbXywgcHR5XSkgPT4gcHR5LnNob3VsZFBlcnNpc3RUZXJtaW5hbCk7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYExpc3RpbmcgJHtwZXJzaXN0ZW50UHJvY2Vzc2VzLmxlbmd0aH0gcGVyc2lzdGVudCB0ZXJtaW5hbHMsICR7dGhpcy5fcHR5cy5zaXplfSB0b3RhbCB0ZXJtaW5hbHNgKTtcblx0XHRjb25zdCBwcm9taXNlcyA9IHBlcnNpc3RlbnRQcm9jZXNzZXMubWFwKGFzeW5jIChbaWQsIHRlcm1pbmFsUHJvY2Vzc0RhdGFdKSA9PiB0aGlzLl9idWlsZFByb2Nlc3NEZXRhaWxzKGlkLCB0ZXJtaW5hbFByb2Nlc3NEYXRhKSk7XG5cdFx0Y29uc3QgYWxsVGVybWluYWxzID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHRcdHJldHVybiBhbGxUZXJtaW5hbHMuZmlsdGVyKGVudHJ5ID0+IGVudHJ5LmlzT3JwaGFuKTtcblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyBnZXRQZXJmb3JtYW5jZU1hcmtzKCk6IFByb21pc2U8cGVyZm9ybWFuY2UuUGVyZm9ybWFuY2VNYXJrW10+IHtcblx0XHRyZXR1cm4gcGVyZm9ybWFuY2UuZ2V0TWFya3MoKTtcblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyBzdGFydChpZDogbnVtYmVyKTogUHJvbWlzZTxJVGVybWluYWxMYXVuY2hFcnJvciB8IElUZXJtaW5hbExhdW5jaFJlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHB0eSA9IHRoaXMuX3B0eXMuZ2V0KGlkKTtcblx0XHRyZXR1cm4gcHR5ID8gcHR5LnN0YXJ0KCkgOiB7IG1lc3NhZ2U6IGBDb3VsZCBub3QgZmluZCBwdHkgd2l0aCBpZCBcIiR7aWR9XCJgIH07XG5cdH1cblxuXHRAdHJhY2VScGNcblx0YXN5bmMgc2h1dGRvd24oaWQ6IG51bWJlciwgaW1tZWRpYXRlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gRG9uJ3QgdGhyb3cgaWYgdGhlIHB0eSBpcyBhbHJlYWR5IHNodXRkb3duXG5cdFx0cmV0dXJuIHRoaXMuX3B0eXMuZ2V0KGlkKT8uc2h1dGRvd24oaW1tZWRpYXRlKTtcblx0fVxuXHRAdHJhY2VScGNcblx0YXN5bmMgaW5wdXQoaWQ6IG51bWJlciwgZGF0YTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHR5ID0gdGhpcy5fdGhyb3dJZk5vUHR5KGlkKTtcblx0XHRpZiAocHR5KSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNvbnRyaWIgb2YgdGhpcy5fY29udHJpYnV0aW9ucykge1xuXHRcdFx0XHRjb250cmliLmhhbmRsZVByb2Nlc3NJbnB1dChpZCwgZGF0YSk7XG5cdFx0XHR9XG5cdFx0XHRwdHkuaW5wdXQoZGF0YSk7XG5cdFx0fVxuXHR9XG5cdEB0cmFjZVJwY1xuXHRhc3luYyBzZW5kU2lnbmFsKGlkOiBudW1iZXIsIHNpZ25hbDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rocm93SWZOb1B0eShpZCkuc2VuZFNpZ25hbChzaWduYWwpO1xuXHR9XG5cdEB0cmFjZVJwY1xuXHRhc3luYyBwcm9jZXNzQmluYXJ5KGlkOiBudW1iZXIsIGRhdGE6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl90aHJvd0lmTm9QdHkoaWQpLndyaXRlQmluYXJ5KGRhdGEpO1xuXHR9XG5cdEB0cmFjZVJwY1xuXHRhc3luYyByZXNpemUoaWQ6IG51bWJlciwgY29sczogbnVtYmVyLCByb3dzOiBudW1iZXIsIHBpeGVsV2lkdGg/OiBudW1iZXIsIHBpeGVsSGVpZ2h0PzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHR5ID0gdGhpcy5fdGhyb3dJZk5vUHR5KGlkKTtcblx0XHRpZiAocHR5KSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNvbnRyaWIgb2YgdGhpcy5fY29udHJpYnV0aW9ucykge1xuXHRcdFx0XHRjb250cmliLmhhbmRsZVByb2Nlc3NSZXNpemUoaWQsIGNvbHMsIHJvd3MsIHBpeGVsV2lkdGgsIHBpeGVsSGVpZ2h0KTtcblx0XHRcdH1cblx0XHRcdHB0eS5yZXNpemUoY29scywgcm93cywgcGl4ZWxXaWR0aCwgcGl4ZWxIZWlnaHQpO1xuXHRcdH1cblx0fVxuXHRAdHJhY2VScGNcblx0YXN5bmMgZ2V0SW5pdGlhbEN3ZChpZDogbnVtYmVyKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fdGhyb3dJZk5vUHR5KGlkKS5nZXRJbml0aWFsQ3dkKCk7XG5cdH1cblx0QHRyYWNlUnBjXG5cdGFzeW5jIGdldEN3ZChpZDogbnVtYmVyKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fdGhyb3dJZk5vUHR5KGlkKS5nZXRDd2QoKTtcblx0fVxuXHRAdHJhY2VScGNcblx0YXN5bmMgYWNrbm93bGVkZ2VEYXRhRXZlbnQoaWQ6IG51bWJlciwgY2hhckNvdW50OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdGhyb3dJZk5vUHR5KGlkKS5hY2tub3dsZWRnZURhdGFFdmVudChjaGFyQ291bnQpO1xuXHR9XG5cdEB0cmFjZVJwY1xuXHRhc3luYyBzZXRVbmljb2RlVmVyc2lvbihpZDogbnVtYmVyLCB2ZXJzaW9uOiAnNicgfCAnMTEnKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rocm93SWZOb1B0eShpZCkuc2V0VW5pY29kZVZlcnNpb24odmVyc2lvbik7XG5cdH1cblxuXHRAdHJhY2VScGNcblx0YXN5bmMgc2V0TmV4dENvbW1hbmRJZChpZDogbnVtYmVyLCBjb21tYW5kTGluZTogc3RyaW5nLCBjb21tYW5kSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl90aHJvd0lmTm9QdHkoaWQpLnNldE5leHRDb21tYW5kSWQoY29tbWFuZExpbmUsIGNvbW1hbmRJZCk7XG5cdH1cblx0QHRyYWNlUnBjXG5cdGFzeW5jIGdldExhdGVuY3koKTogUHJvbWlzZTxJUHR5SG9zdExhdGVuY3lNZWFzdXJlbWVudFtdPiB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdEB0cmFjZVJwY1xuXHRhc3luYyBvcnBoYW5RdWVzdGlvblJlcGx5KGlkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdGhyb3dJZk5vUHR5KGlkKS5vcnBoYW5RdWVzdGlvblJlcGx5KCk7XG5cdH1cblxuXHRAdHJhY2VScGNcblx0YXN5bmMgZ2V0RGVmYXVsdFN5c3RlbVNoZWxsKG9zT3ZlcnJpZGU6IE9wZXJhdGluZ1N5c3RlbSA9IE9TKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gZ2V0U3lzdGVtU2hlbGwob3NPdmVycmlkZSwgcHJvY2Vzcy5lbnYpO1xuXHR9XG5cblx0QHRyYWNlUnBjXG5cdGFzeW5jIGdldEVudmlyb25tZW50KCk6IFByb21pc2U8SVByb2Nlc3NFbnZpcm9ubWVudD4ge1xuXHRcdHJldHVybiB7IC4uLnByb2Nlc3MuZW52IH07XG5cdH1cblxuXHRAdHJhY2VScGNcblx0YXN5bmMgZ2V0V3NsUGF0aChvcmlnaW5hbDogc3RyaW5nLCBkaXJlY3Rpb246ICd1bml4LXRvLXdpbicgfCAnd2luLXRvLXVuaXgnIHwgdW5rbm93bik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0aWYgKGRpcmVjdGlvbiA9PT0gJ3dpbi10by11bml4Jykge1xuXHRcdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGF3YWl0IGdldFdpbmRvd3NCdWlsZE51bWJlckFzeW5jKCkgPCAxNzA2Mykge1xuXHRcdFx0XHRyZXR1cm4gb3JpZ2luYWwucmVwbGFjZSgvXFxcXC9nLCAnLycpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgd3NsRXhlY3V0YWJsZSA9IGF3YWl0IHRoaXMuX2dldFdTTEV4ZWN1dGFibGVQYXRoKCk7XG5cdFx0XHRpZiAoIXdzbEV4ZWN1dGFibGUpIHtcblx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZz4oYyA9PiB7XG5cdFx0XHRcdGNvbnN0IHByb2MgPSBleGVjRmlsZSh3c2xFeGVjdXRhYmxlLCBbJy1lJywgJ3dzbHBhdGgnLCBvcmlnaW5hbF0sIHt9LCAoZXJyb3IsIHN0ZG91dCwgc3RkZXJyKSA9PiB7XG5cdFx0XHRcdFx0YyhlcnJvciA/IG9yaWdpbmFsIDogZXNjYXBlTm9uV2luZG93c1BhdGgoc3Rkb3V0LnRyaW0oKSwgUG9zaXhTaGVsbFR5cGUuQmFzaCkpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0cHJvYy5zdGRpbiEuZW5kKCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0aWYgKGRpcmVjdGlvbiA9PT0gJ3VuaXgtdG8td2luJykge1xuXHRcdFx0Ly8gVGhlIGJhY2tlbmQgaXMgV2luZG93cywgZm9yIGV4YW1wbGUgYSBsb2NhbCBXaW5kb3dzIHdvcmtzcGFjZSB3aXRoIGEgd3NsIHNlc3Npb24gaW5cblx0XHRcdC8vIHRoZSB0ZXJtaW5hbC5cblx0XHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdFx0aWYgKGF3YWl0IGdldFdpbmRvd3NCdWlsZE51bWJlckFzeW5jKCkgPCAxNzA2Mykge1xuXHRcdFx0XHRcdHJldHVybiBvcmlnaW5hbDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB3c2xFeGVjdXRhYmxlID0gYXdhaXQgdGhpcy5fZ2V0V1NMRXhlY3V0YWJsZVBhdGgoKTtcblx0XHRcdFx0aWYgKCF3c2xFeGVjdXRhYmxlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmc+KGMgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHByb2MgPSBleGVjRmlsZSh3c2xFeGVjdXRhYmxlLCBbJy1lJywgJ3dzbHBhdGgnLCAnLXcnLCBvcmlnaW5hbF0sIHt9LCAoZXJyb3IsIHN0ZG91dCwgc3RkZXJyKSA9PiB7XG5cdFx0XHRcdFx0XHRjKGVycm9yID8gb3JpZ2luYWwgOiBzdGRvdXQudHJpbSgpKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRwcm9jLnN0ZGluIS5lbmQoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIEZhbGxiYWNrIGp1c3QgaW4gY2FzZVxuXHRcdHJldHVybiBvcmlnaW5hbDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFdTTEV4ZWN1dGFibGVQYXRoKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdXNlV1NMZXhlID0gYXdhaXQgZ2V0V2luZG93c0J1aWxkTnVtYmVyQXN5bmMoKSA+PSAxNjI5OTtcblx0XHRjb25zdCBpczMyUHJvY2Vzc09uNjRXaW5kb3dzID0gcHJvY2Vzcy5lbnYuaGFzT3duUHJvcGVydHkoJ1BST0NFU1NPUl9BUkNISVRFVzY0MzInKTtcblx0XHRjb25zdCBzeXN0ZW1Sb290ID0gcHJvY2Vzcy5lbnZbJ1N5c3RlbVJvb3QnXTtcblx0XHRpZiAoc3lzdGVtUm9vdCkge1xuXHRcdFx0cmV0dXJuIGpvaW4oc3lzdGVtUm9vdCwgaXMzMlByb2Nlc3NPbjY0V2luZG93cyA/ICdTeXNuYXRpdmUnIDogJ1N5c3RlbTMyJywgdXNlV1NMZXhlID8gJ3dzbC5leGUnIDogJ2Jhc2guZXhlJyk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRAdHJhY2VScGNcblx0YXN5bmMgZ2V0UmV2aXZlZFB0eU5ld0lkKHdvcmtzcGFjZUlkOiBzdHJpbmcsIGlkOiBudW1iZXIpOiBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmV2aXZlZFB0eUlkTWFwLmdldCh0aGlzLl9nZXRSZXZpdmluZ1Byb2Nlc3NJZCh3b3Jrc3BhY2VJZCwgaWQpKT8ubmV3SWQ7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBDb3VsZG4ndCBmaW5kIHRlcm1pbmFsIElEICR7d29ya3NwYWNlSWR9LSR7aWR9YCwgZS5tZXNzYWdlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyBzZXRUZXJtaW5hbExheW91dEluZm8oYXJnczogSVNldFRlcm1pbmFsTGF5b3V0SW5mb0FyZ3MpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl93b3Jrc3BhY2VMYXlvdXRJbmZvcy5zZXQoYXJncy53b3Jrc3BhY2VJZCwgYXJncyk7XG5cdH1cblxuXHRAdHJhY2VScGNcblx0YXN5bmMgZ2V0VGVybWluYWxMYXlvdXRJbmZvKGFyZ3M6IElHZXRUZXJtaW5hbExheW91dEluZm9BcmdzKTogUHJvbWlzZTxJVGVybWluYWxzTGF5b3V0SW5mbyB8IHVuZGVmaW5lZD4ge1xuXHRcdHBlcmZvcm1hbmNlLm1hcmsoJ2NvZGUvd2lsbEdldFRlcm1pbmFsTGF5b3V0SW5mbycpO1xuXHRcdGNvbnN0IGxheW91dCA9IHRoaXMuX3dvcmtzcGFjZUxheW91dEluZm9zLmdldChhcmdzLndvcmtzcGFjZUlkKTtcblx0XHRpZiAobGF5b3V0KSB7XG5cdFx0XHRjb25zdCBkb25lU2V0OiBTZXQ8bnVtYmVyPiA9IG5ldyBTZXQoKTtcblx0XHRcdGNvbnN0IGV4cGFuZGVkVGFicyA9IGF3YWl0IFByb21pc2UuYWxsKGxheW91dC50YWJzLm1hcChhc3luYyB0YWIgPT4gdGhpcy5fZXhwYW5kVGVybWluYWxUYWIoYXJncy53b3Jrc3BhY2VJZCwgdGFiLCBkb25lU2V0KSkpO1xuXHRcdFx0Y29uc3QgdGFicyA9IGV4cGFuZGVkVGFicy5maWx0ZXIodCA9PiB0LnRlcm1pbmFscy5sZW5ndGggPiAwKTtcblx0XHRcdGNvbnN0IGV4cGFuZGVkQmFja2dyb3VuZCA9IChhd2FpdCBQcm9taXNlLmFsbChsYXlvdXQuYmFja2dyb3VuZD8ubWFwKGIgPT4gdGhpcy5fZXhwYW5kVGVybWluYWxJbnN0YW5jZShhcmdzLndvcmtzcGFjZUlkLCBiLCBkb25lU2V0KSkgPz8gW10pKS5maWx0ZXIoYiA9PiBiLnRlcm1pbmFsICE9PSBudWxsKS5tYXAoYiA9PiBiLnRlcm1pbmFsKTtcblx0XHRcdHBlcmZvcm1hbmNlLm1hcmsoJ2NvZGUvZGlkR2V0VGVybWluYWxMYXlvdXRJbmZvJyk7XG5cdFx0XHRyZXR1cm4geyB0YWJzLCBiYWNrZ3JvdW5kOiBleHBhbmRlZEJhY2tncm91bmQgfTtcblx0XHR9XG5cdFx0cGVyZm9ybWFuY2UubWFyaygnY29kZS9kaWRHZXRUZXJtaW5hbExheW91dEluZm8nKTtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZXhwYW5kVGVybWluYWxUYWIod29ya3NwYWNlSWQ6IHN0cmluZywgdGFiOiBJVGVybWluYWxUYWJMYXlvdXRJbmZvQnlJZCwgZG9uZVNldDogU2V0PG51bWJlcj4pOiBQcm9taXNlPElUZXJtaW5hbFRhYkxheW91dEluZm9EdG8+IHtcblx0XHRjb25zdCBleHBhbmRlZFRlcm1pbmFscyA9IChhd2FpdCBQcm9taXNlLmFsbCh0YWIudGVybWluYWxzLm1hcCh0ID0+IHRoaXMuX2V4cGFuZFRlcm1pbmFsSW5zdGFuY2Uod29ya3NwYWNlSWQsIHQsIGRvbmVTZXQpKSkpO1xuXHRcdGNvbnN0IGZpbHRlcmVkID0gZXhwYW5kZWRUZXJtaW5hbHMuZmlsdGVyKHRlcm0gPT4gdGVybS50ZXJtaW5hbCAhPT0gbnVsbCkgYXMgSVJhd1Rlcm1pbmFsSW5zdGFuY2VMYXlvdXRJbmZvPElQcm9jZXNzRGV0YWlscz5bXTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aXNBY3RpdmU6IHRhYi5pc0FjdGl2ZSxcblx0XHRcdGFjdGl2ZVBlcnNpc3RlbnRQcm9jZXNzSWQ6IHRhYi5hY3RpdmVQZXJzaXN0ZW50UHJvY2Vzc0lkLFxuXHRcdFx0dGVybWluYWxzOiBmaWx0ZXJlZFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9leHBhbmRUZXJtaW5hbEluc3RhbmNlKHdvcmtzcGFjZUlkOiBzdHJpbmcsIHQ6IElUZXJtaW5hbEluc3RhbmNlTGF5b3V0SW5mb0J5SWQgfCBudW1iZXIsIGRvbmVTZXQ6IFNldDxudW1iZXI+KTogUHJvbWlzZTxJUmF3VGVybWluYWxJbnN0YW5jZUxheW91dEluZm88SVByb2Nlc3NEZXRhaWxzIHwgbnVsbD4+IHtcblx0XHRjb25zdCBoYXNMYXlvdXQgPSAhaXNOdW1iZXIodCk7XG5cdFx0Y29uc3QgcHR5SWQgPSBoYXNMYXlvdXQgPyB0LnRlcm1pbmFsIDogdDtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgb2xkSWQgPSB0aGlzLl9nZXRSZXZpdmluZ1Byb2Nlc3NJZCh3b3Jrc3BhY2VJZCwgcHR5SWQpO1xuXHRcdFx0Y29uc3QgcmV2aXZlZFB0eUlkID0gdGhpcy5fcmV2aXZlZFB0eUlkTWFwLmdldChvbGRJZCk/Lm5ld0lkO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBFeHBhbmRpbmcgdGVybWluYWwgaW5zdGFuY2UsIG9sZCBpZCAke29sZElkfSAtPiBuZXcgaWQgJHtyZXZpdmVkUHR5SWR9YCk7XG5cdFx0XHR0aGlzLl9yZXZpdmVkUHR5SWRNYXAuZGVsZXRlKG9sZElkKTtcblx0XHRcdGNvbnN0IHBlcnNpc3RlbnRQcm9jZXNzSWQgPSByZXZpdmVkUHR5SWQgPz8gcHR5SWQ7XG5cdFx0XHRpZiAoZG9uZVNldC5oYXMocGVyc2lzdGVudFByb2Nlc3NJZCkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUZXJtaW5hbCAke3BlcnNpc3RlbnRQcm9jZXNzSWR9IGhhcyBhbHJlYWR5IGJlZW4gZXhwYW5kZWRgKTtcblx0XHRcdH1cblx0XHRcdGRvbmVTZXQuYWRkKHBlcnNpc3RlbnRQcm9jZXNzSWQpO1xuXHRcdFx0Y29uc3QgcGVyc2lzdGVudFByb2Nlc3MgPSB0aGlzLl90aHJvd0lmTm9QdHkocGVyc2lzdGVudFByb2Nlc3NJZCk7XG5cdFx0XHRjb25zdCBwcm9jZXNzRGV0YWlscyA9IHBlcnNpc3RlbnRQcm9jZXNzICYmIGF3YWl0IHRoaXMuX2J1aWxkUHJvY2Vzc0RldGFpbHMocHR5SWQsIHBlcnNpc3RlbnRQcm9jZXNzLCByZXZpdmVkUHR5SWQgIT09IHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0ZXJtaW5hbDogeyAuLi5wcm9jZXNzRGV0YWlscywgaWQ6IHBlcnNpc3RlbnRQcm9jZXNzSWQgfSxcblx0XHRcdFx0cmVsYXRpdmVTaXplOiBoYXNMYXlvdXQgPyB0LnJlbGF0aXZlU2l6ZSA6IDBcblx0XHRcdH07XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBDb3VsZG4ndCBnZXQgbGF5b3V0IGluZm8sIGEgdGVybWluYWwgd2FzIHByb2JhYmx5IGRpc2Nvbm5lY3RlZGAsIGUubWVzc2FnZSk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdSZWF0dGFjaCB0byB3cm9uZyB0ZXJtaW5hbCBkZWJ1ZyBpbmZvIC0gbGF5b3V0IGluZm8gYnkgaWQnLCB0KTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ1JlYXR0YWNoIHRvIHdyb25nIHRlcm1pbmFsIGRlYnVnIGluZm8gLSBfcmV2aXZlUHR5SWRNYXAnLCBBcnJheS5mcm9tKHRoaXMuX3Jldml2ZWRQdHlJZE1hcC52YWx1ZXMoKSkpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnUmVhdHRhY2ggdG8gd3JvbmcgdGVybWluYWwgZGVidWcgaW5mbyAtIF9wdHlzIGlkcycsIEFycmF5LmZyb20odGhpcy5fcHR5cy5rZXlzKCkpKTtcblx0XHRcdC8vIHRoaXMgd2lsbCBiZSBmaWx0ZXJlZCBvdXQgYW5kIG5vdCByZWNvbm5lY3RlZFxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dGVybWluYWw6IG51bGwsXG5cdFx0XHRcdHJlbGF0aXZlU2l6ZTogaGFzTGF5b3V0ID8gdC5yZWxhdGl2ZVNpemUgOiAwXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldFJldml2aW5nUHJvY2Vzc0lkKHdvcmtzcGFjZUlkOiBzdHJpbmcsIHB0eUlkOiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHt3b3Jrc3BhY2VJZH0tJHtwdHlJZH1gO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYnVpbGRQcm9jZXNzRGV0YWlscyhpZDogbnVtYmVyLCBwZXJzaXN0ZW50UHJvY2VzczogUGVyc2lzdGVudFRlcm1pbmFsUHJvY2Vzcywgd2FzUmV2aXZlZDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxJUHJvY2Vzc0RldGFpbHM+IHtcblx0XHRwZXJmb3JtYW5jZS5tYXJrKGBjb2RlL3dpbGxCdWlsZFByb2Nlc3NEZXRhaWxzLyR7aWR9YCk7XG5cdFx0Ly8gSWYgdGhlIHByb2Nlc3Mgd2FzIGp1c3QgcmV2aXZlZCwgZG9uJ3QgZG8gdGhlIG9ycGhhbiBjaGVjayBhcyBpdCB3aWxsXG5cdFx0Ly8gdGFrZSBzb21lIHRpbWVcblx0XHRjb25zdCBbY3dkLCBpc09ycGhhbl0gPSBhd2FpdCBQcm9taXNlLmFsbChbcGVyc2lzdGVudFByb2Nlc3MuZ2V0Q3dkKCksIHdhc1Jldml2ZWQgPyB0cnVlIDogcGVyc2lzdGVudFByb2Nlc3MuaXNPcnBoYW5lZCgpXSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0ge1xuXHRcdFx0aWQsXG5cdFx0XHR0aXRsZTogcGVyc2lzdGVudFByb2Nlc3MudGl0bGUsXG5cdFx0XHR0aXRsZVNvdXJjZTogcGVyc2lzdGVudFByb2Nlc3MudGl0bGVTb3VyY2UsXG5cdFx0XHRwaWQ6IHBlcnNpc3RlbnRQcm9jZXNzLnBpZCxcblx0XHRcdHdvcmtzcGFjZUlkOiBwZXJzaXN0ZW50UHJvY2Vzcy53b3Jrc3BhY2VJZCxcblx0XHRcdHdvcmtzcGFjZU5hbWU6IHBlcnNpc3RlbnRQcm9jZXNzLndvcmtzcGFjZU5hbWUsXG5cdFx0XHRjd2QsXG5cdFx0XHRpc09ycGhhbixcblx0XHRcdGljb246IHBlcnNpc3RlbnRQcm9jZXNzLmljb24sXG5cdFx0XHRjb2xvcjogcGVyc2lzdGVudFByb2Nlc3MuY29sb3IsXG5cdFx0XHRmaXhlZERpbWVuc2lvbnM6IHBlcnNpc3RlbnRQcm9jZXNzLmZpeGVkRGltZW5zaW9ucyxcblx0XHRcdGVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uczogcGVyc2lzdGVudFByb2Nlc3MucHJvY2Vzc0xhdW5jaE9wdGlvbnMub3B0aW9ucy5lbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnMsXG5cdFx0XHRyZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzOiBwZXJzaXN0ZW50UHJvY2Vzcy5zaGVsbExhdW5jaENvbmZpZy5yZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzLFxuXHRcdFx0d2FpdE9uRXhpdDogcGVyc2lzdGVudFByb2Nlc3Muc2hlbGxMYXVuY2hDb25maWcud2FpdE9uRXhpdCxcblx0XHRcdGhpZGVGcm9tVXNlcjogcGVyc2lzdGVudFByb2Nlc3Muc2hlbGxMYXVuY2hDb25maWcuaGlkZUZyb21Vc2VyLFxuXHRcdFx0aXNGZWF0dXJlVGVybWluYWw6IHBlcnNpc3RlbnRQcm9jZXNzLnNoZWxsTGF1bmNoQ29uZmlnLmlzRmVhdHVyZVRlcm1pbmFsLFxuXHRcdFx0dHlwZTogcGVyc2lzdGVudFByb2Nlc3Muc2hlbGxMYXVuY2hDb25maWcudHlwZSxcblx0XHRcdGhhc0NoaWxkUHJvY2Vzc2VzOiBwZXJzaXN0ZW50UHJvY2Vzcy5oYXNDaGlsZFByb2Nlc3Nlcyxcblx0XHRcdHNoZWxsSW50ZWdyYXRpb25Ob25jZTogcGVyc2lzdGVudFByb2Nlc3MucHJvY2Vzc0xhdW5jaE9wdGlvbnMub3B0aW9ucy5zaGVsbEludGVncmF0aW9uLm5vbmNlLFxuXHRcdFx0dGFiQWN0aW9uczogcGVyc2lzdGVudFByb2Nlc3Muc2hlbGxMYXVuY2hDb25maWcudGFiQWN0aW9uc1xuXHRcdH07XG5cdFx0cGVyZm9ybWFuY2UubWFyayhgY29kZS9kaWRCdWlsZFByb2Nlc3NEZXRhaWxzLyR7aWR9YCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX3Rocm93SWZOb1B0eShpZDogbnVtYmVyKTogUGVyc2lzdGVudFRlcm1pbmFsUHJvY2VzcyB7XG5cdFx0Y29uc3QgcHR5ID0gdGhpcy5fcHR5cy5nZXQoaWQpO1xuXHRcdGlmICghcHR5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3JOb1RlbGVtZXRyeShgQ291bGQgbm90IGZpbmQgcHR5ICR7aWR9IG9uIHB0eSBob3N0YCk7XG5cdFx0fVxuXHRcdHJldHVybiBwdHk7XG5cdH1cbn1cblxuY29uc3QgZW51bSBJbnRlcmFjdGlvblN0YXRlIHtcblx0LyoqIFRoZSB0ZXJtaW5hbCBoYXMgbm90IGJlZW4gaW50ZXJhY3RlZCB3aXRoLiAqL1xuXHROb25lID0gJ05vbmUnLFxuXHQvKiogVGhlIHRlcm1pbmFsIGhhcyBvbmx5IGJlZW4gaW50ZXJhY3RlZCB3aXRoIGJ5IHRoZSByZXBsYXkgbWVjaGFuaXNtLiAqL1xuXHRSZXBsYXlPbmx5ID0gJ1JlcGxheU9ubHknLFxuXHQvKiogVGhlIHRlcm1pbmFsIGhhcyBiZWVuIGRpcmVjdGx5IGludGVyYWN0ZWQgd2l0aCB0aGlzIHNlc3Npb24uICovXG5cdFNlc3Npb24gPSAnU2Vzc2lvbidcbn1cblxuY2xhc3MgUGVyc2lzdGVudFRlcm1pbmFsUHJvY2VzcyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2J1ZmZlcmVyOiBUZXJtaW5hbERhdGFCdWZmZXJlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nQ29tbWFuZHMgPSBuZXcgTWFwPG51bWJlciwgeyByZXNvbHZlOiAoZGF0YTogdW5rbm93bikgPT4gdm9pZDsgcmVqZWN0OiAoZXJyOiB1bmtub3duKSA9PiB2b2lkIH0+KCk7XG5cblx0cHJpdmF0ZSBfaXNTdGFydGVkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2ludGVyYWN0aW9uU3RhdGU6IE11dGF0aW9uTG9nZ2VyPEludGVyYWN0aW9uU3RhdGU+O1xuXG5cdHByaXZhdGUgX29ycGhhblF1ZXN0aW9uQmFycmllcjogQXV0b09wZW5CYXJyaWVyIHwgbnVsbDtcblx0cHJpdmF0ZSBfb3JwaGFuUXVlc3Rpb25SZXBseVRpbWU6IG51bWJlcjtcblx0cHJpdmF0ZSBfb3JwaGFuUmVxdWVzdFF1ZXVlID0gbmV3IFF1ZXVlPGJvb2xlYW4+KCk7XG5cdHByaXZhdGUgX2Rpc2Nvbm5lY3RSdW5uZXIxOiBQcm9jZXNzVGltZVJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgX2Rpc2Nvbm5lY3RSdW5uZXIyOiBQcm9jZXNzVGltZVJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzUmVwbGF5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVB0eUhvc3RQcm9jZXNzUmVwbGF5RXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvblByb2Nlc3NSZXBsYXkgPSB0aGlzLl9vblByb2Nlc3NSZXBsYXkuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc1JlYWR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVByb2Nlc3NSZWFkeUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25Qcm9jZXNzUmVhZHkgPSB0aGlzLl9vblByb2Nlc3NSZWFkeS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25QZXJzaXN0ZW50UHJvY2Vzc1JlYWR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdC8qKiBGaXJlZCB3aGVuIHRoZSBwZXJzaXN0ZW50IHByb2Nlc3MgaGFzIGEgcmVhZHkgcHJvY2VzcyBhbmQgaGFzIGZpbmlzaGVkIGl0cyByZXBsYXkuICovXG5cdHJlYWRvbmx5IG9uUGVyc2lzdGVudFByb2Nlc3NSZWFkeSA9IHRoaXMuX29uUGVyc2lzdGVudFByb2Nlc3NSZWFkeS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzRGF0YSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uUHJvY2Vzc0RhdGEgPSB0aGlzLl9vblByb2Nlc3NEYXRhLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb2Nlc3NPcnBoYW5RdWVzdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvblByb2Nlc3NPcnBoYW5RdWVzdGlvbiA9IHRoaXMuX29uUHJvY2Vzc09ycGhhblF1ZXN0aW9uLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVByb3BlcnR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVByb2Nlc3NQcm9wZXJ0eT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvcGVydHkgPSB0aGlzLl9vbkRpZENoYW5nZVByb3BlcnR5LmV2ZW50O1xuXG5cdHByaXZhdGUgX2luUmVwbGF5ID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBfcGlkID0gLTE7XG5cdHByaXZhdGUgX2N3ZCA9ICcnO1xuXHRwcml2YXRlIF90aXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90aXRsZVNvdXJjZTogVGl0bGVFdmVudFNvdXJjZSA9IFRpdGxlRXZlbnRTb3VyY2UuUHJvY2Vzcztcblx0cHJpdmF0ZSBfc2VyaWFsaXplcjogSVRlcm1pbmFsU2VyaWFsaXplcjtcblx0cHJpdmF0ZSBfd2FzUmV2aXZlZDogYm9vbGVhbjtcblx0cHJpdmF0ZSBfZml4ZWREaW1lbnNpb25zOiBJRml4ZWRUZXJtaW5hbERpbWVuc2lvbnMgfCB1bmRlZmluZWQ7XG5cblx0Z2V0IHBpZCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fcGlkOyB9XG5cdGdldCBzaGVsbExhdW5jaENvbmZpZygpOiBJU2hlbGxMYXVuY2hDb25maWcgeyByZXR1cm4gdGhpcy5fdGVybWluYWxQcm9jZXNzLnNoZWxsTGF1bmNoQ29uZmlnOyB9XG5cdGdldCBoYXNXcml0dGVuRGF0YSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2ludGVyYWN0aW9uU3RhdGUudmFsdWUgIT09IEludGVyYWN0aW9uU3RhdGUuTm9uZTsgfVxuXHRnZXQgdGl0bGUoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuX3RpdGxlIHx8IHRoaXMuX3Rlcm1pbmFsUHJvY2Vzcy5jdXJyZW50VGl0bGU7IH1cblx0Z2V0IHRpdGxlU291cmNlKCk6IFRpdGxlRXZlbnRTb3VyY2UgeyByZXR1cm4gdGhpcy5fdGl0bGVTb3VyY2U7IH1cblx0Z2V0IGljb24oKTogVGVybWluYWxJY29uIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2ljb247IH1cblx0Z2V0IGNvbG9yKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9jb2xvcjsgfVxuXHRnZXQgZml4ZWREaW1lbnNpb25zKCk6IElGaXhlZFRlcm1pbmFsRGltZW5zaW9ucyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9maXhlZERpbWVuc2lvbnM7IH1cblx0Z2V0IGhhc0NoaWxkUHJvY2Vzc2VzKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fdGVybWluYWxQcm9jZXNzLmhhc0NoaWxkUHJvY2Vzc2VzOyB9XG5cblx0c2V0VGl0bGUodGl0bGU6IHN0cmluZywgdGl0bGVTb3VyY2U6IFRpdGxlRXZlbnRTb3VyY2UpOiB2b2lkIHtcblx0XHRpZiAodGl0bGVTb3VyY2UgPT09IFRpdGxlRXZlbnRTb3VyY2UuQXBpKSB7XG5cdFx0XHR0aGlzLl9pbnRlcmFjdGlvblN0YXRlLnNldFZhbHVlKEludGVyYWN0aW9uU3RhdGUuU2Vzc2lvbiwgJ3NldFRpdGxlJyk7XG5cdFx0XHR0aGlzLl9zZXJpYWxpemVyLmZyZWVSYXdSZXZpdmVCdWZmZXIoKTtcblx0XHR9XG5cdFx0dGhpcy5fdGl0bGUgPSB0aXRsZTtcblx0XHR0aGlzLl90aXRsZVNvdXJjZSA9IHRpdGxlU291cmNlO1xuXHR9XG5cblx0c2V0SWNvbih1c2VySW5pdGlhdGVkOiBib29sZWFuLCBpY29uOiBUZXJtaW5hbEljb24sIGNvbG9yPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pY29uIHx8IGhhc0tleShpY29uLCB7IGlkOiB0cnVlIH0pICYmIGhhc0tleSh0aGlzLl9pY29uLCB7IGlkOiB0cnVlIH0pICYmIGljb24uaWQgIT09IHRoaXMuX2ljb24uaWQgfHxcblx0XHRcdCF0aGlzLmNvbG9yIHx8IGNvbG9yICE9PSB0aGlzLl9jb2xvcikge1xuXG5cdFx0XHR0aGlzLl9zZXJpYWxpemVyLmZyZWVSYXdSZXZpdmVCdWZmZXIoKTtcblx0XHRcdGlmICh1c2VySW5pdGlhdGVkKSB7XG5cdFx0XHRcdHRoaXMuX2ludGVyYWN0aW9uU3RhdGUuc2V0VmFsdWUoSW50ZXJhY3Rpb25TdGF0ZS5TZXNzaW9uLCAnc2V0SWNvbicpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9pY29uID0gaWNvbjtcblx0XHR0aGlzLl9jb2xvciA9IGNvbG9yO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Rml4ZWREaW1lbnNpb25zKGZpeGVkRGltZW5zaW9ucz86IElGaXhlZFRlcm1pbmFsRGltZW5zaW9ucyk6IHZvaWQge1xuXHRcdHRoaXMuX2ZpeGVkRGltZW5zaW9ucyA9IGZpeGVkRGltZW5zaW9ucztcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgX3BlcnNpc3RlbnRQcm9jZXNzSWQ6IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFByb2Nlc3M6IFRlcm1pbmFsUHJvY2Vzcyxcblx0XHRyZWFkb25seSB3b3Jrc3BhY2VJZDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IHdvcmtzcGFjZU5hbWU6IHN0cmluZyxcblx0XHRyZWFkb25seSBzaG91bGRQZXJzaXN0VGVybWluYWw6IGJvb2xlYW4sXG5cdFx0Y29sczogbnVtYmVyLFxuXHRcdHJvd3M6IG51bWJlcixcblx0XHRyZWFkb25seSBwcm9jZXNzTGF1bmNoT3B0aW9uczogSVBlcnNpc3RlbnRUZXJtaW5hbFByb2Nlc3NMYXVuY2hDb25maWcsXG5cdFx0cHVibGljIHVuaWNvZGVWZXJzaW9uOiAnNicgfCAnMTEnLFxuXHRcdHJlY29ubmVjdENvbnN0YW50czogSVJlY29ubmVjdENvbnN0YW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRyZXZpdmVCdWZmZXI6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRyYXdSZXZpdmVCdWZmZXI6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIF9pY29uPzogVGVybWluYWxJY29uLFxuXHRcdHByaXZhdGUgX2NvbG9yPzogc3RyaW5nLFxuXHRcdG5hbWU/OiBzdHJpbmcsXG5cdFx0Zml4ZWREaW1lbnNpb25zPzogSUZpeGVkVGVybWluYWxEaW1lbnNpb25zXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5faW50ZXJhY3Rpb25TdGF0ZSA9IG5ldyBNdXRhdGlvbkxvZ2dlcihgUGVyc2lzdGVudCBwcm9jZXNzIFwiJHt0aGlzLl9wZXJzaXN0ZW50UHJvY2Vzc0lkfVwiIGludGVyYWN0aW9uIHN0YXRlYCwgSW50ZXJhY3Rpb25TdGF0ZS5Ob25lLCB0aGlzLl9sb2dTZXJ2aWNlKTtcblx0XHR0aGlzLl93YXNSZXZpdmVkID0gcmV2aXZlQnVmZmVyICE9PSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc2VyaWFsaXplciA9IG5ldyBYdGVybVNlcmlhbGl6ZXIoXG5cdFx0XHRjb2xzLFxuXHRcdFx0cm93cyxcblx0XHRcdHJlY29ubmVjdENvbnN0YW50cy5zY3JvbGxiYWNrLFxuXHRcdFx0dW5pY29kZVZlcnNpb24sXG5cdFx0XHRyZXZpdmVCdWZmZXIsXG5cdFx0XHRwcm9jZXNzTGF1bmNoT3B0aW9ucy5vcHRpb25zLnNoZWxsSW50ZWdyYXRpb24ubm9uY2UsXG5cdFx0XHRzaG91bGRQZXJzaXN0VGVybWluYWwgPyByYXdSZXZpdmVCdWZmZXIgOiB1bmRlZmluZWQsXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlXG5cdFx0KTtcblx0XHRpZiAobmFtZSkge1xuXHRcdFx0dGhpcy5zZXRUaXRsZShuYW1lLCBUaXRsZUV2ZW50U291cmNlLkFwaSk7XG5cdFx0fVxuXHRcdHRoaXMuX2ZpeGVkRGltZW5zaW9ucyA9IGZpeGVkRGltZW5zaW9ucztcblx0XHR0aGlzLl9vcnBoYW5RdWVzdGlvbkJhcnJpZXIgPSBudWxsO1xuXHRcdHRoaXMuX29ycGhhblF1ZXN0aW9uUmVwbHlUaW1lID0gMDtcblx0XHR0aGlzLl9kaXNjb25uZWN0UnVubmVyMSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBQcm9jZXNzVGltZVJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBQZXJzaXN0ZW50IHByb2Nlc3MgXCIke3RoaXMuX3BlcnNpc3RlbnRQcm9jZXNzSWR9XCI6IFRoZSByZWNvbm5lY3Rpb24gZ3JhY2UgdGltZSBvZiAke3ByaW50VGltZShyZWNvbm5lY3RDb25zdGFudHMuZ3JhY2VUaW1lKX0gaGFzIGV4cGlyZWQsIHNodXR0aW5nIGRvd24gcGlkIFwiJHt0aGlzLl9waWR9XCJgKTtcblx0XHRcdHRoaXMuc2h1dGRvd24odHJ1ZSk7XG5cdFx0fSwgcmVjb25uZWN0Q29uc3RhbnRzLmdyYWNlVGltZSkpO1xuXHRcdHRoaXMuX2Rpc2Nvbm5lY3RSdW5uZXIyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFByb2Nlc3NUaW1lUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFBlcnNpc3RlbnQgcHJvY2VzcyBcIiR7dGhpcy5fcGVyc2lzdGVudFByb2Nlc3NJZH1cIjogVGhlIHNob3J0IHJlY29ubmVjdGlvbiBncmFjZSB0aW1lIG9mICR7cHJpbnRUaW1lKHJlY29ubmVjdENvbnN0YW50cy5zaG9ydEdyYWNlVGltZSl9IGhhcyBleHBpcmVkLCBzaHV0dGluZyBkb3duIHBpZCAke3RoaXMuX3BpZH1gKTtcblx0XHRcdHRoaXMuc2h1dGRvd24odHJ1ZSk7XG5cdFx0fSwgcmVjb25uZWN0Q29uc3RhbnRzLnNob3J0R3JhY2VUaW1lKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxQcm9jZXNzLm9uUHJvY2Vzc0V4aXQoKCkgPT4gdGhpcy5fYnVmZmVyZXIuc3RvcEJ1ZmZlcmluZyh0aGlzLl9wZXJzaXN0ZW50UHJvY2Vzc0lkKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsUHJvY2Vzcy5vblByb2Nlc3NSZWFkeShlID0+IHtcblx0XHRcdHRoaXMuX3BpZCA9IGUucGlkO1xuXHRcdFx0dGhpcy5fY3dkID0gZS5jd2Q7XG5cdFx0XHR0aGlzLl9vblByb2Nlc3NSZWFkeS5maXJlKGUpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbFByb2Nlc3Mub25EaWRDaGFuZ2VQcm9wZXJ0eShlID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZmlyZShlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBEYXRhIGJ1ZmZlcmluZyB0byByZWR1Y2UgdGhlIGFtb3VudCBvZiBtZXNzYWdlcyBnb2luZyB0byB0aGUgcmVuZGVyZXJcblx0XHR0aGlzLl9idWZmZXJlciA9IG5ldyBUZXJtaW5hbERhdGFCdWZmZXJlcigoXywgZGF0YSkgPT4gdGhpcy5fb25Qcm9jZXNzRGF0YS5maXJlKGRhdGEpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9idWZmZXJlci5zdGFydEJ1ZmZlcmluZyh0aGlzLl9wZXJzaXN0ZW50UHJvY2Vzc0lkLCB0aGlzLl90ZXJtaW5hbFByb2Nlc3Mub25Qcm9jZXNzRGF0YSkpO1xuXG5cdFx0Ly8gRGF0YSByZWNvcmRpbmcgZm9yIHJlY29ubmVjdFxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25Qcm9jZXNzRGF0YShlID0+IHRoaXMuX3NlcmlhbGl6ZXIuaGFuZGxlRGF0YShlKSkpO1xuXHR9XG5cblx0YXN5bmMgYXR0YWNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fZGlzY29ubmVjdFJ1bm5lcjEuaXNTY2hlZHVsZWQoKSAmJiAhdGhpcy5fZGlzY29ubmVjdFJ1bm5lcjIuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBQZXJzaXN0ZW50IHByb2Nlc3MgXCIke3RoaXMuX3BlcnNpc3RlbnRQcm9jZXNzSWR9XCI6IFByb2Nlc3MgaGFkIG5vIGRpc2Nvbm5lY3QgcnVubmVycyBidXQgd2FzIGFuIG9ycGhhbmApO1xuXHRcdH1cblx0XHR0aGlzLl9kaXNjb25uZWN0UnVubmVyMS5jYW5jZWwoKTtcblx0XHR0aGlzLl9kaXNjb25uZWN0UnVubmVyMi5jYW5jZWwoKTtcblx0fVxuXG5cdGFzeW5jIGRldGFjaChmb3JjZVBlcnNpc3Q/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gS2VlcCB0aGUgcHJvY2VzcyBhcm91bmQgaWYgaXQgd2FzIGluZGljYXRlZCB0byBwZXJzaXN0IGFuZCBpdCBoYXMgaGFkIHNvbWUgaXRlcmFjdGlvbiBvclxuXHRcdC8vIHdhcyByZXBsYXllZFxuXHRcdGlmICh0aGlzLnNob3VsZFBlcnNpc3RUZXJtaW5hbCAmJiAodGhpcy5faW50ZXJhY3Rpb25TdGF0ZS52YWx1ZSAhPT0gSW50ZXJhY3Rpb25TdGF0ZS5Ob25lIHx8IGZvcmNlUGVyc2lzdCkpIHtcblx0XHRcdHRoaXMuX2Rpc2Nvbm5lY3RSdW5uZXIxLnNjaGVkdWxlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2h1dGRvd24odHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0c2VyaWFsaXplTm9ybWFsQnVmZmVyKCk6IFByb21pc2U8SVB0eUhvc3RQcm9jZXNzUmVwbGF5RXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VyaWFsaXplci5nZW5lcmF0ZVJlcGxheUV2ZW50KHRydWUsIHRoaXMuX2ludGVyYWN0aW9uU3RhdGUudmFsdWUgIT09IEludGVyYWN0aW9uU3RhdGUuU2Vzc2lvbik7XG5cdH1cblxuXHRhc3luYyByZWZyZXNoUHJvcGVydHk8VCBleHRlbmRzIFByb2Nlc3NQcm9wZXJ0eVR5cGU+KHR5cGU6IFQpOiBQcm9taXNlPElQcm9jZXNzUHJvcGVydHlNYXBbVF0+IHtcblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxQcm9jZXNzLnJlZnJlc2hQcm9wZXJ0eSh0eXBlKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZVByb3BlcnR5PFQgZXh0ZW5kcyBQcm9jZXNzUHJvcGVydHlUeXBlPih0eXBlOiBULCB2YWx1ZTogSVByb2Nlc3NQcm9wZXJ0eU1hcFtUXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0eXBlID09PSBQcm9jZXNzUHJvcGVydHlUeXBlLkZpeGVkRGltZW5zaW9ucykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NldEZpeGVkRGltZW5zaW9ucyh2YWx1ZSBhcyBJUHJvY2Vzc1Byb3BlcnR5TWFwW1Byb2Nlc3NQcm9wZXJ0eVR5cGUuRml4ZWREaW1lbnNpb25zXSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc3RhcnQoKTogUHJvbWlzZTxJVGVybWluYWxMYXVuY2hFcnJvciB8IElUZXJtaW5hbExhdW5jaFJlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5faXNTdGFydGVkKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbFByb2Nlc3Muc3RhcnQoKTtcblx0XHRcdGlmIChyZXN1bHQgJiYgaGFzS2V5KHJlc3VsdCwgeyBtZXNzYWdlOiB0cnVlIH0pKSB7XG5cdFx0XHRcdC8vIGl0J3MgYSB0ZXJtaW5hbCBsYXVuY2ggZXJyb3Jcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2lzU3RhcnRlZCA9IHRydWU7XG5cblx0XHRcdC8vIElmIHRoZSBwcm9jZXNzIHdhcyByZXZpdmVkLCB0cmlnZ2VyIGEgcmVwbGF5IG9uIGZpcnN0IHN0YXJ0LiBBbiBhbHRlcm5hdGl2ZSBhcHByb2FjaFxuXHRcdFx0Ly8gY291bGQgYmUgdG8gc3RhcnQgaXQgb24gdGhlIHB0eSBob3N0IGJlZm9yZSBhdHRhY2hpbmcgYnV0IHRoaXMgZmFpbHMgb24gV2luZG93cyBhc1xuXHRcdFx0Ly8gY29ucHR5J3MgaW5oZXJpdCBjdXJzb3Igb3B0aW9uIHdoaWNoIGlzIHJlcXVpcmVkLCBlbmRzIHVwIHNlbmRpbmcgRFNSIENQUiB3aGljaFxuXHRcdFx0Ly8gY2F1c2VzIGNvbmhvc3QgdG8gaGFuZyB3aGVuIG5vIHJlc3BvbnNlIGlzIHJlY2VpdmVkIGZyb20gdGhlIHRlcm1pbmFsICh3aGljaCB3b3VsZG4ndFxuXHRcdFx0Ly8gYmUgYXR0YWNoZWQgeWV0KS4gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC90ZXJtaW5hbC9pc3N1ZXMvMTEyMTNcblx0XHRcdGlmICh0aGlzLl93YXNSZXZpdmVkKSB7XG5cdFx0XHRcdHRoaXMudHJpZ2dlclJlcGxheSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fb25QZXJzaXN0ZW50UHJvY2Vzc1JlYWR5LmZpcmUoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25Qcm9jZXNzUmVhZHkuZmlyZSh7IHBpZDogdGhpcy5fcGlkLCBjd2Q6IHRoaXMuX2N3ZCwgd2luZG93c1B0eTogdGhpcy5fdGVybWluYWxQcm9jZXNzLmdldFdpbmRvd3NQdHkoKSB9KTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVByb3BlcnR5LmZpcmUoeyB0eXBlOiBQcm9jZXNzUHJvcGVydHlUeXBlLlRpdGxlLCB2YWx1ZTogdGhpcy5fdGVybWluYWxQcm9jZXNzLmN1cnJlbnRUaXRsZSB9KTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVByb3BlcnR5LmZpcmUoeyB0eXBlOiBQcm9jZXNzUHJvcGVydHlUeXBlLlNoZWxsVHlwZSwgdmFsdWU6IHRoaXMuX3Rlcm1pbmFsUHJvY2Vzcy5zaGVsbFR5cGUgfSk7XG5cdFx0dGhpcy50cmlnZ2VyUmVwbGF5KCk7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRzaHV0ZG93bihpbW1lZGlhdGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxQcm9jZXNzLnNodXRkb3duKGltbWVkaWF0ZSk7XG5cdH1cblx0aW5wdXQoZGF0YTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5faW50ZXJhY3Rpb25TdGF0ZS5zZXRWYWx1ZShJbnRlcmFjdGlvblN0YXRlLlNlc3Npb24sICdpbnB1dCcpO1xuXHRcdHRoaXMuX3NlcmlhbGl6ZXIuZnJlZVJhd1Jldml2ZUJ1ZmZlcigpO1xuXHRcdGlmICh0aGlzLl9pblJlcGxheSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxQcm9jZXNzLmlucHV0KGRhdGEpO1xuXHR9XG5cdHNlbmRTaWduYWwoc2lnbmFsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faW5SZXBsYXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Rlcm1pbmFsUHJvY2Vzcy5zZW5kU2lnbmFsKHNpZ25hbCk7XG5cdH1cblx0d3JpdGVCaW5hcnkoZGF0YTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rlcm1pbmFsUHJvY2Vzcy5wcm9jZXNzQmluYXJ5KGRhdGEpO1xuXHR9XG5cdHJlc2l6ZShjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlciwgcGl4ZWxXaWR0aD86IG51bWJlciwgcGl4ZWxIZWlnaHQ/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faW5SZXBsYXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2VyaWFsaXplci5oYW5kbGVSZXNpemUoY29scywgcm93cyk7XG5cblx0XHQvLyBCdWZmZXJlZCBldmVudHMgc2hvdWxkIGZsdXNoIHdoZW4gYSByZXNpemUgb2NjdXJzXG5cdFx0dGhpcy5fYnVmZmVyZXIuZmx1c2hCdWZmZXIodGhpcy5fcGVyc2lzdGVudFByb2Nlc3NJZCk7XG5cblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxQcm9jZXNzLnJlc2l6ZShjb2xzLCByb3dzLCBwaXhlbFdpZHRoLCBwaXhlbEhlaWdodCk7XG5cdH1cblx0YXN5bmMgY2xlYXJCdWZmZXIoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fc2VyaWFsaXplci5jbGVhckJ1ZmZlcigpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsUHJvY2Vzcy5jbGVhckJ1ZmZlcigpO1xuXHR9XG5cdHNldFVuaWNvZGVWZXJzaW9uKHZlcnNpb246ICc2JyB8ICcxMScpOiB2b2lkIHtcblx0XHR0aGlzLnVuaWNvZGVWZXJzaW9uID0gdmVyc2lvbjtcblx0XHR0aGlzLl9zZXJpYWxpemVyLnNldFVuaWNvZGVWZXJzaW9uPy4odmVyc2lvbik7XG5cdFx0Ly8gVE9ETzogUGFzcyBpbiB1bmljb2RlIHZlcnNpb24gaW4gY3RvclxuXHR9XG5cblx0YXN5bmMgc2V0TmV4dENvbW1hbmRJZChjb21tYW5kTGluZTogc3RyaW5nLCBjb21tYW5kSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3NlcmlhbGl6ZXIuc2V0TmV4dENvbW1hbmRJZD8uKGNvbW1hbmRMaW5lLCBjb21tYW5kSWQpO1xuXHR9XG5cblx0YWNrbm93bGVkZ2VEYXRhRXZlbnQoY2hhckNvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faW5SZXBsYXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Rlcm1pbmFsUHJvY2Vzcy5hY2tub3dsZWRnZURhdGFFdmVudChjaGFyQ291bnQpO1xuXHR9XG5cdGdldEluaXRpYWxDd2QoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxQcm9jZXNzLmdldEluaXRpYWxDd2QoKTtcblx0fVxuXHRnZXRDd2QoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxQcm9jZXNzLmdldEN3ZCgpO1xuXHR9XG5cblx0YXN5bmMgdHJpZ2dlclJlcGxheSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5faW50ZXJhY3Rpb25TdGF0ZS52YWx1ZSA9PT0gSW50ZXJhY3Rpb25TdGF0ZS5Ob25lKSB7XG5cdFx0XHR0aGlzLl9pbnRlcmFjdGlvblN0YXRlLnNldFZhbHVlKEludGVyYWN0aW9uU3RhdGUuUmVwbGF5T25seSwgJ3RyaWdnZXJSZXBsYXknKTtcblx0XHR9XG5cdFx0Y29uc3QgZXYgPSBhd2FpdCB0aGlzLl9zZXJpYWxpemVyLmdlbmVyYXRlUmVwbGF5RXZlbnQoKTtcblx0XHRsZXQgZGF0YUxlbmd0aCA9IDA7XG5cdFx0Zm9yIChjb25zdCBlIG9mIGV2LmV2ZW50cykge1xuXHRcdFx0ZGF0YUxlbmd0aCArPSBlLmRhdGEubGVuZ3RoO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFBlcnNpc3RlbnQgcHJvY2VzcyBcIiR7dGhpcy5fcGVyc2lzdGVudFByb2Nlc3NJZH1cIjogUmVwbGF5aW5nICR7ZGF0YUxlbmd0aH0gY2hhcnMgYW5kICR7ZXYuZXZlbnRzLmxlbmd0aH0gc2l6ZSBldmVudHNgKTtcblx0XHR0aGlzLl9vblByb2Nlc3NSZXBsYXkuZmlyZShldik7XG5cdFx0dGhpcy5fdGVybWluYWxQcm9jZXNzLmNsZWFyVW5hY2tub3dsZWRnZWRDaGFycygpO1xuXHRcdHRoaXMuX29uUGVyc2lzdGVudFByb2Nlc3NSZWFkeS5maXJlKCk7XG5cdH1cblxuXHRzZW5kQ29tbWFuZFJlc3VsdChyZXFJZDogbnVtYmVyLCBpc0Vycm9yOiBib29sZWFuLCBzZXJpYWxpemVkUGF5bG9hZDogdW5rbm93bik6IHZvaWQge1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9wZW5kaW5nQ29tbWFuZHMuZ2V0KHJlcUlkKTtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ0NvbW1hbmRzLmRlbGV0ZShyZXFJZCk7XG5cdH1cblxuXHRvcnBoYW5RdWVzdGlvblJlcGx5KCk6IHZvaWQge1xuXHRcdHRoaXMuX29ycGhhblF1ZXN0aW9uUmVwbHlUaW1lID0gRGF0ZS5ub3coKTtcblx0XHRpZiAodGhpcy5fb3JwaGFuUXVlc3Rpb25CYXJyaWVyKSB7XG5cdFx0XHRjb25zdCBiYXJyaWVyID0gdGhpcy5fb3JwaGFuUXVlc3Rpb25CYXJyaWVyO1xuXHRcdFx0dGhpcy5fb3JwaGFuUXVlc3Rpb25CYXJyaWVyID0gbnVsbDtcblx0XHRcdGJhcnJpZXIub3BlbigpO1xuXHRcdH1cblx0fVxuXG5cdHJlZHVjZUdyYWNlVGltZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlzY29ubmVjdFJ1bm5lcjIuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0Ly8gd2UgYXJlIGRpc2Nvbm5lY3RlZCBhbmQgYWxyZWFkeSBydW5uaW5nIHRoZSBzaG9ydCByZWNvbm5lY3Rpb24gdGltZXJcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2Rpc2Nvbm5lY3RSdW5uZXIxLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdC8vIHdlIGFyZSBkaXNjb25uZWN0ZWQgYW5kIHJ1bm5pbmcgdGhlIGxvbmcgcmVjb25uZWN0aW9uIHRpbWVyXG5cdFx0XHR0aGlzLl9kaXNjb25uZWN0UnVubmVyMi5zY2hlZHVsZSgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGlzT3JwaGFuZWQoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuX29ycGhhblJlcXVlc3RRdWV1ZS5xdWV1ZShhc3luYyAoKSA9PiB0aGlzLl9pc09ycGhhbmVkKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaXNPcnBoYW5lZCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHQvLyBUaGUgcHJvY2VzcyBpcyBhbHJlYWR5IGtub3duIHRvIGJlIG9ycGhhbmVkXG5cdFx0aWYgKHRoaXMuX2Rpc2Nvbm5lY3RSdW5uZXIxLmlzU2NoZWR1bGVkKCkgfHwgdGhpcy5fZGlzY29ubmVjdFJ1bm5lcjIuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gQXNrIHdoZXRoZXIgdGhlIHJlbmRlcmVyKHMpIHdoZXRoZXIgdGhlIHByb2Nlc3MgaXMgb3JwaGFuZWQgYW5kIGF3YWl0IHRoZSByZXBseVxuXHRcdGlmICghdGhpcy5fb3JwaGFuUXVlc3Rpb25CYXJyaWVyKSB7XG5cdFx0XHQvLyB0aGUgYmFycmllciBvcGVucyBhZnRlciA0IHNlY29uZHMgd2l0aCBvciB3aXRob3V0IGEgcmVwbHlcblx0XHRcdHRoaXMuX29ycGhhblF1ZXN0aW9uQmFycmllciA9IG5ldyBBdXRvT3BlbkJhcnJpZXIoNDAwMCk7XG5cdFx0XHR0aGlzLl9vcnBoYW5RdWVzdGlvblJlcGx5VGltZSA9IDA7XG5cdFx0XHR0aGlzLl9vblByb2Nlc3NPcnBoYW5RdWVzdGlvbi5maXJlKCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fb3JwaGFuUXVlc3Rpb25CYXJyaWVyLndhaXQoKTtcblx0XHRyZXR1cm4gKERhdGUubm93KCkgLSB0aGlzLl9vcnBoYW5RdWVzdGlvblJlcGx5VGltZSA+IDUwMCk7XG5cdH1cbn1cblxuY2xhc3MgTXV0YXRpb25Mb2dnZXI8VD4ge1xuXHRnZXQgdmFsdWUoKTogVCB7IHJldHVybiB0aGlzLl92YWx1ZTsgfVxuXHRzZXRWYWx1ZSh2YWx1ZTogVCwgcmVhc29uOiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5fdmFsdWUgIT09IHZhbHVlKSB7XG5cdFx0XHR0aGlzLl92YWx1ZSA9IHZhbHVlO1xuXHRcdFx0dGhpcy5fbG9nKHJlYXNvbik7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbmFtZTogc3RyaW5nLFxuXHRcdHByaXZhdGUgX3ZhbHVlOiBULFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX2xvZygnaW5pdGlhbGl6ZWQnKTtcblx0fVxuXG5cdHByaXZhdGUgX2xvZyhyZWFzb246IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYE11dGF0aW9uTG9nZ2VyIFwiJHt0aGlzLl9uYW1lfVwiIHNldCB0byBcIiR7dGhpcy5fdmFsdWV9XCIsIHJlYXNvbjogJHtyZWFzb259YCk7XG5cdH1cbn1cblxuY2xhc3MgWHRlcm1TZXJpYWxpemVyIGltcGxlbWVudHMgSVRlcm1pbmFsU2VyaWFsaXplciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3h0ZXJtOiBYdGVybVRlcm1pbmFsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaGVsbEludGVncmF0aW9uQWRkb246IFNoZWxsSW50ZWdyYXRpb25BZGRvbjtcblx0cHJpdmF0ZSBfdW5pY29kZUFkZG9uPzogWHRlcm1Vbmljb2RlMTFBZGRvbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb2xzOiBudW1iZXIsXG5cdFx0cm93czogbnVtYmVyLFxuXHRcdHNjcm9sbGJhY2s6IG51bWJlcixcblx0XHR1bmljb2RlVmVyc2lvbjogJzYnIHwgJzExJyxcblx0XHRyZXZpdmVCdWZmZXJXaXRoUmVzdG9yZU1lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRzaGVsbEludGVncmF0aW9uTm9uY2U6IHN0cmluZyxcblx0XHRwcml2YXRlIF9yYXdSZXZpdmVCdWZmZXI6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl94dGVybSA9IG5ldyBYdGVybVRlcm1pbmFsKHtcblx0XHRcdGNvbHMsXG5cdFx0XHRyb3dzLFxuXHRcdFx0c2Nyb2xsYmFjayxcblx0XHRcdGFsbG93UHJvcG9zZWRBcGk6IHRydWVcblx0XHR9KTtcblx0XHRpZiAocmV2aXZlQnVmZmVyV2l0aFJlc3RvcmVNZXNzYWdlKSB7XG5cdFx0XHR0aGlzLl94dGVybS53cml0ZWxuKHJldml2ZUJ1ZmZlcldpdGhSZXN0b3JlTWVzc2FnZSk7XG5cdFx0fVxuXHRcdHRoaXMuc2V0VW5pY29kZVZlcnNpb24odW5pY29kZVZlcnNpb24pO1xuXHRcdHRoaXMuX3NoZWxsSW50ZWdyYXRpb25BZGRvbiA9IG5ldyBTaGVsbEludGVncmF0aW9uQWRkb24oc2hlbGxJbnRlZ3JhdGlvbk5vbmNlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbG9nU2VydmljZSk7XG5cdFx0dGhpcy5feHRlcm0ubG9hZEFkZG9uKHRoaXMuX3NoZWxsSW50ZWdyYXRpb25BZGRvbik7XG5cdH1cblxuXHRmcmVlUmF3UmV2aXZlQnVmZmVyKCk6IHZvaWQge1xuXHRcdC8vIEZyZWUgdGhlIG1lbW9yeSBvZiB0aGUgdGVybWluYWwgaWYgaXQgd2lsbCBuZWVkIHRvIGJlIHJlLXNlcmlhbGl6ZWRcblx0XHR0aGlzLl9yYXdSZXZpdmVCdWZmZXIgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRoYW5kbGVEYXRhKGRhdGE6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3h0ZXJtLndyaXRlKGRhdGEpO1xuXHR9XG5cblx0aGFuZGxlUmVzaXplKGNvbHM6IG51bWJlciwgcm93czogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5feHRlcm0ucmVzaXplKGNvbHMsIHJvd3MpO1xuXHR9XG5cblx0Y2xlYXJCdWZmZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5feHRlcm0uY2xlYXIoKTtcblx0fVxuXG5cdHNldE5leHRDb21tYW5kSWQoY29tbWFuZExpbmU6IHN0cmluZywgY29tbWFuZElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9zaGVsbEludGVncmF0aW9uQWRkb24uc2V0TmV4dENvbW1hbmRJZChjb21tYW5kTGluZSwgY29tbWFuZElkKTtcblx0fVxuXG5cdGFzeW5jIGdlbmVyYXRlUmVwbGF5RXZlbnQobm9ybWFsQnVmZmVyT25seT86IGJvb2xlYW4sIHJlc3RvcmVUb0xhc3RSZXZpdmVCdWZmZXI/OiBib29sZWFuKTogUHJvbWlzZTxJUHR5SG9zdFByb2Nlc3NSZXBsYXlFdmVudD4ge1xuXHRcdGNvbnN0IHNlcmlhbGl6ZSA9IG5ldyAoYXdhaXQgdGhpcy5fZ2V0U2VyaWFsaXplQ29uc3RydWN0b3IoKSk7XG5cdFx0dGhpcy5feHRlcm0ubG9hZEFkZG9uKHNlcmlhbGl6ZSk7XG5cdFx0Y29uc3Qgb3B0aW9uczogSVNlcmlhbGl6ZU9wdGlvbnMgPSB7XG5cdFx0XHRzY3JvbGxiYWNrOiB0aGlzLl94dGVybS5vcHRpb25zLnNjcm9sbGJhY2tcblx0XHR9O1xuXHRcdGlmIChub3JtYWxCdWZmZXJPbmx5KSB7XG5cdFx0XHRvcHRpb25zLmV4Y2x1ZGVBbHRCdWZmZXIgPSB0cnVlO1xuXHRcdFx0b3B0aW9ucy5leGNsdWRlTW9kZXMgPSB0cnVlO1xuXHRcdH1cblx0XHRsZXQgc2VyaWFsaXplZDogc3RyaW5nO1xuXHRcdGlmIChyZXN0b3JlVG9MYXN0UmV2aXZlQnVmZmVyICYmIHRoaXMuX3Jhd1Jldml2ZUJ1ZmZlcikge1xuXHRcdFx0c2VyaWFsaXplZCA9IHRoaXMuX3Jhd1Jldml2ZUJ1ZmZlcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2VyaWFsaXplZCA9IHNlcmlhbGl6ZS5zZXJpYWxpemUob3B0aW9ucyk7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRldmVudHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbHM6IHRoaXMuX3h0ZXJtLmNvbHMsXG5cdFx0XHRcdFx0cm93czogdGhpcy5feHRlcm0ucm93cyxcblx0XHRcdFx0XHRkYXRhOiBzZXJpYWxpemVkXG5cdFx0XHRcdH1cblx0XHRcdF0sXG5cdFx0XHRjb21tYW5kczogdGhpcy5fc2hlbGxJbnRlZ3JhdGlvbkFkZG9uLnNlcmlhbGl6ZSgpXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHNldFVuaWNvZGVWZXJzaW9uKHZlcnNpb246ICc2JyB8ICcxMScpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5feHRlcm0udW5pY29kZS5hY3RpdmVWZXJzaW9uID09PSB2ZXJzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh2ZXJzaW9uID09PSAnMTEnKSB7XG5cdFx0XHR0aGlzLl91bmljb2RlQWRkb24gPSBuZXcgKGF3YWl0IHRoaXMuX2dldFVuaWNvZGUxMUNvbnN0cnVjdG9yKCkpO1xuXHRcdFx0dGhpcy5feHRlcm0ubG9hZEFkZG9uKHRoaXMuX3VuaWNvZGVBZGRvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3VuaWNvZGVBZGRvbj8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fdW5pY29kZUFkZG9uID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl94dGVybS51bmljb2RlLmFjdGl2ZVZlcnNpb24gPSB2ZXJzaW9uO1xuXHR9XG5cblx0YXN5bmMgX2dldFVuaWNvZGUxMUNvbnN0cnVjdG9yKCk6IFByb21pc2U8dHlwZW9mIFVuaWNvZGUxMUFkZG9uPiB7XG5cdFx0aWYgKCFVbmljb2RlMTFBZGRvbikge1xuXHRcdFx0VW5pY29kZTExQWRkb24gPSAoYXdhaXQgaW1wb3J0KCdAeHRlcm0vYWRkb24tdW5pY29kZTExJykpLlVuaWNvZGUxMUFkZG9uO1xuXHRcdH1cblx0XHRyZXR1cm4gVW5pY29kZTExQWRkb247XG5cdH1cblxuXHRhc3luYyBfZ2V0U2VyaWFsaXplQ29uc3RydWN0b3IoKTogUHJvbWlzZTx0eXBlb2YgU2VyaWFsaXplQWRkb24+IHtcblx0XHRpZiAoIVNlcmlhbGl6ZUFkZG9uKSB7XG5cdFx0XHRTZXJpYWxpemVBZGRvbiA9IChhd2FpdCBpbXBvcnQoJ0B4dGVybS9hZGRvbi1zZXJpYWxpemUnKSkuU2VyaWFsaXplQWRkb247XG5cdFx0fVxuXHRcdHJldHVybiBTZXJpYWxpemVBZGRvbjtcblx0fVxufVxuXG5mdW5jdGlvbiBwcmludFRpbWUobXM6IG51bWJlcik6IHN0cmluZyB7XG5cdGxldCBoID0gMDtcblx0bGV0IG0gPSAwO1xuXHRsZXQgcyA9IDA7XG5cdGlmIChtcyA+PSAxMDAwKSB7XG5cdFx0cyA9IE1hdGguZmxvb3IobXMgLyAxMDAwKTtcblx0XHRtcyAtPSBzICogMTAwMDtcblx0fVxuXHRpZiAocyA+PSA2MCkge1xuXHRcdG0gPSBNYXRoLmZsb29yKHMgLyA2MCk7XG5cdFx0cyAtPSBtICogNjA7XG5cdH1cblx0aWYgKG0gPj0gNjApIHtcblx0XHRoID0gTWF0aC5mbG9vcihtIC8gNjApO1xuXHRcdG0gLT0gaCAqIDYwO1xuXHR9XG5cdGNvbnN0IF9oID0gaCA/IGAke2h9aGAgOiBgYDtcblx0Y29uc3QgX20gPSBtID8gYCR7bX1tYCA6IGBgO1xuXHRjb25zdCBfcyA9IHMgPyBgJHtzfXNgIDogYGA7XG5cdGNvbnN0IF9tcyA9IG1zID8gYCR7bXN9bXNgIDogYGA7XG5cdHJldHVybiBgJHtfaH0ke19tfSR7X3N9JHtfbXN9YDtcbn1cblxuaW50ZXJmYWNlIElUZXJtaW5hbFNlcmlhbGl6ZXIge1xuXHRoYW5kbGVEYXRhKGRhdGE6IHN0cmluZyk6IHZvaWQ7XG5cdGZyZWVSYXdSZXZpdmVCdWZmZXIoKTogdm9pZDtcblx0aGFuZGxlUmVzaXplKGNvbHM6IG51bWJlciwgcm93czogbnVtYmVyKTogdm9pZDtcblx0Y2xlYXJCdWZmZXIoKTogdm9pZDtcblx0Z2VuZXJhdGVSZXBsYXlFdmVudChub3JtYWxCdWZmZXJPbmx5PzogYm9vbGVhbiwgcmVzdG9yZVRvTGFzdFJldml2ZUJ1ZmZlcj86IGJvb2xlYW4pOiBQcm9taXNlPElQdHlIb3N0UHJvY2Vzc1JlcGxheUV2ZW50Pjtcblx0c2V0VW5pY29kZVZlcnNpb24/KHZlcnNpb246ICc2JyB8ICcxMScpOiB2b2lkO1xuXHRzZXROZXh0Q29tbWFuZElkPyhjb21tYW5kTGluZTogc3RyaW5nLCBjb21tYW5kSWQ6IHN0cmluZyk6IHZvaWQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7O0FBS0EsU0FBUyxVQUFVLFlBQVk7QUFDL0IsU0FBUyxpQkFBaUIsNkJBQTZCLFVBQVUsT0FBTyxlQUFlO0FBQ3ZGLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUE4QixXQUE0QixVQUFVO0FBRXBFLFNBQVMsc0JBQXNCO0FBQy9CLFNBQXNCLGdCQUFnQjtBQUN0QyxTQUFTLG9CQUFvQjtBQUM3QixTQUErUSxrQkFBa0IscUJBQStQLHNCQUE2QztBQUM3a0IsU0FBUyw0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
