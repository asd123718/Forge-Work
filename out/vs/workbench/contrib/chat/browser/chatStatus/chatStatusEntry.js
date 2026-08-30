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
import "./media/chatStatus.css";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { IStatusbarService, ShowTooltipCommand, StatusbarAlignment } from "../../../../services/statusbar/browser/statusbar.js";
import { ChatEntitlement, ChatEntitlementContextKeys, IChatEntitlementService, isProUser } from "../../../../services/chat/common/chatEntitlementService.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { disposableLongTimeout, disposableTimeout } from "../../../../../base/common/async.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { getCodeEditor } from "../../../../../editor/browser/editorBrowser.js";
import { IInlineCompletionsService } from "../../../../../editor/browser/services/inlineCompletionsService.js";
import { ChatStatusDashboard } from "./chatStatusDashboard.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { $ as h, disposableWindowInterval } from "../../../../../base/browser/dom.js";
import { isNewUser } from "./chatStatus.js";
import product from "../../../../../platform/product/common/product.js";
import { isCompletionsEnabled } from "../../../../../editor/common/services/completionsEnablement.js";
import { CHAT_SETUP_ACTION_ID } from "../actions/chatActions.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { isWeb } from "../../../../../base/common/platform.js";
import { InEditorZenModeContext } from "../../../../common/contextkeys.js";
import { UpdateTitleBarEditorVisibleContext } from "../../../update/common/update.js";
import { ChatConfiguration } from "../../common/constants.js";
function isTrackedEntitlement(entitlement) {
  switch (entitlement) {
    case ChatEntitlement.Free:
    case ChatEntitlement.EDU:
    case ChatEntitlement.Pro:
    case ChatEntitlement.ProPlus:
    case ChatEntitlement.Business:
    case ChatEntitlement.Enterprise:
      return true;
    default:
      return false;
  }
}
function isQuotaBlocked(quotas) {
  const premiumChat = quotas.premiumChat;
  if (premiumChat === void 0) {
    return false;
  }
  return premiumChat.unlimited ? premiumChat.hasQuota === false : premiumChat.percentRemaining === 0;
}
function hasResolvedQuota(quotas) {
  return quotas.premiumChat !== void 0;
}
function computeQuotaResumeState(previous, entitlement, quotas) {
  if (!isTrackedEntitlement(entitlement)) {
    return "none";
  }
  const additionalSpend = quotas.additionalUsageEnabled === true;
  if (!additionalSpend && isQuotaBlocked(quotas)) {
    return "blocked";
  }
  if (previous !== "blocked") {
    return previous;
  }
  if (additionalSpend) {
    return "none";
  }
  return hasResolvedQuota(quotas) ? "resumed" : "blocked";
}
let ChatStatusBarEntry = class extends Disposable {
  constructor(chatEntitlementService, instantiationService, statusbarService, editorService, configurationService, completionsService, contextKeyService, storageService) {
    super();
    this.chatEntitlementService = chatEntitlementService;
    this.instantiationService = instantiationService;
    this.statusbarService = statusbarService;
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.completionsService = completionsService;
    this.contextKeyService = contextKeyService;
    this.storageService = storageService;
    // re-check 5 min after a passed reset time
    this.entry = void 0;
    this.activeCodeEditorListener = this._register(new MutableDisposable());
    this.entryAnchor = h("span");
    this.quotaResetTimer = this._register(new MutableDisposable());
    this.quotaRefresh = this._register(new MutableDisposable());
    this.clearResumedScheduler = this._register(new MutableDisposable());
    this.quotaResumeState = this.readPersistedQuotaResumeState();
    this.dashboardTooltip = {
      element: (token) => {
        this.onDashboardOpened();
        const store = new DisposableStore();
        store.add(token.onCancellationRequested(() => {
          store.dispose();
        }));
        const elem = ChatStatusDashboard.instantiateInContents(this.instantiationService, store, void 0);
        store.add(disposableWindowInterval(mainWindow, () => {
          if (!elem.isConnected) {
            store.dispose();
          }
        }, 2e3));
        return elem;
      }
    };
    this.update();
    this.registerListeners();
    this.initializeQuotaResumeState();
  }
  update() {
    const sentiment = this.chatEntitlementService.sentiment;
    if (!sentiment.hidden) {
      const props = this.getEntryProps();
      if (this.entry) {
        this.entry.update(props);
      } else {
        this.entry = this.statusbarService.addEntry(props, "chat.statusBarEntry", StatusbarAlignment.RIGHT, { location: { id: "status.editor.mode", priority: 100.1 }, alignment: StatusbarAlignment.RIGHT });
      }
    } else {
      this.entry?.dispose();
      this.entry = void 0;
    }
  }
  registerListeners() {
    this._register(this.chatEntitlementService.onDidChangeQuotaExceeded(() => this.onQuotaChanged()));
    this._register(this.chatEntitlementService.onDidChangeQuotaRemaining(() => this.onQuotaChanged()));
    this._register(this.chatEntitlementService.onDidChangeSentiment(() => this.update()));
    this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.onQuotaChanged()));
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(ChatStatusBarEntry.TITLE_BAR_CONTEXT_KEYS)) {
        this.update();
      }
    }));
    this._register(this.completionsService.onDidChangeIsSnoozing(() => this.update()));
    this._register(this.editorService.onDidActiveEditorChange(() => this.onDidActiveEditorChange()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      const completionsSetting = product.defaultChatAgent?.completionsEnablementSetting;
      if (completionsSetting && e.affectsConfiguration(completionsSetting) || e.affectsConfiguration(ChatConfiguration.TitleBarSignInEnabled)) {
        this.update();
      }
    }));
  }
  onDidActiveEditorChange() {
    this.update();
    this.activeCodeEditorListener.clear();
    const activeCodeEditor = getCodeEditor(this.editorService.activeTextEditorControl);
    if (activeCodeEditor) {
      this.activeCodeEditorListener.value = activeCodeEditor.onDidChangeModelLanguage(() => {
        this.update();
      });
    }
  }
  //#region --- Quota Resume Tracking
  onQuotaChanged() {
    this.evaluateQuotaResumeState();
    this.update();
  }
  evaluateQuotaResumeState() {
    const next = computeQuotaResumeState(this.quotaResumeState, this.chatEntitlementService.entitlement, this.chatEntitlementService.quotas);
    this.setQuotaResumeState(next);
    if (next === "blocked") {
      this.scheduleQuotaResetRefresh();
    } else {
      this.quotaResetTimer.clear();
    }
  }
  getQuotaResetTime() {
    const quotas = this.chatEntitlementService.quotas;
    const premiumResetAt = quotas.premiumChat?.resetAt;
    if (typeof premiumResetAt === "number") {
      return premiumResetAt * 1e3;
    }
    if (quotas.resetDate) {
      const parsed = Date.parse(quotas.resetDate);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    return void 0;
  }
  scheduleQuotaResetRefresh() {
    const resetAt = this.getQuotaResetTime();
    if (resetAt === void 0) {
      this.quotaResetTimer.clear();
      return;
    }
    const delay = resetAt > Date.now() ? resetAt - Date.now() : ChatStatusBarEntry.QUOTA_RESET_RETRY_DELAY;
    this.quotaResetTimer.value = disposableLongTimeout(() => this.refreshQuotaAndEvaluate(), delay);
  }
  refreshQuotaAndEvaluate() {
    const cts = new CancellationTokenSource();
    this.quotaRefresh.value = toDisposable(() => cts.dispose(true));
    (async () => {
      try {
        await this.chatEntitlementService.update(cts.token);
      } catch {
      }
      if (cts.token.isCancellationRequested) {
        return;
      }
      this.evaluateQuotaResumeState();
      this.update();
    })();
  }
  initializeQuotaResumeState() {
    if (this.quotaResumeState === "blocked") {
      this.refreshQuotaAndEvaluate();
    } else {
      this.evaluateQuotaResumeState();
    }
  }
  readPersistedQuotaResumeState() {
    const stored = this.storageService.get(ChatStatusBarEntry.QUOTA_RESUME_STATE_KEY, StorageScope.PROFILE);
    return stored === "blocked" || stored === "resumed" ? stored : "none";
  }
  setQuotaResumeState(state) {
    if (this.quotaResumeState === state) {
      return;
    }
    this.quotaResumeState = state;
    if (state === "none") {
      this.storageService.remove(ChatStatusBarEntry.QUOTA_RESUME_STATE_KEY, StorageScope.PROFILE);
    } else {
      this.storageService.store(ChatStatusBarEntry.QUOTA_RESUME_STATE_KEY, state, StorageScope.PROFILE, StorageTarget.MACHINE);
    }
  }
  onDashboardOpened() {
    if (this.quotaResumeState !== "resumed") {
      return;
    }
    this.clearResumedScheduler.value = disposableTimeout(() => {
      this.setQuotaResumeState("none");
      this.update();
    }, 0);
  }
  //#endregion
  getEntryProps() {
    let text = "$(copilot)";
    let ariaLabel = localize("chatStatusAria", "Copilot status");
    let kind;
    if (isNewUser(this.chatEntitlementService)) {
      const entitlement = this.chatEntitlementService.entitlement;
      if (this.chatEntitlementService.sentiment.later || // user skipped setup
      entitlement === ChatEntitlement.Available || // user is entitled
      isProUser(entitlement) || // user is already pro
      entitlement === ChatEntitlement.Free) {
        return this.getSetupEntryProps();
      }
    } else {
      const quotas = this.chatEntitlementService.quotas;
      if (this.chatEntitlementService.sentiment.disabled || this.chatEntitlementService.sentiment.untrusted) {
        text = "$(copilot-unavailable)";
        ariaLabel = localize("copilotDisabledStatus", "Copilot disabled");
      } else if (this.chatEntitlementService.entitlement === ChatEntitlement.Unknown) {
        return this.getSetupEntryProps();
      } else if (isTrackedEntitlement(this.chatEntitlementService.entitlement) && isQuotaBlocked(quotas)) {
        const quotaWarning = localize("chatQuotaExceededStatus", "Quota reached");
        text = `$(copilot-warning) ${quotaWarning}`;
        ariaLabel = quotaWarning;
        kind = "prominent";
      } else if (this.quotaResumeState === "resumed") {
        const resumedLabel = localize("chatResumedStatus", "Copilot Resumed");
        text = `$(copilot) ${resumedLabel}`;
        ariaLabel = resumedLabel;
        kind = "prominent";
      } else if (this.editorService.activeTextEditorLanguageId && !isCompletionsEnabled(this.configurationService, this.editorService.activeTextEditorLanguageId)) {
        text = "$(copilot-unavailable)";
        ariaLabel = localize("completionsDisabledStatus", "Inline suggestions disabled");
      } else if (this.completionsService.isSnoozing()) {
        text = "$(copilot-snooze)";
        ariaLabel = localize("completionsSnoozedStatus", "Inline suggestions snoozed");
      }
    }
    const baseResult = {
      name: localize("chatStatus", "Copilot Status"),
      text,
      ariaLabel,
      command: ShowTooltipCommand,
      showInAllWindows: true,
      kind,
      content: this.entryAnchor,
      tooltip: this.dashboardTooltip
    };
    return baseResult;
  }
  getSetupEntryProps() {
    const showSignInLabel = !this.isSignInTitleBarAffordanceVisible();
    const signInLabel = localize("signIn", "Sign In");
    return {
      name: localize("chatStatus", "Copilot Status"),
      text: showSignInLabel ? `$(copilot) ${signInLabel}` : "$(copilot)",
      ariaLabel: showSignInLabel ? signInLabel : localize("chatStatusAria", "Copilot status"),
      command: CHAT_SETUP_ACTION_ID,
      showInAllWindows: true,
      kind: void 0,
      content: this.entryAnchor
    };
  }
  isSignInTitleBarAffordanceVisible() {
    if (isWeb) {
      return false;
    }
    if (this.chatEntitlementService.entitlement !== ChatEntitlement.Unknown) {
      return false;
    }
    if (this.chatEntitlementService.sentiment.hidden || this.chatEntitlementService.sentiment.disabledInWorkspace) {
      return false;
    }
    if (this.contextKeyService.contextMatchesRules(UpdateTitleBarEditorVisibleContext)) {
      return false;
    }
    const inZenMode = Boolean(this.contextKeyService.getContextKeyValue(InEditorZenModeContext.key));
    if (inZenMode) {
      return false;
    }
    const signInTitleBarEnabled = this.configurationService.getValue(ChatConfiguration.TitleBarSignInEnabled) !== false;
    return signInTitleBarEnabled;
  }
  dispose() {
    super.dispose();
    this.entry?.dispose();
    this.entry = void 0;
  }
};
ChatStatusBarEntry.ID = "workbench.contrib.chatStatusBarEntry";
ChatStatusBarEntry.TITLE_BAR_CONTEXT_KEYS = /* @__PURE__ */ new Set([...UpdateTitleBarEditorVisibleContext.keys(), ChatEntitlementContextKeys.hasByokModels.key]);
ChatStatusBarEntry.QUOTA_RESUME_STATE_KEY = "chat.quotaResumeState";
ChatStatusBarEntry.QUOTA_RESET_RETRY_DELAY = 5 * 60 * 1e3;
ChatStatusBarEntry = __decorateClass([
  __decorateParam(0, IChatEntitlementService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IStatusbarService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInlineCompletionsService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IStorageService)
], ChatStatusBarEntry);
export {
  ChatStatusBarEntry,
  computeQuotaResumeState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRTdGF0dXNcXGNoYXRTdGF0dXNFbnRyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jaGF0U3RhdHVzLmNzcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElTdGF0dXNiYXJFbnRyeSwgSVN0YXR1c2JhckVudHJ5QWNjZXNzb3IsIElTdGF0dXNiYXJTZXJ2aWNlLCBTaG93VG9vbHRpcENvbW1hbmQsIFN0YXR1c2JhckFsaWdubWVudCwgU3RhdHVzYmFyRW50cnlLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc3RhdHVzYmFyL2Jyb3dzZXIvc3RhdHVzYmFyLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudCwgQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMsIENoYXRFbnRpdGxlbWVudFNlcnZpY2UsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLCBpc1Byb1VzZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlTG9uZ1RpbWVvdXQsIGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJSW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvaW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlLmpzJztcblxuaW1wb3J0IHsgQ2hhdFN0YXR1c0Rhc2hib2FyZCB9IGZyb20gJy4vY2hhdFN0YXR1c0Rhc2hib2FyZC5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyAkIGFzIGgsIGRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgaXNOZXdVc2VyIH0gZnJvbSAnLi9jaGF0U3RhdHVzLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgaXNDb21wbGV0aW9uc0VuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2NvbXBsZXRpb25zRW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBDSEFUX1NFVFVQX0FDVElPTl9JRCB9IGZyb20gJy4uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEluRWRpdG9yWmVuTW9kZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgVXBkYXRlVGl0bGVCYXJFZGl0b3JWaXNpYmxlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL3VwZGF0ZS9jb21tb24vdXBkYXRlLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5cbi8qKlxuICogVHJhY2tzIHdoZXRoZXIgQ29waWxvdCBpcyBjdXJyZW50bHkgYmxvY2tlZCBieSBhIHJlYWNoZWQgcXVvdGEgbGltaXQsIGhhc1xuICogcmVzdW1lZCBhZnRlciBhIGxpbWl0IHJlc2V0LCBvciBuZWl0aGVyLiBQZXJzaXN0ZWQgYWNyb3NzIHNlc3Npb25zIHNvIGEgcmVzZXRcbiAqIHRoYXQgaGFwcGVucyB3aGlsZSBWUyBDb2RlIGlzIGNsb3NlZCBjYW4gc3RpbGwgYmUgc3VyZmFjZWQgb24gbmV4dCBsYXVuY2guXG4gKi9cbmV4cG9ydCB0eXBlIENoYXRRdW90YVJlc3VtZVN0YXRlID0gJ25vbmUnIHwgJ2Jsb2NrZWQnIHwgJ3Jlc3VtZWQnO1xuXG50eXBlIENoYXRRdW90YXMgPSBJQ2hhdEVudGl0bGVtZW50U2VydmljZVsncXVvdGFzJ107XG5cbi8qKlxuICogV2hldGhlciB0aGlzIGVudHJ5IHRyYWNrcyBxdW90YSBmb3IgdGhlIGdpdmVuIGVudGl0bGVtZW50LiBBbGwgc2lnbmVkLXVwIHBsYW5zXG4gKiBhcmUgdHJhY2tlZCB2aWEgdGhlIHVuaWZpZWQgcHJlbWl1bSBjaGF0IHF1b3RhLiBUcmFuc2llbnQgc3RhdGVzIChzaWduZWQgb3V0LFxuICogdW5yZXNvbHZlZCwgbm90IGVudGl0bGVkKSBhcmUgbm90IHRyYWNrZWQuXG4gKi9cbmZ1bmN0aW9uIGlzVHJhY2tlZEVudGl0bGVtZW50KGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQpOiBib29sZWFuIHtcblx0c3dpdGNoIChlbnRpdGxlbWVudCkge1xuXHRcdGNhc2UgQ2hhdEVudGl0bGVtZW50LkZyZWU6XG5cdFx0Y2FzZSBDaGF0RW50aXRsZW1lbnQuRURVOlxuXHRcdGNhc2UgQ2hhdEVudGl0bGVtZW50LlBybzpcblx0XHRjYXNlIENoYXRFbnRpdGxlbWVudC5Qcm9QbHVzOlxuXHRcdGNhc2UgQ2hhdEVudGl0bGVtZW50LkJ1c2luZXNzOlxuXHRcdGNhc2UgQ2hhdEVudGl0bGVtZW50LkVudGVycHJpc2U6XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzUXVvdGFCbG9ja2VkKHF1b3RhczogQ2hhdFF1b3Rhcyk6IGJvb2xlYW4ge1xuXHRjb25zdCBwcmVtaXVtQ2hhdCA9IHF1b3Rhcy5wcmVtaXVtQ2hhdDtcblx0aWYgKHByZW1pdW1DaGF0ID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gcHJlbWl1bUNoYXQudW5saW1pdGVkID8gcHJlbWl1bUNoYXQuaGFzUXVvdGEgPT09IGZhbHNlIDogcHJlbWl1bUNoYXQucGVyY2VudFJlbWFpbmluZyA9PT0gMDtcbn1cblxuZnVuY3Rpb24gaGFzUmVzb2x2ZWRRdW90YShxdW90YXM6IENoYXRRdW90YXMpOiBib29sZWFuIHtcblx0cmV0dXJuIHF1b3Rhcy5wcmVtaXVtQ2hhdCAhPT0gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFB1cmUgc3RhdGUgdHJhbnNpdGlvbiBmb3IgdGhlIENvcGlsb3QgcXVvdGEgXCJyZXN1bWVkXCIgaW5kaWNhdG9yOlxuICogLSBFbnRlcnMgYGJsb2NrZWRgIHdoaWxlIGEgbGltaXQgaXMgcmVhY2hlZCBhbmQgdGhlIHVzZXIgaXMgbm90IG9uIGFkZGl0aW9uYWwgc3BlbmQuXG4gKiAtIE1vdmVzIGBibG9ja2VkYCAtPiBgcmVzdW1lZGAgb25seSBvbiBhIGdlbnVpbmUgbGltaXQgcmVzZXQgKGZyZXNoIHF1b3RhLCBubyBhZGRpdGlvbmFsIHNwZW5kKS5cbiAqIC0gTW92ZXMgYGJsb2NrZWRgIC0+IGBub25lYCB3aGVuIHVuYmxvY2tlZCB2aWEgYWRkaXRpb25hbCBzcGVuZCAobm90IGEgcmVzZXQpLlxuICogLSBLZWVwcyBgYmxvY2tlZGAgd2hpbGUgZnJlc2ggcXVvdGEgaGFzIG5vdCBiZWVuIHJlc29sdmVkIHlldCAoZS5nLiBvZmZsaW5lKSB0byBhdm9pZCBmYWxzZSBwb3NpdGl2ZXMuXG4gKiAtIE90aGVyd2lzZSBwcmVzZXJ2ZXMgdGhlIHByZXZpb3VzIHN0YXRlLCBzbyBgcmVzdW1lZGAgcGVyc2lzdHMgdW50aWwgZGlzbWlzc2VkLlxuICogLSBSZXNldHMgdG8gYG5vbmVgIGZvciBlbnRpdGxlbWVudHMgdGhpcyBlbnRyeSBkb2Vzbid0IHRyYWNrLCBzbyB0aGUgc3RhdGUgY2FuJ3QgZ2V0IHN0dWNrIChlLmcuIHVwZ3JhZGluZyBmcm9tIEZyZWUgd2hpbGUgYGJsb2NrZWRgKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVRdW90YVJlc3VtZVN0YXRlKHByZXZpb3VzOiBDaGF0UXVvdGFSZXN1bWVTdGF0ZSwgZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudCwgcXVvdGFzOiBDaGF0UXVvdGFzKTogQ2hhdFF1b3RhUmVzdW1lU3RhdGUge1xuXHRpZiAoIWlzVHJhY2tlZEVudGl0bGVtZW50KGVudGl0bGVtZW50KSkge1xuXHRcdHJldHVybiAnbm9uZSc7XG5cdH1cblxuXHRjb25zdCBhZGRpdGlvbmFsU3BlbmQgPSBxdW90YXMuYWRkaXRpb25hbFVzYWdlRW5hYmxlZCA9PT0gdHJ1ZTtcblxuXHRpZiAoIWFkZGl0aW9uYWxTcGVuZCAmJiBpc1F1b3RhQmxvY2tlZChxdW90YXMpKSB7XG5cdFx0cmV0dXJuICdibG9ja2VkJztcblx0fVxuXG5cdGlmIChwcmV2aW91cyAhPT0gJ2Jsb2NrZWQnKSB7XG5cdFx0cmV0dXJuIHByZXZpb3VzO1xuXHR9XG5cblx0aWYgKGFkZGl0aW9uYWxTcGVuZCkge1xuXHRcdHJldHVybiAnbm9uZSc7XG5cdH1cblxuXHRyZXR1cm4gaGFzUmVzb2x2ZWRRdW90YShxdW90YXMpID8gJ3Jlc3VtZWQnIDogJ2Jsb2NrZWQnO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFN0YXR1c0JhckVudHJ5IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5jaGF0U3RhdHVzQmFyRW50cnknO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFRJVExFX0JBUl9DT05URVhUX0tFWVMgPSBuZXcgU2V0KFsuLi5VcGRhdGVUaXRsZUJhckVkaXRvclZpc2libGVDb250ZXh0LmtleXMoKSwgQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuaGFzQnlva01vZGVscy5rZXldKTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBRVU9UQV9SRVNVTUVfU1RBVEVfS0VZID0gJ2NoYXQucXVvdGFSZXN1bWVTdGF0ZSc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFFVT1RBX1JFU0VUX1JFVFJZX0RFTEFZID0gNSAqIDYwICogMTAwMDsgLy8gcmUtY2hlY2sgNSBtaW4gYWZ0ZXIgYSBwYXNzZWQgcmVzZXQgdGltZVxuXG5cdHByaXZhdGUgZW50cnk6IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZlQ29kZUVkaXRvckxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVudHJ5QW5jaG9yID0gaCgnc3BhbicpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRhc2hib2FyZFRvb2x0aXA6IElTdGF0dXNiYXJFbnRyeVsndG9vbHRpcCddO1xuXG5cdHByaXZhdGUgcXVvdGFSZXN1bWVTdGF0ZTogQ2hhdFF1b3RhUmVzdW1lU3RhdGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgcXVvdGFSZXNldFRpbWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHF1b3RhUmVmcmVzaCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBjbGVhclJlc3VtZWRTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVudGl0bGVtZW50U2VydmljZTogQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVN0YXR1c2JhclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdGF0dXNiYXJTZXJ2aWNlOiBJU3RhdHVzYmFyU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUlubGluZUNvbXBsZXRpb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbXBsZXRpb25zU2VydmljZTogSUlubGluZUNvbXBsZXRpb25zU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucXVvdGFSZXN1bWVTdGF0ZSA9IHRoaXMucmVhZFBlcnNpc3RlZFF1b3RhUmVzdW1lU3RhdGUoKTtcblxuXHRcdHRoaXMuZGFzaGJvYXJkVG9vbHRpcCA9IHtcblx0XHRcdGVsZW1lbnQ6ICh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0dGhpcy5vbkRhc2hib2FyZE9wZW5lZCgpO1xuXG5cdFx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRjb25zdCBlbGVtID0gQ2hhdFN0YXR1c0Rhc2hib2FyZC5pbnN0YW50aWF0ZUluQ29udGVudHModGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgc3RvcmUsIHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Ly8gdG9kb0Bjb25ub3I0MzEyL0BiZW5pYmVuajogd29ya2Fyb3VuZCBmb3IgIzI1NzkyM1xuXHRcdFx0XHRzdG9yZS5hZGQoZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsKG1haW5XaW5kb3csICgpID0+IHtcblx0XHRcdFx0XHRpZiAoIWVsZW0uaXNDb25uZWN0ZWQpIHtcblx0XHRcdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIDIwMDApKTtcblxuXHRcdFx0XHRyZXR1cm4gZWxlbTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy51cGRhdGUoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblxuXHRcdHRoaXMuaW5pdGlhbGl6ZVF1b3RhUmVzdW1lU3RhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlbnRpbWVudCA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQ7XG5cdFx0aWYgKCFzZW50aW1lbnQuaGlkZGVuKSB7XG5cdFx0XHRjb25zdCBwcm9wcyA9IHRoaXMuZ2V0RW50cnlQcm9wcygpO1xuXHRcdFx0aWYgKHRoaXMuZW50cnkpIHtcblx0XHRcdFx0dGhpcy5lbnRyeS51cGRhdGUocHJvcHMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5lbnRyeSA9IHRoaXMuc3RhdHVzYmFyU2VydmljZS5hZGRFbnRyeShwcm9wcywgJ2NoYXQuc3RhdHVzQmFyRW50cnknLCBTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQsIHsgbG9jYXRpb246IHsgaWQ6ICdzdGF0dXMuZWRpdG9yLm1vZGUnLCBwcmlvcml0eTogMTAwLjEgfSwgYWxpZ25tZW50OiBTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQgfSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZW50cnk/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuZW50cnkgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VRdW90YUV4Y2VlZGVkKCgpID0+IHRoaXMub25RdW90YUNoYW5nZWQoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVF1b3RhUmVtYWluaW5nKCgpID0+IHRoaXMub25RdW90YUNoYW5nZWQoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVNlbnRpbWVudCgoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlRW50aXRsZW1lbnQoKCkgPT4gdGhpcy5vblF1b3RhQ2hhbmdlZCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzU29tZShDaGF0U3RhdHVzQmFyRW50cnkuVElUTEVfQkFSX0NPTlRFWFRfS0VZUykpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbXBsZXRpb25zU2VydmljZS5vbkRpZENoYW5nZUlzU25vb3ppbmcoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCgpID0+IHRoaXMub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRjb25zdCBjb21wbGV0aW9uc1NldHRpbmcgPSBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LmNvbXBsZXRpb25zRW5hYmxlbWVudFNldHRpbmc7XG5cdFx0XHRpZiAoKGNvbXBsZXRpb25zU2V0dGluZyAmJiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKGNvbXBsZXRpb25zU2V0dGluZykpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uVGl0bGVCYXJTaWduSW5FbmFibGVkKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGUoKTtcblxuXHRcdHRoaXMuYWN0aXZlQ29kZUVkaXRvckxpc3RlbmVyLmNsZWFyKCk7XG5cblx0XHQvLyBMaXN0ZW4gdG8gbGFuZ3VhZ2UgY2hhbmdlcyBpbiB0aGUgYWN0aXZlIGNvZGUgZWRpdG9yXG5cdFx0Y29uc3QgYWN0aXZlQ29kZUVkaXRvciA9IGdldENvZGVFZGl0b3IodGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sKTtcblx0XHRpZiAoYWN0aXZlQ29kZUVkaXRvcikge1xuXHRcdFx0dGhpcy5hY3RpdmVDb2RlRWRpdG9yTGlzdGVuZXIudmFsdWUgPSBhY3RpdmVDb2RlRWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQvLyNyZWdpb24gLS0tIFF1b3RhIFJlc3VtZSBUcmFja2luZ1xuXG5cdHByaXZhdGUgb25RdW90YUNoYW5nZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5ldmFsdWF0ZVF1b3RhUmVzdW1lU3RhdGUoKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBldmFsdWF0ZVF1b3RhUmVzdW1lU3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV4dCA9IGNvbXB1dGVRdW90YVJlc3VtZVN0YXRlKHRoaXMucXVvdGFSZXN1bWVTdGF0ZSwgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50LCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzKTtcblx0XHR0aGlzLnNldFF1b3RhUmVzdW1lU3RhdGUobmV4dCk7XG5cblx0XHQvLyBXaGlsZSBibG9ja2VkLCBzY2hlZHVsZSBhIHJlZnJlc2ggZm9yIHdoZW4gdGhlIGxpbWl0IGlzIGV4cGVjdGVkIHRvIHJlc2V0LlxuXHRcdGlmIChuZXh0ID09PSAnYmxvY2tlZCcpIHtcblx0XHRcdHRoaXMuc2NoZWR1bGVRdW90YVJlc2V0UmVmcmVzaCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnF1b3RhUmVzZXRUaW1lci5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0UXVvdGFSZXNldFRpbWUoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBxdW90YXMgPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzO1xuXG5cdFx0Y29uc3QgcHJlbWl1bVJlc2V0QXQgPSBxdW90YXMucHJlbWl1bUNoYXQ/LnJlc2V0QXQ7XG5cdFx0aWYgKHR5cGVvZiBwcmVtaXVtUmVzZXRBdCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiBwcmVtaXVtUmVzZXRBdCAqIDEwMDA7XG5cdFx0fVxuXG5cdFx0aWYgKHF1b3Rhcy5yZXNldERhdGUpIHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IERhdGUucGFyc2UocXVvdGFzLnJlc2V0RGF0ZSk7XG5cdFx0XHRpZiAoIWlzTmFOKHBhcnNlZCkpIHtcblx0XHRcdFx0cmV0dXJuIHBhcnNlZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBzY2hlZHVsZVF1b3RhUmVzZXRSZWZyZXNoKCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlc2V0QXQgPSB0aGlzLmdldFF1b3RhUmVzZXRUaW1lKCk7XG5cdFx0aWYgKHJlc2V0QXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5xdW90YVJlc2V0VGltZXIuY2xlYXIoKTsgLy8gbm8ga25vd24gcmVzZXQgdGltZTogcmVseSBvbiBxdW90YSBldmVudHMgYW5kIG5leHQgbGF1bmNoXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQmFjayBvZmYgd2hlbiB0aGUgcmVzZXQgdGltZSBoYXMgYWxyZWFkeSBwYXNzZWQgYnV0IHdlIGFyZSBzdGlsbCBibG9ja2VkLFxuXHRcdC8vIHNvIHdlIHJlLWNoZWNrIHBlcmlvZGljYWxseSBpbnN0ZWFkIG9mIGhhbW1lcmluZyB0aGUgc2VydmljZS5cblx0XHRjb25zdCBkZWxheSA9IHJlc2V0QXQgPiBEYXRlLm5vdygpID8gcmVzZXRBdCAtIERhdGUubm93KCkgOiBDaGF0U3RhdHVzQmFyRW50cnkuUVVPVEFfUkVTRVRfUkVUUllfREVMQVk7XG5cdFx0dGhpcy5xdW90YVJlc2V0VGltZXIudmFsdWUgPSBkaXNwb3NhYmxlTG9uZ1RpbWVvdXQoKCkgPT4gdGhpcy5yZWZyZXNoUXVvdGFBbmRFdmFsdWF0ZSgpLCBkZWxheSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2hRdW90YUFuZEV2YWx1YXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMucXVvdGFSZWZyZXNoLnZhbHVlID0gdG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKTtcblxuXHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UudXBkYXRlKGN0cy50b2tlbik7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gSWdub3JlIHJlZnJlc2ggZmFpbHVyZXM6IGtlZXAgdGhlIGxhc3Qga25vd24gc3RhdGUgYW5kIGxldCBhIGZ1dHVyZVxuXHRcdFx0XHQvLyBxdW90YSB1cGRhdGUgb3IgdGhlIG5leHQgbGF1bmNoIHJlLWV2YWx1YXRlLlxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5ldmFsdWF0ZVF1b3RhUmVzdW1lU3RhdGUoKTtcblx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0fSkoKTtcblx0fVxuXG5cdHByaXZhdGUgaW5pdGlhbGl6ZVF1b3RhUmVzdW1lU3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucXVvdGFSZXN1bWVTdGF0ZSA9PT0gJ2Jsb2NrZWQnKSB7XG5cdFx0XHQvLyBBIGJsb2NrZWQgc3RhdGUgd2FzIHJlY29yZGVkIGluIGEgcHJldmlvdXMgc2Vzc2lvbjogdmVyaWZ5IGFnYWluc3QgZnJlc2hcblx0XHRcdC8vIHF1b3RhIGRhdGEgd2hldGhlciB0aGUgbGltaXQgaGFzIHNpbmNlIHJlc2V0IHdoaWxlIFZTIENvZGUgd2FzIGNsb3NlZC5cblx0XHRcdHRoaXMucmVmcmVzaFF1b3RhQW5kRXZhbHVhdGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5ldmFsdWF0ZVF1b3RhUmVzdW1lU3RhdGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRQZXJzaXN0ZWRRdW90YVJlc3VtZVN0YXRlKCk6IENoYXRRdW90YVJlc3VtZVN0YXRlIHtcblx0XHRjb25zdCBzdG9yZWQgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChDaGF0U3RhdHVzQmFyRW50cnkuUVVPVEFfUkVTVU1FX1NUQVRFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdHJldHVybiBzdG9yZWQgPT09ICdibG9ja2VkJyB8fCBzdG9yZWQgPT09ICdyZXN1bWVkJyA/IHN0b3JlZCA6ICdub25lJztcblx0fVxuXG5cdHByaXZhdGUgc2V0UXVvdGFSZXN1bWVTdGF0ZShzdGF0ZTogQ2hhdFF1b3RhUmVzdW1lU3RhdGUpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5xdW90YVJlc3VtZVN0YXRlID09PSBzdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucXVvdGFSZXN1bWVTdGF0ZSA9IHN0YXRlO1xuXHRcdGlmIChzdGF0ZSA9PT0gJ25vbmUnKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShDaGF0U3RhdHVzQmFyRW50cnkuUVVPVEFfUkVTVU1FX1NUQVRFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKENoYXRTdGF0dXNCYXJFbnRyeS5RVU9UQV9SRVNVTUVfU1RBVEVfS0VZLCBzdGF0ZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRhc2hib2FyZE9wZW5lZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5xdW90YVJlc3VtZVN0YXRlICE9PSAncmVzdW1lZCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEZWZlciBjbGVhcmluZyB0byBhdm9pZCByZS1lbnRyYW50IHN0YXR1cyBiYXIgdXBkYXRlcyB3aGlsZSB0aGUgZGFzaGJvYXJkXG5cdFx0Ly8gdG9vbHRpcCBpcyBiZWluZyBidWlsdC5cblx0XHR0aGlzLmNsZWFyUmVzdW1lZFNjaGVkdWxlci52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuc2V0UXVvdGFSZXN1bWVTdGF0ZSgnbm9uZScpO1xuXHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHR9LCAwKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgZ2V0RW50cnlQcm9wcygpOiBJU3RhdHVzYmFyRW50cnkge1xuXHRcdGxldCB0ZXh0ID0gJyQoY29waWxvdCknO1xuXHRcdGxldCBhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdFN0YXR1c0FyaWEnLCBcIkNvcGlsb3Qgc3RhdHVzXCIpO1xuXHRcdGxldCBraW5kOiBTdGF0dXNiYXJFbnRyeUtpbmQgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAoaXNOZXdVc2VyKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZSkpIHtcblx0XHRcdGNvbnN0IGVudGl0bGVtZW50ID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50O1xuXG5cdFx0XHQvLyBTaWduIEluXG5cdFx0XHRpZiAoXG5cdFx0XHRcdHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQubGF0ZXIgfHxcdC8vIHVzZXIgc2tpcHBlZCBzZXR1cFxuXHRcdFx0XHRlbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkF2YWlsYWJsZSB8fFx0Ly8gdXNlciBpcyBlbnRpdGxlZFxuXHRcdFx0XHRpc1Byb1VzZXIoZW50aXRsZW1lbnQpIHx8XHRcdFx0XHRcdFx0Ly8gdXNlciBpcyBhbHJlYWR5IHByb1xuXHRcdFx0XHRlbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkZyZWVcdFx0XHQvLyB1c2VyIGlzIGFscmVhZHkgZnJlZVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmdldFNldHVwRW50cnlQcm9wcygpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBxdW90YXMgPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzO1xuXG5cdFx0XHQvLyBEaXNhYmxlZFxuXHRcdFx0aWYgKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuZGlzYWJsZWQgfHwgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC51bnRydXN0ZWQpIHtcblx0XHRcdFx0dGV4dCA9ICckKGNvcGlsb3QtdW5hdmFpbGFibGUpJztcblx0XHRcdFx0YXJpYUxhYmVsID0gbG9jYWxpemUoJ2NvcGlsb3REaXNhYmxlZFN0YXR1cycsIFwiQ29waWxvdCBkaXNhYmxlZFwiKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2lnbmVkIG91dCBcdTIwMTQga2VlcCBzaG93aW5nIFNpZ24taW4gYWZmb3JkYW5jZSBldmVuIHdoZW4gQllPSyBtb2RlbHMgYXJlIHByZXNlbnRcblx0XHRcdC8vIHNvIGFpci1nYXBwZWQgdXNlcnMgY2FuIHN0aWxsIGF1dGhlbnRpY2F0ZSB0byB1bmxvY2sgdGhlIGZ1bGwgQ29waWxvdCBleHBlcmllbmNlLlxuXHRcdFx0ZWxzZSBpZiAodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuVW5rbm93bikge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRTZXR1cEVudHJ5UHJvcHMoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUXVvdGEgRXhjZWVkZWQgKGFsbCB0cmFja2VkIHBsYW5zIHNoYXJlIHRoZSBwcmVtaXVtIGNoYXQgcXVvdGEpXG5cdFx0XHRlbHNlIGlmIChpc1RyYWNrZWRFbnRpdGxlbWVudCh0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQpICYmIGlzUXVvdGFCbG9ja2VkKHF1b3RhcykpIHtcblx0XHRcdFx0Y29uc3QgcXVvdGFXYXJuaW5nID0gbG9jYWxpemUoJ2NoYXRRdW90YUV4Y2VlZGVkU3RhdHVzJywgXCJRdW90YSByZWFjaGVkXCIpO1xuXHRcdFx0XHR0ZXh0ID0gYCQoY29waWxvdC13YXJuaW5nKSAke3F1b3RhV2FybmluZ31gO1xuXHRcdFx0XHRhcmlhTGFiZWwgPSBxdW90YVdhcm5pbmc7XG5cdFx0XHRcdGtpbmQgPSAncHJvbWluZW50Jztcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29waWxvdCBSZXN1bWVkIChsaW1pdCByZXNldCBhZnRlciB0aGUgdXNlciB3YXMgcHJldmlvdXNseSBibG9ja2VkKVxuXHRcdFx0ZWxzZSBpZiAodGhpcy5xdW90YVJlc3VtZVN0YXRlID09PSAncmVzdW1lZCcpIHtcblx0XHRcdFx0Y29uc3QgcmVzdW1lZExhYmVsID0gbG9jYWxpemUoJ2NoYXRSZXN1bWVkU3RhdHVzJywgXCJDb3BpbG90IFJlc3VtZWRcIik7XG5cdFx0XHRcdHRleHQgPSBgJChjb3BpbG90KSAke3Jlc3VtZWRMYWJlbH1gO1xuXHRcdFx0XHRhcmlhTGFiZWwgPSByZXN1bWVkTGFiZWw7XG5cdFx0XHRcdGtpbmQgPSAncHJvbWluZW50Jztcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29tcGxldGlvbnMgRGlzYWJsZWRcblx0XHRcdGVsc2UgaWYgKHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yTGFuZ3VhZ2VJZCAmJiAhaXNDb21wbGV0aW9uc0VuYWJsZWQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JMYW5ndWFnZUlkKSkge1xuXHRcdFx0XHR0ZXh0ID0gJyQoY29waWxvdC11bmF2YWlsYWJsZSknO1xuXHRcdFx0XHRhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY29tcGxldGlvbnNEaXNhYmxlZFN0YXR1cycsIFwiSW5saW5lIHN1Z2dlc3Rpb25zIGRpc2FibGVkXCIpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDb21wbGV0aW9ucyBTbm9vemVkXG5cdFx0XHRlbHNlIGlmICh0aGlzLmNvbXBsZXRpb25zU2VydmljZS5pc1Nub296aW5nKCkpIHtcblx0XHRcdFx0dGV4dCA9ICckKGNvcGlsb3Qtc25vb3plKSc7XG5cdFx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKCdjb21wbGV0aW9uc1Nub296ZWRTdGF0dXMnLCBcIklubGluZSBzdWdnZXN0aW9ucyBzbm9vemVkXCIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGJhc2VSZXN1bHQgPSB7XG5cdFx0XHRuYW1lOiBsb2NhbGl6ZSgnY2hhdFN0YXR1cycsIFwiQ29waWxvdCBTdGF0dXNcIiksXG5cdFx0XHR0ZXh0LFxuXHRcdFx0YXJpYUxhYmVsLFxuXHRcdFx0Y29tbWFuZDogU2hvd1Rvb2x0aXBDb21tYW5kLFxuXHRcdFx0c2hvd0luQWxsV2luZG93czogdHJ1ZSxcblx0XHRcdGtpbmQsXG5cdFx0XHRjb250ZW50OiB0aGlzLmVudHJ5QW5jaG9yLFxuXHRcdFx0dG9vbHRpcDogdGhpcy5kYXNoYm9hcmRUb29sdGlwXG5cdFx0fSBzYXRpc2ZpZXMgSVN0YXR1c2JhckVudHJ5O1xuXG5cdFx0cmV0dXJuIGJhc2VSZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFNldHVwRW50cnlQcm9wcygpOiBJU3RhdHVzYmFyRW50cnkge1xuXHRcdGNvbnN0IHNob3dTaWduSW5MYWJlbCA9ICF0aGlzLmlzU2lnbkluVGl0bGVCYXJBZmZvcmRhbmNlVmlzaWJsZSgpO1xuXHRcdGNvbnN0IHNpZ25JbkxhYmVsID0gbG9jYWxpemUoJ3NpZ25JbicsIFwiU2lnbiBJblwiKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogbG9jYWxpemUoJ2NoYXRTdGF0dXMnLCBcIkNvcGlsb3QgU3RhdHVzXCIpLFxuXHRcdFx0dGV4dDogc2hvd1NpZ25JbkxhYmVsID8gYCQoY29waWxvdCkgJHtzaWduSW5MYWJlbH1gIDogJyQoY29waWxvdCknLFxuXHRcdFx0YXJpYUxhYmVsOiBzaG93U2lnbkluTGFiZWwgPyBzaWduSW5MYWJlbCA6IGxvY2FsaXplKCdjaGF0U3RhdHVzQXJpYScsIFwiQ29waWxvdCBzdGF0dXNcIiksXG5cdFx0XHRjb21tYW5kOiBDSEFUX1NFVFVQX0FDVElPTl9JRCxcblx0XHRcdHNob3dJbkFsbFdpbmRvd3M6IHRydWUsXG5cdFx0XHRraW5kOiB1bmRlZmluZWQsXG5cdFx0XHRjb250ZW50OiB0aGlzLmVudHJ5QW5jaG9yLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGlzU2lnbkluVGl0bGVCYXJBZmZvcmRhbmNlVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBUaXRsZSBiYXIgc2lnbi1pbiBidXR0b24gb25seSBzaG93cyB3aGVuIHVzZXIgaXMgc2lnbmVkIG91dFxuXHRcdGlmICh0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgIT09IENoYXRFbnRpdGxlbWVudC5Vbmtub3duKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuaGlkZGVuIHx8IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuZGlzYWJsZWRJbldvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoVXBkYXRlVGl0bGVCYXJFZGl0b3JWaXNpYmxlQ29udGV4dCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBpblplbk1vZGUgPSBCb29sZWFuKHRoaXMuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKEluRWRpdG9yWmVuTW9kZUNvbnRleHQua2V5KSk7XG5cdFx0aWYgKGluWmVuTW9kZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNpZ25JblRpdGxlQmFyRW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uVGl0bGVCYXJTaWduSW5FbmFibGVkKSAhPT0gZmFsc2U7XG5cdFx0cmV0dXJuIHNpZ25JblRpdGxlQmFyRW5hYmxlZDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5lbnRyeT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuZW50cnkgPSB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsWUFBWSxpQkFBaUIsbUJBQW1CLG9CQUFvQjtBQUM3RSxTQUFTLGdCQUFnQjtBQUV6QixTQUFtRCxtQkFBbUIsb0JBQW9CLDBCQUE4QztBQUN4SSxTQUFTLGlCQUFpQiw0QkFBb0QseUJBQXlCLGlCQUFpQjtBQUN4SCxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyx1QkFBdUIseUJBQXlCO0FBQ3pELFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsaUNBQWlDO0FBRTFDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsS0FB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
