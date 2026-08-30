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
import product from "../../../../platform/product/common/product.js";
import { Barrier } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ChatAIDisabledSettingId } from "../../../../platform/chat/common/chatSettings.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService, LogLevel } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { asText, IRequestService } from "../../../../platform/request/common/request.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService, TelemetryLevel } from "../../../../platform/telemetry/common/telemetry.js";
import { IAuthenticationService } from "../../authentication/common/authentication.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { URI } from "../../../../base/common/uri.js";
import Severity from "../../../../base/common/severity.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { isWeb } from "../../../../base/common/platform.js";
import { ILifecycleService } from "../../lifecycle/common/lifecycle.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { observableFromEvent } from "../../../../base/common/observable.js";
import { IDefaultAccountService } from "../../../../platform/defaultAccount/common/defaultAccount.js";
var ChatEntitlementContextKeys;
((ChatEntitlementContextKeys2) => {
  ChatEntitlementContextKeys2.Setup = {
    hidden: new RawContextKey("chatSetupHidden", false, true),
    // True when chat setup is explicitly hidden.
    installed: new RawContextKey("chatSetupInstalled", false, true),
    // True when the chat extension is installed and enabled.
    disabled: new RawContextKey("chatSetupDisabled", false, true),
    // True when the chat extension is disabled due to any other reason than workspace trust.
    disabledInWorkspace: new RawContextKey("chatSetupDisabledInWorkspace", false, true),
    // True when chat is disabled at the workspace level via settings.
    untrusted: new RawContextKey("chatSetupUntrusted", false, true),
    // True when the chat extension is disabled due to workspace trust.
    later: new RawContextKey("chatSetupLater", false, true),
    // True when the user wants to finish setup later.
    registered: new RawContextKey("chatSetupRegistered", false, true),
    // True when the user has registered as Free or Pro user.
    completed: new RawContextKey("chatSetupCompleted", false, true)
    // True when the user has completed the setup flow, regardless of the outcome.
  };
  ChatEntitlementContextKeys2.Entitlement = {
    signedOut: new RawContextKey("chatEntitlementSignedOut", false, true),
    // True when user is signed out.
    canSignUp: new RawContextKey("chatPlanCanSignUp", false, true),
    // True when user can sign up to be a chat free user.
    planFree: new RawContextKey("chatPlanFree", false, true),
    // True when user is a chat free user.
    planPro: new RawContextKey("chatPlanPro", false, true),
    // True when user is a chat pro user.
    planEdu: new RawContextKey("chatPlanEdu", false, true),
    // True when user is a chat edu user.
    planProPlus: new RawContextKey("chatPlanProPlus", false, true),
    // True when user is a chat pro plus user.
    planMax: new RawContextKey("chatPlanMax", false, true),
    // True when user is a chat max user.
    planBusiness: new RawContextKey("chatPlanBusiness", false, true),
    // True when user is a chat business user.
    planEnterprise: new RawContextKey("chatPlanEnterprise", false, true),
    // True when user is a chat enterprise user.
    organisations: new RawContextKey("chatEntitlementOrganisations", void 0, true),
    // The organizations the user belongs to.
    internal: new RawContextKey("chatEntitlementInternal", false, true),
    // True when user belongs to internal organisation.
    sku: new RawContextKey("chatEntitlementSku", void 0, true)
    // The SKU of the user.
  };
  ChatEntitlementContextKeys2.chatQuotaExceeded = new RawContextKey("chatQuotaExceeded", false, true);
  ChatEntitlementContextKeys2.completionsQuotaExceeded = new RawContextKey("completionsQuotaExceeded", false, true);
  ChatEntitlementContextKeys2.chatAnonymous = new RawContextKey("chatAnonymous", false, true);
  ChatEntitlementContextKeys2.clientByokEnabled = new RawContextKey("github.copilot.clientByokEnabled", true, true);
  ChatEntitlementContextKeys2.hasByokModels = new RawContextKey("github.copilot.hasByokModels", false, true);
})(ChatEntitlementContextKeys || (ChatEntitlementContextKeys = {}));
const IChatEntitlementService = createDecorator("chatEntitlementService");
var ChatEntitlement = /* @__PURE__ */ ((ChatEntitlement2) => {
  ChatEntitlement2[ChatEntitlement2["Unknown"] = 1] = "Unknown";
  ChatEntitlement2[ChatEntitlement2["Unresolved"] = 2] = "Unresolved";
  ChatEntitlement2[ChatEntitlement2["Available"] = 3] = "Available";
  ChatEntitlement2[ChatEntitlement2["Unavailable"] = 4] = "Unavailable";
  ChatEntitlement2[ChatEntitlement2["Free"] = 5] = "Free";
  ChatEntitlement2[ChatEntitlement2["EDU"] = 10] = "EDU";
  ChatEntitlement2[ChatEntitlement2["Pro"] = 6] = "Pro";
  ChatEntitlement2[ChatEntitlement2["ProPlus"] = 7] = "ProPlus";
  ChatEntitlement2[ChatEntitlement2["Business"] = 8] = "Business";
  ChatEntitlement2[ChatEntitlement2["Enterprise"] = 9] = "Enterprise";
  ChatEntitlement2[ChatEntitlement2["Max"] = 11] = "Max";
  return ChatEntitlement2;
})(ChatEntitlement || {});
function chatRequiresSetup(context) {
  return !context.completed && !context.hasByokModels || // Setup not completed (unless BYOK models are available)
  context.disabled || // Extension disabled: run setup to enable
  context.untrusted || // Workspace untrusted: run setup to ask for trust
  context.entitlement === 3 /* Available */ || // Entitlement available: run setup to sign up
  context.entitlement === 1 /* Unknown */ && // Entitlement unknown: run setup to sign in / sign up
  !context.anonymous && // unless anonymous access is enabled
  !context.hasByokModels;
}
function isProUser(chatEntitlement) {
  return chatEntitlement === 10 /* EDU */ || chatEntitlement === 6 /* Pro */ || chatEntitlement === 7 /* ProPlus */ || chatEntitlement === 11 /* Max */ || chatEntitlement === 8 /* Business */ || chatEntitlement === 9 /* Enterprise */;
}
function getChatPlanName(chatEntitlement) {
  switch (chatEntitlement) {
    case 10 /* EDU */:
      return localize("plan.eduName", "Copilot Student");
    case 6 /* Pro */:
      return localize("plan.proName", "Copilot Pro");
    case 7 /* ProPlus */:
      return localize("plan.proPlusName", "Copilot Pro+");
    case 11 /* Max */:
      return localize("plan.maxName", "Copilot Max");
    case 8 /* Business */:
      return localize("plan.businessName", "Copilot Business");
    case 9 /* Enterprise */:
      return localize("plan.enterpriseName", "Copilot Enterprise");
    default:
      return localize("plan.freeName", "Copilot Free");
  }
}
const defaultChatAgent = {
  upgradePlanUrl: product.defaultChatAgent?.upgradePlanUrl ?? "",
  providerUriSetting: product.defaultChatAgent?.providerUriSetting ?? "",
  entitlementSignupLimitedUrl: product.defaultChatAgent?.entitlementSignupLimitedUrl ?? "",
  chatQuotaExceededContext: product.defaultChatAgent?.chatQuotaExceededContext ?? "",
  completionsQuotaExceededContext: product.defaultChatAgent?.completionsQuotaExceededContext ?? ""
};
const CHAT_ALLOW_ANONYMOUS_CONFIGURATION_KEY = "chat.allowAnonymousAccess";
function isAnonymous(configurationService, entitlement, sentiment) {
  if (configurationService.getValue(CHAT_ALLOW_ANONYMOUS_CONFIGURATION_KEY) !== true) {
    return false;
  }
  if (entitlement !== 1 /* Unknown */) {
    return false;
  }
  if (sentiment.hidden || sentiment.disabledInWorkspace) {
    return false;
  }
  return true;
}
function logChatEntitlements(state, configurationService, telemetryService) {
  telemetryService.publicLog2("chatEntitlements", {
    chatHidden: Boolean(state.hidden),
    chatDisabled: Boolean(state.disabled),
    chatEntitlement: state.entitlement,
    chatRegistered: Boolean(state.registered),
    chatAnonymous: isAnonymous(configurationService, state.entitlement, state)
  });
}
let ChatEntitlementService = class extends Disposable {
  constructor(instantiationService, productService, environmentService, contextKeyService, configurationService, telemetryService, logService, storageService) {
    super();
    this.contextKeyService = contextKeyService;
    this.configurationService = configurationService;
    this.telemetryService = telemetryService;
    this.logService = logService;
    this.storageService = storageService;
    //#endregion
    //#region --- Quotas
    this._onDidChangeQuotaExceeded = this._register(new Emitter());
    this.onDidChangeQuotaExceeded = this._onDidChangeQuotaExceeded.event;
    this._onDidChangeQuotaRemaining = this._register(new Emitter());
    this.onDidChangeQuotaRemaining = this._onDidChangeQuotaRemaining.event;
    this._onDidChangeUsageBasedBilling = this._register(new Emitter());
    this.onDidChangeUsageBasedBilling = this._onDidChangeUsageBasedBilling.event;
    this.ExtensionQuotaContextKeys = {
      chatQuotaExceeded: defaultChatAgent.chatQuotaExceededContext,
      completionsQuotaExceeded: defaultChatAgent.completionsQuotaExceededContext
    };
    this._onDidChangeAnonymous = this._register(new Emitter());
    this.onDidChangeAnonymous = this._onDidChangeAnonymous.event;
    this.anonymousObs = observableFromEvent(this.onDidChangeAnonymous, () => this.anonymous);
    const cachedUBB = this.storageService.getBoolean(ChatEntitlementService.CACHED_UBB_STORAGE_KEY, StorageScope.PROFILE);
    this._quotas = cachedUBB !== void 0 ? { usageBasedBilling: cachedUBB } : {};
    this.chatQuotaExceededContextKey = ChatEntitlementContextKeys.chatQuotaExceeded.bindTo(this.contextKeyService);
    this.completionsQuotaExceededContextKey = ChatEntitlementContextKeys.completionsQuotaExceeded.bindTo(this.contextKeyService);
    this.anonymousContextKey = ChatEntitlementContextKeys.chatAnonymous.bindTo(this.contextKeyService);
    this.anonymousContextKey.set(this.anonymous);
    if (this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.clientByokEnabled.key) === void 0) {
      ChatEntitlementContextKeys.clientByokEnabled.bindTo(this.contextKeyService);
    }
    this.onDidChangeEntitlement = Event.map(
      Event.filter(
        this.contextKeyService.onDidChangeContext,
        (e) => e.affectsSome(/* @__PURE__ */ new Set([
          ChatEntitlementContextKeys.Entitlement.planEdu.key,
          ChatEntitlementContextKeys.Entitlement.planPro.key,
          ChatEntitlementContextKeys.Entitlement.planBusiness.key,
          ChatEntitlementContextKeys.Entitlement.planEnterprise.key,
          ChatEntitlementContextKeys.Entitlement.planProPlus.key,
          ChatEntitlementContextKeys.Entitlement.planMax.key,
          ChatEntitlementContextKeys.Entitlement.planFree.key,
          ChatEntitlementContextKeys.Entitlement.canSignUp.key,
          ChatEntitlementContextKeys.Entitlement.signedOut.key,
          ChatEntitlementContextKeys.Entitlement.organisations.key,
          ChatEntitlementContextKeys.Entitlement.internal.key,
          ChatEntitlementContextKeys.Entitlement.sku.key
        ])),
        this._store
      ),
      () => {
      },
      this._store
    );
    this.entitlementObs = observableFromEvent(this.onDidChangeEntitlement, () => this.entitlement);
    this.onDidChangeSentiment = Event.map(
      Event.filter(
        this.contextKeyService.onDidChangeContext,
        (e) => e.affectsSome(/* @__PURE__ */ new Set([
          ChatEntitlementContextKeys.Setup.completed.key,
          ChatEntitlementContextKeys.Setup.hidden.key,
          ChatEntitlementContextKeys.Setup.disabled.key,
          ChatEntitlementContextKeys.Setup.untrusted.key,
          ChatEntitlementContextKeys.Setup.installed.key,
          ChatEntitlementContextKeys.Setup.later.key,
          ChatEntitlementContextKeys.Setup.registered.key
        ])),
        this._store
      ),
      () => {
      },
      this._store
    );
    this.sentimentObs = observableFromEvent(this.onDidChangeSentiment, () => this.sentiment);
    if (isWeb && !environmentService.remoteAuthority && !environmentService.isSessionsWindow) {
      ChatEntitlementContextKeys.Setup.hidden.bindTo(this.contextKeyService).set(true);
      return;
    }
    if (!productService.defaultChatAgent) {
      return;
    }
    const context = this.context = new Lazy(() => this._register(instantiationService.createInstance(ChatEntitlementContext)));
    this.requests = new Lazy(() => this._register(instantiationService.createInstance(ChatEntitlementRequests, context.value, {
      clearQuotas: () => this.clearQuotas(),
      acceptQuotas: (quotas) => this.acceptQuotas(quotas)
    })));
    this.registerListeners();
  }
  get entitlement() {
    if (this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.planEdu.key) === true) {
      return 10 /* EDU */;
    } else if (this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.planPro.key) === true) {
      return 6 /* Pro */;
    } else if (this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.planBusiness.key) === true) {
      return 8 /* Business */;
    } else if (this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.planEnterprise.key) === true) {
      return 9 /* Enterprise */;
    } else if (this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.planProPlus.key) === true) {
      return 7 /* ProPlus */;
    } else if (this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.planMax.key) === true) {
      return 11 /* Max */;
    } else if (this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.planFree.key) === true) {
      return 5 /* Free */;
    } else if (this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.canSignUp.key) === true) {
      return 3 /* Available */;
    } else if (this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.signedOut.key) === true) {
      return 1 /* Unknown */;
    }
    return 2 /* Unresolved */;
  }
  get isInternal() {
    return this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.internal.key) === true;
  }
  get organisations() {
    return this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.organisations.key);
  }
  get sku() {
    return this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.sku.key);
  }
  get copilotTrackingId() {
    return this.context?.value.state.copilotTrackingId;
  }
  get clientByokEnabled() {
    return this.contextKeyService.getContextKeyValue("github.copilot.clientByokEnabled") === true;
  }
  get hasByokModels() {
    return this.contextKeyService.getContextKeyValue("github.copilot.hasByokModels") === true;
  }
  get quotas() {
    return this._quotas;
  }
  registerListeners() {
    const quotaExceededSet = /* @__PURE__ */ new Set([this.ExtensionQuotaContextKeys.chatQuotaExceeded, this.ExtensionQuotaContextKeys.completionsQuotaExceeded]);
    const cts = this._register(new MutableDisposable());
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(quotaExceededSet)) {
        if (cts.value) {
          cts.value.cancel();
        }
        cts.value = new CancellationTokenSource();
        this.update(cts.value.token);
      }
    }));
    let anonymousUsage = this.anonymous;
    const updateAnonymousUsage = () => {
      const newAnonymousUsage = this.anonymous;
      if (newAnonymousUsage !== anonymousUsage) {
        anonymousUsage = newAnonymousUsage;
        this.anonymousContextKey.set(newAnonymousUsage);
        if (this.context?.hasValue) {
          logChatEntitlements(this.context.value.state, this.configurationService, this.telemetryService);
        }
        this._onDidChangeAnonymous.fire();
      }
    };
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CHAT_ALLOW_ANONYMOUS_CONFIGURATION_KEY)) {
        updateAnonymousUsage();
      }
    }));
    this._register(this.onDidChangeEntitlement(() => updateAnonymousUsage()));
    this._register(this.onDidChangeSentiment(() => updateAnonymousUsage()));
  }
  acceptQuotas(incomingQuotas) {
    const oldQuota = this._quotas;
    const cachedQuota = this.quotaCopilotTrackingId === this.copilotTrackingId ? oldQuota : {};
    const quotas = {
      ...incomingQuotas,
      chat: incomingQuotas.chat ? mergeDefinedSnapshot(cachedQuota.chat, incomingQuotas.chat) : void 0,
      completions: incomingQuotas.completions ? mergeDefinedSnapshot(cachedQuota.completions, incomingQuotas.completions) : void 0,
      premiumChat: incomingQuotas.premiumChat ? mergeDefinedSnapshot(cachedQuota.premiumChat, incomingQuotas.premiumChat) : void 0,
      sessionRateLimit: incomingQuotas.sessionRateLimit ? mergeDefinedSnapshot(cachedQuota.sessionRateLimit, incomingQuotas.sessionRateLimit) : void 0,
      weeklyRateLimit: incomingQuotas.weeklyRateLimit ? mergeDefinedSnapshot(cachedQuota.weeklyRateLimit, incomingQuotas.weeklyRateLimit) : void 0
    };
    this.quotaCopilotTrackingId = this.copilotTrackingId;
    this._quotas = quotas;
    this.updateContextKeys();
    if (oldQuota.usageBasedBilling !== quotas.usageBasedBilling) {
      if (quotas.usageBasedBilling !== void 0) {
        this.storageService.store(ChatEntitlementService.CACHED_UBB_STORAGE_KEY, quotas.usageBasedBilling, StorageScope.PROFILE, StorageTarget.MACHINE);
      } else {
        this.storageService.remove(ChatEntitlementService.CACHED_UBB_STORAGE_KEY, StorageScope.PROFILE);
      }
    }
    if (this.logService.getLevel() === LogLevel.Trace) {
      this.logService.trace(`[chat entitlement]: acceptQuotas: ${JSON.stringify(quotas)}`);
    }
    const { changed: chatChanged } = this.compareQuotas(oldQuota.chat, quotas.chat);
    const { changed: completionsChanged } = this.compareQuotas(oldQuota.completions, quotas.completions);
    const { changed: premiumChatChanged } = this.compareQuotas(oldQuota.premiumChat, quotas.premiumChat);
    if (chatChanged.exceeded || completionsChanged.exceeded || premiumChatChanged.exceeded) {
      this._onDidChangeQuotaExceeded.fire();
    }
    const sessionRateLimitChanged = oldQuota.sessionRateLimit?.percentRemaining !== quotas.sessionRateLimit?.percentRemaining;
    const weeklyRateLimitChanged = oldQuota.weeklyRateLimit?.percentRemaining !== quotas.weeklyRateLimit?.percentRemaining;
    if (chatChanged.remaining || completionsChanged.remaining || premiumChatChanged.remaining || sessionRateLimitChanged || weeklyRateLimitChanged || oldQuota.usageBasedBilling !== quotas.usageBasedBilling) {
      this._onDidChangeQuotaRemaining.fire();
    }
    if (oldQuota.usageBasedBilling !== quotas.usageBasedBilling) {
      this._onDidChangeUsageBasedBilling.fire();
    }
    if (oldQuota.additionalUsageEnabled !== void 0 && quotas.additionalUsageEnabled !== void 0 && oldQuota.additionalUsageEnabled !== quotas.additionalUsageEnabled) {
      this.telemetryService.publicLog2("chatAdditionalSpendConfiguration", {
        enabled: quotas.additionalUsageEnabled ?? false,
        entitlement: this.entitlement
      });
    }
    if (quotas.additionalUsageEnabled && quotas.premiumChat?.percentRemaining === 0 && oldQuota.premiumChat?.percentRemaining !== void 0 && oldQuota.premiumChat.percentRemaining > 0) {
      this.telemetryService.publicLog2("chatAdditionalSpendActive", {
        entitlement: this.entitlement,
        additionalUsageCount: quotas.additionalUsageCount ?? 0
      });
    }
  }
  compareQuotas(oldQuota, newQuota) {
    return {
      changed: {
        exceeded: oldQuota?.percentRemaining === 0 !== (newQuota?.percentRemaining === 0),
        remaining: oldQuota?.percentRemaining !== newQuota?.percentRemaining || oldQuota?.usageBasedBilling !== newQuota?.usageBasedBilling
      }
    };
  }
  clearQuotas() {
    this.acceptQuotas({});
  }
  updateContextKeys() {
    const chatExhausted = this._quotas.chat?.percentRemaining === 0;
    const premiumChatExhausted = this._quotas.premiumChat?.unlimited ? this._quotas.premiumChat.hasQuota === false : this._quotas.premiumChat?.percentRemaining === 0;
    const additionalUsageEnabled = this._quotas.additionalUsageEnabled ?? false;
    const isManagedPlan = this.entitlement === 8 /* Business */ || this.entitlement === 9 /* Enterprise */;
    this.chatQuotaExceededContextKey.set(chatExhausted || premiumChatExhausted && (isManagedPlan || !additionalUsageEnabled));
    this.completionsQuotaExceededContextKey.set(this._quotas.completions?.percentRemaining === 0);
  }
  get sentiment() {
    return {
      completed: this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Setup.completed.key) === true,
      installed: this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Setup.installed.key) === true,
      hidden: this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Setup.hidden.key) === true,
      disabledInWorkspace: this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Setup.disabledInWorkspace.key) === true,
      disabled: this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Setup.disabled.key) === true,
      untrusted: this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Setup.untrusted.key) === true,
      later: this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Setup.later.key) === true,
      registered: this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Setup.registered.key) === true
    };
  }
  get anonymous() {
    return isAnonymous(this.configurationService, this.entitlement, this.sentiment);
  }
  //#endregion
  markAnonymousRateLimited() {
    if (!this.anonymous) {
      return;
    }
    this.chatQuotaExceededContextKey.set(true);
    this._onDidChangeQuotaExceeded.fire();
  }
  markSetupCompleted() {
    this.context?.value.update({ completed: true });
  }
  setForceHidden(hidden) {
    if (this.context) {
      this.context.value.setForceHidden(hidden);
    } else {
      ChatEntitlementContextKeys.Setup.hidden.bindTo(this.contextKeyService).set(hidden);
    }
  }
  async update(token) {
    await this.requests?.value.forceResolveEntitlement(token);
  }
};
ChatEntitlementService.CACHED_UBB_STORAGE_KEY = "chat.usageBasedBilling";
ChatEntitlementService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IProductService),
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IStorageService)
], ChatEntitlementService);
function mergeDefinedSnapshot(previous, current) {
  const result = { ...previous, ...current };
  for (const key of Object.keys(current)) {
    if (current[key] === void 0 && previous?.[key] !== void 0) {
      result[key] = previous[key];
    }
  }
  return result;
}
function parseQuotas(entitlementsData) {
  const quotas = {
    resetDate: entitlementsData.quota_reset_date_utc ?? entitlementsData.quota_reset_date ?? entitlementsData.limited_user_reset_date,
    resetDateHasTime: typeof entitlementsData.quota_reset_date_utc === "string",
    usageBasedBilling: entitlementsData.token_based_billing,
    canUpgradePlan: entitlementsData.can_upgrade_plan
  };
  if (entitlementsData.monthly_quotas?.chat && typeof entitlementsData.limited_user_quotas?.chat === "number") {
    quotas.chat = {
      percentRemaining: Math.min(100, Math.max(0, entitlementsData.limited_user_quotas.chat / entitlementsData.monthly_quotas.chat * 100)),
      unlimited: false
    };
  }
  if (entitlementsData.monthly_quotas?.completions && typeof entitlementsData.limited_user_quotas?.completions === "number") {
    quotas.completions = {
      percentRemaining: Math.min(100, Math.max(0, entitlementsData.limited_user_quotas.completions / entitlementsData.monthly_quotas.completions * 100)),
      unlimited: false
    };
  }
  if (entitlementsData.quota_snapshots) {
    for (const quotaType of ["chat", "completions", "premium_interactions"]) {
      const rawQuotaSnapshot = entitlementsData.quota_snapshots[quotaType];
      if (!rawQuotaSnapshot) {
        continue;
      }
      const parsedEntitlement = rawQuotaSnapshot.entitlement !== void 0 ? Number(rawQuotaSnapshot.entitlement) : void 0;
      const parsedCreditsUsed = rawQuotaSnapshot.credits_used !== void 0 ? Number(rawQuotaSnapshot.credits_used) : void 0;
      if (!rawQuotaSnapshot.unlimited && parsedEntitlement === 0) {
        continue;
      }
      const parsedQuotaRemaining = rawQuotaSnapshot.quota_remaining !== void 0 ? Number(rawQuotaSnapshot.quota_remaining) : void 0;
      const quotaSnapshot = {
        percentRemaining: Math.min(100, Math.max(0, rawQuotaSnapshot.percent_remaining)),
        unlimited: rawQuotaSnapshot.unlimited,
        hasQuota: rawQuotaSnapshot.has_quota,
        usageBasedBilling: entitlementsData.token_based_billing,
        resetAt: rawQuotaSnapshot.quota_reset_at || void 0,
        entitlement: parsedEntitlement !== void 0 && Number.isFinite(parsedEntitlement) && parsedEntitlement >= 0 ? parsedEntitlement : void 0,
        quotaRemaining: parsedQuotaRemaining !== void 0 && Number.isFinite(parsedQuotaRemaining) && parsedQuotaRemaining >= 0 ? parsedQuotaRemaining : void 0,
        creditsUsed: parsedCreditsUsed !== void 0 && Number.isFinite(parsedCreditsUsed) && parsedCreditsUsed >= 0 ? parsedCreditsUsed : void 0
      };
      switch (quotaType) {
        case "chat":
          quotas.chat = quotaSnapshot;
          break;
        case "completions":
          quotas.completions = quotaSnapshot;
          break;
        case "premium_interactions":
          quotas.premiumChat = quotaSnapshot;
          break;
      }
    }
    const overageSource = entitlementsData.quota_snapshots["premium_interactions"];
    quotas.additionalUsageEnabled = overageSource?.overage_permitted ?? false;
    quotas.additionalUsageCount = overageSource?.overage_count ?? 0;
    quotas.additionalUsageEntitlement = overageSource?.overage_entitlement ?? 0;
  }
  return quotas;
}
let ChatEntitlementRequests = class extends Disposable {
  constructor(context, chatQuotasAccessor, telemetryService, logService, requestService, dialogService, openerService, lifecycleService, defaultAccountService, authenticationService) {
    super();
    this.context = context;
    this.chatQuotasAccessor = chatQuotasAccessor;
    this.telemetryService = telemetryService;
    this.logService = logService;
    this.requestService = requestService;
    this.dialogService = dialogService;
    this.openerService = openerService;
    this.lifecycleService = lifecycleService;
    this.defaultAccountService = defaultAccountService;
    this.authenticationService = authenticationService;
    this.pendingResolveCts = new CancellationTokenSource();
    this.state = { entitlement: this.context.state.entitlement };
    this.registerListeners();
    this.resolve();
  }
  registerListeners() {
    this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this.resolve()));
    this._register(this.context.onDidChange(() => {
      if (this.context.state.disabled || this.context.state.entitlement === 1 /* Unknown */) {
        this.state = { entitlement: this.state.entitlement, quotas: void 0 };
        this.chatQuotasAccessor.clearQuotas();
      }
    }));
  }
  async resolve() {
    this.pendingResolveCts.dispose(true);
    const cts = this.pendingResolveCts = new CancellationTokenSource();
    const defaultAccount = await this.defaultAccountService.getDefaultAccount();
    if (cts.token.isCancellationRequested) {
      return;
    }
    let state = void 0;
    if (defaultAccount) {
      if (this.state.entitlement === 1 /* Unknown */) {
        state = { entitlement: 2 /* Unresolved */ };
      }
    } else {
      state = { entitlement: 1 /* Unknown */ };
    }
    if (state) {
      this.update(state);
    }
    if (defaultAccount) {
      await this.resolveEntitlement(defaultAccount, cts.token);
    }
  }
  async resolveEntitlement(defaultAccount, token) {
    const entitlements = await this.doResolveEntitlement(defaultAccount, token);
    if (typeof entitlements?.entitlement === "number" && !token.isCancellationRequested) {
      this.update(entitlements);
    }
    return entitlements;
  }
  async doResolveEntitlement(defaultAccount, token) {
    if (token.isCancellationRequested) {
      return void 0;
    }
    const entitlementsData = defaultAccount.entitlementsData;
    if (!entitlementsData) {
      this.logService.trace("[chat entitlement]: no entitlements data available on default account");
      return { entitlement: entitlementsData === null ? 1 /* Unknown */ : 2 /* Unresolved */ };
    }
    let entitlement;
    if (entitlementsData.access_type_sku === "free_limited_copilot") {
      entitlement = 5 /* Free */;
    } else if (entitlementsData.access_type_sku === "free_educational_quota") {
      entitlement = 10 /* EDU */;
    } else if (entitlementsData.can_signup_for_limited) {
      entitlement = 3 /* Available */;
    } else if (entitlementsData.copilot_plan === "individual_edu") {
      entitlement = 10 /* EDU */;
    } else if (entitlementsData.copilot_plan === "individual") {
      entitlement = 6 /* Pro */;
    } else if (entitlementsData.copilot_plan === "individual_pro") {
      entitlement = 7 /* ProPlus */;
    } else if (entitlementsData.copilot_plan === "individual_max") {
      entitlement = 11 /* Max */;
    } else if (entitlementsData.copilot_plan === "business") {
      entitlement = 8 /* Business */;
    } else if (entitlementsData.copilot_plan === "enterprise") {
      entitlement = 9 /* Enterprise */;
    } else {
      entitlement = 4 /* Unavailable */;
    }
    const entitlements = {
      entitlement,
      organisations: entitlementsData.organization_login_list,
      quotas: this.toQuotas(entitlementsData),
      sku: entitlementsData.access_type_sku,
      copilotTrackingId: entitlementsData.analytics_tracking_id
    };
    this.logService.trace(`[chat entitlement]: resolved to ${entitlements.entitlement}, quotas: ${JSON.stringify(entitlements.quotas)}`);
    this.telemetryService.publicLog2("chatInstallEntitlement", {
      entitlement: entitlements.entitlement,
      tid: entitlementsData.analytics_tracking_id,
      sku: entitlements.sku,
      quotaChatUnlimited: entitlements.quotas?.chat?.unlimited,
      quotaChatHasQuota: entitlements.quotas?.chat?.hasQuota,
      quotaChatEntitlement: entitlements.quotas?.chat?.entitlement,
      quotaPremiumChat: entitlements.quotas?.premiumChat?.percentRemaining,
      quotaPremiumChatUnlimited: entitlements.quotas?.premiumChat?.unlimited,
      quotaPremiumChatHasQuota: entitlements.quotas?.premiumChat?.hasQuota,
      quotaPremiumChatEntitlement: entitlements.quotas?.premiumChat?.entitlement,
      quotaCompletions: entitlements.quotas?.completions?.percentRemaining,
      quotaCompletionsUnlimited: entitlements.quotas?.completions?.unlimited,
      quotaCompletionsHasQuota: entitlements.quotas?.completions?.hasQuota,
      quotaCompletionsEntitlement: entitlements.quotas?.completions?.entitlement,
      quotaResetDate: entitlements.quotas?.resetDate,
      usageBasedBilling: entitlements.quotas?.usageBasedBilling,
      additionalUsageEnabled: entitlements.quotas?.additionalUsageEnabled,
      additionalUsageCount: entitlements.quotas?.additionalUsageCount,
      canUpgradePlan: entitlements.quotas?.canUpgradePlan
    });
    return entitlements;
  }
  toQuotas(entitlementsData) {
    return parseQuotas(entitlementsData);
  }
  async request(url, type, body, sessions, token, callSite) {
    let lastRequest;
    for (const session of sessions) {
      if (token.isCancellationRequested) {
        return lastRequest;
      }
      try {
        const response = await this.requestService.request({
          type,
          url,
          data: type === "POST" ? JSON.stringify(body) : void 0,
          disableCache: true,
          headers: {
            "Authorization": `Bearer ${session.accessToken}`
          },
          callSite
        }, token);
        const status = response.res.statusCode;
        if (status && status !== 200) {
          lastRequest = response;
          continue;
        }
        return response;
      } catch (error) {
        if (!token.isCancellationRequested) {
          this.logService.error(`[chat entitlement] request: error ${error}`);
        }
      }
    }
    return lastRequest;
  }
  update(state) {
    this.state = state;
    this.context.update({ entitlement: this.state.entitlement, organisations: this.state.organisations, sku: this.state.sku, copilotTrackingId: this.state.copilotTrackingId });
    if (state.quotas) {
      this.chatQuotasAccessor.acceptQuotas(state.quotas);
    }
  }
  async forceResolveEntitlement(token = CancellationToken.None) {
    const defaultAccount = await this.defaultAccountService.refresh({ forceRefresh: true });
    if (!defaultAccount) {
      return void 0;
    }
    return this.resolveEntitlement(defaultAccount, token);
  }
  async signUpFree() {
    const sessions = await this.getSessions();
    if (sessions.length === 0) {
      return void 0;
    }
    return this.doSignUpFree(sessions);
  }
  async doSignUpFree(sessions) {
    const body = {
      restricted_telemetry: this.telemetryService.telemetryLevel === TelemetryLevel.NONE ? "disabled" : "enabled",
      public_code_suggestions: "enabled"
    };
    const response = await this.request(defaultChatAgent.entitlementSignupLimitedUrl, "POST", body, sessions, CancellationToken.None, "chatEntitlementService.signUpFree");
    if (!response) {
      const retry = await this.onUnknownSignUpError(localize("signUpNoResponseError", "No response received."), "[chat entitlement] sign-up: no response");
      return retry ? this.doSignUpFree(sessions) : { errorCode: 1 };
    }
    if (response.res.statusCode && response.res.statusCode !== 200) {
      if (response.res.statusCode === 422) {
        try {
          const responseText2 = await asText(response);
          if (responseText2) {
            const responseError = JSON.parse(responseText2);
            if (typeof responseError.message === "string" && responseError.message) {
              this.onUnprocessableSignUpError(`[chat entitlement] sign-up: unprocessable entity (${responseError.message})`, responseError.message);
              return { errorCode: response.res.statusCode };
            }
          }
        } catch (error) {
        }
      }
      const retry = await this.onUnknownSignUpError(localize("signUpUnexpectedStatusError", "Unexpected status code {0}.", response.res.statusCode), `[chat entitlement] sign-up: unexpected status code ${response.res.statusCode}`);
      return retry ? this.doSignUpFree(sessions) : { errorCode: response.res.statusCode };
    }
    let responseText = null;
    try {
      responseText = await asText(response);
    } catch (error) {
    }
    if (!responseText) {
      const retry = await this.onUnknownSignUpError(localize("signUpNoResponseContentsError", "Response has no contents."), "[chat entitlement] sign-up: response has no content");
      return retry ? this.doSignUpFree(sessions) : { errorCode: 2 };
    }
    let parsedResult = void 0;
    try {
      parsedResult = JSON.parse(responseText);
      this.logService.trace(`[chat entitlement] sign-up: response is ${responseText}`);
    } catch (err) {
      const retry = await this.onUnknownSignUpError(localize("signUpInvalidResponseError", "Invalid response contents."), `[chat entitlement] sign-up: error parsing response (${err})`);
      return retry ? this.doSignUpFree(sessions) : { errorCode: 3 };
    }
    this.update({ entitlement: 5 /* Free */ });
    return Boolean(parsedResult?.subscribed);
  }
  async getSessions() {
    const defaultAccount = await this.defaultAccountService.getDefaultAccount();
    if (defaultAccount) {
      const sessions = await this.authenticationService.getSessions(defaultAccount.authenticationProvider.id);
      const accountSessions = sessions.filter((s) => s.id === defaultAccount.sessionId);
      if (accountSessions.length) {
        return accountSessions;
      }
    }
    return [...await this.authenticationService.getSessions(this.defaultAccountService.getDefaultAccountAuthenticationProvider().id)];
  }
  async onUnknownSignUpError(detail, logMessage) {
    this.logService.error(logMessage);
    if (!this.lifecycleService.willShutdown) {
      const { confirmed } = await this.dialogService.confirm({
        type: Severity.Error,
        message: localize("unknownSignUpError", "An error occurred while signing up for the GitHub Copilot Free plan. Would you like to try again?"),
        detail,
        primaryButton: localize("retry", "Retry")
      });
      return confirmed;
    }
    return false;
  }
  onUnprocessableSignUpError(logMessage, logDetails) {
    this.logService.error(logMessage);
    if (!this.lifecycleService.willShutdown) {
      this.dialogService.prompt({
        type: Severity.Error,
        message: localize("unprocessableSignUpError", "An error occurred while signing up for the GitHub Copilot Free plan."),
        detail: logDetails,
        buttons: [
          {
            label: localize("ok", "OK"),
            run: () => {
            }
          },
          {
            label: localize("learnMore", "Learn More"),
            run: () => this.openerService.open(URI.parse(defaultChatAgent.upgradePlanUrl))
          }
        ]
      });
    }
  }
  async signIn(options) {
    const defaultAccount = await this.defaultAccountService.signIn({
      additionalScopes: options?.additionalScopes,
      extraAuthorizeParameters: { get_started_with: "copilot-vscode" },
      provider: options?.useSocialProvider
    });
    if (!defaultAccount) {
      return {};
    }
    const entitlements = await this.doResolveEntitlement(defaultAccount, CancellationToken.None);
    return { defaultAccount, entitlements };
  }
  dispose() {
    this.pendingResolveCts.dispose(true);
    super.dispose();
  }
};
ChatEntitlementRequests = __decorateClass([
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IRequestService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, ILifecycleService),
  __decorateParam(8, IDefaultAccountService),
  __decorateParam(9, IAuthenticationService)
], ChatEntitlementRequests);
let ChatEntitlementContext = class extends Disposable {
  constructor(contextKeyService, storageService, logService, configurationService, telemetryService) {
    super();
    this.storageService = storageService;
    this.logService = logService;
    this.configurationService = configurationService;
    this.telemetryService = telemetryService;
    this.suspendedState = void 0;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.updateBarrier = void 0;
    this._forceHidden = false;
    this.canSignUpContextKey = ChatEntitlementContextKeys.Entitlement.canSignUp.bindTo(contextKeyService);
    this.signedOutContextKey = ChatEntitlementContextKeys.Entitlement.signedOut.bindTo(contextKeyService);
    this.freeContextKey = ChatEntitlementContextKeys.Entitlement.planFree.bindTo(contextKeyService);
    this.eduContextKey = ChatEntitlementContextKeys.Entitlement.planEdu.bindTo(contextKeyService);
    this.proContextKey = ChatEntitlementContextKeys.Entitlement.planPro.bindTo(contextKeyService);
    this.proPlusContextKey = ChatEntitlementContextKeys.Entitlement.planProPlus.bindTo(contextKeyService);
    this.maxContextKey = ChatEntitlementContextKeys.Entitlement.planMax.bindTo(contextKeyService);
    this.businessContextKey = ChatEntitlementContextKeys.Entitlement.planBusiness.bindTo(contextKeyService);
    this.enterpriseContextKey = ChatEntitlementContextKeys.Entitlement.planEnterprise.bindTo(contextKeyService);
    this.organisationsContextKey = ChatEntitlementContextKeys.Entitlement.organisations.bindTo(contextKeyService);
    this.isInternalContextKey = ChatEntitlementContextKeys.Entitlement.internal.bindTo(contextKeyService);
    this.skuContextKey = ChatEntitlementContextKeys.Entitlement.sku.bindTo(contextKeyService);
    this.completedContext = ChatEntitlementContextKeys.Setup.completed.bindTo(contextKeyService);
    this.hiddenContext = ChatEntitlementContextKeys.Setup.hidden.bindTo(contextKeyService);
    this.disabledInWorkspaceContext = ChatEntitlementContextKeys.Setup.disabledInWorkspace.bindTo(contextKeyService);
    this.laterContext = ChatEntitlementContextKeys.Setup.later.bindTo(contextKeyService);
    this.installedContext = ChatEntitlementContextKeys.Setup.installed.bindTo(contextKeyService);
    this.disabledContext = ChatEntitlementContextKeys.Setup.disabled.bindTo(contextKeyService);
    this.untrustedContext = ChatEntitlementContextKeys.Setup.untrusted.bindTo(contextKeyService);
    this.registeredContext = ChatEntitlementContextKeys.Setup.registered.bindTo(contextKeyService);
    this._state = this.storageService.getObject(ChatEntitlementContext.CHAT_ENTITLEMENT_CONTEXT_STORAGE_KEY, StorageScope.PROFILE) ?? {
      entitlement: 1 /* Unknown */,
      organisations: void 0,
      sku: void 0,
      copilotTrackingId: void 0
    };
    const migrated = this.storageService.getBoolean(ChatEntitlementContext.CHAT_ENTITLEMENT_CONTEXT_MIGRATED_STORAGE_KEY, StorageScope.PROFILE) === true;
    if (!migrated) {
      this.storageService.store(ChatEntitlementContext.CHAT_ENTITLEMENT_CONTEXT_MIGRATED_STORAGE_KEY, true, StorageScope.PROFILE, StorageTarget.MACHINE);
      if (this._state.installed && !this._state.completed) {
        this._state.completed = true;
        this.storageService.store(ChatEntitlementContext.CHAT_ENTITLEMENT_CONTEXT_STORAGE_KEY, this._state, StorageScope.PROFILE, StorageTarget.MACHINE);
      }
    }
    this.updateContextSync();
    this.registerListeners();
  }
  get state() {
    return this.withConfiguration(this.suspendedState ?? this._state);
  }
  registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatAIDisabledSettingId)) {
        this.updateContext();
      }
    }));
  }
  withConfiguration(state) {
    if (this._forceHidden || this.configurationService.getValue(ChatAIDisabledSettingId) === true) {
      return {
        ...state,
        hidden: true
      };
    }
    return state;
  }
  setForceHidden(hidden) {
    if (this._forceHidden !== hidden) {
      this._forceHidden = hidden;
      this.updateContext();
    }
  }
  async update(context) {
    this.logService.trace(`[chat entitlement context] update(): ${JSON.stringify(context)}`);
    const oldState = JSON.stringify(this._state);
    if (typeof context.installed === "boolean" && typeof context.disabled === "boolean" && typeof context.untrusted === "boolean") {
      this._state.installed = context.installed;
      this._state.disabled = context.disabled;
      this._state.untrusted = context.untrusted;
      this._state.disabledInWorkspace = context.disabledInWorkspace;
      if (context.installed && !context.disabled) {
        context.hidden = false;
      }
    }
    if (typeof context.hidden === "boolean") {
      this._state.hidden = context.hidden;
    }
    if (typeof context.later === "boolean") {
      this._state.later = context.later;
    }
    if (typeof context.completed === "boolean") {
      this._state.completed = context.completed;
    }
    if (typeof context.entitlement === "number") {
      this._state.entitlement = context.entitlement;
      this._state.organisations = context.organisations;
      this._state.sku = context.sku;
      this._state.copilotTrackingId = context.copilotTrackingId;
      if (this._state.entitlement === 5 /* Free */ || isProUser(this._state.entitlement)) {
        this._state.registered = true;
      } else if (this._state.entitlement === 3 /* Available */) {
        this._state.registered = false;
      }
    }
    if (isAnonymous(this.configurationService, this._state.entitlement, this._state)) {
      this._state.sku = "no_auth_limited_copilot";
    }
    if (oldState === JSON.stringify(this._state)) {
      return;
    }
    this.storageService.store(ChatEntitlementContext.CHAT_ENTITLEMENT_CONTEXT_STORAGE_KEY, {
      ...this._state,
      later: void 0
      // do not persist this across restarts for now
    }, StorageScope.PROFILE, StorageTarget.MACHINE);
    return this.updateContext();
  }
  async updateContext() {
    await this.updateBarrier?.wait();
    this.updateContextSync();
  }
  updateContextSync() {
    const state = this.withConfiguration(this._state);
    this.signedOutContextKey.set(state.entitlement === 1 /* Unknown */);
    this.canSignUpContextKey.set(state.entitlement === 3 /* Available */);
    this.freeContextKey.set(state.entitlement === 5 /* Free */);
    this.eduContextKey.set(state.entitlement === 10 /* EDU */);
    this.proContextKey.set(state.entitlement === 6 /* Pro */);
    this.proPlusContextKey.set(state.entitlement === 7 /* ProPlus */);
    this.maxContextKey.set(state.entitlement === 11 /* Max */);
    this.businessContextKey.set(state.entitlement === 8 /* Business */);
    this.enterpriseContextKey.set(state.entitlement === 9 /* Enterprise */);
    this.organisationsContextKey.set(state.organisations);
    this.isInternalContextKey.set(Boolean(state.organisations?.some((org) => org === "github" || org === "microsoft" || org === "ms-copilot" || org === "MicrosoftCopilot")));
    this.skuContextKey.set(state.sku);
    this.completedContext.set(!!state.completed);
    this.hiddenContext.set(!!state.hidden);
    this.disabledInWorkspaceContext.set(!!state.disabledInWorkspace);
    this.laterContext.set(!!state.later);
    this.installedContext.set(!!state.installed);
    this.disabledContext.set(!!state.disabled);
    this.untrustedContext.set(!!state.untrusted);
    this.registeredContext.set(!!state.registered);
    this.logService.trace(`[chat entitlement context] updateContext(): ${JSON.stringify(state)}`);
    logChatEntitlements(state, this.configurationService, this.telemetryService);
    this._onDidChange.fire();
  }
  suspend() {
    this.suspendedState = { ...this._state };
    this.updateBarrier = new Barrier();
  }
  resume() {
    this.suspendedState = void 0;
    this.updateBarrier?.open();
    this.updateBarrier = void 0;
  }
};
ChatEntitlementContext.CHAT_ENTITLEMENT_CONTEXT_STORAGE_KEY = "chat.setupContext";
ChatEntitlementContext.CHAT_ENTITLEMENT_CONTEXT_MIGRATED_STORAGE_KEY = "chat.setupContext.migrated.v1";
ChatEntitlementContext = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ITelemetryService)
], ChatEntitlementContext);
registerSingleton(
  IChatEntitlementService,
  ChatEntitlementService,
  InstantiationType.Eager
  /* To ensure context keys are set asap */
);
export {
  ChatEntitlement,
  ChatEntitlementContext,
  ChatEntitlementContextKeys,
  ChatEntitlementRequests,
  ChatEntitlementService,
  IChatEntitlementService,
  chatRequiresSetup,
  getChatPlanName,
  isProUser,
  parseQuotas
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxjaGF0XFxjb21tb25cXGNoYXRFbnRpdGxlbWVudFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IEJhcnJpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUmVxdWVzdENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NoYXQvY29tbW9uL2NoYXRTZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yLCBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBMb2dMZXZlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFzVGV4dCwgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UsIFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQXV0aGVudGljYXRpb25TZXNzaW9uLCBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTXV0YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50LCBJRW50aXRsZW1lbnRzRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cyB7XG5cblx0ZXhwb3J0IGNvbnN0IFNldHVwID0ge1xuXHRcdGhpZGRlbjogbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2NoYXRTZXR1cEhpZGRlbicsIGZhbHNlLCB0cnVlKSwgXHRcdC8vIFRydWUgd2hlbiBjaGF0IHNldHVwIGlzIGV4cGxpY2l0bHkgaGlkZGVuLlxuXHRcdGluc3RhbGxlZDogbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2NoYXRTZXR1cEluc3RhbGxlZCcsIGZhbHNlLCB0cnVlKSwgIFx0Ly8gVHJ1ZSB3aGVuIHRoZSBjaGF0IGV4dGVuc2lvbiBpcyBpbnN0YWxsZWQgYW5kIGVuYWJsZWQuXG5cdFx0ZGlzYWJsZWQ6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjaGF0U2V0dXBEaXNhYmxlZCcsIGZhbHNlLCB0cnVlKSwgIFx0Ly8gVHJ1ZSB3aGVuIHRoZSBjaGF0IGV4dGVuc2lvbiBpcyBkaXNhYmxlZCBkdWUgdG8gYW55IG90aGVyIHJlYXNvbiB0aGFuIHdvcmtzcGFjZSB0cnVzdC5cblx0XHRkaXNhYmxlZEluV29ya3NwYWNlOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignY2hhdFNldHVwRGlzYWJsZWRJbldvcmtzcGFjZScsIGZhbHNlLCB0cnVlKSxcdC8vIFRydWUgd2hlbiBjaGF0IGlzIGRpc2FibGVkIGF0IHRoZSB3b3Jrc3BhY2UgbGV2ZWwgdmlhIHNldHRpbmdzLlxuXHRcdHVudHJ1c3RlZDogbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2NoYXRTZXR1cFVudHJ1c3RlZCcsIGZhbHNlLCB0cnVlKSwgIFx0Ly8gVHJ1ZSB3aGVuIHRoZSBjaGF0IGV4dGVuc2lvbiBpcyBkaXNhYmxlZCBkdWUgdG8gd29ya3NwYWNlIHRydXN0LlxuXHRcdGxhdGVyOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignY2hhdFNldHVwTGF0ZXInLCBmYWxzZSwgdHJ1ZSksICBcdFx0XHQvLyBUcnVlIHdoZW4gdGhlIHVzZXIgd2FudHMgdG8gZmluaXNoIHNldHVwIGxhdGVyLlxuXHRcdHJlZ2lzdGVyZWQ6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjaGF0U2V0dXBSZWdpc3RlcmVkJywgZmFsc2UsIHRydWUpLCAvLyBUcnVlIHdoZW4gdGhlIHVzZXIgaGFzIHJlZ2lzdGVyZWQgYXMgRnJlZSBvciBQcm8gdXNlci5cblx0XHRjb21wbGV0ZWQ6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjaGF0U2V0dXBDb21wbGV0ZWQnLCBmYWxzZSwgdHJ1ZSlcdC8vIFRydWUgd2hlbiB0aGUgdXNlciBoYXMgY29tcGxldGVkIHRoZSBzZXR1cCBmbG93LCByZWdhcmRsZXNzIG9mIHRoZSBvdXRjb21lLlxuXHR9O1xuXG5cdGV4cG9ydCBjb25zdCBFbnRpdGxlbWVudCA9IHtcblx0XHRzaWduZWRPdXQ6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjaGF0RW50aXRsZW1lbnRTaWduZWRPdXQnLCBmYWxzZSwgdHJ1ZSksIFx0XHRcdFx0Ly8gVHJ1ZSB3aGVuIHVzZXIgaXMgc2lnbmVkIG91dC5cblx0XHRjYW5TaWduVXA6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjaGF0UGxhbkNhblNpZ25VcCcsIGZhbHNlLCB0cnVlKSwgXHRcdFx0XHRcdFx0Ly8gVHJ1ZSB3aGVuIHVzZXIgY2FuIHNpZ24gdXAgdG8gYmUgYSBjaGF0IGZyZWUgdXNlci5cblxuXHRcdHBsYW5GcmVlOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignY2hhdFBsYW5GcmVlJywgZmFsc2UsIHRydWUpLFx0XHRcdFx0XHRcdFx0XHQvLyBUcnVlIHdoZW4gdXNlciBpcyBhIGNoYXQgZnJlZSB1c2VyLlxuXHRcdHBsYW5Qcm86IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjaGF0UGxhblBybycsIGZhbHNlLCB0cnVlKSxcdFx0XHRcdFx0XHRcdFx0Ly8gVHJ1ZSB3aGVuIHVzZXIgaXMgYSBjaGF0IHBybyB1c2VyLlxuXHRcdHBsYW5FZHU6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjaGF0UGxhbkVkdScsIGZhbHNlLCB0cnVlKSxcdFx0XHRcdFx0XHRcdFx0Ly8gVHJ1ZSB3aGVuIHVzZXIgaXMgYSBjaGF0IGVkdSB1c2VyLlxuXHRcdHBsYW5Qcm9QbHVzOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignY2hhdFBsYW5Qcm9QbHVzJywgZmFsc2UsIHRydWUpLCBcdFx0XHRcdFx0XHQvLyBUcnVlIHdoZW4gdXNlciBpcyBhIGNoYXQgcHJvIHBsdXMgdXNlci5cblx0XHRwbGFuTWF4OiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignY2hhdFBsYW5NYXgnLCBmYWxzZSwgdHJ1ZSksIFx0XHRcdFx0XHRcdFx0XHQvLyBUcnVlIHdoZW4gdXNlciBpcyBhIGNoYXQgbWF4IHVzZXIuXG5cdFx0cGxhbkJ1c2luZXNzOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignY2hhdFBsYW5CdXNpbmVzcycsIGZhbHNlLCB0cnVlKSwgXHRcdFx0XHRcdFx0Ly8gVHJ1ZSB3aGVuIHVzZXIgaXMgYSBjaGF0IGJ1c2luZXNzIHVzZXIuXG5cdFx0cGxhbkVudGVycHJpc2U6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjaGF0UGxhbkVudGVycHJpc2UnLCBmYWxzZSwgdHJ1ZSksIFx0XHRcdFx0XHQvLyBUcnVlIHdoZW4gdXNlciBpcyBhIGNoYXQgZW50ZXJwcmlzZSB1c2VyLlxuXG5cdFx0b3JnYW5pc2F0aW9uczogbmV3IFJhd0NvbnRleHRLZXk8c3RyaW5nW10+KCdjaGF0RW50aXRsZW1lbnRPcmdhbmlzYXRpb25zJywgdW5kZWZpbmVkLCB0cnVlKSwgXHQvLyBUaGUgb3JnYW5pemF0aW9ucyB0aGUgdXNlciBiZWxvbmdzIHRvLlxuXHRcdGludGVybmFsOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignY2hhdEVudGl0bGVtZW50SW50ZXJuYWwnLCBmYWxzZSwgdHJ1ZSksIFx0XHRcdFx0XHQvLyBUcnVlIHdoZW4gdXNlciBiZWxvbmdzIHRvIGludGVybmFsIG9yZ2FuaXNhdGlvbi5cblx0XHRza3U6IG5ldyBSYXdDb250ZXh0S2V5PHN0cmluZz4oJ2NoYXRFbnRpdGxlbWVudFNrdScsIHVuZGVmaW5lZCwgdHJ1ZSksIFx0XHRcdFx0XHRcdFx0Ly8gVGhlIFNLVSBvZiB0aGUgdXNlci5cblx0fTtcblxuXHRleHBvcnQgY29uc3QgY2hhdFF1b3RhRXhjZWVkZWQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignY2hhdFF1b3RhRXhjZWVkZWQnLCBmYWxzZSwgdHJ1ZSk7XG5cdGV4cG9ydCBjb25zdCBjb21wbGV0aW9uc1F1b3RhRXhjZWVkZWQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignY29tcGxldGlvbnNRdW90YUV4Y2VlZGVkJywgZmFsc2UsIHRydWUpO1xuXG5cdGV4cG9ydCBjb25zdCBjaGF0QW5vbnltb3VzID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2NoYXRBbm9ueW1vdXMnLCBmYWxzZSwgdHJ1ZSk7XG5cblx0ZXhwb3J0IGNvbnN0IGNsaWVudEJ5b2tFbmFibGVkID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2dpdGh1Yi5jb3BpbG90LmNsaWVudEJ5b2tFbmFibGVkJywgdHJ1ZSwgdHJ1ZSk7XG5cblx0ZXhwb3J0IGNvbnN0IGhhc0J5b2tNb2RlbHMgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignZ2l0aHViLmNvcGlsb3QuaGFzQnlva01vZGVscycsIGZhbHNlLCB0cnVlKTtcbn1cblxuZXhwb3J0IGNvbnN0IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlPignY2hhdEVudGl0bGVtZW50U2VydmljZScpO1xuXG5leHBvcnQgZW51bSBDaGF0RW50aXRsZW1lbnQge1xuXHQvKiogU2lnbmVkIG91dCAqL1xuXHRVbmtub3duID0gMSxcblx0LyoqIFNpZ25lZCBpbiBidXQgbm90IHlldCByZXNvbHZlZCAqL1xuXHRVbnJlc29sdmVkID0gMixcblx0LyoqIFNpZ25lZCBpbiBhbmQgZW50aXRsZWQgdG8gRnJlZSAqL1xuXHRBdmFpbGFibGUgPSAzLFxuXHQvKiogU2lnbmVkIGluIGJ1dCBub3QgZW50aXRsZWQgdG8gRnJlZSAqL1xuXHRVbmF2YWlsYWJsZSA9IDQsXG5cdC8qKiBTaWduZWQtdXAgdG8gRnJlZSAqL1xuXHRGcmVlID0gNSxcblx0LyoqIFNpZ25lZC11cCB0byBFRFUgKi9cblx0RURVID0gMTAsXG5cdC8qKiBTaWduZWQtdXAgdG8gUHJvICovXG5cdFBybyA9IDYsXG5cdC8qKiBTaWduZWQtdXAgdG8gUHJvIFBsdXMgKi9cblx0UHJvUGx1cyA9IDcsXG5cdC8qKiBTaWduZWQtdXAgdG8gQnVzaW5lc3MgKi9cblx0QnVzaW5lc3MgPSA4LFxuXHQvKiogU2lnbmVkLXVwIHRvIEVudGVycHJpc2UgKi9cblx0RW50ZXJwcmlzZSA9IDksXG5cdC8qKiBTaWduZWQtdXAgdG8gTWF4ICovXG5cdE1heCA9IDExLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0U2VudGltZW50IHtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgdXNlciBoYXMgY29tcGxldGVkIHRoZSBzZXR1cCBmbG93IG9yIG5vdCwgcmVnYXJkbGVzcyBvZiB0aGUgb3V0Y29tZVxuXHQgKi9cblx0Y29tcGxldGVkPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogVXNlciBoYXMgQ2hhdCBpbnN0YWxsZWQuXG5cdCAqL1xuXHRpbnN0YWxsZWQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBVc2VyIHNpZ25hbHMgbm8gaW50ZW50IGluIHVzaW5nIENoYXQuXG5cdCAqXG5cdCAqIE5vdGU6IGluIGNvbnRyYXN0IHRvIGBkaXNhYmxlZGAsIHRoaXMgc2hvdWxkIG5vdCBvbmx5IGRpc2FibGVcblx0ICogQ2hhdCBidXQgYWxzbyBoaWRlIGFsbCBvZiBpdHMgVUkuXG5cdCAqL1xuXHRoaWRkZW4/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBVc2VyIHNpZ25hbHMgaW50ZW50IHRvIGRpc2FibGUgQ2hhdC5cblx0ICpcblx0ICogTm90ZTogaW4gY29udHJhc3QgdG8gYGhpZGRlbmAsIHRoaXMgc2hvdWxkIG5vdCBoaWRlXG5cdCAqIENoYXQgYnV0IGJ1dCBkaXNhYmxlIGl0cyBmdW5jdGlvbmFsaXR5LlxuXHQgKi9cblx0ZGlzYWJsZWQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDaGF0IGlzIGRpc2FibGVkIGF0IHRoZSB3b3Jrc3BhY2UgbGV2ZWxcblx0ICpcblx0ICogTm90ZTogaW4gY29udHJhc3QgdG8gYGhpZGRlbmAgKHdoaWNoIGhpZGVzIGFsbCBVSSBnbG9iYWxseSksXG5cdCAqIHRoaXMgb25seSBkaXNhYmxlcyBDaGF0IGluIHRoZSBjdXJyZW50IHdvcmtzcGFjZSB3aGlsZVxuXHQgKiBrZWVwaW5nIGl0cyBVSSB2aXNpYmxlIHNvIHRoZSB1c2VyIGNhbiByZS1lbmFibGUgaXQuXG5cdCAqL1xuXHRkaXNhYmxlZEluV29ya3NwYWNlPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQ2hhdCBpcyBkaXNhYmxlZCBkdWUgdG8gbWlzc2luZyB3b3Jrc3BhY2UgdHJ1c3QuXG5cdCAqXG5cdCAqIE5vdGU6IGV2ZW4gdGhvdWdoIHRoaXMgZGlzYWJsZXMgQ2hhdCwgd2Ugd2FudCB0byB0cmVhdCBpdFxuXHQgKiBkaWZmZXJlbnQgZnJvbSB0aGUgYGRpc2FibGVkYCBzdGF0ZSB0aGF0IGlzIGJ5IGV4cGxpY2l0XG5cdCAqIHVzZXIgY2hvaWNlLlxuXHQgKi9cblx0dW50cnVzdGVkPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogVXNlciBzaWduYWxzIGludGVudCB0byB1c2UgQ2hhdCBsYXRlci5cblx0ICovXG5cdGxhdGVyPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogVXNlciBoYXMgcmVnaXN0ZXJlZCBhcyBGcmVlIG9yIFBybyB1c2VyLlxuXHQgKi9cblx0cmVnaXN0ZXJlZD86IGJvb2xlYW47XG59XG5cbi8qKlxuICogVGhlIGlucHV0cyBuZWVkZWQgdG8gZGVjaWRlIHdoZXRoZXIgQ2hhdCBzdGlsbCByZXF1aXJlcyB0aGUgdXNlciB0byBydW4gc2V0dXBcbiAqIChzaWduIGluIC8gc2lnbiB1cCAvIHRydXN0IC8gZW5hYmxlKSBiZWZvcmUgaXQgY2FuIHNlcnZpY2UgYSByZXF1ZXN0LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0U2V0dXBSZXF1aXJlbWVudCB7XG5cdC8qKiBXaGV0aGVyIHRoZSBzZXR1cCBmbG93IGhhcyBiZWVuIGNvbXBsZXRlZCAoYW55IG91dGNvbWUpLiAqL1xuXHRyZWFkb25seSBjb21wbGV0ZWQ6IGJvb2xlYW47XG5cdC8qKiBXaGV0aGVyIHRoZSBjaGF0IGV4dGVuc2lvbiBpcyBkaXNhYmxlZCBmb3IgYSByZWFzb24gb3RoZXIgdGhhbiB0cnVzdC4gKi9cblx0cmVhZG9ubHkgZGlzYWJsZWQ6IGJvb2xlYW47XG5cdC8qKiBXaGV0aGVyIHRoZSBjaGF0IGV4dGVuc2lvbiBpcyBkaXNhYmxlZCBiZWNhdXNlIHRoZSB3b3Jrc3BhY2UgaXMgdW50cnVzdGVkLiAqL1xuXHRyZWFkb25seSB1bnRydXN0ZWQ6IGJvb2xlYW47XG5cdC8qKiBUaGUgdXNlcidzIGxhc3Qga25vd24gb3IgcmVzb2x2ZWQgZW50aXRsZW1lbnQuICovXG5cdHJlYWRvbmx5IGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQ7XG5cdC8qKiBXaGV0aGVyIGFub255bW91cyAoc2lnbmVkLW91dCkgQ2hhdCBhY2Nlc3MgaXMgZW5hYmxlZC4gKi9cblx0cmVhZG9ubHkgYW5vbnltb3VzOiBib29sZWFuO1xuXHQvKiogV2hldGhlciBCWU9LIG1vZGVscyBhcmUgYXZhaWxhYmxlLiAqL1xuXHRyZWFkb25seSBoYXNCeW9rTW9kZWxzOiBib29sZWFuO1xufVxuXG4vKipcbiAqIFJldHVybnMgd2hldGhlciBDaGF0IHJlcXVpcmVzIHNldHVwIGJlZm9yZSBpdCBjYW4gc2VydmljZSBhIHJlcXVlc3QuXG4gKiBUaGUgbW9kZWwgcGlja2VyIHVzZXMgYSBuYXJyb3dlciBjb25kaXRpb24gdGhhdCBvbmx5IHN1cmZhY2VzIGludGVyYWN0aXZlIHNldHVwLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2hhdFJlcXVpcmVzU2V0dXAoY29udGV4dDogSUNoYXRTZXR1cFJlcXVpcmVtZW50KTogYm9vbGVhbiB7XG5cdHJldHVybiAoXG5cdFx0KCFjb250ZXh0LmNvbXBsZXRlZCAmJiAhY29udGV4dC5oYXNCeW9rTW9kZWxzKSB8fFx0XHRcdC8vIFNldHVwIG5vdCBjb21wbGV0ZWQgKHVubGVzcyBCWU9LIG1vZGVscyBhcmUgYXZhaWxhYmxlKVxuXHRcdGNvbnRleHQuZGlzYWJsZWQgfHxcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gRXh0ZW5zaW9uIGRpc2FibGVkOiBydW4gc2V0dXAgdG8gZW5hYmxlXG5cdFx0Y29udGV4dC51bnRydXN0ZWQgfHxcdFx0XHRcdFx0XHRcdFx0XHRcdC8vIFdvcmtzcGFjZSB1bnRydXN0ZWQ6IHJ1biBzZXR1cCB0byBhc2sgZm9yIHRydXN0XG5cdFx0Y29udGV4dC5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkF2YWlsYWJsZSB8fFx0XHQvLyBFbnRpdGxlbWVudCBhdmFpbGFibGU6IHJ1biBzZXR1cCB0byBzaWduIHVwXG5cdFx0KFxuXHRcdFx0Y29udGV4dC5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LlVua25vd24gJiZcdFx0Ly8gRW50aXRsZW1lbnQgdW5rbm93bjogcnVuIHNldHVwIHRvIHNpZ24gaW4gLyBzaWduIHVwXG5cdFx0XHQhY29udGV4dC5hbm9ueW1vdXMgJiZcdFx0XHRcdFx0XHRcdFx0XHQvLyB1bmxlc3MgYW5vbnltb3VzIGFjY2VzcyBpcyBlbmFibGVkXG5cdFx0XHQhY29udGV4dC5oYXNCeW9rTW9kZWxzXHRcdFx0XHRcdFx0XHRcdFx0Ly8gdW5sZXNzIEJZT0sgbW9kZWxzIGFyZSBhdmFpbGFibGVcblx0XHQpXG5cdCk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2Uge1xuXG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUVudGl0bGVtZW50OiBFdmVudDx2b2lkPjtcblxuXHRyZWFkb25seSBlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50O1xuXHRyZWFkb25seSBlbnRpdGxlbWVudE9iczogSU9ic2VydmFibGU8Q2hhdEVudGl0bGVtZW50PjtcblxuXHRyZWFkb25seSBjbGllbnRCeW9rRW5hYmxlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgaGFzQnlva01vZGVsczogYm9vbGVhbjtcblxuXHRyZWFkb25seSBvcmdhbmlzYXRpb25zOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaXNJbnRlcm5hbDogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2t1OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNvcGlsb3RUcmFja2luZ0lkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VRdW90YUV4Y2VlZGVkOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VRdW90YVJlbWFpbmluZzogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVXNhZ2VCYXNlZEJpbGxpbmc6IEV2ZW50PHZvaWQ+O1xuXG5cdHJlYWRvbmx5IHF1b3RhczogSVF1b3RhcztcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlbnRpbWVudDogRXZlbnQ8dm9pZD47XG5cblx0cmVhZG9ubHkgc2VudGltZW50OiBJQ2hhdFNlbnRpbWVudDtcblx0cmVhZG9ubHkgc2VudGltZW50T2JzOiBJT2JzZXJ2YWJsZTxJQ2hhdFNlbnRpbWVudD47XG5cblx0Ly8gVE9ET0BicGFzZXJvIGV2ZW50dWFsbHkgdGhpcyB3aWxsIGJlY29tZSBlbmFibGVkIGJ5IGRlZmF1bHRcblx0Ly8gYW5kIGluIHRoYXQgY2FzZSB3ZSBvbmx5IG5lZWQgdG8gY2hlY2sgb24gZW50aXRsZW1lbnRzIGNoYW5nZVxuXHQvLyBiZXR3ZWVuIGB1bmtub3duYCBhbmQgYW55IG90aGVyIGVudGl0bGVtZW50LlxuXHRyZWFkb25seSBvbkRpZENoYW5nZUFub255bW91czogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IGFub255bW91czogYm9vbGVhbjtcblx0cmVhZG9ubHkgYW5vbnltb3VzT2JzOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRhY2NlcHRRdW90YXMocXVvdGFzOiBJUXVvdGFzKTogdm9pZDtcblxuXHQvKipcblx0ICogQ2xlYXIgYWxsIHF1b3RhIHN0YXRlLlxuXHQgKi9cblx0Y2xlYXJRdW90YXMoKTogdm9pZDtcblxuXHRtYXJrQW5vbnltb3VzUmF0ZUxpbWl0ZWQoKTogdm9pZDtcblxuXHQvKipcblx0ICogTWFyayB0aGUgY2hhdCBzZXR1cCBmbG93IGFzIGNvbXBsZXRlZC5cblx0ICovXG5cdG1hcmtTZXR1cENvbXBsZXRlZCgpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBGb3JjZSB0aGUgaGlkZGVuIHN0YXRlIG9uIG9yIG9mZiwgb3ZlcnJpZGluZyB0aGUgbm9ybWFsIGVudGl0bGVtZW50IGxvZ2ljLlxuXHQgKiBVc2VkIGJ5IHRoZSBhY2NvdW50IHBvbGljeSBnYXRlIHRvIGhpZGUgYWxsIEFJIGZlYXR1cmVzIHdoZW4gdGhlIGdhdGUgaXNcblx0ICogYWN0aXZlIGFuZCB1bnNhdGlzZmllZC5cblx0ICovXG5cdHNldEZvcmNlSGlkZGVuKGhpZGRlbjogYm9vbGVhbik6IHZvaWQ7XG5cblx0dXBkYXRlKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD47XG59XG5cbi8vI3JlZ2lvbiBIZWxwZXIgRnVuY3Rpb25zXG5cbi8qKlxuICogQ2hlY2tzIHRoZSBjaGF0IGVudGl0bGVtZW50cyB0byBzZWUgaWYgdGhlIHVzZXIgZmFsbHMgaW50byB0aGUgcGFpZCBjYXRlZ29yeVxuICogQHBhcmFtIGNoYXRFbnRpdGxlbWVudCBUaGUgY2hhdCBlbnRpdGxlbWVudCB0byBjaGVja1xuICogQHJldHVybnMgV2hldGhlciBvciBub3QgdGhleSBhcmUgYSBwYWlkIHVzZXJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzUHJvVXNlcihjaGF0RW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gY2hhdEVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRURVIHx8XG5cdFx0Y2hhdEVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuUHJvIHx8XG5cdFx0Y2hhdEVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuUHJvUGx1cyB8fFxuXHRcdGNoYXRFbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50Lk1heCB8fFxuXHRcdGNoYXRFbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkJ1c2luZXNzIHx8XG5cdFx0Y2hhdEVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRW50ZXJwcmlzZTtcbn1cblxuLyoqXG4gKiBHZXRzIHRoZSBmdWxsIHBsYW4gbmFtZSBmb3IgdGhlIGdpdmVuIGNoYXQgZW50aXRsZW1lbnRcbiAqIEBwYXJhbSBjaGF0RW50aXRsZW1lbnQgVGhlIGNoYXQgZW50aXRsZW1lbnQgdG8gZ2V0IHRoZSBwbGFuIG5hbWUgZm9yXG4gKiBAcmV0dXJucyBUaGUgbG9jYWxpemVkIGZ1bGwgcGxhbiBuYW1lIChlLmcuLCBcIkNvcGlsb3QgUHJvXCIsIFwiQ29waWxvdCBGcmVlXCIpXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRDaGF0UGxhbk5hbWUoY2hhdEVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKGNoYXRFbnRpdGxlbWVudCkge1xuXHRcdGNhc2UgQ2hhdEVudGl0bGVtZW50LkVEVTpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgncGxhbi5lZHVOYW1lJywgJ0NvcGlsb3QgU3R1ZGVudCcpO1xuXHRcdGNhc2UgQ2hhdEVudGl0bGVtZW50LlBybzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgncGxhbi5wcm9OYW1lJywgJ0NvcGlsb3QgUHJvJyk7XG5cdFx0Y2FzZSBDaGF0RW50aXRsZW1lbnQuUHJvUGx1czpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgncGxhbi5wcm9QbHVzTmFtZScsICdDb3BpbG90IFBybysnKTtcblx0XHRjYXNlIENoYXRFbnRpdGxlbWVudC5NYXg6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3BsYW4ubWF4TmFtZScsICdDb3BpbG90IE1heCcpO1xuXHRcdGNhc2UgQ2hhdEVudGl0bGVtZW50LkJ1c2luZXNzOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdwbGFuLmJ1c2luZXNzTmFtZScsICdDb3BpbG90IEJ1c2luZXNzJyk7XG5cdFx0Y2FzZSBDaGF0RW50aXRsZW1lbnQuRW50ZXJwcmlzZTpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgncGxhbi5lbnRlcnByaXNlTmFtZScsICdDb3BpbG90IEVudGVycHJpc2UnKTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdwbGFuLmZyZWVOYW1lJywgJ0NvcGlsb3QgRnJlZScpO1xuXHR9XG59XG5cbi8vI3JlZ2lvbiBTZXJ2aWNlIEltcGxlbWVudGF0aW9uXG5cbmNvbnN0IGRlZmF1bHRDaGF0QWdlbnQgPSB7XG5cdHVwZ3JhZGVQbGFuVXJsOiBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LnVwZ3JhZGVQbGFuVXJsID8/ICcnLFxuXHRwcm92aWRlclVyaVNldHRpbmc6IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8ucHJvdmlkZXJVcmlTZXR0aW5nID8/ICcnLFxuXHRlbnRpdGxlbWVudFNpZ251cExpbWl0ZWRVcmw6IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8uZW50aXRsZW1lbnRTaWdudXBMaW1pdGVkVXJsID8/ICcnLFxuXHRjaGF0UXVvdGFFeGNlZWRlZENvbnRleHQ6IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8uY2hhdFF1b3RhRXhjZWVkZWRDb250ZXh0ID8/ICcnLFxuXHRjb21wbGV0aW9uc1F1b3RhRXhjZWVkZWRDb250ZXh0OiBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LmNvbXBsZXRpb25zUXVvdGFFeGNlZWRlZENvbnRleHQgPz8gJydcbn07XG5cbmludGVyZmFjZSBJQ2hhdFF1b3Rhc0FjY2Vzc29yIHtcblx0Y2xlYXJRdW90YXMoKTogdm9pZDtcblx0YWNjZXB0UXVvdGFzKHF1b3RhczogSVF1b3Rhcyk6IHZvaWQ7XG59XG5cbmNvbnN0IENIQVRfQUxMT1dfQU5PTllNT1VTX0NPTkZJR1VSQVRJT05fS0VZID0gJ2NoYXQuYWxsb3dBbm9ueW1vdXNBY2Nlc3MnO1xuXG5mdW5jdGlvbiBpc0Fub255bW91cyhjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LCBzZW50aW1lbnQ6IElDaGF0U2VudGltZW50KTogYm9vbGVhbiB7XG5cdGlmIChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShDSEFUX0FMTE9XX0FOT05ZTU9VU19DT05GSUdVUkFUSU9OX0tFWSkgIT09IHRydWUpIHtcblx0XHRyZXR1cm4gZmFsc2U7IC8vIG9ubHkgZW5hYmxlZCBiZWhpbmQgYW4gZXhwZXJpbWVudGFsIHNldHRpbmdcblx0fVxuXG5cdGlmIChlbnRpdGxlbWVudCAhPT0gQ2hhdEVudGl0bGVtZW50LlVua25vd24pIHtcblx0XHRyZXR1cm4gZmFsc2U7IC8vIG9ubHkgY29uc2lkZXIgc2lnbmVkIG91dCB1c2Vyc1xuXHR9XG5cblx0aWYgKHNlbnRpbWVudC5oaWRkZW4gfHwgc2VudGltZW50LmRpc2FibGVkSW5Xb3Jrc3BhY2UpIHtcblx0XHRyZXR1cm4gZmFsc2U7IC8vIG9ubHkgY29uc2lkZXIgZW5hYmxlZCBzY2VuYXJpb3Ncblx0fVxuXG5cdHJldHVybiB0cnVlO1xufVxuXG50eXBlIENoYXRFbnRpdGxlbWVudENsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2JwYXNlcm8nO1xuXHRjb21tZW50OiAnUHJvdmlkZXMgaW5zaWdodCBpbnRvIGNoYXQgZW50aXRsZW1lbnRzLic7XG5cdGNoYXRIaWRkZW46IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIGNoYXQgaXMgaGlkZGVuIG9yIG5vdC4nIH07XG5cdGNoYXRFbnRpdGxlbWVudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBjdXJyZW50IGNoYXQgZW50aXRsZW1lbnQgb2YgdGhlIHVzZXIuJyB9O1xuXHRjaGF0QW5vbnltb3VzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgdXNlciBpcyBhbm9ueW1vdXNseSB1c2luZyBjaGF0LicgfTtcblx0Y2hhdFJlZ2lzdGVyZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSB1c2VyIGlzIHJlZ2lzdGVyZWQgZm9yIGNoYXQuJyB9O1xuXHRjaGF0RGlzYWJsZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIGNoYXQgaXMgZGlzYWJsZWQgb3Igbm90LicgfTtcbn07XG50eXBlIENoYXRFbnRpdGxlbWVudEV2ZW50ID0ge1xuXHRjaGF0SGlkZGVuOiBib29sZWFuO1xuXHRjaGF0RW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudDtcblx0Y2hhdEFub255bW91czogYm9vbGVhbjtcblx0Y2hhdFJlZ2lzdGVyZWQ6IGJvb2xlYW47XG5cdGNoYXREaXNhYmxlZDogYm9vbGVhbjtcbn07XG5cbmZ1bmN0aW9uIGxvZ0NoYXRFbnRpdGxlbWVudHMoc3RhdGU6IElDaGF0RW50aXRsZW1lbnRDb250ZXh0U3RhdGUsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlKTogdm9pZCB7XG5cdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0RW50aXRsZW1lbnRFdmVudCwgQ2hhdEVudGl0bGVtZW50Q2xhc3NpZmljYXRpb24+KCdjaGF0RW50aXRsZW1lbnRzJywge1xuXHRcdGNoYXRIaWRkZW46IEJvb2xlYW4oc3RhdGUuaGlkZGVuKSxcblx0XHRjaGF0RGlzYWJsZWQ6IEJvb2xlYW4oc3RhdGUuZGlzYWJsZWQpLFxuXHRcdGNoYXRFbnRpdGxlbWVudDogc3RhdGUuZW50aXRsZW1lbnQsXG5cdFx0Y2hhdFJlZ2lzdGVyZWQ6IEJvb2xlYW4oc3RhdGUucmVnaXN0ZXJlZCksXG5cdFx0Y2hhdEFub255bW91czogaXNBbm9ueW1vdXMoY29uZmlndXJhdGlvblNlcnZpY2UsIHN0YXRlLmVudGl0bGVtZW50LCBzdGF0ZSlcblx0fSk7XG59XG5cbnR5cGUgQ2hhdEFkZGl0aW9uYWxTcGVuZENvbmZpZ3VyYXRpb25DbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdwd2FuZzM0Nyc7XG5cdGNvbW1lbnQ6ICdUcmFja3Mgd2hlbiBhIHVzZXIgZW5hYmxlcyBvciBkaXNhYmxlcyBhZGRpdGlvbmFsIHNwZW5kLic7XG5cdGVuYWJsZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIGFkZGl0aW9uYWwgc3BlbmQgaXMgbm93IGVuYWJsZWQgb3IgZGlzYWJsZWQuJyB9O1xuXHRlbnRpdGxlbWVudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBjdXJyZW50IGNoYXQgZW50aXRsZW1lbnQgb2YgdGhlIHVzZXIuJyB9O1xufTtcbnR5cGUgQ2hhdEFkZGl0aW9uYWxTcGVuZENvbmZpZ3VyYXRpb25FdmVudCA9IHtcblx0ZW5hYmxlZDogYm9vbGVhbjtcblx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudDtcbn07XG5cbnR5cGUgQ2hhdEFkZGl0aW9uYWxTcGVuZEFjdGl2ZUNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ3B3YW5nMzQ3Jztcblx0Y29tbWVudDogJ1RyYWNrcyB3aGVuIGEgdXNlciBlbnRlcnMgYWRkaXRpb25hbCBzcGVuZCAoaW5jbHVkZWQgcXVvdGEgZXhoYXVzdGVkIHdoaWxlIGFkZGl0aW9uYWwgc3BlbmQgaXMgZW5hYmxlZCkuJztcblx0ZW50aXRsZW1lbnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgY3VycmVudCBjaGF0IGVudGl0bGVtZW50IG9mIHRoZSB1c2VyLicgfTtcblx0YWRkaXRpb25hbFVzYWdlQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIGFkZGl0aW9uYWwgc3BlbmQgaW50ZXJhY3Rpb25zIHVzZWQgc28gZmFyLicgfTtcbn07XG50eXBlIENoYXRBZGRpdGlvbmFsU3BlbmRBY3RpdmVFdmVudCA9IHtcblx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudDtcblx0YWRkaXRpb25hbFVzYWdlQ291bnQ6IG51bWJlcjtcbn07XG5cbmV4cG9ydCBjbGFzcyBDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDQUNIRURfVUJCX1NUT1JBR0VfS0VZID0gJ2NoYXQudXNhZ2VCYXNlZEJpbGxpbmcnO1xuXG5cdHJlYWRvbmx5IGNvbnRleHQ6IExhenk8Q2hhdEVudGl0bGVtZW50Q29udGV4dD4gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHJlcXVlc3RzOiBMYXp5PENoYXRFbnRpdGxlbWVudFJlcXVlc3RzPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGNhY2hlZFVCQiA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLkNBQ0hFRF9VQkJfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHR0aGlzLl9xdW90YXMgPSBjYWNoZWRVQkIgIT09IHVuZGVmaW5lZCA/IHsgdXNhZ2VCYXNlZEJpbGxpbmc6IGNhY2hlZFVCQiB9IDoge307XG5cblx0XHR0aGlzLmNoYXRRdW90YUV4Y2VlZGVkQ29udGV4dEtleSA9IENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLmNoYXRRdW90YUV4Y2VlZGVkLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmNvbXBsZXRpb25zUXVvdGFFeGNlZWRlZENvbnRleHRLZXkgPSBDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5jb21wbGV0aW9uc1F1b3RhRXhjZWVkZWQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5hbm9ueW1vdXNDb250ZXh0S2V5ID0gQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuY2hhdEFub255bW91cy5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5hbm9ueW1vdXNDb250ZXh0S2V5LnNldCh0aGlzLmFub255bW91cyk7XG5cblx0XHQvLyBPbmx5IGFwcGx5IHRoZSB3b3JrYmVuY2gtc2lkZSBkZWZhdWx0IGlmIG5vIG90aGVyIHNvdXJjZSAoZS5nLiB0aGUgQ29waWxvdCBleHRlbnNpb24pXG5cdFx0Ly8gaGFzIGFscmVhZHkgc2V0IHRoaXMga2V5OyBiaW5kaW5nIHdvdWxkIG90aGVyd2lzZSByZXNldCBpdCB0byB0aGUgZGVjbGFyZWQgZGVmYXVsdC5cblx0XHRpZiAodGhpcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuY2xpZW50Qnlva0VuYWJsZWQua2V5KSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5jbGllbnRCeW9rRW5hYmxlZC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5vbkRpZENoYW5nZUVudGl0bGVtZW50ID0gRXZlbnQubWFwKFxuXHRcdFx0RXZlbnQuZmlsdGVyKFxuXHRcdFx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dCwgZSA9PiBlLmFmZmVjdHNTb21lKG5ldyBTZXQoW1xuXHRcdFx0XHRcdENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5FZHUua2V5LFxuXHRcdFx0XHRcdENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5Qcm8ua2V5LFxuXHRcdFx0XHRcdENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5CdXNpbmVzcy5rZXksXG5cdFx0XHRcdFx0Q2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuRW50aXRsZW1lbnQucGxhbkVudGVycHJpc2Uua2V5LFxuXHRcdFx0XHRcdENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5Qcm9QbHVzLmtleSxcblx0XHRcdFx0XHRDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5wbGFuTWF4LmtleSxcblx0XHRcdFx0XHRDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5wbGFuRnJlZS5rZXksXG5cdFx0XHRcdFx0Q2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuRW50aXRsZW1lbnQuY2FuU2lnblVwLmtleSxcblx0XHRcdFx0XHRDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5zaWduZWRPdXQua2V5LFxuXHRcdFx0XHRcdENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLkVudGl0bGVtZW50Lm9yZ2FuaXNhdGlvbnMua2V5LFxuXHRcdFx0XHRcdENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLkVudGl0bGVtZW50LmludGVybmFsLmtleSxcblx0XHRcdFx0XHRDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5za3Uua2V5XG5cdFx0XHRcdF0pKSwgdGhpcy5fc3RvcmVcblx0XHRcdCksICgpID0+IHsgfSwgdGhpcy5fc3RvcmVcblx0XHQpO1xuXHRcdHRoaXMuZW50aXRsZW1lbnRPYnMgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMub25EaWRDaGFuZ2VFbnRpdGxlbWVudCwgKCkgPT4gdGhpcy5lbnRpdGxlbWVudCk7XG5cblx0XHR0aGlzLm9uRGlkQ2hhbmdlU2VudGltZW50ID0gRXZlbnQubWFwKFxuXHRcdFx0RXZlbnQuZmlsdGVyKFxuXHRcdFx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dCwgZSA9PiBlLmFmZmVjdHNTb21lKG5ldyBTZXQoW1xuXHRcdFx0XHRcdENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLlNldHVwLmNvbXBsZXRlZC5rZXksXG5cdFx0XHRcdFx0Q2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLmtleSxcblx0XHRcdFx0XHRDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5TZXR1cC5kaXNhYmxlZC5rZXksXG5cdFx0XHRcdFx0Q2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuU2V0dXAudW50cnVzdGVkLmtleSxcblx0XHRcdFx0XHRDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5TZXR1cC5pbnN0YWxsZWQua2V5LFxuXHRcdFx0XHRcdENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLlNldHVwLmxhdGVyLmtleSxcblx0XHRcdFx0XHRDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5TZXR1cC5yZWdpc3RlcmVkLmtleVxuXHRcdFx0XHRdKSksIHRoaXMuX3N0b3JlXG5cdFx0XHQpLCAoKSA9PiB7IH0sIHRoaXMuX3N0b3JlXG5cdFx0KTtcblx0XHR0aGlzLnNlbnRpbWVudE9icyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcy5vbkRpZENoYW5nZVNlbnRpbWVudCwgKCkgPT4gdGhpcy5zZW50aW1lbnQpO1xuXG5cdFx0aWYgKChpc1dlYiAmJiAhZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSAmJiAhZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cpKSB7XG5cdFx0XHRDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4uYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpLnNldCh0cnVlKTsgLy8gaGlkZSBjb3BpbG90IFVJIG9uIHdlYiBpZiB1bnN1cHBvcnRlZFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghcHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudCkge1xuXHRcdFx0cmV0dXJuOyAvLyB3ZSBuZWVkIGEgZGVmYXVsdCBjaGF0IGFnZW50IGNvbmZpZ3VyZWQgZ29pbmcgZm9yd2FyZCBmcm9tIGhlcmVcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5jb250ZXh0ID0gbmV3IExhenkoKCkgPT4gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVudGl0bGVtZW50Q29udGV4dCkpKTtcblx0XHR0aGlzLnJlcXVlc3RzID0gbmV3IExhenkoKCkgPT4gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVudGl0bGVtZW50UmVxdWVzdHMsIGNvbnRleHQudmFsdWUsIHtcblx0XHRcdGNsZWFyUXVvdGFzOiAoKSA9PiB0aGlzLmNsZWFyUXVvdGFzKCksXG5cdFx0XHRhY2NlcHRRdW90YXM6IHF1b3RhcyA9PiB0aGlzLmFjY2VwdFF1b3RhcyhxdW90YXMpXG5cdFx0fSkpKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiAtLS0gRW50aXRsZW1lbnRzXG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFbnRpdGxlbWVudDogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IGVudGl0bGVtZW50T2JzOiBJT2JzZXJ2YWJsZTxDaGF0RW50aXRsZW1lbnQ+O1xuXG5cdGdldCBlbnRpdGxlbWVudCgpOiBDaGF0RW50aXRsZW1lbnQge1xuXHRcdGlmICh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxib29sZWFuPihDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5wbGFuRWR1LmtleSkgPT09IHRydWUpIHtcblx0XHRcdHJldHVybiBDaGF0RW50aXRsZW1lbnQuRURVO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuRW50aXRsZW1lbnQucGxhblByby5rZXkpID09PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdEVudGl0bGVtZW50LlBybztcblx0XHR9IGVsc2UgaWYgKHRoaXMuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPGJvb2xlYW4+KENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5CdXNpbmVzcy5rZXkpID09PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdEVudGl0bGVtZW50LkJ1c2luZXNzO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuRW50aXRsZW1lbnQucGxhbkVudGVycHJpc2Uua2V5KSA9PT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuIENoYXRFbnRpdGxlbWVudC5FbnRlcnByaXNlO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuRW50aXRsZW1lbnQucGxhblByb1BsdXMua2V5KSA9PT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuIENoYXRFbnRpdGxlbWVudC5Qcm9QbHVzO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuRW50aXRsZW1lbnQucGxhbk1heC5rZXkpID09PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdEVudGl0bGVtZW50Lk1heDtcblx0XHR9IGVsc2UgaWYgKHRoaXMuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPGJvb2xlYW4+KENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5GcmVlLmtleSkgPT09IHRydWUpIHtcblx0XHRcdHJldHVybiBDaGF0RW50aXRsZW1lbnQuRnJlZTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPGJvb2xlYW4+KENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLkVudGl0bGVtZW50LmNhblNpZ25VcC5rZXkpID09PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdEVudGl0bGVtZW50LkF2YWlsYWJsZTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPGJvb2xlYW4+KENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLkVudGl0bGVtZW50LnNpZ25lZE91dC5rZXkpID09PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdEVudGl0bGVtZW50LlVua25vd247XG5cdFx0fVxuXG5cdFx0cmV0dXJuIENoYXRFbnRpdGxlbWVudC5VbnJlc29sdmVkO1xuXHR9XG5cblx0Z2V0IGlzSW50ZXJuYWwoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPGJvb2xlYW4+KENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLkVudGl0bGVtZW50LmludGVybmFsLmtleSkgPT09IHRydWU7XG5cdH1cblxuXHRnZXQgb3JnYW5pc2F0aW9ucygpOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPHN0cmluZ1tdPihDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5vcmdhbmlzYXRpb25zLmtleSk7XG5cdH1cblxuXHRnZXQgc2t1KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPHN0cmluZz4oQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuRW50aXRsZW1lbnQuc2t1LmtleSk7XG5cdH1cblxuXHRnZXQgY29waWxvdFRyYWNraW5nSWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5jb250ZXh0Py52YWx1ZS5zdGF0ZS5jb3BpbG90VHJhY2tpbmdJZDtcblx0fVxuXG5cdGdldCBjbGllbnRCeW9rRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oJ2dpdGh1Yi5jb3BpbG90LmNsaWVudEJ5b2tFbmFibGVkJykgPT09IHRydWU7XG5cdH1cblxuXHRnZXQgaGFzQnlva01vZGVscygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oJ2dpdGh1Yi5jb3BpbG90Lmhhc0J5b2tNb2RlbHMnKSA9PT0gdHJ1ZTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiAtLS0gUXVvdGFzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VRdW90YUV4Y2VlZGVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUXVvdGFFeGNlZWRlZCA9IHRoaXMuX29uRGlkQ2hhbmdlUXVvdGFFeGNlZWRlZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVF1b3RhUmVtYWluaW5nID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUXVvdGFSZW1haW5pbmcgPSB0aGlzLl9vbkRpZENoYW5nZVF1b3RhUmVtYWluaW5nLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVXNhZ2VCYXNlZEJpbGxpbmcgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VVc2FnZUJhc2VkQmlsbGluZyA9IHRoaXMuX29uRGlkQ2hhbmdlVXNhZ2VCYXNlZEJpbGxpbmcuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfcXVvdGFzOiBJUXVvdGFzO1xuXHRwcml2YXRlIHF1b3RhQ29waWxvdFRyYWNraW5nSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0IHF1b3RhcygpIHsgcmV0dXJuIHRoaXMuX3F1b3RhczsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2hhdFF1b3RhRXhjZWVkZWRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBjb21wbGV0aW9uc1F1b3RhRXhjZWVkZWRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIEV4dGVuc2lvblF1b3RhQ29udGV4dEtleXMgPSB7XG5cdFx0Y2hhdFF1b3RhRXhjZWVkZWQ6IGRlZmF1bHRDaGF0QWdlbnQuY2hhdFF1b3RhRXhjZWVkZWRDb250ZXh0LFxuXHRcdGNvbXBsZXRpb25zUXVvdGFFeGNlZWRlZDogZGVmYXVsdENoYXRBZ2VudC5jb21wbGV0aW9uc1F1b3RhRXhjZWVkZWRDb250ZXh0LFxuXHR9O1xuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgcXVvdGFFeGNlZWRlZFNldCA9IG5ldyBTZXQoW3RoaXMuRXh0ZW5zaW9uUXVvdGFDb250ZXh0S2V5cy5jaGF0UXVvdGFFeGNlZWRlZCwgdGhpcy5FeHRlbnNpb25RdW90YUNvbnRleHRLZXlzLmNvbXBsZXRpb25zUXVvdGFFeGNlZWRlZF0pO1xuXG5cdFx0Y29uc3QgY3RzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPENhbmNlbGxhdGlvblRva2VuU291cmNlPigpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKHF1b3RhRXhjZWVkZWRTZXQpKSB7XG5cdFx0XHRcdGlmIChjdHMudmFsdWUpIHtcblx0XHRcdFx0XHRjdHMudmFsdWUuY2FuY2VsKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y3RzLnZhbHVlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRcdHRoaXMudXBkYXRlKGN0cy52YWx1ZS50b2tlbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bGV0IGFub255bW91c1VzYWdlID0gdGhpcy5hbm9ueW1vdXM7XG5cblx0XHRjb25zdCB1cGRhdGVBbm9ueW1vdXNVc2FnZSA9ICgpID0+IHtcblx0XHRcdGNvbnN0IG5ld0Fub255bW91c1VzYWdlID0gdGhpcy5hbm9ueW1vdXM7XG5cdFx0XHRpZiAobmV3QW5vbnltb3VzVXNhZ2UgIT09IGFub255bW91c1VzYWdlKSB7XG5cdFx0XHRcdGFub255bW91c1VzYWdlID0gbmV3QW5vbnltb3VzVXNhZ2U7XG5cdFx0XHRcdHRoaXMuYW5vbnltb3VzQ29udGV4dEtleS5zZXQobmV3QW5vbnltb3VzVXNhZ2UpO1xuXG5cdFx0XHRcdGlmICh0aGlzLmNvbnRleHQ/Lmhhc1ZhbHVlKSB7XG5cdFx0XHRcdFx0bG9nQ2hhdEVudGl0bGVtZW50cyh0aGlzLmNvbnRleHQudmFsdWUuc3RhdGUsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMudGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFub255bW91cy5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ0hBVF9BTExPV19BTk9OWU1PVVNfQ09ORklHVVJBVElPTl9LRVkpKSB7XG5cdFx0XHRcdHVwZGF0ZUFub255bW91c1VzYWdlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUVudGl0bGVtZW50KCgpID0+IHVwZGF0ZUFub255bW91c1VzYWdlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlU2VudGltZW50KCgpID0+IHVwZGF0ZUFub255bW91c1VzYWdlKCkpKTtcblx0fVxuXG5cdGFjY2VwdFF1b3RhcyhpbmNvbWluZ1F1b3RhczogSVF1b3Rhcyk6IHZvaWQge1xuXHRcdGNvbnN0IG9sZFF1b3RhID0gdGhpcy5fcXVvdGFzO1xuXHRcdGNvbnN0IGNhY2hlZFF1b3RhID0gdGhpcy5xdW90YUNvcGlsb3RUcmFja2luZ0lkID09PSB0aGlzLmNvcGlsb3RUcmFja2luZ0lkID8gb2xkUXVvdGEgOiB7fTtcblx0XHRjb25zdCBxdW90YXM6IElRdW90YXMgPSB7XG5cdFx0XHQuLi5pbmNvbWluZ1F1b3Rhcyxcblx0XHRcdGNoYXQ6IGluY29taW5nUXVvdGFzLmNoYXQgPyBtZXJnZURlZmluZWRTbmFwc2hvdChjYWNoZWRRdW90YS5jaGF0LCBpbmNvbWluZ1F1b3Rhcy5jaGF0KSA6IHVuZGVmaW5lZCxcblx0XHRcdGNvbXBsZXRpb25zOiBpbmNvbWluZ1F1b3Rhcy5jb21wbGV0aW9ucyA/IG1lcmdlRGVmaW5lZFNuYXBzaG90KGNhY2hlZFF1b3RhLmNvbXBsZXRpb25zLCBpbmNvbWluZ1F1b3Rhcy5jb21wbGV0aW9ucykgOiB1bmRlZmluZWQsXG5cdFx0XHRwcmVtaXVtQ2hhdDogaW5jb21pbmdRdW90YXMucHJlbWl1bUNoYXQgPyBtZXJnZURlZmluZWRTbmFwc2hvdChjYWNoZWRRdW90YS5wcmVtaXVtQ2hhdCwgaW5jb21pbmdRdW90YXMucHJlbWl1bUNoYXQpIDogdW5kZWZpbmVkLFxuXHRcdFx0c2Vzc2lvblJhdGVMaW1pdDogaW5jb21pbmdRdW90YXMuc2Vzc2lvblJhdGVMaW1pdCA/IG1lcmdlRGVmaW5lZFNuYXBzaG90KGNhY2hlZFF1b3RhLnNlc3Npb25SYXRlTGltaXQsIGluY29taW5nUXVvdGFzLnNlc3Npb25SYXRlTGltaXQpIDogdW5kZWZpbmVkLFxuXHRcdFx0d2Vla2x5UmF0ZUxpbWl0OiBpbmNvbWluZ1F1b3Rhcy53ZWVrbHlSYXRlTGltaXQgPyBtZXJnZURlZmluZWRTbmFwc2hvdChjYWNoZWRRdW90YS53ZWVrbHlSYXRlTGltaXQsIGluY29taW5nUXVvdGFzLndlZWtseVJhdGVMaW1pdCkgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0XHR0aGlzLnF1b3RhQ29waWxvdFRyYWNraW5nSWQgPSB0aGlzLmNvcGlsb3RUcmFja2luZ0lkO1xuXHRcdHRoaXMuX3F1b3RhcyA9IHF1b3Rhcztcblx0XHR0aGlzLnVwZGF0ZUNvbnRleHRLZXlzKCk7XG5cblx0XHRpZiAob2xkUXVvdGEudXNhZ2VCYXNlZEJpbGxpbmcgIT09IHF1b3Rhcy51c2FnZUJhc2VkQmlsbGluZykge1xuXHRcdFx0aWYgKHF1b3Rhcy51c2FnZUJhc2VkQmlsbGluZyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ2hhdEVudGl0bGVtZW50U2VydmljZS5DQUNIRURfVUJCX1NUT1JBR0VfS0VZLCBxdW90YXMudXNhZ2VCYXNlZEJpbGxpbmcsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoQ2hhdEVudGl0bGVtZW50U2VydmljZS5DQUNIRURfVUJCX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubG9nU2VydmljZS5nZXRMZXZlbCgpID09PSBMb2dMZXZlbC5UcmFjZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbY2hhdCBlbnRpdGxlbWVudF06IGFjY2VwdFF1b3RhczogJHtKU09OLnN0cmluZ2lmeShxdW90YXMpfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgY2hhbmdlZDogY2hhdENoYW5nZWQgfSA9IHRoaXMuY29tcGFyZVF1b3RhcyhvbGRRdW90YS5jaGF0LCBxdW90YXMuY2hhdCk7XG5cdFx0Y29uc3QgeyBjaGFuZ2VkOiBjb21wbGV0aW9uc0NoYW5nZWQgfSA9IHRoaXMuY29tcGFyZVF1b3RhcyhvbGRRdW90YS5jb21wbGV0aW9ucywgcXVvdGFzLmNvbXBsZXRpb25zKTtcblx0XHRjb25zdCB7IGNoYW5nZWQ6IHByZW1pdW1DaGF0Q2hhbmdlZCB9ID0gdGhpcy5jb21wYXJlUXVvdGFzKG9sZFF1b3RhLnByZW1pdW1DaGF0LCBxdW90YXMucHJlbWl1bUNoYXQpO1xuXG5cdFx0aWYgKGNoYXRDaGFuZ2VkLmV4Y2VlZGVkIHx8IGNvbXBsZXRpb25zQ2hhbmdlZC5leGNlZWRlZCB8fCBwcmVtaXVtQ2hhdENoYW5nZWQuZXhjZWVkZWQpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUXVvdGFFeGNlZWRlZC5maXJlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvblJhdGVMaW1pdENoYW5nZWQgPSBvbGRRdW90YS5zZXNzaW9uUmF0ZUxpbWl0Py5wZXJjZW50UmVtYWluaW5nICE9PSBxdW90YXMuc2Vzc2lvblJhdGVMaW1pdD8ucGVyY2VudFJlbWFpbmluZztcblx0XHRjb25zdCB3ZWVrbHlSYXRlTGltaXRDaGFuZ2VkID0gb2xkUXVvdGEud2Vla2x5UmF0ZUxpbWl0Py5wZXJjZW50UmVtYWluaW5nICE9PSBxdW90YXMud2Vla2x5UmF0ZUxpbWl0Py5wZXJjZW50UmVtYWluaW5nO1xuXG5cdFx0aWYgKGNoYXRDaGFuZ2VkLnJlbWFpbmluZyB8fCBjb21wbGV0aW9uc0NoYW5nZWQucmVtYWluaW5nIHx8IHByZW1pdW1DaGF0Q2hhbmdlZC5yZW1haW5pbmcgfHwgc2Vzc2lvblJhdGVMaW1pdENoYW5nZWQgfHwgd2Vla2x5UmF0ZUxpbWl0Q2hhbmdlZCB8fCBvbGRRdW90YS51c2FnZUJhc2VkQmlsbGluZyAhPT0gcXVvdGFzLnVzYWdlQmFzZWRCaWxsaW5nKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVF1b3RhUmVtYWluaW5nLmZpcmUoKTtcblx0XHR9XG5cblx0XHRpZiAob2xkUXVvdGEudXNhZ2VCYXNlZEJpbGxpbmcgIT09IHF1b3Rhcy51c2FnZUJhc2VkQmlsbGluZykge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VVc2FnZUJhc2VkQmlsbGluZy5maXJlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gVHJhY2sgYWRkaXRpb25hbCBzcGVuZCBjb25maWd1cmF0aW9uIGNoYW5nZXMgKG9ubHkgd2hlbiBib3RoIHZhbHVlcyBjb21lIGZyb20gc2VydmVyIHNuYXBzaG90cylcblx0XHRpZiAob2xkUXVvdGEuYWRkaXRpb25hbFVzYWdlRW5hYmxlZCAhPT0gdW5kZWZpbmVkICYmIHF1b3Rhcy5hZGRpdGlvbmFsVXNhZ2VFbmFibGVkICE9PSB1bmRlZmluZWQgJiYgb2xkUXVvdGEuYWRkaXRpb25hbFVzYWdlRW5hYmxlZCAhPT0gcXVvdGFzLmFkZGl0aW9uYWxVc2FnZUVuYWJsZWQpIHtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRBZGRpdGlvbmFsU3BlbmRDb25maWd1cmF0aW9uRXZlbnQsIENoYXRBZGRpdGlvbmFsU3BlbmRDb25maWd1cmF0aW9uQ2xhc3NpZmljYXRpb24+KCdjaGF0QWRkaXRpb25hbFNwZW5kQ29uZmlndXJhdGlvbicsIHtcblx0XHRcdFx0ZW5hYmxlZDogcXVvdGFzLmFkZGl0aW9uYWxVc2FnZUVuYWJsZWQgPz8gZmFsc2UsXG5cdFx0XHRcdGVudGl0bGVtZW50OiB0aGlzLmVudGl0bGVtZW50LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gVHJhY2sgZW50ZXJpbmcgYWRkaXRpb25hbCBzcGVuZDogaW5jbHVkZWQgcXVvdGEganVzdCBleGhhdXN0ZWQgd2hpbGUgYWRkaXRpb25hbCBzcGVuZCBpcyBlbmFibGVkXG5cdFx0aWYgKHF1b3Rhcy5hZGRpdGlvbmFsVXNhZ2VFbmFibGVkICYmIHF1b3Rhcy5wcmVtaXVtQ2hhdD8ucGVyY2VudFJlbWFpbmluZyA9PT0gMFxuXHRcdFx0JiYgb2xkUXVvdGEucHJlbWl1bUNoYXQ/LnBlcmNlbnRSZW1haW5pbmcgIT09IHVuZGVmaW5lZCAmJiBvbGRRdW90YS5wcmVtaXVtQ2hhdC5wZXJjZW50UmVtYWluaW5nID4gMCkge1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdEFkZGl0aW9uYWxTcGVuZEFjdGl2ZUV2ZW50LCBDaGF0QWRkaXRpb25hbFNwZW5kQWN0aXZlQ2xhc3NpZmljYXRpb24+KCdjaGF0QWRkaXRpb25hbFNwZW5kQWN0aXZlJywge1xuXHRcdFx0XHRlbnRpdGxlbWVudDogdGhpcy5lbnRpdGxlbWVudCxcblx0XHRcdFx0YWRkaXRpb25hbFVzYWdlQ291bnQ6IHF1b3Rhcy5hZGRpdGlvbmFsVXNhZ2VDb3VudCA/PyAwLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjb21wYXJlUXVvdGFzKG9sZFF1b3RhOiBJUXVvdGFTbmFwc2hvdCB8IHVuZGVmaW5lZCwgbmV3UXVvdGE6IElRdW90YVNuYXBzaG90IHwgdW5kZWZpbmVkKTogeyBjaGFuZ2VkOiB7IGV4Y2VlZGVkOiBib29sZWFuOyByZW1haW5pbmc6IGJvb2xlYW4gfSB9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2hhbmdlZDoge1xuXHRcdFx0XHRleGNlZWRlZDogKG9sZFF1b3RhPy5wZXJjZW50UmVtYWluaW5nID09PSAwKSAhPT0gKG5ld1F1b3RhPy5wZXJjZW50UmVtYWluaW5nID09PSAwKSxcblx0XHRcdFx0cmVtYWluaW5nOiBvbGRRdW90YT8ucGVyY2VudFJlbWFpbmluZyAhPT0gbmV3UXVvdGE/LnBlcmNlbnRSZW1haW5pbmdcblx0XHRcdFx0XHR8fCBvbGRRdW90YT8udXNhZ2VCYXNlZEJpbGxpbmcgIT09IG5ld1F1b3RhPy51c2FnZUJhc2VkQmlsbGluZ1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRjbGVhclF1b3RhcygpOiB2b2lkIHtcblx0XHR0aGlzLmFjY2VwdFF1b3Rhcyh7fSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbnRleHRLZXlzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYXRFeGhhdXN0ZWQgPSB0aGlzLl9xdW90YXMuY2hhdD8ucGVyY2VudFJlbWFpbmluZyA9PT0gMDtcblx0XHRjb25zdCBwcmVtaXVtQ2hhdEV4aGF1c3RlZCA9IHRoaXMuX3F1b3Rhcy5wcmVtaXVtQ2hhdD8udW5saW1pdGVkXG5cdFx0XHQ/IHRoaXMuX3F1b3Rhcy5wcmVtaXVtQ2hhdC5oYXNRdW90YSA9PT0gZmFsc2Vcblx0XHRcdDogdGhpcy5fcXVvdGFzLnByZW1pdW1DaGF0Py5wZXJjZW50UmVtYWluaW5nID09PSAwO1xuXHRcdGNvbnN0IGFkZGl0aW9uYWxVc2FnZUVuYWJsZWQgPSB0aGlzLl9xdW90YXMuYWRkaXRpb25hbFVzYWdlRW5hYmxlZCA/PyBmYWxzZTtcblx0XHRjb25zdCBpc01hbmFnZWRQbGFuID0gdGhpcy5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkJ1c2luZXNzIHx8IHRoaXMuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5FbnRlcnByaXNlO1xuXG5cdFx0Ly8gRm9yIEJ1c2luZXNzL0VudGVycHJpc2UgdXNlcnMsIGhhc1F1b3RhID09PSBmYWxzZSBpcyB0aGUgYXV0aG9yaXRhdGl2ZSBzaWduYWxcblx0XHQvLyB0aGF0IHRoZSBvcmcgaGFzIGJsb2NrZWQgdXNhZ2UsIHJlZ2FyZGxlc3Mgb2YgYWRkaXRpb25hbFVzYWdlRW5hYmxlZC5cblx0XHR0aGlzLmNoYXRRdW90YUV4Y2VlZGVkQ29udGV4dEtleS5zZXQoY2hhdEV4aGF1c3RlZCB8fCAocHJlbWl1bUNoYXRFeGhhdXN0ZWQgJiYgKGlzTWFuYWdlZFBsYW4gfHwgIWFkZGl0aW9uYWxVc2FnZUVuYWJsZWQpKSk7XG5cdFx0dGhpcy5jb21wbGV0aW9uc1F1b3RhRXhjZWVkZWRDb250ZXh0S2V5LnNldCh0aGlzLl9xdW90YXMuY29tcGxldGlvbnM/LnBlcmNlbnRSZW1haW5pbmcgPT09IDApO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIC0tLSBTZW50aW1lbnRcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlbnRpbWVudDogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IHNlbnRpbWVudE9iczogSU9ic2VydmFibGU8SUNoYXRTZW50aW1lbnQ+O1xuXG5cdGdldCBzZW50aW1lbnQoKTogSUNoYXRTZW50aW1lbnQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb21wbGV0ZWQ6IHRoaXMuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPGJvb2xlYW4+KENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLlNldHVwLmNvbXBsZXRlZC5rZXkpID09PSB0cnVlLFxuXHRcdFx0aW5zdGFsbGVkOiB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxib29sZWFuPihDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5TZXR1cC5pbnN0YWxsZWQua2V5KSA9PT0gdHJ1ZSxcblx0XHRcdGhpZGRlbjogdGhpcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLmtleSkgPT09IHRydWUsXG5cdFx0XHRkaXNhYmxlZEluV29ya3NwYWNlOiB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxib29sZWFuPihDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5TZXR1cC5kaXNhYmxlZEluV29ya3NwYWNlLmtleSkgPT09IHRydWUsXG5cdFx0XHRkaXNhYmxlZDogdGhpcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWQua2V5KSA9PT0gdHJ1ZSxcblx0XHRcdHVudHJ1c3RlZDogdGhpcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuU2V0dXAudW50cnVzdGVkLmtleSkgPT09IHRydWUsXG5cdFx0XHRsYXRlcjogdGhpcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuU2V0dXAubGF0ZXIua2V5KSA9PT0gdHJ1ZSxcblx0XHRcdHJlZ2lzdGVyZWQ6IHRoaXMuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPGJvb2xlYW4+KENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLlNldHVwLnJlZ2lzdGVyZWQua2V5KSA9PT0gdHJ1ZVxuXHRcdH07XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvL3JlZ2lvbiAtLS0gQW5vbnltb3VzXG5cblx0cHJpdmF0ZSByZWFkb25seSBhbm9ueW1vdXNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFub255bW91cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFub255bW91cyA9IHRoaXMuX29uRGlkQ2hhbmdlQW5vbnltb3VzLmV2ZW50O1xuXG5cdHJlYWRvbmx5IGFub255bW91c09icyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcy5vbkRpZENoYW5nZUFub255bW91cywgKCkgPT4gdGhpcy5hbm9ueW1vdXMpO1xuXG5cdGdldCBhbm9ueW1vdXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzQW5vbnltb3VzKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuZW50aXRsZW1lbnQsIHRoaXMuc2VudGltZW50KTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdG1hcmtBbm9ueW1vdXNSYXRlTGltaXRlZCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuYW5vbnltb3VzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5jaGF0UXVvdGFFeGNlZWRlZENvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUXVvdGFFeGNlZWRlZC5maXJlKCk7XG5cdH1cblxuXHRtYXJrU2V0dXBDb21wbGV0ZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5jb250ZXh0Py52YWx1ZS51cGRhdGUoeyBjb21wbGV0ZWQ6IHRydWUgfSk7XG5cdH1cblxuXHRzZXRGb3JjZUhpZGRlbihoaWRkZW46IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jb250ZXh0KSB7XG5cdFx0XHR0aGlzLmNvbnRleHQudmFsdWUuc2V0Rm9yY2VIaWRkZW4oaGlkZGVuKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTm8gQ2hhdEVudGl0bGVtZW50Q29udGV4dCAoZS5nLiBubyBkZWZhdWx0Q2hhdEFnZW50IGluIHByb2R1Y3QuanNvbikuXG5cdFx0XHQvLyBTZXQgdGhlIGNvbnRleHQga2V5IGRpcmVjdGx5IGFzIGEgZmFsbGJhY2suXG5cdFx0XHRDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4uYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpLnNldChoaWRkZW4pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHVwZGF0ZSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnJlcXVlc3RzPy52YWx1ZS5mb3JjZVJlc29sdmVFbnRpdGxlbWVudCh0b2tlbik7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBDaGF0IEVudGl0bGVtZW50IFJlcXVlc3QgU2VydmljZVxuXG50eXBlIEVudGl0bGVtZW50Q2xhc3NpZmljYXRpb24gPSB7XG5cdHRpZDogeyBjbGFzc2lmaWNhdGlvbjogJ0VuZFVzZXJQc2V1ZG9ueW1pemVkSW5mb3JtYXRpb24nOyBwdXJwb3NlOiAnQnVzaW5lc3NJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBhbm9ueW1pemVkIGFuYWx5dGljcyBpZCByZXR1cm5lZCBieSB0aGUgc2VydmljZSc7IGVuZHBvaW50OiAnR29vZ2xlQW5hbHl0aWNzSWQnIH07XG5cdGVudGl0bGVtZW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRmxhZyBpbmRpY2F0aW5nIHRoZSBjaGF0IGVudGl0bGVtZW50IHN0YXRlJyB9O1xuXHRza3U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgU0tVIG9mIHRoZSBjaGF0IGVudGl0bGVtZW50JyB9O1xuXHRxdW90YUNoYXRVbmxpbWl0ZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSB1c2VyIGhhcyB1bmxpbWl0ZWQgY2hhdCByZXF1ZXN0cycgfTtcblx0cXVvdGFDaGF0SGFzUXVvdGE6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSB1c2VyIGN1cnJlbnRseSBoYXMgY2hhdCBxdW90YSBhdmFpbGFibGUnIH07XG5cdHF1b3RhQ2hhdEVudGl0bGVtZW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnVGhlIHJhdyBjaGF0IHF1b3RhIGVudGl0bGVtZW50IGNvdW50JyB9O1xuXHRxdW90YVByZW1pdW1DaGF0OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnVGhlIHBlcmNlbnRhZ2Ugb2YgcHJlbWl1bSBjaGF0IHJlcXVlc3RzIHJlbWFpbmluZyBmb3IgdGhlIHVzZXInIH07XG5cdHF1b3RhUHJlbWl1bUNoYXRVbmxpbWl0ZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSB1c2VyIGhhcyB1bmxpbWl0ZWQgcHJlbWl1bSBjaGF0IHJlcXVlc3RzJyB9O1xuXHRxdW90YVByZW1pdW1DaGF0SGFzUXVvdGE6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSB1c2VyIGN1cnJlbnRseSBoYXMgcHJlbWl1bSBjaGF0IHF1b3RhIGF2YWlsYWJsZScgfTtcblx0cXVvdGFQcmVtaXVtQ2hhdEVudGl0bGVtZW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnVGhlIHJhdyBwcmVtaXVtIGNoYXQgcXVvdGEgZW50aXRsZW1lbnQgY291bnQnIH07XG5cdHF1b3RhQ29tcGxldGlvbnM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUaGUgcGVyY2VudGFnZSBvZiBjb21wbGV0aW9ucyByZW1haW5pbmcgZm9yIHRoZSB1c2VyJyB9O1xuXHRxdW90YUNvbXBsZXRpb25zVW5saW1pdGVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgdXNlciBoYXMgdW5saW1pdGVkIGNvbXBsZXRpb25zJyB9O1xuXHRxdW90YUNvbXBsZXRpb25zSGFzUXVvdGE6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSB1c2VyIGN1cnJlbnRseSBoYXMgY29tcGxldGlvbnMgcXVvdGEgYXZhaWxhYmxlJyB9O1xuXHRxdW90YUNvbXBsZXRpb25zRW50aXRsZW1lbnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUaGUgcmF3IGNvbXBsZXRpb25zIHF1b3RhIGVudGl0bGVtZW50IGNvdW50JyB9O1xuXHRxdW90YVJlc2V0RGF0ZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBkYXRlIHRoZSBxdW90YSB3aWxsIHJlc2V0JyB9O1xuXHR1c2FnZUJhc2VkQmlsbGluZzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIHVzZXIgaXMgb24gdXNhZ2UtYmFzZWQgYmlsbGluZycgfTtcblx0YWRkaXRpb25hbFVzYWdlRW5hYmxlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgb3ZlcmFnZSAvIGFkZGl0aW9uYWwgc3BlbmQgaXMgZW5hYmxlZCcgfTtcblx0YWRkaXRpb25hbFVzYWdlQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIG92ZXJhZ2UgaW50ZXJhY3Rpb25zIHVzZWQnIH07XG5cdGNhblVwZ3JhZGVQbGFuOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgdXNlciBpcyBlbGlnaWJsZSB0byB1cGdyYWRlIHRoZWlyIHBsYW4nIH07XG5cdG93bmVyOiAnYnBhc2Vybyc7XG5cdGNvbW1lbnQ6ICdSZXBvcnRpbmcgY2hhdCBlbnRpdGxlbWVudHMnO1xufTtcblxudHlwZSBFbnRpdGxlbWVudEV2ZW50ID0ge1xuXHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50O1xuXHR0aWQ6IHN0cmluZztcblx0c2t1OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHF1b3RhQ2hhdFVubGltaXRlZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cXVvdGFDaGF0SGFzUXVvdGE6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHF1b3RhQ2hhdEVudGl0bGVtZW50OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHF1b3RhUHJlbWl1bUNoYXQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cXVvdGFQcmVtaXVtQ2hhdFVubGltaXRlZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cXVvdGFQcmVtaXVtQ2hhdEhhc1F1b3RhOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRxdW90YVByZW1pdW1DaGF0RW50aXRsZW1lbnQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cXVvdGFDb21wbGV0aW9uczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRxdW90YUNvbXBsZXRpb25zVW5saW1pdGVkOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRxdW90YUNvbXBsZXRpb25zSGFzUXVvdGE6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHF1b3RhQ29tcGxldGlvbnNFbnRpdGxlbWVudDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRxdW90YVJlc2V0RGF0ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR1c2FnZUJhc2VkQmlsbGluZzogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0YWRkaXRpb25hbFVzYWdlRW5hYmxlZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0YWRkaXRpb25hbFVzYWdlQ291bnQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0Y2FuVXBncmFkZVBsYW46IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG59O1xuXG5pbnRlcmZhY2UgSUVudGl0bGVtZW50cyB7XG5cdHJlYWRvbmx5IGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQ7XG5cdHJlYWRvbmx5IG9yZ2FuaXNhdGlvbnM/OiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgc2t1Pzogc3RyaW5nO1xuXHRyZWFkb25seSBjb3BpbG90VHJhY2tpbmdJZD86IHN0cmluZztcblx0cmVhZG9ubHkgcXVvdGFzPzogSVF1b3Rhcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUXVvdGFTbmFwc2hvdCB7XG5cdHJlYWRvbmx5IHBlcmNlbnRSZW1haW5pbmc6IG51bWJlcjtcblx0cmVhZG9ubHkgdW5saW1pdGVkOiBib29sZWFuO1xuXHRyZWFkb25seSBoYXNRdW90YT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHJlc2V0QXQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IHVzYWdlQmFzZWRCaWxsaW5nPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZW50aXRsZW1lbnQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IHF1b3RhUmVtYWluaW5nPzogbnVtYmVyO1xuXHRyZWFkb25seSBjcmVkaXRzVXNlZD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmF0ZUxpbWl0U25hcHNob3Qge1xuXHRyZWFkb25seSBwZXJjZW50UmVtYWluaW5nOiBudW1iZXI7XG5cdHJlYWRvbmx5IHVubGltaXRlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgcmVzZXREYXRlPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVF1b3RhcyB7XG5cdHJlYWRvbmx5IHJlc2V0RGF0ZT86IHN0cmluZztcblx0cmVhZG9ubHkgcmVzZXREYXRlSGFzVGltZT86IGJvb2xlYW47XG5cblx0cmVhZG9ubHkgdXNhZ2VCYXNlZEJpbGxpbmc/OiBib29sZWFuO1xuXHRyZWFkb25seSBjYW5VcGdyYWRlUGxhbj86IGJvb2xlYW47XG5cblx0cmVhZG9ubHkgY2hhdD86IElRdW90YVNuYXBzaG90O1xuXHRyZWFkb25seSBjb21wbGV0aW9ucz86IElRdW90YVNuYXBzaG90O1xuXHRyZWFkb25seSBwcmVtaXVtQ2hhdD86IElRdW90YVNuYXBzaG90O1xuXHRyZWFkb25seSBhZGRpdGlvbmFsVXNhZ2VFbmFibGVkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgYWRkaXRpb25hbFVzYWdlQ291bnQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGFkZGl0aW9uYWxVc2FnZUVudGl0bGVtZW50PzogbnVtYmVyO1xuXG5cdHJlYWRvbmx5IHNlc3Npb25SYXRlTGltaXQ/OiBJUmF0ZUxpbWl0U25hcHNob3Q7XG5cdHJlYWRvbmx5IHdlZWtseVJhdGVMaW1pdD86IElSYXRlTGltaXRTbmFwc2hvdDtcbn1cblxuZnVuY3Rpb24gbWVyZ2VEZWZpbmVkU25hcHNob3Q8VCBleHRlbmRzIG9iamVjdD4ocHJldmlvdXM6IFQgfCB1bmRlZmluZWQsIGN1cnJlbnQ6IFQpOiBUIHtcblx0Y29uc3QgcmVzdWx0ID0geyAuLi5wcmV2aW91cywgLi4uY3VycmVudCB9O1xuXHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhjdXJyZW50KSBhcyAoa2V5b2YgVClbXSkge1xuXHRcdGlmIChjdXJyZW50W2tleV0gPT09IHVuZGVmaW5lZCAmJiBwcmV2aW91cz8uW2tleV0gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzdWx0W2tleV0gPSBwcmV2aW91c1trZXldO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VRdW90YXMoZW50aXRsZW1lbnRzRGF0YTogSUVudGl0bGVtZW50c0RhdGEpOiBJUXVvdGFzIHtcblx0Y29uc3QgcXVvdGFzOiBNdXRhYmxlPElRdW90YXM+ID0ge1xuXHRcdHJlc2V0RGF0ZTogZW50aXRsZW1lbnRzRGF0YS5xdW90YV9yZXNldF9kYXRlX3V0YyA/PyBlbnRpdGxlbWVudHNEYXRhLnF1b3RhX3Jlc2V0X2RhdGUgPz8gZW50aXRsZW1lbnRzRGF0YS5saW1pdGVkX3VzZXJfcmVzZXRfZGF0ZSxcblx0XHRyZXNldERhdGVIYXNUaW1lOiB0eXBlb2YgZW50aXRsZW1lbnRzRGF0YS5xdW90YV9yZXNldF9kYXRlX3V0YyA9PT0gJ3N0cmluZycsXG5cdFx0dXNhZ2VCYXNlZEJpbGxpbmc6IGVudGl0bGVtZW50c0RhdGEudG9rZW5fYmFzZWRfYmlsbGluZyxcblx0XHRjYW5VcGdyYWRlUGxhbjogZW50aXRsZW1lbnRzRGF0YS5jYW5fdXBncmFkZV9wbGFuLFxuXHR9O1xuXG5cdC8vIExlZ2FjeSBGcmVlIFNLVSBRdW90YVxuXHRpZiAoZW50aXRsZW1lbnRzRGF0YS5tb250aGx5X3F1b3Rhcz8uY2hhdCAmJiB0eXBlb2YgZW50aXRsZW1lbnRzRGF0YS5saW1pdGVkX3VzZXJfcXVvdGFzPy5jaGF0ID09PSAnbnVtYmVyJykge1xuXHRcdHF1b3Rhcy5jaGF0ID0ge1xuXHRcdFx0cGVyY2VudFJlbWFpbmluZzogTWF0aC5taW4oMTAwLCBNYXRoLm1heCgwLCAoZW50aXRsZW1lbnRzRGF0YS5saW1pdGVkX3VzZXJfcXVvdGFzLmNoYXQgLyBlbnRpdGxlbWVudHNEYXRhLm1vbnRobHlfcXVvdGFzLmNoYXQpICogMTAwKSksXG5cdFx0XHR1bmxpbWl0ZWQ6IGZhbHNlXG5cdFx0fTtcblx0fVxuXG5cdGlmIChlbnRpdGxlbWVudHNEYXRhLm1vbnRobHlfcXVvdGFzPy5jb21wbGV0aW9ucyAmJiB0eXBlb2YgZW50aXRsZW1lbnRzRGF0YS5saW1pdGVkX3VzZXJfcXVvdGFzPy5jb21wbGV0aW9ucyA9PT0gJ251bWJlcicpIHtcblx0XHRxdW90YXMuY29tcGxldGlvbnMgPSB7XG5cdFx0XHRwZXJjZW50UmVtYWluaW5nOiBNYXRoLm1pbigxMDAsIE1hdGgubWF4KDAsIChlbnRpdGxlbWVudHNEYXRhLmxpbWl0ZWRfdXNlcl9xdW90YXMuY29tcGxldGlvbnMgLyBlbnRpdGxlbWVudHNEYXRhLm1vbnRobHlfcXVvdGFzLmNvbXBsZXRpb25zKSAqIDEwMCkpLFxuXHRcdFx0dW5saW1pdGVkOiBmYWxzZVxuXHRcdH07XG5cdH1cblxuXHQvLyBOZXcgUXVvdGEgU25hcHNob3Rcblx0aWYgKGVudGl0bGVtZW50c0RhdGEucXVvdGFfc25hcHNob3RzKSB7XG5cdFx0Zm9yIChjb25zdCBxdW90YVR5cGUgb2YgWydjaGF0JywgJ2NvbXBsZXRpb25zJywgJ3ByZW1pdW1faW50ZXJhY3Rpb25zJ10gYXMgY29uc3QpIHtcblx0XHRcdGNvbnN0IHJhd1F1b3RhU25hcHNob3QgPSBlbnRpdGxlbWVudHNEYXRhLnF1b3RhX3NuYXBzaG90c1txdW90YVR5cGVdO1xuXHRcdFx0aWYgKCFyYXdRdW90YVNuYXBzaG90KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGFyc2VkRW50aXRsZW1lbnQgPSByYXdRdW90YVNuYXBzaG90LmVudGl0bGVtZW50ICE9PSB1bmRlZmluZWQgPyBOdW1iZXIocmF3UXVvdGFTbmFwc2hvdC5lbnRpdGxlbWVudCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBwYXJzZWRDcmVkaXRzVXNlZCA9IHJhd1F1b3RhU25hcHNob3QuY3JlZGl0c191c2VkICE9PSB1bmRlZmluZWQgPyBOdW1iZXIocmF3UXVvdGFTbmFwc2hvdC5jcmVkaXRzX3VzZWQpIDogdW5kZWZpbmVkO1xuXG5cdFx0XHQvLyBTa2lwIHNuYXBzaG90cyB3aGVyZSB0aGUgdXNlciBoYXMgbm8gYWxsb2NhdGVkIGVudGl0bGVtZW50IGZvciB0aGlzXG5cdFx0XHQvLyBjYXRlZ29yeSAoZS5nLiBmcmVlIHRpZXIgcHJlbWl1bV9pbnRlcmFjdGlvbnMgd2l0aCAwIGNyZWRpdHMpLiBVbmRlclxuXHRcdFx0Ly8gVEJCLCBoYXNfcXVvdGEgaXMgYWx3YXlzIGZhbHNlIGF0IHRoZSBwZXItc25hcHNob3QgbGV2ZWwgc28gd2UgY2Fubm90XG5cdFx0XHQvLyByZWx5IG9uIGl0OyBpbnN0ZWFkIGNoZWNrIHRoZSBhY3R1YWwgZW50aXRsZW1lbnQgdmFsdWUuXG5cdFx0XHRpZiAoIXJhd1F1b3RhU25hcHNob3QudW5saW1pdGVkICYmIHBhcnNlZEVudGl0bGVtZW50ID09PSAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwYXJzZWRRdW90YVJlbWFpbmluZyA9IHJhd1F1b3RhU25hcHNob3QucXVvdGFfcmVtYWluaW5nICE9PSB1bmRlZmluZWQgPyBOdW1iZXIocmF3UXVvdGFTbmFwc2hvdC5xdW90YV9yZW1haW5pbmcpIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcXVvdGFTbmFwc2hvdDogSVF1b3RhU25hcHNob3QgPSB7XG5cdFx0XHRcdHBlcmNlbnRSZW1haW5pbmc6IE1hdGgubWluKDEwMCwgTWF0aC5tYXgoMCwgcmF3UXVvdGFTbmFwc2hvdC5wZXJjZW50X3JlbWFpbmluZykpLFxuXHRcdFx0XHR1bmxpbWl0ZWQ6IHJhd1F1b3RhU25hcHNob3QudW5saW1pdGVkLFxuXHRcdFx0XHRoYXNRdW90YTogcmF3UXVvdGFTbmFwc2hvdC5oYXNfcXVvdGEsXG5cdFx0XHRcdHVzYWdlQmFzZWRCaWxsaW5nOiBlbnRpdGxlbWVudHNEYXRhLnRva2VuX2Jhc2VkX2JpbGxpbmcsXG5cdFx0XHRcdHJlc2V0QXQ6IHJhd1F1b3RhU25hcHNob3QucXVvdGFfcmVzZXRfYXQgfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRlbnRpdGxlbWVudDogcGFyc2VkRW50aXRsZW1lbnQgIT09IHVuZGVmaW5lZCAmJiBOdW1iZXIuaXNGaW5pdGUocGFyc2VkRW50aXRsZW1lbnQpICYmIHBhcnNlZEVudGl0bGVtZW50ID49IDAgPyBwYXJzZWRFbnRpdGxlbWVudCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0cXVvdGFSZW1haW5pbmc6IHBhcnNlZFF1b3RhUmVtYWluaW5nICE9PSB1bmRlZmluZWQgJiYgTnVtYmVyLmlzRmluaXRlKHBhcnNlZFF1b3RhUmVtYWluaW5nKSAmJiBwYXJzZWRRdW90YVJlbWFpbmluZyA+PSAwID8gcGFyc2VkUXVvdGFSZW1haW5pbmcgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNyZWRpdHNVc2VkOiBwYXJzZWRDcmVkaXRzVXNlZCAhPT0gdW5kZWZpbmVkICYmIE51bWJlci5pc0Zpbml0ZShwYXJzZWRDcmVkaXRzVXNlZCkgJiYgcGFyc2VkQ3JlZGl0c1VzZWQgPj0gMCA/IHBhcnNlZENyZWRpdHNVc2VkIDogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblxuXHRcdFx0c3dpdGNoIChxdW90YVR5cGUpIHtcblx0XHRcdFx0Y2FzZSAnY2hhdCc6XG5cdFx0XHRcdFx0cXVvdGFzLmNoYXQgPSBxdW90YVNuYXBzaG90O1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdjb21wbGV0aW9ucyc6XG5cdFx0XHRcdFx0cXVvdGFzLmNvbXBsZXRpb25zID0gcXVvdGFTbmFwc2hvdDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAncHJlbWl1bV9pbnRlcmFjdGlvbnMnOlxuXHRcdFx0XHRcdHF1b3Rhcy5wcmVtaXVtQ2hhdCA9IHF1b3RhU25hcHNob3Q7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3ZlcmFnZVNvdXJjZSA9IGVudGl0bGVtZW50c0RhdGEucXVvdGFfc25hcHNob3RzWydwcmVtaXVtX2ludGVyYWN0aW9ucyddO1xuXHRcdHF1b3Rhcy5hZGRpdGlvbmFsVXNhZ2VFbmFibGVkID0gb3ZlcmFnZVNvdXJjZT8ub3ZlcmFnZV9wZXJtaXR0ZWQgPz8gZmFsc2U7XG5cdFx0cXVvdGFzLmFkZGl0aW9uYWxVc2FnZUNvdW50ID0gb3ZlcmFnZVNvdXJjZT8ub3ZlcmFnZV9jb3VudCA/PyAwO1xuXHRcdHF1b3Rhcy5hZGRpdGlvbmFsVXNhZ2VFbnRpdGxlbWVudCA9IG92ZXJhZ2VTb3VyY2U/Lm92ZXJhZ2VfZW50aXRsZW1lbnQgPz8gMDtcblx0fVxuXHRyZXR1cm4gcXVvdGFzO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdEVudGl0bGVtZW50UmVxdWVzdHMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHN0YXRlOiBJRW50aXRsZW1lbnRzO1xuXG5cdHByaXZhdGUgcGVuZGluZ1Jlc29sdmVDdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHQ6IENoYXRFbnRpdGxlbWVudENvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjaGF0UXVvdGFzQWNjZXNzb3I6IElDaGF0UXVvdGFzQWNjZXNzb3IsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElEZWZhdWx0QWNjb3VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnN0YXRlID0geyBlbnRpdGxlbWVudDogdGhpcy5jb250ZXh0LnN0YXRlLmVudGl0bGVtZW50IH07XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cblx0XHR0aGlzLnJlc29sdmUoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWZhdWx0QWNjb3VudFNlcnZpY2Uub25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudCgoKSA9PiB0aGlzLnJlc29sdmUoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmNvbnRleHQuc3RhdGUuZGlzYWJsZWQgfHwgdGhpcy5jb250ZXh0LnN0YXRlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuVW5rbm93bikge1xuXHRcdFx0XHQvLyBXaGVuIHRoZSBleHRlbnNpb24gaXMgZGlzYWJsZWQgb3IgdGhlIHVzZXIgaXMgbm90IGVudGl0bGVkXG5cdFx0XHRcdC8vIG1ha2Ugc3VyZSB0byBjbGVhciBxdW90YXMgc28gdGhhdCBhbnkgaW5kaWNhdG9ycyBhcmUgYWxzbyBnb25lXG5cdFx0XHRcdHRoaXMuc3RhdGUgPSB7IGVudGl0bGVtZW50OiB0aGlzLnN0YXRlLmVudGl0bGVtZW50LCBxdW90YXM6IHVuZGVmaW5lZCB9O1xuXHRcdFx0XHR0aGlzLmNoYXRRdW90YXNBY2Nlc3Nvci5jbGVhclF1b3RhcygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnBlbmRpbmdSZXNvbHZlQ3RzLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0Y29uc3QgY3RzID0gdGhpcy5wZW5kaW5nUmVzb2x2ZUN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0Y29uc3QgZGVmYXVsdEFjY291bnQgPSBhd2FpdCB0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5nZXREZWZhdWx0QWNjb3VudCgpO1xuXHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJbW1lZGlhdGVseSBzaWduYWwgd2hldGhlciB3ZSBoYXZlIGEgc2Vzc2lvbiBvciBub3Rcblx0XHRsZXQgc3RhdGU6IElFbnRpdGxlbWVudHMgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGRlZmF1bHRBY2NvdW50KSB7XG5cdFx0XHQvLyBEbyBub3Qgb3ZlcndyaXRlIGFueSBzdGF0ZSB3ZSBoYXZlIGFscmVhZHlcblx0XHRcdGlmICh0aGlzLnN0YXRlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuVW5rbm93bikge1xuXHRcdFx0XHRzdGF0ZSA9IHsgZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5VbnJlc29sdmVkIH07XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN0YXRlID0geyBlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlVua25vd24gfTtcblx0XHR9XG5cdFx0aWYgKHN0YXRlKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZShzdGF0ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGRlZmF1bHRBY2NvdW50KSB7XG5cdFx0XHQvLyBBZnRlcndhcmRzIHJlc29sdmUgZW50aXRsZW1lbnQgd2l0aCBhIG5ldHdvcmsgcmVxdWVzdFxuXHRcdFx0Ly8gYnV0IG9ubHkgdW5sZXNzIGl0IHdhcyBub3QgYWxyZWFkeSByZXNvbHZlZCBiZWZvcmUuXG5cdFx0XHRhd2FpdCB0aGlzLnJlc29sdmVFbnRpdGxlbWVudChkZWZhdWx0QWNjb3VudCwgY3RzLnRva2VuKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVFbnRpdGxlbWVudChkZWZhdWx0QWNjb3VudDogSURlZmF1bHRBY2NvdW50LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElFbnRpdGxlbWVudHMgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBlbnRpdGxlbWVudHMgPSBhd2FpdCB0aGlzLmRvUmVzb2x2ZUVudGl0bGVtZW50KGRlZmF1bHRBY2NvdW50LCB0b2tlbik7XG5cdFx0aWYgKHR5cGVvZiBlbnRpdGxlbWVudHM/LmVudGl0bGVtZW50ID09PSAnbnVtYmVyJyAmJiAhdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRoaXMudXBkYXRlKGVudGl0bGVtZW50cyk7XG5cdFx0fVxuXHRcdHJldHVybiBlbnRpdGxlbWVudHM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUmVzb2x2ZUVudGl0bGVtZW50KGRlZmF1bHRBY2NvdW50OiBJRGVmYXVsdEFjY291bnQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUVudGl0bGVtZW50cyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBlbnRpdGxlbWVudHNEYXRhID0gZGVmYXVsdEFjY291bnQuZW50aXRsZW1lbnRzRGF0YTtcblx0XHRpZiAoIWVudGl0bGVtZW50c0RhdGEpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW2NoYXQgZW50aXRsZW1lbnRdOiBubyBlbnRpdGxlbWVudHMgZGF0YSBhdmFpbGFibGUgb24gZGVmYXVsdCBhY2NvdW50Jyk7XG5cdFx0XHRyZXR1cm4geyBlbnRpdGxlbWVudDogZW50aXRsZW1lbnRzRGF0YSA9PT0gbnVsbCA/IENoYXRFbnRpdGxlbWVudC5Vbmtub3duIDogQ2hhdEVudGl0bGVtZW50LlVucmVzb2x2ZWQgfTtcblx0XHR9XG5cblx0XHRsZXQgZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudDtcblx0XHRpZiAoZW50aXRsZW1lbnRzRGF0YS5hY2Nlc3NfdHlwZV9za3UgPT09ICdmcmVlX2xpbWl0ZWRfY29waWxvdCcpIHtcblx0XHRcdGVudGl0bGVtZW50ID0gQ2hhdEVudGl0bGVtZW50LkZyZWU7XG5cdFx0fSBlbHNlIGlmIChlbnRpdGxlbWVudHNEYXRhLmFjY2Vzc190eXBlX3NrdSA9PT0gJ2ZyZWVfZWR1Y2F0aW9uYWxfcXVvdGEnKSB7XG5cdFx0XHRlbnRpdGxlbWVudCA9IENoYXRFbnRpdGxlbWVudC5FRFU7XG5cdFx0fSBlbHNlIGlmIChlbnRpdGxlbWVudHNEYXRhLmNhbl9zaWdudXBfZm9yX2xpbWl0ZWQpIHtcblx0XHRcdGVudGl0bGVtZW50ID0gQ2hhdEVudGl0bGVtZW50LkF2YWlsYWJsZTtcblx0XHR9IGVsc2UgaWYgKGVudGl0bGVtZW50c0RhdGEuY29waWxvdF9wbGFuID09PSAnaW5kaXZpZHVhbF9lZHUnKSB7XG5cdFx0XHRlbnRpdGxlbWVudCA9IENoYXRFbnRpdGxlbWVudC5FRFU7XG5cdFx0fSBlbHNlIGlmIChlbnRpdGxlbWVudHNEYXRhLmNvcGlsb3RfcGxhbiA9PT0gJ2luZGl2aWR1YWwnKSB7XG5cdFx0XHRlbnRpdGxlbWVudCA9IENoYXRFbnRpdGxlbWVudC5Qcm87XG5cdFx0fSBlbHNlIGlmIChlbnRpdGxlbWVudHNEYXRhLmNvcGlsb3RfcGxhbiA9PT0gJ2luZGl2aWR1YWxfcHJvJykge1xuXHRcdFx0ZW50aXRsZW1lbnQgPSBDaGF0RW50aXRsZW1lbnQuUHJvUGx1cztcblx0XHR9IGVsc2UgaWYgKGVudGl0bGVtZW50c0RhdGEuY29waWxvdF9wbGFuID09PSAnaW5kaXZpZHVhbF9tYXgnKSB7XG5cdFx0XHRlbnRpdGxlbWVudCA9IENoYXRFbnRpdGxlbWVudC5NYXg7XG5cdFx0fSBlbHNlIGlmIChlbnRpdGxlbWVudHNEYXRhLmNvcGlsb3RfcGxhbiA9PT0gJ2J1c2luZXNzJykge1xuXHRcdFx0ZW50aXRsZW1lbnQgPSBDaGF0RW50aXRsZW1lbnQuQnVzaW5lc3M7XG5cdFx0fSBlbHNlIGlmIChlbnRpdGxlbWVudHNEYXRhLmNvcGlsb3RfcGxhbiA9PT0gJ2VudGVycHJpc2UnKSB7XG5cdFx0XHRlbnRpdGxlbWVudCA9IENoYXRFbnRpdGxlbWVudC5FbnRlcnByaXNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlbnRpdGxlbWVudCA9IENoYXRFbnRpdGxlbWVudC5VbmF2YWlsYWJsZTtcblx0XHR9XG5cblx0XHRjb25zdCBlbnRpdGxlbWVudHM6IElFbnRpdGxlbWVudHMgPSB7XG5cdFx0XHRlbnRpdGxlbWVudCxcblx0XHRcdG9yZ2FuaXNhdGlvbnM6IGVudGl0bGVtZW50c0RhdGEub3JnYW5pemF0aW9uX2xvZ2luX2xpc3QsXG5cdFx0XHRxdW90YXM6IHRoaXMudG9RdW90YXMoZW50aXRsZW1lbnRzRGF0YSksXG5cdFx0XHRza3U6IGVudGl0bGVtZW50c0RhdGEuYWNjZXNzX3R5cGVfc2t1LFxuXHRcdFx0Y29waWxvdFRyYWNraW5nSWQ6IGVudGl0bGVtZW50c0RhdGEuYW5hbHl0aWNzX3RyYWNraW5nX2lkXG5cdFx0fTtcblxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW2NoYXQgZW50aXRsZW1lbnRdOiByZXNvbHZlZCB0byAke2VudGl0bGVtZW50cy5lbnRpdGxlbWVudH0sIHF1b3RhczogJHtKU09OLnN0cmluZ2lmeShlbnRpdGxlbWVudHMucXVvdGFzKX1gKTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxFbnRpdGxlbWVudEV2ZW50LCBFbnRpdGxlbWVudENsYXNzaWZpY2F0aW9uPignY2hhdEluc3RhbGxFbnRpdGxlbWVudCcsIHtcblx0XHRcdGVudGl0bGVtZW50OiBlbnRpdGxlbWVudHMuZW50aXRsZW1lbnQsXG5cdFx0XHR0aWQ6IGVudGl0bGVtZW50c0RhdGEuYW5hbHl0aWNzX3RyYWNraW5nX2lkLFxuXHRcdFx0c2t1OiBlbnRpdGxlbWVudHMuc2t1LFxuXHRcdFx0cXVvdGFDaGF0VW5saW1pdGVkOiBlbnRpdGxlbWVudHMucXVvdGFzPy5jaGF0Py51bmxpbWl0ZWQsXG5cdFx0XHRxdW90YUNoYXRIYXNRdW90YTogZW50aXRsZW1lbnRzLnF1b3Rhcz8uY2hhdD8uaGFzUXVvdGEsXG5cdFx0XHRxdW90YUNoYXRFbnRpdGxlbWVudDogZW50aXRsZW1lbnRzLnF1b3Rhcz8uY2hhdD8uZW50aXRsZW1lbnQsXG5cdFx0XHRxdW90YVByZW1pdW1DaGF0OiBlbnRpdGxlbWVudHMucXVvdGFzPy5wcmVtaXVtQ2hhdD8ucGVyY2VudFJlbWFpbmluZyxcblx0XHRcdHF1b3RhUHJlbWl1bUNoYXRVbmxpbWl0ZWQ6IGVudGl0bGVtZW50cy5xdW90YXM/LnByZW1pdW1DaGF0Py51bmxpbWl0ZWQsXG5cdFx0XHRxdW90YVByZW1pdW1DaGF0SGFzUXVvdGE6IGVudGl0bGVtZW50cy5xdW90YXM/LnByZW1pdW1DaGF0Py5oYXNRdW90YSxcblx0XHRcdHF1b3RhUHJlbWl1bUNoYXRFbnRpdGxlbWVudDogZW50aXRsZW1lbnRzLnF1b3Rhcz8ucHJlbWl1bUNoYXQ/LmVudGl0bGVtZW50LFxuXHRcdFx0cXVvdGFDb21wbGV0aW9uczogZW50aXRsZW1lbnRzLnF1b3Rhcz8uY29tcGxldGlvbnM/LnBlcmNlbnRSZW1haW5pbmcsXG5cdFx0XHRxdW90YUNvbXBsZXRpb25zVW5saW1pdGVkOiBlbnRpdGxlbWVudHMucXVvdGFzPy5jb21wbGV0aW9ucz8udW5saW1pdGVkLFxuXHRcdFx0cXVvdGFDb21wbGV0aW9uc0hhc1F1b3RhOiBlbnRpdGxlbWVudHMucXVvdGFzPy5jb21wbGV0aW9ucz8uaGFzUXVvdGEsXG5cdFx0XHRxdW90YUNvbXBsZXRpb25zRW50aXRsZW1lbnQ6IGVudGl0bGVtZW50cy5xdW90YXM/LmNvbXBsZXRpb25zPy5lbnRpdGxlbWVudCxcblx0XHRcdHF1b3RhUmVzZXREYXRlOiBlbnRpdGxlbWVudHMucXVvdGFzPy5yZXNldERhdGUsXG5cdFx0XHR1c2FnZUJhc2VkQmlsbGluZzogZW50aXRsZW1lbnRzLnF1b3Rhcz8udXNhZ2VCYXNlZEJpbGxpbmcsXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiBlbnRpdGxlbWVudHMucXVvdGFzPy5hZGRpdGlvbmFsVXNhZ2VFbmFibGVkLFxuXHRcdFx0YWRkaXRpb25hbFVzYWdlQ291bnQ6IGVudGl0bGVtZW50cy5xdW90YXM/LmFkZGl0aW9uYWxVc2FnZUNvdW50LFxuXHRcdFx0Y2FuVXBncmFkZVBsYW46IGVudGl0bGVtZW50cy5xdW90YXM/LmNhblVwZ3JhZGVQbGFuXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gZW50aXRsZW1lbnRzO1xuXHR9XG5cblx0cHJpdmF0ZSB0b1F1b3RhcyhlbnRpdGxlbWVudHNEYXRhOiBJRW50aXRsZW1lbnRzRGF0YSk6IElRdW90YXMge1xuXHRcdHJldHVybiBwYXJzZVF1b3RhcyhlbnRpdGxlbWVudHNEYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVxdWVzdCh1cmw6IHN0cmluZywgdHlwZTogJ0dFVCcsIGJvZHk6IHVuZGVmaW5lZCwgc2Vzc2lvbnM6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIGNhbGxTaXRlOiBzdHJpbmcpOiBQcm9taXNlPElSZXF1ZXN0Q29udGV4dCB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgYXN5bmMgcmVxdWVzdCh1cmw6IHN0cmluZywgdHlwZTogJ1BPU1QnLCBib2R5OiBvYmplY3QsIHNlc3Npb25zOiBBdXRoZW50aWNhdGlvblNlc3Npb25bXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBjYWxsU2l0ZTogc3RyaW5nKTogUHJvbWlzZTxJUmVxdWVzdENvbnRleHQgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIGFzeW5jIHJlcXVlc3QodXJsOiBzdHJpbmcsIHR5cGU6ICdHRVQnIHwgJ1BPU1QnLCBib2R5OiBvYmplY3QgfCB1bmRlZmluZWQsIHNlc3Npb25zOiBBdXRoZW50aWNhdGlvblNlc3Npb25bXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBjYWxsU2l0ZTogc3RyaW5nKTogUHJvbWlzZTxJUmVxdWVzdENvbnRleHQgfCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgbGFzdFJlcXVlc3Q6IElSZXF1ZXN0Q29udGV4dCB8IHVuZGVmaW5lZDtcblxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBsYXN0UmVxdWVzdDtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3RTZXJ2aWNlLnJlcXVlc3Qoe1xuXHRcdFx0XHRcdHR5cGUsXG5cdFx0XHRcdFx0dXJsLFxuXHRcdFx0XHRcdGRhdGE6IHR5cGUgPT09ICdQT1NUJyA/IEpTT04uc3RyaW5naWZ5KGJvZHkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGRpc2FibGVDYWNoZTogdHJ1ZSxcblx0XHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtzZXNzaW9uLmFjY2Vzc1Rva2VufWBcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNhbGxTaXRlXG5cdFx0XHRcdH0sIHRva2VuKTtcblxuXHRcdFx0XHRjb25zdCBzdGF0dXMgPSByZXNwb25zZS5yZXMuc3RhdHVzQ29kZTtcblx0XHRcdFx0aWYgKHN0YXR1cyAmJiBzdGF0dXMgIT09IDIwMCkge1xuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0ID0gcmVzcG9uc2U7XG5cdFx0XHRcdFx0Y29udGludWU7IC8vIHRyeSBuZXh0IHNlc3Npb25cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiByZXNwb25zZTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmICghdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtjaGF0IGVudGl0bGVtZW50XSByZXF1ZXN0OiBlcnJvciAke2Vycm9yfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxhc3RSZXF1ZXN0O1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGUoc3RhdGU6IElFbnRpdGxlbWVudHMpOiB2b2lkIHtcblx0XHR0aGlzLnN0YXRlID0gc3RhdGU7XG5cblx0XHR0aGlzLmNvbnRleHQudXBkYXRlKHsgZW50aXRsZW1lbnQ6IHRoaXMuc3RhdGUuZW50aXRsZW1lbnQsIG9yZ2FuaXNhdGlvbnM6IHRoaXMuc3RhdGUub3JnYW5pc2F0aW9ucywgc2t1OiB0aGlzLnN0YXRlLnNrdSwgY29waWxvdFRyYWNraW5nSWQ6IHRoaXMuc3RhdGUuY29waWxvdFRyYWNraW5nSWQgfSk7XG5cblx0XHRpZiAoc3RhdGUucXVvdGFzKSB7XG5cdFx0XHR0aGlzLmNoYXRRdW90YXNBY2Nlc3Nvci5hY2NlcHRRdW90YXMoc3RhdGUucXVvdGFzKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBmb3JjZVJlc29sdmVFbnRpdGxlbWVudCh0b2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBQcm9taXNlPElFbnRpdGxlbWVudHMgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkZWZhdWx0QWNjb3VudCA9IGF3YWl0IHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLnJlZnJlc2goeyBmb3JjZVJlZnJlc2g6IHRydWUgfSk7XG5cdFx0aWYgKCFkZWZhdWx0QWNjb3VudCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlRW50aXRsZW1lbnQoZGVmYXVsdEFjY291bnQsIHRva2VuKTtcblx0fVxuXG5cdGFzeW5jIHNpZ25VcEZyZWUoKTogUHJvbWlzZTx0cnVlIC8qIHNpZ25lZCB1cCAqLyB8IGZhbHNlIC8qIGFscmVhZHkgc2lnbmVkIHVwICovIHwgeyBlcnJvckNvZGU6IG51bWJlciB9IC8qIGVycm9yICovIHwgdW5kZWZpbmVkIC8qIG5vIHNlc3Npb24gKi8+IHtcblx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuZ2V0U2Vzc2lvbnMoKTtcblx0XHRpZiAoc2Vzc2lvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5kb1NpZ25VcEZyZWUoc2Vzc2lvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1NpZ25VcEZyZWUoc2Vzc2lvbnM6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdKTogUHJvbWlzZTx0cnVlIC8qIHNpZ25lZCB1cCAqLyB8IGZhbHNlIC8qIGFscmVhZHkgc2lnbmVkIHVwICovIHwgeyBlcnJvckNvZGU6IG51bWJlciB9IC8qIGVycm9yICovPiB7XG5cdFx0Y29uc3QgYm9keSA9IHtcblx0XHRcdHJlc3RyaWN0ZWRfdGVsZW1ldHJ5OiB0aGlzLnRlbGVtZXRyeVNlcnZpY2UudGVsZW1ldHJ5TGV2ZWwgPT09IFRlbGVtZXRyeUxldmVsLk5PTkUgPyAnZGlzYWJsZWQnIDogJ2VuYWJsZWQnLFxuXHRcdFx0cHVibGljX2NvZGVfc3VnZ2VzdGlvbnM6ICdlbmFibGVkJ1xuXHRcdH07XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdChkZWZhdWx0Q2hhdEFnZW50LmVudGl0bGVtZW50U2lnbnVwTGltaXRlZFVybCwgJ1BPU1QnLCBib2R5LCBzZXNzaW9ucywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgJ2NoYXRFbnRpdGxlbWVudFNlcnZpY2Uuc2lnblVwRnJlZScpO1xuXHRcdGlmICghcmVzcG9uc2UpIHtcblx0XHRcdGNvbnN0IHJldHJ5ID0gYXdhaXQgdGhpcy5vblVua25vd25TaWduVXBFcnJvcihsb2NhbGl6ZSgnc2lnblVwTm9SZXNwb25zZUVycm9yJywgXCJObyByZXNwb25zZSByZWNlaXZlZC5cIiksICdbY2hhdCBlbnRpdGxlbWVudF0gc2lnbi11cDogbm8gcmVzcG9uc2UnKTtcblx0XHRcdHJldHVybiByZXRyeSA/IHRoaXMuZG9TaWduVXBGcmVlKHNlc3Npb25zKSA6IHsgZXJyb3JDb2RlOiAxIH07XG5cdFx0fVxuXG5cdFx0aWYgKHJlc3BvbnNlLnJlcy5zdGF0dXNDb2RlICYmIHJlc3BvbnNlLnJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcblx0XHRcdGlmIChyZXNwb25zZS5yZXMuc3RhdHVzQ29kZSA9PT0gNDIyKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzcG9uc2VUZXh0ID0gYXdhaXQgYXNUZXh0KHJlc3BvbnNlKTtcblx0XHRcdFx0XHRpZiAocmVzcG9uc2VUZXh0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCByZXNwb25zZUVycm9yOiB7IG1lc3NhZ2U6IHN0cmluZyB9ID0gSlNPTi5wYXJzZShyZXNwb25zZVRleHQpO1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiByZXNwb25zZUVycm9yLm1lc3NhZ2UgPT09ICdzdHJpbmcnICYmIHJlc3BvbnNlRXJyb3IubWVzc2FnZSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLm9uVW5wcm9jZXNzYWJsZVNpZ25VcEVycm9yKGBbY2hhdCBlbnRpdGxlbWVudF0gc2lnbi11cDogdW5wcm9jZXNzYWJsZSBlbnRpdHkgKCR7cmVzcG9uc2VFcnJvci5tZXNzYWdlfSlgLCByZXNwb25zZUVycm9yLm1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4geyBlcnJvckNvZGU6IHJlc3BvbnNlLnJlcy5zdGF0dXNDb2RlIH07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdC8vIGlnbm9yZSAtIGhhbmRsZWQgYmVsb3dcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmV0cnkgPSBhd2FpdCB0aGlzLm9uVW5rbm93blNpZ25VcEVycm9yKGxvY2FsaXplKCdzaWduVXBVbmV4cGVjdGVkU3RhdHVzRXJyb3InLCBcIlVuZXhwZWN0ZWQgc3RhdHVzIGNvZGUgezB9LlwiLCByZXNwb25zZS5yZXMuc3RhdHVzQ29kZSksIGBbY2hhdCBlbnRpdGxlbWVudF0gc2lnbi11cDogdW5leHBlY3RlZCBzdGF0dXMgY29kZSAke3Jlc3BvbnNlLnJlcy5zdGF0dXNDb2RlfWApO1xuXHRcdFx0cmV0dXJuIHJldHJ5ID8gdGhpcy5kb1NpZ25VcEZyZWUoc2Vzc2lvbnMpIDogeyBlcnJvckNvZGU6IHJlc3BvbnNlLnJlcy5zdGF0dXNDb2RlIH07XG5cdFx0fVxuXG5cdFx0bGV0IHJlc3BvbnNlVGV4dDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0dHJ5IHtcblx0XHRcdHJlc3BvbnNlVGV4dCA9IGF3YWl0IGFzVGV4dChyZXNwb25zZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8vIGlnbm9yZSAtIGhhbmRsZWQgYmVsb3dcblx0XHR9XG5cblx0XHRpZiAoIXJlc3BvbnNlVGV4dCkge1xuXHRcdFx0Y29uc3QgcmV0cnkgPSBhd2FpdCB0aGlzLm9uVW5rbm93blNpZ25VcEVycm9yKGxvY2FsaXplKCdzaWduVXBOb1Jlc3BvbnNlQ29udGVudHNFcnJvcicsIFwiUmVzcG9uc2UgaGFzIG5vIGNvbnRlbnRzLlwiKSwgJ1tjaGF0IGVudGl0bGVtZW50XSBzaWduLXVwOiByZXNwb25zZSBoYXMgbm8gY29udGVudCcpO1xuXHRcdFx0cmV0dXJuIHJldHJ5ID8gdGhpcy5kb1NpZ25VcEZyZWUoc2Vzc2lvbnMpIDogeyBlcnJvckNvZGU6IDIgfTtcblx0XHR9XG5cblx0XHRsZXQgcGFyc2VkUmVzdWx0OiB7IHN1YnNjcmliZWQ6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0cGFyc2VkUmVzdWx0ID0gSlNPTi5wYXJzZShyZXNwb25zZVRleHQpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbY2hhdCBlbnRpdGxlbWVudF0gc2lnbi11cDogcmVzcG9uc2UgaXMgJHtyZXNwb25zZVRleHR9YCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjb25zdCByZXRyeSA9IGF3YWl0IHRoaXMub25Vbmtub3duU2lnblVwRXJyb3IobG9jYWxpemUoJ3NpZ25VcEludmFsaWRSZXNwb25zZUVycm9yJywgXCJJbnZhbGlkIHJlc3BvbnNlIGNvbnRlbnRzLlwiKSwgYFtjaGF0IGVudGl0bGVtZW50XSBzaWduLXVwOiBlcnJvciBwYXJzaW5nIHJlc3BvbnNlICgke2Vycn0pYCk7XG5cdFx0XHRyZXR1cm4gcmV0cnkgPyB0aGlzLmRvU2lnblVwRnJlZShzZXNzaW9ucykgOiB7IGVycm9yQ29kZTogMyB9O1xuXHRcdH1cblxuXHRcdC8vIFdlIGhhdmUgbWFkZSBpdCB0aGlzIGZhciwgc28gdGhlIHVzZXIgZWl0aGVyIGRpZCBzaWduLXVwIG9yIHdhcyBzaWduZWQtdXAgYWxyZWFkeS5cblx0XHQvLyBUaGF0IGlzLCBiZWNhdXNlIHRoZSBlbmRwb2ludCB0aHJvd3MgaW4gYWxsIG90aGVyIGNhc2UgYWNjb3JkaW5nIHRvIFBhdHJpY2suXG5cdFx0dGhpcy51cGRhdGUoeyBlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LkZyZWUgfSk7XG5cblx0XHRyZXR1cm4gQm9vbGVhbihwYXJzZWRSZXN1bHQ/LnN1YnNjcmliZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTZXNzaW9ucygpOiBQcm9taXNlPEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdPiB7XG5cdFx0Y29uc3QgZGVmYXVsdEFjY291bnQgPSBhd2FpdCB0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5nZXREZWZhdWx0QWNjb3VudCgpO1xuXHRcdGlmIChkZWZhdWx0QWNjb3VudCkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhkZWZhdWx0QWNjb3VudC5hdXRoZW50aWNhdGlvblByb3ZpZGVyLmlkKTtcblx0XHRcdGNvbnN0IGFjY291bnRTZXNzaW9ucyA9IHNlc3Npb25zLmZpbHRlcihzID0+IHMuaWQgPT09IGRlZmF1bHRBY2NvdW50LnNlc3Npb25JZCk7XG5cdFx0XHRpZiAoYWNjb3VudFNlc3Npb25zLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gYWNjb3VudFNlc3Npb25zO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gWy4uLihhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyh0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5nZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoKS5pZCkpXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25Vbmtub3duU2lnblVwRXJyb3IoZGV0YWlsOiBzdHJpbmcsIGxvZ01lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihsb2dNZXNzYWdlKTtcblxuXHRcdGlmICghdGhpcy5saWZlY3ljbGVTZXJ2aWNlLndpbGxTaHV0ZG93bikge1xuXHRcdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd1bmtub3duU2lnblVwRXJyb3InLCBcIkFuIGVycm9yIG9jY3VycmVkIHdoaWxlIHNpZ25pbmcgdXAgZm9yIHRoZSBHaXRIdWIgQ29waWxvdCBGcmVlIHBsYW4uIFdvdWxkIHlvdSBsaWtlIHRvIHRyeSBhZ2Fpbj9cIiksXG5cdFx0XHRcdGRldGFpbCxcblx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ3JldHJ5JywgXCJSZXRyeVwiKVxuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiBjb25maXJtZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBvblVucHJvY2Vzc2FibGVTaWduVXBFcnJvcihsb2dNZXNzYWdlOiBzdHJpbmcsIGxvZ0RldGFpbHM6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihsb2dNZXNzYWdlKTtcblxuXHRcdGlmICghdGhpcy5saWZlY3ljbGVTZXJ2aWNlLndpbGxTaHV0ZG93bikge1xuXHRcdFx0dGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRcdHR5cGU6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndW5wcm9jZXNzYWJsZVNpZ25VcEVycm9yJywgXCJBbiBlcnJvciBvY2N1cnJlZCB3aGlsZSBzaWduaW5nIHVwIGZvciB0aGUgR2l0SHViIENvcGlsb3QgRnJlZSBwbGFuLlwiKSxcblx0XHRcdFx0ZGV0YWlsOiBsb2dEZXRhaWxzLFxuXHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdvaycsIFwiT0tcIiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHsgLyogbm9vcCAqLyB9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2xlYXJuTW9yZScsIFwiTGVhcm4gTW9yZVwiKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKGRlZmF1bHRDaGF0QWdlbnQudXBncmFkZVBsYW5VcmwpKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc2lnbkluKG9wdGlvbnM/OiB7IHVzZVNvY2lhbFByb3ZpZGVyPzogc3RyaW5nOyBhZGRpdGlvbmFsU2NvcGVzPzogcmVhZG9ubHkgc3RyaW5nW10gfSk6IFByb21pc2U8eyBkZWZhdWx0QWNjb3VudD86IElEZWZhdWx0QWNjb3VudDsgZW50aXRsZW1lbnRzPzogSUVudGl0bGVtZW50cyB9PiB7XG5cdFx0Y29uc3QgZGVmYXVsdEFjY291bnQgPSBhd2FpdCB0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5zaWduSW4oe1xuXHRcdFx0YWRkaXRpb25hbFNjb3Blczogb3B0aW9ucz8uYWRkaXRpb25hbFNjb3Blcyxcblx0XHRcdGV4dHJhQXV0aG9yaXplUGFyYW1ldGVyczogeyBnZXRfc3RhcnRlZF93aXRoOiAnY29waWxvdC12c2NvZGUnIH0sXG5cdFx0XHRwcm92aWRlcjogb3B0aW9ucz8udXNlU29jaWFsUHJvdmlkZXJcblx0XHR9KTtcblx0XHRpZiAoIWRlZmF1bHRBY2NvdW50KSB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50aXRsZW1lbnRzID0gYXdhaXQgdGhpcy5kb1Jlc29sdmVFbnRpdGxlbWVudChkZWZhdWx0QWNjb3VudCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0cmV0dXJuIHsgZGVmYXVsdEFjY291bnQsIGVudGl0bGVtZW50cyB9O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnBlbmRpbmdSZXNvbHZlQ3RzLmRpc3Bvc2UodHJ1ZSk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBDb250ZXh0XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRFbnRpdGxlbWVudENvbnRleHRTdGF0ZSBleHRlbmRzIElDaGF0U2VudGltZW50IHtcblxuXHQvKipcblx0ICogVXNlcnMgbGFzdCBrbm93biBvciByZXNvbHZlZCBlbnRpdGxlbWVudC5cblx0ICovXG5cdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQ7XG5cblx0LyoqXG5cdCAqIFVzZXIncyBsYXN0IGtub3duIG9yIHJlc29sdmVkIHJhdyBTS1UgdHlwZS5cblx0ICovXG5cdHNrdTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBVc2VyJ3MgbGFzdCBrbm93biBvciByZXNvbHZlZCBvcmdhbmlzYXRpb25zLlxuXHQgKi9cblx0b3JnYW5pc2F0aW9uczogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFVzZXIncyBDb3BpbG90IHRyYWNraW5nIElEIGZyb20gdGhlIGVudGl0bGVtZW50IEFQSS5cblx0ICovXG5cdGNvcGlsb3RUcmFja2luZ0lkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0RW50aXRsZW1lbnRDb250ZXh0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ0hBVF9FTlRJVExFTUVOVF9DT05URVhUX1NUT1JBR0VfS0VZID0gJ2NoYXQuc2V0dXBDb250ZXh0Jztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ0hBVF9FTlRJVExFTUVOVF9DT05URVhUX01JR1JBVEVEX1NUT1JBR0VfS0VZID0gJ2NoYXQuc2V0dXBDb250ZXh0Lm1pZ3JhdGVkLnYxJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNhblNpZ25VcENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNpZ25lZE91dENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZnJlZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGVkdUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb1BsdXNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBtYXhDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBidXNpbmVzc0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGVudGVycHJpc2VDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG9yZ2FuaXNhdGlvbnNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxzdHJpbmdbXSB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgaXNJbnRlcm5hbENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNrdUNvbnRleHRLZXk6IElDb250ZXh0S2V5PHN0cmluZyB8IHVuZGVmaW5lZD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb21wbGV0ZWRDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBoaWRkZW5Db250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNhYmxlZEluV29ya3NwYWNlQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgbGF0ZXJDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBpbnN0YWxsZWRDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNhYmxlZENvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHVudHJ1c3RlZENvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlZ2lzdGVyZWRDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIF9zdGF0ZTogSUNoYXRFbnRpdGxlbWVudENvbnRleHRTdGF0ZTtcblx0cHJpdmF0ZSBzdXNwZW5kZWRTdGF0ZTogSUNoYXRFbnRpdGxlbWVudENvbnRleHRTdGF0ZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Z2V0IHN0YXRlKCk6IElDaGF0RW50aXRsZW1lbnRDb250ZXh0U3RhdGUgeyByZXR1cm4gdGhpcy53aXRoQ29uZmlndXJhdGlvbih0aGlzLnN1c3BlbmRlZFN0YXRlID8/IHRoaXMuX3N0YXRlKTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSB1cGRhdGVCYXJyaWVyOiBCYXJyaWVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5jYW5TaWduVXBDb250ZXh0S2V5ID0gQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuRW50aXRsZW1lbnQuY2FuU2lnblVwLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zaWduZWRPdXRDb250ZXh0S2V5ID0gQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuRW50aXRsZW1lbnQuc2lnbmVkT3V0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLmZyZWVDb250ZXh0S2V5ID0gQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuRW50aXRsZW1lbnQucGxhbkZyZWUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmVkdUNvbnRleHRLZXkgPSBDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5wbGFuRWR1LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5wcm9Db250ZXh0S2V5ID0gQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuRW50aXRsZW1lbnQucGxhblByby5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMucHJvUGx1c0NvbnRleHRLZXkgPSBDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5wbGFuUHJvUGx1cy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMubWF4Q29udGV4dEtleSA9IENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5NYXguYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmJ1c2luZXNzQ29udGV4dEtleSA9IENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5CdXNpbmVzcy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZW50ZXJwcmlzZUNvbnRleHRLZXkgPSBDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5wbGFuRW50ZXJwcmlzZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5vcmdhbmlzYXRpb25zQ29udGV4dEtleSA9IENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLkVudGl0bGVtZW50Lm9yZ2FuaXNhdGlvbnMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmlzSW50ZXJuYWxDb250ZXh0S2V5ID0gQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuRW50aXRsZW1lbnQuaW50ZXJuYWwuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNrdUNvbnRleHRLZXkgPSBDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5za3UuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuY29tcGxldGVkQ29udGV4dCA9IENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLlNldHVwLmNvbXBsZXRlZC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaGlkZGVuQ29udGV4dCA9IENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZGlzYWJsZWRJbldvcmtzcGFjZUNvbnRleHQgPSBDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5TZXR1cC5kaXNhYmxlZEluV29ya3NwYWNlLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5sYXRlckNvbnRleHQgPSBDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5TZXR1cC5sYXRlci5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaW5zdGFsbGVkQ29udGV4dCA9IENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLlNldHVwLmluc3RhbGxlZC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZGlzYWJsZWRDb250ZXh0ID0gQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnVudHJ1c3RlZENvbnRleHQgPSBDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5TZXR1cC51bnRydXN0ZWQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnJlZ2lzdGVyZWRDb250ZXh0ID0gQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuU2V0dXAucmVnaXN0ZXJlZC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fc3RhdGUgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdDxJQ2hhdEVudGl0bGVtZW50Q29udGV4dFN0YXRlPihDaGF0RW50aXRsZW1lbnRDb250ZXh0LkNIQVRfRU5USVRMRU1FTlRfQ09OVEVYVF9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpID8/IHtcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuVW5rbm93bixcblx0XHRcdG9yZ2FuaXNhdGlvbnM6IHVuZGVmaW5lZCxcblx0XHRcdHNrdTogdW5kZWZpbmVkLFxuXHRcdFx0Y29waWxvdFRyYWNraW5nSWQ6IHVuZGVmaW5lZFxuXHRcdH07XG5cblx0XHRjb25zdCBtaWdyYXRlZCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihDaGF0RW50aXRsZW1lbnRDb250ZXh0LkNIQVRfRU5USVRMRU1FTlRfQ09OVEVYVF9NSUdSQVRFRF9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpID09PSB0cnVlO1xuXHRcdGlmICghbWlncmF0ZWQpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ2hhdEVudGl0bGVtZW50Q29udGV4dC5DSEFUX0VOVElUTEVNRU5UX0NPTlRFWFRfTUlHUkFURURfU1RPUkFHRV9LRVksIHRydWUsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0aWYgKHRoaXMuX3N0YXRlLmluc3RhbGxlZCAmJiAhdGhpcy5fc3RhdGUuY29tcGxldGVkKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLmNvbXBsZXRlZCA9IHRydWU7IC8vIHRyZWF0IGluc3RhbGxhdGlvbiBzaWduYWwgYXMgY29tcGxldGVkIHNpZ25hbCBvbmNlXG5cdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ2hhdEVudGl0bGVtZW50Q29udGV4dC5DSEFUX0VOVElUTEVNRU5UX0NPTlRFWFRfU1RPUkFHRV9LRVksIHRoaXMuX3N0YXRlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUNvbnRleHRTeW5jKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQ29udGV4dCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZvcmNlSGlkZGVuID0gZmFsc2U7XG5cblx0cHJpdmF0ZSB3aXRoQ29uZmlndXJhdGlvbihzdGF0ZTogSUNoYXRFbnRpdGxlbWVudENvbnRleHRTdGF0ZSk6IElDaGF0RW50aXRsZW1lbnRDb250ZXh0U3RhdGUge1xuXHRcdGlmICh0aGlzLl9mb3JjZUhpZGRlbiB8fCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKENoYXRBSURpc2FibGVkU2V0dGluZ0lkKSA9PT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4uc3RhdGUsXG5cdFx0XHRcdGhpZGRlbjogdHJ1ZVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3RhdGU7XG5cdH1cblxuXHRzZXRGb3JjZUhpZGRlbihoaWRkZW46IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZm9yY2VIaWRkZW4gIT09IGhpZGRlbikge1xuXHRcdFx0dGhpcy5fZm9yY2VIaWRkZW4gPSBoaWRkZW47XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbnRleHQoKTtcblx0XHR9XG5cdH1cblxuXHR1cGRhdGUoY29udGV4dDogeyBpbnN0YWxsZWQ6IGJvb2xlYW47IGRpc2FibGVkOiBib29sZWFuOyB1bnRydXN0ZWQ6IGJvb2xlYW47IGRpc2FibGVkSW5Xb3Jrc3BhY2U6IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD47XG5cdHVwZGF0ZShjb250ZXh0OiB7IGNvbXBsZXRlZDogdHJ1ZSB9KTogUHJvbWlzZTx2b2lkPjtcblx0dXBkYXRlKGNvbnRleHQ6IHsgaGlkZGVuOiBmYWxzZSB9KTogUHJvbWlzZTx2b2lkPjsgLy8gbGVnYWN5IFVJIHN0YXRlIGZyb20gYmVmb3JlIHdlIGhhZCBhIHNldHRpbmcgdG8gaGlkZSwga2VlcCBhcm91bmQgdG8gc3RpbGwgc3VwcG9ydCB1c2VycyB3aG8gdXNlZCB0aGlzXG5cdHVwZGF0ZShjb250ZXh0OiB7IGxhdGVyOiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+O1xuXHR1cGRhdGUoY29udGV4dDogeyBlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50OyBvcmdhbmlzYXRpb25zOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDsgc2t1OiBzdHJpbmcgfCB1bmRlZmluZWQ7IGNvcGlsb3RUcmFja2luZ0lkOiBzdHJpbmcgfCB1bmRlZmluZWQgfSk6IFByb21pc2U8dm9pZD47XG5cdGFzeW5jIHVwZGF0ZShjb250ZXh0OiB7IGNvbXBsZXRlZD86IGJvb2xlYW47IGluc3RhbGxlZD86IGJvb2xlYW47IGRpc2FibGVkPzogYm9vbGVhbjsgdW50cnVzdGVkPzogYm9vbGVhbjsgZGlzYWJsZWRJbldvcmtzcGFjZT86IGJvb2xlYW47IGhpZGRlbj86IGZhbHNlOyBsYXRlcj86IGJvb2xlYW47IGVudGl0bGVtZW50PzogQ2hhdEVudGl0bGVtZW50OyBvcmdhbmlzYXRpb25zPzogc3RyaW5nW107IHNrdT86IHN0cmluZzsgY29waWxvdFRyYWNraW5nSWQ/OiBzdHJpbmcgfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW2NoYXQgZW50aXRsZW1lbnQgY29udGV4dF0gdXBkYXRlKCk6ICR7SlNPTi5zdHJpbmdpZnkoY29udGV4dCl9YCk7XG5cblx0XHRjb25zdCBvbGRTdGF0ZSA9IEpTT04uc3RyaW5naWZ5KHRoaXMuX3N0YXRlKTtcblxuXHRcdGlmICh0eXBlb2YgY29udGV4dC5pbnN0YWxsZWQgPT09ICdib29sZWFuJyAmJiB0eXBlb2YgY29udGV4dC5kaXNhYmxlZCA9PT0gJ2Jvb2xlYW4nICYmIHR5cGVvZiBjb250ZXh0LnVudHJ1c3RlZCA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5pbnN0YWxsZWQgPSBjb250ZXh0Lmluc3RhbGxlZDtcblx0XHRcdHRoaXMuX3N0YXRlLmRpc2FibGVkID0gY29udGV4dC5kaXNhYmxlZDtcblx0XHRcdHRoaXMuX3N0YXRlLnVudHJ1c3RlZCA9IGNvbnRleHQudW50cnVzdGVkO1xuXHRcdFx0dGhpcy5fc3RhdGUuZGlzYWJsZWRJbldvcmtzcGFjZSA9IGNvbnRleHQuZGlzYWJsZWRJbldvcmtzcGFjZTtcblxuXHRcdFx0aWYgKGNvbnRleHQuaW5zdGFsbGVkICYmICFjb250ZXh0LmRpc2FibGVkKSB7XG5cdFx0XHRcdGNvbnRleHQuaGlkZGVuID0gZmFsc2U7IC8vIHRyZWF0IHRoaXMgYXMgYSBzaWduIHRvIG1ha2UgQ2hhdCB2aXNpYmxlIGFnYWluIGluIGNhc2UgaXQgaXMgaGlkZGVuXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBjb250ZXh0LmhpZGRlbiA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5oaWRkZW4gPSBjb250ZXh0LmhpZGRlbjtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIGNvbnRleHQubGF0ZXIgPT09ICdib29sZWFuJykge1xuXHRcdFx0dGhpcy5fc3RhdGUubGF0ZXIgPSBjb250ZXh0LmxhdGVyO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgY29udGV4dC5jb21wbGV0ZWQgPT09ICdib29sZWFuJykge1xuXHRcdFx0dGhpcy5fc3RhdGUuY29tcGxldGVkID0gY29udGV4dC5jb21wbGV0ZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBjb250ZXh0LmVudGl0bGVtZW50ID09PSAnbnVtYmVyJykge1xuXHRcdFx0dGhpcy5fc3RhdGUuZW50aXRsZW1lbnQgPSBjb250ZXh0LmVudGl0bGVtZW50O1xuXHRcdFx0dGhpcy5fc3RhdGUub3JnYW5pc2F0aW9ucyA9IGNvbnRleHQub3JnYW5pc2F0aW9ucztcblx0XHRcdHRoaXMuX3N0YXRlLnNrdSA9IGNvbnRleHQuc2t1O1xuXHRcdFx0dGhpcy5fc3RhdGUuY29waWxvdFRyYWNraW5nSWQgPSBjb250ZXh0LmNvcGlsb3RUcmFja2luZ0lkO1xuXG5cdFx0XHRpZiAodGhpcy5fc3RhdGUuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5GcmVlIHx8IGlzUHJvVXNlcih0aGlzLl9zdGF0ZS5lbnRpdGxlbWVudCkpIHtcblx0XHRcdFx0dGhpcy5fc3RhdGUucmVnaXN0ZXJlZCA9IHRydWU7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX3N0YXRlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuQXZhaWxhYmxlKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLnJlZ2lzdGVyZWQgPSBmYWxzZTsgLy8gb25seSByZXNldCB3aGVuIHNpZ25lZC1pbiB1c2VyIGNhbiBzaWduLXVwIGZvciBmcmVlXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGlzQW5vbnltb3VzKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX3N0YXRlLmVudGl0bGVtZW50LCB0aGlzLl9zdGF0ZSkpIHtcblx0XHRcdHRoaXMuX3N0YXRlLnNrdSA9ICdub19hdXRoX2xpbWl0ZWRfY29waWxvdCc7IC8vIG5vLWF1dGggdXNlcnMgaGF2ZSBhIGZpeGVkIFNLVVxuXHRcdH1cblxuXHRcdGlmIChvbGRTdGF0ZSA9PT0gSlNPTi5zdHJpbmdpZnkodGhpcy5fc3RhdGUpKSB7XG5cdFx0XHRyZXR1cm47IC8vIHN0YXRlIGRpZCBub3QgY2hhbmdlXG5cdFx0fVxuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShDaGF0RW50aXRsZW1lbnRDb250ZXh0LkNIQVRfRU5USVRMRU1FTlRfQ09OVEVYVF9TVE9SQUdFX0tFWSwge1xuXHRcdFx0Li4udGhpcy5fc3RhdGUsXG5cdFx0XHRsYXRlcjogdW5kZWZpbmVkIC8vIGRvIG5vdCBwZXJzaXN0IHRoaXMgYWNyb3NzIHJlc3RhcnRzIGZvciBub3dcblx0XHR9LCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdHJldHVybiB0aGlzLnVwZGF0ZUNvbnRleHQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlQ29udGV4dCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnVwZGF0ZUJhcnJpZXI/LndhaXQoKTtcblxuXHRcdHRoaXMudXBkYXRlQ29udGV4dFN5bmMoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29udGV4dFN5bmMoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLndpdGhDb25maWd1cmF0aW9uKHRoaXMuX3N0YXRlKTtcblxuXHRcdHRoaXMuc2lnbmVkT3V0Q29udGV4dEtleS5zZXQoc3RhdGUuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5Vbmtub3duKTtcblx0XHR0aGlzLmNhblNpZ25VcENvbnRleHRLZXkuc2V0KHN0YXRlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuQXZhaWxhYmxlKTtcblxuXHRcdHRoaXMuZnJlZUNvbnRleHRLZXkuc2V0KHN0YXRlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRnJlZSk7XG5cdFx0dGhpcy5lZHVDb250ZXh0S2V5LnNldChzdGF0ZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkVEVSk7XG5cdFx0dGhpcy5wcm9Db250ZXh0S2V5LnNldChzdGF0ZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LlBybyk7XG5cdFx0dGhpcy5wcm9QbHVzQ29udGV4dEtleS5zZXQoc3RhdGUuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5Qcm9QbHVzKTtcblx0XHR0aGlzLm1heENvbnRleHRLZXkuc2V0KHN0YXRlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuTWF4KTtcblx0XHR0aGlzLmJ1c2luZXNzQ29udGV4dEtleS5zZXQoc3RhdGUuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5CdXNpbmVzcyk7XG5cdFx0dGhpcy5lbnRlcnByaXNlQ29udGV4dEtleS5zZXQoc3RhdGUuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5FbnRlcnByaXNlKTtcblxuXHRcdHRoaXMub3JnYW5pc2F0aW9uc0NvbnRleHRLZXkuc2V0KHN0YXRlLm9yZ2FuaXNhdGlvbnMpO1xuXHRcdHRoaXMuaXNJbnRlcm5hbENvbnRleHRLZXkuc2V0KEJvb2xlYW4oc3RhdGUub3JnYW5pc2F0aW9ucz8uc29tZShvcmcgPT4gb3JnID09PSAnZ2l0aHViJyB8fCBvcmcgPT09ICdtaWNyb3NvZnQnIHx8IG9yZyA9PT0gJ21zLWNvcGlsb3QnIHx8IG9yZyA9PT0gJ01pY3Jvc29mdENvcGlsb3QnKSkpO1xuXHRcdHRoaXMuc2t1Q29udGV4dEtleS5zZXQoc3RhdGUuc2t1KTtcblxuXHRcdHRoaXMuY29tcGxldGVkQ29udGV4dC5zZXQoISFzdGF0ZS5jb21wbGV0ZWQpO1xuXHRcdHRoaXMuaGlkZGVuQ29udGV4dC5zZXQoISFzdGF0ZS5oaWRkZW4pO1xuXHRcdHRoaXMuZGlzYWJsZWRJbldvcmtzcGFjZUNvbnRleHQuc2V0KCEhc3RhdGUuZGlzYWJsZWRJbldvcmtzcGFjZSk7XG5cdFx0dGhpcy5sYXRlckNvbnRleHQuc2V0KCEhc3RhdGUubGF0ZXIpO1xuXHRcdHRoaXMuaW5zdGFsbGVkQ29udGV4dC5zZXQoISFzdGF0ZS5pbnN0YWxsZWQpO1xuXHRcdHRoaXMuZGlzYWJsZWRDb250ZXh0LnNldCghIXN0YXRlLmRpc2FibGVkKTtcblx0XHR0aGlzLnVudHJ1c3RlZENvbnRleHQuc2V0KCEhc3RhdGUudW50cnVzdGVkKTtcblx0XHR0aGlzLnJlZ2lzdGVyZWRDb250ZXh0LnNldCghIXN0YXRlLnJlZ2lzdGVyZWQpO1xuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbY2hhdCBlbnRpdGxlbWVudCBjb250ZXh0XSB1cGRhdGVDb250ZXh0KCk6ICR7SlNPTi5zdHJpbmdpZnkoc3RhdGUpfWApO1xuXHRcdGxvZ0NoYXRFbnRpdGxlbWVudHMoc3RhdGUsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMudGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdH1cblxuXHRzdXNwZW5kKCk6IHZvaWQge1xuXHRcdHRoaXMuc3VzcGVuZGVkU3RhdGUgPSB7IC4uLnRoaXMuX3N0YXRlIH07XG5cdFx0dGhpcy51cGRhdGVCYXJyaWVyID0gbmV3IEJhcnJpZXIoKTtcblx0fVxuXG5cdHJlc3VtZSgpOiB2b2lkIHtcblx0XHR0aGlzLnN1c3BlbmRlZFN0YXRlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMudXBkYXRlQmFycmllcj8ub3BlbigpO1xuXHRcdHRoaXMudXBkYXRlQmFycmllciA9IHVuZGVmaW5lZDtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIENoYXRFbnRpdGxlbWVudFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyIC8qIFRvIGVuc3VyZSBjb250ZXh0IGtleXMgYXJlIHNldCBhc2FwICovKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTyxhQUFhO0FBQ3BCLFNBQVMsZUFBZTtBQUN4QixTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsWUFBWSx5QkFBeUI7QUFFOUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBc0Isb0JBQW9CLHFCQUFxQjtBQUMvRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlCQUFpQiw2QkFBNkI7QUFDdkQsU0FBUyxhQUFhLGdCQUFnQjtBQUN0QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFFBQVEsdUJBQXVCO0FBQ3hDLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsbUJBQW1CLHNCQUFzQjtBQUNsRCxTQUFnQyw4QkFBOEI7QUFDOUQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxXQUFXO0FBQ3BCLE9BQU8sY0FBYztBQUNyQixTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGFBQWE7QUFDdEIsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQXNCLDJCQUEyQjtBQUNqRCxTQUFTLDhCQUE4QjtBQUdoQyxJQUFVO0FBQUEsQ0FBVixDQUFVQSxnQ0FBVjtBQUVDLEVBQU1BLDRCQUFBLFFBQVE7QUFBQSxJQUNwQixRQUFRLElBQUksY0FBdUIsbUJBQW1CLE9BQU8sSUFBSTtBQUFBO0FBQUEsSUFDakUsV0FBVyxJQUFJLGNBQXVC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SyxrQkFBa0IsSUFBSSxNQUFNLGdCQUFnQixlQUF1QjtBQUN4RSxTQUFLLGNBQWMsSUFBSSxNQUFNLGdCQUFnQixZQUFtQjtBQUNoRSxTQUFLLG1CQUFtQixJQUFJLE1BQU0sZ0JBQWdCLGdCQUF3QjtBQUMxRSxTQUFLLHFCQUFxQixJQUFJLE1BQU0sZ0JBQWdCLGtCQUEwQjtBQUU5RSxTQUFLLHdCQUF3QixJQUFJLE1BQU0sYUFBYTtBQUNwRCxTQUFLLHFCQUFxQixJQUFJLFFBQVEsTUFBTSxlQUFlLEtBQUssU0FBTyxRQUFRLFlBQVksUUFBUSxlQUFlLFFBQVEsZ0JBQWdCLFFBQVEsa0JBQWtCLENBQUMsQ0FBQztBQUN0SyxTQUFLLGNBQWMsSUFBSSxNQUFNLEdBQUc7QUFFaEMsU0FBSyxpQkFBaUIsSUFBSSxDQUFDLENBQUMsTUFBTSxTQUFTO0FBQzNDLFNBQUssY0FBYyxJQUFJLENBQUMsQ0FBQyxNQUFNLE1BQU07QUFDckMsU0FBSywyQkFBMkIsSUFBSSxDQUFDLENBQUMsTUFBTSxtQkFBbUI7QUFDL0QsU0FBSyxhQUFhLElBQUksQ0FBQyxDQUFDLE1BQU0sS0FBSztBQUNuQyxTQUFLLGlCQUFpQixJQUFJLENBQUMsQ0FBQyxNQUFNLFNBQVM7QUFDM0MsU0FBSyxnQkFBZ0IsSUFBSSxDQUFDLENBQUMsTUFBTSxRQUFRO0FBQ3pDLFNBQUssaUJBQWlCLElBQUksQ0FBQyxDQUFDLE1BQU0sU0FBUztBQUMzQyxTQUFLLGtCQUFrQixJQUFJLENBQUMsQ0FBQyxNQUFNLFVBQVU7QUFFN0MsU0FBSyxXQUFXLE1BQU0sK0NBQStDLEtBQUssVUFBVSxLQUFLLENBQUMsRUFBRTtBQUM1Rix3QkFBb0IsT0FBTyxLQUFLLHNCQUFzQixLQUFLLGdCQUFnQjtBQUUzRSxTQUFLLGFBQWEsS0FBSztBQUFBLEVBQ3hCO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssaUJBQWlCLEVBQUUsR0FBRyxLQUFLLE9BQU87QUFDdkMsU0FBSyxnQkFBZ0IsSUFBSSxRQUFRO0FBQUEsRUFDbEM7QUFBQSxFQUVBLFNBQWU7QUFDZCxTQUFLLGlCQUFpQjtBQUN0QixTQUFLLGVBQWUsS0FBSztBQUN6QixTQUFLLGdCQUFnQjtBQUFBLEVBQ3RCO0FBQ0Q7QUF2T2EsdUJBRVksdUNBQXVDO0FBRm5ELHVCQUdZLGdEQUFnRDtBQUg1RCx5QkFBTjtBQUFBLEVBdUNKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBM0NVO0FBMk9iO0FBQUEsRUFBa0I7QUFBQSxFQUF5QjtBQUFBLEVBQXdCLGtCQUFrQjtBQUFBO0FBQStDOyIsCiAgIm5hbWVzIjogWyJDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cyIsICJDaGF0RW50aXRsZW1lbnQiLCAicmVzcG9uc2VUZXh0Il0KfQo=
