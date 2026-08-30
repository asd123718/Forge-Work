import assert from "assert";
import { DeferredPromise, timeout } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { isWindows } from "../../../../base/common/platform.js";
import { URI } from "../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { IFileService } from "../../../files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { ITelemetryService, TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { IDiffComputeService } from "../../common/diffComputeService.js";
import { createFileEditContentDigest } from "../../common/fileEditAttribution.js";
import { buildChatUri, buildDefaultChatUri } from "../../common/state/sessionState.js";
import { AgentEditAttributionService } from "../../node/shared/agentEditAttributionService.js";
import { computeDiffCounts } from "../../node/diffWorkerMain.js";
import { TestDiffComputeService } from "../common/sessionTestHelpers.js";
suite("Agent Edit Attribution Service", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("emits retained Agent characters from disjoint edits", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("aBcdeF"));
    const events = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, {
      computeDiffCounts: async (original, modified, timeoutMs) => computeDiffCounts(original, modified, timeoutMs ?? 5e3)
    });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName, data) {
        events.push({ eventName, data });
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, void 0, void 0));
    const marker = await service.recordEdit({
      sessionUri: "copilotcli:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "abcdef",
      afterText: "aBcdeF",
      changes: [
        { startOffset: 1, endOffsetExclusive: 2, newText: "B" },
        { startOffset: 5, endOffsetExclusive: 6, newText: "F" }
      ],
      modelId: "model",
      toolName: "edit"
    });
    await service.flushSession("copilotcli:/session-1");
    const acknowledged = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-2",
      isDirty: false,
      flushToken: "flush-standalone",
      languageId: "typescript"
    });
    const acknowledgedOutcome = await service.commitFlush({
      flushToken: acknowledged.flushToken,
      totalModifiedCount: 0
    });
    assert.deepStrictEqual({
      marker: marker?.status !== "skipped" && marker ? {
        version: marker.version,
        sequence: marker.sequence,
        editIdLength: marker.editId.length,
        beforeDigest: marker.beforeDigest,
        afterDigest: marker.afterDigest,
        source: marker.source
      } : marker,
      events: events.map((event) => ({
        eventName: event.eventName,
        statsUuidMatches: event.data.statsUuid === events[0]?.data.statsUuid,
        sourceKey: event.data.sourceKey,
        sourceKeyCleaned: event.data.sourceKeyCleaned,
        conversationId: event.data.conversationId,
        modifiedCount: event.data.modifiedCount,
        deltaModifiedCount: event.data.deltaModifiedCount,
        totalModifiedCount: event.data.totalModifiedCount,
        origin: event.data.origin,
        harness: event.data.harness,
        trackingScope: event.data.trackingScope,
        otherAIModifiedCount: event.data.otherAIModifiedCount,
        agentHostModifiedCount: event.data.agentHostModifiedCount,
        externalModifiedCount: event.data.externalModifiedCount,
        totalModifiedCharacters: event.data.totalModifiedCharacters
      })),
      acknowledged: acknowledged && {
        agentModifiedCount: acknowledged.agentModifiedCount,
        outcome: acknowledgedOutcome
      }
    }, {
      marker: {
        version: 1,
        sequence: 1,
        editIdLength: 36,
        beforeDigest: createFileEditContentDigest("abcdef"),
        afterDigest: createFileEditContentDigest("aBcdeF"),
        source: {
          modelId: "model",
          conversationId: "session-1",
          requestId: "turn-1",
          harness: "copilotcli"
        }
      },
      events: [{
        eventName: "editTelemetry.editSources.details",
        statsUuidMatches: true,
        sourceKey: "source:Chat.applyEdits-$modelId:model-$harness:copilotcli-$origin:agentHost",
        sourceKeyCleaned: "source:Chat.applyEdits-$harness:copilotcli-$origin:agentHost",
        conversationId: "session-1",
        modifiedCount: 2,
        deltaModifiedCount: 2,
        totalModifiedCount: 2,
        origin: "agentHost",
        harness: "copilotcli",
        trackingScope: void 0,
        otherAIModifiedCount: void 0,
        agentHostModifiedCount: void 0,
        externalModifiedCount: void 0,
        totalModifiedCharacters: void 0
      }, {
        eventName: "editTelemetry.editSources.stats",
        statsUuidMatches: true,
        sourceKey: void 0,
        sourceKeyCleaned: void 0,
        conversationId: void 0,
        modifiedCount: void 0,
        deltaModifiedCount: void 0,
        totalModifiedCount: void 0,
        origin: void 0,
        harness: void 0,
        trackingScope: "agentHostStandalone",
        otherAIModifiedCount: 0,
        agentHostModifiedCount: 2,
        externalModifiedCount: 0,
        totalModifiedCharacters: 2
      }],
      acknowledged: {
        agentModifiedCount: 0,
        outcome: {
          outcome: "committed",
          agentModifiedCount: 0,
          lastSequence: 1
        }
      }
    });
  });
  test("uses the current edit metadata for each marker", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("abc"));
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, { telemetryLevel: TelemetryLevel.USAGE, publicLog2() {
    } });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    const first = await service.recordEdit({
      sessionUri: "copilotcli:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    const second = await service.recordEdit({
      sessionUri: "copilotcli:/session-1",
      turnId: "turn-2",
      toolCallId: "tool-2",
      filePath: resource.fsPath,
      beforeText: "ab",
      afterText: "abc",
      changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: "c" }],
      modelId: "model",
      toolName: "edit"
    });
    assert.deepStrictEqual([
      first?.status !== "skipped" ? first?.source : void 0,
      second?.status !== "skipped" ? second?.source : void 0
    ], [
      { modelId: "model", conversationId: "session-1", requestId: "turn-1", harness: "copilotcli" },
      { modelId: "model", conversationId: "session-1", requestId: "turn-2", harness: "copilotcli" }
    ]);
  });
  test("normalizes ahp chat harness without coalescing chat resources", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const copilotResource = URI.file("/workspace/copilot.ts");
    const claudeResource = URI.file("/workspace/claude.ts");
    await fileService.writeFile(copilotResource, VSBuffer.fromString("ab"));
    await fileService.writeFile(claudeResource, VSBuffer.fromString("ab"));
    const events = [];
    const githubEvents = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    const telemetryService = {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName, data) {
        if (eventName === "editTelemetry.editSources.details") {
          events.push(data);
        }
      },
      sendGHTelemetryEvent(eventName, properties) {
        githubEvents.push({ eventName, harness: properties?.harness });
      }
    };
    instantiationService.stub(ITelemetryService, telemetryService);
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    const copilotSessionUri = "copilotcli:/session-1";
    const copilotDefaultChatUri = buildDefaultChatUri(copilotSessionUri);
    const copilotPeerChatUri = buildChatUri(copilotSessionUri, "peer");
    const claudeChatUri = buildChatUri("claude:/session-2", "peer");
    for (const edit of [
      { sessionUri: copilotDefaultChatUri, turnId: "turn-default", filePath: copilotResource.fsPath, modelId: "copilot-model" },
      { sessionUri: copilotPeerChatUri, turnId: "turn-peer", filePath: copilotResource.fsPath, modelId: "copilot-model" },
      { sessionUri: claudeChatUri, turnId: "turn-claude", filePath: claudeResource.fsPath, modelId: "claude-model" }
    ]) {
      await service.recordEdit({
        ...edit,
        toolCallId: `tool-${edit.turnId}`,
        beforeText: "a",
        afterText: "ab",
        changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
        toolName: "edit"
      });
    }
    await service.flushSession(copilotDefaultChatUri);
    const afterDefaultChatFlush = events.length;
    await service.flushSession(copilotPeerChatUri);
    const afterPeerChatFlush = events.length;
    await service.flushSession(claudeChatUri);
    assert.deepStrictEqual({
      afterDefaultChatFlush,
      afterPeerChatFlush,
      githubEvents,
      events: events.map((event) => ({
        sourceKey: event.sourceKey,
        sourceKeyCleaned: event.sourceKeyCleaned,
        conversationId: event.conversationId,
        requestId: event.requestId,
        harness: event.harness
      }))
    }, {
      afterDefaultChatFlush: 1,
      afterPeerChatFlush: 2,
      githubEvents: [
        { eventName: "vscode.editTelemetry.editSources.details", harness: "copilotcli" },
        { eventName: "vscode.editTelemetry.editSources.stats", harness: void 0 },
        { eventName: "vscode.editTelemetry.editSources.details", harness: "copilotcli" },
        { eventName: "vscode.editTelemetry.editSources.stats", harness: void 0 }
      ],
      events: [
        {
          sourceKey: "source:Chat.applyEdits-$modelId:copilot-model-$harness:copilotcli-$origin:agentHost",
          sourceKeyCleaned: "source:Chat.applyEdits-$harness:copilotcli-$origin:agentHost",
          conversationId: "Y29waWxvdGNsaTovc2Vzc2lvbi0x",
          requestId: "turn-default",
          harness: "copilotcli"
        },
        {
          sourceKey: "source:Chat.applyEdits-$modelId:copilot-model-$harness:copilotcli-$origin:agentHost",
          sourceKeyCleaned: "source:Chat.applyEdits-$harness:copilotcli-$origin:agentHost",
          conversationId: "Y29waWxvdGNsaTovc2Vzc2lvbi0x",
          requestId: "turn-peer",
          harness: "copilotcli"
        },
        {
          sourceKey: "source:Chat.applyEdits-$modelId:claude-model-$harness:claude-$origin:agentHost",
          sourceKeyCleaned: "source:Chat.applyEdits-$harness:claude-$origin:agentHost",
          conversationId: "Y2xhdWRlOi9zZXNzaW9uLTI",
          requestId: "turn-claude",
          harness: "claude"
        }
      ]
    });
  });
  test("preserves Agent attribution across later external disk edits", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("axb"));
    const events = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, {
      computeDiffCounts: async (original, modified, timeoutMs) => computeDiffCounts(original, modified, timeoutMs ?? 5e3)
    });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName, data) {
        events.push({ eventName, data });
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilotcli:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.flushSession("copilotcli:/session-1");
    assert.deepStrictEqual(events.map((event) => ({
      eventName: event.eventName,
      statsUuidMatches: event.data.statsUuid === events[0]?.data.statsUuid,
      modifiedCount: event.data.modifiedCount,
      deltaModifiedCount: event.data.deltaModifiedCount,
      totalModifiedCount: event.data.totalModifiedCount,
      otherAIModifiedCount: event.data.otherAIModifiedCount,
      agentHostModifiedCount: event.data.agentHostModifiedCount,
      externalModifiedCount: event.data.externalModifiedCount,
      totalModifiedCharacters: event.data.totalModifiedCharacters
    })), [{
      eventName: "editTelemetry.editSources.details",
      statsUuidMatches: true,
      modifiedCount: 1,
      deltaModifiedCount: 1,
      totalModifiedCount: 2,
      otherAIModifiedCount: void 0,
      agentHostModifiedCount: void 0,
      externalModifiedCount: void 0,
      totalModifiedCharacters: void 0
    }, {
      eventName: "editTelemetry.editSources.stats",
      statsUuidMatches: true,
      modifiedCount: void 0,
      deltaModifiedCount: void 0,
      totalModifiedCount: void 0,
      otherAIModifiedCount: 0,
      agentHostModifiedCount: 1,
      externalModifiedCount: 1,
      totalModifiedCharacters: 2
    }]);
  });
  test("tracks external drift before a later tool edit and mirrors standalone stats to GitHub", async () => {
    const sessionUri = "copilotcli:/session-1";
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("axbc"));
    let localStats;
    let githubProperties;
    let githubMeasurements;
    const telemetryService = {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName, data) {
        if (eventName === "editTelemetry.editSources.stats" && data) {
          localStats = data;
        }
      },
      sendGHTelemetryEvent(eventName, properties, measurements) {
        if (eventName === "vscode.editTelemetry.editSources.stats") {
          githubProperties = properties;
          githubMeasurements = measurements;
        }
      }
    };
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, {
      computeDiffCounts: async (original, modified, timeoutMs) => computeDiffCounts(original, modified, timeoutMs ?? 5e3)
    });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, telemetryService);
    let now = 100;
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, () => now));
    await service.recordEdit({
      sessionUri,
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.recordEdit({
      sessionUri,
      turnId: "turn-2",
      toolCallId: "tool-2",
      filePath: resource.fsPath,
      beforeText: "axb",
      afterText: "axbc",
      changes: [{ startOffset: 3, endOffsetExclusive: 3, newText: "c" }],
      modelId: "model",
      toolName: "edit"
    });
    now = 250;
    await service.flushSession(sessionUri);
    assert.deepStrictEqual({
      local: localStats && {
        statsUuid: localStats.statsUuid,
        trackingScope: localStats.trackingScope,
        otherAIModifiedCount: localStats.otherAIModifiedCount,
        agentHostModifiedCount: localStats.agentHostModifiedCount,
        externalModifiedCount: localStats.externalModifiedCount,
        totalModifiedCharacters: localStats.totalModifiedCharacters,
        actualTime: localStats.actualTime,
        languageId: localStats.languageId,
        isTrackedByGit: localStats.isTrackedByGit,
        focusTime: localStats.focusTime
      },
      github: {
        statsUuid: githubProperties?.statsUuid,
        trackingScope: githubProperties?.trackingScope,
        otherAIModifiedCount: githubMeasurements?.otherAIModifiedCount,
        agentHostModifiedCount: githubMeasurements?.agentHostModifiedCount,
        externalModifiedCount: githubMeasurements?.externalModifiedCount,
        totalModifiedCharacters: githubMeasurements?.totalModifiedCharacters,
        actualTime: githubMeasurements?.actualTime
      }
    }, {
      local: {
        statsUuid: localStats?.statsUuid,
        trackingScope: "agentHostStandalone",
        otherAIModifiedCount: 0,
        agentHostModifiedCount: 2,
        externalModifiedCount: 1,
        totalModifiedCharacters: 3,
        actualTime: 150,
        languageId: void 0,
        isTrackedByGit: void 0,
        focusTime: void 0
      },
      github: {
        statsUuid: localStats?.statsUuid,
        trackingScope: "agentHostStandalone",
        otherAIModifiedCount: 0,
        agentHostModifiedCount: 2,
        externalModifiedCount: 1,
        totalModifiedCharacters: 3,
        actualTime: 150
      }
    });
  });
  test("attributes an external overwrite without retaining overwritten Agent characters", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("xyz"));
    let stats;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, {
      computeDiffCounts: async (original, modified, timeoutMs) => computeDiffCounts(original, modified, timeoutMs ?? 5e3)
    });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName, data) {
        if (eventName === "editTelemetry.editSources.stats") {
          stats = data;
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.flushSession("copilot:/session-1");
    assert.deepStrictEqual(stats && {
      otherAIModifiedCount: stats.otherAIModifiedCount,
      agentHostModifiedCount: stats.agentHostModifiedCount,
      externalModifiedCount: stats.externalModifiedCount,
      totalModifiedCharacters: stats.totalModifiedCharacters
    }, {
      otherAIModifiedCount: 0,
      agentHostModifiedCount: 0,
      externalModifiedCount: 3,
      totalModifiedCharacters: 3
    });
  });
  test("tracks creates and removes retained attribution after deletion", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString(""));
    const events = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName, data) {
        if (eventName === "editTelemetry.editSources.details") {
          events.push(data);
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, void 0, void 0));
    const baseEdit = {
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      filePath: resource.fsPath,
      modelId: "model",
      toolName: "edit"
    };
    await service.recordEdit({
      ...baseEdit,
      toolCallId: "tool-create",
      beforeText: "",
      afterText: "abc",
      changes: [{ startOffset: 0, endOffsetExclusive: 0, newText: "abc" }]
    });
    await service.recordEdit({
      ...baseEdit,
      toolCallId: "tool-delete",
      beforeText: "abc",
      afterText: "",
      changes: [{ startOffset: 0, endOffsetExclusive: 3, newText: "" }]
    });
    await service.flushSession("copilot:/session-1");
    assert.deepStrictEqual(events.map((event) => ({
      modifiedCount: event.modifiedCount,
      deltaModifiedCount: event.deltaModifiedCount,
      totalModifiedCount: event.totalModifiedCount
    })), [{
      modifiedCount: 0,
      deltaModifiedCount: 3,
      totalModifiedCount: 0
    }]);
  });
  test("flushes Agent-only resources when HEAD changes", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    const triggers = [];
    const statsTriggers = [];
    let head = "head-1";
    let branch = "main";
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName, data) {
        if (eventName === "editTelemetry.editSources.details") {
          triggers.push(data.trigger);
        } else if (eventName === "editTelemetry.editSources.stats") {
          statsTriggers.push(data.trigger);
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => ({
      root: "/workspace",
      branch,
      head
    }), void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    head = "head-2";
    await service.checkGitState();
    await fileService.writeFile(resource, VSBuffer.fromString("abc"));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-2",
      toolCallId: "tool-2",
      filePath: resource.fsPath,
      beforeText: "ab",
      afterText: "abc",
      changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: "c" }],
      modelId: "model",
      toolName: "edit"
    });
    branch = "feature";
    await service.checkGitState();
    assert.deepStrictEqual({
      details: triggers,
      stats: statsTriggers
    }, {
      details: ["hashChange", "branchChange"],
      stats: ["hashChange", "branchChange"]
    });
  });
  test("emits standalone stats after ten hours", () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 2e3 }, async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    const triggers = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName, data) {
        if (eventName === "editTelemetry.editSources.stats") {
          triggers.push(data.trigger);
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await timeout(10 * 60 * 60 * 1e3);
    await timeout(0);
    assert.deepStrictEqual(triggers, ["10hours"]);
    service.dispose();
  }));
  test("emits standalone stats when the service is disposed", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    const triggers = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName, data) {
        if (eventName === "editTelemetry.editSources.stats") {
          triggers.push(data.trigger);
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    service.dispose();
    await timeout(0);
    assert.deepStrictEqual(triggers, ["closed"]);
  });
  test("continues a Git-triggered flush after one resource fails", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    const provider = disposables.add(new class extends InMemoryFileSystemProvider {
      async readFile(resource) {
        if (resource.path === this.failPath) {
          throw new Error("Read failed");
        }
        return super.readFile(resource);
      }
    }());
    disposables.add(fileService.registerProvider("file", provider));
    const failingResource = URI.file("/workspace/failing.ts");
    const successfulResource = URI.file("/workspace/successful.ts");
    await fileService.writeFile(failingResource, VSBuffer.fromString("ab"));
    await fileService.writeFile(successfulResource, VSBuffer.fromString("ab"));
    let branch = "main";
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName) {
        if (eventName === "editTelemetry.editSources.details") {
          eventCount++;
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => ({
      root: "/workspace",
      branch,
      head: "head-1"
    }), void 0));
    for (const [toolCallId, resource] of [["tool-failing", failingResource], ["tool-successful", successfulResource]]) {
      await service.recordEdit({
        sessionUri: "copilot:/session-1",
        turnId: "turn-1",
        toolCallId,
        filePath: resource.fsPath,
        beforeText: "a",
        afterText: "ab",
        changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
        modelId: "model",
        toolName: "edit"
      });
    }
    provider.failPath = failingResource.path;
    branch = "feature";
    await service.checkGitState();
    const eventCountAfterFailure = eventCount;
    provider.failPath = void 0;
    await service.checkGitState();
    assert.deepStrictEqual({
      eventCountAfterFailure,
      eventCountAfterRetry: eventCount
    }, {
      eventCountAfterFailure: 1,
      eventCountAfterRetry: 2
    });
  });
  test("keeps a Git boundary pending while an edit is being recorded", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    const bridgeStarted = new DeferredPromise();
    const bridgeResult = new DeferredPromise();
    let branch = "main";
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, {
      async computeDiffCounts(original, modified, timeoutMs) {
        if (original === "ab" && modified === "ac") {
          bridgeStarted.complete();
          return bridgeResult.p;
        }
        return computeDiffCounts(original, modified, timeoutMs ?? 5e3);
      }
    });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName) {
        if (eventName === "editTelemetry.editSources.details") {
          eventCount++;
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => ({
      root: "/workspace",
      branch,
      head: "head-1"
    }), void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    const recording = service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-2",
      toolCallId: "tool-2",
      filePath: resource.fsPath,
      beforeText: "ac",
      afterText: "acd",
      changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: "d" }],
      modelId: "model",
      toolName: "edit"
    });
    await bridgeStarted.p;
    await fileService.writeFile(resource, VSBuffer.fromString("acd"));
    branch = "feature";
    await service.checkGitState();
    const eventCountWhileRecording = eventCount;
    bridgeResult.complete(computeDiffCounts("ab", "ac", 5e3));
    await recording;
    await service.checkGitState();
    assert.deepStrictEqual({
      eventCountWhileRecording,
      eventCountAfterRecording: eventCount
    }, {
      eventCountWhileRecording: 0,
      eventCountAfterRecording: 1
    });
  });
  test("serializes a new edit behind a failing Git flush", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    const readStarted = new DeferredPromise();
    const readResult = new DeferredPromise();
    const provider = disposables.add(new class extends InMemoryFileSystemProvider {
      constructor() {
        super(...arguments);
        this.blockReads = false;
      }
      async readFile(resource2) {
        if (this.blockReads) {
          readStarted.complete();
          return readResult.p;
        }
        return super.readFile(resource2);
      }
    }());
    disposables.add(fileService.registerProvider("file", provider));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    let branch = "main";
    const retainedCounts = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName, data) {
        if (eventName === "editTelemetry.editSources.details") {
          retainedCounts.push(data.modifiedCount);
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => ({
      root: "/workspace",
      branch,
      head: "head-1"
    }), void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    provider.blockReads = true;
    branch = "feature";
    const boundaryFlush = service.checkGitState();
    await readStarted.p;
    await fileService.writeFile(resource, VSBuffer.fromString("abc"));
    const recording = service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-2",
      toolCallId: "tool-2",
      filePath: resource.fsPath,
      beforeText: "ab",
      afterText: "abc",
      changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: "c" }],
      modelId: "model",
      toolName: "edit"
    });
    await readResult.error(new Error("Read failed"));
    await boundaryFlush;
    await recording;
    provider.blockReads = false;
    await service.checkGitState();
    assert.deepStrictEqual(retainedCounts, [2]);
  });
  test("does not retain attribution when usage telemetry is disabled", async () => {
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, disposables.add(new FileService(new NullLogService())));
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, { telemetryLevel: TelemetryLevel.NONE });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, void 0, void 0));
    const marker = await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: "/workspace/file.ts",
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    assert.strictEqual(marker, void 0);
  });
  test("discards attribution when edit telemetry is disabled", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName) {
        if (eventName === "editTelemetry.editSources.details") {
          eventCount++;
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    service.setEnabled(false);
    const marker = await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-2",
      toolCallId: "tool-2",
      filePath: resource.fsPath,
      beforeText: "ab",
      afterText: "abc",
      changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: "c" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.flushSession("copilot:/session-1");
    assert.deepStrictEqual({ marker, eventCount }, { marker: void 0, eventCount: 0 });
  });
  test("fences in-flight attribution after edit telemetry is disabled", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    const repositoryReadStarted = new DeferredPromise();
    const repositoryRead = new DeferredPromise();
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName) {
        if (eventName === "editTelemetry.editSources.details") {
          eventCount++;
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => {
      repositoryReadStarted.complete();
      return repositoryRead.p;
    }, void 0));
    const recordEdit = service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: "/workspace/file.ts",
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await repositoryReadStarted.p;
    service.setEnabled(false);
    service.setEnabled(true);
    repositoryRead.complete(void 0);
    const marker = await recordEdit;
    await service.flushSession("copilot:/session-1");
    assert.deepStrictEqual({ marker, eventCount }, { marker: void 0, eventCount: 0 });
  });
  test("signals files larger than the five MB attribution limit", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/large.ts");
    const beforeText = "a".repeat(6 * 1024 * 1024);
    const afterText = `${beforeText}b`;
    await fileService.writeFile(resource, VSBuffer.fromString(afterText));
    const statsEvents = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName, data) {
        if (eventName === "editTelemetry.editSources.stats") {
          statsEvents.push(data);
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    const marker = await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText,
      afterText,
      changes: [{ startOffset: beforeText.length, endOffsetExclusive: beforeText.length, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.flushSession("copilot:/session-1");
    assert.deepStrictEqual({
      marker: marker && {
        status: marker.status,
        reason: marker.status === "skipped" ? marker.reason : void 0,
        insertedCount: marker.status === "skipped" ? marker.insertedCount : void 0
      },
      stats: statsEvents.map((event) => ({
        otherAIModifiedCount: event.otherAIModifiedCount,
        agentHostModifiedCount: event.agentHostModifiedCount,
        externalModifiedCount: event.externalModifiedCount,
        totalModifiedCharacters: event.totalModifiedCharacters,
        agentHostAttributionCoverage: event.agentHostAttributionCoverage,
        agentHostUntrackedEditCount: event.agentHostUntrackedEditCount,
        agentHostUntrackedInsertedCount: event.agentHostUntrackedInsertedCount
      }))
    }, {
      marker: {
        status: "skipped",
        reason: "fileTooLarge",
        insertedCount: 1
      },
      stats: [{
        otherAIModifiedCount: 0,
        agentHostModifiedCount: 0,
        externalModifiedCount: 0,
        totalModifiedCharacters: 0,
        agentHostAttributionCoverage: "partial",
        agentHostUntrackedEditCount: 1,
        agentHostUntrackedInsertedCount: 1
      }]
    });
  });
  test("includes prior tracked edits when an oversized edit creates a coverage gap", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/large.ts");
    const oversizedText = "x".repeat(6 * 1024 * 1024);
    await fileService.writeFile(resource, VSBuffer.fromString(oversizedText));
    let stats;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName, data) {
        if (eventName === "editTelemetry.editSources.stats") {
          stats = data;
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    const marker = await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-2",
      toolCallId: "tool-2",
      filePath: resource.fsPath,
      beforeText: "ab",
      afterText: oversizedText,
      changes: [{ startOffset: 0, endOffsetExclusive: 2, newText: oversizedText }],
      modelId: "model",
      toolName: "edit"
    });
    await service.flushSession("copilot:/session-1");
    const acknowledged = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    assert.deepStrictEqual({
      marker: marker?.status === "skipped" ? {
        untrackedEditCount: marker.untrackedEditCount,
        insertedCount: marker.insertedCount
      } : marker,
      stats: stats && {
        agentHostAttributionCoverage: stats.agentHostAttributionCoverage,
        agentHostUntrackedEditCount: stats.agentHostUntrackedEditCount,
        agentHostUntrackedInsertedCount: stats.agentHostUntrackedInsertedCount
      },
      standaloneCoverageGapAcknowledgements: acknowledged?.standaloneCoverageGapAcknowledgements?.map((acknowledgement) => ({
        idLength: acknowledgement.id.length,
        sequences: acknowledgement.sequences,
        editCount: acknowledgement.editCount,
        insertedCount: acknowledgement.insertedCount
      }))
    }, {
      marker: {
        untrackedEditCount: 2,
        insertedCount: oversizedText.length + 1
      },
      stats: {
        agentHostAttributionCoverage: "partial",
        agentHostUntrackedEditCount: 2,
        agentHostUntrackedInsertedCount: oversizedText.length + 1
      },
      standaloneCoverageGapAcknowledgements: [{
        idLength: 36,
        sequences: [2],
        editCount: 2,
        insertedCount: oversizedText.length + 1
      }]
    });
  });
  test("flushes before oversized coverage sequences grow without bound", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/large.ts");
    const beforeText = "x".repeat(6 * 1024 * 1024);
    const afterText = `${beforeText}y`;
    await fileService.writeFile(resource, VSBuffer.fromString(afterText));
    const stats = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName, data) {
        if (eventName === "editTelemetry.editSources.stats") {
          stats.push(data);
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    for (let edit = 0; edit < 128; edit++) {
      await service.recordEdit({
        sessionUri: "copilot:/session-1",
        turnId: `turn-${edit}`,
        toolCallId: `tool-${edit}`,
        filePath: resource.fsPath,
        beforeText,
        afterText,
        changes: [{ startOffset: beforeText.length, endOffsetExclusive: beforeText.length, newText: "y" }],
        modelId: "model",
        toolName: "edit"
      });
    }
    assert.deepStrictEqual(stats.map((event) => ({
      agentHostAttributionCoverage: event.agentHostAttributionCoverage,
      agentHostUntrackedEditCount: event.agentHostUntrackedEditCount,
      agentHostUntrackedInsertedCount: event.agentHostUntrackedInsertedCount
    })), [{
      agentHostAttributionCoverage: "partial",
      agentHostUntrackedEditCount: 128,
      agentHostUntrackedInsertedCount: 128
    }]);
  });
  test("paginates standalone coverage acknowledgements without advancing their cutoff", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/large.ts");
    const beforeText = "x".repeat(6 * 1024 * 1024);
    const afterText = `${beforeText}y`;
    await fileService.writeFile(resource, VSBuffer.fromString(afterText));
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, { telemetryLevel: TelemetryLevel.USAGE, publicLog2() {
    } });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    for (let edit = 1; edit <= 129; edit++) {
      await service.recordEdit({
        sessionUri: "copilot:/session-1",
        turnId: `turn-${edit}`,
        toolCallId: `tool-${edit}`,
        filePath: resource.fsPath,
        beforeText,
        afterText,
        changes: [{ startOffset: beforeText.length, endOffsetExclusive: beforeText.length, newText: "y" }],
        modelId: "model",
        toolName: "edit"
      });
      await service.flushSession("copilot:/session-1");
    }
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    await service.recordEdit({
      sessionUri: "copilot:/session-live",
      turnId: "turn-live",
      toolCallId: "tool-live",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    const first = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    await service.commitFlush({ flushToken: "flush-1", totalModifiedCount: 0 });
    const second = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-2",
      isDirty: false,
      flushToken: "flush-2",
      languageId: "typescript"
    });
    assert.deepStrictEqual({
      first: first && {
        lastSequence: first.lastSequence,
        coverageGapThroughSequence: first.coverageGapThroughSequence,
        acknowledgementCount: first.standaloneCoverageGapAcknowledgements?.length
      },
      second: second && {
        lastSequence: second.lastSequence,
        coverageGapThroughSequence: second.coverageGapThroughSequence,
        acknowledgementCount: second.standaloneCoverageGapAcknowledgements?.length
      }
    }, {
      first: {
        lastSequence: 130,
        coverageGapThroughSequence: 128,
        acknowledgementCount: 128
      },
      second: {
        lastSequence: 129,
        coverageGapThroughSequence: 129,
        acknowledgementCount: 1
      }
    });
  });
  test("returns a marker when the interval safety limit flushes the resource", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    const characters = Array.from("a".repeat(20001));
    const changes = [];
    for (let offset = 0; offset < characters.length; offset += 2) {
      characters[offset] = "b";
      changes.push({ startOffset: offset, endOffsetExclusive: offset + 1, newText: "b" });
    }
    const afterText = characters.join("");
    await fileService.writeFile(resource, VSBuffer.fromString(afterText));
    let eventCount = 0;
    let statsCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName) {
        if (eventName === "editTelemetry.editSources.details") {
          eventCount++;
        } else if (eventName === "editTelemetry.editSources.stats") {
          statsCount++;
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    const marker = await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a".repeat(20001),
      afterText,
      changes,
      modelId: "model",
      toolName: "edit"
    });
    assert.deepStrictEqual({
      status: marker?.status,
      eventCount,
      statsCount
    }, {
      status: void 0,
      eventCount: 1,
      statsCount: 1
    });
  });
  test("retries expired non-repository lookups", async () => {
    let now = 0;
    let repositoryReadCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, disposables.add(new FileService(new NullLogService())));
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, { telemetryLevel: TelemetryLevel.USAGE });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => {
      repositoryReadCount++;
      return void 0;
    }, () => now));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: "/workspace/file.ts",
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-2",
      toolCallId: "tool-2",
      filePath: "/workspace/file.ts",
      beforeText: "ab",
      afterText: "abc",
      changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: "c" }],
      modelId: "model",
      toolName: "edit"
    });
    now = 10 * 60 * 1e3 + 1;
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-3",
      toolCallId: "tool-3",
      filePath: "/workspace/file.ts",
      beforeText: "abc",
      afterText: "abcd",
      changes: [{ startOffset: 3, endOffsetExclusive: 3, newText: "d" }],
      modelId: "model",
      toolName: "edit"
    });
    assert.strictEqual(repositoryReadCount, 2);
  });
  test("flushes only the closing session when sessions edit the same file", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("abc"));
    const events = [];
    const statsEvents = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, {
      computeDiffCounts: async (original, modified, timeoutMs) => computeDiffCounts(original, modified, timeoutMs ?? 5e3)
    });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName, data) {
        if (eventName === "editTelemetry.editSources.details") {
          events.push(data);
        } else if (eventName === "editTelemetry.editSources.stats") {
          statsEvents.push(data);
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-a",
      turnId: "turn-a",
      toolCallId: "tool-a",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.recordEdit({
      sessionUri: "copilot:/session-b",
      turnId: "turn-b",
      toolCallId: "tool-b",
      filePath: resource.fsPath,
      beforeText: "ab",
      afterText: "abc",
      changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: "c" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.flushSession("copilot:/session-b");
    const afterFirstFlush = events.map((event) => event.conversationId);
    await service.flushSession("copilot:/session-a");
    const acknowledged = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    await service.commitFlush({ flushToken: acknowledged.flushToken, totalModifiedCount: 0 });
    assert.deepStrictEqual({
      afterFirstFlush,
      acknowledged: acknowledged && {
        agentModifiedCount: acknowledged.agentModifiedCount,
        lastSequence: acknowledged.lastSequence
      },
      stats: statsEvents.map((event) => ({
        otherAIModifiedCount: event.otherAIModifiedCount,
        agentHostModifiedCount: event.agentHostModifiedCount,
        externalModifiedCount: event.externalModifiedCount,
        totalModifiedCharacters: event.totalModifiedCharacters
      })),
      allEvents: events.map((event) => ({
        conversationId: event.conversationId,
        modifiedCount: event.modifiedCount,
        deltaModifiedCount: event.deltaModifiedCount
      }))
    }, {
      afterFirstFlush: ["session-b"],
      acknowledged: {
        agentModifiedCount: 0,
        lastSequence: 2
      },
      stats: [
        { otherAIModifiedCount: 0, agentHostModifiedCount: 1, externalModifiedCount: 0, totalModifiedCharacters: 1 },
        { otherAIModifiedCount: 0, agentHostModifiedCount: 1, externalModifiedCount: 0, totalModifiedCharacters: 1 }
      ],
      allEvents: [
        { conversationId: "session-b", modifiedCount: 1, deltaModifiedCount: 1 },
        { conversationId: "session-a", modifiedCount: 1, deltaModifiedCount: 1 }
      ]
    });
  });
  test("bounds same-file reconciliation by one aggregate deadline", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("abcde"));
    let now = 0;
    const timeoutValues = [];
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, {
      async computeDiffCounts(original, modified, timeoutMs) {
        timeoutValues.push(timeoutMs ?? 0);
        now += 5e3;
        return computeDiffCounts(original, modified, timeoutMs ?? 5e3);
      }
    });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2() {
        eventCount++;
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, () => now));
    for (const [sessionUri, beforeText, afterText] of [
      ["copilot:/session-a", "a", "ab"],
      ["copilot:/session-b", "ab", "abc"],
      ["copilot:/session-c", "abc", "abcd"],
      ["copilot:/session-d", "abcd", "abcde"]
    ]) {
      await service.recordEdit({
        sessionUri,
        turnId: "turn-1",
        toolCallId: "tool-1",
        filePath: resource.fsPath,
        beforeText,
        afterText,
        changes: [{ startOffset: beforeText.length, endOffsetExclusive: beforeText.length, newText: afterText.slice(beforeText.length) }],
        modelId: "model",
        toolName: "edit"
      });
    }
    await service.flushSession("copilot:/session-a");
    assert.deepStrictEqual({ timeoutValues, eventCount }, {
      timeoutValues: [8e3, 3e3],
      eventCount: 0
    });
  });
  test("coordinates a live session after another session flushed the same file", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("abc"));
    const events = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName, data) {
        if (eventName === "editTelemetry.editSources.details") {
          events.push(data);
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-a",
      turnId: "turn-a",
      toolCallId: "tool-a",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.recordEdit({
      sessionUri: "copilot:/session-b",
      turnId: "turn-b",
      toolCallId: "tool-b",
      filePath: resource.fsPath,
      beforeText: "ab",
      afterText: "abc",
      changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: "c" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.flushSession("copilot:/session-a");
    const prepared = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    await service.commitFlush({ flushToken: prepared.flushToken, totalModifiedCount: prepared.agentModifiedCount });
    assert.deepStrictEqual(events.map((event) => ({
      conversationId: event.conversationId,
      modifiedCount: event.modifiedCount
    })), [
      { conversationId: "session-a", modifiedCount: 0 },
      { conversationId: "session-b", modifiedCount: 1 }
    ]);
  });
  test("claims a resource once when flush triggers race", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName) {
        if (eventName === "editTelemetry.editSources.details") {
          eventCount++;
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    const [_, prepared] = await Promise.all([
      service.flushSession("copilot:/session-1"),
      service.prepareFlush({
        resource,
        trigger: "closed",
        statsUuid: "stats-1",
        isDirty: false,
        flushToken: "flush-1",
        languageId: "typescript"
      })
    ]);
    assert.deepStrictEqual({
      prepared: prepared && {
        agentModifiedCount: prepared.agentModifiedCount,
        lastSequence: prepared.lastSequence
      },
      eventCount
    }, {
      prepared: {
        agentModifiedCount: 0,
        lastSequence: 1
      },
      eventCount: 1
    });
  });
  test("coordinates Windows resources when path casing differs", async () => {
    if (!isWindows) {
      return;
    }
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    const filePath = URI.file("/Workspace/file.ts").fsPath;
    await fileService.createFolder(URI.file("/Workspace"));
    await fileService.writeFile(URI.file(filePath), VSBuffer.fromString("ab"));
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2() {
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    const prepared = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    assert.deepStrictEqual(prepared && {
      flushToken: prepared.flushToken,
      agentModifiedCount: prepared.agentModifiedCount
    }, {
      flushToken: "flush-1",
      agentModifiedCount: 1
    });
  });
  test("restores prepared resources when a coordinated flush is cancelled", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName) {
        if (eventName === "editTelemetry.editSources.details") {
          eventCount++;
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    const prepared = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    await service.cancelFlush({ flushToken: prepared.flushToken });
    await service.flushSession("copilot:/session-1");
    assert.strictEqual(eventCount, 1);
  });
  test("waits for an in-flight prepare before cancelling it", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    const readStarted = new DeferredPromise();
    const readResult = new DeferredPromise();
    const provider = disposables.add(new class extends InMemoryFileSystemProvider {
      constructor() {
        super(...arguments);
        this.blockReads = false;
      }
      async readFile(resource2) {
        if (this.blockReads) {
          readStarted.complete();
          return readResult.p;
        }
        return super.readFile(resource2);
      }
    }());
    disposables.add(fileService.registerProvider("file", provider));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName) {
        if (eventName === "editTelemetry.editSources.details") {
          eventCount++;
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    provider.blockReads = true;
    const prepare = service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    await readStarted.p;
    const cancel = service.cancelFlush({ flushToken: "flush-1" });
    readResult.complete(VSBuffer.fromString("ab").buffer);
    const [prepared, cancelOutcome] = await Promise.all([prepare, cancel]);
    provider.blockReads = false;
    await service.flushSession("copilot:/session-1");
    assert.deepStrictEqual({
      prepared: prepared?.agentModifiedCount,
      cancelOutcome,
      eventCount
    }, {
      prepared: 1,
      cancelOutcome: { outcome: "cancelled", agentModifiedCount: 0 },
      eventCount: 1
    });
  });
  test("reserves a standalone acknowledgement for one prepared flush", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2() {
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.flushSession("copilot:/session-1");
    const first = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    const duplicate = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-2",
      isDirty: false,
      flushToken: "flush-2",
      languageId: "typescript"
    });
    await service.cancelFlush({ flushToken: "flush-1" });
    const restored = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-3",
      isDirty: false,
      flushToken: "flush-3",
      languageId: "typescript"
    });
    await service.cancelFlush({ flushToken: "flush-3" });
    assert.deepStrictEqual({
      first: first?.agentModifiedCount,
      duplicate,
      restored: restored?.agentModifiedCount
    }, {
      first: 0,
      duplicate: void 0,
      restored: 0
    });
  });
  test("makes commit and cancellation idempotent after telemetry is emitted", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName) {
        if (eventName === "editTelemetry.editSources.details") {
          eventCount++;
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    const outcomes = [
      await service.commitFlush({ flushToken: "flush-1", totalModifiedCount: 1 }),
      await service.commitFlush({ flushToken: "flush-1", totalModifiedCount: 1 }),
      await service.cancelFlush({ flushToken: "flush-1" })
    ];
    assert.deepStrictEqual({ outcomes, eventCount }, {
      outcomes: [
        { outcome: "committed", agentModifiedCount: 1, lastSequence: 1, coverageGapThroughSequence: 1 },
        { outcome: "committed", agentModifiedCount: 1, lastSequence: 1, coverageGapThroughSequence: 1 },
        { outcome: "committed", agentModifiedCount: 1, lastSequence: 1, coverageGapThroughSequence: 1 }
      ],
      eventCount: 1
    });
  });
  test("restores an unclaimed prepared flush after its timeout", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName) {
        if (eventName === "editTelemetry.editSources.details") {
          eventCount++;
        }
      }
    });
    let now = 0;
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, () => now));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    now = 5 * 60 * 1e3 + 1;
    await service.checkGitState();
    const commitOutcome = await service.commitFlush({ flushToken: "flush-1", totalModifiedCount: 1 });
    await service.flushSession("copilot:/session-1");
    assert.deepStrictEqual({ commitOutcome, eventCount }, {
      commitOutcome: { outcome: "cancelled", agentModifiedCount: 0 },
      eventCount: 1
    });
  });
  test("fences a prepare request that arrives after cancellation", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName) {
        if (eventName === "editTelemetry.editSources.details") {
          eventCount++;
        }
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    const cancelOutcome = await service.cancelFlush({ flushToken: "flush-1" });
    const prepared = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    await service.flushSession("copilot:/session-1");
    assert.deepStrictEqual({ cancelOutcome, prepared, eventCount }, {
      cancelOutcome: { outcome: "cancelled", agentModifiedCount: 0 },
      prepared: void 0,
      eventCount: 1
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UsIFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSURpZmZDb21wdXRlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9kaWZmQ29tcHV0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlRmlsZUVkaXRDb250ZW50RGlnZXN0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVFZGl0QXR0cmlidXRpb24uanMnO1xuaW1wb3J0IHsgYnVpbGRDaGF0VXJpLCBidWlsZERlZmF1bHRDaGF0VXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL3NoYXJlZC9hZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY29tcHV0ZURpZmZDb3VudHMgfSBmcm9tICcuLi8uLi9ub2RlL2RpZmZXb3JrZXJNYWluLmpzJztcbmltcG9ydCB7IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvblRlc3RIZWxwZXJzLmpzJztcblxuc3VpdGUoJ0FnZW50IEVkaXQgQXR0cmlidXRpb24gU2VydmljZScsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdlbWl0cyByZXRhaW5lZCBBZ2VudCBjaGFyYWN0ZXJzIGZyb20gZGlzam9pbnQgZWRpdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhQmNkZUYnKSk7XG5cblx0XHRjb25zdCBldmVudHM6IHsgZXZlbnROYW1lOiBzdHJpbmc7IGRhdGE6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZD4gfVtdID0gW107XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwge1xuXHRcdFx0Y29tcHV0ZURpZmZDb3VudHM6IGFzeW5jIChvcmlnaW5hbCwgbW9kaWZpZWQsIHRpbWVvdXRNcykgPT4gY29tcHV0ZURpZmZDb3VudHMob3JpZ2luYWwsIG1vZGlmaWVkLCB0aW1lb3V0TXMgPz8gNV8wMDApLFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHR0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwuVVNBR0UsXG5cdFx0XHRwdWJsaWNMb2cyKGV2ZW50TmFtZSwgZGF0YSkge1xuXHRcdFx0XHRldmVudHMucHVzaCh7IGV2ZW50TmFtZSwgZGF0YTogZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQ+IH0pO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblxuXHRcdGNvbnN0IG1hcmtlciA9IGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdGNsaTovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnYWJjZGVmJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FCY2RlRicsXG5cdFx0XHRjaGFuZ2VzOiBbXG5cdFx0XHRcdHsgc3RhcnRPZmZzZXQ6IDEsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMiwgbmV3VGV4dDogJ0InIH0sXG5cdFx0XHRcdHsgc3RhcnRPZmZzZXQ6IDUsIGVuZE9mZnNldEV4Y2x1c2l2ZTogNiwgbmV3VGV4dDogJ0YnIH0sXG5cdFx0XHRdLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cdFx0YXdhaXQgc2VydmljZS5mbHVzaFNlc3Npb24oJ2NvcGlsb3RjbGk6L3Nlc3Npb24tMScpO1xuXHRcdGNvbnN0IGFja25vd2xlZGdlZCA9IGF3YWl0IHNlcnZpY2UucHJlcGFyZUZsdXNoKHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0dHJpZ2dlcjogJ2Nsb3NlZCcsXG5cdFx0XHRzdGF0c1V1aWQ6ICdzdGF0cy0yJyxcblx0XHRcdGlzRGlydHk6IGZhbHNlLFxuXHRcdFx0Zmx1c2hUb2tlbjogJ2ZsdXNoLXN0YW5kYWxvbmUnLFxuXHRcdFx0bGFuZ3VhZ2VJZDogJ3R5cGVzY3JpcHQnLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFja25vd2xlZGdlZE91dGNvbWUgPSBhd2FpdCBzZXJ2aWNlLmNvbW1pdEZsdXNoKHtcblx0XHRcdGZsdXNoVG9rZW46IGFja25vd2xlZGdlZCEuZmx1c2hUb2tlbixcblx0XHRcdHRvdGFsTW9kaWZpZWRDb3VudDogMCxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWFya2VyOiBtYXJrZXI/LnN0YXR1cyAhPT0gJ3NraXBwZWQnICYmIG1hcmtlciA/IHtcblx0XHRcdFx0dmVyc2lvbjogbWFya2VyLnZlcnNpb24sXG5cdFx0XHRcdHNlcXVlbmNlOiBtYXJrZXIuc2VxdWVuY2UsXG5cdFx0XHRcdGVkaXRJZExlbmd0aDogbWFya2VyLmVkaXRJZC5sZW5ndGgsXG5cdFx0XHRcdGJlZm9yZURpZ2VzdDogbWFya2VyLmJlZm9yZURpZ2VzdCxcblx0XHRcdFx0YWZ0ZXJEaWdlc3Q6IG1hcmtlci5hZnRlckRpZ2VzdCxcblx0XHRcdFx0c291cmNlOiBtYXJrZXIuc291cmNlLFxuXHRcdFx0fSA6IG1hcmtlcixcblx0XHRcdGV2ZW50czogZXZlbnRzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0XHRldmVudE5hbWU6IGV2ZW50LmV2ZW50TmFtZSxcblx0XHRcdFx0c3RhdHNVdWlkTWF0Y2hlczogZXZlbnQuZGF0YS5zdGF0c1V1aWQgPT09IGV2ZW50c1swXT8uZGF0YS5zdGF0c1V1aWQsXG5cdFx0XHRcdHNvdXJjZUtleTogZXZlbnQuZGF0YS5zb3VyY2VLZXksXG5cdFx0XHRcdHNvdXJjZUtleUNsZWFuZWQ6IGV2ZW50LmRhdGEuc291cmNlS2V5Q2xlYW5lZCxcblx0XHRcdFx0Y29udmVyc2F0aW9uSWQ6IGV2ZW50LmRhdGEuY29udmVyc2F0aW9uSWQsXG5cdFx0XHRcdG1vZGlmaWVkQ291bnQ6IGV2ZW50LmRhdGEubW9kaWZpZWRDb3VudCxcblx0XHRcdFx0ZGVsdGFNb2RpZmllZENvdW50OiBldmVudC5kYXRhLmRlbHRhTW9kaWZpZWRDb3VudCxcblx0XHRcdFx0dG90YWxNb2RpZmllZENvdW50OiBldmVudC5kYXRhLnRvdGFsTW9kaWZpZWRDb3VudCxcblx0XHRcdFx0b3JpZ2luOiBldmVudC5kYXRhLm9yaWdpbixcblx0XHRcdFx0aGFybmVzczogZXZlbnQuZGF0YS5oYXJuZXNzLFxuXHRcdFx0XHR0cmFja2luZ1Njb3BlOiBldmVudC5kYXRhLnRyYWNraW5nU2NvcGUsXG5cdFx0XHRcdG90aGVyQUlNb2RpZmllZENvdW50OiBldmVudC5kYXRhLm90aGVyQUlNb2RpZmllZENvdW50LFxuXHRcdFx0XHRhZ2VudEhvc3RNb2RpZmllZENvdW50OiBldmVudC5kYXRhLmFnZW50SG9zdE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGV4dGVybmFsTW9kaWZpZWRDb3VudDogZXZlbnQuZGF0YS5leHRlcm5hbE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdHRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzOiBldmVudC5kYXRhLnRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzLFxuXHRcdFx0fSkpLFxuXHRcdFx0YWNrbm93bGVkZ2VkOiBhY2tub3dsZWRnZWQgJiYge1xuXHRcdFx0XHRhZ2VudE1vZGlmaWVkQ291bnQ6IGFja25vd2xlZGdlZC5hZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdG91dGNvbWU6IGFja25vd2xlZGdlZE91dGNvbWUsXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdG1hcmtlcjoge1xuXHRcdFx0XHR2ZXJzaW9uOiAxLFxuXHRcdFx0XHRzZXF1ZW5jZTogMSxcblx0XHRcdFx0ZWRpdElkTGVuZ3RoOiAzNixcblx0XHRcdFx0YmVmb3JlRGlnZXN0OiBjcmVhdGVGaWxlRWRpdENvbnRlbnREaWdlc3QoJ2FiY2RlZicpLFxuXHRcdFx0XHRhZnRlckRpZ2VzdDogY3JlYXRlRmlsZUVkaXRDb250ZW50RGlnZXN0KCdhQmNkZUYnKSxcblx0XHRcdFx0c291cmNlOiB7XG5cdFx0XHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdFx0XHRjb252ZXJzYXRpb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHRcdFx0cmVxdWVzdElkOiAndHVybi0xJyxcblx0XHRcdFx0XHRoYXJuZXNzOiAnY29waWxvdGNsaScsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0ZXZlbnRzOiBbe1xuXHRcdFx0XHRldmVudE5hbWU6ICdlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLmRldGFpbHMnLFxuXHRcdFx0XHRzdGF0c1V1aWRNYXRjaGVzOiB0cnVlLFxuXHRcdFx0XHRzb3VyY2VLZXk6ICdzb3VyY2U6Q2hhdC5hcHBseUVkaXRzLSRtb2RlbElkOm1vZGVsLSRoYXJuZXNzOmNvcGlsb3RjbGktJG9yaWdpbjphZ2VudEhvc3QnLFxuXHRcdFx0XHRzb3VyY2VLZXlDbGVhbmVkOiAnc291cmNlOkNoYXQuYXBwbHlFZGl0cy0kaGFybmVzczpjb3BpbG90Y2xpLSRvcmlnaW46YWdlbnRIb3N0Jyxcblx0XHRcdFx0Y29udmVyc2F0aW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0XHRtb2RpZmllZENvdW50OiAyLFxuXHRcdFx0XHRkZWx0YU1vZGlmaWVkQ291bnQ6IDIsXG5cdFx0XHRcdHRvdGFsTW9kaWZpZWRDb3VudDogMixcblx0XHRcdFx0b3JpZ2luOiAnYWdlbnRIb3N0Jyxcblx0XHRcdFx0aGFybmVzczogJ2NvcGlsb3RjbGknLFxuXHRcdFx0XHR0cmFja2luZ1Njb3BlOiB1bmRlZmluZWQsXG5cdFx0XHRcdG90aGVyQUlNb2RpZmllZENvdW50OiB1bmRlZmluZWQsXG5cdFx0XHRcdGFnZW50SG9zdE1vZGlmaWVkQ291bnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZXh0ZXJuYWxNb2RpZmllZENvdW50OiB1bmRlZmluZWQsXG5cdFx0XHRcdHRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzOiB1bmRlZmluZWQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGV2ZW50TmFtZTogJ2VkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuc3RhdHMnLFxuXHRcdFx0XHRzdGF0c1V1aWRNYXRjaGVzOiB0cnVlLFxuXHRcdFx0XHRzb3VyY2VLZXk6IHVuZGVmaW5lZCxcblx0XHRcdFx0c291cmNlS2V5Q2xlYW5lZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb252ZXJzYXRpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRtb2RpZmllZENvdW50OiB1bmRlZmluZWQsXG5cdFx0XHRcdGRlbHRhTW9kaWZpZWRDb3VudDogdW5kZWZpbmVkLFxuXHRcdFx0XHR0b3RhbE1vZGlmaWVkQ291bnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0XHRcdGhhcm5lc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0dHJhY2tpbmdTY29wZTogJ2FnZW50SG9zdFN0YW5kYWxvbmUnLFxuXHRcdFx0XHRvdGhlckFJTW9kaWZpZWRDb3VudDogMCxcblx0XHRcdFx0YWdlbnRIb3N0TW9kaWZpZWRDb3VudDogMixcblx0XHRcdFx0ZXh0ZXJuYWxNb2RpZmllZENvdW50OiAwLFxuXHRcdFx0XHR0b3RhbE1vZGlmaWVkQ2hhcmFjdGVyczogMixcblx0XHRcdH1dLFxuXHRcdFx0YWNrbm93bGVkZ2VkOiB7XG5cdFx0XHRcdGFnZW50TW9kaWZpZWRDb3VudDogMCxcblx0XHRcdFx0b3V0Y29tZToge1xuXHRcdFx0XHRcdG91dGNvbWU6ICdjb21taXR0ZWQnLFxuXHRcdFx0XHRcdGFnZW50TW9kaWZpZWRDb3VudDogMCxcblx0XHRcdFx0XHRsYXN0U2VxdWVuY2U6IDEsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHRoZSBjdXJyZW50IGVkaXQgbWV0YWRhdGEgZm9yIGVhY2ggbWFya2VyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWJjJykpO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHsgdGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsLlVTQUdFLCBwdWJsaWNMb2cyKCkgeyB9IH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBhc3luYyAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCkpO1xuXG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3RjbGk6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2EnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWInLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDEsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMSwgbmV3VGV4dDogJ2InIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Y2xpOi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0yJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTInLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdhYicsXG5cdFx0XHRhZnRlclRleHQ6ICdhYmMnLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDIsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMiwgbmV3VGV4dDogJ2MnIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGZpcnN0Py5zdGF0dXMgIT09ICdza2lwcGVkJyA/IGZpcnN0Py5zb3VyY2UgOiB1bmRlZmluZWQsXG5cdFx0XHRzZWNvbmQ/LnN0YXR1cyAhPT0gJ3NraXBwZWQnID8gc2Vjb25kPy5zb3VyY2UgOiB1bmRlZmluZWQsXG5cdFx0XSwgW1xuXHRcdFx0eyBtb2RlbElkOiAnbW9kZWwnLCBjb252ZXJzYXRpb25JZDogJ3Nlc3Npb24tMScsIHJlcXVlc3RJZDogJ3R1cm4tMScsIGhhcm5lc3M6ICdjb3BpbG90Y2xpJyB9LFxuXHRcdFx0eyBtb2RlbElkOiAnbW9kZWwnLCBjb252ZXJzYXRpb25JZDogJ3Nlc3Npb24tMScsIHJlcXVlc3RJZDogJ3R1cm4tMicsIGhhcm5lc3M6ICdjb3BpbG90Y2xpJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdub3JtYWxpemVzIGFocCBjaGF0IGhhcm5lc3Mgd2l0aG91dCBjb2FsZXNjaW5nIGNoYXQgcmVzb3VyY2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGNvbnN0IGNvcGlsb3RSZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2NvcGlsb3QudHMnKTtcblx0XHRjb25zdCBjbGF1ZGVSZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2NsYXVkZS50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShjb3BpbG90UmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FiJykpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShjbGF1ZGVSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWInKSk7XG5cblx0XHRjb25zdCBldmVudHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZD5bXSA9IFtdO1xuXHRcdGNvbnN0IGdpdGh1YkV2ZW50czogeyBldmVudE5hbWU6IHN0cmluZzsgaGFybmVzczogc3RyaW5nIHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlOiBQYXJ0aWFsPElBZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlPiA9IHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoZXZlbnROYW1lLCBkYXRhKSB7XG5cdFx0XHRcdGlmIChldmVudE5hbWUgPT09ICdlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLmRldGFpbHMnKSB7XG5cdFx0XHRcdFx0ZXZlbnRzLnB1c2goZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQ+KTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHNlbmRHSFRlbGVtZXRyeUV2ZW50KGV2ZW50TmFtZSwgcHJvcGVydGllcykge1xuXHRcdFx0XHRnaXRodWJFdmVudHMucHVzaCh7IGV2ZW50TmFtZSwgaGFybmVzczogcHJvcGVydGllcz8uaGFybmVzcyB9KTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHRjb25zdCBjb3BpbG90U2Vzc2lvblVyaSA9ICdjb3BpbG90Y2xpOi9zZXNzaW9uLTEnO1xuXHRcdGNvbnN0IGNvcGlsb3REZWZhdWx0Q2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoY29waWxvdFNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IGNvcGlsb3RQZWVyQ2hhdFVyaSA9IGJ1aWxkQ2hhdFVyaShjb3BpbG90U2Vzc2lvblVyaSwgJ3BlZXInKTtcblx0XHRjb25zdCBjbGF1ZGVDaGF0VXJpID0gYnVpbGRDaGF0VXJpKCdjbGF1ZGU6L3Nlc3Npb24tMicsICdwZWVyJyk7XG5cblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgW1xuXHRcdFx0eyBzZXNzaW9uVXJpOiBjb3BpbG90RGVmYXVsdENoYXRVcmksIHR1cm5JZDogJ3R1cm4tZGVmYXVsdCcsIGZpbGVQYXRoOiBjb3BpbG90UmVzb3VyY2UuZnNQYXRoLCBtb2RlbElkOiAnY29waWxvdC1tb2RlbCcgfSxcblx0XHRcdHsgc2Vzc2lvblVyaTogY29waWxvdFBlZXJDaGF0VXJpLCB0dXJuSWQ6ICd0dXJuLXBlZXInLCBmaWxlUGF0aDogY29waWxvdFJlc291cmNlLmZzUGF0aCwgbW9kZWxJZDogJ2NvcGlsb3QtbW9kZWwnIH0sXG5cdFx0XHR7IHNlc3Npb25Vcmk6IGNsYXVkZUNoYXRVcmksIHR1cm5JZDogJ3R1cm4tY2xhdWRlJywgZmlsZVBhdGg6IGNsYXVkZVJlc291cmNlLmZzUGF0aCwgbW9kZWxJZDogJ2NsYXVkZS1tb2RlbCcgfSxcblx0XHRdKSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0XHQuLi5lZGl0LFxuXHRcdFx0XHR0b29sQ2FsbElkOiBgdG9vbC0ke2VkaXQudHVybklkfWAsXG5cdFx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdFx0YWZ0ZXJUZXh0OiAnYWInLFxuXHRcdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMSwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAxLCBuZXdUZXh0OiAnYicgfV0sXG5cdFx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmZsdXNoU2Vzc2lvbihjb3BpbG90RGVmYXVsdENoYXRVcmkpO1xuXHRcdGNvbnN0IGFmdGVyRGVmYXVsdENoYXRGbHVzaCA9IGV2ZW50cy5sZW5ndGg7XG5cdFx0YXdhaXQgc2VydmljZS5mbHVzaFNlc3Npb24oY29waWxvdFBlZXJDaGF0VXJpKTtcblx0XHRjb25zdCBhZnRlclBlZXJDaGF0Rmx1c2ggPSBldmVudHMubGVuZ3RoO1xuXHRcdGF3YWl0IHNlcnZpY2UuZmx1c2hTZXNzaW9uKGNsYXVkZUNoYXRVcmkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhZnRlckRlZmF1bHRDaGF0Rmx1c2gsXG5cdFx0XHRhZnRlclBlZXJDaGF0Rmx1c2gsXG5cdFx0XHRnaXRodWJFdmVudHMsXG5cdFx0XHRldmVudHM6IGV2ZW50cy5tYXAoZXZlbnQgPT4gKHtcblx0XHRcdFx0c291cmNlS2V5OiBldmVudC5zb3VyY2VLZXksXG5cdFx0XHRcdHNvdXJjZUtleUNsZWFuZWQ6IGV2ZW50LnNvdXJjZUtleUNsZWFuZWQsXG5cdFx0XHRcdGNvbnZlcnNhdGlvbklkOiBldmVudC5jb252ZXJzYXRpb25JZCxcblx0XHRcdFx0cmVxdWVzdElkOiBldmVudC5yZXF1ZXN0SWQsXG5cdFx0XHRcdGhhcm5lc3M6IGV2ZW50Lmhhcm5lc3MsXG5cdFx0XHR9KSksXG5cdFx0fSwge1xuXHRcdFx0YWZ0ZXJEZWZhdWx0Q2hhdEZsdXNoOiAxLFxuXHRcdFx0YWZ0ZXJQZWVyQ2hhdEZsdXNoOiAyLFxuXHRcdFx0Z2l0aHViRXZlbnRzOiBbXG5cdFx0XHRcdHsgZXZlbnROYW1lOiAndnNjb2RlLmVkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuZGV0YWlscycsIGhhcm5lc3M6ICdjb3BpbG90Y2xpJyB9LFxuXHRcdFx0XHR7IGV2ZW50TmFtZTogJ3ZzY29kZS5lZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLnN0YXRzJywgaGFybmVzczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdHsgZXZlbnROYW1lOiAndnNjb2RlLmVkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuZGV0YWlscycsIGhhcm5lc3M6ICdjb3BpbG90Y2xpJyB9LFxuXHRcdFx0XHR7IGV2ZW50TmFtZTogJ3ZzY29kZS5lZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLnN0YXRzJywgaGFybmVzczogdW5kZWZpbmVkIH0sXG5cdFx0XHRdLFxuXHRcdFx0ZXZlbnRzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzb3VyY2VLZXk6ICdzb3VyY2U6Q2hhdC5hcHBseUVkaXRzLSRtb2RlbElkOmNvcGlsb3QtbW9kZWwtJGhhcm5lc3M6Y29waWxvdGNsaS0kb3JpZ2luOmFnZW50SG9zdCcsXG5cdFx0XHRcdFx0c291cmNlS2V5Q2xlYW5lZDogJ3NvdXJjZTpDaGF0LmFwcGx5RWRpdHMtJGhhcm5lc3M6Y29waWxvdGNsaS0kb3JpZ2luOmFnZW50SG9zdCcsXG5cdFx0XHRcdFx0Y29udmVyc2F0aW9uSWQ6ICdZMjl3YVd4dmRHTnNhVG92YzJWemMybHZiaTB4Jyxcblx0XHRcdFx0XHRyZXF1ZXN0SWQ6ICd0dXJuLWRlZmF1bHQnLFxuXHRcdFx0XHRcdGhhcm5lc3M6ICdjb3BpbG90Y2xpJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNvdXJjZUtleTogJ3NvdXJjZTpDaGF0LmFwcGx5RWRpdHMtJG1vZGVsSWQ6Y29waWxvdC1tb2RlbC0kaGFybmVzczpjb3BpbG90Y2xpLSRvcmlnaW46YWdlbnRIb3N0Jyxcblx0XHRcdFx0XHRzb3VyY2VLZXlDbGVhbmVkOiAnc291cmNlOkNoYXQuYXBwbHlFZGl0cy0kaGFybmVzczpjb3BpbG90Y2xpLSRvcmlnaW46YWdlbnRIb3N0Jyxcblx0XHRcdFx0XHRjb252ZXJzYXRpb25JZDogJ1kyOXdhV3h2ZEdOc2FUb3ZjMlZ6YzJsdmJpMHgnLFxuXHRcdFx0XHRcdHJlcXVlc3RJZDogJ3R1cm4tcGVlcicsXG5cdFx0XHRcdFx0aGFybmVzczogJ2NvcGlsb3RjbGknLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c291cmNlS2V5OiAnc291cmNlOkNoYXQuYXBwbHlFZGl0cy0kbW9kZWxJZDpjbGF1ZGUtbW9kZWwtJGhhcm5lc3M6Y2xhdWRlLSRvcmlnaW46YWdlbnRIb3N0Jyxcblx0XHRcdFx0XHRzb3VyY2VLZXlDbGVhbmVkOiAnc291cmNlOkNoYXQuYXBwbHlFZGl0cy0kaGFybmVzczpjbGF1ZGUtJG9yaWdpbjphZ2VudEhvc3QnLFxuXHRcdFx0XHRcdGNvbnZlcnNhdGlvbklkOiAnWTJ4aGRXUmxPaTl6WlhOemFXOXVMVEknLFxuXHRcdFx0XHRcdHJlcXVlc3RJZDogJ3R1cm4tY2xhdWRlJyxcblx0XHRcdFx0XHRoYXJuZXNzOiAnY2xhdWRlJyxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBBZ2VudCBhdHRyaWJ1dGlvbiBhY3Jvc3MgbGF0ZXIgZXh0ZXJuYWwgZGlzayBlZGl0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2ZpbGUudHMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2F4YicpKTtcblxuXHRcdGNvbnN0IGV2ZW50czogeyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgbnVtYmVyIHwgdW5kZWZpbmVkPiB9W10gPSBbXTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlmZkNvbXB1dGVTZXJ2aWNlLCB7XG5cdFx0XHRjb21wdXRlRGlmZkNvdW50czogYXN5bmMgKG9yaWdpbmFsLCBtb2RpZmllZCwgdGltZW91dE1zKSA9PiBjb21wdXRlRGlmZkNvdW50cyhvcmlnaW5hbCwgbW9kaWZpZWQsIHRpbWVvdXRNcyA/PyA1XzAwMCksXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoZXZlbnROYW1lLCBkYXRhKSB7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBkYXRhOiBkYXRhIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZD4gfSk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Y2xpOi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuZmx1c2hTZXNzaW9uKCdjb3BpbG90Y2xpOi9zZXNzaW9uLTEnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0ZXZlbnROYW1lOiBldmVudC5ldmVudE5hbWUsXG5cdFx0XHRzdGF0c1V1aWRNYXRjaGVzOiBldmVudC5kYXRhLnN0YXRzVXVpZCA9PT0gZXZlbnRzWzBdPy5kYXRhLnN0YXRzVXVpZCxcblx0XHRcdG1vZGlmaWVkQ291bnQ6IGV2ZW50LmRhdGEubW9kaWZpZWRDb3VudCxcblx0XHRcdGRlbHRhTW9kaWZpZWRDb3VudDogZXZlbnQuZGF0YS5kZWx0YU1vZGlmaWVkQ291bnQsXG5cdFx0XHR0b3RhbE1vZGlmaWVkQ291bnQ6IGV2ZW50LmRhdGEudG90YWxNb2RpZmllZENvdW50LFxuXHRcdFx0b3RoZXJBSU1vZGlmaWVkQ291bnQ6IGV2ZW50LmRhdGEub3RoZXJBSU1vZGlmaWVkQ291bnQsXG5cdFx0XHRhZ2VudEhvc3RNb2RpZmllZENvdW50OiBldmVudC5kYXRhLmFnZW50SG9zdE1vZGlmaWVkQ291bnQsXG5cdFx0XHRleHRlcm5hbE1vZGlmaWVkQ291bnQ6IGV2ZW50LmRhdGEuZXh0ZXJuYWxNb2RpZmllZENvdW50LFxuXHRcdFx0dG90YWxNb2RpZmllZENoYXJhY3RlcnM6IGV2ZW50LmRhdGEudG90YWxNb2RpZmllZENoYXJhY3RlcnMsXG5cdFx0fSkpLCBbe1xuXHRcdFx0ZXZlbnROYW1lOiAnZWRpdFRlbGVtZXRyeS5lZGl0U291cmNlcy5kZXRhaWxzJyxcblx0XHRcdHN0YXRzVXVpZE1hdGNoZXM6IHRydWUsXG5cdFx0XHRtb2RpZmllZENvdW50OiAxLFxuXHRcdFx0ZGVsdGFNb2RpZmllZENvdW50OiAxLFxuXHRcdFx0dG90YWxNb2RpZmllZENvdW50OiAyLFxuXHRcdFx0b3RoZXJBSU1vZGlmaWVkQ291bnQ6IHVuZGVmaW5lZCxcblx0XHRcdGFnZW50SG9zdE1vZGlmaWVkQ291bnQ6IHVuZGVmaW5lZCxcblx0XHRcdGV4dGVybmFsTW9kaWZpZWRDb3VudDogdW5kZWZpbmVkLFxuXHRcdFx0dG90YWxNb2RpZmllZENoYXJhY3RlcnM6IHVuZGVmaW5lZCxcblx0XHR9LCB7XG5cdFx0XHRldmVudE5hbWU6ICdlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLnN0YXRzJyxcblx0XHRcdHN0YXRzVXVpZE1hdGNoZXM6IHRydWUsXG5cdFx0XHRtb2RpZmllZENvdW50OiB1bmRlZmluZWQsXG5cdFx0XHRkZWx0YU1vZGlmaWVkQ291bnQ6IHVuZGVmaW5lZCxcblx0XHRcdHRvdGFsTW9kaWZpZWRDb3VudDogdW5kZWZpbmVkLFxuXHRcdFx0b3RoZXJBSU1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRhZ2VudEhvc3RNb2RpZmllZENvdW50OiAxLFxuXHRcdFx0ZXh0ZXJuYWxNb2RpZmllZENvdW50OiAxLFxuXHRcdFx0dG90YWxNb2RpZmllZENoYXJhY3RlcnM6IDIsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmFja3MgZXh0ZXJuYWwgZHJpZnQgYmVmb3JlIGEgbGF0ZXIgdG9vbCBlZGl0IGFuZCBtaXJyb3JzIHN0YW5kYWxvbmUgc3RhdHMgdG8gR2l0SHViJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSAnY29waWxvdGNsaTovc2Vzc2lvbi0xJztcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2ZpbGUudHMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2F4YmMnKSk7XG5cblx0XHRsZXQgbG9jYWxTdGF0czogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgbnVtYmVyIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZ2l0aHViUHJvcGVydGllczogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZ2l0aHViTWVhc3VyZW1lbnRzOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXIgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2U6IFBhcnRpYWw8SUFnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2U+ID0ge1xuXHRcdFx0dGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsLlVTQUdFLFxuXHRcdFx0cHVibGljTG9nMihldmVudE5hbWUsIGRhdGEpIHtcblx0XHRcdFx0aWYgKGV2ZW50TmFtZSA9PT0gJ2VkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuc3RhdHMnICYmIGRhdGEpIHtcblx0XHRcdFx0XHRsb2NhbFN0YXRzID0gZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQ+O1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0c2VuZEdIVGVsZW1ldHJ5RXZlbnQoZXZlbnROYW1lLCBwcm9wZXJ0aWVzLCBtZWFzdXJlbWVudHMpIHtcblx0XHRcdFx0aWYgKGV2ZW50TmFtZSA9PT0gJ3ZzY29kZS5lZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLnN0YXRzJykge1xuXHRcdFx0XHRcdGdpdGh1YlByb3BlcnRpZXMgPSBwcm9wZXJ0aWVzO1xuXHRcdFx0XHRcdGdpdGh1Yk1lYXN1cmVtZW50cyA9IG1lYXN1cmVtZW50cztcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIHtcblx0XHRcdGNvbXB1dGVEaWZmQ291bnRzOiBhc3luYyAob3JpZ2luYWwsIG1vZGlmaWVkLCB0aW1lb3V0TXMpID0+IGNvbXB1dGVEaWZmQ291bnRzKG9yaWdpbmFsLCBtb2RpZmllZCwgdGltZW91dE1zID8/IDVfMDAwKSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0bGV0IG5vdyA9IDEwMDtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gdW5kZWZpbmVkLCAoKSA9PiBub3cpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0dHVybklkOiAndHVybi0yJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTInLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdheGInLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYXhiYycsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMywgZW5kT2Zmc2V0RXhjbHVzaXZlOiAzLCBuZXdUZXh0OiAnYycgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblx0XHRub3cgPSAyNTA7XG5cdFx0YXdhaXQgc2VydmljZS5mbHVzaFNlc3Npb24oc2Vzc2lvblVyaSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxvY2FsOiBsb2NhbFN0YXRzICYmIHtcblx0XHRcdFx0c3RhdHNVdWlkOiBsb2NhbFN0YXRzLnN0YXRzVXVpZCxcblx0XHRcdFx0dHJhY2tpbmdTY29wZTogbG9jYWxTdGF0cy50cmFja2luZ1Njb3BlLFxuXHRcdFx0XHRvdGhlckFJTW9kaWZpZWRDb3VudDogbG9jYWxTdGF0cy5vdGhlckFJTW9kaWZpZWRDb3VudCxcblx0XHRcdFx0YWdlbnRIb3N0TW9kaWZpZWRDb3VudDogbG9jYWxTdGF0cy5hZ2VudEhvc3RNb2RpZmllZENvdW50LFxuXHRcdFx0XHRleHRlcm5hbE1vZGlmaWVkQ291bnQ6IGxvY2FsU3RhdHMuZXh0ZXJuYWxNb2RpZmllZENvdW50LFxuXHRcdFx0XHR0b3RhbE1vZGlmaWVkQ2hhcmFjdGVyczogbG9jYWxTdGF0cy50b3RhbE1vZGlmaWVkQ2hhcmFjdGVycyxcblx0XHRcdFx0YWN0dWFsVGltZTogbG9jYWxTdGF0cy5hY3R1YWxUaW1lLFxuXHRcdFx0XHRsYW5ndWFnZUlkOiBsb2NhbFN0YXRzLmxhbmd1YWdlSWQsXG5cdFx0XHRcdGlzVHJhY2tlZEJ5R2l0OiBsb2NhbFN0YXRzLmlzVHJhY2tlZEJ5R2l0LFxuXHRcdFx0XHRmb2N1c1RpbWU6IGxvY2FsU3RhdHMuZm9jdXNUaW1lLFxuXHRcdFx0fSxcblx0XHRcdGdpdGh1Yjoge1xuXHRcdFx0XHRzdGF0c1V1aWQ6IGdpdGh1YlByb3BlcnRpZXM/LnN0YXRzVXVpZCxcblx0XHRcdFx0dHJhY2tpbmdTY29wZTogZ2l0aHViUHJvcGVydGllcz8udHJhY2tpbmdTY29wZSxcblx0XHRcdFx0b3RoZXJBSU1vZGlmaWVkQ291bnQ6IGdpdGh1Yk1lYXN1cmVtZW50cz8ub3RoZXJBSU1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGFnZW50SG9zdE1vZGlmaWVkQ291bnQ6IGdpdGh1Yk1lYXN1cmVtZW50cz8uYWdlbnRIb3N0TW9kaWZpZWRDb3VudCxcblx0XHRcdFx0ZXh0ZXJuYWxNb2RpZmllZENvdW50OiBnaXRodWJNZWFzdXJlbWVudHM/LmV4dGVybmFsTW9kaWZpZWRDb3VudCxcblx0XHRcdFx0dG90YWxNb2RpZmllZENoYXJhY3RlcnM6IGdpdGh1Yk1lYXN1cmVtZW50cz8udG90YWxNb2RpZmllZENoYXJhY3RlcnMsXG5cdFx0XHRcdGFjdHVhbFRpbWU6IGdpdGh1Yk1lYXN1cmVtZW50cz8uYWN0dWFsVGltZSxcblx0XHRcdH0sXG5cdFx0fSwge1xuXHRcdFx0bG9jYWw6IHtcblx0XHRcdFx0c3RhdHNVdWlkOiBsb2NhbFN0YXRzPy5zdGF0c1V1aWQsXG5cdFx0XHRcdHRyYWNraW5nU2NvcGU6ICdhZ2VudEhvc3RTdGFuZGFsb25lJyxcblx0XHRcdFx0b3RoZXJBSU1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRcdGFnZW50SG9zdE1vZGlmaWVkQ291bnQ6IDIsXG5cdFx0XHRcdGV4dGVybmFsTW9kaWZpZWRDb3VudDogMSxcblx0XHRcdFx0dG90YWxNb2RpZmllZENoYXJhY3RlcnM6IDMsXG5cdFx0XHRcdGFjdHVhbFRpbWU6IDE1MCxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRpc1RyYWNrZWRCeUdpdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRmb2N1c1RpbWU6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHRnaXRodWI6IHtcblx0XHRcdFx0c3RhdHNVdWlkOiBsb2NhbFN0YXRzPy5zdGF0c1V1aWQsXG5cdFx0XHRcdHRyYWNraW5nU2NvcGU6ICdhZ2VudEhvc3RTdGFuZGFsb25lJyxcblx0XHRcdFx0b3RoZXJBSU1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRcdGFnZW50SG9zdE1vZGlmaWVkQ291bnQ6IDIsXG5cdFx0XHRcdGV4dGVybmFsTW9kaWZpZWRDb3VudDogMSxcblx0XHRcdFx0dG90YWxNb2RpZmllZENoYXJhY3RlcnM6IDMsXG5cdFx0XHRcdGFjdHVhbFRpbWU6IDE1MCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F0dHJpYnV0ZXMgYW4gZXh0ZXJuYWwgb3ZlcndyaXRlIHdpdGhvdXQgcmV0YWluaW5nIG92ZXJ3cml0dGVuIEFnZW50IGNoYXJhY3RlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd4eXonKSk7XG5cblx0XHRsZXQgc3RhdHM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwge1xuXHRcdFx0Y29tcHV0ZURpZmZDb3VudHM6IGFzeW5jIChvcmlnaW5hbCwgbW9kaWZpZWQsIHRpbWVvdXRNcykgPT4gY29tcHV0ZURpZmZDb3VudHMob3JpZ2luYWwsIG1vZGlmaWVkLCB0aW1lb3V0TXMgPz8gNV8wMDApLFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHR0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwuVVNBR0UsXG5cdFx0XHRwdWJsaWNMb2cyKGV2ZW50TmFtZSwgZGF0YSkge1xuXHRcdFx0XHRpZiAoZXZlbnROYW1lID09PSAnZWRpdFRlbGVtZXRyeS5lZGl0U291cmNlcy5zdGF0cycpIHtcblx0XHRcdFx0XHRzdGF0cyA9IGRhdGEgYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2EnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWInLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDEsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMSwgbmV3VGV4dDogJ2InIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmZsdXNoU2Vzc2lvbignY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRzICYmIHtcblx0XHRcdG90aGVyQUlNb2RpZmllZENvdW50OiBzdGF0cy5vdGhlckFJTW9kaWZpZWRDb3VudCxcblx0XHRcdGFnZW50SG9zdE1vZGlmaWVkQ291bnQ6IHN0YXRzLmFnZW50SG9zdE1vZGlmaWVkQ291bnQsXG5cdFx0XHRleHRlcm5hbE1vZGlmaWVkQ291bnQ6IHN0YXRzLmV4dGVybmFsTW9kaWZpZWRDb3VudCxcblx0XHRcdHRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzOiBzdGF0cy50b3RhbE1vZGlmaWVkQ2hhcmFjdGVycyxcblx0XHR9LCB7XG5cdFx0XHRvdGhlckFJTW9kaWZpZWRDb3VudDogMCxcblx0XHRcdGFnZW50SG9zdE1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRleHRlcm5hbE1vZGlmaWVkQ291bnQ6IDMsXG5cdFx0XHR0b3RhbE1vZGlmaWVkQ2hhcmFjdGVyczogMyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndHJhY2tzIGNyZWF0ZXMgYW5kIHJlbW92ZXMgcmV0YWluZWQgYXR0cmlidXRpb24gYWZ0ZXIgZGVsZXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKSk7XG5cblx0XHRjb25zdCBldmVudHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZD5bXSA9IFtdO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHR0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwuVVNBR0UsXG5cdFx0XHRwdWJsaWNMb2cyKGV2ZW50TmFtZSwgZGF0YSkge1xuXHRcdFx0XHRpZiAoZXZlbnROYW1lID09PSAnZWRpdFRlbGVtZXRyeS5lZGl0U291cmNlcy5kZXRhaWxzJykge1xuXHRcdFx0XHRcdGV2ZW50cy5wdXNoKGRhdGEgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgbnVtYmVyIHwgdW5kZWZpbmVkPik7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgYmFzZUVkaXQgPSB7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHQuLi5iYXNlRWRpdCxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNyZWF0ZScsXG5cdFx0XHRiZWZvcmVUZXh0OiAnJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiYycsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMCwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAwLCBuZXdUZXh0OiAnYWJjJyB9XSxcblx0XHR9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0Li4uYmFzZUVkaXQsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC1kZWxldGUnLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2FiYycsXG5cdFx0XHRhZnRlclRleHQ6ICcnLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDAsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMywgbmV3VGV4dDogJycgfV0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgc2VydmljZS5mbHVzaFNlc3Npb24oJ2NvcGlsb3Q6L3Nlc3Npb24tMScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHRtb2RpZmllZENvdW50OiBldmVudC5tb2RpZmllZENvdW50LFxuXHRcdFx0ZGVsdGFNb2RpZmllZENvdW50OiBldmVudC5kZWx0YU1vZGlmaWVkQ291bnQsXG5cdFx0XHR0b3RhbE1vZGlmaWVkQ291bnQ6IGV2ZW50LnRvdGFsTW9kaWZpZWRDb3VudCxcblx0XHR9KSksIFt7XG5cdFx0XHRtb2RpZmllZENvdW50OiAwLFxuXHRcdFx0ZGVsdGFNb2RpZmllZENvdW50OiAzLFxuXHRcdFx0dG90YWxNb2RpZmllZENvdW50OiAwLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZmx1c2hlcyBBZ2VudC1vbmx5IHJlc291cmNlcyB3aGVuIEhFQUQgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2ZpbGUudHMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FiJykpO1xuXG5cdFx0Y29uc3QgdHJpZ2dlcnM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3Qgc3RhdHNUcmlnZ2Vyczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgaGVhZCA9ICdoZWFkLTEnO1xuXHRcdGxldCBicmFuY2ggPSAnbWFpbic7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoZXZlbnROYW1lLCBkYXRhKSB7XG5cdFx0XHRcdGlmIChldmVudE5hbWUgPT09ICdlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLmRldGFpbHMnKSB7XG5cdFx0XHRcdFx0dHJpZ2dlcnMucHVzaCgoZGF0YSBhcyB7IHRyaWdnZXI6IHN0cmluZyB9KS50cmlnZ2VyKTtcblx0XHRcdFx0fSBlbHNlIGlmIChldmVudE5hbWUgPT09ICdlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLnN0YXRzJykge1xuXHRcdFx0XHRcdHN0YXRzVHJpZ2dlcnMucHVzaCgoZGF0YSBhcyB7IHRyaWdnZXI6IHN0cmluZyB9KS50cmlnZ2VyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gKHtcblx0XHRcdHJvb3Q6ICcvd29ya3NwYWNlJyxcblx0XHRcdGJyYW5jaCxcblx0XHRcdGhlYWQsXG5cdFx0fSksIHVuZGVmaW5lZCkpO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnYScsXG5cdFx0XHRhZnRlclRleHQ6ICdhYicsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMSwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAxLCBuZXdUZXh0OiAnYicgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblxuXHRcdGhlYWQgPSAnaGVhZC0yJztcblx0XHRhd2FpdCBzZXJ2aWNlLmNoZWNrR2l0U3RhdGUoKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FiYycpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMicsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2FiJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiYycsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMiwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAyLCBuZXdUZXh0OiAnYycgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblx0XHRicmFuY2ggPSAnZmVhdHVyZSc7XG5cdFx0YXdhaXQgc2VydmljZS5jaGVja0dpdFN0YXRlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRldGFpbHM6IHRyaWdnZXJzLFxuXHRcdFx0c3RhdHM6IHN0YXRzVHJpZ2dlcnMsXG5cdFx0fSwge1xuXHRcdFx0ZGV0YWlsczogWydoYXNoQ2hhbmdlJywgJ2JyYW5jaENoYW5nZSddLFxuXHRcdFx0c3RhdHM6IFsnaGFzaENoYW5nZScsICdicmFuY2hDaGFuZ2UnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgc3RhbmRhbG9uZSBzdGF0cyBhZnRlciB0ZW4gaG91cnMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDJfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2ZpbGUudHMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FiJykpO1xuXG5cdFx0Y29uc3QgdHJpZ2dlcnM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoZXZlbnROYW1lLCBkYXRhKSB7XG5cdFx0XHRcdGlmIChldmVudE5hbWUgPT09ICdlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLnN0YXRzJykge1xuXHRcdFx0XHRcdHRyaWdnZXJzLnB1c2goKGRhdGEgYXMgeyB0cmlnZ2VyOiBzdHJpbmcgfSkudHJpZ2dlcik7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UsIGFzeW5jICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cdFx0YXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgdGltZW91dCgxMCAqIDYwICogNjAgKiAxMDAwKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cmlnZ2VycywgWycxMGhvdXJzJ10pO1xuXHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnZW1pdHMgc3RhbmRhbG9uZSBzdGF0cyB3aGVuIHRoZSBzZXJ2aWNlIGlzIGRpc3Bvc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWInKSk7XG5cblx0XHRjb25zdCB0cmlnZ2Vyczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlmZkNvbXB1dGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0dGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsLlVTQUdFLFxuXHRcdFx0cHVibGljTG9nMihldmVudE5hbWUsIGRhdGEpIHtcblx0XHRcdFx0aWYgKGV2ZW50TmFtZSA9PT0gJ2VkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuc3RhdHMnKSB7XG5cdFx0XHRcdFx0dHJpZ2dlcnMucHVzaCgoZGF0YSBhcyB7IHRyaWdnZXI6IHN0cmluZyB9KS50cmlnZ2VyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2EnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWInLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDEsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMSwgbmV3VGV4dDogJ2InIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cmlnZ2VycywgWydjbG9zZWQnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnRpbnVlcyBhIEdpdC10cmlnZ2VyZWQgZmx1c2ggYWZ0ZXIgb25lIHJlc291cmNlIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBjbGFzcyBleHRlbmRzIEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIHtcblx0XHRcdGZhaWxQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHtcblx0XHRcdFx0aWYgKHJlc291cmNlLnBhdGggPT09IHRoaXMuZmFpbFBhdGgpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1JlYWQgZmFpbGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN1cGVyLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9KCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgcHJvdmlkZXIpKTtcblx0XHRjb25zdCBmYWlsaW5nUmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9mYWlsaW5nLnRzJyk7XG5cdFx0Y29uc3Qgc3VjY2Vzc2Z1bFJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2Uvc3VjY2Vzc2Z1bC50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShmYWlsaW5nUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FiJykpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShzdWNjZXNzZnVsUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FiJykpO1xuXG5cdFx0bGV0IGJyYW5jaCA9ICdtYWluJztcblx0XHRsZXQgZXZlbnRDb3VudCA9IDA7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoZXZlbnROYW1lKSB7XG5cdFx0XHRcdGlmIChldmVudE5hbWUgPT09ICdlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLmRldGFpbHMnKSB7XG5cdFx0XHRcdFx0ZXZlbnRDb3VudCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBhc3luYyAoKSA9PiAoe1xuXHRcdFx0cm9vdDogJy93b3Jrc3BhY2UnLFxuXHRcdFx0YnJhbmNoLFxuXHRcdFx0aGVhZDogJ2hlYWQtMScsXG5cdFx0fSksIHVuZGVmaW5lZCkpO1xuXHRcdGZvciAoY29uc3QgW3Rvb2xDYWxsSWQsIHJlc291cmNlXSBvZiBbWyd0b29sLWZhaWxpbmcnLCBmYWlsaW5nUmVzb3VyY2VdLCBbJ3Rvb2wtc3VjY2Vzc2Z1bCcsIHN1Y2Nlc3NmdWxSZXNvdXJjZV1dIGFzIGNvbnN0KSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdFx0YmVmb3JlVGV4dDogJ2EnLFxuXHRcdFx0XHRhZnRlclRleHQ6ICdhYicsXG5cdFx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRwcm92aWRlci5mYWlsUGF0aCA9IGZhaWxpbmdSZXNvdXJjZS5wYXRoO1xuXHRcdGJyYW5jaCA9ICdmZWF0dXJlJztcblxuXHRcdGF3YWl0IHNlcnZpY2UuY2hlY2tHaXRTdGF0ZSgpO1xuXHRcdGNvbnN0IGV2ZW50Q291bnRBZnRlckZhaWx1cmUgPSBldmVudENvdW50O1xuXHRcdHByb3ZpZGVyLmZhaWxQYXRoID0gdW5kZWZpbmVkO1xuXHRcdGF3YWl0IHNlcnZpY2UuY2hlY2tHaXRTdGF0ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRldmVudENvdW50QWZ0ZXJGYWlsdXJlLFxuXHRcdFx0ZXZlbnRDb3VudEFmdGVyUmV0cnk6IGV2ZW50Q291bnQsXG5cdFx0fSwge1xuXHRcdFx0ZXZlbnRDb3VudEFmdGVyRmFpbHVyZTogMSxcblx0XHRcdGV2ZW50Q291bnRBZnRlclJldHJ5OiAyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBhIEdpdCBib3VuZGFyeSBwZW5kaW5nIHdoaWxlIGFuIGVkaXQgaXMgYmVpbmcgcmVjb3JkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhYicpKTtcblxuXHRcdGNvbnN0IGJyaWRnZVN0YXJ0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgYnJpZGdlUmVzdWx0ID0gbmV3IERlZmVycmVkUHJvbWlzZTxSZXR1cm5UeXBlPHR5cGVvZiBjb21wdXRlRGlmZkNvdW50cz4+KCk7XG5cdFx0bGV0IGJyYW5jaCA9ICdtYWluJztcblx0XHRsZXQgZXZlbnRDb3VudCA9IDA7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwge1xuXHRcdFx0YXN5bmMgY29tcHV0ZURpZmZDb3VudHMob3JpZ2luYWwsIG1vZGlmaWVkLCB0aW1lb3V0TXMpIHtcblx0XHRcdFx0aWYgKG9yaWdpbmFsID09PSAnYWInICYmIG1vZGlmaWVkID09PSAnYWMnKSB7XG5cdFx0XHRcdFx0YnJpZGdlU3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRcdHJldHVybiBicmlkZ2VSZXN1bHQucDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gY29tcHV0ZURpZmZDb3VudHMob3JpZ2luYWwsIG1vZGlmaWVkLCB0aW1lb3V0TXMgPz8gNV8wMDApO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0dGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsLlVTQUdFLFxuXHRcdFx0cHVibGljTG9nMihldmVudE5hbWUpIHtcblx0XHRcdFx0aWYgKGV2ZW50TmFtZSA9PT0gJ2VkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuZGV0YWlscycpIHtcblx0XHRcdFx0XHRldmVudENvdW50Kys7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UsIGFzeW5jICgpID0+ICh7XG5cdFx0XHRyb290OiAnL3dvcmtzcGFjZScsXG5cdFx0XHRicmFuY2gsXG5cdFx0XHRoZWFkOiAnaGVhZC0xJyxcblx0XHR9KSwgdW5kZWZpbmVkKSk7XG5cdFx0YXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVjb3JkaW5nID0gc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0yJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTInLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdhYycsXG5cdFx0XHRhZnRlclRleHQ6ICdhY2QnLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDIsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMiwgbmV3VGV4dDogJ2QnIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cdFx0YXdhaXQgYnJpZGdlU3RhcnRlZC5wO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWNkJykpO1xuXHRcdGJyYW5jaCA9ICdmZWF0dXJlJztcblx0XHRhd2FpdCBzZXJ2aWNlLmNoZWNrR2l0U3RhdGUoKTtcblx0XHRjb25zdCBldmVudENvdW50V2hpbGVSZWNvcmRpbmcgPSBldmVudENvdW50O1xuXHRcdGJyaWRnZVJlc3VsdC5jb21wbGV0ZShjb21wdXRlRGlmZkNvdW50cygnYWInLCAnYWMnLCA1XzAwMCkpO1xuXHRcdGF3YWl0IHJlY29yZGluZztcblx0XHRhd2FpdCBzZXJ2aWNlLmNoZWNrR2l0U3RhdGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZXZlbnRDb3VudFdoaWxlUmVjb3JkaW5nLFxuXHRcdFx0ZXZlbnRDb3VudEFmdGVyUmVjb3JkaW5nOiBldmVudENvdW50LFxuXHRcdH0sIHtcblx0XHRcdGV2ZW50Q291bnRXaGlsZVJlY29yZGluZzogMCxcblx0XHRcdGV2ZW50Q291bnRBZnRlclJlY29yZGluZzogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VyaWFsaXplcyBhIG5ldyBlZGl0IGJlaGluZCBhIGZhaWxpbmcgR2l0IGZsdXNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHJlYWRTdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHJlYWRSZXN1bHQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPFVpbnQ4QXJyYXk+KCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IGNsYXNzIGV4dGVuZHMgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIge1xuXHRcdFx0YmxvY2tSZWFkcyA9IGZhbHNlO1xuXG5cdFx0XHRvdmVycmlkZSBhc3luYyByZWFkRmlsZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxVaW50OEFycmF5PiB7XG5cdFx0XHRcdGlmICh0aGlzLmJsb2NrUmVhZHMpIHtcblx0XHRcdFx0XHRyZWFkU3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRcdHJldHVybiByZWFkUmVzdWx0LnA7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN1cGVyLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9KCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgcHJvdmlkZXIpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2ZpbGUudHMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FiJykpO1xuXG5cdFx0bGV0IGJyYW5jaCA9ICdtYWluJztcblx0XHRjb25zdCByZXRhaW5lZENvdW50czogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlmZkNvbXB1dGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0dGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsLlVTQUdFLFxuXHRcdFx0cHVibGljTG9nMihldmVudE5hbWUsIGRhdGEpIHtcblx0XHRcdFx0aWYgKGV2ZW50TmFtZSA9PT0gJ2VkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuZGV0YWlscycpIHtcblx0XHRcdFx0XHRyZXRhaW5lZENvdW50cy5wdXNoKChkYXRhIGFzIHsgbW9kaWZpZWRDb3VudDogbnVtYmVyIH0pLm1vZGlmaWVkQ291bnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBhc3luYyAoKSA9PiAoe1xuXHRcdFx0cm9vdDogJy93b3Jrc3BhY2UnLFxuXHRcdFx0YnJhbmNoLFxuXHRcdFx0aGVhZDogJ2hlYWQtMScsXG5cdFx0fSksIHVuZGVmaW5lZCkpO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnYScsXG5cdFx0XHRhZnRlclRleHQ6ICdhYicsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMSwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAxLCBuZXdUZXh0OiAnYicgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblx0XHRwcm92aWRlci5ibG9ja1JlYWRzID0gdHJ1ZTtcblx0XHRicmFuY2ggPSAnZmVhdHVyZSc7XG5cblx0XHRjb25zdCBib3VuZGFyeUZsdXNoID0gc2VydmljZS5jaGVja0dpdFN0YXRlKCk7XG5cdFx0YXdhaXQgcmVhZFN0YXJ0ZWQucDtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FiYycpKTtcblx0XHRjb25zdCByZWNvcmRpbmcgPSBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMicsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2FiJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiYycsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMiwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAyLCBuZXdUZXh0OiAnYycgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblx0XHRhd2FpdCByZWFkUmVzdWx0LmVycm9yKG5ldyBFcnJvcignUmVhZCBmYWlsZWQnKSk7XG5cdFx0YXdhaXQgYm91bmRhcnlGbHVzaDtcblx0XHRhd2FpdCByZWNvcmRpbmc7XG5cdFx0cHJvdmlkZXIuYmxvY2tSZWFkcyA9IGZhbHNlO1xuXHRcdGF3YWl0IHNlcnZpY2UuY2hlY2tHaXRTdGF0ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXRhaW5lZENvdW50cywgWzJdKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmV0YWluIGF0dHJpYnV0aW9uIHdoZW4gdXNhZ2UgdGVsZW1ldHJ5IGlzIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlmZkNvbXB1dGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgeyB0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwuTk9ORSB9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblxuXHRcdGNvbnN0IG1hcmtlciA9IGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9maWxlLnRzJyxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlciwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzY2FyZHMgYXR0cmlidXRpb24gd2hlbiBlZGl0IHRlbGVtZXRyeSBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2ZpbGUudHMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FiJykpO1xuXG5cdFx0bGV0IGV2ZW50Q291bnQgPSAwO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHR0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwuVVNBR0UsXG5cdFx0XHRwdWJsaWNMb2cyKGV2ZW50TmFtZSkge1xuXHRcdFx0XHRpZiAoZXZlbnROYW1lID09PSAnZWRpdFRlbGVtZXRyeS5lZGl0U291cmNlcy5kZXRhaWxzJykge1xuXHRcdFx0XHRcdGV2ZW50Q291bnQrKztcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2EnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWInLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDEsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMSwgbmV3VGV4dDogJ2InIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cblx0XHRzZXJ2aWNlLnNldEVuYWJsZWQoZmFsc2UpO1xuXHRcdGNvbnN0IG1hcmtlciA9IGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMicsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0yJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnYWInLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWJjJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAyLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDIsIG5ld1RleHQ6ICdjJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuZmx1c2hTZXNzaW9uKCdjb3BpbG90Oi9zZXNzaW9uLTEnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBtYXJrZXIsIGV2ZW50Q291bnQgfSwgeyBtYXJrZXI6IHVuZGVmaW5lZCwgZXZlbnRDb3VudDogMCB9KTtcblx0fSk7XG5cblx0dGVzdCgnZmVuY2VzIGluLWZsaWdodCBhdHRyaWJ1dGlvbiBhZnRlciBlZGl0IHRlbGVtZXRyeSBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCByZXBvc2l0b3J5UmVhZFN0YXJ0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeVJlYWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHVuZGVmaW5lZD4oKTtcblx0XHRsZXQgZXZlbnRDb3VudCA9IDA7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoZXZlbnROYW1lKSB7XG5cdFx0XHRcdGlmIChldmVudE5hbWUgPT09ICdlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLmRldGFpbHMnKSB7XG5cdFx0XHRcdFx0ZXZlbnRDb3VudCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXBvc2l0b3J5UmVhZFN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdHJldHVybiByZXBvc2l0b3J5UmVhZC5wO1xuXHRcdH0sIHVuZGVmaW5lZCkpO1xuXG5cdFx0Y29uc3QgcmVjb3JkRWRpdCA9IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9maWxlLnRzJyxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHJlcG9zaXRvcnlSZWFkU3RhcnRlZC5wO1xuXHRcdHNlcnZpY2Uuc2V0RW5hYmxlZChmYWxzZSk7XG5cdFx0c2VydmljZS5zZXRFbmFibGVkKHRydWUpO1xuXHRcdHJlcG9zaXRvcnlSZWFkLmNvbXBsZXRlKHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBtYXJrZXIgPSBhd2FpdCByZWNvcmRFZGl0O1xuXHRcdGF3YWl0IHNlcnZpY2UuZmx1c2hTZXNzaW9uKCdjb3BpbG90Oi9zZXNzaW9uLTEnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBtYXJrZXIsIGV2ZW50Q291bnQgfSwgeyBtYXJrZXI6IHVuZGVmaW5lZCwgZXZlbnRDb3VudDogMCB9KTtcblx0fSk7XG5cblx0dGVzdCgnc2lnbmFscyBmaWxlcyBsYXJnZXIgdGhhbiB0aGUgZml2ZSBNQiBhdHRyaWJ1dGlvbiBsaW1pdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2xhcmdlLnRzJyk7XG5cdFx0Y29uc3QgYmVmb3JlVGV4dCA9ICdhJy5yZXBlYXQoNiAqIDEwMjQgKiAxMDI0KTtcblx0XHRjb25zdCBhZnRlclRleHQgPSBgJHtiZWZvcmVUZXh0fWJgO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhhZnRlclRleHQpKTtcblxuXHRcdGNvbnN0IHN0YXRzRXZlbnRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQ+W10gPSBbXTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlmZkNvbXB1dGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0dGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsLlVTQUdFLFxuXHRcdFx0cHVibGljTG9nMihldmVudE5hbWUsIGRhdGEpIHtcblx0XHRcdFx0aWYgKGV2ZW50TmFtZSA9PT0gJ2VkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuc3RhdHMnKSB7XG5cdFx0XHRcdFx0c3RhdHNFdmVudHMucHVzaChkYXRhIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZD4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBhc3luYyAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCkpO1xuXG5cdFx0Y29uc3QgbWFya2VyID0gYXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQsXG5cdFx0XHRhZnRlclRleHQsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogYmVmb3JlVGV4dC5sZW5ndGgsIGVuZE9mZnNldEV4Y2x1c2l2ZTogYmVmb3JlVGV4dC5sZW5ndGgsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuZmx1c2hTZXNzaW9uKCdjb3BpbG90Oi9zZXNzaW9uLTEnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWFya2VyOiBtYXJrZXIgJiYge1xuXHRcdFx0XHRzdGF0dXM6IG1hcmtlci5zdGF0dXMsXG5cdFx0XHRcdHJlYXNvbjogbWFya2VyLnN0YXR1cyA9PT0gJ3NraXBwZWQnID8gbWFya2VyLnJlYXNvbiA6IHVuZGVmaW5lZCxcblx0XHRcdFx0aW5zZXJ0ZWRDb3VudDogbWFya2VyLnN0YXR1cyA9PT0gJ3NraXBwZWQnID8gbWFya2VyLmluc2VydGVkQ291bnQgOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0c3RhdHM6IHN0YXRzRXZlbnRzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0XHRvdGhlckFJTW9kaWZpZWRDb3VudDogZXZlbnQub3RoZXJBSU1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGFnZW50SG9zdE1vZGlmaWVkQ291bnQ6IGV2ZW50LmFnZW50SG9zdE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGV4dGVybmFsTW9kaWZpZWRDb3VudDogZXZlbnQuZXh0ZXJuYWxNb2RpZmllZENvdW50LFxuXHRcdFx0XHR0b3RhbE1vZGlmaWVkQ2hhcmFjdGVyczogZXZlbnQudG90YWxNb2RpZmllZENoYXJhY3RlcnMsXG5cdFx0XHRcdGFnZW50SG9zdEF0dHJpYnV0aW9uQ292ZXJhZ2U6IGV2ZW50LmFnZW50SG9zdEF0dHJpYnV0aW9uQ292ZXJhZ2UsXG5cdFx0XHRcdGFnZW50SG9zdFVudHJhY2tlZEVkaXRDb3VudDogZXZlbnQuYWdlbnRIb3N0VW50cmFja2VkRWRpdENvdW50LFxuXHRcdFx0XHRhZ2VudEhvc3RVbnRyYWNrZWRJbnNlcnRlZENvdW50OiBldmVudC5hZ2VudEhvc3RVbnRyYWNrZWRJbnNlcnRlZENvdW50LFxuXHRcdFx0fSkpLFxuXHRcdH0sIHtcblx0XHRcdG1hcmtlcjoge1xuXHRcdFx0XHRzdGF0dXM6ICdza2lwcGVkJyxcblx0XHRcdFx0cmVhc29uOiAnZmlsZVRvb0xhcmdlJyxcblx0XHRcdFx0aW5zZXJ0ZWRDb3VudDogMSxcblx0XHRcdH0sXG5cdFx0XHRzdGF0czogW3tcblx0XHRcdFx0b3RoZXJBSU1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRcdGFnZW50SG9zdE1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRcdGV4dGVybmFsTW9kaWZpZWRDb3VudDogMCxcblx0XHRcdFx0dG90YWxNb2RpZmllZENoYXJhY3RlcnM6IDAsXG5cdFx0XHRcdGFnZW50SG9zdEF0dHJpYnV0aW9uQ292ZXJhZ2U6ICdwYXJ0aWFsJyxcblx0XHRcdFx0YWdlbnRIb3N0VW50cmFja2VkRWRpdENvdW50OiAxLFxuXHRcdFx0XHRhZ2VudEhvc3RVbnRyYWNrZWRJbnNlcnRlZENvdW50OiAxLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY2x1ZGVzIHByaW9yIHRyYWNrZWQgZWRpdHMgd2hlbiBhbiBvdmVyc2l6ZWQgZWRpdCBjcmVhdGVzIGEgY292ZXJhZ2UgZ2FwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvbGFyZ2UudHMnKTtcblx0XHRjb25zdCBvdmVyc2l6ZWRUZXh0ID0gJ3gnLnJlcGVhdCg2ICogMTAyNCAqIDEwMjQpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhvdmVyc2l6ZWRUZXh0KSk7XG5cblx0XHRsZXQgc3RhdHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoZXZlbnROYW1lLCBkYXRhKSB7XG5cdFx0XHRcdGlmIChldmVudE5hbWUgPT09ICdlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLnN0YXRzJykge1xuXHRcdFx0XHRcdHN0YXRzID0gZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQ+O1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBhc3luYyAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCkpO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnYScsXG5cdFx0XHRhZnRlclRleHQ6ICdhYicsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMSwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAxLCBuZXdUZXh0OiAnYicgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblx0XHRjb25zdCBtYXJrZXIgPSBhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMicsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2FiJyxcblx0XHRcdGFmdGVyVGV4dDogb3ZlcnNpemVkVGV4dCxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAwLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDIsIG5ld1RleHQ6IG92ZXJzaXplZFRleHQgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuZmx1c2hTZXNzaW9uKCdjb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRjb25zdCBhY2tub3dsZWRnZWQgPSBhd2FpdCBzZXJ2aWNlLnByZXBhcmVGbHVzaCh7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHRyaWdnZXI6ICdjbG9zZWQnLFxuXHRcdFx0c3RhdHNVdWlkOiAnc3RhdHMtMScsXG5cdFx0XHRpc0RpcnR5OiBmYWxzZSxcblx0XHRcdGZsdXNoVG9rZW46ICdmbHVzaC0xJyxcblx0XHRcdGxhbmd1YWdlSWQ6ICd0eXBlc2NyaXB0Jyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWFya2VyOiBtYXJrZXI/LnN0YXR1cyA9PT0gJ3NraXBwZWQnID8ge1xuXHRcdFx0XHR1bnRyYWNrZWRFZGl0Q291bnQ6IG1hcmtlci51bnRyYWNrZWRFZGl0Q291bnQsXG5cdFx0XHRcdGluc2VydGVkQ291bnQ6IG1hcmtlci5pbnNlcnRlZENvdW50LFxuXHRcdFx0fSA6IG1hcmtlcixcblx0XHRcdHN0YXRzOiBzdGF0cyAmJiB7XG5cdFx0XHRcdGFnZW50SG9zdEF0dHJpYnV0aW9uQ292ZXJhZ2U6IHN0YXRzLmFnZW50SG9zdEF0dHJpYnV0aW9uQ292ZXJhZ2UsXG5cdFx0XHRcdGFnZW50SG9zdFVudHJhY2tlZEVkaXRDb3VudDogc3RhdHMuYWdlbnRIb3N0VW50cmFja2VkRWRpdENvdW50LFxuXHRcdFx0XHRhZ2VudEhvc3RVbnRyYWNrZWRJbnNlcnRlZENvdW50OiBzdGF0cy5hZ2VudEhvc3RVbnRyYWNrZWRJbnNlcnRlZENvdW50LFxuXHRcdFx0fSxcblx0XHRcdHN0YW5kYWxvbmVDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHM6IGFja25vd2xlZGdlZD8uc3RhbmRhbG9uZUNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cz8ubWFwKGFja25vd2xlZGdlbWVudCA9PiAoe1xuXHRcdFx0XHRpZExlbmd0aDogYWNrbm93bGVkZ2VtZW50LmlkLmxlbmd0aCxcblx0XHRcdFx0c2VxdWVuY2VzOiBhY2tub3dsZWRnZW1lbnQuc2VxdWVuY2VzLFxuXHRcdFx0XHRlZGl0Q291bnQ6IGFja25vd2xlZGdlbWVudC5lZGl0Q291bnQsXG5cdFx0XHRcdGluc2VydGVkQ291bnQ6IGFja25vd2xlZGdlbWVudC5pbnNlcnRlZENvdW50LFxuXHRcdFx0fSkpLFxuXHRcdH0sIHtcblx0XHRcdG1hcmtlcjoge1xuXHRcdFx0XHR1bnRyYWNrZWRFZGl0Q291bnQ6IDIsXG5cdFx0XHRcdGluc2VydGVkQ291bnQ6IG92ZXJzaXplZFRleHQubGVuZ3RoICsgMSxcblx0XHRcdH0sXG5cdFx0XHRzdGF0czoge1xuXHRcdFx0XHRhZ2VudEhvc3RBdHRyaWJ1dGlvbkNvdmVyYWdlOiAncGFydGlhbCcsXG5cdFx0XHRcdGFnZW50SG9zdFVudHJhY2tlZEVkaXRDb3VudDogMixcblx0XHRcdFx0YWdlbnRIb3N0VW50cmFja2VkSW5zZXJ0ZWRDb3VudDogb3ZlcnNpemVkVGV4dC5sZW5ndGggKyAxLFxuXHRcdFx0fSxcblx0XHRcdHN0YW5kYWxvbmVDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHM6IFt7XG5cdFx0XHRcdGlkTGVuZ3RoOiAzNixcblx0XHRcdFx0c2VxdWVuY2VzOiBbMl0sXG5cdFx0XHRcdGVkaXRDb3VudDogMixcblx0XHRcdFx0aW5zZXJ0ZWRDb3VudDogb3ZlcnNpemVkVGV4dC5sZW5ndGggKyAxLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZsdXNoZXMgYmVmb3JlIG92ZXJzaXplZCBjb3ZlcmFnZSBzZXF1ZW5jZXMgZ3JvdyB3aXRob3V0IGJvdW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvbGFyZ2UudHMnKTtcblx0XHRjb25zdCBiZWZvcmVUZXh0ID0gJ3gnLnJlcGVhdCg2ICogMTAyNCAqIDEwMjQpO1xuXHRcdGNvbnN0IGFmdGVyVGV4dCA9IGAke2JlZm9yZVRleHR9eWA7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGFmdGVyVGV4dCkpO1xuXG5cdFx0Y29uc3Qgc3RhdHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZD5bXSA9IFtdO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHR0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwuVVNBR0UsXG5cdFx0XHRwdWJsaWNMb2cyKGV2ZW50TmFtZSwgZGF0YSkge1xuXHRcdFx0XHRpZiAoZXZlbnROYW1lID09PSAnZWRpdFRlbGVtZXRyeS5lZGl0U291cmNlcy5zdGF0cycpIHtcblx0XHRcdFx0XHRzdGF0cy5wdXNoKGRhdGEgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgbnVtYmVyIHwgdW5kZWZpbmVkPik7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UsIGFzeW5jICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cdFx0Zm9yIChsZXQgZWRpdCA9IDA7IGVkaXQgPCAxMjg7IGVkaXQrKykge1xuXHRcdFx0YXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHRcdHR1cm5JZDogYHR1cm4tJHtlZGl0fWAsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IGB0b29sLSR7ZWRpdH1gLFxuXHRcdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0XHRiZWZvcmVUZXh0LFxuXHRcdFx0XHRhZnRlclRleHQsXG5cdFx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiBiZWZvcmVUZXh0Lmxlbmd0aCwgZW5kT2Zmc2V0RXhjbHVzaXZlOiBiZWZvcmVUZXh0Lmxlbmd0aCwgbmV3VGV4dDogJ3knIH1dLFxuXHRcdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0cy5tYXAoZXZlbnQgPT4gKHtcblx0XHRcdGFnZW50SG9zdEF0dHJpYnV0aW9uQ292ZXJhZ2U6IGV2ZW50LmFnZW50SG9zdEF0dHJpYnV0aW9uQ292ZXJhZ2UsXG5cdFx0XHRhZ2VudEhvc3RVbnRyYWNrZWRFZGl0Q291bnQ6IGV2ZW50LmFnZW50SG9zdFVudHJhY2tlZEVkaXRDb3VudCxcblx0XHRcdGFnZW50SG9zdFVudHJhY2tlZEluc2VydGVkQ291bnQ6IGV2ZW50LmFnZW50SG9zdFVudHJhY2tlZEluc2VydGVkQ291bnQsXG5cdFx0fSkpLCBbe1xuXHRcdFx0YWdlbnRIb3N0QXR0cmlidXRpb25Db3ZlcmFnZTogJ3BhcnRpYWwnLFxuXHRcdFx0YWdlbnRIb3N0VW50cmFja2VkRWRpdENvdW50OiAxMjgsXG5cdFx0XHRhZ2VudEhvc3RVbnRyYWNrZWRJbnNlcnRlZENvdW50OiAxMjgsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYWdpbmF0ZXMgc3RhbmRhbG9uZSBjb3ZlcmFnZSBhY2tub3dsZWRnZW1lbnRzIHdpdGhvdXQgYWR2YW5jaW5nIHRoZWlyIGN1dG9mZicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2xhcmdlLnRzJyk7XG5cdFx0Y29uc3QgYmVmb3JlVGV4dCA9ICd4Jy5yZXBlYXQoNiAqIDEwMjQgKiAxMDI0KTtcblx0XHRjb25zdCBhZnRlclRleHQgPSBgJHtiZWZvcmVUZXh0fXlgO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhhZnRlclRleHQpKTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7IHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSwgcHVibGljTG9nMigpIHsgfSB9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHRmb3IgKGxldCBlZGl0ID0gMTsgZWRpdCA8PSAxMjk7IGVkaXQrKykge1xuXHRcdFx0YXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHRcdHR1cm5JZDogYHR1cm4tJHtlZGl0fWAsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IGB0b29sLSR7ZWRpdH1gLFxuXHRcdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0XHRiZWZvcmVUZXh0LFxuXHRcdFx0XHRhZnRlclRleHQsXG5cdFx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiBiZWZvcmVUZXh0Lmxlbmd0aCwgZW5kT2Zmc2V0RXhjbHVzaXZlOiBiZWZvcmVUZXh0Lmxlbmd0aCwgbmV3VGV4dDogJ3knIH1dLFxuXHRcdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmZsdXNoU2Vzc2lvbignY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cdFx0fVxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWInKSk7XG5cdFx0YXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zZXNzaW9uLWxpdmUnLFxuXHRcdFx0dHVybklkOiAndHVybi1saXZlJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWxpdmUnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBzZXJ2aWNlLnByZXBhcmVGbHVzaCh7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHRyaWdnZXI6ICdjbG9zZWQnLFxuXHRcdFx0c3RhdHNVdWlkOiAnc3RhdHMtMScsXG5cdFx0XHRpc0RpcnR5OiBmYWxzZSxcblx0XHRcdGZsdXNoVG9rZW46ICdmbHVzaC0xJyxcblx0XHRcdGxhbmd1YWdlSWQ6ICd0eXBlc2NyaXB0Jyxcblx0XHR9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNvbW1pdEZsdXNoKHsgZmx1c2hUb2tlbjogJ2ZsdXNoLTEnLCB0b3RhbE1vZGlmaWVkQ291bnQ6IDAgfSk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgc2VydmljZS5wcmVwYXJlRmx1c2goe1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHR0cmlnZ2VyOiAnY2xvc2VkJyxcblx0XHRcdHN0YXRzVXVpZDogJ3N0YXRzLTInLFxuXHRcdFx0aXNEaXJ0eTogZmFsc2UsXG5cdFx0XHRmbHVzaFRva2VuOiAnZmx1c2gtMicsXG5cdFx0XHRsYW5ndWFnZUlkOiAndHlwZXNjcmlwdCcsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpcnN0OiBmaXJzdCAmJiB7XG5cdFx0XHRcdGxhc3RTZXF1ZW5jZTogZmlyc3QubGFzdFNlcXVlbmNlLFxuXHRcdFx0XHRjb3ZlcmFnZUdhcFRocm91Z2hTZXF1ZW5jZTogZmlyc3QuY292ZXJhZ2VHYXBUaHJvdWdoU2VxdWVuY2UsXG5cdFx0XHRcdGFja25vd2xlZGdlbWVudENvdW50OiBmaXJzdC5zdGFuZGFsb25lQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzPy5sZW5ndGgsXG5cdFx0XHR9LFxuXHRcdFx0c2Vjb25kOiBzZWNvbmQgJiYge1xuXHRcdFx0XHRsYXN0U2VxdWVuY2U6IHNlY29uZC5sYXN0U2VxdWVuY2UsXG5cdFx0XHRcdGNvdmVyYWdlR2FwVGhyb3VnaFNlcXVlbmNlOiBzZWNvbmQuY292ZXJhZ2VHYXBUaHJvdWdoU2VxdWVuY2UsXG5cdFx0XHRcdGFja25vd2xlZGdlbWVudENvdW50OiBzZWNvbmQuc3RhbmRhbG9uZUNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cz8ubGVuZ3RoLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRmaXJzdDoge1xuXHRcdFx0XHRsYXN0U2VxdWVuY2U6IDEzMCxcblx0XHRcdFx0Y292ZXJhZ2VHYXBUaHJvdWdoU2VxdWVuY2U6IDEyOCxcblx0XHRcdFx0YWNrbm93bGVkZ2VtZW50Q291bnQ6IDEyOCxcblx0XHRcdH0sXG5cdFx0XHRzZWNvbmQ6IHtcblx0XHRcdFx0bGFzdFNlcXVlbmNlOiAxMjksXG5cdFx0XHRcdGNvdmVyYWdlR2FwVGhyb3VnaFNlcXVlbmNlOiAxMjksXG5cdFx0XHRcdGFja25vd2xlZGdlbWVudENvdW50OiAxLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBhIG1hcmtlciB3aGVuIHRoZSBpbnRlcnZhbCBzYWZldHkgbGltaXQgZmx1c2hlcyB0aGUgcmVzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0Y29uc3QgY2hhcmFjdGVycyA9IEFycmF5LmZyb20oJ2EnLnJlcGVhdCgyMF8wMDEpKTtcblx0XHRjb25zdCBjaGFuZ2VzID0gW107XG5cdFx0Zm9yIChsZXQgb2Zmc2V0ID0gMDsgb2Zmc2V0IDwgY2hhcmFjdGVycy5sZW5ndGg7IG9mZnNldCArPSAyKSB7XG5cdFx0XHRjaGFyYWN0ZXJzW29mZnNldF0gPSAnYic7XG5cdFx0XHRjaGFuZ2VzLnB1c2goeyBzdGFydE9mZnNldDogb2Zmc2V0LCBlbmRPZmZzZXRFeGNsdXNpdmU6IG9mZnNldCArIDEsIG5ld1RleHQ6ICdiJyB9KTtcblx0XHR9XG5cdFx0Y29uc3QgYWZ0ZXJUZXh0ID0gY2hhcmFjdGVycy5qb2luKCcnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoYWZ0ZXJUZXh0KSk7XG5cblx0XHRsZXQgZXZlbnRDb3VudCA9IDA7XG5cdFx0bGV0IHN0YXRzQ291bnQgPSAwO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHR0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwuVVNBR0UsXG5cdFx0XHRwdWJsaWNMb2cyKGV2ZW50TmFtZSkge1xuXHRcdFx0XHRpZiAoZXZlbnROYW1lID09PSAnZWRpdFRlbGVtZXRyeS5lZGl0U291cmNlcy5kZXRhaWxzJykge1xuXHRcdFx0XHRcdGV2ZW50Q291bnQrKztcblx0XHRcdFx0fSBlbHNlIGlmIChldmVudE5hbWUgPT09ICdlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLnN0YXRzJykge1xuXHRcdFx0XHRcdHN0YXRzQ291bnQrKztcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblxuXHRcdGNvbnN0IG1hcmtlciA9IGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnYScucmVwZWF0KDIwXzAwMSksXG5cdFx0XHRhZnRlclRleHQsXG5cdFx0XHRjaGFuZ2VzLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXR1czogbWFya2VyPy5zdGF0dXMsXG5cdFx0XHRldmVudENvdW50LFxuXHRcdFx0c3RhdHNDb3VudCxcblx0XHR9LCB7XG5cdFx0XHRzdGF0dXM6IHVuZGVmaW5lZCxcblx0XHRcdGV2ZW50Q291bnQ6IDEsXG5cdFx0XHRzdGF0c0NvdW50OiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXRyaWVzIGV4cGlyZWQgbm9uLXJlcG9zaXRvcnkgbG9va3VwcycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgbm93ID0gMDtcblx0XHRsZXQgcmVwb3NpdG9yeVJlYWRDb3VudCA9IDA7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7IHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSB9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmVwb3NpdG9yeVJlYWRDb3VudCsrO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9LCAoKSA9PiBub3cpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9maWxlLnRzJyxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMicsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0yJyxcblx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9maWxlLnRzJyxcblx0XHRcdGJlZm9yZVRleHQ6ICdhYicsXG5cdFx0XHRhZnRlclRleHQ6ICdhYmMnLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDIsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMiwgbmV3VGV4dDogJ2MnIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cdFx0bm93ID0gMTAgKiA2MCAqIDEwMDAgKyAxO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMycsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0zJyxcblx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9maWxlLnRzJyxcblx0XHRcdGJlZm9yZVRleHQ6ICdhYmMnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWJjZCcsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMywgZW5kT2Zmc2V0RXhjbHVzaXZlOiAzLCBuZXdUZXh0OiAnZCcgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXBvc2l0b3J5UmVhZENvdW50LCAyKTtcblx0fSk7XG5cblx0dGVzdCgnZmx1c2hlcyBvbmx5IHRoZSBjbG9zaW5nIHNlc3Npb24gd2hlbiBzZXNzaW9ucyBlZGl0IHRoZSBzYW1lIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhYmMnKSk7XG5cblx0XHRjb25zdCBldmVudHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZD5bXSA9IFtdO1xuXHRcdGNvbnN0IHN0YXRzRXZlbnRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQ+W10gPSBbXTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlmZkNvbXB1dGVTZXJ2aWNlLCB7XG5cdFx0XHRjb21wdXRlRGlmZkNvdW50czogYXN5bmMgKG9yaWdpbmFsLCBtb2RpZmllZCwgdGltZW91dE1zKSA9PiBjb21wdXRlRGlmZkNvdW50cyhvcmlnaW5hbCwgbW9kaWZpZWQsIHRpbWVvdXRNcyA/PyA1XzAwMCksXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoZXZlbnROYW1lLCBkYXRhKSB7XG5cdFx0XHRcdGlmIChldmVudE5hbWUgPT09ICdlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLmRldGFpbHMnKSB7XG5cdFx0XHRcdFx0ZXZlbnRzLnB1c2goZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQ+KTtcblx0XHRcdFx0fSBlbHNlIGlmIChldmVudE5hbWUgPT09ICdlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLnN0YXRzJykge1xuXHRcdFx0XHRcdHN0YXRzRXZlbnRzLnB1c2goZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQ+KTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tYScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLWEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtYScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2EnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWInLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDEsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMSwgbmV3VGV4dDogJ2InIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cdFx0YXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zZXNzaW9uLWInLFxuXHRcdFx0dHVybklkOiAndHVybi1iJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWInLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdhYicsXG5cdFx0XHRhZnRlclRleHQ6ICdhYmMnLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDIsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMiwgbmV3VGV4dDogJ2MnIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmZsdXNoU2Vzc2lvbignY29waWxvdDovc2Vzc2lvbi1iJyk7XG5cdFx0Y29uc3QgYWZ0ZXJGaXJzdEZsdXNoID0gZXZlbnRzLm1hcChldmVudCA9PiBldmVudC5jb252ZXJzYXRpb25JZCk7XG5cdFx0YXdhaXQgc2VydmljZS5mbHVzaFNlc3Npb24oJ2NvcGlsb3Q6L3Nlc3Npb24tYScpO1xuXHRcdGNvbnN0IGFja25vd2xlZGdlZCA9IGF3YWl0IHNlcnZpY2UucHJlcGFyZUZsdXNoKHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0dHJpZ2dlcjogJ2Nsb3NlZCcsXG5cdFx0XHRzdGF0c1V1aWQ6ICdzdGF0cy0xJyxcblx0XHRcdGlzRGlydHk6IGZhbHNlLFxuXHRcdFx0Zmx1c2hUb2tlbjogJ2ZsdXNoLTEnLFxuXHRcdFx0bGFuZ3VhZ2VJZDogJ3R5cGVzY3JpcHQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuY29tbWl0Rmx1c2goeyBmbHVzaFRva2VuOiBhY2tub3dsZWRnZWQhLmZsdXNoVG9rZW4sIHRvdGFsTW9kaWZpZWRDb3VudDogMCB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWZ0ZXJGaXJzdEZsdXNoLFxuXHRcdFx0YWNrbm93bGVkZ2VkOiBhY2tub3dsZWRnZWQgJiYge1xuXHRcdFx0XHRhZ2VudE1vZGlmaWVkQ291bnQ6IGFja25vd2xlZGdlZC5hZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGxhc3RTZXF1ZW5jZTogYWNrbm93bGVkZ2VkLmxhc3RTZXF1ZW5jZSxcblx0XHRcdH0sXG5cdFx0XHRzdGF0czogc3RhdHNFdmVudHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHRcdG90aGVyQUlNb2RpZmllZENvdW50OiBldmVudC5vdGhlckFJTW9kaWZpZWRDb3VudCxcblx0XHRcdFx0YWdlbnRIb3N0TW9kaWZpZWRDb3VudDogZXZlbnQuYWdlbnRIb3N0TW9kaWZpZWRDb3VudCxcblx0XHRcdFx0ZXh0ZXJuYWxNb2RpZmllZENvdW50OiBldmVudC5leHRlcm5hbE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdHRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzOiBldmVudC50b3RhbE1vZGlmaWVkQ2hhcmFjdGVycyxcblx0XHRcdH0pKSxcblx0XHRcdGFsbEV2ZW50czogZXZlbnRzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0XHRjb252ZXJzYXRpb25JZDogZXZlbnQuY29udmVyc2F0aW9uSWQsXG5cdFx0XHRcdG1vZGlmaWVkQ291bnQ6IGV2ZW50Lm1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGRlbHRhTW9kaWZpZWRDb3VudDogZXZlbnQuZGVsdGFNb2RpZmllZENvdW50LFxuXHRcdFx0fSkpLFxuXHRcdH0sIHtcblx0XHRcdGFmdGVyRmlyc3RGbHVzaDogWydzZXNzaW9uLWInXSxcblx0XHRcdGFja25vd2xlZGdlZDoge1xuXHRcdFx0XHRhZ2VudE1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRcdGxhc3RTZXF1ZW5jZTogMixcblx0XHRcdH0sXG5cdFx0XHRzdGF0czogW1xuXHRcdFx0XHR7IG90aGVyQUlNb2RpZmllZENvdW50OiAwLCBhZ2VudEhvc3RNb2RpZmllZENvdW50OiAxLCBleHRlcm5hbE1vZGlmaWVkQ291bnQ6IDAsIHRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzOiAxIH0sXG5cdFx0XHRcdHsgb3RoZXJBSU1vZGlmaWVkQ291bnQ6IDAsIGFnZW50SG9zdE1vZGlmaWVkQ291bnQ6IDEsIGV4dGVybmFsTW9kaWZpZWRDb3VudDogMCwgdG90YWxNb2RpZmllZENoYXJhY3RlcnM6IDEgfSxcblx0XHRcdF0sXG5cdFx0XHRhbGxFdmVudHM6IFtcblx0XHRcdFx0eyBjb252ZXJzYXRpb25JZDogJ3Nlc3Npb24tYicsIG1vZGlmaWVkQ291bnQ6IDEsIGRlbHRhTW9kaWZpZWRDb3VudDogMSB9LFxuXHRcdFx0XHR7IGNvbnZlcnNhdGlvbklkOiAnc2Vzc2lvbi1hJywgbW9kaWZpZWRDb3VudDogMSwgZGVsdGFNb2RpZmllZENvdW50OiAxIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdib3VuZHMgc2FtZS1maWxlIHJlY29uY2lsaWF0aW9uIGJ5IG9uZSBhZ2dyZWdhdGUgZGVhZGxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhYmNkZScpKTtcblxuXHRcdGxldCBub3cgPSAwO1xuXHRcdGNvbnN0IHRpbWVvdXRWYWx1ZXM6IG51bWJlcltdID0gW107XG5cdFx0bGV0IGV2ZW50Q291bnQgPSAwO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIHtcblx0XHRcdGFzeW5jIGNvbXB1dGVEaWZmQ291bnRzKG9yaWdpbmFsLCBtb2RpZmllZCwgdGltZW91dE1zKSB7XG5cdFx0XHRcdHRpbWVvdXRWYWx1ZXMucHVzaCh0aW1lb3V0TXMgPz8gMCk7XG5cdFx0XHRcdG5vdyArPSA1XzAwMDtcblx0XHRcdFx0cmV0dXJuIGNvbXB1dGVEaWZmQ291bnRzKG9yaWdpbmFsLCBtb2RpZmllZCwgdGltZW91dE1zID8/IDVfMDAwKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoKSB7XG5cdFx0XHRcdGV2ZW50Q291bnQrKztcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UsIGFzeW5jICgpID0+IHVuZGVmaW5lZCwgKCkgPT4gbm93KSk7XG5cdFx0Zm9yIChjb25zdCBbc2Vzc2lvblVyaSwgYmVmb3JlVGV4dCwgYWZ0ZXJUZXh0XSBvZiBbXG5cdFx0XHRbJ2NvcGlsb3Q6L3Nlc3Npb24tYScsICdhJywgJ2FiJ10sXG5cdFx0XHRbJ2NvcGlsb3Q6L3Nlc3Npb24tYicsICdhYicsICdhYmMnXSxcblx0XHRcdFsnY29waWxvdDovc2Vzc2lvbi1jJywgJ2FiYycsICdhYmNkJ10sXG5cdFx0XHRbJ2NvcGlsb3Q6L3Nlc3Npb24tZCcsICdhYmNkJywgJ2FiY2RlJ10sXG5cdFx0XSBhcyBjb25zdCkge1xuXHRcdFx0YXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdFx0c2Vzc2lvblVyaSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRcdGJlZm9yZVRleHQsXG5cdFx0XHRcdGFmdGVyVGV4dCxcblx0XHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IGJlZm9yZVRleHQubGVuZ3RoLCBlbmRPZmZzZXRFeGNsdXNpdmU6IGJlZm9yZVRleHQubGVuZ3RoLCBuZXdUZXh0OiBhZnRlclRleHQuc2xpY2UoYmVmb3JlVGV4dC5sZW5ndGgpIH1dLFxuXHRcdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgc2VydmljZS5mbHVzaFNlc3Npb24oJ2NvcGlsb3Q6L3Nlc3Npb24tYScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHRpbWVvdXRWYWx1ZXMsIGV2ZW50Q291bnQgfSwge1xuXHRcdFx0dGltZW91dFZhbHVlczogWzhfMDAwLCAzXzAwMF0sXG5cdFx0XHRldmVudENvdW50OiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb29yZGluYXRlcyBhIGxpdmUgc2Vzc2lvbiBhZnRlciBhbm90aGVyIHNlc3Npb24gZmx1c2hlZCB0aGUgc2FtZSBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWJjJykpO1xuXG5cdFx0Y29uc3QgZXZlbnRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQ+W10gPSBbXTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlmZkNvbXB1dGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0dGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsLlVTQUdFLFxuXHRcdFx0cHVibGljTG9nMihldmVudE5hbWUsIGRhdGEpIHtcblx0XHRcdFx0aWYgKGV2ZW50TmFtZSA9PT0gJ2VkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuZGV0YWlscycpIHtcblx0XHRcdFx0XHRldmVudHMucHVzaChkYXRhIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZD4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBhc3luYyAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCkpO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi1hJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tYScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC1hJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnYScsXG5cdFx0XHRhZnRlclRleHQ6ICdhYicsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMSwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAxLCBuZXdUZXh0OiAnYicgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tYicsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLWInLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtYicsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2FiJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiYycsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMiwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAyLCBuZXdUZXh0OiAnYycgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLmZsdXNoU2Vzc2lvbignY29waWxvdDovc2Vzc2lvbi1hJyk7XG5cblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHNlcnZpY2UucHJlcGFyZUZsdXNoKHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0dHJpZ2dlcjogJ2Nsb3NlZCcsXG5cdFx0XHRzdGF0c1V1aWQ6ICdzdGF0cy0xJyxcblx0XHRcdGlzRGlydHk6IGZhbHNlLFxuXHRcdFx0Zmx1c2hUb2tlbjogJ2ZsdXNoLTEnLFxuXHRcdFx0bGFuZ3VhZ2VJZDogJ3R5cGVzY3JpcHQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuY29tbWl0Rmx1c2goeyBmbHVzaFRva2VuOiBwcmVwYXJlZCEuZmx1c2hUb2tlbiwgdG90YWxNb2RpZmllZENvdW50OiBwcmVwYXJlZCEuYWdlbnRNb2RpZmllZENvdW50IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHRjb252ZXJzYXRpb25JZDogZXZlbnQuY29udmVyc2F0aW9uSWQsXG5cdFx0XHRtb2RpZmllZENvdW50OiBldmVudC5tb2RpZmllZENvdW50LFxuXHRcdH0pKSwgW1xuXHRcdFx0eyBjb252ZXJzYXRpb25JZDogJ3Nlc3Npb24tYScsIG1vZGlmaWVkQ291bnQ6IDAgfSxcblx0XHRcdHsgY29udmVyc2F0aW9uSWQ6ICdzZXNzaW9uLWInLCBtb2RpZmllZENvdW50OiAxIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsYWltcyBhIHJlc291cmNlIG9uY2Ugd2hlbiBmbHVzaCB0cmlnZ2VycyByYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWInKSk7XG5cblx0XHRsZXQgZXZlbnRDb3VudCA9IDA7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoZXZlbnROYW1lKSB7XG5cdFx0XHRcdGlmIChldmVudE5hbWUgPT09ICdlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLmRldGFpbHMnKSB7XG5cdFx0XHRcdFx0ZXZlbnRDb3VudCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBhc3luYyAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCkpO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnYScsXG5cdFx0XHRhZnRlclRleHQ6ICdhYicsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMSwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAxLCBuZXdUZXh0OiAnYicgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IFtfLCBwcmVwYXJlZF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRzZXJ2aWNlLmZsdXNoU2Vzc2lvbignY29waWxvdDovc2Vzc2lvbi0xJyksXG5cdFx0XHRzZXJ2aWNlLnByZXBhcmVGbHVzaCh7XG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHR0cmlnZ2VyOiAnY2xvc2VkJyxcblx0XHRcdFx0c3RhdHNVdWlkOiAnc3RhdHMtMScsXG5cdFx0XHRcdGlzRGlydHk6IGZhbHNlLFxuXHRcdFx0XHRmbHVzaFRva2VuOiAnZmx1c2gtMScsXG5cdFx0XHRcdGxhbmd1YWdlSWQ6ICd0eXBlc2NyaXB0Jyxcblx0XHRcdH0pLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwcmVwYXJlZDogcHJlcGFyZWQgJiYge1xuXHRcdFx0XHRhZ2VudE1vZGlmaWVkQ291bnQ6IHByZXBhcmVkLmFnZW50TW9kaWZpZWRDb3VudCxcblx0XHRcdFx0bGFzdFNlcXVlbmNlOiBwcmVwYXJlZC5sYXN0U2VxdWVuY2UsXG5cdFx0XHR9LFxuXHRcdFx0ZXZlbnRDb3VudCxcblx0XHR9LCB7XG5cdFx0XHRwcmVwYXJlZDoge1xuXHRcdFx0XHRhZ2VudE1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRcdGxhc3RTZXF1ZW5jZTogMSxcblx0XHRcdH0sXG5cdFx0XHRldmVudENvdW50OiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb29yZGluYXRlcyBXaW5kb3dzIHJlc291cmNlcyB3aGVuIHBhdGggY2FzaW5nIGRpZmZlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0Y29uc3QgZmlsZVBhdGggPSBVUkkuZmlsZSgnL1dvcmtzcGFjZS9maWxlLnRzJykuZnNQYXRoO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihVUkkuZmlsZSgnL1dvcmtzcGFjZScpKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmZpbGUoZmlsZVBhdGgpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhYicpKTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHR0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwuVVNBR0UsXG5cdFx0XHRwdWJsaWNMb2cyKCkgeyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBhc3luYyAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCkpO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2EnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWInLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDEsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMSwgbmV3VGV4dDogJ2InIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHNlcnZpY2UucHJlcGFyZUZsdXNoKHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0dHJpZ2dlcjogJ2Nsb3NlZCcsXG5cdFx0XHRzdGF0c1V1aWQ6ICdzdGF0cy0xJyxcblx0XHRcdGlzRGlydHk6IGZhbHNlLFxuXHRcdFx0Zmx1c2hUb2tlbjogJ2ZsdXNoLTEnLFxuXHRcdFx0bGFuZ3VhZ2VJZDogJ3R5cGVzY3JpcHQnLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcmVwYXJlZCAmJiB7XG5cdFx0XHRmbHVzaFRva2VuOiBwcmVwYXJlZC5mbHVzaFRva2VuLFxuXHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiBwcmVwYXJlZC5hZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0fSwge1xuXHRcdFx0Zmx1c2hUb2tlbjogJ2ZsdXNoLTEnLFxuXHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyBwcmVwYXJlZCByZXNvdXJjZXMgd2hlbiBhIGNvb3JkaW5hdGVkIGZsdXNoIGlzIGNhbmNlbGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2ZpbGUudHMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FiJykpO1xuXG5cdFx0bGV0IGV2ZW50Q291bnQgPSAwO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHR0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwuVVNBR0UsXG5cdFx0XHRwdWJsaWNMb2cyKGV2ZW50TmFtZSkge1xuXHRcdFx0XHRpZiAoZXZlbnROYW1lID09PSAnZWRpdFRlbGVtZXRyeS5lZGl0U291cmNlcy5kZXRhaWxzJykge1xuXHRcdFx0XHRcdGV2ZW50Q291bnQrKztcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2EnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWInLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDEsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMSwgbmV3VGV4dDogJ2InIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCBzZXJ2aWNlLnByZXBhcmVGbHVzaCh7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHRyaWdnZXI6ICdjbG9zZWQnLFxuXHRcdFx0c3RhdHNVdWlkOiAnc3RhdHMtMScsXG5cdFx0XHRpc0RpcnR5OiBmYWxzZSxcblx0XHRcdGZsdXNoVG9rZW46ICdmbHVzaC0xJyxcblx0XHRcdGxhbmd1YWdlSWQ6ICd0eXBlc2NyaXB0Jyxcblx0XHR9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY2FuY2VsRmx1c2goeyBmbHVzaFRva2VuOiBwcmVwYXJlZCEuZmx1c2hUb2tlbiB9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLmZsdXNoU2Vzc2lvbignY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRDb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhaXRzIGZvciBhbiBpbi1mbGlnaHQgcHJlcGFyZSBiZWZvcmUgY2FuY2VsbGluZyBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCByZWFkU3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCByZWFkUmVzdWx0ID0gbmV3IERlZmVycmVkUHJvbWlzZTxVaW50OEFycmF5PigpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBjbGFzcyBleHRlbmRzIEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIHtcblx0XHRcdGJsb2NrUmVhZHMgPSBmYWxzZTtcblxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8VWludDhBcnJheT4ge1xuXHRcdFx0XHRpZiAodGhpcy5ibG9ja1JlYWRzKSB7XG5cdFx0XHRcdFx0cmVhZFN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdFx0XHRyZXR1cm4gcmVhZFJlc3VsdC5wO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdXBlci5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fSgpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIHByb3ZpZGVyKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhYicpKTtcblxuXHRcdGxldCBldmVudENvdW50ID0gMDtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlmZkNvbXB1dGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0dGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsLlVTQUdFLFxuXHRcdFx0cHVibGljTG9nMihldmVudE5hbWUpIHtcblx0XHRcdFx0aWYgKGV2ZW50TmFtZSA9PT0gJ2VkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuZGV0YWlscycpIHtcblx0XHRcdFx0XHRldmVudENvdW50Kys7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UsIGFzeW5jICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cdFx0YXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXHRcdHByb3ZpZGVyLmJsb2NrUmVhZHMgPSB0cnVlO1xuXG5cdFx0Y29uc3QgcHJlcGFyZSA9IHNlcnZpY2UucHJlcGFyZUZsdXNoKHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0dHJpZ2dlcjogJ2Nsb3NlZCcsXG5cdFx0XHRzdGF0c1V1aWQ6ICdzdGF0cy0xJyxcblx0XHRcdGlzRGlydHk6IGZhbHNlLFxuXHRcdFx0Zmx1c2hUb2tlbjogJ2ZsdXNoLTEnLFxuXHRcdFx0bGFuZ3VhZ2VJZDogJ3R5cGVzY3JpcHQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHJlYWRTdGFydGVkLnA7XG5cdFx0Y29uc3QgY2FuY2VsID0gc2VydmljZS5jYW5jZWxGbHVzaCh7IGZsdXNoVG9rZW46ICdmbHVzaC0xJyB9KTtcblx0XHRyZWFkUmVzdWx0LmNvbXBsZXRlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FiJykuYnVmZmVyKTtcblx0XHRjb25zdCBbcHJlcGFyZWQsIGNhbmNlbE91dGNvbWVdID0gYXdhaXQgUHJvbWlzZS5hbGwoW3ByZXBhcmUsIGNhbmNlbF0pO1xuXHRcdHByb3ZpZGVyLmJsb2NrUmVhZHMgPSBmYWxzZTtcblx0XHRhd2FpdCBzZXJ2aWNlLmZsdXNoU2Vzc2lvbignY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByZXBhcmVkOiBwcmVwYXJlZD8uYWdlbnRNb2RpZmllZENvdW50LFxuXHRcdFx0Y2FuY2VsT3V0Y29tZSxcblx0XHRcdGV2ZW50Q291bnQsXG5cdFx0fSwge1xuXHRcdFx0cHJlcGFyZWQ6IDEsXG5cdFx0XHRjYW5jZWxPdXRjb21lOiB7IG91dGNvbWU6ICdjYW5jZWxsZWQnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDAgfSxcblx0XHRcdGV2ZW50Q291bnQ6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc2VydmVzIGEgc3RhbmRhbG9uZSBhY2tub3dsZWRnZW1lbnQgZm9yIG9uZSBwcmVwYXJlZCBmbHVzaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2ZpbGUudHMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FiJykpO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoKSB7IH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UsIGFzeW5jICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cdFx0YXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuZmx1c2hTZXNzaW9uKCdjb3BpbG90Oi9zZXNzaW9uLTEnKTtcblxuXHRcdGNvbnN0IGZpcnN0ID0gYXdhaXQgc2VydmljZS5wcmVwYXJlRmx1c2goe1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHR0cmlnZ2VyOiAnY2xvc2VkJyxcblx0XHRcdHN0YXRzVXVpZDogJ3N0YXRzLTEnLFxuXHRcdFx0aXNEaXJ0eTogZmFsc2UsXG5cdFx0XHRmbHVzaFRva2VuOiAnZmx1c2gtMScsXG5cdFx0XHRsYW5ndWFnZUlkOiAndHlwZXNjcmlwdCcsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZHVwbGljYXRlID0gYXdhaXQgc2VydmljZS5wcmVwYXJlRmx1c2goe1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHR0cmlnZ2VyOiAnY2xvc2VkJyxcblx0XHRcdHN0YXRzVXVpZDogJ3N0YXRzLTInLFxuXHRcdFx0aXNEaXJ0eTogZmFsc2UsXG5cdFx0XHRmbHVzaFRva2VuOiAnZmx1c2gtMicsXG5cdFx0XHRsYW5ndWFnZUlkOiAndHlwZXNjcmlwdCcsXG5cdFx0fSk7XG5cdFx0YXdhaXQgc2VydmljZS5jYW5jZWxGbHVzaCh7IGZsdXNoVG9rZW46ICdmbHVzaC0xJyB9KTtcblx0XHRjb25zdCByZXN0b3JlZCA9IGF3YWl0IHNlcnZpY2UucHJlcGFyZUZsdXNoKHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0dHJpZ2dlcjogJ2Nsb3NlZCcsXG5cdFx0XHRzdGF0c1V1aWQ6ICdzdGF0cy0zJyxcblx0XHRcdGlzRGlydHk6IGZhbHNlLFxuXHRcdFx0Zmx1c2hUb2tlbjogJ2ZsdXNoLTMnLFxuXHRcdFx0bGFuZ3VhZ2VJZDogJ3R5cGVzY3JpcHQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuY2FuY2VsRmx1c2goeyBmbHVzaFRva2VuOiAnZmx1c2gtMycgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpcnN0OiBmaXJzdD8uYWdlbnRNb2RpZmllZENvdW50LFxuXHRcdFx0ZHVwbGljYXRlLFxuXHRcdFx0cmVzdG9yZWQ6IHJlc3RvcmVkPy5hZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0fSwge1xuXHRcdFx0Zmlyc3Q6IDAsXG5cdFx0XHRkdXBsaWNhdGU6IHVuZGVmaW5lZCxcblx0XHRcdHJlc3RvcmVkOiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYWtlcyBjb21taXQgYW5kIGNhbmNlbGxhdGlvbiBpZGVtcG90ZW50IGFmdGVyIHRlbGVtZXRyeSBpcyBlbWl0dGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWInKSk7XG5cblx0XHRsZXQgZXZlbnRDb3VudCA9IDA7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoZXZlbnROYW1lKSB7XG5cdFx0XHRcdGlmIChldmVudE5hbWUgPT09ICdlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLmRldGFpbHMnKSB7XG5cdFx0XHRcdFx0ZXZlbnRDb3VudCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBhc3luYyAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCkpO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnYScsXG5cdFx0XHRhZnRlclRleHQ6ICdhYicsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMSwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAxLCBuZXdUZXh0OiAnYicgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLnByZXBhcmVGbHVzaCh7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHRyaWdnZXI6ICdjbG9zZWQnLFxuXHRcdFx0c3RhdHNVdWlkOiAnc3RhdHMtMScsXG5cdFx0XHRpc0RpcnR5OiBmYWxzZSxcblx0XHRcdGZsdXNoVG9rZW46ICdmbHVzaC0xJyxcblx0XHRcdGxhbmd1YWdlSWQ6ICd0eXBlc2NyaXB0Jyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IG91dGNvbWVzID0gW1xuXHRcdFx0YXdhaXQgc2VydmljZS5jb21taXRGbHVzaCh7IGZsdXNoVG9rZW46ICdmbHVzaC0xJywgdG90YWxNb2RpZmllZENvdW50OiAxIH0pLFxuXHRcdFx0YXdhaXQgc2VydmljZS5jb21taXRGbHVzaCh7IGZsdXNoVG9rZW46ICdmbHVzaC0xJywgdG90YWxNb2RpZmllZENvdW50OiAxIH0pLFxuXHRcdFx0YXdhaXQgc2VydmljZS5jYW5jZWxGbHVzaCh7IGZsdXNoVG9rZW46ICdmbHVzaC0xJyB9KSxcblx0XHRdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IG91dGNvbWVzLCBldmVudENvdW50IH0sIHtcblx0XHRcdG91dGNvbWVzOiBbXG5cdFx0XHRcdHsgb3V0Y29tZTogJ2NvbW1pdHRlZCcsIGFnZW50TW9kaWZpZWRDb3VudDogMSwgbGFzdFNlcXVlbmNlOiAxLCBjb3ZlcmFnZUdhcFRocm91Z2hTZXF1ZW5jZTogMSB9LFxuXHRcdFx0XHR7IG91dGNvbWU6ICdjb21taXR0ZWQnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDEsIGxhc3RTZXF1ZW5jZTogMSwgY292ZXJhZ2VHYXBUaHJvdWdoU2VxdWVuY2U6IDEgfSxcblx0XHRcdFx0eyBvdXRjb21lOiAnY29tbWl0dGVkJywgYWdlbnRNb2RpZmllZENvdW50OiAxLCBsYXN0U2VxdWVuY2U6IDEsIGNvdmVyYWdlR2FwVGhyb3VnaFNlcXVlbmNlOiAxIH0sXG5cdFx0XHRdLFxuXHRcdFx0ZXZlbnRDb3VudDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgYW4gdW5jbGFpbWVkIHByZXBhcmVkIGZsdXNoIGFmdGVyIGl0cyB0aW1lb3V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWInKSk7XG5cblx0XHRsZXQgZXZlbnRDb3VudCA9IDA7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoZXZlbnROYW1lKSB7XG5cdFx0XHRcdGlmIChldmVudE5hbWUgPT09ICdlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLmRldGFpbHMnKSB7XG5cdFx0XHRcdFx0ZXZlbnRDb3VudCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGxldCBub3cgPSAwO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBhc3luYyAoKSA9PiB1bmRlZmluZWQsICgpID0+IG5vdykpO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnYScsXG5cdFx0XHRhZnRlclRleHQ6ICdhYicsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMSwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAxLCBuZXdUZXh0OiAnYicgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLnByZXBhcmVGbHVzaCh7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHRyaWdnZXI6ICdjbG9zZWQnLFxuXHRcdFx0c3RhdHNVdWlkOiAnc3RhdHMtMScsXG5cdFx0XHRpc0RpcnR5OiBmYWxzZSxcblx0XHRcdGZsdXNoVG9rZW46ICdmbHVzaC0xJyxcblx0XHRcdGxhbmd1YWdlSWQ6ICd0eXBlc2NyaXB0Jyxcblx0XHR9KTtcblxuXHRcdG5vdyA9IDUgKiA2MCAqIDEwMDAgKyAxO1xuXHRcdGF3YWl0IHNlcnZpY2UuY2hlY2tHaXRTdGF0ZSgpO1xuXHRcdGNvbnN0IGNvbW1pdE91dGNvbWUgPSBhd2FpdCBzZXJ2aWNlLmNvbW1pdEZsdXNoKHsgZmx1c2hUb2tlbjogJ2ZsdXNoLTEnLCB0b3RhbE1vZGlmaWVkQ291bnQ6IDEgfSk7XG5cdFx0YXdhaXQgc2VydmljZS5mbHVzaFNlc3Npb24oJ2NvcGlsb3Q6L3Nlc3Npb24tMScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGNvbW1pdE91dGNvbWUsIGV2ZW50Q291bnQgfSwge1xuXHRcdFx0Y29tbWl0T3V0Y29tZTogeyBvdXRjb21lOiAnY2FuY2VsbGVkJywgYWdlbnRNb2RpZmllZENvdW50OiAwIH0sXG5cdFx0XHRldmVudENvdW50OiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmZW5jZXMgYSBwcmVwYXJlIHJlcXVlc3QgdGhhdCBhcnJpdmVzIGFmdGVyIGNhbmNlbGxhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2ZpbGUudHMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FiJykpO1xuXG5cdFx0bGV0IGV2ZW50Q291bnQgPSAwO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHR0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwuVVNBR0UsXG5cdFx0XHRwdWJsaWNMb2cyKGV2ZW50TmFtZSkge1xuXHRcdFx0XHRpZiAoZXZlbnROYW1lID09PSAnZWRpdFRlbGVtZXRyeS5lZGl0U291cmNlcy5kZXRhaWxzJykge1xuXHRcdFx0XHRcdGV2ZW50Q291bnQrKztcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2EnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWInLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDEsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMSwgbmV3VGV4dDogJ2InIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBjYW5jZWxPdXRjb21lID0gYXdhaXQgc2VydmljZS5jYW5jZWxGbHVzaCh7IGZsdXNoVG9rZW46ICdmbHVzaC0xJyB9KTtcblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHNlcnZpY2UucHJlcGFyZUZsdXNoKHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0dHJpZ2dlcjogJ2Nsb3NlZCcsXG5cdFx0XHRzdGF0c1V1aWQ6ICdzdGF0cy0xJyxcblx0XHRcdGlzRGlydHk6IGZhbHNlLFxuXHRcdFx0Zmx1c2hUb2tlbjogJ2ZsdXNoLTEnLFxuXHRcdFx0bGFuZ3VhZ2VJZDogJ3R5cGVzY3JpcHQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuZmx1c2hTZXNzaW9uKCdjb3BpbG90Oi9zZXNzaW9uLTEnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjYW5jZWxPdXRjb21lLCBwcmVwYXJlZCwgZXZlbnRDb3VudCB9LCB7XG5cdFx0XHRjYW5jZWxPdXRjb21lOiB7IG91dGNvbWU6ICdjYW5jZWxsZWQnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDAgfSxcblx0XHRcdHByZXBhcmVkOiB1bmRlZmluZWQsXG5cdFx0XHRldmVudENvdW50OiAxLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxtQkFBbUIsc0JBQXNCO0FBQ2xELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsY0FBYywyQkFBMkI7QUFDbEQsU0FBUyxtQ0FBbUM7QUFFNUMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw4QkFBOEI7QUFFdkMsTUFBTSxrQ0FBa0MsTUFBTTtBQUM3QyxRQUFNLGNBQWMsd0NBQXdDO0FBRTVELE9BQUssdURBQXVELFlBQVk7QUFDdkUsVUFBTSxjQUFjLFlBQVksSUFBSSxJQUFJLFlBQVksSUFBSSxlQUFlLENBQUMsQ0FBQztBQUN6RSxnQkFBWSxJQUFJLFlBQVksaUJBQWlCLFFBQVEsWUFBWSxJQUFJLElBQUksMkJBQTJCLENBQUMsQ0FBQyxDQUFDO0FBQ3ZHLFVBQU0sV0FBVyxJQUFJLEtBQUssb0JBQW9CO0FBQzlDLFVBQU0sWUFBWSxVQUFVLFVBQVUsU0FBUyxXQUFXLFFBQVEsQ0FBQztBQUVuRSxVQUFNLFNBQXFGLENBQUM7QUFDNUYsVUFBTSx1QkFBdUIsWUFBWSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDM0UseUJBQXFCLEtBQUssY0FBYyxXQUFXO0FBQ25ELHlCQUFxQixLQUFLLHFCQUFxQjtBQUFBLE1B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
