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
import { safeIntl } from "../../../../base/common/date.js";
import { createMarkdownCommandLink, MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkbenchAssignmentService } from "../../../services/assignment/common/assignmentService.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { getSelectedModelIdentifier, getSelectedModelMetadata, isSelectedModelCopilot, SELECTED_MODEL_STORAGE_KEY_PREFIX, SELECTED_MODEL_STORAGE_SCOPE } from "../common/chatSelectedModel.js";
import { ILanguageModelsService, isAutoLanguageModel } from "../common/languageModels.js";
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationService } from "./widget/input/chatInputNotificationService.js";
const QUOTA_NOTIFICATION_ID = "copilot.quotaStatus";
const THRESHOLDS = [50, 75, 90, 95];
const SWITCH_TO_AUTO_TREATMENT_NAME = "config.chatQuotaWarningSwitchToAuto";
const TRAJECTORY_NUDGE_SPEC = {
  treatmentName: "config.chatQuotaTrajectoryNudge",
  shownStorageKey: "chat.quotaTrajectory.shownPeriod",
  averageDailyUsageThreshold: 4.5,
  minimumPercentUsed: 10,
  maximumPercentUsed: 35,
  msPerDay: 24 * 60 * 60 * 1e3,
  learnMoreUrl: "https://aka.ms/token-usage-tips",
  learnMoreCommandId: "workbench.action.chat.learnMoreAboutCreditUsage"
};
const QUOTA_EXHAUSTED_DISMISSED_STORAGE_KEY = "chat.quotaNotification.exhaustedDismissed";
let ChatQuotaNotificationContribution = class extends Disposable {
  constructor(_chatEntitlementService, _chatInputNotificationService, _contextKeyService, _languageModelsService, _storageService, _assignmentService, _telemetryService, _logService) {
    super();
    this._chatEntitlementService = _chatEntitlementService;
    this._chatInputNotificationService = _chatInputNotificationService;
    this._contextKeyService = _contextKeyService;
    this._languageModelsService = _languageModelsService;
    this._storageService = _storageService;
    this._assignmentService = _assignmentService;
    this._telemetryService = _telemetryService;
    this._logService = _logService;
    /** Tracks whether the current notification is the quota-exhausted variant. */
    this._showingExhausted = false;
    this._switchToAutoAssignmentRequested = false;
    this._trajectoryAssignmentRequested = false;
    this._register(this._chatEntitlementService.onDidChangeQuotaRemaining(() => this._update()));
    this._register(this._chatEntitlementService.onDidChangeQuotaExceeded(() => this._update()));
    this._register(this._chatEntitlementService.onDidChangeEntitlement(() => this._update()));
    this._register(this._languageModelsService.onDidChangeLanguageModels(() => this._refreshActiveQuotaApproachingWarning()));
    this._register(CommandsRegistry.registerCommand(TRAJECTORY_NUDGE_SPEC.learnMoreCommandId, (accessor) => this._handleCreditEfficiencyLearnMoreCommand(accessor)));
    const storageListener = this._register(new DisposableStore());
    this._register(this._storageService.onDidChangeValue(SELECTED_MODEL_STORAGE_SCOPE, void 0, storageListener)((e) => {
      if (e.key.startsWith(SELECTED_MODEL_STORAGE_KEY_PREFIX)) {
        this._refreshActiveQuotaApproachingWarning();
        this._update();
      }
    }));
    this._register(this._chatInputNotificationService.onDidDismiss((id) => {
      if (id === QUOTA_NOTIFICATION_ID && this._showingExhausted) {
        this._setExhaustedDismissed();
      }
    }));
    this._update();
  }
  async _resolveSwitchToAutoTreatment() {
    const treatment = await this._assignmentService.getTreatment(SWITCH_TO_AUTO_TREATMENT_NAME);
    this._switchToAutoTreatment = treatment;
    if (treatment === true) {
      this._refreshActiveQuotaApproachingWarning();
    }
  }
  _requestSwitchToAutoTreatment() {
    if (!this._switchToAutoAssignmentRequested) {
      this._switchToAutoAssignmentRequested = true;
      void this._resolveSwitchToAutoTreatment().catch((error) => {
        this._logService.error(`Failed to resolve ${SWITCH_TO_AUTO_TREATMENT_NAME}`, error);
        this._switchToAutoAssignmentRequested = false;
      });
    }
  }
  /**
   * Reads the already-evaluated trajectory experiment cohort. The assignment
   * service resolves the cohort asynchronously, so this is requested only once
   * the user has met every non-experiment condition required for the nudge.
   *
   * Stores the raw treatment value. `undefined` means the user is not
   * assigned to the flight (or assignments are not available); only a `true`
   * treatment renders the nudge. We deliberately do not coerce a missing
   * assignment into a synthetic "control" value, since that would assume an
   * enrollment that may not exist. Enrollment telemetry is emitted only when
   * the user is actually assigned to a flight.
   */
  async _resolveTrajectoryTreatment(warning) {
    const treatment = await this._assignmentService.getTreatment(TRAJECTORY_NUDGE_SPEC.treatmentName);
    this._trajectoryTreatment = treatment;
    if (treatment !== void 0) {
      this._logQuotaTrajectoryNudgeEnrolled(treatment, warning);
    }
    if (treatment === true) {
      this._update();
    }
  }
  _requestTrajectoryTreatment(warning) {
    if (!this._trajectoryAssignmentRequested) {
      this._trajectoryAssignmentRequested = true;
      void this._resolveTrajectoryTreatment(warning).catch((error) => {
        this._logService.error(`Failed to resolve ${TRAJECTORY_NUDGE_SPEC.treatmentName}`, error);
        this._trajectoryAssignmentRequested = false;
      });
    }
  }
  _getRelevantSnapshot() {
    const quotas = this._chatEntitlementService.quotas;
    const entitlement = this._chatEntitlementService.entitlement;
    if (entitlement === ChatEntitlement.Unknown || entitlement === ChatEntitlement.Free) {
      return quotas.chat ?? quotas.premiumChat;
    }
    return quotas.premiumChat;
  }
  _isQuotaUsedUp() {
    const snapshot = this._getRelevantSnapshot();
    if (!snapshot) {
      return false;
    }
    if (snapshot.unlimited) {
      return snapshot.hasQuota === false;
    }
    return snapshot.percentRemaining <= 0;
  }
  _isUBBEligible() {
    return this._chatEntitlementService.quotas.usageBasedBilling === true;
  }
  _update() {
    const entitlement = this._chatEntitlementService.entitlement;
    const isCopilot = this._isCopilotModelSelected();
    if (this._isQuotaKnownAvailable()) {
      this._clearExhaustedDismissed();
    }
    if (!isCopilot) {
      return;
    }
    const isQuotaNotificationEligible = entitlement === ChatEntitlement.Unknown || this._isUBBEligible();
    if (this._isManagedPlan(entitlement) && this._isManagedPlanBlocked()) {
      if (!this._isExhaustedDismissed()) {
        this._showManagedPlanBlockedNotification();
      }
      return;
    }
    if (isQuotaNotificationEligible && this._isQuotaUsedUp()) {
      const quotas = this._chatEntitlementService.quotas;
      const additionalUsageEnabled = quotas.additionalUsageEnabled ?? false;
      const wasAdditionalUsageEnabled = this._prevAdditionalUsageEnabled;
      this._prevAdditionalUsageEnabled = additionalUsageEnabled;
      if (!this._isExhaustedDismissed()) {
        if (additionalUsageEnabled) {
          if (this._prevQuotaPercentUsed !== void 0 || wasAdditionalUsageEnabled === false) {
            this._showOverageActivationNotification();
          }
        } else {
          this._showExhaustedNotification();
        }
      }
      const exhaustedSnapshot = this._getRelevantSnapshot();
      if (exhaustedSnapshot && !exhaustedSnapshot.unlimited) {
        this._prevQuotaPercentUsed = 100 - exhaustedSnapshot.percentRemaining;
      }
      return;
    }
    if (isQuotaNotificationEligible) {
      const trajectoryWarning = this._computeQuotaTrajectoryWarning();
      if (trajectoryWarning) {
        this._showQuotaTrajectoryWarning(trajectoryWarning);
        return;
      }
      const quotaWarning = this._computeQuotaWarning();
      if (quotaWarning) {
        this._showQuotaApproachingWarning(quotaWarning);
        return;
      }
    }
    const rateLimitWarning = this._computeRateLimitWarning();
    if (rateLimitWarning) {
      this._showRateLimitWarning(rateLimitWarning);
      return;
    }
    if (this._showingExhausted && !this._isQuotaUsedUp()) {
      this._hideNotification();
    }
  }
  // --- Threshold crossing detection ----------------------------------------
  _computeQuotaWarning() {
    const snapshot = this._getRelevantSnapshot();
    if (!snapshot || snapshot.unlimited) {
      this._prevQuotaPercentUsed = void 0;
      return void 0;
    }
    const percentUsed = 100 - snapshot.percentRemaining;
    const crossed = this._findCrossedThreshold(percentUsed, this._prevQuotaPercentUsed);
    this._prevQuotaPercentUsed = percentUsed;
    if (crossed !== void 0) {
      return { percentUsed: Math.floor(percentUsed), threshold: crossed };
    }
    return void 0;
  }
  _computeQuotaTrajectoryWarning() {
    if (this._isTrajectoryShownInCurrentPeriod()) {
      return void 0;
    }
    const snapshot = this._getRelevantSnapshot();
    if (!snapshot || snapshot.unlimited || snapshot.percentRemaining <= 0) {
      return void 0;
    }
    const resetDate = this._chatEntitlementService.quotas.resetDate;
    if (!resetDate) {
      return void 0;
    }
    const reset = new Date(resetDate);
    const resetTime = reset.getTime();
    if (!Number.isFinite(resetTime)) {
      return void 0;
    }
    const periodStart = new Date(resetTime);
    periodStart.setUTCMonth(periodStart.getUTCMonth() - 1);
    const periodStartTime = periodStart.getTime();
    const elapsedDays = (Date.now() - periodStartTime) / TRAJECTORY_NUDGE_SPEC.msPerDay;
    if (elapsedDays < 0) {
      return void 0;
    }
    const percentUsed = 100 - snapshot.percentRemaining;
    if (percentUsed < TRAJECTORY_NUDGE_SPEC.minimumPercentUsed || percentUsed > TRAJECTORY_NUDGE_SPEC.maximumPercentUsed) {
      return void 0;
    }
    const averageDailyUsage = percentUsed / Math.max(1, elapsedDays);
    if (averageDailyUsage < TRAJECTORY_NUDGE_SPEC.averageDailyUsageThreshold) {
      return void 0;
    }
    this._requestTrajectoryTreatment({ averageDailyUsage, percentUsed });
    return this._trajectoryTreatment === true ? { averageDailyUsage, percentUsed } : void 0;
  }
  _showQuotaTrajectoryWarning(warning) {
    this._showingExhausted = false;
    this._storeTrajectoryShown();
    const learnMoreLink = createMarkdownCommandLink({
      text: localize("quota.trajectory.learnMoreStandalone", "Learn about optimizing usage"),
      id: TRAJECTORY_NUDGE_SPEC.learnMoreCommandId,
      tooltip: localize("quota.trajectory.learnMoreTooltip", "Learn about optimizing usage")
    });
    const message = localize({ key: "quota.trajectory.message", comment: ['{Locked="["}', '{Locked="]({0})"}'] }, "You're likely to exhaust your AI credits before your billing period. {0}.", learnMoreLink);
    this._setNotification({
      id: QUOTA_NOTIFICATION_ID,
      telemetryId: "quotaTrajectoryNudge",
      severity: ChatInputNotificationSeverity.Info,
      message: new MarkdownString(message, { isTrusted: { enabledCommands: [TRAJECTORY_NUDGE_SPEC.learnMoreCommandId] } }),
      description: void 0,
      actions: [],
      dismissible: true,
      autoDismissOnMessage: false
    });
  }
  async _handleCreditEfficiencyLearnMoreCommand(accessor) {
    this._telemetryService.publicLog2("chatQuotaTrajectoryNudgeLinkClicked");
    queueMicrotask(() => this._hideNotification());
    await accessor.get(IOpenerService).open(URI.parse(TRAJECTORY_NUDGE_SPEC.learnMoreUrl));
  }
  _logQuotaTrajectoryNudgeEnrolled(treatment, warning) {
    this._telemetryService.publicLog2("chatQuotaTrajectoryNudgeEnrolled", {
      treatment,
      entitlement: ChatEntitlement[this._chatEntitlementService.entitlement],
      averageDailyUsage: Math.round(warning.averageDailyUsage * 100) / 100,
      percentUsed: Math.round(warning.percentUsed * 100) / 100
    });
  }
  /**
   * Returns the highest threshold that was newly crossed, or `undefined`.
   */
  _findCrossedThreshold(current, previous) {
    if (previous === void 0) {
      return void 0;
    }
    for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
      const threshold = THRESHOLDS[i];
      if (previous < threshold && current >= threshold) {
        return threshold;
      }
    }
    return void 0;
  }
  // --- Quota exhausted ---------------------------------------------------
  _showExhaustedNotification() {
    this._showingExhausted = true;
    const entitlement = this._chatEntitlementService.entitlement;
    const quotas = this._chatEntitlementService.quotas;
    const hadOverage = (quotas.additionalUsageCount ?? 0) > 0;
    let description;
    let actions;
    if (entitlement === ChatEntitlement.Unknown) {
      description = localize("quota.exhausted.anonymous", "Sign in to keep going.");
      actions = [{ kind: ChatInputNotificationActionKind.Command, label: localize("signIn", "Sign In"), commandId: "workbench.action.chat.triggerSetup" }];
    } else if (entitlement === ChatEntitlement.Free) {
      description = localize("quota.exhausted.free", "Upgrade to keep going.");
      actions = [{ kind: ChatInputNotificationActionKind.Command, label: localize("upgrade", "Upgrade"), commandId: "workbench.action.chat.upgradePlan" }];
    } else if (this._isManagedPlan(entitlement)) {
      description = localize("quota.exhausted.managed", "Contact your admin to increase your limits.");
      actions = [];
    } else if (hadOverage) {
      description = localize("quota.exhausted.hadOverage", "Increase your budget to keep building.");
      actions = [{ kind: ChatInputNotificationActionKind.Command, label: localize("manageBudget", "Manage Budget"), commandId: "workbench.action.chat.manageAdditionalSpend" }];
    } else {
      description = localize("quota.exhausted.default", "Manage your budget to keep building.");
      actions = [{ kind: ChatInputNotificationActionKind.Command, label: localize("manageBudget2", "Manage Budget"), commandId: "workbench.action.chat.manageAdditionalSpend" }];
    }
    this._setNotification({
      id: QUOTA_NOTIFICATION_ID,
      telemetryId: "quotaExhausted",
      severity: ChatInputNotificationSeverity.Info,
      message: localize("quota.exhausted.title", "Credit Limit Reached"),
      description,
      actions,
      dismissible: true,
      autoDismissOnMessage: true
    });
  }
  // --- Overage notification -----------------------------------------------
  _showOverageActivationNotification() {
    this._showingExhausted = true;
    this._setNotification({
      id: QUOTA_NOTIFICATION_ID,
      telemetryId: "overageActivation",
      severity: ChatInputNotificationSeverity.Info,
      message: localize("quota.overage.title", "Credit Limit Reached"),
      description: localize("quota.overage.desc", "Additional budget is now covering extra usage."),
      actions: [],
      dismissible: true,
      autoDismissOnMessage: true
    });
  }
  // --- Quota approaching --------------------------------------------------
  _showQuotaApproachingWarning(warning) {
    this._showingExhausted = false;
    this._activeQuotaWarning = warning;
    const entitlement = this._chatEntitlementService.entitlement;
    const quotas = this._chatEntitlementService.quotas;
    let description;
    let actions;
    if (entitlement === ChatEntitlement.Unknown || entitlement === ChatEntitlement.Free) {
      description = localize("quota.approaching.free", "Upgrade to continue past the limit.");
      actions = [{ kind: ChatInputNotificationActionKind.Command, label: localize("upgrade2", "Upgrade"), commandId: "workbench.action.chat.upgradePlan" }];
    } else if (this._isManagedPlan(entitlement)) {
      description = localize("quota.approaching.managed", "Contact your admin to increase your limits.");
      actions = [];
    } else if (quotas.additionalUsageEnabled) {
      description = localize("quota.approaching.overageEnabled", "Additional budget is enabled to cover extra usage.");
      actions = [];
    } else {
      const autoModelIdentifier = this._getAutoModelIdentifier();
      const canSwitchToAuto = !!autoModelIdentifier && !this._isAutoModelSelected(autoModelIdentifier);
      if (canSwitchToAuto) {
        this._requestSwitchToAutoTreatment();
      }
      if (this._switchToAutoTreatment === true && canSwitchToAuto) {
        description = localize("quota.approaching.switchToAuto", "Switch to Auto to reduce credit usage.");
        actions = [{ kind: ChatInputNotificationActionKind.SwitchToModel, label: localize("switchToAuto", "Switch to Auto"), modelIdentifier: autoModelIdentifier }];
      } else {
        description = localize("quota.approaching.default", "Set additional budget to cover extra usage.");
        actions = [{ kind: ChatInputNotificationActionKind.Command, label: localize("manageBudget3", "Manage Budget"), commandId: "workbench.action.chat.manageAdditionalSpend" }];
      }
    }
    this._setNotification({
      id: QUOTA_NOTIFICATION_ID,
      telemetryId: `quotaApproaching${warning.threshold}`,
      severity: ChatInputNotificationSeverity.Info,
      message: localize("quota.approaching.title", "Credits at {0}%", warning.percentUsed),
      description,
      actions,
      dismissible: true,
      autoDismissOnMessage: true
    });
  }
  // --- Rate-limit warning -------------------------------------------------
  _computeRateLimitWarning() {
    const quotas = this._chatEntitlementService.quotas;
    const sessionResult = this._checkRateLimitCrossing(quotas.sessionRateLimit, this._prevSessionPercentUsed);
    this._prevSessionPercentUsed = sessionResult.newPrev;
    const weeklyResult = this._checkRateLimitCrossing(quotas.weeklyRateLimit, this._prevWeeklyPercentUsed);
    this._prevWeeklyPercentUsed = weeklyResult.newPrev;
    if (sessionResult.warning) {
      return { ...sessionResult.warning, type: "session" };
    }
    if (weeklyResult.warning) {
      return { ...weeklyResult.warning, type: "weekly" };
    }
    return void 0;
  }
  _checkRateLimitCrossing(snapshot, prevPercentUsed) {
    if (!snapshot || snapshot.unlimited) {
      return { newPrev: void 0 };
    }
    const percentUsed = 100 - snapshot.percentRemaining;
    const crossed = this._findCrossedThreshold(percentUsed, prevPercentUsed);
    return {
      newPrev: percentUsed,
      warning: crossed !== void 0 ? { percentUsed: Math.floor(percentUsed), resetDate: snapshot.resetDate } : void 0
    };
  }
  _showRateLimitWarning(warning) {
    this._showingExhausted = false;
    const message = warning.type === "session" ? localize("rateLimit.session", "You've used {0}% of your session rate limit.", warning.percentUsed) : localize("rateLimit.weekly", "You've used {0}% of your weekly rate limit.", warning.percentUsed);
    const description = warning.resetDate ? localize("rateLimit.resets", "Resets on {0}.", this._formatResetDate(warning.resetDate)) : void 0;
    this._setNotification({
      id: QUOTA_NOTIFICATION_ID,
      telemetryId: warning.type === "session" ? "sessionRateLimitWarning" : "weeklyRateLimitWarning",
      severity: ChatInputNotificationSeverity.Info,
      message,
      description,
      actions: [],
      dismissible: true,
      autoDismissOnMessage: true
    });
  }
  // --- Helpers ------------------------------------------------------------
  /**
   * Returns `true` only when a Copilot model is actively selected.
   * Returns `false` if no model is selected yet (widget not initialized)
   * or if the selected model is from a non-Copilot vendor (BYOK).
   */
  _isCopilotModelSelected() {
    return isSelectedModelCopilot(this._contextKeyService, this._storageService, this._languageModelsService);
  }
  _getAutoModelIdentifier() {
    for (const identifier of this._languageModelsService.getLanguageModelIds()) {
      const metadata = this._languageModelsService.lookupLanguageModel(identifier);
      if (metadata && isAutoLanguageModel({ identifier, metadata })) {
        return identifier;
      }
    }
    return void 0;
  }
  _isAutoModelSelected(autoModelIdentifier) {
    const identifier = getSelectedModelIdentifier(this._contextKeyService, this._storageService);
    const autoModel = this._languageModelsService.lookupLanguageModel(autoModelIdentifier);
    if (identifier === autoModelIdentifier || identifier === autoModel?.id) {
      return true;
    }
    const metadata = getSelectedModelMetadata(this._contextKeyService, this._storageService, this._languageModelsService);
    return !!metadata && isAutoLanguageModel({ identifier: identifier ?? "", metadata });
  }
  _refreshActiveQuotaApproachingWarning() {
    const warning = this._activeQuotaWarning;
    if (!warning || !this._isCopilotModelSelected()) {
      return;
    }
    const notification = this._chatInputNotificationService.getActiveNotification((candidate) => candidate.id === QUOTA_NOTIFICATION_ID);
    if (notification?.telemetryId === `quotaApproaching${warning.threshold}`) {
      this._showQuotaApproachingWarning(warning);
    }
  }
  _isManagedPlan(entitlement) {
    return entitlement === ChatEntitlement.Business || entitlement === ChatEntitlement.Enterprise;
  }
  _isManagedPlanBlocked() {
    const snapshot = this._chatEntitlementService.quotas.premiumChat;
    return !!snapshot && snapshot.hasQuota === false;
  }
  _showManagedPlanBlockedNotification() {
    this._showingExhausted = true;
    this._setNotification({
      id: QUOTA_NOTIFICATION_ID,
      telemetryId: "managedPlanBlocked",
      severity: ChatInputNotificationSeverity.Info,
      message: localize("quota.blocked.managed.title", "Usage Blocked"),
      description: localize("quota.blocked.managed", "Your organization or enterprise has exceeded its Copilot budget. Contact your admin to resume usage."),
      actions: [],
      dismissible: true,
      autoDismissOnMessage: true
    });
  }
  _formatResetDate(isoDate) {
    const resetDate = new Date(isoDate);
    const now = /* @__PURE__ */ new Date();
    const includeYear = resetDate.getFullYear() !== now.getFullYear();
    return safeIntl.DateTimeFormat(
      void 0,
      includeYear ? { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" } : { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }
    ).value.format(resetDate);
  }
  _getTrajectoryPeriodKey() {
    const resetDate = this._chatEntitlementService.quotas.resetDate;
    if (!resetDate) {
      return void 0;
    }
    const date = new Date(resetDate);
    if (!Number.isFinite(date.getTime())) {
      return void 0;
    }
    return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
  }
  _isTrajectoryShownInCurrentPeriod() {
    const periodKey = this._getTrajectoryPeriodKey();
    return !!periodKey && this._storageService.get(TRAJECTORY_NUDGE_SPEC.shownStorageKey, StorageScope.APPLICATION) === periodKey;
  }
  _storeTrajectoryShown() {
    const periodKey = this._getTrajectoryPeriodKey();
    if (periodKey) {
      this._storageService.store(TRAJECTORY_NUDGE_SPEC.shownStorageKey, periodKey, StorageScope.APPLICATION, StorageTarget.USER);
    }
  }
  _setNotification(notification) {
    this._chatInputNotificationService.setNotification(notification);
  }
  _hideNotification() {
    this._showingExhausted = false;
    this._chatInputNotificationService.deleteNotification(QUOTA_NOTIFICATION_ID);
  }
  // --- Exhausted dismissal persistence ------------------------------------
  /**
   * Returns `true` only when there is an actual quota snapshot indicating that
   * credit is available (i.e. quota is not used up). Returns `false` when no
   * snapshot has loaded yet, so the transient "no data" state at startup/reload
   * is not mistaken for recovery.
   */
  _isQuotaKnownAvailable() {
    return !!this._getRelevantSnapshot() && !this._isQuotaUsedUp();
  }
  _isExhaustedDismissed() {
    return this._storageService.getBoolean(QUOTA_EXHAUSTED_DISMISSED_STORAGE_KEY, StorageScope.APPLICATION, false);
  }
  _setExhaustedDismissed() {
    this._storageService.store(QUOTA_EXHAUSTED_DISMISSED_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
  _clearExhaustedDismissed() {
    this._storageService.remove(QUOTA_EXHAUSTED_DISMISSED_STORAGE_KEY, StorageScope.APPLICATION);
  }
};
ChatQuotaNotificationContribution.ID = "workbench.contrib.chatQuotaNotification";
ChatQuotaNotificationContribution = __decorateClass([
  __decorateParam(0, IChatEntitlementService),
  __decorateParam(1, IChatInputNotificationService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, ILanguageModelsService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IWorkbenchAssignmentService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, ILogService)
], ChatQuotaNotificationContribution);
export {
  ChatQuotaNotificationContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRRdW90YU5vdGlmaWNhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHNhZmVJbnRsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVNYXJrZG93bkNvbW1hbmRMaW5rLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXNzaWdubWVudC9jb21tb24vYXNzaWdubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50LCBJQ2hhdEVudGl0bGVtZW50U2VydmljZSwgSVF1b3RhU25hcHNob3QsIElSYXRlTGltaXRTbmFwc2hvdCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0U2VsZWN0ZWRNb2RlbElkZW50aWZpZXIsIGdldFNlbGVjdGVkTW9kZWxNZXRhZGF0YSwgaXNTZWxlY3RlZE1vZGVsQ29waWxvdCwgU0VMRUNURURfTU9ERUxfU1RPUkFHRV9LRVlfUFJFRklYLCBTRUxFQ1RFRF9NT0RFTF9TVE9SQUdFX1NDT1BFIH0gZnJvbSAnLi4vY29tbW9uL2NoYXRTZWxlY3RlZE1vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIGlzQXV0b0xhbmd1YWdlTW9kZWwgfSBmcm9tICcuLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZCwgQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHksIElDaGF0SW5wdXROb3RpZmljYXRpb24sIElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi93aWRnZXQvaW5wdXQvY2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZS5qcyc7XG5cbmNvbnN0IFFVT1RBX05PVElGSUNBVElPTl9JRCA9ICdjb3BpbG90LnF1b3RhU3RhdHVzJztcbmNvbnN0IFRIUkVTSE9MRFMgPSBbNTAsIDc1LCA5MCwgOTVdO1xuY29uc3QgU1dJVENIX1RPX0FVVE9fVFJFQVRNRU5UX05BTUUgPSAnY29uZmlnLmNoYXRRdW90YVdhcm5pbmdTd2l0Y2hUb0F1dG8nO1xuY29uc3QgVFJBSkVDVE9SWV9OVURHRV9TUEVDID0ge1xuXHR0cmVhdG1lbnROYW1lOiAnY29uZmlnLmNoYXRRdW90YVRyYWplY3RvcnlOdWRnZScsXG5cdHNob3duU3RvcmFnZUtleTogJ2NoYXQucXVvdGFUcmFqZWN0b3J5LnNob3duUGVyaW9kJyxcblx0YXZlcmFnZURhaWx5VXNhZ2VUaHJlc2hvbGQ6IDQuNSxcblx0bWluaW11bVBlcmNlbnRVc2VkOiAxMCxcblx0bWF4aW11bVBlcmNlbnRVc2VkOiAzNSxcblx0bXNQZXJEYXk6IDI0ICogNjAgKiA2MCAqIDEwMDAsXG5cdGxlYXJuTW9yZVVybDogJ2h0dHBzOi8vYWthLm1zL3Rva2VuLXVzYWdlLXRpcHMnLFxuXHRsZWFybk1vcmVDb21tYW5kSWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQubGVhcm5Nb3JlQWJvdXRDcmVkaXRVc2FnZScsXG59IGFzIGNvbnN0O1xuXG50eXBlIENoYXRRdW90YVRyYWplY3RvcnlOdWRnZUxpbmtDbGlja2VkQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAncmZlbHRpcyc7XG5cdGNvbW1lbnQ6ICdUcmFja3Mgd2hlbiB1c2VycyBjbGljayB0aGUgY2hhdCBxdW90YSB0cmFqZWN0b3J5IG51ZGdlIGxlYXJuIG1vcmUgbGluay4nO1xufTtcblxudHlwZSBDaGF0UXVvdGFUcmFqZWN0b3J5TnVkZ2VFbnJvbGxtZW50RXZlbnQgPSB7XG5cdHRyZWF0bWVudDogYm9vbGVhbjtcblx0ZW50aXRsZW1lbnQ6IHN0cmluZztcblx0YXZlcmFnZURhaWx5VXNhZ2U6IG51bWJlcjtcblx0cGVyY2VudFVzZWQ6IG51bWJlcjtcbn07XG5cbnR5cGUgQ2hhdFF1b3RhVHJhamVjdG9yeU51ZGdlRW5yb2xsbWVudENsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ3JmZWx0aXMnO1xuXHRjb21tZW50OiAnVHJhY2tzIHdoZW4gYSB1c2VyIGlzIGFzc2lnbmVkIHRvIGEgZmxpZ2h0IGZvciB0aGUgY2hhdCBxdW90YSB0cmFqZWN0b3J5IG51ZGdlIGV4cGVyaW1lbnQsIHRvIG1lYXN1cmUgZXhwZXJpbWVudCBleHBvc3VyZS4nO1xuXHR0cmVhdG1lbnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgdHJlYXRtZW50IHZhbHVlIGFzc2lnbmVkIGJ5IHRoZSBleHBlcmltZW50IHNlcnZpY2UgKHRydWUgZm9yIHRoZSB0cmVhdG1lbnQgYXJtLCBmYWxzZSBmb3IgY29udHJvbCkuJyB9O1xuXHRlbnRpdGxlbWVudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB1c2VyIGVudGl0bGVtZW50IHdoZW4gdGhlIHVzZXIgd2FzIGFzc2lnbmVkIHRvIHRoZSBleHBlcmltZW50IGZsaWdodC4nIH07XG5cdGF2ZXJhZ2VEYWlseVVzYWdlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnVGhlIGF2ZXJhZ2UgZGFpbHkgbW9udGhseSBxdW90YSB1c2FnZSBwZXJjZW50YWdlIHdoZW4gdGhlIHVzZXIgd2FzIGFzc2lnbmVkIHRvIHRoZSBleHBlcmltZW50IGZsaWdodC4nIH07XG5cdHBlcmNlbnRVc2VkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnVGhlIG1vbnRobHkgcXVvdGEgcGVyY2VudGFnZSB1c2VkIHdoZW4gdGhlIHVzZXIgd2FzIGFzc2lnbmVkIHRvIHRoZSBleHBlcmltZW50IGZsaWdodC4nIH07XG59O1xuXG4vKipcbiAqIFBlcnNpc3RlZCBmbGFnIHJlbWVtYmVyaW5nIHRoYXQgdGhlIHVzZXIgZGlzbWlzc2VkIHRoZSBxdW90YS1leGNlZWRlZFxuICogbm90aWZpY2F0aW9uLiBLZXB0IHVudGlsIHF1b3RhIHJlY292ZXJzIChjcmVkaXQgYmVjb21lcyBhdmFpbGFibGUgYWdhaW4pIHNvXG4gKiB0aGUgYmFubmVyIGRvZXMgbm90IHJlLWFwcGVhciBvbiBldmVyeSB3aW5kb3cgcmVsb2FkIHdoaWxlIHF1b3RhIGlzIHN0aWxsXG4gKiBleGhhdXN0ZWQuXG4gKi9cbmNvbnN0IFFVT1RBX0VYSEFVU1RFRF9ESVNNSVNTRURfU1RPUkFHRV9LRVkgPSAnY2hhdC5xdW90YU5vdGlmaWNhdGlvbi5leGhhdXN0ZWREaXNtaXNzZWQnO1xuXG4vKipcbiAqIENvcmUtc2lkZSB3b3JrYmVuY2ggY29udHJpYnV0aW9uIHRoYXQgc2hvd3MgY2hhdCBpbnB1dCBub3RpZmljYXRpb25zIGZvclxuICogcXVvdGEgZXhoYXVzdGlvbiBhbmQgcXVvdGEtYXBwcm9hY2hpbmcgdGhyZXNob2xkcy5cbiAqXG4gKiBMaXN0ZW5zIHRvIGBJQ2hhdEVudGl0bGVtZW50U2VydmljZWAgcXVvdGEgY2hhbmdlIGV2ZW50cyBhbmQgZGV0ZXJtaW5lc1xuICogd2hldGhlciBhIG5ldyB0aHJlc2hvbGQgaGFzIGJlZW4gY3Jvc3NlZCwgdGhlbiBzaG93cyB0aGUgaGlnaGVzdC1wcmlvcml0eVxuICogbm90aWZpY2F0aW9uOlxuICpcbiAqIDEuICoqUXVvdGEgZXhoYXVzdGVkKiogXHUyMDE0IGluZm8sIGF1dG8tZGlzbWlzc2VkIG9uIG5leHQgbWVzc2FnZS5cbiAqIDIuICoqUXVvdGEgYXBwcm9hY2hpbmcqKiBcdTIwMTQgaW5mbywgYXV0by1kaXNtaXNzZWQgb24gbmV4dCBtZXNzYWdlLlxuICogMy4gKipSYXRlLWxpbWl0IHdhcm5pbmcqKiBcdTIwMTQgaW5mbywgYXV0by1kaXNtaXNzZWQgb24gbmV4dCBtZXNzYWdlLlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdFF1b3RhTm90aWZpY2F0aW9uQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5jaGF0UXVvdGFOb3RpZmljYXRpb24nO1xuXG5cdC8qKiBUcmFja3Mgd2hldGhlciB0aGUgY3VycmVudCBub3RpZmljYXRpb24gaXMgdGhlIHF1b3RhLWV4aGF1c3RlZCB2YXJpYW50LiAqL1xuXHRwcml2YXRlIF9zaG93aW5nRXhoYXVzdGVkID0gZmFsc2U7XG5cblx0LyoqXG5cdCAqIFByZXZpb3VzIHBlcmNlbnQtdXNlZCBmb3IgdGhyZXNob2xkIGNyb3NzaW5nIGRldGVjdGlvbi5cblx0ICogYHVuZGVmaW5lZGAgbWVhbnMgbm8gZGF0YSBoYXMgYmVlbiBzZWVuIHlldCBcdTIwMTQgdGhlIGZpcnN0IHZhbHVlXG5cdCAqIGVzdGFibGlzaGVzIGEgYmFzZWxpbmUgd2l0aG91dCB0cmlnZ2VyaW5nIGEgbm90aWZpY2F0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfcHJldlF1b3RhUGVyY2VudFVzZWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcHJldkFkZGl0aW9uYWxVc2FnZUVuYWJsZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3ByZXZTZXNzaW9uUGVyY2VudFVzZWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcHJldldlZWtseVBlcmNlbnRVc2VkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3N3aXRjaFRvQXV0b1RyZWF0bWVudDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc3dpdGNoVG9BdXRvQXNzaWdubWVudFJlcXVlc3RlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9hY3RpdmVRdW90YVdhcm5pbmc6IHsgcGVyY2VudFVzZWQ6IG51bWJlcjsgdGhyZXNob2xkOiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdHJhamVjdG9yeVRyZWF0bWVudDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdHJhamVjdG9yeUFzc2lnbm1lbnRSZXF1ZXN0ZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0QElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2U6IElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYXNzaWdubWVudFNlcnZpY2U6IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVF1b3RhUmVtYWluaW5nKCgpID0+IHRoaXMuX3VwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVF1b3RhRXhjZWVkZWQoKCkgPT4gdGhpcy5fdXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlRW50aXRsZW1lbnQoKCkgPT4gdGhpcy5fdXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2Uub25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscygoKSA9PiB0aGlzLl9yZWZyZXNoQWN0aXZlUXVvdGFBcHByb2FjaGluZ1dhcm5pbmcoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKFRSQUpFQ1RPUllfTlVER0VfU1BFQy5sZWFybk1vcmVDb21tYW5kSWQsIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4gdGhpcy5faGFuZGxlQ3JlZGl0RWZmaWNpZW5jeUxlYXJuTW9yZUNvbW1hbmQoYWNjZXNzb3IpKSk7XG5cblx0XHQvLyBSZS1ldmFsdWF0ZSB3aGVuIHRoZSBzZWxlY3RlZCBtb2RlbCBjaGFuZ2VzIChlLmcuIHN3aXRjaGluZyBiZXR3ZWVuIENvcGlsb3QgYW5kIEJZT0spLlxuXHRcdC8vIFRoZSBjaGF0TW9kZWxJZCBjb250ZXh0IGtleSBpcyB3aWRnZXQtc2NvcGVkIGFuZCBtYXkgbm90IGJ1YmJsZSB0byB0aGUgZ2xvYmFsXG5cdFx0Ly8gc2VydmljZSwgc28gd2UgYWxzbyBsaXN0ZW4gZm9yIHN0b3JhZ2UgY2hhbmdlcyBvbiB0aGUgcGVyc2lzdGVkIG1vZGVsIHNlbGVjdGlvbiBrZXkuXG5cdFx0Y29uc3Qgc3RvcmFnZUxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFNFTEVDVEVEX01PREVMX1NUT1JBR0VfU0NPUEUsIHVuZGVmaW5lZCwgc3RvcmFnZUxpc3RlbmVyKShlID0+IHtcblx0XHRcdGlmIChlLmtleS5zdGFydHNXaXRoKFNFTEVDVEVEX01PREVMX1NUT1JBR0VfS0VZX1BSRUZJWCkpIHtcblx0XHRcdFx0dGhpcy5fcmVmcmVzaEFjdGl2ZVF1b3RhQXBwcm9hY2hpbmdXYXJuaW5nKCk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlbWVtYmVyIHdoZW4gdGhlIHVzZXIgZGlzbWlzc2VzIHRoZSBxdW90YS1leGNlZWRlZCBub3RpZmljYXRpb24gc28gaXRcblx0XHQvLyBkb2VzIG5vdCByZS1hcHBlYXIgb24gdGhlIG5leHQgd2luZG93IHJlbG9hZCB3aGlsZSBxdW90YSBpcyBzdGlsbFxuXHRcdC8vIGV4aGF1c3RlZC4gVGhlIGZsYWcgaXMgY2xlYXJlZCBmcm9tIGBfdXBkYXRlYCBvbmNlIHF1b3RhIHJlY292ZXJzLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2Uub25EaWREaXNtaXNzKGlkID0+IHtcblx0XHRcdGlmIChpZCA9PT0gUVVPVEFfTk9USUZJQ0FUSU9OX0lEICYmIHRoaXMuX3Nob3dpbmdFeGhhdXN0ZWQpIHtcblx0XHRcdFx0dGhpcy5fc2V0RXhoYXVzdGVkRGlzbWlzc2VkKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2hlY2sgaW5pdGlhbCBzdGF0ZSBpbiBjYXNlIHF1b3RhIGlzIGFscmVhZHkgZXhoYXVzdGVkIGF0IHN0YXJ0dXBcblx0XHR0aGlzLl91cGRhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVTd2l0Y2hUb0F1dG9UcmVhdG1lbnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdHJlYXRtZW50ID0gYXdhaXQgdGhpcy5fYXNzaWdubWVudFNlcnZpY2UuZ2V0VHJlYXRtZW50PGJvb2xlYW4+KFNXSVRDSF9UT19BVVRPX1RSRUFUTUVOVF9OQU1FKTtcblx0XHR0aGlzLl9zd2l0Y2hUb0F1dG9UcmVhdG1lbnQgPSB0cmVhdG1lbnQ7XG5cdFx0aWYgKHRyZWF0bWVudCA9PT0gdHJ1ZSkge1xuXHRcdFx0dGhpcy5fcmVmcmVzaEFjdGl2ZVF1b3RhQXBwcm9hY2hpbmdXYXJuaW5nKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVxdWVzdFN3aXRjaFRvQXV0b1RyZWF0bWVudCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3N3aXRjaFRvQXV0b0Fzc2lnbm1lbnRSZXF1ZXN0ZWQpIHtcblx0XHRcdHRoaXMuX3N3aXRjaFRvQXV0b0Fzc2lnbm1lbnRSZXF1ZXN0ZWQgPSB0cnVlO1xuXHRcdFx0dm9pZCB0aGlzLl9yZXNvbHZlU3dpdGNoVG9BdXRvVHJlYXRtZW50KCkuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBGYWlsZWQgdG8gcmVzb2x2ZSAke1NXSVRDSF9UT19BVVRPX1RSRUFUTUVOVF9OQU1FfWAsIGVycm9yKTtcblx0XHRcdFx0dGhpcy5fc3dpdGNoVG9BdXRvQXNzaWdubWVudFJlcXVlc3RlZCA9IGZhbHNlO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlYWRzIHRoZSBhbHJlYWR5LWV2YWx1YXRlZCB0cmFqZWN0b3J5IGV4cGVyaW1lbnQgY29ob3J0LiBUaGUgYXNzaWdubWVudFxuXHQgKiBzZXJ2aWNlIHJlc29sdmVzIHRoZSBjb2hvcnQgYXN5bmNocm9ub3VzbHksIHNvIHRoaXMgaXMgcmVxdWVzdGVkIG9ubHkgb25jZVxuXHQgKiB0aGUgdXNlciBoYXMgbWV0IGV2ZXJ5IG5vbi1leHBlcmltZW50IGNvbmRpdGlvbiByZXF1aXJlZCBmb3IgdGhlIG51ZGdlLlxuXHQgKlxuXHQgKiBTdG9yZXMgdGhlIHJhdyB0cmVhdG1lbnQgdmFsdWUuIGB1bmRlZmluZWRgIG1lYW5zIHRoZSB1c2VyIGlzIG5vdFxuXHQgKiBhc3NpZ25lZCB0byB0aGUgZmxpZ2h0IChvciBhc3NpZ25tZW50cyBhcmUgbm90IGF2YWlsYWJsZSk7IG9ubHkgYSBgdHJ1ZWBcblx0ICogdHJlYXRtZW50IHJlbmRlcnMgdGhlIG51ZGdlLiBXZSBkZWxpYmVyYXRlbHkgZG8gbm90IGNvZXJjZSBhIG1pc3Npbmdcblx0ICogYXNzaWdubWVudCBpbnRvIGEgc3ludGhldGljIFwiY29udHJvbFwiIHZhbHVlLCBzaW5jZSB0aGF0IHdvdWxkIGFzc3VtZSBhblxuXHQgKiBlbnJvbGxtZW50IHRoYXQgbWF5IG5vdCBleGlzdC4gRW5yb2xsbWVudCB0ZWxlbWV0cnkgaXMgZW1pdHRlZCBvbmx5IHdoZW5cblx0ICogdGhlIHVzZXIgaXMgYWN0dWFsbHkgYXNzaWduZWQgdG8gYSBmbGlnaHQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlVHJhamVjdG9yeVRyZWF0bWVudCh3YXJuaW5nOiB7IGF2ZXJhZ2VEYWlseVVzYWdlOiBudW1iZXI7IHBlcmNlbnRVc2VkOiBudW1iZXIgfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRyZWF0bWVudCA9IGF3YWl0IHRoaXMuX2Fzc2lnbm1lbnRTZXJ2aWNlLmdldFRyZWF0bWVudDxib29sZWFuPihUUkFKRUNUT1JZX05VREdFX1NQRUMudHJlYXRtZW50TmFtZSk7XG5cdFx0dGhpcy5fdHJhamVjdG9yeVRyZWF0bWVudCA9IHRyZWF0bWVudDtcblx0XHRpZiAodHJlYXRtZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2xvZ1F1b3RhVHJhamVjdG9yeU51ZGdlRW5yb2xsZWQodHJlYXRtZW50LCB3YXJuaW5nKTtcblx0XHR9XG5cdFx0aWYgKHRyZWF0bWVudCA9PT0gdHJ1ZSkge1xuXHRcdFx0dGhpcy5fdXBkYXRlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVxdWVzdFRyYWplY3RvcnlUcmVhdG1lbnQod2FybmluZzogeyBhdmVyYWdlRGFpbHlVc2FnZTogbnVtYmVyOyBwZXJjZW50VXNlZDogbnVtYmVyIH0pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3RyYWplY3RvcnlBc3NpZ25tZW50UmVxdWVzdGVkKSB7XG5cdFx0XHR0aGlzLl90cmFqZWN0b3J5QXNzaWdubWVudFJlcXVlc3RlZCA9IHRydWU7XG5cdFx0XHR2b2lkIHRoaXMuX3Jlc29sdmVUcmFqZWN0b3J5VHJlYXRtZW50KHdhcm5pbmcpLmNhdGNoKGVycm9yID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgRmFpbGVkIHRvIHJlc29sdmUgJHtUUkFKRUNUT1JZX05VREdFX1NQRUMudHJlYXRtZW50TmFtZX1gLCBlcnJvcik7XG5cdFx0XHRcdHRoaXMuX3RyYWplY3RvcnlBc3NpZ25tZW50UmVxdWVzdGVkID0gZmFsc2U7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSZWxldmFudFNuYXBzaG90KCk6IElRdW90YVNuYXBzaG90IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBxdW90YXMgPSB0aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcztcblx0XHRjb25zdCBlbnRpdGxlbWVudCA9IHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQ7XG5cdFx0aWYgKGVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuVW5rbm93biB8fCBlbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkZyZWUpIHtcblx0XHRcdHJldHVybiBxdW90YXMuY2hhdCA/PyBxdW90YXMucHJlbWl1bUNoYXQ7XG5cdFx0fVxuXHRcdHJldHVybiBxdW90YXMucHJlbWl1bUNoYXQ7XG5cdH1cblxuXHRwcml2YXRlIF9pc1F1b3RhVXNlZFVwKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gdGhpcy5fZ2V0UmVsZXZhbnRTbmFwc2hvdCgpO1xuXHRcdGlmICghc25hcHNob3QpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHNuYXBzaG90LnVubGltaXRlZCkge1xuXHRcdFx0cmV0dXJuIHNuYXBzaG90Lmhhc1F1b3RhID09PSBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHNuYXBzaG90LnBlcmNlbnRSZW1haW5pbmcgPD0gMDtcblx0fVxuXG5cdHByaXZhdGUgX2lzVUJCRWxpZ2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLnVzYWdlQmFzZWRCaWxsaW5nID09PSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGVudGl0bGVtZW50ID0gdGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudDtcblx0XHRjb25zdCBpc0NvcGlsb3QgPSB0aGlzLl9pc0NvcGlsb3RNb2RlbFNlbGVjdGVkKCk7XG5cblx0XHQvLyBPbmNlIHF1b3RhIHJlY292ZXJzIChjcmVkaXQgaXMgcG9zaXRpdmVseSBhdmFpbGFibGUgYWdhaW4pIGRyb3AgYW55XG5cdFx0Ly8gcGVyc2lzdGVkIGRpc21pc3NhbCBzbyB0aGUgcXVvdGEtZXhjZWVkZWQgbm90aWZpY2F0aW9uIGNhbiBzaG93IHRoZSBuZXh0XG5cdFx0Ly8gdGltZSBxdW90YSBydW5zIG91dC4gRG9uZSBiZWZvcmUgdGhlIENvcGlsb3QvQllPSyBnYXRlIHNvIGEgcmVjb3ZlcnkgaXNcblx0XHQvLyBhbHdheXMgb2JzZXJ2ZWQsIGV2ZW4gd2hpbGUgYSBCWU9LIG1vZGVsIGlzIHNlbGVjdGVkLiBHdWFyZGVkIG9uIGFcblx0XHQvLyBwcmVzZW50IHNuYXBzaG90IHNvIHRoZSB0cmFuc2llbnQgXCJubyBxdW90YSBkYXRhIHlldFwiIHN0YXRlIGF0XG5cdFx0Ly8gc3RhcnR1cC9yZWxvYWQgZG9lcyBub3Qgd2lwZSB0aGUgZmxhZy5cblx0XHRpZiAodGhpcy5faXNRdW90YUtub3duQXZhaWxhYmxlKCkpIHtcblx0XHRcdHRoaXMuX2NsZWFyRXhoYXVzdGVkRGlzbWlzc2VkKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRGVmZXIgbmV3IG5vdGlmaWNhdGlvbnMgd2hlbiBhIEJZT0sgbW9kZWwgaXMgc2VsZWN0ZWQgb3IgdGhlIG1vZGVsXG5cdFx0Ly8gc2VsZWN0aW9uIGhhc24ndCBsb2FkZWQgeWV0IFx1MjAxNCBxdW90YSBvbmx5IGFwcGxpZXMgdG8gQ29waWxvdCBtb2RlbHMuXG5cdFx0Ly8gQWxyZWFkeS1zaG93biBub3RpZmljYXRpb25zIHN0YXkgdmlzaWJsZS5cblx0XHRpZiAoIWlzQ29waWxvdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNraXAgcXVvdGEgbm90aWZpY2F0aW9ucyBmb3IgUFJVIHVzZXJzIFx1MjAxNCBvbmx5IHNob3cgZm9yIFVCQi5cblx0XHRjb25zdCBpc1F1b3RhTm90aWZpY2F0aW9uRWxpZ2libGUgPSBlbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LlVua25vd24gfHwgdGhpcy5faXNVQkJFbGlnaWJsZSgpO1xuXG5cdFx0Ly8gUHJpb3JpdHkgMDogQnVzaW5lc3MvRW50ZXJwcmlzZSBvcmctYmxvY2tlZCBcdTIwMTQgaGFzUXVvdGEgPT09IGZhbHNlIGlzIHRoZVxuXHRcdC8vIGF1dGhvcml0YXRpdmUgc2lnbmFsIHRoYXQgdGhlIG9yZyBoYXMgZXhjZWVkZWQgaXRzIGJ1ZGdldCwgcmVnYXJkbGVzcyBvZlxuXHRcdC8vIG92ZXJhZ2VzIG9yIHJlbWFpbmluZyBxdW90YS5cblx0XHRpZiAodGhpcy5faXNNYW5hZ2VkUGxhbihlbnRpdGxlbWVudCkgJiYgdGhpcy5faXNNYW5hZ2VkUGxhbkJsb2NrZWQoKSkge1xuXHRcdFx0aWYgKCF0aGlzLl9pc0V4aGF1c3RlZERpc21pc3NlZCgpKSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dNYW5hZ2VkUGxhbkJsb2NrZWROb3RpZmljYXRpb24oKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBQcmlvcml0eSAxOiBRdW90YSBleGhhdXN0ZWQgb3IgZnVsbHkgdXNlZFxuXHRcdGlmIChpc1F1b3RhTm90aWZpY2F0aW9uRWxpZ2libGUgJiYgdGhpcy5faXNRdW90YVVzZWRVcCgpKSB7XG5cdFx0XHRjb25zdCBxdW90YXMgPSB0aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcztcblx0XHRcdGNvbnN0IGFkZGl0aW9uYWxVc2FnZUVuYWJsZWQgPSBxdW90YXMuYWRkaXRpb25hbFVzYWdlRW5hYmxlZCA/PyBmYWxzZTtcblx0XHRcdGNvbnN0IHdhc0FkZGl0aW9uYWxVc2FnZUVuYWJsZWQgPSB0aGlzLl9wcmV2QWRkaXRpb25hbFVzYWdlRW5hYmxlZDtcblx0XHRcdHRoaXMuX3ByZXZBZGRpdGlvbmFsVXNhZ2VFbmFibGVkID0gYWRkaXRpb25hbFVzYWdlRW5hYmxlZDtcblxuXHRcdFx0aWYgKCF0aGlzLl9pc0V4aGF1c3RlZERpc21pc3NlZCgpKSB7XG5cdFx0XHRcdGlmIChhZGRpdGlvbmFsVXNhZ2VFbmFibGVkKSB7XG5cdFx0XHRcdFx0Ly8gU2hvdyBvdmVyYWdlIG5vdGlmaWNhdGlvbiBvbiBhIGxpdmUgdHJhbnNpdGlvbiB0byAxMDAlLFxuXHRcdFx0XHRcdC8vIG9yIHdoZW4gb3ZlcmFnZXMgYXJlIGVuYWJsZWQgd2hpbGUgYWxyZWFkeSBhdCAxMDAlLlxuXHRcdFx0XHRcdGlmICh0aGlzLl9wcmV2UXVvdGFQZXJjZW50VXNlZCAhPT0gdW5kZWZpbmVkIHx8IHdhc0FkZGl0aW9uYWxVc2FnZUVuYWJsZWQgPT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zaG93T3ZlcmFnZUFjdGl2YXRpb25Ob3RpZmljYXRpb24oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fc2hvd0V4aGF1c3RlZE5vdGlmaWNhdGlvbigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEtlZXAgdGhlIGJhc2VsaW5lIHVwLXRvLWRhdGUgc28gdGhhdCByZWNvdmVyeSBmcm9tIGV4aGF1c3Rpb25cblx0XHRcdC8vIGRvZXMgbm90IHRyaWdnZXIgYSBzcHVyaW91cyB0aHJlc2hvbGQgbm90aWZpY2F0aW9uLlxuXHRcdFx0Y29uc3QgZXhoYXVzdGVkU25hcHNob3QgPSB0aGlzLl9nZXRSZWxldmFudFNuYXBzaG90KCk7XG5cdFx0XHRpZiAoZXhoYXVzdGVkU25hcHNob3QgJiYgIWV4aGF1c3RlZFNuYXBzaG90LnVubGltaXRlZCkge1xuXHRcdFx0XHR0aGlzLl9wcmV2UXVvdGFQZXJjZW50VXNlZCA9IDEwMCAtIGV4aGF1c3RlZFNuYXBzaG90LnBlcmNlbnRSZW1haW5pbmc7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBQcmlvcml0eSAyOiBRdW90YSBhcHByb2FjaGluZyB0aHJlc2hvbGRcblx0XHRpZiAoaXNRdW90YU5vdGlmaWNhdGlvbkVsaWdpYmxlKSB7XG5cdFx0XHRjb25zdCB0cmFqZWN0b3J5V2FybmluZyA9IHRoaXMuX2NvbXB1dGVRdW90YVRyYWplY3RvcnlXYXJuaW5nKCk7XG5cdFx0XHRpZiAodHJhamVjdG9yeVdhcm5pbmcpIHtcblx0XHRcdFx0dGhpcy5fc2hvd1F1b3RhVHJhamVjdG9yeVdhcm5pbmcodHJhamVjdG9yeVdhcm5pbmcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHF1b3RhV2FybmluZyA9IHRoaXMuX2NvbXB1dGVRdW90YVdhcm5pbmcoKTtcblx0XHRcdGlmIChxdW90YVdhcm5pbmcpIHtcblx0XHRcdFx0dGhpcy5fc2hvd1F1b3RhQXBwcm9hY2hpbmdXYXJuaW5nKHF1b3RhV2FybmluZyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBQcmlvcml0eSAzOiBSYXRlLWxpbWl0IHdhcm5pbmcgKHNlc3Npb24gPiB3ZWVrbHkpXG5cdFx0Y29uc3QgcmF0ZUxpbWl0V2FybmluZyA9IHRoaXMuX2NvbXB1dGVSYXRlTGltaXRXYXJuaW5nKCk7XG5cdFx0aWYgKHJhdGVMaW1pdFdhcm5pbmcpIHtcblx0XHRcdHRoaXMuX3Nob3dSYXRlTGltaXRXYXJuaW5nKHJhdGVMaW1pdFdhcm5pbmcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE5vdGhpbmcgbmV3IHRvIHNob3cgXHUyMDE0IG9ubHkgaGlkZSBpZiB0aGUgZXhoYXVzdGVkIG5vdGlmaWNhdGlvbiBpc1xuXHRcdC8vIGFjdGl2ZSBhbmQgdGhlIHF1b3RhIGlzIG5vIGxvbmdlciBleGhhdXN0ZWQgKHN0YXRlLWRyaXZlbikuXG5cdFx0aWYgKHRoaXMuX3Nob3dpbmdFeGhhdXN0ZWQgJiYgIXRoaXMuX2lzUXVvdGFVc2VkVXAoKSkge1xuXHRcdFx0dGhpcy5faGlkZU5vdGlmaWNhdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBUaHJlc2hvbGQgY3Jvc3NpbmcgZGV0ZWN0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9jb21wdXRlUXVvdGFXYXJuaW5nKCk6IHsgcGVyY2VudFVzZWQ6IG51bWJlcjsgdGhyZXNob2xkOiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSB0aGlzLl9nZXRSZWxldmFudFNuYXBzaG90KCk7XG5cdFx0aWYgKCFzbmFwc2hvdCB8fCBzbmFwc2hvdC51bmxpbWl0ZWQpIHtcblx0XHRcdHRoaXMuX3ByZXZRdW90YVBlcmNlbnRVc2VkID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcGVyY2VudFVzZWQgPSAxMDAgLSBzbmFwc2hvdC5wZXJjZW50UmVtYWluaW5nO1xuXHRcdGNvbnN0IGNyb3NzZWQgPSB0aGlzLl9maW5kQ3Jvc3NlZFRocmVzaG9sZChwZXJjZW50VXNlZCwgdGhpcy5fcHJldlF1b3RhUGVyY2VudFVzZWQpO1xuXHRcdHRoaXMuX3ByZXZRdW90YVBlcmNlbnRVc2VkID0gcGVyY2VudFVzZWQ7XG5cdFx0aWYgKGNyb3NzZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHsgcGVyY2VudFVzZWQ6IE1hdGguZmxvb3IocGVyY2VudFVzZWQpLCB0aHJlc2hvbGQ6IGNyb3NzZWQgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVRdW90YVRyYWplY3RvcnlXYXJuaW5nKCk6IHsgYXZlcmFnZURhaWx5VXNhZ2U6IG51bWJlcjsgcGVyY2VudFVzZWQ6IG51bWJlciB9IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5faXNUcmFqZWN0b3J5U2hvd25JbkN1cnJlbnRQZXJpb2QoKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBzbmFwc2hvdCA9IHRoaXMuX2dldFJlbGV2YW50U25hcHNob3QoKTtcblx0XHRpZiAoIXNuYXBzaG90IHx8IHNuYXBzaG90LnVubGltaXRlZCB8fCBzbmFwc2hvdC5wZXJjZW50UmVtYWluaW5nIDw9IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzZXREYXRlID0gdGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMucmVzZXREYXRlO1xuXHRcdGlmICghcmVzZXREYXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc2V0ID0gbmV3IERhdGUocmVzZXREYXRlKTtcblx0XHRjb25zdCByZXNldFRpbWUgPSByZXNldC5nZXRUaW1lKCk7XG5cdFx0aWYgKCFOdW1iZXIuaXNGaW5pdGUocmVzZXRUaW1lKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBwZXJpb2RTdGFydCA9IG5ldyBEYXRlKHJlc2V0VGltZSk7XG5cdFx0cGVyaW9kU3RhcnQuc2V0VVRDTW9udGgocGVyaW9kU3RhcnQuZ2V0VVRDTW9udGgoKSAtIDEpO1xuXHRcdGNvbnN0IHBlcmlvZFN0YXJ0VGltZSA9IHBlcmlvZFN0YXJ0LmdldFRpbWUoKTtcblx0XHRjb25zdCBlbGFwc2VkRGF5cyA9IChEYXRlLm5vdygpIC0gcGVyaW9kU3RhcnRUaW1lKSAvIFRSQUpFQ1RPUllfTlVER0VfU1BFQy5tc1BlckRheTtcblx0XHRpZiAoZWxhcHNlZERheXMgPCAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBlcmNlbnRVc2VkID0gMTAwIC0gc25hcHNob3QucGVyY2VudFJlbWFpbmluZztcblx0XHRpZiAocGVyY2VudFVzZWQgPCBUUkFKRUNUT1JZX05VREdFX1NQRUMubWluaW11bVBlcmNlbnRVc2VkIHx8IHBlcmNlbnRVc2VkID4gVFJBSkVDVE9SWV9OVURHRV9TUEVDLm1heGltdW1QZXJjZW50VXNlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBhdmVyYWdlRGFpbHlVc2FnZSA9IHBlcmNlbnRVc2VkIC8gTWF0aC5tYXgoMSwgZWxhcHNlZERheXMpO1xuXHRcdGlmIChhdmVyYWdlRGFpbHlVc2FnZSA8IFRSQUpFQ1RPUllfTlVER0VfU1BFQy5hdmVyYWdlRGFpbHlVc2FnZVRocmVzaG9sZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLl9yZXF1ZXN0VHJhamVjdG9yeVRyZWF0bWVudCh7IGF2ZXJhZ2VEYWlseVVzYWdlLCBwZXJjZW50VXNlZCB9KTtcblx0XHRyZXR1cm4gdGhpcy5fdHJhamVjdG9yeVRyZWF0bWVudCA9PT0gdHJ1ZSA/IHsgYXZlcmFnZURhaWx5VXNhZ2UsIHBlcmNlbnRVc2VkIH0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93UXVvdGFUcmFqZWN0b3J5V2FybmluZyh3YXJuaW5nOiB7IGF2ZXJhZ2VEYWlseVVzYWdlOiBudW1iZXI7IHBlcmNlbnRVc2VkOiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdHRoaXMuX3Nob3dpbmdFeGhhdXN0ZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9zdG9yZVRyYWplY3RvcnlTaG93bigpO1xuXHRcdGNvbnN0IGxlYXJuTW9yZUxpbmsgPSBjcmVhdGVNYXJrZG93bkNvbW1hbmRMaW5rKHtcblx0XHRcdHRleHQ6IGxvY2FsaXplKCdxdW90YS50cmFqZWN0b3J5LmxlYXJuTW9yZVN0YW5kYWxvbmUnLCBcIkxlYXJuIGFib3V0IG9wdGltaXppbmcgdXNhZ2VcIiksXG5cdFx0XHRpZDogVFJBSkVDVE9SWV9OVURHRV9TUEVDLmxlYXJuTW9yZUNvbW1hbmRJZCxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdxdW90YS50cmFqZWN0b3J5LmxlYXJuTW9yZVRvb2x0aXAnLCBcIkxlYXJuIGFib3V0IG9wdGltaXppbmcgdXNhZ2VcIiksXG5cdFx0fSk7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IGxvY2FsaXplKHsga2V5OiAncXVvdGEudHJhamVjdG9yeS5tZXNzYWdlJywgY29tbWVudDogWyd7TG9ja2VkPVwiW1wifScsICd7TG9ja2VkPVwiXSh7MH0pXCJ9J10gfSwgXCJZb3UncmUgbGlrZWx5IHRvIGV4aGF1c3QgeW91ciBBSSBjcmVkaXRzIGJlZm9yZSB5b3VyIGJpbGxpbmcgcGVyaW9kLiB7MH0uXCIsIGxlYXJuTW9yZUxpbmspO1xuXG5cdFx0dGhpcy5fc2V0Tm90aWZpY2F0aW9uKHtcblx0XHRcdGlkOiBRVU9UQV9OT1RJRklDQVRJT05fSUQsXG5cdFx0XHR0ZWxlbWV0cnlJZDogJ3F1b3RhVHJhamVjdG9yeU51ZGdlJyxcblx0XHRcdHNldmVyaXR5OiBDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKG1lc3NhZ2UsIHsgaXNUcnVzdGVkOiB7IGVuYWJsZWRDb21tYW5kczogW1RSQUpFQ1RPUllfTlVER0VfU1BFQy5sZWFybk1vcmVDb21tYW5kSWRdIH0gfSksXG5cdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0YWN0aW9uczogW10sXG5cdFx0XHRkaXNtaXNzaWJsZTogdHJ1ZSxcblx0XHRcdGF1dG9EaXNtaXNzT25NZXNzYWdlOiBmYWxzZSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUNyZWRpdEVmZmljaWVuY3lMZWFybk1vcmVDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHt9LCBDaGF0UXVvdGFUcmFqZWN0b3J5TnVkZ2VMaW5rQ2xpY2tlZENsYXNzaWZpY2F0aW9uPignY2hhdFF1b3RhVHJhamVjdG9yeU51ZGdlTGlua0NsaWNrZWQnKTtcblx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB0aGlzLl9oaWRlTm90aWZpY2F0aW9uKCkpO1xuXHRcdGF3YWl0IGFjY2Vzc29yLmdldChJT3BlbmVyU2VydmljZSkub3BlbihVUkkucGFyc2UoVFJBSkVDVE9SWV9OVURHRV9TUEVDLmxlYXJuTW9yZVVybCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbG9nUXVvdGFUcmFqZWN0b3J5TnVkZ2VFbnJvbGxlZCh0cmVhdG1lbnQ6IGJvb2xlYW4sIHdhcm5pbmc6IHsgYXZlcmFnZURhaWx5VXNhZ2U6IG51bWJlcjsgcGVyY2VudFVzZWQ6IG51bWJlciB9KTogdm9pZCB7XG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRRdW90YVRyYWplY3RvcnlOdWRnZUVucm9sbG1lbnRFdmVudCwgQ2hhdFF1b3RhVHJhamVjdG9yeU51ZGdlRW5yb2xsbWVudENsYXNzaWZpY2F0aW9uPignY2hhdFF1b3RhVHJhamVjdG9yeU51ZGdlRW5yb2xsZWQnLCB7XG5cdFx0XHR0cmVhdG1lbnQsXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50W3RoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnRdLFxuXHRcdFx0YXZlcmFnZURhaWx5VXNhZ2U6IE1hdGgucm91bmQod2FybmluZy5hdmVyYWdlRGFpbHlVc2FnZSAqIDEwMCkgLyAxMDAsXG5cdFx0XHRwZXJjZW50VXNlZDogTWF0aC5yb3VuZCh3YXJuaW5nLnBlcmNlbnRVc2VkICogMTAwKSAvIDEwMCxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBoaWdoZXN0IHRocmVzaG9sZCB0aGF0IHdhcyBuZXdseSBjcm9zc2VkLCBvciBgdW5kZWZpbmVkYC5cblx0ICovXG5cdHByaXZhdGUgX2ZpbmRDcm9zc2VkVGhyZXNob2xkKGN1cnJlbnQ6IG51bWJlciwgcHJldmlvdXM6IG51bWJlciB8IHVuZGVmaW5lZCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHByZXZpb3VzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSBUSFJFU0hPTERTLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCB0aHJlc2hvbGQgPSBUSFJFU0hPTERTW2ldO1xuXHRcdFx0aWYgKHByZXZpb3VzIDwgdGhyZXNob2xkICYmIGN1cnJlbnQgPj0gdGhyZXNob2xkKSB7XG5cdFx0XHRcdHJldHVybiB0aHJlc2hvbGQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyAtLS0gUXVvdGEgZXhoYXVzdGVkIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX3Nob3dFeGhhdXN0ZWROb3RpZmljYXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fc2hvd2luZ0V4aGF1c3RlZCA9IHRydWU7XG5cblx0XHRjb25zdCBlbnRpdGxlbWVudCA9IHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQ7XG5cdFx0Y29uc3QgcXVvdGFzID0gdGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXM7XG5cdFx0Y29uc3QgaGFkT3ZlcmFnZSA9IChxdW90YXMuYWRkaXRpb25hbFVzYWdlQ291bnQgPz8gMCkgPiAwO1xuXG5cdFx0bGV0IGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdFx0bGV0IGFjdGlvbnM6IElDaGF0SW5wdXROb3RpZmljYXRpb25bJ2FjdGlvbnMnXTtcblxuXHRcdGlmIChlbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LlVua25vd24pIHtcblx0XHRcdGRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ3F1b3RhLmV4aGF1c3RlZC5hbm9ueW1vdXMnLCBcIlNpZ24gaW4gdG8ga2VlcCBnb2luZy5cIik7XG5cdFx0XHRhY3Rpb25zID0gW3sga2luZDogQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZC5Db21tYW5kLCBsYWJlbDogbG9jYWxpemUoJ3NpZ25JbicsIFwiU2lnbiBJblwiKSwgY29tbWFuZElkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRyaWdnZXJTZXR1cCcgfV07XG5cdFx0fSBlbHNlIGlmIChlbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkZyZWUpIHtcblx0XHRcdGRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ3F1b3RhLmV4aGF1c3RlZC5mcmVlJywgXCJVcGdyYWRlIHRvIGtlZXAgZ29pbmcuXCIpO1xuXHRcdFx0YWN0aW9ucyA9IFt7IGtpbmQ6IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuQ29tbWFuZCwgbGFiZWw6IGxvY2FsaXplKCd1cGdyYWRlJywgXCJVcGdyYWRlXCIpLCBjb21tYW5kSWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQudXBncmFkZVBsYW4nIH1dO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5faXNNYW5hZ2VkUGxhbihlbnRpdGxlbWVudCkpIHtcblx0XHRcdGRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ3F1b3RhLmV4aGF1c3RlZC5tYW5hZ2VkJywgXCJDb250YWN0IHlvdXIgYWRtaW4gdG8gaW5jcmVhc2UgeW91ciBsaW1pdHMuXCIpO1xuXHRcdFx0YWN0aW9ucyA9IFtdO1xuXHRcdH0gZWxzZSBpZiAoaGFkT3ZlcmFnZSkge1xuXHRcdFx0ZGVzY3JpcHRpb24gPSBsb2NhbGl6ZSgncXVvdGEuZXhoYXVzdGVkLmhhZE92ZXJhZ2UnLCBcIkluY3JlYXNlIHlvdXIgYnVkZ2V0IHRvIGtlZXAgYnVpbGRpbmcuXCIpO1xuXHRcdFx0YWN0aW9ucyA9IFt7IGtpbmQ6IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuQ29tbWFuZCwgbGFiZWw6IGxvY2FsaXplKCdtYW5hZ2VCdWRnZXQnLCBcIk1hbmFnZSBCdWRnZXRcIiksIGNvbW1hbmRJZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5tYW5hZ2VBZGRpdGlvbmFsU3BlbmQnIH1dO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdxdW90YS5leGhhdXN0ZWQuZGVmYXVsdCcsIFwiTWFuYWdlIHlvdXIgYnVkZ2V0IHRvIGtlZXAgYnVpbGRpbmcuXCIpO1xuXHRcdFx0YWN0aW9ucyA9IFt7IGtpbmQ6IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuQ29tbWFuZCwgbGFiZWw6IGxvY2FsaXplKCdtYW5hZ2VCdWRnZXQyJywgXCJNYW5hZ2UgQnVkZ2V0XCIpLCBjb21tYW5kSWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQubWFuYWdlQWRkaXRpb25hbFNwZW5kJyB9XTtcblx0XHR9XG5cblx0XHR0aGlzLl9zZXROb3RpZmljYXRpb24oe1xuXHRcdFx0aWQ6IFFVT1RBX05PVElGSUNBVElPTl9JRCxcblx0XHRcdHRlbGVtZXRyeUlkOiAncXVvdGFFeGhhdXN0ZWQnLFxuXHRcdFx0c2V2ZXJpdHk6IENoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgncXVvdGEuZXhoYXVzdGVkLnRpdGxlJywgXCJDcmVkaXQgTGltaXQgUmVhY2hlZFwiKSxcblx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0YWN0aW9ucyxcblx0XHRcdGRpc21pc3NpYmxlOiB0cnVlLFxuXHRcdFx0YXV0b0Rpc21pc3NPbk1lc3NhZ2U6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHQvLyAtLS0gT3ZlcmFnZSBub3RpZmljYXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9zaG93T3ZlcmFnZUFjdGl2YXRpb25Ob3RpZmljYXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fc2hvd2luZ0V4aGF1c3RlZCA9IHRydWU7XG5cblx0XHR0aGlzLl9zZXROb3RpZmljYXRpb24oe1xuXHRcdFx0aWQ6IFFVT1RBX05PVElGSUNBVElPTl9JRCxcblx0XHRcdHRlbGVtZXRyeUlkOiAnb3ZlcmFnZUFjdGl2YXRpb24nLFxuXHRcdFx0c2V2ZXJpdHk6IENoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgncXVvdGEub3ZlcmFnZS50aXRsZScsIFwiQ3JlZGl0IExpbWl0IFJlYWNoZWRcIiksXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3F1b3RhLm92ZXJhZ2UuZGVzYycsIFwiQWRkaXRpb25hbCBidWRnZXQgaXMgbm93IGNvdmVyaW5nIGV4dHJhIHVzYWdlLlwiKSxcblx0XHRcdGFjdGlvbnM6IFtdLFxuXHRcdFx0ZGlzbWlzc2libGU6IHRydWUsXG5cdFx0XHRhdXRvRGlzbWlzc09uTWVzc2FnZTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdC8vIC0tLSBRdW90YSBhcHByb2FjaGluZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX3Nob3dRdW90YUFwcHJvYWNoaW5nV2FybmluZyh3YXJuaW5nOiB7IHBlcmNlbnRVc2VkOiBudW1iZXI7IHRocmVzaG9sZDogbnVtYmVyIH0pOiB2b2lkIHtcblx0XHR0aGlzLl9zaG93aW5nRXhoYXVzdGVkID0gZmFsc2U7XG5cdFx0dGhpcy5fYWN0aXZlUXVvdGFXYXJuaW5nID0gd2FybmluZztcblxuXHRcdGNvbnN0IGVudGl0bGVtZW50ID0gdGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudDtcblx0XHRjb25zdCBxdW90YXMgPSB0aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3RhcztcblxuXHRcdGxldCBkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRcdGxldCBhY3Rpb25zOiBJQ2hhdElucHV0Tm90aWZpY2F0aW9uWydhY3Rpb25zJ107XG5cblx0XHRpZiAoZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5Vbmtub3duIHx8IGVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRnJlZSkge1xuXHRcdFx0ZGVzY3JpcHRpb24gPSBsb2NhbGl6ZSgncXVvdGEuYXBwcm9hY2hpbmcuZnJlZScsIFwiVXBncmFkZSB0byBjb250aW51ZSBwYXN0IHRoZSBsaW1pdC5cIik7XG5cdFx0XHRhY3Rpb25zID0gW3sga2luZDogQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZC5Db21tYW5kLCBsYWJlbDogbG9jYWxpemUoJ3VwZ3JhZGUyJywgXCJVcGdyYWRlXCIpLCBjb21tYW5kSWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQudXBncmFkZVBsYW4nIH1dO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5faXNNYW5hZ2VkUGxhbihlbnRpdGxlbWVudCkpIHtcblx0XHRcdGRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ3F1b3RhLmFwcHJvYWNoaW5nLm1hbmFnZWQnLCBcIkNvbnRhY3QgeW91ciBhZG1pbiB0byBpbmNyZWFzZSB5b3VyIGxpbWl0cy5cIik7XG5cdFx0XHRhY3Rpb25zID0gW107XG5cdFx0fSBlbHNlIGlmIChxdW90YXMuYWRkaXRpb25hbFVzYWdlRW5hYmxlZCkge1xuXHRcdFx0ZGVzY3JpcHRpb24gPSBsb2NhbGl6ZSgncXVvdGEuYXBwcm9hY2hpbmcub3ZlcmFnZUVuYWJsZWQnLCBcIkFkZGl0aW9uYWwgYnVkZ2V0IGlzIGVuYWJsZWQgdG8gY292ZXIgZXh0cmEgdXNhZ2UuXCIpO1xuXHRcdFx0YWN0aW9ucyA9IFtdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBhdXRvTW9kZWxJZGVudGlmaWVyID0gdGhpcy5fZ2V0QXV0b01vZGVsSWRlbnRpZmllcigpO1xuXHRcdFx0Y29uc3QgY2FuU3dpdGNoVG9BdXRvID0gISFhdXRvTW9kZWxJZGVudGlmaWVyICYmICF0aGlzLl9pc0F1dG9Nb2RlbFNlbGVjdGVkKGF1dG9Nb2RlbElkZW50aWZpZXIpO1xuXHRcdFx0aWYgKGNhblN3aXRjaFRvQXV0bykge1xuXHRcdFx0XHR0aGlzLl9yZXF1ZXN0U3dpdGNoVG9BdXRvVHJlYXRtZW50KCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fc3dpdGNoVG9BdXRvVHJlYXRtZW50ID09PSB0cnVlICYmIGNhblN3aXRjaFRvQXV0bykge1xuXHRcdFx0XHRkZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdxdW90YS5hcHByb2FjaGluZy5zd2l0Y2hUb0F1dG8nLCBcIlN3aXRjaCB0byBBdXRvIHRvIHJlZHVjZSBjcmVkaXQgdXNhZ2UuXCIpO1xuXHRcdFx0XHRhY3Rpb25zID0gW3sga2luZDogQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZC5Td2l0Y2hUb01vZGVsLCBsYWJlbDogbG9jYWxpemUoJ3N3aXRjaFRvQXV0bycsIFwiU3dpdGNoIHRvIEF1dG9cIiksIG1vZGVsSWRlbnRpZmllcjogYXV0b01vZGVsSWRlbnRpZmllciB9XTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ3F1b3RhLmFwcHJvYWNoaW5nLmRlZmF1bHQnLCBcIlNldCBhZGRpdGlvbmFsIGJ1ZGdldCB0byBjb3ZlciBleHRyYSB1c2FnZS5cIik7XG5cdFx0XHRcdGFjdGlvbnMgPSBbeyBraW5kOiBDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25LaW5kLkNvbW1hbmQsIGxhYmVsOiBsb2NhbGl6ZSgnbWFuYWdlQnVkZ2V0MycsIFwiTWFuYWdlIEJ1ZGdldFwiKSwgY29tbWFuZElkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm1hbmFnZUFkZGl0aW9uYWxTcGVuZCcgfV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2V0Tm90aWZpY2F0aW9uKHtcblx0XHRcdGlkOiBRVU9UQV9OT1RJRklDQVRJT05fSUQsXG5cdFx0XHR0ZWxlbWV0cnlJZDogYHF1b3RhQXBwcm9hY2hpbmcke3dhcm5pbmcudGhyZXNob2xkfWAsXG5cdFx0XHRzZXZlcml0eTogQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdxdW90YS5hcHByb2FjaGluZy50aXRsZScsIFwiQ3JlZGl0cyBhdCB7MH0lXCIsIHdhcm5pbmcucGVyY2VudFVzZWQpLFxuXHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRhY3Rpb25zLFxuXHRcdFx0ZGlzbWlzc2libGU6IHRydWUsXG5cdFx0XHRhdXRvRGlzbWlzc09uTWVzc2FnZTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdC8vIC0tLSBSYXRlLWxpbWl0IHdhcm5pbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX2NvbXB1dGVSYXRlTGltaXRXYXJuaW5nKCk6IHsgcGVyY2VudFVzZWQ6IG51bWJlcjsgdHlwZTogJ3Nlc3Npb24nIHwgJ3dlZWtseSc7IHJlc2V0RGF0ZTogc3RyaW5nIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHF1b3RhcyA9IHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblJlc3VsdCA9IHRoaXMuX2NoZWNrUmF0ZUxpbWl0Q3Jvc3NpbmcocXVvdGFzLnNlc3Npb25SYXRlTGltaXQsIHRoaXMuX3ByZXZTZXNzaW9uUGVyY2VudFVzZWQpO1xuXHRcdHRoaXMuX3ByZXZTZXNzaW9uUGVyY2VudFVzZWQgPSBzZXNzaW9uUmVzdWx0Lm5ld1ByZXY7XG5cblx0XHRjb25zdCB3ZWVrbHlSZXN1bHQgPSB0aGlzLl9jaGVja1JhdGVMaW1pdENyb3NzaW5nKHF1b3Rhcy53ZWVrbHlSYXRlTGltaXQsIHRoaXMuX3ByZXZXZWVrbHlQZXJjZW50VXNlZCk7XG5cdFx0dGhpcy5fcHJldldlZWtseVBlcmNlbnRVc2VkID0gd2Vla2x5UmVzdWx0Lm5ld1ByZXY7XG5cblx0XHRpZiAoc2Vzc2lvblJlc3VsdC53YXJuaW5nKSB7XG5cdFx0XHRyZXR1cm4geyAuLi5zZXNzaW9uUmVzdWx0Lndhcm5pbmcsIHR5cGU6ICdzZXNzaW9uJyB9O1xuXHRcdH1cblx0XHRpZiAod2Vla2x5UmVzdWx0Lndhcm5pbmcpIHtcblx0XHRcdHJldHVybiB7IC4uLndlZWtseVJlc3VsdC53YXJuaW5nLCB0eXBlOiAnd2Vla2x5JyB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2hlY2tSYXRlTGltaXRDcm9zc2luZyhcblx0XHRzbmFwc2hvdDogSVJhdGVMaW1pdFNuYXBzaG90IHwgdW5kZWZpbmVkLFxuXHRcdHByZXZQZXJjZW50VXNlZDogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHQpOiB7IG5ld1ByZXY6IG51bWJlciB8IHVuZGVmaW5lZDsgd2FybmluZz86IHsgcGVyY2VudFVzZWQ6IG51bWJlcjsgcmVzZXREYXRlOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB9IHtcblx0XHRpZiAoIXNuYXBzaG90IHx8IHNuYXBzaG90LnVubGltaXRlZCkge1xuXHRcdFx0cmV0dXJuIHsgbmV3UHJldjogdW5kZWZpbmVkIH07XG5cdFx0fVxuXHRcdGNvbnN0IHBlcmNlbnRVc2VkID0gMTAwIC0gc25hcHNob3QucGVyY2VudFJlbWFpbmluZztcblx0XHRjb25zdCBjcm9zc2VkID0gdGhpcy5fZmluZENyb3NzZWRUaHJlc2hvbGQocGVyY2VudFVzZWQsIHByZXZQZXJjZW50VXNlZCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5ld1ByZXY6IHBlcmNlbnRVc2VkLFxuXHRcdFx0d2FybmluZzogY3Jvc3NlZCAhPT0gdW5kZWZpbmVkXG5cdFx0XHRcdD8geyBwZXJjZW50VXNlZDogTWF0aC5mbG9vcihwZXJjZW50VXNlZCksIHJlc2V0RGF0ZTogc25hcHNob3QucmVzZXREYXRlIH1cblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dSYXRlTGltaXRXYXJuaW5nKHdhcm5pbmc6IHsgcGVyY2VudFVzZWQ6IG51bWJlcjsgdHlwZTogJ3Nlc3Npb24nIHwgJ3dlZWtseSc7IHJlc2V0RGF0ZTogc3RyaW5nIHwgdW5kZWZpbmVkIH0pOiB2b2lkIHtcblx0XHR0aGlzLl9zaG93aW5nRXhoYXVzdGVkID0gZmFsc2U7XG5cblx0XHRjb25zdCBtZXNzYWdlID0gd2FybmluZy50eXBlID09PSAnc2Vzc2lvbidcblx0XHRcdD8gbG9jYWxpemUoJ3JhdGVMaW1pdC5zZXNzaW9uJywgXCJZb3UndmUgdXNlZCB7MH0lIG9mIHlvdXIgc2Vzc2lvbiByYXRlIGxpbWl0LlwiLCB3YXJuaW5nLnBlcmNlbnRVc2VkKVxuXHRcdFx0OiBsb2NhbGl6ZSgncmF0ZUxpbWl0LndlZWtseScsIFwiWW91J3ZlIHVzZWQgezB9JSBvZiB5b3VyIHdlZWtseSByYXRlIGxpbWl0LlwiLCB3YXJuaW5nLnBlcmNlbnRVc2VkKTtcblxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gd2FybmluZy5yZXNldERhdGVcblx0XHRcdD8gbG9jYWxpemUoJ3JhdGVMaW1pdC5yZXNldHMnLCBcIlJlc2V0cyBvbiB7MH0uXCIsIHRoaXMuX2Zvcm1hdFJlc2V0RGF0ZSh3YXJuaW5nLnJlc2V0RGF0ZSkpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuX3NldE5vdGlmaWNhdGlvbih7XG5cdFx0XHRpZDogUVVPVEFfTk9USUZJQ0FUSU9OX0lELFxuXHRcdFx0dGVsZW1ldHJ5SWQ6IHdhcm5pbmcudHlwZSA9PT0gJ3Nlc3Npb24nID8gJ3Nlc3Npb25SYXRlTGltaXRXYXJuaW5nJyA6ICd3ZWVrbHlSYXRlTGltaXRXYXJuaW5nJyxcblx0XHRcdHNldmVyaXR5OiBDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0YWN0aW9uczogW10sXG5cdFx0XHRkaXNtaXNzaWJsZTogdHJ1ZSxcblx0XHRcdGF1dG9EaXNtaXNzT25NZXNzYWdlOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gLS0tIEhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIFJldHVybnMgYHRydWVgIG9ubHkgd2hlbiBhIENvcGlsb3QgbW9kZWwgaXMgYWN0aXZlbHkgc2VsZWN0ZWQuXG5cdCAqIFJldHVybnMgYGZhbHNlYCBpZiBubyBtb2RlbCBpcyBzZWxlY3RlZCB5ZXQgKHdpZGdldCBub3QgaW5pdGlhbGl6ZWQpXG5cdCAqIG9yIGlmIHRoZSBzZWxlY3RlZCBtb2RlbCBpcyBmcm9tIGEgbm9uLUNvcGlsb3QgdmVuZG9yIChCWU9LKS5cblx0ICovXG5cdHByaXZhdGUgX2lzQ29waWxvdE1vZGVsU2VsZWN0ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzU2VsZWN0ZWRNb2RlbENvcGlsb3QodGhpcy5fY29udGV4dEtleVNlcnZpY2UsIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLCB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QXV0b01vZGVsSWRlbnRpZmllcigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgaWRlbnRpZmllciBvZiB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbElkcygpKSB7XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKGlkZW50aWZpZXIpO1xuXHRcdFx0aWYgKG1ldGFkYXRhICYmIGlzQXV0b0xhbmd1YWdlTW9kZWwoeyBpZGVudGlmaWVyLCBtZXRhZGF0YSB9KSkge1xuXHRcdFx0XHRyZXR1cm4gaWRlbnRpZmllcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2lzQXV0b01vZGVsU2VsZWN0ZWQoYXV0b01vZGVsSWRlbnRpZmllcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaWRlbnRpZmllciA9IGdldFNlbGVjdGVkTW9kZWxJZGVudGlmaWVyKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLl9zdG9yYWdlU2VydmljZSk7XG5cdFx0Y29uc3QgYXV0b01vZGVsID0gdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwoYXV0b01vZGVsSWRlbnRpZmllcik7XG5cdFx0aWYgKGlkZW50aWZpZXIgPT09IGF1dG9Nb2RlbElkZW50aWZpZXIgfHwgaWRlbnRpZmllciA9PT0gYXV0b01vZGVsPy5pZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IG1ldGFkYXRhID0gZ2V0U2VsZWN0ZWRNb2RlbE1ldGFkYXRhKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLl9zdG9yYWdlU2VydmljZSwgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKTtcblx0XHRyZXR1cm4gISFtZXRhZGF0YSAmJiBpc0F1dG9MYW5ndWFnZU1vZGVsKHsgaWRlbnRpZmllcjogaWRlbnRpZmllciA/PyAnJywgbWV0YWRhdGEgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoQWN0aXZlUXVvdGFBcHByb2FjaGluZ1dhcm5pbmcoKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2FybmluZyA9IHRoaXMuX2FjdGl2ZVF1b3RhV2FybmluZztcblx0XHRpZiAoIXdhcm5pbmcgfHwgIXRoaXMuX2lzQ29waWxvdE1vZGVsU2VsZWN0ZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBub3RpZmljYXRpb24gPSB0aGlzLl9jaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLmdldEFjdGl2ZU5vdGlmaWNhdGlvbihjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmlkID09PSBRVU9UQV9OT1RJRklDQVRJT05fSUQpO1xuXHRcdGlmIChub3RpZmljYXRpb24/LnRlbGVtZXRyeUlkID09PSBgcXVvdGFBcHByb2FjaGluZyR7d2FybmluZy50aHJlc2hvbGR9YCkge1xuXHRcdFx0dGhpcy5fc2hvd1F1b3RhQXBwcm9hY2hpbmdXYXJuaW5nKHdhcm5pbmcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2lzTWFuYWdlZFBsYW4oZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBlbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkJ1c2luZXNzIHx8IGVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRW50ZXJwcmlzZTtcblx0fVxuXG5cdHByaXZhdGUgX2lzTWFuYWdlZFBsYW5CbG9ja2VkKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gdGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMucHJlbWl1bUNoYXQ7XG5cdFx0cmV0dXJuICEhc25hcHNob3QgJiYgc25hcHNob3QuaGFzUXVvdGEgPT09IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd01hbmFnZWRQbGFuQmxvY2tlZE5vdGlmaWNhdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9zaG93aW5nRXhoYXVzdGVkID0gdHJ1ZTtcblxuXHRcdHRoaXMuX3NldE5vdGlmaWNhdGlvbih7XG5cdFx0XHRpZDogUVVPVEFfTk9USUZJQ0FUSU9OX0lELFxuXHRcdFx0dGVsZW1ldHJ5SWQ6ICdtYW5hZ2VkUGxhbkJsb2NrZWQnLFxuXHRcdFx0c2V2ZXJpdHk6IENoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgncXVvdGEuYmxvY2tlZC5tYW5hZ2VkLnRpdGxlJywgXCJVc2FnZSBCbG9ja2VkXCIpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdxdW90YS5ibG9ja2VkLm1hbmFnZWQnLCBcIllvdXIgb3JnYW5pemF0aW9uIG9yIGVudGVycHJpc2UgaGFzIGV4Y2VlZGVkIGl0cyBDb3BpbG90IGJ1ZGdldC4gQ29udGFjdCB5b3VyIGFkbWluIHRvIHJlc3VtZSB1c2FnZS5cIiksXG5cdFx0XHRhY3Rpb25zOiBbXSxcblx0XHRcdGRpc21pc3NpYmxlOiB0cnVlLFxuXHRcdFx0YXV0b0Rpc21pc3NPbk1lc3NhZ2U6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9mb3JtYXRSZXNldERhdGUoaXNvRGF0ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCByZXNldERhdGUgPSBuZXcgRGF0ZShpc29EYXRlKTtcblx0XHRjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuXHRcdGNvbnN0IGluY2x1ZGVZZWFyID0gcmVzZXREYXRlLmdldEZ1bGxZZWFyKCkgIT09IG5vdy5nZXRGdWxsWWVhcigpO1xuXHRcdHJldHVybiBzYWZlSW50bC5EYXRlVGltZUZvcm1hdCh1bmRlZmluZWQsIGluY2x1ZGVZZWFyXG5cdFx0XHQ/IHsgbW9udGg6ICdsb25nJywgZGF5OiAnbnVtZXJpYycsIHllYXI6ICdudW1lcmljJywgaG91cjogJ251bWVyaWMnLCBtaW51dGU6ICcyLWRpZ2l0JyB9XG5cdFx0XHQ6IHsgbW9udGg6ICdsb25nJywgZGF5OiAnbnVtZXJpYycsIGhvdXI6ICdudW1lcmljJywgbWludXRlOiAnMi1kaWdpdCcgfVxuXHRcdCkudmFsdWUuZm9ybWF0KHJlc2V0RGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUcmFqZWN0b3J5UGVyaW9kS2V5KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzZXREYXRlID0gdGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMucmVzZXREYXRlO1xuXHRcdGlmICghcmVzZXREYXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBkYXRlID0gbmV3IERhdGUocmVzZXREYXRlKTtcblx0XHRpZiAoIU51bWJlci5pc0Zpbml0ZShkYXRlLmdldFRpbWUoKSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBgJHtkYXRlLmdldFVUQ0Z1bGxZZWFyKCl9LSR7ZGF0ZS5nZXRVVENNb250aCgpICsgMX1gO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNUcmFqZWN0b3J5U2hvd25JbkN1cnJlbnRQZXJpb2QoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcGVyaW9kS2V5ID0gdGhpcy5fZ2V0VHJhamVjdG9yeVBlcmlvZEtleSgpO1xuXHRcdHJldHVybiAhIXBlcmlvZEtleSAmJiB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoVFJBSkVDVE9SWV9OVURHRV9TUEVDLnNob3duU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSA9PT0gcGVyaW9kS2V5O1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RvcmVUcmFqZWN0b3J5U2hvd24oKTogdm9pZCB7XG5cdFx0Y29uc3QgcGVyaW9kS2V5ID0gdGhpcy5fZ2V0VHJhamVjdG9yeVBlcmlvZEtleSgpO1xuXHRcdGlmIChwZXJpb2RLZXkpIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKFRSQUpFQ1RPUllfTlVER0VfU1BFQy5zaG93blN0b3JhZ2VLZXksIHBlcmlvZEtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldE5vdGlmaWNhdGlvbihub3RpZmljYXRpb246IElDaGF0SW5wdXROb3RpZmljYXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9jaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLnNldE5vdGlmaWNhdGlvbihub3RpZmljYXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGlkZU5vdGlmaWNhdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9zaG93aW5nRXhoYXVzdGVkID0gZmFsc2U7XG5cdFx0dGhpcy5fY2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZS5kZWxldGVOb3RpZmljYXRpb24oUVVPVEFfTk9USUZJQ0FUSU9OX0lEKTtcblx0fVxuXG5cdC8vIC0tLSBFeGhhdXN0ZWQgZGlzbWlzc2FsIHBlcnNpc3RlbmNlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGB0cnVlYCBvbmx5IHdoZW4gdGhlcmUgaXMgYW4gYWN0dWFsIHF1b3RhIHNuYXBzaG90IGluZGljYXRpbmcgdGhhdFxuXHQgKiBjcmVkaXQgaXMgYXZhaWxhYmxlIChpLmUuIHF1b3RhIGlzIG5vdCB1c2VkIHVwKS4gUmV0dXJucyBgZmFsc2VgIHdoZW4gbm9cblx0ICogc25hcHNob3QgaGFzIGxvYWRlZCB5ZXQsIHNvIHRoZSB0cmFuc2llbnQgXCJubyBkYXRhXCIgc3RhdGUgYXQgc3RhcnR1cC9yZWxvYWRcblx0ICogaXMgbm90IG1pc3Rha2VuIGZvciByZWNvdmVyeS5cblx0ICovXG5cdHByaXZhdGUgX2lzUXVvdGFLbm93bkF2YWlsYWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl9nZXRSZWxldmFudFNuYXBzaG90KCkgJiYgIXRoaXMuX2lzUXVvdGFVc2VkVXAoKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzRXhoYXVzdGVkRGlzbWlzc2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKFFVT1RBX0VYSEFVU1RFRF9ESVNNSVNTRURfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0RXhoYXVzdGVkRGlzbWlzc2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKFFVT1RBX0VYSEFVU1RFRF9ESVNNSVNTRURfU1RPUkFHRV9LRVksIHRydWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyRXhoYXVzdGVkRGlzbWlzc2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShRVU9UQV9FWEhBVVNURURfRElTTUlTU0VEX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQTJCLHNCQUFzQjtBQUMxRCxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLGlCQUFpQiwrQkFBbUU7QUFDN0YsU0FBUyw0QkFBNEIsMEJBQTBCLHdCQUF3QixtQ0FBbUMsb0NBQW9DO0FBQzlKLFNBQVMsd0JBQXdCLDJCQUEyQjtBQUM1RCxTQUFTLGlDQUFpQywrQkFBdUQscUNBQXFDO0FBRXRJLE1BQU0sd0JBQXdCO0FBQzlCLE1BQU0sYUFBYSxDQUFDLElBQUksSUFBSSxJQUFJLEVBQUU7QUFDbEMsTUFBTSxnQ0FBZ0M7QUFDdEMsTUFBTSx3QkFBd0I7QUFBQSxFQUM3QixlQUFlO0FBQUEsRUFDZixpQkFBaUI7QUFBQSxFQUNqQiw0QkFBNEI7QUFBQSxFQUM1QixvQkFBb0I7QUFBQSxFQUNwQixvQkFBb0I7QUFBQSxFQUNwQixVQUFVLEtBQUssS0FBSyxLQUFLO0FBQUEsRUFDekIsY0FBYztBQUFBLEVBQ2Qsb0JBQW9CO0FBQ3JCO0FB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
