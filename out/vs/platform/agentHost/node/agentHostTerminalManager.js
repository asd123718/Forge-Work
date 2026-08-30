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
import { DeferredPromise, raceCancellablePromises, timeout } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { dirname, parse as pathParse } from "../../../base/common/path.js";
import * as platform from "../../../base/common/platform.js";
import { getSystemShell } from "../../../base/node/shell.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { AiAgentEnvValue, AiAgentEnvVar } from "../../chat/common/aiAgentEnv.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { getShellIntegrationInjection } from "../../terminal/node/terminalEnvironment.js";
import { AgentHostConfigKey, agentHostCustomizationConfigSchema } from "../common/agentHostCustomizationConfig.js";
import { ActionType } from "../common/state/protocol/actions.js";
import { TerminalClaimKind } from "../common/state/protocol/state.js";
import { isTerminalAction } from "../common/state/sessionActions.js";
import { ROOT_STATE_URI } from "../common/state/sessionState.js";
import { IAgentConfigurationService } from "./agentConfigurationService.js";
import { AgentHostHeadlessTerminal } from "./agentHostHeadlessTerminal.js";
import { isZsh } from "./agentHostShellUtils.js";
import { IAgentHostStateManager } from "./agentHostStateManager.js";
import { Osc633EventType, Osc633Parser } from "./osc633Parser.js";
const WAIT_FOR_PROMPT_TIMEOUT = 1e4;
const HEADLESS_TERMINAL_SCROLLBACK = 0;
const DSR_CURSOR_POSITION_QUERY = "\x1B[6n";
const DEC_DSR_CURSOR_POSITION_QUERY = "\x1B[?6n";
const OSC_FOREGROUND_COLOR_QUERY_ST = "\x1B]10;?\x1B\\";
const OSC_FOREGROUND_COLOR_QUERY_BEL = "\x1B]10;?\x07";
const OSC_BACKGROUND_COLOR_QUERY_ST = "\x1B]11;?\x1B\\";
const OSC_BACKGROUND_COLOR_QUERY_BEL = "\x1B]11;?\x07";
const TERMINAL_QUERIES_SUPPRESSED_FROM_CLIENT = [
  DEC_DSR_CURSOR_POSITION_QUERY,
  DSR_CURSOR_POSITION_QUERY,
  OSC_FOREGROUND_COLOR_QUERY_ST,
  OSC_FOREGROUND_COLOR_QUERY_BEL,
  OSC_BACKGROUND_COLOR_QUERY_ST,
  OSC_BACKGROUND_COLOR_QUERY_BEL
];
const TERMINAL_QUERY_SUPPRESSION_REGEX = /\x1b(?:\[\??6n|\]1[01];\?(?:\x07|\x1b\\))/g;
const TERMINAL_QUERY_PREFIXES_SUPPRESSED_FROM_CLIENT = [...new Set(TERMINAL_QUERIES_SUPPRESSED_FROM_CLIENT.flatMap((query) => {
  const prefixes = [];
  for (let i = 1; i < query.length; i++) {
    prefixes.push(query.substring(0, i));
  }
  return prefixes;
}))].sort((a, b) => b.length - a.length);
const IAgentHostTerminalManager = createDecorator("agentHostTerminalManager");
function removeTerminalQueriesSuppressedFromClient(data, state) {
  if (!state.pendingData && !data.includes("\x1B")) {
    return data;
  }
  const combinedData = state.pendingData + data;
  const pendingData = getTerminalQueryPrefixSuppressedFromClient(combinedData);
  const dataToFilter = pendingData ? combinedData.substring(0, combinedData.length - pendingData.length) : combinedData;
  state.pendingData = pendingData;
  return dataToFilter.replace(TERMINAL_QUERY_SUPPRESSION_REGEX, "");
}
function getTerminalQueryPrefixSuppressedFromClient(data) {
  for (const prefix of TERMINAL_QUERY_PREFIXES_SUPPRESSED_FROM_CLIENT) {
    if (data.endsWith(prefix)) {
      return prefix;
    }
  }
  return "";
}
function formatTerminalText(data, options) {
  if (options.forceBracketedPasteMode) {
    data = `\x1B[200~${data}\x1B[201~`;
  }
  data = data.replace(/\r?\n/g, "\r");
  if (options.shouldExecute && !data.endsWith("\r")) {
    data += "\r";
  }
  return data;
}
let nodePtyModule;
async function getNodePty() {
  if (!nodePtyModule) {
    nodePtyModule = await import("node-pty");
  }
  return nodePtyModule;
}
let AgentHostTerminalManager = class extends Disposable {
  constructor(_stateManager, _logService, _productService, _configurationService) {
    super();
    this._stateManager = _stateManager;
    this._logService = _logService;
    this._productService = _productService;
    this._configurationService = _configurationService;
    this._terminals = /* @__PURE__ */ new Map();
    this._outputTerminals = /* @__PURE__ */ new Map();
    this._register(this._stateManager.onDidEmitEnvelope((envelope) => {
      const action = envelope.action;
      if (!isTerminalAction(action)) {
        return;
      }
      const channel = envelope.channel;
      switch (action.type) {
        case ActionType.TerminalInput:
          this._writeInput(channel, action.data);
          break;
        case ActionType.TerminalResized:
          this._resize(channel, action.cols, action.rows);
          break;
        case ActionType.TerminalClaimed:
          this._setClaim(channel, action.claim);
          break;
        case ActionType.TerminalTitleChanged:
          this._setTitle(channel, action.title);
          break;
        case ActionType.TerminalCleared:
          this._clearContent(channel);
          break;
      }
    }));
  }
  /** Get metadata for all active terminals (for root state). */
  getTerminalInfos() {
    return [...this._terminals.values()].map((t) => ({
      resource: t.uri,
      title: t.title,
      claim: t.claim,
      exitCode: t.exitCode
    }));
  }
  /** Get the full state for a terminal (for subscribe snapshots). */
  getTerminalState(uri) {
    const outputTerminal = this._outputTerminals.get(uri);
    if (outputTerminal) {
      return {
        title: outputTerminal.title,
        content: outputTerminal.content,
        exitCode: outputTerminal.exitCode,
        claim: outputTerminal.claim,
        isPty: false
      };
    }
    const terminal = this._terminals.get(uri);
    if (!terminal) {
      return void 0;
    }
    return {
      title: terminal.title,
      cwd: terminal.cwd,
      cols: terminal.cols,
      rows: terminal.rows,
      content: terminal.content,
      exitCode: terminal.exitCode,
      claim: terminal.claim,
      supportsCommandDetection: terminal.commandTracker?.detectionAvailableEmitted,
      isPty: true
    };
  }
  /**
   * Create a new terminal backed by node-pty.
   * Spawns the user's default shell.
   */
  async createTerminal(params, options) {
    const uri = params.channel;
    if (this._terminals.has(uri)) {
      throw new Error(`Terminal already exists: ${uri}`);
    }
    const cwd = await this._resolveCwd(params.cwd, uri);
    const cols = params.cols ?? 80;
    const rows = params.rows ?? 24;
    const shell = options?.shell ?? await this.getDefaultShell();
    const name = platform.isWindows ? "cmd" : "xterm-256color";
    this._logService.info(`[TerminalManager] Creating terminal ${uri}: shell=${shell}, cwd=${cwd}, cols=${cols}, rows=${rows}`);
    const nonce = generateUuid();
    const env = { ...process.env };
    env[AiAgentEnvVar] = AiAgentEnvValue;
    if (options?.preventShellHistory) {
      env["VSCODE_PREVENT_SHELL_HISTORY"] = "1";
    }
    if (params.claim?.kind === TerminalClaimKind.Session && isZsh(shell)) {
      env["VSCODE_AGENT_ZSH_FIXUPS"] = "1";
    }
    if (options?.nonInteractive) {
      env["LC_ALL"] = "C.UTF-8";
      env["PAGER"] = "";
      env["GIT_PAGER"] = "";
      env["GH_PAGER"] = "";
      env["GIT_TERMINAL_PROMPT"] = "0";
      env["DEBIAN_FRONTEND"] = "noninteractive";
    }
    let shellArgs = [];
    if (platform.isMacintosh) {
      const shellName = pathParse(shell).name;
      if (shellName.match(/(zsh|bash)/)) {
        shellArgs = ["--login"];
      }
    }
    const injection = await getShellIntegrationInjection(
      { executable: shell, args: shellArgs, forceShellIntegration: true },
      {
        shellIntegration: { enabled: true, suggestEnabled: false, nonce },
        windowsUseConptyDll: false,
        environmentVariableCollections: void 0,
        workspaceFolder: void 0,
        isScreenReaderOptimized: false
      },
      void 0,
      this._logService,
      this._productService
    );
    let commandTracker;
    if (injection.type === "injection") {
      this._logService.info(`[TerminalManager] Shell integration injected for ${uri}`);
      if (injection.envMixin) {
        for (const [key, value] of Object.entries(injection.envMixin)) {
          if (value !== void 0) {
            env[key] = value;
          }
        }
      }
      if (injection.newArgs) {
        shellArgs = injection.newArgs;
      }
      if (injection.filesToCopy) {
        for (const f of injection.filesToCopy) {
          try {
            await fs.promises.mkdir(dirname(f.dest), { recursive: true });
            await fs.promises.copyFile(f.source, f.dest);
          } catch {
          }
        }
      }
      commandTracker = {
        parser: new Osc633Parser(),
        nonce,
        commandCounter: 0,
        detectionAvailableEmitted: false
      };
    } else {
      this._logService.info(`[TerminalManager] Shell integration not available for ${uri}: ${injection.reason}`);
    }
    const ptyProcess = await this._spawnPty(shell, shellArgs, {
      name,
      cwd,
      env,
      cols,
      rows
    });
    const store = new DisposableStore();
    const claim = params.claim ?? { kind: TerminalClaimKind.Client, clientId: "" };
    const onDataEmitter = store.add(new Emitter());
    const onExitEmitter = store.add(new Emitter());
    const onClaimChangedEmitter = store.add(new Emitter());
    const onCommandFinishedEmitter = store.add(new Emitter());
    const headlessTerminal = store.add(new AgentHostHeadlessTerminal({
      cols,
      rows,
      scrollback: HEADLESS_TERMINAL_SCROLLBACK,
      logService: this._logService
    }));
    const managed = {
      uri,
      store,
      pty: ptyProcess,
      onDataEmitter,
      onExitEmitter,
      onClaimChangedEmitter,
      onCommandFinishedEmitter,
      title: params.name ?? shell,
      cwd,
      cols,
      rows,
      content: [],
      contentSize: 0,
      claim,
      commandTracker,
      headlessTerminal,
      terminalQueryFilterState: { pendingData: "" }
    };
    this._terminals.set(uri, managed);
    store.add(headlessTerminal.onResponseData((data) => {
      this._logService.debug(`[TerminalManager] Writing headless terminal response for ${uri}: ${JSON.stringify(data)}`);
      try {
        ptyProcess.write(data);
      } catch (err) {
        this._logService.debug(`[TerminalManager] Failed to write headless terminal response for ${uri}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }));
    store.add(toDisposable(() => {
      try {
        ptyProcess.kill();
      } catch {
      }
    }));
    const onFirstData = new DeferredPromise();
    const dataListener = ptyProcess.onData((rawData) => {
      void managed.headlessTerminal?.writePtyData(rawData);
      this._handlePtyData(managed, rawData);
      onFirstData.complete();
    });
    store.add(toDisposable(() => dataListener.dispose()));
    const exitListener = ptyProcess.onExit((e) => {
      managed.exitCode = e.exitCode;
      managed.onExitEmitter.fire(e.exitCode);
      onFirstData.complete();
      this._stateManager.dispatchServerAction(uri, {
        type: ActionType.TerminalExited,
        exitCode: e.exitCode
      });
      this._broadcastTerminalList();
    });
    store.add(toDisposable(() => exitListener.dispose()));
    if (!platform.isWindows) {
      const titleInterval = setInterval(() => {
        const newTitle = ptyProcess.process;
        if (newTitle && newTitle !== managed.title) {
          managed.title = newTitle;
          this._stateManager.dispatchServerAction(uri, {
            type: ActionType.TerminalTitleChanged,
            title: newTitle
          });
          this._broadcastTerminalList();
        }
      }, 200);
      store.add(toDisposable(() => clearInterval(titleInterval)));
    }
    await raceCancellablePromises([onFirstData.p, timeout(WAIT_FOR_PROMPT_TIMEOUT)]);
    this._broadcastTerminalList();
  }
  async _spawnPty(file, args, options) {
    const nodePty = await getNodePty();
    return nodePty.spawn(file, args, options);
  }
  /** Send input data to a terminal's PTY process (from client-dispatched actions). */
  _writeInput(uri, data) {
    this.writeInput(uri, data);
  }
  /** Send input data to a terminal's PTY process. */
  writeInput(uri, data) {
    const terminal = this._terminals.get(uri);
    if (terminal && terminal.exitCode === void 0) {
      terminal.pty.write(data);
    }
  }
  /** Send formatted text to a terminal's PTY process. */
  async sendText(uri, data, options) {
    const terminal = this._terminals.get(uri);
    let forceBracketedPasteMode = false;
    if (options.bracketedPasteMode) {
      await terminal?.headlessTerminal?.whenPtyDataFlushed();
      forceBracketedPasteMode = !!terminal?.headlessTerminal?.isBracketedPasteMode();
    }
    this.writeInput(uri, formatTerminalText(data, { shouldExecute: options.shouldExecute, forceBracketedPasteMode }));
  }
  /** Register a callback for PTY data events on a terminal. */
  onData(uri, cb) {
    const terminal = this._terminals.get(uri);
    if (!terminal) {
      return toDisposable(() => {
      });
    }
    return terminal.onDataEmitter.event(cb);
  }
  /** Register a callback for PTY exit events on a terminal. */
  onExit(uri, cb) {
    const terminal = this._terminals.get(uri);
    if (!terminal) {
      return toDisposable(() => {
      });
    }
    return terminal.onExitEmitter.event(cb);
  }
  /** Register a callback for terminal claim changes. */
  onClaimChanged(uri, cb) {
    const terminal = this._terminals.get(uri);
    if (!terminal) {
      return toDisposable(() => {
      });
    }
    return terminal.onClaimChangedEmitter.event(cb);
  }
  /** Register a callback for command completion events (requires shell integration). */
  onCommandFinished(uri, cb) {
    const terminal = this._terminals.get(uri);
    if (!terminal) {
      return toDisposable(() => {
      });
    }
    return terminal.onCommandFinishedEmitter.event(cb);
  }
  createAltBufferPromise(uri, store) {
    const terminal = this._terminals.get(uri);
    if (!terminal?.headlessTerminal) {
      return new Promise(() => {
      });
    }
    return terminal.headlessTerminal.createAltBufferPromise(store);
  }
  /** Get accumulated scrollback content for a terminal as raw text. */
  getContent(uri) {
    const terminal = this._terminals.get(uri);
    if (!terminal) {
      return void 0;
    }
    return terminal.content.map((p) => p.type === "command" ? p.output : p.value).join("");
  }
  /** Get the current claim for a terminal. */
  getClaim(uri) {
    return this._terminals.get(uri)?.claim;
  }
  /** Check whether a terminal exists. */
  hasTerminal(uri) {
    return this._terminals.has(uri);
  }
  /** Whether the terminal has shell integration active for command detection. */
  supportsCommandDetection(uri) {
    const terminal = this._terminals.get(uri);
    return terminal?.commandTracker?.detectionAvailableEmitted ?? false;
  }
  /** Get the exit code for a terminal, or undefined if still running. */
  getExitCode(uri) {
    return this._terminals.get(uri)?.exitCode;
  }
  /** Resize a terminal. */
  _resize(uri, cols, rows) {
    const terminal = this._terminals.get(uri);
    if (terminal && terminal.exitCode === void 0) {
      terminal.cols = cols;
      terminal.rows = rows;
      terminal.pty.resize(cols, rows);
      terminal.headlessTerminal?.resize(cols, rows);
    }
  }
  /** Update a terminal's claim. */
  _setClaim(uri, claim) {
    const terminal = this._terminals.get(uri);
    if (terminal) {
      terminal.claim = claim;
      terminal.onClaimChangedEmitter.fire(claim);
      this._broadcastTerminalList();
    }
  }
  /** Update a terminal's title. */
  _setTitle(uri, title) {
    const terminal = this._terminals.get(uri);
    if (terminal) {
      terminal.title = title;
      this._broadcastTerminalList();
    }
  }
  /** Clear a terminal's scrollback buffer. */
  _clearContent(uri) {
    const terminal = this._terminals.get(uri);
    if (terminal) {
      terminal.content = [];
      terminal.contentSize = 0;
      terminal.headlessTerminal?.clear();
    }
  }
  /** Process raw PTY output: parse OSC 633 sequences, dispatch actions, track content. */
  _handlePtyData(managed, rawData) {
    const tracker = managed.commandTracker;
    const segments = tracker ? tracker.parser.parseSegments(rawData) : rawData.length > 0 ? [{ kind: "data", data: rawData }] : [];
    let pendingClientData = "";
    const flushClientData = () => {
      if (pendingClientData.length === 0) {
        return;
      }
      managed.onDataEmitter.fire(pendingClientData);
      this._stateManager.dispatchServerAction(managed.uri, {
        type: ActionType.TerminalData,
        data: pendingClientData
      });
      pendingClientData = "";
    };
    for (const segment of segments) {
      if (segment.kind === "event") {
        flushClientData();
        this._handleOsc633Event(managed, tracker, segment.event);
        continue;
      }
      const cleanedData = removeTerminalQueriesSuppressedFromClient(segment.data, managed.terminalQueryFilterState);
      if (cleanedData.length > 0) {
        this._appendToContent(managed, cleanedData);
        pendingClientData += cleanedData;
      }
    }
    flushClientData();
    this._trimContent(managed);
  }
  /** Handle a parsed OSC 633 event by dispatching the appropriate protocol actions. */
  _handleOsc633Event(managed, tracker, event) {
    if (!tracker.detectionAvailableEmitted) {
      tracker.detectionAvailableEmitted = true;
      this._stateManager.dispatchServerAction(managed.uri, {
        type: ActionType.TerminalCommandDetectionAvailable
      });
    }
    switch (event.type) {
      case Osc633EventType.CommandLine: {
        if (event.nonce === tracker.nonce) {
          tracker.pendingCommandLine = event.commandLine;
        }
        break;
      }
      case Osc633EventType.CommandExecuted: {
        const commandId = `cmd-${++tracker.commandCounter}`;
        const commandLine = tracker.pendingCommandLine ?? "";
        const timestamp = Date.now();
        tracker.pendingCommandLine = void 0;
        tracker.activeCommandId = commandId;
        tracker.activeCommandTimestamp = timestamp;
        managed.content.push({
          type: "command",
          commandId,
          commandLine,
          output: "",
          timestamp,
          isComplete: false
        });
        this._stateManager.dispatchServerAction(managed.uri, {
          type: ActionType.TerminalCommandExecuted,
          commandId,
          commandLine,
          timestamp
        });
        break;
      }
      case Osc633EventType.CommandFinished: {
        const finishedCommandId = tracker.activeCommandId;
        if (!finishedCommandId) {
          break;
        }
        const durationMs = tracker.activeCommandTimestamp !== void 0 ? Date.now() - tracker.activeCommandTimestamp : void 0;
        let commandLine = "";
        let commandOutput = "";
        for (const part of managed.content) {
          if (part.type === "command" && part.commandId === finishedCommandId) {
            part.isComplete = true;
            part.exitCode = event.exitCode;
            part.durationMs = durationMs;
            commandLine = part.commandLine;
            commandOutput = part.output;
            break;
          }
        }
        tracker.activeCommandId = void 0;
        tracker.activeCommandTimestamp = void 0;
        managed.onCommandFinishedEmitter.fire({
          commandId: finishedCommandId,
          exitCode: event.exitCode,
          command: commandLine,
          output: commandOutput
        });
        this._stateManager.dispatchServerAction(managed.uri, {
          type: ActionType.TerminalCommandFinished,
          commandId: finishedCommandId,
          exitCode: event.exitCode,
          durationMs
        });
        break;
      }
      case Osc633EventType.Property: {
        if (event.key === "Cwd") {
          managed.cwd = event.value;
          this._stateManager.dispatchServerAction(managed.uri, {
            type: ActionType.TerminalCwdChanged,
            cwd: event.value
          });
        }
        break;
      }
    }
  }
  /** Append cleaned data to the terminal's structured content array. */
  _appendToContent(managed, data) {
    const tail = managed.content.length > 0 ? managed.content[managed.content.length - 1] : void 0;
    if (tail?.type === "command" && !tail.isComplete) {
      tail.output += data;
      managed.contentSize += data.length;
    } else if (tail?.type === "unclassified") {
      tail.value += data;
      managed.contentSize += data.length;
    } else {
      managed.content.push({ type: "unclassified", value: data });
      managed.contentSize += data.length;
    }
  }
  _getContentPartSize(part) {
    return part.type === "command" ? part.output.length : part.value.length;
  }
  /** Trim content parts to stay within the rolling buffer limit. */
  _trimContent(managed) {
    const maxSize = 1e5;
    const targetSize = 8e4;
    if (managed.contentSize <= maxSize) {
      return;
    }
    while (managed.contentSize > targetSize && managed.content.length > 1) {
      const removed = managed.content.shift();
      managed.contentSize -= this._getContentPartSize(removed);
    }
    if (managed.contentSize > targetSize && managed.content.length > 0) {
      const head = managed.content[0];
      const excess = managed.contentSize - targetSize;
      if (head.type === "command") {
        head.output = head.output.slice(excess);
      } else {
        head.value = head.value.slice(excess);
      }
      managed.contentSize -= excess;
    }
  }
  /**
   * Create an output-only terminal channel. Unlike {@link createTerminal}
   * there is no PTY behind it: the owner appends plain-text output via
   * {@link appendOutputTerminalData}. The channel is not announced on the
   * root terminal list — clients discover it through the tool result's
   * terminal content block and subscribe to its URI.
   */
  createOutputTerminal(uri, options) {
    if (this._terminals.has(uri) || this._outputTerminals.has(uri)) {
      throw new Error(`Terminal already exists: ${uri}`);
    }
    this._outputTerminals.set(uri, {
      title: options.title,
      content: [],
      contentSize: 0,
      claim: options.claim
    });
  }
  /** Append plain-text data to an output-only terminal and stream it to subscribers. */
  appendOutputTerminalData(uri, data) {
    const terminal = this._outputTerminals.get(uri);
    if (!terminal || data.length === 0) {
      return;
    }
    this._appendToContent(terminal, data);
    this._trimContent(terminal);
    this._stateManager.dispatchServerAction(uri, {
      type: ActionType.TerminalData,
      data
    });
  }
  /** Clear an output-only terminal's content (e.g. when cumulative source output was rewritten). */
  resetOutputTerminal(uri) {
    const terminal = this._outputTerminals.get(uri);
    if (!terminal) {
      return;
    }
    terminal.content = [];
    terminal.contentSize = 0;
    this._stateManager.dispatchServerAction(uri, {
      type: ActionType.TerminalCleared
    });
  }
  /** Record the command's exit on an output-only terminal and notify subscribers. */
  finalizeOutputTerminal(uri, exitCode) {
    const terminal = this._outputTerminals.get(uri);
    if (!terminal || terminal.exitCode !== void 0) {
      return;
    }
    if (exitCode !== void 0) {
      terminal.exitCode = exitCode;
      this._stateManager.dispatchServerAction(uri, {
        type: ActionType.TerminalExited,
        exitCode
      });
    }
  }
  /** Dispose a terminal: kill the process and remove it. */
  disposeTerminal(uri) {
    if (this._outputTerminals.delete(uri)) {
      return;
    }
    const terminal = this._terminals.get(uri);
    if (terminal) {
      this._terminals.delete(uri);
      terminal.store.dispose();
      this._broadcastTerminalList();
    }
  }
  async getDefaultShell() {
    const configured = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.DefaultShell);
    if (configured) {
      try {
        await fs.promises.access(configured, fs.constants.X_OK);
        return configured;
      } catch (err) {
        this._logService.warn(`[TerminalManager] Configured defaultShell '${configured}' is not accessible, falling back to system shell: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return getSystemShell(platform.OS, process.env);
  }
  /**
   * Resolves the cwd string from {@link CreateTerminalParams} to an
   * accessible filesystem path, falling back to $HOME if the requested
   * directory is missing (otherwise node-pty exits silently with code 1).
   * Accepts either a `file://` URI string or a raw absolute filesystem path.
   */
  async _resolveCwd(cwd, terminalURI) {
    let resolved = cwd;
    if (cwd) {
      const parsed = URI.parse(cwd);
      if (parsed.scheme === "file" && parsed.fsPath && parsed.fsPath !== "/") {
        resolved = parsed.fsPath;
      } else {
        this._logService.warn(`[TerminalManager] Ignoring non-file cwd for ${terminalURI}: ${cwd}`);
      }
    }
    try {
      if (resolved) {
        const stat = await fs.promises.stat(resolved);
        if (stat.isDirectory()) {
          return resolved;
        }
      }
    } catch {
    }
    const fallback = process.env["HOME"] || process.env["USERPROFILE"] || process.cwd();
    this._logService.warn(`[TerminalManager] cwd '${resolved}' is not accessible, falling back to ${fallback}`);
    return fallback;
  }
  /** Dispatch root/terminalsChanged with the current terminal list. */
  _broadcastTerminalList() {
    this._stateManager.dispatchServerAction(ROOT_STATE_URI, {
      type: ActionType.RootTerminalsChanged,
      terminals: this.getTerminalInfos()
    });
  }
  dispose() {
    for (const terminal of this._terminals.values()) {
      terminal.store.dispose();
    }
    this._terminals.clear();
    super.dispose();
  }
};
AgentHostTerminalManager = __decorateClass([
  __decorateParam(0, IAgentHostStateManager),
  __decorateParam(1, ILogService),
  __decorateParam(2, IProductService),
  __decorateParam(3, IAgentConfigurationService)
], AgentHostTerminalManager);
export {
  AgentHostTerminalManager,
  IAgentHostTerminalManager,
  formatTerminalText,
  removeTerminalQueriesSuppressedFromClient
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIHJhY2VDYW5jZWxsYWJsZVByb21pc2VzLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lLCBwYXJzZSBhcyBwYXRoUGFyc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGdldFN5c3RlbVNoZWxsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3NoZWxsLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IEFpQWdlbnRFbnZWYWx1ZSwgQWlBZ2VudEVudlZhciB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2FpQWdlbnRFbnYuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24gfSBmcm9tICcuLi8uLi90ZXJtaW5hbC9ub2RlL3Rlcm1pbmFsRW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q29uZmlnS2V5LCBhZ2VudEhvc3RDdXN0b21pemF0aW9uQ29uZmlnU2NoZW1hIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdEN1c3RvbWl6YXRpb25Db25maWcuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9hY3Rpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgQ3JlYXRlVGVybWluYWxQYXJhbXMgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDbGFpbSwgVGVybWluYWxDb250ZW50UGFydCwgVGVybWluYWxJbmZvLCBUZXJtaW5hbFN0YXRlLCBUZXJtaW5hbENsYWltS2luZCB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBpc1Rlcm1pbmFsQWN0aW9uIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IFJPT1RfU1RBVEVfVVJJIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4vYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RIZWFkbGVzc1Rlcm1pbmFsIH0gZnJvbSAnLi9hZ2VudEhvc3RIZWFkbGVzc1Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGlzWnNoIH0gZnJvbSAnLi9hZ2VudEhvc3RTaGVsbFV0aWxzLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciwgSUFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4vYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB7IE9zYzYzM0V2ZW50LCBPc2M2MzNFdmVudFR5cGUsIE9zYzYzM1BhcnNlU2VnbWVudCwgT3NjNjMzUGFyc2VyIH0gZnJvbSAnLi9vc2M2MzNQYXJzZXIuanMnO1xuXG5jb25zdCBXQUlUX0ZPUl9QUk9NUFRfVElNRU9VVCA9IDEwXzAwMDtcbmNvbnN0IEhFQURMRVNTX1RFUk1JTkFMX1NDUk9MTEJBQ0sgPSAwO1xuY29uc3QgRFNSX0NVUlNPUl9QT1NJVElPTl9RVUVSWSA9ICdcXHgxYls2bic7XG5jb25zdCBERUNfRFNSX0NVUlNPUl9QT1NJVElPTl9RVUVSWSA9ICdcXHgxYls/Nm4nO1xuY29uc3QgT1NDX0ZPUkVHUk9VTkRfQ09MT1JfUVVFUllfU1QgPSAnXFx4MWJdMTA7P1xceDFiXFxcXCc7XG5jb25zdCBPU0NfRk9SRUdST1VORF9DT0xPUl9RVUVSWV9CRUwgPSAnXFx4MWJdMTA7P1xceDA3JztcbmNvbnN0IE9TQ19CQUNLR1JPVU5EX0NPTE9SX1FVRVJZX1NUID0gJ1xceDFiXTExOz9cXHgxYlxcXFwnO1xuY29uc3QgT1NDX0JBQ0tHUk9VTkRfQ09MT1JfUVVFUllfQkVMID0gJ1xceDFiXTExOz9cXHgwNyc7XG5jb25zdCBURVJNSU5BTF9RVUVSSUVTX1NVUFBSRVNTRURfRlJPTV9DTElFTlQgPSBbXG5cdERFQ19EU1JfQ1VSU09SX1BPU0lUSU9OX1FVRVJZLFxuXHREU1JfQ1VSU09SX1BPU0lUSU9OX1FVRVJZLFxuXHRPU0NfRk9SRUdST1VORF9DT0xPUl9RVUVSWV9TVCxcblx0T1NDX0ZPUkVHUk9VTkRfQ09MT1JfUVVFUllfQkVMLFxuXHRPU0NfQkFDS0dST1VORF9DT0xPUl9RVUVSWV9TVCxcblx0T1NDX0JBQ0tHUk9VTkRfQ09MT1JfUVVFUllfQkVMLFxuXTtcbmNvbnN0IFRFUk1JTkFMX1FVRVJZX1NVUFBSRVNTSU9OX1JFR0VYID0gL1xceDFiKD86XFxbXFw/PzZufFxcXTFbMDFdO1xcPyg/OlxceDA3fFxceDFiXFxcXCkpL2c7XG5jb25zdCBURVJNSU5BTF9RVUVSWV9QUkVGSVhFU19TVVBQUkVTU0VEX0ZST01fQ0xJRU5UID0gWy4uLm5ldyBTZXQoVEVSTUlOQUxfUVVFUklFU19TVVBQUkVTU0VEX0ZST01fQ0xJRU5ULmZsYXRNYXAocXVlcnkgPT4ge1xuXHRjb25zdCBwcmVmaXhlczogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChsZXQgaSA9IDE7IGkgPCBxdWVyeS5sZW5ndGg7IGkrKykge1xuXHRcdHByZWZpeGVzLnB1c2gocXVlcnkuc3Vic3RyaW5nKDAsIGkpKTtcblx0fVxuXHRyZXR1cm4gcHJlZml4ZXM7XG59KSldLnNvcnQoKGEsIGIpID0+IGIubGVuZ3RoIC0gYS5sZW5ndGgpO1xuXG5leHBvcnQgY29uc3QgSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciA9IGNyZWF0ZURlY29yYXRvcjxJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyPignYWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbW1hbmRGaW5pc2hlZEV2ZW50IHtcblx0Y29tbWFuZElkOiBzdHJpbmc7XG5cdGV4aXRDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGNvbW1hbmQ6IHN0cmluZztcblx0b3V0cHV0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlcm1pbmFsUXVlcnlGaWx0ZXJTdGF0ZSB7XG5cdHBlbmRpbmdEYXRhOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlbmRUZXh0T3B0aW9ucyB7XG5cdHNob3VsZEV4ZWN1dGU6IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBNYXRjaCB3b3JrYmVuY2ggdGVybWluYWwgc2VuZFRleHQ6IHdyYXAgaW4gYnJhY2tldGVkIHBhc3RlIG1hcmtlcnMgb25seVxuXHQgKiB3aGVuIHJlcXVlc3RlZCBieSB0aGUgY2FsbGVyIGFuZCBlbmFibGVkIGJ5IHRoZSB0ZXJtaW5hbC5cblx0ICovXG5cdGJyYWNrZXRlZFBhc3RlTW9kZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZvcm1hdFRlcm1pbmFsVGV4dE9wdGlvbnMge1xuXHRzaG91bGRFeGVjdXRlOiBib29sZWFuO1xuXHRmb3JjZUJyYWNrZXRlZFBhc3RlTW9kZT86IGJvb2xlYW47XG59XG5cbi8vIFJldHVybiBpbW1lZGlhdGVseSB3aGVuIG5vIHBhcnRpYWwgcXVlcnkgaXMgYnVmZmVyZWQgYW5kIHRoaXMgY2h1bmsgY29udGFpbnMgbm8gZXNjYXBlIGNoYXJhY3Rlci5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVUZXJtaW5hbFF1ZXJpZXNTdXBwcmVzc2VkRnJvbUNsaWVudChkYXRhOiBzdHJpbmcsIHN0YXRlOiBJVGVybWluYWxRdWVyeUZpbHRlclN0YXRlKTogc3RyaW5nIHtcblx0aWYgKCFzdGF0ZS5wZW5kaW5nRGF0YSAmJiAhZGF0YS5pbmNsdWRlcygnXFx4MWInKSkge1xuXHRcdHJldHVybiBkYXRhO1xuXHR9XG5cblx0Y29uc3QgY29tYmluZWREYXRhID0gc3RhdGUucGVuZGluZ0RhdGEgKyBkYXRhO1xuXHRjb25zdCBwZW5kaW5nRGF0YSA9IGdldFRlcm1pbmFsUXVlcnlQcmVmaXhTdXBwcmVzc2VkRnJvbUNsaWVudChjb21iaW5lZERhdGEpO1xuXHRjb25zdCBkYXRhVG9GaWx0ZXIgPSBwZW5kaW5nRGF0YSA/IGNvbWJpbmVkRGF0YS5zdWJzdHJpbmcoMCwgY29tYmluZWREYXRhLmxlbmd0aCAtIHBlbmRpbmdEYXRhLmxlbmd0aCkgOiBjb21iaW5lZERhdGE7XG5cdHN0YXRlLnBlbmRpbmdEYXRhID0gcGVuZGluZ0RhdGE7XG5cdHJldHVybiBkYXRhVG9GaWx0ZXIucmVwbGFjZShURVJNSU5BTF9RVUVSWV9TVVBQUkVTU0lPTl9SRUdFWCwgJycpO1xufVxuXG5mdW5jdGlvbiBnZXRUZXJtaW5hbFF1ZXJ5UHJlZml4U3VwcHJlc3NlZEZyb21DbGllbnQoZGF0YTogc3RyaW5nKTogc3RyaW5nIHtcblx0Zm9yIChjb25zdCBwcmVmaXggb2YgVEVSTUlOQUxfUVVFUllfUFJFRklYRVNfU1VQUFJFU1NFRF9GUk9NX0NMSUVOVCkge1xuXHRcdGlmIChkYXRhLmVuZHNXaXRoKHByZWZpeCkpIHtcblx0XHRcdHJldHVybiBwcmVmaXg7XG5cdFx0fVxuXHR9XG5cdHJldHVybiAnJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdFRlcm1pbmFsVGV4dChkYXRhOiBzdHJpbmcsIG9wdGlvbnM6IElGb3JtYXRUZXJtaW5hbFRleHRPcHRpb25zKTogc3RyaW5nIHtcblx0aWYgKG9wdGlvbnMuZm9yY2VCcmFja2V0ZWRQYXN0ZU1vZGUpIHtcblx0XHRkYXRhID0gYFxceDFiWzIwMH4ke2RhdGF9XFx4MWJbMjAxfmA7XG5cdH1cblx0ZGF0YSA9IGRhdGEucmVwbGFjZSgvXFxyP1xcbi9nLCAnXFxyJyk7XG5cdGlmIChvcHRpb25zLnNob3VsZEV4ZWN1dGUgJiYgIWRhdGEuZW5kc1dpdGgoJ1xccicpKSB7XG5cdFx0ZGF0YSArPSAnXFxyJztcblx0fVxuXHRyZXR1cm4gZGF0YTtcbn1cblxuLyoqXG4gKiBTZXJ2aWNlIGludGVyZmFjZSBmb3IgdGVybWluYWwgbWFuYWdlbWVudCBpbiB0aGUgYWdlbnQgaG9zdC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRjcmVhdGVUZXJtaW5hbChwYXJhbXM6IENyZWF0ZVRlcm1pbmFsUGFyYW1zLCBvcHRpb25zPzogeyBzaGVsbD86IHN0cmluZzsgcHJldmVudFNoZWxsSGlzdG9yeT86IGJvb2xlYW47IG5vbkludGVyYWN0aXZlPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPjtcblx0d3JpdGVJbnB1dCh1cmk6IHN0cmluZywgZGF0YTogc3RyaW5nKTogdm9pZDtcblx0c2VuZFRleHQodXJpOiBzdHJpbmcsIGRhdGE6IHN0cmluZywgb3B0aW9uczogSVNlbmRUZXh0T3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cdG9uRGF0YSh1cmk6IHN0cmluZywgY2I6IChkYXRhOiBzdHJpbmcpID0+IHZvaWQpOiBJRGlzcG9zYWJsZTtcblx0b25FeGl0KHVyaTogc3RyaW5nLCBjYjogKGV4aXRDb2RlOiBudW1iZXIpID0+IHZvaWQpOiBJRGlzcG9zYWJsZTtcblx0b25DbGFpbUNoYW5nZWQodXJpOiBzdHJpbmcsIGNiOiAoY2xhaW06IFRlcm1pbmFsQ2xhaW0pID0+IHZvaWQpOiBJRGlzcG9zYWJsZTtcblx0b25Db21tYW5kRmluaXNoZWQodXJpOiBzdHJpbmcsIGNiOiAoZXZlbnQ6IElDb21tYW5kRmluaXNoZWRFdmVudCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlO1xuXHRjcmVhdGVBbHRCdWZmZXJQcm9taXNlKHVyaTogc3RyaW5nLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogUHJvbWlzZTx2b2lkPjtcblx0Z2V0Q29udGVudCh1cmk6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0Q2xhaW0odXJpOiBzdHJpbmcpOiBUZXJtaW5hbENsYWltIHwgdW5kZWZpbmVkO1xuXHRoYXNUZXJtaW5hbCh1cmk6IHN0cmluZyk6IGJvb2xlYW47XG5cdGdldEV4aXRDb2RlKHVyaTogc3RyaW5nKTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRzdXBwb3J0c0NvbW1hbmREZXRlY3Rpb24odXJpOiBzdHJpbmcpOiBib29sZWFuO1xuXHRkaXNwb3NlVGVybWluYWwodXJpOiBzdHJpbmcpOiB2b2lkO1xuXHRnZXRUZXJtaW5hbEluZm9zKCk6IFRlcm1pbmFsSW5mb1tdO1xuXHRnZXRUZXJtaW5hbFN0YXRlKHVyaTogc3RyaW5nKTogVGVybWluYWxTdGF0ZSB8IHVuZGVmaW5lZDtcblx0Z2V0RGVmYXVsdFNoZWxsKCk6IFByb21pc2U8c3RyaW5nPjtcblx0Y3JlYXRlT3V0cHV0VGVybWluYWwodXJpOiBzdHJpbmcsIG9wdGlvbnM6IHsgdGl0bGU6IHN0cmluZzsgY2xhaW06IFRlcm1pbmFsQ2xhaW0gfSk6IHZvaWQ7XG5cdGFwcGVuZE91dHB1dFRlcm1pbmFsRGF0YSh1cmk6IHN0cmluZywgZGF0YTogc3RyaW5nKTogdm9pZDtcblx0cmVzZXRPdXRwdXRUZXJtaW5hbCh1cmk6IHN0cmluZyk6IHZvaWQ7XG5cdGZpbmFsaXplT3V0cHV0VGVybWluYWwodXJpOiBzdHJpbmcsIGV4aXRDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkO1xufVxuXG4vLyBub2RlLXB0eSBpcyBsb2FkZWQgZHluYW1pY2FsbHkgdG8gYXZvaWQgYnVuZGxpbmcgaXNzdWVzIGluIG5vbi1ub2RlIGVudmlyb25tZW50c1xubGV0IG5vZGVQdHlNb2R1bGU6IHR5cGVvZiBpbXBvcnQoJ25vZGUtcHR5JykgfCB1bmRlZmluZWQ7XG5hc3luYyBmdW5jdGlvbiBnZXROb2RlUHR5KCk6IFByb21pc2U8dHlwZW9mIGltcG9ydCgnbm9kZS1wdHknKT4ge1xuXHRpZiAoIW5vZGVQdHlNb2R1bGUpIHtcblx0XHRub2RlUHR5TW9kdWxlID0gYXdhaXQgaW1wb3J0KCdub2RlLXB0eScpO1xuXHR9XG5cdHJldHVybiBub2RlUHR5TW9kdWxlO1xufVxuXG4vKiogUGVyLXRlcm1pbmFsIGNvbW1hbmQgZGV0ZWN0aW9uIHRyYWNraW5nIHN0YXRlLiAqL1xuaW50ZXJmYWNlIElDb21tYW5kVHJhY2tlciB7XG5cdHJlYWRvbmx5IHBhcnNlcjogT3NjNjMzUGFyc2VyO1xuXHRyZWFkb25seSBub25jZTogc3RyaW5nO1xuXHRjb21tYW5kQ291bnRlcjogbnVtYmVyO1xuXHRkZXRlY3Rpb25BdmFpbGFibGVFbWl0dGVkOiBib29sZWFuO1xuXHRwZW5kaW5nQ29tbWFuZExpbmU/OiBzdHJpbmc7XG5cdGFjdGl2ZUNvbW1hbmRJZD86IHN0cmluZztcblx0YWN0aXZlQ29tbWFuZFRpbWVzdGFtcD86IG51bWJlcjtcbn1cblxuLyoqIFJlcHJlc2VudHMgYSBzaW5nbGUgbWFuYWdlZCB0ZXJtaW5hbCB3aXRoIGl0cyBQVFkgcHJvY2Vzcy4gKi9cbmludGVyZmFjZSBJTWFuYWdlZFRlcm1pbmFsIHtcblx0cmVhZG9ubHkgdXJpOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN0b3JlOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlYWRvbmx5IHB0eTogaW1wb3J0KCdub2RlLXB0eScpLklQdHk7XG5cdHJlYWRvbmx5IG9uRGF0YUVtaXR0ZXI6IEVtaXR0ZXI8c3RyaW5nPjtcblx0cmVhZG9ubHkgb25FeGl0RW1pdHRlcjogRW1pdHRlcjxudW1iZXI+O1xuXHRyZWFkb25seSBvbkNsYWltQ2hhbmdlZEVtaXR0ZXI6IEVtaXR0ZXI8VGVybWluYWxDbGFpbT47XG5cdHJlYWRvbmx5IG9uQ29tbWFuZEZpbmlzaGVkRW1pdHRlcjogRW1pdHRlcjxJQ29tbWFuZEZpbmlzaGVkRXZlbnQ+O1xuXHR0aXRsZTogc3RyaW5nO1xuXHRjd2Q6IHN0cmluZztcblx0Y29sczogbnVtYmVyO1xuXHRyb3dzOiBudW1iZXI7XG5cdGNvbnRlbnQ6IFRlcm1pbmFsQ29udGVudFBhcnRbXTtcblx0Y29udGVudFNpemU6IG51bWJlcjtcblx0Y2xhaW06IFRlcm1pbmFsQ2xhaW07XG5cdGV4aXRDb2RlPzogbnVtYmVyO1xuXHRjb21tYW5kVHJhY2tlcj86IElDb21tYW5kVHJhY2tlcjtcblx0aGVhZGxlc3NUZXJtaW5hbD86IEFnZW50SG9zdEhlYWRsZXNzVGVybWluYWw7XG5cdHRlcm1pbmFsUXVlcnlGaWx0ZXJTdGF0ZTogSVRlcm1pbmFsUXVlcnlGaWx0ZXJTdGF0ZTtcbn1cblxuLyoqXG4gKiBBIGxpZ2h0d2VpZ2h0IG91dHB1dC1vbmx5IHRlcm1pbmFsIGNoYW5uZWw6IG5vIFBUWSBiZWhpbmQgaXQsIHBsYWluLXRleHRcbiAqIGNvbnRlbnQgYXBwZW5kZWQgYnkgaXRzIG93bmVyIChlLmcuIHJ1bnRpbWUtZXhlY3V0ZWQgc2hlbGwgdG9vbHMpLiBTZXJ2ZWRcbiAqIHRvIHN1YnNjcmliZXJzIHdpdGggYGlzUHR5OiBmYWxzZWAgc28gY2xpZW50cyBza2lwIFZUIHBhcnNpbmcuXG4gKi9cbmludGVyZmFjZSBJT3V0cHV0VGVybWluYWwge1xuXHR0aXRsZTogc3RyaW5nO1xuXHRjb250ZW50OiBUZXJtaW5hbENvbnRlbnRQYXJ0W107XG5cdGNvbnRlbnRTaXplOiBudW1iZXI7XG5cdGNsYWltOiBUZXJtaW5hbENsYWltO1xuXHRleGl0Q29kZT86IG51bWJlcjtcbn1cblxuLyoqXG4gKiBNYW5hZ2VzIHRlcm1pbmFsIHByb2Nlc3NlcyBmb3IgdGhlIGFnZW50IGhvc3QuIEVhY2ggdGVybWluYWwgaXMgYmFja2VkIGJ5XG4gKiBhIG5vZGUtcHR5IGluc3RhbmNlIGFuZCBpZGVudGlmaWVkIGJ5IGEgcHJvdG9jb2wgVVJJLlxuICpcbiAqIExpc3RlbnMgdG8gdGhlIHtAbGluayBBZ2VudEhvc3RTdGF0ZU1hbmFnZXJ9IGZvciBjbGllbnQtZGlzcGF0Y2hlZCB0ZXJtaW5hbFxuICogYWN0aW9ucyAoaW5wdXQsIHJlc2l6ZSwgY2xhaW0gY2hhbmdlcykgYW5kIGRpc3BhdGNoZXMgc2VydmVyLW9yaWdpbmF0ZWRcbiAqIFBUWSBvdXRwdXQgYmFjayB0aHJvdWdoIHRoZSBzdGF0ZSBtYW5hZ2VyLlxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbHMgPSBuZXcgTWFwPHN0cmluZywgSU1hbmFnZWRUZXJtaW5hbD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb3V0cHV0VGVybWluYWxzID0gbmV3IE1hcDxzdHJpbmcsIElPdXRwdXRUZXJtaW5hbD4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFnZW50SG9zdFN0YXRlTWFuYWdlciBwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlcixcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBSZWFjdCB0byBjbGllbnQtZGlzcGF0Y2hlZCB0ZXJtaW5hbCBhY3Rpb25zIGZsb3dpbmcgdGhyb3VnaCB0aGUgc3RhdGUgbWFuYWdlclxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlbnZlbG9wZSA9PiB7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBlbnZlbG9wZS5hY3Rpb247XG5cdFx0XHRpZiAoIWlzVGVybWluYWxBY3Rpb24oYWN0aW9uKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjaGFubmVsID0gZW52ZWxvcGUuY2hhbm5lbDtcblx0XHRcdHN3aXRjaCAoYWN0aW9uLnR5cGUpIHtcblx0XHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlRlcm1pbmFsSW5wdXQ6XG5cdFx0XHRcdFx0dGhpcy5fd3JpdGVJbnB1dChjaGFubmVsLCBhY3Rpb24uZGF0YSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQWN0aW9uVHlwZS5UZXJtaW5hbFJlc2l6ZWQ6XG5cdFx0XHRcdFx0dGhpcy5fcmVzaXplKGNoYW5uZWwsIGFjdGlvbi5jb2xzLCBhY3Rpb24ucm93cyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQWN0aW9uVHlwZS5UZXJtaW5hbENsYWltZWQ6XG5cdFx0XHRcdFx0dGhpcy5fc2V0Q2xhaW0oY2hhbm5lbCwgYWN0aW9uLmNsYWltKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlRlcm1pbmFsVGl0bGVDaGFuZ2VkOlxuXHRcdFx0XHRcdHRoaXMuX3NldFRpdGxlKGNoYW5uZWwsIGFjdGlvbi50aXRsZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQWN0aW9uVHlwZS5UZXJtaW5hbENsZWFyZWQ6XG5cdFx0XHRcdFx0dGhpcy5fY2xlYXJDb250ZW50KGNoYW5uZWwpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKiBHZXQgbWV0YWRhdGEgZm9yIGFsbCBhY3RpdmUgdGVybWluYWxzIChmb3Igcm9vdCBzdGF0ZSkuICovXG5cdGdldFRlcm1pbmFsSW5mb3MoKTogVGVybWluYWxJbmZvW10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5fdGVybWluYWxzLnZhbHVlcygpXS5tYXAodCA9PiAoe1xuXHRcdFx0cmVzb3VyY2U6IHQudXJpLFxuXHRcdFx0dGl0bGU6IHQudGl0bGUsXG5cdFx0XHRjbGFpbTogdC5jbGFpbSxcblx0XHRcdGV4aXRDb2RlOiB0LmV4aXRDb2RlLFxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKiBHZXQgdGhlIGZ1bGwgc3RhdGUgZm9yIGEgdGVybWluYWwgKGZvciBzdWJzY3JpYmUgc25hcHNob3RzKS4gKi9cblx0Z2V0VGVybWluYWxTdGF0ZSh1cmk6IHN0cmluZyk6IFRlcm1pbmFsU3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG91dHB1dFRlcm1pbmFsID0gdGhpcy5fb3V0cHV0VGVybWluYWxzLmdldCh1cmkpO1xuXHRcdGlmIChvdXRwdXRUZXJtaW5hbCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dGl0bGU6IG91dHB1dFRlcm1pbmFsLnRpdGxlLFxuXHRcdFx0XHRjb250ZW50OiBvdXRwdXRUZXJtaW5hbC5jb250ZW50LFxuXHRcdFx0XHRleGl0Q29kZTogb3V0cHV0VGVybWluYWwuZXhpdENvZGUsXG5cdFx0XHRcdGNsYWltOiBvdXRwdXRUZXJtaW5hbC5jbGFpbSxcblx0XHRcdFx0aXNQdHk6IGZhbHNlLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLl90ZXJtaW5hbHMuZ2V0KHVyaSk7XG5cdFx0aWYgKCF0ZXJtaW5hbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRpdGxlOiB0ZXJtaW5hbC50aXRsZSxcblx0XHRcdGN3ZDogdGVybWluYWwuY3dkLFxuXHRcdFx0Y29sczogdGVybWluYWwuY29scyxcblx0XHRcdHJvd3M6IHRlcm1pbmFsLnJvd3MsXG5cdFx0XHRjb250ZW50OiB0ZXJtaW5hbC5jb250ZW50LFxuXHRcdFx0ZXhpdENvZGU6IHRlcm1pbmFsLmV4aXRDb2RlLFxuXHRcdFx0Y2xhaW06IHRlcm1pbmFsLmNsYWltLFxuXHRcdFx0c3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uOiB0ZXJtaW5hbC5jb21tYW5kVHJhY2tlcj8uZGV0ZWN0aW9uQXZhaWxhYmxlRW1pdHRlZCxcblx0XHRcdGlzUHR5OiB0cnVlLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IHRlcm1pbmFsIGJhY2tlZCBieSBub2RlLXB0eS5cblx0ICogU3Bhd25zIHRoZSB1c2VyJ3MgZGVmYXVsdCBzaGVsbC5cblx0ICovXG5cdGFzeW5jIGNyZWF0ZVRlcm1pbmFsKHBhcmFtczogQ3JlYXRlVGVybWluYWxQYXJhbXMsIG9wdGlvbnM/OiB7IHNoZWxsPzogc3RyaW5nOyBwcmV2ZW50U2hlbGxIaXN0b3J5PzogYm9vbGVhbjsgbm9uSW50ZXJhY3RpdmU/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB1cmkgPSBwYXJhbXMuY2hhbm5lbDtcblx0XHRpZiAodGhpcy5fdGVybWluYWxzLmhhcyh1cmkpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRlcm1pbmFsIGFscmVhZHkgZXhpc3RzOiAke3VyaX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBjd2QgPSBhd2FpdCB0aGlzLl9yZXNvbHZlQ3dkKHBhcmFtcy5jd2QsIHVyaSk7XG5cdFx0Y29uc3QgY29scyA9IHBhcmFtcy5jb2xzID8/IDgwO1xuXHRcdGNvbnN0IHJvd3MgPSBwYXJhbXMucm93cyA/PyAyNDtcblxuXHRcdGNvbnN0IHNoZWxsID0gb3B0aW9ucz8uc2hlbGwgPz8gYXdhaXQgdGhpcy5nZXREZWZhdWx0U2hlbGwoKTtcblx0XHRjb25zdCBuYW1lID0gcGxhdGZvcm0uaXNXaW5kb3dzID8gJ2NtZCcgOiAneHRlcm0tMjU2Y29sb3InO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbVGVybWluYWxNYW5hZ2VyXSBDcmVhdGluZyB0ZXJtaW5hbCAke3VyaX06IHNoZWxsPSR7c2hlbGx9LCBjd2Q9JHtjd2R9LCBjb2xzPSR7Y29sc30sIHJvd3M9JHtyb3dzfWApO1xuXG5cdFx0Ly8gU2hlbGwgaW50ZWdyYXRpb24gXHUyMDE0IGluamVjdCBzY3JpcHRzIHNvIHRoZSBzaGVsbCBlbWl0cyBPU0MgNjMzIHNlcXVlbmNlc1xuXHRcdGNvbnN0IG5vbmNlID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgZW52OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0geyAuLi5wcm9jZXNzLmVudiBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IH07XG5cdFx0Ly8gQXR0cmlidXRlIHRoZXNlIGNvbW1hbmRzIHRvIFZTIENvZGUuIEFscmVhZHkgaW5oZXJpdGVkIGZyb20gdGhlIGFnZW50XG5cdFx0Ly8gaG9zdCBwcm9jZXNzOyBzZXQgaGVyZSBhcyBkZWZlbnNlIGluIGRlcHRoLlxuXHRcdGVudltBaUFnZW50RW52VmFyXSA9IEFpQWdlbnRFbnZWYWx1ZTtcblx0XHRpZiAob3B0aW9ucz8ucHJldmVudFNoZWxsSGlzdG9yeSkge1xuXHRcdFx0Ly8gUGlja2VkIHVwIGJ5IHRoZSBzaGVsbCBpbnRlZ3JhdGlvbiBzY3JpcHRzIHRvIHNldCBISVNUQ09OVFJPTD1pZ25vcmVzcGFjZVxuXHRcdFx0Ly8gKGJhc2gpIC8gSElTVF9JR05PUkVfU1BBQ0UgKHpzaCksIG9yIHN1cHByZXNzIFBTUmVhZExpbmUgaGlzdG9yeSAocHdzaCkuXG5cdFx0XHQvLyBDb21iaW5lZCB3aXRoIHRoZSBsZWFkaW5nLXNwYWNlIHByZWZpeCBhcHBsaWVkIGF0IGNvbW1hbmQtd3JpdGUgdGltZSwgdGhpc1xuXHRcdFx0Ly8gcHJldmVudHMgYWdlbnQtZXhlY3V0ZWQgY29tbWFuZHMgZnJvbSBwb2xsdXRpbmcgdGhlIHVzZXIncyBzaGVsbCBoaXN0b3J5LlxuXHRcdFx0ZW52WydWU0NPREVfUFJFVkVOVF9TSEVMTF9ISVNUT1JZJ10gPSAnMSc7XG5cdFx0fVxuXHRcdC8vIFpzaC1zcGVjaWZpYyBmaXh1cHMgZm9yIGFnZW50IHRvb2wgdGVybWluYWxzOiBkaXNhYmxlIGJhbmcgaGlzdG9yeVxuXHRcdC8vIGV4cGFuc2lvbiBhbmQgZW5hYmxlIGlubGluZSAjIGNvbW1lbnRzLlxuXHRcdGlmIChwYXJhbXMuY2xhaW0/LmtpbmQgPT09IFRlcm1pbmFsQ2xhaW1LaW5kLlNlc3Npb24gJiYgaXNac2goc2hlbGwpKSB7XG5cdFx0XHRlbnZbJ1ZTQ09ERV9BR0VOVF9aU0hfRklYVVBTJ10gPSAnMSc7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zPy5ub25JbnRlcmFjdGl2ZSkge1xuXHRcdFx0Ly8gU3VwcHJlc3MgcGFnaW5nIGFuZCBpbnRlcmFjdGl2ZSBwcm9tcHRzIHNvIHRoYXQgdG9vbC1zcGF3bmVkXG5cdFx0XHQvLyB0ZXJtaW5hbHMgcHJvZHVjZSBjbGVhbiwgbWFjaGluZS1mcmllbmRseSBvdXRwdXQuIEFuIGVtcHR5XG5cdFx0XHQvLyBzdHJpbmcgZGlzYWJsZXMgcGFnaW5nIGluIGdpdCwgbGVzcywgYW5kIG1vc3QgQ0xJIHRvb2xzIGFuZFxuXHRcdFx0Ly8gaXMgc2FmZSBvbiBhbGwgcGxhdGZvcm1zICh1bmxpa2UgJ2NhdCcgd2hpY2ggaXNuJ3Qgb24gV2luZG93cyBQQVRIKS5cblx0XHRcdGVudlsnTENfQUxMJ10gPSAnQy5VVEYtOCc7XG5cdFx0XHRlbnZbJ1BBR0VSJ10gPSAnJztcblx0XHRcdGVudlsnR0lUX1BBR0VSJ10gPSAnJztcblx0XHRcdGVudlsnR0hfUEFHRVInXSA9ICcnO1xuXHRcdFx0ZW52WydHSVRfVEVSTUlOQUxfUFJPTVBUJ10gPSAnMCc7XG5cdFx0XHRlbnZbJ0RFQklBTl9GUk9OVEVORCddID0gJ25vbmludGVyYWN0aXZlJztcblx0XHR9XG5cdFx0bGV0IHNoZWxsQXJnczogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAocGxhdGZvcm0uaXNNYWNpbnRvc2gpIHtcblx0XHRcdGNvbnN0IHNoZWxsTmFtZSA9IHBhdGhQYXJzZShzaGVsbCkubmFtZTtcblx0XHRcdGlmIChzaGVsbE5hbWUubWF0Y2goLyh6c2h8YmFzaCkvKSkge1xuXHRcdFx0XHRzaGVsbEFyZ3MgPSBbJy0tbG9naW4nXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpbmplY3Rpb24gPSBhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKFxuXHRcdFx0eyBleGVjdXRhYmxlOiBzaGVsbCwgYXJnczogc2hlbGxBcmdzLCBmb3JjZVNoZWxsSW50ZWdyYXRpb246IHRydWUgfSxcblx0XHRcdHtcblx0XHRcdFx0c2hlbGxJbnRlZ3JhdGlvbjogeyBlbmFibGVkOiB0cnVlLCBzdWdnZXN0RW5hYmxlZDogZmFsc2UsIG5vbmNlIH0sXG5cdFx0XHRcdHdpbmRvd3NVc2VDb25wdHlEbGw6IGZhbHNlLFxuXHRcdFx0XHRlbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0d29ya3NwYWNlRm9sZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRcdGlzU2NyZWVuUmVhZGVyT3B0aW1pemVkOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLFxuXHRcdFx0dGhpcy5fcHJvZHVjdFNlcnZpY2UsXG5cdFx0KTtcblxuXHRcdGxldCBjb21tYW5kVHJhY2tlcjogSUNvbW1hbmRUcmFja2VyIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGluamVjdGlvbi50eXBlID09PSAnaW5qZWN0aW9uJykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbVGVybWluYWxNYW5hZ2VyXSBTaGVsbCBpbnRlZ3JhdGlvbiBpbmplY3RlZCBmb3IgJHt1cml9YCk7XG5cdFx0XHRpZiAoaW5qZWN0aW9uLmVudk1peGluKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGluamVjdGlvbi5lbnZNaXhpbikpIHtcblx0XHRcdFx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0ZW52W2tleV0gPSB2YWx1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChpbmplY3Rpb24ubmV3QXJncykge1xuXHRcdFx0XHRzaGVsbEFyZ3MgPSBpbmplY3Rpb24ubmV3QXJncztcblx0XHRcdH1cblx0XHRcdGlmIChpbmplY3Rpb24uZmlsZXNUb0NvcHkpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBmIG9mIGluamVjdGlvbi5maWxlc1RvQ29weSkge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBmcy5wcm9taXNlcy5ta2RpcihkaXJuYW1lKGYuZGVzdCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0YXdhaXQgZnMucHJvbWlzZXMuY29weUZpbGUoZi5zb3VyY2UsIGYuZGVzdCk7XG5cdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHQvLyBTd2FsbG93IFx1MjAxNCBhbm90aGVyIHByb2Nlc3MgbWF5IGJlIHVzaW5nIHRoZSBzYW1lIHRlbXAgZGlyXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb21tYW5kVHJhY2tlciA9IHtcblx0XHRcdFx0cGFyc2VyOiBuZXcgT3NjNjMzUGFyc2VyKCksXG5cdFx0XHRcdG5vbmNlLFxuXHRcdFx0XHRjb21tYW5kQ291bnRlcjogMCxcblx0XHRcdFx0ZGV0ZWN0aW9uQXZhaWxhYmxlRW1pdHRlZDogZmFsc2UsXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtUZXJtaW5hbE1hbmFnZXJdIFNoZWxsIGludGVncmF0aW9uIG5vdCBhdmFpbGFibGUgZm9yICR7dXJpfTogJHtpbmplY3Rpb24ucmVhc29ufWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHB0eVByb2Nlc3MgPSBhd2FpdCB0aGlzLl9zcGF3blB0eShzaGVsbCwgc2hlbGxBcmdzLCB7XG5cdFx0XHRuYW1lLFxuXHRcdFx0Y3dkLFxuXHRcdFx0ZW52LFxuXHRcdFx0Y29scyxcblx0XHRcdHJvd3MsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjbGFpbTogVGVybWluYWxDbGFpbSA9IHBhcmFtcy5jbGFpbSA/PyB7IGtpbmQ6IFRlcm1pbmFsQ2xhaW1LaW5kLkNsaWVudCwgY2xpZW50SWQ6ICcnIH07XG5cblx0XHRjb25zdCBvbkRhdGFFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3Qgb25FeGl0RW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdGNvbnN0IG9uQ2xhaW1DaGFuZ2VkRW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxUZXJtaW5hbENsYWltPigpKTtcblx0XHRjb25zdCBvbkNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8SUNvbW1hbmRGaW5pc2hlZEV2ZW50PigpKTtcblx0XHRjb25zdCBoZWFkbGVzc1Rlcm1pbmFsID0gc3RvcmUuYWRkKG5ldyBBZ2VudEhvc3RIZWFkbGVzc1Rlcm1pbmFsKHtcblx0XHRcdGNvbHMsXG5cdFx0XHRyb3dzLFxuXHRcdFx0c2Nyb2xsYmFjazogSEVBRExFU1NfVEVSTUlOQUxfU0NST0xMQkFDSyxcblx0XHRcdGxvZ1NlcnZpY2U6IHRoaXMuX2xvZ1NlcnZpY2UsXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbWFuYWdlZDogSU1hbmFnZWRUZXJtaW5hbCA9IHtcblx0XHRcdHVyaSxcblx0XHRcdHN0b3JlLFxuXHRcdFx0cHR5OiBwdHlQcm9jZXNzLFxuXHRcdFx0b25EYXRhRW1pdHRlcixcblx0XHRcdG9uRXhpdEVtaXR0ZXIsXG5cdFx0XHRvbkNsYWltQ2hhbmdlZEVtaXR0ZXIsXG5cdFx0XHRvbkNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIsXG5cdFx0XHR0aXRsZTogcGFyYW1zLm5hbWUgPz8gc2hlbGwsXG5cdFx0XHRjd2QsXG5cdFx0XHRjb2xzLFxuXHRcdFx0cm93cyxcblx0XHRcdGNvbnRlbnQ6IFtdLFxuXHRcdFx0Y29udGVudFNpemU6IDAsXG5cdFx0XHRjbGFpbSxcblx0XHRcdGNvbW1hbmRUcmFja2VyLFxuXHRcdFx0aGVhZGxlc3NUZXJtaW5hbCxcblx0XHRcdHRlcm1pbmFsUXVlcnlGaWx0ZXJTdGF0ZTogeyBwZW5kaW5nRGF0YTogJycgfSxcblx0XHR9O1xuXG5cdFx0dGhpcy5fdGVybWluYWxzLnNldCh1cmksIG1hbmFnZWQpO1xuXHRcdHN0b3JlLmFkZChoZWFkbGVzc1Rlcm1pbmFsLm9uUmVzcG9uc2VEYXRhKGRhdGEgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW1Rlcm1pbmFsTWFuYWdlcl0gV3JpdGluZyBoZWFkbGVzcyB0ZXJtaW5hbCByZXNwb25zZSBmb3IgJHt1cml9OiAke0pTT04uc3RyaW5naWZ5KGRhdGEpfWApO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cHR5UHJvY2Vzcy53cml0ZShkYXRhKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbVGVybWluYWxNYW5hZ2VyXSBGYWlsZWQgdG8gd3JpdGUgaGVhZGxlc3MgdGVybWluYWwgcmVzcG9uc2UgZm9yICR7dXJpfTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gV2lyZSBQVFkgZXZlbnRzIFx1MjE5MiBwcm90b2NvbCBldmVudHNcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRyeSB7IHB0eVByb2Nlc3Mua2lsbCgpOyB9IGNhdGNoIHsgLyogYWxyZWFkeSBkZWFkICovIH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBvbkZpcnN0RGF0YSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBkYXRhTGlzdGVuZXIgPSBwdHlQcm9jZXNzLm9uRGF0YShyYXdEYXRhID0+IHtcblx0XHRcdHZvaWQgbWFuYWdlZC5oZWFkbGVzc1Rlcm1pbmFsPy53cml0ZVB0eURhdGEocmF3RGF0YSk7XG5cdFx0XHR0aGlzLl9oYW5kbGVQdHlEYXRhKG1hbmFnZWQsIHJhd0RhdGEpO1xuXHRcdFx0b25GaXJzdERhdGEuY29tcGxldGUoKTtcblx0XHR9KTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGRhdGFMaXN0ZW5lci5kaXNwb3NlKCkpKTtcblxuXHRcdGNvbnN0IGV4aXRMaXN0ZW5lciA9IHB0eVByb2Nlc3Mub25FeGl0KGUgPT4ge1xuXHRcdFx0bWFuYWdlZC5leGl0Q29kZSA9IGUuZXhpdENvZGU7XG5cdFx0XHRtYW5hZ2VkLm9uRXhpdEVtaXR0ZXIuZmlyZShlLmV4aXRDb2RlKTtcblx0XHRcdG9uRmlyc3REYXRhLmNvbXBsZXRlKCk7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24odXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxFeGl0ZWQsXG5cdFx0XHRcdGV4aXRDb2RlOiBlLmV4aXRDb2RlLFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9icm9hZGNhc3RUZXJtaW5hbExpc3QoKTtcblx0XHR9KTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGV4aXRMaXN0ZW5lci5kaXNwb3NlKCkpKTtcblxuXHRcdC8vIFBvbGwgZm9yIHRpdGxlIGNoYW5nZXMgKG5vbi1XaW5kb3dzKVxuXHRcdGlmICghcGxhdGZvcm0uaXNXaW5kb3dzKSB7XG5cdFx0XHRjb25zdCB0aXRsZUludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBuZXdUaXRsZSA9IHB0eVByb2Nlc3MucHJvY2Vzcztcblx0XHRcdFx0aWYgKG5ld1RpdGxlICYmIG5ld1RpdGxlICE9PSBtYW5hZ2VkLnRpdGxlKSB7XG5cdFx0XHRcdFx0bWFuYWdlZC50aXRsZSA9IG5ld1RpdGxlO1xuXHRcdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbih1cmksIHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxUaXRsZUNoYW5nZWQsXG5cdFx0XHRcdFx0XHR0aXRsZTogbmV3VGl0bGUsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dGhpcy5fYnJvYWRjYXN0VGVybWluYWxMaXN0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDIwMCk7XG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNsZWFySW50ZXJ2YWwodGl0bGVJbnRlcnZhbCkpKTtcblx0XHR9XG5cblx0XHRhd2FpdCByYWNlQ2FuY2VsbGFibGVQcm9taXNlcyhbb25GaXJzdERhdGEucCwgdGltZW91dChXQUlUX0ZPUl9QUk9NUFRfVElNRU9VVCldKTtcblxuXHRcdHRoaXMuX2Jyb2FkY2FzdFRlcm1pbmFsTGlzdCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9zcGF3blB0eShmaWxlOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdLCBvcHRpb25zOiBpbXBvcnQoJ25vZGUtcHR5JykuSVB0eUZvcmtPcHRpb25zIHwgaW1wb3J0KCdub2RlLXB0eScpLklXaW5kb3dzUHR5Rm9ya09wdGlvbnMpOiBQcm9taXNlPGltcG9ydCgnbm9kZS1wdHknKS5JUHR5PiB7XG5cdFx0Y29uc3Qgbm9kZVB0eSA9IGF3YWl0IGdldE5vZGVQdHkoKTtcblx0XHRyZXR1cm4gbm9kZVB0eS5zcGF3bihmaWxlLCBhcmdzLCBvcHRpb25zKTtcblx0fVxuXG5cdC8qKiBTZW5kIGlucHV0IGRhdGEgdG8gYSB0ZXJtaW5hbCdzIFBUWSBwcm9jZXNzIChmcm9tIGNsaWVudC1kaXNwYXRjaGVkIGFjdGlvbnMpLiAqL1xuXHRwcml2YXRlIF93cml0ZUlucHV0KHVyaTogc3RyaW5nLCBkYXRhOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLndyaXRlSW5wdXQodXJpLCBkYXRhKTtcblx0fVxuXG5cdC8qKiBTZW5kIGlucHV0IGRhdGEgdG8gYSB0ZXJtaW5hbCdzIFBUWSBwcm9jZXNzLiAqL1xuXHR3cml0ZUlucHV0KHVyaTogc3RyaW5nLCBkYXRhOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFscy5nZXQodXJpKTtcblx0XHRpZiAodGVybWluYWwgJiYgdGVybWluYWwuZXhpdENvZGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGVybWluYWwucHR5LndyaXRlKGRhdGEpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBTZW5kIGZvcm1hdHRlZCB0ZXh0IHRvIGEgdGVybWluYWwncyBQVFkgcHJvY2Vzcy4gKi9cblx0YXN5bmMgc2VuZFRleHQodXJpOiBzdHJpbmcsIGRhdGE6IHN0cmluZywgb3B0aW9uczogSVNlbmRUZXh0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5fdGVybWluYWxzLmdldCh1cmkpO1xuXHRcdGxldCBmb3JjZUJyYWNrZXRlZFBhc3RlTW9kZSA9IGZhbHNlO1xuXHRcdGlmIChvcHRpb25zLmJyYWNrZXRlZFBhc3RlTW9kZSkge1xuXHRcdFx0YXdhaXQgdGVybWluYWw/LmhlYWRsZXNzVGVybWluYWw/LndoZW5QdHlEYXRhRmx1c2hlZCgpO1xuXHRcdFx0Zm9yY2VCcmFja2V0ZWRQYXN0ZU1vZGUgPSAhIXRlcm1pbmFsPy5oZWFkbGVzc1Rlcm1pbmFsPy5pc0JyYWNrZXRlZFBhc3RlTW9kZSgpO1xuXHRcdH1cblx0XHR0aGlzLndyaXRlSW5wdXQodXJpLCBmb3JtYXRUZXJtaW5hbFRleHQoZGF0YSwgeyBzaG91bGRFeGVjdXRlOiBvcHRpb25zLnNob3VsZEV4ZWN1dGUsIGZvcmNlQnJhY2tldGVkUGFzdGVNb2RlIH0pKTtcblx0fVxuXG5cdC8qKiBSZWdpc3RlciBhIGNhbGxiYWNrIGZvciBQVFkgZGF0YSBldmVudHMgb24gYSB0ZXJtaW5hbC4gKi9cblx0b25EYXRhKHVyaTogc3RyaW5nLCBjYjogKGRhdGE6IHN0cmluZykgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFscy5nZXQodXJpKTtcblx0XHRpZiAoIXRlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSk7XG5cdFx0fVxuXHRcdHJldHVybiB0ZXJtaW5hbC5vbkRhdGFFbWl0dGVyLmV2ZW50KGNiKTtcblx0fVxuXG5cdC8qKiBSZWdpc3RlciBhIGNhbGxiYWNrIGZvciBQVFkgZXhpdCBldmVudHMgb24gYSB0ZXJtaW5hbC4gKi9cblx0b25FeGl0KHVyaTogc3RyaW5nLCBjYjogKGV4aXRDb2RlOiBudW1iZXIpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLl90ZXJtaW5hbHMuZ2V0KHVyaSk7XG5cdFx0aWYgKCF0ZXJtaW5hbCkge1xuXHRcdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gdGVybWluYWwub25FeGl0RW1pdHRlci5ldmVudChjYik7XG5cdH1cblxuXHQvKiogUmVnaXN0ZXIgYSBjYWxsYmFjayBmb3IgdGVybWluYWwgY2xhaW0gY2hhbmdlcy4gKi9cblx0b25DbGFpbUNoYW5nZWQodXJpOiBzdHJpbmcsIGNiOiAoY2xhaW06IFRlcm1pbmFsQ2xhaW0pID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLl90ZXJtaW5hbHMuZ2V0KHVyaSk7XG5cdFx0aWYgKCF0ZXJtaW5hbCkge1xuXHRcdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gdGVybWluYWwub25DbGFpbUNoYW5nZWRFbWl0dGVyLmV2ZW50KGNiKTtcblx0fVxuXG5cdC8qKiBSZWdpc3RlciBhIGNhbGxiYWNrIGZvciBjb21tYW5kIGNvbXBsZXRpb24gZXZlbnRzIChyZXF1aXJlcyBzaGVsbCBpbnRlZ3JhdGlvbikuICovXG5cdG9uQ29tbWFuZEZpbmlzaGVkKHVyaTogc3RyaW5nLCBjYjogKGV2ZW50OiBJQ29tbWFuZEZpbmlzaGVkRXZlbnQpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLl90ZXJtaW5hbHMuZ2V0KHVyaSk7XG5cdFx0aWYgKCF0ZXJtaW5hbCkge1xuXHRcdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gdGVybWluYWwub25Db21tYW5kRmluaXNoZWRFbWl0dGVyLmV2ZW50KGNiKTtcblx0fVxuXG5cdGNyZWF0ZUFsdEJ1ZmZlclByb21pc2UodXJpOiBzdHJpbmcsIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFscy5nZXQodXJpKTtcblx0XHRpZiAoIXRlcm1pbmFsPy5oZWFkbGVzc1Rlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2UoKCkgPT4geyB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRlcm1pbmFsLmhlYWRsZXNzVGVybWluYWwuY3JlYXRlQWx0QnVmZmVyUHJvbWlzZShzdG9yZSk7XG5cdH1cblxuXHQvKiogR2V0IGFjY3VtdWxhdGVkIHNjcm9sbGJhY2sgY29udGVudCBmb3IgYSB0ZXJtaW5hbCBhcyByYXcgdGV4dC4gKi9cblx0Z2V0Q29udGVudCh1cmk6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLl90ZXJtaW5hbHMuZ2V0KHVyaSk7XG5cdFx0aWYgKCF0ZXJtaW5hbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRlcm1pbmFsLmNvbnRlbnQubWFwKHAgPT4gcC50eXBlID09PSAnY29tbWFuZCcgPyBwLm91dHB1dCA6IHAudmFsdWUpLmpvaW4oJycpO1xuXHR9XG5cblx0LyoqIEdldCB0aGUgY3VycmVudCBjbGFpbSBmb3IgYSB0ZXJtaW5hbC4gKi9cblx0Z2V0Q2xhaW0odXJpOiBzdHJpbmcpOiBUZXJtaW5hbENsYWltIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxzLmdldCh1cmkpPy5jbGFpbTtcblx0fVxuXG5cdC8qKiBDaGVjayB3aGV0aGVyIGEgdGVybWluYWwgZXhpc3RzLiAqL1xuXHRoYXNUZXJtaW5hbCh1cmk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbHMuaGFzKHVyaSk7XG5cdH1cblxuXHQvKiogV2hldGhlciB0aGUgdGVybWluYWwgaGFzIHNoZWxsIGludGVncmF0aW9uIGFjdGl2ZSBmb3IgY29tbWFuZCBkZXRlY3Rpb24uICovXG5cdHN1cHBvcnRzQ29tbWFuZERldGVjdGlvbih1cmk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5fdGVybWluYWxzLmdldCh1cmkpO1xuXHRcdHJldHVybiB0ZXJtaW5hbD8uY29tbWFuZFRyYWNrZXI/LmRldGVjdGlvbkF2YWlsYWJsZUVtaXR0ZWQgPz8gZmFsc2U7XG5cdH1cblxuXHQvKiogR2V0IHRoZSBleGl0IGNvZGUgZm9yIGEgdGVybWluYWwsIG9yIHVuZGVmaW5lZCBpZiBzdGlsbCBydW5uaW5nLiAqL1xuXHRnZXRFeGl0Q29kZSh1cmk6IHN0cmluZyk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rlcm1pbmFscy5nZXQodXJpKT8uZXhpdENvZGU7XG5cdH1cblxuXHQvKiogUmVzaXplIGEgdGVybWluYWwuICovXG5cdHByaXZhdGUgX3Jlc2l6ZSh1cmk6IHN0cmluZywgY29sczogbnVtYmVyLCByb3dzOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFscy5nZXQodXJpKTtcblx0XHRpZiAodGVybWluYWwgJiYgdGVybWluYWwuZXhpdENvZGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGVybWluYWwuY29scyA9IGNvbHM7XG5cdFx0XHR0ZXJtaW5hbC5yb3dzID0gcm93cztcblx0XHRcdHRlcm1pbmFsLnB0eS5yZXNpemUoY29scywgcm93cyk7XG5cdFx0XHR0ZXJtaW5hbC5oZWFkbGVzc1Rlcm1pbmFsPy5yZXNpemUoY29scywgcm93cyk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFVwZGF0ZSBhIHRlcm1pbmFsJ3MgY2xhaW0uICovXG5cdHByaXZhdGUgX3NldENsYWltKHVyaTogc3RyaW5nLCBjbGFpbTogVGVybWluYWxDbGFpbSk6IHZvaWQge1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5fdGVybWluYWxzLmdldCh1cmkpO1xuXHRcdGlmICh0ZXJtaW5hbCkge1xuXHRcdFx0dGVybWluYWwuY2xhaW0gPSBjbGFpbTtcblx0XHRcdHRlcm1pbmFsLm9uQ2xhaW1DaGFuZ2VkRW1pdHRlci5maXJlKGNsYWltKTtcblx0XHRcdHRoaXMuX2Jyb2FkY2FzdFRlcm1pbmFsTGlzdCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBVcGRhdGUgYSB0ZXJtaW5hbCdzIHRpdGxlLiAqL1xuXHRwcml2YXRlIF9zZXRUaXRsZSh1cmk6IHN0cmluZywgdGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5fdGVybWluYWxzLmdldCh1cmkpO1xuXHRcdGlmICh0ZXJtaW5hbCkge1xuXHRcdFx0dGVybWluYWwudGl0bGUgPSB0aXRsZTtcblx0XHRcdHRoaXMuX2Jyb2FkY2FzdFRlcm1pbmFsTGlzdCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBDbGVhciBhIHRlcm1pbmFsJ3Mgc2Nyb2xsYmFjayBidWZmZXIuICovXG5cdHByaXZhdGUgX2NsZWFyQ29udGVudCh1cmk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5fdGVybWluYWxzLmdldCh1cmkpO1xuXHRcdGlmICh0ZXJtaW5hbCkge1xuXHRcdFx0dGVybWluYWwuY29udGVudCA9IFtdO1xuXHRcdFx0dGVybWluYWwuY29udGVudFNpemUgPSAwO1xuXHRcdFx0dGVybWluYWwuaGVhZGxlc3NUZXJtaW5hbD8uY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHQvKiogUHJvY2VzcyByYXcgUFRZIG91dHB1dDogcGFyc2UgT1NDIDYzMyBzZXF1ZW5jZXMsIGRpc3BhdGNoIGFjdGlvbnMsIHRyYWNrIGNvbnRlbnQuICovXG5cdHByaXZhdGUgX2hhbmRsZVB0eURhdGEobWFuYWdlZDogSU1hbmFnZWRUZXJtaW5hbCwgcmF3RGF0YTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdHJhY2tlciA9IG1hbmFnZWQuY29tbWFuZFRyYWNrZXI7XG5cblx0XHQvLyBXaXRob3V0IGNvbW1hbmQgZGV0ZWN0aW9uIHRoZXJlIGFyZSBubyBPU0MgNjMzIHNlcXVlbmNlcyB0b1xuXHRcdC8vIGludGVybGVhdmUgXHUyMDE0IHRoZSB3aG9sZSBjaHVuayBpcyBjb21tYW5kIG91dHB1dC4gV2l0aCBhIHRyYWNrZXIsXG5cdFx0Ly8gcHJvY2VzcyBjbGVhbmVkLWRhdGEgYW5kIGV2ZW50cyBpbiBzdHJlYW0gb3JkZXIgc28gdGhhdCBvdXRwdXQgd2hpY2hcblx0XHQvLyBhcnJpdmVzIGJlZm9yZSBhIENvbW1hbmRGaW5pc2hlZCBtYXJrZXIgKGNvbW1vbmx5IGluIHRoZSBzYW1lIFBUWVxuXHRcdC8vIHJlYWQgZm9yIGZhc3QgY29tbWFuZHMpIGlzIGFwcGVuZGVkIHRvIHRoZSBjb21tYW5kJ3Mgb3V0cHV0IEJFRk9SRSB0aGVcblx0XHQvLyBmaW5pc2hlZCBldmVudCBzbmFwc2hvdHMgaXQuIEhhbmRsaW5nIGFsbCBldmVudHMgZmlyc3Qgd291bGQgZW1pdFxuXHRcdC8vIENvbW1hbmRGaW5pc2hlZCB3aXRoIHRoZSBub3QteWV0LWFwcGVuZGVkIG91dHB1dCBtaXNzaW5nLlxuXHRcdGNvbnN0IHNlZ21lbnRzOiBPc2M2MzNQYXJzZVNlZ21lbnRbXSA9IHRyYWNrZXJcblx0XHRcdD8gdHJhY2tlci5wYXJzZXIucGFyc2VTZWdtZW50cyhyYXdEYXRhKVxuXHRcdFx0OiAocmF3RGF0YS5sZW5ndGggPiAwID8gW3sga2luZDogJ2RhdGEnLCBkYXRhOiByYXdEYXRhIH1dIDogW10pO1xuXG5cdFx0Ly8gUHJlc2VydmUgT1NDIDYzMyBzdHJlYW0gb3JkZXIgd2hlbiBlbWl0dGluZyBBSFAgYWN0aW9uczogY29tbWFuZCBkYXRhIG11c3QgcmVtYWluIGJldHdlZW5cblx0XHQvLyBUZXJtaW5hbENvbW1hbmRFeGVjdXRlZCBhbmQgVGVybWluYWxDb21tYW5kRmluaXNoZWQsIG1hdGNoaW5nIHRoZSBBSFAgY29udHJhY3QgYW5kIHh0ZXJtLlxuXHRcdGxldCBwZW5kaW5nQ2xpZW50RGF0YSA9ICcnO1xuXHRcdGNvbnN0IGZsdXNoQ2xpZW50RGF0YSA9ICgpOiB2b2lkID0+IHtcblx0XHRcdGlmIChwZW5kaW5nQ2xpZW50RGF0YS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0bWFuYWdlZC5vbkRhdGFFbWl0dGVyLmZpcmUocGVuZGluZ0NsaWVudERhdGEpO1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKG1hbmFnZWQudXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxEYXRhLFxuXHRcdFx0XHRkYXRhOiBwZW5kaW5nQ2xpZW50RGF0YSxcblx0XHRcdH0pO1xuXHRcdFx0cGVuZGluZ0NsaWVudERhdGEgPSAnJztcblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCBzZWdtZW50IG9mIHNlZ21lbnRzKSB7XG5cdFx0XHRpZiAoc2VnbWVudC5raW5kID09PSAnZXZlbnQnKSB7XG5cdFx0XHRcdGZsdXNoQ2xpZW50RGF0YSgpO1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVPc2M2MzNFdmVudChtYW5hZ2VkLCB0cmFja2VyISwgc2VnbWVudC5ldmVudCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBZ2VudCBIb3N0J3Mgc2VydmVyLXNpZGUgaGVhZGxlc3MgdGVybWluYWwgYW5zd2VycyBDUFIgYnV0IGNhbm5vdCBhbnN3ZXJcblx0XHRcdC8vIE9TQyBjb2xvciBxdWVyaWVzLiBIaWRlIGJvdGggZnJvbSBjbGllbnQgeHRlcm1zIHNvIHRlcm1pbmFsIHJlc3BvbnNlc1xuXHRcdFx0Ly8gY2Fubm90IGZsb3cgYmFjayBvdXQgb2Ygb3JkZXIgdGhyb3VnaCBBZ2VudEhvc3RQdHkuaW5wdXQuXG5cdFx0XHRjb25zdCBjbGVhbmVkRGF0YSA9IHJlbW92ZVRlcm1pbmFsUXVlcmllc1N1cHByZXNzZWRGcm9tQ2xpZW50KHNlZ21lbnQuZGF0YSwgbWFuYWdlZC50ZXJtaW5hbFF1ZXJ5RmlsdGVyU3RhdGUpO1xuXHRcdFx0aWYgKGNsZWFuZWREYXRhLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fYXBwZW5kVG9Db250ZW50KG1hbmFnZWQsIGNsZWFuZWREYXRhKTtcblx0XHRcdFx0cGVuZGluZ0NsaWVudERhdGEgKz0gY2xlYW5lZERhdGE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zmx1c2hDbGllbnREYXRhKCk7XG5cblx0XHQvLyBUcmltIGNvbnRlbnQgaWYgdG9vIGxhcmdlXG5cdFx0dGhpcy5fdHJpbUNvbnRlbnQobWFuYWdlZCk7XG5cdH1cblxuXHQvKiogSGFuZGxlIGEgcGFyc2VkIE9TQyA2MzMgZXZlbnQgYnkgZGlzcGF0Y2hpbmcgdGhlIGFwcHJvcHJpYXRlIHByb3RvY29sIGFjdGlvbnMuICovXG5cdHByaXZhdGUgX2hhbmRsZU9zYzYzM0V2ZW50KG1hbmFnZWQ6IElNYW5hZ2VkVGVybWluYWwsIHRyYWNrZXI6IElDb21tYW5kVHJhY2tlciwgZXZlbnQ6IE9zYzYzM0V2ZW50KTogdm9pZCB7XG5cdFx0Ly8gRW1pdCBUZXJtaW5hbENvbW1hbmREZXRlY3Rpb25BdmFpbGFibGUgb24gZmlyc3Qgc2VxdWVuY2Vcblx0XHRpZiAoIXRyYWNrZXIuZGV0ZWN0aW9uQXZhaWxhYmxlRW1pdHRlZCkge1xuXHRcdFx0dHJhY2tlci5kZXRlY3Rpb25BdmFpbGFibGVFbWl0dGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihtYW5hZ2VkLnVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZERldGVjdGlvbkF2YWlsYWJsZSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAoZXZlbnQudHlwZSkge1xuXHRcdFx0Y2FzZSBPc2M2MzNFdmVudFR5cGUuQ29tbWFuZExpbmU6IHtcblx0XHRcdFx0Ly8gT25seSB0cnVzdCBjb21tYW5kIGxpbmVzIHdpdGggYSB2YWxpZCBub25jZVxuXHRcdFx0XHRpZiAoZXZlbnQubm9uY2UgPT09IHRyYWNrZXIubm9uY2UpIHtcblx0XHRcdFx0XHR0cmFja2VyLnBlbmRpbmdDb21tYW5kTGluZSA9IGV2ZW50LmNvbW1hbmRMaW5lO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjYXNlIE9zYzYzM0V2ZW50VHlwZS5Db21tYW5kRXhlY3V0ZWQ6IHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZElkID0gYGNtZC0keysrdHJhY2tlci5jb21tYW5kQ291bnRlcn1gO1xuXHRcdFx0XHRjb25zdCBjb21tYW5kTGluZSA9IHRyYWNrZXIucGVuZGluZ0NvbW1hbmRMaW5lID8/ICcnO1xuXHRcdFx0XHRjb25zdCB0aW1lc3RhbXAgPSBEYXRlLm5vdygpO1xuXHRcdFx0XHR0cmFja2VyLnBlbmRpbmdDb21tYW5kTGluZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dHJhY2tlci5hY3RpdmVDb21tYW5kSWQgPSBjb21tYW5kSWQ7XG5cdFx0XHRcdHRyYWNrZXIuYWN0aXZlQ29tbWFuZFRpbWVzdGFtcCA9IHRpbWVzdGFtcDtcblxuXHRcdFx0XHQvLyBQdXNoIGEgbmV3IGNvbW1hbmQgY29udGVudCBwYXJ0XG5cdFx0XHRcdG1hbmFnZWQuY29udGVudC5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZElkLFxuXHRcdFx0XHRcdGNvbW1hbmRMaW5lLFxuXHRcdFx0XHRcdG91dHB1dDogJycsXG5cdFx0XHRcdFx0dGltZXN0YW1wLFxuXHRcdFx0XHRcdGlzQ29tcGxldGU6IGZhbHNlLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24obWFuYWdlZC51cmksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZEV4ZWN1dGVkLFxuXHRcdFx0XHRcdGNvbW1hbmRJZCxcblx0XHRcdFx0XHRjb21tYW5kTGluZSxcblx0XHRcdFx0XHR0aW1lc3RhbXAsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSBPc2M2MzNFdmVudFR5cGUuQ29tbWFuZEZpbmlzaGVkOiB7XG5cdFx0XHRcdGNvbnN0IGZpbmlzaGVkQ29tbWFuZElkID0gdHJhY2tlci5hY3RpdmVDb21tYW5kSWQ7XG5cdFx0XHRcdGlmICghZmluaXNoZWRDb21tYW5kSWQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBkdXJhdGlvbk1zID0gdHJhY2tlci5hY3RpdmVDb21tYW5kVGltZXN0YW1wICE9PSB1bmRlZmluZWRcblx0XHRcdFx0XHQ/IERhdGUubm93KCkgLSB0cmFja2VyLmFjdGl2ZUNvbW1hbmRUaW1lc3RhbXBcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdFx0XHQvLyBNYXJrIHRoZSBjb21tYW5kIGNvbnRlbnQgcGFydCBhcyBjb21wbGV0ZSBhbmQgY29sbGVjdCBvdXRwdXRcblx0XHRcdFx0bGV0IGNvbW1hbmRMaW5lID0gJyc7XG5cdFx0XHRcdGxldCBjb21tYW5kT3V0cHV0ID0gJyc7XG5cdFx0XHRcdGZvciAoY29uc3QgcGFydCBvZiBtYW5hZ2VkLmNvbnRlbnQpIHtcblx0XHRcdFx0XHRpZiAocGFydC50eXBlID09PSAnY29tbWFuZCcgJiYgcGFydC5jb21tYW5kSWQgPT09IGZpbmlzaGVkQ29tbWFuZElkKSB7XG5cdFx0XHRcdFx0XHRwYXJ0LmlzQ29tcGxldGUgPSB0cnVlO1xuXHRcdFx0XHRcdFx0cGFydC5leGl0Q29kZSA9IGV2ZW50LmV4aXRDb2RlO1xuXHRcdFx0XHRcdFx0cGFydC5kdXJhdGlvbk1zID0gZHVyYXRpb25Ncztcblx0XHRcdFx0XHRcdGNvbW1hbmRMaW5lID0gcGFydC5jb21tYW5kTGluZTtcblx0XHRcdFx0XHRcdGNvbW1hbmRPdXRwdXQgPSBwYXJ0Lm91dHB1dDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRyYWNrZXIuYWN0aXZlQ29tbWFuZElkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0cmFja2VyLmFjdGl2ZUNvbW1hbmRUaW1lc3RhbXAgPSB1bmRlZmluZWQ7XG5cblx0XHRcdFx0bWFuYWdlZC5vbkNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRcdFx0Y29tbWFuZElkOiBmaW5pc2hlZENvbW1hbmRJZCxcblx0XHRcdFx0XHRleGl0Q29kZTogZXZlbnQuZXhpdENvZGUsXG5cdFx0XHRcdFx0Y29tbWFuZDogY29tbWFuZExpbmUsXG5cdFx0XHRcdFx0b3V0cHV0OiBjb21tYW5kT3V0cHV0LFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24obWFuYWdlZC51cmksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZEZpbmlzaGVkLFxuXHRcdFx0XHRcdGNvbW1hbmRJZDogZmluaXNoZWRDb21tYW5kSWQsXG5cdFx0XHRcdFx0ZXhpdENvZGU6IGV2ZW50LmV4aXRDb2RlLFxuXHRcdFx0XHRcdGR1cmF0aW9uTXMsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSBPc2M2MzNFdmVudFR5cGUuUHJvcGVydHk6IHtcblx0XHRcdFx0aWYgKGV2ZW50LmtleSA9PT0gJ0N3ZCcpIHtcblx0XHRcdFx0XHRtYW5hZ2VkLmN3ZCA9IGV2ZW50LnZhbHVlO1xuXHRcdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihtYW5hZ2VkLnVyaSwge1xuXHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbEN3ZENoYW5nZWQsXG5cdFx0XHRcdFx0XHRjd2Q6IGV2ZW50LnZhbHVlLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKiBBcHBlbmQgY2xlYW5lZCBkYXRhIHRvIHRoZSB0ZXJtaW5hbCdzIHN0cnVjdHVyZWQgY29udGVudCBhcnJheS4gKi9cblx0cHJpdmF0ZSBfYXBwZW5kVG9Db250ZW50KG1hbmFnZWQ6IHsgY29udGVudDogVGVybWluYWxDb250ZW50UGFydFtdOyBjb250ZW50U2l6ZTogbnVtYmVyIH0sIGRhdGE6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHRhaWwgPSBtYW5hZ2VkLmNvbnRlbnQubGVuZ3RoID4gMCA/IG1hbmFnZWQuY29udGVudFttYW5hZ2VkLmNvbnRlbnQubGVuZ3RoIC0gMV0gOiB1bmRlZmluZWQ7XG5cblx0XHRpZiAodGFpbD8udHlwZSA9PT0gJ2NvbW1hbmQnICYmICF0YWlsLmlzQ29tcGxldGUpIHtcblx0XHRcdC8vIEFjdGl2ZSBjb21tYW5kIFx1MjAxNCBhcHBlbmQgdG8gaXRzIG91dHB1dFxuXHRcdFx0dGFpbC5vdXRwdXQgKz0gZGF0YTtcblx0XHRcdG1hbmFnZWQuY29udGVudFNpemUgKz0gZGF0YS5sZW5ndGg7XG5cdFx0fSBlbHNlIGlmICh0YWlsPy50eXBlID09PSAndW5jbGFzc2lmaWVkJykge1xuXHRcdFx0Ly8gRXh0ZW5kIHRoZSBleGlzdGluZyB1bmNsYXNzaWZpZWQgcGFydFxuXHRcdFx0dGFpbC52YWx1ZSArPSBkYXRhO1xuXHRcdFx0bWFuYWdlZC5jb250ZW50U2l6ZSArPSBkYXRhLmxlbmd0aDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gU3RhcnQgYSBuZXcgdW5jbGFzc2lmaWVkIHBhcnRcblx0XHRcdG1hbmFnZWQuY29udGVudC5wdXNoKHsgdHlwZTogJ3VuY2xhc3NpZmllZCcsIHZhbHVlOiBkYXRhIH0pO1xuXHRcdFx0bWFuYWdlZC5jb250ZW50U2l6ZSArPSBkYXRhLmxlbmd0aDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb250ZW50UGFydFNpemUocGFydDogVGVybWluYWxDb250ZW50UGFydCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHBhcnQudHlwZSA9PT0gJ2NvbW1hbmQnID8gcGFydC5vdXRwdXQubGVuZ3RoIDogcGFydC52YWx1ZS5sZW5ndGg7XG5cdH1cblxuXHQvKiogVHJpbSBjb250ZW50IHBhcnRzIHRvIHN0YXkgd2l0aGluIHRoZSByb2xsaW5nIGJ1ZmZlciBsaW1pdC4gKi9cblx0cHJpdmF0ZSBfdHJpbUNvbnRlbnQobWFuYWdlZDogeyBjb250ZW50OiBUZXJtaW5hbENvbnRlbnRQYXJ0W107IGNvbnRlbnRTaXplOiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdGNvbnN0IG1heFNpemUgPSAxMDBfMDAwO1xuXHRcdGNvbnN0IHRhcmdldFNpemUgPSA4MF8wMDA7XG5cdFx0aWYgKG1hbmFnZWQuY29udGVudFNpemUgPD0gbWF4U2l6ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBEcm9wIHdob2xlIHBhcnRzIGZyb20gdGhlIGZyb250IHdoaWxlIHBvc3NpYmxlXG5cdFx0d2hpbGUgKG1hbmFnZWQuY29udGVudFNpemUgPiB0YXJnZXRTaXplICYmIG1hbmFnZWQuY29udGVudC5sZW5ndGggPiAxKSB7XG5cdFx0XHRjb25zdCByZW1vdmVkID0gbWFuYWdlZC5jb250ZW50LnNoaWZ0KCkhO1xuXHRcdFx0bWFuYWdlZC5jb250ZW50U2l6ZSAtPSB0aGlzLl9nZXRDb250ZW50UGFydFNpemUocmVtb3ZlZCk7XG5cdFx0fVxuXHRcdC8vIElmIHRoZSBzaW5nbGUgcmVtYWluaW5nIChvciBmaXJzdCkgcGFydCBpcyBzdGlsbCBvdmVyIGJ1ZGdldCwgdHJpbSBpdHMgdGV4dFxuXHRcdGlmIChtYW5hZ2VkLmNvbnRlbnRTaXplID4gdGFyZ2V0U2l6ZSAmJiBtYW5hZ2VkLmNvbnRlbnQubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgaGVhZCA9IG1hbmFnZWQuY29udGVudFswXTtcblx0XHRcdGNvbnN0IGV4Y2VzcyA9IG1hbmFnZWQuY29udGVudFNpemUgLSB0YXJnZXRTaXplO1xuXHRcdFx0aWYgKGhlYWQudHlwZSA9PT0gJ2NvbW1hbmQnKSB7XG5cdFx0XHRcdGhlYWQub3V0cHV0ID0gaGVhZC5vdXRwdXQuc2xpY2UoZXhjZXNzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhlYWQudmFsdWUgPSBoZWFkLnZhbHVlLnNsaWNlKGV4Y2Vzcyk7XG5cdFx0XHR9XG5cdFx0XHRtYW5hZ2VkLmNvbnRlbnRTaXplIC09IGV4Y2Vzcztcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGFuIG91dHB1dC1vbmx5IHRlcm1pbmFsIGNoYW5uZWwuIFVubGlrZSB7QGxpbmsgY3JlYXRlVGVybWluYWx9XG5cdCAqIHRoZXJlIGlzIG5vIFBUWSBiZWhpbmQgaXQ6IHRoZSBvd25lciBhcHBlbmRzIHBsYWluLXRleHQgb3V0cHV0IHZpYVxuXHQgKiB7QGxpbmsgYXBwZW5kT3V0cHV0VGVybWluYWxEYXRhfS4gVGhlIGNoYW5uZWwgaXMgbm90IGFubm91bmNlZCBvbiB0aGVcblx0ICogcm9vdCB0ZXJtaW5hbCBsaXN0IFx1MjAxNCBjbGllbnRzIGRpc2NvdmVyIGl0IHRocm91Z2ggdGhlIHRvb2wgcmVzdWx0J3Ncblx0ICogdGVybWluYWwgY29udGVudCBibG9jayBhbmQgc3Vic2NyaWJlIHRvIGl0cyBVUkkuXG5cdCAqL1xuXHRjcmVhdGVPdXRwdXRUZXJtaW5hbCh1cmk6IHN0cmluZywgb3B0aW9uczogeyB0aXRsZTogc3RyaW5nOyBjbGFpbTogVGVybWluYWxDbGFpbSB9KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Rlcm1pbmFscy5oYXModXJpKSB8fCB0aGlzLl9vdXRwdXRUZXJtaW5hbHMuaGFzKHVyaSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVGVybWluYWwgYWxyZWFkeSBleGlzdHM6ICR7dXJpfWApO1xuXHRcdH1cblx0XHR0aGlzLl9vdXRwdXRUZXJtaW5hbHMuc2V0KHVyaSwge1xuXHRcdFx0dGl0bGU6IG9wdGlvbnMudGl0bGUsXG5cdFx0XHRjb250ZW50OiBbXSxcblx0XHRcdGNvbnRlbnRTaXplOiAwLFxuXHRcdFx0Y2xhaW06IG9wdGlvbnMuY2xhaW0sXG5cdFx0fSk7XG5cdH1cblxuXHQvKiogQXBwZW5kIHBsYWluLXRleHQgZGF0YSB0byBhbiBvdXRwdXQtb25seSB0ZXJtaW5hbCBhbmQgc3RyZWFtIGl0IHRvIHN1YnNjcmliZXJzLiAqL1xuXHRhcHBlbmRPdXRwdXRUZXJtaW5hbERhdGEodXJpOiBzdHJpbmcsIGRhdGE6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5fb3V0cHV0VGVybWluYWxzLmdldCh1cmkpO1xuXHRcdGlmICghdGVybWluYWwgfHwgZGF0YS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYXBwZW5kVG9Db250ZW50KHRlcm1pbmFsLCBkYXRhKTtcblx0XHR0aGlzLl90cmltQ29udGVudCh0ZXJtaW5hbCk7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbERhdGEsXG5cdFx0XHRkYXRhLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqIENsZWFyIGFuIG91dHB1dC1vbmx5IHRlcm1pbmFsJ3MgY29udGVudCAoZS5nLiB3aGVuIGN1bXVsYXRpdmUgc291cmNlIG91dHB1dCB3YXMgcmV3cml0dGVuKS4gKi9cblx0cmVzZXRPdXRwdXRUZXJtaW5hbCh1cmk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5fb3V0cHV0VGVybWluYWxzLmdldCh1cmkpO1xuXHRcdGlmICghdGVybWluYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGVybWluYWwuY29udGVudCA9IFtdO1xuXHRcdHRlcm1pbmFsLmNvbnRlbnRTaXplID0gMDtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24odXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsQ2xlYXJlZCxcblx0XHR9KTtcblx0fVxuXG5cdC8qKiBSZWNvcmQgdGhlIGNvbW1hbmQncyBleGl0IG9uIGFuIG91dHB1dC1vbmx5IHRlcm1pbmFsIGFuZCBub3RpZnkgc3Vic2NyaWJlcnMuICovXG5cdGZpbmFsaXplT3V0cHV0VGVybWluYWwodXJpOiBzdHJpbmcsIGV4aXRDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuX291dHB1dFRlcm1pbmFscy5nZXQodXJpKTtcblx0XHRpZiAoIXRlcm1pbmFsIHx8IHRlcm1pbmFsLmV4aXRDb2RlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGV4aXRDb2RlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRlcm1pbmFsLmV4aXRDb2RlID0gZXhpdENvZGU7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24odXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxFeGl0ZWQsXG5cdFx0XHRcdGV4aXRDb2RlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIERpc3Bvc2UgYSB0ZXJtaW5hbDoga2lsbCB0aGUgcHJvY2VzcyBhbmQgcmVtb3ZlIGl0LiAqL1xuXHRkaXNwb3NlVGVybWluYWwodXJpOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fb3V0cHV0VGVybWluYWxzLmRlbGV0ZSh1cmkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5fdGVybWluYWxzLmdldCh1cmkpO1xuXHRcdGlmICh0ZXJtaW5hbCkge1xuXHRcdFx0dGhpcy5fdGVybWluYWxzLmRlbGV0ZSh1cmkpO1xuXHRcdFx0dGVybWluYWwuc3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fYnJvYWRjYXN0VGVybWluYWxMaXN0KCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0RGVmYXVsdFNoZWxsKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY29uZmlndXJlZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShhZ2VudEhvc3RDdXN0b21pemF0aW9uQ29uZmlnU2NoZW1hLCBBZ2VudEhvc3RDb25maWdLZXkuRGVmYXVsdFNoZWxsKTtcblx0XHRpZiAoY29uZmlndXJlZCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZnMucHJvbWlzZXMuYWNjZXNzKGNvbmZpZ3VyZWQsIGZzLmNvbnN0YW50cy5YX09LKTtcblx0XHRcdFx0cmV0dXJuIGNvbmZpZ3VyZWQ7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbVGVybWluYWxNYW5hZ2VyXSBDb25maWd1cmVkIGRlZmF1bHRTaGVsbCAnJHtjb25maWd1cmVkfScgaXMgbm90IGFjY2Vzc2libGUsIGZhbGxpbmcgYmFjayB0byBzeXN0ZW0gc2hlbGw6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZ2V0U3lzdGVtU2hlbGwocGxhdGZvcm0uT1MsIHByb2Nlc3MuZW52KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB0aGUgY3dkIHN0cmluZyBmcm9tIHtAbGluayBDcmVhdGVUZXJtaW5hbFBhcmFtc30gdG8gYW5cblx0ICogYWNjZXNzaWJsZSBmaWxlc3lzdGVtIHBhdGgsIGZhbGxpbmcgYmFjayB0byAkSE9NRSBpZiB0aGUgcmVxdWVzdGVkXG5cdCAqIGRpcmVjdG9yeSBpcyBtaXNzaW5nIChvdGhlcndpc2Ugbm9kZS1wdHkgZXhpdHMgc2lsZW50bHkgd2l0aCBjb2RlIDEpLlxuXHQgKiBBY2NlcHRzIGVpdGhlciBhIGBmaWxlOi8vYCBVUkkgc3RyaW5nIG9yIGEgcmF3IGFic29sdXRlIGZpbGVzeXN0ZW0gcGF0aC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVDd2QoY3dkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRlcm1pbmFsVVJJOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGxldCByZXNvbHZlZCA9IGN3ZDtcblx0XHRpZiAoY3dkKSB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBVUkkucGFyc2UoY3dkKTtcblx0XHRcdGlmIChwYXJzZWQuc2NoZW1lID09PSAnZmlsZScgJiYgcGFyc2VkLmZzUGF0aCAmJiBwYXJzZWQuZnNQYXRoICE9PSAnLycpIHtcblx0XHRcdFx0cmVzb2x2ZWQgPSBwYXJzZWQuZnNQYXRoO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbVGVybWluYWxNYW5hZ2VyXSBJZ25vcmluZyBub24tZmlsZSBjd2QgZm9yICR7dGVybWluYWxVUkl9OiAke2N3ZH1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKHJlc29sdmVkKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCBmcy5wcm9taXNlcy5zdGF0KHJlc29sdmVkKTtcblx0XHRcdFx0aWYgKHN0YXQuaXNEaXJlY3RvcnkoKSkge1xuXHRcdFx0XHRcdHJldHVybiByZXNvbHZlZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gZmFsbCB0aHJvdWdoIHRvIGZhbGxiYWNrXG5cdFx0fVxuXG5cdFx0Y29uc3QgZmFsbGJhY2sgPSBwcm9jZXNzLmVudlsnSE9NRSddIHx8IHByb2Nlc3MuZW52WydVU0VSUFJPRklMRSddIHx8IHByb2Nlc3MuY3dkKCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbVGVybWluYWxNYW5hZ2VyXSBjd2QgJyR7cmVzb2x2ZWR9JyBpcyBub3QgYWNjZXNzaWJsZSwgZmFsbGluZyBiYWNrIHRvICR7ZmFsbGJhY2t9YCk7XG5cdFx0cmV0dXJuIGZhbGxiYWNrO1xuXHR9XG5cblx0LyoqIERpc3BhdGNoIHJvb3QvdGVybWluYWxzQ2hhbmdlZCB3aXRoIHRoZSBjdXJyZW50IHRlcm1pbmFsIGxpc3QuICovXG5cdHByaXZhdGUgX2Jyb2FkY2FzdFRlcm1pbmFsTGlzdCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oUk9PVF9TVEFURV9VUkksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdFRlcm1pbmFsc0NoYW5nZWQsXG5cdFx0XHR0ZXJtaW5hbHM6IHRoaXMuZ2V0VGVybWluYWxJbmZvcygpLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHRlcm1pbmFsIG9mIHRoaXMuX3Rlcm1pbmFscy52YWx1ZXMoKSkge1xuXHRcdFx0dGVybWluYWwuc3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl90ZXJtaW5hbHMuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6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
