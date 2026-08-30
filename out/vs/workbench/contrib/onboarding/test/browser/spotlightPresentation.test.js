import assert from "assert";
import { $ } from "../../../../../base/browser/dom.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { disposableTimeout } from "../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { ContextKeyService } from "../../../../../platform/contextkey/browser/contextKeyService.js";
import { TestHostService, TestLayoutService } from "../../../../test/browser/workbenchTestServices.js";
import { SpotlightPresentation } from "../../browser/spotlight/spotlightPresentation.js";
import { markOnboardingTarget } from "../../browser/spotlight/onboardingTarget.js";
import { SPOTLIGHT_PRESENTATION_KIND } from "../../browser/spotlight/spotlightTypes.js";
import { OnboardingDismissReason, OnboardingOutcome } from "../../common/onboardingScenario.js";
class SpotlightTestLayoutService extends TestLayoutService {
  constructor(_container) {
    super();
    this._container = _container;
  }
  getContainer() {
    return this._container;
  }
}
suite("SpotlightPresentation", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createContainer() {
    const container = $(".spotlight-presentation-test");
    mainWindow.document.body.appendChild(container);
    disposables.add({ dispose: () => container.remove() });
    return container;
  }
  function createTarget(container, id, options) {
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
  function createScenario(id, ...steps) {
    return {
      id,
      trigger: { kind: "auto" },
      presentation: {
        kind: SPOTLIGHT_PRESENTATION_KIND,
        payload: { steps }
      }
    };
  }
  test("waits for a late target and skips a missing target immediately", async () => {
    const container = createContainer();
    const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
    const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService));
    const lateTargetId = "test.spotlight.lateTarget";
    let shown = 0;
    const lateScenario = createScenario("test.spotlight.wait", {
      id: "late",
      targetId: lateTargetId,
      title: "Late target",
      description: "Late target description",
      missingTarget: { kind: "wait", timeoutMs: 500 },
      advanceOnTargetClick: true,
      openTarget: true,
      onBeforeShow: () => {
        disposables.add(disposableTimeout(() => {
          const target = createTarget(container, lateTargetId, { open: () => target.click() });
        }, 100));
      }
    });
    const lateResult = await presentation.run(lateScenario, { targetWindow: mainWindow, onAbort: Event.None, onDidShow: () => shown++ });
    const missingScenario = createScenario("test.spotlight.skip", {
      id: "missing",
      targetId: "test.spotlight.missingTarget",
      title: "Missing target",
      description: "Missing target description",
      missingTarget: { kind: "skip" }
    });
    const missingResult = await presentation.run(missingScenario, { targetWindow: mainWindow, onAbort: Event.None, onDidShow: () => shown++ });
    assert.deepStrictEqual({ lateResult, missingResult, shown }, {
      lateResult: {
        outcome: OnboardingOutcome.Completed,
        shown: true,
        dismissReason: OnboardingDismissReason.TargetClick,
        lastStepIndex: 0,
        stepCount: 1
      },
      missingResult: {
        outcome: OnboardingOutcome.Completed,
        shown: false,
        dismissReason: OnboardingDismissReason.Completed,
        lastStepIndex: 0,
        stepCount: 1
      },
      shown: 1
    });
  });
  test("excludes skipped steps from displayed progress", async () => {
    const container = createContainer();
    const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
    const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService));
    const progress = [];
    const createAdvancingTarget = (id) => {
      const target = createTarget(container, id, {
        open: () => {
          const buttons = Array.from(container.getElementsByClassName("monaco-button"));
          progress.push({
            counter: container.getElementsByClassName("spotlight-callout-counter")[0].textContent,
            backHidden: buttons[1].style.display === "none",
            nextLabel: buttons[2].textContent
          });
          target.click();
        }
      });
      return target;
    };
    createAdvancingTarget("test.spotlight.second");
    createAdvancingTarget("test.spotlight.third");
    const result = await presentation.run(createScenario(
      "test.spotlight.skippedProgress",
      {
        id: "first",
        targetId: "test.spotlight.first",
        title: "First",
        description: "Skipped first step",
        when: ContextKeyExpr.equals("testSpotlightShowFirst", true)
      },
      {
        id: "second",
        targetId: "test.spotlight.second",
        title: "Second",
        description: "First visible step",
        openTarget: true,
        advanceOnTargetClick: true
      },
      {
        id: "third",
        targetId: "test.spotlight.third",
        title: "Third",
        description: "Second visible step",
        openTarget: true,
        advanceOnTargetClick: true
      }
    ), { targetWindow: mainWindow, onAbort: Event.None });
    assert.deepStrictEqual({ progress, result }, {
      progress: [
        { counter: "1 of 2", backHidden: true, nextLabel: "Next" },
        { counter: "2 of 2", backHidden: false, nextLabel: "Done" }
      ],
      result: {
        outcome: OnboardingOutcome.Completed,
        shown: true,
        dismissReason: OnboardingDismissReason.TargetClick,
        lastStepIndex: 2,
        stepCount: 3
      }
    });
  });
  test("hides the previous step while waiting for the next target", async () => {
    const container = createContainer();
    const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
    const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService));
    const firstTarget = createTarget(container, "test.spotlight.firstVisible", { open: () => firstTarget.click() });
    let hiddenWhileWaiting = false;
    const result = await presentation.run(createScenario(
      "test.spotlight.hiddenWhileWaiting",
      {
        id: "first",
        targetId: "test.spotlight.firstVisible",
        title: "First",
        description: "First step",
        openTarget: true,
        advanceOnTargetClick: true
      },
      {
        id: "second",
        targetId: "test.spotlight.secondLate",
        title: "Second",
        description: "Late second step",
        missingTarget: { kind: "wait", timeoutMs: 500 },
        openTarget: true,
        advanceOnTargetClick: true,
        onBeforeShow: () => {
          const overlay = container.getElementsByClassName("spotlight-overlay")[0];
          hiddenWhileWaiting = overlay.style.display === "none";
          disposables.add(disposableTimeout(() => {
            const target = createTarget(container, "test.spotlight.secondLate", { open: () => target.click() });
          }, 100));
        }
      }
    ), { targetWindow: mainWindow, onAbort: Event.None });
    assert.deepStrictEqual({ hiddenWhileWaiting, result }, {
      hiddenWhileWaiting: true,
      result: {
        outcome: OnboardingOutcome.Completed,
        shown: true,
        dismissReason: OnboardingDismissReason.TargetClick,
        lastStepIndex: 1,
        stepCount: 2
      }
    });
  });
  test("aborts immediately while waiting for a target", async () => {
    const container = createContainer();
    const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
    const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService));
    const abort = disposables.add(new Emitter());
    const result = await presentation.run(createScenario("test.spotlight.abortWait", {
      id: "missing",
      targetId: "test.spotlight.abortMissing",
      title: "Missing",
      description: "Missing target",
      missingTarget: { kind: "wait", timeoutMs: 6e4 },
      onBeforeShow: () => {
        disposables.add(disposableTimeout(() => abort.fire(), 0));
      }
    }), { targetWindow: mainWindow, onAbort: abort.event });
    assert.deepStrictEqual(result, {
      outcome: OnboardingOutcome.Aborted,
      shown: false,
      dismissReason: OnboardingDismissReason.Aborted,
      lastStepIndex: 0,
      stepCount: 1
    });
  });
  test("opens the target and advances when its context condition becomes true", async () => {
    const container = createContainer();
    const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
    const workspaceSelected = contextKeyService.createKey("testSpotlightWorkspaceSelected", false);
    const target = createTarget(container, "test.spotlight.workspace");
    let stateAtOpen;
    disposables.add(markOnboardingTarget(target, "test.spotlight.workspace", {
      open: () => {
        const overlay = container.getElementsByClassName("spotlight-overlay")[0];
        const buttons = Array.from(container.getElementsByClassName("monaco-button"));
        stateAtOpen = {
          nextHidden: buttons.at(-1)?.style.display === "none",
          targetOverlayVisible: overlay.classList.contains("target-overlay-visible")
        };
        workspaceSelected.set(true);
      }
    }));
    const presentation = disposables.add(new SpotlightPresentation(new SpotlightTestLayoutService(container), new TestHostService(), contextKeyService));
    const result = await presentation.run(createScenario("test.spotlight.advanceWhen", {
      id: "workspace",
      targetId: "test.spotlight.workspace",
      title: "Workspace",
      description: "Choose a workspace",
      openTarget: true,
      allowTargetInteraction: true,
      advanceWhen: ContextKeyExpr.equals("testSpotlightWorkspaceSelected", true)
    }), { targetWindow: mainWindow, onAbort: Event.None });
    assert.deepStrictEqual({ stateAtOpen, result }, {
      stateAtOpen: { nextHidden: true, targetOverlayVisible: true },
      result: {
        outcome: OnboardingOutcome.Completed,
        shown: true,
        dismissReason: OnboardingDismissReason.Completed,
        lastStepIndex: 0,
        stepCount: 1
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG9uYm9hcmRpbmdcXHRlc3RcXGJyb3dzZXJcXHNwb3RsaWdodFByZXNlbnRhdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgJCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9icm93c2VyL2NvbnRleHRLZXlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RIb3N0U2VydmljZSwgVGVzdExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFNwb3RsaWdodFByZXNlbnRhdGlvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc3BvdGxpZ2h0L3Nwb3RsaWdodFByZXNlbnRhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT25ib2FyZGluZ1RhcmdldE9wdGlvbnMsIG1hcmtPbmJvYXJkaW5nVGFyZ2V0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zcG90bGlnaHQvb25ib2FyZGluZ1RhcmdldC5qcyc7XG5pbXBvcnQgeyBJU3BvdGxpZ2h0UGF5bG9hZCwgSVNwb3RsaWdodFN0ZXAsIFNQT1RMSUdIVF9QUkVTRU5UQVRJT05fS0lORCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc3BvdGxpZ2h0L3Nwb3RsaWdodFR5cGVzLmpzJztcbmltcG9ydCB7IElPbmJvYXJkaW5nU2NlbmFyaW8sIE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLCBPbmJvYXJkaW5nT3V0Y29tZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9vbmJvYXJkaW5nU2NlbmFyaW8uanMnO1xuXG5jbGFzcyBTcG90bGlnaHRUZXN0TGF5b3V0U2VydmljZSBleHRlbmRzIFRlc3RMYXlvdXRTZXJ2aWNlIHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRDb250YWluZXIoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9jb250YWluZXI7XG5cdH1cbn1cblxuc3VpdGUoJ1Nwb3RsaWdodFByZXNlbnRhdGlvbicsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUNvbnRhaW5lcigpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gJCgnLnNwb3RsaWdodC1wcmVzZW50YXRpb24tdGVzdCcpO1xuXHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IGNvbnRhaW5lci5yZW1vdmUoKSB9KTtcblx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlVGFyZ2V0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGlkOiBzdHJpbmcsIG9wdGlvbnM/OiBJT25ib2FyZGluZ1RhcmdldE9wdGlvbnMpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gJCgnYnV0dG9uJyk7XG5cdFx0dGFyZ2V0LnN0eWxlLnBvc2l0aW9uID0gJ2ZpeGVkJztcblx0XHR0YXJnZXQuc3R5bGUubGVmdCA9ICcxMDBweCc7XG5cdFx0dGFyZ2V0LnN0eWxlLnRvcCA9ICcxMDBweCc7XG5cdFx0dGFyZ2V0LnN0eWxlLndpZHRoID0gJzEwMHB4Jztcblx0XHR0YXJnZXQuc3R5bGUuaGVpZ2h0ID0gJzMwcHgnO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0YXJnZXQpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYXJrT25ib2FyZGluZ1RhcmdldCh0YXJnZXQsIGlkLCBvcHRpb25zKSk7XG5cdFx0cmV0dXJuIHRhcmdldDtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVNjZW5hcmlvKGlkOiBzdHJpbmcsIC4uLnN0ZXBzOiBJU3BvdGxpZ2h0U3RlcFtdKTogSU9uYm9hcmRpbmdTY2VuYXJpbzxJU3BvdGxpZ2h0UGF5bG9hZD4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZCxcblx0XHRcdHRyaWdnZXI6IHsga2luZDogJ2F1dG8nIH0sXG5cdFx0XHRwcmVzZW50YXRpb246IHtcblx0XHRcdFx0a2luZDogU1BPVExJR0hUX1BSRVNFTlRBVElPTl9LSU5ELFxuXHRcdFx0XHRwYXlsb2FkOiB7IHN0ZXBzIH0sXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCd3YWl0cyBmb3IgYSBsYXRlIHRhcmdldCBhbmQgc2tpcHMgYSBtaXNzaW5nIHRhcmdldCBpbW1lZGlhdGVseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBjcmVhdGVDb250YWluZXIoKTtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ29udGV4dEtleVNlcnZpY2UobmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTcG90bGlnaHRQcmVzZW50YXRpb24obmV3IFNwb3RsaWdodFRlc3RMYXlvdXRTZXJ2aWNlKGNvbnRhaW5lciksIG5ldyBUZXN0SG9zdFNlcnZpY2UoKSwgY29udGV4dEtleVNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IGxhdGVUYXJnZXRJZCA9ICd0ZXN0LnNwb3RsaWdodC5sYXRlVGFyZ2V0Jztcblx0XHRsZXQgc2hvd24gPSAwO1xuXHRcdGNvbnN0IGxhdGVTY2VuYXJpbyA9IGNyZWF0ZVNjZW5hcmlvKCd0ZXN0LnNwb3RsaWdodC53YWl0Jywge1xuXHRcdFx0aWQ6ICdsYXRlJyxcblx0XHRcdHRhcmdldElkOiBsYXRlVGFyZ2V0SWQsXG5cdFx0XHR0aXRsZTogJ0xhdGUgdGFyZ2V0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnTGF0ZSB0YXJnZXQgZGVzY3JpcHRpb24nLFxuXHRcdFx0bWlzc2luZ1RhcmdldDogeyBraW5kOiAnd2FpdCcsIHRpbWVvdXRNczogNTAwIH0sXG5cdFx0XHRhZHZhbmNlT25UYXJnZXRDbGljazogdHJ1ZSxcblx0XHRcdG9wZW5UYXJnZXQ6IHRydWUsXG5cdFx0XHRvbkJlZm9yZVNob3c6ICgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVUYXJnZXQoY29udGFpbmVyLCBsYXRlVGFyZ2V0SWQsIHsgb3BlbjogKCkgPT4gdGFyZ2V0LmNsaWNrKCkgfSk7XG5cdFx0XHRcdH0sIDEwMCkpO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBsYXRlUmVzdWx0ID0gYXdhaXQgcHJlc2VudGF0aW9uLnJ1bihsYXRlU2NlbmFyaW8sIHsgdGFyZ2V0V2luZG93OiBtYWluV2luZG93LCBvbkFib3J0OiBFdmVudC5Ob25lLCBvbkRpZFNob3c6ICgpID0+IHNob3duKysgfSk7XG5cblx0XHRjb25zdCBtaXNzaW5nU2NlbmFyaW8gPSBjcmVhdGVTY2VuYXJpbygndGVzdC5zcG90bGlnaHQuc2tpcCcsIHtcblx0XHRcdGlkOiAnbWlzc2luZycsXG5cdFx0XHR0YXJnZXRJZDogJ3Rlc3Quc3BvdGxpZ2h0Lm1pc3NpbmdUYXJnZXQnLFxuXHRcdFx0dGl0bGU6ICdNaXNzaW5nIHRhcmdldCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ01pc3NpbmcgdGFyZ2V0IGRlc2NyaXB0aW9uJyxcblx0XHRcdG1pc3NpbmdUYXJnZXQ6IHsga2luZDogJ3NraXAnIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgbWlzc2luZ1Jlc3VsdCA9IGF3YWl0IHByZXNlbnRhdGlvbi5ydW4obWlzc2luZ1NjZW5hcmlvLCB7IHRhcmdldFdpbmRvdzogbWFpbldpbmRvdywgb25BYm9ydDogRXZlbnQuTm9uZSwgb25EaWRTaG93OiAoKSA9PiBzaG93bisrIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGxhdGVSZXN1bHQsIG1pc3NpbmdSZXN1bHQsIHNob3duIH0sIHtcblx0XHRcdGxhdGVSZXN1bHQ6IHtcblx0XHRcdFx0b3V0Y29tZTogT25ib2FyZGluZ091dGNvbWUuQ29tcGxldGVkLFxuXHRcdFx0XHRzaG93bjogdHJ1ZSxcblx0XHRcdFx0ZGlzbWlzc1JlYXNvbjogT25ib2FyZGluZ0Rpc21pc3NSZWFzb24uVGFyZ2V0Q2xpY2ssXG5cdFx0XHRcdGxhc3RTdGVwSW5kZXg6IDAsXG5cdFx0XHRcdHN0ZXBDb3VudDogMSxcblx0XHRcdH0sXG5cdFx0XHRtaXNzaW5nUmVzdWx0OiB7XG5cdFx0XHRcdG91dGNvbWU6IE9uYm9hcmRpbmdPdXRjb21lLkNvbXBsZXRlZCxcblx0XHRcdFx0c2hvd246IGZhbHNlLFxuXHRcdFx0XHRkaXNtaXNzUmVhc29uOiBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5Db21wbGV0ZWQsXG5cdFx0XHRcdGxhc3RTdGVwSW5kZXg6IDAsXG5cdFx0XHRcdHN0ZXBDb3VudDogMSxcblx0XHRcdH0sXG5cdFx0XHRzaG93bjogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgc2tpcHBlZCBzdGVwcyBmcm9tIGRpc3BsYXllZCBwcm9ncmVzcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBjcmVhdGVDb250YWluZXIoKTtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ29udGV4dEtleVNlcnZpY2UobmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTcG90bGlnaHRQcmVzZW50YXRpb24obmV3IFNwb3RsaWdodFRlc3RMYXlvdXRTZXJ2aWNlKGNvbnRhaW5lciksIG5ldyBUZXN0SG9zdFNlcnZpY2UoKSwgY29udGV4dEtleVNlcnZpY2UpKTtcblx0XHRjb25zdCBwcm9ncmVzczogeyByZWFkb25seSBjb3VudGVyOiBzdHJpbmcgfCBudWxsOyByZWFkb25seSBiYWNrSGlkZGVuOiBib29sZWFuOyByZWFkb25seSBuZXh0TGFiZWw6IHN0cmluZyB8IG51bGwgfVtdID0gW107XG5cblx0XHRjb25zdCBjcmVhdGVBZHZhbmNpbmdUYXJnZXQgPSAoaWQ6IHN0cmluZyk6IEhUTUxFbGVtZW50ID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVRhcmdldChjb250YWluZXIsIGlkLCB7XG5cdFx0XHRcdG9wZW46ICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBidXR0b25zID0gQXJyYXkuZnJvbShjb250YWluZXIuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZSgnbW9uYWNvLWJ1dHRvbicpKSBhcyBIVE1MRWxlbWVudFtdO1xuXHRcdFx0XHRcdHByb2dyZXNzLnB1c2goe1xuXHRcdFx0XHRcdFx0Y291bnRlcjogY29udGFpbmVyLmdldEVsZW1lbnRzQnlDbGFzc05hbWUoJ3Nwb3RsaWdodC1jYWxsb3V0LWNvdW50ZXInKVswXS50ZXh0Q29udGVudCxcblx0XHRcdFx0XHRcdGJhY2tIaWRkZW46IGJ1dHRvbnNbMV0uc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnLFxuXHRcdFx0XHRcdFx0bmV4dExhYmVsOiBidXR0b25zWzJdLnRleHRDb250ZW50LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRhcmdldC5jbGljaygpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gdGFyZ2V0O1xuXHRcdH07XG5cblx0XHRjcmVhdGVBZHZhbmNpbmdUYXJnZXQoJ3Rlc3Quc3BvdGxpZ2h0LnNlY29uZCcpO1xuXHRcdGNyZWF0ZUFkdmFuY2luZ1RhcmdldCgndGVzdC5zcG90bGlnaHQudGhpcmQnKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcmVzZW50YXRpb24ucnVuKGNyZWF0ZVNjZW5hcmlvKCd0ZXN0LnNwb3RsaWdodC5za2lwcGVkUHJvZ3Jlc3MnLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ2ZpcnN0Jyxcblx0XHRcdFx0dGFyZ2V0SWQ6ICd0ZXN0LnNwb3RsaWdodC5maXJzdCcsXG5cdFx0XHRcdHRpdGxlOiAnRmlyc3QnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1NraXBwZWQgZmlyc3Qgc3RlcCcsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndGVzdFNwb3RsaWdodFNob3dGaXJzdCcsIHRydWUpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdzZWNvbmQnLFxuXHRcdFx0XHR0YXJnZXRJZDogJ3Rlc3Quc3BvdGxpZ2h0LnNlY29uZCcsXG5cdFx0XHRcdHRpdGxlOiAnU2Vjb25kJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdGaXJzdCB2aXNpYmxlIHN0ZXAnLFxuXHRcdFx0XHRvcGVuVGFyZ2V0OiB0cnVlLFxuXHRcdFx0XHRhZHZhbmNlT25UYXJnZXRDbGljazogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAndGhpcmQnLFxuXHRcdFx0XHR0YXJnZXRJZDogJ3Rlc3Quc3BvdGxpZ2h0LnRoaXJkJyxcblx0XHRcdFx0dGl0bGU6ICdUaGlyZCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnU2Vjb25kIHZpc2libGUgc3RlcCcsXG5cdFx0XHRcdG9wZW5UYXJnZXQ6IHRydWUsXG5cdFx0XHRcdGFkdmFuY2VPblRhcmdldENsaWNrOiB0cnVlLFxuXHRcdFx0fSxcblx0XHQpLCB7IHRhcmdldFdpbmRvdzogbWFpbldpbmRvdywgb25BYm9ydDogRXZlbnQuTm9uZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBwcm9ncmVzcywgcmVzdWx0IH0sIHtcblx0XHRcdHByb2dyZXNzOiBbXG5cdFx0XHRcdHsgY291bnRlcjogJzEgb2YgMicsIGJhY2tIaWRkZW46IHRydWUsIG5leHRMYWJlbDogJ05leHQnIH0sXG5cdFx0XHRcdHsgY291bnRlcjogJzIgb2YgMicsIGJhY2tIaWRkZW46IGZhbHNlLCBuZXh0TGFiZWw6ICdEb25lJyB9LFxuXHRcdFx0XSxcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRvdXRjb21lOiBPbmJvYXJkaW5nT3V0Y29tZS5Db21wbGV0ZWQsXG5cdFx0XHRcdHNob3duOiB0cnVlLFxuXHRcdFx0XHRkaXNtaXNzUmVhc29uOiBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5UYXJnZXRDbGljayxcblx0XHRcdFx0bGFzdFN0ZXBJbmRleDogMixcblx0XHRcdFx0c3RlcENvdW50OiAzLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaGlkZXMgdGhlIHByZXZpb3VzIHN0ZXAgd2hpbGUgd2FpdGluZyBmb3IgdGhlIG5leHQgdGFyZ2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGNyZWF0ZUNvbnRhaW5lcigpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb250ZXh0S2V5U2VydmljZShuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNwb3RsaWdodFByZXNlbnRhdGlvbihuZXcgU3BvdGxpZ2h0VGVzdExheW91dFNlcnZpY2UoY29udGFpbmVyKSwgbmV3IFRlc3RIb3N0U2VydmljZSgpLCBjb250ZXh0S2V5U2VydmljZSkpO1xuXHRcdGNvbnN0IGZpcnN0VGFyZ2V0ID0gY3JlYXRlVGFyZ2V0KGNvbnRhaW5lciwgJ3Rlc3Quc3BvdGxpZ2h0LmZpcnN0VmlzaWJsZScsIHsgb3BlbjogKCkgPT4gZmlyc3RUYXJnZXQuY2xpY2soKSB9KTtcblx0XHRsZXQgaGlkZGVuV2hpbGVXYWl0aW5nID0gZmFsc2U7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcmVzZW50YXRpb24ucnVuKGNyZWF0ZVNjZW5hcmlvKCd0ZXN0LnNwb3RsaWdodC5oaWRkZW5XaGlsZVdhaXRpbmcnLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ2ZpcnN0Jyxcblx0XHRcdFx0dGFyZ2V0SWQ6ICd0ZXN0LnNwb3RsaWdodC5maXJzdFZpc2libGUnLFxuXHRcdFx0XHR0aXRsZTogJ0ZpcnN0Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdGaXJzdCBzdGVwJyxcblx0XHRcdFx0b3BlblRhcmdldDogdHJ1ZSxcblx0XHRcdFx0YWR2YW5jZU9uVGFyZ2V0Q2xpY2s6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3NlY29uZCcsXG5cdFx0XHRcdHRhcmdldElkOiAndGVzdC5zcG90bGlnaHQuc2Vjb25kTGF0ZScsXG5cdFx0XHRcdHRpdGxlOiAnU2Vjb25kJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdMYXRlIHNlY29uZCBzdGVwJyxcblx0XHRcdFx0bWlzc2luZ1RhcmdldDogeyBraW5kOiAnd2FpdCcsIHRpbWVvdXRNczogNTAwIH0sXG5cdFx0XHRcdG9wZW5UYXJnZXQ6IHRydWUsXG5cdFx0XHRcdGFkdmFuY2VPblRhcmdldENsaWNrOiB0cnVlLFxuXHRcdFx0XHRvbkJlZm9yZVNob3c6ICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBvdmVybGF5ID0gY29udGFpbmVyLmdldEVsZW1lbnRzQnlDbGFzc05hbWUoJ3Nwb3RsaWdodC1vdmVybGF5JylbMF0gYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRcdFx0aGlkZGVuV2hpbGVXYWl0aW5nID0gb3ZlcmxheS5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZSc7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVRhcmdldChjb250YWluZXIsICd0ZXN0LnNwb3RsaWdodC5zZWNvbmRMYXRlJywgeyBvcGVuOiAoKSA9PiB0YXJnZXQuY2xpY2soKSB9KTtcblx0XHRcdFx0XHR9LCAxMDApKTtcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0KSwgeyB0YXJnZXRXaW5kb3c6IG1haW5XaW5kb3csIG9uQWJvcnQ6IEV2ZW50Lk5vbmUgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgaGlkZGVuV2hpbGVXYWl0aW5nLCByZXN1bHQgfSwge1xuXHRcdFx0aGlkZGVuV2hpbGVXYWl0aW5nOiB0cnVlLFxuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdG91dGNvbWU6IE9uYm9hcmRpbmdPdXRjb21lLkNvbXBsZXRlZCxcblx0XHRcdFx0c2hvd246IHRydWUsXG5cdFx0XHRcdGRpc21pc3NSZWFzb246IE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLlRhcmdldENsaWNrLFxuXHRcdFx0XHRsYXN0U3RlcEluZGV4OiAxLFxuXHRcdFx0XHRzdGVwQ291bnQ6IDIsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhYm9ydHMgaW1tZWRpYXRlbHkgd2hpbGUgd2FpdGluZyBmb3IgYSB0YXJnZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gY3JlYXRlQ29udGFpbmVyKCk7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENvbnRleHRLZXlTZXJ2aWNlKG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU3BvdGxpZ2h0UHJlc2VudGF0aW9uKG5ldyBTcG90bGlnaHRUZXN0TGF5b3V0U2VydmljZShjb250YWluZXIpLCBuZXcgVGVzdEhvc3RTZXJ2aWNlKCksIGNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgYWJvcnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcmVzZW50YXRpb24ucnVuKGNyZWF0ZVNjZW5hcmlvKCd0ZXN0LnNwb3RsaWdodC5hYm9ydFdhaXQnLCB7XG5cdFx0XHRpZDogJ21pc3NpbmcnLFxuXHRcdFx0dGFyZ2V0SWQ6ICd0ZXN0LnNwb3RsaWdodC5hYm9ydE1pc3NpbmcnLFxuXHRcdFx0dGl0bGU6ICdNaXNzaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnTWlzc2luZyB0YXJnZXQnLFxuXHRcdFx0bWlzc2luZ1RhcmdldDogeyBraW5kOiAnd2FpdCcsIHRpbWVvdXRNczogNjBfMDAwIH0sXG5cdFx0XHRvbkJlZm9yZVNob3c6ICgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IGFib3J0LmZpcmUoKSwgMCkpO1xuXHRcdFx0fSxcblx0XHR9KSwgeyB0YXJnZXRXaW5kb3c6IG1haW5XaW5kb3csIG9uQWJvcnQ6IGFib3J0LmV2ZW50IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdG91dGNvbWU6IE9uYm9hcmRpbmdPdXRjb21lLkFib3J0ZWQsXG5cdFx0XHRzaG93bjogZmFsc2UsXG5cdFx0XHRkaXNtaXNzUmVhc29uOiBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5BYm9ydGVkLFxuXHRcdFx0bGFzdFN0ZXBJbmRleDogMCxcblx0XHRcdHN0ZXBDb3VudDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb3BlbnMgdGhlIHRhcmdldCBhbmQgYWR2YW5jZXMgd2hlbiBpdHMgY29udGV4dCBjb25kaXRpb24gYmVjb21lcyB0cnVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGNyZWF0ZUNvbnRhaW5lcigpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb250ZXh0S2V5U2VydmljZShuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VTZWxlY3RlZCA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleTxib29sZWFuPigndGVzdFNwb3RsaWdodFdvcmtzcGFjZVNlbGVjdGVkJywgZmFsc2UpO1xuXHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVRhcmdldChjb250YWluZXIsICd0ZXN0LnNwb3RsaWdodC53b3Jrc3BhY2UnKTtcblx0XHRsZXQgc3RhdGVBdE9wZW46IHsgcmVhZG9ubHkgbmV4dEhpZGRlbjogYm9vbGVhbjsgcmVhZG9ubHkgdGFyZ2V0T3ZlcmxheVZpc2libGU6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZDtcblx0XHRkaXNwb3NhYmxlcy5hZGQobWFya09uYm9hcmRpbmdUYXJnZXQodGFyZ2V0LCAndGVzdC5zcG90bGlnaHQud29ya3NwYWNlJywge1xuXHRcdFx0b3BlbjogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBvdmVybGF5ID0gY29udGFpbmVyLmdldEVsZW1lbnRzQnlDbGFzc05hbWUoJ3Nwb3RsaWdodC1vdmVybGF5JylbMF0gYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRcdGNvbnN0IGJ1dHRvbnMgPSBBcnJheS5mcm9tKGNvbnRhaW5lci5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdtb25hY28tYnV0dG9uJykpIGFzIEhUTUxFbGVtZW50W107XG5cdFx0XHRcdHN0YXRlQXRPcGVuID0ge1xuXHRcdFx0XHRcdG5leHRIaWRkZW46IGJ1dHRvbnMuYXQoLTEpPy5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZScsXG5cdFx0XHRcdFx0dGFyZ2V0T3ZlcmxheVZpc2libGU6IG92ZXJsYXkuY2xhc3NMaXN0LmNvbnRhaW5zKCd0YXJnZXQtb3ZlcmxheS12aXNpYmxlJyksXG5cdFx0XHRcdH07XG5cdFx0XHRcdHdvcmtzcGFjZVNlbGVjdGVkLnNldCh0cnVlKTtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTcG90bGlnaHRQcmVzZW50YXRpb24obmV3IFNwb3RsaWdodFRlc3RMYXlvdXRTZXJ2aWNlKGNvbnRhaW5lciksIG5ldyBUZXN0SG9zdFNlcnZpY2UoKSwgY29udGV4dEtleVNlcnZpY2UpKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcmVzZW50YXRpb24ucnVuKGNyZWF0ZVNjZW5hcmlvKCd0ZXN0LnNwb3RsaWdodC5hZHZhbmNlV2hlbicsIHtcblx0XHRcdGlkOiAnd29ya3NwYWNlJyxcblx0XHRcdHRhcmdldElkOiAndGVzdC5zcG90bGlnaHQud29ya3NwYWNlJyxcblx0XHRcdHRpdGxlOiAnV29ya3NwYWNlJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnQ2hvb3NlIGEgd29ya3NwYWNlJyxcblx0XHRcdG9wZW5UYXJnZXQ6IHRydWUsXG5cdFx0XHRhbGxvd1RhcmdldEludGVyYWN0aW9uOiB0cnVlLFxuXHRcdFx0YWR2YW5jZVdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndGVzdFNwb3RsaWdodFdvcmtzcGFjZVNlbGVjdGVkJywgdHJ1ZSksXG5cdFx0fSksIHsgdGFyZ2V0V2luZG93OiBtYWluV2luZG93LCBvbkFib3J0OiBFdmVudC5Ob25lIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHN0YXRlQXRPcGVuLCByZXN1bHQgfSwge1xuXHRcdFx0c3RhdGVBdE9wZW46IHsgbmV4dEhpZGRlbjogdHJ1ZSwgdGFyZ2V0T3ZlcmxheVZpc2libGU6IHRydWUgfSxcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRvdXRjb21lOiBPbmJvYXJkaW5nT3V0Y29tZS5Db21wbGV0ZWQsXG5cdFx0XHRcdHNob3duOiB0cnVlLFxuXHRcdFx0XHRkaXNtaXNzUmVhc29uOiBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5Db21wbGV0ZWQsXG5cdFx0XHRcdGxhc3RTdGVwSW5kZXg6IDAsXG5cdFx0XHRcdHN0ZXBDb3VudDogMSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxTQUFTO0FBQ2xCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUJBQWlCLHlCQUF5QjtBQUNuRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFtQyw0QkFBNEI7QUFDL0QsU0FBNEMsbUNBQW1DO0FBQy9FLFNBQThCLHlCQUF5Qix5QkFBeUI7QUFFaEYsTUFBTSxtQ0FBbUMsa0JBQWtCO0FBQUEsRUFDMUQsWUFBNkIsWUFBeUI7QUFDckQsVUFBTTtBQURzQjtBQUFBLEVBRTdCO0FBQUEsRUFFUyxlQUE0QjtBQUNwQyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQ0Q7QUFFQSxNQUFNLHlCQUF5QixNQUFNO0FBRXBDLFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsV0FBUyxrQkFBK0I7QUFDdkMsVUFBTSxZQUFZLEVBQUUsOEJBQThCO0FBQ2xELGVBQVcsU0FBUyxLQUFLLFlBQVksU0FBUztBQUM5QyxnQkFBWSxJQUFJLEVBQUUsU0FBUyxNQUFNLFVBQVUsT0FBTyxFQUFFLENBQUM7QUFDckQsV0FBTztBQUFBLEVBQ1I7QUFFQSxXQUFTLGFBQWEsV0FBd0IsSUFBWSxTQUFpRDtBQUMxRyxVQUFNLFNBQVMsRUFBRSxRQUFRO0FBQ3pCLFdBQU8sTUFBTSxXQUFXO0FBQ3hCLFdBQU8sTUFBTSxPQUFPO0FBQ3BCLFdBQU8sTUFBTSxNQUFNO0FBQ25CLFdBQU8sTUFBTSxRQUFRO0FBQ3JCLFdBQU8sTUFBTSxTQUFTO0FBQ3RCLGNBQVUsWUFBWSxNQUFNO0FBQzVCLGdCQUFZLElBQUkscUJB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
