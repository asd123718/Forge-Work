import assert from "assert";
import { DeferredPromise, raceTimeout, timeout } from "../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { FileService } from "../../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../../log/common/log.js";
import { NullTelemetryServiceShape } from "../../../../telemetry/common/telemetryUtils.js";
import { TelemetryLevel } from "../../../../telemetry/common/telemetry.js";
import { EditArcReporterService } from "../../../node/shared/editArcReporter.js";
import { TestDiffComputeService, createNoopGitService } from "../../common/sessionTestHelpers.js";
import { buildSubagentChatUri } from "../../../common/state/sessionState.js";
import { AgentHostClientType } from "../../../common/agentHostClientInfo.js";
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind } from "../../../common/agentHostTelemetry.js";
class CountingFileService extends FileService {
  constructor() {
    super(...arguments);
    this.watcherCount = 0;
  }
  createWatcher(resource, options) {
    this.watcherCount++;
    return super.createWatcher(resource, options);
  }
}
class RecordingTelemetryService extends NullTelemetryServiceShape {
  constructor() {
    super();
    this.events = [];
    this.githubEvents = [];
    Object.defineProperty(this, "telemetryLevel", { value: TelemetryLevel.USAGE });
  }
  publicLog2(eventName, data) {
    const event = { name: eventName ?? "", data: data ?? {} };
    this.events.push(event);
    this.onEvent?.(event);
  }
  updateTelemetryLevel() {
  }
  sendGHTelemetryEvent(name, properties, measurements) {
    this.githubEvents.push({ name, properties, measurements });
  }
}
suite("Agent Host Edit ARC Reporter", () => {
  const disposables = new DisposableStore();
  let fileService;
  let telemetry;
  let config;
  setup(() => {
    fileService = disposables.add(new CountingFileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    telemetry = new RecordingTelemetryService();
    config = createConfigurationService(true, disposables);
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("emits the locked Microsoft and GitHub event shape", async () => {
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("hello AI"));
    const service = disposables.add(new EditArcReporterService([0, 30, 60], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));
    await service.reportEdit({
      clientContext: {
        clientType: AgentHostClientType.EditorWindow,
        connectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
        transportKind: AgentHostTransportKind.MessagePort,
        hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
        machineId: "client-machine-id",
        devDeviceId: "client-dev-device-id"
      },
      sessionUri: "copilotcli:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "hello",
      afterText: "hello AI",
      initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: " AI" }] },
      modelId: "gpt-5",
      toolName: "edit",
      completionTime: Date.now()
    });
    await timeout(10);
    const event = telemetry.events[0];
    assert.deepStrictEqual({
      name: event.name,
      data: { ...event.data, uniqueEditId: "<uuid>" },
      githubName: telemetry.githubEvents[0]?.name,
      githubIdentity: {
        initiatorMachineId: telemetry.githubEvents[0]?.properties?.initiatorMachineId,
        initiatorDevDeviceId: telemetry.githubEvents[0]?.properties?.initiatorDevDeviceId
      }
    }, {
      name: "editTelemetry.reportEditArc",
      data: {
        initiatorClientType: "editor_window",
        initiatorConnectionKind: "remote_extension_host",
        initiatorTransportKind: "message_port",
        hostLaunchKind: "vscode_main_process",
        initiatorMachineId: "client-machine-id",
        initiatorDevDeviceId: "client-dev-device-id",
        sourceKeyCleaned: "source:Chat.applyEdits",
        extensionId: void 0,
        extensionVersion: void 0,
        opportunityId: void 0,
        editSessionId: "session-1",
        requestId: "turn-1",
        modelId: "gpt-5",
        languageId: void 0,
        mode: void 0,
        uniqueEditId: "<uuid>",
        provider: "copilotcli",
        agentSessionId: "session-1",
        isSubagentSession: "false",
        didBranchChange: 0,
        timeDelayMs: 0,
        originalCharCount: 3,
        originalLineCount: 1,
        originalDeletedLineCount: 1,
        arc: 3,
        currentLineCount: 1,
        currentDeletedLineCount: 1
      },
      githubName: "vscode.editTelemetry.reportEditArc",
      githubIdentity: {
        initiatorMachineId: void 0,
        initiatorDevDeviceId: void 0
      }
    });
  });
  test("reports edits from subagent chat channels", async () => {
    const resource = URI.file("/workspace/subagent.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("hello AI"));
    const service = disposables.add(new EditArcReporterService([0], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));
    await service.reportEdit({
      sessionUri: buildSubagentChatUri("copilotcli:/session-1", "parent-tool"),
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "hello",
      afterText: "hello AI",
      initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: " AI" }] },
      completionTime: Date.now()
    });
    await timeout(10);
    assert.deepStrictEqual({
      editSessionId: telemetry.events[0].data.editSessionId,
      agentSessionId: telemetry.events[0].data.agentSessionId,
      isSubagentSession: telemetry.events[0].data.isSubagentSession
    }, {
      editSessionId: "session-1",
      agentSessionId: "session-1",
      isSubagentSession: "true"
    });
  });
  test("updates older reporters before starting the next reporter", async () => {
    const resource = URI.file("/workspace/order.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("AIbase"));
    const service = disposables.add(new EditArcReporterService([0, 30, 60], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));
    const completionTime = Date.now();
    await service.reportEdit({
      sessionUri: "claude:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "base",
      afterText: "AIbase",
      initialEdit: { replacements: [{ start: 0, endExclusive: 0, text: "AI" }] },
      completionTime
    });
    await timeout(10);
    const firstEditId = telemetry.events[0].data.uniqueEditId;
    const finalSampleEmitted = new DeferredPromise();
    telemetry.onEvent = (event) => {
      if (event.data.uniqueEditId === firstEditId && event.data.timeDelayMs === 60) {
        finalSampleEmitted.complete();
      }
    };
    await fileService.writeFile(resource, VSBuffer.fromString("Abase"));
    await service.reportEdit({
      sessionUri: "claude:/session-1",
      turnId: "turn-2",
      toolCallId: "tool-2",
      filePath: resource.fsPath,
      beforeText: "AIbase",
      afterText: "Abase",
      initialEdit: { replacements: [{ start: 1, endExclusive: 2, text: "" }] },
      completionTime: Date.now()
    });
    const samplingCompleted = await raceTimeout(Promise.all([finalSampleEmitted.p]), 5e3);
    assert.deepStrictEqual({
      samplingCompleted: samplingCompleted !== void 0,
      events: telemetry.events.filter((event) => event.data.uniqueEditId === firstEditId).map((event) => ({ timeDelayMs: event.data.timeDelayMs, arc: event.data.arc }))
    }, {
      samplingCompleted: true,
      events: [
        { timeDelayMs: 0, arc: 2 },
        { timeDelayMs: 30, arc: 1 },
        { timeDelayMs: 60, arc: 1 }
      ]
    });
    assert.deepStrictEqual(telemetry.githubEvents, []);
  });
  test("does not create a reporter after reconciliation state is disposed", async () => {
    const detailedStarted = new DeferredPromise();
    const detailedResult = new DeferredPromise();
    const diffComputeService = {
      _serviceBrand: void 0,
      computeDiffCounts: async () => ({ added: 0, removed: 0, changes: [] }),
      computeDetailedDiff: async () => {
        detailedStarted.complete();
        return detailedResult.p;
      }
    };
    const resource = URI.file("/workspace/stale.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("AIbase"));
    const service = disposables.add(new EditArcReporterService([0, 6e4], fileService, diffComputeService, createNoopGitService(), config, new NullLogService(), telemetry));
    await service.reportEdit({
      sessionUri: "claude:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "base",
      afterText: "AIbase",
      initialEdit: { replacements: [{ start: 0, endExclusive: 0, text: "AI" }] },
      completionTime: Date.now()
    });
    await timeout(10);
    const secondReport = service.reportEdit({
      sessionUri: "claude:/session-1",
      turnId: "turn-2",
      toolCallId: "tool-2",
      filePath: resource.fsPath,
      beforeText: "unrelated",
      afterText: "newbase",
      initialEdit: { replacements: [{ start: 0, endExclusive: 9, text: "newbase" }] },
      completionTime: Date.now()
    });
    await detailedStarted.p;
    config.setEnabled(false);
    config.setEnabled(true);
    detailedResult.complete({
      added: 1,
      removed: 1,
      replacements: [{ start: 0, endExclusive: 6, text: "newbase" }],
      hitTimeout: false
    });
    await secondReport;
    await timeout(10);
    assert.deepStrictEqual(telemetry.events.map((event) => event.data.requestId), ["turn-1"]);
  });
  test("does not create resource watchers after the host reporter limit is reached", async () => {
    const service = disposables.add(new EditArcReporterService([6e4], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));
    for (let index = 0; index <= 200; index++) {
      await service.reportEdit({
        sessionUri: "claude:/session-1",
        turnId: `turn-${index}`,
        toolCallId: `tool-${index}`,
        filePath: `/workspace/file-${index}.ts`,
        beforeText: "",
        afterText: "AI",
        initialEdit: { replacements: [{ start: 0, endExclusive: 0, text: "AI" }] },
        completionTime: Date.now()
      });
    }
    assert.strictEqual(fileService.watcherCount, 200);
  });
  test("disposes active reporters when edit telemetry is disabled", async () => {
    const resource = URI.file("/workspace/disabled.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("hello AI"));
    const service = disposables.add(new EditArcReporterService([0, 30, 60], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));
    await service.reportEdit({
      sessionUri: "claude:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "hello",
      afterText: "hello AI",
      initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: " AI" }] },
      completionTime: Date.now()
    });
    await timeout(10);
    config.setEnabled(false);
    await timeout(70);
    assert.deepStrictEqual(telemetry.events.map((event) => event.data.timeDelayMs), [0]);
  });
  test("continues sampling after a sample fails", async () => {
    const resource = URI.file("/workspace/failure.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("hello AI"));
    const sampleFailed = new DeferredPromise();
    const finalSampleEmitted = new DeferredPromise();
    telemetry.onEvent = (event) => {
      if (event.data.timeDelayMs === 60) {
        finalSampleEmitted.complete();
      }
    };
    let branchLookupCount = 0;
    const gitService = {
      ...createNoopGitService(),
      getCurrentBranchName: async () => {
        branchLookupCount++;
        if (branchLookupCount === 3) {
          sampleFailed.complete();
          throw new Error("branch lookup failed");
        }
        return "main";
      }
    };
    const service = disposables.add(new EditArcReporterService([0, 30, 60], fileService, new TestDiffComputeService(), gitService, config, new NullLogService(), telemetry));
    await service.reportEdit({
      sessionUri: "claude:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "hello",
      afterText: "hello AI",
      initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: " AI" }] },
      completionTime: Date.now()
    });
    const samplingCompleted = await raceTimeout(Promise.all([sampleFailed.p, finalSampleEmitted.p]), 5e3);
    assert.deepStrictEqual({
      samplingCompleted: samplingCompleted !== void 0,
      timeDelays: telemetry.events.map((event) => event.data.timeDelayMs)
    }, {
      samplingCompleted: true,
      timeDelays: [0, 60]
    });
  });
  test("reports symbolic branch changes", async () => {
    const resource = URI.file("/workspace/branch.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("hello AI"));
    let branch = "main";
    const gitService = {
      ...createNoopGitService(),
      getCurrentBranchName: async () => branch
    };
    const service = disposables.add(new EditArcReporterService([0, 30], fileService, new TestDiffComputeService(), gitService, config, new NullLogService(), telemetry));
    await service.reportEdit({
      sessionUri: "claude:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "hello",
      afterText: "hello AI",
      initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: " AI" }] },
      completionTime: Date.now()
    });
    await timeout(10);
    branch = "feature";
    await timeout(40);
    assert.deepStrictEqual(telemetry.events.map((event) => ({
      timeDelayMs: event.data.timeDelayMs,
      didBranchChange: event.data.didBranchChange
    })), [
      { timeDelayMs: 0, didBranchChange: 0 },
      { timeDelayMs: 30, didBranchChange: 1 }
    ]);
  });
  test("retains the repository root when the edited parent directory is deleted", async () => {
    const resource = URI.file("/workspace/removed/branch.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("hello AI"));
    const repositoryRoot = URI.file("/workspace");
    const fileDirectory = URI.file("/workspace/removed");
    let fileDirectoryExists = true;
    const gitService = {
      ...createNoopGitService(),
      getRepositoryRoot: async () => repositoryRoot,
      getCurrentBranchName: async (workingDirectory) => {
        if (workingDirectory.toString() === repositoryRoot.toString()) {
          return "main";
        }
        return fileDirectoryExists && workingDirectory.toString() === fileDirectory.toString() ? "main" : void 0;
      }
    };
    const service = disposables.add(new EditArcReporterService([0, 30], fileService, new TestDiffComputeService(), gitService, config, new NullLogService(), telemetry));
    await service.reportEdit({
      sessionUri: "claude:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "hello",
      afterText: "hello AI",
      initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: " AI" }] },
      completionTime: Date.now()
    });
    await timeout(10);
    fileDirectoryExists = false;
    await timeout(40);
    assert.deepStrictEqual(telemetry.events.map((event) => ({
      timeDelayMs: event.data.timeDelayMs,
      didBranchChange: event.data.didBranchChange
    })), [
      { timeDelayMs: 0, didBranchChange: 0 },
      { timeDelayMs: 30, didBranchChange: 0 }
    ]);
  });
  test("treats deletion as removal of the tracked edit", async () => {
    const resource = URI.file("/workspace/deleted.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("hello AI"));
    const service = disposables.add(new EditArcReporterService([0, 30], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));
    await service.reportEdit({
      sessionUri: "claude:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "hello",
      afterText: "hello AI",
      initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: " AI" }] },
      completionTime: Date.now()
    });
    await timeout(10);
    await fileService.del(resource);
    await timeout(40);
    assert.deepStrictEqual(telemetry.events.map((event) => ({
      timeDelayMs: event.data.timeDelayMs,
      arc: event.data.arc
    })), [
      { timeDelayMs: 0, arc: 3 },
      { timeDelayMs: 30, arc: 0 }
    ]);
  });
});
function createConfigurationService(enabled, disposables) {
  const rootConfigChange = disposables.add(new Emitter());
  const workingDirectoryPendingChange = disposables.add(new Emitter());
  return {
    _serviceBrand: void 0,
    onDidRootConfigChange: rootConfigChange.event,
    onDidSessionConfigChange: Event.None,
    onDidChangeWorkingDirectoryPending: workingDirectoryPendingChange.event,
    getEffectiveValue: () => void 0,
    getEffectiveWorkingDirectories: () => void 0,
    isWorkingDirectoryPending: () => false,
    resolveWorkingDirectoryForResume: async (_session, workingDirectory) => workingDirectory,
    updateSessionConfig: () => {
    },
    getSessionConfigValues: () => void 0,
    getRootValue: (schema, key) => schema.validate(key, enabled) ? enabled : void 0,
    updateRootConfig: () => {
    },
    persistRootConfig: () => {
    },
    whenIdle: async () => {
    },
    setEnabled(value) {
      enabled = value;
      rootConfigChange.fire();
    }
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzaGFyZWRcXGVkaXRBcmNSZXBvcnRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCByYWNlVGltZW91dCwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU3lzdGVtV2F0Y2hlciwgSVdhdGNoT3B0aW9uc1dpdGhvdXRDb3JyZWxhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFRlbGVtZXRyeU1lYXN1cmVtZW50cywgVGVsZW1ldHJ5UHJvcHMgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2FnZW50SG9zdFJlc3RyaWN0ZWRUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgVGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9zaGFyZWQvZWRpdEFyY1JlcG9ydGVyLmpzJztcbmltcG9ydCB7IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL25vZGUvYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RHaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGJ1aWxkU3ViYWdlbnRDaGF0VXJpIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJRGV0YWlsZWREaWZmUmVzdWx0LCBJRGlmZkNvbXB1dGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2RpZmZDb21wdXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDbGllbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdENsaWVudEluZm8uanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2xpZW50Q29ubmVjdGlvbktpbmQsIEFnZW50SG9zdExhdW5jaEtpbmQsIEFnZW50SG9zdFRyYW5zcG9ydEtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0VGVsZW1ldHJ5LmpzJztcblxuY2xhc3MgQ291bnRpbmdGaWxlU2VydmljZSBleHRlbmRzIEZpbGVTZXJ2aWNlIHtcblx0d2F0Y2hlckNvdW50ID0gMDtcblxuXHRvdmVycmlkZSBjcmVhdGVXYXRjaGVyKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElXYXRjaE9wdGlvbnNXaXRob3V0Q29ycmVsYXRpb24gJiB7IHJlY3Vyc2l2ZTogZmFsc2UgfSk6IElGaWxlU3lzdGVtV2F0Y2hlciB7XG5cdFx0dGhpcy53YXRjaGVyQ291bnQrKztcblx0XHRyZXR1cm4gc3VwZXIuY3JlYXRlV2F0Y2hlcihyZXNvdXJjZSwgb3B0aW9ucyk7XG5cdH1cbn1cblxuY2xhc3MgUmVjb3JkaW5nVGVsZW1ldHJ5U2VydmljZSBleHRlbmRzIE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUge1xuXHRyZWFkb25seSBldmVudHM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBkYXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9PiA9IFtdO1xuXHRyZWFkb25seSBnaXRodWJFdmVudHM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBwcm9wZXJ0aWVzOiBUZWxlbWV0cnlQcm9wcyB8IHVuZGVmaW5lZDsgbWVhc3VyZW1lbnRzOiBUZWxlbWV0cnlNZWFzdXJlbWVudHMgfCB1bmRlZmluZWQgfT4gPSBbXTtcblx0b25FdmVudDogKChldmVudDogeyBuYW1lOiBzdHJpbmc7IGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0pID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsICd0ZWxlbWV0cnlMZXZlbCcsIHsgdmFsdWU6IFRlbGVtZXRyeUxldmVsLlVTQUdFIH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcHVibGljTG9nMihldmVudE5hbWU/OiBzdHJpbmcsIGRhdGE/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHZvaWQge1xuXHRcdGNvbnN0IGV2ZW50ID0geyBuYW1lOiBldmVudE5hbWUgPz8gJycsIGRhdGE6IGRhdGEgPz8ge30gfTtcblx0XHR0aGlzLmV2ZW50cy5wdXNoKGV2ZW50KTtcblx0XHR0aGlzLm9uRXZlbnQ/LihldmVudCk7XG5cdH1cblxuXHR1cGRhdGVUZWxlbWV0cnlMZXZlbCgpOiB2b2lkIHsgfVxuXG5cdHNlbmRHSFRlbGVtZXRyeUV2ZW50KG5hbWU6IHN0cmluZywgcHJvcGVydGllcz86IFRlbGVtZXRyeVByb3BzLCBtZWFzdXJlbWVudHM/OiBUZWxlbWV0cnlNZWFzdXJlbWVudHMpOiB2b2lkIHtcblx0XHR0aGlzLmdpdGh1YkV2ZW50cy5wdXNoKHsgbmFtZSwgcHJvcGVydGllcywgbWVhc3VyZW1lbnRzIH0pO1xuXHR9XG59XG5cbnN1aXRlKCdBZ2VudCBIb3N0IEVkaXQgQVJDIFJlcG9ydGVyJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGZpbGVTZXJ2aWNlOiBDb3VudGluZ0ZpbGVTZXJ2aWNlO1xuXHRsZXQgdGVsZW1ldHJ5OiBSZWNvcmRpbmdUZWxlbWV0cnlTZXJ2aWNlO1xuXHRsZXQgY29uZmlnOiBUZXN0QWdlbnRDb25maWd1cmF0aW9uU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENvdW50aW5nRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHR0ZWxlbWV0cnkgPSBuZXcgUmVjb3JkaW5nVGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdGNvbmZpZyA9IGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKHRydWUsIGRpc3Bvc2FibGVzKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2VtaXRzIHRoZSBsb2NrZWQgTWljcm9zb2Z0IGFuZCBHaXRIdWIgZXZlbnQgc2hhcGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdoZWxsbyBBSScpKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlKFswLCAzMCwgNjBdLCBmaWxlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSwgY29uZmlnLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgdGVsZW1ldHJ5KSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnJlcG9ydEVkaXQoe1xuXHRcdFx0Y2xpZW50Q29udGV4dDoge1xuXHRcdFx0XHRjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdyxcblx0XHRcdFx0Y29ubmVjdGlvbktpbmQ6IEFnZW50SG9zdENsaWVudENvbm5lY3Rpb25LaW5kLlJlbW90ZUV4dGVuc2lvbkhvc3QsXG5cdFx0XHRcdHRyYW5zcG9ydEtpbmQ6IEFnZW50SG9zdFRyYW5zcG9ydEtpbmQuTWVzc2FnZVBvcnQsXG5cdFx0XHRcdGhvc3RMYXVuY2hLaW5kOiBBZ2VudEhvc3RMYXVuY2hLaW5kLlZTQ29kZU1haW5Qcm9jZXNzLFxuXHRcdFx0XHRtYWNoaW5lSWQ6ICdjbGllbnQtbWFjaGluZS1pZCcsXG5cdFx0XHRcdGRldkRldmljZUlkOiAnY2xpZW50LWRldi1kZXZpY2UtaWQnLFxuXHRcdFx0fSxcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Y2xpOi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdoZWxsbycsXG5cdFx0XHRhZnRlclRleHQ6ICdoZWxsbyBBSScsXG5cdFx0XHRpbml0aWFsRWRpdDogeyByZXBsYWNlbWVudHM6IFt7IHN0YXJ0OiA1LCBlbmRFeGNsdXNpdmU6IDUsIHRleHQ6ICcgQUknIH1dIH0sXG5cdFx0XHRtb2RlbElkOiAnZ3B0LTUnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHRcdGNvbXBsZXRpb25UaW1lOiBEYXRlLm5vdygpLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0Y29uc3QgZXZlbnQgPSB0ZWxlbWV0cnkuZXZlbnRzWzBdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bmFtZTogZXZlbnQubmFtZSxcblx0XHRcdGRhdGE6IHsgLi4uZXZlbnQuZGF0YSwgdW5pcXVlRWRpdElkOiAnPHV1aWQ+JyB9LFxuXHRcdFx0Z2l0aHViTmFtZTogdGVsZW1ldHJ5LmdpdGh1YkV2ZW50c1swXT8ubmFtZSxcblx0XHRcdGdpdGh1YklkZW50aXR5OiB7XG5cdFx0XHRcdGluaXRpYXRvck1hY2hpbmVJZDogdGVsZW1ldHJ5LmdpdGh1YkV2ZW50c1swXT8ucHJvcGVydGllcz8uaW5pdGlhdG9yTWFjaGluZUlkLFxuXHRcdFx0XHRpbml0aWF0b3JEZXZEZXZpY2VJZDogdGVsZW1ldHJ5LmdpdGh1YkV2ZW50c1swXT8ucHJvcGVydGllcz8uaW5pdGlhdG9yRGV2RGV2aWNlSWQsXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdG5hbWU6ICdlZGl0VGVsZW1ldHJ5LnJlcG9ydEVkaXRBcmMnLFxuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRpbml0aWF0b3JDbGllbnRUeXBlOiAnZWRpdG9yX3dpbmRvdycsXG5cdFx0XHRcdGluaXRpYXRvckNvbm5lY3Rpb25LaW5kOiAncmVtb3RlX2V4dGVuc2lvbl9ob3N0Jyxcblx0XHRcdFx0aW5pdGlhdG9yVHJhbnNwb3J0S2luZDogJ21lc3NhZ2VfcG9ydCcsXG5cdFx0XHRcdGhvc3RMYXVuY2hLaW5kOiAndnNjb2RlX21haW5fcHJvY2VzcycsXG5cdFx0XHRcdGluaXRpYXRvck1hY2hpbmVJZDogJ2NsaWVudC1tYWNoaW5lLWlkJyxcblx0XHRcdFx0aW5pdGlhdG9yRGV2RGV2aWNlSWQ6ICdjbGllbnQtZGV2LWRldmljZS1pZCcsXG5cdFx0XHRcdHNvdXJjZUtleUNsZWFuZWQ6ICdzb3VyY2U6Q2hhdC5hcHBseUVkaXRzJyxcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZXh0ZW5zaW9uVmVyc2lvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRvcHBvcnR1bml0eUlkOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVkaXRTZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRtb2RlbElkOiAnZ3B0LTUnLFxuXHRcdFx0XHRsYW5ndWFnZUlkOiB1bmRlZmluZWQsXG5cdFx0XHRcdG1vZGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0dW5pcXVlRWRpdElkOiAnPHV1aWQ+Jyxcblx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJyxcblx0XHRcdFx0YWdlbnRTZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0XHRpc1N1YmFnZW50U2Vzc2lvbjogJ2ZhbHNlJyxcblx0XHRcdFx0ZGlkQnJhbmNoQ2hhbmdlOiAwLFxuXHRcdFx0XHR0aW1lRGVsYXlNczogMCxcblx0XHRcdFx0b3JpZ2luYWxDaGFyQ291bnQ6IDMsXG5cdFx0XHRcdG9yaWdpbmFsTGluZUNvdW50OiAxLFxuXHRcdFx0XHRvcmlnaW5hbERlbGV0ZWRMaW5lQ291bnQ6IDEsXG5cdFx0XHRcdGFyYzogMyxcblx0XHRcdFx0Y3VycmVudExpbmVDb3VudDogMSxcblx0XHRcdFx0Y3VycmVudERlbGV0ZWRMaW5lQ291bnQ6IDEsXG5cdFx0XHR9LFxuXHRcdFx0Z2l0aHViTmFtZTogJ3ZzY29kZS5lZGl0VGVsZW1ldHJ5LnJlcG9ydEVkaXRBcmMnLFxuXHRcdFx0Z2l0aHViSWRlbnRpdHk6IHtcblx0XHRcdFx0aW5pdGlhdG9yTWFjaGluZUlkOiB1bmRlZmluZWQsXG5cdFx0XHRcdGluaXRpYXRvckRldkRldmljZUlkOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBvcnRzIGVkaXRzIGZyb20gc3ViYWdlbnQgY2hhdCBjaGFubmVscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3N1YmFnZW50LnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdoZWxsbyBBSScpKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlKFswXSwgZmlsZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCksIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksIGNvbmZpZywgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHRlbGVtZXRyeSkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5yZXBvcnRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKCdjb3BpbG90Y2xpOi9zZXNzaW9uLTEnLCAncGFyZW50LXRvb2wnKSxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnaGVsbG8nLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnaGVsbG8gQUknLFxuXHRcdFx0aW5pdGlhbEVkaXQ6IHsgcmVwbGFjZW1lbnRzOiBbeyBzdGFydDogNSwgZW5kRXhjbHVzaXZlOiA1LCB0ZXh0OiAnIEFJJyB9XSB9LFxuXHRcdFx0Y29tcGxldGlvblRpbWU6IERhdGUubm93KCksXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRTZXNzaW9uSWQ6IHRlbGVtZXRyeS5ldmVudHNbMF0uZGF0YS5lZGl0U2Vzc2lvbklkLFxuXHRcdFx0YWdlbnRTZXNzaW9uSWQ6IHRlbGVtZXRyeS5ldmVudHNbMF0uZGF0YS5hZ2VudFNlc3Npb25JZCxcblx0XHRcdGlzU3ViYWdlbnRTZXNzaW9uOiB0ZWxlbWV0cnkuZXZlbnRzWzBdLmRhdGEuaXNTdWJhZ2VudFNlc3Npb24sXG5cdFx0fSwge1xuXHRcdFx0ZWRpdFNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHRhZ2VudFNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHRpc1N1YmFnZW50U2Vzc2lvbjogJ3RydWUnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVzIG9sZGVyIHJlcG9ydGVycyBiZWZvcmUgc3RhcnRpbmcgdGhlIG5leHQgcmVwb3J0ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9vcmRlci50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnQUliYXNlJykpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVkaXRBcmNSZXBvcnRlclNlcnZpY2UoWzAsIDMwLCA2MF0sIGZpbGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpLCBjcmVhdGVOb29wR2l0U2VydmljZSgpLCBjb25maWcsIG5ldyBOdWxsTG9nU2VydmljZSgpLCB0ZWxlbWV0cnkpKTtcblx0XHRjb25zdCBjb21wbGV0aW9uVGltZSA9IERhdGUubm93KCk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnJlcG9ydEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NsYXVkZTovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnYmFzZScsXG5cdFx0XHRhZnRlclRleHQ6ICdBSWJhc2UnLFxuXHRcdFx0aW5pdGlhbEVkaXQ6IHsgcmVwbGFjZW1lbnRzOiBbeyBzdGFydDogMCwgZW5kRXhjbHVzaXZlOiAwLCB0ZXh0OiAnQUknIH1dIH0sXG5cdFx0XHRjb21wbGV0aW9uVGltZSxcblx0XHR9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRjb25zdCBmaXJzdEVkaXRJZCA9IHRlbGVtZXRyeS5ldmVudHNbMF0uZGF0YS51bmlxdWVFZGl0SWQ7XG5cdFx0Y29uc3QgZmluYWxTYW1wbGVFbWl0dGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdHRlbGVtZXRyeS5vbkV2ZW50ID0gZXZlbnQgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LmRhdGEudW5pcXVlRWRpdElkID09PSBmaXJzdEVkaXRJZCAmJiBldmVudC5kYXRhLnRpbWVEZWxheU1zID09PSA2MCkge1xuXHRcdFx0XHRmaW5hbFNhbXBsZUVtaXR0ZWQuY29tcGxldGUoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdBYmFzZScpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlcG9ydEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NsYXVkZTovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMicsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0yJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnQUliYXNlJyxcblx0XHRcdGFmdGVyVGV4dDogJ0FiYXNlJyxcblx0XHRcdGluaXRpYWxFZGl0OiB7IHJlcGxhY2VtZW50czogW3sgc3RhcnQ6IDEsIGVuZEV4Y2x1c2l2ZTogMiwgdGV4dDogJycgfV0gfSxcblx0XHRcdGNvbXBsZXRpb25UaW1lOiBEYXRlLm5vdygpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNhbXBsaW5nQ29tcGxldGVkID0gYXdhaXQgcmFjZVRpbWVvdXQoUHJvbWlzZS5hbGwoW2ZpbmFsU2FtcGxlRW1pdHRlZC5wXSksIDVfMDAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2FtcGxpbmdDb21wbGV0ZWQ6IHNhbXBsaW5nQ29tcGxldGVkICE9PSB1bmRlZmluZWQsXG5cdFx0XHRldmVudHM6IHRlbGVtZXRyeS5ldmVudHNcblx0XHRcdFx0LmZpbHRlcihldmVudCA9PiBldmVudC5kYXRhLnVuaXF1ZUVkaXRJZCA9PT0gZmlyc3RFZGl0SWQpXG5cdFx0XHRcdC5tYXAoZXZlbnQgPT4gKHsgdGltZURlbGF5TXM6IGV2ZW50LmRhdGEudGltZURlbGF5TXMsIGFyYzogZXZlbnQuZGF0YS5hcmMgfSkpLFxuXHRcdH0sIHtcblx0XHRcdHNhbXBsaW5nQ29tcGxldGVkOiB0cnVlLFxuXHRcdFx0ZXZlbnRzOiBbXG5cdFx0XHRcdHsgdGltZURlbGF5TXM6IDAsIGFyYzogMiB9LFxuXHRcdFx0XHR7IHRpbWVEZWxheU1zOiAzMCwgYXJjOiAxIH0sXG5cdFx0XHRcdHsgdGltZURlbGF5TXM6IDYwLCBhcmM6IDEgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZWxlbWV0cnkuZ2l0aHViRXZlbnRzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGNyZWF0ZSBhIHJlcG9ydGVyIGFmdGVyIHJlY29uY2lsaWF0aW9uIHN0YXRlIGlzIGRpc3Bvc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRldGFpbGVkU3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBkZXRhaWxlZFJlc3VsdCA9IG5ldyBEZWZlcnJlZFByb21pc2U8SURldGFpbGVkRGlmZlJlc3VsdD4oKTtcblx0XHRjb25zdCBkaWZmQ29tcHV0ZVNlcnZpY2U6IElEaWZmQ29tcHV0ZVNlcnZpY2UgPSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRjb21wdXRlRGlmZkNvdW50czogYXN5bmMgKCkgPT4gKHsgYWRkZWQ6IDAsIHJlbW92ZWQ6IDAsIGNoYW5nZXM6IFtdIH0pLFxuXHRcdFx0Y29tcHV0ZURldGFpbGVkRGlmZjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRkZXRhaWxlZFN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdFx0cmV0dXJuIGRldGFpbGVkUmVzdWx0LnA7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9zdGFsZS50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnQUliYXNlJykpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVkaXRBcmNSZXBvcnRlclNlcnZpY2UoWzAsIDYwXzAwMF0sIGZpbGVTZXJ2aWNlLCBkaWZmQ29tcHV0ZVNlcnZpY2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksIGNvbmZpZywgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHRlbGVtZXRyeSkpO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVwb3J0RWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY2xhdWRlOi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdiYXNlJyxcblx0XHRcdGFmdGVyVGV4dDogJ0FJYmFzZScsXG5cdFx0XHRpbml0aWFsRWRpdDogeyByZXBsYWNlbWVudHM6IFt7IHN0YXJ0OiAwLCBlbmRFeGNsdXNpdmU6IDAsIHRleHQ6ICdBSScgfV0gfSxcblx0XHRcdGNvbXBsZXRpb25UaW1lOiBEYXRlLm5vdygpLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0Y29uc3Qgc2Vjb25kUmVwb3J0ID0gc2VydmljZS5yZXBvcnRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjbGF1ZGU6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMicsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ3VucmVsYXRlZCcsXG5cdFx0XHRhZnRlclRleHQ6ICduZXdiYXNlJyxcblx0XHRcdGluaXRpYWxFZGl0OiB7IHJlcGxhY2VtZW50czogW3sgc3RhcnQ6IDAsIGVuZEV4Y2x1c2l2ZTogOSwgdGV4dDogJ25ld2Jhc2UnIH1dIH0sXG5cdFx0XHRjb21wbGV0aW9uVGltZTogRGF0ZS5ub3coKSxcblx0XHR9KTtcblx0XHRhd2FpdCBkZXRhaWxlZFN0YXJ0ZWQucDtcblx0XHRjb25maWcuc2V0RW5hYmxlZChmYWxzZSk7XG5cdFx0Y29uZmlnLnNldEVuYWJsZWQodHJ1ZSk7XG5cdFx0ZGV0YWlsZWRSZXN1bHQuY29tcGxldGUoe1xuXHRcdFx0YWRkZWQ6IDEsXG5cdFx0XHRyZW1vdmVkOiAxLFxuXHRcdFx0cmVwbGFjZW1lbnRzOiBbeyBzdGFydDogMCwgZW5kRXhjbHVzaXZlOiA2LCB0ZXh0OiAnbmV3YmFzZScgfV0sXG5cdFx0XHRoaXRUaW1lb3V0OiBmYWxzZSxcblx0XHR9KTtcblx0XHRhd2FpdCBzZWNvbmRSZXBvcnQ7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeS5ldmVudHMubWFwKGV2ZW50ID0+IGV2ZW50LmRhdGEucmVxdWVzdElkKSwgWyd0dXJuLTEnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGNyZWF0ZSByZXNvdXJjZSB3YXRjaGVycyBhZnRlciB0aGUgaG9zdCByZXBvcnRlciBsaW1pdCBpcyByZWFjaGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVkaXRBcmNSZXBvcnRlclNlcnZpY2UoWzYwXzAwMF0sIGZpbGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpLCBjcmVhdGVOb29wR2l0U2VydmljZSgpLCBjb25maWcsIG5ldyBOdWxsTG9nU2VydmljZSgpLCB0ZWxlbWV0cnkpKTtcblxuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPD0gMjAwOyBpbmRleCsrKSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnJlcG9ydEVkaXQoe1xuXHRcdFx0XHRzZXNzaW9uVXJpOiAnY2xhdWRlOi9zZXNzaW9uLTEnLFxuXHRcdFx0XHR0dXJuSWQ6IGB0dXJuLSR7aW5kZXh9YCxcblx0XHRcdFx0dG9vbENhbGxJZDogYHRvb2wtJHtpbmRleH1gLFxuXHRcdFx0XHRmaWxlUGF0aDogYC93b3Jrc3BhY2UvZmlsZS0ke2luZGV4fS50c2AsXG5cdFx0XHRcdGJlZm9yZVRleHQ6ICcnLFxuXHRcdFx0XHRhZnRlclRleHQ6ICdBSScsXG5cdFx0XHRcdGluaXRpYWxFZGl0OiB7IHJlcGxhY2VtZW50czogW3sgc3RhcnQ6IDAsIGVuZEV4Y2x1c2l2ZTogMCwgdGV4dDogJ0FJJyB9XSB9LFxuXHRcdFx0XHRjb21wbGV0aW9uVGltZTogRGF0ZS5ub3coKSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlU2VydmljZS53YXRjaGVyQ291bnQsIDIwMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2VzIGFjdGl2ZSByZXBvcnRlcnMgd2hlbiBlZGl0IHRlbGVtZXRyeSBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2Rpc2FibGVkLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdoZWxsbyBBSScpKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlKFswLCAzMCwgNjBdLCBmaWxlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSwgY29uZmlnLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgdGVsZW1ldHJ5KSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnJlcG9ydEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NsYXVkZTovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnaGVsbG8nLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnaGVsbG8gQUknLFxuXHRcdFx0aW5pdGlhbEVkaXQ6IHsgcmVwbGFjZW1lbnRzOiBbeyBzdGFydDogNSwgZW5kRXhjbHVzaXZlOiA1LCB0ZXh0OiAnIEFJJyB9XSB9LFxuXHRcdFx0Y29tcGxldGlvblRpbWU6IERhdGUubm93KCksXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0Y29uZmlnLnNldEVuYWJsZWQoZmFsc2UpO1xuXHRcdGF3YWl0IHRpbWVvdXQoNzApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZWxlbWV0cnkuZXZlbnRzLm1hcChldmVudCA9PiBldmVudC5kYXRhLnRpbWVEZWxheU1zKSwgWzBdKTtcblx0fSk7XG5cblx0dGVzdCgnY29udGludWVzIHNhbXBsaW5nIGFmdGVyIGEgc2FtcGxlIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmFpbHVyZS50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnaGVsbG8gQUknKSk7XG5cdFx0Y29uc3Qgc2FtcGxlRmFpbGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IGZpbmFsU2FtcGxlRW1pdHRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHR0ZWxlbWV0cnkub25FdmVudCA9IGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5kYXRhLnRpbWVEZWxheU1zID09PSA2MCkge1xuXHRcdFx0XHRmaW5hbFNhbXBsZUVtaXR0ZWQuY29tcGxldGUoKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGxldCBicmFuY2hMb29rdXBDb3VudCA9IDA7XG5cdFx0Y29uc3QgZ2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UgPSB7XG5cdFx0XHQuLi5jcmVhdGVOb29wR2l0U2VydmljZSgpLFxuXHRcdFx0Z2V0Q3VycmVudEJyYW5jaE5hbWU6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0YnJhbmNoTG9va3VwQ291bnQrKztcblx0XHRcdFx0aWYgKGJyYW5jaExvb2t1cENvdW50ID09PSAzKSB7XG5cdFx0XHRcdFx0c2FtcGxlRmFpbGVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdicmFuY2ggbG9va3VwIGZhaWxlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiAnbWFpbic7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRWRpdEFyY1JlcG9ydGVyU2VydmljZShbMCwgMzAsIDYwXSwgZmlsZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCksIGdpdFNlcnZpY2UsIGNvbmZpZywgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHRlbGVtZXRyeSkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5yZXBvcnRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjbGF1ZGU6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2hlbGxvJyxcblx0XHRcdGFmdGVyVGV4dDogJ2hlbGxvIEFJJyxcblx0XHRcdGluaXRpYWxFZGl0OiB7IHJlcGxhY2VtZW50czogW3sgc3RhcnQ6IDUsIGVuZEV4Y2x1c2l2ZTogNSwgdGV4dDogJyBBSScgfV0gfSxcblx0XHRcdGNvbXBsZXRpb25UaW1lOiBEYXRlLm5vdygpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNhbXBsaW5nQ29tcGxldGVkID0gYXdhaXQgcmFjZVRpbWVvdXQoUHJvbWlzZS5hbGwoW3NhbXBsZUZhaWxlZC5wLCBmaW5hbFNhbXBsZUVtaXR0ZWQucF0pLCA1XzAwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNhbXBsaW5nQ29tcGxldGVkOiBzYW1wbGluZ0NvbXBsZXRlZCAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0dGltZURlbGF5czogdGVsZW1ldHJ5LmV2ZW50cy5tYXAoZXZlbnQgPT4gZXZlbnQuZGF0YS50aW1lRGVsYXlNcyksXG5cdFx0fSwge1xuXHRcdFx0c2FtcGxpbmdDb21wbGV0ZWQ6IHRydWUsXG5cdFx0XHR0aW1lRGVsYXlzOiBbMCwgNjBdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBvcnRzIHN5bWJvbGljIGJyYW5jaCBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvYnJhbmNoLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdoZWxsbyBBSScpKTtcblx0XHRsZXQgYnJhbmNoID0gJ21haW4nO1xuXHRcdGNvbnN0IGdpdFNlcnZpY2U6IElBZ2VudEhvc3RHaXRTZXJ2aWNlID0ge1xuXHRcdFx0Li4uY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSxcblx0XHRcdGdldEN1cnJlbnRCcmFuY2hOYW1lOiBhc3luYyAoKSA9PiBicmFuY2gsXG5cdFx0fTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlKFswLCAzMF0sIGZpbGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpLCBnaXRTZXJ2aWNlLCBjb25maWcsIG5ldyBOdWxsTG9nU2VydmljZSgpLCB0ZWxlbWV0cnkpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVwb3J0RWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY2xhdWRlOi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdoZWxsbycsXG5cdFx0XHRhZnRlclRleHQ6ICdoZWxsbyBBSScsXG5cdFx0XHRpbml0aWFsRWRpdDogeyByZXBsYWNlbWVudHM6IFt7IHN0YXJ0OiA1LCBlbmRFeGNsdXNpdmU6IDUsIHRleHQ6ICcgQUknIH1dIH0sXG5cdFx0XHRjb21wbGV0aW9uVGltZTogRGF0ZS5ub3coKSxcblx0XHR9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRicmFuY2ggPSAnZmVhdHVyZSc7XG5cdFx0YXdhaXQgdGltZW91dCg0MCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeS5ldmVudHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHR0aW1lRGVsYXlNczogZXZlbnQuZGF0YS50aW1lRGVsYXlNcyxcblx0XHRcdGRpZEJyYW5jaENoYW5nZTogZXZlbnQuZGF0YS5kaWRCcmFuY2hDaGFuZ2UsXG5cdFx0fSkpLCBbXG5cdFx0XHR7IHRpbWVEZWxheU1zOiAwLCBkaWRCcmFuY2hDaGFuZ2U6IDAgfSxcblx0XHRcdHsgdGltZURlbGF5TXM6IDMwLCBkaWRCcmFuY2hDaGFuZ2U6IDEgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmV0YWlucyB0aGUgcmVwb3NpdG9yeSByb290IHdoZW4gdGhlIGVkaXRlZCBwYXJlbnQgZGlyZWN0b3J5IGlzIGRlbGV0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9yZW1vdmVkL2JyYW5jaC50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnaGVsbG8gQUknKSk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeVJvb3QgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZScpO1xuXHRcdGNvbnN0IGZpbGVEaXJlY3RvcnkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9yZW1vdmVkJyk7XG5cdFx0bGV0IGZpbGVEaXJlY3RvcnlFeGlzdHMgPSB0cnVlO1xuXHRcdGNvbnN0IGdpdFNlcnZpY2U6IElBZ2VudEhvc3RHaXRTZXJ2aWNlID0ge1xuXHRcdFx0Li4uY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSxcblx0XHRcdGdldFJlcG9zaXRvcnlSb290OiBhc3luYyAoKSA9PiByZXBvc2l0b3J5Um9vdCxcblx0XHRcdGdldEN1cnJlbnRCcmFuY2hOYW1lOiBhc3luYyB3b3JraW5nRGlyZWN0b3J5ID0+IHtcblx0XHRcdFx0aWYgKHdvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKSA9PT0gcmVwb3NpdG9yeVJvb3QudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRcdHJldHVybiAnbWFpbic7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZpbGVEaXJlY3RvcnlFeGlzdHMgJiYgd29ya2luZ0RpcmVjdG9yeS50b1N0cmluZygpID09PSBmaWxlRGlyZWN0b3J5LnRvU3RyaW5nKCkgPyAnbWFpbicgOiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRWRpdEFyY1JlcG9ydGVyU2VydmljZShbMCwgMzBdLCBmaWxlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSwgZ2l0U2VydmljZSwgY29uZmlnLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgdGVsZW1ldHJ5KSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnJlcG9ydEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NsYXVkZTovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnaGVsbG8nLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnaGVsbG8gQUknLFxuXHRcdFx0aW5pdGlhbEVkaXQ6IHsgcmVwbGFjZW1lbnRzOiBbeyBzdGFydDogNSwgZW5kRXhjbHVzaXZlOiA1LCB0ZXh0OiAnIEFJJyB9XSB9LFxuXHRcdFx0Y29tcGxldGlvblRpbWU6IERhdGUubm93KCksXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0ZmlsZURpcmVjdG9yeUV4aXN0cyA9IGZhbHNlO1xuXHRcdGF3YWl0IHRpbWVvdXQoNDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZWxlbWV0cnkuZXZlbnRzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0dGltZURlbGF5TXM6IGV2ZW50LmRhdGEudGltZURlbGF5TXMsXG5cdFx0XHRkaWRCcmFuY2hDaGFuZ2U6IGV2ZW50LmRhdGEuZGlkQnJhbmNoQ2hhbmdlLFxuXHRcdH0pKSwgW1xuXHRcdFx0eyB0aW1lRGVsYXlNczogMCwgZGlkQnJhbmNoQ2hhbmdlOiAwIH0sXG5cdFx0XHR7IHRpbWVEZWxheU1zOiAzMCwgZGlkQnJhbmNoQ2hhbmdlOiAwIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyZWF0cyBkZWxldGlvbiBhcyByZW1vdmFsIG9mIHRoZSB0cmFja2VkIGVkaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9kZWxldGVkLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdoZWxsbyBBSScpKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlKFswLCAzMF0sIGZpbGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpLCBjcmVhdGVOb29wR2l0U2VydmljZSgpLCBjb25maWcsIG5ldyBOdWxsTG9nU2VydmljZSgpLCB0ZWxlbWV0cnkpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVwb3J0RWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY2xhdWRlOi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdoZWxsbycsXG5cdFx0XHRhZnRlclRleHQ6ICdoZWxsbyBBSScsXG5cdFx0XHRpbml0aWFsRWRpdDogeyByZXBsYWNlbWVudHM6IFt7IHN0YXJ0OiA1LCBlbmRFeGNsdXNpdmU6IDUsIHRleHQ6ICcgQUknIH1dIH0sXG5cdFx0XHRjb21wbGV0aW9uVGltZTogRGF0ZS5ub3coKSxcblx0XHR9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS5kZWwocmVzb3VyY2UpO1xuXHRcdGF3YWl0IHRpbWVvdXQoNDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZWxlbWV0cnkuZXZlbnRzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0dGltZURlbGF5TXM6IGV2ZW50LmRhdGEudGltZURlbGF5TXMsXG5cdFx0XHRhcmM6IGV2ZW50LmRhdGEuYXJjLFxuXHRcdH0pKSwgW1xuXHRcdFx0eyB0aW1lRGVsYXlNczogMCwgYXJjOiAzIH0sXG5cdFx0XHR7IHRpbWVEZWxheU1zOiAzMCwgYXJjOiAwIH0sXG5cdFx0XSk7XG5cdH0pO1xufSk7XG5cbmludGVyZmFjZSBUZXN0QWdlbnRDb25maWd1cmF0aW9uU2VydmljZSBleHRlbmRzIElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0c2V0RW5hYmxlZChlbmFibGVkOiBib29sZWFuKTogdm9pZDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoZW5hYmxlZDogYm9vbGVhbiwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IFRlc3RBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0Y29uc3Qgcm9vdENvbmZpZ0NoYW5nZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeVBlbmRpbmdDaGFuZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmV0dXJuIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0b25EaWRSb290Q29uZmlnQ2hhbmdlOiByb290Q29uZmlnQ2hhbmdlLmV2ZW50LFxuXHRcdG9uRGlkU2Vzc2lvbkNvbmZpZ0NoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRvbkRpZENoYW5nZVdvcmtpbmdEaXJlY3RvcnlQZW5kaW5nOiB3b3JraW5nRGlyZWN0b3J5UGVuZGluZ0NoYW5nZS5ldmVudCxcblx0XHRnZXRFZmZlY3RpdmVWYWx1ZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdGdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcmllczogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdGlzV29ya2luZ0RpcmVjdG9yeVBlbmRpbmc6ICgpID0+IGZhbHNlLFxuXHRcdHJlc29sdmVXb3JraW5nRGlyZWN0b3J5Rm9yUmVzdW1lOiBhc3luYyAoX3Nlc3Npb24sIHdvcmtpbmdEaXJlY3RvcnkpID0+IHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0dXBkYXRlU2Vzc2lvbkNvbmZpZzogKCkgPT4geyB9LFxuXHRcdGdldFNlc3Npb25Db25maWdWYWx1ZXM6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRnZXRSb290VmFsdWU6IChzY2hlbWEsIGtleSkgPT4gc2NoZW1hLnZhbGlkYXRlKGtleSwgZW5hYmxlZCkgPyBlbmFibGVkIDogdW5kZWZpbmVkLFxuXHRcdHVwZGF0ZVJvb3RDb25maWc6ICgpID0+IHsgfSxcblx0XHRwZXJzaXN0Um9vdENvbmZpZzogKCkgPT4geyB9LFxuXHRcdHdoZW5JZGxlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0c2V0RW5hYmxlZCh2YWx1ZSkge1xuXHRcdFx0ZW5hYmxlZCA9IHZhbHVlO1xuXHRcdFx0cm9vdENvbmZpZ0NoYW5nZS5maXJlKCk7XG5cdFx0fSxcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGlCQUFpQixhQUFhLGVBQWU7QUFDdEQsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsd0JBQXdCLDRCQUE0QjtBQUc3RCxTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLCtCQUErQixxQkFBcUIsOEJBQThCO0FBRTNGLE1BQU0sNEJBQTRCLFlBQVk7QUFBQSxFQUE5QztBQUFBO0FBQ0Msd0JBQWU7QUFBQTtBQUFBLEVBRU4sY0FBYyxVQUFlLFNBQXFGO0FBQzFILFNBQUs7QUFDTCxXQUFPLE1BQU0sY0FBYyxVQUFVLE9BQU87QUFBQSxFQUM3QztBQUNEO0FBRUEsTUFBTSxrQ0FBa0MsMEJBQTBC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
