import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { errorHandler, setUnexpectedErrorHandler } from "../../../../../base/common/errors.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { ContextKeyService } from "../../../../../platform/contextkey/browser/contextKeyService.js";
import { InMemoryStorageService, StorageScope } from "../../../../../platform/storage/common/storage.js";
import { NullTelemetryService, NullTelemetryServiceShape } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { Memento } from "../../../../common/memento.js";
import { NullWorkbenchAssignmentService } from "../../../../services/assignment/test/common/nullAssignmentService.js";
import { TestLifecycleService } from "../../../../test/common/workbenchTestServices.js";
import { OnboardingScenarioService } from "../../browser/onboardingService.js";
import { onboardingPresentationRegistry } from "../../common/onboardingPresentation.js";
import { onboardingScenarioRegistry } from "../../common/onboardingRegistry.js";
import { OnboardingDismissReason, OnboardingOutcome } from "../../common/onboardingScenario.js";
import { getOnboardingDeveloperModeVariation, ONBOARDING_DEVELOPER_MODE_CONFIG, ONBOARDING_DEVELOPER_MODE_VARIATIONS_CONFIG, ONBOARDING_ENABLED_CONFIG } from "../../common/onboardingScenarioService.js";
function completedResult(outcome = OnboardingOutcome.Completed) {
  const dismissReason = outcome === OnboardingOutcome.Skipped ? OnboardingDismissReason.SkipButton : outcome === OnboardingOutcome.Aborted ? OnboardingDismissReason.Aborted : OnboardingDismissReason.Completed;
  return { outcome, shown: true, dismissReason, lastStepIndex: 0, stepCount: 1 };
}
function notShownResult() {
  return { outcome: OnboardingOutcome.Completed, shown: false, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 0, stepCount: 0 };
}
class CapturingTelemetryService extends NullTelemetryServiceShape {
  constructor() {
    super(...arguments);
    this.events = [];
    this.eventData = [];
  }
  publicLog2(eventName, data) {
    if (eventName) {
      this.events.push(eventName);
      this.eventData.push({ name: eventName, data });
    }
  }
}
class FixedResultPresentation {
  constructor(kind, result) {
    this.kind = kind;
    this.result = result;
  }
  async run(_scenario, _context) {
    return this.result;
  }
}
class ShownPresentation {
  constructor(kind) {
    this.kind = kind;
  }
  async run(_scenario, context) {
    context.onDidShow?.();
    context.onDidShow?.();
    return completedResult();
  }
}
class RecordingPresentation {
  constructor(kind, outcome = OnboardingOutcome.Completed, onRun) {
    this.kind = kind;
    this.outcome = outcome;
    this.onRun = onRun;
    this.runs = [];
  }
  async run(scenario, _context) {
    this.runs.push(scenario.id);
    this.onRun?.();
    return completedResult(this.outcome);
  }
}
class BlockingUntilAbortPresentation {
  constructor(kind) {
    this.kind = kind;
    this.runs = [];
  }
  run(scenario, context) {
    this.runs.push(scenario.id);
    return new Promise((resolve) => {
      const listener = context.onAbort(() => {
        listener.dispose();
        resolve(completedResult(OnboardingOutcome.Aborted));
      });
    });
  }
}
class FakeAssignmentService extends NullWorkbenchAssignmentService {
  constructor(treatments) {
    super();
    this.treatments = treatments;
    this._filters = [];
  }
  async getTreatment(name) {
    return this.treatments[name];
  }
  addTelemetryAssignmentFilter(filter) {
    this._filters.push(filter);
  }
  /** True when the given assignment-context id is currently excluded from telemetry. */
  isExcluded(assignment) {
    return this._filters.some((f) => f.exclude(assignment));
  }
}
suite("OnboardingScenarioService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  teardown(() => {
    Memento.clear(StorageScope.APPLICATION);
  });
  test("developer variation only overrides while developer mode is enabled", () => {
    const disabled = new TestConfigurationService({
      [ONBOARDING_DEVELOPER_MODE_CONFIG]: { tour: false },
      [ONBOARDING_DEVELOPER_MODE_VARIATIONS_CONFIG]: { tour: "githubPrompt" }
    });
    const enabled = new TestConfigurationService({
      [ONBOARDING_DEVELOPER_MODE_CONFIG]: { tour: true },
      [ONBOARDING_DEVELOPER_MODE_VARIATIONS_CONFIG]: { tour: "githubPrompt" }
    });
    assert.deepStrictEqual({
      disabled: getOnboardingDeveloperModeVariation(disabled, "tour"),
      enabled: getOnboardingDeveloperModeVariation(enabled, "tour")
    }, {
      disabled: void 0,
      enabled: "githubPrompt"
    });
  });
  let idSeed = 0;
  function uniqueKind() {
    return `test-presentation-${idSeed++}`;
  }
  function createService(configValues = {}, assignment, storage = disposables.add(new InMemoryStorageService()), telemetry = NullTelemetryService) {
    const store = disposables;
    const config = new TestConfigurationService(configValues);
    const contextKeyService = store.add(new ContextKeyService(config));
    const lifecycle = store.add(new TestLifecycleService());
    const service = store.add(new OnboardingScenarioService(
      storage,
      contextKeyService,
      config,
      lifecycle,
      assignment ?? new NullWorkbenchAssignmentService(),
      telemetry
    ));
    return { service, contextKeyService, config, lifecycle };
  }
  function registerPresentation(presentation) {
    disposables.add(onboardingPresentationRegistry.register(presentation));
  }
  function registerScenario(scenario) {
    disposables.add(onboardingScenarioRegistry.register(scenario));
  }
  test("runs an eligible auto scenario exactly once and marks it shown", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    registerScenario({ id: "auto-1", trigger: { kind: "auto" }, presentation: { kind: presentation.kind, payload: void 0 } });
    const { service } = createService();
    service.start();
    await timeout(0);
    service.start();
    await timeout(0);
    assert.deepStrictEqual(
      { runs: presentation.runs, shown: service.hasBeenShown("auto-1") },
      { runs: ["auto-1"], shown: true }
    );
  });
  test("developer mode ignores previously shown state for auto scenarios", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    registerScenario({ id: "dev-repeat-1", trigger: { kind: "auto" }, presentation: { kind: presentation.kind, payload: void 0 } });
    const storage = disposables.add(new InMemoryStorageService());
    const first = createService({}, void 0, storage).service;
    first.start();
    await timeout(0);
    const { service: second, contextKeyService } = createService({ [ONBOARDING_DEVELOPER_MODE_CONFIG]: { "dev-repeat-1": true } }, void 0, storage);
    second.start();
    await timeout(0);
    contextKeyService.createKey("onboardingTestDevModeReevaluate", false).set(true);
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, ["dev-repeat-1", "dev-repeat-1"]);
  });
  test("does not run automatically when onboarding.enabled is false", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    registerScenario({ id: "disabled-1", trigger: { kind: "auto" }, presentation: { kind: presentation.kind, payload: void 0 } });
    const { service } = createService({ [ONBOARDING_ENABLED_CONFIG]: false });
    service.start();
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, []);
  });
  test("respects the when clause and reacts to context changes", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    registerScenario({
      id: "when-1",
      when: ContextKeyExpr.equals("onboardingTestReady", true),
      trigger: { kind: "auto" },
      presentation: { kind: presentation.kind, payload: void 0 }
    });
    const { service, contextKeyService } = createService();
    service.start();
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, [], "should not run while when is unsatisfied");
    const key = contextKeyService.createKey("onboardingTestReady", false);
    key.set(true);
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, ["when-1"]);
  });
  test("runs higher-priority scenarios before lower-priority ones", async () => {
    const order = [];
    const presentation = new RecordingPresentation(uniqueKind(), OnboardingOutcome.Completed);
    registerPresentation(presentation);
    registerScenario({ id: "low", priority: 1, trigger: { kind: "auto" }, presentation: { kind: presentation.kind, payload: void 0 } });
    registerScenario({ id: "high", priority: 10, trigger: { kind: "auto" }, presentation: { kind: presentation.kind, payload: void 0 } });
    const { service } = createService();
    service.start();
    await timeout(0);
    order.push(...presentation.runs);
    assert.deepStrictEqual(order, ["high", "low"]);
  });
  test("higher priority wins when eligible scenarios share a seen key", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    registerScenario({ id: "low-shared", seenKey: "shared", priority: 1, trigger: { kind: "auto" }, presentation: { kind: presentation.kind, payload: void 0 } });
    registerScenario({ id: "high-shared", seenKey: "shared", priority: 10, trigger: { kind: "auto" }, presentation: { kind: presentation.kind, payload: void 0 } });
    const { service } = createService();
    service.start();
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, ["high-shared"]);
  });
  test("observable triggers start the scenario when the signal turns true", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    const signal = observableValue("onboardingTestSignal", false);
    registerScenario({ id: "observable-1", trigger: { kind: "observable", signal }, presentation: { kind: presentation.kind, payload: void 0 } });
    const { service } = createService();
    service.start();
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, [], "should not run while signal is false");
    signal.set(true, void 0);
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, ["observable-1"]);
  });
  test("command-triggered scenarios never run automatically", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    registerScenario({ id: "command-1", trigger: { kind: "command", commandId: "noop" }, presentation: { kind: presentation.kind, payload: void 0 } });
    const { service } = createService();
    service.start();
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, []);
  });
  test("runScenario runs manually even when disabled and already shown", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    registerScenario({ id: "manual-1", trigger: { kind: "auto" }, presentation: { kind: presentation.kind, payload: void 0 } });
    const { service } = createService({ [ONBOARDING_ENABLED_CONFIG]: false });
    service.start();
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, [], "disabled: should not auto-run");
    const outcome = await service.runScenario("manual-1");
    assert.deepStrictEqual({ runs: presentation.runs, outcome }, { runs: ["manual-1"], outcome: OnboardingOutcome.Completed });
  });
  test("runScenario joins an in-flight run instead of starting a second one", async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const kind = uniqueKind();
    const runs = [];
    const presentation = {
      kind,
      async run(scenario) {
        runs.push(scenario.id);
        await gate;
        return completedResult();
      }
    };
    registerPresentation(presentation);
    registerScenario({ id: "inflight-1", trigger: { kind: "command", commandId: "noop" }, presentation: { kind, payload: void 0 } });
    const { service } = createService();
    service.start();
    const first = service.runScenario("inflight-1");
    await timeout(0);
    const second = service.runScenario("inflight-1");
    await timeout(0);
    release();
    const [a, b] = await Promise.all([first, second]);
    assert.deepStrictEqual({ runs, a, b }, { runs: ["inflight-1"], a: OnboardingOutcome.Completed, b: OnboardingOutcome.Completed });
  });
  test("resetAll clears shown state so the scenario can run again", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    registerScenario({ id: "reset-1", trigger: { kind: "auto" }, presentation: { kind: presentation.kind, payload: void 0 } });
    const { service } = createService();
    service.start();
    await timeout(0);
    service.resetAll();
    assert.strictEqual(service.hasBeenShown("reset-1"), false);
  });
  test("emits scenarioOutcome telemetry when a tour is shown but not when nothing is rendered", async () => {
    const shownKind = uniqueKind();
    const notShownKind = uniqueKind();
    registerPresentation(new FixedResultPresentation(shownKind, completedResult()));
    registerPresentation(new FixedResultPresentation(notShownKind, notShownResult()));
    registerScenario({ id: "tele-shown", trigger: { kind: "auto" }, presentation: { kind: shownKind, payload: void 0 } });
    registerScenario({ id: "tele-notshown", trigger: { kind: "auto" }, presentation: { kind: notShownKind, payload: void 0 } });
    const telemetry = new CapturingTelemetryService();
    const { service } = createService({}, void 0, void 0, telemetry);
    service.start();
    await timeout(0);
    await timeout(0);
    assert.deepStrictEqual(telemetry.events, ["onboarding.scenarioOutcome"]);
  });
  test("emits one shown event only after a presentation renders with its experiment assignment", async () => {
    const presentation = new ShownPresentation(uniqueKind());
    registerPresentation(presentation);
    registerScenario({
      id: "sessions.onboarding.newSessionViewV2",
      experiment: { behaviorFlag: "onb.newSessionViewV2.show", assignmentContextIdFlag: "onb.newSessionViewV2.id" },
      trigger: { kind: "auto" },
      presentation: { kind: presentation.kind, payload: void 0 }
    });
    const telemetry = new CapturingTelemetryService();
    const { service } = createService(
      {},
      new FakeAssignmentService({
        "onb.newSessionViewV2.show": true,
        "onb.newSessionViewV2.id": "onb-new-btn-treat2"
      }),
      void 0,
      telemetry
    );
    service.start();
    await timeout(0);
    await timeout(0);
    assert.deepStrictEqual(telemetry.eventData.filter((event) => event.name === "onboarding.scenarioShown"), [
      {
        name: "onboarding.scenarioShown",
        data: {
          scenarioId: "sessions.onboarding.newSessionViewV2",
          experimentActive: true,
          experimentAssignmentContextId: "onb-new-btn-treat2"
        }
      }
    ]);
    assert.deepStrictEqual(telemetry.events, ["onboarding.scenarioShown", "onboarding.scenarioOutcome"]);
  });
  test("experiment-driven scenario does not run unless both treatment flags are set", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    registerScenario({
      id: "exp-off",
      experiment: { behaviorFlag: "exp.show", assignmentContextIdFlag: "exp.id" },
      trigger: { kind: "auto" },
      presentation: { kind: presentation.kind, payload: void 0 }
    });
    const { service } = createService({}, new FakeAssignmentService({ "exp.show": true }));
    service.start();
    await timeout(0);
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, []);
  });
  test("an assignment-context id without the reserved prefix is rejected as inactive", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    const assignment = new FakeAssignmentService({ "exp.show": true, "exp.id": "newsession-2026q3" });
    registerScenario({
      id: "exp-badid",
      experiment: { behaviorFlag: "exp.show", assignmentContextIdFlag: "exp.id" },
      trigger: { kind: "auto" },
      presentation: { kind: presentation.kind, payload: void 0 }
    });
    const origErrorHandler = errorHandler.getUnexpectedErrorHandler();
    const errors = [];
    setUnexpectedErrorHandler((error) => errors.push(error));
    try {
      const { service } = createService({}, assignment);
      service.start();
      await timeout(0);
      await timeout(0);
      assert.deepStrictEqual(
        { runs: presentation.runs, shown: service.hasBeenShown("exp-badid"), reported: errors.length === 1 },
        { runs: [], shown: false, reported: true }
      );
    } finally {
      setUnexpectedErrorHandler(origErrorHandler);
    }
  });
  test("treatment arm shows the tour and opens the telemetry gate", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    const assignment = new FakeAssignmentService({ "exp.show": true, "exp.id": "onb-tour-q3" });
    registerScenario({
      id: "exp-treat",
      experiment: { behaviorFlag: "exp.show", assignmentContextIdFlag: "exp.id" },
      trigger: { kind: "auto" },
      presentation: { kind: presentation.kind, payload: void 0 }
    });
    const assignmentContext = "onb-tour-q3:12345";
    const { service } = createService({}, assignment);
    const excludedBeforeWouldShow = assignment.isExcluded(assignmentContext);
    service.start();
    await timeout(0);
    await timeout(0);
    assert.deepStrictEqual(
      {
        excludedBeforeWouldShow,
        runs: presentation.runs,
        shown: service.hasBeenShown("exp-treat"),
        excludedAfterWouldShow: assignment.isExcluded(assignmentContext),
        otherVariantExcluded: assignment.isExcluded("onb-tour-q3-other:12346")
      },
      {
        excludedBeforeWouldShow: true,
        runs: ["exp-treat"],
        shown: true,
        excludedAfterWouldShow: false,
        otherVariantExcluded: true
      }
    );
  });
  test("control arm opens the gate but shows nothing and stays eligible", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    const assignment = new FakeAssignmentService({ "exp.show": false, "exp.id": "onb-tour-q3" });
    registerScenario({
      id: "exp-control",
      experiment: { behaviorFlag: "exp.show", assignmentContextIdFlag: "exp.id" },
      trigger: { kind: "auto" },
      presentation: { kind: presentation.kind, payload: void 0 }
    });
    const { service } = createService({}, assignment);
    service.start();
    await timeout(0);
    await timeout(0);
    assert.deepStrictEqual(
      { runs: presentation.runs, shown: service.hasBeenShown("exp-control"), excluded: assignment.isExcluded("onb-tour-q3:12345") },
      { runs: [], shown: false, excluded: false }
    );
  });
  test("developer mode shows an experiment scenario whose experiment is not active", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    const assignment = new FakeAssignmentService({});
    registerScenario({
      id: "exp-dev-inactive",
      experiment: { behaviorFlag: "exp.show", assignmentContextIdFlag: "exp.id" },
      trigger: { kind: "auto" },
      presentation: { kind: presentation.kind, payload: void 0 }
    });
    const { service } = createService({ [ONBOARDING_DEVELOPER_MODE_CONFIG]: { "exp-dev-inactive": true } }, assignment);
    service.start();
    await timeout(0);
    await timeout(0);
    assert.deepStrictEqual(
      { runs: presentation.runs, excluded: assignment.isExcluded("onb-tour-q3") },
      { runs: ["exp-dev-inactive"], excluded: true }
    );
  });
  test("developer mode shows the tour even when the user is in the control arm", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    const assignment = new FakeAssignmentService({ "exp.show": false, "exp.id": "onb-tour-q3" });
    registerScenario({
      id: "exp-dev-control",
      experiment: { behaviorFlag: "exp.show", assignmentContextIdFlag: "exp.id" },
      trigger: { kind: "auto" },
      presentation: { kind: presentation.kind, payload: void 0 }
    });
    const { service } = createService({ [ONBOARDING_DEVELOPER_MODE_CONFIG]: { "exp-dev-control": true } }, assignment);
    service.start();
    await timeout(0);
    await timeout(0);
    assert.deepStrictEqual(
      { runs: presentation.runs, excluded: assignment.isExcluded("onb-tour-q3") },
      { runs: ["exp-dev-control"], excluded: true }
    );
  });
  test("an opened gate persists so the id keeps flowing after a reload", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    const storage = disposables.add(new InMemoryStorageService());
    registerScenario({
      id: "exp-persist",
      experiment: { behaviorFlag: "exp.show", assignmentContextIdFlag: "exp.id" },
      trigger: { kind: "auto" },
      presentation: { kind: presentation.kind, payload: void 0 }
    });
    const first = createService({}, new FakeAssignmentService({ "exp.show": false, "exp.id": "onb-tour-q3" }), storage);
    first.service.start();
    await timeout(0);
    await timeout(0);
    const secondAssignment = new FakeAssignmentService({ "exp.show": false, "exp.id": "onb-tour-q3" });
    createService({}, secondAssignment, storage);
    assert.strictEqual(secondAssignment.isExcluded("onb-tour-q3:12345"), false);
  });
  test("a second experiment with a new id is blocked for a user who already saw the tour", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    const storage = disposables.add(new InMemoryStorageService());
    const kind = presentation.kind;
    disposables.add(onboardingScenarioRegistry.register({
      id: "tour",
      experiment: { behaviorFlag: "exp.show", assignmentContextIdFlag: "exp.id" },
      trigger: { kind: "auto" },
      presentation: { kind, payload: void 0 }
    }));
    const first = createService({}, new FakeAssignmentService({ "exp.show": true, "exp.id": "onb-tour-2026q3" }), storage);
    first.service.start();
    await timeout(0);
    await timeout(0);
    assert.strictEqual(first.service.hasBeenShown("tour"), true);
    const secondAssignment = new FakeAssignmentService({ "exp.show": true, "exp.id": "onb-tour-2027q1" });
    const second = createService({}, secondAssignment, storage);
    second.service.start();
    await timeout(0);
    await timeout(0);
    assert.deepStrictEqual(
      { shown: second.service.hasBeenShown("tour"), excludedNew: secondAssignment.isExcluded("onb-tour-2027q1") },
      { shown: true, excludedNew: true }
    );
  });
  test("shutdown aborts the active scenario and never starts queued ones", async () => {
    const active = new BlockingUntilAbortPresentation(uniqueKind());
    const queued = new RecordingPresentation(uniqueKind());
    registerPresentation(active);
    registerPresentation(queued);
    registerScenario({ id: "active", priority: 10, trigger: { kind: "auto" }, presentation: { kind: active.kind, payload: void 0 } });
    registerScenario({ id: "queued", priority: 1, trigger: { kind: "auto" }, presentation: { kind: queued.kind, payload: void 0 } });
    const { service, lifecycle } = createService();
    service.start();
    await timeout(0);
    assert.deepStrictEqual({ active: active.runs, queued: queued.runs }, { active: ["active"], queued: [] });
    lifecycle.fireShutdown();
    await timeout(0);
    assert.deepStrictEqual({ active: active.runs, queued: queued.runs }, { active: ["active"], queued: [] });
  });
  test("service starts and disposes without leaking", () => {
    const store = new DisposableStore();
    const storage = store.add(new InMemoryStorageService());
    const config = new TestConfigurationService();
    const contextKeyService = store.add(new ContextKeyService(config));
    const lifecycle = store.add(new TestLifecycleService());
    const service = store.add(new OnboardingScenarioService(storage, contextKeyService, config, lifecycle, new NullWorkbenchAssignmentService(), NullTelemetryService));
    service.start();
    store.dispose();
    assert.ok(true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG9uYm9hcmRpbmdcXHRlc3RcXGJyb3dzZXJcXG9uYm9hcmRpbmdTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZXJyb3JIYW5kbGVyLCBzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2Jyb3dzZXIvY29udGV4dEtleVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZVNoYXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBNZW1lbnRvIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21lbWVudG8uanMnO1xuaW1wb3J0IHsgSUFzc2lnbm1lbnRGaWx0ZXIsIElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE51bGxXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Fzc2lnbm1lbnQvdGVzdC9jb21tb24vbnVsbEFzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IE9uYm9hcmRpbmdTY2VuYXJpb1NlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL29uYm9hcmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPbmJvYXJkaW5nUHJlc2VudGF0aW9uLCBJT25ib2FyZGluZ1J1bkNvbnRleHQsIG9uYm9hcmRpbmdQcmVzZW50YXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9vbmJvYXJkaW5nUHJlc2VudGF0aW9uLmpzJztcbmltcG9ydCB7IG9uYm9hcmRpbmdTY2VuYXJpb1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL29uYm9hcmRpbmdSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJT25ib2FyZGluZ1J1blJlc3VsdCwgSU9uYm9hcmRpbmdTY2VuYXJpbywgT25ib2FyZGluZ0Rpc21pc3NSZWFzb24sIE9uYm9hcmRpbmdPdXRjb21lIH0gZnJvbSAnLi4vLi4vY29tbW9uL29uYm9hcmRpbmdTY2VuYXJpby5qcyc7XG5pbXBvcnQgeyBnZXRPbmJvYXJkaW5nRGV2ZWxvcGVyTW9kZVZhcmlhdGlvbiwgT05CT0FSRElOR19ERVZFTE9QRVJfTU9ERV9DT05GSUcsIE9OQk9BUkRJTkdfREVWRUxPUEVSX01PREVfVkFSSUFUSU9OU19DT05GSUcsIE9OQk9BUkRJTkdfRU5BQkxFRF9DT05GSUcgfSBmcm9tICcuLi8uLi9jb21tb24vb25ib2FyZGluZ1NjZW5hcmlvU2VydmljZS5qcyc7XG5cbmZ1bmN0aW9uIGNvbXBsZXRlZFJlc3VsdChvdXRjb21lOiBPbmJvYXJkaW5nT3V0Y29tZSA9IE9uYm9hcmRpbmdPdXRjb21lLkNvbXBsZXRlZCk6IElPbmJvYXJkaW5nUnVuUmVzdWx0IHtcblx0Y29uc3QgZGlzbWlzc1JlYXNvbiA9IG91dGNvbWUgPT09IE9uYm9hcmRpbmdPdXRjb21lLlNraXBwZWQgPyBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5Ta2lwQnV0dG9uXG5cdFx0OiBvdXRjb21lID09PSBPbmJvYXJkaW5nT3V0Y29tZS5BYm9ydGVkID8gT25ib2FyZGluZ0Rpc21pc3NSZWFzb24uQWJvcnRlZFxuXHRcdFx0OiBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5Db21wbGV0ZWQ7XG5cdHJldHVybiB7IG91dGNvbWUsIHNob3duOiB0cnVlLCBkaXNtaXNzUmVhc29uLCBsYXN0U3RlcEluZGV4OiAwLCBzdGVwQ291bnQ6IDEgfTtcbn1cblxuLyoqIEEgcmVzdWx0IGZvciBhIGRlZ2VuZXJhdGUgcnVuIHRoYXQgcmVuZGVyZWQgbm90aGluZyAobm8gc3RlcHMgLyBhbGwgc3RlcHMgc2tpcHBlZCkuICovXG5mdW5jdGlvbiBub3RTaG93blJlc3VsdCgpOiBJT25ib2FyZGluZ1J1blJlc3VsdCB7XG5cdHJldHVybiB7IG91dGNvbWU6IE9uYm9hcmRpbmdPdXRjb21lLkNvbXBsZXRlZCwgc2hvd246IGZhbHNlLCBkaXNtaXNzUmVhc29uOiBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5Db21wbGV0ZWQsIGxhc3RTdGVwSW5kZXg6IDAsIHN0ZXBDb3VudDogMCB9O1xufVxuXG4vKiogQ2FwdHVyZXMgdGhlIG5hbWVzIG9mIGBwdWJsaWNMb2cyYCB0ZWxlbWV0cnkgZXZlbnRzLiAqL1xuY2xhc3MgQ2FwdHVyaW5nVGVsZW1ldHJ5U2VydmljZSBleHRlbmRzIE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUge1xuXHRyZWFkb25seSBldmVudHM6IHN0cmluZ1tdID0gW107XG5cdHJlYWRvbmx5IGV2ZW50RGF0YTogeyByZWFkb25seSBuYW1lOiBzdHJpbmc7IHJlYWRvbmx5IGRhdGE6IHVua25vd24gfVtdID0gW107XG5cdG92ZXJyaWRlIHB1YmxpY0xvZzIoZXZlbnROYW1lPzogc3RyaW5nLCBkYXRhPzogdW5rbm93bik6IHZvaWQge1xuXHRcdGlmIChldmVudE5hbWUpIHtcblx0XHRcdHRoaXMuZXZlbnRzLnB1c2goZXZlbnROYW1lKTtcblx0XHRcdHRoaXMuZXZlbnREYXRhLnB1c2goeyBuYW1lOiBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKiBBIHByZXNlbnRhdGlvbiB0aGF0IHJlc29sdmVzIHdpdGggYSBmaXhlZCBydW4gcmVzdWx0LiAqL1xuY2xhc3MgRml4ZWRSZXN1bHRQcmVzZW50YXRpb24gaW1wbGVtZW50cyBJT25ib2FyZGluZ1ByZXNlbnRhdGlvbiB7XG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IGtpbmQ6IHN0cmluZywgcHJpdmF0ZSByZWFkb25seSByZXN1bHQ6IElPbmJvYXJkaW5nUnVuUmVzdWx0KSB7IH1cblx0YXN5bmMgcnVuKF9zY2VuYXJpbzogSU9uYm9hcmRpbmdTY2VuYXJpbywgX2NvbnRleHQ6IElPbmJvYXJkaW5nUnVuQ29udGV4dCk6IFByb21pc2U8SU9uYm9hcmRpbmdSdW5SZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5yZXN1bHQ7XG5cdH1cbn1cblxuLyoqIEEgcHJlc2VudGF0aW9uIHRoYXQgcmVwb3J0cyBpdHMgZmlyc3QgcmVuZGVyZWQgZWxlbWVudCBiZWZvcmUgY29tcGxldGluZy4gKi9cbmNsYXNzIFNob3duUHJlc2VudGF0aW9uIGltcGxlbWVudHMgSU9uYm9hcmRpbmdQcmVzZW50YXRpb24ge1xuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBraW5kOiBzdHJpbmcpIHsgfVxuXHRhc3luYyBydW4oX3NjZW5hcmlvOiBJT25ib2FyZGluZ1NjZW5hcmlvLCBjb250ZXh0OiBJT25ib2FyZGluZ1J1bkNvbnRleHQpOiBQcm9taXNlPElPbmJvYXJkaW5nUnVuUmVzdWx0PiB7XG5cdFx0Y29udGV4dC5vbkRpZFNob3c/LigpO1xuXHRcdGNvbnRleHQub25EaWRTaG93Py4oKTtcblx0XHRyZXR1cm4gY29tcGxldGVkUmVzdWx0KCk7XG5cdH1cbn1cblxuLyoqIFJlY29yZHMgZXZlcnkgc2NlbmFyaW8gaXQgcmVuZGVycywgdGhlbiByZXNvbHZlcyB3aXRoIGEgZml4ZWQgb3V0Y29tZS4gKi9cbmNsYXNzIFJlY29yZGluZ1ByZXNlbnRhdGlvbiBpbXBsZW1lbnRzIElPbmJvYXJkaW5nUHJlc2VudGF0aW9uIHtcblx0cmVhZG9ubHkgcnVuczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkga2luZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3V0Y29tZTogT25ib2FyZGluZ091dGNvbWUgPSBPbmJvYXJkaW5nT3V0Y29tZS5Db21wbGV0ZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvblJ1bj86ICgpID0+IHZvaWQsXG5cdCkgeyB9XG5cdGFzeW5jIHJ1bihzY2VuYXJpbzogSU9uYm9hcmRpbmdTY2VuYXJpbywgX2NvbnRleHQ6IElPbmJvYXJkaW5nUnVuQ29udGV4dCk6IFByb21pc2U8SU9uYm9hcmRpbmdSdW5SZXN1bHQ+IHtcblx0XHR0aGlzLnJ1bnMucHVzaChzY2VuYXJpby5pZCk7XG5cdFx0dGhpcy5vblJ1bj8uKCk7XG5cdFx0cmV0dXJuIGNvbXBsZXRlZFJlc3VsdCh0aGlzLm91dGNvbWUpO1xuXHR9XG59XG5cbi8qKiBCbG9ja3MgdW50aWwgdGhlIGVuZ2luZSBhYm9ydHMgdGhlIHJ1biAodXNlZCB0byB0ZXN0IHNodXRkb3duIGJlaGF2aW91cikuICovXG5jbGFzcyBCbG9ja2luZ1VudGlsQWJvcnRQcmVzZW50YXRpb24gaW1wbGVtZW50cyBJT25ib2FyZGluZ1ByZXNlbnRhdGlvbiB7XG5cdHJlYWRvbmx5IHJ1bnM6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IGtpbmQ6IHN0cmluZykgeyB9XG5cdHJ1bihzY2VuYXJpbzogSU9uYm9hcmRpbmdTY2VuYXJpbywgY29udGV4dDogSU9uYm9hcmRpbmdSdW5Db250ZXh0KTogUHJvbWlzZTxJT25ib2FyZGluZ1J1blJlc3VsdD4ge1xuXHRcdHRoaXMucnVucy5wdXNoKHNjZW5hcmlvLmlkKTtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8SU9uYm9hcmRpbmdSdW5SZXN1bHQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBjb250ZXh0Lm9uQWJvcnQoKCkgPT4ge1xuXHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlc29sdmUoY29tcGxldGVkUmVzdWx0KE9uYm9hcmRpbmdPdXRjb21lLkFib3J0ZWQpKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG59XG5cbi8qKlxuICogQXNzaWdubWVudCBzZXJ2aWNlIHRlc3QgZG91YmxlIHRoYXQgcmV0dXJucyBjYW5uZWQgdHJlYXRtZW50cyBhbmQgcmVjb3JkcyB0aGUgcmVnaXN0ZXJlZFxuICogdGVsZW1ldHJ5IGZpbHRlciBzbyB0ZXN0cyBjYW4gYXNzZXJ0IHdoaWNoIGFzc2lnbm1lbnQtY29udGV4dCBpZHMgd291bGQgYmUgZXhjbHVkZWQuXG4gKi9cbmNsYXNzIEZha2VBc3NpZ25tZW50U2VydmljZSBleHRlbmRzIE51bGxXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbHRlcnM6IElBc3NpZ25tZW50RmlsdGVyW10gPSBbXTtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSB0cmVhdG1lbnRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuPikge1xuXHRcdHN1cGVyKCk7XG5cdH1cblx0b3ZlcnJpZGUgYXN5bmMgZ2V0VHJlYXRtZW50PFQgZXh0ZW5kcyBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuPihuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFQgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy50cmVhdG1lbnRzW25hbWVdIGFzIFQgfCB1bmRlZmluZWQ7XG5cdH1cblx0b3ZlcnJpZGUgYWRkVGVsZW1ldHJ5QXNzaWdubWVudEZpbHRlcihmaWx0ZXI6IElBc3NpZ25tZW50RmlsdGVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZmlsdGVycy5wdXNoKGZpbHRlcik7XG5cdH1cblx0LyoqIFRydWUgd2hlbiB0aGUgZ2l2ZW4gYXNzaWdubWVudC1jb250ZXh0IGlkIGlzIGN1cnJlbnRseSBleGNsdWRlZCBmcm9tIHRlbGVtZXRyeS4gKi9cblx0aXNFeGNsdWRlZChhc3NpZ25tZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZmlsdGVycy5zb21lKGYgPT4gZi5leGNsdWRlKGFzc2lnbm1lbnQpKTtcblx0fVxufVxuXG5zdWl0ZSgnT25ib2FyZGluZ1NjZW5hcmlvU2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHQvLyBUaGUgTWVtZW50byBtYWludGFpbnMgYSBzdGF0aWMgY2FjaGUga2V5ZWQgYnkgaWQ7IGNsZWFyIGl0IHNvIGVhY2ggdGVzdFxuXHRcdC8vIHN0YXJ0cyB3aXRoIGZyZXNoIHBlcnNpc3RlZCBzdGF0ZSBpbnN0ZWFkIG9mIGxlYWtpbmcgYWNyb3NzIHRlc3RzLlxuXHRcdE1lbWVudG8uY2xlYXIoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0fSk7XG5cblx0dGVzdCgnZGV2ZWxvcGVyIHZhcmlhdGlvbiBvbmx5IG92ZXJyaWRlcyB3aGlsZSBkZXZlbG9wZXIgbW9kZSBpcyBlbmFibGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc2FibGVkID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbT05CT0FSRElOR19ERVZFTE9QRVJfTU9ERV9DT05GSUddOiB7IHRvdXI6IGZhbHNlIH0sXG5cdFx0XHRbT05CT0FSRElOR19ERVZFTE9QRVJfTU9ERV9WQVJJQVRJT05TX0NPTkZJR106IHsgdG91cjogJ2dpdGh1YlByb21wdCcgfSxcblx0XHR9KTtcblx0XHRjb25zdCBlbmFibGVkID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbT05CT0FSRElOR19ERVZFTE9QRVJfTU9ERV9DT05GSUddOiB7IHRvdXI6IHRydWUgfSxcblx0XHRcdFtPTkJPQVJESU5HX0RFVkVMT1BFUl9NT0RFX1ZBUklBVElPTlNfQ09ORklHXTogeyB0b3VyOiAnZ2l0aHViUHJvbXB0JyB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaXNhYmxlZDogZ2V0T25ib2FyZGluZ0RldmVsb3Blck1vZGVWYXJpYXRpb24oZGlzYWJsZWQsICd0b3VyJyksXG5cdFx0XHRlbmFibGVkOiBnZXRPbmJvYXJkaW5nRGV2ZWxvcGVyTW9kZVZhcmlhdGlvbihlbmFibGVkLCAndG91cicpLFxuXHRcdH0sIHtcblx0XHRcdGRpc2FibGVkOiB1bmRlZmluZWQsXG5cdFx0XHRlbmFibGVkOiAnZ2l0aHViUHJvbXB0Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0bGV0IGlkU2VlZCA9IDA7XG5cdGZ1bmN0aW9uIHVuaXF1ZUtpbmQoKTogc3RyaW5nIHsgcmV0dXJuIGB0ZXN0LXByZXNlbnRhdGlvbi0ke2lkU2VlZCsrfWA7IH1cblxuXHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKGNvbmZpZ1ZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fSwgYXNzaWdubWVudD86IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSwgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSwgdGVsZW1ldHJ5OiBJVGVsZW1ldHJ5U2VydmljZSA9IE51bGxUZWxlbWV0cnlTZXJ2aWNlIGFzIHVua25vd24gYXMgSVRlbGVtZXRyeVNlcnZpY2UpOiB7IHNlcnZpY2U6IE9uYm9hcmRpbmdTY2VuYXJpb1NlcnZpY2U7IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7IGNvbmZpZzogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlOyBsaWZlY3ljbGU6IFRlc3RMaWZlY3ljbGVTZXJ2aWNlIH0ge1xuXHRcdGNvbnN0IHN0b3JlID0gZGlzcG9zYWJsZXM7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZShjb25maWdWYWx1ZXMpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBDb250ZXh0S2V5U2VydmljZShjb25maWcpKTtcblx0XHRjb25zdCBsaWZlY3ljbGUgPSBzdG9yZS5hZGQobmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IE9uYm9hcmRpbmdTY2VuYXJpb1NlcnZpY2UoXG5cdFx0XHRzdG9yYWdlLFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRjb25maWcgYXMgdW5rbm93biBhcyBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRsaWZlY3ljbGUsXG5cdFx0XHRhc3NpZ25tZW50ID8/IG5ldyBOdWxsV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UoKSxcblx0XHRcdHRlbGVtZXRyeSxcblx0XHQpKTtcblx0XHRyZXR1cm4geyBzZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgY29uZmlnLCBsaWZlY3ljbGUgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIHJlZ2lzdGVyUHJlc2VudGF0aW9uKHByZXNlbnRhdGlvbjogSU9uYm9hcmRpbmdQcmVzZW50YXRpb24pOiB2b2lkIHtcblx0XHRkaXNwb3NhYmxlcy5hZGQob25ib2FyZGluZ1ByZXNlbnRhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyKHByZXNlbnRhdGlvbikpO1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVnaXN0ZXJTY2VuYXJpbyhzY2VuYXJpbzogSU9uYm9hcmRpbmdTY2VuYXJpbyk6IHZvaWQge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChvbmJvYXJkaW5nU2NlbmFyaW9SZWdpc3RyeS5yZWdpc3RlcihzY2VuYXJpbykpO1xuXHR9XG5cblx0dGVzdCgncnVucyBhbiBlbGlnaWJsZSBhdXRvIHNjZW5hcmlvIGV4YWN0bHkgb25jZSBhbmQgbWFya3MgaXQgc2hvd24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gbmV3IFJlY29yZGluZ1ByZXNlbnRhdGlvbih1bmlxdWVLaW5kKCkpO1xuXHRcdHJlZ2lzdGVyUHJlc2VudGF0aW9uKHByZXNlbnRhdGlvbik7XG5cdFx0cmVnaXN0ZXJTY2VuYXJpbyh7IGlkOiAnYXV0by0xJywgdHJpZ2dlcjogeyBraW5kOiAnYXV0bycgfSwgcHJlc2VudGF0aW9uOiB7IGtpbmQ6IHByZXNlbnRhdGlvbi5raW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfSB9KTtcblxuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdHNlcnZpY2Uuc3RhcnQoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gUmUtZXZhbHVhdGluZyAoZS5nLiBhbm90aGVyIHN0YXJ0KSBtdXN0IG5vdCBydW4gaXQgYWdhaW4uXG5cdFx0c2VydmljZS5zdGFydCgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBydW5zOiBwcmVzZW50YXRpb24ucnVucywgc2hvd246IHNlcnZpY2UuaGFzQmVlblNob3duKCdhdXRvLTEnKSB9LFxuXHRcdFx0eyBydW5zOiBbJ2F1dG8tMSddLCBzaG93bjogdHJ1ZSB9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGV2ZWxvcGVyIG1vZGUgaWdub3JlcyBwcmV2aW91c2x5IHNob3duIHN0YXRlIGZvciBhdXRvIHNjZW5hcmlvcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHRyZWdpc3RlclNjZW5hcmlvKHsgaWQ6ICdkZXYtcmVwZWF0LTEnLCB0cmlnZ2VyOiB7IGtpbmQ6ICdhdXRvJyB9LCBwcmVzZW50YXRpb246IHsga2luZDogcHJlc2VudGF0aW9uLmtpbmQsIHBheWxvYWQ6IHVuZGVmaW5lZCB9IH0pO1xuXG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBmaXJzdCA9IGNyZWF0ZVNlcnZpY2Uoe30sIHVuZGVmaW5lZCwgc3RvcmFnZSkuc2VydmljZTtcblx0XHRmaXJzdC5zdGFydCgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCB7IHNlcnZpY2U6IHNlY29uZCwgY29udGV4dEtleVNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoeyBbT05CT0FSRElOR19ERVZFTE9QRVJfTU9ERV9DT05GSUddOiB7ICdkZXYtcmVwZWF0LTEnOiB0cnVlIH0gfSwgdW5kZWZpbmVkLCBzdG9yYWdlKTtcblx0XHRzZWNvbmQuc3RhcnQoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5PGJvb2xlYW4+KCdvbmJvYXJkaW5nVGVzdERldk1vZGVSZWV2YWx1YXRlJywgZmFsc2UpLnNldCh0cnVlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcmVzZW50YXRpb24ucnVucywgWydkZXYtcmVwZWF0LTEnLCAnZGV2LXJlcGVhdC0xJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBydW4gYXV0b21hdGljYWxseSB3aGVuIG9uYm9hcmRpbmcuZW5hYmxlZCBpcyBmYWxzZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHRyZWdpc3RlclNjZW5hcmlvKHsgaWQ6ICdkaXNhYmxlZC0xJywgdHJpZ2dlcjogeyBraW5kOiAnYXV0bycgfSwgcHJlc2VudGF0aW9uOiB7IGtpbmQ6IHByZXNlbnRhdGlvbi5raW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfSB9KTtcblxuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSh7IFtPTkJPQVJESU5HX0VOQUJMRURfQ09ORklHXTogZmFsc2UgfSk7XG5cdFx0c2VydmljZS5zdGFydCgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByZXNlbnRhdGlvbi5ydW5zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3BlY3RzIHRoZSB3aGVuIGNsYXVzZSBhbmQgcmVhY3RzIHRvIGNvbnRleHQgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHRyZWdpc3RlclNjZW5hcmlvKHtcblx0XHRcdGlkOiAnd2hlbi0xJyxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygnb25ib2FyZGluZ1Rlc3RSZWFkeScsIHRydWUpLFxuXHRcdFx0dHJpZ2dlcjogeyBraW5kOiAnYXV0bycgfSxcblx0XHRcdHByZXNlbnRhdGlvbjogeyBraW5kOiBwcmVzZW50YXRpb24ua2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHsgc2VydmljZSwgY29udGV4dEtleVNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRzZXJ2aWNlLnN0YXJ0KCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByZXNlbnRhdGlvbi5ydW5zLCBbXSwgJ3Nob3VsZCBub3QgcnVuIHdoaWxlIHdoZW4gaXMgdW5zYXRpc2ZpZWQnKTtcblxuXHRcdGNvbnN0IGtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj4gPSBjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoJ29uYm9hcmRpbmdUZXN0UmVhZHknLCBmYWxzZSk7XG5cdFx0a2V5LnNldCh0cnVlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcmVzZW50YXRpb24ucnVucywgWyd3aGVuLTEnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1bnMgaGlnaGVyLXByaW9yaXR5IHNjZW5hcmlvcyBiZWZvcmUgbG93ZXItcHJpb3JpdHkgb25lcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBvcmRlcjogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSwgT25ib2FyZGluZ091dGNvbWUuQ29tcGxldGVkKTtcblx0XHQvLyBUcmFjayBvcmRlcmluZyB2aWEgdGhlIHJlY29yZGVyJ3MgcnVucyBhcnJheSB3aGljaCBpcyBhcHBlbmRlZCBpbiBydW4oKS5cblx0XHRyZWdpc3RlclByZXNlbnRhdGlvbihwcmVzZW50YXRpb24pO1xuXHRcdHJlZ2lzdGVyU2NlbmFyaW8oeyBpZDogJ2xvdycsIHByaW9yaXR5OiAxLCB0cmlnZ2VyOiB7IGtpbmQ6ICdhdXRvJyB9LCBwcmVzZW50YXRpb246IHsga2luZDogcHJlc2VudGF0aW9uLmtpbmQsIHBheWxvYWQ6IHVuZGVmaW5lZCB9IH0pO1xuXHRcdHJlZ2lzdGVyU2NlbmFyaW8oeyBpZDogJ2hpZ2gnLCBwcmlvcml0eTogMTAsIHRyaWdnZXI6IHsga2luZDogJ2F1dG8nIH0sIHByZXNlbnRhdGlvbjogeyBraW5kOiBwcmVzZW50YXRpb24ua2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH0gfSk7XG5cblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRzZXJ2aWNlLnN0YXJ0KCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRvcmRlci5wdXNoKC4uLnByZXNlbnRhdGlvbi5ydW5zKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3JkZXIsIFsnaGlnaCcsICdsb3cnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZ2hlciBwcmlvcml0eSB3aW5zIHdoZW4gZWxpZ2libGUgc2NlbmFyaW9zIHNoYXJlIGEgc2VlbiBrZXknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gbmV3IFJlY29yZGluZ1ByZXNlbnRhdGlvbih1bmlxdWVLaW5kKCkpO1xuXHRcdHJlZ2lzdGVyUHJlc2VudGF0aW9uKHByZXNlbnRhdGlvbik7XG5cdFx0cmVnaXN0ZXJTY2VuYXJpbyh7IGlkOiAnbG93LXNoYXJlZCcsIHNlZW5LZXk6ICdzaGFyZWQnLCBwcmlvcml0eTogMSwgdHJpZ2dlcjogeyBraW5kOiAnYXV0bycgfSwgcHJlc2VudGF0aW9uOiB7IGtpbmQ6IHByZXNlbnRhdGlvbi5raW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfSB9KTtcblx0XHRyZWdpc3RlclNjZW5hcmlvKHsgaWQ6ICdoaWdoLXNoYXJlZCcsIHNlZW5LZXk6ICdzaGFyZWQnLCBwcmlvcml0eTogMTAsIHRyaWdnZXI6IHsga2luZDogJ2F1dG8nIH0sIHByZXNlbnRhdGlvbjogeyBraW5kOiBwcmVzZW50YXRpb24ua2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH0gfSk7XG5cblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRzZXJ2aWNlLnN0YXJ0KCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJlc2VudGF0aW9uLnJ1bnMsIFsnaGlnaC1zaGFyZWQnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29ic2VydmFibGUgdHJpZ2dlcnMgc3RhcnQgdGhlIHNjZW5hcmlvIHdoZW4gdGhlIHNpZ25hbCB0dXJucyB0cnVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IG5ldyBSZWNvcmRpbmdQcmVzZW50YXRpb24odW5pcXVlS2luZCgpKTtcblx0XHRyZWdpc3RlclByZXNlbnRhdGlvbihwcmVzZW50YXRpb24pO1xuXHRcdGNvbnN0IHNpZ25hbCA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignb25ib2FyZGluZ1Rlc3RTaWduYWwnLCBmYWxzZSk7XG5cdFx0cmVnaXN0ZXJTY2VuYXJpbyh7IGlkOiAnb2JzZXJ2YWJsZS0xJywgdHJpZ2dlcjogeyBraW5kOiAnb2JzZXJ2YWJsZScsIHNpZ25hbCB9LCBwcmVzZW50YXRpb246IHsga2luZDogcHJlc2VudGF0aW9uLmtpbmQsIHBheWxvYWQ6IHVuZGVmaW5lZCB9IH0pO1xuXG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0c2VydmljZS5zdGFydCgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcmVzZW50YXRpb24ucnVucywgW10sICdzaG91bGQgbm90IHJ1biB3aGlsZSBzaWduYWwgaXMgZmFsc2UnKTtcblxuXHRcdHNpZ25hbC5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcmVzZW50YXRpb24ucnVucywgWydvYnNlcnZhYmxlLTEnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbW1hbmQtdHJpZ2dlcmVkIHNjZW5hcmlvcyBuZXZlciBydW4gYXV0b21hdGljYWxseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHRyZWdpc3RlclNjZW5hcmlvKHsgaWQ6ICdjb21tYW5kLTEnLCB0cmlnZ2VyOiB7IGtpbmQ6ICdjb21tYW5kJywgY29tbWFuZElkOiAnbm9vcCcgfSwgcHJlc2VudGF0aW9uOiB7IGtpbmQ6IHByZXNlbnRhdGlvbi5raW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfSB9KTtcblxuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdHNlcnZpY2Uuc3RhcnQoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcmVzZW50YXRpb24ucnVucywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdydW5TY2VuYXJpbyBydW5zIG1hbnVhbGx5IGV2ZW4gd2hlbiBkaXNhYmxlZCBhbmQgYWxyZWFkeSBzaG93bicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHRyZWdpc3RlclNjZW5hcmlvKHsgaWQ6ICdtYW51YWwtMScsIHRyaWdnZXI6IHsga2luZDogJ2F1dG8nIH0sIHByZXNlbnRhdGlvbjogeyBraW5kOiBwcmVzZW50YXRpb24ua2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH0gfSk7XG5cblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoeyBbT05CT0FSRElOR19FTkFCTEVEX0NPTkZJR106IGZhbHNlIH0pO1xuXHRcdHNlcnZpY2Uuc3RhcnQoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJlc2VudGF0aW9uLnJ1bnMsIFtdLCAnZGlzYWJsZWQ6IHNob3VsZCBub3QgYXV0by1ydW4nKTtcblxuXHRcdGNvbnN0IG91dGNvbWUgPSBhd2FpdCBzZXJ2aWNlLnJ1blNjZW5hcmlvKCdtYW51YWwtMScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJ1bnM6IHByZXNlbnRhdGlvbi5ydW5zLCBvdXRjb21lIH0sIHsgcnVuczogWydtYW51YWwtMSddLCBvdXRjb21lOiBPbmJvYXJkaW5nT3V0Y29tZS5Db21wbGV0ZWQgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1blNjZW5hcmlvIGpvaW5zIGFuIGluLWZsaWdodCBydW4gaW5zdGVhZCBvZiBzdGFydGluZyBhIHNlY29uZCBvbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHJlbGVhc2UhOiAoKSA9PiB2b2lkO1xuXHRcdGNvbnN0IGdhdGUgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHsgcmVsZWFzZSA9IHJlc29sdmU7IH0pO1xuXHRcdGNvbnN0IGtpbmQgPSB1bmlxdWVLaW5kKCk7XG5cdFx0Y29uc3QgcnVuczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwcmVzZW50YXRpb246IElPbmJvYXJkaW5nUHJlc2VudGF0aW9uID0ge1xuXHRcdFx0a2luZCxcblx0XHRcdGFzeW5jIHJ1bihzY2VuYXJpbzogSU9uYm9hcmRpbmdTY2VuYXJpbyk6IFByb21pc2U8SU9uYm9hcmRpbmdSdW5SZXN1bHQ+IHtcblx0XHRcdFx0cnVucy5wdXNoKHNjZW5hcmlvLmlkKTtcblx0XHRcdFx0YXdhaXQgZ2F0ZTtcblx0XHRcdFx0cmV0dXJuIGNvbXBsZXRlZFJlc3VsdCgpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHRyZWdpc3RlclNjZW5hcmlvKHsgaWQ6ICdpbmZsaWdodC0xJywgdHJpZ2dlcjogeyBraW5kOiAnY29tbWFuZCcsIGNvbW1hbmRJZDogJ25vb3AnIH0sIHByZXNlbnRhdGlvbjogeyBraW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfSB9KTtcblxuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdHNlcnZpY2Uuc3RhcnQoKTtcblxuXHRcdGNvbnN0IGZpcnN0ID0gc2VydmljZS5ydW5TY2VuYXJpbygnaW5mbGlnaHQtMScpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Ly8gU2Vjb25kIGNhbGwgd2hpbGUgdGhlIGZpcnN0IHJ1biBpcyBzdGlsbCBpbi1mbGlnaHQgbXVzdCBub3Qgc3RhcnQgYWdhaW4uXG5cdFx0Y29uc3Qgc2Vjb25kID0gc2VydmljZS5ydW5TY2VuYXJpbygnaW5mbGlnaHQtMScpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRyZWxlYXNlKCk7XG5cdFx0Y29uc3QgW2EsIGJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW2ZpcnN0LCBzZWNvbmRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBydW5zLCBhLCBiIH0sIHsgcnVuczogWydpbmZsaWdodC0xJ10sIGE6IE9uYm9hcmRpbmdPdXRjb21lLkNvbXBsZXRlZCwgYjogT25ib2FyZGluZ091dGNvbWUuQ29tcGxldGVkIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNldEFsbCBjbGVhcnMgc2hvd24gc3RhdGUgc28gdGhlIHNjZW5hcmlvIGNhbiBydW4gYWdhaW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gbmV3IFJlY29yZGluZ1ByZXNlbnRhdGlvbih1bmlxdWVLaW5kKCkpO1xuXHRcdHJlZ2lzdGVyUHJlc2VudGF0aW9uKHByZXNlbnRhdGlvbik7XG5cdFx0cmVnaXN0ZXJTY2VuYXJpbyh7IGlkOiAncmVzZXQtMScsIHRyaWdnZXI6IHsga2luZDogJ2F1dG8nIH0sIHByZXNlbnRhdGlvbjogeyBraW5kOiBwcmVzZW50YXRpb24ua2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH0gfSk7XG5cblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRzZXJ2aWNlLnN0YXJ0KCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdHNlcnZpY2UucmVzZXRBbGwoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNCZWVuU2hvd24oJ3Jlc2V0LTEnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyBzY2VuYXJpb091dGNvbWUgdGVsZW1ldHJ5IHdoZW4gYSB0b3VyIGlzIHNob3duIGJ1dCBub3Qgd2hlbiBub3RoaW5nIGlzIHJlbmRlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNob3duS2luZCA9IHVuaXF1ZUtpbmQoKTtcblx0XHRjb25zdCBub3RTaG93bktpbmQgPSB1bmlxdWVLaW5kKCk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24obmV3IEZpeGVkUmVzdWx0UHJlc2VudGF0aW9uKHNob3duS2luZCwgY29tcGxldGVkUmVzdWx0KCkpKTtcblx0XHRyZWdpc3RlclByZXNlbnRhdGlvbihuZXcgRml4ZWRSZXN1bHRQcmVzZW50YXRpb24obm90U2hvd25LaW5kLCBub3RTaG93blJlc3VsdCgpKSk7XG5cdFx0cmVnaXN0ZXJTY2VuYXJpbyh7IGlkOiAndGVsZS1zaG93bicsIHRyaWdnZXI6IHsga2luZDogJ2F1dG8nIH0sIHByZXNlbnRhdGlvbjogeyBraW5kOiBzaG93bktpbmQsIHBheWxvYWQ6IHVuZGVmaW5lZCB9IH0pO1xuXHRcdHJlZ2lzdGVyU2NlbmFyaW8oeyBpZDogJ3RlbGUtbm90c2hvd24nLCB0cmlnZ2VyOiB7IGtpbmQ6ICdhdXRvJyB9LCBwcmVzZW50YXRpb246IHsga2luZDogbm90U2hvd25LaW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfSB9KTtcblxuXHRcdGNvbnN0IHRlbGVtZXRyeSA9IG5ldyBDYXB0dXJpbmdUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKHt9LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGVsZW1ldHJ5IGFzIHVua25vd24gYXMgSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdHNlcnZpY2Uuc3RhcnQoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHQvLyBPbmUgZXZlbnQgZm9yIHRoZSBzaG93biB0b3VyOyBub25lIGZvciB0aGUgZGVnZW5lcmF0ZSBydW4gdGhhdCByZW5kZXJlZCBub3RoaW5nLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVsZW1ldHJ5LmV2ZW50cywgWydvbmJvYXJkaW5nLnNjZW5hcmlvT3V0Y29tZSddKTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgb25lIHNob3duIGV2ZW50IG9ubHkgYWZ0ZXIgYSBwcmVzZW50YXRpb24gcmVuZGVycyB3aXRoIGl0cyBleHBlcmltZW50IGFzc2lnbm1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gbmV3IFNob3duUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHRyZWdpc3RlclNjZW5hcmlvKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnMub25ib2FyZGluZy5uZXdTZXNzaW9uVmlld1YyJyxcblx0XHRcdGV4cGVyaW1lbnQ6IHsgYmVoYXZpb3JGbGFnOiAnb25iLm5ld1Nlc3Npb25WaWV3VjIuc2hvdycsIGFzc2lnbm1lbnRDb250ZXh0SWRGbGFnOiAnb25iLm5ld1Nlc3Npb25WaWV3VjIuaWQnIH0sXG5cdFx0XHR0cmlnZ2VyOiB7IGtpbmQ6ICdhdXRvJyB9LFxuXHRcdFx0cHJlc2VudGF0aW9uOiB7IGtpbmQ6IHByZXNlbnRhdGlvbi5raW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfVxuXHRcdH0pO1xuXHRcdGNvbnN0IHRlbGVtZXRyeSA9IG5ldyBDYXB0dXJpbmdUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKFxuXHRcdFx0e30sXG5cdFx0XHRuZXcgRmFrZUFzc2lnbm1lbnRTZXJ2aWNlKHtcblx0XHRcdFx0J29uYi5uZXdTZXNzaW9uVmlld1YyLnNob3cnOiB0cnVlLFxuXHRcdFx0XHQnb25iLm5ld1Nlc3Npb25WaWV3VjIuaWQnOiAnb25iLW5ldy1idG4tdHJlYXQyJyxcblx0XHRcdH0pLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dGVsZW1ldHJ5IGFzIHVua25vd24gYXMgSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0KTtcblxuXHRcdHNlcnZpY2Uuc3RhcnQoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeS5ldmVudERhdGEuZmlsdGVyKGV2ZW50ID0+IGV2ZW50Lm5hbWUgPT09ICdvbmJvYXJkaW5nLnNjZW5hcmlvU2hvd24nKSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiAnb25ib2FyZGluZy5zY2VuYXJpb1Nob3duJyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdHNjZW5hcmlvSWQ6ICdzZXNzaW9ucy5vbmJvYXJkaW5nLm5ld1Nlc3Npb25WaWV3VjInLFxuXHRcdFx0XHRcdGV4cGVyaW1lbnRBY3RpdmU6IHRydWUsXG5cdFx0XHRcdFx0ZXhwZXJpbWVudEFzc2lnbm1lbnRDb250ZXh0SWQ6ICdvbmItbmV3LWJ0bi10cmVhdDInLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeS5ldmVudHMsIFsnb25ib2FyZGluZy5zY2VuYXJpb1Nob3duJywgJ29uYm9hcmRpbmcuc2NlbmFyaW9PdXRjb21lJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHBlcmltZW50LWRyaXZlbiBzY2VuYXJpbyBkb2VzIG5vdCBydW4gdW5sZXNzIGJvdGggdHJlYXRtZW50IGZsYWdzIGFyZSBzZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gbmV3IFJlY29yZGluZ1ByZXNlbnRhdGlvbih1bmlxdWVLaW5kKCkpO1xuXHRcdHJlZ2lzdGVyUHJlc2VudGF0aW9uKHByZXNlbnRhdGlvbik7XG5cdFx0cmVnaXN0ZXJTY2VuYXJpbyh7XG5cdFx0XHRpZDogJ2V4cC1vZmYnLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBiZWhhdmlvckZsYWc6ICdleHAuc2hvdycsIGFzc2lnbm1lbnRDb250ZXh0SWRGbGFnOiAnZXhwLmlkJyB9LFxuXHRcdFx0dHJpZ2dlcjogeyBraW5kOiAnYXV0bycgfSxcblx0XHRcdHByZXNlbnRhdGlvbjogeyBraW5kOiBwcmVzZW50YXRpb24ua2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH1cblx0XHR9KTtcblxuXHRcdC8vIE9ubHkgb25lIG9mIHRoZSB0d28gZmxhZ3MgcmVzb2x2ZXMgLT4gdHJlYXRlZCBhcyBub3QgY29uZmlndXJlZCAtPiBkb2VzIG5vdCBydW4uXG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKHt9LCBuZXcgRmFrZUFzc2lnbm1lbnRTZXJ2aWNlKHsgJ2V4cC5zaG93JzogdHJ1ZSB9KSk7XG5cdFx0c2VydmljZS5zdGFydCgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJlc2VudGF0aW9uLnJ1bnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnYW4gYXNzaWdubWVudC1jb250ZXh0IGlkIHdpdGhvdXQgdGhlIHJlc2VydmVkIHByZWZpeCBpcyByZWplY3RlZCBhcyBpbmFjdGl2ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHQvLyBNaXNjb25maWd1cmVkIGlkOiB3b3VsZCBuZXZlciBiZSBnYXRlZCBieSB0aGUgcHJlZml4IGZpbHRlciwgc28gaXQgbXVzdCBub3QgcnVuLlxuXHRcdGNvbnN0IGFzc2lnbm1lbnQgPSBuZXcgRmFrZUFzc2lnbm1lbnRTZXJ2aWNlKHsgJ2V4cC5zaG93JzogdHJ1ZSwgJ2V4cC5pZCc6ICduZXdzZXNzaW9uLTIwMjZxMycgfSk7XG5cdFx0cmVnaXN0ZXJTY2VuYXJpbyh7XG5cdFx0XHRpZDogJ2V4cC1iYWRpZCcsXG5cdFx0XHRleHBlcmltZW50OiB7IGJlaGF2aW9yRmxhZzogJ2V4cC5zaG93JywgYXNzaWdubWVudENvbnRleHRJZEZsYWc6ICdleHAuaWQnIH0sXG5cdFx0XHR0cmlnZ2VyOiB7IGtpbmQ6ICdhdXRvJyB9LFxuXHRcdFx0cHJlc2VudGF0aW9uOiB7IGtpbmQ6IHByZXNlbnRhdGlvbi5raW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgb3JpZ0Vycm9ySGFuZGxlciA9IGVycm9ySGFuZGxlci5nZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCk7XG5cdFx0Y29uc3QgZXJyb3JzOiB1bmtub3duW10gPSBbXTtcblx0XHRzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKGVycm9yID0+IGVycm9ycy5wdXNoKGVycm9yKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSh7fSwgYXNzaWdubWVudCk7XG5cdFx0XHRzZXJ2aWNlLnN0YXJ0KCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBydW5zOiBwcmVzZW50YXRpb24ucnVucywgc2hvd246IHNlcnZpY2UuaGFzQmVlblNob3duKCdleHAtYmFkaWQnKSwgcmVwb3J0ZWQ6IGVycm9ycy5sZW5ndGggPT09IDEgfSxcblx0XHRcdFx0eyBydW5zOiBbXSwgc2hvd246IGZhbHNlLCByZXBvcnRlZDogdHJ1ZSB9XG5cdFx0XHQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdFcnJvckhhbmRsZXIpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgndHJlYXRtZW50IGFybSBzaG93cyB0aGUgdG91ciBhbmQgb3BlbnMgdGhlIHRlbGVtZXRyeSBnYXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IG5ldyBSZWNvcmRpbmdQcmVzZW50YXRpb24odW5pcXVlS2luZCgpKTtcblx0XHRyZWdpc3RlclByZXNlbnRhdGlvbihwcmVzZW50YXRpb24pO1xuXHRcdGNvbnN0IGFzc2lnbm1lbnQgPSBuZXcgRmFrZUFzc2lnbm1lbnRTZXJ2aWNlKHsgJ2V4cC5zaG93JzogdHJ1ZSwgJ2V4cC5pZCc6ICdvbmItdG91ci1xMycgfSk7XG5cdFx0cmVnaXN0ZXJTY2VuYXJpbyh7XG5cdFx0XHRpZDogJ2V4cC10cmVhdCcsXG5cdFx0XHRleHBlcmltZW50OiB7IGJlaGF2aW9yRmxhZzogJ2V4cC5zaG93JywgYXNzaWdubWVudENvbnRleHRJZEZsYWc6ICdleHAuaWQnIH0sXG5cdFx0XHR0cmlnZ2VyOiB7IGtpbmQ6ICdhdXRvJyB9LFxuXHRcdFx0cHJlc2VudGF0aW9uOiB7IGtpbmQ6IHByZXNlbnRhdGlvbi5raW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYXNzaWdubWVudENvbnRleHQgPSAnb25iLXRvdXItcTM6MTIzNDUnO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSh7fSwgYXNzaWdubWVudCk7XG5cdFx0Y29uc3QgZXhjbHVkZWRCZWZvcmVXb3VsZFNob3cgPSBhc3NpZ25tZW50LmlzRXhjbHVkZWQoYXNzaWdubWVudENvbnRleHQpO1xuXG5cdFx0c2VydmljZS5zdGFydCgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdGV4Y2x1ZGVkQmVmb3JlV291bGRTaG93LFxuXHRcdFx0XHRydW5zOiBwcmVzZW50YXRpb24ucnVucyxcblx0XHRcdFx0c2hvd246IHNlcnZpY2UuaGFzQmVlblNob3duKCdleHAtdHJlYXQnKSxcblx0XHRcdFx0ZXhjbHVkZWRBZnRlcldvdWxkU2hvdzogYXNzaWdubWVudC5pc0V4Y2x1ZGVkKGFzc2lnbm1lbnRDb250ZXh0KSxcblx0XHRcdFx0b3RoZXJWYXJpYW50RXhjbHVkZWQ6IGFzc2lnbm1lbnQuaXNFeGNsdWRlZCgnb25iLXRvdXItcTMtb3RoZXI6MTIzNDYnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0ZXhjbHVkZWRCZWZvcmVXb3VsZFNob3c6IHRydWUsXG5cdFx0XHRcdHJ1bnM6IFsnZXhwLXRyZWF0J10sXG5cdFx0XHRcdHNob3duOiB0cnVlLFxuXHRcdFx0XHRleGNsdWRlZEFmdGVyV291bGRTaG93OiBmYWxzZSxcblx0XHRcdFx0b3RoZXJWYXJpYW50RXhjbHVkZWQ6IHRydWVcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250cm9sIGFybSBvcGVucyB0aGUgZ2F0ZSBidXQgc2hvd3Mgbm90aGluZyBhbmQgc3RheXMgZWxpZ2libGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gbmV3IFJlY29yZGluZ1ByZXNlbnRhdGlvbih1bmlxdWVLaW5kKCkpO1xuXHRcdHJlZ2lzdGVyUHJlc2VudGF0aW9uKHByZXNlbnRhdGlvbik7XG5cdFx0Y29uc3QgYXNzaWdubWVudCA9IG5ldyBGYWtlQXNzaWdubWVudFNlcnZpY2UoeyAnZXhwLnNob3cnOiBmYWxzZSwgJ2V4cC5pZCc6ICdvbmItdG91ci1xMycgfSk7XG5cdFx0cmVnaXN0ZXJTY2VuYXJpbyh7XG5cdFx0XHRpZDogJ2V4cC1jb250cm9sJyxcblx0XHRcdGV4cGVyaW1lbnQ6IHsgYmVoYXZpb3JGbGFnOiAnZXhwLnNob3cnLCBhc3NpZ25tZW50Q29udGV4dElkRmxhZzogJ2V4cC5pZCcgfSxcblx0XHRcdHRyaWdnZXI6IHsga2luZDogJ2F1dG8nIH0sXG5cdFx0XHRwcmVzZW50YXRpb246IHsga2luZDogcHJlc2VudGF0aW9uLmtpbmQsIHBheWxvYWQ6IHVuZGVmaW5lZCB9XG5cdFx0fSk7XG5cblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2Uoe30sIGFzc2lnbm1lbnQpO1xuXHRcdHNlcnZpY2Uuc3RhcnQoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHQvLyBObyB0b3VyIHNob3duLCBub3QgbWFya2VkIHNob3duIChyZS1lbGlnaWJsZSBsYXRlciksIGJ1dCB0aGUgaWQgbm93IGZsb3dzLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHJ1bnM6IHByZXNlbnRhdGlvbi5ydW5zLCBzaG93bjogc2VydmljZS5oYXNCZWVuU2hvd24oJ2V4cC1jb250cm9sJyksIGV4Y2x1ZGVkOiBhc3NpZ25tZW50LmlzRXhjbHVkZWQoJ29uYi10b3VyLXEzOjEyMzQ1JykgfSxcblx0XHRcdHsgcnVuczogW10sIHNob3duOiBmYWxzZSwgZXhjbHVkZWQ6IGZhbHNlIH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXZlbG9wZXIgbW9kZSBzaG93cyBhbiBleHBlcmltZW50IHNjZW5hcmlvIHdob3NlIGV4cGVyaW1lbnQgaXMgbm90IGFjdGl2ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHQvLyBOZWl0aGVyIHRyZWF0bWVudCBmbGFnIHJlc29sdmVzOiB0aGUgZXhwZXJpbWVudCBpcyBpbmFjdGl2ZSwgc28gaXQgd291bGQgbm90IHJ1blxuXHRcdC8vIGF1dG9tYXRpY2FsbHkgXHUyMDE0IGJ1dCBkZXZlbG9wZXIgbW9kZSBieXBhc3NlcyB0aGUgZXhwZXJpbWVudCBnYXRlLlxuXHRcdGNvbnN0IGFzc2lnbm1lbnQgPSBuZXcgRmFrZUFzc2lnbm1lbnRTZXJ2aWNlKHt9KTtcblx0XHRyZWdpc3RlclNjZW5hcmlvKHtcblx0XHRcdGlkOiAnZXhwLWRldi1pbmFjdGl2ZScsXG5cdFx0XHRleHBlcmltZW50OiB7IGJlaGF2aW9yRmxhZzogJ2V4cC5zaG93JywgYXNzaWdubWVudENvbnRleHRJZEZsYWc6ICdleHAuaWQnIH0sXG5cdFx0XHR0cmlnZ2VyOiB7IGtpbmQ6ICdhdXRvJyB9LFxuXHRcdFx0cHJlc2VudGF0aW9uOiB7IGtpbmQ6IHByZXNlbnRhdGlvbi5raW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKHsgW09OQk9BUkRJTkdfREVWRUxPUEVSX01PREVfQ09ORklHXTogeyAnZXhwLWRldi1pbmFjdGl2ZSc6IHRydWUgfSB9LCBhc3NpZ25tZW50KTtcblx0XHRzZXJ2aWNlLnN0YXJ0KCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gVGhlIHRvdXIgaXMgc2hvd24sIGJ1dCBzaW5jZSB0aGUgZXhwZXJpbWVudCBpcyBub3QgYWN0aXZlIG5vIHRlbGVtZXRyeSBnYXRlIGlzXG5cdFx0Ly8gb3BlbmVkICh0aGVyZSBpcyBubyBhc3NpZ25tZW50LWNvbnRleHQgaWQgdG8gZmxvdykuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgcnVuczogcHJlc2VudGF0aW9uLnJ1bnMsIGV4Y2x1ZGVkOiBhc3NpZ25tZW50LmlzRXhjbHVkZWQoJ29uYi10b3VyLXEzJykgfSxcblx0XHRcdHsgcnVuczogWydleHAtZGV2LWluYWN0aXZlJ10sIGV4Y2x1ZGVkOiB0cnVlIH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXZlbG9wZXIgbW9kZSBzaG93cyB0aGUgdG91ciBldmVuIHdoZW4gdGhlIHVzZXIgaXMgaW4gdGhlIGNvbnRyb2wgYXJtJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IG5ldyBSZWNvcmRpbmdQcmVzZW50YXRpb24odW5pcXVlS2luZCgpKTtcblx0XHRyZWdpc3RlclByZXNlbnRhdGlvbihwcmVzZW50YXRpb24pO1xuXHRcdGNvbnN0IGFzc2lnbm1lbnQgPSBuZXcgRmFrZUFzc2lnbm1lbnRTZXJ2aWNlKHsgJ2V4cC5zaG93JzogZmFsc2UsICdleHAuaWQnOiAnb25iLXRvdXItcTMnIH0pO1xuXHRcdHJlZ2lzdGVyU2NlbmFyaW8oe1xuXHRcdFx0aWQ6ICdleHAtZGV2LWNvbnRyb2wnLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBiZWhhdmlvckZsYWc6ICdleHAuc2hvdycsIGFzc2lnbm1lbnRDb250ZXh0SWRGbGFnOiAnZXhwLmlkJyB9LFxuXHRcdFx0dHJpZ2dlcjogeyBraW5kOiAnYXV0bycgfSxcblx0XHRcdHByZXNlbnRhdGlvbjogeyBraW5kOiBwcmVzZW50YXRpb24ua2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSh7IFtPTkJPQVJESU5HX0RFVkVMT1BFUl9NT0RFX0NPTkZJR106IHsgJ2V4cC1kZXYtY29udHJvbCc6IHRydWUgfSB9LCBhc3NpZ25tZW50KTtcblx0XHRzZXJ2aWNlLnN0YXJ0KCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gRGV2ZWxvcGVyIG1vZGUgc2hvd3MgdGhlIHRvdXIgdW5jb25kaXRpb25hbGx5IGFuZCBuZXZlciBvcGVucyB0aGUgdGVsZW1ldHJ5XG5cdFx0Ly8gZ2F0ZSwgc28gdGhlIGFzc2lnbm1lbnQtY29udGV4dCBpZCBzdGF5cyBleGNsdWRlZCBldmVuIHRob3VnaCB0aGUgdXNlciBpcyBpblxuXHRcdC8vIHRoZSAoYWN0aXZlKSBjb250cm9sIGFybSBcdTIwMTQgYSBsb2NhbCBwcmV2aWV3IGNhbid0IGFmZmVjdCB0aGUgc2NvcmVjYXJkLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHJ1bnM6IHByZXNlbnRhdGlvbi5ydW5zLCBleGNsdWRlZDogYXNzaWdubWVudC5pc0V4Y2x1ZGVkKCdvbmItdG91ci1xMycpIH0sXG5cdFx0XHR7IHJ1bnM6IFsnZXhwLWRldi1jb250cm9sJ10sIGV4Y2x1ZGVkOiB0cnVlIH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhbiBvcGVuZWQgZ2F0ZSBwZXJzaXN0cyBzbyB0aGUgaWQga2VlcHMgZmxvd2luZyBhZnRlciBhIHJlbG9hZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHJlZ2lzdGVyU2NlbmFyaW8oe1xuXHRcdFx0aWQ6ICdleHAtcGVyc2lzdCcsXG5cdFx0XHRleHBlcmltZW50OiB7IGJlaGF2aW9yRmxhZzogJ2V4cC5zaG93JywgYXNzaWdubWVudENvbnRleHRJZEZsYWc6ICdleHAuaWQnIH0sXG5cdFx0XHR0cmlnZ2VyOiB7IGtpbmQ6ICdhdXRvJyB9LFxuXHRcdFx0cHJlc2VudGF0aW9uOiB7IGtpbmQ6IHByZXNlbnRhdGlvbi5raW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfVxuXHRcdH0pO1xuXG5cdFx0Ly8gRmlyc3QgXCJzZXNzaW9uXCI6IGNvbnRyb2wgcmVhY2hlcyB3b3VsZC1zaG93IGFuZCBvcGVucyB0aGUgZ2F0ZS5cblx0XHRjb25zdCBmaXJzdCA9IGNyZWF0ZVNlcnZpY2Uoe30sIG5ldyBGYWtlQXNzaWdubWVudFNlcnZpY2UoeyAnZXhwLnNob3cnOiBmYWxzZSwgJ2V4cC5pZCc6ICdvbmItdG91ci1xMycgfSksIHN0b3JhZ2UpO1xuXHRcdGZpcnN0LnNlcnZpY2Uuc3RhcnQoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHQvLyBTZWNvbmQgXCJzZXNzaW9uXCIgKHJlbG9hZCkgd2l0aCBhIGZyZXNoIHNlcnZpY2UgKyBhc3NpZ25tZW50IHNlcnZpY2U6IHRoZSBwZXJzaXN0ZWRcblx0XHQvLyBnYXRlIG11c3QgaW1tZWRpYXRlbHkgYWxsb3cgdGhlIGlkLCBldmVuIGJlZm9yZSBhbnkgd291bGQtc2hvdyB0aGlzIHNlc3Npb24uXG5cdFx0Y29uc3Qgc2Vjb25kQXNzaWdubWVudCA9IG5ldyBGYWtlQXNzaWdubWVudFNlcnZpY2UoeyAnZXhwLnNob3cnOiBmYWxzZSwgJ2V4cC5pZCc6ICdvbmItdG91ci1xMycgfSk7XG5cdFx0Y3JlYXRlU2VydmljZSh7fSwgc2Vjb25kQXNzaWdubWVudCwgc3RvcmFnZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kQXNzaWdubWVudC5pc0V4Y2x1ZGVkKCdvbmItdG91ci1xMzoxMjM0NScpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Egc2Vjb25kIGV4cGVyaW1lbnQgd2l0aCBhIG5ldyBpZCBpcyBibG9ja2VkIGZvciBhIHVzZXIgd2hvIGFscmVhZHkgc2F3IHRoZSB0b3VyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IG5ldyBSZWNvcmRpbmdQcmVzZW50YXRpb24odW5pcXVlS2luZCgpKTtcblx0XHRyZWdpc3RlclByZXNlbnRhdGlvbihwcmVzZW50YXRpb24pO1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qga2luZCA9IHByZXNlbnRhdGlvbi5raW5kO1xuXG5cdFx0Ly8gRXhwZXJpbWVudCAxOiB0cmVhdG1lbnQuIFRoZSB1c2VyIHNlZXMgdGhlIHRvdXIgYW5kIGlzIG1hcmtlZCBzaG93bi5cblx0XHRkaXNwb3NhYmxlcy5hZGQob25ib2FyZGluZ1NjZW5hcmlvUmVnaXN0cnkucmVnaXN0ZXIoe1xuXHRcdFx0aWQ6ICd0b3VyJyxcblx0XHRcdGV4cGVyaW1lbnQ6IHsgYmVoYXZpb3JGbGFnOiAnZXhwLnNob3cnLCBhc3NpZ25tZW50Q29udGV4dElkRmxhZzogJ2V4cC5pZCcgfSxcblx0XHRcdHRyaWdnZXI6IHsga2luZDogJ2F1dG8nIH0sXG5cdFx0XHRwcmVzZW50YXRpb246IHsga2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH1cblx0XHR9KSk7XG5cdFx0Y29uc3QgZmlyc3QgPSBjcmVhdGVTZXJ2aWNlKHt9LCBuZXcgRmFrZUFzc2lnbm1lbnRTZXJ2aWNlKHsgJ2V4cC5zaG93JzogdHJ1ZSwgJ2V4cC5pZCc6ICdvbmItdG91ci0yMDI2cTMnIH0pLCBzdG9yYWdlKTtcblx0XHRmaXJzdC5zZXJ2aWNlLnN0YXJ0KCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5zZXJ2aWNlLmhhc0JlZW5TaG93bigndG91cicpLCB0cnVlKTtcblxuXHRcdC8vIEV4cGVyaW1lbnQgMiAobmV3IGlkKSBpbiBhIHJlbG9hZDogYWxyZWFkeSBzaG93biAtPiBub3QgZWxpZ2libGUgLT4gaWQgc3RheXMgYmxvY2tlZC5cblx0XHRjb25zdCBzZWNvbmRBc3NpZ25tZW50ID0gbmV3IEZha2VBc3NpZ25tZW50U2VydmljZSh7ICdleHAuc2hvdyc6IHRydWUsICdleHAuaWQnOiAnb25iLXRvdXItMjAyN3ExJyB9KTtcblx0XHRjb25zdCBzZWNvbmQgPSBjcmVhdGVTZXJ2aWNlKHt9LCBzZWNvbmRBc3NpZ25tZW50LCBzdG9yYWdlKTtcblx0XHRzZWNvbmQuc2VydmljZS5zdGFydCgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHNob3duOiBzZWNvbmQuc2VydmljZS5oYXNCZWVuU2hvd24oJ3RvdXInKSwgZXhjbHVkZWROZXc6IHNlY29uZEFzc2lnbm1lbnQuaXNFeGNsdWRlZCgnb25iLXRvdXItMjAyN3ExJykgfSxcblx0XHRcdHsgc2hvd246IHRydWUsIGV4Y2x1ZGVkTmV3OiB0cnVlIH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaHV0ZG93biBhYm9ydHMgdGhlIGFjdGl2ZSBzY2VuYXJpbyBhbmQgbmV2ZXIgc3RhcnRzIHF1ZXVlZCBvbmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdGl2ZSA9IG5ldyBCbG9ja2luZ1VudGlsQWJvcnRQcmVzZW50YXRpb24odW5pcXVlS2luZCgpKTtcblx0XHRjb25zdCBxdWV1ZWQgPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24oYWN0aXZlKTtcblx0XHRyZWdpc3RlclByZXNlbnRhdGlvbihxdWV1ZWQpO1xuXHRcdC8vIGBhY3RpdmVgIGhhcyBoaWdoZXIgcHJpb3JpdHkgc28gaXQgcnVucyBmaXJzdCBhbmQgYmxvY2tzOyBgcXVldWVkYCB3YWl0cy5cblx0XHRyZWdpc3RlclNjZW5hcmlvKHsgaWQ6ICdhY3RpdmUnLCBwcmlvcml0eTogMTAsIHRyaWdnZXI6IHsga2luZDogJ2F1dG8nIH0sIHByZXNlbnRhdGlvbjogeyBraW5kOiBhY3RpdmUua2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH0gfSk7XG5cdFx0cmVnaXN0ZXJTY2VuYXJpbyh7IGlkOiAncXVldWVkJywgcHJpb3JpdHk6IDEsIHRyaWdnZXI6IHsga2luZDogJ2F1dG8nIH0sIHByZXNlbnRhdGlvbjogeyBraW5kOiBxdWV1ZWQua2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH0gfSk7XG5cblx0XHRjb25zdCB7IHNlcnZpY2UsIGxpZmVjeWNsZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdHNlcnZpY2Uuc3RhcnQoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdC8vIE9ubHkgdGhlIGFjdGl2ZSAoYmxvY2tpbmcpIHNjZW5hcmlvIHNob3VsZCBoYXZlIHN0YXJ0ZWQuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFjdGl2ZTogYWN0aXZlLnJ1bnMsIHF1ZXVlZDogcXVldWVkLnJ1bnMgfSwgeyBhY3RpdmU6IFsnYWN0aXZlJ10sIHF1ZXVlZDogW10gfSk7XG5cblx0XHRsaWZlY3ljbGUuZmlyZVNodXRkb3duKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdC8vIFRoZSBxdWV1ZWQgc2NlbmFyaW8gbXVzdCBuZXZlciBoYXZlIGJlZW4gcHJlc2VudGVkLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhY3RpdmU6IGFjdGl2ZS5ydW5zLCBxdWV1ZWQ6IHF1ZXVlZC5ydW5zIH0sIHsgYWN0aXZlOiBbJ2FjdGl2ZSddLCBxdWV1ZWQ6IFtdIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJ2aWNlIHN0YXJ0cyBhbmQgZGlzcG9zZXMgd2l0aG91dCBsZWFraW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSBzdG9yZS5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBDb250ZXh0S2V5U2VydmljZShjb25maWcpKTtcblx0XHRjb25zdCBsaWZlY3ljbGUgPSBzdG9yZS5hZGQobmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IE9uYm9hcmRpbmdTY2VuYXJpb1NlcnZpY2Uoc3RvcmFnZSwgY29udGV4dEtleVNlcnZpY2UsIGNvbmZpZyBhcyB1bmtub3duIGFzIElDb25maWd1cmF0aW9uU2VydmljZSwgbGlmZWN5Y2xlLCBuZXcgTnVsbFdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlIGFzIHVua25vd24gYXMgSVRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRzZXJ2aWNlLnN0YXJ0KCk7XG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5vayh0cnVlKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxjQUFjLGlDQUFpQztBQUN4RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUV4RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNCQUF1RDtBQUNoRSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHdCQUF3QixvQkFBb0I7QUFFckQsU0FBUyxzQkFBc0IsaUNBQWlDO0FBQ2hFLFNBQVMsZUFBZTtBQUV4QixTQUFTLHNDQUFzQztBQUMvQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGlDQUFpQztBQUMxQyxTQUF5RCxzQ0FBc0M7QUFDL0YsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBb0QseUJBQXlCLHlCQUF5QjtBQUN0RyxTQUFTLHFDQUFxQyxrQ0FBa0Ms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
