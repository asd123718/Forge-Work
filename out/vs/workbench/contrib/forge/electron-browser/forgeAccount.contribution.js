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
import "./media/forgeAccount.css";
import { $, append, addDisposableListener } from "../../../../base/browser/dom.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize, localize2 } from "../../../../nls.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { GitHubPaths, IDefaultAccountService } from "../../../../platform/defaultAccount/common/defaultAccount.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { defaultButtonStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { ICodexAccountService, openCodexAuthUrl } from "../../../services/agentHost/browser/codexAccountService.js";
import { IDeepSeekAccountService, IGrokAccountService } from "../../../services/agentHost/browser/forgeVendorAccountService.js";
import { IAgentHostService } from "../../../../platform/agentHost/common/agentService.js";
import { vendorAccountSecretResource, vendorAccountSecretStorageKey } from "../../../../platform/agentHost/common/forgeVendorAccount.js";
import { ISecretStorageService } from "../../../../platform/secrets/common/secrets.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { AICustomizationManagementCommands } from "../../chat/browser/aiCustomization/aiCustomizationManagement.js";
import { aiCustomizationManagementSectionRegistry } from "../../chat/browser/aiCustomization/aiCustomizationManagementSectionRegistry.js";
import { AICustomizationManagementSection } from "../../chat/common/aiCustomizationWorkspaceService.js";
import { SessionType } from "../../chat/common/chatSessionsService.js";
const FORGE_ACCOUNT_ACTION_ID = "forge.accounts.showRemainingUsage";
function getCodexRemainingPercent(rateLimit) {
  return rateLimit ? clampPercent(100 - rateLimit.usedPercent) : void 0;
}
function getGitHubRemainingPercent(snapshot) {
  return snapshot ? clampPercent(snapshot.percent_remaining) : void 0;
}
function clampPercent(value) {
  return Math.min(100, Math.max(0, value));
}
function formatRemainingPercent(value) {
  return localize("forge.account.percentRemaining", "{0}% remaining", Math.round(value));
}
function formatResetTime(timestamp) {
  if (!timestamp) {
    return void 0;
  }
  const milliseconds = timestamp < 1e12 ? timestamp * 1e3 : timestamp;
  return localize("forge.account.resetsAt", "Resets {0}", new Date(milliseconds).toLocaleString());
}
function formatQuota(snapshot) {
  if (!snapshot) {
    return { value: localize("forge.account.usageUnavailable", "Remaining usage unavailable") };
  }
  if (snapshot.unlimited) {
    return { value: localize("forge.account.unlimited", "Unlimited"), detail: formatResetTime(snapshot.quota_reset_at), percent: 100 };
  }
  const percent = getGitHubRemainingPercent(snapshot);
  const exact = snapshot.quota_remaining !== void 0 ? localize("forge.account.exactRemaining", "{0} remaining", snapshot.quota_remaining.toLocaleString()) : void 0;
  const reset = formatResetTime(snapshot.quota_reset_at);
  return {
    value: percent === void 0 ? localize("forge.account.usageUnavailable", "Remaining usage unavailable") : formatRemainingPercent(percent),
    detail: [exact, reset].filter(Boolean).join(" \xB7 ") || void 0,
    percent
  };
}
function formatCodexQuota(rateLimit) {
  const percent = getCodexRemainingPercent(rateLimit);
  if (percent === void 0) {
    return { value: localize("forge.account.usageUnavailable", "Remaining usage unavailable") };
  }
  const window = rateLimit?.windowDurationMins ? localize("forge.account.windowDuration", "{0}-hour window", Math.round(rateLimit.windowDurationMins / 60)) : void 0;
  return {
    value: formatRemainingPercent(percent),
    detail: [window, formatResetTime(rateLimit?.resetsAt)].filter(Boolean).join(" \xB7 ") || void 0,
    percent
  };
}
async function confirmSignOut(dialogService, provider) {
  const result = await dialogService.confirm({
    message: localize("forge.account.confirmSignOut", "Sign out of {0}?", provider),
    primaryButton: localize("forge.account.signOut", "Sign Out")
  });
  return result.confirmed;
}
async function hydrateVendorAccountSecrets(secretStorage, agentHost) {
  for (const kind of ["grok", "deepseek"]) {
    try {
      const token = await secretStorage.get(vendorAccountSecretStorageKey(kind));
      if (token) {
        await agentHost.authenticate({ resource: vendorAccountSecretResource(kind), token });
      }
    } catch {
    }
  }
}
async function storeVendorAccountApiKey(secretStorage, agentHost, kind, apiKey) {
  await secretStorage.set(vendorAccountSecretStorageKey(kind), apiKey);
  await agentHost.authenticate({ resource: vendorAccountSecretResource(kind), token: apiKey });
}
async function clearVendorAccountApiKey(secretStorage, agentHost, kind) {
  try {
    await secretStorage.delete(vendorAccountSecretStorageKey(kind));
  } catch {
  }
  try {
    await agentHost.authenticate({ resource: vendorAccountSecretResource(kind), token: "" });
  } catch {
  }
}
function openAccountSettings(commandService) {
  void commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, {
    section: AICustomizationManagementSection.Account,
    sessionType: SessionType.AgentHostCodex
  });
}
async function signOutVendorAccount(dialogService, secretStorage, agentHost, kind, label, service) {
  if (!await confirmSignOut(dialogService, label)) {
    return;
  }
  await clearVendorAccountApiKey(secretStorage, agentHost, kind);
  service.signOut();
}
async function showAccountQuickPick(accessor) {
  const quickInputService = accessor.get(IQuickInputService);
  const defaultAccountService = accessor.get(IDefaultAccountService);
  const codexAccountService = accessor.get(ICodexAccountService);
  const commandService = accessor.get(ICommandService);
  const openerService = accessor.get(IOpenerService);
  const dialogService = accessor.get(IDialogService);
  const grokAccountService = accessor.get(IGrokAccountService);
  const deepSeekAccountService = accessor.get(IDeepSeekAccountService);
  const secretStorageService = accessor.get(ISecretStorageService);
  const agentHostService = accessor.get(IAgentHostService);
  const github = defaultAccountService.currentDefaultAccount;
  const codex = codexAccountService.account;
  const grok = grokAccountService.account;
  const deepseek = deepSeekAccountService.account;
  const githubQuota = github?.entitlementsData?.quota_snapshots;
  const items = [
    { type: "separator", label: localize("forge.account.github", "GitHub") },
    {
      label: github?.accountName ?? localize("forge.account.notSignedIn", "Not signed in"),
      description: github ? github.authenticationProvider.name : void 0,
      iconClasses: ThemeIcon.asClassNameArray(Codicon.github),
      pickable: false
    }
  ];
  if (github) {
    items.push(
      quotaQuickPickItem(localize("forge.account.premiumRequests", "Premium requests"), githubQuota?.premium_interactions),
      quotaQuickPickItem(localize("forge.account.chatMessages", "Chat messages"), githubQuota?.chat),
      quotaQuickPickItem(localize("forge.account.codeCompletions", "Code completions"), githubQuota?.completions)
    );
  }
  items.push(
    { type: "separator", label: localize("forge.account.codex", "Codex") },
    {
      label: codex.email ?? (codex.status === "signedIn" ? localize("forge.account.signedIn", "Signed in") : localize("forge.account.notSignedIn", "Not signed in")),
      description: codex.planType,
      iconClasses: ThemeIcon.asClassNameArray(Codicon.openai),
      pickable: false
    }
  );
  if (codex.status === "signedIn") {
    const quota = formatCodexQuota(codex.rateLimit);
    items.push({ label: quota.value, description: quota.detail, iconClasses: ThemeIcon.asClassNameArray(Codicon.dashboard), pickable: false });
  }
  items.push(
    { type: "separator", label: localize("forge.account.grok", "Grok Build") },
    {
      label: grok.email ?? (grok.status === "signedIn" ? localize("forge.account.signedIn", "Signed in") : localize("forge.account.notSignedIn", "Not signed in")),
      description: grok.planType,
      iconClasses: ThemeIcon.asClassNameArray(Codicon.rocket),
      pickable: false
    },
    { type: "separator", label: localize("forge.account.deepseek", "DeepSeek Harness") },
    {
      label: deepseek.email ?? (deepseek.status === "signedIn" ? localize("forge.account.signedIn", "Signed in") : localize("forge.account.notSignedIn", "Not signed in")),
      iconClasses: ThemeIcon.asClassNameArray(Codicon.beaker),
      pickable: false
    }
  );
  items.push(
    { type: "separator" },
    {
      label: localize("forge.account.manage", "Manage Account"),
      iconClasses: ThemeIcon.asClassNameArray(Codicon.settingsGear),
      run: () => commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, {
        section: AICustomizationManagementSection.Account,
        sessionType: SessionType.AgentHostCodex
      })
    },
    github ? {
      label: localize("forge.account.refreshGitHubUsage", "Refresh GitHub Usage"),
      iconClasses: ThemeIcon.asClassNameArray(Codicon.refresh),
      run: () => defaultAccountService.refresh({ forceRefresh: true })
    } : {
      label: localize("forge.account.signInGitHub", "Sign in to GitHub"),
      iconClasses: ThemeIcon.asClassNameArray(Codicon.signIn),
      run: () => defaultAccountService.signIn()
    },
    codex.status === "signedIn" ? {
      label: localize("forge.account.signOutCodex", "Sign out of Codex"),
      iconClasses: ThemeIcon.asClassNameArray(Codicon.signOut),
      run: async () => {
        if (await confirmSignOut(dialogService, "Codex")) {
          codexAccountService.signOut();
        }
      }
    } : {
      label: localize("forge.account.signInCodex", "Sign in to Codex"),
      iconClasses: ThemeIcon.asClassNameArray(Codicon.signIn),
      run: () => codexAccountService.signIn()
    },
    grok.status === "signedIn" ? {
      label: localize("forge.account.signOutGrok", "Sign out of Grok Build"),
      iconClasses: ThemeIcon.asClassNameArray(Codicon.signOut),
      run: () => signOutVendorAccount(dialogService, secretStorageService, agentHostService, "grok", "Grok Build", grokAccountService)
    } : {
      label: localize("forge.account.signInGrok", "\u767B\u5F55 Grok Build"),
      iconClasses: ThemeIcon.asClassNameArray(Codicon.signIn),
      run: () => openAccountSettings(commandService)
    },
    deepseek.status === "signedIn" ? {
      label: localize("forge.account.signOutDeepSeek", "Sign out of DeepSeek Harness"),
      iconClasses: ThemeIcon.asClassNameArray(Codicon.signOut),
      run: () => signOutVendorAccount(dialogService, secretStorageService, agentHostService, "deepseek", "DeepSeek Harness", deepSeekAccountService)
    } : {
      label: localize("forge.account.signInDeepSeek", "\u767B\u5F55 DeepSeek Harness"),
      iconClasses: ThemeIcon.asClassNameArray(Codicon.signIn),
      run: () => openAccountSettings(commandService)
    },
    github ? {
      label: localize("forge.account.openGitHubUsage", "Open GitHub Usage Settings"),
      iconClasses: ThemeIcon.asClassNameArray(Codicon.linkExternal),
      run: () => openerService.open(defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings), { openExternal: true })
    } : { label: "", pickable: false }
  );
  const selected = await quickInputService.pick(items.filter((item) => item.type === "separator" || item.label), {
    title: localize("forge.account.remainingUsage", "Accounts and Remaining Usage"),
    placeHolder: localize("forge.account.remainingUsagePlaceholder", "All quota values below are remaining, not used")
  });
  await selected?.run?.();
}
function quotaQuickPickItem(label, snapshot) {
  const quota = formatQuota(snapshot);
  return {
    label,
    description: quota.value,
    detail: quota.detail,
    iconClasses: ThemeIcon.asClassNameArray(Codicon.dashboard),
    pickable: false
  };
}
registerAction2(class ForgeAccountAction extends Action2 {
  constructor() {
    super({
      id: FORGE_ACCOUNT_ACTION_ID,
      title: localize2("forge.account.toolbar", "Accounts and Remaining Usage"),
      f1: false,
      menu: {
        id: MenuId.ChatViewSessionTitleToolbar,
        group: "navigation",
        order: 0,
        when: ChatContextKeys.chatSessionType.isEqualTo(SessionType.AgentHostCodex)
      }
    });
  }
  run(accessor) {
    return showAccountQuickPick(accessor);
  }
});
class ForgeAccountActionViewItem extends ActionViewItem {
  constructor(action, options) {
    super(void 0, action, { ...options, icon: false, label: true });
  }
  render(container) {
    super.render(container);
    this.element?.classList.add("forge-account-toolbar-item");
    if (!this.label) {
      return;
    }
    this.label.textContent = "";
    this.label.classList.add("forge-account-avatars");
    const github = append(this.label, $("span.forge-account-avatar.github"));
    github.setAttribute("aria-hidden", "true");
    github.classList.add(...ThemeIcon.asClassNameArray(Codicon.github));
    const codex = append(this.label, $("span.forge-account-avatar.codex"));
    codex.setAttribute("aria-hidden", "true");
    codex.classList.add(...ThemeIcon.asClassNameArray(Codicon.openai));
    const grok = append(this.label, $("span.forge-account-avatar.grok"));
    grok.setAttribute("aria-hidden", "true");
    grok.classList.add(...ThemeIcon.asClassNameArray(Codicon.rocket));
    const deepseek = append(this.label, $("span.forge-account-avatar.deepseek"));
    deepseek.setAttribute("aria-hidden", "true");
    deepseek.classList.add(...ThemeIcon.asClassNameArray(Codicon.beaker));
  }
}
let ForgeAccountToolbarContribution = class extends Disposable {
  constructor(actionViewItemService, instantiationService, defaultAccountService, codexAccountService, grokAccountService, deepSeekAccountService, secretStorageService, agentHostService) {
    super();
    const hydrateSecrets = () => void hydrateVendorAccountSecrets(secretStorageService, agentHostService);
    hydrateSecrets();
    this._register(agentHostService.onAgentHostStart(hydrateSecrets));
    this._register(actionViewItemService.register(
      MenuId.ChatViewSessionTitleToolbar,
      FORGE_ACCOUNT_ACTION_ID,
      (action, options) => instantiationService.createInstance(ForgeAccountActionViewItem, action, options),
      Event.any(
        defaultAccountService.onDidChangeDefaultAccount,
        defaultAccountService.onDidChangeCopilotTokenInfo,
        codexAccountService.onDidChangeAccount,
        grokAccountService.onDidChangeAccount,
        deepSeekAccountService.onDidChangeAccount
      )
    ));
  }
};
ForgeAccountToolbarContribution.ID = "workbench.contrib.forgeAccountToolbar";
ForgeAccountToolbarContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IDefaultAccountService),
  __decorateParam(3, ICodexAccountService),
  __decorateParam(4, IGrokAccountService),
  __decorateParam(5, IDeepSeekAccountService),
  __decorateParam(6, ISecretStorageService),
  __decorateParam(7, IAgentHostService)
], ForgeAccountToolbarContribution);
let ForgeAccountWidget = class extends Disposable {
  constructor(_container, _defaultAccountService, _codexAccountService, _grokAccountService, _deepSeekAccountService, _openerService, _nativeHostService, _dialogService, _secretStorageService, _agentHostService, _notificationService) {
    super();
    this._container = _container;
    this._defaultAccountService = _defaultAccountService;
    this._codexAccountService = _codexAccountService;
    this._grokAccountService = _grokAccountService;
    this._deepSeekAccountService = _deepSeekAccountService;
    this._openerService = _openerService;
    this._nativeHostService = _nativeHostService;
    this._dialogService = _dialogService;
    this._secretStorageService = _secretStorageService;
    this._agentHostService = _agentHostService;
    this._notificationService = _notificationService;
    this._renderDisposables = this._register(new DisposableStore());
    this._showGrokApiForm = false;
    this._showDeepSeekApiForm = false;
    this._grokApiKeyDraft = "";
    this._deepSeekApiKeyDraft = "";
    this._submittingApiKeys = /* @__PURE__ */ new Set();
    this._register(this._defaultAccountService.onDidChangeDefaultAccount(() => this._render()));
    this._register(this._defaultAccountService.onDidChangeCopilotTokenInfo(() => this._render()));
    this._register(this._codexAccountService.onDidChangeAccount(() => this._render()));
    this._register(this._grokAccountService.onDidChangeAccount(() => this._render()));
    this._register(this._deepSeekAccountService.onDidChangeAccount(() => this._render()));
    void hydrateVendorAccountSecrets(this._secretStorageService, this._agentHostService);
    this._render();
  }
  _render() {
    this._renderDisposables.clear();
    this._container.replaceChildren();
    const page = append(this._container, $(".forge-account-page"));
    const header = append(page, $("header.forge-account-header"));
    append(header, $("h1")).textContent = localize("forge.account.title", "Account");
    append(header, $("p")).textContent = localize("forge.account.description", "\u7BA1\u7406 GitHub\u3001Codex\u3001Grok Build \u548C DeepSeek Harness \u767B\u5F55\uFF0C\u5E76\u67E5\u770B\u5269\u4F59\u7528\u91CF\u3002");
    const account = this._defaultAccountService.currentDefaultAccount;
    this._renderGitHubCard(page, account);
    this._renderCodexCard(page);
    this._renderGrokCard(page);
    this._renderDeepSeekCard(page);
    const note = append(page, $("p.forge-account-note"));
    note.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
    note.append(document.createTextNode(localize("forge.account.remainingNote", " \u7528\u91CF\u6570\u5B57\u5747\u4E3A\u5269\u4F59\u989D\u5EA6\uFF0C\u4E0D\u662F\u5DF2\u7528\u91CF\u3002GitHub \u548C Codex \u4F1A\u81EA\u52A8\u5237\u65B0\uFF1BGrok \u4E0E DeepSeek \u767B\u5F55\u540E\u4F1A\u540C\u6B65\u5B98\u65B9\u6A21\u578B\u3002")));
  }
  _renderGitHubCard(parent, account) {
    const card = this._createCard(parent, Codicon.github, localize("forge.account.github", "GitHub"), account?.accountName ?? localize("forge.account.notSignedIn", "Not signed in"));
    if (account) {
      append(card.body, $("div.forge-account-plan")).textContent = account.entitlementsData?.copilot_plan ?? account.authenticationProvider.name;
      const quotas = account.entitlementsData?.quota_snapshots;
      this._renderQuota(card.body, localize("forge.account.premiumRequests", "Premium requests"), formatQuota(quotas?.premium_interactions));
      this._renderQuota(card.body, localize("forge.account.chatMessages", "Chat messages"), formatQuota(quotas?.chat));
      this._renderQuota(card.body, localize("forge.account.codeCompletions", "Code completions"), formatQuota(quotas?.completions));
      this._addButton(card.actions, localize("forge.account.refreshUsage", "Refresh Usage"), () => this._defaultAccountService.refresh({ forceRefresh: true }));
      this._addButton(card.actions, localize("forge.account.openUsageSettings", "Usage Settings"), () => this._openerService.open(this._defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings), { openExternal: true }), true);
      this._addButton(card.actions, localize("forge.account.signOut", "Sign Out"), async () => {
        if (await confirmSignOut(this._dialogService, "GitHub")) {
          await this._defaultAccountService.signOut();
        }
      }, true);
    } else {
      append(card.body, $("p.forge-account-empty")).textContent = localize("forge.account.githubSignInDescription", "Sign in to load GitHub remaining allowances if you use them.");
      this._addButton(card.actions, localize("forge.account.signInGitHub", "Sign in to GitHub"), () => this._defaultAccountService.signIn());
    }
  }
  _renderCodexCard(parent) {
    const account = this._codexAccountService.account;
    const signedIn = account.status === "signedIn";
    const card = this._createCard(parent, Codicon.openai, localize("forge.account.codex", "Codex"), account.email ?? (signedIn ? localize("forge.account.signedIn", "Signed in") : localize("forge.account.notSignedIn", "Not signed in")));
    if (signedIn) {
      if (account.planType) {
        append(card.body, $("div.forge-account-plan")).textContent = account.planType;
      }
      this._renderQuota(card.body, localize("forge.account.codexAllowance", "Codex allowance"), formatCodexQuota(account.rateLimit));
      this._addButton(card.actions, localize("forge.account.signOut", "Sign Out"), async () => {
        if (await confirmSignOut(this._dialogService, "Codex")) {
          this._codexAccountService.signOut();
        }
      });
    } else {
      const description = account.status === "downloading" ? localize("forge.account.codexPreparing", "Preparing the Codex runtime\u2026") : account.status === "error" && account.error ? account.error : localize("forge.account.codexSignInDescription", "Sign in with your ChatGPT account to use Codex and load its current allowance.");
      append(card.body, $("p.forge-account-empty")).textContent = description;
      const button = this._addButton(card.actions, localize("forge.account.signInCodex", "Sign in to Codex"), () => this._codexAccountService.signIn());
      button.enabled = account.status !== "downloading" && account.status !== "unavailable";
    }
  }
  _renderGrokCard(parent) {
    const account = this._grokAccountService.account;
    const signedIn = account.status === "signedIn";
    const card = this._createCard(parent, Codicon.rocket, localize("forge.account.grok", "Grok Build"), account.email ?? (signedIn ? localize("forge.account.signedIn", "Signed in") : localize("forge.account.notSignedIn", "Not signed in")));
    if (signedIn) {
      if (account.planType) {
        append(card.body, $("div.forge-account-plan")).textContent = account.planType;
      }
      append(card.body, $("p.forge-account-empty")).textContent = localize("forge.account.vendorSignedInNote", "\u5DF2\u767B\u5F55\u3002\u5B98\u65B9\u6A21\u578B\u5361\u4F1A\u81EA\u52A8\u540C\u6B65\uFF1B\u989D\u5EA6\u7528\u5C3D\u65F6\u53EF\u5728\u8BE5\u5361\u4E2D\u586B\u5199\u7F51\u5740\u548C API \u5BC6\u94A5\u4F5C\u4E3A\u5907\u7528\u3002");
      this._addButton(card.actions, localize("forge.account.signOut", "Sign Out"), () => signOutVendorAccount(this._dialogService, this._secretStorageService, this._agentHostService, "grok", "Grok Build", this._grokAccountService));
      return;
    }
    if (account.status === "signingIn") {
      append(card.body, $("p.forge-account-empty")).textContent = account.authUrl ? localize("forge.account.grokAuthorizeInBrowser", "\u8BF7\u5728\u6D4F\u89C8\u5668\u4E2D\u786E\u8BA4\u6388\u6743\u3002\u5982\u679C\u6CA1\u6709\u81EA\u52A8\u6253\u5F00\uFF0C\u8BF7\u70B9\u51FB\u300C\u6253\u5F00\u767B\u5F55\u9875\u300D\u3002") : localize("forge.account.grokConnecting", "\u6B63\u5728\u8FDE\u63A5 xAI \u767B\u5F55\u670D\u52A1\u2026");
      if (account.userCode) {
        append(card.body, $("div.forge-account-code")).textContent = localize("forge.account.grokUserCode", "\u786E\u8BA4\u7801\uFF1A{0}", account.userCode);
      }
      if (account.authUrl) {
        const urlInput = append(card.body, $("input.forge-account-auth-url"));
        urlInput.type = "text";
        urlInput.readOnly = true;
        urlInput.value = account.authUrl;
        urlInput.ariaLabel = localize("forge.account.openLoginPage", "\u6253\u5F00\u767B\u5F55\u9875");
        this._renderDisposables.add(addDisposableListener(urlInput, "focus", () => urlInput.select()));
        this._addButton(card.actions, localize("forge.account.openLoginPage", "\u6253\u5F00\u767B\u5F55\u9875"), () => this._openExternalUrl(account.authUrl));
      }
      this._addButton(card.actions, localize("forge.account.cancelSignIn", "\u53D6\u6D88"), () => this._grokAccountService.signOut(), true);
      return;
    }
    append(card.body, $("p.forge-account-empty")).textContent = account.status === "error" && account.error ? account.error : localize("forge.account.grokSignInDescription", "\u4F7F\u7528 xAI \u8D26\u53F7\u6216 API \u5BC6\u94A5\u767B\u5F55\u3002\u767B\u5F55\u540E\u4F1A\u81EA\u52A8\u6DFB\u52A0\u5B98\u65B9\u6A21\u578B\u5361\uFF0C\u9000\u51FA\u540E\u8BE5\u5361\u4F1A\u6D88\u5931\u3002");
    this._addButton(card.actions, localize("forge.account.grokLoginAccount", "\u4F7F\u7528 xAI \u8D26\u53F7\u767B\u5F55"), () => {
      this._showGrokApiForm = false;
      this._grokAccountService.signIn();
    });
    this._addButton(card.actions, localize("forge.account.grokLoginApi", "\u4F7F\u7528 API \u5BC6\u94A5\u767B\u5F55"), () => {
      this._showGrokApiForm = true;
      this._render();
    }, true);
    if (this._showGrokApiForm) {
      this._renderApiKeyForm(card.body, "grok", this._grokApiKeyDraft, (value) => {
        this._grokApiKeyDraft = value;
      }, () => this._submitVendorApiKey("grok", this._grokApiKeyDraft, this._grokAccountService));
    }
  }
  _renderDeepSeekCard(parent) {
    const account = this._deepSeekAccountService.account;
    const signedIn = account.status === "signedIn";
    const card = this._createCard(parent, Codicon.beaker, localize("forge.account.deepseek", "DeepSeek Harness"), account.email ?? (signedIn ? localize("forge.account.signedIn", "Signed in") : localize("forge.account.notSignedIn", "Not signed in")));
    if (signedIn) {
      append(card.body, $("p.forge-account-empty")).textContent = localize("forge.account.vendorSignedInNote", "\u5DF2\u767B\u5F55\u3002\u5B98\u65B9\u6A21\u578B\u5361\u4F1A\u81EA\u52A8\u540C\u6B65\uFF1B\u989D\u5EA6\u7528\u5C3D\u65F6\u53EF\u5728\u8BE5\u5361\u4E2D\u586B\u5199\u7F51\u5740\u548C API \u5BC6\u94A5\u4F5C\u4E3A\u5907\u7528\u3002");
      this._addButton(card.actions, localize("forge.account.signOut", "Sign Out"), () => signOutVendorAccount(this._dialogService, this._secretStorageService, this._agentHostService, "deepseek", "DeepSeek Harness", this._deepSeekAccountService));
      return;
    }
    append(card.body, $("p.forge-account-empty")).textContent = account.status === "error" && account.error ? account.error : localize("forge.account.deepSeekSignInDescription", "\u4F7F\u7528 DeepSeek API \u5BC6\u94A5\u767B\u5F55\u3002\u767B\u5F55\u540E\u4F1A\u81EA\u52A8\u6DFB\u52A0\u5B98\u65B9\u6A21\u578B\u5361\uFF0C\u9000\u51FA\u540E\u8BE5\u5361\u4F1A\u6D88\u5931\u3002");
    if (!this._showDeepSeekApiForm) {
      this._addButton(card.actions, localize("forge.account.signInDeepSeek", "\u767B\u5F55 DeepSeek Harness"), () => {
        this._showDeepSeekApiForm = true;
        this._render();
      });
      return;
    }
    this._renderApiKeyForm(card.body, "deepseek", this._deepSeekApiKeyDraft, (value) => {
      this._deepSeekApiKeyDraft = value;
    }, () => this._submitVendorApiKey("deepseek", this._deepSeekApiKeyDraft, this._deepSeekAccountService));
  }
  _renderApiKeyForm(parent, kind, value, onChange, onSubmit) {
    const form = append(parent, $("div.forge-account-api-form"));
    const input = append(form, $("input.forge-account-api-input"));
    const submitting = this._submittingApiKeys.has(kind);
    input.type = "password";
    input.value = value;
    input.disabled = submitting;
    input.placeholder = localize("forge.account.apiKeyPlaceholder", "API key");
    input.ariaLabel = localize("forge.account.apiKeyPlaceholder", "API key");
    this._renderDisposables.add(addDisposableListener(input, "input", () => onChange(input.value)));
    this._renderDisposables.add(addDisposableListener(input, "keydown", (event) => {
      if (event.key === "Enter" && !submitting) {
        event.preventDefault();
        void onSubmit();
      }
    }));
    const button = this._addButton(form, submitting ? localize("forge.account.signingIn", "\u6B63\u5728\u767B\u5F55\u2026") : localize("forge.account.confirmApiKey", "\u786E\u8BA4\u767B\u5F55"), () => onSubmit());
    button.enabled = !submitting;
    if (!submitting) {
      queueMicrotask(() => input.focus());
    }
  }
  async _submitVendorApiKey(kind, apiKey, service) {
    if (this._submittingApiKeys.has(kind)) {
      return;
    }
    const trimmed = apiKey.trim();
    if (!trimmed) {
      this._notificationService.error(localize("forge.account.apiKeyRequired", "\u8BF7\u5148\u586B\u5199 API \u5BC6\u94A5\u3002"));
      return;
    }
    this._submittingApiKeys.add(kind);
    this._render();
    try {
      await storeVendorAccountApiKey(this._secretStorageService, this._agentHostService, kind, trimmed);
      if (kind === "grok") {
        this._showGrokApiForm = false;
        this._grokApiKeyDraft = "";
      } else {
        this._showDeepSeekApiForm = false;
        this._deepSeekApiKeyDraft = "";
      }
      service.signIn();
    } catch (error) {
      this._notificationService.error(error instanceof Error ? error.message : String(error));
    } finally {
      this._submittingApiKeys.delete(kind);
      this._render();
    }
  }
  _createCard(parent, icon, title, identity) {
    const card = append(parent, $("section.forge-account-card"));
    const cardHeader = append(card, $("div.forge-account-card-header"));
    const avatar = append(cardHeader, $("div.forge-account-card-avatar"));
    avatar.classList.add(...ThemeIcon.asClassNameArray(icon));
    const heading = append(cardHeader, $("div.forge-account-card-heading"));
    append(heading, $("h2")).textContent = title;
    append(heading, $("span")).textContent = identity;
    const body = append(card, $("div.forge-account-card-body"));
    const actions = append(card, $("div.forge-account-card-actions"));
    return { body, actions };
  }
  _renderQuota(parent, label, quota) {
    const row = append(parent, $("div.forge-account-quota"));
    const heading = append(row, $("div.forge-account-quota-heading"));
    append(heading, $("span")).textContent = label;
    append(heading, $("strong")).textContent = quota.value;
    if (quota.percent !== void 0) {
      const track = append(row, $("div.forge-account-quota-track"));
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-label", localize("forge.account.quotaProgress", "{0} \u5269\u4F59", label));
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(Math.round(clampPercent(quota.percent))));
      const remaining = append(track, $("div.forge-account-quota-remaining"));
      remaining.style.width = `${clampPercent(quota.percent)}%`;
    }
    if (quota.detail) {
      append(row, $("div.forge-account-quota-detail")).textContent = quota.detail;
    }
  }
  async _openExternalUrl(url) {
    try {
      if (await this._nativeHostService.openExternal(url)) {
        return;
      }
    } catch {
    }
    await openCodexAuthUrl(this._openerService, url);
  }
  _addButton(parent, label, run, secondary = false) {
    const button = this._renderDisposables.add(new Button(parent, { ...defaultButtonStyles, secondary }));
    button.label = label;
    this._renderDisposables.add(button.onDidClick(() => void run()));
    return button;
  }
};
ForgeAccountWidget = __decorateClass([
  __decorateParam(1, IDefaultAccountService),
  __decorateParam(2, ICodexAccountService),
  __decorateParam(3, IGrokAccountService),
  __decorateParam(4, IDeepSeekAccountService),
  __decorateParam(5, IOpenerService),
  __decorateParam(6, INativeHostService),
  __decorateParam(7, IDialogService),
  __decorateParam(8, ISecretStorageService),
  __decorateParam(9, IAgentHostService),
  __decorateParam(10, INotificationService)
], ForgeAccountWidget);
aiCustomizationManagementSectionRegistry.register({
  id: AICustomizationManagementSection.Account,
  label: localize("forge.account.navigationLabel", "Account"),
  icon: Codicon.account,
  description: localize("forge.account.navigationDescription", "\u7BA1\u7406 GitHub\u3001Codex\u3001Grok Build \u548C DeepSeek Harness \u7684\u767B\u5F55\u4E0E\u5269\u4F59\u7528\u91CF\u3002"),
  supportsHarness: (harnessId) => harnessId === SessionType.AgentHostCodex,
  create: (instantiationService, container) => instantiationService.createInstance(ForgeAccountWidget, container)
});
registerWorkbenchContribution2(ForgeAccountToolbarContribution.ID, ForgeAccountToolbarContribution, WorkbenchPhase.BlockRestore);
export {
  getCodexRemainingPercent,
  getGitHubRemainingPercent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZvcmdlXFxlbGVjdHJvbi1icm93c2VyXFxmb3JnZUFjY291bnQuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2ZvcmdlQWNjb3VudC5jc3MnO1xuaW1wb3J0IHsgJCwgYXBwZW5kLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtLCBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudCwgSVF1b3RhU25hcHNob3REYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9hY3Rpb25WaWV3SXRlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBHaXRIdWJQYXRocywgSURlZmF1bHRBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RlZmF1bHRBY2NvdW50L2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIFF1aWNrUGlja0lucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29kZXhBY2NvdW50UmF0ZUxpbWl0SW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vY29kZXhBY2NvdW50LmpzJztcbmltcG9ydCB7IElDb2RleEFjY291bnRTZXJ2aWNlLCBvcGVuQ29kZXhBdXRoVXJsIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYWdlbnRIb3N0L2Jyb3dzZXIvY29kZXhBY2NvdW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGVlcFNlZWtBY2NvdW50U2VydmljZSwgSUdyb2tBY2NvdW50U2VydmljZSwgdHlwZSBJRm9yZ2VWZW5kb3JBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2FnZW50SG9zdC9icm93c2VyL2ZvcmdlVmVuZG9yQWNjb3VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyB0eXBlIEZvcmdlVmVuZG9yQWNjb3VudEtpbmQsIHZlbmRvckFjY291bnRTZWNyZXRSZXNvdXJjZSwgdmVuZG9yQWNjb3VudFNlY3JldFN0b3JhZ2VLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2ZvcmdlVmVuZG9yQWNjb3VudC5qcyc7XG5pbXBvcnQgeyBJU2VjcmV0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zZWNyZXRzL2NvbW1vbi9zZWNyZXRzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudENvbW1hbmRzIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGFpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uUmVnaXN0cnksIElBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbldpZGdldCB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcblxuY29uc3QgRk9SR0VfQUNDT1VOVF9BQ1RJT05fSUQgPSAnZm9yZ2UuYWNjb3VudHMuc2hvd1JlbWFpbmluZ1VzYWdlJztcblxuaW50ZXJmYWNlIElGb3JnZUFjY291bnRRdWlja1BpY2tJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRyZWFkb25seSBydW4/OiAoKSA9PiB2b2lkIHwgUHJvbWlzZTx1bmtub3duPjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvZGV4UmVtYWluaW5nUGVyY2VudChyYXRlTGltaXQ6IElDb2RleEFjY291bnRSYXRlTGltaXRJbmZvIHwgdW5kZWZpbmVkKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHJhdGVMaW1pdCA/IGNsYW1wUGVyY2VudCgxMDAgLSByYXRlTGltaXQudXNlZFBlcmNlbnQpIDogdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0R2l0SHViUmVtYWluaW5nUGVyY2VudChzbmFwc2hvdDogSVF1b3RhU25hcHNob3REYXRhIHwgdW5kZWZpbmVkKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHNuYXBzaG90ID8gY2xhbXBQZXJjZW50KHNuYXBzaG90LnBlcmNlbnRfcmVtYWluaW5nKSA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gY2xhbXBQZXJjZW50KHZhbHVlOiBudW1iZXIpOiBudW1iZXIge1xuXHRyZXR1cm4gTWF0aC5taW4oMTAwLCBNYXRoLm1heCgwLCB2YWx1ZSkpO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRSZW1haW5pbmdQZXJjZW50KHZhbHVlOiBudW1iZXIpOiBzdHJpbmcge1xuXHRyZXR1cm4gbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQucGVyY2VudFJlbWFpbmluZycsIFwiezB9JSByZW1haW5pbmdcIiwgTWF0aC5yb3VuZCh2YWx1ZSkpO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRSZXNldFRpbWUodGltZXN0YW1wOiBudW1iZXIgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoIXRpbWVzdGFtcCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgbWlsbGlzZWNvbmRzID0gdGltZXN0YW1wIDwgMV8wMDBfMDAwXzAwMF8wMDAgPyB0aW1lc3RhbXAgKiAxMDAwIDogdGltZXN0YW1wO1xuXHRyZXR1cm4gbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQucmVzZXRzQXQnLCBcIlJlc2V0cyB7MH1cIiwgbmV3IERhdGUobWlsbGlzZWNvbmRzKS50b0xvY2FsZVN0cmluZygpKTtcbn1cblxuZnVuY3Rpb24gZm9ybWF0UXVvdGEoc25hcHNob3Q6IElRdW90YVNuYXBzaG90RGF0YSB8IHVuZGVmaW5lZCk6IHsgcmVhZG9ubHkgdmFsdWU6IHN0cmluZzsgcmVhZG9ubHkgZGV0YWlsPzogc3RyaW5nOyByZWFkb25seSBwZXJjZW50PzogbnVtYmVyIH0ge1xuXHRpZiAoIXNuYXBzaG90KSB7XG5cdFx0cmV0dXJuIHsgdmFsdWU6IGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LnVzYWdlVW5hdmFpbGFibGUnLCBcIlJlbWFpbmluZyB1c2FnZSB1bmF2YWlsYWJsZVwiKSB9O1xuXHR9XG5cdGlmIChzbmFwc2hvdC51bmxpbWl0ZWQpIHtcblx0XHRyZXR1cm4geyB2YWx1ZTogbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQudW5saW1pdGVkJywgXCJVbmxpbWl0ZWRcIiksIGRldGFpbDogZm9ybWF0UmVzZXRUaW1lKHNuYXBzaG90LnF1b3RhX3Jlc2V0X2F0KSwgcGVyY2VudDogMTAwIH07XG5cdH1cblx0Y29uc3QgcGVyY2VudCA9IGdldEdpdEh1YlJlbWFpbmluZ1BlcmNlbnQoc25hcHNob3QpO1xuXHRjb25zdCBleGFjdCA9IHNuYXBzaG90LnF1b3RhX3JlbWFpbmluZyAhPT0gdW5kZWZpbmVkXG5cdFx0PyBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5leGFjdFJlbWFpbmluZycsIFwiezB9IHJlbWFpbmluZ1wiLCBzbmFwc2hvdC5xdW90YV9yZW1haW5pbmcudG9Mb2NhbGVTdHJpbmcoKSlcblx0XHQ6IHVuZGVmaW5lZDtcblx0Y29uc3QgcmVzZXQgPSBmb3JtYXRSZXNldFRpbWUoc25hcHNob3QucXVvdGFfcmVzZXRfYXQpO1xuXHRyZXR1cm4ge1xuXHRcdHZhbHVlOiBwZXJjZW50ID09PSB1bmRlZmluZWQgPyBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC51c2FnZVVuYXZhaWxhYmxlJywgXCJSZW1haW5pbmcgdXNhZ2UgdW5hdmFpbGFibGVcIikgOiBmb3JtYXRSZW1haW5pbmdQZXJjZW50KHBlcmNlbnQpLFxuXHRcdGRldGFpbDogW2V4YWN0LCByZXNldF0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJyBcdTAwQjcgJykgfHwgdW5kZWZpbmVkLFxuXHRcdHBlcmNlbnQsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGZvcm1hdENvZGV4UXVvdGEocmF0ZUxpbWl0OiBJQ29kZXhBY2NvdW50UmF0ZUxpbWl0SW5mbyB8IHVuZGVmaW5lZCk6IHsgcmVhZG9ubHkgdmFsdWU6IHN0cmluZzsgcmVhZG9ubHkgZGV0YWlsPzogc3RyaW5nOyByZWFkb25seSBwZXJjZW50PzogbnVtYmVyIH0ge1xuXHRjb25zdCBwZXJjZW50ID0gZ2V0Q29kZXhSZW1haW5pbmdQZXJjZW50KHJhdGVMaW1pdCk7XG5cdGlmIChwZXJjZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4geyB2YWx1ZTogbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQudXNhZ2VVbmF2YWlsYWJsZScsIFwiUmVtYWluaW5nIHVzYWdlIHVuYXZhaWxhYmxlXCIpIH07XG5cdH1cblx0Y29uc3Qgd2luZG93ID0gcmF0ZUxpbWl0Py53aW5kb3dEdXJhdGlvbk1pbnNcblx0XHQ/IGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LndpbmRvd0R1cmF0aW9uJywgXCJ7MH0taG91ciB3aW5kb3dcIiwgTWF0aC5yb3VuZChyYXRlTGltaXQud2luZG93RHVyYXRpb25NaW5zIC8gNjApKVxuXHRcdDogdW5kZWZpbmVkO1xuXHRyZXR1cm4ge1xuXHRcdHZhbHVlOiBmb3JtYXRSZW1haW5pbmdQZXJjZW50KHBlcmNlbnQpLFxuXHRcdGRldGFpbDogW3dpbmRvdywgZm9ybWF0UmVzZXRUaW1lKHJhdGVMaW1pdD8ucmVzZXRzQXQpXS5maWx0ZXIoQm9vbGVhbikuam9pbignIFx1MDBCNyAnKSB8fCB1bmRlZmluZWQsXG5cdFx0cGVyY2VudCxcblx0fTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY29uZmlybVNpZ25PdXQoZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsIHByb3ZpZGVyOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5jb25maXJtU2lnbk91dCcsIFwiU2lnbiBvdXQgb2YgezB9P1wiLCBwcm92aWRlciksXG5cdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuc2lnbk91dCcsIFwiU2lnbiBPdXRcIiksXG5cdH0pO1xuXHRyZXR1cm4gcmVzdWx0LmNvbmZpcm1lZDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaHlkcmF0ZVZlbmRvckFjY291bnRTZWNyZXRzKHNlY3JldFN0b3JhZ2U6IElTZWNyZXRTdG9yYWdlU2VydmljZSwgYWdlbnRIb3N0OiBJQWdlbnRIb3N0U2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRmb3IgKGNvbnN0IGtpbmQgb2YgWydncm9rJywgJ2RlZXBzZWVrJ10gYXMgY29uc3Qgc2F0aXNmaWVzIHJlYWRvbmx5IEZvcmdlVmVuZG9yQWNjb3VudEtpbmRbXSkge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0b2tlbiA9IGF3YWl0IHNlY3JldFN0b3JhZ2UuZ2V0KHZlbmRvckFjY291bnRTZWNyZXRTdG9yYWdlS2V5KGtpbmQpKTtcblx0XHRcdGlmICh0b2tlbikge1xuXHRcdFx0XHRhd2FpdCBhZ2VudEhvc3QuYXV0aGVudGljYXRlKHsgcmVzb3VyY2U6IHZlbmRvckFjY291bnRTZWNyZXRSZXNvdXJjZShraW5kKSwgdG9rZW4gfSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBBZ2VudCBob3N0IG1heSBub3QgYmUgcmVhZHkgeWV0OyBBY2NvdW50IHNpZ24taW4gd2lsbCByZXRyeS5cblx0XHR9XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gc3RvcmVWZW5kb3JBY2NvdW50QXBpS2V5KFxuXHRzZWNyZXRTdG9yYWdlOiBJU2VjcmV0U3RvcmFnZVNlcnZpY2UsXG5cdGFnZW50SG9zdDogSUFnZW50SG9zdFNlcnZpY2UsXG5cdGtpbmQ6IEZvcmdlVmVuZG9yQWNjb3VudEtpbmQsXG5cdGFwaUtleTogc3RyaW5nLFxuKTogUHJvbWlzZTx2b2lkPiB7XG5cdGF3YWl0IHNlY3JldFN0b3JhZ2Uuc2V0KHZlbmRvckFjY291bnRTZWNyZXRTdG9yYWdlS2V5KGtpbmQpLCBhcGlLZXkpO1xuXHRhd2FpdCBhZ2VudEhvc3QuYXV0aGVudGljYXRlKHsgcmVzb3VyY2U6IHZlbmRvckFjY291bnRTZWNyZXRSZXNvdXJjZShraW5kKSwgdG9rZW46IGFwaUtleSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY2xlYXJWZW5kb3JBY2NvdW50QXBpS2V5KFxuXHRzZWNyZXRTdG9yYWdlOiBJU2VjcmV0U3RvcmFnZVNlcnZpY2UsXG5cdGFnZW50SG9zdDogSUFnZW50SG9zdFNlcnZpY2UsXG5cdGtpbmQ6IEZvcmdlVmVuZG9yQWNjb3VudEtpbmQsXG4pOiBQcm9taXNlPHZvaWQ+IHtcblx0dHJ5IHtcblx0XHRhd2FpdCBzZWNyZXRTdG9yYWdlLmRlbGV0ZSh2ZW5kb3JBY2NvdW50U2VjcmV0U3RvcmFnZUtleShraW5kKSk7XG5cdH0gY2F0Y2gge1xuXHRcdC8vIElnbm9yZSBtaXNzaW5nIGtleXMuXG5cdH1cblx0dHJ5IHtcblx0XHRhd2FpdCBhZ2VudEhvc3QuYXV0aGVudGljYXRlKHsgcmVzb3VyY2U6IHZlbmRvckFjY291bnRTZWNyZXRSZXNvdXJjZShraW5kKSwgdG9rZW46ICcnIH0pO1xuXHR9IGNhdGNoIHtcblx0XHQvLyBJZ25vcmUgaG9zdCBlcnJvcnMgZHVyaW5nIHNpZ24tb3V0LlxuXHR9XG59XG5cbmZ1bmN0aW9uIG9wZW5BY2NvdW50U2V0dGluZ3MoY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSk6IHZvaWQge1xuXHR2b2lkIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRDb21tYW5kcy5PcGVuRWRpdG9yLCB7XG5cdFx0c2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWNjb3VudCxcblx0XHRzZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29kZXgsXG5cdH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBzaWduT3V0VmVuZG9yQWNjb3VudChcblx0ZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdHNlY3JldFN0b3JhZ2U6IElTZWNyZXRTdG9yYWdlU2VydmljZSxcblx0YWdlbnRIb3N0OiBJQWdlbnRIb3N0U2VydmljZSxcblx0a2luZDogRm9yZ2VWZW5kb3JBY2NvdW50S2luZCxcblx0bGFiZWw6IHN0cmluZyxcblx0c2VydmljZTogSUZvcmdlVmVuZG9yQWNjb3VudFNlcnZpY2UsXG4pOiBQcm9taXNlPHZvaWQ+IHtcblx0aWYgKCFhd2FpdCBjb25maXJtU2lnbk91dChkaWFsb2dTZXJ2aWNlLCBsYWJlbCkpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0YXdhaXQgY2xlYXJWZW5kb3JBY2NvdW50QXBpS2V5KHNlY3JldFN0b3JhZ2UsIGFnZW50SG9zdCwga2luZCk7XG5cdHNlcnZpY2Uuc2lnbk91dCgpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBzaG93QWNjb3VudFF1aWNrUGljayhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRjb25zdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlZmF1bHRBY2NvdW50U2VydmljZSk7XG5cdGNvbnN0IGNvZGV4QWNjb3VudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGV4QWNjb3VudFNlcnZpY2UpO1xuXHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRjb25zdCBvcGVuZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPcGVuZXJTZXJ2aWNlKTtcblx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdGNvbnN0IGdyb2tBY2NvdW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJR3Jva0FjY291bnRTZXJ2aWNlKTtcblx0Y29uc3QgZGVlcFNlZWtBY2NvdW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVlcFNlZWtBY2NvdW50U2VydmljZSk7XG5cdGNvbnN0IHNlY3JldFN0b3JhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZWNyZXRTdG9yYWdlU2VydmljZSk7XG5cdGNvbnN0IGFnZW50SG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFnZW50SG9zdFNlcnZpY2UpO1xuXHRjb25zdCBnaXRodWIgPSBkZWZhdWx0QWNjb3VudFNlcnZpY2UuY3VycmVudERlZmF1bHRBY2NvdW50O1xuXHRjb25zdCBjb2RleCA9IGNvZGV4QWNjb3VudFNlcnZpY2UuYWNjb3VudDtcblx0Y29uc3QgZ3JvayA9IGdyb2tBY2NvdW50U2VydmljZS5hY2NvdW50O1xuXHRjb25zdCBkZWVwc2VlayA9IGRlZXBTZWVrQWNjb3VudFNlcnZpY2UuYWNjb3VudDtcblx0Y29uc3QgZ2l0aHViUXVvdGEgPSBnaXRodWI/LmVudGl0bGVtZW50c0RhdGE/LnF1b3RhX3NuYXBzaG90cztcblx0Y29uc3QgaXRlbXM6IFF1aWNrUGlja0lucHV0PElGb3JnZUFjY291bnRRdWlja1BpY2tJdGVtPltdID0gW1xuXHRcdHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5naXRodWInLCBcIkdpdEh1YlwiKSB9LFxuXHRcdHtcblx0XHRcdGxhYmVsOiBnaXRodWI/LmFjY291bnROYW1lID8/IGxvY2FsaXplKCdmb3JnZS5hY2NvdW50Lm5vdFNpZ25lZEluJywgXCJOb3Qgc2lnbmVkIGluXCIpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGdpdGh1YiA/IGdpdGh1Yi5hdXRoZW50aWNhdGlvblByb3ZpZGVyLm5hbWUgOiB1bmRlZmluZWQsXG5cdFx0XHRpY29uQ2xhc3NlczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5naXRodWIpLFxuXHRcdFx0cGlja2FibGU6IGZhbHNlLFxuXHRcdH0sXG5cdF07XG5cdGlmIChnaXRodWIpIHtcblx0XHRpdGVtcy5wdXNoKFxuXHRcdFx0cXVvdGFRdWlja1BpY2tJdGVtKGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LnByZW1pdW1SZXF1ZXN0cycsIFwiUHJlbWl1bSByZXF1ZXN0c1wiKSwgZ2l0aHViUXVvdGE/LnByZW1pdW1faW50ZXJhY3Rpb25zKSxcblx0XHRcdHF1b3RhUXVpY2tQaWNrSXRlbShsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5jaGF0TWVzc2FnZXMnLCBcIkNoYXQgbWVzc2FnZXNcIiksIGdpdGh1YlF1b3RhPy5jaGF0KSxcblx0XHRcdHF1b3RhUXVpY2tQaWNrSXRlbShsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5jb2RlQ29tcGxldGlvbnMnLCBcIkNvZGUgY29tcGxldGlvbnNcIiksIGdpdGh1YlF1b3RhPy5jb21wbGV0aW9ucyksXG5cdFx0KTtcblx0fVxuXHRpdGVtcy5wdXNoKFxuXHRcdHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5jb2RleCcsIFwiQ29kZXhcIikgfSxcblx0XHR7XG5cdFx0XHRsYWJlbDogY29kZXguZW1haWwgPz8gKGNvZGV4LnN0YXR1cyA9PT0gJ3NpZ25lZEluJyA/IGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LnNpZ25lZEluJywgXCJTaWduZWQgaW5cIikgOiBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5ub3RTaWduZWRJbicsIFwiTm90IHNpZ25lZCBpblwiKSksXG5cdFx0XHRkZXNjcmlwdGlvbjogY29kZXgucGxhblR5cGUsXG5cdFx0XHRpY29uQ2xhc3NlczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5vcGVuYWkpLFxuXHRcdFx0cGlja2FibGU6IGZhbHNlLFxuXHRcdH0sXG5cdCk7XG5cdGlmIChjb2RleC5zdGF0dXMgPT09ICdzaWduZWRJbicpIHtcblx0XHRjb25zdCBxdW90YSA9IGZvcm1hdENvZGV4UXVvdGEoY29kZXgucmF0ZUxpbWl0KTtcblx0XHRpdGVtcy5wdXNoKHsgbGFiZWw6IHF1b3RhLnZhbHVlLCBkZXNjcmlwdGlvbjogcXVvdGEuZGV0YWlsLCBpY29uQ2xhc3NlczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5kYXNoYm9hcmQpLCBwaWNrYWJsZTogZmFsc2UgfSk7XG5cdH1cblx0aXRlbXMucHVzaChcblx0XHR7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuZ3JvaycsIFwiR3JvayBCdWlsZFwiKSB9LFxuXHRcdHtcblx0XHRcdGxhYmVsOiBncm9rLmVtYWlsID8/IChncm9rLnN0YXR1cyA9PT0gJ3NpZ25lZEluJyA/IGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LnNpZ25lZEluJywgXCJTaWduZWQgaW5cIikgOiBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5ub3RTaWduZWRJbicsIFwiTm90IHNpZ25lZCBpblwiKSksXG5cdFx0XHRkZXNjcmlwdGlvbjogZ3Jvay5wbGFuVHlwZSxcblx0XHRcdGljb25DbGFzc2VzOiBUaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLnJvY2tldCksXG5cdFx0XHRwaWNrYWJsZTogZmFsc2UsXG5cdFx0fSxcblx0XHR7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuZGVlcHNlZWsnLCBcIkRlZXBTZWVrIEhhcm5lc3NcIikgfSxcblx0XHR7XG5cdFx0XHRsYWJlbDogZGVlcHNlZWsuZW1haWwgPz8gKGRlZXBzZWVrLnN0YXR1cyA9PT0gJ3NpZ25lZEluJyA/IGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LnNpZ25lZEluJywgXCJTaWduZWQgaW5cIikgOiBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5ub3RTaWduZWRJbicsIFwiTm90IHNpZ25lZCBpblwiKSksXG5cdFx0XHRpY29uQ2xhc3NlczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5iZWFrZXIpLFxuXHRcdFx0cGlja2FibGU6IGZhbHNlLFxuXHRcdH0sXG5cdCk7XG5cdGl0ZW1zLnB1c2goXG5cdFx0eyB0eXBlOiAnc2VwYXJhdG9yJyB9LFxuXHRcdHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5tYW5hZ2UnLCBcIk1hbmFnZSBBY2NvdW50XCIpLFxuXHRcdFx0aWNvbkNsYXNzZXM6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uc2V0dGluZ3NHZWFyKSxcblx0XHRcdHJ1bjogKCkgPT4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudENvbW1hbmRzLk9wZW5FZGl0b3IsIHtcblx0XHRcdFx0c2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWNjb3VudCxcblx0XHRcdFx0c2Vzc2lvblR5cGU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvZGV4LFxuXHRcdFx0fSksXG5cdFx0fSxcblx0XHRnaXRodWIgPyB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQucmVmcmVzaEdpdEh1YlVzYWdlJywgXCJSZWZyZXNoIEdpdEh1YiBVc2FnZVwiKSxcblx0XHRcdGljb25DbGFzc2VzOiBUaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLnJlZnJlc2gpLFxuXHRcdFx0cnVuOiAoKSA9PiBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCh7IGZvcmNlUmVmcmVzaDogdHJ1ZSB9KSxcblx0XHR9IDoge1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LnNpZ25JbkdpdEh1YicsIFwiU2lnbiBpbiB0byBHaXRIdWJcIiksXG5cdFx0XHRpY29uQ2xhc3NlczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5zaWduSW4pLFxuXHRcdFx0cnVuOiAoKSA9PiBkZWZhdWx0QWNjb3VudFNlcnZpY2Uuc2lnbkluKCksXG5cdFx0fSxcblx0XHRjb2RleC5zdGF0dXMgPT09ICdzaWduZWRJbicgPyB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuc2lnbk91dENvZGV4JywgXCJTaWduIG91dCBvZiBDb2RleFwiKSxcblx0XHRcdGljb25DbGFzc2VzOiBUaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLnNpZ25PdXQpLFxuXHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGlmIChhd2FpdCBjb25maXJtU2lnbk91dChkaWFsb2dTZXJ2aWNlLCAnQ29kZXgnKSkge1xuXHRcdFx0XHRcdGNvZGV4QWNjb3VudFNlcnZpY2Uuc2lnbk91dCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0gOiB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuc2lnbkluQ29kZXgnLCBcIlNpZ24gaW4gdG8gQ29kZXhcIiksXG5cdFx0XHRpY29uQ2xhc3NlczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5zaWduSW4pLFxuXHRcdFx0cnVuOiAoKSA9PiBjb2RleEFjY291bnRTZXJ2aWNlLnNpZ25JbigpLFxuXHRcdH0sXG5cdFx0Z3Jvay5zdGF0dXMgPT09ICdzaWduZWRJbicgPyB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuc2lnbk91dEdyb2snLCBcIlNpZ24gb3V0IG9mIEdyb2sgQnVpbGRcIiksXG5cdFx0XHRpY29uQ2xhc3NlczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5zaWduT3V0KSxcblx0XHRcdHJ1bjogKCkgPT4gc2lnbk91dFZlbmRvckFjY291bnQoZGlhbG9nU2VydmljZSwgc2VjcmV0U3RvcmFnZVNlcnZpY2UsIGFnZW50SG9zdFNlcnZpY2UsICdncm9rJywgJ0dyb2sgQnVpbGQnLCBncm9rQWNjb3VudFNlcnZpY2UpLFxuXHRcdH0gOiB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuc2lnbkluR3JvaycsIFwiXHU3NjdCXHU1RjU1IEdyb2sgQnVpbGRcIiksXG5cdFx0XHRpY29uQ2xhc3NlczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5zaWduSW4pLFxuXHRcdFx0cnVuOiAoKSA9PiBvcGVuQWNjb3VudFNldHRpbmdzKGNvbW1hbmRTZXJ2aWNlKSxcblx0XHR9LFxuXHRcdGRlZXBzZWVrLnN0YXR1cyA9PT0gJ3NpZ25lZEluJyA/IHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5zaWduT3V0RGVlcFNlZWsnLCBcIlNpZ24gb3V0IG9mIERlZXBTZWVrIEhhcm5lc3NcIiksXG5cdFx0XHRpY29uQ2xhc3NlczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5zaWduT3V0KSxcblx0XHRcdHJ1bjogKCkgPT4gc2lnbk91dFZlbmRvckFjY291bnQoZGlhbG9nU2VydmljZSwgc2VjcmV0U3RvcmFnZVNlcnZpY2UsIGFnZW50SG9zdFNlcnZpY2UsICdkZWVwc2VlaycsICdEZWVwU2VlayBIYXJuZXNzJywgZGVlcFNlZWtBY2NvdW50U2VydmljZSksXG5cdFx0fSA6IHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5zaWduSW5EZWVwU2VlaycsIFwiXHU3NjdCXHU1RjU1IERlZXBTZWVrIEhhcm5lc3NcIiksXG5cdFx0XHRpY29uQ2xhc3NlczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5zaWduSW4pLFxuXHRcdFx0cnVuOiAoKSA9PiBvcGVuQWNjb3VudFNldHRpbmdzKGNvbW1hbmRTZXJ2aWNlKSxcblx0XHR9LFxuXHRcdGdpdGh1YiA/IHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5vcGVuR2l0SHViVXNhZ2UnLCBcIk9wZW4gR2l0SHViIFVzYWdlIFNldHRpbmdzXCIpLFxuXHRcdFx0aWNvbkNsYXNzZXM6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ubGlua0V4dGVybmFsKSxcblx0XHRcdHJ1bjogKCkgPT4gb3BlbmVyU2VydmljZS5vcGVuKGRlZmF1bHRBY2NvdW50U2VydmljZS5yZXNvbHZlR2l0SHViVXJsKEdpdEh1YlBhdGhzLmNvcGlsb3RTZXR0aW5ncyksIHsgb3BlbkV4dGVybmFsOiB0cnVlIH0pLFxuXHRcdH0gOiB7IGxhYmVsOiAnJywgcGlja2FibGU6IGZhbHNlIH0sXG5cdCk7XG5cdGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhpdGVtcy5maWx0ZXIoaXRlbSA9PiBpdGVtLnR5cGUgPT09ICdzZXBhcmF0b3InIHx8IGl0ZW0ubGFiZWwpLCB7XG5cdFx0dGl0bGU6IGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LnJlbWFpbmluZ1VzYWdlJywgXCJBY2NvdW50cyBhbmQgUmVtYWluaW5nIFVzYWdlXCIpLFxuXHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5yZW1haW5pbmdVc2FnZVBsYWNlaG9sZGVyJywgXCJBbGwgcXVvdGEgdmFsdWVzIGJlbG93IGFyZSByZW1haW5pbmcsIG5vdCB1c2VkXCIpLFxuXHR9KTtcblx0YXdhaXQgc2VsZWN0ZWQ/LnJ1bj8uKCk7XG59XG5cbmZ1bmN0aW9uIHF1b3RhUXVpY2tQaWNrSXRlbShsYWJlbDogc3RyaW5nLCBzbmFwc2hvdDogSVF1b3RhU25hcHNob3REYXRhIHwgdW5kZWZpbmVkKTogSUZvcmdlQWNjb3VudFF1aWNrUGlja0l0ZW0ge1xuXHRjb25zdCBxdW90YSA9IGZvcm1hdFF1b3RhKHNuYXBzaG90KTtcblx0cmV0dXJuIHtcblx0XHRsYWJlbCxcblx0XHRkZXNjcmlwdGlvbjogcXVvdGEudmFsdWUsXG5cdFx0ZGV0YWlsOiBxdW90YS5kZXRhaWwsXG5cdFx0aWNvbkNsYXNzZXM6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uZGFzaGJvYXJkKSxcblx0XHRwaWNrYWJsZTogZmFsc2UsXG5cdH07XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb3JnZUFjY291bnRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEZPUkdFX0FDQ09VTlRfQUNUSU9OX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZm9yZ2UuYWNjb3VudC50b29sYmFyJywgXCJBY2NvdW50cyBhbmQgUmVtYWluaW5nIFVzYWdlXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRWaWV3U2Vzc2lvblRpdGxlVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUuaXNFcXVhbFRvKFNlc3Npb25UeXBlLkFnZW50SG9zdENvZGV4KSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gc2hvd0FjY291bnRRdWlja1BpY2soYWNjZXNzb3IpO1xuXHR9XG59KTtcblxuY2xhc3MgRm9yZ2VBY2NvdW50QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cdGNvbnN0cnVjdG9yKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucykge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIGljb246IGZhbHNlLCBsYWJlbDogdHJ1ZSB9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0dGhpcy5lbGVtZW50Py5jbGFzc0xpc3QuYWRkKCdmb3JnZS1hY2NvdW50LXRvb2xiYXItaXRlbScpO1xuXHRcdGlmICghdGhpcy5sYWJlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmxhYmVsLnRleHRDb250ZW50ID0gJyc7XG5cdFx0dGhpcy5sYWJlbC5jbGFzc0xpc3QuYWRkKCdmb3JnZS1hY2NvdW50LWF2YXRhcnMnKTtcblx0XHRjb25zdCBnaXRodWIgPSBhcHBlbmQodGhpcy5sYWJlbCwgJCgnc3Bhbi5mb3JnZS1hY2NvdW50LWF2YXRhci5naXRodWInKSk7XG5cdFx0Z2l0aHViLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdGdpdGh1Yi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uZ2l0aHViKSk7XG5cdFx0Y29uc3QgY29kZXggPSBhcHBlbmQodGhpcy5sYWJlbCwgJCgnc3Bhbi5mb3JnZS1hY2NvdW50LWF2YXRhci5jb2RleCcpKTtcblx0XHRjb2RleC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRjb2RleC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ub3BlbmFpKSk7XG5cdFx0Y29uc3QgZ3JvayA9IGFwcGVuZCh0aGlzLmxhYmVsLCAkKCdzcGFuLmZvcmdlLWFjY291bnQtYXZhdGFyLmdyb2snKSk7XG5cdFx0Z3Jvay5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRncm9rLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5yb2NrZXQpKTtcblx0XHRjb25zdCBkZWVwc2VlayA9IGFwcGVuZCh0aGlzLmxhYmVsLCAkKCdzcGFuLmZvcmdlLWFjY291bnQtYXZhdGFyLmRlZXBzZWVrJykpO1xuXHRcdGRlZXBzZWVrLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdGRlZXBzZWVrLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5iZWFrZXIpKTtcblx0fVxufVxuXG5jbGFzcyBGb3JnZUFjY291bnRUb29sYmFyQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5mb3JnZUFjY291bnRUb29sYmFyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFjdGlvblZpZXdJdGVtU2VydmljZSBhY3Rpb25WaWV3SXRlbVNlcnZpY2U6IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIGRlZmF1bHRBY2NvdW50U2VydmljZTogSURlZmF1bHRBY2NvdW50U2VydmljZSxcblx0XHRASUNvZGV4QWNjb3VudFNlcnZpY2UgY29kZXhBY2NvdW50U2VydmljZTogSUNvZGV4QWNjb3VudFNlcnZpY2UsXG5cdFx0QElHcm9rQWNjb3VudFNlcnZpY2UgZ3Jva0FjY291bnRTZXJ2aWNlOiBJR3Jva0FjY291bnRTZXJ2aWNlLFxuXHRcdEBJRGVlcFNlZWtBY2NvdW50U2VydmljZSBkZWVwU2Vla0FjY291bnRTZXJ2aWNlOiBJRGVlcFNlZWtBY2NvdW50U2VydmljZSxcblx0XHRASVNlY3JldFN0b3JhZ2VTZXJ2aWNlIHNlY3JldFN0b3JhZ2VTZXJ2aWNlOiBJU2VjcmV0U3RvcmFnZVNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RTZXJ2aWNlIGFnZW50SG9zdFNlcnZpY2U6IElBZ2VudEhvc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IGh5ZHJhdGVTZWNyZXRzID0gKCkgPT4gdm9pZCBoeWRyYXRlVmVuZG9yQWNjb3VudFNlY3JldHMoc2VjcmV0U3RvcmFnZVNlcnZpY2UsIGFnZW50SG9zdFNlcnZpY2UpO1xuXHRcdGh5ZHJhdGVTZWNyZXRzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWdlbnRIb3N0U2VydmljZS5vbkFnZW50SG9zdFN0YXJ0KGh5ZHJhdGVTZWNyZXRzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKFxuXHRcdFx0TWVudUlkLkNoYXRWaWV3U2Vzc2lvblRpdGxlVG9vbGJhcixcblx0XHRcdEZPUkdFX0FDQ09VTlRfQUNUSU9OX0lELFxuXHRcdFx0KGFjdGlvbiwgb3B0aW9ucykgPT4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRm9yZ2VBY2NvdW50QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgb3B0aW9ucyksXG5cdFx0XHRFdmVudC5hbnkoXG5cdFx0XHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50LFxuXHRcdFx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2Uub25EaWRDaGFuZ2VDb3BpbG90VG9rZW5JbmZvLFxuXHRcdFx0XHRjb2RleEFjY291bnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWNjb3VudCxcblx0XHRcdFx0Z3Jva0FjY291bnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWNjb3VudCxcblx0XHRcdFx0ZGVlcFNlZWtBY2NvdW50U2VydmljZS5vbkRpZENoYW5nZUFjY291bnQsXG5cdFx0XHQpLFxuXHRcdCkpO1xuXHR9XG59XG5cbmNsYXNzIEZvcmdlQWNjb3VudFdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25XaWRnZXQge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX3Nob3dHcm9rQXBpRm9ybSA9IGZhbHNlO1xuXHRwcml2YXRlIF9zaG93RGVlcFNlZWtBcGlGb3JtID0gZmFsc2U7XG5cdHByaXZhdGUgX2dyb2tBcGlLZXlEcmFmdCA9ICcnO1xuXHRwcml2YXRlIF9kZWVwU2Vla0FwaUtleURyYWZ0ID0gJyc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1Ym1pdHRpbmdBcGlLZXlzID0gbmV3IFNldDxGb3JnZVZlbmRvckFjY291bnRLaW5kPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0QElEZWZhdWx0QWNjb3VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdEFjY291bnRTZXJ2aWNlOiBJRGVmYXVsdEFjY291bnRTZXJ2aWNlLFxuXHRcdEBJQ29kZXhBY2NvdW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb2RleEFjY291bnRTZXJ2aWNlOiBJQ29kZXhBY2NvdW50U2VydmljZSxcblx0XHRASUdyb2tBY2NvdW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ncm9rQWNjb3VudFNlcnZpY2U6IElHcm9rQWNjb3VudFNlcnZpY2UsXG5cdFx0QElEZWVwU2Vla0FjY291bnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RlZXBTZWVrQWNjb3VudFNlcnZpY2U6IElEZWVwU2Vla0FjY291bnRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASU5hdGl2ZUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25hdGl2ZUhvc3RTZXJ2aWNlOiBJTmF0aXZlSG9zdFNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJU2VjcmV0U3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2VjcmV0U3RvcmFnZVNlcnZpY2U6IElTZWNyZXRTdG9yYWdlU2VydmljZSxcblx0XHRASUFnZW50SG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRIb3N0U2VydmljZTogSUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2RlZmF1bHRBY2NvdW50U2VydmljZS5vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50KCgpID0+IHRoaXMuX3JlbmRlcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZGVmYXVsdEFjY291bnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29waWxvdFRva2VuSW5mbygoKSA9PiB0aGlzLl9yZW5kZXIoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvZGV4QWNjb3VudFNlcnZpY2Uub25EaWRDaGFuZ2VBY2NvdW50KCgpID0+IHRoaXMuX3JlbmRlcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZ3Jva0FjY291bnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWNjb3VudCgoKSA9PiB0aGlzLl9yZW5kZXIoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2RlZXBTZWVrQWNjb3VudFNlcnZpY2Uub25EaWRDaGFuZ2VBY2NvdW50KCgpID0+IHRoaXMuX3JlbmRlcigpKSk7XG5cdFx0dm9pZCBoeWRyYXRlVmVuZG9yQWNjb3VudFNlY3JldHModGhpcy5fc2VjcmV0U3RvcmFnZVNlcnZpY2UsIHRoaXMuX2FnZW50SG9zdFNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlbmRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fY29udGFpbmVyLnJlcGxhY2VDaGlsZHJlbigpO1xuXHRcdGNvbnN0IHBhZ2UgPSBhcHBlbmQodGhpcy5fY29udGFpbmVyLCAkKCcuZm9yZ2UtYWNjb3VudC1wYWdlJykpO1xuXHRcdGNvbnN0IGhlYWRlciA9IGFwcGVuZChwYWdlLCAkKCdoZWFkZXIuZm9yZ2UtYWNjb3VudC1oZWFkZXInKSk7XG5cdFx0YXBwZW5kKGhlYWRlciwgJCgnaDEnKSkudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC50aXRsZScsIFwiQWNjb3VudFwiKTtcblx0XHRhcHBlbmQoaGVhZGVyLCAkKCdwJykpLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuZGVzY3JpcHRpb24nLCBcIlx1N0JBMVx1NzQwNiBHaXRIdWJcdTMwMDFDb2RleFx1MzAwMUdyb2sgQnVpbGQgXHU1NDhDIERlZXBTZWVrIEhhcm5lc3MgXHU3NjdCXHU1RjU1XHVGRjBDXHU1RTc2XHU2N0U1XHU3NzBCXHU1MjY5XHU0RjU5XHU3NTI4XHU5MUNGXHUzMDAyXCIpO1xuXHRcdGNvbnN0IGFjY291bnQgPSB0aGlzLl9kZWZhdWx0QWNjb3VudFNlcnZpY2UuY3VycmVudERlZmF1bHRBY2NvdW50O1xuXHRcdHRoaXMuX3JlbmRlckdpdEh1YkNhcmQocGFnZSwgYWNjb3VudCk7XG5cdFx0dGhpcy5fcmVuZGVyQ29kZXhDYXJkKHBhZ2UpO1xuXHRcdHRoaXMuX3JlbmRlckdyb2tDYXJkKHBhZ2UpO1xuXHRcdHRoaXMuX3JlbmRlckRlZXBTZWVrQ2FyZChwYWdlKTtcblx0XHRjb25zdCBub3RlID0gYXBwZW5kKHBhZ2UsICQoJ3AuZm9yZ2UtYWNjb3VudC1ub3RlJykpO1xuXHRcdG5vdGUuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmluZm8pKTtcblx0XHRub3RlLmFwcGVuZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5yZW1haW5pbmdOb3RlJywgXCIgXHU3NTI4XHU5MUNGXHU2NTcwXHU1QjU3XHU1NzQ3XHU0RTNBXHU1MjY5XHU0RjU5XHU5ODlEXHU1RUE2XHVGRjBDXHU0RTBEXHU2NjJGXHU1REYyXHU3NTI4XHU5MUNGXHUzMDAyR2l0SHViIFx1NTQ4QyBDb2RleCBcdTRGMUFcdTgxRUFcdTUyQThcdTUyMzdcdTY1QjBcdUZGMUJHcm9rIFx1NEUwRSBEZWVwU2VlayBcdTc2N0JcdTVGNTVcdTU0MEVcdTRGMUFcdTU0MENcdTZCNjVcdTVCOThcdTY1QjlcdTZBMjFcdTU3OEJcdTMwMDJcIikpKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckdpdEh1YkNhcmQocGFyZW50OiBIVE1MRWxlbWVudCwgYWNjb3VudDogSURlZmF1bHRBY2NvdW50IHwgbnVsbCk6IHZvaWQge1xuXHRcdGNvbnN0IGNhcmQgPSB0aGlzLl9jcmVhdGVDYXJkKHBhcmVudCwgQ29kaWNvbi5naXRodWIsIGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LmdpdGh1YicsIFwiR2l0SHViXCIpLCBhY2NvdW50Py5hY2NvdW50TmFtZSA/PyBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5ub3RTaWduZWRJbicsIFwiTm90IHNpZ25lZCBpblwiKSk7XG5cdFx0aWYgKGFjY291bnQpIHtcblx0XHRcdGFwcGVuZChjYXJkLmJvZHksICQoJ2Rpdi5mb3JnZS1hY2NvdW50LXBsYW4nKSkudGV4dENvbnRlbnQgPSBhY2NvdW50LmVudGl0bGVtZW50c0RhdGE/LmNvcGlsb3RfcGxhbiA/PyBhY2NvdW50LmF1dGhlbnRpY2F0aW9uUHJvdmlkZXIubmFtZTtcblx0XHRcdGNvbnN0IHF1b3RhcyA9IGFjY291bnQuZW50aXRsZW1lbnRzRGF0YT8ucXVvdGFfc25hcHNob3RzO1xuXHRcdFx0dGhpcy5fcmVuZGVyUXVvdGEoY2FyZC5ib2R5LCBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5wcmVtaXVtUmVxdWVzdHMnLCBcIlByZW1pdW0gcmVxdWVzdHNcIiksIGZvcm1hdFF1b3RhKHF1b3Rhcz8ucHJlbWl1bV9pbnRlcmFjdGlvbnMpKTtcblx0XHRcdHRoaXMuX3JlbmRlclF1b3RhKGNhcmQuYm9keSwgbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuY2hhdE1lc3NhZ2VzJywgXCJDaGF0IG1lc3NhZ2VzXCIpLCBmb3JtYXRRdW90YShxdW90YXM/LmNoYXQpKTtcblx0XHRcdHRoaXMuX3JlbmRlclF1b3RhKGNhcmQuYm9keSwgbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuY29kZUNvbXBsZXRpb25zJywgXCJDb2RlIGNvbXBsZXRpb25zXCIpLCBmb3JtYXRRdW90YShxdW90YXM/LmNvbXBsZXRpb25zKSk7XG5cdFx0XHR0aGlzLl9hZGRCdXR0b24oY2FyZC5hY3Rpb25zLCBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5yZWZyZXNoVXNhZ2UnLCBcIlJlZnJlc2ggVXNhZ2VcIiksICgpID0+IHRoaXMuX2RlZmF1bHRBY2NvdW50U2VydmljZS5yZWZyZXNoKHsgZm9yY2VSZWZyZXNoOiB0cnVlIH0pKTtcblx0XHRcdHRoaXMuX2FkZEJ1dHRvbihjYXJkLmFjdGlvbnMsIGxvY2FsaXplKCdmb3JnZS5hY2NvdW50Lm9wZW5Vc2FnZVNldHRpbmdzJywgXCJVc2FnZSBTZXR0aW5nc1wiKSwgKCkgPT4gdGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKHRoaXMuX2RlZmF1bHRBY2NvdW50U2VydmljZS5yZXNvbHZlR2l0SHViVXJsKEdpdEh1YlBhdGhzLmNvcGlsb3RTZXR0aW5ncyksIHsgb3BlbkV4dGVybmFsOiB0cnVlIH0pLCB0cnVlKTtcblx0XHRcdHRoaXMuX2FkZEJ1dHRvbihjYXJkLmFjdGlvbnMsIGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LnNpZ25PdXQnLCBcIlNpZ24gT3V0XCIpLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGlmIChhd2FpdCBjb25maXJtU2lnbk91dCh0aGlzLl9kaWFsb2dTZXJ2aWNlLCAnR2l0SHViJykpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9kZWZhdWx0QWNjb3VudFNlcnZpY2Uuc2lnbk91dCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXBwZW5kKGNhcmQuYm9keSwgJCgncC5mb3JnZS1hY2NvdW50LWVtcHR5JykpLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuZ2l0aHViU2lnbkluRGVzY3JpcHRpb24nLCBcIlNpZ24gaW4gdG8gbG9hZCBHaXRIdWIgcmVtYWluaW5nIGFsbG93YW5jZXMgaWYgeW91IHVzZSB0aGVtLlwiKTtcblx0XHRcdHRoaXMuX2FkZEJ1dHRvbihjYXJkLmFjdGlvbnMsIGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LnNpZ25JbkdpdEh1YicsIFwiU2lnbiBpbiB0byBHaXRIdWJcIiksICgpID0+IHRoaXMuX2RlZmF1bHRBY2NvdW50U2VydmljZS5zaWduSW4oKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyQ29kZXhDYXJkKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBhY2NvdW50ID0gdGhpcy5fY29kZXhBY2NvdW50U2VydmljZS5hY2NvdW50O1xuXHRcdGNvbnN0IHNpZ25lZEluID0gYWNjb3VudC5zdGF0dXMgPT09ICdzaWduZWRJbic7XG5cdFx0Y29uc3QgY2FyZCA9IHRoaXMuX2NyZWF0ZUNhcmQocGFyZW50LCBDb2RpY29uLm9wZW5haSwgbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuY29kZXgnLCBcIkNvZGV4XCIpLCBhY2NvdW50LmVtYWlsID8/IChzaWduZWRJbiA/IGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LnNpZ25lZEluJywgXCJTaWduZWQgaW5cIikgOiBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5ub3RTaWduZWRJbicsIFwiTm90IHNpZ25lZCBpblwiKSkpO1xuXHRcdGlmIChzaWduZWRJbikge1xuXHRcdFx0aWYgKGFjY291bnQucGxhblR5cGUpIHtcblx0XHRcdFx0YXBwZW5kKGNhcmQuYm9keSwgJCgnZGl2LmZvcmdlLWFjY291bnQtcGxhbicpKS50ZXh0Q29udGVudCA9IGFjY291bnQucGxhblR5cGU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yZW5kZXJRdW90YShjYXJkLmJvZHksIGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LmNvZGV4QWxsb3dhbmNlJywgXCJDb2RleCBhbGxvd2FuY2VcIiksIGZvcm1hdENvZGV4UXVvdGEoYWNjb3VudC5yYXRlTGltaXQpKTtcblx0XHRcdHRoaXMuX2FkZEJ1dHRvbihjYXJkLmFjdGlvbnMsIGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LnNpZ25PdXQnLCBcIlNpZ24gT3V0XCIpLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGlmIChhd2FpdCBjb25maXJtU2lnbk91dCh0aGlzLl9kaWFsb2dTZXJ2aWNlLCAnQ29kZXgnKSkge1xuXHRcdFx0XHRcdHRoaXMuX2NvZGV4QWNjb3VudFNlcnZpY2Uuc2lnbk91dCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBhY2NvdW50LnN0YXR1cyA9PT0gJ2Rvd25sb2FkaW5nJ1xuXHRcdFx0XHQ/IGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LmNvZGV4UHJlcGFyaW5nJywgXCJQcmVwYXJpbmcgdGhlIENvZGV4IHJ1bnRpbWVcdTIwMjZcIilcblx0XHRcdFx0OiBhY2NvdW50LnN0YXR1cyA9PT0gJ2Vycm9yJyAmJiBhY2NvdW50LmVycm9yXG5cdFx0XHRcdFx0PyBhY2NvdW50LmVycm9yXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5jb2RleFNpZ25JbkRlc2NyaXB0aW9uJywgXCJTaWduIGluIHdpdGggeW91ciBDaGF0R1BUIGFjY291bnQgdG8gdXNlIENvZGV4IGFuZCBsb2FkIGl0cyBjdXJyZW50IGFsbG93YW5jZS5cIik7XG5cdFx0XHRhcHBlbmQoY2FyZC5ib2R5LCAkKCdwLmZvcmdlLWFjY291bnQtZW1wdHknKSkudGV4dENvbnRlbnQgPSBkZXNjcmlwdGlvbjtcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IHRoaXMuX2FkZEJ1dHRvbihjYXJkLmFjdGlvbnMsIGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LnNpZ25JbkNvZGV4JywgXCJTaWduIGluIHRvIENvZGV4XCIpLCAoKSA9PiB0aGlzLl9jb2RleEFjY291bnRTZXJ2aWNlLnNpZ25JbigpKTtcblx0XHRcdGJ1dHRvbi5lbmFibGVkID0gYWNjb3VudC5zdGF0dXMgIT09ICdkb3dubG9hZGluZycgJiYgYWNjb3VudC5zdGF0dXMgIT09ICd1bmF2YWlsYWJsZSc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyR3Jva0NhcmQocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGFjY291bnQgPSB0aGlzLl9ncm9rQWNjb3VudFNlcnZpY2UuYWNjb3VudDtcblx0XHRjb25zdCBzaWduZWRJbiA9IGFjY291bnQuc3RhdHVzID09PSAnc2lnbmVkSW4nO1xuXHRcdGNvbnN0IGNhcmQgPSB0aGlzLl9jcmVhdGVDYXJkKHBhcmVudCwgQ29kaWNvbi5yb2NrZXQsIGxvY2FsaXplKCdmb3JnZS5hY2NvdW50Lmdyb2snLCBcIkdyb2sgQnVpbGRcIiksIGFjY291bnQuZW1haWwgPz8gKHNpZ25lZEluID8gbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuc2lnbmVkSW4nLCBcIlNpZ25lZCBpblwiKSA6IGxvY2FsaXplKCdmb3JnZS5hY2NvdW50Lm5vdFNpZ25lZEluJywgXCJOb3Qgc2lnbmVkIGluXCIpKSk7XG5cdFx0aWYgKHNpZ25lZEluKSB7XG5cdFx0XHRpZiAoYWNjb3VudC5wbGFuVHlwZSkge1xuXHRcdFx0XHRhcHBlbmQoY2FyZC5ib2R5LCAkKCdkaXYuZm9yZ2UtYWNjb3VudC1wbGFuJykpLnRleHRDb250ZW50ID0gYWNjb3VudC5wbGFuVHlwZTtcblx0XHRcdH1cblx0XHRcdGFwcGVuZChjYXJkLmJvZHksICQoJ3AuZm9yZ2UtYWNjb3VudC1lbXB0eScpKS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LnZlbmRvclNpZ25lZEluTm90ZScsIFwiXHU1REYyXHU3NjdCXHU1RjU1XHUzMDAyXHU1Qjk4XHU2NUI5XHU2QTIxXHU1NzhCXHU1MzYxXHU0RjFBXHU4MUVBXHU1MkE4XHU1NDBDXHU2QjY1XHVGRjFCXHU5ODlEXHU1RUE2XHU3NTI4XHU1QzNEXHU2NUY2XHU1M0VGXHU1NzI4XHU4QkU1XHU1MzYxXHU0RTJEXHU1ODZCXHU1MTk5XHU3RjUxXHU1NzQwXHU1NDhDIEFQSSBcdTVCQzZcdTk0QTVcdTRGNUNcdTRFM0FcdTU5MDdcdTc1MjhcdTMwMDJcIik7XG5cdFx0XHR0aGlzLl9hZGRCdXR0b24oY2FyZC5hY3Rpb25zLCBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5zaWduT3V0JywgXCJTaWduIE91dFwiKSwgKCkgPT4gc2lnbk91dFZlbmRvckFjY291bnQodGhpcy5fZGlhbG9nU2VydmljZSwgdGhpcy5fc2VjcmV0U3RvcmFnZVNlcnZpY2UsIHRoaXMuX2FnZW50SG9zdFNlcnZpY2UsICdncm9rJywgJ0dyb2sgQnVpbGQnLCB0aGlzLl9ncm9rQWNjb3VudFNlcnZpY2UpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGFjY291bnQuc3RhdHVzID09PSAnc2lnbmluZ0luJykge1xuXHRcdFx0YXBwZW5kKGNhcmQuYm9keSwgJCgncC5mb3JnZS1hY2NvdW50LWVtcHR5JykpLnRleHRDb250ZW50ID0gYWNjb3VudC5hdXRoVXJsXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuZ3Jva0F1dGhvcml6ZUluQnJvd3NlcicsIFwiXHU4QkY3XHU1NzI4XHU2RDRGXHU4OUM4XHU1NjY4XHU0RTJEXHU3ODZFXHU4QkE0XHU2Mzg4XHU2NzQzXHUzMDAyXHU1OTgyXHU2NzlDXHU2Q0ExXHU2NzA5XHU4MUVBXHU1MkE4XHU2MjUzXHU1RjAwXHVGRjBDXHU4QkY3XHU3MEI5XHU1MUZCXHUzMDBDXHU2MjUzXHU1RjAwXHU3NjdCXHU1RjU1XHU5ODc1XHUzMDBEXHUzMDAyXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuZ3Jva0Nvbm5lY3RpbmcnLCBcIlx1NkI2M1x1NTcyOFx1OEZERVx1NjNBNSB4QUkgXHU3NjdCXHU1RjU1XHU2NzBEXHU1MkExXHUyMDI2XCIpO1xuXHRcdFx0aWYgKGFjY291bnQudXNlckNvZGUpIHtcblx0XHRcdFx0YXBwZW5kKGNhcmQuYm9keSwgJCgnZGl2LmZvcmdlLWFjY291bnQtY29kZScpKS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdmb3JnZS5hY2NvdW50Lmdyb2tVc2VyQ29kZScsIFwiXHU3ODZFXHU4QkE0XHU3ODAxXHVGRjFBezB9XCIsIGFjY291bnQudXNlckNvZGUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFjY291bnQuYXV0aFVybCkge1xuXHRcdFx0XHRjb25zdCB1cmxJbnB1dCA9IGFwcGVuZChjYXJkLmJvZHksICQoJ2lucHV0LmZvcmdlLWFjY291bnQtYXV0aC11cmwnKSkgYXMgSFRNTElucHV0RWxlbWVudDtcblx0XHRcdFx0dXJsSW5wdXQudHlwZSA9ICd0ZXh0Jztcblx0XHRcdFx0dXJsSW5wdXQucmVhZE9ubHkgPSB0cnVlO1xuXHRcdFx0XHR1cmxJbnB1dC52YWx1ZSA9IGFjY291bnQuYXV0aFVybDtcblx0XHRcdFx0dXJsSW5wdXQuYXJpYUxhYmVsID0gbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQub3BlbkxvZ2luUGFnZScsIFwiXHU2MjUzXHU1RjAwXHU3NjdCXHU1RjU1XHU5ODc1XCIpO1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHVybElucHV0LCAnZm9jdXMnLCAoKSA9PiB1cmxJbnB1dC5zZWxlY3QoKSkpO1xuXHRcdFx0XHR0aGlzLl9hZGRCdXR0b24oY2FyZC5hY3Rpb25zLCBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5vcGVuTG9naW5QYWdlJywgXCJcdTYyNTNcdTVGMDBcdTc2N0JcdTVGNTVcdTk4NzVcIiksICgpID0+IHRoaXMuX29wZW5FeHRlcm5hbFVybChhY2NvdW50LmF1dGhVcmwhKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9hZGRCdXR0b24oY2FyZC5hY3Rpb25zLCBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5jYW5jZWxTaWduSW4nLCBcIlx1NTNENlx1NkQ4OFwiKSwgKCkgPT4gdGhpcy5fZ3Jva0FjY291bnRTZXJ2aWNlLnNpZ25PdXQoKSwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGFwcGVuZChjYXJkLmJvZHksICQoJ3AuZm9yZ2UtYWNjb3VudC1lbXB0eScpKS50ZXh0Q29udGVudCA9IGFjY291bnQuc3RhdHVzID09PSAnZXJyb3InICYmIGFjY291bnQuZXJyb3Jcblx0XHRcdD8gYWNjb3VudC5lcnJvclxuXHRcdFx0OiBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5ncm9rU2lnbkluRGVzY3JpcHRpb24nLCBcIlx1NEY3Rlx1NzUyOCB4QUkgXHU4RDI2XHU1M0Y3XHU2MjE2IEFQSSBcdTVCQzZcdTk0QTVcdTc2N0JcdTVGNTVcdTMwMDJcdTc2N0JcdTVGNTVcdTU0MEVcdTRGMUFcdTgxRUFcdTUyQThcdTZERkJcdTUyQTBcdTVCOThcdTY1QjlcdTZBMjFcdTU3OEJcdTUzNjFcdUZGMENcdTkwMDBcdTUxRkFcdTU0MEVcdThCRTVcdTUzNjFcdTRGMUFcdTZEODhcdTU5MzFcdTMwMDJcIik7XG5cdFx0dGhpcy5fYWRkQnV0dG9uKGNhcmQuYWN0aW9ucywgbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuZ3Jva0xvZ2luQWNjb3VudCcsIFwiXHU0RjdGXHU3NTI4IHhBSSBcdThEMjZcdTUzRjdcdTc2N0JcdTVGNTVcIiksICgpID0+IHtcblx0XHRcdHRoaXMuX3Nob3dHcm9rQXBpRm9ybSA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fZ3Jva0FjY291bnRTZXJ2aWNlLnNpZ25JbigpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX2FkZEJ1dHRvbihjYXJkLmFjdGlvbnMsIGxvY2FsaXplKCdmb3JnZS5hY2NvdW50Lmdyb2tMb2dpbkFwaScsIFwiXHU0RjdGXHU3NTI4IEFQSSBcdTVCQzZcdTk0QTVcdTc2N0JcdTVGNTVcIiksICgpID0+IHtcblx0XHRcdHRoaXMuX3Nob3dHcm9rQXBpRm9ybSA9IHRydWU7XG5cdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHR9LCB0cnVlKTtcblx0XHRpZiAodGhpcy5fc2hvd0dyb2tBcGlGb3JtKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJBcGlLZXlGb3JtKGNhcmQuYm9keSwgJ2dyb2snLCB0aGlzLl9ncm9rQXBpS2V5RHJhZnQsIHZhbHVlID0+IHsgdGhpcy5fZ3Jva0FwaUtleURyYWZ0ID0gdmFsdWU7IH0sICgpID0+IHRoaXMuX3N1Ym1pdFZlbmRvckFwaUtleSgnZ3JvaycsIHRoaXMuX2dyb2tBcGlLZXlEcmFmdCwgdGhpcy5fZ3Jva0FjY291bnRTZXJ2aWNlKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyRGVlcFNlZWtDYXJkKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBhY2NvdW50ID0gdGhpcy5fZGVlcFNlZWtBY2NvdW50U2VydmljZS5hY2NvdW50O1xuXHRcdGNvbnN0IHNpZ25lZEluID0gYWNjb3VudC5zdGF0dXMgPT09ICdzaWduZWRJbic7XG5cdFx0Y29uc3QgY2FyZCA9IHRoaXMuX2NyZWF0ZUNhcmQocGFyZW50LCBDb2RpY29uLmJlYWtlciwgbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuZGVlcHNlZWsnLCBcIkRlZXBTZWVrIEhhcm5lc3NcIiksIGFjY291bnQuZW1haWwgPz8gKHNpZ25lZEluID8gbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuc2lnbmVkSW4nLCBcIlNpZ25lZCBpblwiKSA6IGxvY2FsaXplKCdmb3JnZS5hY2NvdW50Lm5vdFNpZ25lZEluJywgXCJOb3Qgc2lnbmVkIGluXCIpKSk7XG5cdFx0aWYgKHNpZ25lZEluKSB7XG5cdFx0XHRhcHBlbmQoY2FyZC5ib2R5LCAkKCdwLmZvcmdlLWFjY291bnQtZW1wdHknKSkudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC52ZW5kb3JTaWduZWRJbk5vdGUnLCBcIlx1NURGMlx1NzY3Qlx1NUY1NVx1MzAwMlx1NUI5OFx1NjVCOVx1NkEyMVx1NTc4Qlx1NTM2MVx1NEYxQVx1ODFFQVx1NTJBOFx1NTQwQ1x1NkI2NVx1RkYxQlx1OTg5RFx1NUVBNlx1NzUyOFx1NUMzRFx1NjVGNlx1NTNFRlx1NTcyOFx1OEJFNVx1NTM2MVx1NEUyRFx1NTg2Qlx1NTE5OVx1N0Y1MVx1NTc0MFx1NTQ4QyBBUEkgXHU1QkM2XHU5NEE1XHU0RjVDXHU0RTNBXHU1OTA3XHU3NTI4XHUzMDAyXCIpO1xuXHRcdFx0dGhpcy5fYWRkQnV0dG9uKGNhcmQuYWN0aW9ucywgbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuc2lnbk91dCcsIFwiU2lnbiBPdXRcIiksICgpID0+IHNpZ25PdXRWZW5kb3JBY2NvdW50KHRoaXMuX2RpYWxvZ1NlcnZpY2UsIHRoaXMuX3NlY3JldFN0b3JhZ2VTZXJ2aWNlLCB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLCAnZGVlcHNlZWsnLCAnRGVlcFNlZWsgSGFybmVzcycsIHRoaXMuX2RlZXBTZWVrQWNjb3VudFNlcnZpY2UpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXBwZW5kKGNhcmQuYm9keSwgJCgncC5mb3JnZS1hY2NvdW50LWVtcHR5JykpLnRleHRDb250ZW50ID0gYWNjb3VudC5zdGF0dXMgPT09ICdlcnJvcicgJiYgYWNjb3VudC5lcnJvclxuXHRcdFx0PyBhY2NvdW50LmVycm9yXG5cdFx0XHQ6IGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LmRlZXBTZWVrU2lnbkluRGVzY3JpcHRpb24nLCBcIlx1NEY3Rlx1NzUyOCBEZWVwU2VlayBBUEkgXHU1QkM2XHU5NEE1XHU3NjdCXHU1RjU1XHUzMDAyXHU3NjdCXHU1RjU1XHU1NDBFXHU0RjFBXHU4MUVBXHU1MkE4XHU2REZCXHU1MkEwXHU1Qjk4XHU2NUI5XHU2QTIxXHU1NzhCXHU1MzYxXHVGRjBDXHU5MDAwXHU1MUZBXHU1NDBFXHU4QkU1XHU1MzYxXHU0RjFBXHU2RDg4XHU1OTMxXHUzMDAyXCIpO1xuXHRcdGlmICghdGhpcy5fc2hvd0RlZXBTZWVrQXBpRm9ybSkge1xuXHRcdFx0dGhpcy5fYWRkQnV0dG9uKGNhcmQuYWN0aW9ucywgbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuc2lnbkluRGVlcFNlZWsnLCBcIlx1NzY3Qlx1NUY1NSBEZWVwU2VlayBIYXJuZXNzXCIpLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Nob3dEZWVwU2Vla0FwaUZvcm0gPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZW5kZXJBcGlLZXlGb3JtKGNhcmQuYm9keSwgJ2RlZXBzZWVrJywgdGhpcy5fZGVlcFNlZWtBcGlLZXlEcmFmdCwgdmFsdWUgPT4geyB0aGlzLl9kZWVwU2Vla0FwaUtleURyYWZ0ID0gdmFsdWU7IH0sICgpID0+IHRoaXMuX3N1Ym1pdFZlbmRvckFwaUtleSgnZGVlcHNlZWsnLCB0aGlzLl9kZWVwU2Vla0FwaUtleURyYWZ0LCB0aGlzLl9kZWVwU2Vla0FjY291bnRTZXJ2aWNlKSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJBcGlLZXlGb3JtKHBhcmVudDogSFRNTEVsZW1lbnQsIGtpbmQ6IEZvcmdlVmVuZG9yQWNjb3VudEtpbmQsIHZhbHVlOiBzdHJpbmcsIG9uQ2hhbmdlOiAodmFsdWU6IHN0cmluZykgPT4gdm9pZCwgb25TdWJtaXQ6ICgpID0+IFByb21pc2U8dm9pZD4pOiB2b2lkIHtcblx0XHRjb25zdCBmb3JtID0gYXBwZW5kKHBhcmVudCwgJCgnZGl2LmZvcmdlLWFjY291bnQtYXBpLWZvcm0nKSk7XG5cdFx0Y29uc3QgaW5wdXQgPSBhcHBlbmQoZm9ybSwgJCgnaW5wdXQuZm9yZ2UtYWNjb3VudC1hcGktaW5wdXQnKSkgYXMgSFRNTElucHV0RWxlbWVudDtcblx0XHRjb25zdCBzdWJtaXR0aW5nID0gdGhpcy5fc3VibWl0dGluZ0FwaUtleXMuaGFzKGtpbmQpO1xuXHRcdGlucHV0LnR5cGUgPSAncGFzc3dvcmQnO1xuXHRcdGlucHV0LnZhbHVlID0gdmFsdWU7XG5cdFx0aW5wdXQuZGlzYWJsZWQgPSBzdWJtaXR0aW5nO1xuXHRcdGlucHV0LnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuYXBpS2V5UGxhY2Vob2xkZXInLCBcIkFQSSBrZXlcIik7XG5cdFx0aW5wdXQuYXJpYUxhYmVsID0gbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQuYXBpS2V5UGxhY2Vob2xkZXInLCBcIkFQSSBrZXlcIik7XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dCwgJ2lucHV0JywgKCkgPT4gb25DaGFuZ2UoaW5wdXQudmFsdWUpKSk7XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dCwgJ2tleWRvd24nLCBldmVudCA9PiB7XG5cdFx0XHRpZiAoZXZlbnQua2V5ID09PSAnRW50ZXInICYmICFzdWJtaXR0aW5nKSB7XG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHZvaWQgb25TdWJtaXQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3QgYnV0dG9uID0gdGhpcy5fYWRkQnV0dG9uKGZvcm0sIHN1Ym1pdHRpbmcgPyBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5zaWduaW5nSW4nLCBcIlx1NkI2M1x1NTcyOFx1NzY3Qlx1NUY1NVx1MjAyNlwiKSA6IGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LmNvbmZpcm1BcGlLZXknLCBcIlx1Nzg2RVx1OEJBNFx1NzY3Qlx1NUY1NVwiKSwgKCkgPT4gb25TdWJtaXQoKSk7XG5cdFx0YnV0dG9uLmVuYWJsZWQgPSAhc3VibWl0dGluZztcblx0XHRpZiAoIXN1Ym1pdHRpbmcpIHtcblx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IGlucHV0LmZvY3VzKCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3N1Ym1pdFZlbmRvckFwaUtleShraW5kOiBGb3JnZVZlbmRvckFjY291bnRLaW5kLCBhcGlLZXk6IHN0cmluZywgc2VydmljZTogSUZvcmdlVmVuZG9yQWNjb3VudFNlcnZpY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fc3VibWl0dGluZ0FwaUtleXMuaGFzKGtpbmQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRyaW1tZWQgPSBhcGlLZXkudHJpbSgpO1xuXHRcdGlmICghdHJpbW1lZCkge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5hcGlLZXlSZXF1aXJlZCcsIFwiXHU4QkY3XHU1MTQ4XHU1ODZCXHU1MTk5IEFQSSBcdTVCQzZcdTk0QTVcdTMwMDJcIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdWJtaXR0aW5nQXBpS2V5cy5hZGQoa2luZCk7XG5cdFx0dGhpcy5fcmVuZGVyKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHN0b3JlVmVuZG9yQWNjb3VudEFwaUtleSh0aGlzLl9zZWNyZXRTdG9yYWdlU2VydmljZSwgdGhpcy5fYWdlbnRIb3N0U2VydmljZSwga2luZCwgdHJpbW1lZCk7XG5cdFx0XHRpZiAoa2luZCA9PT0gJ2dyb2snKSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dHcm9rQXBpRm9ybSA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLl9ncm9rQXBpS2V5RHJhZnQgPSAnJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dEZWVwU2Vla0FwaUZvcm0gPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fZGVlcFNlZWtBcGlLZXlEcmFmdCA9ICcnO1xuXHRcdFx0fVxuXHRcdFx0c2VydmljZS5zaWduSW4oKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcikpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9zdWJtaXR0aW5nQXBpS2V5cy5kZWxldGUoa2luZCk7XG5cdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVDYXJkKHBhcmVudDogSFRNTEVsZW1lbnQsIGljb246IFRoZW1lSWNvbiwgdGl0bGU6IHN0cmluZywgaWRlbnRpdHk6IHN0cmluZyk6IHsgcmVhZG9ubHkgYm9keTogSFRNTEVsZW1lbnQ7IHJlYWRvbmx5IGFjdGlvbnM6IEhUTUxFbGVtZW50IH0ge1xuXHRcdGNvbnN0IGNhcmQgPSBhcHBlbmQocGFyZW50LCAkKCdzZWN0aW9uLmZvcmdlLWFjY291bnQtY2FyZCcpKTtcblx0XHRjb25zdCBjYXJkSGVhZGVyID0gYXBwZW5kKGNhcmQsICQoJ2Rpdi5mb3JnZS1hY2NvdW50LWNhcmQtaGVhZGVyJykpO1xuXHRcdGNvbnN0IGF2YXRhciA9IGFwcGVuZChjYXJkSGVhZGVyLCAkKCdkaXYuZm9yZ2UtYWNjb3VudC1jYXJkLWF2YXRhcicpKTtcblx0XHRhdmF0YXIuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShpY29uKSk7XG5cdFx0Y29uc3QgaGVhZGluZyA9IGFwcGVuZChjYXJkSGVhZGVyLCAkKCdkaXYuZm9yZ2UtYWNjb3VudC1jYXJkLWhlYWRpbmcnKSk7XG5cdFx0YXBwZW5kKGhlYWRpbmcsICQoJ2gyJykpLnRleHRDb250ZW50ID0gdGl0bGU7XG5cdFx0YXBwZW5kKGhlYWRpbmcsICQoJ3NwYW4nKSkudGV4dENvbnRlbnQgPSBpZGVudGl0eTtcblx0XHRjb25zdCBib2R5ID0gYXBwZW5kKGNhcmQsICQoJ2Rpdi5mb3JnZS1hY2NvdW50LWNhcmQtYm9keScpKTtcblx0XHRjb25zdCBhY3Rpb25zID0gYXBwZW5kKGNhcmQsICQoJ2Rpdi5mb3JnZS1hY2NvdW50LWNhcmQtYWN0aW9ucycpKTtcblx0XHRyZXR1cm4geyBib2R5LCBhY3Rpb25zIH07XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJRdW90YShwYXJlbnQ6IEhUTUxFbGVtZW50LCBsYWJlbDogc3RyaW5nLCBxdW90YTogeyByZWFkb25seSB2YWx1ZTogc3RyaW5nOyByZWFkb25seSBkZXRhaWw/OiBzdHJpbmc7IHJlYWRvbmx5IHBlcmNlbnQ/OiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdGNvbnN0IHJvdyA9IGFwcGVuZChwYXJlbnQsICQoJ2Rpdi5mb3JnZS1hY2NvdW50LXF1b3RhJykpO1xuXHRcdGNvbnN0IGhlYWRpbmcgPSBhcHBlbmQocm93LCAkKCdkaXYuZm9yZ2UtYWNjb3VudC1xdW90YS1oZWFkaW5nJykpO1xuXHRcdGFwcGVuZChoZWFkaW5nLCAkKCdzcGFuJykpLnRleHRDb250ZW50ID0gbGFiZWw7XG5cdFx0YXBwZW5kKGhlYWRpbmcsICQoJ3N0cm9uZycpKS50ZXh0Q29udGVudCA9IHF1b3RhLnZhbHVlO1xuXHRcdGlmIChxdW90YS5wZXJjZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHRyYWNrID0gYXBwZW5kKHJvdywgJCgnZGl2LmZvcmdlLWFjY291bnQtcXVvdGEtdHJhY2snKSk7XG5cdFx0XHR0cmFjay5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAncHJvZ3Jlc3NiYXInKTtcblx0XHRcdHRyYWNrLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdmb3JnZS5hY2NvdW50LnF1b3RhUHJvZ3Jlc3MnLCBcInswfSBcdTUyNjlcdTRGNTlcIiwgbGFiZWwpKTtcblx0XHRcdHRyYWNrLnNldEF0dHJpYnV0ZSgnYXJpYS12YWx1ZW1pbicsICcwJyk7XG5cdFx0XHR0cmFjay5zZXRBdHRyaWJ1dGUoJ2FyaWEtdmFsdWVtYXgnLCAnMTAwJyk7XG5cdFx0XHR0cmFjay5zZXRBdHRyaWJ1dGUoJ2FyaWEtdmFsdWVub3cnLCBTdHJpbmcoTWF0aC5yb3VuZChjbGFtcFBlcmNlbnQocXVvdGEucGVyY2VudCkpKSk7XG5cdFx0XHRjb25zdCByZW1haW5pbmcgPSBhcHBlbmQodHJhY2ssICQoJ2Rpdi5mb3JnZS1hY2NvdW50LXF1b3RhLXJlbWFpbmluZycpKTtcblx0XHRcdHJlbWFpbmluZy5zdHlsZS53aWR0aCA9IGAke2NsYW1wUGVyY2VudChxdW90YS5wZXJjZW50KX0lYDtcblx0XHR9XG5cdFx0aWYgKHF1b3RhLmRldGFpbCkge1xuXHRcdFx0YXBwZW5kKHJvdywgJCgnZGl2LmZvcmdlLWFjY291bnQtcXVvdGEtZGV0YWlsJykpLnRleHRDb250ZW50ID0gcXVvdGEuZGV0YWlsO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29wZW5FeHRlcm5hbFVybCh1cmw6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5fbmF0aXZlSG9zdFNlcnZpY2Uub3BlbkV4dGVybmFsKHVybCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gRmFsbCB0aHJvdWdoIHRvIHRoZSBvcGVuZXIgc2VydmljZS5cblx0XHR9XG5cdFx0YXdhaXQgb3BlbkNvZGV4QXV0aFVybCh0aGlzLl9vcGVuZXJTZXJ2aWNlLCB1cmwpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkQnV0dG9uKHBhcmVudDogSFRNTEVsZW1lbnQsIGxhYmVsOiBzdHJpbmcsIHJ1bjogKCkgPT4gdm9pZCB8IFByb21pc2U8dW5rbm93bj4sIHNlY29uZGFyeSA9IGZhbHNlKTogQnV0dG9uIHtcblx0XHRjb25zdCBidXR0b24gPSB0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihwYXJlbnQsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5IH0pKTtcblx0XHRidXR0b24ubGFiZWwgPSBsYWJlbDtcblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoYnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdm9pZCBydW4oKSkpO1xuXHRcdHJldHVybiBidXR0b247XG5cdH1cbn1cblxuYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25SZWdpc3RyeS5yZWdpc3Rlcih7XG5cdGlkOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BY2NvdW50LFxuXHRsYWJlbDogbG9jYWxpemUoJ2ZvcmdlLmFjY291bnQubmF2aWdhdGlvbkxhYmVsJywgXCJBY2NvdW50XCIpLFxuXHRpY29uOiBDb2RpY29uLmFjY291bnQsXG5cdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZm9yZ2UuYWNjb3VudC5uYXZpZ2F0aW9uRGVzY3JpcHRpb24nLCBcIlx1N0JBMVx1NzQwNiBHaXRIdWJcdTMwMDFDb2RleFx1MzAwMUdyb2sgQnVpbGQgXHU1NDhDIERlZXBTZWVrIEhhcm5lc3MgXHU3Njg0XHU3NjdCXHU1RjU1XHU0RTBFXHU1MjY5XHU0RjU5XHU3NTI4XHU5MUNGXHUzMDAyXCIpLFxuXHRzdXBwb3J0c0hhcm5lc3M6IGhhcm5lc3NJZCA9PiBoYXJuZXNzSWQgPT09IFNlc3Npb25UeXBlLkFnZW50SG9zdENvZGV4LFxuXHRjcmVhdGU6IChpbnN0YW50aWF0aW9uU2VydmljZSwgY29udGFpbmVyKSA9PiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGb3JnZUFjY291bnRXaWRnZXQsIGNvbnRhaW5lciksXG59KTtcblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKEZvcmdlQWNjb3VudFRvb2xiYXJDb250cmlidXRpb24uSUQsIEZvcmdlQWNjb3VudFRvb2xiYXJDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLEdBQUcsUUFBUSw2QkFBNkI7QUFDakQsU0FBUyxzQkFBOEM7QUFDdkQsU0FBUyxjQUFjO0FBRXZCLFNBQVMsZUFBZTtBQUV4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGFBQWEsOEJBQThCO0FBQ3BELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNC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
