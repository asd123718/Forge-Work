import assert from "assert";
import { $ } from "../../../../../base/browser/dom.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { errorHandler, setUnexpectedErrorHandler } from "../../../../../base/common/errors.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ContextKeyService } from "../../../../../platform/contextkey/browser/contextKeyService.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestHostService, TestLayoutService } from "../../../../test/browser/workbenchTestServices.js";
import { RunOnboardingStepPresentation, RUN_ONBOARDING_STEP_KIND } from "../../browser/sequence/runOnboardingStep.js";
import { OnboardingSequencePresentation } from "../../browser/sequence/sequencePresentation.js";
import { markOnboardingTarget } from "../../browser/spotlight/onboardingTarget.js";
import { SpotlightPresentation } from "../../browser/spotlight/spotlightPresentation.js";
import { SPOTLIGHT_PRESENTATION_KIND } from "../../browser/spotlight/spotlightTypes.js";
import { OnboardingDismissReason, OnboardingOutcome } from "../../common/onboardingScenario.js";
import { ONBOARDING_SEQUENCE_PRESENTATION_KIND, onboardingSequenceStepPresentationRegistry } from "../../common/onboardingSequence.js";
class TestVisualStepPresentation {
  constructor(kind, _actions) {
    this.kind = kind;
    this._actions = _actions;
    this.countsAsVisualStep = true;
    this.contexts = [];
  }
  async runStep(step, context) {
    this.contexts.push({
      id: step.id,
      index: context.visualStepIndex,
      count: context.visualStepCount,
      canGoBack: context.canGoBack,
      isLast: context.isLastVisualStep
    });
    return this._actions.get(step.id)?.shift() ?? { action: "next", shown: true };
  }
}
class SequenceTestLayoutService extends TestLayoutService {
  constructor(_container) {
    super();
    this._container = _container;
  }
  getContainer() {
    return this._container;
  }
}
suite("OnboardingSequencePresentation", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let kindSeed = 0;
  function createScenario(steps) {
    return {
      id: "test.sequence",
      trigger: { kind: "auto" },
      presentation: {
        kind: ONBOARDING_SEQUENCE_PRESENTATION_KIND,
        payload: { steps }
      }
    };
  }
  function context(onAbort = Event.None) {
    return { targetWindow: mainWindow, onAbort };
  }
  function createSpotlightTarget(container, id, options) {
    const target = $("button");
    target.style.position = "fixed";
    target.style.left = "100px";
    target.style.top = "100px";
    target.style.width = "100px";
    target.style.height = "30px";
    container.appendChild(target);
    disposables.add(markOnboardingTarget(target, id, options));
    return target;
  }
  test("renders spotlight counters using only spotlight steps", async () => {
    const container = $(".onboarding-sequence-presentation-test");
    mainWindow.document.body.appendChild(container);
    disposables.add({ dispose: () => container.remove() });
    const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
    const spotlight = disposables.add(new SpotlightPresentation(new SequenceTestLayoutService(container), new TestHostService(), contextKeyService));
    disposables.add(onboardingSequenceStepPresentationRegistry.register(spotlight));
    disposables.add(onboardingSequenceStepPresentationRegistry.register(new RunOnboardingStepPresentation()));
    const counters = [];
    const createAdvancingTarget = (id) => {
      const target = createSpotlightTarget(container, id, {
        open: () => {
          counters.push(container.getElementsByClassName("spotlight-callout-counter")[0].textContent ?? "");
          target.click();
        }
      });
      return target;
    };
    createAdvancingTarget("test.sequence.first");
    createAdvancingTarget("test.sequence.second");
    const spotlightStep = (id) => ({
      id,
      targetId: `test.sequence.${id}`,
      title: id,
      description: id,
      openTarget: true,
      advanceOnTargetClick: true
    });
    const presentation = disposables.add(new OnboardingSequencePresentation());
    const result = await presentation.run(createScenario([
      { id: "first", kind: SPOTLIGHT_PRESENTATION_KIND, payload: spotlightStep("first") },
      { id: "script", kind: RUN_ONBOARDING_STEP_KIND, payload: { run: () => void 0 } },
      { id: "second", kind: SPOTLIGHT_PRESENTATION_KIND, payload: spotlightStep("second") }
    ]), context());
    assert.deepStrictEqual({ counters, result }, {
      counters: ["1 of 2", "2 of 2"],
      result: {
        outcome: OnboardingOutcome.Completed,
        shown: true,
        dismissReason: OnboardingDismissReason.TargetClick,
        lastStepIndex: 2,
        stepCount: 3
      }
    });
  });
  test("counts only visual steps while retaining sequence indices in the result", async () => {
    const visualKind = `test-visual-${kindSeed++}`;
    const visual = new TestVisualStepPresentation(visualKind, /* @__PURE__ */ new Map());
    disposables.add(onboardingSequenceStepPresentationRegistry.register(visual));
    disposables.add(onboardingSequenceStepPresentationRegistry.register(new RunOnboardingStepPresentation()));
    const runCalls = [];
    const presentation = disposables.add(new OnboardingSequencePresentation());
    const result = await presentation.run(createScenario([
      { id: "first", kind: visualKind, payload: void 0 },
      { id: "script", kind: RUN_ONBOARDING_STEP_KIND, payload: { run: () => runCalls.push("script") } },
      { id: "second", kind: visualKind, payload: void 0 }
    ]), context());
    assert.deepStrictEqual({ contexts: visual.contexts, runCalls, result }, {
      contexts: [
        { id: "first", index: 0, count: 2, canGoBack: false, isLast: false },
        { id: "second", index: 1, count: 2, canGoBack: true, isLast: true }
      ],
      runCalls: ["script"],
      result: {
        outcome: OnboardingOutcome.Completed,
        shown: true,
        dismissReason: OnboardingDismissReason.Completed,
        lastStepIndex: 2,
        stepCount: 3
      }
    });
  });
  test("reports a user-visible run step as shown when preceding visuals are skipped", async () => {
    const visualKind = `test-visual-${kindSeed++}`;
    const visual = new TestVisualStepPresentation(visualKind, /* @__PURE__ */ new Map([
      ["skipped", [{ action: "skipStep", shown: false }]]
    ]));
    disposables.add(onboardingSequenceStepPresentationRegistry.register(visual));
    disposables.add(onboardingSequenceStepPresentationRegistry.register(new RunOnboardingStepPresentation()));
    const presentation = disposables.add(new OnboardingSequencePresentation());
    const result = await presentation.run(createScenario([
      { id: "skipped", kind: visualKind, payload: void 0 },
      { id: "script", kind: RUN_ONBOARDING_STEP_KIND, payload: { run: () => ({ shown: true }) } }
    ]), context());
    assert.deepStrictEqual(result, {
      outcome: OnboardingOutcome.Completed,
      shown: true,
      dismissReason: OnboardingDismissReason.Completed,
      lastStepIndex: 1,
      stepCount: 2
    });
  });
  test("Back skips run steps and forward traversal runs them at most once", async () => {
    const visualKind = `test-visual-${kindSeed++}`;
    const actions = /* @__PURE__ */ new Map([
      ["first", [{ action: "next", shown: true }, { action: "next", shown: true }]],
      ["second", [{ action: "back", shown: true }, { action: "next", shown: true }]]
    ]);
    const visual = new TestVisualStepPresentation(visualKind, actions);
    disposables.add(onboardingSequenceStepPresentationRegistry.register(visual));
    disposables.add(onboardingSequenceStepPresentationRegistry.register(new RunOnboardingStepPresentation()));
    let runCount = 0;
    const presentation = disposables.add(new OnboardingSequencePresentation());
    const result = await presentation.run(createScenario([
      { id: "first", kind: visualKind, payload: void 0 },
      { id: "script", kind: RUN_ONBOARDING_STEP_KIND, payload: { run: () => runCount++ } },
      { id: "second", kind: visualKind, payload: void 0 }
    ]), context());
    assert.deepStrictEqual({ ids: visual.contexts.map((item) => item.id), runCount, result }, {
      ids: ["first", "second", "first", "second"],
      runCount: 1,
      result: {
        outcome: OnboardingOutcome.Completed,
        shown: true,
        dismissReason: OnboardingDismissReason.Completed,
        lastStepIndex: 2,
        stepCount: 3
      }
    });
  });
  test("reports run errors and continues to the next step", async () => {
    const visualKind = `test-visual-${kindSeed++}`;
    const visual = new TestVisualStepPresentation(visualKind, /* @__PURE__ */ new Map());
    disposables.add(onboardingSequenceStepPresentationRegistry.register(visual));
    disposables.add(onboardingSequenceStepPresentationRegistry.register(new RunOnboardingStepPresentation()));
    const originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
    const errors = [];
    setUnexpectedErrorHandler((error) => errors.push(error.message));
    const presentation = disposables.add(new OnboardingSequencePresentation());
    try {
      const result = await presentation.run(createScenario([
        { id: "script", kind: RUN_ONBOARDING_STEP_KIND, payload: { run: () => {
          throw new Error("run failed");
        } } },
        { id: "visual", kind: visualKind, payload: void 0 }
      ]), context());
      assert.deepStrictEqual({ errors, ids: visual.contexts.map((item) => item.id), result }, {
        errors: ["run failed"],
        ids: ["visual"],
        result: {
          outcome: OnboardingOutcome.Completed,
          shown: true,
          dismissReason: OnboardingDismissReason.Completed,
          lastStepIndex: 1,
          stepCount: 2
        }
      });
    } finally {
      setUnexpectedErrorHandler(originalErrorHandler);
    }
  });
  test("cancels an awaited run step and aborts before later steps", async () => {
    const visualKind = `test-visual-${kindSeed++}`;
    const visual = new TestVisualStepPresentation(visualKind, /* @__PURE__ */ new Map());
    disposables.add(onboardingSequenceStepPresentationRegistry.register(visual));
    disposables.add(onboardingSequenceStepPresentationRegistry.register(new RunOnboardingStepPresentation()));
    const abort = disposables.add(new Emitter());
    let tokenCancelled = false;
    let signalStarted;
    const started = new Promise((resolve) => signalStarted = resolve);
    const presentation = disposables.add(new OnboardingSequencePresentation());
    const resultPromise = presentation.run(createScenario([
      { id: "before", kind: visualKind, payload: void 0 },
      {
        id: "script",
        kind: RUN_ONBOARDING_STEP_KIND,
        payload: {
          run: (token) => new Promise((resolve) => {
            signalStarted();
            const listener = token.onCancellationRequested(() => {
              listener.dispose();
              tokenCancelled = true;
              resolve();
            });
          })
        }
      },
      { id: "after", kind: visualKind, payload: void 0 }
    ]), context(abort.event));
    await started;
    abort.fire();
    const result = await resultPromise;
    assert.deepStrictEqual({ tokenCancelled, visualRuns: visual.contexts.map((item) => item.id), result }, {
      tokenCancelled: true,
      visualRuns: ["before"],
      result: {
        outcome: OnboardingOutcome.Aborted,
        shown: true,
        dismissReason: OnboardingDismissReason.Aborted,
        lastStepIndex: 1,
        stepCount: 3
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG9uYm9hcmRpbmdcXHRlc3RcXGJyb3dzZXJcXHNlcXVlbmNlUHJlc2VudGF0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyAkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGVycm9ySGFuZGxlciwgc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9icm93c2VyL2NvbnRleHRLZXlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RIb3N0U2VydmljZSwgVGVzdExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFJ1bk9uYm9hcmRpbmdTdGVwUHJlc2VudGF0aW9uLCBSVU5fT05CT0FSRElOR19TVEVQX0tJTkQgfSBmcm9tICcuLi8uLi9icm93c2VyL3NlcXVlbmNlL3J1bk9uYm9hcmRpbmdTdGVwLmpzJztcbmltcG9ydCB7IE9uYm9hcmRpbmdTZXF1ZW5jZVByZXNlbnRhdGlvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc2VxdWVuY2Uvc2VxdWVuY2VQcmVzZW50YXRpb24uanMnO1xuaW1wb3J0IHsgSU9uYm9hcmRpbmdUYXJnZXRPcHRpb25zLCBtYXJrT25ib2FyZGluZ1RhcmdldCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc3BvdGxpZ2h0L29uYm9hcmRpbmdUYXJnZXQuanMnO1xuaW1wb3J0IHsgU3BvdGxpZ2h0UHJlc2VudGF0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zcG90bGlnaHQvc3BvdGxpZ2h0UHJlc2VudGF0aW9uLmpzJztcbmltcG9ydCB7IElTcG90bGlnaHRTdGVwLCBTUE9UTElHSFRfUFJFU0VOVEFUSU9OX0tJTkQgfSBmcm9tICcuLi8uLi9icm93c2VyL3Nwb3RsaWdodC9zcG90bGlnaHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJT25ib2FyZGluZ1J1bkNvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vb25ib2FyZGluZ1ByZXNlbnRhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT25ib2FyZGluZ1J1blJlc3VsdCwgSU9uYm9hcmRpbmdTY2VuYXJpbywgT25ib2FyZGluZ0Rpc21pc3NSZWFzb24sIE9uYm9hcmRpbmdPdXRjb21lIH0gZnJvbSAnLi4vLi4vY29tbW9uL29uYm9hcmRpbmdTY2VuYXJpby5qcyc7XG5pbXBvcnQgeyBJT25ib2FyZGluZ1NlcXVlbmNlUGF5bG9hZCwgSU9uYm9hcmRpbmdTZXF1ZW5jZVN0ZXAsIElPbmJvYXJkaW5nU2VxdWVuY2VTdGVwQ29udGV4dCwgSU9uYm9hcmRpbmdTZXF1ZW5jZVN0ZXBQcmVzZW50YXRpb24sIElPbmJvYXJkaW5nU2VxdWVuY2VTdGVwUmVzdWx0LCBPTkJPQVJESU5HX1NFUVVFTkNFX1BSRVNFTlRBVElPTl9LSU5ELCBvbmJvYXJkaW5nU2VxdWVuY2VTdGVwUHJlc2VudGF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9jb21tb24vb25ib2FyZGluZ1NlcXVlbmNlLmpzJztcblxuY2xhc3MgVGVzdFZpc3VhbFN0ZXBQcmVzZW50YXRpb24gaW1wbGVtZW50cyBJT25ib2FyZGluZ1NlcXVlbmNlU3RlcFByZXNlbnRhdGlvbiB7XG5cdHJlYWRvbmx5IGNvdW50c0FzVmlzdWFsU3RlcCA9IHRydWU7XG5cdHJlYWRvbmx5IGNvbnRleHRzOiB7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IGluZGV4OiBudW1iZXI7IHJlYWRvbmx5IGNvdW50OiBudW1iZXI7IHJlYWRvbmx5IGNhbkdvQmFjazogYm9vbGVhbjsgcmVhZG9ubHkgaXNMYXN0OiBib29sZWFuIH1bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGtpbmQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hY3Rpb25zOiBNYXA8c3RyaW5nLCBJT25ib2FyZGluZ1NlcXVlbmNlU3RlcFJlc3VsdFtdPixcblx0KSB7IH1cblxuXHRhc3luYyBydW5TdGVwKHN0ZXA6IElPbmJvYXJkaW5nU2VxdWVuY2VTdGVwLCBjb250ZXh0OiBJT25ib2FyZGluZ1NlcXVlbmNlU3RlcENvbnRleHQpOiBQcm9taXNlPElPbmJvYXJkaW5nU2VxdWVuY2VTdGVwUmVzdWx0PiB7XG5cdFx0dGhpcy5jb250ZXh0cy5wdXNoKHtcblx0XHRcdGlkOiBzdGVwLmlkLFxuXHRcdFx0aW5kZXg6IGNvbnRleHQudmlzdWFsU3RlcEluZGV4LFxuXHRcdFx0Y291bnQ6IGNvbnRleHQudmlzdWFsU3RlcENvdW50LFxuXHRcdFx0Y2FuR29CYWNrOiBjb250ZXh0LmNhbkdvQmFjayxcblx0XHRcdGlzTGFzdDogY29udGV4dC5pc0xhc3RWaXN1YWxTdGVwLFxuXHRcdH0pO1xuXHRcdHJldHVybiB0aGlzLl9hY3Rpb25zLmdldChzdGVwLmlkKT8uc2hpZnQoKSA/PyB7IGFjdGlvbjogJ25leHQnLCBzaG93bjogdHJ1ZSB9O1xuXHR9XG59XG5cbmNsYXNzIFNlcXVlbmNlVGVzdExheW91dFNlcnZpY2UgZXh0ZW5kcyBUZXN0TGF5b3V0U2VydmljZSB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0Q29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGFpbmVyO1xuXHR9XG59XG5cbnN1aXRlKCdPbmJvYXJkaW5nU2VxdWVuY2VQcmVzZW50YXRpb24nLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCBraW5kU2VlZCA9IDA7XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2NlbmFyaW8oc3RlcHM6IHJlYWRvbmx5IElPbmJvYXJkaW5nU2VxdWVuY2VTdGVwW10pOiBJT25ib2FyZGluZ1NjZW5hcmlvPElPbmJvYXJkaW5nU2VxdWVuY2VQYXlsb2FkPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiAndGVzdC5zZXF1ZW5jZScsXG5cdFx0XHR0cmlnZ2VyOiB7IGtpbmQ6ICdhdXRvJyB9LFxuXHRcdFx0cHJlc2VudGF0aW9uOiB7XG5cdFx0XHRcdGtpbmQ6IE9OQk9BUkRJTkdfU0VRVUVOQ0VfUFJFU0VOVEFUSU9OX0tJTkQsXG5cdFx0XHRcdHBheWxvYWQ6IHsgc3RlcHMgfSxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNvbnRleHQob25BYm9ydDogRXZlbnQ8dm9pZD4gPSBFdmVudC5Ob25lKTogSU9uYm9hcmRpbmdSdW5Db250ZXh0IHtcblx0XHRyZXR1cm4geyB0YXJnZXRXaW5kb3c6IG1haW5XaW5kb3csIG9uQWJvcnQgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVNwb3RsaWdodFRhcmdldChjb250YWluZXI6IEhUTUxFbGVtZW50LCBpZDogc3RyaW5nLCBvcHRpb25zOiBJT25ib2FyZGluZ1RhcmdldE9wdGlvbnMpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gJCgnYnV0dG9uJyk7XG5cdFx0dGFyZ2V0LnN0eWxlLnBvc2l0aW9uID0gJ2ZpeGVkJztcblx0XHR0YXJnZXQuc3R5bGUubGVmdCA9ICcxMDBweCc7XG5cdFx0dGFyZ2V0LnN0eWxlLnRvcCA9ICcxMDBweCc7XG5cdFx0dGFyZ2V0LnN0eWxlLndpZHRoID0gJzEwMHB4Jztcblx0XHR0YXJnZXQuc3R5bGUuaGVpZ2h0ID0gJzMwcHgnO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0YXJnZXQpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYXJrT25ib2FyZGluZ1RhcmdldCh0YXJnZXQsIGlkLCBvcHRpb25zKSk7XG5cdFx0cmV0dXJuIHRhcmdldDtcblx0fVxuXG5cdHRlc3QoJ3JlbmRlcnMgc3BvdGxpZ2h0IGNvdW50ZXJzIHVzaW5nIG9ubHkgc3BvdGxpZ2h0IHN0ZXBzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9ICQoJy5vbmJvYXJkaW5nLXNlcXVlbmNlLXByZXNlbnRhdGlvbi10ZXN0Jyk7XG5cdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gY29udGFpbmVyLnJlbW92ZSgpIH0pO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb250ZXh0S2V5U2VydmljZShuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBzcG90bGlnaHQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNwb3RsaWdodFByZXNlbnRhdGlvbihuZXcgU2VxdWVuY2VUZXN0TGF5b3V0U2VydmljZShjb250YWluZXIpLCBuZXcgVGVzdEhvc3RTZXJ2aWNlKCksIGNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG9uYm9hcmRpbmdTZXF1ZW5jZVN0ZXBQcmVzZW50YXRpb25SZWdpc3RyeS5yZWdpc3RlcihzcG90bGlnaHQpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQob25ib2FyZGluZ1NlcXVlbmNlU3RlcFByZXNlbnRhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyKG5ldyBSdW5PbmJvYXJkaW5nU3RlcFByZXNlbnRhdGlvbigpKSk7XG5cdFx0Y29uc3QgY291bnRlcnM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgY3JlYXRlQWR2YW5jaW5nVGFyZ2V0ID0gKGlkOiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVNwb3RsaWdodFRhcmdldChjb250YWluZXIsIGlkLCB7XG5cdFx0XHRcdG9wZW46ICgpID0+IHtcblx0XHRcdFx0XHRjb3VudGVycy5wdXNoKGNvbnRhaW5lci5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdzcG90bGlnaHQtY2FsbG91dC1jb3VudGVyJylbMF0udGV4dENvbnRlbnQgPz8gJycpO1xuXHRcdFx0XHRcdHRhcmdldC5jbGljaygpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gdGFyZ2V0O1xuXHRcdH07XG5cdFx0Y3JlYXRlQWR2YW5jaW5nVGFyZ2V0KCd0ZXN0LnNlcXVlbmNlLmZpcnN0Jyk7XG5cdFx0Y3JlYXRlQWR2YW5jaW5nVGFyZ2V0KCd0ZXN0LnNlcXVlbmNlLnNlY29uZCcpO1xuXHRcdGNvbnN0IHNwb3RsaWdodFN0ZXAgPSAoaWQ6IHN0cmluZyk6IElTcG90bGlnaHRTdGVwID0+ICh7XG5cdFx0XHRpZCxcblx0XHRcdHRhcmdldElkOiBgdGVzdC5zZXF1ZW5jZS4ke2lkfWAsXG5cdFx0XHR0aXRsZTogaWQsXG5cdFx0XHRkZXNjcmlwdGlvbjogaWQsXG5cdFx0XHRvcGVuVGFyZ2V0OiB0cnVlLFxuXHRcdFx0YWR2YW5jZU9uVGFyZ2V0Q2xpY2s6IHRydWUsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBPbmJvYXJkaW5nU2VxdWVuY2VQcmVzZW50YXRpb24oKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcmVzZW50YXRpb24ucnVuKGNyZWF0ZVNjZW5hcmlvKFtcblx0XHRcdHsgaWQ6ICdmaXJzdCcsIGtpbmQ6IFNQT1RMSUdIVF9QUkVTRU5UQVRJT05fS0lORCwgcGF5bG9hZDogc3BvdGxpZ2h0U3RlcCgnZmlyc3QnKSB9LFxuXHRcdFx0eyBpZDogJ3NjcmlwdCcsIGtpbmQ6IFJVTl9PTkJPQVJESU5HX1NURVBfS0lORCwgcGF5bG9hZDogeyBydW46ICgpID0+IHVuZGVmaW5lZCB9IH0sXG5cdFx0XHR7IGlkOiAnc2Vjb25kJywga2luZDogU1BPVExJR0hUX1BSRVNFTlRBVElPTl9LSU5ELCBwYXlsb2FkOiBzcG90bGlnaHRTdGVwKCdzZWNvbmQnKSB9LFxuXHRcdF0pLCBjb250ZXh0KCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGNvdW50ZXJzLCByZXN1bHQgfSwge1xuXHRcdFx0Y291bnRlcnM6IFsnMSBvZiAyJywgJzIgb2YgMiddLFxuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdG91dGNvbWU6IE9uYm9hcmRpbmdPdXRjb21lLkNvbXBsZXRlZCxcblx0XHRcdFx0c2hvd246IHRydWUsXG5cdFx0XHRcdGRpc21pc3NSZWFzb246IE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLlRhcmdldENsaWNrLFxuXHRcdFx0XHRsYXN0U3RlcEluZGV4OiAyLFxuXHRcdFx0XHRzdGVwQ291bnQ6IDMsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3VudHMgb25seSB2aXN1YWwgc3RlcHMgd2hpbGUgcmV0YWluaW5nIHNlcXVlbmNlIGluZGljZXMgaW4gdGhlIHJlc3VsdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB2aXN1YWxLaW5kID0gYHRlc3QtdmlzdWFsLSR7a2luZFNlZWQrK31gO1xuXHRcdGNvbnN0IHZpc3VhbCA9IG5ldyBUZXN0VmlzdWFsU3RlcFByZXNlbnRhdGlvbih2aXN1YWxLaW5kLCBuZXcgTWFwKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChvbmJvYXJkaW5nU2VxdWVuY2VTdGVwUHJlc2VudGF0aW9uUmVnaXN0cnkucmVnaXN0ZXIodmlzdWFsKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG9uYm9hcmRpbmdTZXF1ZW5jZVN0ZXBQcmVzZW50YXRpb25SZWdpc3RyeS5yZWdpc3RlcihuZXcgUnVuT25ib2FyZGluZ1N0ZXBQcmVzZW50YXRpb24oKSkpO1xuXHRcdGNvbnN0IHJ1bkNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgT25ib2FyZGluZ1NlcXVlbmNlUHJlc2VudGF0aW9uKCkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJlc2VudGF0aW9uLnJ1bihjcmVhdGVTY2VuYXJpbyhbXG5cdFx0XHR7IGlkOiAnZmlyc3QnLCBraW5kOiB2aXN1YWxLaW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgaWQ6ICdzY3JpcHQnLCBraW5kOiBSVU5fT05CT0FSRElOR19TVEVQX0tJTkQsIHBheWxvYWQ6IHsgcnVuOiAoKSA9PiBydW5DYWxscy5wdXNoKCdzY3JpcHQnKSB9IH0sXG5cdFx0XHR7IGlkOiAnc2Vjb25kJywga2luZDogdmlzdWFsS2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH0sXG5cdFx0XSksIGNvbnRleHQoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgY29udGV4dHM6IHZpc3VhbC5jb250ZXh0cywgcnVuQ2FsbHMsIHJlc3VsdCB9LCB7XG5cdFx0XHRjb250ZXh0czogW1xuXHRcdFx0XHR7IGlkOiAnZmlyc3QnLCBpbmRleDogMCwgY291bnQ6IDIsIGNhbkdvQmFjazogZmFsc2UsIGlzTGFzdDogZmFsc2UgfSxcblx0XHRcdFx0eyBpZDogJ3NlY29uZCcsIGluZGV4OiAxLCBjb3VudDogMiwgY2FuR29CYWNrOiB0cnVlLCBpc0xhc3Q6IHRydWUgfSxcblx0XHRcdF0sXG5cdFx0XHRydW5DYWxsczogWydzY3JpcHQnXSxcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRvdXRjb21lOiBPbmJvYXJkaW5nT3V0Y29tZS5Db21wbGV0ZWQsXG5cdFx0XHRcdHNob3duOiB0cnVlLFxuXHRcdFx0XHRkaXNtaXNzUmVhc29uOiBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5Db21wbGV0ZWQsXG5cdFx0XHRcdGxhc3RTdGVwSW5kZXg6IDIsXG5cdFx0XHRcdHN0ZXBDb3VudDogMyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgYSB1c2VyLXZpc2libGUgcnVuIHN0ZXAgYXMgc2hvd24gd2hlbiBwcmVjZWRpbmcgdmlzdWFscyBhcmUgc2tpcHBlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB2aXN1YWxLaW5kID0gYHRlc3QtdmlzdWFsLSR7a2luZFNlZWQrK31gO1xuXHRcdGNvbnN0IHZpc3VhbCA9IG5ldyBUZXN0VmlzdWFsU3RlcFByZXNlbnRhdGlvbih2aXN1YWxLaW5kLCBuZXcgTWFwKFtcblx0XHRcdFsnc2tpcHBlZCcsIFt7IGFjdGlvbjogJ3NraXBTdGVwJywgc2hvd246IGZhbHNlIH1dXSxcblx0XHRdKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG9uYm9hcmRpbmdTZXF1ZW5jZVN0ZXBQcmVzZW50YXRpb25SZWdpc3RyeS5yZWdpc3Rlcih2aXN1YWwpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQob25ib2FyZGluZ1NlcXVlbmNlU3RlcFByZXNlbnRhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyKG5ldyBSdW5PbmJvYXJkaW5nU3RlcFByZXNlbnRhdGlvbigpKSk7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBPbmJvYXJkaW5nU2VxdWVuY2VQcmVzZW50YXRpb24oKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcmVzZW50YXRpb24ucnVuKGNyZWF0ZVNjZW5hcmlvKFtcblx0XHRcdHsgaWQ6ICdza2lwcGVkJywga2luZDogdmlzdWFsS2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IGlkOiAnc2NyaXB0Jywga2luZDogUlVOX09OQk9BUkRJTkdfU1RFUF9LSU5ELCBwYXlsb2FkOiB7IHJ1bjogKCkgPT4gKHsgc2hvd246IHRydWUgfSkgfSB9LFxuXHRcdF0pLCBjb250ZXh0KCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdG91dGNvbWU6IE9uYm9hcmRpbmdPdXRjb21lLkNvbXBsZXRlZCxcblx0XHRcdHNob3duOiB0cnVlLFxuXHRcdFx0ZGlzbWlzc1JlYXNvbjogT25ib2FyZGluZ0Rpc21pc3NSZWFzb24uQ29tcGxldGVkLFxuXHRcdFx0bGFzdFN0ZXBJbmRleDogMSxcblx0XHRcdHN0ZXBDb3VudDogMixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQmFjayBza2lwcyBydW4gc3RlcHMgYW5kIGZvcndhcmQgdHJhdmVyc2FsIHJ1bnMgdGhlbSBhdCBtb3N0IG9uY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdmlzdWFsS2luZCA9IGB0ZXN0LXZpc3VhbC0ke2tpbmRTZWVkKyt9YDtcblx0XHRjb25zdCBhY3Rpb25zID0gbmV3IE1hcDxzdHJpbmcsIElPbmJvYXJkaW5nU2VxdWVuY2VTdGVwUmVzdWx0W10+KFtcblx0XHRcdFsnZmlyc3QnLCBbeyBhY3Rpb246ICduZXh0Jywgc2hvd246IHRydWUgfSwgeyBhY3Rpb246ICduZXh0Jywgc2hvd246IHRydWUgfV1dLFxuXHRcdFx0WydzZWNvbmQnLCBbeyBhY3Rpb246ICdiYWNrJywgc2hvd246IHRydWUgfSwgeyBhY3Rpb246ICduZXh0Jywgc2hvd246IHRydWUgfV1dLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHZpc3VhbCA9IG5ldyBUZXN0VmlzdWFsU3RlcFByZXNlbnRhdGlvbih2aXN1YWxLaW5kLCBhY3Rpb25zKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQob25ib2FyZGluZ1NlcXVlbmNlU3RlcFByZXNlbnRhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyKHZpc3VhbCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChvbmJvYXJkaW5nU2VxdWVuY2VTdGVwUHJlc2VudGF0aW9uUmVnaXN0cnkucmVnaXN0ZXIobmV3IFJ1bk9uYm9hcmRpbmdTdGVwUHJlc2VudGF0aW9uKCkpKTtcblx0XHRsZXQgcnVuQ291bnQgPSAwO1xuXHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgT25ib2FyZGluZ1NlcXVlbmNlUHJlc2VudGF0aW9uKCkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJlc2VudGF0aW9uLnJ1bihjcmVhdGVTY2VuYXJpbyhbXG5cdFx0XHR7IGlkOiAnZmlyc3QnLCBraW5kOiB2aXN1YWxLaW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgaWQ6ICdzY3JpcHQnLCBraW5kOiBSVU5fT05CT0FSRElOR19TVEVQX0tJTkQsIHBheWxvYWQ6IHsgcnVuOiAoKSA9PiBydW5Db3VudCsrIH0gfSxcblx0XHRcdHsgaWQ6ICdzZWNvbmQnLCBraW5kOiB2aXN1YWxLaW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfSxcblx0XHRdKSwgY29udGV4dCgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBpZHM6IHZpc3VhbC5jb250ZXh0cy5tYXAoaXRlbSA9PiBpdGVtLmlkKSwgcnVuQ291bnQsIHJlc3VsdCB9LCB7XG5cdFx0XHRpZHM6IFsnZmlyc3QnLCAnc2Vjb25kJywgJ2ZpcnN0JywgJ3NlY29uZCddLFxuXHRcdFx0cnVuQ291bnQ6IDEsXG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0b3V0Y29tZTogT25ib2FyZGluZ091dGNvbWUuQ29tcGxldGVkLFxuXHRcdFx0XHRzaG93bjogdHJ1ZSxcblx0XHRcdFx0ZGlzbWlzc1JlYXNvbjogT25ib2FyZGluZ0Rpc21pc3NSZWFzb24uQ29tcGxldGVkLFxuXHRcdFx0XHRsYXN0U3RlcEluZGV4OiAyLFxuXHRcdFx0XHRzdGVwQ291bnQ6IDMsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBvcnRzIHJ1biBlcnJvcnMgYW5kIGNvbnRpbnVlcyB0byB0aGUgbmV4dCBzdGVwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZpc3VhbEtpbmQgPSBgdGVzdC12aXN1YWwtJHtraW5kU2VlZCsrfWA7XG5cdFx0Y29uc3QgdmlzdWFsID0gbmV3IFRlc3RWaXN1YWxTdGVwUHJlc2VudGF0aW9uKHZpc3VhbEtpbmQsIG5ldyBNYXAoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG9uYm9hcmRpbmdTZXF1ZW5jZVN0ZXBQcmVzZW50YXRpb25SZWdpc3RyeS5yZWdpc3Rlcih2aXN1YWwpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQob25ib2FyZGluZ1NlcXVlbmNlU3RlcFByZXNlbnRhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyKG5ldyBSdW5PbmJvYXJkaW5nU3RlcFByZXNlbnRhdGlvbigpKSk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxFcnJvckhhbmRsZXIgPSBlcnJvckhhbmRsZXIuZ2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigpO1xuXHRcdGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcblx0XHRzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKGVycm9yID0+IGVycm9ycy5wdXNoKGVycm9yLm1lc3NhZ2UpKTtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE9uYm9hcmRpbmdTZXF1ZW5jZVByZXNlbnRhdGlvbigpKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcmVzZW50YXRpb24ucnVuKGNyZWF0ZVNjZW5hcmlvKFtcblx0XHRcdFx0eyBpZDogJ3NjcmlwdCcsIGtpbmQ6IFJVTl9PTkJPQVJESU5HX1NURVBfS0lORCwgcGF5bG9hZDogeyBydW46ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdydW4gZmFpbGVkJyk7IH0gfSB9LFxuXHRcdFx0XHR7IGlkOiAndmlzdWFsJywga2luZDogdmlzdWFsS2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH0sXG5cdFx0XHRdKSwgY29udGV4dCgpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGVycm9ycywgaWRzOiB2aXN1YWwuY29udGV4dHMubWFwKGl0ZW0gPT4gaXRlbS5pZCksIHJlc3VsdCB9LCB7XG5cdFx0XHRcdGVycm9yczogWydydW4gZmFpbGVkJ10sXG5cdFx0XHRcdGlkczogWyd2aXN1YWwnXSxcblx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0b3V0Y29tZTogT25ib2FyZGluZ091dGNvbWUuQ29tcGxldGVkLFxuXHRcdFx0XHRcdHNob3duOiB0cnVlLFxuXHRcdFx0XHRcdGRpc21pc3NSZWFzb246IE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLkNvbXBsZXRlZCxcblx0XHRcdFx0XHRsYXN0U3RlcEluZGV4OiAxLFxuXHRcdFx0XHRcdHN0ZXBDb3VudDogMixcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdpbmFsRXJyb3JIYW5kbGVyKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbHMgYW4gYXdhaXRlZCBydW4gc3RlcCBhbmQgYWJvcnRzIGJlZm9yZSBsYXRlciBzdGVwcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB2aXN1YWxLaW5kID0gYHRlc3QtdmlzdWFsLSR7a2luZFNlZWQrK31gO1xuXHRcdGNvbnN0IHZpc3VhbCA9IG5ldyBUZXN0VmlzdWFsU3RlcFByZXNlbnRhdGlvbih2aXN1YWxLaW5kLCBuZXcgTWFwKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChvbmJvYXJkaW5nU2VxdWVuY2VTdGVwUHJlc2VudGF0aW9uUmVnaXN0cnkucmVnaXN0ZXIodmlzdWFsKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG9uYm9hcmRpbmdTZXF1ZW5jZVN0ZXBQcmVzZW50YXRpb25SZWdpc3RyeS5yZWdpc3RlcihuZXcgUnVuT25ib2FyZGluZ1N0ZXBQcmVzZW50YXRpb24oKSkpO1xuXHRcdGNvbnN0IGFib3J0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGxldCB0b2tlbkNhbmNlbGxlZCA9IGZhbHNlO1xuXHRcdGxldCBzaWduYWxTdGFydGVkITogKCkgPT4gdm9pZDtcblx0XHRjb25zdCBzdGFydGVkID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBzaWduYWxTdGFydGVkID0gcmVzb2x2ZSk7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBPbmJvYXJkaW5nU2VxdWVuY2VQcmVzZW50YXRpb24oKSk7XG5cblx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gcHJlc2VudGF0aW9uLnJ1bihjcmVhdGVTY2VuYXJpbyhbXG5cdFx0XHR7IGlkOiAnYmVmb3JlJywga2luZDogdmlzdWFsS2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnc2NyaXB0Jyxcblx0XHRcdFx0a2luZDogUlVOX09OQk9BUkRJTkdfU1RFUF9LSU5ELFxuXHRcdFx0XHRwYXlsb2FkOiB7XG5cdFx0XHRcdFx0cnVuOiAodG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRcdHNpZ25hbFN0YXJ0ZWQoKTtcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3RlbmVyID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdHRva2VuQ2FuY2VsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0eyBpZDogJ2FmdGVyJywga2luZDogdmlzdWFsS2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH0sXG5cdFx0XSksIGNvbnRleHQoYWJvcnQuZXZlbnQpKTtcblx0XHRhd2FpdCBzdGFydGVkO1xuXHRcdGFib3J0LmZpcmUoKTtcblx0XHRjb25zdCByZXN1bHQ6IElPbmJvYXJkaW5nUnVuUmVzdWx0ID0gYXdhaXQgcmVzdWx0UHJvbWlzZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyB0b2tlbkNhbmNlbGxlZCwgdmlzdWFsUnVuczogdmlzdWFsLmNvbnRleHRzLm1hcChpdGVtID0+IGl0ZW0uaWQpLCByZXN1bHQgfSwge1xuXHRcdFx0dG9rZW5DYW5jZWxsZWQ6IHRydWUsXG5cdFx0XHR2aXN1YWxSdW5zOiBbJ2JlZm9yZSddLFxuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdG91dGNvbWU6IE9uYm9hcmRpbmdPdXRjb21lLkFib3J0ZWQsXG5cdFx0XHRcdHNob3duOiB0cnVlLFxuXHRcdFx0XHRkaXNtaXNzUmVhc29uOiBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5BYm9ydGVkLFxuXHRcdFx0XHRsYXN0U3RlcEluZGV4OiAxLFxuXHRcdFx0XHRzdGVwQ291bnQ6IDMsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsU0FBUztBQUNsQixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGNBQWMsaUNBQWlDO0FBQ3hELFNBQVMsK0NBQStDO0FBQ3hELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsaUJBQWlCLHlCQUF5QjtBQUNuRCxTQUFTLCtCQUErQixnQ0FBZ0M7QUFDeEUsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBbUMsNEJBQTRCO0FBQy9ELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXlCLG1DQUFtQztBQUU1RCxTQUFvRCx5QkFBeUIseUJBQXlCO0FBQ3RHLFNBQWtLLHVDQUF1QyxrREFBa0Q7QUFFM1AsTUFBTSwyQkFBMEU7QUFBQSxFQUkvRSxZQUNVLE1BQ1EsVUFDaEI7QUFGUTtBQUNRO0FBTGxCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsV0FBNkksQ0FBQztBQUFBLEVBS25KO0FBQUEsRUFFSixNQUFNLFFBQVEsTUFBK0IsU0FBaUY7QUFDN0gsU0FBSyxTQUFTLEtBQUs7QUFBQSxNQUNsQixJQUFJLEtBQUs7QUFBQSxNQUNULE9BQU8sUUFBUTtBQUFBLE1BQ2YsT0FBTyxRQUFRO0FBQUEsTUFD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
