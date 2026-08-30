import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Schemas } from "../../../../../base/common/network.js";
import { extUri } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { IAgentHostService } from "../../../../../platform/agentHost/common/agentService.js";
import { IAgentHostConnectionsService } from "../../../../../platform/agentHost/common/agentHostConnectionsService.js";
import { toAgentHostUri } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { createFileEditContentDigest, FILE_EDIT_ATTRIBUTION_PROPERTY, parseEditAttributionResource } from "../../../../../platform/agentHost/common/fileEditAttribution.js";
import { ActionType } from "../../../../../platform/agentHost/common/state/protocol/common/actions.js";
import { ContentEncoding } from "../../../../../platform/agentHost/common/state/protocol/commands.js";
import { ToolResultContentType } from "../../../../../platform/agentHost/common/state/sessionState.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { AgentHostEditAttributionDeferredError, AgentHostEditMarkerService } from "../../browser/telemetry/agentHostEditMarkerService.js";
suite("Agent Host Edit Marker Service", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("suppresses marker-first and reload-first observations", () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    context.fireMarker(marker(1, "a", "ab"));
    const markerFirst = correlation.register("a", "ab");
    const reloadFirst = correlation.register("ab", "abc");
    context.fireMarker(marker(2, "ab", "abc"));
    assert.deepStrictEqual({
      markerFirst: correlation.isSuppressed(markerFirst),
      reloadFirst: correlation.isSuppressed(reloadFirst),
      suppressedIds: context.suppressedIds
    }, {
      markerFirst: true,
      reloadFirst: true,
      suppressedIds: [markerFirst, reloadFirst]
    });
  });
  test("shares one resolved attribution with all active consumers", () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    const first = correlation.register("a", "ab");
    const second = correlation.register("a", "ab");
    correlation.release(first);
    context.fireMarker(marker(1, "a", "ab", {
      modelId: "gpt-5",
      conversationId: "session-1",
      requestId: "turn-1",
      harness: "copilotcli"
    }));
    const resolution = correlation.getResolution?.(second);
    assert.deepStrictEqual({
      sharedObservation: first === second,
      suppressed: correlation.isSuppressed(second),
      sourceKey: resolution?.source?.toKey(1),
      sessionId: resolution?.source?.props.$$sessionId,
      requestId: resolution?.source?.props.$$requestId
    }, {
      sharedObservation: true,
      suppressed: true,
      sourceKey: "source:Chat.applyEdits-$modelId:gpt-5-$harness:copilotcli-$origin:agentHost",
      sessionId: "session-1",
      requestId: "turn-1"
    });
  });
  test("records oversized Agent edits as coverage gaps without suppressing reloads", () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    context.fireMarker({
      version: 1,
      editId: "edit-skipped",
      sequence: 1,
      status: "skipped",
      reason: "fileTooLarge",
      insertedCount: 42
    });
    const observation = correlation.register("a", "ab");
    assert.deepStrictEqual({
      suppressed: correlation.isSuppressed(observation),
      coverageGap: context.service.takeCoverageGap(context.resource)
    }, {
      suppressed: false,
      coverageGap: {
        editCount: 1,
        insertedCount: 42
      }
    });
  });
  test("rejects null marker source metadata without disrupting action processing", () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    const observation = correlation.register("a", "ab");
    const malformedMarker = {
      version: 1,
      editId: "edit-null-source",
      sequence: 1,
      beforeDigest: createFileEditContentDigest("a"),
      afterDigest: createFileEditContentDigest("ab"),
      source: null
    };
    context.fireRawMarker(malformedMarker);
    assert.strictEqual(correlation.isSuppressed(observation), false);
  });
  test("does not evict active observations when the cap is reached", () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    const first = correlation.register("before-0", "after-0");
    for (let index = 1; index <= 128; index++) {
      correlation.register(`before-${index}`, `after-${index}`);
    }
    context.fireMarker(marker(1, "before-0", "after-0"));
    assert.deepStrictEqual({
      firstSuppressed: correlation.isSuppressed(first),
      suppressedIds: context.suppressedIds
    }, {
      firstSuppressed: true,
      suppressedIds: [first]
    });
  });
  test("does not match an observation after its marker TTL expires", () => runWithFakedTimers({}, async () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    const observation = correlation.register("a", "ab");
    await timeout(5 * 60 * 1e3 + 1);
    context.fireMarker(marker(1, "a", "ab"));
    assert.strictEqual(correlation.isSuppressed(observation), false);
  }));
  test("recovers observation capacity after unresolved observations expire", () => runWithFakedTimers({}, async () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    for (let index = 0; index < 128; index++) {
      correlation.register(`before-${index}`, `after-${index}`);
    }
    await timeout(5 * 60 * 1e3 + 1);
    const observation = correlation.register("current-before", "current-after");
    context.fireMarker(marker(1, "current-before", "current-after"));
    assert.strictEqual(correlation.isSuppressed(observation), true);
  }));
  test("does not report expired coverage gaps", () => runWithFakedTimers({}, async () => {
    const context = createContext();
    context.fireMarker({
      version: 1,
      editId: "edit-skipped",
      sequence: 1,
      status: "skipped",
      reason: "fileTooLarge",
      insertedCount: 42
    });
    await timeout(10 * 60 * 60 * 1e3 + 1);
    assert.strictEqual(context.service.takeCoverageGap(context.resource), void 0);
  }));
  test("takes coverage gaps only through the coordinated sequence", () => {
    const context = createContext();
    context.fireMarker({
      version: 1,
      editId: "gap-1",
      sequence: 1,
      status: "skipped",
      reason: "fileTooLarge",
      insertedCount: 10
    });
    context.fireMarker({
      version: 1,
      editId: "gap-2",
      sequence: 2,
      status: "skipped",
      reason: "fileTooLarge",
      insertedCount: 20
    });
    assert.deepStrictEqual({
      first: context.service.takeCoverageGap(context.resource, 1),
      remaining: context.service.takeCoverageGap(context.resource)
    }, {
      first: { editCount: 1, insertedCount: 10 },
      remaining: { editCount: 1, insertedCount: 20 }
    });
  });
  test("preserves more than 128 pending coverage gaps", () => {
    const context = createContext();
    for (let sequence = 1; sequence <= 129; sequence++) {
      context.fireMarker({
        version: 1,
        editId: `gap-${sequence}`,
        sequence,
        status: "skipped",
        reason: "fileTooLarge",
        insertedCount: sequence
      });
    }
    assert.deepStrictEqual(context.service.takeCoverageGap(context.resource), {
      editCount: 129,
      insertedCount: 129 * 130 / 2
    });
  });
  test("does not report standalone-emitted coverage gaps in a later workbench flush", async () => {
    const context = createContext({
      prepareSequence: 2,
      standaloneCoverageGapAcknowledgements: [{
        id: "ack-1",
        sequences: [1],
        editCount: 1,
        insertedCount: 42
      }]
    });
    context.fireMarker({
      version: 1,
      editId: "edit-skipped-1",
      sequence: 1,
      status: "skipped",
      reason: "fileTooLarge",
      insertedCount: 42
    });
    context.fireMarker({
      version: 1,
      editId: "edit-skipped-2",
      sequence: 2,
      status: "skipped",
      reason: "fileTooLarge",
      insertedCount: 7
    });
    await context.service.prepareFlush(context.resource, "hashChange", "stats-1", false);
    await context.service.prepareFlush(context.resource, "hashChange", "stats-2", false);
    assert.deepStrictEqual(context.service.takeCoverageGap(context.resource), {
      editCount: 1,
      insertedCount: 7
    });
  });
  test("clears coverage gaps from a restarted Agent Host sequence", () => {
    const context = createContext();
    context.fireMarker({
      version: 1,
      editId: "old-gap",
      sequence: 1,
      status: "skipped",
      reason: "fileTooLarge",
      insertedCount: 42
    });
    context.fireMarker({
      version: 1,
      editId: "new-gap",
      sequence: 1,
      status: "skipped",
      reason: "fileTooLarge",
      insertedCount: 7
    });
    assert.deepStrictEqual(context.service.takeCoverageGap(context.resource), {
      editCount: 1,
      insertedCount: 7
    });
  });
  test("matches a connected Agent marker chain to one reload", () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    context.fireMarker(marker(1, "a", "ab"));
    context.fireMarker(marker(2, "ab", "abc"));
    const observation = correlation.register("a", "abc");
    assert.deepStrictEqual({
      suppressed: correlation.isSuppressed(observation),
      suppressedIds: context.suppressedIds
    }, {
      suppressed: true,
      suppressedIds: [observation]
    });
  });
  test("does not reuse a completed Agent content cycle", () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    context.fireMarker(marker(1, "a", "ab"));
    context.fireMarker(marker(2, "ab", "a"));
    const unrelatedObservation = correlation.register("a", "ab");
    assert.deepStrictEqual({
      suppressed: correlation.isSuppressed(unrelatedObservation),
      suppressedIds: context.suppressedIds
    }, {
      suppressed: false,
      suppressedIds: []
    });
  });
  test("uses metadata from the matching repeated digest cycle", () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    context.fireMarker(marker(1, "a", "ab", {
      modelId: "old-model",
      conversationId: "old-session",
      requestId: "old-turn",
      harness: "copilotcli"
    }));
    context.fireMarker(marker(2, "ab", "a", {
      modelId: "old-model",
      conversationId: "old-session",
      requestId: "old-turn",
      harness: "copilotcli"
    }));
    context.fireMarker(marker(3, "a", "ab", {
      modelId: "new-model",
      conversationId: "new-session",
      requestId: "new-turn",
      harness: "claude"
    }));
    const observation = correlation.register("a", "ab");
    const resolution = correlation.getResolution?.(observation);
    assert.deepStrictEqual({
      sourceKey: resolution?.source?.toKey(1),
      sessionId: resolution?.source?.props.$$sessionId,
      requestId: resolution?.source?.props.$$requestId
    }, {
      sourceKey: "source:Chat.applyEdits-$modelId:new-model-$harness:claude-$origin:agentHost",
      sessionId: "new-session",
      requestId: "new-turn"
    });
  });
  test("invalidates old suppressions when the Agent Host sequence restarts", () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    context.fireMarker(marker(5, "a", "ab"));
    const oldObservation = correlation.register("a", "ab");
    context.fireMarker(marker(1, "ab", "abc"));
    const newObservation = correlation.register("ab", "abc");
    assert.deepStrictEqual({
      oldSuppressed: correlation.isSuppressed(oldObservation),
      newSuppressed: correlation.isSuppressed(newObservation),
      invalidatedIds: context.invalidatedIds
    }, {
      oldSuppressed: false,
      newSuppressed: true,
      invalidatedIds: [oldObservation]
    });
  });
  test("does not suppress with an expired marker", () => runWithFakedTimers({}, async () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    context.fireMarker(marker(1, "a", "ab"));
    await timeout(5 * 60 * 1e3 + 1);
    const observation = correlation.register("a", "ab");
    assert.strictEqual(correlation.isSuppressed(observation), false);
  }));
  test("does not coordinate with an expired route", () => runWithFakedTimers({}, async () => {
    const context = createContext();
    const correlation = context.service.createCorrelation(context.resource);
    context.fireMarker(marker(1, "a", "ab"));
    const observation = correlation.register("a", "ab");
    await timeout(10 * 60 * 60 * 1e3 + 1);
    const prepared = await context.service.prepareFlush(context.resource, "hashChange", "stats-1", false);
    assert.deepStrictEqual({
      prepared,
      suppressed: correlation.isSuppressed(observation),
      invalidatedIds: context.invalidatedIds,
      resourceReads: context.resourceReads
    }, {
      prepared: void 0,
      suppressed: false,
      invalidatedIds: [observation],
      resourceReads: []
    });
  }));
  test("matches ambient remote model URIs to Agent Host file markers", () => {
    const context = createContext();
    const remoteResource = URI.from({
      scheme: Schemas.vscodeRemote,
      authority: "ssh-remote+example",
      path: context.resource.path
    });
    const correlation = context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const observation = correlation.register("a", "ab");
    assert.strictEqual(correlation.isSuppressed(observation), true);
  });
  test("coordinates flushes through a non-ambient remote connection", async () => {
    const context = createContext({ isAmbient: false, authority: "remote-one" });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const prepared = await context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    await prepared?.commit(5);
    assert.deepStrictEqual({
      prepared: prepared && {
        flushTokenLength: prepared.flushToken.length,
        agentModifiedCount: prepared.agentModifiedCount
      },
      resourceReads: context.resourceReads
    }, {
      prepared: {
        flushTokenLength: 36,
        agentModifiedCount: 2
      },
      resourceReads: ["/prepare", "/commit"]
    });
  });
  test("waits for the prepared Agent marker before coordinating", async () => {
    const context = createContext({ isAmbient: false, authority: "remote-one", prepareSequence: 2 });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const prepare = context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    await timeout(0);
    context.fireMarker(marker(2, "ab", "abc"));
    const prepared = await prepare;
    assert.deepStrictEqual({
      agentModifiedCount: prepared?.agentModifiedCount,
      resourceReads: context.resourceReads
    }, {
      agentModifiedCount: 2,
      resourceReads: ["/prepare"]
    });
  });
  test("cancels a prepared flush when the commit transport fails", async () => {
    const context = createContext({ isAmbient: false, authority: "remote-one", failCommit: true });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const prepared = await context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    await assert.rejects(() => prepared.commit(5), (error) => error instanceof AgentHostEditAttributionDeferredError);
    assert.deepStrictEqual(context.resourceReads, ["/prepare", "/commit", "/cancel"]);
  });
  test("times out a stalled prepare request", () => runWithFakedTimers({}, async () => {
    const context = createContext({ isAmbient: false, authority: "remote-one", stalledResources: ["/prepare"] });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const result = context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    await timeout(15001);
    await assert.rejects(result, (error) => error instanceof AgentHostEditAttributionDeferredError);
    assert.deepStrictEqual(context.resourceReads, ["/prepare", "/cancel"]);
  }));
  test("uses a committed cancellation result after prepare fails", async () => {
    const context = createContext({
      isAmbient: false,
      authority: "remote-one",
      failPrepare: true,
      cancelOutcome: "committed"
    });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const prepared = await context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    await prepared.commit(5);
    assert.deepStrictEqual({
      agentModifiedCount: prepared?.agentModifiedCount,
      resourceReads: context.resourceReads
    }, {
      agentModifiedCount: 2,
      resourceReads: ["/prepare", "/cancel"]
    });
  });
  test("waits for the full recovered flush cutoff before acknowledging coverage", () => runWithFakedTimers({}, async () => {
    const context = createContext({
      isAmbient: false,
      authority: "remote-one",
      failPrepare: true,
      cancelOutcome: "committed",
      cancelLastSequence: 1,
      cancelStandaloneCoverageGapAcknowledgements: [{
        id: "ack-1",
        sequences: [1],
        editCount: 1,
        insertedCount: 42
      }]
    });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(0, "a", "ab"));
    const prepare = context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    await timeout(0);
    context.fireMarker({
      version: 1,
      editId: "edit-skipped",
      sequence: 1,
      status: "skipped",
      reason: "fileTooLarge",
      insertedCount: 42
    });
    const prepared = await prepare;
    assert.deepStrictEqual({
      deferCoverageGap: prepared?.deferCoverageGap,
      coverageGap: context.service.takeCoverageGap(remoteResource)
    }, {
      deferCoverageGap: false,
      coverageGap: void 0
    });
  }));
  test("cancels a malformed prepared response", async () => {
    const context = createContext({
      isAmbient: false,
      authority: "remote-one",
      prepareResponse: "{"
    });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const result = context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    await assert.rejects(result, (error) => error instanceof AgentHostEditAttributionDeferredError);
    assert.deepStrictEqual(context.resourceReads, ["/prepare", "/cancel"]);
  });
  test("cancels a prepared response with an unexpected token", async () => {
    const context = createContext({
      isAmbient: false,
      authority: "remote-one",
      prepareResponse: JSON.stringify({ flushToken: "unexpected", agentModifiedCount: 2 })
    });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const result = context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    await assert.rejects(result, (error) => error instanceof AgentHostEditAttributionDeferredError);
    assert.deepStrictEqual(context.resourceReads, ["/prepare", "/cancel"]);
  });
  test("rejects standalone acknowledgements beyond the prepared sequence", async () => {
    const context = createContext({
      prepareSequence: 1,
      standaloneCoverageGapAcknowledgements: [{
        id: "ack-1",
        sequences: [2],
        editCount: 1,
        insertedCount: 42
      }]
    });
    context.fireMarker(marker(1, "a", "ab"));
    const result = context.service.prepareFlush(context.resource, "hashChange", "stats-1", false);
    await assert.rejects(result, (error) => error instanceof AgentHostEditAttributionDeferredError);
    assert.deepStrictEqual(context.resourceReads, ["/prepare", "/cancel"]);
  });
  test("times out a stalled commit request and cancels the flush", () => runWithFakedTimers({}, async () => {
    const context = createContext({ isAmbient: false, authority: "remote-one", stalledResources: ["/commit"] });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const prepared = await context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    const result = prepared.commit(5);
    await timeout(15001);
    await assert.rejects(result, (error) => error instanceof AgentHostEditAttributionDeferredError);
    assert.deepStrictEqual(context.resourceReads, ["/prepare", "/commit", "/cancel"]);
  }));
  test("accepts a commit that completed before cancellation", async () => {
    const context = createContext({ isAmbient: false, authority: "remote-one", failCommit: true, cancelOutcome: "committed" });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const prepared = await context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    await prepared.commit(5);
    assert.deepStrictEqual(context.resourceReads, ["/prepare", "/commit", "/cancel"]);
  });
  test("does not fall back when commit and cancellation outcomes are unknown", () => runWithFakedTimers({}, async () => {
    const context = createContext({
      isAmbient: false,
      authority: "remote-one",
      stalledResources: ["/commit", "/cancel"]
    });
    const remoteResource = toAgentHostUri(context.resource, "remote-one");
    context.service.createCorrelation(remoteResource);
    context.fireMarker(marker(1, "a", "ab"));
    const prepared = await context.service.prepareFlush(remoteResource, "hashChange", "stats-1", false);
    const result = prepared.commit(5);
    await timeout(15001);
    await timeout(15001);
    await assert.rejects(result, /outcome is unknown/);
  }));
  function createContext(options = {}) {
    const {
      isAmbient = true,
      authority = "local",
      failPrepare = false,
      failCommit = false,
      stalledResources = [],
      cancelOutcome = "cancelled",
      prepareResponse,
      prepareSequence,
      standaloneCoverageGapAcknowledgements,
      cancelStandaloneCoverageGapAcknowledgements,
      cancelLastSequence
    } = options;
    const actionEmitter = disposables.add(new Emitter());
    const resourceReads = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    const connection = instantiationService.stub(IAgentHostService, {
      onDidAction: actionEmitter.event,
      async resourceRead(resource2) {
        resourceReads.push(resource2.path);
        if (stalledResources.includes(resource2.path)) {
          return new Promise(() => {
          });
        }
        if (failPrepare && resource2.path === "/prepare") {
          throw new Error("Prepare failed");
        }
        if (failCommit && resource2.path === "/commit") {
          throw new Error("Commit failed");
        }
        const request = parseEditAttributionResource(resource2);
        return {
          data: resource2.path === "/prepare" ? prepareResponse ?? JSON.stringify({
            flushToken: request?.kind === "prepare" ? request.params.flushToken : "",
            agentModifiedCount: 2,
            lastSequence: prepareSequence,
            standaloneCoverageGapAcknowledgements
          }) : JSON.stringify({
            outcome: resource2.path === "/commit" ? "committed" : cancelOutcome,
            agentModifiedCount: resource2.path === "/commit" || cancelOutcome === "committed" ? 2 : 0,
            lastSequence: resource2.path === "/cancel" ? cancelLastSequence : void 0,
            standaloneCoverageGapAcknowledgements: resource2.path === "/cancel" ? cancelStandaloneCoverageGapAcknowledgements : void 0
          }),
          encoding: ContentEncoding.Utf8
        };
      }
    });
    instantiationService.stub(IAgentHostConnectionsService, {
      onDidChangeConnections: Event.None,
      connections: [{
        authority,
        address: isAmbient ? void 0 : "remote",
        name: isAmbient ? "Local" : "Remote",
        isAmbient,
        connection
      }]
    });
    instantiationService.stub(IUriIdentityService, { extUri, asCanonicalUri: (resource2) => resource2 });
    const service = disposables.add(instantiationService.createInstance(AgentHostEditMarkerService));
    const resource = URI.file("C:\\repo\\file.ts");
    const suppressedIds = [];
    const invalidatedIds = [];
    const correlation = service.createCorrelation(resource);
    disposables.add(correlation.onDidSuppress((id) => suppressedIds.push(id)));
    disposables.add(correlation.onDidInvalidate((id) => invalidatedIds.push(id)));
    return {
      resource,
      service,
      suppressedIds,
      invalidatedIds,
      resourceReads,
      fireMarker(attribution) {
        this.fireRawMarker(attribution);
      },
      fireRawMarker(attribution) {
        const content = {
          type: ToolResultContentType.FileEdit,
          before: {
            uri: resource.toString(),
            content: { uri: "session-db:/before" }
          },
          after: {
            uri: resource.toString(),
            content: { uri: "session-db:/after" }
          }
        };
        Object.assign(content, { [FILE_EDIT_ATTRIBUTION_PROPERTY]: attribution });
        actionEmitter.fire({
          channel: "ahp-chat:copilot%3A%2Fsession",
          serverSeq: attribution.sequence,
          origin: void 0,
          action: {
            type: ActionType.ChatToolCallComplete,
            turnId: "turn-1",
            toolCallId: `tool-${attribution.sequence}`,
            result: {
              success: true,
              pastTenseMessage: "",
              content: [content]
            }
          }
        });
      }
    };
  }
});
function marker(sequence, before, after, source) {
  return {
    version: 1,
    editId: `edit-${sequence}`,
    sequence,
    beforeDigest: createFileEditContentDigest(before),
    afterDigest: createFileEditContentDigest(after),
    source
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVkaXRUZWxlbWV0cnlcXHRlc3RcXGJyb3dzZXJcXGFnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBleHRVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENvbm5lY3Rpb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHRvQWdlbnRIb3N0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgY3JlYXRlRmlsZUVkaXRDb250ZW50RGlnZXN0LCBFZGl0QXR0cmlidXRpb25GbHVzaE91dGNvbWUsIEZJTEVfRURJVF9BVFRSSUJVVElPTl9QUk9QRVJUWSwgSUVkaXRBdHRyaWJ1dGlvbkNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50LCBJRmlsZUVkaXRBdHRyaWJ1dGlvbk1hcmtlciwgcGFyc2VFZGl0QXR0cmlidXRpb25SZXNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vZmlsZUVkaXRBdHRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZW50RW5jb2RpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFjdGlvbkVudmVsb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBUb29sUmVzdWx0Q29udGVudFR5cGUsIFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvbkRlZmVycmVkRXJyb3IsIEFnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZWxlbWV0cnkvYWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UuanMnO1xuXG5zdWl0ZSgnQWdlbnQgSG9zdCBFZGl0IE1hcmtlciBTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3N1cHByZXNzZXMgbWFya2VyLWZpcnN0IGFuZCByZWxvYWQtZmlyc3Qgb2JzZXJ2YXRpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb250ZXh0KCk7XG5cdFx0Y29uc3QgY29ycmVsYXRpb24gPSBjb250ZXh0LnNlcnZpY2UuY3JlYXRlQ29ycmVsYXRpb24oY29udGV4dC5yZXNvdXJjZSk7XG5cblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdhJywgJ2FiJykpO1xuXHRcdGNvbnN0IG1hcmtlckZpcnN0ID0gY29ycmVsYXRpb24ucmVnaXN0ZXIoJ2EnLCAnYWInKTtcblx0XHRjb25zdCByZWxvYWRGaXJzdCA9IGNvcnJlbGF0aW9uLnJlZ2lzdGVyKCdhYicsICdhYmMnKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDIsICdhYicsICdhYmMnKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1hcmtlckZpcnN0OiBjb3JyZWxhdGlvbi5pc1N1cHByZXNzZWQobWFya2VyRmlyc3QpLFxuXHRcdFx0cmVsb2FkRmlyc3Q6IGNvcnJlbGF0aW9uLmlzU3VwcHJlc3NlZChyZWxvYWRGaXJzdCksXG5cdFx0XHRzdXBwcmVzc2VkSWRzOiBjb250ZXh0LnN1cHByZXNzZWRJZHMsXG5cdFx0fSwge1xuXHRcdFx0bWFya2VyRmlyc3Q6IHRydWUsXG5cdFx0XHRyZWxvYWRGaXJzdDogdHJ1ZSxcblx0XHRcdHN1cHByZXNzZWRJZHM6IFttYXJrZXJGaXJzdCwgcmVsb2FkRmlyc3RdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaGFyZXMgb25lIHJlc29sdmVkIGF0dHJpYnV0aW9uIHdpdGggYWxsIGFjdGl2ZSBjb25zdW1lcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZUNvbnRleHQoKTtcblx0XHRjb25zdCBjb3JyZWxhdGlvbiA9IGNvbnRleHQuc2VydmljZS5jcmVhdGVDb3JyZWxhdGlvbihjb250ZXh0LnJlc291cmNlKTtcblx0XHRjb25zdCBmaXJzdCA9IGNvcnJlbGF0aW9uLnJlZ2lzdGVyKCdhJywgJ2FiJyk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gY29ycmVsYXRpb24ucmVnaXN0ZXIoJ2EnLCAnYWInKTtcblx0XHRjb3JyZWxhdGlvbi5yZWxlYXNlKGZpcnN0KTtcblxuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMSwgJ2EnLCAnYWInLCB7XG5cdFx0XHRtb2RlbElkOiAnZ3B0LTUnLFxuXHRcdFx0Y29udmVyc2F0aW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0cmVxdWVzdElkOiAndHVybi0xJyxcblx0XHRcdGhhcm5lc3M6ICdjb3BpbG90Y2xpJyxcblx0XHR9KSk7XG5cblx0XHRjb25zdCByZXNvbHV0aW9uID0gY29ycmVsYXRpb24uZ2V0UmVzb2x1dGlvbj8uKHNlY29uZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzaGFyZWRPYnNlcnZhdGlvbjogZmlyc3QgPT09IHNlY29uZCxcblx0XHRcdHN1cHByZXNzZWQ6IGNvcnJlbGF0aW9uLmlzU3VwcHJlc3NlZChzZWNvbmQpLFxuXHRcdFx0c291cmNlS2V5OiByZXNvbHV0aW9uPy5zb3VyY2U/LnRvS2V5KDEpLFxuXHRcdFx0c2Vzc2lvbklkOiByZXNvbHV0aW9uPy5zb3VyY2U/LnByb3BzLiQkc2Vzc2lvbklkLFxuXHRcdFx0cmVxdWVzdElkOiByZXNvbHV0aW9uPy5zb3VyY2U/LnByb3BzLiQkcmVxdWVzdElkLFxuXHRcdH0sIHtcblx0XHRcdHNoYXJlZE9ic2VydmF0aW9uOiB0cnVlLFxuXHRcdFx0c3VwcHJlc3NlZDogdHJ1ZSxcblx0XHRcdHNvdXJjZUtleTogJ3NvdXJjZTpDaGF0LmFwcGx5RWRpdHMtJG1vZGVsSWQ6Z3B0LTUtJGhhcm5lc3M6Y29waWxvdGNsaS0kb3JpZ2luOmFnZW50SG9zdCcsXG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0cmVxdWVzdElkOiAndHVybi0xJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVjb3JkcyBvdmVyc2l6ZWQgQWdlbnQgZWRpdHMgYXMgY292ZXJhZ2UgZ2FwcyB3aXRob3V0IHN1cHByZXNzaW5nIHJlbG9hZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZUNvbnRleHQoKTtcblx0XHRjb25zdCBjb3JyZWxhdGlvbiA9IGNvbnRleHQuc2VydmljZS5jcmVhdGVDb3JyZWxhdGlvbihjb250ZXh0LnJlc291cmNlKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIoe1xuXHRcdFx0dmVyc2lvbjogMSxcblx0XHRcdGVkaXRJZDogJ2VkaXQtc2tpcHBlZCcsXG5cdFx0XHRzZXF1ZW5jZTogMSxcblx0XHRcdHN0YXR1czogJ3NraXBwZWQnLFxuXHRcdFx0cmVhc29uOiAnZmlsZVRvb0xhcmdlJyxcblx0XHRcdGluc2VydGVkQ291bnQ6IDQyLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgb2JzZXJ2YXRpb24gPSBjb3JyZWxhdGlvbi5yZWdpc3RlcignYScsICdhYicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdXBwcmVzc2VkOiBjb3JyZWxhdGlvbi5pc1N1cHByZXNzZWQob2JzZXJ2YXRpb24pLFxuXHRcdFx0Y292ZXJhZ2VHYXA6IGNvbnRleHQuc2VydmljZS50YWtlQ292ZXJhZ2VHYXAoY29udGV4dC5yZXNvdXJjZSksXG5cdFx0fSwge1xuXHRcdFx0c3VwcHJlc3NlZDogZmFsc2UsXG5cdFx0XHRjb3ZlcmFnZUdhcDoge1xuXHRcdFx0XHRlZGl0Q291bnQ6IDEsXG5cdFx0XHRcdGluc2VydGVkQ291bnQ6IDQyLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBudWxsIG1hcmtlciBzb3VyY2UgbWV0YWRhdGEgd2l0aG91dCBkaXNydXB0aW5nIGFjdGlvbiBwcm9jZXNzaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb250ZXh0KCk7XG5cdFx0Y29uc3QgY29ycmVsYXRpb24gPSBjb250ZXh0LnNlcnZpY2UuY3JlYXRlQ29ycmVsYXRpb24oY29udGV4dC5yZXNvdXJjZSk7XG5cdFx0Y29uc3Qgb2JzZXJ2YXRpb24gPSBjb3JyZWxhdGlvbi5yZWdpc3RlcignYScsICdhYicpO1xuXG5cdFx0Y29uc3QgbWFsZm9ybWVkTWFya2VyID0ge1xuXHRcdFx0dmVyc2lvbjogMSxcblx0XHRcdGVkaXRJZDogJ2VkaXQtbnVsbC1zb3VyY2UnLFxuXHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0XHRiZWZvcmVEaWdlc3Q6IGNyZWF0ZUZpbGVFZGl0Q29udGVudERpZ2VzdCgnYScpLFxuXHRcdFx0YWZ0ZXJEaWdlc3Q6IGNyZWF0ZUZpbGVFZGl0Q29udGVudERpZ2VzdCgnYWInKSxcblx0XHRcdHNvdXJjZTogbnVsbCxcblx0XHR9O1xuXHRcdGNvbnRleHQuZmlyZVJhd01hcmtlcihtYWxmb3JtZWRNYXJrZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvcnJlbGF0aW9uLmlzU3VwcHJlc3NlZChvYnNlcnZhdGlvbiksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZXZpY3QgYWN0aXZlIG9ic2VydmF0aW9ucyB3aGVuIHRoZSBjYXAgaXMgcmVhY2hlZCcsICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCgpO1xuXHRcdGNvbnN0IGNvcnJlbGF0aW9uID0gY29udGV4dC5zZXJ2aWNlLmNyZWF0ZUNvcnJlbGF0aW9uKGNvbnRleHQucmVzb3VyY2UpO1xuXHRcdGNvbnN0IGZpcnN0ID0gY29ycmVsYXRpb24ucmVnaXN0ZXIoJ2JlZm9yZS0wJywgJ2FmdGVyLTAnKTtcblx0XHRmb3IgKGxldCBpbmRleCA9IDE7IGluZGV4IDw9IDEyODsgaW5kZXgrKykge1xuXHRcdFx0Y29ycmVsYXRpb24ucmVnaXN0ZXIoYGJlZm9yZS0ke2luZGV4fWAsIGBhZnRlci0ke2luZGV4fWApO1xuXHRcdH1cblxuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMSwgJ2JlZm9yZS0wJywgJ2FmdGVyLTAnKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpcnN0U3VwcHJlc3NlZDogY29ycmVsYXRpb24uaXNTdXBwcmVzc2VkKGZpcnN0KSxcblx0XHRcdHN1cHByZXNzZWRJZHM6IGNvbnRleHQuc3VwcHJlc3NlZElkcyxcblx0XHR9LCB7XG5cdFx0XHRmaXJzdFN1cHByZXNzZWQ6IHRydWUsXG5cdFx0XHRzdXBwcmVzc2VkSWRzOiBbZmlyc3RdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBtYXRjaCBhbiBvYnNlcnZhdGlvbiBhZnRlciBpdHMgbWFya2VyIFRUTCBleHBpcmVzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZUNvbnRleHQoKTtcblx0XHRjb25zdCBjb3JyZWxhdGlvbiA9IGNvbnRleHQuc2VydmljZS5jcmVhdGVDb3JyZWxhdGlvbihjb250ZXh0LnJlc291cmNlKTtcblx0XHRjb25zdCBvYnNlcnZhdGlvbiA9IGNvcnJlbGF0aW9uLnJlZ2lzdGVyKCdhJywgJ2FiJyk7XG5cdFx0YXdhaXQgdGltZW91dCg1ICogNjAgKiAxMDAwICsgMSk7XG5cblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdhJywgJ2FiJykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvcnJlbGF0aW9uLmlzU3VwcHJlc3NlZChvYnNlcnZhdGlvbiksIGZhbHNlKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JlY292ZXJzIG9ic2VydmF0aW9uIGNhcGFjaXR5IGFmdGVyIHVucmVzb2x2ZWQgb2JzZXJ2YXRpb25zIGV4cGlyZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb250ZXh0KCk7XG5cdFx0Y29uc3QgY29ycmVsYXRpb24gPSBjb250ZXh0LnNlcnZpY2UuY3JlYXRlQ29ycmVsYXRpb24oY29udGV4dC5yZXNvdXJjZSk7XG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IDEyODsgaW5kZXgrKykge1xuXHRcdFx0Y29ycmVsYXRpb24ucmVnaXN0ZXIoYGJlZm9yZS0ke2luZGV4fWAsIGBhZnRlci0ke2luZGV4fWApO1xuXHRcdH1cblx0XHRhd2FpdCB0aW1lb3V0KDUgKiA2MCAqIDEwMDAgKyAxKTtcblxuXHRcdGNvbnN0IG9ic2VydmF0aW9uID0gY29ycmVsYXRpb24ucmVnaXN0ZXIoJ2N1cnJlbnQtYmVmb3JlJywgJ2N1cnJlbnQtYWZ0ZXInKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdjdXJyZW50LWJlZm9yZScsICdjdXJyZW50LWFmdGVyJykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvcnJlbGF0aW9uLmlzU3VwcHJlc3NlZChvYnNlcnZhdGlvbiksIHRydWUpO1xuXHR9KSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVwb3J0IGV4cGlyZWQgY292ZXJhZ2UgZ2FwcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb250ZXh0KCk7XG5cdFx0Y29udGV4dC5maXJlTWFya2VyKHtcblx0XHRcdHZlcnNpb246IDEsXG5cdFx0XHRlZGl0SWQ6ICdlZGl0LXNraXBwZWQnLFxuXHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0XHRzdGF0dXM6ICdza2lwcGVkJyxcblx0XHRcdHJlYXNvbjogJ2ZpbGVUb29MYXJnZScsXG5cdFx0XHRpbnNlcnRlZENvdW50OiA0Mixcblx0XHR9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwICogNjAgKiA2MCAqIDEwMDAgKyAxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0LnNlcnZpY2UudGFrZUNvdmVyYWdlR2FwKGNvbnRleHQucmVzb3VyY2UpLCB1bmRlZmluZWQpO1xuXHR9KSk7XG5cblx0dGVzdCgndGFrZXMgY292ZXJhZ2UgZ2FwcyBvbmx5IHRocm91Z2ggdGhlIGNvb3JkaW5hdGVkIHNlcXVlbmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb250ZXh0KCk7XG5cdFx0Y29udGV4dC5maXJlTWFya2VyKHtcblx0XHRcdHZlcnNpb246IDEsXG5cdFx0XHRlZGl0SWQ6ICdnYXAtMScsXG5cdFx0XHRzZXF1ZW5jZTogMSxcblx0XHRcdHN0YXR1czogJ3NraXBwZWQnLFxuXHRcdFx0cmVhc29uOiAnZmlsZVRvb0xhcmdlJyxcblx0XHRcdGluc2VydGVkQ291bnQ6IDEwLFxuXHRcdH0pO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcih7XG5cdFx0XHR2ZXJzaW9uOiAxLFxuXHRcdFx0ZWRpdElkOiAnZ2FwLTInLFxuXHRcdFx0c2VxdWVuY2U6IDIsXG5cdFx0XHRzdGF0dXM6ICdza2lwcGVkJyxcblx0XHRcdHJlYXNvbjogJ2ZpbGVUb29MYXJnZScsXG5cdFx0XHRpbnNlcnRlZENvdW50OiAyMCxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Zmlyc3Q6IGNvbnRleHQuc2VydmljZS50YWtlQ292ZXJhZ2VHYXAoY29udGV4dC5yZXNvdXJjZSwgMSksXG5cdFx0XHRyZW1haW5pbmc6IGNvbnRleHQuc2VydmljZS50YWtlQ292ZXJhZ2VHYXAoY29udGV4dC5yZXNvdXJjZSksXG5cdFx0fSwge1xuXHRcdFx0Zmlyc3Q6IHsgZWRpdENvdW50OiAxLCBpbnNlcnRlZENvdW50OiAxMCB9LFxuXHRcdFx0cmVtYWluaW5nOiB7IGVkaXRDb3VudDogMSwgaW5zZXJ0ZWRDb3VudDogMjAgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIG1vcmUgdGhhbiAxMjggcGVuZGluZyBjb3ZlcmFnZSBnYXBzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb250ZXh0KCk7XG5cdFx0Zm9yIChsZXQgc2VxdWVuY2UgPSAxOyBzZXF1ZW5jZSA8PSAxMjk7IHNlcXVlbmNlKyspIHtcblx0XHRcdGNvbnRleHQuZmlyZU1hcmtlcih7XG5cdFx0XHRcdHZlcnNpb246IDEsXG5cdFx0XHRcdGVkaXRJZDogYGdhcC0ke3NlcXVlbmNlfWAsXG5cdFx0XHRcdHNlcXVlbmNlLFxuXHRcdFx0XHRzdGF0dXM6ICdza2lwcGVkJyxcblx0XHRcdFx0cmVhc29uOiAnZmlsZVRvb0xhcmdlJyxcblx0XHRcdFx0aW5zZXJ0ZWRDb3VudDogc2VxdWVuY2UsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQuc2VydmljZS50YWtlQ292ZXJhZ2VHYXAoY29udGV4dC5yZXNvdXJjZSksIHtcblx0XHRcdGVkaXRDb3VudDogMTI5LFxuXHRcdFx0aW5zZXJ0ZWRDb3VudDogMTI5ICogMTMwIC8gMixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVwb3J0IHN0YW5kYWxvbmUtZW1pdHRlZCBjb3ZlcmFnZSBnYXBzIGluIGEgbGF0ZXIgd29ya2JlbmNoIGZsdXNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb250ZXh0KHtcblx0XHRcdHByZXBhcmVTZXF1ZW5jZTogMixcblx0XHRcdHN0YW5kYWxvbmVDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHM6IFt7XG5cdFx0XHRcdGlkOiAnYWNrLTEnLFxuXHRcdFx0XHRzZXF1ZW5jZXM6IFsxXSxcblx0XHRcdFx0ZWRpdENvdW50OiAxLFxuXHRcdFx0XHRpbnNlcnRlZENvdW50OiA0Mixcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcih7XG5cdFx0XHR2ZXJzaW9uOiAxLFxuXHRcdFx0ZWRpdElkOiAnZWRpdC1za2lwcGVkLTEnLFxuXHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0XHRzdGF0dXM6ICdza2lwcGVkJyxcblx0XHRcdHJlYXNvbjogJ2ZpbGVUb29MYXJnZScsXG5cdFx0XHRpbnNlcnRlZENvdW50OiA0Mixcblx0XHR9KTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIoe1xuXHRcdFx0dmVyc2lvbjogMSxcblx0XHRcdGVkaXRJZDogJ2VkaXQtc2tpcHBlZC0yJyxcblx0XHRcdHNlcXVlbmNlOiAyLFxuXHRcdFx0c3RhdHVzOiAnc2tpcHBlZCcsXG5cdFx0XHRyZWFzb246ICdmaWxlVG9vTGFyZ2UnLFxuXHRcdFx0aW5zZXJ0ZWRDb3VudDogNyxcblx0XHR9KTtcblxuXHRcdGF3YWl0IGNvbnRleHQuc2VydmljZS5wcmVwYXJlRmx1c2goY29udGV4dC5yZXNvdXJjZSwgJ2hhc2hDaGFuZ2UnLCAnc3RhdHMtMScsIGZhbHNlKTtcblx0XHRhd2FpdCBjb250ZXh0LnNlcnZpY2UucHJlcGFyZUZsdXNoKGNvbnRleHQucmVzb3VyY2UsICdoYXNoQ2hhbmdlJywgJ3N0YXRzLTInLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQuc2VydmljZS50YWtlQ292ZXJhZ2VHYXAoY29udGV4dC5yZXNvdXJjZSksIHtcblx0XHRcdGVkaXRDb3VudDogMSxcblx0XHRcdGluc2VydGVkQ291bnQ6IDcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFycyBjb3ZlcmFnZSBnYXBzIGZyb20gYSByZXN0YXJ0ZWQgQWdlbnQgSG9zdCBzZXF1ZW5jZScsICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCgpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcih7XG5cdFx0XHR2ZXJzaW9uOiAxLFxuXHRcdFx0ZWRpdElkOiAnb2xkLWdhcCcsXG5cdFx0XHRzZXF1ZW5jZTogMSxcblx0XHRcdHN0YXR1czogJ3NraXBwZWQnLFxuXHRcdFx0cmVhc29uOiAnZmlsZVRvb0xhcmdlJyxcblx0XHRcdGluc2VydGVkQ291bnQ6IDQyLFxuXHRcdH0pO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcih7XG5cdFx0XHR2ZXJzaW9uOiAxLFxuXHRcdFx0ZWRpdElkOiAnbmV3LWdhcCcsXG5cdFx0XHRzZXF1ZW5jZTogMSxcblx0XHRcdHN0YXR1czogJ3NraXBwZWQnLFxuXHRcdFx0cmVhc29uOiAnZmlsZVRvb0xhcmdlJyxcblx0XHRcdGluc2VydGVkQ291bnQ6IDcsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQuc2VydmljZS50YWtlQ292ZXJhZ2VHYXAoY29udGV4dC5yZXNvdXJjZSksIHtcblx0XHRcdGVkaXRDb3VudDogMSxcblx0XHRcdGluc2VydGVkQ291bnQ6IDcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hdGNoZXMgYSBjb25uZWN0ZWQgQWdlbnQgbWFya2VyIGNoYWluIHRvIG9uZSByZWxvYWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZUNvbnRleHQoKTtcblx0XHRjb25zdCBjb3JyZWxhdGlvbiA9IGNvbnRleHQuc2VydmljZS5jcmVhdGVDb3JyZWxhdGlvbihjb250ZXh0LnJlc291cmNlKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdhJywgJ2FiJykpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMiwgJ2FiJywgJ2FiYycpKTtcblxuXHRcdGNvbnN0IG9ic2VydmF0aW9uID0gY29ycmVsYXRpb24ucmVnaXN0ZXIoJ2EnLCAnYWJjJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN1cHByZXNzZWQ6IGNvcnJlbGF0aW9uLmlzU3VwcHJlc3NlZChvYnNlcnZhdGlvbiksXG5cdFx0XHRzdXBwcmVzc2VkSWRzOiBjb250ZXh0LnN1cHByZXNzZWRJZHMsXG5cdFx0fSwge1xuXHRcdFx0c3VwcHJlc3NlZDogdHJ1ZSxcblx0XHRcdHN1cHByZXNzZWRJZHM6IFtvYnNlcnZhdGlvbl0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJldXNlIGEgY29tcGxldGVkIEFnZW50IGNvbnRlbnQgY3ljbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZUNvbnRleHQoKTtcblx0XHRjb25zdCBjb3JyZWxhdGlvbiA9IGNvbnRleHQuc2VydmljZS5jcmVhdGVDb3JyZWxhdGlvbihjb250ZXh0LnJlc291cmNlKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdhJywgJ2FiJykpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMiwgJ2FiJywgJ2EnKSk7XG5cblx0XHRjb25zdCB1bnJlbGF0ZWRPYnNlcnZhdGlvbiA9IGNvcnJlbGF0aW9uLnJlZ2lzdGVyKCdhJywgJ2FiJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN1cHByZXNzZWQ6IGNvcnJlbGF0aW9uLmlzU3VwcHJlc3NlZCh1bnJlbGF0ZWRPYnNlcnZhdGlvbiksXG5cdFx0XHRzdXBwcmVzc2VkSWRzOiBjb250ZXh0LnN1cHByZXNzZWRJZHMsXG5cdFx0fSwge1xuXHRcdFx0c3VwcHJlc3NlZDogZmFsc2UsXG5cdFx0XHRzdXBwcmVzc2VkSWRzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBtZXRhZGF0YSBmcm9tIHRoZSBtYXRjaGluZyByZXBlYXRlZCBkaWdlc3QgY3ljbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZUNvbnRleHQoKTtcblx0XHRjb25zdCBjb3JyZWxhdGlvbiA9IGNvbnRleHQuc2VydmljZS5jcmVhdGVDb3JyZWxhdGlvbihjb250ZXh0LnJlc291cmNlKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdhJywgJ2FiJywge1xuXHRcdFx0bW9kZWxJZDogJ29sZC1tb2RlbCcsXG5cdFx0XHRjb252ZXJzYXRpb25JZDogJ29sZC1zZXNzaW9uJyxcblx0XHRcdHJlcXVlc3RJZDogJ29sZC10dXJuJyxcblx0XHRcdGhhcm5lc3M6ICdjb3BpbG90Y2xpJyxcblx0XHR9KSk7XG5cdFx0Y29udGV4dC5maXJlTWFya2VyKG1hcmtlcigyLCAnYWInLCAnYScsIHtcblx0XHRcdG1vZGVsSWQ6ICdvbGQtbW9kZWwnLFxuXHRcdFx0Y29udmVyc2F0aW9uSWQ6ICdvbGQtc2Vzc2lvbicsXG5cdFx0XHRyZXF1ZXN0SWQ6ICdvbGQtdHVybicsXG5cdFx0XHRoYXJuZXNzOiAnY29waWxvdGNsaScsXG5cdFx0fSkpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMywgJ2EnLCAnYWInLCB7XG5cdFx0XHRtb2RlbElkOiAnbmV3LW1vZGVsJyxcblx0XHRcdGNvbnZlcnNhdGlvbklkOiAnbmV3LXNlc3Npb24nLFxuXHRcdFx0cmVxdWVzdElkOiAnbmV3LXR1cm4nLFxuXHRcdFx0aGFybmVzczogJ2NsYXVkZScsXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgb2JzZXJ2YXRpb24gPSBjb3JyZWxhdGlvbi5yZWdpc3RlcignYScsICdhYicpO1xuXHRcdGNvbnN0IHJlc29sdXRpb24gPSBjb3JyZWxhdGlvbi5nZXRSZXNvbHV0aW9uPy4ob2JzZXJ2YXRpb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzb3VyY2VLZXk6IHJlc29sdXRpb24/LnNvdXJjZT8udG9LZXkoMSksXG5cdFx0XHRzZXNzaW9uSWQ6IHJlc29sdXRpb24/LnNvdXJjZT8ucHJvcHMuJCRzZXNzaW9uSWQsXG5cdFx0XHRyZXF1ZXN0SWQ6IHJlc29sdXRpb24/LnNvdXJjZT8ucHJvcHMuJCRyZXF1ZXN0SWQsXG5cdFx0fSwge1xuXHRcdFx0c291cmNlS2V5OiAnc291cmNlOkNoYXQuYXBwbHlFZGl0cy0kbW9kZWxJZDpuZXctbW9kZWwtJGhhcm5lc3M6Y2xhdWRlLSRvcmlnaW46YWdlbnRIb3N0Jyxcblx0XHRcdHNlc3Npb25JZDogJ25ldy1zZXNzaW9uJyxcblx0XHRcdHJlcXVlc3RJZDogJ25ldy10dXJuJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZGF0ZXMgb2xkIHN1cHByZXNzaW9ucyB3aGVuIHRoZSBBZ2VudCBIb3N0IHNlcXVlbmNlIHJlc3RhcnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb250ZXh0KCk7XG5cdFx0Y29uc3QgY29ycmVsYXRpb24gPSBjb250ZXh0LnNlcnZpY2UuY3JlYXRlQ29ycmVsYXRpb24oY29udGV4dC5yZXNvdXJjZSk7XG5cdFx0Y29udGV4dC5maXJlTWFya2VyKG1hcmtlcig1LCAnYScsICdhYicpKTtcblx0XHRjb25zdCBvbGRPYnNlcnZhdGlvbiA9IGNvcnJlbGF0aW9uLnJlZ2lzdGVyKCdhJywgJ2FiJyk7XG5cblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdhYicsICdhYmMnKSk7XG5cdFx0Y29uc3QgbmV3T2JzZXJ2YXRpb24gPSBjb3JyZWxhdGlvbi5yZWdpc3RlcignYWInLCAnYWJjJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG9sZFN1cHByZXNzZWQ6IGNvcnJlbGF0aW9uLmlzU3VwcHJlc3NlZChvbGRPYnNlcnZhdGlvbiksXG5cdFx0XHRuZXdTdXBwcmVzc2VkOiBjb3JyZWxhdGlvbi5pc1N1cHByZXNzZWQobmV3T2JzZXJ2YXRpb24pLFxuXHRcdFx0aW52YWxpZGF0ZWRJZHM6IGNvbnRleHQuaW52YWxpZGF0ZWRJZHMsXG5cdFx0fSwge1xuXHRcdFx0b2xkU3VwcHJlc3NlZDogZmFsc2UsXG5cdFx0XHRuZXdTdXBwcmVzc2VkOiB0cnVlLFxuXHRcdFx0aW52YWxpZGF0ZWRJZHM6IFtvbGRPYnNlcnZhdGlvbl0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHN1cHByZXNzIHdpdGggYW4gZXhwaXJlZCBtYXJrZXInLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCgpO1xuXHRcdGNvbnN0IGNvcnJlbGF0aW9uID0gY29udGV4dC5zZXJ2aWNlLmNyZWF0ZUNvcnJlbGF0aW9uKGNvbnRleHQucmVzb3VyY2UpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMSwgJ2EnLCAnYWInKSk7XG5cdFx0YXdhaXQgdGltZW91dCg1ICogNjAgKiAxMDAwICsgMSk7XG5cblx0XHRjb25zdCBvYnNlcnZhdGlvbiA9IGNvcnJlbGF0aW9uLnJlZ2lzdGVyKCdhJywgJ2FiJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ycmVsYXRpb24uaXNTdXBwcmVzc2VkKG9ic2VydmF0aW9uKSwgZmFsc2UpO1xuXHR9KSk7XG5cblx0dGVzdCgnZG9lcyBub3QgY29vcmRpbmF0ZSB3aXRoIGFuIGV4cGlyZWQgcm91dGUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCgpO1xuXHRcdGNvbnN0IGNvcnJlbGF0aW9uID0gY29udGV4dC5zZXJ2aWNlLmNyZWF0ZUNvcnJlbGF0aW9uKGNvbnRleHQucmVzb3VyY2UpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMSwgJ2EnLCAnYWInKSk7XG5cdFx0Y29uc3Qgb2JzZXJ2YXRpb24gPSBjb3JyZWxhdGlvbi5yZWdpc3RlcignYScsICdhYicpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTAgKiA2MCAqIDYwICogMTAwMCArIDEpO1xuXG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCBjb250ZXh0LnNlcnZpY2UucHJlcGFyZUZsdXNoKGNvbnRleHQucmVzb3VyY2UsICdoYXNoQ2hhbmdlJywgJ3N0YXRzLTEnLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByZXBhcmVkLFxuXHRcdFx0c3VwcHJlc3NlZDogY29ycmVsYXRpb24uaXNTdXBwcmVzc2VkKG9ic2VydmF0aW9uKSxcblx0XHRcdGludmFsaWRhdGVkSWRzOiBjb250ZXh0LmludmFsaWRhdGVkSWRzLFxuXHRcdFx0cmVzb3VyY2VSZWFkczogY29udGV4dC5yZXNvdXJjZVJlYWRzLFxuXHRcdH0sIHtcblx0XHRcdHByZXBhcmVkOiB1bmRlZmluZWQsXG5cdFx0XHRzdXBwcmVzc2VkOiBmYWxzZSxcblx0XHRcdGludmFsaWRhdGVkSWRzOiBbb2JzZXJ2YXRpb25dLFxuXHRcdFx0cmVzb3VyY2VSZWFkczogW10sXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdtYXRjaGVzIGFtYmllbnQgcmVtb3RlIG1vZGVsIFVSSXMgdG8gQWdlbnQgSG9zdCBmaWxlIG1hcmtlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZUNvbnRleHQoKTtcblx0XHRjb25zdCByZW1vdGVSZXNvdXJjZSA9IFVSSS5mcm9tKHtcblx0XHRcdHNjaGVtZTogU2NoZW1hcy52c2NvZGVSZW1vdGUsXG5cdFx0XHRhdXRob3JpdHk6ICdzc2gtcmVtb3RlK2V4YW1wbGUnLFxuXHRcdFx0cGF0aDogY29udGV4dC5yZXNvdXJjZS5wYXRoLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNvcnJlbGF0aW9uID0gY29udGV4dC5zZXJ2aWNlLmNyZWF0ZUNvcnJlbGF0aW9uKHJlbW90ZVJlc291cmNlKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdhJywgJ2FiJykpO1xuXG5cdFx0Y29uc3Qgb2JzZXJ2YXRpb24gPSBjb3JyZWxhdGlvbi5yZWdpc3RlcignYScsICdhYicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvcnJlbGF0aW9uLmlzU3VwcHJlc3NlZChvYnNlcnZhdGlvbiksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb29yZGluYXRlcyBmbHVzaGVzIHRocm91Z2ggYSBub24tYW1iaWVudCByZW1vdGUgY29ubmVjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCh7IGlzQW1iaWVudDogZmFsc2UsIGF1dGhvcml0eTogJ3JlbW90ZS1vbmUnIH0pO1xuXHRcdGNvbnN0IHJlbW90ZVJlc291cmNlID0gdG9BZ2VudEhvc3RVcmkoY29udGV4dC5yZXNvdXJjZSwgJ3JlbW90ZS1vbmUnKTtcblx0XHRjb250ZXh0LnNlcnZpY2UuY3JlYXRlQ29ycmVsYXRpb24ocmVtb3RlUmVzb3VyY2UpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMSwgJ2EnLCAnYWInKSk7XG5cblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IGNvbnRleHQuc2VydmljZS5wcmVwYXJlRmx1c2gocmVtb3RlUmVzb3VyY2UsICdoYXNoQ2hhbmdlJywgJ3N0YXRzLTEnLCBmYWxzZSk7XG5cdFx0YXdhaXQgcHJlcGFyZWQ/LmNvbW1pdCg1KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJlcGFyZWQ6IHByZXBhcmVkICYmIHtcblx0XHRcdFx0Zmx1c2hUb2tlbkxlbmd0aDogcHJlcGFyZWQuZmx1c2hUb2tlbi5sZW5ndGgsXG5cdFx0XHRcdGFnZW50TW9kaWZpZWRDb3VudDogcHJlcGFyZWQuYWdlbnRNb2RpZmllZENvdW50LFxuXHRcdFx0fSxcblx0XHRcdHJlc291cmNlUmVhZHM6IGNvbnRleHQucmVzb3VyY2VSZWFkcyxcblx0XHR9LCB7XG5cdFx0XHRwcmVwYXJlZDoge1xuXHRcdFx0XHRmbHVzaFRva2VuTGVuZ3RoOiAzNixcblx0XHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiAyLFxuXHRcdFx0fSxcblx0XHRcdHJlc291cmNlUmVhZHM6IFsnL3ByZXBhcmUnLCAnL2NvbW1pdCddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3YWl0cyBmb3IgdGhlIHByZXBhcmVkIEFnZW50IG1hcmtlciBiZWZvcmUgY29vcmRpbmF0aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb250ZXh0KHsgaXNBbWJpZW50OiBmYWxzZSwgYXV0aG9yaXR5OiAncmVtb3RlLW9uZScsIHByZXBhcmVTZXF1ZW5jZTogMiB9KTtcblx0XHRjb25zdCByZW1vdGVSZXNvdXJjZSA9IHRvQWdlbnRIb3N0VXJpKGNvbnRleHQucmVzb3VyY2UsICdyZW1vdGUtb25lJyk7XG5cdFx0Y29udGV4dC5zZXJ2aWNlLmNyZWF0ZUNvcnJlbGF0aW9uKHJlbW90ZVJlc291cmNlKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdhJywgJ2FiJykpO1xuXG5cdFx0Y29uc3QgcHJlcGFyZSA9IGNvbnRleHQuc2VydmljZS5wcmVwYXJlRmx1c2gocmVtb3RlUmVzb3VyY2UsICdoYXNoQ2hhbmdlJywgJ3N0YXRzLTEnLCBmYWxzZSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDIsICdhYicsICdhYmMnKSk7XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCBwcmVwYXJlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhZ2VudE1vZGlmaWVkQ291bnQ6IHByZXBhcmVkPy5hZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0XHRyZXNvdXJjZVJlYWRzOiBjb250ZXh0LnJlc291cmNlUmVhZHMsXG5cdFx0fSwge1xuXHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiAyLFxuXHRcdFx0cmVzb3VyY2VSZWFkczogWycvcHJlcGFyZSddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxzIGEgcHJlcGFyZWQgZmx1c2ggd2hlbiB0aGUgY29tbWl0IHRyYW5zcG9ydCBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCh7IGlzQW1iaWVudDogZmFsc2UsIGF1dGhvcml0eTogJ3JlbW90ZS1vbmUnLCBmYWlsQ29tbWl0OiB0cnVlIH0pO1xuXHRcdGNvbnN0IHJlbW90ZVJlc291cmNlID0gdG9BZ2VudEhvc3RVcmkoY29udGV4dC5yZXNvdXJjZSwgJ3JlbW90ZS1vbmUnKTtcblx0XHRjb250ZXh0LnNlcnZpY2UuY3JlYXRlQ29ycmVsYXRpb24ocmVtb3RlUmVzb3VyY2UpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMSwgJ2EnLCAnYWInKSk7XG5cblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IGNvbnRleHQuc2VydmljZS5wcmVwYXJlRmx1c2gocmVtb3RlUmVzb3VyY2UsICdoYXNoQ2hhbmdlJywgJ3N0YXRzLTEnLCBmYWxzZSk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gcHJlcGFyZWQhLmNvbW1pdCg1KSwgZXJyb3IgPT4gZXJyb3IgaW5zdGFuY2VvZiBBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25EZWZlcnJlZEVycm9yKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5yZXNvdXJjZVJlYWRzLCBbJy9wcmVwYXJlJywgJy9jb21taXQnLCAnL2NhbmNlbCddKTtcblx0fSk7XG5cblx0dGVzdCgndGltZXMgb3V0IGEgc3RhbGxlZCBwcmVwYXJlIHJlcXVlc3QnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCh7IGlzQW1iaWVudDogZmFsc2UsIGF1dGhvcml0eTogJ3JlbW90ZS1vbmUnLCBzdGFsbGVkUmVzb3VyY2VzOiBbJy9wcmVwYXJlJ10gfSk7XG5cdFx0Y29uc3QgcmVtb3RlUmVzb3VyY2UgPSB0b0FnZW50SG9zdFVyaShjb250ZXh0LnJlc291cmNlLCAncmVtb3RlLW9uZScpO1xuXHRcdGNvbnRleHQuc2VydmljZS5jcmVhdGVDb3JyZWxhdGlvbihyZW1vdGVSZXNvdXJjZSk7XG5cdFx0Y29udGV4dC5maXJlTWFya2VyKG1hcmtlcigxLCAnYScsICdhYicpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnRleHQuc2VydmljZS5wcmVwYXJlRmx1c2gocmVtb3RlUmVzb3VyY2UsICdoYXNoQ2hhbmdlJywgJ3N0YXRzLTEnLCBmYWxzZSk7XG5cdFx0YXdhaXQgdGltZW91dCgxNV8wMDEpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocmVzdWx0LCBlcnJvciA9PiBlcnJvciBpbnN0YW5jZW9mIEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvbkRlZmVycmVkRXJyb3IpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5yZXNvdXJjZVJlYWRzLCBbJy9wcmVwYXJlJywgJy9jYW5jZWwnXSk7XG5cdH0pKTtcblxuXHR0ZXN0KCd1c2VzIGEgY29tbWl0dGVkIGNhbmNlbGxhdGlvbiByZXN1bHQgYWZ0ZXIgcHJlcGFyZSBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCh7XG5cdFx0XHRpc0FtYmllbnQ6IGZhbHNlLFxuXHRcdFx0YXV0aG9yaXR5OiAncmVtb3RlLW9uZScsXG5cdFx0XHRmYWlsUHJlcGFyZTogdHJ1ZSxcblx0XHRcdGNhbmNlbE91dGNvbWU6ICdjb21taXR0ZWQnLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZVJlc291cmNlID0gdG9BZ2VudEhvc3RVcmkoY29udGV4dC5yZXNvdXJjZSwgJ3JlbW90ZS1vbmUnKTtcblx0XHRjb250ZXh0LnNlcnZpY2UuY3JlYXRlQ29ycmVsYXRpb24ocmVtb3RlUmVzb3VyY2UpO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMSwgJ2EnLCAnYWInKSk7XG5cblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IGNvbnRleHQuc2VydmljZS5wcmVwYXJlRmx1c2gocmVtb3RlUmVzb3VyY2UsICdoYXNoQ2hhbmdlJywgJ3N0YXRzLTEnLCBmYWxzZSk7XG5cdFx0YXdhaXQgcHJlcGFyZWQhLmNvbW1pdCg1KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiBwcmVwYXJlZD8uYWdlbnRNb2RpZmllZENvdW50LFxuXHRcdFx0cmVzb3VyY2VSZWFkczogY29udGV4dC5yZXNvdXJjZVJlYWRzLFxuXHRcdH0sIHtcblx0XHRcdGFnZW50TW9kaWZpZWRDb3VudDogMixcblx0XHRcdHJlc291cmNlUmVhZHM6IFsnL3ByZXBhcmUnLCAnL2NhbmNlbCddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3YWl0cyBmb3IgdGhlIGZ1bGwgcmVjb3ZlcmVkIGZsdXNoIGN1dG9mZiBiZWZvcmUgYWNrbm93bGVkZ2luZyBjb3ZlcmFnZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb250ZXh0KHtcblx0XHRcdGlzQW1iaWVudDogZmFsc2UsXG5cdFx0XHRhdXRob3JpdHk6ICdyZW1vdGUtb25lJyxcblx0XHRcdGZhaWxQcmVwYXJlOiB0cnVlLFxuXHRcdFx0Y2FuY2VsT3V0Y29tZTogJ2NvbW1pdHRlZCcsXG5cdFx0XHRjYW5jZWxMYXN0U2VxdWVuY2U6IDEsXG5cdFx0XHRjYW5jZWxTdGFuZGFsb25lQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzOiBbe1xuXHRcdFx0XHRpZDogJ2Fjay0xJyxcblx0XHRcdFx0c2VxdWVuY2VzOiBbMV0sXG5cdFx0XHRcdGVkaXRDb3VudDogMSxcblx0XHRcdFx0aW5zZXJ0ZWRDb3VudDogNDIsXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVSZXNvdXJjZSA9IHRvQWdlbnRIb3N0VXJpKGNvbnRleHQucmVzb3VyY2UsICdyZW1vdGUtb25lJyk7XG5cdFx0Y29udGV4dC5zZXJ2aWNlLmNyZWF0ZUNvcnJlbGF0aW9uKHJlbW90ZVJlc291cmNlKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDAsICdhJywgJ2FiJykpO1xuXG5cdFx0Y29uc3QgcHJlcGFyZSA9IGNvbnRleHQuc2VydmljZS5wcmVwYXJlRmx1c2gocmVtb3RlUmVzb3VyY2UsICdoYXNoQ2hhbmdlJywgJ3N0YXRzLTEnLCBmYWxzZSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIoe1xuXHRcdFx0dmVyc2lvbjogMSxcblx0XHRcdGVkaXRJZDogJ2VkaXQtc2tpcHBlZCcsXG5cdFx0XHRzZXF1ZW5jZTogMSxcblx0XHRcdHN0YXR1czogJ3NraXBwZWQnLFxuXHRcdFx0cmVhc29uOiAnZmlsZVRvb0xhcmdlJyxcblx0XHRcdGluc2VydGVkQ291bnQ6IDQyLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHByZXBhcmVkID0gYXdhaXQgcHJlcGFyZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGVmZXJDb3ZlcmFnZUdhcDogcHJlcGFyZWQ/LmRlZmVyQ292ZXJhZ2VHYXAsXG5cdFx0XHRjb3ZlcmFnZUdhcDogY29udGV4dC5zZXJ2aWNlLnRha2VDb3ZlcmFnZUdhcChyZW1vdGVSZXNvdXJjZSksXG5cdFx0fSwge1xuXHRcdFx0ZGVmZXJDb3ZlcmFnZUdhcDogZmFsc2UsXG5cdFx0XHRjb3ZlcmFnZUdhcDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnY2FuY2VscyBhIG1hbGZvcm1lZCBwcmVwYXJlZCByZXNwb25zZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCh7XG5cdFx0XHRpc0FtYmllbnQ6IGZhbHNlLFxuXHRcdFx0YXV0aG9yaXR5OiAncmVtb3RlLW9uZScsXG5cdFx0XHRwcmVwYXJlUmVzcG9uc2U6ICd7Jyxcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVSZXNvdXJjZSA9IHRvQWdlbnRIb3N0VXJpKGNvbnRleHQucmVzb3VyY2UsICdyZW1vdGUtb25lJyk7XG5cdFx0Y29udGV4dC5zZXJ2aWNlLmNyZWF0ZUNvcnJlbGF0aW9uKHJlbW90ZVJlc291cmNlKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdhJywgJ2FiJykpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udGV4dC5zZXJ2aWNlLnByZXBhcmVGbHVzaChyZW1vdGVSZXNvdXJjZSwgJ2hhc2hDaGFuZ2UnLCAnc3RhdHMtMScsIGZhbHNlKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJlc3VsdCwgZXJyb3IgPT4gZXJyb3IgaW5zdGFuY2VvZiBBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25EZWZlcnJlZEVycm9yKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQucmVzb3VyY2VSZWFkcywgWycvcHJlcGFyZScsICcvY2FuY2VsJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxzIGEgcHJlcGFyZWQgcmVzcG9uc2Ugd2l0aCBhbiB1bmV4cGVjdGVkIHRva2VuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb250ZXh0KHtcblx0XHRcdGlzQW1iaWVudDogZmFsc2UsXG5cdFx0XHRhdXRob3JpdHk6ICdyZW1vdGUtb25lJyxcblx0XHRcdHByZXBhcmVSZXNwb25zZTogSlNPTi5zdHJpbmdpZnkoeyBmbHVzaFRva2VuOiAndW5leHBlY3RlZCcsIGFnZW50TW9kaWZpZWRDb3VudDogMiB9KSxcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVSZXNvdXJjZSA9IHRvQWdlbnRIb3N0VXJpKGNvbnRleHQucmVzb3VyY2UsICdyZW1vdGUtb25lJyk7XG5cdFx0Y29udGV4dC5zZXJ2aWNlLmNyZWF0ZUNvcnJlbGF0aW9uKHJlbW90ZVJlc291cmNlKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdhJywgJ2FiJykpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udGV4dC5zZXJ2aWNlLnByZXBhcmVGbHVzaChyZW1vdGVSZXNvdXJjZSwgJ2hhc2hDaGFuZ2UnLCAnc3RhdHMtMScsIGZhbHNlKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJlc3VsdCwgZXJyb3IgPT4gZXJyb3IgaW5zdGFuY2VvZiBBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25EZWZlcnJlZEVycm9yKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQucmVzb3VyY2VSZWFkcywgWycvcHJlcGFyZScsICcvY2FuY2VsJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIHN0YW5kYWxvbmUgYWNrbm93bGVkZ2VtZW50cyBiZXlvbmQgdGhlIHByZXBhcmVkIHNlcXVlbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb250ZXh0KHtcblx0XHRcdHByZXBhcmVTZXF1ZW5jZTogMSxcblx0XHRcdHN0YW5kYWxvbmVDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHM6IFt7XG5cdFx0XHRcdGlkOiAnYWNrLTEnLFxuXHRcdFx0XHRzZXF1ZW5jZXM6IFsyXSxcblx0XHRcdFx0ZWRpdENvdW50OiAxLFxuXHRcdFx0XHRpbnNlcnRlZENvdW50OiA0Mixcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHRcdGNvbnRleHQuZmlyZU1hcmtlcihtYXJrZXIoMSwgJ2EnLCAnYWInKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb250ZXh0LnNlcnZpY2UucHJlcGFyZUZsdXNoKGNvbnRleHQucmVzb3VyY2UsICdoYXNoQ2hhbmdlJywgJ3N0YXRzLTEnLCBmYWxzZSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhyZXN1bHQsIGVycm9yID0+IGVycm9yIGluc3RhbmNlb2YgQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uRGVmZXJyZWRFcnJvcik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LnJlc291cmNlUmVhZHMsIFsnL3ByZXBhcmUnLCAnL2NhbmNlbCddKTtcblx0fSk7XG5cblx0dGVzdCgndGltZXMgb3V0IGEgc3RhbGxlZCBjb21taXQgcmVxdWVzdCBhbmQgY2FuY2VscyB0aGUgZmx1c2gnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCh7IGlzQW1iaWVudDogZmFsc2UsIGF1dGhvcml0eTogJ3JlbW90ZS1vbmUnLCBzdGFsbGVkUmVzb3VyY2VzOiBbJy9jb21taXQnXSB9KTtcblx0XHRjb25zdCByZW1vdGVSZXNvdXJjZSA9IHRvQWdlbnRIb3N0VXJpKGNvbnRleHQucmVzb3VyY2UsICdyZW1vdGUtb25lJyk7XG5cdFx0Y29udGV4dC5zZXJ2aWNlLmNyZWF0ZUNvcnJlbGF0aW9uKHJlbW90ZVJlc291cmNlKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdhJywgJ2FiJykpO1xuXHRcdGNvbnN0IHByZXBhcmVkID0gYXdhaXQgY29udGV4dC5zZXJ2aWNlLnByZXBhcmVGbHVzaChyZW1vdGVSZXNvdXJjZSwgJ2hhc2hDaGFuZ2UnLCAnc3RhdHMtMScsIGZhbHNlKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHByZXBhcmVkIS5jb21taXQoNSk7XG5cdFx0YXdhaXQgdGltZW91dCgxNV8wMDEpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocmVzdWx0LCBlcnJvciA9PiBlcnJvciBpbnN0YW5jZW9mIEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvbkRlZmVycmVkRXJyb3IpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5yZXNvdXJjZVJlYWRzLCBbJy9wcmVwYXJlJywgJy9jb21taXQnLCAnL2NhbmNlbCddKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2FjY2VwdHMgYSBjb21taXQgdGhhdCBjb21wbGV0ZWQgYmVmb3JlIGNhbmNlbGxhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCh7IGlzQW1iaWVudDogZmFsc2UsIGF1dGhvcml0eTogJ3JlbW90ZS1vbmUnLCBmYWlsQ29tbWl0OiB0cnVlLCBjYW5jZWxPdXRjb21lOiAnY29tbWl0dGVkJyB9KTtcblx0XHRjb25zdCByZW1vdGVSZXNvdXJjZSA9IHRvQWdlbnRIb3N0VXJpKGNvbnRleHQucmVzb3VyY2UsICdyZW1vdGUtb25lJyk7XG5cdFx0Y29udGV4dC5zZXJ2aWNlLmNyZWF0ZUNvcnJlbGF0aW9uKHJlbW90ZVJlc291cmNlKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdhJywgJ2FiJykpO1xuXHRcdGNvbnN0IHByZXBhcmVkID0gYXdhaXQgY29udGV4dC5zZXJ2aWNlLnByZXBhcmVGbHVzaChyZW1vdGVSZXNvdXJjZSwgJ2hhc2hDaGFuZ2UnLCAnc3RhdHMtMScsIGZhbHNlKTtcblxuXHRcdGF3YWl0IHByZXBhcmVkIS5jb21taXQoNSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQucmVzb3VyY2VSZWFkcywgWycvcHJlcGFyZScsICcvY29tbWl0JywgJy9jYW5jZWwnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGZhbGwgYmFjayB3aGVuIGNvbW1pdCBhbmQgY2FuY2VsbGF0aW9uIG91dGNvbWVzIGFyZSB1bmtub3duJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZUNvbnRleHQoe1xuXHRcdFx0aXNBbWJpZW50OiBmYWxzZSxcblx0XHRcdGF1dGhvcml0eTogJ3JlbW90ZS1vbmUnLFxuXHRcdFx0c3RhbGxlZFJlc291cmNlczogWycvY29tbWl0JywgJy9jYW5jZWwnXSxcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVSZXNvdXJjZSA9IHRvQWdlbnRIb3N0VXJpKGNvbnRleHQucmVzb3VyY2UsICdyZW1vdGUtb25lJyk7XG5cdFx0Y29udGV4dC5zZXJ2aWNlLmNyZWF0ZUNvcnJlbGF0aW9uKHJlbW90ZVJlc291cmNlKTtcblx0XHRjb250ZXh0LmZpcmVNYXJrZXIobWFya2VyKDEsICdhJywgJ2FiJykpO1xuXHRcdGNvbnN0IHByZXBhcmVkID0gYXdhaXQgY29udGV4dC5zZXJ2aWNlLnByZXBhcmVGbHVzaChyZW1vdGVSZXNvdXJjZSwgJ2hhc2hDaGFuZ2UnLCAnc3RhdHMtMScsIGZhbHNlKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHByZXBhcmVkIS5jb21taXQoNSk7XG5cdFx0YXdhaXQgdGltZW91dCgxNV8wMDEpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTVfMDAxKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJlc3VsdCwgL291dGNvbWUgaXMgdW5rbm93bi8pO1xuXHR9KSk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlQ29udGV4dChvcHRpb25zOiB7XG5cdFx0cmVhZG9ubHkgaXNBbWJpZW50PzogYm9vbGVhbjtcblx0XHRyZWFkb25seSBhdXRob3JpdHk/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgZmFpbFByZXBhcmU/OiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IGZhaWxDb21taXQ/OiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IHN0YWxsZWRSZXNvdXJjZXM/OiByZWFkb25seSBzdHJpbmdbXTtcblx0XHRyZWFkb25seSBjYW5jZWxPdXRjb21lPzogRWRpdEF0dHJpYnV0aW9uRmx1c2hPdXRjb21lO1xuXHRcdHJlYWRvbmx5IHByZXBhcmVSZXNwb25zZT86IHN0cmluZztcblx0XHRyZWFkb25seSBwcmVwYXJlU2VxdWVuY2U/OiBudW1iZXI7XG5cdFx0cmVhZG9ubHkgc3RhbmRhbG9uZUNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cz86IHJlYWRvbmx5IElFZGl0QXR0cmlidXRpb25Db3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudFtdO1xuXHRcdHJlYWRvbmx5IGNhbmNlbFN0YW5kYWxvbmVDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHM/OiByZWFkb25seSBJRWRpdEF0dHJpYnV0aW9uQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRbXTtcblx0XHRyZWFkb25seSBjYW5jZWxMYXN0U2VxdWVuY2U/OiBudW1iZXI7XG5cdH0gPSB7fSkge1xuXHRcdGNvbnN0IHtcblx0XHRcdGlzQW1iaWVudCA9IHRydWUsXG5cdFx0XHRhdXRob3JpdHkgPSAnbG9jYWwnLFxuXHRcdFx0ZmFpbFByZXBhcmUgPSBmYWxzZSxcblx0XHRcdGZhaWxDb21taXQgPSBmYWxzZSxcblx0XHRcdHN0YWxsZWRSZXNvdXJjZXMgPSBbXSxcblx0XHRcdGNhbmNlbE91dGNvbWUgPSAnY2FuY2VsbGVkJyxcblx0XHRcdHByZXBhcmVSZXNwb25zZSxcblx0XHRcdHByZXBhcmVTZXF1ZW5jZSxcblx0XHRcdHN0YW5kYWxvbmVDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHMsXG5cdFx0XHRjYW5jZWxTdGFuZGFsb25lQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzLFxuXHRcdFx0Y2FuY2VsTGFzdFNlcXVlbmNlLFxuXHRcdH0gPSBvcHRpb25zO1xuXHRcdGNvbnN0IGFjdGlvbkVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8QWN0aW9uRW52ZWxvcGU+KCkpO1xuXHRcdGNvbnN0IHJlc291cmNlUmVhZHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0U2VydmljZSwge1xuXHRcdFx0b25EaWRBY3Rpb246IGFjdGlvbkVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRhc3luYyByZXNvdXJjZVJlYWQocmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0XHRyZXNvdXJjZVJlYWRzLnB1c2gocmVzb3VyY2UucGF0aCk7XG5cdFx0XHRcdGlmIChzdGFsbGVkUmVzb3VyY2VzLmluY2x1ZGVzKHJlc291cmNlLnBhdGgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPG5ldmVyPigoKSA9PiB7IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChmYWlsUHJlcGFyZSAmJiByZXNvdXJjZS5wYXRoID09PSAnL3ByZXBhcmUnKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdQcmVwYXJlIGZhaWxlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChmYWlsQ29tbWl0ICYmIHJlc291cmNlLnBhdGggPT09ICcvY29tbWl0Jykge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ29tbWl0IGZhaWxlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3QgPSBwYXJzZUVkaXRBdHRyaWJ1dGlvblJlc291cmNlKHJlc291cmNlKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRkYXRhOiByZXNvdXJjZS5wYXRoID09PSAnL3ByZXBhcmUnXG5cdFx0XHRcdFx0XHQ/IHByZXBhcmVSZXNwb25zZSA/PyBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0XHRcdGZsdXNoVG9rZW46IHJlcXVlc3Q/LmtpbmQgPT09ICdwcmVwYXJlJyA/IHJlcXVlc3QucGFyYW1zLmZsdXNoVG9rZW4gOiAnJyxcblx0XHRcdFx0XHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiAyLFxuXHRcdFx0XHRcdFx0XHRsYXN0U2VxdWVuY2U6IHByZXBhcmVTZXF1ZW5jZSxcblx0XHRcdFx0XHRcdFx0c3RhbmRhbG9uZUNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cyxcblx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHQ6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRcdFx0b3V0Y29tZTogcmVzb3VyY2UucGF0aCA9PT0gJy9jb21taXQnID8gJ2NvbW1pdHRlZCcgOiBjYW5jZWxPdXRjb21lLFxuXHRcdFx0XHRcdFx0XHRhZ2VudE1vZGlmaWVkQ291bnQ6IHJlc291cmNlLnBhdGggPT09ICcvY29tbWl0JyB8fCBjYW5jZWxPdXRjb21lID09PSAnY29tbWl0dGVkJyA/IDIgOiAwLFxuXHRcdFx0XHRcdFx0XHRsYXN0U2VxdWVuY2U6IHJlc291cmNlLnBhdGggPT09ICcvY2FuY2VsJyA/IGNhbmNlbExhc3RTZXF1ZW5jZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c3RhbmRhbG9uZUNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50czogcmVzb3VyY2UucGF0aCA9PT0gJy9jYW5jZWwnID8gY2FuY2VsU3RhbmRhbG9uZUNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuVXRmOCxcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlLCB7XG5cdFx0XHRvbkRpZENoYW5nZUNvbm5lY3Rpb25zOiBFdmVudC5Ob25lLFxuXHRcdFx0Y29ubmVjdGlvbnM6IFt7XG5cdFx0XHRcdGF1dGhvcml0eSxcblx0XHRcdFx0YWRkcmVzczogaXNBbWJpZW50ID8gdW5kZWZpbmVkIDogJ3JlbW90ZScsXG5cdFx0XHRcdG5hbWU6IGlzQW1iaWVudCA/ICdMb2NhbCcgOiAnUmVtb3RlJyxcblx0XHRcdFx0aXNBbWJpZW50LFxuXHRcdFx0XHRjb25uZWN0aW9uLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXJpSWRlbnRpdHlTZXJ2aWNlLCB7IGV4dFVyaSwgYXNDYW5vbmljYWxVcmk6IHJlc291cmNlID0+IHJlc291cmNlIH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCdDOlxcXFxyZXBvXFxcXGZpbGUudHMnKTtcblx0XHRjb25zdCBzdXBwcmVzc2VkSWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGludmFsaWRhdGVkSWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvcnJlbGF0aW9uID0gc2VydmljZS5jcmVhdGVDb3JyZWxhdGlvbihyZXNvdXJjZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNvcnJlbGF0aW9uLm9uRGlkU3VwcHJlc3MoaWQgPT4gc3VwcHJlc3NlZElkcy5wdXNoKGlkKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjb3JyZWxhdGlvbi5vbkRpZEludmFsaWRhdGUoaWQgPT4gaW52YWxpZGF0ZWRJZHMucHVzaChpZCkpKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRzZXJ2aWNlLFxuXHRcdFx0c3VwcHJlc3NlZElkcyxcblx0XHRcdGludmFsaWRhdGVkSWRzLFxuXHRcdFx0cmVzb3VyY2VSZWFkcyxcblx0XHRcdGZpcmVNYXJrZXIoYXR0cmlidXRpb246IElGaWxlRWRpdEF0dHJpYnV0aW9uTWFya2VyKSB7XG5cdFx0XHRcdHRoaXMuZmlyZVJhd01hcmtlcihhdHRyaWJ1dGlvbik7XG5cdFx0XHR9LFxuXHRcdFx0ZmlyZVJhd01hcmtlcihhdHRyaWJ1dGlvbjogb2JqZWN0ICYgeyByZWFkb25seSBzZXF1ZW5jZTogbnVtYmVyIH0pIHtcblx0XHRcdFx0Y29uc3QgY29udGVudDogVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudCA9IHtcblx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0XHRcdFx0YmVmb3JlOiB7XG5cdFx0XHRcdFx0XHR1cmk6IHJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRjb250ZW50OiB7IHVyaTogJ3Nlc3Npb24tZGI6L2JlZm9yZScgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGFmdGVyOiB7XG5cdFx0XHRcdFx0XHR1cmk6IHJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRjb250ZW50OiB7IHVyaTogJ3Nlc3Npb24tZGI6L2FmdGVyJyB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHRcdE9iamVjdC5hc3NpZ24oY29udGVudCwgeyBbRklMRV9FRElUX0FUVFJJQlVUSU9OX1BST1BFUlRZXTogYXR0cmlidXRpb24gfSk7XG5cdFx0XHRcdGFjdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRcdFx0Y2hhbm5lbDogJ2FocC1jaGF0OmNvcGlsb3QlM0ElMkZzZXNzaW9uJyxcblx0XHRcdFx0XHRzZXJ2ZXJTZXE6IGF0dHJpYnV0aW9uLnNlcXVlbmNlLFxuXHRcdFx0XHRcdG9yaWdpbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiBgdG9vbC0ke2F0dHJpYnV0aW9uLnNlcXVlbmNlfWAsXG5cdFx0XHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJycsXG5cdFx0XHRcdFx0XHRcdGNvbnRlbnQ6IFtjb250ZW50XSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cbn0pO1xuXG5mdW5jdGlvbiBtYXJrZXIoc2VxdWVuY2U6IG51bWJlciwgYmVmb3JlOiBzdHJpbmcsIGFmdGVyOiBzdHJpbmcsIHNvdXJjZT86IHtcblx0cmVhZG9ubHkgbW9kZWxJZD86IHN0cmluZztcblx0cmVhZG9ubHkgY29udmVyc2F0aW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmVxdWVzdElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGhhcm5lc3M6IHN0cmluZztcbn0pOiBJRmlsZUVkaXRBdHRyaWJ1dGlvbk1hcmtlciB7XG5cdHJldHVybiB7XG5cdFx0dmVyc2lvbjogMSxcblx0XHRlZGl0SWQ6IGBlZGl0LSR7c2VxdWVuY2V9YCxcblx0XHRzZXF1ZW5jZSxcblx0XHRiZWZvcmVEaWdlc3Q6IGNyZWF0ZUZpbGVFZGl0Q29udGVudERpZ2VzdChiZWZvcmUpLFxuXHRcdGFmdGVyRGlnZXN0OiBjcmVhdGVGaWxlRWRp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
