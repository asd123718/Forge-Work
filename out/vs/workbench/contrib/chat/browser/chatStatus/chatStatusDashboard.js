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
import { $, append, EventType, addDisposableListener, EventHelper, disposableWindowInterval, getWindow } from "../../../../../base/browser/dom.js";
import { Gesture, EventType as TouchEventType } from "../../../../../base/browser/touch.js";
import { ActionBar } from "../../../../../base/browser/ui/actionbar/actionbar.js";
import { renderLabelWithIcons } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { SelectBox } from "../../../../../base/browser/ui/selectBox/selectBox.js";
import { Checkbox, TriStateCheckbox } from "../../../../../base/browser/ui/toggle/toggle.js";
import { toAction } from "../../../../../base/common/actions.js";
import { Sequencer } from "../../../../../base/common/async.js";
import { cancelOnDispose } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { safeIntl } from "../../../../../base/common/date.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { MutableDisposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { parseLinkedText } from "../../../../../base/common/linkedText.js";
import { language } from "../../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { isObject } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { IInlineCompletionsService } from "../../../../../editor/browser/services/inlineCompletionsService.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { ITextResourceConfigurationService } from "../../../../../editor/common/services/textResourceConfiguration.js";
import { ILanguageFeaturesService } from "../../../../../editor/common/services/languageFeatures.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { localize } from "../../../../../nls.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, getConfigValueInTarget, IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IHoverService, nativeHoverDelegate } from "../../../../../platform/hover/browser/hover.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { Link } from "../../../../../platform/opener/browser/link.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { defaultButtonStyles, defaultCheckboxStyles, defaultSelectBoxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { DomWidget } from "../../../../../platform/domWidget/browser/domWidget.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../../common/editor.js";
import { IChatEntitlementService, ChatEntitlement, getChatPlanName } from "../../../../services/chat/common/chatEntitlementService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { isNewUser } from "./chatStatus.js";
import { IChatStatusItemService } from "./chatStatusItemService.js";
import { GitHubPaths, IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import product from "../../../../../platform/product/common/product.js";
import { isCompletionsEnabled } from "../../../../../editor/common/services/completionsEnablement.js";
const defaultChat = product.defaultChatAgent;
const completionsConfigurationTargets = [
  ConfigurationTarget.WORKSPACE_FOLDER,
  ConfigurationTarget.WORKSPACE,
  ConfigurationTarget.USER_REMOTE,
  ConfigurationTarget.USER_LOCAL,
  ConfigurationTarget.APPLICATION
];
let ChatStatusDashboard = class extends DomWidget {
  constructor(options, chatEntitlementService, chatStatusItemService, commandService, configurationService, editorService, hoverService, languageService, openerService, telemetryService, textResourceConfigurationService, inlineCompletionsService, markdownRendererService, languageFeaturesService, contextViewService, storageService, defaultAccountService, notificationService) {
    super();
    this.options = options;
    this.chatEntitlementService = chatEntitlementService;
    this.chatStatusItemService = chatStatusItemService;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.editorService = editorService;
    this.hoverService = hoverService;
    this.languageService = languageService;
    this.openerService = openerService;
    this.telemetryService = telemetryService;
    this.textResourceConfigurationService = textResourceConfigurationService;
    this.inlineCompletionsService = inlineCompletionsService;
    this.markdownRendererService = markdownRendererService;
    this.languageFeaturesService = languageFeaturesService;
    this.contextViewService = contextViewService;
    this.storageService = storageService;
    this.defaultAccountService = defaultAccountService;
    this.notificationService = notificationService;
    this.element = $("div.chat-status-bar-entry-tooltip");
    this.dateFormatter = safeIntl.DateTimeFormat(language, { month: "short", day: "numeric" });
    this.timeFormatter = safeIntl.DateTimeFormat(language, { hour: "numeric", minute: "numeric" });
    this.quotaPercentageFormatter = safeIntl.NumberFormat(void 0, { maximumFractionDigits: 0, minimumFractionDigits: 0 });
    this.quotaCreditsFormatter = safeIntl.NumberFormat(language, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
    this.render();
  }
  render() {
    const token = cancelOnDispose(this._store);
    const { chat, premiumChat, completions } = this.chatEntitlementService.quotas;
    const hasQuotas = !!(chat || premiumChat);
    const isAnonymousWithSentiment = this.chatEntitlementService.anonymous && this.chatEntitlementService.sentiment.completed;
    const isPooledQuotaDepleted = premiumChat?.unlimited && premiumChat.hasQuota === false;
    const hasUsageSection = hasQuotas || isAnonymousWithSentiment;
    const hasVisibleUsageContent = chat?.unlimited === false || premiumChat?.unlimited === false || !this.options?.compactQuotaLayout && completions?.unlimited === false || isAnonymousWithSentiment || isPooledQuotaDepleted;
    const contributedEntries = [...this.chatStatusItemService.getEntries()];
    const hasQuickSettingsContent = !this.options?.disableInlineSuggestionsSettings || !this.options?.disableModelSelection || !this.options?.disableProviderOptions || !this.options?.disableCompletionsSnooze;
    let headerAdditionalSpendButton;
    let headerUpgradeButton;
    if (hasUsageSection && !this.options?.compactQuotaLayout) {
      const planName = getChatPlanName(this.chatEntitlementService.entitlement);
      const headerHost = this.options?.titleHeaderContainer ?? this.element;
      const header = this.renderHeader(headerHost, this._store, planName, toAction({
        id: "workbench.action.manageCopilot",
        label: localize("quotaLabel", "Manage Copilot Settings"),
        tooltip: localize("quotaTooltip", "Manage Copilot Settings"),
        class: ThemeIcon.asClassName(Codicon.settings),
        run: () => this.runCommandAndClose(() => this.openerService.open(URI.parse(this.defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings))))
      }));
      const canConfigureAdditionalSpend = this.chatEntitlementService.entitlement === ChatEntitlement.EDU || this.chatEntitlementService.entitlement === ChatEntitlement.Pro || this.chatEntitlementService.entitlement === ChatEntitlement.ProPlus || this.chatEntitlementService.entitlement === ChatEntitlement.Max;
      const showUpgrade = this.chatEntitlementService.quotas.canUpgradePlan ?? false;
      const actionBarElement = header.lastElementChild;
      if (canConfigureAdditionalSpend) {
        headerAdditionalSpendButton = this._store.add(new Button(header, { ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate, secondary: true }));
        headerAdditionalSpendButton.element.classList.add("header-cta-button");
        headerAdditionalSpendButton.label = localize("manageBudget", "Manage Budget");
        this._store.add(headerAdditionalSpendButton.onDidClick(() => {
          this.telemetryService.publicLog2("workbenchActionExecuted", { id: "workbench.action.chat.manageAdditionalSpend", from: "chat-status" });
          this.runCommandAndClose(() => this.openerService.open(URI.parse(this.defaultAccountService.resolveGitHubUrl(GitHubPaths.billingBudgets))));
        }));
        if (actionBarElement) {
          header.insertBefore(headerAdditionalSpendButton.element, actionBarElement);
        }
      }
      if (showUpgrade) {
        headerUpgradeButton = this._store.add(new Button(header, { ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate }));
        headerUpgradeButton.element.classList.add("header-cta-button");
        headerUpgradeButton.label = localize("upgrade", "Upgrade");
        this._store.add(headerUpgradeButton.onDidClick(() => this.runCommandAndClose("workbench.action.chat.upgradePlan")));
        if (actionBarElement) {
          header.insertBefore(headerUpgradeButton.element, actionBarElement);
        }
      }
    }
    if (hasUsageSection && this.options?.compactQuotaLayout && this.options.ctaButtonsContainer) {
      const ctaContainer = this.options.ctaButtonsContainer;
      const canConfigureAdditionalSpend = this.chatEntitlementService.entitlement === ChatEntitlement.EDU || this.chatEntitlementService.entitlement === ChatEntitlement.Pro || this.chatEntitlementService.entitlement === ChatEntitlement.ProPlus || this.chatEntitlementService.entitlement === ChatEntitlement.Max;
      const showUpgrade = this.chatEntitlementService.quotas.canUpgradePlan ?? false;
      if (canConfigureAdditionalSpend) {
        headerAdditionalSpendButton = this._store.add(new Button(ctaContainer, { ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate, secondary: true }));
        headerAdditionalSpendButton.label = localize("manageBudget", "Manage Budget");
        this._store.add(headerAdditionalSpendButton.onDidClick(() => {
          this.telemetryService.publicLog2("workbenchActionExecuted", { id: "workbench.action.chat.manageAdditionalSpend", from: "chat-status" });
          this.runCommandAndClose(() => this.openerService.open(URI.parse(this.defaultAccountService.resolveGitHubUrl(GitHubPaths.billingBudgets))));
        }));
      }
      if (showUpgrade) {
        headerUpgradeButton = this._store.add(new Button(ctaContainer, { ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate }));
        headerUpgradeButton.label = localize("upgrade", "Upgrade");
        this._store.add(headerUpgradeButton.onDidClick(() => this.runCommandAndClose("workbench.action.chat.upgradePlan")));
      }
    }
    if (this.options?.compactQuotaLayout) {
      this.element.classList.add("compact");
    }
    const updatePromise = this.chatEntitlementService.update(token);
    if (hasVisibleUsageContent) {
      this.renderUsageContent(this.element, token, headerAdditionalSpendButton, headerUpgradeButton, updatePromise);
    }
    const hasPremiumUnlimited = !!premiumChat?.unlimited;
    const creditsUsed = hasPremiumUnlimited && !isPooledQuotaDepleted ? premiumChat?.creditsUsed : void 0;
    if (typeof creditsUsed === "number") {
      this.createCreditsUsedIndicator(this.element, creditsUsed, premiumChat?.resetAt);
    } else if (hasPremiumUnlimited) {
      const includedTitle = this.chatEntitlementService.quotas.usageBasedBilling ? localize("includedTitleTBB", "Credits") : localize("includedTitle", "Premium Requests");
      const getIncludedDescription = () => {
        if (isPooledQuotaDepleted) {
          return {
            compact: localize("premiumLimitReachedCompact", "{0} limit reached.", includedTitle),
            default: localize("premiumLimitReached", "Organization limit reached.")
          };
        }
        return {
          compact: localize("premiumIncludedCompact", "{0} included with your organization's plan.", includedTitle),
          default: localize("premiumIncluded", "Included with your organization's plan.")
        };
      };
      const includedDescription = getIncludedDescription();
      const includedContainer = this.element.appendChild($("div.quota-indicator.included"));
      if (this.options?.compactQuotaLayout) {
        const planName = getChatPlanName(this.chatEntitlementService.entitlement);
        includedContainer.classList.add("compact");
        includedContainer.appendChild($("div.quota-title", void 0, planName));
        includedContainer.appendChild($("div.description", void 0, includedDescription.compact));
      } else {
        includedContainer.appendChild($("div.quota-title", void 0, includedTitle));
        includedContainer.appendChild($("div.description", void 0, includedDescription.default));
      }
    }
    if (hasQuickSettingsContent) {
      const hasContentAbove = hasUsageSection || hasVisibleUsageContent || hasPremiumUnlimited;
      this.renderInlineSuggestionsSection(hasContentAbove);
    }
    if (contributedEntries.length > 0) {
      this.renderContributedSections(contributedEntries);
    }
    this.renderSetupSection();
  }
  renderUsageContent(container, token, headerAdditionalSpendButton, headerUpgradeButton, updatePromise) {
    const { chat: chatQuota, completions: completionsQuota, premiumChat: premiumChatQuota } = this.chatEntitlementService.quotas;
    const compact = !!this.options?.compactQuotaLayout;
    const planName = compact ? getChatPlanName(this.chatEntitlementService.entitlement) : void 0;
    if (chatQuota || premiumChatQuota || completionsQuota) {
      const resetLabel = this.formatGlobalResetLabel();
      const globalCalloutUpdater = this.createGlobalQuotaCallout(container);
      const { calloutVisible: initialCalloutVisible } = globalCalloutUpdater();
      if (headerAdditionalSpendButton) {
        headerAdditionalSpendButton.element.style.display = initialCalloutVisible ? "" : "none";
      }
      if (headerUpgradeButton) {
        headerUpgradeButton.element.style.display = headerAdditionalSpendButton && initialCalloutVisible ? "none" : "";
      }
      let chatQuotaIndicator;
      if (chatQuota && !chatQuota.unlimited && (!this.chatEntitlementService.quotas.usageBasedBilling || this.chatEntitlementService.entitlement === ChatEntitlement.Free)) {
        const chatLabel = this.chatEntitlementService.quotas.usageBasedBilling && this.chatEntitlementService.entitlement === ChatEntitlement.Free ? localize("creditsLabel", "Credits") : localize("chatsLabel", "Chat messages");
        chatQuotaIndicator = this.createQuotaIndicator(container, chatQuota, chatLabel, resetLabel, compact ? planName : void 0);
      }
      let premiumChatQuotaIndicator;
      if (premiumChatQuota && !premiumChatQuota.unlimited && premiumChatQuota.percentRemaining >= 0) {
        const isUBB = this.chatEntitlementService.quotas.usageBasedBilling;
        const premiumChatLabel = isUBB ? localize("creditsLabel", "Credits") : this.chatEntitlementService.quotas.additionalUsageEnabled ? localize("includedPremiumChatsLabel", "Included premium requests") : localize("premiumChatsLabel", "Premium requests");
        const premiumChatResetLabel = isUBB ? this.formatResetAtLabel(premiumChatQuota.resetAt) ?? resetLabel : resetLabel;
        premiumChatQuotaIndicator = this.createQuotaIndicator(container, premiumChatQuota, premiumChatLabel, premiumChatResetLabel, compact ? planName : void 0);
      }
      let additionalBudgetIndicator;
      let additionalBudgetElement;
      const initialOverageEntitlement = this.chatEntitlementService.quotas.additionalUsageEntitlement ?? 0;
      if (initialOverageEntitlement > 0) {
        const overageCount = this.chatEntitlementService.quotas.additionalUsageCount ?? 0;
        const overagePercentRemaining = Math.max(0, Math.min(100, (initialOverageEntitlement - overageCount) / initialOverageEntitlement * 100));
        const overageSnapshot = {
          percentRemaining: overagePercentRemaining,
          unlimited: false,
          entitlement: initialOverageEntitlement,
          quotaRemaining: Math.max(0, initialOverageEntitlement - overageCount)
        };
        const additionalBudgetLabel = localize("additionalBudgetLabel", "Additional Budget");
        additionalBudgetIndicator = this.createQuotaIndicator(container, overageSnapshot, additionalBudgetLabel, resetLabel, compact ? additionalBudgetLabel : void 0);
        additionalBudgetElement = container.lastElementChild;
        const isPremiumExhausted = premiumChatQuota && premiumChatQuota.percentRemaining <= 0;
        if (!isPremiumExhausted) {
          additionalBudgetElement.classList.add("muted");
        }
      }
      let completionsQuotaIndicator;
      const showCompletions = !compact && completionsQuota && !completionsQuota.unlimited && completionsQuota.percentRemaining >= 0 && (!this.chatEntitlementService.quotas.usageBasedBilling || this.chatEntitlementService.entitlement === ChatEntitlement.Free);
      if (showCompletions) {
        completionsQuotaIndicator = this.createQuotaIndicator(container, completionsQuota, localize("completionsLabel", "Inline Suggestions"), resetLabel, compact ? planName : void 0);
      }
      const updateIndicators = () => {
        const { chat: chatQuota2, premiumChat: premiumChatQuota2, completions: completionsQuota2 } = this.chatEntitlementService.quotas;
        if (chatQuota2) {
          chatQuotaIndicator?.(chatQuota2);
        }
        if (premiumChatQuota2) {
          premiumChatQuotaIndicator?.(premiumChatQuota2);
        }
        if (completionsQuota2) {
          completionsQuotaIndicator?.(completionsQuota2);
        }
        if (additionalBudgetIndicator && additionalBudgetElement) {
          const overageEntitlement = this.chatEntitlementService.quotas.additionalUsageEntitlement ?? 0;
          const overageCount = this.chatEntitlementService.quotas.additionalUsageCount ?? 0;
          if (overageEntitlement > 0) {
            const overagePercentRemaining = Math.max(0, Math.min(100, (overageEntitlement - overageCount) / overageEntitlement * 100));
            additionalBudgetIndicator({
              percentRemaining: overagePercentRemaining,
              unlimited: false,
              entitlement: overageEntitlement,
              quotaRemaining: Math.max(0, overageEntitlement - overageCount)
            });
          }
          const premiumExhausted = premiumChatQuota2 && premiumChatQuota2.percentRemaining <= 0;
          additionalBudgetElement.classList.toggle("muted", !premiumExhausted);
        }
        const { calloutVisible } = globalCalloutUpdater();
        if (headerAdditionalSpendButton) {
          headerAdditionalSpendButton.element.style.display = calloutVisible ? "" : "none";
          headerAdditionalSpendButton.label = localize("manageBudget", "Manage Budget");
        }
        if (headerUpgradeButton) {
          headerUpgradeButton.element.style.display = headerAdditionalSpendButton && calloutVisible ? "none" : "";
        }
      };
      (async () => {
        await updatePromise;
        if (token.isCancellationRequested) {
          return;
        }
        updateIndicators();
      })();
      this._store.add(this.chatEntitlementService.onDidChangeQuotaRemaining(() => updateIndicators()));
      this._store.add(this.chatEntitlementService.onDidChangeQuotaExceeded(() => updateIndicators()));
    } else if (this.chatEntitlementService.anonymous && this.chatEntitlementService.sentiment.completed) {
      this.createQuotaIndicator(container, localize("quotaLimited", "Limited"), localize("chatsLabel", "Chat messages"));
    }
  }
  renderInlineSuggestionsSection(hasContentAbove) {
    const nonCollapsible = !!this.options?.disableQuickSettingsCollapsible;
    const collapsed = !nonCollapsible && this.storageService.getBoolean(ChatStatusDashboard.QUICK_SETTINGS_COLLAPSED_KEY, StorageScope.PROFILE, true);
    const activeLanguageId = this.editorService.activeTextEditorLanguageId;
    const getStatusText = () => {
      if (!this.canUseChat()) {
        return localize("inlineSuggestionsDisabled", "Disabled");
      }
      const enabled = activeLanguageId ? isCompletionsEnabled(this.configurationService, activeLanguageId) : isCompletionsEnabled(this.configurationService);
      return enabled ? localize("inlineSuggestionsEnabled", "Enabled") : localize("inlineSuggestionsDisabled", "Disabled");
    };
    let disclosureHeader;
    let chevron;
    let statusEl;
    if (!nonCollapsible) {
      disclosureHeader = this.element.appendChild($("button.collapsible-header"));
      if (!hasContentAbove) {
        disclosureHeader.classList.add("no-border");
      }
      disclosureHeader.setAttribute("aria-expanded", String(!collapsed));
      disclosureHeader.appendChild($("span.collapsible-label", void 0, localize("inlineSuggestionsTab", "Inline Suggestions")));
      chevron = disclosureHeader.appendChild($("span.collapsible-chevron"));
      chevron.classList.add(...ThemeIcon.asClassNameArray(collapsed ? Codicon.chevronRight : Codicon.chevronDown));
      statusEl = disclosureHeader.appendChild($("span.collapsible-status", void 0, getStatusText()));
    }
    const collapsibleContent = this.element.appendChild($("div.collapsible-content"));
    const collapsibleInner = collapsibleContent.appendChild($("div.collapsible-inner"));
    if (collapsed) {
      collapsibleContent.classList.add("collapsed");
      collapsibleInner.inert = true;
    }
    if (disclosureHeader && chevron) {
      const toggle = () => {
        const isCollapsed = collapsibleContent.classList.toggle("collapsed");
        collapsibleInner.inert = isCollapsed;
        disclosureHeader.setAttribute("aria-expanded", String(!isCollapsed));
        chevron.className = "collapsible-chevron";
        chevron.classList.add(...ThemeIcon.asClassNameArray(isCollapsed ? Codicon.chevronRight : Codicon.chevronDown));
        this.storageService.store(ChatStatusDashboard.QUICK_SETTINGS_COLLAPSED_KEY, isCollapsed, StorageScope.PROFILE, StorageTarget.USER);
      };
      this._store.add(addDisposableListener(disclosureHeader, EventType.CLICK, () => toggle()));
    }
    if (statusEl) {
      this._store.add(this.configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(defaultChat.completionsEnablementSetting)) {
          statusEl.textContent = getStatusText();
        }
      }));
    }
    this.renderInlineSuggestionsContent(collapsibleInner);
  }
  renderContributedSections(contributedEntries) {
    for (const item of contributedEntries) {
      const headerLabel = typeof item.label === "string" ? item.label : item.label.label;
      let headerLink = typeof item.label === "string" ? void 0 : item.label.link;
      let linkDescription = typeof item.label === "string" ? void 0 : item.label.helpText;
      const section = this.element.appendChild($("div.contributed-section"));
      const header = section.appendChild($("div.collapsible-header.non-collapsible"));
      header.appendChild($("span.collapsible-label", void 0, headerLabel));
      if (linkDescription || headerLink) {
        const infoIcon = header.appendChild($("span.contributed-info-icon"));
        infoIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
        this._store.add(this.hoverService.setupDelayedHover(infoIcon, () => {
          const hoverContent = new MarkdownString("", { isTrusted: true });
          if (linkDescription) {
            hoverContent.appendText(linkDescription);
          }
          if (headerLink) {
            if (linkDescription) {
              hoverContent.appendText(" ");
            }
            hoverContent.appendMarkdown(`[${localize("learnMore", "Learn More")}](${headerLink})`);
          }
          return { content: hoverContent };
        }, { reducedDelay: true }));
      }
      const statusEl = header.appendChild($("span.collapsible-status"));
      const statusDisposables = this._store.add(new MutableDisposable());
      const renderStatus = (text) => {
        const newStore = new DisposableStore();
        statusDisposables.value = newStore;
        this.renderTextPlus(statusEl, text, newStore);
      };
      renderStatus(item.description);
      let currentTooltip = item.tooltip;
      if (currentTooltip) {
        this._store.add(this.hoverService.setupDelayedHover(statusEl, () => ({
          content: currentTooltip ?? ""
        }), { reducedDelay: true }));
      }
      const sectionDisposables = this._store.add(new MutableDisposable());
      const sectionStore = new DisposableStore();
      sectionDisposables.value = sectionStore;
      let detailEl;
      if (item.detail) {
        detailEl = section.appendChild($("div.contributed-detail"));
        this.renderTextPlus(detailEl, item.detail, sectionStore);
      }
      this._store.add(this.chatStatusItemService.onDidChange((e) => {
        if (e.entry.id === item.id) {
          statusEl.textContent = "";
          renderStatus(e.entry.description);
          currentTooltip = e.entry.tooltip;
          headerLink = typeof e.entry.label === "string" ? void 0 : e.entry.label.link;
          linkDescription = typeof e.entry.label === "string" ? void 0 : e.entry.label.helpText;
          const newStore = new DisposableStore();
          sectionDisposables.value = newStore;
          if (detailEl) {
            if (e.entry.detail) {
              detailEl.textContent = "";
              this.renderTextPlus(detailEl, e.entry.detail, newStore);
            } else {
              detailEl.remove();
              detailEl = void 0;
            }
          } else if (e.entry.detail) {
            detailEl = section.appendChild($("div.contributed-detail"));
            this.renderTextPlus(detailEl, e.entry.detail, newStore);
          }
        }
      }));
    }
  }
  renderSetupSection() {
    const hasByokModels = this.chatEntitlementService.hasByokModels;
    const newUser = isNewUser(this.chatEntitlementService) && !hasByokModels;
    const anonymousUser = this.chatEntitlementService.anonymous;
    const disabled = this.chatEntitlementService.sentiment.disabled || this.chatEntitlementService.sentiment.untrusted;
    const signedOut = this.chatEntitlementService.entitlement === ChatEntitlement.Unknown;
    if (!(newUser || signedOut || disabled)) {
      return;
    }
    this.element.appendChild($("hr"));
    let descriptionText;
    let descriptionClass = ".description";
    if (newUser && anonymousUser) {
      descriptionText = new MarkdownString(localize({ key: "activeDescriptionAnonymous", comment: ['{Locked="]({2})"}', '{Locked="]({3})"}'] }, "By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3})", defaultChat.provider.default.name, defaultChat.provider.default.name, defaultChat.termsStatementUrl, defaultChat.privacyStatementUrl), { isTrusted: true });
      descriptionClass = `${descriptionClass}.terms`;
    } else if (newUser) {
      descriptionText = localize("activateDescription", "Set up Copilot to use AI features.");
    } else if (anonymousUser) {
      descriptionText = localize("enableMoreDescription", "Sign in to enable more Copilot AI features.");
    } else if (disabled) {
      descriptionText = localize("enableDescription", "Enable Copilot to use AI features.");
    } else {
      descriptionText = localize("signInDescription", "Sign in to use GitHub Copilot AI features.");
    }
    let buttonLabel;
    if (newUser) {
      buttonLabel = localize("enableAIFeatures", "Use AI Features");
    } else if (anonymousUser) {
      buttonLabel = localize("enableMoreAIFeatures", "Enable more AI Features");
    } else if (disabled) {
      buttonLabel = localize("enableCopilotButton", "Enable AI Features");
    } else {
      buttonLabel = localize("signInToUseAIFeatures", "Sign in to use GitHub Copilot");
    }
    let commandId;
    if (newUser && anonymousUser) {
      commandId = "workbench.action.chat.triggerSetupAnonymousWithoutDialog";
    } else {
      commandId = "workbench.action.chat.triggerSetup";
    }
    if (typeof descriptionText === "string") {
      this.element.appendChild($(`div${descriptionClass}`, void 0, descriptionText));
    } else {
      this.element.appendChild($(`div${descriptionClass}`, void 0, this._store.add(this.markdownRendererService.render(descriptionText)).element));
    }
    const button = this._store.add(new Button(this.element, { ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate }));
    button.label = buttonLabel;
    this._store.add(button.onDidClick(() => this.runCommandAndClose(commandId)));
  }
  renderInlineSuggestionsContent(container) {
    if (!this.options?.disableInlineSuggestionsSettings) {
      this.createSettings(container);
    }
    const providers = !this.options?.disableModelSelection || !this.options?.disableProviderOptions ? this.languageFeaturesService.inlineCompletionsProvider.allNoModel() : void 0;
    if (!this.options?.disableModelSelection && providers) {
      const provider = providers.find((p) => p.modelInfo && p.modelInfo.models.length > 0);
      if (provider) {
        const modelInfo = provider.modelInfo;
        const currentModel = modelInfo.models.find((m) => m.id === modelInfo.currentModelId);
        if (currentModel) {
          const modelContainer = container.appendChild($("div.model-selection"));
          modelContainer.appendChild($("span.model-text", void 0, localize("modelLabel", "Model")));
          const selectOptions = modelInfo.models.map((m) => ({ text: m.name }));
          const selectedIndex = modelInfo.models.findIndex((m) => m.id === modelInfo.currentModelId);
          const selectBox = this._store.add(new SelectBox(selectOptions, Math.max(0, selectedIndex), this.contextViewService, defaultSelectBoxStyles, { ariaLabel: localize("selectModel", "Select Model"), optionsAsChildren: true }));
          const selectContainer = modelContainer.appendChild($("div.model-select-container"));
          selectBox.render(selectContainer);
          this._store.add(selectBox.onDidSelect(async (e) => {
            const selectedModel = modelInfo.models[e.index];
            if (selectedModel && selectedModel.id !== modelInfo.currentModelId && provider.setModelId) {
              await provider.setModelId(selectedModel.id);
            }
          }));
        }
      }
    }
    if (!this.options?.disableProviderOptions && providers) {
      for (const provider of providers) {
        if (provider.providerOptions && provider.providerOptions.length > 0) {
          for (const option of provider.providerOptions) {
            const currentValue = option.values.find((v) => v.id === option.currentValueId);
            if (currentValue) {
              const optionContainer = container.appendChild($("div.suggest-option-selection"));
              optionContainer.appendChild($("span.suggest-option-text", void 0, option.label));
              const selectOptions = option.values.map((v) => ({ text: v.label }));
              const selectedIndex = option.values.findIndex((v) => v.id === option.currentValueId);
              const selectBox = this._store.add(new SelectBox(selectOptions, Math.max(0, selectedIndex), this.contextViewService, defaultSelectBoxStyles, { ariaLabel: localize("selectOption", "Select {0}", option.label), optionsAsChildren: true }));
              const selectContainer = optionContainer.appendChild($("div.suggest-option-select-container"));
              selectBox.render(selectContainer);
              this._store.add(selectBox.onDidSelect(async (e) => {
                const selectedValue = option.values[e.index];
                if (selectedValue && selectedValue.id !== option.currentValueId && provider.setProviderOption) {
                  await provider.setProviderOption(option.id, selectedValue.id);
                }
              }));
            }
          }
        }
      }
    }
    if (!this.options?.disableCompletionsSnooze && this.canUseChat()) {
      const snooze = append(container, $("div.snooze-completions"));
      this.createCompletionsSnooze(snooze, localize("settings.snooze", "Snooze"));
    }
  }
  canUseChat() {
    if (!this.chatEntitlementService.sentiment.completed || this.chatEntitlementService.sentiment.disabled || this.chatEntitlementService.sentiment.untrusted) {
      return false;
    }
    if (this.chatEntitlementService.entitlement === ChatEntitlement.Unknown || this.chatEntitlementService.entitlement === ChatEntitlement.Available) {
      return this.chatEntitlementService.anonymous;
    }
    if (this.chatEntitlementService.entitlement === ChatEntitlement.Free && this.chatEntitlementService.quotas.chat?.percentRemaining === 0 && this.chatEntitlementService.quotas.completions?.percentRemaining === 0) {
      return false;
    }
    return true;
  }
  renderHeader(container, disposables, label, action) {
    const header = container.appendChild($("div.header"));
    header.appendChild($("span.header-label", void 0, label));
    if (action) {
      const toolbar = disposables.add(new ActionBar(header, { hoverDelegate: nativeHoverDelegate }));
      toolbar.push([action], { icon: true, label: false });
    }
    return header;
  }
  renderTextPlus(target, text, store) {
    for (const node of parseLinkedText(text).nodes) {
      if (typeof node === "string") {
        const parts = renderLabelWithIcons(node);
        target.append(...parts);
      } else {
        store.add(new Link(target, node, void 0, this.hoverService, this.openerService));
      }
    }
  }
  runCommandAndClose(commandOrFn, ...args) {
    if (typeof commandOrFn === "function") {
      commandOrFn(...args);
    } else {
      this.telemetryService.publicLog2("workbenchActionExecuted", { id: commandOrFn, from: "chat-status" });
      this.commandService.executeCommand(commandOrFn, ...args);
    }
    this.hoverService.hideHover(true);
  }
  formatResetAtLabel(resetAt) {
    if (!resetAt) {
      return void 0;
    }
    const resetDate = new Date(resetAt * 1e3);
    return localize("quotaResetsAt", "Resets {0} at {1}", this.dateFormatter.value.format(resetDate), this.timeFormatter.value.format(resetDate));
  }
  formatGlobalResetLabel() {
    const { resetDate, resetDateHasTime } = this.chatEntitlementService.quotas;
    if (!resetDate) {
      return void 0;
    }
    return resetDateHasTime ? localize("quotaResetsAt", "Resets {0} at {1}", this.dateFormatter.value.format(new Date(resetDate)), this.timeFormatter.value.format(new Date(resetDate))) : localize("quotaResets", "Resets {0}", this.dateFormatter.value.format(new Date(resetDate)));
  }
  createCreditsUsedIndicator(container, creditsUsed, resetAt) {
    const isCompact = !!this.options?.compactQuotaLayout;
    const resetLabel = this.formatResetAtLabel(resetAt) ?? this.formatGlobalResetLabel();
    const resetValue = $("span.quota-reset");
    if (resetLabel) {
      resetValue.textContent = resetLabel;
    }
    const quotaPercentage = $(
      "div.quota-percentage",
      void 0,
      $("span.quota-value", void 0, this.quotaCreditsFormatter.value.format(creditsUsed)),
      $("span.quota-value-suffix", void 0, isCompact ? localize("quotaLabelUsed", "{0} used", localize("creditsLabel", "Credits")) : localize("creditsUsedLabel", "Credits Used"))
    );
    const indicatorElement = $(
      "div.quota-indicator.included.credits-used",
      void 0,
      ...isCompact ? [$("div.quota-title", void 0, getChatPlanName(this.chatEntitlementService.entitlement))] : [],
      $(
        "div.quota-details",
        void 0,
        quotaPercentage,
        resetValue
      )
    );
    if (isCompact) {
      indicatorElement.classList.add("compact");
    }
    container.appendChild(indicatorElement);
  }
  createQuotaIndicator(container, quota, label, resetLabel, compactTitle) {
    const isCompact = !!compactTitle;
    const quotaValue = $("span.quota-value");
    const quotaValueText = isCompact ? quotaValue.appendChild($("span.quota-value-text")) : quotaValue;
    const quotaValueSuffix = $("span.quota-value-suffix");
    const quotaBit = $("div.quota-bit");
    const resetValue = $("span.quota-reset");
    if (resetLabel) {
      resetValue.textContent = resetLabel;
    }
    const quotaPercentage = $(
      "div.quota-percentage",
      void 0,
      quotaValue,
      quotaValueSuffix
    );
    quotaPercentage.tabIndex = isCompact ? -1 : 0;
    const indicatorElement = $(
      "div.quota-indicator",
      void 0,
      $(
        "div.quota-title",
        void 0,
        $("span", void 0, isCompact ? compactTitle : label),
        ...isCompact ? [] : [resetValue]
      ),
      $(
        "div.quota-details",
        void 0,
        quotaPercentage,
        ...isCompact ? [resetValue] : []
      ),
      ...isCompact ? [] : [$("div.quota-bar", void 0, quotaBit)]
    );
    if (isCompact) {
      indicatorElement.classList.add("compact");
    }
    container.appendChild(indicatorElement);
    let currentQuota = quota;
    let isHovered = false;
    const showPercentage = () => {
      if (typeof currentQuota === "string") {
        quotaValueText.textContent = currentQuota;
        quotaValueSuffix.textContent = "";
      } else {
        const usedPercentage = Math.max(0, 100 - currentQuota.percentRemaining);
        quotaValueText.textContent = localize("quotaDisplay", "{0}%", this.quotaPercentageFormatter.value.format(Math.floor(usedPercentage)));
        quotaValueSuffix.textContent = isCompact ? localize("quotaLabelUsed", "{0} used", label) : ` ${localize("quotaUsed", "used")}`;
      }
    };
    const showCredits = () => {
      if (typeof currentQuota !== "string" && currentQuota.entitlement) {
        const total = currentQuota.entitlement;
        const used = currentQuota.quotaRemaining !== void 0 ? total - currentQuota.quotaRemaining : total * (100 - currentQuota.percentRemaining) / 100;
        const usedFormatted = this.quotaCreditsFormatter.value.format(used);
        const totalFormatted = this.quotaCreditsFormatter.value.format(total);
        quotaValueText.textContent = localize("quotaCreditsDisplay", "{0} / {1}", usedFormatted, totalFormatted);
        quotaValueSuffix.textContent = isCompact ? localize("quotaLabelUsed", "{0} used", label) : ` ${localize("quotaUsed", "used")}`;
      }
    };
    const hoverTarget = isCompact ? quotaValueText : quotaPercentage;
    this._store.add(addDisposableListener(hoverTarget, EventType.MOUSE_ENTER, () => {
      isHovered = true;
      showCredits();
    }));
    this._store.add(addDisposableListener(hoverTarget, EventType.MOUSE_LEAVE, () => {
      isHovered = false;
      showPercentage();
    }));
    this._store.add(addDisposableListener(hoverTarget, EventType.FOCUS, () => {
      isHovered = true;
      showCredits();
    }));
    this._store.add(addDisposableListener(hoverTarget, EventType.BLUR, () => {
      isHovered = false;
      showPercentage();
    }));
    const update = (quota2) => {
      currentQuota = quota2;
      let usedPercentage;
      if (typeof quota2 === "string") {
        usedPercentage = 0;
      } else {
        usedPercentage = Math.max(0, 100 - quota2.percentRemaining);
      }
      if (isHovered) {
        showCredits();
      } else {
        showPercentage();
      }
      quotaBit.style.width = `${usedPercentage}%`;
    };
    update(quota);
    return update;
  }
  createGlobalQuotaCallout(container) {
    const calloutIcon = $("span.callout-icon");
    const calloutText = $("span.callout-text");
    const quotaCallout = container.appendChild($("div.quota-callout", void 0, calloutIcon, calloutText));
    quotaCallout.style.display = "none";
    const update = () => {
      const quotas = this.chatEntitlementService.quotas;
      const additionalUsageEnabled = quotas.additionalUsageEnabled ?? false;
      const isEnterpriseUser = this.chatEntitlementService.entitlement === ChatEntitlement.Enterprise || this.chatEntitlementService.entitlement === ChatEntitlement.Business;
      const isUsageBasedBilling = quotas.usageBasedBilling === true;
      const allQuotas = [];
      if (quotas.chat && !quotas.chat.unlimited) {
        allQuotas.push(quotas.chat);
      }
      if (quotas.premiumChat && !quotas.premiumChat.unlimited) {
        allQuotas.push(quotas.premiumChat);
      }
      const maxUsedPercentage = allQuotas.length > 0 ? Math.max(...allQuotas.map((q) => Math.max(0, 100 - q.percentRemaining))) : 0;
      const isPooledQuotaExhausted = quotas.premiumChat?.unlimited && quotas.premiumChat.hasQuota === false;
      if (isEnterpriseUser && isPooledQuotaExhausted) {
        quotaCallout.style.display = "";
        quotaCallout.className = "quota-callout info";
        calloutIcon.className = `callout-icon ${ThemeIcon.asClassName(Codicon.info)}`;
        calloutText.textContent = localize("quotaBudgetExceededEnterprise", "Your organization or enterprise has exceeded its Copilot budget. Contact your admin to resume usage.");
      } else if (maxUsedPercentage >= 100 && additionalUsageEnabled) {
        quotaCallout.style.display = "";
        quotaCallout.className = "quota-callout info";
        calloutIcon.className = `callout-icon ${ThemeIcon.asClassName(Codicon.info)}`;
        calloutText.textContent = isEnterpriseUser ? localize("quotaAdditionalUsageActiveEnterprise", "Copilot has paused because your limits are reached. Please contact your admin to increase your limits.") : isUsageBasedBilling ? localize("quotaAdditionalUsageActive", "Additional budget is configured. Usage will continue until limits reset.") : localize("quotaBudgetActive", "Premium request budget is configured. Usage will continue until limits reset.");
      } else if (maxUsedPercentage >= 75 && maxUsedPercentage < 100 && additionalUsageEnabled) {
        quotaCallout.style.display = "";
        quotaCallout.className = "quota-callout info";
        calloutIcon.className = `callout-icon ${ThemeIcon.asClassName(Codicon.info)}`;
        calloutText.textContent = isEnterpriseUser ? localize("quotaAdditionalUsageApproachingEnterprise", "Copilot will pause when your limits are reached. Please contact your admin to increase your limits.") : isUsageBasedBilling ? localize("quotaAdditionalUsageApproaching", "Once the limit is reached, additional budget will be used.") : localize("quotaBudgetApproaching", "Once the limit is reached, premium request budget will be used.");
      } else if ((maxUsedPercentage >= 100 || isPooledQuotaExhausted) && !additionalUsageEnabled) {
        quotaCallout.style.display = "";
        quotaCallout.className = "quota-callout info";
        calloutIcon.className = `callout-icon ${ThemeIcon.asClassName(Codicon.info)}`;
        calloutText.textContent = isEnterpriseUser ? localize("quotaPausedEnterprise", "Copilot is paused until the limit resets. Contact your administrator for more information.") : localize("quotaPaused", "Copilot is paused until the limit resets.");
      } else if (maxUsedPercentage >= 75 && !additionalUsageEnabled) {
        quotaCallout.style.display = "";
        quotaCallout.className = "quota-callout info";
        calloutIcon.className = `callout-icon ${ThemeIcon.asClassName(Codicon.info)}`;
        calloutText.textContent = isEnterpriseUser ? localize("quotaWarningEnterprise", "Copilot will pause when the limit is reached. Contact your administrator for more information.") : localize("quotaWarning", "Copilot will pause when the limit is reached.");
      } else {
        quotaCallout.style.display = "none";
      }
      return { calloutVisible: quotaCallout.style.display !== "none", additionalUsageEnabled };
    };
    update();
    return update;
  }
  createSettings(container) {
    const modeId = this.editorService.activeTextEditorLanguageId;
    const settings = container.appendChild($("div.settings"));
    {
      const globalSetting = append(settings, $("div.setting"));
      this.createInlineSuggestionsSetting(globalSetting, localize("settings.codeCompletions.allFiles", "Ghost text suggestions"), "*");
      const overriddenHint = globalSetting.appendChild($("span.setting-overridden"));
      const updateOverriddenHint = () => {
        const obj = this.configurationService.getValue(defaultChat.completionsEnablementSetting);
        const configuredValue = modeId ? this.findConfiguredCompletionsValue(modeId) : void 0;
        const hasOverride = modeId && configuredValue && isObject(obj) && Boolean(configuredValue.value[modeId]) !== Boolean(obj["*"]);
        overriddenHint.textContent = hasOverride ? localize("settings.overridden", "(overridden)") : "";
      };
      updateOverriddenHint();
      if (modeId) {
        const languageSetting = append(settings, $("div.setting"));
        const languageName = this.languageService.getLanguageName(modeId) ?? modeId;
        this.createTriStateLanguageSetting(languageSetting, localize("settings.codeCompletions.language", "Ghost text suggestions for {0}", languageName), modeId, updateOverriddenHint);
      }
    }
    {
      const setting = append(settings, $("div.setting"));
      this.createNextEditSuggestionsSetting(setting, localize("settings.nextEditSuggestions", "Next edit suggestions"), this.getCompletionsSettingAccessor(modeId));
    }
  }
  createSetting(container, settingIdsToReEvaluate, label, accessor) {
    const checkbox = this._store.add(new Checkbox(label, Boolean(accessor.readSetting()), { ...defaultCheckboxStyles }));
    container.appendChild(checkbox.domNode);
    const settingLabel = append(container, $("span.setting-label", void 0, label));
    this._store.add(Gesture.addTarget(settingLabel));
    [EventType.CLICK, TouchEventType.Tap].forEach((eventType) => {
      this._store.add(addDisposableListener(settingLabel, eventType, (e) => {
        if (checkbox?.enabled) {
          EventHelper.stop(e, true);
          checkbox.checked = !checkbox.checked;
          accessor.writeSetting(checkbox.checked);
          checkbox.focus();
        }
      }));
    });
    this._store.add(checkbox.onChange(() => {
      accessor.writeSetting(checkbox.checked);
    }));
    this._store.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (settingIdsToReEvaluate.some((id) => e.affectsConfiguration(id))) {
        checkbox.checked = Boolean(accessor.readSetting());
      }
    }));
    if (!this.canUseChat()) {
      container.classList.add("disabled");
      checkbox.disable();
      checkbox.checked = false;
    }
    return checkbox;
  }
  createInlineSuggestionsSetting(container, label, modeId) {
    this.createSetting(container, [defaultChat.completionsEnablementSetting], label, this.getCompletionsSettingAccessor(modeId));
  }
  createTriStateLanguageSetting(container, label, modeId, onStateChange) {
    const settingId = defaultChat.completionsEnablementSetting;
    const getState = () => {
      const configuredValue = this.findConfiguredCompletionsValue(modeId);
      return configuredValue ? Boolean(configuredValue.value[modeId]) : "mixed";
    };
    let requestedState = getState();
    let pendingWrites = 0;
    const checkbox = this._store.add(new TriStateCheckbox(label, requestedState, { ...defaultCheckboxStyles }));
    container.appendChild(checkbox.domNode);
    const settingLabel = append(container, $("span.setting-label", void 0, label));
    this._store.add(Gesture.addTarget(settingLabel));
    const writeSequencer = new Sequencer();
    const renderState = (state) => {
      requestedState = state;
      checkbox.checked = state;
      checkbox.domNode.setAttribute("aria-checked", state === "mixed" ? "mixed" : String(state));
    };
    const getNextState = () => requestedState === true ? false : requestedState === false ? "mixed" : true;
    const writeState = async (state) => {
      const configuredValue = this.findConfiguredCompletionsValue(modeId) ?? this.findConfiguredCompletionsValue();
      if (state === "mixed") {
        for (const configuredValue2 of this.findConfiguredCompletionsValues(modeId)) {
          const { [modeId]: _, ...rest } = configuredValue2.value;
          await this.configurationService.updateValue(settingId, rest, configuredValue2.target);
        }
      } else {
        const value = { ...configuredValue?.value, [modeId]: state };
        if (configuredValue) {
          await this.configurationService.updateValue(settingId, value, configuredValue.target);
        } else {
          await this.configurationService.updateValue(settingId, value);
        }
      }
      const enabled = isCompletionsEnabled(this.configurationService, modeId);
      this.telemetryService.publicLog2("chatStatus.settingChanged", {
        settingIdentifier: settingId,
        settingMode: modeId,
        settingEnablement: enabled ? "enabled" : "disabled"
      });
    };
    const requestStateChange = () => {
      const state = getNextState();
      renderState(state);
      pendingWrites++;
      void writeSequencer.queue(async () => {
        try {
          await writeState(state);
        } finally {
          pendingWrites--;
        }
      }).catch((error) => {
        if (pendingWrites === 0) {
          renderState(getState());
          onStateChange();
        }
        this.notificationService.error(error);
      });
    };
    renderState(requestedState);
    [EventType.CLICK, TouchEventType.Tap].forEach((eventType) => {
      this._store.add(addDisposableListener(settingLabel, eventType, (e) => {
        if (checkbox?.enabled) {
          EventHelper.stop(e, true);
          requestStateChange();
          checkbox.focus();
        }
      }));
    });
    this._store.add(checkbox.onChange(() => {
      renderState(requestedState);
      requestStateChange();
    }));
    this._store.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(settingId)) {
        const state = getState();
        if (pendingWrites === 0 || state === requestedState) {
          renderState(state);
          onStateChange();
        }
      }
    }));
    if (!this.canUseChat()) {
      container.classList.add("disabled");
      checkbox.disable();
      checkbox.checked = false;
    }
  }
  findConfiguredCompletionsValue(modeId) {
    return this.findConfiguredCompletionsValues(modeId)[0];
  }
  findConfiguredCompletionsValues(modeId) {
    const inspected = this.configurationService.inspect(defaultChat.completionsEnablementSetting);
    const result = [];
    for (const target of completionsConfigurationTargets) {
      const value = getConfigValueInTarget(inspected, target);
      if (isObject(value) && (!modeId || Object.prototype.hasOwnProperty.call(value, modeId))) {
        result.push({ target, value });
      }
    }
    return result;
  }
  getCompletionsSettingAccessor(modeId = "*") {
    const settingId = defaultChat.completionsEnablementSetting;
    return {
      readSetting: () => isCompletionsEnabled(this.configurationService, modeId),
      writeSetting: (value) => {
        this.telemetryService.publicLog2("chatStatus.settingChanged", {
          settingIdentifier: settingId,
          settingMode: modeId,
          settingEnablement: value ? "enabled" : "disabled"
        });
        let result = this.configurationService.getValue(settingId);
        if (!isObject(result)) {
          result = /* @__PURE__ */ Object.create(null);
        }
        return this.configurationService.updateValue(settingId, { ...result, [modeId]: value });
      }
    };
  }
  createNextEditSuggestionsSetting(container, label, completionsSettingAccessor) {
    const nesSettingId = defaultChat.nextEditSuggestionsSetting;
    const completionsSettingId = defaultChat.completionsEnablementSetting;
    const resource = EditorResourceAccessor.getOriginalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    const checkbox = this.createSetting(container, [nesSettingId, completionsSettingId], label, {
      readSetting: () => completionsSettingAccessor.readSetting() && this.textResourceConfigurationService.getValue(resource, nesSettingId),
      writeSetting: (value) => {
        this.telemetryService.publicLog2("chatStatus.settingChanged", {
          settingIdentifier: nesSettingId,
          settingEnablement: value ? "enabled" : "disabled"
        });
        return this.textResourceConfigurationService.updateValue(resource, nesSettingId, value);
      }
    });
    if (!completionsSettingAccessor.readSetting()) {
      container.classList.add("disabled");
      checkbox.disable();
    }
    this._store.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(completionsSettingId)) {
        if (completionsSettingAccessor.readSetting() && this.canUseChat()) {
          checkbox.enable();
          container.classList.remove("disabled");
        } else {
          checkbox.disable();
          container.classList.add("disabled");
        }
      }
    }));
  }
  createCompletionsSnooze(container, label) {
    const isEnabled = () => {
      const completionsEnabled = isCompletionsEnabled(this.configurationService);
      const completionsEnabledActiveLanguage = isCompletionsEnabled(this.configurationService, this.editorService.activeTextEditorLanguageId);
      return completionsEnabled || completionsEnabledActiveLanguage;
    };
    const button = this._store.add(new Button(container, { disabled: !isEnabled(), ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate, secondary: true }));
    const timerDisplay = container.appendChild($("span.snooze-label"));
    const actionBar = container.appendChild($("div.snooze-action-bar"));
    const toolbar = this._store.add(new ActionBar(actionBar, { hoverDelegate: nativeHoverDelegate }));
    const cancelAction = toAction({
      id: "workbench.action.cancelSnoozeStatusBarLink",
      label: localize("cancelSnooze", "Cancel Snooze"),
      run: () => this.inlineCompletionsService.cancelSnooze(),
      class: ThemeIcon.asClassName(Codicon.stopCircle)
    });
    const update = (isEnabled2) => {
      container.classList.toggle("disabled", !isEnabled2);
      toolbar.clear();
      const timeLeftMs = this.inlineCompletionsService.snoozeTimeLeft;
      if (!isEnabled2 || timeLeftMs <= 0) {
        timerDisplay.textContent = localize("completions.snooze5minutesTitle", "Hide suggestions for 5 min");
        timerDisplay.title = "";
        button.label = label;
        button.setTitle(localize("completions.snooze5minutes", "Hide inline suggestions for 5 min"));
        return true;
      }
      const timeLeftSeconds = Math.ceil(timeLeftMs / 1e3);
      const minutes = Math.floor(timeLeftSeconds / 60);
      const seconds = timeLeftSeconds % 60;
      timerDisplay.textContent = `${minutes}:${seconds < 10 ? "0" : ""}${seconds} ${localize("completions.remainingTime", "remaining")}`;
      timerDisplay.title = localize("completions.snoozeTimeDescription", "Inline suggestions are hidden for the remaining duration");
      button.label = localize("completions.plus5min", "+5 min");
      button.setTitle(localize("completions.snoozeAdditional5minutes", "Snooze additional 5 min"));
      toolbar.push([cancelAction], { icon: true, label: false });
      return false;
    };
    const timerDisposables = this._store.add(new DisposableStore());
    function updateIntervalTimer() {
      timerDisposables.clear();
      const enabled = isEnabled();
      if (update(enabled)) {
        return;
      }
      timerDisposables.add(disposableWindowInterval(
        getWindow(container),
        () => update(enabled),
        1e3
      ));
    }
    updateIntervalTimer();
    this._store.add(button.onDidClick(() => {
      this.inlineCompletionsService.snooze();
      update(isEnabled());
    }));
    this._store.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(defaultChat.completionsEnablementSetting)) {
        button.enabled = isEnabled();
      }
      updateIntervalTimer();
    }));
    this._store.add(this.inlineCompletionsService.onDidChangeIsSnoozing(() => {
      updateIntervalTimer();
    }));
  }
};
ChatStatusDashboard.QUICK_SETTINGS_COLLAPSED_KEY = "chatStatusDashboard.quickSettingsCollapsed";
ChatStatusDashboard = __decorateClass([
  __decorateParam(1, IChatEntitlementService),
  __decorateParam(2, IChatStatusItemService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, ILanguageService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, ITextResourceConfigurationService),
  __decorateParam(11, IInlineCompletionsService),
  __decorateParam(12, IMarkdownRendererService),
  __decorateParam(13, ILanguageFeaturesService),
  __decorateParam(14, IContextViewService),
  __decorateParam(15, IStorageService),
  __decorateParam(16, IDefaultAccountService),
  __decorateParam(17, INotificationService)
], ChatStatusDashboard);
export {
  ChatStatusDashboard
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRTdGF0dXNcXGNoYXRTdGF0dXNEYXNoYm9hcmQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBhcHBlbmQsIEV2ZW50VHlwZSwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudEhlbHBlciwgZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsLCBnZXRXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEdlc3R1cmUsIEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBTZWxlY3RCb3ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2VsZWN0Qm94L3NlbGVjdEJveC5qcyc7XG5pbXBvcnQgeyBDaGVja2JveCwgVHJpU3RhdGVDaGVja2JveCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIHRvQWN0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXF1ZW5jZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgY2FuY2VsT25EaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBzYWZlSW50bCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBNdXRhYmxlRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHBhcnNlTGlua2VkVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpbmtlZFRleHQuanMnO1xuaW1wb3J0IHsgbGFuZ3VhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgaXNPYmplY3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUlubGluZUNvbXBsZXRpb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2lubGluZUNvbXBsZXRpb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIGdldENvbmZpZ1ZhbHVlSW5UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSwgbmF0aXZlSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgTGluayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9icm93c2VyL2xpbmsuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMsIGRlZmF1bHRDaGVja2JveFN0eWxlcywgZGVmYXVsdFNlbGVjdEJveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBEb21XaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kb21XaWRnZXQvYnJvd3Nlci9kb21XaWRnZXQuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgU2lkZUJ5U2lkZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIENoYXRFbnRpdGxlbWVudFNlcnZpY2UsIENoYXRFbnRpdGxlbWVudCwgSVF1b3RhU25hcHNob3QsIGdldENoYXRQbGFuTmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgaXNOZXdVc2VyIH0gZnJvbSAnLi9jaGF0U3RhdHVzLmpzJztcbmltcG9ydCB7IElDaGF0U3RhdHVzSXRlbVNlcnZpY2UsIENoYXRTdGF0dXNFbnRyeSB9IGZyb20gJy4vY2hhdFN0YXR1c0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdpdEh1YlBhdGhzLCBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgaXNDb21wbGV0aW9uc0VuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2NvbXBsZXRpb25zRW5hYmxlbWVudC5qcyc7XG5cbmNvbnN0IGRlZmF1bHRDaGF0ID0gcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50ITtcbmNvbnN0IGNvbXBsZXRpb25zQ29uZmlndXJhdGlvblRhcmdldHMgPSBbXG5cdENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUixcblx0Q29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UsXG5cdENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUsXG5cdENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCxcblx0Q29uZmlndXJhdGlvblRhcmdldC5BUFBMSUNBVElPTixcbl0gYXMgY29uc3Q7XG5cbmludGVyZmFjZSBJU2V0dGluZ3NBY2Nlc3NvciB7XG5cdHJlYWRTZXR0aW5nOiAoKSA9PiBib29sZWFuO1xuXHR3cml0ZVNldHRpbmc6ICh2YWx1ZTogYm9vbGVhbikgPT4gUHJvbWlzZTx2b2lkPjtcbn1cbnR5cGUgQ2hhdFNldHRpbmdDaGFuZ2VkQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnYnBhc2Vybyc7XG5cdGNvbW1lbnQ6ICdQcm92aWRlcyBpbnNpZ2h0IGludG8gY2hhdCBzZXR0aW5ncyBjaGFuZ2VkIGZyb20gdGhlIGNoYXQgc3RhdHVzIGVudHJ5Lic7XG5cdHNldHRpbmdJZGVudGlmaWVyOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGlkZW50aWZpZXIgb2YgdGhlIHNldHRpbmcgdGhhdCBjaGFuZ2VkLicgfTtcblx0c2V0dGluZ01vZGU/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG9wdGlvbmFsIGVkaXRvciBsYW5ndWFnZSBmb3Igd2hpY2ggdGhlIHNldHRpbmcgY2hhbmdlZC4nIH07XG5cdHNldHRpbmdFbmFibGVtZW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgc2V0dGluZyBnb3QgZW5hYmxlZCBvciBkaXNhYmxlZC4nIH07XG59O1xudHlwZSBDaGF0U2V0dGluZ0NoYW5nZWRFdmVudCA9IHtcblx0c2V0dGluZ0lkZW50aWZpZXI6IHN0cmluZztcblx0c2V0dGluZ01vZGU/OiBzdHJpbmc7XG5cdHNldHRpbmdFbmFibGVtZW50OiAnZW5hYmxlZCcgfCAnZGlzYWJsZWQnO1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFN0YXR1c0Rhc2hib2FyZE9wdGlvbnMge1xuXHQvKiogV2hlbiB0cnVlLCBkaXNhYmxlcyB0aGUgSW5saW5lIFN1Z2dlc3Rpb25zIHNldHRpbmdzIHNlY3Rpb24gKHRvZ2dsZXMgZm9yIGFsbCBmaWxlcywgbGFuZ3VhZ2UsIG5leHQgZWRpdCkuICovXG5cdGRpc2FibGVJbmxpbmVTdWdnZXN0aW9uc1NldHRpbmdzPzogYm9vbGVhbjtcblx0LyoqIFdoZW4gdHJ1ZSwgZGlzYWJsZXMgdGhlIGlubGluZSBjb21wbGV0aW9ucyBtb2RlbCBzZWxlY3Rpb24gc2VjdGlvbi4gKi9cblx0ZGlzYWJsZU1vZGVsU2VsZWN0aW9uPzogYm9vbGVhbjtcblx0LyoqIFdoZW4gdHJ1ZSwgZGlzYWJsZXMgdGhlIGlubGluZSBjb21wbGV0aW9ucyBwcm92aWRlciBvcHRpb25zIHNlY3Rpb24uICovXG5cdGRpc2FibGVQcm92aWRlck9wdGlvbnM/OiBib29sZWFuO1xuXHQvKiogV2hlbiB0cnVlLCBkaXNhYmxlcyB0aGUgY29tcGxldGlvbnMgc25vb3plIGJ1dHRvbi4gKi9cblx0ZGlzYWJsZUNvbXBsZXRpb25zU25vb3plPzogYm9vbGVhbjtcblx0LyoqIFdoZW4gdHJ1ZSwgdGhlIFF1aWNrIFNldHRpbmdzIHJlZ2lvbiBpcyByZW5kZXJlZCBhbHdheXMtZXhwYW5kZWQgd2l0aG91dCBhIGNvbGxhcHNpYmxlIGhlYWRlci4gKi9cblx0ZGlzYWJsZVF1aWNrU2V0dGluZ3NDb2xsYXBzaWJsZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFdoZW4gcHJvdmlkZWQsIHRoZSB0aXRsZSBoZWFkZXIgKHBsYW4gbmFtZSArIG1hbmFnZSAvIENUQSBhY3Rpb25zKSBpc1xuXHQgKiByZW5kZXJlZCBpbnRvIHRoaXMgY2FsbGVyLW93bmVkIGNvbnRhaW5lciBpbnN0ZWFkIG9mIGlubGluZSBhdCB0aGUgdG9wXG5cdCAqIG9mIHRoZSBkYXNoYm9hcmQuIFVzZSB0aGlzIHRvIGVtYmVkIHRoZSB0aXRsZSBoZWFkZXIgaW4gYSBob3N0IGxheW91dFxuXHQgKiB3aXRob3V0IHJlYWNoaW5nIGludG8gdGhlIGRhc2hib2FyZCdzIHByaXZhdGUgRE9NLlxuXHQgKi9cblx0dGl0bGVIZWFkZXJDb250YWluZXI/OiBIVE1MRWxlbWVudDtcblx0LyoqXG5cdCAqIFdoZW4gdHJ1ZSwgdXNlcyBhIGNvbXBhY3QgMngyIGdyaWQgbGF5b3V0IGZvciBxdW90YSBpbmRpY2F0b3JzOlxuXHQgKiBwbGFuIG5hbWUgKyBwZXJjZW50YWdlIG9uIHRoZSB0b3Agcm93LCByZXNldCBkYXRlICsgbGFiZWwgb24gdGhlIGJvdHRvbS5cblx0ICogVGhlIHNlcGFyYXRlIGhlYWRlciAocGxhbiBuYW1lICsgbWFuYWdlIGFjdGlvbikgaXMgbm90IHJlbmRlcmVkLlxuXHQgKi9cblx0Y29tcGFjdFF1b3RhTGF5b3V0PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFdoZW4gcHJvdmlkZWQsIENUQSBidXR0b25zIChNYW5hZ2UgQnVkZ2V0LCBVcGdyYWRlKSBhcmUgcmVuZGVyZWQgaW50b1xuXHQgKiB0aGlzIGNhbGxlci1vd25lZCBjb250YWluZXIgaW5zdGVhZCBvZiB0aGUgZGFzaGJvYXJkIGhlYWRlci4gVXNlIHRoaXNcblx0ICogaW4gY29tcGFjdCBtb2RlIHRvIHBsYWNlIGFjdGlvbiBidXR0b25zIGluIHRoZSBob3N0IGhlYWRlci5cblx0ICovXG5cdGN0YUJ1dHRvbnNDb250YWluZXI/OiBIVE1MRWxlbWVudDtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRTdGF0dXNEYXNoYm9hcmQgZXh0ZW5kcyBEb21XaWRnZXQge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFFVSUNLX1NFVFRJTkdTX0NPTExBUFNFRF9LRVkgPSAnY2hhdFN0YXR1c0Rhc2hib2FyZC5xdWlja1NldHRpbmdzQ29sbGFwc2VkJztcblxuXHRyZWFkb25seSBlbGVtZW50ID0gJCgnZGl2LmNoYXQtc3RhdHVzLWJhci1lbnRyeS10b29sdGlwJyk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkYXRlRm9ybWF0dGVyID0gc2FmZUludGwuRGF0ZVRpbWVGb3JtYXQobGFuZ3VhZ2UsIHsgbW9udGg6ICdzaG9ydCcsIGRheTogJ251bWVyaWMnIH0pO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRpbWVGb3JtYXR0ZXIgPSBzYWZlSW50bC5EYXRlVGltZUZvcm1hdChsYW5ndWFnZSwgeyBob3VyOiAnbnVtZXJpYycsIG1pbnV0ZTogJ251bWVyaWMnIH0pO1xuXHRwcml2YXRlIHJlYWRvbmx5IHF1b3RhUGVyY2VudGFnZUZvcm1hdHRlciA9IHNhZmVJbnRsLk51bWJlckZvcm1hdCh1bmRlZmluZWQsIHsgbWF4aW11bUZyYWN0aW9uRGlnaXRzOiAwLCBtaW5pbXVtRnJhY3Rpb25EaWdpdHM6IDAgfSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcXVvdGFDcmVkaXRzRm9ybWF0dGVyID0gc2FmZUludGwuTnVtYmVyRm9ybWF0KGxhbmd1YWdlLCB7IG1heGltdW1GcmFjdGlvbkRpZ2l0czogMiwgbWluaW11bUZyYWN0aW9uRGlnaXRzOiAwIH0pO1xuXG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJQ2hhdFN0YXR1c0Rhc2hib2FyZE9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVudGl0bGVtZW50U2VydmljZTogQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASUNoYXRTdGF0dXNJdGVtU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTdGF0dXNJdGVtU2VydmljZTogSUNoYXRTdGF0dXNJdGVtU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUlubGluZUNvbXBsZXRpb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGlubGluZUNvbXBsZXRpb25zU2VydmljZTogSUlubGluZUNvbXBsZXRpb25zU2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASURlZmF1bHRBY2NvdW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlZmF1bHRBY2NvdW50U2VydmljZTogSURlZmF1bHRBY2NvdW50U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucmVuZGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcigpOiB2b2lkIHtcblx0XHRjb25zdCB0b2tlbiA9IGNhbmNlbE9uRGlzcG9zZSh0aGlzLl9zdG9yZSk7XG5cblx0XHRjb25zdCB7IGNoYXQsIHByZW1pdW1DaGF0LCBjb21wbGV0aW9ucyB9ID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcztcblx0XHRjb25zdCBoYXNRdW90YXMgPSAhIShjaGF0IHx8IHByZW1pdW1DaGF0KTtcblx0XHRjb25zdCBpc0Fub255bW91c1dpdGhTZW50aW1lbnQgPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuYW5vbnltb3VzICYmIHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuY29tcGxldGVkO1xuXHRcdGNvbnN0IGlzUG9vbGVkUXVvdGFEZXBsZXRlZCA9IHByZW1pdW1DaGF0Py51bmxpbWl0ZWQgJiYgcHJlbWl1bUNoYXQuaGFzUXVvdGEgPT09IGZhbHNlO1xuXHRcdGNvbnN0IGhhc1VzYWdlU2VjdGlvbiA9IGhhc1F1b3RhcyB8fCBpc0Fub255bW91c1dpdGhTZW50aW1lbnQ7XG5cdFx0Y29uc3QgaGFzVmlzaWJsZVVzYWdlQ29udGVudCA9IGNoYXQ/LnVubGltaXRlZCA9PT0gZmFsc2UgfHxcblx0XHRcdHByZW1pdW1DaGF0Py51bmxpbWl0ZWQgPT09IGZhbHNlIHx8XG5cdFx0XHQoIXRoaXMub3B0aW9ucz8uY29tcGFjdFF1b3RhTGF5b3V0ICYmIGNvbXBsZXRpb25zPy51bmxpbWl0ZWQgPT09IGZhbHNlKSB8fFxuXHRcdFx0aXNBbm9ueW1vdXNXaXRoU2VudGltZW50IHx8XG5cdFx0XHRpc1Bvb2xlZFF1b3RhRGVwbGV0ZWQ7XG5cdFx0Y29uc3QgY29udHJpYnV0ZWRFbnRyaWVzID0gWy4uLnRoaXMuY2hhdFN0YXR1c0l0ZW1TZXJ2aWNlLmdldEVudHJpZXMoKV07XG5cdFx0Y29uc3QgaGFzUXVpY2tTZXR0aW5nc0NvbnRlbnQgPVxuXHRcdFx0IXRoaXMub3B0aW9ucz8uZGlzYWJsZUlubGluZVN1Z2dlc3Rpb25zU2V0dGluZ3MgfHxcblx0XHRcdCF0aGlzLm9wdGlvbnM/LmRpc2FibGVNb2RlbFNlbGVjdGlvbiB8fFxuXHRcdFx0IXRoaXMub3B0aW9ucz8uZGlzYWJsZVByb3ZpZGVyT3B0aW9ucyB8fFxuXHRcdFx0IXRoaXMub3B0aW9ucz8uZGlzYWJsZUNvbXBsZXRpb25zU25vb3plO1xuXG5cdFx0Ly8gVGl0bGUgaGVhZGVyIHdpdGggcGxhbiBuYW1lLCBDVEEgYnV0dG9ucywgYW5kIG1hbmFnZSBhY3Rpb25cblx0XHRsZXQgaGVhZGVyQWRkaXRpb25hbFNwZW5kQnV0dG9uOiBCdXR0b24gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGhlYWRlclVwZ3JhZGVCdXR0b246IEJ1dHRvbiB8IHVuZGVmaW5lZDtcblx0XHRpZiAoaGFzVXNhZ2VTZWN0aW9uICYmICF0aGlzLm9wdGlvbnM/LmNvbXBhY3RRdW90YUxheW91dCkge1xuXHRcdFx0Y29uc3QgcGxhbk5hbWUgPSBnZXRDaGF0UGxhbk5hbWUodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50KTtcblx0XHRcdGNvbnN0IGhlYWRlckhvc3QgPSB0aGlzLm9wdGlvbnM/LnRpdGxlSGVhZGVyQ29udGFpbmVyID8/IHRoaXMuZWxlbWVudDtcblx0XHRcdGNvbnN0IGhlYWRlciA9IHRoaXMucmVuZGVySGVhZGVyKGhlYWRlckhvc3QsIHRoaXMuX3N0b3JlLCBwbGFuTmFtZSwgdG9BY3Rpb24oe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubWFuYWdlQ29waWxvdCcsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncXVvdGFMYWJlbCcsIFwiTWFuYWdlIENvcGlsb3QgU2V0dGluZ3NcIiksXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdxdW90YVRvb2x0aXAnLCBcIk1hbmFnZSBDb3BpbG90IFNldHRpbmdzXCIpLFxuXHRcdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uc2V0dGluZ3MpLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMucnVuQ29tbWFuZEFuZENsb3NlKCgpID0+IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZSh0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5yZXNvbHZlR2l0SHViVXJsKEdpdEh1YlBhdGhzLmNvcGlsb3RTZXR0aW5ncykpKSksXG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIEFkZCBBZGRpdGlvbmFsIFNwZW5kIC8gVXBncmFkZSBidXR0b25zIHRvIHRoZSBoZWFkZXJcblx0XHRcdGNvbnN0IGNhbkNvbmZpZ3VyZUFkZGl0aW9uYWxTcGVuZCA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkVEVSB8fCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5Qcm8gfHwgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuUHJvUGx1cyB8fCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5NYXg7XG5cdFx0XHRjb25zdCBzaG93VXBncmFkZSA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMuY2FuVXBncmFkZVBsYW4gPz8gZmFsc2U7XG5cblx0XHRcdGNvbnN0IGFjdGlvbkJhckVsZW1lbnQgPSBoZWFkZXIubGFzdEVsZW1lbnRDaGlsZDtcblxuXHRcdFx0aWYgKGNhbkNvbmZpZ3VyZUFkZGl0aW9uYWxTcGVuZCkge1xuXHRcdFx0XHRoZWFkZXJBZGRpdGlvbmFsU3BlbmRCdXR0b24gPSB0aGlzLl9zdG9yZS5hZGQobmV3IEJ1dHRvbihoZWFkZXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgaG92ZXJEZWxlZ2F0ZTogbmF0aXZlSG92ZXJEZWxlZ2F0ZSwgc2Vjb25kYXJ5OiB0cnVlIH0pKTtcblx0XHRcdFx0aGVhZGVyQWRkaXRpb25hbFNwZW5kQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnaGVhZGVyLWN0YS1idXR0b24nKTtcblx0XHRcdFx0aGVhZGVyQWRkaXRpb25hbFNwZW5kQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ21hbmFnZUJ1ZGdldCcsIFwiTWFuYWdlIEJ1ZGdldFwiKTtcblx0XHRcdFx0dGhpcy5fc3RvcmUuYWRkKGhlYWRlckFkZGl0aW9uYWxTcGVuZEJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm1hbmFnZUFkZGl0aW9uYWxTcGVuZCcsIGZyb206ICdjaGF0LXN0YXR1cycgfSk7XG5cdFx0XHRcdFx0dGhpcy5ydW5Db21tYW5kQW5kQ2xvc2UoKCkgPT4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLnJlc29sdmVHaXRIdWJVcmwoR2l0SHViUGF0aHMuYmlsbGluZ0J1ZGdldHMpKSkpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGlmIChhY3Rpb25CYXJFbGVtZW50KSB7XG5cdFx0XHRcdFx0aGVhZGVyLmluc2VydEJlZm9yZShoZWFkZXJBZGRpdGlvbmFsU3BlbmRCdXR0b24uZWxlbWVudCwgYWN0aW9uQmFyRWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHNob3dVcGdyYWRlKSB7XG5cdFx0XHRcdGhlYWRlclVwZ3JhZGVCdXR0b24gPSB0aGlzLl9zdG9yZS5hZGQobmV3IEJ1dHRvbihoZWFkZXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgaG92ZXJEZWxlZ2F0ZTogbmF0aXZlSG92ZXJEZWxlZ2F0ZSB9KSk7XG5cdFx0XHRcdGhlYWRlclVwZ3JhZGVCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdoZWFkZXItY3RhLWJ1dHRvbicpO1xuXHRcdFx0XHRoZWFkZXJVcGdyYWRlQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ3VwZ3JhZGUnLCBcIlVwZ3JhZGVcIik7XG5cdFx0XHRcdHRoaXMuX3N0b3JlLmFkZChoZWFkZXJVcGdyYWRlQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5ydW5Db21tYW5kQW5kQ2xvc2UoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC51cGdyYWRlUGxhbicpKSk7XG5cdFx0XHRcdGlmIChhY3Rpb25CYXJFbGVtZW50KSB7XG5cdFx0XHRcdFx0aGVhZGVyLmluc2VydEJlZm9yZShoZWFkZXJVcGdyYWRlQnV0dG9uLmVsZW1lbnQsIGFjdGlvbkJhckVsZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ1RBIGJ1dHRvbnMgZm9yIGNvbXBhY3QgbW9kZSBcdTIwMTQgcmVuZGVyZWQgaW50byBhIGNhbGxlci1wcm92aWRlZCBjb250YWluZXJcblx0XHRpZiAoaGFzVXNhZ2VTZWN0aW9uICYmIHRoaXMub3B0aW9ucz8uY29tcGFjdFF1b3RhTGF5b3V0ICYmIHRoaXMub3B0aW9ucy5jdGFCdXR0b25zQ29udGFpbmVyKSB7XG5cdFx0XHRjb25zdCBjdGFDb250YWluZXIgPSB0aGlzLm9wdGlvbnMuY3RhQnV0dG9uc0NvbnRhaW5lcjtcblx0XHRcdGNvbnN0IGNhbkNvbmZpZ3VyZUFkZGl0aW9uYWxTcGVuZCA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkVEVSB8fCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5Qcm8gfHwgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuUHJvUGx1cyB8fCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5NYXg7XG5cdFx0XHRjb25zdCBzaG93VXBncmFkZSA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMuY2FuVXBncmFkZVBsYW4gPz8gZmFsc2U7XG5cblx0XHRcdGlmIChjYW5Db25maWd1cmVBZGRpdGlvbmFsU3BlbmQpIHtcblx0XHRcdFx0aGVhZGVyQWRkaXRpb25hbFNwZW5kQnV0dG9uID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBCdXR0b24oY3RhQ29udGFpbmVyLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIGhvdmVyRGVsZWdhdGU6IG5hdGl2ZUhvdmVyRGVsZWdhdGUsIHNlY29uZGFyeTogdHJ1ZSB9KSk7XG5cdFx0XHRcdGhlYWRlckFkZGl0aW9uYWxTcGVuZEJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdtYW5hZ2VCdWRnZXQnLCBcIk1hbmFnZSBCdWRnZXRcIik7XG5cdFx0XHRcdHRoaXMuX3N0b3JlLmFkZChoZWFkZXJBZGRpdGlvbmFsU3BlbmRCdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5tYW5hZ2VBZGRpdGlvbmFsU3BlbmQnLCBmcm9tOiAnY2hhdC1zdGF0dXMnIH0pO1xuXHRcdFx0XHRcdHRoaXMucnVuQ29tbWFuZEFuZENsb3NlKCgpID0+IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZSh0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5yZXNvbHZlR2l0SHViVXJsKEdpdEh1YlBhdGhzLmJpbGxpbmdCdWRnZXRzKSkpKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2hvd1VwZ3JhZGUpIHtcblx0XHRcdFx0aGVhZGVyVXBncmFkZUJ1dHRvbiA9IHRoaXMuX3N0b3JlLmFkZChuZXcgQnV0dG9uKGN0YUNvbnRhaW5lciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBob3ZlckRlbGVnYXRlOiBuYXRpdmVIb3ZlckRlbGVnYXRlIH0pKTtcblx0XHRcdFx0aGVhZGVyVXBncmFkZUJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCd1cGdyYWRlJywgXCJVcGdyYWRlXCIpO1xuXHRcdFx0XHR0aGlzLl9zdG9yZS5hZGQoaGVhZGVyVXBncmFkZUJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMucnVuQ29tbWFuZEFuZENsb3NlKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQudXBncmFkZVBsYW4nKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENvbXBhY3QgbW9kZSBjbGFzcyBmb3IgQ1NTIHRhcmdldGluZ1xuXHRcdGlmICh0aGlzLm9wdGlvbnM/LmNvbXBhY3RRdW90YUxheW91dCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NvbXBhY3QnKTtcblx0XHR9XG5cblx0XHQvLyBBbHdheXMgdHJpZ2dlciBhIGZyZXNoIHF1b3RhIGZldGNoIHdoZW4gdGhlIGRhc2hib2FyZCBvcGVuc1xuXHRcdGNvbnN0IHVwZGF0ZVByb21pc2UgPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UudXBkYXRlKHRva2VuKTtcblxuXHRcdC8vIFVzYWdlIHNlY3Rpb24gXHUyMDE0IGFsd2F5cyBzaG93biBpbmxpbmVcblx0XHRpZiAoaGFzVmlzaWJsZVVzYWdlQ29udGVudCkge1xuXHRcdFx0dGhpcy5yZW5kZXJVc2FnZUNvbnRlbnQodGhpcy5lbGVtZW50LCB0b2tlbiwgaGVhZGVyQWRkaXRpb25hbFNwZW5kQnV0dG9uLCBoZWFkZXJVcGdyYWRlQnV0dG9uLCB1cGRhdGVQcm9taXNlKTtcblx0XHR9XG5cblx0XHQvLyBQcmVtaXVtIGNoYXQgaW5jbHVkZWQgaW5kaWNhdG9yIChzaG93biB3aGVuIHByZW1pdW0gY2hhdCBpcyB1bmxpbWl0ZWQpXG5cdFx0Y29uc3QgaGFzUHJlbWl1bVVubGltaXRlZCA9ICEhcHJlbWl1bUNoYXQ/LnVubGltaXRlZDtcblx0XHRjb25zdCBjcmVkaXRzVXNlZCA9IGhhc1ByZW1pdW1VbmxpbWl0ZWQgJiYgIWlzUG9vbGVkUXVvdGFEZXBsZXRlZCA/IHByZW1pdW1DaGF0Py5jcmVkaXRzVXNlZCA6IHVuZGVmaW5lZDtcblx0XHRpZiAodHlwZW9mIGNyZWRpdHNVc2VkID09PSAnbnVtYmVyJykge1xuXHRcdFx0dGhpcy5jcmVhdGVDcmVkaXRzVXNlZEluZGljYXRvcih0aGlzLmVsZW1lbnQsIGNyZWRpdHNVc2VkLCBwcmVtaXVtQ2hhdD8ucmVzZXRBdCk7XG5cdFx0fSBlbHNlIGlmIChoYXNQcmVtaXVtVW5saW1pdGVkKSB7XG5cdFx0XHRjb25zdCBpbmNsdWRlZFRpdGxlID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcy51c2FnZUJhc2VkQmlsbGluZ1xuXHRcdFx0XHQ/IGxvY2FsaXplKCdpbmNsdWRlZFRpdGxlVEJCJywgXCJDcmVkaXRzXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2luY2x1ZGVkVGl0bGUnLCBcIlByZW1pdW0gUmVxdWVzdHNcIik7XG5cdFx0XHRjb25zdCBnZXRJbmNsdWRlZERlc2NyaXB0aW9uID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAoaXNQb29sZWRRdW90YURlcGxldGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGNvbXBhY3Q6IGxvY2FsaXplKCdwcmVtaXVtTGltaXRSZWFjaGVkQ29tcGFjdCcsIFwiezB9IGxpbWl0IHJlYWNoZWQuXCIsIGluY2x1ZGVkVGl0bGUpLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogbG9jYWxpemUoJ3ByZW1pdW1MaW1pdFJlYWNoZWQnLCBcIk9yZ2FuaXphdGlvbiBsaW1pdCByZWFjaGVkLlwiKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGNvbXBhY3Q6IGxvY2FsaXplKCdwcmVtaXVtSW5jbHVkZWRDb21wYWN0JywgXCJ7MH0gaW5jbHVkZWQgd2l0aCB5b3VyIG9yZ2FuaXphdGlvbidzIHBsYW4uXCIsIGluY2x1ZGVkVGl0bGUpLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGxvY2FsaXplKCdwcmVtaXVtSW5jbHVkZWQnLCBcIkluY2x1ZGVkIHdpdGggeW91ciBvcmdhbml6YXRpb24ncyBwbGFuLlwiKVxuXHRcdFx0XHR9O1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGluY2x1ZGVkRGVzY3JpcHRpb24gPSBnZXRJbmNsdWRlZERlc2NyaXB0aW9uKCk7XG5cdFx0XHRjb25zdCBpbmNsdWRlZENvbnRhaW5lciA9IHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCgkKCdkaXYucXVvdGEtaW5kaWNhdG9yLmluY2x1ZGVkJykpO1xuXHRcdFx0aWYgKHRoaXMub3B0aW9ucz8uY29tcGFjdFF1b3RhTGF5b3V0KSB7XG5cdFx0XHRcdGNvbnN0IHBsYW5OYW1lID0gZ2V0Q2hhdFBsYW5OYW1lKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCk7XG5cdFx0XHRcdGluY2x1ZGVkQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NvbXBhY3QnKTtcblx0XHRcdFx0aW5jbHVkZWRDb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnZGl2LnF1b3RhLXRpdGxlJywgdW5kZWZpbmVkLCBwbGFuTmFtZSkpO1xuXHRcdFx0XHRpbmNsdWRlZENvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCdkaXYuZGVzY3JpcHRpb24nLCB1bmRlZmluZWQsIGluY2x1ZGVkRGVzY3JpcHRpb24uY29tcGFjdCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aW5jbHVkZWRDb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnZGl2LnF1b3RhLXRpdGxlJywgdW5kZWZpbmVkLCBpbmNsdWRlZFRpdGxlKSk7XG5cdFx0XHRcdGluY2x1ZGVkQ29udGFpbmVyLmFwcGVuZENoaWxkKCQoJ2Rpdi5kZXNjcmlwdGlvbicsIHVuZGVmaW5lZCwgaW5jbHVkZWREZXNjcmlwdGlvbi5kZWZhdWx0KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTmV4dCBFZGl0IFN1Z2dlc3Rpb25zIFx1MjAxNCBjb2xsYXBzaWJsZSByZWdpb25cblx0XHRpZiAoaGFzUXVpY2tTZXR0aW5nc0NvbnRlbnQpIHtcblx0XHRcdGNvbnN0IGhhc0NvbnRlbnRBYm92ZSA9IGhhc1VzYWdlU2VjdGlvbiB8fCBoYXNWaXNpYmxlVXNhZ2VDb250ZW50IHx8IGhhc1ByZW1pdW1VbmxpbWl0ZWQ7XG5cdFx0XHR0aGlzLnJlbmRlcklubGluZVN1Z2dlc3Rpb25zU2VjdGlvbihoYXNDb250ZW50QWJvdmUpO1xuXHRcdH1cblxuXHRcdC8vIENvbnRyaWJ1dGVkIHNlY3Rpb25zIChlLmcuIENvZGViYXNlIFNlbWFudGljIEluZGV4KSBcdTIwMTQgZWFjaCBnZXRzIGl0cyBvd24gY29sbGFwc2libGVcblx0XHRpZiAoY29udHJpYnV0ZWRFbnRyaWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMucmVuZGVyQ29udHJpYnV0ZWRTZWN0aW9ucyhjb250cmlidXRlZEVudHJpZXMpO1xuXHRcdH1cblxuXHRcdC8vIE5ldyB0byBDaGF0IC8gU2lnbmVkIG91dFxuXHRcdHRoaXMucmVuZGVyU2V0dXBTZWN0aW9uKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclVzYWdlQ29udGVudChjb250YWluZXI6IEhUTUxFbGVtZW50LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIGhlYWRlckFkZGl0aW9uYWxTcGVuZEJ1dHRvbjogQnV0dG9uIHwgdW5kZWZpbmVkLCBoZWFkZXJVcGdyYWRlQnV0dG9uOiBCdXR0b24gfCB1bmRlZmluZWQsIHVwZGF0ZVByb21pc2U6IFByb21pc2U8dm9pZD4pOiB2b2lkIHtcblx0XHRjb25zdCB7IGNoYXQ6IGNoYXRRdW90YSwgY29tcGxldGlvbnM6IGNvbXBsZXRpb25zUXVvdGEsIHByZW1pdW1DaGF0OiBwcmVtaXVtQ2hhdFF1b3RhIH0gPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzO1xuXHRcdGNvbnN0IGNvbXBhY3QgPSAhIXRoaXMub3B0aW9ucz8uY29tcGFjdFF1b3RhTGF5b3V0O1xuXHRcdGNvbnN0IHBsYW5OYW1lID0gY29tcGFjdCA/IGdldENoYXRQbGFuTmFtZSh0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQpIDogdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGNoYXRRdW90YSB8fCBwcmVtaXVtQ2hhdFF1b3RhIHx8IGNvbXBsZXRpb25zUXVvdGEpIHtcblx0XHRcdGNvbnN0IHJlc2V0TGFiZWwgPSB0aGlzLmZvcm1hdEdsb2JhbFJlc2V0TGFiZWwoKTtcblxuXHRcdFx0Ly8gR2xvYmFsIHF1b3RhIGNhbGxvdXQgKHNob3duIGF0IHRoZSB0b3AsIGJlZm9yZSBxdW90YSBpbmRpY2F0b3JzKVxuXHRcdFx0Y29uc3QgZ2xvYmFsQ2FsbG91dFVwZGF0ZXIgPSB0aGlzLmNyZWF0ZUdsb2JhbFF1b3RhQ2FsbG91dChjb250YWluZXIpO1xuXHRcdFx0Y29uc3QgeyBjYWxsb3V0VmlzaWJsZTogaW5pdGlhbENhbGxvdXRWaXNpYmxlIH0gPSBnbG9iYWxDYWxsb3V0VXBkYXRlcigpO1xuXG5cdFx0XHQvLyBVcGRhdGUgaGVhZGVyIGFkZGl0aW9uYWwgc3BlbmQgYnV0dG9uIHZpc2liaWxpdHkgYmFzZWQgb24gY2FsbG91dFxuXHRcdFx0aWYgKGhlYWRlckFkZGl0aW9uYWxTcGVuZEJ1dHRvbikge1xuXHRcdFx0XHRoZWFkZXJBZGRpdGlvbmFsU3BlbmRCdXR0b24uZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gaW5pdGlhbENhbGxvdXRWaXNpYmxlID8gJycgOiAnbm9uZSc7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVwZGF0ZSBoZWFkZXIgdXBncmFkZSBidXR0b24gdmlzaWJpbGl0eTogaGlkZSB3aGVuIG1hbmFnZSBidWRnZXQgYnV0dG9uIGlzIHZpc2libGVcblx0XHRcdGlmIChoZWFkZXJVcGdyYWRlQnV0dG9uKSB7XG5cdFx0XHRcdGhlYWRlclVwZ3JhZGVCdXR0b24uZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gKGhlYWRlckFkZGl0aW9uYWxTcGVuZEJ1dHRvbiAmJiBpbml0aWFsQ2FsbG91dFZpc2libGUpID8gJ25vbmUnIDogJyc7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBjaGF0UXVvdGFJbmRpY2F0b3I6ICgocXVvdGE6IElRdW90YVNuYXBzaG90IHwgc3RyaW5nKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChjaGF0UXVvdGEgJiYgIWNoYXRRdW90YS51bmxpbWl0ZWQgJiYgKCF0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLnVzYWdlQmFzZWRCaWxsaW5nIHx8IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkZyZWUpKSB7XG5cdFx0XHRcdGNvbnN0IGNoYXRMYWJlbCA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMudXNhZ2VCYXNlZEJpbGxpbmcgJiYgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRnJlZVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NyZWRpdHNMYWJlbCcsIFwiQ3JlZGl0c1wiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2NoYXRzTGFiZWwnLCBcIkNoYXQgbWVzc2FnZXNcIik7XG5cdFx0XHRcdGNoYXRRdW90YUluZGljYXRvciA9IHRoaXMuY3JlYXRlUXVvdGFJbmRpY2F0b3IoY29udGFpbmVyLCBjaGF0UXVvdGEsIGNoYXRMYWJlbCwgcmVzZXRMYWJlbCwgY29tcGFjdCA/IHBsYW5OYW1lIDogdW5kZWZpbmVkKTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHByZW1pdW1DaGF0UXVvdGFJbmRpY2F0b3I6ICgocXVvdGE6IElRdW90YVNuYXBzaG90IHwgc3RyaW5nKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChwcmVtaXVtQ2hhdFF1b3RhICYmICFwcmVtaXVtQ2hhdFF1b3RhLnVubGltaXRlZCAmJiBwcmVtaXVtQ2hhdFF1b3RhLnBlcmNlbnRSZW1haW5pbmcgPj0gMCkge1xuXHRcdFx0XHRjb25zdCBpc1VCQiA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMudXNhZ2VCYXNlZEJpbGxpbmc7XG5cdFx0XHRcdGNvbnN0IHByZW1pdW1DaGF0TGFiZWwgPSBpc1VCQlxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NyZWRpdHNMYWJlbCcsIFwiQ3JlZGl0c1wiKVxuXHRcdFx0XHRcdDogdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcy5hZGRpdGlvbmFsVXNhZ2VFbmFibGVkID8gbG9jYWxpemUoJ2luY2x1ZGVkUHJlbWl1bUNoYXRzTGFiZWwnLCBcIkluY2x1ZGVkIHByZW1pdW0gcmVxdWVzdHNcIikgOiBsb2NhbGl6ZSgncHJlbWl1bUNoYXRzTGFiZWwnLCBcIlByZW1pdW0gcmVxdWVzdHNcIik7XG5cdFx0XHRcdGNvbnN0IHByZW1pdW1DaGF0UmVzZXRMYWJlbCA9IGlzVUJCID8gdGhpcy5mb3JtYXRSZXNldEF0TGFiZWwocHJlbWl1bUNoYXRRdW90YS5yZXNldEF0KSA/PyByZXNldExhYmVsIDogcmVzZXRMYWJlbDtcblx0XHRcdFx0cHJlbWl1bUNoYXRRdW90YUluZGljYXRvciA9IHRoaXMuY3JlYXRlUXVvdGFJbmRpY2F0b3IoY29udGFpbmVyLCBwcmVtaXVtQ2hhdFF1b3RhLCBwcmVtaXVtQ2hhdExhYmVsLCBwcmVtaXVtQ2hhdFJlc2V0TGFiZWwsIGNvbXBhY3QgPyBwbGFuTmFtZSA6IHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFkZGl0aW9uYWwgQnVkZ2V0IGluZGljYXRvciAob3ZlcmFnZSBiYXIsIHNob3duIHdoZW4gb3ZlcmFnZV9lbnRpdGxlbWVudCA+IDApXG5cdFx0XHRsZXQgYWRkaXRpb25hbEJ1ZGdldEluZGljYXRvcjogKChxdW90YTogSVF1b3RhU25hcHNob3QgfCBzdHJpbmcpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGFkZGl0aW9uYWxCdWRnZXRFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGluaXRpYWxPdmVyYWdlRW50aXRsZW1lbnQgPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLmFkZGl0aW9uYWxVc2FnZUVudGl0bGVtZW50ID8/IDA7XG5cdFx0XHRpZiAoaW5pdGlhbE92ZXJhZ2VFbnRpdGxlbWVudCA+IDApIHtcblx0XHRcdFx0Y29uc3Qgb3ZlcmFnZUNvdW50ID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcy5hZGRpdGlvbmFsVXNhZ2VDb3VudCA/PyAwO1xuXHRcdFx0XHRjb25zdCBvdmVyYWdlUGVyY2VudFJlbWFpbmluZyA9IE1hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgKChpbml0aWFsT3ZlcmFnZUVudGl0bGVtZW50IC0gb3ZlcmFnZUNvdW50KSAvIGluaXRpYWxPdmVyYWdlRW50aXRsZW1lbnQpICogMTAwKSk7XG5cdFx0XHRcdGNvbnN0IG92ZXJhZ2VTbmFwc2hvdDogSVF1b3RhU25hcHNob3QgPSB7XG5cdFx0XHRcdFx0cGVyY2VudFJlbWFpbmluZzogb3ZlcmFnZVBlcmNlbnRSZW1haW5pbmcsXG5cdFx0XHRcdFx0dW5saW1pdGVkOiBmYWxzZSxcblx0XHRcdFx0XHRlbnRpdGxlbWVudDogaW5pdGlhbE92ZXJhZ2VFbnRpdGxlbWVudCxcblx0XHRcdFx0XHRxdW90YVJlbWFpbmluZzogTWF0aC5tYXgoMCwgaW5pdGlhbE92ZXJhZ2VFbnRpdGxlbWVudCAtIG92ZXJhZ2VDb3VudCksXG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IGFkZGl0aW9uYWxCdWRnZXRMYWJlbCA9IGxvY2FsaXplKCdhZGRpdGlvbmFsQnVkZ2V0TGFiZWwnLCBcIkFkZGl0aW9uYWwgQnVkZ2V0XCIpO1xuXHRcdFx0XHRhZGRpdGlvbmFsQnVkZ2V0SW5kaWNhdG9yID0gdGhpcy5jcmVhdGVRdW90YUluZGljYXRvcihjb250YWluZXIsIG92ZXJhZ2VTbmFwc2hvdCwgYWRkaXRpb25hbEJ1ZGdldExhYmVsLCByZXNldExhYmVsLCBjb21wYWN0ID8gYWRkaXRpb25hbEJ1ZGdldExhYmVsIDogdW5kZWZpbmVkKTtcblx0XHRcdFx0YWRkaXRpb25hbEJ1ZGdldEVsZW1lbnQgPSBjb250YWluZXIubGFzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcblx0XHRcdFx0Y29uc3QgaXNQcmVtaXVtRXhoYXVzdGVkID0gcHJlbWl1bUNoYXRRdW90YSAmJiBwcmVtaXVtQ2hhdFF1b3RhLnBlcmNlbnRSZW1haW5pbmcgPD0gMDtcblx0XHRcdFx0aWYgKCFpc1ByZW1pdW1FeGhhdXN0ZWQpIHtcblx0XHRcdFx0XHRhZGRpdGlvbmFsQnVkZ2V0RWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtdXRlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGxldCBjb21wbGV0aW9uc1F1b3RhSW5kaWNhdG9yOiAoKHF1b3RhOiBJUXVvdGFTbmFwc2hvdCB8IHN0cmluZykgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBzaG93Q29tcGxldGlvbnMgPSAhY29tcGFjdCAmJiBjb21wbGV0aW9uc1F1b3RhICYmICFjb21wbGV0aW9uc1F1b3RhLnVubGltaXRlZCAmJiBjb21wbGV0aW9uc1F1b3RhLnBlcmNlbnRSZW1haW5pbmcgPj0gMFxuXHRcdFx0XHQmJiAoIXRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMudXNhZ2VCYXNlZEJpbGxpbmcgfHwgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRnJlZSk7XG5cdFx0XHRpZiAoc2hvd0NvbXBsZXRpb25zKSB7XG5cdFx0XHRcdGNvbXBsZXRpb25zUXVvdGFJbmRpY2F0b3IgPSB0aGlzLmNyZWF0ZVF1b3RhSW5kaWNhdG9yKGNvbnRhaW5lciwgY29tcGxldGlvbnNRdW90YSwgbG9jYWxpemUoJ2NvbXBsZXRpb25zTGFiZWwnLCBcIklubGluZSBTdWdnZXN0aW9uc1wiKSwgcmVzZXRMYWJlbCwgY29tcGFjdCA/IHBsYW5OYW1lIDogdW5kZWZpbmVkKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVXBkYXRlIGluZGljYXRvcnMgZnJvbSBjdXJyZW50IHF1b3RhIHN0YXRlXG5cdFx0XHRjb25zdCB1cGRhdGVJbmRpY2F0b3JzID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGNoYXQ6IGNoYXRRdW90YSwgcHJlbWl1bUNoYXQ6IHByZW1pdW1DaGF0UXVvdGEsIGNvbXBsZXRpb25zOiBjb21wbGV0aW9uc1F1b3RhIH0gPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzO1xuXHRcdFx0XHRpZiAoY2hhdFF1b3RhKSB7XG5cdFx0XHRcdFx0Y2hhdFF1b3RhSW5kaWNhdG9yPy4oY2hhdFF1b3RhKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocHJlbWl1bUNoYXRRdW90YSkge1xuXHRcdFx0XHRcdHByZW1pdW1DaGF0UXVvdGFJbmRpY2F0b3I/LihwcmVtaXVtQ2hhdFF1b3RhKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY29tcGxldGlvbnNRdW90YSkge1xuXHRcdFx0XHRcdGNvbXBsZXRpb25zUXVvdGFJbmRpY2F0b3I/Lihjb21wbGV0aW9uc1F1b3RhKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYWRkaXRpb25hbEJ1ZGdldEluZGljYXRvciAmJiBhZGRpdGlvbmFsQnVkZ2V0RWxlbWVudCkge1xuXHRcdFx0XHRcdGNvbnN0IG92ZXJhZ2VFbnRpdGxlbWVudCA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMuYWRkaXRpb25hbFVzYWdlRW50aXRsZW1lbnQgPz8gMDtcblx0XHRcdFx0XHRjb25zdCBvdmVyYWdlQ291bnQgPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLmFkZGl0aW9uYWxVc2FnZUNvdW50ID8/IDA7XG5cdFx0XHRcdFx0aWYgKG92ZXJhZ2VFbnRpdGxlbWVudCA+IDApIHtcblx0XHRcdFx0XHRcdGNvbnN0IG92ZXJhZ2VQZXJjZW50UmVtYWluaW5nID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oMTAwLCAoKG92ZXJhZ2VFbnRpdGxlbWVudCAtIG92ZXJhZ2VDb3VudCkgLyBvdmVyYWdlRW50aXRsZW1lbnQpICogMTAwKSk7XG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsQnVkZ2V0SW5kaWNhdG9yKHtcblx0XHRcdFx0XHRcdFx0cGVyY2VudFJlbWFpbmluZzogb3ZlcmFnZVBlcmNlbnRSZW1haW5pbmcsXG5cdFx0XHRcdFx0XHRcdHVubGltaXRlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdGVudGl0bGVtZW50OiBvdmVyYWdlRW50aXRsZW1lbnQsXG5cdFx0XHRcdFx0XHRcdHF1b3RhUmVtYWluaW5nOiBNYXRoLm1heCgwLCBvdmVyYWdlRW50aXRsZW1lbnQgLSBvdmVyYWdlQ291bnQpLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHByZW1pdW1FeGhhdXN0ZWQgPSBwcmVtaXVtQ2hhdFF1b3RhICYmIHByZW1pdW1DaGF0UXVvdGEucGVyY2VudFJlbWFpbmluZyA8PSAwO1xuXHRcdFx0XHRcdGFkZGl0aW9uYWxCdWRnZXRFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ211dGVkJywgIXByZW1pdW1FeGhhdXN0ZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHsgY2FsbG91dFZpc2libGUgfSA9IGdsb2JhbENhbGxvdXRVcGRhdGVyKCk7XG5cdFx0XHRcdGlmIChoZWFkZXJBZGRpdGlvbmFsU3BlbmRCdXR0b24pIHtcblx0XHRcdFx0XHRoZWFkZXJBZGRpdGlvbmFsU3BlbmRCdXR0b24uZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gY2FsbG91dFZpc2libGUgPyAnJyA6ICdub25lJztcblx0XHRcdFx0XHRoZWFkZXJBZGRpdGlvbmFsU3BlbmRCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnbWFuYWdlQnVkZ2V0JywgXCJNYW5hZ2UgQnVkZ2V0XCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChoZWFkZXJVcGdyYWRlQnV0dG9uKSB7XG5cdFx0XHRcdFx0aGVhZGVyVXBncmFkZUJ1dHRvbi5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAoaGVhZGVyQWRkaXRpb25hbFNwZW5kQnV0dG9uICYmIGNhbGxvdXRWaXNpYmxlKSA/ICdub25lJyA6ICcnO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBVcGRhdGUgb25jZSB3aGVuIHRoZSBpbml0aWFsIGZldGNoIGNvbXBsZXRlc1xuXHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdXBkYXRlUHJvbWlzZTtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHVwZGF0ZUluZGljYXRvcnMoKTtcblx0XHRcdH0pKCk7XG5cblx0XHRcdC8vIFVwZGF0ZSBkeW5hbWljYWxseSB3aGVuIHF1b3RhIGRhdGEgY2hhbmdlcyB3aGlsZSB0aGUgZGFzaGJvYXJkIGlzIG9wZW5cblx0XHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VRdW90YVJlbWFpbmluZygoKSA9PiB1cGRhdGVJbmRpY2F0b3JzKCkpKTtcblx0XHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VRdW90YUV4Y2VlZGVkKCgpID0+IHVwZGF0ZUluZGljYXRvcnMoKSkpO1xuXHRcdH1cblxuXHRcdC8vIEFub255bW91cyBJbmRpY2F0b3Jcblx0XHRlbHNlIGlmICh0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuYW5vbnltb3VzICYmIHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuY29tcGxldGVkKSB7XG5cdFx0XHR0aGlzLmNyZWF0ZVF1b3RhSW5kaWNhdG9yKGNvbnRhaW5lciwgbG9jYWxpemUoJ3F1b3RhTGltaXRlZCcsIFwiTGltaXRlZFwiKSwgbG9jYWxpemUoJ2NoYXRzTGFiZWwnLCBcIkNoYXQgbWVzc2FnZXNcIikpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVySW5saW5lU3VnZ2VzdGlvbnNTZWN0aW9uKGhhc0NvbnRlbnRBYm92ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IG5vbkNvbGxhcHNpYmxlID0gISF0aGlzLm9wdGlvbnM/LmRpc2FibGVRdWlja1NldHRpbmdzQ29sbGFwc2libGU7XG5cdFx0Y29uc3QgY29sbGFwc2VkID0gIW5vbkNvbGxhcHNpYmxlICYmIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihDaGF0U3RhdHVzRGFzaGJvYXJkLlFVSUNLX1NFVFRJTkdTX0NPTExBUFNFRF9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCB0cnVlKTtcblxuXHRcdC8vIENvbXB1dGUgc3RhdHVzIGJhc2VkIG9uIGVmZmVjdGl2ZSBlbmFibGVtZW50IGZvciB0aGUgYWN0aXZlIGVkaXRvcidzIGxhbmd1YWdlXG5cdFx0Y29uc3QgYWN0aXZlTGFuZ3VhZ2VJZCA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yTGFuZ3VhZ2VJZDtcblx0XHRjb25zdCBnZXRTdGF0dXNUZXh0ID0gKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmNhblVzZUNoYXQoKSkge1xuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2lubGluZVN1Z2dlc3Rpb25zRGlzYWJsZWQnLCBcIkRpc2FibGVkXCIpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZW5hYmxlZCA9IGFjdGl2ZUxhbmd1YWdlSWRcblx0XHRcdFx0PyBpc0NvbXBsZXRpb25zRW5hYmxlZCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBhY3RpdmVMYW5ndWFnZUlkKVxuXHRcdFx0XHQ6IGlzQ29tcGxldGlvbnNFbmFibGVkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0cmV0dXJuIGVuYWJsZWRcblx0XHRcdFx0PyBsb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdGlvbnNFbmFibGVkJywgXCJFbmFibGVkXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2lubGluZVN1Z2dlc3Rpb25zRGlzYWJsZWQnLCBcIkRpc2FibGVkXCIpO1xuXHRcdH07XG5cblx0XHRsZXQgZGlzY2xvc3VyZUhlYWRlcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNoZXZyb246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBzdGF0dXNFbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCFub25Db2xsYXBzaWJsZSkge1xuXHRcdFx0ZGlzY2xvc3VyZUhlYWRlciA9IHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCgkKCdidXR0b24uY29sbGFwc2libGUtaGVhZGVyJykpO1xuXHRcdFx0aWYgKCFoYXNDb250ZW50QWJvdmUpIHtcblx0XHRcdFx0ZGlzY2xvc3VyZUhlYWRlci5jbGFzc0xpc3QuYWRkKCduby1ib3JkZXInKTtcblx0XHRcdH1cblx0XHRcdGRpc2Nsb3N1cmVIZWFkZXIuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgU3RyaW5nKCFjb2xsYXBzZWQpKTtcblxuXHRcdFx0ZGlzY2xvc3VyZUhlYWRlci5hcHBlbmRDaGlsZCgkKCdzcGFuLmNvbGxhcHNpYmxlLWxhYmVsJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdGlvbnNUYWInLCBcIklubGluZSBTdWdnZXN0aW9uc1wiKSkpO1xuXG5cdFx0XHRjaGV2cm9uID0gZGlzY2xvc3VyZUhlYWRlci5hcHBlbmRDaGlsZCgkKCdzcGFuLmNvbGxhcHNpYmxlLWNoZXZyb24nKSk7XG5cdFx0XHRjaGV2cm9uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoY29sbGFwc2VkID8gQ29kaWNvbi5jaGV2cm9uUmlnaHQgOiBDb2RpY29uLmNoZXZyb25Eb3duKSk7XG5cblx0XHRcdHN0YXR1c0VsID0gZGlzY2xvc3VyZUhlYWRlci5hcHBlbmRDaGlsZCgkKCdzcGFuLmNvbGxhcHNpYmxlLXN0YXR1cycsIHVuZGVmaW5lZCwgZ2V0U3RhdHVzVGV4dCgpKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29sbGFwc2libGVDb250ZW50ID0gdGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKCQoJ2Rpdi5jb2xsYXBzaWJsZS1jb250ZW50JykpO1xuXHRcdGNvbnN0IGNvbGxhcHNpYmxlSW5uZXIgPSBjb2xsYXBzaWJsZUNvbnRlbnQuYXBwZW5kQ2hpbGQoJCgnZGl2LmNvbGxhcHNpYmxlLWlubmVyJykpO1xuXHRcdGlmIChjb2xsYXBzZWQpIHtcblx0XHRcdGNvbGxhcHNpYmxlQ29udGVudC5jbGFzc0xpc3QuYWRkKCdjb2xsYXBzZWQnKTtcblx0XHRcdGNvbGxhcHNpYmxlSW5uZXIuaW5lcnQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChkaXNjbG9zdXJlSGVhZGVyICYmIGNoZXZyb24pIHtcblx0XHRcdGNvbnN0IHRvZ2dsZSA9ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaXNDb2xsYXBzZWQgPSBjb2xsYXBzaWJsZUNvbnRlbnQuY2xhc3NMaXN0LnRvZ2dsZSgnY29sbGFwc2VkJyk7XG5cdFx0XHRcdGNvbGxhcHNpYmxlSW5uZXIuaW5lcnQgPSBpc0NvbGxhcHNlZDtcblx0XHRcdFx0ZGlzY2xvc3VyZUhlYWRlciEuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgU3RyaW5nKCFpc0NvbGxhcHNlZCkpO1xuXHRcdFx0XHRjaGV2cm9uIS5jbGFzc05hbWUgPSAnY29sbGFwc2libGUtY2hldnJvbic7XG5cdFx0XHRcdGNoZXZyb24hLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoaXNDb2xsYXBzZWQgPyBDb2RpY29uLmNoZXZyb25SaWdodCA6IENvZGljb24uY2hldnJvbkRvd24pKTtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShDaGF0U3RhdHVzRGFzaGJvYXJkLlFVSUNLX1NFVFRJTkdTX0NPTExBUFNFRF9LRVksIGlzQ29sbGFwc2VkLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdH07XG5cblx0XHRcdHRoaXMuX3N0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZGlzY2xvc3VyZUhlYWRlciwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB0b2dnbGUoKSkpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBzdGF0dXMgdGV4dCB3aGVuIGNvbXBsZXRpb25zIHNldHRpbmcgY2hhbmdlc1xuXHRcdGlmIChzdGF0dXNFbCkge1xuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihkZWZhdWx0Q2hhdC5jb21wbGV0aW9uc0VuYWJsZW1lbnRTZXR0aW5nKSkge1xuXHRcdFx0XHRcdHN0YXR1c0VsIS50ZXh0Q29udGVudCA9IGdldFN0YXR1c1RleHQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVySW5saW5lU3VnZ2VzdGlvbnNDb250ZW50KGNvbGxhcHNpYmxlSW5uZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDb250cmlidXRlZFNlY3Rpb25zKGNvbnRyaWJ1dGVkRW50cmllczogQ2hhdFN0YXR1c0VudHJ5W10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgY29udHJpYnV0ZWRFbnRyaWVzKSB7XG5cdFx0XHRjb25zdCBoZWFkZXJMYWJlbCA9IHR5cGVvZiBpdGVtLmxhYmVsID09PSAnc3RyaW5nJyA/IGl0ZW0ubGFiZWwgOiBpdGVtLmxhYmVsLmxhYmVsO1xuXHRcdFx0bGV0IGhlYWRlckxpbmsgPSB0eXBlb2YgaXRlbS5sYWJlbCA9PT0gJ3N0cmluZycgPyB1bmRlZmluZWQgOiBpdGVtLmxhYmVsLmxpbms7XG5cdFx0XHRsZXQgbGlua0Rlc2NyaXB0aW9uID0gdHlwZW9mIGl0ZW0ubGFiZWwgPT09ICdzdHJpbmcnID8gdW5kZWZpbmVkIDogaXRlbS5sYWJlbC5oZWxwVGV4dDtcblx0XHRcdGNvbnN0IHNlY3Rpb24gPSB0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQoJCgnZGl2LmNvbnRyaWJ1dGVkLXNlY3Rpb24nKSk7XG5cblx0XHRcdC8vIFNpbmdsZSBub24tY29sbGFwc2libGUgaGVhZGVyIHJvd1xuXHRcdFx0Y29uc3QgaGVhZGVyID0gc2VjdGlvbi5hcHBlbmRDaGlsZCgkKCdkaXYuY29sbGFwc2libGUtaGVhZGVyLm5vbi1jb2xsYXBzaWJsZScpKTtcblx0XHRcdGhlYWRlci5hcHBlbmRDaGlsZCgkKCdzcGFuLmNvbGxhcHNpYmxlLWxhYmVsJywgdW5kZWZpbmVkLCBoZWFkZXJMYWJlbCkpO1xuXG5cdFx0XHQvLyBJbmZvIGljb24gKHJlcGxhY2VzIGNoZXZyb24pIFx1MjAxNCBzaG93cyBoZWxwVGV4dCBpbiBhIG5lc3RlZCBob3ZlclxuXHRcdFx0aWYgKGxpbmtEZXNjcmlwdGlvbiB8fCBoZWFkZXJMaW5rKSB7XG5cdFx0XHRcdGNvbnN0IGluZm9JY29uID0gaGVhZGVyLmFwcGVuZENoaWxkKCQoJ3NwYW4uY29udHJpYnV0ZWQtaW5mby1pY29uJykpO1xuXHRcdFx0XHRpbmZvSWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uaW5mbykpO1xuXG5cdFx0XHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihpbmZvSWNvbiwgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGhvdmVyQ29udGVudCA9IG5ldyBNYXJrZG93blN0cmluZygnJywgeyBpc1RydXN0ZWQ6IHRydWUgfSk7XG5cdFx0XHRcdFx0aWYgKGxpbmtEZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdFx0aG92ZXJDb250ZW50LmFwcGVuZFRleHQobGlua0Rlc2NyaXB0aW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGhlYWRlckxpbmspIHtcblx0XHRcdFx0XHRcdGlmIChsaW5rRGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRcdFx0aG92ZXJDb250ZW50LmFwcGVuZFRleHQoJyAnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGhvdmVyQ29udGVudC5hcHBlbmRNYXJrZG93bihgWyR7bG9jYWxpemUoJ2xlYXJuTW9yZScsIFwiTGVhcm4gTW9yZVwiKX1dKCR7aGVhZGVyTGlua30pYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IGhvdmVyQ29udGVudCB9O1xuXHRcdFx0XHR9LCB7IHJlZHVjZWREZWxheTogdHJ1ZSB9KSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN0YXR1cyB0ZXh0IChyaWdodC1hbGlnbmVkIHZpYSBtYXJnaW4tbGVmdDogYXV0bylcblx0XHRcdGNvbnN0IHN0YXR1c0VsID0gaGVhZGVyLmFwcGVuZENoaWxkKCQoJ3NwYW4uY29sbGFwc2libGUtc3RhdHVzJykpO1xuXHRcdFx0Y29uc3Qgc3RhdHVzRGlzcG9zYWJsZXMgPSB0aGlzLl9zdG9yZS5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdFx0XHRjb25zdCByZW5kZXJTdGF0dXMgPSAodGV4dDogc3RyaW5nKTogdm9pZCA9PiB7XG5cdFx0XHRcdGNvbnN0IG5ld1N0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRzdGF0dXNEaXNwb3NhYmxlcy52YWx1ZSA9IG5ld1N0b3JlO1xuXHRcdFx0XHR0aGlzLnJlbmRlclRleHRQbHVzKHN0YXR1c0VsLCB0ZXh0LCBuZXdTdG9yZSk7XG5cdFx0XHR9O1xuXHRcdFx0cmVuZGVyU3RhdHVzKGl0ZW0uZGVzY3JpcHRpb24pO1xuXG5cdFx0XHQvLyBTaG93IHRvb2x0aXAgb24gaG92ZXIgb2YgdGhlIHN0YXR1cyB0ZXh0XG5cdFx0XHRsZXQgY3VycmVudFRvb2x0aXAgPSBpdGVtLnRvb2x0aXA7XG5cdFx0XHRpZiAoY3VycmVudFRvb2x0aXApIHtcblx0XHRcdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHN0YXR1c0VsLCAoKSA9PiAoe1xuXHRcdFx0XHRcdGNvbnRlbnQ6IGN1cnJlbnRUb29sdGlwID8/ICcnLFxuXHRcdFx0XHR9KSwgeyByZWR1Y2VkRGVsYXk6IHRydWUgfSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEZXRhaWwgKGFjdGlvbiBsaW5rKSByZW5kZXJlZCBpbmxpbmVcblx0XHRcdGNvbnN0IHNlY3Rpb25EaXNwb3NhYmxlcyA9IHRoaXMuX3N0b3JlLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0XHRjb25zdCBzZWN0aW9uU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRzZWN0aW9uRGlzcG9zYWJsZXMudmFsdWUgPSBzZWN0aW9uU3RvcmU7XG5cblx0XHRcdGxldCBkZXRhaWxFbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoaXRlbS5kZXRhaWwpIHtcblx0XHRcdFx0ZGV0YWlsRWwgPSBzZWN0aW9uLmFwcGVuZENoaWxkKCQoJ2Rpdi5jb250cmlidXRlZC1kZXRhaWwnKSk7XG5cdFx0XHRcdHRoaXMucmVuZGVyVGV4dFBsdXMoZGV0YWlsRWwsIGl0ZW0uZGV0YWlsLCBzZWN0aW9uU3RvcmUpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBMaXN0ZW4gZm9yIHVwZGF0ZXMgdG8gcmUtcmVuZGVyIHN0YXR1cyBhbmQgZGV0YWlsXG5cdFx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5jaGF0U3RhdHVzSXRlbVNlcnZpY2Uub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdGlmIChlLmVudHJ5LmlkID09PSBpdGVtLmlkKSB7XG5cdFx0XHRcdFx0Ly8gVXBkYXRlIHN0YXR1cyBpbiBoZWFkZXJcblx0XHRcdFx0XHRzdGF0dXNFbC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0XHRcdHJlbmRlclN0YXR1cyhlLmVudHJ5LmRlc2NyaXB0aW9uKTtcblx0XHRcdFx0XHRjdXJyZW50VG9vbHRpcCA9IGUuZW50cnkudG9vbHRpcDtcblxuXHRcdFx0XHRcdC8vIFVwZGF0ZSBtdXRhYmxlIGhvdmVyIGNvbnRlbnQgcmVmZXJlbmNlc1xuXHRcdFx0XHRcdGhlYWRlckxpbmsgPSB0eXBlb2YgZS5lbnRyeS5sYWJlbCA9PT0gJ3N0cmluZycgPyB1bmRlZmluZWQgOiBlLmVudHJ5LmxhYmVsLmxpbms7XG5cdFx0XHRcdFx0bGlua0Rlc2NyaXB0aW9uID0gdHlwZW9mIGUuZW50cnkubGFiZWwgPT09ICdzdHJpbmcnID8gdW5kZWZpbmVkIDogZS5lbnRyeS5sYWJlbC5oZWxwVGV4dDtcblxuXHRcdFx0XHRcdC8vIFJlLXJlbmRlciBkZXRhaWwgY29udGVudFxuXHRcdFx0XHRcdGNvbnN0IG5ld1N0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRcdHNlY3Rpb25EaXNwb3NhYmxlcy52YWx1ZSA9IG5ld1N0b3JlO1xuXG5cdFx0XHRcdFx0aWYgKGRldGFpbEVsKSB7XG5cdFx0XHRcdFx0XHRpZiAoZS5lbnRyeS5kZXRhaWwpIHtcblx0XHRcdFx0XHRcdFx0ZGV0YWlsRWwudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdFx0XHRcdFx0dGhpcy5yZW5kZXJUZXh0UGx1cyhkZXRhaWxFbCwgZS5lbnRyeS5kZXRhaWwsIG5ld1N0b3JlKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGRldGFpbEVsLnJlbW92ZSgpO1xuXHRcdFx0XHRcdFx0XHRkZXRhaWxFbCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKGUuZW50cnkuZGV0YWlsKSB7XG5cdFx0XHRcdFx0XHRkZXRhaWxFbCA9IHNlY3Rpb24uYXBwZW5kQ2hpbGQoJCgnZGl2LmNvbnRyaWJ1dGVkLWRldGFpbCcpKTtcblx0XHRcdFx0XHRcdHRoaXMucmVuZGVyVGV4dFBsdXMoZGV0YWlsRWwsIGUuZW50cnkuZGV0YWlsLCBuZXdTdG9yZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTZXR1cFNlY3Rpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgaGFzQnlva01vZGVscyA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5oYXNCeW9rTW9kZWxzO1xuXHRcdGNvbnN0IG5ld1VzZXIgPSBpc05ld1VzZXIodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlKSAmJiAhaGFzQnlva01vZGVscztcblx0XHRjb25zdCBhbm9ueW1vdXNVc2VyID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmFub255bW91cztcblx0XHRjb25zdCBkaXNhYmxlZCA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuZGlzYWJsZWQgfHwgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC51bnRydXN0ZWQ7XG5cdFx0Ly8gS2VlcCB0aGUgU2lnbi1pbiBlbnRyeSB2aXNpYmxlIGV2ZW4gd2hlbiBCWU9LIG1vZGVscyBhcmUgcHJlc2VudCBzbyBhaXItZ2FwcGVkXG5cdFx0Ly8gdXNlcnMgY2FuIHN0aWxsIGF1dGhlbnRpY2F0ZSB0byB1bmxvY2sgdGhlIGZ1bGwgQ29waWxvdCBleHBlcmllbmNlLlxuXHRcdGNvbnN0IHNpZ25lZE91dCA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LlVua25vd247XG5cdFx0aWYgKCEobmV3VXNlciB8fCBzaWduZWRPdXQgfHwgZGlzYWJsZWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKCQoJ2hyJykpO1xuXG5cdFx0bGV0IGRlc2NyaXB0aW9uVGV4dDogc3RyaW5nIHwgTWFya2Rvd25TdHJpbmc7XG5cdFx0bGV0IGRlc2NyaXB0aW9uQ2xhc3MgPSAnLmRlc2NyaXB0aW9uJztcblx0XHRpZiAobmV3VXNlciAmJiBhbm9ueW1vdXNVc2VyKSB7XG5cdFx0XHRkZXNjcmlwdGlvblRleHQgPSBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoeyBrZXk6ICdhY3RpdmVEZXNjcmlwdGlvbkFub255bW91cycsIGNvbW1lbnQ6IFsne0xvY2tlZD1cIl0oezJ9KVwifScsICd7TG9ja2VkPVwiXSh7M30pXCJ9J10gfSwgXCJCeSBjb250aW51aW5nIHdpdGggezB9IENvcGlsb3QsIHlvdSBhZ3JlZSB0byB7MX0ncyBbVGVybXNdKHsyfSkgYW5kIFtQcml2YWN5IFN0YXRlbWVudF0oezN9KVwiLCBkZWZhdWx0Q2hhdC5wcm92aWRlci5kZWZhdWx0Lm5hbWUsIGRlZmF1bHRDaGF0LnByb3ZpZGVyLmRlZmF1bHQubmFtZSwgZGVmYXVsdENoYXQudGVybXNTdGF0ZW1lbnRVcmwsIGRlZmF1bHRDaGF0LnByaXZhY3lTdGF0ZW1lbnRVcmwpLCB7IGlzVHJ1c3RlZDogdHJ1ZSB9KTtcblx0XHRcdGRlc2NyaXB0aW9uQ2xhc3MgPSBgJHtkZXNjcmlwdGlvbkNsYXNzfS50ZXJtc2A7XG5cdFx0fSBlbHNlIGlmIChuZXdVc2VyKSB7XG5cdFx0XHRkZXNjcmlwdGlvblRleHQgPSBsb2NhbGl6ZSgnYWN0aXZhdGVEZXNjcmlwdGlvbicsIFwiU2V0IHVwIENvcGlsb3QgdG8gdXNlIEFJIGZlYXR1cmVzLlwiKTtcblx0XHR9IGVsc2UgaWYgKGFub255bW91c1VzZXIpIHtcblx0XHRcdGRlc2NyaXB0aW9uVGV4dCA9IGxvY2FsaXplKCdlbmFibGVNb3JlRGVzY3JpcHRpb24nLCBcIlNpZ24gaW4gdG8gZW5hYmxlIG1vcmUgQ29waWxvdCBBSSBmZWF0dXJlcy5cIik7XG5cdFx0fSBlbHNlIGlmIChkaXNhYmxlZCkge1xuXHRcdFx0ZGVzY3JpcHRpb25UZXh0ID0gbG9jYWxpemUoJ2VuYWJsZURlc2NyaXB0aW9uJywgXCJFbmFibGUgQ29waWxvdCB0byB1c2UgQUkgZmVhdHVyZXMuXCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkZXNjcmlwdGlvblRleHQgPSBsb2NhbGl6ZSgnc2lnbkluRGVzY3JpcHRpb24nLCBcIlNpZ24gaW4gdG8gdXNlIEdpdEh1YiBDb3BpbG90IEFJIGZlYXR1cmVzLlwiKTtcblx0XHR9XG5cblx0XHRsZXQgYnV0dG9uTGFiZWw6IHN0cmluZztcblx0XHRpZiAobmV3VXNlcikge1xuXHRcdFx0YnV0dG9uTGFiZWwgPSBsb2NhbGl6ZSgnZW5hYmxlQUlGZWF0dXJlcycsIFwiVXNlIEFJIEZlYXR1cmVzXCIpO1xuXHRcdH0gZWxzZSBpZiAoYW5vbnltb3VzVXNlcikge1xuXHRcdFx0YnV0dG9uTGFiZWwgPSBsb2NhbGl6ZSgnZW5hYmxlTW9yZUFJRmVhdHVyZXMnLCBcIkVuYWJsZSBtb3JlIEFJIEZlYXR1cmVzXCIpO1xuXHRcdH0gZWxzZSBpZiAoZGlzYWJsZWQpIHtcblx0XHRcdGJ1dHRvbkxhYmVsID0gbG9jYWxpemUoJ2VuYWJsZUNvcGlsb3RCdXR0b24nLCBcIkVuYWJsZSBBSSBGZWF0dXJlc1wiKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YnV0dG9uTGFiZWwgPSBsb2NhbGl6ZSgnc2lnbkluVG9Vc2VBSUZlYXR1cmVzJywgXCJTaWduIGluIHRvIHVzZSBHaXRIdWIgQ29waWxvdFwiKTtcblx0XHR9XG5cblx0XHRsZXQgY29tbWFuZElkOiBzdHJpbmc7XG5cdFx0aWYgKG5ld1VzZXIgJiYgYW5vbnltb3VzVXNlcikge1xuXHRcdFx0Y29tbWFuZElkID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC50cmlnZ2VyU2V0dXBBbm9ueW1vdXNXaXRob3V0RGlhbG9nJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29tbWFuZElkID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC50cmlnZ2VyU2V0dXAnO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgZGVzY3JpcHRpb25UZXh0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKCQoYGRpdiR7ZGVzY3JpcHRpb25DbGFzc31gLCB1bmRlZmluZWQsIGRlc2NyaXB0aW9uVGV4dCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQoJChgZGl2JHtkZXNjcmlwdGlvbkNsYXNzfWAsIHVuZGVmaW5lZCwgdGhpcy5fc3RvcmUuYWRkKHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKGRlc2NyaXB0aW9uVGV4dCkpLmVsZW1lbnQpKTtcblx0XHR9XG5cblx0XHRjb25zdCBidXR0b24gPSB0aGlzLl9zdG9yZS5hZGQobmV3IEJ1dHRvbih0aGlzLmVsZW1lbnQsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgaG92ZXJEZWxlZ2F0ZTogbmF0aXZlSG92ZXJEZWxlZ2F0ZSB9KSk7XG5cdFx0YnV0dG9uLmxhYmVsID0gYnV0dG9uTGFiZWw7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKGJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMucnVuQ29tbWFuZEFuZENsb3NlKGNvbW1hbmRJZCkpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVySW5saW5lU3VnZ2VzdGlvbnNDb250ZW50KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHQvLyBTZXR0aW5ncyAoZWRpdG9yLXNwZWNpZmljKVxuXHRcdGlmICghdGhpcy5vcHRpb25zPy5kaXNhYmxlSW5saW5lU3VnZ2VzdGlvbnNTZXR0aW5ncykge1xuXHRcdFx0dGhpcy5jcmVhdGVTZXR0aW5ncyhjb250YWluZXIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVycyA9ICghdGhpcy5vcHRpb25zPy5kaXNhYmxlTW9kZWxTZWxlY3Rpb24gfHwgIXRoaXMub3B0aW9ucz8uZGlzYWJsZVByb3ZpZGVyT3B0aW9ucykgPyB0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGluZUNvbXBsZXRpb25zUHJvdmlkZXIuYWxsTm9Nb2RlbCgpIDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gTW9kZWwgU2VsZWN0aW9uIChlZGl0b3Itc3BlY2lmaWMpXG5cdFx0aWYgKCF0aGlzLm9wdGlvbnM/LmRpc2FibGVNb2RlbFNlbGVjdGlvbiAmJiBwcm92aWRlcnMpIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gcHJvdmlkZXJzLmZpbmQocCA9PiBwLm1vZGVsSW5mbyAmJiBwLm1vZGVsSW5mby5tb2RlbHMubGVuZ3RoID4gMCk7XG5cblx0XHRcdGlmIChwcm92aWRlcikge1xuXHRcdFx0XHRjb25zdCBtb2RlbEluZm8gPSBwcm92aWRlci5tb2RlbEluZm8hO1xuXHRcdFx0XHRjb25zdCBjdXJyZW50TW9kZWwgPSBtb2RlbEluZm8ubW9kZWxzLmZpbmQobSA9PiBtLmlkID09PSBtb2RlbEluZm8uY3VycmVudE1vZGVsSWQpO1xuXG5cdFx0XHRcdGlmIChjdXJyZW50TW9kZWwpIHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbENvbnRhaW5lciA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCdkaXYubW9kZWwtc2VsZWN0aW9uJykpO1xuXG5cdFx0XHRcdFx0bW9kZWxDb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnc3Bhbi5tb2RlbC10ZXh0JywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnbW9kZWxMYWJlbCcsIFwiTW9kZWxcIikpKTtcblxuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdE9wdGlvbnMgPSBtb2RlbEluZm8ubW9kZWxzLm1hcChtID0+ICh7IHRleHQ6IG0ubmFtZSB9KSk7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRJbmRleCA9IG1vZGVsSW5mby5tb2RlbHMuZmluZEluZGV4KG0gPT4gbS5pZCA9PT0gbW9kZWxJbmZvLmN1cnJlbnRNb2RlbElkKTtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3RCb3ggPSB0aGlzLl9zdG9yZS5hZGQobmV3IFNlbGVjdEJveChzZWxlY3RPcHRpb25zLCBNYXRoLm1heCgwLCBzZWxlY3RlZEluZGV4KSwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIGRlZmF1bHRTZWxlY3RCb3hTdHlsZXMsIHsgYXJpYUxhYmVsOiBsb2NhbGl6ZSgnc2VsZWN0TW9kZWwnLCBcIlNlbGVjdCBNb2RlbFwiKSwgb3B0aW9uc0FzQ2hpbGRyZW46IHRydWUgfSkpO1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdENvbnRhaW5lciA9IG1vZGVsQ29udGFpbmVyLmFwcGVuZENoaWxkKCQoJ2Rpdi5tb2RlbC1zZWxlY3QtY29udGFpbmVyJykpO1xuXHRcdFx0XHRcdHNlbGVjdEJveC5yZW5kZXIoc2VsZWN0Q29udGFpbmVyKTtcblx0XHRcdFx0XHR0aGlzLl9zdG9yZS5hZGQoc2VsZWN0Qm94Lm9uRGlkU2VsZWN0KGFzeW5jIGUgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRNb2RlbCA9IG1vZGVsSW5mby5tb2RlbHNbZS5pbmRleF07XG5cdFx0XHRcdFx0XHRpZiAoc2VsZWN0ZWRNb2RlbCAmJiBzZWxlY3RlZE1vZGVsLmlkICE9PSBtb2RlbEluZm8uY3VycmVudE1vZGVsSWQgJiYgcHJvdmlkZXIuc2V0TW9kZWxJZCkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBwcm92aWRlci5zZXRNb2RlbElkKHNlbGVjdGVkTW9kZWwuaWQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFByb3ZpZGVyIE9wdGlvbnMgKGVkaXRvci1zcGVjaWZpYylcblx0XHRpZiAoIXRoaXMub3B0aW9ucz8uZGlzYWJsZVByb3ZpZGVyT3B0aW9ucyAmJiBwcm92aWRlcnMpIHtcblx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgcHJvdmlkZXJzKSB7XG5cdFx0XHRcdGlmIChwcm92aWRlci5wcm92aWRlck9wdGlvbnMgJiYgcHJvdmlkZXIucHJvdmlkZXJPcHRpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IG9wdGlvbiBvZiBwcm92aWRlci5wcm92aWRlck9wdGlvbnMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRWYWx1ZSA9IG9wdGlvbi52YWx1ZXMuZmluZCh2ID0+IHYuaWQgPT09IG9wdGlvbi5jdXJyZW50VmFsdWVJZCk7XG5cdFx0XHRcdFx0XHRpZiAoY3VycmVudFZhbHVlKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9wdGlvbkNvbnRhaW5lciA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCdkaXYuc3VnZ2VzdC1vcHRpb24tc2VsZWN0aW9uJykpO1xuXG5cdFx0XHRcdFx0XHRcdG9wdGlvbkNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCdzcGFuLnN1Z2dlc3Qtb3B0aW9uLXRleHQnLCB1bmRlZmluZWQsIG9wdGlvbi5sYWJlbCkpO1xuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IHNlbGVjdE9wdGlvbnMgPSBvcHRpb24udmFsdWVzLm1hcCh2ID0+ICh7IHRleHQ6IHYubGFiZWwgfSkpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzZWxlY3RlZEluZGV4ID0gb3B0aW9uLnZhbHVlcy5maW5kSW5kZXgodiA9PiB2LmlkID09PSBvcHRpb24uY3VycmVudFZhbHVlSWQpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzZWxlY3RCb3ggPSB0aGlzLl9zdG9yZS5hZGQobmV3IFNlbGVjdEJveChzZWxlY3RPcHRpb25zLCBNYXRoLm1heCgwLCBzZWxlY3RlZEluZGV4KSwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIGRlZmF1bHRTZWxlY3RCb3hTdHlsZXMsIHsgYXJpYUxhYmVsOiBsb2NhbGl6ZSgnc2VsZWN0T3B0aW9uJywgXCJTZWxlY3QgezB9XCIsIG9wdGlvbi5sYWJlbCksIG9wdGlvbnNBc0NoaWxkcmVuOiB0cnVlIH0pKTtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2VsZWN0Q29udGFpbmVyID0gb3B0aW9uQ29udGFpbmVyLmFwcGVuZENoaWxkKCQoJ2Rpdi5zdWdnZXN0LW9wdGlvbi1zZWxlY3QtY29udGFpbmVyJykpO1xuXHRcdFx0XHRcdFx0XHRzZWxlY3RCb3gucmVuZGVyKHNlbGVjdENvbnRhaW5lcik7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3N0b3JlLmFkZChzZWxlY3RCb3gub25EaWRTZWxlY3QoYXN5bmMgZSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRWYWx1ZSA9IG9wdGlvbi52YWx1ZXNbZS5pbmRleF07XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHNlbGVjdGVkVmFsdWUgJiYgc2VsZWN0ZWRWYWx1ZS5pZCAhPT0gb3B0aW9uLmN1cnJlbnRWYWx1ZUlkICYmIHByb3ZpZGVyLnNldFByb3ZpZGVyT3B0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRhd2FpdCBwcm92aWRlci5zZXRQcm92aWRlck9wdGlvbihvcHRpb24uaWQsIHNlbGVjdGVkVmFsdWUuaWQpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENvbXBsZXRpb25zIFNub296ZSAoZWRpdG9yLXNwZWNpZmljKVxuXHRcdGlmICghdGhpcy5vcHRpb25zPy5kaXNhYmxlQ29tcGxldGlvbnNTbm9vemUgJiYgdGhpcy5jYW5Vc2VDaGF0KCkpIHtcblx0XHRcdGNvbnN0IHNub296ZSA9IGFwcGVuZChjb250YWluZXIsICQoJ2Rpdi5zbm9vemUtY29tcGxldGlvbnMnKSk7XG5cdFx0XHR0aGlzLmNyZWF0ZUNvbXBsZXRpb25zU25vb3plKHNub296ZSwgbG9jYWxpemUoJ3NldHRpbmdzLnNub296ZScsIFwiU25vb3plXCIpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNhblVzZUNoYXQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uuc2VudGltZW50LmNvbXBsZXRlZCB8fCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uuc2VudGltZW50LmRpc2FibGVkIHx8IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQudW50cnVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIGNoYXQgbm90IGNvbXBsZXRlZCBvciBub3QgZW5hYmxlZFxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5Vbmtub3duIHx8IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkF2YWlsYWJsZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5hbm9ueW1vdXM7IC8vIHNpZ25lZCBvdXQgb3Igbm90LXlldC1zaWduZWQtdXAgdXNlcnMgY2FuIG9ubHkgdXNlIENoYXQgaWYgYW5vbnltb3VzIGFjY2VzcyBpcyBhbGxvd2VkXG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkZyZWUgJiYgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcy5jaGF0Py5wZXJjZW50UmVtYWluaW5nID09PSAwICYmIHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMuY29tcGxldGlvbnM/LnBlcmNlbnRSZW1haW5pbmcgPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gZnJlZSB1c2VyIHdpdGggbm8gcXVvdGEgbGVmdFxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJIZWFkZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgbGFiZWw6IHN0cmluZywgYWN0aW9uPzogSUFjdGlvbik6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBoZWFkZXIgPSBjb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnZGl2LmhlYWRlcicpKTtcblx0XHRoZWFkZXIuYXBwZW5kQ2hpbGQoJCgnc3Bhbi5oZWFkZXItbGFiZWwnLCB1bmRlZmluZWQsIGxhYmVsKSk7XG5cblx0XHRpZiAoYWN0aW9uKSB7XG5cdFx0XHRjb25zdCB0b29sYmFyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb25CYXIoaGVhZGVyLCB7IGhvdmVyRGVsZWdhdGU6IG5hdGl2ZUhvdmVyRGVsZWdhdGUgfSkpO1xuXHRcdFx0dG9vbGJhci5wdXNoKFthY3Rpb25dLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaGVhZGVyO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJUZXh0UGx1cyh0YXJnZXQ6IEhUTUxFbGVtZW50LCB0ZXh0OiBzdHJpbmcsIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IG5vZGUgb2YgcGFyc2VMaW5rZWRUZXh0KHRleHQpLm5vZGVzKSB7XG5cdFx0XHRpZiAodHlwZW9mIG5vZGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbnN0IHBhcnRzID0gcmVuZGVyTGFiZWxXaXRoSWNvbnMobm9kZSk7XG5cdFx0XHRcdHRhcmdldC5hcHBlbmQoLi4ucGFydHMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c3RvcmUuYWRkKG5ldyBMaW5rKHRhcmdldCwgbm9kZSwgdW5kZWZpbmVkLCB0aGlzLmhvdmVyU2VydmljZSwgdGhpcy5vcGVuZXJTZXJ2aWNlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBydW5Db21tYW5kQW5kQ2xvc2UoY29tbWFuZE9yRm46IHN0cmluZyB8ICgoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkKSwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiBjb21tYW5kT3JGbiA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0Y29tbWFuZE9yRm4oLi4uYXJncyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHsgaWQ6IGNvbW1hbmRPckZuLCBmcm9tOiAnY2hhdC1zdGF0dXMnIH0pO1xuXHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kT3JGbiwgLi4uYXJncyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5ob3ZlclNlcnZpY2UuaGlkZUhvdmVyKHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBmb3JtYXRSZXNldEF0TGFiZWwocmVzZXRBdDogbnVtYmVyIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXJlc2V0QXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc2V0RGF0ZSA9IG5ldyBEYXRlKHJlc2V0QXQgKiAxMDAwKTtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3F1b3RhUmVzZXRzQXQnLCBcIlJlc2V0cyB7MH0gYXQgezF9XCIsIHRoaXMuZGF0ZUZvcm1hdHRlci52YWx1ZS5mb3JtYXQocmVzZXREYXRlKSwgdGhpcy50aW1lRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChyZXNldERhdGUpKTtcblx0fVxuXG5cdHByaXZhdGUgZm9ybWF0R2xvYmFsUmVzZXRMYWJlbCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHsgcmVzZXREYXRlLCByZXNldERhdGVIYXNUaW1lIH0gPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzO1xuXHRcdGlmICghcmVzZXREYXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzZXREYXRlSGFzVGltZVxuXHRcdFx0PyBsb2NhbGl6ZSgncXVvdGFSZXNldHNBdCcsIFwiUmVzZXRzIHswfSBhdCB7MX1cIiwgdGhpcy5kYXRlRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChuZXcgRGF0ZShyZXNldERhdGUpKSwgdGhpcy50aW1lRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChuZXcgRGF0ZShyZXNldERhdGUpKSlcblx0XHRcdDogbG9jYWxpemUoJ3F1b3RhUmVzZXRzJywgXCJSZXNldHMgezB9XCIsIHRoaXMuZGF0ZUZvcm1hdHRlci52YWx1ZS5mb3JtYXQobmV3IERhdGUocmVzZXREYXRlKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDcmVkaXRzVXNlZEluZGljYXRvcihjb250YWluZXI6IEhUTUxFbGVtZW50LCBjcmVkaXRzVXNlZDogbnVtYmVyLCByZXNldEF0OiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBpc0NvbXBhY3QgPSAhIXRoaXMub3B0aW9ucz8uY29tcGFjdFF1b3RhTGF5b3V0O1xuXHRcdGNvbnN0IHJlc2V0TGFiZWwgPSB0aGlzLmZvcm1hdFJlc2V0QXRMYWJlbChyZXNldEF0KSA/PyB0aGlzLmZvcm1hdEdsb2JhbFJlc2V0TGFiZWwoKTtcblxuXHRcdGNvbnN0IHJlc2V0VmFsdWUgPSAkKCdzcGFuLnF1b3RhLXJlc2V0Jyk7XG5cdFx0aWYgKHJlc2V0TGFiZWwpIHtcblx0XHRcdHJlc2V0VmFsdWUudGV4dENvbnRlbnQgPSByZXNldExhYmVsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHF1b3RhUGVyY2VudGFnZSA9ICQoJ2Rpdi5xdW90YS1wZXJjZW50YWdlJywgdW5kZWZpbmVkLFxuXHRcdFx0JCgnc3Bhbi5xdW90YS12YWx1ZScsIHVuZGVmaW5lZCwgdGhpcy5xdW90YUNyZWRpdHNGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KGNyZWRpdHNVc2VkKSksXG5cdFx0XHQkKCdzcGFuLnF1b3RhLXZhbHVlLXN1ZmZpeCcsIHVuZGVmaW5lZCwgaXNDb21wYWN0XG5cdFx0XHRcdD8gbG9jYWxpemUoJ3F1b3RhTGFiZWxVc2VkJywgXCJ7MH0gdXNlZFwiLCBsb2NhbGl6ZSgnY3JlZGl0c0xhYmVsJywgXCJDcmVkaXRzXCIpKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjcmVkaXRzVXNlZExhYmVsJywgXCJDcmVkaXRzIFVzZWRcIikpXG5cdFx0KTtcblxuXHRcdGNvbnN0IGluZGljYXRvckVsZW1lbnQgPSAkKCdkaXYucXVvdGEtaW5kaWNhdG9yLmluY2x1ZGVkLmNyZWRpdHMtdXNlZCcsIHVuZGVmaW5lZCxcblx0XHRcdC4uLmlzQ29tcGFjdCA/IFskKCdkaXYucXVvdGEtdGl0bGUnLCB1bmRlZmluZWQsIGdldENoYXRQbGFuTmFtZSh0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQpKV0gOiBbXSxcblx0XHRcdCQoJ2Rpdi5xdW90YS1kZXRhaWxzJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRxdW90YVBlcmNlbnRhZ2UsXG5cdFx0XHRcdHJlc2V0VmFsdWVcblx0XHRcdClcblx0XHQpO1xuXHRcdGlmIChpc0NvbXBhY3QpIHtcblx0XHRcdGluZGljYXRvckVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY29tcGFjdCcpO1xuXHRcdH1cblxuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChpbmRpY2F0b3JFbGVtZW50KTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUXVvdGFJbmRpY2F0b3IoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgcXVvdGE6IElRdW90YVNuYXBzaG90IHwgc3RyaW5nLCBsYWJlbDogc3RyaW5nLCByZXNldExhYmVsPzogc3RyaW5nLCBjb21wYWN0VGl0bGU/OiBzdHJpbmcpOiAocXVvdGE6IElRdW90YVNuYXBzaG90IHwgc3RyaW5nKSA9PiB2b2lkIHtcblx0XHRjb25zdCBpc0NvbXBhY3QgPSAhIWNvbXBhY3RUaXRsZTtcblx0XHRjb25zdCBxdW90YVZhbHVlID0gJCgnc3Bhbi5xdW90YS12YWx1ZScpO1xuXHRcdGNvbnN0IHF1b3RhVmFsdWVUZXh0ID0gaXNDb21wYWN0ID8gcXVvdGFWYWx1ZS5hcHBlbmRDaGlsZCgkKCdzcGFuLnF1b3RhLXZhbHVlLXRleHQnKSkgOiBxdW90YVZhbHVlO1xuXHRcdGNvbnN0IHF1b3RhVmFsdWVTdWZmaXggPSAkKCdzcGFuLnF1b3RhLXZhbHVlLXN1ZmZpeCcpO1xuXHRcdGNvbnN0IHF1b3RhQml0ID0gJCgnZGl2LnF1b3RhLWJpdCcpO1xuXHRcdGNvbnN0IHJlc2V0VmFsdWUgPSAkKCdzcGFuLnF1b3RhLXJlc2V0Jyk7XG5cblx0XHRpZiAocmVzZXRMYWJlbCkge1xuXHRcdFx0cmVzZXRWYWx1ZS50ZXh0Q29udGVudCA9IHJlc2V0TGFiZWw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcXVvdGFQZXJjZW50YWdlID0gJCgnZGl2LnF1b3RhLXBlcmNlbnRhZ2UnLCB1bmRlZmluZWQsXG5cdFx0XHRxdW90YVZhbHVlLFxuXHRcdFx0cXVvdGFWYWx1ZVN1ZmZpeFxuXHRcdCk7XG5cdFx0cXVvdGFQZXJjZW50YWdlLnRhYkluZGV4ID0gaXNDb21wYWN0ID8gLTEgOiAwO1xuXG5cdFx0Y29uc3QgaW5kaWNhdG9yRWxlbWVudCA9ICQoJ2Rpdi5xdW90YS1pbmRpY2F0b3InLCB1bmRlZmluZWQsXG5cdFx0XHQkKCdkaXYucXVvdGEtdGl0bGUnLCB1bmRlZmluZWQsXG5cdFx0XHRcdCQoJ3NwYW4nLCB1bmRlZmluZWQsIGlzQ29tcGFjdCA/IGNvbXBhY3RUaXRsZSA6IGxhYmVsKSxcblx0XHRcdFx0Li4uaXNDb21wYWN0ID8gW10gOiBbcmVzZXRWYWx1ZV1cblx0XHRcdCksXG5cdFx0XHQkKCdkaXYucXVvdGEtZGV0YWlscycsIHVuZGVmaW5lZCxcblx0XHRcdFx0cXVvdGFQZXJjZW50YWdlLFxuXHRcdFx0XHQuLi5pc0NvbXBhY3QgPyBbcmVzZXRWYWx1ZV0gOiBbXVxuXHRcdFx0KSxcblx0XHRcdC4uLmlzQ29tcGFjdCA/IFtdIDogWyQoJ2Rpdi5xdW90YS1iYXInLCB1bmRlZmluZWQsIHF1b3RhQml0KV1cblx0XHQpO1xuXHRcdGlmIChpc0NvbXBhY3QpIHtcblx0XHRcdGluZGljYXRvckVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY29tcGFjdCcpO1xuXHRcdH1cblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoaW5kaWNhdG9yRWxlbWVudCk7XG5cblx0XHRsZXQgY3VycmVudFF1b3RhOiBJUXVvdGFTbmFwc2hvdCB8IHN0cmluZyA9IHF1b3RhO1xuXHRcdGxldCBpc0hvdmVyZWQgPSBmYWxzZTtcblxuXHRcdGNvbnN0IHNob3dQZXJjZW50YWdlID0gKCkgPT4ge1xuXHRcdFx0aWYgKHR5cGVvZiBjdXJyZW50UXVvdGEgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHF1b3RhVmFsdWVUZXh0LnRleHRDb250ZW50ID0gY3VycmVudFF1b3RhO1xuXHRcdFx0XHRxdW90YVZhbHVlU3VmZml4LnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCB1c2VkUGVyY2VudGFnZSA9IE1hdGgubWF4KDAsIDEwMCAtIGN1cnJlbnRRdW90YS5wZXJjZW50UmVtYWluaW5nKTtcblx0XHRcdFx0cXVvdGFWYWx1ZVRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncXVvdGFEaXNwbGF5JywgXCJ7MH0lXCIsIHRoaXMucXVvdGFQZXJjZW50YWdlRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChNYXRoLmZsb29yKHVzZWRQZXJjZW50YWdlKSkpO1xuXHRcdFx0XHRxdW90YVZhbHVlU3VmZml4LnRleHRDb250ZW50ID0gaXNDb21wYWN0XG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgncXVvdGFMYWJlbFVzZWQnLCBcInswfSB1c2VkXCIsIGxhYmVsKVxuXHRcdFx0XHRcdDogYCAke2xvY2FsaXplKCdxdW90YVVzZWQnLCBcInVzZWRcIil9YDtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2hvd0NyZWRpdHMgPSAoKSA9PiB7XG5cdFx0XHRpZiAodHlwZW9mIGN1cnJlbnRRdW90YSAhPT0gJ3N0cmluZycgJiYgY3VycmVudFF1b3RhLmVudGl0bGVtZW50KSB7XG5cdFx0XHRcdGNvbnN0IHRvdGFsID0gY3VycmVudFF1b3RhLmVudGl0bGVtZW50O1xuXHRcdFx0XHRjb25zdCB1c2VkID0gY3VycmVudFF1b3RhLnF1b3RhUmVtYWluaW5nICE9PSB1bmRlZmluZWRcblx0XHRcdFx0XHQ/IHRvdGFsIC0gY3VycmVudFF1b3RhLnF1b3RhUmVtYWluaW5nXG5cdFx0XHRcdFx0OiB0b3RhbCAqICgxMDAgLSBjdXJyZW50UXVvdGEucGVyY2VudFJlbWFpbmluZykgLyAxMDA7XG5cdFx0XHRcdGNvbnN0IHVzZWRGb3JtYXR0ZWQgPSB0aGlzLnF1b3RhQ3JlZGl0c0Zvcm1hdHRlci52YWx1ZS5mb3JtYXQodXNlZCk7XG5cdFx0XHRcdGNvbnN0IHRvdGFsRm9ybWF0dGVkID0gdGhpcy5xdW90YUNyZWRpdHNGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KHRvdGFsKTtcblx0XHRcdFx0cXVvdGFWYWx1ZVRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncXVvdGFDcmVkaXRzRGlzcGxheScsIFwiezB9IC8gezF9XCIsIHVzZWRGb3JtYXR0ZWQsIHRvdGFsRm9ybWF0dGVkKTtcblx0XHRcdFx0cXVvdGFWYWx1ZVN1ZmZpeC50ZXh0Q29udGVudCA9IGlzQ29tcGFjdFxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ3F1b3RhTGFiZWxVc2VkJywgXCJ7MH0gdXNlZFwiLCBsYWJlbClcblx0XHRcdFx0XHQ6IGAgJHtsb2NhbGl6ZSgncXVvdGFVc2VkJywgXCJ1c2VkXCIpfWA7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGhvdmVyVGFyZ2V0ID0gaXNDb21wYWN0ID8gcXVvdGFWYWx1ZVRleHQgOiBxdW90YVBlcmNlbnRhZ2U7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihob3ZlclRhcmdldCwgRXZlbnRUeXBlLk1PVVNFX0VOVEVSLCAoKSA9PiB7IGlzSG92ZXJlZCA9IHRydWU7IHNob3dDcmVkaXRzKCk7IH0pKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGhvdmVyVGFyZ2V0LCBFdmVudFR5cGUuTU9VU0VfTEVBVkUsICgpID0+IHsgaXNIb3ZlcmVkID0gZmFsc2U7IHNob3dQZXJjZW50YWdlKCk7IH0pKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGhvdmVyVGFyZ2V0LCBFdmVudFR5cGUuRk9DVVMsICgpID0+IHsgaXNIb3ZlcmVkID0gdHJ1ZTsgc2hvd0NyZWRpdHMoKTsgfSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaG92ZXJUYXJnZXQsIEV2ZW50VHlwZS5CTFVSLCAoKSA9PiB7IGlzSG92ZXJlZCA9IGZhbHNlOyBzaG93UGVyY2VudGFnZSgpOyB9KSk7XG5cblx0XHRjb25zdCB1cGRhdGUgPSAocXVvdGE6IElRdW90YVNuYXBzaG90IHwgc3RyaW5nKSA9PiB7XG5cdFx0XHRjdXJyZW50UXVvdGEgPSBxdW90YTtcblxuXHRcdFx0bGV0IHVzZWRQZXJjZW50YWdlOiBudW1iZXI7XG5cdFx0XHRpZiAodHlwZW9mIHF1b3RhID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHR1c2VkUGVyY2VudGFnZSA9IDA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR1c2VkUGVyY2VudGFnZSA9IE1hdGgubWF4KDAsIDEwMCAtIHF1b3RhLnBlcmNlbnRSZW1haW5pbmcpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNIb3ZlcmVkKSB7XG5cdFx0XHRcdHNob3dDcmVkaXRzKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzaG93UGVyY2VudGFnZSgpO1xuXHRcdFx0fVxuXHRcdFx0cXVvdGFCaXQuc3R5bGUud2lkdGggPSBgJHt1c2VkUGVyY2VudGFnZX0lYDtcblx0XHR9O1xuXG5cdFx0dXBkYXRlKHF1b3RhKTtcblxuXHRcdHJldHVybiB1cGRhdGU7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUdsb2JhbFF1b3RhQ2FsbG91dChjb250YWluZXI6IEhUTUxFbGVtZW50KTogKCkgPT4geyBjYWxsb3V0VmlzaWJsZTogYm9vbGVhbjsgYWRkaXRpb25hbFVzYWdlRW5hYmxlZDogYm9vbGVhbiB9IHtcblx0XHRjb25zdCBjYWxsb3V0SWNvbiA9ICQoJ3NwYW4uY2FsbG91dC1pY29uJyk7XG5cdFx0Y29uc3QgY2FsbG91dFRleHQgPSAkKCdzcGFuLmNhbGxvdXQtdGV4dCcpO1xuXHRcdGNvbnN0IHF1b3RhQ2FsbG91dCA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCdkaXYucXVvdGEtY2FsbG91dCcsIHVuZGVmaW5lZCwgY2FsbG91dEljb24sIGNhbGxvdXRUZXh0KSk7XG5cdFx0cXVvdGFDYWxsb3V0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHRjb25zdCB1cGRhdGUgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBxdW90YXMgPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzO1xuXHRcdFx0Y29uc3QgYWRkaXRpb25hbFVzYWdlRW5hYmxlZCA9IHF1b3Rhcy5hZGRpdGlvbmFsVXNhZ2VFbmFibGVkID8/IGZhbHNlO1xuXHRcdFx0Y29uc3QgaXNFbnRlcnByaXNlVXNlciA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkVudGVycHJpc2UgfHwgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuQnVzaW5lc3M7XG5cdFx0XHRjb25zdCBpc1VzYWdlQmFzZWRCaWxsaW5nID0gcXVvdGFzLnVzYWdlQmFzZWRCaWxsaW5nID09PSB0cnVlO1xuXG5cdFx0XHQvLyBPbmx5IGNoYXQgcXVvdGFzIGRyaXZlIHRoZSBnbG9iYWwgY2FsbG91dC4gUmVhY2hpbmcgdGhlIGlubGluZVxuXHRcdFx0Ly8gc3VnZ2VzdGlvbnMgKGNvbXBsZXRpb25zKSBsaW1pdCBwYXVzZXMgZ2hvc3QgdGV4dCBvbmx5LCBzbyBpdCBtdXN0XG5cdFx0XHQvLyBub3QgdHJpZ2dlciB0aGUgXCJDb3BpbG90IGlzIHBhdXNlZFwiIG1lc3NhZ2UgcmVzZXJ2ZWQgZm9yIGNoYXQgbGltaXRzLlxuXHRcdFx0Y29uc3QgYWxsUXVvdGFzOiBJUXVvdGFTbmFwc2hvdFtdID0gW107XG5cdFx0XHRpZiAocXVvdGFzLmNoYXQgJiYgIXF1b3Rhcy5jaGF0LnVubGltaXRlZCkgeyBhbGxRdW90YXMucHVzaChxdW90YXMuY2hhdCk7IH1cblx0XHRcdGlmIChxdW90YXMucHJlbWl1bUNoYXQgJiYgIXF1b3Rhcy5wcmVtaXVtQ2hhdC51bmxpbWl0ZWQpIHsgYWxsUXVvdGFzLnB1c2gocXVvdGFzLnByZW1pdW1DaGF0KTsgfVxuXG5cdFx0XHRjb25zdCBtYXhVc2VkUGVyY2VudGFnZSA9IGFsbFF1b3Rhcy5sZW5ndGggPiAwID8gTWF0aC5tYXgoLi4uYWxsUXVvdGFzLm1hcChxID0+IE1hdGgubWF4KDAsIDEwMCAtIHEucGVyY2VudFJlbWFpbmluZykpKSA6IDA7XG5cdFx0XHRjb25zdCBpc1Bvb2xlZFF1b3RhRXhoYXVzdGVkID0gcXVvdGFzLnByZW1pdW1DaGF0Py51bmxpbWl0ZWQgJiYgcXVvdGFzLnByZW1pdW1DaGF0Lmhhc1F1b3RhID09PSBmYWxzZTtcblxuXHRcdFx0Ly8gQnVzaW5lc3MvRW50ZXJwcmlzZTogaGFzUXVvdGEgPT09IGZhbHNlIGlzIHRoZSBhdXRob3JpdGF0aXZlIHNpZ25hbFxuXHRcdFx0Ly8gdGhhdCB0aGUgb3JnIGhhcyBibG9ja2VkIHVzYWdlLCByZWdhcmRsZXNzIG9mIG92ZXJhZ2VzIG9yIHJlbWFpbmluZyBxdW90YS5cblx0XHRcdGlmIChpc0VudGVycHJpc2VVc2VyICYmIGlzUG9vbGVkUXVvdGFFeGhhdXN0ZWQpIHtcblx0XHRcdFx0cXVvdGFDYWxsb3V0LnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdFx0cXVvdGFDYWxsb3V0LmNsYXNzTmFtZSA9ICdxdW90YS1jYWxsb3V0IGluZm8nO1xuXHRcdFx0XHRjYWxsb3V0SWNvbi5jbGFzc05hbWUgPSBgY2FsbG91dC1pY29uICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uaW5mbyl9YDtcblx0XHRcdFx0Y2FsbG91dFRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncXVvdGFCdWRnZXRFeGNlZWRlZEVudGVycHJpc2UnLCBcIllvdXIgb3JnYW5pemF0aW9uIG9yIGVudGVycHJpc2UgaGFzIGV4Y2VlZGVkIGl0cyBDb3BpbG90IGJ1ZGdldC4gQ29udGFjdCB5b3VyIGFkbWluIHRvIHJlc3VtZSB1c2FnZS5cIik7XG5cdFx0XHR9IGVsc2UgaWYgKG1heFVzZWRQZXJjZW50YWdlID49IDEwMCAmJiBhZGRpdGlvbmFsVXNhZ2VFbmFibGVkKSB7XG5cdFx0XHRcdHF1b3RhQ2FsbG91dC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdHF1b3RhQ2FsbG91dC5jbGFzc05hbWUgPSAncXVvdGEtY2FsbG91dCBpbmZvJztcblx0XHRcdFx0Y2FsbG91dEljb24uY2xhc3NOYW1lID0gYGNhbGxvdXQtaWNvbiAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmluZm8pfWA7XG5cdFx0XHRcdGNhbGxvdXRUZXh0LnRleHRDb250ZW50ID0gaXNFbnRlcnByaXNlVXNlclxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ3F1b3RhQWRkaXRpb25hbFVzYWdlQWN0aXZlRW50ZXJwcmlzZScsIFwiQ29waWxvdCBoYXMgcGF1c2VkIGJlY2F1c2UgeW91ciBsaW1pdHMgYXJlIHJlYWNoZWQuIFBsZWFzZSBjb250YWN0IHlvdXIgYWRtaW4gdG8gaW5jcmVhc2UgeW91ciBsaW1pdHMuXCIpXG5cdFx0XHRcdFx0OiBpc1VzYWdlQmFzZWRCaWxsaW5nXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdxdW90YUFkZGl0aW9uYWxVc2FnZUFjdGl2ZScsIFwiQWRkaXRpb25hbCBidWRnZXQgaXMgY29uZmlndXJlZC4gVXNhZ2Ugd2lsbCBjb250aW51ZSB1bnRpbCBsaW1pdHMgcmVzZXQuXCIpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdxdW90YUJ1ZGdldEFjdGl2ZScsIFwiUHJlbWl1bSByZXF1ZXN0IGJ1ZGdldCBpcyBjb25maWd1cmVkLiBVc2FnZSB3aWxsIGNvbnRpbnVlIHVudGlsIGxpbWl0cyByZXNldC5cIik7XG5cdFx0XHR9IGVsc2UgaWYgKG1heFVzZWRQZXJjZW50YWdlID49IDc1ICYmIG1heFVzZWRQZXJjZW50YWdlIDwgMTAwICYmIGFkZGl0aW9uYWxVc2FnZUVuYWJsZWQpIHtcblx0XHRcdFx0cXVvdGFDYWxsb3V0LnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdFx0cXVvdGFDYWxsb3V0LmNsYXNzTmFtZSA9ICdxdW90YS1jYWxsb3V0IGluZm8nO1xuXHRcdFx0XHRjYWxsb3V0SWNvbi5jbGFzc05hbWUgPSBgY2FsbG91dC1pY29uICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uaW5mbyl9YDtcblx0XHRcdFx0Y2FsbG91dFRleHQudGV4dENvbnRlbnQgPSBpc0VudGVycHJpc2VVc2VyXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgncXVvdGFBZGRpdGlvbmFsVXNhZ2VBcHByb2FjaGluZ0VudGVycHJpc2UnLCBcIkNvcGlsb3Qgd2lsbCBwYXVzZSB3aGVuIHlvdXIgbGltaXRzIGFyZSByZWFjaGVkLiBQbGVhc2UgY29udGFjdCB5b3VyIGFkbWluIHRvIGluY3JlYXNlIHlvdXIgbGltaXRzLlwiKVxuXHRcdFx0XHRcdDogaXNVc2FnZUJhc2VkQmlsbGluZ1xuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgncXVvdGFBZGRpdGlvbmFsVXNhZ2VBcHByb2FjaGluZycsIFwiT25jZSB0aGUgbGltaXQgaXMgcmVhY2hlZCwgYWRkaXRpb25hbCBidWRnZXQgd2lsbCBiZSB1c2VkLlwiKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgncXVvdGFCdWRnZXRBcHByb2FjaGluZycsIFwiT25jZSB0aGUgbGltaXQgaXMgcmVhY2hlZCwgcHJlbWl1bSByZXF1ZXN0IGJ1ZGdldCB3aWxsIGJlIHVzZWQuXCIpO1xuXHRcdFx0fSBlbHNlIGlmICgobWF4VXNlZFBlcmNlbnRhZ2UgPj0gMTAwIHx8IGlzUG9vbGVkUXVvdGFFeGhhdXN0ZWQpICYmICFhZGRpdGlvbmFsVXNhZ2VFbmFibGVkKSB7XG5cdFx0XHRcdHF1b3RhQ2FsbG91dC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdHF1b3RhQ2FsbG91dC5jbGFzc05hbWUgPSAncXVvdGEtY2FsbG91dCBpbmZvJztcblx0XHRcdFx0Y2FsbG91dEljb24uY2xhc3NOYW1lID0gYGNhbGxvdXQtaWNvbiAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmluZm8pfWA7XG5cdFx0XHRcdGNhbGxvdXRUZXh0LnRleHRDb250ZW50ID0gaXNFbnRlcnByaXNlVXNlclxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ3F1b3RhUGF1c2VkRW50ZXJwcmlzZScsIFwiQ29waWxvdCBpcyBwYXVzZWQgdW50aWwgdGhlIGxpbWl0IHJlc2V0cy4gQ29udGFjdCB5b3VyIGFkbWluaXN0cmF0b3IgZm9yIG1vcmUgaW5mb3JtYXRpb24uXCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgncXVvdGFQYXVzZWQnLCBcIkNvcGlsb3QgaXMgcGF1c2VkIHVudGlsIHRoZSBsaW1pdCByZXNldHMuXCIpO1xuXHRcdFx0fSBlbHNlIGlmIChtYXhVc2VkUGVyY2VudGFnZSA+PSA3NSAmJiAhYWRkaXRpb25hbFVzYWdlRW5hYmxlZCkge1xuXHRcdFx0XHRxdW90YUNhbGxvdXQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHRxdW90YUNhbGxvdXQuY2xhc3NOYW1lID0gJ3F1b3RhLWNhbGxvdXQgaW5mbyc7XG5cdFx0XHRcdGNhbGxvdXRJY29uLmNsYXNzTmFtZSA9IGBjYWxsb3V0LWljb24gJHtUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5pbmZvKX1gO1xuXHRcdFx0XHRjYWxsb3V0VGV4dC50ZXh0Q29udGVudCA9IGlzRW50ZXJwcmlzZVVzZXJcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdxdW90YVdhcm5pbmdFbnRlcnByaXNlJywgXCJDb3BpbG90IHdpbGwgcGF1c2Ugd2hlbiB0aGUgbGltaXQgaXMgcmVhY2hlZC4gQ29udGFjdCB5b3VyIGFkbWluaXN0cmF0b3IgZm9yIG1vcmUgaW5mb3JtYXRpb24uXCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgncXVvdGFXYXJuaW5nJywgXCJDb3BpbG90IHdpbGwgcGF1c2Ugd2hlbiB0aGUgbGltaXQgaXMgcmVhY2hlZC5cIik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRxdW90YUNhbGxvdXQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHsgY2FsbG91dFZpc2libGU6IHF1b3RhQ2FsbG91dC5zdHlsZS5kaXNwbGF5ICE9PSAnbm9uZScsIGFkZGl0aW9uYWxVc2FnZUVuYWJsZWQgfTtcblx0XHR9O1xuXG5cdFx0dXBkYXRlKCk7XG5cblx0XHRyZXR1cm4gdXBkYXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTZXR0aW5ncyhjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZUlkID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JMYW5ndWFnZUlkO1xuXHRcdGNvbnN0IHNldHRpbmdzID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJ2Rpdi5zZXR0aW5ncycpKTtcblxuXHRcdC8vIC0tLSBJbmxpbmUgU3VnZ2VzdGlvbnNcblx0XHR7XG5cdFx0XHRjb25zdCBnbG9iYWxTZXR0aW5nID0gYXBwZW5kKHNldHRpbmdzLCAkKCdkaXYuc2V0dGluZycpKTtcblx0XHRcdHRoaXMuY3JlYXRlSW5saW5lU3VnZ2VzdGlvbnNTZXR0aW5nKGdsb2JhbFNldHRpbmcsIGxvY2FsaXplKCdzZXR0aW5ncy5jb2RlQ29tcGxldGlvbnMuYWxsRmlsZXMnLCBcIkdob3N0IHRleHQgc3VnZ2VzdGlvbnNcIiksICcqJyk7XG5cblx0XHRcdGNvbnN0IG92ZXJyaWRkZW5IaW50ID0gZ2xvYmFsU2V0dGluZy5hcHBlbmRDaGlsZCgkKCdzcGFuLnNldHRpbmctb3ZlcnJpZGRlbicpKTtcblx0XHRcdGNvbnN0IHVwZGF0ZU92ZXJyaWRkZW5IaW50ID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBvYmogPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+PihkZWZhdWx0Q2hhdC5jb21wbGV0aW9uc0VuYWJsZW1lbnRTZXR0aW5nKTtcblx0XHRcdFx0Y29uc3QgY29uZmlndXJlZFZhbHVlID0gbW9kZUlkID8gdGhpcy5maW5kQ29uZmlndXJlZENvbXBsZXRpb25zVmFsdWUobW9kZUlkKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgaGFzT3ZlcnJpZGUgPSBtb2RlSWQgJiYgY29uZmlndXJlZFZhbHVlICYmIGlzT2JqZWN0KG9iaikgJiYgQm9vbGVhbihjb25maWd1cmVkVmFsdWUudmFsdWVbbW9kZUlkXSkgIT09IEJvb2xlYW4ob2JqWycqJ10pO1xuXHRcdFx0XHRvdmVycmlkZGVuSGludC50ZXh0Q29udGVudCA9IGhhc092ZXJyaWRlID8gbG9jYWxpemUoJ3NldHRpbmdzLm92ZXJyaWRkZW4nLCBcIihvdmVycmlkZGVuKVwiKSA6ICcnO1xuXHRcdFx0fTtcblx0XHRcdHVwZGF0ZU92ZXJyaWRkZW5IaW50KCk7XG5cblx0XHRcdGlmIChtb2RlSWQpIHtcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VTZXR0aW5nID0gYXBwZW5kKHNldHRpbmdzLCAkKCdkaXYuc2V0dGluZycpKTtcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VOYW1lID0gdGhpcy5sYW5ndWFnZVNlcnZpY2UuZ2V0TGFuZ3VhZ2VOYW1lKG1vZGVJZCkgPz8gbW9kZUlkO1xuXHRcdFx0XHR0aGlzLmNyZWF0ZVRyaVN0YXRlTGFuZ3VhZ2VTZXR0aW5nKGxhbmd1YWdlU2V0dGluZywgbG9jYWxpemUoJ3NldHRpbmdzLmNvZGVDb21wbGV0aW9ucy5sYW5ndWFnZScsIFwiR2hvc3QgdGV4dCBzdWdnZXN0aW9ucyBmb3IgezB9XCIsIGxhbmd1YWdlTmFtZSksIG1vZGVJZCwgdXBkYXRlT3ZlcnJpZGRlbkhpbnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIC0tLSBOZXh0IGVkaXQgc3VnZ2VzdGlvbnNcblx0XHR7XG5cdFx0XHRjb25zdCBzZXR0aW5nID0gYXBwZW5kKHNldHRpbmdzLCAkKCdkaXYuc2V0dGluZycpKTtcblx0XHRcdHRoaXMuY3JlYXRlTmV4dEVkaXRTdWdnZXN0aW9uc1NldHRpbmcoc2V0dGluZywgbG9jYWxpemUoJ3NldHRpbmdzLm5leHRFZGl0U3VnZ2VzdGlvbnMnLCBcIk5leHQgZWRpdCBzdWdnZXN0aW9uc1wiKSwgdGhpcy5nZXRDb21wbGV0aW9uc1NldHRpbmdBY2Nlc3Nvcihtb2RlSWQpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNldHRpbmcoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgc2V0dGluZ0lkc1RvUmVFdmFsdWF0ZTogc3RyaW5nW10sIGxhYmVsOiBzdHJpbmcsIGFjY2Vzc29yOiBJU2V0dGluZ3NBY2Nlc3Nvcik6IENoZWNrYm94IHtcblx0XHRjb25zdCBjaGVja2JveCA9IHRoaXMuX3N0b3JlLmFkZChuZXcgQ2hlY2tib3gobGFiZWwsIEJvb2xlYW4oYWNjZXNzb3IucmVhZFNldHRpbmcoKSksIHsgLi4uZGVmYXVsdENoZWNrYm94U3R5bGVzIH0pKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoY2hlY2tib3guZG9tTm9kZSk7XG5cblx0XHRjb25zdCBzZXR0aW5nTGFiZWwgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLnNldHRpbmctbGFiZWwnLCB1bmRlZmluZWQsIGxhYmVsKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKEdlc3R1cmUuYWRkVGFyZ2V0KHNldHRpbmdMYWJlbCkpO1xuXHRcdFtFdmVudFR5cGUuQ0xJQ0ssIFRvdWNoRXZlbnRUeXBlLlRhcF0uZm9yRWFjaChldmVudFR5cGUgPT4ge1xuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihzZXR0aW5nTGFiZWwsIGV2ZW50VHlwZSwgZSA9PiB7XG5cdFx0XHRcdGlmIChjaGVja2JveD8uZW5hYmxlZCkge1xuXHRcdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cblx0XHRcdFx0XHRjaGVja2JveC5jaGVja2VkID0gIWNoZWNrYm94LmNoZWNrZWQ7XG5cdFx0XHRcdFx0YWNjZXNzb3Iud3JpdGVTZXR0aW5nKGNoZWNrYm94LmNoZWNrZWQpO1xuXHRcdFx0XHRcdGNoZWNrYm94LmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZChjaGVja2JveC5vbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHRhY2Nlc3Nvci53cml0ZVNldHRpbmcoY2hlY2tib3guY2hlY2tlZCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKHNldHRpbmdJZHNUb1JlRXZhbHVhdGUuc29tZShpZCA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKGlkKSkpIHtcblx0XHRcdFx0Y2hlY2tib3guY2hlY2tlZCA9IEJvb2xlYW4oYWNjZXNzb3IucmVhZFNldHRpbmcoKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0aWYgKCF0aGlzLmNhblVzZUNoYXQoKSkge1xuXHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0XHRjaGVja2JveC5kaXNhYmxlKCk7XG5cdFx0XHRjaGVja2JveC5jaGVja2VkID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNoZWNrYm94O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVJbmxpbmVTdWdnZXN0aW9uc1NldHRpbmcoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgbGFiZWw6IHN0cmluZywgbW9kZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLmNyZWF0ZVNldHRpbmcoY29udGFpbmVyLCBbZGVmYXVsdENoYXQuY29tcGxldGlvbnNFbmFibGVtZW50U2V0dGluZ10sIGxhYmVsLCB0aGlzLmdldENvbXBsZXRpb25zU2V0dGluZ0FjY2Vzc29yKG1vZGVJZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUcmlTdGF0ZUxhbmd1YWdlU2V0dGluZyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBsYWJlbDogc3RyaW5nLCBtb2RlSWQ6IHN0cmluZywgb25TdGF0ZUNoYW5nZTogKCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IHNldHRpbmdJZCA9IGRlZmF1bHRDaGF0LmNvbXBsZXRpb25zRW5hYmxlbWVudFNldHRpbmc7XG5cblx0XHRjb25zdCBnZXRTdGF0ZSA9ICgpOiBib29sZWFuIHwgJ21peGVkJyA9PiB7XG5cdFx0XHRjb25zdCBjb25maWd1cmVkVmFsdWUgPSB0aGlzLmZpbmRDb25maWd1cmVkQ29tcGxldGlvbnNWYWx1ZShtb2RlSWQpO1xuXHRcdFx0cmV0dXJuIGNvbmZpZ3VyZWRWYWx1ZSA/IEJvb2xlYW4oY29uZmlndXJlZFZhbHVlLnZhbHVlW21vZGVJZF0pIDogJ21peGVkJztcblx0XHR9O1xuXG5cdFx0bGV0IHJlcXVlc3RlZFN0YXRlID0gZ2V0U3RhdGUoKTtcblx0XHRsZXQgcGVuZGluZ1dyaXRlcyA9IDA7XG5cdFx0Y29uc3QgY2hlY2tib3ggPSB0aGlzLl9zdG9yZS5hZGQobmV3IFRyaVN0YXRlQ2hlY2tib3gobGFiZWwsIHJlcXVlc3RlZFN0YXRlLCB7IC4uLmRlZmF1bHRDaGVja2JveFN0eWxlcyB9KSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGNoZWNrYm94LmRvbU5vZGUpO1xuXG5cdFx0Y29uc3Qgc2V0dGluZ0xhYmVsID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnc3Bhbi5zZXR0aW5nLWxhYmVsJywgdW5kZWZpbmVkLCBsYWJlbCkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChHZXN0dXJlLmFkZFRhcmdldChzZXR0aW5nTGFiZWwpKTtcblx0XHRjb25zdCB3cml0ZVNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoKTtcblx0XHRjb25zdCByZW5kZXJTdGF0ZSA9IChzdGF0ZTogYm9vbGVhbiB8ICdtaXhlZCcpID0+IHtcblx0XHRcdHJlcXVlc3RlZFN0YXRlID0gc3RhdGU7XG5cdFx0XHRjaGVja2JveC5jaGVja2VkID0gc3RhdGU7XG5cdFx0XHRjaGVja2JveC5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgc3RhdGUgPT09ICdtaXhlZCcgPyAnbWl4ZWQnIDogU3RyaW5nKHN0YXRlKSk7XG5cdFx0fTtcblx0XHRjb25zdCBnZXROZXh0U3RhdGUgPSAoKSA9PiByZXF1ZXN0ZWRTdGF0ZSA9PT0gdHJ1ZSA/IGZhbHNlIDogcmVxdWVzdGVkU3RhdGUgPT09IGZhbHNlID8gJ21peGVkJyA6IHRydWU7XG5cblx0XHRjb25zdCB3cml0ZVN0YXRlID0gYXN5bmMgKHN0YXRlOiBib29sZWFuIHwgJ21peGVkJykgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlndXJlZFZhbHVlID0gdGhpcy5maW5kQ29uZmlndXJlZENvbXBsZXRpb25zVmFsdWUobW9kZUlkKSA/PyB0aGlzLmZpbmRDb25maWd1cmVkQ29tcGxldGlvbnNWYWx1ZSgpO1xuXHRcdFx0aWYgKHN0YXRlID09PSAnbWl4ZWQnKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgY29uZmlndXJlZFZhbHVlIG9mIHRoaXMuZmluZENvbmZpZ3VyZWRDb21wbGV0aW9uc1ZhbHVlcyhtb2RlSWQpKSB7XG5cdFx0XHRcdFx0Y29uc3QgeyBbbW9kZUlkXTogXywgLi4ucmVzdCB9ID0gY29uZmlndXJlZFZhbHVlLnZhbHVlO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoc2V0dGluZ0lkLCByZXN0LCBjb25maWd1cmVkVmFsdWUudGFyZ2V0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSB7IC4uLmNvbmZpZ3VyZWRWYWx1ZT8udmFsdWUsIFttb2RlSWRdOiBzdGF0ZSB9O1xuXHRcdFx0XHRpZiAoY29uZmlndXJlZFZhbHVlKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShzZXR0aW5nSWQsIHZhbHVlLCBjb25maWd1cmVkVmFsdWUudGFyZ2V0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKHNldHRpbmdJZCwgdmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVuYWJsZWQgPSBpc0NvbXBsZXRpb25zRW5hYmxlZCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBtb2RlSWQpO1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdFNldHRpbmdDaGFuZ2VkRXZlbnQsIENoYXRTZXR0aW5nQ2hhbmdlZENsYXNzaWZpY2F0aW9uPignY2hhdFN0YXR1cy5zZXR0aW5nQ2hhbmdlZCcsIHtcblx0XHRcdFx0c2V0dGluZ0lkZW50aWZpZXI6IHNldHRpbmdJZCxcblx0XHRcdFx0c2V0dGluZ01vZGU6IG1vZGVJZCxcblx0XHRcdFx0c2V0dGluZ0VuYWJsZW1lbnQ6IGVuYWJsZWQgPyAnZW5hYmxlZCcgOiAnZGlzYWJsZWQnXG5cdFx0XHR9KTtcblx0XHR9O1xuXHRcdGNvbnN0IHJlcXVlc3RTdGF0ZUNoYW5nZSA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gZ2V0TmV4dFN0YXRlKCk7XG5cdFx0XHRyZW5kZXJTdGF0ZShzdGF0ZSk7XG5cdFx0XHRwZW5kaW5nV3JpdGVzKys7XG5cdFx0XHR2b2lkIHdyaXRlU2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB3cml0ZVN0YXRlKHN0YXRlKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRwZW5kaW5nV3JpdGVzLS07XG5cdFx0XHRcdH1cblx0XHRcdH0pLmNhdGNoKGVycm9yID0+IHtcblx0XHRcdFx0aWYgKHBlbmRpbmdXcml0ZXMgPT09IDApIHtcblx0XHRcdFx0XHRyZW5kZXJTdGF0ZShnZXRTdGF0ZSgpKTtcblx0XHRcdFx0XHRvblN0YXRlQ2hhbmdlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH0pO1xuXHRcdH07XG5cdFx0cmVuZGVyU3RhdGUocmVxdWVzdGVkU3RhdGUpO1xuXG5cdFx0W0V2ZW50VHlwZS5DTElDSywgVG91Y2hFdmVudFR5cGUuVGFwXS5mb3JFYWNoKGV2ZW50VHlwZSA9PiB7XG5cdFx0XHR0aGlzLl9zdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHNldHRpbmdMYWJlbCwgZXZlbnRUeXBlLCBlID0+IHtcblx0XHRcdFx0aWYgKGNoZWNrYm94Py5lbmFibGVkKSB7XG5cdFx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0XHRyZXF1ZXN0U3RhdGVDaGFuZ2UoKTtcblx0XHRcdFx0XHRjaGVja2JveC5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQoY2hlY2tib3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0cmVuZGVyU3RhdGUocmVxdWVzdGVkU3RhdGUpO1xuXHRcdFx0cmVxdWVzdFN0YXRlQ2hhbmdlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oc2V0dGluZ0lkKSkge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IGdldFN0YXRlKCk7XG5cdFx0XHRcdGlmIChwZW5kaW5nV3JpdGVzID09PSAwIHx8IHN0YXRlID09PSByZXF1ZXN0ZWRTdGF0ZSkge1xuXHRcdFx0XHRcdHJlbmRlclN0YXRlKHN0YXRlKTtcblx0XHRcdFx0XHRvblN0YXRlQ2hhbmdlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoIXRoaXMuY2FuVXNlQ2hhdCgpKSB7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZGlzYWJsZWQnKTtcblx0XHRcdGNoZWNrYm94LmRpc2FibGUoKTtcblx0XHRcdGNoZWNrYm94LmNoZWNrZWQgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGZpbmRDb25maWd1cmVkQ29tcGxldGlvbnNWYWx1ZShtb2RlSWQ/OiBzdHJpbmcpOiB7IHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldDsgdmFsdWU6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+IH0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmZpbmRDb25maWd1cmVkQ29tcGxldGlvbnNWYWx1ZXMobW9kZUlkKVswXTtcblx0fVxuXG5cdHByaXZhdGUgZmluZENvbmZpZ3VyZWRDb21wbGV0aW9uc1ZhbHVlcyhtb2RlSWQ/OiBzdHJpbmcpOiB7IHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldDsgdmFsdWU6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+IH1bXSB7XG5cdFx0Y29uc3QgaW5zcGVjdGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+PihkZWZhdWx0Q2hhdC5jb21wbGV0aW9uc0VuYWJsZW1lbnRTZXR0aW5nKTtcblx0XHRjb25zdCByZXN1bHQ6IHsgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0OyB2YWx1ZTogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gfVtdID0gW107XG5cdFx0Zm9yIChjb25zdCB0YXJnZXQgb2YgY29tcGxldGlvbnNDb25maWd1cmF0aW9uVGFyZ2V0cykge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBnZXRDb25maWdWYWx1ZUluVGFyZ2V0KGluc3BlY3RlZCwgdGFyZ2V0KTtcblx0XHRcdGlmIChpc09iamVjdCh2YWx1ZSkgJiYgKCFtb2RlSWQgfHwgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHZhbHVlLCBtb2RlSWQpKSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7IHRhcmdldCwgdmFsdWUgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbXBsZXRpb25zU2V0dGluZ0FjY2Vzc29yKG1vZGVJZCA9ICcqJyk6IElTZXR0aW5nc0FjY2Vzc29yIHtcblx0XHRjb25zdCBzZXR0aW5nSWQgPSBkZWZhdWx0Q2hhdC5jb21wbGV0aW9uc0VuYWJsZW1lbnRTZXR0aW5nO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlYWRTZXR0aW5nOiAoKSA9PiBpc0NvbXBsZXRpb25zRW5hYmxlZCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBtb2RlSWQpLFxuXHRcdFx0d3JpdGVTZXR0aW5nOiAodmFsdWU6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdFNldHRpbmdDaGFuZ2VkRXZlbnQsIENoYXRTZXR0aW5nQ2hhbmdlZENsYXNzaWZpY2F0aW9uPignY2hhdFN0YXR1cy5zZXR0aW5nQ2hhbmdlZCcsIHtcblx0XHRcdFx0XHRzZXR0aW5nSWRlbnRpZmllcjogc2V0dGluZ0lkLFxuXHRcdFx0XHRcdHNldHRpbmdNb2RlOiBtb2RlSWQsXG5cdFx0XHRcdFx0c2V0dGluZ0VuYWJsZW1lbnQ6IHZhbHVlID8gJ2VuYWJsZWQnIDogJ2Rpc2FibGVkJ1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRsZXQgcmVzdWx0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxSZWNvcmQ8c3RyaW5nLCBib29sZWFuPj4oc2V0dGluZ0lkKTtcblx0XHRcdFx0aWYgKCFpc09iamVjdChyZXN1bHQpKSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKHNldHRpbmdJZCwgeyAuLi5yZXN1bHQsIFttb2RlSWRdOiB2YWx1ZSB9KTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVOZXh0RWRpdFN1Z2dlc3Rpb25zU2V0dGluZyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBsYWJlbDogc3RyaW5nLCBjb21wbGV0aW9uc1NldHRpbmdBY2Nlc3NvcjogSVNldHRpbmdzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBuZXNTZXR0aW5nSWQgPSBkZWZhdWx0Q2hhdC5uZXh0RWRpdFN1Z2dlc3Rpb25zU2V0dGluZztcblx0XHRjb25zdCBjb21wbGV0aW9uc1NldHRpbmdJZCA9IGRlZmF1bHRDaGF0LmNvbXBsZXRpb25zRW5hYmxlbWVudFNldHRpbmc7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblxuXHRcdGNvbnN0IGNoZWNrYm94ID0gdGhpcy5jcmVhdGVTZXR0aW5nKGNvbnRhaW5lciwgW25lc1NldHRpbmdJZCwgY29tcGxldGlvbnNTZXR0aW5nSWRdLCBsYWJlbCwge1xuXHRcdFx0cmVhZFNldHRpbmc6ICgpID0+IGNvbXBsZXRpb25zU2V0dGluZ0FjY2Vzc29yLnJlYWRTZXR0aW5nKCkgJiYgdGhpcy50ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihyZXNvdXJjZSwgbmVzU2V0dGluZ0lkKSxcblx0XHRcdHdyaXRlU2V0dGluZzogKHZhbHVlOiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRTZXR0aW5nQ2hhbmdlZEV2ZW50LCBDaGF0U2V0dGluZ0NoYW5nZWRDbGFzc2lmaWNhdGlvbj4oJ2NoYXRTdGF0dXMuc2V0dGluZ0NoYW5nZWQnLCB7XG5cdFx0XHRcdFx0c2V0dGluZ0lkZW50aWZpZXI6IG5lc1NldHRpbmdJZCxcblx0XHRcdFx0XHRzZXR0aW5nRW5hYmxlbWVudDogdmFsdWUgPyAnZW5hYmxlZCcgOiAnZGlzYWJsZWQnXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJldHVybiB0aGlzLnRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKHJlc291cmNlLCBuZXNTZXR0aW5nSWQsIHZhbHVlKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIGVuYWJsZW1lbnQgb2YgTkVTIGRlcGVuZHMgb24gY29tcGxldGlvbnMgc2V0dGluZ1xuXHRcdC8vIHNvIHdlIGhhdmUgdG8gdXBkYXRlIG91ciBjaGVja2JveCBzdGF0ZSBhY2NvcmRpbmdseVxuXHRcdGlmICghY29tcGxldGlvbnNTZXR0aW5nQWNjZXNzb3IucmVhZFNldHRpbmcoKSkge1xuXHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0XHRjaGVja2JveC5kaXNhYmxlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oY29tcGxldGlvbnNTZXR0aW5nSWQpKSB7XG5cdFx0XHRcdGlmIChjb21wbGV0aW9uc1NldHRpbmdBY2Nlc3Nvci5yZWFkU2V0dGluZygpICYmIHRoaXMuY2FuVXNlQ2hhdCgpKSB7XG5cdFx0XHRcdFx0Y2hlY2tib3guZW5hYmxlKCk7XG5cdFx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2Rpc2FibGVkJyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y2hlY2tib3guZGlzYWJsZSgpO1xuXHRcdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdkaXNhYmxlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDb21wbGV0aW9uc1Nub296ZShjb250YWluZXI6IEhUTUxFbGVtZW50LCBsYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgaXNFbmFibGVkID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29tcGxldGlvbnNFbmFibGVkID0gaXNDb21wbGV0aW9uc0VuYWJsZWQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCBjb21wbGV0aW9uc0VuYWJsZWRBY3RpdmVMYW5ndWFnZSA9IGlzQ29tcGxldGlvbnNFbmFibGVkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yTGFuZ3VhZ2VJZCk7XG5cdFx0XHRyZXR1cm4gY29tcGxldGlvbnNFbmFibGVkIHx8IGNvbXBsZXRpb25zRW5hYmxlZEFjdGl2ZUxhbmd1YWdlO1xuXHRcdH07XG5cblx0XHRjb25zdCBidXR0b24gPSB0aGlzLl9zdG9yZS5hZGQobmV3IEJ1dHRvbihjb250YWluZXIsIHsgZGlzYWJsZWQ6ICFpc0VuYWJsZWQoKSwgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgaG92ZXJEZWxlZ2F0ZTogbmF0aXZlSG92ZXJEZWxlZ2F0ZSwgc2Vjb25kYXJ5OiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IHRpbWVyRGlzcGxheSA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCdzcGFuLnNub296ZS1sYWJlbCcpKTtcblxuXHRcdGNvbnN0IGFjdGlvbkJhciA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCdkaXYuc25vb3plLWFjdGlvbi1iYXInKSk7XG5cdFx0Y29uc3QgdG9vbGJhciA9IHRoaXMuX3N0b3JlLmFkZChuZXcgQWN0aW9uQmFyKGFjdGlvbkJhciwgeyBob3ZlckRlbGVnYXRlOiBuYXRpdmVIb3ZlckRlbGVnYXRlIH0pKTtcblx0XHRjb25zdCBjYW5jZWxBY3Rpb24gPSB0b0FjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2FuY2VsU25vb3plU3RhdHVzQmFyTGluaycsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NhbmNlbFNub296ZScsIFwiQ2FuY2VsIFNub296ZVwiKSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5pbmxpbmVDb21wbGV0aW9uc1NlcnZpY2UuY2FuY2VsU25vb3plKCksXG5cdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uc3RvcENpcmNsZSlcblx0XHR9KTtcblxuXHRcdGNvbnN0IHVwZGF0ZSA9IChpc0VuYWJsZWQ6IGJvb2xlYW4pID0+IHtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsICFpc0VuYWJsZWQpO1xuXHRcdFx0dG9vbGJhci5jbGVhcigpO1xuXG5cdFx0XHRjb25zdCB0aW1lTGVmdE1zID0gdGhpcy5pbmxpbmVDb21wbGV0aW9uc1NlcnZpY2Uuc25vb3plVGltZUxlZnQ7XG5cdFx0XHRpZiAoIWlzRW5hYmxlZCB8fCB0aW1lTGVmdE1zIDw9IDApIHtcblx0XHRcdFx0dGltZXJEaXNwbGF5LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NvbXBsZXRpb25zLnNub296ZTVtaW51dGVzVGl0bGUnLCBcIkhpZGUgc3VnZ2VzdGlvbnMgZm9yIDUgbWluXCIpO1xuXHRcdFx0XHR0aW1lckRpc3BsYXkudGl0bGUgPSAnJztcblx0XHRcdFx0YnV0dG9uLmxhYmVsID0gbGFiZWw7XG5cdFx0XHRcdGJ1dHRvbi5zZXRUaXRsZShsb2NhbGl6ZSgnY29tcGxldGlvbnMuc25vb3plNW1pbnV0ZXMnLCBcIkhpZGUgaW5saW5lIHN1Z2dlc3Rpb25zIGZvciA1IG1pblwiKSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0aW1lTGVmdFNlY29uZHMgPSBNYXRoLmNlaWwodGltZUxlZnRNcyAvIDEwMDApO1xuXHRcdFx0Y29uc3QgbWludXRlcyA9IE1hdGguZmxvb3IodGltZUxlZnRTZWNvbmRzIC8gNjApO1xuXHRcdFx0Y29uc3Qgc2Vjb25kcyA9IHRpbWVMZWZ0U2Vjb25kcyAlIDYwO1xuXG5cdFx0XHR0aW1lckRpc3BsYXkudGV4dENvbnRlbnQgPSBgJHttaW51dGVzfToke3NlY29uZHMgPCAxMCA/ICcwJyA6ICcnfSR7c2Vjb25kc30gJHtsb2NhbGl6ZSgnY29tcGxldGlvbnMucmVtYWluaW5nVGltZScsIFwicmVtYWluaW5nXCIpfWA7XG5cdFx0XHR0aW1lckRpc3BsYXkudGl0bGUgPSBsb2NhbGl6ZSgnY29tcGxldGlvbnMuc25vb3plVGltZURlc2NyaXB0aW9uJywgXCJJbmxpbmUgc3VnZ2VzdGlvbnMgYXJlIGhpZGRlbiBmb3IgdGhlIHJlbWFpbmluZyBkdXJhdGlvblwiKTtcblx0XHRcdGJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdjb21wbGV0aW9ucy5wbHVzNW1pbicsIFwiKzUgbWluXCIpO1xuXHRcdFx0YnV0dG9uLnNldFRpdGxlKGxvY2FsaXplKCdjb21wbGV0aW9ucy5zbm9vemVBZGRpdGlvbmFsNW1pbnV0ZXMnLCBcIlNub296ZSBhZGRpdGlvbmFsIDUgbWluXCIpKTtcblx0XHRcdHRvb2xiYXIucHVzaChbY2FuY2VsQWN0aW9uXSwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXG5cdFx0Ly8gVXBkYXRlIGV2ZXJ5IHNlY29uZCBpZiB0aGVyZSdzIHRpbWUgcmVtYWluaW5nXG5cdFx0Y29uc3QgdGltZXJEaXNwb3NhYmxlcyA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGZ1bmN0aW9uIHVwZGF0ZUludGVydmFsVGltZXIoKSB7XG5cdFx0XHR0aW1lckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRjb25zdCBlbmFibGVkID0gaXNFbmFibGVkKCk7XG5cblx0XHRcdGlmICh1cGRhdGUoZW5hYmxlZCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aW1lckRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwoXG5cdFx0XHRcdGdldFdpbmRvdyhjb250YWluZXIpLFxuXHRcdFx0XHQoKSA9PiB1cGRhdGUoZW5hYmxlZCksXG5cdFx0XHRcdDEwMDBcblx0XHRcdCkpO1xuXHRcdH1cblx0XHR1cGRhdGVJbnRlcnZhbFRpbWVyKCk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQoYnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0dGhpcy5pbmxpbmVDb21wbGV0aW9uc1NlcnZpY2Uuc25vb3plKCk7XG5cdFx0XHR1cGRhdGUoaXNFbmFibGVkKCkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKGRlZmF1bHRDaGF0LmNvbXBsZXRpb25zRW5hYmxlbWVudFNldHRpbmcpKSB7XG5cdFx0XHRcdGJ1dHRvbi5lbmFibGVkID0gaXNFbmFibGVkKCk7XG5cdFx0XHR9XG5cdFx0XHR1cGRhdGVJbnRlcnZhbFRpbWVyKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuaW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlSXNTbm9vemluZygoKSA9PiB7XG5cdFx0XHR1cGRhdGVJbnRlcnZhbFRpbWVyKCk7XG5cdFx0fSkpO1xu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QixDQUFDLENBQUM7QUFFRixTQUFLLE9BQU8sSUFBSSxLQUFLLHFCQUFxQix5QkFBeUIsT0FBSztBQUN2RSxVQUFJLEVBQUUscUJBQXFCLFlBQVksNEJBQTRCLEdBQUc7QUFDckUsZUFBTyxVQUFVLFVBQVU7QUFBQSxNQUM1QjtBQUNBLDBCQUFvQjtBQUFBLElBQ3JCLENBQUMsQ0FBQztBQUVGLFNBQUssT0FBTyxJQUFJLEtBQUsseUJBQXlCLHNCQUFzQixNQUFNO0FBQ3pFLDBCQUFvQjtBQUFBLElBQ3JCLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFDRDtBQXpxQ2Esb0JBRVksK0JBQStCO0FBRjNDLHNCQUFOO0FBQUEsRUFjSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQTlCVTsiLAogICJuYW1lcyI6IFsiY2hhdFF1b3RhIiwgInByZW1pdW1DaGF0UXVvdGEiLCAiY29tcGxldGlvbnNRdW90YSIsICJxdW90YSIsICJjb25maWd1cmVkVmFsdWUiLCAiaXNFbmFibGVkIl0KfQo=
