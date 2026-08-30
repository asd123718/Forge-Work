import assert from "assert";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { LogLevel } from "../../../log/common/log.js";
import { TestConfigurationService } from "../../../configuration/test/common/testConfigurationService.js";
import { INACTIVE_TUNNEL_MODE } from "../../common/remoteTunnel.js";
import { CodeTunnelCli } from "../../node/codeTunnelCliProcess.js";
import { resolveTunnelProcessMode, TunnelProcessCoordinator } from "../../node/tunnelProcessCoordinator.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
function createProcess(args, complete, statusOutput, exitOnKill = true, env, exitCode = 0) {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let killed = false;
  const child = Object.assign(new EventEmitter(), {
    pid: 123,
    stdout,
    stderr,
    kill: () => {
      killed = true;
      if (exitOnKill) {
        queueMicrotask(() => child.emit("exit", null));
      }
      return true;
    }
  });
  if (complete) {
    queueMicrotask(() => {
      if (statusOutput) {
        stdout.write(statusOutput);
      }
      child.emit("exit", exitCode);
    });
  }
  return { child, stdout, stderr, args, env, kill: child.kill.bind(child), wasKilled: () => killed, emitExit: () => child.emit("exit", null) };
}
function activeMode(asService = false) {
  return { active: true, asService, session: { providerId: "github", sessionId: "session", accountLabel: "account", token: "token" } };
}
function agentRequest() {
  return { token: "agent-token", authProvider: "github", logLevel: LogLevel.Info };
}
function createCoordinator(exitOnKill = true, ordering, installExitCode = 0) {
  const processes = [];
  const spawn = (_command, args, options) => {
    const complete = args.includes("login") || args.includes("status") || args.includes("install") || args.includes("kill") || args.includes("uninstall");
    const isTunnelProcess = args[0] === "tunnel" && !args.includes("status") && !args.includes("login") && !args.includes("install") && !args.includes("kill") && !args.includes("uninstall");
    if (isTunnelProcess) {
      ordering?.push(args.includes("--agent-host-only") ? "spawn-agent-host" : "spawn-remote-access");
    }
    const process2 = createProcess(args, complete, args.includes("status") ? '{"service_installed":false,"tunnel":null}\n' : void 0, exitOnKill || complete, options.env, args.includes("install") ? installExitCode : 0);
    if (isTunnelProcess && ordering) {
      process2.child.on("exit", () => ordering.push(args.includes("--agent-host-only") ? "exit-agent-host" : "exit-remote-access"));
      const kill = process2.child.kill;
      process2.child.kill = () => {
        ordering.push(args.includes("--agent-host-only") ? "kill-agent-host" : "kill-remote-access");
        return kill.call(process2.child);
      };
    }
    processes.push(process2);
    return process2.child;
  };
  const environmentService = {
    appRoot: "installation",
    isBuilt: true,
    userDataPath: "custom-user-data"
  };
  const coordinator = new TunnelProcessCoordinator(
    (onLog) => new CodeTunnelCli({ appRoot: environmentService.appRoot, isBuilt: true, tunnelApplicationName: "code-tunnel", win32VersionedUpdate: false, spawn, onLog }),
    new TestConfigurationService({ "remote.tunnels.access.hostNameOverride": "Test_Host" }),
    environmentService,
    { tunnelApplicationName: "code-tunnel" }
  );
  return { coordinator, processes };
}
suite("TunnelProcessCoordinator", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("resolves the combined intent modes", () => {
    assert.deepStrictEqual([
      resolveTunnelProcessMode(false, INACTIVE_TUNNEL_MODE),
      resolveTunnelProcessMode(true, INACTIVE_TUNNEL_MODE),
      resolveTunnelProcessMode(false, activeMode()),
      resolveTunnelProcessMode(true, activeMode()),
      resolveTunnelProcessMode(false, activeMode(true)),
      resolveTunnelProcessMode(true, activeMode(true))
    ], ["none", "agentHost", "remoteAccess", "remoteAccess", "service", "service"]);
  });
  test("stops agent-host-only before starting a full tunnel with the same name", async () => {
    const { coordinator, processes } = createCoordinator();
    try {
      await coordinator.setAgentHostSharing(agentRequest());
      const agentHost = processes.find((process2) => process2.args.includes("--agent-host-only"));
      await coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
      const fullTunnel = processes.filter((process2) => process2.args[0] === "tunnel" && !process2.args.includes("--agent-host-only")).at(-1);
      assert.deepStrictEqual({
        agentHostKilledBeforeFullTunnel: processes.indexOf(agentHost) < processes.indexOf(fullTunnel),
        agentHostWasStopped: agentHost.wasKilled(),
        names: [agentHost.args[agentHost.args.indexOf("--name") + 1], fullTunnel.args[fullTunnel.args.indexOf("--name") + 1]]
      }, {
        agentHostKilledBeforeFullTunnel: true,
        agentHostWasStopped: true,
        names: ["test_host", "test_host"]
      });
    } finally {
      for (const process2 of processes) {
        process2.emitExit();
      }
      await new Promise((resolve) => setImmediate(resolve));
      coordinator.dispose();
    }
  });
  test("leaves a healthy tunnel running when the resolved target is unchanged", async () => {
    const { coordinator, processes } = createCoordinator();
    try {
      await coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
      const tunnel = processes.find((process2) => process2.args.includes("--accept-server-license-terms"));
      await coordinator.setAgentHostSharing(agentRequest());
      assert.deepStrictEqual({
        wasKilled: tunnel.wasKilled(),
        tunnelProcessCount: processes.filter((process2) => process2.args[0] === "tunnel" && !process2.args.includes("status") && !process2.args.includes("login") && !process2.args.includes("install") && !process2.args.includes("kill") && !process2.args.includes("uninstall")).length
      }, {
        wasKilled: false,
        tunnelProcessCount: 1
      });
    } finally {
      for (const process2 of processes) {
        process2.emitExit();
      }
      await new Promise((resolve) => setImmediate(resolve));
      coordinator.dispose();
    }
  });
  test("restarts when the session token changes even though mode and name do not", async () => {
    const { coordinator, processes } = createCoordinator();
    const countTunnels = () => processes.filter((p) => p.args[0] === "tunnel" && !p.args.includes("status") && !p.args.includes("login") && !p.args.includes("install") && !p.args.includes("kill") && !p.args.includes("uninstall")).length;
    try {
      await coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
      const before = countTunnels();
      const refreshed = {
        active: true,
        asService: false,
        session: { providerId: "github", sessionId: "session", accountLabel: "account", token: "refreshed-token" }
      };
      await coordinator.setRemoteAccess(refreshed, LogLevel.Info);
      assert.deepStrictEqual({ before, after: countTunnels() }, { before: 1, after: 2 });
    } finally {
      for (const process2 of processes) {
        process2.emitExit();
      }
      await new Promise((resolve) => setImmediate(resolve));
      coordinator.dispose();
    }
  });
  test("restarts a run that already reported disconnected", async () => {
    const { coordinator, processes } = createCoordinator();
    const countTunnels = () => processes.filter((p) => p.args[0] === "tunnel" && !p.args.includes("status") && !p.args.includes("login") && !p.args.includes("install") && !p.args.includes("kill") && !p.args.includes("uninstall")).length;
    try {
      await coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
      const before = countTunnels();
      coordinator.setRemoteAccessStatus({ type: "disconnected" });
      await coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
      assert.deepStrictEqual({ before, after: countTunnels() }, { before: 1, after: 2 });
    } finally {
      for (const process2 of processes) {
        process2.emitExit();
      }
      await new Promise((resolve) => setImmediate(resolve));
      coordinator.dispose();
    }
  });
  test("restart() still replaces a healthy tunnel", async () => {
    const { coordinator, processes } = createCoordinator();
    try {
      await coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
      const tunnel = processes.find((process2) => process2.args.includes("--accept-server-license-terms"));
      await coordinator.restart();
      assert.strictEqual(tunnel.wasKilled(), true);
    } finally {
      for (const process2 of processes) {
        process2.emitExit();
      }
      await new Promise((resolve) => setImmediate(resolve));
      coordinator.dispose();
    }
  });
  test("starts a session tunnel alongside the installed service so readiness can advance", async () => {
    const { coordinator, processes } = createCoordinator();
    try {
      await coordinator.setRemoteAccess(activeMode(true), LogLevel.Info);
      const sessionTunnel = processes.find((process2) => process2.args.includes("--accept-server-license-terms") && !process2.args.includes("install"));
      assert.deepStrictEqual({
        installed: processes.some((process2) => process2.args.includes("install")),
        startedSessionTunnel: !!sessionTunnel,
        mode: coordinator.getStatus().mode
      }, {
        installed: true,
        startedSessionTunnel: true,
        mode: "service"
      });
    } finally {
      for (const process2 of processes) {
        process2.emitExit();
      }
      await new Promise((resolve) => setImmediate(resolve));
      coordinator.dispose();
    }
  });
  test("falls back to hosting in-session when the service install fails", async () => {
    const { coordinator, processes } = createCoordinator(true, void 0, 1);
    try {
      await coordinator.setRemoteAccess(activeMode(true), LogLevel.Info);
      assert.deepStrictEqual({
        serviceInstallFailed: coordinator.getStatus().serviceInstallFailed,
        startedSessionTunnel: processes.some((process2) => process2.args.includes("--accept-server-license-terms") && !process2.args.includes("install"))
      }, {
        serviceInstallFailed: true,
        startedSessionTunnel: true
      });
    } finally {
      for (const process2 of processes) {
        process2.emitExit();
      }
      await new Promise((resolve) => setImmediate(resolve));
      coordinator.dispose();
    }
  });
  test("waits for the prior tunnel process to exit before spawning its replacement", async () => {
    const ordering = [];
    const { coordinator, processes } = createCoordinator(false, ordering);
    try {
      await coordinator.setAgentHostSharing(agentRequest());
      const agentHost = processes.find((process2) => process2.args.includes("--agent-host-only"));
      const transition = coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepStrictEqual(ordering, ["spawn-agent-host", "kill-agent-host"]);
      agentHost.emitExit();
      await transition;
      assert.deepStrictEqual(ordering, ["spawn-agent-host", "kill-agent-host", "exit-agent-host", "spawn-remote-access"]);
    } finally {
      for (const process2 of processes) {
        process2.emitExit();
      }
      await new Promise((resolve) => setImmediate(resolve));
      coordinator.dispose();
    }
  });
  test("resumes agent-host-only when remote access stops", async () => {
    const { coordinator, processes } = createCoordinator();
    try {
      await coordinator.setAgentHostSharing(agentRequest());
      await coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
      await coordinator.setRemoteAccess(INACTIVE_TUNNEL_MODE, LogLevel.Info);
      assert.deepStrictEqual(processes.filter((process2) => process2.args.includes("--agent-host-only")).map((process2) => process2.args), [
        ["tunnel", "--agent-host-only", "--name", "test_host", "--user-data-dir", "custom-user-data", "--delegate-to-editor", "--parent-process-id", String(process.pid)],
        ["tunnel", "--agent-host-only", "--name", "test_host", "--user-data-dir", "custom-user-data", "--delegate-to-editor", "--parent-process-id", String(process.pid)]
      ]);
    } finally {
      coordinator.dispose();
    }
  });
  test("preserves remote access session and service CLI arguments", async () => {
    const session = createCoordinator();
    const service = createCoordinator();
    try {
      await session.coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
      await service.coordinator.setRemoteAccess(activeMode(true), LogLevel.Info);
      assert.deepStrictEqual({
        session: session.processes.find((process2) => process2.args.includes("--accept-server-license-terms")).args,
        service: service.processes.find((process2) => process2.args.includes("install")).args
      }, {
        session: ["tunnel", "--accept-server-license-terms", "--log", "info", "--user-data-dir", "custom-user-data", "--delegate-to-editor", "--name", "test_host", "--parent-process-id", String(process.pid)],
        service: ["tunnel", "service", "install", "--accept-server-license-terms", "--log", "info", "--user-data-dir", "custom-user-data", "--name", "test_host"]
      });
    } finally {
      for (const process2 of [...session.processes, ...service.processes]) {
        process2.emitExit();
      }
      await new Promise((resolve) => setImmediate(resolve));
      session.coordinator.dispose();
      service.coordinator.dispose();
    }
  });
  test("uninstalls the service even when a sharing update preempts the reconcile", async () => {
    const { coordinator, processes } = createCoordinator();
    try {
      await coordinator.setRemoteAccess(activeMode(true), LogLevel.Info);
      const stopService = coordinator.setRemoteAccess(INACTIVE_TUNNEL_MODE, LogLevel.Info);
      const share = coordinator.setAgentHostSharing(agentRequest());
      await Promise.all([stopService, share]);
      assert.deepStrictEqual({
        uninstalled: processes.some((process2) => process2.args.includes("uninstall")),
        agentHostStarted: processes.some((process2) => process2.args.includes("--agent-host-only"))
      }, {
        uninstalled: true,
        agentHostStarted: true
      });
    } finally {
      coordinator.dispose();
    }
  });
  test("parses and fans machine-status events to every registered consumer", async () => {
    const { coordinator, processes } = createCoordinator();
    const first = [];
    const second = [];
    const firstListener = coordinator.onDidMachineStatus((event) => first.push(event.status.type));
    const secondListener = coordinator.onDidMachineStatus((event) => second.push(event.status.type));
    try {
      await coordinator.setAgentHostSharing(agentRequest());
      const agentHost = processes.find((process2) => process2.args.includes("--agent-host-only"));
      agentHost.stdout.write('__VSCODE_CLI_STATUS__{"type":"connected","tunnelName":"test_host","isAttached":false}\n');
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepStrictEqual({
        first,
        second,
        status: coordinator.getStatus().connectionState,
        machineStatusEnvironment: agentHost.env?.VSCODE_CLI_MACHINE_STATUS
      }, {
        first: ["connected"],
        second: ["connected"],
        status: "connected",
        machineStatusEnvironment: "1"
      });
    } finally {
      firstListener.dispose();
      secondListener.dispose();
      coordinator.dispose();
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccmVtb3RlVHVubmVsXFx0ZXN0XFxub2RlXFx0dW5uZWxQcm9jZXNzQ29vcmRpbmF0b3IudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENoaWxkUHJvY2VzcywgU3Bhd25PcHRpb25zIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBFdmVudEVtaXR0ZXIgfSBmcm9tICdldmVudHMnO1xuaW1wb3J0IHsgUGFzc1Rocm91Z2ggfSBmcm9tICdzdHJlYW0nO1xuaW1wb3J0IHsgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGl2ZVR1bm5lbE1vZGUsIElOQUNUSVZFX1RVTk5FTF9NT0RFIH0gZnJvbSAnLi4vLi4vY29tbW9uL3JlbW90ZVR1bm5lbC5qcyc7XG5pbXBvcnQgeyBDb2RlVHVubmVsQ2xpLCBDb2RlVHVubmVsU3Bhd24gfSBmcm9tICcuLi8uLi9ub2RlL2NvZGVUdW5uZWxDbGlQcm9jZXNzLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTaGFyaW5nUmVxdWVzdCwgcmVzb2x2ZVR1bm5lbFByb2Nlc3NNb2RlLCBUdW5uZWxQcm9jZXNzQ29vcmRpbmF0b3IgfSBmcm9tICcuLi8uLi9ub2RlL3R1bm5lbFByb2Nlc3NDb29yZGluYXRvci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuaW50ZXJmYWNlIFRlc3RDaGlsZFByb2Nlc3Mge1xuXHRyZWFkb25seSBjaGlsZDogQ2hpbGRQcm9jZXNzO1xuXHRyZWFkb25seSBzdGRvdXQ6IFBhc3NUaHJvdWdoO1xuXHRyZWFkb25seSBzdGRlcnI6IFBhc3NUaHJvdWdoO1xuXHRyZWFkb25seSBhcmdzOiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgZW52OiBOb2RlSlMuUHJvY2Vzc0VudiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkga2lsbDogKCkgPT4gYm9vbGVhbjtcblx0cmVhZG9ubHkgd2FzS2lsbGVkOiAoKSA9PiBib29sZWFuO1xuXHRlbWl0RXhpdCgpOiB2b2lkO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVQcm9jZXNzKGFyZ3M6IHJlYWRvbmx5IHN0cmluZ1tdLCBjb21wbGV0ZTogYm9vbGVhbiwgc3RhdHVzT3V0cHV0Pzogc3RyaW5nLCBleGl0T25LaWxsID0gdHJ1ZSwgZW52PzogTm9kZUpTLlByb2Nlc3NFbnYsIGV4aXRDb2RlID0gMCk6IFRlc3RDaGlsZFByb2Nlc3Mge1xuXHRjb25zdCBzdGRvdXQgPSBuZXcgUGFzc1Rocm91Z2goKTtcblx0Y29uc3Qgc3RkZXJyID0gbmV3IFBhc3NUaHJvdWdoKCk7XG5cdGxldCBraWxsZWQgPSBmYWxzZTtcblx0Y29uc3QgY2hpbGQgPSBPYmplY3QuYXNzaWduKG5ldyBFdmVudEVtaXR0ZXIoKSwge1xuXHRcdHBpZDogMTIzLFxuXHRcdHN0ZG91dCxcblx0XHRzdGRlcnIsXG5cdFx0a2lsbDogKCkgPT4ge1xuXHRcdFx0a2lsbGVkID0gdHJ1ZTtcblx0XHRcdGlmIChleGl0T25LaWxsKSB7XG5cdFx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IGNoaWxkLmVtaXQoJ2V4aXQnLCBudWxsKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9LFxuXHR9KSBhcyB1bmtub3duIGFzIENoaWxkUHJvY2Vzcztcblx0aWYgKGNvbXBsZXRlKSB7XG5cdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0aWYgKHN0YXR1c091dHB1dCkge1xuXHRcdFx0XHRzdGRvdXQud3JpdGUoc3RhdHVzT3V0cHV0KTtcblx0XHRcdH1cblx0XHRcdGNoaWxkLmVtaXQoJ2V4aXQnLCBleGl0Q29kZSk7XG5cdFx0fSk7XG5cdH1cblx0cmV0dXJuIHsgY2hpbGQsIHN0ZG91dCwgc3RkZXJyLCBhcmdzLCBlbnYsIGtpbGw6IGNoaWxkLmtpbGwuYmluZChjaGlsZCksIHdhc0tpbGxlZDogKCkgPT4ga2lsbGVkLCBlbWl0RXhpdDogKCkgPT4gY2hpbGQuZW1pdCgnZXhpdCcsIG51bGwpIH07XG59XG5cbmZ1bmN0aW9uIGFjdGl2ZU1vZGUoYXNTZXJ2aWNlID0gZmFsc2UpOiBBY3RpdmVUdW5uZWxNb2RlIHtcblx0cmV0dXJuIHsgYWN0aXZlOiB0cnVlLCBhc1NlcnZpY2UsIHNlc3Npb246IHsgcHJvdmlkZXJJZDogJ2dpdGh1YicsIHNlc3Npb25JZDogJ3Nlc3Npb24nLCBhY2NvdW50TGFiZWw6ICdhY2NvdW50JywgdG9rZW46ICd0b2tlbicgfSB9O1xufVxuXG5mdW5jdGlvbiBhZ2VudFJlcXVlc3QoKTogSUFnZW50SG9zdFNoYXJpbmdSZXF1ZXN0IHtcblx0cmV0dXJuIHsgdG9rZW46ICdhZ2VudC10b2tlbicsIGF1dGhQcm92aWRlcjogJ2dpdGh1YicsIGxvZ0xldmVsOiBMb2dMZXZlbC5JbmZvIH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUNvb3JkaW5hdG9yKGV4aXRPbktpbGwgPSB0cnVlLCBvcmRlcmluZz86IHN0cmluZ1tdLCBpbnN0YWxsRXhpdENvZGUgPSAwKSB7XG5cdGNvbnN0IHByb2Nlc3NlczogVGVzdENoaWxkUHJvY2Vzc1tdID0gW107XG5cdGNvbnN0IHNwYXduOiBDb2RlVHVubmVsU3Bhd24gPSAoX2NvbW1hbmQ6IHN0cmluZywgYXJnczogcmVhZG9ubHkgc3RyaW5nW10sIG9wdGlvbnM6IFNwYXduT3B0aW9ucykgPT4ge1xuXHRcdGNvbnN0IGNvbXBsZXRlID0gYXJncy5pbmNsdWRlcygnbG9naW4nKSB8fCBhcmdzLmluY2x1ZGVzKCdzdGF0dXMnKSB8fCBhcmdzLmluY2x1ZGVzKCdpbnN0YWxsJykgfHwgYXJncy5pbmNsdWRlcygna2lsbCcpIHx8IGFyZ3MuaW5jbHVkZXMoJ3VuaW5zdGFsbCcpO1xuXHRcdGNvbnN0IGlzVHVubmVsUHJvY2VzcyA9IGFyZ3NbMF0gPT09ICd0dW5uZWwnICYmICFhcmdzLmluY2x1ZGVzKCdzdGF0dXMnKSAmJiAhYXJncy5pbmNsdWRlcygnbG9naW4nKSAmJiAhYXJncy5pbmNsdWRlcygnaW5zdGFsbCcpICYmICFhcmdzLmluY2x1ZGVzKCdraWxsJykgJiYgIWFyZ3MuaW5jbHVkZXMoJ3VuaW5zdGFsbCcpO1xuXHRcdGlmIChpc1R1bm5lbFByb2Nlc3MpIHtcblx0XHRcdG9yZGVyaW5nPy5wdXNoKGFyZ3MuaW5jbHVkZXMoJy0tYWdlbnQtaG9zdC1vbmx5JykgPyAnc3Bhd24tYWdlbnQtaG9zdCcgOiAnc3Bhd24tcmVtb3RlLWFjY2VzcycpO1xuXHRcdH1cblx0XHRjb25zdCBwcm9jZXNzID0gY3JlYXRlUHJvY2VzcyhhcmdzLCBjb21wbGV0ZSwgYXJncy5pbmNsdWRlcygnc3RhdHVzJykgPyAne1wic2VydmljZV9pbnN0YWxsZWRcIjpmYWxzZSxcInR1bm5lbFwiOm51bGx9XFxuJyA6IHVuZGVmaW5lZCwgZXhpdE9uS2lsbCB8fCBjb21wbGV0ZSwgb3B0aW9ucy5lbnYsIGFyZ3MuaW5jbHVkZXMoJ2luc3RhbGwnKSA/IGluc3RhbGxFeGl0Q29kZSA6IDApO1xuXHRcdGlmIChpc1R1bm5lbFByb2Nlc3MgJiYgb3JkZXJpbmcpIHtcblx0XHRcdHByb2Nlc3MuY2hpbGQub24oJ2V4aXQnLCAoKSA9PiBvcmRlcmluZy5wdXNoKGFyZ3MuaW5jbHVkZXMoJy0tYWdlbnQtaG9zdC1vbmx5JykgPyAnZXhpdC1hZ2VudC1ob3N0JyA6ICdleGl0LXJlbW90ZS1hY2Nlc3MnKSk7XG5cdFx0XHRjb25zdCBraWxsID0gcHJvY2Vzcy5jaGlsZC5raWxsO1xuXHRcdFx0cHJvY2Vzcy5jaGlsZC5raWxsID0gKCkgPT4ge1xuXHRcdFx0XHRvcmRlcmluZy5wdXNoKGFyZ3MuaW5jbHVkZXMoJy0tYWdlbnQtaG9zdC1vbmx5JykgPyAna2lsbC1hZ2VudC1ob3N0JyA6ICdraWxsLXJlbW90ZS1hY2Nlc3MnKTtcblx0XHRcdFx0cmV0dXJuIGtpbGwuY2FsbChwcm9jZXNzLmNoaWxkKTtcblx0XHRcdH07XG5cdFx0fVxuXHRcdHByb2Nlc3Nlcy5wdXNoKHByb2Nlc3MpO1xuXHRcdHJldHVybiBwcm9jZXNzLmNoaWxkO1xuXHR9O1xuXHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB7XG5cdFx0YXBwUm9vdDogJ2luc3RhbGxhdGlvbicsXG5cdFx0aXNCdWlsdDogdHJ1ZSxcblx0XHR1c2VyRGF0YVBhdGg6ICdjdXN0b20tdXNlci1kYXRhJyxcblx0fSBhcyBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlO1xuXHRjb25zdCBjb29yZGluYXRvciA9IG5ldyBUdW5uZWxQcm9jZXNzQ29vcmRpbmF0b3IoXG5cdFx0b25Mb2cgPT4gbmV3IENvZGVUdW5uZWxDbGkoeyBhcHBSb290OiBlbnZpcm9ubWVudFNlcnZpY2UuYXBwUm9vdCwgaXNCdWlsdDogdHJ1ZSwgdHVubmVsQXBwbGljYXRpb25OYW1lOiAnY29kZS10dW5uZWwnLCB3aW4zMlZlcnNpb25lZFVwZGF0ZTogZmFsc2UsIHNwYXduLCBvbkxvZyB9KSxcblx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgJ3JlbW90ZS50dW5uZWxzLmFjY2Vzcy5ob3N0TmFtZU92ZXJyaWRlJzogJ1Rlc3RfSG9zdCcgfSksXG5cdFx0ZW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdHsgdHVubmVsQXBwbGljYXRpb25OYW1lOiAnY29kZS10dW5uZWwnIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLFxuXHQpO1xuXHRyZXR1cm4geyBjb29yZGluYXRvciwgcHJvY2Vzc2VzIH07XG59XG5cbnN1aXRlKCdUdW5uZWxQcm9jZXNzQ29vcmRpbmF0b3InLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIHRoZSBjb21iaW5lZCBpbnRlbnQgbW9kZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRyZXNvbHZlVHVubmVsUHJvY2Vzc01vZGUoZmFsc2UsIElOQUNUSVZFX1RVTk5FTF9NT0RFKSxcblx0XHRcdHJlc29sdmVUdW5uZWxQcm9jZXNzTW9kZSh0cnVlLCBJTkFDVElWRV9UVU5ORUxfTU9ERSksXG5cdFx0XHRyZXNvbHZlVHVubmVsUHJvY2Vzc01vZGUoZmFsc2UsIGFjdGl2ZU1vZGUoKSksXG5cdFx0XHRyZXNvbHZlVHVubmVsUHJvY2Vzc01vZGUodHJ1ZSwgYWN0aXZlTW9kZSgpKSxcblx0XHRcdHJlc29sdmVUdW5uZWxQcm9jZXNzTW9kZShmYWxzZSwgYWN0aXZlTW9kZSh0cnVlKSksXG5cdFx0XHRyZXNvbHZlVHVubmVsUHJvY2Vzc01vZGUodHJ1ZSwgYWN0aXZlTW9kZSh0cnVlKSksXG5cdFx0XSwgWydub25lJywgJ2FnZW50SG9zdCcsICdyZW1vdGVBY2Nlc3MnLCAncmVtb3RlQWNjZXNzJywgJ3NlcnZpY2UnLCAnc2VydmljZSddKTtcblx0fSk7XG5cblx0dGVzdCgnc3RvcHMgYWdlbnQtaG9zdC1vbmx5IGJlZm9yZSBzdGFydGluZyBhIGZ1bGwgdHVubmVsIHdpdGggdGhlIHNhbWUgbmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNvb3JkaW5hdG9yLCBwcm9jZXNzZXMgfSA9IGNyZWF0ZUNvb3JkaW5hdG9yKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGNvb3JkaW5hdG9yLnNldEFnZW50SG9zdFNoYXJpbmcoYWdlbnRSZXF1ZXN0KCkpO1xuXHRcdFx0Y29uc3QgYWdlbnRIb3N0ID0gcHJvY2Vzc2VzLmZpbmQocHJvY2VzcyA9PiBwcm9jZXNzLmFyZ3MuaW5jbHVkZXMoJy0tYWdlbnQtaG9zdC1vbmx5JykpITtcblx0XHRcdGF3YWl0IGNvb3JkaW5hdG9yLnNldFJlbW90ZUFjY2VzcyhhY3RpdmVNb2RlKCksIExvZ0xldmVsLkluZm8pO1xuXHRcdFx0Y29uc3QgZnVsbFR1bm5lbCA9IHByb2Nlc3Nlcy5maWx0ZXIocHJvY2VzcyA9PiBwcm9jZXNzLmFyZ3NbMF0gPT09ICd0dW5uZWwnICYmICFwcm9jZXNzLmFyZ3MuaW5jbHVkZXMoJy0tYWdlbnQtaG9zdC1vbmx5JykpLmF0KC0xKSE7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRhZ2VudEhvc3RLaWxsZWRCZWZvcmVGdWxsVHVubmVsOiBwcm9jZXNzZXMuaW5kZXhPZihhZ2VudEhvc3QpIDwgcHJvY2Vzc2VzLmluZGV4T2YoZnVsbFR1bm5lbCksXG5cdFx0XHRcdGFnZW50SG9zdFdhc1N0b3BwZWQ6IGFnZW50SG9zdC53YXNLaWxsZWQoKSxcblx0XHRcdFx0bmFtZXM6IFthZ2VudEhvc3QuYXJnc1thZ2VudEhvc3QuYXJncy5pbmRleE9mKCctLW5hbWUnKSArIDFdLCBmdWxsVHVubmVsLmFyZ3NbZnVsbFR1bm5lbC5hcmdzLmluZGV4T2YoJy0tbmFtZScpICsgMV1dLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRhZ2VudEhvc3RLaWxsZWRCZWZvcmVGdWxsVHVubmVsOiB0cnVlLFxuXHRcdFx0XHRhZ2VudEhvc3RXYXNTdG9wcGVkOiB0cnVlLFxuXHRcdFx0XHRuYW1lczogWyd0ZXN0X2hvc3QnLCAndGVzdF9ob3N0J10sXG5cdFx0XHR9KTtcblxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRmb3IgKGNvbnN0IHByb2Nlc3Mgb2YgcHJvY2Vzc2VzKSB7XG5cdFx0XHRcdHByb2Nlc3MuZW1pdEV4aXQoKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gc2V0SW1tZWRpYXRlKHJlc29sdmUpKTtcblx0XHRcdGNvb3JkaW5hdG9yLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2xlYXZlcyBhIGhlYWx0aHkgdHVubmVsIHJ1bm5pbmcgd2hlbiB0aGUgcmVzb2x2ZWQgdGFyZ2V0IGlzIHVuY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNvb3JkaW5hdG9yLCBwcm9jZXNzZXMgfSA9IGNyZWF0ZUNvb3JkaW5hdG9yKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGNvb3JkaW5hdG9yLnNldFJlbW90ZUFjY2VzcyhhY3RpdmVNb2RlKCksIExvZ0xldmVsLkluZm8pO1xuXHRcdFx0Y29uc3QgdHVubmVsID0gcHJvY2Vzc2VzLmZpbmQocHJvY2VzcyA9PiBwcm9jZXNzLmFyZ3MuaW5jbHVkZXMoJy0tYWNjZXB0LXNlcnZlci1saWNlbnNlLXRlcm1zJykpITtcblxuXHRcdFx0Ly8gUmVtb3RlIFR1bm5lbCBBY2Nlc3Mgc3RheXMgdGhlIHdpbm5pbmcgdGFyZ2V0LCBzbyB0b2dnbGluZyBhZ2VudFxuXHRcdFx0Ly8gaG9zdCBzaGFyaW5nIG11c3Qgbm90IGRpc3R1cmIgdGhlIHJ1bm5pbmcgdHVubmVsLlxuXHRcdFx0YXdhaXQgY29vcmRpbmF0b3Iuc2V0QWdlbnRIb3N0U2hhcmluZyhhZ2VudFJlcXVlc3QoKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR3YXNLaWxsZWQ6IHR1bm5lbC53YXNLaWxsZWQoKSxcblx0XHRcdFx0dHVubmVsUHJvY2Vzc0NvdW50OiBwcm9jZXNzZXMuZmlsdGVyKHByb2Nlc3MgPT4gcHJvY2Vzcy5hcmdzWzBdID09PSAndHVubmVsJ1xuXHRcdFx0XHRcdCYmICFwcm9jZXNzLmFyZ3MuaW5jbHVkZXMoJ3N0YXR1cycpXG5cdFx0XHRcdFx0JiYgIXByb2Nlc3MuYXJncy5pbmNsdWRlcygnbG9naW4nKVxuXHRcdFx0XHRcdCYmICFwcm9jZXNzLmFyZ3MuaW5jbHVkZXMoJ2luc3RhbGwnKVxuXHRcdFx0XHRcdCYmICFwcm9jZXNzLmFyZ3MuaW5jbHVkZXMoJ2tpbGwnKVxuXHRcdFx0XHRcdCYmICFwcm9jZXNzLmFyZ3MuaW5jbHVkZXMoJ3VuaW5zdGFsbCcpKS5sZW5ndGgsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHdhc0tpbGxlZDogZmFsc2UsXG5cdFx0XHRcdHR1bm5lbFByb2Nlc3NDb3VudDogMSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRmb3IgKGNvbnN0IHByb2Nlc3Mgb2YgcHJvY2Vzc2VzKSB7XG5cdFx0XHRcdHByb2Nlc3MuZW1pdEV4aXQoKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gc2V0SW1tZWRpYXRlKHJlc29sdmUpKTtcblx0XHRcdGNvb3JkaW5hdG9yLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RhcnRzIHdoZW4gdGhlIHNlc3Npb24gdG9rZW4gY2hhbmdlcyBldmVuIHRob3VnaCBtb2RlIGFuZCBuYW1lIGRvIG5vdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNvb3JkaW5hdG9yLCBwcm9jZXNzZXMgfSA9IGNyZWF0ZUNvb3JkaW5hdG9yKCk7XG5cdFx0Y29uc3QgY291bnRUdW5uZWxzID0gKCkgPT4gcHJvY2Vzc2VzLmZpbHRlcihwID0+IHAuYXJnc1swXSA9PT0gJ3R1bm5lbCdcblx0XHRcdCYmICFwLmFyZ3MuaW5jbHVkZXMoJ3N0YXR1cycpICYmICFwLmFyZ3MuaW5jbHVkZXMoJ2xvZ2luJylcblx0XHRcdCYmICFwLmFyZ3MuaW5jbHVkZXMoJ2luc3RhbGwnKSAmJiAhcC5hcmdzLmluY2x1ZGVzKCdraWxsJykgJiYgIXAuYXJncy5pbmNsdWRlcygndW5pbnN0YWxsJykpLmxlbmd0aDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgY29vcmRpbmF0b3Iuc2V0UmVtb3RlQWNjZXNzKGFjdGl2ZU1vZGUoKSwgTG9nTGV2ZWwuSW5mbyk7XG5cdFx0XHRjb25zdCBiZWZvcmUgPSBjb3VudFR1bm5lbHMoKTtcblxuXHRcdFx0Ly8gQSByZWZyZXNoZWQgdG9rZW4gaGFzIHRvIHJlYWNoIGEgbmV3IHByb2Nlc3M7IHNraXBwaW5nIHRoZVxuXHRcdFx0Ly8gcmVjb25jaWxlIHdvdWxkIGxlYXZlIHRoZSB0dW5uZWwgcnVubmluZyBvbiB0aGUgc3RhbGUgb25lLlxuXHRcdFx0Y29uc3QgcmVmcmVzaGVkOiBBY3RpdmVUdW5uZWxNb2RlID0ge1xuXHRcdFx0XHRhY3RpdmU6IHRydWUsXG5cdFx0XHRcdGFzU2VydmljZTogZmFsc2UsXG5cdFx0XHRcdHNlc3Npb246IHsgcHJvdmlkZXJJZDogJ2dpdGh1YicsIHNlc3Npb25JZDogJ3Nlc3Npb24nLCBhY2NvdW50TGFiZWw6ICdhY2NvdW50JywgdG9rZW46ICdyZWZyZXNoZWQtdG9rZW4nIH0sXG5cdFx0XHR9O1xuXHRcdFx0YXdhaXQgY29vcmRpbmF0b3Iuc2V0UmVtb3RlQWNjZXNzKHJlZnJlc2hlZCwgTG9nTGV2ZWwuSW5mbyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBiZWZvcmUsIGFmdGVyOiBjb3VudFR1bm5lbHMoKSB9LCB7IGJlZm9yZTogMSwgYWZ0ZXI6IDIgfSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGZvciAoY29uc3QgcHJvY2VzcyBvZiBwcm9jZXNzZXMpIHtcblx0XHRcdFx0cHJvY2Vzcy5lbWl0RXhpdCgpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBzZXRJbW1lZGlhdGUocmVzb2x2ZSkpO1xuXHRcdFx0Y29vcmRpbmF0b3IuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVzdGFydHMgYSBydW4gdGhhdCBhbHJlYWR5IHJlcG9ydGVkIGRpc2Nvbm5lY3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNvb3JkaW5hdG9yLCBwcm9jZXNzZXMgfSA9IGNyZWF0ZUNvb3JkaW5hdG9yKCk7XG5cdFx0Y29uc3QgY291bnRUdW5uZWxzID0gKCkgPT4gcHJvY2Vzc2VzLmZpbHRlcihwID0+IHAuYXJnc1swXSA9PT0gJ3R1bm5lbCdcblx0XHRcdCYmICFwLmFyZ3MuaW5jbHVkZXMoJ3N0YXR1cycpICYmICFwLmFyZ3MuaW5jbHVkZXMoJ2xvZ2luJylcblx0XHRcdCYmICFwLmFyZ3MuaW5jbHVkZXMoJ2luc3RhbGwnKSAmJiAhcC5hcmdzLmluY2x1ZGVzKCdraWxsJykgJiYgIXAuYXJncy5pbmNsdWRlcygndW5pbnN0YWxsJykpLmxlbmd0aDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgY29vcmRpbmF0b3Iuc2V0UmVtb3RlQWNjZXNzKGFjdGl2ZU1vZGUoKSwgTG9nTGV2ZWwuSW5mbyk7XG5cdFx0XHRjb25zdCBiZWZvcmUgPSBjb3VudFR1bm5lbHMoKTtcblxuXHRcdFx0Ly8gQSB0b2tlbiBlcnJvciBjYW5jZWxzIHRoZSBjaGlsZCBhbmQgcmVwb3J0cyBkaXNjb25uZWN0ZWQgYmVmb3JlIGl0XG5cdFx0XHQvLyBleGl0cy4gVHJlYXRpbmcgdGhhdCBydW4gYXMgaGVhbHRoeSB3b3VsZCBza2lwIHRoZSByZWNvbmNpbGUgYW5kXG5cdFx0XHQvLyBsZWF2ZSBub3RoaW5nIHJ1bm5pbmcgb25jZSB0aGUgY2FuY2VsbGVkIGNoaWxkIGdvZXMgYXdheS5cblx0XHRcdGNvb3JkaW5hdG9yLnNldFJlbW90ZUFjY2Vzc1N0YXR1cyh7IHR5cGU6ICdkaXNjb25uZWN0ZWQnIH0pO1xuXHRcdFx0YXdhaXQgY29vcmRpbmF0b3Iuc2V0UmVtb3RlQWNjZXNzKGFjdGl2ZU1vZGUoKSwgTG9nTGV2ZWwuSW5mbyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBiZWZvcmUsIGFmdGVyOiBjb3VudFR1bm5lbHMoKSB9LCB7IGJlZm9yZTogMSwgYWZ0ZXI6IDIgfSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGZvciAoY29uc3QgcHJvY2VzcyBvZiBwcm9jZXNzZXMpIHtcblx0XHRcdFx0cHJvY2Vzcy5lbWl0RXhpdCgpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBzZXRJbW1lZGlhdGUocmVzb2x2ZSkpO1xuXHRcdFx0Y29vcmRpbmF0b3IuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVzdGFydCgpIHN0aWxsIHJlcGxhY2VzIGEgaGVhbHRoeSB0dW5uZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb29yZGluYXRvciwgcHJvY2Vzc2VzIH0gPSBjcmVhdGVDb29yZGluYXRvcigpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBjb29yZGluYXRvci5zZXRSZW1vdGVBY2Nlc3MoYWN0aXZlTW9kZSgpLCBMb2dMZXZlbC5JbmZvKTtcblx0XHRcdGNvbnN0IHR1bm5lbCA9IHByb2Nlc3Nlcy5maW5kKHByb2Nlc3MgPT4gcHJvY2Vzcy5hcmdzLmluY2x1ZGVzKCctLWFjY2VwdC1zZXJ2ZXItbGljZW5zZS10ZXJtcycpKSE7XG5cdFx0XHRhd2FpdCBjb29yZGluYXRvci5yZXN0YXJ0KCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dW5uZWwud2FzS2lsbGVkKCksIHRydWUpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRmb3IgKGNvbnN0IHByb2Nlc3Mgb2YgcHJvY2Vzc2VzKSB7XG5cdFx0XHRcdHByb2Nlc3MuZW1pdEV4aXQoKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gc2V0SW1tZWRpYXRlKHJlc29sdmUpKTtcblx0XHRcdGNvb3JkaW5hdG9yLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXJ0cyBhIHNlc3Npb24gdHVubmVsIGFsb25nc2lkZSB0aGUgaW5zdGFsbGVkIHNlcnZpY2Ugc28gcmVhZGluZXNzIGNhbiBhZHZhbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29vcmRpbmF0b3IsIHByb2Nlc3NlcyB9ID0gY3JlYXRlQ29vcmRpbmF0b3IoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgY29vcmRpbmF0b3Iuc2V0UmVtb3RlQWNjZXNzKGFjdGl2ZU1vZGUodHJ1ZSksIExvZ0xldmVsLkluZm8pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblR1bm5lbCA9IHByb2Nlc3Nlcy5maW5kKHByb2Nlc3MgPT4gcHJvY2Vzcy5hcmdzLmluY2x1ZGVzKCctLWFjY2VwdC1zZXJ2ZXItbGljZW5zZS10ZXJtcycpXG5cdFx0XHRcdCYmICFwcm9jZXNzLmFyZ3MuaW5jbHVkZXMoJ2luc3RhbGwnKSk7XG5cblx0XHRcdC8vIFdpdGhvdXQgYSBzZXNzaW9uIHByb2Nlc3Mgbm90aGluZyBldmVyIHJlcG9ydHMgY29ubmVjdGVkLCBzbyB0aGVcblx0XHRcdC8vIFVJIHN0YXlzIHN0dWNrIG9uIFwiY29ubmVjdGluZ1wiIGFmdGVyIHRoZSBzZXJ2aWNlIGlzIGluc3RhbGxlZC5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRpbnN0YWxsZWQ6IHByb2Nlc3Nlcy5zb21lKHByb2Nlc3MgPT4gcHJvY2Vzcy5hcmdzLmluY2x1ZGVzKCdpbnN0YWxsJykpLFxuXHRcdFx0XHRzdGFydGVkU2Vzc2lvblR1bm5lbDogISFzZXNzaW9uVHVubmVsLFxuXHRcdFx0XHRtb2RlOiBjb29yZGluYXRvci5nZXRTdGF0dXMoKS5tb2RlLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpbnN0YWxsZWQ6IHRydWUsXG5cdFx0XHRcdHN0YXJ0ZWRTZXNzaW9uVHVubmVsOiB0cnVlLFxuXHRcdFx0XHRtb2RlOiAnc2VydmljZScsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Zm9yIChjb25zdCBwcm9jZXNzIG9mIHByb2Nlc3Nlcykge1xuXHRcdFx0XHRwcm9jZXNzLmVtaXRFeGl0KCk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldEltbWVkaWF0ZShyZXNvbHZlKSk7XG5cdFx0XHRjb29yZGluYXRvci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIGhvc3RpbmcgaW4tc2Vzc2lvbiB3aGVuIHRoZSBzZXJ2aWNlIGluc3RhbGwgZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb29yZGluYXRvciwgcHJvY2Vzc2VzIH0gPSBjcmVhdGVDb29yZGluYXRvcih0cnVlLCB1bmRlZmluZWQsIDEpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBjb29yZGluYXRvci5zZXRSZW1vdGVBY2Nlc3MoYWN0aXZlTW9kZSh0cnVlKSwgTG9nTGV2ZWwuSW5mbyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZXJ2aWNlSW5zdGFsbEZhaWxlZDogY29vcmRpbmF0b3IuZ2V0U3RhdHVzKCkuc2VydmljZUluc3RhbGxGYWlsZWQsXG5cdFx0XHRcdHN0YXJ0ZWRTZXNzaW9uVHVubmVsOiBwcm9jZXNzZXMuc29tZShwcm9jZXNzID0+IHByb2Nlc3MuYXJncy5pbmNsdWRlcygnLS1hY2NlcHQtc2VydmVyLWxpY2Vuc2UtdGVybXMnKVxuXHRcdFx0XHRcdCYmICFwcm9jZXNzLmFyZ3MuaW5jbHVkZXMoJ2luc3RhbGwnKSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNlcnZpY2VJbnN0YWxsRmFpbGVkOiB0cnVlLFxuXHRcdFx0XHRzdGFydGVkU2Vzc2lvblR1bm5lbDogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRmb3IgKGNvbnN0IHByb2Nlc3Mgb2YgcHJvY2Vzc2VzKSB7XG5cdFx0XHRcdHByb2Nlc3MuZW1pdEV4aXQoKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gc2V0SW1tZWRpYXRlKHJlc29sdmUpKTtcblx0XHRcdGNvb3JkaW5hdG9yLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3dhaXRzIGZvciB0aGUgcHJpb3IgdHVubmVsIHByb2Nlc3MgdG8gZXhpdCBiZWZvcmUgc3Bhd25pbmcgaXRzIHJlcGxhY2VtZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG9yZGVyaW5nOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHsgY29vcmRpbmF0b3IsIHByb2Nlc3NlcyB9ID0gY3JlYXRlQ29vcmRpbmF0b3IoZmFsc2UsIG9yZGVyaW5nKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgY29vcmRpbmF0b3Iuc2V0QWdlbnRIb3N0U2hhcmluZyhhZ2VudFJlcXVlc3QoKSk7XG5cdFx0XHRjb25zdCBhZ2VudEhvc3QgPSBwcm9jZXNzZXMuZmluZChwcm9jZXNzID0+IHByb2Nlc3MuYXJncy5pbmNsdWRlcygnLS1hZ2VudC1ob3N0LW9ubHknKSkhO1xuXHRcdFx0Y29uc3QgdHJhbnNpdGlvbiA9IGNvb3JkaW5hdG9yLnNldFJlbW90ZUFjY2VzcyhhY3RpdmVNb2RlKCksIExvZ0xldmVsLkluZm8pO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBzZXRJbW1lZGlhdGUocmVzb2x2ZSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcmRlcmluZywgWydzcGF3bi1hZ2VudC1ob3N0JywgJ2tpbGwtYWdlbnQtaG9zdCddKTtcblxuXHRcdFx0YWdlbnRIb3N0LmVtaXRFeGl0KCk7XG5cdFx0XHRhd2FpdCB0cmFuc2l0aW9uO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcmRlcmluZywgWydzcGF3bi1hZ2VudC1ob3N0JywgJ2tpbGwtYWdlbnQtaG9zdCcsICdleGl0LWFnZW50LWhvc3QnLCAnc3Bhd24tcmVtb3RlLWFjY2VzcyddKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Zm9yIChjb25zdCBwcm9jZXNzIG9mIHByb2Nlc3Nlcykge1xuXHRcdFx0XHRwcm9jZXNzLmVtaXRFeGl0KCk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldEltbWVkaWF0ZShyZXNvbHZlKSk7XG5cdFx0XHRjb29yZGluYXRvci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZXN1bWVzIGFnZW50LWhvc3Qtb25seSB3aGVuIHJlbW90ZSBhY2Nlc3Mgc3RvcHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb29yZGluYXRvciwgcHJvY2Vzc2VzIH0gPSBjcmVhdGVDb29yZGluYXRvcigpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBjb29yZGluYXRvci5zZXRBZ2VudEhvc3RTaGFyaW5nKGFnZW50UmVxdWVzdCgpKTtcblx0XHRcdGF3YWl0IGNvb3JkaW5hdG9yLnNldFJlbW90ZUFjY2VzcyhhY3RpdmVNb2RlKCksIExvZ0xldmVsLkluZm8pO1xuXHRcdFx0YXdhaXQgY29vcmRpbmF0b3Iuc2V0UmVtb3RlQWNjZXNzKElOQUNUSVZFX1RVTk5FTF9NT0RFLCBMb2dMZXZlbC5JbmZvKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm9jZXNzZXMuZmlsdGVyKHByb2Nlc3MgPT4gcHJvY2Vzcy5hcmdzLmluY2x1ZGVzKCctLWFnZW50LWhvc3Qtb25seScpKS5tYXAocHJvY2VzcyA9PiBwcm9jZXNzLmFyZ3MpLCBbXG5cdFx0XHRcdFsndHVubmVsJywgJy0tYWdlbnQtaG9zdC1vbmx5JywgJy0tbmFtZScsICd0ZXN0X2hvc3QnLCAnLS11c2VyLWRhdGEtZGlyJywgJ2N1c3RvbS11c2VyLWRhdGEnLCAnLS1kZWxlZ2F0ZS10by1lZGl0b3InLCAnLS1wYXJlbnQtcHJvY2Vzcy1pZCcsIFN0cmluZyhwcm9jZXNzLnBpZCldLFxuXHRcdFx0XHRbJ3R1bm5lbCcsICctLWFnZW50LWhvc3Qtb25seScsICctLW5hbWUnLCAndGVzdF9ob3N0JywgJy0tdXNlci1kYXRhLWRpcicsICdjdXN0b20tdXNlci1kYXRhJywgJy0tZGVsZWdhdGUtdG8tZWRpdG9yJywgJy0tcGFyZW50LXByb2Nlc3MtaWQnLCBTdHJpbmcocHJvY2Vzcy5waWQpXSxcblx0XHRcdF0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjb29yZGluYXRvci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgcmVtb3RlIGFjY2VzcyBzZXNzaW9uIGFuZCBzZXJ2aWNlIENMSSBhcmd1bWVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZUNvb3JkaW5hdG9yKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZUNvb3JkaW5hdG9yKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlc3Npb24uY29vcmRpbmF0b3Iuc2V0UmVtb3RlQWNjZXNzKGFjdGl2ZU1vZGUoKSwgTG9nTGV2ZWwuSW5mbyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNvb3JkaW5hdG9yLnNldFJlbW90ZUFjY2VzcyhhY3RpdmVNb2RlKHRydWUpLCBMb2dMZXZlbC5JbmZvKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZXNzaW9uOiBzZXNzaW9uLnByb2Nlc3Nlcy5maW5kKHByb2Nlc3MgPT4gcHJvY2Vzcy5hcmdzLmluY2x1ZGVzKCctLWFjY2VwdC1zZXJ2ZXItbGljZW5zZS10ZXJtcycpKSEuYXJncyxcblx0XHRcdFx0c2VydmljZTogc2VydmljZS5wcm9jZXNzZXMuZmluZChwcm9jZXNzID0+IHByb2Nlc3MuYXJncy5pbmNsdWRlcygnaW5zdGFsbCcpKSEuYXJncyxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2Vzc2lvbjogWyd0dW5uZWwnLCAnLS1hY2NlcHQtc2VydmVyLWxpY2Vuc2UtdGVybXMnLCAnLS1sb2cnLCAnaW5mbycsICctLXVzZXItZGF0YS1kaXInLCAnY3VzdG9tLXVzZXItZGF0YScsICctLWRlbGVnYXRlLXRvLWVkaXRvcicsICctLW5hbWUnLCAndGVzdF9ob3N0JywgJy0tcGFyZW50LXByb2Nlc3MtaWQnLCBTdHJpbmcocHJvY2Vzcy5waWQpXSxcblx0XHRcdFx0c2VydmljZTogWyd0dW5uZWwnLCAnc2VydmljZScsICdpbnN0YWxsJywgJy0tYWNjZXB0LXNlcnZlci1saWNlbnNlLXRlcm1zJywgJy0tbG9nJywgJ2luZm8nLCAnLS11c2VyLWRhdGEtZGlyJywgJ2N1c3RvbS11c2VyLWRhdGEnLCAnLS1uYW1lJywgJ3Rlc3RfaG9zdCddLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGZvciAoY29uc3QgcHJvY2VzcyBvZiBbLi4uc2Vzc2lvbi5wcm9jZXNzZXMsIC4uLnNlcnZpY2UucHJvY2Vzc2VzXSkge1xuXHRcdFx0XHRwcm9jZXNzLmVtaXRFeGl0KCk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldEltbWVkaWF0ZShyZXNvbHZlKSk7XG5cdFx0XHRzZXNzaW9uLmNvb3JkaW5hdG9yLmRpc3Bvc2UoKTtcblx0XHRcdHNlcnZpY2UuY29vcmRpbmF0b3IuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgndW5pbnN0YWxscyB0aGUgc2VydmljZSBldmVuIHdoZW4gYSBzaGFyaW5nIHVwZGF0ZSBwcmVlbXB0cyB0aGUgcmVjb25jaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29vcmRpbmF0b3IsIHByb2Nlc3NlcyB9ID0gY3JlYXRlQ29vcmRpbmF0b3IoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgY29vcmRpbmF0b3Iuc2V0UmVtb3RlQWNjZXNzKGFjdGl2ZU1vZGUodHJ1ZSksIExvZ0xldmVsLkluZm8pO1xuXHRcdFx0Ly8gVHVybmluZyB0aGUgc2VydmljZSBvZmYgb3dlcyBhbiB1bmluc3RhbGwuIFN0YXJ0aW5nIGFnZW50IGhvc3Rcblx0XHRcdC8vIHNoYXJpbmcgaW4gdGhlIHNhbWUgdGljayBidW1wcyB0aGUgZ2VuZXJhdGlvbiBhbmQgcHJlZW1wdHMgdGhlXG5cdFx0XHQvLyByZWNvbmNpbGUgdGhhdCB3b3VsZCBoYXZlIHJ1biBpdCwgc28gdGhlIHJlcXVpcmVtZW50IGhhcyB0b1xuXHRcdFx0Ly8gc3Vydml2ZSBpbnRvIHRoZSByZXBsYWNlbWVudCBnZW5lcmF0aW9uLlxuXHRcdFx0Y29uc3Qgc3RvcFNlcnZpY2UgPSBjb29yZGluYXRvci5zZXRSZW1vdGVBY2Nlc3MoSU5BQ1RJVkVfVFVOTkVMX01PREUsIExvZ0xldmVsLkluZm8pO1xuXHRcdFx0Y29uc3Qgc2hhcmUgPSBjb29yZGluYXRvci5zZXRBZ2VudEhvc3RTaGFyaW5nKGFnZW50UmVxdWVzdCgpKTtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtzdG9wU2VydmljZSwgc2hhcmVdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHVuaW5zdGFsbGVkOiBwcm9jZXNzZXMuc29tZShwcm9jZXNzID0+IHByb2Nlc3MuYXJncy5pbmNsdWRlcygndW5pbnN0YWxsJykpLFxuXHRcdFx0XHRhZ2VudEhvc3RTdGFydGVkOiBwcm9jZXNzZXMuc29tZShwcm9jZXNzID0+IHByb2Nlc3MuYXJncy5pbmNsdWRlcygnLS1hZ2VudC1ob3N0LW9ubHknKSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHVuaW5zdGFsbGVkOiB0cnVlLFxuXHRcdFx0XHRhZ2VudEhvc3RTdGFydGVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNvb3JkaW5hdG9yLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBhbmQgZmFucyBtYWNoaW5lLXN0YXR1cyBldmVudHMgdG8gZXZlcnkgcmVnaXN0ZXJlZCBjb25zdW1lcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNvb3JkaW5hdG9yLCBwcm9jZXNzZXMgfSA9IGNyZWF0ZUNvb3JkaW5hdG9yKCk7XG5cdFx0Y29uc3QgZmlyc3Q6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3Qgc2Vjb25kOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGZpcnN0TGlzdGVuZXIgPSBjb29yZGluYXRvci5vbkRpZE1hY2hpbmVTdGF0dXMoZXZlbnQgPT4gZmlyc3QucHVzaChldmVudC5zdGF0dXMudHlwZSkpO1xuXHRcdGNvbnN0IHNlY29uZExpc3RlbmVyID0gY29vcmRpbmF0b3Iub25EaWRNYWNoaW5lU3RhdHVzKGV2ZW50ID0+IHNlY29uZC5wdXNoKGV2ZW50LnN0YXR1cy50eXBlKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGNvb3JkaW5hdG9yLnNldEFnZW50SG9zdFNoYXJpbmcoYWdlbnRSZXF1ZXN0KCkpO1xuXHRcdFx0Y29uc3QgYWdlbnRIb3N0ID0gcHJvY2Vzc2VzLmZpbmQocHJvY2VzcyA9PiBwcm9jZXNzLmFyZ3MuaW5jbHVkZXMoJy0tYWdlbnQtaG9zdC1vbmx5JykpITtcblx0XHRcdGFnZW50SG9zdC5zdGRvdXQud3JpdGUoJ19fVlNDT0RFX0NMSV9TVEFUVVNfX3tcInR5cGVcIjpcImNvbm5lY3RlZFwiLFwidHVubmVsTmFtZVwiOlwidGVzdF9ob3N0XCIsXCJpc0F0dGFjaGVkXCI6ZmFsc2V9XFxuJyk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldEltbWVkaWF0ZShyZXNvbHZlKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Zmlyc3QsXG5cdFx0XHRcdHNlY29uZCxcblx0XHRcdFx0c3RhdHVzOiBjb29yZGluYXRvci5nZXRTdGF0dXMoKS5jb25uZWN0aW9uU3RhdGUsXG5cdFx0XHRcdG1hY2hpbmVTdGF0dXNFbnZpcm9ubWVudDogYWdlbnRIb3N0LmVudj8uVlNDT0RFX0NMSV9NQUNISU5FX1NUQVRVUyxcblx0XHRcdH0sIHtcblx0XHRcdFx0Zmlyc3Q6IFsnY29ubmVjdGVkJ10sXG5cdFx0XHRcdHNlY29uZDogWydjb25uZWN0ZWQnXSxcblx0XHRcdFx0c3RhdHVzOiAnY29ubmVjdGVkJyxcblx0XHRcdFx0bWFjaGluZVN0YXR1c0Vudmlyb25tZW50OiAnMScsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Zmlyc3RMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRzZWNvbmRMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRjb29yZGluYXRvci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCO0FBR3pCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQTJCLDRCQUE0QjtBQUN2RCxTQUFTLHFCQUFzQztBQUMvQyxTQUFtQywwQkFBMEIsZ0NBQWdDO0FBQzdGLFNBQVMsK0NBQStDO0FBYXhELFNBQVMsY0FBYyxNQUF5QixVQUFtQixjQUF1QixhQUFhLE1BQU0sS0FBeUIsV0FBVyxHQUFxQjtBQUNySyxRQUFNLFNBQVMsSUFBSSxZQUFZO0FBQy9CLFFBQU0sU0FBUyxJQUFJ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
