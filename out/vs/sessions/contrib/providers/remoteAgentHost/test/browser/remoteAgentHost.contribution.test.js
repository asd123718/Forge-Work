import assert from "assert";
import { DeferredPromise, timeout } from "../../../../../../base/common/async.js";
import { CancellationError } from "../../../../../../base/common/errors.js";
import { AgentHostAuthenticationRecovery, AgentHostAuthTokenCache } from "../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostAuth.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { RemoteAgentHostEntryType } from "../../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { SSHHostKeyDeniedError } from "../../../../../../platform/agentHost/common/sshRemoteAgentHost.js";
import { AuthRequiredReason, NotificationType } from "../../../../../../platform/agentHost/common/state/sessionActions.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IAuthenticationService } from "../../../../../../workbench/services/authentication/common/authentication.js";
import { categorizeSSHConnectError } from "../../../../../common/sessionsTelemetry.js";
import { disconnectSSHEntry, RemoteAgentHostContribution, shouldPauseSSHReconnectAfterFailure, sshConnectionKey, SSHReconnectState } from "../../browser/remoteAgentHost.contribution.js";
suite("RemoteAgentHost auth notifications", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("resends the current token for an expired notification resource that is not advertised by root agents", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, {
      getOrActivateProviderIdForServer: async () => "test-provider",
      getSessions: async () => [{
        id: "session-id",
        account: { id: "account-id", label: "Test Account" },
        scopes: ["session:read"],
        accessToken: "session-token"
      }]
    });
    const logService = new NullLogService();
    instantiationService.stub(ILogService, logService);
    const authenticateCalls = [];
    const connection = {
      authenticate: async (params) => {
        authenticateCalls.push(params);
        return { authenticated: true };
      }
    };
    const address = "test-host";
    const contribution = Object.create(RemoteAgentHostContribution.prototype);
    contribution._connections = /* @__PURE__ */ new Map([[address, { authTokenCache: new AgentHostAuthTokenCache(), authRecovery: new AgentHostAuthenticationRecovery() }]]);
    contribution._sessionsProvidersService = { getProvider: () => void 0 };
    contribution._instantiationService = instantiationService;
    contribution._connectionCustomizations = { get: () => void 0 };
    contribution._logService = logService;
    const resource = {
      resource: "https://api.example.com/session",
      authorization_servers: ["https://auth.example.com"],
      scopes_supported: ["session:read"]
    };
    const notification = {
      type: NotificationType.AuthRequired,
      channel: "ahp-root://",
      resource,
      reason: AuthRequiredReason.Expired
    };
    contribution._handleAuthenticationRequiredNotification(address, connection, notification);
    await timeout(0);
    assert.deepStrictEqual(authenticateCalls, [{
      resource: "https://api.example.com/session",
      scopes: ["session:read"],
      token: "session-token"
    }]);
  });
  test("reauthenticates each host independently with the same current token", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, {
      getOrActivateProviderIdForServer: async () => "test-provider",
      getSessions: async () => [{ id: "session-id", account: { id: "account-id", label: "Test Account" }, scopes: ["session:read"], accessToken: "session-token" }]
    });
    instantiationService.stub(ILogService, new NullLogService());
    const calls = [];
    const contribution = Object.create(RemoteAgentHostContribution.prototype);
    contribution._connections = /* @__PURE__ */ new Map([
      ["host-one", { authTokenCache: new AgentHostAuthTokenCache(), authRecovery: new AgentHostAuthenticationRecovery() }],
      ["host-two", { authTokenCache: new AgentHostAuthTokenCache(), authRecovery: new AgentHostAuthenticationRecovery() }]
    ]);
    contribution._sessionsProvidersService = { getProvider: () => void 0 };
    contribution._instantiationService = instantiationService;
    contribution._connectionCustomizations = { get: () => void 0 };
    contribution._logService = new NullLogService();
    const resource = {
      resource: "https://api.example.com/session",
      authorization_servers: ["https://auth.example.com"],
      scopes_supported: ["session:read"]
    };
    const notification = { type: NotificationType.AuthRequired, channel: "ahp-root://", resource, reason: AuthRequiredReason.Required };
    contribution._handleAuthenticationRequiredNotification("host-one", { authenticate: async (request) => {
      calls.push(`one:${request.token}`);
      return { authenticated: true };
    } }, notification);
    contribution._handleAuthenticationRequiredNotification("host-two", { authenticate: async (request) => {
      calls.push(`two:${request.token}`);
      return { authenticated: true };
    } }, notification);
    await timeout(0);
    assert.deepStrictEqual(calls, ["one:session-token", "two:session-token"]);
  });
  test("prompts on a second completed same-token challenge and creates a fresh transformed envelope", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, {
      getOrActivateProviderIdForServer: async () => "test-provider",
      getSessions: async () => [{ id: "session-id", account: { id: "account-id", label: "Test Account" }, scopes: ["session:read"], accessToken: "session-token" }]
    });
    instantiationService.stub(ILogService, new NullLogService());
    let promptCount = 0;
    instantiationService.stub(ICommandService, {
      executeCommand: async () => {
        promptCount++;
        return { success: true };
      }
    });
    const envelopes = [];
    let envelopeNumber = 0;
    const address = "sealed-host";
    const contribution = Object.create(RemoteAgentHostContribution.prototype);
    contribution._connections = /* @__PURE__ */ new Map([[address, { authTokenCache: new AgentHostAuthTokenCache(), authRecovery: new AgentHostAuthenticationRecovery() }]]);
    contribution._sessionsProvidersService = { getProvider: () => void 0 };
    contribution._instantiationService = instantiationService;
    contribution._connectionCustomizations = {
      get: () => ({
        authenticate: async (request) => ({ ...request, token: `${request.token}:sealed-${++envelopeNumber}` })
      })
    };
    contribution._logService = new NullLogService();
    const resource = {
      resource: "https://api.example.com/session",
      authorization_servers: ["https://auth.example.com"],
      scopes_supported: ["session:read"]
    };
    const notification = { type: NotificationType.AuthRequired, channel: "ahp-root://", resource, reason: AuthRequiredReason.Expired };
    const connection = { authenticate: async (request) => {
      envelopes.push(request.token);
      return { authenticated: true };
    } };
    contribution._handleAuthenticationRequiredNotification(address, connection, notification);
    await timeout(0);
    contribution._handleAuthenticationRequiredNotification(address, connection, notification);
    await timeout(0);
    assert.deepStrictEqual({ envelopes, promptCount }, {
      envelopes: ["session-token:sealed-1", "session-token:sealed-2"],
      promptCount: 1
    });
  });
});
suite("SSHReconnectState", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("scheduleRetry fires the handler after the requested delay", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const state = store.add(new SSHReconnectState());
      let fired = 0;
      state.scheduleRetry(1e3, () => fired++);
      assert.strictEqual(state.hasPendingTimer, true);
      await timeout(500);
      assert.strictEqual(fired, 0);
      await timeout(600);
      assert.strictEqual(fired, 1);
    });
  });
  test("hasPendingTimer becomes false once the handler has run", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const state = store.add(new SSHReconnectState());
      state.scheduleRetry(1e3, () => {
      });
      await timeout(1100);
      assert.strictEqual(state.hasPendingTimer, false, "timer should be cleared after firing");
    });
  });
  test("cancelTimer prevents the handler from firing", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const state = store.add(new SSHReconnectState());
      let fired = 0;
      state.scheduleRetry(1e3, () => fired++);
      state.cancelTimer();
      assert.strictEqual(state.hasPendingTimer, false);
      await timeout(2e3);
      assert.strictEqual(fired, 0);
    });
  });
  test("scheduling a second retry replaces the first", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const state = store.add(new SSHReconnectState());
      let firstFired = 0;
      let secondFired = 0;
      state.scheduleRetry(5e3, () => firstFired++);
      state.scheduleRetry(1e3, () => secondFired++);
      await timeout(6e3);
      assert.strictEqual(firstFired, 0, "replaced timer must not fire");
      assert.strictEqual(secondFired, 1);
    });
  });
  test("disposing the state cancels a pending retry timer", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const state = new SSHReconnectState();
      let fired = 0;
      state.scheduleRetry(1e3, () => fired++);
      state.dispose();
      await timeout(2e3);
      assert.strictEqual(fired, 0);
    });
  });
  test("resetForResume clears the timer and zeros attempts/paused state", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const state = store.add(new SSHReconnectState());
      let fired = 0;
      state.attempts = 7;
      state.paused = true;
      state.requiresUserInitiatedResume = true;
      state.scheduleRetry(1e3, () => fired++);
      state.resetForResume();
      assert.deepStrictEqual({
        attempts: state.attempts,
        paused: state.paused,
        requiresUserInitiatedResume: state.requiresUserInitiatedResume,
        hasPendingTimer: state.hasPendingTimer
      }, {
        attempts: 0,
        paused: false,
        requiresUserInitiatedResume: false,
        hasPendingTimer: false
      });
      await timeout(2e3);
      assert.strictEqual(fired, 0, "pending retry must be cancelled by resetForResume");
    });
  });
  test("host key denial requires an explicit resume", () => {
    const state = store.add(new SSHReconnectState());
    state.attempts = 1;
    state.paused = true;
    state.requiresUserInitiatedResume = true;
    const automaticResume = state.resumeAutomatically();
    const afterAutomaticResume = {
      attempts: state.attempts,
      paused: state.paused,
      requiresUserInitiatedResume: state.requiresUserInitiatedResume
    };
    state.resetForResume();
    assert.deepStrictEqual({
      automaticResume,
      afterAutomaticResume,
      afterExplicitResume: {
        attempts: state.attempts,
        paused: state.paused,
        requiresUserInitiatedResume: state.requiresUserInitiatedResume
      }
    }, {
      automaticResume: false,
      afterAutomaticResume: {
        attempts: 1,
        paused: true,
        requiresUserInitiatedResume: true
      },
      afterExplicitResume: {
        attempts: 0,
        paused: false,
        requiresUserInitiatedResume: false
      }
    });
  });
});
suite("shouldPauseSSHReconnectAfterFailure", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("pauses reconnect after cancellation or host key denial but not after regular failures", () => {
    assert.deepStrictEqual({
      cancellation: shouldPauseSSHReconnectAfterFailure(new CancellationError()),
      hostKeyDenial: shouldPauseSSHReconnectAfterFailure(new SSHHostKeyDeniedError("test-host")),
      regularError: shouldPauseSSHReconnectAfterFailure(new Error("boom"))
    }, {
      cancellation: true,
      hostKeyDenial: true,
      regularError: false
    });
  });
});
suite("categorizeSSHConnectError", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns bounded categories without logging error messages", () => {
    assert.deepStrictEqual({
      cancellation: categorizeSSHConnectError(new CancellationError()),
      hostKeyDenial: categorizeSSHConnectError(new SSHHostKeyDeniedError("test-host")),
      authentication: categorizeSSHConnectError(new Error("All configured authentication methods failed")),
      network: categorizeSSHConnectError(new Error("connect ETIMEDOUT")),
      other: categorizeSSHConnectError(new Error("remote setup failed"))
    }, {
      cancellation: "cancelled",
      hostKeyDenial: "hostKeyDenied",
      authentication: "authentication",
      network: "network",
      other: "other"
    });
  });
});
suite("disconnectSSHEntry", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function makeSSHConfigConnection(overrides = {}) {
    return {
      type: RemoteAgentHostEntryType.SSH,
      address: "localhost:4321",
      sshConfigHost: "myserver",
      hostName: "myserver.example.com",
      ...overrides
    };
  }
  test("removes the entry from configured storage BEFORE tearing down the SSH tunnel", async () => {
    const calls = [];
    const connection = makeSSHConfigConnection();
    const removed = new DeferredPromise();
    const remoteAgentHostService = {
      removeRemoteAgentHost: async (address) => {
        calls.push(`remove:${address}`);
        await removed.p;
      }
    };
    const sshService = {
      disconnect: async (key) => {
        calls.push(`ssh:${key}`);
      }
    };
    const pending = disconnectSSHEntry(connection, remoteAgentHostService, sshService);
    await timeout(0);
    assert.deepStrictEqual(calls, ["remove:localhost:4321"]);
    removed.complete();
    await pending;
    assert.deepStrictEqual(calls, ["remove:localhost:4321", "ssh:ssh:myserver"]);
  });
  test("uses sshConfigHost-based key when sshConfigHost is set", async () => {
    const calls = [];
    await disconnectSSHEntry(
      makeSSHConfigConnection({ sshConfigHost: "myserver" }),
      { removeRemoteAgentHost: async () => {
      } },
      { disconnect: async (key) => {
        calls.push(key);
      } }
    );
    assert.deepStrictEqual(calls, ["ssh:myserver"]);
  });
  test("uses user@host:port key when sshConfigHost is not set", async () => {
    const calls = [];
    await disconnectSSHEntry(
      {
        type: RemoteAgentHostEntryType.SSH,
        address: "localhost:4321",
        hostName: "myserver.example.com",
        user: "me",
        port: 2222
      },
      { removeRemoteAgentHost: async () => {
      } },
      { disconnect: async (key) => {
        calls.push(key);
      } }
    );
    assert.deepStrictEqual(calls, ["me@myserver.example.com:2222"]);
  });
});
suite("sshConnectionKey", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches the keys the SSH service stores connections under", () => {
    assert.deepStrictEqual({
      configHost: sshConnectionKey({
        type: RemoteAgentHostEntryType.SSH,
        address: "localhost:4321",
        sshConfigHost: "myserver",
        hostName: "ignored"
      }),
      userHostPort: sshConnectionKey({
        type: RemoteAgentHostEntryType.SSH,
        address: "localhost:4321",
        hostName: "myserver.example.com",
        user: "me",
        port: 2222
      }),
      hostOnly: sshConnectionKey({
        type: RemoteAgentHostEntryType.SSH,
        address: "localhost:4321",
        hostName: "myserver.example.com"
      })
    }, {
      configHost: "ssh:myserver",
      userHostPort: "me@myserver.example.com:2222",
      hostOnly: "myserver.example.com@myserver.example.com:22"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxyZW1vdGVBZ2VudEhvc3RcXHRlc3RcXGJyb3dzZXJcXHJlbW90ZUFnZW50SG9zdC5jb250cmlidXRpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEF1dGhlbnRpY2F0aW9uUmVjb3ZlcnksIEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEF1dGguanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgdHlwZSBJQWdlbnRDb25uZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RTU0hDb25uZWN0aW9uLCBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU1NISG9zdEtleURlbmllZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zc2hSZW1vdGVBZ2VudEhvc3QuanMnO1xuaW1wb3J0IHsgQXV0aFJlcXVpcmVkUmVhc29uLCBOb3RpZmljYXRpb25UeXBlLCB0eXBlIElOb3RpZmljYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IHR5cGUgUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgY2F0ZWdvcml6ZVNTSENvbm5lY3RFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9zZXNzaW9uc1RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBkaXNjb25uZWN0U1NIRW50cnksIFJlbW90ZUFnZW50SG9zdENvbnRyaWJ1dGlvbiwgc2hvdWxkUGF1c2VTU0hSZWNvbm5lY3RBZnRlckZhaWx1cmUsIHNzaENvbm5lY3Rpb25LZXksIFNTSFJlY29ubmVjdFN0YXRlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9yZW1vdGVBZ2VudEhvc3QuY29udHJpYnV0aW9uLmpzJztcblxuaW50ZXJmYWNlIElSZW1vdGVBdXRoTm90aWZpY2F0aW9uSGFybmVzcyB7XG5cdF9jb25uZWN0aW9uczogTWFwPHN0cmluZywgeyByZWFkb25seSBhdXRoVG9rZW5DYWNoZTogQWdlbnRIb3N0QXV0aFRva2VuQ2FjaGU7IHJlYWRvbmx5IGF1dGhSZWNvdmVyeTogQWdlbnRIb3N0QXV0aGVudGljYXRpb25SZWNvdmVyeSB9Pjtcblx0X3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZTogeyBnZXRQcm92aWRlcigpOiB1bmRlZmluZWQgfTtcblx0X2luc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdF9jb25uZWN0aW9uQ3VzdG9taXphdGlvbnM6IHsgZ2V0KGFkZHJlc3M6IHN0cmluZyk6IHsgcmVhZG9ubHkgYXV0aGVudGljYXRlPzogKHJlcXVlc3Q6IHsgcmVhZG9ubHkgcmVzb3VyY2U6IHN0cmluZzsgcmVhZG9ubHkgc2NvcGVzPzogcmVhZG9ubHkgc3RyaW5nW107IHJlYWRvbmx5IHRva2VuOiBzdHJpbmcgfSkgPT4gUHJvbWlzZTx7IHJlYWRvbmx5IHJlc291cmNlOiBzdHJpbmc7IHJlYWRvbmx5IHNjb3Blcz86IHJlYWRvbmx5IHN0cmluZ1tdOyByZWFkb25seSB0b2tlbjogc3RyaW5nIH0+IH0gfCB1bmRlZmluZWQgfTtcblx0X2xvZ1NlcnZpY2U6IE51bGxMb2dTZXJ2aWNlO1xuXHRfaGFuZGxlQXV0aGVudGljYXRpb25SZXF1aXJlZE5vdGlmaWNhdGlvbihhZGRyZXNzOiBzdHJpbmcsIGNvbm5lY3Rpb246IFBpY2s8SUFnZW50Q29ubmVjdGlvbiwgJ2F1dGhlbnRpY2F0ZSc+LCBub3RpZmljYXRpb246IElOb3RpZmljYXRpb24pOiB2b2lkO1xufVxuXG5zdWl0ZSgnUmVtb3RlQWdlbnRIb3N0IGF1dGggbm90aWZpY2F0aW9ucycsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZXNlbmRzIHRoZSBjdXJyZW50IHRva2VuIGZvciBhbiBleHBpcmVkIG5vdGlmaWNhdGlvbiByZXNvdXJjZSB0aGF0IGlzIG5vdCBhZHZlcnRpc2VkIGJ5IHJvb3QgYWdlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRnZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlcjogYXN5bmMgKCkgPT4gJ3Rlc3QtcHJvdmlkZXInLFxuXHRcdFx0Z2V0U2Vzc2lvbnM6IGFzeW5jICgpID0+IFt7XG5cdFx0XHRcdGlkOiAnc2Vzc2lvbi1pZCcsXG5cdFx0XHRcdGFjY291bnQ6IHsgaWQ6ICdhY2NvdW50LWlkJywgbGFiZWw6ICdUZXN0IEFjY291bnQnIH0sXG5cdFx0XHRcdHNjb3BlczogWydzZXNzaW9uOnJlYWQnXSxcblx0XHRcdFx0YWNjZXNzVG9rZW46ICdzZXNzaW9uLXRva2VuJyxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBhdXRoZW50aWNhdGVDYWxsczogQXJyYXk8eyByZWFkb25seSByZXNvdXJjZTogc3RyaW5nOyByZWFkb25seSBzY29wZXM/OiByZWFkb25seSBzdHJpbmdbXTsgcmVhZG9ubHkgdG9rZW46IHN0cmluZyB9PiA9IFtdO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB7XG5cdFx0XHRhdXRoZW50aWNhdGU6IGFzeW5jIChwYXJhbXM6IHsgcmVhZG9ubHkgcmVzb3VyY2U6IHN0cmluZzsgcmVhZG9ubHkgc2NvcGVzPzogcmVhZG9ubHkgc3RyaW5nW107IHJlYWRvbmx5IHRva2VuOiBzdHJpbmcgfSkgPT4ge1xuXHRcdFx0XHRhdXRoZW50aWNhdGVDYWxscy5wdXNoKHBhcmFtcyk7XG5cdFx0XHRcdHJldHVybiB7IGF1dGhlbnRpY2F0ZWQ6IHRydWUgfTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBhZGRyZXNzID0gJ3Rlc3QtaG9zdCc7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gT2JqZWN0LmNyZWF0ZShSZW1vdGVBZ2VudEhvc3RDb250cmlidXRpb24ucHJvdG90eXBlKSBhcyBJUmVtb3RlQXV0aE5vdGlmaWNhdGlvbkhhcm5lc3M7XG5cdFx0Y29udHJpYnV0aW9uLl9jb25uZWN0aW9ucyA9IG5ldyBNYXAoW1thZGRyZXNzLCB7IGF1dGhUb2tlbkNhY2hlOiBuZXcgQWdlbnRIb3N0QXV0aFRva2VuQ2FjaGUoKSwgYXV0aFJlY292ZXJ5OiBuZXcgQWdlbnRIb3N0QXV0aGVudGljYXRpb25SZWNvdmVyeSgpIH1dXSk7XG5cdFx0Y29udHJpYnV0aW9uLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgPSB7IGdldFByb3ZpZGVyOiAoKSA9PiB1bmRlZmluZWQgfTtcblx0XHRjb250cmlidXRpb24uX2luc3RhbnRpYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0Y29udHJpYnV0aW9uLl9jb25uZWN0aW9uQ3VzdG9taXphdGlvbnMgPSB7IGdldDogKCkgPT4gdW5kZWZpbmVkIH07XG5cdFx0Y29udHJpYnV0aW9uLl9sb2dTZXJ2aWNlID0gbG9nU2VydmljZTtcblx0XHRjb25zdCByZXNvdXJjZTogUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSA9IHtcblx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20vc2Vzc2lvbicsXG5cdFx0XHRhdXRob3JpemF0aW9uX3NlcnZlcnM6IFsnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJ10sXG5cdFx0XHRzY29wZXNfc3VwcG9ydGVkOiBbJ3Nlc3Npb246cmVhZCddLFxuXHRcdH07XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uOiBJTm90aWZpY2F0aW9uID0ge1xuXHRcdFx0dHlwZTogTm90aWZpY2F0aW9uVHlwZS5BdXRoUmVxdWlyZWQsXG5cdFx0XHRjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLFxuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRyZWFzb246IEF1dGhSZXF1aXJlZFJlYXNvbi5FeHBpcmVkLFxuXHRcdH07XG5cblx0XHRjb250cmlidXRpb24uX2hhbmRsZUF1dGhlbnRpY2F0aW9uUmVxdWlyZWROb3RpZmljYXRpb24oYWRkcmVzcywgY29ubmVjdGlvbiwgbm90aWZpY2F0aW9uKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdXRoZW50aWNhdGVDYWxscywgW3tcblx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20vc2Vzc2lvbicsXG5cdFx0XHRzY29wZXM6IFsnc2Vzc2lvbjpyZWFkJ10sXG5cdFx0XHR0b2tlbjogJ3Nlc3Npb24tdG9rZW4nLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgncmVhdXRoZW50aWNhdGVzIGVhY2ggaG9zdCBpbmRlcGVuZGVudGx5IHdpdGggdGhlIHNhbWUgY3VycmVudCB0b2tlbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uU2VydmljZSwge1xuXHRcdFx0Z2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXI6IGFzeW5jICgpID0+ICd0ZXN0LXByb3ZpZGVyJyxcblx0XHRcdGdldFNlc3Npb25zOiBhc3luYyAoKSA9PiBbeyBpZDogJ3Nlc3Npb24taWQnLCBhY2NvdW50OiB7IGlkOiAnYWNjb3VudC1pZCcsIGxhYmVsOiAnVGVzdCBBY2NvdW50JyB9LCBzY29wZXM6IFsnc2Vzc2lvbjpyZWFkJ10sIGFjY2Vzc1Rva2VuOiAnc2Vzc2lvbi10b2tlbicgfV0sXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IE9iamVjdC5jcmVhdGUoUmVtb3RlQWdlbnRIb3N0Q29udHJpYnV0aW9uLnByb3RvdHlwZSkgYXMgSVJlbW90ZUF1dGhOb3RpZmljYXRpb25IYXJuZXNzO1xuXHRcdGNvbnRyaWJ1dGlvbi5fY29ubmVjdGlvbnMgPSBuZXcgTWFwKFtcblx0XHRcdFsnaG9zdC1vbmUnLCB7IGF1dGhUb2tlbkNhY2hlOiBuZXcgQWdlbnRIb3N0QXV0aFRva2VuQ2FjaGUoKSwgYXV0aFJlY292ZXJ5OiBuZXcgQWdlbnRIb3N0QXV0aGVudGljYXRpb25SZWNvdmVyeSgpIH1dLFxuXHRcdFx0Wydob3N0LXR3bycsIHsgYXV0aFRva2VuQ2FjaGU6IG5ldyBBZ2VudEhvc3RBdXRoVG9rZW5DYWNoZSgpLCBhdXRoUmVjb3Zlcnk6IG5ldyBBZ2VudEhvc3RBdXRoZW50aWNhdGlvblJlY292ZXJ5KCkgfV0sXG5cdFx0XSk7XG5cdFx0Y29udHJpYnV0aW9uLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgPSB7IGdldFByb3ZpZGVyOiAoKSA9PiB1bmRlZmluZWQgfTtcblx0XHRjb250cmlidXRpb24uX2luc3RhbnRpYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0Y29udHJpYnV0aW9uLl9jb25uZWN0aW9uQ3VzdG9taXphdGlvbnMgPSB7IGdldDogKCkgPT4gdW5kZWZpbmVkIH07XG5cdFx0Y29udHJpYnV0aW9uLl9sb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVzb3VyY2U6IFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEgPSB7XG5cdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tL3Nlc3Npb24nLFxuXHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSddLFxuXHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogWydzZXNzaW9uOnJlYWQnXSxcblx0XHR9O1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbjogSU5vdGlmaWNhdGlvbiA9IHsgdHlwZTogTm90aWZpY2F0aW9uVHlwZS5BdXRoUmVxdWlyZWQsIGNoYW5uZWw6ICdhaHAtcm9vdDovLycsIHJlc291cmNlLCByZWFzb246IEF1dGhSZXF1aXJlZFJlYXNvbi5SZXF1aXJlZCB9O1xuXG5cdFx0Y29udHJpYnV0aW9uLl9oYW5kbGVBdXRoZW50aWNhdGlvblJlcXVpcmVkTm90aWZpY2F0aW9uKCdob3N0LW9uZScsIHsgYXV0aGVudGljYXRlOiBhc3luYyByZXF1ZXN0ID0+IHsgY2FsbHMucHVzaChgb25lOiR7cmVxdWVzdC50b2tlbn1gKTsgcmV0dXJuIHsgYXV0aGVudGljYXRlZDogdHJ1ZSB9OyB9IH0sIG5vdGlmaWNhdGlvbik7XG5cdFx0Y29udHJpYnV0aW9uLl9oYW5kbGVBdXRoZW50aWNhdGlvblJlcXVpcmVkTm90aWZpY2F0aW9uKCdob3N0LXR3bycsIHsgYXV0aGVudGljYXRlOiBhc3luYyByZXF1ZXN0ID0+IHsgY2FsbHMucHVzaChgdHdvOiR7cmVxdWVzdC50b2tlbn1gKTsgcmV0dXJuIHsgYXV0aGVudGljYXRlZDogdHJ1ZSB9OyB9IH0sIG5vdGlmaWNhdGlvbik7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsnb25lOnNlc3Npb24tdG9rZW4nLCAndHdvOnNlc3Npb24tdG9rZW4nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb21wdHMgb24gYSBzZWNvbmQgY29tcGxldGVkIHNhbWUtdG9rZW4gY2hhbGxlbmdlIGFuZCBjcmVhdGVzIGEgZnJlc2ggdHJhbnNmb3JtZWQgZW52ZWxvcGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvblNlcnZpY2UsIHtcblx0XHRcdGdldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yU2VydmVyOiBhc3luYyAoKSA9PiAndGVzdC1wcm92aWRlcicsXG5cdFx0XHRnZXRTZXNzaW9uczogYXN5bmMgKCkgPT4gW3sgaWQ6ICdzZXNzaW9uLWlkJywgYWNjb3VudDogeyBpZDogJ2FjY291bnQtaWQnLCBsYWJlbDogJ1Rlc3QgQWNjb3VudCcgfSwgc2NvcGVzOiBbJ3Nlc3Npb246cmVhZCddLCBhY2Nlc3NUb2tlbjogJ3Nlc3Npb24tdG9rZW4nIH1dLFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRsZXQgcHJvbXB0Q291bnQgPSAwO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCB7XG5cdFx0XHRleGVjdXRlQ29tbWFuZDogYXN5bmMgPFI+KCkgPT4ge1xuXHRcdFx0XHRwcm9tcHRDb3VudCsrO1xuXHRcdFx0XHRyZXR1cm4geyBzdWNjZXNzOiB0cnVlIH0gYXMgUjtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgZW52ZWxvcGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBlbnZlbG9wZU51bWJlciA9IDA7XG5cdFx0Y29uc3QgYWRkcmVzcyA9ICdzZWFsZWQtaG9zdCc7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gT2JqZWN0LmNyZWF0ZShSZW1vdGVBZ2VudEhvc3RDb250cmlidXRpb24ucHJvdG90eXBlKSBhcyBJUmVtb3RlQXV0aE5vdGlmaWNhdGlvbkhhcm5lc3M7XG5cdFx0Y29udHJpYnV0aW9uLl9jb25uZWN0aW9ucyA9IG5ldyBNYXAoW1thZGRyZXNzLCB7IGF1dGhUb2tlbkNhY2hlOiBuZXcgQWdlbnRIb3N0QXV0aFRva2VuQ2FjaGUoKSwgYXV0aFJlY292ZXJ5OiBuZXcgQWdlbnRIb3N0QXV0aGVudGljYXRpb25SZWNvdmVyeSgpIH1dXSk7XG5cdFx0Y29udHJpYnV0aW9uLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgPSB7IGdldFByb3ZpZGVyOiAoKSA9PiB1bmRlZmluZWQgfTtcblx0XHRjb250cmlidXRpb24uX2luc3RhbnRpYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0Y29udHJpYnV0aW9uLl9jb25uZWN0aW9uQ3VzdG9taXphdGlvbnMgPSB7XG5cdFx0XHRnZXQ6ICgpID0+ICh7XG5cdFx0XHRcdGF1dGhlbnRpY2F0ZTogYXN5bmMgcmVxdWVzdCA9PiAoeyAuLi5yZXF1ZXN0LCB0b2tlbjogYCR7cmVxdWVzdC50b2tlbn06c2VhbGVkLSR7KytlbnZlbG9wZU51bWJlcn1gIH0pLFxuXHRcdFx0fSksXG5cdFx0fTtcblx0XHRjb250cmlidXRpb24uX2xvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCByZXNvdXJjZTogUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSA9IHtcblx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20vc2Vzc2lvbicsXG5cdFx0XHRhdXRob3JpemF0aW9uX3NlcnZlcnM6IFsnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJ10sXG5cdFx0XHRzY29wZXNfc3VwcG9ydGVkOiBbJ3Nlc3Npb246cmVhZCddLFxuXHRcdH07XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uOiBJTm90aWZpY2F0aW9uID0geyB0eXBlOiBOb3RpZmljYXRpb25UeXBlLkF1dGhSZXF1aXJlZCwgY2hhbm5lbDogJ2FocC1yb290Oi8vJywgcmVzb3VyY2UsIHJlYXNvbjogQXV0aFJlcXVpcmVkUmVhc29uLkV4cGlyZWQgfTtcblx0XHRjb25zdCBjb25uZWN0aW9uOiBQaWNrPElBZ2VudENvbm5lY3Rpb24sICdhdXRoZW50aWNhdGUnPiA9IHsgYXV0aGVudGljYXRlOiBhc3luYyByZXF1ZXN0ID0+IHsgZW52ZWxvcGVzLnB1c2gocmVxdWVzdC50b2tlbik7IHJldHVybiB7IGF1dGhlbnRpY2F0ZWQ6IHRydWUgfTsgfSB9O1xuXG5cdFx0Y29udHJpYnV0aW9uLl9oYW5kbGVBdXRoZW50aWNhdGlvblJlcXVpcmVkTm90aWZpY2F0aW9uKGFkZHJlc3MsIGNvbm5lY3Rpb24sIG5vdGlmaWNhdGlvbik7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb250cmlidXRpb24uX2hhbmRsZUF1dGhlbnRpY2F0aW9uUmVxdWlyZWROb3RpZmljYXRpb24oYWRkcmVzcywgY29ubmVjdGlvbiwgbm90aWZpY2F0aW9uKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGVudmVsb3BlcywgcHJvbXB0Q291bnQgfSwge1xuXHRcdFx0ZW52ZWxvcGVzOiBbJ3Nlc3Npb24tdG9rZW46c2VhbGVkLTEnLCAnc2Vzc2lvbi10b2tlbjpzZWFsZWQtMiddLFxuXHRcdFx0cHJvbXB0Q291bnQ6IDEsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdTU0hSZWNvbm5lY3RTdGF0ZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzY2hlZHVsZVJldHJ5IGZpcmVzIHRoZSBoYW5kbGVyIGFmdGVyIHRoZSByZXF1ZXN0ZWQgZGVsYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gc3RvcmUuYWRkKG5ldyBTU0hSZWNvbm5lY3RTdGF0ZSgpKTtcblx0XHRcdGxldCBmaXJlZCA9IDA7XG5cdFx0XHRzdGF0ZS5zY2hlZHVsZVJldHJ5KDEwMDAsICgpID0+IGZpcmVkKyspO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuaGFzUGVuZGluZ1RpbWVyLCB0cnVlKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoNTAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZCwgMCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDYwMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyZWQsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoYXNQZW5kaW5nVGltZXIgYmVjb21lcyBmYWxzZSBvbmNlIHRoZSBoYW5kbGVyIGhhcyBydW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbiBndWFyZCBmb3IgdGhlIFBSLWZlZWRiYWNrIGZpeDogdGhlIHRpbWVyIGRpc3Bvc2FibGUgbXVzdFxuXHRcdC8vIGJlIGNsZWFyZWQgaW5zaWRlIHNjaGVkdWxlUmV0cnkncyB0aWNrIHNvIHRoYXQgb2JzZXJ2ZXJzIHRoYXQgY2hlY2tcblx0XHQvLyBoYXNQZW5kaW5nVGltZXIgYWZ0ZXIgdGhlIGhhbmRsZXIgcnVucyBzZWUgdGhlIHJpZ2h0IHZhbHVlLlxuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHN0b3JlLmFkZChuZXcgU1NIUmVjb25uZWN0U3RhdGUoKSk7XG5cdFx0XHRzdGF0ZS5zY2hlZHVsZVJldHJ5KDEwMDAsICgpID0+IHsgLyogbm8gZm9sbG93LXVwICovIH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dCgxMTAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5oYXNQZW5kaW5nVGltZXIsIGZhbHNlLCAndGltZXIgc2hvdWxkIGJlIGNsZWFyZWQgYWZ0ZXIgZmlyaW5nJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbFRpbWVyIHByZXZlbnRzIHRoZSBoYW5kbGVyIGZyb20gZmlyaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHN0b3JlLmFkZChuZXcgU1NIUmVjb25uZWN0U3RhdGUoKSk7XG5cdFx0XHRsZXQgZmlyZWQgPSAwO1xuXHRcdFx0c3RhdGUuc2NoZWR1bGVSZXRyeSgxMDAwLCAoKSA9PiBmaXJlZCsrKTtcblx0XHRcdHN0YXRlLmNhbmNlbFRpbWVyKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuaGFzUGVuZGluZ1RpbWVyLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDIwMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcmVkLCAwKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2NoZWR1bGluZyBhIHNlY29uZCByZXRyeSByZXBsYWNlcyB0aGUgZmlyc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gTXV0YWJsZURpc3Bvc2FibGUgY29udHJhY3Q6IGFzc2lnbmluZyBhIG5ldyB2YWx1ZSBkaXNwb3NlcyB0aGUgb2xkLlxuXHRcdC8vIElmIHR3byByZXRyaWVzIHdlcmUgc2NoZWR1bGVkIHNpbXVsdGFuZW91c2x5IHRoZSBjb250cmlidXRpb24gd291bGRcblx0XHQvLyBkb3VibGUtZmlyZSByZWNvbm5lY3QgYXR0ZW1wdHMgYW5kIGluZmxhdGUgdGhlIGF0dGVtcHQgY291bnRlci5cblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzdG9yZS5hZGQobmV3IFNTSFJlY29ubmVjdFN0YXRlKCkpO1xuXHRcdFx0bGV0IGZpcnN0RmlyZWQgPSAwO1xuXHRcdFx0bGV0IHNlY29uZEZpcmVkID0gMDtcblx0XHRcdHN0YXRlLnNjaGVkdWxlUmV0cnkoNTAwMCwgKCkgPT4gZmlyc3RGaXJlZCsrKTtcblx0XHRcdHN0YXRlLnNjaGVkdWxlUmV0cnkoMTAwMCwgKCkgPT4gc2Vjb25kRmlyZWQrKyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDYwMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0RmlyZWQsIDAsICdyZXBsYWNlZCB0aW1lciBtdXN0IG5vdCBmaXJlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kRmlyZWQsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NpbmcgdGhlIHN0YXRlIGNhbmNlbHMgYSBwZW5kaW5nIHJldHJ5IHRpbWVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoaXMgaXMgdGhlIHNhZmV0eSBuZXQgZm9yIHRoZSBEaXNwb3NhYmxlTWFwIHRoYXQgb3ducyB0aGVzZSBzdGF0ZXM6XG5cdFx0Ly8gd2hlbiB0aGUgY29udHJpYnV0aW9uIGlzIGRpc3Bvc2VkIChvciBhIGhvc3QgaXMgcmVtb3ZlZCkgdGhlIGVudHJ5J3Ncblx0XHQvLyBwZW5kaW5nIHRpbWVyIG11c3QgYmUgY2FuY2VsbGVkIHNvIHdlIGRvbid0IGZpcmUgcmVjb25uZWN0IGF0dGVtcHRzXG5cdFx0Ly8gYWdhaW5zdCB0b3JuLWRvd24gc2VydmljZXMuXG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gbmV3IFNTSFJlY29ubmVjdFN0YXRlKCk7XG5cdFx0XHRsZXQgZmlyZWQgPSAwO1xuXHRcdFx0c3RhdGUuc2NoZWR1bGVSZXRyeSgxMDAwLCAoKSA9PiBmaXJlZCsrKTtcblx0XHRcdHN0YXRlLmRpc3Bvc2UoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMjAwMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyZWQsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNldEZvclJlc3VtZSBjbGVhcnMgdGhlIHRpbWVyIGFuZCB6ZXJvcyBhdHRlbXB0cy9wYXVzZWQgc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gc3RvcmUuYWRkKG5ldyBTU0hSZWNvbm5lY3RTdGF0ZSgpKTtcblx0XHRcdGxldCBmaXJlZCA9IDA7XG5cdFx0XHRzdGF0ZS5hdHRlbXB0cyA9IDc7XG5cdFx0XHRzdGF0ZS5wYXVzZWQgPSB0cnVlO1xuXHRcdFx0c3RhdGUucmVxdWlyZXNVc2VySW5pdGlhdGVkUmVzdW1lID0gdHJ1ZTtcblx0XHRcdHN0YXRlLnNjaGVkdWxlUmV0cnkoMTAwMCwgKCkgPT4gZmlyZWQrKyk7XG5cblx0XHRcdHN0YXRlLnJlc2V0Rm9yUmVzdW1lKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0YXR0ZW1wdHM6IHN0YXRlLmF0dGVtcHRzLFxuXHRcdFx0XHRwYXVzZWQ6IHN0YXRlLnBhdXNlZCxcblx0XHRcdFx0cmVxdWlyZXNVc2VySW5pdGlhdGVkUmVzdW1lOiBzdGF0ZS5yZXF1aXJlc1VzZXJJbml0aWF0ZWRSZXN1bWUsXG5cdFx0XHRcdGhhc1BlbmRpbmdUaW1lcjogc3RhdGUuaGFzUGVuZGluZ1RpbWVyLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRhdHRlbXB0czogMCxcblx0XHRcdFx0cGF1c2VkOiBmYWxzZSxcblx0XHRcdFx0cmVxdWlyZXNVc2VySW5pdGlhdGVkUmVzdW1lOiBmYWxzZSxcblx0XHRcdFx0aGFzUGVuZGluZ1RpbWVyOiBmYWxzZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDIwMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcmVkLCAwLCAncGVuZGluZyByZXRyeSBtdXN0IGJlIGNhbmNlbGxlZCBieSByZXNldEZvclJlc3VtZScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdob3N0IGtleSBkZW5pYWwgcmVxdWlyZXMgYW4gZXhwbGljaXQgcmVzdW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gc3RvcmUuYWRkKG5ldyBTU0hSZWNvbm5lY3RTdGF0ZSgpKTtcblx0XHRzdGF0ZS5hdHRlbXB0cyA9IDE7XG5cdFx0c3RhdGUucGF1c2VkID0gdHJ1ZTtcblx0XHRzdGF0ZS5yZXF1aXJlc1VzZXJJbml0aWF0ZWRSZXN1bWUgPSB0cnVlO1xuXG5cdFx0Y29uc3QgYXV0b21hdGljUmVzdW1lID0gc3RhdGUucmVzdW1lQXV0b21hdGljYWxseSgpO1xuXHRcdGNvbnN0IGFmdGVyQXV0b21hdGljUmVzdW1lID0ge1xuXHRcdFx0YXR0ZW1wdHM6IHN0YXRlLmF0dGVtcHRzLFxuXHRcdFx0cGF1c2VkOiBzdGF0ZS5wYXVzZWQsXG5cdFx0XHRyZXF1aXJlc1VzZXJJbml0aWF0ZWRSZXN1bWU6IHN0YXRlLnJlcXVpcmVzVXNlckluaXRpYXRlZFJlc3VtZSxcblx0XHR9O1xuXHRcdHN0YXRlLnJlc2V0Rm9yUmVzdW1lKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGF1dG9tYXRpY1Jlc3VtZSxcblx0XHRcdGFmdGVyQXV0b21hdGljUmVzdW1lLFxuXHRcdFx0YWZ0ZXJFeHBsaWNpdFJlc3VtZToge1xuXHRcdFx0XHRhdHRlbXB0czogc3RhdGUuYXR0ZW1wdHMsXG5cdFx0XHRcdHBhdXNlZDogc3RhdGUucGF1c2VkLFxuXHRcdFx0XHRyZXF1aXJlc1VzZXJJbml0aWF0ZWRSZXN1bWU6IHN0YXRlLnJlcXVpcmVzVXNlckluaXRpYXRlZFJlc3VtZSxcblx0XHRcdH0sXG5cdFx0fSwge1xuXHRcdFx0YXV0b21hdGljUmVzdW1lOiBmYWxzZSxcblx0XHRcdGFmdGVyQXV0b21hdGljUmVzdW1lOiB7XG5cdFx0XHRcdGF0dGVtcHRzOiAxLFxuXHRcdFx0XHRwYXVzZWQ6IHRydWUsXG5cdFx0XHRcdHJlcXVpcmVzVXNlckluaXRpYXRlZFJlc3VtZTogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHRhZnRlckV4cGxpY2l0UmVzdW1lOiB7XG5cdFx0XHRcdGF0dGVtcHRzOiAwLFxuXHRcdFx0XHRwYXVzZWQ6IGZhbHNlLFxuXHRcdFx0XHRyZXF1aXJlc1VzZXJJbml0aWF0ZWRSZXN1bWU6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3Nob3VsZFBhdXNlU1NIUmVjb25uZWN0QWZ0ZXJGYWlsdXJlJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdwYXVzZXMgcmVjb25uZWN0IGFmdGVyIGNhbmNlbGxhdGlvbiBvciBob3N0IGtleSBkZW5pYWwgYnV0IG5vdCBhZnRlciByZWd1bGFyIGZhaWx1cmVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2FuY2VsbGF0aW9uOiBzaG91bGRQYXVzZVNTSFJlY29ubmVjdEFmdGVyRmFpbHVyZShuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSksXG5cdFx0XHRob3N0S2V5RGVuaWFsOiBzaG91bGRQYXVzZVNTSFJlY29ubmVjdEFmdGVyRmFpbHVyZShuZXcgU1NISG9zdEtleURlbmllZEVycm9yKCd0ZXN0LWhvc3QnKSksXG5cdFx0XHRyZWd1bGFyRXJyb3I6IHNob3VsZFBhdXNlU1NIUmVjb25uZWN0QWZ0ZXJGYWlsdXJlKG5ldyBFcnJvcignYm9vbScpKSxcblx0XHR9LCB7XG5cdFx0XHRjYW5jZWxsYXRpb246IHRydWUsXG5cdFx0XHRob3N0S2V5RGVuaWFsOiB0cnVlLFxuXHRcdFx0cmVndWxhckVycm9yOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2NhdGVnb3JpemVTU0hDb25uZWN0RXJyb3InLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JldHVybnMgYm91bmRlZCBjYXRlZ29yaWVzIHdpdGhvdXQgbG9nZ2luZyBlcnJvciBtZXNzYWdlcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNhbmNlbGxhdGlvbjogY2F0ZWdvcml6ZVNTSENvbm5lY3RFcnJvcihuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSksXG5cdFx0XHRob3N0S2V5RGVuaWFsOiBjYXRlZ29yaXplU1NIQ29ubmVjdEVycm9yKG5ldyBTU0hIb3N0S2V5RGVuaWVkRXJyb3IoJ3Rlc3QtaG9zdCcpKSxcblx0XHRcdGF1dGhlbnRpY2F0aW9uOiBjYXRlZ29yaXplU1NIQ29ubmVjdEVycm9yKG5ldyBFcnJvcignQWxsIGNvbmZpZ3VyZWQgYXV0aGVudGljYXRpb24gbWV0aG9kcyBmYWlsZWQnKSksXG5cdFx0XHRuZXR3b3JrOiBjYXRlZ29yaXplU1NIQ29ubmVjdEVycm9yKG5ldyBFcnJvcignY29ubmVjdCBFVElNRURPVVQnKSksXG5cdFx0XHRvdGhlcjogY2F0ZWdvcml6ZVNTSENvbm5lY3RFcnJvcihuZXcgRXJyb3IoJ3JlbW90ZSBzZXR1cCBmYWlsZWQnKSksXG5cdFx0fSwge1xuXHRcdFx0Y2FuY2VsbGF0aW9uOiAnY2FuY2VsbGVkJyxcblx0XHRcdGhvc3RLZXlEZW5pYWw6ICdob3N0S2V5RGVuaWVkJyxcblx0XHRcdGF1dGhlbnRpY2F0aW9uOiAnYXV0aGVudGljYXRpb24nLFxuXHRcdFx0bmV0d29yazogJ25ldHdvcmsnLFxuXHRcdFx0b3RoZXI6ICdvdGhlcicsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdkaXNjb25uZWN0U1NIRW50cnknLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIG1ha2VTU0hDb25maWdDb25uZWN0aW9uKG92ZXJyaWRlczogUGFydGlhbDxJUmVtb3RlQWdlbnRIb3N0U1NIQ29ubmVjdGlvbj4gPSB7fSk6IElSZW1vdGVBZ2VudEhvc3RTU0hDb25uZWN0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLlNTSCxcblx0XHRcdGFkZHJlc3M6ICdsb2NhbGhvc3Q6NDMyMScsXG5cdFx0XHRzc2hDb25maWdIb3N0OiAnbXlzZXJ2ZXInLFxuXHRcdFx0aG9zdE5hbWU6ICdteXNlcnZlci5leGFtcGxlLmNvbScsXG5cdFx0XHQuLi5vdmVycmlkZXMsXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ3JlbW92ZXMgdGhlIGVudHJ5IGZyb20gY29uZmlndXJlZCBzdG9yYWdlIEJFRk9SRSB0ZWFyaW5nIGRvd24gdGhlIFNTSCB0dW5uZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbiBndWFyZCBmb3IgdGhlIFgtYnV0dG9uIHBpY2tlciBmaXguIGBfc3NoU2VydmljZS5kaXNjb25uZWN0YFxuXHRcdC8vIGZpcmVzIGBvbkRpZENoYW5nZUNvbm5lY3Rpb25zYCBzeW5jaHJvbm91c2x5LCB3aGljaCB0aGUgY29udHJpYnV0aW9uXG5cdFx0Ly8gdHJhbnNsYXRlcyBpbnRvIGBfcmVjb25jaWxlYCBcdTIxOTIgYF9yZWNvbm5lY3RTU0hFbnRyaWVzYC4gSWYgdGhlIGVudHJ5XG5cdFx0Ly8gaXMgc3RpbGwgaW4gY29uZmlndXJlZCBzdG9yYWdlIGF0IHRoYXQgcG9pbnQsIHRoZSBhdXRvLXJlY29ubmVjdFxuXHRcdC8vIHBhdGggaW1tZWRpYXRlbHkgcmVjb25uZWN0cyB0aGUgaG9zdCB3ZSBqdXN0IHRvbGQgaXQgdG8gZGlzY29ubmVjdFxuXHRcdC8vIChhbmQgb24gdGhlIG5leHQgd2luZG93IHJlbG9hZCwgdGhlIHBlcnNpc3RlZCBlbnRyeSByZWNvbm5lY3RzIHRvbykuXG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IG1ha2VTU0hDb25maWdDb25uZWN0aW9uKCk7XG5cblx0XHQvLyBCbG9jayByZW1vdmVSZW1vdGVBZ2VudEhvc3Qgc28gd2UgY2FuIHByb3ZlIGRpc2Nvbm5lY3Qgd2FpdHMgZm9yIGl0LlxuXHRcdGNvbnN0IHJlbW92ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cblx0XHRjb25zdCByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlID0ge1xuXHRcdFx0cmVtb3ZlUmVtb3RlQWdlbnRIb3N0OiBhc3luYyAoYWRkcmVzczogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNhbGxzLnB1c2goYHJlbW92ZToke2FkZHJlc3N9YCk7XG5cdFx0XHRcdGF3YWl0IHJlbW92ZWQucDtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBzc2hTZXJ2aWNlID0ge1xuXHRcdFx0ZGlzY29ubmVjdDogYXN5bmMgKGtleTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNhbGxzLnB1c2goYHNzaDoke2tleX1gKTtcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHBlbmRpbmcgPSBkaXNjb25uZWN0U1NIRW50cnkoY29ubmVjdGlvbiwgcmVtb3RlQWdlbnRIb3N0U2VydmljZSwgc3NoU2VydmljZSk7XG5cblx0XHQvLyBHaXZlIG1pY3JvdGFza3MgYSBjaGFuY2UgdG8gZHJhaW4uIHNzaCBkaXNjb25uZWN0IG11c3QgTk9UIGhhdmUgcnVuIHlldFxuXHRcdC8vIGJlY2F1c2UgcmVtb3ZlUmVtb3RlQWdlbnRIb3N0IGlzIHN0aWxsIHBlbmRpbmcuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbJ3JlbW92ZTpsb2NhbGhvc3Q6NDMyMSddKTtcblxuXHRcdHJlbW92ZWQuY29tcGxldGUoKTtcblx0XHRhd2FpdCBwZW5kaW5nO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWydyZW1vdmU6bG9jYWxob3N0OjQzMjEnLCAnc3NoOnNzaDpteXNlcnZlciddKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBzc2hDb25maWdIb3N0LWJhc2VkIGtleSB3aGVuIHNzaENvbmZpZ0hvc3QgaXMgc2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGF3YWl0IGRpc2Nvbm5lY3RTU0hFbnRyeShcblx0XHRcdG1ha2VTU0hDb25maWdDb25uZWN0aW9uKHsgc3NoQ29uZmlnSG9zdDogJ215c2VydmVyJyB9KSxcblx0XHRcdHsgcmVtb3ZlUmVtb3RlQWdlbnRIb3N0OiBhc3luYyAoKSA9PiB7IC8qIG5vb3AgKi8gfSB9LFxuXHRcdFx0eyBkaXNjb25uZWN0OiBhc3luYyAoa2V5OiBzdHJpbmcpID0+IHsgY2FsbHMucHVzaChrZXkpOyB9IH0sXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbJ3NzaDpteXNlcnZlciddKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyB1c2VyQGhvc3Q6cG9ydCBrZXkgd2hlbiBzc2hDb25maWdIb3N0IGlzIG5vdCBzZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0YXdhaXQgZGlzY29ubmVjdFNTSEVudHJ5KFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NILFxuXHRcdFx0XHRhZGRyZXNzOiAnbG9jYWxob3N0OjQzMjEnLFxuXHRcdFx0XHRob3N0TmFtZTogJ215c2VydmVyLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0dXNlcjogJ21lJyxcblx0XHRcdFx0cG9ydDogMjIyMixcblx0XHRcdH0sXG5cdFx0XHR7IHJlbW92ZVJlbW90ZUFnZW50SG9zdDogYXN5bmMgKCkgPT4geyAvKiBub29wICovIH0gfSxcblx0XHRcdHsgZGlzY29ubmVjdDogYXN5bmMgKGtleTogc3RyaW5nKSA9PiB7IGNhbGxzLnB1c2goa2V5KTsgfSB9LFxuXHRcdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWydtZUBteXNlcnZlci5leGFtcGxlLmNvbToyMjIyJ10pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnc3NoQ29ubmVjdGlvbktleScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbWF0Y2hlcyB0aGUga2V5cyB0aGUgU1NIIHNlcnZpY2Ugc3RvcmVzIGNvbm5lY3Rpb25zIHVuZGVyJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29uZmlnSG9zdDogc3NoQ29ubmVjdGlvbktleSh7XG5cdFx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5TU0gsXG5cdFx0XHRcdGFkZHJlc3M6ICdsb2NhbGhvc3Q6NDMyMScsXG5cdFx0XHRcdHNzaENvbmZpZ0hvc3Q6ICdteXNlcnZlcicsXG5cdFx0XHRcdGhvc3ROYW1lOiAnaWdub3JlZCcsXG5cdFx0XHR9KSxcblx0XHRcdHVzZXJIb3N0UG9ydDogc3NoQ29ubmVjdGlvbktleSh7XG5cdFx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5TU0gsXG5cdFx0XHRcdGFkZHJlc3M6ICdsb2NhbGhvc3Q6NDMyMScsXG5cdFx0XHRcdGhvc3ROYW1lOiAnbXlzZXJ2ZXIuZXhhbXBsZS5jb20nLFxuXHRcdFx0XHR1c2VyOiAnbWUnLFxuXHRcdFx0XHRwb3J0OiAyMjIyLFxuXHRcdFx0fSksXG5cdFx0XHRob3N0T25seTogc3NoQ29ubmVjdGlvbktleSh7XG5cdFx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5TU0gsXG5cdFx0XHRcdGFkZHJlc3M6ICdsb2NhbGhvc3Q6NDMyMScsXG5cdFx0XHRcdGhvc3ROYW1lOiAnbXlzZXJ2ZXIuZXhhbXBsZS5jb20nLFxuXHRcdFx0fSksXG5cdFx0fSwge1xuXHRcdFx0Y29uZmlnSG9zdDogJ3NzaDpteXNlcnZlcicsXG5cdFx0XHR1c2VySG9zdFBvcnQ6ICdtZUBteXNlcnZlci5leGFtcGxlLmNvbToyMjIyJyxcblx0XHRcdGhvc3RPbmx5OiAnbXlzZXJ2ZXIuZXhhbXBsZS5jb21AbXlzZXJ2ZXIuZXhhbXBsZS5jb206MjInLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQ0FBaUMsK0JBQStCO0FBQ3pFLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQXdDLGdDQUFnQztBQUN4RSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQix3QkFBNEM7QUFFekUsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG9CQUFvQiw2QkFBNkIscUNBQXFDLGtCQUFrQix5QkFBeUI7QUFXMUksTUFBTSxzQ0FBc0MsTUFBTTtBQUNqRCxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELE9BQUssd0dBQXdHLFlBQVk7QUFDeEgsVUFBTSx1QkFBdUIsTUFBTSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDckUseUJBQXFCLEtBQUssd0JBQXdCO0FBQUEsTUFDakQsa0NBQWtDLFlBQVk7QUFBQSxNQUM5QyxhQUFhLFlBQVksQ0FBQztBQUFBLFFBQ3pCLElBQUk7QUFBQSxRQUNKLFNBQVMsRUFBRSxJQUFJLGNBQWMsT0FBTyxlQUFlO0FBQUEsUUFDbkQsUUFBUSxDQUFDLGNBQWM7QUFBQSxRQUN2QixhQUFhO0FBQUEsTUFDZCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsVUFBTSxhQUFhLElBQUksZUFBZTtBQUN0Qyx5QkFBcUIsS0FBSyxhQUFhLFVBQVU7QUFDakQsVUFBTSxvQkFBdUgsQ0FBQztBQUM5SCxVQUFNLGFBQWE7QUFBQSxNQUNsQixjQUFjLE9BQU8sV0FBdUc7QUFDM0gsMEJBQWtCLEtBQUssTUFBTTtBQUM3QixlQUFPLEVBQUUsZUFBZSxLQUFLO0FBQUEsTUFDOUI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxVQUFVO0FBQ2hCLFVBQU0sZUFBZSxPQUFPLE9BQU8sNEJBQTRCLFNBQVM7QUFDeEUsaUJBQWEsZUFBZSxvQkFBSSxJQUFJLENBQUMsQ0FBQyxTQUFTLEVBQUUsZ0JBQWdCLElBQUksd0JBQXdCLEdBQUcsY0FBYyxJQUFJLGdDQUFnQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBQ3ZKLGlCQUFhLDRCQUE0QixFQUFFLGFBQWEsTUFBTSxPQUFVO0FBQ3hFLGlCQUFhLHdCQUF3QjtBQUNyQyxpQkFBYSw0QkFBNEIsRUFBRSxLQUFLLE1BQU0sT0FBVTtBQUNoRSxpQkFBYSxjQUFjO0FBQzNCLFVBQU0sV0FBc0M7QUFBQSxNQUMzQyxVQUFVO0FBQUEsTUFDVix1QkFBdUIsQ0FBQywwQkFBMEI7QUFBQSxNQUNsRCxrQkFBa0IsQ0FBQyxjQUFjO0FBQUEsSUFDbEM7QUFDQSxVQUFNLGVBQThCO0FBQUEsTUFDbkMsTUFBTSxpQkFBaUI7QUFBQSxNQUN2QixTQUFTO0FBQUEsTUFDVDtBQUFBLE1BQ0EsUUFBUSxtQkFBbUI7QUFBQSxJQUM1QjtBQUVBLGlCQUFhLDBDQUEwQyxTQUFTLFlBQVksWUFBWTtBQUN4RixVQUFNLFFBQVEsQ0FBQztBQUVmLFdBQU8sZ0JBQWdCLG1CQUFtQixDQUFDO0FBQUEsTUFDMUMsVUFBVTtBQUFBLE1BQ1YsUUFBUSxDQUFDLGNBQWM7QUFBQSxNQUN2QixPQUFPO0FBQUEsSUFDUixDQUFDLENBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxPQUFLLHVFQUF1RSxZQUFZO0FBQ3ZGLFVBQU0sdUJBQXVCLE1BQU0sSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBQ3JFLHlCQUFxQixLQUFLLHdCQUF3QjtBQUFBLE1BQ2pELGtDQUFrQyxZQUFZO0FBQUEsTUFDOUMsYUFBYSxZQUFZLENBQUMsRUFBRSxJQUFJLGNBQWMsU0FBUyxFQUFFLElBQUksY0FBYyxPQUFPLGVBQWUsR0FBRyxRQUFRLENBQUMsY0FBYyxHQUFHLGFBQWEsZ0JBQWdCLENBQUM7QUFBQSxJQUM3SixDQUFDO0FBQ0QseUJBQXFCLEtBQUssYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUMzRCxVQUFNLFFBQWtCLENBQUM7QUFDekIsVUFBTSxlQUFlLE9BQU8sT0FBTyw0QkFBNEIsU0FBUztBQUN4RSxpQkFBYSxlQUFlLG9CQUFJLElBQUk7QUFBQSxNQUNuQyxDQUFDLFlBQVksRUFBRSxnQkFBZ0IsSUFBSSx3QkFBd0IsR0FBRyxjQUFjLElBQUksZ0NBQWdDLEVBQUUsQ0FBQztBQUFBLE1BQ25ILENBQUMsWUFBWSxFQUFFLGdCQUFnQixJQUFJLHdCQUF3QixHQUFHLGNBQWMsSUFBSSxnQ0FBZ0MsRUFBRSxDQUFDO0FBQUEsSUFDcEgsQ0FBQztBQUNELGlCQUFhLDRCQUE0QixFQUFFLGFBQWEsTUFBTSxPQUFVO0FBQ3hFLGlCQUFhLHdCQUF3QjtBQUNyQyxpQkFBYSw0QkFBNEIsRUFBRSxLQUFLLE1BQU0sT0FBVTtBQUNoRSxpQkFBYSxjQUFjLElBQUksZUFBZTtBQUM5QyxVQUFNLFdBQXNDO0FBQUEsTUFDM0MsVUFBVTtBQUFBLE1BQ1YsdUJBQXVCLENBQUMsMEJBQTBCO0FBQUEsTUFDbEQsa0JBQWtCLENBQUMsY0FBYztBQUFBLElBQ2xDO0FBQ0EsVUFBTSxlQUE4QixFQUFFLE1BQU0saUJBQWlCLGNBQWMsU0FBUyxlQUFlLFVBQVUsUUFBUSxtQkFBbUIsU0FBUztBQUVqSixpQkFBYSwwQ0FBMEMsWUFBWSxFQUFFLGNBQWMsT0FBTSxZQUFXO0FBQUUsWUFBTSxLQUFLLE9BQU8sUUFBUSxLQUFLLEVBQUU7QUFBRyxhQUFPLEVBQUUsZUFBZSxLQUFLO0FBQUEsSUFBRyxFQUFFLEdBQUcsWUFBWTtBQUMzTCxpQkFBYSwwQ0FBMEMsWUFBWSxFQUFFLGNBQWMsT0FBTSxZQUFXO0FBQUUsWUFBTSxLQUFLLE9BQU8sUUFBUSxLQUFLLEVBQUU7QUFBRyxhQUFPLEVBQUUsZUFBZSxLQUFLO0FBQUEsSUFBRyxFQUFFLEdBQUcsWUFBWTtBQUMzTCxVQUFNLFFBQVEsQ0FBQztBQUVmLFdBQU8sZ0JBQWdCLE9BQU8sQ0FBQyxxQkFBcUIsbUJBQW1CLENBQUM7QUFBQSxFQUN6RSxDQUFDO0FBRUQsT0FBSywrRkFBK0YsWUFBWTtBQUMvRyxVQUFNLHVCQUF1QixNQUFNLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUNyRSx5QkFBcUIsS0FBSyx3QkFBd0I7QUFBQSxNQUNqRCxrQ0FBa0MsWUFBWTtBQUFBLE1BQzlDLGFBQWEsWUFBWSxDQUFDLEVBQUUsSUFBSSxjQUFjLFNBQVMsRUFBRSxJQUFJLGNBQWMsT0FBTyxlQUFlLEdBQUcsUUFBUSxDQUFDLGNBQWMsR0FBRyxhQUFhLGdCQUFnQixDQUFDO0FBQUEsSUFDN0osQ0FBQztBQUNELHlCQUFxQixLQUFLLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDM0QsUUFBSSxjQUFjO0FBQ2xCLHlCQUFxQixLQUFLLGlCQUFpQjtBQUFBLE1BQzFDLGdCQUFnQixZQUFlO0FBQzlCO0FBQ0EsZUFBTyxFQUFFLFNBQVMsS0FBSztBQUFBLE1BQ3hCO0FBQUEsSUFDRCxDQUFDO0FBQ0QsVUFBTSxZQUFzQixDQUFDO0FBQzdCLFFBQUksaUJBQWlCO0FBQ3JCLFVBQU0sVUFBVTtBQUNoQixVQUFNLGVBQWUsT0FBTyxPQUFPLDRCQUE0QixTQUFTO0FBQ3hFLGlCQUFhLGVBQWUsb0JBQUksSUFBSSxDQUFDLENBQUMsU0FBUyxFQUFFLGdCQUFnQixJQUFJLHdCQUF3QixHQUFHLGNBQWMsSUFBSSxnQ0FBZ0MsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUN2SixpQkFBYSw0QkFBNEIsRUFBRSxhQUFhLE1BQU0sT0FBVTtBQUN4RSxpQkFBYSx3QkFBd0I7QUFDckMsaUJBQWEsNEJBQTRCO0FBQUEsTUFDeEMsS0FBSyxPQUFPO0FBQUEsUUFDWCxjQUFjLE9BQU0sYUFBWSxFQUFFLEdBQUcsU0FBUyxPQUFPLEdBQUcsUUFBUSxLQUFLLFdBQVcsRUFBRSxjQUFjLEdBQUc7QUFBQSxNQUNwRztBQUFBLElBQ0Q7QUFDQSxpQkFBYSxjQUFjLElBQUksZUFBZTtBQUM5QyxVQUFNLFdBQXNDO0FBQUEsTUFDM0MsVUFBVTtBQUFBLE1BQ1YsdUJBQXVCLENBQUMsMEJBQTBCO0FBQUEsTUFDbEQsa0JBQWtCLENBQUMsY0FBYztBQUFBLElBQ2xDO0FBQ0EsVUFBTSxlQUE4QixFQUFFLE1BQU0saUJBQWlCLGNBQWMsU0FBUyxlQUFlLFVBQVUsUUFBUSxtQkFBbUIsUUFBUTtBQUNoSixVQUFNLGFBQXFELEVBQUUsY0FBYyxPQUFNLFlBQVc7QUFBRSxnQkFBVSxLQUFLLFFBQVEsS0FBSztBQUFHLGFBQU8sRUFBRSxlQUFlLEtBQUs7QUFBQSxJQUFHLEVBQUU7QUFFL0osaUJBQWEsMENBQTBDLFNBQVMsWUFBWSxZQUFZO0FBQ3hGLFVBQU0sUUFBUSxDQUFDO0FBQ2YsaUJBQWEsMENBQTBDLFNBQVMsWUFBWSxZQUFZO0FBQ3hGLFVBQU0sUUFBUSxDQUFDO0FBRWYsV0FBTyxnQkFBZ0IsRUFBRSxXQUFXLFlBQVksR0FBRztBQUFBLE1BQ2xELFdBQVcsQ0FBQywwQkFBMEIsd0JBQXdCO0FBQUEsTUFDOUQsYUFBYTtBQUFBLElBQ2QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLHFCQUFxQixNQUFNO0FBQ2hDLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsT0FBSyw2REFBNkQsWUFBWTtBQUM3RSxXQUFPLG1CQUFtQixFQUFFLGVBQWUsTUFBTSxjQUFjLElBQU8sR0FBRyxZQUFZO0FBQ3BGLFlBQU0sUUFBUSxNQUFNLElBQUksSUFBSSxrQkFBa0IsQ0FBQztBQUMvQyxVQUFJLFFBQVE7QUFDWixZQUFNLGNBQWMsS0FBTSxNQUFNLE9BQU87QUFFdkMsYUFBTyxZQUFZLE1BQU0saUJBQWlCLElBQUk7QUFDOUMsWUFBTSxRQUFRLEdBQUc7QUFDakIsYUFBTyxZQUFZLE9BQU8sQ0FBQztBQUMzQixZQUFNLFFBQVEsR0FBRztBQUNqQixhQUFPLFlBQVksT0FBTyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMERBQTBELFlBQVk7QUFJMUUsV0FBTyxtQkFBbUIsRUFBRSxlQUFlLE1BQU0sY0FBYyxJQUFPLEdBQUcsWUFBWTtBQUNwRixZQUFNLFFBQVEsTUFBTSxJQUFJLElBQUksa0JBQWtCLENBQUM7QUFDL0MsWUFBTSxjQUFjLEtBQU0sTUFBTTtBQUFBLE1BQXFCLENBQUM7QUFDdEQsWUFBTSxRQUFRLElBQUk7QUFDbEIsYUFBTyxZQUFZLE1BQU0saUJBQWlCLE9BQU8sc0NBQXNDO0FBQUEsSUFDeEYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssZ0RBQWdELFlBQVk7QUFDaEUsV0FBTyxtQkFBbUIsRUFBRSxlQUFlLE1BQU0sY0FBYyxJQUFPLEdBQUcsWUFBWTtBQUNwRixZQUFNLFFBQVEsTUFBTSxJQUFJLElBQUksa0JBQWtCLENBQUM7QUFDL0MsVUFBSSxRQUFRO0FBQ1osWUFBTSxjQUFjLEtBQU0sTUFBTSxPQUFPO0FBQ3ZDLFlBQU0sWUFBWTtBQUNsQixhQUFPLFlBQVksTUFBTSxpQkFBaUIsS0FBSztBQUMvQyxZQUFNLFFBQVEsR0FBSTtBQUNsQixhQUFPLFlBQVksT0FBTyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssZ0RBQWdELFlBQVk7QUFJaEUsV0FBTyxtQkFBbUIsRUFBRSxlQUFlLE1BQU0sY0FBYyxJQUFPLEdBQUcsWUFBWTtBQUNwRixZQUFNLFFBQVEsTUFBTSxJQUFJLElBQUksa0JBQWtCLENBQUM7QUFDL0MsVUFBSSxhQUFhO0FBQ2pCLFVBQUksY0FBYztBQUNsQixZQUFNLGNBQWMsS0FBTSxNQUFNLFlBQVk7QUFDNUMsWUFBTSxjQUFjLEtBQU0sTUFBTSxhQUFhO0FBQzdDLFlBQU0sUUFBUSxHQUFJO0FBQ2xCLGFBQU8sWUFBWSxZQUFZLEdBQUcsOEJBQThCO0FBQ2hFLGFBQU8sWUFBWSxhQUFhLENBQUM7QUFBQSxJQUNsQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxREFBcUQsWUFBWTtBQUtyRSxXQUFPLG1CQUFtQixFQUFFLGVBQWUsTUFBTSxjQUFjLElBQU8sR0FBRyxZQUFZO0FBQ3BGLFlBQU0sUUFBUSxJQUFJLGtCQUFrQjtBQUNwQyxVQUFJLFFBQVE7QUFDWixZQUFNLGNBQWMsS0FBTSxNQUFNLE9BQU87QUFDdkMsWUFBTSxRQUFRO0FBQ2QsWUFBTSxRQUFRLEdBQUk7QUFDbEIsYUFBTyxZQUFZLE9BQU8sQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1FQUFtRSxZQUFZO0FBQ25GLFdBQU8sbUJBQW1CLEVBQUUsZUFBZSxNQUFNLGNBQWMsSUFBTyxHQUFHLFlBQVk7QUFDcEYsWUFBTSxRQUFRLE1BQU0sSUFBSSxJQUFJLGtCQUFrQixDQUFDO0FBQy9DLFVBQUksUUFBUTtBQUNaLFlBQU0sV0FBVztBQUNqQixZQUFNLFNBQVM7QUFDZixZQUFNLDhCQUE4QjtBQUNwQyxZQUFNLGNBQWMsS0FBTSxNQUFNLE9BQU87QUFFdkMsWUFBTSxlQUFlO0FBQ3JCLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsVUFBVSxNQUFNO0FBQUEsUUFDaEIsUUFBUSxNQUFNO0FBQUEsUUFDZCw2QkFBNkIsTUFBTTtBQUFBLFFBQ25DLGlCQUFpQixNQUFNO0FBQUEsTUFDeEIsR0FBRztBQUFBLFFBQ0YsVUFBVTtBQUFBLFFBQ1YsUUFBUTtBQUFBLFFBQ1IsNkJBQTZCO0FBQUEsUUFDN0IsaUJBQWlCO0FBQUEsTUFDbEIsQ0FBQztBQUVELFlBQU0sUUFBUSxHQUFJO0FBQ2xCLGFBQU8sWUFBWSxPQUFPLEdBQUcsbURBQW1EO0FBQUEsSUFDakYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssK0NBQStDLE1BQU07QUFDekQsVUFBTSxRQUFRLE1BQU0sSUFBSSxJQUFJLGtCQUFrQixDQUFDO0FBQy9DLFVBQU0sV0FBVztBQUNqQixVQUFNLFNBQVM7QUFDZixVQUFNLDhCQUE4QjtBQUVwQyxVQUFNLGtCQUFrQixNQUFNLG9CQUFvQjtBQUNsRCxVQUFNLHVCQUF1QjtBQUFBLE1BQzVCLFVBQVUsTUFBTTtBQUFBLE1BQ2hCLFFBQVEsTUFBTTtBQUFBLE1BQ2QsNkJBQTZCLE1BQU07QUFBQSxJQUNwQztBQUNBLFVBQU0sZUFBZTtBQUVyQixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCO0FBQUEsTUFDQTtBQUFBLE1BQ0EscUJBQXFCO0FBQUEsUUFDcEIsVUFBVSxNQUFNO0FBQUEsUUFDaEIsUUFBUSxNQUFNO0FBQUEsUUFDZCw2QkFBNkIsTUFBTTtBQUFBLE1BQ3BDO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRixpQkFBaUI7QUFBQSxNQUNqQixzQkFBc0I7QUFBQSxRQUNyQixVQUFVO0FBQUEsUUFDVixRQUFRO0FBQUEsUUFDUiw2QkFBNkI7QUFBQSxNQUM5QjtBQUFBLE1BQ0EscUJBQXFCO0FBQUEsUUFDcEIsVUFBVTtBQUFBLFFBQ1YsUUFBUTtBQUFBLFFBQ1IsNkJBQTZCO0FBQUEsTUFDOUI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSx1Q0FBdUMsTUFBTTtBQUNsRCwwQ0FBd0M7QUFFeEMsT0FBSyx5RkFBeUYsTUFBTTtBQUNuRyxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLGNBQWMsb0NBQW9DLElBQUksa0JBQWtCLENBQUM7QUFBQSxNQUN6RSxlQUFlLG9DQUFvQyxJQUFJLHNCQUFzQixXQUFXLENBQUM7QUFBQSxNQUN6RixjQUFjLG9DQUFvQyxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQUEsSUFDcEUsR0FBRztBQUFBLE1BQ0YsY0FBYztBQUFBLE1BQ2QsZUFBZTtBQUFBLE1BQ2YsY0FBYztBQUFBLElBQ2YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLDZCQUE2QixNQUFNO0FBQ3hDLDBDQUF3QztBQUV4QyxPQUFLLDZEQUE2RCxNQUFNO0FBQ3ZFLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsY0FBYywwQkFBMEIsSUFBSSxrQkFBa0IsQ0FBQztBQUFBLE1BQy9ELGVBQWUsMEJBQTBCLElBQUksc0JBQXNCLFdBQVcsQ0FBQztBQUFBLE1BQy9FLGdCQUFnQiwwQkFBMEIsSUFBSSxNQUFNLDhDQUE4QyxDQUFDO0FBQUEsTUFDbkcsU0FBUywwQkFBMEIsSUFBSSxNQUFNLG1CQUFtQixDQUFDO0FBQUEsTUFDakUsT0FBTywwQkFBMEIsSUFBSSxNQUFNLHFCQUFxQixDQUFDO0FBQUEsSUFDbEUsR0FBRztBQUFBLE1BQ0YsY0FBYztBQUFBLE1BQ2QsZUFBZTtBQUFBLE1BQ2YsZ0JBQWdCO0FBQUEsTUFDaEIsU0FBUztBQUFBLE1BQ1QsT0FBTztBQUFBLElBQ1IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLHNCQUFzQixNQUFNO0FBQ2pDLDBDQUF3QztBQUV4QyxXQUFTLHdCQUF3QixZQUFvRCxDQUFDLEdBQWtDO0FBQ3ZILFdBQU87QUFBQSxNQUNOLE1BQU0seUJBQXlCO0FBQUEsTUFDL0IsU0FBUztBQUFBLE1BQ1QsZUFBZTtBQUFBLE1BQ2YsVUFBVTtBQUFBLE1BQ1YsR0FBRztBQUFBLElBQ0o7QUFBQSxFQUNEO0FBRUEsT0FBSyxnRkFBZ0YsWUFBWTtBQU9oRyxVQUFNLFFBQWtCLENBQUM7QUFDekIsVUFBTSxhQUFhLHdCQUF3QjtBQUczQyxVQUFNLFVBQVUsSUFBSSxnQkFBc0I7QUFFMUMsVUFBTSx5QkFBeUI7QUFBQSxNQUM5Qix1QkFBdUIsT0FBTyxZQUFvQjtBQUNqRCxjQUFNLEtBQUssVUFBVSxPQUFPLEVBQUU7QUFDOUIsY0FBTSxRQUFRO0FBQUEsTUFDZjtBQUFBLElBQ0Q7QUFDQSxVQUFNLGFBQWE7QUFBQSxNQUNsQixZQUFZLE9BQU8sUUFBZ0I7QUFDbEMsY0FBTSxLQUFLLE9BQU8sR0FBRyxFQUFFO0FBQUEsTUFDeEI7QUFBQSxJQUNEO0FBRUEsVUFBTSxVQUFVLG1CQUFtQixZQUFZLHdCQUF3QixVQUFVO0FBSWpGLFVBQU0sUUFBUSxDQUFDO0FBQ2YsV0FBTyxnQkFBZ0IsT0FBTyxDQUFDLHVCQUF1QixDQUFDO0FBRXZELFlBQVEsU0FBUztBQUNqQixVQUFNO0FBRU4sV0FBTyxnQkFBZ0IsT0FBTyxDQUFDLHlCQUF5QixrQkFBa0IsQ0FBQztBQUFBLEVBQzVFLENBQUM7QUFFRCxPQUFLLDBEQUEwRCxZQUFZO0FBQzFFLFVBQU0sUUFBa0IsQ0FBQztBQUN6QixVQUFNO0FBQUEsTUFDTCx3QkFBd0IsRUFBRSxlQUFlLFdBQVcsQ0FBQztBQUFBLE1BQ3JELEVBQUUsdUJBQXVCLFlBQVk7QUFBQSxNQUFhLEVBQUU7QUFBQSxNQUNwRCxFQUFFLFlBQVksT0FBTyxRQUFnQjtBQUFFLGNBQU0sS0FBSyxHQUFHO0FBQUEsTUFBRyxFQUFFO0FBQUEsSUFDM0Q7QUFDQSxXQUFPLGdCQUFnQixPQUFPLENBQUMsY0FBYyxDQUFDO0FBQUEsRUFDL0MsQ0FBQztBQUVELE9BQUsseURBQXlELFlBQVk7QUFDekUsVUFBTSxRQUFrQixDQUFDO0FBQ3pCLFVBQU07QUFBQSxNQUNMO0FBQUEsUUFDQyxNQUFNLHlCQUF5QjtBQUFBLFFBQy9CLFNBQVM7QUFBQSxRQUNULFVBQVU7QUFBQSxRQUNWLE1BQU07QUFBQSxRQUNOLE1BQU07QUFBQSxNQUNQO0FBQUEsTUFDQSxFQUFFLHVCQUF1QixZQUFZO0FBQUEsTUFBYSxFQUFFO0FBQUEsTUFDcEQsRUFBRSxZQUFZLE9BQU8sUUFBZ0I7QUFBRSxjQUFNLEtBQUssR0FBRztBQUFBLE1BQUcsRUFBRTtBQUFBLElBQzNEO0FBQ0EsV0FBTyxnQkFBZ0IsT0FBTyxDQUFDLDhCQUE4QixDQUFDO0FBQUEsRUFDL0QsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLG9CQUFvQixNQUFNO0FBQy9CLDBDQUF3QztBQUV4QyxPQUFLLDZEQUE2RCxNQUFNO0FBQ3ZFLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsWUFBWSxpQkFBaUI7QUFBQSxRQUM1QixNQUFNLHlCQUF5QjtBQUFBLFFBQy9CLFNBQVM7QUFBQSxRQUNULGVBQWU7QUFBQSxRQUNmLFVBQVU7QUFBQSxNQUNYLENBQUM7QUFBQSxNQUNELGNBQWMsaUJBQWlCO0FBQUEsUUFDOUIsTUFBTSx5QkFBeUI7QUFBQSxRQUMvQixTQUFTO0FBQUEsUUFDVCxVQUFVO0FBQUEsUUFDVixNQUFNO0FBQUEsUUFDTixNQUFNO0FBQUEsTUFDUCxDQUFDO0FBQUEsTUFDRCxVQUFVLGlCQUFpQjtBQUFBLFFBQzFCLE1BQU0seUJBQXlCO0FBQUEsUUFDL0IsU0FBUztBQUFBLFFBQ1QsVUFBVTtBQUFBLE1BQ1gsQ0FBQztBQUFBLElBQ0YsR0FBRztBQUFBLE1BQ0YsWUFBWTtBQUFBLE1BQ1osY0FBYztBQUFBLE1BQ2QsVUFBVTtBQUFBLElBQ1gsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
