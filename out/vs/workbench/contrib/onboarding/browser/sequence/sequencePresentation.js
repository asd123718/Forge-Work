import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { onUnexpectedError } from "../../../../../base/common/errors.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { OnboardingDismissReason, OnboardingOutcome } from "../../common/onboardingScenario.js";
import { ONBOARDING_SEQUENCE_PRESENTATION_KIND, onboardingSequenceStepPresentationRegistry } from "../../common/onboardingSequence.js";
class OnboardingSequencePresentation extends Disposable {
  constructor() {
    super(...arguments);
    this.kind = ONBOARDING_SEQUENCE_PRESENTATION_KIND;
  }
  async run(scenario, context) {
    const steps = scenario.presentation.payload?.steps ?? [];
    if (steps.length === 0) {
      return { outcome: OnboardingOutcome.Completed, shown: false, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 0, stepCount: 0 };
    }
    const store = new DisposableStore();
    try {
      const cancellation = store.add(new CancellationTokenSource());
      store.add(context.onAbort(() => cancellation.cancel()));
      const skippedVisualSteps = /* @__PURE__ */ new Set();
      const shownVisualSteps = /* @__PURE__ */ new Set();
      const executedRunOnceSteps = /* @__PURE__ */ new Set();
      const visualStepCount = steps.reduce((count, step) => count + (this._presentation(step)?.countsAsVisualStep ? 1 : 0), 0);
      let index = 0;
      let direction = 1;
      let shown = false;
      let lastStepIndex = 0;
      let dismissReason = OnboardingDismissReason.Completed;
      while (index >= 0 && index < steps.length && !cancellation.token.isCancellationRequested) {
        const step = steps[index];
        const presentation = this._presentation(step);
        if (!presentation) {
          onUnexpectedError(new Error(`No onboarding sequence step presentation registered for '${step.kind}'.`));
          return { outcome: OnboardingOutcome.Aborted, shown, dismissReason: OnboardingDismissReason.Aborted, lastStepIndex, stepCount: steps.length };
        }
        if (!presentation.countsAsVisualStep && direction === -1) {
          index--;
          continue;
        }
        if (presentation.runOnce && executedRunOnceSteps.has(index)) {
          index += direction;
          continue;
        }
        if (presentation.runOnce) {
          executedRunOnceSteps.add(index);
        }
        if (presentation.countsAsVisualStep) {
          skippedVisualSteps.delete(index);
        }
        const visualStepIndex = this._visualStepIndex(steps, index, skippedVisualSteps);
        const currentVisualStepCount = visualStepCount - skippedVisualSteps.size;
        if (!presentation.countsAsVisualStep) {
          lastStepIndex = Math.max(lastStepIndex, index);
        }
        const result = await presentation.runStep(step, {
          ...context,
          cancellationToken: cancellation.token,
          stepIndex: index,
          visualStepIndex,
          visualStepCount: currentVisualStepCount,
          canGoBack: Array.from(shownVisualSteps).some((stepIndex) => stepIndex < index),
          isLastVisualStep: visualStepIndex === currentVisualStepCount - 1
        });
        if (cancellation.token.isCancellationRequested || result.action === "abort") {
          return { outcome: OnboardingOutcome.Aborted, shown, dismissReason: OnboardingDismissReason.Aborted, lastStepIndex, stepCount: steps.length };
        }
        if (result.shown) {
          shown = true;
          lastStepIndex = Math.max(lastStepIndex, index);
          if (presentation.countsAsVisualStep) {
            shownVisualSteps.add(index);
          }
        }
        switch (result.action) {
          case "next":
            dismissReason = result.dismissReason ?? dismissReason;
            direction = 1;
            index++;
            break;
          case "back":
            direction = -1;
            index--;
            break;
          case "skipStep":
            if (presentation.countsAsVisualStep) {
              skippedVisualSteps.add(index);
            }
            index += direction;
            break;
          case "skipSequence":
            return {
              outcome: OnboardingOutcome.Skipped,
              shown,
              dismissReason: result.dismissReason ?? OnboardingDismissReason.SkipButton,
              lastStepIndex,
              stepCount: steps.length
            };
        }
      }
      return cancellation.token.isCancellationRequested ? { outcome: OnboardingOutcome.Aborted, shown, dismissReason: OnboardingDismissReason.Aborted, lastStepIndex, stepCount: steps.length } : { outcome: OnboardingOutcome.Completed, shown, dismissReason, lastStepIndex, stepCount: steps.length };
    } finally {
      store.dispose();
    }
  }
  _presentation(step) {
    return onboardingSequenceStepPresentationRegistry.get(step.kind);
  }
  _visualStepIndex(steps, index, skippedVisualSteps) {
    let visualStepIndex = 0;
    for (let stepIndex = 0; stepIndex < index; stepIndex++) {
      if (this._presentation(steps[stepIndex])?.countsAsVisualStep && !skippedVisualSteps.has(stepIndex)) {
        visualStepIndex++;
      }
    }
    return visualStepIndex;
  }
}
export {
  OnboardingSequencePresentation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG9uYm9hcmRpbmdcXGJyb3dzZXJcXHNlcXVlbmNlXFxzZXF1ZW5jZVByZXNlbnRhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT25ib2FyZGluZ1ByZXNlbnRhdGlvbiwgSU9uYm9hcmRpbmdSdW5Db250ZXh0IH0gZnJvbSAnLi4vLi4vY29tbW9uL29uYm9hcmRpbmdQcmVzZW50YXRpb24uanMnO1xuaW1wb3J0IHsgSU9uYm9hcmRpbmdSdW5SZXN1bHQsIElPbmJvYXJkaW5nU2NlbmFyaW8sIE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLCBPbmJvYXJkaW5nT3V0Y29tZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9vbmJvYXJkaW5nU2NlbmFyaW8uanMnO1xuaW1wb3J0IHsgSU9uYm9hcmRpbmdTZXF1ZW5jZVBheWxvYWQsIElPbmJvYXJkaW5nU2VxdWVuY2VTdGVwLCBJT25ib2FyZGluZ1NlcXVlbmNlU3RlcFByZXNlbnRhdGlvbiwgT05CT0FSRElOR19TRVFVRU5DRV9QUkVTRU5UQVRJT05fS0lORCwgb25ib2FyZGluZ1NlcXVlbmNlU3RlcFByZXNlbnRhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL29uYm9hcmRpbmdTZXF1ZW5jZS5qcyc7XG5cbi8qKiBSdW5zIGEgaGV0ZXJvZ2VuZW91cyBzZXF1ZW5jZSB3aGlsZSBsZWF2aW5nIGVhY2ggc3RlcCdzIHJlbmRlcmluZyB0byBpdHMgcmVnaXN0ZXJlZCBraW5kLiAqL1xuZXhwb3J0IGNsYXNzIE9uYm9hcmRpbmdTZXF1ZW5jZVByZXNlbnRhdGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJT25ib2FyZGluZ1ByZXNlbnRhdGlvbiB7XG5cdHJlYWRvbmx5IGtpbmQgPSBPTkJPQVJESU5HX1NFUVVFTkNFX1BSRVNFTlRBVElPTl9LSU5EO1xuXG5cdGFzeW5jIHJ1bihzY2VuYXJpbzogSU9uYm9hcmRpbmdTY2VuYXJpbywgY29udGV4dDogSU9uYm9hcmRpbmdSdW5Db250ZXh0KTogUHJvbWlzZTxJT25ib2FyZGluZ1J1blJlc3VsdD4ge1xuXHRcdGNvbnN0IHN0ZXBzID0gKHNjZW5hcmlvLnByZXNlbnRhdGlvbi5wYXlsb2FkIGFzIElPbmJvYXJkaW5nU2VxdWVuY2VQYXlsb2FkKT8uc3RlcHMgPz8gW107XG5cdFx0aWYgKHN0ZXBzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHsgb3V0Y29tZTogT25ib2FyZGluZ091dGNvbWUuQ29tcGxldGVkLCBzaG93bjogZmFsc2UsIGRpc21pc3NSZWFzb246IE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLkNvbXBsZXRlZCwgbGFzdFN0ZXBJbmRleDogMCwgc3RlcENvdW50OiAwIH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNhbmNlbGxhdGlvbiA9IHN0b3JlLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0XHRzdG9yZS5hZGQoY29udGV4dC5vbkFib3J0KCgpID0+IGNhbmNlbGxhdGlvbi5jYW5jZWwoKSkpO1xuXHRcdFx0Y29uc3Qgc2tpcHBlZFZpc3VhbFN0ZXBzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0XHRjb25zdCBzaG93blZpc3VhbFN0ZXBzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0XHRjb25zdCBleGVjdXRlZFJ1bk9uY2VTdGVwcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRcdFx0Y29uc3QgdmlzdWFsU3RlcENvdW50ID0gc3RlcHMucmVkdWNlKChjb3VudCwgc3RlcCkgPT4gY291bnQgKyAodGhpcy5fcHJlc2VudGF0aW9uKHN0ZXApPy5jb3VudHNBc1Zpc3VhbFN0ZXAgPyAxIDogMCksIDApO1xuXHRcdFx0bGV0IGluZGV4ID0gMDtcblx0XHRcdGxldCBkaXJlY3Rpb246IDEgfCAtMSA9IDE7XG5cdFx0XHRsZXQgc2hvd24gPSBmYWxzZTtcblx0XHRcdGxldCBsYXN0U3RlcEluZGV4ID0gMDtcblx0XHRcdGxldCBkaXNtaXNzUmVhc29uID0gT25ib2FyZGluZ0Rpc21pc3NSZWFzb24uQ29tcGxldGVkO1xuXG5cdFx0XHR3aGlsZSAoaW5kZXggPj0gMCAmJiBpbmRleCA8IHN0ZXBzLmxlbmd0aCAmJiAhY2FuY2VsbGF0aW9uLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdGNvbnN0IHN0ZXAgPSBzdGVwc1tpbmRleF07XG5cdFx0XHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IHRoaXMuX3ByZXNlbnRhdGlvbihzdGVwKTtcblx0XHRcdFx0aWYgKCFwcmVzZW50YXRpb24pIHtcblx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihuZXcgRXJyb3IoYE5vIG9uYm9hcmRpbmcgc2VxdWVuY2Ugc3RlcCBwcmVzZW50YXRpb24gcmVnaXN0ZXJlZCBmb3IgJyR7c3RlcC5raW5kfScuYCkpO1xuXHRcdFx0XHRcdHJldHVybiB7IG91dGNvbWU6IE9uYm9hcmRpbmdPdXRjb21lLkFib3J0ZWQsIHNob3duLCBkaXNtaXNzUmVhc29uOiBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5BYm9ydGVkLCBsYXN0U3RlcEluZGV4LCBzdGVwQ291bnQ6IHN0ZXBzLmxlbmd0aCB9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFwcmVzZW50YXRpb24uY291bnRzQXNWaXN1YWxTdGVwICYmIGRpcmVjdGlvbiA9PT0gLTEpIHtcblx0XHRcdFx0XHRpbmRleC0tO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwcmVzZW50YXRpb24ucnVuT25jZSAmJiBleGVjdXRlZFJ1bk9uY2VTdGVwcy5oYXMoaW5kZXgpKSB7XG5cdFx0XHRcdFx0aW5kZXggKz0gZGlyZWN0aW9uO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwcmVzZW50YXRpb24ucnVuT25jZSkge1xuXHRcdFx0XHRcdGV4ZWN1dGVkUnVuT25jZVN0ZXBzLmFkZChpbmRleCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHByZXNlbnRhdGlvbi5jb3VudHNBc1Zpc3VhbFN0ZXApIHtcblx0XHRcdFx0XHRza2lwcGVkVmlzdWFsU3RlcHMuZGVsZXRlKGluZGV4KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHZpc3VhbFN0ZXBJbmRleCA9IHRoaXMuX3Zpc3VhbFN0ZXBJbmRleChzdGVwcywgaW5kZXgsIHNraXBwZWRWaXN1YWxTdGVwcyk7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRWaXN1YWxTdGVwQ291bnQgPSB2aXN1YWxTdGVwQ291bnQgLSBza2lwcGVkVmlzdWFsU3RlcHMuc2l6ZTtcblx0XHRcdFx0aWYgKCFwcmVzZW50YXRpb24uY291bnRzQXNWaXN1YWxTdGVwKSB7XG5cdFx0XHRcdFx0bGFzdFN0ZXBJbmRleCA9IE1hdGgubWF4KGxhc3RTdGVwSW5kZXgsIGluZGV4KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcmVzZW50YXRpb24ucnVuU3RlcChzdGVwLCB7XG5cdFx0XHRcdFx0Li4uY29udGV4dCxcblx0XHRcdFx0XHRjYW5jZWxsYXRpb25Ub2tlbjogY2FuY2VsbGF0aW9uLnRva2VuLFxuXHRcdFx0XHRcdHN0ZXBJbmRleDogaW5kZXgsXG5cdFx0XHRcdFx0dmlzdWFsU3RlcEluZGV4LFxuXHRcdFx0XHRcdHZpc3VhbFN0ZXBDb3VudDogY3VycmVudFZpc3VhbFN0ZXBDb3VudCxcblx0XHRcdFx0XHRjYW5Hb0JhY2s6IEFycmF5LmZyb20oc2hvd25WaXN1YWxTdGVwcykuc29tZShzdGVwSW5kZXggPT4gc3RlcEluZGV4IDwgaW5kZXgpLFxuXHRcdFx0XHRcdGlzTGFzdFZpc3VhbFN0ZXA6IHZpc3VhbFN0ZXBJbmRleCA9PT0gY3VycmVudFZpc3VhbFN0ZXBDb3VudCAtIDEsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoY2FuY2VsbGF0aW9uLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8IHJlc3VsdC5hY3Rpb24gPT09ICdhYm9ydCcpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBvdXRjb21lOiBPbmJvYXJkaW5nT3V0Y29tZS5BYm9ydGVkLCBzaG93biwgZGlzbWlzc1JlYXNvbjogT25ib2FyZGluZ0Rpc21pc3NSZWFzb24uQWJvcnRlZCwgbGFzdFN0ZXBJbmRleCwgc3RlcENvdW50OiBzdGVwcy5sZW5ndGggfTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChyZXN1bHQuc2hvd24pIHtcblx0XHRcdFx0XHRzaG93biA9IHRydWU7XG5cdFx0XHRcdFx0bGFzdFN0ZXBJbmRleCA9IE1hdGgubWF4KGxhc3RTdGVwSW5kZXgsIGluZGV4KTtcblx0XHRcdFx0XHRpZiAocHJlc2VudGF0aW9uLmNvdW50c0FzVmlzdWFsU3RlcCkge1xuXHRcdFx0XHRcdFx0c2hvd25WaXN1YWxTdGVwcy5hZGQoaW5kZXgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHN3aXRjaCAocmVzdWx0LmFjdGlvbikge1xuXHRcdFx0XHRcdGNhc2UgJ25leHQnOlxuXHRcdFx0XHRcdFx0ZGlzbWlzc1JlYXNvbiA9IHJlc3VsdC5kaXNtaXNzUmVhc29uID8/IGRpc21pc3NSZWFzb247XG5cdFx0XHRcdFx0XHRkaXJlY3Rpb24gPSAxO1xuXHRcdFx0XHRcdFx0aW5kZXgrKztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2JhY2snOlxuXHRcdFx0XHRcdFx0ZGlyZWN0aW9uID0gLTE7XG5cdFx0XHRcdFx0XHRpbmRleC0tO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnc2tpcFN0ZXAnOlxuXHRcdFx0XHRcdFx0aWYgKHByZXNlbnRhdGlvbi5jb3VudHNBc1Zpc3VhbFN0ZXApIHtcblx0XHRcdFx0XHRcdFx0c2tpcHBlZFZpc3VhbFN0ZXBzLmFkZChpbmRleCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpbmRleCArPSBkaXJlY3Rpb247XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdza2lwU2VxdWVuY2UnOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0b3V0Y29tZTogT25ib2FyZGluZ091dGNvbWUuU2tpcHBlZCxcblx0XHRcdFx0XHRcdFx0c2hvd24sXG5cdFx0XHRcdFx0XHRcdGRpc21pc3NSZWFzb246IHJlc3VsdC5kaXNtaXNzUmVhc29uID8/IE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLlNraXBCdXR0b24sXG5cdFx0XHRcdFx0XHRcdGxhc3RTdGVwSW5kZXgsXG5cdFx0XHRcdFx0XHRcdHN0ZXBDb3VudDogc3RlcHMubGVuZ3RoLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gY2FuY2VsbGF0aW9uLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkXG5cdFx0XHRcdD8geyBvdXRjb21lOiBPbmJvYXJkaW5nT3V0Y29tZS5BYm9ydGVkLCBzaG93biwgZGlzbWlzc1JlYXNvbjogT25ib2FyZGluZ0Rpc21pc3NSZWFzb24uQWJvcnRlZCwgbGFzdFN0ZXBJbmRleCwgc3RlcENvdW50OiBzdGVwcy5sZW5ndGggfVxuXHRcdFx0XHQ6IHsgb3V0Y29tZTogT25ib2FyZGluZ091dGNvbWUuQ29tcGxldGVkLCBzaG93biwgZGlzbWlzc1JlYXNvbiwgbGFzdFN0ZXBJbmRleCwgc3RlcENvdW50OiBzdGVwcy5sZW5ndGggfTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3ByZXNlbnRhdGlvbihzdGVwOiBJT25ib2FyZGluZ1NlcXVlbmNlU3RlcCk6IElPbmJvYXJkaW5nU2VxdWVuY2VTdGVwUHJlc2VudGF0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gb25ib2FyZGluZ1NlcXVlbmNlU3RlcFByZXNlbnRhdGlvblJlZ2lzdHJ5LmdldChzdGVwLmtpbmQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdmlzdWFsU3RlcEluZGV4KHN0ZXBzOiByZWFkb25seSBJT25ib2FyZGluZ1NlcXVlbmNlU3RlcFtdLCBpbmRleDogbnVtYmVyLCBza2lwcGVkVmlzdWFsU3RlcHM6IFJlYWRvbmx5U2V0PG51bWJlcj4pOiBudW1iZXIge1xuXHRcdGxldCB2aXN1YWxTdGVwSW5kZXggPSAwO1xuXHRcdGZvciAobGV0IHN0ZXBJbmRleCA9IDA7IHN0ZXBJbmRleCA8IGluZGV4OyBzdGVwSW5kZXgrKykge1xuXHRcdFx0aWYgKHRoaXMuX3ByZXNlbnRhdGlvbihzdGVwc1tzdGVwSW5kZXhdKT8uY291bnRzQXNWaXN1YWxTdGVwICYmICFza2lwcGVkVmlzdWFsU3RlcHMuaGFzKHN0ZXBJbmRleCkpIHtcblx0XHRcdFx0dmlzdWFsU3RlcEluZGV4Kys7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB2aXN1YWxTdGVwSW5kZXg7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsWUFBWSx1QkFBdUI7QUFFNUMsU0FBb0QseUJBQXlCLHlCQUF5QjtBQUN0RyxTQUFtRyx1Q0FBdUMsa0RBQWtEO0FBR3JMLE1BQU0sdUNBQXVDLFdBQThDO0FBQUEsRUFBM0Y7QUFBQTtBQUNOLFNBQVMsT0FBTztBQUFBO0FBQUEsRUFFaEIsTUFBTSxJQUFJLFVBQStCLFNBQStEO0FBQ3ZHLFVBQU0sUUFBUyxTQUFTLGFBQWEsU0FBd0MsU0FBUyxDQUFDO0FBQ3ZGLFFBQUksTUFBTSxXQUFXLEdBQUc7QUFDdkIsYUFBTyxFQUFFLFNBQVMsa0JBQWtCLFdBQVcsT0FBTyxPQUFPLGVBQWUsd0JBQXdCLFdBQVcsZUFBZSxHQUFHLFdBQVcsRUFBRTtBQUFBLElBQy9JO0FBRUEsVUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLFFBQUk7QUFDSCxZQUFNLGVBQWUsTUFBTSxJQUFJLElBQUksd0JBQXdCLENBQUM7QUFDNUQsWUFBTSxJQUFJLFFBQVEsUUFBUSxNQUFNLGFBQWEsT0FBTyxDQUFDLENBQUM7QUFDdEQsWUFBTSxxQkFBcUIsb0JBQUksSUFBWTtBQUMzQyxZQUFNLG1CQUFtQixvQkFBSSxJQUFZO0FBQ3pDLFlBQU0sdUJBQXVCLG9CQUFJLElBQVk7QUFDN0MsWUFBTSxrQkFBa0IsTUFBTSxPQUFPLENBQUMsT0FBTyxTQUFTLFNBQVMsS0FBSyxjQUFjLElBQUksR0FBRyxxQkFBcUIsSUFBSSxJQUFJLENBQUM7QUFDdkgsVUFBSSxRQUFRO0FBQ1osVUFBSSxZQUFvQjtBQUN4QixVQUFJLFFBQVE7QUFDWixVQUFJLGdCQUFnQjtBQUNwQixVQUFJLGdCQUFnQix3QkFBd0I7QUFFNUMsYUFBTyxTQUFTLEtBQUssUUFBUSxNQUFNLFVBQVUsQ0FBQyxhQUFhLE1BQU0seUJBQXlCO0FBQ3pGLGNBQU0sT0FBTyxNQUFNLEtBQUs7QUFDeEIsY0FBTSxlQUFlLEtBQUssY0FBYyxJQUFJO0FBQzVDLFlBQUksQ0FBQyxjQUFjO0FBQ2xCLDRCQUFrQixJQUFJLE1BQU0sNERBQTRELEtBQUssSUFBSSxJQUFJLENBQUM7QUFDdEcsaUJBQU8sRUFBRSxTQUFTLGtCQUFrQixTQUFTLE9BQU8sZUFBZSx3QkFBd0IsU0FBUyxlQUFlLFdBQVcsTUFBTSxPQUFPO0FBQUEsUUFDNUk7QUFFQSxZQUFJLENBQUMsYUFBYSxzQkFBc0IsY0FBYyxJQUFJO0FBQ3pEO0FBQ0E7QUFBQSxRQUNEO0FBQ0EsWUFBSSxhQUFhLFdBQVcscUJBQXFCLElBQUksS0FBSyxHQUFHO0FBQzVELG1CQUFTO0FBQ1Q7QUFBQSxRQUNEO0FBQ0EsWUFBSSxhQUFhLFNBQVM7QUFDekIsK0JBQXFCLElBQUksS0FBSztBQUFBLFFBQy9CO0FBQ0EsWUFBSSxhQUFhLG9CQUFvQjtBQUNwQyw2QkFBbUIsT0FBTyxLQUFLO0FBQUEsUUFDaEM7QUFFQSxjQUFNLGtCQUFrQixLQUFLLGlCQUFpQixPQUFPLE9BQU8sa0JBQWtCO0FBQzlFLGNBQU0seUJBQXlCLGtCQUFrQixtQkFBbUI7QUFDcEUsWUFBSSxDQUFDLGFBQWEsb0JBQW9CO0FBQ3JDLDBCQUFnQixLQUFLLElBQUksZUFBZSxLQUFLO0FBQUEsUUFDOUM7QUFDQSxjQUFNLFNBQVMsTUFBTSxhQUFhLFFBQVEsTUFBTTtBQUFBLFVBQy9DLEdBQUc7QUFBQSxVQUNILG1CQUFtQixhQUFhO0FBQUEsVUFDaEMsV0FBVztBQUFBLFVBQ1g7QUFBQSxVQUNBLGlCQUFpQjtBQUFBLFVBQ2pCLFdBQVcsTUFBTSxLQUFLLGdCQUFnQixFQUFFLEtBQUssZUFBYSxZQUFZLEtBQUs7QUFBQSxVQUMzRSxrQkFBa0Isb0JBQW9CLHlCQUF5QjtBQUFBLFFBQ2hFLENBQUM7QUFDRCxZQUFJLGFBQWEsTUFBTSwyQkFBMkIsT0FBTyxXQUFXLFNBQVM7QUFDNUUsaUJBQU8sRUFBRSxTQUFTLGtCQUFrQixTQUFTLE9BQU8sZUFBZSx3QkFBd0IsU0FBUyxlQUFlLFdBQVcsTUFBTSxPQUFPO0FBQUEsUUFDNUk7QUFFQSxZQUFJLE9BQU8sT0FBTztBQUNqQixrQkFBUTtBQUNSLDBCQUFnQixLQUFLLElBQUksZUFBZSxLQUFLO0FBQzdDLGNBQUksYUFBYSxvQkFBb0I7QUFDcEMsNkJBQWlCLElBQUksS0FBSztBQUFBLFVBQzNCO0FBQUEsUUFDRDtBQUVBLGdCQUFRLE9BQU8sUUFBUTtBQUFBLFVBQ3RCLEtBQUs7QUFDSiw0QkFBZ0IsT0FBTyxpQkFBaUI7QUFDeEMsd0JBQVk7QUFDWjtBQUNBO0FBQUEsVUFDRCxLQUFLO0FBQ0osd0JBQVk7QUFDWjtBQUNBO0FBQUEsVUFDRCxLQUFLO0FBQ0osZ0JBQUksYUFBYSxvQkFBb0I7QUFDcEMsaUNBQW1CLElBQUksS0FBSztBQUFBLFlBQzdCO0FBQ0EscUJBQVM7QUFDVDtBQUFBLFVBQ0QsS0FBSztBQUNKLG1CQUFPO0FBQUEsY0FDTixTQUFTLGtCQUFrQjtBQUFBLGNBQzNCO0FBQUEsY0FDQSxlQUFlLE9BQU8saUJBQWlCLHdCQUF3QjtBQUFBLGNBQy9EO0FBQUEsY0FDQSxXQUFXLE1BQU07QUFBQSxZQUNsQjtBQUFBLFFBQ0Y7QUFBQSxNQUNEO0FBRUEsYUFBTyxhQUFhLE1BQU0sMEJBQ3ZCLEVBQUUsU0FBUyxrQkFBa0IsU0FBUyxPQUFPLGVBQWUsd0JBQXdCLFNBQVMsZUFBZSxXQUFXLE1BQU0sT0FBTyxJQUNwSSxFQUFFLFNBQVMsa0JBQWtCLFdBQVcsT0FBTyxlQUFlLGVBQWUsV0FBVyxNQUFNLE9BQU87QUFBQSxJQUN6RyxVQUFFO0FBQ0QsWUFBTSxRQUFRO0FBQUEsSUFDZjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGNBQWMsTUFBZ0Y7QUFDckcsV0FBTywyQ0FBMkMsSUFBSSxLQUFLLElBQUk7QUFBQSxFQUNoRTtBQUFBLEVBRVEsaUJBQWlCLE9BQTJDLE9BQWUsb0JBQWlEO0FBQ25JLFFBQUksa0JBQWtCO0FBQ3RCLGFBQVMsWUFBWSxHQUFHLFlBQVksT0FBTyxhQUFhO0FBQ3ZELFVBQUksS0FBSyxjQUFjLE1BQU0sU0FBUyxDQUFDLEdBQUcsc0JBQXNCLENBQUMsbUJBQW1CLElBQUksU0FBUyxHQUFHO0FBQ25HO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
