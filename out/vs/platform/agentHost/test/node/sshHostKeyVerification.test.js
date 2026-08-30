import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { NullLogService } from "../../../log/common/log.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { isSSHHostKeyDeniedError, SSHAuthMethod } from "../../common/sshRemoteAgentHost.js";
import { SSHRemoteAgentHostMainService } from "../../node/sshRemoteAgentHostService.js";
import { computeHostKeyFingerprint, parseKnownHosts } from "../../node/sshKnownHosts.js";
function makeKeyBlob(keyType, material) {
  const type = Buffer.from(keyType, "ascii");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(type.length, 0);
  const body = Buffer.alloc(4);
  body.writeUInt32BE(material.length, 0);
  return Buffer.concat([header, type, body, material]);
}
const HOST_KEY = makeKeyBlob("ssh-ed25519", Buffer.alloc(32, 170));
class HostKeyMockSSHClient {
  constructor() {
    this.ended = false;
    this.verdictCount = 0;
    /**
     * When set, the connection is not driven to ready/error by the verdict, so
     * a test can control what happens while verification is still pending.
     */
    this.deferVerification = false;
    this._errorListeners = [];
    this._readyListeners = [];
    this._hostKeysListeners = [];
    this.verifierEntered = new Promise((resolve) => {
      this._verifierEntered = resolve;
    });
  }
  on(event, listener) {
    if (event === "error") {
      this._errorListeners.push(listener);
    } else if (event === "ready") {
      this._readyListeners.push(listener);
    } else if (event === "hostkeys") {
      this._hostKeysListeners.push(listener);
    }
    return this;
  }
  removeListener(_event, _listener) {
    return this;
  }
  connect(config) {
    this.readyTimeout = config.readyTimeout;
    this.authHandler = config.authHandler;
    const hostVerifier = config.hostVerifier;
    assert.ok(hostVerifier, "hostVerifier must be installed \u2014 without it ssh2 accepts any host key");
    this._verifierEntered();
    hostVerifier(HOST_KEY, (permitted) => {
      this.verdictCount++;
      this.verdict = permitted;
      if (this.deferVerification) {
        return;
      }
      if (permitted) {
        this._readyListeners.forEach((l) => l());
      } else {
        this.fireError(new Error("Host denied (verification failed)"));
      }
    });
  }
  announceHostKeys(keys) {
    this._hostKeysListeners.forEach((l) => l(keys));
  }
  fireError(err) {
    this._errorListeners.forEach((l) => l(err));
  }
  end() {
    this.ended = true;
  }
}
class HostKeyTestService extends SSHRemoteAgentHostMainService {
  constructor() {
    super(...arguments);
    this.client = new HostKeyMockSSHClient();
    this.knownHostsContents = "";
    /** Auth attempts to offer; set to exercise the interactive prompt paths. */
    this.authAttempts = [];
    /** Every deadline armed during the connect, in order. */
    this.deadlineHistory = [];
  }
  async _createSSHClient() {
    return this.client;
  }
  async _buildAuthAttempts(_config) {
    return this.authAttempts;
  }
  async _readKnownHostsEntries(_host) {
    if (this.knownHostsGate) {
      await this.knownHostsGate;
    }
    if (this.knownHostsError) {
      throw this.knownHostsError;
    }
    return { entries: parseKnownHosts(this.knownHostsContents), strictHostKeyChecking: void 0 };
  }
  /** Expose the pending-request map so tests can assert nothing is leaked. */
  get pendingHostKeyRequestCount() {
    return this["_pendingHostKeyRequests"].size;
  }
  _armHandshakeDeadline(ms, onExpired) {
    this.deadlineHistory.push(ms);
    this.currentDeadlineMs = ms;
    return super._armHandshakeDeadline(ms, onExpired);
  }
  _clearHandshakeDeadline(timer) {
    this.currentDeadlineMs = void 0;
    super._clearHandshakeDeadline(timer);
  }
  connectSSHForTest(config) {
    return this._connectSSH(config, "ssh:test-host");
  }
}
function makeConfig(overrides) {
  return {
    host: "test.example.com",
    username: "testuser",
    authMethod: SSHAuthMethod.Agent,
    name: "Test Host",
    sshConfigHost: "test-host",
    ...overrides
  };
}
suite("SSHRemoteAgentHostMainService - host key verification", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createService() {
    const productService = {
      _serviceBrand: void 0,
      quality: "stable",
      dataFolderName: ".vscode-oss"
    };
    return disposables.add(new HostKeyTestService(new NullLogService(), productService));
  }
  async function connectAnswering(service, trusted, config = makeConfig()) {
    const requests = [];
    const store = new DisposableStore();
    store.add(service.onDidRequestHostKeyVerification((request) => {
      requests.push(request);
      void service.respondHostKeyVerification(request.requestId, trusted);
    }));
    try {
      let error;
      const result = await service.connectSSHForTest(config).then(() => "resolved", (err) => {
        error = err;
        return `rejected: ${err.message}`;
      });
      return { requests, result, error };
    } finally {
      store.dispose();
    }
  }
  test("installs hostVerifier and reports the key to the renderer", async () => {
    const service = createService();
    const { requests, result } = await connectAnswering(service, true);
    assert.deepStrictEqual(
      {
        requestCount: requests.length,
        keyType: requests[0]?.keyType,
        fingerprint: requests[0]?.fingerprint,
        host: requests[0]?.host,
        port: requests[0]?.port,
        knownHostsMatch: requests[0]?.knownHostsMatch,
        userInitiated: requests[0]?.userInitiated,
        verdict: service.client.verdict,
        result
      },
      {
        requestCount: 1,
        keyType: "ssh-ed25519",
        fingerprint: computeHostKeyFingerprint(HOST_KEY),
        host: "test.example.com",
        port: 22,
        knownHostsMatch: "unknown",
        userInitiated: true,
        verdict: true,
        result: "resolved"
      }
    );
  });
  test("declining fails the connection with a clean host key error", async () => {
    const service = createService();
    const { result, error } = await connectAnswering(service, false);
    assert.deepStrictEqual(
      {
        verdict: service.client.verdict,
        result,
        denied: isSSHHostKeyDeniedError(error)
      },
      {
        verdict: false,
        result: "rejected: Host key verification failed for test-host",
        denied: true
      }
    );
  });
  test("reports the known_hosts verdict for a matching entry", async () => {
    const service = createService();
    service.knownHostsContents = `test.example.com ssh-ed25519 ${HOST_KEY.toString("base64")}`;
    const { requests } = await connectAnswering(service, true);
    assert.strictEqual(requests[0]?.knownHostsMatch, "match");
  });
  test("reports a mismatch when known_hosts holds a different key", async () => {
    const service = createService();
    const other = makeKeyBlob("ssh-ed25519", Buffer.alloc(32, 187));
    service.knownHostsContents = `test.example.com ssh-ed25519 ${other.toString("base64")}`;
    const { requests } = await connectAnswering(service, false);
    assert.strictEqual(requests[0]?.knownHostsMatch, "mismatch");
  });
  test("forwards userInitiated so background reconnects can be declined", async () => {
    const service = createService();
    const { requests } = await connectAnswering(service, false, makeConfig({ userInitiated: false }));
    assert.strictEqual(requests[0]?.userInitiated, false);
  });
  test("bounds the handshake, and only widens it while a prompt is outstanding", async () => {
    const service = createService();
    const observed = [];
    const store = new DisposableStore();
    store.add(service.onDidRequestHostKeyVerification((request) => {
      observed.push(service.currentDeadlineMs);
      void service.respondHostKeyVerification(request.requestId, true);
    }));
    await service.connectSSHForTest(makeConfig());
    store.dispose();
    assert.deepStrictEqual(
      {
        ssh2TimerDisabled: service.client.readyTimeout,
        armedBeforeConnect: service.deadlineHistory[0],
        whilePrompting: observed[0],
        // Cleared once the connect settles — no timer left running.
        afterSettle: service.currentDeadlineMs
      },
      { ssh2TimerDisabled: 0, armedBeforeConnect: 3e4, whilePrompting: 3e5, afterSettle: void 0 }
    );
  });
  test("widens the deadline for the password prompt too, not just the host key dialog", async () => {
    const service = createService();
    service.authAttempts = [{ type: "keyboard-interactive", username: "test" }];
    service.client.deferVerification = true;
    const store = new DisposableStore();
    store.add(service.onDidRequestHostKeyVerification((request) => {
      void service.respondHostKeyVerification(request.requestId, true);
    }));
    let whilePrompting;
    const prompted = new Promise((resolve) => {
      store.add(service.onDidRequestKeyboardInteractive((request) => {
        whilePrompting = service.currentDeadlineMs;
        void service.respondKeyboardInteractive(request.requestId, ["hunter2"]);
        resolve();
      }));
    });
    const connectPromise = service.connectSSHForTest(makeConfig());
    await service.client.verifierEntered;
    service.client.authHandler?.(["keyboard-interactive"], false, (next) => {
      const method = next;
      method.prompt("", "", "", [{ prompt: "Password:", echo: false }], () => {
      });
    });
    await prompted;
    const afterAnswering = service.currentDeadlineMs;
    service.client.fireError(new Error("Connection lost"));
    await connectPromise.catch(() => void 0);
    store.dispose();
    assert.deepStrictEqual(
      { whilePrompting, afterAnswering },
      { whilePrompting: 3e5, afterAnswering: 3e4 }
    );
  });
  test("a connection that dies during evidence gathering leaves nothing pending", async () => {
    const service = createService();
    let openGate = () => {
    };
    service.knownHostsGate = new Promise((resolve) => {
      openGate = resolve;
    });
    const requests = [];
    const store = new DisposableStore();
    store.add(service.onDidRequestHostKeyVerification((request) => requests.push(request)));
    const connectPromise = service.connectSSHForTest(makeConfig());
    await service.client.verifierEntered;
    service.client.fireError(new Error("Connection lost"));
    const result = await connectPromise.then(() => "resolved", (err) => `rejected: ${err.message}`);
    openGate();
    await new Promise((resolve) => setTimeout(resolve, 10));
    store.dispose();
    assert.deepStrictEqual(
      {
        result,
        // No orphaned prompt, and no leaked map entry.
        requestCount: requests.length,
        pending: service.pendingHostKeyRequestCount,
        verdict: service.client.verdict
      },
      { result: "rejected: Connection lost", requestCount: 0, pending: 0, verdict: false }
    );
  });
  test("fails closed when gathering evidence throws", async () => {
    const service = createService();
    service.knownHostsError = new Error("boom");
    const requests = [];
    const store = new DisposableStore();
    store.add(service.onDidRequestHostKeyVerification((request) => requests.push(request)));
    const result = await service.connectSSHForTest(makeConfig()).then(() => "resolved", (err) => `rejected: ${err.message}`);
    store.dispose();
    assert.deepStrictEqual(
      { requestCount: requests.length, verdict: service.client.verdict, result },
      { requestCount: 0, verdict: false, result: "rejected: Host denied (verification failed)" }
    );
  });
  test("cancelling an in-flight verification denies rather than hanging", async () => {
    const service = createService();
    service.client.deferVerification = true;
    const cancelled = [];
    const requests = [];
    const store = new DisposableStore();
    store.add(service.onDidCancelHostKeyVerification((requestId) => cancelled.push(requestId)));
    store.add(service.onDidRequestHostKeyVerification((request) => {
      requests.push(request);
      service.client.fireError(new Error("Connection lost"));
    }));
    const result = await service.connectSSHForTest(makeConfig()).then(() => "resolved", (err) => `rejected: ${err.message}`);
    store.dispose();
    assert.deepStrictEqual(
      {
        result,
        cancelled: cancelled.length === 1 && cancelled[0] === requests[0]?.requestId,
        verdict: service.client.verdict,
        verdictCount: service.client.verdictCount
      },
      { result: "rejected: Connection lost", cancelled: true, verdict: false, verdictCount: 1 }
    );
  });
  test("surfaces proven announced host keys", async () => {
    const service = createService();
    const announcements = [];
    const store = new DisposableStore();
    store.add(service.onDidAnnounceHostKeys((a) => announcements.push({ host: a.host, keys: a.keys })));
    await connectAnswering(service, true);
    const rotated = makeKeyBlob("ssh-ed25519", Buffer.alloc(32, 204));
    service.client.announceHostKeys([
      { getPublicSSH: () => rotated, type: "ssh-ed25519" },
      // A certificate: ssh2 misparses these (it returns the cert's nonce
      // as the key material), so the blob's embedded type disagrees with
      // the declared type and it must be skipped rather than trusted.
      { getPublicSSH: () => makeKeyBlob("ssh-ed25519", Buffer.alloc(32, 221)), type: "ssh-ed25519-cert-v01@openssh.com" }
    ]);
    store.dispose();
    assert.deepStrictEqual(announcements, [{
      host: "test.example.com",
      keys: [{ keyType: "ssh-ed25519", fingerprint: computeHostKeyFingerprint(rotated) }]
    }]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzc2hIb3N0S2V5VmVyaWZpY2F0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgdHlwZSB7IENvbm5lY3RDb25maWcgfSBmcm9tICdzc2gyJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgaXNTU0hIb3N0S2V5RGVuaWVkRXJyb3IsIFNTSEF1dGhNZXRob2QsIHR5cGUgSVNTSEFnZW50SG9zdENvbmZpZywgdHlwZSBJU1NISG9zdEtleVZlcmlmaWNhdGlvblJlcXVlc3QgfSBmcm9tICcuLi8uLi9jb21tb24vc3NoUmVtb3RlQWdlbnRIb3N0LmpzJztcbmltcG9ydCB7IFNTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlLCB0eXBlIFNTSEF1dGhBdHRlbXB0IH0gZnJvbSAnLi4vLi4vbm9kZS9zc2hSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNvbXB1dGVIb3N0S2V5RmluZ2VycHJpbnQsIHBhcnNlS25vd25Ib3N0cywgdHlwZSBJS25vd25Ib3N0c0VudHJ5IH0gZnJvbSAnLi4vLi4vbm9kZS9zc2hLbm93bkhvc3RzLmpzJztcblxuLyoqIEJ1aWxkIGEgc3ludGFjdGljYWxseSB2YWxpZCBTU0ggd2lyZS1mb3JtYXQgcHVibGljIGtleSBibG9iLiAqL1xuZnVuY3Rpb24gbWFrZUtleUJsb2Ioa2V5VHlwZTogc3RyaW5nLCBtYXRlcmlhbDogQnVmZmVyKTogQnVmZmVyIHtcblx0Y29uc3QgdHlwZSA9IEJ1ZmZlci5mcm9tKGtleVR5cGUsICdhc2NpaScpO1xuXHRjb25zdCBoZWFkZXIgPSBCdWZmZXIuYWxsb2MoNCk7XG5cdGhlYWRlci53cml0ZVVJbnQzMkJFKHR5cGUubGVuZ3RoLCAwKTtcblx0Y29uc3QgYm9keSA9IEJ1ZmZlci5hbGxvYyg0KTtcblx0Ym9keS53cml0ZVVJbnQzMkJFKG1hdGVyaWFsLmxlbmd0aCwgMCk7XG5cdHJldHVybiBCdWZmZXIuY29uY2F0KFtoZWFkZXIsIHR5cGUsIGJvZHksIG1hdGVyaWFsXSk7XG59XG5cbmNvbnN0IEhPU1RfS0VZID0gbWFrZUtleUJsb2IoJ3NzaC1lZDI1NTE5JywgQnVmZmVyLmFsbG9jKDMyLCAweGFhKSk7XG5cbi8qKlxuICogTW9jayBjbGllbnQgdGhhdCBkcml2ZXMgb25seSB0aGUgaG9zdCBrZXkgdmVyaWZpY2F0aW9uIHBhdGg6IG9uIGBjb25uZWN0YCBpdFxuICogaW52b2tlcyBgaG9zdFZlcmlmaWVyYCBhbmQgcmVjb3JkcyB0aGUgdmVyZGljdCwgd2l0aG91dCBhdHRlbXB0aW5nIGF1dGguXG4gKi9cbmNsYXNzIEhvc3RLZXlNb2NrU1NIQ2xpZW50IHtcblx0ZW5kZWQgPSBmYWxzZTtcblx0LyoqIFRoZSB2ZXJkaWN0IGBob3N0VmVyaWZpZXJgIHByb2R1Y2VkLCBvbmNlIGl0IHNldHRsZXMuICovXG5cdHZlcmRpY3Q6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHZlcmRpY3RDb3VudCA9IDA7XG5cdC8qKiBUaGUgYHJlYWR5VGltZW91dGAgc3NoMiB3YXMgY29uZmlndXJlZCB3aXRoIGZvciB0aGlzIGF0dGVtcHQuICovXG5cdHJlYWR5VGltZW91dDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogV2hlbiBzZXQsIHRoZSBjb25uZWN0aW9uIGlzIG5vdCBkcml2ZW4gdG8gcmVhZHkvZXJyb3IgYnkgdGhlIHZlcmRpY3QsIHNvXG5cdCAqIGEgdGVzdCBjYW4gY29udHJvbCB3aGF0IGhhcHBlbnMgd2hpbGUgdmVyaWZpY2F0aW9uIGlzIHN0aWxsIHBlbmRpbmcuXG5cdCAqL1xuXHRkZWZlclZlcmlmaWNhdGlvbiA9IGZhbHNlO1xuXG5cdC8qKiBSZXNvbHZlcyBvbmNlIHNzaDIgaGFzIGVudGVyZWQgYGhvc3RWZXJpZmllcmAgZm9yIHRoaXMgY29ubmVjdGlvbi4gKi9cblx0cmVhZG9ubHkgdmVyaWZpZXJFbnRlcmVkOiBQcm9taXNlPHZvaWQ+O1xuXHRwcml2YXRlIF92ZXJpZmllckVudGVyZWQhOiAoKSA9PiB2b2lkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Vycm9yTGlzdGVuZXJzOiBBcnJheTwoZXJyOiBFcnJvcikgPT4gdm9pZD4gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVhZHlMaXN0ZW5lcnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvc3RLZXlzTGlzdGVuZXJzOiBBcnJheTwoa2V5czogcmVhZG9ubHkgeyBnZXRQdWJsaWNTU0goKTogQnVmZmVyOyB0eXBlOiBzdHJpbmcgfVtdKSA9PiB2b2lkPiA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMudmVyaWZpZXJFbnRlcmVkID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7IHRoaXMuX3ZlcmlmaWVyRW50ZXJlZCA9IHJlc29sdmU7IH0pO1xuXHR9XG5cblx0b24oZXZlbnQ6IHN0cmluZywgbGlzdGVuZXI6ICguLi5hcmdzOiBuZXZlcltdKSA9PiB2b2lkKTogdGhpcyB7XG5cdFx0aWYgKGV2ZW50ID09PSAnZXJyb3InKSB7XG5cdFx0XHR0aGlzLl9lcnJvckxpc3RlbmVycy5wdXNoKGxpc3RlbmVyIGFzIChlcnI6IEVycm9yKSA9PiB2b2lkKTtcblx0XHR9IGVsc2UgaWYgKGV2ZW50ID09PSAncmVhZHknKSB7XG5cdFx0XHR0aGlzLl9yZWFkeUxpc3RlbmVycy5wdXNoKGxpc3RlbmVyIGFzICgpID0+IHZvaWQpO1xuXHRcdH0gZWxzZSBpZiAoZXZlbnQgPT09ICdob3N0a2V5cycpIHtcblx0XHRcdHRoaXMuX2hvc3RLZXlzTGlzdGVuZXJzLnB1c2gobGlzdGVuZXIgYXMgKGtleXM6IHJlYWRvbmx5IHsgZ2V0UHVibGljU1NIKCk6IEJ1ZmZlcjsgdHlwZTogc3RyaW5nIH1bXSkgPT4gdm9pZCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cmVtb3ZlTGlzdGVuZXIoX2V2ZW50OiBzdHJpbmcsIF9saXN0ZW5lcjogKC4uLmFyZ3M6IG5ldmVyW10pID0+IHZvaWQpOiB0aGlzIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdC8qKiBzc2gyJ3MgYXV0aCBjYWxsYmFjaywgc28gdGVzdHMgY2FuIGRyaXZlIHRoZSBpbnRlcmFjdGl2ZSBwcm9tcHQgcGF0aHMuICovXG5cdGF1dGhIYW5kbGVyOiAoKG1ldGhvZHNMZWZ0OiBzdHJpbmdbXSB8IG51bGwsIHBhcnRpYWxTdWNjZXNzOiBib29sZWFuLCBjYjogKG5leHQ6IHVua25vd24pID0+IHZvaWQpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXG5cdGNvbm5lY3QoY29uZmlnOiBDb25uZWN0Q29uZmlnKTogdm9pZCB7XG5cdFx0dGhpcy5yZWFkeVRpbWVvdXQgPSBjb25maWcucmVhZHlUaW1lb3V0O1xuXHRcdHRoaXMuYXV0aEhhbmRsZXIgPSBjb25maWcuYXV0aEhhbmRsZXIgYXMgdW5rbm93biBhcyB0eXBlb2YgdGhpcy5hdXRoSGFuZGxlcjtcblx0XHRjb25zdCBob3N0VmVyaWZpZXIgPSBjb25maWcuaG9zdFZlcmlmaWVyIGFzICgoa2V5OiBCdWZmZXIsIHZlcmlmeTogKHBlcm1pdHRlZDogYm9vbGVhbikgPT4gdm9pZCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdFx0YXNzZXJ0Lm9rKGhvc3RWZXJpZmllciwgJ2hvc3RWZXJpZmllciBtdXN0IGJlIGluc3RhbGxlZCBcdTIwMTQgd2l0aG91dCBpdCBzc2gyIGFjY2VwdHMgYW55IGhvc3Qga2V5Jyk7XG5cdFx0dGhpcy5fdmVyaWZpZXJFbnRlcmVkKCk7XG5cdFx0aG9zdFZlcmlmaWVyKEhPU1RfS0VZLCBwZXJtaXR0ZWQgPT4ge1xuXHRcdFx0dGhpcy52ZXJkaWN0Q291bnQrKztcblx0XHRcdHRoaXMudmVyZGljdCA9IHBlcm1pdHRlZDtcblx0XHRcdGlmICh0aGlzLmRlZmVyVmVyaWZpY2F0aW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChwZXJtaXR0ZWQpIHtcblx0XHRcdFx0dGhpcy5fcmVhZHlMaXN0ZW5lcnMuZm9yRWFjaChsID0+IGwoKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmZpcmVFcnJvcihuZXcgRXJyb3IoJ0hvc3QgZGVuaWVkICh2ZXJpZmljYXRpb24gZmFpbGVkKScpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFubm91bmNlSG9zdEtleXMoa2V5czogcmVhZG9ubHkgeyBnZXRQdWJsaWNTU0goKTogQnVmZmVyOyB0eXBlOiBzdHJpbmcgfVtdKTogdm9pZCB7XG5cdFx0dGhpcy5faG9zdEtleXNMaXN0ZW5lcnMuZm9yRWFjaChsID0+IGwoa2V5cykpO1xuXHR9XG5cblx0ZmlyZUVycm9yKGVycjogRXJyb3IpOiB2b2lkIHtcblx0XHR0aGlzLl9lcnJvckxpc3RlbmVycy5mb3JFYWNoKGwgPT4gbChlcnIpKTtcblx0fVxuXG5cdGVuZCgpOiB2b2lkIHtcblx0XHR0aGlzLmVuZGVkID0gdHJ1ZTtcblx0fVxufVxuXG5jbGFzcyBIb3N0S2V5VGVzdFNlcnZpY2UgZXh0ZW5kcyBTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSB7XG5cdHJlYWRvbmx5IGNsaWVudCA9IG5ldyBIb3N0S2V5TW9ja1NTSENsaWVudCgpO1xuXHRrbm93bkhvc3RzQ29udGVudHMgPSAnJztcblx0LyoqIFNldCB0byBtYWtlIHRoZSBrbm93bl9ob3N0cyByZWFkIHRocm93LCBleGVyY2lzaW5nIHRoZSBmYWlsLWNsb3NlZCBwYXRoLiAqL1xuXHRrbm93bkhvc3RzRXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogV2hlbiBzZXQsIHRoZSBrbm93bl9ob3N0cyByZWFkIGJsb2NrcyBvbiB0aGlzIHByb21pc2UsIHNvIGEgdGVzdCBjYW5cblx0ICogbWFrZSB0aGUgY29ubmVjdGlvbiBkaWUgd2hpbGUgZXZpZGVuY2UgZ2F0aGVyaW5nIGlzIHN0aWxsIGluIGZsaWdodC5cblx0ICovXG5cdGtub3duSG9zdHNHYXRlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfY3JlYXRlU1NIQ2xpZW50KCkge1xuXHRcdHJldHVybiB0aGlzLmNsaWVudCBhcyBuZXZlcjtcblx0fVxuXG5cdC8qKiBBdXRoIGF0dGVtcHRzIHRvIG9mZmVyOyBzZXQgdG8gZXhlcmNpc2UgdGhlIGludGVyYWN0aXZlIHByb21wdCBwYXRocy4gKi9cblx0YXV0aEF0dGVtcHRzOiBTU0hBdXRoQXR0ZW1wdFtdID0gW107XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9idWlsZEF1dGhBdHRlbXB0cyhfY29uZmlnOiBJU1NIQWdlbnRIb3N0Q29uZmlnKTogUHJvbWlzZTxTU0hBdXRoQXR0ZW1wdFtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuYXV0aEF0dGVtcHRzO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9yZWFkS25vd25Ib3N0c0VudHJpZXMoX2hvc3Q6IHN0cmluZyk6IFByb21pc2U8eyBlbnRyaWVzOiBJS25vd25Ib3N0c0VudHJ5W107IHN0cmljdEhvc3RLZXlDaGVja2luZzogdW5kZWZpbmVkIH0+IHtcblx0XHRpZiAodGhpcy5rbm93bkhvc3RzR2F0ZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5rbm93bkhvc3RzR2F0ZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMua25vd25Ib3N0c0Vycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLmtub3duSG9zdHNFcnJvcjtcblx0XHR9XG5cdFx0cmV0dXJuIHsgZW50cmllczogcGFyc2VLbm93bkhvc3RzKHRoaXMua25vd25Ib3N0c0NvbnRlbnRzKSwgc3RyaWN0SG9zdEtleUNoZWNraW5nOiB1bmRlZmluZWQgfTtcblx0fVxuXG5cdC8qKiBFeHBvc2UgdGhlIHBlbmRpbmctcmVxdWVzdCBtYXAgc28gdGVzdHMgY2FuIGFzc2VydCBub3RoaW5nIGlzIGxlYWtlZC4gKi9cblx0Z2V0IHBlbmRpbmdIb3N0S2V5UmVxdWVzdENvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXNbJ19wZW5kaW5nSG9zdEtleVJlcXVlc3RzJ10uc2l6ZTtcblx0fVxuXG5cdC8qKiBFdmVyeSBkZWFkbGluZSBhcm1lZCBkdXJpbmcgdGhlIGNvbm5lY3QsIGluIG9yZGVyLiAqL1xuXHRyZWFkb25seSBkZWFkbGluZUhpc3Rvcnk6IG51bWJlcltdID0gW107XG5cdC8qKiBUaGUgY3VycmVudGx5IGFybWVkIGRlYWRsaW5lLCBvciB1bmRlZmluZWQgd2hlbiBubyB0aW1lciBpcyBydW5uaW5nLiAqL1xuXHRjdXJyZW50RGVhZGxpbmVNczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfYXJtSGFuZHNoYWtlRGVhZGxpbmUobXM6IG51bWJlciwgb25FeHBpcmVkOiAoKSA9PiB2b2lkKTogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4ge1xuXHRcdHRoaXMuZGVhZGxpbmVIaXN0b3J5LnB1c2gobXMpO1xuXHRcdHRoaXMuY3VycmVudERlYWRsaW5lTXMgPSBtcztcblx0XHRyZXR1cm4gc3VwZXIuX2FybUhhbmRzaGFrZURlYWRsaW5lKG1zLCBvbkV4cGlyZWQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9jbGVhckhhbmRzaGFrZURlYWRsaW5lKHRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuY3VycmVudERlYWRsaW5lTXMgPSB1bmRlZmluZWQ7XG5cdFx0c3VwZXIuX2NsZWFySGFuZHNoYWtlRGVhZGxpbmUodGltZXIpO1xuXHR9XG5cblx0Y29ubmVjdFNTSEZvclRlc3QoY29uZmlnOiBJU1NIQWdlbnRIb3N0Q29uZmlnKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2Nvbm5lY3RTU0goY29uZmlnLCAnc3NoOnRlc3QtaG9zdCcpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1ha2VDb25maWcob3ZlcnJpZGVzPzogUGFydGlhbDxJU1NIQWdlbnRIb3N0Q29uZmlnPik6IElTU0hBZ2VudEhvc3RDb25maWcge1xuXHRyZXR1cm4ge1xuXHRcdGhvc3Q6ICd0ZXN0LmV4YW1wbGUuY29tJyxcblx0XHR1c2VybmFtZTogJ3Rlc3R1c2VyJyxcblx0XHRhdXRoTWV0aG9kOiBTU0hBdXRoTWV0aG9kLkFnZW50LFxuXHRcdG5hbWU6ICdUZXN0IEhvc3QnLFxuXHRcdHNzaENvbmZpZ0hvc3Q6ICd0ZXN0LWhvc3QnLFxuXHRcdC4uLm92ZXJyaWRlcyxcblx0fTtcbn1cblxuc3VpdGUoJ1NTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlIC0gaG9zdCBrZXkgdmVyaWZpY2F0aW9uJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2VydmljZSgpOiBIb3N0S2V5VGVzdFNlcnZpY2Uge1xuXHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlOiBQaWNrPElQcm9kdWN0U2VydmljZSwgJ19zZXJ2aWNlQnJhbmQnIHwgJ3F1YWxpdHknIHwgJ2RhdGFGb2xkZXJOYW1lJz4gPSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRxdWFsaXR5OiAnc3RhYmxlJyxcblx0XHRcdGRhdGFGb2xkZXJOYW1lOiAnLnZzY29kZS1vc3MnLFxuXHRcdH07XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChuZXcgSG9zdEtleVRlc3RTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBwcm9kdWN0U2VydmljZSBhcyBJUHJvZHVjdFNlcnZpY2UpKTtcblx0fVxuXG5cdC8qKiBSdW4gYSBjb25uZWN0IGF0dGVtcHQsIGFuc3dlcmluZyB0aGUgdmVyaWZpY2F0aW9uIHJlcXVlc3Qgd2l0aCBgdHJ1c3RlZGAuICovXG5cdGFzeW5jIGZ1bmN0aW9uIGNvbm5lY3RBbnN3ZXJpbmcoc2VydmljZTogSG9zdEtleVRlc3RTZXJ2aWNlLCB0cnVzdGVkOiBib29sZWFuLCBjb25maWcgPSBtYWtlQ29uZmlnKCkpIHtcblx0XHRjb25zdCByZXF1ZXN0czogSVNTSEhvc3RLZXlWZXJpZmljYXRpb25SZXF1ZXN0W10gPSBbXTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5vbkRpZFJlcXVlc3RIb3N0S2V5VmVyaWZpY2F0aW9uKHJlcXVlc3QgPT4ge1xuXHRcdFx0cmVxdWVzdHMucHVzaChyZXF1ZXN0KTtcblx0XHRcdHZvaWQgc2VydmljZS5yZXNwb25kSG9zdEtleVZlcmlmaWNhdGlvbihyZXF1ZXN0LnJlcXVlc3RJZCwgdHJ1c3RlZCk7XG5cdFx0fSkpO1xuXHRcdHRyeSB7XG5cdFx0XHRsZXQgZXJyb3I6IHVua25vd247XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3RTU0hGb3JUZXN0KGNvbmZpZykudGhlbigoKSA9PiAncmVzb2x2ZWQnLCBlcnIgPT4ge1xuXHRcdFx0XHRlcnJvciA9IGVycjtcblx0XHRcdFx0cmV0dXJuIGByZWplY3RlZDogJHtlcnIubWVzc2FnZX1gO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4geyByZXF1ZXN0cywgcmVzdWx0LCBlcnJvciB9O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0dGVzdCgnaW5zdGFsbHMgaG9zdFZlcmlmaWVyIGFuZCByZXBvcnRzIHRoZSBrZXkgdG8gdGhlIHJlbmRlcmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyByZXF1ZXN0cywgcmVzdWx0IH0gPSBhd2FpdCBjb25uZWN0QW5zd2VyaW5nKHNlcnZpY2UsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0cmVxdWVzdENvdW50OiByZXF1ZXN0cy5sZW5ndGgsXG5cdFx0XHRcdGtleVR5cGU6IHJlcXVlc3RzWzBdPy5rZXlUeXBlLFxuXHRcdFx0XHRmaW5nZXJwcmludDogcmVxdWVzdHNbMF0/LmZpbmdlcnByaW50LFxuXHRcdFx0XHRob3N0OiByZXF1ZXN0c1swXT8uaG9zdCxcblx0XHRcdFx0cG9ydDogcmVxdWVzdHNbMF0/LnBvcnQsXG5cdFx0XHRcdGtub3duSG9zdHNNYXRjaDogcmVxdWVzdHNbMF0/Lmtub3duSG9zdHNNYXRjaCxcblx0XHRcdFx0dXNlckluaXRpYXRlZDogcmVxdWVzdHNbMF0/LnVzZXJJbml0aWF0ZWQsXG5cdFx0XHRcdHZlcmRpY3Q6IHNlcnZpY2UuY2xpZW50LnZlcmRpY3QsXG5cdFx0XHRcdHJlc3VsdCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHJlcXVlc3RDb3VudDogMSxcblx0XHRcdFx0a2V5VHlwZTogJ3NzaC1lZDI1NTE5Jyxcblx0XHRcdFx0ZmluZ2VycHJpbnQ6IGNvbXB1dGVIb3N0S2V5RmluZ2VycHJpbnQoSE9TVF9LRVkpLFxuXHRcdFx0XHRob3N0OiAndGVzdC5leGFtcGxlLmNvbScsXG5cdFx0XHRcdHBvcnQ6IDIyLFxuXHRcdFx0XHRrbm93bkhvc3RzTWF0Y2g6ICd1bmtub3duJyxcblx0XHRcdFx0dXNlckluaXRpYXRlZDogdHJ1ZSxcblx0XHRcdFx0dmVyZGljdDogdHJ1ZSxcblx0XHRcdFx0cmVzdWx0OiAncmVzb2x2ZWQnLFxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY2xpbmluZyBmYWlscyB0aGUgY29ubmVjdGlvbiB3aXRoIGEgY2xlYW4gaG9zdCBrZXkgZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gc3NoMiByZXBvcnRzIHRoaXMgYXMgXCJIb3N0IGRlbmllZCAodmVyaWZpY2F0aW9uIGZhaWxlZClcIi4gVGhhdCBpc1xuXHRcdC8vIGphcmdvbiwgYW5kIHRoZSBob3N0IGtleSBVSSBoYXMgYWxyZWFkeSBleHBsYWluZWQgd2hhdCBoYXBwZW5lZCwgc29cblx0XHQvLyB0aGUgY29ubmVjdCBhdHRlbXB0IHN1cmZhY2VzIGEgcmVjb2duaXphYmxlIGVycm9yIGluc3RlYWQuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCB7IHJlc3VsdCwgZXJyb3IgfSA9IGF3YWl0IGNvbm5lY3RBbnN3ZXJpbmcoc2VydmljZSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0dmVyZGljdDogc2VydmljZS5jbGllbnQudmVyZGljdCxcblx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHRkZW5pZWQ6IGlzU1NISG9zdEtleURlbmllZEVycm9yKGVycm9yKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHZlcmRpY3Q6IGZhbHNlLFxuXHRcdFx0XHRyZXN1bHQ6ICdyZWplY3RlZDogSG9zdCBrZXkgdmVyaWZpY2F0aW9uIGZhaWxlZCBmb3IgdGVzdC1ob3N0Jyxcblx0XHRcdFx0ZGVuaWVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgdGhlIGtub3duX2hvc3RzIHZlcmRpY3QgZm9yIGEgbWF0Y2hpbmcgZW50cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRzZXJ2aWNlLmtub3duSG9zdHNDb250ZW50cyA9IGB0ZXN0LmV4YW1wbGUuY29tIHNzaC1lZDI1NTE5ICR7SE9TVF9LRVkudG9TdHJpbmcoJ2Jhc2U2NCcpfWA7XG5cdFx0Y29uc3QgeyByZXF1ZXN0cyB9ID0gYXdhaXQgY29ubmVjdEFuc3dlcmluZyhzZXJ2aWNlLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdHNbMF0/Lmtub3duSG9zdHNNYXRjaCwgJ21hdGNoJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgYSBtaXNtYXRjaCB3aGVuIGtub3duX2hvc3RzIGhvbGRzIGEgZGlmZmVyZW50IGtleScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IG90aGVyID0gbWFrZUtleUJsb2IoJ3NzaC1lZDI1NTE5JywgQnVmZmVyLmFsbG9jKDMyLCAweGJiKSk7XG5cdFx0c2VydmljZS5rbm93bkhvc3RzQ29udGVudHMgPSBgdGVzdC5leGFtcGxlLmNvbSBzc2gtZWQyNTUxOSAke290aGVyLnRvU3RyaW5nKCdiYXNlNjQnKX1gO1xuXHRcdGNvbnN0IHsgcmVxdWVzdHMgfSA9IGF3YWl0IGNvbm5lY3RBbnN3ZXJpbmcoc2VydmljZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0c1swXT8ua25vd25Ib3N0c01hdGNoLCAnbWlzbWF0Y2gnKTtcblx0fSk7XG5cblx0dGVzdCgnZm9yd2FyZHMgdXNlckluaXRpYXRlZCBzbyBiYWNrZ3JvdW5kIHJlY29ubmVjdHMgY2FuIGJlIGRlY2xpbmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyByZXF1ZXN0cyB9ID0gYXdhaXQgY29ubmVjdEFuc3dlcmluZyhzZXJ2aWNlLCBmYWxzZSwgbWFrZUNvbmZpZyh7IHVzZXJJbml0aWF0ZWQ6IGZhbHNlIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdHNbMF0/LnVzZXJJbml0aWF0ZWQsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnYm91bmRzIHRoZSBoYW5kc2hha2UsIGFuZCBvbmx5IHdpZGVucyBpdCB3aGlsZSBhIHByb21wdCBpcyBvdXRzdGFuZGluZycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBzc2gyJ3Mgb3duIHJlYWR5VGltZW91dCBpcyBkaXNhYmxlZCBiZWNhdXNlIGl0IGtlZXBzIHJ1bm5pbmcgd2hpbGVcblx0XHQvLyBob3N0VmVyaWZpZXIgd2FpdHMgb24gYSBodW1hbi4gV2UgYXJtIHRoZSBzaG9ydCBuZXR3b3JrIGRlYWRsaW5lIHVwXG5cdFx0Ly8gZnJvbnQsIHdpZGVuIGl0IG9ubHkgZm9yIHRoZSBpbnRlcnZhbCBhIHByb21wdCBpcyBhY3R1YWxseVxuXHRcdC8vIG91dHN0YW5kaW5nLCBhbmQgcmVzdG9yZSBpdCBvbmNlIHRoZSB2ZXJkaWN0IGFycml2ZXMgXHUyMDE0IHNvIGEgdXNlclxuXHRcdC8vIGdldHMgdGltZSB0byBjb21wYXJlIGEgZmluZ2VycHJpbnQgd2l0aG91dCBhbiB1bnJlYWNoYWJsZSBob3N0XG5cdFx0Ly8gdGFraW5nIG1pbnV0ZXMgdG8gZmFpbC5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IG9ic2VydmVkOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLm9uRGlkUmVxdWVzdEhvc3RLZXlWZXJpZmljYXRpb24ocmVxdWVzdCA9PiB7XG5cdFx0XHRvYnNlcnZlZC5wdXNoKHNlcnZpY2UuY3VycmVudERlYWRsaW5lTXMhKTtcblx0XHRcdHZvaWQgc2VydmljZS5yZXNwb25kSG9zdEtleVZlcmlmaWNhdGlvbihyZXF1ZXN0LnJlcXVlc3RJZCwgdHJ1ZSk7XG5cdFx0fSkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdFNTSEZvclRlc3QobWFrZUNvbmZpZygpKTtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRzc2gyVGltZXJEaXNhYmxlZDogc2VydmljZS5jbGllbnQucmVhZHlUaW1lb3V0LFxuXHRcdFx0XHRhcm1lZEJlZm9yZUNvbm5lY3Q6IHNlcnZpY2UuZGVhZGxpbmVIaXN0b3J5WzBdLFxuXHRcdFx0XHR3aGlsZVByb21wdGluZzogb2JzZXJ2ZWRbMF0sXG5cdFx0XHRcdC8vIENsZWFyZWQgb25jZSB0aGUgY29ubmVjdCBzZXR0bGVzIFx1MjAxNCBubyB0aW1lciBsZWZ0IHJ1bm5pbmcuXG5cdFx0XHRcdGFmdGVyU2V0dGxlOiBzZXJ2aWNlLmN1cnJlbnREZWFkbGluZU1zLFxuXHRcdFx0fSxcblx0XHRcdHsgc3NoMlRpbWVyRGlzYWJsZWQ6IDAsIGFybWVkQmVmb3JlQ29ubmVjdDogMzBfMDAwLCB3aGlsZVByb21wdGluZzogMzAwXzAwMCwgYWZ0ZXJTZXR0bGU6IHVuZGVmaW5lZCB9KTtcblx0fSk7XG5cblx0dGVzdCgnd2lkZW5zIHRoZSBkZWFkbGluZSBmb3IgdGhlIHBhc3N3b3JkIHByb21wdCB0b28sIG5vdCBqdXN0IHRoZSBob3N0IGtleSBkaWFsb2cnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVGhlIGludGVyYWN0aXZlIHdpbmRvdyBtdXN0IGJyYWNrZXQgKmV2ZXJ5KiBodW1hbiBwcm9tcHQuIEEgdXNlclxuXHRcdC8vIHR5cGluZyBhIHBhc3N3b3JkIGlzIG5vIGZhc3RlciB0aGFuIG9uZSBjb21wYXJpbmcgYSBmaW5nZXJwcmludCwgYW5kXG5cdFx0Ly8gaG9sZGluZyB0aGVtIHRvIHRoZSAzMHMgbmV0d29yayBkZWFkbGluZSB3b3VsZCBhYm9ydCB0aGUgY29ubmVjdGlvblxuXHRcdC8vIG91dCBmcm9tIHVuZGVyIHRoZW0uXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRzZXJ2aWNlLmF1dGhBdHRlbXB0cyA9IFt7IHR5cGU6ICdrZXlib2FyZC1pbnRlcmFjdGl2ZScsIHVzZXJuYW1lOiAndGVzdCcgfV07XG5cdFx0c2VydmljZS5jbGllbnQuZGVmZXJWZXJpZmljYXRpb24gPSB0cnVlO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25EaWRSZXF1ZXN0SG9zdEtleVZlcmlmaWNhdGlvbihyZXF1ZXN0ID0+IHtcblx0XHRcdHZvaWQgc2VydmljZS5yZXNwb25kSG9zdEtleVZlcmlmaWNhdGlvbihyZXF1ZXN0LnJlcXVlc3RJZCwgdHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0bGV0IHdoaWxlUHJvbXB0aW5nOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcHJvbXB0ZWQgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdHN0b3JlLmFkZChzZXJ2aWNlLm9uRGlkUmVxdWVzdEtleWJvYXJkSW50ZXJhY3RpdmUocmVxdWVzdCA9PiB7XG5cdFx0XHRcdHdoaWxlUHJvbXB0aW5nID0gc2VydmljZS5jdXJyZW50RGVhZGxpbmVNcztcblx0XHRcdFx0dm9pZCBzZXJ2aWNlLnJlc3BvbmRLZXlib2FyZEludGVyYWN0aXZlKHJlcXVlc3QucmVxdWVzdElkLCBbJ2h1bnRlcjInXSk7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0pKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNvbm5lY3RQcm9taXNlID0gc2VydmljZS5jb25uZWN0U1NIRm9yVGVzdChtYWtlQ29uZmlnKCkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY2xpZW50LnZlcmlmaWVyRW50ZXJlZDtcblx0XHQvLyBEcml2ZSBzc2gyJ3MgYXV0aCBmbG93IHRoZSB3YXkgdGhlIHJlYWwgY2xpZW50IHdvdWxkOiBhc2sgZm9yIHRoZVxuXHRcdC8vIG5leHQgbWV0aG9kLCB0aGVuIGludm9rZSB0aGF0IG1ldGhvZCdzIGBwcm9tcHRgIGNhbGxiYWNrLlxuXHRcdHNlcnZpY2UuY2xpZW50LmF1dGhIYW5kbGVyPy4oWydrZXlib2FyZC1pbnRlcmFjdGl2ZSddLCBmYWxzZSwgbmV4dCA9PiB7XG5cdFx0XHRjb25zdCBtZXRob2QgPSBuZXh0IGFzIHsgcHJvbXB0OiAobmFtZTogc3RyaW5nLCBpbnN0cnVjdGlvbnM6IHN0cmluZywgbGFuZzogc3RyaW5nLCBwcm9tcHRzOiByZWFkb25seSB7IHByb21wdDogc3RyaW5nOyBlY2hvPzogYm9vbGVhbiB9W10sIGZpbmlzaDogKHJlc3BvbnNlczogc3RyaW5nW10pID0+IHZvaWQpID0+IHZvaWQgfTtcblx0XHRcdG1ldGhvZC5wcm9tcHQoJycsICcnLCAnJywgW3sgcHJvbXB0OiAnUGFzc3dvcmQ6JywgZWNobzogZmFsc2UgfV0sICgpID0+IHsgfSk7XG5cdFx0fSk7XG5cdFx0YXdhaXQgcHJvbXB0ZWQ7XG5cdFx0Y29uc3QgYWZ0ZXJBbnN3ZXJpbmcgPSBzZXJ2aWNlLmN1cnJlbnREZWFkbGluZU1zO1xuXG5cdFx0Ly8gU2V0dGxlIHRoZSBjb25uZWN0IHNvIGl0cyBkZWFkbGluZSB0aW1lciBpcyBjbGVhcmVkLiBMZWF2aW5nIGl0IGFybWVkXG5cdFx0Ly8gd291bGQgZmlyZSB+MzBzIGxhdGVyLCBsb25nIGFmdGVyIHRoaXMgdGVzdCBmaW5pc2hlZCwgYW5kIHN1cmZhY2UgYXNcblx0XHQvLyBhbiB1bmV4cGVjdGVkIGVycm9yIGluIHdoaWNoZXZlciBzdWl0ZSBoYXBwZW5lZCB0byBiZSBydW5uaW5nLlxuXHRcdHNlcnZpY2UuY2xpZW50LmZpcmVFcnJvcihuZXcgRXJyb3IoJ0Nvbm5lY3Rpb24gbG9zdCcpKTtcblx0XHRhd2FpdCBjb25uZWN0UHJvbWlzZS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHdoaWxlUHJvbXB0aW5nLCBhZnRlckFuc3dlcmluZyB9LFxuXHRcdFx0eyB3aGlsZVByb21wdGluZzogMzAwXzAwMCwgYWZ0ZXJBbnN3ZXJpbmc6IDMwXzAwMCB9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBjb25uZWN0aW9uIHRoYXQgZGllcyBkdXJpbmcgZXZpZGVuY2UgZ2F0aGVyaW5nIGxlYXZlcyBub3RoaW5nIHBlbmRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gYF92ZXJpZnlIb3N0S2V5YCBhd2FpdHMgdGhlIGtub3duX2hvc3RzIHJlYWQsIHNvIHRoZSBjb25uZWN0aW9uIGNhblxuXHRcdC8vIGRpZSBiZWZvcmUgdGhlIHJlcXVlc3QgaXMgZXZlciByZWdpc3RlcmVkIGZvciBjYW5jZWxsYXRpb24uIElmIHRoYXRcblx0XHQvLyB3aW5kb3cgaXNuJ3QgaGFuZGxlZCwgd2UgbGVhayBhIHBlbmRpbmcgZW50cnkgZm9yZXZlciBhbmQgcG9wIGFcblx0XHQvLyBkaWFsb2cgZm9yIGEgY29ubmVjdGlvbiB0aGF0IGlzIGFscmVhZHkgZ29uZS5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGxldCBvcGVuR2F0ZSA9ICgpID0+IHsgfTtcblx0XHRzZXJ2aWNlLmtub3duSG9zdHNHYXRlID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7IG9wZW5HYXRlID0gcmVzb2x2ZTsgfSk7XG5cblx0XHRjb25zdCByZXF1ZXN0czogSVNTSEhvc3RLZXlWZXJpZmljYXRpb25SZXF1ZXN0W10gPSBbXTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5vbkRpZFJlcXVlc3RIb3N0S2V5VmVyaWZpY2F0aW9uKHJlcXVlc3QgPT4gcmVxdWVzdHMucHVzaChyZXF1ZXN0KSkpO1xuXG5cdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBzZXJ2aWNlLmNvbm5lY3RTU0hGb3JUZXN0KG1ha2VDb25maWcoKSk7XG5cdFx0Ly8gV2FpdCB1bnRpbCBzc2gyIGhhcyBhY3R1YWxseSBlbnRlcmVkIGhvc3RWZXJpZmllciBhbmQgYmxvY2tlZCBpbnNpZGVcblx0XHQvLyB0aGUga25vd25faG9zdHMgcmVhZCwgdGhlbiBraWxsIHRoZSBjb25uZWN0aW9uIHVuZGVybmVhdGggaXQuXG5cdFx0YXdhaXQgc2VydmljZS5jbGllbnQudmVyaWZpZXJFbnRlcmVkO1xuXHRcdHNlcnZpY2UuY2xpZW50LmZpcmVFcnJvcihuZXcgRXJyb3IoJ0Nvbm5lY3Rpb24gbG9zdCcpKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb25uZWN0UHJvbWlzZS50aGVuKCgpID0+ICdyZXNvbHZlZCcsIGVyciA9PiBgcmVqZWN0ZWQ6ICR7ZXJyLm1lc3NhZ2V9YCk7XG5cblx0XHQvLyBOb3cgcmVsZWFzZSB0aGUgcmVhZDogdmVyaWZpY2F0aW9uIHJlc3VtZXMgb24gYSBkZWFkIGNvbm5lY3Rpb24uXG5cdFx0b3BlbkdhdGUoKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRyZXN1bHQsXG5cdFx0XHRcdC8vIE5vIG9ycGhhbmVkIHByb21wdCwgYW5kIG5vIGxlYWtlZCBtYXAgZW50cnkuXG5cdFx0XHRcdHJlcXVlc3RDb3VudDogcmVxdWVzdHMubGVuZ3RoLFxuXHRcdFx0XHRwZW5kaW5nOiBzZXJ2aWNlLnBlbmRpbmdIb3N0S2V5UmVxdWVzdENvdW50LFxuXHRcdFx0XHR2ZXJkaWN0OiBzZXJ2aWNlLmNsaWVudC52ZXJkaWN0LFxuXHRcdFx0fSxcblx0XHRcdHsgcmVzdWx0OiAncmVqZWN0ZWQ6IENvbm5lY3Rpb24gbG9zdCcsIHJlcXVlc3RDb3VudDogMCwgcGVuZGluZzogMCwgdmVyZGljdDogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhaWxzIGNsb3NlZCB3aGVuIGdhdGhlcmluZyBldmlkZW5jZSB0aHJvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQSB0cmFuc2llbnQgZXJyb3IgbXVzdCBuZXZlciBiZWNvbWUgYSB3YXkgdG8gcmVhY2ggYSBzZXJ2ZXIgd2l0aG91dFxuXHRcdC8vIHZlcmlmaWNhdGlvbiwgc28gbm8gcmVxdWVzdCBpcyByYWlzZWQgYW5kIHRoZSBrZXkgaXMgcmVmdXNlZC5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdHNlcnZpY2Uua25vd25Ib3N0c0Vycm9yID0gbmV3IEVycm9yKCdib29tJyk7XG5cdFx0Y29uc3QgcmVxdWVzdHM6IElTU0hIb3N0S2V5VmVyaWZpY2F0aW9uUmVxdWVzdFtdID0gW107XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25EaWRSZXF1ZXN0SG9zdEtleVZlcmlmaWNhdGlvbihyZXF1ZXN0ID0+IHJlcXVlc3RzLnB1c2gocmVxdWVzdCkpKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3RTU0hGb3JUZXN0KG1ha2VDb25maWcoKSkudGhlbigoKSA9PiAncmVzb2x2ZWQnLCBlcnIgPT4gYHJlamVjdGVkOiAke2Vyci5tZXNzYWdlfWApO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHJlcXVlc3RDb3VudDogcmVxdWVzdHMubGVuZ3RoLCB2ZXJkaWN0OiBzZXJ2aWNlLmNsaWVudC52ZXJkaWN0LCByZXN1bHQgfSxcblx0XHRcdHsgcmVxdWVzdENvdW50OiAwLCB2ZXJkaWN0OiBmYWxzZSwgcmVzdWx0OiAncmVqZWN0ZWQ6IEhvc3QgZGVuaWVkICh2ZXJpZmljYXRpb24gZmFpbGVkKScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbGxpbmcgYW4gaW4tZmxpZ2h0IHZlcmlmaWNhdGlvbiBkZW5pZXMgcmF0aGVyIHRoYW4gaGFuZ2luZycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBJZiB0aGUgY29ubmVjdGlvbiBkcm9wcyB3aGlsZSB3ZSdyZSBzdGlsbCB3YWl0aW5nIG9uIGEgdmVyZGljdCwgc3NoMlxuXHRcdC8vIG11c3Qgc3RpbGwgYmUgdG9sZCBcIm5vXCIgXHUyMDE0IG90aGVyd2lzZSB0aGUgaGFuZHNoYWtlIHN0YWxscyB1bnRpbFxuXHRcdC8vIHJlYWR5VGltZW91dCBlbGFwc2VzLCBhbmQgdGhlIHJlbmRlcmVyJ3MgcHJvbXB0IGlzIGxlZnQgb3JwaGFuZWQuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRzZXJ2aWNlLmNsaWVudC5kZWZlclZlcmlmaWNhdGlvbiA9IHRydWU7XG5cblx0XHRjb25zdCBjYW5jZWxsZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcmVxdWVzdHM6IElTU0hIb3N0S2V5VmVyaWZpY2F0aW9uUmVxdWVzdFtdID0gW107XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25EaWRDYW5jZWxIb3N0S2V5VmVyaWZpY2F0aW9uKHJlcXVlc3RJZCA9PiBjYW5jZWxsZWQucHVzaChyZXF1ZXN0SWQpKSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25EaWRSZXF1ZXN0SG9zdEtleVZlcmlmaWNhdGlvbihyZXF1ZXN0ID0+IHtcblx0XHRcdHJlcXVlc3RzLnB1c2gocmVxdWVzdCk7XG5cdFx0XHQvLyBTaW11bGF0ZSB0aGUgY29ubmVjdGlvbiBkeWluZyB3aGlsZSB0aGUgdXNlciBpcyBzdGlsbCBkZWNpZGluZy5cblx0XHRcdHNlcnZpY2UuY2xpZW50LmZpcmVFcnJvcihuZXcgRXJyb3IoJ0Nvbm5lY3Rpb24gbG9zdCcpKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3RTU0hGb3JUZXN0KG1ha2VDb25maWcoKSkudGhlbigoKSA9PiAncmVzb2x2ZWQnLCBlcnIgPT4gYHJlamVjdGVkOiAke2Vyci5tZXNzYWdlfWApO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHJlc3VsdCxcblx0XHRcdFx0Y2FuY2VsbGVkOiBjYW5jZWxsZWQubGVuZ3RoID09PSAxICYmIGNhbmNlbGxlZFswXSA9PT0gcmVxdWVzdHNbMF0/LnJlcXVlc3RJZCxcblx0XHRcdFx0dmVyZGljdDogc2VydmljZS5jbGllbnQudmVyZGljdCxcblx0XHRcdFx0dmVyZGljdENvdW50OiBzZXJ2aWNlLmNsaWVudC52ZXJkaWN0Q291bnQsXG5cdFx0XHR9LFxuXHRcdFx0eyByZXN1bHQ6ICdyZWplY3RlZDogQ29ubmVjdGlvbiBsb3N0JywgY2FuY2VsbGVkOiB0cnVlLCB2ZXJkaWN0OiBmYWxzZSwgdmVyZGljdENvdW50OiAxIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdXJmYWNlcyBwcm92ZW4gYW5ub3VuY2VkIGhvc3Qga2V5cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IGFubm91bmNlbWVudHM6IHsgaG9zdDogc3RyaW5nOyBrZXlzOiByZWFkb25seSB7IGtleVR5cGU6IHN0cmluZzsgZmluZ2VycHJpbnQ6IHN0cmluZyB9W10gfVtdID0gW107XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25EaWRBbm5vdW5jZUhvc3RLZXlzKGEgPT4gYW5ub3VuY2VtZW50cy5wdXNoKHsgaG9zdDogYS5ob3N0LCBrZXlzOiBhLmtleXMgfSkpKTtcblx0XHRhd2FpdCBjb25uZWN0QW5zd2VyaW5nKHNlcnZpY2UsIHRydWUpO1xuXG5cdFx0Y29uc3Qgcm90YXRlZCA9IG1ha2VLZXlCbG9iKCdzc2gtZWQyNTUxOScsIEJ1ZmZlci5hbGxvYygzMiwgMHhjYykpO1xuXHRcdHNlcnZpY2UuY2xpZW50LmFubm91bmNlSG9zdEtleXMoW1xuXHRcdFx0eyBnZXRQdWJsaWNTU0g6ICgpID0+IHJvdGF0ZWQsIHR5cGU6ICdzc2gtZWQyNTUxOScgfSxcblx0XHRcdC8vIEEgY2VydGlmaWNhdGU6IHNzaDIgbWlzcGFyc2VzIHRoZXNlIChpdCByZXR1cm5zIHRoZSBjZXJ0J3Mgbm9uY2Vcblx0XHRcdC8vIGFzIHRoZSBrZXkgbWF0ZXJpYWwpLCBzbyB0aGUgYmxvYidzIGVtYmVkZGVkIHR5cGUgZGlzYWdyZWVzIHdpdGhcblx0XHRcdC8vIHRoZSBkZWNsYXJlZCB0eXBlIGFuZCBpdCBtdXN0IGJlIHNraXBwZWQgcmF0aGVyIHRoYW4gdHJ1c3RlZC5cblx0XHRcdHsgZ2V0UHVibGljU1NIOiAoKSA9PiBtYWtlS2V5QmxvYignc3NoLWVkMjU1MTknLCBCdWZmZXIuYWxsb2MoMzIsIDB4ZGQpKSwgdHlwZTogJ3NzaC1lZDI1NTE5LWNlcnQtdjAxQG9wZW5zc2guY29tJyB9LFxuXHRcdF0pO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYW5ub3VuY2VtZW50cywgW3tcblx0XHRcdGhvc3Q6ICd0ZXN0LmV4YW1wbGUuY29tJyxcblx0XHRcdGtleXM6IFt7IGtleVR5cGU6ICdzc2gtZWQyNTUxOScsIGZpbmdlcnByaW50OiBjb21wdXRlSG9zdEtleUZpbmdlcnByaW50KHJvdGF0ZWQpIH1dLFxuXHRcdH1dKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHlCQUF5QixxQkFBb0Y7QUFDdEgsU0FBUyxxQ0FBMEQ7QUFDbkUsU0FBUywyQkFBMkIsdUJBQThDO0FBR2xGLFNBQVMsWUFBWSxTQUFpQixVQUEwQjtBQUMvRCxRQUFNLE9BQU8sT0FBTyxLQUFLLFNBQVMsT0FBTztBQUN6QyxRQUFNLFNBQVMsT0FBTyxNQUFNLENBQUM7QUFDN0IsU0FBTyxjQUFjLEtBQUssUUFBUSxDQUFDO0FBQ25DLFFBQU0sT0FBTyxPQUFPLE1BQU0sQ0FBQztBQUMzQixPQUFLLGNBQWMsU0FBUyxRQUFRLENBQUM7QUFDckMsU0FBTyxPQUFPLE9BQU8sQ0FBQyxRQUFRLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDcEQ7QUFFQSxNQUFNLFdBQVcsWUFBWSxlQUFlLE9BQU8sTUFBTSxJQUFJLEdBQUksQ0FBQztBQU1sRSxNQUFNLHFCQUFxQjtBQUFBLEVBcUIxQixjQUFjO0FBcEJkLGlCQUFRO0FBR1Isd0JBQWU7QUFPZjtBQUFBO0FBQUE7QUFBQTtBQUFBLDZCQUFvQjtBQU1wQixTQUFpQixrQkFBK0MsQ0FBQztBQUNqRSxTQUFpQixrQkFBcUMsQ0FBQztBQUN2RCxTQUFpQixxQkFBaUcsQ0FBQztBQUdsSCxTQUFLLGtCQUFrQixJQUFJLFFBQWMsYUFBVztBQUFFLFdBQUssbUJBQW1CO0FBQUEsSUFBUyxDQUFDO0FBQUEsRUFDekY7QUFBQSxFQUVBLEdBQUcsT0FBZSxVQUE0QztBQUM3RCxRQUFJLFVBQVUsU0FBUztBQUN0QixXQUFLLGdCQUFnQixLQUFLLFFBQWdDO0FBQUEsSUFDM0QsV0FBVyxVQUFVLFNBQVM7QUFDN0IsV0FBSyxnQkFBZ0IsS0FBSyxRQUFzQjtBQUFBLElBQ2pELFdBQVcsVUFBVSxZQUFZO0FBQ2hDLFdBQUssbUJBQW1CLEtBQUssUUFBK0U7QUFBQSxJQUM3RztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxlQUFlLFFBQWdCLFdBQTZDO0FBQzNFLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFLQSxRQUFRLFFBQTZCO0FBQ3BDLFNBQUssZUFBZSxPQUFPO0FBQzNCLFNBQUssY0FBYyxPQUFPO0FBQzFCLFVBQU0sZUFBZSxPQUFPO0FBQzVCLFdBQU8sR0FBRyxjQUFjLDRFQUF1RTtBQUMvRixTQUFLLGlCQUFpQjtBQUN0QixpQkFBYSxVQUFVLGVBQWE7QUFDbkMsV0FBSztBQUNMLFdBQUssVUFBVTtBQUNmLFVBQUksS0FBSyxtQkFBbUI7QUFDM0I7QUFBQSxNQUNEO0FBQ0EsVUFBSSxXQUFXO0FBQ2QsYUFBSyxnQkFBZ0IsUUFBUSxPQUFLLEVBQUUsQ0FBQztBQUFBLE1BQ3RDLE9BQU87QUFDTixhQUFLLFVBQVUsSUFBSSxNQUFNLG1DQUFtQyxDQUFDO0FBQUEsTUFDOUQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxpQkFBaUIsTUFBaUU7QUFDakYsU0FBSyxtQkFBbUIsUUFBUSxPQUFLLEVBQUUsSUFBSSxDQUFDO0FBQUEsRUFDN0M7QUFBQSxFQUVBLFVBQVUsS0FBa0I7QUFDM0IsU0FBSyxnQkFBZ0IsUUFBUSxPQUFLLEVBQUUsR0FBRyxDQUFDO0FBQUEsRUFDekM7QUFBQSxFQUVBLE1BQVk7QUFDWCxTQUFLLFFBQVE7QUFBQSxFQUNkO0FBQ0Q7QUFFQSxNQUFNLDJCQUEyQiw4QkFBOEI7QUFBQSxFQUEvRDtBQUFBO0FBQ0MsU0FBUyxTQUFTLElBQUkscUJBQXFCO0FBQzNDLDhCQUFxQjtBQWNyQjtBQUFBLHdCQUFpQyxDQUFDO0FBc0JsQztBQUFBLFNBQVMsa0JBQTRCLENBQUM7QUFBQTtBQUFBLEVBM0J0QyxNQUF5QixtQkFBbUI7QUFDM0MsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBS0EsTUFBeUIsbUJBQW1CLFNBQXlEO0FBQ3BHLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLE1BQXlCLHVCQUF1QixPQUEyRjtBQUMxSSxRQUFJLEtBQUssZ0JBQWdCO0FBQ3hCLFlBQU0sS0FBSztBQUFBLElBQ1o7QUFDQSxRQUFJLEtBQUssaUJBQWlCO0FBQ3pCLFlBQU0sS0FBSztBQUFBLElBQ1o7QUFDQSxXQUFPLEVBQUUsU0FBUyxnQkFBZ0IsS0FBSyxrQkFBa0IsR0FBRyx1QkFBdUIsT0FBVTtBQUFBLEVBQzlGO0FBQUE7QUFBQSxFQUdBLElBQUksNkJBQXFDO0FBQ3hDLFdBQU8sS0FBSyx5QkFBeUIsRUFBRTtBQUFBLEVBQ3hDO0FBQUEsRUFPbUIsc0JBQXNCLElBQVksV0FBc0Q7QUFDMUcsU0FBSyxnQkFBZ0IsS0FBSyxFQUFFO0FBQzVCLFNBQUssb0JBQW9CO0FBQ3pCLFdBQU8sTUFBTSxzQkFBc0IsSUFBSSxTQUFTO0FBQUEsRUFDakQ7QUFBQSxFQUVtQix3QkFBd0IsT0FBd0Q7QUFDbEcsU0FBSyxvQkFBb0I7QUFDekIsVUFBTSx3QkFBd0IsS0FBSztBQUFBLEVBQ3BDO0FBQUEsRUFFQSxrQkFBa0IsUUFBNkI7QUFDOUMsV0FBTyxLQUFLLFlBQVksUUFBUSxlQUFlO0FBQUEsRUFDaEQ7QUFDRDtBQUVBLFNBQVMsV0FBVyxXQUErRDtBQUNsRixTQUFPO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixVQUFVO0FBQUEsSUFDVixZQUFZLGNBQWM7QUFBQSxJQUMxQixNQUFNO0FBQUEsSUFDTixlQUFlO0FBQUEsSUFDZixHQUFHO0FBQUEsRUFDSjtBQUNEO0FBRUEsTUFBTSx5REFBeUQsTUFBTTtBQUVwRSxRQUFNLGNBQWMsd0NBQXdDO0FBRTVELFdBQVMsZ0JBQW9DO0FBQzVDLFVBQU0saUJBQXdGO0FBQUEsTUFDN0YsZUFBZTtBQUFBLE1BQ2YsU0FBUztBQUFBLE1BQ1QsZ0JBQWdCO0FBQUEsSUFDakI7QUFDQSxXQUFPLFlBQVksSUFBSSxJQUFJLG1CQUFtQixJQUFJLGVBQWUsR0FBRyxjQUFpQyxDQUFDO0FBQUEsRUFDdkc7QUFHQSxpQkFBZSxpQkFBaUIsU0FBNkIsU0FBa0IsU0FBUyxXQUFXLEdBQUc7QUFDckcsVUFBTSxXQUE2QyxDQUFDO0FBQ3BELFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxVQUFNLElBQUksUUFBUSxnQ0FBZ0MsYUFBVztBQUM1RCxlQUFTLEtBQUssT0FBTztBQUNyQixXQUFLLFFBQVEsMkJBQTJCLFFBQVEsV0FBVyxPQUFPO0FBQUEsSUFDbkUsQ0FBQyxDQUFDO0FBQ0YsUUFBSTtBQUNILFVBQUk7QUFDSixZQUFNLFNBQVMsTUFBTSxRQUFRLGtCQUFrQixNQUFNLEVBQUUsS0FBSyxNQUFNLFlBQVksU0FBTztBQUNwRixnQkFBUTtBQUNSLGVBQU8sYUFBYSxJQUFJLE9BQU87QUFBQSxNQUNoQyxDQUFDO0FBQ0QsYUFBTyxFQUFFLFVBQVUsUUFBUSxNQUFNO0FBQUEsSUFDbEMsVUFBRTtBQUNELFlBQU0sUUFBUTtBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBRUEsT0FBSyw2REFBNkQsWUFBWTtBQUM3RSxVQUFNLFVBQVUsY0FBYztBQUM5QixVQUFNLEVBQUUsVUFBVSxPQUFPLElBQUksTUFBTSxpQkFBaUIsU0FBUyxJQUFJO0FBRWpFLFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxjQUFjLFNBQVM7QUFBQSxRQUN2QixTQUFTLFNBQVMsQ0FBQyxHQUFHO0FBQUEsUUFDdEIsYUFBYSxTQUFTLENBQUMsR0FBRztBQUFBLFFBQzFCLE1BQU0sU0FBUyxDQUFDLEdBQUc7QUFBQSxRQUNuQixNQUFNLFNBQVMsQ0FBQyxHQUFHO0FBQUEsUUFDbkIsaUJBQWlCLFNBQVMsQ0FBQyxHQUFHO0FBQUEsUUFDOUIsZUFBZSxTQUFTLENBQUMsR0FBRztBQUFBLFFBQzVCLFNBQVMsUUFBUSxPQUFPO0FBQUEsUUFDeEI7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsY0FBYztBQUFBLFFBQ2QsU0FBUztBQUFBLFFBQ1QsYUFBYSwwQkFBMEIsUUFBUTtBQUFBLFFBQy9DLE1BQU07QUFBQSxRQUNOLE1BQU07QUFBQSxRQUNOLGlCQUFpQjtBQUFBLFFBQ2pCLGVBQWU7QUFBQSxRQUNmLFNBQVM7QUFBQSxRQUNULFFBQVE7QUFBQSxNQUNUO0FBQUEsSUFBQztBQUFBLEVBQ0gsQ0FBQztBQUVELE9BQUssOERBQThELFlBQVk7QUFJOUUsVUFBTSxVQUFVLGNBQWM7QUFDOUIsVUFBTSxFQUFFLFFBQVEsTUFBTSxJQUFJLE1BQU0saUJBQWlCLFNBQVMsS0FBSztBQUUvRCxXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0MsU0FBUyxRQUFRLE9BQU87QUFBQSxRQUN4QjtBQUFBLFFBQ0EsUUFBUSx3QkFBd0IsS0FBSztBQUFBLE1BQ3RDO0FBQUEsTUFDQTtBQUFBLFFBQ0MsU0FBUztBQUFBLFFBQ1QsUUFBUTtBQUFBLFFBQ1IsUUFBUTtBQUFBLE1BQ1Q7QUFBQSxJQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSyx3REFBd0QsWUFBWTtBQUN4RSxVQUFNLFVBQVUsY0FBYztBQUM5QixZQUFRLHFCQUFxQixnQ0FBZ0MsU0FBUyxTQUFTLFFBQVEsQ0FBQztBQUN4RixVQUFNLEVBQUUsU0FBUyxJQUFJLE1BQU0saUJBQWlCLFNBQVMsSUFBSTtBQUN6RCxXQUFPLFlBQVksU0FBUyxDQUFDLEdBQUcsaUJBQWlCLE9BQU87QUFBQSxFQUN6RCxDQUFDO0FBRUQsT0FBSyw2REFBNkQsWUFBWTtBQUM3RSxVQUFNLFVBQVUsY0FBYztBQUM5QixVQUFNLFFBQVEsWUFBWSxlQUFlLE9BQU8sTUFBTSxJQUFJLEdBQUksQ0FBQztBQUMvRCxZQUFRLHFCQUFxQixnQ0FBZ0MsTUFBTSxTQUFTLFFBQVEsQ0FBQztBQUNyRixVQUFNLEVBQUUsU0FBUyxJQUFJLE1BQU0saUJBQWlCLFNBQVMsS0FBSztBQUMxRCxXQUFPLFlBQVksU0FBUyxDQUFDLEdBQUcsaUJBQWlCLFVBQVU7QUFBQSxFQUM1RCxDQUFDO0FBRUQsT0FBSyxtRUFBbUUsWUFBWTtBQUNuRixVQUFNLFVBQVUsY0FBYztBQUM5QixVQUFNLEVBQUUsU0FBUyxJQUFJLE1BQU0saUJBQWlCLFNBQVMsT0FBTyxXQUFXLEVBQUUsZUFBZSxNQUFNLENBQUMsQ0FBQztBQUNoRyxXQUFPLFlBQVksU0FBUyxDQUFDLEdBQUcsZUFBZSxLQUFLO0FBQUEsRUFDckQsQ0FBQztBQUVELE9BQUssMEVBQTBFLFlBQVk7QUFPMUYsVUFBTSxVQUFVLGNBQWM7QUFDOUIsVUFBTSxXQUFxQixDQUFDO0FBQzVCLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxVQUFNLElBQUksUUFBUSxnQ0FBZ0MsYUFBVztBQUM1RCxlQUFTLEtBQUssUUFBUSxpQkFBa0I7QUFDeEMsV0FBSyxRQUFRLDJCQUEyQixRQUFRLFdBQVcsSUFBSTtBQUFBLElBQ2hFLENBQUMsQ0FBQztBQUNGLFVBQU0sUUFBUSxrQkFBa0IsV0FBVyxDQUFDO0FBQzVDLFVBQU0sUUFBUTtBQUVkLFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxtQkFBbUIsUUFBUSxPQUFPO0FBQUEsUUFDbEMsb0JBQW9CLFFBQVEsZ0JBQWdCLENBQUM7QUFBQSxRQUM3QyxnQkFBZ0IsU0FBUyxDQUFDO0FBQUE7QUFBQSxRQUUxQixhQUFhLFFBQVE7QUFBQSxNQUN0QjtBQUFBLE1BQ0EsRUFBRSxtQkFBbUIsR0FBRyxvQkFBb0IsS0FBUSxnQkFBZ0IsS0FBUyxhQUFhLE9BQVU7QUFBQSxJQUFDO0FBQUEsRUFDdkcsQ0FBQztBQUVELE9BQUssaUZBQWlGLFlBQVk7QUFLakcsVUFBTSxVQUFVLGNBQWM7QUFDOUIsWUFBUSxlQUFlLENBQUMsRUFBRSxNQUFNLHdCQUF3QixVQUFVLE9BQU8sQ0FBQztBQUMxRSxZQUFRLE9BQU8sb0JBQW9CO0FBRW5DLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxVQUFNLElBQUksUUFBUSxnQ0FBZ0MsYUFBVztBQUM1RCxXQUFLLFFBQVEsMkJBQTJCLFFBQVEsV0FBVyxJQUFJO0FBQUEsSUFDaEUsQ0FBQyxDQUFDO0FBRUYsUUFBSTtBQUNKLFVBQU0sV0FBVyxJQUFJLFFBQWMsYUFBVztBQUM3QyxZQUFNLElBQUksUUFBUSxnQ0FBZ0MsYUFBVztBQUM1RCx5QkFBaUIsUUFBUTtBQUN6QixhQUFLLFFBQVEsMkJBQTJCLFFBQVEsV0FBVyxDQUFDLFNBQVMsQ0FBQztBQUN0RSxnQkFBUTtBQUFBLE1BQ1QsQ0FBQyxDQUFDO0FBQUEsSUFDSCxDQUFDO0FBRUQsVUFBTSxpQkFBaUIsUUFBUSxrQkFBa0IsV0FBVyxDQUFDO0FBQzdELFVBQU0sUUFBUSxPQUFPO0FBR3JCLFlBQVEsT0FBTyxjQUFjLENBQUMsc0JBQXNCLEdBQUcsT0FBTyxVQUFRO0FBQ3JFLFlBQU0sU0FBUztBQUNmLGFBQU8sT0FBTyxJQUFJLElBQUksSUFBSSxDQUFDLEVBQUUsUUFBUSxhQUFhLE1BQU0sTUFBTSxDQUFDLEdBQUcsTUFBTTtBQUFBLE1BQUUsQ0FBQztBQUFBLElBQzVFLENBQUM7QUFDRCxVQUFNO0FBQ04sVUFBTSxpQkFBaUIsUUFBUTtBQUsvQixZQUFRLE9BQU8sVUFBVSxJQUFJLE1BQU0saUJBQWlCLENBQUM7QUFDckQsVUFBTSxlQUFlLE1BQU0sTUFBTSxNQUFTO0FBQzFDLFVBQU0sUUFBUTtBQUVkLFdBQU87QUFBQSxNQUNOLEVBQUUsZ0JBQWdCLGVBQWU7QUFBQSxNQUNqQyxFQUFFLGdCQUFnQixLQUFTLGdCQUFnQixJQUFPO0FBQUEsSUFBQztBQUFBLEVBQ3JELENBQUM7QUFFRCxPQUFLLDJFQUEyRSxZQUFZO0FBSzNGLFVBQU0sVUFBVSxjQUFjO0FBQzlCLFFBQUksV0FBVyxNQUFNO0FBQUEsSUFBRTtBQUN2QixZQUFRLGlCQUFpQixJQUFJLFFBQWMsYUFBVztBQUFFLGlCQUFXO0FBQUEsSUFBUyxDQUFDO0FBRTdFLFVBQU0sV0FBNkMsQ0FBQztBQUNwRCxVQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsVUFBTSxJQUFJLFFBQVEsZ0NBQWdDLGFBQVcsU0FBUyxLQUFLLE9BQU8sQ0FBQyxDQUFDO0FBRXBGLFVBQU0saUJBQWlCLFFBQVEsa0JBQWtCLFdBQVcsQ0FBQztBQUc3RCxVQUFNLFFBQVEsT0FBTztBQUNyQixZQUFRLE9BQU8sVUFBVSxJQUFJLE1BQU0saUJBQWlCLENBQUM7QUFDckQsVUFBTSxTQUFTLE1BQU0sZUFBZSxLQUFLLE1BQU0sWUFBWSxTQUFPLGFBQWEsSUFBSSxPQUFPLEVBQUU7QUFHNUYsYUFBUztBQUNULFVBQU0sSUFBSSxRQUFRLGFBQVcsV0FBVyxTQUFTLEVBQUUsQ0FBQztBQUNwRCxVQUFNLFFBQVE7QUFFZCxXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0M7QUFBQTtBQUFBLFFBRUEsY0FBYyxTQUFTO0FBQUEsUUFDdkIsU0FBUyxRQUFRO0FBQUEsUUFDakIsU0FBUyxRQUFRLE9BQU87QUFBQSxNQUN6QjtBQUFBLE1BQ0EsRUFBRSxRQUFRLDZCQUE2QixjQUFjLEdBQUcsU0FBUyxHQUFHLFNBQVMsTUFBTTtBQUFBLElBQUM7QUFBQSxFQUN0RixDQUFDO0FBRUQsT0FBSywrQ0FBK0MsWUFBWTtBQUcvRCxVQUFNLFVBQVUsY0FBYztBQUM5QixZQUFRLGtCQUFrQixJQUFJLE1BQU0sTUFBTTtBQUMxQyxVQUFNLFdBQTZDLENBQUM7QUFDcEQsVUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLFVBQU0sSUFBSSxRQUFRLGdDQUFnQyxhQUFXLFNBQVMsS0FBSyxPQUFPLENBQUMsQ0FBQztBQUNwRixVQUFNLFNBQVMsTUFBTSxRQUFRLGtCQUFrQixXQUFXLENBQUMsRUFBRSxLQUFLLE1BQU0sWUFBWSxTQUFPLGFBQWEsSUFBSSxPQUFPLEVBQUU7QUFDckgsVUFBTSxRQUFRO0FBRWQsV0FBTztBQUFBLE1BQ04sRUFBRSxjQUFjLFNBQVMsUUFBUSxTQUFTLFFBQVEsT0FBTyxTQUFTLE9BQU87QUFBQSxNQUN6RSxFQUFFLGNBQWMsR0FBRyxTQUFTLE9BQU8sUUFBUSw4Q0FBOEM7QUFBQSxJQUFDO0FBQUEsRUFDNUYsQ0FBQztBQUVELE9BQUssbUVBQW1FLFlBQVk7QUFJbkYsVUFBTSxVQUFVLGNBQWM7QUFDOUIsWUFBUSxPQUFPLG9CQUFvQjtBQUVuQyxVQUFNLFlBQXNCLENBQUM7QUFDN0IsVUFBTSxXQUE2QyxDQUFDO0FBQ3BELFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxVQUFNLElBQUksUUFBUSwrQkFBK0IsZUFBYSxVQUFVLEtBQUssU0FBUyxDQUFDLENBQUM7QUFDeEYsVUFBTSxJQUFJLFFBQVEsZ0NBQWdDLGFBQVc7QUFDNUQsZUFBUyxLQUFLLE9BQU87QUFFckIsY0FBUSxPQUFPLFVBQVUsSUFBSSxNQUFNLGlCQUFpQixDQUFDO0FBQUEsSUFDdEQsQ0FBQyxDQUFDO0FBRUYsVUFBTSxTQUFTLE1BQU0sUUFBUSxrQkFBa0IsV0FBVyxDQUFDLEVBQUUsS0FBSyxNQUFNLFlBQVksU0FBTyxhQUFhLElBQUksT0FBTyxFQUFFO0FBQ3JILFVBQU0sUUFBUTtBQUVkLFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQztBQUFBLFFBQ0EsV0FBVyxVQUFVLFdBQVcsS0FBSyxVQUFVLENBQUMsTUFBTSxTQUFTLENBQUMsR0FBRztBQUFBLFFBQ25FLFNBQVMsUUFBUSxPQUFPO0FBQUEsUUFDeEIsY0FBYyxRQUFRLE9BQU87QUFBQSxNQUM5QjtBQUFBLE1BQ0EsRUFBRSxRQUFRLDZCQUE2QixXQUFXLE1BQU0sU0FBUyxPQUFPLGNBQWMsRUFBRTtBQUFBLElBQUM7QUFBQSxFQUMzRixDQUFDO0FBRUQsT0FBSyx1Q0FBdUMsWUFBWTtBQUN2RCxVQUFNLFVBQVUsY0FBYztBQUM5QixVQUFNLGdCQUErRixDQUFDO0FBQ3RHLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxVQUFNLElBQUksUUFBUSxzQkFBc0IsT0FBSyxjQUFjLEtBQUssRUFBRSxNQUFNLEVBQUUsTUFBTSxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUNoRyxVQUFNLGlCQUFpQixTQUFTLElBQUk7QUFFcEMsVUFBTSxVQUFVLFlBQVksZUFBZSxPQUFPLE1BQU0sSUFBSSxHQUFJLENBQUM7QUFDakUsWUFBUSxPQUFPLGlCQUFpQjtBQUFBLE1BQy9CLEVBQUUsY0FBYyxNQUFNLFNBQVMsTUFBTSxjQUFjO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFJbkQsRUFBRSxjQUFjLE1BQU0sWUFBWSxlQUFlLE9BQU8sTUFBTSxJQUFJLEdBQUksQ0FBQyxHQUFHLE1BQU0sbUNBQW1DO0FBQUEsSUFDcEgsQ0FBQztBQUNELFVBQU0sUUFBUTtBQUVkLFdBQU8sZ0JBQWdCLGVBQWUsQ0FBQztBQUFBLE1BQ3RDLE1BQU07QUFBQSxNQUNOLE1BQU0sQ0FBQyxFQUFFLFNBQVMsZUFBZSxhQUFhLDBCQUEwQixPQUFPLEVBQUUsQ0FBQztBQUFBLElBQ25GLENBQUMsQ0FBQztBQUFBLEVBQ0gsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
