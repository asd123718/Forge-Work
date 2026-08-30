import assert from "assert";
import { DeferredPromise, timeout } from "../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { OffsetRange } from "../../../../../editor/common/core/ranges/offsetRange.js";
import { computeStringDiff } from "../../../../../editor/common/services/editorWebWorker.js";
import { EditSources, EditSuggestionId } from "../../../../../editor/common/textModelEditSource.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IUserAttentionService } from "../../../../services/userAttention/common/userAttentionService.js";
import { ITextFileService } from "../../../../services/textfile/common/textfiles.js";
import { AnnotatedDocuments, UriVisibilityProvider } from "../../browser/helpers/annotatedDocuments.js";
import { DiffService } from "../../browser/helpers/documentWithAnnotatedEdits.js";
import { StringEditWithReason } from "../../browser/helpers/observableWorkspace.js";
import { IAiEditTelemetryService } from "../../browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js";
import { EditSourceTrackingImpl } from "../../browser/telemetry/editSourceTrackingImpl.js";
import { AgentHostEditAttributionDeferredError, AgentHostEditAttributionUnknownOutcomeError } from "../../browser/telemetry/agentHostEditMarkerService.js";
import { ScmAdapter } from "../../browser/telemetry/scmAdapter.js";
import { IRandomService } from "../../browser/randomService.js";
import { MutableObservableWorkspace } from "./editTelemetry.test.js";
suite("Edit Source Tracking Windows", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("flushes and recreates the long-term tracker on hash and branch changes", () => runWithFakedTimers({}, async () => {
    const context = setup();
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "alpha", chatEdit("request-1")));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("alpha"), "beta", chatEdit("request-2")));
    await timeout(1500);
    context.branch.set("feature", void 0);
    assert.deepStrictEqual(context.details.map((event) => ({
      trigger: event.trigger,
      requestId: event.requestId,
      modifiedCount: event.modifiedCount,
      deltaModifiedCount: event.deltaModifiedCount
    })), [
      { trigger: "hashChange", requestId: "request-1", modifiedCount: 5, deltaModifiedCount: 5 },
      { trigger: "branchChange", requestId: "request-2", modifiedCount: 3, deltaModifiedCount: 3 }
    ]);
    context.disposables.dispose();
  }));
  test("flushes the long-term tracker when the document closes", () => runWithFakedTimers({}, async () => {
    const context = setup();
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "alpha", chatEdit("request-1")));
    await timeout(1500);
    context.document.dispose();
    await timeout(0);
    assert.deepStrictEqual(context.details.map((event) => ({
      trigger: event.trigger,
      requestId: event.requestId
    })), [{ trigger: "closed", requestId: "request-1" }]);
    context.disposables.dispose();
  }));
  test("flushes and recreates the long-term tracker after ten hours", () => runWithFakedTimers({}, async () => {
    const context = setup();
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "alpha", chatEdit("request-1")));
    await timeout(1500);
    await timeout(10 * 60 * 60 * 1e3);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("alpha"), "beta", chatEdit("request-2")));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    assert.deepStrictEqual(context.details.map((event) => ({
      trigger: event.trigger,
      requestId: event.requestId
    })), [
      { trigger: "10hours", requestId: "request-1" },
      { trigger: "hashChange", requestId: "request-2" }
    ]);
    context.disposables.dispose();
  }));
  test("emits only the top thirty long-term sources by retained count", () => runWithFakedTimers({}, async () => {
    const context = setup();
    await timeout(10);
    for (let i = 1; i <= 31; i++) {
      context.document.applyEdit(StringEditWithReason.replace(
        OffsetRange.emptyAt(context.document.value.get().value.length),
        "x".repeat(i),
        EditSources.unknown({ name: `source-${i}` })
      ));
    }
    await timeout(10);
    context.headHash.set("hash-2", void 0);
    assert.deepStrictEqual({
      count: context.details.length,
      first: context.details[0].sourceKey,
      last: context.details.at(-1)?.sourceKey,
      containsSmallest: context.details.some((event) => event.sourceKey === "source:unknown-name:source-1")
    }, {
      count: 30,
      first: "source:unknown-name:source-31",
      last: "source:unknown-name:source-2",
      containsSmallest: false
    });
    context.disposables.dispose();
  }));
  test("starts after first visibility and keeps only the long-term tracker while hidden", () => runWithFakedTimers({}, async () => {
    const visible = observableValue("visible", false);
    const context = setup(visible);
    await timeout(10);
    assert.strictEqual(context.impl.docsState.get().size, 0);
    visible.set(true, void 0);
    const visibleState = context.impl.docsState.get().get(context.document);
    if (!visibleState) {
      throw new Error("Expected visible document state");
    }
    assert.ok(visibleState.longtermTracker.get());
    const firstWindowedTracker = visibleState.windowedTracker.get();
    assert.ok(firstWindowedTracker);
    assert.ok(visibleState.windowedFocusTracker.get());
    visible.set(false, void 0);
    const hiddenState = context.impl.docsState.get().get(context.document);
    if (!hiddenState) {
      throw new Error("Expected hidden document state");
    }
    assert.ok(hiddenState.longtermTracker.get());
    assert.strictEqual(hiddenState.windowedTracker.get(), void 0);
    assert.strictEqual(hiddenState.windowedFocusTracker.get(), void 0);
    visible.set(true, void 0);
    const visibleAgainState = context.impl.docsState.get().get(context.document);
    if (!visibleAgainState) {
      throw new Error("Expected visible document state after reopening");
    }
    assert.ok(visibleAgainState.windowedTracker.get());
    assert.notStrictEqual(visibleAgainState.windowedTracker.get(), firstWindowedTracker);
    context.disposables.dispose();
  }));
  test("fans out Agent Host reload attribution to both focus windows", () => runWithFakedTimers({}, async () => {
    const visible = observableValue("visible", true);
    const correlation = new TestExternalEditCorrelation();
    let prepareCount = 0;
    const markerService = {
      createCorrelation: () => correlation,
      prepareFlush: async () => {
        prepareCount++;
        return void 0;
      }
    };
    const context = setup(visible, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    correlation.resolve(EditSources.agentHostChatApplyEdits({
      modelId: "gpt-5",
      sessionId: "session-1",
      requestId: "turn-1",
      harness: "copilotcli"
    }));
    visible.set(false, void 0);
    await timeout(10);
    const focusDetails = context.allDetails.filter((event) => event.mode !== "longterm");
    const focusStats = context.allStats.filter((event) => event.mode !== "longterm");
    assert.deepStrictEqual({
      details: focusDetails.map((event) => ({
        mode: event.mode,
        sourceKey: event.sourceKey,
        sourceKeyCleaned: event.sourceKeyCleaned,
        origin: event.origin,
        harness: event.harness,
        modelId: event.modelId,
        conversationId: event.conversationId,
        requestId: event.requestId,
        modifiedCount: event.modifiedCount,
        deltaModifiedCount: event.deltaModifiedCount,
        totalModifiedCount: event.totalModifiedCount
      })).sort((a, b) => a.mode.localeCompare(b.mode)),
      stats: focusStats.map((event) => ({
        mode: event.mode,
        otherAIModifiedCount: event.otherAIModifiedCount,
        agentHostModifiedCount: event.agentHostModifiedCount,
        externalModifiedCount: event.externalModifiedCount,
        totalModifiedCharacters: event.totalModifiedCharacters
      })).sort((a, b) => a.mode.localeCompare(b.mode)),
      statsUuids: new Set(focusDetails.map((event) => event.statsUuid)).size,
      prepareCount
    }, {
      details: [
        {
          mode: "10minFocusWindow",
          sourceKey: "source:Chat.applyEdits-$modelId:gpt-5-$harness:copilotcli-$origin:agentHost",
          sourceKeyCleaned: "source:Chat.applyEdits-$harness:copilotcli-$origin:agentHost",
          origin: "agentHost",
          harness: "copilotcli",
          modelId: "gpt-5",
          conversationId: "session-1",
          requestId: "turn-1",
          modifiedCount: 8,
          deltaModifiedCount: 8,
          totalModifiedCount: 8
        },
        {
          mode: "20minFocusWindow",
          sourceKey: "source:Chat.applyEdits-$modelId:gpt-5-$harness:copilotcli-$origin:agentHost",
          sourceKeyCleaned: "source:Chat.applyEdits-$harness:copilotcli-$origin:agentHost",
          origin: "agentHost",
          harness: "copilotcli",
          modelId: "gpt-5",
          conversationId: "session-1",
          requestId: "turn-1",
          modifiedCount: 8,
          deltaModifiedCount: 8,
          totalModifiedCount: 8
        }
      ],
      stats: [
        {
          mode: "10minFocusWindow",
          otherAIModifiedCount: 0,
          agentHostModifiedCount: 8,
          externalModifiedCount: 0,
          totalModifiedCharacters: 8
        },
        {
          mode: "20minFocusWindow",
          otherAIModifiedCount: 0,
          agentHostModifiedCount: 8,
          externalModifiedCount: 0,
          totalModifiedCharacters: 8
        }
      ],
      statsUuids: 2,
      prepareCount: 0
    });
    context.disposables.dispose();
  }));
  test("drains a late Agent Host marker before focus-window emission", () => runWithFakedTimers({}, async () => {
    const visible = observableValue("visible", true);
    const correlation = new TestExternalEditCorrelation(true);
    const markerService = {
      createCorrelation: () => correlation,
      prepareFlush: async () => void 0
    };
    const context = setup(visible, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    visible.set(false, void 0);
    await timeout(10);
    assert.strictEqual(context.allDetails.length, 0);
    correlation.resolve(EditSources.agentHostChatApplyEdits({
      modelId: void 0,
      sessionId: "session-1",
      requestId: "turn-late",
      harness: "claude"
    }));
    correlation.completeDrain();
    await timeout(10);
    assert.deepStrictEqual(context.allDetails.map((event) => ({
      mode: event.mode,
      harness: event.harness,
      requestId: event.requestId
    })).sort((a, b) => a.mode.localeCompare(b.mode)), [
      { mode: "10minFocusWindow", harness: "claude", requestId: "turn-late" },
      { mode: "20minFocusWindow", harness: "claude", requestId: "turn-late" }
    ]);
    context.disposables.dispose();
  }));
  test("falls back to external attribution after the focus correlation drain times out", () => runWithFakedTimers({}, async () => {
    const visible = observableValue("visible", true);
    const correlation = new TestExternalEditCorrelation(true);
    const markerService = {
      createCorrelation: () => correlation,
      prepareFlush: async () => void 0
    };
    const context = setup(visible, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    visible.set(false, void 0);
    await timeout(1001);
    assert.deepStrictEqual({
      details: context.allDetails.map((event) => ({
        mode: event.mode,
        sourceKey: event.sourceKey,
        modifiedCount: event.modifiedCount,
        totalModifiedCount: event.totalModifiedCount
      })).sort((a, b) => a.mode.localeCompare(b.mode)),
      stats: context.allStats.map((event) => ({
        mode: event.mode,
        agentHostModifiedCount: event.agentHostModifiedCount,
        externalModifiedCount: event.externalModifiedCount,
        totalModifiedCharacters: event.totalModifiedCharacters
      })).sort((a, b) => a.mode.localeCompare(b.mode))
    }, {
      details: [
        { mode: "10minFocusWindow", sourceKey: "source:reloadFromDisk", modifiedCount: 8, totalModifiedCount: 8 },
        { mode: "20minFocusWindow", sourceKey: "source:reloadFromDisk", modifiedCount: 8, totalModifiedCount: 8 }
      ],
      stats: [
        { mode: "10minFocusWindow", agentHostModifiedCount: 0, externalModifiedCount: 8, totalModifiedCharacters: 8 },
        { mode: "20minFocusWindow", agentHostModifiedCount: 0, externalModifiedCount: 8, totalModifiedCharacters: 8 }
      ]
    });
    context.disposables.dispose();
  }));
  test("coordinates long-term totals with Agent Host attribution", () => runWithFakedTimers({}, async () => {
    const commits = [];
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => false,
        release: () => {
        }
      }),
      prepareFlush: async (_resource, trigger, statsUuid, isDirty) => isDirty || trigger !== "hashChange" ? void 0 : {
        flushToken: "flush-1",
        agentModifiedCount: 3,
        commit: async (totalModifiedCount) => {
          assert.strictEqual(statsUuid, "stats-2");
          commits.push(totalModifiedCount);
        }
      }
    };
    const context = setup(void 0, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "alpha", chatEdit("request-1")));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual({
      details: context.details.map((event) => ({
        statsUuid: event.statsUuid,
        modifiedCount: event.modifiedCount,
        totalModifiedCount: event.totalModifiedCount
      })),
      stats: context.stats.map((event) => ({
        statsUuid: event.statsUuid,
        otherAIModifiedCount: event.otherAIModifiedCount,
        agentHostModifiedCount: event.agentHostModifiedCount,
        totalModifiedCharacters: event.totalModifiedCharacters
      })),
      commits
    }, {
      details: [{
        statsUuid: "stats-2",
        modifiedCount: 5,
        totalModifiedCount: 8
      }],
      stats: [{
        statsUuid: "stats-2",
        otherAIModifiedCount: 5,
        agentHostModifiedCount: 3,
        totalModifiedCharacters: 8
      }],
      commits: [8]
    });
    context.disposables.dispose();
  }));
  test("recomputes workbench totals after a late Agent marker", () => runWithFakedTimers({}, async () => {
    const onDidSuppress = new Emitter();
    const prepareStarted = new DeferredPromise();
    const continuePrepare = new DeferredPromise();
    let suppressed = false;
    const committedTotals = [];
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: onDidSuppress.event,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => suppressed,
        release: () => {
        }
      }),
      prepareFlush: async (_resource, trigger) => {
        if (trigger !== "hashChange") {
          return void 0;
        }
        prepareStarted.complete();
        await continuePrepare.p;
        return {
          flushToken: "flush-1",
          agentModifiedCount: 3,
          commit: async (totalModifiedCount) => {
            committedTotals.push(totalModifiedCount);
          }
        };
      }
    };
    const context = setup(void 0, markerService);
    context.disposables.add(onDidSuppress);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await prepareStarted.p;
    suppressed = true;
    onDidSuppress.fire("observation");
    continuePrepare.complete();
    await timeout(10);
    assert.deepStrictEqual({
      committedTotals,
      stats: context.stats.map((event) => ({
        otherAIModifiedCount: event.otherAIModifiedCount,
        agentHostModifiedCount: event.agentHostModifiedCount,
        externalModifiedCount: event.externalModifiedCount,
        totalModifiedCharacters: event.totalModifiedCharacters
      }))
    }, {
      committedTotals: [3],
      stats: [{
        otherAIModifiedCount: 0,
        agentHostModifiedCount: 3,
        externalModifiedCount: 0,
        totalModifiedCharacters: 3
      }]
    });
    context.disposables.dispose();
  }));
  test("defers Agent Host attribution while the model is dirty", () => runWithFakedTimers({}, async () => {
    const dirtyStates = [];
    let coverageGapTakeCount = 0;
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => false,
        release: () => {
        }
      }),
      prepareFlush: async (_resource, trigger, _statsUuid, isDirty) => {
        if (trigger === "hashChange") {
          dirtyStates.push(isDirty);
        }
        return void 0;
      },
      takeCoverageGap: () => {
        coverageGapTakeCount++;
        return { editCount: 1, insertedCount: 42 };
      }
    };
    const context = setup(void 0, markerService, true);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "alpha", chatEdit("request-1")));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual({
      dirtyStates,
      coverageGapTakeCount,
      details: context.details.map((event) => ({
        modifiedCount: event.modifiedCount,
        totalModifiedCount: event.totalModifiedCount
      }))
    }, {
      dirtyStates: [true],
      coverageGapTakeCount: 0,
      details: [{
        modifiedCount: 5,
        totalModifiedCount: 5
      }]
    });
    context.disposables.dispose();
  }));
  test("does not fall back matched Agent edits while the model is dirty", () => runWithFakedTimers({}, async () => {
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => true,
        release: () => {
        }
      }),
      prepareFlush: async () => void 0
    };
    const context = setup(void 0, markerService, true);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual({
      detailCount: context.details.length,
      statsCount: context.stats.length
    }, {
      detailCount: 0,
      statsCount: 0
    });
    context.disposables.dispose();
  }));
  test("keeps unmatched reloads as standard external telemetry", () => runWithFakedTimers({}, async () => {
    let observation = 0;
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => `observation-${++observation}`,
        isSuppressed: () => false,
        release: () => {
        }
      }),
      prepareFlush: async () => void 0
    };
    const context = setup(void 0, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "alpha", chatEdit("request-1")));
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("alpha"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual({
      sourceKeys: context.details.map((event) => event.sourceKey).sort(),
      hasInternalObservationKey: context.details.some((event) => event.sourceKey.startsWith("external-observation:"))
    }, {
      sourceKeys: ["source:Chat.applyEdits", "source:reloadFromDisk"],
      hasInternalObservationKey: false
    });
    context.disposables.dispose();
  }));
  test("reports partial Agent Host coverage without dropping workbench attribution", () => runWithFakedTimers({}, async () => {
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => false,
        release: () => {
        }
      }),
      takeCoverageGap: () => ({
        editCount: 1,
        insertedCount: 42
      }),
      prepareFlush: async () => void 0
    };
    const context = setup(void 0, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "alpha", chatEdit("request-1")));
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("alpha"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual(context.stats.map((event) => ({
      externalModifiedCount: event.externalModifiedCount,
      totalModifiedCharacters: event.totalModifiedCharacters,
      agentHostAttributionCoverage: event.agentHostAttributionCoverage,
      agentHostUntrackedEditCount: event.agentHostUntrackedEditCount,
      agentHostUntrackedInsertedCount: event.agentHostUntrackedInsertedCount
    })), [{
      externalModifiedCount: 8,
      totalModifiedCharacters: 8,
      agentHostAttributionCoverage: "partial",
      agentHostUntrackedEditCount: 1,
      agentHostUntrackedInsertedCount: 42
    }]);
    context.disposables.dispose();
  }));
  test("emits workbench telemetry when Agent Host coordination fails", () => runWithFakedTimers({}, async () => {
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => false,
        release: () => {
        }
      }),
      prepareFlush: async () => {
        throw new Error("Agent Host unavailable");
      }
    };
    const context = setup(void 0, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "alpha", chatEdit("request-1")));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual(context.details.map((event) => ({
      modifiedCount: event.modifiedCount,
      totalModifiedCount: event.totalModifiedCount
    })), [{
      modifiedCount: 5,
      totalModifiedCount: 5
    }]);
    context.disposables.dispose();
  }));
  test("falls back to external telemetry when a matched Agent flush cannot prepare", () => runWithFakedTimers({}, async () => {
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => true,
        release: () => {
        }
      }),
      prepareFlush: async () => {
        throw new Error("Agent Host unavailable");
      }
    };
    const context = setup(void 0, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "alpha", chatEdit("request-1")));
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("alpha"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual(context.details.map((event) => event.sourceKey).sort(), [
      "source:Chat.applyEdits",
      "source:reloadFromDisk"
    ]);
    context.disposables.dispose();
  }));
  test("falls back to a matched initial external edit when Agent Host is unavailable", () => runWithFakedTimers({}, async () => {
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => true,
        release: () => {
        }
      }),
      prepareFlush: async () => {
        throw new Error("Agent Host unavailable");
      }
    };
    const context = setup(void 0, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual(context.details.map((event) => ({
      sourceKey: event.sourceKey,
      modifiedCount: event.modifiedCount,
      totalModifiedCount: event.totalModifiedCount
    })), [{
      sourceKey: "source:reloadFromDisk",
      modifiedCount: 8,
      totalModifiedCount: 8
    }]);
    context.disposables.dispose();
  }));
  test("does not fall back when Agent Host attribution is deferred", () => runWithFakedTimers({}, async () => {
    let coverageGapTakeCount = 0;
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => true,
        release: () => {
        }
      }),
      prepareFlush: async () => {
        throw new AgentHostEditAttributionDeferredError(new Error("Prepare cancelled"));
      },
      takeCoverageGap: () => {
        coverageGapTakeCount++;
        return { editCount: 1, insertedCount: 42 };
      }
    };
    const context = setup(void 0, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual({
      detailCount: context.details.length,
      statsCount: context.stats.length,
      coverageGapTakeCount
    }, {
      detailCount: 0,
      statsCount: 0,
      coverageGapTakeCount: 0
    });
    context.disposables.dispose();
  }));
  test("does not emit external fallback when the Agent Host commit outcome is unknown", () => runWithFakedTimers({}, async () => {
    let coverageGapTakeCount = 0;
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => true,
        release: () => {
        }
      }),
      prepareFlush: async () => ({
        flushToken: "flush-1",
        agentModifiedCount: 3,
        commit: async () => {
          throw new AgentHostEditAttributionUnknownOutcomeError(new Error("Transport unavailable"));
        }
      }),
      takeCoverageGap: () => {
        coverageGapTakeCount++;
        return { editCount: 1, insertedCount: 42 };
      }
    };
    const context = setup(void 0, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual({
      detailCount: context.details.length,
      coverageGapTakeCount,
      stats: context.stats.map((event) => ({
        otherAIModifiedCount: event.otherAIModifiedCount,
        agentHostModifiedCount: event.agentHostModifiedCount,
        externalModifiedCount: event.externalModifiedCount,
        totalModifiedCharacters: event.totalModifiedCharacters
      }))
    }, {
      detailCount: 0,
      coverageGapTakeCount: 0,
      stats: [{
        otherAIModifiedCount: 0,
        agentHostModifiedCount: 3,
        externalModifiedCount: 0,
        totalModifiedCharacters: 3
      }]
    });
    context.disposables.dispose();
  }));
  test("commits zero-retention Agent Host windows", () => runWithFakedTimers({}, async () => {
    const commits = [];
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => false,
        release: () => {
        }
      }),
      prepareFlush: async (_resource, trigger) => trigger === "hashChange" ? {
        flushToken: "flush-1",
        agentModifiedCount: 0,
        commit: async (totalModifiedCount) => {
          commits.push(totalModifiedCount);
        }
      } : void 0
    };
    const context = setup(void 0, markerService);
    await timeout(10);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual({
      commits,
      detailCount: context.details.length,
      statsCount: context.stats.length
    }, {
      commits: [0],
      detailCount: 0,
      statsCount: 0
    });
    context.disposables.dispose();
  }));
});
function setup(visible = observableValue("visible", true), markerService, dirty = false) {
  const disposables = new DisposableStore();
  const headHash = observableValue("headHash", "hash-1");
  const branch = observableValue("branch", "main");
  const repo = {
    headCommitHashObs: headHash,
    headBranchNameObs: branch,
    isIgnored: async () => false
  };
  const details = [];
  const allDetails = [];
  const stats = [];
  const allStats = [];
  let uuid = 0;
  const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(), false, void 0, true));
  instantiationService.stub(ITelemetryService, {
    publicLog2(eventName, data) {
      const eventData = data;
      if (eventName === "editTelemetry.editSources.details") {
        allDetails.push(data);
        if (eventData?.mode === "longterm") {
          details.push(data);
        }
      } else if (eventName === "editTelemetry.editSources.stats") {
        allStats.push(data);
        if (eventData?.mode === "longterm") {
          stats.push(data);
        }
      }
    }
  });
  instantiationService.stubInstance(DiffService, { computeDiff: async (original, modified) => computeStringDiff(original, modified, { maxComputationTimeMs: 500 }, "advanced") });
  instantiationService.stubInstance(ScmAdapter, { getRepo: () => repo });
  instantiationService.stubInstance(UriVisibilityProvider, { isVisible: (_uri, reader) => visible.read(reader) });
  instantiationService.stub(IRandomService, {
    _serviceBrand: void 0,
    generateUuid: () => `stats-${++uuid}`,
    generatePrefixedUuid: (namespace) => `${namespace}-${++uuid}`
  });
  instantiationService.stub(IUserAttentionService, {
    _serviceBrand: void 0,
    isVsCodeFocused: constObservable(true),
    isUserActive: constObservable(true),
    hasUserAttention: constObservable(true),
    totalFocusTimeMs: 0,
    fireAfterGivenFocusTimePassed: () => Disposable.None
  });
  instantiationService.stub(ITextFileService, { isDirty: () => dirty });
  instantiationService.stub(IAiEditTelemetryService, {
    _serviceBrand: void 0,
    createSuggestionId: () => EditSuggestionId.newId(() => "sgt-test"),
    handleCodeAccepted: () => {
    },
    handleCodeRejected: () => {
    }
  });
  instantiationService.stub(ILogService, new NullLogService());
  const workspace = new MutableObservableWorkspace();
  const annotatedDocuments = disposables.add(new AnnotatedDocuments(workspace, instantiationService));
  const impl = disposables.add(new EditSourceTrackingImpl(constObservable(true), annotatedDocuments, markerService, instantiationService));
  const document = disposables.add(workspace.createDocument({
    uri: URI.file("C:\\repo\\file.ts"),
    initialValue: "hello",
    languageId: "typescript"
  }));
  return { disposables, document, details, stats, allDetails, allStats, headHash, branch, impl };
}
function chatEdit(requestId) {
  return EditSources.chatApplyEdits({
    modelId: void 0,
    sessionId: "session-1",
    requestId,
    languageId: "typescript",
    mode: "agent",
    extensionId: void 0,
    codeBlockSuggestionId: void 0
  });
}
class TestExternalEditCorrelation {
  constructor(waitForDrain = false) {
    this.waitForDrain = waitForDrain;
    this._onDidSuppress = new Emitter();
    this.onDidSuppress = this._onDidSuppress.event;
    this._onDidResolve = new Emitter();
    this.onDidResolve = this._onDidResolve.event;
    this._onDidInvalidate = new Emitter();
    this.onDidInvalidate = this._onDidInvalidate.event;
    this._drain = new DeferredPromise();
  }
  register() {
    return "observation";
  }
  isSuppressed() {
    return this.resolution !== void 0;
  }
  getResolution() {
    return this.resolution;
  }
  async waitForResolution(_ids, timeoutMs) {
    if (this.waitForDrain) {
      await Promise.race([this._drain.p, timeout(timeoutMs)]);
    }
  }
  release() {
  }
  resolve(source) {
    this.resolution = { id: "observation", source };
    this._onDidSuppress.fire("observation");
    this._onDidResolve.fire(this.resolution);
  }
  completeDrain() {
    this._drain.complete();
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVkaXRUZWxlbWV0cnlcXHRlc3RcXGJyb3dzZXJcXGVkaXRTb3VyY2VUcmFja2luZ0ltcGwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IGNvbXB1dGVTdHJpbmdEaWZmIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXZWJXb3JrZXIuanMnO1xuaW1wb3J0IHsgRWRpdFNvdXJjZXMsIEVkaXRTdWdnZXN0aW9uSWQsIFRleHRNb2RlbEVkaXRTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVc2VyQXR0ZW50aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJBdHRlbnRpb24vY29tbW9uL3VzZXJBdHRlbnRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IEFubm90YXRlZERvY3VtZW50cywgVXJpVmlzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9oZWxwZXJzL2Fubm90YXRlZERvY3VtZW50cy5qcyc7XG5pbXBvcnQgeyBEaWZmU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvaGVscGVycy9kb2N1bWVudFdpdGhBbm5vdGF0ZWRFZGl0cy5qcyc7XG5pbXBvcnQgeyBTdHJpbmdFZGl0V2l0aFJlYXNvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvaGVscGVycy9vYnNlcnZhYmxlV29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElBaUVkaXRUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZWxlbWV0cnkvYWlFZGl0VGVsZW1ldHJ5L2FpRWRpdFRlbGVtZXRyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdFNvdXJjZVRyYWNraW5nSW1wbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVsZW1ldHJ5L2VkaXRTb3VyY2VUcmFja2luZ0ltcGwuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uRGVmZXJyZWRFcnJvciwgQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uVW5rbm93bk91dGNvbWVFcnJvciwgSUFnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlLCBJRXh0ZXJuYWxFZGl0Q29ycmVsYXRpb24sIElFeHRlcm5hbEVkaXRDb3JyZWxhdGlvblJlc29sdXRpb24gfSBmcm9tICcuLi8uLi9icm93c2VyL3RlbGVtZXRyeS9hZ2VudEhvc3RFZGl0TWFya2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2NtUmVwb0FkYXB0ZXIsIFNjbUFkYXB0ZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3RlbGVtZXRyeS9zY21BZGFwdGVyLmpzJztcbmltcG9ydCB7IElSYW5kb21TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9yYW5kb21TZXJ2aWNlLmpzJztcbmltcG9ydCB7IE11dGFibGVPYnNlcnZhYmxlV29ya3NwYWNlIH0gZnJvbSAnLi9lZGl0VGVsZW1ldHJ5LnRlc3QuanMnO1xuXG5zdWl0ZSgnRWRpdCBTb3VyY2UgVHJhY2tpbmcgV2luZG93cycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZmx1c2hlcyBhbmQgcmVjcmVhdGVzIHRoZSBsb25nLXRlcm0gdHJhY2tlciBvbiBoYXNoIGFuZCBicmFuY2ggY2hhbmdlcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBzZXR1cCgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0Y29udGV4dC5kb2N1bWVudC5hcHBseUVkaXQoU3RyaW5nRWRpdFdpdGhSZWFzb24ucmVwbGFjZShjb250ZXh0LmRvY3VtZW50LmZpbmRSYW5nZSgnaGVsbG8nKSwgJ2FscGhhJywgY2hhdEVkaXQoJ3JlcXVlc3QtMScpKSk7XG5cdFx0YXdhaXQgdGltZW91dCgxNTAwKTtcblx0XHRjb250ZXh0LmhlYWRIYXNoLnNldCgnaGFzaC0yJywgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnRleHQuZG9jdW1lbnQuYXBwbHlFZGl0KFN0cmluZ0VkaXRXaXRoUmVhc29uLnJlcGxhY2UoY29udGV4dC5kb2N1bWVudC5maW5kUmFuZ2UoJ2FscGhhJyksICdiZXRhJywgY2hhdEVkaXQoJ3JlcXVlc3QtMicpKSk7XG5cdFx0YXdhaXQgdGltZW91dCgxNTAwKTtcblx0XHRjb250ZXh0LmJyYW5jaC5zZXQoJ2ZlYXR1cmUnLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmRldGFpbHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHR0cmlnZ2VyOiBldmVudC50cmlnZ2VyLFxuXHRcdFx0cmVxdWVzdElkOiBldmVudC5yZXF1ZXN0SWQsXG5cdFx0XHRtb2RpZmllZENvdW50OiBldmVudC5tb2RpZmllZENvdW50LFxuXHRcdFx0ZGVsdGFNb2RpZmllZENvdW50OiBldmVudC5kZWx0YU1vZGlmaWVkQ291bnQsXG5cdFx0fSkpLCBbXG5cdFx0XHR7IHRyaWdnZXI6ICdoYXNoQ2hhbmdlJywgcmVxdWVzdElkOiAncmVxdWVzdC0xJywgbW9kaWZpZWRDb3VudDogNSwgZGVsdGFNb2RpZmllZENvdW50OiA1IH0sXG5cdFx0XHR7IHRyaWdnZXI6ICdicmFuY2hDaGFuZ2UnLCByZXF1ZXN0SWQ6ICdyZXF1ZXN0LTInLCBtb2RpZmllZENvdW50OiAzLCBkZWx0YU1vZGlmaWVkQ291bnQ6IDMgfSxcblx0XHRdKTtcblxuXHRcdGNvbnRleHQuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnZmx1c2hlcyB0aGUgbG9uZy10ZXJtIHRyYWNrZXIgd2hlbiB0aGUgZG9jdW1lbnQgY2xvc2VzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IHNldHVwKCk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRjb250ZXh0LmRvY3VtZW50LmFwcGx5RWRpdChTdHJpbmdFZGl0V2l0aFJlYXNvbi5yZXBsYWNlKGNvbnRleHQuZG9jdW1lbnQuZmluZFJhbmdlKCdoZWxsbycpLCAnYWxwaGEnLCBjaGF0RWRpdCgncmVxdWVzdC0xJykpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDE1MDApO1xuXHRcdGNvbnRleHQuZG9jdW1lbnQuZGlzcG9zZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQuZGV0YWlscy5tYXAoZXZlbnQgPT4gKHtcblx0XHRcdHRyaWdnZXI6IGV2ZW50LnRyaWdnZXIsXG5cdFx0XHRyZXF1ZXN0SWQ6IGV2ZW50LnJlcXVlc3RJZCxcblx0XHR9KSksIFt7IHRyaWdnZXI6ICdjbG9zZWQnLCByZXF1ZXN0SWQ6ICdyZXF1ZXN0LTEnIH1dKTtcblxuXHRcdGNvbnRleHQuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnZmx1c2hlcyBhbmQgcmVjcmVhdGVzIHRoZSBsb25nLXRlcm0gdHJhY2tlciBhZnRlciB0ZW4gaG91cnMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gc2V0dXAoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGNvbnRleHQuZG9jdW1lbnQuYXBwbHlFZGl0KFN0cmluZ0VkaXRXaXRoUmVhc29uLnJlcGxhY2UoY29udGV4dC5kb2N1bWVudC5maW5kUmFuZ2UoJ2hlbGxvJyksICdhbHBoYScsIGNoYXRFZGl0KCdyZXF1ZXN0LTEnKSkpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTUwMCk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCAqIDYwICogNjAgKiAxMDAwKTtcblxuXHRcdGNvbnRleHQuZG9jdW1lbnQuYXBwbHlFZGl0KFN0cmluZ0VkaXRXaXRoUmVhc29uLnJlcGxhY2UoY29udGV4dC5kb2N1bWVudC5maW5kUmFuZ2UoJ2FscGhhJyksICdiZXRhJywgY2hhdEVkaXQoJ3JlcXVlc3QtMicpKSk7XG5cdFx0YXdhaXQgdGltZW91dCgxNTAwKTtcblx0XHRjb250ZXh0LmhlYWRIYXNoLnNldCgnaGFzaC0yJywgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5kZXRhaWxzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0dHJpZ2dlcjogZXZlbnQudHJpZ2dlcixcblx0XHRcdHJlcXVlc3RJZDogZXZlbnQucmVxdWVzdElkLFxuXHRcdH0pKSwgW1xuXHRcdFx0eyB0cmlnZ2VyOiAnMTBob3VycycsIHJlcXVlc3RJZDogJ3JlcXVlc3QtMScgfSxcblx0XHRcdHsgdHJpZ2dlcjogJ2hhc2hDaGFuZ2UnLCByZXF1ZXN0SWQ6ICdyZXF1ZXN0LTInIH0sXG5cdFx0XSk7XG5cblx0XHRjb250ZXh0LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2VtaXRzIG9ubHkgdGhlIHRvcCB0aGlydHkgbG9uZy10ZXJtIHNvdXJjZXMgYnkgcmV0YWluZWQgY291bnQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gc2V0dXAoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGZvciAobGV0IGkgPSAxOyBpIDw9IDMxOyBpKyspIHtcblx0XHRcdGNvbnRleHQuZG9jdW1lbnQuYXBwbHlFZGl0KFN0cmluZ0VkaXRXaXRoUmVhc29uLnJlcGxhY2UoXG5cdFx0XHRcdE9mZnNldFJhbmdlLmVtcHR5QXQoY29udGV4dC5kb2N1bWVudC52YWx1ZS5nZXQoKS52YWx1ZS5sZW5ndGgpLFxuXHRcdFx0XHQneCcucmVwZWF0KGkpLFxuXHRcdFx0XHRFZGl0U291cmNlcy51bmtub3duKHsgbmFtZTogYHNvdXJjZS0ke2l9YCB9KSxcblx0XHRcdCkpO1xuXHRcdH1cblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRjb250ZXh0LmhlYWRIYXNoLnNldCgnaGFzaC0yJywgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y291bnQ6IGNvbnRleHQuZGV0YWlscy5sZW5ndGgsXG5cdFx0XHRmaXJzdDogY29udGV4dC5kZXRhaWxzWzBdLnNvdXJjZUtleSxcblx0XHRcdGxhc3Q6IGNvbnRleHQuZGV0YWlscy5hdCgtMSk/LnNvdXJjZUtleSxcblx0XHRcdGNvbnRhaW5zU21hbGxlc3Q6IGNvbnRleHQuZGV0YWlscy5zb21lKGV2ZW50ID0+IGV2ZW50LnNvdXJjZUtleSA9PT0gJ3NvdXJjZTp1bmtub3duLW5hbWU6c291cmNlLTEnKSxcblx0XHR9LCB7XG5cdFx0XHRjb3VudDogMzAsXG5cdFx0XHRmaXJzdDogJ3NvdXJjZTp1bmtub3duLW5hbWU6c291cmNlLTMxJyxcblx0XHRcdGxhc3Q6ICdzb3VyY2U6dW5rbm93bi1uYW1lOnNvdXJjZS0yJyxcblx0XHRcdGNvbnRhaW5zU21hbGxlc3Q6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0Y29udGV4dC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdzdGFydHMgYWZ0ZXIgZmlyc3QgdmlzaWJpbGl0eSBhbmQga2VlcHMgb25seSB0aGUgbG9uZy10ZXJtIHRyYWNrZXIgd2hpbGUgaGlkZGVuJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IG9ic2VydmFibGVWYWx1ZSgndmlzaWJsZScsIGZhbHNlKTtcblx0XHRjb25zdCBjb250ZXh0ID0gc2V0dXAodmlzaWJsZSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dC5pbXBsLmRvY3NTdGF0ZS5nZXQoKS5zaXplLCAwKTtcblxuXHRcdHZpc2libGUuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgdmlzaWJsZVN0YXRlID0gY29udGV4dC5pbXBsLmRvY3NTdGF0ZS5nZXQoKS5nZXQoY29udGV4dC5kb2N1bWVudCk7XG5cdFx0aWYgKCF2aXNpYmxlU3RhdGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgdmlzaWJsZSBkb2N1bWVudCBzdGF0ZScpO1xuXHRcdH1cblx0XHRhc3NlcnQub2sodmlzaWJsZVN0YXRlLmxvbmd0ZXJtVHJhY2tlci5nZXQoKSk7XG5cdFx0Y29uc3QgZmlyc3RXaW5kb3dlZFRyYWNrZXIgPSB2aXNpYmxlU3RhdGUud2luZG93ZWRUcmFja2VyLmdldCgpO1xuXHRcdGFzc2VydC5vayhmaXJzdFdpbmRvd2VkVHJhY2tlcik7XG5cdFx0YXNzZXJ0Lm9rKHZpc2libGVTdGF0ZS53aW5kb3dlZEZvY3VzVHJhY2tlci5nZXQoKSk7XG5cblx0XHR2aXNpYmxlLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBoaWRkZW5TdGF0ZSA9IGNvbnRleHQuaW1wbC5kb2NzU3RhdGUuZ2V0KCkuZ2V0KGNvbnRleHQuZG9jdW1lbnQpO1xuXHRcdGlmICghaGlkZGVuU3RhdGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgaGlkZGVuIGRvY3VtZW50IHN0YXRlJyk7XG5cdFx0fVxuXHRcdGFzc2VydC5vayhoaWRkZW5TdGF0ZS5sb25ndGVybVRyYWNrZXIuZ2V0KCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaWRkZW5TdGF0ZS53aW5kb3dlZFRyYWNrZXIuZ2V0KCksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpZGRlblN0YXRlLndpbmRvd2VkRm9jdXNUcmFja2VyLmdldCgpLCB1bmRlZmluZWQpO1xuXG5cdFx0dmlzaWJsZS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCB2aXNpYmxlQWdhaW5TdGF0ZSA9IGNvbnRleHQuaW1wbC5kb2NzU3RhdGUuZ2V0KCkuZ2V0KGNvbnRleHQuZG9jdW1lbnQpO1xuXHRcdGlmICghdmlzaWJsZUFnYWluU3RhdGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgdmlzaWJsZSBkb2N1bWVudCBzdGF0ZSBhZnRlciByZW9wZW5pbmcnKTtcblx0XHR9XG5cdFx0YXNzZXJ0Lm9rKHZpc2libGVBZ2FpblN0YXRlLndpbmRvd2VkVHJhY2tlci5nZXQoKSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHZpc2libGVBZ2FpblN0YXRlLndpbmRvd2VkVHJhY2tlci5nZXQoKSwgZmlyc3RXaW5kb3dlZFRyYWNrZXIpO1xuXG5cdFx0Y29udGV4dC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdmYW5zIG91dCBBZ2VudCBIb3N0IHJlbG9hZCBhdHRyaWJ1dGlvbiB0byBib3RoIGZvY3VzIHdpbmRvd3MnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB2aXNpYmxlID0gb2JzZXJ2YWJsZVZhbHVlKCd2aXNpYmxlJywgdHJ1ZSk7XG5cdFx0Y29uc3QgY29ycmVsYXRpb24gPSBuZXcgVGVzdEV4dGVybmFsRWRpdENvcnJlbGF0aW9uKCk7XG5cdFx0bGV0IHByZXBhcmVDb3VudCA9IDA7XG5cdFx0Y29uc3QgbWFya2VyU2VydmljZTogSUFnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlID0ge1xuXHRcdFx0Y3JlYXRlQ29ycmVsYXRpb246ICgpID0+IGNvcnJlbGF0aW9uLFxuXHRcdFx0cHJlcGFyZUZsdXNoOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHByZXBhcmVDb3VudCsrO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRleHQgPSBzZXR1cCh2aXNpYmxlLCBtYXJrZXJTZXJ2aWNlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGNvbnRleHQuZG9jdW1lbnQuYXBwbHlFZGl0KFN0cmluZ0VkaXRXaXRoUmVhc29uLnJlcGxhY2UoY29udGV4dC5kb2N1bWVudC5maW5kUmFuZ2UoJ2hlbGxvJyksICdleHRlcm5hbCcsIEVkaXRTb3VyY2VzLnJlbG9hZEZyb21EaXNrKCkpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDE1MDApO1xuXHRcdGNvcnJlbGF0aW9uLnJlc29sdmUoRWRpdFNvdXJjZXMuYWdlbnRIb3N0Q2hhdEFwcGx5RWRpdHMoe1xuXHRcdFx0bW9kZWxJZDogJ2dwdC01Jyxcblx0XHRcdHNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHRyZXF1ZXN0SWQ6ICd0dXJuLTEnLFxuXHRcdFx0aGFybmVzczogJ2NvcGlsb3RjbGknLFxuXHRcdH0pKTtcblx0XHR2aXNpYmxlLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGNvbnN0IGZvY3VzRGV0YWlscyA9IGNvbnRleHQuYWxsRGV0YWlscy5maWx0ZXIoZXZlbnQgPT4gZXZlbnQubW9kZSAhPT0gJ2xvbmd0ZXJtJyk7XG5cdFx0Y29uc3QgZm9jdXNTdGF0cyA9IGNvbnRleHQuYWxsU3RhdHMuZmlsdGVyKGV2ZW50ID0+IGV2ZW50Lm1vZGUgIT09ICdsb25ndGVybScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGV0YWlsczogZm9jdXNEZXRhaWxzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0XHRtb2RlOiBldmVudC5tb2RlLFxuXHRcdFx0XHRzb3VyY2VLZXk6IGV2ZW50LnNvdXJjZUtleSxcblx0XHRcdFx0c291cmNlS2V5Q2xlYW5lZDogZXZlbnQuc291cmNlS2V5Q2xlYW5lZCxcblx0XHRcdFx0b3JpZ2luOiBldmVudC5vcmlnaW4sXG5cdFx0XHRcdGhhcm5lc3M6IGV2ZW50Lmhhcm5lc3MsXG5cdFx0XHRcdG1vZGVsSWQ6IGV2ZW50Lm1vZGVsSWQsXG5cdFx0XHRcdGNvbnZlcnNhdGlvbklkOiBldmVudC5jb252ZXJzYXRpb25JZCxcblx0XHRcdFx0cmVxdWVzdElkOiBldmVudC5yZXF1ZXN0SWQsXG5cdFx0XHRcdG1vZGlmaWVkQ291bnQ6IGV2ZW50Lm1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGRlbHRhTW9kaWZpZWRDb3VudDogZXZlbnQuZGVsdGFNb2RpZmllZENvdW50LFxuXHRcdFx0XHR0b3RhbE1vZGlmaWVkQ291bnQ6IGV2ZW50LnRvdGFsTW9kaWZpZWRDb3VudCxcblx0XHRcdH0pKS5zb3J0KChhLCBiKSA9PiBhLm1vZGUubG9jYWxlQ29tcGFyZShiLm1vZGUpKSxcblx0XHRcdHN0YXRzOiBmb2N1c1N0YXRzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0XHRtb2RlOiBldmVudC5tb2RlLFxuXHRcdFx0XHRvdGhlckFJTW9kaWZpZWRDb3VudDogZXZlbnQub3RoZXJBSU1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGFnZW50SG9zdE1vZGlmaWVkQ291bnQ6IGV2ZW50LmFnZW50SG9zdE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGV4dGVybmFsTW9kaWZpZWRDb3VudDogZXZlbnQuZXh0ZXJuYWxNb2RpZmllZENvdW50LFxuXHRcdFx0XHR0b3RhbE1vZGlmaWVkQ2hhcmFjdGVyczogZXZlbnQudG90YWxNb2RpZmllZENoYXJhY3RlcnMsXG5cdFx0XHR9KSkuc29ydCgoYSwgYikgPT4gYS5tb2RlLmxvY2FsZUNvbXBhcmUoYi5tb2RlKSksXG5cdFx0XHRzdGF0c1V1aWRzOiBuZXcgU2V0KGZvY3VzRGV0YWlscy5tYXAoZXZlbnQgPT4gZXZlbnQuc3RhdHNVdWlkKSkuc2l6ZSxcblx0XHRcdHByZXBhcmVDb3VudCxcblx0XHR9LCB7XG5cdFx0XHRkZXRhaWxzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRtb2RlOiAnMTBtaW5Gb2N1c1dpbmRvdycsXG5cdFx0XHRcdFx0c291cmNlS2V5OiAnc291cmNlOkNoYXQuYXBwbHlFZGl0cy0kbW9kZWxJZDpncHQtNS0kaGFybmVzczpjb3BpbG90Y2xpLSRvcmlnaW46YWdlbnRIb3N0Jyxcblx0XHRcdFx0XHRzb3VyY2VLZXlDbGVhbmVkOiAnc291cmNlOkNoYXQuYXBwbHlFZGl0cy0kaGFybmVzczpjb3BpbG90Y2xpLSRvcmlnaW46YWdlbnRIb3N0Jyxcblx0XHRcdFx0XHRvcmlnaW46ICdhZ2VudEhvc3QnLFxuXHRcdFx0XHRcdGhhcm5lc3M6ICdjb3BpbG90Y2xpJyxcblx0XHRcdFx0XHRtb2RlbElkOiAnZ3B0LTUnLFxuXHRcdFx0XHRcdGNvbnZlcnNhdGlvbklkOiAnc2Vzc2lvbi0xJyxcblx0XHRcdFx0XHRyZXF1ZXN0SWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ291bnQ6IDgsXG5cdFx0XHRcdFx0ZGVsdGFNb2RpZmllZENvdW50OiA4LFxuXHRcdFx0XHRcdHRvdGFsTW9kaWZpZWRDb3VudDogOCxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG1vZGU6ICcyMG1pbkZvY3VzV2luZG93Jyxcblx0XHRcdFx0XHRzb3VyY2VLZXk6ICdzb3VyY2U6Q2hhdC5hcHBseUVkaXRzLSRtb2RlbElkOmdwdC01LSRoYXJuZXNzOmNvcGlsb3RjbGktJG9yaWdpbjphZ2VudEhvc3QnLFxuXHRcdFx0XHRcdHNvdXJjZUtleUNsZWFuZWQ6ICdzb3VyY2U6Q2hhdC5hcHBseUVkaXRzLSRoYXJuZXNzOmNvcGlsb3RjbGktJG9yaWdpbjphZ2VudEhvc3QnLFxuXHRcdFx0XHRcdG9yaWdpbjogJ2FnZW50SG9zdCcsXG5cdFx0XHRcdFx0aGFybmVzczogJ2NvcGlsb3RjbGknLFxuXHRcdFx0XHRcdG1vZGVsSWQ6ICdncHQtNScsXG5cdFx0XHRcdFx0Y29udmVyc2F0aW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0XHRcdHJlcXVlc3RJZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0bW9kaWZpZWRDb3VudDogOCxcblx0XHRcdFx0XHRkZWx0YU1vZGlmaWVkQ291bnQ6IDgsXG5cdFx0XHRcdFx0dG90YWxNb2RpZmllZENvdW50OiA4LFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHRcdHN0YXRzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRtb2RlOiAnMTBtaW5Gb2N1c1dpbmRvdycsXG5cdFx0XHRcdFx0b3RoZXJBSU1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRcdFx0YWdlbnRIb3N0TW9kaWZpZWRDb3VudDogOCxcblx0XHRcdFx0XHRleHRlcm5hbE1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRcdFx0dG90YWxNb2RpZmllZENoYXJhY3RlcnM6IDgsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRtb2RlOiAnMjBtaW5Gb2N1c1dpbmRvdycsXG5cdFx0XHRcdFx0b3RoZXJBSU1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRcdFx0YWdlbnRIb3N0TW9kaWZpZWRDb3VudDogOCxcblx0XHRcdFx0XHRleHRlcm5hbE1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRcdFx0dG90YWxNb2RpZmllZENoYXJhY3RlcnM6IDgsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0c3RhdHNVdWlkczogMixcblx0XHRcdHByZXBhcmVDb3VudDogMCxcblx0XHR9KTtcblxuXHRcdGNvbnRleHQuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnZHJhaW5zIGEgbGF0ZSBBZ2VudCBIb3N0IG1hcmtlciBiZWZvcmUgZm9jdXMtd2luZG93IGVtaXNzaW9uJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IG9ic2VydmFibGVWYWx1ZSgndmlzaWJsZScsIHRydWUpO1xuXHRcdGNvbnN0IGNvcnJlbGF0aW9uID0gbmV3IFRlc3RFeHRlcm5hbEVkaXRDb3JyZWxhdGlvbih0cnVlKTtcblx0XHRjb25zdCBtYXJrZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UgPSB7XG5cdFx0XHRjcmVhdGVDb3JyZWxhdGlvbjogKCkgPT4gY29ycmVsYXRpb24sXG5cdFx0XHRwcmVwYXJlRmx1c2g6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRleHQgPSBzZXR1cCh2aXNpYmxlLCBtYXJrZXJTZXJ2aWNlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGNvbnRleHQuZG9jdW1lbnQuYXBwbHlFZGl0KFN0cmluZ0VkaXRXaXRoUmVhc29uLnJlcGxhY2UoY29udGV4dC5kb2N1bWVudC5maW5kUmFuZ2UoJ2hlbGxvJyksICdleHRlcm5hbCcsIEVkaXRTb3VyY2VzLnJlbG9hZEZyb21EaXNrKCkpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDE1MDApO1xuXHRcdHZpc2libGUuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0LmFsbERldGFpbHMubGVuZ3RoLCAwKTtcblxuXHRcdGNvcnJlbGF0aW9uLnJlc29sdmUoRWRpdFNvdXJjZXMuYWdlbnRIb3N0Q2hhdEFwcGx5RWRpdHMoe1xuXHRcdFx0bW9kZWxJZDogdW5kZWZpbmVkLFxuXHRcdFx0c2Vzc2lvbklkOiAnc2Vzc2lvbi0xJyxcblx0XHRcdHJlcXVlc3RJZDogJ3R1cm4tbGF0ZScsXG5cdFx0XHRoYXJuZXNzOiAnY2xhdWRlJyxcblx0XHR9KSk7XG5cdFx0Y29ycmVsYXRpb24uY29tcGxldGVEcmFpbigpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmFsbERldGFpbHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHRtb2RlOiBldmVudC5tb2RlLFxuXHRcdFx0aGFybmVzczogZXZlbnQuaGFybmVzcyxcblx0XHRcdHJlcXVlc3RJZDogZXZlbnQucmVxdWVzdElkLFxuXHRcdH0pKS5zb3J0KChhLCBiKSA9PiBhLm1vZGUubG9jYWxlQ29tcGFyZShiLm1vZGUpKSwgW1xuXHRcdFx0eyBtb2RlOiAnMTBtaW5Gb2N1c1dpbmRvdycsIGhhcm5lc3M6ICdjbGF1ZGUnLCByZXF1ZXN0SWQ6ICd0dXJuLWxhdGUnIH0sXG5cdFx0XHR7IG1vZGU6ICcyMG1pbkZvY3VzV2luZG93JywgaGFybmVzczogJ2NsYXVkZScsIHJlcXVlc3RJZDogJ3R1cm4tbGF0ZScgfSxcblx0XHRdKTtcblxuXHRcdGNvbnRleHQuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBleHRlcm5hbCBhdHRyaWJ1dGlvbiBhZnRlciB0aGUgZm9jdXMgY29ycmVsYXRpb24gZHJhaW4gdGltZXMgb3V0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IG9ic2VydmFibGVWYWx1ZSgndmlzaWJsZScsIHRydWUpO1xuXHRcdGNvbnN0IGNvcnJlbGF0aW9uID0gbmV3IFRlc3RFeHRlcm5hbEVkaXRDb3JyZWxhdGlvbih0cnVlKTtcblx0XHRjb25zdCBtYXJrZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UgPSB7XG5cdFx0XHRjcmVhdGVDb3JyZWxhdGlvbjogKCkgPT4gY29ycmVsYXRpb24sXG5cdFx0XHRwcmVwYXJlRmx1c2g6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRleHQgPSBzZXR1cCh2aXNpYmxlLCBtYXJrZXJTZXJ2aWNlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGNvbnRleHQuZG9jdW1lbnQuYXBwbHlFZGl0KFN0cmluZ0VkaXRXaXRoUmVhc29uLnJlcGxhY2UoY29udGV4dC5kb2N1bWVudC5maW5kUmFuZ2UoJ2hlbGxvJyksICdleHRlcm5hbCcsIEVkaXRTb3VyY2VzLnJlbG9hZEZyb21EaXNrKCkpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDE1MDApO1xuXHRcdHZpc2libGUuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMV8wMDEpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkZXRhaWxzOiBjb250ZXh0LmFsbERldGFpbHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHRcdG1vZGU6IGV2ZW50Lm1vZGUsXG5cdFx0XHRcdHNvdXJjZUtleTogZXZlbnQuc291cmNlS2V5LFxuXHRcdFx0XHRtb2RpZmllZENvdW50OiBldmVudC5tb2RpZmllZENvdW50LFxuXHRcdFx0XHR0b3RhbE1vZGlmaWVkQ291bnQ6IGV2ZW50LnRvdGFsTW9kaWZpZWRDb3VudCxcblx0XHRcdH0pKS5zb3J0KChhLCBiKSA9PiBhLm1vZGUubG9jYWxlQ29tcGFyZShiLm1vZGUpKSxcblx0XHRcdHN0YXRzOiBjb250ZXh0LmFsbFN0YXRzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0XHRtb2RlOiBldmVudC5tb2RlLFxuXHRcdFx0XHRhZ2VudEhvc3RNb2RpZmllZENvdW50OiBldmVudC5hZ2VudEhvc3RNb2RpZmllZENvdW50LFxuXHRcdFx0XHRleHRlcm5hbE1vZGlmaWVkQ291bnQ6IGV2ZW50LmV4dGVybmFsTW9kaWZpZWRDb3VudCxcblx0XHRcdFx0dG90YWxNb2RpZmllZENoYXJhY3RlcnM6IGV2ZW50LnRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzLFxuXHRcdFx0fSkpLnNvcnQoKGEsIGIpID0+IGEubW9kZS5sb2NhbGVDb21wYXJlKGIubW9kZSkpLFxuXHRcdH0sIHtcblx0XHRcdGRldGFpbHM6IFtcblx0XHRcdFx0eyBtb2RlOiAnMTBtaW5Gb2N1c1dpbmRvdycsIHNvdXJjZUtleTogJ3NvdXJjZTpyZWxvYWRGcm9tRGlzaycsIG1vZGlmaWVkQ291bnQ6IDgsIHRvdGFsTW9kaWZpZWRDb3VudDogOCB9LFxuXHRcdFx0XHR7IG1vZGU6ICcyMG1pbkZvY3VzV2luZG93Jywgc291cmNlS2V5OiAnc291cmNlOnJlbG9hZEZyb21EaXNrJywgbW9kaWZpZWRDb3VudDogOCwgdG90YWxNb2RpZmllZENvdW50OiA4IH0sXG5cdFx0XHRdLFxuXHRcdFx0c3RhdHM6IFtcblx0XHRcdFx0eyBtb2RlOiAnMTBtaW5Gb2N1c1dpbmRvdycsIGFnZW50SG9zdE1vZGlmaWVkQ291bnQ6IDAsIGV4dGVybmFsTW9kaWZpZWRDb3VudDogOCwgdG90YWxNb2RpZmllZENoYXJhY3RlcnM6IDggfSxcblx0XHRcdFx0eyBtb2RlOiAnMjBtaW5Gb2N1c1dpbmRvdycsIGFnZW50SG9zdE1vZGlmaWVkQ291bnQ6IDAsIGV4dGVybmFsTW9kaWZpZWRDb3VudDogOCwgdG90YWxNb2RpZmllZENoYXJhY3RlcnM6IDggfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cblx0XHRjb250ZXh0LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2Nvb3JkaW5hdGVzIGxvbmctdGVybSB0b3RhbHMgd2l0aCBBZ2VudCBIb3N0IGF0dHJpYnV0aW9uJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWl0czogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCBtYXJrZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UgPSB7XG5cdFx0XHRjcmVhdGVDb3JyZWxhdGlvbjogKCkgPT4gKHtcblx0XHRcdFx0b25EaWRTdXBwcmVzczogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRJbnZhbGlkYXRlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRyZWdpc3RlcjogKCkgPT4gJ29ic2VydmF0aW9uJyxcblx0XHRcdFx0aXNTdXBwcmVzc2VkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0cmVsZWFzZTogKCkgPT4geyB9LFxuXHRcdFx0fSksXG5cdFx0XHRwcmVwYXJlRmx1c2g6IGFzeW5jIChfcmVzb3VyY2UsIHRyaWdnZXIsIHN0YXRzVXVpZCwgaXNEaXJ0eSkgPT4gaXNEaXJ0eSB8fCB0cmlnZ2VyICE9PSAnaGFzaENoYW5nZScgPyB1bmRlZmluZWQgOiAoe1xuXHRcdFx0XHRmbHVzaFRva2VuOiAnZmx1c2gtMScsXG5cdFx0XHRcdGFnZW50TW9kaWZpZWRDb3VudDogMyxcblx0XHRcdFx0Y29tbWl0OiBhc3luYyB0b3RhbE1vZGlmaWVkQ291bnQgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0c1V1aWQsICdzdGF0cy0yJyk7XG5cdFx0XHRcdFx0Y29tbWl0cy5wdXNoKHRvdGFsTW9kaWZpZWRDb3VudCk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRleHQgPSBzZXR1cCh1bmRlZmluZWQsIG1hcmtlclNlcnZpY2UpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0Y29udGV4dC5kb2N1bWVudC5hcHBseUVkaXQoU3RyaW5nRWRpdFdpdGhSZWFzb24ucmVwbGFjZShjb250ZXh0LmRvY3VtZW50LmZpbmRSYW5nZSgnaGVsbG8nKSwgJ2FscGhhJywgY2hhdEVkaXQoJ3JlcXVlc3QtMScpKSk7XG5cdFx0YXdhaXQgdGltZW91dCgxNTAwKTtcblx0XHRjb250ZXh0LmhlYWRIYXNoLnNldCgnaGFzaC0yJywgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGV0YWlsczogY29udGV4dC5kZXRhaWxzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0XHRzdGF0c1V1aWQ6IGV2ZW50LnN0YXRzVXVpZCxcblx0XHRcdFx0bW9kaWZpZWRDb3VudDogZXZlbnQubW9kaWZpZWRDb3VudCxcblx0XHRcdFx0dG90YWxNb2RpZmllZENvdW50OiBldmVudC50b3RhbE1vZGlmaWVkQ291bnQsXG5cdFx0XHR9KSksXG5cdFx0XHRzdGF0czogY29udGV4dC5zdGF0cy5tYXAoZXZlbnQgPT4gKHtcblx0XHRcdFx0c3RhdHNVdWlkOiBldmVudC5zdGF0c1V1aWQsXG5cdFx0XHRcdG90aGVyQUlNb2RpZmllZENvdW50OiBldmVudC5vdGhlckFJTW9kaWZpZWRDb3VudCxcblx0XHRcdFx0YWdlbnRIb3N0TW9kaWZpZWRDb3VudDogZXZlbnQuYWdlbnRIb3N0TW9kaWZpZWRDb3VudCxcblx0XHRcdFx0dG90YWxNb2RpZmllZENoYXJhY3RlcnM6IGV2ZW50LnRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzLFxuXHRcdFx0fSkpLFxuXHRcdFx0Y29tbWl0cyxcblx0XHR9LCB7XG5cdFx0XHRkZXRhaWxzOiBbe1xuXHRcdFx0XHRzdGF0c1V1aWQ6ICdzdGF0cy0yJyxcblx0XHRcdFx0bW9kaWZpZWRDb3VudDogNSxcblx0XHRcdFx0dG90YWxNb2RpZmllZENvdW50OiA4LFxuXHRcdFx0fV0sXG5cdFx0XHRzdGF0czogW3tcblx0XHRcdFx0c3RhdHNVdWlkOiAnc3RhdHMtMicsXG5cdFx0XHRcdG90aGVyQUlNb2RpZmllZENvdW50OiA1LFxuXHRcdFx0XHRhZ2VudEhvc3RNb2RpZmllZENvdW50OiAzLFxuXHRcdFx0XHR0b3RhbE1vZGlmaWVkQ2hhcmFjdGVyczogOCxcblx0XHRcdH1dLFxuXHRcdFx0Y29tbWl0czogWzhdLFxuXHRcdH0pO1xuXG5cdFx0Y29udGV4dC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZWNvbXB1dGVzIHdvcmtiZW5jaCB0b3RhbHMgYWZ0ZXIgYSBsYXRlIEFnZW50IG1hcmtlcicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG9uRGlkU3VwcHJlc3MgPSBuZXcgRW1pdHRlcjxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgcHJlcGFyZVN0YXJ0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgY29udGludWVQcmVwYXJlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGxldCBzdXBwcmVzc2VkID0gZmFsc2U7XG5cdFx0Y29uc3QgY29tbWl0dGVkVG90YWxzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IG1hcmtlclNlcnZpY2U6IElBZ2VudEhvc3RFZGl0TWFya2VyU2VydmljZSA9IHtcblx0XHRcdGNyZWF0ZUNvcnJlbGF0aW9uOiAoKSA9PiAoe1xuXHRcdFx0XHRvbkRpZFN1cHByZXNzOiBvbkRpZFN1cHByZXNzLmV2ZW50LFxuXHRcdFx0XHRvbkRpZEludmFsaWRhdGU6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdHJlZ2lzdGVyOiAoKSA9PiAnb2JzZXJ2YXRpb24nLFxuXHRcdFx0XHRpc1N1cHByZXNzZWQ6ICgpID0+IHN1cHByZXNzZWQsXG5cdFx0XHRcdHJlbGVhc2U6ICgpID0+IHsgfSxcblx0XHRcdH0pLFxuXHRcdFx0cHJlcGFyZUZsdXNoOiBhc3luYyAoX3Jlc291cmNlLCB0cmlnZ2VyKSA9PiB7XG5cdFx0XHRcdGlmICh0cmlnZ2VyICE9PSAnaGFzaENoYW5nZScpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHByZXBhcmVTdGFydGVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGF3YWl0IGNvbnRpbnVlUHJlcGFyZS5wO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGZsdXNoVG9rZW46ICdmbHVzaC0xJyxcblx0XHRcdFx0XHRhZ2VudE1vZGlmaWVkQ291bnQ6IDMsXG5cdFx0XHRcdFx0Y29tbWl0OiBhc3luYyB0b3RhbE1vZGlmaWVkQ291bnQgPT4ge1xuXHRcdFx0XHRcdFx0Y29tbWl0dGVkVG90YWxzLnB1c2godG90YWxNb2RpZmllZENvdW50KTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRleHQgPSBzZXR1cCh1bmRlZmluZWQsIG1hcmtlclNlcnZpY2UpO1xuXHRcdGNvbnRleHQuZGlzcG9zYWJsZXMuYWRkKG9uRGlkU3VwcHJlc3MpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0Y29udGV4dC5kb2N1bWVudC5hcHBseUVkaXQoU3RyaW5nRWRpdFdpdGhSZWFzb24ucmVwbGFjZShjb250ZXh0LmRvY3VtZW50LmZpbmRSYW5nZSgnaGVsbG8nKSwgJ2V4dGVybmFsJywgRWRpdFNvdXJjZXMucmVsb2FkRnJvbURpc2soKSkpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTUwMCk7XG5cdFx0Y29udGV4dC5oZWFkSGFzaC5zZXQoJ2hhc2gtMicsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgcHJlcGFyZVN0YXJ0ZWQucDtcblx0XHRzdXBwcmVzc2VkID0gdHJ1ZTtcblx0XHRvbkRpZFN1cHByZXNzLmZpcmUoJ29ic2VydmF0aW9uJyk7XG5cdFx0Y29udGludWVQcmVwYXJlLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbW1pdHRlZFRvdGFscyxcblx0XHRcdHN0YXRzOiBjb250ZXh0LnN0YXRzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0XHRvdGhlckFJTW9kaWZpZWRDb3VudDogZXZlbnQub3RoZXJBSU1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGFnZW50SG9zdE1vZGlmaWVkQ291bnQ6IGV2ZW50LmFnZW50SG9zdE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGV4dGVybmFsTW9kaWZpZWRDb3VudDogZXZlbnQuZXh0ZXJuYWxNb2RpZmllZENvdW50LFxuXHRcdFx0XHR0b3RhbE1vZGlmaWVkQ2hhcmFjdGVyczogZXZlbnQudG90YWxNb2RpZmllZENoYXJhY3RlcnMsXG5cdFx0XHR9KSksXG5cdFx0fSwge1xuXHRcdFx0Y29tbWl0dGVkVG90YWxzOiBbM10sXG5cdFx0XHRzdGF0czogW3tcblx0XHRcdFx0b3RoZXJBSU1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRcdGFnZW50SG9zdE1vZGlmaWVkQ291bnQ6IDMsXG5cdFx0XHRcdGV4dGVybmFsTW9kaWZpZWRDb3VudDogMCxcblx0XHRcdFx0dG90YWxNb2RpZmllZENoYXJhY3RlcnM6IDMsXG5cdFx0XHR9XSxcblx0XHR9KTtcblxuXHRcdGNvbnRleHQuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnZGVmZXJzIEFnZW50IEhvc3QgYXR0cmlidXRpb24gd2hpbGUgdGhlIG1vZGVsIGlzIGRpcnR5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlydHlTdGF0ZXM6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGxldCBjb3ZlcmFnZUdhcFRha2VDb3VudCA9IDA7XG5cdFx0Y29uc3QgbWFya2VyU2VydmljZTogSUFnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlID0ge1xuXHRcdFx0Y3JlYXRlQ29ycmVsYXRpb246ICgpID0+ICh7XG5cdFx0XHRcdG9uRGlkU3VwcHJlc3M6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkSW52YWxpZGF0ZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0cmVnaXN0ZXI6ICgpID0+ICdvYnNlcnZhdGlvbicsXG5cdFx0XHRcdGlzU3VwcHJlc3NlZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdHJlbGVhc2U6ICgpID0+IHsgfSxcblx0XHRcdH0pLFxuXHRcdFx0cHJlcGFyZUZsdXNoOiBhc3luYyAoX3Jlc291cmNlLCB0cmlnZ2VyLCBfc3RhdHNVdWlkLCBpc0RpcnR5KSA9PiB7XG5cdFx0XHRcdGlmICh0cmlnZ2VyID09PSAnaGFzaENoYW5nZScpIHtcblx0XHRcdFx0XHRkaXJ0eVN0YXRlcy5wdXNoKGlzRGlydHkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0dGFrZUNvdmVyYWdlR2FwOiAoKSA9PiB7XG5cdFx0XHRcdGNvdmVyYWdlR2FwVGFrZUNvdW50Kys7XG5cdFx0XHRcdHJldHVybiB7IGVkaXRDb3VudDogMSwgaW5zZXJ0ZWRDb3VudDogNDIgfTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBjb250ZXh0ID0gc2V0dXAodW5kZWZpbmVkLCBtYXJrZXJTZXJ2aWNlLCB0cnVlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGNvbnRleHQuZG9jdW1lbnQuYXBwbHlFZGl0KFN0cmluZ0VkaXRXaXRoUmVhc29uLnJlcGxhY2UoY29udGV4dC5kb2N1bWVudC5maW5kUmFuZ2UoJ2hlbGxvJyksICdhbHBoYScsIGNoYXRFZGl0KCdyZXF1ZXN0LTEnKSkpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTUwMCk7XG5cdFx0Y29udGV4dC5oZWFkSGFzaC5zZXQoJ2hhc2gtMicsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRpcnR5U3RhdGVzLFxuXHRcdFx0Y292ZXJhZ2VHYXBUYWtlQ291bnQsXG5cdFx0XHRkZXRhaWxzOiBjb250ZXh0LmRldGFpbHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHRcdG1vZGlmaWVkQ291bnQ6IGV2ZW50Lm1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdHRvdGFsTW9kaWZpZWRDb3VudDogZXZlbnQudG90YWxNb2RpZmllZENvdW50LFxuXHRcdFx0fSkpLFxuXHRcdH0sIHtcblx0XHRcdGRpcnR5U3RhdGVzOiBbdHJ1ZV0sXG5cdFx0XHRjb3ZlcmFnZUdhcFRha2VDb3VudDogMCxcblx0XHRcdGRldGFpbHM6IFt7XG5cdFx0XHRcdG1vZGlmaWVkQ291bnQ6IDUsXG5cdFx0XHRcdHRvdGFsTW9kaWZpZWRDb3VudDogNSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXG5cdFx0Y29udGV4dC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBmYWxsIGJhY2sgbWF0Y2hlZCBBZ2VudCBlZGl0cyB3aGlsZSB0aGUgbW9kZWwgaXMgZGlydHknLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYXJrZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UgPSB7XG5cdFx0XHRjcmVhdGVDb3JyZWxhdGlvbjogKCkgPT4gKHtcblx0XHRcdFx0b25EaWRTdXBwcmVzczogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRJbnZhbGlkYXRlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRyZWdpc3RlcjogKCkgPT4gJ29ic2VydmF0aW9uJyxcblx0XHRcdFx0aXNTdXBwcmVzc2VkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRyZWxlYXNlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHRcdHByZXBhcmVGbHVzaDogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0Y29uc3QgY29udGV4dCA9IHNldHVwKHVuZGVmaW5lZCwgbWFya2VyU2VydmljZSwgdHJ1ZSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRjb250ZXh0LmRvY3VtZW50LmFwcGx5RWRpdChTdHJpbmdFZGl0V2l0aFJlYXNvbi5yZXBsYWNlKGNvbnRleHQuZG9jdW1lbnQuZmluZFJhbmdlKCdoZWxsbycpLCAnZXh0ZXJuYWwnLCBFZGl0U291cmNlcy5yZWxvYWRGcm9tRGlzaygpKSk7XG5cdFx0YXdhaXQgdGltZW91dCgxNTAwKTtcblx0XHRjb250ZXh0LmhlYWRIYXNoLnNldCgnaGFzaC0yJywgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGV0YWlsQ291bnQ6IGNvbnRleHQuZGV0YWlscy5sZW5ndGgsXG5cdFx0XHRzdGF0c0NvdW50OiBjb250ZXh0LnN0YXRzLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRkZXRhaWxDb3VudDogMCxcblx0XHRcdHN0YXRzQ291bnQ6IDAsXG5cdFx0fSk7XG5cblx0XHRjb250ZXh0LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2tlZXBzIHVubWF0Y2hlZCByZWxvYWRzIGFzIHN0YW5kYXJkIGV4dGVybmFsIHRlbGVtZXRyeScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBvYnNlcnZhdGlvbiA9IDA7XG5cdFx0Y29uc3QgbWFya2VyU2VydmljZTogSUFnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlID0ge1xuXHRcdFx0Y3JlYXRlQ29ycmVsYXRpb246ICgpID0+ICh7XG5cdFx0XHRcdG9uRGlkU3VwcHJlc3M6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkSW52YWxpZGF0ZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0cmVnaXN0ZXI6ICgpID0+IGBvYnNlcnZhdGlvbi0keysrb2JzZXJ2YXRpb259YCxcblx0XHRcdFx0aXNTdXBwcmVzc2VkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0cmVsZWFzZTogKCkgPT4geyB9LFxuXHRcdFx0fSksXG5cdFx0XHRwcmVwYXJlRmx1c2g6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRleHQgPSBzZXR1cCh1bmRlZmluZWQsIG1hcmtlclNlcnZpY2UpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0Y29udGV4dC5kb2N1bWVudC5hcHBseUVkaXQoU3RyaW5nRWRpdFdpdGhSZWFzb24ucmVwbGFjZShjb250ZXh0LmRvY3VtZW50LmZpbmRSYW5nZSgnaGVsbG8nKSwgJ2FscGhhJywgY2hhdEVkaXQoJ3JlcXVlc3QtMScpKSk7XG5cdFx0Y29udGV4dC5kb2N1bWVudC5hcHBseUVkaXQoU3RyaW5nRWRpdFdpdGhSZWFzb24ucmVwbGFjZShjb250ZXh0LmRvY3VtZW50LmZpbmRSYW5nZSgnYWxwaGEnKSwgJ2V4dGVybmFsJywgRWRpdFNvdXJjZXMucmVsb2FkRnJvbURpc2soKSkpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTUwMCk7XG5cdFx0Y29udGV4dC5oZWFkSGFzaC5zZXQoJ2hhc2gtMicsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNvdXJjZUtleXM6IGNvbnRleHQuZGV0YWlscy5tYXAoZXZlbnQgPT4gZXZlbnQuc291cmNlS2V5KS5zb3J0KCksXG5cdFx0XHRoYXNJbnRlcm5hbE9ic2VydmF0aW9uS2V5OiBjb250ZXh0LmRldGFpbHMuc29tZShldmVudCA9PiBldmVudC5zb3VyY2VLZXkuc3RhcnRzV2l0aCgnZXh0ZXJuYWwtb2JzZXJ2YXRpb246JykpLFxuXHRcdH0sIHtcblx0XHRcdHNvdXJjZUtleXM6IFsnc291cmNlOkNoYXQuYXBwbHlFZGl0cycsICdzb3VyY2U6cmVsb2FkRnJvbURpc2snXSxcblx0XHRcdGhhc0ludGVybmFsT2JzZXJ2YXRpb25LZXk6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0Y29udGV4dC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZXBvcnRzIHBhcnRpYWwgQWdlbnQgSG9zdCBjb3ZlcmFnZSB3aXRob3V0IGRyb3BwaW5nIHdvcmtiZW5jaCBhdHRyaWJ1dGlvbicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcmtlclNlcnZpY2U6IElBZ2VudEhvc3RFZGl0TWFya2VyU2VydmljZSA9IHtcblx0XHRcdGNyZWF0ZUNvcnJlbGF0aW9uOiAoKSA9PiAoe1xuXHRcdFx0XHRvbkRpZFN1cHByZXNzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZEludmFsaWRhdGU6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdHJlZ2lzdGVyOiAoKSA9PiAnb2JzZXJ2YXRpb24nLFxuXHRcdFx0XHRpc1N1cHByZXNzZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRyZWxlYXNlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHRcdHRha2VDb3ZlcmFnZUdhcDogKCkgPT4gKHtcblx0XHRcdFx0ZWRpdENvdW50OiAxLFxuXHRcdFx0XHRpbnNlcnRlZENvdW50OiA0Mixcblx0XHRcdH0pLFxuXHRcdFx0cHJlcGFyZUZsdXNoOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fTtcblx0XHRjb25zdCBjb250ZXh0ID0gc2V0dXAodW5kZWZpbmVkLCBtYXJrZXJTZXJ2aWNlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGNvbnRleHQuZG9jdW1lbnQuYXBwbHlFZGl0KFN0cmluZ0VkaXRXaXRoUmVhc29uLnJlcGxhY2UoY29udGV4dC5kb2N1bWVudC5maW5kUmFuZ2UoJ2hlbGxvJyksICdhbHBoYScsIGNoYXRFZGl0KCdyZXF1ZXN0LTEnKSkpO1xuXHRcdGNvbnRleHQuZG9jdW1lbnQuYXBwbHlFZGl0KFN0cmluZ0VkaXRXaXRoUmVhc29uLnJlcGxhY2UoY29udGV4dC5kb2N1bWVudC5maW5kUmFuZ2UoJ2FscGhhJyksICdleHRlcm5hbCcsIEVkaXRTb3VyY2VzLnJlbG9hZEZyb21EaXNrKCkpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDE1MDApO1xuXHRcdGNvbnRleHQuaGVhZEhhc2guc2V0KCdoYXNoLTInLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LnN0YXRzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0ZXh0ZXJuYWxNb2RpZmllZENvdW50OiBldmVudC5leHRlcm5hbE1vZGlmaWVkQ291bnQsXG5cdFx0XHR0b3RhbE1vZGlmaWVkQ2hhcmFjdGVyczogZXZlbnQudG90YWxNb2RpZmllZENoYXJhY3RlcnMsXG5cdFx0XHRhZ2VudEhvc3RBdHRyaWJ1dGlvbkNvdmVyYWdlOiBldmVudC5hZ2VudEhvc3RBdHRyaWJ1dGlvbkNvdmVyYWdlLFxuXHRcdFx0YWdlbnRIb3N0VW50cmFja2VkRWRpdENvdW50OiBldmVudC5hZ2VudEhvc3RVbnRyYWNrZWRFZGl0Q291bnQsXG5cdFx0XHRhZ2VudEhvc3RVbnRyYWNrZWRJbnNlcnRlZENvdW50OiBldmVudC5hZ2VudEhvc3RVbnRyYWNrZWRJbnNlcnRlZENvdW50LFxuXHRcdH0pKSwgW3tcblx0XHRcdGV4dGVybmFsTW9kaWZpZWRDb3VudDogOCxcblx0XHRcdHRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzOiA4LFxuXHRcdFx0YWdlbnRIb3N0QXR0cmlidXRpb25Db3ZlcmFnZTogJ3BhcnRpYWwnLFxuXHRcdFx0YWdlbnRIb3N0VW50cmFja2VkRWRpdENvdW50OiAxLFxuXHRcdFx0YWdlbnRIb3N0VW50cmFja2VkSW5zZXJ0ZWRDb3VudDogNDIsXG5cdFx0fV0pO1xuXG5cdFx0Y29udGV4dC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdlbWl0cyB3b3JrYmVuY2ggdGVsZW1ldHJ5IHdoZW4gQWdlbnQgSG9zdCBjb29yZGluYXRpb24gZmFpbHMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYXJrZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UgPSB7XG5cdFx0XHRjcmVhdGVDb3JyZWxhdGlvbjogKCkgPT4gKHtcblx0XHRcdFx0b25EaWRTdXBwcmVzczogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRJbnZhbGlkYXRlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRyZWdpc3RlcjogKCkgPT4gJ29ic2VydmF0aW9uJyxcblx0XHRcdFx0aXNTdXBwcmVzc2VkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0cmVsZWFzZTogKCkgPT4geyB9LFxuXHRcdFx0fSksXG5cdFx0XHRwcmVwYXJlRmx1c2g6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBZ2VudCBIb3N0IHVuYXZhaWxhYmxlJyk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY29udGV4dCA9IHNldHVwKHVuZGVmaW5lZCwgbWFya2VyU2VydmljZSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRjb250ZXh0LmRvY3VtZW50LmFwcGx5RWRpdChTdHJpbmdFZGl0V2l0aFJlYXNvbi5yZXBsYWNlKGNvbnRleHQuZG9jdW1lbnQuZmluZFJhbmdlKCdoZWxsbycpLCAnYWxwaGEnLCBjaGF0RWRpdCgncmVxdWVzdC0xJykpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDE1MDApO1xuXHRcdGNvbnRleHQuaGVhZEhhc2guc2V0KCdoYXNoLTInLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmRldGFpbHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHRtb2RpZmllZENvdW50OiBldmVudC5tb2RpZmllZENvdW50LFxuXHRcdFx0dG90YWxNb2RpZmllZENvdW50OiBldmVudC50b3RhbE1vZGlmaWVkQ291bnQsXG5cdFx0fSkpLCBbe1xuXHRcdFx0bW9kaWZpZWRDb3VudDogNSxcblx0XHRcdHRvdGFsTW9kaWZpZWRDb3VudDogNSxcblx0XHR9XSk7XG5cblx0XHRjb250ZXh0LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gZXh0ZXJuYWwgdGVsZW1ldHJ5IHdoZW4gYSBtYXRjaGVkIEFnZW50IGZsdXNoIGNhbm5vdCBwcmVwYXJlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWFya2VyU2VydmljZTogSUFnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlID0ge1xuXHRcdFx0Y3JlYXRlQ29ycmVsYXRpb246ICgpID0+ICh7XG5cdFx0XHRcdG9uRGlkU3VwcHJlc3M6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkSW52YWxpZGF0ZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0cmVnaXN0ZXI6ICgpID0+ICdvYnNlcnZhdGlvbicsXG5cdFx0XHRcdGlzU3VwcHJlc3NlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0cmVsZWFzZTogKCkgPT4geyB9LFxuXHRcdFx0fSksXG5cdFx0XHRwcmVwYXJlRmx1c2g6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBZ2VudCBIb3N0IHVuYXZhaWxhYmxlJyk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY29udGV4dCA9IHNldHVwKHVuZGVmaW5lZCwgbWFya2VyU2VydmljZSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRjb250ZXh0LmRvY3VtZW50LmFwcGx5RWRpdChTdHJpbmdFZGl0V2l0aFJlYXNvbi5yZXBsYWNlKGNvbnRleHQuZG9jdW1lbnQuZmluZFJhbmdlKCdoZWxsbycpLCAnYWxwaGEnLCBjaGF0RWRpdCgncmVxdWVzdC0xJykpKTtcblx0XHRjb250ZXh0LmRvY3VtZW50LmFwcGx5RWRpdChTdHJpbmdFZGl0V2l0aFJlYXNvbi5yZXBsYWNlKGNvbnRleHQuZG9jdW1lbnQuZmluZFJhbmdlKCdhbHBoYScpLCAnZXh0ZXJuYWwnLCBFZGl0U291cmNlcy5yZWxvYWRGcm9tRGlzaygpKSk7XG5cdFx0YXdhaXQgdGltZW91dCgxNTAwKTtcblx0XHRjb250ZXh0LmhlYWRIYXNoLnNldCgnaGFzaC0yJywgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5kZXRhaWxzLm1hcChldmVudCA9PiBldmVudC5zb3VyY2VLZXkpLnNvcnQoKSwgW1xuXHRcdFx0J3NvdXJjZTpDaGF0LmFwcGx5RWRpdHMnLFxuXHRcdFx0J3NvdXJjZTpyZWxvYWRGcm9tRGlzaycsXG5cdFx0XSk7XG5cblx0XHRjb250ZXh0LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gYSBtYXRjaGVkIGluaXRpYWwgZXh0ZXJuYWwgZWRpdCB3aGVuIEFnZW50IEhvc3QgaXMgdW5hdmFpbGFibGUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYXJrZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UgPSB7XG5cdFx0XHRjcmVhdGVDb3JyZWxhdGlvbjogKCkgPT4gKHtcblx0XHRcdFx0b25EaWRTdXBwcmVzczogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRJbnZhbGlkYXRlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRyZWdpc3RlcjogKCkgPT4gJ29ic2VydmF0aW9uJyxcblx0XHRcdFx0aXNTdXBwcmVzc2VkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRyZWxlYXNlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHRcdHByZXBhcmVGbHVzaDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0FnZW50IEhvc3QgdW5hdmFpbGFibGUnKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBjb250ZXh0ID0gc2V0dXAodW5kZWZpbmVkLCBtYXJrZXJTZXJ2aWNlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGNvbnRleHQuZG9jdW1lbnQuYXBwbHlFZGl0KFN0cmluZ0VkaXRXaXRoUmVhc29uLnJlcGxhY2UoY29udGV4dC5kb2N1bWVudC5maW5kUmFuZ2UoJ2hlbGxvJyksICdleHRlcm5hbCcsIEVkaXRTb3VyY2VzLnJlbG9hZEZyb21EaXNrKCkpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDE1MDApO1xuXHRcdGNvbnRleHQuaGVhZEhhc2guc2V0KCdoYXNoLTInLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmRldGFpbHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHRzb3VyY2VLZXk6IGV2ZW50LnNvdXJjZUtleSxcblx0XHRcdG1vZGlmaWVkQ291bnQ6IGV2ZW50Lm1vZGlmaWVkQ291bnQsXG5cdFx0XHR0b3RhbE1vZGlmaWVkQ291bnQ6IGV2ZW50LnRvdGFsTW9kaWZpZWRDb3VudCxcblx0XHR9KSksIFt7XG5cdFx0XHRzb3VyY2VLZXk6ICdzb3VyY2U6cmVsb2FkRnJvbURpc2snLFxuXHRcdFx0bW9kaWZpZWRDb3VudDogOCxcblx0XHRcdHRvdGFsTW9kaWZpZWRDb3VudDogOCxcblx0XHR9XSk7XG5cblx0XHRjb250ZXh0LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGZhbGwgYmFjayB3aGVuIEFnZW50IEhvc3QgYXR0cmlidXRpb24gaXMgZGVmZXJyZWQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRsZXQgY292ZXJhZ2VHYXBUYWtlQ291bnQgPSAwO1xuXHRcdGNvbnN0IG1hcmtlclNlcnZpY2U6IElBZ2VudEhvc3RFZGl0TWFya2VyU2VydmljZSA9IHtcblx0XHRcdGNyZWF0ZUNvcnJlbGF0aW9uOiAoKSA9PiAoe1xuXHRcdFx0XHRvbkRpZFN1cHByZXNzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZEludmFsaWRhdGU6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdHJlZ2lzdGVyOiAoKSA9PiAnb2JzZXJ2YXRpb24nLFxuXHRcdFx0XHRpc1N1cHByZXNzZWQ6ICgpID0+IHRydWUsXG5cdFx0XHRcdHJlbGVhc2U6ICgpID0+IHsgfSxcblx0XHRcdH0pLFxuXHRcdFx0cHJlcGFyZUZsdXNoOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRocm93IG5ldyBBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25EZWZlcnJlZEVycm9yKG5ldyBFcnJvcignUHJlcGFyZSBjYW5jZWxsZWQnKSk7XG5cdFx0XHR9LFxuXHRcdFx0dGFrZUNvdmVyYWdlR2FwOiAoKSA9PiB7XG5cdFx0XHRcdGNvdmVyYWdlR2FwVGFrZUNvdW50Kys7XG5cdFx0XHRcdHJldHVybiB7IGVkaXRDb3VudDogMSwgaW5zZXJ0ZWRDb3VudDogNDIgfTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBjb250ZXh0ID0gc2V0dXAodW5kZWZpbmVkLCBtYXJrZXJTZXJ2aWNlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGNvbnRleHQuZG9jdW1lbnQuYXBwbHlFZGl0KFN0cmluZ0VkaXRXaXRoUmVhc29uLnJlcGxhY2UoY29udGV4dC5kb2N1bWVudC5maW5kUmFuZ2UoJ2hlbGxvJyksICdleHRlcm5hbCcsIEVkaXRTb3VyY2VzLnJlbG9hZEZyb21EaXNrKCkpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDE1MDApO1xuXHRcdGNvbnRleHQuaGVhZEhhc2guc2V0KCdoYXNoLTInLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkZXRhaWxDb3VudDogY29udGV4dC5kZXRhaWxzLmxlbmd0aCxcblx0XHRcdHN0YXRzQ291bnQ6IGNvbnRleHQuc3RhdHMubGVuZ3RoLFxuXHRcdFx0Y292ZXJhZ2VHYXBUYWtlQ291bnQsXG5cdFx0fSwge1xuXHRcdFx0ZGV0YWlsQ291bnQ6IDAsXG5cdFx0XHRzdGF0c0NvdW50OiAwLFxuXHRcdFx0Y292ZXJhZ2VHYXBUYWtlQ291bnQ6IDAsXG5cdFx0fSk7XG5cblx0XHRjb250ZXh0LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGVtaXQgZXh0ZXJuYWwgZmFsbGJhY2sgd2hlbiB0aGUgQWdlbnQgSG9zdCBjb21taXQgb3V0Y29tZSBpcyB1bmtub3duJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGNvdmVyYWdlR2FwVGFrZUNvdW50ID0gMDtcblx0XHRjb25zdCBtYXJrZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UgPSB7XG5cdFx0XHRjcmVhdGVDb3JyZWxhdGlvbjogKCkgPT4gKHtcblx0XHRcdFx0b25EaWRTdXBwcmVzczogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRJbnZhbGlkYXRlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRyZWdpc3RlcjogKCkgPT4gJ29ic2VydmF0aW9uJyxcblx0XHRcdFx0aXNTdXBwcmVzc2VkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRyZWxlYXNlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHRcdHByZXBhcmVGbHVzaDogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0Zmx1c2hUb2tlbjogJ2ZsdXNoLTEnLFxuXHRcdFx0XHRhZ2VudE1vZGlmaWVkQ291bnQ6IDMsXG5cdFx0XHRcdGNvbW1pdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHRocm93IG5ldyBBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25Vbmtub3duT3V0Y29tZUVycm9yKG5ldyBFcnJvcignVHJhbnNwb3J0IHVuYXZhaWxhYmxlJykpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSksXG5cdFx0XHR0YWtlQ292ZXJhZ2VHYXA6ICgpID0+IHtcblx0XHRcdFx0Y292ZXJhZ2VHYXBUYWtlQ291bnQrKztcblx0XHRcdFx0cmV0dXJuIHsgZWRpdENvdW50OiAxLCBpbnNlcnRlZENvdW50OiA0MiB9O1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRleHQgPSBzZXR1cCh1bmRlZmluZWQsIG1hcmtlclNlcnZpY2UpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0Y29udGV4dC5kb2N1bWVudC5hcHBseUVkaXQoU3RyaW5nRWRpdFdpdGhSZWFzb24ucmVwbGFjZShjb250ZXh0LmRvY3VtZW50LmZpbmRSYW5nZSgnaGVsbG8nKSwgJ2V4dGVybmFsJywgRWRpdFNvdXJjZXMucmVsb2FkRnJvbURpc2soKSkpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTUwMCk7XG5cdFx0Y29udGV4dC5oZWFkSGFzaC5zZXQoJ2hhc2gtMicsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRldGFpbENvdW50OiBjb250ZXh0LmRldGFpbHMubGVuZ3RoLFxuXHRcdFx0Y292ZXJhZ2VHYXBUYWtlQ291bnQsXG5cdFx0XHRzdGF0czogY29udGV4dC5zdGF0cy5tYXAoZXZlbnQgPT4gKHtcblx0XHRcdFx0b3RoZXJBSU1vZGlmaWVkQ291bnQ6IGV2ZW50Lm90aGVyQUlNb2RpZmllZENvdW50LFxuXHRcdFx0XHRhZ2VudEhvc3RNb2RpZmllZENvdW50OiBldmVudC5hZ2VudEhvc3RNb2RpZmllZENvdW50LFxuXHRcdFx0XHRleHRlcm5hbE1vZGlmaWVkQ291bnQ6IGV2ZW50LmV4dGVybmFsTW9kaWZpZWRDb3VudCxcblx0XHRcdFx0dG90YWxNb2RpZmllZENoYXJhY3RlcnM6IGV2ZW50LnRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzLFxuXHRcdFx0fSkpLFxuXHRcdH0sIHtcblx0XHRcdGRldGFpbENvdW50OiAwLFxuXHRcdFx0Y292ZXJhZ2VHYXBUYWtlQ291bnQ6IDAsXG5cdFx0XHRzdGF0czogW3tcblx0XHRcdFx0b3RoZXJBSU1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRcdGFnZW50SG9zdE1vZGlmaWVkQ291bnQ6IDMsXG5cdFx0XHRcdGV4dGVybmFsTW9kaWZpZWRDb3VudDogMCxcblx0XHRcdFx0dG90YWxNb2RpZmllZENoYXJhY3RlcnM6IDMsXG5cdFx0XHR9XSxcblx0XHR9KTtcblxuXHRcdGNvbnRleHQuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnY29tbWl0cyB6ZXJvLXJldGVudGlvbiBBZ2VudCBIb3N0IHdpbmRvd3MnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb21taXRzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IG1hcmtlclNlcnZpY2U6IElBZ2VudEhvc3RFZGl0TWFya2VyU2VydmljZSA9IHtcblx0XHRcdGNyZWF0ZUNvcnJlbGF0aW9uOiAoKSA9PiAoe1xuXHRcdFx0XHRvbkRpZFN1cHByZXNzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZEludmFsaWRhdGU6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdHJlZ2lzdGVyOiAoKSA9PiAnb2JzZXJ2YXRpb24nLFxuXHRcdFx0XHRpc1N1cHByZXNzZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRyZWxlYXNlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHRcdHByZXBhcmVGbHVzaDogYXN5bmMgKF9yZXNvdXJjZSwgdHJpZ2dlcikgPT4gdHJpZ2dlciA9PT0gJ2hhc2hDaGFuZ2UnID8gKHtcblx0XHRcdFx0Zmx1c2hUb2tlbjogJ2ZsdXNoLTEnLFxuXHRcdFx0XHRhZ2VudE1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRcdGNvbW1pdDogYXN5bmMgdG90YWxNb2RpZmllZENvdW50ID0+IHtcblx0XHRcdFx0XHRjb21taXRzLnB1c2godG90YWxNb2RpZmllZENvdW50KTtcblx0XHRcdFx0fSxcblx0XHRcdH0pIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0Y29uc3QgY29udGV4dCA9IHNldHVwKHVuZGVmaW5lZCwgbWFya2VyU2VydmljZSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRjb250ZXh0LmhlYWRIYXNoLnNldCgnaGFzaC0yJywgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29tbWl0cyxcblx0XHRcdGRldGFpbENvdW50OiBjb250ZXh0LmRldGFpbHMubGVuZ3RoLFxuXHRcdFx0c3RhdHNDb3VudDogY29udGV4dC5zdGF0cy5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0Y29tbWl0czogWzBdLFxuXHRcdFx0ZGV0YWlsQ291bnQ6IDAsXG5cdFx0XHRzdGF0c0NvdW50OiAwLFxuXHRcdH0pO1xuXG5cdFx0Y29udGV4dC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pKTtcbn0pO1xuXG5mdW5jdGlvbiBzZXR1cChcblx0dmlzaWJsZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxib29sZWFuPiA9IG9ic2VydmFibGVWYWx1ZSgndmlzaWJsZScsIHRydWUpLFxuXHRtYXJrZXJTZXJ2aWNlPzogSUFnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlLFxuXHRkaXJ0eSA9IGZhbHNlLFxuKSB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCBoZWFkSGFzaCA9IG9ic2VydmFibGVWYWx1ZSgnaGVhZEhhc2gnLCAnaGFzaC0xJyk7XG5cdGNvbnN0IGJyYW5jaCA9IG9ic2VydmFibGVWYWx1ZSgnYnJhbmNoJywgJ21haW4nKTtcblx0Y29uc3QgcmVwbyA9IHtcblx0XHRoZWFkQ29tbWl0SGFzaE9iczogaGVhZEhhc2gsXG5cdFx0aGVhZEJyYW5jaE5hbWVPYnM6IGJyYW5jaCxcblx0XHRpc0lnbm9yZWQ6IGFzeW5jICgpID0+IGZhbHNlLFxuXHR9IHNhdGlzZmllcyBJU2NtUmVwb0FkYXB0ZXI7XG5cdGNvbnN0IGRldGFpbHM6IEFycmF5PHsgc291cmNlS2V5OiBzdHJpbmc7IHRyaWdnZXI6IHN0cmluZzsgcmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7IHN0YXRzVXVpZDogc3RyaW5nOyBtb2RpZmllZENvdW50OiBudW1iZXI7IGRlbHRhTW9kaWZpZWRDb3VudDogbnVtYmVyOyB0b3RhbE1vZGlmaWVkQ291bnQ6IG51bWJlciB9PiA9IFtdO1xuXHRjb25zdCBhbGxEZXRhaWxzOiBBcnJheTx7XG5cdFx0bW9kZTogc3RyaW5nO1xuXHRcdHNvdXJjZUtleTogc3RyaW5nO1xuXHRcdHNvdXJjZUtleUNsZWFuZWQ6IHN0cmluZztcblx0XHRvcmlnaW46IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRoYXJuZXNzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnZlcnNhdGlvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0cmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0c3RhdHNVdWlkOiBzdHJpbmc7XG5cdFx0bW9kaWZpZWRDb3VudDogbnVtYmVyO1xuXHRcdGRlbHRhTW9kaWZpZWRDb3VudDogbnVtYmVyO1xuXHRcdHRvdGFsTW9kaWZpZWRDb3VudDogbnVtYmVyO1xuXHR9PiA9IFtdO1xuXHRjb25zdCBzdGF0czogQXJyYXk8e1xuXHRcdHN0YXRzVXVpZDogc3RyaW5nO1xuXHRcdG90aGVyQUlNb2RpZmllZENvdW50OiBudW1iZXI7XG5cdFx0YWdlbnRIb3N0TW9kaWZpZWRDb3VudDogbnVtYmVyO1xuXHRcdGV4dGVybmFsTW9kaWZpZWRDb3VudDogbnVtYmVyO1xuXHRcdHRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzOiBudW1iZXI7XG5cdFx0YWdlbnRIb3N0QXR0cmlidXRpb25Db3ZlcmFnZT86ICdjb21wbGV0ZScgfCAncGFydGlhbCc7XG5cdFx0YWdlbnRIb3N0VW50cmFja2VkRWRpdENvdW50PzogbnVtYmVyO1xuXHRcdGFnZW50SG9zdFVudHJhY2tlZEluc2VydGVkQ291bnQ/OiBudW1iZXI7XG5cdH0+ID0gW107XG5cdGNvbnN0IGFsbFN0YXRzOiBBcnJheTx0eXBlb2Ygc3RhdHNbbnVtYmVyXSAmIHsgbW9kZTogc3RyaW5nIH0+ID0gW107XG5cdGxldCB1dWlkID0gMDtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oKSwgZmFsc2UsIHVuZGVmaW5lZCwgdHJ1ZSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0cHVibGljTG9nMihldmVudE5hbWUsIGRhdGEpIHtcblx0XHRcdGNvbnN0IGV2ZW50RGF0YSA9IGRhdGEgYXMgeyBtb2RlPzogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoZXZlbnROYW1lID09PSAnZWRpdFRlbGVtZXRyeS5lZGl0U291cmNlcy5kZXRhaWxzJykge1xuXHRcdFx0XHRhbGxEZXRhaWxzLnB1c2goZGF0YSBhcyB0eXBlb2YgYWxsRGV0YWlsc1tudW1iZXJdKTtcblx0XHRcdFx0aWYgKGV2ZW50RGF0YT8ubW9kZSA9PT0gJ2xvbmd0ZXJtJykge1xuXHRcdFx0XHRcdGRldGFpbHMucHVzaChkYXRhIGFzIHR5cGVvZiBkZXRhaWxzW251bWJlcl0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50TmFtZSA9PT0gJ2VkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuc3RhdHMnKSB7XG5cdFx0XHRcdGFsbFN0YXRzLnB1c2goZGF0YSBhcyB0eXBlb2YgYWxsU3RhdHNbbnVtYmVyXSk7XG5cdFx0XHRcdGlmIChldmVudERhdGE/Lm1vZGUgPT09ICdsb25ndGVybScpIHtcblx0XHRcdFx0XHRzdGF0cy5wdXNoKGRhdGEgYXMgdHlwZW9mIHN0YXRzW251bWJlcl0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWJJbnN0YW5jZShEaWZmU2VydmljZSwgeyBjb21wdXRlRGlmZjogYXN5bmMgKG9yaWdpbmFsLCBtb2RpZmllZCkgPT4gY29tcHV0ZVN0cmluZ0RpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCB7IG1heENvbXB1dGF0aW9uVGltZU1zOiA1MDAgfSwgJ2FkdmFuY2VkJykgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWJJbnN0YW5jZShTY21BZGFwdGVyLCB7IGdldFJlcG86ICgpID0+IHJlcG8gfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWJJbnN0YW5jZShVcmlWaXNpYmlsaXR5UHJvdmlkZXIsIHsgaXNWaXNpYmxlOiAoX3VyaSwgcmVhZGVyKSA9PiB2aXNpYmxlLnJlYWQocmVhZGVyKSB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUmFuZG9tU2VydmljZSwge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRnZW5lcmF0ZVV1aWQ6ICgpID0+IGBzdGF0cy0keysrdXVpZH1gLFxuXHRcdGdlbmVyYXRlUHJlZml4ZWRVdWlkOiBuYW1lc3BhY2UgPT4gYCR7bmFtZXNwYWNlfS0keysrdXVpZH1gLFxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckF0dGVudGlvblNlcnZpY2UsIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0aXNWc0NvZGVGb2N1c2VkOiBjb25zdE9ic2VydmFibGUodHJ1ZSksXG5cdFx0aXNVc2VyQWN0aXZlOiBjb25zdE9ic2VydmFibGUodHJ1ZSksXG5cdFx0aGFzVXNlckF0dGVudGlvbjogY29uc3RPYnNlcnZhYmxlKHRydWUpLFxuXHRcdHRvdGFsRm9jdXNUaW1lTXM6IDAsXG5cdFx0ZmlyZUFmdGVyR2l2ZW5Gb2N1c1RpbWVQYXNzZWQ6ICgpID0+IERpc3Bvc2FibGUuTm9uZSxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRleHRGaWxlU2VydmljZSwgeyBpc0RpcnR5OiAoKSA9PiBkaXJ0eSB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWlFZGl0VGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRjcmVhdGVTdWdnZXN0aW9uSWQ6ICgpID0+IEVkaXRTdWdnZXN0aW9uSWQubmV3SWQoKCkgPT4gJ3NndC10ZXN0JyksXG5cdFx0aGFuZGxlQ29kZUFjY2VwdGVkOiAoKSA9PiB7IH0sXG5cdFx0aGFuZGxlQ29kZVJlamVjdGVkOiAoKSA9PiB7IH0sXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0Y29uc3Qgd29ya3NwYWNlID0gbmV3IE11dGFibGVPYnNlcnZhYmxlV29ya3NwYWNlKCk7XG5cdGNvbnN0IGFubm90YXRlZERvY3VtZW50cyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQW5ub3RhdGVkRG9jdW1lbnRzKHdvcmtzcGFjZSwgaW5zdGFudGlhdGlvblNlcnZpY2UpKTtcblx0Y29uc3QgaW1wbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRWRpdFNvdXJjZVRyYWNraW5nSW1wbChjb25zdE9ic2VydmFibGUodHJ1ZSksIGFubm90YXRlZERvY3VtZW50cywgbWFya2VyU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UpKTtcblx0Y29uc3QgZG9jdW1lbnQgPSBkaXNwb3NhYmxlcy5hZGQod29ya3NwYWNlLmNyZWF0ZURvY3VtZW50KHtcblx0XHR1cmk6IFVSSS5maWxlKCdDOlxcXFxyZXBvXFxcXGZpbGUudHMnKSxcblx0XHRpbml0aWFsVmFsdWU6ICdoZWxsbycsXG5cdFx0bGFuZ3VhZ2VJZDogJ3R5cGVzY3JpcHQnLFxuXHR9KSk7XG5cblx0cmV0dXJuIHsgZGlzcG9zYWJsZXMsIGRvY3VtZW50LCBkZXRhaWxzLCBzdGF0cywgYWxsRGV0YWlscywgYWxsU3RhdHMsIGhlYWRIYXNoLCBicmFuY2gsIGltcGwgfTtcbn1cblxuZnVuY3Rpb24gY2hhdEVkaXQocmVxdWVzdElkOiBzdHJpbmcpIHtcblx0cmV0dXJuIEVkaXRTb3VyY2VzLmNoYXRBcHBseUVkaXRzKHtcblx0XHRtb2RlbElkOiB1bmRlZmluZWQsXG5cdFx0c2Vzc2lvbklkOiAnc2Vzc2lvbi0xJyxcblx0XHRyZXF1ZXN0SWQsXG5cdFx0bGFuZ3VhZ2VJZDogJ3R5cGVzY3JpcHQnLFxuXHRcdG1vZGU6ICdhZ2VudCcsXG5cdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRjb2RlQmxvY2tTdWdnZXN0aW9uSWQ6IHVuZGVmaW5lZCxcblx0fSk7XG59XG5cbmNsYXNzIFRlc3RFeHRlcm5hbEVkaXRDb3JyZWxhdGlvbiBpbXBsZW1lbnRzIElFeHRlcm5hbEVkaXRDb3JyZWxhdGlvbiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3VwcHJlc3MgPSBuZXcgRW1pdHRlcjxzdHJpbmc+KCk7XG5cdHJlYWRvbmx5IG9uRGlkU3VwcHJlc3MgPSB0aGlzLl9vbkRpZFN1cHByZXNzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlc29sdmUgPSBuZXcgRW1pdHRlcjxJRXh0ZXJuYWxFZGl0Q29ycmVsYXRpb25SZXNvbHV0aW9uPigpO1xuXHRyZWFkb25seSBvbkRpZFJlc29sdmUgPSB0aGlzLl9vbkRpZFJlc29sdmUuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSW52YWxpZGF0ZSA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblx0cmVhZG9ubHkgb25EaWRJbnZhbGlkYXRlID0gdGhpcy5fb25EaWRJbnZhbGlkYXRlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kcmFpbiA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0cHJpdmF0ZSByZXNvbHV0aW9uOiBJRXh0ZXJuYWxFZGl0Q29ycmVsYXRpb25SZXNvbHV0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgd2FpdEZvckRyYWluID0gZmFsc2UpIHsgfVxuXG5cdHJlZ2lzdGVyKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICdvYnNlcnZhdGlvbic7XG5cdH1cblxuXHRpc1N1cHByZXNzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucmVzb2x1dGlvbiAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0UmVzb2x1dGlvbigpOiBJRXh0ZXJuYWxFZGl0Q29ycmVsYXRpb25SZXNvbHV0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5yZXNvbHV0aW9uO1xuXHR9XG5cblx0YXN5bmMgd2FpdEZvclJlc29sdXRpb24oX2lkczogcmVhZG9ubHkgc3RyaW5nW10sIHRpbWVvdXRNczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMud2FpdEZvckRyYWluKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJhY2UoW3RoaXMuX2RyYWluLnAsIHRpbWVvdXQodGltZW91dE1zKV0pO1xuXHRcdH1cblx0fVxuXG5cdHJlbGVhc2UoKTogdm9pZCB7IH1cblxuXHRyZXNvbHZlKHNvdXJjZTogVGV4dE1vZGVsRWRpdFNvdXJjZSk6IHZvaWQge1xuXHRcdHRoaXMucmVzb2x1dGlvbiA9IHsgaWQ6ICdvYnNlcnZhdGlvbicsIHNvdXJjZSB9O1xuXHRcdHRoaXMuX29uRGlkU3VwcHJlc3MuZmlyZSgnb2JzZXJ2YXRpb24nKTtcblx0XHR0aGlzLl9vbkRpZFJlc29sdmUuZmlyZSh0aGlzLnJlc29sdXRpb24pO1xuXHR9XG5cblx0Y29tcGxldGVEcmFpbigpOiB2b2lkIHtcblx0XHR0aGlzLl9kcmFpbi5jb21wbGV0ZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxpQkFBaUIsZUFBZTtBQUN6QyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsaUJBQXNDLHVCQUF1QjtBQUN0RSxTQUFTLFdBQVc7QUFDcEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhLHdCQUE2QztBQUNuRSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQW9CLDZCQUE2QjtBQUMxRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHVDQUF1QyxtREFBOEk7QUFDOUwsU0FBMEIsa0JBQWtCO0FBQzVDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0NBQWtDO0FBRTNDLE1BQU0sZ0NBQWdDLE1BQU07QUFDM0MsMENBQXdDO0FBRXhDLE9BQUssMEVBQTBFLE1BQU0sbUJBQW1CLENBQUMsR0FBRyxZQUFZO0FBQ3ZILFVBQU0sVUFBVSxNQUFNO0FBQ3RCLFVBQU0sUUFBUSxFQUFFO0FBRWhCLFlBQVEsU0FBUyxVQUFVLHFCQUFxQixRQUFRLFFBQVEsU0FBUyxVQUFVLE9BQU8sR0FBRyxTQUFTLFNBQVMsV0FBVyxDQUFDLENBQUM7QUFDNUgsVUFBTSxRQUFRLElBQUk7QUFDbEIsWUFBUSxTQUFT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
