import assert from "assert";
import { mainWindow } from "../../../../../base/browser/window.js";
import { DeferredPromise, timeout } from "../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IInlineCompletionsService } from "../../../../../editor/browser/services/inlineCompletionsService.js";
import { ConfigurationTarget } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import product from "../../../../../platform/product/common/product.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
import { ChatStatusDashboard } from "../../../chat/browser/chatStatus/chatStatusDashboard.js";
import { IChatStatusItemService } from "../../../chat/browser/chatStatus/chatStatusItemService.js";
function createEntitlementService(opts) {
  return {
    _serviceBrand: void 0,
    organisations: void 0,
    isInternal: false,
    sku: void 0,
    copilotTrackingId: void 0,
    onDidChangeQuotaExceeded: Event.None,
    onDidChangeQuotaRemaining: Event.None,
    onDidChangeUsageBasedBilling: Event.None,
    quotas: {
      chat: opts.chat,
      completions: opts.completions,
      premiumChat: opts.premiumChat,
      usageBasedBilling: opts.usageBasedBilling ?? opts.premiumChat?.usageBasedBilling,
      additionalUsageEnabled: opts.additionalUsageEnabled,
      additionalUsageCount: opts.additionalUsageCount
    },
    update: (_token) => Promise.resolve(),
    onDidChangeSentiment: Event.None,
    sentimentObs: observableValue({}, {}),
    sentiment: { completed: true },
    onDidChangeEntitlement: Event.None,
    entitlement: opts.entitlement ?? ChatEntitlement.Free,
    entitlementObs: observableValue({}, opts.entitlement ?? ChatEntitlement.Free),
    anonymous: false,
    onDidChangeAnonymous: Event.None,
    anonymousObs: observableValue({}, false),
    acceptQuotas: () => {
    },
    clearQuotas: () => {
    },
    markAnonymousRateLimited: () => {
    },
    markSetupCompleted: () => {
    },
    setForceHidden: () => {
    },
    clientByokEnabled: false,
    hasByokModels: false
  };
}
function getCalloutText(element) {
  const callout = element.querySelector(".quota-callout");
  if (!callout || callout.style.display === "none") {
    return null;
  }
  const text = callout.querySelector(".callout-text");
  return text?.textContent ?? null;
}
function getQuotaLabels(element) {
  const indicators = element.querySelectorAll(".quota-indicator:not(.included) .quota-title");
  return Array.from(indicators).map((el) => el.textContent ?? "");
}
function getIncludedLabels(element) {
  const indicators = element.querySelectorAll(".quota-indicator.included .quota-title");
  return Array.from(indicators).map((el) => el.textContent ?? "");
}
function getIncludedDescriptions(element) {
  const indicators = element.querySelectorAll(".quota-indicator.included .description");
  return Array.from(indicators).map((el) => el.textContent ?? "");
}
function getQuotaValues(element) {
  const values = element.querySelectorAll(".quota-indicator:not(.included) .quota-value");
  return Array.from(values).map((el) => el.textContent ?? "");
}
function getCreditsUsed(element) {
  const indicator = element.querySelector(".quota-indicator.credits-used");
  if (!indicator) {
    return void 0;
  }
  return {
    value: indicator.querySelector(".quota-value")?.textContent ?? "",
    suffix: indicator.querySelector(".quota-value-suffix")?.textContent ?? "",
    reset: indicator.querySelector(".quota-reset")?.textContent ?? ""
  };
}
const dashboardOptions = {
  disableInlineSuggestionsSettings: true,
  disableModelSelection: true,
  disableProviderOptions: true,
  disableCompletionsSnooze: true
};
class TestCompletionsConfigurationService extends TestConfigurationService {
  constructor(settingId, defaultValue, userValue, workspaceValue) {
    super();
    this.settingId = settingId;
    this.defaultValue = defaultValue;
    this.userValue = userValue;
    this.workspaceValue = workspaceValue;
  }
  getValue(arg1, arg2) {
    if (arg1 === this.settingId) {
      return { ...this.defaultValue, ...this.userValue, ...this.workspaceValue };
    }
    return super.getValue(arg1, arg2);
  }
  inspect(key, overrides) {
    if (key === this.settingId) {
      const userValue = this.userValue;
      return {
        defaultValue: this.defaultValue,
        userValue,
        userLocalValue: userValue,
        workspaceValue: this.workspaceValue,
        value: { ...this.defaultValue, ...this.userValue, ...this.workspaceValue }
      };
    }
    return super.inspect(key, overrides);
  }
  updateValue(key, value, target) {
    if (key !== this.settingId || typeof value !== "object" || value === null || this.pendingUpdate) {
      throw new Error("Unexpected configuration update");
    }
    const deferred = new DeferredPromise();
    this.pendingUpdate = {
      value: { ...value },
      target: target ?? ConfigurationTarget.USER_LOCAL,
      deferred
    };
    return deferred.p;
  }
  async completeUpdate() {
    if (!this.pendingUpdate) {
      await timeout(0);
    }
    const pendingUpdate = this.pendingUpdate;
    if (!pendingUpdate) {
      throw new Error("No configuration update is pending");
    }
    this.pendingUpdate = void 0;
    if (pendingUpdate.target === ConfigurationTarget.WORKSPACE) {
      this.workspaceValue = pendingUpdate.value;
    } else if (pendingUpdate.target === ConfigurationTarget.USER_LOCAL) {
      this.userValue = pendingUpdate.value;
    } else {
      throw new Error(`Unexpected configuration target: ${pendingUpdate.target}`);
    }
    this.onDidChangeConfigurationEmitter.fire({
      source: pendingUpdate.target,
      affectedKeys: /* @__PURE__ */ new Set([this.settingId]),
      change: { keys: [this.settingId], overrides: [] },
      affectsConfiguration: (candidate) => candidate === this.settingId
    });
    await pendingUpdate.deferred.complete(void 0);
    await timeout(0);
  }
  async failUpdate(error) {
    if (!this.pendingUpdate) {
      await timeout(0);
    }
    const pendingUpdate = this.pendingUpdate;
    if (!pendingUpdate) {
      throw new Error("No configuration update is pending");
    }
    this.pendingUpdate = void 0;
    await pendingUpdate.deferred.error(error);
    await timeout(0);
  }
  get configuredValue() {
    return this.userValue;
  }
  get configuredWorkspaceValue() {
    return this.workspaceValue;
  }
}
suite("ChatStatusDashboard", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createDashboard(entitlementService, options = {}) {
    const configurationService = options.configurationService;
    const instantiationService = workbenchInstantiationService(configurationService ? { configurationService: () => configurationService } : void 0, store);
    instantiationService.stub(IChatEntitlementService, entitlementService);
    instantiationService.stub(IChatStatusItemService, {
      _serviceBrand: void 0,
      onDidChange: Event.None,
      setOrUpdateEntry: () => {
      },
      deleteEntry: () => {
      },
      getEntries: () => []
    });
    instantiationService.stub(IInlineCompletionsService, {
      _serviceBrand: void 0,
      onDidChangeIsSnoozing: Event.None,
      snoozeTimeLeft: 0,
      snooze: () => {
      },
      setSnoozeDuration: () => {
      }
    });
    instantiationService.stub(IMarkdownRendererService, {
      _serviceBrand: void 0
    });
    if (options.activeTextEditorLanguageId) {
      const activeTextEditorLanguageId = options.activeTextEditorLanguageId;
      instantiationService.stub(IEditorService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeTextEditorLanguageId = activeTextEditorLanguageId;
        }
      }());
    }
    const dashboard = store.add(instantiationService.createInstance(ChatStatusDashboard, options.dashboardOptions ?? dashboardOptions));
    mainWindow.document.body.appendChild(dashboard.element);
    store.add({ dispose: () => dashboard.element.remove() });
    return dashboard;
  }
  test("preserves inline suggestion language setting state across writes", async () => {
    const defaultChat = product.defaultChatAgent;
    assert.ok(defaultChat);
    const configurationService = new TestCompletionsConfigurationService(
      defaultChat.completionsEnablementSetting,
      { "*": true, markdown: false },
      { "*": true, markdown: false }
    );
    const dashboard = createDashboard(createEntitlementService({ entitlement: ChatEntitlement.Pro }), {
      dashboardOptions: {
        ...dashboardOptions,
        disableInlineSuggestionsSettings: false
      },
      configurationService,
      activeTextEditorLanguageId: "markdown"
    });
    const languageCheckbox = dashboard.element.querySelectorAll(".settings .monaco-checkbox").item(1);
    const overriddenHint = dashboard.element.querySelector(".setting-overridden");
    assert.ok(languageCheckbox && overriddenHint);
    const getState = () => ({
      ariaChecked: languageCheckbox.getAttribute("aria-checked"),
      className: languageCheckbox.className,
      overriddenHint: overriddenHint.textContent,
      configuredValue: { ...configurationService.configuredValue }
    });
    languageCheckbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const pointerRequestedState = getState();
    await configurationService.completeUpdate();
    const pointerCommittedState = getState();
    const spaceEvent = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, shiftKey: true });
    Object.defineProperty(spaceEvent, "keyCode", { value: 32 });
    languageCheckbox.dispatchEvent(spaceEvent);
    const keyboardRequestedState = getState();
    await configurationService.completeUpdate();
    const keyboardCommittedState = getState();
    languageCheckbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const pointerUncheckedRequestedState = getState();
    await configurationService.completeUpdate();
    const pointerUncheckedCommittedState = getState();
    assert.deepStrictEqual({
      pointerRequested: pointerRequestedState,
      pointerCommitted: pointerCommittedState,
      keyboardRequested: keyboardRequestedState,
      keyboardCommitted: keyboardCommittedState,
      pointerUncheckedRequested: pointerUncheckedRequestedState,
      pointerUncheckedCommitted: pointerUncheckedCommittedState
    }, {
      pointerRequested: {
        ariaChecked: "mixed",
        className: "monaco-custom-toggle monaco-checkbox codicon codicon-dash",
        overriddenHint: "(overridden)",
        configuredValue: { "*": true, markdown: false }
      },
      pointerCommitted: {
        ariaChecked: "mixed",
        className: "monaco-custom-toggle monaco-checkbox codicon codicon-dash",
        overriddenHint: "",
        configuredValue: { "*": true }
      },
      keyboardRequested: {
        ariaChecked: "true",
        className: "monaco-custom-toggle monaco-checkbox checked codicon codicon-check",
        overriddenHint: "",
        configuredValue: { "*": true }
      },
      keyboardCommitted: {
        ariaChecked: "true",
        className: "monaco-custom-toggle monaco-checkbox checked codicon codicon-check",
        overriddenHint: "",
        configuredValue: { "*": true, markdown: true }
      },
      pointerUncheckedRequested: {
        ariaChecked: "false",
        className: "monaco-custom-toggle monaco-checkbox",
        overriddenHint: "",
        configuredValue: { "*": true, markdown: true }
      },
      pointerUncheckedCommitted: {
        ariaChecked: "false",
        className: "monaco-custom-toggle monaco-checkbox",
        overriddenHint: "(overridden)",
        configuredValue: { "*": true, markdown: false }
      }
    });
    for (let i = 0; i < 3; i++) {
      languageCheckbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    const rapidRequestedState = getState();
    for (let i = 0; i < 3; i++) {
      await configurationService.completeUpdate();
    }
    assert.deepStrictEqual({
      requested: rapidRequestedState,
      committed: getState()
    }, {
      requested: {
        ariaChecked: "false",
        className: "monaco-custom-toggle monaco-checkbox",
        overriddenHint: "(overridden)",
        configuredValue: { "*": true, markdown: false }
      },
      committed: {
        ariaChecked: "false",
        className: "monaco-custom-toggle monaco-checkbox",
        overriddenHint: "(overridden)",
        configuredValue: { "*": true, markdown: false }
      }
    });
  });
  test("removes inherited language overrides from every configured scope", async () => {
    const defaultChat = product.defaultChatAgent;
    assert.ok(defaultChat);
    const configurationService = new TestCompletionsConfigurationService(
      defaultChat.completionsEnablementSetting,
      { "*": true, markdown: false },
      { "*": true, markdown: true },
      { markdown: false }
    );
    const dashboard = createDashboard(createEntitlementService({ entitlement: ChatEntitlement.Pro }), {
      dashboardOptions: {
        ...dashboardOptions,
        disableInlineSuggestionsSettings: false
      },
      configurationService,
      activeTextEditorLanguageId: "markdown"
    });
    const languageCheckbox = dashboard.element.querySelectorAll(".settings .monaco-checkbox").item(1);
    const overriddenHint = dashboard.element.querySelector(".setting-overridden");
    assert.ok(languageCheckbox && overriddenHint);
    languageCheckbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await configurationService.completeUpdate();
    const intermediateState = {
      ariaChecked: languageCheckbox.getAttribute("aria-checked"),
      overriddenHint: overriddenHint.textContent,
      userValue: { ...configurationService.configuredValue },
      workspaceValue: { ...configurationService.configuredWorkspaceValue }
    };
    await configurationService.completeUpdate();
    assert.deepStrictEqual({
      intermediate: intermediateState,
      committed: {
        ariaChecked: languageCheckbox.getAttribute("aria-checked"),
        overriddenHint: overriddenHint.textContent,
        userValue: configurationService.configuredValue,
        workspaceValue: configurationService.configuredWorkspaceValue
      }
    }, {
      intermediate: {
        ariaChecked: "mixed",
        overriddenHint: "(overridden)",
        userValue: { "*": true, markdown: true },
        workspaceValue: {}
      },
      committed: {
        ariaChecked: "mixed",
        overriddenHint: "",
        userValue: { "*": true },
        workspaceValue: {}
      }
    });
  });
  test("restores the override hint when the final queued write fails", async () => {
    const defaultChat = product.defaultChatAgent;
    assert.ok(defaultChat);
    const configurationService = new TestCompletionsConfigurationService(
      defaultChat.completionsEnablementSetting,
      { "*": true, markdown: false },
      { "*": true, markdown: false }
    );
    const dashboard = createDashboard(createEntitlementService({ entitlement: ChatEntitlement.Pro }), {
      dashboardOptions: {
        ...dashboardOptions,
        disableInlineSuggestionsSettings: false
      },
      configurationService,
      activeTextEditorLanguageId: "markdown"
    });
    const languageCheckbox = dashboard.element.querySelectorAll(".settings .monaco-checkbox").item(1);
    const overriddenHint = dashboard.element.querySelector(".setting-overridden");
    assert.ok(languageCheckbox && overriddenHint);
    languageCheckbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    languageCheckbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await configurationService.completeUpdate();
    await configurationService.failUpdate(new Error("Unable to update configuration"));
    assert.deepStrictEqual({
      ariaChecked: languageCheckbox.getAttribute("aria-checked"),
      overriddenHint: overriddenHint.textContent,
      configuredValue: configurationService.configuredValue
    }, {
      ariaChecked: "mixed",
      overriddenHint: "",
      configuredValue: { "*": true }
    });
  });
  test("Free \u2014 PRU: shows Chat messages and Inline Suggestions", () => {
    const dashboard = createDashboard(createEntitlementService({
      chat: { percentRemaining: 80, unlimited: false },
      completions: { percentRemaining: 70, unlimited: false },
      entitlement: ChatEntitlement.Free
    }));
    assert.deepStrictEqual(getQuotaLabels(dashboard.element), ["Chat messages", "Inline Suggestions"]);
    assert.deepStrictEqual(getQuotaValues(dashboard.element), ["20%", "30%"]);
  });
  test("Free \u2014 PRU exhausted: shows Chat messages and Inline Suggestions at 0%", () => {
    const dashboard = createDashboard(createEntitlementService({
      chat: { percentRemaining: 0, unlimited: false },
      completions: { percentRemaining: 0, unlimited: false },
      entitlement: ChatEntitlement.Free
    }));
    assert.deepStrictEqual(getQuotaLabels(dashboard.element), ["Chat messages", "Inline Suggestions"]);
    assert.deepStrictEqual(getQuotaValues(dashboard.element), ["100%", "100%"]);
  });
  test("Free \u2014 TBB: shows Credits and Inline Suggestions", () => {
    const dashboard = createDashboard(createEntitlementService({
      chat: { percentRemaining: 80, unlimited: false },
      completions: { percentRemaining: 70, unlimited: false },
      usageBasedBilling: true,
      entitlement: ChatEntitlement.Free
    }));
    assert.deepStrictEqual(getQuotaLabels(dashboard.element), ["Credits", "Inline Suggestions"]);
    assert.deepStrictEqual(getQuotaValues(dashboard.element), ["20%", "30%"]);
  });
  test("Free \u2014 TBB exhausted: shows Credits and Inline Suggestions at 0%", () => {
    const dashboard = createDashboard(createEntitlementService({
      chat: { percentRemaining: 0, unlimited: false },
      completions: { percentRemaining: 0, unlimited: false },
      usageBasedBilling: true,
      entitlement: ChatEntitlement.Free
    }));
    assert.deepStrictEqual(getQuotaLabels(dashboard.element), ["Credits", "Inline Suggestions"]);
    assert.deepStrictEqual(getQuotaValues(dashboard.element), ["100%", "100%"]);
  });
  test("EDU/Pro \u2014 PRU: shows Chat messages, Premium requests, and Inline Suggestions", () => {
    const dashboard = createDashboard(createEntitlementService({
      chat: { percentRemaining: 80, unlimited: false },
      premiumChat: { percentRemaining: 60, unlimited: false },
      completions: { percentRemaining: 90, unlimited: false },
      entitlement: ChatEntitlement.Pro
    }));
    assert.deepStrictEqual(getQuotaLabels(dashboard.element), ["Chat messages", "Premium requests", "Inline Suggestions"]);
  });
  test("EDU/Pro \u2014 TBB: shows only Credits, not Chat messages or Inline Suggestions", () => {
    const dashboard = createDashboard(createEntitlementService({
      chat: { percentRemaining: 80, unlimited: false },
      premiumChat: { percentRemaining: 60, unlimited: false, usageBasedBilling: true },
      completions: { percentRemaining: 90, unlimited: false },
      entitlement: ChatEntitlement.Pro
    }));
    assert.deepStrictEqual(getQuotaLabels(dashboard.element), ["Credits"]);
  });
  test("EDU/Pro \u2014 TBB exhausted (no overages): shows only Credits", () => {
    const dashboard = createDashboard(createEntitlementService({
      chat: { percentRemaining: 0, unlimited: false },
      premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
      completions: { percentRemaining: 90, unlimited: false },
      additionalUsageEnabled: false,
      entitlement: ChatEntitlement.Pro
    }));
    assert.deepStrictEqual(getQuotaLabels(dashboard.element), ["Credits"]);
    assert.deepStrictEqual(getQuotaValues(dashboard.element), ["100%"]);
  });
  test("EDU/Pro \u2014 TBB exhausted (with overages): shows only Credits", () => {
    const dashboard = createDashboard(createEntitlementService({
      chat: { percentRemaining: 0, unlimited: false },
      premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
      completions: { percentRemaining: 90, unlimited: false },
      additionalUsageEnabled: true,
      entitlement: ChatEntitlement.Pro
    }));
    assert.deepStrictEqual(getQuotaLabels(dashboard.element), ["Credits"]);
    assert.deepStrictEqual(getQuotaValues(dashboard.element), ["100%"]);
  });
  test("Pro+ \u2014 PRU: shows Premium requests and Inline Suggestions", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 60, unlimited: false },
      completions: { percentRemaining: 90, unlimited: false },
      entitlement: ChatEntitlement.ProPlus
    }));
    assert.deepStrictEqual(getQuotaLabels(dashboard.element), ["Premium requests", "Inline Suggestions"]);
  });
  test("Pro+ \u2014 TBB with quota: shows only Credits", () => {
    const dashboard = createDashboard(createEntitlementService({
      chat: { percentRemaining: 80, unlimited: false },
      premiumChat: { percentRemaining: 60, unlimited: false, usageBasedBilling: true },
      completions: { percentRemaining: 90, unlimited: false },
      entitlement: ChatEntitlement.ProPlus
    }));
    assert.deepStrictEqual(getQuotaLabels(dashboard.element), ["Credits"]);
  });
  test("Pro+ \u2014 TBB out of quota: shows only Credits", () => {
    const dashboard = createDashboard(createEntitlementService({
      chat: { percentRemaining: 0, unlimited: false },
      premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
      completions: { percentRemaining: 90, unlimited: false },
      entitlement: ChatEntitlement.ProPlus
    }));
    assert.deepStrictEqual(getQuotaLabels(dashboard.element), ["Credits"]);
    assert.deepStrictEqual(getQuotaValues(dashboard.element), ["100%"]);
  });
  test("Max Yearly \u2014 no TBB: shows unlimited Premium Requests included indicator", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 100, unlimited: true },
      completions: { percentRemaining: 100, unlimited: true },
      entitlement: ChatEntitlement.Max
    }));
    assert.deepStrictEqual(getQuotaLabels(dashboard.element), []);
    assert.deepStrictEqual(getIncludedLabels(dashboard.element), ["Premium Requests"]);
  });
  test("Max Monthly \u2014 TBB: shows unlimited Credits included indicator", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 100, unlimited: true, usageBasedBilling: true },
      completions: { percentRemaining: 100, unlimited: true },
      entitlement: ChatEntitlement.Max
    }));
    assert.deepStrictEqual(getQuotaLabels(dashboard.element), []);
    assert.deepStrictEqual(getIncludedLabels(dashboard.element), ["Credits"]);
  });
  test("Enterprise Managed \u2014 PRU: shows Premium requests with unlimited included", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 100, unlimited: true },
      completions: { percentRemaining: 100, unlimited: true },
      entitlement: ChatEntitlement.Business
    }));
    assert.deepStrictEqual(getQuotaLabels(dashboard.element), []);
    assert.deepStrictEqual(getIncludedLabels(dashboard.element), ["Premium Requests"]);
    assert.deepStrictEqual(getIncludedDescriptions(dashboard.element), ["Included with your organization's plan."]);
  });
  test("Enterprise Managed \u2014 PRU with credits used: shows consumed credits with reset time", () => {
    const resetAt = Math.floor(Date.UTC(2026, 6, 5, 14, 0, 0) / 1e3);
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 100, unlimited: true, creditsUsed: 1284, resetAt },
      completions: { percentRemaining: 100, unlimited: true },
      entitlement: ChatEntitlement.Business
    }));
    const credits = getCreditsUsed(dashboard.element);
    assert.strictEqual(credits?.value, "1,284");
    assert.strictEqual(credits?.suffix, "Credits Used");
    assert.ok(credits?.reset.startsWith("Resets Jul 5 at "));
    assert.deepStrictEqual(getIncludedLabels(dashboard.element), []);
  });
  test("Enterprise Managed \u2014 PRU with credits used (compact): shows plan title, credits and reset", () => {
    const resetAt = Math.floor(Date.UTC(2026, 4, 31, 21, 0, 0) / 1e3);
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 100, unlimited: true, creditsUsed: 1284, resetAt },
      completions: { percentRemaining: 100, unlimited: true },
      entitlement: ChatEntitlement.Business
    }), { dashboardOptions: { ...dashboardOptions, compactQuotaLayout: true } });
    const indicator = dashboard.element.querySelector(".quota-indicator.credits-used");
    const credits = getCreditsUsed(dashboard.element);
    assert.ok(indicator?.classList.contains("compact"));
    assert.strictEqual(indicator?.querySelector(".quota-title")?.textContent, "Copilot Business");
    assert.strictEqual(credits?.value, "1,284");
    assert.strictEqual(credits?.suffix, "Credits used");
    assert.ok(credits?.reset.startsWith("Resets May 31 at "));
  });
  test("Business \u2014 pooled exhausted (no overages): shows exhausted indicator and callout", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 0, unlimited: true, hasQuota: false },
      completions: { percentRemaining: 100, unlimited: true },
      additionalUsageEnabled: false,
      entitlement: ChatEntitlement.Business
    }));
    assert.deepStrictEqual(getIncludedLabels(dashboard.element), ["Premium Requests"]);
    assert.deepStrictEqual(getIncludedDescriptions(dashboard.element), ["Organization limit reached."]);
    assert.strictEqual(getCalloutText(dashboard.element), "Your organization or enterprise has exceeded its Copilot budget. Contact your admin to resume usage.");
  });
  test("Enterprise \u2014 pooled exhausted (no overages): shows exhausted indicator and enterprise callout", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 0, unlimited: true, hasQuota: false },
      completions: { percentRemaining: 100, unlimited: true },
      additionalUsageEnabled: false,
      entitlement: ChatEntitlement.Enterprise
    }));
    assert.deepStrictEqual(getIncludedLabels(dashboard.element), ["Premium Requests"]);
    assert.deepStrictEqual(getIncludedDescriptions(dashboard.element), ["Organization limit reached."]);
    assert.strictEqual(getCalloutText(dashboard.element), "Your organization or enterprise has exceeded its Copilot budget. Contact your admin to resume usage.");
  });
  test("Enterprise \u2014 pooled exhausted TBB (no overages): shows Credits exhausted", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 0, unlimited: true, usageBasedBilling: true, hasQuota: false },
      completions: { percentRemaining: 100, unlimited: true },
      additionalUsageEnabled: false,
      entitlement: ChatEntitlement.Enterprise
    }));
    assert.deepStrictEqual(getIncludedLabels(dashboard.element), ["Credits"]);
    assert.deepStrictEqual(getIncludedDescriptions(dashboard.element), ["Organization limit reached."]);
  });
  test("Enterprise \u2014 pooled exhausted but overages enabled: shows budget exceeded (hasQuota=false overrides overages)", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 0, unlimited: true, hasQuota: false },
      completions: { percentRemaining: 100, unlimited: true },
      additionalUsageEnabled: true,
      entitlement: ChatEntitlement.Enterprise
    }));
    assert.deepStrictEqual(getIncludedLabels(dashboard.element), ["Premium Requests"]);
    assert.deepStrictEqual(getIncludedDescriptions(dashboard.element), ["Organization limit reached."]);
    assert.strictEqual(getCalloutText(dashboard.element), "Your organization or enterprise has exceeded its Copilot budget. Contact your admin to resume usage.");
  });
  test("Enterprise \u2014 TBB (multi-quota): shows only Credits, not Chat messages or Inline Suggestions", () => {
    const dashboard = createDashboard(createEntitlementService({
      chat: { percentRemaining: 80, unlimited: false },
      premiumChat: { percentRemaining: 60, unlimited: false, usageBasedBilling: true },
      completions: { percentRemaining: 70, unlimited: false },
      entitlement: ChatEntitlement.Enterprise
    }));
    assert.deepStrictEqual(getQuotaLabels(dashboard.element), ["Credits"]);
  });
  test("Hover shows credit fractions when entitlement is available", () => {
    const dashboard = createDashboard(createEntitlementService({
      chat: { percentRemaining: 80, unlimited: false, entitlement: 2e3 },
      completions: { percentRemaining: 70, unlimited: false, entitlement: 5e3 },
      entitlement: ChatEntitlement.Free
    }));
    const quotaPercentages = dashboard.element.querySelectorAll(".quota-indicator:not(.included) .quota-percentage");
    assert.strictEqual(quotaPercentages.length, 2);
    assert.deepStrictEqual(getQuotaValues(dashboard.element), ["20%", "30%"]);
    quotaPercentages[0].dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    const chatValue = quotaPercentages[0].querySelector(".quota-value");
    assert.ok(chatValue?.textContent?.includes("/"));
    quotaPercentages[0].dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    assert.deepStrictEqual(getQuotaValues(dashboard.element), ["20%", "30%"]);
  });
  test("Hover is a no-op when entitlement is not available", () => {
    const dashboard = createDashboard(createEntitlementService({
      chat: { percentRemaining: 80, unlimited: false },
      completions: { percentRemaining: 70, unlimited: false },
      entitlement: ChatEntitlement.Free
    }));
    const quotaPercentages = dashboard.element.querySelectorAll(".quota-indicator:not(.included) .quota-percentage");
    assert.strictEqual(quotaPercentages.length, 2);
    assert.deepStrictEqual(getQuotaValues(dashboard.element), ["20%", "30%"]);
    quotaPercentages[0].dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    assert.deepStrictEqual(getQuotaValues(dashboard.element), ["20%", "30%"]);
  });
  test("Focus shows credit fractions (keyboard accessibility)", () => {
    const dashboard = createDashboard(createEntitlementService({
      chat: { percentRemaining: 80, unlimited: false, entitlement: 2e3 },
      completions: { percentRemaining: 70, unlimited: false, entitlement: 5e3 },
      entitlement: ChatEntitlement.Free
    }));
    const quotaPercentages = dashboard.element.querySelectorAll(".quota-indicator:not(.included) .quota-percentage");
    assert.strictEqual(quotaPercentages.length, 2);
    assert.deepStrictEqual(getQuotaValues(dashboard.element), ["20%", "30%"]);
    quotaPercentages[0].dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    const chatValue = quotaPercentages[0].querySelector(".quota-value");
    assert.ok(chatValue?.textContent?.includes("/"));
    quotaPercentages[0].dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    assert.deepStrictEqual(getQuotaValues(dashboard.element), ["20%", "30%"]);
  });
  test("Hover is a no-op when entitlement is zero", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true, entitlement: 0 },
      completions: { percentRemaining: 70, unlimited: false, entitlement: 0 },
      entitlement: ChatEntitlement.Free
    }));
    const quotaPercentages = dashboard.element.querySelectorAll(".quota-indicator:not(.included) .quota-percentage");
    assert.strictEqual(quotaPercentages.length, 2);
    const valuesBefore = getQuotaValues(dashboard.element);
    quotaPercentages[0].dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    assert.deepStrictEqual(getQuotaValues(dashboard.element), valuesBefore);
  });
  test("Quota percentage element is keyboard-focusable", () => {
    const dashboard = createDashboard(createEntitlementService({
      chat: { percentRemaining: 80, unlimited: false, entitlement: 2e3 },
      entitlement: ChatEntitlement.Free
    }));
    const quotaPercentage = dashboard.element.querySelector(".quota-indicator:not(.included) .quota-percentage");
    assert.ok(quotaPercentage);
    assert.strictEqual(quotaPercentage.tabIndex, 0);
  });
  test("Callout: no callout when quota is not approaching limit", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 50, unlimited: false },
      completions: { percentRemaining: 90, unlimited: false },
      additionalUsageEnabled: true,
      entitlement: ChatEntitlement.Pro
    }));
    assert.strictEqual(getCalloutText(dashboard.element), null);
  });
  test("Callout: PRU \u2014 shows approaching message with budget wording", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 20, unlimited: false },
      completions: { percentRemaining: 90, unlimited: false },
      additionalUsageEnabled: true,
      entitlement: ChatEntitlement.Pro
    }));
    assert.strictEqual(getCalloutText(dashboard.element), "Once the limit is reached, premium request budget will be used.");
  });
  test("Callout: UBB \u2014 shows approaching message with additional spend wording", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 20, unlimited: false, usageBasedBilling: true },
      completions: { percentRemaining: 90, unlimited: false },
      additionalUsageEnabled: true,
      entitlement: ChatEntitlement.Pro
    }));
    assert.strictEqual(getCalloutText(dashboard.element), "Once the limit is reached, additional budget will be used.");
  });
  test("Callout: shows paused when quota exhausted and overage not permitted", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 0, unlimited: false },
      completions: { percentRemaining: 90, unlimited: false },
      additionalUsageEnabled: false,
      entitlement: ChatEntitlement.Pro
    }));
    assert.strictEqual(getCalloutText(dashboard.element), "Copilot is paused until the limit resets.");
  });
  test("Callout: Free \u2014 no paused message when only inline suggestions limit is reached", () => {
    const dashboard = createDashboard(createEntitlementService({
      chat: { percentRemaining: 90, unlimited: false },
      completions: { percentRemaining: 0, unlimited: false },
      additionalUsageEnabled: false,
      entitlement: ChatEntitlement.Free
    }));
    assert.strictEqual(getCalloutText(dashboard.element), null);
  });
  test("Callout: Free \u2014 shows paused when chat limit is reached", () => {
    const dashboard = createDashboard(createEntitlementService({
      chat: { percentRemaining: 0, unlimited: false },
      completions: { percentRemaining: 90, unlimited: false },
      additionalUsageEnabled: false,
      entitlement: ChatEntitlement.Free
    }));
    assert.strictEqual(getCalloutText(dashboard.element), "Copilot is paused until the limit resets.");
  });
  test("Callout: shows budget active when quota exhausted and overage permitted but no overage used yet", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 0, unlimited: false },
      completions: { percentRemaining: 90, unlimited: false },
      additionalUsageEnabled: true,
      additionalUsageCount: 0,
      entitlement: ChatEntitlement.Pro
    }));
    assert.strictEqual(getCalloutText(dashboard.element), "Premium request budget is configured. Usage will continue until limits reset.");
  });
  test("Callout: PRU \u2014 shows budget active when quota exhausted and overage count > 0", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 0, unlimited: false },
      completions: { percentRemaining: 90, unlimited: false },
      additionalUsageEnabled: true,
      additionalUsageCount: 5,
      entitlement: ChatEntitlement.Pro
    }));
    assert.strictEqual(getCalloutText(dashboard.element), "Premium request budget is configured. Usage will continue until limits reset.");
  });
  test("Callout: UBB \u2014 shows additional budget active when quota exhausted and overage count > 0", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
      completions: { percentRemaining: 90, unlimited: false },
      additionalUsageEnabled: true,
      additionalUsageCount: 5,
      entitlement: ChatEntitlement.Pro
    }));
    assert.strictEqual(getCalloutText(dashboard.element), "Additional budget is configured. Usage will continue until limits reset.");
  });
  test("Callout: shows warning when quota >= 75% used and overage not permitted", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 20, unlimited: false },
      completions: { percentRemaining: 90, unlimited: false },
      additionalUsageEnabled: false,
      entitlement: ChatEntitlement.Pro
    }));
    assert.strictEqual(getCalloutText(dashboard.element), "Copilot will pause when the limit is reached.");
  });
  test("Callout: shows paused for enterprise when quota exhausted", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 0, unlimited: false },
      additionalUsageEnabled: false,
      entitlement: ChatEntitlement.Enterprise
    }));
    assert.strictEqual(getCalloutText(dashboard.element), "Copilot is paused until the limit resets. Contact your administrator for more information.");
  });
  test("Callout: TBB \u2014 shows additional budget active when exhausted with overage permitted but no usage yet", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
      additionalUsageEnabled: true,
      additionalUsageCount: 0,
      entitlement: ChatEntitlement.Pro
    }));
    assert.strictEqual(getCalloutText(dashboard.element), "Additional budget is configured. Usage will continue until limits reset.");
  });
  test("Callout: TBB \u2014 shows additional budget wording when overage count > 0", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
      additionalUsageEnabled: true,
      additionalUsageCount: 3,
      entitlement: ChatEntitlement.Pro
    }));
    assert.strictEqual(getCalloutText(dashboard.element), "Additional budget is configured. Usage will continue until limits reset.");
  });
  test("Callout: Enterprise \u2014 shows org-specific wording when approaching limit with additional usage", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 20, unlimited: false, usageBasedBilling: true },
      completions: { percentRemaining: 90, unlimited: false },
      additionalUsageEnabled: true,
      entitlement: ChatEntitlement.Enterprise
    }));
    assert.strictEqual(getCalloutText(dashboard.element), "Copilot will pause when your limits are reached. Please contact your admin to increase your limits.");
  });
  test("Callout: Business \u2014 shows org-specific wording when approaching limit with additional usage", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 20, unlimited: false, usageBasedBilling: true },
      completions: { percentRemaining: 90, unlimited: false },
      additionalUsageEnabled: true,
      entitlement: ChatEntitlement.Business
    }));
    assert.strictEqual(getCalloutText(dashboard.element), "Copilot will pause when your limits are reached. Please contact your admin to increase your limits.");
  });
  test("Callout: Enterprise \u2014 shows org-specific wording when quota exhausted with additional usage", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
      completions: { percentRemaining: 90, unlimited: false },
      additionalUsageEnabled: true,
      additionalUsageCount: 5,
      entitlement: ChatEntitlement.Enterprise
    }));
    assert.strictEqual(getCalloutText(dashboard.element), "Copilot has paused because your limits are reached. Please contact your admin to increase your limits.");
  });
  test("Callout: Business \u2014 shows org-specific wording when quota exhausted with additional usage", () => {
    const dashboard = createDashboard(createEntitlementService({
      premiumChat: { percentRemaining: 0, unlimited: false, usageBasedBilling: true },
      completions: { percentRemaining: 90, unlimited: false },
      additionalUsageEnabled: true,
      additionalUsageCount: 5,
      entitlement: ChatEntitlement.Business
    }));
    assert.strictEqual(getCalloutText(dashboard.element), "Copilot has paused because your limits are reached. Please contact your admin to increase your limits.");
  });
  function createMutableEntitlementService(opts, emitterStore) {
    const onDidChangeQuotaRemaining = emitterStore.add(new Emitter());
    const onDidChangeQuotaExceeded = emitterStore.add(new Emitter());
    const svc = {
      ...createEntitlementService(opts),
      onDidChangeQuotaRemaining: onDidChangeQuotaRemaining.event,
      onDidChangeQuotaExceeded: onDidChangeQuotaExceeded.event,
      fireQuotaRemaining: () => onDidChangeQuotaRemaining.fire(),
      fireQuotaExceeded: () => onDidChangeQuotaExceeded.fire()
    };
    return svc;
  }
  test("Live update: quota indicators update when onDidChangeQuotaRemaining fires", () => {
    const svc = createMutableEntitlementService({
      chat: { percentRemaining: 80, unlimited: false },
      completions: { percentRemaining: 70, unlimited: false },
      entitlement: ChatEntitlement.Free
    }, store);
    const dashboard = createDashboard(svc);
    assert.deepStrictEqual(getQuotaValues(dashboard.element), ["20%", "30%"]);
    svc.quotas = {
      ...svc.quotas,
      chat: { percentRemaining: 50, unlimited: false },
      completions: { percentRemaining: 40, unlimited: false }
    };
    svc.fireQuotaRemaining();
    assert.deepStrictEqual(getQuotaValues(dashboard.element), ["50%", "60%"]);
  });
  test("Live update: callout appears when onDidChangeQuotaExceeded fires and quota becomes exhausted", () => {
    const svc = createMutableEntitlementService({
      premiumChat: { percentRemaining: 50, unlimited: false },
      completions: { percentRemaining: 90, unlimited: false },
      additionalUsageEnabled: false,
      entitlement: ChatEntitlement.Pro
    }, store);
    const dashboard = createDashboard(svc);
    assert.strictEqual(getCalloutText(dashboard.element), null);
    svc.quotas = {
      ...svc.quotas,
      premiumChat: { percentRemaining: 0, unlimited: false }
    };
    svc.fireQuotaExceeded();
    assert.strictEqual(getCalloutText(dashboard.element), "Copilot is paused until the limit resets.");
  });
  test("Live update: header button visibility updates when quota changes", () => {
    const svc = createMutableEntitlementService({
      premiumChat: { percentRemaining: 50, unlimited: false },
      completions: { percentRemaining: 90, unlimited: false },
      additionalUsageEnabled: true,
      entitlement: ChatEntitlement.Pro
    }, store);
    const dashboard = createDashboard(svc);
    const headerButton = dashboard.element.querySelector(".header-cta-button");
    assert.ok(headerButton);
    assert.strictEqual(headerButton.style.display, "none");
    svc.quotas = {
      ...svc.quotas,
      premiumChat: { percentRemaining: 20, unlimited: false }
    };
    svc.fireQuotaRemaining();
    assert.notStrictEqual(headerButton.style.display, "none");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRTdGF0dXNEYXNoYm9hcmQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElJbmxpbmVDb21wbGV0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9pbmxpbmVDb21wbGV0aW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgdHlwZSBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcywgdHlwZSBJQ29uZmlndXJhdGlvblZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnQsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgQ2hhdFN0YXR1c0Rhc2hib2FyZCwgSUNoYXRTdGF0dXNEYXNoYm9hcmRPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9icm93c2VyL2NoYXRTdGF0dXMvY2hhdFN0YXR1c0Rhc2hib2FyZC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFN0YXR1c0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9icm93c2VyL2NoYXRTdGF0dXMvY2hhdFN0YXR1c0l0ZW1TZXJ2aWNlLmpzJztcblxuaW50ZXJmYWNlIElRdW90YUNvbmZpZyB7XG5cdHBlcmNlbnRSZW1haW5pbmc6IG51bWJlcjtcblx0dW5saW1pdGVkOiBib29sZWFuO1xuXHRoYXNRdW90YT86IGJvb2xlYW47XG5cdHVzYWdlQmFzZWRCaWxsaW5nPzogYm9vbGVhbjtcblx0cmVzZXRBdD86IG51bWJlcjtcblx0ZW50aXRsZW1lbnQ/OiBudW1iZXI7XG5cdGNyZWRpdHNVc2VkPzogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uob3B0czoge1xuXHRjaGF0PzogSVF1b3RhQ29uZmlnO1xuXHRjb21wbGV0aW9ucz86IElRdW90YUNvbmZpZztcblx0cHJlbWl1bUNoYXQ/OiBJUXVvdGFDb25maWc7XG5cdHVzYWdlQmFzZWRCaWxsaW5nPzogYm9vbGVhbjtcblx0YWRkaXRpb25hbFVzYWdlRW5hYmxlZD86IGJvb2xlYW47XG5cdGFkZGl0aW9uYWxVc2FnZUNvdW50PzogbnVtYmVyO1xuXHRlbnRpdGxlbWVudD86IENoYXRFbnRpdGxlbWVudDtcbn0pOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB7XG5cdHJldHVybiB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdG9yZ2FuaXNhdGlvbnM6IHVuZGVmaW5lZCxcblx0XHRpc0ludGVybmFsOiBmYWxzZSxcblx0XHRza3U6IHVuZGVmaW5lZCxcblx0XHRjb3BpbG90VHJhY2tpbmdJZDogdW5kZWZpbmVkLFxuXHRcdG9uRGlkQ2hhbmdlUXVvdGFFeGNlZWRlZDogRXZlbnQuTm9uZSxcblx0XHRvbkRpZENoYW5nZVF1b3RhUmVtYWluaW5nOiBFdmVudC5Ob25lLFxuXHRcdG9uRGlkQ2hhbmdlVXNhZ2VCYXNlZEJpbGxpbmc6IEV2ZW50Lk5vbmUsXG5cdFx0cXVvdGFzOiB7XG5cdFx0XHRjaGF0OiBvcHRzLmNoYXQsXG5cdFx0XHRjb21wbGV0aW9uczogb3B0cy5jb21wbGV0aW9ucyxcblx0XHRcdHByZW1pdW1DaGF0OiBvcHRzLnByZW1pdW1DaGF0LFxuXHRcdFx0dXNhZ2VCYXNlZEJpbGxpbmc6IG9wdHMudXNhZ2VCYXNlZEJpbGxpbmcgPz8gb3B0cy5wcmVtaXVtQ2hhdD8udXNhZ2VCYXNlZEJpbGxpbmcsXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiBvcHRzLmFkZGl0aW9uYWxVc2FnZUVuYWJsZWQsXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VDb3VudDogb3B0cy5hZGRpdGlvbmFsVXNhZ2VDb3VudCxcblx0XHR9LFxuXHRcdHVwZGF0ZTogKF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdG9uRGlkQ2hhbmdlU2VudGltZW50OiBFdmVudC5Ob25lLFxuXHRcdHNlbnRpbWVudE9iczogb2JzZXJ2YWJsZVZhbHVlKHt9LCB7fSksXG5cdFx0c2VudGltZW50OiB7IGNvbXBsZXRlZDogdHJ1ZSB9LFxuXHRcdG9uRGlkQ2hhbmdlRW50aXRsZW1lbnQ6IEV2ZW50Lk5vbmUsXG5cdFx0ZW50aXRsZW1lbnQ6IG9wdHMuZW50aXRsZW1lbnQgPz8gQ2hhdEVudGl0bGVtZW50LkZyZWUsXG5cdFx0ZW50aXRsZW1lbnRPYnM6IG9ic2VydmFibGVWYWx1ZSh7fSwgb3B0cy5lbnRpdGxlbWVudCA/PyBDaGF0RW50aXRsZW1lbnQuRnJlZSksXG5cdFx0YW5vbnltb3VzOiBmYWxzZSxcblx0XHRvbkRpZENoYW5nZUFub255bW91czogRXZlbnQuTm9uZSxcblx0XHRhbm9ueW1vdXNPYnM6IG9ic2VydmFibGVWYWx1ZSh7fSwgZmFsc2UpLFxuXHRcdGFjY2VwdFF1b3RhczogKCkgPT4geyB9LFxuXHRcdGNsZWFyUXVvdGFzOiAoKSA9PiB7IH0sXG5cdFx0bWFya0Fub255bW91c1JhdGVMaW1pdGVkOiAoKSA9PiB7IH0sXG5cdFx0bWFya1NldHVwQ29tcGxldGVkOiAoKSA9PiB7IH0sXG5cdFx0c2V0Rm9yY2VIaWRkZW46ICgpID0+IHsgfSxcblx0XHRjbGllbnRCeW9rRW5hYmxlZDogZmFsc2UsXG5cdFx0aGFzQnlva01vZGVsczogZmFsc2UsXG5cdH0gYXMgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2U7XG59XG5cbmZ1bmN0aW9uIGdldENhbGxvdXRUZXh0KGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogc3RyaW5nIHwgbnVsbCB7XG5cdGNvbnN0IGNhbGxvdXQgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5xdW90YS1jYWxsb3V0JykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRpZiAoIWNhbGxvdXQgfHwgY2FsbG91dC5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZScpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXHRjb25zdCB0ZXh0ID0gY2FsbG91dC5xdWVyeVNlbGVjdG9yKCcuY2FsbG91dC10ZXh0Jyk7XG5cdHJldHVybiB0ZXh0Py50ZXh0Q29udGVudCA/PyBudWxsO1xufVxuXG5mdW5jdGlvbiBnZXRRdW90YUxhYmVscyhlbGVtZW50OiBIVE1MRWxlbWVudCk6IHN0cmluZ1tdIHtcblx0Y29uc3QgaW5kaWNhdG9ycyA9IGVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnF1b3RhLWluZGljYXRvcjpub3QoLmluY2x1ZGVkKSAucXVvdGEtdGl0bGUnKTtcblx0cmV0dXJuIEFycmF5LmZyb20oaW5kaWNhdG9ycykubWFwKGVsID0+IGVsLnRleHRDb250ZW50ID8/ICcnKTtcbn1cblxuZnVuY3Rpb24gZ2V0SW5jbHVkZWRMYWJlbHMoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IGluZGljYXRvcnMgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5xdW90YS1pbmRpY2F0b3IuaW5jbHVkZWQgLnF1b3RhLXRpdGxlJyk7XG5cdHJldHVybiBBcnJheS5mcm9tKGluZGljYXRvcnMpLm1hcChlbCA9PiBlbC50ZXh0Q29udGVudCA/PyAnJyk7XG59XG5cbmZ1bmN0aW9uIGdldEluY2x1ZGVkRGVzY3JpcHRpb25zKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogc3RyaW5nW10ge1xuXHRjb25zdCBpbmRpY2F0b3JzID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucXVvdGEtaW5kaWNhdG9yLmluY2x1ZGVkIC5kZXNjcmlwdGlvbicpO1xuXHRyZXR1cm4gQXJyYXkuZnJvbShpbmRpY2F0b3JzKS5tYXAoZWwgPT4gZWwudGV4dENvbnRlbnQgPz8gJycpO1xufVxuXG5mdW5jdGlvbiBnZXRRdW90YVZhbHVlcyhlbGVtZW50OiBIVE1MRWxlbWVudCk6IHN0cmluZ1tdIHtcblx0Y29uc3QgdmFsdWVzID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucXVvdGEtaW5kaWNhdG9yOm5vdCguaW5jbHVkZWQpIC5xdW90YS12YWx1ZScpO1xuXHRyZXR1cm4gQXJyYXkuZnJvbSh2YWx1ZXMpLm1hcChlbCA9PiBlbC50ZXh0Q29udGVudCA/PyAnJyk7XG59XG5cbmZ1bmN0aW9uIGdldENyZWRpdHNVc2VkKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogeyB2YWx1ZTogc3RyaW5nOyBzdWZmaXg6IHN0cmluZzsgcmVzZXQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgaW5kaWNhdG9yID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcucXVvdGEtaW5kaWNhdG9yLmNyZWRpdHMtdXNlZCcpO1xuXHRpZiAoIWluZGljYXRvcikge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHtcblx0XHR2YWx1ZTogaW5kaWNhdG9yLnF1ZXJ5U2VsZWN0b3IoJy5xdW90YS12YWx1ZScpPy50ZXh0Q29udGVudCA/PyAnJyxcblx0XHRzdWZmaXg6IGluZGljYXRvci5xdWVyeVNlbGVjdG9yKCcucXVvdGEtdmFsdWUtc3VmZml4Jyk/LnRleHRDb250ZW50ID8/ICcnLFxuXHRcdHJlc2V0OiBpbmRpY2F0b3IucXVlcnlTZWxlY3RvcignLnF1b3RhLXJlc2V0Jyk/LnRleHRDb250ZW50ID8/ICcnXG5cdH07XG59XG5cbmNvbnN0IGRhc2hib2FyZE9wdGlvbnM6IElDaGF0U3RhdHVzRGFzaGJvYXJkT3B0aW9ucyA9IHtcblx0ZGlzYWJsZUlubGluZVN1Z2dlc3Rpb25zU2V0dGluZ3M6IHRydWUsXG5cdGRpc2FibGVNb2RlbFNlbGVjdGlvbjogdHJ1ZSxcblx0ZGlzYWJsZVByb3ZpZGVyT3B0aW9uczogdHJ1ZSxcblx0ZGlzYWJsZUNvbXBsZXRpb25zU25vb3plOiB0cnVlLFxufTtcblxuY2xhc3MgVGVzdENvbXBsZXRpb25zQ29uZmlndXJhdGlvblNlcnZpY2UgZXh0ZW5kcyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uge1xuXG5cdHByaXZhdGUgcGVuZGluZ1VwZGF0ZTogeyB2YWx1ZTogUmVjb3JkPHN0cmluZywgYm9vbGVhbj47IHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldDsgZGVmZXJyZWQ6IERlZmVycmVkUHJvbWlzZTx2b2lkPiB9IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2V0dGluZ0lkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0VmFsdWU6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+LFxuXHRcdHByaXZhdGUgdXNlclZhbHVlOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPixcblx0XHRwcml2YXRlIHdvcmtzcGFjZVZhbHVlPzogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRWYWx1ZTxUPihhcmcxPzogc3RyaW5nIHwgSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMsIGFyZzI/OiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcyk6IFQgfCB1bmRlZmluZWQge1xuXHRcdGlmIChhcmcxID09PSB0aGlzLnNldHRpbmdJZCkge1xuXHRcdFx0cmV0dXJuIHsgLi4udGhpcy5kZWZhdWx0VmFsdWUsIC4uLnRoaXMudXNlclZhbHVlLCAuLi50aGlzLndvcmtzcGFjZVZhbHVlIH0gYXMgVDtcblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVyLmdldFZhbHVlPFQ+KGFyZzEsIGFyZzIpO1xuXHR9XG5cblx0b3ZlcnJpZGUgaW5zcGVjdDxUPihrZXk6IHN0cmluZywgb3ZlcnJpZGVzPzogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpOiBJQ29uZmlndXJhdGlvblZhbHVlPFQ+IHtcblx0XHRpZiAoa2V5ID09PSB0aGlzLnNldHRpbmdJZCkge1xuXHRcdFx0Y29uc3QgdXNlclZhbHVlID0gdGhpcy51c2VyVmFsdWUgYXMgVDtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRlZmF1bHRWYWx1ZTogdGhpcy5kZWZhdWx0VmFsdWUgYXMgVCxcblx0XHRcdFx0dXNlclZhbHVlLFxuXHRcdFx0XHR1c2VyTG9jYWxWYWx1ZTogdXNlclZhbHVlLFxuXHRcdFx0XHR3b3Jrc3BhY2VWYWx1ZTogdGhpcy53b3Jrc3BhY2VWYWx1ZSBhcyBUIHwgdW5kZWZpbmVkLFxuXHRcdFx0XHR2YWx1ZTogeyAuLi50aGlzLmRlZmF1bHRWYWx1ZSwgLi4udGhpcy51c2VyVmFsdWUsIC4uLnRoaXMud29ya3NwYWNlVmFsdWUgfSBhcyBULFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVyLmluc3BlY3Q8VD4oa2V5LCBvdmVycmlkZXMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlVmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCB0YXJnZXQ/OiBDb25maWd1cmF0aW9uVGFyZ2V0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGtleSAhPT0gdGhpcy5zZXR0aW5nSWQgfHwgdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0JyB8fCB2YWx1ZSA9PT0gbnVsbCB8fCB0aGlzLnBlbmRpbmdVcGRhdGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBjb25maWd1cmF0aW9uIHVwZGF0ZScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdHRoaXMucGVuZGluZ1VwZGF0ZSA9IHtcblx0XHRcdHZhbHVlOiB7IC4uLnZhbHVlIH0gYXMgUmVjb3JkPHN0cmluZywgYm9vbGVhbj4sXG5cdFx0XHR0YXJnZXQ6IHRhcmdldCA/PyBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwsXG5cdFx0XHRkZWZlcnJlZCxcblx0XHR9O1xuXHRcdHJldHVybiBkZWZlcnJlZC5wO1xuXHR9XG5cblx0YXN5bmMgY29tcGxldGVVcGRhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnBlbmRpbmdVcGRhdGUpIHtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0fVxuXHRcdGNvbnN0IHBlbmRpbmdVcGRhdGUgPSB0aGlzLnBlbmRpbmdVcGRhdGU7XG5cdFx0aWYgKCFwZW5kaW5nVXBkYXRlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIGNvbmZpZ3VyYXRpb24gdXBkYXRlIGlzIHBlbmRpbmcnKTtcblx0XHR9XG5cblx0XHR0aGlzLnBlbmRpbmdVcGRhdGUgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHBlbmRpbmdVcGRhdGUudGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSkge1xuXHRcdFx0dGhpcy53b3Jrc3BhY2VWYWx1ZSA9IHBlbmRpbmdVcGRhdGUudmFsdWU7XG5cdFx0fSBlbHNlIGlmIChwZW5kaW5nVXBkYXRlLnRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKSB7XG5cdFx0XHR0aGlzLnVzZXJWYWx1ZSA9IHBlbmRpbmdVcGRhdGUudmFsdWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZCBjb25maWd1cmF0aW9uIHRhcmdldDogJHtwZW5kaW5nVXBkYXRlLnRhcmdldH1gKTtcblx0XHR9XG5cdFx0dGhpcy5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0c291cmNlOiBwZW5kaW5nVXBkYXRlLnRhcmdldCxcblx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChbdGhpcy5zZXR0aW5nSWRdKSxcblx0XHRcdGNoYW5nZTogeyBrZXlzOiBbdGhpcy5zZXR0aW5nSWRdLCBvdmVycmlkZXM6IFtdIH0sXG5cdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogY2FuZGlkYXRlID0+IGNhbmRpZGF0ZSA9PT0gdGhpcy5zZXR0aW5nSWQsXG5cdFx0fSk7XG5cdFx0YXdhaXQgcGVuZGluZ1VwZGF0ZS5kZWZlcnJlZC5jb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdH1cblxuXHRhc3luYyBmYWlsVXBkYXRlKGVycm9yOiBFcnJvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5wZW5kaW5nVXBkYXRlKSB7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdH1cblx0XHRjb25zdCBwZW5kaW5nVXBkYXRlID0gdGhpcy5wZW5kaW5nVXBkYXRlO1xuXHRcdGlmICghcGVuZGluZ1VwZGF0ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBjb25maWd1cmF0aW9uIHVwZGF0ZSBpcyBwZW5kaW5nJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5wZW5kaW5nVXBkYXRlID0gdW5kZWZpbmVkO1xuXHRcdGF3YWl0IHBlbmRpbmdVcGRhdGUuZGVmZXJyZWQuZXJyb3IoZXJyb3IpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdH1cblxuXHRnZXQgY29uZmlndXJlZFZhbHVlKCk6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy51c2VyVmFsdWU7XG5cdH1cblxuXHRnZXQgY29uZmlndXJlZFdvcmtzcGFjZVZhbHVlKCk6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VWYWx1ZTtcblx0fVxufVxuXG5zdWl0ZSgnQ2hhdFN0YXR1c0Rhc2hib2FyZCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVEYXNoYm9hcmQoZW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSwgb3B0aW9uczoge1xuXHRcdGRhc2hib2FyZE9wdGlvbnM/OiBJQ2hhdFN0YXR1c0Rhc2hib2FyZE9wdGlvbnM7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2U/OiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdFx0YWN0aXZlVGV4dEVkaXRvckxhbmd1YWdlSWQ/OiBzdHJpbmc7XG5cdH0gPSB7fSk6IENoYXRTdGF0dXNEYXNoYm9hcmQge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gb3B0aW9ucy5jb25maWd1cmF0aW9uU2VydmljZTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlID8geyBjb25maWd1cmF0aW9uU2VydmljZTogKCkgPT4gY29uZmlndXJhdGlvblNlcnZpY2UgfSA6IHVuZGVmaW5lZCwgc3RvcmUpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEVudGl0bGVtZW50U2VydmljZSwgZW50aXRsZW1lbnRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U3RhdHVzSXRlbVNlcnZpY2UsIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0c2V0T3JVcGRhdGVFbnRyeTogKCkgPT4geyB9LFxuXHRcdFx0ZGVsZXRlRW50cnk6ICgpID0+IHsgfSxcblx0XHRcdGdldEVudHJpZXM6ICgpID0+IFtdLFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUlubGluZUNvbXBsZXRpb25zU2VydmljZSwge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0b25EaWRDaGFuZ2VJc1Nub296aW5nOiBFdmVudC5Ob25lLFxuXHRcdFx0c25vb3plVGltZUxlZnQ6IDAsXG5cdFx0XHRzbm9vemU6ICgpID0+IHsgfSxcblx0XHRcdHNldFNub296ZUR1cmF0aW9uOiAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRpZiAob3B0aW9ucy5hY3RpdmVUZXh0RWRpdG9yTGFuZ3VhZ2VJZCkge1xuXHRcdFx0Y29uc3QgYWN0aXZlVGV4dEVkaXRvckxhbmd1YWdlSWQgPSBvcHRpb25zLmFjdGl2ZVRleHRFZGl0b3JMYW5ndWFnZUlkO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVRleHRFZGl0b3JMYW5ndWFnZUlkID0gYWN0aXZlVGV4dEVkaXRvckxhbmd1YWdlSWQ7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBkYXNoYm9hcmQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFN0YXR1c0Rhc2hib2FyZCwgb3B0aW9ucy5kYXNoYm9hcmRPcHRpb25zID8/IGRhc2hib2FyZE9wdGlvbnMpKTtcblxuXHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChkYXNoYm9hcmQuZWxlbWVudCk7XG5cdFx0c3RvcmUuYWRkKHsgZGlzcG9zZTogKCkgPT4gZGFzaGJvYXJkLmVsZW1lbnQucmVtb3ZlKCkgfSk7XG5cblx0XHRyZXR1cm4gZGFzaGJvYXJkO1xuXHR9XG5cblx0dGVzdCgncHJlc2VydmVzIGlubGluZSBzdWdnZXN0aW9uIGxhbmd1YWdlIHNldHRpbmcgc3RhdGUgYWNyb3NzIHdyaXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudDtcblx0XHRhc3NlcnQub2soZGVmYXVsdENoYXQpO1xuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbXBsZXRpb25zQ29uZmlndXJhdGlvblNlcnZpY2UoXG5cdFx0XHRkZWZhdWx0Q2hhdC5jb21wbGV0aW9uc0VuYWJsZW1lbnRTZXR0aW5nLFxuXHRcdFx0eyAnKic6IHRydWUsIG1hcmtkb3duOiBmYWxzZSB9LFxuXHRcdFx0eyAnKic6IHRydWUsIG1hcmtkb3duOiBmYWxzZSB9LFxuXHRcdCk7XG5cdFx0Y29uc3QgZGFzaGJvYXJkID0gY3JlYXRlRGFzaGJvYXJkKGNyZWF0ZUVudGl0bGVtZW50U2VydmljZSh7IGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuUHJvIH0pLCB7XG5cdFx0XHRkYXNoYm9hcmRPcHRpb25zOiB7XG5cdFx0XHRcdC4uLmRhc2hib2FyZE9wdGlvbnMsXG5cdFx0XHRcdGRpc2FibGVJbmxpbmVTdWdnZXN0aW9uc1NldHRpbmdzOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdGFjdGl2ZVRleHRFZGl0b3JMYW5ndWFnZUlkOiAnbWFya2Rvd24nLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VDaGVja2JveCA9IGRhc2hib2FyZC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCcuc2V0dGluZ3MgLm1vbmFjby1jaGVja2JveCcpLml0ZW0oMSk7XG5cdFx0Y29uc3Qgb3ZlcnJpZGRlbkhpbnQgPSBkYXNoYm9hcmQuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnNldHRpbmctb3ZlcnJpZGRlbicpO1xuXHRcdGFzc2VydC5vayhsYW5ndWFnZUNoZWNrYm94ICYmIG92ZXJyaWRkZW5IaW50KTtcblx0XHRjb25zdCBnZXRTdGF0ZSA9ICgpID0+ICh7XG5cdFx0XHRhcmlhQ2hlY2tlZDogbGFuZ3VhZ2VDaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpLFxuXHRcdFx0Y2xhc3NOYW1lOiBsYW5ndWFnZUNoZWNrYm94LmNsYXNzTmFtZSxcblx0XHRcdG92ZXJyaWRkZW5IaW50OiBvdmVycmlkZGVuSGludC50ZXh0Q29udGVudCxcblx0XHRcdGNvbmZpZ3VyZWRWYWx1ZTogeyAuLi5jb25maWd1cmF0aW9uU2VydmljZS5jb25maWd1cmVkVmFsdWUgfSxcblx0XHR9KTtcblxuXHRcdGxhbmd1YWdlQ2hlY2tib3guZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdGNvbnN0IHBvaW50ZXJSZXF1ZXN0ZWRTdGF0ZSA9IGdldFN0YXRlKCk7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UuY29tcGxldGVVcGRhdGUoKTtcblx0XHRjb25zdCBwb2ludGVyQ29tbWl0dGVkU3RhdGUgPSBnZXRTdGF0ZSgpO1xuXG5cdFx0Y29uc3Qgc3BhY2VFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlLCBzaGlmdEtleTogdHJ1ZSB9KTtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoc3BhY2VFdmVudCwgJ2tleUNvZGUnLCB7IHZhbHVlOiAzMiB9KTtcblx0XHRsYW5ndWFnZUNoZWNrYm94LmRpc3BhdGNoRXZlbnQoc3BhY2VFdmVudCk7XG5cdFx0Y29uc3Qga2V5Ym9hcmRSZXF1ZXN0ZWRTdGF0ZSA9IGdldFN0YXRlKCk7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UuY29tcGxldGVVcGRhdGUoKTtcblx0XHRjb25zdCBrZXlib2FyZENvbW1pdHRlZFN0YXRlID0gZ2V0U3RhdGUoKTtcblxuXHRcdGxhbmd1YWdlQ2hlY2tib3guZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdGNvbnN0IHBvaW50ZXJVbmNoZWNrZWRSZXF1ZXN0ZWRTdGF0ZSA9IGdldFN0YXRlKCk7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UuY29tcGxldGVVcGRhdGUoKTtcblx0XHRjb25zdCBwb2ludGVyVW5jaGVja2VkQ29tbWl0dGVkU3RhdGUgPSBnZXRTdGF0ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwb2ludGVyUmVxdWVzdGVkOiBwb2ludGVyUmVxdWVzdGVkU3RhdGUsXG5cdFx0XHRwb2ludGVyQ29tbWl0dGVkOiBwb2ludGVyQ29tbWl0dGVkU3RhdGUsXG5cdFx0XHRrZXlib2FyZFJlcXVlc3RlZDoga2V5Ym9hcmRSZXF1ZXN0ZWRTdGF0ZSxcblx0XHRcdGtleWJvYXJkQ29tbWl0dGVkOiBrZXlib2FyZENvbW1pdHRlZFN0YXRlLFxuXHRcdFx0cG9pbnRlclVuY2hlY2tlZFJlcXVlc3RlZDogcG9pbnRlclVuY2hlY2tlZFJlcXVlc3RlZFN0YXRlLFxuXHRcdFx0cG9pbnRlclVuY2hlY2tlZENvbW1pdHRlZDogcG9pbnRlclVuY2hlY2tlZENvbW1pdHRlZFN0YXRlLFxuXHRcdH0sIHtcblx0XHRcdHBvaW50ZXJSZXF1ZXN0ZWQ6IHtcblx0XHRcdFx0YXJpYUNoZWNrZWQ6ICdtaXhlZCcsXG5cdFx0XHRcdGNsYXNzTmFtZTogJ21vbmFjby1jdXN0b20tdG9nZ2xlIG1vbmFjby1jaGVja2JveCBjb2RpY29uIGNvZGljb24tZGFzaCcsXG5cdFx0XHRcdG92ZXJyaWRkZW5IaW50OiAnKG92ZXJyaWRkZW4pJyxcblx0XHRcdFx0Y29uZmlndXJlZFZhbHVlOiB7ICcqJzogdHJ1ZSwgbWFya2Rvd246IGZhbHNlIH0sXG5cdFx0XHR9LFxuXHRcdFx0cG9pbnRlckNvbW1pdHRlZDoge1xuXHRcdFx0XHRhcmlhQ2hlY2tlZDogJ21peGVkJyxcblx0XHRcdFx0Y2xhc3NOYW1lOiAnbW9uYWNvLWN1c3RvbS10b2dnbGUgbW9uYWNvLWNoZWNrYm94IGNvZGljb24gY29kaWNvbi1kYXNoJyxcblx0XHRcdFx0b3ZlcnJpZGRlbkhpbnQ6ICcnLFxuXHRcdFx0XHRjb25maWd1cmVkVmFsdWU6IHsgJyonOiB0cnVlIH0sXG5cdFx0XHR9LFxuXHRcdFx0a2V5Ym9hcmRSZXF1ZXN0ZWQ6IHtcblx0XHRcdFx0YXJpYUNoZWNrZWQ6ICd0cnVlJyxcblx0XHRcdFx0Y2xhc3NOYW1lOiAnbW9uYWNvLWN1c3RvbS10b2dnbGUgbW9uYWNvLWNoZWNrYm94IGNoZWNrZWQgY29kaWNvbiBjb2RpY29uLWNoZWNrJyxcblx0XHRcdFx0b3ZlcnJpZGRlbkhpbnQ6ICcnLFxuXHRcdFx0XHRjb25maWd1cmVkVmFsdWU6IHsgJyonOiB0cnVlIH0sXG5cdFx0XHR9LFxuXHRcdFx0a2V5Ym9hcmRDb21taXR0ZWQ6IHtcblx0XHRcdFx0YXJpYUNoZWNrZWQ6ICd0cnVlJyxcblx0XHRcdFx0Y2xhc3NOYW1lOiAnbW9uYWNvLWN1c3RvbS10b2dnbGUgbW9uYWNvLWNoZWNrYm94IGNoZWNrZWQgY29kaWNvbiBjb2RpY29uLWNoZWNrJyxcblx0XHRcdFx0b3ZlcnJpZGRlbkhpbnQ6ICcnLFxuXHRcdFx0XHRjb25maWd1cmVkVmFsdWU6IHsgJyonOiB0cnVlLCBtYXJrZG93bjogdHJ1ZSB9LFxuXHRcdFx0fSxcblx0XHRcdHBvaW50ZXJVbmNoZWNrZWRSZXF1ZXN0ZWQ6IHtcblx0XHRcdFx0YXJpYUNoZWNrZWQ6ICdmYWxzZScsXG5cdFx0XHRcdGNsYXNzTmFtZTogJ21vbmFjby1jdXN0b20tdG9nZ2xlIG1vbmFjby1jaGVja2JveCcsXG5cdFx0XHRcdG92ZXJyaWRkZW5IaW50OiAnJyxcblx0XHRcdFx0Y29uZmlndXJlZFZhbHVlOiB7ICcqJzogdHJ1ZSwgbWFya2Rvd246IHRydWUgfSxcblx0XHRcdH0sXG5cdFx0XHRwb2ludGVyVW5jaGVja2VkQ29tbWl0dGVkOiB7XG5cdFx0XHRcdGFyaWFDaGVja2VkOiAnZmFsc2UnLFxuXHRcdFx0XHRjbGFzc05hbWU6ICdtb25hY28tY3VzdG9tLXRvZ2dsZSBtb25hY28tY2hlY2tib3gnLFxuXHRcdFx0XHRvdmVycmlkZGVuSGludDogJyhvdmVycmlkZGVuKScsXG5cdFx0XHRcdGNvbmZpZ3VyZWRWYWx1ZTogeyAnKic6IHRydWUsIG1hcmtkb3duOiBmYWxzZSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMzsgaSsrKSB7XG5cdFx0XHRsYW5ndWFnZUNoZWNrYm94LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2NsaWNrJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblx0XHR9XG5cdFx0Y29uc3QgcmFwaWRSZXF1ZXN0ZWRTdGF0ZSA9IGdldFN0YXRlKCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAzOyBpKyspIHtcblx0XHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbXBsZXRlVXBkYXRlKCk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXF1ZXN0ZWQ6IHJhcGlkUmVxdWVzdGVkU3RhdGUsXG5cdFx0XHRjb21taXR0ZWQ6IGdldFN0YXRlKCksXG5cdFx0fSwge1xuXHRcdFx0cmVxdWVzdGVkOiB7XG5cdFx0XHRcdGFyaWFDaGVja2VkOiAnZmFsc2UnLFxuXHRcdFx0XHRjbGFzc05hbWU6ICdtb25hY28tY3VzdG9tLXRvZ2dsZSBtb25hY28tY2hlY2tib3gnLFxuXHRcdFx0XHRvdmVycmlkZGVuSGludDogJyhvdmVycmlkZGVuKScsXG5cdFx0XHRcdGNvbmZpZ3VyZWRWYWx1ZTogeyAnKic6IHRydWUsIG1hcmtkb3duOiBmYWxzZSB9LFxuXHRcdFx0fSxcblx0XHRcdGNvbW1pdHRlZDoge1xuXHRcdFx0XHRhcmlhQ2hlY2tlZDogJ2ZhbHNlJyxcblx0XHRcdFx0Y2xhc3NOYW1lOiAnbW9uYWNvLWN1c3RvbS10b2dnbGUgbW9uYWNvLWNoZWNrYm94Jyxcblx0XHRcdFx0b3ZlcnJpZGRlbkhpbnQ6ICcob3ZlcnJpZGRlbiknLFxuXHRcdFx0XHRjb25maWd1cmVkVmFsdWU6IHsgJyonOiB0cnVlLCBtYXJrZG93bjogZmFsc2UgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZXMgaW5oZXJpdGVkIGxhbmd1YWdlIG92ZXJyaWRlcyBmcm9tIGV2ZXJ5IGNvbmZpZ3VyZWQgc2NvcGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ7XG5cdFx0YXNzZXJ0Lm9rKGRlZmF1bHRDaGF0KTtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb21wbGV0aW9uc0NvbmZpZ3VyYXRpb25TZXJ2aWNlKFxuXHRcdFx0ZGVmYXVsdENoYXQuY29tcGxldGlvbnNFbmFibGVtZW50U2V0dGluZyxcblx0XHRcdHsgJyonOiB0cnVlLCBtYXJrZG93bjogZmFsc2UgfSxcblx0XHRcdHsgJyonOiB0cnVlLCBtYXJrZG93bjogdHJ1ZSB9LFxuXHRcdFx0eyBtYXJrZG93bjogZmFsc2UgfSxcblx0XHQpO1xuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2UoeyBlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlBybyB9KSwge1xuXHRcdFx0ZGFzaGJvYXJkT3B0aW9uczoge1xuXHRcdFx0XHQuLi5kYXNoYm9hcmRPcHRpb25zLFxuXHRcdFx0XHRkaXNhYmxlSW5saW5lU3VnZ2VzdGlvbnNTZXR0aW5nczogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRhY3RpdmVUZXh0RWRpdG9yTGFuZ3VhZ2VJZDogJ21hcmtkb3duJyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGxhbmd1YWdlQ2hlY2tib3ggPSBkYXNoYm9hcmQuZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignLnNldHRpbmdzIC5tb25hY28tY2hlY2tib3gnKS5pdGVtKDEpO1xuXHRcdGNvbnN0IG92ZXJyaWRkZW5IaW50ID0gZGFzaGJvYXJkLmVsZW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5zZXR0aW5nLW92ZXJyaWRkZW4nKTtcblx0XHRhc3NlcnQub2sobGFuZ3VhZ2VDaGVja2JveCAmJiBvdmVycmlkZGVuSGludCk7XG5cblx0XHRsYW5ndWFnZUNoZWNrYm94LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2NsaWNrJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5jb21wbGV0ZVVwZGF0ZSgpO1xuXHRcdGNvbnN0IGludGVybWVkaWF0ZVN0YXRlID0ge1xuXHRcdFx0YXJpYUNoZWNrZWQ6IGxhbmd1YWdlQ2hlY2tib3guZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSxcblx0XHRcdG92ZXJyaWRkZW5IaW50OiBvdmVycmlkZGVuSGludC50ZXh0Q29udGVudCxcblx0XHRcdHVzZXJWYWx1ZTogeyAuLi5jb25maWd1cmF0aW9uU2VydmljZS5jb25maWd1cmVkVmFsdWUgfSxcblx0XHRcdHdvcmtzcGFjZVZhbHVlOiB7IC4uLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZ3VyZWRXb3Jrc3BhY2VWYWx1ZSB9LFxuXHRcdH07XG5cblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5jb21wbGV0ZVVwZGF0ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpbnRlcm1lZGlhdGU6IGludGVybWVkaWF0ZVN0YXRlLFxuXHRcdFx0Y29tbWl0dGVkOiB7XG5cdFx0XHRcdGFyaWFDaGVja2VkOiBsYW5ndWFnZUNoZWNrYm94LmdldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJyksXG5cdFx0XHRcdG92ZXJyaWRkZW5IaW50OiBvdmVycmlkZGVuSGludC50ZXh0Q29udGVudCxcblx0XHRcdFx0dXNlclZhbHVlOiBjb25maWd1cmF0aW9uU2VydmljZS5jb25maWd1cmVkVmFsdWUsXG5cdFx0XHRcdHdvcmtzcGFjZVZhbHVlOiBjb25maWd1cmF0aW9uU2VydmljZS5jb25maWd1cmVkV29ya3NwYWNlVmFsdWUsXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdGludGVybWVkaWF0ZToge1xuXHRcdFx0XHRhcmlhQ2hlY2tlZDogJ21peGVkJyxcblx0XHRcdFx0b3ZlcnJpZGRlbkhpbnQ6ICcob3ZlcnJpZGRlbiknLFxuXHRcdFx0XHR1c2VyVmFsdWU6IHsgJyonOiB0cnVlLCBtYXJrZG93bjogdHJ1ZSB9LFxuXHRcdFx0XHR3b3Jrc3BhY2VWYWx1ZToge30sXG5cdFx0XHR9LFxuXHRcdFx0Y29tbWl0dGVkOiB7XG5cdFx0XHRcdGFyaWFDaGVja2VkOiAnbWl4ZWQnLFxuXHRcdFx0XHRvdmVycmlkZGVuSGludDogJycsXG5cdFx0XHRcdHVzZXJWYWx1ZTogeyAnKic6IHRydWUgfSxcblx0XHRcdFx0d29ya3NwYWNlVmFsdWU6IHt9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgdGhlIG92ZXJyaWRlIGhpbnQgd2hlbiB0aGUgZmluYWwgcXVldWVkIHdyaXRlIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50O1xuXHRcdGFzc2VydC5vayhkZWZhdWx0Q2hhdCk7XG5cblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29tcGxldGlvbnNDb25maWd1cmF0aW9uU2VydmljZShcblx0XHRcdGRlZmF1bHRDaGF0LmNvbXBsZXRpb25zRW5hYmxlbWVudFNldHRpbmcsXG5cdFx0XHR7ICcqJzogdHJ1ZSwgbWFya2Rvd246IGZhbHNlIH0sXG5cdFx0XHR7ICcqJzogdHJ1ZSwgbWFya2Rvd246IGZhbHNlIH0sXG5cdFx0KTtcblx0XHRjb25zdCBkYXNoYm9hcmQgPSBjcmVhdGVEYXNoYm9hcmQoY3JlYXRlRW50aXRsZW1lbnRTZXJ2aWNlKHsgZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Qcm8gfSksIHtcblx0XHRcdGRhc2hib2FyZE9wdGlvbnM6IHtcblx0XHRcdFx0Li4uZGFzaGJvYXJkT3B0aW9ucyxcblx0XHRcdFx0ZGlzYWJsZUlubGluZVN1Z2dlc3Rpb25zU2V0dGluZ3M6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0YWN0aXZlVGV4dEVkaXRvckxhbmd1YWdlSWQ6ICdtYXJrZG93bicsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBsYW5ndWFnZUNoZWNrYm94ID0gZGFzaGJvYXJkLmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJy5zZXR0aW5ncyAubW9uYWNvLWNoZWNrYm94JykuaXRlbSgxKTtcblx0XHRjb25zdCBvdmVycmlkZGVuSGludCA9IGRhc2hib2FyZC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuc2V0dGluZy1vdmVycmlkZGVuJyk7XG5cdFx0YXNzZXJ0Lm9rKGxhbmd1YWdlQ2hlY2tib3ggJiYgb3ZlcnJpZGRlbkhpbnQpO1xuXG5cdFx0bGFuZ3VhZ2VDaGVja2JveC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdjbGljaycsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0bGFuZ3VhZ2VDaGVja2JveC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdjbGljaycsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UuY29tcGxldGVVcGRhdGUoKTtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5mYWlsVXBkYXRlKG5ldyBFcnJvcignVW5hYmxlIHRvIHVwZGF0ZSBjb25maWd1cmF0aW9uJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhcmlhQ2hlY2tlZDogbGFuZ3VhZ2VDaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpLFxuXHRcdFx0b3ZlcnJpZGRlbkhpbnQ6IG92ZXJyaWRkZW5IaW50LnRleHRDb250ZW50LFxuXHRcdFx0Y29uZmlndXJlZFZhbHVlOiBjb25maWd1cmF0aW9uU2VydmljZS5jb25maWd1cmVkVmFsdWUsXG5cdFx0fSwge1xuXHRcdFx0YXJpYUNoZWNrZWQ6ICdtaXhlZCcsXG5cdFx0XHRvdmVycmlkZGVuSGludDogJycsXG5cdFx0XHRjb25maWd1cmVkVmFsdWU6IHsgJyonOiB0cnVlIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBDT1BJTE9UIEZSRUUgLS0tXG5cblx0dGVzdCgnRnJlZSBcdTIwMTQgUFJVOiBzaG93cyBDaGF0IG1lc3NhZ2VzIGFuZCBJbmxpbmUgU3VnZ2VzdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGFzaGJvYXJkID0gY3JlYXRlRGFzaGJvYXJkKGNyZWF0ZUVudGl0bGVtZW50U2VydmljZSh7XG5cdFx0XHRjaGF0OiB7IHBlcmNlbnRSZW1haW5pbmc6IDgwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRjb21wbGV0aW9uczogeyBwZXJjZW50UmVtYWluaW5nOiA3MCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5GcmVlLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UXVvdGFMYWJlbHMoZGFzaGJvYXJkLmVsZW1lbnQpLCBbJ0NoYXQgbWVzc2FnZXMnLCAnSW5saW5lIFN1Z2dlc3Rpb25zJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UXVvdGFWYWx1ZXMoZGFzaGJvYXJkLmVsZW1lbnQpLCBbJzIwJScsICczMCUnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZyZWUgXHUyMDE0IFBSVSBleGhhdXN0ZWQ6IHNob3dzIENoYXQgbWVzc2FnZXMgYW5kIElubGluZSBTdWdnZXN0aW9ucyBhdCAwJScsICgpID0+IHtcblx0XHRjb25zdCBkYXNoYm9hcmQgPSBjcmVhdGVEYXNoYm9hcmQoY3JlYXRlRW50aXRsZW1lbnRTZXJ2aWNlKHtcblx0XHRcdGNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogMCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0Y29tcGxldGlvbnM6IHsgcGVyY2VudFJlbWFpbmluZzogMCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5GcmVlLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UXVvdGFMYWJlbHMoZGFzaGJvYXJkLmVsZW1lbnQpLCBbJ0NoYXQgbWVzc2FnZXMnLCAnSW5saW5lIFN1Z2dlc3Rpb25zJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UXVvdGFWYWx1ZXMoZGFzaGJvYXJkLmVsZW1lbnQpLCBbJzEwMCUnLCAnMTAwJSddKTtcblx0fSk7XG5cblx0dGVzdCgnRnJlZSBcdTIwMTQgVEJCOiBzaG93cyBDcmVkaXRzIGFuZCBJbmxpbmUgU3VnZ2VzdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGFzaGJvYXJkID0gY3JlYXRlRGFzaGJvYXJkKGNyZWF0ZUVudGl0bGVtZW50U2VydmljZSh7XG5cdFx0XHRjaGF0OiB7IHBlcmNlbnRSZW1haW5pbmc6IDgwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRjb21wbGV0aW9uczogeyBwZXJjZW50UmVtYWluaW5nOiA3MCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0dXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUsXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LkZyZWUsXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRRdW90YUxhYmVscyhkYXNoYm9hcmQuZWxlbWVudCksIFsnQ3JlZGl0cycsICdJbmxpbmUgU3VnZ2VzdGlvbnMnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRRdW90YVZhbHVlcyhkYXNoYm9hcmQuZWxlbWVudCksIFsnMjAlJywgJzMwJSddKTtcblx0fSk7XG5cblx0dGVzdCgnRnJlZSBcdTIwMTQgVEJCIGV4aGF1c3RlZDogc2hvd3MgQ3JlZGl0cyBhbmQgSW5saW5lIFN1Z2dlc3Rpb25zIGF0IDAlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uoe1xuXHRcdFx0Y2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiAwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRjb21wbGV0aW9uczogeyBwZXJjZW50UmVtYWluaW5nOiAwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHR1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuRnJlZSxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFF1b3RhTGFiZWxzKGRhc2hib2FyZC5lbGVtZW50KSwgWydDcmVkaXRzJywgJ0lubGluZSBTdWdnZXN0aW9ucyddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFF1b3RhVmFsdWVzKGRhc2hib2FyZC5lbGVtZW50KSwgWycxMDAlJywgJzEwMCUnXSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBDT1BJTE9UIFBSTyAoRURVL1BybykgLS0tXG5cblx0dGVzdCgnRURVL1BybyBcdTIwMTQgUFJVOiBzaG93cyBDaGF0IG1lc3NhZ2VzLCBQcmVtaXVtIHJlcXVlc3RzLCBhbmQgSW5saW5lIFN1Z2dlc3Rpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uoe1xuXHRcdFx0Y2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiA4MCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0cHJlbWl1bUNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogNjAsIHVubGltaXRlZDogZmFsc2UgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDkwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlBybyxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFF1b3RhTGFiZWxzKGRhc2hib2FyZC5lbGVtZW50KSwgWydDaGF0IG1lc3NhZ2VzJywgJ1ByZW1pdW0gcmVxdWVzdHMnLCAnSW5saW5lIFN1Z2dlc3Rpb25zJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdFRFUvUHJvIFx1MjAxNCBUQkI6IHNob3dzIG9ubHkgQ3JlZGl0cywgbm90IENoYXQgbWVzc2FnZXMgb3IgSW5saW5lIFN1Z2dlc3Rpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uoe1xuXHRcdFx0Y2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiA4MCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0cHJlbWl1bUNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogNjAsIHVubGltaXRlZDogZmFsc2UsIHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlIH0sXG5cdFx0XHRjb21wbGV0aW9uczogeyBwZXJjZW50UmVtYWluaW5nOiA5MCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Qcm8sXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRRdW90YUxhYmVscyhkYXNoYm9hcmQuZWxlbWVudCksIFsnQ3JlZGl0cyddKTtcblx0fSk7XG5cblx0dGVzdCgnRURVL1BybyBcdTIwMTQgVEJCIGV4aGF1c3RlZCAobm8gb3ZlcmFnZXMpOiBzaG93cyBvbmx5IENyZWRpdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGFzaGJvYXJkID0gY3JlYXRlRGFzaGJvYXJkKGNyZWF0ZUVudGl0bGVtZW50U2VydmljZSh7XG5cdFx0XHRjaGF0OiB7IHBlcmNlbnRSZW1haW5pbmc6IDAsIHVubGltaXRlZDogZmFsc2UgfSxcblx0XHRcdHByZW1pdW1DaGF0OiB7IHBlcmNlbnRSZW1haW5pbmc6IDAsIHVubGltaXRlZDogZmFsc2UsIHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlIH0sXG5cdFx0XHRjb21wbGV0aW9uczogeyBwZXJjZW50UmVtYWluaW5nOiA5MCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0YWRkaXRpb25hbFVzYWdlRW5hYmxlZDogZmFsc2UsXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlBybyxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFF1b3RhTGFiZWxzKGRhc2hib2FyZC5lbGVtZW50KSwgWydDcmVkaXRzJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UXVvdGFWYWx1ZXMoZGFzaGJvYXJkLmVsZW1lbnQpLCBbJzEwMCUnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VEVS9Qcm8gXHUyMDE0IFRCQiBleGhhdXN0ZWQgKHdpdGggb3ZlcmFnZXMpOiBzaG93cyBvbmx5IENyZWRpdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGFzaGJvYXJkID0gY3JlYXRlRGFzaGJvYXJkKGNyZWF0ZUVudGl0bGVtZW50U2VydmljZSh7XG5cdFx0XHRjaGF0OiB7IHBlcmNlbnRSZW1haW5pbmc6IDAsIHVubGltaXRlZDogZmFsc2UgfSxcblx0XHRcdHByZW1pdW1DaGF0OiB7IHBlcmNlbnRSZW1haW5pbmc6IDAsIHVubGltaXRlZDogZmFsc2UsIHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlIH0sXG5cdFx0XHRjb21wbGV0aW9uczogeyBwZXJjZW50UmVtYWluaW5nOiA5MCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0YWRkaXRpb25hbFVzYWdlRW5hYmxlZDogdHJ1ZSxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuUHJvLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UXVvdGFMYWJlbHMoZGFzaGJvYXJkLmVsZW1lbnQpLCBbJ0NyZWRpdHMnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRRdW90YVZhbHVlcyhkYXNoYm9hcmQuZWxlbWVudCksIFsnMTAwJSddKTtcblx0fSk7XG5cblx0Ly8gLS0tIENPUElMT1QgUFJPKyAtLS1cblxuXHR0ZXN0KCdQcm8rIFx1MjAxNCBQUlU6IHNob3dzIFByZW1pdW0gcmVxdWVzdHMgYW5kIElubGluZSBTdWdnZXN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBkYXNoYm9hcmQgPSBjcmVhdGVEYXNoYm9hcmQoY3JlYXRlRW50aXRsZW1lbnRTZXJ2aWNlKHtcblx0XHRcdHByZW1pdW1DaGF0OiB7IHBlcmNlbnRSZW1haW5pbmc6IDYwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRjb21wbGV0aW9uczogeyBwZXJjZW50UmVtYWluaW5nOiA5MCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Qcm9QbHVzLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UXVvdGFMYWJlbHMoZGFzaGJvYXJkLmVsZW1lbnQpLCBbJ1ByZW1pdW0gcmVxdWVzdHMnLCAnSW5saW5lIFN1Z2dlc3Rpb25zJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdQcm8rIFx1MjAxNCBUQkIgd2l0aCBxdW90YTogc2hvd3Mgb25seSBDcmVkaXRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uoe1xuXHRcdFx0Y2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiA4MCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0cHJlbWl1bUNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogNjAsIHVubGltaXRlZDogZmFsc2UsIHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlIH0sXG5cdFx0XHRjb21wbGV0aW9uczogeyBwZXJjZW50UmVtYWluaW5nOiA5MCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Qcm9QbHVzLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UXVvdGFMYWJlbHMoZGFzaGJvYXJkLmVsZW1lbnQpLCBbJ0NyZWRpdHMnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1BybysgXHUyMDE0IFRCQiBvdXQgb2YgcXVvdGE6IHNob3dzIG9ubHkgQ3JlZGl0cycsICgpID0+IHtcblx0XHRjb25zdCBkYXNoYm9hcmQgPSBjcmVhdGVEYXNoYm9hcmQoY3JlYXRlRW50aXRsZW1lbnRTZXJ2aWNlKHtcblx0XHRcdGNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogMCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0cHJlbWl1bUNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogMCwgdW5saW1pdGVkOiBmYWxzZSwgdXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDkwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlByb1BsdXMsXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRRdW90YUxhYmVscyhkYXNoYm9hcmQuZWxlbWVudCksIFsnQ3JlZGl0cyddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFF1b3RhVmFsdWVzKGRhc2hib2FyZC5lbGVtZW50KSwgWycxMDAlJ10pO1xuXHR9KTtcblxuXHQvLyAtLS0gQ09QSUxPVCBNQVggLS0tXG5cblx0dGVzdCgnTWF4IFllYXJseSBcdTIwMTQgbm8gVEJCOiBzaG93cyB1bmxpbWl0ZWQgUHJlbWl1bSBSZXF1ZXN0cyBpbmNsdWRlZCBpbmRpY2F0b3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGFzaGJvYXJkID0gY3JlYXRlRGFzaGJvYXJkKGNyZWF0ZUVudGl0bGVtZW50U2VydmljZSh7XG5cdFx0XHRwcmVtaXVtQ2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiAxMDAsIHVubGltaXRlZDogdHJ1ZSB9LFxuXHRcdFx0Y29tcGxldGlvbnM6IHsgcGVyY2VudFJlbWFpbmluZzogMTAwLCB1bmxpbWl0ZWQ6IHRydWUgfSxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuTWF4LFxuXHRcdH0pKTtcblxuXHRcdC8vIFVubGltaXRlZCBxdW90YXMgYXJlIG5vdCBzaG93biBhcyBxdW90YSBpbmRpY2F0b3JzXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRRdW90YUxhYmVscyhkYXNoYm9hcmQuZWxlbWVudCksIFtdKTtcblx0XHQvLyBJbnN0ZWFkIHNob3duIGFzIFwiaW5jbHVkZWRcIiBpbmRpY2F0b3Jcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEluY2x1ZGVkTGFiZWxzKGRhc2hib2FyZC5lbGVtZW50KSwgWydQcmVtaXVtIFJlcXVlc3RzJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdNYXggTW9udGhseSBcdTIwMTQgVEJCOiBzaG93cyB1bmxpbWl0ZWQgQ3JlZGl0cyBpbmNsdWRlZCBpbmRpY2F0b3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGFzaGJvYXJkID0gY3JlYXRlRGFzaGJvYXJkKGNyZWF0ZUVudGl0bGVtZW50U2VydmljZSh7XG5cdFx0XHRwcmVtaXVtQ2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiAxMDAsIHVubGltaXRlZDogdHJ1ZSwgdXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDEwMCwgdW5saW1pdGVkOiB0cnVlIH0sXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50Lk1heCxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFF1b3RhTGFiZWxzKGRhc2hib2FyZC5lbGVtZW50KSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0SW5jbHVkZWRMYWJlbHMoZGFzaGJvYXJkLmVsZW1lbnQpLCBbJ0NyZWRpdHMnXSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBCVVNJTkVTUyAvIEVOVEVSUFJJU0UgLS0tXG5cblx0dGVzdCgnRW50ZXJwcmlzZSBNYW5hZ2VkIFx1MjAxNCBQUlU6IHNob3dzIFByZW1pdW0gcmVxdWVzdHMgd2l0aCB1bmxpbWl0ZWQgaW5jbHVkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGFzaGJvYXJkID0gY3JlYXRlRGFzaGJvYXJkKGNyZWF0ZUVudGl0bGVtZW50U2VydmljZSh7XG5cdFx0XHRwcmVtaXVtQ2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiAxMDAsIHVubGltaXRlZDogdHJ1ZSB9LFxuXHRcdFx0Y29tcGxldGlvbnM6IHsgcGVyY2VudFJlbWFpbmluZzogMTAwLCB1bmxpbWl0ZWQ6IHRydWUgfSxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuQnVzaW5lc3MsXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRRdW90YUxhYmVscyhkYXNoYm9hcmQuZWxlbWVudCksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEluY2x1ZGVkTGFiZWxzKGRhc2hib2FyZC5lbGVtZW50KSwgWydQcmVtaXVtIFJlcXVlc3RzJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0SW5jbHVkZWREZXNjcmlwdGlvbnMoZGFzaGJvYXJkLmVsZW1lbnQpLCBbJ0luY2x1ZGVkIHdpdGggeW91ciBvcmdhbml6YXRpb25cXCdzIHBsYW4uJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnRlcnByaXNlIE1hbmFnZWQgXHUyMDE0IFBSVSB3aXRoIGNyZWRpdHMgdXNlZDogc2hvd3MgY29uc3VtZWQgY3JlZGl0cyB3aXRoIHJlc2V0IHRpbWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzZXRBdCA9IE1hdGguZmxvb3IoRGF0ZS5VVEMoMjAyNiwgNiwgNSwgMTQsIDAsIDApIC8gMTAwMCk7XG5cdFx0Y29uc3QgZGFzaGJvYXJkID0gY3JlYXRlRGFzaGJvYXJkKGNyZWF0ZUVudGl0bGVtZW50U2VydmljZSh7XG5cdFx0XHRwcmVtaXVtQ2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiAxMDAsIHVubGltaXRlZDogdHJ1ZSwgY3JlZGl0c1VzZWQ6IDEyODQsIHJlc2V0QXQgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDEwMCwgdW5saW1pdGVkOiB0cnVlIH0sXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LkJ1c2luZXNzLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNyZWRpdHMgPSBnZXRDcmVkaXRzVXNlZChkYXNoYm9hcmQuZWxlbWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWRpdHM/LnZhbHVlLCAnMSwyODQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlZGl0cz8uc3VmZml4LCAnQ3JlZGl0cyBVc2VkJyk7XG5cdFx0YXNzZXJ0Lm9rKGNyZWRpdHM/LnJlc2V0LnN0YXJ0c1dpdGgoJ1Jlc2V0cyBKdWwgNSBhdCAnKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRJbmNsdWRlZExhYmVscyhkYXNoYm9hcmQuZWxlbWVudCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnRW50ZXJwcmlzZSBNYW5hZ2VkIFx1MjAxNCBQUlUgd2l0aCBjcmVkaXRzIHVzZWQgKGNvbXBhY3QpOiBzaG93cyBwbGFuIHRpdGxlLCBjcmVkaXRzIGFuZCByZXNldCcsICgpID0+IHtcblx0XHRjb25zdCByZXNldEF0ID0gTWF0aC5mbG9vcihEYXRlLlVUQygyMDI2LCA0LCAzMSwgMjEsIDAsIDApIC8gMTAwMCk7XG5cdFx0Y29uc3QgZGFzaGJvYXJkID0gY3JlYXRlRGFzaGJvYXJkKGNyZWF0ZUVudGl0bGVtZW50U2VydmljZSh7XG5cdFx0XHRwcmVtaXVtQ2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiAxMDAsIHVubGltaXRlZDogdHJ1ZSwgY3JlZGl0c1VzZWQ6IDEyODQsIHJlc2V0QXQgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDEwMCwgdW5saW1pdGVkOiB0cnVlIH0sXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LkJ1c2luZXNzLFxuXHRcdH0pLCB7IGRhc2hib2FyZE9wdGlvbnM6IHsgLi4uZGFzaGJvYXJkT3B0aW9ucywgY29tcGFjdFF1b3RhTGF5b3V0OiB0cnVlIH0gfSk7XG5cblx0XHRjb25zdCBpbmRpY2F0b3IgPSBkYXNoYm9hcmQuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcucXVvdGEtaW5kaWNhdG9yLmNyZWRpdHMtdXNlZCcpO1xuXHRcdGNvbnN0IGNyZWRpdHMgPSBnZXRDcmVkaXRzVXNlZChkYXNoYm9hcmQuZWxlbWVudCk7XG5cdFx0YXNzZXJ0Lm9rKGluZGljYXRvcj8uY2xhc3NMaXN0LmNvbnRhaW5zKCdjb21wYWN0JykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmRpY2F0b3I/LnF1ZXJ5U2VsZWN0b3IoJy5xdW90YS10aXRsZScpPy50ZXh0Q29udGVudCwgJ0NvcGlsb3QgQnVzaW5lc3MnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlZGl0cz8udmFsdWUsICcxLDI4NCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVkaXRzPy5zdWZmaXgsICdDcmVkaXRzIHVzZWQnKTtcblx0XHRhc3NlcnQub2soY3JlZGl0cz8ucmVzZXQuc3RhcnRzV2l0aCgnUmVzZXRzIE1heSAzMSBhdCAnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0J1c2luZXNzIFx1MjAxNCBwb29sZWQgZXhoYXVzdGVkIChubyBvdmVyYWdlcyk6IHNob3dzIGV4aGF1c3RlZCBpbmRpY2F0b3IgYW5kIGNhbGxvdXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGFzaGJvYXJkID0gY3JlYXRlRGFzaGJvYXJkKGNyZWF0ZUVudGl0bGVtZW50U2VydmljZSh7XG5cdFx0XHRwcmVtaXVtQ2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiAwLCB1bmxpbWl0ZWQ6IHRydWUsIGhhc1F1b3RhOiBmYWxzZSB9LFxuXHRcdFx0Y29tcGxldGlvbnM6IHsgcGVyY2VudFJlbWFpbmluZzogMTAwLCB1bmxpbWl0ZWQ6IHRydWUgfSxcblx0XHRcdGFkZGl0aW9uYWxVc2FnZUVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5CdXNpbmVzcyxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEluY2x1ZGVkTGFiZWxzKGRhc2hib2FyZC5lbGVtZW50KSwgWydQcmVtaXVtIFJlcXVlc3RzJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0SW5jbHVkZWREZXNjcmlwdGlvbnMoZGFzaGJvYXJkLmVsZW1lbnQpLCBbJ09yZ2FuaXphdGlvbiBsaW1pdCByZWFjaGVkLiddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2FsbG91dFRleHQoZGFzaGJvYXJkLmVsZW1lbnQpLCAnWW91ciBvcmdhbml6YXRpb24gb3IgZW50ZXJwcmlzZSBoYXMgZXhjZWVkZWQgaXRzIENvcGlsb3QgYnVkZ2V0LiBDb250YWN0IHlvdXIgYWRtaW4gdG8gcmVzdW1lIHVzYWdlLicpO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnRlcnByaXNlIFx1MjAxNCBwb29sZWQgZXhoYXVzdGVkIChubyBvdmVyYWdlcyk6IHNob3dzIGV4aGF1c3RlZCBpbmRpY2F0b3IgYW5kIGVudGVycHJpc2UgY2FsbG91dCcsICgpID0+IHtcblx0XHRjb25zdCBkYXNoYm9hcmQgPSBjcmVhdGVEYXNoYm9hcmQoY3JlYXRlRW50aXRsZW1lbnRTZXJ2aWNlKHtcblx0XHRcdHByZW1pdW1DaGF0OiB7IHBlcmNlbnRSZW1haW5pbmc6IDAsIHVubGltaXRlZDogdHJ1ZSwgaGFzUXVvdGE6IGZhbHNlIH0sXG5cdFx0XHRjb21wbGV0aW9uczogeyBwZXJjZW50UmVtYWluaW5nOiAxMDAsIHVubGltaXRlZDogdHJ1ZSB9LFxuXHRcdFx0YWRkaXRpb25hbFVzYWdlRW5hYmxlZDogZmFsc2UsXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LkVudGVycHJpc2UsXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRJbmNsdWRlZExhYmVscyhkYXNoYm9hcmQuZWxlbWVudCksIFsnUHJlbWl1bSBSZXF1ZXN0cyddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEluY2x1ZGVkRGVzY3JpcHRpb25zKGRhc2hib2FyZC5lbGVtZW50KSwgWydPcmdhbml6YXRpb24gbGltaXQgcmVhY2hlZC4nXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENhbGxvdXRUZXh0KGRhc2hib2FyZC5lbGVtZW50KSwgJ1lvdXIgb3JnYW5pemF0aW9uIG9yIGVudGVycHJpc2UgaGFzIGV4Y2VlZGVkIGl0cyBDb3BpbG90IGJ1ZGdldC4gQ29udGFjdCB5b3VyIGFkbWluIHRvIHJlc3VtZSB1c2FnZS4nKTtcblx0fSk7XG5cblx0dGVzdCgnRW50ZXJwcmlzZSBcdTIwMTQgcG9vbGVkIGV4aGF1c3RlZCBUQkIgKG5vIG92ZXJhZ2VzKTogc2hvd3MgQ3JlZGl0cyBleGhhdXN0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGFzaGJvYXJkID0gY3JlYXRlRGFzaGJvYXJkKGNyZWF0ZUVudGl0bGVtZW50U2VydmljZSh7XG5cdFx0XHRwcmVtaXVtQ2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiAwLCB1bmxpbWl0ZWQ6IHRydWUsIHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLCBoYXNRdW90YTogZmFsc2UgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDEwMCwgdW5saW1pdGVkOiB0cnVlIH0sXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiBmYWxzZSxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuRW50ZXJwcmlzZSxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEluY2x1ZGVkTGFiZWxzKGRhc2hib2FyZC5lbGVtZW50KSwgWydDcmVkaXRzJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0SW5jbHVkZWREZXNjcmlwdGlvbnMoZGFzaGJvYXJkLmVsZW1lbnQpLCBbJ09yZ2FuaXphdGlvbiBsaW1pdCByZWFjaGVkLiddKTtcblx0fSk7XG5cblx0dGVzdCgnRW50ZXJwcmlzZSBcdTIwMTQgcG9vbGVkIGV4aGF1c3RlZCBidXQgb3ZlcmFnZXMgZW5hYmxlZDogc2hvd3MgYnVkZ2V0IGV4Y2VlZGVkIChoYXNRdW90YT1mYWxzZSBvdmVycmlkZXMgb3ZlcmFnZXMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uoe1xuXHRcdFx0cHJlbWl1bUNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogMCwgdW5saW1pdGVkOiB0cnVlLCBoYXNRdW90YTogZmFsc2UgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDEwMCwgdW5saW1pdGVkOiB0cnVlIH0sXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiB0cnVlLFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5FbnRlcnByaXNlLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0SW5jbHVkZWRMYWJlbHMoZGFzaGJvYXJkLmVsZW1lbnQpLCBbJ1ByZW1pdW0gUmVxdWVzdHMnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRJbmNsdWRlZERlc2NyaXB0aW9ucyhkYXNoYm9hcmQuZWxlbWVudCksIFsnT3JnYW5pemF0aW9uIGxpbWl0IHJlYWNoZWQuJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDYWxsb3V0VGV4dChkYXNoYm9hcmQuZWxlbWVudCksICdZb3VyIG9yZ2FuaXphdGlvbiBvciBlbnRlcnByaXNlIGhhcyBleGNlZWRlZCBpdHMgQ29waWxvdCBidWRnZXQuIENvbnRhY3QgeW91ciBhZG1pbiB0byByZXN1bWUgdXNhZ2UuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VudGVycHJpc2UgXHUyMDE0IFRCQiAobXVsdGktcXVvdGEpOiBzaG93cyBvbmx5IENyZWRpdHMsIG5vdCBDaGF0IG1lc3NhZ2VzIG9yIElubGluZSBTdWdnZXN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBkYXNoYm9hcmQgPSBjcmVhdGVEYXNoYm9hcmQoY3JlYXRlRW50aXRsZW1lbnRTZXJ2aWNlKHtcblx0XHRcdGNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogODAsIHVubGltaXRlZDogZmFsc2UgfSxcblx0XHRcdHByZW1pdW1DaGF0OiB7IHBlcmNlbnRSZW1haW5pbmc6IDYwLCB1bmxpbWl0ZWQ6IGZhbHNlLCB1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSB9LFxuXHRcdFx0Y29tcGxldGlvbnM6IHsgcGVyY2VudFJlbWFpbmluZzogNzAsIHVubGltaXRlZDogZmFsc2UgfSxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuRW50ZXJwcmlzZSxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFF1b3RhTGFiZWxzKGRhc2hib2FyZC5lbGVtZW50KSwgWydDcmVkaXRzJ10pO1xuXHR9KTtcblxuXHQvLyAtLS0gSE9WRVI6IENSRURJVCBGUkFDVElPTlMgLS0tXG5cblx0dGVzdCgnSG92ZXIgc2hvd3MgY3JlZGl0IGZyYWN0aW9ucyB3aGVuIGVudGl0bGVtZW50IGlzIGF2YWlsYWJsZScsICgpID0+IHtcblx0XHRjb25zdCBkYXNoYm9hcmQgPSBjcmVhdGVEYXNoYm9hcmQoY3JlYXRlRW50aXRsZW1lbnRTZXJ2aWNlKHtcblx0XHRcdGNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogODAsIHVubGltaXRlZDogZmFsc2UsIGVudGl0bGVtZW50OiAyMDAwIH0sXG5cdFx0XHRjb21wbGV0aW9uczogeyBwZXJjZW50UmVtYWluaW5nOiA3MCwgdW5saW1pdGVkOiBmYWxzZSwgZW50aXRsZW1lbnQ6IDUwMDAgfSxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuRnJlZSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBxdW90YVBlcmNlbnRhZ2VzID0gZGFzaGJvYXJkLmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnF1b3RhLWluZGljYXRvcjpub3QoLmluY2x1ZGVkKSAucXVvdGEtcGVyY2VudGFnZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YVBlcmNlbnRhZ2VzLmxlbmd0aCwgMik7XG5cblx0XHQvLyBCZWZvcmUgaG92ZXI6IHNob3dzIHBlcmNlbnRhZ2VzXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRRdW90YVZhbHVlcyhkYXNoYm9hcmQuZWxlbWVudCksIFsnMjAlJywgJzMwJSddKTtcblxuXHRcdC8vIEhvdmVyOiBzaG93cyBjcmVkaXQgZnJhY3Rpb25zXG5cdFx0cXVvdGFQZXJjZW50YWdlc1swXS5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWVudGVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblx0XHRjb25zdCBjaGF0VmFsdWUgPSBxdW90YVBlcmNlbnRhZ2VzWzBdLnF1ZXJ5U2VsZWN0b3IoJy5xdW90YS12YWx1ZScpO1xuXHRcdGFzc2VydC5vayhjaGF0VmFsdWU/LnRleHRDb250ZW50Py5pbmNsdWRlcygnLycpKTtcblxuXHRcdC8vIE1vdXNlIGxlYXZlOiByZXZlcnRzIHRvIHBlcmNlbnRhZ2Vcblx0XHRxdW90YVBlcmNlbnRhZ2VzWzBdLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlbGVhdmUnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UXVvdGFWYWx1ZXMoZGFzaGJvYXJkLmVsZW1lbnQpLCBbJzIwJScsICczMCUnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0hvdmVyIGlzIGEgbm8tb3Agd2hlbiBlbnRpdGxlbWVudCBpcyBub3QgYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uoe1xuXHRcdFx0Y2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiA4MCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0Y29tcGxldGlvbnM6IHsgcGVyY2VudFJlbWFpbmluZzogNzAsIHVubGltaXRlZDogZmFsc2UgfSxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuRnJlZSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBxdW90YVBlcmNlbnRhZ2VzID0gZGFzaGJvYXJkLmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnF1b3RhLWluZGljYXRvcjpub3QoLmluY2x1ZGVkKSAucXVvdGEtcGVyY2VudGFnZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YVBlcmNlbnRhZ2VzLmxlbmd0aCwgMik7XG5cblx0XHQvLyBCZWZvcmUgaG92ZXI6IHNob3dzIHBlcmNlbnRhZ2VzXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRRdW90YVZhbHVlcyhkYXNoYm9hcmQuZWxlbWVudCksIFsnMjAlJywgJzMwJSddKTtcblxuXHRcdC8vIEhvdmVyOiBzdGlsbCBzaG93cyBwZXJjZW50YWdlcyAobm8gZW50aXRsZW1lbnQgZGF0YSlcblx0XHRxdW90YVBlcmNlbnRhZ2VzWzBdLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZW50ZXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UXVvdGFWYWx1ZXMoZGFzaGJvYXJkLmVsZW1lbnQpLCBbJzIwJScsICczMCUnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZvY3VzIHNob3dzIGNyZWRpdCBmcmFjdGlvbnMgKGtleWJvYXJkIGFjY2Vzc2liaWxpdHkpJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uoe1xuXHRcdFx0Y2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiA4MCwgdW5saW1pdGVkOiBmYWxzZSwgZW50aXRsZW1lbnQ6IDIwMDAgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDcwLCB1bmxpbWl0ZWQ6IGZhbHNlLCBlbnRpdGxlbWVudDogNTAwMCB9LFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5GcmVlLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHF1b3RhUGVyY2VudGFnZXMgPSBkYXNoYm9hcmQuZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucXVvdGEtaW5kaWNhdG9yOm5vdCguaW5jbHVkZWQpIC5xdW90YS1wZXJjZW50YWdlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1b3RhUGVyY2VudGFnZXMubGVuZ3RoLCAyKTtcblxuXHRcdC8vIEJlZm9yZSBmb2N1czogc2hvd3MgcGVyY2VudGFnZXNcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFF1b3RhVmFsdWVzKGRhc2hib2FyZC5lbGVtZW50KSwgWycyMCUnLCAnMzAlJ10pO1xuXG5cdFx0Ly8gRm9jdXM6IHNob3dzIGNyZWRpdCBmcmFjdGlvbnNcblx0XHRxdW90YVBlcmNlbnRhZ2VzWzBdLmRpc3BhdGNoRXZlbnQobmV3IEZvY3VzRXZlbnQoJ2ZvY3VzJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblx0XHRjb25zdCBjaGF0VmFsdWUgPSBxdW90YVBlcmNlbnRhZ2VzWzBdLnF1ZXJ5U2VsZWN0b3IoJy5xdW90YS12YWx1ZScpO1xuXHRcdGFzc2VydC5vayhjaGF0VmFsdWU/LnRleHRDb250ZW50Py5pbmNsdWRlcygnLycpKTtcblxuXHRcdC8vIEJsdXI6IHJldmVydHMgdG8gcGVyY2VudGFnZVxuXHRcdHF1b3RhUGVyY2VudGFnZXNbMF0uZGlzcGF0Y2hFdmVudChuZXcgRm9jdXNFdmVudCgnYmx1cicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRRdW90YVZhbHVlcyhkYXNoYm9hcmQuZWxlbWVudCksIFsnMjAlJywgJzMwJSddKTtcblx0fSk7XG5cblx0dGVzdCgnSG92ZXIgaXMgYSBuby1vcCB3aGVuIGVudGl0bGVtZW50IGlzIHplcm8nLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGFzaGJvYXJkID0gY3JlYXRlRGFzaGJvYXJkKGNyZWF0ZUVudGl0bGVtZW50U2VydmljZSh7XG5cdFx0XHRwcmVtaXVtQ2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiAwLCB1bmxpbWl0ZWQ6IGZhbHNlLCB1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSwgZW50aXRsZW1lbnQ6IDAgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDcwLCB1bmxpbWl0ZWQ6IGZhbHNlLCBlbnRpdGxlbWVudDogMCB9LFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5GcmVlLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHF1b3RhUGVyY2VudGFnZXMgPSBkYXNoYm9hcmQuZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucXVvdGEtaW5kaWNhdG9yOm5vdCguaW5jbHVkZWQpIC5xdW90YS1wZXJjZW50YWdlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1b3RhUGVyY2VudGFnZXMubGVuZ3RoLCAyKTtcblxuXHRcdC8vIEJlZm9yZSBob3Zlcjogc2hvd3MgcGVyY2VudGFnZXNcblx0XHRjb25zdCB2YWx1ZXNCZWZvcmUgPSBnZXRRdW90YVZhbHVlcyhkYXNoYm9hcmQuZWxlbWVudCk7XG5cblx0XHQvLyBIb3Zlcjogc3RpbGwgc2hvd3MgcGVyY2VudGFnZXMgKGVudGl0bGVtZW50IGlzIDAsIG5vIG1lYW5pbmdmdWwgdG90YWwpXG5cdFx0cXVvdGFQZXJjZW50YWdlc1swXS5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWVudGVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFF1b3RhVmFsdWVzKGRhc2hib2FyZC5lbGVtZW50KSwgdmFsdWVzQmVmb3JlKTtcblx0fSk7XG5cblx0dGVzdCgnUXVvdGEgcGVyY2VudGFnZSBlbGVtZW50IGlzIGtleWJvYXJkLWZvY3VzYWJsZScsICgpID0+IHtcblx0XHRjb25zdCBkYXNoYm9hcmQgPSBjcmVhdGVEYXNoYm9hcmQoY3JlYXRlRW50aXRsZW1lbnRTZXJ2aWNlKHtcblx0XHRcdGNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogODAsIHVubGltaXRlZDogZmFsc2UsIGVudGl0bGVtZW50OiAyMDAwIH0sXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LkZyZWUsXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcXVvdGFQZXJjZW50YWdlID0gZGFzaGJvYXJkLmVsZW1lbnQucXVlcnlTZWxlY3RvcignLnF1b3RhLWluZGljYXRvcjpub3QoLmluY2x1ZGVkKSAucXVvdGEtcGVyY2VudGFnZScpIGFzIEhUTUxFbGVtZW50O1xuXHRcdGFzc2VydC5vayhxdW90YVBlcmNlbnRhZ2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YVBlcmNlbnRhZ2UudGFiSW5kZXgsIDApO1xuXHR9KTtcblxuXHQvLyAtLS0gQ0FMTE9VVCBNRVNTQUdFUyAtLS1cblxuXHR0ZXN0KCdDYWxsb3V0OiBubyBjYWxsb3V0IHdoZW4gcXVvdGEgaXMgbm90IGFwcHJvYWNoaW5nIGxpbWl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uoe1xuXHRcdFx0cHJlbWl1bUNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogNTAsIHVubGltaXRlZDogZmFsc2UgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDkwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiB0cnVlLFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Qcm8sXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENhbGxvdXRUZXh0KGRhc2hib2FyZC5lbGVtZW50KSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NhbGxvdXQ6IFBSVSBcdTIwMTQgc2hvd3MgYXBwcm9hY2hpbmcgbWVzc2FnZSB3aXRoIGJ1ZGdldCB3b3JkaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uoe1xuXHRcdFx0cHJlbWl1bUNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogMjAsIHVubGltaXRlZDogZmFsc2UgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDkwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiB0cnVlLFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Qcm8sXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENhbGxvdXRUZXh0KGRhc2hib2FyZC5lbGVtZW50KSwgJ09uY2UgdGhlIGxpbWl0IGlzIHJlYWNoZWQsIHByZW1pdW0gcmVxdWVzdCBidWRnZXQgd2lsbCBiZSB1c2VkLicpO1xuXHR9KTtcblxuXHR0ZXN0KCdDYWxsb3V0OiBVQkIgXHUyMDE0IHNob3dzIGFwcHJvYWNoaW5nIG1lc3NhZ2Ugd2l0aCBhZGRpdGlvbmFsIHNwZW5kIHdvcmRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGFzaGJvYXJkID0gY3JlYXRlRGFzaGJvYXJkKGNyZWF0ZUVudGl0bGVtZW50U2VydmljZSh7XG5cdFx0XHRwcmVtaXVtQ2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiAyMCwgdW5saW1pdGVkOiBmYWxzZSwgdXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDkwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiB0cnVlLFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Qcm8sXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENhbGxvdXRUZXh0KGRhc2hib2FyZC5lbGVtZW50KSwgJ09uY2UgdGhlIGxpbWl0IGlzIHJlYWNoZWQsIGFkZGl0aW9uYWwgYnVkZ2V0IHdpbGwgYmUgdXNlZC4nKTtcblx0fSk7XG5cblx0dGVzdCgnQ2FsbG91dDogc2hvd3MgcGF1c2VkIHdoZW4gcXVvdGEgZXhoYXVzdGVkIGFuZCBvdmVyYWdlIG5vdCBwZXJtaXR0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGFzaGJvYXJkID0gY3JlYXRlRGFzaGJvYXJkKGNyZWF0ZUVudGl0bGVtZW50U2VydmljZSh7XG5cdFx0XHRwcmVtaXVtQ2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiAwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRjb21wbGV0aW9uczogeyBwZXJjZW50UmVtYWluaW5nOiA5MCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0YWRkaXRpb25hbFVzYWdlRW5hYmxlZDogZmFsc2UsXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlBybyxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2FsbG91dFRleHQoZGFzaGJvYXJkLmVsZW1lbnQpLCAnQ29waWxvdCBpcyBwYXVzZWQgdW50aWwgdGhlIGxpbWl0IHJlc2V0cy4nKTtcblx0fSk7XG5cblx0dGVzdCgnQ2FsbG91dDogRnJlZSBcdTIwMTQgbm8gcGF1c2VkIG1lc3NhZ2Ugd2hlbiBvbmx5IGlubGluZSBzdWdnZXN0aW9ucyBsaW1pdCBpcyByZWFjaGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uoe1xuXHRcdFx0Y2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiA5MCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0Y29tcGxldGlvbnM6IHsgcGVyY2VudFJlbWFpbmluZzogMCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0YWRkaXRpb25hbFVzYWdlRW5hYmxlZDogZmFsc2UsXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LkZyZWUsXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENhbGxvdXRUZXh0KGRhc2hib2FyZC5lbGVtZW50KSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NhbGxvdXQ6IEZyZWUgXHUyMDE0IHNob3dzIHBhdXNlZCB3aGVuIGNoYXQgbGltaXQgaXMgcmVhY2hlZCcsICgpID0+IHtcblx0XHRjb25zdCBkYXNoYm9hcmQgPSBjcmVhdGVEYXNoYm9hcmQoY3JlYXRlRW50aXRsZW1lbnRTZXJ2aWNlKHtcblx0XHRcdGNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogMCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0Y29tcGxldGlvbnM6IHsgcGVyY2VudFJlbWFpbmluZzogOTAsIHVubGltaXRlZDogZmFsc2UgfSxcblx0XHRcdGFkZGl0aW9uYWxVc2FnZUVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5GcmVlLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDYWxsb3V0VGV4dChkYXNoYm9hcmQuZWxlbWVudCksICdDb3BpbG90IGlzIHBhdXNlZCB1bnRpbCB0aGUgbGltaXQgcmVzZXRzLicpO1xuXHR9KTtcblxuXHR0ZXN0KCdDYWxsb3V0OiBzaG93cyBidWRnZXQgYWN0aXZlIHdoZW4gcXVvdGEgZXhoYXVzdGVkIGFuZCBvdmVyYWdlIHBlcm1pdHRlZCBidXQgbm8gb3ZlcmFnZSB1c2VkIHlldCcsICgpID0+IHtcblx0XHRjb25zdCBkYXNoYm9hcmQgPSBjcmVhdGVEYXNoYm9hcmQoY3JlYXRlRW50aXRsZW1lbnRTZXJ2aWNlKHtcblx0XHRcdHByZW1pdW1DaGF0OiB7IHBlcmNlbnRSZW1haW5pbmc6IDAsIHVubGltaXRlZDogZmFsc2UgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDkwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiB0cnVlLFxuXHRcdFx0YWRkaXRpb25hbFVzYWdlQ291bnQ6IDAsXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlBybyxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2FsbG91dFRleHQoZGFzaGJvYXJkLmVsZW1lbnQpLCAnUHJlbWl1bSByZXF1ZXN0IGJ1ZGdldCBpcyBjb25maWd1cmVkLiBVc2FnZSB3aWxsIGNvbnRpbnVlIHVudGlsIGxpbWl0cyByZXNldC4nKTtcblx0fSk7XG5cblx0dGVzdCgnQ2FsbG91dDogUFJVIFx1MjAxNCBzaG93cyBidWRnZXQgYWN0aXZlIHdoZW4gcXVvdGEgZXhoYXVzdGVkIGFuZCBvdmVyYWdlIGNvdW50ID4gMCcsICgpID0+IHtcblx0XHRjb25zdCBkYXNoYm9hcmQgPSBjcmVhdGVEYXNoYm9hcmQoY3JlYXRlRW50aXRsZW1lbnRTZXJ2aWNlKHtcblx0XHRcdHByZW1pdW1DaGF0OiB7IHBlcmNlbnRSZW1haW5pbmc6IDAsIHVubGltaXRlZDogZmFsc2UgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDkwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiB0cnVlLFxuXHRcdFx0YWRkaXRpb25hbFVzYWdlQ291bnQ6IDUsXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlBybyxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2FsbG91dFRleHQoZGFzaGJvYXJkLmVsZW1lbnQpLCAnUHJlbWl1bSByZXF1ZXN0IGJ1ZGdldCBpcyBjb25maWd1cmVkLiBVc2FnZSB3aWxsIGNvbnRpbnVlIHVudGlsIGxpbWl0cyByZXNldC4nKTtcblx0fSk7XG5cblx0dGVzdCgnQ2FsbG91dDogVUJCIFx1MjAxNCBzaG93cyBhZGRpdGlvbmFsIGJ1ZGdldCBhY3RpdmUgd2hlbiBxdW90YSBleGhhdXN0ZWQgYW5kIG92ZXJhZ2UgY291bnQgPiAwJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uoe1xuXHRcdFx0cHJlbWl1bUNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogMCwgdW5saW1pdGVkOiBmYWxzZSwgdXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDkwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiB0cnVlLFxuXHRcdFx0YWRkaXRpb25hbFVzYWdlQ291bnQ6IDUsXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlBybyxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2FsbG91dFRleHQoZGFzaGJvYXJkLmVsZW1lbnQpLCAnQWRkaXRpb25hbCBidWRnZXQgaXMgY29uZmlndXJlZC4gVXNhZ2Ugd2lsbCBjb250aW51ZSB1bnRpbCBsaW1pdHMgcmVzZXQuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NhbGxvdXQ6IHNob3dzIHdhcm5pbmcgd2hlbiBxdW90YSA+PSA3NSUgdXNlZCBhbmQgb3ZlcmFnZSBub3QgcGVybWl0dGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uoe1xuXHRcdFx0cHJlbWl1bUNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogMjAsIHVubGltaXRlZDogZmFsc2UgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDkwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiBmYWxzZSxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuUHJvLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDYWxsb3V0VGV4dChkYXNoYm9hcmQuZWxlbWVudCksICdDb3BpbG90IHdpbGwgcGF1c2Ugd2hlbiB0aGUgbGltaXQgaXMgcmVhY2hlZC4nKTtcblx0fSk7XG5cblx0dGVzdCgnQ2FsbG91dDogc2hvd3MgcGF1c2VkIGZvciBlbnRlcnByaXNlIHdoZW4gcXVvdGEgZXhoYXVzdGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uoe1xuXHRcdFx0cHJlbWl1bUNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogMCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0YWRkaXRpb25hbFVzYWdlRW5hYmxlZDogZmFsc2UsXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LkVudGVycHJpc2UsXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENhbGxvdXRUZXh0KGRhc2hib2FyZC5lbGVtZW50KSwgJ0NvcGlsb3QgaXMgcGF1c2VkIHVudGlsIHRoZSBsaW1pdCByZXNldHMuIENvbnRhY3QgeW91ciBhZG1pbmlzdHJhdG9yIGZvciBtb3JlIGluZm9ybWF0aW9uLicpO1xuXHR9KTtcblxuXHR0ZXN0KCdDYWxsb3V0OiBUQkIgXHUyMDE0IHNob3dzIGFkZGl0aW9uYWwgYnVkZ2V0IGFjdGl2ZSB3aGVuIGV4aGF1c3RlZCB3aXRoIG92ZXJhZ2UgcGVybWl0dGVkIGJ1dCBubyB1c2FnZSB5ZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGFzaGJvYXJkID0gY3JlYXRlRGFzaGJvYXJkKGNyZWF0ZUVudGl0bGVtZW50U2VydmljZSh7XG5cdFx0XHRwcmVtaXVtQ2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiAwLCB1bmxpbWl0ZWQ6IGZhbHNlLCB1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSB9LFxuXHRcdFx0YWRkaXRpb25hbFVzYWdlRW5hYmxlZDogdHJ1ZSxcblx0XHRcdGFkZGl0aW9uYWxVc2FnZUNvdW50OiAwLFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Qcm8sXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENhbGxvdXRUZXh0KGRhc2hib2FyZC5lbGVtZW50KSwgJ0FkZGl0aW9uYWwgYnVkZ2V0IGlzIGNvbmZpZ3VyZWQuIFVzYWdlIHdpbGwgY29udGludWUgdW50aWwgbGltaXRzIHJlc2V0LicpO1xuXHR9KTtcblxuXHR0ZXN0KCdDYWxsb3V0OiBUQkIgXHUyMDE0IHNob3dzIGFkZGl0aW9uYWwgYnVkZ2V0IHdvcmRpbmcgd2hlbiBvdmVyYWdlIGNvdW50ID4gMCcsICgpID0+IHtcblx0XHRjb25zdCBkYXNoYm9hcmQgPSBjcmVhdGVEYXNoYm9hcmQoY3JlYXRlRW50aXRsZW1lbnRTZXJ2aWNlKHtcblx0XHRcdHByZW1pdW1DaGF0OiB7IHBlcmNlbnRSZW1haW5pbmc6IDAsIHVubGltaXRlZDogZmFsc2UsIHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlIH0sXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiB0cnVlLFxuXHRcdFx0YWRkaXRpb25hbFVzYWdlQ291bnQ6IDMsXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlBybyxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2FsbG91dFRleHQoZGFzaGJvYXJkLmVsZW1lbnQpLCAnQWRkaXRpb25hbCBidWRnZXQgaXMgY29uZmlndXJlZC4gVXNhZ2Ugd2lsbCBjb250aW51ZSB1bnRpbCBsaW1pdHMgcmVzZXQuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NhbGxvdXQ6IEVudGVycHJpc2UgXHUyMDE0IHNob3dzIG9yZy1zcGVjaWZpYyB3b3JkaW5nIHdoZW4gYXBwcm9hY2hpbmcgbGltaXQgd2l0aCBhZGRpdGlvbmFsIHVzYWdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uoe1xuXHRcdFx0cHJlbWl1bUNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogMjAsIHVubGltaXRlZDogZmFsc2UsIHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlIH0sXG5cdFx0XHRjb21wbGV0aW9uczogeyBwZXJjZW50UmVtYWluaW5nOiA5MCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0YWRkaXRpb25hbFVzYWdlRW5hYmxlZDogdHJ1ZSxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuRW50ZXJwcmlzZSxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2FsbG91dFRleHQoZGFzaGJvYXJkLmVsZW1lbnQpLCAnQ29waWxvdCB3aWxsIHBhdXNlIHdoZW4geW91ciBsaW1pdHMgYXJlIHJlYWNoZWQuIFBsZWFzZSBjb250YWN0IHlvdXIgYWRtaW4gdG8gaW5jcmVhc2UgeW91ciBsaW1pdHMuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NhbGxvdXQ6IEJ1c2luZXNzIFx1MjAxNCBzaG93cyBvcmctc3BlY2lmaWMgd29yZGluZyB3aGVuIGFwcHJvYWNoaW5nIGxpbWl0IHdpdGggYWRkaXRpb25hbCB1c2FnZScsICgpID0+IHtcblx0XHRjb25zdCBkYXNoYm9hcmQgPSBjcmVhdGVEYXNoYm9hcmQoY3JlYXRlRW50aXRsZW1lbnRTZXJ2aWNlKHtcblx0XHRcdHByZW1pdW1DaGF0OiB7IHBlcmNlbnRSZW1haW5pbmc6IDIwLCB1bmxpbWl0ZWQ6IGZhbHNlLCB1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSB9LFxuXHRcdFx0Y29tcGxldGlvbnM6IHsgcGVyY2VudFJlbWFpbmluZzogOTAsIHVubGltaXRlZDogZmFsc2UgfSxcblx0XHRcdGFkZGl0aW9uYWxVc2FnZUVuYWJsZWQ6IHRydWUsXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LkJ1c2luZXNzLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDYWxsb3V0VGV4dChkYXNoYm9hcmQuZWxlbWVudCksICdDb3BpbG90IHdpbGwgcGF1c2Ugd2hlbiB5b3VyIGxpbWl0cyBhcmUgcmVhY2hlZC4gUGxlYXNlIGNvbnRhY3QgeW91ciBhZG1pbiB0byBpbmNyZWFzZSB5b3VyIGxpbWl0cy4nKTtcblx0fSk7XG5cblx0dGVzdCgnQ2FsbG91dDogRW50ZXJwcmlzZSBcdTIwMTQgc2hvd3Mgb3JnLXNwZWNpZmljIHdvcmRpbmcgd2hlbiBxdW90YSBleGhhdXN0ZWQgd2l0aCBhZGRpdGlvbmFsIHVzYWdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uoe1xuXHRcdFx0cHJlbWl1bUNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogMCwgdW5saW1pdGVkOiBmYWxzZSwgdXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDkwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiB0cnVlLFxuXHRcdFx0YWRkaXRpb25hbFVzYWdlQ291bnQ6IDUsXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LkVudGVycHJpc2UsXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENhbGxvdXRUZXh0KGRhc2hib2FyZC5lbGVtZW50KSwgJ0NvcGlsb3QgaGFzIHBhdXNlZCBiZWNhdXNlIHlvdXIgbGltaXRzIGFyZSByZWFjaGVkLiBQbGVhc2UgY29udGFjdCB5b3VyIGFkbWluIHRvIGluY3JlYXNlIHlvdXIgbGltaXRzLicpO1xuXHR9KTtcblxuXHR0ZXN0KCdDYWxsb3V0OiBCdXNpbmVzcyBcdTIwMTQgc2hvd3Mgb3JnLXNwZWNpZmljIHdvcmRpbmcgd2hlbiBxdW90YSBleGhhdXN0ZWQgd2l0aCBhZGRpdGlvbmFsIHVzYWdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChjcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uoe1xuXHRcdFx0cHJlbWl1bUNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogMCwgdW5saW1pdGVkOiBmYWxzZSwgdXNhZ2VCYXNlZEJpbGxpbmc6IHRydWUgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDkwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiB0cnVlLFxuXHRcdFx0YWRkaXRpb25hbFVzYWdlQ291bnQ6IDUsXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LkJ1c2luZXNzLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDYWxsb3V0VGV4dChkYXNoYm9hcmQuZWxlbWVudCksICdDb3BpbG90IGhhcyBwYXVzZWQgYmVjYXVzZSB5b3VyIGxpbWl0cyBhcmUgcmVhY2hlZC4gUGxlYXNlIGNvbnRhY3QgeW91ciBhZG1pbiB0byBpbmNyZWFzZSB5b3VyIGxpbWl0cy4nKTtcblx0fSk7XG5cblx0Ly8gLS0tIExJVkUgVVBEQVRFUyAtLS1cblxuXHRmdW5jdGlvbiBjcmVhdGVNdXRhYmxlRW50aXRsZW1lbnRTZXJ2aWNlKG9wdHM6IHtcblx0XHRjaGF0PzogSVF1b3RhQ29uZmlnO1xuXHRcdGNvbXBsZXRpb25zPzogSVF1b3RhQ29uZmlnO1xuXHRcdHByZW1pdW1DaGF0PzogSVF1b3RhQ29uZmlnO1xuXHRcdHVzYWdlQmFzZWRCaWxsaW5nPzogYm9vbGVhbjtcblx0XHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkPzogYm9vbGVhbjtcblx0XHRhZGRpdGlvbmFsVXNhZ2VDb3VudD86IG51bWJlcjtcblx0XHRlbnRpdGxlbWVudD86IENoYXRFbnRpdGxlbWVudDtcblx0fSwgZW1pdHRlclN0b3JlOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+KTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgJiB7IHF1b3RhczogUmV0dXJuVHlwZTx0eXBlb2YgY3JlYXRlRW50aXRsZW1lbnRTZXJ2aWNlPlsncXVvdGFzJ107IGZpcmVRdW90YVJlbWFpbmluZzogKCkgPT4gdm9pZDsgZmlyZVF1b3RhRXhjZWVkZWQ6ICgpID0+IHZvaWQgfSB7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VRdW90YVJlbWFpbmluZyA9IGVtaXR0ZXJTdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VRdW90YUV4Y2VlZGVkID0gZW1pdHRlclN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRjb25zdCBzdmMgPSB7XG5cdFx0XHQuLi5jcmVhdGVFbnRpdGxlbWVudFNlcnZpY2Uob3B0cyksXG5cdFx0XHRvbkRpZENoYW5nZVF1b3RhUmVtYWluaW5nOiBvbkRpZENoYW5nZVF1b3RhUmVtYWluaW5nLmV2ZW50LFxuXHRcdFx0b25EaWRDaGFuZ2VRdW90YUV4Y2VlZGVkOiBvbkRpZENoYW5nZVF1b3RhRXhjZWVkZWQuZXZlbnQsXG5cdFx0XHRmaXJlUXVvdGFSZW1haW5pbmc6ICgpID0+IG9uRGlkQ2hhbmdlUXVvdGFSZW1haW5pbmcuZmlyZSgpLFxuXHRcdFx0ZmlyZVF1b3RhRXhjZWVkZWQ6ICgpID0+IG9uRGlkQ2hhbmdlUXVvdGFFeGNlZWRlZC5maXJlKCksXG5cdFx0fTtcblx0XHRyZXR1cm4gc3ZjO1xuXHR9XG5cblx0dGVzdCgnTGl2ZSB1cGRhdGU6IHF1b3RhIGluZGljYXRvcnMgdXBkYXRlIHdoZW4gb25EaWRDaGFuZ2VRdW90YVJlbWFpbmluZyBmaXJlcycsICgpID0+IHtcblx0XHRjb25zdCBzdmMgPSBjcmVhdGVNdXRhYmxlRW50aXRsZW1lbnRTZXJ2aWNlKHtcblx0XHRcdGNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogODAsIHVubGltaXRlZDogZmFsc2UgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDcwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LkZyZWUsXG5cdFx0fSwgc3RvcmUpO1xuXG5cdFx0Y29uc3QgZGFzaGJvYXJkID0gY3JlYXRlRGFzaGJvYXJkKHN2Yyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRRdW90YVZhbHVlcyhkYXNoYm9hcmQuZWxlbWVudCksIFsnMjAlJywgJzMwJSddKTtcblxuXHRcdC8vIFNpbXVsYXRlIGZyZXNoIHF1b3RhIGRhdGEgYXJyaXZpbmdcblx0XHQoc3ZjIGFzIHsgcXVvdGFzOiB0eXBlb2Ygc3ZjLnF1b3RhcyB9KS5xdW90YXMgPSB7XG5cdFx0XHQuLi5zdmMucXVvdGFzLFxuXHRcdFx0Y2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiA1MCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0Y29tcGxldGlvbnM6IHsgcGVyY2VudFJlbWFpbmluZzogNDAsIHVubGltaXRlZDogZmFsc2UgfSxcblx0XHR9O1xuXHRcdHN2Yy5maXJlUXVvdGFSZW1haW5pbmcoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UXVvdGFWYWx1ZXMoZGFzaGJvYXJkLmVsZW1lbnQpLCBbJzUwJScsICc2MCUnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xpdmUgdXBkYXRlOiBjYWxsb3V0IGFwcGVhcnMgd2hlbiBvbkRpZENoYW5nZVF1b3RhRXhjZWVkZWQgZmlyZXMgYW5kIHF1b3RhIGJlY29tZXMgZXhoYXVzdGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN2YyA9IGNyZWF0ZU11dGFibGVFbnRpdGxlbWVudFNlcnZpY2Uoe1xuXHRcdFx0cHJlbWl1bUNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogNTAsIHVubGltaXRlZDogZmFsc2UgfSxcblx0XHRcdGNvbXBsZXRpb25zOiB7IHBlcmNlbnRSZW1haW5pbmc6IDkwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiBmYWxzZSxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuUHJvLFxuXHRcdH0sIHN0b3JlKTtcblxuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChzdmMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDYWxsb3V0VGV4dChkYXNoYm9hcmQuZWxlbWVudCksIG51bGwpO1xuXG5cdFx0Ly8gUXVvdGEgYmVjb21lcyBleGhhdXN0ZWRcblx0XHQoc3ZjIGFzIHsgcXVvdGFzOiB0eXBlb2Ygc3ZjLnF1b3RhcyB9KS5xdW90YXMgPSB7XG5cdFx0XHQuLi5zdmMucXVvdGFzLFxuXHRcdFx0cHJlbWl1bUNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogMCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdH07XG5cdFx0c3ZjLmZpcmVRdW90YUV4Y2VlZGVkKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2FsbG91dFRleHQoZGFzaGJvYXJkLmVsZW1lbnQpLCAnQ29waWxvdCBpcyBwYXVzZWQgdW50aWwgdGhlIGxpbWl0IHJlc2V0cy4nKTtcblx0fSk7XG5cblx0dGVzdCgnTGl2ZSB1cGRhdGU6IGhlYWRlciBidXR0b24gdmlzaWJpbGl0eSB1cGRhdGVzIHdoZW4gcXVvdGEgY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCBzdmMgPSBjcmVhdGVNdXRhYmxlRW50aXRsZW1lbnRTZXJ2aWNlKHtcblx0XHRcdHByZW1pdW1DaGF0OiB7IHBlcmNlbnRSZW1haW5pbmc6IDUwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRjb21wbGV0aW9uczogeyBwZXJjZW50UmVtYWluaW5nOiA5MCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdFx0YWRkaXRpb25hbFVzYWdlRW5hYmxlZDogdHJ1ZSxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuUHJvLFxuXHRcdH0sIHN0b3JlKTtcblxuXHRcdGNvbnN0IGRhc2hib2FyZCA9IGNyZWF0ZURhc2hib2FyZChzdmMpO1xuXG5cdFx0Ly8gTm8gY2FsbG91dCBpbml0aWFsbHkgKHF1b3RhIDwgNzUlIHVzZWQpLCBzbyBidXR0b24gc2hvdWxkIGJlIGhpZGRlblxuXHRcdGNvbnN0IGhlYWRlckJ1dHRvbiA9IGRhc2hib2FyZC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5oZWFkZXItY3RhLWJ1dHRvbicpIGFzIEhUTUxFbGVtZW50O1xuXHRcdGFzc2VydC5vayhoZWFkZXJCdXR0b24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJCdXR0b24uc3R5bGUuZGlzcGxheSwgJ25vbmUnKTtcblxuXHRcdC8vIFF1b3RhIGFwcHJvYWNoZXMgbGltaXQgKD49IDc1JSB1c2VkKVxuXHRcdChzdmMgYXMgeyBxdW90YXM6IHR5cGVvZiBzdmMucXVvdGFzIH0pLnF1b3RhcyA9IHtcblx0XHRcdC4uLnN2Yy5xdW90YXMsXG5cdFx0XHRwcmVtaXVtQ2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiAyMCwgdW5saW1pdGVkOiBmYWxzZSB9LFxuXHRcdH07XG5cdFx0c3ZjLmZpcmVRdW90YVJlbWFpbmluZygpO1xuXG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGhlYWRlckJ1dHRvbi5zdHlsZS5kaXNwbGF5LCAnbm9uZScpO1xuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBaUIsZUFBZTtBQUV6QyxTQUFTLFNBQVMsYUFBYTtBQUUvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FB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TSxFQUFFLGtCQUFrQixJQUFJLFdBQVcsTUFBTTtBQUFBLE1BQy9DLGFBQWEsRUFBRSxrQkFBa0IsSUFBSSxXQUFXLE1BQU07QUFBQSxJQUN2RDtBQUNBLFFBQUksbUJBQW1CO0FBRXZCLFdBQU8sZ0JBQWdCLGVBQWUsVUFBVSxPQUFPLEdBQUcsQ0FBQyxPQUFPLEtBQUssQ0FBQztBQUFBLEVBQ3pFLENBQUM7QUFFRCxPQUFLLGdHQUFnRyxNQUFNO0FBQzFHLFVBQU0sTUFBTSxnQ0FBZ0M7QUFBQSxNQUMzQyxhQUFhLEVBQUUsa0JBQWtCLElBQUksV0FBVyxNQUFNO0FBQUEsTUFDdEQsYUFBYSxFQUFFLGtCQUFrQixJQUFJLFdBQVcsTUFBTTtBQUFBLE1BQ3RELHdCQUF3QjtBQUFBLE1BQ3hCLGFBQWEsZ0JBQWdCO0FBQUEsSUFDOUIsR0FBRyxLQUFLO0FBRVIsVUFBTSxZQUFZLGdCQUFnQixHQUFHO0FBQ3JDLFdBQU8sWUFBWSxlQUFlLFVBQVUsT0FBTyxHQUFHLElBQUk7QUFHMUQsSUFBQyxJQUFzQyxTQUFTO0FBQUEsTUFDL0MsR0FBRyxJQUFJO0FBQUEsTUFDUCxhQUFhLEVBQUUsa0JBQWtCLEdBQUcsV0FBVyxNQUFNO0FBQUEsSUFDdEQ7QUFDQSxRQUFJLGtCQUFrQjtBQUV0QixXQUFPLFlBQVksZUFBZSxVQUFVLE9BQU8sR0FBRywyQ0FBMkM7QUFBQSxFQUNsRyxDQUFDO0FBRUQsT0FBSyxvRUFBb0UsTUFBTTtBQUM5RSxVQUFNLE1BQU0sZ0NBQWdDO0FBQUEsTUFDM0MsYUFBYSxFQUFFLGtCQUFrQixJQUFJLFdBQVcsTUFBTTtBQUFBLE1BQ3RELGFBQWEsRUFBRSxrQkFBa0IsSUFBSSxXQUFXLE1BQU07QUFBQSxNQUN0RCx3QkFBd0I7QUFBQSxNQUN4QixhQUFhLGdCQUFnQjtBQUFBLElBQzlCLEdBQUcsS0FBSztBQUVSLFVBQU0sWUFBWSxnQkFBZ0IsR0FBRztBQUdyQyxVQUFNLGVBQWUsVUFBVSxRQUFRLGNBQWMsb0JBQW9CO0FBQ3pFLFdBQU8sR0FBRyxZQUFZO0FBQ3RCLFdBQU8sWUFBWSxhQUFhLE1BQU0sU0FBUyxNQUFNO0FBR3JELElBQUMsSUFBc0MsU0FBUztBQUFBLE1BQy9DLEdBQUcsSUFBSTtBQUFBLE1BQ1AsYUFBYSxFQUFFLGtCQUFrQixJQUFJLFdBQVcsTUFBTTtBQUFBLElBQ3ZEO0FBQ0EsUUFBSSxtQkFBbUI7QUFFdkIsV0FBTyxlQUFlLGFBQWEsTUFBTSxTQUFTLE1BQU07QUFBQSxFQUN6RCxDQUFDO0FBRUYsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
