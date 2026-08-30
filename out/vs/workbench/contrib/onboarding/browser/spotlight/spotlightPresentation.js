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
import { timeout } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { onUnexpectedError } from "../../../../../base/common/errors.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IWorkbenchLayoutService } from "../../../../services/layout/browser/layoutService.js";
import { IHostService } from "../../../../services/host/browser/host.js";
import { OnboardingDismissReason, OnboardingOutcome } from "../../common/onboardingScenario.js";
import { findOnboardingTarget, openOnboardingTarget } from "./onboardingTarget.js";
import { SpotlightOverlay } from "./spotlightOverlay.js";
import { SPOTLIGHT_PRESENTATION_KIND } from "./spotlightTypes.js";
const TARGET_RESOLVE_TIMEOUT = 2e3;
const TARGET_POLL_INTERVAL = 50;
const TARGET_ANIMATION_SETTLE_TIMEOUT = 600;
let SpotlightPresentation = class extends Disposable {
  constructor(layoutService, hostService, contextKeyService) {
    super();
    this.layoutService = layoutService;
    this.hostService = hostService;
    this.contextKeyService = contextKeyService;
    this.kind = SPOTLIGHT_PRESENTATION_KIND;
    this.countsAsVisualStep = true;
  }
  async run(scenario, context) {
    const payload = scenario.presentation.payload;
    return this._runPayload(payload, context);
  }
  async runStep(sequenceStep, context) {
    const step = sequenceStep.payload;
    if (step.when && !this.contextKeyService.contextMatchesRules(step.when)) {
      return { action: "skipStep", shown: false };
    }
    try {
      await step.onBeforeShow?.();
    } catch (error) {
      onUnexpectedError(error);
    }
    if (context.cancellationToken.isCancellationRequested) {
      return { action: "abort", shown: false };
    }
    const target = await this._resolveTarget(context.targetWindow, step.targetId, context.cancellationToken, step.missingTarget);
    if (!target) {
      return context.cancellationToken.isCancellationRequested ? { action: "abort", shown: false } : { action: "skipStep", shown: false };
    }
    await this._waitForTargetReady(context.targetWindow, target);
    if (context.cancellationToken.isCancellationRequested) {
      return { action: "abort", shown: false };
    }
    const store = new DisposableStore();
    try {
      const container = this.layoutService.getContainer(context.targetWindow);
      const overlay = store.add(new SpotlightOverlay(container));
      this.hostService.setWindowDimmed(context.targetWindow, true);
      store.add(toDisposable(() => this.hostService.setWindowDimmed(context.targetWindow, false)));
      store.add(this.layoutService.onDidLayoutContainer(() => overlay.scheduleLayout()));
      const end = await this._runStep(
        overlay,
        context,
        step,
        target,
        context.visualStepIndex,
        context.visualStepCount,
        context.canGoBack,
        context.isLastVisualStep
      );
      overlay.hide();
      switch (end.action) {
        case "next":
          return {
            action: "next",
            shown: true,
            dismissReason: end.via === "target" ? OnboardingDismissReason.TargetClick : OnboardingDismissReason.Completed
          };
        case "back":
          return { action: "back", shown: true };
        case "skip":
          return { action: "skipSequence", shown: true, dismissReason: end.reason };
        case "abort":
          return { action: "abort", shown: true };
      }
    } finally {
      store.dispose();
    }
  }
  async _runPayload(payload, context) {
    const steps = payload?.steps ?? [];
    const stepCount = steps.length;
    if (stepCount === 0) {
      return { outcome: OnboardingOutcome.Completed, shown: false, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 0, stepCount: 0 };
    }
    let lastStepIndex = 0;
    let shown = false;
    const skippedStepIndexes = /* @__PURE__ */ new Set();
    const store = new DisposableStore();
    try {
      const container = this.layoutService.getContainer(context.targetWindow);
      const overlay = store.add(new SpotlightOverlay(container));
      this.hostService.setWindowDimmed(context.targetWindow, true);
      store.add(toDisposable(() => this.hostService.setWindowDimmed(context.targetWindow, false)));
      let aborted = false;
      const targetResolutionCancellation = store.add(new CancellationTokenSource());
      store.add(context.onAbort(() => {
        aborted = true;
        targetResolutionCancellation.cancel();
      }));
      store.add(this.layoutService.onDidLayoutContainer(() => overlay.scheduleLayout()));
      let index = 0;
      let direction = 1;
      while (index >= 0 && index < stepCount && !aborted) {
        const step = steps[index];
        if (step.when && !this.contextKeyService.contextMatchesRules(step.when)) {
          skippedStepIndexes.add(index);
          index += direction;
          continue;
        }
        try {
          await step.onBeforeShow?.();
        } catch (error) {
          onUnexpectedError(error);
        }
        if (aborted) {
          break;
        }
        const target = await this._resolveTarget(context.targetWindow, step.targetId, targetResolutionCancellation.token, step.missingTarget);
        if (aborted) {
          break;
        }
        if (!target) {
          skippedStepIndexes.add(index);
          index += direction;
          continue;
        }
        skippedStepIndexes.delete(index);
        await this._waitForTargetReady(context.targetWindow, target);
        if (aborted) {
          break;
        }
        lastStepIndex = Math.max(lastStepIndex, index);
        shown = true;
        const skippedBefore = Array.from(skippedStepIndexes).filter((skippedIndex) => skippedIndex < index).length;
        const displayStepIndex = index - skippedBefore;
        const displayStepCount = stepCount - skippedStepIndexes.size;
        const end = await this._runStep(overlay, context, step, target, displayStepIndex, displayStepCount);
        overlay.hide();
        switch (end.action) {
          case "next":
            if (index === stepCount - 1) {
              const dismissReason = end.via === "target" ? OnboardingDismissReason.TargetClick : OnboardingDismissReason.Completed;
              return { outcome: OnboardingOutcome.Completed, shown, dismissReason, lastStepIndex, stepCount };
            }
            direction = 1;
            index++;
            break;
          case "back":
            direction = -1;
            index--;
            break;
          case "skip":
            return { outcome: OnboardingOutcome.Skipped, shown, dismissReason: end.reason, lastStepIndex, stepCount };
          case "abort":
            return { outcome: OnboardingOutcome.Aborted, shown, dismissReason: OnboardingDismissReason.Aborted, lastStepIndex, stepCount };
        }
      }
      if (aborted) {
        return { outcome: OnboardingOutcome.Aborted, shown, dismissReason: OnboardingDismissReason.Aborted, lastStepIndex, stepCount };
      }
      return { outcome: OnboardingOutcome.Completed, shown, dismissReason: OnboardingDismissReason.Completed, lastStepIndex, stepCount };
    } finally {
      store.dispose();
    }
  }
  async _resolveTarget(targetWindow, targetId, cancellationToken, behavior) {
    if (cancellationToken.isCancellationRequested) {
      return void 0;
    }
    let element = findOnboardingTarget(targetWindow, targetId);
    if (element || behavior?.kind === "skip") {
      return element;
    }
    const timeoutMs = behavior?.kind === "wait" ? Math.max(0, behavior.timeoutMs) : TARGET_RESOLVE_TIMEOUT;
    const deadline = Date.now() + timeoutMs;
    while (!element && Date.now() < deadline && !cancellationToken.isCancellationRequested) {
      try {
        await timeout(TARGET_POLL_INTERVAL, cancellationToken);
      } catch (error) {
        if (cancellationToken.isCancellationRequested) {
          return void 0;
        }
        throw error;
      }
      element = findOnboardingTarget(targetWindow, targetId);
    }
    return element;
  }
  async _waitForTargetReady(targetWindow, target) {
    const animations = this._getActiveFiniteAnimations(target);
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((animation) => animation.finished.catch(() => void 0))),
        timeout(TARGET_ANIMATION_SETTLE_TIMEOUT)
      ]);
    }
    await new Promise((resolve) => targetWindow.requestAnimationFrame(() => resolve()));
  }
  _getActiveFiniteAnimations(target) {
    const animations = [];
    for (let element = target; element; element = element.parentElement) {
      for (const animation of element.getAnimations()) {
        if (animation.playState === "running" && animation.effect?.getTiming().iterations !== Infinity) {
          animations.push(animation);
        }
      }
    }
    return animations;
  }
  async _runStep(overlay, context, step, target, index, stepCount, canGoBack = index > 0, isLastStep = index === stepCount - 1) {
    const stepStore = new DisposableStore();
    let ended = false;
    let resolveStep;
    const result = new Promise((resolve) => resolveStep = resolve);
    const done = (end) => {
      if (ended) {
        return;
      }
      ended = true;
      stepStore.dispose();
      resolveStep(end);
    };
    stepStore.add(overlay.onDidClickNext((via) => done({ action: "next", via })));
    stepStore.add(overlay.onDidClickPrevious(() => done({ action: "back" })));
    stepStore.add(overlay.onDidSkip((reason) => done({ action: "skip", reason })));
    stepStore.add(context.onAbort(() => done({ action: "abort" })));
    const content = {
      title: step.title,
      description: step.description,
      stepIndex: index,
      stepCount,
      canGoBack,
      isLastStep
    };
    overlay.show(target, content, {
      placement: step.placement,
      allowTargetInteraction: step.allowTargetInteraction,
      advanceOnTargetClick: step.advanceOnTargetClick,
      hideNext: !!step.advanceWhen,
      targetOverlayVisible: step.openTarget,
      padding: step.padding
    });
    context.onDidShow?.();
    if (step.advanceWhen) {
      const keys = new Set(step.advanceWhen.keys());
      const advanceIfSatisfied = () => {
        if (this.contextKeyService.contextMatchesRules(step.advanceWhen)) {
          done({ action: "next", via: "condition" });
        }
      };
      stepStore.add(this.contextKeyService.onDidChangeContext((event) => {
        if (event.affectsSome(keys)) {
          advanceIfSatisfied();
        }
      }));
      advanceIfSatisfied();
    }
    if (step.openTarget && !ended) {
      try {
        await openOnboardingTarget(target);
      } catch (error) {
        onUnexpectedError(error);
      }
    }
    return result;
  }
};
SpotlightPresentation = __decorateClass([
  __decorateParam(0, IWorkbenchLayoutService),
  __decorateParam(1, IHostService),
  __decorateParam(2, IContextKeyService)
], SpotlightPresentation);
export {
  SpotlightPresentation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG9uYm9hcmRpbmdcXGJyb3dzZXJcXHNwb3RsaWdodFxcc3BvdGxpZ2h0UHJlc2VudGF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJT25ib2FyZGluZ1ByZXNlbnRhdGlvbiwgSU9uYm9hcmRpbmdSdW5Db250ZXh0IH0gZnJvbSAnLi4vLi4vY29tbW9uL29uYm9hcmRpbmdQcmVzZW50YXRpb24uanMnO1xuaW1wb3J0IHsgSU9uYm9hcmRpbmdSdW5SZXN1bHQsIElPbmJvYXJkaW5nU2NlbmFyaW8sIE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLCBPbmJvYXJkaW5nT3V0Y29tZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9vbmJvYXJkaW5nU2NlbmFyaW8uanMnO1xuaW1wb3J0IHsgSU9uYm9hcmRpbmdTZXF1ZW5jZVN0ZXAsIElPbmJvYXJkaW5nU2VxdWVuY2VTdGVwQ29udGV4dCwgSU9uYm9hcmRpbmdTZXF1ZW5jZVN0ZXBQcmVzZW50YXRpb24sIElPbmJvYXJkaW5nU2VxdWVuY2VTdGVwUmVzdWx0IH0gZnJvbSAnLi4vLi4vY29tbW9uL29uYm9hcmRpbmdTZXF1ZW5jZS5qcyc7XG5pbXBvcnQgeyBmaW5kT25ib2FyZGluZ1RhcmdldCwgb3Blbk9uYm9hcmRpbmdUYXJnZXQgfSBmcm9tICcuL29uYm9hcmRpbmdUYXJnZXQuanMnO1xuaW1wb3J0IHsgSVNwb3RsaWdodENvbnRlbnQsIFNwb3RsaWdodE92ZXJsYXkgfSBmcm9tICcuL3Nwb3RsaWdodE92ZXJsYXkuanMnO1xuaW1wb3J0IHsgSVNwb3RsaWdodFBheWxvYWQsIElTcG90bGlnaHRTdGVwLCBTcG90bGlnaHRNaXNzaW5nVGFyZ2V0QmVoYXZpb3IsIFNQT1RMSUdIVF9QUkVTRU5UQVRJT05fS0lORCB9IGZyb20gJy4vc3BvdGxpZ2h0VHlwZXMuanMnO1xuXG4vKiogSG93IGxvbmcgdG8gd2FpdCBmb3IgYSBzdGVwJ3MgdGFyZ2V0IGVsZW1lbnQgdG8gYXBwZWFyIGJlZm9yZSBza2lwcGluZyBpdC4gKi9cbmNvbnN0IFRBUkdFVF9SRVNPTFZFX1RJTUVPVVQgPSAyMDAwO1xuY29uc3QgVEFSR0VUX1BPTExfSU5URVJWQUwgPSA1MDtcbmNvbnN0IFRBUkdFVF9BTklNQVRJT05fU0VUVExFX1RJTUVPVVQgPSA2MDA7XG5cbi8qKiBUaGUgdGVybWluYWwgYWN0aW9uIG9mIGEgc2luZ2xlIHN0ZXAsIGNhcnJ5aW5nIHRoZSBkYXRhIG5lZWRlZCBmb3IgdGVsZW1ldHJ5LiAqL1xudHlwZSBTdGVwRW5kID1cblx0fCB7IHJlYWRvbmx5IGFjdGlvbjogJ25leHQnOyByZWFkb25seSB2aWE6ICdidXR0b24nIHwgJ3RhcmdldCcgfCAnY29uZGl0aW9uJyB9XG5cdHwgeyByZWFkb25seSBhY3Rpb246ICdiYWNrJyB9XG5cdHwgeyByZWFkb25seSBhY3Rpb246ICdza2lwJzsgcmVhZG9ubHkgcmVhc29uOiBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5Ta2lwQnV0dG9uIHwgT25ib2FyZGluZ0Rpc21pc3NSZWFzb24uRXNjYXBlS2V5IH1cblx0fCB7IHJlYWRvbmx5IGFjdGlvbjogJ2Fib3J0JyB9O1xuXG4vKipcbiAqIFJlbmRlcnMge0BsaW5rIElTcG90bGlnaHRQYXlsb2FkfSBzY2VuYXJpb3M6IGl0IGRpbXMgdGhlIHdpbmRvdyAoaW5jbHVkaW5nIHRoZVxuICogbmF0aXZlIHdpbmRvdyBjb250cm9scyksIHdhbGtzIHRoZSBzdGVwcywgYW5kIHNob3dzIGFuIGFuY2hvcmVkIGNhbGxvdXQgZm9yXG4gKiBlYWNoLiBJbXBsZW1lbnRzIHRoZSBlbmdpbmUncyB7QGxpbmsgSU9uYm9hcmRpbmdQcmVzZW50YXRpb259IGNvbnRyYWN0IHNvIHRoZVxuICogc2NlbmFyaW8gZW5naW5lIGNhbiBkcml2ZSBpdCB3aXRob3V0IGtub3dpbmcgYW55dGhpbmcgYWJvdXQgc3BvdGxpZ2h0cy5cbiAqL1xuZXhwb3J0IGNsYXNzIFNwb3RsaWdodFByZXNlbnRhdGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJT25ib2FyZGluZ1ByZXNlbnRhdGlvbiwgSU9uYm9hcmRpbmdTZXF1ZW5jZVN0ZXBQcmVzZW50YXRpb24ge1xuXG5cdHJlYWRvbmx5IGtpbmQgPSBTUE9UTElHSFRfUFJFU0VOVEFUSU9OX0tJTkQ7XG5cdHJlYWRvbmx5IGNvdW50c0FzVmlzdWFsU3RlcCA9IHRydWU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyBydW4oc2NlbmFyaW86IElPbmJvYXJkaW5nU2NlbmFyaW8sIGNvbnRleHQ6IElPbmJvYXJkaW5nUnVuQ29udGV4dCk6IFByb21pc2U8SU9uYm9hcmRpbmdSdW5SZXN1bHQ+IHtcblx0XHRjb25zdCBwYXlsb2FkID0gc2NlbmFyaW8ucHJlc2VudGF0aW9uLnBheWxvYWQgYXMgSVNwb3RsaWdodFBheWxvYWQ7XG5cdFx0cmV0dXJuIHRoaXMuX3J1blBheWxvYWQocGF5bG9hZCwgY29udGV4dCk7XG5cdH1cblxuXHRhc3luYyBydW5TdGVwKHNlcXVlbmNlU3RlcDogSU9uYm9hcmRpbmdTZXF1ZW5jZVN0ZXAsIGNvbnRleHQ6IElPbmJvYXJkaW5nU2VxdWVuY2VTdGVwQ29udGV4dCk6IFByb21pc2U8SU9uYm9hcmRpbmdTZXF1ZW5jZVN0ZXBSZXN1bHQ+IHtcblx0XHRjb25zdCBzdGVwID0gc2VxdWVuY2VTdGVwLnBheWxvYWQgYXMgSVNwb3RsaWdodFN0ZXA7XG5cdFx0aWYgKHN0ZXAud2hlbiAmJiAhdGhpcy5jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHN0ZXAud2hlbikpIHtcblx0XHRcdHJldHVybiB7IGFjdGlvbjogJ3NraXBTdGVwJywgc2hvd246IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHN0ZXAub25CZWZvcmVTaG93Py4oKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0XHRpZiAoY29udGV4dC5jYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHsgYWN0aW9uOiAnYWJvcnQnLCBzaG93bjogZmFsc2UgfTtcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXQgPSBhd2FpdCB0aGlzLl9yZXNvbHZlVGFyZ2V0KGNvbnRleHQudGFyZ2V0V2luZG93LCBzdGVwLnRhcmdldElkLCBjb250ZXh0LmNhbmNlbGxhdGlvblRva2VuLCBzdGVwLm1pc3NpbmdUYXJnZXQpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm4gY29udGV4dC5jYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZFxuXHRcdFx0XHQ/IHsgYWN0aW9uOiAnYWJvcnQnLCBzaG93bjogZmFsc2UgfVxuXHRcdFx0XHQ6IHsgYWN0aW9uOiAnc2tpcFN0ZXAnLCBzaG93bjogZmFsc2UgfTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fd2FpdEZvclRhcmdldFJlYWR5KGNvbnRleHQudGFyZ2V0V2luZG93LCB0YXJnZXQpO1xuXHRcdGlmIChjb250ZXh0LmNhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4geyBhY3Rpb246ICdhYm9ydCcsIHNob3duOiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLmxheW91dFNlcnZpY2UuZ2V0Q29udGFpbmVyKGNvbnRleHQudGFyZ2V0V2luZG93KTtcblx0XHRcdGNvbnN0IG92ZXJsYXkgPSBzdG9yZS5hZGQobmV3IFNwb3RsaWdodE92ZXJsYXkoY29udGFpbmVyKSk7XG5cdFx0XHR0aGlzLmhvc3RTZXJ2aWNlLnNldFdpbmRvd0RpbW1lZChjb250ZXh0LnRhcmdldFdpbmRvdywgdHJ1ZSk7XG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuaG9zdFNlcnZpY2Uuc2V0V2luZG93RGltbWVkKGNvbnRleHQudGFyZ2V0V2luZG93LCBmYWxzZSkpKTtcblx0XHRcdHN0b3JlLmFkZCh0aGlzLmxheW91dFNlcnZpY2Uub25EaWRMYXlvdXRDb250YWluZXIoKCkgPT4gb3ZlcmxheS5zY2hlZHVsZUxheW91dCgpKSk7XG5cdFx0XHRjb25zdCBlbmQgPSBhd2FpdCB0aGlzLl9ydW5TdGVwKFxuXHRcdFx0XHRvdmVybGF5LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRzdGVwLFxuXHRcdFx0XHR0YXJnZXQsXG5cdFx0XHRcdGNvbnRleHQudmlzdWFsU3RlcEluZGV4LFxuXHRcdFx0XHRjb250ZXh0LnZpc3VhbFN0ZXBDb3VudCxcblx0XHRcdFx0Y29udGV4dC5jYW5Hb0JhY2ssXG5cdFx0XHRcdGNvbnRleHQuaXNMYXN0VmlzdWFsU3RlcCxcblx0XHRcdCk7XG5cdFx0XHRvdmVybGF5LmhpZGUoKTtcblx0XHRcdHN3aXRjaCAoZW5kLmFjdGlvbikge1xuXHRcdFx0XHRjYXNlICduZXh0Jzpcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0YWN0aW9uOiAnbmV4dCcsXG5cdFx0XHRcdFx0XHRzaG93bjogdHJ1ZSxcblx0XHRcdFx0XHRcdGRpc21pc3NSZWFzb246IGVuZC52aWEgPT09ICd0YXJnZXQnID8gT25ib2FyZGluZ0Rpc21pc3NSZWFzb24uVGFyZ2V0Q2xpY2sgOiBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5Db21wbGV0ZWQsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0Y2FzZSAnYmFjayc6XG5cdFx0XHRcdFx0cmV0dXJuIHsgYWN0aW9uOiAnYmFjaycsIHNob3duOiB0cnVlIH07XG5cdFx0XHRcdGNhc2UgJ3NraXAnOlxuXHRcdFx0XHRcdHJldHVybiB7IGFjdGlvbjogJ3NraXBTZXF1ZW5jZScsIHNob3duOiB0cnVlLCBkaXNtaXNzUmVhc29uOiBlbmQucmVhc29uIH07XG5cdFx0XHRcdGNhc2UgJ2Fib3J0Jzpcblx0XHRcdFx0XHRyZXR1cm4geyBhY3Rpb246ICdhYm9ydCcsIHNob3duOiB0cnVlIH07XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5QYXlsb2FkKHBheWxvYWQ6IElTcG90bGlnaHRQYXlsb2FkLCBjb250ZXh0OiBJT25ib2FyZGluZ1J1bkNvbnRleHQpOiBQcm9taXNlPElPbmJvYXJkaW5nUnVuUmVzdWx0PiB7XG5cdFx0Y29uc3Qgc3RlcHMgPSBwYXlsb2FkPy5zdGVwcyA/PyBbXTtcblx0XHRjb25zdCBzdGVwQ291bnQgPSBzdGVwcy5sZW5ndGg7XG5cdFx0aWYgKHN0ZXBDb3VudCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHsgb3V0Y29tZTogT25ib2FyZGluZ091dGNvbWUuQ29tcGxldGVkLCBzaG93bjogZmFsc2UsIGRpc21pc3NSZWFzb246IE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLkNvbXBsZXRlZCwgbGFzdFN0ZXBJbmRleDogMCwgc3RlcENvdW50OiAwIH07XG5cdFx0fVxuXG5cdFx0Ly8gRnVydGhlc3Qgc3RlcCB0aGUgdXNlciBhY3R1YWxseSBzYXcgKDAtYmFzZWQpLiBTdGF5cyBhdCB0aGUgbGFzdCBzaG93blxuXHRcdC8vIHN0ZXAgcmVnYXJkbGVzcyBvZiBob3cgdGhlIHJ1biBlbmRzLCBmb3IgdGVsZW1ldHJ5LlxuXHRcdGxldCBsYXN0U3RlcEluZGV4ID0gMDtcblx0XHQvLyBXaGV0aGVyIGF0IGxlYXN0IG9uZSBzdGVwIHdhcyBhY3R1YWxseSByZW5kZXJlZC4gU3RheXMgYGZhbHNlYCBpZiBldmVyeSBzdGVwIGlzXG5cdFx0Ly8gc2tpcHBlZCAobWlzc2luZyB0YXJnZXQgLyB1bnNhdGlzZmllZCBgd2hlbmApIHNvIG5vdGhpbmcgd2FzIGV2ZXIgZGlzcGxheWVkLlxuXHRcdGxldCBzaG93biA9IGZhbHNlO1xuXHRcdGNvbnN0IHNraXBwZWRTdGVwSW5kZXhlcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMubGF5b3V0U2VydmljZS5nZXRDb250YWluZXIoY29udGV4dC50YXJnZXRXaW5kb3cpO1xuXHRcdFx0Y29uc3Qgb3ZlcmxheSA9IHN0b3JlLmFkZChuZXcgU3BvdGxpZ2h0T3ZlcmxheShjb250YWluZXIpKTtcblxuXHRcdFx0Ly8gRGltIHRoZSBuYXRpdmUgd2luZG93IGNvbnRyb2xzIG92ZXJsYXkgaW4gc3luYyB3aXRoIHRoZSBkaW0gbGF5ZXIuXG5cdFx0XHR0aGlzLmhvc3RTZXJ2aWNlLnNldFdpbmRvd0RpbW1lZChjb250ZXh0LnRhcmdldFdpbmRvdywgdHJ1ZSk7XG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuaG9zdFNlcnZpY2Uuc2V0V2luZG93RGltbWVkKGNvbnRleHQudGFyZ2V0V2luZG93LCBmYWxzZSkpKTtcblxuXHRcdFx0bGV0IGFib3J0ZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHRhcmdldFJlc29sdXRpb25DYW5jZWxsYXRpb24gPSBzdG9yZS5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXHRcdFx0c3RvcmUuYWRkKGNvbnRleHQub25BYm9ydCgoKSA9PiB7XG5cdFx0XHRcdGFib3J0ZWQgPSB0cnVlO1xuXHRcdFx0XHR0YXJnZXRSZXNvbHV0aW9uQ2FuY2VsbGF0aW9uLmNhbmNlbCgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBLZWVwIHRoZSBjYWxsb3V0IGdsdWVkIHRvIHRoZSB0YXJnZXQgYXMgdGhlIHdvcmtiZW5jaCByZS1sYXlvdXRzLlxuXHRcdFx0Ly8gU2NoZWR1bGUgdGhlIG1lYXN1cmVtZW50IHNvIGl0IHJ1bnMgYWZ0ZXIgdGhlIGxheW91dCBldmVudCdzIERPTSB3b3JrXG5cdFx0XHQvLyBoYXMgc2V0dGxlZCwgaW5jbHVkaW5nIHBvc2l0aW9uLW9ubHkgc2hpZnRzIHRoYXQgUmVzaXplT2JzZXJ2ZXIgbWlzc2VzLlxuXHRcdFx0c3RvcmUuYWRkKHRoaXMubGF5b3V0U2VydmljZS5vbkRpZExheW91dENvbnRhaW5lcigoKSA9PiBvdmVybGF5LnNjaGVkdWxlTGF5b3V0KCkpKTtcblxuXHRcdFx0bGV0IGluZGV4ID0gMDtcblx0XHRcdGxldCBkaXJlY3Rpb246IDEgfCAtMSA9IDE7XG5cblx0XHRcdHdoaWxlIChpbmRleCA+PSAwICYmIGluZGV4IDwgc3RlcENvdW50ICYmICFhYm9ydGVkKSB7XG5cdFx0XHRcdGNvbnN0IHN0ZXAgPSBzdGVwc1tpbmRleF07XG5cblx0XHRcdFx0aWYgKHN0ZXAud2hlbiAmJiAhdGhpcy5jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHN0ZXAud2hlbikpIHtcblx0XHRcdFx0XHRza2lwcGVkU3RlcEluZGV4ZXMuYWRkKGluZGV4KTtcblx0XHRcdFx0XHRpbmRleCArPSBkaXJlY3Rpb247XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHN0ZXAub25CZWZvcmVTaG93Py4oKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGFib3J0ZWQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVUYXJnZXQoY29udGV4dC50YXJnZXRXaW5kb3csIHN0ZXAudGFyZ2V0SWQsIHRhcmdldFJlc29sdXRpb25DYW5jZWxsYXRpb24udG9rZW4sIHN0ZXAubWlzc2luZ1RhcmdldCk7XG5cdFx0XHRcdGlmIChhYm9ydGVkKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdFx0XHRza2lwcGVkU3RlcEluZGV4ZXMuYWRkKGluZGV4KTtcblx0XHRcdFx0XHRpbmRleCArPSBkaXJlY3Rpb247XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2tpcHBlZFN0ZXBJbmRleGVzLmRlbGV0ZShpbmRleCk7XG5cblx0XHRcdFx0YXdhaXQgdGhpcy5fd2FpdEZvclRhcmdldFJlYWR5KGNvbnRleHQudGFyZ2V0V2luZG93LCB0YXJnZXQpO1xuXHRcdFx0XHRpZiAoYWJvcnRlZCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGFzdFN0ZXBJbmRleCA9IE1hdGgubWF4KGxhc3RTdGVwSW5kZXgsIGluZGV4KTtcblx0XHRcdFx0c2hvd24gPSB0cnVlO1xuXG5cdFx0XHRcdGNvbnN0IHNraXBwZWRCZWZvcmUgPSBBcnJheS5mcm9tKHNraXBwZWRTdGVwSW5kZXhlcykuZmlsdGVyKHNraXBwZWRJbmRleCA9PiBza2lwcGVkSW5kZXggPCBpbmRleCkubGVuZ3RoO1xuXHRcdFx0XHRjb25zdCBkaXNwbGF5U3RlcEluZGV4ID0gaW5kZXggLSBza2lwcGVkQmVmb3JlO1xuXHRcdFx0XHRjb25zdCBkaXNwbGF5U3RlcENvdW50ID0gc3RlcENvdW50IC0gc2tpcHBlZFN0ZXBJbmRleGVzLnNpemU7XG5cdFx0XHRcdGNvbnN0IGVuZCA9IGF3YWl0IHRoaXMuX3J1blN0ZXAob3ZlcmxheSwgY29udGV4dCwgc3RlcCwgdGFyZ2V0LCBkaXNwbGF5U3RlcEluZGV4LCBkaXNwbGF5U3RlcENvdW50KTtcblx0XHRcdFx0b3ZlcmxheS5oaWRlKCk7XG5cdFx0XHRcdHN3aXRjaCAoZW5kLmFjdGlvbikge1xuXHRcdFx0XHRcdGNhc2UgJ25leHQnOlxuXHRcdFx0XHRcdFx0aWYgKGluZGV4ID09PSBzdGVwQ291bnQgLSAxKSB7XG5cdFx0XHRcdFx0XHRcdC8vIEFkdmFuY2luZyBwYXN0IHRoZSBmaW5hbCBzdGVwIGNvbXBsZXRlcyB0aGUgdG91ci5cblx0XHRcdFx0XHRcdFx0Y29uc3QgZGlzbWlzc1JlYXNvbiA9IGVuZC52aWEgPT09ICd0YXJnZXQnID8gT25ib2FyZGluZ0Rpc21pc3NSZWFzb24uVGFyZ2V0Q2xpY2sgOiBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5Db21wbGV0ZWQ7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IG91dGNvbWU6IE9uYm9hcmRpbmdPdXRjb21lLkNvbXBsZXRlZCwgc2hvd24sIGRpc21pc3NSZWFzb24sIGxhc3RTdGVwSW5kZXgsIHN0ZXBDb3VudCB9O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZGlyZWN0aW9uID0gMTtcblx0XHRcdFx0XHRcdGluZGV4Kys7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdiYWNrJzpcblx0XHRcdFx0XHRcdGRpcmVjdGlvbiA9IC0xO1xuXHRcdFx0XHRcdFx0aW5kZXgtLTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3NraXAnOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHsgb3V0Y29tZTogT25ib2FyZGluZ091dGNvbWUuU2tpcHBlZCwgc2hvd24sIGRpc21pc3NSZWFzb246IGVuZC5yZWFzb24sIGxhc3RTdGVwSW5kZXgsIHN0ZXBDb3VudCB9O1xuXHRcdFx0XHRcdGNhc2UgJ2Fib3J0Jzpcblx0XHRcdFx0XHRcdHJldHVybiB7IG91dGNvbWU6IE9uYm9hcmRpbmdPdXRjb21lLkFib3J0ZWQsIHNob3duLCBkaXNtaXNzUmVhc29uOiBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5BYm9ydGVkLCBsYXN0U3RlcEluZGV4LCBzdGVwQ291bnQgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYWJvcnRlZCkge1xuXHRcdFx0XHRyZXR1cm4geyBvdXRjb21lOiBPbmJvYXJkaW5nT3V0Y29tZS5BYm9ydGVkLCBzaG93biwgZGlzbWlzc1JlYXNvbjogT25ib2FyZGluZ0Rpc21pc3NSZWFzb24uQWJvcnRlZCwgbGFzdFN0ZXBJbmRleCwgc3RlcENvdW50IH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBvdXRjb21lOiBPbmJvYXJkaW5nT3V0Y29tZS5Db21wbGV0ZWQsIHNob3duLCBkaXNtaXNzUmVhc29uOiBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5Db21wbGV0ZWQsIGxhc3RTdGVwSW5kZXgsIHN0ZXBDb3VudCB9O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVRhcmdldCh0YXJnZXRXaW5kb3c6IFdpbmRvdywgdGFyZ2V0SWQ6IHN0cmluZywgY2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBiZWhhdmlvcj86IFNwb3RsaWdodE1pc3NpbmdUYXJnZXRCZWhhdmlvcik6IFByb21pc2U8SFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoY2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCBlbGVtZW50ID0gZmluZE9uYm9hcmRpbmdUYXJnZXQodGFyZ2V0V2luZG93LCB0YXJnZXRJZCk7XG5cdFx0aWYgKGVsZW1lbnQgfHwgYmVoYXZpb3I/LmtpbmQgPT09ICdza2lwJykge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQ7XG5cdFx0fVxuXHRcdGNvbnN0IHRpbWVvdXRNcyA9IGJlaGF2aW9yPy5raW5kID09PSAnd2FpdCcgPyBNYXRoLm1heCgwLCBiZWhhdmlvci50aW1lb3V0TXMpIDogVEFSR0VUX1JFU09MVkVfVElNRU9VVDtcblx0XHRjb25zdCBkZWFkbGluZSA9IERhdGUubm93KCkgKyB0aW1lb3V0TXM7XG5cdFx0d2hpbGUgKCFlbGVtZW50ICYmIERhdGUubm93KCkgPCBkZWFkbGluZSAmJiAhY2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoVEFSR0VUX1BPTExfSU5URVJWQUwsIGNhbmNlbGxhdGlvblRva2VuKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmIChjYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0XHRlbGVtZW50ID0gZmluZE9uYm9hcmRpbmdUYXJnZXQodGFyZ2V0V2luZG93LCB0YXJnZXRJZCk7XG5cdFx0fVxuXHRcdHJldHVybiBlbGVtZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfd2FpdEZvclRhcmdldFJlYWR5KHRhcmdldFdpbmRvdzogV2luZG93LCB0YXJnZXQ6IEhUTUxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYW5pbWF0aW9ucyA9IHRoaXMuX2dldEFjdGl2ZUZpbml0ZUFuaW1hdGlvbnModGFyZ2V0KTtcblx0XHRpZiAoYW5pbWF0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0XHRQcm9taXNlLmFsbFNldHRsZWQoYW5pbWF0aW9ucy5tYXAoYW5pbWF0aW9uID0+IGFuaW1hdGlvbi5maW5pc2hlZC5jYXRjaCgoKSA9PiB1bmRlZmluZWQpKSksXG5cdFx0XHRcdHRpbWVvdXQoVEFSR0VUX0FOSU1BVElPTl9TRVRUTEVfVElNRU9VVCksXG5cdFx0XHRdKTtcblx0XHR9XG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB0YXJnZXRXaW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHJlc29sdmUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QWN0aXZlRmluaXRlQW5pbWF0aW9ucyh0YXJnZXQ6IEhUTUxFbGVtZW50KTogQW5pbWF0aW9uW10ge1xuXHRcdGNvbnN0IGFuaW1hdGlvbnM6IEFuaW1hdGlvbltdID0gW107XG5cdFx0Zm9yIChsZXQgZWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsID0gdGFyZ2V0OyBlbGVtZW50OyBlbGVtZW50ID0gZWxlbWVudC5wYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRmb3IgKGNvbnN0IGFuaW1hdGlvbiBvZiBlbGVtZW50LmdldEFuaW1hdGlvbnMoKSkge1xuXHRcdFx0XHRpZiAoYW5pbWF0aW9uLnBsYXlTdGF0ZSA9PT0gJ3J1bm5pbmcnICYmIGFuaW1hdGlvbi5lZmZlY3Q/LmdldFRpbWluZygpLml0ZXJhdGlvbnMgIT09IEluZmluaXR5KSB7XG5cdFx0XHRcdFx0YW5pbWF0aW9ucy5wdXNoKGFuaW1hdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGFuaW1hdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5TdGVwKG92ZXJsYXk6IFNwb3RsaWdodE92ZXJsYXksIGNvbnRleHQ6IElPbmJvYXJkaW5nUnVuQ29udGV4dCwgc3RlcDogSVNwb3RsaWdodFN0ZXAsIHRhcmdldDogSFRNTEVsZW1lbnQsIGluZGV4OiBudW1iZXIsIHN0ZXBDb3VudDogbnVtYmVyLCBjYW5Hb0JhY2s6IGJvb2xlYW4gPSBpbmRleCA+IDAsIGlzTGFzdFN0ZXA6IGJvb2xlYW4gPSBpbmRleCA9PT0gc3RlcENvdW50IC0gMSk6IFByb21pc2U8U3RlcEVuZD4ge1xuXHRcdGNvbnN0IHN0ZXBTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRsZXQgZW5kZWQgPSBmYWxzZTtcblx0XHRsZXQgcmVzb2x2ZVN0ZXA6IChlbmQ6IFN0ZXBFbmQpID0+IHZvaWQ7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21pc2U8U3RlcEVuZD4ocmVzb2x2ZSA9PiByZXNvbHZlU3RlcCA9IHJlc29sdmUpO1xuXHRcdGNvbnN0IGRvbmUgPSAoZW5kOiBTdGVwRW5kKSA9PiB7XG5cdFx0XHRpZiAoZW5kZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZW5kZWQgPSB0cnVlO1xuXHRcdFx0c3RlcFN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdHJlc29sdmVTdGVwKGVuZCk7XG5cdFx0fTtcblxuXHRcdHN0ZXBTdG9yZS5hZGQob3ZlcmxheS5vbkRpZENsaWNrTmV4dCh2aWEgPT4gZG9uZSh7IGFjdGlvbjogJ25leHQnLCB2aWEgfSkpKTtcblx0XHRzdGVwU3RvcmUuYWRkKG92ZXJsYXkub25EaWRDbGlja1ByZXZpb3VzKCgpID0+IGRvbmUoeyBhY3Rpb246ICdiYWNrJyB9KSkpO1xuXHRcdHN0ZXBTdG9yZS5hZGQob3ZlcmxheS5vbkRpZFNraXAocmVhc29uID0+IGRvbmUoeyBhY3Rpb246ICdza2lwJywgcmVhc29uIH0pKSk7XG5cdFx0c3RlcFN0b3JlLmFkZChjb250ZXh0Lm9uQWJvcnQoKCkgPT4gZG9uZSh7IGFjdGlvbjogJ2Fib3J0JyB9KSkpO1xuXG5cdFx0Y29uc3QgY29udGVudDogSVNwb3RsaWdodENvbnRlbnQgPSB7XG5cdFx0XHR0aXRsZTogc3RlcC50aXRsZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBzdGVwLmRlc2NyaXB0aW9uLFxuXHRcdFx0c3RlcEluZGV4OiBpbmRleCxcblx0XHRcdHN0ZXBDb3VudCxcblx0XHRcdGNhbkdvQmFjayxcblx0XHRcdGlzTGFzdFN0ZXAsXG5cdFx0fTtcblxuXHRcdG92ZXJsYXkuc2hvdyh0YXJnZXQsIGNvbnRlbnQsIHtcblx0XHRcdHBsYWNlbWVudDogc3RlcC5wbGFjZW1lbnQsXG5cdFx0XHRhbGxvd1RhcmdldEludGVyYWN0aW9uOiBzdGVwLmFsbG93VGFyZ2V0SW50ZXJhY3Rpb24sXG5cdFx0XHRhZHZhbmNlT25UYXJnZXRDbGljazogc3RlcC5hZHZhbmNlT25UYXJnZXRDbGljayxcblx0XHRcdGhpZGVOZXh0OiAhIXN0ZXAuYWR2YW5jZVdoZW4sXG5cdFx0XHR0YXJnZXRPdmVybGF5VmlzaWJsZTogc3RlcC5vcGVuVGFyZ2V0LFxuXHRcdFx0cGFkZGluZzogc3RlcC5wYWRkaW5nLFxuXHRcdH0pO1xuXHRcdGNvbnRleHQub25EaWRTaG93Py4oKTtcblxuXHRcdGlmIChzdGVwLmFkdmFuY2VXaGVuKSB7XG5cdFx0XHRjb25zdCBrZXlzID0gbmV3IFNldChzdGVwLmFkdmFuY2VXaGVuLmtleXMoKSk7XG5cdFx0XHRjb25zdCBhZHZhbmNlSWZTYXRpc2ZpZWQgPSAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoc3RlcC5hZHZhbmNlV2hlbikpIHtcblx0XHRcdFx0XHRkb25lKHsgYWN0aW9uOiAnbmV4dCcsIHZpYTogJ2NvbmRpdGlvbicgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRzdGVwU3RvcmUuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGV2ZW50ID0+IHtcblx0XHRcdFx0aWYgKGV2ZW50LmFmZmVjdHNTb21lKGtleXMpKSB7XG5cdFx0XHRcdFx0YWR2YW5jZUlmU2F0aXNmaWVkKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGFkdmFuY2VJZlNhdGlzZmllZCgpO1xuXHRcdH1cblxuXHRcdGlmIChzdGVwLm9wZW5UYXJnZXQgJiYgIWVuZGVkKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBvcGVuT25ib2FyZGluZ1RhcmdldCh0YXJnZXQpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFlBQVksaUJBQWlCLG9CQUFvQjtBQUMxRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG9CQUFvQjtBQUU3QixTQUFvRCx5QkFBeUIseUJBQXlCO0FBRXRHLFNBQVMsc0JBQXNCLDRCQUE0QjtBQUMzRCxTQUE0Qix3QkFBd0I7QUFDcEQsU0FBNEUsbUNBQW1DO0FBRy9HLE1BQU0seUJBQXlCO0FBQy9CLE1BQU0sdUJBQXVCO0FBQzdCLE1BQU0sa0NBQWtDO0FBZWpDLElBQU0sd0JBQU4sY0FBb0MsV0FBbUY7QUFBQSxFQUs3SCxZQUMyQyxlQUNYLGFBQ00sbUJBQ3BDO0FBQ0QsVUFBTTtBQUpvQztBQUNYO0FBQ007QUFOdEMsU0FBUyxPQUFPO0FBQ2hCLFNBQVMscUJBQXFCO0FBQUEsRUFROUI7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUErQixTQUErRDtBQUN2RyxVQUFNLFVBQVUsU0FBUyxhQUFhO0FBQ3RDLFdBQU8sS0FBSyxZQUFZLFNBQVMsT0FBTztBQUFBLEVBQ3pDO0FBQUEsRUFFQSxNQUFNLFFBQVEsY0FBdUMsU0FBaUY7QUFDckksVUFBTSxPQUFPLGFBQWE7QUFDMUIsUUFBSSxLQUFLLFFBQVEsQ0FBQyxLQUFLLGtCQUFrQixvQkFBb0IsS0FBSyxJQUFJLEdBQUc7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
