var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { DeferredPromise } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IWorkbenchAssignmentService } from "../../../services/assignment/common/assignmentService.js";
import { Memento } from "../../../common/memento.js";
import { onboardingPresentationRegistry } from "../common/onboardingPresentation.js";
import { onboardingScenarioRegistry } from "../common/onboardingRegistry.js";
import { ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX, OnboardingOutcome } from "../common/onboardingScenario.js";
import { isOnboardingDeveloperModeEnabled, ONBOARDING_DEVELOPER_MODE_CONFIG, ONBOARDING_ENABLED_CONFIG } from "../common/onboardingScenarioService.js";
let OnboardingScenarioService = class extends Disposable {
  constructor(storageService, contextKeyService, configurationService, lifecycleService, assignmentService, telemetryService) {
    super();
    this.storageService = storageService;
    this.contextKeyService = contextKeyService;
    this.configurationService = configurationService;
    this.lifecycleService = lifecycleService;
    this.assignmentService = assignmentService;
    this.telemetryService = telemetryService;
    /** Listeners for `observable` triggers, rebuilt whenever the registry changes. */
    this._triggerListeners = this._register(new DisposableStore());
    /** Scenario ids currently queued or running (prevents double-scheduling). */
    this._pending = /* @__PURE__ */ new Set();
    this._queue = [];
    /** Deferreds for scenarios that have been dequeued and are currently running, keyed by id. */
    this._inflight = /* @__PURE__ */ new Map();
    this._pumping = false;
    /** Resolved experiment treatment state, keyed by scenario id. */
    this._experimentStates = /* @__PURE__ */ new Map();
    this._onDidChangeOpenedIds = this._register(new Emitter());
    this._started = false;
    this._stopped = false;
    this._shownSinceStart = /* @__PURE__ */ new Set();
    this._memento = new Memento(OnboardingScenarioService.MEMENTO_ID, this.storageService);
    this._state = this._memento.getMemento(StorageScope.APPLICATION, StorageTarget.MACHINE);
    this._openedAssignmentContextIds = this._loadOpenedIds();
    this.assignmentService.addTelemetryAssignmentFilter({
      id: "onboarding",
      exclude: (assignment) => {
        const variant = getAssignmentContextVariant(assignment);
        return variant.startsWith(ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX) && !this._openedAssignmentContextIds.has(variant);
      },
      onDidChange: this._onDidChangeOpenedIds.event
    });
    this._register(this.lifecycleService.onWillShutdown(() => this._stop()));
  }
  _stop() {
    this._stopped = true;
    this._activeAbort?.fire();
    let entry;
    while (entry = this._queue.shift()) {
      this._pending.delete(entry.scenario.id);
      entry.deferred.complete(OnboardingOutcome.Aborted);
    }
  }
  start() {
    if (this._started) {
      return;
    }
    this._started = true;
    this._register(onboardingScenarioRegistry.onDidChange(() => {
      this._registerTriggerListeners();
      this._resolveExperiments();
      this._evaluate();
    }));
    this._register(this.contextKeyService.onDidChangeContext(() => this._evaluate()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ONBOARDING_ENABLED_CONFIG) || e.affectsConfiguration(ONBOARDING_DEVELOPER_MODE_CONFIG)) {
        this._evaluate();
      }
    }));
    this._registerTriggerListeners();
    this._resolveExperiments();
    this._evaluate();
  }
  getScenarios() {
    return onboardingScenarioRegistry.getScenarios();
  }
  async runScenario(id) {
    const scenario = onboardingScenarioRegistry.getScenario(id);
    if (!scenario) {
      throw new Error(`Unknown onboarding scenario '${id}'.`);
    }
    return this._enqueue(scenario);
  }
  hasBeenShown(id) {
    const scenario = onboardingScenarioRegistry.getScenario(id);
    return this._hasBeenShownKey(scenario ? this._seenKey(scenario) : id, id);
  }
  reset(id) {
    const scenario = onboardingScenarioRegistry.getScenario(id);
    delete this._state[scenario ? this._seenKey(scenario) : id];
    this._memento.saveMemento();
  }
  resetAll() {
    for (const key of Object.keys(this._state)) {
      delete this._state[key];
    }
    this._memento.saveMemento();
  }
  //#region Eligibility & scheduling
  /**
   * The master switch for *automatic* onboarding. When `onboarding.enabled` is
   * explicitly `false`, no scenario ever runs automatically (developer mode does
   * NOT override this — see {@link _evaluate}). Any other value (including unset)
   * is treated as enabled. On-demand {@link runScenario} is intentionally exempt
   * from this switch.
   */
  get _enabled() {
    return this.configurationService.getValue(ONBOARDING_ENABLED_CONFIG) !== false;
  }
  _isDeveloperMode(scenarioId) {
    return isOnboardingDeveloperModeEnabled(this.configurationService, scenarioId);
  }
  /**
   * Re-evaluate every scenario and enqueue any that are eligible to run
   * automatically. Idempotent: already shown / queued scenarios are skipped.
   *
   * The automatic eligibility rules are:
   * 1. If `onboarding.enabled` is `false`, nothing runs automatically — this
   *    method returns immediately, and developer mode does NOT override it.
   * 2. If a scenario declares an `experiment`, it only runs when the experiment
   *    is active AND the user is in the treatment arm (see below) — OR when
   *    developer mode is enabled for that scenario, which bypasses the experiment
   *    gate so the tour can be previewed locally.
   * 3. If a scenario has no `experiment`, it runs for every user that meets its
   *    `when`/trigger criteria (the typical state once an experiment has graduated
   *    and the tour is rolled out to everyone).
   *
   * For an experiment-active scenario, reaching eligibility *is* the "would-show"
   * moment: the telemetry gate is opened for the experiment's assignment-context id
   * (in both arms), and then only the treatment arm is enqueued to actually show the
   * tour. Control opens the gate but renders nothing and is not marked as shown.
   *
   * Developer mode is the exception: it shows the tour unconditionally and never
   * opens the telemetry gate, so a local preview can never affect the experiment
   * scorecard regardless of which arm the developer happens to be assigned to.
   */
  _evaluate() {
    if (!this._enabled || this._stopped) {
      return;
    }
    const claimedSeenKeys = /* @__PURE__ */ new Set();
    for (const scenario of onboardingScenarioRegistry.getScenarios()) {
      if (!scenario.repeatable && this._pending.has(scenario.id)) {
        claimedSeenKeys.add(this._seenKey(scenario));
      }
    }
    const eligibleScenarios = onboardingScenarioRegistry.getScenarios().map((scenario, registrationIndex) => ({ scenario, registrationIndex })).filter(({ scenario }) => this._isAutoEligible(scenario)).sort((a, b) => (b.scenario.priority ?? 0) - (a.scenario.priority ?? 0) || a.registrationIndex - b.registrationIndex);
    for (const { scenario } of eligibleScenarios) {
      const seenKey = this._seenKey(scenario);
      if (!scenario.repeatable && claimedSeenKeys.has(seenKey)) {
        continue;
      }
      const experiment = scenario.experiment ? this._experimentStates.get(scenario.id) : void 0;
      if (experiment?.active && !this._isDeveloperMode(scenario.id)) {
        this._openGate(experiment.assignmentContextId);
        if (!experiment.behavior) {
          continue;
        }
      }
      this._enqueue(scenario);
      if (!scenario.repeatable) {
        claimedSeenKeys.add(seenKey);
      }
    }
  }
  _isAutoEligible(scenario) {
    if (scenario.trigger.kind === "command") {
      return false;
    }
    if (this._pending.has(scenario.id)) {
      return false;
    }
    if (!scenario.repeatable && this._hasBeenShownKey(this._seenKey(scenario), scenario.id)) {
      return false;
    }
    if (scenario.when && !this.contextKeyService.contextMatchesRules(scenario.when)) {
      return false;
    }
    if (scenario.experiment && this._experimentStates.get(scenario.id)?.active !== true && !this._isDeveloperMode(scenario.id)) {
      return false;
    }
    if (scenario.trigger.kind === "observable" && scenario.trigger.signal.get() !== true) {
      return false;
    }
    return true;
  }
  _enqueue(scenario) {
    if (this._stopped) {
      return Promise.resolve(OnboardingOutcome.Aborted);
    }
    const queued = this._queue.find((entry) => entry.scenario.id === scenario.id);
    if (queued) {
      return queued.deferred.p;
    }
    const inflight = this._inflight.get(scenario.id);
    if (inflight) {
      return inflight.p;
    }
    const deferred = new DeferredPromise();
    this._pending.add(scenario.id);
    this._queue.push({ scenario, deferred });
    this._queue.sort((a, b) => (b.scenario.priority ?? 0) - (a.scenario.priority ?? 0));
    this._pump();
    return deferred.p;
  }
  _pump() {
    if (this._pumping) {
      return;
    }
    this._pumping = true;
    this._doPump();
  }
  async _doPump() {
    await Promise.resolve();
    try {
      let entry;
      while (!this._stopped && (entry = this._queue.shift())) {
        const { scenario, deferred } = entry;
        this._inflight.set(scenario.id, deferred);
        let outcome;
        try {
          outcome = await this._runPresentation(scenario);
        } catch (error) {
          onUnexpectedError(error);
          outcome = OnboardingOutcome.Aborted;
        } finally {
          this._inflight.delete(scenario.id);
          this._pending.delete(scenario.id);
        }
        deferred.complete(outcome);
      }
    } finally {
      this._pumping = false;
    }
  }
  async _runPresentation(scenario) {
    const presentation = onboardingPresentationRegistry.get(scenario.presentation.kind);
    if (!presentation) {
      return OnboardingOutcome.Aborted;
    }
    this._markShown(this._seenKey(scenario));
    const abort = new Emitter();
    this._activeAbort = abort;
    const startTime = Date.now();
    let didReportShown = false;
    try {
      const result = await presentation.run(scenario, {
        targetWindow: mainWindow,
        onAbort: abort.event,
        onDidShow: () => {
          if (!didReportShown) {
            didReportShown = true;
            this._reportShown(scenario);
          }
        }
      });
      this._recordOutcome(this._seenKey(scenario), result.outcome);
      if (result.shown) {
        this._reportOutcome(scenario, result, Date.now() - startTime);
      }
      return result.outcome;
    } finally {
      this._activeAbort = void 0;
      abort.dispose();
    }
  }
  /** Emit an impression when a presentation has rendered visible onboarding UI. */
  _reportShown(scenario) {
    const experimentState = scenario.experiment ? this._experimentStates.get(scenario.id) : void 0;
    this.telemetryService.publicLog2("onboarding.scenarioShown", {
      scenarioId: scenario.id,
      experimentActive: experimentState?.active === true,
      experimentAssignmentContextId: experimentState?.active ? experimentState.assignmentContextId : void 0
    });
  }
  /** Emit per-tour telemetry. Only called when a tour was actually shown. */
  _reportOutcome(scenario, result, durationMs) {
    const experimentActive = !!scenario.experiment && this._experimentStates.get(scenario.id)?.active === true;
    this.telemetryService.publicLog2("onboarding.scenarioOutcome", {
      scenarioId: scenario.id,
      outcome: result.outcome,
      dismissReason: result.dismissReason,
      lastStepIndex: result.lastStepIndex,
      stepCount: result.stepCount,
      durationMs,
      experimentActive
    });
  }
  //#endregion
  //#region Triggers & experiments
  _registerTriggerListeners() {
    this._triggerListeners.clear();
    for (const scenario of onboardingScenarioRegistry.getScenarios()) {
      if (scenario.trigger.kind === "observable") {
        const signal = scenario.trigger.signal;
        this._triggerListeners.add(autorun((reader) => {
          signal.read(reader);
          this._evaluate();
        }));
      }
    }
  }
  /**
   * Resolve the two experiment treatment flags for each scenario that declares an experiment.
   * The experiment is only active when both resolve: the boolean to a boolean and the id to a
   * non-empty string that starts with {@link ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX}. Resolved
   * once per scenario; re-evaluation is triggered when an experiment becomes active.
   */
  _resolveExperiments() {
    for (const scenario of onboardingScenarioRegistry.getScenarios()) {
      const experiment = scenario.experiment;
      if (!experiment || this._experimentStates.has(scenario.id)) {
        continue;
      }
      this._experimentStates.set(scenario.id, { active: false, behavior: false, assignmentContextId: "" });
      Promise.all([
        this.assignmentService.getTreatment(experiment.behaviorFlag),
        this.assignmentService.getTreatment(experiment.assignmentContextIdFlag)
      ]).then(([behavior, assignmentContextId]) => {
        const hasBehavior = typeof behavior === "boolean";
        const hasId = typeof assignmentContextId === "string" && assignmentContextId.length > 0;
        const hasValidId = hasId && assignmentContextId.startsWith(ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX);
        if (hasId && !hasValidId) {
          onUnexpectedError(new Error(`Onboarding experiment for scenario '${scenario.id}' resolved an assignment-context id '${assignmentContextId}' that does not start with the required '${ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX}' prefix; treating the experiment as inactive.`));
        }
        const active = hasBehavior && hasValidId;
        this._experimentStates.set(scenario.id, {
          active,
          behavior: behavior === true,
          assignmentContextId: active ? assignmentContextId : ""
        });
        if (active) {
          this._evaluate();
        }
      }, (error) => onUnexpectedError(error));
    }
  }
  //#endregion
  //#region Telemetry gate
  _loadOpenedIds() {
    const raw = this.storageService.get(OnboardingScenarioService.OPENED_IDS_STORAGE_KEY, StorageScope.APPLICATION);
    if (!raw) {
      return /* @__PURE__ */ new Set();
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed.filter((id) => typeof id === "string")) : /* @__PURE__ */ new Set();
    } catch (error) {
      onUnexpectedError(error);
      return /* @__PURE__ */ new Set();
    }
  }
  /**
   * Open the telemetry gate for an assignment-context id: from now on (and after reload) the
   * id is no longer filtered out, so every event carries it. Idempotent.
   */
  _openGate(assignmentContextId) {
    if (!assignmentContextId || this._openedAssignmentContextIds.has(assignmentContextId)) {
      return;
    }
    this._openedAssignmentContextIds.add(assignmentContextId);
    this.storageService.store(
      OnboardingScenarioService.OPENED_IDS_STORAGE_KEY,
      JSON.stringify(Array.from(this._openedAssignmentContextIds)),
      StorageScope.APPLICATION,
      StorageTarget.MACHINE
    );
    this._onDidChangeOpenedIds.fire();
  }
  //#endregion
  //#region Persistence
  /**
   * The key under which a scenario's once-per-user "shown" state is stored.
   * Scenarios may opt into a shared {@link IOnboardingScenario.seenKey} so that
   * variations of the same onboarding are gated together; otherwise the
   * scenario id is used.
   */
  _seenKey(scenario) {
    return scenario.seenKey ?? scenario.id;
  }
  _hasBeenShownKey(key, scenarioId) {
    if (this._isDeveloperMode(scenarioId)) {
      return this._shownSinceStart.has(key);
    }
    return !!this._state[key]?.shownAt;
  }
  _markShown(id) {
    this._shownSinceStart.add(id);
    const previous = this._state[id];
    const next = {
      shownAt: Date.now(),
      outcome: previous?.outcome,
      seenCount: (previous?.seenCount ?? 0) + 1
    };
    this._state[id] = next;
    this._memento.saveMemento();
  }
  _recordOutcome(id, outcome) {
    const state = this._state[id];
    if (state) {
      state.outcome = outcome;
      this._memento.saveMemento();
    }
  }
  //#endregion
};
OnboardingScenarioService.MEMENTO_ID = "onboarding";
/**
 * Storage key for the set of assignment-context identifiers whose telemetry gate has been
 * opened (the user reached the onboarding moment). Persisted so the identifier keeps
 * flowing across reloads/relaunches until the experiment is stopped.
 */
