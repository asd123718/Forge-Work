import assert from "assert";
import * as os from "os";
import { DeferredPromise } from "../../../../base/common/async.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION } from "../../common/agentHostEndpointRegistry.js";
import { SSHAuthMethod } from "../../common/sshRemoteAgentHost.js";
import { SSHRemoteAgentHostMainService, makeAuthHandler } from "../../node/sshRemoteAgentHostService.js";
const dataFolderName = ".vscode-insiders";
const quality = "insider";
class RecordingLogService extends NullLogService {
  constructor() {
    super(...arguments);
    this.errors = [];
    this.warnings = [];
  }
  error(message, ...args) {
    this.errors.push([message, ...args].map((value) => value instanceof Error ? value.message : String(value)).join(" "));
  }
  warn(message, ...args) {
    this.warnings.push([message, ...args].map(String).join(" "));
  }
}
function makeEndpoint(overrides) {
  return {
    schemaVersion: AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
    protocolVersion: "1.0.0",
    connectionToken: "tok",
    endpoint: { type: "tcp", host: "127.0.0.1", port: 8080 },
    ...overrides
  };
}
function agentEndpointsStdout(endpoints, userDataPath = "/home/testuser") {
  return JSON.stringify({ userDataPath, endpoints });
}
function discoveryResponses(entries, userDataPath = "/home/testuser") {
  const responses = [
    { stdout: "Linux\n", code: 0 },
    { stdout: "x86_64\n", code: 0 },
    { stdout: "1.0.0\n__vscode_cli_update_exit_code__:0\n", code: 0 },
    { stdout: agentEndpointsStdout(entries, userDataPath), code: 0 }
  ];
  for (const _pid of new Set(entries.map((e) => e.pid))) {
    responses.push({ stdout: "", code: 0 });
  }
  return responses;
}
class MockSSHChannel {
  constructor() {
    this.stderr = { on: () => {
    } };
  }
  on(_event, _listener) {
    return this;
  }
  close() {
  }
}
class MockSSHClient {
  constructor(execResponses = []) {
    this.execCalls = [];
    this.ended = false;
    this._closeListeners = [];
    this._errorListeners = [];
    this._execResponses = execResponses;
  }
  on(event, listener) {
    if (event === "close") {
      this._closeListeners.push(listener);
    } else if (event === "error") {
      this._errorListeners.push(listener);
    }
    return this;
  }
  removeListener(event, listener) {
    const list = event === "close" ? this._closeListeners : event === "error" ? this._errorListeners : void 0;
    if (list) {
      const idx = list.indexOf(listener);
      if (idx >= 0) {
        list.splice(idx, 1);
      }
    }
    return this;
  }
  fireClose() {
    for (const listener of this._closeListeners) {
      listener();
    }
  }
  get closeListenerCount() {
    return this._closeListeners.length;
  }
  get errorListenerCount() {
    return this._errorListeners.length;
  }
  connect() {
  }
  exec(command, callback) {
    this.execCalls.push(command);
    const response = this._execResponses.shift() ?? { stdout: "", code: 0 };
    const channel = new MockSSHChannel();
    queueMicrotask(() => {
      if (response.stdout) {
        const origOn = channel.on.bind(channel);
        let dataHandler;
        let closeHandler;
        channel.on = ((event, listener) => {
          if (event === "data") {
            dataHandler = listener;
          } else if (event === "close") {
            closeHandler = listener;
          }
          return origOn(event, listener);
        });
        callback(void 0, channel);
        if (dataHandler) {
          dataHandler(Buffer.from(response.stdout));
        }
        if (closeHandler) {
          closeHandler(response.code);
        }
      } else {
        let closeHandler;
        const origOn = channel.on.bind(channel);
        channel.on = ((event, listener) => {
          if (event === "close") {
            closeHandler = listener;
          }
          return origOn(event, listener);
        });
        callback(void 0, channel);
        if (closeHandler) {
          closeHandler(response.code);
        }
      }
    });
    return this;
  }
  forwardOut(_srcIP, _srcPort, _dstIP, _dstPort, _callback) {
    return this;
  }
  end() {
    this.ended = true;
  }
}
class KeyboardInteractiveMockSSHClient {
  constructor() {
    this.ended = false;
    this._errorListeners = [];
  }
  on(event, listener) {
    if (event === "error") {
      this._errorListeners.push(listener);
    }
    return this;
  }
  removeListener(_event, _listener) {
    return this;
  }
  connect(config) {
    const authHandler = config.authHandler;
    authHandler?.(null, false, (method) => {
      if (method && method.type === "keyboard-interactive") {
        method.prompt("Keyboard", "", "en-US", [{ prompt: "Password: ", echo: false }], (responses) => {
          this.finishResponses = responses;
          this.fireError(new Error("All configured authentication methods failed"));
        });
      }
    });
  }
  end() {
    this.ended = true;
  }
  fireError(err) {
    for (const listener of this._errorListeners) {
      listener(err);
    }
  }
}
function makeConfig(overrides) {
  return {
    host: "10.0.0.1",
    username: "testuser",
    authMethod: SSHAuthMethod.Agent,
    name: "test-host",
    ...overrides
  };
}
class TestableSSHRemoteAgentHostMainService extends SSHRemoteAgentHostMainService {
  constructor() {
    super(...arguments);
    this.mockClients = [];
    /**
     * Responses that `_connectSSH`'s MockSSHClient hands out for its exec
     * queue, in call order: `uname -s`, `uname -m`, CLI install check,
     * `agent endpoints`, one `kill -0 <pid>` per distinct live pid, and any
     * further spawn/`agent endpoints` calls a test's scenario requires. The
     * `remoteAgentHostCommand` override path makes none of these calls at
     * all, so tests using it can leave this empty.
     */
    this.execResponses = [];
    /** What _startRemoteAgentHost will resolve with (override-command path only). */
    this.startResult = {
      port: 9999,
      connectionToken: "tok-abc",
      pid: 42
    };
    this.startCalled = 0;
    /** What _createWebSocketRelay will resolve with. Set to an Error to reject. */
    this.relayResult = {
      send: () => {
      },
      close: () => {
      }
    };
    this.relayCalled = 0;
    /** Public override so tests can shorten the relay creation timeout. */
    this.relayCreationTimeoutMs = 3e4;
    /** Stored onMessage callbacks from relays, most recent last. */
    this._relayMessageCallbacks = [];
    /** Stored onClose callbacks from relays, most recent last. */
    this._relayCloseCallbacks = [];
    /** Stored relay result objects, most recent last (for makePreviousRelaySyncClose). */
    this._relayResults = [];
  }
  async _connectSSH(_config) {
    const client = new MockSSHClient(this.execResponses);
    this.mockClients.push(client);
    return client;
  }
  async _startRemoteAgentHost(_client, _cliBin, _cliDataDir, _commandOverride) {
    this.startCalled++;
    return { ...this.startResult, stream: new MockSSHChannel() };
  }
  async _createWebSocketRelay(_client, _endpoint, _relayCliBin, _relayCliDataDir, _relayInstanceId, _relayUserDataPath, _connectionToken, onMessage, onClose) {
    this.relayCalled++;
    this._relayMessageCallbacks.push(onMessage);
    this._relayCloseCallbacks.push(onClose);
    if (this.hangRelayCreationOnCall === this.relayCalled) {
      return new Promise(() => {
      });
    }
    const hookResult = this.relayHook?.(this.relayCalled);
    if (hookResult !== void 0) {
      if (hookResult instanceof Error) {
        throw hookResult;
      }
      this._relayResults.push(hookResult);
      return hookResult;
    }
    const result = this.relayResult;
    if (result instanceof Error) {
      throw result;
    }
    const relayObj = { send: result.send, close: result.close };
    this._relayResults.push(relayObj);
    return relayObj;
  }
  async resolveSSHConfig(_host) {
    return {
      hostname: "10.0.0.1",
      port: 22,
      user: "testuser",
      identityFile: [],
      identityAgent: void 0,
      forwardAgent: false,
      userKnownHostsFiles: [],
      globalKnownHostsFiles: [],
      strictHostKeyChecking: void 0
    };
  }
  /**
   * Simulate the old (superseded) relay's WebSocket close event firing.
   * This calls the onClose callback of the second-to-last relay.
   */
  simulateOldRelayClose() {
    if (this._relayCloseCallbacks.length >= 2) {
      this._relayCloseCallbacks[this._relayCloseCallbacks.length - 2]();
    }
  }
  /**
   * Modify the most recently created relay so that calling close()
   * synchronously fires its onClose callback. This simulates a WebSocket
   * implementation that fires the 'close' event inline during ws.close().
   */
  makePreviousRelaySyncClose() {
    const idx = this._relayResults.length - 1;
    if (idx >= 0 && this._relayCloseCallbacks.length > idx) {
      const onClose = this._relayCloseCallbacks[idx];
      this._relayResults[idx].close = () => {
        onClose();
      };
    }
  }
  /**
   * Simulate a message arriving on a specific relay (0-indexed).
   * Defaults to the most recent relay.
   */
  simulateRelayMessage(data, relayIndex) {
    const idx = relayIndex ?? this._relayMessageCallbacks.length - 1;
    this._relayMessageCallbacks[idx]?.(data);
  }
  /**
   * Simulate the current (active) relay's WebSocket close event firing.
   */
  simulateCurrentRelayClose() {
    if (this._relayCloseCallbacks.length > 0) {
      this._relayCloseCallbacks[this._relayCloseCallbacks.length - 1]();
    }
  }
  /** Sets the relay creation timeout; exposed for tests only. */
  setRelayCreationTimeoutForTest(ms) {
    this.relayCreationTimeoutMs = ms;
  }
  startKeyboardInteractiveForTest(prompts, finish, cancelConnect) {
    return this._handleKeyboardInteractive("ssh:test-host", "test-host", "testuser", "", "", prompts, finish, cancelConnect);
  }
  /**
   * Respond to the next endpoint-selection request fired while the given
   * function runs, mirroring how the renderer's picker would answer.
   * Registers the listener *before* invoking `fn` so it never misses the
   * (synchronously-fired, asynchronously-awaited) request event.
   */
  async withEndpointSelectionResponse(selection, fn) {
    const requests = [];
    const listener = this.onDidRequestEndpointSelection((request) => {
      requests.push(request);
      void this.respondEndpointSelection(request.requestId, selection);
    });
    try {
      return await fn();
    } finally {
      listener.dispose();
    }
  }
}
class KeyboardInteractiveConnectTestService extends SSHRemoteAgentHostMainService {
  constructor() {
    super(...arguments);
    this.client = new KeyboardInteractiveMockSSHClient();
  }
  async _createSSHClient() {
    return this.client;
  }
  async _buildAuthAttempts(config) {
    return [{ type: "keyboard-interactive", username: config.username }];
  }
  connectSSHForTest(config) {
    return this._connectSSH(config, "ssh:test-host");
  }
}
suite("SSHRemoteAgentHostMainService - connect flow", () => {
  const disposables = new DisposableStore();
  let service;
  setup(() => {
    const logService = new NullLogService();
    const productService = {
      _serviceBrand: void 0,
      quality,
      dataFolderName
    };
    service = new TestableSSHRemoteAgentHostMainService(
      logService,
      productService
    );
    disposables.add(service);
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns existing connection on duplicate connect without replacing relay", async () => {
    service.execResponses = discoveryResponses([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]);
    const config = makeConfig({ sshConfigHost: "myalias" });
    const result1 = await service.connect(config);
    assert.strictEqual(result1.connectionId, "ssh:myalias");
    assert.strictEqual(result1.sshConfigHost, "myalias");
    assert.strictEqual(result1.lifecycle, "external");
    assert.strictEqual(service.startCalled, 0);
    assert.strictEqual(service.relayCalled, 1);
    const result2 = await service.connect(config);
    assert.strictEqual(result2.connectionId, result1.connectionId);
    assert.strictEqual(result2.connectionToken, result1.connectionToken);
    assert.strictEqual(result2.sshConfigHost, "myalias");
    assert.strictEqual(service.relayCalled, 1);
  });
  test("creates fresh relay on reconnect without restarting agent", async () => {
    service.execResponses = discoveryResponses([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]);
    const config = makeConfig({ sshConfigHost: "myalias" });
    const result1 = await service.connect(config);
    assert.strictEqual(service.relayCalled, 1);
    const result2 = await service.reconnect("myalias", "test-agent");
    assert.strictEqual(result2.connectionId, result1.connectionId);
    assert.strictEqual(result2.connectionToken, result1.connectionToken);
    assert.strictEqual(result2.lifecycle, result1.lifecycle);
    assert.strictEqual(service.relayCalled, 2);
  });
  test("reconnect does not fire onDidRelayClose for superseded relay", async () => {
    service.execResponses = discoveryResponses([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]);
    const config = makeConfig({ sshConfigHost: "myalias" });
    await service.connect(config);
    const closeEvents = [];
    disposables.add(service.onDidRelayClose((id) => closeEvents.push(id)));
    await service.reconnect("myalias", "test-agent");
    service.simulateOldRelayClose();
    assert.deepStrictEqual(closeEvents, []);
  });
  test("reconnect suppresses synchronous close from old relay during replacement", async () => {
    service.execResponses = discoveryResponses([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]);
    const config = makeConfig({ sshConfigHost: "myalias" });
    await service.connect(config);
    const closeEvents = [];
    disposables.add(service.onDidRelayClose((id) => closeEvents.push(id)));
    service.makePreviousRelaySyncClose();
    await service.reconnect("myalias", "test-agent");
    assert.deepStrictEqual(closeEvents, []);
  });
  test("uses sshConfigHost as connection key when present", async () => {
    service.execResponses = discoveryResponses([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]);
    const result = await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    assert.strictEqual(result.connectionId, "ssh:myhost");
    assert.strictEqual(result.sshConfigHost, "myhost");
  });
  test("skips endpoint discovery and CLI install with remoteAgentHostCommand", async () => {
    const result = await service.connect(makeConfig({
      remoteAgentHostCommand: "/custom/agent --port 0"
    }));
    assert.strictEqual(result.connectionId, "testuser@10.0.0.1:22");
    assert.strictEqual(result.serverType, void 0);
    assert.strictEqual(result.instanceId, "override");
    assert.strictEqual(result.lifecycle, "managed");
    assert.strictEqual(service.startCalled, 1);
    assert.deepStrictEqual(service.mockClients[0].execCalls, []);
  });
  test("spawns a dedicated standalone when no live endpoints exist", async () => {
    const newEntry = makeEndpoint({ type: "standalone", pid: 555, instanceId: "spawned-1", endpoint: { type: "tcp", host: "127.0.0.1", port: 9001 } });
    service.execResponses = [
      ...discoveryResponses([]),
      { stdout: "", code: 0 },
      // spawn command (fire-and-forget)
      { stdout: agentEndpointsStdout([newEntry]), code: 0 }
      // wait-poll: agent endpoints (finds the new entry)
    ];
    const result = await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    assert.strictEqual(result.serverType, "standalone");
    assert.strictEqual(result.instanceId, "spawned-1");
    assert.strictEqual(result.lifecycle, "managed");
    assert.strictEqual(result.primary, true);
    assert.strictEqual(service.relayCalled, 1);
    const execCalls = service.mockClients[0].execCalls;
    assert.ok(execCalls.some((c) => c.includes("--idle-timeout 300")), `should spawn with idle timeout; saw: ${JSON.stringify(execCalls)}`);
    assert.ok(execCalls.some((c) => c.includes("--new-instance")), `spawn must request a genuinely new instance; saw: ${JSON.stringify(execCalls)}`);
  });
  test("reuses the single live standalone deterministically without a picker", async () => {
    const events = [];
    service.execResponses = discoveryResponses([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]);
    disposables.add(service.onDidRequestEndpointSelection((r) => events.push(r)));
    const result = await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    assert.strictEqual(result.serverType, "standalone");
    assert.strictEqual(result.instanceId, "inst-1");
    assert.strictEqual(result.lifecycle, "external");
    assert.strictEqual(service.startCalled, 0);
    assert.deepStrictEqual(events, []);
  });
  test("prompts among multiple standalones (no editors) and honors the chosen candidate", async () => {
    const s1 = makeEndpoint({ type: "standalone", pid: 100, instanceId: "inst-a" });
    const s2 = makeEndpoint({ type: "standalone", pid: 200, instanceId: "inst-b" });
    service.execResponses = discoveryResponses([s1, s2]);
    let seenCandidates;
    disposables.add(service.onDidRequestEndpointSelection((r) => {
      seenCandidates = r;
    }));
    const result = await service.withEndpointSelectionResponse(
      { kind: "candidate", type: "standalone", pid: 200, instanceId: "inst-b" },
      () => service.connect(makeConfig({ sshConfigHost: "myhost" }))
    );
    assert.ok(seenCandidates, "should have requested endpoint selection");
    assert.strictEqual(seenCandidates.candidates.length, 2);
    assert.ok(seenCandidates.candidates.every((c) => c.type === "standalone"));
    assert.strictEqual(result.instanceId, "inst-b");
    assert.strictEqual(result.lifecycle, "external");
  });
  test("prompts over every live endpoint when at least one editor exists, and does not touch it", async () => {
    const editor = makeEndpoint({ type: "editor", pid: 300, instanceId: "editor-1", endpoint: { type: "socket", path: "/tmp/agent.sock" } });
    const standalone = makeEndpoint({ type: "standalone", pid: 400, instanceId: "inst-c" });
    service.execResponses = discoveryResponses([editor, standalone]);
    let seenCandidates;
    disposables.add(service.onDidRequestEndpointSelection((r) => {
      seenCandidates = r;
    }));
    const result = await service.withEndpointSelectionResponse(
      { kind: "candidate", type: "editor", pid: 300, instanceId: "editor-1" },
      () => service.connect(makeConfig({ sshConfigHost: "myhost" }))
    );
    assert.strictEqual(seenCandidates.candidates.length, 2);
    assert.strictEqual(result.serverType, "editor");
    assert.strictEqual(result.instanceId, "editor-1");
    assert.strictEqual(result.lifecycle, "external");
    assert.strictEqual(result.primary, true);
    assert.strictEqual(service.startCalled, 0);
  });
  test('choosing "Start New Dedicated Agent Host" from the picker spawns, leaving other live endpoints untouched', async () => {
    const editor = makeEndpoint({ type: "editor", pid: 300, instanceId: "editor-1", endpoint: { type: "socket", path: "/tmp/agent.sock" } });
    const spawned = makeEndpoint({ type: "standalone", pid: 999, instanceId: "spawned-2" });
    service.execResponses = [
      ...discoveryResponses([editor]),
      { stdout: "", code: 0 },
      // spawn command
      { stdout: agentEndpointsStdout([editor, spawned]), code: 0 }
      // wait-poll finds the new standalone
    ];
    const result = await service.withEndpointSelectionResponse(
      { kind: "spawn" },
      () => service.connect(makeConfig({ sshConfigHost: "myhost" }))
    );
    assert.strictEqual(result.instanceId, "spawned-2");
    assert.strictEqual(result.lifecycle, "managed");
    const execCalls = service.mockClients[0].execCalls;
    assert.ok(execCalls.some((c) => c.includes("--new-instance")), `spawn must request a genuinely new instance; saw: ${JSON.stringify(execCalls)}`);
  });
  test("cancelling the endpoint-selection picker rejects connect with cancellation and does not spawn", async () => {
    service.execResponses = discoveryResponses([
      makeEndpoint({ type: "standalone", pid: 100, instanceId: "inst-a" }),
      makeEndpoint({ type: "standalone", pid: 200, instanceId: "inst-b" })
    ]);
    const requestIds = [];
    disposables.add(service.onDidRequestEndpointSelection((r) => requestIds.push(r.requestId)));
    const requestPromise = Event.toPromise(service.onDidRequestEndpointSelection);
    const connectPromise = service.connect(makeConfig({ sshConfigHost: "myhost" }));
    const request = await requestPromise;
    assert.strictEqual(requestIds.length, 1);
    await service.respondEndpointSelection(request.requestId, void 0);
    await assert.rejects(connectPromise, (error) => isCancellationError(error));
    assert.strictEqual(service.startCalled, 0);
    assert.strictEqual(service.relayCalled, 0);
  });
  test("silent reconnect (userInitiated: false) with only an editor entry never prompts and spawns a new dedicated standalone rather than reusing the editor", async () => {
    const editor = makeEndpoint({ type: "editor", pid: 300, instanceId: "editor-1", endpoint: { type: "socket", path: "/tmp/agent.sock" } });
    const spawned = makeEndpoint({ type: "standalone", pid: 999, instanceId: "spawned-3" });
    service.execResponses = [
      ...discoveryResponses([editor]),
      { stdout: "", code: 0 },
      // spawn command (fire-and-forget)
      { stdout: agentEndpointsStdout([editor, spawned]), code: 0 }
      // wait-poll finds the new standalone
    ];
    const events = [];
    disposables.add(service.onDidRequestEndpointSelection((r) => events.push(r)));
    const result = await service.connect(makeConfig({ sshConfigHost: "myhost", userInitiated: false }));
    assert.deepStrictEqual(events, [], "silent reconnect must never fire an endpoint-selection request");
    assert.strictEqual(result.serverType, "standalone");
    assert.strictEqual(result.instanceId, "spawned-3");
    assert.strictEqual(result.lifecycle, "managed");
    const execCalls = service.mockClients[0].execCalls;
    assert.ok(execCalls.some((c) => c.includes("--new-instance")), `spawn must request a genuinely new instance; saw: ${JSON.stringify(execCalls)}`);
  });
  test("silent reconnect (userInitiated: false) reuses the single live standalone deterministically without a picker", async () => {
    service.execResponses = discoveryResponses([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]);
    const events = [];
    disposables.add(service.onDidRequestEndpointSelection((r) => events.push(r)));
    const result = await service.connect(makeConfig({ sshConfigHost: "myhost", userInitiated: false }));
    assert.deepStrictEqual(events, []);
    assert.strictEqual(result.serverType, "standalone");
    assert.strictEqual(result.instanceId, "inst-1");
    assert.strictEqual(result.lifecycle, "external");
    assert.strictEqual(service.startCalled, 0);
  });
  test("silent reconnect (userInitiated: false) with multiple live standalones and an editor reuses the lowest instanceId deterministically without a picker", async () => {
    const editor = makeEndpoint({ type: "editor", pid: 300, instanceId: "editor-1", endpoint: { type: "socket", path: "/tmp/agent.sock" } });
    const s1 = makeEndpoint({ type: "standalone", pid: 100, instanceId: "inst-b" });
    const s2 = makeEndpoint({ type: "standalone", pid: 200, instanceId: "inst-a" });
    service.execResponses = discoveryResponses([editor, s1, s2]);
    const events = [];
    disposables.add(service.onDidRequestEndpointSelection((r) => events.push(r)));
    const result = await service.connect(makeConfig({ sshConfigHost: "myhost", userInitiated: false }));
    assert.deepStrictEqual(events, [], "silent reconnect must never fire an endpoint-selection request, even with multiple candidates");
    assert.strictEqual(result.serverType, "standalone");
    assert.strictEqual(result.instanceId, "inst-a", "must deterministically pick the lowest instanceId");
    assert.strictEqual(result.lifecycle, "external");
    assert.strictEqual(service.startCalled, 0);
  });
  test("cold-start reconnect() via userInitiated=false param never prompts and reuses a live standalone (proves the reconnect() API, not just connect())", async () => {
    const editor = makeEndpoint({ type: "editor", pid: 300, instanceId: "editor-1", endpoint: { type: "socket", path: "/tmp/agent.sock" } });
    const standalone = makeEndpoint({ type: "standalone", pid: 400, instanceId: "inst-c" });
    service.execResponses = discoveryResponses([editor, standalone]);
    const events = [];
    disposables.add(service.onDidRequestEndpointSelection((r) => events.push(r)));
    const result = await service.reconnect(
      "myhost",
      "test-host",
      void 0,
      void 0,
      /* userInitiated */
      false
    );
    assert.deepStrictEqual(events, [], "cold-start silent reconnect() must never fire an endpoint-selection request");
    assert.strictEqual(result.serverType, "standalone");
    assert.strictEqual(result.instanceId, "inst-c");
    assert.strictEqual(result.lifecycle, "external");
    assert.strictEqual(service.startCalled, 0);
  });
  test("cold-start reconnect() via userInitiated=true param still prompts when an editor entry exists", async () => {
    const editor = makeEndpoint({ type: "editor", pid: 300, instanceId: "editor-1", endpoint: { type: "socket", path: "/tmp/agent.sock" } });
    service.execResponses = discoveryResponses([editor]);
    let seenCandidates;
    disposables.add(service.onDidRequestEndpointSelection((r) => {
      seenCandidates = r;
    }));
    const result = await service.withEndpointSelectionResponse(
      { kind: "candidate", type: "editor", pid: 300, instanceId: "editor-1" },
      () => service.reconnect(
        "myhost",
        "test-host",
        void 0,
        void 0,
        /* userInitiated */
        true
      )
    );
    assert.ok(seenCandidates, "user-initiated reconnect() must still show the picker when an editor entry exists");
    assert.strictEqual(result.serverType, "editor");
  });
  test("user-initiated reconnect (userInitiated: true) still prompts when an editor entry exists, contrasting with the silent path", async () => {
    const editor = makeEndpoint({ type: "editor", pid: 300, instanceId: "editor-1", endpoint: { type: "socket", path: "/tmp/agent.sock" } });
    service.execResponses = discoveryResponses([editor]);
    let seenCandidates;
    disposables.add(service.onDidRequestEndpointSelection((r) => {
      seenCandidates = r;
    }));
    const result = await service.withEndpointSelectionResponse(
      { kind: "candidate", type: "editor", pid: 300, instanceId: "editor-1" },
      () => service.connect(makeConfig({ sshConfigHost: "myhost", userInitiated: true }))
    );
    assert.ok(seenCandidates, "user-initiated connects must still show the picker when an editor entry exists");
    assert.strictEqual(result.serverType, "editor");
    assert.strictEqual(result.instanceId, "editor-1");
  });
  test('stored "editor" preference selects the deterministic live editor without a request, even for a silent reconnect', async () => {
    const editorA = makeEndpoint({ type: "editor", pid: 100, instanceId: "editor-b", endpoint: { type: "socket", path: "/tmp/a.sock" } });
    const editorB = makeEndpoint({ type: "editor", pid: 200, instanceId: "editor-a", endpoint: { type: "socket", path: "/tmp/b.sock" } });
    const standalone = makeEndpoint({ type: "standalone", pid: 300, instanceId: "inst-c" });
    service.execResponses = discoveryResponses([editorA, editorB, standalone]);
    const events = [];
    disposables.add(service.onDidRequestEndpointSelection((r) => events.push(r)));
    const result = await service.connect(makeConfig({ sshConfigHost: "myhost", userInitiated: false, preferredAgentLocation: "editor" }));
    assert.deepStrictEqual(events, [], "a stored preference must never fire an endpoint-selection request");
    assert.strictEqual(result.serverType, "editor");
    assert.strictEqual(result.instanceId, "editor-a", "must deterministically pick the lowest instanceId editor");
    assert.strictEqual(result.lifecycle, "external");
  });
  test('stored "editor" preference with no live editor falls back to dedicated selection without a request', async () => {
    const s1 = makeEndpoint({ type: "standalone", pid: 100, instanceId: "inst-b" });
    const s2 = makeEndpoint({ type: "standalone", pid: 200, instanceId: "inst-a" });
    service.execResponses = discoveryResponses([s1, s2]);
    const events = [];
    disposables.add(service.onDidRequestEndpointSelection((r) => events.push(r)));
    const result = await service.connect(makeConfig({ sshConfigHost: "myhost", userInitiated: true, preferredAgentLocation: "editor" }));
    assert.deepStrictEqual(events, [], "unavailable-editor fallback must never fire an endpoint-selection request");
    assert.strictEqual(result.serverType, "standalone");
    assert.strictEqual(result.instanceId, "inst-a", "must deterministically pick the lowest instanceId standalone");
    assert.strictEqual(result.lifecycle, "external");
  });
  test('stored "editor" preference with nothing live spawns a new dedicated agent host without a request', async () => {
    const spawned = makeEndpoint({ type: "standalone", pid: 999, instanceId: "spawned-4" });
    service.execResponses = [
      ...discoveryResponses([]),
      { stdout: "", code: 0 },
      // spawn command
      { stdout: agentEndpointsStdout([spawned]), code: 0 }
      // wait-poll finds the new standalone
    ];
    const events = [];
    disposables.add(service.onDidRequestEndpointSelection((r) => events.push(r)));
    const result = await service.connect(makeConfig({ sshConfigHost: "myhost", userInitiated: false, preferredAgentLocation: "editor" }));
    assert.deepStrictEqual(events, []);
    assert.strictEqual(result.serverType, "standalone");
    assert.strictEqual(result.instanceId, "spawned-4");
    assert.strictEqual(result.lifecycle, "managed");
  });
  test('stored "dedicated" preference selects dedicated even when an editor is live, without a request', async () => {
    const editor = makeEndpoint({ type: "editor", pid: 300, instanceId: "editor-1", endpoint: { type: "socket", path: "/tmp/agent.sock" } });
    const standalone = makeEndpoint({ type: "standalone", pid: 400, instanceId: "inst-c" });
    service.execResponses = discoveryResponses([editor, standalone]);
    const events = [];
    disposables.add(service.onDidRequestEndpointSelection((r) => events.push(r)));
    const result = await service.connect(makeConfig({ sshConfigHost: "myhost", userInitiated: true, preferredAgentLocation: "dedicated" }));
    assert.deepStrictEqual(events, [], 'stored "dedicated" preference must never fire an endpoint-selection request, even user-initiated');
    assert.strictEqual(result.serverType, "standalone");
    assert.strictEqual(result.instanceId, "inst-c");
    assert.strictEqual(result.lifecycle, "external");
    assert.strictEqual(service.startCalled, 0);
  });
  test('stored "dedicated" preference with nothing live spawns a new dedicated agent host without a request', async () => {
    const spawned = makeEndpoint({ type: "standalone", pid: 999, instanceId: "spawned-5" });
    service.execResponses = [
      ...discoveryResponses([]),
      { stdout: "", code: 0 },
      { stdout: agentEndpointsStdout([spawned]), code: 0 }
    ];
    const events = [];
    disposables.add(service.onDidRequestEndpointSelection((r) => events.push(r)));
    const result = await service.connect(makeConfig({ sshConfigHost: "myhost", userInitiated: true, preferredAgentLocation: "dedicated" }));
    assert.deepStrictEqual(events, []);
    assert.strictEqual(result.serverType, "standalone");
    assert.strictEqual(result.instanceId, "spawned-5");
    assert.strictEqual(result.lifecycle, "managed");
  });
  test("cold-start reconnect() threads preferredAgentLocation through to selectEndpoint and never prompts when a preference is stored", async () => {
    const editorA = makeEndpoint({ type: "editor", pid: 100, instanceId: "editor-b", endpoint: { type: "socket", path: "/tmp/a.sock" } });
    const editorB = makeEndpoint({ type: "editor", pid: 200, instanceId: "editor-a", endpoint: { type: "socket", path: "/tmp/b.sock" } });
    service.execResponses = discoveryResponses([editorA, editorB]);
    const events = [];
    disposables.add(service.onDidRequestEndpointSelection((r) => events.push(r)));
    const result = await service.reconnect(
      "myhost",
      "test-host",
      void 0,
      void 0,
      /* userInitiated */
      true,
      /* preferredAgentLocation */
      "editor"
    );
    assert.deepStrictEqual(events, []);
    assert.strictEqual(result.serverType, "editor");
    assert.strictEqual(result.instanceId, "editor-a");
  });
  test("relay failure to a selected endpoint rereads the registry once and throws, never silently promotes or spawns", async () => {
    service.execResponses = [
      ...discoveryResponses([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]),
      { stdout: agentEndpointsStdout([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]), code: 0 }
      // diagnostic reread
    ];
    service.relayResult = new Error("connection refused");
    await assert.rejects(
      () => service.connect(makeConfig({ sshConfigHost: "myhost" })),
      /Failed to connect to the selected remote agent host/
    );
    assert.strictEqual(service.startCalled, 0);
    assert.strictEqual(service.relayCalled, 1);
    const agentEndpointsCalls = service.mockClients[0].execCalls.filter((c) => c.includes("agent endpoints"));
    assert.strictEqual(agentEndpointsCalls.length, 2);
  });
  test("does not retry when relay fails on a freshly spawned agent", async () => {
    const newEntry = makeEndpoint({ type: "standalone", pid: 555, instanceId: "spawned-1" });
    service.execResponses = [
      ...discoveryResponses([]),
      { stdout: "", code: 0 },
      { stdout: agentEndpointsStdout([newEntry]), code: 0 },
      { stdout: agentEndpointsStdout([newEntry]), code: 0 }
      // diagnostic reread after relay failure
    ];
    service.relayResult = new Error("connection refused");
    await assert.rejects(
      () => service.connect(makeConfig({ sshConfigHost: "myhost" })),
      /connection refused/
    );
    assert.strictEqual(service.startCalled, 0);
    assert.strictEqual(service.relayCalled, 1);
  });
  test("cleans up SSH client on error", async () => {
    service.execResponses = discoveryResponses([]);
    service.execResponses.push({ stdout: "", code: 0 });
    service.execResponses.push({ stdout: agentEndpointsStdout([makeEndpoint({ type: "standalone", pid: 1, instanceId: "i1" })]), code: 0 });
    service.execResponses.push({ stdout: agentEndpointsStdout([]), code: 0 });
    service.relayResult = new Error("boom");
    await assert.rejects(() => service.connect(makeConfig({ sshConfigHost: "myhost" })));
    assert.strictEqual(service.mockClients[0].ended, true);
  });
  test("sanitizes config in result (strips password and privateKeyPath)", async () => {
    const result = await service.connect(makeConfig({
      remoteAgentHostCommand: "/agent",
      authMethod: SSHAuthMethod.Password,
      password: "secret123",
      privateKeyPath: "/home/user/.ssh/id_rsa"
    }));
    assert.strictEqual(result.config["password"], void 0);
    assert.strictEqual(result.config["privateKeyPath"], void 0);
    assert.strictEqual(result.config.host, "10.0.0.1");
  });
  test("disconnect removes connection and allows reconnect", async () => {
    const result = await service.connect(makeConfig({
      remoteAgentHostCommand: "/agent"
    }));
    await service.disconnect(result.connectionId);
    service.startCalled = 0;
    const result2 = await service.connect(makeConfig({
      remoteAgentHostCommand: "/agent"
    }));
    assert.strictEqual(service.startCalled, 1);
    assert.strictEqual(result2.connectionId, result.connectionId);
  });
  test("fires onDidChangeConnections on connect and disconnect", async () => {
    const events = [];
    disposables.add(service.onDidChangeConnections(() => events.push("changed")));
    disposables.add(service.onDidCloseConnection((id) => events.push(`closed:${id}`)));
    const result = await service.connect(makeConfig({
      remoteAgentHostCommand: "/agent"
    }));
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0], "changed");
    await service.disconnect(result.connectionId);
    assert.deepStrictEqual(events, [
      "changed",
      `closed:${result.connectionId}`,
      "changed"
    ]);
  });
  test("relay messages fire onDidRelayMessage with correct connectionId", async () => {
    const result = await service.connect(makeConfig({
      remoteAgentHostCommand: "/agent"
    }));
    const messages = [];
    disposables.add(service.onDidRelayMessage((msg) => messages.push(msg)));
    service.simulateRelayMessage('{"jsonrpc":"2.0","id":1}');
    service.simulateRelayMessage('{"jsonrpc":"2.0","id":2}');
    assert.deepStrictEqual(messages, [
      { connectionId: result.connectionId, data: '{"jsonrpc":"2.0","id":1}' },
      { connectionId: result.connectionId, data: '{"jsonrpc":"2.0","id":2}' }
    ]);
  });
  test("relay close fires onDidRelayClose with correct connectionId", async () => {
    const result = await service.connect(makeConfig({
      remoteAgentHostCommand: "/agent"
    }));
    const closes = [];
    disposables.add(service.onDidRelayClose((id) => closes.push(id)));
    service.simulateCurrentRelayClose();
    assert.deepStrictEqual(closes, [result.connectionId]);
  });
  test("relaySend delivers data to the correct connection", async () => {
    const sentData = [];
    service.relayResult = {
      send: (data) => sentData.push(data),
      close: () => {
      }
    };
    const result = await service.connect(makeConfig({
      remoteAgentHostCommand: "/agent"
    }));
    await service.relaySend(result.connectionId, "hello");
    await service.relaySend(result.connectionId, "world");
    assert.deepStrictEqual(sentData, ["hello", "world"]);
  });
  test("relaySend to unknown connectionId is a no-op", async () => {
    await service.connect(makeConfig({ remoteAgentHostCommand: "/agent" }));
    await service.relaySend("nonexistent", "data");
  });
  test("connects to two different hosts independently", async () => {
    const r1 = await service.connect(makeConfig({
      host: "10.0.0.1",
      remoteAgentHostCommand: "/agent"
    }));
    const r2 = await service.connect(makeConfig({
      host: "10.0.0.2",
      remoteAgentHostCommand: "/agent"
    }));
    assert.notStrictEqual(r1.connectionId, r2.connectionId);
    assert.strictEqual(service.startCalled, 2);
    assert.strictEqual(service.relayCalled, 2);
  });
  test("disconnect one host does not affect the other", async () => {
    const r1 = await service.connect(makeConfig({
      host: "10.0.0.1",
      remoteAgentHostCommand: "/agent"
    }));
    const r2 = await service.connect(makeConfig({
      host: "10.0.0.2",
      remoteAgentHostCommand: "/agent"
    }));
    await service.disconnect(r1.connectionId);
    const r2Again = await service.connect(makeConfig({
      host: "10.0.0.2",
      remoteAgentHostCommand: "/agent"
    }));
    assert.strictEqual(r2Again.connectionId, r2.connectionId);
    assert.strictEqual(service.startCalled, 2);
    assert.strictEqual(service.relayCalled, 2);
  });
  test("relay messages from two connections are distinguished by connectionId", async () => {
    const r1 = await service.connect(makeConfig({
      host: "10.0.0.1",
      remoteAgentHostCommand: "/agent"
    }));
    const r2 = await service.connect(makeConfig({
      host: "10.0.0.2",
      remoteAgentHostCommand: "/agent"
    }));
    const messages = [];
    disposables.add(service.onDidRelayMessage((msg) => messages.push(msg)));
    service.simulateRelayMessage("msg-from-host1", 0);
    service.simulateRelayMessage("msg-from-host2", 1);
    assert.deepStrictEqual(messages, [
      { connectionId: r1.connectionId, data: "msg-from-host1" },
      { connectionId: r2.connectionId, data: "msg-from-host2" }
    ]);
  });
  test("reconnect after disconnect establishes a new SSH connection", async () => {
    service.execResponses = discoveryResponses([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]);
    const r1 = await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    assert.strictEqual(service.mockClients.length, 1);
    await service.disconnect(r1.connectionId);
    service.execResponses = discoveryResponses([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]);
    const r2 = await service.reconnect("myhost", "test-host");
    assert.strictEqual(service.mockClients.length, 2);
    assert.strictEqual(r2.connectionId, r1.connectionId);
  });
  test("fires progress events during connect", async () => {
    service.execResponses = discoveryResponses([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]);
    const progress = [];
    disposables.add(service.onDidReportConnectProgress((p) => progress.push(p)));
    await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    assert.ok(progress.length >= 3, `expected at least 3 progress events, got ${progress.length}`);
    assert.ok(progress.every((p) => p.connectionKey === "ssh:myhost"));
    assert.ok(progress.every((p) => p.message.length > 0), "all progress messages should be non-empty");
  });
  test("cancelling keyboard-interactive prompt rejects connect with cancellation", async () => {
    const kbiService = disposables.add(new KeyboardInteractiveConnectTestService(
      new NullLogService(),
      {
        _serviceBrand: void 0,
        quality,
        dataFolderName
      }
    ));
    const request = new DeferredPromise();
    disposables.add(kbiService.onDidRequestKeyboardInteractive((kbiRequest2) => request.complete(kbiRequest2)));
    const connectPromise = kbiService.connectSSHForTest(makeConfig({ sshConfigHost: "test-host" }));
    const kbiRequest = await request.p;
    await kbiService.respondKeyboardInteractive(kbiRequest.requestId, void 0);
    await assert.rejects(connectPromise, (error) => isCancellationError(error));
    assert.deepStrictEqual({
      ended: kbiService.client.ended,
      finishResponses: kbiService.client.finishResponses
    }, {
      ended: true,
      finishResponses: []
    });
  });
  test("responding to keyboard-interactive prompt does not cancel connection attempt", async () => {
    let finished;
    let cancelled = false;
    const requestId = service.startKeyboardInteractiveForTest([
      { prompt: "Password: ", echo: false }
    ], (responses) => {
      finished = responses;
    }, () => {
      cancelled = true;
    });
    await service.respondKeyboardInteractive(requestId, ["secret"]);
    assert.deepStrictEqual({ finished, cancelled }, {
      finished: ["secret"],
      cancelled: false
    });
  });
  test("SSH client close event disposes the connection", async () => {
    const result = await service.connect(makeConfig({
      remoteAgentHostCommand: "/agent"
    }));
    const closeEvents = [];
    disposables.add(service.onDidCloseConnection((id) => closeEvents.push(id)));
    service.mockClients[0].fireClose();
    assert.deepStrictEqual(closeEvents, [result.connectionId]);
  });
  test("refreshes an installed CLI instead of downloading it directly", async () => {
    service.execResponses = discoveryResponses([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]);
    await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    const execCalls = service.mockClients[0].execCalls;
    assert.deepStrictEqual({
      refreshAttempted: execCalls.some((c) => c.includes("code-insiders update")),
      downloadAttempted: execCalls.some((c) => c.includes("curl") || c.includes("tar"))
    }, {
      refreshAttempted: true,
      downloadAttempted: false
    });
  });
  test("downloads CLI when version check fails", async () => {
    service.execResponses = [
      { stdout: "Linux\n", code: 0 },
      // uname -s
      { stdout: "x86_64\n", code: 0 },
      // uname -m
      { stdout: "", code: 127 },
      // CLI --version fails (not found)
      { stdout: "", code: 0 },
      // curl | tar install
      { stdout: agentEndpointsStdout([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]), code: 0 },
      // agent endpoints
      { stdout: "", code: 0 }
      // kill -0 (alive)
    ];
    await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    const execCalls = service.mockClients[0].execCalls;
    assert.ok(
      execCalls.some((c) => c.includes("curl")),
      "should download CLI when not installed"
    );
  });
  test("warns and reuses the installed CLI when refresh fails", async () => {
    const logService = new RecordingLogService();
    const productService = {
      _serviceBrand: void 0,
      quality,
      dataFolderName
    };
    const loggingService = disposables.add(new TestableSSHRemoteAgentHostMainService(
      logService,
      productService
    ));
    loggingService.execResponses = [
      { stdout: "Linux\n", code: 0 },
      { stdout: "x86_64\n", code: 0 },
      { stdout: "1.0.0\nupdate failed\n__vscode_cli_update_exit_code__:1\n", code: 0 },
      { stdout: agentEndpointsStdout([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]), code: 0 },
      { stdout: "", code: 0 }
    ];
    await loggingService.connect(makeConfig({ sshConfigHost: "myhost" }));
    assert.deepStrictEqual(logService.warnings, [
      "[SSHRemoteAgentHost] Desktop has no product commit; falling back to non-pinned CLI install at ~/.vscode-server-oss/code-insiders.",
      "[SSHRemoteAgentHost] Could not refresh the dev-build remote CLI at ~/.vscode-server-oss/code-insiders; reusing the existing executable: update exited 1"
    ]);
  });
  test("logs connection failures in the shared service", async () => {
    const logService = new RecordingLogService();
    const productService = {
      _serviceBrand: void 0,
      quality,
      dataFolderName
    };
    const loggingService = disposables.add(new TestableSSHRemoteAgentHostMainService(
      logService,
      productService
    ));
    loggingService.execResponses = [
      { stdout: "Linux\n", code: 0 },
      { stdout: "x86_64\n", code: 0 },
      { stdout: "1.0.0\n", code: 0 },
      { stdout: "not json", code: 0 }
    ];
    await assert.rejects(loggingService.connect(makeConfig({ sshConfigHost: "myhost" })));
    assert.deepStrictEqual(logService.errors, [
      `[SSHRemoteAgentHost] Failed to connect to myhost 'agent endpoints' produced unparsable output (8 characters)`
    ]);
  });
  suite("commit-pinned install", () => {
    const commit = "abcdef0123456789abcdef0123456789abcdef01";
    const cliBin = `~/.vscode-insiders/code-insiders-${commit}`;
    let pinnedService;
    setup(() => {
      const logService = new NullLogService();
      const productService = {
        _serviceBrand: void 0,
        quality,
        dataFolderName,
        serverDataFolderName: ".vscode-insiders",
        commit
      };
      pinnedService = new TestableSSHRemoteAgentHostMainService(
        logService,
        productService
      );
      disposables.add(pinnedService);
    });
    const oneStandaloneEndpoints = () => agentEndpointsStdout([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]);
    test("always invokes cleanup of old commit-keyed CLIs", async () => {
      pinnedService.execResponses = [
        { stdout: "Linux\n", code: 0 },
        { stdout: "x86_64\n", code: 0 },
        { stdout: "", code: 0 },
        // test -x cliBin → present
        { stdout: "", code: 0 },
        // touch cliBin (refresh mtime on reuse)
        { stdout: "", code: 0 },
        // cleanup (runs after reuse decision)
        { stdout: oneStandaloneEndpoints(), code: 0 },
        // agent endpoints
        { stdout: "", code: 0 }
        // kill -0 (alive)
      ];
      await pinnedService.connect(makeConfig({ sshConfigHost: "myhost" }));
      const execCalls = pinnedService.mockClients[0].execCalls;
      assert.ok(
        execCalls.some((c) => /ls -1t .*code-insiders-/.test(c) && /awk\s+'NR>5'/.test(c)),
        `cleanup command should have run; saw: ${JSON.stringify(execCalls)}`
      );
    });
    test("reuses existing commit-keyed CLI without re-downloading", async () => {
      pinnedService.execResponses = [
        { stdout: "Linux\n", code: 0 },
        { stdout: "x86_64\n", code: 0 },
        { stdout: "", code: 0 },
        // test -x cliBin → 0 (present)
        { stdout: "", code: 0 },
        // touch cliBin
        { stdout: "", code: 0 },
        // cleanup
        { stdout: oneStandaloneEndpoints(), code: 0 },
        // agent endpoints
        { stdout: "", code: 0 }
        // kill -0 (alive)
      ];
      await pinnedService.connect(makeConfig({ sshConfigHost: "myhost" }));
      const execCalls = pinnedService.mockClients[0].execCalls;
      assert.ok(
        execCalls.some((c) => c.includes(`test -x ${cliBin}`)),
        `should test for commit-keyed CLI; saw: ${JSON.stringify(execCalls)}`
      );
      assert.ok(
        !execCalls.some((c) => c.includes("curl")),
        `should not download when commit-keyed CLI present; saw: ${JSON.stringify(execCalls)}`
      );
    });
    test("downloads from commit-pinned URL when CLI is missing", async () => {
      pinnedService.execResponses = [
        { stdout: "Linux\n", code: 0 },
        { stdout: "x86_64\n", code: 0 },
        { stdout: "", code: 1 },
        // test -x → missing
        { stdout: "", code: 0 },
        // mkdir+mktemp+curl|tar+mv+chmod+rm
        { stdout: "1.0.0\n", code: 0 },
        // <cliBin> --version validation
        { stdout: "", code: 0 },
        // cleanup (after successful install)
        { stdout: oneStandaloneEndpoints(), code: 0 },
        // agent endpoints
        { stdout: "", code: 0 }
        // kill -0 (alive)
      ];
      await pinnedService.connect(makeConfig({ sshConfigHost: "myhost" }));
      const execCalls = pinnedService.mockClients[0].execCalls;
      const installCall = execCalls.find((c) => c.includes("curl"));
      assert.ok(installCall, `should have run curl install; saw: ${JSON.stringify(execCalls)}`);
      assert.ok(
        installCall.includes(`commit:${commit}`),
        `install URL should be commit-pinned; got: ${installCall}`
      );
      assert.ok(
        installCall.includes(`mv `) && installCall.includes(cliBin),
        `install should atomic-mv into commit-keyed path; got: ${installCall}`
      );
    });
    test("falls back to any usable CLI when commit-pinned download fails", async () => {
      const fallbackBin = `~/.vscode-insiders/code-insiders-0000000000000000000000000000000000000000`;
      pinnedService.execResponses = [
        { stdout: "Linux\n", code: 0 },
        { stdout: "x86_64\n", code: 0 },
        { stdout: "", code: 1 },
        // test -x → missing
        { stdout: "", code: 7 },
        // install fails (curl exit 7)
        { stdout: `${fallbackBin}
`, code: 0 },
        // fallback finder lists old commit-keyed
        { stdout: "1.0.0\n", code: 0 },
        // fallback --version succeeds
        { stdout: oneStandaloneEndpoints(), code: 0 },
        // agent endpoints
        { stdout: "", code: 0 }
        // kill -0 (alive)
      ];
      await pinnedService.connect(makeConfig({ sshConfigHost: "myhost" }));
      const execCalls = pinnedService.mockClients[0].execCalls;
      assert.ok(
        execCalls.some((c) => /ls -1t .*code-insiders-/.test(c) && c.includes(".vscode-cli-insider/code-insiders")),
        `should have run fallback finder; saw: ${JSON.stringify(execCalls)}`
      );
      assert.ok(
        execCalls.some((c) => c.includes(`${fallbackBin} --version`)),
        `should --version-validate fallback; saw: ${JSON.stringify(execCalls)}`
      );
    });
    test("propagates install error when no fallback CLI exists", async () => {
      pinnedService.execResponses = [
        { stdout: "Linux\n", code: 0 },
        { stdout: "x86_64\n", code: 0 },
        { stdout: "", code: 1 },
        // test -x → missing
        { stdout: "", code: 7 },
        // install fails
        { stdout: "", code: 0 }
        // fallback finder returns nothing
      ];
      await assert.rejects(pinnedService.connect(makeConfig({ sshConfigHost: "myhost" })));
    });
  });
  test("uses host:port as connection key without sshConfigHost", async () => {
    const result = await service.connect(makeConfig({
      host: "192.168.1.1",
      port: 2222,
      remoteAgentHostCommand: "/agent"
    }));
    assert.strictEqual(result.connectionId, "testuser@192.168.1.1:2222");
  });
  test("defaults to port 22 in connection key", async () => {
    const result = await service.connect(makeConfig({
      host: "192.168.1.1",
      remoteAgentHostCommand: "/agent"
    }));
    assert.strictEqual(result.connectionId, "testuser@192.168.1.1:22");
  });
  test("reconnect preserves connection token and address", async () => {
    service.execResponses = discoveryResponses([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]);
    const original = await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    const reconnected = await service.reconnect("myhost", "new-name");
    assert.strictEqual(reconnected.connectionToken, original.connectionToken);
    assert.strictEqual(reconnected.address, original.address);
    assert.strictEqual(reconnected.connectionId, original.connectionId);
  });
  test("messages from superseded relay still arrive (only close is suppressed)", async () => {
    service.execResponses = discoveryResponses([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]);
    const result = await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    const messages = [];
    disposables.add(service.onDidRelayMessage((msg) => messages.push(msg)));
    await service.reconnect("myhost", "test-host");
    service.simulateRelayMessage("stale-message", 0);
    service.simulateRelayMessage("fresh-message", 1);
    assert.deepStrictEqual(messages, [
      { connectionId: result.connectionId, data: "stale-message" },
      { connectionId: result.connectionId, data: "fresh-message" }
    ]);
  });
  test("reconnect cleans up SSH client when relay recreation fails", async () => {
    service.execResponses = discoveryResponses([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]);
    await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    const originalClient = service.mockClients[0];
    assert.strictEqual(originalClient.ended, false);
    service.relayHook = (call) => {
      if (call === 2) {
        return new Error("relay failed");
      }
      return void 0;
    };
    const closeEvents = [];
    disposables.add(service.onDidCloseConnection((id) => closeEvents.push(id)));
    await assert.rejects(
      () => service.reconnect("myhost", "test-host"),
      /relay failed/
    );
    assert.strictEqual(originalClient.ended, true);
    assert.deepStrictEqual(closeEvents, ["ssh:myhost"]);
  });
  test("reconnect rejects with timeout when relay creation hangs (silently dead SSH client)", async () => {
    service.execResponses = discoveryResponses([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]);
    await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    const originalClient = service.mockClients[0];
    assert.strictEqual(originalClient.ended, false);
    service.setRelayCreationTimeoutForTest(50);
    service.hangRelayCreationOnCall = 2;
    const closeEvents = [];
    disposables.add(service.onDidCloseConnection((id) => closeEvents.push(id)));
    await assert.rejects(
      () => service.reconnect("myhost", "test-host"),
      /timed out|timeout/i,
      "reconnect should reject (with a timeout error) instead of hanging when relay creation never settles"
    );
    assert.strictEqual(originalClient.ended, true, "dead SSH client should be ended");
    assert.deepStrictEqual(closeEvents, ["ssh:myhost"]);
  });
  test("reconnect removes old close/error listeners from shared SSH client", async () => {
    service.execResponses = discoveryResponses([makeEndpoint({ type: "standalone", pid: 1234, instanceId: "inst-1" })]);
    await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    const client = service.mockClients[0];
    const closeListenersBefore = client.closeListenerCount;
    const errorListenersBefore = client.errorListenerCount;
    assert.ok(closeListenersBefore > 0, "should have close listeners after connect");
    assert.ok(errorListenersBefore > 0, "should have error listeners after connect");
    await service.reconnect("myhost", "test-host");
    assert.strictEqual(client.closeListenerCount, closeListenersBefore);
    assert.strictEqual(client.errorListenerCount, errorListenersBefore);
  });
});
class AuthAttemptsTestService extends SSHRemoteAgentHostMainService {
  constructor() {
    super(...arguments);
    this.agentSock = void 0;
    this.keyFiles = /* @__PURE__ */ new Map();
  }
  async testBuildAuthAttempts(config) {
    return this._buildAuthAttempts(config);
  }
  _isAgentAvailable() {
    return this.agentSock;
  }
  async _readKeyFileIfExists(keyPath) {
    return this.keyFiles.get(keyPath);
  }
}
suite("SSHRemoteAgentHostMainService - _buildAuthAttempts", () => {
  const disposables = new DisposableStore();
  let service;
  setup(() => {
    const logService = new NullLogService();
    const productService = {
      _serviceBrand: void 0,
      quality,
      dataFolderName
    };
    service = new AuthAttemptsTestService(
      logService,
      productService
    );
    disposables.add(service);
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  const RSA = Buffer.from("rsa-key-bytes");
  const ED = Buffer.from("ed25519-key-bytes");
  const EXPLICIT = Buffer.from("explicit-key-bytes");
  function sshString(value) {
    const valueBuffer = Buffer.from(value, "utf8");
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32BE(valueBuffer.length, 0);
    return Buffer.concat([lengthBuffer, valueBuffer]);
  }
  function openSSHPrivateKeyWithCipher(cipher) {
    const data = Buffer.concat([
      Buffer.from("openssh-key-v1\0", "utf8"),
      sshString(cipher)
    ]);
    return Buffer.from([
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      data.toString("base64"),
      "-----END OPENSSH PRIVATE KEY-----"
    ].join("\n"));
  }
  test("Agent + no SSH_AUTH_SOCK + only id_rsa exists \u2192 publickey id_rsa, then keyboard-interactive", async () => {
    service.agentSock = void 0;
    service.keyFiles.set("~/.ssh/id_rsa", RSA);
    const attempts = await service.testBuildAuthAttempts(makeConfig({ authMethod: SSHAuthMethod.Agent }));
    assert.deepStrictEqual(attempts, [
      { type: "publickey", username: "testuser", key: RSA, keyPath: "~/.ssh/id_rsa" },
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("Agent + SSH_AUTH_SOCK + only id_rsa exists \u2192 agent then publickey id_rsa, then keyboard-interactive", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    service.keyFiles.set("~/.ssh/id_rsa", RSA);
    const attempts = await service.testBuildAuthAttempts(makeConfig({ authMethod: SSHAuthMethod.Agent }));
    assert.deepStrictEqual(attempts, [
      { type: "agent", username: "testuser", agent: "/tmp/ssh-agent.sock" },
      { type: "publickey", username: "testuser", key: RSA, keyPath: "~/.ssh/id_rsa" },
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("Agent + SSH_AUTH_SOCK + id_ed25519 and id_rsa exist \u2192 agent then both keys in default order, then keyboard-interactive", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    service.keyFiles.set("~/.ssh/id_ed25519", ED);
    service.keyFiles.set("~/.ssh/id_rsa", RSA);
    const attempts = await service.testBuildAuthAttempts(makeConfig({ authMethod: SSHAuthMethod.Agent }));
    assert.deepStrictEqual(attempts, [
      { type: "agent", username: "testuser", agent: "/tmp/ssh-agent.sock" },
      { type: "publickey", username: "testuser", key: ED, keyPath: "~/.ssh/id_ed25519" },
      { type: "publickey", username: "testuser", key: RSA, keyPath: "~/.ssh/id_rsa" },
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("Agent + SSH_AUTH_SOCK + no default keys \u2192 agent then keyboard-interactive", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    const attempts = await service.testBuildAuthAttempts(makeConfig({ authMethod: SSHAuthMethod.Agent }));
    assert.deepStrictEqual(attempts, [
      { type: "agent", username: "testuser", agent: "/tmp/ssh-agent.sock" },
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("Agent + IdentityAgent uses configured agent endpoint before default keys", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    service.keyFiles.set("~/.ssh/id_rsa", RSA);
    const attempts = await service.testBuildAuthAttempts(makeConfig({
      authMethod: SSHAuthMethod.Agent,
      identityAgent: "//./pipe/pageant.user.1234"
    }));
    assert.deepStrictEqual(attempts, [
      { type: "agent", username: "testuser", agent: "//./pipe/pageant.user.1234" },
      { type: "publickey", username: "testuser", key: RSA, keyPath: "~/.ssh/id_rsa" },
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("Agent + IdentityAgent SSH_AUTH_SOCK uses the default agent endpoint", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    const attempts = await service.testBuildAuthAttempts(makeConfig({
      authMethod: SSHAuthMethod.Agent,
      identityAgent: "SSH_AUTH_SOCK"
    }));
    assert.deepStrictEqual(attempts, [
      { type: "agent", username: "testuser", agent: "/tmp/ssh-agent.sock" },
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("Agent + IdentityAgent none disables the default SSH_AUTH_SOCK fallback", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    const attempts = await service.testBuildAuthAttempts(makeConfig({
      authMethod: SSHAuthMethod.Agent,
      identityAgent: "none"
    }));
    assert.deepStrictEqual(attempts, [
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("Agent + explicit privateKeyPath + SSH_AUTH_SOCK + id_rsa \u2192 agent first, then explicit, id_rsa, keyboard-interactive", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    service.keyFiles.set("/some/explicit/key", EXPLICIT);
    service.keyFiles.set("~/.ssh/id_rsa", RSA);
    const attempts = await service.testBuildAuthAttempts(makeConfig({
      authMethod: SSHAuthMethod.Agent,
      privateKeyPath: "/some/explicit/key"
    }));
    assert.deepStrictEqual(attempts, [
      { type: "agent", username: "testuser", agent: "/tmp/ssh-agent.sock" },
      { type: "publickey", username: "testuser", key: EXPLICIT, keyPath: "/some/explicit/key" },
      { type: "publickey", username: "testuser", key: RSA, keyPath: "~/.ssh/id_rsa" },
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("Agent + explicit privateKeyPath that matches a default \u2192 explicit added once, then keyboard-interactive", async () => {
    service.agentSock = void 0;
    service.keyFiles.set("~/.ssh/id_rsa", RSA);
    const attempts = await service.testBuildAuthAttempts(makeConfig({
      authMethod: SSHAuthMethod.Agent,
      privateKeyPath: "~/.ssh/id_rsa"
    }));
    assert.deepStrictEqual(attempts, [
      { type: "publickey", username: "testuser", key: RSA, keyPath: "~/.ssh/id_rsa" },
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("Agent + explicit privateKeyPath as absolute default path \u2192 agent first, key added once", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    service.keyFiles.set("~/.ssh/id_ed25519", ED);
    const absoluteDefault = `${os.homedir()}/.ssh/id_ed25519`;
    const attempts = await service.testBuildAuthAttempts(makeConfig({
      authMethod: SSHAuthMethod.Agent,
      privateKeyPath: absoluteDefault
    }));
    assert.deepStrictEqual(attempts, [
      { type: "agent", username: "testuser", agent: "/tmp/ssh-agent.sock" },
      { type: "publickey", username: "testuser", key: ED, keyPath: "~/.ssh/id_ed25519" },
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("KeyFile + explicit path \u2192 publickey only", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    service.keyFiles.set("/some/explicit/key", EXPLICIT);
    service.keyFiles.set("~/.ssh/id_rsa", RSA);
    const attempts = await service.testBuildAuthAttempts(makeConfig({
      authMethod: SSHAuthMethod.KeyFile,
      privateKeyPath: "/some/explicit/key"
    }));
    assert.deepStrictEqual(attempts, [
      { type: "publickey", username: "testuser", key: EXPLICIT, keyPath: "/some/explicit/key" }
    ]);
  });
  test("KeyFile + encrypted OpenSSH key marks attempt as encrypted", async () => {
    const encryptedKey = openSSHPrivateKeyWithCipher("aes256-ctr");
    service.keyFiles.set("/some/encrypted/key", encryptedKey);
    const attempts = await service.testBuildAuthAttempts(makeConfig({
      authMethod: SSHAuthMethod.KeyFile,
      privateKeyPath: "/some/encrypted/key"
    }));
    assert.deepStrictEqual(attempts, [
      { type: "publickey", username: "testuser", key: encryptedKey, keyPath: "/some/encrypted/key", encrypted: true }
    ]);
  });
  test("KeyFile + missing privateKeyPath throws", async () => {
    await assert.rejects(
      () => service.testBuildAuthAttempts(makeConfig({ authMethod: SSHAuthMethod.KeyFile })),
      /private key path/i
    );
  });
  test("KeyFile + unreadable key throws with the path in the message", async () => {
    await assert.rejects(
      () => service.testBuildAuthAttempts(makeConfig({
        authMethod: SSHAuthMethod.KeyFile,
        privateKeyPath: "/missing/key"
      })),
      /\/missing\/key/
    );
  });
  test("Password \u2192 password only", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    service.keyFiles.set("~/.ssh/id_rsa", RSA);
    const attempts = await service.testBuildAuthAttempts(makeConfig({
      authMethod: SSHAuthMethod.Password,
      password: "pw"
    }));
    assert.deepStrictEqual(attempts, [
      { type: "password", username: "testuser", password: "pw" }
    ]);
  });
});
suite("SSHRemoteAgentHostMainService - makeAuthHandler", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const KEY = Buffer.from("k");
  const attempts = [
    { type: "agent", username: "u", agent: "/sock" },
    { type: "publickey", username: "u", key: KEY, keyPath: "~/.ssh/id_rsa" }
  ];
  test("walks attempts in order, then signals exhaustion", () => {
    const handler = makeAuthHandler(attempts, new NullLogService());
    const calls = [];
    handler(null, false, (next) => calls.push(next));
    handler(["publickey"], false, (next) => calls.push(next));
    handler(["publickey"], false, (next) => calls.push(next));
    assert.deepStrictEqual(calls, [
      { type: "agent", username: "u", agent: "/sock" },
      { type: "publickey", username: "u", key: KEY },
      // keyPath stripped
      false
    ]);
  });
  test("skips attempts whose method the server has rejected", () => {
    const handler = makeAuthHandler(attempts, new NullLogService());
    const calls = [];
    handler(["password"], false, (next) => calls.push(next));
    assert.deepStrictEqual(calls, [false]);
  });
  test("agent attempts are kept when server allows publickey", () => {
    const handler = makeAuthHandler(
      [{ type: "agent", username: "u", agent: "/sock" }],
      new NullLogService()
    );
    const calls = [];
    handler(["publickey"], false, (next) => calls.push(next));
    assert.deepStrictEqual(calls, [{ type: "agent", username: "u", agent: "/sock" }]);
  });
  test("keyboard-interactive routes prompts to the kbi handler and is skipped without one", () => {
    const kbiAttempts = [
      { type: "keyboard-interactive", username: "u" },
      { type: "publickey", username: "u", key: KEY, keyPath: "~/.ssh/id_rsa" }
    ];
    const handlerNoKbi = makeAuthHandler(kbiAttempts, new NullLogService());
    const callsNoKbi = [];
    handlerNoKbi(null, false, (next) => callsNoKbi.push(next));
    assert.deepStrictEqual(callsNoKbi, [{ type: "publickey", username: "u", key: KEY }]);
    let promptArgs;
    const handlerWithKbi = makeAuthHandler(kbiAttempts, new NullLogService(), (name, instructions, prompts, finish) => {
      promptArgs = { name, instructions, prompts };
      finish(["secret"]);
    });
    const callsWithKbi = [];
    handlerWithKbi(null, false, (next) => callsWithKbi.push(next));
    assert.strictEqual(callsWithKbi.length, 1);
    assert.strictEqual(callsWithKbi[0].type, "keyboard-interactive");
    const finishCalls = [];
    callsWithKbi[0].prompt("n", "i", "lang", [{ prompt: "Password:", echo: false }], (responses) => finishCalls.push(responses));
    assert.deepStrictEqual(promptArgs, { name: "n", instructions: "i", prompts: [{ prompt: "Password:", echo: false }] });
    assert.deepStrictEqual(finishCalls, [["secret"]]);
  });
  test("encrypted publickey requests passphrase and passes it to ssh2", () => {
    const encryptedAttempts = [
      { type: "publickey", username: "u", key: KEY, keyPath: "~/.ssh/id_rsa", encrypted: true }
    ];
    const calls = [];
    const handler = makeAuthHandler(encryptedAttempts, new NullLogService(), void 0, (keyPath, finish) => {
      assert.strictEqual(keyPath, "~/.ssh/id_rsa");
      finish("passphrase");
    });
    handler(null, false, (next) => calls.push(next));
    assert.deepStrictEqual(calls, [
      { type: "publickey", username: "u", key: KEY, passphrase: "passphrase" }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzc2hSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX0VORFBPSU5UX1JFR0lTVFJZX1NDSEVNQV9WRVJTSU9OLCB0eXBlIEFnZW50SG9zdEVuZHBvaW50QWRkcmVzcywgdHlwZSBJQWdlbnRIb3N0RW5kcG9pbnRNZXRhZGF0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RFbmRwb2ludFJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFNTSEF1dGhNZXRob2QsIHR5cGUgSVNTSEFnZW50SG9zdENvbmZpZywgdHlwZSBJU1NIQ29ubmVjdFByb2dyZXNzLCB0eXBlIElTU0hFbmRwb2ludFNlbGVjdGlvbiwgdHlwZSBJU1NIRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0LCB0eXBlIElTU0hLZXlib2FyZEludGVyYWN0aXZlUHJvbXB0LCB0eXBlIElTU0hLZXlib2FyZEludGVyYWN0aXZlUmVxdWVzdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zc2hSZW1vdGVBZ2VudEhvc3QuanMnO1xuaW1wb3J0IHsgU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UsIG1ha2VBdXRoSGFuZGxlciwgdHlwZSBTU0hBdXRoQXR0ZW1wdCB9IGZyb20gJy4uLy4uL25vZGUvc3NoUmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IEFueUF1dGhNZXRob2QsIEF1dGhlbnRpY2F0aW9uVHlwZSwgQ29ubmVjdENvbmZpZyB9IGZyb20gJ3NzaDInO1xuXG5jb25zdCBkYXRhRm9sZGVyTmFtZSA9ICcudnNjb2RlLWluc2lkZXJzJztcbmNvbnN0IHF1YWxpdHkgPSAnaW5zaWRlcic7XG5cbmNsYXNzIFJlY29yZGluZ0xvZ1NlcnZpY2UgZXh0ZW5kcyBOdWxsTG9nU2VydmljZSB7XG5cdHJlYWRvbmx5IGVycm9yczogc3RyaW5nW10gPSBbXTtcblx0cmVhZG9ubHkgd2FybmluZ3M6IHN0cmluZ1tdID0gW107XG5cblx0b3ZlcnJpZGUgZXJyb3IobWVzc2FnZTogc3RyaW5nIHwgRXJyb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdHRoaXMuZXJyb3JzLnB1c2goW21lc3NhZ2UsIC4uLmFyZ3NdLm1hcCh2YWx1ZSA9PiB2YWx1ZSBpbnN0YW5jZW9mIEVycm9yID8gdmFsdWUubWVzc2FnZSA6IFN0cmluZyh2YWx1ZSkpLmpvaW4oJyAnKSk7XG5cdH1cblxuXHRvdmVycmlkZSB3YXJuKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0dGhpcy53YXJuaW5ncy5wdXNoKFttZXNzYWdlLCAuLi5hcmdzXS5tYXAoU3RyaW5nKS5qb2luKCcgJykpO1xuXHR9XG59XG5cbi8qKiBGaXh0dXJlIGJ1aWxkZXIgZm9yIGEgc2hhcmVkLXJlZ2lzdHJ5IGVuZHBvaW50IGVudHJ5IChgY29kZSBhZ2VudCBlbmRwb2ludHNgIHJlc3VsdCkuICovXG5mdW5jdGlvbiBtYWtlRW5kcG9pbnQob3ZlcnJpZGVzOiBQYXJ0aWFsPElBZ2VudEhvc3RFbmRwb2ludE1ldGFkYXRhPiAmIFBpY2s8SUFnZW50SG9zdEVuZHBvaW50TWV0YWRhdGEsICd0eXBlJyB8ICdwaWQnIHwgJ2luc3RhbmNlSWQnPik6IElBZ2VudEhvc3RFbmRwb2ludE1ldGFkYXRhIHtcblx0cmV0dXJuIHtcblx0XHRzY2hlbWFWZXJzaW9uOiBBR0VOVF9IT1NUX0VORFBPSU5UX1JFR0lTVFJZX1NDSEVNQV9WRVJTSU9OLFxuXHRcdHByb3RvY29sVmVyc2lvbjogJzEuMC4wJyxcblx0XHRjb25uZWN0aW9uVG9rZW46ICd0b2snLFxuXHRcdGVuZHBvaW50OiB7IHR5cGU6ICd0Y3AnLCBob3N0OiAnMTI3LjAuMC4xJywgcG9ydDogODA4MCB9LFxuXHRcdC4uLm92ZXJyaWRlcyxcblx0fTtcbn1cblxuLyoqIEJ1aWxkIHRoZSBKU09OIGVudmVsb3BlIHByaW50ZWQgYnkgYGNvZGUgYWdlbnQgZW5kcG9pbnRzYC4gKi9cbmZ1bmN0aW9uIGFnZW50RW5kcG9pbnRzU3Rkb3V0KGVuZHBvaW50czogcmVhZG9ubHkgSUFnZW50SG9zdEVuZHBvaW50TWV0YWRhdGFbXSwgdXNlckRhdGFQYXRoID0gJy9ob21lL3Rlc3R1c2VyJyk6IHN0cmluZyB7XG5cdHJldHVybiBKU09OLnN0cmluZ2lmeSh7IHVzZXJEYXRhUGF0aCwgZW5kcG9pbnRzIH0pO1xufVxuXG4vKipcbiAqIEJ1aWxkIHRoZSBleGVjLXJlc3BvbnNlIHF1ZXVlIGZvciB0aGUgY29tbW9uIFwiQ0xJIGFscmVhZHkgaW5zdGFsbGVkXCJcbiAqIHJlZ2lzdHJ5LWRpc2NvdmVyeSBwYXRoOiBgdW5hbWUgLXNgLCBgdW5hbWUgLW1gLCBgPGNsaUJpbj4gLS12ZXJzaW9uICYmXG4gKiA8Y2xpQmluPiB1cGRhdGVgIChyZXVzZSksIGBhZ2VudCBlbmRwb2ludHNgLCB0aGVuIG9uZSBga2lsbCAtMCA8cGlkPmAgcGVyIGRpc3RpbmN0IGxpdmVcbiAqIHBpZCAoYWxsIHJlcG9ydGVkIGFsaXZlKS4gVGVzdHMgdGhhdCBuZWVkIGEgZGVhZCBQSUQsIGEgbWlzc2luZyBDTEksIG9yXG4gKiBhZGRpdGlvbmFsIHJlc3BvbnNlcyAoZS5nLiBmb3IgYSBzdWJzZXF1ZW50IHNwYXduKSBidWlsZCB0aGVpciBxdWV1ZXNcbiAqIG1hbnVhbGx5IG9yIGFwcGVuZCB0byB0aGlzIG9uZS5cbiAqL1xuZnVuY3Rpb24gZGlzY292ZXJ5UmVzcG9uc2VzKGVudHJpZXM6IHJlYWRvbmx5IElBZ2VudEhvc3RFbmRwb2ludE1ldGFkYXRhW10sIHVzZXJEYXRhUGF0aCA9ICcvaG9tZS90ZXN0dXNlcicpOiBBcnJheTx7IHN0ZG91dDogc3RyaW5nOyBjb2RlOiBudW1iZXIgfT4ge1xuXHRjb25zdCByZXNwb25zZXM6IEFycmF5PHsgc3Rkb3V0OiBzdHJpbmc7IGNvZGU6IG51bWJlciB9PiA9IFtcblx0XHR7IHN0ZG91dDogJ0xpbnV4XFxuJywgY29kZTogMCB9LFxuXHRcdHsgc3Rkb3V0OiAneDg2XzY0XFxuJywgY29kZTogMCB9LFxuXHRcdHsgc3Rkb3V0OiAnMS4wLjBcXG5fX3ZzY29kZV9jbGlfdXBkYXRlX2V4aXRfY29kZV9fOjBcXG4nLCBjb2RlOiAwIH0sXG5cdFx0eyBzdGRvdXQ6IGFnZW50RW5kcG9pbnRzU3Rkb3V0KGVudHJpZXMsIHVzZXJEYXRhUGF0aCksIGNvZGU6IDAgfSxcblx0XTtcblx0Zm9yIChjb25zdCBfcGlkIG9mIG5ldyBTZXQoZW50cmllcy5tYXAoZSA9PiBlLnBpZCkpKSB7XG5cdFx0cmVzcG9uc2VzLnB1c2goeyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0pOyAvLyBraWxsIC0wIDxwaWQ+IChhbGl2ZSlcblx0fVxuXHRyZXR1cm4gcmVzcG9uc2VzO1xufVxuXG4vKiogTWluaW1hbCBtb2NrIFNTSENoYW5uZWwgZm9yIHRlc3RpbmcuICovXG5jbGFzcyBNb2NrU1NIQ2hhbm5lbCB7XG5cdHJlYWRvbmx5IHN0ZGVyciA9IHsgb246ICgpID0+IHsgfSB9O1xuXHRvbihfZXZlbnQ6IHN0cmluZywgX2xpc3RlbmVyPzogKC4uLmFyZ3M6IG5ldmVyW10pID0+IHZvaWQpOiB0aGlzIHsgcmV0dXJuIHRoaXM7IH1cblx0Y2xvc2UoKTogdm9pZCB7IH1cbn1cblxuLyoqXG4gKiBNb2NrIFNTSENsaWVudCB0aGF0IHJlY29yZHMgZXhlYyBjYWxscyBhbmQgcmV0dXJucyBjb25maWd1cmVkIHJlc3BvbnNlcy5cbiAqIEVhY2ggY2FsbCB0byBgZXhlY2Agc2hpZnRzIHRoZSBuZXh0IHJlc3BvbnNlIGZyb20gdGhlIHF1ZXVlLlxuICovXG5jbGFzcyBNb2NrU1NIQ2xpZW50IHtcblx0cmVhZG9ubHkgZXhlY0NhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRlbmRlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4ZWNSZXNwb25zZXM6IEFycmF5PHsgc3Rkb3V0OiBzdHJpbmc7IGNvZGU6IG51bWJlciB9Pjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2xvc2VMaXN0ZW5lcnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Vycm9yTGlzdGVuZXJzOiBBcnJheTwoKSA9PiB2b2lkPiA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKGV4ZWNSZXNwb25zZXM6IEFycmF5PHsgc3Rkb3V0OiBzdHJpbmc7IGNvZGU6IG51bWJlciB9PiA9IFtdKSB7XG5cdFx0dGhpcy5fZXhlY1Jlc3BvbnNlcyA9IGV4ZWNSZXNwb25zZXM7XG5cdH1cblxuXHRvbihldmVudDogc3RyaW5nLCBsaXN0ZW5lcjogKC4uLmFyZ3M6IG5ldmVyW10pID0+IHZvaWQpOiB0aGlzIHtcblx0XHRpZiAoZXZlbnQgPT09ICdjbG9zZScpIHtcblx0XHRcdHRoaXMuX2Nsb3NlTGlzdGVuZXJzLnB1c2gobGlzdGVuZXIgYXMgKCkgPT4gdm9pZCk7XG5cdFx0fSBlbHNlIGlmIChldmVudCA9PT0gJ2Vycm9yJykge1xuXHRcdFx0dGhpcy5fZXJyb3JMaXN0ZW5lcnMucHVzaChsaXN0ZW5lciBhcyAoKSA9PiB2b2lkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRyZW1vdmVMaXN0ZW5lcihldmVudDogc3RyaW5nLCBsaXN0ZW5lcjogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZCk6IHRoaXMge1xuXHRcdGNvbnN0IGxpc3QgPSBldmVudCA9PT0gJ2Nsb3NlJyA/IHRoaXMuX2Nsb3NlTGlzdGVuZXJzIDogZXZlbnQgPT09ICdlcnJvcicgPyB0aGlzLl9lcnJvckxpc3RlbmVycyA6IHVuZGVmaW5lZDtcblx0XHRpZiAobGlzdCkge1xuXHRcdFx0Y29uc3QgaWR4ID0gbGlzdC5pbmRleE9mKGxpc3RlbmVyIGFzICgpID0+IHZvaWQpO1xuXHRcdFx0aWYgKGlkeCA+PSAwKSB7XG5cdFx0XHRcdGxpc3Quc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0ZmlyZUNsb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgbGlzdGVuZXIgb2YgdGhpcy5fY2xvc2VMaXN0ZW5lcnMpIHtcblx0XHRcdGxpc3RlbmVyKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGNsb3NlTGlzdGVuZXJDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9jbG9zZUxpc3RlbmVycy5sZW5ndGg7XG5cdH1cblxuXHRnZXQgZXJyb3JMaXN0ZW5lckNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2Vycm9yTGlzdGVuZXJzLmxlbmd0aDtcblx0fVxuXG5cdGNvbm5lY3QoKTogdm9pZCB7IC8qIG5vLW9wICovIH1cblxuXHRleGVjKGNvbW1hbmQ6IHN0cmluZywgY2FsbGJhY2s6IChlcnI6IEVycm9yIHwgdW5kZWZpbmVkLCBzdHJlYW06IHVua25vd24pID0+IHZvaWQpOiB0aGlzIHtcblx0XHR0aGlzLmV4ZWNDYWxscy5wdXNoKGNvbW1hbmQpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gdGhpcy5fZXhlY1Jlc3BvbnNlcy5zaGlmdCgpID8/IHsgc3Rkb3V0OiAnJywgY29kZTogMCB9O1xuXHRcdGNvbnN0IGNoYW5uZWwgPSBuZXcgTW9ja1NTSENoYW5uZWwoKTtcblx0XHQvLyBTaW11bGF0ZSBhc3luYyBTU0ggZXhlYzogcmVzb2x2ZSBpbW1lZGlhdGVseSB2aWEgbWljcm90YXNrXG5cdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0Ly8gRmlyZSBkYXRhIGV2ZW50c1xuXHRcdFx0aWYgKHJlc3BvbnNlLnN0ZG91dCkge1xuXHRcdFx0XHRjb25zdCBvcmlnT24gPSBjaGFubmVsLm9uLmJpbmQoY2hhbm5lbCk7XG5cdFx0XHRcdC8vIFJlLWJpbmQgb24gdG8gY2FwdHVyZSBkYXRhIGhhbmRsZXJcblx0XHRcdFx0bGV0IGRhdGFIYW5kbGVyOiAoKGRhdGE6IEJ1ZmZlcikgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGxldCBjbG9zZUhhbmRsZXI6ICgoY29kZTogbnVtYmVyKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0Y2hhbm5lbC5vbiA9ICgoZXZlbnQ6IHN0cmluZywgbGlzdGVuZXI6ICguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQpID0+IHtcblx0XHRcdFx0XHRpZiAoZXZlbnQgPT09ICdkYXRhJykge1xuXHRcdFx0XHRcdFx0ZGF0YUhhbmRsZXIgPSBsaXN0ZW5lciBhcyAoZGF0YTogQnVmZmVyKSA9PiB2b2lkO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZXZlbnQgPT09ICdjbG9zZScpIHtcblx0XHRcdFx0XHRcdGNsb3NlSGFuZGxlciA9IGxpc3RlbmVyIGFzIChjb2RlOiBudW1iZXIpID0+IHZvaWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBvcmlnT24oZXZlbnQsIGxpc3RlbmVyKTtcblx0XHRcdFx0fSkgYXMgdHlwZW9mIGNoYW5uZWwub247XG5cdFx0XHRcdGNhbGxiYWNrKHVuZGVmaW5lZCwgY2hhbm5lbCk7XG5cdFx0XHRcdGlmIChkYXRhSGFuZGxlcikge1xuXHRcdFx0XHRcdGRhdGFIYW5kbGVyKEJ1ZmZlci5mcm9tKHJlc3BvbnNlLnN0ZG91dCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjbG9zZUhhbmRsZXIpIHtcblx0XHRcdFx0XHRjbG9zZUhhbmRsZXIocmVzcG9uc2UuY29kZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIE5vIHN0ZG91dCBcdTIwMTQganVzdCBjYWxsIGJhY2sgYW5kIGZpcmUgY2xvc2Vcblx0XHRcdFx0bGV0IGNsb3NlSGFuZGxlcjogKChjb2RlOiBudW1iZXIpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBvcmlnT24gPSBjaGFubmVsLm9uLmJpbmQoY2hhbm5lbCk7XG5cdFx0XHRcdGNoYW5uZWwub24gPSAoKGV2ZW50OiBzdHJpbmcsIGxpc3RlbmVyOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGV2ZW50ID09PSAnY2xvc2UnKSB7XG5cdFx0XHRcdFx0XHRjbG9zZUhhbmRsZXIgPSBsaXN0ZW5lciBhcyAoY29kZTogbnVtYmVyKSA9PiB2b2lkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gb3JpZ09uKGV2ZW50LCBsaXN0ZW5lcik7XG5cdFx0XHRcdH0pIGFzIHR5cGVvZiBjaGFubmVsLm9uO1xuXHRcdFx0XHRjYWxsYmFjayh1bmRlZmluZWQsIGNoYW5uZWwpO1xuXHRcdFx0XHRpZiAoY2xvc2VIYW5kbGVyKSB7XG5cdFx0XHRcdFx0Y2xvc2VIYW5kbGVyKHJlc3BvbnNlLmNvZGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRmb3J3YXJkT3V0KFxuXHRcdF9zcmNJUDogc3RyaW5nLCBfc3JjUG9ydDogbnVtYmVyLCBfZHN0SVA6IHN0cmluZywgX2RzdFBvcnQ6IG51bWJlcixcblx0XHRfY2FsbGJhY2s6IChlcnI6IEVycm9yIHwgdW5kZWZpbmVkLCBjaGFubmVsOiB1bmtub3duKSA9PiB2b2lkLFxuXHQpOiB0aGlzIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGVuZCgpOiB2b2lkIHtcblx0XHR0aGlzLmVuZGVkID0gdHJ1ZTtcblx0fVxufVxuXG5jbGFzcyBLZXlib2FyZEludGVyYWN0aXZlTW9ja1NTSENsaWVudCB7XG5cdGVuZGVkID0gZmFsc2U7XG5cdGZpbmlzaFJlc3BvbnNlczogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZXJyb3JMaXN0ZW5lcnM6IEFycmF5PChlcnI6IEVycm9yKSA9PiB2b2lkPiA9IFtdO1xuXG5cdG9uKGV2ZW50OiAncmVhZHknLCBsaXN0ZW5lcjogKCkgPT4gdm9pZCk6IHRoaXM7XG5cdG9uKGV2ZW50OiAnZXJyb3InLCBsaXN0ZW5lcjogKGVycjogRXJyb3IpID0+IHZvaWQpOiB0aGlzO1xuXHRvbihldmVudDogJ2Nsb3NlJywgbGlzdGVuZXI6ICgpID0+IHZvaWQpOiB0aGlzO1xuXHRvbihldmVudDogc3RyaW5nLCBsaXN0ZW5lcjogKChlcnI6IEVycm9yKSA9PiB2b2lkKSB8ICgoKSA9PiB2b2lkKSk6IHRoaXMge1xuXHRcdGlmIChldmVudCA9PT0gJ2Vycm9yJykge1xuXHRcdFx0dGhpcy5fZXJyb3JMaXN0ZW5lcnMucHVzaChsaXN0ZW5lciBhcyAoZXJyOiBFcnJvcikgPT4gdm9pZCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cmVtb3ZlTGlzdGVuZXIoX2V2ZW50OiBzdHJpbmcsIF9saXN0ZW5lcjogKC4uLmFyZ3M6IG5ldmVyW10pID0+IHZvaWQpOiB0aGlzIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGNvbm5lY3QoY29uZmlnOiBDb25uZWN0Q29uZmlnKTogdm9pZCB7XG5cdFx0Y29uc3QgYXV0aEhhbmRsZXIgPSBjb25maWcuYXV0aEhhbmRsZXIgYXMgKChtZXRob2RzTGVmdDogQXV0aGVudGljYXRpb25UeXBlW10gfCBudWxsLCBwYXJ0aWFsU3VjY2VzczogYm9vbGVhbiwgY2FsbGJhY2s6IChuZXh0OiBBbnlBdXRoTWV0aG9kIHwgZmFsc2UpID0+IHZvaWQpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRcdGF1dGhIYW5kbGVyPy4obnVsbCwgZmFsc2UsIG1ldGhvZCA9PiB7XG5cdFx0XHRpZiAobWV0aG9kICYmIG1ldGhvZC50eXBlID09PSAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnKSB7XG5cdFx0XHRcdG1ldGhvZC5wcm9tcHQoJ0tleWJvYXJkJywgJycsICdlbi1VUycsIFt7IHByb21wdDogJ1Bhc3N3b3JkOiAnLCBlY2hvOiBmYWxzZSB9XSwgcmVzcG9uc2VzID0+IHtcblx0XHRcdFx0XHR0aGlzLmZpbmlzaFJlc3BvbnNlcyA9IHJlc3BvbnNlcztcblx0XHRcdFx0XHR0aGlzLmZpcmVFcnJvcihuZXcgRXJyb3IoJ0FsbCBjb25maWd1cmVkIGF1dGhlbnRpY2F0aW9uIG1ldGhvZHMgZmFpbGVkJykpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGVuZCgpOiB2b2lkIHtcblx0XHR0aGlzLmVuZGVkID0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgZmlyZUVycm9yKGVycjogRXJyb3IpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGxpc3RlbmVyIG9mIHRoaXMuX2Vycm9yTGlzdGVuZXJzKSB7XG5cdFx0XHRsaXN0ZW5lcihlcnIpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBtYWtlQ29uZmlnKG92ZXJyaWRlcz86IFBhcnRpYWw8SVNTSEFnZW50SG9zdENvbmZpZz4pOiBJU1NIQWdlbnRIb3N0Q29uZmlnIHtcblx0cmV0dXJuIHtcblx0XHRob3N0OiAnMTAuMC4wLjEnLFxuXHRcdHVzZXJuYW1lOiAndGVzdHVzZXInLFxuXHRcdGF1dGhNZXRob2Q6IFNTSEF1dGhNZXRob2QuQWdlbnQsXG5cdFx0bmFtZTogJ3Rlc3QtaG9zdCcsXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9O1xufVxuXG4vKipcbiAqIFRlc3RhYmxlIHN1YmNsYXNzIG9mIFNTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlLlxuICogT3ZlcnJpZGVzIHRoZSBTU0gvV2ViU29ja2V0IGxheWVyIHNvIHRoZSBlbnRpcmUgY29ubmVjdCBmbG93IHJ1bnMgaW4tcHJvY2Vzc1xuICogd2l0aG91dCBuZWVkaW5nIGBzc2gyYCBvciBgd3NgIG1vZHVsZXMuXG4gKi9cbmNsYXNzIFRlc3RhYmxlU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UgZXh0ZW5kcyBTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSB7XG5cblx0cmVhZG9ubHkgbW9ja0NsaWVudHM6IE1vY2tTU0hDbGllbnRbXSA9IFtdO1xuXG5cdC8qKlxuXHQgKiBSZXNwb25zZXMgdGhhdCBgX2Nvbm5lY3RTU0hgJ3MgTW9ja1NTSENsaWVudCBoYW5kcyBvdXQgZm9yIGl0cyBleGVjXG5cdCAqIHF1ZXVlLCBpbiBjYWxsIG9yZGVyOiBgdW5hbWUgLXNgLCBgdW5hbWUgLW1gLCBDTEkgaW5zdGFsbCBjaGVjayxcblx0ICogYGFnZW50IGVuZHBvaW50c2AsIG9uZSBga2lsbCAtMCA8cGlkPmAgcGVyIGRpc3RpbmN0IGxpdmUgcGlkLCBhbmQgYW55XG5cdCAqIGZ1cnRoZXIgc3Bhd24vYGFnZW50IGVuZHBvaW50c2AgY2FsbHMgYSB0ZXN0J3Mgc2NlbmFyaW8gcmVxdWlyZXMuIFRoZVxuXHQgKiBgcmVtb3RlQWdlbnRIb3N0Q29tbWFuZGAgb3ZlcnJpZGUgcGF0aCBtYWtlcyBub25lIG9mIHRoZXNlIGNhbGxzIGF0XG5cdCAqIGFsbCwgc28gdGVzdHMgdXNpbmcgaXQgY2FuIGxlYXZlIHRoaXMgZW1wdHkuXG5cdCAqL1xuXHRleGVjUmVzcG9uc2VzOiBBcnJheTx7IHN0ZG91dDogc3RyaW5nOyBjb2RlOiBudW1iZXIgfT4gPSBbXTtcblxuXHQvKiogV2hhdCBfc3RhcnRSZW1vdGVBZ2VudEhvc3Qgd2lsbCByZXNvbHZlIHdpdGggKG92ZXJyaWRlLWNvbW1hbmQgcGF0aCBvbmx5KS4gKi9cblx0c3RhcnRSZXN1bHQ6IHsgcG9ydDogbnVtYmVyOyBjb25uZWN0aW9uVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZDsgcGlkOiBudW1iZXIgfCB1bmRlZmluZWQgfSA9IHtcblx0XHRwb3J0OiA5OTk5LCBjb25uZWN0aW9uVG9rZW46ICd0b2stYWJjJywgcGlkOiA0Mixcblx0fTtcblx0c3RhcnRDYWxsZWQgPSAwO1xuXG5cdC8qKiBXaGF0IF9jcmVhdGVXZWJTb2NrZXRSZWxheSB3aWxsIHJlc29sdmUgd2l0aC4gU2V0IHRvIGFuIEVycm9yIHRvIHJlamVjdC4gKi9cblx0cmVsYXlSZXN1bHQ6IHsgc2VuZDogKGRhdGE6IHN0cmluZykgPT4gdm9pZDsgY2xvc2U6ICgpID0+IHZvaWQgfSB8IEVycm9yID0ge1xuXHRcdHNlbmQ6ICgpID0+IHsgfSxcblx0XHRjbG9zZTogKCkgPT4geyB9LFxuXHR9O1xuXHRyZWxheUNhbGxlZCA9IDA7XG5cblx0LyoqIE92ZXJyaWRlIHRvIGludGVyY2VwdCByZWxheSBjcmVhdGlvbiBpbiBzcGVjaWZpYyB0ZXN0cy4gKi9cblx0cmVsYXlIb29rOiAoKGNhbGw6IG51bWJlcikgPT4geyBzZW5kOiAoZGF0YTogc3RyaW5nKSA9PiB2b2lkOyBjbG9zZTogKCkgPT4gdm9pZCB9IHwgRXJyb3IgfCB1bmRlZmluZWQpIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBJZiBzZXQgdG8gYSBwb3NpdGl2ZSBudW1iZXIsIHRoZSBOdGggYF9jcmVhdGVXZWJTb2NrZXRSZWxheWAgY2FsbCB3aWxsXG5cdCAqIHJldHVybiBhIHByb21pc2UgdGhhdCBuZXZlciByZXNvbHZlcyBub3IgcmVqZWN0cy4gVGhpcyBzaW11bGF0ZXMgYVxuXHQgKiBzaWxlbnRseSBkZWFkIFNTSCBjbGllbnQgd2hlcmUgYGZvcndhcmRPdXRgJ3MgY2FsbGJhY2sgbmV2ZXIgZmlyZXMuXG5cdCAqL1xuXHRoYW5nUmVsYXlDcmVhdGlvbk9uQ2FsbDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBQdWJsaWMgb3ZlcnJpZGUgc28gdGVzdHMgY2FuIHNob3J0ZW4gdGhlIHJlbGF5IGNyZWF0aW9uIHRpbWVvdXQuICovXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZWxheUNyZWF0aW9uVGltZW91dE1zOiBudW1iZXIgPSAzMF8wMDA7XG5cblx0LyoqIFN0b3JlZCBvbk1lc3NhZ2UgY2FsbGJhY2tzIGZyb20gcmVsYXlzLCBtb3N0IHJlY2VudCBsYXN0LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWxheU1lc3NhZ2VDYWxsYmFja3M6IEFycmF5PChkYXRhOiBzdHJpbmcpID0+IHZvaWQ+ID0gW107XG5cdC8qKiBTdG9yZWQgb25DbG9zZSBjYWxsYmFja3MgZnJvbSByZWxheXMsIG1vc3QgcmVjZW50IGxhc3QuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbGF5Q2xvc2VDYWxsYmFja3M6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG5cdC8qKiBTdG9yZWQgcmVsYXkgcmVzdWx0IG9iamVjdHMsIG1vc3QgcmVjZW50IGxhc3QgKGZvciBtYWtlUHJldmlvdXNSZWxheVN5bmNDbG9zZSkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbGF5UmVzdWx0czogQXJyYXk8eyBzZW5kOiAoZGF0YTogc3RyaW5nKSA9PiB2b2lkOyBjbG9zZTogKCkgPT4gdm9pZCB9PiA9IFtdO1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfY29ubmVjdFNTSChcblx0XHRfY29uZmlnOiBJU1NIQWdlbnRIb3N0Q29uZmlnLFxuXHQpIHtcblx0XHRjb25zdCBjbGllbnQgPSBuZXcgTW9ja1NTSENsaWVudCh0aGlzLmV4ZWNSZXNwb25zZXMpO1xuXHRcdHRoaXMubW9ja0NsaWVudHMucHVzaChjbGllbnQpO1xuXHRcdHJldHVybiBjbGllbnQgYXMgbmV2ZXI7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgX3N0YXJ0UmVtb3RlQWdlbnRIb3N0KFxuXHRcdF9jbGllbnQ6IHVua25vd24sIF9jbGlCaW46IHN0cmluZyB8IHVuZGVmaW5lZCwgX2NsaURhdGFEaXI6IHN0cmluZyB8IHVuZGVmaW5lZCwgX2NvbW1hbmRPdmVycmlkZT86IHN0cmluZyxcblx0KSB7XG5cdFx0dGhpcy5zdGFydENhbGxlZCsrO1xuXHRcdHJldHVybiB7IC4uLnRoaXMuc3RhcnRSZXN1bHQsIHN0cmVhbTogbmV3IE1vY2tTU0hDaGFubmVsKCkgYXMgbmV2ZXIgfTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfY3JlYXRlV2ViU29ja2V0UmVsYXkoXG5cdFx0X2NsaWVudDogdW5rbm93bixcblx0XHRfZW5kcG9pbnQ6IEFnZW50SG9zdEVuZHBvaW50QWRkcmVzcyxcblx0XHRfcmVsYXlDbGlCaW46IHN0cmluZyxcblx0XHRfcmVsYXlDbGlEYXRhRGlyOiBzdHJpbmcsXG5cdFx0X3JlbGF5SW5zdGFuY2VJZDogc3RyaW5nLFxuXHRcdF9yZWxheVVzZXJEYXRhUGF0aDogc3RyaW5nLFxuXHRcdF9jb25uZWN0aW9uVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRvbk1lc3NhZ2U6IChkYXRhOiBzdHJpbmcpID0+IHZvaWQsIG9uQ2xvc2U6ICgpID0+IHZvaWQsXG5cdCkge1xuXHRcdHRoaXMucmVsYXlDYWxsZWQrKztcblx0XHR0aGlzLl9yZWxheU1lc3NhZ2VDYWxsYmFja3MucHVzaChvbk1lc3NhZ2UpO1xuXHRcdHRoaXMuX3JlbGF5Q2xvc2VDYWxsYmFja3MucHVzaChvbkNsb3NlKTtcblx0XHRpZiAodGhpcy5oYW5nUmVsYXlDcmVhdGlvbk9uQ2FsbCA9PT0gdGhpcy5yZWxheUNhbGxlZCkge1xuXHRcdFx0Ly8gU2ltdWxhdGUgZm9yd2FyZE91dCBoYW5naW5nIFx1MjAxNCBuZXZlciByZXNvbHZlLiBUaGUgd3JhcHBlciBpblxuXHRcdFx0Ly8gYGNvbm5lY3QoKWAgc2hvdWxkIHN0aWxsIHN1cmZhY2UgYSB0aW1lb3V0IGVycm9yIGluc3RlYWQgb2Zcblx0XHRcdC8vIGhhbmdpbmcgdGhlIHdob2xlIGNvbm5lY3QoKSBjYWxsLlxuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPHsgc2VuZDogKGRhdGE6IHN0cmluZykgPT4gdm9pZDsgY2xvc2U6ICgpID0+IHZvaWQgfT4oKCkgPT4geyAvKiBuZXZlciAqLyB9KTtcblx0XHR9XG5cdFx0Y29uc3QgaG9va1Jlc3VsdCA9IHRoaXMucmVsYXlIb29rPy4odGhpcy5yZWxheUNhbGxlZCk7XG5cdFx0aWYgKGhvb2tSZXN1bHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKGhvb2tSZXN1bHQgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHR0aHJvdyBob29rUmVzdWx0O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVsYXlSZXN1bHRzLnB1c2goaG9va1Jlc3VsdCk7XG5cdFx0XHRyZXR1cm4gaG9va1Jlc3VsdDtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5yZWxheVJlc3VsdDtcblx0XHRpZiAocmVzdWx0IGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdHRocm93IHJlc3VsdDtcblx0XHR9XG5cdFx0Ly8gUmV0dXJuIGEgZGlzdGluY3Qgb2JqZWN0IHBlciBjYWxsIHNvIGVhY2ggU1NIQ29ubmVjdGlvbiBnZXRzIGl0cyBvd24gcmVsYXlcblx0XHRjb25zdCByZWxheU9iaiA9IHsgc2VuZDogcmVzdWx0LnNlbmQsIGNsb3NlOiByZXN1bHQuY2xvc2UgfTtcblx0XHR0aGlzLl9yZWxheVJlc3VsdHMucHVzaChyZWxheU9iaik7XG5cdFx0cmV0dXJuIHJlbGF5T2JqO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZVNTSENvbmZpZyhfaG9zdDogc3RyaW5nKTogUmV0dXJuVHlwZTxTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZVsncmVzb2x2ZVNTSENvbmZpZyddPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGhvc3RuYW1lOiAnMTAuMC4wLjEnLFxuXHRcdFx0cG9ydDogMjIsXG5cdFx0XHR1c2VyOiAndGVzdHVzZXInLFxuXHRcdFx0aWRlbnRpdHlGaWxlOiBbXSxcblx0XHRcdGlkZW50aXR5QWdlbnQ6IHVuZGVmaW5lZCxcblx0XHRcdGZvcndhcmRBZ2VudDogZmFsc2UsXG5cdFx0XHR1c2VyS25vd25Ib3N0c0ZpbGVzOiBbXSxcblx0XHRcdGdsb2JhbEtub3duSG9zdHNGaWxlczogW10sXG5cdFx0XHRzdHJpY3RIb3N0S2V5Q2hlY2tpbmc6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFNpbXVsYXRlIHRoZSBvbGQgKHN1cGVyc2VkZWQpIHJlbGF5J3MgV2ViU29ja2V0IGNsb3NlIGV2ZW50IGZpcmluZy5cblx0ICogVGhpcyBjYWxscyB0aGUgb25DbG9zZSBjYWxsYmFjayBvZiB0aGUgc2Vjb25kLXRvLWxhc3QgcmVsYXkuXG5cdCAqL1xuXHRzaW11bGF0ZU9sZFJlbGF5Q2xvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3JlbGF5Q2xvc2VDYWxsYmFja3MubGVuZ3RoID49IDIpIHtcblx0XHRcdHRoaXMuX3JlbGF5Q2xvc2VDYWxsYmFja3NbdGhpcy5fcmVsYXlDbG9zZUNhbGxiYWNrcy5sZW5ndGggLSAyXSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBNb2RpZnkgdGhlIG1vc3QgcmVjZW50bHkgY3JlYXRlZCByZWxheSBzbyB0aGF0IGNhbGxpbmcgY2xvc2UoKVxuXHQgKiBzeW5jaHJvbm91c2x5IGZpcmVzIGl0cyBvbkNsb3NlIGNhbGxiYWNrLiBUaGlzIHNpbXVsYXRlcyBhIFdlYlNvY2tldFxuXHQgKiBpbXBsZW1lbnRhdGlvbiB0aGF0IGZpcmVzIHRoZSAnY2xvc2UnIGV2ZW50IGlubGluZSBkdXJpbmcgd3MuY2xvc2UoKS5cblx0ICovXG5cdG1ha2VQcmV2aW91c1JlbGF5U3luY0Nsb3NlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGlkeCA9IHRoaXMuX3JlbGF5UmVzdWx0cy5sZW5ndGggLSAxO1xuXHRcdGlmIChpZHggPj0gMCAmJiB0aGlzLl9yZWxheUNsb3NlQ2FsbGJhY2tzLmxlbmd0aCA+IGlkeCkge1xuXHRcdFx0Y29uc3Qgb25DbG9zZSA9IHRoaXMuX3JlbGF5Q2xvc2VDYWxsYmFja3NbaWR4XTtcblx0XHRcdHRoaXMuX3JlbGF5UmVzdWx0c1tpZHhdLmNsb3NlID0gKCkgPT4geyBvbkNsb3NlKCk7IH07XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNpbXVsYXRlIGEgbWVzc2FnZSBhcnJpdmluZyBvbiBhIHNwZWNpZmljIHJlbGF5ICgwLWluZGV4ZWQpLlxuXHQgKiBEZWZhdWx0cyB0byB0aGUgbW9zdCByZWNlbnQgcmVsYXkuXG5cdCAqL1xuXHRzaW11bGF0ZVJlbGF5TWVzc2FnZShkYXRhOiBzdHJpbmcsIHJlbGF5SW5kZXg/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBpZHggPSByZWxheUluZGV4ID8/IHRoaXMuX3JlbGF5TWVzc2FnZUNhbGxiYWNrcy5sZW5ndGggLSAxO1xuXHRcdHRoaXMuX3JlbGF5TWVzc2FnZUNhbGxiYWNrc1tpZHhdPy4oZGF0YSk7XG5cdH1cblxuXHQvKipcblx0ICogU2ltdWxhdGUgdGhlIGN1cnJlbnQgKGFjdGl2ZSkgcmVsYXkncyBXZWJTb2NrZXQgY2xvc2UgZXZlbnQgZmlyaW5nLlxuXHQgKi9cblx0c2ltdWxhdGVDdXJyZW50UmVsYXlDbG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcmVsYXlDbG9zZUNhbGxiYWNrcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9yZWxheUNsb3NlQ2FsbGJhY2tzW3RoaXMuX3JlbGF5Q2xvc2VDYWxsYmFja3MubGVuZ3RoIC0gMV0oKTtcblx0XHR9XG5cdH1cblxuXHQvKiogU2V0cyB0aGUgcmVsYXkgY3JlYXRpb24gdGltZW91dDsgZXhwb3NlZCBmb3IgdGVzdHMgb25seS4gKi9cblx0c2V0UmVsYXlDcmVhdGlvblRpbWVvdXRGb3JUZXN0KG1zOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLnJlbGF5Q3JlYXRpb25UaW1lb3V0TXMgPSBtcztcblx0fVxuXG5cdHN0YXJ0S2V5Ym9hcmRJbnRlcmFjdGl2ZUZvclRlc3QoXG5cdFx0cHJvbXB0czogcmVhZG9ubHkgSVNTSEtleWJvYXJkSW50ZXJhY3RpdmVQcm9tcHRbXSxcblx0XHRmaW5pc2g6IChyZXNwb25zZXM6IHJlYWRvbmx5IHN0cmluZ1tdKSA9PiB2b2lkLFxuXHRcdGNhbmNlbENvbm5lY3Q6ICgpID0+IHZvaWQsXG5cdCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2hhbmRsZUtleWJvYXJkSW50ZXJhY3RpdmUoJ3NzaDp0ZXN0LWhvc3QnLCAndGVzdC1ob3N0JywgJ3Rlc3R1c2VyJywgJycsICcnLCBwcm9tcHRzLCBmaW5pc2gsIGNhbmNlbENvbm5lY3QpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc3BvbmQgdG8gdGhlIG5leHQgZW5kcG9pbnQtc2VsZWN0aW9uIHJlcXVlc3QgZmlyZWQgd2hpbGUgdGhlIGdpdmVuXG5cdCAqIGZ1bmN0aW9uIHJ1bnMsIG1pcnJvcmluZyBob3cgdGhlIHJlbmRlcmVyJ3MgcGlja2VyIHdvdWxkIGFuc3dlci5cblx0ICogUmVnaXN0ZXJzIHRoZSBsaXN0ZW5lciAqYmVmb3JlKiBpbnZva2luZyBgZm5gIHNvIGl0IG5ldmVyIG1pc3NlcyB0aGVcblx0ICogKHN5bmNocm9ub3VzbHktZmlyZWQsIGFzeW5jaHJvbm91c2x5LWF3YWl0ZWQpIHJlcXVlc3QgZXZlbnQuXG5cdCAqL1xuXHRhc3luYyB3aXRoRW5kcG9pbnRTZWxlY3Rpb25SZXNwb25zZTxUPihzZWxlY3Rpb246IElTU0hFbmRwb2ludFNlbGVjdGlvbiwgZm46ICgpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcblx0XHRjb25zdCByZXF1ZXN0czogSVNTSEVuZHBvaW50U2VsZWN0aW9uUmVxdWVzdFtdID0gW107XG5cdFx0Y29uc3QgbGlzdGVuZXIgPSB0aGlzLm9uRGlkUmVxdWVzdEVuZHBvaW50U2VsZWN0aW9uKHJlcXVlc3QgPT4ge1xuXHRcdFx0cmVxdWVzdHMucHVzaChyZXF1ZXN0KTtcblx0XHRcdHZvaWQgdGhpcy5yZXNwb25kRW5kcG9pbnRTZWxlY3Rpb24ocmVxdWVzdC5yZXF1ZXN0SWQsIHNlbGVjdGlvbik7XG5cdFx0fSk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBmbigpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEtleWJvYXJkSW50ZXJhY3RpdmVDb25uZWN0VGVzdFNlcnZpY2UgZXh0ZW5kcyBTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSB7XG5cdHJlYWRvbmx5IGNsaWVudCA9IG5ldyBLZXlib2FyZEludGVyYWN0aXZlTW9ja1NTSENsaWVudCgpO1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfY3JlYXRlU1NIQ2xpZW50KCkge1xuXHRcdHJldHVybiB0aGlzLmNsaWVudCBhcyBuZXZlcjtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfYnVpbGRBdXRoQXR0ZW1wdHMoY29uZmlnOiBJU1NIQWdlbnRIb3N0Q29uZmlnKTogUHJvbWlzZTxTU0hBdXRoQXR0ZW1wdFtdPiB7XG5cdFx0cmV0dXJuIFt7IHR5cGU6ICdrZXlib2FyZC1pbnRlcmFjdGl2ZScsIHVzZXJuYW1lOiBjb25maWcudXNlcm5hbWUgfV07XG5cdH1cblxuXHRjb25uZWN0U1NIRm9yVGVzdChjb25maWc6IElTU0hBZ2VudEhvc3RDb25maWcpIHtcblx0XHRyZXR1cm4gdGhpcy5fY29ubmVjdFNTSChjb25maWcsICdzc2g6dGVzdC1ob3N0Jyk7XG5cdH1cbn1cblxuc3VpdGUoJ1NTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlIC0gY29ubmVjdCBmbG93JywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgc2VydmljZTogVGVzdGFibGVTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlOiBQaWNrPElQcm9kdWN0U2VydmljZSwgJ19zZXJ2aWNlQnJhbmQnIHwgJ3F1YWxpdHknIHwgJ2RhdGFGb2xkZXJOYW1lJz4gPSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRxdWFsaXR5LFxuXHRcdFx0ZGF0YUZvbGRlck5hbWUsXG5cdFx0fTtcblx0XHRzZXJ2aWNlID0gbmV3IFRlc3RhYmxlU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UoXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdFx0cHJvZHVjdFNlcnZpY2UgYXMgSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5jbGVhcigpKTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyAtLS0gRHVwbGljYXRlIGNvbm5lY3QgLyByZWNvbm5lY3Qgb24gYW4gYWxyZWFkeS1jb25uZWN0ZWQgaG9zdCAtLS1cblxuXHR0ZXN0KCdyZXR1cm5zIGV4aXN0aW5nIGNvbm5lY3Rpb24gb24gZHVwbGljYXRlIGNvbm5lY3Qgd2l0aG91dCByZXBsYWNpbmcgcmVsYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gZGlzY292ZXJ5UmVzcG9uc2VzKFttYWtlRW5kcG9pbnQoeyB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogMTIzNCwgaW5zdGFuY2VJZDogJ2luc3QtMScgfSldKTtcblxuXHRcdGNvbnN0IGNvbmZpZyA9IG1ha2VDb25maWcoeyBzc2hDb25maWdIb3N0OiAnbXlhbGlhcycgfSk7XG5cdFx0Y29uc3QgcmVzdWx0MSA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChjb25maWcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQxLmNvbm5lY3Rpb25JZCwgJ3NzaDpteWFsaWFzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEuc3NoQ29uZmlnSG9zdCwgJ215YWxpYXMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MS5saWZlY3ljbGUsICdleHRlcm5hbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnN0YXJ0Q2FsbGVkLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWxheUNhbGxlZCwgMSk7XG5cblx0XHQvLyBTZWNvbmQgY29ubmVjdCB3aXRob3V0IHJlcGxhY2VSZWxheSBcdTIwMTQgcmV0dXJucyBleGlzdGluZyBpbmZvXG5cdFx0Ly8gd2l0aG91dCBjcmVhdGluZyBhIG5ldyByZWxheSBvciByZXN0YXJ0aW5nIHRoZSBhZ2VudFxuXHRcdGNvbnN0IHJlc3VsdDIgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY29uZmlnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Mi5jb25uZWN0aW9uSWQsIHJlc3VsdDEuY29ubmVjdGlvbklkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Mi5jb25uZWN0aW9uVG9rZW4sIHJlc3VsdDEuY29ubmVjdGlvblRva2VuKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Mi5zc2hDb25maWdIb3N0LCAnbXlhbGlhcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlbGF5Q2FsbGVkLCAxKTsgLy8gbm8gbmV3IHJlbGF5XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZXMgZnJlc2ggcmVsYXkgb24gcmVjb25uZWN0IHdpdGhvdXQgcmVzdGFydGluZyBhZ2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBkaXNjb3ZlcnlSZXNwb25zZXMoW21ha2VFbmRwb2ludCh7IHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiAxMjM0LCBpbnN0YW5jZUlkOiAnaW5zdC0xJyB9KV0pO1xuXG5cdFx0Y29uc3QgY29uZmlnID0gbWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICdteWFsaWFzJyB9KTtcblx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgc2VydmljZS5jb25uZWN0KGNvbmZpZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVsYXlDYWxsZWQsIDEpO1xuXG5cdFx0Ly8gUmVjb25uZWN0IFx1MjAxNCBjcmVhdGVzIGZyZXNoIHJlbGF5IG9uIGV4aXN0aW5nIFNTSCB0dW5uZWw7IGRvZXMgbm90XG5cdFx0Ly8gcmVydW4gZW5kcG9pbnQgZGlzY292ZXJ5L3NlbGVjdGlvbiAoc2VlIGNvbm5lY3QoKSdzIHJlcGxhY2VSZWxheSBwYXRoKS5cblx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgc2VydmljZS5yZWNvbm5lY3QoJ215YWxpYXMnLCAndGVzdC1hZ2VudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLmNvbm5lY3Rpb25JZCwgcmVzdWx0MS5jb25uZWN0aW9uSWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLmNvbm5lY3Rpb25Ub2tlbiwgcmVzdWx0MS5jb25uZWN0aW9uVG9rZW4pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLmxpZmVjeWNsZSwgcmVzdWx0MS5saWZlY3ljbGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlbGF5Q2FsbGVkLCAyKTsgLy8gZnJlc2ggcmVsYXlcblx0fSk7XG5cblx0dGVzdCgncmVjb25uZWN0IGRvZXMgbm90IGZpcmUgb25EaWRSZWxheUNsb3NlIGZvciBzdXBlcnNlZGVkIHJlbGF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IGRpc2NvdmVyeVJlc3BvbnNlcyhbbWFrZUVuZHBvaW50KHsgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDEyMzQsIGluc3RhbmNlSWQ6ICdpbnN0LTEnIH0pXSk7XG5cblx0XHRjb25zdCBjb25maWcgPSBtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ215YWxpYXMnIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjb25maWcpO1xuXG5cdFx0Y29uc3QgY2xvc2VFdmVudHM6IHN0cmluZ1tdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSZWxheUNsb3NlKGlkID0+IGNsb3NlRXZlbnRzLnB1c2goaWQpKSk7XG5cblx0XHQvLyBSZWNvbm5lY3QgcmVwbGFjZXMgdGhlIHJlbGF5IFx1MjAxNCBvbGQgcmVsYXkgY2xvc2Ugc2hvdWxkIGJlIHN1cHByZXNzZWRcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29ubmVjdCgnbXlhbGlhcycsICd0ZXN0LWFnZW50Jyk7XG5cblx0XHQvLyBTaW11bGF0ZSB0aGUgb2xkIHJlbGF5J3MgY2xvc2UgZXZlbnQgZmlyaW5nIGFzeW5jaHJvbm91c2x5XG5cdFx0c2VydmljZS5zaW11bGF0ZU9sZFJlbGF5Q2xvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2xvc2VFdmVudHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmVjb25uZWN0IHN1cHByZXNzZXMgc3luY2hyb25vdXMgY2xvc2UgZnJvbSBvbGQgcmVsYXkgZHVyaW5nIHJlcGxhY2VtZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IGRpc2NvdmVyeVJlc3BvbnNlcyhbbWFrZUVuZHBvaW50KHsgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDEyMzQsIGluc3RhbmNlSWQ6ICdpbnN0LTEnIH0pXSk7XG5cblx0XHRjb25zdCBjb25maWcgPSBtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ215YWxpYXMnIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjb25maWcpO1xuXG5cdFx0Y29uc3QgY2xvc2VFdmVudHM6IHN0cmluZ1tdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSZWxheUNsb3NlKGlkID0+IGNsb3NlRXZlbnRzLnB1c2goaWQpKSk7XG5cblx0XHQvLyBNYWtlIHRoZSBmaXJzdCByZWxheSdzIGNsb3NlKCkgc3luY2hyb25vdXNseSBmaXJlIGl0cyBvbkNsb3NlIGNhbGxiYWNrLFxuXHRcdC8vIHNpbXVsYXRpbmcgYSBXZWJTb2NrZXQgdGhhdCBmaXJlcyAnY2xvc2UnIHN5bmNocm9ub3VzbHkgb24gd3MuY2xvc2UoKS5cblx0XHRzZXJ2aWNlLm1ha2VQcmV2aW91c1JlbGF5U3luY0Nsb3NlKCk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29ubmVjdCgnbXlhbGlhcycsICd0ZXN0LWFnZW50Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbG9zZUV2ZW50cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHNzaENvbmZpZ0hvc3QgYXMgY29ubmVjdGlvbiBrZXkgd2hlbiBwcmVzZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IGRpc2NvdmVyeVJlc3BvbnNlcyhbbWFrZUVuZHBvaW50KHsgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDEyMzQsIGluc3RhbmNlSWQ6ICdpbnN0LTEnIH0pXSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICdteWhvc3QnIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbm5lY3Rpb25JZCwgJ3NzaDpteWhvc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNzaENvbmZpZ0hvc3QsICdteWhvc3QnKTtcblx0fSk7XG5cblx0Ly8gLS0tIHJlbW90ZUFnZW50SG9zdENvbW1hbmQgb3ZlcnJpZGUgc2tpcHMgZGlzY292ZXJ5IGVudGlyZWx5IC0tLVxuXG5cdHRlc3QoJ3NraXBzIGVuZHBvaW50IGRpc2NvdmVyeSBhbmQgQ0xJIGluc3RhbGwgd2l0aCByZW1vdGVBZ2VudEhvc3RDb21tYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoZSBvdmVycmlkZSBwYXRoIG5ldmVyIGV4ZWNzIGFueXRoaW5nIGJlZm9yZSBzdGFydGluZyB0aGUgYWdlbnRcblx0XHQvLyBob3N0IGl0c2VsZiAobm8gdW5hbWUsIG5vIENMSSBjaGVjaywgbm8gYGFnZW50IGVuZHBvaW50c2ApLlxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHtcblx0XHRcdHJlbW90ZUFnZW50SG9zdENvbW1hbmQ6ICcvY3VzdG9tL2FnZW50IC0tcG9ydCAwJyxcblx0XHR9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb25uZWN0aW9uSWQsICd0ZXN0dXNlckAxMC4wLjAuMToyMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc2VydmVyVHlwZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmluc3RhbmNlSWQsICdvdmVycmlkZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGlmZWN5Y2xlLCAnbWFuYWdlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnN0YXJ0Q2FsbGVkLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UubW9ja0NsaWVudHNbMF0uZXhlY0NhbGxzLCBbXSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBTZWxlY3Rpb24gcG9saWN5IChyZXF1aXJlbWVudCAyKSAtLS1cblxuXHR0ZXN0KCdzcGF3bnMgYSBkZWRpY2F0ZWQgc3RhbmRhbG9uZSB3aGVuIG5vIGxpdmUgZW5kcG9pbnRzIGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG5ld0VudHJ5ID0gbWFrZUVuZHBvaW50KHsgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDU1NSwgaW5zdGFuY2VJZDogJ3NwYXduZWQtMScsIGVuZHBvaW50OiB7IHR5cGU6ICd0Y3AnLCBob3N0OiAnMTI3LjAuMC4xJywgcG9ydDogOTAwMSB9IH0pO1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdC4uLmRpc2NvdmVyeVJlc3BvbnNlcyhbXSksXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzcGF3biBjb21tYW5kIChmaXJlLWFuZC1mb3JnZXQpXG5cdFx0XHR7IHN0ZG91dDogYWdlbnRFbmRwb2ludHNTdGRvdXQoW25ld0VudHJ5XSksIGNvZGU6IDAgfSwgLy8gd2FpdC1wb2xsOiBhZ2VudCBlbmRwb2ludHMgKGZpbmRzIHRoZSBuZXcgZW50cnkpXG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ215aG9zdCcgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc2VydmVyVHlwZSwgJ3N0YW5kYWxvbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmluc3RhbmNlSWQsICdzcGF3bmVkLTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmxpZmVjeWNsZSwgJ21hbmFnZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnByaW1hcnksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlbGF5Q2FsbGVkLCAxKTtcblxuXHRcdGNvbnN0IGV4ZWNDYWxscyA9IHNlcnZpY2UubW9ja0NsaWVudHNbMF0uZXhlY0NhbGxzO1xuXHRcdGFzc2VydC5vayhleGVjQ2FsbHMuc29tZShjID0+IGMuaW5jbHVkZXMoJy0taWRsZS10aW1lb3V0IDMwMCcpKSwgYHNob3VsZCBzcGF3biB3aXRoIGlkbGUgdGltZW91dDsgc2F3OiAke0pTT04uc3RyaW5naWZ5KGV4ZWNDYWxscyl9YCk7XG5cdFx0YXNzZXJ0Lm9rKGV4ZWNDYWxscy5zb21lKGMgPT4gYy5pbmNsdWRlcygnLS1uZXctaW5zdGFuY2UnKSksIGBzcGF3biBtdXN0IHJlcXVlc3QgYSBnZW51aW5lbHkgbmV3IGluc3RhbmNlOyBzYXc6ICR7SlNPTi5zdHJpbmdpZnkoZXhlY0NhbGxzKX1gKTtcblx0fSk7XG5cblx0dGVzdCgncmV1c2VzIHRoZSBzaW5nbGUgbGl2ZSBzdGFuZGFsb25lIGRldGVybWluaXN0aWNhbGx5IHdpdGhvdXQgYSBwaWNrZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU1NIRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0W10gPSBbXTtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBkaXNjb3ZlcnlSZXNwb25zZXMoW21ha2VFbmRwb2ludCh7IHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiAxMjM0LCBpbnN0YW5jZUlkOiAnaW5zdC0xJyB9KV0pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUmVxdWVzdEVuZHBvaW50U2VsZWN0aW9uKHIgPT4gZXZlbnRzLnB1c2gocikpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ215aG9zdCcgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc2VydmVyVHlwZSwgJ3N0YW5kYWxvbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmluc3RhbmNlSWQsICdpbnN0LTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmxpZmVjeWNsZSwgJ2V4dGVybmFsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2Uuc3RhcnRDYWxsZWQsIDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLCBbXSk7IC8vIG5vIHBpY2tlciBmb3IgdGhlIHNpbmdsZS1zdGFuZGFsb25lIGNhc2Vcblx0fSk7XG5cblx0dGVzdCgncHJvbXB0cyBhbW9uZyBtdWx0aXBsZSBzdGFuZGFsb25lcyAobm8gZWRpdG9ycykgYW5kIGhvbm9ycyB0aGUgY2hvc2VuIGNhbmRpZGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzMSA9IG1ha2VFbmRwb2ludCh7IHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiAxMDAsIGluc3RhbmNlSWQ6ICdpbnN0LWEnIH0pO1xuXHRcdGNvbnN0IHMyID0gbWFrZUVuZHBvaW50KHsgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDIwMCwgaW5zdGFuY2VJZDogJ2luc3QtYicgfSk7XG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gZGlzY292ZXJ5UmVzcG9uc2VzKFtzMSwgczJdKTtcblxuXHRcdGxldCBzZWVuQ2FuZGlkYXRlczogSVNTSEVuZHBvaW50U2VsZWN0aW9uUmVxdWVzdCB8IHVuZGVmaW5lZDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJlcXVlc3RFbmRwb2ludFNlbGVjdGlvbihyID0+IHsgc2VlbkNhbmRpZGF0ZXMgPSByOyB9KSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLndpdGhFbmRwb2ludFNlbGVjdGlvblJlc3BvbnNlKFxuXHRcdFx0eyBraW5kOiAnY2FuZGlkYXRlJywgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDIwMCwgaW5zdGFuY2VJZDogJ2luc3QtYicgfSxcblx0XHRcdCgpID0+IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ215aG9zdCcgfSkpLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQub2soc2VlbkNhbmRpZGF0ZXMsICdzaG91bGQgaGF2ZSByZXF1ZXN0ZWQgZW5kcG9pbnQgc2VsZWN0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlZW5DYW5kaWRhdGVzIS5jYW5kaWRhdGVzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0Lm9rKHNlZW5DYW5kaWRhdGVzIS5jYW5kaWRhdGVzLmV2ZXJ5KGMgPT4gYy50eXBlID09PSAnc3RhbmRhbG9uZScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmluc3RhbmNlSWQsICdpbnN0LWInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmxpZmVjeWNsZSwgJ2V4dGVybmFsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb21wdHMgb3ZlciBldmVyeSBsaXZlIGVuZHBvaW50IHdoZW4gYXQgbGVhc3Qgb25lIGVkaXRvciBleGlzdHMsIGFuZCBkb2VzIG5vdCB0b3VjaCBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlZGl0b3IgPSBtYWtlRW5kcG9pbnQoeyB0eXBlOiAnZWRpdG9yJywgcGlkOiAzMDAsIGluc3RhbmNlSWQ6ICdlZGl0b3ItMScsIGVuZHBvaW50OiB7IHR5cGU6ICdzb2NrZXQnLCBwYXRoOiAnL3RtcC9hZ2VudC5zb2NrJyB9IH0pO1xuXHRcdGNvbnN0IHN0YW5kYWxvbmUgPSBtYWtlRW5kcG9pbnQoeyB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogNDAwLCBpbnN0YW5jZUlkOiAnaW5zdC1jJyB9KTtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBkaXNjb3ZlcnlSZXNwb25zZXMoW2VkaXRvciwgc3RhbmRhbG9uZV0pO1xuXG5cdFx0bGV0IHNlZW5DYW5kaWRhdGVzOiBJU1NIRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0IHwgdW5kZWZpbmVkO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUmVxdWVzdEVuZHBvaW50U2VsZWN0aW9uKHIgPT4geyBzZWVuQ2FuZGlkYXRlcyA9IHI7IH0pKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2Uud2l0aEVuZHBvaW50U2VsZWN0aW9uUmVzcG9uc2UoXG5cdFx0XHR7IGtpbmQ6ICdjYW5kaWRhdGUnLCB0eXBlOiAnZWRpdG9yJywgcGlkOiAzMDAsIGluc3RhbmNlSWQ6ICdlZGl0b3ItMScgfSxcblx0XHRcdCgpID0+IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ215aG9zdCcgfSkpLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VlbkNhbmRpZGF0ZXMhLmNhbmRpZGF0ZXMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNlcnZlclR5cGUsICdlZGl0b3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmluc3RhbmNlSWQsICdlZGl0b3ItMScpO1xuXHRcdC8vIEVkaXRvciBzZWxlY3Rpb24gaXMgcHJpbWFyeStleHRlcm5hbCBcdTIwMTQgbmV2ZXIga2lsbGVkL3JlcGxhY2VkLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGlmZWN5Y2xlLCAnZXh0ZXJuYWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnByaW1hcnksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnN0YXJ0Q2FsbGVkLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnY2hvb3NpbmcgXCJTdGFydCBOZXcgRGVkaWNhdGVkIEFnZW50IEhvc3RcIiBmcm9tIHRoZSBwaWNrZXIgc3Bhd25zLCBsZWF2aW5nIG90aGVyIGxpdmUgZW5kcG9pbnRzIHVudG91Y2hlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlZGl0b3IgPSBtYWtlRW5kcG9pbnQoeyB0eXBlOiAnZWRpdG9yJywgcGlkOiAzMDAsIGluc3RhbmNlSWQ6ICdlZGl0b3ItMScsIGVuZHBvaW50OiB7IHR5cGU6ICdzb2NrZXQnLCBwYXRoOiAnL3RtcC9hZ2VudC5zb2NrJyB9IH0pO1xuXHRcdGNvbnN0IHNwYXduZWQgPSBtYWtlRW5kcG9pbnQoeyB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogOTk5LCBpbnN0YW5jZUlkOiAnc3Bhd25lZC0yJyB9KTtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHQuLi5kaXNjb3ZlcnlSZXNwb25zZXMoW2VkaXRvcl0pLFxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzcGF3biBjb21tYW5kXG5cdFx0XHR7IHN0ZG91dDogYWdlbnRFbmRwb2ludHNTdGRvdXQoW2VkaXRvciwgc3Bhd25lZF0pLCBjb2RlOiAwIH0sIC8vIHdhaXQtcG9sbCBmaW5kcyB0aGUgbmV3IHN0YW5kYWxvbmVcblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS53aXRoRW5kcG9pbnRTZWxlY3Rpb25SZXNwb25zZShcblx0XHRcdHsga2luZDogJ3NwYXduJyB9LFxuXHRcdFx0KCkgPT4gc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoeyBzc2hDb25maWdIb3N0OiAnbXlob3N0JyB9KSksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5zdGFuY2VJZCwgJ3NwYXduZWQtMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGlmZWN5Y2xlLCAnbWFuYWdlZCcpO1xuXG5cdFx0Ly8gUmVxdWlyZW1lbnQgcmVmaW5lbWVudDogdGhlIHBpY2tlcidzIFwiU3RhcnQgTmV3IERlZGljYXRlZFwiIGNob2ljZSBtdXN0XG5cdFx0Ly8gdXNlIC0tbmV3LWluc3RhbmNlIHNvIHRoZSBleGlzdGluZyBlZGl0b3Ivc3RhbmRhbG9uZSBlbnRyaWVzIGFyZSBuZXZlclxuXHRcdC8vIHNpbGVudGx5IHJldXNlZC90b3VjaGVkLCBhbmQgYSBnZW51aW5lbHkgbmV3IGVudHJ5IGlzIGFsd2F5cyBjcmVhdGVkLlxuXHRcdGNvbnN0IGV4ZWNDYWxscyA9IHNlcnZpY2UubW9ja0NsaWVudHNbMF0uZXhlY0NhbGxzO1xuXHRcdGFzc2VydC5vayhleGVjQ2FsbHMuc29tZShjID0+IGMuaW5jbHVkZXMoJy0tbmV3LWluc3RhbmNlJykpLCBgc3Bhd24gbXVzdCByZXF1ZXN0IGEgZ2VudWluZWx5IG5ldyBpbnN0YW5jZTsgc2F3OiAke0pTT04uc3RyaW5naWZ5KGV4ZWNDYWxscyl9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbGxpbmcgdGhlIGVuZHBvaW50LXNlbGVjdGlvbiBwaWNrZXIgcmVqZWN0cyBjb25uZWN0IHdpdGggY2FuY2VsbGF0aW9uIGFuZCBkb2VzIG5vdCBzcGF3bicsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBkaXNjb3ZlcnlSZXNwb25zZXMoW1xuXHRcdFx0bWFrZUVuZHBvaW50KHsgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDEwMCwgaW5zdGFuY2VJZDogJ2luc3QtYScgfSksXG5cdFx0XHRtYWtlRW5kcG9pbnQoeyB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogMjAwLCBpbnN0YW5jZUlkOiAnaW5zdC1iJyB9KSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHJlcXVlc3RJZHM6IHN0cmluZ1tdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSZXF1ZXN0RW5kcG9pbnRTZWxlY3Rpb24ociA9PiByZXF1ZXN0SWRzLnB1c2goci5yZXF1ZXN0SWQpKSk7XG5cblx0XHQvLyBXYWl0IGZvciB0aGUgcGlja2VyIHJlcXVlc3QgdG8gYWN0dWFsbHkgZmlyZSAoYWZ0ZXIgcmVnaXN0cnkgZGlzY292ZXJ5XG5cdFx0Ly8gY29tcGxldGVzKSByYXRoZXIgdGhhbiBndWVzc2luZyBhIGZpeGVkIG51bWJlciBvZiBtaWNyb3Rhc2sgdGlja3MuXG5cdFx0Y29uc3QgcmVxdWVzdFByb21pc2UgPSBFdmVudC50b1Byb21pc2Uoc2VydmljZS5vbkRpZFJlcXVlc3RFbmRwb2ludFNlbGVjdGlvbik7XG5cdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICdteWhvc3QnIH0pKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gYXdhaXQgcmVxdWVzdFByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3RJZHMubGVuZ3RoLCAxKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlc3BvbmRFbmRwb2ludFNlbGVjdGlvbihyZXF1ZXN0LnJlcXVlc3RJZCwgdW5kZWZpbmVkKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNvbm5lY3RQcm9taXNlLCBlcnJvciA9PiBpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2Uuc3RhcnRDYWxsZWQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlbGF5Q2FsbGVkLCAwKTtcblx0fSk7XG5cblx0Ly8gLS0tIFNpbGVudC9iYWNrZ3JvdW5kIHJlY29ubmVjdCBwb2xpY3k6IHVzZXJJbml0aWF0ZWQ6IGZhbHNlIChyZXZpZXctZmluZGluZyBmaXgpIC0tLVxuXHQvL1xuXHQvLyBBIGNvbGQtc3RhcnQgcmVjb25uZWN0IChubyBwcmlvciBpbi1tZW1vcnkgY29ubmVjdGlvbiBmb3IgdGhlIGtleSBcdTIwMTRcblx0Ly8gZS5nLiB0aGUgdmVyeSBmaXJzdCBhdXRvLXJlY29ubmVjdCBhdHRlbXB0IGFmdGVyIHN0YXJ0dXApIG11c3QgbmV2ZXJcblx0Ly8gb3BlbiB0aGUgZW5kcG9pbnQtc2VsZWN0aW9uIHBpY2tlciwgYW5kIG11c3QgbmV2ZXIgc2lsZW50bHkgYXR0YWNoIHRvXG5cdC8vIGFuIGBlZGl0b3JgLW93bmVkIGVuZHBvaW50IGV2ZW4gaWYgdGhhdCBpcyB0aGUgb25seSBsaXZlIGVuZHBvaW50LlxuXHQvLyBSZWdhcmRsZXNzIG9mIGhvdyBtYW55IGVkaXRvcnMvc3RhbmRhbG9uZXMgYXJlIGxpdmUsIGl0IGRldGVybWluaXN0aWNhbGx5XG5cdC8vIHJldXNlcyBhIGxpdmUgc3RhbmRhbG9uZSAobG93ZXN0IGBpbnN0YW5jZUlkYCBmaXJzdCkgd2hlbiBvbmUgZXhpc3RzLFxuXHQvLyBvciBzcGF3bnMgYSBuZXcgZGVkaWNhdGVkIG9uZSAod2l0aCBgLS1uZXctaW5zdGFuY2VgKSBvdGhlcndpc2UuXG5cblx0dGVzdCgnc2lsZW50IHJlY29ubmVjdCAodXNlckluaXRpYXRlZDogZmFsc2UpIHdpdGggb25seSBhbiBlZGl0b3IgZW50cnkgbmV2ZXIgcHJvbXB0cyBhbmQgc3Bhd25zIGEgbmV3IGRlZGljYXRlZCBzdGFuZGFsb25lIHJhdGhlciB0aGFuIHJldXNpbmcgdGhlIGVkaXRvcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlZGl0b3IgPSBtYWtlRW5kcG9pbnQoeyB0eXBlOiAnZWRpdG9yJywgcGlkOiAzMDAsIGluc3RhbmNlSWQ6ICdlZGl0b3ItMScsIGVuZHBvaW50OiB7IHR5cGU6ICdzb2NrZXQnLCBwYXRoOiAnL3RtcC9hZ2VudC5zb2NrJyB9IH0pO1xuXHRcdGNvbnN0IHNwYXduZWQgPSBtYWtlRW5kcG9pbnQoeyB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogOTk5LCBpbnN0YW5jZUlkOiAnc3Bhd25lZC0zJyB9KTtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHQuLi5kaXNjb3ZlcnlSZXNwb25zZXMoW2VkaXRvcl0pLFxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzcGF3biBjb21tYW5kIChmaXJlLWFuZC1mb3JnZXQpXG5cdFx0XHR7IHN0ZG91dDogYWdlbnRFbmRwb2ludHNTdGRvdXQoW2VkaXRvciwgc3Bhd25lZF0pLCBjb2RlOiAwIH0sIC8vIHdhaXQtcG9sbCBmaW5kcyB0aGUgbmV3IHN0YW5kYWxvbmVcblx0XHRdO1xuXG5cdFx0Y29uc3QgZXZlbnRzOiBJU1NIRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJlcXVlc3RFbmRwb2ludFNlbGVjdGlvbihyID0+IGV2ZW50cy5wdXNoKHIpKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICdteWhvc3QnLCB1c2VySW5pdGlhdGVkOiBmYWxzZSB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW10sICdzaWxlbnQgcmVjb25uZWN0IG11c3QgbmV2ZXIgZmlyZSBhbiBlbmRwb2ludC1zZWxlY3Rpb24gcmVxdWVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc2VydmVyVHlwZSwgJ3N0YW5kYWxvbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmluc3RhbmNlSWQsICdzcGF3bmVkLTMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmxpZmVjeWNsZSwgJ21hbmFnZWQnKTtcblx0XHRjb25zdCBleGVjQ2FsbHMgPSBzZXJ2aWNlLm1vY2tDbGllbnRzWzBdLmV4ZWNDYWxscztcblx0XHRhc3NlcnQub2soZXhlY0NhbGxzLnNvbWUoYyA9PiBjLmluY2x1ZGVzKCctLW5ldy1pbnN0YW5jZScpKSwgYHNwYXduIG11c3QgcmVxdWVzdCBhIGdlbnVpbmVseSBuZXcgaW5zdGFuY2U7IHNhdzogJHtKU09OLnN0cmluZ2lmeShleGVjQ2FsbHMpfWApO1xuXHR9KTtcblxuXHR0ZXN0KCdzaWxlbnQgcmVjb25uZWN0ICh1c2VySW5pdGlhdGVkOiBmYWxzZSkgcmV1c2VzIHRoZSBzaW5nbGUgbGl2ZSBzdGFuZGFsb25lIGRldGVybWluaXN0aWNhbGx5IHdpdGhvdXQgYSBwaWNrZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gZGlzY292ZXJ5UmVzcG9uc2VzKFttYWtlRW5kcG9pbnQoeyB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogMTIzNCwgaW5zdGFuY2VJZDogJ2luc3QtMScgfSldKTtcblxuXHRcdGNvbnN0IGV2ZW50czogSVNTSEVuZHBvaW50U2VsZWN0aW9uUmVxdWVzdFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSZXF1ZXN0RW5kcG9pbnRTZWxlY3Rpb24ociA9PiBldmVudHMucHVzaChyKSkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoeyBzc2hDb25maWdIb3N0OiAnbXlob3N0JywgdXNlckluaXRpYXRlZDogZmFsc2UgfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNlcnZlclR5cGUsICdzdGFuZGFsb25lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbnN0YW5jZUlkLCAnaW5zdC0xJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5saWZlY3ljbGUsICdleHRlcm5hbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnN0YXJ0Q2FsbGVkLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2lsZW50IHJlY29ubmVjdCAodXNlckluaXRpYXRlZDogZmFsc2UpIHdpdGggbXVsdGlwbGUgbGl2ZSBzdGFuZGFsb25lcyBhbmQgYW4gZWRpdG9yIHJldXNlcyB0aGUgbG93ZXN0IGluc3RhbmNlSWQgZGV0ZXJtaW5pc3RpY2FsbHkgd2l0aG91dCBhIHBpY2tlcicsIGFzeW5jICgpID0+IHtcblx0XHQvLyBNaXhlcyBhbiBlZGl0b3IgZW50cnkgaW4gb24gcHVycG9zZTogZXZlbiB3aXRoIGVkaXRvcnMgbGl2ZSwgdGhlXG5cdFx0Ly8gc2lsZW50IHBhdGggbXVzdCBzdGlsbCBza2lwIHRoZSBwaWNrZXIgYW5kIHByZWZlciBhIHN0YW5kYWxvbmUuXG5cdFx0Y29uc3QgZWRpdG9yID0gbWFrZUVuZHBvaW50KHsgdHlwZTogJ2VkaXRvcicsIHBpZDogMzAwLCBpbnN0YW5jZUlkOiAnZWRpdG9yLTEnLCBlbmRwb2ludDogeyB0eXBlOiAnc29ja2V0JywgcGF0aDogJy90bXAvYWdlbnQuc29jaycgfSB9KTtcblx0XHRjb25zdCBzMSA9IG1ha2VFbmRwb2ludCh7IHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiAxMDAsIGluc3RhbmNlSWQ6ICdpbnN0LWInIH0pO1xuXHRcdGNvbnN0IHMyID0gbWFrZUVuZHBvaW50KHsgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDIwMCwgaW5zdGFuY2VJZDogJ2luc3QtYScgfSk7XG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gZGlzY292ZXJ5UmVzcG9uc2VzKFtlZGl0b3IsIHMxLCBzMl0pO1xuXG5cdFx0Y29uc3QgZXZlbnRzOiBJU1NIRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJlcXVlc3RFbmRwb2ludFNlbGVjdGlvbihyID0+IGV2ZW50cy5wdXNoKHIpKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICdteWhvc3QnLCB1c2VySW5pdGlhdGVkOiBmYWxzZSB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW10sICdzaWxlbnQgcmVjb25uZWN0IG11c3QgbmV2ZXIgZmlyZSBhbiBlbmRwb2ludC1zZWxlY3Rpb24gcmVxdWVzdCwgZXZlbiB3aXRoIG11bHRpcGxlIGNhbmRpZGF0ZXMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNlcnZlclR5cGUsICdzdGFuZGFsb25lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbnN0YW5jZUlkLCAnaW5zdC1hJywgJ211c3QgZGV0ZXJtaW5pc3RpY2FsbHkgcGljayB0aGUgbG93ZXN0IGluc3RhbmNlSWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmxpZmVjeWNsZSwgJ2V4dGVybmFsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2Uuc3RhcnRDYWxsZWQsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2xkLXN0YXJ0IHJlY29ubmVjdCgpIHZpYSB1c2VySW5pdGlhdGVkPWZhbHNlIHBhcmFtIG5ldmVyIHByb21wdHMgYW5kIHJldXNlcyBhIGxpdmUgc3RhbmRhbG9uZSAocHJvdmVzIHRoZSByZWNvbm5lY3QoKSBBUEksIG5vdCBqdXN0IGNvbm5lY3QoKSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gRXhlcmNpc2VzIHJlY29ubmVjdCgpIGRpcmVjdGx5IHdpdGggbm8gcHJpb3IgY29ubmVjdCgpIGNhbGwgZm9yIHRoaXNcblx0XHQvLyBrZXkgXHUyMDE0IHRoZSB0cnVlIFwiY29sZCBzdGFydFwiIHNoYXBlIG9mIHRoZSBiYWNrZ3JvdW5kIGF1dG8tcmVjb25uZWN0XG5cdFx0Ly8gY2FsbCBzaXRlIGluIHJlbW90ZUFnZW50SG9zdC5jb250cmlidXRpb24udHMsIHdoaWNoIGhhcyBubyBleGlzdGluZ1xuXHRcdC8vIGluLW1lbW9yeSBjb25uZWN0aW9uIHRvIGZhc3QtcGF0aCBvZmYgb2YuXG5cdFx0Y29uc3QgZWRpdG9yID0gbWFrZUVuZHBvaW50KHsgdHlwZTogJ2VkaXRvcicsIHBpZDogMzAwLCBpbnN0YW5jZUlkOiAnZWRpdG9yLTEnLCBlbmRwb2ludDogeyB0eXBlOiAnc29ja2V0JywgcGF0aDogJy90bXAvYWdlbnQuc29jaycgfSB9KTtcblx0XHRjb25zdCBzdGFuZGFsb25lID0gbWFrZUVuZHBvaW50KHsgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDQwMCwgaW5zdGFuY2VJZDogJ2luc3QtYycgfSk7XG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gZGlzY292ZXJ5UmVzcG9uc2VzKFtlZGl0b3IsIHN0YW5kYWxvbmVdKTtcblxuXHRcdGNvbnN0IGV2ZW50czogSVNTSEVuZHBvaW50U2VsZWN0aW9uUmVxdWVzdFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSZXF1ZXN0RW5kcG9pbnRTZWxlY3Rpb24ociA9PiBldmVudHMucHVzaChyKSkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZWNvbm5lY3QoJ215aG9zdCcsICd0ZXN0LWhvc3QnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgLyogdXNlckluaXRpYXRlZCAqLyBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW10sICdjb2xkLXN0YXJ0IHNpbGVudCByZWNvbm5lY3QoKSBtdXN0IG5ldmVyIGZpcmUgYW4gZW5kcG9pbnQtc2VsZWN0aW9uIHJlcXVlc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNlcnZlclR5cGUsICdzdGFuZGFsb25lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbnN0YW5jZUlkLCAnaW5zdC1jJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5saWZlY3ljbGUsICdleHRlcm5hbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnN0YXJ0Q2FsbGVkLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnY29sZC1zdGFydCByZWNvbm5lY3QoKSB2aWEgdXNlckluaXRpYXRlZD10cnVlIHBhcmFtIHN0aWxsIHByb21wdHMgd2hlbiBhbiBlZGl0b3IgZW50cnkgZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRvciA9IG1ha2VFbmRwb2ludCh7IHR5cGU6ICdlZGl0b3InLCBwaWQ6IDMwMCwgaW5zdGFuY2VJZDogJ2VkaXRvci0xJywgZW5kcG9pbnQ6IHsgdHlwZTogJ3NvY2tldCcsIHBhdGg6ICcvdG1wL2FnZW50LnNvY2snIH0gfSk7XG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gZGlzY292ZXJ5UmVzcG9uc2VzKFtlZGl0b3JdKTtcblxuXHRcdGxldCBzZWVuQ2FuZGlkYXRlczogSVNTSEVuZHBvaW50U2VsZWN0aW9uUmVxdWVzdCB8IHVuZGVmaW5lZDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJlcXVlc3RFbmRwb2ludFNlbGVjdGlvbihyID0+IHsgc2VlbkNhbmRpZGF0ZXMgPSByOyB9KSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLndpdGhFbmRwb2ludFNlbGVjdGlvblJlc3BvbnNlKFxuXHRcdFx0eyBraW5kOiAnY2FuZGlkYXRlJywgdHlwZTogJ2VkaXRvcicsIHBpZDogMzAwLCBpbnN0YW5jZUlkOiAnZWRpdG9yLTEnIH0sXG5cdFx0XHQoKSA9PiBzZXJ2aWNlLnJlY29ubmVjdCgnbXlob3N0JywgJ3Rlc3QtaG9zdCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAvKiB1c2VySW5pdGlhdGVkICovIHRydWUpLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQub2soc2VlbkNhbmRpZGF0ZXMsICd1c2VyLWluaXRpYXRlZCByZWNvbm5lY3QoKSBtdXN0IHN0aWxsIHNob3cgdGhlIHBpY2tlciB3aGVuIGFuIGVkaXRvciBlbnRyeSBleGlzdHMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNlcnZlclR5cGUsICdlZGl0b3InKTtcblx0fSk7XG5cblx0dGVzdCgndXNlci1pbml0aWF0ZWQgcmVjb25uZWN0ICh1c2VySW5pdGlhdGVkOiB0cnVlKSBzdGlsbCBwcm9tcHRzIHdoZW4gYW4gZWRpdG9yIGVudHJ5IGV4aXN0cywgY29udHJhc3Rpbmcgd2l0aCB0aGUgc2lsZW50IHBhdGgnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gbWFrZUVuZHBvaW50KHsgdHlwZTogJ2VkaXRvcicsIHBpZDogMzAwLCBpbnN0YW5jZUlkOiAnZWRpdG9yLTEnLCBlbmRwb2ludDogeyB0eXBlOiAnc29ja2V0JywgcGF0aDogJy90bXAvYWdlbnQuc29jaycgfSB9KTtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBkaXNjb3ZlcnlSZXNwb25zZXMoW2VkaXRvcl0pO1xuXG5cdFx0bGV0IHNlZW5DYW5kaWRhdGVzOiBJU1NIRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0IHwgdW5kZWZpbmVkO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUmVxdWVzdEVuZHBvaW50U2VsZWN0aW9uKHIgPT4geyBzZWVuQ2FuZGlkYXRlcyA9IHI7IH0pKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2Uud2l0aEVuZHBvaW50U2VsZWN0aW9uUmVzcG9uc2UoXG5cdFx0XHR7IGtpbmQ6ICdjYW5kaWRhdGUnLCB0eXBlOiAnZWRpdG9yJywgcGlkOiAzMDAsIGluc3RhbmNlSWQ6ICdlZGl0b3ItMScgfSxcblx0XHRcdCgpID0+IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ215aG9zdCcsIHVzZXJJbml0aWF0ZWQ6IHRydWUgfSkpLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQub2soc2VlbkNhbmRpZGF0ZXMsICd1c2VyLWluaXRpYXRlZCBjb25uZWN0cyBtdXN0IHN0aWxsIHNob3cgdGhlIHBpY2tlciB3aGVuIGFuIGVkaXRvciBlbnRyeSBleGlzdHMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNlcnZlclR5cGUsICdlZGl0b3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmluc3RhbmNlSWQsICdlZGl0b3ItMScpO1xuXHR9KTtcblxuXHQvLyAtLS0gU3RvcmVkIHByZWZlcmVuY2UgaGludCAoYGNvbmZpZy5wcmVmZXJyZWRBZ2VudExvY2F0aW9uYCk6IGFcblx0Ly8gcmVuZGVyZXItZGVyaXZlZCBgSVJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2VgIGNob2ljZVxuXHQvLyB0aHJlYWRlZCB0aHJvdWdoIGBJU1NIQWdlbnRIb3N0Q29uZmlnYCBzbyB0aGUgbWFpbiBwcm9jZXNzIGNhbiBob25vclxuXHQvLyBpdCBkaXJlY3RseSwgd2l0aG91dCBldmVyIGVtaXR0aW5nIGFuIGVuZHBvaW50LXNlbGVjdGlvbiByZXF1ZXN0IFx1MjAxNFxuXHQvLyBmb3IgYm90aCB1c2VyLWluaXRpYXRlZCBhbmQgc2lsZW50L2JhY2tncm91bmQgY29ubmVjdHMuXG5cblx0dGVzdCgnc3RvcmVkIFwiZWRpdG9yXCIgcHJlZmVyZW5jZSBzZWxlY3RzIHRoZSBkZXRlcm1pbmlzdGljIGxpdmUgZWRpdG9yIHdpdGhvdXQgYSByZXF1ZXN0LCBldmVuIGZvciBhIHNpbGVudCByZWNvbm5lY3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yQSA9IG1ha2VFbmRwb2ludCh7IHR5cGU6ICdlZGl0b3InLCBwaWQ6IDEwMCwgaW5zdGFuY2VJZDogJ2VkaXRvci1iJywgZW5kcG9pbnQ6IHsgdHlwZTogJ3NvY2tldCcsIHBhdGg6ICcvdG1wL2Euc29jaycgfSB9KTtcblx0XHRjb25zdCBlZGl0b3JCID0gbWFrZUVuZHBvaW50KHsgdHlwZTogJ2VkaXRvcicsIHBpZDogMjAwLCBpbnN0YW5jZUlkOiAnZWRpdG9yLWEnLCBlbmRwb2ludDogeyB0eXBlOiAnc29ja2V0JywgcGF0aDogJy90bXAvYi5zb2NrJyB9IH0pO1xuXHRcdGNvbnN0IHN0YW5kYWxvbmUgPSBtYWtlRW5kcG9pbnQoeyB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogMzAwLCBpbnN0YW5jZUlkOiAnaW5zdC1jJyB9KTtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBkaXNjb3ZlcnlSZXNwb25zZXMoW2VkaXRvckEsIGVkaXRvckIsIHN0YW5kYWxvbmVdKTtcblxuXHRcdGNvbnN0IGV2ZW50czogSVNTSEVuZHBvaW50U2VsZWN0aW9uUmVxdWVzdFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSZXF1ZXN0RW5kcG9pbnRTZWxlY3Rpb24ociA9PiBldmVudHMucHVzaChyKSkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoeyBzc2hDb25maWdIb3N0OiAnbXlob3N0JywgdXNlckluaXRpYXRlZDogZmFsc2UsIHByZWZlcnJlZEFnZW50TG9jYXRpb246ICdlZGl0b3InIH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLCBbXSwgJ2Egc3RvcmVkIHByZWZlcmVuY2UgbXVzdCBuZXZlciBmaXJlIGFuIGVuZHBvaW50LXNlbGVjdGlvbiByZXF1ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zZXJ2ZXJUeXBlLCAnZWRpdG9yJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbnN0YW5jZUlkLCAnZWRpdG9yLWEnLCAnbXVzdCBkZXRlcm1pbmlzdGljYWxseSBwaWNrIHRoZSBsb3dlc3QgaW5zdGFuY2VJZCBlZGl0b3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmxpZmVjeWNsZSwgJ2V4dGVybmFsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0b3JlZCBcImVkaXRvclwiIHByZWZlcmVuY2Ugd2l0aCBubyBsaXZlIGVkaXRvciBmYWxscyBiYWNrIHRvIGRlZGljYXRlZCBzZWxlY3Rpb24gd2l0aG91dCBhIHJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgczEgPSBtYWtlRW5kcG9pbnQoeyB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogMTAwLCBpbnN0YW5jZUlkOiAnaW5zdC1iJyB9KTtcblx0XHRjb25zdCBzMiA9IG1ha2VFbmRwb2ludCh7IHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiAyMDAsIGluc3RhbmNlSWQ6ICdpbnN0LWEnIH0pO1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IGRpc2NvdmVyeVJlc3BvbnNlcyhbczEsIHMyXSk7XG5cblx0XHRjb25zdCBldmVudHM6IElTU0hFbmRwb2ludFNlbGVjdGlvblJlcXVlc3RbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUmVxdWVzdEVuZHBvaW50U2VsZWN0aW9uKHIgPT4gZXZlbnRzLnB1c2gocikpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ215aG9zdCcsIHVzZXJJbml0aWF0ZWQ6IHRydWUsIHByZWZlcnJlZEFnZW50TG9jYXRpb246ICdlZGl0b3InIH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLCBbXSwgJ3VuYXZhaWxhYmxlLWVkaXRvciBmYWxsYmFjayBtdXN0IG5ldmVyIGZpcmUgYW4gZW5kcG9pbnQtc2VsZWN0aW9uIHJlcXVlc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNlcnZlclR5cGUsICdzdGFuZGFsb25lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbnN0YW5jZUlkLCAnaW5zdC1hJywgJ211c3QgZGV0ZXJtaW5pc3RpY2FsbHkgcGljayB0aGUgbG93ZXN0IGluc3RhbmNlSWQgc3RhbmRhbG9uZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGlmZWN5Y2xlLCAnZXh0ZXJuYWwnKTtcblx0fSk7XG5cblx0dGVzdCgnc3RvcmVkIFwiZWRpdG9yXCIgcHJlZmVyZW5jZSB3aXRoIG5vdGhpbmcgbGl2ZSBzcGF3bnMgYSBuZXcgZGVkaWNhdGVkIGFnZW50IGhvc3Qgd2l0aG91dCBhIHJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3Bhd25lZCA9IG1ha2VFbmRwb2ludCh7IHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiA5OTksIGluc3RhbmNlSWQ6ICdzcGF3bmVkLTQnIH0pO1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdC4uLmRpc2NvdmVyeVJlc3BvbnNlcyhbXSksXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3Bhd24gY29tbWFuZFxuXHRcdFx0eyBzdGRvdXQ6IGFnZW50RW5kcG9pbnRzU3Rkb3V0KFtzcGF3bmVkXSksIGNvZGU6IDAgfSwgICAgIC8vIHdhaXQtcG9sbCBmaW5kcyB0aGUgbmV3IHN0YW5kYWxvbmVcblx0XHRdO1xuXG5cdFx0Y29uc3QgZXZlbnRzOiBJU1NIRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJlcXVlc3RFbmRwb2ludFNlbGVjdGlvbihyID0+IGV2ZW50cy5wdXNoKHIpKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICdteWhvc3QnLCB1c2VySW5pdGlhdGVkOiBmYWxzZSwgcHJlZmVycmVkQWdlbnRMb2NhdGlvbjogJ2VkaXRvcicgfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNlcnZlclR5cGUsICdzdGFuZGFsb25lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbnN0YW5jZUlkLCAnc3Bhd25lZC00Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5saWZlY3ljbGUsICdtYW5hZ2VkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0b3JlZCBcImRlZGljYXRlZFwiIHByZWZlcmVuY2Ugc2VsZWN0cyBkZWRpY2F0ZWQgZXZlbiB3aGVuIGFuIGVkaXRvciBpcyBsaXZlLCB3aXRob3V0IGEgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlZGl0b3IgPSBtYWtlRW5kcG9pbnQoeyB0eXBlOiAnZWRpdG9yJywgcGlkOiAzMDAsIGluc3RhbmNlSWQ6ICdlZGl0b3ItMScsIGVuZHBvaW50OiB7IHR5cGU6ICdzb2NrZXQnLCBwYXRoOiAnL3RtcC9hZ2VudC5zb2NrJyB9IH0pO1xuXHRcdGNvbnN0IHN0YW5kYWxvbmUgPSBtYWtlRW5kcG9pbnQoeyB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogNDAwLCBpbnN0YW5jZUlkOiAnaW5zdC1jJyB9KTtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBkaXNjb3ZlcnlSZXNwb25zZXMoW2VkaXRvciwgc3RhbmRhbG9uZV0pO1xuXG5cdFx0Y29uc3QgZXZlbnRzOiBJU1NIRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJlcXVlc3RFbmRwb2ludFNlbGVjdGlvbihyID0+IGV2ZW50cy5wdXNoKHIpKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICdteWhvc3QnLCB1c2VySW5pdGlhdGVkOiB0cnVlLCBwcmVmZXJyZWRBZ2VudExvY2F0aW9uOiAnZGVkaWNhdGVkJyB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW10sICdzdG9yZWQgXCJkZWRpY2F0ZWRcIiBwcmVmZXJlbmNlIG11c3QgbmV2ZXIgZmlyZSBhbiBlbmRwb2ludC1zZWxlY3Rpb24gcmVxdWVzdCwgZXZlbiB1c2VyLWluaXRpYXRlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc2VydmVyVHlwZSwgJ3N0YW5kYWxvbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmluc3RhbmNlSWQsICdpbnN0LWMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmxpZmVjeWNsZSwgJ2V4dGVybmFsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2Uuc3RhcnRDYWxsZWQsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzdG9yZWQgXCJkZWRpY2F0ZWRcIiBwcmVmZXJlbmNlIHdpdGggbm90aGluZyBsaXZlIHNwYXducyBhIG5ldyBkZWRpY2F0ZWQgYWdlbnQgaG9zdCB3aXRob3V0IGEgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzcGF3bmVkID0gbWFrZUVuZHBvaW50KHsgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDk5OSwgaW5zdGFuY2VJZDogJ3NwYXduZWQtNScgfSk7XG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gW1xuXHRcdFx0Li4uZGlzY292ZXJ5UmVzcG9uc2VzKFtdKSxcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6IGFnZW50RW5kcG9pbnRzU3Rkb3V0KFtzcGF3bmVkXSksIGNvZGU6IDAgfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgZXZlbnRzOiBJU1NIRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJlcXVlc3RFbmRwb2ludFNlbGVjdGlvbihyID0+IGV2ZW50cy5wdXNoKHIpKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICdteWhvc3QnLCB1c2VySW5pdGlhdGVkOiB0cnVlLCBwcmVmZXJyZWRBZ2VudExvY2F0aW9uOiAnZGVkaWNhdGVkJyB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc2VydmVyVHlwZSwgJ3N0YW5kYWxvbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmluc3RhbmNlSWQsICdzcGF3bmVkLTUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmxpZmVjeWNsZSwgJ21hbmFnZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnY29sZC1zdGFydCByZWNvbm5lY3QoKSB0aHJlYWRzIHByZWZlcnJlZEFnZW50TG9jYXRpb24gdGhyb3VnaCB0byBzZWxlY3RFbmRwb2ludCBhbmQgbmV2ZXIgcHJvbXB0cyB3aGVuIGEgcHJlZmVyZW5jZSBpcyBzdG9yZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yQSA9IG1ha2VFbmRwb2ludCh7IHR5cGU6ICdlZGl0b3InLCBwaWQ6IDEwMCwgaW5zdGFuY2VJZDogJ2VkaXRvci1iJywgZW5kcG9pbnQ6IHsgdHlwZTogJ3NvY2tldCcsIHBhdGg6ICcvdG1wL2Euc29jaycgfSB9KTtcblx0XHRjb25zdCBlZGl0b3JCID0gbWFrZUVuZHBvaW50KHsgdHlwZTogJ2VkaXRvcicsIHBpZDogMjAwLCBpbnN0YW5jZUlkOiAnZWRpdG9yLWEnLCBlbmRwb2ludDogeyB0eXBlOiAnc29ja2V0JywgcGF0aDogJy90bXAvYi5zb2NrJyB9IH0pO1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IGRpc2NvdmVyeVJlc3BvbnNlcyhbZWRpdG9yQSwgZWRpdG9yQl0pO1xuXG5cdFx0Y29uc3QgZXZlbnRzOiBJU1NIRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJlcXVlc3RFbmRwb2ludFNlbGVjdGlvbihyID0+IGV2ZW50cy5wdXNoKHIpKSk7XG5cblx0XHQvLyB1c2VySW5pdGlhdGVkOiB0cnVlIHdvdWxkIG5vcm1hbGx5IHN0aWxsIHByb21wdCB3aGVuIGFuIGVkaXRvciBpc1xuXHRcdC8vIGxpdmUgKHNlZSB0aGUgY29udHJhc3RpbmcgdGVzdCBhYm92ZSkgXHUyMDE0IGEgc3RvcmVkIHByZWZlcmVuY2UgbXVzdFxuXHRcdC8vIHByZS1lbXB0IHRoYXQgZW50aXJlbHkuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZWNvbm5lY3QoJ215aG9zdCcsICd0ZXN0LWhvc3QnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgLyogdXNlckluaXRpYXRlZCAqLyB0cnVlLCAvKiBwcmVmZXJyZWRBZ2VudExvY2F0aW9uICovICdlZGl0b3InKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zZXJ2ZXJUeXBlLCAnZWRpdG9yJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbnN0YW5jZUlkLCAnZWRpdG9yLWEnKTtcblx0fSk7XG5cblx0Ly8gLS0tIEZhaWx1cmUvcmFjZSBoYW5kbGluZyAocmVxdWlyZW1lbnQgNykgLS0tXG5cblx0dGVzdCgncmVsYXkgZmFpbHVyZSB0byBhIHNlbGVjdGVkIGVuZHBvaW50IHJlcmVhZHMgdGhlIHJlZ2lzdHJ5IG9uY2UgYW5kIHRocm93cywgbmV2ZXIgc2lsZW50bHkgcHJvbW90ZXMgb3Igc3Bhd25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdC4uLmRpc2NvdmVyeVJlc3BvbnNlcyhbbWFrZUVuZHBvaW50KHsgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDEyMzQsIGluc3RhbmNlSWQ6ICdpbnN0LTEnIH0pXSksXG5cdFx0XHR7IHN0ZG91dDogYWdlbnRFbmRwb2ludHNTdGRvdXQoW21ha2VFbmRwb2ludCh7IHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiAxMjM0LCBpbnN0YW5jZUlkOiAnaW5zdC0xJyB9KV0pLCBjb2RlOiAwIH0sIC8vIGRpYWdub3N0aWMgcmVyZWFkXG5cdFx0XTtcblx0XHRzZXJ2aWNlLnJlbGF5UmVzdWx0ID0gbmV3IEVycm9yKCdjb25uZWN0aW9uIHJlZnVzZWQnKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoeyBzc2hDb25maWdIb3N0OiAnbXlob3N0JyB9KSksXG5cdFx0XHQvRmFpbGVkIHRvIGNvbm5lY3QgdG8gdGhlIHNlbGVjdGVkIHJlbW90ZSBhZ2VudCBob3N0Lyxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnN0YXJ0Q2FsbGVkLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWxheUNhbGxlZCwgMSk7XG5cdFx0Ly8gRXhhY3RseSBvbmUgcmVyZWFkIGBhZ2VudCBlbmRwb2ludHNgIGNhbGwgXHUyMDE0IG5vIGFkZGl0aW9uYWwgc3Bhd24vc2VsZWN0aW9uLlxuXHRcdGNvbnN0IGFnZW50RW5kcG9pbnRzQ2FsbHMgPSBzZXJ2aWNlLm1vY2tDbGllbnRzWzBdLmV4ZWNDYWxscy5maWx0ZXIoYyA9PiBjLmluY2x1ZGVzKCdhZ2VudCBlbmRwb2ludHMnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50RW5kcG9pbnRzQ2FsbHMubGVuZ3RoLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmV0cnkgd2hlbiByZWxheSBmYWlscyBvbiBhIGZyZXNobHkgc3Bhd25lZCBhZ2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBuZXdFbnRyeSA9IG1ha2VFbmRwb2ludCh7IHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiA1NTUsIGluc3RhbmNlSWQ6ICdzcGF3bmVkLTEnIH0pO1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdC4uLmRpc2NvdmVyeVJlc3BvbnNlcyhbXSksXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSxcblx0XHRcdHsgc3Rkb3V0OiBhZ2VudEVuZHBvaW50c1N0ZG91dChbbmV3RW50cnldKSwgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6IGFnZW50RW5kcG9pbnRzU3Rkb3V0KFtuZXdFbnRyeV0pLCBjb2RlOiAwIH0sIC8vIGRpYWdub3N0aWMgcmVyZWFkIGFmdGVyIHJlbGF5IGZhaWx1cmVcblx0XHRdO1xuXHRcdHNlcnZpY2UucmVsYXlSZXN1bHQgPSBuZXcgRXJyb3IoJ2Nvbm5lY3Rpb24gcmVmdXNlZCcpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICdteWhvc3QnIH0pKSxcblx0XHRcdC9jb25uZWN0aW9uIHJlZnVzZWQvLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2Uuc3RhcnRDYWxsZWQsIDApOyAvLyBzcGF3biBoYXBwZW5zIHZpYSBleGVjLCBub3QgX3N0YXJ0UmVtb3RlQWdlbnRIb3N0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVsYXlDYWxsZWQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhbnMgdXAgU1NIIGNsaWVudCBvbiBlcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBkaXNjb3ZlcnlSZXNwb25zZXMoW10pO1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcy5wdXNoKHsgc3Rkb3V0OiAnJywgY29kZTogMCB9KTsgLy8gc3Bhd24gY29tbWFuZFxuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcy5wdXNoKHsgc3Rkb3V0OiBhZ2VudEVuZHBvaW50c1N0ZG91dChbbWFrZUVuZHBvaW50KHsgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDEsIGluc3RhbmNlSWQ6ICdpMScgfSldKSwgY29kZTogMCB9KTtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMucHVzaCh7IHN0ZG91dDogYWdlbnRFbmRwb2ludHNTdGRvdXQoW10pLCBjb2RlOiAwIH0pOyAvLyBkaWFnbm9zdGljIHJlcmVhZFxuXG5cdFx0c2VydmljZS5yZWxheVJlc3VsdCA9IG5ldyBFcnJvcignYm9vbScpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoeyBzc2hDb25maWdIb3N0OiAnbXlob3N0JyB9KSkpO1xuXG5cdFx0Ly8gU1NIIGNsaWVudCBzaG91bGQgaGF2ZSBiZWVuIGVuZGVkIGluIHRoZSBjYXRjaCBibG9ja1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLm1vY2tDbGllbnRzWzBdLmVuZGVkLCB0cnVlKTtcblx0fSk7XG5cblx0Ly8gLS0tIENvbmZpZyBzYW5pdGl6YXRpb24gLyBjb25uZWN0aW9uIGJvb2trZWVwaW5nIChvdmVycmlkZSBwYXRoOyBubyBkaXNjb3ZlcnkpIC0tLVxuXG5cdHRlc3QoJ3Nhbml0aXplcyBjb25maWcgaW4gcmVzdWx0IChzdHJpcHMgcGFzc3dvcmQgYW5kIHByaXZhdGVLZXlQYXRoKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7XG5cdFx0XHRyZW1vdGVBZ2VudEhvc3RDb21tYW5kOiAnL2FnZW50Jyxcblx0XHRcdGF1dGhNZXRob2Q6IFNTSEF1dGhNZXRob2QuUGFzc3dvcmQsXG5cdFx0XHRwYXNzd29yZDogJ3NlY3JldDEyMycsXG5cdFx0XHRwcml2YXRlS2V5UGF0aDogJy9ob21lL3VzZXIvLnNzaC9pZF9yc2EnLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0LmNvbmZpZyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbJ3Bhc3N3b3JkJ10sIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHQuY29uZmlnIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVsncHJpdmF0ZUtleVBhdGgnXSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbmZpZy5ob3N0LCAnMTAuMC4wLjEnKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzY29ubmVjdCByZW1vdmVzIGNvbm5lY3Rpb24gYW5kIGFsbG93cyByZWNvbm5lY3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoe1xuXHRcdFx0cmVtb3RlQWdlbnRIb3N0Q29tbWFuZDogJy9hZ2VudCcsXG5cdFx0fSkpO1xuXG5cdFx0Ly8gRGlzY29ubmVjdFxuXHRcdGF3YWl0IHNlcnZpY2UuZGlzY29ubmVjdChyZXN1bHQuY29ubmVjdGlvbklkKTtcblxuXHRcdC8vIE5leHQgY29ubmVjdCBzaG91bGQgY3JlYXRlIGEgbmV3IGNvbm5lY3Rpb25cblx0XHRzZXJ2aWNlLnN0YXJ0Q2FsbGVkID0gMDtcblxuXHRcdGNvbnN0IHJlc3VsdDIgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7XG5cdFx0XHRyZW1vdGVBZ2VudEhvc3RDb21tYW5kOiAnL2FnZW50Jyxcblx0XHR9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2Uuc3RhcnRDYWxsZWQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLmNvbm5lY3Rpb25JZCwgcmVzdWx0LmNvbm5lY3Rpb25JZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcmVzIG9uRGlkQ2hhbmdlQ29ubmVjdGlvbnMgb24gY29ubmVjdCBhbmQgZGlzY29ubmVjdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IHN0cmluZ1tdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2VDb25uZWN0aW9ucygoKSA9PiBldmVudHMucHVzaCgnY2hhbmdlZCcpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDbG9zZUNvbm5lY3Rpb24oaWQgPT4gZXZlbnRzLnB1c2goYGNsb3NlZDoke2lkfWApKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7XG5cdFx0XHRyZW1vdGVBZ2VudEhvc3RDb21tYW5kOiAnL2FnZW50Jyxcblx0XHR9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHNbMF0sICdjaGFuZ2VkJyk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmRpc2Nvbm5lY3QocmVzdWx0LmNvbm5lY3Rpb25JZCk7XG5cdFx0Ly8gZGlzY29ubmVjdCBmaXJlcyBjbG9zZSBiZWZvcmUgY2hhbmdlXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFtcblx0XHRcdCdjaGFuZ2VkJyxcblx0XHRcdGBjbG9zZWQ6JHtyZXN1bHQuY29ubmVjdGlvbklkfWAsXG5cdFx0XHQnY2hhbmdlZCcsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBSZWxheSBtZXNzYWdlIHJvdXRpbmcgLS0tXG5cblx0dGVzdCgncmVsYXkgbWVzc2FnZXMgZmlyZSBvbkRpZFJlbGF5TWVzc2FnZSB3aXRoIGNvcnJlY3QgY29ubmVjdGlvbklkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHtcblx0XHRcdHJlbW90ZUFnZW50SG9zdENvbW1hbmQ6ICcvYWdlbnQnLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG1lc3NhZ2VzOiBBcnJheTx7IGNvbm5lY3Rpb25JZDogc3RyaW5nOyBkYXRhOiBzdHJpbmcgfT4gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJlbGF5TWVzc2FnZShtc2cgPT4gbWVzc2FnZXMucHVzaChtc2cpKSk7XG5cblx0XHRzZXJ2aWNlLnNpbXVsYXRlUmVsYXlNZXNzYWdlKCd7XCJqc29ucnBjXCI6XCIyLjBcIixcImlkXCI6MX0nKTtcblx0XHRzZXJ2aWNlLnNpbXVsYXRlUmVsYXlNZXNzYWdlKCd7XCJqc29ucnBjXCI6XCIyLjBcIixcImlkXCI6Mn0nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVzc2FnZXMsIFtcblx0XHRcdHsgY29ubmVjdGlvbklkOiByZXN1bHQuY29ubmVjdGlvbklkLCBkYXRhOiAne1wianNvbnJwY1wiOlwiMi4wXCIsXCJpZFwiOjF9JyB9LFxuXHRcdFx0eyBjb25uZWN0aW9uSWQ6IHJlc3VsdC5jb25uZWN0aW9uSWQsIGRhdGE6ICd7XCJqc29ucnBjXCI6XCIyLjBcIixcImlkXCI6Mn0nIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbGF5IGNsb3NlIGZpcmVzIG9uRGlkUmVsYXlDbG9zZSB3aXRoIGNvcnJlY3QgY29ubmVjdGlvbklkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHtcblx0XHRcdHJlbW90ZUFnZW50SG9zdENvbW1hbmQ6ICcvYWdlbnQnLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNsb3Nlczogc3RyaW5nW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJlbGF5Q2xvc2UoaWQgPT4gY2xvc2VzLnB1c2goaWQpKSk7XG5cblx0XHRzZXJ2aWNlLnNpbXVsYXRlQ3VycmVudFJlbGF5Q2xvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2xvc2VzLCBbcmVzdWx0LmNvbm5lY3Rpb25JZF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWxheVNlbmQgZGVsaXZlcnMgZGF0YSB0byB0aGUgY29ycmVjdCBjb25uZWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlbnREYXRhOiBzdHJpbmdbXSA9IFtdO1xuXHRcdHNlcnZpY2UucmVsYXlSZXN1bHQgPSB7XG5cdFx0XHRzZW5kOiAoZGF0YTogc3RyaW5nKSA9PiBzZW50RGF0YS5wdXNoKGRhdGEpLFxuXHRcdFx0Y2xvc2U6ICgpID0+IHsgfSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoe1xuXHRcdFx0cmVtb3RlQWdlbnRIb3N0Q29tbWFuZDogJy9hZ2VudCcsXG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5yZWxheVNlbmQocmVzdWx0LmNvbm5lY3Rpb25JZCwgJ2hlbGxvJyk7XG5cdFx0YXdhaXQgc2VydmljZS5yZWxheVNlbmQocmVzdWx0LmNvbm5lY3Rpb25JZCwgJ3dvcmxkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlbnREYXRhLCBbJ2hlbGxvJywgJ3dvcmxkJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWxheVNlbmQgdG8gdW5rbm93biBjb25uZWN0aW9uSWQgaXMgYSBuby1vcCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHJlbW90ZUFnZW50SG9zdENvbW1hbmQ6ICcvYWdlbnQnIH0pKTtcblxuXHRcdC8vIFNob3VsZCBub3QgdGhyb3dcblx0XHRhd2FpdCBzZXJ2aWNlLnJlbGF5U2VuZCgnbm9uZXhpc3RlbnQnLCAnZGF0YScpO1xuXHR9KTtcblxuXHQvLyAtLS0gTXVsdGlwbGUgaW5kZXBlbmRlbnQgY29ubmVjdGlvbnMgLS0tXG5cblx0dGVzdCgnY29ubmVjdHMgdG8gdHdvIGRpZmZlcmVudCBob3N0cyBpbmRlcGVuZGVudGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHIxID0gYXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoe1xuXHRcdFx0aG9zdDogJzEwLjAuMC4xJywgcmVtb3RlQWdlbnRIb3N0Q29tbWFuZDogJy9hZ2VudCcsXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcjIgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7XG5cdFx0XHRob3N0OiAnMTAuMC4wLjInLCByZW1vdGVBZ2VudEhvc3RDb21tYW5kOiAnL2FnZW50Jyxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocjEuY29ubmVjdGlvbklkLCByMi5jb25uZWN0aW9uSWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnN0YXJ0Q2FsbGVkLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWxheUNhbGxlZCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc2Nvbm5lY3Qgb25lIGhvc3QgZG9lcyBub3QgYWZmZWN0IHRoZSBvdGhlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByMSA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHtcblx0XHRcdGhvc3Q6ICcxMC4wLjAuMScsIHJlbW90ZUFnZW50SG9zdENvbW1hbmQ6ICcvYWdlbnQnLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHIyID0gYXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoe1xuXHRcdFx0aG9zdDogJzEwLjAuMC4yJywgcmVtb3RlQWdlbnRIb3N0Q29tbWFuZDogJy9hZ2VudCcsXG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5kaXNjb25uZWN0KHIxLmNvbm5lY3Rpb25JZCk7XG5cblx0XHQvLyByMiBzaG91bGQgc3RpbGwgYmUgbGl2ZSBcdTIwMTQgZHVwbGljYXRlIGNvbm5lY3QgcmV0dXJucyBleGlzdGluZyBpbmZvXG5cdFx0Y29uc3QgcjJBZ2FpbiA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHtcblx0XHRcdGhvc3Q6ICcxMC4wLjAuMicsIHJlbW90ZUFnZW50SG9zdENvbW1hbmQ6ICcvYWdlbnQnLFxuXHRcdH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocjJBZ2Fpbi5jb25uZWN0aW9uSWQsIHIyLmNvbm5lY3Rpb25JZCk7XG5cdFx0Ly8gTm8gbmV3IHN0YXJ0IG9yIHJlbGF5IHdhcyBuZWVkZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5zdGFydENhbGxlZCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVsYXlDYWxsZWQsIDIpO1xuXHR9KTtcblxuXHQvLyAtLS0gUmVsYXkgbWVzc2FnZXMgcm91dGUgdG8gY29ycmVjdCBjb25uZWN0aW9uIHdoZW4gbXVsdGlwbGUgZXhpc3QgLS0tXG5cblx0dGVzdCgncmVsYXkgbWVzc2FnZXMgZnJvbSB0d28gY29ubmVjdGlvbnMgYXJlIGRpc3Rpbmd1aXNoZWQgYnkgY29ubmVjdGlvbklkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHIxID0gYXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoe1xuXHRcdFx0aG9zdDogJzEwLjAuMC4xJywgcmVtb3RlQWdlbnRIb3N0Q29tbWFuZDogJy9hZ2VudCcsXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcjIgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7XG5cdFx0XHRob3N0OiAnMTAuMC4wLjInLCByZW1vdGVBZ2VudEhvc3RDb21tYW5kOiAnL2FnZW50Jyxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBtZXNzYWdlczogQXJyYXk8eyBjb25uZWN0aW9uSWQ6IHN0cmluZzsgZGF0YTogc3RyaW5nIH0+ID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSZWxheU1lc3NhZ2UobXNnID0+IG1lc3NhZ2VzLnB1c2gobXNnKSkpO1xuXG5cdFx0Ly8gTWVzc2FnZSBvbiBmaXJzdCBjb25uZWN0aW9uJ3MgcmVsYXkgKGluZGV4IDApXG5cdFx0c2VydmljZS5zaW11bGF0ZVJlbGF5TWVzc2FnZSgnbXNnLWZyb20taG9zdDEnLCAwKTtcblx0XHQvLyBNZXNzYWdlIG9uIHNlY29uZCBjb25uZWN0aW9uJ3MgcmVsYXkgKGluZGV4IDEpXG5cdFx0c2VydmljZS5zaW11bGF0ZVJlbGF5TWVzc2FnZSgnbXNnLWZyb20taG9zdDInLCAxKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVzc2FnZXMsIFtcblx0XHRcdHsgY29ubmVjdGlvbklkOiByMS5jb25uZWN0aW9uSWQsIGRhdGE6ICdtc2ctZnJvbS1ob3N0MScgfSxcblx0XHRcdHsgY29ubmVjdGlvbklkOiByMi5jb25uZWN0aW9uSWQsIGRhdGE6ICdtc2ctZnJvbS1ob3N0MicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0Ly8gLS0tIFJlY29ubmVjdCBjcmVhdGVzIGZyZXNoIFNTSCBjb25uZWN0aW9uIGFmdGVyIGRpc2Nvbm5lY3QgLS0tXG5cblx0dGVzdCgncmVjb25uZWN0IGFmdGVyIGRpc2Nvbm5lY3QgZXN0YWJsaXNoZXMgYSBuZXcgU1NIIGNvbm5lY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gZGlzY292ZXJ5UmVzcG9uc2VzKFttYWtlRW5kcG9pbnQoeyB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogMTIzNCwgaW5zdGFuY2VJZDogJ2luc3QtMScgfSldKTtcblx0XHRjb25zdCByMSA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ215aG9zdCcgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLm1vY2tDbGllbnRzLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmRpc2Nvbm5lY3QocjEuY29ubmVjdGlvbklkKTtcblxuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IGRpc2NvdmVyeVJlc3BvbnNlcyhbbWFrZUVuZHBvaW50KHsgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDEyMzQsIGluc3RhbmNlSWQ6ICdpbnN0LTEnIH0pXSk7XG5cblx0XHRjb25zdCByMiA9IGF3YWl0IHNlcnZpY2UucmVjb25uZWN0KCdteWhvc3QnLCAndGVzdC1ob3N0Jyk7XG5cdFx0Ly8gU2hvdWxkIGhhdmUgY3JlYXRlZCBhIGZyZXNoIFNTSCBjbGllbnQgKG5vdCByZXVzZWQgdGhlIG9sZCBvbmUpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UubW9ja0NsaWVudHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocjIuY29ubmVjdGlvbklkLCByMS5jb25uZWN0aW9uSWQpO1xuXHR9KTtcblxuXHQvLyAtLS0gUHJvZ3Jlc3MgZXZlbnRzIC0tLVxuXG5cdHRlc3QoJ2ZpcmVzIHByb2dyZXNzIGV2ZW50cyBkdXJpbmcgY29ubmVjdCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBkaXNjb3ZlcnlSZXNwb25zZXMoW21ha2VFbmRwb2ludCh7IHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiAxMjM0LCBpbnN0YW5jZUlkOiAnaW5zdC0xJyB9KV0pO1xuXG5cdFx0Y29uc3QgcHJvZ3Jlc3M6IElTU0hDb25uZWN0UHJvZ3Jlc3NbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzKHAgPT4gcHJvZ3Jlc3MucHVzaChwKSkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoeyBzc2hDb25maWdIb3N0OiAnbXlob3N0JyB9KSk7XG5cblx0XHQvLyBFeHBlY3QgYXQgbGVhc3Q6IFNTSCBjb25uZWN0aW5nLCBwbGF0Zm9ybSBkZXRlY3Rpb24sIENMSSBjaGVjaywgYWdlbnQgZGlzY292ZXJ5LCByZWxheVxuXHRcdGFzc2VydC5vayhwcm9ncmVzcy5sZW5ndGggPj0gMywgYGV4cGVjdGVkIGF0IGxlYXN0IDMgcHJvZ3Jlc3MgZXZlbnRzLCBnb3QgJHtwcm9ncmVzcy5sZW5ndGh9YCk7XG5cdFx0YXNzZXJ0Lm9rKHByb2dyZXNzLmV2ZXJ5KHAgPT4gcC5jb25uZWN0aW9uS2V5ID09PSAnc3NoOm15aG9zdCcpKTtcblx0XHRhc3NlcnQub2socHJvZ3Jlc3MuZXZlcnkocCA9PiBwLm1lc3NhZ2UubGVuZ3RoID4gMCksICdhbGwgcHJvZ3Jlc3MgbWVzc2FnZXMgc2hvdWxkIGJlIG5vbi1lbXB0eScpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxsaW5nIGtleWJvYXJkLWludGVyYWN0aXZlIHByb21wdCByZWplY3RzIGNvbm5lY3Qgd2l0aCBjYW5jZWxsYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qga2JpU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgS2V5Ym9hcmRJbnRlcmFjdGl2ZUNvbm5lY3RUZXN0U2VydmljZShcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0e1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdHF1YWxpdHksXG5cdFx0XHRcdGRhdGFGb2xkZXJOYW1lLFxuXHRcdFx0fSBhcyBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG5ldyBEZWZlcnJlZFByb21pc2U8SVNTSEtleWJvYXJkSW50ZXJhY3RpdmVSZXF1ZXN0PigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChrYmlTZXJ2aWNlLm9uRGlkUmVxdWVzdEtleWJvYXJkSW50ZXJhY3RpdmUoa2JpUmVxdWVzdCA9PiByZXF1ZXN0LmNvbXBsZXRlKGtiaVJlcXVlc3QpKSk7XG5cblx0XHRjb25zdCBjb25uZWN0UHJvbWlzZSA9IGtiaVNlcnZpY2UuY29ubmVjdFNTSEZvclRlc3QobWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICd0ZXN0LWhvc3QnIH0pKTtcblx0XHRjb25zdCBrYmlSZXF1ZXN0ID0gYXdhaXQgcmVxdWVzdC5wO1xuXHRcdGF3YWl0IGtiaVNlcnZpY2UucmVzcG9uZEtleWJvYXJkSW50ZXJhY3RpdmUoa2JpUmVxdWVzdC5yZXF1ZXN0SWQsIHVuZGVmaW5lZCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhjb25uZWN0UHJvbWlzZSwgZXJyb3IgPT4gaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZW5kZWQ6IGtiaVNlcnZpY2UuY2xpZW50LmVuZGVkLFxuXHRcdFx0ZmluaXNoUmVzcG9uc2VzOiBrYmlTZXJ2aWNlLmNsaWVudC5maW5pc2hSZXNwb25zZXMsXG5cdFx0fSwge1xuXHRcdFx0ZW5kZWQ6IHRydWUsXG5cdFx0XHRmaW5pc2hSZXNwb25zZXM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNwb25kaW5nIHRvIGtleWJvYXJkLWludGVyYWN0aXZlIHByb21wdCBkb2VzIG5vdCBjYW5jZWwgY29ubmVjdGlvbiBhdHRlbXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBmaW5pc2hlZDogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNhbmNlbGxlZCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgcmVxdWVzdElkID0gc2VydmljZS5zdGFydEtleWJvYXJkSW50ZXJhY3RpdmVGb3JUZXN0KFtcblx0XHRcdHsgcHJvbXB0OiAnUGFzc3dvcmQ6ICcsIGVjaG86IGZhbHNlIH0sXG5cdFx0XSwgcmVzcG9uc2VzID0+IHsgZmluaXNoZWQgPSByZXNwb25zZXM7IH0sICgpID0+IHsgY2FuY2VsbGVkID0gdHJ1ZTsgfSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnJlc3BvbmRLZXlib2FyZEludGVyYWN0aXZlKHJlcXVlc3RJZCwgWydzZWNyZXQnXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgZmluaXNoZWQsIGNhbmNlbGxlZCB9LCB7XG5cdFx0XHRmaW5pc2hlZDogWydzZWNyZXQnXSxcblx0XHRcdGNhbmNlbGxlZDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBTU0ggY2xpZW50IGNsb3NlIHRyaWdnZXJzIGNvbm5lY3Rpb24gZGlzcG9zYWwgLS0tXG5cblx0dGVzdCgnU1NIIGNsaWVudCBjbG9zZSBldmVudCBkaXNwb3NlcyB0aGUgY29ubmVjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7XG5cdFx0XHRyZW1vdGVBZ2VudEhvc3RDb21tYW5kOiAnL2FnZW50Jyxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBjbG9zZUV2ZW50czogc3RyaW5nW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENsb3NlQ29ubmVjdGlvbihpZCA9PiBjbG9zZUV2ZW50cy5wdXNoKGlkKSkpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgdGhlIFNTSCBjbGllbnQgY2xvc2luZyAoZS5nLiBuZXR3b3JrIGRyb3ApXG5cdFx0c2VydmljZS5tb2NrQ2xpZW50c1swXS5maXJlQ2xvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2xvc2VFdmVudHMsIFtyZXN1bHQuY29ubmVjdGlvbklkXSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBDTEkgaW5zdGFsbCBmbG93IC0tLVxuXG5cdHRlc3QoJ3JlZnJlc2hlcyBhbiBpbnN0YWxsZWQgQ0xJIGluc3RlYWQgb2YgZG93bmxvYWRpbmcgaXQgZGlyZWN0bHknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gZGlzY292ZXJ5UmVzcG9uc2VzKFttYWtlRW5kcG9pbnQoeyB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogMTIzNCwgaW5zdGFuY2VJZDogJ2luc3QtMScgfSldKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ215aG9zdCcgfSkpO1xuXG5cdFx0Y29uc3QgZXhlY0NhbGxzID0gc2VydmljZS5tb2NrQ2xpZW50c1swXS5leGVjQ2FsbHM7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZWZyZXNoQXR0ZW1wdGVkOiBleGVjQ2FsbHMuc29tZShjID0+IGMuaW5jbHVkZXMoJ2NvZGUtaW5zaWRlcnMgdXBkYXRlJykpLFxuXHRcdFx0ZG93bmxvYWRBdHRlbXB0ZWQ6IGV4ZWNDYWxscy5zb21lKGMgPT4gYy5pbmNsdWRlcygnY3VybCcpIHx8IGMuaW5jbHVkZXMoJ3RhcicpKSxcblx0XHR9LCB7XG5cdFx0XHRyZWZyZXNoQXR0ZW1wdGVkOiB0cnVlLFxuXHRcdFx0ZG93bmxvYWRBdHRlbXB0ZWQ6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb3dubG9hZHMgQ0xJIHdoZW4gdmVyc2lvbiBjaGVjayBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHR7IHN0ZG91dDogJ0xpbnV4XFxuJywgY29kZTogMCB9LCAgICAgICAvLyB1bmFtZSAtc1xuXHRcdFx0eyBzdGRvdXQ6ICd4ODZfNjRcXG4nLCBjb2RlOiAwIH0sICAgICAgLy8gdW5hbWUgLW1cblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMTI3IH0sICAgICAgICAgICAgIC8vIENMSSAtLXZlcnNpb24gZmFpbHMgKG5vdCBmb3VuZClcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LCAgICAgICAgICAgICAgIC8vIGN1cmwgfCB0YXIgaW5zdGFsbFxuXHRcdFx0eyBzdGRvdXQ6IGFnZW50RW5kcG9pbnRzU3Rkb3V0KFttYWtlRW5kcG9pbnQoeyB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogMTIzNCwgaW5zdGFuY2VJZDogJ2luc3QtMScgfSldKSwgY29kZTogMCB9LCAvLyBhZ2VudCBlbmRwb2ludHNcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LCAgICAgICAgICAgICAgICAvLyBraWxsIC0wIChhbGl2ZSlcblx0XHRdO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoeyBzc2hDb25maWdIb3N0OiAnbXlob3N0JyB9KSk7XG5cblx0XHRjb25zdCBleGVjQ2FsbHMgPSBzZXJ2aWNlLm1vY2tDbGllbnRzWzBdLmV4ZWNDYWxscztcblx0XHRhc3NlcnQub2soZXhlY0NhbGxzLnNvbWUoYyA9PiBjLmluY2x1ZGVzKCdjdXJsJykpLFxuXHRcdFx0J3Nob3VsZCBkb3dubG9hZCBDTEkgd2hlbiBub3QgaW5zdGFsbGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhcm5zIGFuZCByZXVzZXMgdGhlIGluc3RhbGxlZCBDTEkgd2hlbiByZWZyZXNoIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgUmVjb3JkaW5nTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlOiBQaWNrPElQcm9kdWN0U2VydmljZSwgJ19zZXJ2aWNlQnJhbmQnIHwgJ3F1YWxpdHknIHwgJ2RhdGFGb2xkZXJOYW1lJz4gPSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRxdWFsaXR5LFxuXHRcdFx0ZGF0YUZvbGRlck5hbWUsXG5cdFx0fTtcblx0XHRjb25zdCBsb2dnaW5nU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdGFibGVTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZShcblx0XHRcdGxvZ1NlcnZpY2UsXG5cdFx0XHRwcm9kdWN0U2VydmljZSBhcyBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0bG9nZ2luZ1NlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdHsgc3Rkb3V0OiAnTGludXhcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHR7IHN0ZG91dDogJ3g4Nl82NFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdHsgc3Rkb3V0OiAnMS4wLjBcXG51cGRhdGUgZmFpbGVkXFxuX192c2NvZGVfY2xpX3VwZGF0ZV9leGl0X2NvZGVfXzoxXFxuJywgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6IGFnZW50RW5kcG9pbnRzU3Rkb3V0KFttYWtlRW5kcG9pbnQoeyB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogMTIzNCwgaW5zdGFuY2VJZDogJ2luc3QtMScgfSldKSwgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sXG5cdFx0XTtcblxuXHRcdGF3YWl0IGxvZ2dpbmdTZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICdteWhvc3QnIH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nU2VydmljZS53YXJuaW5ncywgW1xuXHRcdFx0J1tTU0hSZW1vdGVBZ2VudEhvc3RdIERlc2t0b3AgaGFzIG5vIHByb2R1Y3QgY29tbWl0OyBmYWxsaW5nIGJhY2sgdG8gbm9uLXBpbm5lZCBDTEkgaW5zdGFsbCBhdCB+Ly52c2NvZGUtc2VydmVyLW9zcy9jb2RlLWluc2lkZXJzLicsXG5cdFx0XHQnW1NTSFJlbW90ZUFnZW50SG9zdF0gQ291bGQgbm90IHJlZnJlc2ggdGhlIGRldi1idWlsZCByZW1vdGUgQ0xJIGF0IH4vLnZzY29kZS1zZXJ2ZXItb3NzL2NvZGUtaW5zaWRlcnM7IHJldXNpbmcgdGhlIGV4aXN0aW5nIGV4ZWN1dGFibGU6IHVwZGF0ZSBleGl0ZWQgMScsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvZ3MgY29ubmVjdGlvbiBmYWlsdXJlcyBpbiB0aGUgc2hhcmVkIHNlcnZpY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBSZWNvcmRpbmdMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2U6IFBpY2s8SVByb2R1Y3RTZXJ2aWNlLCAnX3NlcnZpY2VCcmFuZCcgfCAncXVhbGl0eScgfCAnZGF0YUZvbGRlck5hbWUnPiA9IHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdHF1YWxpdHksXG5cdFx0XHRkYXRhRm9sZGVyTmFtZSxcblx0XHR9O1xuXHRcdGNvbnN0IGxvZ2dpbmdTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0YWJsZVNTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlKFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdHByb2R1Y3RTZXJ2aWNlIGFzIElQcm9kdWN0U2VydmljZSxcblx0XHQpKTtcblx0XHRsb2dnaW5nU2VydmljZS5leGVjUmVzcG9uc2VzID0gW1xuXHRcdFx0eyBzdGRvdXQ6ICdMaW51eFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdHsgc3Rkb3V0OiAneDg2XzY0XFxuJywgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6ICcxLjAuMFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdHsgc3Rkb3V0OiAnbm90IGpzb24nLCBjb2RlOiAwIH0sXG5cdFx0XTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGxvZ2dpbmdTZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICdteWhvc3QnIH0pKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZ1NlcnZpY2UuZXJyb3JzLCBbXG5cdFx0XHRgW1NTSFJlbW90ZUFnZW50SG9zdF0gRmFpbGVkIHRvIGNvbm5lY3QgdG8gbXlob3N0ICdhZ2VudCBlbmRwb2ludHMnIHByb2R1Y2VkIHVucGFyc2FibGUgb3V0cHV0ICg4IGNoYXJhY3RlcnMpYCxcblx0XHRdKTtcblx0fSk7XG5cblx0Ly8gLS0tIENvbW1pdC1waW5uZWQgaW5zdGFsbCBmbG93IChyZWxlYXNlIGJ1aWxkcyB3aXRoIHByb2R1Y3RTZXJ2aWNlLmNvbW1pdCkgLS0tXG5cblx0c3VpdGUoJ2NvbW1pdC1waW5uZWQgaW5zdGFsbCcsICgpID0+IHtcblx0XHRjb25zdCBjb21taXQgPSAnYWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWYwMSc7XG5cdFx0Y29uc3QgY2xpQmluID0gYH4vLnZzY29kZS1pbnNpZGVycy9jb2RlLWluc2lkZXJzLSR7Y29tbWl0fWA7XG5cdFx0bGV0IHBpbm5lZFNlcnZpY2U6IFRlc3RhYmxlU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2U7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBwcm9kdWN0U2VydmljZTogUGljazxJUHJvZHVjdFNlcnZpY2UsICdfc2VydmljZUJyYW5kJyB8ICdxdWFsaXR5JyB8ICdkYXRhRm9sZGVyTmFtZScgfCAnc2VydmVyRGF0YUZvbGRlck5hbWUnIHwgJ2NvbW1pdCc+ID0ge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdHF1YWxpdHksXG5cdFx0XHRcdGRhdGFGb2xkZXJOYW1lLFxuXHRcdFx0XHRzZXJ2ZXJEYXRhRm9sZGVyTmFtZTogJy52c2NvZGUtaW5zaWRlcnMnLFxuXHRcdFx0XHRjb21taXQsXG5cdFx0XHR9O1xuXHRcdFx0cGlubmVkU2VydmljZSA9IG5ldyBUZXN0YWJsZVNTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlKFxuXHRcdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdFx0XHRwcm9kdWN0U2VydmljZSBhcyBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0XHQpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHBpbm5lZFNlcnZpY2UpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgb25lU3RhbmRhbG9uZUVuZHBvaW50cyA9ICgpID0+IGFnZW50RW5kcG9pbnRzU3Rkb3V0KFttYWtlRW5kcG9pbnQoeyB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogMTIzNCwgaW5zdGFuY2VJZDogJ2luc3QtMScgfSldKTtcblxuXHRcdHRlc3QoJ2Fsd2F5cyBpbnZva2VzIGNsZWFudXAgb2Ygb2xkIGNvbW1pdC1rZXllZCBDTElzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cGlubmVkU2VydmljZS5leGVjUmVzcG9uc2VzID0gW1xuXHRcdFx0XHR7IHN0ZG91dDogJ0xpbnV4XFxuJywgY29kZTogMCB9LFxuXHRcdFx0XHR7IHN0ZG91dDogJ3g4Nl82NFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sICAgICAgICAgICAgICAgLy8gdGVzdCAteCBjbGlCaW4gXHUyMTkyIHByZXNlbnRcblx0XHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sICAgICAgICAgICAgICAgLy8gdG91Y2ggY2xpQmluIChyZWZyZXNoIG10aW1lIG9uIHJldXNlKVxuXHRcdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSwgICAgICAgICAgICAgICAvLyBjbGVhbnVwIChydW5zIGFmdGVyIHJldXNlIGRlY2lzaW9uKVxuXHRcdFx0XHR7IHN0ZG91dDogb25lU3RhbmRhbG9uZUVuZHBvaW50cygpLCBjb2RlOiAwIH0sIC8vIGFnZW50IGVuZHBvaW50c1xuXHRcdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSwgICAgICAgICAgICAgICAvLyBraWxsIC0wIChhbGl2ZSlcblx0XHRcdF07XG5cdFx0XHRhd2FpdCBwaW5uZWRTZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICdteWhvc3QnIH0pKTtcblxuXHRcdFx0Y29uc3QgZXhlY0NhbGxzID0gcGlubmVkU2VydmljZS5tb2NrQ2xpZW50c1swXS5leGVjQ2FsbHM7XG5cdFx0XHQvLyBSZXRlbnRpb24gc25pcHBldDogYGxzIC0xdCAuLi4gfCBhd2sgJ05SPjUnIHwgeGFyZ3Mgcm1gXG5cdFx0XHRhc3NlcnQub2soZXhlY0NhbGxzLnNvbWUoYyA9PiAvbHMgLTF0IC4qY29kZS1pbnNpZGVycy0vLnRlc3QoYykgJiYgL2F3a1xccysnTlI+NScvLnRlc3QoYykpLFxuXHRcdFx0XHRgY2xlYW51cCBjb21tYW5kIHNob3VsZCBoYXZlIHJ1bjsgc2F3OiAke0pTT04uc3RyaW5naWZ5KGV4ZWNDYWxscyl9YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXVzZXMgZXhpc3RpbmcgY29tbWl0LWtleWVkIENMSSB3aXRob3V0IHJlLWRvd25sb2FkaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cGlubmVkU2VydmljZS5leGVjUmVzcG9uc2VzID0gW1xuXHRcdFx0XHR7IHN0ZG91dDogJ0xpbnV4XFxuJywgY29kZTogMCB9LFxuXHRcdFx0XHR7IHN0ZG91dDogJ3g4Nl82NFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sICAgICAgICAgICAgICAgLy8gdGVzdCAteCBjbGlCaW4gXHUyMTkyIDAgKHByZXNlbnQpXG5cdFx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LCAgICAgICAgICAgICAgIC8vIHRvdWNoIGNsaUJpblxuXHRcdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSwgICAgICAgICAgICAgICAvLyBjbGVhbnVwXG5cdFx0XHRcdHsgc3Rkb3V0OiBvbmVTdGFuZGFsb25lRW5kcG9pbnRzKCksIGNvZGU6IDAgfSwgLy8gYWdlbnQgZW5kcG9pbnRzXG5cdFx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LCAgICAgICAgICAgICAgIC8vIGtpbGwgLTAgKGFsaXZlKVxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgcGlubmVkU2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoeyBzc2hDb25maWdIb3N0OiAnbXlob3N0JyB9KSk7XG5cblx0XHRcdGNvbnN0IGV4ZWNDYWxscyA9IHBpbm5lZFNlcnZpY2UubW9ja0NsaWVudHNbMF0uZXhlY0NhbGxzO1xuXHRcdFx0YXNzZXJ0Lm9rKGV4ZWNDYWxscy5zb21lKGMgPT4gYy5pbmNsdWRlcyhgdGVzdCAteCAke2NsaUJpbn1gKSksXG5cdFx0XHRcdGBzaG91bGQgdGVzdCBmb3IgY29tbWl0LWtleWVkIENMSTsgc2F3OiAke0pTT04uc3RyaW5naWZ5KGV4ZWNDYWxscyl9YCk7XG5cdFx0XHRhc3NlcnQub2soIWV4ZWNDYWxscy5zb21lKGMgPT4gYy5pbmNsdWRlcygnY3VybCcpKSxcblx0XHRcdFx0YHNob3VsZCBub3QgZG93bmxvYWQgd2hlbiBjb21taXQta2V5ZWQgQ0xJIHByZXNlbnQ7IHNhdzogJHtKU09OLnN0cmluZ2lmeShleGVjQ2FsbHMpfWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG93bmxvYWRzIGZyb20gY29tbWl0LXBpbm5lZCBVUkwgd2hlbiBDTEkgaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcblx0XHRcdHBpbm5lZFNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdFx0eyBzdGRvdXQ6ICdMaW51eFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdFx0eyBzdGRvdXQ6ICd4ODZfNjRcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMSB9LCAgICAgICAgICAgICAgIC8vIHRlc3QgLXggXHUyMTkyIG1pc3Npbmdcblx0XHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sICAgICAgICAgICAgICAgLy8gbWtkaXIrbWt0ZW1wK2N1cmx8dGFyK212K2NobW9kK3JtXG5cdFx0XHRcdHsgc3Rkb3V0OiAnMS4wLjBcXG4nLCBjb2RlOiAwIH0sICAgICAgIC8vIDxjbGlCaW4+IC0tdmVyc2lvbiB2YWxpZGF0aW9uXG5cdFx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LCAgICAgICAgICAgICAgIC8vIGNsZWFudXAgKGFmdGVyIHN1Y2Nlc3NmdWwgaW5zdGFsbClcblx0XHRcdFx0eyBzdGRvdXQ6IG9uZVN0YW5kYWxvbmVFbmRwb2ludHMoKSwgY29kZTogMCB9LCAvLyBhZ2VudCBlbmRwb2ludHNcblx0XHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sICAgICAgICAgICAgICAgLy8ga2lsbCAtMCAoYWxpdmUpXG5cdFx0XHRdO1xuXG5cdFx0XHRhd2FpdCBwaW5uZWRTZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICdteWhvc3QnIH0pKTtcblxuXHRcdFx0Y29uc3QgZXhlY0NhbGxzID0gcGlubmVkU2VydmljZS5tb2NrQ2xpZW50c1swXS5leGVjQ2FsbHM7XG5cdFx0XHRjb25zdCBpbnN0YWxsQ2FsbCA9IGV4ZWNDYWxscy5maW5kKGMgPT4gYy5pbmNsdWRlcygnY3VybCcpKTtcblx0XHRcdGFzc2VydC5vayhpbnN0YWxsQ2FsbCwgYHNob3VsZCBoYXZlIHJ1biBjdXJsIGluc3RhbGw7IHNhdzogJHtKU09OLnN0cmluZ2lmeShleGVjQ2FsbHMpfWApO1xuXHRcdFx0YXNzZXJ0Lm9rKGluc3RhbGxDYWxsIS5pbmNsdWRlcyhgY29tbWl0OiR7Y29tbWl0fWApLFxuXHRcdFx0XHRgaW5zdGFsbCBVUkwgc2hvdWxkIGJlIGNvbW1pdC1waW5uZWQ7IGdvdDogJHtpbnN0YWxsQ2FsbH1gKTtcblx0XHRcdGFzc2VydC5vayhpbnN0YWxsQ2FsbCEuaW5jbHVkZXMoYG12IGApICYmIGluc3RhbGxDYWxsIS5pbmNsdWRlcyhjbGlCaW4pLFxuXHRcdFx0XHRgaW5zdGFsbCBzaG91bGQgYXRvbWljLW12IGludG8gY29tbWl0LWtleWVkIHBhdGg7IGdvdDogJHtpbnN0YWxsQ2FsbH1gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gYW55IHVzYWJsZSBDTEkgd2hlbiBjb21taXQtcGlubmVkIGRvd25sb2FkIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFsbGJhY2tCaW4gPSBgfi8udnNjb2RlLWluc2lkZXJzL2NvZGUtaW5zaWRlcnMtMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMGA7XG5cdFx0XHRwaW5uZWRTZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHRcdHsgc3Rkb3V0OiAnTGludXhcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHRcdHsgc3Rkb3V0OiAneDg2XzY0XFxuJywgY29kZTogMCB9LFxuXHRcdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDEgfSwgICAgICAgICAgICAgICAvLyB0ZXN0IC14IFx1MjE5MiBtaXNzaW5nXG5cdFx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogNyB9LCAgICAgICAgICAgICAgIC8vIGluc3RhbGwgZmFpbHMgKGN1cmwgZXhpdCA3KVxuXHRcdFx0XHR7IHN0ZG91dDogYCR7ZmFsbGJhY2tCaW59XFxuYCwgY29kZTogMCB9LCAvLyBmYWxsYmFjayBmaW5kZXIgbGlzdHMgb2xkIGNvbW1pdC1rZXllZFxuXHRcdFx0XHR7IHN0ZG91dDogJzEuMC4wXFxuJywgY29kZTogMCB9LCAgICAgICAvLyBmYWxsYmFjayAtLXZlcnNpb24gc3VjY2VlZHNcblx0XHRcdFx0eyBzdGRvdXQ6IG9uZVN0YW5kYWxvbmVFbmRwb2ludHMoKSwgY29kZTogMCB9LCAvLyBhZ2VudCBlbmRwb2ludHNcblx0XHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sICAgICAgICAgICAgICAgLy8ga2lsbCAtMCAoYWxpdmUpXG5cdFx0XHRdO1xuXG5cdFx0XHRhd2FpdCBwaW5uZWRTZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICdteWhvc3QnIH0pKTtcblxuXHRcdFx0Y29uc3QgZXhlY0NhbGxzID0gcGlubmVkU2VydmljZS5tb2NrQ2xpZW50c1swXS5leGVjQ2FsbHM7XG5cdFx0XHQvLyBGYWxsYmFjayBmaW5kZXIgc25pcHBldCBlbnVtZXJhdGVzIGNvbW1pdC1rZXllZCBjYW5kaWRhdGVzIGJ5IG10aW1lLlxuXHRcdFx0YXNzZXJ0Lm9rKGV4ZWNDYWxscy5zb21lKGMgPT4gL2xzIC0xdCAuKmNvZGUtaW5zaWRlcnMtLy50ZXN0KGMpICYmIGMuaW5jbHVkZXMoJy52c2NvZGUtY2xpLWluc2lkZXIvY29kZS1pbnNpZGVycycpKSxcblx0XHRcdFx0YHNob3VsZCBoYXZlIHJ1biBmYWxsYmFjayBmaW5kZXI7IHNhdzogJHtKU09OLnN0cmluZ2lmeShleGVjQ2FsbHMpfWApO1xuXHRcdFx0Ly8gU2hvdWxkIGhhdmUgLS12ZXJzaW9uLXZhbGlkYXRlZCB0aGUgZmFsbGJhY2sgY2FuZGlkYXRlLlxuXHRcdFx0YXNzZXJ0Lm9rKGV4ZWNDYWxscy5zb21lKGMgPT4gYy5pbmNsdWRlcyhgJHtmYWxsYmFja0Jpbn0gLS12ZXJzaW9uYCkpLFxuXHRcdFx0XHRgc2hvdWxkIC0tdmVyc2lvbi12YWxpZGF0ZSBmYWxsYmFjazsgc2F3OiAke0pTT04uc3RyaW5naWZ5KGV4ZWNDYWxscyl9YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm9wYWdhdGVzIGluc3RhbGwgZXJyb3Igd2hlbiBubyBmYWxsYmFjayBDTEkgZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cGlubmVkU2VydmljZS5leGVjUmVzcG9uc2VzID0gW1xuXHRcdFx0XHR7IHN0ZG91dDogJ0xpbnV4XFxuJywgY29kZTogMCB9LFxuXHRcdFx0XHR7IHN0ZG91dDogJ3g4Nl82NFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAxIH0sICAgICAgICAgICAgICAgLy8gdGVzdCAteCBcdTIxOTIgbWlzc2luZ1xuXHRcdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDcgfSwgICAgICAgICAgICAgICAvLyBpbnN0YWxsIGZhaWxzXG5cdFx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LCAgICAgICAgICAgICAgIC8vIGZhbGxiYWNrIGZpbmRlciByZXR1cm5zIG5vdGhpbmdcblx0XHRcdF07XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHBpbm5lZFNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ215aG9zdCcgfSkpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIENvbm5lY3Rpb24ga2V5IGZvcm1hdHMgLS0tXG5cblx0dGVzdCgndXNlcyBob3N0OnBvcnQgYXMgY29ubmVjdGlvbiBrZXkgd2l0aG91dCBzc2hDb25maWdIb3N0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHtcblx0XHRcdGhvc3Q6ICcxOTIuMTY4LjEuMScsXG5cdFx0XHRwb3J0OiAyMjIyLFxuXHRcdFx0cmVtb3RlQWdlbnRIb3N0Q29tbWFuZDogJy9hZ2VudCcsXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29ubmVjdGlvbklkLCAndGVzdHVzZXJAMTkyLjE2OC4xLjE6MjIyMicpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWZhdWx0cyB0byBwb3J0IDIyIGluIGNvbm5lY3Rpb24ga2V5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHtcblx0XHRcdGhvc3Q6ICcxOTIuMTY4LjEuMScsXG5cdFx0XHRyZW1vdGVBZ2VudEhvc3RDb21tYW5kOiAnL2FnZW50Jyxcblx0XHR9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb25uZWN0aW9uSWQsICd0ZXN0dXNlckAxOTIuMTY4LjEuMToyMicpO1xuXHR9KTtcblxuXHQvLyAtLS0gUmVjb25uZWN0IHByZXNlcnZlcyBjb25uZWN0aW9uIHRva2VuIGZyb20gaW5pdGlhbCBjb25uZWN0IC0tLVxuXG5cdHRlc3QoJ3JlY29ubmVjdCBwcmVzZXJ2ZXMgY29ubmVjdGlvbiB0b2tlbiBhbmQgYWRkcmVzcycsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBkaXNjb3ZlcnlSZXNwb25zZXMoW21ha2VFbmRwb2ludCh7IHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiAxMjM0LCBpbnN0YW5jZUlkOiAnaW5zdC0xJyB9KV0pO1xuXG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICdteWhvc3QnIH0pKTtcblxuXHRcdGNvbnN0IHJlY29ubmVjdGVkID0gYXdhaXQgc2VydmljZS5yZWNvbm5lY3QoJ215aG9zdCcsICduZXctbmFtZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNvbm5lY3RlZC5jb25uZWN0aW9uVG9rZW4sIG9yaWdpbmFsLmNvbm5lY3Rpb25Ub2tlbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlY29ubmVjdGVkLmFkZHJlc3MsIG9yaWdpbmFsLmFkZHJlc3MpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNvbm5lY3RlZC5jb25uZWN0aW9uSWQsIG9yaWdpbmFsLmNvbm5lY3Rpb25JZCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBSZWxheSBtZXNzYWdlcyBmcm9tIHN1cGVyc2VkZWQgcmVsYXkgYXJlIHN0aWxsIHJvdXRlZCAobm90IGdhdGVkKSAtLS1cblxuXHR0ZXN0KCdtZXNzYWdlcyBmcm9tIHN1cGVyc2VkZWQgcmVsYXkgc3RpbGwgYXJyaXZlIChvbmx5IGNsb3NlIGlzIHN1cHByZXNzZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IGRpc2NvdmVyeVJlc3BvbnNlcyhbbWFrZUVuZHBvaW50KHsgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDEyMzQsIGluc3RhbmNlSWQ6ICdpbnN0LTEnIH0pXSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICdteWhvc3QnIH0pKTtcblxuXHRcdGNvbnN0IG1lc3NhZ2VzOiBBcnJheTx7IGNvbm5lY3Rpb25JZDogc3RyaW5nOyBkYXRhOiBzdHJpbmcgfT4gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJlbGF5TWVzc2FnZShtc2cgPT4gbWVzc2FnZXMucHVzaChtc2cpKSk7XG5cblx0XHQvLyBSZWNvbm5lY3QgcmVwbGFjZXMgdGhlIHJlbGF5XG5cdFx0YXdhaXQgc2VydmljZS5yZWNvbm5lY3QoJ215aG9zdCcsICd0ZXN0LWhvc3QnKTtcblxuXHRcdC8vIFNpbXVsYXRlIGEgbWVzc2FnZSBhcnJpdmluZyBmcm9tIHRoZSBPTEQgcmVsYXkgKGluZGV4IDApXG5cdFx0c2VydmljZS5zaW11bGF0ZVJlbGF5TWVzc2FnZSgnc3RhbGUtbWVzc2FnZScsIDApO1xuXHRcdC8vIEFuZCBmcm9tIHRoZSBORVcgcmVsYXkgKGluZGV4IDEpXG5cdFx0c2VydmljZS5zaW11bGF0ZVJlbGF5TWVzc2FnZSgnZnJlc2gtbWVzc2FnZScsIDEpO1xuXG5cdFx0Ly8gQm90aCBtZXNzYWdlcyBhcnJpdmUgXHUyMDE0IG1lc3NhZ2Ugc3VwcHJlc3Npb24gaXMgZGVsaWJlcmF0ZWx5IE5PVCBkb25lXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXNzYWdlcywgW1xuXHRcdFx0eyBjb25uZWN0aW9uSWQ6IHJlc3VsdC5jb25uZWN0aW9uSWQsIGRhdGE6ICdzdGFsZS1tZXNzYWdlJyB9LFxuXHRcdFx0eyBjb25uZWN0aW9uSWQ6IHJlc3VsdC5jb25uZWN0aW9uSWQsIGRhdGE6ICdmcmVzaC1tZXNzYWdlJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHQvLyAtLS0gUmVjb25uZWN0IGZhaWx1cmUgY2xlYW5zIHVwIGRldGFjaGVkIFNTSCBjbGllbnQgLS0tXG5cblx0dGVzdCgncmVjb25uZWN0IGNsZWFucyB1cCBTU0ggY2xpZW50IHdoZW4gcmVsYXkgcmVjcmVhdGlvbiBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBkaXNjb3ZlcnlSZXNwb25zZXMoW21ha2VFbmRwb2ludCh7IHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiAxMjM0LCBpbnN0YW5jZUlkOiAnaW5zdC0xJyB9KV0pO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoeyBzc2hDb25maWdIb3N0OiAnbXlob3N0JyB9KSk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxDbGllbnQgPSBzZXJ2aWNlLm1vY2tDbGllbnRzWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcmlnaW5hbENsaWVudC5lbmRlZCwgZmFsc2UpO1xuXG5cdFx0Ly8gTWFrZSByZWxheSBjcmVhdGlvbiBmYWlsIG9uIHRoZSBuZXh0IGNhbGwgKHRoZSByZWNvbm5lY3QgYXR0ZW1wdClcblx0XHRzZXJ2aWNlLnJlbGF5SG9vayA9IChjYWxsKSA9PiB7XG5cdFx0XHRpZiAoY2FsbCA9PT0gMikge1xuXHRcdFx0XHRyZXR1cm4gbmV3IEVycm9yKCdyZWxheSBmYWlsZWQnKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGNsb3NlRXZlbnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2xvc2VDb25uZWN0aW9uKGlkID0+IGNsb3NlRXZlbnRzLnB1c2goaWQpKSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHNlcnZpY2UucmVjb25uZWN0KCdteWhvc3QnLCAndGVzdC1ob3N0JyksXG5cdFx0XHQvcmVsYXkgZmFpbGVkLyxcblx0XHQpO1xuXG5cdFx0Ly8gU1NIIGNsaWVudCBzaG91bGQgaGF2ZSBiZWVuIGNsZWFuZWQgdXAgZGVzcGl0ZSB0aGUgZmFpbHVyZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcmlnaW5hbENsaWVudC5lbmRlZCwgdHJ1ZSk7XG5cdFx0Ly8gQ2xvc2UgZXZlbnQgc2hvdWxkIGhhdmUgZmlyZWQgdG8gbm90aWZ5IHRoZSByZW5kZXJlclxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2xvc2VFdmVudHMsIFsnc3NoOm15aG9zdCddKTtcblx0fSk7XG5cblx0dGVzdCgncmVjb25uZWN0IHJlamVjdHMgd2l0aCB0aW1lb3V0IHdoZW4gcmVsYXkgY3JlYXRpb24gaGFuZ3MgKHNpbGVudGx5IGRlYWQgU1NIIGNsaWVudCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVwcm8gZm9yOiBhZnRlciBhIHNpbGVudCBuZXR3b3JrIGRyb3AsIHRoZSBTU0ggY2xpZW50J3MgVENQIGlzXG5cdFx0Ly8gaGFsZi1vcGVuIGJ1dCBzc2gyIGhhc24ndCBzZWVuICdjbG9zZScgeWV0LiBSZXVzaW5nIGl0IGZvciBhIGZyZXNoXG5cdFx0Ly8gcmVsYXkgY2FsbHMgZm9yd2FyZE91dCwgd2hvc2UgY2FsbGJhY2sgbmV2ZXIgZmlyZXMuIFdpdGhvdXQgYVxuXHRcdC8vIHRpbWVvdXQgdGhlIHdob2xlIGNvbm5lY3QoKSBjYWxsIGhhbmdzIGZvcmV2ZXIsIHNvIHRoZSByZW5kZXJlclxuXHRcdC8vIG5ldmVyIHNlZXMgYSByZWplY3Rpb24gYW5kIG5ldmVyIHJldHJpZXMgXHUyMDE0IGV2ZW4gYWZ0ZXIgYSB3aW5kb3dcblx0XHQvLyByZWxvYWQsIHNpbmNlIHRoZSBzaGFyZWQtcHJvY2VzcyBzdGF0ZSBzdXJ2aXZlcy5cblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBkaXNjb3ZlcnlSZXNwb25zZXMoW21ha2VFbmRwb2ludCh7IHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiAxMjM0LCBpbnN0YW5jZUlkOiAnaW5zdC0xJyB9KV0pO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoeyBzc2hDb25maWdIb3N0OiAnbXlob3N0JyB9KSk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxDbGllbnQgPSBzZXJ2aWNlLm1vY2tDbGllbnRzWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcmlnaW5hbENsaWVudC5lbmRlZCwgZmFsc2UpO1xuXG5cdFx0Ly8gVXNlIGEgc2hvcnQgdGltZW91dCBzbyB0aGUgdGVzdCBjb21wbGV0ZXMgcXVpY2tseS5cblx0XHRzZXJ2aWNlLnNldFJlbGF5Q3JlYXRpb25UaW1lb3V0Rm9yVGVzdCg1MCk7XG5cdFx0Ly8gTWFrZSB0aGUgKnJlY29ubmVjdCogY2FsbCdzIHJlbGF5IGNyZWF0aW9uIGhhbmcgKHRoZSBzZWNvbmQgcmVsYXkpLlxuXHRcdHNlcnZpY2UuaGFuZ1JlbGF5Q3JlYXRpb25PbkNhbGwgPSAyO1xuXG5cdFx0Y29uc3QgY2xvc2VFdmVudHM6IHN0cmluZ1tdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDbG9zZUNvbm5lY3Rpb24oaWQgPT4gY2xvc2VFdmVudHMucHVzaChpZCkpKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gc2VydmljZS5yZWNvbm5lY3QoJ215aG9zdCcsICd0ZXN0LWhvc3QnKSxcblx0XHRcdC90aW1lZCBvdXR8dGltZW91dC9pLFxuXHRcdFx0J3JlY29ubmVjdCBzaG91bGQgcmVqZWN0ICh3aXRoIGEgdGltZW91dCBlcnJvcikgaW5zdGVhZCBvZiBoYW5naW5nIHdoZW4gcmVsYXkgY3JlYXRpb24gbmV2ZXIgc2V0dGxlcydcblx0XHQpO1xuXG5cdFx0Ly8gU1NIIGNsaWVudCBzaG91bGQgaGF2ZSBiZWVuIGVuZGVkIHNvIHN1YnNlcXVlbnQgcmVjb25uZWN0IGF0dGVtcHRzXG5cdFx0Ly8gZG9uJ3Qga2VlcCByZXVzaW5nIHRoZSBkZWFkIGNsaWVudC4gQWZ0ZXIgdGhpcywgdGhlIGVudHJ5IGlzIGFsc29cblx0XHQvLyByZW1vdmVkIGZyb20gYF9jb25uZWN0aW9uc2Agc28gYSBmcmVzaCByZWNvbm5lY3QgcGF0aCBydW5zLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcmlnaW5hbENsaWVudC5lbmRlZCwgdHJ1ZSwgJ2RlYWQgU1NIIGNsaWVudCBzaG91bGQgYmUgZW5kZWQnKTtcblx0XHQvLyBDbG9zZSBldmVudCBzaG91bGQgaGF2ZSBmaXJlZCBzbyB0aGUgcmVuZGVyZXIncyBjb250cmlidXRpb24gc2Vlc1xuXHRcdC8vIHRoZSByZWNvbm5lY3QgYXR0ZW1wdCByZXNvbHZlZCAoZXZlbiBhcyBhIGZhaWx1cmUpIGFuZCBjYW4gcmV0cnkuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbG9zZUV2ZW50cywgWydzc2g6bXlob3N0J10pO1xuXHR9KTtcblxuXHQvLyAtLS0gUmVjb25uZWN0IGNsZWFucyB1cCBvbGQgU1NIIGNsaWVudCBsaXN0ZW5lcnMgLS0tXG5cblx0dGVzdCgncmVjb25uZWN0IHJlbW92ZXMgb2xkIGNsb3NlL2Vycm9yIGxpc3RlbmVycyBmcm9tIHNoYXJlZCBTU0ggY2xpZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IGRpc2NvdmVyeVJlc3BvbnNlcyhbbWFrZUVuZHBvaW50KHsgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDEyMzQsIGluc3RhbmNlSWQ6ICdpbnN0LTEnIH0pXSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICdteWhvc3QnIH0pKTtcblx0XHRjb25zdCBjbGllbnQgPSBzZXJ2aWNlLm1vY2tDbGllbnRzWzBdO1xuXG5cdFx0Ly8gQWZ0ZXIgaW5pdGlhbCBjb25uZWN0LCB0aGUgU1NIIGNsaWVudCBoYXMgY2xvc2UvZXJyb3IgbGlzdGVuZXJzIGZyb20gU1NIQ29ubmVjdGlvblxuXHRcdGNvbnN0IGNsb3NlTGlzdGVuZXJzQmVmb3JlID0gY2xpZW50LmNsb3NlTGlzdGVuZXJDb3VudDtcblx0XHRjb25zdCBlcnJvckxpc3RlbmVyc0JlZm9yZSA9IGNsaWVudC5lcnJvckxpc3RlbmVyQ291bnQ7XG5cdFx0YXNzZXJ0Lm9rKGNsb3NlTGlzdGVuZXJzQmVmb3JlID4gMCwgJ3Nob3VsZCBoYXZlIGNsb3NlIGxpc3RlbmVycyBhZnRlciBjb25uZWN0Jyk7XG5cdFx0YXNzZXJ0Lm9rKGVycm9yTGlzdGVuZXJzQmVmb3JlID4gMCwgJ3Nob3VsZCBoYXZlIGVycm9yIGxpc3RlbmVycyBhZnRlciBjb25uZWN0Jyk7XG5cblx0XHQvLyBSZWNvbm5lY3QgcmVwbGFjZXMgdGhlIFNTSENvbm5lY3Rpb24gXHUyMDE0IG9sZCBsaXN0ZW5lcnMgc2hvdWxkIGJlIHJlbW92ZWRcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29ubmVjdCgnbXlob3N0JywgJ3Rlc3QtaG9zdCcpO1xuXG5cdFx0Ly8gTGlzdGVuZXIgY291bnQgc2hvdWxkIG5vdCBncm93IFx1MjAxNCBvbGQgb25lcyByZW1vdmVkLCBuZXcgb25lcyBhZGRlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGllbnQuY2xvc2VMaXN0ZW5lckNvdW50LCBjbG9zZUxpc3RlbmVyc0JlZm9yZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsaWVudC5lcnJvckxpc3RlbmVyQ291bnQsIGVycm9yTGlzdGVuZXJzQmVmb3JlKTtcblx0fSk7XG59KTtcblxuXG4vKipcbiAqIFN1YmNsYXNzIHRoYXQgZXhwb3NlcyBgX2J1aWxkQXV0aEF0dGVtcHRzYCBhbmQgc3R1YnMgb3V0IHRoZSBkaXNrL2VudiBzZWFtc1xuICogc28gdGhlIGF1dGgtYXR0ZW1wdCBidWlsZGluZyBsb2dpYyBjYW4gYmUgdGVzdGVkIGluIGlzb2xhdGlvbi5cbiAqL1xuY2xhc3MgQXV0aEF0dGVtcHRzVGVzdFNlcnZpY2UgZXh0ZW5kcyBTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSB7XG5cblx0YWdlbnRTb2NrOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGtleUZpbGVzOiBNYXA8c3RyaW5nLCBCdWZmZXI+ID0gbmV3IE1hcCgpO1xuXG5cdGFzeW5jIHRlc3RCdWlsZEF1dGhBdHRlbXB0cyhjb25maWc6IElTU0hBZ2VudEhvc3RDb25maWcpOiBQcm9taXNlPFNTSEF1dGhBdHRlbXB0W10+IHtcblx0XHRyZXR1cm4gdGhpcy5fYnVpbGRBdXRoQXR0ZW1wdHMoY29uZmlnKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfaXNBZ2VudEF2YWlsYWJsZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmFnZW50U29jaztcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfcmVhZEtleUZpbGVJZkV4aXN0cyhrZXlQYXRoOiBzdHJpbmcpOiBQcm9taXNlPEJ1ZmZlciB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLmtleUZpbGVzLmdldChrZXlQYXRoKTtcblx0fVxufVxuXG5zdWl0ZSgnU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UgLSBfYnVpbGRBdXRoQXR0ZW1wdHMnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBzZXJ2aWNlOiBBdXRoQXR0ZW1wdHNUZXN0U2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlOiBQaWNrPElQcm9kdWN0U2VydmljZSwgJ19zZXJ2aWNlQnJhbmQnIHwgJ3F1YWxpdHknIHwgJ2RhdGFGb2xkZXJOYW1lJz4gPSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRxdWFsaXR5LFxuXHRcdFx0ZGF0YUZvbGRlck5hbWUsXG5cdFx0fTtcblx0XHRzZXJ2aWNlID0gbmV3IEF1dGhBdHRlbXB0c1Rlc3RTZXJ2aWNlKFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdHByb2R1Y3RTZXJ2aWNlIGFzIElQcm9kdWN0U2VydmljZSxcblx0XHQpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgUlNBID0gQnVmZmVyLmZyb20oJ3JzYS1rZXktYnl0ZXMnKTtcblx0Y29uc3QgRUQgPSBCdWZmZXIuZnJvbSgnZWQyNTUxOS1rZXktYnl0ZXMnKTtcblx0Y29uc3QgRVhQTElDSVQgPSBCdWZmZXIuZnJvbSgnZXhwbGljaXQta2V5LWJ5dGVzJyk7XG5cblx0ZnVuY3Rpb24gc3NoU3RyaW5nKHZhbHVlOiBzdHJpbmcpOiBCdWZmZXIge1xuXHRcdGNvbnN0IHZhbHVlQnVmZmVyID0gQnVmZmVyLmZyb20odmFsdWUsICd1dGY4Jyk7XG5cdFx0Y29uc3QgbGVuZ3RoQnVmZmVyID0gQnVmZmVyLmFsbG9jKDQpO1xuXHRcdGxlbmd0aEJ1ZmZlci53cml0ZVVJbnQzMkJFKHZhbHVlQnVmZmVyLmxlbmd0aCwgMCk7XG5cdFx0cmV0dXJuIEJ1ZmZlci5jb25jYXQoW2xlbmd0aEJ1ZmZlciwgdmFsdWVCdWZmZXJdKTtcblx0fVxuXG5cdGZ1bmN0aW9uIG9wZW5TU0hQcml2YXRlS2V5V2l0aENpcGhlcihjaXBoZXI6IHN0cmluZyk6IEJ1ZmZlciB7XG5cdFx0Y29uc3QgZGF0YSA9IEJ1ZmZlci5jb25jYXQoW1xuXHRcdFx0QnVmZmVyLmZyb20oJ29wZW5zc2gta2V5LXYxXFwwJywgJ3V0ZjgnKSxcblx0XHRcdHNzaFN0cmluZyhjaXBoZXIpLFxuXHRcdF0pO1xuXHRcdHJldHVybiBCdWZmZXIuZnJvbShbXG5cdFx0XHQnLS0tLS1CRUdJTiBPUEVOU1NIIFBSSVZBVEUgS0VZLS0tLS0nLFxuXHRcdFx0ZGF0YS50b1N0cmluZygnYmFzZTY0JyksXG5cdFx0XHQnLS0tLS1FTkQgT1BFTlNTSCBQUklWQVRFIEtFWS0tLS0tJyxcblx0XHRdLmpvaW4oJ1xcbicpKTtcblx0fVxuXG5cdHRlc3QoJ0FnZW50ICsgbm8gU1NIX0FVVEhfU09DSyArIG9ubHkgaWRfcnNhIGV4aXN0cyBcdTIxOTIgcHVibGlja2V5IGlkX3JzYSwgdGhlbiBrZXlib2FyZC1pbnRlcmFjdGl2ZScsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmFnZW50U29jayA9IHVuZGVmaW5lZDtcblx0XHRzZXJ2aWNlLmtleUZpbGVzLnNldCgnfi8uc3NoL2lkX3JzYScsIFJTQSk7XG5cblx0XHRjb25zdCBhdHRlbXB0cyA9IGF3YWl0IHNlcnZpY2UudGVzdEJ1aWxkQXV0aEF0dGVtcHRzKG1ha2VDb25maWcoeyBhdXRoTWV0aG9kOiBTU0hBdXRoTWV0aG9kLkFnZW50IH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXR0ZW1wdHMsIFtcblx0XHRcdHsgdHlwZTogJ3B1YmxpY2tleScsIHVzZXJuYW1lOiAndGVzdHVzZXInLCBrZXk6IFJTQSwga2V5UGF0aDogJ34vLnNzaC9pZF9yc2EnIH0sXG5cdFx0XHR7IHR5cGU6ICdrZXlib2FyZC1pbnRlcmFjdGl2ZScsIHVzZXJuYW1lOiAndGVzdHVzZXInIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0FnZW50ICsgU1NIX0FVVEhfU09DSyArIG9ubHkgaWRfcnNhIGV4aXN0cyBcdTIxOTIgYWdlbnQgdGhlbiBwdWJsaWNrZXkgaWRfcnNhLCB0aGVuIGtleWJvYXJkLWludGVyYWN0aXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoaXMgaXMgdGhlIHJlZ3Jlc3Npb24tZHJpdmluZyBjYXNlOiBhZ2VudCBpcyBzZXQgYnV0IGRvZXNuJ3QgaGF2ZVxuXHRcdC8vIHRoZSBrZXksIHNvIHdlIG11c3Qgc3RpbGwgZmFsbCB0aHJvdWdoIHRvIHRoZSBvbi1kaXNrIGRlZmF1bHQga2V5LlxuXHRcdHNlcnZpY2UuYWdlbnRTb2NrID0gJy90bXAvc3NoLWFnZW50LnNvY2snO1xuXHRcdHNlcnZpY2Uua2V5RmlsZXMuc2V0KCd+Ly5zc2gvaWRfcnNhJywgUlNBKTtcblxuXHRcdGNvbnN0IGF0dGVtcHRzID0gYXdhaXQgc2VydmljZS50ZXN0QnVpbGRBdXRoQXR0ZW1wdHMobWFrZUNvbmZpZyh7IGF1dGhNZXRob2Q6IFNTSEF1dGhNZXRob2QuQWdlbnQgfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdHRlbXB0cywgW1xuXHRcdFx0eyB0eXBlOiAnYWdlbnQnLCB1c2VybmFtZTogJ3Rlc3R1c2VyJywgYWdlbnQ6ICcvdG1wL3NzaC1hZ2VudC5zb2NrJyB9LFxuXHRcdFx0eyB0eXBlOiAncHVibGlja2V5JywgdXNlcm5hbWU6ICd0ZXN0dXNlcicsIGtleTogUlNBLCBrZXlQYXRoOiAnfi8uc3NoL2lkX3JzYScgfSxcblx0XHRcdHsgdHlwZTogJ2tleWJvYXJkLWludGVyYWN0aXZlJywgdXNlcm5hbWU6ICd0ZXN0dXNlcicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnQWdlbnQgKyBTU0hfQVVUSF9TT0NLICsgaWRfZWQyNTUxOSBhbmQgaWRfcnNhIGV4aXN0IFx1MjE5MiBhZ2VudCB0aGVuIGJvdGgga2V5cyBpbiBkZWZhdWx0IG9yZGVyLCB0aGVuIGtleWJvYXJkLWludGVyYWN0aXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuYWdlbnRTb2NrID0gJy90bXAvc3NoLWFnZW50LnNvY2snO1xuXHRcdHNlcnZpY2Uua2V5RmlsZXMuc2V0KCd+Ly5zc2gvaWRfZWQyNTUxOScsIEVEKTtcblx0XHRzZXJ2aWNlLmtleUZpbGVzLnNldCgnfi8uc3NoL2lkX3JzYScsIFJTQSk7XG5cblx0XHRjb25zdCBhdHRlbXB0cyA9IGF3YWl0IHNlcnZpY2UudGVzdEJ1aWxkQXV0aEF0dGVtcHRzKG1ha2VDb25maWcoeyBhdXRoTWV0aG9kOiBTU0hBdXRoTWV0aG9kLkFnZW50IH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXR0ZW1wdHMsIFtcblx0XHRcdHsgdHlwZTogJ2FnZW50JywgdXNlcm5hbWU6ICd0ZXN0dXNlcicsIGFnZW50OiAnL3RtcC9zc2gtYWdlbnQuc29jaycgfSxcblx0XHRcdHsgdHlwZTogJ3B1YmxpY2tleScsIHVzZXJuYW1lOiAndGVzdHVzZXInLCBrZXk6IEVELCBrZXlQYXRoOiAnfi8uc3NoL2lkX2VkMjU1MTknIH0sXG5cdFx0XHR7IHR5cGU6ICdwdWJsaWNrZXknLCB1c2VybmFtZTogJ3Rlc3R1c2VyJywga2V5OiBSU0EsIGtleVBhdGg6ICd+Ly5zc2gvaWRfcnNhJyB9LFxuXHRcdFx0eyB0eXBlOiAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnLCB1c2VybmFtZTogJ3Rlc3R1c2VyJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBZ2VudCArIFNTSF9BVVRIX1NPQ0sgKyBubyBkZWZhdWx0IGtleXMgXHUyMTkyIGFnZW50IHRoZW4ga2V5Ym9hcmQtaW50ZXJhY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2VydmljZS5hZ2VudFNvY2sgPSAnL3RtcC9zc2gtYWdlbnQuc29jayc7XG5cblx0XHRjb25zdCBhdHRlbXB0cyA9IGF3YWl0IHNlcnZpY2UudGVzdEJ1aWxkQXV0aEF0dGVtcHRzKG1ha2VDb25maWcoeyBhdXRoTWV0aG9kOiBTU0hBdXRoTWV0aG9kLkFnZW50IH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXR0ZW1wdHMsIFtcblx0XHRcdHsgdHlwZTogJ2FnZW50JywgdXNlcm5hbWU6ICd0ZXN0dXNlcicsIGFnZW50OiAnL3RtcC9zc2gtYWdlbnQuc29jaycgfSxcblx0XHRcdHsgdHlwZTogJ2tleWJvYXJkLWludGVyYWN0aXZlJywgdXNlcm5hbWU6ICd0ZXN0dXNlcicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnQWdlbnQgKyBJZGVudGl0eUFnZW50IHVzZXMgY29uZmlndXJlZCBhZ2VudCBlbmRwb2ludCBiZWZvcmUgZGVmYXVsdCBrZXlzJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuYWdlbnRTb2NrID0gJy90bXAvc3NoLWFnZW50LnNvY2snO1xuXHRcdHNlcnZpY2Uua2V5RmlsZXMuc2V0KCd+Ly5zc2gvaWRfcnNhJywgUlNBKTtcblxuXHRcdGNvbnN0IGF0dGVtcHRzID0gYXdhaXQgc2VydmljZS50ZXN0QnVpbGRBdXRoQXR0ZW1wdHMobWFrZUNvbmZpZyh7XG5cdFx0XHRhdXRoTWV0aG9kOiBTU0hBdXRoTWV0aG9kLkFnZW50LFxuXHRcdFx0aWRlbnRpdHlBZ2VudDogJy8vLi9waXBlL3BhZ2VhbnQudXNlci4xMjM0Jyxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF0dGVtcHRzLCBbXG5cdFx0XHR7IHR5cGU6ICdhZ2VudCcsIHVzZXJuYW1lOiAndGVzdHVzZXInLCBhZ2VudDogJy8vLi9waXBlL3BhZ2VhbnQudXNlci4xMjM0JyB9LFxuXHRcdFx0eyB0eXBlOiAncHVibGlja2V5JywgdXNlcm5hbWU6ICd0ZXN0dXNlcicsIGtleTogUlNBLCBrZXlQYXRoOiAnfi8uc3NoL2lkX3JzYScgfSxcblx0XHRcdHsgdHlwZTogJ2tleWJvYXJkLWludGVyYWN0aXZlJywgdXNlcm5hbWU6ICd0ZXN0dXNlcicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnQWdlbnQgKyBJZGVudGl0eUFnZW50IFNTSF9BVVRIX1NPQ0sgdXNlcyB0aGUgZGVmYXVsdCBhZ2VudCBlbmRwb2ludCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmFnZW50U29jayA9ICcvdG1wL3NzaC1hZ2VudC5zb2NrJztcblxuXHRcdGNvbnN0IGF0dGVtcHRzID0gYXdhaXQgc2VydmljZS50ZXN0QnVpbGRBdXRoQXR0ZW1wdHMobWFrZUNvbmZpZyh7XG5cdFx0XHRhdXRoTWV0aG9kOiBTU0hBdXRoTWV0aG9kLkFnZW50LFxuXHRcdFx0aWRlbnRpdHlBZ2VudDogJ1NTSF9BVVRIX1NPQ0snLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXR0ZW1wdHMsIFtcblx0XHRcdHsgdHlwZTogJ2FnZW50JywgdXNlcm5hbWU6ICd0ZXN0dXNlcicsIGFnZW50OiAnL3RtcC9zc2gtYWdlbnQuc29jaycgfSxcblx0XHRcdHsgdHlwZTogJ2tleWJvYXJkLWludGVyYWN0aXZlJywgdXNlcm5hbWU6ICd0ZXN0dXNlcicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnQWdlbnQgKyBJZGVudGl0eUFnZW50IG5vbmUgZGlzYWJsZXMgdGhlIGRlZmF1bHQgU1NIX0FVVEhfU09DSyBmYWxsYmFjaycsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmFnZW50U29jayA9ICcvdG1wL3NzaC1hZ2VudC5zb2NrJztcblxuXHRcdGNvbnN0IGF0dGVtcHRzID0gYXdhaXQgc2VydmljZS50ZXN0QnVpbGRBdXRoQXR0ZW1wdHMobWFrZUNvbmZpZyh7XG5cdFx0XHRhdXRoTWV0aG9kOiBTU0hBdXRoTWV0aG9kLkFnZW50LFxuXHRcdFx0aWRlbnRpdHlBZ2VudDogJ25vbmUnLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXR0ZW1wdHMsIFtcblx0XHRcdHsgdHlwZTogJ2tleWJvYXJkLWludGVyYWN0aXZlJywgdXNlcm5hbWU6ICd0ZXN0dXNlcicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnQWdlbnQgKyBleHBsaWNpdCBwcml2YXRlS2V5UGF0aCArIFNTSF9BVVRIX1NPQ0sgKyBpZF9yc2EgXHUyMTkyIGFnZW50IGZpcnN0LCB0aGVuIGV4cGxpY2l0LCBpZF9yc2EsIGtleWJvYXJkLWludGVyYWN0aXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuYWdlbnRTb2NrID0gJy90bXAvc3NoLWFnZW50LnNvY2snO1xuXHRcdHNlcnZpY2Uua2V5RmlsZXMuc2V0KCcvc29tZS9leHBsaWNpdC9rZXknLCBFWFBMSUNJVCk7XG5cdFx0c2VydmljZS5rZXlGaWxlcy5zZXQoJ34vLnNzaC9pZF9yc2EnLCBSU0EpO1xuXG5cdFx0Y29uc3QgYXR0ZW1wdHMgPSBhd2FpdCBzZXJ2aWNlLnRlc3RCdWlsZEF1dGhBdHRlbXB0cyhtYWtlQ29uZmlnKHtcblx0XHRcdGF1dGhNZXRob2Q6IFNTSEF1dGhNZXRob2QuQWdlbnQsXG5cdFx0XHRwcml2YXRlS2V5UGF0aDogJy9zb21lL2V4cGxpY2l0L2tleScsXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdHRlbXB0cywgW1xuXHRcdFx0eyB0eXBlOiAnYWdlbnQnLCB1c2VybmFtZTogJ3Rlc3R1c2VyJywgYWdlbnQ6ICcvdG1wL3NzaC1hZ2VudC5zb2NrJyB9LFxuXHRcdFx0eyB0eXBlOiAncHVibGlja2V5JywgdXNlcm5hbWU6ICd0ZXN0dXNlcicsIGtleTogRVhQTElDSVQsIGtleVBhdGg6ICcvc29tZS9leHBsaWNpdC9rZXknIH0sXG5cdFx0XHR7IHR5cGU6ICdwdWJsaWNrZXknLCB1c2VybmFtZTogJ3Rlc3R1c2VyJywga2V5OiBSU0EsIGtleVBhdGg6ICd+Ly5zc2gvaWRfcnNhJyB9LFxuXHRcdFx0eyB0eXBlOiAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnLCB1c2VybmFtZTogJ3Rlc3R1c2VyJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBZ2VudCArIGV4cGxpY2l0IHByaXZhdGVLZXlQYXRoIHRoYXQgbWF0Y2hlcyBhIGRlZmF1bHQgXHUyMTkyIGV4cGxpY2l0IGFkZGVkIG9uY2UsIHRoZW4ga2V5Ym9hcmQtaW50ZXJhY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gV2hlbiB0aGUgdXNlciBwaW5zIH4vLnNzaC9pZF9yc2EgZXhwbGljaXRseSwgd2Ugc2hvdWxkbid0IGVuZCB1cFxuXHRcdC8vIHdpdGggdGhlIHNhbWUga2V5IHR3aWNlIGluIHRoZSBxdWV1ZS5cblx0XHRzZXJ2aWNlLmFnZW50U29jayA9IHVuZGVmaW5lZDtcblx0XHRzZXJ2aWNlLmtleUZpbGVzLnNldCgnfi8uc3NoL2lkX3JzYScsIFJTQSk7XG5cblx0XHRjb25zdCBhdHRlbXB0cyA9IGF3YWl0IHNlcnZpY2UudGVzdEJ1aWxkQXV0aEF0dGVtcHRzKG1ha2VDb25maWcoe1xuXHRcdFx0YXV0aE1ldGhvZDogU1NIQXV0aE1ldGhvZC5BZ2VudCxcblx0XHRcdHByaXZhdGVLZXlQYXRoOiAnfi8uc3NoL2lkX3JzYScsXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdHRlbXB0cywgW1xuXHRcdFx0eyB0eXBlOiAncHVibGlja2V5JywgdXNlcm5hbWU6ICd0ZXN0dXNlcicsIGtleTogUlNBLCBrZXlQYXRoOiAnfi8uc3NoL2lkX3JzYScgfSxcblx0XHRcdHsgdHlwZTogJ2tleWJvYXJkLWludGVyYWN0aXZlJywgdXNlcm5hbWU6ICd0ZXN0dXNlcicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnQWdlbnQgKyBleHBsaWNpdCBwcml2YXRlS2V5UGF0aCBhcyBhYnNvbHV0ZSBkZWZhdWx0IHBhdGggXHUyMTkyIGFnZW50IGZpcnN0LCBrZXkgYWRkZWQgb25jZScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBSZWdyZXNzaW9uOiBgc3NoIC1HYCBhbHdheXMgcmV0dXJucyBhYnNvbHV0ZSBpZGVudGl0eS1maWxlIHBhdGhzLCBzb1xuXHRcdC8vIC9Vc2Vycy88bWU+Ly5zc2gvaWRfZWQyNTUxOSBtdXN0IGJlIHJlY29nbml6ZWQgYXMgYSBkZWZhdWx0IGFuZCBub3Rcblx0XHQvLyBwcm9tb3RlZCB0byBhbiBleHBsaWNpdCAoZW5jcnlwdGVkKSBhdHRlbXB0IHRoYXQgd291bGQgZmlyZSBhXG5cdFx0Ly8gcGFzc3BocmFzZSBwcm9tcHQgYmVmb3JlIHRoZSBhZ2VudCBldmVyIGdldHMgYSBjaGFuY2UuXG5cdFx0c2VydmljZS5hZ2VudFNvY2sgPSAnL3RtcC9zc2gtYWdlbnQuc29jayc7XG5cdFx0c2VydmljZS5rZXlGaWxlcy5zZXQoJ34vLnNzaC9pZF9lZDI1NTE5JywgRUQpO1xuXHRcdGNvbnN0IGFic29sdXRlRGVmYXVsdCA9IGAke29zLmhvbWVkaXIoKX0vLnNzaC9pZF9lZDI1NTE5YDtcblxuXHRcdGNvbnN0IGF0dGVtcHRzID0gYXdhaXQgc2VydmljZS50ZXN0QnVpbGRBdXRoQXR0ZW1wdHMobWFrZUNvbmZpZyh7XG5cdFx0XHRhdXRoTWV0aG9kOiBTU0hBdXRoTWV0aG9kLkFnZW50LFxuXHRcdFx0cHJpdmF0ZUtleVBhdGg6IGFic29sdXRlRGVmYXVsdCxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF0dGVtcHRzLCBbXG5cdFx0XHR7IHR5cGU6ICdhZ2VudCcsIHVzZXJuYW1lOiAndGVzdHVzZXInLCBhZ2VudDogJy90bXAvc3NoLWFnZW50LnNvY2snIH0sXG5cdFx0XHR7IHR5cGU6ICdwdWJsaWNrZXknLCB1c2VybmFtZTogJ3Rlc3R1c2VyJywga2V5OiBFRCwga2V5UGF0aDogJ34vLnNzaC9pZF9lZDI1NTE5JyB9LFxuXHRcdFx0eyB0eXBlOiAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnLCB1c2VybmFtZTogJ3Rlc3R1c2VyJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdLZXlGaWxlICsgZXhwbGljaXQgcGF0aCBcdTIxOTIgcHVibGlja2V5IG9ubHknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2VydmljZS5hZ2VudFNvY2sgPSAnL3RtcC9zc2gtYWdlbnQuc29jayc7XG5cdFx0c2VydmljZS5rZXlGaWxlcy5zZXQoJy9zb21lL2V4cGxpY2l0L2tleScsIEVYUExJQ0lUKTtcblx0XHRzZXJ2aWNlLmtleUZpbGVzLnNldCgnfi8uc3NoL2lkX3JzYScsIFJTQSk7XG5cblx0XHRjb25zdCBhdHRlbXB0cyA9IGF3YWl0IHNlcnZpY2UudGVzdEJ1aWxkQXV0aEF0dGVtcHRzKG1ha2VDb25maWcoe1xuXHRcdFx0YXV0aE1ldGhvZDogU1NIQXV0aE1ldGhvZC5LZXlGaWxlLFxuXHRcdFx0cHJpdmF0ZUtleVBhdGg6ICcvc29tZS9leHBsaWNpdC9rZXknLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXR0ZW1wdHMsIFtcblx0XHRcdHsgdHlwZTogJ3B1YmxpY2tleScsIHVzZXJuYW1lOiAndGVzdHVzZXInLCBrZXk6IEVYUExJQ0lULCBrZXlQYXRoOiAnL3NvbWUvZXhwbGljaXQva2V5JyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdLZXlGaWxlICsgZW5jcnlwdGVkIE9wZW5TU0gga2V5IG1hcmtzIGF0dGVtcHQgYXMgZW5jcnlwdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVuY3J5cHRlZEtleSA9IG9wZW5TU0hQcml2YXRlS2V5V2l0aENpcGhlcignYWVzMjU2LWN0cicpO1xuXHRcdHNlcnZpY2Uua2V5RmlsZXMuc2V0KCcvc29tZS9lbmNyeXB0ZWQva2V5JywgZW5jcnlwdGVkS2V5KTtcblxuXHRcdGNvbnN0IGF0dGVtcHRzID0gYXdhaXQgc2VydmljZS50ZXN0QnVpbGRBdXRoQXR0ZW1wdHMobWFrZUNvbmZpZyh7XG5cdFx0XHRhdXRoTWV0aG9kOiBTU0hBdXRoTWV0aG9kLktleUZpbGUsXG5cdFx0XHRwcml2YXRlS2V5UGF0aDogJy9zb21lL2VuY3J5cHRlZC9rZXknLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXR0ZW1wdHMsIFtcblx0XHRcdHsgdHlwZTogJ3B1YmxpY2tleScsIHVzZXJuYW1lOiAndGVzdHVzZXInLCBrZXk6IGVuY3J5cHRlZEtleSwga2V5UGF0aDogJy9zb21lL2VuY3J5cHRlZC9rZXknLCBlbmNyeXB0ZWQ6IHRydWUgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnS2V5RmlsZSArIG1pc3NpbmcgcHJpdmF0ZUtleVBhdGggdGhyb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gc2VydmljZS50ZXN0QnVpbGRBdXRoQXR0ZW1wdHMobWFrZUNvbmZpZyh7IGF1dGhNZXRob2Q6IFNTSEF1dGhNZXRob2QuS2V5RmlsZSB9KSksXG5cdFx0XHQvcHJpdmF0ZSBrZXkgcGF0aC9pLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0tleUZpbGUgKyB1bnJlYWRhYmxlIGtleSB0aHJvd3Mgd2l0aCB0aGUgcGF0aCBpbiB0aGUgbWVzc2FnZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHNlcnZpY2UudGVzdEJ1aWxkQXV0aEF0dGVtcHRzKG1ha2VDb25maWcoe1xuXHRcdFx0XHRhdXRoTWV0aG9kOiBTU0hBdXRoTWV0aG9kLktleUZpbGUsXG5cdFx0XHRcdHByaXZhdGVLZXlQYXRoOiAnL21pc3Npbmcva2V5Jyxcblx0XHRcdH0pKSxcblx0XHRcdC9cXC9taXNzaW5nXFwva2V5Lyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdQYXNzd29yZCBcdTIxOTIgcGFzc3dvcmQgb25seScsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmFnZW50U29jayA9ICcvdG1wL3NzaC1hZ2VudC5zb2NrJztcblx0XHRzZXJ2aWNlLmtleUZpbGVzLnNldCgnfi8uc3NoL2lkX3JzYScsIFJTQSk7XG5cblx0XHRjb25zdCBhdHRlbXB0cyA9IGF3YWl0IHNlcnZpY2UudGVzdEJ1aWxkQXV0aEF0dGVtcHRzKG1ha2VDb25maWcoe1xuXHRcdFx0YXV0aE1ldGhvZDogU1NIQXV0aE1ldGhvZC5QYXNzd29yZCxcblx0XHRcdHBhc3N3b3JkOiAncHcnLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXR0ZW1wdHMsIFtcblx0XHRcdHsgdHlwZTogJ3Bhc3N3b3JkJywgdXNlcm5hbWU6ICd0ZXN0dXNlcicsIHBhc3N3b3JkOiAncHcnIH0sXG5cdFx0XSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSAtIG1ha2VBdXRoSGFuZGxlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBLRVkgPSBCdWZmZXIuZnJvbSgnaycpO1xuXHRjb25zdCBhdHRlbXB0czogU1NIQXV0aEF0dGVtcHRbXSA9IFtcblx0XHR7IHR5cGU6ICdhZ2VudCcsIHVzZXJuYW1lOiAndScsIGFnZW50OiAnL3NvY2snIH0sXG5cdFx0eyB0eXBlOiAncHVibGlja2V5JywgdXNlcm5hbWU6ICd1Jywga2V5OiBLRVksIGtleVBhdGg6ICd+Ly5zc2gvaWRfcnNhJyB9LFxuXHRdO1xuXG5cdHRlc3QoJ3dhbGtzIGF0dGVtcHRzIGluIG9yZGVyLCB0aGVuIHNpZ25hbHMgZXhoYXVzdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBoYW5kbGVyID0gbWFrZUF1dGhIYW5kbGVyKGF0dGVtcHRzLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY2FsbHM6IEFycmF5PG9iamVjdCB8IGZhbHNlPiA9IFtdO1xuXHRcdGhhbmRsZXIobnVsbCwgZmFsc2UsIG5leHQgPT4gY2FsbHMucHVzaChuZXh0KSk7XG5cdFx0aGFuZGxlcihbJ3B1YmxpY2tleSddLCBmYWxzZSwgbmV4dCA9PiBjYWxscy5wdXNoKG5leHQpKTtcblx0XHRoYW5kbGVyKFsncHVibGlja2V5J10sIGZhbHNlLCBuZXh0ID0+IGNhbGxzLnB1c2gobmV4dCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW1xuXHRcdFx0eyB0eXBlOiAnYWdlbnQnLCB1c2VybmFtZTogJ3UnLCBhZ2VudDogJy9zb2NrJyB9LFxuXHRcdFx0eyB0eXBlOiAncHVibGlja2V5JywgdXNlcm5hbWU6ICd1Jywga2V5OiBLRVkgfSwgLy8ga2V5UGF0aCBzdHJpcHBlZFxuXHRcdFx0ZmFsc2UsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIGF0dGVtcHRzIHdob3NlIG1ldGhvZCB0aGUgc2VydmVyIGhhcyByZWplY3RlZCcsICgpID0+IHtcblx0XHRjb25zdCBoYW5kbGVyID0gbWFrZUF1dGhIYW5kbGVyKGF0dGVtcHRzLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY2FsbHM6IEFycmF5PG9iamVjdCB8IGZhbHNlPiA9IFtdO1xuXHRcdC8vIFNlcnZlciBvbmx5IGFsbG93cyBwYXNzd29yZCBcdTIwMTQgYm90aCBhdHRlbXB0cyBzaG91bGQgYmUgc2tpcHBlZCBhbmRcblx0XHQvLyB0aGUgaGFuZGxlciBzaG91bGQgc2lnbmFsIGV4aGF1c3Rpb24gaW1tZWRpYXRlbHkuXG5cdFx0aGFuZGxlcihbJ3Bhc3N3b3JkJ10sIGZhbHNlLCBuZXh0ID0+IGNhbGxzLnB1c2gobmV4dCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW2ZhbHNlXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FnZW50IGF0dGVtcHRzIGFyZSBrZXB0IHdoZW4gc2VydmVyIGFsbG93cyBwdWJsaWNrZXknLCAoKSA9PiB7XG5cdFx0Ly8gYGFnZW50YCBpcyBhIHB1YmxpY2tleS1mbGF2b3JlZCBtZXRob2Q7IHNlcnZlcnMgYWR2ZXJ0aXNlIGBwdWJsaWNrZXlgLFxuXHRcdC8vIG5vdCBgYWdlbnRgLCBzbyB0aGUgYWdlbnQgYXR0ZW1wdCBtdXN0IG5vdCBiZSBmaWx0ZXJlZCBvdXQgaGVyZS5cblx0XHRjb25zdCBoYW5kbGVyID0gbWFrZUF1dGhIYW5kbGVyKFxuXHRcdFx0W3sgdHlwZTogJ2FnZW50JywgdXNlcm5hbWU6ICd1JywgYWdlbnQ6ICcvc29jaycgfV0sXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpO1xuXHRcdGNvbnN0IGNhbGxzOiBBcnJheTxvYmplY3QgfCBmYWxzZT4gPSBbXTtcblx0XHRoYW5kbGVyKFsncHVibGlja2V5J10sIGZhbHNlLCBuZXh0ID0+IGNhbGxzLnB1c2gobmV4dCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW3sgdHlwZTogJ2FnZW50JywgdXNlcm5hbWU6ICd1JywgYWdlbnQ6ICcvc29jaycgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZXlib2FyZC1pbnRlcmFjdGl2ZSByb3V0ZXMgcHJvbXB0cyB0byB0aGUga2JpIGhhbmRsZXIgYW5kIGlzIHNraXBwZWQgd2l0aG91dCBvbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qga2JpQXR0ZW1wdHM6IFNTSEF1dGhBdHRlbXB0W10gPSBbXG5cdFx0XHR7IHR5cGU6ICdrZXlib2FyZC1pbnRlcmFjdGl2ZScsIHVzZXJuYW1lOiAndScgfSxcblx0XHRcdHsgdHlwZTogJ3B1YmxpY2tleScsIHVzZXJuYW1lOiAndScsIGtleTogS0VZLCBrZXlQYXRoOiAnfi8uc3NoL2lkX3JzYScgfSxcblx0XHRdO1xuXG5cdFx0Ly8gV2l0aG91dCBhIGtiaSBoYW5kbGVyIHRoZSBrYmkgYXR0ZW1wdCBpcyBza2lwcGVkIGVudGlyZWx5LlxuXHRcdGNvbnN0IGhhbmRsZXJOb0tiaSA9IG1ha2VBdXRoSGFuZGxlcihrYmlBdHRlbXB0cywgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGNhbGxzTm9LYmk6IEFycmF5PG9iamVjdCB8IGZhbHNlPiA9IFtdO1xuXHRcdGhhbmRsZXJOb0tiaShudWxsLCBmYWxzZSwgbmV4dCA9PiBjYWxsc05vS2JpLnB1c2gobmV4dCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHNOb0tiaSwgW3sgdHlwZTogJ3B1YmxpY2tleScsIHVzZXJuYW1lOiAndScsIGtleTogS0VZIH1dKTtcblxuXHRcdC8vIFdpdGggYSBrYmkgaGFuZGxlciB3ZSBnZXQgYW4gYXV0aCBtZXRob2Qgd2hvc2UgYHByb21wdGAgY2FsbGJhY2tcblx0XHQvLyBmb3J3YXJkcyBpbnRvIHRoZSBoYW5kbGVyLlxuXHRcdGxldCBwcm9tcHRBcmdzOiB7IG5hbWU6IHN0cmluZzsgaW5zdHJ1Y3Rpb25zOiBzdHJpbmc7IHByb21wdHM6IFJlYWRvbmx5QXJyYXk8eyBwcm9tcHQ6IHN0cmluZzsgZWNobzogYm9vbGVhbiB9PiB9IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGhhbmRsZXJXaXRoS2JpID0gbWFrZUF1dGhIYW5kbGVyKGtiaUF0dGVtcHRzLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgKG5hbWUsIGluc3RydWN0aW9ucywgcHJvbXB0cywgZmluaXNoKSA9PiB7XG5cdFx0XHRwcm9tcHRBcmdzID0geyBuYW1lLCBpbnN0cnVjdGlvbnMsIHByb21wdHMgfTtcblx0XHRcdGZpbmlzaChbJ3NlY3JldCddKTtcblx0XHR9KTtcblx0XHRjb25zdCBjYWxsc1dpdGhLYmk6IEFycmF5PHsgdHlwZTogc3RyaW5nOyB1c2VybmFtZTogc3RyaW5nOyBwcm9tcHQ/OiBGdW5jdGlvbiB9IHwgZmFsc2U+ID0gW107XG5cdFx0aGFuZGxlcldpdGhLYmkobnVsbCwgZmFsc2UsIG5leHQgPT4gY2FsbHNXaXRoS2JpLnB1c2gobmV4dCBhcyB7IHR5cGU6IHN0cmluZzsgdXNlcm5hbWU6IHN0cmluZzsgcHJvbXB0PzogRnVuY3Rpb24gfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsc1dpdGhLYmkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGNhbGxzV2l0aEtiaVswXSBhcyB7IHR5cGU6IHN0cmluZyB9KS50eXBlLCAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnKTtcblx0XHRjb25zdCBmaW5pc2hDYWxsczogUmVhZG9ubHlBcnJheTxzdHJpbmc+W10gPSBbXTtcblx0XHQoY2FsbHNXaXRoS2JpWzBdIGFzIHsgcHJvbXB0OiBGdW5jdGlvbiB9KS5wcm9tcHQoJ24nLCAnaScsICdsYW5nJywgW3sgcHJvbXB0OiAnUGFzc3dvcmQ6JywgZWNobzogZmFsc2UgfV0sIChyZXNwb25zZXM6IFJlYWRvbmx5QXJyYXk8c3RyaW5nPikgPT4gZmluaXNoQ2FsbHMucHVzaChyZXNwb25zZXMpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb21wdEFyZ3MsIHsgbmFtZTogJ24nLCBpbnN0cnVjdGlvbnM6ICdpJywgcHJvbXB0czogW3sgcHJvbXB0OiAnUGFzc3dvcmQ6JywgZWNobzogZmFsc2UgfV0gfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaW5pc2hDYWxscywgW1snc2VjcmV0J11dKTtcblx0fSk7XG5cblx0dGVzdCgnZW5jcnlwdGVkIHB1YmxpY2tleSByZXF1ZXN0cyBwYXNzcGhyYXNlIGFuZCBwYXNzZXMgaXQgdG8gc3NoMicsICgpID0+IHtcblx0XHRjb25zdCBlbmNyeXB0ZWRBdHRlbXB0czogU1NIQXV0aEF0dGVtcHRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3B1YmxpY2tleScsIHVzZXJuYW1lOiAndScsIGtleTogS0VZLCBrZXlQYXRoOiAnfi8uc3NoL2lkX3JzYScsIGVuY3J5cHRlZDogdHJ1ZSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCBjYWxsczogQXJyYXk8b2JqZWN0IHwgZmFsc2U+ID0gW107XG5cdFx0Y29uc3QgaGFuZGxlciA9IG1ha2VBdXRoSGFuZGxlcihlbmNyeXB0ZWRBdHRlbXB0cywgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHVuZGVmaW5lZCwgKGtleVBhdGgsIGZpbmlzaCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGtleVBhdGgsICd+Ly5zc2gvaWRfcnNhJyk7XG5cdFx0XHRmaW5pc2goJ3Bhc3NwaHJhc2UnKTtcblx0XHR9KTtcblxuXHRcdGhhbmRsZXIobnVsbCwgZmFsc2UsIG5leHQgPT4gY2FsbHMucHVzaChuZXh0KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXG5cdFx0XHR7IHR5cGU6ICdwdWJsaWNrZXknLCB1c2VybmFtZTogJ3UnLCBrZXk6IEtFWSwgcGFzc3BocmFzZTogJ3Bhc3NwaHJhc2UnIH0sXG5cdFx0XSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsYUFBYTtBQUN0QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLG1EQUFtSDtBQUM1SCxTQUFTLHFCQUFpTjtBQUMxTixTQUFTLCtCQUErQix1QkFBNEM7QUFHcEYsTUFBTSxpQkFBaUI7QUFDdkIsTUFBTSxVQUFVO0FBRWhCLE1BQU0sNEJBQTRCLGVBQWU7QUFBQSxFQUFqRDtBQUFBO0FBQ0MsU0FBUyxTQUFtQixDQUFDO0FBQzdCLFNBQVMsV0FBcUIsQ0FBQztBQUFBO0FBQUEsRUFFdEIsTUFBTSxZQUE0QixNQUF1QjtBQUNqRSxTQUFLLE9BQU8sS0FBSyxDQUFDLFNBQVMsR0FBRyxJQUFJLEVBQUUsSUFBSSxXQUFTLGlCQUFpQixRQUFRLE1BQU0sVUFBVSxPQUFPLEtB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
