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
import { Disposable, DisposableMap } from "../../../base/common/lifecycle.js";
import * as nls from "../../../nls.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { getDynamicAuthenticationProviderId, IAuthenticationService, IAuthenticationExtensionsService, isAuthenticationWwwAuthenticateRequest } from "../../services/authentication/common/authentication.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { IDialogService } from "../../../platform/dialogs/common/dialogs.js";
import Severity from "../../../base/common/severity.js";
import { INotificationService } from "../../../platform/notification/common/notification.js";
import { ActivationKind, IExtensionService } from "../../services/extensions/common/extensions.js";
import { ITelemetryService } from "../../../platform/telemetry/common/telemetry.js";
import { Emitter } from "../../../base/common/event.js";
import { IAuthenticationAccessService } from "../../services/authentication/browser/authenticationAccessService.js";
import { IAuthenticationUsageService } from "../../services/authentication/browser/authenticationUsageService.js";
import { getAuthenticationProviderActivationEvent } from "../../services/authentication/browser/authenticationService.js";
import { URI } from "../../../base/common/uri.js";
import { IOpenerService } from "../../../platform/opener/common/opener.js";
import { CancellationError } from "../../../base/common/errors.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { ExtensionHostKind } from "../../services/extensions/common/extensionHostKind.js";
import { IURLService } from "../../../platform/url/common/url.js";
import { DeferredPromise, raceTimeout } from "../../../base/common/async.js";
import { fetchAuthorizationServerMetadata } from "../../../base/common/oauth.js";
import { IDynamicAuthenticationProviderStorageService } from "../../services/authentication/common/dynamicAuthenticationProviderStorage.js";
import { IClipboardService } from "../../../platform/clipboard/common/clipboardService.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { ISecretStorageService } from "../../../platform/secrets/common/secrets.js";
import { mcpOAuthClientSecretStorageKey } from "../../contrib/mcp/common/mcpTypes.js";
import { IProductService } from "../../../platform/product/common/productService.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { mcpEnterpriseManagedAuthIdpSection } from "../../contrib/mcp/common/mcpConfiguration.js";
function reviveSessionAccountIcon(session) {
  return { ...session, account: { ...session.account, icon: URI.revive(session.account.icon) } };
}
class MainThreadAuthenticationProvider extends Disposable {
  constructor(_proxy, id, label, supportsMultipleAccounts, authorizationServers, resourceServer, onDidChangeSessionsEmitter) {
    super();
    this._proxy = _proxy;
    this.id = id;
    this.label = label;
    this.supportsMultipleAccounts = supportsMultipleAccounts;
    this.authorizationServers = authorizationServers;
    this.resourceServer = resourceServer;
    this.onDidChangeSessions = onDidChangeSessionsEmitter.event;
  }
  async getSessions(scopes, options) {
    const sessions = await this._proxy.$getSessions(this.id, scopes, options);
    return sessions.map(reviveSessionAccountIcon);
  }
  async createSession(scopes, options) {
    return reviveSessionAccountIcon(await this._proxy.$createSession(this.id, scopes, options));
  }
  async removeSession(sessionId) {
    await this._proxy.$removeSession(this.id, sessionId);
  }
}
class MainThreadAuthenticationProviderWithChallenges extends MainThreadAuthenticationProvider {
  constructor(proxy, id, label, supportsMultipleAccounts, authorizationServers, resourceServer, onDidChangeSessionsEmitter) {
    super(
      proxy,
      id,
      label,
      supportsMultipleAccounts,
      authorizationServers,
      resourceServer,
      onDidChangeSessionsEmitter
    );
  }
  async getSessionsFromChallenges(constraint, options) {
    const sessions = await this._proxy.$getSessionsFromChallenges(this.id, constraint, options);
    return sessions.map(reviveSessionAccountIcon);
  }
  async createSessionFromChallenges(constraint, options) {
    return reviveSessionAccountIcon(await this._proxy.$createSessionFromChallenges(this.id, constraint, options));
  }
}
let MainThreadAuthentication = class extends Disposable {
  constructor(extHostContext, productService, authenticationService, authenticationExtensionsService, authenticationAccessService, authenticationUsageService, dialogService, notificationService, extensionService, telemetryService, openerService, logService, urlService, dynamicAuthProviderStorageService, clipboardService, quickInputService, configurationService, secretStorageService) {
    super();
    this.productService = productService;
    this.authenticationService = authenticationService;
    this.authenticationExtensionsService = authenticationExtensionsService;
    this.authenticationAccessService = authenticationAccessService;
    this.authenticationUsageService = authenticationUsageService;
    this.dialogService = dialogService;
    this.notificationService = notificationService;
    this.extensionService = extensionService;
    this.telemetryService = telemetryService;
    this.openerService = openerService;
    this.logService = logService;
    this.urlService = urlService;
    this.dynamicAuthProviderStorageService = dynamicAuthProviderStorageService;
    this.clipboardService = clipboardService;
    this.quickInputService = quickInputService;
    this.configurationService = configurationService;
    this.secretStorageService = secretStorageService;
    this._registrations = this._register(new DisposableMap());
    this._sentProviderUsageEvents = /* @__PURE__ */ new Set();
    this._suppressUnregisterEvent = false;
    // TODO@TylerLeonhardt this is a temporary addition to telemetry to understand what extensions are overriding the client id.
    // We can use this telemetry to reach out to these extension authors and let them know that they many need configuration changes
    // due to the adoption of the Microsoft broker.
    // Remove this in a few iterations.
    this._sentClientIdUsageEvents = /* @__PURE__ */ new Set();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostAuthentication);
    this._register(this.authenticationService.onDidChangeSessions((e) => this._proxy.$onDidChangeAuthenticationSessions(e.providerId, e.label)));
    this._register(this.authenticationService.onDidUnregisterAuthenticationProvider((e) => {
      if (!this._suppressUnregisterEvent) {
        this._proxy.$onDidUnregisterAuthenticationProvider(e.id);
      }
    }));
    this._register(this.authenticationExtensionsService.onDidChangeAccountPreference((e) => {
      const providerInfo = this.authenticationService.getProvider(e.providerId);
      this._proxy.$onDidChangeAuthenticationSessions(providerInfo.id, providerInfo.label, e.extensionIds);
    }));
    this._register(this.dynamicAuthProviderStorageService.onDidChangeTokens((e) => {
      this._proxy.$onDidChangeDynamicAuthProviderTokens(e.authProviderId, e.clientId, e.tokens);
    }));
    this._register(authenticationService.registerAuthenticationProviderHostDelegate({
      // Prefer Node.js extension hosts when they're available. No CORS issues etc.
      priority: extHostContext.extensionHostKind === ExtensionHostKind.LocalWebWorker ? 0 : 1,
      create: async (authorizationServer, serverMetadata, resource, overrideClientId, overrideClientSecret) => {
        const authProviderId = getDynamicAuthenticationProviderId(authorizationServer, resource);
        const clientDetails = await this.dynamicAuthProviderStorageService.getClientRegistration(authProviderId);
        let clientId = overrideClientId ?? clientDetails?.clientId;
        const clientSecret = overrideClientId ? overrideClientSecret : overrideClientSecret ?? clientDetails?.clientSecret;
        let initialTokens = void 0;
        if (clientId) {
          initialTokens = await this.dynamicAuthProviderStorageService.getSessionsForDynamicAuthProvider(authProviderId, clientId);
        } else if (serverMetadata.client_id_metadata_document_supported) {
          clientId = this.productService.authClientIdMetadataUrl;
        }
        return await this._proxy.$registerDynamicAuthProvider(
          authorizationServer,
          serverMetadata,
          resource,
          clientId,
          clientSecret,
          initialTokens
        );
      },
      createXaa: async (issuer) => {
        const authProviderId = `xaa:${issuer.toString(true)}`;
        const { metadata: serverMetadata } = await fetchAuthorizationServerMetadata(issuer.toString(true));
        const configuredIdp = this.configurationService.getValue(mcpEnterpriseManagedAuthIdpSection) ?? {};
        const configuredClientId = configuredIdp.clientId?.trim() || void 0;
        const configuredClientSecret = configuredIdp.clientSecret?.trim() || void 0;
        const cached = await this.dynamicAuthProviderStorageService.getClientRegistration(authProviderId);
        const clientId = configuredClientId ?? cached?.clientId;
        const clientSecret = configuredClientSecret ?? cached?.clientSecret;
        let initialTokens = void 0;
        if (clientId) {
          initialTokens = await this.dynamicAuthProviderStorageService.getSessionsForDynamicAuthProvider(authProviderId, clientId);
        }
        return await this._proxy.$registerXaaAuthProvider(
          issuer,
          serverMetadata,
          clientId,
          clientSecret,
          initialTokens
        );
      }
    }));
  }
  async $registerAuthenticationProvider({ id, label, supportsMultipleAccounts, resourceServer, supportedAuthorizationServers, supportsChallenges }) {
    if (!this.authenticationService.declaredProviders.find((p) => p.id === id)) {
      this.logService.warn(`Authentication provider ${id} was not declared in the Extension Manifest.`);
      this.telemetryService.publicLog2("authentication.providerNotDeclared", { id });
    }
    const emitter = new Emitter();
    this._registrations.set(id, emitter);
    const supportedAuthorizationServerUris = (supportedAuthorizationServers ?? []).map((i) => URI.revive(i));
    const provider = supportsChallenges ? new MainThreadAuthenticationProviderWithChallenges(
      this._proxy,
      id,
      label,
      supportsMultipleAccounts,
      supportedAuthorizationServerUris,
      resourceServer ? URI.revive(resourceServer) : void 0,
      emitter
    ) : new MainThreadAuthenticationProvider(
      this._proxy,
      id,
      label,
      supportsMultipleAccounts,
      supportedAuthorizationServerUris,
      resourceServer ? URI.revive(resourceServer) : void 0,
      emitter
    );
    this.authenticationService.registerAuthenticationProvider(id, provider);
  }
  async $unregisterAuthenticationProvider(id) {
    this._registrations.deleteAndDispose(id);
    this._suppressUnregisterEvent = true;
    try {
      this.authenticationService.unregisterAuthenticationProvider(id);
    } finally {
      this._suppressUnregisterEvent = false;
    }
  }
  async $ensureProvider(id) {
    if (!this.authenticationService.isAuthenticationProviderRegistered(id)) {
      return await this.extensionService.activateByEvent(getAuthenticationProviderActivationEvent(id), ActivationKind.Immediate);
    }
  }
  async $sendDidChangeSessions(providerId, event) {
    const obj = this._registrations.get(providerId);
    if (obj instanceof Emitter) {
      obj.fire({
        added: event.added?.map(reviveSessionAccountIcon),
        removed: event.removed?.map(reviveSessionAccountIcon),
        changed: event.changed?.map(reviveSessionAccountIcon)
      });
    }
  }
  $removeSession(providerId, sessionId) {
    return this.authenticationService.removeSession(providerId, sessionId);
  }
  async $waitForUriHandler(expectedUri) {
    const deferredPromise = new DeferredPromise();
    const disposable = this.urlService.registerHandler({
      handleURL: async (uri) => {
        if (uri.scheme !== expectedUri.scheme || uri.authority !== expectedUri.authority || uri.path !== expectedUri.path) {
          return false;
        }
        deferredPromise.complete(uri);
        disposable.dispose();
        return true;
      }
    });
    const result = await raceTimeout(deferredPromise.p, 5 * 60 * 1e3);
    if (!result) {
      throw new Error("Timed out waiting for URI handler");
    }
    return await deferredPromise.p;
  }
  $showContinueNotification(message) {
    const yes = nls.localize("yes", "Yes");
    const no = nls.localize("no", "No");
    const deferredPromise = new DeferredPromise();
    let result = false;
    const handle = this.notificationService.prompt(
      Severity.Warning,
      message,
      [{
        label: yes,
        run: () => result = true
      }, {
        label: no,
        run: () => result = false
      }]
    );
    const disposable = handle.onDidClose(() => {
      deferredPromise.complete(result);
      disposable.dispose();
    });
    return deferredPromise.p;
  }
  async $registerDynamicAuthenticationProvider(details) {
    await this.$registerAuthenticationProvider({
      id: details.id,
      label: details.label,
      supportsMultipleAccounts: true,
      supportedAuthorizationServers: [details.authorizationServer],
      resourceServer: details.resourceServer
    });
    await this.dynamicAuthProviderStorageService.storeClientRegistration(details.id, URI.revive(details.authorizationServer).toString(true), details.clientId, details.clientSecret, details.label);
  }
  async $setSessionsForDynamicAuthProvider(authProviderId, clientId, sessions) {
    await this.dynamicAuthProviderStorageService.setSessionsForDynamicAuthProvider(authProviderId, clientId, sessions);
  }
  async $sendDidChangeDynamicProviderInfo({ providerId, clientId, authorizationServer, label, clientSecret }) {
    this.logService.info(`Client ID for authentication provider ${providerId} changed to ${clientId}`);
    const existing = this.dynamicAuthProviderStorageService.getInteractedProviders().find((p) => p.providerId === providerId);
    if (!existing) {
      throw new Error(`Dynamic authentication provider ${providerId} not found. Has it been registered?`);
    }
    await this.dynamicAuthProviderStorageService.storeClientRegistration(
      providerId || existing.providerId,
      authorizationServer ? URI.revive(authorizationServer).toString(true) : existing.authorizationServer,
      clientId || existing.clientId,
      clientSecret,
      label || existing.label
    );
  }
  async loginPrompt(provider, extensionName, recreatingSession, options) {
    let message;
    const customMessage = provider.confirmation?.(extensionName, recreatingSession);
    if (customMessage) {
      message = customMessage;
    } else {
      message = recreatingSession ? nls.localize("confirmRelogin", "The extension '{0}' wants you to sign in again using {1}.", extensionName, provider.label) : nls.localize("confirmLogin", "The extension '{0}' wants to sign in using {1}.", extensionName, provider.label);
    }
    const buttons = [
      {
        label: nls.localize({ key: "allow", comment: ["&& denotes a mnemonic"] }, "&&Allow"),
        run() {
          return true;
        }
      }
    ];
    if (options?.learnMore) {
      buttons.push({
        label: nls.localize("learnMore", "Learn more"),
        run: async () => {
          const result2 = this.loginPrompt(provider, extensionName, recreatingSession, options);
          await this.openerService.open(URI.revive(options.learnMore), { allowCommands: true });
          return await result2;
        }
      });
    }
    const { result } = await this.dialogService.prompt({
      type: Severity.Info,
      message,
      buttons,
      detail: options?.detail,
      cancelButton: true
    });
    return result ?? false;
  }
  async continueWithIncorrectAccountPrompt(chosenAccountLabel, requestedAccountLabel) {
    const result = await this.dialogService.prompt({
      message: nls.localize("incorrectAccount", "Incorrect account detected"),
      detail: nls.localize("incorrectAccountDetail", "The chosen account, {0}, does not match the requested account, {1}.", chosenAccountLabel, requestedAccountLabel),
      type: Severity.Warning,
      cancelButton: true,
      buttons: [
        {
          label: nls.localize("keep", "Keep {0}", chosenAccountLabel),
          run: () => chosenAccountLabel
        },
        {
          label: nls.localize("loginWith", "Login with {0}", requestedAccountLabel),
          run: () => requestedAccountLabel
        }
      ]
    });
    if (!result.result) {
      throw new CancellationError();
    }
    return result.result === chosenAccountLabel;
  }
  async doGetSession(providerId, scopeListOrRequest, extensionId, extensionName, options) {
    const authorizationServer = URI.revive(options.authorizationServer);
    const sessions = await this.authenticationService.getSessions(providerId, scopeListOrRequest, { account: options.account, authorizationServer }, true);
    const provider = this.authenticationService.getProvider(providerId);
    if (options.forceNewSession && options.createIfNone) {
      throw new Error("Invalid combination of options. Please remove one of the following: forceNewSession, createIfNone");
    }
    if (options.forceNewSession && options.silent) {
      throw new Error("Invalid combination of options. Please remove one of the following: forceNewSession, silent");
    }
    if (options.createIfNone && options.silent) {
      throw new Error("Invalid combination of options. Please remove one of the following: createIfNone, silent");
    }
    if (options.clearSessionPreference) {
      this.authenticationExtensionsService.removeAccountPreference(extensionId, providerId);
    }
    const matchingAccountPreferenceSession = (
      // If an account was passed in, that takes precedence over the account preference
      options.account ? sessions[0] : this._getAccountPreference(extensionId, providerId, sessions)
    );
    if (!options.forceNewSession && sessions.length) {
      if (matchingAccountPreferenceSession && this.authenticationAccessService.isAccessAllowed(providerId, matchingAccountPreferenceSession.account.label, extensionId)) {
        return matchingAccountPreferenceSession;
      }
      if (!provider.supportsMultipleAccounts && this.authenticationAccessService.isAccessAllowed(providerId, sessions[0].account.label, extensionId)) {
        return sessions[0];
      }
    }
    if (options.createIfNone || options.forceNewSession) {
      let uiOptions;
      if (typeof options.forceNewSession === "object") {
        uiOptions = options.forceNewSession;
      } else if (typeof options.createIfNone === "object") {
        uiOptions = options.createIfNone;
      }
      const recreatingSession = !!(options.forceNewSession && sessions.length);
      const isAllowed = await this.loginPrompt(provider, extensionName, recreatingSession, uiOptions);
      if (!isAllowed) {
        throw new Error("User did not consent to login.");
      }
      let session;
      if (sessions?.length && !options.forceNewSession) {
        session = provider.supportsMultipleAccounts && !options.account ? await this.authenticationExtensionsService.selectSession(providerId, extensionId, extensionName, scopeListOrRequest, sessions) : sessions[0];
      } else {
        const accountToCreate = options.account ?? matchingAccountPreferenceSession?.account;
        do {
          session = await this.authenticationService.createSession(
            providerId,
            scopeListOrRequest,
            {
              activateImmediate: true,
              account: accountToCreate,
              authorizationServer
            }
          );
        } while (accountToCreate && accountToCreate.label !== session.account.label && !await this.continueWithIncorrectAccountPrompt(session.account.label, accountToCreate.label));
      }
      this.authenticationAccessService.updateAllowedExtensions(providerId, session.account.label, [{ id: extensionId, name: extensionName, allowed: true }]);
      this.authenticationExtensionsService.updateNewSessionRequests(providerId, [session]);
      this.authenticationExtensionsService.updateAccountPreference(extensionId, providerId, session.account);
      return session;
    }
    if (!matchingAccountPreferenceSession) {
      const validSessions = sessions.filter((session) => this.authenticationAccessService.isAccessAllowed(providerId, session.account.label, extensionId));
      if (validSessions.length === 1) {
        return validSessions[0];
      }
    }
    if (!options.silent) {
      sessions.length ? this.authenticationExtensionsService.requestSessionAccess(providerId, extensionId, extensionName, scopeListOrRequest, sessions) : await this.authenticationExtensionsService.requestNewSession(providerId, scopeListOrRequest, extensionId, extensionName);
    }
    return void 0;
  }
  async $getSession(providerId, scopeListOrRequest, extensionId, extensionName, options) {
    const scopes = isAuthenticationWwwAuthenticateRequest(scopeListOrRequest) ? scopeListOrRequest.fallbackScopes : scopeListOrRequest;
    if (scopes) {
      this.sendClientIdUsageTelemetry(extensionId, providerId, scopes);
    }
    const session = await this.doGetSession(providerId, scopeListOrRequest, extensionId, extensionName, options);
    if (session) {
      this.sendProviderUsageTelemetry(extensionId, providerId);
      this.authenticationUsageService.addAccountUsage(providerId, session.account.label, session.scopes, extensionId, extensionName);
    }
    return session;
  }
  async $getAccounts(providerId) {
    const accounts = await this.authenticationService.getAccounts(providerId);
    return accounts;
  }
  sendClientIdUsageTelemetry(extensionId, providerId, scopes) {
    const containsVSCodeClientIdScope = scopes.some((scope) => scope.startsWith("VSCODE_CLIENT_ID:"));
    const key = `${extensionId}|${providerId}|${containsVSCodeClientIdScope}`;
    if (this._sentClientIdUsageEvents.has(key)) {
      return;
    }
    this._sentClientIdUsageEvents.add(key);
    if (containsVSCodeClientIdScope) {
      this.telemetryService.publicLog2("authentication.clientIdUsage", { extensionId });
    }
  }
  sendProviderUsageTelemetry(extensionId, providerId) {
    const key = `${extensionId}|${providerId}`;
    if (this._sentProviderUsageEvents.has(key)) {
      return;
    }
    this._sentProviderUsageEvents.add(key);
    this.telemetryService.publicLog2("authentication.providerUsage", { providerId, extensionId });
  }
  //#region Account Preferences
  // TODO@TylerLeonhardt: Update this after a few iterations to no longer fallback to the session preference
  _getAccountPreference(extensionId, providerId, sessions) {
    if (sessions.length === 0) {
      return void 0;
    }
    const accountNamePreference = this.authenticationExtensionsService.getAccountPreference(extensionId, providerId);
    if (accountNamePreference) {
      const session = sessions.find((session2) => session2.account.label === accountNamePreference);
      return session;
    }
    return void 0;
  }
  //#endregion
  async $showDeviceCodeModal(userCode, verificationUri) {
    const { result } = await this.dialogService.prompt({
      type: Severity.Info,
      message: nls.localize("deviceCodeTitle", "Device Code Authentication"),
      detail: nls.localize("deviceCodeDetail", "Your code: {0}\n\nTo complete authentication, navigate to {1} and enter the code above.", userCode, verificationUri),
      buttons: [
        {
          label: nls.localize("copyAndContinue", "Copy & Continue"),
          run: () => true
        }
      ],
      cancelButton: true
    });
    if (result) {
      try {
        await this.clipboardService.writeText(userCode);
        return await this.openerService.open(URI.parse(verificationUri));
      } catch (error) {
        this.notificationService.error(nls.localize("failedToOpenUri", "Failed to open {0}", verificationUri));
      }
    }
    return false;
  }
  async $promptForClientRegistration(authorizationServerUrl) {
    const redirectUrls = "http://127.0.0.1:33418\nhttps://vscode.dev/redirect";
    const result = await this.dialogService.prompt({
      type: Severity.Info,
      message: nls.localize("dcrNotSupported", "Dynamic Client Registration not supported"),
      detail: nls.localize("dcrNotSupportedDetail", "The authorization server '{0}' does not support automatic client registration. Do you want to proceed by manually providing a client registration (client ID)?\n\nNote: When registering your OAuth application, make sure to include these redirect URIs:\n{1}", authorizationServerUrl, redirectUrls),
      buttons: [
        {
          label: nls.localize("dcrCopyUrlsAndProceed", "Copy URIs & Proceed"),
          run: async () => {
            try {
              await this.clipboardService.writeText(redirectUrls);
            } catch (error) {
              this.notificationService.error(nls.localize("dcrFailedToCopy", "Failed to copy redirect URIs to clipboard."));
            }
            return true;
          }
        }
      ],
      cancelButton: {
        label: nls.localize("cancel", "Cancel"),
        run: () => false
      }
    });
    if (!result) {
      return void 0;
    }
    const sharedTitle = nls.localize("addClientRegistrationDetails", "Add Client Registration Details");
    const clientId = await this.quickInputService.input({
      title: sharedTitle,
      prompt: nls.localize("clientIdPrompt", "Enter an existing client ID that has been registered with the following redirect URIs: http://127.0.0.1:33418, https://vscode.dev/redirect"),
      placeHolder: nls.localize("clientIdPlaceholder", "OAuth client ID (azye39d...)"),
      ignoreFocusLost: true,
      validateInput: async (value) => {
        if (!value || value.trim().length === 0) {
          return nls.localize("clientIdRequired", "Client ID is required");
        }
        return void 0;
      }
    });
    if (!clientId || clientId.trim().length === 0) {
      return void 0;
    }
    const clientSecret = await this.quickInputService.input({
      title: sharedTitle,
      prompt: nls.localize("clientSecretPrompt", "(optional) Enter an existing client secret associated with the client id '{0}' or leave this field blank", clientId),
      placeHolder: nls.localize("clientSecretPlaceholder", "OAuth client secret (wer32o50f...) or leave it blank"),
      password: true,
      ignoreFocusLost: true
    });
    return {
      clientId: clientId.trim(),
      clientSecret: clientSecret?.trim() || void 0
    };
  }
  async $promptForResourceClientSecret(resourceClientId, resource) {
    const value = await this.quickInputService.input({
      title: nls.localize("xaaResourceSecretTitle", "Resource Client Secret Required"),
      prompt: nls.localize(
        "xaaResourceSecretPrompt",
        "The resource at '{0}' uses a per-resource client identifier '{1}'. Enter the matching client secret (leave blank if none). The value is saved in OS secret storage; manage it later via the 'Set Client Secret' code lens in mcp.json.",
        resource,
        resourceClientId
      ),
      placeHolder: nls.localize("xaaResourceSecretPlaceholder", "Resource client secret"),
      password: true,
      ignoreFocusLost: true
    });
    if (value === void 0) {
      return void 0;
    }
    const trimmed = value.trim();
    const key = mcpOAuthClientSecretStorageKey(resource, resourceClientId);
    try {
      if (trimmed.length === 0) {
        await this.secretStorageService.delete(key);
      } else {
        await this.secretStorageService.set(key, trimmed);
      }
    } catch (err) {
      this.logService.warn(`[XAA] Failed to persist resource client secret for ${resource} / ${resourceClientId}: ${err.message}`);
    }
    return trimmed;
  }
};
MainThreadAuthentication = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadAuthentication),
  __decorateParam(1, IProductService),
  __decorateParam(2, IAuthenticationService),
  __decorateParam(3, IAuthenticationExtensionsService),
  __decorateParam(4, IAuthenticationAccessService),
  __decorateParam(5, IAuthenticationUsageService),
  __decorateParam(6, IDialogService),
  __decorateParam(7, INotificationService),
  __decorateParam(8, IExtensionService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, IOpenerService),
  __decorateParam(11, ILogService),
  __decorateParam(12, IURLService),
  __decorateParam(13, IDynamicAuthenticationProviderStorageService),
  __decorateParam(14, IClipboardService),
  __decorateParam(15, IQuickInputService),
  __decorateParam(16, IConfigurationService),
  __decorateParam(17, ISecretStorageService)
], MainThreadAuthentication);
export {
  MainThreadAuthentication,
  reviveSessionAccountIcon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZEF1dGhlbnRpY2F0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGV4dEhvc3ROYW1lZEN1c3RvbWVyLCBJRXh0SG9zdENvbnRleHQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiwgQXV0aGVudGljYXRpb25TZXNzaW9uc0NoYW5nZUV2ZW50LCBnZXREeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlcklkLCBJQXV0aGVudGljYXRpb25Qcm92aWRlciwgSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgSUF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UsIEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQsIElBdXRoZW50aWNhdGlvblByb3ZpZGVyU2Vzc2lvbk9wdGlvbnMsIGlzQXV0aGVudGljYXRpb25Xd3dBdXRoZW50aWNhdGVSZXF1ZXN0LCBJQXV0aGVudGljYXRpb25Db25zdHJhaW50LCBJQXV0aGVudGljYXRpb25Xd3dBdXRoZW50aWNhdGVSZXF1ZXN0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IEV4dEhvc3RBdXRoZW50aWNhdGlvblNoYXBlLCBFeHRIb3N0Q29udGV4dCwgSVJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlckRldGFpbHMsIElSZWdpc3RlckR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyRGV0YWlscywgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRBdXRoZW50aWNhdGlvblNoYXBlIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UsIElQcm9tcHRCdXR0b24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IEFjdGl2YXRpb25LaW5kLCBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJBY3RpdmF0aW9uRXZlbnQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvc3RLaW5kIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uSG9zdEtpbmQuanMnO1xuaW1wb3J0IHsgRHRvLCBQcm94aWVkIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IElVUkxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdXJsL2NvbW1vbi91cmwuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCByYWNlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhLCBJQXV0aG9yaXphdGlvblRva2VuUmVzcG9uc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYXV0aC5qcyc7XG5pbXBvcnQgeyBJRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9keW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJU2VjcmV0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zZWNyZXRzL2NvbW1vbi9zZWNyZXRzLmpzJztcbmltcG9ydCB7IG1jcE9BdXRoQ2xpZW50U2VjcmV0U3RvcmFnZUtleSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElNY3BFbnRlcnByaXNlTWFuYWdlZEF1dGhJZHBDb25maWcsIG1jcEVudGVycHJpc2VNYW5hZ2VkQXV0aElkcFNlY3Rpb24gfSBmcm9tICcuLi8uLi9jb250cmliL21jcC9jb21tb24vbWNwQ29uZmlndXJhdGlvbi5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZU9wdGlvbnMge1xuXHRkZXRhaWw/OiBzdHJpbmc7XG5cdGxlYXJuTW9yZT86IFVyaUNvbXBvbmVudHM7XG5cdHNlc3Npb25Ub1JlY3JlYXRlPzogQXV0aGVudGljYXRpb25TZXNzaW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhlbnRpY2F0aW9uR2V0U2Vzc2lvbk9wdGlvbnMge1xuXHRjbGVhclNlc3Npb25QcmVmZXJlbmNlPzogYm9vbGVhbjtcblx0Y3JlYXRlSWZOb25lPzogYm9vbGVhbiB8IEF1dGhlbnRpY2F0aW9uSW50ZXJhY3RpdmVPcHRpb25zO1xuXHRmb3JjZU5ld1Nlc3Npb24/OiBib29sZWFuIHwgQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZU9wdGlvbnM7XG5cdHNpbGVudD86IGJvb2xlYW47XG5cdGFjY291bnQ/OiBBdXRoZW50aWNhdGlvblNlc3Npb25BY2NvdW50O1xuXHRhdXRob3JpemF0aW9uU2VydmVyPzogVXJpQ29tcG9uZW50cztcbn1cblxuLyoqXG4gKiBUaGUgYWNjb3VudCBpY29uIGlzIGEge0BsaW5rIFVSSX0gdGhhdCBkb2VzIG5vdCBzdXJ2aXZlIGJlaW5nIHNlbnQgb3ZlciB0aGUgUlBDIGJvdW5kYXJ5LFxuICogc28gaXQgbmVlZHMgdG8gYmUgcmV2aXZlZCB3aGVuIHNlc3Npb25zIGFyZSByZWNlaXZlZCBmcm9tIHRoZSBleHRlbnNpb24gaG9zdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJldml2ZVNlc3Npb25BY2NvdW50SWNvbihzZXNzaW9uOiBEdG88QXV0aGVudGljYXRpb25TZXNzaW9uPik6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiB7XG5cdHJldHVybiB7IC4uLnNlc3Npb24sIGFjY291bnQ6IHsgLi4uc2Vzc2lvbi5hY2NvdW50LCBpY29uOiBVUkkucmV2aXZlKHNlc3Npb24uYWNjb3VudC5pY29uKSB9IH07XG59XG5cbmNsYXNzIE1haW5UaHJlYWRBdXRoZW50aWNhdGlvblByb3ZpZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBdXRoZW50aWNhdGlvblByb3ZpZGVyIHtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zOiBFdmVudDxBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBfcHJveHk6IFByb3hpZWQ8RXh0SG9zdEF1dGhlbnRpY2F0aW9uU2hhcGU+LFxuXHRcdHB1YmxpYyByZWFkb25seSBpZDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBsYWJlbDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBzdXBwb3J0c011bHRpcGxlQWNjb3VudHM6IGJvb2xlYW4sXG5cdFx0cHVibGljIHJlYWRvbmx5IGF1dGhvcml6YXRpb25TZXJ2ZXJzOiBSZWFkb25seUFycmF5PFVSST4sXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlc291cmNlU2VydmVyOiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9uc0VtaXR0ZXI6IEVtaXR0ZXI8QXV0aGVudGljYXRpb25TZXNzaW9uc0NoYW5nZUV2ZW50Pixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlU2Vzc2lvbnMgPSBvbkRpZENoYW5nZVNlc3Npb25zRW1pdHRlci5ldmVudDtcblx0fVxuXG5cdGFzeW5jIGdldFNlc3Npb25zKHNjb3Blczogc3RyaW5nW10gfCB1bmRlZmluZWQsIG9wdGlvbnM6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyU2Vzc2lvbk9wdGlvbnMpIHtcblx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRnZXRTZXNzaW9ucyh0aGlzLmlkLCBzY29wZXMsIG9wdGlvbnMpO1xuXHRcdHJldHVybiBzZXNzaW9ucy5tYXAocmV2aXZlU2Vzc2lvbkFjY291bnRJY29uKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVNlc3Npb24oc2NvcGVzOiBzdHJpbmdbXSwgb3B0aW9uczogSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXJTZXNzaW9uT3B0aW9ucyk6IFByb21pc2U8QXV0aGVudGljYXRpb25TZXNzaW9uPiB7XG5cdFx0cmV0dXJuIHJldml2ZVNlc3Npb25BY2NvdW50SWNvbihhd2FpdCB0aGlzLl9wcm94eS4kY3JlYXRlU2Vzc2lvbih0aGlzLmlkLCBzY29wZXMsIG9wdGlvbnMpKTtcblx0fVxuXG5cdGFzeW5jIHJlbW92ZVNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9wcm94eS4kcmVtb3ZlU2Vzc2lvbih0aGlzLmlkLCBzZXNzaW9uSWQpO1xuXHR9XG59XG5cbmNsYXNzIE1haW5UaHJlYWRBdXRoZW50aWNhdGlvblByb3ZpZGVyV2l0aENoYWxsZW5nZXMgZXh0ZW5kcyBNYWluVGhyZWFkQXV0aGVudGljYXRpb25Qcm92aWRlciBpbXBsZW1lbnRzIElBdXRoZW50aWNhdGlvblByb3ZpZGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm94eTogUHJveGllZDxFeHRIb3N0QXV0aGVudGljYXRpb25TaGFwZT4sXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRsYWJlbDogc3RyaW5nLFxuXHRcdHN1cHBvcnRzTXVsdGlwbGVBY2NvdW50czogYm9vbGVhbixcblx0XHRhdXRob3JpemF0aW9uU2VydmVyczogUmVhZG9ubHlBcnJheTxVUkk+LFxuXHRcdHJlc291cmNlU2VydmVyOiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9uc0VtaXR0ZXI6IEVtaXR0ZXI8QXV0aGVudGljYXRpb25TZXNzaW9uc0NoYW5nZUV2ZW50Pixcblx0KSB7XG5cdFx0c3VwZXIoXG5cdFx0XHRwcm94eSxcblx0XHRcdGlkLFxuXHRcdFx0bGFiZWwsXG5cdFx0XHRzdXBwb3J0c011bHRpcGxlQWNjb3VudHMsXG5cdFx0XHRhdXRob3JpemF0aW9uU2VydmVycyxcblx0XHRcdHJlc291cmNlU2VydmVyLFxuXHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uc0VtaXR0ZXJcblx0XHQpO1xuXHR9XG5cblx0YXN5bmMgZ2V0U2Vzc2lvbnNGcm9tQ2hhbGxlbmdlcyhjb25zdHJhaW50OiBJQXV0aGVudGljYXRpb25Db25zdHJhaW50LCBvcHRpb25zOiBJQXV0aGVudGljYXRpb25Qcm92aWRlclNlc3Npb25PcHRpb25zKTogUHJvbWlzZTxyZWFkb25seSBBdXRoZW50aWNhdGlvblNlc3Npb25bXT4ge1xuXHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgdGhpcy5fcHJveHkuJGdldFNlc3Npb25zRnJvbUNoYWxsZW5nZXModGhpcy5pZCwgY29uc3RyYWludCwgb3B0aW9ucyk7XG5cdFx0cmV0dXJuIHNlc3Npb25zLm1hcChyZXZpdmVTZXNzaW9uQWNjb3VudEljb24pO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlU2Vzc2lvbkZyb21DaGFsbGVuZ2VzKGNvbnN0cmFpbnQ6IElBdXRoZW50aWNhdGlvbkNvbnN0cmFpbnQsIG9wdGlvbnM6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyU2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPEF1dGhlbnRpY2F0aW9uU2Vzc2lvbj4ge1xuXHRcdHJldHVybiByZXZpdmVTZXNzaW9uQWNjb3VudEljb24oYXdhaXQgdGhpcy5fcHJveHkuJGNyZWF0ZVNlc3Npb25Gcm9tQ2hhbGxlbmdlcyh0aGlzLmlkLCBjb25zdHJhaW50LCBvcHRpb25zKSk7XG5cdH1cbn1cblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRBdXRoZW50aWNhdGlvbilcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkQXV0aGVudGljYXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgTWFpblRocmVhZEF1dGhlbnRpY2F0aW9uU2hhcGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogUHJveGllZDxFeHRIb3N0QXV0aGVudGljYXRpb25TaGFwZT47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVnaXN0cmF0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZz4oKSk7XG5cdHByaXZhdGUgX3NlbnRQcm92aWRlclVzYWdlRXZlbnRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgX3N1cHByZXNzVW5yZWdpc3RlckV2ZW50ID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZTogSUF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2U6IElBdXRoZW50aWNhdGlvblVzYWdlU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVVSTFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmxTZXJ2aWNlOiBJVVJMU2VydmljZSxcblx0XHRASUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkeW5hbWljQXV0aFByb3ZpZGVyU3RvcmFnZVNlcnZpY2U6IElEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJU2VjcmV0U3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZWNyZXRTdG9yYWdlU2VydmljZTogSVNlY3JldFN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3Byb3h5ID0gZXh0SG9zdENvbnRleHQuZ2V0UHJveHkoRXh0SG9zdENvbnRleHQuRXh0SG9zdEF1dGhlbnRpY2F0aW9uKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiB0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VBdXRoZW50aWNhdGlvblNlc3Npb25zKGUucHJvdmlkZXJJZCwgZS5sYWJlbCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZFVucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKGUgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9zdXBwcmVzc1VucmVnaXN0ZXJFdmVudCkge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRVbnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihlLmlkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlQWNjb3VudFByZWZlcmVuY2UoZSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlckluZm8gPSB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRQcm92aWRlcihlLnByb3ZpZGVySWQpO1xuXHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlQXV0aGVudGljYXRpb25TZXNzaW9ucyhwcm92aWRlckluZm8uaWQsIHByb3ZpZGVySW5mby5sYWJlbCwgZS5leHRlbnNpb25JZHMpO1xuXHRcdH0pKTtcblxuXHRcdC8vIExpc3RlbiBmb3IgZHluYW1pYyBhdXRoZW50aWNhdGlvbiBwcm92aWRlciB0b2tlbiBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5keW5hbWljQXV0aFByb3ZpZGVyU3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VUb2tlbnMoZSA9PiB7XG5cdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VEeW5hbWljQXV0aFByb3ZpZGVyVG9rZW5zKGUuYXV0aFByb3ZpZGVySWQsIGUuY2xpZW50SWQsIGUudG9rZW5zKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRoZW50aWNhdGlvblNlcnZpY2UucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVySG9zdERlbGVnYXRlKHtcblx0XHRcdC8vIFByZWZlciBOb2RlLmpzIGV4dGVuc2lvbiBob3N0cyB3aGVuIHRoZXkncmUgYXZhaWxhYmxlLiBObyBDT1JTIGlzc3VlcyBldGMuXG5cdFx0XHRwcmlvcml0eTogZXh0SG9zdENvbnRleHQuZXh0ZW5zaW9uSG9zdEtpbmQgPT09IEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsV2ViV29ya2VyID8gMCA6IDEsXG5cdFx0XHRjcmVhdGU6IGFzeW5jIChhdXRob3JpemF0aW9uU2VydmVyLCBzZXJ2ZXJNZXRhZGF0YSwgcmVzb3VyY2UsIG92ZXJyaWRlQ2xpZW50SWQsIG92ZXJyaWRlQ2xpZW50U2VjcmV0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGF1dGhQcm92aWRlcklkID0gZ2V0RHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZChhdXRob3JpemF0aW9uU2VydmVyLCByZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IGNsaWVudERldGFpbHMgPSBhd2FpdCB0aGlzLmR5bmFtaWNBdXRoUHJvdmlkZXJTdG9yYWdlU2VydmljZS5nZXRDbGllbnRSZWdpc3RyYXRpb24oYXV0aFByb3ZpZGVySWQpO1xuXHRcdFx0XHRsZXQgY2xpZW50SWQgPSBvdmVycmlkZUNsaWVudElkID8/IGNsaWVudERldGFpbHM/LmNsaWVudElkO1xuXHRcdFx0XHRjb25zdCBjbGllbnRTZWNyZXQgPSBvdmVycmlkZUNsaWVudElkXG5cdFx0XHRcdFx0PyBvdmVycmlkZUNsaWVudFNlY3JldFxuXHRcdFx0XHRcdDogKG92ZXJyaWRlQ2xpZW50U2VjcmV0ID8/IGNsaWVudERldGFpbHM/LmNsaWVudFNlY3JldCk7XG5cdFx0XHRcdGxldCBpbml0aWFsVG9rZW5zOiAoSUF1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlICYgeyBjcmVhdGVkX2F0OiBudW1iZXIgfSlbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGNsaWVudElkKSB7XG5cdFx0XHRcdFx0aW5pdGlhbFRva2VucyA9IGF3YWl0IHRoaXMuZHluYW1pY0F1dGhQcm92aWRlclN0b3JhZ2VTZXJ2aWNlLmdldFNlc3Npb25zRm9yRHluYW1pY0F1dGhQcm92aWRlcihhdXRoUHJvdmlkZXJJZCwgY2xpZW50SWQpO1xuXHRcdFx0XHRcdC8vIElmIHdlIGRvbid0IGFscmVhZHkgaGF2ZSBhIGNsaWVudCBpZCwgY2hlY2sgaWYgdGhlIHNlcnZlciBzdXBwb3J0cyB0aGUgQ2xpZW50IElkIE1ldGFkYXRhIGZsb3cgKHNlZSBkb2NzIG9uIHRoZSBwcm9wZXJ0eSlcblx0XHRcdFx0XHQvLyBhbmQgYWRkIHRoZSBcImNsaWVudCBpZFwiIGlmIHNvLlxuXHRcdFx0XHR9IGVsc2UgaWYgKHNlcnZlck1ldGFkYXRhLmNsaWVudF9pZF9tZXRhZGF0YV9kb2N1bWVudF9zdXBwb3J0ZWQpIHtcblx0XHRcdFx0XHRjbGllbnRJZCA9IHRoaXMucHJvZHVjdFNlcnZpY2UuYXV0aENsaWVudElkTWV0YWRhdGFVcmw7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3Byb3h5LiRyZWdpc3RlckR5bmFtaWNBdXRoUHJvdmlkZXIoXG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvblNlcnZlcixcblx0XHRcdFx0XHRzZXJ2ZXJNZXRhZGF0YSxcblx0XHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0XHRjbGllbnRJZCxcblx0XHRcdFx0XHRjbGllbnRTZWNyZXQsXG5cdFx0XHRcdFx0aW5pdGlhbFRva2Vuc1xuXHRcdFx0XHQpO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZVhhYTogYXN5bmMgKGlzc3VlcikgPT4ge1xuXHRcdFx0XHQvLyBYQUEgcHJvdmlkZXJzIGFyZSBrZXllZCBieSBpc3N1ZXIgYWxvbmUgc28gdGhleSBjYW4gYmUgcmV1c2VkIGFjcm9zcyBtYW55IGVudGVycHJpc2UtbWFuYWdlZCBzZXJ2ZXJzLlxuXHRcdFx0XHRjb25zdCBhdXRoUHJvdmlkZXJJZCA9IGB4YWE6JHtpc3N1ZXIudG9TdHJpbmcodHJ1ZSl9YDtcblx0XHRcdFx0Y29uc3QgeyBtZXRhZGF0YTogc2VydmVyTWV0YWRhdGEgfSA9IGF3YWl0IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKGlzc3Vlci50b1N0cmluZyh0cnVlKSk7XG5cblx0XHRcdFx0Ly8gUHJlZmVyIHRoZSB1c2VyLWNvbmZpZ3VyZWQgSWRQIGNsaWVudF9pZCAvIGNsaWVudF9zZWNyZXQgb3ZlciBhbnkgY2FjaGVkIHJlZ2lzdHJhdGlvbi5cblx0XHRcdFx0Ly8gWEFBIHJlcXVpcmVzIGEgcHJlLXByb3Zpc2lvbmVkIChhZG1pbi1hcHByb3ZlZCkgY2xpZW50X2lkIGF0IHRoZSBJZFAgXHUyMDE0IHRoZXJlIGlzIG5vIERDUlxuXHRcdFx0XHQvLyBmYWxsYmFjayBcdTIwMTQgc28gYW4gZXhwbGljaXQgc2V0dGluZyBpcyB0aGUgbW9zdCByZWxpYWJsZSBzb3VyY2UuIFR5cGljYWxseSBkZWxpdmVyZWQgdmlhXG5cdFx0XHRcdC8vIGVudGVycHJpc2UgcG9saWN5OyBkZXZlbG9wZXJzIG1heSBoYW5kLWVkaXQgc2V0dGluZ3MuanNvbiBmb3IgbG9jYWwgdGVzdGluZy5cblx0XHRcdFx0Y29uc3QgY29uZmlndXJlZElkcCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SU1jcEVudGVycHJpc2VNYW5hZ2VkQXV0aElkcENvbmZpZyB8IHVuZGVmaW5lZD4obWNwRW50ZXJwcmlzZU1hbmFnZWRBdXRoSWRwU2VjdGlvbikgPz8ge307XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRDbGllbnRJZCA9IGNvbmZpZ3VyZWRJZHAuY2xpZW50SWQ/LnRyaW0oKSB8fCB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRDbGllbnRTZWNyZXQgPSBjb25maWd1cmVkSWRwLmNsaWVudFNlY3JldD8udHJpbSgpIHx8IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgY2FjaGVkID0gYXdhaXQgdGhpcy5keW5hbWljQXV0aFByb3ZpZGVyU3RvcmFnZVNlcnZpY2UuZ2V0Q2xpZW50UmVnaXN0cmF0aW9uKGF1dGhQcm92aWRlcklkKTtcblx0XHRcdFx0Y29uc3QgY2xpZW50SWQgPSBjb25maWd1cmVkQ2xpZW50SWQgPz8gY2FjaGVkPy5jbGllbnRJZDtcblx0XHRcdFx0Y29uc3QgY2xpZW50U2VjcmV0ID0gY29uZmlndXJlZENsaWVudFNlY3JldCA/PyBjYWNoZWQ/LmNsaWVudFNlY3JldDtcblx0XHRcdFx0bGV0IGluaXRpYWxUb2tlbnM6IChJQXV0aG9yaXphdGlvblRva2VuUmVzcG9uc2UgJiB7IGNyZWF0ZWRfYXQ6IG51bWJlciB9KVtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoY2xpZW50SWQpIHtcblx0XHRcdFx0XHRpbml0aWFsVG9rZW5zID0gYXdhaXQgdGhpcy5keW5hbWljQXV0aFByb3ZpZGVyU3RvcmFnZVNlcnZpY2UuZ2V0U2Vzc2lvbnNGb3JEeW5hbWljQXV0aFByb3ZpZGVyKGF1dGhQcm92aWRlcklkLCBjbGllbnRJZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gTm90ZTogWEFBIGRvZXMgTk9UIHVzZSBDSU1EIG9yIERDUiBcdTIwMTQgdGhlIHJlcXVlc3RpbmcgYXBwIG11c3QgYmUgcHJlLXJlZ2lzdGVyZWQgd2l0aCB0aGVcblx0XHRcdFx0Ly8gSWRQIHVuZGVyIGFuIGFkbWluLWFwcHJvdmVkIGNyb3NzLWFwcC1hY2Nlc3MgdHJ1c3QgcmVsYXRpb25zaGlwLiBUaGUgZXh0LWhvc3Qgc2lkZVxuXHRcdFx0XHQvLyAoYCRyZWdpc3RlclhhYUF1dGhQcm92aWRlcmApIHByb21wdHMgdGhlIHVzZXIgZm9yIGNsaWVudF9pZCArIGNsaWVudF9zZWNyZXQgd2hlbiB0aGVyZVxuXHRcdFx0XHQvLyBpcyBubyBjYWNoZWQgcmVnaXN0cmF0aW9uIGFuZCBubyBjb25maWd1cmVkIHZhbHVlLlxuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fcHJveHkuJHJlZ2lzdGVyWGFhQXV0aFByb3ZpZGVyKFxuXHRcdFx0XHRcdGlzc3Vlcixcblx0XHRcdFx0XHRzZXJ2ZXJNZXRhZGF0YSxcblx0XHRcdFx0XHRjbGllbnRJZCxcblx0XHRcdFx0XHRjbGllbnRTZWNyZXQsXG5cdFx0XHRcdFx0aW5pdGlhbFRva2Vuc1xuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jICRyZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoeyBpZCwgbGFiZWwsIHN1cHBvcnRzTXVsdGlwbGVBY2NvdW50cywgcmVzb3VyY2VTZXJ2ZXIsIHN1cHBvcnRlZEF1dGhvcml6YXRpb25TZXJ2ZXJzLCBzdXBwb3J0c0NoYWxsZW5nZXMgfTogSVJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlckRldGFpbHMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmRlY2xhcmVkUHJvdmlkZXJzLmZpbmQocCA9PiBwLmlkID09PSBpZCkpIHtcblx0XHRcdC8vIElmIHRlbGVtZXRyeSBzaG93cyB0aGF0IHRoaXMgaXMgbm90IGhhcHBlbmluZyBtdWNoLCB3ZSBjYW4gaW5zdGVhZCB0aHJvdyBhbiBlcnJvciBoZXJlLlxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYEF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyICR7aWR9IHdhcyBub3QgZGVjbGFyZWQgaW4gdGhlIEV4dGVuc2lvbiBNYW5pZmVzdC5gKTtcblx0XHRcdHR5cGUgQXV0aFByb3ZpZGVyTm90RGVjbGFyZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0b3duZXI6ICdUeWxlckxlb25oYXJkdCc7XG5cdFx0XHRcdGNvbW1lbnQ6ICdBbiBhdXRoZW50aWNhdGlvbiBwcm92aWRlciB3YXMgbm90IGRlY2xhcmVkIGluIHRoZSBFeHRlbnNpb24gTWFuaWZlc3QuJztcblx0XHRcdFx0aWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgcHJvdmlkZXIgaWQuJyB9O1xuXHRcdFx0fTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHsgaWQ6IHN0cmluZyB9LCBBdXRoUHJvdmlkZXJOb3REZWNsYXJlZENsYXNzaWZpY2F0aW9uPignYXV0aGVudGljYXRpb24ucHJvdmlkZXJOb3REZWNsYXJlZCcsIHsgaWQgfSk7XG5cdFx0fVxuXHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQ+KCk7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaWQsIGVtaXR0ZXIpO1xuXHRcdGNvbnN0IHN1cHBvcnRlZEF1dGhvcml6YXRpb25TZXJ2ZXJVcmlzID0gKHN1cHBvcnRlZEF1dGhvcml6YXRpb25TZXJ2ZXJzID8/IFtdKS5tYXAoaSA9PiBVUkkucmV2aXZlKGkpKTtcblx0XHRjb25zdCBwcm92aWRlciA9XG5cdFx0XHRzdXBwb3J0c0NoYWxsZW5nZXNcblx0XHRcdFx0PyBuZXcgTWFpblRocmVhZEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJXaXRoQ2hhbGxlbmdlcyhcblx0XHRcdFx0XHR0aGlzLl9wcm94eSxcblx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0XHRzdXBwb3J0c011bHRpcGxlQWNjb3VudHMsXG5cdFx0XHRcdFx0c3VwcG9ydGVkQXV0aG9yaXphdGlvblNlcnZlclVyaXMsXG5cdFx0XHRcdFx0cmVzb3VyY2VTZXJ2ZXIgPyBVUkkucmV2aXZlKHJlc291cmNlU2VydmVyKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRlbWl0dGVyXG5cdFx0XHRcdClcblx0XHRcdFx0OiBuZXcgTWFpblRocmVhZEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoXG5cdFx0XHRcdFx0dGhpcy5fcHJveHksXG5cdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdFx0c3VwcG9ydHNNdWx0aXBsZUFjY291bnRzLFxuXHRcdFx0XHRcdHN1cHBvcnRlZEF1dGhvcml6YXRpb25TZXJ2ZXJVcmlzLFxuXHRcdFx0XHRcdHJlc291cmNlU2VydmVyID8gVVJJLnJldml2ZShyZXNvdXJjZVNlcnZlcikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZW1pdHRlclxuXHRcdFx0XHQpO1xuXHRcdHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihpZCwgcHJvdmlkZXIpO1xuXHR9XG5cblx0YXN5bmMgJHVucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLmRlbGV0ZUFuZERpc3Bvc2UoaWQpO1xuXHRcdC8vIFRoZSBleHQgaG9zdCBzaWRlIGFscmVhZHkgdW5yZWdpc3RlcnMgdGhlIHByb3ZpZGVyLCBzbyB3ZSBjYW4gc3VwcHJlc3MgdGhlIGV2ZW50IGhlcmUuXG5cdFx0dGhpcy5fc3VwcHJlc3NVbnJlZ2lzdGVyRXZlbnQgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS51bnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihpZCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX3N1cHByZXNzVW5yZWdpc3RlckV2ZW50ID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJGVuc3VyZVByb3ZpZGVyKGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmlzQXV0aGVudGljYXRpb25Qcm92aWRlclJlZ2lzdGVyZWQoaWQpKSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChnZXRBdXRoZW50aWNhdGlvblByb3ZpZGVyQWN0aXZhdGlvbkV2ZW50KGlkKSwgQWN0aXZhdGlvbktpbmQuSW1tZWRpYXRlKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkc2VuZERpZENoYW5nZVNlc3Npb25zKHByb3ZpZGVySWQ6IHN0cmluZywgZXZlbnQ6IER0bzxBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb2JqID0gdGhpcy5fcmVnaXN0cmF0aW9ucy5nZXQocHJvdmlkZXJJZCk7XG5cdFx0aWYgKG9iaiBpbnN0YW5jZW9mIEVtaXR0ZXIpIHtcblx0XHRcdG9iai5maXJlKHtcblx0XHRcdFx0YWRkZWQ6IGV2ZW50LmFkZGVkPy5tYXAocmV2aXZlU2Vzc2lvbkFjY291bnRJY29uKSxcblx0XHRcdFx0cmVtb3ZlZDogZXZlbnQucmVtb3ZlZD8ubWFwKHJldml2ZVNlc3Npb25BY2NvdW50SWNvbiksXG5cdFx0XHRcdGNoYW5nZWQ6IGV2ZW50LmNoYW5nZWQ/Lm1hcChyZXZpdmVTZXNzaW9uQWNjb3VudEljb24pXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQkcmVtb3ZlU2Vzc2lvbihwcm92aWRlcklkOiBzdHJpbmcsIHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLnJlbW92ZVNlc3Npb24ocHJvdmlkZXJJZCwgc2Vzc2lvbklkKTtcblx0fVxuXG5cdGFzeW5jICR3YWl0Rm9yVXJpSGFuZGxlcihleHBlY3RlZFVyaTogVXJpQ29tcG9uZW50cyk6IFByb21pc2U8VXJpQ29tcG9uZW50cz4ge1xuXHRcdGNvbnN0IGRlZmVycmVkUHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8VXJpQ29tcG9uZW50cz4oKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpcy51cmxTZXJ2aWNlLnJlZ2lzdGVySGFuZGxlcih7XG5cdFx0XHRoYW5kbGVVUkw6IGFzeW5jICh1cmk6IFVSSSkgPT4ge1xuXHRcdFx0XHRpZiAodXJpLnNjaGVtZSAhPT0gZXhwZWN0ZWRVcmkuc2NoZW1lIHx8IHVyaS5hdXRob3JpdHkgIT09IGV4cGVjdGVkVXJpLmF1dGhvcml0eSB8fCB1cmkucGF0aCAhPT0gZXhwZWN0ZWRVcmkucGF0aCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkZWZlcnJlZFByb21pc2UuY29tcGxldGUodXJpKTtcblx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJhY2VUaW1lb3V0KGRlZmVycmVkUHJvbWlzZS5wLCA1ICogNjAgKiAxMDAwKTsgLy8gNSBtaW51dGVzXG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVGltZWQgb3V0IHdhaXRpbmcgZm9yIFVSSSBoYW5kbGVyJyk7XG5cdFx0fVxuXHRcdHJldHVybiBhd2FpdCBkZWZlcnJlZFByb21pc2UucDtcblx0fVxuXG5cdCRzaG93Q29udGludWVOb3RpZmljYXRpb24obWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgeWVzID0gbmxzLmxvY2FsaXplKCd5ZXMnLCBcIlllc1wiKTtcblx0XHRjb25zdCBubyA9IG5scy5sb2NhbGl6ZSgnbm8nLCBcIk5vXCIpO1xuXHRcdGNvbnN0IGRlZmVycmVkUHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8Ym9vbGVhbj4oKTtcblx0XHRsZXQgcmVzdWx0ID0gZmFsc2U7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6IHllcyxcblx0XHRcdFx0cnVuOiAoKSA9PiByZXN1bHQgPSB0cnVlXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGxhYmVsOiBubyxcblx0XHRcdFx0cnVuOiAoKSA9PiByZXN1bHQgPSBmYWxzZVxuXHRcdFx0fV0pO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBoYW5kbGUub25EaWRDbG9zZSgoKSA9PiB7XG5cdFx0XHRkZWZlcnJlZFByb21pc2UuY29tcGxldGUocmVzdWx0KTtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHRcdHJldHVybiBkZWZlcnJlZFByb21pc2UucDtcblx0fVxuXG5cdGFzeW5jICRyZWdpc3RlckR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyKGRldGFpbHM6IElSZWdpc3RlckR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyRGV0YWlscyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuJHJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcih7XG5cdFx0XHRpZDogZGV0YWlscy5pZCxcblx0XHRcdGxhYmVsOiBkZXRhaWxzLmxhYmVsLFxuXHRcdFx0c3VwcG9ydHNNdWx0aXBsZUFjY291bnRzOiB0cnVlLFxuXHRcdFx0c3VwcG9ydGVkQXV0aG9yaXphdGlvblNlcnZlcnM6IFtkZXRhaWxzLmF1dGhvcml6YXRpb25TZXJ2ZXJdLFxuXHRcdFx0cmVzb3VyY2VTZXJ2ZXI6IGRldGFpbHMucmVzb3VyY2VTZXJ2ZXIsXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGhpcy5keW5hbWljQXV0aFByb3ZpZGVyU3RvcmFnZVNlcnZpY2Uuc3RvcmVDbGllbnRSZWdpc3RyYXRpb24oZGV0YWlscy5pZCwgVVJJLnJldml2ZShkZXRhaWxzLmF1dGhvcml6YXRpb25TZXJ2ZXIpLnRvU3RyaW5nKHRydWUpLCBkZXRhaWxzLmNsaWVudElkLCBkZXRhaWxzLmNsaWVudFNlY3JldCwgZGV0YWlscy5sYWJlbCk7XG5cdH1cblxuXHRhc3luYyAkc2V0U2Vzc2lvbnNGb3JEeW5hbWljQXV0aFByb3ZpZGVyKGF1dGhQcm92aWRlcklkOiBzdHJpbmcsIGNsaWVudElkOiBzdHJpbmcsIHNlc3Npb25zOiAoSUF1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlICYgeyBjcmVhdGVkX2F0OiBudW1iZXIgfSlbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuZHluYW1pY0F1dGhQcm92aWRlclN0b3JhZ2VTZXJ2aWNlLnNldFNlc3Npb25zRm9yRHluYW1pY0F1dGhQcm92aWRlcihhdXRoUHJvdmlkZXJJZCwgY2xpZW50SWQsIHNlc3Npb25zKTtcblx0fVxuXG5cdGFzeW5jICRzZW5kRGlkQ2hhbmdlRHluYW1pY1Byb3ZpZGVySW5mbyh7IHByb3ZpZGVySWQsIGNsaWVudElkLCBhdXRob3JpemF0aW9uU2VydmVyLCBsYWJlbCwgY2xpZW50U2VjcmV0IH06IFBhcnRpYWw8eyBwcm92aWRlcklkOiBzdHJpbmc7IGNsaWVudElkOiBzdHJpbmc7IGF1dGhvcml6YXRpb25TZXJ2ZXI6IFVyaUNvbXBvbmVudHM7IGxhYmVsOiBzdHJpbmc7IGNsaWVudFNlY3JldDogc3RyaW5nIH0+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYENsaWVudCBJRCBmb3IgYXV0aGVudGljYXRpb24gcHJvdmlkZXIgJHtwcm92aWRlcklkfSBjaGFuZ2VkIHRvICR7Y2xpZW50SWR9YCk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLmR5bmFtaWNBdXRoUHJvdmlkZXJTdG9yYWdlU2VydmljZS5nZXRJbnRlcmFjdGVkUHJvdmlkZXJzKCkuZmluZChwID0+IHAucHJvdmlkZXJJZCA9PT0gcHJvdmlkZXJJZCk7XG5cdFx0aWYgKCFleGlzdGluZykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBEeW5hbWljIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyICR7cHJvdmlkZXJJZH0gbm90IGZvdW5kLiBIYXMgaXQgYmVlbiByZWdpc3RlcmVkP2ApO1xuXHRcdH1cblxuXHRcdC8vIFN0b3JlIGNsaWVudCBjcmVkZW50aWFscyB0b2dldGhlclxuXHRcdGF3YWl0IHRoaXMuZHluYW1pY0F1dGhQcm92aWRlclN0b3JhZ2VTZXJ2aWNlLnN0b3JlQ2xpZW50UmVnaXN0cmF0aW9uKFxuXHRcdFx0cHJvdmlkZXJJZCB8fCBleGlzdGluZy5wcm92aWRlcklkLFxuXHRcdFx0YXV0aG9yaXphdGlvblNlcnZlciA/IFVSSS5yZXZpdmUoYXV0aG9yaXphdGlvblNlcnZlcikudG9TdHJpbmcodHJ1ZSkgOiBleGlzdGluZy5hdXRob3JpemF0aW9uU2VydmVyLFxuXHRcdFx0Y2xpZW50SWQgfHwgZXhpc3RpbmcuY2xpZW50SWQsXG5cdFx0XHRjbGllbnRTZWNyZXQsXG5cdFx0XHRsYWJlbCB8fCBleGlzdGluZy5sYWJlbFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGxvZ2luUHJvbXB0KHByb3ZpZGVyOiBJQXV0aGVudGljYXRpb25Qcm92aWRlciwgZXh0ZW5zaW9uTmFtZTogc3RyaW5nLCByZWNyZWF0aW5nU2Vzc2lvbjogYm9vbGVhbiwgb3B0aW9ucz86IEF1dGhlbnRpY2F0aW9uSW50ZXJhY3RpdmVPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblxuXHRcdC8vIENoZWNrIGlmIHRoZSBwcm92aWRlciBoYXMgYSBjdXN0b20gY29uZmlybWF0aW9uIG1lc3NhZ2Vcblx0XHRjb25zdCBjdXN0b21NZXNzYWdlID0gcHJvdmlkZXIuY29uZmlybWF0aW9uPy4oZXh0ZW5zaW9uTmFtZSwgcmVjcmVhdGluZ1Nlc3Npb24pO1xuXHRcdGlmIChjdXN0b21NZXNzYWdlKSB7XG5cdFx0XHRtZXNzYWdlID0gY3VzdG9tTWVzc2FnZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWVzc2FnZSA9IHJlY3JlYXRpbmdTZXNzaW9uXG5cdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdjb25maXJtUmVsb2dpbicsIFwiVGhlIGV4dGVuc2lvbiAnezB9JyB3YW50cyB5b3UgdG8gc2lnbiBpbiBhZ2FpbiB1c2luZyB7MX0uXCIsIGV4dGVuc2lvbk5hbWUsIHByb3ZpZGVyLmxhYmVsKVxuXHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgnY29uZmlybUxvZ2luJywgXCJUaGUgZXh0ZW5zaW9uICd7MH0nIHdhbnRzIHRvIHNpZ24gaW4gdXNpbmcgezF9LlwiLCBleHRlbnNpb25OYW1lLCBwcm92aWRlci5sYWJlbCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnV0dG9uczogSVByb21wdEJ1dHRvbjxib29sZWFuIHwgdW5kZWZpbmVkPltdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKHsga2V5OiAnYWxsb3cnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZBbGxvd1wiKSxcblx0XHRcdFx0cnVuKCkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdF07XG5cdFx0aWYgKG9wdGlvbnM/LmxlYXJuTW9yZSkge1xuXHRcdFx0YnV0dG9ucy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnbGVhcm5Nb3JlJywgXCJMZWFybiBtb3JlXCIpLFxuXHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmxvZ2luUHJvbXB0KHByb3ZpZGVyLCBleHRlbnNpb25OYW1lLCByZWNyZWF0aW5nU2Vzc2lvbiwgb3B0aW9ucyk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnJldml2ZShvcHRpb25zLmxlYXJuTW9yZSEpLCB7IGFsbG93Q29tbWFuZHM6IHRydWUgfSk7XG5cdFx0XHRcdFx0cmV0dXJuIGF3YWl0IHJlc3VsdDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGNvbnN0IHsgcmVzdWx0IH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0YnV0dG9ucyxcblx0XHRcdGRldGFpbDogb3B0aW9ucz8uZGV0YWlsLFxuXHRcdFx0Y2FuY2VsQnV0dG9uOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJlc3VsdCA/PyBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29udGludWVXaXRoSW5jb3JyZWN0QWNjb3VudFByb21wdChjaG9zZW5BY2NvdW50TGFiZWw6IHN0cmluZywgcmVxdWVzdGVkQWNjb3VudExhYmVsOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnaW5jb3JyZWN0QWNjb3VudCcsIFwiSW5jb3JyZWN0IGFjY291bnQgZGV0ZWN0ZWRcIiksXG5cdFx0XHRkZXRhaWw6IG5scy5sb2NhbGl6ZSgnaW5jb3JyZWN0QWNjb3VudERldGFpbCcsIFwiVGhlIGNob3NlbiBhY2NvdW50LCB7MH0sIGRvZXMgbm90IG1hdGNoIHRoZSByZXF1ZXN0ZWQgYWNjb3VudCwgezF9LlwiLCBjaG9zZW5BY2NvdW50TGFiZWwsIHJlcXVlc3RlZEFjY291bnRMYWJlbCksXG5cdFx0XHR0eXBlOiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0Y2FuY2VsQnV0dG9uOiB0cnVlLFxuXHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgna2VlcCcsICdLZWVwIHswfScsIGNob3NlbkFjY291bnRMYWJlbCksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBjaG9zZW5BY2NvdW50TGFiZWxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2xvZ2luV2l0aCcsICdMb2dpbiB3aXRoIHswfScsIHJlcXVlc3RlZEFjY291bnRMYWJlbCksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiByZXF1ZXN0ZWRBY2NvdW50TGFiZWxcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHR9KTtcblxuXHRcdGlmICghcmVzdWx0LnJlc3VsdCkge1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdC5yZXN1bHQgPT09IGNob3NlbkFjY291bnRMYWJlbDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9HZXRTZXNzaW9uKHByb3ZpZGVySWQ6IHN0cmluZywgc2NvcGVMaXN0T3JSZXF1ZXN0OiBSZWFkb25seUFycmF5PHN0cmluZz4gfCBJQXV0aGVudGljYXRpb25Xd3dBdXRoZW50aWNhdGVSZXF1ZXN0LCBleHRlbnNpb25JZDogc3RyaW5nLCBleHRlbnNpb25OYW1lOiBzdHJpbmcsIG9wdGlvbnM6IEF1dGhlbnRpY2F0aW9uR2V0U2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSBVUkkucmV2aXZlKG9wdGlvbnMuYXV0aG9yaXphdGlvblNlcnZlcik7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlcklkLCBzY29wZUxpc3RPclJlcXVlc3QsIHsgYWNjb3VudDogb3B0aW9ucy5hY2NvdW50LCBhdXRob3JpemF0aW9uU2VydmVyIH0sIHRydWUpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXIocHJvdmlkZXJJZCk7XG5cblx0XHQvLyBFcnJvciBjYXNlc1xuXHRcdGlmIChvcHRpb25zLmZvcmNlTmV3U2Vzc2lvbiAmJiBvcHRpb25zLmNyZWF0ZUlmTm9uZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNvbWJpbmF0aW9uIG9mIG9wdGlvbnMuIFBsZWFzZSByZW1vdmUgb25lIG9mIHRoZSBmb2xsb3dpbmc6IGZvcmNlTmV3U2Vzc2lvbiwgY3JlYXRlSWZOb25lJyk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLmZvcmNlTmV3U2Vzc2lvbiAmJiBvcHRpb25zLnNpbGVudCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNvbWJpbmF0aW9uIG9mIG9wdGlvbnMuIFBsZWFzZSByZW1vdmUgb25lIG9mIHRoZSBmb2xsb3dpbmc6IGZvcmNlTmV3U2Vzc2lvbiwgc2lsZW50Jyk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLmNyZWF0ZUlmTm9uZSAmJiBvcHRpb25zLnNpbGVudCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNvbWJpbmF0aW9uIG9mIG9wdGlvbnMuIFBsZWFzZSByZW1vdmUgb25lIG9mIHRoZSBmb2xsb3dpbmc6IGNyZWF0ZUlmTm9uZSwgc2lsZW50Jyk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMuY2xlYXJTZXNzaW9uUHJlZmVyZW5jZSkge1xuXHRcdFx0Ly8gQ2xlYXJpbmcgdGhlIHNlc3Npb24gcHJlZmVyZW5jZSBpcyB1c3VhbGx5IHBhaXJlZCB3aXRoIGNyZWF0ZUlmTm9uZSwgc28ganVzdCByZW1vdmUgdGhlIHByZWZlcmVuY2UgYW5kXG5cdFx0XHQvLyBkZWZlciB0byB0aGUgcmVzdCBvZiB0aGUgbG9naWMgaW4gdGhpcyBmdW5jdGlvbiB0byBjaG9vc2UgdGhlIHNlc3Npb24uXG5cdFx0XHR0aGlzLmF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UucmVtb3ZlQWNjb3VudFByZWZlcmVuY2UoZXh0ZW5zaW9uSWQsIHByb3ZpZGVySWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1hdGNoaW5nQWNjb3VudFByZWZlcmVuY2VTZXNzaW9uID1cblx0XHRcdC8vIElmIGFuIGFjY291bnQgd2FzIHBhc3NlZCBpbiwgdGhhdCB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgdGhlIGFjY291bnQgcHJlZmVyZW5jZVxuXHRcdFx0b3B0aW9ucy5hY2NvdW50XG5cdFx0XHRcdC8vIFdlIG9ubHkgc3VwcG9ydCBvbmUgc2Vzc2lvbiBwZXIgYWNjb3VudCBwZXIgc2V0IG9mIHNjb3BlcyBzbyBncmFiIHRoZSBmaXJzdCBvbmUgaGVyZVxuXHRcdFx0XHQ/IHNlc3Npb25zWzBdXG5cdFx0XHRcdDogdGhpcy5fZ2V0QWNjb3VudFByZWZlcmVuY2UoZXh0ZW5zaW9uSWQsIHByb3ZpZGVySWQsIHNlc3Npb25zKTtcblxuXHRcdC8vIENoZWNrIGlmIHRoZSBzZXNzaW9ucyB3ZSBoYXZlIGFyZSB2YWxpZFxuXHRcdGlmICghb3B0aW9ucy5mb3JjZU5ld1Nlc3Npb24gJiYgc2Vzc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHQvLyBJZiB3ZSBoYXZlIGFuIGV4aXN0aW5nIHNlc3Npb24gcHJlZmVyZW5jZSwgdXNlIHRoYXQuIElmIG5vdCwgd2UnbGwgcmV0dXJuIGFueSB2YWxpZCBzZXNzaW9uIGF0IHRoZSBlbmQgb2YgdGhpcyBmdW5jdGlvbi5cblx0XHRcdGlmIChtYXRjaGluZ0FjY291bnRQcmVmZXJlbmNlU2Vzc2lvbiAmJiB0aGlzLmF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWQocHJvdmlkZXJJZCwgbWF0Y2hpbmdBY2NvdW50UHJlZmVyZW5jZVNlc3Npb24uYWNjb3VudC5sYWJlbCwgZXh0ZW5zaW9uSWQpKSB7XG5cdFx0XHRcdHJldHVybiBtYXRjaGluZ0FjY291bnRQcmVmZXJlbmNlU2Vzc2lvbjtcblx0XHRcdH1cblx0XHRcdC8vIElmIHdlIG9ubHkgaGF2ZSBvbmUgYWNjb3VudCBmb3IgYSBzaW5nbGUgYXV0aCBwcm92aWRlciwgbGV0cyBqdXN0IGNoZWNrIGlmIGl0J3MgYWxsb3dlZCBhbmQgcmV0dXJuIGl0IGlmIGl0IGlzLlxuXHRcdFx0aWYgKCFwcm92aWRlci5zdXBwb3J0c011bHRpcGxlQWNjb3VudHMgJiYgdGhpcy5hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkKHByb3ZpZGVySWQsIHNlc3Npb25zWzBdLmFjY291bnQubGFiZWwsIGV4dGVuc2lvbklkKSkge1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbnNbMF07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gV2UgbWF5IG5lZWQgdG8gcHJvbXB0IGJlY2F1c2Ugd2UgZG9uJ3QgaGF2ZSBhIHZhbGlkIHNlc3Npb25cblx0XHQvLyBtb2RhbCBmbG93c1xuXHRcdGlmIChvcHRpb25zLmNyZWF0ZUlmTm9uZSB8fCBvcHRpb25zLmZvcmNlTmV3U2Vzc2lvbikge1xuXHRcdFx0bGV0IHVpT3B0aW9uczogQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZU9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodHlwZW9mIG9wdGlvbnMuZm9yY2VOZXdTZXNzaW9uID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHR1aU9wdGlvbnMgPSBvcHRpb25zLmZvcmNlTmV3U2Vzc2lvbjtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMuY3JlYXRlSWZOb25lID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHR1aU9wdGlvbnMgPSBvcHRpb25zLmNyZWF0ZUlmTm9uZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gV2Ugb25seSB3YW50IHRvIHNob3cgdGhlIFwicmVjcmVhdGluZyBzZXNzaW9uXCIgcHJvbXB0IGlmIHdlIGFyZSB1c2luZyBmb3JjZU5ld1Nlc3Npb24gJiB0aGVyZSBhcmUgc2Vzc2lvbnNcblx0XHRcdC8vIHRoYXQgd2Ugd2lsbCBiZSBcImZvcmNpbmcgdGhyb3VnaFwiLlxuXHRcdFx0Y29uc3QgcmVjcmVhdGluZ1Nlc3Npb24gPSAhIShvcHRpb25zLmZvcmNlTmV3U2Vzc2lvbiAmJiBzZXNzaW9ucy5sZW5ndGgpO1xuXHRcdFx0Y29uc3QgaXNBbGxvd2VkID0gYXdhaXQgdGhpcy5sb2dpblByb21wdChwcm92aWRlciwgZXh0ZW5zaW9uTmFtZSwgcmVjcmVhdGluZ1Nlc3Npb24sIHVpT3B0aW9ucyk7XG5cdFx0XHRpZiAoIWlzQWxsb3dlZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VzZXIgZGlkIG5vdCBjb25zZW50IHRvIGxvZ2luLicpO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgc2Vzc2lvbjogQXV0aGVudGljYXRpb25TZXNzaW9uO1xuXHRcdFx0aWYgKHNlc3Npb25zPy5sZW5ndGggJiYgIW9wdGlvbnMuZm9yY2VOZXdTZXNzaW9uKSB7XG5cdFx0XHRcdHNlc3Npb24gPSBwcm92aWRlci5zdXBwb3J0c011bHRpcGxlQWNjb3VudHMgJiYgIW9wdGlvbnMuYWNjb3VudFxuXHRcdFx0XHRcdD8gYXdhaXQgdGhpcy5hdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLnNlbGVjdFNlc3Npb24ocHJvdmlkZXJJZCwgZXh0ZW5zaW9uSWQsIGV4dGVuc2lvbk5hbWUsIHNjb3BlTGlzdE9yUmVxdWVzdCwgc2Vzc2lvbnMpXG5cdFx0XHRcdFx0OiBzZXNzaW9uc1swXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGFjY291bnRUb0NyZWF0ZTogQXV0aGVudGljYXRpb25TZXNzaW9uQWNjb3VudCB8IHVuZGVmaW5lZCA9IG9wdGlvbnMuYWNjb3VudCA/PyBtYXRjaGluZ0FjY291bnRQcmVmZXJlbmNlU2Vzc2lvbj8uYWNjb3VudDtcblx0XHRcdFx0ZG8ge1xuXHRcdFx0XHRcdHNlc3Npb24gPSBhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5jcmVhdGVTZXNzaW9uKFxuXHRcdFx0XHRcdFx0cHJvdmlkZXJJZCxcblx0XHRcdFx0XHRcdHNjb3BlTGlzdE9yUmVxdWVzdCxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0YWN0aXZhdGVJbW1lZGlhdGU6IHRydWUsXG5cdFx0XHRcdFx0XHRcdGFjY291bnQ6IGFjY291bnRUb0NyZWF0ZSxcblx0XHRcdFx0XHRcdFx0YXV0aG9yaXphdGlvblNlcnZlclxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gd2hpbGUgKFxuXHRcdFx0XHRcdGFjY291bnRUb0NyZWF0ZVxuXHRcdFx0XHRcdCYmIGFjY291bnRUb0NyZWF0ZS5sYWJlbCAhPT0gc2Vzc2lvbi5hY2NvdW50LmxhYmVsXG5cdFx0XHRcdFx0JiYgIWF3YWl0IHRoaXMuY29udGludWVXaXRoSW5jb3JyZWN0QWNjb3VudFByb21wdChzZXNzaW9uLmFjY291bnQubGFiZWwsIGFjY291bnRUb0NyZWF0ZS5sYWJlbClcblx0XHRcdFx0KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZEV4dGVuc2lvbnMocHJvdmlkZXJJZCwgc2Vzc2lvbi5hY2NvdW50LmxhYmVsLCBbeyBpZDogZXh0ZW5zaW9uSWQsIG5hbWU6IGV4dGVuc2lvbk5hbWUsIGFsbG93ZWQ6IHRydWUgfV0pO1xuXHRcdFx0dGhpcy5hdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLnVwZGF0ZU5ld1Nlc3Npb25SZXF1ZXN0cyhwcm92aWRlcklkLCBbc2Vzc2lvbl0pO1xuXHRcdFx0dGhpcy5hdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLnVwZGF0ZUFjY291bnRQcmVmZXJlbmNlKGV4dGVuc2lvbklkLCBwcm92aWRlcklkLCBzZXNzaW9uLmFjY291bnQpO1xuXHRcdFx0cmV0dXJuIHNlc3Npb247XG5cdFx0fVxuXG5cdFx0Ly8gRm9yIHRoZSBzaWxlbnQgZmxvd3MsIGlmIHdlIGRvbid0IGhhdmUgYSBzZXNzaW9uIHRoYXQgbWF0Y2hlcyB0aGUgYWNjb3VudCBwcmVmZXJlbmNlLCB3ZSBjYW4gcmV0dXJuIGFueSB2YWxpZCBzZXNzaW9uIGlmIHRoZXJlIGlzIG9ubHkgb25lIHRvIGNob29zZSBmcm9tLlxuXHRcdGlmICghbWF0Y2hpbmdBY2NvdW50UHJlZmVyZW5jZVNlc3Npb24pIHtcblx0XHRcdGNvbnN0IHZhbGlkU2Vzc2lvbnMgPSBzZXNzaW9ucy5maWx0ZXIoc2Vzc2lvbiA9PiB0aGlzLmF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWQocHJvdmlkZXJJZCwgc2Vzc2lvbi5hY2NvdW50LmxhYmVsLCBleHRlbnNpb25JZCkpO1xuXHRcdFx0aWYgKHZhbGlkU2Vzc2lvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdHJldHVybiB2YWxpZFNlc3Npb25zWzBdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHBhc3NpdmUgZmxvd3MgKHNpbGVudCBvciBkZWZhdWx0KVxuXHRcdGlmICghb3B0aW9ucy5zaWxlbnQpIHtcblx0XHRcdC8vIElmIHRoZXJlIGlzIGEgcG90ZW50aWFsIHNlc3Npb24sIGJ1dCB0aGUgZXh0ZW5zaW9uIGRvZXNuJ3QgaGF2ZSBhY2Nlc3MgdG8gaXQsIHVzZSB0aGUgXCJncmFudCBhY2Nlc3NcIiBmbG93LFxuXHRcdFx0Ly8gb3RoZXJ3aXNlIHJlcXVlc3QgYSBuZXcgb25lLlxuXHRcdFx0c2Vzc2lvbnMubGVuZ3RoXG5cdFx0XHRcdD8gdGhpcy5hdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLnJlcXVlc3RTZXNzaW9uQWNjZXNzKHByb3ZpZGVySWQsIGV4dGVuc2lvbklkLCBleHRlbnNpb25OYW1lLCBzY29wZUxpc3RPclJlcXVlc3QsIHNlc3Npb25zKVxuXHRcdFx0XHQ6IGF3YWl0IHRoaXMuYXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZS5yZXF1ZXN0TmV3U2Vzc2lvbihwcm92aWRlcklkLCBzY29wZUxpc3RPclJlcXVlc3QsIGV4dGVuc2lvbklkLCBleHRlbnNpb25OYW1lKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jICRnZXRTZXNzaW9uKHByb3ZpZGVySWQ6IHN0cmluZywgc2NvcGVMaXN0T3JSZXF1ZXN0OiBSZWFkb25seUFycmF5PHN0cmluZz4gfCBJQXV0aGVudGljYXRpb25Xd3dBdXRoZW50aWNhdGVSZXF1ZXN0LCBleHRlbnNpb25JZDogc3RyaW5nLCBleHRlbnNpb25OYW1lOiBzdHJpbmcsIG9wdGlvbnM6IEF1dGhlbnRpY2F0aW9uR2V0U2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPER0bzxBdXRoZW50aWNhdGlvblNlc3Npb24+IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc2NvcGVzID0gaXNBdXRoZW50aWNhdGlvbld3d0F1dGhlbnRpY2F0ZVJlcXVlc3Qoc2NvcGVMaXN0T3JSZXF1ZXN0KSA/IHNjb3BlTGlzdE9yUmVxdWVzdC5mYWxsYmFja1Njb3BlcyA6IHNjb3BlTGlzdE9yUmVxdWVzdDtcblx0XHRpZiAoc2NvcGVzKSB7XG5cdFx0XHR0aGlzLnNlbmRDbGllbnRJZFVzYWdlVGVsZW1ldHJ5KGV4dGVuc2lvbklkLCBwcm92aWRlcklkLCBzY29wZXMpO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5kb0dldFNlc3Npb24ocHJvdmlkZXJJZCwgc2NvcGVMaXN0T3JSZXF1ZXN0LCBleHRlbnNpb25JZCwgZXh0ZW5zaW9uTmFtZSwgb3B0aW9ucyk7XG5cblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5zZW5kUHJvdmlkZXJVc2FnZVRlbGVtZXRyeShleHRlbnNpb25JZCwgcHJvdmlkZXJJZCk7XG5cdFx0XHR0aGlzLmF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLmFkZEFjY291bnRVc2FnZShwcm92aWRlcklkLCBzZXNzaW9uLmFjY291bnQubGFiZWwsIHNlc3Npb24uc2NvcGVzLCBleHRlbnNpb25JZCwgZXh0ZW5zaW9uTmFtZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHRhc3luYyAkZ2V0QWNjb3VudHMocHJvdmlkZXJJZDogc3RyaW5nKTogUHJvbWlzZTxSZWFkb25seUFycmF5PER0bzxBdXRoZW50aWNhdGlvblNlc3Npb25BY2NvdW50Pj4+IHtcblx0XHRjb25zdCBhY2NvdW50cyA9IGF3YWl0IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldEFjY291bnRzKHByb3ZpZGVySWQpO1xuXHRcdHJldHVybiBhY2NvdW50cztcblx0fVxuXG5cdC8vIFRPRE9AVHlsZXJMZW9uaGFyZHQgdGhpcyBpcyBhIHRlbXBvcmFyeSBhZGRpdGlvbiB0byB0ZWxlbWV0cnkgdG8gdW5kZXJzdGFuZCB3aGF0IGV4dGVuc2lvbnMgYXJlIG92ZXJyaWRpbmcgdGhlIGNsaWVudCBpZC5cblx0Ly8gV2UgY2FuIHVzZSB0aGlzIHRlbGVtZXRyeSB0byByZWFjaCBvdXQgdG8gdGhlc2UgZXh0ZW5zaW9uIGF1dGhvcnMgYW5kIGxldCB0aGVtIGtub3cgdGhhdCB0aGV5IG1hbnkgbmVlZCBjb25maWd1cmF0aW9uIGNoYW5nZXNcblx0Ly8gZHVlIHRvIHRoZSBhZG9wdGlvbiBvZiB0aGUgTWljcm9zb2Z0IGJyb2tlci5cblx0Ly8gUmVtb3ZlIHRoaXMgaW4gYSBmZXcgaXRlcmF0aW9ucy5cblx0cHJpdmF0ZSBfc2VudENsaWVudElkVXNhZ2VFdmVudHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSBzZW5kQ2xpZW50SWRVc2FnZVRlbGVtZXRyeShleHRlbnNpb25JZDogc3RyaW5nLCBwcm92aWRlcklkOiBzdHJpbmcsIHNjb3BlczogcmVhZG9ubHkgc3RyaW5nW10pOiB2b2lkIHtcblx0XHRjb25zdCBjb250YWluc1ZTQ29kZUNsaWVudElkU2NvcGUgPSBzY29wZXMuc29tZShzY29wZSA9PiBzY29wZS5zdGFydHNXaXRoKCdWU0NPREVfQ0xJRU5UX0lEOicpKTtcblx0XHRjb25zdCBrZXkgPSBgJHtleHRlbnNpb25JZH18JHtwcm92aWRlcklkfXwke2NvbnRhaW5zVlNDb2RlQ2xpZW50SWRTY29wZX1gO1xuXHRcdGlmICh0aGlzLl9zZW50Q2xpZW50SWRVc2FnZUV2ZW50cy5oYXMoa2V5KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zZW50Q2xpZW50SWRVc2FnZUV2ZW50cy5hZGQoa2V5KTtcblx0XHRpZiAoY29udGFpbnNWU0NvZGVDbGllbnRJZFNjb3BlKSB7XG5cdFx0XHR0eXBlIENsaWVudElkVXNhZ2VDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0b3duZXI6ICdUeWxlckxlb25oYXJkdCc7XG5cdFx0XHRcdGNvbW1lbnQ6ICdVc2VkIHRvIHNlZSB3aGljaCBleHRlbnNpb25zIGFyZSB1c2luZyB0aGUgVlNDb2RlIGNsaWVudCBpZCBvdmVycmlkZSc7XG5cdFx0XHRcdGV4dGVuc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGV4dGVuc2lvbiBpZC4nIH07XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8eyBleHRlbnNpb25JZDogc3RyaW5nIH0sIENsaWVudElkVXNhZ2VDbGFzc2lmaWNhdGlvbj4oJ2F1dGhlbnRpY2F0aW9uLmNsaWVudElkVXNhZ2UnLCB7IGV4dGVuc2lvbklkIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2VuZFByb3ZpZGVyVXNhZ2VUZWxlbWV0cnkoZXh0ZW5zaW9uSWQ6IHN0cmluZywgcHJvdmlkZXJJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gYCR7ZXh0ZW5zaW9uSWR9fCR7cHJvdmlkZXJJZH1gO1xuXHRcdGlmICh0aGlzLl9zZW50UHJvdmlkZXJVc2FnZUV2ZW50cy5oYXMoa2V5KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zZW50UHJvdmlkZXJVc2FnZUV2ZW50cy5hZGQoa2V5KTtcblx0XHR0eXBlIEF1dGhQcm92aWRlclVzYWdlQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ1R5bGVyTGVvbmhhcmR0Jztcblx0XHRcdGNvbW1lbnQ6ICdVc2VkIHRvIHNlZSB3aGljaCBleHRlbnNpb25zIGFyZSB1c2luZyB3aGljaCBwcm92aWRlcnMnO1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgZXh0ZW5zaW9uIGlkLicgfTtcblx0XHRcdHByb3ZpZGVySWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgcHJvdmlkZXIgaWQuJyB9O1xuXHRcdH07XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8eyBleHRlbnNpb25JZDogc3RyaW5nOyBwcm92aWRlcklkOiBzdHJpbmcgfSwgQXV0aFByb3ZpZGVyVXNhZ2VDbGFzc2lmaWNhdGlvbj4oJ2F1dGhlbnRpY2F0aW9uLnByb3ZpZGVyVXNhZ2UnLCB7IHByb3ZpZGVySWQsIGV4dGVuc2lvbklkIH0pO1xuXHR9XG5cblx0Ly8jcmVnaW9uIEFjY291bnQgUHJlZmVyZW5jZXNcblx0Ly8gVE9ET0BUeWxlckxlb25oYXJkdDogVXBkYXRlIHRoaXMgYWZ0ZXIgYSBmZXcgaXRlcmF0aW9ucyB0byBubyBsb25nZXIgZmFsbGJhY2sgdG8gdGhlIHNlc3Npb24gcHJlZmVyZW5jZVxuXG5cdHByaXZhdGUgX2dldEFjY291bnRQcmVmZXJlbmNlKGV4dGVuc2lvbklkOiBzdHJpbmcsIHByb3ZpZGVySWQ6IHN0cmluZywgc2Vzc2lvbnM6IFJlYWRvbmx5QXJyYXk8QXV0aGVudGljYXRpb25TZXNzaW9uPik6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgYWNjb3VudE5hbWVQcmVmZXJlbmNlID0gdGhpcy5hdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLmdldEFjY291bnRQcmVmZXJlbmNlKGV4dGVuc2lvbklkLCBwcm92aWRlcklkKTtcblx0XHRpZiAoYWNjb3VudE5hbWVQcmVmZXJlbmNlKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnMuZmluZChzZXNzaW9uID0+IHNlc3Npb24uYWNjb3VudC5sYWJlbCA9PT0gYWNjb3VudE5hbWVQcmVmZXJlbmNlKTtcblx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdC8vI2VuZHJlZ2lvblxuXG5cdGFzeW5jICRzaG93RGV2aWNlQ29kZU1vZGFsKHVzZXJDb2RlOiBzdHJpbmcsIHZlcmlmaWNhdGlvblVyaTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnZGV2aWNlQ29kZVRpdGxlJywgXCJEZXZpY2UgQ29kZSBBdXRoZW50aWNhdGlvblwiKSxcblx0XHRcdGRldGFpbDogbmxzLmxvY2FsaXplKCdkZXZpY2VDb2RlRGV0YWlsJywgXCJZb3VyIGNvZGU6IHswfVxcblxcblRvIGNvbXBsZXRlIGF1dGhlbnRpY2F0aW9uLCBuYXZpZ2F0ZSB0byB7MX0gYW5kIGVudGVyIHRoZSBjb2RlIGFib3ZlLlwiLCB1c2VyQ29kZSwgdmVyaWZpY2F0aW9uVXJpKSxcblx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2NvcHlBbmRDb250aW51ZScsIFwiQ29weSAmIENvbnRpbnVlXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0Y2FuY2VsQnV0dG9uOiB0cnVlXG5cdFx0fSk7XG5cblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHQvLyBPcGVuIHZlcmlmaWNhdGlvbiBVUklcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQodXNlckNvZGUpO1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKHZlcmlmaWNhdGlvblVyaSkpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgnZmFpbGVkVG9PcGVuVXJpJywgXCJGYWlsZWQgdG8gb3BlbiB7MH1cIiwgdmVyaWZpY2F0aW9uVXJpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGFzeW5jICRwcm9tcHRGb3JDbGllbnRSZWdpc3RyYXRpb24oYXV0aG9yaXphdGlvblNlcnZlclVybDogc3RyaW5nKTogUHJvbWlzZTx7IGNsaWVudElkOiBzdHJpbmc7IGNsaWVudFNlY3JldD86IHN0cmluZyB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVkaXJlY3RVcmxzID0gJ2h0dHA6Ly8xMjcuMC4wLjE6MzM0MThcXG5odHRwczovL3ZzY29kZS5kZXYvcmVkaXJlY3QnO1xuXG5cdFx0Ly8gU2hvdyBtb2RhbCBkaWFsb2cgZmlyc3QgdG8gZXhwbGFpbiB0aGUgc2l0dWF0aW9uIGFuZCBnZXQgdXNlciBjb25zZW50XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdkY3JOb3RTdXBwb3J0ZWQnLCBcIkR5bmFtaWMgQ2xpZW50IFJlZ2lzdHJhdGlvbiBub3Qgc3VwcG9ydGVkXCIpLFxuXHRcdFx0ZGV0YWlsOiBubHMubG9jYWxpemUoJ2Rjck5vdFN1cHBvcnRlZERldGFpbCcsIFwiVGhlIGF1dGhvcml6YXRpb24gc2VydmVyICd7MH0nIGRvZXMgbm90IHN1cHBvcnQgYXV0b21hdGljIGNsaWVudCByZWdpc3RyYXRpb24uIERvIHlvdSB3YW50IHRvIHByb2NlZWQgYnkgbWFudWFsbHkgcHJvdmlkaW5nIGEgY2xpZW50IHJlZ2lzdHJhdGlvbiAoY2xpZW50IElEKT9cXG5cXG5Ob3RlOiBXaGVuIHJlZ2lzdGVyaW5nIHlvdXIgT0F1dGggYXBwbGljYXRpb24sIG1ha2Ugc3VyZSB0byBpbmNsdWRlIHRoZXNlIHJlZGlyZWN0IFVSSXM6XFxuezF9XCIsIGF1dGhvcml6YXRpb25TZXJ2ZXJVcmwsIHJlZGlyZWN0VXJscyksXG5cdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdkY3JDb3B5VXJsc0FuZFByb2NlZWQnLCBcIkNvcHkgVVJJcyAmIFByb2NlZWRcIiksXG5cdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHJlZGlyZWN0VXJscyk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobmxzLmxvY2FsaXplKCdkY3JGYWlsZWRUb0NvcHknLCBcIkZhaWxlZCB0byBjb3B5IHJlZGlyZWN0IFVSSXMgdG8gY2xpcGJvYXJkLlwiKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0Y2FuY2VsQnV0dG9uOiB7XG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2NhbmNlbCcsIFwiQ2FuY2VsXCIpLFxuXHRcdFx0XHRydW46ICgpID0+IGZhbHNlXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBzaGFyZWRUaXRsZSA9IG5scy5sb2NhbGl6ZSgnYWRkQ2xpZW50UmVnaXN0cmF0aW9uRGV0YWlscycsIFwiQWRkIENsaWVudCBSZWdpc3RyYXRpb24gRGV0YWlsc1wiKTtcblxuXHRcdGNvbnN0IGNsaWVudElkID0gYXdhaXQgdGhpcy5xdWlja0lucHV0U2VydmljZS5pbnB1dCh7XG5cdFx0XHR0aXRsZTogc2hhcmVkVGl0bGUsXG5cdFx0XHRwcm9tcHQ6IG5scy5sb2NhbGl6ZSgnY2xpZW50SWRQcm9tcHQnLCBcIkVudGVyIGFuIGV4aXN0aW5nIGNsaWVudCBJRCB0aGF0IGhhcyBiZWVuIHJlZ2lzdGVyZWQgd2l0aCB0aGUgZm9sbG93aW5nIHJlZGlyZWN0IFVSSXM6IGh0dHA6Ly8xMjcuMC4wLjE6MzM0MTgsIGh0dHBzOi8vdnNjb2RlLmRldi9yZWRpcmVjdFwiKSxcblx0XHRcdHBsYWNlSG9sZGVyOiBubHMubG9jYWxpemUoJ2NsaWVudElkUGxhY2Vob2xkZXInLCBcIk9BdXRoIGNsaWVudCBJRCAoYXp5ZTM5ZC4uLilcIiksXG5cdFx0XHRpZ25vcmVGb2N1c0xvc3Q6IHRydWUsXG5cdFx0XHR2YWxpZGF0ZUlucHV0OiBhc3luYyAodmFsdWU6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRpZiAoIXZhbHVlIHx8IHZhbHVlLnRyaW0oKS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdjbGllbnRJZFJlcXVpcmVkJywgXCJDbGllbnQgSUQgaXMgcmVxdWlyZWRcIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmICghY2xpZW50SWQgfHwgY2xpZW50SWQudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBjbGllbnRTZWNyZXQgPSBhd2FpdCB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmlucHV0KHtcblx0XHRcdHRpdGxlOiBzaGFyZWRUaXRsZSxcblx0XHRcdHByb21wdDogbmxzLmxvY2FsaXplKCdjbGllbnRTZWNyZXRQcm9tcHQnLCBcIihvcHRpb25hbCkgRW50ZXIgYW4gZXhpc3RpbmcgY2xpZW50IHNlY3JldCBhc3NvY2lhdGVkIHdpdGggdGhlIGNsaWVudCBpZCAnezB9JyBvciBsZWF2ZSB0aGlzIGZpZWxkIGJsYW5rXCIsIGNsaWVudElkKSxcblx0XHRcdHBsYWNlSG9sZGVyOiBubHMubG9jYWxpemUoJ2NsaWVudFNlY3JldFBsYWNlaG9sZGVyJywgXCJPQXV0aCBjbGllbnQgc2VjcmV0ICh3ZXIzMm81MGYuLi4pIG9yIGxlYXZlIGl0IGJsYW5rXCIpLFxuXHRcdFx0cGFzc3dvcmQ6IHRydWUsXG5cdFx0XHRpZ25vcmVGb2N1c0xvc3Q6IHRydWVcblx0XHR9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRjbGllbnRJZDogY2xpZW50SWQudHJpbSgpLFxuXHRcdFx0Y2xpZW50U2VjcmV0OiBjbGllbnRTZWNyZXQ/LnRyaW0oKSB8fCB1bmRlZmluZWRcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgJHByb21wdEZvclJlc291cmNlQ2xpZW50U2VjcmV0KHJlc291cmNlQ2xpZW50SWQ6IHN0cmluZywgcmVzb3VyY2U6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gU3VyZmFjZSB0byB0aGUgdXNlciB0aGF0IHdoYXRldmVyIHRoZXkgZW50ZXIgKGluY2x1ZGluZyBibGFuayA9PSBub25lKSB3aWxsIGJlIHJlbWVtYmVyZWRcblx0XHQvLyBpbiBPUyBzZWNyZXQgc3RvcmFnZSwgc2NvcGVkIHRvIHRoZSBNQ1Agc2VydmVyIFVSTCArIHRoZSByZXNvdXJjZSBjbGllbnRfaWQuIFRoaXMgbWVhbnM6XG5cdFx0Ly8gICAtIHRoZSBjb2RlbGVucyBhYm92ZSBgb2F1dGguY2xpZW50SWRgIGluIG1jcC5qc29uIHdpbGwgZmxpcCB0byBcIlJlcGxhY2UgQ2xpZW50IFNlY3JldFwiXG5cdFx0Ly8gICAtIHN1YnNlcXVlbnQgcnVucyByZWFkIHRoZSBzZWNyZXQgZGlyZWN0bHkgZnJvbSBzdG9yYWdlIGFuZCBuZXZlciByZS1wcm9tcHQuXG5cdFx0Ly9cblx0XHQvLyBSZXR1cm4gY29udHJhY3Q6XG5cdFx0Ly8gICAtIGB1bmRlZmluZWRgIFx1MjAxNCB1c2VyIHByZXNzZWQgRXNjYXBlIChjYW5jZWxsZWQpLiBDYWxsZXIgc2hvdWxkIE5PVCBjYWNoZTsgcmUtcHJvbXB0IGFsbG93ZWQuXG5cdFx0Ly8gICAtIGAnJ2AgKGVtcHR5IHN0cmluZykgXHUyMDE0IHVzZXIgcHJlc3NlZCBFbnRlciB3aXRoIGJsYW5rIGlucHV0IChcIm5vIHNlY3JldFwiKS4gQ2FsbGVyIFNIT1VMRFxuXHRcdC8vICAgICBjYWNoZSB0aGlzIGFzIGFuIGV4cGxpY2l0IGFuc3dlciAocHVibGljIGNsaWVudCAvIHRva2VuX2VuZHBvaW50X2F1dGhfbWV0aG9kPW5vbmUpLlxuXHRcdC8vICAgLSBgJ3ZhbHVlJ2AgXHUyMDE0IHVzZXIgc3VwcGxpZWQgYSBzZWNyZXQuXG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmlucHV0KHtcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3hhYVJlc291cmNlU2VjcmV0VGl0bGUnLCBcIlJlc291cmNlIENsaWVudCBTZWNyZXQgUmVxdWlyZWRcIiksXG5cdFx0XHRwcm9tcHQ6IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0J3hhYVJlc291cmNlU2VjcmV0UHJvbXB0Jyxcblx0XHRcdFx0XCJUaGUgcmVzb3VyY2UgYXQgJ3swfScgdXNlcyBhIHBlci1yZXNvdXJjZSBjbGllbnQgaWRlbnRpZmllciAnezF9Jy4gRW50ZXIgdGhlIG1hdGNoaW5nIGNsaWVudCBzZWNyZXQgKGxlYXZlIGJsYW5rIGlmIG5vbmUpLiBUaGUgdmFsdWUgaXMgc2F2ZWQgaW4gT1Mgc2VjcmV0IHN0b3JhZ2U7IG1hbmFnZSBpdCBsYXRlciB2aWEgdGhlICdTZXQgQ2xpZW50IFNlY3JldCcgY29kZSBsZW5zIGluIG1jcC5qc29uLlwiLFxuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0cmVzb3VyY2VDbGllbnRJZCxcblx0XHRcdCksXG5cdFx0XHRwbGFjZUhvbGRlcjogbmxzLmxvY2FsaXplKCd4YWFSZXNvdXJjZVNlY3JldFBsYWNlaG9sZGVyJywgXCJSZXNvdXJjZSBjbGllbnQgc2VjcmV0XCIpLFxuXHRcdFx0cGFzc3dvcmQ6IHRydWUsXG5cdFx0XHRpZ25vcmVGb2N1c0xvc3Q6IHRydWUsXG5cdFx0fSk7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIFVzZXIgY2FuY2VsbGVkIChFc2NhcGUpLiBEb24ndCBwZXJzaXN0IGFueXRoaW5nLlxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdHJpbW1lZCA9IHZhbHVlLnRyaW0oKTtcblx0XHRjb25zdCBrZXkgPSBtY3BPQXV0aENsaWVudFNlY3JldFN0b3JhZ2VLZXkocmVzb3VyY2UsIHJlc291cmNlQ2xpZW50SWQpO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAodHJpbW1lZC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Ly8gQmxhbmstb24tY29uZmlybSBtZWFucyBcIm5vIGNsaWVudCBzZWNyZXRcIiAoZS5nLiB0b2tlbl9lbmRwb2ludF9hdXRoX21ldGhvZD1ub25lKS5cblx0XHRcdFx0Ly8gQ2xlYXIgYW55IHN0YWxlIHZhbHVlIHNvIHN1YnNlcXVlbnQgcHJvbXB0cyBjYW4gc3RpbGwgY2FwdHVyZSBhIGZyZXNoIHNlY3JldCBpZiBuZWVkZWQuXG5cdFx0XHRcdGF3YWl0IHRoaXMuc2VjcmV0U3RvcmFnZVNlcnZpY2UuZGVsZXRlKGtleSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnNlY3JldFN0b3JhZ2VTZXJ2aWNlLnNldChrZXksIHRyaW1tZWQpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFtYQUFdIEZhaWxlZCB0byBwZXJzaXN0IHJlc291cmNlIGNsaWVudCBzZWNyZXQgZm9yICR7cmVzb3VyY2V9IC8gJHtyZXNvdXJjZUNsaWVudElkfTogJHsoZXJyIGFzIEVycm9yKS5tZXNzYWdlfWApO1xuXHRcdH1cblx0XHQvLyBEaXN0aW5jdCBmcm9tIGNhbmNlbDogcmV0dXJuICcnIChub3QgdW5kZWZpbmVkKSBmb3IgYmxhbmstb24tY29uZmlybSBzbyBjYWxsZXJzIGNhblxuXHRcdC8vIHByb2NlZWQgd2l0aG91dCBhIGNsaWVudCBzZWNyZXQgaW5zdGVhZCBvZiB0cmVhdGluZyBpdCBhcyBhIGNhbmNlbC5cblx0XHRyZXR1cm4gdHJpbW1lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQVkscUJBQXFCO0FBQzFDLFlBQVksU0FBUztBQUNyQixTQUFTLDRCQUE2QztBQUN0RCxTQUFtRSxvQ0FBNkQsd0JBQXdCLGtDQUF1Ryw4Q0FBZ0g7QUFDL1csU0FBcUMsZ0JBQXVHLG1CQUFrRDtBQUM5TCxTQUFTLHNCQUFxQztBQUM5QyxPQUFPLGNBQWM7QUFDckIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxnQkFBZ0IseUJBQXlCO0FBQ2xELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxnREFBZ0Q7QUFDekQsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlCQUF5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QUEsTUFDdkQsT0FBTztBQUFBLE1BQ1AsUUFBUSxJQUFJLFNBQVMsc0JBQXNCLDRHQUE0RyxRQUFRO0FBQUEsTUFDL0osYUFBYSxJQUFJLFNBQVMsMkJBQTJCLHNEQUFzRDtBQUFBLE1BQzNHLFVBQVU7QUFBQSxNQUNWLGlCQUFpQjtBQUFBLElBQ2xCLENBQUM7QUFFRCxXQUFPO0FBQUEsTUFDTixVQUFVLFNBQVMsS0FBSztBQUFBLE1BQ3hCLGNBQWMsY0FBYyxLQUFLLEtBQUs7QUFBQSxJQUN2QztBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sK0JBQStCLGtCQUEwQixVQUErQztBQVc3RyxVQUFNLFFBQVEsTUFBTSxLQUFLLGtCQUFrQixNQUFNO0FBQUEsTUFDaEQsT0FBTyxJQUFJLFNBQVMsMEJBQTBCLGlDQUFpQztBQUFBLE1BQy9FLFFBQVEsSUFBSTtBQUFBLFFBQ1g7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxhQUFhLElBQUksU0FBUyxnQ0FBZ0Msd0JBQXdCO0FBQUEsTUFDbEYsVUFBVTtBQUFBLE1BQ1YsaUJBQWlCO0FBQUEsSUFDbEIsQ0FBQztBQUNELFFBQUksVUFBVSxRQUFXO0FBRXhCLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxVQUFVLE1BQU0sS0FBSztBQUMzQixVQUFNLE1BQU0sK0JBQStCLFVBQVUsZ0JBQWdCO0FBQ3JFLFFBQUk7QUFDSCxVQUFJLFFBQVEsV0FBVyxHQUFHO0FBR3pCLGNBQU0sS0FBSyxxQkFBcUIsT0FBTyxHQUFHO0FBQUEsTUFDM0MsT0FBTztBQUNOLGNBQU0sS0FBSyxxQkFBcUIsSUFBSSxLQUFLLE9BQU87QUFBQSxNQUNqRDtBQUFBLElBQ0QsU0FBUyxLQUFLO0FBQ2IsV0FBSyxXQUFXLEtBQUssc0RBQXNELFFBQVEsTUFBTSxnQkFBZ0IsS0FBTSxJQUFjLE9BQU8sRUFBRTtBQUFBLElBQ3ZJO0FBR0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQXRuQmEsMkJBQU47QUFBQSxFQUROLHFCQUFxQixZQUFZLHdCQUF3QjtBQUFBLEVBVXZEO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBekJVOyIsCiAgIm5hbWVzIjogWyJyZXN1bHQiLCAic2Vzc2lvbiJdCn0K