OnboardingScenarioService.OPENED_IDS_STORAGE_KEY = "onboarding.openedAssignmentContextIds";
OnboardingScenarioService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, ILifecycleService),
  __decorateParam(4, IWorkbenchAssignmentService),
  __decorateParam(5, ITelemetryService)
], OnboardingScenarioService);
function getAssignmentContextVariant(assignment) {
  const separatorIndex = assignment.lastIndexOf(":");
  return separatorIndex === -1 ? assignment : assignment.slice(0, separatorIndex);
}
export {
  OnboardingScenarioService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG9uYm9hcmRpbmdcXGJyb3dzZXJcXG9uYm9hcmRpbmdTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hc3NpZ25tZW50L2NvbW1vbi9hc3NpZ25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBNZW1lbnRvIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21lbWVudG8uanMnO1xuaW1wb3J0IHsgb25ib2FyZGluZ1ByZXNlbnRhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vY29tbW9uL29uYm9hcmRpbmdQcmVzZW50YXRpb24uanMnO1xuaW1wb3J0IHsgb25ib2FyZGluZ1NjZW5hcmlvUmVnaXN0cnkgfSBmcm9tICcuLi9jb21tb24vb25ib2FyZGluZ1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElPbmJvYXJkaW5nUnVuUmVzdWx0LCBJT25ib2FyZGluZ1NjZW5hcmlvLCBPTkJPQVJESU5HX0FTU0lHTk1FTlRfQ09OVEVYVF9QUkVGSVgsIE9uYm9hcmRpbmdPdXRjb21lIH0gZnJvbSAnLi4vY29tbW9uL29uYm9hcmRpbmdTY2VuYXJpby5qcyc7XG5pbXBvcnQgeyBpc09uYm9hcmRpbmdEZXZlbG9wZXJNb2RlRW5hYmxlZCwgSU9uYm9hcmRpbmdTY2VuYXJpb1NlcnZpY2UsIE9OQk9BUkRJTkdfREVWRUxPUEVSX01PREVfQ09ORklHLCBPTkJPQVJESU5HX0VOQUJMRURfQ09ORklHIH0gZnJvbSAnLi4vY29tbW9uL29uYm9hcmRpbmdTY2VuYXJpb1NlcnZpY2UuanMnO1xuXG4vKiogUGVyc2lzdGVkIFwic2hvd25cIiBzdGF0ZSBmb3IgYSBzaW5nbGUgc2NlbmFyaW8uICovXG5pbnRlcmZhY2UgSVNjZW5hcmlvU3RhdGUge1xuXHRyZWFkb25seSBzaG93bkF0OiBudW1iZXI7XG5cdG91dGNvbWU/OiBPbmJvYXJkaW5nT3V0Y29tZTtcblx0c2VlbkNvdW50OiBudW1iZXI7XG59XG5cbnR5cGUgT25ib2FyZGluZ01lbWVudG9EYXRhID0geyBbc2NlbmFyaW9JZDogc3RyaW5nXTogSVNjZW5hcmlvU3RhdGUgfTtcblxuLyoqIFJlc29sdmVkIGV4cGVyaW1lbnQgdHJlYXRtZW50IHN0YXRlIGZvciBhIHNjZW5hcmlvIHRoYXQgZGVjbGFyZXMgYW4gZXhwZXJpbWVudC4gKi9cbmludGVyZmFjZSBJRXhwZXJpbWVudFN0YXRlIHtcblx0LyoqIEJvdGggdHJlYXRtZW50IGZsYWdzIHJlc29sdmVkICh0aGUgZXhwZXJpbWVudCBpcyBjb25maWd1cmVkIGZvciB0aGlzIHVzZXIpLiAqL1xuXHRyZWFkb25seSBhY3RpdmU6IGJvb2xlYW47XG5cdC8qKiBWYWx1ZSBvZiB0aGUgYm9vbGVhbiBiZWhhdmlvciBmbGFnOiBgdHJ1ZWAgc2hvd3MgdGhlIHRvdXIgKHRyZWF0bWVudCksIGBmYWxzZWAgaXMgY29udHJvbC4gKi9cblx0cmVhZG9ubHkgYmVoYXZpb3I6IGJvb2xlYW47XG5cdC8qKiBWYWx1ZSBvZiB0aGUgYXNzaWdubWVudC1jb250ZXh0IGlkIGZsYWcgKHRoZSBpZCB0aGUgc2NvcmVjYXJkIGtleXMgb24pLiAqL1xuXHRyZWFkb25seSBhc3NpZ25tZW50Q29udGV4dElkOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBPbmJvYXJkaW5nU2NlbmFyaW9TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElPbmJvYXJkaW5nU2NlbmFyaW9TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNRU1FTlRPX0lEID0gJ29uYm9hcmRpbmcnO1xuXG5cdC8qKlxuXHQgKiBTdG9yYWdlIGtleSBmb3IgdGhlIHNldCBvZiBhc3NpZ25tZW50LWNvbnRleHQgaWRlbnRpZmllcnMgd2hvc2UgdGVsZW1ldHJ5IGdhdGUgaGFzIGJlZW5cblx0ICogb3BlbmVkICh0aGUgdXNlciByZWFjaGVkIHRoZSBvbmJvYXJkaW5nIG1vbWVudCkuIFBlcnNpc3RlZCBzbyB0aGUgaWRlbnRpZmllciBrZWVwc1xuXHQgKiBmbG93aW5nIGFjcm9zcyByZWxvYWRzL3JlbGF1bmNoZXMgdW50aWwgdGhlIGV4cGVyaW1lbnQgaXMgc3RvcHBlZC5cblx0ICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE9QRU5FRF9JRFNfU1RPUkFHRV9LRVkgPSAnb25ib2FyZGluZy5vcGVuZWRBc3NpZ25tZW50Q29udGV4dElkcyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbWVtZW50bzogTWVtZW50bzxPbmJvYXJkaW5nTWVtZW50b0RhdGE+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZTogUGFydGlhbDxPbmJvYXJkaW5nTWVtZW50b0RhdGE+O1xuXG5cdC8qKiBMaXN0ZW5lcnMgZm9yIGBvYnNlcnZhYmxlYCB0cmlnZ2VycywgcmVidWlsdCB3aGVuZXZlciB0aGUgcmVnaXN0cnkgY2hhbmdlcy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfdHJpZ2dlckxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0LyoqIFNjZW5hcmlvIGlkcyBjdXJyZW50bHkgcXVldWVkIG9yIHJ1bm5pbmcgKHByZXZlbnRzIGRvdWJsZS1zY2hlZHVsaW5nKS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9xdWV1ZTogeyBzY2VuYXJpbzogSU9uYm9hcmRpbmdTY2VuYXJpbzsgZGVmZXJyZWQ6IERlZmVycmVkUHJvbWlzZTxPbmJvYXJkaW5nT3V0Y29tZT4gfVtdID0gW107XG5cdC8qKiBEZWZlcnJlZHMgZm9yIHNjZW5hcmlvcyB0aGF0IGhhdmUgYmVlbiBkZXF1ZXVlZCBhbmQgYXJlIGN1cnJlbnRseSBydW5uaW5nLCBrZXllZCBieSBpZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfaW5mbGlnaHQgPSBuZXcgTWFwPHN0cmluZywgRGVmZXJyZWRQcm9taXNlPE9uYm9hcmRpbmdPdXRjb21lPj4oKTtcblx0cHJpdmF0ZSBfcHVtcGluZyA9IGZhbHNlO1xuXG5cdC8qKiBBYm9ydCBzaWduYWwgZm9yIHRoZSBzY2VuYXJpbyBjdXJyZW50bHkgcnVubmluZy4gKi9cblx0cHJpdmF0ZSBfYWN0aXZlQWJvcnQ6IEVtaXR0ZXI8dm9pZD4gfCB1bmRlZmluZWQ7XG5cblx0LyoqIFJlc29sdmVkIGV4cGVyaW1lbnQgdHJlYXRtZW50IHN0YXRlLCBrZXllZCBieSBzY2VuYXJpbyBpZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZXhwZXJpbWVudFN0YXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBJRXhwZXJpbWVudFN0YXRlPigpO1xuXG5cdC8qKlxuXHQgKiBBc3NpZ25tZW50LWNvbnRleHQgaWRzIHdob3NlIHRlbGVtZXRyeSBnYXRlIGlzIG9wZW4uIFdoaWxlIGFuIG9uYm9hcmRpbmcgaWQgaXMgKm5vdCogaW5cblx0ICogdGhpcyBzZXQsIHRoZSBlYWdlcmx5LXJlZ2lzdGVyZWQgZmlsdGVyIGV4Y2x1ZGVzIGl0IGZyb20gdGVsZW1ldHJ5IChzZWUgdGhlIHByZWZpeFxuXHQgKiBjb25zdGFudCkuIFRoZSBzZXQgaXMgc2VlZGVkIGZyb20gc3RvcmFnZSBhbmQgZ3Jvd3MgYXMgdXNlcnMgcmVhY2ggdGhlIG9uYm9hcmRpbmcgbW9tZW50LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfb3BlbmVkQXNzaWdubWVudENvbnRleHRJZHM6IFNldDxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU9wZW5lZElkcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXG5cdHByaXZhdGUgX3N0YXJ0ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfc3RvcHBlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaG93blNpbmNlU3RhcnQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXNzaWdubWVudFNlcnZpY2U6IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX21lbWVudG8gPSBuZXcgTWVtZW50byhPbmJvYXJkaW5nU2NlbmFyaW9TZXJ2aWNlLk1FTUVOVE9fSUQsIHRoaXMuc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHRoaXMuX3N0YXRlID0gdGhpcy5fbWVtZW50by5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdHRoaXMuX29wZW5lZEFzc2lnbm1lbnRDb250ZXh0SWRzID0gdGhpcy5fbG9hZE9wZW5lZElkcygpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIHRlbGVtZXRyeSBnYXRlIGZpbHRlciBlYWdlcmx5IChpbiB0aGUgY29uc3RydWN0b3IpIHNvIG9uYm9hcmRpbmdcblx0XHQvLyBhc3NpZ25tZW50LWNvbnRleHQgaWRzIGFyZSBleGNsdWRlZCBmcm9tIHRoZSB2ZXJ5IGZpcnN0IGV2ZW50IFx1MjAxNCBiZWZvcmUgdGhlIHRyZWF0bWVudFxuXHRcdC8vIGZsYWdzIHJlc29sdmUuIFRoZSBmaWx0ZXIgYmxvY2tzIGFueSBpZCB3aXRoIHRoZSByZXNlcnZlZCBvbmJvYXJkaW5nIHByZWZpeCB1bmxlc3MgaXRzXG5cdFx0Ly8gZ2F0ZSBoYXMgYWxyZWFkeSBiZWVuIG9wZW5lZCAodGhpcyBzZXNzaW9uIG9yIHBlcnNpc3RlZCBmcm9tIGEgcHJldmlvdXMgb25lKS5cblx0XHR0aGlzLmFzc2lnbm1lbnRTZXJ2aWNlLmFkZFRlbGVtZXRyeUFzc2lnbm1lbnRGaWx0ZXIoe1xuXHRcdFx0aWQ6ICdvbmJvYXJkaW5nJyxcblx0XHRcdGV4Y2x1ZGU6IGFzc2lnbm1lbnQgPT4ge1xuXHRcdFx0XHRjb25zdCB2YXJpYW50ID0gZ2V0QXNzaWdubWVudENvbnRleHRWYXJpYW50KGFzc2lnbm1lbnQpO1xuXHRcdFx0XHRyZXR1cm4gdmFyaWFudC5zdGFydHNXaXRoKE9OQk9BUkRJTkdfQVNTSUdOTUVOVF9DT05URVhUX1BSRUZJWCkgJiYgIXRoaXMuX29wZW5lZEFzc2lnbm1lbnRDb250ZXh0SWRzLmhhcyh2YXJpYW50KTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZTogdGhpcy5fb25EaWRDaGFuZ2VPcGVuZWRJZHMuZXZlbnRcblx0XHR9KTtcblxuXHRcdC8vIE9uIHNodXRkb3duIGFib3J0IHRoZSBhY3RpdmUgcnVuIGFuZCBkcmFpbiBhbnl0aGluZyBzdGlsbCBxdWV1ZWQgc28gbm9cblx0XHQvLyBmcmVzaCBvdmVybGF5IGlzIG1vdW50ZWQgd2hpbGUgdGhlIHdpbmRvdyBpcyBnb2luZyBhd2F5LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlmZWN5Y2xlU2VydmljZS5vbldpbGxTaHV0ZG93bigoKSA9PiB0aGlzLl9zdG9wKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgX3N0b3AoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RvcHBlZCA9IHRydWU7XG5cdFx0dGhpcy5fYWN0aXZlQWJvcnQ/LmZpcmUoKTtcblxuXHRcdGxldCBlbnRyeTogeyBzY2VuYXJpbzogSU9uYm9hcmRpbmdTY2VuYXJpbzsgZGVmZXJyZWQ6IERlZmVycmVkUHJvbWlzZTxPbmJvYXJkaW5nT3V0Y29tZT4gfSB8IHVuZGVmaW5lZDtcblx0XHR3aGlsZSAoKGVudHJ5ID0gdGhpcy5fcXVldWUuc2hpZnQoKSkpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmcuZGVsZXRlKGVudHJ5LnNjZW5hcmlvLmlkKTtcblx0XHRcdGVudHJ5LmRlZmVycmVkLmNvbXBsZXRlKE9uYm9hcmRpbmdPdXRjb21lLkFib3J0ZWQpO1xuXHRcdH1cblx0fVxuXG5cdHN0YXJ0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGFydGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N0YXJ0ZWQgPSB0cnVlO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIob25ib2FyZGluZ1NjZW5hcmlvUmVnaXN0cnkub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXJUcmlnZ2VyTGlzdGVuZXJzKCk7XG5cdFx0XHR0aGlzLl9yZXNvbHZlRXhwZXJpbWVudHMoKTtcblx0XHRcdHRoaXMuX2V2YWx1YXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoKCkgPT4gdGhpcy5fZXZhbHVhdGUoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihPTkJPQVJESU5HX0VOQUJMRURfQ09ORklHKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE9OQk9BUkRJTkdfREVWRUxPUEVSX01PREVfQ09ORklHKSkge1xuXHRcdFx0XHR0aGlzLl9ldmFsdWF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyVHJpZ2dlckxpc3RlbmVycygpO1xuXHRcdHRoaXMuX3Jlc29sdmVFeHBlcmltZW50cygpO1xuXHRcdHRoaXMuX2V2YWx1YXRlKCk7XG5cdH1cblxuXHRnZXRTY2VuYXJpb3MoKTogcmVhZG9ubHkgSU9uYm9hcmRpbmdTY2VuYXJpb1tdIHtcblx0XHRyZXR1cm4gb25ib2FyZGluZ1NjZW5hcmlvUmVnaXN0cnkuZ2V0U2NlbmFyaW9zKCk7XG5cdH1cblxuXHRhc3luYyBydW5TY2VuYXJpbyhpZDogc3RyaW5nKTogUHJvbWlzZTxPbmJvYXJkaW5nT3V0Y29tZT4ge1xuXHRcdGNvbnN0IHNjZW5hcmlvID0gb25ib2FyZGluZ1NjZW5hcmlvUmVnaXN0cnkuZ2V0U2NlbmFyaW8oaWQpO1xuXHRcdGlmICghc2NlbmFyaW8pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBvbmJvYXJkaW5nIHNjZW5hcmlvICcke2lkfScuYCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9lbnF1ZXVlKHNjZW5hcmlvKTtcblx0fVxuXG5cdGhhc0JlZW5TaG93bihpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2NlbmFyaW8gPSBvbmJvYXJkaW5nU2NlbmFyaW9SZWdpc3RyeS5nZXRTY2VuYXJpbyhpZCk7XG5cdFx0cmV0dXJuIHRoaXMuX2hhc0JlZW5TaG93bktleShzY2VuYXJpbyA/IHRoaXMuX3NlZW5LZXkoc2NlbmFyaW8pIDogaWQsIGlkKTtcblx0fVxuXG5cdHJlc2V0KGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzY2VuYXJpbyA9IG9uYm9hcmRpbmdTY2VuYXJpb1JlZ2lzdHJ5LmdldFNjZW5hcmlvKGlkKTtcblx0XHRkZWxldGUgdGhpcy5fc3RhdGVbc2NlbmFyaW8gPyB0aGlzLl9zZWVuS2V5KHNjZW5hcmlvKSA6IGlkXTtcblx0XHR0aGlzLl9tZW1lbnRvLnNhdmVNZW1lbnRvKCk7XG5cdH1cblxuXHRyZXNldEFsbCgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyh0aGlzLl9zdGF0ZSkpIHtcblx0XHRcdGRlbGV0ZSB0aGlzLl9zdGF0ZVtrZXldO1xuXHRcdH1cblx0XHR0aGlzLl9tZW1lbnRvLnNhdmVNZW1lbnRvKCk7XG5cdH1cblxuXHQvLyNyZWdpb24gRWxpZ2liaWxpdHkgJiBzY2hlZHVsaW5nXG5cblx0LyoqXG5cdCAqIFRoZSBtYXN0ZXIgc3dpdGNoIGZvciAqYXV0b21hdGljKiBvbmJvYXJkaW5nLiBXaGVuIGBvbmJvYXJkaW5nLmVuYWJsZWRgIGlzXG5cdCAqIGV4cGxpY2l0bHkgYGZhbHNlYCwgbm8gc2NlbmFyaW8gZXZlciBydW5zIGF1dG9tYXRpY2FsbHkgKGRldmVsb3BlciBtb2RlIGRvZXNcblx0ICogTk9UIG92ZXJyaWRlIHRoaXMgXHUyMDE0IHNlZSB7QGxpbmsgX2V2YWx1YXRlfSkuIEFueSBvdGhlciB2YWx1ZSAoaW5jbHVkaW5nIHVuc2V0KVxuXHQgKiBpcyB0cmVhdGVkIGFzIGVuYWJsZWQuIE9uLWRlbWFuZCB7QGxpbmsgcnVuU2NlbmFyaW99IGlzIGludGVudGlvbmFsbHkgZXhlbXB0XG5cdCAqIGZyb20gdGhpcyBzd2l0Y2guXG5cdCAqL1xuXHRwcml2YXRlIGdldCBfZW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihPTkJPQVJESU5HX0VOQUJMRURfQ09ORklHKSAhPT0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9pc0RldmVsb3Blck1vZGUoc2NlbmFyaW9JZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzT25ib2FyZGluZ0RldmVsb3Blck1vZGVFbmFibGVkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHNjZW5hcmlvSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLWV2YWx1YXRlIGV2ZXJ5IHNjZW5hcmlvIGFuZCBlbnF1ZXVlIGFueSB0aGF0IGFyZSBlbGlnaWJsZSB0byBydW5cblx0ICogYXV0b21hdGljYWxseS4gSWRlbXBvdGVudDogYWxyZWFkeSBzaG93biAvIHF1ZXVlZCBzY2VuYXJpb3MgYXJlIHNraXBwZWQuXG5cdCAqXG5cdCAqIFRoZSBhdXRvbWF0aWMgZWxpZ2liaWxpdHkgcnVsZXMgYXJlOlxuXHQgKiAxLiBJZiBgb25ib2FyZGluZy5lbmFibGVkYCBpcyBgZmFsc2VgLCBub3RoaW5nIHJ1bnMgYXV0b21hdGljYWxseSBcdTIwMTQgdGhpc1xuXHQgKiAgICBtZXRob2QgcmV0dXJucyBpbW1lZGlhdGVseSwgYW5kIGRldmVsb3BlciBtb2RlIGRvZXMgTk9UIG92ZXJyaWRlIGl0LlxuXHQgKiAyLiBJZiBhIHNjZW5hcmlvIGRlY2xhcmVzIGFuIGBleHBlcmltZW50YCwgaXQgb25seSBydW5zIHdoZW4gdGhlIGV4cGVyaW1lbnRcblx0ICogICAgaXMgYWN0aXZlIEFORCB0aGUgdXNlciBpcyBpbiB0aGUgdHJlYXRtZW50IGFybSAoc2VlIGJlbG93KSBcdTIwMTQgT1Igd2hlblxuXHQgKiAgICBkZXZlbG9wZXIgbW9kZSBpcyBlbmFibGVkIGZvciB0aGF0IHNjZW5hcmlvLCB3aGljaCBieXBhc3NlcyB0aGUgZXhwZXJpbWVudFxuXHQgKiAgICBnYXRlIHNvIHRoZSB0b3VyIGNhbiBiZSBwcmV2aWV3ZWQgbG9jYWxseS5cblx0ICogMy4gSWYgYSBzY2VuYXJpbyBoYXMgbm8gYGV4cGVyaW1lbnRgLCBpdCBydW5zIGZvciBldmVyeSB1c2VyIHRoYXQgbWVldHMgaXRzXG5cdCAqICAgIGB3aGVuYC90cmlnZ2VyIGNyaXRlcmlhICh0aGUgdHlwaWNhbCBzdGF0ZSBvbmNlIGFuIGV4cGVyaW1lbnQgaGFzIGdyYWR1YXRlZFxuXHQgKiAgICBhbmQgdGhlIHRvdXIgaXMgcm9sbGVkIG91dCB0byBldmVyeW9uZSkuXG5cdCAqXG5cdCAqIEZvciBhbiBleHBlcmltZW50LWFjdGl2ZSBzY2VuYXJpbywgcmVhY2hpbmcgZWxpZ2liaWxpdHkgKmlzKiB0aGUgXCJ3b3VsZC1zaG93XCJcblx0ICogbW9tZW50OiB0aGUgdGVsZW1ldHJ5IGdhdGUgaXMgb3BlbmVkIGZvciB0aGUgZXhwZXJpbWVudCdzIGFzc2lnbm1lbnQtY29udGV4dCBpZFxuXHQgKiAoaW4gYm90aCBhcm1zKSwgYW5kIHRoZW4gb25seSB0aGUgdHJlYXRtZW50IGFybSBpcyBlbnF1ZXVlZCB0byBhY3R1YWxseSBzaG93IHRoZVxuXHQgKiB0b3VyLiBDb250cm9sIG9wZW5zIHRoZSBnYXRlIGJ1dCByZW5kZXJzIG5vdGhpbmcgYW5kIGlzIG5vdCBtYXJrZWQgYXMgc2hvd24uXG5cdCAqXG5cdCAqIERldmVsb3BlciBtb2RlIGlzIHRoZSBleGNlcHRpb246IGl0IHNob3dzIHRoZSB0b3VyIHVuY29uZGl0aW9uYWxseSBhbmQgbmV2ZXJcblx0ICogb3BlbnMgdGhlIHRlbGVtZXRyeSBnYXRlLCBzbyBhIGxvY2FsIHByZXZpZXcgY2FuIG5ldmVyIGFmZmVjdCB0aGUgZXhwZXJpbWVudFxuXHQgKiBzY29yZWNhcmQgcmVnYXJkbGVzcyBvZiB3aGljaCBhcm0gdGhlIGRldmVsb3BlciBoYXBwZW5zIHRvIGJlIGFzc2lnbmVkIHRvLlxuXHQgKi9cblx0cHJpdmF0ZSBfZXZhbHVhdGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lbmFibGVkIHx8IHRoaXMuX3N0b3BwZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTZWVuIGtleXMgYWxyZWFkeSBjbGFpbWVkIGJ5IGEgcGVuZGluZy9xdWV1ZWQvcnVubmluZyBub24tcmVwZWF0YWJsZVxuXHRcdC8vIHNjZW5hcmlvLiBTY2VuYXJpb3MgdGhhdCBzaGFyZSBhIGBzZWVuS2V5YCBhcmUgZ2F0ZWQgdG9nZXRoZXIsIHNvIG9uY2Vcblx0XHQvLyBvbmUgc2libGluZyBpcyBzY2hlZHVsZWQgd2UgbXVzdCBub3QgYWxzbyBzY2hlZHVsZSBhbm90aGVyIGluIHRoZSBzYW1lXG5cdFx0Ly8gcGFzczogc2hvd24gc3RhdGUgaXMgb25seSB3cml0dGVuIHdoZW4gYSBzY2VuYXJpbyBzdGFydHMgcnVubmluZywgYWZ0ZXJcblx0XHQvLyB0aGUgcXVldWUgaGFzIGJlZW4gcG9wdWxhdGVkLCBzbyB0aGUgc2hhcmVkLWtleSBjaGVjayBpblxuXHRcdC8vIGBfaXNBdXRvRWxpZ2libGVgIGNhbm5vdCBzZWUgdGhlIHNpYmxpbmcgeWV0LlxuXHRcdGNvbnN0IGNsYWltZWRTZWVuS2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3Qgc2NlbmFyaW8gb2Ygb25ib2FyZGluZ1NjZW5hcmlvUmVnaXN0cnkuZ2V0U2NlbmFyaW9zKCkpIHtcblx0XHRcdGlmICghc2NlbmFyaW8ucmVwZWF0YWJsZSAmJiB0aGlzLl9wZW5kaW5nLmhhcyhzY2VuYXJpby5pZCkpIHtcblx0XHRcdFx0Y2xhaW1lZFNlZW5LZXlzLmFkZCh0aGlzLl9zZWVuS2V5KHNjZW5hcmlvKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWxpZ2libGVTY2VuYXJpb3MgPSBvbmJvYXJkaW5nU2NlbmFyaW9SZWdpc3RyeS5nZXRTY2VuYXJpb3MoKVxuXHRcdFx0Lm1hcCgoc2NlbmFyaW8sIHJlZ2lzdHJhdGlvbkluZGV4KSA9PiAoeyBzY2VuYXJpbywgcmVnaXN0cmF0aW9uSW5kZXggfSkpXG5cdFx0XHQuZmlsdGVyKCh7IHNjZW5hcmlvIH0pID0+IHRoaXMuX2lzQXV0b0VsaWdpYmxlKHNjZW5hcmlvKSlcblx0XHRcdC5zb3J0KChhLCBiKSA9PiAoYi5zY2VuYXJpby5wcmlvcml0eSA/PyAwKSAtIChhLnNjZW5hcmlvLnByaW9yaXR5ID8/IDApIHx8IGEucmVnaXN0cmF0aW9uSW5kZXggLSBiLnJlZ2lzdHJhdGlvbkluZGV4KTtcblxuXHRcdGZvciAoY29uc3QgeyBzY2VuYXJpbyB9IG9mIGVsaWdpYmxlU2NlbmFyaW9zKSB7XG5cdFx0XHRjb25zdCBzZWVuS2V5ID0gdGhpcy5fc2VlbktleShzY2VuYXJpbyk7XG5cdFx0XHRpZiAoIXNjZW5hcmlvLnJlcGVhdGFibGUgJiYgY2xhaW1lZFNlZW5LZXlzLmhhcyhzZWVuS2V5KSkge1xuXHRcdFx0XHQvLyBBIHNpYmxpbmcgc2hhcmluZyB0aGlzIHNlZW4ga2V5IGlzIGFscmVhZHkgc2NoZWR1bGVkIHRoaXMgcGFzcztcblx0XHRcdFx0Ly8gc2hvd2luZyBpdCB3aWxsIG1hcmsgdGhpcyBzY2VuYXJpbyBzZWVuIHRvby5cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGV4cGVyaW1lbnQgPSBzY2VuYXJpby5leHBlcmltZW50ID8gdGhpcy5fZXhwZXJpbWVudFN0YXRlcy5nZXQoc2NlbmFyaW8uaWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGV4cGVyaW1lbnQ/LmFjdGl2ZSAmJiAhdGhpcy5faXNEZXZlbG9wZXJNb2RlKHNjZW5hcmlvLmlkKSkge1xuXHRcdFx0XHQvLyBXb3VsZC1zaG93IHJlYWNoZWQ6IHN0YXJ0IGVtaXR0aW5nIHRoZSBhc3NpZ25tZW50LWNvbnRleHQgaWQgZnJvbSBub3cgb24uXG5cdFx0XHRcdC8vIFNraXBwZWQgZW50aXJlbHkgaW4gZGV2ZWxvcGVyIG1vZGUgc28gYSBsb2NhbCBwcmV2aWV3IG5ldmVyIG9wZW5zIHRoZVxuXHRcdFx0XHQvLyB0ZWxlbWV0cnkgZ2F0ZSBhbmQgbmV2ZXIgYWZmZWN0cyB0aGUgZXhwZXJpbWVudCBzY29yZWNhcmQgKHRoZSB0b3VyIGlzXG5cdFx0XHRcdC8vIHNob3duIHVuY29uZGl0aW9uYWxseSBiZWxvdyBpbnN0ZWFkKS5cblx0XHRcdFx0dGhpcy5fb3BlbkdhdGUoZXhwZXJpbWVudC5hc3NpZ25tZW50Q29udGV4dElkKTtcblx0XHRcdFx0aWYgKCFleHBlcmltZW50LmJlaGF2aW9yKSB7XG5cdFx0XHRcdFx0Ly8gQ29udHJvbCBhcm06IHRoZSBpZGVudGlmaWVyIG5vdyBmbG93cywgYnV0IG5vIHRvdXIgaXMgc2hvd24gYW5kIHRoZVxuXHRcdFx0XHRcdC8vIHNjZW5hcmlvIGlzIGxlZnQgdW4tc2hvd24gc28gdGhlIHVzZXIgc3RheXMgZWxpZ2libGUgdG8gc2VlIGl0IGxhdGVyLlxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2VucXVldWUoc2NlbmFyaW8pO1xuXHRcdFx0aWYgKCFzY2VuYXJpby5yZXBlYXRhYmxlKSB7XG5cdFx0XHRcdGNsYWltZWRTZWVuS2V5cy5hZGQoc2VlbktleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaXNBdXRvRWxpZ2libGUoc2NlbmFyaW86IElPbmJvYXJkaW5nU2NlbmFyaW8pOiBib29sZWFuIHtcblx0XHQvLyBgY29tbWFuZGAgdHJpZ2dlcnMgbmV2ZXIgcnVuIGF1dG9tYXRpY2FsbHkuXG5cdFx0aWYgKHNjZW5hcmlvLnRyaWdnZXIua2luZCA9PT0gJ2NvbW1hbmQnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3BlbmRpbmcuaGFzKHNjZW5hcmlvLmlkKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghc2NlbmFyaW8ucmVwZWF0YWJsZSAmJiB0aGlzLl9oYXNCZWVuU2hvd25LZXkodGhpcy5fc2VlbktleShzY2VuYXJpbyksIHNjZW5hcmlvLmlkKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChzY2VuYXJpby53aGVuICYmICF0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoc2NlbmFyaW8ud2hlbikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBFeHBlcmltZW50LWRyaXZlbiBzY2VuYXJpb3Mgb25seSBydW4gb25jZSB0aGUgZXhwZXJpbWVudCBpcyBhY3RpdmUgKGJvdGggdHJlYXRtZW50XG5cdFx0Ly8gZmxhZ3MgcmVzb2x2ZWQpLiBUaGUgYmVoYXZpb3IgZmxhZyBkb2VzIE5PVCBnYXRlIGVsaWdpYmlsaXR5IFx1MjAxNCBjb250cm9sIHN0aWxsIHJlYWNoZXNcblx0XHQvLyB0aGUgd291bGQtc2hvdyBtb21lbnQgc28gdGhlIGdhdGUgb3BlbnMgZm9yIGl0IHRvby5cblx0XHQvL1xuXHRcdC8vIERldmVsb3BlciBtb2RlIGZvciB0aGlzIHNjZW5hcmlvIGJ5cGFzc2VzIHRoZSBleHBlcmltZW50IGdhdGUgZW50aXJlbHkgc28gdGhlIHRvdXJcblx0XHQvLyBjYW4gYmUgdGVzdGVkIGxvY2FsbHkgd2l0aG91dCB0aGUgZXhwZXJpbWVudCBydW5uaW5nIChvciBiZWluZyBhc3NpZ25lZCB0byB0aGVcblx0XHQvLyB1c2VyKS4gQSBkZXZlbG9wZXItbW9kZSBwcmV2aWV3IG5ldmVyIG9wZW5zIHRoZSBhc3NpZ25tZW50LWNvbnRleHQgZ2F0ZSAoc2VlXG5cdFx0Ly8gYF9ldmFsdWF0ZWApLCBzbyBpdCBuZXZlciBwb2xsdXRlcyB0aGUgc2NvcmVjYXJkLlxuXHRcdGlmIChzY2VuYXJpby5leHBlcmltZW50ICYmIHRoaXMuX2V4cGVyaW1lbnRTdGF0ZXMuZ2V0KHNjZW5hcmlvLmlkKT8uYWN0aXZlICE9PSB0cnVlICYmICF0aGlzLl9pc0RldmVsb3Blck1vZGUoc2NlbmFyaW8uaWQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHNjZW5hcmlvLnRyaWdnZXIua2luZCA9PT0gJ29ic2VydmFibGUnICYmIHNjZW5hcmlvLnRyaWdnZXIuc2lnbmFsLmdldCgpICE9PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9lbnF1ZXVlKHNjZW5hcmlvOiBJT25ib2FyZGluZ1NjZW5hcmlvKTogUHJvbWlzZTxPbmJvYXJkaW5nT3V0Y29tZT4ge1xuXHRcdGlmICh0aGlzLl9zdG9wcGVkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKE9uYm9hcmRpbmdPdXRjb21lLkFib3J0ZWQpO1xuXHRcdH1cblxuXHRcdC8vIERlLWR1cGxpY2F0ZSBhZ2FpbnN0IGJvdGggdGhlIHF1ZXVlIGFuZCB0aGUgaW4tZmxpZ2h0IHJ1biBzbyBhIHJlcGVhdGVkXG5cdFx0Ly8gYHJ1blNjZW5hcmlvKGlkKWAgKGUuZy4gYSBjb21tYW5kIGludm9rZWQgd2hpbGUgdGhlIHRvdXIgaXMgYWN0aXZlKVxuXHRcdC8vIGpvaW5zIHRoZSBleGlzdGluZyBydW4gaW5zdGVhZCBvZiBzY2hlZHVsaW5nIGEgc2Vjb25kIG9uZS5cblx0XHRjb25zdCBxdWV1ZWQgPSB0aGlzLl9xdWV1ZS5maW5kKGVudHJ5ID0+IGVudHJ5LnNjZW5hcmlvLmlkID09PSBzY2VuYXJpby5pZCk7XG5cdFx0aWYgKHF1ZXVlZCkge1xuXHRcdFx0cmV0dXJuIHF1ZXVlZC5kZWZlcnJlZC5wO1xuXHRcdH1cblx0XHRjb25zdCBpbmZsaWdodCA9IHRoaXMuX2luZmxpZ2h0LmdldChzY2VuYXJpby5pZCk7XG5cdFx0aWYgKGluZmxpZ2h0KSB7XG5cdFx0XHRyZXR1cm4gaW5mbGlnaHQucDtcblx0XHR9XG5cblx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8T25ib2FyZGluZ091dGNvbWU+KCk7XG5cdFx0dGhpcy5fcGVuZGluZy5hZGQoc2NlbmFyaW8uaWQpO1xuXHRcdHRoaXMuX3F1ZXVlLnB1c2goeyBzY2VuYXJpbywgZGVmZXJyZWQgfSk7XG5cdFx0Ly8gSGlnaGVzdCBwcmlvcml0eSBmaXJzdDsgc3RhYmxlIGZvciBlcXVhbCBwcmlvcml0aWVzLlxuXHRcdHRoaXMuX3F1ZXVlLnNvcnQoKGEsIGIpID0+IChiLnNjZW5hcmlvLnByaW9yaXR5ID8/IDApIC0gKGEuc2NlbmFyaW8ucHJpb3JpdHkgPz8gMCkpO1xuXG5cdFx0dGhpcy5fcHVtcCgpO1xuXHRcdHJldHVybiBkZWZlcnJlZC5wO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHVtcCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcHVtcGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBNYXJrIGFzIHB1bXBpbmcgc3luY2hyb25vdXNseSBzbyBhIGJhdGNoIG9mIGBfZW5xdWV1ZWAgY2FsbHMgbWFkZSBpbiB0aGVcblx0XHQvLyBzYW1lIHRpY2sgYWxsIGxhbmQgKGFuZCByZS1zb3J0IGJ5IHByaW9yaXR5KSBiZWZvcmUgd2UgY29uc3VtZSB0aGUgcXVldWUuXG5cdFx0dGhpcy5fcHVtcGluZyA9IHRydWU7XG5cdFx0dGhpcy5fZG9QdW1wKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kb1B1bXAoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7IC8vIGxldCB0aGUgY3VycmVudCBzeW5jaHJvbm91cyBiYXRjaCBvZiBlbnF1ZXVlcyBzZXR0bGVcblx0XHR0cnkge1xuXHRcdFx0bGV0IGVudHJ5OiB7IHNjZW5hcmlvOiBJT25ib2FyZGluZ1NjZW5hcmlvOyBkZWZlcnJlZDogRGVmZXJyZWRQcm9taXNlPE9uYm9hcmRpbmdPdXRjb21lPiB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0d2hpbGUgKCF0aGlzLl9zdG9wcGVkICYmIChlbnRyeSA9IHRoaXMuX3F1ZXVlLnNoaWZ0KCkpKSB7XG5cdFx0XHRcdGNvbnN0IHsgc2NlbmFyaW8sIGRlZmVycmVkIH0gPSBlbnRyeTtcblx0XHRcdFx0Ly8gVHJhY2sgdGhlIHJ1bm5pbmcgc2NlbmFyaW8gc28gYSBjb25jdXJyZW50IGBfZW5xdWV1ZWAgZm9yIHRoZSBzYW1lXG5cdFx0XHRcdC8vIGlkIGpvaW5zIHRoaXMgcnVuIGluc3RlYWQgb2Ygc2NoZWR1bGluZyBhbm90aGVyLlxuXHRcdFx0XHR0aGlzLl9pbmZsaWdodC5zZXQoc2NlbmFyaW8uaWQsIGRlZmVycmVkKTtcblx0XHRcdFx0bGV0IG91dGNvbWU6IE9uYm9hcmRpbmdPdXRjb21lO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdG91dGNvbWUgPSBhd2FpdCB0aGlzLl9ydW5QcmVzZW50YXRpb24oc2NlbmFyaW8pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTtcblx0XHRcdFx0XHRvdXRjb21lID0gT25ib2FyZGluZ091dGNvbWUuQWJvcnRlZDtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHR0aGlzLl9pbmZsaWdodC5kZWxldGUoc2NlbmFyaW8uaWQpO1xuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmcuZGVsZXRlKHNjZW5hcmlvLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkZWZlcnJlZC5jb21wbGV0ZShvdXRjb21lKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fcHVtcGluZyA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3J1blByZXNlbnRhdGlvbihzY2VuYXJpbzogSU9uYm9hcmRpbmdTY2VuYXJpbyk6IFByb21pc2U8T25ib2FyZGluZ091dGNvbWU+IHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBvbmJvYXJkaW5nUHJlc2VudGF0aW9uUmVnaXN0cnkuZ2V0KHNjZW5hcmlvLnByZXNlbnRhdGlvbi5raW5kKTtcblx0XHRpZiAoIXByZXNlbnRhdGlvbikge1xuXHRcdFx0cmV0dXJuIE9uYm9hcmRpbmdPdXRjb21lLkFib3J0ZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gTWFyayBzaG93biB0aGUgbW9tZW50IGEgc2NlbmFyaW8gc3RhcnRzIHNvIGEgY3Jhc2gvcmVsb2FkIHdvbid0IHJlLXRyaWdnZXIgaXQuXG5cdFx0dGhpcy5fbWFya1Nob3duKHRoaXMuX3NlZW5LZXkoc2NlbmFyaW8pKTtcblxuXHRcdGNvbnN0IGFib3J0ID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHR0aGlzLl9hY3RpdmVBYm9ydCA9IGFib3J0O1xuXHRcdGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cdFx0bGV0IGRpZFJlcG9ydFNob3duID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByZXNlbnRhdGlvbi5ydW4oc2NlbmFyaW8sIHtcblx0XHRcdFx0dGFyZ2V0V2luZG93OiBtYWluV2luZG93LFxuXHRcdFx0XHRvbkFib3J0OiBhYm9ydC5ldmVudCxcblx0XHRcdFx0b25EaWRTaG93OiAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFkaWRSZXBvcnRTaG93bikge1xuXHRcdFx0XHRcdFx0ZGlkUmVwb3J0U2hvd24gPSB0cnVlO1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVwb3J0U2hvd24oc2NlbmFyaW8pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9yZWNvcmRPdXRjb21lKHRoaXMuX3NlZW5LZXkoc2NlbmFyaW8pLCByZXN1bHQub3V0Y29tZSk7XG5cdFx0XHQvLyBPbmx5IGVtaXQgb3V0Y29tZSB0ZWxlbWV0cnkgd2hlbiBhIHRvdXIgd2FzIGdlbnVpbmVseSBkaXNwbGF5ZWQ7IGEgZGVnZW5lcmF0ZVxuXHRcdFx0Ly8gcnVuIHRoYXQgcmVuZGVyZWQgbm90aGluZyAobm8gc3RlcHMgLyBhbGwgc3RlcHMgc2tpcHBlZCkgbXVzdCBub3QgcG9sbHV0ZSBtZXRyaWNzLlxuXHRcdFx0aWYgKHJlc3VsdC5zaG93bikge1xuXHRcdFx0XHR0aGlzLl9yZXBvcnRPdXRjb21lKHNjZW5hcmlvLCByZXN1bHQsIERhdGUubm93KCkgLSBzdGFydFRpbWUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdC5vdXRjb21lO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9hY3RpdmVBYm9ydCA9IHVuZGVmaW5lZDtcblx0XHRcdGFib3J0LmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHQvKiogRW1pdCBhbiBpbXByZXNzaW9uIHdoZW4gYSBwcmVzZW50YXRpb24gaGFzIHJlbmRlcmVkIHZpc2libGUgb25ib2FyZGluZyBVSS4gKi9cblx0cHJpdmF0ZSBfcmVwb3J0U2hvd24oc2NlbmFyaW86IElPbmJvYXJkaW5nU2NlbmFyaW8pOiB2b2lkIHtcblx0XHRjb25zdCBleHBlcmltZW50U3RhdGUgPSBzY2VuYXJpby5leHBlcmltZW50ID8gdGhpcy5fZXhwZXJpbWVudFN0YXRlcy5nZXQoc2NlbmFyaW8uaWQpIDogdW5kZWZpbmVkO1xuXG5cdFx0dHlwZSBPbmJvYXJkaW5nU2NlbmFyaW9TaG93bkV2ZW50ID0ge1xuXHRcdFx0c2NlbmFyaW9JZDogc3RyaW5nO1xuXHRcdFx0ZXhwZXJpbWVudEFjdGl2ZTogYm9vbGVhbjtcblx0XHRcdGV4cGVyaW1lbnRBc3NpZ25tZW50Q29udGV4dElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0fTtcblx0XHR0eXBlIE9uYm9hcmRpbmdTY2VuYXJpb1Nob3duQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2JlbmliZW5qJztcblx0XHRcdGNvbW1lbnQ6ICdSZXBvcnRzIGEgcmVuZGVyZWQgb25ib2FyZGluZyB0b3VyIGltcHJlc3Npb24uIFRoZSBzY2VuYXJpbyBhbmQgZXhwZXJpbWVudCBhc3NpZ25tZW50IGlkZW50aWZpZXJzIGFyZSBib3VuZGVkIHByb2R1Y3QgY2F0ZWdvcmllcywgbm90IHVzZXIgY29udGVudC4nO1xuXHRcdFx0c2NlbmFyaW9JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBzdGFibGUgaWRlbnRpZmllciBvZiB0aGUgb25ib2FyZGluZyBzY2VuYXJpbyB0aGF0IHJlbmRlcmVkLicgfTtcblx0XHRcdGV4cGVyaW1lbnRBY3RpdmU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIGEgdmFsaWQgZXhwZXJpbWVudCB0cmVhdG1lbnQgc2VsZWN0ZWQgdGhlIHJlbmRlcmVkIHNjZW5hcmlvLicgfTtcblx0XHRcdGV4cGVyaW1lbnRBc3NpZ25tZW50Q29udGV4dElkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGJvdW5kZWQgZXhwZXJpbWVudCBhc3NpZ25tZW50LWNvbnRleHQgaWRlbnRpZmllciBmb3IgdGhlIHJlbmRlcmVkIHNjZW5hcmlvLCB3aGVuIGFjdGl2ZS4nIH07XG5cdFx0fTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxPbmJvYXJkaW5nU2NlbmFyaW9TaG93bkV2ZW50LCBPbmJvYXJkaW5nU2NlbmFyaW9TaG93bkNsYXNzaWZpY2F0aW9uPignb25ib2FyZGluZy5zY2VuYXJpb1Nob3duJywge1xuXHRcdFx0c2NlbmFyaW9JZDogc2NlbmFyaW8uaWQsXG5cdFx0XHRleHBlcmltZW50QWN0aXZlOiBleHBlcmltZW50U3RhdGU/LmFjdGl2ZSA9PT0gdHJ1ZSxcblx0XHRcdGV4cGVyaW1lbnRBc3NpZ25tZW50Q29udGV4dElkOiBleHBlcmltZW50U3RhdGU/LmFjdGl2ZSA/IGV4cGVyaW1lbnRTdGF0ZS5hc3NpZ25tZW50Q29udGV4dElkIDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqIEVtaXQgcGVyLXRvdXIgdGVsZW1ldHJ5LiBPbmx5IGNhbGxlZCB3aGVuIGEgdG91ciB3YXMgYWN0dWFsbHkgc2hvd24uICovXG5cdHByaXZhdGUgX3JlcG9ydE91dGNvbWUoc2NlbmFyaW86IElPbmJvYXJkaW5nU2NlbmFyaW8sIHJlc3VsdDogSU9uYm9hcmRpbmdSdW5SZXN1bHQsIGR1cmF0aW9uTXM6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGV4cGVyaW1lbnRBY3RpdmUgPSAhIXNjZW5hcmlvLmV4cGVyaW1lbnQgJiYgdGhpcy5fZXhwZXJpbWVudFN0YXRlcy5nZXQoc2NlbmFyaW8uaWQpPy5hY3RpdmUgPT09IHRydWU7XG5cblx0XHR0eXBlIE9uYm9hcmRpbmdTY2VuYXJpb091dGNvbWVFdmVudCA9IHtcblx0XHRcdHNjZW5hcmlvSWQ6IHN0cmluZztcblx0XHRcdG91dGNvbWU6IHN0cmluZztcblx0XHRcdGRpc21pc3NSZWFzb246IHN0cmluZztcblx0XHRcdGxhc3RTdGVwSW5kZXg6IG51bWJlcjtcblx0XHRcdHN0ZXBDb3VudDogbnVtYmVyO1xuXHRcdFx0ZHVyYXRpb25NczogbnVtYmVyO1xuXHRcdFx0ZXhwZXJpbWVudEFjdGl2ZTogYm9vbGVhbjtcblx0XHR9O1xuXHRcdHR5cGUgT25ib2FyZGluZ1NjZW5hcmlvT3V0Y29tZUNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdiZW5pYmVuaic7XG5cdFx0XHRjb21tZW50OiAnUmVwb3J0cyBob3cgYSB1c2VyIHByb2dyZXNzZWQgdGhyb3VnaCBhbiBvbmJvYXJkaW5nIHRvdXIgdG8gZXZhbHVhdGUgb25ib2FyZGluZyBlZmZlY3RpdmVuZXNzLic7XG5cdFx0XHRzY2VuYXJpb0lkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGlkIG9mIHRoZSBvbmJvYXJkaW5nIHNjZW5hcmlvIHRoYXQgcmFuLicgfTtcblx0XHRcdG91dGNvbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdIb3cgdGhlIHRvdXIgZW5kZWQ6IGNvbXBsZXRlZCwgc2tpcHBlZCwgZGlzbWlzc2VkIG9yIGFib3J0ZWQuJyB9O1xuXHRcdFx0ZGlzbWlzc1JlYXNvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBjb25jcmV0ZSBhY3Rpb24gdGhhdCBlbmRlZCB0aGUgdG91ciwgZS5nLiBza2lwQnV0dG9uLCBlc2NhcGVLZXksIHRhcmdldENsaWNrLCBjb21wbGV0ZWQgb3IgYWJvcnRlZC4nIH07XG5cdFx0XHRsYXN0U3RlcEluZGV4OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnVGhlIGZ1cnRoZXN0IDAtYmFzZWQgc3RlcCBpbmRleCB0aGUgdXNlciByZWFjaGVkLicgfTtcblx0XHRcdHN0ZXBDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSB0b3RhbCBudW1iZXIgb2Ygc3RlcHMgaW4gdGhlIHRvdXIuJyB9O1xuXHRcdFx0ZHVyYXRpb25NczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ0hvdyBsb25nIHRoZSB0b3VyIHdhcyBvbiBzY3JlZW4sIGluIG1pbGxpc2Vjb25kcy4nIH07XG5cdFx0XHRleHBlcmltZW50QWN0aXZlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciBhbiBhY3RpdmUgZXhwZXJpbWVudCBkcm92ZSB0aGlzIHJ1bi4nIH07XG5cdFx0fTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxPbmJvYXJkaW5nU2NlbmFyaW9PdXRjb21lRXZlbnQsIE9uYm9hcmRpbmdTY2VuYXJpb091dGNvbWVDbGFzc2lmaWNhdGlvbj4oJ29uYm9hcmRpbmcuc2NlbmFyaW9PdXRjb21lJywge1xuXHRcdFx0c2NlbmFyaW9JZDogc2NlbmFyaW8uaWQsXG5cdFx0XHRvdXRjb21lOiByZXN1bHQub3V0Y29tZSxcblx0XHRcdGRpc21pc3NSZWFzb246IHJlc3VsdC5kaXNtaXNzUmVhc29uLFxuXHRcdFx0bGFzdFN0ZXBJbmRleDogcmVzdWx0Lmxhc3RTdGVwSW5kZXgsXG5cdFx0XHRzdGVwQ291bnQ6IHJlc3VsdC5zdGVwQ291bnQsXG5cdFx0XHRkdXJhdGlvbk1zLFxuXHRcdFx0ZXhwZXJpbWVudEFjdGl2ZVxuXHRcdH0pO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFRyaWdnZXJzICYgZXhwZXJpbWVudHNcblxuXHRwcml2YXRlIF9yZWdpc3RlclRyaWdnZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJpZ2dlckxpc3RlbmVycy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3Qgc2NlbmFyaW8gb2Ygb25ib2FyZGluZ1NjZW5hcmlvUmVnaXN0cnkuZ2V0U2NlbmFyaW9zKCkpIHtcblx0XHRcdGlmIChzY2VuYXJpby50cmlnZ2VyLmtpbmQgPT09ICdvYnNlcnZhYmxlJykge1xuXHRcdFx0XHRjb25zdCBzaWduYWwgPSBzY2VuYXJpby50cmlnZ2VyLnNpZ25hbDtcblx0XHRcdFx0dGhpcy5fdHJpZ2dlckxpc3RlbmVycy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdHNpZ25hbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0dGhpcy5fZXZhbHVhdGUoKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSB0d28gZXhwZXJpbWVudCB0cmVhdG1lbnQgZmxhZ3MgZm9yIGVhY2ggc2NlbmFyaW8gdGhhdCBkZWNsYXJlcyBhbiBleHBlcmltZW50LlxuXHQgKiBUaGUgZXhwZXJpbWVudCBpcyBvbmx5IGFjdGl2ZSB3aGVuIGJvdGggcmVzb2x2ZTogdGhlIGJvb2xlYW4gdG8gYSBib29sZWFuIGFuZCB0aGUgaWQgdG8gYVxuXHQgKiBub24tZW1wdHkgc3RyaW5nIHRoYXQgc3RhcnRzIHdpdGgge0BsaW5rIE9OQk9BUkRJTkdfQVNTSUdOTUVOVF9DT05URVhUX1BSRUZJWH0uIFJlc29sdmVkXG5cdCAqIG9uY2UgcGVyIHNjZW5hcmlvOyByZS1ldmFsdWF0aW9uIGlzIHRyaWdnZXJlZCB3aGVuIGFuIGV4cGVyaW1lbnQgYmVjb21lcyBhY3RpdmUuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlRXhwZXJpbWVudHMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBzY2VuYXJpbyBvZiBvbmJvYXJkaW5nU2NlbmFyaW9SZWdpc3RyeS5nZXRTY2VuYXJpb3MoKSkge1xuXHRcdFx0Y29uc3QgZXhwZXJpbWVudCA9IHNjZW5hcmlvLmV4cGVyaW1lbnQ7XG5cdFx0XHRpZiAoIWV4cGVyaW1lbnQgfHwgdGhpcy5fZXhwZXJpbWVudFN0YXRlcy5oYXMoc2NlbmFyaW8uaWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gU2VlZCBhbiBpbmFjdGl2ZSBzdGF0ZSBzbyB0aGUgc2NlbmFyaW8gaXMgbm90IGVsaWdpYmxlIHVudGlsIGJvdGggZmxhZ3MgcmVzb2x2ZS5cblx0XHRcdHRoaXMuX2V4cGVyaW1lbnRTdGF0ZXMuc2V0KHNjZW5hcmlvLmlkLCB7IGFjdGl2ZTogZmFsc2UsIGJlaGF2aW9yOiBmYWxzZSwgYXNzaWdubWVudENvbnRleHRJZDogJycgfSk7XG5cdFx0XHRQcm9taXNlLmFsbChbXG5cdFx0XHRcdHRoaXMuYXNzaWdubWVudFNlcnZpY2UuZ2V0VHJlYXRtZW50PGJvb2xlYW4+KGV4cGVyaW1lbnQuYmVoYXZpb3JGbGFnKSxcblx0XHRcdFx0dGhpcy5hc3NpZ25tZW50U2VydmljZS5nZXRUcmVhdG1lbnQ8c3RyaW5nPihleHBlcmltZW50LmFzc2lnbm1lbnRDb250ZXh0SWRGbGFnKVxuXHRcdFx0XSkudGhlbigoW2JlaGF2aW9yLCBhc3NpZ25tZW50Q29udGV4dElkXSkgPT4ge1xuXHRcdFx0XHRjb25zdCBoYXNCZWhhdmlvciA9IHR5cGVvZiBiZWhhdmlvciA9PT0gJ2Jvb2xlYW4nO1xuXHRcdFx0XHRjb25zdCBoYXNJZCA9IHR5cGVvZiBhc3NpZ25tZW50Q29udGV4dElkID09PSAnc3RyaW5nJyAmJiBhc3NpZ25tZW50Q29udGV4dElkLmxlbmd0aCA+IDA7XG5cblx0XHRcdFx0Ly8gRGVmZW5zaXZlbHkgcmVxdWlyZSB0aGUgcmVzZXJ2ZWQgcHJlZml4LiBUaGUgZWFnZXIgdGVsZW1ldHJ5IGdhdGUgb25seSBibG9ja3Ncblx0XHRcdFx0Ly8gaWRzIHRoYXQgc3RhcnQgd2l0aCBpdCwgc28gYW4gaWQgbWlzc2luZyB0aGUgcHJlZml4IHdvdWxkIG5ldmVyIGJlIGdhdGVkIGFuZFxuXHRcdFx0XHQvLyB3b3VsZCBsZWFrIGludG8gdGVsZW1ldHJ5IGZyb20gdGhlIHZlcnkgZmlyc3QgZXZlbnQgXHUyMDE0IHNpbGVudGx5IGNvcnJ1cHRpbmcgdGhlXG5cdFx0XHRcdC8vIHNjb3JlY2FyZCBiYXNlbGluZS4gQ2F0Y2ggdGhlIG1pc2NvbmZpZ3VyYXRpb24gbG91ZGx5IGFuZCB0cmVhdCB0aGUgZXhwZXJpbWVudFxuXHRcdFx0XHQvLyBhcyBpbmFjdGl2ZSByYXRoZXIgdGhhbiBydW5uaW5nIGl0IHdpdGggYW4gdW5nYXRlZCBpZC5cblx0XHRcdFx0Y29uc3QgaGFzVmFsaWRJZCA9IGhhc0lkICYmIGFzc2lnbm1lbnRDb250ZXh0SWQhLnN0YXJ0c1dpdGgoT05CT0FSRElOR19BU1NJR05NRU5UX0NPTlRFWFRfUFJFRklYKTtcblx0XHRcdFx0aWYgKGhhc0lkICYmICFoYXNWYWxpZElkKSB7XG5cdFx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IobmV3IEVycm9yKGBPbmJvYXJkaW5nIGV4cGVyaW1lbnQgZm9yIHNjZW5hcmlvICcke3NjZW5hcmlvLmlkfScgcmVzb2x2ZWQgYW4gYXNzaWdubWVudC1jb250ZXh0IGlkICcke2Fzc2lnbm1lbnRDb250ZXh0SWR9JyB0aGF0IGRvZXMgbm90IHN0YXJ0IHdpdGggdGhlIHJlcXVpcmVkICcke09OQk9BUkRJTkdfQVNTSUdOTUVOVF9DT05URVhUX1BSRUZJWH0nIHByZWZpeDsgdHJlYXRpbmcgdGhlIGV4cGVyaW1lbnQgYXMgaW5hY3RpdmUuYCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYWN0aXZlID0gaGFzQmVoYXZpb3IgJiYgaGFzVmFsaWRJZDtcblx0XHRcdFx0dGhpcy5fZXhwZXJpbWVudFN0YXRlcy5zZXQoc2NlbmFyaW8uaWQsIHtcblx0XHRcdFx0XHRhY3RpdmUsXG5cdFx0XHRcdFx0YmVoYXZpb3I6IGJlaGF2aW9yID09PSB0cnVlLFxuXHRcdFx0XHRcdGFzc2lnbm1lbnRDb250ZXh0SWQ6IGFjdGl2ZSA/IGFzc2lnbm1lbnRDb250ZXh0SWQhIDogJydcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChhY3RpdmUpIHtcblx0XHRcdFx0XHR0aGlzLl9ldmFsdWF0ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCBlcnJvciA9PiBvblVuZXhwZWN0ZWRFcnJvcihlcnJvcikpO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBUZWxlbWV0cnkgZ2F0ZVxuXG5cdHByaXZhdGUgX2xvYWRPcGVuZWRJZHMoKTogU2V0PHN0cmluZz4ge1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KE9uYm9hcmRpbmdTY2VuYXJpb1NlcnZpY2UuT1BFTkVEX0lEU19TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRpZiAoIXJhdykge1xuXHRcdFx0cmV0dXJuIG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkocGFyc2VkKSA/IG5ldyBTZXQ8c3RyaW5nPihwYXJzZWQuZmlsdGVyKChpZCk6IGlkIGlzIHN0cmluZyA9PiB0eXBlb2YgaWQgPT09ICdzdHJpbmcnKSkgOiBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpO1xuXHRcdFx0cmV0dXJuIG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBPcGVuIHRoZSB0ZWxlbWV0cnkgZ2F0ZSBmb3IgYW4gYXNzaWdubWVudC1jb250ZXh0IGlkOiBmcm9tIG5vdyBvbiAoYW5kIGFmdGVyIHJlbG9hZCkgdGhlXG5cdCAqIGlkIGlzIG5vIGxvbmdlciBmaWx0ZXJlZCBvdXQsIHNvIGV2ZXJ5IGV2ZW50IGNhcnJpZXMgaXQuIElkZW1wb3RlbnQuXG5cdCAqL1xuXHRwcml2YXRlIF9vcGVuR2F0ZShhc3NpZ25tZW50Q29udGV4dElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIWFzc2lnbm1lbnRDb250ZXh0SWQgfHwgdGhpcy5fb3BlbmVkQXNzaWdubWVudENvbnRleHRJZHMuaGFzKGFzc2lnbm1lbnRDb250ZXh0SWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX29wZW5lZEFzc2lnbm1lbnRDb250ZXh0SWRzLmFkZChhc3NpZ25tZW50Q29udGV4dElkKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFxuXHRcdFx0T25ib2FyZGluZ1NjZW5hcmlvU2VydmljZS5PUEVORURfSURTX1NUT1JBR0VfS0VZLFxuXHRcdFx0SlNPTi5zdHJpbmdpZnkoQXJyYXkuZnJvbSh0aGlzLl9vcGVuZWRBc3NpZ25tZW50Q29udGV4dElkcykpLFxuXHRcdFx0U3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0U3RvcmFnZVRhcmdldC5NQUNISU5FXG5cdFx0KTtcblx0XHQvLyBSZWNvbXB1dGUgdGhlIGZpbHRlcmVkIGFzc2lnbm1lbnQgY29udGV4dCBzbyB0aGUgaWQgc3RhcnRzIGZsb3dpbmcgaW1tZWRpYXRlbHkuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VPcGVuZWRJZHMuZmlyZSgpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFBlcnNpc3RlbmNlXG5cblx0LyoqXG5cdCAqIFRoZSBrZXkgdW5kZXIgd2hpY2ggYSBzY2VuYXJpbydzIG9uY2UtcGVyLXVzZXIgXCJzaG93blwiIHN0YXRlIGlzIHN0b3JlZC5cblx0ICogU2NlbmFyaW9zIG1heSBvcHQgaW50byBhIHNoYXJlZCB7QGxpbmsgSU9uYm9hcmRpbmdTY2VuYXJpby5zZWVuS2V5fSBzbyB0aGF0XG5cdCAqIHZhcmlhdGlvbnMgb2YgdGhlIHNhbWUgb25ib2FyZGluZyBhcmUgZ2F0ZWQgdG9nZXRoZXI7IG90aGVyd2lzZSB0aGVcblx0ICogc2NlbmFyaW8gaWQgaXMgdXNlZC5cblx0ICovXG5cdHByaXZhdGUgX3NlZW5LZXkoc2NlbmFyaW86IElPbmJvYXJkaW5nU2NlbmFyaW8pOiBzdHJpbmcge1xuXHRcdHJldHVybiBzY2VuYXJpby5zZWVuS2V5ID8/IHNjZW5hcmlvLmlkO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFzQmVlblNob3duS2V5KGtleTogc3RyaW5nLCBzY2VuYXJpb0lkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5faXNEZXZlbG9wZXJNb2RlKHNjZW5hcmlvSWQpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2hvd25TaW5jZVN0YXJ0LmhhcyhrZXkpO1xuXHRcdH1cblx0XHRyZXR1cm4gISF0aGlzLl9zdGF0ZVtrZXldPy5zaG93bkF0O1xuXHR9XG5cblx0cHJpdmF0ZSBfbWFya1Nob3duKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9zaG93blNpbmNlU3RhcnQuYWRkKGlkKTtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX3N0YXRlW2lkXTtcblx0XHRjb25zdCBuZXh0OiBJU2NlbmFyaW9TdGF0ZSA9IHtcblx0XHRcdHNob3duQXQ6IERhdGUubm93KCksXG5cdFx0XHRvdXRjb21lOiBwcmV2aW91cz8ub3V0Y29tZSxcblx0XHRcdHNlZW5Db3VudDogKHByZXZpb3VzPy5zZWVuQ291bnQgPz8gMCkgKyAxXG5cdFx0fTtcblx0XHR0aGlzLl9zdGF0ZVtpZF0gPSBuZXh0O1xuXHRcdHRoaXMuX21lbWVudG8uc2F2ZU1lbWVudG8oKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlY29yZE91dGNvbWUoaWQ6IHN0cmluZywgb3V0Y29tZTogT25ib2FyZGluZ091dGNvbWUpOiB2b2lkIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlW2lkXTtcblx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdHN0YXRlLm91dGNvbWUgPSBvdXRjb21lO1xuXHRcdFx0dGhpcy5fbWVtZW50by5zYXZlTWVtZW50bygpO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuXG5mdW5jdGlvbiBnZXRBc3NpZ25tZW50Q29udGV4dFZhcmlhbnQoYXNzaWdubWVudDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3Qgc2VwYXJhdG9ySW5kZXggPSBhc3NpZ25tZW50Lmxhc3RJbmRleE9mKCc6Jyk7XG5cdHJldHVybiBzZXBhcmF0b3JJbmRleCA9PT0gLTEg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
