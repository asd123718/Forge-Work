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
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IAuthenticationService, IAuthenticationExtensionsService, INTERNAL_AUTH_PROVIDER_PREFIX } from "../common/authentication.js";
import {
  IAuthenticationQueryService
} from "../common/authenticationQuery.js";
import { IAuthenticationUsageService } from "./authenticationUsageService.js";
import { IAuthenticationMcpUsageService } from "./authenticationMcpUsageService.js";
import { IAuthenticationAccessService } from "./authenticationAccessService.js";
import { IAuthenticationMcpAccessService } from "./authenticationMcpAccessService.js";
import { IAuthenticationMcpService } from "./authenticationMcpService.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
class BaseQuery {
  constructor(providerId, queryService) {
    this.providerId = providerId;
    this.queryService = queryService;
  }
}
class AccountExtensionQuery extends BaseQuery {
  constructor(providerId, accountName, extensionId, queryService) {
    super(providerId, queryService);
    this.accountName = accountName;
    this.extensionId = extensionId;
  }
  isAccessAllowed() {
    return this.queryService.authenticationAccessService.isAccessAllowed(this.providerId, this.accountName, this.extensionId);
  }
  setAccessAllowed(allowed, extensionName) {
    this.queryService.authenticationAccessService.updateAllowedExtensions(
      this.providerId,
      this.accountName,
      [{ id: this.extensionId, name: extensionName || this.extensionId, allowed }]
    );
  }
  addUsage(scopes, extensionName) {
    this.queryService.authenticationUsageService.addAccountUsage(
      this.providerId,
      this.accountName,
      scopes,
      this.extensionId,
      extensionName
    );
  }
  getUsage() {
    const allUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
    return allUsages.filter((usage) => usage.extensionId === ExtensionIdentifier.toKey(this.extensionId)).map((usage) => ({
      extensionId: usage.extensionId,
      extensionName: usage.extensionName,
      scopes: usage.scopes || [],
      lastUsed: usage.lastUsed
    }));
  }
  removeUsage() {
    const allUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
    const filteredUsages = allUsages.filter((usage) => usage.extensionId !== this.extensionId);
    this.queryService.authenticationUsageService.removeAccountUsage(this.providerId, this.accountName);
    for (const usage of filteredUsages) {
      this.queryService.authenticationUsageService.addAccountUsage(
        this.providerId,
        this.accountName,
        usage.scopes || [],
        usage.extensionId,
        usage.extensionName
      );
    }
  }
  setAsPreferred() {
    this.queryService.authenticationExtensionsService.updateAccountPreference(
      this.extensionId,
      this.providerId,
      { label: this.accountName, id: this.accountName }
    );
  }
  isPreferred() {
    const preferredAccount = this.queryService.authenticationExtensionsService.getAccountPreference(this.extensionId, this.providerId);
    return preferredAccount === this.accountName;
  }
  isTrusted() {
    const allowedExtensions = this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName);
    const extension = allowedExtensions.find((ext) => ext.id === this.extensionId);
    return extension?.trusted === true;
  }
}
class AccountMcpServerQuery extends BaseQuery {
  constructor(providerId, accountName, mcpServerId, queryService) {
    super(providerId, queryService);
    this.accountName = accountName;
    this.mcpServerId = mcpServerId;
  }
  isAccessAllowed() {
    return this.queryService.authenticationMcpAccessService.isAccessAllowed(this.providerId, this.accountName, this.mcpServerId);
  }
  setAccessAllowed(allowed, mcpServerName) {
    this.queryService.authenticationMcpAccessService.updateAllowedMcpServers(
      this.providerId,
      this.accountName,
      [{ id: this.mcpServerId, name: mcpServerName || this.mcpServerId, allowed }]
    );
  }
  addUsage(scopes, mcpServerName) {
    this.queryService.authenticationMcpUsageService.addAccountUsage(
      this.providerId,
      this.accountName,
      scopes,
      this.mcpServerId,
      mcpServerName
    );
  }
  getUsage() {
    const allUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, this.accountName);
    return allUsages.filter((usage) => usage.mcpServerId === this.mcpServerId).map((usage) => ({
      mcpServerId: usage.mcpServerId,
      mcpServerName: usage.mcpServerName,
      scopes: usage.scopes || [],
      lastUsed: usage.lastUsed
    }));
  }
  removeUsage() {
    const allUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, this.accountName);
    const filteredUsages = allUsages.filter((usage) => usage.mcpServerId !== this.mcpServerId);
    this.queryService.authenticationMcpUsageService.removeAccountUsage(this.providerId, this.accountName);
    for (const usage of filteredUsages) {
      this.queryService.authenticationMcpUsageService.addAccountUsage(
        this.providerId,
        this.accountName,
        usage.scopes || [],
        usage.mcpServerId,
        usage.mcpServerName
      );
    }
  }
  setAsPreferred() {
    this.queryService.authenticationMcpService.updateAccountPreference(
      this.mcpServerId,
      this.providerId,
      { label: this.accountName, id: this.accountName }
    );
  }
  isPreferred() {
    const preferredAccount = this.queryService.authenticationMcpService.getAccountPreference(this.mcpServerId, this.providerId);
    return preferredAccount === this.accountName;
  }
  isTrusted() {
    const allowedMcpServers = this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName);
    const mcpServer = allowedMcpServers.find((server) => server.id === this.mcpServerId);
    return mcpServer?.trusted === true;
  }
}
class AccountExtensionsQuery extends BaseQuery {
  constructor(providerId, accountName, queryService) {
    super(providerId, queryService);
    this.accountName = accountName;
  }
  getAllowedExtensions() {
    const allowedExtensions = this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName);
    const usages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
    return allowedExtensions.filter((ext) => ext.allowed !== false).map((ext) => {
      const extensionUsages = usages.filter((usage) => usage.extensionId === ext.id);
      const lastUsed = extensionUsages.length > 0 ? Math.max(...extensionUsages.map((u) => u.lastUsed)) : void 0;
      const extensionQuery = new AccountExtensionQuery(this.providerId, this.accountName, ext.id, this.queryService);
      const trusted = extensionQuery.isTrusted();
      return {
        id: ext.id,
        name: ext.name,
        allowed: ext.allowed,
        lastUsed,
        trusted
      };
    });
  }
  allowAccess(extensionIds) {
    const extensionsToAllow = extensionIds.map((id) => ({ id, name: id, allowed: true }));
    this.queryService.authenticationAccessService.updateAllowedExtensions(this.providerId, this.accountName, extensionsToAllow);
  }
  removeAccess(extensionIds) {
    const extensionsToRemove = extensionIds.map((id) => ({ id, name: id, allowed: false }));
    this.queryService.authenticationAccessService.updateAllowedExtensions(this.providerId, this.accountName, extensionsToRemove);
  }
  forEach(callback) {
    const usages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
    const allowedExtensions = this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName);
    const extensionIds = /* @__PURE__ */ new Set();
    usages.forEach((usage) => extensionIds.add(usage.extensionId));
    allowedExtensions.forEach((ext) => extensionIds.add(ext.id));
    for (const extensionId of extensionIds) {
      const extensionQuery = new AccountExtensionQuery(this.providerId, this.accountName, extensionId, this.queryService);
      callback(extensionQuery);
    }
  }
}
class AccountMcpServersQuery extends BaseQuery {
  constructor(providerId, accountName, queryService) {
    super(providerId, queryService);
    this.accountName = accountName;
  }
  getAllowedMcpServers() {
    return this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName).filter((server) => server.allowed !== false);
  }
  allowAccess(mcpServerIds) {
    const mcpServersToAllow = mcpServerIds.map((id) => ({ id, name: id, allowed: true }));
    this.queryService.authenticationMcpAccessService.updateAllowedMcpServers(this.providerId, this.accountName, mcpServersToAllow);
  }
  removeAccess(mcpServerIds) {
    const mcpServersToRemove = mcpServerIds.map((id) => ({ id, name: id, allowed: false }));
    this.queryService.authenticationMcpAccessService.updateAllowedMcpServers(this.providerId, this.accountName, mcpServersToRemove);
  }
  forEach(callback) {
    const usages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, this.accountName);
    const allowedMcpServers = this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName);
    const mcpServerIds = /* @__PURE__ */ new Set();
    usages.forEach((usage) => mcpServerIds.add(usage.mcpServerId));
    allowedMcpServers.forEach((server) => mcpServerIds.add(server.id));
    for (const mcpServerId of mcpServerIds) {
      const mcpServerQuery = new AccountMcpServerQuery(this.providerId, this.accountName, mcpServerId, this.queryService);
      callback(mcpServerQuery);
    }
  }
}
class AccountEntitiesQuery extends BaseQuery {
  constructor(providerId, accountName, queryService) {
    super(providerId, queryService);
    this.accountName = accountName;
  }
  hasAnyUsage() {
    const extensionUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
    if (extensionUsages.length > 0) {
      return true;
    }
    const mcpUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, this.accountName);
    if (mcpUsages.length > 0) {
      return true;
    }
    const allowedExtensions = this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName);
    if (allowedExtensions.some((ext) => ext.allowed !== false)) {
      return true;
    }
    const allowedMcpServers = this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName);
    if (allowedMcpServers.some((server) => server.allowed !== false)) {
      return true;
    }
    return false;
  }
  getEntityCount() {
    const extensionUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
    const allowedExtensions = this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName).filter((ext) => ext.allowed);
    const extensionIds = /* @__PURE__ */ new Set();
    extensionUsages.forEach((usage) => extensionIds.add(usage.extensionId));
    allowedExtensions.forEach((ext) => extensionIds.add(ext.id));
    const mcpUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, this.accountName);
    const allowedMcpServers = this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName).filter((server) => server.allowed);
    const mcpServerIds = /* @__PURE__ */ new Set();
    mcpUsages.forEach((usage) => mcpServerIds.add(usage.mcpServerId));
    allowedMcpServers.forEach((server) => mcpServerIds.add(server.id));
    const extensionCount = extensionIds.size;
    const mcpServerCount = mcpServerIds.size;
    return {
      extensions: extensionCount,
      mcpServers: mcpServerCount,
      total: extensionCount + mcpServerCount
    };
  }
  removeAllAccess() {
    const extensionsQuery = new AccountExtensionsQuery(this.providerId, this.accountName, this.queryService);
    const extensions = extensionsQuery.getAllowedExtensions();
    const extensionIds = extensions.map((ext) => ext.id);
    if (extensionIds.length > 0) {
      extensionsQuery.removeAccess(extensionIds);
    }
    const mcpServersQuery = new AccountMcpServersQuery(this.providerId, this.accountName, this.queryService);
    const mcpServers = mcpServersQuery.getAllowedMcpServers();
    const mcpServerIds = mcpServers.map((server) => server.id);
    if (mcpServerIds.length > 0) {
      mcpServersQuery.removeAccess(mcpServerIds);
    }
  }
  forEach(callback) {
    const extensionsQuery = new AccountExtensionsQuery(this.providerId, this.accountName, this.queryService);
    extensionsQuery.forEach((extensionQuery) => {
      callback(extensionQuery.extensionId, "extension");
    });
    const mcpServersQuery = new AccountMcpServersQuery(this.providerId, this.accountName, this.queryService);
    mcpServersQuery.forEach((mcpServerQuery) => {
      callback(mcpServerQuery.mcpServerId, "mcpServer");
    });
  }
}
class AccountQuery extends BaseQuery {
  constructor(providerId, accountName, queryService) {
    super(providerId, queryService);
    this.accountName = accountName;
  }
  extension(extensionId) {
    return new AccountExtensionQuery(this.providerId, this.accountName, extensionId, this.queryService);
  }
  mcpServer(mcpServerId) {
    return new AccountMcpServerQuery(this.providerId, this.accountName, mcpServerId, this.queryService);
  }
  extensions() {
    return new AccountExtensionsQuery(this.providerId, this.accountName, this.queryService);
  }
  mcpServers() {
    return new AccountMcpServersQuery(this.providerId, this.accountName, this.queryService);
  }
  entities() {
    return new AccountEntitiesQuery(this.providerId, this.accountName, this.queryService);
  }
  remove() {
    this.queryService.authenticationAccessService.removeAllowedExtensions(this.providerId, this.accountName);
    this.queryService.authenticationUsageService.removeAccountUsage(this.providerId, this.accountName);
    this.queryService.authenticationMcpAccessService.removeAllowedMcpServers(this.providerId, this.accountName);
    this.queryService.authenticationMcpUsageService.removeAccountUsage(this.providerId, this.accountName);
  }
}
class ProviderExtensionQuery extends BaseQuery {
  constructor(providerId, extensionId, queryService) {
    super(providerId, queryService);
    this.extensionId = extensionId;
  }
  getPreferredAccount() {
    return this.queryService.authenticationExtensionsService.getAccountPreference(this.extensionId, this.providerId);
  }
  setPreferredAccount(account) {
    this.queryService.authenticationExtensionsService.updateAccountPreference(this.extensionId, this.providerId, account);
  }
  removeAccountPreference() {
    this.queryService.authenticationExtensionsService.removeAccountPreference(this.extensionId, this.providerId);
  }
}
class ProviderMcpServerQuery extends BaseQuery {
  constructor(providerId, mcpServerId, queryService) {
    super(providerId, queryService);
    this.mcpServerId = mcpServerId;
  }
  async getLastUsedAccount() {
    try {
      const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
      let lastUsedAccount;
      let lastUsedTime = 0;
      for (const account of accounts) {
        const usages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, account.label);
        const mcpServerUsages = usages.filter((usage) => usage.mcpServerId === this.mcpServerId);
        for (const usage of mcpServerUsages) {
          if (usage.lastUsed > lastUsedTime) {
            lastUsedTime = usage.lastUsed;
            lastUsedAccount = account.label;
          }
        }
      }
      return lastUsedAccount;
    } catch {
      return void 0;
    }
  }
  getPreferredAccount() {
    return this.queryService.authenticationMcpService.getAccountPreference(this.mcpServerId, this.providerId);
  }
  setPreferredAccount(account) {
    this.queryService.authenticationMcpService.updateAccountPreference(this.mcpServerId, this.providerId, account);
  }
  removeAccountPreference() {
    this.queryService.authenticationMcpService.removeAccountPreference(this.mcpServerId, this.providerId);
  }
  async getUsedAccounts() {
    try {
      const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
      const usedAccounts = [];
      for (const account of accounts) {
        const usages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, account.label);
        if (usages.some((usage) => usage.mcpServerId === this.mcpServerId)) {
          usedAccounts.push(account.label);
        }
      }
      return usedAccounts;
    } catch {
      return [];
    }
  }
}
class ProviderQuery extends BaseQuery {
  constructor(providerId, queryService) {
    super(providerId, queryService);
  }
  account(accountName) {
    return new AccountQuery(this.providerId, accountName, this.queryService);
  }
  extension(extensionId) {
    return new ProviderExtensionQuery(this.providerId, extensionId, this.queryService);
  }
  mcpServer(mcpServerId) {
    return new ProviderMcpServerQuery(this.providerId, mcpServerId, this.queryService);
  }
  async getActiveEntities() {
    const extensions = [];
    const mcpServers = [];
    try {
      const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
      for (const account of accounts) {
        const extensionUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, account.label);
        for (const usage of extensionUsages) {
          if (!extensions.includes(usage.extensionId)) {
            extensions.push(usage.extensionId);
          }
        }
        const mcpUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, account.label);
        for (const usage of mcpUsages) {
          if (!mcpServers.includes(usage.mcpServerId)) {
            mcpServers.push(usage.mcpServerId);
          }
        }
      }
    } catch {
    }
    return { extensions, mcpServers };
  }
  async getAccountNames() {
    try {
      const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
      return accounts.map((account) => account.label);
    } catch {
      return [];
    }
  }
  async getUsageStats() {
    const recentActivity = [];
    let totalSessions = 0;
    let totalAccounts = 0;
    try {
      const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
      totalAccounts = accounts.length;
      for (const account of accounts) {
        const extensionUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, account.label);
        const mcpUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, account.label);
        const allUsages = [...extensionUsages, ...mcpUsages];
        const usageCount = allUsages.length;
        const lastUsed = Math.max(...allUsages.map((u) => u.lastUsed), 0);
        if (usageCount > 0) {
          recentActivity.push({ accountName: account.label, lastUsed, usageCount });
        }
      }
      recentActivity.sort((a, b) => b.lastUsed - a.lastUsed);
      totalSessions = recentActivity.reduce((sum, activity) => sum + activity.usageCount, 0);
    } catch {
    }
    return { totalSessions, totalAccounts, recentActivity };
  }
  async forEachAccount(callback) {
    try {
      const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
      for (const account of accounts) {
        const accountQuery = new AccountQuery(this.providerId, account.label, this.queryService);
        callback(accountQuery);
      }
    } catch {
    }
  }
}
class ExtensionQuery {
  constructor(extensionId, queryService) {
    this.extensionId = extensionId;
    this.queryService = queryService;
  }
  async getProvidersWithAccess(includeInternal) {
    const providersWithAccess = [];
    const providerIds = this.queryService.authenticationService.getProviderIds();
    for (const providerId of providerIds) {
      if (!includeInternal && providerId.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX)) {
        continue;
      }
      try {
        const accounts = await this.queryService.authenticationService.getAccounts(providerId);
        const hasAccess = accounts.some((account) => {
          const accessAllowed = this.queryService.authenticationAccessService.isAccessAllowed(providerId, account.label, this.extensionId);
          return accessAllowed === true;
        });
        if (hasAccess) {
          providersWithAccess.push(providerId);
        }
      } catch {
      }
    }
    return providersWithAccess;
  }
  getAllAccountPreferences(includeInternal) {
    const preferences = /* @__PURE__ */ new Map();
    const providerIds = this.queryService.authenticationService.getProviderIds();
    for (const providerId of providerIds) {
      if (!includeInternal && providerId.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX)) {
        continue;
      }
      const preferredAccount = this.queryService.authenticationExtensionsService.getAccountPreference(this.extensionId, providerId);
      if (preferredAccount) {
        preferences.set(providerId, preferredAccount);
      }
    }
    return preferences;
  }
  provider(providerId) {
    return new ProviderExtensionQuery(providerId, this.extensionId, this.queryService);
  }
}
class McpServerQuery {
  constructor(mcpServerId, queryService) {
    this.mcpServerId = mcpServerId;
    this.queryService = queryService;
  }
  async getProvidersWithAccess(includeInternal) {
    const providersWithAccess = [];
    const providerIds = this.queryService.authenticationService.getProviderIds();
    for (const providerId of providerIds) {
      if (!includeInternal && providerId.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX)) {
        continue;
      }
      try {
        const accounts = await this.queryService.authenticationService.getAccounts(providerId);
        const hasAccess = accounts.some((account) => {
          const accessAllowed = this.queryService.authenticationMcpAccessService.isAccessAllowed(providerId, account.label, this.mcpServerId);
          return accessAllowed === true;
        });
        if (hasAccess) {
          providersWithAccess.push(providerId);
        }
      } catch {
      }
    }
    return providersWithAccess;
  }
  getAllAccountPreferences(includeInternal) {
    const preferences = /* @__PURE__ */ new Map();
    const providerIds = this.queryService.authenticationService.getProviderIds();
    for (const providerId of providerIds) {
      if (!includeInternal && providerId.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX)) {
        continue;
      }
      const preferredAccount = this.queryService.authenticationMcpService.getAccountPreference(this.mcpServerId, providerId);
      if (preferredAccount) {
        preferences.set(providerId, preferredAccount);
      }
    }
    return preferences;
  }
  provider(providerId) {
    return new ProviderMcpServerQuery(providerId, this.mcpServerId, this.queryService);
  }
}
let AuthenticationQueryService = class extends Disposable {
  constructor(authenticationService, authenticationUsageService, authenticationMcpUsageService, authenticationAccessService, authenticationMcpAccessService, authenticationExtensionsService, authenticationMcpService, logService) {
    super();
    this.authenticationService = authenticationService;
    this.authenticationUsageService = authenticationUsageService;
    this.authenticationMcpUsageService = authenticationMcpUsageService;
    this.authenticationAccessService = authenticationAccessService;
    this.authenticationMcpAccessService = authenticationMcpAccessService;
    this.authenticationExtensionsService = authenticationExtensionsService;
    this.authenticationMcpService = authenticationMcpService;
    this.logService = logService;
    this._onDidChangePreferences = this._register(new Emitter());
    this.onDidChangePreferences = this._onDidChangePreferences.event;
    this._onDidChangeAccess = this._register(new Emitter());
    this.onDidChangeAccess = this._onDidChangeAccess.event;
    this._register(this.authenticationExtensionsService.onDidChangeAccountPreference((e) => {
      this._onDidChangePreferences.fire({
        providerId: e.providerId,
        entityType: "extension",
        entityIds: e.extensionIds
      });
    }));
    this._register(this.authenticationMcpService.onDidChangeAccountPreference((e) => {
      this._onDidChangePreferences.fire({
        providerId: e.providerId,
        entityType: "mcpServer",
        entityIds: e.mcpServerIds
      });
    }));
    this._register(this.authenticationAccessService.onDidChangeExtensionSessionAccess((e) => {
      this._onDidChangeAccess.fire({
        providerId: e.providerId,
        accountName: e.accountName
      });
    }));
    this._register(this.authenticationMcpAccessService.onDidChangeMcpSessionAccess((e) => {
      this._onDidChangeAccess.fire({
        providerId: e.providerId,
        accountName: e.accountName
      });
    }));
  }
  provider(providerId) {
    return new ProviderQuery(providerId, this);
  }
  extension(extensionId) {
    return new ExtensionQuery(extensionId, this);
  }
  mcpServer(mcpServerId) {
    return new McpServerQuery(mcpServerId, this);
  }
  getProviderIds(includeInternal) {
    return this.authenticationService.getProviderIds().filter((providerId) => {
      return includeInternal || !providerId.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX);
    });
  }
  async clearAllData(confirmation, includeInternal = true) {
    if (confirmation !== "CLEAR_ALL_AUTH_DATA") {
      throw new Error("Must provide confirmation string to clear all authentication data");
    }
    const providerIds = this.getProviderIds(includeInternal);
    for (const providerId of providerIds) {
      try {
        const accounts = await this.authenticationService.getAccounts(providerId);
        for (const account of accounts) {
          this.authenticationAccessService.removeAllowedExtensions(providerId, account.label);
          this.authenticationUsageService.removeAccountUsage(providerId, account.label);
          this.authenticationMcpAccessService.removeAllowedMcpServers(providerId, account.label);
          this.authenticationMcpUsageService.removeAccountUsage(providerId, account.label);
        }
      } catch (error) {
        this.logService.error(`Error clearing data for provider ${providerId}:`, error);
      }
    }
    this.logService.info("All authentication data cleared");
  }
};
AuthenticationQueryService = __decorateClass([
  __decorateParam(0, IAuthenticationService),
  __decorateParam(1, IAuthenticationUsageService),
  __decorateParam(2, IAuthenticationMcpUsageService),
  __decorateParam(3, IAuthenticationAccessService),
  __decorateParam(4, IAuthenticationMcpAccessService),
  __decorateParam(5, IAuthenticationExtensionsService),
  __decorateParam(6, IAuthenticationMcpService),
  __decorateParam(7, ILogService)
], AuthenticationQueryService);
registerSingleton(IAuthenticationQueryService, AuthenticationQueryService, InstantiationType.Delayed);
export {
  AuthenticationQueryService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxhdXRoZW50aWNhdGlvblxcYnJvd3NlclxcYXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQXV0aGVudGljYXRpb25TZXNzaW9uQWNjb3VudCwgSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgSUF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UsIElOVEVSTkFMX0FVVEhfUFJPVklERVJfUFJFRklYIH0gZnJvbSAnLi4vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7XG5cdElBdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZSxcblx0SVByb3ZpZGVyUXVlcnksXG5cdElBY2NvdW50UXVlcnksXG5cdElBY2NvdW50RXh0ZW5zaW9uUXVlcnksXG5cdElBY2NvdW50TWNwU2VydmVyUXVlcnksXG5cdElBY2NvdW50RXh0ZW5zaW9uc1F1ZXJ5LFxuXHRJQWNjb3VudE1jcFNlcnZlcnNRdWVyeSxcblx0SUFjY291bnRFbnRpdGllc1F1ZXJ5LFxuXHRJUHJvdmlkZXJFeHRlbnNpb25RdWVyeSxcblx0SVByb3ZpZGVyTWNwU2VydmVyUXVlcnksXG5cdElFeHRlbnNpb25RdWVyeSxcblx0SU1jcFNlcnZlclF1ZXJ5LFxuXHRJQWN0aXZlRW50aXRpZXMsXG5cdElBdXRoZW50aWNhdGlvblVzYWdlU3RhdHMsXG5cdElCYXNlUXVlcnlcbn0gZnJvbSAnLi4vY29tbW9uL2F1dGhlbnRpY2F0aW9uUXVlcnkuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlIH0gZnJvbSAnLi9hdXRoZW50aWNhdGlvblVzYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UgfSBmcm9tICcuL2F1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UgfSBmcm9tICcuL2F1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi9hdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSB9IGZyb20gJy4vYXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcblxuLyoqXG4gKiBCYXNlIGltcGxlbWVudGF0aW9uIGZvciBxdWVyeSBpbnRlcmZhY2VzXG4gKi9cbmFic3RyYWN0IGNsYXNzIEJhc2VRdWVyeSBpbXBsZW1lbnRzIElCYXNlUXVlcnkge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBxdWVyeVNlcnZpY2U6IEF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlXG5cdCkgeyB9XG59XG5cbi8qKlxuICogSW1wbGVtZW50YXRpb24gb2YgYWNjb3VudC1leHRlbnNpb24gcXVlcnkgb3BlcmF0aW9uc1xuICovXG5jbGFzcyBBY2NvdW50RXh0ZW5zaW9uUXVlcnkgZXh0ZW5kcyBCYXNlUXVlcnkgaW1wbGVtZW50cyBJQWNjb3VudEV4dGVuc2lvblF1ZXJ5IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdmlkZXJJZDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBhY2NvdW50TmFtZTogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBleHRlbnNpb25JZDogc3RyaW5nLFxuXHRcdHF1ZXJ5U2VydmljZTogQXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIocHJvdmlkZXJJZCwgcXVlcnlTZXJ2aWNlKTtcblx0fVxuXG5cdGlzQWNjZXNzQWxsb3dlZCgpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZCh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUsIHRoaXMuZXh0ZW5zaW9uSWQpO1xuXHR9XG5cblx0c2V0QWNjZXNzQWxsb3dlZChhbGxvd2VkOiBib29sZWFuLCBleHRlbnNpb25OYW1lPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRFeHRlbnNpb25zKFxuXHRcdFx0dGhpcy5wcm92aWRlcklkLFxuXHRcdFx0dGhpcy5hY2NvdW50TmFtZSxcblx0XHRcdFt7IGlkOiB0aGlzLmV4dGVuc2lvbklkLCBuYW1lOiBleHRlbnNpb25OYW1lIHx8IHRoaXMuZXh0ZW5zaW9uSWQsIGFsbG93ZWQgfV1cblx0XHQpO1xuXHR9XG5cblx0YWRkVXNhZ2Uoc2NvcGVzOiByZWFkb25seSBzdHJpbmdbXSwgZXh0ZW5zaW9uTmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UuYWRkQWNjb3VudFVzYWdlKFxuXHRcdFx0dGhpcy5wcm92aWRlcklkLFxuXHRcdFx0dGhpcy5hY2NvdW50TmFtZSxcblx0XHRcdHNjb3Blcyxcblx0XHRcdHRoaXMuZXh0ZW5zaW9uSWQsXG5cdFx0XHRleHRlbnNpb25OYW1lXG5cdFx0KTtcblx0fVxuXG5cdGdldFVzYWdlKCk6IHtcblx0XHRyZWFkb25seSBleHRlbnNpb25JZDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGV4dGVuc2lvbk5hbWU6IHN0cmluZztcblx0XHRyZWFkb25seSBzY29wZXM6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRcdHJlYWRvbmx5IGxhc3RVc2VkOiBudW1iZXI7XG5cdH1bXSB7XG5cdFx0Y29uc3QgYWxsVXNhZ2VzID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UucmVhZEFjY291bnRVc2FnZXModGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKTtcblx0XHRyZXR1cm4gYWxsVXNhZ2VzXG5cdFx0XHQuZmlsdGVyKHVzYWdlID0+IHVzYWdlLmV4dGVuc2lvbklkID09PSBFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KHRoaXMuZXh0ZW5zaW9uSWQpKVxuXHRcdFx0Lm1hcCh1c2FnZSA9PiAoe1xuXHRcdFx0XHRleHRlbnNpb25JZDogdXNhZ2UuZXh0ZW5zaW9uSWQsXG5cdFx0XHRcdGV4dGVuc2lvbk5hbWU6IHVzYWdlLmV4dGVuc2lvbk5hbWUsXG5cdFx0XHRcdHNjb3BlczogdXNhZ2Uuc2NvcGVzIHx8IFtdLFxuXHRcdFx0XHRsYXN0VXNlZDogdXNhZ2UubGFzdFVzZWRcblx0XHRcdH0pKTtcblx0fVxuXG5cdHJlbW92ZVVzYWdlKCk6IHZvaWQge1xuXHRcdC8vIEdldCBjdXJyZW50IHVzYWdlcywgZmlsdGVyIG91dCB0aGlzIGV4dGVuc2lvbiwgYW5kIHN0b3JlIHRoZSByZXN0XG5cdFx0Y29uc3QgYWxsVXNhZ2VzID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UucmVhZEFjY291bnRVc2FnZXModGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKTtcblx0XHRjb25zdCBmaWx0ZXJlZFVzYWdlcyA9IGFsbFVzYWdlcy5maWx0ZXIodXNhZ2UgPT4gdXNhZ2UuZXh0ZW5zaW9uSWQgIT09IHRoaXMuZXh0ZW5zaW9uSWQpO1xuXG5cdFx0Ly8gQ2xlYXIgYWxsIHVzYWdlcyBhbmQgcmUtYWRkIHRoZSBmaWx0ZXJlZCBvbmVzXG5cdFx0dGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UucmVtb3ZlQWNjb3VudFVzYWdlKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSk7XG5cdFx0Zm9yIChjb25zdCB1c2FnZSBvZiBmaWx0ZXJlZFVzYWdlcykge1xuXHRcdFx0dGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UuYWRkQWNjb3VudFVzYWdlKFxuXHRcdFx0XHR0aGlzLnByb3ZpZGVySWQsXG5cdFx0XHRcdHRoaXMuYWNjb3VudE5hbWUsXG5cdFx0XHRcdHVzYWdlLnNjb3BlcyB8fCBbXSxcblx0XHRcdFx0dXNhZ2UuZXh0ZW5zaW9uSWQsXG5cdFx0XHRcdHVzYWdlLmV4dGVuc2lvbk5hbWVcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0QXNQcmVmZXJyZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZS51cGRhdGVBY2NvdW50UHJlZmVyZW5jZShcblx0XHRcdHRoaXMuZXh0ZW5zaW9uSWQsXG5cdFx0XHR0aGlzLnByb3ZpZGVySWQsXG5cdFx0XHR7IGxhYmVsOiB0aGlzLmFjY291bnROYW1lLCBpZDogdGhpcy5hY2NvdW50TmFtZSB9XG5cdFx0KTtcblx0fVxuXG5cdGlzUHJlZmVycmVkKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHByZWZlcnJlZEFjY291bnQgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLmdldEFjY291bnRQcmVmZXJlbmNlKHRoaXMuZXh0ZW5zaW9uSWQsIHRoaXMucHJvdmlkZXJJZCk7XG5cdFx0cmV0dXJuIHByZWZlcnJlZEFjY291bnQgPT09IHRoaXMuYWNjb3VudE5hbWU7XG5cdH1cblxuXHRpc1RydXN0ZWQoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYWxsb3dlZEV4dGVuc2lvbnMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRFeHRlbnNpb25zKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gYWxsb3dlZEV4dGVuc2lvbnMuZmluZChleHQgPT4gZXh0LmlkID09PSB0aGlzLmV4dGVuc2lvbklkKTtcblx0XHRyZXR1cm4gZXh0ZW5zaW9uPy50cnVzdGVkID09PSB0cnVlO1xuXHR9XG59XG5cbi8qKlxuICogSW1wbGVtZW50YXRpb24gb2YgYWNjb3VudC1NQ1Agc2VydmVyIHF1ZXJ5IG9wZXJhdGlvbnNcbiAqL1xuY2xhc3MgQWNjb3VudE1jcFNlcnZlclF1ZXJ5IGV4dGVuZHMgQmFzZVF1ZXJ5IGltcGxlbWVudHMgSUFjY291bnRNY3BTZXJ2ZXJRdWVyeSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3ZpZGVySWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgYWNjb3VudE5hbWU6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbWNwU2VydmVySWQ6IHN0cmluZyxcblx0XHRxdWVyeVNlcnZpY2U6IEF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHByb3ZpZGVySWQsIHF1ZXJ5U2VydmljZSk7XG5cdH1cblxuXHRpc0FjY2Vzc0FsbG93ZWQoKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWQodGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lLCB0aGlzLm1jcFNlcnZlcklkKTtcblx0fVxuXG5cdHNldEFjY2Vzc0FsbG93ZWQoYWxsb3dlZDogYm9vbGVhbiwgbWNwU2VydmVyTmFtZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkTWNwU2VydmVycyhcblx0XHRcdHRoaXMucHJvdmlkZXJJZCxcblx0XHRcdHRoaXMuYWNjb3VudE5hbWUsXG5cdFx0XHRbeyBpZDogdGhpcy5tY3BTZXJ2ZXJJZCwgbmFtZTogbWNwU2VydmVyTmFtZSB8fCB0aGlzLm1jcFNlcnZlcklkLCBhbGxvd2VkIH1dXG5cdFx0KTtcblx0fVxuXG5cdGFkZFVzYWdlKHNjb3BlczogcmVhZG9ubHkgc3RyaW5nW10sIG1jcFNlcnZlck5hbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLmFkZEFjY291bnRVc2FnZShcblx0XHRcdHRoaXMucHJvdmlkZXJJZCxcblx0XHRcdHRoaXMuYWNjb3VudE5hbWUsXG5cdFx0XHRzY29wZXMsXG5cdFx0XHR0aGlzLm1jcFNlcnZlcklkLFxuXHRcdFx0bWNwU2VydmVyTmFtZVxuXHRcdCk7XG5cdH1cblxuXHRnZXRVc2FnZSgpOiB7XG5cdFx0cmVhZG9ubHkgbWNwU2VydmVySWQ6IHN0cmluZztcblx0XHRyZWFkb25seSBtY3BTZXJ2ZXJOYW1lOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgc2NvcGVzOiByZWFkb25seSBzdHJpbmdbXTtcblx0XHRyZWFkb25seSBsYXN0VXNlZDogbnVtYmVyO1xuXHR9W10ge1xuXHRcdGNvbnN0IGFsbFVzYWdlcyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLnJlYWRBY2NvdW50VXNhZ2VzKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSk7XG5cdFx0cmV0dXJuIGFsbFVzYWdlc1xuXHRcdFx0LmZpbHRlcih1c2FnZSA9PiB1c2FnZS5tY3BTZXJ2ZXJJZCA9PT0gdGhpcy5tY3BTZXJ2ZXJJZClcblx0XHRcdC5tYXAodXNhZ2UgPT4gKHtcblx0XHRcdFx0bWNwU2VydmVySWQ6IHVzYWdlLm1jcFNlcnZlcklkLFxuXHRcdFx0XHRtY3BTZXJ2ZXJOYW1lOiB1c2FnZS5tY3BTZXJ2ZXJOYW1lLFxuXHRcdFx0XHRzY29wZXM6IHVzYWdlLnNjb3BlcyB8fCBbXSxcblx0XHRcdFx0bGFzdFVzZWQ6IHVzYWdlLmxhc3RVc2VkXG5cdFx0XHR9KSk7XG5cdH1cblxuXHRyZW1vdmVVc2FnZSgpOiB2b2lkIHtcblx0XHQvLyBHZXQgY3VycmVudCB1c2FnZXMsIGZpbHRlciBvdXQgdGhpcyBNQ1Agc2VydmVyLCBhbmQgc3RvcmUgdGhlIHJlc3Rcblx0XHRjb25zdCBhbGxVc2FnZXMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZS5yZWFkQWNjb3VudFVzYWdlcyh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUpO1xuXHRcdGNvbnN0IGZpbHRlcmVkVXNhZ2VzID0gYWxsVXNhZ2VzLmZpbHRlcih1c2FnZSA9PiB1c2FnZS5tY3BTZXJ2ZXJJZCAhPT0gdGhpcy5tY3BTZXJ2ZXJJZCk7XG5cblx0XHQvLyBDbGVhciBhbGwgdXNhZ2VzIGFuZCByZS1hZGQgdGhlIGZpbHRlcmVkIG9uZXNcblx0XHR0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZS5yZW1vdmVBY2NvdW50VXNhZ2UodGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKTtcblx0XHRmb3IgKGNvbnN0IHVzYWdlIG9mIGZpbHRlcmVkVXNhZ2VzKSB7XG5cdFx0XHR0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZS5hZGRBY2NvdW50VXNhZ2UoXG5cdFx0XHRcdHRoaXMucHJvdmlkZXJJZCxcblx0XHRcdFx0dGhpcy5hY2NvdW50TmFtZSxcblx0XHRcdFx0dXNhZ2Uuc2NvcGVzIHx8IFtdLFxuXHRcdFx0XHR1c2FnZS5tY3BTZXJ2ZXJJZCxcblx0XHRcdFx0dXNhZ2UubWNwU2VydmVyTmFtZVxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRzZXRBc1ByZWZlcnJlZCgpOiB2b2lkIHtcblx0XHR0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UudXBkYXRlQWNjb3VudFByZWZlcmVuY2UoXG5cdFx0XHR0aGlzLm1jcFNlcnZlcklkLFxuXHRcdFx0dGhpcy5wcm92aWRlcklkLFxuXHRcdFx0eyBsYWJlbDogdGhpcy5hY2NvdW50TmFtZSwgaWQ6IHRoaXMuYWNjb3VudE5hbWUgfVxuXHRcdCk7XG5cdH1cblxuXHRpc1ByZWZlcnJlZCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBwcmVmZXJyZWRBY2NvdW50ID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLmdldEFjY291bnRQcmVmZXJlbmNlKHRoaXMubWNwU2VydmVySWQsIHRoaXMucHJvdmlkZXJJZCk7XG5cdFx0cmV0dXJuIHByZWZlcnJlZEFjY291bnQgPT09IHRoaXMuYWNjb3VudE5hbWU7XG5cdH1cblxuXHRpc1RydXN0ZWQoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYWxsb3dlZE1jcFNlcnZlcnMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRNY3BTZXJ2ZXJzKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSk7XG5cdFx0Y29uc3QgbWNwU2VydmVyID0gYWxsb3dlZE1jcFNlcnZlcnMuZmluZChzZXJ2ZXIgPT4gc2VydmVyLmlkID09PSB0aGlzLm1jcFNlcnZlcklkKTtcblx0XHRyZXR1cm4gbWNwU2VydmVyPy50cnVzdGVkID09PSB0cnVlO1xuXHR9XG59XG5cbi8qKlxuICogSW1wbGVtZW50YXRpb24gb2YgYWNjb3VudC1leHRlbnNpb25zIHF1ZXJ5IG9wZXJhdGlvbnNcbiAqL1xuY2xhc3MgQWNjb3VudEV4dGVuc2lvbnNRdWVyeSBleHRlbmRzIEJhc2VRdWVyeSBpbXBsZW1lbnRzIElBY2NvdW50RXh0ZW5zaW9uc1F1ZXJ5IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdmlkZXJJZDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBhY2NvdW50TmFtZTogc3RyaW5nLFxuXHRcdHF1ZXJ5U2VydmljZTogQXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIocHJvdmlkZXJJZCwgcXVlcnlTZXJ2aWNlKTtcblx0fVxuXG5cdGdldEFsbG93ZWRFeHRlbnNpb25zKCk6IHsgaWQ6IHN0cmluZzsgbmFtZTogc3RyaW5nOyBhbGxvd2VkPzogYm9vbGVhbjsgbGFzdFVzZWQ/OiBudW1iZXI7IHRydXN0ZWQ/OiBib29sZWFuIH1bXSB7XG5cdFx0Y29uc3QgYWxsb3dlZEV4dGVuc2lvbnMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRFeHRlbnNpb25zKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSk7XG5cdFx0Y29uc3QgdXNhZ2VzID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UucmVhZEFjY291bnRVc2FnZXModGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKTtcblxuXHRcdHJldHVybiBhbGxvd2VkRXh0ZW5zaW9uc1xuXHRcdFx0LmZpbHRlcihleHQgPT4gZXh0LmFsbG93ZWQgIT09IGZhbHNlKVxuXHRcdFx0Lm1hcChleHQgPT4ge1xuXHRcdFx0XHQvLyBGaW5kIHRoZSBtb3N0IHJlY2VudCB1c2FnZSBmb3IgdGhpcyBleHRlbnNpb25cblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uVXNhZ2VzID0gdXNhZ2VzLmZpbHRlcih1c2FnZSA9PiB1c2FnZS5leHRlbnNpb25JZCA9PT0gZXh0LmlkKTtcblx0XHRcdFx0Y29uc3QgbGFzdFVzZWQgPSBleHRlbnNpb25Vc2FnZXMubGVuZ3RoID4gMCA/IE1hdGgubWF4KC4uLmV4dGVuc2lvblVzYWdlcy5tYXAodSA9PiB1Lmxhc3RVc2VkKSkgOiB1bmRlZmluZWQ7XG5cblx0XHRcdFx0Ly8gQ2hlY2sgaWYgdHJ1c3RlZCB0aHJvdWdoIHRoZSBleHRlbnNpb24gcXVlcnlcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uUXVlcnkgPSBuZXcgQWNjb3VudEV4dGVuc2lvblF1ZXJ5KHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSwgZXh0LmlkLCB0aGlzLnF1ZXJ5U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHRydXN0ZWQgPSBleHRlbnNpb25RdWVyeS5pc1RydXN0ZWQoKTtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGlkOiBleHQuaWQsXG5cdFx0XHRcdFx0bmFtZTogZXh0Lm5hbWUsXG5cdFx0XHRcdFx0YWxsb3dlZDogZXh0LmFsbG93ZWQsXG5cdFx0XHRcdFx0bGFzdFVzZWQsXG5cdFx0XHRcdFx0dHJ1c3RlZFxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cdH1cblxuXHRhbGxvd0FjY2VzcyhleHRlbnNpb25JZHM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvQWxsb3cgPSBleHRlbnNpb25JZHMubWFwKGlkID0+ICh7IGlkLCBuYW1lOiBpZCwgYWxsb3dlZDogdHJ1ZSB9KSk7XG5cdFx0dGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRFeHRlbnNpb25zKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSwgZXh0ZW5zaW9uc1RvQWxsb3cpO1xuXHR9XG5cblx0cmVtb3ZlQWNjZXNzKGV4dGVuc2lvbklkczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRjb25zdCBleHRlbnNpb25zVG9SZW1vdmUgPSBleHRlbnNpb25JZHMubWFwKGlkID0+ICh7IGlkLCBuYW1lOiBpZCwgYWxsb3dlZDogZmFsc2UgfSkpO1xuXHRcdHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkRXh0ZW5zaW9ucyh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUsIGV4dGVuc2lvbnNUb1JlbW92ZSk7XG5cdH1cblxuXHRmb3JFYWNoKGNhbGxiYWNrOiAoZXh0ZW5zaW9uUXVlcnk6IElBY2NvdW50RXh0ZW5zaW9uUXVlcnkpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCB1c2FnZXMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvblVzYWdlU2VydmljZS5yZWFkQWNjb3VudFVzYWdlcyh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUpO1xuXHRcdGNvbnN0IGFsbG93ZWRFeHRlbnNpb25zID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnJlYWRBbGxvd2VkRXh0ZW5zaW9ucyh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUpO1xuXG5cdFx0Ly8gQ29tYmluZSBleHRlbnNpb25zIGZyb20gYm90aCB1c2FnZSBhbmQgYWNjZXNzIGRhdGFcblx0XHRjb25zdCBleHRlbnNpb25JZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR1c2FnZXMuZm9yRWFjaCh1c2FnZSA9PiBleHRlbnNpb25JZHMuYWRkKHVzYWdlLmV4dGVuc2lvbklkKSk7XG5cdFx0YWxsb3dlZEV4dGVuc2lvbnMuZm9yRWFjaChleHQgPT4gZXh0ZW5zaW9uSWRzLmFkZChleHQuaWQpKTtcblxuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uSWQgb2YgZXh0ZW5zaW9uSWRzKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25RdWVyeSA9IG5ldyBBY2NvdW50RXh0ZW5zaW9uUXVlcnkodGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lLCBleHRlbnNpb25JZCwgdGhpcy5xdWVyeVNlcnZpY2UpO1xuXHRcdFx0Y2FsbGJhY2soZXh0ZW5zaW9uUXVlcnkpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIEltcGxlbWVudGF0aW9uIG9mIGFjY291bnQtTUNQIHNlcnZlcnMgcXVlcnkgb3BlcmF0aW9uc1xuICovXG5jbGFzcyBBY2NvdW50TWNwU2VydmVyc1F1ZXJ5IGV4dGVuZHMgQmFzZVF1ZXJ5IGltcGxlbWVudHMgSUFjY291bnRNY3BTZXJ2ZXJzUXVlcnkge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm92aWRlcklkOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGFjY291bnROYW1lOiBzdHJpbmcsXG5cdFx0cXVlcnlTZXJ2aWNlOiBBdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihwcm92aWRlcklkLCBxdWVyeVNlcnZpY2UpO1xuXHR9XG5cblx0Z2V0QWxsb3dlZE1jcFNlcnZlcnMoKTogeyBpZDogc3RyaW5nOyBuYW1lOiBzdHJpbmc7IGFsbG93ZWQ/OiBib29sZWFuOyBsYXN0VXNlZD86IG51bWJlcjsgdHJ1c3RlZD86IGJvb2xlYW47IHVybD86IHN0cmluZzsgYWdlbnRIb3N0PzogeyBhdXRob3JpdHk6IHN0cmluZzsgbGFiZWw6IHN0cmluZyB9IH1bXSB7XG5cdFx0cmV0dXJuIHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZE1jcFNlcnZlcnModGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKVxuXHRcdFx0LmZpbHRlcihzZXJ2ZXIgPT4gc2VydmVyLmFsbG93ZWQgIT09IGZhbHNlKTtcblx0fVxuXG5cdGFsbG93QWNjZXNzKG1jcFNlcnZlcklkczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRjb25zdCBtY3BTZXJ2ZXJzVG9BbGxvdyA9IG1jcFNlcnZlcklkcy5tYXAoaWQgPT4gKHsgaWQsIG5hbWU6IGlkLCBhbGxvd2VkOiB0cnVlIH0pKTtcblx0XHR0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnModGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lLCBtY3BTZXJ2ZXJzVG9BbGxvdyk7XG5cdH1cblxuXHRyZW1vdmVBY2Nlc3MobWNwU2VydmVySWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGNvbnN0IG1jcFNlcnZlcnNUb1JlbW92ZSA9IG1jcFNlcnZlcklkcy5tYXAoaWQgPT4gKHsgaWQsIG5hbWU6IGlkLCBhbGxvd2VkOiBmYWxzZSB9KSk7XG5cdFx0dGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRNY3BTZXJ2ZXJzKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSwgbWNwU2VydmVyc1RvUmVtb3ZlKTtcblx0fVxuXG5cdGZvckVhY2goY2FsbGJhY2s6IChtY3BTZXJ2ZXJRdWVyeTogSUFjY291bnRNY3BTZXJ2ZXJRdWVyeSkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IHVzYWdlcyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLnJlYWRBY2NvdW50VXNhZ2VzKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSk7XG5cdFx0Y29uc3QgYWxsb3dlZE1jcFNlcnZlcnMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRNY3BTZXJ2ZXJzKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSk7XG5cblx0XHQvLyBDb21iaW5lIE1DUCBzZXJ2ZXJzIGZyb20gYm90aCB1c2FnZSBhbmQgYWNjZXNzIGRhdGFcblx0XHRjb25zdCBtY3BTZXJ2ZXJJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR1c2FnZXMuZm9yRWFjaCh1c2FnZSA9PiBtY3BTZXJ2ZXJJZHMuYWRkKHVzYWdlLm1jcFNlcnZlcklkKSk7XG5cdFx0YWxsb3dlZE1jcFNlcnZlcnMuZm9yRWFjaChzZXJ2ZXIgPT4gbWNwU2VydmVySWRzLmFkZChzZXJ2ZXIuaWQpKTtcblxuXHRcdGZvciAoY29uc3QgbWNwU2VydmVySWQgb2YgbWNwU2VydmVySWRzKSB7XG5cdFx0XHRjb25zdCBtY3BTZXJ2ZXJRdWVyeSA9IG5ldyBBY2NvdW50TWNwU2VydmVyUXVlcnkodGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lLCBtY3BTZXJ2ZXJJZCwgdGhpcy5xdWVyeVNlcnZpY2UpO1xuXHRcdFx0Y2FsbGJhY2sobWNwU2VydmVyUXVlcnkpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIEltcGxlbWVudGF0aW9uIG9mIGFjY291bnQtZW50aXRpZXMgcXVlcnkgb3BlcmF0aW9ucyBmb3IgdHlwZS1hZ25vc3RpYyBvcGVyYXRpb25zXG4gKi9cbmNsYXNzIEFjY291bnRFbnRpdGllc1F1ZXJ5IGV4dGVuZHMgQmFzZVF1ZXJ5IGltcGxlbWVudHMgSUFjY291bnRFbnRpdGllc1F1ZXJ5IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdmlkZXJJZDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBhY2NvdW50TmFtZTogc3RyaW5nLFxuXHRcdHF1ZXJ5U2VydmljZTogQXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIocHJvdmlkZXJJZCwgcXVlcnlTZXJ2aWNlKTtcblx0fVxuXG5cdGhhc0FueVVzYWdlKCk6IGJvb2xlYW4ge1xuXHRcdC8vIENoZWNrIGV4dGVuc2lvbiB1c2FnZVxuXHRcdGNvbnN0IGV4dGVuc2lvblVzYWdlcyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLnJlYWRBY2NvdW50VXNhZ2VzKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSk7XG5cdFx0aWYgKGV4dGVuc2lvblVzYWdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBNQ1Agc2VydmVyIHVzYWdlXG5cdFx0Y29uc3QgbWNwVXNhZ2VzID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UucmVhZEFjY291bnRVc2FnZXModGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKTtcblx0XHRpZiAobWNwVXNhZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGV4dGVuc2lvbiBhY2Nlc3Ncblx0XHRjb25zdCBhbGxvd2VkRXh0ZW5zaW9ucyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZEV4dGVuc2lvbnModGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKTtcblx0XHRpZiAoYWxsb3dlZEV4dGVuc2lvbnMuc29tZShleHQgPT4gZXh0LmFsbG93ZWQgIT09IGZhbHNlKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgTUNQIHNlcnZlciBhY2Nlc3Ncblx0XHRjb25zdCBhbGxvd2VkTWNwU2VydmVycyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZE1jcFNlcnZlcnModGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKTtcblx0XHRpZiAoYWxsb3dlZE1jcFNlcnZlcnMuc29tZShzZXJ2ZXIgPT4gc2VydmVyLmFsbG93ZWQgIT09IGZhbHNlKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Z2V0RW50aXR5Q291bnQoKTogeyBleHRlbnNpb25zOiBudW1iZXI7IG1jcFNlcnZlcnM6IG51bWJlcjsgdG90YWw6IG51bWJlciB9IHtcblx0XHQvLyBVc2UgdGhlIHNhbWUgbG9naWMgYXMgZ2V0QWxsRW50aXRpZXMgdG8gY291bnQgYWxsIGVudGl0aWVzIHdpdGggdXNhZ2Ugb3IgYWNjZXNzXG5cdFx0Y29uc3QgZXh0ZW5zaW9uVXNhZ2VzID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UucmVhZEFjY291bnRVc2FnZXModGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKTtcblx0XHRjb25zdCBhbGxvd2VkRXh0ZW5zaW9ucyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZEV4dGVuc2lvbnModGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKS5maWx0ZXIoZXh0ID0+IGV4dC5hbGxvd2VkKTtcblx0XHRjb25zdCBleHRlbnNpb25JZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRleHRlbnNpb25Vc2FnZXMuZm9yRWFjaCh1c2FnZSA9PiBleHRlbnNpb25JZHMuYWRkKHVzYWdlLmV4dGVuc2lvbklkKSk7XG5cdFx0YWxsb3dlZEV4dGVuc2lvbnMuZm9yRWFjaChleHQgPT4gZXh0ZW5zaW9uSWRzLmFkZChleHQuaWQpKTtcblxuXHRcdGNvbnN0IG1jcFVzYWdlcyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLnJlYWRBY2NvdW50VXNhZ2VzKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSk7XG5cdFx0Y29uc3QgYWxsb3dlZE1jcFNlcnZlcnMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRNY3BTZXJ2ZXJzKHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSkuZmlsdGVyKHNlcnZlciA9PiBzZXJ2ZXIuYWxsb3dlZCk7XG5cdFx0Y29uc3QgbWNwU2VydmVySWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0bWNwVXNhZ2VzLmZvckVhY2godXNhZ2UgPT4gbWNwU2VydmVySWRzLmFkZCh1c2FnZS5tY3BTZXJ2ZXJJZCkpO1xuXHRcdGFsbG93ZWRNY3BTZXJ2ZXJzLmZvckVhY2goc2VydmVyID0+IG1jcFNlcnZlcklkcy5hZGQoc2VydmVyLmlkKSk7XG5cblx0XHRjb25zdCBleHRlbnNpb25Db3VudCA9IGV4dGVuc2lvbklkcy5zaXplO1xuXHRcdGNvbnN0IG1jcFNlcnZlckNvdW50ID0gbWNwU2VydmVySWRzLnNpemU7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZXh0ZW5zaW9uczogZXh0ZW5zaW9uQ291bnQsXG5cdFx0XHRtY3BTZXJ2ZXJzOiBtY3BTZXJ2ZXJDb3VudCxcblx0XHRcdHRvdGFsOiBleHRlbnNpb25Db3VudCArIG1jcFNlcnZlckNvdW50XG5cdFx0fTtcblx0fVxuXG5cdHJlbW92ZUFsbEFjY2VzcygpOiB2b2lkIHtcblx0XHQvLyBSZW1vdmUgYWxsIGV4dGVuc2lvbiBhY2Nlc3Ncblx0XHRjb25zdCBleHRlbnNpb25zUXVlcnkgPSBuZXcgQWNjb3VudEV4dGVuc2lvbnNRdWVyeSh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUsIHRoaXMucXVlcnlTZXJ2aWNlKTtcblx0XHRjb25zdCBleHRlbnNpb25zID0gZXh0ZW5zaW9uc1F1ZXJ5LmdldEFsbG93ZWRFeHRlbnNpb25zKCk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWRzID0gZXh0ZW5zaW9ucy5tYXAoZXh0ID0+IGV4dC5pZCk7XG5cdFx0aWYgKGV4dGVuc2lvbklkcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRleHRlbnNpb25zUXVlcnkucmVtb3ZlQWNjZXNzKGV4dGVuc2lvbklkcyk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIGFsbCBNQ1Agc2VydmVyIGFjY2Vzc1xuXHRcdGNvbnN0IG1jcFNlcnZlcnNRdWVyeSA9IG5ldyBBY2NvdW50TWNwU2VydmVyc1F1ZXJ5KHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSwgdGhpcy5xdWVyeVNlcnZpY2UpO1xuXHRcdGNvbnN0IG1jcFNlcnZlcnMgPSBtY3BTZXJ2ZXJzUXVlcnkuZ2V0QWxsb3dlZE1jcFNlcnZlcnMoKTtcblx0XHRjb25zdCBtY3BTZXJ2ZXJJZHMgPSBtY3BTZXJ2ZXJzLm1hcChzZXJ2ZXIgPT4gc2VydmVyLmlkKTtcblx0XHRpZiAobWNwU2VydmVySWRzLmxlbmd0aCA+IDApIHtcblx0XHRcdG1jcFNlcnZlcnNRdWVyeS5yZW1vdmVBY2Nlc3MobWNwU2VydmVySWRzKTtcblx0XHR9XG5cdH1cblxuXHRmb3JFYWNoKGNhbGxiYWNrOiAoZW50aXR5SWQ6IHN0cmluZywgZW50aXR5VHlwZTogJ2V4dGVuc2lvbicgfCAnbWNwU2VydmVyJykgPT4gdm9pZCk6IHZvaWQge1xuXHRcdC8vIEl0ZXJhdGUgb3ZlciBleHRlbnNpb25zXG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1F1ZXJ5ID0gbmV3IEFjY291bnRFeHRlbnNpb25zUXVlcnkodGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lLCB0aGlzLnF1ZXJ5U2VydmljZSk7XG5cdFx0ZXh0ZW5zaW9uc1F1ZXJ5LmZvckVhY2goZXh0ZW5zaW9uUXVlcnkgPT4ge1xuXHRcdFx0Y2FsbGJhY2soZXh0ZW5zaW9uUXVlcnkuZXh0ZW5zaW9uSWQsICdleHRlbnNpb24nKTtcblx0XHR9KTtcblxuXHRcdC8vIEl0ZXJhdGUgb3ZlciBNQ1Agc2VydmVyc1xuXHRcdGNvbnN0IG1jcFNlcnZlcnNRdWVyeSA9IG5ldyBBY2NvdW50TWNwU2VydmVyc1F1ZXJ5KHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSwgdGhpcy5xdWVyeVNlcnZpY2UpO1xuXHRcdG1jcFNlcnZlcnNRdWVyeS5mb3JFYWNoKG1jcFNlcnZlclF1ZXJ5ID0+IHtcblx0XHRcdGNhbGxiYWNrKG1jcFNlcnZlclF1ZXJ5Lm1jcFNlcnZlcklkLCAnbWNwU2VydmVyJyk7XG5cdFx0fSk7XG5cdH1cbn1cblxuLyoqXG4gKiBJbXBsZW1lbnRhdGlvbiBvZiBhY2NvdW50IHF1ZXJ5IG9wZXJhdGlvbnNcbiAqL1xuY2xhc3MgQWNjb3VudFF1ZXJ5IGV4dGVuZHMgQmFzZVF1ZXJ5IGltcGxlbWVudHMgSUFjY291bnRRdWVyeSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3ZpZGVySWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgYWNjb3VudE5hbWU6IHN0cmluZyxcblx0XHRxdWVyeVNlcnZpY2U6IEF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHByb3ZpZGVySWQsIHF1ZXJ5U2VydmljZSk7XG5cdH1cblxuXHRleHRlbnNpb24oZXh0ZW5zaW9uSWQ6IHN0cmluZyk6IElBY2NvdW50RXh0ZW5zaW9uUXVlcnkge1xuXHRcdHJldHVybiBuZXcgQWNjb3VudEV4dGVuc2lvblF1ZXJ5KHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSwgZXh0ZW5zaW9uSWQsIHRoaXMucXVlcnlTZXJ2aWNlKTtcblx0fVxuXG5cdG1jcFNlcnZlcihtY3BTZXJ2ZXJJZDogc3RyaW5nKTogSUFjY291bnRNY3BTZXJ2ZXJRdWVyeSB7XG5cdFx0cmV0dXJuIG5ldyBBY2NvdW50TWNwU2VydmVyUXVlcnkodGhpcy5wcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lLCBtY3BTZXJ2ZXJJZCwgdGhpcy5xdWVyeVNlcnZpY2UpO1xuXHR9XG5cblx0ZXh0ZW5zaW9ucygpOiBJQWNjb3VudEV4dGVuc2lvbnNRdWVyeSB7XG5cdFx0cmV0dXJuIG5ldyBBY2NvdW50RXh0ZW5zaW9uc1F1ZXJ5KHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSwgdGhpcy5xdWVyeVNlcnZpY2UpO1xuXHR9XG5cblx0bWNwU2VydmVycygpOiBJQWNjb3VudE1jcFNlcnZlcnNRdWVyeSB7XG5cdFx0cmV0dXJuIG5ldyBBY2NvdW50TWNwU2VydmVyc1F1ZXJ5KHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSwgdGhpcy5xdWVyeVNlcnZpY2UpO1xuXHR9XG5cblx0ZW50aXRpZXMoKTogSUFjY291bnRFbnRpdGllc1F1ZXJ5IHtcblx0XHRyZXR1cm4gbmV3IEFjY291bnRFbnRpdGllc1F1ZXJ5KHRoaXMucHJvdmlkZXJJZCwgdGhpcy5hY2NvdW50TmFtZSwgdGhpcy5xdWVyeVNlcnZpY2UpO1xuXHR9XG5cblx0cmVtb3ZlKCk6IHZvaWQge1xuXHRcdC8vIFJlbW92ZSBhbGwgZXh0ZW5zaW9uIGFjY2VzcyBhbmQgdXNhZ2UgZGF0YVxuXHRcdHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5yZW1vdmVBbGxvd2VkRXh0ZW5zaW9ucyh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUpO1xuXHRcdHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLnJlbW92ZUFjY291bnRVc2FnZSh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUpO1xuXG5cdFx0Ly8gUmVtb3ZlIGFsbCBNQ1Agc2VydmVyIGFjY2VzcyBhbmQgdXNhZ2UgZGF0YVxuXHRcdHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5yZW1vdmVBbGxvd2VkTWNwU2VydmVycyh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUpO1xuXHRcdHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLnJlbW92ZUFjY291bnRVc2FnZSh0aGlzLnByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUpO1xuXHR9XG59XG5cbi8qKlxuICogSW1wbGVtZW50YXRpb24gb2YgcHJvdmlkZXItZXh0ZW5zaW9uIHF1ZXJ5IG9wZXJhdGlvbnNcbiAqL1xuY2xhc3MgUHJvdmlkZXJFeHRlbnNpb25RdWVyeSBleHRlbmRzIEJhc2VRdWVyeSBpbXBsZW1lbnRzIElQcm92aWRlckV4dGVuc2lvblF1ZXJ5IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdmlkZXJJZDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBleHRlbnNpb25JZDogc3RyaW5nLFxuXHRcdHF1ZXJ5U2VydmljZTogQXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIocHJvdmlkZXJJZCwgcXVlcnlTZXJ2aWNlKTtcblx0fVxuXG5cdGdldFByZWZlcnJlZEFjY291bnQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZS5nZXRBY2NvdW50UHJlZmVyZW5jZSh0aGlzLmV4dGVuc2lvbklkLCB0aGlzLnByb3ZpZGVySWQpO1xuXHR9XG5cblx0c2V0UHJlZmVycmVkQWNjb3VudChhY2NvdW50OiBBdXRoZW50aWNhdGlvblNlc3Npb25BY2NvdW50KTogdm9pZCB7XG5cdFx0dGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZS51cGRhdGVBY2NvdW50UHJlZmVyZW5jZSh0aGlzLmV4dGVuc2lvbklkLCB0aGlzLnByb3ZpZGVySWQsIGFjY291bnQpO1xuXHR9XG5cblx0cmVtb3ZlQWNjb3VudFByZWZlcmVuY2UoKTogdm9pZCB7XG5cdFx0dGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZS5yZW1vdmVBY2NvdW50UHJlZmVyZW5jZSh0aGlzLmV4dGVuc2lvbklkLCB0aGlzLnByb3ZpZGVySWQpO1xuXHR9XG59XG5cbi8qKlxuICogSW1wbGVtZW50YXRpb24gb2YgcHJvdmlkZXItTUNQIHNlcnZlciBxdWVyeSBvcGVyYXRpb25zXG4gKi9cbmNsYXNzIFByb3ZpZGVyTWNwU2VydmVyUXVlcnkgZXh0ZW5kcyBCYXNlUXVlcnkgaW1wbGVtZW50cyBJUHJvdmlkZXJNY3BTZXJ2ZXJRdWVyeSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3ZpZGVySWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbWNwU2VydmVySWQ6IHN0cmluZyxcblx0XHRxdWVyeVNlcnZpY2U6IEF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHByb3ZpZGVySWQsIHF1ZXJ5U2VydmljZSk7XG5cdH1cblxuXHRhc3luYyBnZXRMYXN0VXNlZEFjY291bnQoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYWNjb3VudHMgPSBhd2FpdCB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0QWNjb3VudHModGhpcy5wcm92aWRlcklkKTtcblx0XHRcdGxldCBsYXN0VXNlZEFjY291bnQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBsYXN0VXNlZFRpbWUgPSAwO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGFjY291bnQgb2YgYWNjb3VudHMpIHtcblx0XHRcdFx0Y29uc3QgdXNhZ2VzID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UucmVhZEFjY291bnRVc2FnZXModGhpcy5wcm92aWRlcklkLCBhY2NvdW50LmxhYmVsKTtcblx0XHRcdFx0Y29uc3QgbWNwU2VydmVyVXNhZ2VzID0gdXNhZ2VzLmZpbHRlcih1c2FnZSA9PiB1c2FnZS5tY3BTZXJ2ZXJJZCA9PT0gdGhpcy5tY3BTZXJ2ZXJJZCk7XG5cblx0XHRcdFx0Zm9yIChjb25zdCB1c2FnZSBvZiBtY3BTZXJ2ZXJVc2FnZXMpIHtcblx0XHRcdFx0XHRpZiAodXNhZ2UubGFzdFVzZWQgPiBsYXN0VXNlZFRpbWUpIHtcblx0XHRcdFx0XHRcdGxhc3RVc2VkVGltZSA9IHVzYWdlLmxhc3RVc2VkO1xuXHRcdFx0XHRcdFx0bGFzdFVzZWRBY2NvdW50ID0gYWNjb3VudC5sYWJlbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGxhc3RVc2VkQWNjb3VudDtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0Z2V0UHJlZmVycmVkQWNjb3VudCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UuZ2V0QWNjb3VudFByZWZlcmVuY2UodGhpcy5tY3BTZXJ2ZXJJZCwgdGhpcy5wcm92aWRlcklkKTtcblx0fVxuXG5cdHNldFByZWZlcnJlZEFjY291bnQoYWNjb3VudDogQXV0aGVudGljYXRpb25TZXNzaW9uQWNjb3VudCk6IHZvaWQge1xuXHRcdHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uTWNwU2VydmljZS51cGRhdGVBY2NvdW50UHJlZmVyZW5jZSh0aGlzLm1jcFNlcnZlcklkLCB0aGlzLnByb3ZpZGVySWQsIGFjY291bnQpO1xuXHR9XG5cblx0cmVtb3ZlQWNjb3VudFByZWZlcmVuY2UoKTogdm9pZCB7XG5cdFx0dGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLnJlbW92ZUFjY291bnRQcmVmZXJlbmNlKHRoaXMubWNwU2VydmVySWQsIHRoaXMucHJvdmlkZXJJZCk7XG5cdH1cblxuXHRhc3luYyBnZXRVc2VkQWNjb3VudHMoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhY2NvdW50cyA9IGF3YWl0IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRBY2NvdW50cyh0aGlzLnByb3ZpZGVySWQpO1xuXHRcdFx0Y29uc3QgdXNlZEFjY291bnRzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGFjY291bnQgb2YgYWNjb3VudHMpIHtcblx0XHRcdFx0Y29uc3QgdXNhZ2VzID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UucmVhZEFjY291bnRVc2FnZXModGhpcy5wcm92aWRlcklkLCBhY2NvdW50LmxhYmVsKTtcblx0XHRcdFx0aWYgKHVzYWdlcy5zb21lKHVzYWdlID0+IHVzYWdlLm1jcFNlcnZlcklkID09PSB0aGlzLm1jcFNlcnZlcklkKSkge1xuXHRcdFx0XHRcdHVzZWRBY2NvdW50cy5wdXNoKGFjY291bnQubGFiZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB1c2VkQWNjb3VudHM7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogSW1wbGVtZW50YXRpb24gb2YgcHJvdmlkZXIgcXVlcnkgb3BlcmF0aW9uc1xuICovXG5jbGFzcyBQcm92aWRlclF1ZXJ5IGV4dGVuZHMgQmFzZVF1ZXJ5IGltcGxlbWVudHMgSVByb3ZpZGVyUXVlcnkge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm92aWRlcklkOiBzdHJpbmcsXG5cdFx0cXVlcnlTZXJ2aWNlOiBBdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihwcm92aWRlcklkLCBxdWVyeVNlcnZpY2UpO1xuXHR9XG5cblx0YWNjb3VudChhY2NvdW50TmFtZTogc3RyaW5nKTogSUFjY291bnRRdWVyeSB7XG5cdFx0cmV0dXJuIG5ldyBBY2NvdW50UXVlcnkodGhpcy5wcm92aWRlcklkLCBhY2NvdW50TmFtZSwgdGhpcy5xdWVyeVNlcnZpY2UpO1xuXHR9XG5cblx0ZXh0ZW5zaW9uKGV4dGVuc2lvbklkOiBzdHJpbmcpOiBJUHJvdmlkZXJFeHRlbnNpb25RdWVyeSB7XG5cdFx0cmV0dXJuIG5ldyBQcm92aWRlckV4dGVuc2lvblF1ZXJ5KHRoaXMucHJvdmlkZXJJZCwgZXh0ZW5zaW9uSWQsIHRoaXMucXVlcnlTZXJ2aWNlKTtcblx0fVxuXG5cdG1jcFNlcnZlcihtY3BTZXJ2ZXJJZDogc3RyaW5nKTogSVByb3ZpZGVyTWNwU2VydmVyUXVlcnkge1xuXHRcdHJldHVybiBuZXcgUHJvdmlkZXJNY3BTZXJ2ZXJRdWVyeSh0aGlzLnByb3ZpZGVySWQsIG1jcFNlcnZlcklkLCB0aGlzLnF1ZXJ5U2VydmljZSk7XG5cdH1cblxuXHRhc3luYyBnZXRBY3RpdmVFbnRpdGllcygpOiBQcm9taXNlPElBY3RpdmVFbnRpdGllcz4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgbWNwU2VydmVyczogc3RyaW5nW10gPSBbXTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhY2NvdW50cyA9IGF3YWl0IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRBY2NvdW50cyh0aGlzLnByb3ZpZGVySWQpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGFjY291bnQgb2YgYWNjb3VudHMpIHtcblx0XHRcdFx0Ly8gR2V0IGV4dGVuc2lvbiB1c2FnZXNcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uVXNhZ2VzID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UucmVhZEFjY291bnRVc2FnZXModGhpcy5wcm92aWRlcklkLCBhY2NvdW50LmxhYmVsKTtcblx0XHRcdFx0Zm9yIChjb25zdCB1c2FnZSBvZiBleHRlbnNpb25Vc2FnZXMpIHtcblx0XHRcdFx0XHRpZiAoIWV4dGVuc2lvbnMuaW5jbHVkZXModXNhZ2UuZXh0ZW5zaW9uSWQpKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb25zLnB1c2godXNhZ2UuZXh0ZW5zaW9uSWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEdldCBNQ1Agc2VydmVyIHVzYWdlc1xuXHRcdFx0XHRjb25zdCBtY3BVc2FnZXMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZS5yZWFkQWNjb3VudFVzYWdlcyh0aGlzLnByb3ZpZGVySWQsIGFjY291bnQubGFiZWwpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHVzYWdlIG9mIG1jcFVzYWdlcykge1xuXHRcdFx0XHRcdGlmICghbWNwU2VydmVycy5pbmNsdWRlcyh1c2FnZS5tY3BTZXJ2ZXJJZCkpIHtcblx0XHRcdFx0XHRcdG1jcFNlcnZlcnMucHVzaCh1c2FnZS5tY3BTZXJ2ZXJJZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBSZXR1cm4gZW1wdHkgYXJyYXlzIGlmIHRoZXJlJ3MgYW4gZXJyb3Jcblx0XHR9XG5cblx0XHRyZXR1cm4geyBleHRlbnNpb25zLCBtY3BTZXJ2ZXJzIH07XG5cdH1cblxuXHRhc3luYyBnZXRBY2NvdW50TmFtZXMoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhY2NvdW50cyA9IGF3YWl0IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRBY2NvdW50cyh0aGlzLnByb3ZpZGVySWQpO1xuXHRcdFx0cmV0dXJuIGFjY291bnRzLm1hcChhY2NvdW50ID0+IGFjY291bnQubGFiZWwpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldFVzYWdlU3RhdHMoKTogUHJvbWlzZTxJQXV0aGVudGljYXRpb25Vc2FnZVN0YXRzPiB7XG5cdFx0Y29uc3QgcmVjZW50QWN0aXZpdHk6IHsgYWNjb3VudE5hbWU6IHN0cmluZzsgbGFzdFVzZWQ6IG51bWJlcjsgdXNhZ2VDb3VudDogbnVtYmVyIH1bXSA9IFtdO1xuXHRcdGxldCB0b3RhbFNlc3Npb25zID0gMDtcblx0XHRsZXQgdG90YWxBY2NvdW50cyA9IDA7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYWNjb3VudHMgPSBhd2FpdCB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0QWNjb3VudHModGhpcy5wcm92aWRlcklkKTtcblx0XHRcdHRvdGFsQWNjb3VudHMgPSBhY2NvdW50cy5sZW5ndGg7XG5cblx0XHRcdGZvciAoY29uc3QgYWNjb3VudCBvZiBhY2NvdW50cykge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25Vc2FnZXMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvblVzYWdlU2VydmljZS5yZWFkQWNjb3VudFVzYWdlcyh0aGlzLnByb3ZpZGVySWQsIGFjY291bnQubGFiZWwpO1xuXHRcdFx0XHRjb25zdCBtY3BVc2FnZXMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZS5yZWFkQWNjb3VudFVzYWdlcyh0aGlzLnByb3ZpZGVySWQsIGFjY291bnQubGFiZWwpO1xuXG5cdFx0XHRcdGNvbnN0IGFsbFVzYWdlcyA9IFsuLi5leHRlbnNpb25Vc2FnZXMsIC4uLm1jcFVzYWdlc107XG5cdFx0XHRcdGNvbnN0IHVzYWdlQ291bnQgPSBhbGxVc2FnZXMubGVuZ3RoO1xuXHRcdFx0XHRjb25zdCBsYXN0VXNlZCA9IE1hdGgubWF4KC4uLmFsbFVzYWdlcy5tYXAodSA9PiB1Lmxhc3RVc2VkKSwgMCk7XG5cblx0XHRcdFx0aWYgKHVzYWdlQ291bnQgPiAwKSB7XG5cdFx0XHRcdFx0cmVjZW50QWN0aXZpdHkucHVzaCh7IGFjY291bnROYW1lOiBhY2NvdW50LmxhYmVsLCBsYXN0VXNlZCwgdXNhZ2VDb3VudCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBTb3J0IGJ5IG1vc3QgcmVjZW50IGFjdGl2aXR5XG5cdFx0XHRyZWNlbnRBY3Rpdml0eS5zb3J0KChhLCBiKSA9PiBiLmxhc3RVc2VkIC0gYS5sYXN0VXNlZCk7XG5cblx0XHRcdC8vIENvdW50IHRvdGFsIHNlc3Npb25zIChhcHByb3hpbWF0ZSlcblx0XHRcdHRvdGFsU2Vzc2lvbnMgPSByZWNlbnRBY3Rpdml0eS5yZWR1Y2UoKHN1bSwgYWN0aXZpdHkpID0+IHN1bSArIGFjdGl2aXR5LnVzYWdlQ291bnQsIDApO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gUmV0dXJuIGRlZmF1bHQgc3RhdHMgaWYgdGhlcmUncyBhbiBlcnJvclxuXHRcdH1cblxuXHRcdHJldHVybiB7IHRvdGFsU2Vzc2lvbnMsIHRvdGFsQWNjb3VudHMsIHJlY2VudEFjdGl2aXR5IH07XG5cdH1cblxuXHRhc3luYyBmb3JFYWNoQWNjb3VudChjYWxsYmFjazogKGFjY291bnRRdWVyeTogSUFjY291bnRRdWVyeSkgPT4gdm9pZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhY2NvdW50cyA9IGF3YWl0IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRBY2NvdW50cyh0aGlzLnByb3ZpZGVySWQpO1xuXHRcdFx0Zm9yIChjb25zdCBhY2NvdW50IG9mIGFjY291bnRzKSB7XG5cdFx0XHRcdGNvbnN0IGFjY291bnRRdWVyeSA9IG5ldyBBY2NvdW50UXVlcnkodGhpcy5wcm92aWRlcklkLCBhY2NvdW50LmxhYmVsLCB0aGlzLnF1ZXJ5U2VydmljZSk7XG5cdFx0XHRcdGNhbGxiYWNrKGFjY291bnRRdWVyeSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBTaWxlbnRseSBoYW5kbGUgZXJyb3JzIGluIGVudW1lcmF0aW9uXG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogSW1wbGVtZW50YXRpb24gb2YgZXh0ZW5zaW9uIHF1ZXJ5IG9wZXJhdGlvbnMgKGNyb3NzLXByb3ZpZGVyKVxuICovXG5jbGFzcyBFeHRlbnNpb25RdWVyeSBpbXBsZW1lbnRzIElFeHRlbnNpb25RdWVyeSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBleHRlbnNpb25JZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcXVlcnlTZXJ2aWNlOiBBdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZVxuXHQpIHsgfVxuXG5cdGFzeW5jIGdldFByb3ZpZGVyc1dpdGhBY2Nlc3MoaW5jbHVkZUludGVybmFsPzogYm9vbGVhbik6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCBwcm92aWRlcnNXaXRoQWNjZXNzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHByb3ZpZGVySWRzID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVySWRzKCk7XG5cblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVySWQgb2YgcHJvdmlkZXJJZHMpIHtcblx0XHRcdC8vIFNraXAgaW50ZXJuYWwgcHJvdmlkZXJzIHVubGVzcyBleHBsaWNpdGx5IHJlcXVlc3RlZFxuXHRcdFx0aWYgKCFpbmNsdWRlSW50ZXJuYWwgJiYgcHJvdmlkZXJJZC5zdGFydHNXaXRoKElOVEVSTkFMX0FVVEhfUFJPVklERVJfUFJFRklYKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgYWNjb3VudHMgPSBhd2FpdCB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0QWNjb3VudHMocHJvdmlkZXJJZCk7XG5cdFx0XHRcdGNvbnN0IGhhc0FjY2VzcyA9IGFjY291bnRzLnNvbWUoYWNjb3VudCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgYWNjZXNzQWxsb3dlZCA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWQocHJvdmlkZXJJZCwgYWNjb3VudC5sYWJlbCwgdGhpcy5leHRlbnNpb25JZCk7XG5cdFx0XHRcdFx0cmV0dXJuIGFjY2Vzc0FsbG93ZWQgPT09IHRydWU7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmIChoYXNBY2Nlc3MpIHtcblx0XHRcdFx0XHRwcm92aWRlcnNXaXRoQWNjZXNzLnB1c2gocHJvdmlkZXJJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBTa2lwIHByb3ZpZGVycyB0aGF0IGVycm9yXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb3ZpZGVyc1dpdGhBY2Nlc3M7XG5cdH1cblxuXHRnZXRBbGxBY2NvdW50UHJlZmVyZW5jZXMoaW5jbHVkZUludGVybmFsPzogYm9vbGVhbik6IE1hcDxzdHJpbmcsIHN0cmluZz4ge1xuXHRcdGNvbnN0IHByZWZlcmVuY2VzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRjb25zdCBwcm92aWRlcklkcyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRQcm92aWRlcklkcygpO1xuXG5cdFx0Zm9yIChjb25zdCBwcm92aWRlcklkIG9mIHByb3ZpZGVySWRzKSB7XG5cdFx0XHQvLyBTa2lwIGludGVybmFsIHByb3ZpZGVycyB1bmxlc3MgZXhwbGljaXRseSByZXF1ZXN0ZWRcblx0XHRcdGlmICghaW5jbHVkZUludGVybmFsICYmIHByb3ZpZGVySWQuc3RhcnRzV2l0aChJTlRFUk5BTF9BVVRIX1BST1ZJREVSX1BSRUZJWCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHByZWZlcnJlZEFjY291bnQgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLmdldEFjY291bnRQcmVmZXJlbmNlKHRoaXMuZXh0ZW5zaW9uSWQsIHByb3ZpZGVySWQpO1xuXHRcdFx0aWYgKHByZWZlcnJlZEFjY291bnQpIHtcblx0XHRcdFx0cHJlZmVyZW5jZXMuc2V0KHByb3ZpZGVySWQsIHByZWZlcnJlZEFjY291bnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBwcmVmZXJlbmNlcztcblx0fVxuXG5cdHByb3ZpZGVyKHByb3ZpZGVySWQ6IHN0cmluZyk6IElQcm92aWRlckV4dGVuc2lvblF1ZXJ5IHtcblx0XHRyZXR1cm4gbmV3IFByb3ZpZGVyRXh0ZW5zaW9uUXVlcnkocHJvdmlkZXJJZCwgdGhpcy5leHRlbnNpb25JZCwgdGhpcy5xdWVyeVNlcnZpY2UpO1xuXHR9XG59XG5cbi8qKlxuICogSW1wbGVtZW50YXRpb24gb2YgTUNQIHNlcnZlciBxdWVyeSBvcGVyYXRpb25zIChjcm9zcy1wcm92aWRlcilcbiAqL1xuY2xhc3MgTWNwU2VydmVyUXVlcnkgaW1wbGVtZW50cyBJTWNwU2VydmVyUXVlcnkge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbWNwU2VydmVySWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHF1ZXJ5U2VydmljZTogQXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2Vcblx0KSB7IH1cblxuXHRhc3luYyBnZXRQcm92aWRlcnNXaXRoQWNjZXNzKGluY2x1ZGVJbnRlcm5hbD86IGJvb2xlYW4pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXJzV2l0aEFjY2Vzczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwcm92aWRlcklkcyA9IHRoaXMucXVlcnlTZXJ2aWNlLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRQcm92aWRlcklkcygpO1xuXG5cdFx0Zm9yIChjb25zdCBwcm92aWRlcklkIG9mIHByb3ZpZGVySWRzKSB7XG5cdFx0XHQvLyBTa2lwIGludGVybmFsIHByb3ZpZGVycyB1bmxlc3MgZXhwbGljaXRseSByZXF1ZXN0ZWRcblx0XHRcdGlmICghaW5jbHVkZUludGVybmFsICYmIHByb3ZpZGVySWQuc3RhcnRzV2l0aChJTlRFUk5BTF9BVVRIX1BST1ZJREVSX1BSRUZJWCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGFjY291bnRzID0gYXdhaXQgdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldEFjY291bnRzKHByb3ZpZGVySWQpO1xuXHRcdFx0XHRjb25zdCBoYXNBY2Nlc3MgPSBhY2NvdW50cy5zb21lKGFjY291bnQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGFjY2Vzc0FsbG93ZWQgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkKHByb3ZpZGVySWQsIGFjY291bnQubGFiZWwsIHRoaXMubWNwU2VydmVySWQpO1xuXHRcdFx0XHRcdHJldHVybiBhY2Nlc3NBbGxvd2VkID09PSB0cnVlO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAoaGFzQWNjZXNzKSB7XG5cdFx0XHRcdFx0cHJvdmlkZXJzV2l0aEFjY2Vzcy5wdXNoKHByb3ZpZGVySWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gU2tpcCBwcm92aWRlcnMgdGhhdCBlcnJvclxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBwcm92aWRlcnNXaXRoQWNjZXNzO1xuXHR9XG5cblx0Z2V0QWxsQWNjb3VudFByZWZlcmVuY2VzKGluY2x1ZGVJbnRlcm5hbD86IGJvb2xlYW4pOiBNYXA8c3RyaW5nLCBzdHJpbmc+IHtcblx0XHRjb25zdCBwcmVmZXJlbmNlcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3QgcHJvdmlkZXJJZHMgPSB0aGlzLnF1ZXJ5U2VydmljZS5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXJJZHMoKTtcblxuXHRcdGZvciAoY29uc3QgcHJvdmlkZXJJZCBvZiBwcm92aWRlcklkcykge1xuXHRcdFx0Ly8gU2tpcCBpbnRlcm5hbCBwcm92aWRlcnMgdW5sZXNzIGV4cGxpY2l0bHkgcmVxdWVzdGVkXG5cdFx0XHRpZiAoIWluY2x1ZGVJbnRlcm5hbCAmJiBwcm92aWRlcklkLnN0YXJ0c1dpdGgoSU5URVJOQUxfQVVUSF9QUk9WSURFUl9QUkVGSVgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcmVmZXJyZWRBY2NvdW50ID0gdGhpcy5xdWVyeVNlcnZpY2UuYXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLmdldEFjY291bnRQcmVmZXJlbmNlKHRoaXMubWNwU2VydmVySWQsIHByb3ZpZGVySWQpO1xuXHRcdFx0aWYgKHByZWZlcnJlZEFjY291bnQpIHtcblx0XHRcdFx0cHJlZmVyZW5jZXMuc2V0KHByb3ZpZGVySWQsIHByZWZlcnJlZEFjY291bnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBwcmVmZXJlbmNlcztcblx0fVxuXG5cdHByb3ZpZGVyKHByb3ZpZGVySWQ6IHN0cmluZyk6IElQcm92aWRlck1jcFNlcnZlclF1ZXJ5IHtcblx0XHRyZXR1cm4gbmV3IFByb3ZpZGVyTWNwU2VydmVyUXVlcnkocHJvdmlkZXJJZCwgdGhpcy5tY3BTZXJ2ZXJJZCwgdGhpcy5xdWVyeVNlcnZpY2UpO1xuXHR9XG59XG5cbi8qKlxuICogTWFpbiBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgYXV0aGVudGljYXRpb24gcXVlcnkgc2VydmljZVxuICovXG5leHBvcnQgY2xhc3MgQXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQcmVmZXJlbmNlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHtcblx0XHRyZWFkb25seSBwcm92aWRlcklkOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgZW50aXR5VHlwZTogJ2V4dGVuc2lvbicgfCAnbWNwU2VydmVyJztcblx0XHRyZWFkb25seSBlbnRpdHlJZHM6IHN0cmluZ1tdO1xuXHR9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQcmVmZXJlbmNlcyA9IHRoaXMuX29uRGlkQ2hhbmdlUHJlZmVyZW5jZXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY2Nlc3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7XG5cdFx0cmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGFjY291bnROYW1lOiBzdHJpbmc7XG5cdH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjY2VzcyA9IHRoaXMuX29uRGlkQ2hhbmdlQWNjZXNzLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHB1YmxpYyByZWFkb25seSBhdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblVzYWdlU2VydmljZSBwdWJsaWMgcmVhZG9ubHkgYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2U6IElBdXRoZW50aWNhdGlvblVzYWdlU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlIHB1YmxpYyByZWFkb25seSBhdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZTogSUF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlIHB1YmxpYyByZWFkb25seSBhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2U6IElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UgcHVibGljIHJlYWRvbmx5IGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZTogSUF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UgcHVibGljIHJlYWRvbmx5IGF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2U6IElBdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25NY3BTZXJ2aWNlIHB1YmxpYyByZWFkb25seSBhdXRoZW50aWNhdGlvbk1jcFNlcnZpY2U6IElBdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHB1YmxpYyByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gRm9yd2FyZCBldmVudHMgZnJvbSB1bmRlcmx5aW5nIHNlcnZpY2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlQWNjb3VudFByZWZlcmVuY2UoZSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVByZWZlcmVuY2VzLmZpcmUoe1xuXHRcdFx0XHRwcm92aWRlcklkOiBlLnByb3ZpZGVySWQsXG5cdFx0XHRcdGVudGl0eVR5cGU6ICdleHRlbnNpb24nLFxuXHRcdFx0XHRlbnRpdHlJZHM6IGUuZXh0ZW5zaW9uSWRzXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmF1dGhlbnRpY2F0aW9uTWNwU2VydmljZS5vbkRpZENoYW5nZUFjY291bnRQcmVmZXJlbmNlKGUgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQcmVmZXJlbmNlcy5maXJlKHtcblx0XHRcdFx0cHJvdmlkZXJJZDogZS5wcm92aWRlcklkLFxuXHRcdFx0XHRlbnRpdHlUeXBlOiAnbWNwU2VydmVyJyxcblx0XHRcdFx0ZW50aXR5SWRzOiBlLm1jcFNlcnZlcklkc1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25TZXNzaW9uQWNjZXNzKGUgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY2Nlc3MuZmlyZSh7XG5cdFx0XHRcdHByb3ZpZGVySWQ6IGUucHJvdmlkZXJJZCxcblx0XHRcdFx0YWNjb3VudE5hbWU6IGUuYWNjb3VudE5hbWVcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLm9uRGlkQ2hhbmdlTWNwU2Vzc2lvbkFjY2VzcyhlID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWNjZXNzLmZpcmUoe1xuXHRcdFx0XHRwcm92aWRlcklkOiBlLnByb3ZpZGVySWQsXG5cdFx0XHRcdGFjY291bnROYW1lOiBlLmFjY291bnROYW1lXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcm92aWRlcihwcm92aWRlcklkOiBzdHJpbmcpOiBJUHJvdmlkZXJRdWVyeSB7XG5cdFx0cmV0dXJuIG5ldyBQcm92aWRlclF1ZXJ5KHByb3ZpZGVySWQsIHRoaXMpO1xuXHR9XG5cblx0ZXh0ZW5zaW9uKGV4dGVuc2lvbklkOiBzdHJpbmcpOiBJRXh0ZW5zaW9uUXVlcnkge1xuXHRcdHJldHVybiBuZXcgRXh0ZW5zaW9uUXVlcnkoZXh0ZW5zaW9uSWQsIHRoaXMpO1xuXHR9XG5cblx0bWNwU2VydmVyKG1jcFNlcnZlcklkOiBzdHJpbmcpOiBJTWNwU2VydmVyUXVlcnkge1xuXHRcdHJldHVybiBuZXcgTWNwU2VydmVyUXVlcnkobWNwU2VydmVySWQsIHRoaXMpO1xuXHR9XG5cblx0Z2V0UHJvdmlkZXJJZHMoaW5jbHVkZUludGVybmFsPzogYm9vbGVhbik6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXJJZHMoKS5maWx0ZXIocHJvdmlkZXJJZCA9PiB7XG5cdFx0XHQvLyBGaWx0ZXIgb3V0IGludGVybmFsIHByb3ZpZGVycyB1bmxlc3MgZXhwbGljaXRseSBpbmNsdWRlZFxuXHRcdFx0cmV0dXJuIGluY2x1ZGVJbnRlcm5hbCB8fCAhcHJvdmlkZXJJZC5zdGFydHNXaXRoKElOVEVSTkFMX0FVVEhfUFJPVklERVJfUFJFRklYKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGNsZWFyQWxsRGF0YShjb25maXJtYXRpb246ICdDTEVBUl9BTExfQVVUSF9EQVRBJywgaW5jbHVkZUludGVybmFsOiBib29sZWFuID0gdHJ1ZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChjb25maXJtYXRpb24gIT09ICdDTEVBUl9BTExfQVVUSF9EQVRBJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNdXN0IHByb3ZpZGUgY29uZmlybWF0aW9uIHN0cmluZyB0byBjbGVhciBhbGwgYXV0aGVudGljYXRpb24gZGF0YScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVySWRzID0gdGhpcy5nZXRQcm92aWRlcklkcyhpbmNsdWRlSW50ZXJuYWwpO1xuXG5cdFx0Zm9yIChjb25zdCBwcm92aWRlcklkIG9mIHByb3ZpZGVySWRzKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBhY2NvdW50cyA9IGF3YWl0IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldEFjY291bnRzKHByb3ZpZGVySWQpO1xuXG5cdFx0XHRcdGZvciAoY29uc3QgYWNjb3VudCBvZiBhY2NvdW50cykge1xuXHRcdFx0XHRcdC8vIENsZWFyIGV4dGVuc2lvbiBkYXRhXG5cdFx0XHRcdFx0dGhpcy5hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UucmVtb3ZlQWxsb3dlZEV4dGVuc2lvbnMocHJvdmlkZXJJZCwgYWNjb3VudC5sYWJlbCk7XG5cdFx0XHRcdFx0dGhpcy5hdXRoZW50aWNhdGlvblVzYWdlU2VydmljZS5yZW1vdmVBY2NvdW50VXNhZ2UocHJvdmlkZXJJZCwgYWNjb3VudC5sYWJlbCk7XG5cblx0XHRcdFx0XHQvLyBDbGVhciBNQ1Agc2VydmVyIGRhdGFcblx0XHRcdFx0XHR0aGlzLmF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5yZW1vdmVBbGxvd2VkTWNwU2VydmVycyhwcm92aWRlcklkLCBhY2NvdW50LmxhYmVsKTtcblx0XHRcdFx0XHR0aGlzLmF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLnJlbW92ZUFjY291bnRVc2FnZShwcm92aWRlcklkLCBhY2NvdW50LmxhYmVsKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBFcnJvciBjbGVhcmluZyBkYXRhIGZvciBwcm92aWRlciAke3Byb3ZpZGVySWR9OmAsIGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnQWxsIGF1dGhlbnRpY2F0aW9uIGRhdGEgY2xlYXJlZCcpO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElBdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZSwgQXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjog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
