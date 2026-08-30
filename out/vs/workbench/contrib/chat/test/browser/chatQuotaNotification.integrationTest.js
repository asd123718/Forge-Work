import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { getSingletonServiceDescriptors } from "../../../../../platform/instantiation/common/extensions.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { TelemetryService } from "../../../../../platform/telemetry/common/telemetryService.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
import { ChatQuotaNotificationContribution } from "../../browser/chatQuotaNotification.js";
import { ChatInputNotificationSeverity, IChatInputNotificationService } from "../../browser/widget/input/chatInputNotificationService.js";
import { ChatInputNotificationWidget } from "../../browser/widget/input/chatInputNotificationWidget.js";
import { ILanguageModelsService } from "../../common/languageModels.js";
class TestTelemetryAppender {
  constructor() {
    this.events = [];
  }
  log(eventName, data) {
    this.events.push({ eventName, data });
  }
  flush() {
    return Promise.resolve();
  }
}
class TestCommandService {
  constructor() {
    this.onWillExecuteCommand = Event.None;
    this.onDidExecuteCommand = Event.None;
    this.executedCommands = [];
  }
  async executeCommand(commandId) {
    this.executedCommands.push(commandId);
    return void 0;
  }
}
function createQuotaSnapshot(percentRemaining, opts) {
  return {
    percentRemaining,
    unlimited: false,
    ...opts
  };
}
function createEntitlementService(opts) {
  const onDidChangeQuotaRemaining = new Emitter();
  const onDidChangeQuotaExceeded = new Emitter();
  const onDidChangeEntitlement = new Emitter();
  const sentiment = {};
  const service = {
    _serviceBrand: void 0,
    entitlement: opts?.entitlement ?? ChatEntitlement.Pro,
    entitlementObs: observableValue({}, opts?.entitlement ?? ChatEntitlement.Pro),
    onDidChangeEntitlement: onDidChangeEntitlement.event,
    onDidChangeQuotaExceeded: onDidChangeQuotaExceeded.event,
    onDidChangeQuotaRemaining: onDidChangeQuotaRemaining.event,
    onDidChangeUsageBasedBilling: Event.None,
    quotas: {
      usageBasedBilling: true,
      premiumChat: createQuotaSnapshot(0),
      additionalUsageEnabled: false,
      ...opts?.quotas
    },
    organisations: void 0,
    isInternal: false,
    sku: void 0,
    copilotTrackingId: void 0,
    clientByokEnabled: false,
    hasByokModels: false,
    onDidChangeSentiment: Event.None,
    sentiment,
    sentimentObs: observableValue({}, sentiment),
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
  return { service, onDidChangeQuotaRemaining, onDidChangeQuotaExceeded, onDidChangeEntitlement };
}
suite("ChatQuotaNotificationContribution integration", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createHarness(opts) {
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    const telemetryAppender = new TestTelemetryAppender();
    const telemetryService = store.add(instantiationService.createInstance(TelemetryService, { appenders: [telemetryAppender] }));
    const entitlementService = createEntitlementService(opts);
    const commandService = new TestCommandService();
    const storageService = instantiationService.get(IStorageService);
    storageService.store("chat.currentLanguageModel.panel", "copilot/test-model", StorageScope.PROFILE, StorageTarget.USER);
    instantiationService.stub(ITelemetryService, telemetryService);
    instantiationService.stub(IChatEntitlementService, entitlementService.service);
    instantiationService.stub(ICommandService, commandService);
    instantiationService.stub(ILanguageModelsService, {
      _serviceBrand: void 0,
      onDidChangeLanguageModelVendors: Event.None,
      onDidChangeLanguageModels: Event.None,
      getLanguageModelIds: () => ["test-model"],
      getVendors: () => [],
      lookupLanguageModel: (_id) => ({
        id: "test-model",
        name: "Test Model",
        vendor: "copilot",
        version: "1.0",
        family: "test",
        extension: new ExtensionIdentifier("test.extension"),
        maxInputTokens: 1,
        maxOutputTokens: 1,
        isDefaultForLocation: {}
      }),
      lookupLanguageModelByQualifiedName: () => void 0
    });
    store.add(entitlementService.onDidChangeQuotaRemaining);
    store.add(entitlementService.onDidChangeQuotaExceeded);
    store.add(entitlementService.onDidChangeEntitlement);
    const notificationDescriptor = getSingletonServiceDescriptors().find(([id]) => id === IChatInputNotificationService)?.[1];
    assert.ok(notificationDescriptor);
    const eagerNotificationDescriptor = new SyncDescriptor(notificationDescriptor.ctor, notificationDescriptor.staticArguments);
    const childInstantiationService = store.add(instantiationService.createChild(new ServiceCollection([IChatInputNotificationService, eagerNotificationDescriptor])));
    const contribution = store.add(childInstantiationService.createInstance(ChatQuotaNotificationContribution));
    const notificationService = childInstantiationService.get(IChatInputNotificationService);
    store.add(notificationService);
    return { instantiationService: childInstantiationService, telemetryAppender, commandService, contribution, entitlementService, notificationService };
  }
  function getNotificationTelemetryEvents(telemetryAppender) {
    return telemetryAppender.events.filter((e) => e.eventName === "chatInputNotificationShown" || e.eventName === "chatInputNotificationDismissed");
  }
  function getRenderedText(widget) {
    return widget.domNode.querySelector(".chat-input-notification-header") ? widget.domNode.textContent ?? "" : "";
  }
  function assertShownTelemetry(telemetryAppender, telemetryId) {
    assert.deepStrictEqual(getNotificationTelemetryEvents(telemetryAppender), [{
      eventName: "chatInputNotificationShown",
      data: {
        id: "copilot.quotaStatus",
        telemetryId
      }
    }]);
  }
  test("emits generic shown telemetry through the real widget render path", () => {
    const { instantiationService, telemetryAppender } = createHarness();
    assert.deepStrictEqual(getNotificationTelemetryEvents(telemetryAppender), []);
    const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, void 0));
    assert.ok(widget.domNode.querySelector(".chat-input-notification-header"));
    assertShownTelemetry(telemetryAppender, "quotaExhausted");
  });
  test("emits shown telemetry for each quota notification variant through the real widget render path", () => {
    const cases = [
      {
        name: "quota exhausted",
        setup: () => createHarness({
          quotas: {
            premiumChat: createQuotaSnapshot(0),
            additionalUsageEnabled: false
          }
        }),
        expectedText: "Credit Limit Reached",
        expectedTelemetryId: "quotaExhausted"
      },
      {
        name: "overage activation",
        setup: () => createHarness({
          quotas: {
            premiumChat: createQuotaSnapshot(50),
            additionalUsageEnabled: true
          }
        }),
        expectedText: "Additional budget is now covering extra usage.",
        expectedTelemetryId: "overageActivation",
        afterCreate: ({ entitlementService }) => {
          entitlementService.service.quotas = {
            ...entitlementService.service.quotas,
            premiumChat: createQuotaSnapshot(0)
          };
          entitlementService.onDidChangeQuotaRemaining.fire();
        }
      },
      {
        name: "quota approaching",
        setup: () => createHarness({
          quotas: {
            premiumChat: createQuotaSnapshot(50)
          }
        }),
        expectedText: "Credits at 75%",
        expectedTelemetryId: "quotaApproaching75",
        afterCreate: ({ entitlementService }) => {
          entitlementService.service.quotas = {
            ...entitlementService.service.quotas,
            premiumChat: createQuotaSnapshot(25)
          };
          entitlementService.onDidChangeQuotaRemaining.fire();
        }
      },
      {
        name: "rate limit warning",
        setup: () => createHarness({
          quotas: {
            premiumChat: createQuotaSnapshot(50),
            sessionRateLimit: { percentRemaining: 50, unlimited: false, resetDate: "2026-06-01T00:00:00Z" }
          }
        }),
        expectedText: "You've used 75% of your session rate limit.",
        expectedTelemetryId: "sessionRateLimitWarning",
        afterCreate: ({ entitlementService }) => {
          entitlementService.service.quotas = {
            ...entitlementService.service.quotas,
            sessionRateLimit: { percentRemaining: 25, unlimited: false, resetDate: "2026-06-01T00:00:00Z" }
          };
          entitlementService.onDidChangeQuotaRemaining.fire();
        }
      },
      {
        name: "managed plan blocked",
        setup: () => createHarness({
          entitlement: ChatEntitlement.Business,
          quotas: {
            premiumChat: createQuotaSnapshot(0, {
              unlimited: true,
              hasQuota: false
            })
          }
        }),
        expectedText: "Usage Blocked",
        expectedTelemetryId: "managedPlanBlocked"
      }
    ];
    const results = cases.map((testCase) => {
      const harness = testCase.setup();
      testCase.afterCreate?.(harness);
      const widget = store.add(harness.instantiationService.createInstance(ChatInputNotificationWidget, void 0));
      const renderedText = getRenderedText(widget);
      assert.ok(renderedText.includes(testCase.expectedText), `${testCase.name} did not render expected text`);
      assertShownTelemetry(harness.telemetryAppender, testCase.expectedTelemetryId);
      return {
        name: testCase.name,
        renderedText: testCase.expectedText,
        telemetry: getNotificationTelemetryEvents(harness.telemetryAppender)
      };
    });
    assert.deepStrictEqual(results.map((result) => result.name), [
      "quota exhausted",
      "overage activation",
      "quota approaching",
      "rate limit warning",
      "managed plan blocked"
    ]);
  });
  test("emits quota approaching telemetry for the crossed checkpoint when usage jumps past it", () => {
    const { instantiationService, telemetryAppender, entitlementService } = createHarness({
      quotas: {
        premiumChat: createQuotaSnapshot(26)
      }
    });
    entitlementService.service.quotas = {
      ...entitlementService.service.quotas,
      premiumChat: createQuotaSnapshot(17)
    };
    entitlementService.onDidChangeQuotaRemaining.fire();
    const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, void 0));
    assert.ok(getRenderedText(widget).includes("Credits at 83%"));
    assertShownTelemetry(telemetryAppender, "quotaApproaching75");
  });
  test("emits shown telemetry when the same notification id changes telemetry context", () => {
    const { instantiationService, telemetryAppender } = createHarness();
    const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, void 0));
    const notificationService = instantiationService.get(IChatInputNotificationService);
    notificationService.setNotification({
      id: "copilot.quotaStatus",
      telemetryId: "quotaApproaching",
      severity: ChatInputNotificationSeverity.Info,
      message: "Credits at 75%",
      description: void 0,
      actions: [],
      dismissible: true,
      autoDismissOnMessage: true
    });
    assert.ok(widget.domNode.querySelector(".chat-input-notification-header"));
    assert.deepStrictEqual(getNotificationTelemetryEvents(telemetryAppender), [
      {
        eventName: "chatInputNotificationShown",
        data: {
          id: "copilot.quotaStatus",
          telemetryId: "quotaExhausted"
        }
      },
      {
        eventName: "chatInputNotificationShown",
        data: {
          id: "copilot.quotaStatus",
          telemetryId: "quotaApproaching"
        }
      }
    ]);
  });
  test("does not emit duplicate shown telemetry when the notification rerenders unchanged", () => {
    const { instantiationService, telemetryAppender, notificationService } = createHarness();
    store.add(instantiationService.createInstance(ChatInputNotificationWidget, void 0));
    const notification = notificationService.getActiveNotification();
    assert.ok(notification);
    notificationService.setNotification(notification);
    notificationService.setNotification(notification);
    assert.deepStrictEqual(getNotificationTelemetryEvents(telemetryAppender), [
      {
        eventName: "chatInputNotificationShown",
        data: {
          id: "copilot.quotaStatus",
          telemetryId: "quotaExhausted"
        }
      }
    ]);
  });
  test("emits existing action telemetry and dismisses from real DOM interaction", async () => {
    const { instantiationService, telemetryAppender, commandService } = createHarness();
    const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, void 0));
    const actionButton = widget.domNode.querySelector(".chat-input-notification-action-button");
    assert.ok(actionButton);
    actionButton.click();
    await timeout(0);
    assert.strictEqual(widget.domNode.querySelector(".chat-input-notification-header"), null);
    assert.deepStrictEqual(commandService.executedCommands, ["workbench.action.chat.manageAdditionalSpend"]);
    assert.deepStrictEqual(telemetryAppender.events.filter((e) => e.eventName === "workbenchActionExecuted" || e.eventName === "chatInputNotificationShown"), [
      {
        eventName: "chatInputNotificationShown",
        data: {
          id: "copilot.quotaStatus",
          telemetryId: "quotaExhausted"
        }
      },
      {
        eventName: "workbenchActionExecuted",
        data: {
          id: "workbench.action.chat.manageAdditionalSpend",
          from: "chatInputNotification"
        }
      }
    ]);
  });
  test("emits generic dismissed telemetry from real DOM interaction", async () => {
    const { instantiationService, telemetryAppender } = createHarness();
    const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, void 0));
    const dismissButton = widget.domNode.querySelector(".chat-input-notification-dismiss");
    assert.ok(dismissButton);
    dismissButton.click();
    await timeout(0);
    assert.deepStrictEqual(telemetryAppender.events.filter((e) => e.eventName === "chatInputNotificationShown" || e.eventName === "chatInputNotificationDismissed"), [
      {
        eventName: "chatInputNotificationShown",
        data: {
          id: "copilot.quotaStatus",
          telemetryId: "quotaExhausted"
        }
      },
      {
        eventName: "chatInputNotificationDismissed",
        data: {
          id: "copilot.quotaStatus",
          telemetryId: "quotaExhausted"
        }
      }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRRdW90YU5vdGlmaWNhdGlvbi5pbnRlZ3JhdGlvblRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgdHlwZSB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZEV2ZW50LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBnZXRTaW5nbGV0b25TZXJ2aWNlRGVzY3JpcHRvcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlEYXRhLCBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeUFwcGVuZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnQsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLCBJQ2hhdFNlbnRpbWVudCwgSVF1b3RhU25hcHNob3QgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBDaGF0UXVvdGFOb3RpZmljYXRpb25Db250cmlidXRpb24gfSBmcm9tICcuLi8uLi9icm93c2VyL2NoYXRRdW90YU5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eSwgSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5cbmludGVyZmFjZSBJTG9nZ2VkVGVsZW1ldHJ5RXZlbnQge1xuXHRyZWFkb25seSBldmVudE5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZGF0YTogSVRlbGVtZXRyeURhdGE7XG59XG5cbmNsYXNzIFRlc3RUZWxlbWV0cnlBcHBlbmRlciBpbXBsZW1lbnRzIElUZWxlbWV0cnlBcHBlbmRlciB7XG5cdHJlYWRvbmx5IGV2ZW50czogSUxvZ2dlZFRlbGVtZXRyeUV2ZW50W10gPSBbXTtcblxuXHRsb2coZXZlbnROYW1lOiBzdHJpbmcsIGRhdGE6IElUZWxlbWV0cnlEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5ldmVudHMucHVzaCh7IGV2ZW50TmFtZSwgZGF0YSB9KTtcblx0fVxuXG5cdGZsdXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxufVxuXG5jbGFzcyBUZXN0Q29tbWFuZFNlcnZpY2UgaW1wbGVtZW50cyBJQ29tbWFuZFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQ8SUNvbW1hbmRFdmVudD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZEV4ZWN1dGVDb21tYW5kOiBFdmVudDxJQ29tbWFuZEV2ZW50PiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IGV4ZWN1dGVkQ29tbWFuZHM6IHN0cmluZ1tdID0gW107XG5cblx0YXN5bmMgZXhlY3V0ZUNvbW1hbmQoY29tbWFuZElkOiBzdHJpbmcpOiBQcm9taXNlPHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuZXhlY3V0ZWRDb21tYW5kcy5wdXNoKGNvbW1hbmRJZCk7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVRdW90YVNuYXBzaG90KHBlcmNlbnRSZW1haW5pbmc6IG51bWJlciwgb3B0cz86IFBhcnRpYWw8SVF1b3RhU25hcHNob3Q+KTogSVF1b3RhU25hcHNob3Qge1xuXHRyZXR1cm4ge1xuXHRcdHBlcmNlbnRSZW1haW5pbmcsXG5cdFx0dW5saW1pdGVkOiBmYWxzZSxcblx0XHQuLi5vcHRzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uob3B0cz86IHtcblx0ZW50aXRsZW1lbnQ/OiBDaGF0RW50aXRsZW1lbnQ7XG5cdHF1b3Rhcz86IFBhcnRpYWw8SUNoYXRFbnRpdGxlbWVudFNlcnZpY2VbJ3F1b3RhcyddPjtcbn0pIHtcblx0Y29uc3Qgb25EaWRDaGFuZ2VRdW90YVJlbWFpbmluZyA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdGNvbnN0IG9uRGlkQ2hhbmdlUXVvdGFFeGNlZWRlZCA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdGNvbnN0IG9uRGlkQ2hhbmdlRW50aXRsZW1lbnQgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRjb25zdCBzZW50aW1lbnQ6IElDaGF0U2VudGltZW50ID0ge307XG5cblx0Y29uc3Qgc2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgPSB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdGVudGl0bGVtZW50OiBvcHRzPy5lbnRpdGxlbWVudCA/PyBDaGF0RW50aXRsZW1lbnQuUHJvLFxuXHRcdGVudGl0bGVtZW50T2JzOiBvYnNlcnZhYmxlVmFsdWUoe30sIG9wdHM/LmVudGl0bGVtZW50ID8/IENoYXRFbnRpdGxlbWVudC5Qcm8pLFxuXHRcdG9uRGlkQ2hhbmdlRW50aXRsZW1lbnQ6IG9uRGlkQ2hhbmdlRW50aXRsZW1lbnQuZXZlbnQsXG5cdFx0b25EaWRDaGFuZ2VRdW90YUV4Y2VlZGVkOiBvbkRpZENoYW5nZVF1b3RhRXhjZWVkZWQuZXZlbnQsXG5cdFx0b25EaWRDaGFuZ2VRdW90YVJlbWFpbmluZzogb25EaWRDaGFuZ2VRdW90YVJlbWFpbmluZy5ldmVudCxcblx0XHRvbkRpZENoYW5nZVVzYWdlQmFzZWRCaWxsaW5nOiBFdmVudC5Ob25lLFxuXHRcdHF1b3Rhczoge1xuXHRcdFx0dXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUsXG5cdFx0XHRwcmVtaXVtQ2hhdDogY3JlYXRlUXVvdGFTbmFwc2hvdCgwKSxcblx0XHRcdGFkZGl0aW9uYWxVc2FnZUVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0Li4ub3B0cz8ucXVvdGFzLFxuXHRcdH0sXG5cdFx0b3JnYW5pc2F0aW9uczogdW5kZWZpbmVkLFxuXHRcdGlzSW50ZXJuYWw6IGZhbHNlLFxuXHRcdHNrdTogdW5kZWZpbmVkLFxuXHRcdGNvcGlsb3RUcmFja2luZ0lkOiB1bmRlZmluZWQsXG5cdFx0Y2xpZW50Qnlva0VuYWJsZWQ6IGZhbHNlLFxuXHRcdGhhc0J5b2tNb2RlbHM6IGZhbHNlLFxuXHRcdG9uRGlkQ2hhbmdlU2VudGltZW50OiBFdmVudC5Ob25lLFxuXHRcdHNlbnRpbWVudCxcblx0XHRzZW50aW1lbnRPYnM6IG9ic2VydmFibGVWYWx1ZSh7fSwgc2VudGltZW50KSxcblx0XHRvbkRpZENoYW5nZUFub255bW91czogRXZlbnQuTm9uZSxcblx0XHRhbm9ueW1vdXM6IGZhbHNlLFxuXHRcdGFub255bW91c09iczogb2JzZXJ2YWJsZVZhbHVlKHt9LCBmYWxzZSksXG5cdFx0YWNjZXB0UXVvdGFzKCkgeyB9LFxuXHRcdGNsZWFyUXVvdGFzKCkgeyB9LFxuXHRcdG1hcmtBbm9ueW1vdXNSYXRlTGltaXRlZCgpIHsgfSxcblx0XHRtYXJrU2V0dXBDb21wbGV0ZWQoKSB7IH0sXG5cdFx0c2V0Rm9yY2VIaWRkZW4oKSB7IH0sXG5cdFx0dXBkYXRlKCkgeyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7IH0sXG5cdH07XG5cblx0cmV0dXJuIHsgc2VydmljZSwgb25EaWRDaGFuZ2VRdW90YVJlbWFpbmluZywgb25EaWRDaGFuZ2VRdW90YUV4Y2VlZGVkLCBvbkRpZENoYW5nZUVudGl0bGVtZW50IH07XG59XG5cbnN1aXRlKCdDaGF0UXVvdGFOb3RpZmljYXRpb25Db250cmlidXRpb24gaW50ZWdyYXRpb24nLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlSGFybmVzcyhvcHRzPzogUGFyYW1ldGVyczx0eXBlb2YgY3JlYXRlRW50aXRsZW1lbnRTZXJ2aWNlPlswXSkge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpKTtcblx0XHRjb25zdCB0ZWxlbWV0cnlBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlbGVtZXRyeVNlcnZpY2UsIHsgYXBwZW5kZXJzOiBbdGVsZW1ldHJ5QXBwZW5kZXJdIH0pKTtcblx0XHRjb25zdCBlbnRpdGxlbWVudFNlcnZpY2UgPSBjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uob3B0cyk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBuZXcgVGVzdENvbW1hbmRTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnY2hhdC5jdXJyZW50TGFuZ3VhZ2VNb2RlbC5wYW5lbCcsICdjb3BpbG90L3Rlc3QtbW9kZWwnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIGVudGl0bGVtZW50U2VydmljZS5zZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwgY29tbWFuZFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxzU2VydmljZSwge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0b25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsVmVuZG9yczogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRnZXRMYW5ndWFnZU1vZGVsSWRzOiAoKSA9PiBbJ3Rlc3QtbW9kZWwnXSxcblx0XHRcdGdldFZlbmRvcnM6ICgpID0+IFtdLFxuXHRcdFx0bG9va3VwTGFuZ3VhZ2VNb2RlbDogKF9pZDogc3RyaW5nKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgPT4gKHtcblx0XHRcdFx0aWQ6ICd0ZXN0LW1vZGVsJyxcblx0XHRcdFx0bmFtZTogJ1Rlc3QgTW9kZWwnLFxuXHRcdFx0XHR2ZW5kb3I6ICdjb3BpbG90Jyxcblx0XHRcdFx0dmVyc2lvbjogJzEuMCcsXG5cdFx0XHRcdGZhbWlseTogJ3Rlc3QnLFxuXHRcdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0LmV4dGVuc2lvbicpLFxuXHRcdFx0XHRtYXhJbnB1dFRva2VuczogMSxcblx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxLFxuXHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0XHR9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSksXG5cdFx0XHRsb29rdXBMYW5ndWFnZU1vZGVsQnlRdWFsaWZpZWROYW1lOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cblx0XHRzdG9yZS5hZGQoZW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlUXVvdGFSZW1haW5pbmcpO1xuXHRcdHN0b3JlLmFkZChlbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VRdW90YUV4Y2VlZGVkKTtcblx0XHRzdG9yZS5hZGQoZW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlRW50aXRsZW1lbnQpO1xuXG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uRGVzY3JpcHRvciA9IGdldFNpbmdsZXRvblNlcnZpY2VEZXNjcmlwdG9ycygpLmZpbmQoKFtpZF0pID0+IGlkID09PSBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSk/LlsxXTtcblx0XHRhc3NlcnQub2sobm90aWZpY2F0aW9uRGVzY3JpcHRvcik7XG5cdFx0Y29uc3QgZWFnZXJOb3RpZmljYXRpb25EZXNjcmlwdG9yID0gbmV3IFN5bmNEZXNjcmlwdG9yKG5vdGlmaWNhdGlvbkRlc2NyaXB0b3IuY3Rvciwgbm90aWZpY2F0aW9uRGVzY3JpcHRvci5zdGF0aWNBcmd1bWVudHMpO1xuXHRcdGNvbnN0IGNoaWxkSW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSwgZWFnZXJOb3RpZmljYXRpb25EZXNjcmlwdG9yXSkpKTtcblx0XHRjb25zdCBjb250cmlidXRpb24gPSBzdG9yZS5hZGQoY2hpbGRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UXVvdGFOb3RpZmljYXRpb25Db250cmlidXRpb24pKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gY2hpbGRJbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdHN0b3JlLmFkZChub3RpZmljYXRpb25TZXJ2aWNlIGFzIElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlICYgSURpc3Bvc2FibGUpO1xuXG5cdFx0cmV0dXJuIHsgaW5zdGFudGlhdGlvblNlcnZpY2U6IGNoaWxkSW5zdGFudGlhdGlvblNlcnZpY2UsIHRlbGVtZXRyeUFwcGVuZGVyLCBjb21tYW5kU2VydmljZSwgY29udHJpYnV0aW9uLCBlbnRpdGxlbWVudFNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldE5vdGlmaWNhdGlvblRlbGVtZXRyeUV2ZW50cyh0ZWxlbWV0cnlBcHBlbmRlcjogVGVzdFRlbGVtZXRyeUFwcGVuZGVyKTogSUxvZ2dlZFRlbGVtZXRyeUV2ZW50W10ge1xuXHRcdHJldHVybiB0ZWxlbWV0cnlBcHBlbmRlci5ldmVudHMuZmlsdGVyKGUgPT4gZS5ldmVudE5hbWUgPT09ICdjaGF0SW5wdXROb3RpZmljYXRpb25TaG93bicgfHwgZS5ldmVudE5hbWUgPT09ICdjaGF0SW5wdXROb3RpZmljYXRpb25EaXNtaXNzZWQnKTtcblx0fVxuXG5cdC8vIFRoZSB3aWRnZXQgaXMgdGhlIG5vdGlmaWNhdGlvbiBmcmFtZSBpdHNlbGY7IGl0cyBoZWFkZXIgcm93IG9ubHkgZXhpc3RzXG5cdC8vIHdoaWxlIHNvbWV0aGluZyBpcyBhY3R1YWxseSByZW5kZXJlZC5cblx0ZnVuY3Rpb24gZ2V0UmVuZGVyZWRUZXh0KHdpZGdldDogQ2hhdElucHV0Tm90aWZpY2F0aW9uV2lkZ2V0KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtaW5wdXQtbm90aWZpY2F0aW9uLWhlYWRlcicpID8gd2lkZ2V0LmRvbU5vZGUudGV4dENvbnRlbnQgPz8gJycgOiAnJztcblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydFNob3duVGVsZW1ldHJ5KHRlbGVtZXRyeUFwcGVuZGVyOiBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIsIHRlbGVtZXRyeUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldE5vdGlmaWNhdGlvblRlbGVtZXRyeUV2ZW50cyh0ZWxlbWV0cnlBcHBlbmRlciksIFt7XG5cdFx0XHRldmVudE5hbWU6ICdjaGF0SW5wdXROb3RpZmljYXRpb25TaG93bicsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdGlkOiAnY29waWxvdC5xdW90YVN0YXR1cycsXG5cdFx0XHRcdHRlbGVtZXRyeUlkLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH1cblxuXHR0ZXN0KCdlbWl0cyBnZW5lcmljIHNob3duIHRlbGVtZXRyeSB0aHJvdWdoIHRoZSByZWFsIHdpZGdldCByZW5kZXIgcGF0aCcsICgpID0+IHtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0ZWxlbWV0cnlBcHBlbmRlciB9ID0gY3JlYXRlSGFybmVzcygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXROb3RpZmljYXRpb25UZWxlbWV0cnlFdmVudHModGVsZW1ldHJ5QXBwZW5kZXIpLCBbXSk7XG5cblx0XHRjb25zdCB3aWRnZXQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdElucHV0Tm90aWZpY2F0aW9uV2lkZ2V0LCB1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQub2sod2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtaW5wdXQtbm90aWZpY2F0aW9uLWhlYWRlcicpKTtcblxuXHRcdGFzc2VydFNob3duVGVsZW1ldHJ5KHRlbGVtZXRyeUFwcGVuZGVyLCAncXVvdGFFeGhhdXN0ZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgc2hvd24gdGVsZW1ldHJ5IGZvciBlYWNoIHF1b3RhIG5vdGlmaWNhdGlvbiB2YXJpYW50IHRocm91Z2ggdGhlIHJlYWwgd2lkZ2V0IHJlbmRlciBwYXRoJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNhc2VzOiByZWFkb25seSB7XG5cdFx0XHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdFx0XHRyZWFkb25seSBzZXR1cDogKCkgPT4gUmV0dXJuVHlwZTx0eXBlb2YgY3JlYXRlSGFybmVzcz47XG5cdFx0XHRyZWFkb25seSBleHBlY3RlZFRleHQ6IHN0cmluZztcblx0XHRcdHJlYWRvbmx5IGV4cGVjdGVkVGVsZW1ldHJ5SWQ6IHN0cmluZztcblx0XHRcdHJlYWRvbmx5IGFmdGVyQ3JlYXRlPzogKGhhcm5lc3M6IFJldHVyblR5cGU8dHlwZW9mIGNyZWF0ZUhhcm5lc3M+KSA9PiB2b2lkO1xuXHRcdH1bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG5hbWU6ICdxdW90YSBleGhhdXN0ZWQnLFxuXHRcdFx0XHRcdHNldHVwOiAoKSA9PiBjcmVhdGVIYXJuZXNzKHtcblx0XHRcdFx0XHRcdHF1b3Rhczoge1xuXHRcdFx0XHRcdFx0XHRwcmVtaXVtQ2hhdDogY3JlYXRlUXVvdGFTbmFwc2hvdCgwKSxcblx0XHRcdFx0XHRcdFx0YWRkaXRpb25hbFVzYWdlRW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdGV4cGVjdGVkVGV4dDogJ0NyZWRpdCBMaW1pdCBSZWFjaGVkJyxcblx0XHRcdFx0XHRleHBlY3RlZFRlbGVtZXRyeUlkOiAncXVvdGFFeGhhdXN0ZWQnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogJ292ZXJhZ2UgYWN0aXZhdGlvbicsXG5cdFx0XHRcdFx0c2V0dXA6ICgpID0+IGNyZWF0ZUhhcm5lc3Moe1xuXHRcdFx0XHRcdFx0cXVvdGFzOiB7XG5cdFx0XHRcdFx0XHRcdHByZW1pdW1DaGF0OiBjcmVhdGVRdW90YVNuYXBzaG90KDUwKSxcblx0XHRcdFx0XHRcdFx0YWRkaXRpb25hbFVzYWdlRW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0ZXhwZWN0ZWRUZXh0OiAnQWRkaXRpb25hbCBidWRnZXQgaXMgbm93IGNvdmVyaW5nIGV4dHJhIHVzYWdlLicsXG5cdFx0XHRcdFx0ZXhwZWN0ZWRUZWxlbWV0cnlJZDogJ292ZXJhZ2VBY3RpdmF0aW9uJyxcblx0XHRcdFx0XHRhZnRlckNyZWF0ZTogKHsgZW50aXRsZW1lbnRTZXJ2aWNlIH0pID0+IHtcblx0XHRcdFx0XHRcdChlbnRpdGxlbWVudFNlcnZpY2Uuc2VydmljZSBhcyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSAmIHsgcXVvdGFzOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZVsncXVvdGFzJ10gfSkucXVvdGFzID0ge1xuXHRcdFx0XHRcdFx0XHQuLi5lbnRpdGxlbWVudFNlcnZpY2Uuc2VydmljZS5xdW90YXMsXG5cdFx0XHRcdFx0XHRcdHByZW1pdW1DaGF0OiBjcmVhdGVRdW90YVNuYXBzaG90KDApLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdGVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVF1b3RhUmVtYWluaW5nLmZpcmUoKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogJ3F1b3RhIGFwcHJvYWNoaW5nJyxcblx0XHRcdFx0XHRzZXR1cDogKCkgPT4gY3JlYXRlSGFybmVzcyh7XG5cdFx0XHRcdFx0XHRxdW90YXM6IHtcblx0XHRcdFx0XHRcdFx0cHJlbWl1bUNoYXQ6IGNyZWF0ZVF1b3RhU25hcHNob3QoNTApLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRleHBlY3RlZFRleHQ6ICdDcmVkaXRzIGF0IDc1JScsXG5cdFx0XHRcdFx0ZXhwZWN0ZWRUZWxlbWV0cnlJZDogJ3F1b3RhQXBwcm9hY2hpbmc3NScsXG5cdFx0XHRcdFx0YWZ0ZXJDcmVhdGU6ICh7IGVudGl0bGVtZW50U2VydmljZSB9KSA9PiB7XG5cdFx0XHRcdFx0XHQoZW50aXRsZW1lbnRTZXJ2aWNlLnNlcnZpY2UgYXMgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgJiB7IHF1b3RhczogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2VbJ3F1b3RhcyddIH0pLnF1b3RhcyA9IHtcblx0XHRcdFx0XHRcdFx0Li4uZW50aXRsZW1lbnRTZXJ2aWNlLnNlcnZpY2UucXVvdGFzLFxuXHRcdFx0XHRcdFx0XHRwcmVtaXVtQ2hhdDogY3JlYXRlUXVvdGFTbmFwc2hvdCgyNSksXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0ZW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlUXVvdGFSZW1haW5pbmcuZmlyZSgpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRuYW1lOiAncmF0ZSBsaW1pdCB3YXJuaW5nJyxcblx0XHRcdFx0XHRzZXR1cDogKCkgPT4gY3JlYXRlSGFybmVzcyh7XG5cdFx0XHRcdFx0XHRxdW90YXM6IHtcblx0XHRcdFx0XHRcdFx0cHJlbWl1bUNoYXQ6IGNyZWF0ZVF1b3RhU25hcHNob3QoNTApLFxuXHRcdFx0XHRcdFx0XHRzZXNzaW9uUmF0ZUxpbWl0OiB7IHBlcmNlbnRSZW1haW5pbmc6IDUwLCB1bmxpbWl0ZWQ6IGZhbHNlLCByZXNldERhdGU6ICcyMDI2LTA2LTAxVDAwOjAwOjAwWicgfSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0ZXhwZWN0ZWRUZXh0OiAnWW91XFwndmUgdXNlZCA3NSUgb2YgeW91ciBzZXNzaW9uIHJhdGUgbGltaXQuJyxcblx0XHRcdFx0XHRleHBlY3RlZFRlbGVtZXRyeUlkOiAnc2Vzc2lvblJhdGVMaW1pdFdhcm5pbmcnLFxuXHRcdFx0XHRcdGFmdGVyQ3JlYXRlOiAoeyBlbnRpdGxlbWVudFNlcnZpY2UgfSkgPT4ge1xuXHRcdFx0XHRcdFx0KGVudGl0bGVtZW50U2VydmljZS5zZXJ2aWNlIGFzIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlICYgeyBxdW90YXM6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlWydxdW90YXMnXSB9KS5xdW90YXMgPSB7XG5cdFx0XHRcdFx0XHRcdC4uLmVudGl0bGVtZW50U2VydmljZS5zZXJ2aWNlLnF1b3Rhcyxcblx0XHRcdFx0XHRcdFx0c2Vzc2lvblJhdGVMaW1pdDogeyBwZXJjZW50UmVtYWluaW5nOiAyNSwgdW5saW1pdGVkOiBmYWxzZSwgcmVzZXREYXRlOiAnMjAyNi0wNi0wMVQwMDowMDowMFonIH0sXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0ZW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlUXVvdGFSZW1haW5pbmcuZmlyZSgpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRuYW1lOiAnbWFuYWdlZCBwbGFuIGJsb2NrZWQnLFxuXHRcdFx0XHRcdHNldHVwOiAoKSA9PiBjcmVhdGVIYXJuZXNzKHtcblx0XHRcdFx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuQnVzaW5lc3MsXG5cdFx0XHRcdFx0XHRxdW90YXM6IHtcblx0XHRcdFx0XHRcdFx0cHJlbWl1bUNoYXQ6IGNyZWF0ZVF1b3RhU25hcHNob3QoMCwge1xuXHRcdFx0XHRcdFx0XHRcdHVubGltaXRlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRoYXNRdW90YTogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRleHBlY3RlZFRleHQ6ICdVc2FnZSBCbG9ja2VkJyxcblx0XHRcdFx0XHRleHBlY3RlZFRlbGVtZXRyeUlkOiAnbWFuYWdlZFBsYW5CbG9ja2VkJyxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRjb25zdCByZXN1bHRzID0gY2FzZXMubWFwKHRlc3RDYXNlID0+IHtcblx0XHRcdGNvbnN0IGhhcm5lc3MgPSB0ZXN0Q2FzZS5zZXR1cCgpO1xuXHRcdFx0dGVzdENhc2UuYWZ0ZXJDcmVhdGU/LihoYXJuZXNzKTtcblxuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gc3RvcmUuYWRkKGhhcm5lc3MuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdElucHV0Tm90aWZpY2F0aW9uV2lkZ2V0LCB1bmRlZmluZWQpKTtcblx0XHRcdGNvbnN0IHJlbmRlcmVkVGV4dCA9IGdldFJlbmRlcmVkVGV4dCh3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlbmRlcmVkVGV4dC5pbmNsdWRlcyh0ZXN0Q2FzZS5leHBlY3RlZFRleHQpLCBgJHt0ZXN0Q2FzZS5uYW1lfSBkaWQgbm90IHJlbmRlciBleHBlY3RlZCB0ZXh0YCk7XG5cdFx0XHRhc3NlcnRTaG93blRlbGVtZXRyeShoYXJuZXNzLnRlbGVtZXRyeUFwcGVuZGVyLCB0ZXN0Q2FzZS5leHBlY3RlZFRlbGVtZXRyeUlkKTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bmFtZTogdGVzdENhc2UubmFtZSxcblx0XHRcdFx0cmVuZGVyZWRUZXh0OiB0ZXN0Q2FzZS5leHBlY3RlZFRleHQsXG5cdFx0XHRcdHRlbGVtZXRyeTogZ2V0Tm90aWZpY2F0aW9uVGVsZW1ldHJ5RXZlbnRzKGhhcm5lc3MudGVsZW1ldHJ5QXBwZW5kZXIpLFxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5uYW1lKSwgW1xuXHRcdFx0J3F1b3RhIGV4aGF1c3RlZCcsXG5cdFx0XHQnb3ZlcmFnZSBhY3RpdmF0aW9uJyxcblx0XHRcdCdxdW90YSBhcHByb2FjaGluZycsXG5cdFx0XHQncmF0ZSBsaW1pdCB3YXJuaW5nJyxcblx0XHRcdCdtYW5hZ2VkIHBsYW4gYmxvY2tlZCcsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtaXRzIHF1b3RhIGFwcHJvYWNoaW5nIHRlbGVtZXRyeSBmb3IgdGhlIGNyb3NzZWQgY2hlY2twb2ludCB3aGVuIHVzYWdlIGp1bXBzIHBhc3QgaXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnN0YW50aWF0aW9uU2VydmljZSwgdGVsZW1ldHJ5QXBwZW5kZXIsIGVudGl0bGVtZW50U2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyh7XG5cdFx0XHRxdW90YXM6IHtcblx0XHRcdFx0cHJlbWl1bUNoYXQ6IGNyZWF0ZVF1b3RhU25hcHNob3QoMjYpLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdChlbnRpdGxlbWVudFNlcnZpY2Uuc2VydmljZSBhcyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSAmIHsgcXVvdGFzOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZVsncXVvdGFzJ10gfSkucXVvdGFzID0ge1xuXHRcdFx0Li4uZW50aXRsZW1lbnRTZXJ2aWNlLnNlcnZpY2UucXVvdGFzLFxuXHRcdFx0cHJlbWl1bUNoYXQ6IGNyZWF0ZVF1b3RhU25hcHNob3QoMTcpLFxuXHRcdH07XG5cdFx0ZW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlUXVvdGFSZW1haW5pbmcuZmlyZSgpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldCwgdW5kZWZpbmVkKSk7XG5cdFx0YXNzZXJ0Lm9rKGdldFJlbmRlcmVkVGV4dCh3aWRnZXQpLmluY2x1ZGVzKCdDcmVkaXRzIGF0IDgzJScpKTtcblx0XHRhc3NlcnRTaG93blRlbGVtZXRyeSh0ZWxlbWV0cnlBcHBlbmRlciwgJ3F1b3RhQXBwcm9hY2hpbmc3NScpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyBzaG93biB0ZWxlbWV0cnkgd2hlbiB0aGUgc2FtZSBub3RpZmljYXRpb24gaWQgY2hhbmdlcyB0ZWxlbWV0cnkgY29udGV4dCcsICgpID0+IHtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0ZWxlbWV0cnlBcHBlbmRlciB9ID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdGNvbnN0IHdpZGdldCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SW5wdXROb3RpZmljYXRpb25XaWRnZXQsIHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXG5cdFx0bm90aWZpY2F0aW9uU2VydmljZS5zZXROb3RpZmljYXRpb24oe1xuXHRcdFx0aWQ6ICdjb3BpbG90LnF1b3RhU3RhdHVzJyxcblx0XHRcdHRlbGVtZXRyeUlkOiAncXVvdGFBcHByb2FjaGluZycsXG5cdFx0XHRzZXZlcml0eTogQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2U6ICdDcmVkaXRzIGF0IDc1JScsXG5cdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0YWN0aW9uczogW10sXG5cdFx0XHRkaXNtaXNzaWJsZTogdHJ1ZSxcblx0XHRcdGF1dG9EaXNtaXNzT25NZXNzYWdlOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LWlucHV0LW5vdGlmaWNhdGlvbi1oZWFkZXInKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXROb3RpZmljYXRpb25UZWxlbWV0cnlFdmVudHModGVsZW1ldHJ5QXBwZW5kZXIpLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGV2ZW50TmFtZTogJ2NoYXRJbnB1dE5vdGlmaWNhdGlvblNob3duJyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdGlkOiAnY29waWxvdC5xdW90YVN0YXR1cycsXG5cdFx0XHRcdFx0dGVsZW1ldHJ5SWQ6ICdxdW90YUV4aGF1c3RlZCcsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRldmVudE5hbWU6ICdjaGF0SW5wdXROb3RpZmljYXRpb25TaG93bicsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRpZDogJ2NvcGlsb3QucXVvdGFTdGF0dXMnLFxuXHRcdFx0XHRcdHRlbGVtZXRyeUlkOiAncXVvdGFBcHByb2FjaGluZycsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBlbWl0IGR1cGxpY2F0ZSBzaG93biB0ZWxlbWV0cnkgd2hlbiB0aGUgbm90aWZpY2F0aW9uIHJlcmVuZGVycyB1bmNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnN0YW50aWF0aW9uU2VydmljZSwgdGVsZW1ldHJ5QXBwZW5kZXIsIG5vdGlmaWNhdGlvblNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdElucHV0Tm90aWZpY2F0aW9uV2lkZ2V0LCB1bmRlZmluZWQpKTtcblxuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IG5vdGlmaWNhdGlvblNlcnZpY2UuZ2V0QWN0aXZlTm90aWZpY2F0aW9uKCk7XG5cdFx0YXNzZXJ0Lm9rKG5vdGlmaWNhdGlvbik7XG5cdFx0bm90aWZpY2F0aW9uU2VydmljZS5zZXROb3RpZmljYXRpb24obm90aWZpY2F0aW9uKTtcblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLnNldE5vdGlmaWNhdGlvbihub3RpZmljYXRpb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXROb3RpZmljYXRpb25UZWxlbWV0cnlFdmVudHModGVsZW1ldHJ5QXBwZW5kZXIpLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGV2ZW50TmFtZTogJ2NoYXRJbnB1dE5vdGlmaWNhdGlvblNob3duJyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdGlkOiAnY29waWxvdC5xdW90YVN0YXR1cycsXG5cdFx0XHRcdFx0dGVsZW1ldHJ5SWQ6ICdxdW90YUV4aGF1c3RlZCcsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyBleGlzdGluZyBhY3Rpb24gdGVsZW1ldHJ5IGFuZCBkaXNtaXNzZXMgZnJvbSByZWFsIERPTSBpbnRlcmFjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0ZWxlbWV0cnlBcHBlbmRlciwgY29tbWFuZFNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRjb25zdCB3aWRnZXQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdElucHV0Tm90aWZpY2F0aW9uV2lkZ2V0LCB1bmRlZmluZWQpKTtcblxuXHRcdGNvbnN0IGFjdGlvbkJ1dHRvbiA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuY2hhdC1pbnB1dC1ub3RpZmljYXRpb24tYWN0aW9uLWJ1dHRvbicpO1xuXHRcdGFzc2VydC5vayhhY3Rpb25CdXR0b24pO1xuXHRcdGFjdGlvbkJ1dHRvbi5jbGljaygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtaW5wdXQtbm90aWZpY2F0aW9uLWhlYWRlcicpLCBudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVkQ29tbWFuZHMsIFsnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm1hbmFnZUFkZGl0aW9uYWxTcGVuZCddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeUFwcGVuZGVyLmV2ZW50cy5maWx0ZXIoZSA9PiBlLmV2ZW50TmFtZSA9PT0gJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJyB8fCBlLmV2ZW50TmFtZSA9PT0gJ2NoYXRJbnB1dE5vdGlmaWNhdGlvblNob3duJyksIFtcblx0XHRcdHtcblx0XHRcdFx0ZXZlbnROYW1lOiAnY2hhdElucHV0Tm90aWZpY2F0aW9uU2hvd24nLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0aWQ6ICdjb3BpbG90LnF1b3RhU3RhdHVzJyxcblx0XHRcdFx0XHR0ZWxlbWV0cnlJZDogJ3F1b3RhRXhoYXVzdGVkJyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGV2ZW50TmFtZTogJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm1hbmFnZUFkZGl0aW9uYWxTcGVuZCcsXG5cdFx0XHRcdFx0ZnJvbTogJ2NoYXRJbnB1dE5vdGlmaWNhdGlvbicsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyBnZW5lcmljIGRpc21pc3NlZCB0ZWxlbWV0cnkgZnJvbSByZWFsIERPTSBpbnRlcmFjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0ZWxlbWV0cnlBcHBlbmRlciB9ID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdGNvbnN0IHdpZGdldCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SW5wdXROb3RpZmljYXRpb25XaWRnZXQsIHVuZGVmaW5lZCkpO1xuXG5cdFx0Y29uc3QgZGlzbWlzc0J1dHRvbiA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuY2hhdC1pbnB1dC1ub3RpZmljYXRpb24tZGlzbWlzcycpO1xuXHRcdGFzc2VydC5vayhkaXNtaXNzQnV0dG9uKTtcblx0XHRkaXNtaXNzQnV0dG9uLmNsaWNrKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVsZW1ldHJ5QXBwZW5kZXIuZXZlbnRzLmZpbHRlcihlID0+IGUuZXZlbnROYW1lID09PSAnY2hhdElucHV0Tm90aWZpY2F0aW9uU2hvd24nIHx8IGUuZXZlbnROYW1lID09PSAnY2hhdElucHV0Tm90aWZpY2F0aW9uRGlzbWlzc2VkJyksIFtcblx0XHRcdHtcblx0XHRcdFx0ZXZlbnROYW1lOiAnY2hhdElucHV0Tm90aWZpY2F0aW9uU2hvd24nLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0aWQ6ICdjb3BpbG90LnF1b3RhU3RhdHVzJyxcblx0XHRcdFx0XHR0ZWxlbWV0cnlJZDogJ3F1b3RhRXhoYXVzdGVkJyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGV2ZW50TmFtZTogJ2NoYXRJbnB1dE5vdGlmaWNhdGlvbkRpc21pc3NlZCcsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRpZDogJ2NvcGlsb3QucXVvdGFTdGF0dXMnLFxuXHRcdFx0XHRcdHRlbGVtZXRyeUlkOiAncXVvdGFFeGhhdXN0ZWQnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGFBQWE7QUFFL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBd0IsdUJBQXVCO0FBQy9DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQXlCLHlCQUF5QjtBQUNsRCxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLGlCQUFpQiwrQkFBK0Q7QUFDekYsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUywrQkFBK0IscUNBQXFDO0FBQzdFLFNBQVMsbUNBQW1DO0FBQzVDLFNBQXFDLDhCQUE4QjtBQU9uRSxNQUFNLHNCQUFvRDtBQUFBLEVBQTFEO0FBQ0MsU0FBUyxTQUFrQyxDQUFDO0FBQUE7QUFBQSxFQUU1QyxJQUFJLFdBQW1CLE1BQTRCO0FBQ2xELFNBQUssT0FBTyxLQUFLLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFBQSxFQUNyQztBQUFBLEVBRUEsUUFBdUI7QUFDdEIsV0FBTyxRQUFRLFFBQVE7QUFBQSxFQUN4QjtBQUNEO0FBRUEsTUFBTSxtQkFBOEM7QUFBQSxFQUFwRDtBQUdDLFNBQVMsdUJBQTZDLE1BQU07QUFDNUQsU0FBUyxzQkFB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
