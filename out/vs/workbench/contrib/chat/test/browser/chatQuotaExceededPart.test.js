import assert from "assert";
import { mainWindow } from "../../../../../base/browser/window.js";
import { Event } from "../../../../../base/common/event.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ChatEntitlement } from "../../../../services/chat/common/chatEntitlementService.js";
import { ChatQuotaExceededPart } from "../../browser/widget/chatContentParts/chatQuotaExceededPart.js";
function createMockEntitlementService(entitlement) {
  return {
    _serviceBrand: void 0,
    entitlement,
    entitlementObs: observableValue({}, entitlement),
    onDidChangeEntitlement: Event.None,
    onDidChangeQuotaExceeded: Event.None,
    onDidChangeQuotaRemaining: Event.None,
    onDidChangeUsageBasedBilling: Event.None,
    quotas: {},
    organisations: void 0,
    isInternal: false,
    sku: void 0,
    copilotTrackingId: void 0,
    clientByokEnabled: false,
    hasByokModels: false,
    onDidChangeSentiment: Event.None,
    sentiment: {},
    sentimentObs: observableValue({}, {}),
    onDidChangeAnonymous: Event.None,
    anonymous: false,
    anonymousObs: observableValue({}, false),
    acceptQuotas() {
    },
    clearQuotas() {
    },
    markAnonymousRateLimited() {
    },
    markSetupCompleted() {
    },
    setForceHidden() {
    },
    update() {
      return Promise.resolve();
    }
  };
}
function createMockRenderer() {
  return {
    render(markdown) {
      const el = mainWindow.document.createElement("div");
      el.textContent = markdown.value;
      return { element: el, dispose() {
      } };
    },
    dispose() {
    }
  };
}
function createMockElement(errorDetails) {
  return {
    errorDetails,
    sessionResource: URI.parse("test://session")
  };
}
function createMockContent() {
  return {
    kind: "errorDetails",
    errorDetails: { message: "test", isQuotaExceeded: true },
    isLast: true
  };
}
suite("ChatQuotaExceededPart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let executedCommands;
  function createWidget(entitlement, errorDetails) {
    executedCommands = [];
    const commandService = {
      executeCommand(id) {
        executedCommands.push(id);
        return Promise.resolve();
      }
    };
    const telemetryService = {
      publicLog2() {
      }
    };
    const entitlementService = createMockEntitlementService(entitlement);
    const renderer = createMockRenderer();
    const element = createMockElement(errorDetails);
    const content = createMockContent();
    const widget = new ChatQuotaExceededPart(
      element,
      content,
      renderer,
      commandService,
      telemetryService,
      entitlementService
    );
    store.add(widget);
    mainWindow.document.body.appendChild(widget.domNode);
    return widget;
  }
  function getPrimaryButton(widget) {
    return widget.domNode.querySelector(".chat-quota-error-button");
  }
  teardown(() => {
    for (const el of mainWindow.document.body.querySelectorAll(".chat-quota-error-widget")) {
      el.remove();
    }
  });
  suite("button label", () => {
    test('shows "Manage Budget" for Pro user without additional_spend_limit_reached', () => {
      const widget = createWidget(ChatEntitlement.Pro, {
        message: "Quota exceeded",
        isQuotaExceeded: true
      });
      const button = getPrimaryButton(widget);
      assert.ok(button);
      assert.strictEqual(button.textContent, "Manage Budget");
    });
    test('shows "Upgrade to GitHub Copilot Pro" for Free user', () => {
      const widget = createWidget(ChatEntitlement.Free, {
        message: "Quota exceeded",
        isQuotaExceeded: true
      });
      const button = getPrimaryButton(widget);
      assert.ok(button);
      assert.strictEqual(button.textContent, "Upgrade to GitHub Copilot Pro");
    });
    test('shows "Manage Budget" for Pro user with additional_spend_limit_reached', () => {
      const widget = createWidget(ChatEntitlement.Pro, {
        message: "Spend limit reached",
        isQuotaExceeded: true,
        code: "additional_spend_limit_reached"
      });
      const button = getPrimaryButton(widget);
      assert.ok(button);
      assert.strictEqual(button.textContent, "Manage Budget");
    });
    test('shows "Manage Budget" for ProPlus user with additional_spend_limit_reached', () => {
      const widget = createWidget(ChatEntitlement.ProPlus, {
        message: "Spend limit reached",
        isQuotaExceeded: true,
        code: "additional_spend_limit_reached"
      });
      const button = getPrimaryButton(widget);
      assert.ok(button);
      assert.strictEqual(button.textContent, "Manage Budget");
    });
    test('shows "Manage Budget" for EDU user without additional_spend_limit_reached', () => {
      const widget = createWidget(ChatEntitlement.EDU, {
        message: "Quota exceeded",
        isQuotaExceeded: true
      });
      const button = getPrimaryButton(widget);
      assert.ok(button);
      assert.strictEqual(button.textContent, "Manage Budget");
    });
  });
  suite("button command", () => {
    test('Pro user clicks "Manage Budget" -> manageAdditionalSpend', async () => {
      const widget = createWidget(ChatEntitlement.Pro, {
        message: "Quota exceeded",
        isQuotaExceeded: true
      });
      const button = getPrimaryButton(widget);
      assert.ok(button);
      button.click();
      await new Promise((r) => setTimeout(r, 0));
      assert.strictEqual(executedCommands[0], "workbench.action.chat.manageAdditionalSpend");
    });
    test('Free user clicks "Upgrade" -> upgradePlan', async () => {
      const widget = createWidget(ChatEntitlement.Free, {
        message: "Quota exceeded",
        isQuotaExceeded: true
      });
      const button = getPrimaryButton(widget);
      assert.ok(button);
      button.click();
      await new Promise((r) => setTimeout(r, 0));
      assert.strictEqual(executedCommands[0], "workbench.action.chat.upgradePlan");
    });
    test('Pro user with additional_spend_limit_reached clicks "Manage Budget" -> manageAdditionalSpend', async () => {
      const widget = createWidget(ChatEntitlement.Pro, {
        message: "Spend limit reached",
        isQuotaExceeded: true,
        code: "additional_spend_limit_reached"
      });
      const button = getPrimaryButton(widget);
      assert.ok(button);
      button.click();
      await new Promise((r) => setTimeout(r, 0));
      assert.strictEqual(executedCommands[0], "workbench.action.chat.manageAdditionalSpend");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRRdW90YUV4Y2VlZGVkUGFydC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50LCBJQ2hhdEVudGl0bGVtZW50U2VydmljZSwgSUNoYXRTZW50aW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVzcG9uc2VFcnJvckRldGFpbHMgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRFcnJvckRldGFpbHNQYXJ0LCBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFF1b3RhRXhjZWVkZWRQYXJ0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0UXVvdGFFeGNlZWRlZFBhcnQuanMnO1xuXG5cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tFbnRpdGxlbWVudFNlcnZpY2UoZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudCk6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHtcblx0cmV0dXJuIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0ZW50aXRsZW1lbnQsXG5cdFx0ZW50aXRsZW1lbnRPYnM6IG9ic2VydmFibGVWYWx1ZSh7fSwgZW50aXRsZW1lbnQpLFxuXHRcdG9uRGlkQ2hhbmdlRW50aXRsZW1lbnQ6IEV2ZW50Lk5vbmUsXG5cdFx0b25EaWRDaGFuZ2VRdW90YUV4Y2VlZGVkOiBFdmVudC5Ob25lLFxuXHRcdG9uRGlkQ2hhbmdlUXVvdGFSZW1haW5pbmc6IEV2ZW50Lk5vbmUsXG5cdFx0b25EaWRDaGFuZ2VVc2FnZUJhc2VkQmlsbGluZzogRXZlbnQuTm9uZSxcblx0XHRxdW90YXM6IHt9LFxuXHRcdG9yZ2FuaXNhdGlvbnM6IHVuZGVmaW5lZCxcblx0XHRpc0ludGVybmFsOiBmYWxzZSxcblx0XHRza3U6IHVuZGVmaW5lZCxcblx0XHRjb3BpbG90VHJhY2tpbmdJZDogdW5kZWZpbmVkLFxuXHRcdGNsaWVudEJ5b2tFbmFibGVkOiBmYWxzZSxcblx0XHRoYXNCeW9rTW9kZWxzOiBmYWxzZSxcblx0XHRvbkRpZENoYW5nZVNlbnRpbWVudDogRXZlbnQuTm9uZSxcblx0XHRzZW50aW1lbnQ6IHt9IGFzIElDaGF0U2VudGltZW50LFxuXHRcdHNlbnRpbWVudE9iczogb2JzZXJ2YWJsZVZhbHVlKHt9LCB7fSBhcyBJQ2hhdFNlbnRpbWVudCksXG5cdFx0b25EaWRDaGFuZ2VBbm9ueW1vdXM6IEV2ZW50Lk5vbmUsXG5cdFx0YW5vbnltb3VzOiBmYWxzZSxcblx0XHRhbm9ueW1vdXNPYnM6IG9ic2VydmFibGVWYWx1ZSh7fSwgZmFsc2UpLFxuXHRcdGFjY2VwdFF1b3RhcygpIHsgfSxcblx0XHRjbGVhclF1b3RhcygpIHsgfSxcblx0XHRtYXJrQW5vbnltb3VzUmF0ZUxpbWl0ZWQoKSB7IH0sXG5cdFx0bWFya1NldHVwQ29tcGxldGVkKCkgeyB9LFxuXHRcdHNldEZvcmNlSGlkZGVuKCkgeyB9LFxuXHRcdHVwZGF0ZSgpIHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpOyB9LFxuXHR9IGFzIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrUmVuZGVyZXIoKTogSU1hcmtkb3duUmVuZGVyZXIge1xuXHRyZXR1cm4ge1xuXHRcdHJlbmRlcihtYXJrZG93bjogTWFya2Rvd25TdHJpbmcpIHtcblx0XHRcdGNvbnN0IGVsID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdGVsLnRleHRDb250ZW50ID0gbWFya2Rvd24udmFsdWU7XG5cdFx0XHRyZXR1cm4geyBlbGVtZW50OiBlbCwgZGlzcG9zZSgpIHsgfSB9O1xuXHRcdH0sXG5cdFx0ZGlzcG9zZSgpIHsgfSxcblx0fSBhcyB1bmtub3duIGFzIElNYXJrZG93blJlbmRlcmVyO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrRWxlbWVudChlcnJvckRldGFpbHM6IElDaGF0UmVzcG9uc2VFcnJvckRldGFpbHMpOiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIHtcblx0cmV0dXJuIHtcblx0XHRlcnJvckRldGFpbHMsXG5cdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyksXG5cdH0gYXMgdW5rbm93biBhcyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrQ29udGVudCgpOiBJQ2hhdEVycm9yRGV0YWlsc1BhcnQge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6ICdlcnJvckRldGFpbHMnLFxuXHRcdGVycm9yRGV0YWlsczogeyBtZXNzYWdlOiAndGVzdCcsIGlzUXVvdGFFeGNlZWRlZDogdHJ1ZSB9LFxuXHRcdGlzTGFzdDogdHJ1ZSxcblx0fTtcbn1cblxuc3VpdGUoJ0NoYXRRdW90YUV4Y2VlZGVkUGFydCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgZXhlY3V0ZWRDb21tYW5kczogc3RyaW5nW107XG5cblx0ZnVuY3Rpb24gY3JlYXRlV2lkZ2V0KGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQsIGVycm9yRGV0YWlsczogSUNoYXRSZXNwb25zZUVycm9yRGV0YWlscyk6IENoYXRRdW90YUV4Y2VlZGVkUGFydCB7XG5cdFx0ZXhlY3V0ZWRDb21tYW5kcyA9IFtdO1xuXG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSB7XG5cdFx0XHRleGVjdXRlQ29tbWFuZChpZDogc3RyaW5nKSB7XG5cdFx0XHRcdGV4ZWN1dGVkQ29tbWFuZHMucHVzaChpZCk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElDb21tYW5kU2VydmljZTtcblx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0ge1xuXHRcdFx0cHVibGljTG9nMigpIHsgfSxcblx0XHR9IGFzIHVua25vd24gYXMgSVRlbGVtZXRyeVNlcnZpY2U7XG5cdFx0Y29uc3QgZW50aXRsZW1lbnRTZXJ2aWNlID0gY3JlYXRlTW9ja0VudGl0bGVtZW50U2VydmljZShlbnRpdGxlbWVudCk7XG5cdFx0Y29uc3QgcmVuZGVyZXIgPSBjcmVhdGVNb2NrUmVuZGVyZXIoKTtcblxuXHRcdGNvbnN0IGVsZW1lbnQgPSBjcmVhdGVNb2NrRWxlbWVudChlcnJvckRldGFpbHMpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBjcmVhdGVNb2NrQ29udGVudCgpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gbmV3IENoYXRRdW90YUV4Y2VlZGVkUGFydChcblx0XHRcdGVsZW1lbnQsXG5cdFx0XHRjb250ZW50LFxuXHRcdFx0cmVuZGVyZXIsXG5cdFx0XHRjb21tYW5kU2VydmljZSxcblx0XHRcdHRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRlbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0KTtcblx0XHRzdG9yZS5hZGQod2lkZ2V0KTtcblx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQod2lkZ2V0LmRvbU5vZGUpO1xuXHRcdHJldHVybiB3aWRnZXQ7XG5cdH1cblxuXHRmdW5jdGlvbiBnZXRQcmltYXJ5QnV0dG9uKHdpZGdldDogQ2hhdFF1b3RhRXhjZWVkZWRQYXJ0KTogSFRNTEVsZW1lbnQgfCBudWxsIHtcblx0XHRyZXR1cm4gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVvdGEtZXJyb3ItYnV0dG9uJyk7XG5cdH1cblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0Zm9yIChjb25zdCBlbCBvZiBtYWluV2luZG93LmRvY3VtZW50LmJvZHkucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtcXVvdGEtZXJyb3Itd2lkZ2V0JykpIHtcblx0XHRcdGVsLnJlbW92ZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0c3VpdGUoJ2J1dHRvbiBsYWJlbCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG93cyBcIk1hbmFnZSBCdWRnZXRcIiBmb3IgUHJvIHVzZXIgd2l0aG91dCBhZGRpdGlvbmFsX3NwZW5kX2xpbWl0X3JlYWNoZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVXaWRnZXQoQ2hhdEVudGl0bGVtZW50LlBybywge1xuXHRcdFx0XHRtZXNzYWdlOiAnUXVvdGEgZXhjZWVkZWQnLFxuXHRcdFx0XHRpc1F1b3RhRXhjZWVkZWQ6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0UHJpbWFyeUJ1dHRvbih3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnV0dG9uLnRleHRDb250ZW50LCAnTWFuYWdlIEJ1ZGdldCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3MgXCJVcGdyYWRlIHRvIEdpdEh1YiBDb3BpbG90IFByb1wiIGZvciBGcmVlIHVzZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVXaWRnZXQoQ2hhdEVudGl0bGVtZW50LkZyZWUsIHtcblx0XHRcdFx0bWVzc2FnZTogJ1F1b3RhIGV4Y2VlZGVkJyxcblx0XHRcdFx0aXNRdW90YUV4Y2VlZGVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldFByaW1hcnlCdXR0b24od2lkZ2V0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1dHRvbi50ZXh0Q29udGVudCwgJ1VwZ3JhZGUgdG8gR2l0SHViIENvcGlsb3QgUHJvJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG93cyBcIk1hbmFnZSBCdWRnZXRcIiBmb3IgUHJvIHVzZXIgd2l0aCBhZGRpdGlvbmFsX3NwZW5kX2xpbWl0X3JlYWNoZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVXaWRnZXQoQ2hhdEVudGl0bGVtZW50LlBybywge1xuXHRcdFx0XHRtZXNzYWdlOiAnU3BlbmQgbGltaXQgcmVhY2hlZCcsXG5cdFx0XHRcdGlzUXVvdGFFeGNlZWRlZDogdHJ1ZSxcblx0XHRcdFx0Y29kZTogJ2FkZGl0aW9uYWxfc3BlbmRfbGltaXRfcmVhY2hlZCcsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0UHJpbWFyeUJ1dHRvbih3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnV0dG9uLnRleHRDb250ZW50LCAnTWFuYWdlIEJ1ZGdldCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3MgXCJNYW5hZ2UgQnVkZ2V0XCIgZm9yIFByb1BsdXMgdXNlciB3aXRoIGFkZGl0aW9uYWxfc3BlbmRfbGltaXRfcmVhY2hlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZVdpZGdldChDaGF0RW50aXRsZW1lbnQuUHJvUGx1cywge1xuXHRcdFx0XHRtZXNzYWdlOiAnU3BlbmQgbGltaXQgcmVhY2hlZCcsXG5cdFx0XHRcdGlzUXVvdGFFeGNlZWRlZDogdHJ1ZSxcblx0XHRcdFx0Y29kZTogJ2FkZGl0aW9uYWxfc3BlbmRfbGltaXRfcmVhY2hlZCcsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0UHJpbWFyeUJ1dHRvbih3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnV0dG9uLnRleHRDb250ZW50LCAnTWFuYWdlIEJ1ZGdldCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3MgXCJNYW5hZ2UgQnVkZ2V0XCIgZm9yIEVEVSB1c2VyIHdpdGhvdXQgYWRkaXRpb25hbF9zcGVuZF9saW1pdF9yZWFjaGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gY3JlYXRlV2lkZ2V0KENoYXRFbnRpdGxlbWVudC5FRFUsIHtcblx0XHRcdFx0bWVzc2FnZTogJ1F1b3RhIGV4Y2VlZGVkJyxcblx0XHRcdFx0aXNRdW90YUV4Y2VlZGVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldFByaW1hcnlCdXR0b24od2lkZ2V0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1dHRvbi50ZXh0Q29udGVudCwgJ01hbmFnZSBCdWRnZXQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2J1dHRvbiBjb21tYW5kJywgKCkgPT4ge1xuXHRcdHRlc3QoJ1BybyB1c2VyIGNsaWNrcyBcIk1hbmFnZSBCdWRnZXRcIiAtPiBtYW5hZ2VBZGRpdGlvbmFsU3BlbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVXaWRnZXQoQ2hhdEVudGl0bGVtZW50LlBybywge1xuXHRcdFx0XHRtZXNzYWdlOiAnUXVvdGEgZXhjZWVkZWQnLFxuXHRcdFx0XHRpc1F1b3RhRXhjZWVkZWQ6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0UHJpbWFyeUJ1dHRvbih3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbik7XG5cdFx0XHRidXR0b24uY2xpY2soKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGVjdXRlZENvbW1hbmRzWzBdLCAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm1hbmFnZUFkZGl0aW9uYWxTcGVuZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnRnJlZSB1c2VyIGNsaWNrcyBcIlVwZ3JhZGVcIiAtPiB1cGdyYWRlUGxhbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZVdpZGdldChDaGF0RW50aXRsZW1lbnQuRnJlZSwge1xuXHRcdFx0XHRtZXNzYWdlOiAnUXVvdGEgZXhjZWVkZWQnLFxuXHRcdFx0XHRpc1F1b3RhRXhjZWVkZWQ6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0UHJpbWFyeUJ1dHRvbih3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbik7XG5cdFx0XHRidXR0b24uY2xpY2soKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGVjdXRlZENvbW1hbmRzWzBdLCAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnVwZ3JhZGVQbGFuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdQcm8gdXNlciB3aXRoIGFkZGl0aW9uYWxfc3BlbmRfbGltaXRfcmVhY2hlZCBjbGlja3MgXCJNYW5hZ2UgQnVkZ2V0XCIgLT4gbWFuYWdlQWRkaXRpb25hbFNwZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gY3JlYXRlV2lkZ2V0KENoYXRFbnRpdGxlbWVudC5Qcm8sIHtcblx0XHRcdFx0bWVzc2FnZTogJ1NwZW5kIGxpbWl0IHJlYWNoZWQnLFxuXHRcdFx0XHRpc1F1b3RhRXhjZWVkZWQ6IHRydWUsXG5cdFx0XHRcdGNvZGU6ICdhZGRpdGlvbmFsX3NwZW5kX2xpbWl0X3JlYWNoZWQnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldFByaW1hcnlCdXR0b24od2lkZ2V0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b24pO1xuXHRcdFx0YnV0dG9uLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhlY3V0ZWRDb21tYW5kc1swXSwgJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5tYW5hZ2VBZGRpdGlvbmFsU3BlbmQnKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGFBQWE7QUFFdEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBSXhELFNBQVMsdUJBQWdFO0FBR3pFLFNBQVMsNkJBQTZCO0FBR3RDLFNBQVMsNkJBQTZCLGFBQXVEO0FBQzVGLFNBQU87QUFBQSxJQUNOLGVBQWU7QUFBQSxJQUNmO0FBQUEsSUFDQSxnQkFBZ0IsZ0JBQWdCLENBQUMsR0FBRyxXQUFXO0FBQUEsSUFDL0Msd0JBQXdCLE1BQU07QUFBQSxJQUM5QiwwQkFBMEIsTUFBTTtBQUFBLElBQ2hDLDJCQUEyQixNQUFNO0FBQUEsSUFDakMsOEJBQThCLE1BQU07QUFBQSxJQUNwQyxRQUFRLENBQUM7QUFBQSxJQUNULGVBQWU7QUFBQSxJQUNmLFlBQVk7QUFBQSxJQUNaLEtBQUs7QUFBQSxJQUNMLG1CQUFtQjtBQUFBLElBQ25CLG1CQUFtQjtBQUFBLElBQ25CLGVBQWU7QUFBQSxJQUNmLHNCQUFzQixNQUFNO0FBQUEs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
