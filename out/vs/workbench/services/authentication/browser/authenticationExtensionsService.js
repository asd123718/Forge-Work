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
import { Disposable, DisposableStore, dispose, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { scopesMatch } from "../../../../base/common/oauth.js";
import * as nls from "../../../../nls.js";
import { MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { Severity } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IActivityService, NumberBadge } from "../../activity/common/activity.js";
import { IAuthenticationAccessService } from "./authenticationAccessService.js";
import { IAuthenticationUsageService } from "./authenticationUsageService.js";
import { IAuthenticationService, IAuthenticationExtensionsService, isAuthenticationWwwAuthenticateRequest } from "../common/authentication.js";
import { Emitter } from "../../../../base/common/event.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
const SCOPESLIST_SEPARATOR = " ";
let AuthenticationExtensionsService = class extends Disposable {
  constructor(activityService, storageService, dialogService, quickInputService, _productService, _authenticationService, _authenticationUsageService, _authenticationAccessService) {
    super();
    this.activityService = activityService;
    this.storageService = storageService;
    this.dialogService = dialogService;
    this.quickInputService = quickInputService;
    this._productService = _productService;
    this._authenticationService = _authenticationService;
    this._authenticationUsageService = _authenticationUsageService;
    this._authenticationAccessService = _authenticationAccessService;
    this._signInRequestItems = /* @__PURE__ */ new Map();
    this._sessionAccessRequestItems = /* @__PURE__ */ new Map();
    this._accountBadgeDisposable = this._register(new MutableDisposable());
    this._onDidAccountPreferenceChange = this._register(new Emitter());
    this.onDidChangeAccountPreference = this._onDidAccountPreferenceChange.event;
    this._inheritAuthAccountPreferenceParentToChildren = this._productService.inheritAuthAccountPreference || {};
    this._inheritAuthAccountPreferenceChildToParent = Object.entries(this._inheritAuthAccountPreferenceParentToChildren).reduce((acc, [parent, children]) => {
      children.forEach((child) => {
        acc[child] = parent;
      });
      return acc;
    }, {});
    this.registerListeners();
  }
  registerListeners() {
    this._register(this._authenticationService.onDidChangeSessions((e) => {
      if (e.event.added?.length) {
        this.updateNewSessionRequests(e.providerId, e.event.added);
      }
      if (e.event.removed?.length) {
        this.updateAccessRequests(e.providerId, e.event.removed);
      }
    }));
    this._register(this._authenticationService.onDidUnregisterAuthenticationProvider((e) => {
      const accessRequests = this._sessionAccessRequestItems.get(e.id) || {};
      Object.keys(accessRequests).forEach((extensionId) => {
        this.removeAccessRequest(e.id, extensionId);
      });
    }));
  }
  updateNewSessionRequests(providerId, addedSessions) {
    const existingRequestsForProvider = this._signInRequestItems.get(providerId);
    if (!existingRequestsForProvider) {
      return;
    }
    Object.keys(existingRequestsForProvider).forEach((requestedScopes) => {
      const requestedScopesArray = requestedScopes.split(SCOPESLIST_SEPARATOR);
      if (addedSessions.some((session) => scopesMatch(session.scopes, requestedScopesArray))) {
        const sessionRequest = existingRequestsForProvider[requestedScopes];
        sessionRequest?.disposables.forEach((item) => item.dispose());
        delete existingRequestsForProvider[requestedScopes];
        if (Object.keys(existingRequestsForProvider).length === 0) {
          this._signInRequestItems.delete(providerId);
        } else {
          this._signInRequestItems.set(providerId, existingRequestsForProvider);
        }
        this.updateBadgeCount();
      }
    });
  }
  updateAccessRequests(providerId, removedSessions) {
    const providerRequests = this._sessionAccessRequestItems.get(providerId);
    if (providerRequests) {
      Object.keys(providerRequests).forEach((extensionId) => {
        removedSessions.forEach((removed) => {
          const indexOfSession = providerRequests[extensionId].possibleSessions.findIndex((session) => session.id === removed.id);
          if (indexOfSession) {
            providerRequests[extensionId].possibleSessions.splice(indexOfSession, 1);
          }
        });
        if (!providerRequests[extensionId].possibleSessions.length) {
          this.removeAccessRequest(providerId, extensionId);
        }
      });
    }
  }
  updateBadgeCount() {
    this._accountBadgeDisposable.clear();
    let numberOfRequests = 0;
    this._signInRequestItems.forEach((providerRequests) => {
      Object.keys(providerRequests).forEach((request) => {
        numberOfRequests += providerRequests[request].requestingExtensionIds.length;
      });
    });
    this._sessionAccessRequestItems.forEach((accessRequest) => {
      numberOfRequests += Object.keys(accessRequest).length;
    });
    if (numberOfRequests > 0) {
      const badge = new NumberBadge(numberOfRequests, () => nls.localize("sign in", "Sign in requested"));
      this._accountBadgeDisposable.value = this.activityService.showAccountsActivity({ badge });
    }
  }
  removeAccessRequest(providerId, extensionId) {
    const providerRequests = this._sessionAccessRequestItems.get(providerId) || {};
    if (providerRequests[extensionId]) {
      dispose(providerRequests[extensionId].disposables);
      delete providerRequests[extensionId];
      this.updateBadgeCount();
    }
  }
  //#region Account/Session Preference
  updateAccountPreference(extensionId, providerId, account) {
    const realExtensionId = ExtensionIdentifier.toKey(extensionId);
    const parentExtensionId = this._inheritAuthAccountPreferenceChildToParent[realExtensionId] ?? realExtensionId;
    const key = this._getKey(parentExtensionId, providerId);
    this.storageService.store(key, account.label, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    this.storageService.store(key, account.label, StorageScope.APPLICATION, StorageTarget.MACHINE);
    const childrenExtensions = this._inheritAuthAccountPreferenceParentToChildren[parentExtensionId];
    const extensionIds = childrenExtensions ? [parentExtensionId, ...childrenExtensions] : [parentExtensionId];
    this._onDidAccountPreferenceChange.fire({ extensionIds, providerId });
  }
  getAccountPreference(extensionId, providerId) {
    const realExtensionId = ExtensionIdentifier.toKey(extensionId);
    const key = this._getKey(this._inheritAuthAccountPreferenceChildToParent[realExtensionId] ?? realExtensionId, providerId);
    return this.storageService.get(key, StorageScope.WORKSPACE) ?? this.storageService.get(key, StorageScope.APPLICATION);
  }
  removeAccountPreference(extensionId, providerId) {
    const realExtensionId = ExtensionIdentifier.toKey(extensionId);
    const key = this._getKey(this._inheritAuthAccountPreferenceChildToParent[realExtensionId] ?? realExtensionId, providerId);
    this.storageService.remove(key, StorageScope.WORKSPACE);
    this.storageService.remove(key, StorageScope.APPLICATION);
  }
  _getKey(extensionId, providerId) {
    return `${extensionId}-${providerId}`;
  }
  // TODO@TylerLeonhardt: Remove all of this after a couple iterations
  updateSessionPreference(providerId, extensionId, session) {
    const realExtensionId = ExtensionIdentifier.toKey(extensionId);
    const key = `${realExtensionId}-${providerId}-${session.scopes.join(SCOPESLIST_SEPARATOR)}`;
    this.storageService.store(key, session.id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    this.storageService.store(key, session.id, StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
  getSessionPreference(providerId, extensionId, scopes) {
    const realExtensionId = ExtensionIdentifier.toKey(extensionId);
    const key = `${realExtensionId}-${providerId}-${scopes.join(SCOPESLIST_SEPARATOR)}`;
    return this.storageService.get(key, StorageScope.WORKSPACE) ?? this.storageService.get(key, StorageScope.APPLICATION);
  }
  removeSessionPreference(providerId, extensionId, scopes) {
    const realExtensionId = ExtensionIdentifier.toKey(extensionId);
    const key = `${realExtensionId}-${providerId}-${scopes.join(SCOPESLIST_SEPARATOR)}`;
    this.storageService.remove(key, StorageScope.WORKSPACE);
    this.storageService.remove(key, StorageScope.APPLICATION);
  }
  _updateAccountAndSessionPreferences(providerId, extensionId, session) {
    this.updateAccountPreference(extensionId, providerId, session.account);
    this.updateSessionPreference(providerId, extensionId, session);
  }
  //#endregion
  async showGetSessionPrompt(provider, accountName, extensionId, extensionName) {
    let SessionPromptChoice;
    ((SessionPromptChoice2) => {
      SessionPromptChoice2[SessionPromptChoice2["Allow"] = 0] = "Allow";
      SessionPromptChoice2[SessionPromptChoice2["Deny"] = 1] = "Deny";
      SessionPromptChoice2[SessionPromptChoice2["Cancel"] = 2] = "Cancel";
    })(SessionPromptChoice || (SessionPromptChoice = {}));
    const { result } = await this.dialogService.prompt({
      type: Severity.Info,
      message: nls.localize("confirmAuthenticationAccess", "The extension '{0}' wants to access the {1} account '{2}'.", extensionName, provider.label, accountName),
      buttons: [
        {
          label: nls.localize({ key: "allow", comment: ["&& denotes a mnemonic"] }, "&&Allow"),
          run: () => 0 /* Allow */
        },
        {
          label: nls.localize({ key: "deny", comment: ["&& denotes a mnemonic"] }, "&&Deny"),
          run: () => 1 /* Deny */
        }
      ],
      cancelButton: {
        run: () => 2 /* Cancel */
      }
    });
    if (result !== 2 /* Cancel */) {
      this._authenticationAccessService.updateAllowedExtensions(provider.id, accountName, [{ id: extensionId, name: extensionName, allowed: result === 0 /* Allow */ }]);
      this.removeAccessRequest(provider.id, extensionId);
    }
    return result === 0 /* Allow */;
  }
  /**
   * This function should be used only when there are sessions to disambiguate.
   */
  async selectSession(providerId, extensionId, extensionName, scopeListOrRequest, availableSessions) {
    const allAccounts = await this._authenticationService.getAccounts(providerId);
    if (!allAccounts.length) {
      throw new Error("No accounts available");
    }
    const disposables = new DisposableStore();
    const quickPick = disposables.add(this.quickInputService.createQuickPick());
    quickPick.ignoreFocusOut = true;
    const accountsWithSessions = /* @__PURE__ */ new Set();
    const items = availableSessions.filter((session) => !accountsWithSessions.has(session.account.label) && accountsWithSessions.add(session.account.label)).map((session) => {
      return {
        label: session.account.label,
        session
      };
    });
    allAccounts.forEach((account) => {
      if (!accountsWithSessions.has(account.label)) {
        items.push({ label: account.label, account });
      }
    });
    items.push({ label: nls.localize("useOtherAccount", "Sign in to another account") });
    quickPick.items = items;
    quickPick.title = nls.localize(
      {
        key: "selectAccount",
        comment: ["The placeholder {0} is the name of an extension. {1} is the name of the type of account, such as Microsoft or GitHub."]
      },
      "The extension '{0}' wants to access a {1} account",
      extensionName,
      this._authenticationService.getProvider(providerId).label
    );
    quickPick.placeholder = nls.localize("getSessionPlateholder", "Select an account for '{0}' to use or Esc to cancel", extensionName);
    return await new Promise((resolve, reject) => {
      disposables.add(quickPick.onDidAccept(async (_) => {
        quickPick.dispose();
        let session = quickPick.selectedItems[0].session;
        if (!session) {
          const account = quickPick.selectedItems[0].account;
          try {
            session = await this._authenticationService.createSession(providerId, scopeListOrRequest, { account });
          } catch (e) {
            reject(e);
            return;
          }
        }
        const accountName = session.account.label;
        this._authenticationAccessService.updateAllowedExtensions(providerId, accountName, [{ id: extensionId, name: extensionName, allowed: true }]);
        this._updateAccountAndSessionPreferences(providerId, extensionId, session);
        this.removeAccessRequest(providerId, extensionId);
        resolve(session);
      }));
      disposables.add(quickPick.onDidHide((_) => {
        if (!quickPick.selectedItems[0]) {
          reject("User did not consent to account access");
        }
        disposables.dispose();
      }));
      quickPick.show();
    });
  }
  async completeSessionAccessRequest(provider, extensionId, extensionName, scopeListOrRequest) {
    const providerRequests = this._sessionAccessRequestItems.get(provider.id) || {};
    const existingRequest = providerRequests[extensionId];
    if (!existingRequest) {
      return;
    }
    if (!provider) {
      return;
    }
    const possibleSessions = existingRequest.possibleSessions;
    let session;
    if (provider.supportsMultipleAccounts) {
      try {
        session = await this.selectSession(provider.id, extensionId, extensionName, scopeListOrRequest, possibleSessions);
      } catch (_) {
      }
    } else {
      const approved = await this.showGetSessionPrompt(provider, possibleSessions[0].account.label, extensionId, extensionName);
      if (approved) {
        session = possibleSessions[0];
      }
    }
    if (session) {
      this._authenticationUsageService.addAccountUsage(provider.id, session.account.label, session.scopes, extensionId, extensionName);
    }
  }
  requestSessionAccess(providerId, extensionId, extensionName, scopeListOrRequest, possibleSessions) {
    const providerRequests = this._sessionAccessRequestItems.get(providerId) || {};
    const hasExistingRequest = providerRequests[extensionId];
    if (hasExistingRequest) {
      return;
    }
    const provider = this._authenticationService.getProvider(providerId);
    const menuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
      group: "3_accessRequests",
      command: {
        id: `${providerId}${extensionId}Access`,
        title: nls.localize(
          {
            key: "accessRequest",
            comment: [`The placeholder {0} will be replaced with an authentication provider''s label. {1} will be replaced with an extension name. (1) is to indicate that this menu item contributes to a badge count`]
          },
          "Grant access to {0} for {1}... (1)",
          provider.label,
          extensionName
        )
      }
    });
    const accessCommand = CommandsRegistry.registerCommand({
      id: `${providerId}${extensionId}Access`,
      handler: async (accessor) => {
        this.completeSessionAccessRequest(provider, extensionId, extensionName, scopeListOrRequest);
      }
    });
    providerRequests[extensionId] = { possibleSessions, disposables: [menuItem, accessCommand] };
    this._sessionAccessRequestItems.set(providerId, providerRequests);
    this.updateBadgeCount();
  }
  async requestNewSession(providerId, scopeListOrRequest, extensionId, extensionName) {
    if (!this._authenticationService.isAuthenticationProviderRegistered(providerId)) {
      await new Promise((resolve, _) => {
        const dispose2 = this._authenticationService.onDidRegisterAuthenticationProvider((e) => {
          if (e.id === providerId) {
            dispose2.dispose();
            resolve();
          }
        });
      });
    }
    let provider;
    try {
      provider = this._authenticationService.getProvider(providerId);
    } catch (_e) {
      return;
    }
    const providerRequests = this._signInRequestItems.get(providerId);
    const signInRequestKey = isAuthenticationWwwAuthenticateRequest(scopeListOrRequest) ? `${scopeListOrRequest.wwwAuthenticate}:${scopeListOrRequest.fallbackScopes?.join(SCOPESLIST_SEPARATOR) ?? ""}` : `${scopeListOrRequest.join(SCOPESLIST_SEPARATOR)}`;
    const extensionHasExistingRequest = providerRequests && providerRequests[signInRequestKey] && providerRequests[signInRequestKey].requestingExtensionIds.includes(extensionId);
    if (extensionHasExistingRequest) {
      return;
    }
    const commandId = `${providerId}:${extensionId}:signIn${Object.keys(providerRequests || []).length}`;
    const menuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
      group: "2_signInRequests",
      command: {
        id: commandId,
        title: nls.localize(
          {
            key: "signInRequest",
            comment: [`The placeholder {0} will be replaced with an authentication provider's label. {1} will be replaced with an extension name. (1) is to indicate that this menu item contributes to a badge count.`]
          },
          "Sign in with {0} to use {1} (1)",
          provider.label,
          extensionName
        )
      }
    });
    const signInCommand = CommandsRegistry.registerCommand({
      id: commandId,
      handler: async (accessor) => {
        const authenticationService = accessor.get(IAuthenticationService);
        const session = await authenticationService.createSession(providerId, scopeListOrRequest);
        this._authenticationAccessService.updateAllowedExtensions(providerId, session.account.label, [{ id: extensionId, name: extensionName, allowed: true }]);
        this._updateAccountAndSessionPreferences(providerId, extensionId, session);
      }
    });
    if (providerRequests) {
      const existingRequest = providerRequests[signInRequestKey] || { disposables: [], requestingExtensionIds: [] };
      providerRequests[signInRequestKey] = {
        disposables: [...existingRequest.disposables, menuItem, signInCommand],
        requestingExtensionIds: [...existingRequest.requestingExtensionIds, extensionId]
      };
      this._signInRequestItems.set(providerId, providerRequests);
    } else {
      this._signInRequestItems.set(providerId, {
        [signInRequestKey]: {
          disposables: [menuItem, signInCommand],
          requestingExtensionIds: [extensionId]
        }
      });
    }
    this.updateBadgeCount();
  }
};
AuthenticationExtensionsService = __decorateClass([
  __decorateParam(0, IActivityService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, IProductService),
  __decorateParam(5, IAuthenticationService),
  __decorateParam(6, IAuthenticationUsageService),
  __decorateParam(7, IAuthenticationAccessService)
], AuthenticationExtensionsService);
registerSingleton(IAuthenticationExtensionsService, AuthenticationExtensionsService, InstantiationType.Delayed);
export {
  AuthenticationExtensionsService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxhdXRoZW50aWNhdGlvblxcYnJvd3NlclxcYXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHNjb3Blc01hdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2F1dGguanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElBY3Rpdml0eVNlcnZpY2UsIE51bWJlckJhZGdlIH0gZnJvbSAnLi4vLi4vYWN0aXZpdHkvY29tbW9uL2FjdGl2aXR5LmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UgfSBmcm9tICcuL2F1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UgfSBmcm9tICcuL2F1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiwgSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIsIElBdXRoZW50aWNhdGlvblNlcnZpY2UsIElBdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLCBBdXRoZW50aWNhdGlvblNlc3Npb25BY2NvdW50LCBJQXV0aGVudGljYXRpb25Xd3dBdXRoZW50aWNhdGVSZXF1ZXN0LCBpc0F1dGhlbnRpY2F0aW9uV3d3QXV0aGVudGljYXRlUmVxdWVzdCB9IGZyb20gJy4uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuXG4vLyBPQXV0aDIgc3BlYyBwcm9oaWJpdHMgc3BhY2UgaW4gYSBzY29wZSwgc28gdXNlIHRoYXQgdG8gam9pbiB0aGVtLlxuY29uc3QgU0NPUEVTTElTVF9TRVBBUkFUT1IgPSAnICc7XG5cbmludGVyZmFjZSBTZXNzaW9uUmVxdWVzdCB7XG5cdGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdO1xuXHRyZXF1ZXN0aW5nRXh0ZW5zaW9uSWRzOiBzdHJpbmdbXTtcbn1cblxuaW50ZXJmYWNlIFNlc3Npb25SZXF1ZXN0SW5mbyB7XG5cdFtzY29wZXNMaXN0OiBzdHJpbmddOiBTZXNzaW9uUmVxdWVzdDtcbn1cblxuLy8gVE9ET0BUeWxlckxlb25oYXJkdDogVGhpcyBzaG91bGQgYWxsIGdvIGluIE1haW5UaHJlYWRBdXRoZW50aWNhdGlvblxuZXhwb3J0IGNsYXNzIEF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2lnbkluUmVxdWVzdEl0ZW1zID0gbmV3IE1hcDxzdHJpbmcsIFNlc3Npb25SZXF1ZXN0SW5mbz4oKTtcblx0cHJpdmF0ZSBfc2Vzc2lvbkFjY2Vzc1JlcXVlc3RJdGVtcyA9IG5ldyBNYXA8c3RyaW5nLCB7IFtleHRlbnNpb25JZDogc3RyaW5nXTogeyBkaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXTsgcG9zc2libGVTZXNzaW9uczogQXV0aGVudGljYXRpb25TZXNzaW9uW10gfSB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY2NvdW50QmFkZ2VEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgX29uRGlkQWNjb3VudFByZWZlcmVuY2VDaGFuZ2U6IEVtaXR0ZXI8eyBwcm92aWRlcklkOiBzdHJpbmc7IGV4dGVuc2lvbklkczogc3RyaW5nW10gfT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHByb3ZpZGVySWQ6IHN0cmluZzsgZXh0ZW5zaW9uSWRzOiBzdHJpbmdbXSB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY2NvdW50UHJlZmVyZW5jZSA9IHRoaXMuX29uRGlkQWNjb3VudFByZWZlcmVuY2VDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfaW5oZXJpdEF1dGhBY2NvdW50UHJlZmVyZW5jZVBhcmVudFRvQ2hpbGRyZW46IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPjtcblx0cHJpdmF0ZSBfaW5oZXJpdEF1dGhBY2NvdW50UHJlZmVyZW5jZUNoaWxkVG9QYXJlbnQ6IHsgW2V4dGVuc2lvbklkOiBzdHJpbmddOiBzdHJpbmcgfTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFjdGl2aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGl2aXR5U2VydmljZTogSUFjdGl2aXR5U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2U6IElBdXRoZW50aWNhdGlvblVzYWdlU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2U6IElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9pbmhlcml0QXV0aEFjY291bnRQcmVmZXJlbmNlUGFyZW50VG9DaGlsZHJlbiA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmluaGVyaXRBdXRoQWNjb3VudFByZWZlcmVuY2UgfHwge307XG5cdFx0dGhpcy5faW5oZXJpdEF1dGhBY2NvdW50UHJlZmVyZW5jZUNoaWxkVG9QYXJlbnQgPSBPYmplY3QuZW50cmllcyh0aGlzLl9pbmhlcml0QXV0aEFjY291bnRQcmVmZXJlbmNlUGFyZW50VG9DaGlsZHJlbikucmVkdWNlPHsgW2V4dGVuc2lvbklkOiBzdHJpbmddOiBzdHJpbmcgfT4oKGFjYywgW3BhcmVudCwgY2hpbGRyZW5dKSA9PiB7XG5cdFx0XHRjaGlsZHJlbi5mb3JFYWNoKChjaGlsZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGFjY1tjaGlsZF0gPSBwYXJlbnQ7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBhY2M7XG5cdFx0fSwge30pO1xuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiB7XG5cdFx0XHRpZiAoZS5ldmVudC5hZGRlZD8ubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlTmV3U2Vzc2lvblJlcXVlc3RzKGUucHJvdmlkZXJJZCwgZS5ldmVudC5hZGRlZCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5ldmVudC5yZW1vdmVkPy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVBY2Nlc3NSZXF1ZXN0cyhlLnByb3ZpZGVySWQsIGUuZXZlbnQucmVtb3ZlZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkVW5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoZSA9PiB7XG5cdFx0XHRjb25zdCBhY2Nlc3NSZXF1ZXN0cyA9IHRoaXMuX3Nlc3Npb25BY2Nlc3NSZXF1ZXN0SXRlbXMuZ2V0KGUuaWQpIHx8IHt9O1xuXHRcdFx0T2JqZWN0LmtleXMoYWNjZXNzUmVxdWVzdHMpLmZvckVhY2goZXh0ZW5zaW9uSWQgPT4ge1xuXHRcdFx0XHR0aGlzLnJlbW92ZUFjY2Vzc1JlcXVlc3QoZS5pZCwgZXh0ZW5zaW9uSWQpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0dXBkYXRlTmV3U2Vzc2lvblJlcXVlc3RzKHByb3ZpZGVySWQ6IHN0cmluZywgYWRkZWRTZXNzaW9uczogcmVhZG9ubHkgQXV0aGVudGljYXRpb25TZXNzaW9uW10pOiB2b2lkIHtcblx0XHRjb25zdCBleGlzdGluZ1JlcXVlc3RzRm9yUHJvdmlkZXIgPSB0aGlzLl9zaWduSW5SZXF1ZXN0SXRlbXMuZ2V0KHByb3ZpZGVySWQpO1xuXHRcdGlmICghZXhpc3RpbmdSZXF1ZXN0c0ZvclByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0T2JqZWN0LmtleXMoZXhpc3RpbmdSZXF1ZXN0c0ZvclByb3ZpZGVyKS5mb3JFYWNoKHJlcXVlc3RlZFNjb3BlcyA9PiB7XG5cdFx0XHQvLyBQYXJzZSB0aGUgcmVxdWVzdGVkIHNjb3BlcyBmcm9tIHRoZSBzdG9yZWQga2V5XG5cdFx0XHRjb25zdCByZXF1ZXN0ZWRTY29wZXNBcnJheSA9IHJlcXVlc3RlZFNjb3Blcy5zcGxpdChTQ09QRVNMSVNUX1NFUEFSQVRPUik7XG5cblx0XHRcdC8vIENoZWNrIGlmIGFueSBhZGRlZCBzZXNzaW9uIGhhcyBtYXRjaGluZyBzY29wZXMgKG9yZGVyLWluZGVwZW5kZW50KVxuXHRcdFx0aWYgKGFkZGVkU2Vzc2lvbnMuc29tZShzZXNzaW9uID0+IHNjb3Blc01hdGNoKHNlc3Npb24uc2NvcGVzLCByZXF1ZXN0ZWRTY29wZXNBcnJheSkpKSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXF1ZXN0ID0gZXhpc3RpbmdSZXF1ZXN0c0ZvclByb3ZpZGVyW3JlcXVlc3RlZFNjb3Blc107XG5cdFx0XHRcdHNlc3Npb25SZXF1ZXN0Py5kaXNwb3NhYmxlcy5mb3JFYWNoKGl0ZW0gPT4gaXRlbS5kaXNwb3NlKCkpO1xuXG5cdFx0XHRcdGRlbGV0ZSBleGlzdGluZ1JlcXVlc3RzRm9yUHJvdmlkZXJbcmVxdWVzdGVkU2NvcGVzXTtcblx0XHRcdFx0aWYgKE9iamVjdC5rZXlzKGV4aXN0aW5nUmVxdWVzdHNGb3JQcm92aWRlcikubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2lnbkluUmVxdWVzdEl0ZW1zLmRlbGV0ZShwcm92aWRlcklkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9zaWduSW5SZXF1ZXN0SXRlbXMuc2V0KHByb3ZpZGVySWQsIGV4aXN0aW5nUmVxdWVzdHNGb3JQcm92aWRlcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy51cGRhdGVCYWRnZUNvdW50KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUFjY2Vzc1JlcXVlc3RzKHByb3ZpZGVySWQ6IHN0cmluZywgcmVtb3ZlZFNlc3Npb25zOiByZWFkb25seSBBdXRoZW50aWNhdGlvblNlc3Npb25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyUmVxdWVzdHMgPSB0aGlzLl9zZXNzaW9uQWNjZXNzUmVxdWVzdEl0ZW1zLmdldChwcm92aWRlcklkKTtcblx0XHRpZiAocHJvdmlkZXJSZXF1ZXN0cykge1xuXHRcdFx0T2JqZWN0LmtleXMocHJvdmlkZXJSZXF1ZXN0cykuZm9yRWFjaChleHRlbnNpb25JZCA9PiB7XG5cdFx0XHRcdHJlbW92ZWRTZXNzaW9ucy5mb3JFYWNoKHJlbW92ZWQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGluZGV4T2ZTZXNzaW9uID0gcHJvdmlkZXJSZXF1ZXN0c1tleHRlbnNpb25JZF0ucG9zc2libGVTZXNzaW9ucy5maW5kSW5kZXgoc2Vzc2lvbiA9PiBzZXNzaW9uLmlkID09PSByZW1vdmVkLmlkKTtcblx0XHRcdFx0XHRpZiAoaW5kZXhPZlNlc3Npb24pIHtcblx0XHRcdFx0XHRcdHByb3ZpZGVyUmVxdWVzdHNbZXh0ZW5zaW9uSWRdLnBvc3NpYmxlU2Vzc2lvbnMuc3BsaWNlKGluZGV4T2ZTZXNzaW9uLCAxKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmICghcHJvdmlkZXJSZXF1ZXN0c1tleHRlbnNpb25JZF0ucG9zc2libGVTZXNzaW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLnJlbW92ZUFjY2Vzc1JlcXVlc3QocHJvdmlkZXJJZCwgZXh0ZW5zaW9uSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUJhZGdlQ291bnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fYWNjb3VudEJhZGdlRGlzcG9zYWJsZS5jbGVhcigpO1xuXG5cdFx0bGV0IG51bWJlck9mUmVxdWVzdHMgPSAwO1xuXHRcdHRoaXMuX3NpZ25JblJlcXVlc3RJdGVtcy5mb3JFYWNoKHByb3ZpZGVyUmVxdWVzdHMgPT4ge1xuXHRcdFx0T2JqZWN0LmtleXMocHJvdmlkZXJSZXF1ZXN0cykuZm9yRWFjaChyZXF1ZXN0ID0+IHtcblx0XHRcdFx0bnVtYmVyT2ZSZXF1ZXN0cyArPSBwcm92aWRlclJlcXVlc3RzW3JlcXVlc3RdLnJlcXVlc3RpbmdFeHRlbnNpb25JZHMubGVuZ3RoO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9zZXNzaW9uQWNjZXNzUmVxdWVzdEl0ZW1zLmZvckVhY2goYWNjZXNzUmVxdWVzdCA9PiB7XG5cdFx0XHRudW1iZXJPZlJlcXVlc3RzICs9IE9iamVjdC5rZXlzKGFjY2Vzc1JlcXVlc3QpLmxlbmd0aDtcblx0XHR9KTtcblxuXHRcdGlmIChudW1iZXJPZlJlcXVlc3RzID4gMCkge1xuXHRcdFx0Y29uc3QgYmFkZ2UgPSBuZXcgTnVtYmVyQmFkZ2UobnVtYmVyT2ZSZXF1ZXN0cywgKCkgPT4gbmxzLmxvY2FsaXplKCdzaWduIGluJywgXCJTaWduIGluIHJlcXVlc3RlZFwiKSk7XG5cdFx0XHR0aGlzLl9hY2NvdW50QmFkZ2VEaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5hY3Rpdml0eVNlcnZpY2Uuc2hvd0FjY291bnRzQWN0aXZpdHkoeyBiYWRnZSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZUFjY2Vzc1JlcXVlc3QocHJvdmlkZXJJZDogc3RyaW5nLCBleHRlbnNpb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXJSZXF1ZXN0cyA9IHRoaXMuX3Nlc3Npb25BY2Nlc3NSZXF1ZXN0SXRlbXMuZ2V0KHByb3ZpZGVySWQpIHx8IHt9O1xuXHRcdGlmIChwcm92aWRlclJlcXVlc3RzW2V4dGVuc2lvbklkXSkge1xuXHRcdFx0ZGlzcG9zZShwcm92aWRlclJlcXVlc3RzW2V4dGVuc2lvbklkXS5kaXNwb3NhYmxlcyk7XG5cdFx0XHRkZWxldGUgcHJvdmlkZXJSZXF1ZXN0c1tleHRlbnNpb25JZF07XG5cdFx0XHR0aGlzLnVwZGF0ZUJhZGdlQ291bnQoKTtcblx0XHR9XG5cdH1cblxuXHQvLyNyZWdpb24gQWNjb3VudC9TZXNzaW9uIFByZWZlcmVuY2VcblxuXHR1cGRhdGVBY2NvdW50UHJlZmVyZW5jZShleHRlbnNpb25JZDogc3RyaW5nLCBwcm92aWRlcklkOiBzdHJpbmcsIGFjY291bnQ6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQpOiB2b2lkIHtcblx0XHRjb25zdCByZWFsRXh0ZW5zaW9uSWQgPSBFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGV4dGVuc2lvbklkKTtcblx0XHRjb25zdCBwYXJlbnRFeHRlbnNpb25JZCA9IHRoaXMuX2luaGVyaXRBdXRoQWNjb3VudFByZWZlcmVuY2VDaGlsZFRvUGFyZW50W3JlYWxFeHRlbnNpb25JZF0gPz8gcmVhbEV4dGVuc2lvbklkO1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX2dldEtleShwYXJlbnRFeHRlbnNpb25JZCwgcHJvdmlkZXJJZCk7XG5cblx0XHQvLyBTdG9yZSB0aGUgcHJlZmVyZW5jZSBpbiB0aGUgd29ya3NwYWNlIGFuZCBhcHBsaWNhdGlvbiBzdG9yYWdlLiBUaGlzIGFsbG93cyBuZXcgd29ya3NwYWNlcyB0b1xuXHRcdC8vIGhhdmUgYSBwcmVmZXJlbmNlIHNldCBhbHJlYWR5IHRvIGxpbWl0IHRoZSBudW1iZXIgb2YgcHJvbXB0cyB0aGF0IGFyZSBzaG93bi4uLiBidXQgYWxzbyBhbGxvd3Ncblx0XHQvLyBhIHNwZWNpZmljIHdvcmtzcGFjZSB0byBvdmVycmlkZSB0aGUgZ2xvYmFsIHByZWZlcmVuY2UuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShrZXksIGFjY291bnQubGFiZWwsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShrZXksIGFjY291bnQubGFiZWwsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdGNvbnN0IGNoaWxkcmVuRXh0ZW5zaW9ucyA9IHRoaXMuX2luaGVyaXRBdXRoQWNjb3VudFByZWZlcmVuY2VQYXJlbnRUb0NoaWxkcmVuW3BhcmVudEV4dGVuc2lvbklkXTtcblx0XHRjb25zdCBleHRlbnNpb25JZHMgPSBjaGlsZHJlbkV4dGVuc2lvbnMgPyBbcGFyZW50RXh0ZW5zaW9uSWQsIC4uLmNoaWxkcmVuRXh0ZW5zaW9uc10gOiBbcGFyZW50RXh0ZW5zaW9uSWRdO1xuXHRcdHRoaXMuX29uRGlkQWNjb3VudFByZWZlcmVuY2VDaGFuZ2UuZmlyZSh7IGV4dGVuc2lvbklkcywgcHJvdmlkZXJJZCB9KTtcblx0fVxuXG5cdGdldEFjY291bnRQcmVmZXJlbmNlKGV4dGVuc2lvbklkOiBzdHJpbmcsIHByb3ZpZGVySWQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVhbEV4dGVuc2lvbklkID0gRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRlbnNpb25JZCk7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fZ2V0S2V5KHRoaXMuX2luaGVyaXRBdXRoQWNjb3VudFByZWZlcmVuY2VDaGlsZFRvUGFyZW50W3JlYWxFeHRlbnNpb25JZF0gPz8gcmVhbEV4dGVuc2lvbklkLCBwcm92aWRlcklkKTtcblxuXHRcdC8vIElmIGEgcHJlZmVyZW5jZSBpcyBzZXQgaW4gdGhlIHdvcmtzcGFjZSwgdXNlIHRoYXQuIE90aGVyd2lzZSwgdXNlIHRoZSBnbG9iYWwgcHJlZmVyZW5jZS5cblx0XHRyZXR1cm4gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoa2V5LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKSA/PyB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChrZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdH1cblxuXHRyZW1vdmVBY2NvdW50UHJlZmVyZW5jZShleHRlbnNpb25JZDogc3RyaW5nLCBwcm92aWRlcklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCByZWFsRXh0ZW5zaW9uSWQgPSBFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGV4dGVuc2lvbklkKTtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl9nZXRLZXkodGhpcy5faW5oZXJpdEF1dGhBY2NvdW50UHJlZmVyZW5jZUNoaWxkVG9QYXJlbnRbcmVhbEV4dGVuc2lvbklkXSA/PyByZWFsRXh0ZW5zaW9uSWQsIHByb3ZpZGVySWQpO1xuXG5cdFx0Ly8gVGhpcyB3b24ndCBhZmZlY3QgYW55IG90aGVyIHdvcmtzcGFjZXMgdGhhdCBoYXZlIGEgcHJlZmVyZW5jZSBzZXQsIGJ1dCBpdCB3aWxsIHJlbW92ZSB0aGUgcHJlZmVyZW5jZVxuXHRcdC8vIGZvciB0aGlzIHdvcmtzcGFjZSBhbmQgdGhlIGdsb2JhbCBwcmVmZXJlbmNlLiBUaGlzIGlzIG9ubHkgcGFpcmVkIHdpdGggYSBjYWxsIHRvIHVwZGF0ZVNlc3Npb25QcmVmZXJlbmNlLi4uXG5cdFx0Ly8gc28gd2UgcmVhbGx5IGRvbid0IF9uZWVkXyB0byByZW1vdmUgdGhlbSBhcyB0aGV5IGFyZSBhYm91dCB0byBiZSBvdmVycmlkZGVuIGFueXdheS4uLiBidXQgaXQncyBtb3JlIGNvcnJlY3Rcblx0XHQvLyB0byByZW1vdmUgdGhlbSBmaXJzdC4uLiBhbmQgaW4gY2FzZSB0aGlzIGdldHMgY2FsbGVkIGZyb20gc29tZXdoZXJlIGVsc2UgaW4gdGhlIGZ1dHVyZS5cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShrZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKGtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEtleShleHRlbnNpb25JZDogc3RyaW5nLCBwcm92aWRlcklkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtleHRlbnNpb25JZH0tJHtwcm92aWRlcklkfWA7XG5cdH1cblxuXHQvLyBUT0RPQFR5bGVyTGVvbmhhcmR0OiBSZW1vdmUgYWxsIG9mIHRoaXMgYWZ0ZXIgYSBjb3VwbGUgaXRlcmF0aW9uc1xuXG5cdHVwZGF0ZVNlc3Npb25QcmVmZXJlbmNlKHByb3ZpZGVySWQ6IHN0cmluZywgZXh0ZW5zaW9uSWQ6IHN0cmluZywgc2Vzc2lvbjogQXV0aGVudGljYXRpb25TZXNzaW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVhbEV4dGVuc2lvbklkID0gRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRlbnNpb25JZCk7XG5cdFx0Ly8gVGhlIDMgcGFydHMgb2YgdGhpcyBrZXkgYXJlIGltcG9ydGFudDpcblx0XHQvLyAqIEV4dGVuc2lvbiBpZDogVGhlIGV4dGVuc2lvbiB0aGF0IGhhcyBhIHByZWZlcmVuY2Vcblx0XHQvLyAqIFByb3ZpZGVyIGlkOiBUaGUgcHJvdmlkZXIgdGhhdCB0aGUgcHJlZmVyZW5jZSBpcyBmb3Jcblx0XHQvLyAqIFRoZSBzY29wZXM6IFRoZSBzdWJzZXQgb2Ygc2Vzc2lvbnMgdGhhdCB0aGUgcHJlZmVyZW5jZSBhcHBsaWVzIHRvXG5cdFx0Y29uc3Qga2V5ID0gYCR7cmVhbEV4dGVuc2lvbklkfS0ke3Byb3ZpZGVySWR9LSR7c2Vzc2lvbi5zY29wZXMuam9pbihTQ09QRVNMSVNUX1NFUEFSQVRPUil9YDtcblxuXHRcdC8vIFN0b3JlIHRoZSBwcmVmZXJlbmNlIGluIHRoZSB3b3Jrc3BhY2UgYW5kIGFwcGxpY2F0aW9uIHN0b3JhZ2UuIFRoaXMgYWxsb3dzIG5ldyB3b3Jrc3BhY2VzIHRvXG5cdFx0Ly8gaGF2ZSBhIHByZWZlcmVuY2Ugc2V0IGFscmVhZHkgdG8gbGltaXQgdGhlIG51bWJlciBvZiBwcm9tcHRzIHRoYXQgYXJlIHNob3duLi4uIGJ1dCBhbHNvIGFsbG93c1xuXHRcdC8vIGEgc3BlY2lmaWMgd29ya3NwYWNlIHRvIG92ZXJyaWRlIHRoZSBnbG9iYWwgcHJlZmVyZW5jZS5cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGtleSwgc2Vzc2lvbi5pZCwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGtleSwgc2Vzc2lvbi5pZCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0Z2V0U2Vzc2lvblByZWZlcmVuY2UocHJvdmlkZXJJZDogc3RyaW5nLCBleHRlbnNpb25JZDogc3RyaW5nLCBzY29wZXM6IHN0cmluZ1tdKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZWFsRXh0ZW5zaW9uSWQgPSBFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGV4dGVuc2lvbklkKTtcblx0XHQvLyBUaGUgMyBwYXJ0cyBvZiB0aGlzIGtleSBhcmUgaW1wb3J0YW50OlxuXHRcdC8vICogRXh0ZW5zaW9uIGlkOiBUaGUgZXh0ZW5zaW9uIHRoYXQgaGFzIGEgcHJlZmVyZW5jZVxuXHRcdC8vICogUHJvdmlkZXIgaWQ6IFRoZSBwcm92aWRlciB0aGF0IHRoZSBwcmVmZXJlbmNlIGlzIGZvclxuXHRcdC8vICogVGhlIHNjb3BlczogVGhlIHN1YnNldCBvZiBzZXNzaW9ucyB0aGF0IHRoZSBwcmVmZXJlbmNlIGFwcGxpZXMgdG9cblx0XHRjb25zdCBrZXkgPSBgJHtyZWFsRXh0ZW5zaW9uSWR9LSR7cHJvdmlkZXJJZH0tJHtzY29wZXMuam9pbihTQ09QRVNMSVNUX1NFUEFSQVRPUil9YDtcblxuXHRcdC8vIElmIGEgcHJlZmVyZW5jZSBpcyBzZXQgaW4gdGhlIHdvcmtzcGFjZSwgdXNlIHRoYXQuIE90aGVyd2lzZSwgdXNlIHRoZSBnbG9iYWwgcHJlZmVyZW5jZS5cblx0XHRyZXR1cm4gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoa2V5LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKSA/PyB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChrZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdH1cblxuXHRyZW1vdmVTZXNzaW9uUHJlZmVyZW5jZShwcm92aWRlcklkOiBzdHJpbmcsIGV4dGVuc2lvbklkOiBzdHJpbmcsIHNjb3Blczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRjb25zdCByZWFsRXh0ZW5zaW9uSWQgPSBFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGV4dGVuc2lvbklkKTtcblx0XHQvLyBUaGUgMyBwYXJ0cyBvZiB0aGlzIGtleSBhcmUgaW1wb3J0YW50OlxuXHRcdC8vICogRXh0ZW5zaW9uIGlkOiBUaGUgZXh0ZW5zaW9uIHRoYXQgaGFzIGEgcHJlZmVyZW5jZVxuXHRcdC8vICogUHJvdmlkZXIgaWQ6IFRoZSBwcm92aWRlciB0aGF0IHRoZSBwcmVmZXJlbmNlIGlzIGZvclxuXHRcdC8vICogVGhlIHNjb3BlczogVGhlIHN1YnNldCBvZiBzZXNzaW9ucyB0aGF0IHRoZSBwcmVmZXJlbmNlIGFwcGxpZXMgdG9cblx0XHRjb25zdCBrZXkgPSBgJHtyZWFsRXh0ZW5zaW9uSWR9LSR7cHJvdmlkZXJJZH0tJHtzY29wZXMuam9pbihTQ09QRVNMSVNUX1NFUEFSQVRPUil9YDtcblxuXHRcdC8vIFRoaXMgd29uJ3QgYWZmZWN0IGFueSBvdGhlciB3b3Jrc3BhY2VzIHRoYXQgaGF2ZSBhIHByZWZlcmVuY2Ugc2V0LCBidXQgaXQgd2lsbCByZW1vdmUgdGhlIHByZWZlcmVuY2Vcblx0XHQvLyBmb3IgdGhpcyB3b3Jrc3BhY2UgYW5kIHRoZSBnbG9iYWwgcHJlZmVyZW5jZS4gVGhpcyBpcyBvbmx5IHBhaXJlZCB3aXRoIGEgY2FsbCB0byB1cGRhdGVTZXNzaW9uUHJlZmVyZW5jZS4uLlxuXHRcdC8vIHNvIHdlIHJlYWxseSBkb24ndCBfbmVlZF8gdG8gcmVtb3ZlIHRoZW0gYXMgdGhleSBhcmUgYWJvdXQgdG8gYmUgb3ZlcnJpZGRlbiBhbnl3YXkuLi4gYnV0IGl0J3MgbW9yZSBjb3JyZWN0XG5cdFx0Ly8gdG8gcmVtb3ZlIHRoZW0gZmlyc3QuLi4gYW5kIGluIGNhc2UgdGhpcyBnZXRzIGNhbGxlZCBmcm9tIHNvbWV3aGVyZSBlbHNlIGluIHRoZSBmdXR1cmUuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoa2V5LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShrZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVBY2NvdW50QW5kU2Vzc2lvblByZWZlcmVuY2VzKHByb3ZpZGVySWQ6IHN0cmluZywgZXh0ZW5zaW9uSWQ6IHN0cmluZywgc2Vzc2lvbjogQXV0aGVudGljYXRpb25TZXNzaW9uKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVBY2NvdW50UHJlZmVyZW5jZShleHRlbnNpb25JZCwgcHJvdmlkZXJJZCwgc2Vzc2lvbi5hY2NvdW50KTtcblx0XHR0aGlzLnVwZGF0ZVNlc3Npb25QcmVmZXJlbmNlKHByb3ZpZGVySWQsIGV4dGVuc2lvbklkLCBzZXNzaW9uKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd0dldFNlc3Npb25Qcm9tcHQocHJvdmlkZXI6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBhY2NvdW50TmFtZTogc3RyaW5nLCBleHRlbnNpb25JZDogc3RyaW5nLCBleHRlbnNpb25OYW1lOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRlbnVtIFNlc3Npb25Qcm9tcHRDaG9pY2Uge1xuXHRcdFx0QWxsb3cgPSAwLFxuXHRcdFx0RGVueSA9IDEsXG5cdFx0XHRDYW5jZWwgPSAyXG5cdFx0fVxuXHRcdGNvbnN0IHsgcmVzdWx0IH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0PFNlc3Npb25Qcm9tcHRDaG9pY2U+KHtcblx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ2NvbmZpcm1BdXRoZW50aWNhdGlvbkFjY2VzcycsIFwiVGhlIGV4dGVuc2lvbiAnezB9JyB3YW50cyB0byBhY2Nlc3MgdGhlIHsxfSBhY2NvdW50ICd7Mn0nLlwiLCBleHRlbnNpb25OYW1lLCBwcm92aWRlci5sYWJlbCwgYWNjb3VudE5hbWUpLFxuXHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSh7IGtleTogJ2FsbG93JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQWxsb3dcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBTZXNzaW9uUHJvbXB0Q2hvaWNlLkFsbG93XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKHsga2V5OiAnZGVueScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkRlbnlcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBTZXNzaW9uUHJvbXB0Q2hvaWNlLkRlbnlcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdGNhbmNlbEJ1dHRvbjoge1xuXHRcdFx0XHRydW46ICgpID0+IFNlc3Npb25Qcm9tcHRDaG9pY2UuQ2FuY2VsXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAocmVzdWx0ICE9PSBTZXNzaW9uUHJvbXB0Q2hvaWNlLkNhbmNlbCkge1xuXHRcdFx0dGhpcy5fYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRFeHRlbnNpb25zKHByb3ZpZGVyLmlkLCBhY2NvdW50TmFtZSwgW3sgaWQ6IGV4dGVuc2lvbklkLCBuYW1lOiBleHRlbnNpb25OYW1lLCBhbGxvd2VkOiByZXN1bHQgPT09IFNlc3Npb25Qcm9tcHRDaG9pY2UuQWxsb3cgfV0pO1xuXHRcdFx0dGhpcy5yZW1vdmVBY2Nlc3NSZXF1ZXN0KHByb3ZpZGVyLmlkLCBleHRlbnNpb25JZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdCA9PT0gU2Vzc2lvblByb21wdENob2ljZS5BbGxvdztcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGlzIGZ1bmN0aW9uIHNob3VsZCBiZSB1c2VkIG9ubHkgd2hlbiB0aGVyZSBhcmUgc2Vzc2lvbnMgdG8gZGlzYW1iaWd1YXRlLlxuXHQgKi9cblx0YXN5bmMgc2VsZWN0U2Vzc2lvbihwcm92aWRlcklkOiBzdHJpbmcsIGV4dGVuc2lvbklkOiBzdHJpbmcsIGV4dGVuc2lvbk5hbWU6IHN0cmluZywgc2NvcGVMaXN0T3JSZXF1ZXN0OiBSZWFkb25seUFycmF5PHN0cmluZz4gfCBJQXV0aGVudGljYXRpb25Xd3dBdXRoZW50aWNhdGVSZXF1ZXN0LCBhdmFpbGFibGVTZXNzaW9uczogQXV0aGVudGljYXRpb25TZXNzaW9uW10pOiBQcm9taXNlPEF1dGhlbnRpY2F0aW9uU2Vzc2lvbj4ge1xuXHRcdGNvbnN0IGFsbEFjY291bnRzID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldEFjY291bnRzKHByb3ZpZGVySWQpO1xuXHRcdGlmICghYWxsQWNjb3VudHMubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIGFjY291bnRzIGF2YWlsYWJsZScpO1xuXHRcdH1cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBxdWlja1BpY2sgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8eyBsYWJlbDogc3RyaW5nOyBzZXNzaW9uPzogQXV0aGVudGljYXRpb25TZXNzaW9uOyBhY2NvdW50PzogQXV0aGVudGljYXRpb25TZXNzaW9uQWNjb3VudCB9PigpKTtcblx0XHRxdWlja1BpY2suaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdGNvbnN0IGFjY291bnRzV2l0aFNlc3Npb25zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgaXRlbXM6IHsgbGFiZWw6IHN0cmluZzsgc2Vzc2lvbj86IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbjsgYWNjb3VudD86IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQgfVtdID0gYXZhaWxhYmxlU2Vzc2lvbnNcblx0XHRcdC8vIE9ubHkgZ3JhYiB0aGUgZmlyc3QgYWNjb3VudFxuXHRcdFx0LmZpbHRlcihzZXNzaW9uID0+ICFhY2NvdW50c1dpdGhTZXNzaW9ucy5oYXMoc2Vzc2lvbi5hY2NvdW50LmxhYmVsKSAmJiBhY2NvdW50c1dpdGhTZXNzaW9ucy5hZGQoc2Vzc2lvbi5hY2NvdW50LmxhYmVsKSlcblx0XHRcdC5tYXAoc2Vzc2lvbiA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bGFiZWw6IHNlc3Npb24uYWNjb3VudC5sYWJlbCxcblx0XHRcdFx0XHRzZXNzaW9uOiBzZXNzaW9uXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblxuXHRcdC8vIEFkZCB0aGUgYWRkaXRpb25hbCBhY2NvdW50cyB0aGF0IGhhdmUgYmVlbiBsb2dnZWQgaW50byB0aGUgcHJvdmlkZXIgYnV0IGFyZVxuXHRcdC8vIGRvbid0IGhhdmUgYSBzZXNzaW9uIHlldC5cblx0XHRhbGxBY2NvdW50cy5mb3JFYWNoKGFjY291bnQgPT4ge1xuXHRcdFx0aWYgKCFhY2NvdW50c1dpdGhTZXNzaW9ucy5oYXMoYWNjb3VudC5sYWJlbCkpIHtcblx0XHRcdFx0aXRlbXMucHVzaCh7IGxhYmVsOiBhY2NvdW50LmxhYmVsLCBhY2NvdW50IH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGl0ZW1zLnB1c2goeyBsYWJlbDogbmxzLmxvY2FsaXplKCd1c2VPdGhlckFjY291bnQnLCBcIlNpZ24gaW4gdG8gYW5vdGhlciBhY2NvdW50XCIpIH0pO1xuXHRcdHF1aWNrUGljay5pdGVtcyA9IGl0ZW1zO1xuXHRcdHF1aWNrUGljay50aXRsZSA9IG5scy5sb2NhbGl6ZShcblx0XHRcdHtcblx0XHRcdFx0a2V5OiAnc2VsZWN0QWNjb3VudCcsXG5cdFx0XHRcdGNvbW1lbnQ6IFsnVGhlIHBsYWNlaG9sZGVyIHswfSBpcyB0aGUgbmFtZSBvZiBhbiBleHRlbnNpb24uIHsxfSBpcyB0aGUgbmFtZSBvZiB0aGUgdHlwZSBvZiBhY2NvdW50LCBzdWNoIGFzIE1pY3Jvc29mdCBvciBHaXRIdWIuJ11cblx0XHRcdH0sXG5cdFx0XHRcIlRoZSBleHRlbnNpb24gJ3swfScgd2FudHMgdG8gYWNjZXNzIGEgezF9IGFjY291bnRcIixcblx0XHRcdGV4dGVuc2lvbk5hbWUsXG5cdFx0XHR0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXIocHJvdmlkZXJJZCkubGFiZWxcblx0XHQpO1xuXHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IG5scy5sb2NhbGl6ZSgnZ2V0U2Vzc2lvblBsYXRlaG9sZGVyJywgXCJTZWxlY3QgYW4gYWNjb3VudCBmb3IgJ3swfScgdG8gdXNlIG9yIEVzYyB0byBjYW5jZWxcIiwgZXh0ZW5zaW9uTmFtZSk7XG5cblx0XHRyZXR1cm4gYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdChhc3luYyBfID0+IHtcblx0XHRcdFx0cXVpY2tQaWNrLmRpc3Bvc2UoKTtcblx0XHRcdFx0bGV0IHNlc3Npb24gPSBxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXS5zZXNzaW9uO1xuXHRcdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0XHRjb25zdCBhY2NvdW50ID0gcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF0uYWNjb3VudDtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0c2Vzc2lvbiA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5jcmVhdGVTZXNzaW9uKHByb3ZpZGVySWQsIHNjb3BlTGlzdE9yUmVxdWVzdCwgeyBhY2NvdW50IH0pO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdHJlamVjdChlKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWNjb3VudE5hbWUgPSBzZXNzaW9uLmFjY291bnQubGFiZWw7XG5cblx0XHRcdFx0dGhpcy5fYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRFeHRlbnNpb25zKHByb3ZpZGVySWQsIGFjY291bnROYW1lLCBbeyBpZDogZXh0ZW5zaW9uSWQsIG5hbWU6IGV4dGVuc2lvbk5hbWUsIGFsbG93ZWQ6IHRydWUgfV0pO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVBY2NvdW50QW5kU2Vzc2lvblByZWZlcmVuY2VzKHByb3ZpZGVySWQsIGV4dGVuc2lvbklkLCBzZXNzaW9uKTtcblx0XHRcdFx0dGhpcy5yZW1vdmVBY2Nlc3NSZXF1ZXN0KHByb3ZpZGVySWQsIGV4dGVuc2lvbklkKTtcblxuXHRcdFx0XHRyZXNvbHZlKHNlc3Npb24pO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZShfID0+IHtcblx0XHRcdFx0aWYgKCFxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXSkge1xuXHRcdFx0XHRcdHJlamVjdCgnVXNlciBkaWQgbm90IGNvbnNlbnQgdG8gYWNjb3VudCBhY2Nlc3MnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHF1aWNrUGljay5zaG93KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbXBsZXRlU2Vzc2lvbkFjY2Vzc1JlcXVlc3QocHJvdmlkZXI6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBleHRlbnNpb25JZDogc3RyaW5nLCBleHRlbnNpb25OYW1lOiBzdHJpbmcsIHNjb3BlTGlzdE9yUmVxdWVzdDogUmVhZG9ubHlBcnJheTxzdHJpbmc+IHwgSUF1dGhlbnRpY2F0aW9uV3d3QXV0aGVudGljYXRlUmVxdWVzdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyUmVxdWVzdHMgPSB0aGlzLl9zZXNzaW9uQWNjZXNzUmVxdWVzdEl0ZW1zLmdldChwcm92aWRlci5pZCkgfHwge307XG5cdFx0Y29uc3QgZXhpc3RpbmdSZXF1ZXN0ID0gcHJvdmlkZXJSZXF1ZXN0c1tleHRlbnNpb25JZF07XG5cdFx0aWYgKCFleGlzdGluZ1JlcXVlc3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHBvc3NpYmxlU2Vzc2lvbnMgPSBleGlzdGluZ1JlcXVlc3QucG9zc2libGVTZXNzaW9ucztcblxuXHRcdGxldCBzZXNzaW9uOiBBdXRoZW50aWNhdGlvblNlc3Npb24gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHByb3ZpZGVyLnN1cHBvcnRzTXVsdGlwbGVBY2NvdW50cykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0c2Vzc2lvbiA9IGF3YWl0IHRoaXMuc2VsZWN0U2Vzc2lvbihwcm92aWRlci5pZCwgZXh0ZW5zaW9uSWQsIGV4dGVuc2lvbk5hbWUsIHNjb3BlTGlzdE9yUmVxdWVzdCwgcG9zc2libGVTZXNzaW9ucyk7XG5cdFx0XHR9IGNhdGNoIChfKSB7XG5cdFx0XHRcdC8vIGlnbm9yZSBjYW5jZWxcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgYXBwcm92ZWQgPSBhd2FpdCB0aGlzLnNob3dHZXRTZXNzaW9uUHJvbXB0KHByb3ZpZGVyLCBwb3NzaWJsZVNlc3Npb25zWzBdLmFjY291bnQubGFiZWwsIGV4dGVuc2lvbklkLCBleHRlbnNpb25OYW1lKTtcblx0XHRcdGlmIChhcHByb3ZlZCkge1xuXHRcdFx0XHRzZXNzaW9uID0gcG9zc2libGVTZXNzaW9uc1swXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UuYWRkQWNjb3VudFVzYWdlKHByb3ZpZGVyLmlkLCBzZXNzaW9uLmFjY291bnQubGFiZWwsIHNlc3Npb24uc2NvcGVzLCBleHRlbnNpb25JZCwgZXh0ZW5zaW9uTmFtZSk7XG5cdFx0fVxuXHR9XG5cblx0cmVxdWVzdFNlc3Npb25BY2Nlc3MocHJvdmlkZXJJZDogc3RyaW5nLCBleHRlbnNpb25JZDogc3RyaW5nLCBleHRlbnNpb25OYW1lOiBzdHJpbmcsIHNjb3BlTGlzdE9yUmVxdWVzdDogUmVhZG9ubHlBcnJheTxzdHJpbmc+IHwgSUF1dGhlbnRpY2F0aW9uV3d3QXV0aGVudGljYXRlUmVxdWVzdCwgcG9zc2libGVTZXNzaW9uczogQXV0aGVudGljYXRpb25TZXNzaW9uW10pOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlclJlcXVlc3RzID0gdGhpcy5fc2Vzc2lvbkFjY2Vzc1JlcXVlc3RJdGVtcy5nZXQocHJvdmlkZXJJZCkgfHwge307XG5cdFx0Y29uc3QgaGFzRXhpc3RpbmdSZXF1ZXN0ID0gcHJvdmlkZXJSZXF1ZXN0c1tleHRlbnNpb25JZF07XG5cdFx0aWYgKGhhc0V4aXN0aW5nUmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVyKHByb3ZpZGVySWQpO1xuXHRcdGNvbnN0IG1lbnVJdGVtID0gTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5BY2NvdW50c0NvbnRleHQsIHtcblx0XHRcdGdyb3VwOiAnM19hY2Nlc3NSZXF1ZXN0cycsXG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiBgJHtwcm92aWRlcklkfSR7ZXh0ZW5zaW9uSWR9QWNjZXNzYCxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdFx0a2V5OiAnYWNjZXNzUmVxdWVzdCcsXG5cdFx0XHRcdFx0Y29tbWVudDogW2BUaGUgcGxhY2Vob2xkZXIgezB9IHdpbGwgYmUgcmVwbGFjZWQgd2l0aCBhbiBhdXRoZW50aWNhdGlvbiBwcm92aWRlcicncyBsYWJlbC4gezF9IHdpbGwgYmUgcmVwbGFjZWQgd2l0aCBhbiBleHRlbnNpb24gbmFtZS4gKDEpIGlzIHRvIGluZGljYXRlIHRoYXQgdGhpcyBtZW51IGl0ZW0gY29udHJpYnV0ZXMgdG8gYSBiYWRnZSBjb3VudGBdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdFx0XCJHcmFudCBhY2Nlc3MgdG8gezB9IGZvciB7MX0uLi4gKDEpXCIsXG5cdFx0XHRcdFx0cHJvdmlkZXIubGFiZWwsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uTmFtZSlcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGFjY2Vzc0NvbW1hbmQgPSBDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdFx0XHRpZDogYCR7cHJvdmlkZXJJZH0ke2V4dGVuc2lvbklkfUFjY2Vzc2AsXG5cdFx0XHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0dGhpcy5jb21wbGV0ZVNlc3Npb25BY2Nlc3NSZXF1ZXN0KHByb3ZpZGVyLCBleHRlbnNpb25JZCwgZXh0ZW5zaW9uTmFtZSwgc2NvcGVMaXN0T3JSZXF1ZXN0KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHByb3ZpZGVyUmVxdWVzdHNbZXh0ZW5zaW9uSWRdID0geyBwb3NzaWJsZVNlc3Npb25zLCBkaXNwb3NhYmxlczogW21lbnVJdGVtLCBhY2Nlc3NDb21tYW5kXSB9O1xuXHRcdHRoaXMuX3Nlc3Npb25BY2Nlc3NSZXF1ZXN0SXRlbXMuc2V0KHByb3ZpZGVySWQsIHByb3ZpZGVyUmVxdWVzdHMpO1xuXHRcdHRoaXMudXBkYXRlQmFkZ2VDb3VudCgpO1xuXHR9XG5cblx0YXN5bmMgcmVxdWVzdE5ld1Nlc3Npb24ocHJvdmlkZXJJZDogc3RyaW5nLCBzY29wZUxpc3RPclJlcXVlc3Q6IFJlYWRvbmx5QXJyYXk8c3RyaW5nPiB8IElBdXRoZW50aWNhdGlvbld3d0F1dGhlbnRpY2F0ZVJlcXVlc3QsIGV4dGVuc2lvbklkOiBzdHJpbmcsIGV4dGVuc2lvbk5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmlzQXV0aGVudGljYXRpb25Qcm92aWRlclJlZ2lzdGVyZWQocHJvdmlkZXJJZCkpIHtcblx0XHRcdC8vIEFjdGl2YXRlIGhhcyBhbHJlYWR5IGJlZW4gY2FsbGVkIGZvciB0aGUgYXV0aGVudGljYXRpb24gcHJvdmlkZXIsIGJ1dCBpdCBjYW5ub3QgYmxvY2sgb24gcmVnaXN0ZXJpbmcgaXRzZWxmXG5cdFx0XHQvLyBzaW5jZSB0aGlzIGlzIHN5bmMgYW5kIHJldHVybnMgYSBkaXNwb3NhYmxlLiBTbywgd2FpdCBmb3IgcmVnaXN0cmF0aW9uIGV2ZW50IHRvIGZpcmUgdGhhdCBpbmRpY2F0ZXMgdGhlXG5cdFx0XHQvLyBwcm92aWRlciBpcyBub3cgaW4gdGhlIG1hcC5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCBfKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2UgPSB0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRSZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUuaWQgPT09IHByb3ZpZGVySWQpIHtcblx0XHRcdFx0XHRcdGRpc3Bvc2UuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRsZXQgcHJvdmlkZXI6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyO1xuXHRcdHRyeSB7XG5cdFx0XHRwcm92aWRlciA9IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRQcm92aWRlcihwcm92aWRlcklkKTtcblx0XHR9IGNhdGNoIChfZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVyUmVxdWVzdHMgPSB0aGlzLl9zaWduSW5SZXF1ZXN0SXRlbXMuZ2V0KHByb3ZpZGVySWQpO1xuXHRcdGNvbnN0IHNpZ25JblJlcXVlc3RLZXkgPSBpc0F1dGhlbnRpY2F0aW9uV3d3QXV0aGVudGljYXRlUmVxdWVzdChzY29wZUxpc3RPclJlcXVlc3QpXG5cdFx0XHQ/IGAke3Njb3BlTGlzdE9yUmVxdWVzdC53d3dBdXRoZW50aWNhdGV9OiR7c2NvcGVMaXN0T3JSZXF1ZXN0LmZhbGxiYWNrU2NvcGVzPy5qb2luKFNDT1BFU0xJU1RfU0VQQVJBVE9SKSA/PyAnJ31gXG5cdFx0XHQ6IGAke3Njb3BlTGlzdE9yUmVxdWVzdC5qb2luKFNDT1BFU0xJU1RfU0VQQVJBVE9SKX1gO1xuXHRcdGNvbnN0IGV4dGVuc2lvbkhhc0V4aXN0aW5nUmVxdWVzdCA9IHByb3ZpZGVyUmVxdWVzdHNcblx0XHRcdCYmIHByb3ZpZGVyUmVxdWVzdHNbc2lnbkluUmVxdWVzdEtleV1cblx0XHRcdCYmIHByb3ZpZGVyUmVxdWVzdHNbc2lnbkluUmVxdWVzdEtleV0ucmVxdWVzdGluZ0V4dGVuc2lvbklkcy5pbmNsdWRlcyhleHRlbnNpb25JZCk7XG5cblx0XHRpZiAoZXh0ZW5zaW9uSGFzRXhpc3RpbmdSZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ29uc3RydWN0IGEgY29tbWFuZElkIHRoYXQgd29uJ3QgY2xhc2ggd2l0aCBvdGhlcnMgZ2VuZXJhdGVkIGhlcmUsIG5vciBsaWtlbHkgd2l0aCBhbiBleHRlbnNpb24ncyBjb21tYW5kXG5cdFx0Y29uc3QgY29tbWFuZElkID0gYCR7cHJvdmlkZXJJZH06JHtleHRlbnNpb25JZH06c2lnbkluJHtPYmplY3Qua2V5cyhwcm92aWRlclJlcXVlc3RzIHx8IFtdKS5sZW5ndGh9YDtcblx0XHRjb25zdCBtZW51SXRlbSA9IE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQWNjb3VudHNDb250ZXh0LCB7XG5cdFx0XHRncm91cDogJzJfc2lnbkluUmVxdWVzdHMnLFxuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogY29tbWFuZElkLFxuXHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHtcblx0XHRcdFx0XHRrZXk6ICdzaWduSW5SZXF1ZXN0Jyxcblx0XHRcdFx0XHRjb21tZW50OiBbYFRoZSBwbGFjZWhvbGRlciB7MH0gd2lsbCBiZSByZXBsYWNlZCB3aXRoIGFuIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyJ3MgbGFiZWwuIHsxfSB3aWxsIGJlIHJlcGxhY2VkIHdpdGggYW4gZXh0ZW5zaW9uIG5hbWUuICgxKSBpcyB0byBpbmRpY2F0ZSB0aGF0IHRoaXMgbWVudSBpdGVtIGNvbnRyaWJ1dGVzIHRvIGEgYmFkZ2UgY291bnQuYF1cblx0XHRcdFx0fSxcblx0XHRcdFx0XHRcIlNpZ24gaW4gd2l0aCB7MH0gdG8gdXNlIHsxfSAoMSlcIixcblx0XHRcdFx0XHRwcm92aWRlci5sYWJlbCxcblx0XHRcdFx0XHRleHRlbnNpb25OYW1lKVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2lnbkluQ29tbWFuZCA9IENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0XHRcdGlkOiBjb21tYW5kSWQsXG5cdFx0XHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0Y29uc3QgYXV0aGVudGljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBdXRoZW50aWNhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgYXV0aGVudGljYXRpb25TZXJ2aWNlLmNyZWF0ZVNlc3Npb24ocHJvdmlkZXJJZCwgc2NvcGVMaXN0T3JSZXF1ZXN0KTtcblxuXHRcdFx0XHR0aGlzLl9hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZEV4dGVuc2lvbnMocHJvdmlkZXJJZCwgc2Vzc2lvbi5hY2NvdW50LmxhYmVsLCBbeyBpZDogZXh0ZW5zaW9uSWQsIG5hbWU6IGV4dGVuc2lvbk5hbWUsIGFsbG93ZWQ6IHRydWUgfV0pO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVBY2NvdW50QW5kU2Vzc2lvblByZWZlcmVuY2VzKHByb3ZpZGVySWQsIGV4dGVuc2lvbklkLCBzZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXG5cdFx0aWYgKHByb3ZpZGVyUmVxdWVzdHMpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nUmVxdWVzdCA9IHByb3ZpZGVyUmVxdWVzdHNbc2lnbkluUmVxdWVzdEtleV0gfHwgeyBkaXNwb3NhYmxlczogW10sIHJlcXVlc3RpbmdFeHRlbnNpb25JZHM6IFtdIH07XG5cblx0XHRcdHByb3ZpZGVyUmVxdWVzdHNbc2lnbkluUmVxdWVzdEtleV0gPSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzOiBbLi4uZXhpc3RpbmdSZXF1ZXN0LmRpc3Bvc2FibGVzLCBtZW51SXRlbSwgc2lnbkluQ29tbWFuZF0sXG5cdFx0XHRcdHJlcXVlc3RpbmdFeHRlbnNpb25JZHM6IFsuLi5leGlzdGluZ1JlcXVlc3QucmVxdWVzdGluZ0V4dGVuc2lvbklkcywgZXh0ZW5zaW9uSWRdXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fc2lnbkluUmVxdWVzdEl0ZW1zLnNldChwcm92aWRlcklkLCBwcm92aWRlclJlcXVlc3RzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2lnbkluUmVxdWVzdEl0ZW1zLnNldChwcm92aWRlcklkLCB7XG5cdFx0XHRcdFtzaWduSW5SZXF1ZXN0S2V5XToge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzOiBbbWVudUl0ZW0sIHNpZ25JbkNvbW1hbmRdLFxuXHRcdFx0XHRcdHJlcXVlc3RpbmdFeHRlbnNpb25JZHM6IFtleHRlbnNpb25JZF1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVCYWRnZUNvdW50KCk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UsIEF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQVksaUJBQWlCLFNBQXNCLHlCQUF5QjtBQUNyRixTQUFTLG1CQUFtQjtBQUM1QixZQUFZLFNBQVM7QUFDckIsU0FBUyxRQUFRLG9CQUFvQjtBQUNyQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxrQkFBa0IsbUJBQW1CO0FBQzlDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQXlELHdCQUF3QixrQ0FBdUcsOENBQThDO0FBQ3RPLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUEyQjtBQUdwQyxNQUFNLHVCQUF1QjtBQVl0QixJQUFNLGtDQUFOLGNBQThDLFdBQXVEO0FBQUEsRUFZM0csWUFDb0MsaUJBQ0QsZ0JBQ0QsZUFDSSxtQkFDSCxpQkFDTyx3QkFDSyw2QkFDQyw4QkFDOUM7QUFDRCxVQUFNO0FBVDZCO0FBQ0Q7QUFDRDtBQUNJO0FBQ0g7QUFDTztBQUNLO0FBQ0M7QUFsQmhELFNBQVEsc0JBQXNCLG9CQUFJLElBQWdDO0FBQ2xFLFNBQVEsNkJBQTZCLG9CQUFJLElBQWtIO0FBQzNKLFNBQWlCLDBCQUEwQixLQUFLLFVBQVUsSUFBSSxrQkFBa0IsQ0FBQztBQUVqRixTQUFRLGdDQUF5RixLQUFLLFVBQVUsSUFBSSxRQUF3RCxDQUFDO0FBQzdLLFNBQVMsK0JBQStCLEtBQUssOEJBQThCO0FBZ0IxRSxTQUFLLGdEQUFnRCxLQUFLLGdCQUFnQixnQ0FBZ0MsQ0FBQztBQUMzRyxTQUFLLDZDQUE2QyxPQUFPLFFBQVEsS0FBSyw2Q0FBNkMsRUFBRSxPQUEwQyxDQUFDLEtBQUssQ0FBQyxRQUFRLFFBQVEsTUFBTTtBQUMzTCxlQUFTLFFBQVEsQ0FBQyxVQUFrQjtBQUNuQyxZQUFJLEtBQUssSUFBSTtBQUFBLE1BQ2QsQ0FBQztBQUNELGFBQU87QUFBQSxJQUNSLEdBQUcsQ0FBQyxDQUFDO0FBQ0wsU0FBSyxrQkFBa0I7QUFBQSxFQUN4QjtBQUFBLEVBRVEsb0JBQW9CO0FBQzNCLFNBQUssVUFBVSxLQUFLLHVCQUF1QixvQkFBb0IsT0FBSztBQUNuRSxVQUFJLEVBQUUsTUFBTSxPQUFPLFFBQVE7QUFDMUIsYUFBSyx5QkFBeUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxLQUFLO0FBQUEsTUFDMUQ7QUFDQSxVQUFJLEVBQUUsTUFBTSxTQUFTLFFBQVE7QUFDNUIsYUFBSyxxQkFBcUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxPQUFPO0FBQUEsTUFDeEQ7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxLQUFLLHVCQUF1QixzQ0FBc0MsT0FBSztBQUNyRixZQUFNLGlCQUFpQixLQUFLLDJCQUEyQixJQUFJLEVBQUUsRUFBRSxLQUFLLENBQUM7QUFDckUsYUFBTyxLQUFLLGNBQWMsRUFBRSxRQUFRLGlCQUFlO0FBQ2xELGFBQUssb0JBQW9CLEVBQUUsSUFBSSxXQUFXO0FBQUEsTUFDM0MsQ0FBQztBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEseUJBQXlCLFlBQW9CLGVBQXVEO0FBQ25HLFVBQU0sOEJBQThCLEtBQUssb0JBQW9CLElBQUksVUFBVTtBQUMzRSxRQUFJLENBQUMsNkJBQTZCO0FBQ2pDO0FBQUEsSUFDRDtBQUVBLFdBQU8sS0FBSywyQkFBMkIsRUFBRSxRQUFRLHFCQUFtQjtBQUVuRSxZQUFNLHVCQUF1QixnQkFBZ0IsTUFBTSxvQkFBb0I7QUFHdkUsVUFBSSxjQUFjLEtBQUssYUFBVyxZQUFZLFFBQVEsUUFBUSxvQkFBb0IsQ0FBQyxHQUFHO0FBQ3JGLGNBQU0saUJBQWlCLDRCQUE0QixlQUFlO0FBQ2xFLHdCQUFnQixZQUFZLFFBQVEsVUFBUSxLQUFLLFFBQVEsQ0FBQztBQUUxRCxlQUFPLDRCQUE0QixlQUFlO0FBQ2xELFlBQUksT0FBTyxLQUFLLDJCQUEyQixFQUFFLFdBQVcsR0FBRztBQUMxRCxlQUFLLG9CQUFvQixPQUFPLFVBQVU7QUFBQSxRQUMzQyxPQUFPO0FBQ04sZUFBSyxvQkFBb0IsSUFBSSxZQUFZLDJCQUEyQjtBQUFBLFFBQ3JFO0FBQ0EsYUFBSyxpQkFBaUI7QUFBQSxNQUN2QjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLHFCQUFxQixZQUFvQixpQkFBeUQ7QUFDekcsVUFBTSxtQkFBbUIsS0FBSywyQkFBMkIsSUFBSSxVQUFVO0FBQ3ZFLFFBQUksa0JBQWtCO0FBQ3JCLGFBQU8sS0FBSyxnQkFBZ0IsRUFBRSxRQUFRLGlCQUFlO0FBQ3BELHdCQUFnQixRQUFRLGFBQVc7QUFDbEMsZ0JBQU0saUJBQWlCLGlCQUFpQixXQUFXLEVBQUUsaUJBQWlCLFVBQVUsYUFBVyxRQUFRLE9BQU8sUUFBUSxFQUFFO0FBQ3BILGNBQUksZ0JBQWdCO0FBQ25CLDZCQUFpQixXQUFXLEVBQUUsaUJBQWlCLE9BQU8sZ0JBQWdCLENBQUM7QUFBQSxVQUN4RTtBQUFBLFFBQ0QsQ0FBQztBQUVELFlBQUksQ0FBQyxpQkFBaUIsV0FBVyxFQUFFLGlCQUFpQixRQUFRO0FBQzNELGVBQUssb0JBQW9CLFlBQVksV0FBVztBQUFBLFFBQ2pEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLG1CQUF5QjtBQUNoQyxTQUFLLHdCQUF3QixNQUFNO0FBRW5DLFFBQUksbUJBQW1CO0FBQ3ZCLFNBQUssb0JBQW9CLFFBQVEsc0JBQW9CO0FBQ3BELGFBQU8sS0FBSyxnQkFBZ0IsRUFBRSxRQUFRLGFBQVc7QUFDaEQsNEJBQW9CLGlCQUFpQixPQUFPLEVBQUUsdUJBQXVCO0FBQUEsTUFDdEUsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssMkJBQTJCLFFBQVEsbUJBQWlCO0FBQ3hELDBCQUFvQixPQUFPLEtBQUssYUFBYSxFQUFFO0FBQUEsSUFDaEQsQ0FBQztBQUVELFFBQUksbUJBQW1CLEdBQUc7QUFDekIsWUFBTSxRQUFRLElBQUksWUFBWSxrQkFBa0IsTUFBTSxJQUFJLFNBQVMsV0FBVyxtQkFBbUIsQ0FBQztBQUNsRyxXQUFLLHdCQUF3QixRQUFRLEtBQUssZ0JBQWdCLHFCQUFxQixFQUFFLE1BQU0sQ0FBQztBQUFBLElBQ3pGO0FBQUEsRUFDRDtBQUFBLEVBRVEsb0JBQW9CLFlBQW9CLGFBQTJCO0FBQzFFLFVBQU0sbUJBQW1CLEtBQUssMkJBQTJCLElBQUksVUFBVSxLQUFLLENBQUM7QUFDN0UsUUFBSSxpQkFBaUIsV0FBVyxHQUFHO0FBQ2xDLGNBQVEsaUJBQWlCLFdBQVcsRUFBRSxXQUFXO0FBQ2pELGFBQU8saUJBQWlCLFdBQVc7QUFDbkMsV0FBSyxpQkFBaUI7QUFBQSxJQUN2QjtBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBSUEsd0JBQXdCLGFBQXFCLFlBQW9CLFNBQTZDO0FBQzdHLFVBQU0sa0JBQWtCLG9CQUFvQixNQUFNLFdBQVc7QUFDN0QsVUFBTSxvQkFBb0IsS0FBSywyQ0FBMkMsZUFBZSxLQUFLO0FBQzlGLFVBQU0sTUFBTSxLQUFLLFFBQVEsbUJBQW1CLFVBQVU7QUFLdEQsU0FBSyxlQUFlLE1BQU0sS0FBSyxRQUFRLE9BQU8sYUFBYSxXQUFXLGNBQWMsT0FBTztBQUMzRixTQUFLLGVBQWUsTUFBTSxLQUFLLFFBQVEsT0FBTyxhQUFhLGFBQWEsY0FBYyxPQUFPO0FBRTdGLFVBQU0scUJBQXFCLEtBQUssOENBQThDLGlCQUFpQjtBQUMvRixVQUFNLGVBQWUscUJBQXFCLENBQUMsbUJBQW1CLEdBQUcsa0JBQWtCLElBQUksQ0FBQyxpQkFBaUI7QUFDekcsU0FBSyw4QkFBOEIsS0FBSyxFQUFFLGNBQWMsV0FBVyxDQUFDO0FBQUEsRUFDckU7QUFBQSxFQUVBLHFCQUFxQixhQUFxQixZQUF3QztBQUNqRixVQUFNLGtCQUFrQixvQkFBb0IsTUFBTSxXQUFXO0FBQzdELFVBQU0sTUFBTSxLQUFLLFFBQVEsS0FBSywyQ0FBMkMsZUFBZSxLQUFLLGlCQUFpQixVQUFVO0FBR3hILFdBQU8sS0FBSyxlQUFlLElBQUksS0FBSyxhQUFhLFNBQVMsS0FBSyxLQUFLLGVBQWUsSUFBSSxLQUFLLGFBQWEsV0FBVztBQUFBLEVBQ3JIO0FBQUEsRUFFQSx3QkFBd0IsYUFBcUIsWUFBMEI7QUFDdEUsVUFBTSxrQkFBa0Isb0JBQW9CLE1BQU0sV0FBVztBQUM3RCxVQUFNLE1BQU0sS0FBSyxRQUFRLEtBQUssMkNBQTJDLGVBQWUsS0FBSyxpQkFBaUIsVUFBVTtBQU14SCxTQUFLLGVBQWUsT0FBTyxLQUFLLGFBQWEsU0FBUztBQUN0RCxTQUFLLGVBQWUsT0FBTyxLQUFLLGFBQWEsV0FBVztBQUFBLEVBQ3pEO0FBQUEsRUFFUSxRQUFRLGFBQXFCLFlBQTRCO0FBQ2hFLFdBQU8sR0FBRyxXQUFXLElBQUksVUFBVTtBQUFBLEVBQ3BDO0FBQUE7QUFBQSxFQUlBLHdCQUF3QixZQUFvQixhQUFxQixTQUFzQztBQUN0RyxVQUFNLGtCQUFrQixvQkFBb0IsTUFBTSxXQUFXO0FBSzdELFVBQU0sTUFBTSxHQUFHLGVBQWUsSUFBSSxVQUFVLElBQUksUUFBUSxPQUFPLEtBQUssb0JBQW9CLENBQUM7QUFLekYsU0FBSyxlQUFlLE1BQU0sS0FBSyxRQUFRLElBQUksYUFBYSxXQUFXLGNBQWMsT0FBTztBQUN4RixTQUFLLGVBQWUsTUFBTSxLQUFLLFFBQVEsSUFBSSxhQUFhLGFBQWEsY0FBYyxPQUFPO0FBQUEsRUFDM0Y7QUFBQSxFQUVBLHFCQUFxQixZQUFvQixhQUFxQixRQUFzQztBQUNuRyxVQUFNLGtCQUFrQixvQkFBb0IsTUFBTSxXQUFXO0FBSzdELFVBQU0sTUFBTSxHQUFHLGVBQWUsSUFBSSxVQUFVLElBQUksT0FBTyxLQUFLLG9CQUFvQixDQUFDO0FBR2pGLFdBQU8sS0FBSyxlQUFlLElBQUksS0FBSyxhQUFhLFNBQVMsS0FBSyxLQUFLLGVBQWUsSUFBSSxLQUFLLGFBQWEsV0FBVztBQUFBLEVBQ3JIO0FBQUEsRUFFQSx3QkFBd0IsWUFBb0IsYUFBcUIsUUFBd0I7QUFDeEYsVUFBTSxrQkFBa0Isb0JBQW9CLE1BQU0sV0FBVztBQUs3RCxVQUFNLE1BQU0sR0FBRyxlQUFlLElBQUksVUFBVSxJQUFJLE9BQU8sS0FBSyxvQkFBb0IsQ0FBQztBQU1qRixTQUFLLGVBQWUsT0FBTyxLQUFLLGFBQWEsU0FBUztBQUN0RCxTQUFLLGVBQWUsT0FBTyxLQUFLLGFBQWEsV0FBVztBQUFBLEVBQ3pEO0FBQUEsRUFFUSxvQ0FBb0MsWUFBb0IsYUFBcUIsU0FBc0M7QUFDMUgsU0FBSyx3QkFBd0IsYUFBYSxZQUFZLFFBQVEsT0FBTztBQUNyRSxTQUFLLHdCQUF3QixZQUFZLGFBQWEsT0FBTztBQUFBLEVBQzlEO0FBQUE7QUFBQSxFQUlBLE1BQWMscUJBQXFCLFVBQW1DLGFBQXFCLGFBQXFCLGVBQXlDO0FBQ3hKLFFBQUs7QUFBTCxNQUFLQSx5QkFBTDtBQUNDLE1BQUFBLDBDQUFBLFdBQVEsS0FBUjtBQUNBLE1BQUFBLDBDQUFBLFVBQU8sS0FBUDtBQUNBLE1BQUFBLDBDQUFBLFlBQVMsS0FBVDtBQUFBLE9BSEk7QUFLTCxVQUFNLEVBQUUsT0FBTyxJQUFJLE1BQU0sS0FBSyxjQUFjLE9BQTRCO0FBQUEsTUFDdkUsTUFBTSxTQUFTO0FBQUEsTUFDZixTQUFTLElBQUksU0FBUywrQkFBK0IsOERBQThELGVBQWUsU0FBUyxPQUFPLFdBQVc7QUFBQSxNQUM3SixTQUFTO0FBQUEsUUFDUjtBQUFBLFVBQ0MsT0FBTyxJQUFJLFNBQVMsRUFBRSxLQUFLLFNBQVMsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsU0FBUztBQUFBLFVBQ25GLEtBQUssTUFBTTtBQUFBLFFBQ1o7QUFBQSxRQUNBO0FBQUEsVUFDQyxPQUFPLElBQUksU0FBUyxFQUFFLEtBQUssUUFBUSxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxRQUFRO0FBQUEsVUFDakYsS0FBSyxNQUFNO0FBQUEsUUFDWjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLGNBQWM7QUFBQSxRQUNiLEtBQUssTUFBTTtBQUFBLE1BQ1o7QUFBQSxJQUNELENBQUM7QUFFRCxRQUFJLFdBQVcsZ0JBQTRCO0FBQzFDLFdBQUssNkJBQTZCLHdCQUF3QixTQUFTLElBQUksYUFBYSxDQUFDLEVBQUUsSUFBSSxhQUFhLE1BQU0sZUFBZSxTQUFTLFdBQVcsY0FBMEIsQ0FBQyxDQUFDO0FBQzdLLFdBQUssb0JBQW9CLFNBQVMsSUFBSSxXQUFXO0FBQUEsSUFDbEQ7QUFFQSxXQUFPLFdBQVc7QUFBQSxFQUNuQjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsTUFBTSxjQUFjLFlBQW9CLGFBQXFCLGVBQXVCLG9CQUFtRixtQkFBNEU7QUFDbFAsVUFBTSxjQUFjLE1BQU0sS0FBSyx1QkFBdUIsWUFBWSxVQUFVO0FBQzVFLFFBQUksQ0FBQyxZQUFZLFFBQVE7QUFDeEIsWUFBTSxJQUFJLE1BQU0sdUJBQXVCO0FBQUEsSUFDeEM7QUFDQSxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsVUFBTSxZQUFZLFlBQVksSUFBSSxLQUFLLGtCQUFrQixnQkFBNEcsQ0FBQztBQUN0SyxjQUFVLGlCQUFpQjtBQUMzQixVQUFNLHVCQUF1QixvQkFBSSxJQUFZO0FBQzdDLFVBQU0sUUFBc0csa0JBRTFHLE9BQU8sYUFBVyxDQUFDLHFCQUFxQixJQUFJLFFBQVEsUUFBUSxLQUFLLEtBQUsscUJBQXFCLElBQUksUUFBUSxRQUFRLEtBQUssQ0FBQyxFQUNySCxJQUFJLGFBQVc7QUFDZixhQUFPO0FBQUEsUUFDTixPQUFPLFFBQVEsUUFBUTtBQUFBLFFBQ3ZCO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUlGLGdCQUFZLFFBQVEsYUFBVztBQUM5QixVQUFJLENBQUMscUJBQXFCLElBQUksUUFBUSxLQUFLLEdBQUc7QUFDN0MsY0FBTSxLQUFLLEVBQUUsT0FBTyxRQUFRLE9BQU8sUUFBUSxDQUFDO0FBQUEsTUFDN0M7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLEtBQUssRUFBRSxPQUFPLElBQUksU0FBUyxtQkFBbUIsNEJBQTRCLEVBQUUsQ0FBQztBQUNuRixjQUFVLFFBQVE7QUFDbEIsY0FBVSxRQUFRLElBQUk7QUFBQSxNQUNyQjtBQUFBLFFBQ0MsS0FBSztBQUFBLFFBQ0wsU0FBUyxDQUFDLHVIQUF1SDtBQUFBLE1BQ2xJO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLEtBQUssdUJBQXVCLFlBQVksVUFBVSxFQUFFO0FBQUEsSUFDckQ7QUFDQSxjQUFVLGNBQWMsSUFBSSxTQUFTLHlCQUF5Qix1REFBdUQsYUFBYTtBQUVsSSxXQUFPLE1BQU0sSUFBSSxRQUFRLENBQUMsU0FBUyxXQUFXO0FBQzdDLGtCQUFZLElBQUksVUFBVSxZQUFZLE9BQU0sTUFBSztBQUNoRCxrQkFBVSxRQUFRO0FBQ2xCLFlBQUksVUFBVSxVQUFVLGNBQWMsQ0FBQyxFQUFFO0FBQ3pDLFlBQUksQ0FBQyxTQUFTO0FBQ2IsZ0JBQU0sVUFBVSxVQUFVLGNBQWMsQ0FBQyxFQUFFO0FBQzNDLGNBQUk7QUFDSCxzQkFBVSxNQUFNLEtBQUssdUJBQXVCLGNBQWMsWUFBWSxvQkFBb0IsRUFBRSxRQUFRLENBQUM7QUFBQSxVQUN0RyxTQUFTLEdBQUc7QUFDWCxtQkFBTyxDQUFDO0FBQ1I7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUNBLGNBQU0sY0FBYyxRQUFRLFFBQVE7QUFFcEMsYUFBSyw2QkFBNkIsd0JBQXdCLFlBQVksYUFBYSxDQUFDLEVBQUUsSUFBSSxhQUFhLE1BQU0sZUFBZSxTQUFTLEtBQUssQ0FBQyxDQUFDO0FBQzVJLGFBQUssb0NBQW9DLFlBQVksYUFBYSxPQUFPO0FBQ3pFLGFBQUssb0JBQW9CLFlBQVksV0FBVztBQUVoRCxnQkFBUSxPQUFPO0FBQUEsTUFDaEIsQ0FBQyxDQUFDO0FBRUYsa0JBQVksSUFBSSxVQUFVLFVBQVUsT0FBSztBQUN4QyxZQUFJLENBQUMsVUFBVSxjQUFjLENBQUMsR0FBRztBQUNoQyxpQkFBTyx3Q0FBd0M7QUFBQSxRQUNoRDtBQUNBLG9CQUFZLFFBQVE7QUFBQSxNQUNyQixDQUFDLENBQUM7QUFFRixnQkFBVSxLQUFLO0FBQUEsSUFDaEIsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsNkJBQTZCLFVBQW1DLGFBQXFCLGVBQXVCLG9CQUFrRztBQUMzTixVQUFNLG1CQUFtQixLQUFLLDJCQUEyQixJQUFJLFNBQVMsRUFBRSxLQUFLLENBQUM7QUFDOUUsVUFBTSxrQkFBa0IsaUJBQWlCLFdBQVc7QUFDcEQsUUFBSSxDQUFDLGlCQUFpQjtBQUNyQjtBQUFBLElBQ0Q7QUFFQSxRQUFJLENBQUMsVUFBVTtBQUNkO0FBQUEsSUFDRDtBQUNBLFVBQU0sbUJBQW1CLGdCQUFnQjtBQUV6QyxRQUFJO0FBQ0osUUFBSSxTQUFTLDBCQUEwQjtBQUN0QyxVQUFJO0FBQ0gsa0JBQVUsTUFBTSxLQUFLLGNBQWMsU0FBUyxJQUFJLGFBQWEsZUFBZSxvQkFBb0IsZ0JBQWdCO0FBQUEsTUFDakgsU0FBUyxHQUFHO0FBQUEsTUFFWjtBQUFBLElBQ0QsT0FBTztBQUNOLFlBQU0sV0FBVyxNQUFNLEtBQUsscUJBQXFCLFVBQVUsaUJBQWlCLENBQUMsRUFBRSxRQUFRLE9BQU8sYUFBYSxhQUFhO0FBQ3hILFVBQUksVUFBVTtBQUNiLGtCQUFVLGlCQUFpQixDQUFDO0FBQUEsTUFDN0I7QUFBQSxJQUNEO0FBRUEsUUFBSSxTQUFTO0FBQ1osV0FBSyw0QkFBNEIsZ0JBQWdCLFNBQVMsSUFBSSxRQUFRLFFBQVEsT0FBTyxRQUFRLFFBQVEsYUFBYSxhQUFhO0FBQUEsSUFDaEk7QUFBQSxFQUNEO0FBQUEsRUFFQSxxQkFBcUIsWUFBb0IsYUFBcUIsZUFBdUIsb0JBQW1GLGtCQUFpRDtBQUN4TixVQUFNLG1CQUFtQixLQUFLLDJCQUEyQixJQUFJLFVBQVUsS0FBSyxDQUFDO0FBQzdFLFVBQU0scUJBQXFCLGlCQUFpQixXQUFXO0FBQ3ZELFFBQUksb0JBQW9CO0FBQ3ZCO0FBQUEsSUFDRDtBQUVBLFVBQU0sV0FBVyxLQUFLLHVCQUF1QixZQUFZLFVBQVU7QUFDbkUsVUFBTSxXQUFXLGFBQWEsZUFBZSxPQUFPLGlCQUFpQjtBQUFBLE1BQ3BFLE9BQU87QUFBQSxNQUNQLFNBQVM7QUFBQSxRQUNSLElBQUksR0FBRyxVQUFVLEdBQUcsV0FBVztBQUFBLFFBQy9CLE9BQU8sSUFBSTtBQUFBLFVBQVM7QUFBQSxZQUNuQixLQUFLO0FBQUEsWUFDTCxTQUFTLENBQUMsaU1BQWlNO0FBQUEsVUFDNU07QUFBQSxVQUNDO0FBQUEsVUFDQSxTQUFTO0FBQUEsVUFDVDtBQUFBLFFBQWE7QUFBQSxNQUNmO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxnQkFBZ0IsaUJBQWlCLGdCQUFnQjtBQUFBLE1BQ3RELElBQUksR0FBRyxVQUFVLEdBQUcsV0FBVztBQUFBLE1BQy9CLFNBQVMsT0FBTyxhQUFhO0FBQzVCLGFBQUssNkJBQTZCLFVBQVUsYUFBYSxlQUFlLGtCQUFrQjtBQUFBLE1BQzNGO0FBQUEsSUFDRCxDQUFDO0FBRUQscUJBQWlCLFdBQVcsSUFBSSxFQUFFLGtCQUFrQixhQUFhLENBQUMsVUFBVSxhQUFhLEVBQUU7QUFDM0YsU0FBSywyQkFBMkIsSUFBSSxZQUFZLGdCQUFnQjtBQUNoRSxTQUFLLGlCQUFpQjtBQUFBLEVBQ3ZCO0FBQUEsRUFFQSxNQUFNLGtCQUFrQixZQUFvQixvQkFBbUYsYUFBcUIsZUFBc0M7QUFDekwsUUFBSSxDQUFDLEtBQUssdUJBQXVCLG1DQUFtQyxVQUFVLEdBQUc7QUFJaEYsWUFBTSxJQUFJLFFBQWMsQ0FBQyxTQUFTLE1BQU07QUFDdkMsY0FBTUMsV0FBVSxLQUFLLHVCQUF1QixvQ0FBb0MsT0FBSztBQUNwRixjQUFJLEVBQUUsT0FBTyxZQUFZO0FBQ3hCLFlBQUFBLFNBQVEsUUFBUTtBQUNoQixvQkFBUTtBQUFBLFVBQ1Q7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGO0FBRUEsUUFBSTtBQUNKLFFBQUk7QUFDSCxpQkFBVyxLQUFLLHVCQUF1QixZQUFZLFVBQVU7QUFBQSxJQUM5RCxTQUFTLElBQUk7QUFDWjtBQUFBLElBQ0Q7QUFFQSxVQUFNLG1CQUFtQixLQUFLLG9CQUFvQixJQUFJLFVBQVU7QUFDaEUsVUFBTSxtQkFBbUIsdUNBQXVDLGtCQUFrQixJQUMvRSxHQUFHLG1CQUFtQixlQUFlLElBQUksbUJBQW1CLGdCQUFnQixLQUFLLG9CQUFvQixLQUFLLEVBQUUsS0FDNUcsR0FBRyxtQkFBbUIsS0FBSyxvQkFBb0IsQ0FBQztBQUNuRCxVQUFNLDhCQUE4QixvQkFDaEMsaUJBQWlCLGdCQUFnQixLQUNqQyxpQkFBaUIsZ0JBQWdCLEVBQUUsdUJBQXVCLFNBQVMsV0FBVztBQUVsRixRQUFJLDZCQUE2QjtBQUNoQztBQUFBLElBQ0Q7QUFHQSxVQUFNLFlBQVksR0FBRyxVQUFVLElBQUksV0FBVyxVQUFVLE9BQU8sS0FBSyxvQkFBb0IsQ0FBQyxDQUFDLEVBQUUsTUFBTTtBQUNsRyxVQUFNLFdBQVcsYUFBYSxlQUFlLE9BQU8saUJBQWlCO0FBQUEsTUFDcEUsT0FBTztBQUFBLE1BQ1AsU0FBUztBQUFBLFFBQ1IsSUFBSTtBQUFBLFFBQ0osT0FBTyxJQUFJO0FBQUEsVUFBUztBQUFBLFlBQ25CLEtBQUs7QUFBQSxZQUNMLFNBQVMsQ0FBQyxpTUFBaU07QUFBQSxVQUM1TTtBQUFBLFVBQ0M7QUFBQSxVQUNBLFNBQVM7QUFBQSxVQUNUO0FBQUEsUUFBYTtBQUFBLE1BQ2Y7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLGdCQUFnQixpQkFBaUIsZ0JBQWdCO0FBQUEsTUFDdEQsSUFBSTtBQUFBLE1BQ0osU0FBUyxPQUFPLGFBQWE7QUFDNUIsY0FBTSx3QkFBd0IsU0FBUyxJQUFJLHNCQUFzQjtBQUNqRSxjQUFNLFVBQVUsTUFBTSxzQkFBc0IsY0FBYyxZQUFZLGtCQUFrQjtBQUV4RixhQUFLLDZCQUE2Qix3QkFBd0IsWUFBWSxRQUFRLFFBQVEsT0FBTyxDQUFDLEVBQUUsSUFBSSxhQUFhLE1BQU0sZUFBZSxTQUFTLEtBQUssQ0FBQyxDQUFDO0FBQ3RKLGFBQUssb0NBQW9DLFlBQVksYUFBYSxPQUFPO0FBQUEsTUFDMUU7QUFBQSxJQUNELENBQUM7QUFHRCxRQUFJLGtCQUFrQjtBQUNyQixZQUFNLGtCQUFrQixpQkFBaUIsZ0JBQWdCLEtBQUssRUFBRSxhQUFhLENBQUMsR0FBRyx3QkFBd0IsQ0FBQyxFQUFFO0FBRTVHLHVCQUFpQixnQkFBZ0IsSUFBSTtBQUFBLFFBQ3BDLGFBQWEsQ0FBQyxHQUFHLGdCQUFnQixhQUFhLFVBQVUsYUFBYTtBQUFBLFFBQ3JFLHdCQUF3QixDQUFDLEdBQUcsZ0JBQWdCLHdCQUF3QixXQUFXO0FBQUEsTUFDaEY7QUFDQSxXQUFLLG9CQUFvQixJQUFJLFlBQVksZ0JBQWdCO0FBQUEsSUFDMUQsT0FBTztBQUNOLFdBQUssb0JBQW9CLElBQUksWUFBWTtBQUFBLFFBQ3hDLENBQUMsZ0JBQWdCLEdBQUc7QUFBQSxVQUNuQixhQUFhLENBQUMsVUFBVSxhQUFhO0FBQUEsVUFDckMsd0JBQXdCLENBQUMsV0FBVztBQUFBLFFBQ3JDO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUVBLFNBQUssaUJBQWlCO0FBQUEsRUFDdkI7QUFDRDtBQXZkYSxrQ0FBTjtBQUFBLEVBYUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FwQlU7QUF5ZGIsa0JBQWtCLGtDQUFrQyxpQ0FBaUMsa0JBQWtCLE9BQU87IiwKICAibmFtZXMiOiBbIlNlc3Npb25Qcm9tcHRDaG9pY2UiLCAiZGlzcG9zZSJdCn0K
