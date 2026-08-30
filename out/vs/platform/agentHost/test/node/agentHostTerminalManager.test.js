import assert from "assert";
import { DeferredPromise, timeout } from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { ActionType } from "../../common/state/protocol/actions.js";
import { TerminalClaimKind } from "../../common/state/protocol/state.js";
import { AgentConfigurationService } from "../../node/agentConfigurationService.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { AgentHostTerminalManager, formatTerminalText, removeTerminalQueriesSuppressedFromClient } from "../../node/agentHostTerminalManager.js";
import { Osc633EventType, Osc633Parser } from "../../node/osc633Parser.js";
class TestTerminalDataHandler {
  constructor(uri, tracker) {
    this.uri = uri;
    this.tracker = tracker;
    this.dispatched = [];
    this.content = [];
    this.cwd = "/home/user";
    this._terminalQueryFilterState = { pendingData: "" };
  }
  /** Simulates AgentHostTerminalManager._handlePtyData */
  handlePtyData(rawData) {
    let cleanedForClient = "";
    let pendingClientData = "";
    const flushClientData = () => {
      if (pendingClientData.length === 0) {
        return;
      }
      this.dispatched.push({
        type: ActionType.TerminalData,
        data: pendingClientData
      });
      cleanedForClient += pendingClientData;
      pendingClientData = "";
    };
    for (const segment of this.tracker.parser.parseSegments(rawData)) {
      if (segment.kind === "event") {
        flushClientData();
        this._handleOsc633Event(segment.event);
        continue;
      }
      const cleanedData = removeTerminalQueriesSuppressedFromClient(segment.data, this._terminalQueryFilterState);
      if (cleanedData.length > 0) {
        this._appendToContent(cleanedData);
        pendingClientData += cleanedData;
      }
    }
    flushClientData();
    return cleanedForClient;
  }
  _handleOsc633Event(event) {
    if (!this.tracker.detectionAvailableEmitted) {
      this.tracker.detectionAvailableEmitted = true;
      this.dispatched.push({
        type: ActionType.TerminalCommandDetectionAvailable
      });
    }
    switch (event.type) {
      case Osc633EventType.CommandLine: {
        if (event.nonce === this.tracker.nonce) {
          this.tracker.pendingCommandLine = event.commandLine;
        }
        break;
      }
      case Osc633EventType.CommandExecuted: {
        const commandId = `cmd-${++this.tracker.commandCounter}`;
        const commandLine = this.tracker.pendingCommandLine ?? "";
        const timestamp = Date.now();
        this.tracker.pendingCommandLine = void 0;
        this.tracker.activeCommandId = commandId;
        this.tracker.activeCommandTimestamp = timestamp;
        this.content.push({
          type: "command",
          commandId,
          commandLine,
          output: "",
          timestamp,
          isComplete: false
        });
        this.dispatched.push({
          type: ActionType.TerminalCommandExecuted,
          commandId,
          commandLine,
          timestamp
        });
        break;
      }
      case Osc633EventType.CommandFinished: {
        const finishedCommandId = this.tracker.activeCommandId;
        if (!finishedCommandId) {
          break;
        }
        const durationMs = this.tracker.activeCommandTimestamp !== void 0 ? Date.now() - this.tracker.activeCommandTimestamp : void 0;
        for (const part of this.content) {
          if (part.type === "command" && part.commandId === finishedCommandId) {
            part.isComplete = true;
            part.exitCode = event.exitCode;
            part.durationMs = durationMs;
            break;
          }
        }
        this.tracker.activeCommandId = void 0;
        this.tracker.activeCommandTimestamp = void 0;
        this.dispatched.push({
          type: ActionType.TerminalCommandFinished,
          commandId: finishedCommandId,
          exitCode: event.exitCode,
          durationMs
        });
        break;
      }
      case Osc633EventType.Property: {
        if (event.key === "Cwd") {
          this.cwd = event.value;
          this.dispatched.push({
            type: ActionType.TerminalCwdChanged,
            cwd: event.value
          });
        }
        break;
      }
    }
  }
  _appendToContent(data) {
    const tail = this.content.length > 0 ? this.content[this.content.length - 1] : void 0;
    if (tail && tail.type === "command" && !tail.isComplete) {
      tail.output += data;
    } else if (tail && tail.type === "unclassified") {
      tail.value += data;
    } else {
      this.content.push({ type: "unclassified", value: data });
    }
  }
}
class TestPty {
  constructor() {
    this.pid = 1;
    this.cols = 80;
    this.rows = 24;
    this.process = "test-shell";
    this.handleFlowControl = false;
    this.writes = [];
    this.dataListenerRegistered = new DeferredPromise();
    this._onData = new Emitter();
    this.onData = (listener) => {
      this.dataListenerRegistered.complete();
      return this._onData.event((data) => listener(data));
    };
    this._onExit = new Emitter();
    this.onExit = (listener) => this._onExit.event((data) => listener(data));
  }
  fireData(data) {
    this._onData.fire(data);
  }
  resize(columns, rows) {
    this.cols = columns;
    this.rows = rows;
  }
  clear() {
  }
  write(data) {
    this.writes.push(typeof data === "string" ? data : data.toString());
  }
  kill() {
  }
  pause() {
  }
  resume() {
  }
}
class TestAgentHostTerminalManager extends AgentHostTerminalManager {
  constructor(stateManager, logService, productService, configurationService, _pty) {
    super(stateManager, logService, productService, configurationService);
    this._pty = _pty;
  }
  async _spawnPty(_file, _args, options) {
    this.spawnOptions = options;
    this._pty.cols = options.cols ?? this._pty.cols;
    this._pty.rows = options.rows ?? this._pty.rows;
    return this._pty;
  }
}
function osc633(payload) {
  return `\x1B]633;${payload}\x07`;
}
function createHandler(nonce = "test-nonce") {
  return new TestTerminalDataHandler("terminal://test", {
    parser: new Osc633Parser(),
    nonce,
    commandCounter: 0,
    detectionAvailableEmitted: false
  });
}
async function waitForWrites(pty, count) {
  for (let i = 0; i < 20; i++) {
    if (pty.writes.length >= count) {
      return;
    }
    await timeout(10);
  }
}
suite("AgentHostTerminalManager \u2013 command detection integration", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("formats command input with terminal enter semantics", () => {
    assert.strictEqual(formatTerminalText("echo first\necho second", { shouldExecute: true }), "echo first\recho second\r");
    assert.strictEqual(formatTerminalText("echo first\r\necho second", { shouldExecute: true }), "echo first\recho second\r");
    assert.strictEqual(formatTerminalText("echo first\r", { shouldExecute: true }), "echo first\r");
    assert.strictEqual(formatTerminalText("answer\n", { shouldExecute: false }), "answer\r");
    assert.strictEqual(formatTerminalText("/tmp/foo\npwd", { shouldExecute: true }), "/tmp/foo\rpwd\r");
    assert.strictEqual(formatTerminalText("echo first\necho second", { shouldExecute: true, forceBracketedPasteMode: true }), "\x1B[200~echo first\recho second\x1B[201~\r");
    assert.strictEqual(formatTerminalText("answer\n", { shouldExecute: false, forceBracketedPasteMode: true }), "\x1B[200~answer\r\x1B[201~");
  });
  test("writes formatted command input to the PTY", async () => {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    const pty = new TestPty();
    const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
    const createTerminal = manager.createTerminal({
      channel: "agenthost-terminal://test/command-input",
      claim: { kind: TerminalClaimKind.Client, clientId: "test-client" },
      cwd: process.cwd(),
      cols: 80,
      rows: 24
    }, { shell: "/bin/bash" });
    await pty.dataListenerRegistered.p;
    pty.fireData("prompt");
    await createTerminal;
    await manager.sendText("agenthost-terminal://test/command-input", "echo first\necho second", { shouldExecute: true });
    assert.deepStrictEqual(pty.writes, ["echo first\recho second\r"]);
  });
  test("writes bracketed paste command input when enabled by the terminal", async () => {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    const pty = new TestPty();
    const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
    const createTerminal = manager.createTerminal({
      channel: "agenthost-terminal://test/bracketed-paste",
      claim: { kind: TerminalClaimKind.Client, clientId: "test-client" },
      cwd: process.cwd(),
      cols: 80,
      rows: 24
    }, { shell: "/bin/bash" });
    await pty.dataListenerRegistered.p;
    pty.fireData("\x1B[?2004h");
    await createTerminal;
    await manager.sendText("agenthost-terminal://test/bracketed-paste", "echo first\necho second", { shouldExecute: true, bracketedPasteMode: true });
    assert.deepStrictEqual(pty.writes, ["\x1B[200~echo first\recho second\x1B[201~\r"]);
  });
  test("does not write bracketed paste command input when disabled by the terminal", async () => {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    const pty = new TestPty();
    const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
    const createTerminal = manager.createTerminal({
      channel: "agenthost-terminal://test/bracketed-paste-disabled",
      claim: { kind: TerminalClaimKind.Client, clientId: "test-client" },
      cwd: process.cwd(),
      cols: 80,
      rows: 24
    }, { shell: "/bin/bash" });
    await pty.dataListenerRegistered.p;
    pty.fireData("prompt");
    await createTerminal;
    await manager.sendText("agenthost-terminal://test/bracketed-paste-disabled", "echo first\necho second", { shouldExecute: true, bracketedPasteMode: true });
    assert.deepStrictEqual(pty.writes, ["echo first\recho second\r"]);
  });
  test("sets zsh agent fixups only for session zsh terminals", async () => {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    async function createTestTerminal(id, shell, claim, options) {
      const pty = new TestPty();
      const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
      const createTerminal = manager.createTerminal({
        channel: `agenthost-terminal://test/${id}`,
        claim,
        cwd: process.cwd(),
        cols: 80,
        rows: 24
      }, { shell, ...options });
      await pty.dataListenerRegistered.p;
      pty.fireData("prompt");
      await createTerminal;
      return manager;
    }
    const zshSessionManager = await createTestTerminal("zsh-session-fixups", "/bin/zsh", {
      kind: TerminalClaimKind.Session,
      session: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1"
    }, { preventShellHistory: true });
    assert.strictEqual(zshSessionManager.spawnOptions?.env?.VSCODE_AGENT_ZSH_FIXUPS, "1");
    assert.strictEqual(zshSessionManager.spawnOptions?.env?.VSCODE_PREVENT_SHELL_HISTORY, "1");
    const zshClientManager = await createTestTerminal("zsh-client", "/bin/zsh", {
      kind: TerminalClaimKind.Client,
      clientId: "test-client"
    });
    assert.strictEqual(zshClientManager.spawnOptions?.env?.VSCODE_AGENT_ZSH_FIXUPS, void 0);
    const bashSessionManager = await createTestTerminal("bash-session-history", "/bin/bash", {
      kind: TerminalClaimKind.Session,
      session: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-2"
    }, { preventShellHistory: true, nonInteractive: true });
    assert.strictEqual(bashSessionManager.spawnOptions?.env?.VSCODE_AGENT_ZSH_FIXUPS, void 0);
    assert.strictEqual(bashSessionManager.spawnOptions?.env?.VSCODE_PREVENT_SHELL_HISTORY, "1");
  });
  test("writes headless DSR responses back to the PTY", async () => {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    const pty = new TestPty();
    const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
    const createTerminal = manager.createTerminal({
      channel: "agenthost-terminal://test/dsr",
      claim: { kind: TerminalClaimKind.Client, clientId: "test-client" },
      cwd: process.cwd(),
      cols: 80,
      rows: 24
    }, { shell: "/bin/bash" });
    await pty.dataListenerRegistered.p;
    pty.fireData("abc\x1B[6n");
    await createTerminal;
    await waitForWrites(pty, 1);
    assert.deepStrictEqual(pty.writes, ["\x1B[1;4R"]);
  });
  test("swallows OSC color queries while preserving headless CPR responses", async () => {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    const pty = new TestPty();
    const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
    const uri = "agenthost-terminal://test/color-query";
    const clientData = [];
    const createTerminal = manager.createTerminal({
      channel: uri,
      claim: { kind: TerminalClaimKind.Client, clientId: "test-client" },
      cwd: process.cwd(),
      cols: 80,
      rows: 24
    }, { shell: "/bin/bash" });
    await pty.dataListenerRegistered.p;
    disposables.add(manager.onData(uri, (data) => clientData.push(data)));
    pty.fireData("before\x1B]10;?\x1B\\\x1B[6nmid\x1B]11;?\x07\x1B[6nafter");
    await createTerminal;
    await waitForWrites(pty, 2);
    assert.deepStrictEqual({
      clientData,
      ptyWrites: pty.writes
    }, {
      clientData: ["beforemidafter"],
      ptyWrites: ["\x1B[1;7R", "\x1B[1;10R"]
    });
  });
  test("resolves alt-buffer promise from headless terminal data", async () => {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    const pty = new TestPty();
    const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
    const uri = "agenthost-terminal://test/alt-buffer";
    const createTerminal = manager.createTerminal({
      channel: uri,
      claim: { kind: TerminalClaimKind.Client, clientId: "test-client" },
      cwd: process.cwd(),
      cols: 80,
      rows: 24
    }, { shell: "/bin/bash" });
    await pty.dataListenerRegistered.p;
    pty.fireData("prompt");
    await createTerminal;
    const altBufferStore = disposables.add(new DisposableStore());
    const altBufferPromise = manager.createAltBufferPromise(uri, altBufferStore);
    pty.fireData("\x1B[?1049h");
    await altBufferPromise;
  });
  test("disposed alt-buffer promise listener does not resolve", async () => {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    const pty = new TestPty();
    const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
    const uri = "agenthost-terminal://test/alt-buffer-disposed";
    const createTerminal = manager.createTerminal({
      channel: uri,
      claim: { kind: TerminalClaimKind.Client, clientId: "test-client" },
      cwd: process.cwd(),
      cols: 80,
      rows: 24
    }, { shell: "/bin/bash" });
    await pty.dataListenerRegistered.p;
    pty.fireData("prompt");
    await createTerminal;
    const altBufferStore = new DisposableStore();
    const altBufferPromise = manager.createAltBufferPromise(uri, altBufferStore);
    let didEnterAltBuffer = false;
    void altBufferPromise.then(() => didEnterAltBuffer = true);
    altBufferStore.dispose();
    pty.fireData("\x1B[?1049h");
    await timeout(10);
    assert.strictEqual(didEnterAltBuffer, false);
  });
  test("client-suppressed terminal queries are stripped from client-facing data", () => {
    function filter(data) {
      return removeTerminalQueriesSuppressedFromClient(data, { pendingData: "" });
    }
    assert.strictEqual(filter("before \x1B[6n after"), "before  after");
    assert.strictEqual(filter("before \x1B[?6n after"), "before  after");
    assert.strictEqual(filter("before \x1B]10;?\x1B\\ after"), "before  after");
    assert.strictEqual(filter("before \x1B]10;?\x07 after"), "before  after");
    assert.strictEqual(filter("before \x1B]11;?\x1B\\ after"), "before  after");
    assert.strictEqual(filter("before \x1B]11;?\x07 after"), "before  after");
    assert.strictEqual(filter("\x1B[5n\x1B[c\x1B[0c\x1B[>c\x1B[>0c"), "\x1B[5n\x1B[c\x1B[0c\x1B[>c\x1B[>0c");
    assert.strictEqual(filter("\x1B]10;#ffffff\x1B\\\x1B]11;rgb:0000/0000/0000\x07"), "\x1B]10;#ffffff\x1B\\\x1B]11;rgb:0000/0000/0000\x07");
    assert.strictEqual(filter("\x1B]10;?;#ffffff\x1B\\\x1B]12;?\x1B\\\x1B]4;0;?\x1B\\"), "\x1B]10;?;#ffffff\x1B\\\x1B]12;?\x1B\\\x1B]4;0;?\x1B\\");
    assert.strictEqual(filter("normal output\r\n"), "normal output\r\n");
  });
  test("client-suppressed terminal queries are stripped across data chunks", () => {
    let state = { pendingData: "" };
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("before \x1B[", state), "before ");
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("6n after", state), " after");
    state = { pendingData: "" };
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("before \x1B[?", state), "before ");
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("6n after", state), " after");
    state = { pendingData: "" };
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("before \x1B[", state), "before ");
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("K after", state), "\x1B[K after");
    state = { pendingData: "" };
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("before \x1B]10;", state), "before ");
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("?\x1B", state), "");
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("\\ after", state), " after");
    state = { pendingData: "" };
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("before \x1B]11;", state), "before ");
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("?\x07 after", state), " after");
  });
  test("manager data path strips CPR queries while preserving surrounding output", () => {
    const handler = createHandler();
    const cleaned = handler.handlePtyData(`before${osc633("A")}\x1B[6nmid\x1B[?6nafter`);
    assert.strictEqual(cleaned, "beforemidafter");
    assert.deepStrictEqual(handler.content, [{ type: "unclassified", value: "beforemidafter" }]);
    assert.deepStrictEqual(handler.dispatched, [
      { type: ActionType.TerminalData, data: "before" },
      { type: ActionType.TerminalCommandDetectionAvailable },
      { type: ActionType.TerminalData, data: "midafter" }
    ]);
  });
  test("TerminalCommandDetectionAvailable is dispatched on first OSC 633", () => {
    const handler = createHandler();
    handler.handlePtyData(osc633("A"));
    assert.strictEqual(handler.dispatched.length, 1);
    assert.strictEqual(handler.dispatched[0].type, ActionType.TerminalCommandDetectionAvailable);
  });
  test("TerminalCommandDetectionAvailable is dispatched only once", () => {
    const handler = createHandler();
    handler.handlePtyData(osc633("A"));
    handler.handlePtyData(osc633("B"));
    handler.handlePtyData(osc633("A"));
    const detectionActions = handler.dispatched.filter(
      (a) => a.type === ActionType.TerminalCommandDetectionAvailable
    );
    assert.strictEqual(detectionActions.length, 1);
  });
  test("full command lifecycle dispatches correct actions", () => {
    const handler = createHandler();
    handler.handlePtyData(`${osc633("A")}$ ${osc633("B")}`);
    handler.handlePtyData(`${osc633("E;echo\\x20hello;test-nonce")}${osc633("C")}`);
    handler.handlePtyData("hello\r\n");
    handler.handlePtyData(osc633("D;0"));
    const actions = handler.dispatched;
    assert.strictEqual(actions[0].type, ActionType.TerminalCommandDetectionAvailable);
    const executed = actions.find((a) => a.type === ActionType.TerminalCommandExecuted);
    assert.ok(executed);
    assert.strictEqual(executed.commandId, "cmd-1");
    assert.strictEqual(executed.commandLine, "echo hello");
    const finished = actions.find((a) => a.type === ActionType.TerminalCommandFinished);
    assert.ok(finished);
    assert.strictEqual(finished.commandId, "cmd-1");
    assert.strictEqual(finished.exitCode, 0);
  });
  test("content parts are structured correctly after command lifecycle", () => {
    const handler = createHandler();
    handler.handlePtyData(`${osc633("A")}user@host:~ $ ${osc633("B")}`);
    handler.handlePtyData(`${osc633("E;ls;test-nonce")}${osc633("C")}`);
    handler.handlePtyData("file1\nfile2\n");
    handler.handlePtyData(osc633("D;0"));
    handler.handlePtyData(`${osc633("A")}user@host:~ $ `);
    assert.deepStrictEqual(handler.content.map((p) => ({
      type: p.type,
      ...p.type === "unclassified" ? { value: p.value } : {
        commandId: p.commandId,
        commandLine: p.commandLine,
        output: p.output,
        isComplete: p.isComplete,
        exitCode: p.exitCode
      }
    })), [
      { type: "unclassified", value: "user@host:~ $ " },
      {
        type: "command",
        commandId: "cmd-1",
        commandLine: "ls",
        output: "file1\nfile2\n",
        isComplete: true,
        exitCode: 0
      },
      { type: "unclassified", value: "user@host:~ $ " }
    ]);
  });
  test("nonce validation rejects untrusted command lines", () => {
    const handler = createHandler("my-secret-nonce");
    handler.handlePtyData(osc633("E;rm\\x20-rf\\x20/;wrong-nonce"));
    handler.handlePtyData(osc633("C"));
    const executed = handler.dispatched.find((a) => a.type === ActionType.TerminalCommandExecuted);
    assert.ok(executed);
    assert.strictEqual(executed.commandLine, "");
  });
  test("nonce validation accepts trusted command lines", () => {
    const handler = createHandler("my-secret-nonce");
    handler.handlePtyData(osc633("E;echo\\x20safe;my-secret-nonce"));
    handler.handlePtyData(osc633("C"));
    const executed = handler.dispatched.find((a) => a.type === ActionType.TerminalCommandExecuted);
    assert.ok(executed);
    assert.strictEqual(executed.commandLine, "echo safe");
  });
  test("multiple sequential commands get sequential IDs", () => {
    const handler = createHandler();
    handler.handlePtyData(`${osc633("E;cmd1;test-nonce")}${osc633("C")}`);
    handler.handlePtyData(osc633("D;0"));
    handler.handlePtyData(`${osc633("E;cmd2;test-nonce")}${osc633("C")}`);
    handler.handlePtyData(osc633("D;1"));
    const executed = handler.dispatched.filter((a) => a.type === ActionType.TerminalCommandExecuted);
    assert.strictEqual(executed.length, 2);
    assert.strictEqual(executed[0].commandId, "cmd-1");
    assert.strictEqual(executed[0].commandLine, "cmd1");
    assert.strictEqual(executed[1].commandId, "cmd-2");
    assert.strictEqual(executed[1].commandLine, "cmd2");
    const finished = handler.dispatched.filter((a) => a.type === ActionType.TerminalCommandFinished);
    assert.strictEqual(finished.length, 2);
    assert.strictEqual(finished[0].commandId, "cmd-1");
    assert.strictEqual(finished[0].exitCode, 0);
    assert.strictEqual(finished[1].commandId, "cmd-2");
    assert.strictEqual(finished[1].exitCode, 1);
  });
  test("CWD property dispatches TerminalCwdChanged", () => {
    const handler = createHandler();
    handler.handlePtyData(osc633("P;Cwd=/new/working/dir"));
    const cwdAction = handler.dispatched.find((a) => a.type === ActionType.TerminalCwdChanged);
    assert.ok(cwdAction);
    assert.strictEqual(cwdAction.cwd, "/new/working/dir");
    assert.strictEqual(handler.cwd, "/new/working/dir");
  });
  test("OSC 633 sequences are stripped from cleaned output", () => {
    const handler = createHandler();
    const cleaned = handler.handlePtyData(
      `before${osc633("A")}prompt${osc633("B")}${osc633("E;ls;test-nonce")}${osc633("C")}output${osc633("D;0")}after`
    );
    assert.strictEqual(cleaned, "beforepromptoutputafter");
  });
  test("data without shell integration passes through unmodified", () => {
    const handler = new TestTerminalDataHandler("terminal://test", {
      parser: new Osc633Parser(),
      nonce: "nonce",
      commandCounter: 0,
      detectionAvailableEmitted: false
    });
    const data = "regular terminal output with \x1B[31mcolors\x1B[0m";
    const cleaned = handler.handlePtyData(data);
    assert.strictEqual(cleaned, data);
    assert.deepStrictEqual(handler.content, [
      { type: "unclassified", value: data }
    ]);
    assert.deepStrictEqual(handler.dispatched, [
      { type: ActionType.TerminalData, data }
    ]);
  });
  test("CommandFinished without active command is ignored", () => {
    const handler = createHandler();
    handler.handlePtyData(osc633("A"));
    handler.handlePtyData(osc633("D;0"));
    const finished = handler.dispatched.filter((a) => a.type === ActionType.TerminalCommandFinished);
    assert.strictEqual(finished.length, 0);
  });
  test("command output is accumulated in the command content part", () => {
    const handler = createHandler();
    handler.handlePtyData(`${osc633("E;test;test-nonce")}${osc633("C")}`);
    handler.handlePtyData("line1\r\n");
    handler.handlePtyData("line2\r\n");
    handler.handlePtyData("line3\r\n");
    handler.handlePtyData(osc633("D;0"));
    const cmdParts = handler.content.filter((p) => p.type === "command");
    assert.strictEqual(cmdParts.length, 1);
    assert.strictEqual(cmdParts[0].type === "command" && cmdParts[0].output, "line1\r\nline2\r\nline3\r\n");
  });
  test("output and CommandFinished arriving in one PTY read are attributed to the command", async () => {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    const pty = new TestPty();
    const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
    const uri = "agenthost-terminal://test/coalesced-command-finished";
    const createTerminal = manager.createTerminal({
      channel: uri,
      claim: { kind: TerminalClaimKind.Client, clientId: "test-client" },
      cwd: process.cwd(),
      cols: 80,
      rows: 24
    }, { shell: process.platform === "win32" ? "pwsh.exe" : "/bin/bash" });
    await pty.dataListenerRegistered.p;
    pty.fireData(osc633("A"));
    await createTerminal;
    const completions = [];
    disposables.add(manager.onCommandFinished(uri, (event) => completions.push({
      exitCode: event.exitCode,
      output: event.output
    })));
    const dispatched = [];
    disposables.add(stateManager.onDidEmitEnvelope((envelope) => {
      const action = envelope.action;
      if (action.type === ActionType.TerminalCommandExecuted || action.type === ActionType.TerminalCommandFinished) {
        dispatched.push({ type: action.type });
      } else if (action.type === ActionType.TerminalData) {
        dispatched.push({ type: action.type, data: action.data });
      }
    }));
    pty.fireData(`${osc633("C")}hi\r
${osc633("D;0")}`);
    assert.deepStrictEqual(completions, [{ exitCode: 0, output: "hi\r\n" }]);
    assert.deepStrictEqual(dispatched, [
      { type: ActionType.TerminalCommandExecuted },
      { type: ActionType.TerminalData, data: "hi\r\n" },
      { type: ActionType.TerminalCommandFinished }
    ]);
  });
});
suite("AgentHostTerminalManager \u2013 output-only terminals", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  function createManager() {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    const manager = disposables.add(new AgentHostTerminalManager(stateManager, logService, productService, configurationService));
    return { manager, stateManager };
  }
  test("streams appended data, snapshots state with isPty false, and records the exit", () => {
    const { manager, stateManager } = createManager();
    const uri = "agenthost-terminal://shell/copilotNonPtyShells/tc-1";
    const claim = { kind: TerminalClaimKind.Session, session: "agent-session://copilot/s1", toolCallId: "tc-1" };
    const dispatched = [];
    disposables.add(stateManager.onDidEmitEnvelope((envelope) => {
      if (envelope.channel === uri) {
        dispatched.push(envelope.action);
      }
    }));
    manager.createOutputTerminal(uri, { title: "Run Shell Command", claim });
    manager.appendOutputTerminalData(uri, "tick 1\n");
    manager.appendOutputTerminalData(uri, "tick 2\n");
    manager.finalizeOutputTerminal(uri, 0);
    manager.finalizeOutputTerminal(uri, 1);
    assert.deepStrictEqual(manager.getTerminalState(uri), {
      title: "Run Shell Command",
      content: [{ type: "unclassified", value: "tick 1\ntick 2\n" }],
      exitCode: 0,
      claim,
      isPty: false
    });
    assert.deepStrictEqual(dispatched, [
      { type: ActionType.TerminalData, data: "tick 1\n" },
      { type: ActionType.TerminalData, data: "tick 2\n" },
      { type: ActionType.TerminalExited, exitCode: 0 }
    ]);
    assert.strictEqual(manager.hasTerminal(uri), false);
    assert.deepStrictEqual(manager.getTerminalInfos(), []);
  });
  test("reset clears content and dispose removes the channel", () => {
    const { manager, stateManager } = createManager();
    const uri = "agenthost-terminal://shell/copilotNonPtyShells/tc-2";
    const dispatched = [];
    disposables.add(stateManager.onDidEmitEnvelope((envelope) => {
      if (envelope.channel === uri) {
        dispatched.push(envelope.action);
      }
    }));
    manager.createOutputTerminal(uri, { title: "Bash", claim: { kind: TerminalClaimKind.Session, session: "agent-session://copilot/s1" } });
    manager.appendOutputTerminalData(uri, "old output");
    manager.resetOutputTerminal(uri);
    manager.appendOutputTerminalData(uri, "fresh output");
    assert.deepStrictEqual(manager.getTerminalState(uri)?.content, [{ type: "unclassified", value: "fresh output" }]);
    assert.deepStrictEqual(dispatched.map((action) => action.type), [ActionType.TerminalData, ActionType.TerminalCleared, ActionType.TerminalData]);
    manager.disposeTerminal(uri);
    assert.strictEqual(manager.hasTerminal(uri), false);
    assert.strictEqual(manager.getTerminalState(uri), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB0eXBlIHsgSVB0eSwgSVB0eUZvcmtPcHRpb25zLCBJV2luZG93c1B0eUZvcmtPcHRpb25zIH0gZnJvbSAnbm9kZS1wdHknO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgU3RhdGVBY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENsYWltS2luZCwgVGVybWluYWxDb250ZW50UGFydCwgdHlwZSBUZXJtaW5hbENsYWltIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLCBmb3JtYXRUZXJtaW5hbFRleHQsIHJlbW92ZVRlcm1pbmFsUXVlcmllc1N1cHByZXNzZWRGcm9tQ2xpZW50LCB0eXBlIElUZXJtaW5hbFF1ZXJ5RmlsdGVyU3RhdGUgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFRlcm1pbmFsTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBPc2M2MzNFdmVudCwgT3NjNjMzRXZlbnRUeXBlLCBPc2M2MzNQYXJzZXIgfSBmcm9tICcuLi8uLi9ub2RlL29zYzYzM1BhcnNlci5qcyc7XG5cbi8qKlxuICogVGVzdHMgZm9yIHRoZSBjb21tYW5kIGRldGVjdGlvbiBpbnRlZ3JhdGlvbiBpbiBBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIuXG4gKlxuICogU2luY2UgQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLmNyZWF0ZVRlcm1pbmFsIHJlcXVpcmVzIG5vZGUtcHR5LCB0aGVzZSB0ZXN0c1xuICogZXhlcmNpc2UgdGhlIGRhdGEtaGFuZGxpbmcgbG9naWMgKE9TQyBwYXJzaW5nIFx1MjE5MiBhY3Rpb24gZGlzcGF0Y2ggXHUyMTkyIGNvbnRlbnRcbiAqIHRyYWNraW5nKSBpbiBpc29sYXRpb24gYnkgc2ltdWxhdGluZyB0aGUgaW50ZXJuYWwgZmxvdy5cbiAqL1xuXG4vLyBcdTI1MDBcdTI1MDAgSGVscGVycyB0byBzaW11bGF0ZSB0aGUgdGVybWluYWwgbWFuYWdlcidzIGRhdGEgcGlwZWxpbmUgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbi8qKiBNaW5pbWFsIGNvbW1hbmQgdHJhY2tlciBtaXJyb3JpbmcgQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyJ3MgSUNvbW1hbmRUcmFja2VyLiAqL1xuaW50ZXJmYWNlIElUZXN0Q29tbWFuZFRyYWNrZXIge1xuXHRyZWFkb25seSBwYXJzZXI6IE9zYzYzM1BhcnNlcjtcblx0cmVhZG9ubHkgbm9uY2U6IHN0cmluZztcblx0Y29tbWFuZENvdW50ZXI6IG51bWJlcjtcblx0ZGV0ZWN0aW9uQXZhaWxhYmxlRW1pdHRlZDogYm9vbGVhbjtcblx0cGVuZGluZ0NvbW1hbmRMaW5lPzogc3RyaW5nO1xuXHRhY3RpdmVDb21tYW5kSWQ/OiBzdHJpbmc7XG5cdGFjdGl2ZUNvbW1hbmRUaW1lc3RhbXA/OiBudW1iZXI7XG59XG5cbi8qKlxuICogU2ltcGxpZmllZCB2ZXJzaW9uIG9mIEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcidzIGRhdGEgaGFuZGxpbmcgcGlwZWxpbmVcbiAqIHRoYXQgY2FuIGJlIHRlc3RlZCB3aXRob3V0IG5vZGUtcHR5IG9yIGEgcmVhbCBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIuXG4gKi9cbmNsYXNzIFRlc3RUZXJtaW5hbERhdGFIYW5kbGVyIHtcblx0cmVhZG9ubHkgZGlzcGF0Y2hlZDogU3RhdGVBY3Rpb25bXSA9IFtdO1xuXHRjb250ZW50OiBUZXJtaW5hbENvbnRlbnRQYXJ0W10gPSBbXTtcblx0Y3dkID0gJy9ob21lL3VzZXInO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFF1ZXJ5RmlsdGVyU3RhdGU6IElUZXJtaW5hbFF1ZXJ5RmlsdGVyU3RhdGUgPSB7IHBlbmRpbmdEYXRhOiAnJyB9O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHVyaTogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IHRyYWNrZXI6IElUZXN0Q29tbWFuZFRyYWNrZXIsXG5cdCkgeyB9XG5cblx0LyoqIFNpbXVsYXRlcyBBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIuX2hhbmRsZVB0eURhdGEgKi9cblx0aGFuZGxlUHR5RGF0YShyYXdEYXRhOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGxldCBjbGVhbmVkRm9yQ2xpZW50ID0gJyc7XG5cblx0XHQvLyBEYXRhIGlzIGRpc3BhdGNoZWQgaW4gc3RyZWFtIG9yZGVyIHJlbGF0aXZlIHRvIGNvbW1hbmQgZXZlbnRzOiBmbHVzaFxuXHRcdC8vIHBlbmRpbmcgZGF0YSBiZWZvcmUgaGFuZGxpbmcgZWFjaCBldmVudCBzbyBzdWJzY3JpYmVycyBvYnNlcnZlXG5cdFx0Ly8gQ29tbWFuZEV4ZWN1dGVkIC0+IGRhdGEgLT4gQ29tbWFuZEZpbmlzaGVkIGV4YWN0bHkgbGlrZSB0aGUgcmF3XG5cdFx0Ly8gc3RyZWFtIFx1MjAxNCBzZWUgX2hhbmRsZVB0eURhdGEuXG5cdFx0bGV0IHBlbmRpbmdDbGllbnREYXRhID0gJyc7XG5cdFx0Y29uc3QgZmx1c2hDbGllbnREYXRhID0gKCk6IHZvaWQgPT4ge1xuXHRcdFx0aWYgKHBlbmRpbmdDbGllbnREYXRhLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRpc3BhdGNoZWQucHVzaCh7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxEYXRhLFxuXHRcdFx0XHRkYXRhOiBwZW5kaW5nQ2xpZW50RGF0YSxcblx0XHRcdH0pO1xuXHRcdFx0Y2xlYW5lZEZvckNsaWVudCArPSBwZW5kaW5nQ2xpZW50RGF0YTtcblx0XHRcdHBlbmRpbmdDbGllbnREYXRhID0gJyc7XG5cdFx0fTtcblxuXHRcdGZvciAoY29uc3Qgc2VnbWVudCBvZiB0aGlzLnRyYWNrZXIucGFyc2VyLnBhcnNlU2VnbWVudHMocmF3RGF0YSkpIHtcblx0XHRcdGlmIChzZWdtZW50LmtpbmQgPT09ICdldmVudCcpIHtcblx0XHRcdFx0Zmx1c2hDbGllbnREYXRhKCk7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZU9zYzYzM0V2ZW50KHNlZ21lbnQuZXZlbnQpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2xlYW5lZERhdGEgPSByZW1vdmVUZXJtaW5hbFF1ZXJpZXNTdXBwcmVzc2VkRnJvbUNsaWVudChzZWdtZW50LmRhdGEsIHRoaXMuX3Rlcm1pbmFsUXVlcnlGaWx0ZXJTdGF0ZSk7XG5cdFx0XHRpZiAoY2xlYW5lZERhdGEubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9hcHBlbmRUb0NvbnRlbnQoY2xlYW5lZERhdGEpO1xuXHRcdFx0XHRwZW5kaW5nQ2xpZW50RGF0YSArPSBjbGVhbmVkRGF0YTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmbHVzaENsaWVudERhdGEoKTtcblxuXHRcdHJldHVybiBjbGVhbmVkRm9yQ2xpZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlT3NjNjMzRXZlbnQoZXZlbnQ6IE9zYzYzM0V2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnRyYWNrZXIuZGV0ZWN0aW9uQXZhaWxhYmxlRW1pdHRlZCkge1xuXHRcdFx0dGhpcy50cmFja2VyLmRldGVjdGlvbkF2YWlsYWJsZUVtaXR0ZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5kaXNwYXRjaGVkLnB1c2goe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZERldGVjdGlvbkF2YWlsYWJsZSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAoZXZlbnQudHlwZSkge1xuXHRcdFx0Y2FzZSBPc2M2MzNFdmVudFR5cGUuQ29tbWFuZExpbmU6IHtcblx0XHRcdFx0aWYgKGV2ZW50Lm5vbmNlID09PSB0aGlzLnRyYWNrZXIubm9uY2UpIHtcblx0XHRcdFx0XHR0aGlzLnRyYWNrZXIucGVuZGluZ0NvbW1hbmRMaW5lID0gZXZlbnQuY29tbWFuZExpbmU7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIE9zYzYzM0V2ZW50VHlwZS5Db21tYW5kRXhlY3V0ZWQ6IHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZElkID0gYGNtZC0keysrdGhpcy50cmFja2VyLmNvbW1hbmRDb3VudGVyfWA7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gdGhpcy50cmFja2VyLnBlbmRpbmdDb21tYW5kTGluZSA/PyAnJztcblx0XHRcdFx0Y29uc3QgdGltZXN0YW1wID0gRGF0ZS5ub3coKTtcblx0XHRcdFx0dGhpcy50cmFja2VyLnBlbmRpbmdDb21tYW5kTGluZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy50cmFja2VyLmFjdGl2ZUNvbW1hbmRJZCA9IGNvbW1hbmRJZDtcblx0XHRcdFx0dGhpcy50cmFja2VyLmFjdGl2ZUNvbW1hbmRUaW1lc3RhbXAgPSB0aW1lc3RhbXA7XG5cblx0XHRcdFx0dGhpcy5jb250ZW50LnB1c2goe1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kSWQsXG5cdFx0XHRcdFx0Y29tbWFuZExpbmUsXG5cdFx0XHRcdFx0b3V0cHV0OiAnJyxcblx0XHRcdFx0XHR0aW1lc3RhbXAsXG5cdFx0XHRcdFx0aXNDb21wbGV0ZTogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRoaXMuZGlzcGF0Y2hlZC5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZEV4ZWN1dGVkLFxuXHRcdFx0XHRcdGNvbW1hbmRJZCxcblx0XHRcdFx0XHRjb21tYW5kTGluZSxcblx0XHRcdFx0XHR0aW1lc3RhbXAsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgT3NjNjMzRXZlbnRUeXBlLkNvbW1hbmRGaW5pc2hlZDoge1xuXHRcdFx0XHRjb25zdCBmaW5pc2hlZENvbW1hbmRJZCA9IHRoaXMudHJhY2tlci5hY3RpdmVDb21tYW5kSWQ7XG5cdFx0XHRcdGlmICghZmluaXNoZWRDb21tYW5kSWQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBkdXJhdGlvbk1zID0gdGhpcy50cmFja2VyLmFjdGl2ZUNvbW1hbmRUaW1lc3RhbXAgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdD8gRGF0ZS5ub3coKSAtIHRoaXMudHJhY2tlci5hY3RpdmVDb21tYW5kVGltZXN0YW1wXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHRoaXMuY29udGVudCkge1xuXHRcdFx0XHRcdGlmIChwYXJ0LnR5cGUgPT09ICdjb21tYW5kJyAmJiBwYXJ0LmNvbW1hbmRJZCA9PT0gZmluaXNoZWRDb21tYW5kSWQpIHtcblx0XHRcdFx0XHRcdHBhcnQuaXNDb21wbGV0ZSA9IHRydWU7XG5cdFx0XHRcdFx0XHRwYXJ0LmV4aXRDb2RlID0gZXZlbnQuZXhpdENvZGU7XG5cdFx0XHRcdFx0XHRwYXJ0LmR1cmF0aW9uTXMgPSBkdXJhdGlvbk1zO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy50cmFja2VyLmFjdGl2ZUNvbW1hbmRJZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy50cmFja2VyLmFjdGl2ZUNvbW1hbmRUaW1lc3RhbXAgPSB1bmRlZmluZWQ7XG5cblx0XHRcdFx0dGhpcy5kaXNwYXRjaGVkLnB1c2goe1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRmluaXNoZWQsXG5cdFx0XHRcdFx0Y29tbWFuZElkOiBmaW5pc2hlZENvbW1hbmRJZCxcblx0XHRcdFx0XHRleGl0Q29kZTogZXZlbnQuZXhpdENvZGUsXG5cdFx0XHRcdFx0ZHVyYXRpb25Ncyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBPc2M2MzNFdmVudFR5cGUuUHJvcGVydHk6IHtcblx0XHRcdFx0aWYgKGV2ZW50LmtleSA9PT0gJ0N3ZCcpIHtcblx0XHRcdFx0XHR0aGlzLmN3ZCA9IGV2ZW50LnZhbHVlO1xuXHRcdFx0XHRcdHRoaXMuZGlzcGF0Y2hlZC5wdXNoKHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxDd2RDaGFuZ2VkLFxuXHRcdFx0XHRcdFx0Y3dkOiBldmVudC52YWx1ZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hcHBlbmRUb0NvbnRlbnQoZGF0YTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdGFpbCA9IHRoaXMuY29udGVudC5sZW5ndGggPiAwID8gdGhpcy5jb250ZW50W3RoaXMuY29udGVudC5sZW5ndGggLSAxXSA6IHVuZGVmaW5lZDtcblx0XHRpZiAodGFpbCAmJiB0YWlsLnR5cGUgPT09ICdjb21tYW5kJyAmJiAhdGFpbC5pc0NvbXBsZXRlKSB7XG5cdFx0XHR0YWlsLm91dHB1dCArPSBkYXRhO1xuXHRcdH0gZWxzZSBpZiAodGFpbCAmJiB0YWlsLnR5cGUgPT09ICd1bmNsYXNzaWZpZWQnKSB7XG5cdFx0XHR0YWlsLnZhbHVlICs9IGRhdGE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY29udGVudC5wdXNoKHsgdHlwZTogJ3VuY2xhc3NpZmllZCcsIHZhbHVlOiBkYXRhIH0pO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBUZXN0UHR5IGltcGxlbWVudHMgSVB0eSB7XG5cdHJlYWRvbmx5IHBpZCA9IDE7XG5cdGNvbHMgPSA4MDtcblx0cm93cyA9IDI0O1xuXHRwcm9jZXNzID0gJ3Rlc3Qtc2hlbGwnO1xuXHRoYW5kbGVGbG93Q29udHJvbCA9IGZhbHNlO1xuXHRyZWFkb25seSB3cml0ZXM6IHN0cmluZ1tdID0gW107XG5cdHJlYWRvbmx5IGRhdGFMaXN0ZW5lclJlZ2lzdGVyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EYXRhID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXHRyZWFkb25seSBvbkRhdGE6IElQdHlbJ29uRGF0YSddID0gbGlzdGVuZXIgPT4ge1xuXHRcdHRoaXMuZGF0YUxpc3RlbmVyUmVnaXN0ZXJlZC5jb21wbGV0ZSgpO1xuXHRcdHJldHVybiB0aGlzLl9vbkRhdGEuZXZlbnQoZGF0YSA9PiBsaXN0ZW5lcihkYXRhKSk7XG5cdH07XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25FeGl0ID0gbmV3IEVtaXR0ZXI8eyBleGl0Q29kZTogbnVtYmVyOyBzaWduYWw/OiBudW1iZXIgfT4oKTtcblx0cmVhZG9ubHkgb25FeGl0OiBJUHR5WydvbkV4aXQnXSA9IGxpc3RlbmVyID0+IHRoaXMuX29uRXhpdC5ldmVudChkYXRhID0+IGxpc3RlbmVyKGRhdGEpKTtcblxuXHRmaXJlRGF0YShkYXRhOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRhdGEuZmlyZShkYXRhKTtcblx0fVxuXG5cdHJlc2l6ZShjb2x1bW5zOiBudW1iZXIsIHJvd3M6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuY29scyA9IGNvbHVtbnM7XG5cdFx0dGhpcy5yb3dzID0gcm93cztcblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQgeyB9XG5cblx0d3JpdGUoZGF0YTogc3RyaW5nIHwgQnVmZmVyKTogdm9pZCB7XG5cdFx0dGhpcy53cml0ZXMucHVzaCh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycgPyBkYXRhIDogZGF0YS50b1N0cmluZygpKTtcblx0fVxuXG5cdGtpbGwoKTogdm9pZCB7IH1cblx0cGF1c2UoKTogdm9pZCB7IH1cblx0cmVzdW1lKCk6IHZvaWQgeyB9XG59XG5cbmNsYXNzIFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIgZXh0ZW5kcyBBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIge1xuXHRzcGF3bk9wdGlvbnM6IElQdHlGb3JrT3B0aW9ucyB8IElXaW5kb3dzUHR5Rm9ya09wdGlvbnMgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0c3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsXG5cdFx0bG9nU2VydmljZTogTnVsbExvZ1NlcnZpY2UsXG5cdFx0cHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRjb25maWd1cmF0aW9uU2VydmljZTogQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wdHk6IFRlc3RQdHksXG5cdCkge1xuXHRcdHN1cGVyKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfc3Bhd25QdHkoX2ZpbGU6IHN0cmluZywgX2FyZ3M6IHN0cmluZ1tdLCBvcHRpb25zOiBJUHR5Rm9ya09wdGlvbnMgfCBJV2luZG93c1B0eUZvcmtPcHRpb25zKTogUHJvbWlzZTxJUHR5PiB7XG5cdFx0dGhpcy5zcGF3bk9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdHRoaXMuX3B0eS5jb2xzID0gb3B0aW9ucy5jb2xzID8/IHRoaXMuX3B0eS5jb2xzO1xuXHRcdHRoaXMuX3B0eS5yb3dzID0gb3B0aW9ucy5yb3dzID8/IHRoaXMuX3B0eS5yb3dzO1xuXHRcdHJldHVybiB0aGlzLl9wdHk7XG5cdH1cbn1cblxuZnVuY3Rpb24gb3NjNjMzKHBheWxvYWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBgXFx4MWJdNjMzOyR7cGF5bG9hZH1cXHgwN2A7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUhhbmRsZXIobm9uY2UgPSAndGVzdC1ub25jZScpOiBUZXN0VGVybWluYWxEYXRhSGFuZGxlciB7XG5cdHJldHVybiBuZXcgVGVzdFRlcm1pbmFsRGF0YUhhbmRsZXIoJ3Rlcm1pbmFsOi8vdGVzdCcsIHtcblx0XHRwYXJzZXI6IG5ldyBPc2M2MzNQYXJzZXIoKSxcblx0XHRub25jZSxcblx0XHRjb21tYW5kQ291bnRlcjogMCxcblx0XHRkZXRlY3Rpb25BdmFpbGFibGVFbWl0dGVkOiBmYWxzZSxcblx0fSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JXcml0ZXMocHR5OiBUZXN0UHR5LCBjb3VudDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgMjA7IGkrKykge1xuXHRcdGlmIChwdHkud3JpdGVzLmxlbmd0aCA+PSBjb3VudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0fVxufVxuXG5zdWl0ZSgnQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyIFx1MjAxMyBjb21tYW5kIGRldGVjdGlvbiBpbnRlZ3JhdGlvbicsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2Zvcm1hdHMgY29tbWFuZCBpbnB1dCB3aXRoIHRlcm1pbmFsIGVudGVyIHNlbWFudGljcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0VGVybWluYWxUZXh0KCdlY2hvIGZpcnN0XFxuZWNobyBzZWNvbmQnLCB7IHNob3VsZEV4ZWN1dGU6IHRydWUgfSksICdlY2hvIGZpcnN0XFxyZWNobyBzZWNvbmRcXHInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0VGVybWluYWxUZXh0KCdlY2hvIGZpcnN0XFxyXFxuZWNobyBzZWNvbmQnLCB7IHNob3VsZEV4ZWN1dGU6IHRydWUgfSksICdlY2hvIGZpcnN0XFxyZWNobyBzZWNvbmRcXHInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0VGVybWluYWxUZXh0KCdlY2hvIGZpcnN0XFxyJywgeyBzaG91bGRFeGVjdXRlOiB0cnVlIH0pLCAnZWNobyBmaXJzdFxccicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRUZXJtaW5hbFRleHQoJ2Fuc3dlclxcbicsIHsgc2hvdWxkRXhlY3V0ZTogZmFsc2UgfSksICdhbnN3ZXJcXHInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0VGVybWluYWxUZXh0KCcvdG1wL2Zvb1xcbnB3ZCcsIHsgc2hvdWxkRXhlY3V0ZTogdHJ1ZSB9KSwgJy90bXAvZm9vXFxycHdkXFxyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdFRlcm1pbmFsVGV4dCgnZWNobyBmaXJzdFxcbmVjaG8gc2Vjb25kJywgeyBzaG91bGRFeGVjdXRlOiB0cnVlLCBmb3JjZUJyYWNrZXRlZFBhc3RlTW9kZTogdHJ1ZSB9KSwgJ1xceDFiWzIwMH5lY2hvIGZpcnN0XFxyZWNobyBzZWNvbmRcXHgxYlsyMDF+XFxyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdFRlcm1pbmFsVGV4dCgnYW5zd2VyXFxuJywgeyBzaG91bGRFeGVjdXRlOiBmYWxzZSwgZm9yY2VCcmFja2V0ZWRQYXN0ZU1vZGU6IHRydWUgfSksICdcXHgxYlsyMDB+YW5zd2VyXFxyXFx4MWJbMjAxficpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZXMgZm9ybWF0dGVkIGNvbW1hbmQgaW5wdXQgdG8gdGhlIFBUWScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0geyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGFwcGxpY2F0aW9uTmFtZTogJ3ZzY29kZScgfSBhcyBJUHJvZHVjdFNlcnZpY2U7XG5cdFx0Y29uc3QgcHR5ID0gbmV3IFRlc3RQdHkoKTtcblx0XHRjb25zdCBtYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBwdHkpKTtcblxuXHRcdGNvbnN0IGNyZWF0ZVRlcm1pbmFsID0gbWFuYWdlci5jcmVhdGVUZXJtaW5hbCh7XG5cdFx0XHRjaGFubmVsOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vdGVzdC9jb21tYW5kLWlucHV0Jyxcblx0XHRcdGNsYWltOiB7IGtpbmQ6IFRlcm1pbmFsQ2xhaW1LaW5kLkNsaWVudCwgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcgfSxcblx0XHRcdGN3ZDogcHJvY2Vzcy5jd2QoKSxcblx0XHRcdGNvbHM6IDgwLFxuXHRcdFx0cm93czogMjQsXG5cdFx0fSwgeyBzaGVsbDogJy9iaW4vYmFzaCcgfSk7XG5cblx0XHRhd2FpdCBwdHkuZGF0YUxpc3RlbmVyUmVnaXN0ZXJlZC5wO1xuXHRcdHB0eS5maXJlRGF0YSgncHJvbXB0Jyk7XG5cdFx0YXdhaXQgY3JlYXRlVGVybWluYWw7XG5cblx0XHRhd2FpdCBtYW5hZ2VyLnNlbmRUZXh0KCdhZ2VudGhvc3QtdGVybWluYWw6Ly90ZXN0L2NvbW1hbmQtaW5wdXQnLCAnZWNobyBmaXJzdFxcbmVjaG8gc2Vjb25kJywgeyBzaG91bGRFeGVjdXRlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwdHkud3JpdGVzLCBbJ2VjaG8gZmlyc3RcXHJlY2hvIHNlY29uZFxcciddKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVzIGJyYWNrZXRlZCBwYXN0ZSBjb21tYW5kIGlucHV0IHdoZW4gZW5hYmxlZCBieSB0aGUgdGVybWluYWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBwcm9kdWN0U2VydmljZSA9IHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBhcHBsaWNhdGlvbk5hbWU6ICd2c2NvZGUnIH0gYXMgSVByb2R1Y3RTZXJ2aWNlO1xuXHRcdGNvbnN0IHB0eSA9IG5ldyBUZXN0UHR5KCk7XG5cdFx0Y29uc3QgbWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcihzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgcHR5KSk7XG5cblx0XHRjb25zdCBjcmVhdGVUZXJtaW5hbCA9IG1hbmFnZXIuY3JlYXRlVGVybWluYWwoe1xuXHRcdFx0Y2hhbm5lbDogJ2FnZW50aG9zdC10ZXJtaW5hbDovL3Rlc3QvYnJhY2tldGVkLXBhc3RlJyxcblx0XHRcdGNsYWltOiB7IGtpbmQ6IFRlcm1pbmFsQ2xhaW1LaW5kLkNsaWVudCwgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcgfSxcblx0XHRcdGN3ZDogcHJvY2Vzcy5jd2QoKSxcblx0XHRcdGNvbHM6IDgwLFxuXHRcdFx0cm93czogMjQsXG5cdFx0fSwgeyBzaGVsbDogJy9iaW4vYmFzaCcgfSk7XG5cblx0XHRhd2FpdCBwdHkuZGF0YUxpc3RlbmVyUmVnaXN0ZXJlZC5wO1xuXHRcdHB0eS5maXJlRGF0YSgnXFx4MWJbPzIwMDRoJyk7XG5cdFx0YXdhaXQgY3JlYXRlVGVybWluYWw7XG5cblx0XHRhd2FpdCBtYW5hZ2VyLnNlbmRUZXh0KCdhZ2VudGhvc3QtdGVybWluYWw6Ly90ZXN0L2JyYWNrZXRlZC1wYXN0ZScsICdlY2hvIGZpcnN0XFxuZWNobyBzZWNvbmQnLCB7IHNob3VsZEV4ZWN1dGU6IHRydWUsIGJyYWNrZXRlZFBhc3RlTW9kZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHR5LndyaXRlcywgWydcXHgxYlsyMDB+ZWNobyBmaXJzdFxccmVjaG8gc2Vjb25kXFx4MWJbMjAxflxcciddKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgd3JpdGUgYnJhY2tldGVkIHBhc3RlIGNvbW1hbmQgaW5wdXQgd2hlbiBkaXNhYmxlZCBieSB0aGUgdGVybWluYWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBwcm9kdWN0U2VydmljZSA9IHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBhcHBsaWNhdGlvbk5hbWU6ICd2c2NvZGUnIH0gYXMgSVByb2R1Y3RTZXJ2aWNlO1xuXHRcdGNvbnN0IHB0eSA9IG5ldyBUZXN0UHR5KCk7XG5cdFx0Y29uc3QgbWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcihzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgcHR5KSk7XG5cblx0XHRjb25zdCBjcmVhdGVUZXJtaW5hbCA9IG1hbmFnZXIuY3JlYXRlVGVybWluYWwoe1xuXHRcdFx0Y2hhbm5lbDogJ2FnZW50aG9zdC10ZXJtaW5hbDovL3Rlc3QvYnJhY2tldGVkLXBhc3RlLWRpc2FibGVkJyxcblx0XHRcdGNsYWltOiB7IGtpbmQ6IFRlcm1pbmFsQ2xhaW1LaW5kLkNsaWVudCwgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcgfSxcblx0XHRcdGN3ZDogcHJvY2Vzcy5jd2QoKSxcblx0XHRcdGNvbHM6IDgwLFxuXHRcdFx0cm93czogMjQsXG5cdFx0fSwgeyBzaGVsbDogJy9iaW4vYmFzaCcgfSk7XG5cblx0XHRhd2FpdCBwdHkuZGF0YUxpc3RlbmVyUmVnaXN0ZXJlZC5wO1xuXHRcdHB0eS5maXJlRGF0YSgncHJvbXB0Jyk7XG5cdFx0YXdhaXQgY3JlYXRlVGVybWluYWw7XG5cblx0XHRhd2FpdCBtYW5hZ2VyLnNlbmRUZXh0KCdhZ2VudGhvc3QtdGVybWluYWw6Ly90ZXN0L2JyYWNrZXRlZC1wYXN0ZS1kaXNhYmxlZCcsICdlY2hvIGZpcnN0XFxuZWNobyBzZWNvbmQnLCB7IHNob3VsZEV4ZWN1dGU6IHRydWUsIGJyYWNrZXRlZFBhc3RlTW9kZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHR5LndyaXRlcywgWydlY2hvIGZpcnN0XFxyZWNobyBzZWNvbmRcXHInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldHMgenNoIGFnZW50IGZpeHVwcyBvbmx5IGZvciBzZXNzaW9uIHpzaCB0ZXJtaW5hbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBwcm9kdWN0U2VydmljZSA9IHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBhcHBsaWNhdGlvbk5hbWU6ICd2c2NvZGUnIH0gYXMgSVByb2R1Y3RTZXJ2aWNlO1xuXG5cdFx0YXN5bmMgZnVuY3Rpb24gY3JlYXRlVGVzdFRlcm1pbmFsKFxuXHRcdFx0aWQ6IHN0cmluZyxcblx0XHRcdHNoZWxsOiBzdHJpbmcsXG5cdFx0XHRjbGFpbTogVGVybWluYWxDbGFpbSxcblx0XHRcdG9wdGlvbnM/OiB7IHByZXZlbnRTaGVsbEhpc3Rvcnk/OiBib29sZWFuOyBub25JbnRlcmFjdGl2ZT86IGJvb2xlYW4gfVxuXHRcdCk6IFByb21pc2U8VGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcj4ge1xuXHRcdFx0Y29uc3QgcHR5ID0gbmV3IFRlc3RQdHkoKTtcblx0XHRcdGNvbnN0IG1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHB0eSkpO1xuXHRcdFx0Y29uc3QgY3JlYXRlVGVybWluYWwgPSBtYW5hZ2VyLmNyZWF0ZVRlcm1pbmFsKHtcblx0XHRcdFx0Y2hhbm5lbDogYGFnZW50aG9zdC10ZXJtaW5hbDovL3Rlc3QvJHtpZH1gLFxuXHRcdFx0XHRjbGFpbSxcblx0XHRcdFx0Y3dkOiBwcm9jZXNzLmN3ZCgpLFxuXHRcdFx0XHRjb2xzOiA4MCxcblx0XHRcdFx0cm93czogMjQsXG5cdFx0XHR9LCB7IHNoZWxsLCAuLi5vcHRpb25zIH0pO1xuXHRcdFx0YXdhaXQgcHR5LmRhdGFMaXN0ZW5lclJlZ2lzdGVyZWQucDtcblx0XHRcdHB0eS5maXJlRGF0YSgncHJvbXB0Jyk7XG5cdFx0XHRhd2FpdCBjcmVhdGVUZXJtaW5hbDtcblx0XHRcdHJldHVybiBtYW5hZ2VyO1xuXHRcdH1cblxuXHRcdGNvbnN0IHpzaFNlc3Npb25NYW5hZ2VyID0gYXdhaXQgY3JlYXRlVGVzdFRlcm1pbmFsKCd6c2gtc2Vzc2lvbi1maXh1cHMnLCAnL2Jpbi96c2gnLCB7XG5cdFx0XHRraW5kOiBUZXJtaW5hbENsYWltS2luZC5TZXNzaW9uLFxuXHRcdFx0c2Vzc2lvbjogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0fSwgeyBwcmV2ZW50U2hlbGxIaXN0b3J5OiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh6c2hTZXNzaW9uTWFuYWdlci5zcGF3bk9wdGlvbnM/LmVudj8uVlNDT0RFX0FHRU5UX1pTSF9GSVhVUFMsICcxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHpzaFNlc3Npb25NYW5hZ2VyLnNwYXduT3B0aW9ucz8uZW52Py5WU0NPREVfUFJFVkVOVF9TSEVMTF9ISVNUT1JZLCAnMScpO1xuXG5cdFx0Y29uc3QgenNoQ2xpZW50TWFuYWdlciA9IGF3YWl0IGNyZWF0ZVRlc3RUZXJtaW5hbCgnenNoLWNsaWVudCcsICcvYmluL3pzaCcsIHtcblx0XHRcdGtpbmQ6IFRlcm1pbmFsQ2xhaW1LaW5kLkNsaWVudCxcblx0XHRcdGNsaWVudElkOiAndGVzdC1jbGllbnQnLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh6c2hDbGllbnRNYW5hZ2VyLnNwYXduT3B0aW9ucz8uZW52Py5WU0NPREVfQUdFTlRfWlNIX0ZJWFVQUywgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IGJhc2hTZXNzaW9uTWFuYWdlciA9IGF3YWl0IGNyZWF0ZVRlc3RUZXJtaW5hbCgnYmFzaC1zZXNzaW9uLWhpc3RvcnknLCAnL2Jpbi9iYXNoJywge1xuXHRcdFx0a2luZDogVGVybWluYWxDbGFpbUtpbmQuU2Vzc2lvbixcblx0XHRcdHNlc3Npb246ICdjb3BpbG90Oi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTInLFxuXHRcdH0sIHsgcHJldmVudFNoZWxsSGlzdG9yeTogdHJ1ZSwgbm9uSW50ZXJhY3RpdmU6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhc2hTZXNzaW9uTWFuYWdlci5zcGF3bk9wdGlvbnM/LmVudj8uVlNDT0RFX0FHRU5UX1pTSF9GSVhVUFMsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhc2hTZXNzaW9uTWFuYWdlci5zcGF3bk9wdGlvbnM/LmVudj8uVlNDT0RFX1BSRVZFTlRfU0hFTExfSElTVE9SWSwgJzEnKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVzIGhlYWRsZXNzIERTUiByZXNwb25zZXMgYmFjayB0byB0aGUgUFRZJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgYXBwbGljYXRpb25OYW1lOiAndnNjb2RlJyB9IGFzIElQcm9kdWN0U2VydmljZTtcblx0XHRjb25zdCBwdHkgPSBuZXcgVGVzdFB0eSgpO1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHB0eSkpO1xuXG5cdFx0Y29uc3QgY3JlYXRlVGVybWluYWwgPSBtYW5hZ2VyLmNyZWF0ZVRlcm1pbmFsKHtcblx0XHRcdGNoYW5uZWw6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly90ZXN0L2RzcicsXG5cdFx0XHRjbGFpbTogeyBraW5kOiBUZXJtaW5hbENsYWltS2luZC5DbGllbnQsIGNsaWVudElkOiAndGVzdC1jbGllbnQnIH0sXG5cdFx0XHRjd2Q6IHByb2Nlc3MuY3dkKCksXG5cdFx0XHRjb2xzOiA4MCxcblx0XHRcdHJvd3M6IDI0LFxuXHRcdH0sIHsgc2hlbGw6ICcvYmluL2Jhc2gnIH0pO1xuXG5cdFx0YXdhaXQgcHR5LmRhdGFMaXN0ZW5lclJlZ2lzdGVyZWQucDtcblx0XHRwdHkuZmlyZURhdGEoJ2FiY1xceDFiWzZuJyk7XG5cdFx0YXdhaXQgY3JlYXRlVGVybWluYWw7XG5cdFx0YXdhaXQgd2FpdEZvcldyaXRlcyhwdHksIDEpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwdHkud3JpdGVzLCBbJ1xceDFiWzE7NFInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N3YWxsb3dzIE9TQyBjb2xvciBxdWVyaWVzIHdoaWxlIHByZXNlcnZpbmcgaGVhZGxlc3MgQ1BSIHJlc3BvbnNlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0geyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGFwcGxpY2F0aW9uTmFtZTogJ3ZzY29kZScgfSBhcyBJUHJvZHVjdFNlcnZpY2U7XG5cdFx0Y29uc3QgcHR5ID0gbmV3IFRlc3RQdHkoKTtcblx0XHRjb25zdCBtYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBwdHkpKTtcblx0XHRjb25zdCB1cmkgPSAnYWdlbnRob3N0LXRlcm1pbmFsOi8vdGVzdC9jb2xvci1xdWVyeSc7XG5cdFx0Y29uc3QgY2xpZW50RGF0YTogc3RyaW5nW10gPSBbXTtcblxuXHRcdGNvbnN0IGNyZWF0ZVRlcm1pbmFsID0gbWFuYWdlci5jcmVhdGVUZXJtaW5hbCh7XG5cdFx0XHRjaGFubmVsOiB1cmksXG5cdFx0XHRjbGFpbTogeyBraW5kOiBUZXJtaW5hbENsYWltS2luZC5DbGllbnQsIGNsaWVudElkOiAndGVzdC1jbGllbnQnIH0sXG5cdFx0XHRjd2Q6IHByb2Nlc3MuY3dkKCksXG5cdFx0XHRjb2xzOiA4MCxcblx0XHRcdHJvd3M6IDI0LFxuXHRcdH0sIHsgc2hlbGw6ICcvYmluL2Jhc2gnIH0pO1xuXG5cdFx0YXdhaXQgcHR5LmRhdGFMaXN0ZW5lclJlZ2lzdGVyZWQucDtcblx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRhdGEodXJpLCBkYXRhID0+IGNsaWVudERhdGEucHVzaChkYXRhKSkpO1xuXHRcdHB0eS5maXJlRGF0YSgnYmVmb3JlXFx4MWJdMTA7P1xceDFiXFxcXFxceDFiWzZubWlkXFx4MWJdMTE7P1xceDA3XFx4MWJbNm5hZnRlcicpO1xuXHRcdGF3YWl0IGNyZWF0ZVRlcm1pbmFsO1xuXHRcdGF3YWl0IHdhaXRGb3JXcml0ZXMocHR5LCAyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2xpZW50RGF0YSxcblx0XHRcdHB0eVdyaXRlczogcHR5LndyaXRlcyxcblx0XHR9LCB7XG5cdFx0XHRjbGllbnREYXRhOiBbJ2JlZm9yZW1pZGFmdGVyJ10sXG5cdFx0XHRwdHlXcml0ZXM6IFsnXFx4MWJbMTs3UicsICdcXHgxYlsxOzEwUiddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlcyBhbHQtYnVmZmVyIHByb21pc2UgZnJvbSBoZWFkbGVzcyB0ZXJtaW5hbCBkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgYXBwbGljYXRpb25OYW1lOiAndnNjb2RlJyB9IGFzIElQcm9kdWN0U2VydmljZTtcblx0XHRjb25zdCBwdHkgPSBuZXcgVGVzdFB0eSgpO1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHB0eSkpO1xuXHRcdGNvbnN0IHVyaSA9ICdhZ2VudGhvc3QtdGVybWluYWw6Ly90ZXN0L2FsdC1idWZmZXInO1xuXG5cdFx0Y29uc3QgY3JlYXRlVGVybWluYWwgPSBtYW5hZ2VyLmNyZWF0ZVRlcm1pbmFsKHtcblx0XHRcdGNoYW5uZWw6IHVyaSxcblx0XHRcdGNsYWltOiB7IGtpbmQ6IFRlcm1pbmFsQ2xhaW1LaW5kLkNsaWVudCwgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcgfSxcblx0XHRcdGN3ZDogcHJvY2Vzcy5jd2QoKSxcblx0XHRcdGNvbHM6IDgwLFxuXHRcdFx0cm93czogMjQsXG5cdFx0fSwgeyBzaGVsbDogJy9iaW4vYmFzaCcgfSk7XG5cblx0XHRhd2FpdCBwdHkuZGF0YUxpc3RlbmVyUmVnaXN0ZXJlZC5wO1xuXHRcdHB0eS5maXJlRGF0YSgncHJvbXB0Jyk7XG5cdFx0YXdhaXQgY3JlYXRlVGVybWluYWw7XG5cblx0XHRjb25zdCBhbHRCdWZmZXJTdG9yZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGFsdEJ1ZmZlclByb21pc2UgPSBtYW5hZ2VyLmNyZWF0ZUFsdEJ1ZmZlclByb21pc2UodXJpLCBhbHRCdWZmZXJTdG9yZSk7XG5cblx0XHRwdHkuZmlyZURhdGEoJ1xceDFiWz8xMDQ5aCcpO1xuXG5cdFx0YXdhaXQgYWx0QnVmZmVyUHJvbWlzZTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZWQgYWx0LWJ1ZmZlciBwcm9taXNlIGxpc3RlbmVyIGRvZXMgbm90IHJlc29sdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBwcm9kdWN0U2VydmljZSA9IHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBhcHBsaWNhdGlvbk5hbWU6ICd2c2NvZGUnIH0gYXMgSVByb2R1Y3RTZXJ2aWNlO1xuXHRcdGNvbnN0IHB0eSA9IG5ldyBUZXN0UHR5KCk7XG5cdFx0Y29uc3QgbWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcihzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgcHR5KSk7XG5cdFx0Y29uc3QgdXJpID0gJ2FnZW50aG9zdC10ZXJtaW5hbDovL3Rlc3QvYWx0LWJ1ZmZlci1kaXNwb3NlZCc7XG5cblx0XHRjb25zdCBjcmVhdGVUZXJtaW5hbCA9IG1hbmFnZXIuY3JlYXRlVGVybWluYWwoe1xuXHRcdFx0Y2hhbm5lbDogdXJpLFxuXHRcdFx0Y2xhaW06IHsga2luZDogVGVybWluYWxDbGFpbUtpbmQuQ2xpZW50LCBjbGllbnRJZDogJ3Rlc3QtY2xpZW50JyB9LFxuXHRcdFx0Y3dkOiBwcm9jZXNzLmN3ZCgpLFxuXHRcdFx0Y29sczogODAsXG5cdFx0XHRyb3dzOiAyNCxcblx0XHR9LCB7IHNoZWxsOiAnL2Jpbi9iYXNoJyB9KTtcblxuXHRcdGF3YWl0IHB0eS5kYXRhTGlzdGVuZXJSZWdpc3RlcmVkLnA7XG5cdFx0cHR5LmZpcmVEYXRhKCdwcm9tcHQnKTtcblx0XHRhd2FpdCBjcmVhdGVUZXJtaW5hbDtcblxuXHRcdGNvbnN0IGFsdEJ1ZmZlclN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGFsdEJ1ZmZlclByb21pc2UgPSBtYW5hZ2VyLmNyZWF0ZUFsdEJ1ZmZlclByb21pc2UodXJpLCBhbHRCdWZmZXJTdG9yZSk7XG5cdFx0bGV0IGRpZEVudGVyQWx0QnVmZmVyID0gZmFsc2U7XG5cdFx0dm9pZCBhbHRCdWZmZXJQcm9taXNlLnRoZW4oKCkgPT4gZGlkRW50ZXJBbHRCdWZmZXIgPSB0cnVlKTtcblx0XHRhbHRCdWZmZXJTdG9yZS5kaXNwb3NlKCk7XG5cdFx0cHR5LmZpcmVEYXRhKCdcXHgxYls/MTA0OWgnKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWRFbnRlckFsdEJ1ZmZlciwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGllbnQtc3VwcHJlc3NlZCB0ZXJtaW5hbCBxdWVyaWVzIGFyZSBzdHJpcHBlZCBmcm9tIGNsaWVudC1mYWNpbmcgZGF0YScsICgpID0+IHtcblx0XHRmdW5jdGlvbiBmaWx0ZXIoZGF0YTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRcdHJldHVybiByZW1vdmVUZXJtaW5hbFF1ZXJpZXNTdXBwcmVzc2VkRnJvbUNsaWVudChkYXRhLCB7IHBlbmRpbmdEYXRhOiAnJyB9KTtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyKCdiZWZvcmUgXFx4MWJbNm4gYWZ0ZXInKSwgJ2JlZm9yZSAgYWZ0ZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyKCdiZWZvcmUgXFx4MWJbPzZuIGFmdGVyJyksICdiZWZvcmUgIGFmdGVyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlcignYmVmb3JlIFxceDFiXTEwOz9cXHgxYlxcXFwgYWZ0ZXInKSwgJ2JlZm9yZSAgYWZ0ZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyKCdiZWZvcmUgXFx4MWJdMTA7P1xceDA3IGFmdGVyJyksICdiZWZvcmUgIGFmdGVyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlcignYmVmb3JlIFxceDFiXTExOz9cXHgxYlxcXFwgYWZ0ZXInKSwgJ2JlZm9yZSAgYWZ0ZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyKCdiZWZvcmUgXFx4MWJdMTE7P1xceDA3IGFmdGVyJyksICdiZWZvcmUgIGFmdGVyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlcignXFx4MWJbNW5cXHgxYltjXFx4MWJbMGNcXHgxYls+Y1xceDFiWz4wYycpLCAnXFx4MWJbNW5cXHgxYltjXFx4MWJbMGNcXHgxYls+Y1xceDFiWz4wYycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIoJ1xceDFiXTEwOyNmZmZmZmZcXHgxYlxcXFxcXHgxYl0xMTtyZ2I6MDAwMC8wMDAwLzAwMDBcXHgwNycpLCAnXFx4MWJdMTA7I2ZmZmZmZlxceDFiXFxcXFxceDFiXTExO3JnYjowMDAwLzAwMDAvMDAwMFxceDA3Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlcignXFx4MWJdMTA7PzsjZmZmZmZmXFx4MWJcXFxcXFx4MWJdMTI7P1xceDFiXFxcXFxceDFiXTQ7MDs/XFx4MWJcXFxcJyksICdcXHgxYl0xMDs/OyNmZmZmZmZcXHgxYlxcXFxcXHgxYl0xMjs/XFx4MWJcXFxcXFx4MWJdNDswOz9cXHgxYlxcXFwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyKCdub3JtYWwgb3V0cHV0XFxyXFxuJyksICdub3JtYWwgb3V0cHV0XFxyXFxuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsaWVudC1zdXBwcmVzc2VkIHRlcm1pbmFsIHF1ZXJpZXMgYXJlIHN0cmlwcGVkIGFjcm9zcyBkYXRhIGNodW5rcycsICgpID0+IHtcblx0XHRsZXQgc3RhdGU6IElUZXJtaW5hbFF1ZXJ5RmlsdGVyU3RhdGUgPSB7IHBlbmRpbmdEYXRhOiAnJyB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdmVUZXJtaW5hbFF1ZXJpZXNTdXBwcmVzc2VkRnJvbUNsaWVudCgnYmVmb3JlIFxceDFiWycsIHN0YXRlKSwgJ2JlZm9yZSAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3ZlVGVybWluYWxRdWVyaWVzU3VwcHJlc3NlZEZyb21DbGllbnQoJzZuIGFmdGVyJywgc3RhdGUpLCAnIGFmdGVyJyk7XG5cblx0XHRzdGF0ZSA9IHsgcGVuZGluZ0RhdGE6ICcnIH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW92ZVRlcm1pbmFsUXVlcmllc1N1cHByZXNzZWRGcm9tQ2xpZW50KCdiZWZvcmUgXFx4MWJbPycsIHN0YXRlKSwgJ2JlZm9yZSAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3ZlVGVybWluYWxRdWVyaWVzU3VwcHJlc3NlZEZyb21DbGllbnQoJzZuIGFmdGVyJywgc3RhdGUpLCAnIGFmdGVyJyk7XG5cblx0XHRzdGF0ZSA9IHsgcGVuZGluZ0RhdGE6ICcnIH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW92ZVRlcm1pbmFsUXVlcmllc1N1cHByZXNzZWRGcm9tQ2xpZW50KCdiZWZvcmUgXFx4MWJbJywgc3RhdGUpLCAnYmVmb3JlICcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdmVUZXJtaW5hbFF1ZXJpZXNTdXBwcmVzc2VkRnJvbUNsaWVudCgnSyBhZnRlcicsIHN0YXRlKSwgJ1xceDFiW0sgYWZ0ZXInKTtcblxuXHRcdHN0YXRlID0geyBwZW5kaW5nRGF0YTogJycgfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3ZlVGVybWluYWxRdWVyaWVzU3VwcHJlc3NlZEZyb21DbGllbnQoJ2JlZm9yZSBcXHgxYl0xMDsnLCBzdGF0ZSksICdiZWZvcmUgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW92ZVRlcm1pbmFsUXVlcmllc1N1cHByZXNzZWRGcm9tQ2xpZW50KCc/XFx4MWInLCBzdGF0ZSksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3ZlVGVybWluYWxRdWVyaWVzU3VwcHJlc3NlZEZyb21DbGllbnQoJ1xcXFwgYWZ0ZXInLCBzdGF0ZSksICcgYWZ0ZXInKTtcblxuXHRcdHN0YXRlID0geyBwZW5kaW5nRGF0YTogJycgfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3ZlVGVybWluYWxRdWVyaWVzU3VwcHJlc3NlZEZyb21DbGllbnQoJ2JlZm9yZSBcXHgxYl0xMTsnLCBzdGF0ZSksICdiZWZvcmUgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW92ZVRlcm1pbmFsUXVlcmllc1N1cHByZXNzZWRGcm9tQ2xpZW50KCc/XFx4MDcgYWZ0ZXInLCBzdGF0ZSksICcgYWZ0ZXInKTtcblx0fSk7XG5cblx0dGVzdCgnbWFuYWdlciBkYXRhIHBhdGggc3RyaXBzIENQUiBxdWVyaWVzIHdoaWxlIHByZXNlcnZpbmcgc3Vycm91bmRpbmcgb3V0cHV0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVIYW5kbGVyKCk7XG5cblx0XHRjb25zdCBjbGVhbmVkID0gaGFuZGxlci5oYW5kbGVQdHlEYXRhKGBiZWZvcmUke29zYzYzMygnQScpfVxceDFiWzZubWlkXFx4MWJbPzZuYWZ0ZXJgKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhbmVkLCAnYmVmb3JlbWlkYWZ0ZXInKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhhbmRsZXIuY29udGVudCwgW3sgdHlwZTogJ3VuY2xhc3NpZmllZCcsIHZhbHVlOiAnYmVmb3JlbWlkYWZ0ZXInIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhhbmRsZXIuZGlzcGF0Y2hlZCwgW1xuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsRGF0YSwgZGF0YTogJ2JlZm9yZScgfSxcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbENvbW1hbmREZXRlY3Rpb25BdmFpbGFibGUgfSxcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbERhdGEsIGRhdGE6ICdtaWRhZnRlcicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnVGVybWluYWxDb21tYW5kRGV0ZWN0aW9uQXZhaWxhYmxlIGlzIGRpc3BhdGNoZWQgb24gZmlyc3QgT1NDIDYzMycsICgpID0+IHtcblx0XHRjb25zdCBoYW5kbGVyID0gY3JlYXRlSGFuZGxlcigpO1xuXG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKG9zYzYzMygnQScpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYW5kbGVyLmRpc3BhdGNoZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFuZGxlci5kaXNwYXRjaGVkWzBdLnR5cGUsIEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRGV0ZWN0aW9uQXZhaWxhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgnVGVybWluYWxDb21tYW5kRGV0ZWN0aW9uQXZhaWxhYmxlIGlzIGRpc3BhdGNoZWQgb25seSBvbmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVIYW5kbGVyKCk7XG5cblx0XHRoYW5kbGVyLmhhbmRsZVB0eURhdGEob3NjNjMzKCdBJykpO1xuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YShvc2M2MzMoJ0InKSk7XG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKG9zYzYzMygnQScpKTtcblxuXHRcdGNvbnN0IGRldGVjdGlvbkFjdGlvbnMgPSBoYW5kbGVyLmRpc3BhdGNoZWQuZmlsdGVyKFxuXHRcdFx0YSA9PiBhLnR5cGUgPT09IEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRGV0ZWN0aW9uQXZhaWxhYmxlXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0ZWN0aW9uQWN0aW9ucy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdmdWxsIGNvbW1hbmQgbGlmZWN5Y2xlIGRpc3BhdGNoZXMgY29ycmVjdCBhY3Rpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVIYW5kbGVyKCk7XG5cblx0XHQvLyBTaGVsbCBwcm9tcHRcblx0XHRoYW5kbGVyLmhhbmRsZVB0eURhdGEoYCR7b3NjNjMzKCdBJyl9JCAke29zYzYzMygnQicpfWApO1xuXHRcdC8vIENvbW1hbmQgZW50ZXJlZCwgc2hlbGwgcmVwb3J0cyBjb21tYW5kIGxpbmUgYW5kIGV4ZWN1dGVzXG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKGAke29zYzYzMygnRTtlY2hvXFxcXHgyMGhlbGxvO3Rlc3Qtbm9uY2UnKX0ke29zYzYzMygnQycpfWApO1xuXHRcdC8vIENvbW1hbmQgb3V0cHV0XG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKCdoZWxsb1xcclxcbicpO1xuXHRcdC8vIENvbW1hbmQgZmluaXNoZXNcblx0XHRoYW5kbGVyLmhhbmRsZVB0eURhdGEob3NjNjMzKCdEOzAnKSk7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gaGFuZGxlci5kaXNwYXRjaGVkO1xuXHRcdC8vIEV4cGVjdDogRGV0ZWN0aW9uQXZhaWxhYmxlLCBDb21tYW5kRXhlY3V0ZWQsIENvbW1hbmRGaW5pc2hlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLnR5cGUsIEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRGV0ZWN0aW9uQXZhaWxhYmxlKTtcblxuXHRcdGNvbnN0IGV4ZWN1dGVkID0gYWN0aW9ucy5maW5kKGEgPT4gYS50eXBlID09PSBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZEV4ZWN1dGVkKTtcblx0XHRhc3NlcnQub2soZXhlY3V0ZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGVjdXRlZC5jb21tYW5kSWQsICdjbWQtMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGVjdXRlZC5jb21tYW5kTGluZSwgJ2VjaG8gaGVsbG8nKTtcblxuXHRcdGNvbnN0IGZpbmlzaGVkID0gYWN0aW9ucy5maW5kKGEgPT4gYS50eXBlID09PSBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZEZpbmlzaGVkKTtcblx0XHRhc3NlcnQub2soZmluaXNoZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5pc2hlZC5jb21tYW5kSWQsICdjbWQtMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5pc2hlZC5leGl0Q29kZSwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnRlbnQgcGFydHMgYXJlIHN0cnVjdHVyZWQgY29ycmVjdGx5IGFmdGVyIGNvbW1hbmQgbGlmZWN5Y2xlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVIYW5kbGVyKCk7XG5cblx0XHQvLyBQcm9tcHQgb3V0cHV0IChiZWZvcmUgY29tbWFuZClcblx0XHRoYW5kbGVyLmhhbmRsZVB0eURhdGEoYCR7b3NjNjMzKCdBJyl9dXNlckBob3N0On4gJCAke29zYzYzMygnQicpfWApO1xuXHRcdC8vIENvbW1hbmQgbGluZSArIGV4ZWN1dGVcblx0XHRoYW5kbGVyLmhhbmRsZVB0eURhdGEoYCR7b3NjNjMzKCdFO2xzO3Rlc3Qtbm9uY2UnKX0ke29zYzYzMygnQycpfWApO1xuXHRcdC8vIENvbW1hbmQgb3V0cHV0XG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKCdmaWxlMVxcbmZpbGUyXFxuJyk7XG5cdFx0Ly8gQ29tbWFuZCBmaW5pc2hlc1xuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YShvc2M2MzMoJ0Q7MCcpKTtcblx0XHQvLyBOZXcgcHJvbXB0XG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKGAke29zYzYzMygnQScpfXVzZXJAaG9zdDp+ICQgYCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhhbmRsZXIuY29udGVudC5tYXAocCA9PiAoe1xuXHRcdFx0dHlwZTogcC50eXBlLFxuXHRcdFx0Li4uKHAudHlwZSA9PT0gJ3VuY2xhc3NpZmllZCcgPyB7IHZhbHVlOiBwLnZhbHVlIH0gOiB7XG5cdFx0XHRcdGNvbW1hbmRJZDogcC5jb21tYW5kSWQsXG5cdFx0XHRcdGNvbW1hbmRMaW5lOiBwLmNvbW1hbmRMaW5lLFxuXHRcdFx0XHRvdXRwdXQ6IHAub3V0cHV0LFxuXHRcdFx0XHRpc0NvbXBsZXRlOiBwLmlzQ29tcGxldGUsXG5cdFx0XHRcdGV4aXRDb2RlOiBwLmV4aXRDb2RlLFxuXHRcdFx0fSksXG5cdFx0fSkpLCBbXG5cdFx0XHR7IHR5cGU6ICd1bmNsYXNzaWZpZWQnLCB2YWx1ZTogJ3VzZXJAaG9zdDp+ICQgJyB9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdGNvbW1hbmRJZDogJ2NtZC0xJyxcblx0XHRcdFx0Y29tbWFuZExpbmU6ICdscycsXG5cdFx0XHRcdG91dHB1dDogJ2ZpbGUxXFxuZmlsZTJcXG4nLFxuXHRcdFx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHRleGl0Q29kZTogMCxcblx0XHRcdH0sXG5cdFx0XHR7IHR5cGU6ICd1bmNsYXNzaWZpZWQnLCB2YWx1ZTogJ3VzZXJAaG9zdDp+ICQgJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdub25jZSB2YWxpZGF0aW9uIHJlamVjdHMgdW50cnVzdGVkIGNvbW1hbmQgbGluZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGFuZGxlciA9IGNyZWF0ZUhhbmRsZXIoJ215LXNlY3JldC1ub25jZScpO1xuXG5cdFx0Ly8gTWFsaWNpb3VzIG91dHB1dCBjb250YWluaW5nIGEgZmFrZSBjb21tYW5kIGxpbmUgd2l0aCB3cm9uZyBub25jZVxuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YShvc2M2MzMoJ0U7cm1cXFxceDIwLXJmXFxcXHgyMC87d3Jvbmctbm9uY2UnKSk7XG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKG9zYzYzMygnQycpKTtcblxuXHRcdGNvbnN0IGV4ZWN1dGVkID0gaGFuZGxlci5kaXNwYXRjaGVkLmZpbmQoYSA9PiBhLnR5cGUgPT09IEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRXhlY3V0ZWQpO1xuXHRcdGFzc2VydC5vayhleGVjdXRlZCk7XG5cdFx0Ly8gQ29tbWFuZCBsaW5lIHNob3VsZCBiZSBlbXB0eSBiZWNhdXNlIHRoZSBub25jZSBkaWRuJ3QgbWF0Y2hcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhlY3V0ZWQuY29tbWFuZExpbmUsICcnKTtcblx0fSk7XG5cblx0dGVzdCgnbm9uY2UgdmFsaWRhdGlvbiBhY2NlcHRzIHRydXN0ZWQgY29tbWFuZCBsaW5lcycsICgpID0+IHtcblx0XHRjb25zdCBoYW5kbGVyID0gY3JlYXRlSGFuZGxlcignbXktc2VjcmV0LW5vbmNlJyk7XG5cblx0XHRoYW5kbGVyLmhhbmRsZVB0eURhdGEob3NjNjMzKCdFO2VjaG9cXFxceDIwc2FmZTtteS1zZWNyZXQtbm9uY2UnKSk7XG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKG9zYzYzMygnQycpKTtcblxuXHRcdGNvbnN0IGV4ZWN1dGVkID0gaGFuZGxlci5kaXNwYXRjaGVkLmZpbmQoYSA9PiBhLnR5cGUgPT09IEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRXhlY3V0ZWQpO1xuXHRcdGFzc2VydC5vayhleGVjdXRlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4ZWN1dGVkLmNvbW1hbmRMaW5lLCAnZWNobyBzYWZlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIHNlcXVlbnRpYWwgY29tbWFuZHMgZ2V0IHNlcXVlbnRpYWwgSURzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVIYW5kbGVyKCk7XG5cblx0XHQvLyBGaXJzdCBjb21tYW5kXG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKGAke29zYzYzMygnRTtjbWQxO3Rlc3Qtbm9uY2UnKX0ke29zYzYzMygnQycpfWApO1xuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YShvc2M2MzMoJ0Q7MCcpKTtcblxuXHRcdC8vIFNlY29uZCBjb21tYW5kXG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKGAke29zYzYzMygnRTtjbWQyO3Rlc3Qtbm9uY2UnKX0ke29zYzYzMygnQycpfWApO1xuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YShvc2M2MzMoJ0Q7MScpKTtcblxuXHRcdGNvbnN0IGV4ZWN1dGVkID0gaGFuZGxlci5kaXNwYXRjaGVkLmZpbHRlcihhID0+IGEudHlwZSA9PT0gQWN0aW9uVHlwZS5UZXJtaW5hbENvbW1hbmRFeGVjdXRlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4ZWN1dGVkLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4ZWN1dGVkWzBdLmNvbW1hbmRJZCwgJ2NtZC0xJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4ZWN1dGVkWzBdLmNvbW1hbmRMaW5lLCAnY21kMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGVjdXRlZFsxXS5jb21tYW5kSWQsICdjbWQtMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGVjdXRlZFsxXS5jb21tYW5kTGluZSwgJ2NtZDInKTtcblxuXHRcdGNvbnN0IGZpbmlzaGVkID0gaGFuZGxlci5kaXNwYXRjaGVkLmZpbHRlcihhID0+IGEudHlwZSA9PT0gQWN0aW9uVHlwZS5UZXJtaW5hbENvbW1hbmRGaW5pc2hlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmlzaGVkLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmlzaGVkWzBdLmNvbW1hbmRJZCwgJ2NtZC0xJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmlzaGVkWzBdLmV4aXRDb2RlLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluaXNoZWRbMV0uY29tbWFuZElkLCAnY21kLTInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluaXNoZWRbMV0uZXhpdENvZGUsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdDV0QgcHJvcGVydHkgZGlzcGF0Y2hlcyBUZXJtaW5hbEN3ZENoYW5nZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGFuZGxlciA9IGNyZWF0ZUhhbmRsZXIoKTtcblxuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YShvc2M2MzMoJ1A7Q3dkPS9uZXcvd29ya2luZy9kaXInKSk7XG5cblx0XHRjb25zdCBjd2RBY3Rpb24gPSBoYW5kbGVyLmRpc3BhdGNoZWQuZmluZChhID0+IGEudHlwZSA9PT0gQWN0aW9uVHlwZS5UZXJtaW5hbEN3ZENoYW5nZWQpO1xuXHRcdGFzc2VydC5vayhjd2RBY3Rpb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjd2RBY3Rpb24uY3dkLCAnL25ldy93b3JraW5nL2RpcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYW5kbGVyLmN3ZCwgJy9uZXcvd29ya2luZy9kaXInKTtcblx0fSk7XG5cblx0dGVzdCgnT1NDIDYzMyBzZXF1ZW5jZXMgYXJlIHN0cmlwcGVkIGZyb20gY2xlYW5lZCBvdXRwdXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGFuZGxlciA9IGNyZWF0ZUhhbmRsZXIoKTtcblxuXHRcdGNvbnN0IGNsZWFuZWQgPSBoYW5kbGVyLmhhbmRsZVB0eURhdGEoXG5cdFx0XHRgYmVmb3JlJHtvc2M2MzMoJ0EnKX1wcm9tcHQke29zYzYzMygnQicpfSR7b3NjNjMzKCdFO2xzO3Rlc3Qtbm9uY2UnKX0ke29zYzYzMygnQycpfW91dHB1dCR7b3NjNjMzKCdEOzAnKX1hZnRlcmBcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsZWFuZWQsICdiZWZvcmVwcm9tcHRvdXRwdXRhZnRlcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdkYXRhIHdpdGhvdXQgc2hlbGwgaW50ZWdyYXRpb24gcGFzc2VzIHRocm91Z2ggdW5tb2RpZmllZCcsICgpID0+IHtcblx0XHRjb25zdCBoYW5kbGVyID0gbmV3IFRlc3RUZXJtaW5hbERhdGFIYW5kbGVyKCd0ZXJtaW5hbDovL3Rlc3QnLCB7XG5cdFx0XHRwYXJzZXI6IG5ldyBPc2M2MzNQYXJzZXIoKSxcblx0XHRcdG5vbmNlOiAnbm9uY2UnLFxuXHRcdFx0Y29tbWFuZENvdW50ZXI6IDAsXG5cdFx0XHRkZXRlY3Rpb25BdmFpbGFibGVFbWl0dGVkOiBmYWxzZSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGRhdGEgPSAncmVndWxhciB0ZXJtaW5hbCBvdXRwdXQgd2l0aCBcXHgxYlszMW1jb2xvcnNcXHgxYlswbSc7XG5cdFx0Y29uc3QgY2xlYW5lZCA9IGhhbmRsZXIuaGFuZGxlUHR5RGF0YShkYXRhKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhbmVkLCBkYXRhKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhhbmRsZXIuY29udGVudCwgW1xuXHRcdFx0eyB0eXBlOiAndW5jbGFzc2lmaWVkJywgdmFsdWU6IGRhdGEgfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhhbmRsZXIuZGlzcGF0Y2hlZCwgW1xuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsRGF0YSwgZGF0YSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDb21tYW5kRmluaXNoZWQgd2l0aG91dCBhY3RpdmUgY29tbWFuZCBpcyBpZ25vcmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVIYW5kbGVyKCk7XG5cblx0XHQvLyBFbWl0IGEgUHJvbXB0U3RhcnQgdG8gdHJpZ2dlciBkZXRlY3Rpb24gYXZhaWxhYmxlLCB0aGVuIGZpbmlzaCB3aXRob3V0IGV4ZWN1dGVcblx0XHRoYW5kbGVyLmhhbmRsZVB0eURhdGEob3NjNjMzKCdBJykpO1xuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YShvc2M2MzMoJ0Q7MCcpKTtcblxuXHRcdGNvbnN0IGZpbmlzaGVkID0gaGFuZGxlci5kaXNwYXRjaGVkLmZpbHRlcihhID0+IGEudHlwZSA9PT0gQWN0aW9uVHlwZS5UZXJtaW5hbENvbW1hbmRGaW5pc2hlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmlzaGVkLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbW1hbmQgb3V0cHV0IGlzIGFjY3VtdWxhdGVkIGluIHRoZSBjb21tYW5kIGNvbnRlbnQgcGFydCcsICgpID0+IHtcblx0XHRjb25zdCBoYW5kbGVyID0gY3JlYXRlSGFuZGxlcigpO1xuXG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKGAke29zYzYzMygnRTt0ZXN0O3Rlc3Qtbm9uY2UnKX0ke29zYzYzMygnQycpfWApO1xuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YSgnbGluZTFcXHJcXG4nKTtcblx0XHRoYW5kbGVyLmhhbmRsZVB0eURhdGEoJ2xpbmUyXFxyXFxuJyk7XG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKCdsaW5lM1xcclxcbicpO1xuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YShvc2M2MzMoJ0Q7MCcpKTtcblxuXHRcdGNvbnN0IGNtZFBhcnRzID0gaGFuZGxlci5jb250ZW50LmZpbHRlcihwID0+IHAudHlwZSA9PT0gJ2NvbW1hbmQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY21kUGFydHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY21kUGFydHNbMF0udHlwZSA9PT0gJ2NvbW1hbmQnICYmIGNtZFBhcnRzWzBdLm91dHB1dCwgJ2xpbmUxXFxyXFxubGluZTJcXHJcXG5saW5lM1xcclxcbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdvdXRwdXQgYW5kIENvbW1hbmRGaW5pc2hlZCBhcnJpdmluZyBpbiBvbmUgUFRZIHJlYWQgYXJlIGF0dHJpYnV0ZWQgdG8gdGhlIGNvbW1hbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQSBmYXN0IGNvbW1hbmQgKGUuZy4gYGVjaG9gKSBmcmVxdWVudGx5IGVtaXRzIGl0cyBvdXRwdXQgYW5kIHRoZVxuXHRcdC8vIENvbW1hbmRFeGVjdXRlZC9Db21tYW5kRmluaXNoZWQgbWFya2VycyBpbiBhIHNpbmdsZSBQVFkgcmVhZC4gVGhlXG5cdFx0Ly8gb3V0cHV0IHRoYXQgcHJlY2VkZXMgdGhlIENvbW1hbmRGaW5pc2hlZCBtYXJrZXIgbXVzdCBiZSBhdHRyaWJ1dGVkIHRvXG5cdFx0Ly8gdGhlIGNvbW1hbmQgYmVmb3JlIHRoZSBmaW5pc2hlZCBldmVudCBzbmFwc2hvdHMgaXQsIG90aGVyd2lzZSBpdCBpc1xuXHRcdC8vIGxvc3QgZnJvbSB0aGUgY29tbWFuZCByZXN1bHQgKHJlZ3Jlc3Npb24gZm9yIHRoZSBmbGFreSBhZ2VudC1ob3N0XG5cdFx0Ly8gc2FuZGJveCBzbW9rZSB0ZXN0LCB3aGVyZSB0aGUgc2hlbGwgdG9vbCByZXR1cm5lZCBhbiBlbXB0eSBvdXRwdXQpLlxuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgYXBwbGljYXRpb25OYW1lOiAndnNjb2RlJyB9IGFzIElQcm9kdWN0U2VydmljZTtcblx0XHRjb25zdCBwdHkgPSBuZXcgVGVzdFB0eSgpO1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHB0eSkpO1xuXHRcdGNvbnN0IHVyaSA9ICdhZ2VudGhvc3QtdGVybWluYWw6Ly90ZXN0L2NvYWxlc2NlZC1jb21tYW5kLWZpbmlzaGVkJztcblxuXHRcdGNvbnN0IGNyZWF0ZVRlcm1pbmFsID0gbWFuYWdlci5jcmVhdGVUZXJtaW5hbCh7XG5cdFx0XHRjaGFubmVsOiB1cmksXG5cdFx0XHRjbGFpbTogeyBraW5kOiBUZXJtaW5hbENsYWltS2luZC5DbGllbnQsIGNsaWVudElkOiAndGVzdC1jbGllbnQnIH0sXG5cdFx0XHRjd2Q6IHByb2Nlc3MuY3dkKCksXG5cdFx0XHRjb2xzOiA4MCxcblx0XHRcdHJvd3M6IDI0LFxuXHRcdH0sIHsgc2hlbGw6IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicgPyAncHdzaC5leGUnIDogJy9iaW4vYmFzaCcgfSk7XG5cblx0XHRhd2FpdCBwdHkuZGF0YUxpc3RlbmVyUmVnaXN0ZXJlZC5wO1xuXHRcdHB0eS5maXJlRGF0YShvc2M2MzMoJ0EnKSk7XG5cdFx0YXdhaXQgY3JlYXRlVGVybWluYWw7XG5cblx0XHRjb25zdCBjb21wbGV0aW9uczogeyByZWFkb25seSBleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkOyByZWFkb25seSBvdXRwdXQ6IHN0cmluZyB9W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkNvbW1hbmRGaW5pc2hlZCh1cmksIGV2ZW50ID0+IGNvbXBsZXRpb25zLnB1c2goe1xuXHRcdFx0ZXhpdENvZGU6IGV2ZW50LmV4aXRDb2RlLFxuXHRcdFx0b3V0cHV0OiBldmVudC5vdXRwdXQsXG5cdFx0fSkpKTtcblxuXHRcdC8vIENsaWVudHMgcmVidWlsZCBwZXItY29tbWFuZCBvdXRwdXQgZnJvbSB0aGUgYWN0aW9uIHN0cmVhbSwgc28gdGhlXG5cdFx0Ly8gZGF0YSBtdXN0IGFsc28gYmUgRElTUEFUQ0hFRCBiZXR3ZWVuIHRoZSBleGVjdXRlZCBhbmQgZmluaXNoZWRcblx0XHQvLyBhY3Rpb25zLCBub3QgYWZ0ZXIgdGhlIHdob2xlIGNodW5rLlxuXHRcdGNvbnN0IGRpc3BhdGNoZWQ6IHsgdHlwZTogc3RyaW5nOyBkYXRhPzogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZW52ZWxvcGUgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gZW52ZWxvcGUuYWN0aW9uO1xuXHRcdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZEV4ZWN1dGVkIHx8IGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZEZpbmlzaGVkKSB7XG5cdFx0XHRcdGRpc3BhdGNoZWQucHVzaCh7IHR5cGU6IGFjdGlvbi50eXBlIH0pO1xuXHRcdFx0fSBlbHNlIGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5UZXJtaW5hbERhdGEpIHtcblx0XHRcdFx0ZGlzcGF0Y2hlZC5wdXNoKHsgdHlwZTogYWN0aW9uLnR5cGUsIGRhdGE6IGFjdGlvbi5kYXRhIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHB0eS5maXJlRGF0YShgJHtvc2M2MzMoJ0MnKX1oaVxcclxcbiR7b3NjNjMzKCdEOzAnKX1gKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tcGxldGlvbnMsIFt7IGV4aXRDb2RlOiAwLCBvdXRwdXQ6ICdoaVxcclxcbicgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlzcGF0Y2hlZCwgW1xuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZEV4ZWN1dGVkIH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxEYXRhLCBkYXRhOiAnaGlcXHJcXG4nIH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRmluaXNoZWQgfSxcblx0XHRdKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0FnZW50SG9zdFRlcm1pbmFsTWFuYWdlciBcdTIwMTMgb3V0cHV0LW9ubHkgdGVybWluYWxzJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5jbGVhcigpKTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlTWFuYWdlcigpIHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0geyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGFwcGxpY2F0aW9uTmFtZTogJ3ZzY29kZScgfSBhcyBJUHJvZHVjdFNlcnZpY2U7XG5cdFx0Y29uc3QgbWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0cmV0dXJuIHsgbWFuYWdlciwgc3RhdGVNYW5hZ2VyIH07XG5cdH1cblxuXHR0ZXN0KCdzdHJlYW1zIGFwcGVuZGVkIGRhdGEsIHNuYXBzaG90cyBzdGF0ZSB3aXRoIGlzUHR5IGZhbHNlLCBhbmQgcmVjb3JkcyB0aGUgZXhpdCcsICgpID0+IHtcblx0XHRjb25zdCB7IG1hbmFnZXIsIHN0YXRlTWFuYWdlciB9ID0gY3JlYXRlTWFuYWdlcigpO1xuXHRcdGNvbnN0IHVyaSA9ICdhZ2VudGhvc3QtdGVybWluYWw6Ly9zaGVsbC9jb3BpbG90Tm9uUHR5U2hlbGxzL3RjLTEnO1xuXHRcdGNvbnN0IGNsYWltOiBUZXJtaW5hbENsYWltID0geyBraW5kOiBUZXJtaW5hbENsYWltS2luZC5TZXNzaW9uLCBzZXNzaW9uOiAnYWdlbnQtc2Vzc2lvbjovL2NvcGlsb3QvczEnLCB0b29sQ2FsbElkOiAndGMtMScgfTtcblx0XHRjb25zdCBkaXNwYXRjaGVkOiBTdGF0ZUFjdGlvbltdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlbnZlbG9wZSA9PiB7XG5cdFx0XHRpZiAoZW52ZWxvcGUuY2hhbm5lbCA9PT0gdXJpKSB7XG5cdFx0XHRcdGRpc3BhdGNoZWQucHVzaChlbnZlbG9wZS5hY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdG1hbmFnZXIuY3JlYXRlT3V0cHV0VGVybWluYWwodXJpLCB7IHRpdGxlOiAnUnVuIFNoZWxsIENvbW1hbmQnLCBjbGFpbSB9KTtcblx0XHRtYW5hZ2VyLmFwcGVuZE91dHB1dFRlcm1pbmFsRGF0YSh1cmksICd0aWNrIDFcXG4nKTtcblx0XHRtYW5hZ2VyLmFwcGVuZE91dHB1dFRlcm1pbmFsRGF0YSh1cmksICd0aWNrIDJcXG4nKTtcblx0XHRtYW5hZ2VyLmZpbmFsaXplT3V0cHV0VGVybWluYWwodXJpLCAwKTtcblx0XHRtYW5hZ2VyLmZpbmFsaXplT3V0cHV0VGVybWluYWwodXJpLCAxKTsgLy8gcmVjb3JkZWQgZXhpdCBpcyBpbW11dGFibGVcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFuYWdlci5nZXRUZXJtaW5hbFN0YXRlKHVyaSksIHtcblx0XHRcdHRpdGxlOiAnUnVuIFNoZWxsIENvbW1hbmQnLFxuXHRcdFx0Y29udGVudDogW3sgdHlwZTogJ3VuY2xhc3NpZmllZCcsIHZhbHVlOiAndGljayAxXFxudGljayAyXFxuJyB9XSxcblx0XHRcdGV4aXRDb2RlOiAwLFxuXHRcdFx0Y2xhaW0sXG5cdFx0XHRpc1B0eTogZmFsc2UsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaXNwYXRjaGVkLCBbXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxEYXRhLCBkYXRhOiAndGljayAxXFxuJyB9LFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsRGF0YSwgZGF0YTogJ3RpY2sgMlxcbicgfSxcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbEV4aXRlZCwgZXhpdENvZGU6IDAgfSxcblx0XHRdKTtcblx0XHQvLyBPdXRwdXQgY2hhbm5lbHMgYXJlIGRpc2NvdmVyZWQgdGhyb3VnaCB0b29sIHJlc3VsdCBjb250ZW50LCBub3QgZ2VuZXJpYyBQVFkgdGVybWluYWwgQVBJcy5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oYXNUZXJtaW5hbCh1cmkpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYW5hZ2VyLmdldFRlcm1pbmFsSW5mb3MoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNldCBjbGVhcnMgY29udGVudCBhbmQgZGlzcG9zZSByZW1vdmVzIHRoZSBjaGFubmVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbWFuYWdlciwgc3RhdGVNYW5hZ2VyIH0gPSBjcmVhdGVNYW5hZ2VyKCk7XG5cdFx0Y29uc3QgdXJpID0gJ2FnZW50aG9zdC10ZXJtaW5hbDovL3NoZWxsL2NvcGlsb3ROb25QdHlTaGVsbHMvdGMtMic7XG5cdFx0Y29uc3QgZGlzcGF0Y2hlZDogU3RhdGVBY3Rpb25bXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZW52ZWxvcGUgPT4ge1xuXHRcdFx0aWYgKGVudmVsb3BlLmNoYW5uZWwgPT09IHVyaSkge1xuXHRcdFx0XHRkaXNwYXRjaGVkLnB1c2goZW52ZWxvcGUuYWN0aW9uKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRtYW5hZ2VyLmNyZWF0ZU91dHB1dFRlcm1pbmFsKHVyaSwgeyB0aXRsZTogJ0Jhc2gnLCBjbGFpbTogeyBraW5kOiBUZXJtaW5hbENsYWltS2luZC5TZXNzaW9uLCBzZXNzaW9uOiAnYWdlbnQtc2Vzc2lvbjovL2NvcGlsb3QvczEnIH0gfSk7XG5cdFx0bWFuYWdlci5hcHBlbmRPdXRwdXRUZXJtaW5hbERhdGEodXJpLCAnb2xkIG91dHB1dCcpO1xuXHRcdG1hbmFnZXIucmVzZXRPdXRwdXRUZXJtaW5hbCh1cmkpO1xuXHRcdG1hbmFnZXIuYXBwZW5kT3V0cHV0VGVybWluYWxEYXRhKHVyaSwgJ2ZyZXNoIG91dHB1dCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYW5hZ2VyLmdldFRlcm1pbmFsU3RhdGUodXJpKT8uY29udGVudCwgW3sgdHlwZTogJ3VuY2xhc3NpZmllZCcsIHZhbHVlOiAnZnJlc2ggb3V0cHV0JyB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaXNwYXRjaGVkLm1hcChhY3Rpb24gPT4gYWN0aW9uLnR5cGUpLCBbQWN0aW9uVHlwZS5UZXJtaW5hbERhdGEsIEFjdGlvblR5cGUuVGVybWluYWxDbGVhcmVkLCBBY3Rpb25UeXBlLlRlcm1pbmFsRGF0YV0pO1xuXG5cdFx0bWFuYWdlci5kaXNwb3NlVGVybWluYWwodXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oYXNUZXJtaW5hbCh1cmkpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0VGVybWluYWxTdGF0ZSh1cmkpLCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsa0JBQStCO0FBQ3hDLFNBQVMseUJBQWtFO0FBQzNFLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCLG9CQUFvQixpREFBaUY7QUFDeEksU0FBc0IsaUJBQWlCLG9CQUFvQjtBQTJCM0QsTUFBTSx3QkFBd0I7QUFBQSxFQU03QixZQUNV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
