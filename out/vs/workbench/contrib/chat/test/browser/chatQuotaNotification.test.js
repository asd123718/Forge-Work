import assert from "assert";
import * as sinon from "sinon";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { createMarkdownCommandLink } from "../../../../../base/common/htmlContent.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { NullTelemetryServiceShape } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { ChatEntitlement } from "../../../../services/chat/common/chatEntitlementService.js";
import { ChatQuotaNotificationContribution } from "../../browser/chatQuotaNotification.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity } from "../../browser/widget/input/chatInputNotificationService.js";
const CREDIT_EFFICIENCY_LEARN_MORE_COMMAND_ID = "workbench.action.chat.learnMoreAboutCreditUsage";
const SWITCH_TO_AUTO_TREATMENT_NAME = "config.chatQuotaWarningSwitchToAuto";
const TRAJECTORY_NUDGE_TREATMENT_NAME = "config.chatQuotaTrajectoryNudge";
function createMockEntitlementService(opts) {
  const onDidChangeQuotaRemaining = new Emitter();
  const onDidChangeQuotaExceeded = new Emitter();
  const onDidChangeEntitlement = new Emitter();
  const service = {
    _serviceBrand: void 0,
    entitlement: opts?.entitlement ?? ChatEntitlement.Pro,
    entitlementObs: observableValue({}, opts?.entitlement ?? ChatEntitlement.Pro),
    onDidChangeEntitlement: onDidChangeEntitlement.event,
    onDidChangeQuotaExceeded: onDidChangeQuotaExceeded.event,
    onDidChangeQuotaRemaining: onDidChangeQuotaRemaining.event,
    onDidChangeUsageBasedBilling: Event.None,
    quotas: {
      resetDate: opts?.quotas?.resetDate,
      usageBasedBilling: opts?.quotas?.usageBasedBilling ?? true,
      chat: opts?.quotas?.chat,
      completions: opts?.quotas?.completions,
      premiumChat: opts?.quotas?.premiumChat,
      additionalUsageEnabled: opts?.quotas?.additionalUsageEnabled,
      additionalUsageCount: opts?.quotas?.additionalUsageCount,
      sessionRateLimit: opts?.quotas?.sessionRateLimit,
      weeklyRateLimit: opts?.quotas?.weeklyRateLimit
    },
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
  return { service, onDidChangeQuotaRemaining, onDidChangeQuotaExceeded, onDidChangeEntitlement };
}
function createMockNotificationService() {
  let lastNotification = void 0;
  let deleted = false;
  let dismissed = false;
  let setCount = 0;
  const onDidChange = new Emitter();
  const onDidDismiss = new Emitter();
  const service = {
    _serviceBrand: void 0,
    onDidChange: onDidChange.event,
    onDidDismiss: onDidDismiss.event,
    setNotification(notification) {
      lastNotification = notification;
      deleted = false;
      dismissed = false;
      setCount++;
      onDidChange.fire();
    },
    deleteNotification(id) {
      if (lastNotification?.id === id && !deleted) {
        deleted = true;
        dismissed = false;
        onDidChange.fire();
      }
    },
    dismissNotification(id) {
      if (!lastNotification || lastNotification.id !== id || deleted || dismissed) {
        return;
      }
      dismissed = true;
      onDidDismiss.fire(id);
      onDidChange.fire();
    },
    getActiveNotification(filter) {
      if (deleted || dismissed || !lastNotification) {
        return void 0;
      }
      return !filter || filter(lastNotification) ? lastNotification : void 0;
    },
    handleMessageSent() {
    },
    announceRendered() {
    }
  };
  return {
    service,
    getNotification() {
      return deleted || dismissed ? void 0 : lastNotification;
    },
    get wasDeleted() {
      return deleted;
    },
    get setCount() {
      return setCount;
    },
    dismiss(id) {
      const notificationId = id ?? lastNotification?.id;
      if (notificationId) {
        service.dismissNotification(notificationId);
      }
    },
    reset() {
      lastNotification = void 0;
      deleted = false;
      dismissed = false;
      setCount = 0;
    }
  };
}
function getCommandAction(notification) {
  const action = notification.actions[0];
  if (action.kind !== ChatInputNotificationActionKind.Command) {
    assert.fail(`Expected command action, got ${action.kind}`);
  }
  return action;
}
function createMockAssignmentService(trajectoryTreatment, switchToAutoTreatment) {
  const getTreatmentCalls = [];
  const service = {
    _serviceBrand: void 0,
    onDidRefetchAssignments: Event.None,
    getCurrentExperiments: async () => [],
    addTelemetryAssignmentFilter(_filter) {
    },
    getTreatment(name) {
      getTreatmentCalls.push(name);
      if (name === SWITCH_TO_AUTO_TREATMENT_NAME) {
        return Promise.resolve(switchToAutoTreatment);
      }
      if (name === TRAJECTORY_NUDGE_TREATMENT_NAME) {
        return Promise.resolve(trajectoryTreatment);
      }
      return Promise.resolve(void 0);
    }
  };
  return { service, getTreatmentCalls };
}
class TestTelemetryService extends NullTelemetryServiceShape {
  constructor() {
    super(...arguments);
    this.events = [];
  }
  publicLog2(eventName, data) {
    if (eventName) {
      this.events.push({ name: eventName, data });
    }
  }
}
function makeQuotaSnapshot(percentRemaining, opts) {
  return {
    percentRemaining,
    unlimited: false,
    ...opts
  };
}
async function flushPromises() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
function makeRateLimitSnapshot(percentRemaining, opts) {
  return {
    percentRemaining,
    unlimited: false,
    resetDate: "2026-06-01T00:00:00Z",
    ...opts
  };
}
function makeResetDate(daysUntilReset) {
  const resetDate = new Date(Date.now() + daysUntilReset * 24 * 60 * 60 * 1e3);
  return resetDate.toISOString();
}
suite("ChatQuotaNotificationContribution", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  teardown(() => {
    sinon.restore();
  });
  function createContribution(entitlementOpts, modelOpts, sharedStorageService) {
    const entitlementMock = createMockEntitlementService(entitlementOpts);
    const notificationMock = createMockNotificationService();
    const assignmentMock = createMockAssignmentService(modelOpts?.trajectoryTreatment, modelOpts?.switchToAutoTreatment);
    const contextKeyService = store.add(new MockContextKeyService());
    if (modelOpts?.contextModelId) {
      contextKeyService.createKey(ChatContextKeys.chatModelId.key, void 0).set(modelOpts.contextModelId);
    }
    const storageService = sharedStorageService ?? store.add(new InMemoryStorageService());
    const vendor = modelOpts?.vendor ?? "copilot";
    const selectedModelId = modelOpts?.selectedModelId ?? `${vendor}/test-model`;
    storageService.store("chat.currentLanguageModel.panel", selectedModelId, StorageScope.PROFILE, StorageTarget.USER);
    const modelIds = ["copilot/auto", selectedModelId];
    const languageModelsService = {
      _serviceBrand: void 0,
      onDidChangeLanguageModelVendors: Event.None,
      onDidChangeLanguageModels: Event.None,
      getLanguageModelIds: () => modelIds,
      getVendors: () => [],
      lookupLanguageModel: (id) => {
        if (id === "copilot/auto") {
          return { id: "auto", vendor: "copilot", family: "auto", isBYOK: false };
        }
        if (id.includes(":")) {
          const [modelVendor2, modelId2] = id.split(":");
          return { id: modelId2, vendor: modelVendor2, family: modelId2, isBYOK: false };
        }
        const [modelVendor, modelId] = id.includes("/") ? id.split("/") : [vendor, id];
        return { id: modelId, vendor: modelVendor, family: modelId, isBYOK: modelVendor !== "copilot" };
      },
      lookupLanguageModelByQualifiedName: () => void 0
    };
    store.add(entitlementMock.onDidChangeQuotaRemaining);
    store.add(entitlementMock.onDidChangeQuotaExceeded);
    store.add(entitlementMock.onDidChangeEntitlement);
    const contribution = store.add(new ChatQuotaNotificationContribution(
      entitlementMock.service,
      notificationMock.service,
      contextKeyService,
      languageModelsService,
      storageService,
      assignmentMock.service,
      modelOpts?.telemetryService ?? new NullTelemetryServiceShape(),
      new NullLogService()
    ));
    return { contribution, entitlementMock, notificationMock, storageService, assignmentMock };
  }
  function updateQuotas(entitlementMock, quotas, opts) {
    const svc = entitlementMock.service;
    if (opts?.entitlement !== void 0) {
      svc.entitlement = opts.entitlement;
    }
    svc.quotas = { ...svc.quotas, ...quotas };
    entitlementMock.onDidChangeQuotaRemaining.fire();
  }
  suite("quota exhausted", () => {
    test("shows exhausted notification at startup when premiumChat is at 0%", () => {
      const { notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) }
      });
      assert.strictEqual(notificationMock.getNotification()?.message, "Credit Limit Reached");
    });
    test("shows exhausted notification for free user via chat snapshot", () => {
      const { notificationMock } = createContribution({
        entitlement: ChatEntitlement.Free,
        quotas: { usageBasedBilling: true, chat: makeQuotaSnapshot(0) }
      });
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().message, "Credit Limit Reached");
    });
    test("hides exhausted notification when quota recovers", () => {
      const { entitlementMock, notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) }
      });
      assert.ok(notificationMock.getNotification());
      updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
      assert.ok(notificationMock.wasDeleted);
    });
    test("does not show spurious threshold notification after exhaustion recovery", () => {
      const { entitlementMock, notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) }
        // 40% used baseline
      });
      updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(0) });
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().message, "Credit Limit Reached");
      notificationMock.reset();
      updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(45) });
      assert.strictEqual(notificationMock.getNotification(), void 0);
    });
    test("does not show exhausted for unlimited quota with hasQuota=true", () => {
      const { notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0, { unlimited: true, hasQuota: true }) }
      });
      assert.strictEqual(notificationMock.getNotification(), void 0);
    });
    test("shows exhausted for unlimited quota with hasQuota=false", () => {
      const { notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0, { unlimited: true, hasQuota: false }) }
      });
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().message, "Credit Limit Reached");
    });
  });
  suite("exhausted dismissal persistence", () => {
    test("does not re-show exhausted notification after reload when previously dismissed", () => {
      const storageService = store.add(new InMemoryStorageService());
      const first = createContribution(
        { quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) } },
        void 0,
        storageService
      );
      const notification = first.notificationMock.getNotification();
      assert.ok(notification);
      first.notificationMock.dismiss(notification.id);
      first.contribution.dispose();
      const second = createContribution(
        { quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) } },
        void 0,
        storageService
      );
      assert.strictEqual(second.notificationMock.getNotification(), void 0);
    });
    test("re-shows exhausted notification after quota recovers and is exhausted again", () => {
      const storageService = store.add(new InMemoryStorageService());
      const first = createContribution(
        { quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) } },
        void 0,
        storageService
      );
      first.notificationMock.dismiss(first.notificationMock.getNotification().id);
      updateQuotas(first.entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
      first.contribution.dispose();
      const second = createContribution(
        { quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) } },
        void 0,
        storageService
      );
      assert.ok(second.notificationMock.getNotification());
      assert.strictEqual(second.notificationMock.getNotification().message, "Credit Limit Reached");
    });
    test("keeps dismissal across reload when quota data is not loaded yet at startup", () => {
      const storageService = store.add(new InMemoryStorageService());
      const first = createContribution(
        { quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) } },
        void 0,
        storageService
      );
      first.notificationMock.dismiss(first.notificationMock.getNotification().id);
      first.contribution.dispose();
      const second = createContribution(
        { quotas: { usageBasedBilling: true, premiumChat: void 0 } },
        void 0,
        storageService
      );
      assert.strictEqual(second.notificationMock.getNotification(), void 0);
      updateQuotas(second.entitlementMock, { premiumChat: makeQuotaSnapshot(0) });
      assert.strictEqual(second.notificationMock.getNotification(), void 0);
    });
  });
  suite("exhausted notification descriptions", () => {
    test("anonymous user gets sign-in action", () => {
      const { notificationMock } = createContribution({
        entitlement: ChatEntitlement.Unknown,
        quotas: { usageBasedBilling: false, premiumChat: makeQuotaSnapshot(0) }
      });
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().description, "Sign in to keep going.");
      assert.strictEqual(notificationMock.getNotification().actions.length, 1);
      assert.strictEqual(getCommandAction(notificationMock.getNotification()).commandId, "workbench.action.chat.triggerSetup");
    });
    test("free user gets upgrade action", () => {
      const { notificationMock } = createContribution({
        entitlement: ChatEntitlement.Free,
        quotas: { usageBasedBilling: true, chat: makeQuotaSnapshot(0) }
      });
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().description, "Upgrade to keep going.");
      assert.strictEqual(getCommandAction(notificationMock.getNotification()).commandId, "workbench.action.chat.upgradePlan");
    });
    test("managed plan user gets admin message", () => {
      const { notificationMock } = createContribution({
        entitlement: ChatEntitlement.Business,
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) }
      });
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().description, "Contact your admin to increase your limits.");
      assert.strictEqual(notificationMock.getNotification().actions.length, 0);
    });
    test("managed plan user with hasQuota=false gets budget exceeded message", () => {
      const { notificationMock } = createContribution({
        entitlement: ChatEntitlement.Business,
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0, { unlimited: true, hasQuota: false }) }
      });
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().message, "Usage Blocked");
      assert.strictEqual(notificationMock.getNotification().description, "Your organization or enterprise has exceeded its Copilot budget. Contact your admin to resume usage.");
      assert.strictEqual(notificationMock.getNotification().actions.length, 0);
    });
    test("managed plan user with hasQuota=false and overages enabled still gets budget exceeded message", () => {
      const { notificationMock } = createContribution({
        entitlement: ChatEntitlement.Enterprise,
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0, { unlimited: true, hasQuota: false }), additionalUsageEnabled: true }
      });
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().message, "Usage Blocked");
      assert.strictEqual(notificationMock.getNotification().description, "Your organization or enterprise has exceeded its Copilot budget. Contact your admin to resume usage.");
      assert.strictEqual(notificationMock.getNotification().actions.length, 0);
    });
    test("paid user with overage gets increase budget action", () => {
      const { notificationMock } = createContribution({
        entitlement: ChatEntitlement.Pro,
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0), additionalUsageCount: 5 }
      });
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().description, "Increase your budget to keep building.");
      assert.strictEqual(getCommandAction(notificationMock.getNotification()).commandId, "workbench.action.chat.manageAdditionalSpend");
    });
    test("paid user without overage gets manage budget action even in switch-to-Auto treatment", () => {
      const { assignmentMock, notificationMock } = createContribution(
        {
          entitlement: ChatEntitlement.Pro,
          quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) }
        },
        { switchToAutoTreatment: true }
      );
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().description, "Manage your budget to keep building.");
      assert.strictEqual(getCommandAction(notificationMock.getNotification()).commandId, "workbench.action.chat.manageAdditionalSpend");
      assert.deepStrictEqual(assignmentMock.getTreatmentCalls, []);
    });
  });
  suite("quota approaching threshold", () => {
    test("first data arrival stores baseline without notification", async () => {
      const { notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(25) }
        // 75% used
      });
      await flushPromises();
      assert.strictEqual(notificationMock.getNotification(), void 0);
    });
    test("notifies when crossing 50% threshold", async () => {
      const { entitlementMock, notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) }
        // 40% used baseline
      });
      await flushPromises();
      updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().message, "Credits at 50%");
    });
    test("treatment suggests switching to Auto when another model is selected", async () => {
      const { assignmentMock, entitlementMock, notificationMock } = createContribution(
        { quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) } },
        { switchToAutoTreatment: true }
      );
      updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
      await flushPromises();
      assert.deepStrictEqual({
        treatments: assignmentMock.getTreatmentCalls,
        description: notificationMock.getNotification()?.description,
        actions: notificationMock.getNotification()?.actions
      }, {
        treatments: [SWITCH_TO_AUTO_TREATMENT_NAME],
        description: "Switch to Auto to reduce credit usage.",
        actions: [{
          kind: ChatInputNotificationActionKind.SwitchToModel,
          label: "Switch to Auto",
          modelIdentifier: "copilot/auto"
        }]
      });
    });
    test("does not enroll and suggests managing budget when Auto is already selected", async () => {
      const { assignmentMock, entitlementMock, notificationMock } = createContribution(
        { quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) } },
        { selectedModelId: "copilot/auto", switchToAutoTreatment: true }
      );
      updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
      await flushPromises();
      assert.strictEqual(notificationMock.getNotification()?.description, "Set additional budget to cover extra usage.");
      assert.strictEqual(getCommandAction(notificationMock.getNotification()).commandId, "workbench.action.chat.manageAdditionalSpend");
      assert.deepStrictEqual(assignmentMock.getTreatmentCalls, []);
    });
    test("recognizes the live short Auto model id before persisted selection updates", async () => {
      const { assignmentMock, entitlementMock, notificationMock } = createContribution(
        { quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) } },
        { contextModelId: "auto", selectedModelId: "copilot/test-model", switchToAutoTreatment: true }
      );
      updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
      await flushPromises();
      assert.strictEqual(notificationMock.getNotification()?.description, "Set additional budget to cover extra usage.");
      assert.strictEqual(getCommandAction(notificationMock.getNotification()).commandId, "workbench.action.chat.manageAdditionalSpend");
      assert.deepStrictEqual(assignmentMock.getTreatmentCalls, []);
    });
    test("control suggests managing budget when another model is selected", async () => {
      const { entitlementMock, notificationMock } = createContribution(
        { quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) } },
        { switchToAutoTreatment: false }
      );
      updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
      await flushPromises();
      assert.strictEqual(notificationMock.getNotification()?.description, "Set additional budget to cover extra usage.");
      assert.strictEqual(getCommandAction(notificationMock.getNotification()).commandId, "workbench.action.chat.manageAdditionalSpend");
    });
    test("does not re-show the same threshold", async () => {
      const { entitlementMock, notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) }
      });
      await flushPromises();
      updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
      assert.ok(notificationMock.getNotification());
      notificationMock.reset();
      entitlementMock.onDidChangeQuotaRemaining.fire();
      assert.strictEqual(notificationMock.getNotification(), void 0);
    });
    test("shows higher threshold when usage increases", async () => {
      const { entitlementMock, notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) }
      });
      await flushPromises();
      updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
      assert.strictEqual(notificationMock.getNotification().message, "Credits at 50%");
      updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(10) });
      assert.strictEqual(notificationMock.getNotification().message, "Credits at 90%");
    });
  });
  suite("PRU users do not see quota notifications", () => {
    test("does not show exhausted notification for PRU user", () => {
      const { notificationMock } = createContribution({
        entitlement: ChatEntitlement.Pro,
        quotas: { usageBasedBilling: false, premiumChat: makeQuotaSnapshot(0) }
      });
      assert.strictEqual(notificationMock.getNotification(), void 0);
    });
    test("does not show approaching notification for PRU user", async () => {
      const { entitlementMock, notificationMock } = createContribution({
        entitlement: ChatEntitlement.Pro,
        quotas: { usageBasedBilling: false, premiumChat: makeQuotaSnapshot(60) }
      });
      await flushPromises();
      updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(5) });
      assert.strictEqual(notificationMock.getNotification(), void 0);
    });
  });
  suite("overage activation notification", () => {
    test("shows overage notification on live transition to 100%", () => {
      const { entitlementMock, notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(10), additionalUsageEnabled: true }
      });
      updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(0), additionalUsageEnabled: true });
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().message, "Credit Limit Reached");
      assert.strictEqual(notificationMock.getNotification().description, "Additional budget is now covering extra usage.");
    });
    test("does not show overage notification at startup when already at 100%", () => {
      const { notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0), additionalUsageEnabled: true }
      });
      assert.strictEqual(notificationMock.getNotification(), void 0);
    });
    test("shows standard exhausted on startup at 100% without overages", () => {
      const { notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0), additionalUsageEnabled: false }
      });
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().message, "Credit Limit Reached");
      assert.notStrictEqual(notificationMock.getNotification().description, "Additional budget is now covering extra usage.");
    });
    test("shows overage notification when overages are enabled while already at 100%", () => {
      const { entitlementMock, notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0), additionalUsageEnabled: false }
      });
      assert.ok(notificationMock.getNotification());
      updateQuotas(entitlementMock, { additionalUsageEnabled: true, premiumChat: makeQuotaSnapshot(0) });
      assert.strictEqual(notificationMock.getNotification().description, "Additional budget is now covering extra usage.");
    });
  });
  suite("quota trajectory warning", () => {
    let clock;
    setup(() => {
      clock = sinon.useFakeTimers({
        now: /* @__PURE__ */ new Date("2026-06-25T00:00:00Z"),
        toFake: ["Date"]
      });
    });
    test("does not show when experiment treatment is disabled", async () => {
      const { notificationMock } = createContribution({
        quotas: {
          resetDate: makeResetDate(24),
          usageBasedBilling: true,
          premiumChat: makeQuotaSnapshot(72)
        }
      });
      await flushPromises();
      assert.strictEqual(notificationMock.getNotification(), void 0);
    });
    test("does not show when user is eligible but not assigned to the experiment", async () => {
      const { assignmentMock, notificationMock } = createContribution({
        entitlement: ChatEntitlement.Pro,
        quotas: {
          resetDate: makeResetDate(24),
          usageBasedBilling: true,
          premiumChat: makeQuotaSnapshot(72)
        }
      });
      await flushPromises();
      assert.deepStrictEqual({
        treatments: assignmentMock.getTreatmentCalls,
        notification: notificationMock.getNotification()
      }, {
        treatments: [TRAJECTORY_NUDGE_TREATMENT_NAME],
        notification: void 0
      });
    });
    test("does not show outside monthly usage window", async () => {
      const results = [];
      for (const percentRemaining of [91, 64]) {
        const { notificationMock } = createContribution({
          entitlement: ChatEntitlement.Pro,
          quotas: {
            resetDate: makeResetDate(24),
            usageBasedBilling: true,
            premiumChat: makeQuotaSnapshot(percentRemaining)
          }
        }, { trajectoryTreatment: true });
        await flushPromises();
        results.push(notificationMock.getNotification()?.message);
      }
      assert.deepStrictEqual(results, [void 0, void 0]);
    });
    test("shows info notification when projected daily usage is above threshold", async () => {
      const { notificationMock } = createContribution({
        entitlement: ChatEntitlement.Pro,
        quotas: {
          resetDate: makeResetDate(24),
          usageBasedBilling: true,
          premiumChat: makeQuotaSnapshot(72)
        }
      }, { trajectoryTreatment: true });
      await flushPromises();
      const notification = notificationMock.getNotification();
      assert.ok(notification);
      const message = notification.message;
      const learnMoreLink = createMarkdownCommandLink({
        text: "Learn about optimizing usage",
        id: CREDIT_EFFICIENCY_LEARN_MORE_COMMAND_ID,
        tooltip: "Learn about optimizing usage"
      });
      assert.deepStrictEqual({
        message: typeof message === "string" ? message : message.value,
        severity: notification.severity,
        actions: notification.actions.length,
        autoDismissOnMessage: notification.autoDismissOnMessage
      }, {
        message: `You're likely to exhaust your AI credits before your billing period. ${learnMoreLink}.`,
        severity: ChatInputNotificationSeverity.Info,
        actions: 0,
        autoDismissOnMessage: false
      });
    });
    test("does not show when projected daily usage is below threshold", async () => {
      const { notificationMock } = createContribution({
        entitlement: ChatEntitlement.Pro,
        quotas: {
          resetDate: makeResetDate(24),
          usageBasedBilling: true,
          premiumChat: makeQuotaSnapshot(78)
        }
      }, { trajectoryTreatment: true });
      await flushPromises();
      assert.strictEqual(notificationMock.getNotification(), void 0);
    });
    test("does not show when reset date implies no elapsed billing days", async () => {
      const { notificationMock } = createContribution({
        entitlement: ChatEntitlement.Pro,
        quotas: {
          resetDate: makeResetDate(31),
          usageBasedBilling: true,
          premiumChat: makeQuotaSnapshot(72)
        }
      }, { trajectoryTreatment: true });
      await flushPromises();
      assert.strictEqual(notificationMock.getNotification(), void 0);
    });
    test("counts the first billing day for 31-day and 28-day cycles", async () => {
      const results = [];
      for (const [now, resetDate] of [
        ["2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"],
        ["2026-02-01T00:00:00Z", "2026-03-01T00:00:00Z"]
      ]) {
        clock.setSystemTime(new Date(now));
        const telemetryService = new TestTelemetryService();
        const { notificationMock } = createContribution({
          entitlement: ChatEntitlement.Pro,
          quotas: {
            resetDate,
            usageBasedBilling: true,
            premiumChat: makeQuotaSnapshot(88)
          }
        }, { trajectoryTreatment: true, telemetryService });
        await flushPromises();
        results.push({
          events: telemetryService.events,
          notificationShown: notificationMock.getNotification() !== void 0
        });
      }
      assert.deepStrictEqual(results, [
        {
          events: [{
            name: "chatQuotaTrajectoryNudgeEnrolled",
            data: { treatment: true, entitlement: "Pro", averageDailyUsage: 12, percentUsed: 12 }
          }],
          notificationShown: true
        },
        {
          events: [{
            name: "chatQuotaTrajectoryNudgeEnrolled",
            data: { treatment: true, entitlement: "Pro", averageDailyUsage: 12, percentUsed: 12 }
          }],
          notificationShown: true
        }
      ]);
    });
    test("shows trajectory nudge only after treatment resolves", async () => {
      let resolveTreatment;
      const trajectoryTreatment = new Promise((resolve) => {
        resolveTreatment = resolve;
      });
      const { notificationMock } = createContribution({
        entitlement: ChatEntitlement.Pro,
        quotas: {
          resetDate: makeResetDate(24),
          usageBasedBilling: true,
          premiumChat: makeQuotaSnapshot(72)
        }
      }, { trajectoryTreatment });
      await flushPromises();
      assert.strictEqual(notificationMock.getNotification(), void 0);
      assert.ok(resolveTreatment);
      resolveTreatment(true);
      await flushPromises();
      const notification = notificationMock.getNotification();
      assert.ok(notification);
      const message = notification.message;
      assert.ok(typeof message !== "string" && message.value.includes("exhaust your AI credits"));
    });
    test("learn more command logs link-clicked telemetry", async () => {
      const telemetryService = new TestTelemetryService();
      createContribution({
        entitlement: ChatEntitlement.Pro,
        quotas: {
          resetDate: makeResetDate(24),
          usageBasedBilling: true,
          premiumChat: makeQuotaSnapshot(72)
        }
      }, { trajectoryTreatment: true, telemetryService });
      await flushPromises();
      const command = CommandsRegistry.getCommand(CREDIT_EFFICIENCY_LEARN_MORE_COMMAND_ID);
      assert.ok(command);
      command.handler({ get: () => ({ open: async () => true }) });
      await flushPromises();
      assert.deepStrictEqual(telemetryService.events, [
        {
          name: "chatQuotaTrajectoryNudgeEnrolled",
          data: { treatment: true, entitlement: "Pro", averageDailyUsage: 4.67, percentUsed: 28 }
        },
        {
          name: "chatQuotaTrajectoryNudgeLinkClicked",
          data: void 0
        }
      ]);
    });
    test("logs enrollment telemetry for control assignment without showing nudge", async () => {
      const telemetryService = new TestTelemetryService();
      const { notificationMock } = createContribution({
        entitlement: ChatEntitlement.Pro,
        quotas: {
          resetDate: makeResetDate(24),
          usageBasedBilling: true,
          premiumChat: makeQuotaSnapshot(72)
        }
      }, { trajectoryTreatment: false, telemetryService });
      await flushPromises();
      assert.deepStrictEqual({
        events: telemetryService.events,
        notification: notificationMock.getNotification()
      }, {
        events: [{
          name: "chatQuotaTrajectoryNudgeEnrolled",
          data: { treatment: false, entitlement: "Pro", averageDailyUsage: 4.67, percentUsed: 28 }
        }],
        notification: void 0
      });
    });
    test("does not log enrollment telemetry when not assigned to a flight", async () => {
      const telemetryService = new TestTelemetryService();
      const { notificationMock } = createContribution({
        entitlement: ChatEntitlement.Pro,
        quotas: {
          resetDate: makeResetDate(24),
          usageBasedBilling: true,
          premiumChat: makeQuotaSnapshot(72)
        }
      }, { telemetryService });
      await flushPromises();
      assert.deepStrictEqual({
        events: telemetryService.events,
        notification: notificationMock.getNotification()
      }, {
        events: [],
        notification: void 0
      });
    });
    test("remembers trajectory display for the quota period", async () => {
      const { entitlementMock, notificationMock } = createContribution({
        entitlement: ChatEntitlement.ProPlus,
        quotas: {
          resetDate: makeResetDate(24),
          usageBasedBilling: true,
          premiumChat: makeQuotaSnapshot(72)
        }
      }, { trajectoryTreatment: true });
      await flushPromises();
      assert.ok(notificationMock.getNotification());
      notificationMock.reset();
      entitlementMock.onDidChangeQuotaRemaining.fire();
      assert.strictEqual(notificationMock.getNotification(), void 0);
    });
    test("does not enforce SKU eligibility outside experiment assignment", async () => {
      const results = {};
      for (const entitlement of [ChatEntitlement.Pro, ChatEntitlement.ProPlus, ChatEntitlement.Max, ChatEntitlement.EDU, ChatEntitlement.Business, ChatEntitlement.Enterprise, ChatEntitlement.Free, ChatEntitlement.Unknown]) {
        const { notificationMock } = createContribution({
          entitlement,
          quotas: {
            resetDate: makeResetDate(24),
            usageBasedBilling: true,
            premiumChat: makeQuotaSnapshot(72),
            chat: makeQuotaSnapshot(72)
          }
        }, { trajectoryTreatment: true });
        await flushPromises();
        results[ChatEntitlement[entitlement]] = !!notificationMock.getNotification();
      }
      assert.deepStrictEqual(results, {
        Pro: true,
        ProPlus: true,
        Max: true,
        EDU: true,
        Business: true,
        Enterprise: true,
        Free: true,
        Unknown: true
      });
    });
  });
  suite("rate-limit warnings", () => {
    test("shows session rate limit warning on threshold crossing", async () => {
      const { entitlementMock, notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, sessionRateLimit: makeRateLimitSnapshot(60) }
        // baseline
      });
      await flushPromises();
      updateQuotas(entitlementMock, { sessionRateLimit: makeRateLimitSnapshot(25) });
      assert.ok(notificationMock.getNotification());
      assert.ok(notificationMock.getNotification().message.includes("75%"));
      assert.ok(notificationMock.getNotification().message.includes("session"));
    });
    test("shows weekly rate limit warning on threshold crossing", async () => {
      const { entitlementMock, notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, weeklyRateLimit: makeRateLimitSnapshot(60) }
        // baseline
      });
      await flushPromises();
      updateQuotas(entitlementMock, { weeklyRateLimit: makeRateLimitSnapshot(10) });
      assert.ok(notificationMock.getNotification());
      assert.ok(notificationMock.getNotification().message.includes("90%"));
      assert.ok(notificationMock.getNotification().message.includes("weekly"));
    });
    test("first rate limit data stores baseline without notification", async () => {
      const { notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, sessionRateLimit: makeRateLimitSnapshot(10) }
        // 90% used
      });
      await flushPromises();
      assert.strictEqual(notificationMock.getNotification(), void 0);
    });
  });
  suite("priority ordering", () => {
    test("exhausted takes priority over approaching threshold", () => {
      const { notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) }
      });
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().message, "Credit Limit Reached");
    });
    test("approaching threshold takes priority over rate limit", async () => {
      const { entitlementMock, notificationMock } = createContribution({
        quotas: {
          usageBasedBilling: true,
          premiumChat: makeQuotaSnapshot(60),
          // 40% — baseline
          sessionRateLimit: makeRateLimitSnapshot(60)
          // 40% — baseline
        }
      });
      await flushPromises();
      updateQuotas(entitlementMock, {
        premiumChat: makeQuotaSnapshot(10),
        // 90% — crosses threshold
        sessionRateLimit: makeRateLimitSnapshot(25)
        // 75% — crosses threshold
      });
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().message, "Credits at 90%");
    });
  });
  suite("approaching notification descriptions", () => {
    test("free user gets upgrade action", async () => {
      const { entitlementMock, notificationMock } = createContribution({
        entitlement: ChatEntitlement.Free,
        quotas: { usageBasedBilling: true, chat: makeQuotaSnapshot(60) }
      });
      await flushPromises();
      updateQuotas(entitlementMock, { chat: makeQuotaSnapshot(50) });
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().description, "Upgrade to continue past the limit.");
    });
    test("managed plan user gets admin message", async () => {
      const { entitlementMock, notificationMock } = createContribution({
        entitlement: ChatEntitlement.Enterprise,
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) }
      });
      await flushPromises();
      updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().description, "Contact your admin to increase your limits.");
    });
    test("paid user with overages enabled gets budget message", async () => {
      const { entitlementMock, notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60), additionalUsageEnabled: true }
      });
      await flushPromises();
      updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().description, "Additional budget is enabled to cover extra usage.");
    });
    test("paid user without overages gets set budget action", async () => {
      const { entitlementMock, notificationMock } = createContribution({
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(60) }
      });
      await flushPromises();
      updateQuotas(entitlementMock, { premiumChat: makeQuotaSnapshot(50) });
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification().description, "Set additional budget to cover extra usage.");
      assert.strictEqual(getCommandAction(notificationMock.getNotification()).commandId, "workbench.action.chat.manageAdditionalSpend");
    });
  });
  suite("BYOK model suppression", () => {
    test("defers notifications when BYOK model is selected", () => {
      const { notificationMock } = createContribution(
        { quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) } },
        { vendor: "customendpoint" }
      );
      assert.strictEqual(notificationMock.getNotification(), void 0);
    });
    test("shows notification when Copilot model is selected", () => {
      const { notificationMock } = createContribution(
        { quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) } },
        { vendor: "copilot" }
      );
      assert.ok(notificationMock.getNotification());
      assert.strictEqual(notificationMock.getNotification()?.message, "Credit Limit Reached");
    });
    test("shows notification when switching from BYOK to Copilot model", () => {
      const entitlementMock = createMockEntitlementService({
        quotas: { usageBasedBilling: true, premiumChat: makeQuotaSnapshot(0) }
      });
      const notificationMock = createMockNotificationService();
      const assignmentMock = createMockAssignmentService();
      const contextKeyService = store.add(new MockContextKeyService());
      const storageService = store.add(new InMemoryStorageService());
      storageService.store("chat.currentLanguageModel.panel", "customendpoint/ANT/claude-sonnet-4-6", StorageScope.PROFILE, StorageTarget.USER);
      const languageModelsService = {
        _serviceBrand: void 0,
        onDidChangeLanguageModelVendors: Event.None,
        onDidChangeLanguageModels: Event.None,
        getLanguageModelIds: () => [],
        getVendors: () => [],
        lookupLanguageModel: () => void 0,
        lookupLanguageModelByQualifiedName: () => void 0
      };
      store.add(entitlementMock.onDidChangeQuotaRemaining);
      store.add(entitlementMock.onDidChangeQuotaExceeded);
      store.add(entitlementMock.onDidChangeEntitlement);
      store.add(new ChatQuotaNotificationContribution(
        entitlementMock.service,
        notificationMock.service,
        contextKeyService,
        languageModelsService,
        storageService,
        assignmentMock.service,
        new NullTelemetryServiceShape(),
        new NullLogService()
      ));
      assert.strictEqual(notificationMock.getNotification(), void 0);
      storageService.store("chat.currentLanguageModel.panel", "copilot/gpt-4.1", StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(notificationMock.getNotification()?.message, "Credit Limit Reached");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRRdW90YU5vdGlmaWNhdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgc2lub24gZnJvbSAnc2lub24nO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVNYXJrZG93bkNvbW1hbmRMaW5rIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgTW9ja0NvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSUFzc2lnbm1lbnRGaWx0ZXIsIElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudCwgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIElDaGF0U2VudGltZW50LCBJUXVvdGFTbmFwc2hvdCwgSVJhdGVMaW1pdFNuYXBzaG90IH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0UXVvdGFOb3RpZmljYXRpb25Db250cmlidXRpb24gfSBmcm9tICcuLi8uLi9icm93c2VyL2NoYXRRdW90YU5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZCwgQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHksIElDaGF0SW5wdXROb3RpZmljYXRpb24sIElDaGF0SW5wdXROb3RpZmljYXRpb25Db21tYW5kQWN0aW9uLCBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuXG5jb25zdCBDUkVESVRfRUZGSUNJRU5DWV9MRUFSTl9NT1JFX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmxlYXJuTW9yZUFib3V0Q3JlZGl0VXNhZ2UnO1xuY29uc3QgU1dJVENIX1RPX0FVVE9fVFJFQVRNRU5UX05BTUUgPSAnY29uZmlnLmNoYXRRdW90YVdhcm5pbmdTd2l0Y2hUb0F1dG8nO1xuY29uc3QgVFJBSkVDVE9SWV9OVURHRV9UUkVBVE1FTlRfTkFNRSA9ICdjb25maWcuY2hhdFF1b3RhVHJhamVjdG9yeU51ZGdlJztcblxuLy8gLS0tIE1vY2sgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5pbnRlcmZhY2UgSU1vY2tRdW90YXMge1xuXHRyZXNldERhdGU/OiBzdHJpbmc7XG5cdHVzYWdlQmFzZWRCaWxsaW5nPzogYm9vbGVhbjtcblx0Y2hhdD86IElRdW90YVNuYXBzaG90O1xuXHRjb21wbGV0aW9ucz86IElRdW90YVNuYXBzaG90O1xuXHRwcmVtaXVtQ2hhdD86IElRdW90YVNuYXBzaG90O1xuXHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkPzogYm9vbGVhbjtcblx0YWRkaXRpb25hbFVzYWdlQ291bnQ/OiBudW1iZXI7XG5cdHNlc3Npb25SYXRlTGltaXQ/OiBJUmF0ZUxpbWl0U25hcHNob3Q7XG5cdHdlZWtseVJhdGVMaW1pdD86IElSYXRlTGltaXRTbmFwc2hvdDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTW9ja0VudGl0bGVtZW50U2VydmljZShvcHRzPzoge1xuXHRlbnRpdGxlbWVudD86IENoYXRFbnRpdGxlbWVudDtcblx0cXVvdGFzPzogSU1vY2tRdW90YXM7XG59KSB7XG5cdGNvbnN0IG9uRGlkQ2hhbmdlUXVvdGFSZW1haW5pbmcgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRjb25zdCBvbkRpZENoYW5nZVF1b3RhRXhjZWVkZWQgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRjb25zdCBvbkRpZENoYW5nZUVudGl0bGVtZW50ID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblxuXHRjb25zdCBzZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSA9IHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0ZW50aXRsZW1lbnQ6IG9wdHM/LmVudGl0bGVtZW50ID8/IENoYXRFbnRpdGxlbWVudC5Qcm8sXG5cdFx0ZW50aXRsZW1lbnRPYnM6IG9ic2VydmFibGVWYWx1ZSh7fSwgb3B0cz8uZW50aXRsZW1lbnQgPz8gQ2hhdEVudGl0bGVtZW50LlBybyksXG5cdFx0b25EaWRDaGFuZ2VFbnRpdGxlbWVudDogb25EaWRDaGFuZ2VFbnRpdGxlbWVudC5ldmVudCxcblx0XHRvbkRpZENoYW5nZVF1b3RhRXhjZWVkZWQ6IG9uRGlkQ2hhbmdlUXVvdGFFeGNlZWRlZC5ldmVudCxcblx0XHRvbkRpZENoYW5nZVF1b3RhUmVtYWluaW5nOiBvbkRpZENoYW5nZVF1b3RhUmVtYWluaW5nLmV2ZW50LFxuXHRcdG9uRGlkQ2hhbmdlVXNhZ2VCYXNlZEJpbGxpbmc6IEV2ZW50Lk5vbmUsXG5cdFx0cXVvdGFzOiB7XG5cdFx0XHRyZXNldERhdGU6IG9wdHM/LnF1b3Rhcz8ucmVzZXREYXRlLFxuXHRcdFx0dXNhZ2VCYXNlZEJpbGxpbmc6IG9wdHM/LnF1b3Rhcz8udXNhZ2VCYXNlZEJpbGxpbmcgPz8gdHJ1ZSxcblx0XHRcdGNoYXQ6IG9wdHM/LnF1b3Rhcz8uY2hhdCxcblx0XHRcdGNvbXBsZXRpb25zOiBvcHRzPy5xdW90YXM/LmNvbXBsZXRpb25zLFxuXHRcdFx0cHJlbWl1bUNoYXQ6IG9wdHM/LnF1b3Rhcz8ucHJlbWl1bUNoYXQsXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiBvcHRzPy5xdW90YXM/LmFkZGl0aW9uYWxVc2FnZUVuYWJsZWQsXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VDb3VudDogb3B0cz8ucXVvdGFzPy5hZGRpdGlvbmFsVXNhZ2VDb3VudCxcblx0XHRcdHNlc3Npb25SYXRlTGltaXQ6IG9wdHM/LnF1b3Rhcz8uc2Vzc2lvblJhdGVMaW1pdCxcblx0XHRcdHdlZWtseVJhdGVMaW1pdDogb3B0cz8ucXVvdGFzPy53ZWVrbHlSYXRlTGltaXQsXG5cdFx0fSxcblx0XHRvcmdhbmlzYXRpb25zOiB1bmRlZmluZWQsXG5cdFx0aXNJbnRlcm5hbDogZmFsc2UsXG5cdFx0c2t1OiB1bmRlZmluZWQsXG5cdFx0Y29waWxvdFRyYWNraW5nSWQ6IHVuZGVmaW5lZCxcblx0XHRjbGllbnRCeW9rRW5hYmxlZDogZmFsc2UsXG5cdFx0aGFzQnlva01vZGVsczogZmFsc2UsXG5cdFx0b25EaWRDaGFuZ2VTZW50aW1lbnQ6IEV2ZW50Lk5vbmUsXG5cdFx0c2VudGltZW50OiB7fSBhcyBJQ2hhdFNlbnRpbWVudCxcblx0XHRzZW50aW1lbnRPYnM6IG9ic2VydmFibGVWYWx1ZSh7fSwge30gYXMgSUNoYXRTZW50aW1lbnQpIGFzIElPYnNlcnZhYmxlPElDaGF0U2VudGltZW50Pixcblx0XHRvbkRpZENoYW5nZUFub255bW91czogRXZlbnQuTm9uZSxcblx0XHRhbm9ueW1vdXM6IGZhbHNlLFxuXHRcdGFub255bW91c09iczogb2JzZXJ2YWJsZVZhbHVlKHt9LCBmYWxzZSksXG5cdFx0YWNjZXB0UXVvdGFzKCkgeyB9LFxuXHRcdGNsZWFyUXVvdGFzKCkgeyB9LFxuXHRcdG1hcmtBbm9ueW1vdXNSYXRlTGltaXRlZCgpIHsgfSxcblx0XHRtYXJrU2V0dXBDb21wbGV0ZWQoKSB7IH0sXG5cdFx0c2V0Rm9yY2VIaWRkZW4oKSB7IH0sXG5cdFx0dXBkYXRlKCkgeyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7IH0sXG5cdH07XG5cblx0cmV0dXJuIHsgc2VydmljZSwgb25EaWRDaGFuZ2VRdW90YVJlbWFpbmluZywgb25EaWRDaGFuZ2VRdW90YUV4Y2VlZGVkLCBvbkRpZENoYW5nZUVudGl0bGVtZW50IH07XG59XG5cbi8vIC0tLSBNb2NrIElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrTm90aWZpY2F0aW9uU2VydmljZSgpIHtcblx0bGV0IGxhc3ROb3RpZmljYXRpb246IElDaGF0SW5wdXROb3RpZmljYXRpb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGxldCBkZWxldGVkID0gZmFsc2U7XG5cdGxldCBkaXNtaXNzZWQgPSBmYWxzZTtcblx0bGV0IHNldENvdW50ID0gMDtcblxuXHRjb25zdCBvbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdGNvbnN0IG9uRGlkRGlzbWlzcyA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblxuXHRjb25zdCBzZXJ2aWNlOiBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSA9IHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0b25EaWRDaGFuZ2U6IG9uRGlkQ2hhbmdlLmV2ZW50LFxuXHRcdG9uRGlkRGlzbWlzczogb25EaWREaXNtaXNzLmV2ZW50LFxuXHRcdHNldE5vdGlmaWNhdGlvbihub3RpZmljYXRpb246IElDaGF0SW5wdXROb3RpZmljYXRpb24pIHtcblx0XHRcdGxhc3ROb3RpZmljYXRpb24gPSBub3RpZmljYXRpb247XG5cdFx0XHRkZWxldGVkID0gZmFsc2U7XG5cdFx0XHRkaXNtaXNzZWQgPSBmYWxzZTtcblx0XHRcdHNldENvdW50Kys7XG5cdFx0XHRvbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fSxcblx0XHRkZWxldGVOb3RpZmljYXRpb24oaWQ6IHN0cmluZykge1xuXHRcdFx0aWYgKGxhc3ROb3RpZmljYXRpb24/LmlkID09PSBpZCAmJiAhZGVsZXRlZCkge1xuXHRcdFx0XHRkZWxldGVkID0gdHJ1ZTtcblx0XHRcdFx0ZGlzbWlzc2VkID0gZmFsc2U7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdGRpc21pc3NOb3RpZmljYXRpb24oaWQ6IHN0cmluZykge1xuXHRcdFx0aWYgKCFsYXN0Tm90aWZpY2F0aW9uIHx8IGxhc3ROb3RpZmljYXRpb24uaWQgIT09IGlkIHx8IGRlbGV0ZWQgfHwgZGlzbWlzc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGRpc21pc3NlZCA9IHRydWU7XG5cdFx0XHRvbkRpZERpc21pc3MuZmlyZShpZCk7XG5cdFx0XHRvbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fSxcblx0XHRnZXRBY3RpdmVOb3RpZmljYXRpb24oZmlsdGVyPzogKG5vdGlmaWNhdGlvbjogSUNoYXRJbnB1dE5vdGlmaWNhdGlvbikgPT4gYm9vbGVhbikge1xuXHRcdFx0aWYgKGRlbGV0ZWQgfHwgZGlzbWlzc2VkIHx8ICFsYXN0Tm90aWZpY2F0aW9uKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gIWZpbHRlciB8fCBmaWx0ZXIobGFzdE5vdGlmaWNhdGlvbikgPyBsYXN0Tm90aWZpY2F0aW9uIDogdW5kZWZpbmVkO1xuXHRcdH0sXG5cdFx0aGFuZGxlTWVzc2FnZVNlbnQoKSB7IH0sXG5cdFx0YW5ub3VuY2VSZW5kZXJlZCgpIHsgfSxcblx0fTtcblxuXHRyZXR1cm4ge1xuXHRcdHNlcnZpY2UsXG5cdFx0Z2V0Tm90aWZpY2F0aW9uKCk6IElDaGF0SW5wdXROb3RpZmljYXRpb24gfCB1bmRlZmluZWQgeyByZXR1cm4gZGVsZXRlZCB8fCBkaXNtaXNzZWQgPyB1bmRlZmluZWQgOiBsYXN0Tm90aWZpY2F0aW9uOyB9LFxuXHRcdGdldCB3YXNEZWxldGVkKCkgeyByZXR1cm4gZGVsZXRlZDsgfSxcblx0XHRnZXQgc2V0Q291bnQoKSB7IHJldHVybiBzZXRDb3VudDsgfSxcblx0XHRkaXNtaXNzKGlkPzogc3RyaW5nKSB7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25JZCA9IGlkID8/IGxhc3ROb3RpZmljYXRpb24/LmlkO1xuXHRcdFx0aWYgKG5vdGlmaWNhdGlvbklkKSB7XG5cdFx0XHRcdHNlcnZpY2UuZGlzbWlzc05vdGlmaWNhdGlvbihub3RpZmljYXRpb25JZCk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRyZXNldCgpIHsgbGFzdE5vdGlmaWNhdGlvbiA9IHVuZGVmaW5lZDsgZGVsZXRlZCA9IGZhbHNlOyBkaXNtaXNzZWQgPSBmYWxzZTsgc2V0Q291bnQgPSAwOyB9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBnZXRDb21tYW5kQWN0aW9uKG5vdGlmaWNhdGlvbjogSUNoYXRJbnB1dE5vdGlmaWNhdGlvbik6IElDaGF0SW5wdXROb3RpZmljYXRpb25Db21tYW5kQWN0aW9uIHtcblx0Y29uc3QgYWN0aW9uID0gbm90aWZpY2F0aW9uLmFjdGlvbnNbMF07XG5cdGlmIChhY3Rpb24ua2luZCAhPT0gQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZC5Db21tYW5kKSB7XG5cdFx0YXNzZXJ0LmZhaWwoYEV4cGVjdGVkIGNvbW1hbmQgYWN0aW9uLCBnb3QgJHthY3Rpb24ua2luZH1gKTtcblx0fVxuXHRyZXR1cm4gYWN0aW9uO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrQXNzaWdubWVudFNlcnZpY2UoXG5cdHRyYWplY3RvcnlUcmVhdG1lbnQ/OiBib29sZWFuIHwgUHJvbWlzZTxib29sZWFuIHwgdW5kZWZpbmVkPixcblx0c3dpdGNoVG9BdXRvVHJlYXRtZW50PzogYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbiB8IHVuZGVmaW5lZD4sXG4pIHtcblx0Y29uc3QgZ2V0VHJlYXRtZW50Q2FsbHM6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IHNlcnZpY2U6IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSA9IHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0b25EaWRSZWZldGNoQXNzaWdubWVudHM6IEV2ZW50Lk5vbmUsXG5cdFx0Z2V0Q3VycmVudEV4cGVyaW1lbnRzOiBhc3luYyAoKSA9PiBbXSxcblx0XHRhZGRUZWxlbWV0cnlBc3NpZ25tZW50RmlsdGVyKF9maWx0ZXI6IElBc3NpZ25tZW50RmlsdGVyKTogdm9pZCB7IH0sXG5cdFx0Z2V0VHJlYXRtZW50PFQgZXh0ZW5kcyBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuPihuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFQgfCB1bmRlZmluZWQ+IHtcblx0XHRcdGdldFRyZWF0bWVudENhbGxzLnB1c2gobmFtZSk7XG5cdFx0XHRpZiAobmFtZSA9PT0gU1dJVENIX1RPX0FVVE9fVFJFQVRNRU5UX05BTUUpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShzd2l0Y2hUb0F1dG9UcmVhdG1lbnQgYXMgVCB8IHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAobmFtZSA9PT0gVFJBSkVDVE9SWV9OVURHRV9UUkVBVE1FTlRfTkFNRSkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRyYWplY3RvcnlUcmVhdG1lbnQgYXMgVCB8IHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fSxcblx0fTtcblxuXHRyZXR1cm4geyBzZXJ2aWNlLCBnZXRUcmVhdG1lbnRDYWxscyB9O1xufVxuXG5jbGFzcyBUZXN0VGVsZW1ldHJ5U2VydmljZSBleHRlbmRzIE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUge1xuXHRyZWFkb25seSBldmVudHM6IHsgbmFtZTogc3RyaW5nOyBkYXRhOiB1bmtub3duIH1bXSA9IFtdO1xuXG5cdG92ZXJyaWRlIHB1YmxpY0xvZzIoZXZlbnROYW1lPzogc3RyaW5nLCBkYXRhPzogdW5rbm93bik6IHZvaWQge1xuXHRcdGlmIChldmVudE5hbWUpIHtcblx0XHRcdHRoaXMuZXZlbnRzLnB1c2goeyBuYW1lOiBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0fVxuXHR9XG59XG5cbi8vIC0tLSBIZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBtYWtlUXVvdGFTbmFwc2hvdChwZXJjZW50UmVtYWluaW5nOiBudW1iZXIsIG9wdHM/OiBQYXJ0aWFsPElRdW90YVNuYXBzaG90Pik6IElRdW90YVNuYXBzaG90IHtcblx0cmV0dXJuIHtcblx0XHRwZXJjZW50UmVtYWluaW5nLFxuXHRcdHVubGltaXRlZDogZmFsc2UsXG5cdFx0Li4ub3B0cyxcblx0fTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZmx1c2hQcm9taXNlcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcbn1cblxuZnVuY3Rpb24gbWFrZVJhdGVMaW1pdFNuYXBzaG90KHBlcmNlbnRSZW1haW5pbmc6IG51bWJlciwgb3B0cz86IFBhcnRpYWw8SVJhdGVMaW1pdFNuYXBzaG90Pik6IElSYXRlTGltaXRTbmFwc2hvdCB7XG5cdHJldHVybiB7XG5cdFx0cGVyY2VudFJlbWFpbmluZyxcblx0XHR1bmxpbWl0ZWQ6IGZhbHNlLFxuXHRcdHJlc2V0RGF0ZTogJzIwMjYtMDYtMDFUMDA6MDA6MDBaJyxcblx0XHQuLi5vcHRzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlUmVzZXREYXRlKGRheXNVbnRpbFJlc2V0OiBudW1iZXIpOiBzdHJpbmcge1xuXHRjb25zdCByZXNldERhdGUgPSBuZXcgRGF0ZShEYXRlLm5vdygpICsgZGF5c1VudGlsUmVzZXQgKiAyNCAqIDYwICogNjAgKiAxMDAwKTtcblx0cmV0dXJuIHJlc2V0RGF0ZS50b0lTT1N0cmluZygpO1xufVxuXG4vLyAtLS0gVGVzdHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuc3VpdGUoJ0NoYXRRdW90YU5vdGlmaWNhdGlvbkNvbnRyaWJ1dGlvbicsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUNvbnRyaWJ1dGlvbihcblx0XHRlbnRpdGxlbWVudE9wdHM/OiBQYXJhbWV0ZXJzPHR5cGVvZiBjcmVhdGVNb2NrRW50aXRsZW1lbnRTZXJ2aWNlPlswXSxcblx0XHRtb2RlbE9wdHM/OiB7IGNvbnRleHRNb2RlbElkPzogc3RyaW5nOyB2ZW5kb3I/OiBzdHJpbmc7IHNlbGVjdGVkTW9kZWxJZD86IHN0cmluZzsgc3dpdGNoVG9BdXRvVHJlYXRtZW50PzogYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbiB8IHVuZGVmaW5lZD47IHRyYWplY3RvcnlUcmVhdG1lbnQ/OiBib29sZWFuIHwgUHJvbWlzZTxib29sZWFuIHwgdW5kZWZpbmVkPjsgdGVsZW1ldHJ5U2VydmljZT86IElUZWxlbWV0cnlTZXJ2aWNlIH0sXG5cdFx0c2hhcmVkU3RvcmFnZVNlcnZpY2U/OiBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBlbnRpdGxlbWVudE1vY2sgPSBjcmVhdGVNb2NrRW50aXRsZW1lbnRTZXJ2aWNlKGVudGl0bGVtZW50T3B0cyk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uTW9jayA9IGNyZWF0ZU1vY2tOb3RpZmljYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgYXNzaWdubWVudE1vY2sgPSBjcmVhdGVNb2NrQXNzaWdubWVudFNlcnZpY2UobW9kZWxPcHRzPy50cmFqZWN0b3J5VHJlYXRtZW50LCBtb2RlbE9wdHM/LnN3aXRjaFRvQXV0b1RyZWF0bWVudCk7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpKTtcblx0XHRpZiAobW9kZWxPcHRzPy5jb250ZXh0TW9kZWxJZCkge1xuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5PHN0cmluZyB8IHVuZGVmaW5lZD4oQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlbElkLmtleSwgdW5kZWZpbmVkKS5zZXQobW9kZWxPcHRzLmNvbnRleHRNb2RlbElkKTtcblx0XHR9XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBzaGFyZWRTdG9yYWdlU2VydmljZSA/PyBzdG9yZS5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgdmVuZG9yID0gbW9kZWxPcHRzPy52ZW5kb3IgPz8gJ2NvcGlsb3QnO1xuXHRcdGNvbnN0IHNlbGVjdGVkTW9kZWxJZCA9IG1vZGVsT3B0cz8uc2VsZWN0ZWRNb2RlbElkID8/IGAke3ZlbmRvcn0vdGVzdC1tb2RlbGA7XG5cdFx0Ly8gUGVyc2lzdCBtb2RlbCBzZWxlY3Rpb24gaW4gc3RvcmFnZSAodXNlZCBieSBnZXRTZWxlY3RlZE1vZGVsVmVuZG9yKVxuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdjaGF0LmN1cnJlbnRMYW5ndWFnZU1vZGVsLnBhbmVsJywgc2VsZWN0ZWRNb2RlbElkLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRjb25zdCBtb2RlbElkcyA9IFsnY29waWxvdC9hdXRvJywgc2VsZWN0ZWRNb2RlbElkXTtcblx0XHRjb25zdCBsYW5ndWFnZU1vZGVsc1NlcnZpY2UgPSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxWZW5kb3JzOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsczogRXZlbnQuTm9uZSxcblx0XHRcdGdldExhbmd1YWdlTW9kZWxJZHM6ICgpID0+IG1vZGVsSWRzLFxuXHRcdFx0Z2V0VmVuZG9yczogKCkgPT4gW10sXG5cdFx0XHRsb29rdXBMYW5ndWFnZU1vZGVsOiAoaWQ6IHN0cmluZyk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0aWYgKGlkID09PSAnY29waWxvdC9hdXRvJykge1xuXHRcdFx0XHRcdHJldHVybiB7IGlkOiAnYXV0bycsIHZlbmRvcjogJ2NvcGlsb3QnLCBmYW1pbHk6ICdhdXRvJywgaXNCWU9LOiBmYWxzZSB9IGFzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEFnZW50LWhvc3QgbW9kZWxzIChlLmcuIHRoZSBDb3BpbG90IENMSSBoYXJuZXNzKSBhcmUgcmVnaXN0ZXJlZFxuXHRcdFx0XHQvLyB1bmRlciBhIGAke3ZlbmRvcn06JHtpZH1gIGlkZW50aWZpZXIgYW5kIGFyZSBDQVBJLWJhY2tlZCAobm90IEJZT0spLlxuXHRcdFx0XHRpZiAoaWQuaW5jbHVkZXMoJzonKSkge1xuXHRcdFx0XHRcdGNvbnN0IFttb2RlbFZlbmRvciwgbW9kZWxJZF0gPSBpZC5zcGxpdCgnOicpO1xuXHRcdFx0XHRcdHJldHVybiB7IGlkOiBtb2RlbElkLCB2ZW5kb3I6IG1vZGVsVmVuZG9yLCBmYW1pbHk6IG1vZGVsSWQsIGlzQllPSzogZmFsc2UgfSBhcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBbbW9kZWxWZW5kb3IsIG1vZGVsSWRdID0gaWQuaW5jbHVkZXMoJy8nKSA/IGlkLnNwbGl0KCcvJykgOiBbdmVuZG9yLCBpZF07XG5cdFx0XHRcdHJldHVybiB7IGlkOiBtb2RlbElkLCB2ZW5kb3I6IG1vZGVsVmVuZG9yLCBmYW1pbHk6IG1vZGVsSWQsIGlzQllPSzogbW9kZWxWZW5kb3IgIT09ICdjb3BpbG90JyB9IGFzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhO1xuXHRcdFx0fSxcblx0XHRcdGxvb2t1cExhbmd1YWdlTW9kZWxCeVF1YWxpZmllZE5hbWU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9IGFzIHVua25vd24gYXMgSUxhbmd1YWdlTW9kZWxzU2VydmljZTtcblxuXHRcdC8vIFRyYWNrIGRpc3Bvc2FibGVzIGZvciBlbWl0dGVyc1xuXHRcdHN0b3JlLmFkZChlbnRpdGxlbWVudE1vY2sub25EaWRDaGFuZ2VRdW90YVJlbWFpbmluZyk7XG5cdFx0c3RvcmUuYWRkKGVudGl0bGVtZW50TW9jay5vbkRpZENoYW5nZVF1b3RhRXhjZWVkZWQpO1xuXHRcdHN0b3JlLmFkZChlbnRpdGxlbWVudE1vY2sub25EaWRDaGFuZ2VFbnRpdGxlbWVudCk7XG5cblx0XHRjb25zdCBjb250cmlidXRpb24gPSBzdG9yZS5hZGQobmV3IENoYXRRdW90YU5vdGlmaWNhdGlvbkNvbnRyaWJ1dGlvbihcblx0XHRcdGVudGl0bGVtZW50TW9jay5zZXJ2aWNlLFxuXHRcdFx0bm90aWZpY2F0aW9uTW9jay5zZXJ2aWNlLFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UgYXMgSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRhc3NpZ25tZW50TW9jay5zZXJ2aWNlLFxuXHRcdFx0bW9kZWxPcHRzPy50ZWxlbWV0cnlTZXJ2aWNlID8/IG5ldyBOdWxsVGVsZW1ldHJ5U2VydmljZVNoYXBlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdHJldHVybiB7IGNvbnRyaWJ1dGlvbiwgZW50aXRsZW1lbnRNb2NrLCBub3RpZmljYXRpb25Nb2NrLCBzdG9yYWdlU2VydmljZSwgYXNzaWdubWVudE1vY2sgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIHVwZGF0ZVF1b3Rhcyhcblx0XHRlbnRpdGxlbWVudE1vY2s6IFJldHVyblR5cGU8dHlwZW9mIGNyZWF0ZU1vY2tFbnRpdGxlbWVudFNlcnZpY2U+LFxuXHRcdHF1b3RhczogSU1vY2tRdW90YXMsXG5cdFx0b3B0cz86IHsgZW50aXRsZW1lbnQ/OiBDaGF0RW50aXRsZW1lbnQgfSxcblx0KSB7XG5cdFx0Y29uc3Qgc3ZjOiB7IGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQ7IHF1b3RhczogSU1vY2tRdW90YXMgfSA9IGVudGl0bGVtZW50TW9jay5zZXJ2aWNlIGFzIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlICYgeyBlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50OyBxdW90YXM6IElNb2NrUXVvdGFzIH07XG5cdFx0aWYgKG9wdHM/LmVudGl0bGVtZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHN2Yy5lbnRpdGxlbWVudCA9IG9wdHMuZW50aXRsZW1lbnQ7XG5cdFx0fVxuXHRcdHN2Yy5xdW90YXMgPSB7IC4uLnN2Yy5xdW90YXMsIC4uLnF1b3RhcyB9O1xuXHRcdGVudGl0bGVtZW50TW9jay5vbkRpZENoYW5nZVF1b3RhUmVtYWluaW5nLmZpcmUoKTtcblx0fVxuXG5cdC8vIC0tLSBRdW90YSBleGhhdXN0ZWQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3F1b3RhIGV4aGF1c3RlZCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG93cyBleGhhdXN0ZWQgbm90aWZpY2F0aW9uIGF0IHN0YXJ0dXAgd2hlbiBwcmVtaXVtQ2hhdCBpcyBhdCAwJScsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKHtcblx0XHRcdFx0cXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoMCkgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKT8ubWVzc2FnZSwgJ0NyZWRpdCBMaW1pdCBSZWFjaGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG93cyBleGhhdXN0ZWQgbm90aWZpY2F0aW9uIGZvciBmcmVlIHVzZXIgdmlhIGNoYXQgc25hcHNob3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IG5vdGlmaWNhdGlvbk1vY2sgfSA9IGNyZWF0ZUNvbnRyaWJ1dGlvbih7XG5cdFx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuRnJlZSxcblx0XHRcdFx0cXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBjaGF0OiBtYWtlUXVvdGFTbmFwc2hvdCgwKSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5vayhub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpIS5tZXNzYWdlLCAnQ3JlZGl0IExpbWl0IFJlYWNoZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hpZGVzIGV4aGF1c3RlZCBub3RpZmljYXRpb24gd2hlbiBxdW90YSByZWNvdmVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZW50aXRsZW1lbnRNb2NrLCBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oe1xuXHRcdFx0XHRxdW90YXM6IHsgdXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUsIHByZW1pdW1DaGF0OiBtYWtlUXVvdGFTbmFwc2hvdCgwKSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5vayhub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpKTtcblxuXHRcdFx0dXBkYXRlUXVvdGFzKGVudGl0bGVtZW50TW9jaywgeyBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoNTApIH0pO1xuXG5cdFx0XHRhc3NlcnQub2sobm90aWZpY2F0aW9uTW9jay53YXNEZWxldGVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHNob3cgc3B1cmlvdXMgdGhyZXNob2xkIG5vdGlmaWNhdGlvbiBhZnRlciBleGhhdXN0aW9uIHJlY292ZXJ5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBlbnRpdGxlbWVudE1vY2ssIG5vdGlmaWNhdGlvbk1vY2sgfSA9IGNyZWF0ZUNvbnRyaWJ1dGlvbih7XG5cdFx0XHRcdHF1b3RhczogeyB1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSwgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDYwKSB9LCAvLyA0MCUgdXNlZCBiYXNlbGluZVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEV4aGF1c3QgcXVvdGFcblx0XHRcdHVwZGF0ZVF1b3RhcyhlbnRpdGxlbWVudE1vY2ssIHsgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDApIH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkhLm1lc3NhZ2UsICdDcmVkaXQgTGltaXQgUmVhY2hlZCcpO1xuXG5cdFx0XHRub3RpZmljYXRpb25Nb2NrLnJlc2V0KCk7XG5cblx0XHRcdC8vIFJlY292ZXIgdG8gNTUlIHVzZWQgXHUyMDE0IHNob3VsZCBOT1QgdHJpZ2dlciBcIkNyZWRpdHMgYXQgNTAlXCIgZnJvbSBzdGFsZSBiYXNlbGluZVxuXHRcdFx0dXBkYXRlUXVvdGFzKGVudGl0bGVtZW50TW9jaywgeyBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoNDUpIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBzaG93IGV4aGF1c3RlZCBmb3IgdW5saW1pdGVkIHF1b3RhIHdpdGggaGFzUXVvdGE9dHJ1ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKHtcblx0XHRcdFx0cXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoMCwgeyB1bmxpbWl0ZWQ6IHRydWUsIGhhc1F1b3RhOiB0cnVlIH0pIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG93cyBleGhhdXN0ZWQgZm9yIHVubGltaXRlZCBxdW90YSB3aXRoIGhhc1F1b3RhPWZhbHNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oe1xuXHRcdFx0XHRxdW90YXM6IHsgdXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUsIHByZW1pdW1DaGF0OiBtYWtlUXVvdGFTbmFwc2hvdCgwLCB7IHVubGltaXRlZDogdHJ1ZSwgaGFzUXVvdGE6IGZhbHNlIH0pIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkhLm1lc3NhZ2UsICdDcmVkaXQgTGltaXQgUmVhY2hlZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gRXhoYXVzdGVkIGRpc21pc3NhbCBwZXJzaXN0ZW5jZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnZXhoYXVzdGVkIGRpc21pc3NhbCBwZXJzaXN0ZW5jZScsICgpID0+IHtcblx0XHR0ZXN0KCdkb2VzIG5vdCByZS1zaG93IGV4aGF1c3RlZCBub3RpZmljYXRpb24gYWZ0ZXIgcmVsb2FkIHdoZW4gcHJldmlvdXNseSBkaXNtaXNzZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdFx0Ly8gRmlyc3Qgd2luZG93OiBleGhhdXN0ZWQgbm90aWZpY2F0aW9uIHNob3duLCB0aGVuIGRpc21pc3NlZCBieSB0aGUgdXNlci5cblx0XHRcdGNvbnN0IGZpcnN0ID0gY3JlYXRlQ29udHJpYnV0aW9uKFxuXHRcdFx0XHR7IHF1b3RhczogeyB1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSwgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDApIH0gfSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb24gPSBmaXJzdC5ub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpO1xuXHRcdFx0YXNzZXJ0Lm9rKG5vdGlmaWNhdGlvbik7XG5cdFx0XHRmaXJzdC5ub3RpZmljYXRpb25Nb2NrLmRpc21pc3Mobm90aWZpY2F0aW9uIS5pZCk7XG5cdFx0XHRmaXJzdC5jb250cmlidXRpb24uZGlzcG9zZSgpO1xuXG5cdFx0XHQvLyBSZWxvYWQ6IG5ldyBjb250cmlidXRpb24gd2l0aCB0aGUgc2FtZSAocGVyc2lzdGVkKSBzdG9yYWdlIGFuZCBzdGlsbC1leGhhdXN0ZWQgcXVvdGEuXG5cdFx0XHRjb25zdCBzZWNvbmQgPSBjcmVhdGVDb250cmlidXRpb24oXG5cdFx0XHRcdHsgcXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoMCkgfSB9LFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQubm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlLXNob3dzIGV4aGF1c3RlZCBub3RpZmljYXRpb24gYWZ0ZXIgcXVvdGEgcmVjb3ZlcnMgYW5kIGlzIGV4aGF1c3RlZCBhZ2FpbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0XHQvLyBFeGhhdXN0ZWQgYW5kIGRpc21pc3NlZC5cblx0XHRcdGNvbnN0IGZpcnN0ID0gY3JlYXRlQ29udHJpYnV0aW9uKFxuXHRcdFx0XHR7IHF1b3RhczogeyB1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSwgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDApIH0gfSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdCk7XG5cdFx0XHRmaXJzdC5ub3RpZmljYXRpb25Nb2NrLmRpc21pc3MoZmlyc3Qubm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSEuaWQpO1xuXG5cdFx0XHQvLyBRdW90YSByZWNvdmVycyBcdTIwMTQgcGVyc2lzdGVkIGRpc21pc3NhbCBpcyBjbGVhcmVkLlxuXHRcdFx0dXBkYXRlUXVvdGFzKGZpcnN0LmVudGl0bGVtZW50TW9jaywgeyBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoNTApIH0pO1xuXHRcdFx0Zmlyc3QuY29udHJpYnV0aW9uLmRpc3Bvc2UoKTtcblxuXHRcdFx0Ly8gUmVsb2FkIHdoaWxlIGV4aGF1c3RlZCBhZ2FpbiBcdTIwMTQgbm90aWZpY2F0aW9uIHNob3dzIGJlY2F1c2UgdGhlIGZsYWcgd2FzIGNsZWFyZWQuXG5cdFx0XHRjb25zdCBzZWNvbmQgPSBjcmVhdGVDb250cmlidXRpb24oXG5cdFx0XHRcdHsgcXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoMCkgfSB9LFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhzZWNvbmQubm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLm5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkhLm1lc3NhZ2UsICdDcmVkaXQgTGltaXQgUmVhY2hlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2VlcHMgZGlzbWlzc2FsIGFjcm9zcyByZWxvYWQgd2hlbiBxdW90YSBkYXRhIGlzIG5vdCBsb2FkZWQgeWV0IGF0IHN0YXJ0dXAnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdFx0Ly8gRmlyc3Qgd2luZG93OiBleGhhdXN0ZWQgbm90aWZpY2F0aW9uIHNob3duLCB0aGVuIGRpc21pc3NlZCBieSB0aGUgdXNlci5cblx0XHRcdGNvbnN0IGZpcnN0ID0gY3JlYXRlQ29udHJpYnV0aW9uKFxuXHRcdFx0XHR7IHF1b3RhczogeyB1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSwgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDApIH0gfSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdCk7XG5cdFx0XHRmaXJzdC5ub3RpZmljYXRpb25Nb2NrLmRpc21pc3MoZmlyc3Qubm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSEuaWQpO1xuXHRcdFx0Zmlyc3QuY29udHJpYnV0aW9uLmRpc3Bvc2UoKTtcblxuXHRcdFx0Ly8gUmVsb2FkOiBxdW90YSBzbmFwc2hvdHMgaGF2ZSBub3QgYmVlbiBmZXRjaGVkIHlldCAobm8gcmVsZXZhbnQgc25hcHNob3QpLFxuXHRcdFx0Ly8gc28gdGhlIGRpc21pc3NhbCBtdXN0IE5PVCBiZSBjbGVhcmVkIGJ5IHRoZSB0cmFuc2llbnQgXCJubyBkYXRhXCIgc3RhdGUuXG5cdFx0XHRjb25zdCBzZWNvbmQgPSBjcmVhdGVDb250cmlidXRpb24oXG5cdFx0XHRcdHsgcXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBwcmVtaXVtQ2hhdDogdW5kZWZpbmVkIH0gfSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLm5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCksIHVuZGVmaW5lZCk7XG5cblx0XHRcdC8vIFF1b3RhIGRhdGEgYXJyaXZlcyBzaG93aW5nIGl0IGlzIHN0aWxsIGV4aGF1c3RlZCBcdTIwMTQgYmFubmVyIHN0YXlzIHN1cHByZXNzZWQuXG5cdFx0XHR1cGRhdGVRdW90YXMoc2Vjb25kLmVudGl0bGVtZW50TW9jaywgeyBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoMCkgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLm5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBFeGhhdXN0ZWQgbm90aWZpY2F0aW9uIGRlc2NyaXB0aW9ucyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdleGhhdXN0ZWQgbm90aWZpY2F0aW9uIGRlc2NyaXB0aW9ucycsICgpID0+IHtcblx0XHR0ZXN0KCdhbm9ueW1vdXMgdXNlciBnZXRzIHNpZ24taW4gYWN0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oe1xuXHRcdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlVua25vd24sXG5cdFx0XHRcdHF1b3RhczogeyB1c2FnZUJhc2VkQmlsbGluZzogZmFsc2UsIHByZW1pdW1DaGF0OiBtYWtlUXVvdGFTbmFwc2hvdCgwKSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5vayhub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpIS5kZXNjcmlwdGlvbiwgJ1NpZ24gaW4gdG8ga2VlcCBnb2luZy4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpIS5hY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q29tbWFuZEFjdGlvbihub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpISkuY29tbWFuZElkLCAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRyaWdnZXJTZXR1cCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZnJlZSB1c2VyIGdldHMgdXBncmFkZSBhY3Rpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IG5vdGlmaWNhdGlvbk1vY2sgfSA9IGNyZWF0ZUNvbnRyaWJ1dGlvbih7XG5cdFx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuRnJlZSxcblx0XHRcdFx0cXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBjaGF0OiBtYWtlUXVvdGFTbmFwc2hvdCgwKSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5vayhub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpIS5kZXNjcmlwdGlvbiwgJ1VwZ3JhZGUgdG8ga2VlcCBnb2luZy4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDb21tYW5kQWN0aW9uKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkhKS5jb21tYW5kSWQsICd3b3JrYmVuY2guYWN0aW9uLmNoYXQudXBncmFkZVBsYW4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hbmFnZWQgcGxhbiB1c2VyIGdldHMgYWRtaW4gbWVzc2FnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKHtcblx0XHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5CdXNpbmVzcyxcblx0XHRcdFx0cXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoMCkgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQub2sobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSEuZGVzY3JpcHRpb24sICdDb250YWN0IHlvdXIgYWRtaW4gdG8gaW5jcmVhc2UgeW91ciBsaW1pdHMuJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSEuYWN0aW9ucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFuYWdlZCBwbGFuIHVzZXIgd2l0aCBoYXNRdW90YT1mYWxzZSBnZXRzIGJ1ZGdldCBleGNlZWRlZCBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oe1xuXHRcdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LkJ1c2luZXNzLFxuXHRcdFx0XHRxdW90YXM6IHsgdXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUsIHByZW1pdW1DaGF0OiBtYWtlUXVvdGFTbmFwc2hvdCgwLCB7IHVubGltaXRlZDogdHJ1ZSwgaGFzUXVvdGE6IGZhbHNlIH0pIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkhLm1lc3NhZ2UsICdVc2FnZSBCbG9ja2VkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSEuZGVzY3JpcHRpb24sICdZb3VyIG9yZ2FuaXphdGlvbiBvciBlbnRlcnByaXNlIGhhcyBleGNlZWRlZCBpdHMgQ29waWxvdCBidWRnZXQuIENvbnRhY3QgeW91ciBhZG1pbiB0byByZXN1bWUgdXNhZ2UuJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSEuYWN0aW9ucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFuYWdlZCBwbGFuIHVzZXIgd2l0aCBoYXNRdW90YT1mYWxzZSBhbmQgb3ZlcmFnZXMgZW5hYmxlZCBzdGlsbCBnZXRzIGJ1ZGdldCBleGNlZWRlZCBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oe1xuXHRcdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LkVudGVycHJpc2UsXG5cdFx0XHRcdHF1b3RhczogeyB1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSwgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDAsIHsgdW5saW1pdGVkOiB0cnVlLCBoYXNRdW90YTogZmFsc2UgfSksIGFkZGl0aW9uYWxVc2FnZUVuYWJsZWQ6IHRydWUgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQub2sobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSEubWVzc2FnZSwgJ1VzYWdlIEJsb2NrZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpIS5kZXNjcmlwdGlvbiwgJ1lvdXIgb3JnYW5pemF0aW9uIG9yIGVudGVycHJpc2UgaGFzIGV4Y2VlZGVkIGl0cyBDb3BpbG90IGJ1ZGdldC4gQ29udGFjdCB5b3VyIGFkbWluIHRvIHJlc3VtZSB1c2FnZS4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpIS5hY3Rpb25zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYWlkIHVzZXIgd2l0aCBvdmVyYWdlIGdldHMgaW5jcmVhc2UgYnVkZ2V0IGFjdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKHtcblx0XHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Qcm8sXG5cdFx0XHRcdHF1b3RhczogeyB1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSwgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDApLCBhZGRpdGlvbmFsVXNhZ2VDb3VudDogNSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5vayhub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpIS5kZXNjcmlwdGlvbiwgJ0luY3JlYXNlIHlvdXIgYnVkZ2V0IHRvIGtlZXAgYnVpbGRpbmcuJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q29tbWFuZEFjdGlvbihub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpISkuY29tbWFuZElkLCAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm1hbmFnZUFkZGl0aW9uYWxTcGVuZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFpZCB1c2VyIHdpdGhvdXQgb3ZlcmFnZSBnZXRzIG1hbmFnZSBidWRnZXQgYWN0aW9uIGV2ZW4gaW4gc3dpdGNoLXRvLUF1dG8gdHJlYXRtZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBhc3NpZ25tZW50TW9jaywgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Qcm8sXG5cdFx0XHRcdFx0cXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoMCkgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0eyBzd2l0Y2hUb0F1dG9UcmVhdG1lbnQ6IHRydWUgfSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5vayhub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpIS5kZXNjcmlwdGlvbiwgJ01hbmFnZSB5b3VyIGJ1ZGdldCB0byBrZWVwIGJ1aWxkaW5nLicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENvbW1hbmRBY3Rpb24obm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSEpLmNvbW1hbmRJZCwgJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5tYW5hZ2VBZGRpdGlvbmFsU3BlbmQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXNzaWdubWVudE1vY2suZ2V0VHJlYXRtZW50Q2FsbHMsIFtdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIFF1b3RhIGFwcHJvYWNoaW5nIHRocmVzaG9sZCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3F1b3RhIGFwcHJvYWNoaW5nIHRocmVzaG9sZCcsICgpID0+IHtcblx0XHR0ZXN0KCdmaXJzdCBkYXRhIGFycml2YWwgc3RvcmVzIGJhc2VsaW5lIHdpdGhvdXQgbm90aWZpY2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oe1xuXHRcdFx0XHRxdW90YXM6IHsgdXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUsIHByZW1pdW1DaGF0OiBtYWtlUXVvdGFTbmFwc2hvdCgyNSkgfSwgLy8gNzUlIHVzZWRcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBmbHVzaFByb21pc2VzKCk7XG5cblx0XHRcdC8vIEZpcnN0IGRhdGEgYXJyaXZhbCBzdG9yZXMgNzUlIGFzIHRoZSBiYXNlbGluZSB3aXRob3V0IG5vdGlmeWluZy5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm90aWZpZXMgd2hlbiBjcm9zc2luZyA1MCUgdGhyZXNob2xkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBlbnRpdGxlbWVudE1vY2ssIG5vdGlmaWNhdGlvbk1vY2sgfSA9IGNyZWF0ZUNvbnRyaWJ1dGlvbih7XG5cdFx0XHRcdHF1b3RhczogeyB1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSwgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDYwKSB9LCAvLyA0MCUgdXNlZCBiYXNlbGluZVxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGZsdXNoUHJvbWlzZXMoKTtcblx0XHRcdHVwZGF0ZVF1b3RhcyhlbnRpdGxlbWVudE1vY2ssIHsgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDUwKSB9KTsgLy8gNTAlIHVzZWRcblxuXHRcdFx0YXNzZXJ0Lm9rKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkhLm1lc3NhZ2UsICdDcmVkaXRzIGF0IDUwJScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJlYXRtZW50IHN1Z2dlc3RzIHN3aXRjaGluZyB0byBBdXRvIHdoZW4gYW5vdGhlciBtb2RlbCBpcyBzZWxlY3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgYXNzaWdubWVudE1vY2ssIGVudGl0bGVtZW50TW9jaywgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKFxuXHRcdFx0XHR7IHF1b3RhczogeyB1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSwgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDYwKSB9IH0sXG5cdFx0XHRcdHsgc3dpdGNoVG9BdXRvVHJlYXRtZW50OiB0cnVlIH0sXG5cdFx0XHQpO1xuXG5cdFx0XHR1cGRhdGVRdW90YXMoZW50aXRsZW1lbnRNb2NrLCB7IHByZW1pdW1DaGF0OiBtYWtlUXVvdGFTbmFwc2hvdCg1MCkgfSk7XG5cdFx0XHRhd2FpdCBmbHVzaFByb21pc2VzKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0cmVhdG1lbnRzOiBhc3NpZ25tZW50TW9jay5nZXRUcmVhdG1lbnRDYWxscyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCk/LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRhY3Rpb25zOiBub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpPy5hY3Rpb25zLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0cmVhdG1lbnRzOiBbU1dJVENIX1RPX0FVVE9fVFJFQVRNRU5UX05BTUVdLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1N3aXRjaCB0byBBdXRvIHRvIHJlZHVjZSBjcmVkaXQgdXNhZ2UuJyxcblx0XHRcdFx0YWN0aW9uczogW3tcblx0XHRcdFx0XHRraW5kOiBDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25LaW5kLlN3aXRjaFRvTW9kZWwsXG5cdFx0XHRcdFx0bGFiZWw6ICdTd2l0Y2ggdG8gQXV0bycsXG5cdFx0XHRcdFx0bW9kZWxJZGVudGlmaWVyOiAnY29waWxvdC9hdXRvJyxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGVucm9sbCBhbmQgc3VnZ2VzdHMgbWFuYWdpbmcgYnVkZ2V0IHdoZW4gQXV0byBpcyBhbHJlYWR5IHNlbGVjdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBhc3NpZ25tZW50TW9jaywgZW50aXRsZW1lbnRNb2NrLCBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oXG5cdFx0XHRcdHsgcXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoNjApIH0gfSxcblx0XHRcdFx0eyBzZWxlY3RlZE1vZGVsSWQ6ICdjb3BpbG90L2F1dG8nLCBzd2l0Y2hUb0F1dG9UcmVhdG1lbnQ6IHRydWUgfSxcblx0XHRcdCk7XG5cblx0XHRcdHVwZGF0ZVF1b3RhcyhlbnRpdGxlbWVudE1vY2ssIHsgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDUwKSB9KTtcblx0XHRcdGF3YWl0IGZsdXNoUHJvbWlzZXMoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCk/LmRlc2NyaXB0aW9uLCAnU2V0IGFkZGl0aW9uYWwgYnVkZ2V0IHRvIGNvdmVyIGV4dHJhIHVzYWdlLicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENvbW1hbmRBY3Rpb24obm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSEpLmNvbW1hbmRJZCwgJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5tYW5hZ2VBZGRpdGlvbmFsU3BlbmQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXNzaWdubWVudE1vY2suZ2V0VHJlYXRtZW50Q2FsbHMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlY29nbml6ZXMgdGhlIGxpdmUgc2hvcnQgQXV0byBtb2RlbCBpZCBiZWZvcmUgcGVyc2lzdGVkIHNlbGVjdGlvbiB1cGRhdGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBhc3NpZ25tZW50TW9jaywgZW50aXRsZW1lbnRNb2NrLCBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oXG5cdFx0XHRcdHsgcXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoNjApIH0gfSxcblx0XHRcdFx0eyBjb250ZXh0TW9kZWxJZDogJ2F1dG8nLCBzZWxlY3RlZE1vZGVsSWQ6ICdjb3BpbG90L3Rlc3QtbW9kZWwnLCBzd2l0Y2hUb0F1dG9UcmVhdG1lbnQ6IHRydWUgfSxcblx0XHRcdCk7XG5cblx0XHRcdHVwZGF0ZVF1b3RhcyhlbnRpdGxlbWVudE1vY2ssIHsgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDUwKSB9KTtcblx0XHRcdGF3YWl0IGZsdXNoUHJvbWlzZXMoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCk/LmRlc2NyaXB0aW9uLCAnU2V0IGFkZGl0aW9uYWwgYnVkZ2V0IHRvIGNvdmVyIGV4dHJhIHVzYWdlLicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENvbW1hbmRBY3Rpb24obm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSEpLmNvbW1hbmRJZCwgJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5tYW5hZ2VBZGRpdGlvbmFsU3BlbmQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXNzaWdubWVudE1vY2suZ2V0VHJlYXRtZW50Q2FsbHMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbnRyb2wgc3VnZ2VzdHMgbWFuYWdpbmcgYnVkZ2V0IHdoZW4gYW5vdGhlciBtb2RlbCBpcyBzZWxlY3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZW50aXRsZW1lbnRNb2NrLCBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oXG5cdFx0XHRcdHsgcXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoNjApIH0gfSxcblx0XHRcdFx0eyBzd2l0Y2hUb0F1dG9UcmVhdG1lbnQ6IGZhbHNlIH0sXG5cdFx0XHQpO1xuXG5cdFx0XHR1cGRhdGVRdW90YXMoZW50aXRsZW1lbnRNb2NrLCB7IHByZW1pdW1DaGF0OiBtYWtlUXVvdGFTbmFwc2hvdCg1MCkgfSk7XG5cdFx0XHRhd2FpdCBmbHVzaFByb21pc2VzKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpPy5kZXNjcmlwdGlvbiwgJ1NldCBhZGRpdGlvbmFsIGJ1ZGdldCB0byBjb3ZlciBleHRyYSB1c2FnZS4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDb21tYW5kQWN0aW9uKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkhKS5jb21tYW5kSWQsICd3b3JrYmVuY2guYWN0aW9uLmNoYXQubWFuYWdlQWRkaXRpb25hbFNwZW5kJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCByZS1zaG93IHRoZSBzYW1lIHRocmVzaG9sZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZW50aXRsZW1lbnRNb2NrLCBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oe1xuXHRcdFx0XHRxdW90YXM6IHsgdXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUsIHByZW1pdW1DaGF0OiBtYWtlUXVvdGFTbmFwc2hvdCg2MCkgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBmbHVzaFByb21pc2VzKCk7XG5cdFx0XHR1cGRhdGVRdW90YXMoZW50aXRsZW1lbnRNb2NrLCB7IHByZW1pdW1DaGF0OiBtYWtlUXVvdGFTbmFwc2hvdCg1MCkgfSk7XG5cdFx0XHRhc3NlcnQub2sobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSk7XG5cblx0XHRcdG5vdGlmaWNhdGlvbk1vY2sucmVzZXQoKTtcblxuXHRcdFx0Ly8gRmlyZSBhZ2FpbiBhdCB0aGUgc2FtZSBsZXZlbFxuXHRcdFx0ZW50aXRsZW1lbnRNb2NrLm9uRGlkQ2hhbmdlUXVvdGFSZW1haW5pbmcuZmlyZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG93cyBoaWdoZXIgdGhyZXNob2xkIHdoZW4gdXNhZ2UgaW5jcmVhc2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBlbnRpdGxlbWVudE1vY2ssIG5vdGlmaWNhdGlvbk1vY2sgfSA9IGNyZWF0ZUNvbnRyaWJ1dGlvbih7XG5cdFx0XHRcdHF1b3RhczogeyB1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSwgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDYwKSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGZsdXNoUHJvbWlzZXMoKTtcblx0XHRcdHVwZGF0ZVF1b3RhcyhlbnRpdGxlbWVudE1vY2ssIHsgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDUwKSB9KTsgLy8gNTAlXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSEubWVzc2FnZSwgJ0NyZWRpdHMgYXQgNTAlJyk7XG5cblx0XHRcdHVwZGF0ZVF1b3RhcyhlbnRpdGxlbWVudE1vY2ssIHsgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDEwKSB9KTsgLy8gOTAlXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSEubWVzc2FnZSwgJ0NyZWRpdHMgYXQgOTAlJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBQUlUgdXNlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdQUlUgdXNlcnMgZG8gbm90IHNlZSBxdW90YSBub3RpZmljYXRpb25zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2RvZXMgbm90IHNob3cgZXhoYXVzdGVkIG5vdGlmaWNhdGlvbiBmb3IgUFJVIHVzZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IG5vdGlmaWNhdGlvbk1vY2sgfSA9IGNyZWF0ZUNvbnRyaWJ1dGlvbih7XG5cdFx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuUHJvLFxuXHRcdFx0XHRxdW90YXM6IHsgdXNhZ2VCYXNlZEJpbGxpbmc6IGZhbHNlLCBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoMCkgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHNob3cgYXBwcm9hY2hpbmcgbm90aWZpY2F0aW9uIGZvciBQUlUgdXNlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZW50aXRsZW1lbnRNb2NrLCBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oe1xuXHRcdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlBybyxcblx0XHRcdFx0cXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiBmYWxzZSwgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDYwKSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGZsdXNoUHJvbWlzZXMoKTtcblx0XHRcdHVwZGF0ZVF1b3RhcyhlbnRpdGxlbWVudE1vY2ssIHsgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDUpIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBPdmVyYWdlIGFjdGl2YXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdvdmVyYWdlIGFjdGl2YXRpb24gbm90aWZpY2F0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3dzIG92ZXJhZ2Ugbm90aWZpY2F0aW9uIG9uIGxpdmUgdHJhbnNpdGlvbiB0byAxMDAlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBlbnRpdGxlbWVudE1vY2ssIG5vdGlmaWNhdGlvbk1vY2sgfSA9IGNyZWF0ZUNvbnRyaWJ1dGlvbih7XG5cdFx0XHRcdHF1b3RhczogeyB1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSwgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDEwKSwgYWRkaXRpb25hbFVzYWdlRW5hYmxlZDogdHJ1ZSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRyYW5zaXRpb24gdG8gMTAwJVxuXHRcdFx0dXBkYXRlUXVvdGFzKGVudGl0bGVtZW50TW9jaywgeyBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoMCksIGFkZGl0aW9uYWxVc2FnZUVuYWJsZWQ6IHRydWUgfSk7XG5cblx0XHRcdGFzc2VydC5vayhub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpIS5tZXNzYWdlLCAnQ3JlZGl0IExpbWl0IFJlYWNoZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpIS5kZXNjcmlwdGlvbiwgJ0FkZGl0aW9uYWwgYnVkZ2V0IGlzIG5vdyBjb3ZlcmluZyBleHRyYSB1c2FnZS4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHNob3cgb3ZlcmFnZSBub3RpZmljYXRpb24gYXQgc3RhcnR1cCB3aGVuIGFscmVhZHkgYXQgMTAwJScsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKHtcblx0XHRcdFx0cXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoMCksIGFkZGl0aW9uYWxVc2FnZUVuYWJsZWQ6IHRydWUgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBBdCBzdGFydHVwIHdpdGggb3ZlcmFnZXMgZW5hYmxlZCBhbmQgYWxyZWFkeSBhdCAwJSwgbm8gbm90aWZpY2F0aW9uXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3dzIHN0YW5kYXJkIGV4aGF1c3RlZCBvbiBzdGFydHVwIGF0IDEwMCUgd2l0aG91dCBvdmVyYWdlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKHtcblx0XHRcdFx0cXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoMCksIGFkZGl0aW9uYWxVc2FnZUVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkhLm1lc3NhZ2UsICdDcmVkaXQgTGltaXQgUmVhY2hlZCcpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkhLmRlc2NyaXB0aW9uLCAnQWRkaXRpb25hbCBidWRnZXQgaXMgbm93IGNvdmVyaW5nIGV4dHJhIHVzYWdlLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3Mgb3ZlcmFnZSBub3RpZmljYXRpb24gd2hlbiBvdmVyYWdlcyBhcmUgZW5hYmxlZCB3aGlsZSBhbHJlYWR5IGF0IDEwMCUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGVudGl0bGVtZW50TW9jaywgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKHtcblx0XHRcdFx0cXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoMCksIGFkZGl0aW9uYWxVc2FnZUVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkpO1xuXG5cdFx0XHQvLyBFbmFibGUgb3ZlcmFnZXMgd2hpbGUgc3RpbGwgYXQgMCVcblx0XHRcdHVwZGF0ZVF1b3RhcyhlbnRpdGxlbWVudE1vY2ssIHsgYWRkaXRpb25hbFVzYWdlRW5hYmxlZDogdHJ1ZSwgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDApIH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSEuZGVzY3JpcHRpb24sICdBZGRpdGlvbmFsIGJ1ZGdldCBpcyBub3cgY292ZXJpbmcgZXh0cmEgdXNhZ2UuJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBRdW90YSB0cmFqZWN0b3J5IHdhcm5pbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgncXVvdGEgdHJhamVjdG9yeSB3YXJuaW5nJywgKCkgPT4ge1xuXHRcdGxldCBjbG9jazogc2lub24uU2lub25GYWtlVGltZXJzO1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0Y2xvY2sgPSBzaW5vbi51c2VGYWtlVGltZXJzKHtcblx0XHRcdFx0bm93OiBuZXcgRGF0ZSgnMjAyNi0wNi0yNVQwMDowMDowMFonKSxcblx0XHRcdFx0dG9GYWtlOiBbJ0RhdGUnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3Qgc2hvdyB3aGVuIGV4cGVyaW1lbnQgdHJlYXRtZW50IGlzIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oe1xuXHRcdFx0XHRxdW90YXM6IHtcblx0XHRcdFx0XHRyZXNldERhdGU6IG1ha2VSZXNldERhdGUoMjQpLFxuXHRcdFx0XHRcdHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLFxuXHRcdFx0XHRcdHByZW1pdW1DaGF0OiBtYWtlUXVvdGFTbmFwc2hvdCg3MiksXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgZmx1c2hQcm9taXNlcygpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHNob3cgd2hlbiB1c2VyIGlzIGVsaWdpYmxlIGJ1dCBub3QgYXNzaWduZWQgdG8gdGhlIGV4cGVyaW1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBObyB0cmVhdG1lbnQgY29uZmlndXJlZDogZ2V0VHJlYXRtZW50IHJlc29sdmVzIHRvIHVuZGVmaW5lZCwgaS5lLlxuXHRcdFx0Ly8gdGhlIHVzZXIgaXMgbm90IGluIHRoZSBmbGlnaHQuIFRoaXMgbXVzdCBub3QgYmUgdHJlYXRlZCBhcyBjb250cm9sXG5cdFx0XHQvLyBlbnJvbGxtZW50LCBidXQgaXQgc2hvdWxkIHN0aWxsIGF0dGVtcHQgZXhwb3N1cmUgc2luY2UgdGhlIHVzZXIgbWV0XG5cdFx0XHQvLyBldmVyeSByZW5kZXIgY29uZGl0aW9uLlxuXHRcdFx0Y29uc3QgeyBhc3NpZ25tZW50TW9jaywgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKHtcblx0XHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Qcm8sXG5cdFx0XHRcdHF1b3Rhczoge1xuXHRcdFx0XHRcdHJlc2V0RGF0ZTogbWFrZVJlc2V0RGF0ZSgyNCksXG5cdFx0XHRcdFx0dXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUsXG5cdFx0XHRcdFx0cHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDcyKSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBmbHVzaFByb21pc2VzKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0cmVhdG1lbnRzOiBhc3NpZ25tZW50TW9jay5nZXRUcmVhdG1lbnRDYWxscyxcblx0XHRcdFx0bm90aWZpY2F0aW9uOiBub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0cmVhdG1lbnRzOiBbVFJBSkVDVE9SWV9OVURHRV9UUkVBVE1FTlRfTkFNRV0sXG5cdFx0XHRcdG5vdGlmaWNhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBzaG93IG91dHNpZGUgbW9udGhseSB1c2FnZSB3aW5kb3cnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHRzID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHBlcmNlbnRSZW1haW5pbmcgb2YgWzkxLCA2NF0pIHtcblx0XHRcdFx0Y29uc3QgeyBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oe1xuXHRcdFx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuUHJvLFxuXHRcdFx0XHRcdHF1b3Rhczoge1xuXHRcdFx0XHRcdFx0cmVzZXREYXRlOiBtYWtlUmVzZXREYXRlKDI0KSxcblx0XHRcdFx0XHRcdHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLFxuXHRcdFx0XHRcdFx0cHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KHBlcmNlbnRSZW1haW5pbmcpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sIHsgdHJhamVjdG9yeVRyZWF0bWVudDogdHJ1ZSB9KTtcblxuXHRcdFx0XHRhd2FpdCBmbHVzaFByb21pc2VzKCk7XG5cblx0XHRcdFx0cmVzdWx0cy5wdXNoKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCk/Lm1lc3NhZ2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdHMsIFt1bmRlZmluZWQsIHVuZGVmaW5lZF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3MgaW5mbyBub3RpZmljYXRpb24gd2hlbiBwcm9qZWN0ZWQgZGFpbHkgdXNhZ2UgaXMgYWJvdmUgdGhyZXNob2xkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oe1xuXHRcdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlBybyxcblx0XHRcdFx0cXVvdGFzOiB7XG5cdFx0XHRcdFx0cmVzZXREYXRlOiBtYWtlUmVzZXREYXRlKDI0KSxcblx0XHRcdFx0XHR1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSxcblx0XHRcdFx0XHRwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoNzIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgeyB0cmFqZWN0b3J5VHJlYXRtZW50OiB0cnVlIH0pO1xuXG5cdFx0XHRhd2FpdCBmbHVzaFByb21pc2VzKCk7XG5cblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCk7XG5cdFx0XHRhc3NlcnQub2sobm90aWZpY2F0aW9uKTtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBub3RpZmljYXRpb24ubWVzc2FnZTtcblx0XHRcdGNvbnN0IGxlYXJuTW9yZUxpbmsgPSBjcmVhdGVNYXJrZG93bkNvbW1hbmRMaW5rKHtcblx0XHRcdFx0dGV4dDogJ0xlYXJuIGFib3V0IG9wdGltaXppbmcgdXNhZ2UnLFxuXHRcdFx0XHRpZDogQ1JFRElUX0VGRklDSUVOQ1lfTEVBUk5fTU9SRV9DT01NQU5EX0lELFxuXHRcdFx0XHR0b29sdGlwOiAnTGVhcm4gYWJvdXQgb3B0aW1pemluZyB1c2FnZScsXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRtZXNzYWdlOiB0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycgPyBtZXNzYWdlIDogbWVzc2FnZS52YWx1ZSxcblx0XHRcdFx0c2V2ZXJpdHk6IG5vdGlmaWNhdGlvbi5zZXZlcml0eSxcblx0XHRcdFx0YWN0aW9uczogbm90aWZpY2F0aW9uLmFjdGlvbnMubGVuZ3RoLFxuXHRcdFx0XHRhdXRvRGlzbWlzc09uTWVzc2FnZTogbm90aWZpY2F0aW9uLmF1dG9EaXNtaXNzT25NZXNzYWdlLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRtZXNzYWdlOiBgWW91J3JlIGxpa2VseSB0byBleGhhdXN0IHlvdXIgQUkgY3JlZGl0cyBiZWZvcmUgeW91ciBiaWxsaW5nIHBlcmlvZC4gJHtsZWFybk1vcmVMaW5rfS5gLFxuXHRcdFx0XHRzZXZlcml0eTogQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0YWN0aW9uczogMCxcblx0XHRcdFx0YXV0b0Rpc21pc3NPbk1lc3NhZ2U6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBzaG93IHdoZW4gcHJvamVjdGVkIGRhaWx5IHVzYWdlIGlzIGJlbG93IHRocmVzaG9sZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKHtcblx0XHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Qcm8sXG5cdFx0XHRcdHF1b3Rhczoge1xuXHRcdFx0XHRcdHJlc2V0RGF0ZTogbWFrZVJlc2V0RGF0ZSgyNCksXG5cdFx0XHRcdFx0dXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUsXG5cdFx0XHRcdFx0cHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDc4KSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIHsgdHJhamVjdG9yeVRyZWF0bWVudDogdHJ1ZSB9KTtcblxuXHRcdFx0YXdhaXQgZmx1c2hQcm9taXNlcygpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHNob3cgd2hlbiByZXNldCBkYXRlIGltcGxpZXMgbm8gZWxhcHNlZCBiaWxsaW5nIGRheXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IG5vdGlmaWNhdGlvbk1vY2sgfSA9IGNyZWF0ZUNvbnRyaWJ1dGlvbih7XG5cdFx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuUHJvLFxuXHRcdFx0XHRxdW90YXM6IHtcblx0XHRcdFx0XHRyZXNldERhdGU6IG1ha2VSZXNldERhdGUoMzEpLFxuXHRcdFx0XHRcdHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLFxuXHRcdFx0XHRcdHByZW1pdW1DaGF0OiBtYWtlUXVvdGFTbmFwc2hvdCg3MiksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LCB7IHRyYWplY3RvcnlUcmVhdG1lbnQ6IHRydWUgfSk7XG5cblx0XHRcdGF3YWl0IGZsdXNoUHJvbWlzZXMoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb3VudHMgdGhlIGZpcnN0IGJpbGxpbmcgZGF5IGZvciAzMS1kYXkgYW5kIDI4LWRheSBjeWNsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHRzID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IFtub3csIHJlc2V0RGF0ZV0gb2YgW1xuXHRcdFx0XHRbJzIwMjYtMDEtMDFUMDA6MDA6MDBaJywgJzIwMjYtMDItMDFUMDA6MDA6MDBaJ10sXG5cdFx0XHRcdFsnMjAyNi0wMi0wMVQwMDowMDowMFonLCAnMjAyNi0wMy0wMVQwMDowMDowMFonXSxcblx0XHRcdF0pIHtcblx0XHRcdFx0Y2xvY2suc2V0U3lzdGVtVGltZShuZXcgRGF0ZShub3cpKTtcblx0XHRcdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IG5ldyBUZXN0VGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdFx0XHRjb25zdCB7IG5vdGlmaWNhdGlvbk1vY2sgfSA9IGNyZWF0ZUNvbnRyaWJ1dGlvbih7XG5cdFx0XHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Qcm8sXG5cdFx0XHRcdFx0cXVvdGFzOiB7XG5cdFx0XHRcdFx0XHRyZXNldERhdGUsXG5cdFx0XHRcdFx0XHR1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSxcblx0XHRcdFx0XHRcdHByZW1pdW1DaGF0OiBtYWtlUXVvdGFTbmFwc2hvdCg4OCksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSwgeyB0cmFqZWN0b3J5VHJlYXRtZW50OiB0cnVlLCB0ZWxlbWV0cnlTZXJ2aWNlIH0pO1xuXG5cdFx0XHRcdGF3YWl0IGZsdXNoUHJvbWlzZXMoKTtcblxuXHRcdFx0XHRyZXN1bHRzLnB1c2goe1xuXHRcdFx0XHRcdGV2ZW50czogdGVsZW1ldHJ5U2VydmljZS5ldmVudHMsXG5cdFx0XHRcdFx0bm90aWZpY2F0aW9uU2hvd246IG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkgIT09IHVuZGVmaW5lZCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0cywgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZXZlbnRzOiBbe1xuXHRcdFx0XHRcdFx0bmFtZTogJ2NoYXRRdW90YVRyYWplY3RvcnlOdWRnZUVucm9sbGVkJyxcblx0XHRcdFx0XHRcdGRhdGE6IHsgdHJlYXRtZW50OiB0cnVlLCBlbnRpdGxlbWVudDogJ1BybycsIGF2ZXJhZ2VEYWlseVVzYWdlOiAxMiwgcGVyY2VudFVzZWQ6IDEyIH0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0bm90aWZpY2F0aW9uU2hvd246IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRldmVudHM6IFt7XG5cdFx0XHRcdFx0XHRuYW1lOiAnY2hhdFF1b3RhVHJhamVjdG9yeU51ZGdlRW5yb2xsZWQnLFxuXHRcdFx0XHRcdFx0ZGF0YTogeyB0cmVhdG1lbnQ6IHRydWUsIGVudGl0bGVtZW50OiAnUHJvJywgYXZlcmFnZURhaWx5VXNhZ2U6IDEyLCBwZXJjZW50VXNlZDogMTIgfSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRub3RpZmljYXRpb25TaG93bjogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3MgdHJhamVjdG9yeSBudWRnZSBvbmx5IGFmdGVyIHRyZWF0bWVudCByZXNvbHZlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCByZXNvbHZlVHJlYXRtZW50OiAoKHZhbHVlOiBib29sZWFuIHwgdW5kZWZpbmVkKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHRyYWplY3RvcnlUcmVhdG1lbnQgPSBuZXcgUHJvbWlzZTxib29sZWFuIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0cmVzb2x2ZVRyZWF0bWVudCA9IHJlc29sdmU7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHsgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKHtcblx0XHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Qcm8sXG5cdFx0XHRcdHF1b3Rhczoge1xuXHRcdFx0XHRcdHJlc2V0RGF0ZTogbWFrZVJlc2V0RGF0ZSgyNCksXG5cdFx0XHRcdFx0dXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUsXG5cdFx0XHRcdFx0cHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDcyKSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIHsgdHJhamVjdG9yeVRyZWF0bWVudCB9KTtcblxuXHRcdFx0YXdhaXQgZmx1c2hQcm9taXNlcygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCksIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5vayhyZXNvbHZlVHJlYXRtZW50KTtcblx0XHRcdHJlc29sdmVUcmVhdG1lbnQodHJ1ZSk7XG5cdFx0XHRhd2FpdCBmbHVzaFByb21pc2VzKCk7XG5cblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCk7XG5cdFx0XHRhc3NlcnQub2sobm90aWZpY2F0aW9uKTtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBub3RpZmljYXRpb24ubWVzc2FnZTtcblx0XHRcdGFzc2VydC5vayh0eXBlb2YgbWVzc2FnZSAhPT0gJ3N0cmluZycgJiYgbWVzc2FnZS52YWx1ZS5pbmNsdWRlcygnZXhoYXVzdCB5b3VyIEFJIGNyZWRpdHMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsZWFybiBtb3JlIGNvbW1hbmQgbG9ncyBsaW5rLWNsaWNrZWQgdGVsZW1ldHJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IG5ldyBUZXN0VGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdFx0Y3JlYXRlQ29udHJpYnV0aW9uKHtcblx0XHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Qcm8sXG5cdFx0XHRcdHF1b3Rhczoge1xuXHRcdFx0XHRcdHJlc2V0RGF0ZTogbWFrZVJlc2V0RGF0ZSgyNCksXG5cdFx0XHRcdFx0dXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUsXG5cdFx0XHRcdFx0cHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDcyKSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIHsgdHJhamVjdG9yeVRyZWF0bWVudDogdHJ1ZSwgdGVsZW1ldHJ5U2VydmljZSB9KTtcblxuXHRcdFx0YXdhaXQgZmx1c2hQcm9taXNlcygpO1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChDUkVESVRfRUZGSUNJRU5DWV9MRUFSTl9NT1JFX0NPTU1BTkRfSUQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbW1hbmQpO1xuXHRcdFx0Y29tbWFuZC5oYW5kbGVyKHsgZ2V0OiAoKSA9PiAoeyBvcGVuOiBhc3luYyAoKSA9PiB0cnVlIH0pIH0gYXMgbmV2ZXIpO1xuXHRcdFx0YXdhaXQgZmx1c2hQcm9taXNlcygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeVNlcnZpY2UuZXZlbnRzLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRuYW1lOiAnY2hhdFF1b3RhVHJhamVjdG9yeU51ZGdlRW5yb2xsZWQnLFxuXHRcdFx0XHRcdGRhdGE6IHsgdHJlYXRtZW50OiB0cnVlLCBlbnRpdGxlbWVudDogJ1BybycsIGF2ZXJhZ2VEYWlseVVzYWdlOiA0LjY3LCBwZXJjZW50VXNlZDogMjggfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG5hbWU6ICdjaGF0UXVvdGFUcmFqZWN0b3J5TnVkZ2VMaW5rQ2xpY2tlZCcsXG5cdFx0XHRcdFx0ZGF0YTogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsb2dzIGVucm9sbG1lbnQgdGVsZW1ldHJ5IGZvciBjb250cm9sIGFzc2lnbm1lbnQgd2l0aG91dCBzaG93aW5nIG51ZGdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IG5ldyBUZXN0VGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgeyBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oe1xuXHRcdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlBybyxcblx0XHRcdFx0cXVvdGFzOiB7XG5cdFx0XHRcdFx0cmVzZXREYXRlOiBtYWtlUmVzZXREYXRlKDI0KSxcblx0XHRcdFx0XHR1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSxcblx0XHRcdFx0XHRwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoNzIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgeyB0cmFqZWN0b3J5VHJlYXRtZW50OiBmYWxzZSwgdGVsZW1ldHJ5U2VydmljZSB9KTtcblxuXHRcdFx0YXdhaXQgZmx1c2hQcm9taXNlcygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZXZlbnRzOiB0ZWxlbWV0cnlTZXJ2aWNlLmV2ZW50cyxcblx0XHRcdFx0bm90aWZpY2F0aW9uOiBub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRldmVudHM6IFt7XG5cdFx0XHRcdFx0bmFtZTogJ2NoYXRRdW90YVRyYWplY3RvcnlOdWRnZUVucm9sbGVkJyxcblx0XHRcdFx0XHRkYXRhOiB7IHRyZWF0bWVudDogZmFsc2UsIGVudGl0bGVtZW50OiAnUHJvJywgYXZlcmFnZURhaWx5VXNhZ2U6IDQuNjcsIHBlcmNlbnRVc2VkOiAyOCB9LFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0bm90aWZpY2F0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGxvZyBlbnJvbGxtZW50IHRlbGVtZXRyeSB3aGVuIG5vdCBhc3NpZ25lZCB0byBhIGZsaWdodCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBuZXcgVGVzdFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHsgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKHtcblx0XHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Qcm8sXG5cdFx0XHRcdHF1b3Rhczoge1xuXHRcdFx0XHRcdHJlc2V0RGF0ZTogbWFrZVJlc2V0RGF0ZSgyNCksXG5cdFx0XHRcdFx0dXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUsXG5cdFx0XHRcdFx0cHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDcyKSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIHsgdGVsZW1ldHJ5U2VydmljZSB9KTsgLy8gbm8gdHJlYXRtZW50IGNvbmZpZ3VyZWQgLT4gbm90IGFzc2lnbmVkIHRvIHRoZSBmbGlnaHRcblxuXHRcdFx0YXdhaXQgZmx1c2hQcm9taXNlcygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZXZlbnRzOiB0ZWxlbWV0cnlTZXJ2aWNlLmV2ZW50cyxcblx0XHRcdFx0bm90aWZpY2F0aW9uOiBub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRldmVudHM6IFtdLFxuXHRcdFx0XHRub3RpZmljYXRpb246IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtZW1iZXJzIHRyYWplY3RvcnkgZGlzcGxheSBmb3IgdGhlIHF1b3RhIHBlcmlvZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZW50aXRsZW1lbnRNb2NrLCBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oe1xuXHRcdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlByb1BsdXMsXG5cdFx0XHRcdHF1b3Rhczoge1xuXHRcdFx0XHRcdHJlc2V0RGF0ZTogbWFrZVJlc2V0RGF0ZSgyNCksXG5cdFx0XHRcdFx0dXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUsXG5cdFx0XHRcdFx0cHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDcyKSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIHsgdHJhamVjdG9yeVRyZWF0bWVudDogdHJ1ZSB9KTtcblxuXHRcdFx0YXdhaXQgZmx1c2hQcm9taXNlcygpO1xuXHRcdFx0YXNzZXJ0Lm9rKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkpO1xuXG5cdFx0XHRub3RpZmljYXRpb25Nb2NrLnJlc2V0KCk7XG5cdFx0XHRlbnRpdGxlbWVudE1vY2sub25EaWRDaGFuZ2VRdW90YVJlbWFpbmluZy5maXJlKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgZW5mb3JjZSBTS1UgZWxpZ2liaWxpdHkgb3V0c2lkZSBleHBlcmltZW50IGFzc2lnbm1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHRzOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IHt9O1xuXHRcdFx0Zm9yIChjb25zdCBlbnRpdGxlbWVudCBvZiBbQ2hhdEVudGl0bGVtZW50LlBybywgQ2hhdEVudGl0bGVtZW50LlByb1BsdXMsIENoYXRFbnRpdGxlbWVudC5NYXgsIENoYXRFbnRpdGxlbWVudC5FRFUsIENoYXRFbnRpdGxlbWVudC5CdXNpbmVzcywgQ2hhdEVudGl0bGVtZW50LkVudGVycHJpc2UsIENoYXRFbnRpdGxlbWVudC5GcmVlLCBDaGF0RW50aXRsZW1lbnQuVW5rbm93bl0pIHtcblx0XHRcdFx0Y29uc3QgeyBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oe1xuXHRcdFx0XHRcdGVudGl0bGVtZW50LFxuXHRcdFx0XHRcdHF1b3Rhczoge1xuXHRcdFx0XHRcdFx0cmVzZXREYXRlOiBtYWtlUmVzZXREYXRlKDI0KSxcblx0XHRcdFx0XHRcdHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLFxuXHRcdFx0XHRcdFx0cHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDcyKSxcblx0XHRcdFx0XHRcdGNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDcyKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LCB7IHRyYWplY3RvcnlUcmVhdG1lbnQ6IHRydWUgfSk7XG5cblx0XHRcdFx0YXdhaXQgZmx1c2hQcm9taXNlcygpO1xuXG5cdFx0XHRcdHJlc3VsdHNbQ2hhdEVudGl0bGVtZW50W2VudGl0bGVtZW50XV0gPSAhIW5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCk7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0cywge1xuXHRcdFx0XHRQcm86IHRydWUsXG5cdFx0XHRcdFByb1BsdXM6IHRydWUsXG5cdFx0XHRcdE1heDogdHJ1ZSxcblx0XHRcdFx0RURVOiB0cnVlLFxuXHRcdFx0XHRCdXNpbmVzczogdHJ1ZSxcblx0XHRcdFx0RW50ZXJwcmlzZTogdHJ1ZSxcblx0XHRcdFx0RnJlZTogdHJ1ZSxcblx0XHRcdFx0VW5rbm93bjogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gUmF0ZS1saW1pdCB3YXJuaW5ncyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgncmF0ZS1saW1pdCB3YXJuaW5ncycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG93cyBzZXNzaW9uIHJhdGUgbGltaXQgd2FybmluZyBvbiB0aHJlc2hvbGQgY3Jvc3NpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGVudGl0bGVtZW50TW9jaywgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKHtcblx0XHRcdFx0cXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBzZXNzaW9uUmF0ZUxpbWl0OiBtYWtlUmF0ZUxpbWl0U25hcHNob3QoNjApIH0sIC8vIGJhc2VsaW5lXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgZmx1c2hQcm9taXNlcygpO1xuXHRcdFx0dXBkYXRlUXVvdGFzKGVudGl0bGVtZW50TW9jaywgeyBzZXNzaW9uUmF0ZUxpbWl0OiBtYWtlUmF0ZUxpbWl0U25hcHNob3QoMjUpIH0pOyAvLyA3NSUgdXNlZFxuXG5cdFx0XHRhc3NlcnQub2sobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSk7XG5cdFx0XHRhc3NlcnQub2soKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkhLm1lc3NhZ2UgYXMgc3RyaW5nKS5pbmNsdWRlcygnNzUlJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpIS5tZXNzYWdlIGFzIHN0cmluZykuaW5jbHVkZXMoJ3Nlc3Npb24nKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG93cyB3ZWVrbHkgcmF0ZSBsaW1pdCB3YXJuaW5nIG9uIHRocmVzaG9sZCBjcm9zc2luZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZW50aXRsZW1lbnRNb2NrLCBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oe1xuXHRcdFx0XHRxdW90YXM6IHsgdXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUsIHdlZWtseVJhdGVMaW1pdDogbWFrZVJhdGVMaW1pdFNuYXBzaG90KDYwKSB9LCAvLyBiYXNlbGluZVxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGZsdXNoUHJvbWlzZXMoKTtcblx0XHRcdHVwZGF0ZVF1b3RhcyhlbnRpdGxlbWVudE1vY2ssIHsgd2Vla2x5UmF0ZUxpbWl0OiBtYWtlUmF0ZUxpbWl0U25hcHNob3QoMTApIH0pOyAvLyA5MCUgdXNlZFxuXG5cdFx0XHRhc3NlcnQub2sobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSk7XG5cdFx0XHRhc3NlcnQub2soKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkhLm1lc3NhZ2UgYXMgc3RyaW5nKS5pbmNsdWRlcygnOTAlJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpIS5tZXNzYWdlIGFzIHN0cmluZykuaW5jbHVkZXMoJ3dlZWtseScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpcnN0IHJhdGUgbGltaXQgZGF0YSBzdG9yZXMgYmFzZWxpbmUgd2l0aG91dCBub3RpZmljYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IG5vdGlmaWNhdGlvbk1vY2sgfSA9IGNyZWF0ZUNvbnRyaWJ1dGlvbih7XG5cdFx0XHRcdHF1b3RhczogeyB1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSwgc2Vzc2lvblJhdGVMaW1pdDogbWFrZVJhdGVMaW1pdFNuYXBzaG90KDEwKSB9LCAvLyA5MCUgdXNlZFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGZsdXNoUHJvbWlzZXMoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gUHJpb3JpdHkgb3JkZXJpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgncHJpb3JpdHkgb3JkZXJpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZXhoYXVzdGVkIHRha2VzIHByaW9yaXR5IG92ZXIgYXBwcm9hY2hpbmcgdGhyZXNob2xkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oe1xuXHRcdFx0XHRxdW90YXM6IHsgdXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUsIHByZW1pdW1DaGF0OiBtYWtlUXVvdGFTbmFwc2hvdCgwKSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5vayhub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpIS5tZXNzYWdlLCAnQ3JlZGl0IExpbWl0IFJlYWNoZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcHJvYWNoaW5nIHRocmVzaG9sZCB0YWtlcyBwcmlvcml0eSBvdmVyIHJhdGUgbGltaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGVudGl0bGVtZW50TW9jaywgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKHtcblx0XHRcdFx0cXVvdGFzOiB7XG5cdFx0XHRcdFx0dXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUsXG5cdFx0XHRcdFx0cHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDYwKSwgLy8gNDAlIFx1MjAxNCBiYXNlbGluZVxuXHRcdFx0XHRcdHNlc3Npb25SYXRlTGltaXQ6IG1ha2VSYXRlTGltaXRTbmFwc2hvdCg2MCksIC8vIDQwJSBcdTIwMTQgYmFzZWxpbmVcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBmbHVzaFByb21pc2VzKCk7XG5cdFx0XHR1cGRhdGVRdW90YXMoZW50aXRsZW1lbnRNb2NrLCB7XG5cdFx0XHRcdHByZW1pdW1DaGF0OiBtYWtlUXVvdGFTbmFwc2hvdCgxMCksIC8vIDkwJSBcdTIwMTQgY3Jvc3NlcyB0aHJlc2hvbGRcblx0XHRcdFx0c2Vzc2lvblJhdGVMaW1pdDogbWFrZVJhdGVMaW1pdFNuYXBzaG90KDI1KSwgLy8gNzUlIFx1MjAxNCBjcm9zc2VzIHRocmVzaG9sZFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5vayhub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpIS5tZXNzYWdlLCAnQ3JlZGl0cyBhdCA5MCUnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIEFwcHJvYWNoaW5nIG5vdGlmaWNhdGlvbiBkZXNjcmlwdGlvbnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2FwcHJvYWNoaW5nIG5vdGlmaWNhdGlvbiBkZXNjcmlwdGlvbnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZnJlZSB1c2VyIGdldHMgdXBncmFkZSBhY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGVudGl0bGVtZW50TW9jaywgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKHtcblx0XHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5GcmVlLFxuXHRcdFx0XHRxdW90YXM6IHsgdXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUsIGNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDYwKSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGZsdXNoUHJvbWlzZXMoKTtcblx0XHRcdHVwZGF0ZVF1b3RhcyhlbnRpdGxlbWVudE1vY2ssIHsgY2hhdDogbWFrZVF1b3RhU25hcHNob3QoNTApIH0pO1xuXG5cdFx0XHRhc3NlcnQub2sobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSEuZGVzY3JpcHRpb24sICdVcGdyYWRlIHRvIGNvbnRpbnVlIHBhc3QgdGhlIGxpbWl0LicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFuYWdlZCBwbGFuIHVzZXIgZ2V0cyBhZG1pbiBtZXNzYWdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBlbnRpdGxlbWVudE1vY2ssIG5vdGlmaWNhdGlvbk1vY2sgfSA9IGNyZWF0ZUNvbnRyaWJ1dGlvbih7XG5cdFx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuRW50ZXJwcmlzZSxcblx0XHRcdFx0cXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoNjApIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgZmx1c2hQcm9taXNlcygpO1xuXHRcdFx0dXBkYXRlUXVvdGFzKGVudGl0bGVtZW50TW9jaywgeyBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoNTApIH0pO1xuXG5cdFx0XHRhc3NlcnQub2sobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSEuZGVzY3JpcHRpb24sICdDb250YWN0IHlvdXIgYWRtaW4gdG8gaW5jcmVhc2UgeW91ciBsaW1pdHMuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYWlkIHVzZXIgd2l0aCBvdmVyYWdlcyBlbmFibGVkIGdldHMgYnVkZ2V0IG1lc3NhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGVudGl0bGVtZW50TW9jaywgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKHtcblx0XHRcdFx0cXVvdGFzOiB7IHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoNjApLCBhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiB0cnVlIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgZmx1c2hQcm9taXNlcygpO1xuXHRcdFx0dXBkYXRlUXVvdGFzKGVudGl0bGVtZW50TW9jaywgeyBwcmVtaXVtQ2hhdDogbWFrZVF1b3RhU25hcHNob3QoNTApIH0pO1xuXG5cdFx0XHRhc3NlcnQub2sobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSEuZGVzY3JpcHRpb24sICdBZGRpdGlvbmFsIGJ1ZGdldCBpcyBlbmFibGVkIHRvIGNvdmVyIGV4dHJhIHVzYWdlLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFpZCB1c2VyIHdpdGhvdXQgb3ZlcmFnZXMgZ2V0cyBzZXQgYnVkZ2V0IGFjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZW50aXRsZW1lbnRNb2NrLCBub3RpZmljYXRpb25Nb2NrIH0gPSBjcmVhdGVDb250cmlidXRpb24oe1xuXHRcdFx0XHRxdW90YXM6IHsgdXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUsIHByZW1pdW1DaGF0OiBtYWtlUXVvdGFTbmFwc2hvdCg2MCkgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBmbHVzaFByb21pc2VzKCk7XG5cdFx0XHR1cGRhdGVRdW90YXMoZW50aXRsZW1lbnRNb2NrLCB7IHByZW1pdW1DaGF0OiBtYWtlUXVvdGFTbmFwc2hvdCg1MCkgfSk7XG5cblx0XHRcdGFzc2VydC5vayhub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpIS5kZXNjcmlwdGlvbiwgJ1NldCBhZGRpdGlvbmFsIGJ1ZGdldCB0byBjb3ZlciBleHRyYSB1c2FnZS4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDb21tYW5kQWN0aW9uKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkhKS5jb21tYW5kSWQsICd3b3JrYmVuY2guYWN0aW9uLmNoYXQubWFuYWdlQWRkaXRpb25hbFNwZW5kJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBCWU9LIG1vZGVsIHN1cHByZXNzaW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdCWU9LIG1vZGVsIHN1cHByZXNzaW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2RlZmVycyBub3RpZmljYXRpb25zIHdoZW4gQllPSyBtb2RlbCBpcyBzZWxlY3RlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKFxuXHRcdFx0XHR7IHF1b3RhczogeyB1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSwgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDApIH0gfSxcblx0XHRcdFx0eyB2ZW5kb3I6ICdjdXN0b21lbmRwb2ludCcgfSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25Nb2NrLmdldE5vdGlmaWNhdGlvbigpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3Mgbm90aWZpY2F0aW9uIHdoZW4gQ29waWxvdCBtb2RlbCBpcyBzZWxlY3RlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgbm90aWZpY2F0aW9uTW9jayB9ID0gY3JlYXRlQ29udHJpYnV0aW9uKFxuXHRcdFx0XHR7IHF1b3RhczogeyB1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSwgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDApIH0gfSxcblx0XHRcdFx0eyB2ZW5kb3I6ICdjb3BpbG90JyB9LFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbk1vY2suZ2V0Tm90aWZpY2F0aW9uKCk/Lm1lc3NhZ2UsICdDcmVkaXQgTGltaXQgUmVhY2hlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3Mgbm90aWZpY2F0aW9uIHdoZW4gc3dpdGNoaW5nIGZyb20gQllPSyB0byBDb3BpbG90IG1vZGVsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW50aXRsZW1lbnRNb2NrID0gY3JlYXRlTW9ja0VudGl0bGVtZW50U2VydmljZSh7XG5cdFx0XHRcdHF1b3RhczogeyB1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSwgcHJlbWl1bUNoYXQ6IG1ha2VRdW90YVNuYXBzaG90KDApIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbk1vY2sgPSBjcmVhdGVNb2NrTm90aWZpY2F0aW9uU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgYXNzaWdubWVudE1vY2sgPSBjcmVhdGVNb2NrQXNzaWdubWVudFNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRcdC8vIFN0YXJ0IHdpdGggQllPSyBtb2RlbFxuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2NoYXQuY3VycmVudExhbmd1YWdlTW9kZWwucGFuZWwnLCAnY3VzdG9tZW5kcG9pbnQvQU5UL2NsYXVkZS1zb25uZXQtNC02JywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHQvLyBSZWdpc3RyeSByZXR1cm5zIHVuZGVmaW5lZCBcdTIwMTQgdmVuZG9yIGRldGVjdGlvbiByZWxpZXMgb24gcHJlZml4IGV4dHJhY3Rpb25cblx0XHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxzU2VydmljZSA9IHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxWZW5kb3JzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRnZXRMYW5ndWFnZU1vZGVsSWRzOiAoKSA9PiBbXSxcblx0XHRcdFx0Z2V0VmVuZG9yczogKCkgPT4gW10sXG5cdFx0XHRcdGxvb2t1cExhbmd1YWdlTW9kZWw6ICgpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSB8IHVuZGVmaW5lZCA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGxvb2t1cExhbmd1YWdlTW9kZWxCeVF1YWxpZmllZE5hbWU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlO1xuXG5cdFx0XHRzdG9yZS5hZGQoZW50aXRsZW1lbnRNb2NrLm9uRGlkQ2hhbmdlUXVvdGFSZW1haW5pbmcpO1xuXHRcdFx0c3RvcmUuYWRkKGVudGl0bGVtZW50TW9jay5vbkRpZENoYW5nZVF1b3RhRXhjZWVkZWQpO1xuXHRcdFx0c3RvcmUuYWRkKGVudGl0bGVtZW50TW9jay5vbkRpZENoYW5nZUVudGl0bGVtZW50KTtcblxuXHRcdFx0c3RvcmUuYWRkKG5ldyBDaGF0UXVvdGFOb3RpZmljYXRpb25Db250cmlidXRpb24oXG5cdFx0XHRcdGVudGl0bGVtZW50TW9jay5zZXJ2aWNlLFxuXHRcdFx0XHRub3RpZmljYXRpb25Nb2NrLnNlcnZpY2UsXG5cdFx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlIGFzIElDb250ZXh0S2V5U2VydmljZSxcblx0XHRcdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdFx0YXNzaWdubWVudE1vY2suc2VydmljZSxcblx0XHRcdFx0bmV3IE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUoKSxcblx0XHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHQpKTtcblxuXHRcdFx0Ly8gSW5pdGlhbGx5IGRlZmVycmVkIFx1MjAxNCBCWU9LIG1vZGVsXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gU3dpdGNoIHRvIENvcGlsb3QgbW9kZWwgdmlhIHN0b3JhZ2UgXHUyMDE0IHRyaWdnZXJzIHN0b3JhZ2UgbGlzdGVuZXJcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdjaGF0LmN1cnJlbnRMYW5ndWFnZU1vZGVsLnBhbmVsJywgJ2NvcGlsb3QvZ3B0LTQuMScsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uTW9jay5nZXROb3RpZmljYXRpb24oKT8ubWVzc2FnZSwgJ0NyZWRpdCBMaW1pdCBSZWFjaGVkJyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsaUNBQWlDO0FBQzFDLFNBQXNCLHVCQUF1QjtBQUM3QyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHdCQUF3QixjQUFjLHFCQUFxQjtBQUVwRSxTQUFTLGlDQUFpQztBQUUxQyxTQUFTLHVCQUFvRztBQUM3RyxTQUFTLHlDQUF5QztBQUNsRCxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLGlDQUFpQyxxQ0FBaUk7QUFFM0ssTUFBTSwwQ0FBMEM7QUFDaEQsTUFBTSxnQ0FBZ0M7QUFDdEMsTUFBTSxrQ0FBa0M7QUFnQnhDLFNBQVMsNkJBQTZCLE1BR25DO0FBQ0YsUUFBTSw0QkFBNEIsSUFBSSxRQUFjO0FBQ3BELFFBQU0sMkJBQTJCLElBQUksUUFBYztBQUNuRCxRQUFNLHlCQUF5QixJQUFJLFFBQWM7QUFFakQsUUFBTSxVQUFtQztBQUFBLElBQ3hDLGVBQWU7QUFBQSxJQUNmLGFBQWEsTUFBTSxlQUFlLGdCQUFnQjtBQUFBLElBQ2xELGdCQUFnQixnQkFBZ0IsQ0FBQyxHQUFHLE1BQU0sZUFBZSxnQkFBZ0Is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
