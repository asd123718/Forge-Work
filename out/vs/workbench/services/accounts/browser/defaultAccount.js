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
import { distinct } from "../../../../base/common/arrays.js";
import { Barrier, RunOnceScheduler, ThrottledDelayer, timeout } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { getErrorMessage } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { equals } from "../../../../base/common/objects.js";
import { isWeb } from "../../../../base/common/platform.js";
import { isString, isUndefined } from "../../../../base/common/types.js";
import { localize2 } from "../../../../nls.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IDefaultAccountService, MANAGED_SETTINGS_UPDATE_REQUIRED_ERROR_CODE } from "../../../../platform/defaultAccount/common/defaultAccount.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { asJson, asText, IRequestService, isClientError, isSuccess, readHeader, retryAfterFromHeaders } from "../../../../platform/request/common/request.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { IAuthenticationExtensionsService, IAuthenticationService } from "../../authentication/common/authentication.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { IHostService } from "../../host/browser/host.js";
import { adaptManagedSettings, appendManagedSettingsClientIdentity, parseManagedSettingsCompatibilityError } from "./managedSettings.js";
const DEFAULT_ACCOUNT_SIGN_IN_COMMAND = "workbench.actions.accounts.signIn";
var DefaultAccountStatus = /* @__PURE__ */ ((DefaultAccountStatus2) => {
  DefaultAccountStatus2["Uninitialized"] = "uninitialized";
  DefaultAccountStatus2["Unavailable"] = "unavailable";
  DefaultAccountStatus2["Available"] = "available";
  return DefaultAccountStatus2;
})(DefaultAccountStatus || {});
const CONTEXT_DEFAULT_ACCOUNT_STATE = new RawContextKey("defaultAccountStatus", "uninitialized" /* Uninitialized */);
const CACHED_POLICY_DATA_KEY = "defaultAccount.cachedPolicyData";
const ACCOUNT_DATA_POLL_INTERVAL_MS = 60 * 60 * 1e3;
const MANAGED_SETTINGS_REQUEST_TIMEOUT_MS = 5e3;
function toDefaultAccountConfig(defaultChatAgent) {
  return {
    preferredExtensions: [
      defaultChatAgent.chatExtensionId,
      defaultChatAgent.extensionId
    ],
    authenticationProvider: {
      default: {
        id: defaultChatAgent.provider.default.id,
        name: defaultChatAgent.provider.default.name
      },
      enterprise: {
        id: defaultChatAgent.provider.enterprise.id,
        name: defaultChatAgent.provider.enterprise.name
      },
      enterpriseProviderConfig: `${defaultChatAgent.completionsAdvancedSetting}.authProvider`,
      enterpriseProviderUriSetting: defaultChatAgent.providerUriSetting,
      scopes: defaultChatAgent.providerScopes
    },
    entitlementUrl: defaultChatAgent.entitlementUrl,
    tokenEntitlementUrl: defaultChatAgent.tokenEntitlementUrl,
    mcpRegistryDataUrl: defaultChatAgent.mcpRegistryDataUrl,
    managedSettingsUrl: defaultChatAgent.managedSettingsUrl
  };
}
let DefaultAccountService = class extends Disposable {
  constructor(productService) {
    super();
    this.defaultAccount = null;
    this.initBarrier = new Barrier();
    this._onDidChangeDefaultAccount = this._register(new Emitter());
    this.onDidChangeDefaultAccount = this._onDidChangeDefaultAccount.event;
    this._onDidChangePolicyData = this._register(new Emitter());
    this.onDidChangePolicyData = this._onDidChangePolicyData.event;
    this._onDidChangeCopilotTokenInfo = this._register(new Emitter());
    this.onDidChangeCopilotTokenInfo = this._onDidChangeCopilotTokenInfo.event;
    this._onDidChangeManagedSettingsCompatibilityError = this._register(new Emitter());
    this.onDidChangeManagedSettingsCompatibilityError = this._onDidChangeManagedSettingsCompatibilityError.event;
    this.defaultAccountProvider = null;
    this.defaultAccountConfig = productService.defaultChatAgent ? toDefaultAccountConfig(productService.defaultChatAgent) : void 0;
    if (!this.defaultAccountConfig) {
      this.initBarrier.open();
    }
  }
  get currentDefaultAccount() {
    return this.defaultAccount;
  }
  get policyData() {
    return this.defaultAccountProvider?.policyData ?? null;
  }
  get copilotTokenInfo() {
    return this.defaultAccountProvider?.copilotTokenInfo ?? null;
  }
  get managedSettingsFetchStatus() {
    return this.defaultAccountProvider?.managedSettingsFetchStatus ?? null;
  }
  get managedSettingsFetchedAt() {
    return this.defaultAccountProvider?.managedSettingsFetchedAt ?? null;
  }
  get managedSettingsRawResponse() {
    return this.defaultAccountProvider?.managedSettingsRawResponse ?? null;
  }
  get managedSettingsCompatibilityError() {
    return this.defaultAccountProvider?.managedSettingsCompatibilityError ?? null;
  }
  async getDefaultAccount() {
    await this.initBarrier.wait();
    return this.defaultAccount;
  }
  getDefaultAccountAuthenticationProvider() {
    if (this.defaultAccountProvider) {
      return this.defaultAccountProvider.getDefaultAccountAuthenticationProvider();
    }
    return {
      ...this.defaultAccountConfig?.authenticationProvider.default ?? { id: "github", name: "GitHub" },
      enterprise: false
    };
  }
  setDefaultAccountProvider(provider) {
    if (this.defaultAccountProvider) {
      throw new Error("Default account provider is already set");
    }
    this.defaultAccountProvider = provider;
    this._register(provider.onDidChangeManagedSettingsCompatibilityError((error) => this._onDidChangeManagedSettingsCompatibilityError.fire(error)));
    if (this.defaultAccountProvider.policyData) {
      this._onDidChangePolicyData.fire(this.defaultAccountProvider.policyData);
    }
    if (this.defaultAccountProvider.managedSettingsCompatibilityError) {
      this._onDidChangeManagedSettingsCompatibilityError.fire(this.defaultAccountProvider.managedSettingsCompatibilityError);
    }
    provider.refresh().then((account) => {
      this.defaultAccount = account;
    }).finally(() => {
      this.initBarrier.open();
      this._register(provider.onDidChangeDefaultAccount((account) => this.setDefaultAccount(account)));
      this._register(provider.onDidChangePolicyData((policyData) => this._onDidChangePolicyData.fire(policyData)));
      this._register(provider.onDidChangeCopilotTokenInfo((tokenInfo) => this._onDidChangeCopilotTokenInfo.fire(tokenInfo)));
    });
  }
  async refresh(options) {
    await this.initBarrier.wait();
    const account = await this.defaultAccountProvider?.refresh(options);
    this.setDefaultAccount(account ?? null);
    return this.defaultAccount;
  }
  async signIn(options) {
    await this.initBarrier.wait();
    return this.defaultAccountProvider?.signIn(options) ?? null;
  }
  async signOut() {
    await this.initBarrier.wait();
    await this.defaultAccountProvider?.signOut();
  }
  resolveGitHubUrl(path) {
    if (this.defaultAccountProvider) {
      return this.defaultAccountProvider.resolveGitHubUrl(path);
    }
    return `https://github.com/${path}`;
  }
  setDefaultAccount(account) {
    if (equals(this.defaultAccount, account)) {
      return;
    }
    this.defaultAccount = account;
    this._onDidChangeDefaultAccount.fire(this.defaultAccount);
  }
};
DefaultAccountService = __decorateClass([
  __decorateParam(0, IProductService)
], DefaultAccountService);
let DefaultAccountProvider = class extends Disposable {
  constructor(defaultAccountConfig, configurationService, authenticationService, authenticationExtensionsService, telemetryService, extensionService, requestService, logService, environmentService, productService, contextKeyService, storageService, hostService, commandService) {
    super();
    this.defaultAccountConfig = defaultAccountConfig;
    this.configurationService = configurationService;
    this.authenticationService = authenticationService;
    this.authenticationExtensionsService = authenticationExtensionsService;
    this.telemetryService = telemetryService;
    this.extensionService = extensionService;
    this.requestService = requestService;
    this.logService = logService;
    this.environmentService = environmentService;
    this.productService = productService;
    this.storageService = storageService;
    this.hostService = hostService;
    this.commandService = commandService;
    this._defaultAccount = null;
    this._policyData = null;
    this._copilotTokenInfo = null;
    this._managedSettingsFetchStatus = null;
    this._managedSettingsRawResponse = null;
    this._managedSettingsCompatibilityError = null;
    this._onDidChangeDefaultAccount = this._register(new Emitter());
    this.onDidChangeDefaultAccount = this._onDidChangeDefaultAccount.event;
    this._onDidChangePolicyData = this._register(new Emitter());
    this.onDidChangePolicyData = this._onDidChangePolicyData.event;
    this._onDidChangeCopilotTokenInfo = this._register(new Emitter());
    this.onDidChangeCopilotTokenInfo = this._onDidChangeCopilotTokenInfo.event;
    this._onDidChangeManagedSettingsCompatibilityError = this._register(new Emitter());
    this.onDidChangeManagedSettingsCompatibilityError = this._onDidChangeManagedSettingsCompatibilityError.event;
    this.initialized = false;
    this.updateThrottler = this._register(new ThrottledDelayer(100));
    this.accountDataPollScheduler = this._register(new RunOnceScheduler(() => this.refetchDefaultAccount(), ACCOUNT_DATA_POLL_INTERVAL_MS));
    this.managedSettingsFetchAttemptedAccounts = /* @__PURE__ */ new Set();
    this._rateLimitBackoffUntil = 0;
    this.accountStatusContext = CONTEXT_DEFAULT_ACCOUNT_STATE.bindTo(contextKeyService);
    const cachedAccountData = this.getCachedAccountData();
    this._policyData = cachedAccountData?.accountPolicyData ?? null;
    this._copilotTokenInfo = cachedAccountData?.copilotTokenInfo ?? null;
    this._managedSettingsCompatibilityError = cachedAccountData?.accountPolicyData.managedSettingsCompatibilityError ?? null;
    this.initPromise = this.init().finally(() => {
      this.telemetryService.publicLog2("defaultaccount:status", { status: this.defaultAccount ? "available" : "unavailable", initial: true });
      this.initialized = true;
    });
  }
  get defaultAccount() {
    return this._defaultAccount?.defaultAccount ?? null;
  }
  get policyData() {
    return this._policyData?.policyData ?? null;
  }
  get copilotTokenInfo() {
    return this._copilotTokenInfo;
  }
  get managedSettingsFetchStatus() {
    return this._managedSettingsFetchStatus;
  }
  get managedSettingsFetchedAt() {
    return this._policyData?.managedSettingsFetchedAt ?? null;
  }
  get managedSettingsRawResponse() {
    return this._managedSettingsRawResponse;
  }
  get managedSettingsCompatibilityError() {
    return this._managedSettingsCompatibilityError;
  }
  getCachedAccountData() {
    const cached = this.storageService.get(CACHED_POLICY_DATA_KEY, StorageScope.APPLICATION);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const { accountId, policyData, tokenEntitlementsFetchedAt, mcpRegistryDataFetchedAt, copilotTokenInfo } = parsed;
        if (accountId && policyData) {
          this.logService.debug("[DefaultAccount] Initializing with cached policy data (migrating old format)");
          const result = { accountPolicyData: { accountId, policyData, tokenEntitlementsFetchedAt, mcpRegistryDataFetchedAt }, copilotTokenInfo };
          this.storageService.store(CACHED_POLICY_DATA_KEY, JSON.stringify(result), StorageScope.APPLICATION, StorageTarget.MACHINE);
          return result;
        }
        const { accountPolicyData, copilotTokenInfo: wrappedCopilotTokenInfo } = parsed;
        if (accountPolicyData?.accountId && accountPolicyData?.policyData) {
          this.logService.debug("[DefaultAccount] Initializing with cached policy data");
          return { accountPolicyData, copilotTokenInfo: wrappedCopilotTokenInfo };
        }
      } catch (error) {
        this.logService.error("[DefaultAccount] Failed to parse cached policy data", getErrorMessage(error));
      }
    }
    return null;
  }
  async init() {
    if (isWeb && !this.environmentService.remoteAuthority && !this.environmentService.isSessionsWindow) {
      this.logService.debug("[DefaultAccount] Running in web without remote, skipping initialization");
      return;
    }
    await this.whenDefaultAccountAuthenticationProviderAvailable();
    this.logService.debug("[DefaultAccount] Starting initialization");
    await this.doUpdateDefaultAccount();
    this.logService.debug("[DefaultAccount] Initialization complete");
    this._register(this.onDidChangeDefaultAccount((account) => {
      this.telemetryService.publicLog2("defaultaccount:status", { status: account ? "available" : "unavailable", initial: false });
    }));
    this._register(this.authenticationService.onDidChangeSessions((e) => {
      const defaultAccountProvider = this.getDefaultAccountAuthenticationProvider();
      if (e.providerId !== defaultAccountProvider.id) {
        return;
      }
      if (this.defaultAccount && e.event.removed?.some((session) => session.id === this.defaultAccount?.sessionId)) {
        this.setDefaultAccount(null);
      } else {
        this.logService.debug("[DefaultAccount] Sessions changed for default account provider, updating default account");
        this.updateDefaultAccount();
      }
    }));
    this._register(this.authenticationExtensionsService.onDidChangeAccountPreference(async (e) => {
      const defaultAccountProvider = this.getDefaultAccountAuthenticationProvider();
      if (e.providerId !== defaultAccountProvider.id) {
        return;
      }
      this.logService.debug("[DefaultAccount] Account preference changed for default account provider, updating default account");
      this.updateDefaultAccount();
    }));
    this._register(this.authenticationService.onDidRegisterAuthenticationProvider((e) => {
      const defaultAccountProvider = this.getDefaultAccountAuthenticationProvider();
      if (e.id !== defaultAccountProvider.id) {
        return;
      }
      this.logService.debug("[DefaultAccount] Default account provider registered, updating default account");
      this.updateDefaultAccount();
    }));
    this._register(this.authenticationService.onDidUnregisterAuthenticationProvider((e) => {
      const defaultAccountProvider = this.getDefaultAccountAuthenticationProvider();
      if (e.id !== defaultAccountProvider.id) {
        return;
      }
      this.logService.debug("[DefaultAccount] Default account provider unregistered, updating default account");
      this.updateDefaultAccount();
    }));
    this._register(this.hostService.onDidChangeFocus((focused) => {
      if (focused) {
        this.refetchDefaultAccount();
      }
    }));
  }
  async whenDefaultAccountAuthenticationProviderAvailable() {
    const provider = this.getDefaultAccountAuthenticationProvider();
    this.logService.debug("[DefaultAccount] Waiting for default account authentication provider to be available.");
    const disposables = new DisposableStore();
    try {
      await new Promise((resolve) => {
        if (this.isAccountProviderAvailable(provider)) {
          this.logService.debug("[DefaultAccount] Default account authentication provider is now available.");
          resolve();
          return;
        }
        disposables.add(Event.any(this.authenticationService.onDidChangeDeclaredProviders, this.authenticationService.onDidRegisterAuthenticationProvider)(() => {
          if (this.isAccountProviderAvailable(provider)) {
            this.logService.debug("[DefaultAccount] Default account authentication provider is now available.");
            resolve();
          }
        }));
        if (this.environmentService.remoteAuthority) {
          void this.authenticationService.getSessions(provider.id, void 0, {}, true);
        }
        this.extensionService.whenInstalledExtensionsRegistered().then(() => {
          disposables.dispose();
          this.logService.debug("[DefaultAccount] Installed extensions registered.");
          resolve();
        }, (error) => {
          this.logService.error("[DefaultAccount] Error while waiting for installed extensions to be registered", getErrorMessage(error));
          resolve();
        });
      });
    } finally {
      disposables.dispose();
    }
  }
  async refresh(options) {
    if (!this.initialized) {
      await this.initPromise;
      return this.defaultAccount;
    }
    this.logService.debug("[DefaultAccount] Refreshing default account");
    await this.updateDefaultAccount(options);
    return this.defaultAccount;
  }
  async refetchDefaultAccount() {
    if (this.accountDataPollScheduler.isScheduled()) {
      this.accountDataPollScheduler.cancel();
    }
    if (!this.hostService.hasFocus || !this._defaultAccount) {
      this.scheduleAccountDataPoll();
      this.logService.debug("[DefaultAccount] Skipping refetching default account. Host is not focused or default account is not set");
      return;
    }
    this.logService.debug("[DefaultAccount] Refetching default account");
    await this.updateDefaultAccount();
  }
  async updateDefaultAccount(options) {
    await this.updateThrottler.trigger(() => this.doUpdateDefaultAccount(options));
  }
  async doUpdateDefaultAccount(options) {
    try {
      const defaultAccount = await this.fetchDefaultAccount(options);
      this.setDefaultAccount(defaultAccount);
      this.scheduleAccountDataPoll();
    } catch (error) {
      this.logService.error("[DefaultAccount] Error while updating default account", getErrorMessage(error));
    }
  }
  async fetchDefaultAccount(options) {
    const defaultAccountProvider = this.getDefaultAccountAuthenticationProvider();
    this.logService.debug("[DefaultAccount] Default account provider ID:", defaultAccountProvider.id);
    if (!this.isAccountProviderAvailable(defaultAccountProvider)) {
      this.logService.info(`[DefaultAccount] Authentication provider is not available.`, defaultAccountProvider);
      return null;
    }
    return await this.getDefaultAccountForAuthenticationProvider(defaultAccountProvider, options);
  }
  isAccountProviderAvailable(accountProvider) {
    return this.authenticationService.declaredProviders.some((p) => p.id === accountProvider.id) || this.authenticationService.isAuthenticationProviderRegistered(accountProvider.id);
  }
  setDefaultAccount(account) {
    if (equals(this._defaultAccount, account)) {
      return;
    }
    this.logService.trace("[DefaultAccount] Updating default account:", account);
    if (account) {
      this._defaultAccount = account;
      this.setCopilotTokenInfo(account.copilotTokenInfo);
      this.setPolicyData(account.policyData);
      this.setManagedSettingsCompatibilityError(account.policyData?.managedSettingsCompatibilityError ?? null);
      this._onDidChangeDefaultAccount.fire(this._defaultAccount.defaultAccount);
      this.accountStatusContext.set("available" /* Available */);
      this.logService.debug("[DefaultAccount] Account status set to Available");
    } else {
      this._defaultAccount = null;
      this.setPolicyData(null);
      this.setManagedSettingsCompatibilityError(null);
      this.setCopilotTokenInfo(null);
      this._onDidChangeDefaultAccount.fire(null);
      this.accountDataPollScheduler.cancel();
      this.accountStatusContext.set("unavailable" /* Unavailable */);
      this.logService.debug("[DefaultAccount] Account status set to Unavailable");
    }
  }
  setPolicyData(accountPolicyData) {
    if (equals(this._policyData, accountPolicyData)) {
      return;
    }
    this._policyData = accountPolicyData;
    this.cachePolicyData(accountPolicyData);
    this._onDidChangePolicyData.fire(this._policyData?.policyData ?? null);
  }
  setManagedSettingsCompatibilityError(error) {
    if (equals(this._managedSettingsCompatibilityError, error)) {
      return;
    }
    this._managedSettingsCompatibilityError = error;
    this._onDidChangeManagedSettingsCompatibilityError.fire(error);
  }
  setCopilotTokenInfo(copilotTokenInfo) {
    if (equals(this._copilotTokenInfo, copilotTokenInfo)) {
      return;
    }
    this._copilotTokenInfo = copilotTokenInfo;
    this._onDidChangeCopilotTokenInfo.fire(this._copilotTokenInfo);
  }
  cachePolicyData(accountPolicyData) {
    if (accountPolicyData) {
      this.logService.debug("[DefaultAccount] Caching policy data for account:", accountPolicyData.accountId);
      const cachedAccountData = {
        accountPolicyData,
        copilotTokenInfo: this._copilotTokenInfo ?? void 0
      };
      this.storageService.store(CACHED_POLICY_DATA_KEY, JSON.stringify(cachedAccountData), StorageScope.APPLICATION, StorageTarget.MACHINE);
    } else {
      this.logService.debug("[DefaultAccount] Removing cached policy data");
      this.storageService.remove(CACHED_POLICY_DATA_KEY, StorageScope.APPLICATION);
    }
  }
  scheduleAccountDataPoll() {
    if (!this._defaultAccount) {
      return;
    }
    this.accountDataPollScheduler.schedule(ACCOUNT_DATA_POLL_INTERVAL_MS);
  }
  extractFromToken(token) {
    const result = /* @__PURE__ */ new Map();
    const firstPart = token?.split(":")[0];
    const fields = firstPart?.split(";");
    for (const field of fields) {
      const [key, value] = field.split("=");
      result.set(key, value);
    }
    this.logService.debug(`[DefaultAccount] extractFromToken: ${JSON.stringify(Object.fromEntries(result))}`);
    return result;
  }
  async getDefaultAccountForAuthenticationProvider(authenticationProvider, options) {
    try {
      this.logService.debug("[DefaultAccount] Getting Default Account from authenticated sessions for provider:", authenticationProvider.id);
      const sessions = await this.findMatchingProviderSession(authenticationProvider.id, this.defaultAccountConfig.authenticationProvider.scopes);
      if (!sessions?.length) {
        this.logService.debug("[DefaultAccount] No matching session found for provider:", authenticationProvider.id);
        return null;
      }
      return this.getDefaultAccountFromAuthenticatedSessions(authenticationProvider, sessions, options);
    } catch (error) {
      this.logService.error("[DefaultAccount] Failed to get default account for provider:", authenticationProvider.id, getErrorMessage(error));
      return null;
    }
  }
  async getDefaultAccountFromAuthenticatedSessions(authenticationProvider, sessions, options) {
    try {
      const accountId = sessions[0].account.id;
      const accountPolicyData = this._policyData?.accountId === accountId ? this._policyData : void 0;
      const entitlementsResult = await this.getEntitlements(sessions, accountPolicyData, options);
      const entitlementsData = entitlementsResult?.data;
      const entitlementsFetchedAt = entitlementsResult?.fetchedAt;
      const [tokenEntitlementsResult, managedSettingsResult] = entitlementsData?.chat_enabled ? await Promise.all([
        this.getTokenEntitlements(sessions, accountPolicyData, options),
        this.getManagedSettings(sessions, accountPolicyData, options)
      ]) : [void 0, void 0];
      const tokenEntitlementsFetchedAt = tokenEntitlementsResult?.fetchedAt;
      const managedSettingsFetchedAt = managedSettingsResult?.fetchedAt;
      const managedSettingsCompatibilityError = managedSettingsResult ? managedSettingsResult.compatibilityError : this._managedSettingsCompatibilityError;
      let mcpRegistryDataFetchedAt;
      let policyData = accountPolicyData?.policyData ? { ...accountPolicyData.policyData } : void 0;
      if (entitlementsData) {
        policyData = policyData ?? {};
        policyData.cloud_session_storage_enabled = entitlementsData.cloud_session_storage_enabled;
      }
      if (tokenEntitlementsResult?.data) {
        const tokenEntitlementsData = tokenEntitlementsResult.data;
        policyData = policyData ?? {};
        policyData.chat_agent_enabled = tokenEntitlementsData.policyData.chat_agent_enabled;
        policyData.chat_preview_features_enabled = tokenEntitlementsData.policyData.chat_preview_features_enabled;
        policyData.mcp = tokenEntitlementsData.policyData.mcp;
        if (policyData.mcp) {
          const mcpRegistryResult = await this.getMcpRegistryProvider(sessions, accountPolicyData, options);
          mcpRegistryDataFetchedAt = mcpRegistryResult?.fetchedAt;
          policyData.mcpRegistryUrl = mcpRegistryResult?.data?.url;
          policyData.mcpAccess = mcpRegistryResult?.data?.registry_access;
        } else {
          policyData.mcpRegistryUrl = void 0;
          policyData.mcpAccess = void 0;
        }
      }
      if (managedSettingsResult?.data) {
        policyData = { ...policyData ?? {}, ...managedSettingsResult.data };
      }
      const defaultAccount = {
        authenticationProvider,
        accountName: sessions[0].account.label,
        sessionId: sessions[0].id,
        enterprise: authenticationProvider.enterprise || sessions[0].account.label.includes("_"),
        entitlementsData
      };
      this.logService.debug("[DefaultAccount] Successfully created default account for provider:", authenticationProvider.id);
      const accountPolicyResult = policyData || entitlementsFetchedAt ? {
        accountId,
        policyData: policyData ?? {},
        entitlementsFetchedAt,
        tokenEntitlementsFetchedAt,
        mcpRegistryDataFetchedAt,
        managedSettingsFetchedAt,
        managedSettingsCompatibilityError: managedSettingsCompatibilityError ?? void 0
      } : null;
      return {
        defaultAccount,
        accountId,
        policyData: accountPolicyResult,
        copilotTokenInfo: tokenEntitlementsResult?.data?.copilotTokenInfo ?? null
      };
    } catch (error) {
      this.logService.error("[DefaultAccount] Failed to create default account for provider:", authenticationProvider.id, getErrorMessage(error));
      return null;
    }
  }
  async findMatchingProviderSession(authProviderId, allScopes) {
    const sessions = await this.getSessions(authProviderId);
    const matchingSessions = [];
    for (const session of sessions) {
      this.logService.debug("[DefaultAccount] Checking session with scopes", session.scopes);
      for (const scopes of allScopes) {
        if (this.scopesMatch(session.scopes, scopes)) {
          matchingSessions.push(session);
        }
      }
    }
    return matchingSessions.length > 0 ? matchingSessions : void 0;
  }
  async getSessions(authProviderId) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        let preferredAccount;
        let preferredAccountName;
        for (const preferredExtension of this.defaultAccountConfig.preferredExtensions) {
          preferredAccountName = this.authenticationExtensionsService.getAccountPreference(preferredExtension, authProviderId);
          if (preferredAccountName) {
            break;
          }
        }
        for (const account of await this.authenticationService.getAccounts(authProviderId)) {
          if (account.label === preferredAccountName) {
            preferredAccount = account;
            break;
          }
        }
        return await this.authenticationService.getSessions(authProviderId, void 0, { account: preferredAccount }, true);
      } catch (error) {
        this.logService.warn(`[DefaultAccount] Attempt ${attempt} to get sessions failed:`, getErrorMessage(error));
        if (attempt === 3) {
          throw error;
        }
        await timeout(500);
      }
    }
    throw new Error("Unable to get sessions after multiple attempts");
  }
  scopesMatch(scopes, expectedScopes) {
    return expectedScopes.every((scope) => scopes.includes(scope));
  }
  async getTokenEntitlements(sessions, accountPolicyData, options) {
    if (!options?.forceRefresh && accountPolicyData?.tokenEntitlementsFetchedAt && !this.isDataStale(accountPolicyData.tokenEntitlementsFetchedAt)) {
      this.logService.debug("[DefaultAccount] Using last fetched token entitlements data");
      return { data: { policyData: accountPolicyData.policyData, copilotTokenInfo: this._copilotTokenInfo ?? {} }, fetchedAt: accountPolicyData.tokenEntitlementsFetchedAt };
    }
    const data = await this.requestTokenEntitlements(sessions);
    return { data, fetchedAt: Date.now() };
  }
  async requestTokenEntitlements(sessions) {
    const tokenEntitlementsUrl = this.getTokenEntitlementUrl();
    if (!tokenEntitlementsUrl) {
      this.logService.debug("[DefaultAccount] No token entitlements URL found");
      return void 0;
    }
    this.logService.debug("[DefaultAccount] Fetching token entitlements from:", tokenEntitlementsUrl);
    const response = await this.request(tokenEntitlementsUrl, "GET", void 0, sessions, CancellationToken.None, "defaultAccount.tokenEntitlements");
    if (!response) {
      return void 0;
    }
    if (response.res.statusCode && response.res.statusCode !== 200) {
      this.logService.trace(`[DefaultAccount] unexpected status code ${response.res.statusCode} while fetching token entitlements`);
      return void 0;
    }
    try {
      const chatData = await asJson(response);
      if (chatData) {
        const tokenMap = this.extractFromToken(chatData.token);
        return {
          policyData: {
            // Editor preview features are disabled if the flag is present and set to 0
            chat_preview_features_enabled: tokenMap.get("editor_preview_features") !== "0",
            chat_agent_enabled: tokenMap.get("agent_mode") !== "0",
            // MCP is only enabled if the flag is explicitly present and set to 1
            mcp: tokenMap.get("mcp") === "1"
          },
          copilotTokenInfo: {
            sn: tokenMap.get("sn"),
            fcv1: tokenMap.get("fcv1")
          }
        };
      }
      this.logService.error("Failed to fetch token entitlements", "No data returned");
    } catch (error) {
      this.logService.error("Failed to fetch token entitlements", getErrorMessage(error));
    }
    return void 0;
  }
  async getEntitlements(sessions, accountPolicyData, options) {
    const accountId = sessions[0].account.id;
    const existingData = this._defaultAccount?.accountId === accountId ? this._defaultAccount?.defaultAccount.entitlementsData : void 0;
    if (!options?.forceRefresh && existingData && accountPolicyData?.entitlementsFetchedAt && !this.isDataStale(accountPolicyData.entitlementsFetchedAt)) {
      this.logService.debug("[DefaultAccount] Using last fetched entitlements data");
      return { data: existingData, fetchedAt: accountPolicyData.entitlementsFetchedAt };
    }
    const entitlementUrl = this.getEntitlementUrl();
    if (!entitlementUrl) {
      this.logService.debug("[DefaultAccount] No chat entitlements URL found");
      return { data: void 0, fetchedAt: void 0 };
    }
    this.logService.debug("[DefaultAccount] Fetching entitlements from:", entitlementUrl);
    const response = await this.request(entitlementUrl, "GET", void 0, sessions, CancellationToken.None, "defaultAccount.entitlements");
    if (!response) {
      return { data: void 0, fetchedAt: Date.now() };
    }
    if (response.res.statusCode && response.res.statusCode !== 200) {
      this.logService.trace(`[DefaultAccount] unexpected status code ${response.res.statusCode} while fetching entitlements`);
      const data = response.res.statusCode === 401 || // oauth token being unavailable (expired/revoked)
      response.res.statusCode === 404 ? null : void 0;
      return { data, fetchedAt: Date.now() };
    }
    try {
      const data = await asJson(response);
      if (data) {
        return { data, fetchedAt: Date.now() };
      }
      this.logService.error("[DefaultAccount] Failed to fetch entitlements", "No data returned");
    } catch (error) {
      this.logService.error("[DefaultAccount] Failed to fetch entitlements", getErrorMessage(error));
    }
    return { data: void 0, fetchedAt: Date.now() };
  }
  async getMcpRegistryProvider(sessions, accountPolicyData, options) {
    if (!options?.forceRefresh && accountPolicyData?.mcpRegistryDataFetchedAt && !this.isDataStale(accountPolicyData.mcpRegistryDataFetchedAt)) {
      this.logService.debug("[DefaultAccount] Using last fetched MCP registry data");
      const data2 = accountPolicyData.policyData.mcpRegistryUrl && accountPolicyData.policyData.mcpAccess ? { url: accountPolicyData.policyData.mcpRegistryUrl, registry_access: accountPolicyData.policyData.mcpAccess } : null;
      return { data: data2, fetchedAt: accountPolicyData.mcpRegistryDataFetchedAt };
    }
    const data = await this.requestMcpRegistryProvider(sessions);
    return !isUndefined(data) ? { data, fetchedAt: Date.now() } : void 0;
  }
  async requestMcpRegistryProvider(sessions) {
    const mcpRegistryDataUrl = this.getMcpRegistryDataUrl();
    if (!mcpRegistryDataUrl) {
      this.logService.debug("[DefaultAccount] No MCP registry data URL found");
      return null;
    }
    this.logService.debug("[DefaultAccount] Fetching MCP registry data from:", mcpRegistryDataUrl);
    const response = await this.request(mcpRegistryDataUrl, "GET", void 0, sessions, CancellationToken.None, "defaultAccount.mcpRegistryProvider");
    if (!response) {
      return void 0;
    }
    if (!isSuccess(response)) {
      if (isClientError(response)) {
        this.logService.debug(`[DefaultAccount] Received ${response.res.statusCode} for MCP registry data, treating as no registry available.`);
        return null;
      }
      this.logService.debug(`[DefaultAccount] unexpected status code ${response.res.statusCode} while fetching MCP registry data`);
      return void 0;
    }
    try {
      const data = await asJson(response);
      if (data) {
        this.logService.debug("Fetched MCP registry providers", data.mcp_registries);
        return data.mcp_registries[0] ?? null;
      }
      this.logService.debug("No MCP registry providers content found in response");
      return null;
    } catch (error) {
      this.logService.error("Failed to fetch MCP registry providers", getErrorMessage(error));
      return void 0;
    }
  }
  async getManagedSettings(sessions, accountPolicyData, options) {
    const accountId = sessions[0].account.id;
    const cachedManagedSettings = accountPolicyData?.managedSettingsFetchedAt !== void 0 && !this.isDataStale(accountPolicyData.managedSettingsFetchedAt) ? {
      data: {
        managedSettings: accountPolicyData.policyData.managedSettings
      },
      fetchedAt: accountPolicyData.managedSettingsFetchedAt
    } : void 0;
    const hasFetchedThisProcess = this.managedSettingsFetchAttemptedAccounts.has(accountId);
    if (!options?.forceRefresh && cachedManagedSettings && hasFetchedThisProcess) {
      this.logService.debug("[DefaultAccount] Using last fetched managed settings data");
      return { ...cachedManagedSettings, compatibilityError: this._managedSettingsCompatibilityError };
    }
    this.managedSettingsFetchAttemptedAccounts.add(accountId);
    const result = await this.requestManagedSettings(sessions);
    const fetchedAt = Date.now();
    switch (result.kind) {
      case "success":
        return { data: result.data, fetchedAt, compatibilityError: null };
      case "noSettings":
        return { data: { managedSettings: void 0 }, fetchedAt, compatibilityError: null };
      case "updateRequired":
        return { data: { managedSettings: void 0 }, fetchedAt, compatibilityError: result.error };
      case "unavailable":
        return {
          data: this._managedSettingsCompatibilityError ? { managedSettings: void 0 } : cachedManagedSettings?.data,
          fetchedAt,
          compatibilityError: this._managedSettingsCompatibilityError
        };
    }
  }
  async requestManagedSettings(sessions) {
    const managedSettingsUrl = this.getManagedSettingsUrl();
    if (!managedSettingsUrl) {
      this.logService.debug("[DefaultAccount] No managed settings URL configured; skipping enterprise policy fetch");
      this._managedSettingsFetchStatus = "no-url";
      return { kind: "unavailable" };
    }
    const requestUrl = appendManagedSettingsClientIdentity(managedSettingsUrl, this.productService);
    this.logService.debug("[DefaultAccount] Fetching managed settings from:", requestUrl);
    const rateLimitBackoffActive = Date.now() < this._rateLimitBackoffUntil;
    const response = await this.request(requestUrl, "GET", void 0, sessions, CancellationToken.None, "defaultAccount.managedSettings", MANAGED_SETTINGS_REQUEST_TIMEOUT_MS);
    if (!response) {
      this.logService.debug("[DefaultAccount] Managed settings fetch returned no response (network error, all sessions rejected, or active rate-limit backoff); falling back to local-only policy");
      this.reportManagedSettingsOutcome("no-response", rateLimitBackoffActive);
      return { kind: "unavailable" };
    }
    const status = response.res.statusCode ?? 0;
    if (status === 404) {
      this.reportManagedSettingsOutcome(status, rateLimitBackoffActive);
      return { kind: "noSettings" };
    }
    if (status === 466) {
      const error = await this.readManagedSettingsCompatibilityError(response);
      this.setManagedSettingsCompatibilityError(error);
      this.reportManagedSettingsOutcome(status, rateLimitBackoffActive);
      return { kind: "updateRequired", error };
    }
    if (!isSuccess(response)) {
      this.logService.warn(`[DefaultAccount] Managed settings fetch returned non-success status ${status}; falling back to local-only policy`);
      this.reportManagedSettingsOutcome(status, rateLimitBackoffActive);
      return { kind: "unavailable" };
    }
    try {
      const data = await asJson(response);
      this.logService.trace("[DefaultAccount] Managed settings raw response:", JSON.stringify(data ?? null));
      this._managedSettingsRawResponse = data ?? null;
      const adapted = adaptManagedSettings(data ?? {}, (msg) => this.logService.warn(msg));
      const managedSettingsCount = adapted.managedSettings ? Object.keys(adapted.managedSettings).length : 0;
      if (managedSettingsCount === 0) {
        this.logService.debug("[DefaultAccount] Managed settings fetched (empty response \u2014 no enterprise policy file present)");
      } else {
        this.logService.info("[DefaultAccount] Managed settings applied");
        this.logService.trace("[DefaultAccount] Managed settings payload:", JSON.stringify(adapted));
      }
      this.reportManagedSettingsOutcome("ok", rateLimitBackoffActive);
      return { kind: "success", data: adapted };
    } catch (error) {
      this.logService.error("[DefaultAccount] Failed to parse managed settings response", getErrorMessage(error));
      this.reportManagedSettingsOutcome("parse-error", rateLimitBackoffActive);
      return { kind: "unavailable" };
    }
  }
  async readManagedSettingsCompatibilityError(response) {
    try {
      const text = await asText(response);
      const body = text ? JSON.parse(text) : void 0;
      const parsed = parseManagedSettingsCompatibilityError(body);
      if (parsed) {
        return parsed;
      }
      this.logService.error("[DefaultAccount] Managed settings compatibility response did not contain the expected error code");
    } catch (error) {
      this.logService.error("[DefaultAccount] Failed to parse managed settings compatibility response", getErrorMessage(error));
    }
    return { errorCode: MANAGED_SETTINGS_UPDATE_REQUIRED_ERROR_CODE };
  }
  reportManagedSettingsOutcome(status, rateLimitBackoffActive) {
    this._managedSettingsFetchStatus = status;
    this.telemetryService.publicLog2("defaultaccount:managedSettings:fetch", {
      outcome: typeof status === "number" ? `status:${status}` : status,
      rateLimitBackoffActive
    });
  }
  /**
   * Detects a rate-limited GitHub response. Mirrors the public-API check in
   * `githubRepoFetcher.ts`:
   * - Canonical `429 Too Many Requests`.
   * - Primary quota exhaustion: `403` with `X-RateLimit-Remaining: 0`.
   * - Secondary throttling: GitHub omits `X-RateLimit-Remaining` but sets
   *   `Retry-After` (on a non-2xx response). We treat any non-success status
   *   that carries `Retry-After` as a back-off signal.
   */
  isRateLimited(response) {
    const status = response.res.statusCode;
    if (status === 429) {
      return true;
    }
    if (status === 403 && readHeader(response.res.headers, "x-ratelimit-remaining") === "0") {
      return true;
    }
    if (!isSuccess(response) && readHeader(response.res.headers, "retry-after") !== void 0) {
      return true;
    }
    return false;
  }
  async request(url, type, body, sessions, token, callSite, requestTimeoutMs) {
    if (Date.now() < this._rateLimitBackoffUntil) {
      const remainingSec = Math.ceil((this._rateLimitBackoffUntil - Date.now()) / 1e3);
      this.logService.debug(`[DefaultAccount] Skipping request to ${url} \u2014 rate-limit backoff active for ${remainingSec}s more`);
      return void 0;
    }
    let lastResponse;
    for (const session of sessions) {
      if (token.isCancellationRequested) {
        return lastResponse;
      }
      try {
        const response = await this.requestService.request({
          type,
          url,
          data: type === "POST" ? JSON.stringify(body) : void 0,
          disableCache: true,
          timeout: requestTimeoutMs,
          headers: {
            "Authorization": `Bearer ${session.accessToken}`
          },
          callSite
        }, token);
        const status = response.res.statusCode;
        if (this.isRateLimited(response)) {
          const retryAfterSec = retryAfterFromHeaders(response.res.headers) ?? 60;
          this._rateLimitBackoffUntil = Date.now() + retryAfterSec * 1e3;
          this.logService.warn(`[DefaultAccount] Rate limited by ${url} (status ${status}); backing off for ${retryAfterSec}s`);
          return response;
        }
        if (status === 401 || status === 404) {
          this.logService.debug(`[DefaultAccount] Received ${status} for URL ${url} with session ${session.id}, likely due to expired/revoked token or insufficient permissions.`, "Trying next session if available.");
          lastResponse = response;
          continue;
        }
        return response;
      } catch (error) {
        if (!token.isCancellationRequested) {
          this.logService.error(`[DefaultAccount] request: error ${error}`, url);
        }
      }
    }
    if (!lastResponse) {
      this.logService.trace("[DefaultAccount]: No response received for request", url);
      return void 0;
    }
    return lastResponse;
  }
  isDataStale(fetchedAt) {
    return Date.now() - fetchedAt >= ACCOUNT_DATA_POLL_INTERVAL_MS;
  }
  getEntitlementUrl() {
    if (this.getDefaultAccountAuthenticationProvider().enterprise) {
      try {
        const enterpriseUrl = this.getEnterpriseUrl();
        if (!enterpriseUrl) {
          return void 0;
        }
        return `${enterpriseUrl.protocol}//api.${enterpriseUrl.hostname}${enterpriseUrl.port ? ":" + enterpriseUrl.port : ""}/copilot_internal/user`;
      } catch (error) {
        this.logService.error(error);
      }
    }
    return this.defaultAccountConfig.entitlementUrl;
  }
  getTokenEntitlementUrl() {
    if (this.getDefaultAccountAuthenticationProvider().enterprise) {
      try {
        const enterpriseUrl = this.getEnterpriseUrl();
        if (!enterpriseUrl) {
          return void 0;
        }
        return `${enterpriseUrl.protocol}//api.${enterpriseUrl.hostname}${enterpriseUrl.port ? ":" + enterpriseUrl.port : ""}/copilot_internal/v2/token`;
      } catch (error) {
        this.logService.error(error);
      }
    }
    return this.defaultAccountConfig.tokenEntitlementUrl;
  }
  getMcpRegistryDataUrl() {
    if (this.getDefaultAccountAuthenticationProvider().enterprise) {
      try {
        const enterpriseUrl = this.getEnterpriseUrl();
        if (!enterpriseUrl) {
          return void 0;
        }
        return `${enterpriseUrl.protocol}//api.${enterpriseUrl.hostname}${enterpriseUrl.port ? ":" + enterpriseUrl.port : ""}/copilot/mcp_registry`;
      } catch (error) {
        this.logService.error(error);
      }
    }
    return this.defaultAccountConfig.mcpRegistryDataUrl;
  }
  getManagedSettingsUrl() {
    if (this.getDefaultAccountAuthenticationProvider().enterprise) {
      try {
        const enterpriseUrl = this.getEnterpriseUrl();
        if (!enterpriseUrl) {
          return void 0;
        }
        return `${enterpriseUrl.protocol}//api.${enterpriseUrl.hostname}${enterpriseUrl.port ? ":" + enterpriseUrl.port : ""}/copilot_internal/managed_settings`;
      } catch (error) {
        this.logService.error(error);
      }
    }
    return this.defaultAccountConfig.managedSettingsUrl;
  }
  getDefaultAccountAuthenticationProvider() {
    if (this.configurationService.getValue(this.defaultAccountConfig.authenticationProvider.enterpriseProviderConfig) === this.defaultAccountConfig.authenticationProvider.enterprise.id) {
      return {
        ...this.defaultAccountConfig.authenticationProvider.enterprise,
        enterprise: true
      };
    }
    return {
      ...this.defaultAccountConfig.authenticationProvider.default,
      enterprise: false
    };
  }
  resolveGitHubUrl(path) {
    if (this.getDefaultAccountAuthenticationProvider().enterprise) {
      try {
        const enterpriseUrl = this.getEnterpriseUrl();
        if (enterpriseUrl) {
          return `${enterpriseUrl.protocol}//${enterpriseUrl.host}/${path}`;
        }
      } catch {
      }
    }
    return `https://github.com/${path}`;
  }
  getEnterpriseUrl() {
    const value = this.configurationService.getValue(this.defaultAccountConfig.authenticationProvider.enterpriseProviderUriSetting);
    if (!isString(value)) {
      return void 0;
    }
    return new URL(value);
  }
  async signIn(options) {
    const authProvider = this.getDefaultAccountAuthenticationProvider();
    if (!authProvider) {
      throw new Error("No default account provider configured");
    }
    const { additionalScopes, ...sessionOptions } = options ?? {};
    const defaultAccountScopes = this.defaultAccountConfig.authenticationProvider.scopes[0];
    const scopes = additionalScopes ? distinct([...defaultAccountScopes, ...additionalScopes]) : defaultAccountScopes;
    const session = await this.authenticationService.createSession(authProvider.id, scopes, sessionOptions);
    for (const preferredExtension of this.defaultAccountConfig.preferredExtensions) {
      this.authenticationExtensionsService.updateAccountPreference(preferredExtension, authProvider.id, session.account);
    }
    await this.updateDefaultAccount();
    return this.defaultAccount;
  }
  async signOut() {
    if (!this.defaultAccount) {
      return;
    }
    await this.commandService.executeCommand("_signOutOfAccount", { providerId: this.defaultAccount.authenticationProvider.id, accountLabel: this.defaultAccount.accountName });
  }
};
DefaultAccountProvider = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IAuthenticationService),
  __decorateParam(3, IAuthenticationExtensionsService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IExtensionService),
  __decorateParam(6, IRequestService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IWorkbenchEnvironmentService),
  __decorateParam(9, IProductService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IStorageService),
  __decorateParam(12, IHostService),
  __decorateParam(13, ICommandService)
], DefaultAccountProvider);
let DefaultAccountProviderContribution = class extends Disposable {
  constructor(productService, instantiationService, defaultAccountService) {
    super();
    if (!productService.defaultChatAgent) {
      return;
    }
    const defaultAccountProvider = this._register(instantiationService.createInstance(DefaultAccountProvider, toDefaultAccountConfig(productService.defaultChatAgent)));
    defaultAccountService.setDefaultAccountProvider(defaultAccountProvider);
  }
};
DefaultAccountProviderContribution.ID = "workbench.contributions.defaultAccountProvider";
DefaultAccountProviderContribution = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IDefaultAccountService)
], DefaultAccountProviderContribution);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: DEFAULT_ACCOUNT_SIGN_IN_COMMAND,
      title: localize2("signIn", "Sign In")
    });
  }
  async run(accessor) {
    const defaultAccountService = accessor.get(IDefaultAccountService);
    await defaultAccountService.signIn();
  }
});
registerWorkbenchContribution2(DefaultAccountProviderContribution.ID, DefaultAccountProviderContribution, WorkbenchPhase.BlockStartup);
export {
  CONTEXT_DEFAULT_ACCOUNT_STATE,
  DEFAULT_ACCOUNT_SIGN_IN_COMMAND,
  DefaultAccountProvider,
  DefaultAccountService,
  DefaultAccountStatus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxhY2NvdW50c1xcYnJvd3NlclxcZGVmYXVsdEFjY291bnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBCYXJyaWVyLCBSdW5PbmNlU2NoZWR1bGVyLCBUaHJvdHRsZWREZWxheWVyLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvcGlsb3RUb2tlbkluZm8sIElEZWZhdWx0QWNjb3VudCwgSURlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlciwgSUVudGl0bGVtZW50c0RhdGEsIElQb2xpY3lEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdENoYXRBZ2VudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcsIGlzVW5kZWZpbmVkLCBNdXRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudFByb3ZpZGVyLCBJRGVmYXVsdEFjY291bnRTZXJ2aWNlLCBJTWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yLCBNQU5BR0VEX1NFVFRJTkdTX1VQREFURV9SRVFVSVJFRF9FUlJPUl9DT0RFLCBNYW5hZ2VkU2V0dGluZ3NGZXRjaFN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RlZmF1bHRBY2NvdW50L2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYXNKc29uLCBhc1RleHQsIElSZXF1ZXN0U2VydmljZSwgaXNDbGllbnRFcnJvciwgaXNTdWNjZXNzLCByZWFkSGVhZGVyLCByZXRyeUFmdGVyRnJvbUhlYWRlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBBdXRoZW50aWNhdGlvblNlc3Npb24sIEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQsIElBdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLCBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBhZGFwdE1hbmFnZWRTZXR0aW5ncywgYXBwZW5kTWFuYWdlZFNldHRpbmdzQ2xpZW50SWRlbnRpdHksIElNYW5hZ2VkU2V0dGluZ3NSZXNwb25zZSwgcGFyc2VNYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3IgfSBmcm9tICcuL21hbmFnZWRTZXR0aW5ncy5qcyc7XG5cbmludGVyZmFjZSBJRGVmYXVsdEFjY291bnRDb25maWcge1xuXHRyZWFkb25seSBwcmVmZXJyZWRFeHRlbnNpb25zOiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgYXV0aGVudGljYXRpb25Qcm92aWRlcjoge1xuXHRcdHJlYWRvbmx5IGRlZmF1bHQ6IHtcblx0XHRcdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdFx0XHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdFx0fTtcblx0XHRyZWFkb25seSBlbnRlcnByaXNlOiB7XG5cdFx0XHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRcdFx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRcdH07XG5cdFx0cmVhZG9ubHkgZW50ZXJwcmlzZVByb3ZpZGVyQ29uZmlnOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgZW50ZXJwcmlzZVByb3ZpZGVyVXJpU2V0dGluZzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHNjb3Blczogc3RyaW5nW11bXTtcblx0fTtcblx0cmVhZG9ubHkgdG9rZW5FbnRpdGxlbWVudFVybDogc3RyaW5nO1xuXHRyZWFkb25seSBlbnRpdGxlbWVudFVybDogc3RyaW5nO1xuXHRyZWFkb25seSBtY3BSZWdpc3RyeURhdGFVcmw6IHN0cmluZztcblx0cmVhZG9ubHkgbWFuYWdlZFNldHRpbmdzVXJsOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0FDQ09VTlRfU0lHTl9JTl9DT01NQU5EID0gJ3dvcmtiZW5jaC5hY3Rpb25zLmFjY291bnRzLnNpZ25Jbic7XG5cbmV4cG9ydCBjb25zdCBlbnVtIERlZmF1bHRBY2NvdW50U3RhdHVzIHtcblx0VW5pbml0aWFsaXplZCA9ICd1bmluaXRpYWxpemVkJyxcblx0VW5hdmFpbGFibGUgPSAndW5hdmFpbGFibGUnLFxuXHRBdmFpbGFibGUgPSAnYXZhaWxhYmxlJyxcbn1cblxuZXhwb3J0IGNvbnN0IENPTlRFWFRfREVGQVVMVF9BQ0NPVU5UX1NUQVRFID0gbmV3IFJhd0NvbnRleHRLZXk8c3RyaW5nPignZGVmYXVsdEFjY291bnRTdGF0dXMnLCBEZWZhdWx0QWNjb3VudFN0YXR1cy5VbmluaXRpYWxpemVkKTtcbmNvbnN0IENBQ0hFRF9QT0xJQ1lfREFUQV9LRVkgPSAnZGVmYXVsdEFjY291bnQuY2FjaGVkUG9saWN5RGF0YSc7XG5jb25zdCBBQ0NPVU5UX0RBVEFfUE9MTF9JTlRFUlZBTF9NUyA9IDYwICogNjAgKiAxMDAwOyAvLyAxIGhvdXJcbmNvbnN0IE1BTkFHRURfU0VUVElOR1NfUkVRVUVTVF9USU1FT1VUX01TID0gNTAwMDtcblxuaW50ZXJmYWNlIElUb2tlbkVudGl0bGVtZW50c1Jlc3BvbnNlIHtcblx0dG9rZW46IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElNY3BSZWdpc3RyeVByb3ZpZGVyIHtcblx0cmVhZG9ubHkgdXJsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlZ2lzdHJ5X2FjY2VzczogJ2FsbG93X2FsbCcgfCAncmVnaXN0cnlfb25seSc7XG5cdHJlYWRvbmx5IG93bmVyPzoge1xuXHRcdHJlYWRvbmx5IGxvZ2luOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgaWQ6IG51bWJlcjtcblx0XHRyZWFkb25seSB0eXBlOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgcGFyZW50X2xvZ2luOiBzdHJpbmcgfCBudWxsO1xuXHRcdHJlYWRvbmx5IHByaW9yaXR5OiBudW1iZXI7XG5cdH07XG59XG5cbmludGVyZmFjZSBJTWNwUmVnaXN0cnlSZXNwb25zZSB7XG5cdHJlYWRvbmx5IG1jcF9yZWdpc3RyaWVzOiBSZWFkb25seUFycmF5PElNY3BSZWdpc3RyeVByb3ZpZGVyPjtcbn1cblxuZnVuY3Rpb24gdG9EZWZhdWx0QWNjb3VudENvbmZpZyhkZWZhdWx0Q2hhdEFnZW50OiBJRGVmYXVsdENoYXRBZ2VudCk6IElEZWZhdWx0QWNjb3VudENvbmZpZyB7XG5cdHJldHVybiB7XG5cdFx0cHJlZmVycmVkRXh0ZW5zaW9uczogW1xuXHRcdFx0ZGVmYXVsdENoYXRBZ2VudC5jaGF0RXh0ZW5zaW9uSWQsXG5cdFx0XHRkZWZhdWx0Q2hhdEFnZW50LmV4dGVuc2lvbklkLFxuXHRcdF0sXG5cdFx0YXV0aGVudGljYXRpb25Qcm92aWRlcjoge1xuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRpZDogZGVmYXVsdENoYXRBZ2VudC5wcm92aWRlci5kZWZhdWx0LmlkLFxuXHRcdFx0XHRuYW1lOiBkZWZhdWx0Q2hhdEFnZW50LnByb3ZpZGVyLmRlZmF1bHQubmFtZSxcblx0XHRcdH0sXG5cdFx0XHRlbnRlcnByaXNlOiB7XG5cdFx0XHRcdGlkOiBkZWZhdWx0Q2hhdEFnZW50LnByb3ZpZGVyLmVudGVycHJpc2UuaWQsXG5cdFx0XHRcdG5hbWU6IGRlZmF1bHRDaGF0QWdlbnQucHJvdmlkZXIuZW50ZXJwcmlzZS5uYW1lLFxuXHRcdFx0fSxcblx0XHRcdGVudGVycHJpc2VQcm92aWRlckNvbmZpZzogYCR7ZGVmYXVsdENoYXRBZ2VudC5jb21wbGV0aW9uc0FkdmFuY2VkU2V0dGluZ30uYXV0aFByb3ZpZGVyYCxcblx0XHRcdGVudGVycHJpc2VQcm92aWRlclVyaVNldHRpbmc6IGRlZmF1bHRDaGF0QWdlbnQucHJvdmlkZXJVcmlTZXR0aW5nLFxuXHRcdFx0c2NvcGVzOiBkZWZhdWx0Q2hhdEFnZW50LnByb3ZpZGVyU2NvcGVzLFxuXHRcdH0sXG5cdFx0ZW50aXRsZW1lbnRVcmw6IGRlZmF1bHRDaGF0QWdlbnQuZW50aXRsZW1lbnRVcmwsXG5cdFx0dG9rZW5FbnRpdGxlbWVudFVybDogZGVmYXVsdENoYXRBZ2VudC50b2tlbkVudGl0bGVtZW50VXJsLFxuXHRcdG1jcFJlZ2lzdHJ5RGF0YVVybDogZGVmYXVsdENoYXRBZ2VudC5tY3BSZWdpc3RyeURhdGFVcmwsXG5cdFx0bWFuYWdlZFNldHRpbmdzVXJsOiBkZWZhdWx0Q2hhdEFnZW50Lm1hbmFnZWRTZXR0aW5nc1VybCxcblx0fTtcbn1cblxuZXhwb3J0IGNsYXNzIERlZmF1bHRBY2NvdW50U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIHtcblx0ZGVjbGFyZSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBkZWZhdWx0QWNjb3VudDogSURlZmF1bHRBY2NvdW50IHwgbnVsbCA9IG51bGw7XG5cdGdldCBjdXJyZW50RGVmYXVsdEFjY291bnQoKTogSURlZmF1bHRBY2NvdW50IHwgbnVsbCB7IHJldHVybiB0aGlzLmRlZmF1bHRBY2NvdW50OyB9XG5cdGdldCBwb2xpY3lEYXRhKCk6IElQb2xpY3lEYXRhIHwgbnVsbCB7IHJldHVybiB0aGlzLmRlZmF1bHRBY2NvdW50UHJvdmlkZXI/LnBvbGljeURhdGEgPz8gbnVsbDsgfVxuXHRnZXQgY29waWxvdFRva2VuSW5mbygpOiBJQ29waWxvdFRva2VuSW5mbyB8IG51bGwgeyByZXR1cm4gdGhpcy5kZWZhdWx0QWNjb3VudFByb3ZpZGVyPy5jb3BpbG90VG9rZW5JbmZvID8/IG51bGw7IH1cblxuXHRnZXQgbWFuYWdlZFNldHRpbmdzRmV0Y2hTdGF0dXMoKTogTWFuYWdlZFNldHRpbmdzRmV0Y2hTdGF0dXMgeyByZXR1cm4gdGhpcy5kZWZhdWx0QWNjb3VudFByb3ZpZGVyPy5tYW5hZ2VkU2V0dGluZ3NGZXRjaFN0YXR1cyA/PyBudWxsOyB9XG5cdGdldCBtYW5hZ2VkU2V0dGluZ3NGZXRjaGVkQXQoKTogbnVtYmVyIHwgbnVsbCB7IHJldHVybiB0aGlzLmRlZmF1bHRBY2NvdW50UHJvdmlkZXI/Lm1hbmFnZWRTZXR0aW5nc0ZldGNoZWRBdCA/PyBudWxsOyB9XG5cdGdldCBtYW5hZ2VkU2V0dGluZ3NSYXdSZXNwb25zZSgpOiB1bmtub3duIHsgcmV0dXJuIHRoaXMuZGVmYXVsdEFjY291bnRQcm92aWRlcj8ubWFuYWdlZFNldHRpbmdzUmF3UmVzcG9uc2UgPz8gbnVsbDsgfVxuXHRnZXQgbWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yKCk6IElNYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3IgfCBudWxsIHsgcmV0dXJuIHRoaXMuZGVmYXVsdEFjY291bnRQcm92aWRlcj8ubWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yID8/IG51bGw7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGluaXRCYXJyaWVyID0gbmV3IEJhcnJpZXIoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SURlZmF1bHRBY2NvdW50IHwgbnVsbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQgPSB0aGlzLl9vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUG9saWN5RGF0YSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElQb2xpY3lEYXRhIHwgbnVsbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUG9saWN5RGF0YSA9IHRoaXMuX29uRGlkQ2hhbmdlUG9saWN5RGF0YS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvcGlsb3RUb2tlbkluZm8gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ29waWxvdFRva2VuSW5mbyB8IG51bGw+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvcGlsb3RUb2tlbkluZm8gPSB0aGlzLl9vbkRpZENoYW5nZUNvcGlsb3RUb2tlbkluZm8uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yIHwgbnVsbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yID0gdGhpcy5fb25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0QWNjb3VudENvbmZpZzogSURlZmF1bHRBY2NvdW50Q29uZmlnIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGRlZmF1bHRBY2NvdW50UHJvdmlkZXI6IElEZWZhdWx0QWNjb3VudFByb3ZpZGVyIHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZGVmYXVsdEFjY291bnRDb25maWcgPSBwcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50ID8gdG9EZWZhdWx0QWNjb3VudENvbmZpZyhwcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50KSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXRoaXMuZGVmYXVsdEFjY291bnRDb25maWcpIHtcblx0XHRcdC8vIEZvcmdlIGRvZXMgbm90IHNoaXAgYSBDb3BpbG90IGRlZmF1bHRDaGF0QWdlbnQuIEtlZXAgdGhlIHNoYXJlZCBhY2NvdW50IHNlcnZpY2Vcblx0XHRcdC8vIGF2YWlsYWJsZSB0byBjb25zdW1lcnMgd2l0aG91dCBjb25zdHJ1Y3RpbmcgYSBwcm92aWRlciBmcm9tIG1pc3NpbmcgcHJvZHVjdCBkYXRhLlxuXHRcdFx0dGhpcy5pbml0QmFycmllci5vcGVuKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0RGVmYXVsdEFjY291bnQoKTogUHJvbWlzZTxJRGVmYXVsdEFjY291bnQgfCBudWxsPiB7XG5cdFx0YXdhaXQgdGhpcy5pbml0QmFycmllci53YWl0KCk7XG5cdFx0cmV0dXJuIHRoaXMuZGVmYXVsdEFjY291bnQ7XG5cdH1cblxuXHRnZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoKTogSURlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlciB7XG5cdFx0aWYgKHRoaXMuZGVmYXVsdEFjY291bnRQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdEFjY291bnRQcm92aWRlci5nZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLih0aGlzLmRlZmF1bHRBY2NvdW50Q29uZmlnPy5hdXRoZW50aWNhdGlvblByb3ZpZGVyLmRlZmF1bHQgPz8geyBpZDogJ2dpdGh1YicsIG5hbWU6ICdHaXRIdWInIH0pLFxuXHRcdFx0ZW50ZXJwcmlzZTogZmFsc2Vcblx0XHR9O1xuXHR9XG5cblx0c2V0RGVmYXVsdEFjY291bnRQcm92aWRlcihwcm92aWRlcjogSURlZmF1bHRBY2NvdW50UHJvdmlkZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5kZWZhdWx0QWNjb3VudFByb3ZpZGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0RlZmF1bHQgYWNjb3VudCBwcm92aWRlciBpcyBhbHJlYWR5IHNldCcpO1xuXHRcdH1cblxuXHRcdHRoaXMuZGVmYXVsdEFjY291bnRQcm92aWRlciA9IHByb3ZpZGVyO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHByb3ZpZGVyLm9uRGlkQ2hhbmdlTWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yKGVycm9yID0+IHRoaXMuX29uRGlkQ2hhbmdlTWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yLmZpcmUoZXJyb3IpKSk7XG5cdFx0aWYgKHRoaXMuZGVmYXVsdEFjY291bnRQcm92aWRlci5wb2xpY3lEYXRhKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVBvbGljeURhdGEuZmlyZSh0aGlzLmRlZmF1bHRBY2NvdW50UHJvdmlkZXIucG9saWN5RGF0YSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmRlZmF1bHRBY2NvdW50UHJvdmlkZXIubWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZU1hbmFnZWRTZXR0aW5nc0NvbXBhdGliaWxpdHlFcnJvci5maXJlKHRoaXMuZGVmYXVsdEFjY291bnRQcm92aWRlci5tYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3IpO1xuXHRcdH1cblx0XHRwcm92aWRlci5yZWZyZXNoKCkudGhlbihhY2NvdW50ID0+IHtcblx0XHRcdHRoaXMuZGVmYXVsdEFjY291bnQgPSBhY2NvdW50O1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0dGhpcy5pbml0QmFycmllci5vcGVuKCk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihwcm92aWRlci5vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50KGFjY291bnQgPT4gdGhpcy5zZXREZWZhdWx0QWNjb3VudChhY2NvdW50KSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocHJvdmlkZXIub25EaWRDaGFuZ2VQb2xpY3lEYXRhKHBvbGljeURhdGEgPT4gdGhpcy5fb25EaWRDaGFuZ2VQb2xpY3lEYXRhLmZpcmUocG9saWN5RGF0YSkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHByb3ZpZGVyLm9uRGlkQ2hhbmdlQ29waWxvdFRva2VuSW5mbyh0b2tlbkluZm8gPT4gdGhpcy5fb25EaWRDaGFuZ2VDb3BpbG90VG9rZW5JbmZvLmZpcmUodG9rZW5JbmZvKSkpO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcmVmcmVzaChvcHRpb25zPzogeyBmb3JjZVJlZnJlc2g/OiBib29sZWFuIH0pOiBQcm9taXNlPElEZWZhdWx0QWNjb3VudCB8IG51bGw+IHtcblx0XHRhd2FpdCB0aGlzLmluaXRCYXJyaWVyLndhaXQoKTtcblxuXHRcdGNvbnN0IGFjY291bnQgPSBhd2FpdCB0aGlzLmRlZmF1bHRBY2NvdW50UHJvdmlkZXI/LnJlZnJlc2gob3B0aW9ucyk7XG5cdFx0dGhpcy5zZXREZWZhdWx0QWNjb3VudChhY2NvdW50ID8/IG51bGwpO1xuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRBY2NvdW50O1xuXHR9XG5cblx0YXN5bmMgc2lnbkluKG9wdGlvbnM/OiB7IGFkZGl0aW9uYWxTY29wZXM/OiByZWFkb25seSBzdHJpbmdbXTtba2V5OiBzdHJpbmddOiB1bmtub3duIH0pOiBQcm9taXNlPElEZWZhdWx0QWNjb3VudCB8IG51bGw+IHtcblx0XHRhd2FpdCB0aGlzLmluaXRCYXJyaWVyLndhaXQoKTtcblx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0QWNjb3VudFByb3ZpZGVyPy5zaWduSW4ob3B0aW9ucykgPz8gbnVsbDtcblx0fVxuXG5cdGFzeW5jIHNpZ25PdXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5pbml0QmFycmllci53YWl0KCk7XG5cdFx0YXdhaXQgdGhpcy5kZWZhdWx0QWNjb3VudFByb3ZpZGVyPy5zaWduT3V0KCk7XG5cdH1cblxuXHRyZXNvbHZlR2l0SHViVXJsKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuZGVmYXVsdEFjY291bnRQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdEFjY291bnRQcm92aWRlci5yZXNvbHZlR2l0SHViVXJsKHBhdGgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBgaHR0cHM6Ly9naXRodWIuY29tLyR7cGF0aH1gO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXREZWZhdWx0QWNjb3VudChhY2NvdW50OiBJRGVmYXVsdEFjY291bnQgfCBudWxsKTogdm9pZCB7XG5cdFx0aWYgKGVxdWFscyh0aGlzLmRlZmF1bHRBY2NvdW50LCBhY2NvdW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmRlZmF1bHRBY2NvdW50ID0gYWNjb3VudDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50LmZpcmUodGhpcy5kZWZhdWx0QWNjb3VudCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElBY2NvdW50UG9saWN5RGF0YSB7XG5cdHJlYWRvbmx5IGFjY291bnRJZDogc3RyaW5nO1xuXHRyZWFkb25seSBwb2xpY3lEYXRhOiBJUG9saWN5RGF0YTtcblx0cmVhZG9ubHkgZW50aXRsZW1lbnRzRmV0Y2hlZEF0PzogbnVtYmVyO1xuXHRyZWFkb25seSB0b2tlbkVudGl0bGVtZW50c0ZldGNoZWRBdD86IG51bWJlcjtcblx0cmVhZG9ubHkgbWNwUmVnaXN0cnlEYXRhRmV0Y2hlZEF0PzogbnVtYmVyO1xuXHRyZWFkb25seSBtYW5hZ2VkU2V0dGluZ3NGZXRjaGVkQXQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IG1hbmFnZWRTZXR0aW5nc0NvbXBhdGliaWxpdHlFcnJvcj86IElNYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3I7XG59XG5cbmludGVyZmFjZSBJQ2FjaGVkQWNjb3VudERhdGEge1xuXHRyZWFkb25seSBhY2NvdW50UG9saWN5RGF0YTogSUFjY291bnRQb2xpY3lEYXRhO1xuXHRyZWFkb25seSBjb3BpbG90VG9rZW5JbmZvPzogSUNvcGlsb3RUb2tlbkluZm87XG59XG5cbmludGVyZmFjZSBJRGVmYXVsdEFjY291bnREYXRhIHtcblx0YWNjb3VudElkOiBzdHJpbmc7XG5cdGRlZmF1bHRBY2NvdW50OiBJRGVmYXVsdEFjY291bnQ7XG5cdHBvbGljeURhdGE6IElBY2NvdW50UG9saWN5RGF0YSB8IG51bGw7XG5cdGNvcGlsb3RUb2tlbkluZm86IElDb3BpbG90VG9rZW5JbmZvIHwgbnVsbDtcbn1cblxudHlwZSBNYW5hZ2VkU2V0dGluZ3NSZXF1ZXN0UmVzdWx0ID1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICdzdWNjZXNzJzsgcmVhZG9ubHkgZGF0YTogUGFydGlhbDxJUG9saWN5RGF0YT4gfVxuXHR8IHsgcmVhZG9ubHkga2luZDogJ25vU2V0dGluZ3MnIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICd1cGRhdGVSZXF1aXJlZCc7IHJlYWRvbmx5IGVycm9yOiBJTWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICd1bmF2YWlsYWJsZScgfTtcblxudHlwZSBEZWZhdWx0QWNjb3VudFN0YXR1c1RlbGVtZXRyeSA9IHtcblx0c3RhdHVzOiBzdHJpbmc7XG5cdGluaXRpYWw6IGJvb2xlYW47XG59O1xuXG50eXBlIERlZmF1bHRBY2NvdW50U3RhdHVzVGVsZW1ldHJ5Q2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnc2FuZHkwODEnO1xuXHRjb21tZW50OiAnTG9nIGRlZmF1bHQgYWNjb3VudCBhdmFpbGFiaWxpdHkgc3RhdHVzJztcblx0c3RhdHVzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnSW5kaWNhdGVzIHdoZXRoZXIgZGVmYXVsdCBhY2NvdW50IGlzIGF2YWlsYWJsZSBvciBub3QuJyB9O1xuXHRpbml0aWFsOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnSW5kaWNhdGVzIHdoZXRoZXIgdGhpcyBpcyB0aGUgaW5pdGlhbCBzdGF0dXMgcmVwb3J0LicgfTtcbn07XG5cbnR5cGUgTWFuYWdlZFNldHRpbmdzRmV0Y2hUZWxlbWV0cnkgPSB7XG5cdG91dGNvbWU6IHN0cmluZztcblx0cmF0ZUxpbWl0QmFja29mZkFjdGl2ZTogYm9vbGVhbjtcbn07XG5cbnR5cGUgTWFuYWdlZFNldHRpbmdzRmV0Y2hUZWxlbWV0cnlDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdqb3Noc3BpY2VyJztcblx0Y29tbWVudDogJ091dGNvbWUgb2YgYSBmZXRjaCBhZ2FpbnN0IHRoZSBlbnRlcnByaXNlIG1hbmFnZWRfc2V0dGluZ3MgZW5kcG9pbnQuIFVzZWQgdG8gZGV0ZWN0IGVuZHBvaW50IHJlZ3Jlc3Npb25zIGFuZCBhYm5vcm1hbCBmYWlsdXJlIHJhdGVzIGluIHRoZSB3aWxkLic7XG5cdG91dGNvbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdIaWdoLWxldmVsIG91dGNvbWU6IGEgbnVtZXJpYyBIVFRQIHN0YXR1cyAoYHN0YXR1czpOTk5gKSwgb3Igb25lIG9mIGBva2AgLyBgbm8tcmVzcG9uc2VgIC8gYHBhcnNlLWVycm9yYC4nIH07XG5cdHJhdGVMaW1pdEJhY2tvZmZBY3RpdmU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUcnVlIHdoZW4gdGhlIHJlcXVlc3Qgd2FzIHNob3J0LWNpcmN1aXRlZCBiZWNhdXNlIGEgcHJpb3IgcmF0ZS1saW1pdCBSZXRyeS1BZnRlciB3aW5kb3cgd2FzIHN0aWxsIGFjdGl2ZS4nIH07XG59O1xuXG5leHBvcnQgY2xhc3MgRGVmYXVsdEFjY291bnRQcm92aWRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRGVmYXVsdEFjY291bnRQcm92aWRlciB7XG5cblx0cHJpdmF0ZSBfZGVmYXVsdEFjY291bnQ6IElEZWZhdWx0QWNjb3VudERhdGEgfCBudWxsID0gbnVsbDtcblx0Z2V0IGRlZmF1bHRBY2NvdW50KCk6IElEZWZhdWx0QWNjb3VudCB8IG51bGwgeyByZXR1cm4gdGhpcy5fZGVmYXVsdEFjY291bnQ/LmRlZmF1bHRBY2NvdW50ID8/IG51bGw7IH1cblxuXHRwcml2YXRlIF9wb2xpY3lEYXRhOiBJQWNjb3VudFBvbGljeURhdGEgfCBudWxsID0gbnVsbDtcblx0Z2V0IHBvbGljeURhdGEoKTogSVBvbGljeURhdGEgfCBudWxsIHsgcmV0dXJuIHRoaXMuX3BvbGljeURhdGE/LnBvbGljeURhdGEgPz8gbnVsbDsgfVxuXG5cdHByaXZhdGUgX2NvcGlsb3RUb2tlbkluZm86IElDb3BpbG90VG9rZW5JbmZvIHwgbnVsbCA9IG51bGw7XG5cdGdldCBjb3BpbG90VG9rZW5JbmZvKCk6IElDb3BpbG90VG9rZW5JbmZvIHwgbnVsbCB7IHJldHVybiB0aGlzLl9jb3BpbG90VG9rZW5JbmZvOyB9XG5cblx0cHJpdmF0ZSBfbWFuYWdlZFNldHRpbmdzRmV0Y2hTdGF0dXM6IE1hbmFnZWRTZXR0aW5nc0ZldGNoU3RhdHVzID0gbnVsbDtcblx0Z2V0IG1hbmFnZWRTZXR0aW5nc0ZldGNoU3RhdHVzKCk6IE1hbmFnZWRTZXR0aW5nc0ZldGNoU3RhdHVzIHsgcmV0dXJuIHRoaXMuX21hbmFnZWRTZXR0aW5nc0ZldGNoU3RhdHVzOyB9XG5cdGdldCBtYW5hZ2VkU2V0dGluZ3NGZXRjaGVkQXQoKTogbnVtYmVyIHwgbnVsbCB7IHJldHVybiB0aGlzLl9wb2xpY3lEYXRhPy5tYW5hZ2VkU2V0dGluZ3NGZXRjaGVkQXQgPz8gbnVsbDsgfVxuXG5cdHByaXZhdGUgX21hbmFnZWRTZXR0aW5nc1Jhd1Jlc3BvbnNlOiB1bmtub3duID0gbnVsbDtcblx0Z2V0IG1hbmFnZWRTZXR0aW5nc1Jhd1Jlc3BvbnNlKCk6IHVua25vd24geyByZXR1cm4gdGhpcy5fbWFuYWdlZFNldHRpbmdzUmF3UmVzcG9uc2U7IH1cblxuXHRwcml2YXRlIF9tYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3I6IElNYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3IgfCBudWxsID0gbnVsbDtcblx0Z2V0IG1hbmFnZWRTZXR0aW5nc0NvbXBhdGliaWxpdHlFcnJvcigpOiBJTWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yIHwgbnVsbCB7IHJldHVybiB0aGlzLl9tYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3I7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SURlZmF1bHRBY2NvdW50IHwgbnVsbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQgPSB0aGlzLl9vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUG9saWN5RGF0YSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElQb2xpY3lEYXRhIHwgbnVsbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUG9saWN5RGF0YSA9IHRoaXMuX29uRGlkQ2hhbmdlUG9saWN5RGF0YS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvcGlsb3RUb2tlbkluZm8gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ29waWxvdFRva2VuSW5mbyB8IG51bGw+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvcGlsb3RUb2tlbkluZm8gPSB0aGlzLl9vbkRpZENoYW5nZUNvcGlsb3RUb2tlbkluZm8uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yIHwgbnVsbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yID0gdGhpcy5fb25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBhY2NvdW50U3RhdHVzQ29udGV4dDogSUNvbnRleHRLZXk8c3RyaW5nPjtcblx0cHJpdmF0ZSBpbml0aWFsaXplZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGluaXRQcm9taXNlOiBQcm9taXNlPHZvaWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHVwZGF0ZVRocm90dGxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZWREZWxheWVyKDEwMCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjY291bnREYXRhUG9sbFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMucmVmZXRjaERlZmF1bHRBY2NvdW50KCksIEFDQ09VTlRfREFUQV9QT0xMX0lOVEVSVkFMX01TKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWFuYWdlZFNldHRpbmdzRmV0Y2hBdHRlbXB0ZWRBY2NvdW50cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdEFjY291bnRDb25maWc6IElEZWZhdWx0QWNjb3VudENvbmZpZyxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVxdWVzdFNlcnZpY2U6IElSZXF1ZXN0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5hY2NvdW50U3RhdHVzQ29udGV4dCA9IENPTlRFWFRfREVGQVVMVF9BQ0NPVU5UX1NUQVRFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgY2FjaGVkQWNjb3VudERhdGEgPSB0aGlzLmdldENhY2hlZEFjY291bnREYXRhKCk7XG5cdFx0dGhpcy5fcG9saWN5RGF0YSA9IGNhY2hlZEFjY291bnREYXRhPy5hY2NvdW50UG9saWN5RGF0YSA/PyBudWxsO1xuXHRcdHRoaXMuX2NvcGlsb3RUb2tlbkluZm8gPSBjYWNoZWRBY2NvdW50RGF0YT8uY29waWxvdFRva2VuSW5mbyA/PyBudWxsO1xuXHRcdHRoaXMuX21hbmFnZWRTZXR0aW5nc0NvbXBhdGliaWxpdHlFcnJvciA9IGNhY2hlZEFjY291bnREYXRhPy5hY2NvdW50UG9saWN5RGF0YS5tYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3IgPz8gbnVsbDtcblx0XHR0aGlzLmluaXRQcm9taXNlID0gdGhpcy5pbml0KClcblx0XHRcdC5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8RGVmYXVsdEFjY291bnRTdGF0dXNUZWxlbWV0cnksIERlZmF1bHRBY2NvdW50U3RhdHVzVGVsZW1ldHJ5Q2xhc3NpZmljYXRpb24+KCdkZWZhdWx0YWNjb3VudDpzdGF0dXMnLCB7IHN0YXR1czogdGhpcy5kZWZhdWx0QWNjb3VudCA/ICdhdmFpbGFibGUnIDogJ3VuYXZhaWxhYmxlJywgaW5pdGlhbDogdHJ1ZSB9KTtcblx0XHRcdFx0dGhpcy5pbml0aWFsaXplZCA9IHRydWU7XG5cdFx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q2FjaGVkQWNjb3VudERhdGEoKTogSUNhY2hlZEFjY291bnREYXRhIHwgbnVsbCB7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoQ0FDSEVEX1BPTElDWV9EQVRBX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRpZiAoY2FjaGVkKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGNhY2hlZCk7XG5cblx0XHRcdFx0Ly8gVE9ETzogUmVtb3ZlIG9sZCBmb3JtYXQgbWlncmF0aW9uIGFmdGVyIEF1Z3VzdCAyMDI2LlxuXHRcdFx0XHQvLyBQcmV2aW91c2x5LCB0aGUgY2FjaGUgc3RvcmVkIGEgZmxhdCBJQWNjb3VudFBvbGljeURhdGEgc2hhcGVcblx0XHRcdFx0Ly8gKGUuZy4geyBhY2NvdW50SWQsIHBvbGljeURhdGEsIC4uLiB9KS4gV2Ugbm93IHdyYXAgaXQgaW5zaWRlXG5cdFx0XHRcdC8vIElDYWNoZWRBY2NvdW50RGF0YSAoeyBhY2NvdW50UG9saWN5RGF0YSwgY29waWxvdFRva2VuSW5mbyB9KS5cblx0XHRcdFx0Ly8gVGhpcyBicmFuY2ggbWlncmF0ZXMgdGhlIG9sZCBmbGF0IGZvcm1hdCB0byB0aGUgbmV3IHNoYXBlIGFuZFxuXHRcdFx0XHQvLyByZS1zdG9yZXMgaXQgc28gc3Vic2VxdWVudCByZWFkcyB1c2UgdGhlIG5ldyBmb3JtYXQgZGlyZWN0bHkuXG5cdFx0XHRcdGNvbnN0IHsgYWNjb3VudElkLCBwb2xpY3lEYXRhLCB0b2tlbkVudGl0bGVtZW50c0ZldGNoZWRBdCwgbWNwUmVnaXN0cnlEYXRhRmV0Y2hlZEF0LCBjb3BpbG90VG9rZW5JbmZvIH0gPSBwYXJzZWQ7XG5cdFx0XHRcdGlmIChhY2NvdW50SWQgJiYgcG9saWN5RGF0YSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBJbml0aWFsaXppbmcgd2l0aCBjYWNoZWQgcG9saWN5IGRhdGEgKG1pZ3JhdGluZyBvbGQgZm9ybWF0KScpO1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdDogSUNhY2hlZEFjY291bnREYXRhID0geyBhY2NvdW50UG9saWN5RGF0YTogeyBhY2NvdW50SWQsIHBvbGljeURhdGEsIHRva2VuRW50aXRsZW1lbnRzRmV0Y2hlZEF0LCBtY3BSZWdpc3RyeURhdGFGZXRjaGVkQXQgfSwgY29waWxvdFRva2VuSW5mbyB9O1xuXHRcdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ0FDSEVEX1BPTElDWV9EQVRBX0tFWSwgSlNPTi5zdHJpbmdpZnkocmVzdWx0KSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBOZXcgZm9ybWF0XG5cdFx0XHRcdGNvbnN0IHsgYWNjb3VudFBvbGljeURhdGEsIGNvcGlsb3RUb2tlbkluZm86IHdyYXBwZWRDb3BpbG90VG9rZW5JbmZvIH0gPSBwYXJzZWQ7XG5cdFx0XHRcdGlmIChhY2NvdW50UG9saWN5RGF0YT8uYWNjb3VudElkICYmIGFjY291bnRQb2xpY3lEYXRhPy5wb2xpY3lEYXRhKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIEluaXRpYWxpemluZyB3aXRoIGNhY2hlZCBwb2xpY3kgZGF0YScpO1xuXHRcdFx0XHRcdHJldHVybiB7IGFjY291bnRQb2xpY3lEYXRhLCBjb3BpbG90VG9rZW5JbmZvOiB3cmFwcGVkQ29waWxvdFRva2VuSW5mbyB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tEZWZhdWx0QWNjb3VudF0gRmFpbGVkIHRvIHBhcnNlIGNhY2hlZCBwb2xpY3kgZGF0YScsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW5pdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBTa2lwIGluaXRpYWxpemF0aW9uIGZvciBjbGFzc2ljIHdlYi1uby1yZW1vdGUgKHZzY29kZS5kZXYgZWRpdG9yKSwgYnV0XG5cdFx0Ly8gc3RpbGwgaW5pdGlhbGl6ZSBmb3IgdGhlIGFnZW50cyB3ZWIgd29ya2JlbmNoICh2c2NvZGUuZGV2L2FnZW50cykgd2hlcmVcblx0XHQvLyBhY2NvdW50IHN0YXRlIGRyaXZlcyB0aGUgdGl0bGUgYmFyIGFuZCB0aGUgd2VsY29tZSB3YWxrdGhyb3VnaC5cblx0XHRpZiAoaXNXZWIgJiYgIXRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSAmJiAhdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIFJ1bm5pbmcgaW4gd2ViIHdpdGhvdXQgcmVtb3RlLCBza2lwcGluZyBpbml0aWFsaXphdGlvbicpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFdhaXQgdW50aWwgdGhlIGRlZmF1bHQgYWNjb3VudCBhdXRoZW50aWNhdGlvbiBwcm92aWRlciBpcyBhdmFpbGFibGUgaW5zdGVhZCBvZlxuXHRcdC8vIHdhaXRpbmcgZm9yIGFsbCBpbnN0YWxsZWQgZXh0ZW5zaW9ucyB0byBiZSByZWdpc3RlcmVkLiBJbiBkZXNrdG9wIHJlbW90ZVxuXHRcdC8vIGNvbm5lY3Rpb25zIGV4dGVuc2lvbnMgYXJlIG9ubHkgcmVnaXN0ZXJlZCBhZnRlciB0aGUgY29ubmVjdGlvbiBpcyBlc3RhYmxpc2hlZCxcblx0XHQvLyBzbyB3YWl0aW5nIGZvciBgd2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkYCBjYW4gZGVhZGxvY2sgaW5pdGlhbGl6YXRpb24uXG5cdFx0YXdhaXQgdGhpcy53aGVuRGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyQXZhaWxhYmxlKCk7XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gU3RhcnRpbmcgaW5pdGlhbGl6YXRpb24nKTtcblx0XHRhd2FpdCB0aGlzLmRvVXBkYXRlRGVmYXVsdEFjY291bnQoKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gSW5pdGlhbGl6YXRpb24gY29tcGxldGUnKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudChhY2NvdW50ID0+IHtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPERlZmF1bHRBY2NvdW50U3RhdHVzVGVsZW1ldHJ5LCBEZWZhdWx0QWNjb3VudFN0YXR1c1RlbGVtZXRyeUNsYXNzaWZpY2F0aW9uPignZGVmYXVsdGFjY291bnQ6c3RhdHVzJywgeyBzdGF0dXM6IGFjY291bnQgPyAnYXZhaWxhYmxlJyA6ICd1bmF2YWlsYWJsZScsIGluaXRpYWw6IGZhbHNlIH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0QWNjb3VudFByb3ZpZGVyID0gdGhpcy5nZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoKTtcblx0XHRcdGlmIChlLnByb3ZpZGVySWQgIT09IGRlZmF1bHRBY2NvdW50UHJvdmlkZXIuaWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuZGVmYXVsdEFjY291bnQgJiYgZS5ldmVudC5yZW1vdmVkPy5zb21lKHNlc3Npb24gPT4gc2Vzc2lvbi5pZCA9PT0gdGhpcy5kZWZhdWx0QWNjb3VudD8uc2Vzc2lvbklkKSkge1xuXHRcdFx0XHR0aGlzLnNldERlZmF1bHRBY2NvdW50KG51bGwpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIFNlc3Npb25zIGNoYW5nZWQgZm9yIGRlZmF1bHQgYWNjb3VudCBwcm92aWRlciwgdXBkYXRpbmcgZGVmYXVsdCBhY2NvdW50Jyk7XG5cdFx0XHRcdHRoaXMudXBkYXRlRGVmYXVsdEFjY291bnQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VBY2NvdW50UHJlZmVyZW5jZShhc3luYyBlID0+IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRBY2NvdW50UHJvdmlkZXIgPSB0aGlzLmdldERlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcigpO1xuXHRcdFx0aWYgKGUucHJvdmlkZXJJZCAhPT0gZGVmYXVsdEFjY291bnRQcm92aWRlci5pZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gQWNjb3VudCBwcmVmZXJlbmNlIGNoYW5nZWQgZm9yIGRlZmF1bHQgYWNjb3VudCBwcm92aWRlciwgdXBkYXRpbmcgZGVmYXVsdCBhY2NvdW50Jyk7XG5cdFx0XHR0aGlzLnVwZGF0ZURlZmF1bHRBY2NvdW50KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRSZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoZSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0QWNjb3VudFByb3ZpZGVyID0gdGhpcy5nZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoKTtcblx0XHRcdGlmIChlLmlkICE9PSBkZWZhdWx0QWNjb3VudFByb3ZpZGVyLmlkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBEZWZhdWx0IGFjY291bnQgcHJvdmlkZXIgcmVnaXN0ZXJlZCwgdXBkYXRpbmcgZGVmYXVsdCBhY2NvdW50Jyk7XG5cdFx0XHR0aGlzLnVwZGF0ZURlZmF1bHRBY2NvdW50KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRVbnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihlID0+IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRBY2NvdW50UHJvdmlkZXIgPSB0aGlzLmdldERlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcigpO1xuXHRcdFx0aWYgKGUuaWQgIT09IGRlZmF1bHRBY2NvdW50UHJvdmlkZXIuaWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIERlZmF1bHQgYWNjb3VudCBwcm92aWRlciB1bnJlZ2lzdGVyZWQsIHVwZGF0aW5nIGRlZmF1bHQgYWNjb3VudCcpO1xuXHRcdFx0dGhpcy51cGRhdGVEZWZhdWx0QWNjb3VudCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1cyhmb2N1c2VkID0+IHtcblx0XHRcdGlmIChmb2N1c2VkKSB7XG5cdFx0XHRcdHRoaXMucmVmZXRjaERlZmF1bHRBY2NvdW50KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3aGVuRGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyQXZhaWxhYmxlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5nZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoKTtcblxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBXYWl0aW5nIGZvciBkZWZhdWx0IGFjY291bnQgYXV0aGVudGljYXRpb24gcHJvdmlkZXIgdG8gYmUgYXZhaWxhYmxlLicpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIHByb3ZpZGVyIGlzIGF2YWlsYWJsZS5cblx0XHRcdFx0Ly8gSWYgYXZhaWxhYmxlLCByZXNvbHZlIGltbWVkaWF0ZWx5LiBPdGhlcndpc2UsIHdhaXQgZm9yIGl0IHRvIGJlIGRlY2xhcmVkIG9yIHJlZ2lzdGVyZWQuXG5cdFx0XHRcdGlmICh0aGlzLmlzQWNjb3VudFByb3ZpZGVyQXZhaWxhYmxlKHByb3ZpZGVyKSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBEZWZhdWx0IGFjY291bnQgYXV0aGVudGljYXRpb24gcHJvdmlkZXIgaXMgbm93IGF2YWlsYWJsZS4nKTtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVzb2x2ZSBhcyBzb29uIGFzIHRoZSBkZWZhdWx0IGFjY291bnQgYXV0aGVudGljYXRpb24gcHJvdmlkZXIgaXMgZGVjbGFyZWQgb3Jcblx0XHRcdFx0Ly8gcmVnaXN0ZXJlZCwgYnV0IHdhaXQgbm8gbG9uZ2VyIHRoYW4gaW5zdGFsbGVkIGV4dGVuc2lvbnMgYmVpbmcgcmVnaXN0ZXJlZC5cblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LmFueSh0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZENoYW5nZURlY2xhcmVkUHJvdmlkZXJzLCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZFJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcikoKCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLmlzQWNjb3VudFByb3ZpZGVyQXZhaWxhYmxlKHByb3ZpZGVyKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIERlZmF1bHQgYWNjb3VudCBhdXRoZW50aWNhdGlvbiBwcm92aWRlciBpcyBub3cgYXZhaWxhYmxlLicpO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIEV4cGxpY2l0bHkgYWN0aXZhdGUgdGhlIHByb3ZpZGVyJ3MgZXh0ZW5zaW9uIHNvIHRoYXQgdGhlIGF1dGhlbnRpY2F0aW9uXG5cdFx0XHRcdC8vIHByb3ZpZGVyIGdldHMgcmVnaXN0ZXJlZC4gSW4gZGVza3RvcCByZW1vdGUgY29ubmVjdGlvbnMgZXh0ZW5zaW9ucyBhcmUgb25seVxuXHRcdFx0XHQvLyByZWdpc3RlcmVkIGFmdGVyIHRoZSBjb25uZWN0aW9uIGlzIGVzdGFibGlzaGVkLCBzbyB3aXRob3V0IHRoaXMgdGhlIHByb3ZpZGVyXG5cdFx0XHRcdC8vIHdvdWxkIG5ldmVyIGJlY29tZSBhdmFpbGFibGUuXG5cdFx0XHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0XHR2b2lkIHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKHByb3ZpZGVyLmlkLCB1bmRlZmluZWQsIHt9LCB0cnVlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIEluc3RhbGxlZCBleHRlbnNpb25zIHJlZ2lzdGVyZWQuJyk7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9LCBlcnJvciA9PiB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbRGVmYXVsdEFjY291bnRdIEVycm9yIHdoaWxlIHdhaXRpbmcgZm9yIGluc3RhbGxlZCBleHRlbnNpb25zIHRvIGJlIHJlZ2lzdGVyZWQnLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZWZyZXNoKG9wdGlvbnM/OiB7IGZvcmNlUmVmcmVzaD86IGJvb2xlYW4gfSk6IFByb21pc2U8SURlZmF1bHRBY2NvdW50IHwgbnVsbD4ge1xuXHRcdGlmICghdGhpcy5pbml0aWFsaXplZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5pbml0UHJvbWlzZTtcblx0XHRcdHJldHVybiB0aGlzLmRlZmF1bHRBY2NvdW50O1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBSZWZyZXNoaW5nIGRlZmF1bHQgYWNjb3VudCcpO1xuXG5cdFx0YXdhaXQgdGhpcy51cGRhdGVEZWZhdWx0QWNjb3VudChvcHRpb25zKTtcblx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0QWNjb3VudDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVmZXRjaERlZmF1bHRBY2NvdW50KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmFjY291bnREYXRhUG9sbFNjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHR0aGlzLmFjY291bnREYXRhUG9sbFNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmhvc3RTZXJ2aWNlLmhhc0ZvY3VzIHx8ICF0aGlzLl9kZWZhdWx0QWNjb3VudCkge1xuXHRcdFx0dGhpcy5zY2hlZHVsZUFjY291bnREYXRhUG9sbCgpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIFNraXBwaW5nIHJlZmV0Y2hpbmcgZGVmYXVsdCBhY2NvdW50LiBIb3N0IGlzIG5vdCBmb2N1c2VkIG9yIGRlZmF1bHQgYWNjb3VudCBpcyBub3Qgc2V0Jyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBSZWZldGNoaW5nIGRlZmF1bHQgYWNjb3VudCcpO1xuXHRcdGF3YWl0IHRoaXMudXBkYXRlRGVmYXVsdEFjY291bnQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlRGVmYXVsdEFjY291bnQob3B0aW9ucz86IHsgZm9yY2VSZWZyZXNoPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy51cGRhdGVUaHJvdHRsZXIudHJpZ2dlcigoKSA9PiB0aGlzLmRvVXBkYXRlRGVmYXVsdEFjY291bnQob3B0aW9ucykpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1VwZGF0ZURlZmF1bHRBY2NvdW50KG9wdGlvbnM/OiB7IGZvcmNlUmVmcmVzaD86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBkZWZhdWx0QWNjb3VudCA9IGF3YWl0IHRoaXMuZmV0Y2hEZWZhdWx0QWNjb3VudChvcHRpb25zKTtcblx0XHRcdHRoaXMuc2V0RGVmYXVsdEFjY291bnQoZGVmYXVsdEFjY291bnQpO1xuXHRcdFx0dGhpcy5zY2hlZHVsZUFjY291bnREYXRhUG9sbCgpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tEZWZhdWx0QWNjb3VudF0gRXJyb3Igd2hpbGUgdXBkYXRpbmcgZGVmYXVsdCBhY2NvdW50JywgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBmZXRjaERlZmF1bHRBY2NvdW50KG9wdGlvbnM/OiB7IGZvcmNlUmVmcmVzaD86IGJvb2xlYW4gfSk6IFByb21pc2U8SURlZmF1bHRBY2NvdW50RGF0YSB8IG51bGw+IHtcblx0XHRjb25zdCBkZWZhdWx0QWNjb3VudFByb3ZpZGVyID0gdGhpcy5nZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gRGVmYXVsdCBhY2NvdW50IHByb3ZpZGVyIElEOicsIGRlZmF1bHRBY2NvdW50UHJvdmlkZXIuaWQpO1xuXG5cdFx0aWYgKCF0aGlzLmlzQWNjb3VudFByb3ZpZGVyQXZhaWxhYmxlKGRlZmF1bHRBY2NvdW50UHJvdmlkZXIpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgW0RlZmF1bHRBY2NvdW50XSBBdXRoZW50aWNhdGlvbiBwcm92aWRlciBpcyBub3QgYXZhaWxhYmxlLmAsIGRlZmF1bHRBY2NvdW50UHJvdmlkZXIpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuZ2V0RGVmYXVsdEFjY291bnRGb3JBdXRoZW50aWNhdGlvblByb3ZpZGVyKGRlZmF1bHRBY2NvdW50UHJvdmlkZXIsIG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0FjY291bnRQcm92aWRlckF2YWlsYWJsZShhY2NvdW50UHJvdmlkZXI6IElEZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZGVjbGFyZWRQcm92aWRlcnMuc29tZShwID0+IHAuaWQgPT09IGFjY291bnRQcm92aWRlci5pZClcblx0XHRcdHx8IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmlzQXV0aGVudGljYXRpb25Qcm92aWRlclJlZ2lzdGVyZWQoYWNjb3VudFByb3ZpZGVyLmlkKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0RGVmYXVsdEFjY291bnQoYWNjb3VudDogSURlZmF1bHRBY2NvdW50RGF0YSB8IG51bGwpOiB2b2lkIHtcblx0XHRpZiAoZXF1YWxzKHRoaXMuX2RlZmF1bHRBY2NvdW50LCBhY2NvdW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0RlZmF1bHRBY2NvdW50XSBVcGRhdGluZyBkZWZhdWx0IGFjY291bnQ6JywgYWNjb3VudCk7XG5cdFx0aWYgKGFjY291bnQpIHtcblx0XHRcdHRoaXMuX2RlZmF1bHRBY2NvdW50ID0gYWNjb3VudDtcblx0XHRcdHRoaXMuc2V0Q29waWxvdFRva2VuSW5mbyhhY2NvdW50LmNvcGlsb3RUb2tlbkluZm8pO1xuXHRcdFx0dGhpcy5zZXRQb2xpY3lEYXRhKGFjY291bnQucG9saWN5RGF0YSk7XG5cdFx0XHR0aGlzLnNldE1hbmFnZWRTZXR0aW5nc0NvbXBhdGliaWxpdHlFcnJvcihhY2NvdW50LnBvbGljeURhdGE/Lm1hbmFnZWRTZXR0aW5nc0NvbXBhdGliaWxpdHlFcnJvciA/PyBudWxsKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQuZmlyZSh0aGlzLl9kZWZhdWx0QWNjb3VudC5kZWZhdWx0QWNjb3VudCk7XG5cdFx0XHR0aGlzLmFjY291bnRTdGF0dXNDb250ZXh0LnNldChEZWZhdWx0QWNjb3VudFN0YXR1cy5BdmFpbGFibGUpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIEFjY291bnQgc3RhdHVzIHNldCB0byBBdmFpbGFibGUnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZGVmYXVsdEFjY291bnQgPSBudWxsO1xuXHRcdFx0dGhpcy5zZXRQb2xpY3lEYXRhKG51bGwpO1xuXHRcdFx0dGhpcy5zZXRNYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3IobnVsbCk7XG5cdFx0XHR0aGlzLnNldENvcGlsb3RUb2tlbkluZm8obnVsbCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50LmZpcmUobnVsbCk7XG5cdFx0XHR0aGlzLmFjY291bnREYXRhUG9sbFNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHRcdHRoaXMuYWNjb3VudFN0YXR1c0NvbnRleHQuc2V0KERlZmF1bHRBY2NvdW50U3RhdHVzLlVuYXZhaWxhYmxlKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBBY2NvdW50IHN0YXR1cyBzZXQgdG8gVW5hdmFpbGFibGUnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldFBvbGljeURhdGEoYWNjb3VudFBvbGljeURhdGE6IElBY2NvdW50UG9saWN5RGF0YSB8IG51bGwpOiB2b2lkIHtcblx0XHRpZiAoZXF1YWxzKHRoaXMuX3BvbGljeURhdGEsIGFjY291bnRQb2xpY3lEYXRhKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wb2xpY3lEYXRhID0gYWNjb3VudFBvbGljeURhdGE7XG5cdFx0dGhpcy5jYWNoZVBvbGljeURhdGEoYWNjb3VudFBvbGljeURhdGEpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUG9saWN5RGF0YS5maXJlKHRoaXMuX3BvbGljeURhdGE/LnBvbGljeURhdGEgPz8gbnVsbCk7XG5cdH1cblxuXHRwcml2YXRlIHNldE1hbmFnZWRTZXR0aW5nc0NvbXBhdGliaWxpdHlFcnJvcihlcnJvcjogSU1hbmFnZWRTZXR0aW5nc0NvbXBhdGliaWxpdHlFcnJvciB8IG51bGwpOiB2b2lkIHtcblx0XHRpZiAoZXF1YWxzKHRoaXMuX21hbmFnZWRTZXR0aW5nc0NvbXBhdGliaWxpdHlFcnJvciwgZXJyb3IpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX21hbmFnZWRTZXR0aW5nc0NvbXBhdGliaWxpdHlFcnJvciA9IGVycm9yO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yLmZpcmUoZXJyb3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRDb3BpbG90VG9rZW5JbmZvKGNvcGlsb3RUb2tlbkluZm86IElDb3BpbG90VG9rZW5JbmZvIHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmIChlcXVhbHModGhpcy5fY29waWxvdFRva2VuSW5mbywgY29waWxvdFRva2VuSW5mbykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY29waWxvdFRva2VuSW5mbyA9IGNvcGlsb3RUb2tlbkluZm87XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb3BpbG90VG9rZW5JbmZvLmZpcmUodGhpcy5fY29waWxvdFRva2VuSW5mbyk7XG5cdH1cblxuXHRwcml2YXRlIGNhY2hlUG9saWN5RGF0YShhY2NvdW50UG9saWN5RGF0YTogSUFjY291bnRQb2xpY3lEYXRhIHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmIChhY2NvdW50UG9saWN5RGF0YSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIENhY2hpbmcgcG9saWN5IGRhdGEgZm9yIGFjY291bnQ6JywgYWNjb3VudFBvbGljeURhdGEuYWNjb3VudElkKTtcblx0XHRcdGNvbnN0IGNhY2hlZEFjY291bnREYXRhOiBJQ2FjaGVkQWNjb3VudERhdGEgPSB7XG5cdFx0XHRcdGFjY291bnRQb2xpY3lEYXRhLFxuXHRcdFx0XHRjb3BpbG90VG9rZW5JbmZvOiB0aGlzLl9jb3BpbG90VG9rZW5JbmZvID8/IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKENBQ0hFRF9QT0xJQ1lfREFUQV9LRVksIEpTT04uc3RyaW5naWZ5KGNhY2hlZEFjY291bnREYXRhKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gUmVtb3ZpbmcgY2FjaGVkIHBvbGljeSBkYXRhJyk7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShDQUNIRURfUE9MSUNZX0RBVEFfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2NoZWR1bGVBY2NvdW50RGF0YVBvbGwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9kZWZhdWx0QWNjb3VudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmFjY291bnREYXRhUG9sbFNjaGVkdWxlci5zY2hlZHVsZShBQ0NPVU5UX0RBVEFfUE9MTF9JTlRFUlZBTF9NUyk7XG5cdH1cblxuXHRwcml2YXRlIGV4dHJhY3RGcm9tVG9rZW4odG9rZW46IHN0cmluZyk6IE1hcDxzdHJpbmcsIHN0cmluZz4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3QgZmlyc3RQYXJ0ID0gdG9rZW4/LnNwbGl0KCc6JylbMF07XG5cdFx0Y29uc3QgZmllbGRzID0gZmlyc3RQYXJ0Py5zcGxpdCgnOycpO1xuXHRcdGZvciAoY29uc3QgZmllbGQgb2YgZmllbGRzKSB7XG5cdFx0XHRjb25zdCBba2V5LCB2YWx1ZV0gPSBmaWVsZC5zcGxpdCgnPScpO1xuXHRcdFx0cmVzdWx0LnNldChrZXksIHZhbHVlKTtcblx0XHR9XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBbRGVmYXVsdEFjY291bnRdIGV4dHJhY3RGcm9tVG9rZW46ICR7SlNPTi5zdHJpbmdpZnkoT2JqZWN0LmZyb21FbnRyaWVzKHJlc3VsdCkpfWApO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldERlZmF1bHRBY2NvdW50Rm9yQXV0aGVudGljYXRpb25Qcm92aWRlcihhdXRoZW50aWNhdGlvblByb3ZpZGVyOiBJRGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBvcHRpb25zPzogeyBmb3JjZVJlZnJlc2g/OiBib29sZWFuIH0pOiBQcm9taXNlPElEZWZhdWx0QWNjb3VudERhdGEgfCBudWxsPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBHZXR0aW5nIERlZmF1bHQgQWNjb3VudCBmcm9tIGF1dGhlbnRpY2F0ZWQgc2Vzc2lvbnMgZm9yIHByb3ZpZGVyOicsIGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuaWQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCB0aGlzLmZpbmRNYXRjaGluZ1Byb3ZpZGVyU2Vzc2lvbihhdXRoZW50aWNhdGlvblByb3ZpZGVyLmlkLCB0aGlzLmRlZmF1bHRBY2NvdW50Q29uZmlnLmF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuc2NvcGVzKTtcblxuXHRcdFx0aWYgKCFzZXNzaW9ucz8ubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBObyBtYXRjaGluZyBzZXNzaW9uIGZvdW5kIGZvciBwcm92aWRlcjonLCBhdXRoZW50aWNhdGlvblByb3ZpZGVyLmlkKTtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXREZWZhdWx0QWNjb3VudEZyb21BdXRoZW50aWNhdGVkU2Vzc2lvbnMoYXV0aGVudGljYXRpb25Qcm92aWRlciwgc2Vzc2lvbnMsIG9wdGlvbnMpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tEZWZhdWx0QWNjb3VudF0gRmFpbGVkIHRvIGdldCBkZWZhdWx0IGFjY291bnQgZm9yIHByb3ZpZGVyOicsIGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuaWQsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXREZWZhdWx0QWNjb3VudEZyb21BdXRoZW50aWNhdGVkU2Vzc2lvbnMoYXV0aGVudGljYXRpb25Qcm92aWRlcjogSURlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlciwgc2Vzc2lvbnM6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdLCBvcHRpb25zPzogeyBmb3JjZVJlZnJlc2g/OiBib29sZWFuIH0pOiBQcm9taXNlPElEZWZhdWx0QWNjb3VudERhdGEgfCBudWxsPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFjY291bnRJZCA9IHNlc3Npb25zWzBdLmFjY291bnQuaWQ7XG5cdFx0XHRjb25zdCBhY2NvdW50UG9saWN5RGF0YSA9IHRoaXMuX3BvbGljeURhdGE/LmFjY291bnRJZCA9PT0gYWNjb3VudElkID8gdGhpcy5fcG9saWN5RGF0YSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgZW50aXRsZW1lbnRzUmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRFbnRpdGxlbWVudHMoc2Vzc2lvbnMsIGFjY291bnRQb2xpY3lEYXRhLCBvcHRpb25zKTtcblx0XHRcdGNvbnN0IGVudGl0bGVtZW50c0RhdGEgPSBlbnRpdGxlbWVudHNSZXN1bHQ/LmRhdGE7XG5cdFx0XHRjb25zdCBlbnRpdGxlbWVudHNGZXRjaGVkQXQgPSBlbnRpdGxlbWVudHNSZXN1bHQ/LmZldGNoZWRBdDtcblx0XHRcdGNvbnN0IFt0b2tlbkVudGl0bGVtZW50c1Jlc3VsdCwgbWFuYWdlZFNldHRpbmdzUmVzdWx0XSA9IGVudGl0bGVtZW50c0RhdGE/LmNoYXRfZW5hYmxlZFxuXHRcdFx0XHQ/IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0XHR0aGlzLmdldFRva2VuRW50aXRsZW1lbnRzKHNlc3Npb25zLCBhY2NvdW50UG9saWN5RGF0YSwgb3B0aW9ucyksXG5cdFx0XHRcdFx0dGhpcy5nZXRNYW5hZ2VkU2V0dGluZ3Moc2Vzc2lvbnMsIGFjY291bnRQb2xpY3lEYXRhLCBvcHRpb25zKSxcblx0XHRcdFx0XSlcblx0XHRcdFx0OiBbdW5kZWZpbmVkLCB1bmRlZmluZWRdO1xuXG5cdFx0XHRjb25zdCB0b2tlbkVudGl0bGVtZW50c0ZldGNoZWRBdDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdG9rZW5FbnRpdGxlbWVudHNSZXN1bHQ/LmZldGNoZWRBdDtcblx0XHRcdGNvbnN0IG1hbmFnZWRTZXR0aW5nc0ZldGNoZWRBdDogbnVtYmVyIHwgdW5kZWZpbmVkID0gbWFuYWdlZFNldHRpbmdzUmVzdWx0Py5mZXRjaGVkQXQ7XG5cdFx0XHRjb25zdCBtYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3IgPSBtYW5hZ2VkU2V0dGluZ3NSZXN1bHRcblx0XHRcdFx0PyBtYW5hZ2VkU2V0dGluZ3NSZXN1bHQuY29tcGF0aWJpbGl0eUVycm9yXG5cdFx0XHRcdDogdGhpcy5fbWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yO1xuXHRcdFx0bGV0IG1jcFJlZ2lzdHJ5RGF0YUZldGNoZWRBdDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHBvbGljeURhdGE6IE11dGFibGU8SVBvbGljeURhdGE+IHwgdW5kZWZpbmVkID0gYWNjb3VudFBvbGljeURhdGE/LnBvbGljeURhdGEgPyB7IC4uLmFjY291bnRQb2xpY3lEYXRhLnBvbGljeURhdGEgfSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChlbnRpdGxlbWVudHNEYXRhKSB7XG5cdFx0XHRcdHBvbGljeURhdGEgPSBwb2xpY3lEYXRhID8/IHt9O1xuXHRcdFx0XHRwb2xpY3lEYXRhLmNsb3VkX3Nlc3Npb25fc3RvcmFnZV9lbmFibGVkID0gZW50aXRsZW1lbnRzRGF0YS5jbG91ZF9zZXNzaW9uX3N0b3JhZ2VfZW5hYmxlZDtcblx0XHRcdH1cblx0XHRcdGlmICh0b2tlbkVudGl0bGVtZW50c1Jlc3VsdD8uZGF0YSkge1xuXHRcdFx0XHRjb25zdCB0b2tlbkVudGl0bGVtZW50c0RhdGEgPSB0b2tlbkVudGl0bGVtZW50c1Jlc3VsdC5kYXRhO1xuXHRcdFx0XHRwb2xpY3lEYXRhID0gcG9saWN5RGF0YSA/PyB7fTtcblx0XHRcdFx0cG9saWN5RGF0YS5jaGF0X2FnZW50X2VuYWJsZWQgPSB0b2tlbkVudGl0bGVtZW50c0RhdGEucG9saWN5RGF0YS5jaGF0X2FnZW50X2VuYWJsZWQ7XG5cdFx0XHRcdHBvbGljeURhdGEuY2hhdF9wcmV2aWV3X2ZlYXR1cmVzX2VuYWJsZWQgPSB0b2tlbkVudGl0bGVtZW50c0RhdGEucG9saWN5RGF0YS5jaGF0X3ByZXZpZXdfZmVhdHVyZXNfZW5hYmxlZDtcblx0XHRcdFx0cG9saWN5RGF0YS5tY3AgPSB0b2tlbkVudGl0bGVtZW50c0RhdGEucG9saWN5RGF0YS5tY3A7XG5cdFx0XHRcdGlmIChwb2xpY3lEYXRhLm1jcCkge1xuXHRcdFx0XHRcdGNvbnN0IG1jcFJlZ2lzdHJ5UmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRNY3BSZWdpc3RyeVByb3ZpZGVyKHNlc3Npb25zLCBhY2NvdW50UG9saWN5RGF0YSwgb3B0aW9ucyk7XG5cdFx0XHRcdFx0bWNwUmVnaXN0cnlEYXRhRmV0Y2hlZEF0ID0gbWNwUmVnaXN0cnlSZXN1bHQ/LmZldGNoZWRBdDtcblx0XHRcdFx0XHRwb2xpY3lEYXRhLm1jcFJlZ2lzdHJ5VXJsID0gbWNwUmVnaXN0cnlSZXN1bHQ/LmRhdGE/LnVybDtcblx0XHRcdFx0XHRwb2xpY3lEYXRhLm1jcEFjY2VzcyA9IG1jcFJlZ2lzdHJ5UmVzdWx0Py5kYXRhPy5yZWdpc3RyeV9hY2Nlc3M7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cG9saWN5RGF0YS5tY3BSZWdpc3RyeVVybCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRwb2xpY3lEYXRhLm1jcEFjY2VzcyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKG1hbmFnZWRTZXR0aW5nc1Jlc3VsdD8uZGF0YSkge1xuXHRcdFx0XHRwb2xpY3lEYXRhID0geyAuLi4ocG9saWN5RGF0YSA/PyB7fSksIC4uLm1hbmFnZWRTZXR0aW5nc1Jlc3VsdC5kYXRhIH07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRlZmF1bHRBY2NvdW50OiBJRGVmYXVsdEFjY291bnQgPSB7XG5cdFx0XHRcdGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIsXG5cdFx0XHRcdGFjY291bnROYW1lOiBzZXNzaW9uc1swXS5hY2NvdW50LmxhYmVsLFxuXHRcdFx0XHRzZXNzaW9uSWQ6IHNlc3Npb25zWzBdLmlkLFxuXHRcdFx0XHRlbnRlcnByaXNlOiBhdXRoZW50aWNhdGlvblByb3ZpZGVyLmVudGVycHJpc2UgfHwgc2Vzc2lvbnNbMF0uYWNjb3VudC5sYWJlbC5pbmNsdWRlcygnXycpLFxuXHRcdFx0XHRlbnRpdGxlbWVudHNEYXRhLFxuXHRcdFx0fTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBTdWNjZXNzZnVsbHkgY3JlYXRlZCBkZWZhdWx0IGFjY291bnQgZm9yIHByb3ZpZGVyOicsIGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuaWQpO1xuXHRcdFx0Y29uc3QgYWNjb3VudFBvbGljeVJlc3VsdDogSUFjY291bnRQb2xpY3lEYXRhIHwgbnVsbCA9IHBvbGljeURhdGEgfHwgZW50aXRsZW1lbnRzRmV0Y2hlZEF0XG5cdFx0XHRcdD8ge1xuXHRcdFx0XHRcdGFjY291bnRJZCxcblx0XHRcdFx0XHRwb2xpY3lEYXRhOiBwb2xpY3lEYXRhID8/IHt9LFxuXHRcdFx0XHRcdGVudGl0bGVtZW50c0ZldGNoZWRBdCxcblx0XHRcdFx0XHR0b2tlbkVudGl0bGVtZW50c0ZldGNoZWRBdCxcblx0XHRcdFx0XHRtY3BSZWdpc3RyeURhdGFGZXRjaGVkQXQsXG5cdFx0XHRcdFx0bWFuYWdlZFNldHRpbmdzRmV0Y2hlZEF0LFxuXHRcdFx0XHRcdG1hbmFnZWRTZXR0aW5nc0NvbXBhdGliaWxpdHlFcnJvcjogbWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yID8/IHVuZGVmaW5lZCxcblx0XHRcdFx0fVxuXHRcdFx0XHQ6IG51bGw7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkZWZhdWx0QWNjb3VudCxcblx0XHRcdFx0YWNjb3VudElkLFxuXHRcdFx0XHRwb2xpY3lEYXRhOiBhY2NvdW50UG9saWN5UmVzdWx0LFxuXHRcdFx0XHRjb3BpbG90VG9rZW5JbmZvOiB0b2tlbkVudGl0bGVtZW50c1Jlc3VsdD8uZGF0YT8uY29waWxvdFRva2VuSW5mbyA/PyBudWxsLFxuXHRcdFx0fTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbRGVmYXVsdEFjY291bnRdIEZhaWxlZCB0byBjcmVhdGUgZGVmYXVsdCBhY2NvdW50IGZvciBwcm92aWRlcjonLCBhdXRoZW50aWNhdGlvblByb3ZpZGVyLmlkLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZmluZE1hdGNoaW5nUHJvdmlkZXJTZXNzaW9uKGF1dGhQcm92aWRlcklkOiBzdHJpbmcsIGFsbFNjb3Blczogc3RyaW5nW11bXSk6IFByb21pc2U8QXV0aGVudGljYXRpb25TZXNzaW9uW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuZ2V0U2Vzc2lvbnMoYXV0aFByb3ZpZGVySWQpO1xuXHRcdGNvbnN0IG1hdGNoaW5nU2Vzc2lvbnMgPSBbXTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBDaGVja2luZyBzZXNzaW9uIHdpdGggc2NvcGVzJywgc2Vzc2lvbi5zY29wZXMpO1xuXHRcdFx0Zm9yIChjb25zdCBzY29wZXMgb2YgYWxsU2NvcGVzKSB7XG5cdFx0XHRcdGlmICh0aGlzLnNjb3Blc01hdGNoKHNlc3Npb24uc2NvcGVzLCBzY29wZXMpKSB7XG5cdFx0XHRcdFx0bWF0Y2hpbmdTZXNzaW9ucy5wdXNoKHNlc3Npb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBtYXRjaGluZ1Nlc3Npb25zLmxlbmd0aCA+IDAgPyBtYXRjaGluZ1Nlc3Npb25zIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTZXNzaW9ucyhhdXRoUHJvdmlkZXJJZDogc3RyaW5nKTogUHJvbWlzZTxyZWFkb25seSBBdXRoZW50aWNhdGlvblNlc3Npb25bXT4ge1xuXHRcdGZvciAobGV0IGF0dGVtcHQgPSAxOyBhdHRlbXB0IDw9IDM7IGF0dGVtcHQrKykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bGV0IHByZWZlcnJlZEFjY291bnQ6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGxldCBwcmVmZXJyZWRBY2NvdW50TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHByZWZlcnJlZEV4dGVuc2lvbiBvZiB0aGlzLmRlZmF1bHRBY2NvdW50Q29uZmlnLnByZWZlcnJlZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRwcmVmZXJyZWRBY2NvdW50TmFtZSA9IHRoaXMuYXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZS5nZXRBY2NvdW50UHJlZmVyZW5jZShwcmVmZXJyZWRFeHRlbnNpb24sIGF1dGhQcm92aWRlcklkKTtcblx0XHRcdFx0XHRpZiAocHJlZmVycmVkQWNjb3VudE5hbWUpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGFjY291bnQgb2YgYXdhaXQgdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0QWNjb3VudHMoYXV0aFByb3ZpZGVySWQpKSB7XG5cdFx0XHRcdFx0aWYgKGFjY291bnQubGFiZWwgPT09IHByZWZlcnJlZEFjY291bnROYW1lKSB7XG5cdFx0XHRcdFx0XHRwcmVmZXJyZWRBY2NvdW50ID0gYWNjb3VudDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhhdXRoUHJvdmlkZXJJZCwgdW5kZWZpbmVkLCB7IGFjY291bnQ6IHByZWZlcnJlZEFjY291bnQgfSwgdHJ1ZSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0RlZmF1bHRBY2NvdW50XSBBdHRlbXB0ICR7YXR0ZW1wdH0gdG8gZ2V0IHNlc3Npb25zIGZhaWxlZDpgLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdFx0aWYgKGF0dGVtcHQgPT09IDMpIHtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDUwMCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcignVW5hYmxlIHRvIGdldCBzZXNzaW9ucyBhZnRlciBtdWx0aXBsZSBhdHRlbXB0cycpO1xuXHR9XG5cblx0cHJpdmF0ZSBzY29wZXNNYXRjaChzY29wZXM6IFJlYWRvbmx5QXJyYXk8c3RyaW5nPiwgZXhwZWN0ZWRTY29wZXM6IHN0cmluZ1tdKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGV4cGVjdGVkU2NvcGVzLmV2ZXJ5KHNjb3BlID0+IHNjb3Blcy5pbmNsdWRlcyhzY29wZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRUb2tlbkVudGl0bGVtZW50cyhzZXNzaW9uczogQXV0aGVudGljYXRpb25TZXNzaW9uW10sIGFjY291bnRQb2xpY3lEYXRhOiBJQWNjb3VudFBvbGljeURhdGEgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiB7IGZvcmNlUmVmcmVzaD86IGJvb2xlYW4gfSk6IFByb21pc2U8eyBkYXRhOiB7IHBvbGljeURhdGE6IFBhcnRpYWw8SVBvbGljeURhdGE+OyBjb3BpbG90VG9rZW5JbmZvOiBJQ29waWxvdFRva2VuSW5mbyB9IHwgdW5kZWZpbmVkOyBmZXRjaGVkQXQ6IG51bWJlciB9PiB7XG5cdFx0aWYgKCFvcHRpb25zPy5mb3JjZVJlZnJlc2ggJiYgYWNjb3VudFBvbGljeURhdGE/LnRva2VuRW50aXRsZW1lbnRzRmV0Y2hlZEF0ICYmICF0aGlzLmlzRGF0YVN0YWxlKGFjY291bnRQb2xpY3lEYXRhLnRva2VuRW50aXRsZW1lbnRzRmV0Y2hlZEF0KSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIFVzaW5nIGxhc3QgZmV0Y2hlZCB0b2tlbiBlbnRpdGxlbWVudHMgZGF0YScpO1xuXHRcdFx0cmV0dXJuIHsgZGF0YTogeyBwb2xpY3lEYXRhOiBhY2NvdW50UG9saWN5RGF0YS5wb2xpY3lEYXRhLCBjb3BpbG90VG9rZW5JbmZvOiB0aGlzLl9jb3BpbG90VG9rZW5JbmZvID8/IHt9IH0sIGZldGNoZWRBdDogYWNjb3VudFBvbGljeURhdGEudG9rZW5FbnRpdGxlbWVudHNGZXRjaGVkQXQgfTtcblx0XHR9XG5cdFx0Y29uc3QgZGF0YSA9IGF3YWl0IHRoaXMucmVxdWVzdFRva2VuRW50aXRsZW1lbnRzKHNlc3Npb25zKTtcblx0XHRyZXR1cm4geyBkYXRhLCBmZXRjaGVkQXQ6IERhdGUubm93KCkgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVxdWVzdFRva2VuRW50aXRsZW1lbnRzKHNlc3Npb25zOiBBdXRoZW50aWNhdGlvblNlc3Npb25bXSk6IFByb21pc2U8eyBwb2xpY3lEYXRhOiBQYXJ0aWFsPElQb2xpY3lEYXRhPjsgY29waWxvdFRva2VuSW5mbzogSUNvcGlsb3RUb2tlbkluZm8gfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRva2VuRW50aXRsZW1lbnRzVXJsID0gdGhpcy5nZXRUb2tlbkVudGl0bGVtZW50VXJsKCk7XG5cdFx0aWYgKCF0b2tlbkVudGl0bGVtZW50c1VybCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIE5vIHRva2VuIGVudGl0bGVtZW50cyBVUkwgZm91bmQnKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIEZldGNoaW5nIHRva2VuIGVudGl0bGVtZW50cyBmcm9tOicsIHRva2VuRW50aXRsZW1lbnRzVXJsKTtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdCh0b2tlbkVudGl0bGVtZW50c1VybCwgJ0dFVCcsIHVuZGVmaW5lZCwgc2Vzc2lvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsICdkZWZhdWx0QWNjb3VudC50b2tlbkVudGl0bGVtZW50cycpO1xuXHRcdGlmICghcmVzcG9uc2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHJlc3BvbnNlLnJlcy5zdGF0dXNDb2RlICYmIHJlc3BvbnNlLnJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0RlZmF1bHRBY2NvdW50XSB1bmV4cGVjdGVkIHN0YXR1cyBjb2RlICR7cmVzcG9uc2UucmVzLnN0YXR1c0NvZGV9IHdoaWxlIGZldGNoaW5nIHRva2VuIGVudGl0bGVtZW50c2ApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY2hhdERhdGEgPSBhd2FpdCBhc0pzb248SVRva2VuRW50aXRsZW1lbnRzUmVzcG9uc2U+KHJlc3BvbnNlKTtcblx0XHRcdGlmIChjaGF0RGF0YSkge1xuXHRcdFx0XHRjb25zdCB0b2tlbk1hcCA9IHRoaXMuZXh0cmFjdEZyb21Ub2tlbihjaGF0RGF0YS50b2tlbik7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cG9saWN5RGF0YToge1xuXHRcdFx0XHRcdFx0Ly8gRWRpdG9yIHByZXZpZXcgZmVhdHVyZXMgYXJlIGRpc2FibGVkIGlmIHRoZSBmbGFnIGlzIHByZXNlbnQgYW5kIHNldCB0byAwXG5cdFx0XHRcdFx0XHRjaGF0X3ByZXZpZXdfZmVhdHVyZXNfZW5hYmxlZDogdG9rZW5NYXAuZ2V0KCdlZGl0b3JfcHJldmlld19mZWF0dXJlcycpICE9PSAnMCcsXG5cdFx0XHRcdFx0XHRjaGF0X2FnZW50X2VuYWJsZWQ6IHRva2VuTWFwLmdldCgnYWdlbnRfbW9kZScpICE9PSAnMCcsXG5cdFx0XHRcdFx0XHQvLyBNQ1AgaXMgb25seSBlbmFibGVkIGlmIHRoZSBmbGFnIGlzIGV4cGxpY2l0bHkgcHJlc2VudCBhbmQgc2V0IHRvIDFcblx0XHRcdFx0XHRcdG1jcDogdG9rZW5NYXAuZ2V0KCdtY3AnKSA9PT0gJzEnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y29waWxvdFRva2VuSW5mbzoge1xuXHRcdFx0XHRcdFx0c246IHRva2VuTWFwLmdldCgnc24nKSxcblx0XHRcdFx0XHRcdGZjdjE6IHRva2VuTWFwLmdldCgnZmN2MScpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBmZXRjaCB0b2tlbiBlbnRpdGxlbWVudHMnLCAnTm8gZGF0YSByZXR1cm5lZCcpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBmZXRjaCB0b2tlbiBlbnRpdGxlbWVudHMnLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRFbnRpdGxlbWVudHMoc2Vzc2lvbnM6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdLCBhY2NvdW50UG9saWN5RGF0YTogSUFjY291bnRQb2xpY3lEYXRhIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogeyBmb3JjZVJlZnJlc2g/OiBib29sZWFuIH0pOiBQcm9taXNlPHsgZGF0YTogSUVudGl0bGVtZW50c0RhdGEgfCB1bmRlZmluZWQgfCBudWxsOyBmZXRjaGVkQXQ6IG51bWJlciB8IHVuZGVmaW5lZCB9PiB7XG5cdFx0Y29uc3QgYWNjb3VudElkID0gc2Vzc2lvbnNbMF0uYWNjb3VudC5pZDtcblx0XHRjb25zdCBleGlzdGluZ0RhdGEgPSB0aGlzLl9kZWZhdWx0QWNjb3VudD8uYWNjb3VudElkID09PSBhY2NvdW50SWQgPyB0aGlzLl9kZWZhdWx0QWNjb3VudD8uZGVmYXVsdEFjY291bnQuZW50aXRsZW1lbnRzRGF0YSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIW9wdGlvbnM/LmZvcmNlUmVmcmVzaCAmJiBleGlzdGluZ0RhdGEgJiYgYWNjb3VudFBvbGljeURhdGE/LmVudGl0bGVtZW50c0ZldGNoZWRBdCAmJiAhdGhpcy5pc0RhdGFTdGFsZShhY2NvdW50UG9saWN5RGF0YS5lbnRpdGxlbWVudHNGZXRjaGVkQXQpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gVXNpbmcgbGFzdCBmZXRjaGVkIGVudGl0bGVtZW50cyBkYXRhJyk7XG5cdFx0XHRyZXR1cm4geyBkYXRhOiBleGlzdGluZ0RhdGEsIGZldGNoZWRBdDogYWNjb3VudFBvbGljeURhdGEuZW50aXRsZW1lbnRzRmV0Y2hlZEF0IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50aXRsZW1lbnRVcmwgPSB0aGlzLmdldEVudGl0bGVtZW50VXJsKCk7XG5cdFx0aWYgKCFlbnRpdGxlbWVudFVybCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIE5vIGNoYXQgZW50aXRsZW1lbnRzIFVSTCBmb3VuZCcpO1xuXHRcdFx0cmV0dXJuIHsgZGF0YTogdW5kZWZpbmVkLCBmZXRjaGVkQXQ6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBGZXRjaGluZyBlbnRpdGxlbWVudHMgZnJvbTonLCBlbnRpdGxlbWVudFVybCk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3QoZW50aXRsZW1lbnRVcmwsICdHRVQnLCB1bmRlZmluZWQsIHNlc3Npb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCAnZGVmYXVsdEFjY291bnQuZW50aXRsZW1lbnRzJyk7XG5cdFx0aWYgKCFyZXNwb25zZSkge1xuXHRcdFx0cmV0dXJuIHsgZGF0YTogdW5kZWZpbmVkLCBmZXRjaGVkQXQ6IERhdGUubm93KCkgfTtcblx0XHR9XG5cblx0XHRpZiAocmVzcG9uc2UucmVzLnN0YXR1c0NvZGUgJiYgcmVzcG9uc2UucmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbRGVmYXVsdEFjY291bnRdIHVuZXhwZWN0ZWQgc3RhdHVzIGNvZGUgJHtyZXNwb25zZS5yZXMuc3RhdHVzQ29kZX0gd2hpbGUgZmV0Y2hpbmcgZW50aXRsZW1lbnRzYCk7XG5cdFx0XHRjb25zdCBkYXRhID0gKFxuXHRcdFx0XHRyZXNwb25zZS5yZXMuc3RhdHVzQ29kZSA9PT0gNDAxIHx8IFx0Ly8gb2F1dGggdG9rZW4gYmVpbmcgdW5hdmFpbGFibGUgKGV4cGlyZWQvcmV2b2tlZClcblx0XHRcdFx0cmVzcG9uc2UucmVzLnN0YXR1c0NvZGUgPT09IDQwNFx0XHQvLyBtaXNzaW5nIHNjb3Blcy9wZXJtaXNzaW9ucywgc2VydmljZSBwcmV0ZW5kcyB0aGUgZW5kcG9pbnQgZG9lc24ndCBleGlzdFxuXHRcdFx0KSA/IG51bGwgOiB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4geyBkYXRhLCBmZXRjaGVkQXQ6IERhdGUubm93KCkgfTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IGF3YWl0IGFzSnNvbjxJRW50aXRsZW1lbnRzRGF0YT4ocmVzcG9uc2UpO1xuXHRcdFx0aWYgKGRhdGEpIHtcblx0XHRcdFx0cmV0dXJuIHsgZGF0YSwgZmV0Y2hlZEF0OiBEYXRlLm5vdygpIH07XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tEZWZhdWx0QWNjb3VudF0gRmFpbGVkIHRvIGZldGNoIGVudGl0bGVtZW50cycsICdObyBkYXRhIHJldHVybmVkJyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0RlZmF1bHRBY2NvdW50XSBGYWlsZWQgdG8gZmV0Y2ggZW50aXRsZW1lbnRzJywgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0fVxuXHRcdHJldHVybiB7IGRhdGE6IHVuZGVmaW5lZCwgZmV0Y2hlZEF0OiBEYXRlLm5vdygpIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldE1jcFJlZ2lzdHJ5UHJvdmlkZXIoc2Vzc2lvbnM6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdLCBhY2NvdW50UG9saWN5RGF0YTogSUFjY291bnRQb2xpY3lEYXRhIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogeyBmb3JjZVJlZnJlc2g/OiBib29sZWFuIH0pOiBQcm9taXNlPHsgZGF0YTogSU1jcFJlZ2lzdHJ5UHJvdmlkZXIgfCBudWxsOyBmZXRjaGVkQXQ6IG51bWJlciB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFvcHRpb25zPy5mb3JjZVJlZnJlc2ggJiYgYWNjb3VudFBvbGljeURhdGE/Lm1jcFJlZ2lzdHJ5RGF0YUZldGNoZWRBdCAmJiAhdGhpcy5pc0RhdGFTdGFsZShhY2NvdW50UG9saWN5RGF0YS5tY3BSZWdpc3RyeURhdGFGZXRjaGVkQXQpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gVXNpbmcgbGFzdCBmZXRjaGVkIE1DUCByZWdpc3RyeSBkYXRhJyk7XG5cdFx0XHRjb25zdCBkYXRhID0gYWNjb3VudFBvbGljeURhdGEucG9saWN5RGF0YS5tY3BSZWdpc3RyeVVybCAmJiBhY2NvdW50UG9saWN5RGF0YS5wb2xpY3lEYXRhLm1jcEFjY2VzcyA/IHsgdXJsOiBhY2NvdW50UG9saWN5RGF0YS5wb2xpY3lEYXRhLm1jcFJlZ2lzdHJ5VXJsLCByZWdpc3RyeV9hY2Nlc3M6IGFjY291bnRQb2xpY3lEYXRhLnBvbGljeURhdGEubWNwQWNjZXNzIH0gOiBudWxsO1xuXHRcdFx0cmV0dXJuIHsgZGF0YSwgZmV0Y2hlZEF0OiBhY2NvdW50UG9saWN5RGF0YS5tY3BSZWdpc3RyeURhdGFGZXRjaGVkQXQgfTtcblx0XHR9XG5cdFx0Y29uc3QgZGF0YSA9IGF3YWl0IHRoaXMucmVxdWVzdE1jcFJlZ2lzdHJ5UHJvdmlkZXIoc2Vzc2lvbnMpO1xuXHRcdHJldHVybiAhaXNVbmRlZmluZWQoZGF0YSkgPyB7IGRhdGEsIGZldGNoZWRBdDogRGF0ZS5ub3coKSB9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXF1ZXN0TWNwUmVnaXN0cnlQcm92aWRlcihzZXNzaW9uczogQXV0aGVudGljYXRpb25TZXNzaW9uW10pOiBQcm9taXNlPElNY3BSZWdpc3RyeVByb3ZpZGVyIHwgbnVsbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IG1jcFJlZ2lzdHJ5RGF0YVVybCA9IHRoaXMuZ2V0TWNwUmVnaXN0cnlEYXRhVXJsKCk7XG5cdFx0aWYgKCFtY3BSZWdpc3RyeURhdGFVcmwpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBObyBNQ1AgcmVnaXN0cnkgZGF0YSBVUkwgZm91bmQnKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBGZXRjaGluZyBNQ1AgcmVnaXN0cnkgZGF0YSBmcm9tOicsIG1jcFJlZ2lzdHJ5RGF0YVVybCk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJlcXVlc3QobWNwUmVnaXN0cnlEYXRhVXJsLCAnR0VUJywgdW5kZWZpbmVkLCBzZXNzaW9ucywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgJ2RlZmF1bHRBY2NvdW50Lm1jcFJlZ2lzdHJ5UHJvdmlkZXInKTtcblx0XHRpZiAoIXJlc3BvbnNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghaXNTdWNjZXNzKHJlc3BvbnNlKSkge1xuXHRcdFx0aWYgKGlzQ2xpZW50RXJyb3IocmVzcG9uc2UpKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW0RlZmF1bHRBY2NvdW50XSBSZWNlaXZlZCAke3Jlc3BvbnNlLnJlcy5zdGF0dXNDb2RlfSBmb3IgTUNQIHJlZ2lzdHJ5IGRhdGEsIHRyZWF0aW5nIGFzIG5vIHJlZ2lzdHJ5IGF2YWlsYWJsZS5gKTtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtEZWZhdWx0QWNjb3VudF0gdW5leHBlY3RlZCBzdGF0dXMgY29kZSAke3Jlc3BvbnNlLnJlcy5zdGF0dXNDb2RlfSB3aGlsZSBmZXRjaGluZyBNQ1AgcmVnaXN0cnkgZGF0YWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IGF3YWl0IGFzSnNvbjxJTWNwUmVnaXN0cnlSZXNwb25zZT4ocmVzcG9uc2UpO1xuXHRcdFx0aWYgKGRhdGEpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdGZXRjaGVkIE1DUCByZWdpc3RyeSBwcm92aWRlcnMnLCBkYXRhLm1jcF9yZWdpc3RyaWVzKTtcblx0XHRcdFx0cmV0dXJuIGRhdGEubWNwX3JlZ2lzdHJpZXNbMF0gPz8gbnVsbDtcblx0XHRcdH1cblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnTm8gTUNQIHJlZ2lzdHJ5IHByb3ZpZGVycyBjb250ZW50IGZvdW5kIGluIHJlc3BvbnNlJyk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gZmV0Y2ggTUNQIHJlZ2lzdHJ5IHByb3ZpZGVycycsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldE1hbmFnZWRTZXR0aW5ncyhzZXNzaW9uczogQXV0aGVudGljYXRpb25TZXNzaW9uW10sIGFjY291bnRQb2xpY3lEYXRhOiBJQWNjb3VudFBvbGljeURhdGEgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiB7IGZvcmNlUmVmcmVzaD86IGJvb2xlYW4gfSk6IFByb21pc2U8eyBkYXRhOiBQYXJ0aWFsPElQb2xpY3lEYXRhPiB8IHVuZGVmaW5lZDsgZmV0Y2hlZEF0OiBudW1iZXI7IGNvbXBhdGliaWxpdHlFcnJvcjogSU1hbmFnZWRTZXR0aW5nc0NvbXBhdGliaWxpdHlFcnJvciB8IG51bGwgfT4ge1xuXHRcdGNvbnN0IGFjY291bnRJZCA9IHNlc3Npb25zWzBdLmFjY291bnQuaWQ7XG5cdFx0Y29uc3QgY2FjaGVkTWFuYWdlZFNldHRpbmdzID0gYWNjb3VudFBvbGljeURhdGE/Lm1hbmFnZWRTZXR0aW5nc0ZldGNoZWRBdCAhPT0gdW5kZWZpbmVkICYmICF0aGlzLmlzRGF0YVN0YWxlKGFjY291bnRQb2xpY3lEYXRhLm1hbmFnZWRTZXR0aW5nc0ZldGNoZWRBdClcblx0XHRcdD8ge1xuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiBhY2NvdW50UG9saWN5RGF0YS5wb2xpY3lEYXRhLm1hbmFnZWRTZXR0aW5ncyxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZmV0Y2hlZEF0OiBhY2NvdW50UG9saWN5RGF0YS5tYW5hZ2VkU2V0dGluZ3NGZXRjaGVkQXQsXG5cdFx0XHR9XG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBoYXNGZXRjaGVkVGhpc1Byb2Nlc3MgPSB0aGlzLm1hbmFnZWRTZXR0aW5nc0ZldGNoQXR0ZW1wdGVkQWNjb3VudHMuaGFzKGFjY291bnRJZCk7XG5cdFx0aWYgKCFvcHRpb25zPy5mb3JjZVJlZnJlc2ggJiYgY2FjaGVkTWFuYWdlZFNldHRpbmdzICYmIGhhc0ZldGNoZWRUaGlzUHJvY2Vzcykge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVmYXVsdEFjY291bnRdIFVzaW5nIGxhc3QgZmV0Y2hlZCBtYW5hZ2VkIHNldHRpbmdzIGRhdGEnKTtcblx0XHRcdHJldHVybiB7IC4uLmNhY2hlZE1hbmFnZWRTZXR0aW5ncywgY29tcGF0aWJpbGl0eUVycm9yOiB0aGlzLl9tYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3IgfTtcblx0XHR9XG5cblx0XHR0aGlzLm1hbmFnZWRTZXR0aW5nc0ZldGNoQXR0ZW1wdGVkQWNjb3VudHMuYWRkKGFjY291bnRJZCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZXF1ZXN0TWFuYWdlZFNldHRpbmdzKHNlc3Npb25zKTtcblx0XHRjb25zdCBmZXRjaGVkQXQgPSBEYXRlLm5vdygpO1xuXHRcdHN3aXRjaCAocmVzdWx0LmtpbmQpIHtcblx0XHRcdGNhc2UgJ3N1Y2Nlc3MnOlxuXHRcdFx0XHRyZXR1cm4geyBkYXRhOiByZXN1bHQuZGF0YSwgZmV0Y2hlZEF0LCBjb21wYXRpYmlsaXR5RXJyb3I6IG51bGwgfTtcblx0XHRcdGNhc2UgJ25vU2V0dGluZ3MnOlxuXHRcdFx0XHRyZXR1cm4geyBkYXRhOiB7IG1hbmFnZWRTZXR0aW5nczogdW5kZWZpbmVkIH0sIGZldGNoZWRBdCwgY29tcGF0aWJpbGl0eUVycm9yOiBudWxsIH07XG5cdFx0XHRjYXNlICd1cGRhdGVSZXF1aXJlZCc6XG5cdFx0XHRcdHJldHVybiB7IGRhdGE6IHsgbWFuYWdlZFNldHRpbmdzOiB1bmRlZmluZWQgfSwgZmV0Y2hlZEF0LCBjb21wYXRpYmlsaXR5RXJyb3I6IHJlc3VsdC5lcnJvciB9O1xuXHRcdFx0Y2FzZSAndW5hdmFpbGFibGUnOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGRhdGE6IHRoaXMuX21hbmFnZWRTZXR0aW5nc0NvbXBhdGliaWxpdHlFcnJvciA/IHsgbWFuYWdlZFNldHRpbmdzOiB1bmRlZmluZWQgfSA6IGNhY2hlZE1hbmFnZWRTZXR0aW5ncz8uZGF0YSxcblx0XHRcdFx0XHRmZXRjaGVkQXQsXG5cdFx0XHRcdFx0Y29tcGF0aWJpbGl0eUVycm9yOiB0aGlzLl9tYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3IsXG5cdFx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXF1ZXN0TWFuYWdlZFNldHRpbmdzKHNlc3Npb25zOiBBdXRoZW50aWNhdGlvblNlc3Npb25bXSk6IFByb21pc2U8TWFuYWdlZFNldHRpbmdzUmVxdWVzdFJlc3VsdD4ge1xuXHRcdGNvbnN0IG1hbmFnZWRTZXR0aW5nc1VybCA9IHRoaXMuZ2V0TWFuYWdlZFNldHRpbmdzVXJsKCk7XG5cdFx0aWYgKCFtYW5hZ2VkU2V0dGluZ3NVcmwpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBObyBtYW5hZ2VkIHNldHRpbmdzIFVSTCBjb25maWd1cmVkOyBza2lwcGluZyBlbnRlcnByaXNlIHBvbGljeSBmZXRjaCcpO1xuXHRcdFx0dGhpcy5fbWFuYWdlZFNldHRpbmdzRmV0Y2hTdGF0dXMgPSAnbm8tdXJsJztcblx0XHRcdHJldHVybiB7IGtpbmQ6ICd1bmF2YWlsYWJsZScgfTtcblx0XHR9XG5cblx0XHRjb25zdCByZXF1ZXN0VXJsID0gYXBwZW5kTWFuYWdlZFNldHRpbmdzQ2xpZW50SWRlbnRpdHkobWFuYWdlZFNldHRpbmdzVXJsLCB0aGlzLnByb2R1Y3RTZXJ2aWNlKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gRmV0Y2hpbmcgbWFuYWdlZCBzZXR0aW5ncyBmcm9tOicsIHJlcXVlc3RVcmwpO1xuXHRcdGNvbnN0IHJhdGVMaW1pdEJhY2tvZmZBY3RpdmUgPSBEYXRlLm5vdygpIDwgdGhpcy5fcmF0ZUxpbWl0QmFja29mZlVudGlsO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZXF1ZXN0KHJlcXVlc3RVcmwsICdHRVQnLCB1bmRlZmluZWQsIHNlc3Npb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCAnZGVmYXVsdEFjY291bnQubWFuYWdlZFNldHRpbmdzJywgTUFOQUdFRF9TRVRUSU5HU19SRVFVRVNUX1RJTUVPVVRfTVMpO1xuXHRcdGlmICghcmVzcG9uc2UpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlZmF1bHRBY2NvdW50XSBNYW5hZ2VkIHNldHRpbmdzIGZldGNoIHJldHVybmVkIG5vIHJlc3BvbnNlIChuZXR3b3JrIGVycm9yLCBhbGwgc2Vzc2lvbnMgcmVqZWN0ZWQsIG9yIGFjdGl2ZSByYXRlLWxpbWl0IGJhY2tvZmYpOyBmYWxsaW5nIGJhY2sgdG8gbG9jYWwtb25seSBwb2xpY3knKTtcblx0XHRcdHRoaXMucmVwb3J0TWFuYWdlZFNldHRpbmdzT3V0Y29tZSgnbm8tcmVzcG9uc2UnLCByYXRlTGltaXRCYWNrb2ZmQWN0aXZlKTtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICd1bmF2YWlsYWJsZScgfTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0dXMgPSByZXNwb25zZS5yZXMuc3RhdHVzQ29kZSA/PyAwO1xuXHRcdGlmIChzdGF0dXMgPT09IDQwNCkge1xuXHRcdFx0dGhpcy5yZXBvcnRNYW5hZ2VkU2V0dGluZ3NPdXRjb21lKHN0YXR1cywgcmF0ZUxpbWl0QmFja29mZkFjdGl2ZSk7XG5cdFx0XHRyZXR1cm4geyBraW5kOiAnbm9TZXR0aW5ncycgfTtcblx0XHR9XG5cdFx0aWYgKHN0YXR1cyA9PT0gNDY2KSB7XG5cdFx0XHRjb25zdCBlcnJvciA9IGF3YWl0IHRoaXMucmVhZE1hbmFnZWRTZXR0aW5nc0NvbXBhdGliaWxpdHlFcnJvcihyZXNwb25zZSk7XG5cdFx0XHR0aGlzLnNldE1hbmFnZWRTZXR0aW5nc0NvbXBhdGliaWxpdHlFcnJvcihlcnJvcik7XG5cdFx0XHR0aGlzLnJlcG9ydE1hbmFnZWRTZXR0aW5nc091dGNvbWUoc3RhdHVzLCByYXRlTGltaXRCYWNrb2ZmQWN0aXZlKTtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICd1cGRhdGVSZXF1aXJlZCcsIGVycm9yIH07XG5cdFx0fVxuXG5cdFx0aWYgKCFpc1N1Y2Nlc3MocmVzcG9uc2UpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0RlZmF1bHRBY2NvdW50XSBNYW5hZ2VkIHNldHRpbmdzIGZldGNoIHJldHVybmVkIG5vbi1zdWNjZXNzIHN0YXR1cyAke3N0YXR1c307IGZhbGxpbmcgYmFjayB0byBsb2NhbC1vbmx5IHBvbGljeWApO1xuXHRcdFx0dGhpcy5yZXBvcnRNYW5hZ2VkU2V0dGluZ3NPdXRjb21lKHN0YXR1cywgcmF0ZUxpbWl0QmFja29mZkFjdGl2ZSk7XG5cdFx0XHRyZXR1cm4geyBraW5kOiAndW5hdmFpbGFibGUnIH07XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRhdGEgPSBhd2FpdCBhc0pzb248SU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlPihyZXNwb25zZSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tEZWZhdWx0QWNjb3VudF0gTWFuYWdlZCBzZXR0aW5ncyByYXcgcmVzcG9uc2U6JywgSlNPTi5zdHJpbmdpZnkoZGF0YSA/PyBudWxsKSk7XG5cdFx0XHR0aGlzLl9tYW5hZ2VkU2V0dGluZ3NSYXdSZXNwb25zZSA9IGRhdGEgPz8gbnVsbDtcblx0XHRcdGNvbnN0IGFkYXB0ZWQgPSBhZGFwdE1hbmFnZWRTZXR0aW5ncyhkYXRhID8/IHt9LCBtc2cgPT4gdGhpcy5sb2dTZXJ2aWNlLndhcm4obXNnKSk7XG5cdFx0XHQvLyBBbiBlbXB0eSByZXNwb25zZSAoYHt9YCkgaXMgYSBzdWNjZXNzZnVsIFwibm8gcG9saWN5IGZpbGUgcHJlc2VudFwiIHNpZ25hbC5cblx0XHRcdGNvbnN0IG1hbmFnZWRTZXR0aW5nc0NvdW50ID0gYWRhcHRlZC5tYW5hZ2VkU2V0dGluZ3MgPyBPYmplY3Qua2V5cyhhZGFwdGVkLm1hbmFnZWRTZXR0aW5ncykubGVuZ3RoIDogMDtcblx0XHRcdGlmIChtYW5hZ2VkU2V0dGluZ3NDb3VudCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWZhdWx0QWNjb3VudF0gTWFuYWdlZCBzZXR0aW5ncyBmZXRjaGVkIChlbXB0eSByZXNwb25zZSBcdTIwMTQgbm8gZW50ZXJwcmlzZSBwb2xpY3kgZmlsZSBwcmVzZW50KScpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tEZWZhdWx0QWNjb3VudF0gTWFuYWdlZCBzZXR0aW5ncyBhcHBsaWVkJyk7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0RlZmF1bHRBY2NvdW50XSBNYW5hZ2VkIHNldHRpbmdzIHBheWxvYWQ6JywgSlNPTi5zdHJpbmdpZnkoYWRhcHRlZCkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5yZXBvcnRNYW5hZ2VkU2V0dGluZ3NPdXRjb21lKCdvaycsIHJhdGVMaW1pdEJhY2tvZmZBY3RpdmUpO1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ3N1Y2Nlc3MnLCBkYXRhOiBhZGFwdGVkIH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0RlZmF1bHRBY2NvdW50XSBGYWlsZWQgdG8gcGFyc2UgbWFuYWdlZCBzZXR0aW5ncyByZXNwb25zZScsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0dGhpcy5yZXBvcnRNYW5hZ2VkU2V0dGluZ3NPdXRjb21lKCdwYXJzZS1lcnJvcicsIHJhdGVMaW1pdEJhY2tvZmZBY3RpdmUpO1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ3VuYXZhaWxhYmxlJyB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVhZE1hbmFnZWRTZXR0aW5nc0NvbXBhdGliaWxpdHlFcnJvcihyZXNwb25zZTogSVJlcXVlc3RDb250ZXh0KTogUHJvbWlzZTxJTWFuYWdlZFNldHRpbmdzQ29tcGF0aWJpbGl0eUVycm9yPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRleHQgPSBhd2FpdCBhc1RleHQocmVzcG9uc2UpO1xuXHRcdFx0Y29uc3QgYm9keTogdW5rbm93biA9IHRleHQgPyBKU09OLnBhcnNlKHRleHQpIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VNYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3IoYm9keSk7XG5cdFx0XHRpZiAocGFyc2VkKSB7XG5cdFx0XHRcdHJldHVybiBwYXJzZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tEZWZhdWx0QWNjb3VudF0gTWFuYWdlZCBzZXR0aW5ncyBjb21wYXRpYmlsaXR5IHJlc3BvbnNlIGRpZCBub3QgY29udGFpbiB0aGUgZXhwZWN0ZWQgZXJyb3IgY29kZScpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tEZWZhdWx0QWNjb3VudF0gRmFpbGVkIHRvIHBhcnNlIG1hbmFnZWQgc2V0dGluZ3MgY29tcGF0aWJpbGl0eSByZXNwb25zZScsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdH1cblx0XHRyZXR1cm4geyBlcnJvckNvZGU6IE1BTkFHRURfU0VUVElOR1NfVVBEQVRFX1JFUVVJUkVEX0VSUk9SX0NPREUgfTtcblx0fVxuXG5cdHByaXZhdGUgcmVwb3J0TWFuYWdlZFNldHRpbmdzT3V0Y29tZShzdGF0dXM6IEV4Y2x1ZGU8TWFuYWdlZFNldHRpbmdzRmV0Y2hTdGF0dXMsIG51bGwgfCAnbm8tdXJsJz4sIHJhdGVMaW1pdEJhY2tvZmZBY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9tYW5hZ2VkU2V0dGluZ3NGZXRjaFN0YXR1cyA9IHN0YXR1cztcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxNYW5hZ2VkU2V0dGluZ3NGZXRjaFRlbGVtZXRyeSwgTWFuYWdlZFNldHRpbmdzRmV0Y2hUZWxlbWV0cnlDbGFzc2lmaWNhdGlvbj4oJ2RlZmF1bHRhY2NvdW50Om1hbmFnZWRTZXR0aW5nczpmZXRjaCcsIHtcblx0XHRcdG91dGNvbWU6IHR5cGVvZiBzdGF0dXMgPT09ICdudW1iZXInID8gYHN0YXR1czoke3N0YXR1c31gIDogc3RhdHVzLFxuXHRcdFx0cmF0ZUxpbWl0QmFja29mZkFjdGl2ZSxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEZXRlY3RzIGEgcmF0ZS1saW1pdGVkIEdpdEh1YiByZXNwb25zZS4gTWlycm9ycyB0aGUgcHVibGljLUFQSSBjaGVjayBpblxuXHQgKiBgZ2l0aHViUmVwb0ZldGNoZXIudHNgOlxuXHQgKiAtIENhbm9uaWNhbCBgNDI5IFRvbyBNYW55IFJlcXVlc3RzYC5cblx0ICogLSBQcmltYXJ5IHF1b3RhIGV4aGF1c3Rpb246IGA0MDNgIHdpdGggYFgtUmF0ZUxpbWl0LVJlbWFpbmluZzogMGAuXG5cdCAqIC0gU2Vjb25kYXJ5IHRocm90dGxpbmc6IEdpdEh1YiBvbWl0cyBgWC1SYXRlTGltaXQtUmVtYWluaW5nYCBidXQgc2V0c1xuXHQgKiAgIGBSZXRyeS1BZnRlcmAgKG9uIGEgbm9uLTJ4eCByZXNwb25zZSkuIFdlIHRyZWF0IGFueSBub24tc3VjY2VzcyBzdGF0dXNcblx0ICogICB0aGF0IGNhcnJpZXMgYFJldHJ5LUFmdGVyYCBhcyBhIGJhY2stb2ZmIHNpZ25hbC5cblx0ICovXG5cdHByaXZhdGUgaXNSYXRlTGltaXRlZChyZXNwb25zZTogSVJlcXVlc3RDb250ZXh0KTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc3RhdHVzID0gcmVzcG9uc2UucmVzLnN0YXR1c0NvZGU7XG5cdFx0aWYgKHN0YXR1cyA9PT0gNDI5KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHN0YXR1cyA9PT0gNDAzICYmIHJlYWRIZWFkZXIocmVzcG9uc2UucmVzLmhlYWRlcnMsICd4LXJhdGVsaW1pdC1yZW1haW5pbmcnKSA9PT0gJzAnKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Ly8gU2Vjb25kYXJ5IHJhdGUgbGltaXQ6IHRoZSBzZXJ2ZXIgZXhwbGljaXRseSBhc2tzIHRoZSBjbGllbnQgdG8gd2FpdCxcblx0XHQvLyByZWdhcmRsZXNzIG9mIHdoaWNoIG5vbi0yeHggY29kZSBpdCByZXR1cm5lZCB3aXRoLlxuXHRcdGlmICghaXNTdWNjZXNzKHJlc3BvbnNlKSAmJiByZWFkSGVhZGVyKHJlc3BvbnNlLnJlcy5oZWFkZXJzLCAncmV0cnktYWZ0ZXInKSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmF0ZUxpbWl0QmFja29mZlVudGlsID0gMDtcblxuXHRwcml2YXRlIGFzeW5jIHJlcXVlc3QodXJsOiBzdHJpbmcsIHR5cGU6ICdHRVQnLCBib2R5OiB1bmRlZmluZWQsIHNlc3Npb25zOiBBdXRoZW50aWNhdGlvblNlc3Npb25bXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBjYWxsU2l0ZTogc3RyaW5nLCByZXF1ZXN0VGltZW91dE1zPzogbnVtYmVyKTogUHJvbWlzZTxJUmVxdWVzdENvbnRleHQgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIGFzeW5jIHJlcXVlc3QodXJsOiBzdHJpbmcsIHR5cGU6ICdQT1NUJywgYm9keTogb2JqZWN0LCBzZXNzaW9uczogQXV0aGVudGljYXRpb25TZXNzaW9uW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgY2FsbFNpdGU6IHN0cmluZywgcmVxdWVzdFRpbWVvdXRNcz86IG51bWJlcik6IFByb21pc2U8SVJlcXVlc3RDb250ZXh0IHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSBhc3luYyByZXF1ZXN0KHVybDogc3RyaW5nLCB0eXBlOiAnR0VUJyB8ICdQT1NUJywgYm9keTogb2JqZWN0IHwgdW5kZWZpbmVkLCBzZXNzaW9uczogQXV0aGVudGljYXRpb25TZXNzaW9uW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgY2FsbFNpdGU6IHN0cmluZywgcmVxdWVzdFRpbWVvdXRNcz86IG51bWJlcik6IFByb21pc2U8SVJlcXVlc3RDb250ZXh0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gUmF0ZS1saW1pdCBiYWNrb2ZmOiB3aGVuIGFueSBwcmlvciBgL2NvcGlsb3RfaW50ZXJuYWwvKmAgcmVxdWVzdCB3YXNcblx0XHQvLyB0aHJvdHRsZWQgKDQyOSBvciA0MDMgKyBgWC1SYXRlTGltaXQtUmVtYWluaW5nOiAwYCksIGV2ZXJ5IHN1YnNlcXVlbnRcblx0XHQvLyByZXF1ZXN0IGlzIHNob3J0LWNpcmN1aXRlZCB1bnRpbCB0aGUgcGFyc2VkIGBSZXRyeS1BZnRlcmAgZWxhcHNlcy5cblx0XHQvLyBBbGwgZW5kcG9pbnRzIGNhbGxlZCBmcm9tIGhlcmUgc2hhcmUgdGhlIHNhbWUgaG9zdCBhbmQgYmVhcmVyIHRva2VuLFxuXHRcdC8vIHNvIGJhY2tpbmcgb2ZmIHRoZSBidWNrZXQgYXMgYSB3aG9sZSBhdm9pZHMgcGlsaW5nIG9uIGEgc2VydmVyIHRoYXRcblx0XHQvLyBoYXMgYWxyZWFkeSBhc2tlZCB1cyB0byBzbG93IGRvd24uIFNlZSBgZ2l0aHViUmVwb0ZldGNoZXIudHNgIGZvciB0aGVcblx0XHQvLyBwdWJsaWMtQVBJIGFuYWxvZ3VlLlxuXHRcdGlmIChEYXRlLm5vdygpIDwgdGhpcy5fcmF0ZUxpbWl0QmFja29mZlVudGlsKSB7XG5cdFx0XHRjb25zdCByZW1haW5pbmdTZWMgPSBNYXRoLmNlaWwoKHRoaXMuX3JhdGVMaW1pdEJhY2tvZmZVbnRpbCAtIERhdGUubm93KCkpIC8gMTAwMCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtEZWZhdWx0QWNjb3VudF0gU2tpcHBpbmcgcmVxdWVzdCB0byAke3VybH0gXHUyMDE0IHJhdGUtbGltaXQgYmFja29mZiBhY3RpdmUgZm9yICR7cmVtYWluaW5nU2VjfXMgbW9yZWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgbGFzdFJlc3BvbnNlOiBJUmVxdWVzdENvbnRleHQgfCB1bmRlZmluZWQ7XG5cblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gbGFzdFJlc3BvbnNlO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmVxdWVzdFNlcnZpY2UucmVxdWVzdCh7XG5cdFx0XHRcdFx0dHlwZSxcblx0XHRcdFx0XHR1cmwsXG5cdFx0XHRcdFx0ZGF0YTogdHlwZSA9PT0gJ1BPU1QnID8gSlNPTi5zdHJpbmdpZnkoYm9keSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZGlzYWJsZUNhY2hlOiB0cnVlLFxuXHRcdFx0XHRcdHRpbWVvdXQ6IHJlcXVlc3RUaW1lb3V0TXMsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7c2Vzc2lvbi5hY2Nlc3NUb2tlbn1gXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRjYWxsU2l0ZVxuXHRcdFx0XHR9LCB0b2tlbik7XG5cblx0XHRcdFx0Y29uc3Qgc3RhdHVzID0gcmVzcG9uc2UucmVzLnN0YXR1c0NvZGU7XG5cdFx0XHRcdGlmICh0aGlzLmlzUmF0ZUxpbWl0ZWQocmVzcG9uc2UpKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmV0cnlBZnRlclNlYyA9IHJldHJ5QWZ0ZXJGcm9tSGVhZGVycyhyZXNwb25zZS5yZXMuaGVhZGVycykgPz8gNjA7XG5cdFx0XHRcdFx0dGhpcy5fcmF0ZUxpbWl0QmFja29mZlVudGlsID0gRGF0ZS5ub3coKSArIHJldHJ5QWZ0ZXJTZWMgKiAxMDAwO1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbRGVmYXVsdEFjY291bnRdIFJhdGUgbGltaXRlZCBieSAke3VybH0gKHN0YXR1cyAke3N0YXR1c30pOyBiYWNraW5nIG9mZiBmb3IgJHtyZXRyeUFmdGVyU2VjfXNgKTtcblx0XHRcdFx0XHRyZXR1cm4gcmVzcG9uc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHN0YXR1cyA9PT0gNDAxIHx8IHN0YXR1cyA9PT0gNDA0KSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBbRGVmYXVsdEFjY291bnRdIFJlY2VpdmVkICR7c3RhdHVzfSBmb3IgVVJMICR7dXJsfSB3aXRoIHNlc3Npb24gJHtzZXNzaW9uLmlkfSwgbGlrZWx5IGR1ZSB0byBleHBpcmVkL3Jldm9rZWQgdG9rZW4gb3IgaW5zdWZmaWNpZW50IHBlcm1pc3Npb25zLmAsICdUcnlpbmcgbmV4dCBzZXNzaW9uIGlmIGF2YWlsYWJsZS4nKTtcblx0XHRcdFx0XHRsYXN0UmVzcG9uc2UgPSByZXNwb25zZTtcblx0XHRcdFx0XHRjb250aW51ZTsgLy8gdHJ5IG5leHQgc2Vzc2lvblxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0aWYgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW0RlZmF1bHRBY2NvdW50XSByZXF1ZXN0OiBlcnJvciAke2Vycm9yfWAsIHVybCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWxhc3RSZXNwb25zZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbRGVmYXVsdEFjY291bnRdOiBObyByZXNwb25zZSByZWNlaXZlZCBmb3IgcmVxdWVzdCcsIHVybCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBsYXN0UmVzcG9uc2U7XG5cdH1cblxuXHRwcml2YXRlIGlzRGF0YVN0YWxlKGZldGNoZWRBdDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChEYXRlLm5vdygpIC0gZmV0Y2hlZEF0KSA+PSBBQ0NPVU5UX0RBVEFfUE9MTF9JTlRFUlZBTF9NUztcblx0fVxuXG5cdHByaXZhdGUgZ2V0RW50aXRsZW1lbnRVcmwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5nZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoKS5lbnRlcnByaXNlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBlbnRlcnByaXNlVXJsID0gdGhpcy5nZXRFbnRlcnByaXNlVXJsKCk7XG5cdFx0XHRcdGlmICghZW50ZXJwcmlzZVVybCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGAke2VudGVycHJpc2VVcmwucHJvdG9jb2x9Ly9hcGkuJHtlbnRlcnByaXNlVXJsLmhvc3RuYW1lfSR7ZW50ZXJwcmlzZVVybC5wb3J0ID8gJzonICsgZW50ZXJwcmlzZVVybC5wb3J0IDogJyd9L2NvcGlsb3RfaW50ZXJuYWwvdXNlcmA7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRBY2NvdW50Q29uZmlnLmVudGl0bGVtZW50VXJsO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUb2tlbkVudGl0bGVtZW50VXJsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuZ2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyKCkuZW50ZXJwcmlzZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZW50ZXJwcmlzZVVybCA9IHRoaXMuZ2V0RW50ZXJwcmlzZVVybCgpO1xuXHRcdFx0XHRpZiAoIWVudGVycHJpc2VVcmwpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBgJHtlbnRlcnByaXNlVXJsLnByb3RvY29sfS8vYXBpLiR7ZW50ZXJwcmlzZVVybC5ob3N0bmFtZX0ke2VudGVycHJpc2VVcmwucG9ydCA/ICc6JyArIGVudGVycHJpc2VVcmwucG9ydCA6ICcnfS9jb3BpbG90X2ludGVybmFsL3YyL3Rva2VuYDtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZGVmYXVsdEFjY291bnRDb25maWcudG9rZW5FbnRpdGxlbWVudFVybDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TWNwUmVnaXN0cnlEYXRhVXJsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuZ2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyKCkuZW50ZXJwcmlzZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZW50ZXJwcmlzZVVybCA9IHRoaXMuZ2V0RW50ZXJwcmlzZVVybCgpO1xuXHRcdFx0XHRpZiAoIWVudGVycHJpc2VVcmwpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBgJHtlbnRlcnByaXNlVXJsLnByb3RvY29sfS8vYXBpLiR7ZW50ZXJwcmlzZVVybC5ob3N0bmFtZX0ke2VudGVycHJpc2VVcmwucG9ydCA/ICc6JyArIGVudGVycHJpc2VVcmwucG9ydCA6ICcnfS9jb3BpbG90L21jcF9yZWdpc3RyeWA7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRBY2NvdW50Q29uZmlnLm1jcFJlZ2lzdHJ5RGF0YVVybDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TWFuYWdlZFNldHRpbmdzVXJsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuZ2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyKCkuZW50ZXJwcmlzZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZW50ZXJwcmlzZVVybCA9IHRoaXMuZ2V0RW50ZXJwcmlzZVVybCgpO1xuXHRcdFx0XHRpZiAoIWVudGVycHJpc2VVcmwpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBgJHtlbnRlcnByaXNlVXJsLnByb3RvY29sfS8vYXBpLiR7ZW50ZXJwcmlzZVVybC5ob3N0bmFtZX0ke2VudGVycHJpc2VVcmwucG9ydCA/ICc6JyArIGVudGVycHJpc2VVcmwucG9ydCA6ICcnfS9jb3BpbG90X2ludGVybmFsL21hbmFnZWRfc2V0dGluZ3NgO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0QWNjb3VudENvbmZpZy5tYW5hZ2VkU2V0dGluZ3NVcmw7XG5cdH1cblxuXHRnZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoKTogSURlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlciB7XG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPih0aGlzLmRlZmF1bHRBY2NvdW50Q29uZmlnLmF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuZW50ZXJwcmlzZVByb3ZpZGVyQ29uZmlnKSA9PT0gdGhpcy5kZWZhdWx0QWNjb3VudENvbmZpZy5hdXRoZW50aWNhdGlvblByb3ZpZGVyLmVudGVycHJpc2UuaWQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnRoaXMuZGVmYXVsdEFjY291bnRDb25maWcuYXV0aGVudGljYXRpb25Qcm92aWRlci5lbnRlcnByaXNlLFxuXHRcdFx0XHRlbnRlcnByaXNlOiB0cnVlXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4udGhpcy5kZWZhdWx0QWNjb3VudENvbmZpZy5hdXRoZW50aWNhdGlvblByb3ZpZGVyLmRlZmF1bHQsXG5cdFx0XHRlbnRlcnByaXNlOiBmYWxzZVxuXHRcdH07XG5cdH1cblxuXHRyZXNvbHZlR2l0SHViVXJsKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuZ2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyKCkuZW50ZXJwcmlzZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZW50ZXJwcmlzZVVybCA9IHRoaXMuZ2V0RW50ZXJwcmlzZVVybCgpO1xuXHRcdFx0XHRpZiAoZW50ZXJwcmlzZVVybCkge1xuXHRcdFx0XHRcdHJldHVybiBgJHtlbnRlcnByaXNlVXJsLnByb3RvY29sfS8vJHtlbnRlcnByaXNlVXJsLmhvc3R9LyR7cGF0aH1gO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gZmFsbCB0aHJvdWdoIHRvIGRlZmF1bHRcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gYGh0dHBzOi8vZ2l0aHViLmNvbS8ke3BhdGh9YDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RW50ZXJwcmlzZVVybCgpOiBVUkwgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSh0aGlzLmRlZmF1bHRBY2NvdW50Q29uZmlnLmF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuZW50ZXJwcmlzZVByb3ZpZGVyVXJpU2V0dGluZyk7XG5cdFx0aWYgKCFpc1N0cmluZyh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgVVJMKHZhbHVlKTtcblx0fVxuXG5cdGFzeW5jIHNpZ25JbihvcHRpb25zPzogeyBhZGRpdGlvbmFsU2NvcGVzPzogcmVhZG9ubHkgc3RyaW5nW107W2tleTogc3RyaW5nXTogdW5rbm93biB9KTogUHJvbWlzZTxJRGVmYXVsdEFjY291bnQgfCBudWxsPiB7XG5cdFx0Y29uc3QgYXV0aFByb3ZpZGVyID0gdGhpcy5nZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoKTtcblx0XHRpZiAoIWF1dGhQcm92aWRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBkZWZhdWx0IGFjY291bnQgcHJvdmlkZXIgY29uZmlndXJlZCcpO1xuXHRcdH1cblx0XHRjb25zdCB7IGFkZGl0aW9uYWxTY29wZXMsIC4uLnNlc3Npb25PcHRpb25zIH0gPSBvcHRpb25zID8/IHt9O1xuXHRcdGNvbnN0IGRlZmF1bHRBY2NvdW50U2NvcGVzID0gdGhpcy5kZWZhdWx0QWNjb3VudENvbmZpZy5hdXRoZW50aWNhdGlvblByb3ZpZGVyLnNjb3Blc1swXTtcblx0XHRjb25zdCBzY29wZXMgPSBhZGRpdGlvbmFsU2NvcGVzID8gZGlzdGluY3QoWy4uLmRlZmF1bHRBY2NvdW50U2NvcGVzLCAuLi5hZGRpdGlvbmFsU2NvcGVzXSkgOiBkZWZhdWx0QWNjb3VudFNjb3Blcztcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuY3JlYXRlU2Vzc2lvbihhdXRoUHJvdmlkZXIuaWQsIHNjb3Blcywgc2Vzc2lvbk9wdGlvbnMpO1xuXHRcdGZvciAoY29uc3QgcHJlZmVycmVkRXh0ZW5zaW9uIG9mIHRoaXMuZGVmYXVsdEFjY291bnRDb25maWcucHJlZmVycmVkRXh0ZW5zaW9ucykge1xuXHRcdFx0dGhpcy5hdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLnVwZGF0ZUFjY291bnRQcmVmZXJlbmNlKHByZWZlcnJlZEV4dGVuc2lvbiwgYXV0aFByb3ZpZGVyLmlkLCBzZXNzaW9uLmFjY291bnQpO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnVwZGF0ZURlZmF1bHRBY2NvdW50KCk7XG5cdFx0cmV0dXJuIHRoaXMuZGVmYXVsdEFjY291bnQ7XG5cdH1cblxuXHRhc3luYyBzaWduT3V0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5kZWZhdWx0QWNjb3VudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdfc2lnbk91dE9mQWNjb3VudCcsIHsgcHJvdmlkZXJJZDogdGhpcy5kZWZhdWx0QWNjb3VudC5hdXRoZW50aWNhdGlvblByb3ZpZGVyLmlkLCBhY2NvdW50TGFiZWw6IHRoaXMuZGVmYXVsdEFjY291bnQuYWNjb3VudE5hbWUgfSk7XG5cdH1cblxufVxuXG5jbGFzcyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyBJRCA9ICd3b3JrYmVuY2guY29udHJpYnV0aW9ucy5kZWZhdWx0QWNjb3VudFByb3ZpZGVyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIGRlZmF1bHRBY2NvdW50U2VydmljZTogSURlZmF1bHRBY2NvdW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRpZiAoIXByb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZGVmYXVsdEFjY291bnRQcm92aWRlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlZmF1bHRBY2NvdW50UHJvdmlkZXIsIHRvRGVmYXVsdEFjY291bnRDb25maWcocHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudCkpKTtcblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2Uuc2V0RGVmYXVsdEFjY291bnRQcm92aWRlcihkZWZhdWx0QWNjb3VudFByb3ZpZGVyKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IERFRkFVTFRfQUNDT1VOVF9TSUdOX0lOX0NPTU1BTkQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaWduSW4nLCAnU2lnbiBJbicpLFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRlZmF1bHRBY2NvdW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVmYXVsdEFjY291bnRTZXJ2aWNlKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2Uuc2lnbkluKCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoRGVmYXVsdEFjY291bnRQcm92aWRlckNvbnRyaWJ1dGlvbi5JRCwgRGVmYXVsdEFjY291bnRQcm92aWRlckNvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLGtCQUFrQixrQkFBa0IsZUFBZTtBQUNyRSxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsY0FBYztBQUN2QixTQUFTLGFBQWE7QUFFdEIsU0FBUyxVQUFVLG1CQUE0QjtBQUUvQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFNBQVMsdUJBQXVCO0FBQ3pDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLG9CQUFvQixxQkFBcUI7QUFDL0QsU0FBa0Msd0JBQTRELG1EQUErRTtBQUM3SyxTQUFTLDZCQUErQztBQUN4RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFFBQVEsUUFBUSxpQkFBaUIsZUFBZSxXQUFXLFlBQVksNkJBQTZCO0FBQzdHLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMseUJBQXlCO0FBQ2xDLFNBQWlDLGdDQUFnQyxzQkFBc0I7QUFDdkYsU0FBOEQsa0NBQWtDLDhCQUE4QjtBQUM5SCxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9CQUFvQjtBQUM3QixT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RCxVQUFNLHVCQUF1QixLQUFLLHFCQUFxQix1QkFBdUIsT0FBTyxDQUFDO0FBQ3RGLFVBQU0sU0FBUyxtQkFBbUIsU0FBUyxDQUFDLEdBQUcsc0JBQXNCLEdBQUcsZ0JBQWdCLENBQUMsSUFBSTtBQUM3RixVQUFNLFVBQVUsTUFBTSxLQUFLLHNCQUFzQixjQUFjLGFBQWEsSUFBSSxRQUFRLGNBQWM7QUFDdEcsZUFBVyxzQkFBc0IsS0FBSyxxQkFBcUIscUJBQXFCO0FBQy9FLFdBQUssZ0NBQWdDLHdCQUF3QixvQkFBb0IsYUFBYSxJQUFJLFFBQVEsT0FBTztBQUFBLElBQ2xIO0FBQ0EsVUFBTSxLQUFLLHFCQUFxQjtBQUNoQyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxNQUFNLFVBQXlCO0FBQzlCLFFBQUksQ0FBQyxLQUFLLGdCQUFnQjtBQUN6QjtBQUFBLElBQ0Q7QUFDQSxVQUFNLEtBQUssZUFBZSxlQUFlLHFCQUFxQixFQUFFLFlBQVksS0FBSyxlQUFlLHVCQUF1QixJQUFJLGNBQWMsS0FBSyxlQUFlLFlBQVksQ0FBQztBQUFBLEVBQzNLO0FBRUQ7QUE5OEJhLHlCQUFOO0FBQUEsRUEwQ0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXREVTtBQWc5QmIsSUFBTSxxQ0FBTixjQUFpRCxXQUE2QztBQUFBLEVBSTdGLFlBQ2tCLGdCQUNNLHNCQUNDLHVCQUN2QjtBQUNELFVBQU07QUFDTixRQUFJLENBQUMsZUFBZSxrQkFBa0I7QUFDckM7QUFBQSxJQUNEO0FBQ0EsVUFBTSx5QkFBeUIsS0FBSyxVQUFVLHFCQUFxQixlQUFlLHdCQUF3Qix1QkFBdUIsZUFBZSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQ2xLLDBCQUFzQiwwQkFBMEIsc0JBQXNCO0FBQUEsRUFDdkU7QUFDRDtBQWhCTSxtQ0FFRSxLQUFLO0FBRlAscUNBQU47QUFBQSxFQUtHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBHO0FBa0JOLGdCQUFnQixjQUFjLFFBQVE7QUFBQSxFQUNyQyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLFVBQVUsU0FBUztBQUFBLElBQ3JDLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFDQSxNQUFNLElBQUksVUFBMkM7QUFDcEQsVUFBTSx3QkFBd0IsU0FBUyxJQUFJLHNCQUFzQjtBQUNqRSxVQUFNLHNCQUFzQixPQUFPO0FBQUEsRUFDcEM7QUFDRCxDQUFDO0FBRUQsK0JBQStCLG1DQUFtQyxJQUFJLG9DQUFvQyxlQUFlLFlBQVk7IiwKICAibmFtZXMiOiBbIkRlZmF1bHRBY2NvdW50U3RhdHVzIiwgImRhdGEiXQp9Cg==
