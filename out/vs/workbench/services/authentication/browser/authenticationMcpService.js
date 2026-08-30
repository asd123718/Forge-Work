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
import { IAuthenticationMcpAccessService } from "./authenticationMcpAccessService.js";
import { IAuthenticationMcpUsageService } from "./authenticationMcpUsageService.js";
import { IAuthenticationService } from "../common/authentication.js";
import { Emitter } from "../../../../base/common/event.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
const SCOPESLIST_SEPARATOR = " ";
const IAuthenticationMcpService = createDecorator("IAuthenticationMcpService");
let AuthenticationMcpService = class extends Disposable {
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
    this._register(this._authenticationService.onDidChangeSessions(async (e) => {
      if (e.event.added?.length) {
        await this.updateNewSessionRequests(e.providerId, e.event.added);
      }
      if (e.event.removed?.length) {
        await this.updateAccessRequests(e.providerId, e.event.removed);
      }
      this.updateBadgeCount();
    }));
    this._register(this._authenticationService.onDidUnregisterAuthenticationProvider((e) => {
      const accessRequests = this._sessionAccessRequestItems.get(e.id) || {};
      Object.keys(accessRequests).forEach((mcpServerId) => {
        this.removeAccessRequest(e.id, mcpServerId);
      });
    }));
  }
  async updateNewSessionRequests(providerId, addedSessions) {
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
      }
    });
  }
  async updateAccessRequests(providerId, removedSessions) {
    const providerRequests = this._sessionAccessRequestItems.get(providerId);
    if (providerRequests) {
      Object.keys(providerRequests).forEach((mcpServerId) => {
        removedSessions.forEach((removed) => {
          const indexOfSession = providerRequests[mcpServerId].possibleSessions.findIndex((session) => session.id === removed.id);
          if (indexOfSession) {
            providerRequests[mcpServerId].possibleSessions.splice(indexOfSession, 1);
          }
        });
        if (!providerRequests[mcpServerId].possibleSessions.length) {
          this.removeAccessRequest(providerId, mcpServerId);
        }
      });
    }
  }
  updateBadgeCount() {
    this._accountBadgeDisposable.clear();
    let numberOfRequests = 0;
    this._signInRequestItems.forEach((providerRequests) => {
      Object.keys(providerRequests).forEach((request) => {
        numberOfRequests += providerRequests[request].requestingMcpServerIds.length;
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
  removeAccessRequest(providerId, mcpServerId) {
    const providerRequests = this._sessionAccessRequestItems.get(providerId) || {};
    if (providerRequests[mcpServerId]) {
      dispose(providerRequests[mcpServerId].disposables);
      delete providerRequests[mcpServerId];
      this.updateBadgeCount();
    }
  }
  //#region Account/Session Preference
  updateAccountPreference(mcpServerId, providerId, account) {
    const parentMcpServerId = this._inheritAuthAccountPreferenceChildToParent[mcpServerId] ?? mcpServerId;
    const key = this._getKey(parentMcpServerId, providerId);
    this.storageService.store(key, account.label, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    this.storageService.store(key, account.label, StorageScope.APPLICATION, StorageTarget.MACHINE);
    const childrenMcpServers = this._inheritAuthAccountPreferenceParentToChildren[parentMcpServerId];
    const mcpServerIds = childrenMcpServers ? [parentMcpServerId, ...childrenMcpServers] : [parentMcpServerId];
    this._onDidAccountPreferenceChange.fire({ mcpServerIds, providerId });
  }
  getAccountPreference(mcpServerId, providerId) {
    const key = this._getKey(this._inheritAuthAccountPreferenceChildToParent[mcpServerId] ?? mcpServerId, providerId);
    return this.storageService.get(key, StorageScope.WORKSPACE) ?? this.storageService.get(key, StorageScope.APPLICATION);
  }
  removeAccountPreference(mcpServerId, providerId) {
    const key = this._getKey(this._inheritAuthAccountPreferenceChildToParent[mcpServerId] ?? mcpServerId, providerId);
    this.storageService.remove(key, StorageScope.WORKSPACE);
    this.storageService.remove(key, StorageScope.APPLICATION);
  }
  _getKey(mcpServerId, providerId) {
    return `${mcpServerId}-${providerId}`;
  }
  // TODO@TylerLeonhardt: Remove all of this after a couple iterations
  updateSessionPreference(providerId, mcpServerId, session) {
    const key = `${mcpServerId}-${providerId}-${session.scopes.join(SCOPESLIST_SEPARATOR)}`;
    this.storageService.store(key, session.id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    this.storageService.store(key, session.id, StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
  getSessionPreference(providerId, mcpServerId, scopes) {
    const key = `${mcpServerId}-${providerId}-${scopes.join(SCOPESLIST_SEPARATOR)}`;
    return this.storageService.get(key, StorageScope.WORKSPACE) ?? this.storageService.get(key, StorageScope.APPLICATION);
  }
  removeSessionPreference(providerId, mcpServerId, scopes) {
    const key = `${mcpServerId}-${providerId}-${scopes.join(SCOPESLIST_SEPARATOR)}`;
    this.storageService.remove(key, StorageScope.WORKSPACE);
    this.storageService.remove(key, StorageScope.APPLICATION);
  }
  _updateAccountAndSessionPreferences(providerId, mcpServerId, session) {
    this.updateAccountPreference(mcpServerId, providerId, session.account);
    this.updateSessionPreference(providerId, mcpServerId, session);
  }
  //#endregion
  async showGetSessionPrompt(provider, accountName, mcpServerId, mcpServerName) {
    let SessionPromptChoice;
    ((SessionPromptChoice2) => {
      SessionPromptChoice2[SessionPromptChoice2["Allow"] = 0] = "Allow";
      SessionPromptChoice2[SessionPromptChoice2["Deny"] = 1] = "Deny";
      SessionPromptChoice2[SessionPromptChoice2["Cancel"] = 2] = "Cancel";
    })(SessionPromptChoice || (SessionPromptChoice = {}));
    const { result } = await this.dialogService.prompt({
      type: Severity.Info,
      message: nls.localize("confirmAuthenticationAccess", "The MCP server '{0}' wants to access the {1} account '{2}'.", mcpServerName, provider.label, accountName),
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
      this._authenticationAccessService.updateAllowedMcpServers(provider.id, accountName, [{ id: mcpServerId, name: mcpServerName, allowed: result === 0 /* Allow */ }]);
      this.removeAccessRequest(provider.id, mcpServerId);
    }
    return result === 0 /* Allow */;
  }
  /**
   * This function should be used only when there are sessions to disambiguate.
   */
  async selectSession(providerId, mcpServerId, mcpServerName, scopes, availableSessions) {
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
        comment: ["The placeholder {0} is the name of a MCP server. {1} is the name of the type of account, such as Microsoft or GitHub."]
      },
      "The MCP server '{0}' wants to access a {1} account",
      mcpServerName,
      this._authenticationService.getProvider(providerId).label
    );
    quickPick.placeholder = nls.localize("getSessionPlateholder", "Select an account for '{0}' to use or Esc to cancel", mcpServerName);
    return await new Promise((resolve, reject) => {
      disposables.add(quickPick.onDidAccept(async (_) => {
        quickPick.dispose();
        let session = quickPick.selectedItems[0].session;
        if (!session) {
          const account = quickPick.selectedItems[0].account;
          try {
            session = await this._authenticationService.createSession(providerId, scopes, { account });
          } catch (e) {
            reject(e);
            return;
          }
        }
        const accountName = session.account.label;
        this._authenticationAccessService.updateAllowedMcpServers(providerId, accountName, [{ id: mcpServerId, name: mcpServerName, allowed: true }]);
        this._updateAccountAndSessionPreferences(providerId, mcpServerId, session);
        this.removeAccessRequest(providerId, mcpServerId);
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
  async completeSessionAccessRequest(provider, mcpServerId, mcpServerName, scopes) {
    const providerRequests = this._sessionAccessRequestItems.get(provider.id) || {};
    const existingRequest = providerRequests[mcpServerId];
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
        session = await this.selectSession(provider.id, mcpServerId, mcpServerName, scopes, possibleSessions);
      } catch (_) {
      }
    } else {
      const approved = await this.showGetSessionPrompt(provider, possibleSessions[0].account.label, mcpServerId, mcpServerName);
      if (approved) {
        session = possibleSessions[0];
      }
    }
    if (session) {
      this._authenticationUsageService.addAccountUsage(provider.id, session.account.label, session.scopes, mcpServerId, mcpServerName);
    }
  }
  requestSessionAccess(providerId, mcpServerId, mcpServerName, scopes, possibleSessions) {
    const providerRequests = this._sessionAccessRequestItems.get(providerId) || {};
    const hasExistingRequest = providerRequests[mcpServerId];
    if (hasExistingRequest) {
      return;
    }
    const provider = this._authenticationService.getProvider(providerId);
    const menuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
      group: "3_accessRequests",
      command: {
        id: `${providerId}${mcpServerId}Access`,
        title: nls.localize(
          {
            key: "accessRequest",
            comment: [`The placeholder {0} will be replaced with an authentication provider''s label. {1} will be replaced with a MCP server name. (1) is to indicate that this menu item contributes to a badge count`]
          },
          "Grant access to {0} for {1}... (1)",
          provider.label,
          mcpServerName
        )
      }
    });
    const accessCommand = CommandsRegistry.registerCommand({
      id: `${providerId}${mcpServerId}Access`,
      handler: async (accessor) => {
        this.completeSessionAccessRequest(provider, mcpServerId, mcpServerName, scopes);
      }
    });
    providerRequests[mcpServerId] = { possibleSessions, disposables: [menuItem, accessCommand] };
    this._sessionAccessRequestItems.set(providerId, providerRequests);
    this.updateBadgeCount();
  }
  async requestNewSession(providerId, scopes, mcpServerId, mcpServerName) {
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
    const scopesList = scopes.join(SCOPESLIST_SEPARATOR);
    const mcpServerHasExistingRequest = providerRequests && providerRequests[scopesList] && providerRequests[scopesList].requestingMcpServerIds.includes(mcpServerId);
    if (mcpServerHasExistingRequest) {
      return;
    }
    const commandId = `${providerId}:${mcpServerId}:signIn${Object.keys(providerRequests || []).length}`;
    const menuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
      group: "2_signInRequests",
      command: {
        id: commandId,
        title: nls.localize(
          {
            key: "signInRequest",
            comment: [`The placeholder {0} will be replaced with an authentication provider's label. {1} will be replaced with a MCP server name. (1) is to indicate that this menu item contributes to a badge count.`]
          },
          "Sign in with {0} to use {1} (1)",
          provider.label,
          mcpServerName
        )
      }
    });
    const signInCommand = CommandsRegistry.registerCommand({
      id: commandId,
      handler: async (accessor) => {
        const authenticationService = accessor.get(IAuthenticationService);
        const session = await authenticationService.createSession(providerId, scopes);
        this._authenticationAccessService.updateAllowedMcpServers(providerId, session.account.label, [{ id: mcpServerId, name: mcpServerName, allowed: true }]);
        this._updateAccountAndSessionPreferences(providerId, mcpServerId, session);
      }
    });
    if (providerRequests) {
      const existingRequest = providerRequests[scopesList] || { disposables: [], requestingMcpServerIds: [] };
      providerRequests[scopesList] = {
        disposables: [...existingRequest.disposables, menuItem, signInCommand],
        requestingMcpServerIds: [...existingRequest.requestingMcpServerIds, mcpServerId]
      };
      this._signInRequestItems.set(providerId, providerRequests);
    } else {
      this._signInRequestItems.set(providerId, {
        [scopesList]: {
          disposables: [menuItem, signInCommand],
          requestingMcpServerIds: [mcpServerId]
        }
      });
    }
    this.updateBadgeCount();
  }
};
AuthenticationMcpService = __decorateClass([
  __decorateParam(0, IActivityService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, IProductService),
  __decorateParam(5, IAuthenticationService),
  __decorateParam(6, IAuthenticationMcpUsageService),
  __decorateParam(7, IAuthenticationMcpAccessService)
], AuthenticationMcpService);
registerSingleton(IAuthenticationMcpService, AuthenticationMcpService, InstantiationType.Delayed);
export {
  AuthenticationMcpService,
  IAuthenticationMcpService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxhdXRoZW50aWNhdGlvblxcYnJvd3NlclxcYXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgc2NvcGVzTWF0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYXV0aC5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJZCwgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUFjdGl2aXR5U2VydmljZSwgTnVtYmVyQmFkZ2UgfSBmcm9tICcuLi8uLi9hY3Rpdml0eS9jb21tb24vYWN0aXZpdHkuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZSB9IGZyb20gJy4vYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZSB9IGZyb20gJy4vYXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXV0aGVudGljYXRpb25TZXNzaW9uLCBJQXV0aGVudGljYXRpb25Qcm92aWRlciwgSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgQXV0aGVudGljYXRpb25TZXNzaW9uQWNjb3VudCB9IGZyb20gJy4uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuXG4vLyBPQXV0aDIgc3BlYyBwcm9oaWJpdHMgc3BhY2UgaW4gYSBzY29wZSwgc28gdXNlIHRoYXQgdG8gam9pbiB0aGVtLlxuY29uc3QgU0NPUEVTTElTVF9TRVBBUkFUT1IgPSAnICc7XG5cbmludGVyZmFjZSBTZXNzaW9uUmVxdWVzdCB7XG5cdGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdO1xuXHRyZXF1ZXN0aW5nTWNwU2VydmVySWRzOiBzdHJpbmdbXTtcbn1cblxuaW50ZXJmYWNlIFNlc3Npb25SZXF1ZXN0SW5mbyB7XG5cdFtzY29wZXNMaXN0OiBzdHJpbmddOiBTZXNzaW9uUmVxdWVzdDtcbn1cblxuLy8gVE9ETzogTW92ZSB0aGlzIGludG8gTWFpblRocmVhZEF1dGhlbnRpY2F0aW9uXG5leHBvcnQgY29uc3QgSUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQXV0aGVudGljYXRpb25NY3BTZXJ2aWNlPignSUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZScpO1xuZXhwb3J0IGludGVyZmFjZSBJQXV0aGVudGljYXRpb25NY3BTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuIGFuIGFjY291bnQgcHJlZmVyZW5jZSBmb3IgYSBzcGVjaWZpYyBwcm92aWRlciBoYXMgY2hhbmdlZCBmb3IgdGhlIHNwZWNpZmllZCBNQ1Agc2VydmVycy4gRG9lcyBub3QgZmlyZSB3aGVuOlxuXHQgKiAqIEFuIGFjY291bnQgcHJlZmVyZW5jZSBpcyByZW1vdmVkXG5cdCAqICogQSBzZXNzaW9uIHByZWZlcmVuY2UgaXMgY2hhbmdlZCAoYmVjYXVzZSBpdCdzIGRlcHJlY2F0ZWQpXG5cdCAqICogQSBzZXNzaW9uIHByZWZlcmVuY2UgaXMgcmVtb3ZlZCAoYmVjYXVzZSBpdCdzIGRlcHJlY2F0ZWQpXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjY291bnRQcmVmZXJlbmNlOiBFdmVudDx7IG1jcFNlcnZlcklkczogc3RyaW5nW107IHByb3ZpZGVySWQ6IHN0cmluZyB9Pjtcblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGFjY291bnROYW1lIChhbHNvIGtub3duIGFzIGFjY291bnQubGFiZWwpIHRvIHBhaXIgd2l0aCBgSUF1dGhlbnRpY2F0aW9uTUNQU2VydmVyQWNjZXNzU2VydmljZWAgdG8gZ2V0IHRoZSBhY2NvdW50IHByZWZlcmVuY2Vcblx0ICogQHBhcmFtIHByb3ZpZGVySWQgVGhlIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyIGlkXG5cdCAqIEBwYXJhbSBtY3BTZXJ2ZXJJZCBUaGUgTUNQIHNlcnZlciBpZCB0byBnZXQgdGhlIHByZWZlcmVuY2UgZm9yXG5cdCAqIEByZXR1cm5zIFRoZSBhY2NvdW50TmFtZSBvZiB0aGUgcHJlZmVyZW5jZSwgb3IgdW5kZWZpbmVkIGlmIHRoZXJlIGlzIG5vIHByZWZlcmVuY2Ugc2V0XG5cdCAqL1xuXHRnZXRBY2NvdW50UHJlZmVyZW5jZShtY3BTZXJ2ZXJJZDogc3RyaW5nLCBwcm92aWRlcklkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBTZXRzIHRoZSBhY2NvdW50IHByZWZlcmVuY2UgZm9yIHRoZSBnaXZlbiBwcm92aWRlciBhbmQgTUNQIHNlcnZlclxuXHQgKiBAcGFyYW0gcHJvdmlkZXJJZCBUaGUgYXV0aGVudGljYXRpb24gcHJvdmlkZXIgaWRcblx0ICogQHBhcmFtIG1jcFNlcnZlcklkIFRoZSBNQ1Agc2VydmVyIGlkIHRvIHNldCB0aGUgcHJlZmVyZW5jZSBmb3Jcblx0ICogQHBhcmFtIGFjY291bnQgVGhlIGFjY291bnQgdG8gc2V0IHRoZSBwcmVmZXJlbmNlIHRvXG5cdCAqL1xuXHR1cGRhdGVBY2NvdW50UHJlZmVyZW5jZShtY3BTZXJ2ZXJJZDogc3RyaW5nLCBwcm92aWRlcklkOiBzdHJpbmcsIGFjY291bnQ6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQpOiB2b2lkO1xuXHQvKipcblx0ICogUmVtb3ZlcyB0aGUgYWNjb3VudCBwcmVmZXJlbmNlIGZvciB0aGUgZ2l2ZW4gcHJvdmlkZXIgYW5kIE1DUCBzZXJ2ZXJcblx0ICogQHBhcmFtIHByb3ZpZGVySWQgVGhlIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyIGlkXG5cdCAqIEBwYXJhbSBtY3BTZXJ2ZXJJZCBUaGUgTUNQIHNlcnZlciBpZCB0byByZW1vdmUgdGhlIHByZWZlcmVuY2UgZm9yXG5cdCAqL1xuXHRyZW1vdmVBY2NvdW50UHJlZmVyZW5jZShtY3BTZXJ2ZXJJZDogc3RyaW5nLCBwcm92aWRlcklkOiBzdHJpbmcpOiB2b2lkO1xuXHQvKipcblx0ICogQGRlcHJlY2F0ZWQgU2V0cyB0aGUgc2Vzc2lvbiBwcmVmZXJlbmNlIGZvciB0aGUgZ2l2ZW4gcHJvdmlkZXIgYW5kIE1DUCBzZXJ2ZXJcblx0ICogQHBhcmFtIHByb3ZpZGVySWRcblx0ICogQHBhcmFtIG1jcFNlcnZlcklkXG5cdCAqIEBwYXJhbSBzZXNzaW9uXG5cdCAqL1xuXHR1cGRhdGVTZXNzaW9uUHJlZmVyZW5jZShwcm92aWRlcklkOiBzdHJpbmcsIG1jcFNlcnZlcklkOiBzdHJpbmcsIHNlc3Npb246IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbik6IHZvaWQ7XG5cdC8qKlxuXHQgKiBAZGVwcmVjYXRlZCBHZXRzIHRoZSBzZXNzaW9uIHByZWZlcmVuY2UgZm9yIHRoZSBnaXZlbiBwcm92aWRlciBhbmQgTUNQIHNlcnZlclxuXHQgKiBAcGFyYW0gcHJvdmlkZXJJZFxuXHQgKiBAcGFyYW0gbWNwU2VydmVySWRcblx0ICogQHBhcmFtIHNjb3Blc1xuXHQgKi9cblx0Z2V0U2Vzc2lvblByZWZlcmVuY2UocHJvdmlkZXJJZDogc3RyaW5nLCBtY3BTZXJ2ZXJJZDogc3RyaW5nLCBzY29wZXM6IHN0cmluZ1tdKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogQGRlcHJlY2F0ZWQgUmVtb3ZlcyB0aGUgc2Vzc2lvbiBwcmVmZXJlbmNlIGZvciB0aGUgZ2l2ZW4gcHJvdmlkZXIgYW5kIE1DUCBzZXJ2ZXJcblx0ICogQHBhcmFtIHByb3ZpZGVySWRcblx0ICogQHBhcmFtIG1jcFNlcnZlcklkXG5cdCAqIEBwYXJhbSBzY29wZXNcblx0ICovXG5cdHJlbW92ZVNlc3Npb25QcmVmZXJlbmNlKHByb3ZpZGVySWQ6IHN0cmluZywgbWNwU2VydmVySWQ6IHN0cmluZywgc2NvcGVzOiBzdHJpbmdbXSk6IHZvaWQ7XG5cdHNlbGVjdFNlc3Npb24ocHJvdmlkZXJJZDogc3RyaW5nLCBtY3BTZXJ2ZXJJZDogc3RyaW5nLCBtY3BTZXJ2ZXJOYW1lOiBzdHJpbmcsIHNjb3Blczogc3RyaW5nW10sIHBvc3NpYmxlU2Vzc2lvbnM6IHJlYWRvbmx5IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdKTogUHJvbWlzZTxBdXRoZW50aWNhdGlvblNlc3Npb24+O1xuXHRyZXF1ZXN0U2Vzc2lvbkFjY2Vzcyhwcm92aWRlcklkOiBzdHJpbmcsIG1jcFNlcnZlcklkOiBzdHJpbmcsIG1jcFNlcnZlck5hbWU6IHN0cmluZywgc2NvcGVzOiBzdHJpbmdbXSwgcG9zc2libGVTZXNzaW9uczogcmVhZG9ubHkgQXV0aGVudGljYXRpb25TZXNzaW9uW10pOiB2b2lkO1xuXHRyZXF1ZXN0TmV3U2Vzc2lvbihwcm92aWRlcklkOiBzdHJpbmcsIHNjb3Blczogc3RyaW5nW10sIG1jcFNlcnZlcklkOiBzdHJpbmcsIG1jcFNlcnZlck5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG59XG5cbi8vIFRPRE9AVHlsZXJMZW9uaGFyZHQ6IFRoaXMgc2hvdWxkIGFsbCBnbyBpbiBNYWluVGhyZWFkQXV0aGVudGljYXRpb25cbmV4cG9ydCBjbGFzcyBBdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zaWduSW5SZXF1ZXN0SXRlbXMgPSBuZXcgTWFwPHN0cmluZywgU2Vzc2lvblJlcXVlc3RJbmZvPigpO1xuXHRwcml2YXRlIF9zZXNzaW9uQWNjZXNzUmVxdWVzdEl0ZW1zID0gbmV3IE1hcDxzdHJpbmcsIHsgW21jcFNlcnZlcklkOiBzdHJpbmddOiB7IGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdOyBwb3NzaWJsZVNlc3Npb25zOiBBdXRoZW50aWNhdGlvblNlc3Npb25bXSB9IH0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjY291bnRCYWRnZURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSBfb25EaWRBY2NvdW50UHJlZmVyZW5jZUNoYW5nZTogRW1pdHRlcjx7IHByb3ZpZGVySWQ6IHN0cmluZzsgbWNwU2VydmVySWRzOiBzdHJpbmdbXSB9PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcHJvdmlkZXJJZDogc3RyaW5nOyBtY3BTZXJ2ZXJJZHM6IHN0cmluZ1tdIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjY291bnRQcmVmZXJlbmNlID0gdGhpcy5fb25EaWRBY2NvdW50UHJlZmVyZW5jZUNoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIF9pbmhlcml0QXV0aEFjY291bnRQcmVmZXJlbmNlUGFyZW50VG9DaGlsZHJlbjogUmVjb3JkPHN0cmluZywgc3RyaW5nW10+O1xuXHRwcml2YXRlIF9pbmhlcml0QXV0aEFjY291bnRQcmVmZXJlbmNlQ2hpbGRUb1BhcmVudDogeyBbbWNwU2VydmVySWQ6IHN0cmluZ106IHN0cmluZyB9O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWN0aXZpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWN0aXZpdHlTZXJ2aWNlOiBJQWN0aXZpdHlTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hdXRoZW50aWNhdGlvblVzYWdlU2VydmljZTogSUF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZTogSUF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2luaGVyaXRBdXRoQWNjb3VudFByZWZlcmVuY2VQYXJlbnRUb0NoaWxkcmVuID0gdGhpcy5fcHJvZHVjdFNlcnZpY2UuaW5oZXJpdEF1dGhBY2NvdW50UHJlZmVyZW5jZSB8fCB7fTtcblx0XHR0aGlzLl9pbmhlcml0QXV0aEFjY291bnRQcmVmZXJlbmNlQ2hpbGRUb1BhcmVudCA9IE9iamVjdC5lbnRyaWVzKHRoaXMuX2luaGVyaXRBdXRoQWNjb3VudFByZWZlcmVuY2VQYXJlbnRUb0NoaWxkcmVuKS5yZWR1Y2U8eyBbbWNwU2VydmVySWQ6IHN0cmluZ106IHN0cmluZyB9PigoYWNjLCBbcGFyZW50LCBjaGlsZHJlbl0pID0+IHtcblx0XHRcdGNoaWxkcmVuLmZvckVhY2goKGNoaWxkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0YWNjW2NoaWxkXSA9IHBhcmVudDtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIGFjYztcblx0XHR9LCB7fSk7XG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucyhhc3luYyBlID0+IHtcblx0XHRcdGlmIChlLmV2ZW50LmFkZGVkPy5sZW5ndGgpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy51cGRhdGVOZXdTZXNzaW9uUmVxdWVzdHMoZS5wcm92aWRlcklkLCBlLmV2ZW50LmFkZGVkKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmV2ZW50LnJlbW92ZWQ/Lmxlbmd0aCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUFjY2Vzc1JlcXVlc3RzKGUucHJvdmlkZXJJZCwgZS5ldmVudC5yZW1vdmVkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMudXBkYXRlQmFkZ2VDb3VudCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZFVucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKGUgPT4ge1xuXHRcdFx0Y29uc3QgYWNjZXNzUmVxdWVzdHMgPSB0aGlzLl9zZXNzaW9uQWNjZXNzUmVxdWVzdEl0ZW1zLmdldChlLmlkKSB8fCB7fTtcblx0XHRcdE9iamVjdC5rZXlzKGFjY2Vzc1JlcXVlc3RzKS5mb3JFYWNoKG1jcFNlcnZlcklkID0+IHtcblx0XHRcdFx0dGhpcy5yZW1vdmVBY2Nlc3NSZXF1ZXN0KGUuaWQsIG1jcFNlcnZlcklkKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlTmV3U2Vzc2lvblJlcXVlc3RzKHByb3ZpZGVySWQ6IHN0cmluZywgYWRkZWRTZXNzaW9uczogcmVhZG9ubHkgQXV0aGVudGljYXRpb25TZXNzaW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleGlzdGluZ1JlcXVlc3RzRm9yUHJvdmlkZXIgPSB0aGlzLl9zaWduSW5SZXF1ZXN0SXRlbXMuZ2V0KHByb3ZpZGVySWQpO1xuXHRcdGlmICghZXhpc3RpbmdSZXF1ZXN0c0ZvclByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0T2JqZWN0LmtleXMoZXhpc3RpbmdSZXF1ZXN0c0ZvclByb3ZpZGVyKS5mb3JFYWNoKHJlcXVlc3RlZFNjb3BlcyA9PiB7XG5cdFx0XHQvLyBQYXJzZSB0aGUgcmVxdWVzdGVkIHNjb3BlcyBmcm9tIHRoZSBzdG9yZWQga2V5XG5cdFx0XHRjb25zdCByZXF1ZXN0ZWRTY29wZXNBcnJheSA9IHJlcXVlc3RlZFNjb3Blcy5zcGxpdChTQ09QRVNMSVNUX1NFUEFSQVRPUik7XG5cblx0XHRcdC8vIENoZWNrIGlmIGFueSBhZGRlZCBzZXNzaW9uIGhhcyBtYXRjaGluZyBzY29wZXMgKG9yZGVyLWluZGVwZW5kZW50KVxuXHRcdFx0aWYgKGFkZGVkU2Vzc2lvbnMuc29tZShzZXNzaW9uID0+IHNjb3Blc01hdGNoKHNlc3Npb24uc2NvcGVzLCByZXF1ZXN0ZWRTY29wZXNBcnJheSkpKSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXF1ZXN0ID0gZXhpc3RpbmdSZXF1ZXN0c0ZvclByb3ZpZGVyW3JlcXVlc3RlZFNjb3Blc107XG5cdFx0XHRcdHNlc3Npb25SZXF1ZXN0Py5kaXNwb3NhYmxlcy5mb3JFYWNoKGl0ZW0gPT4gaXRlbS5kaXNwb3NlKCkpO1xuXG5cdFx0XHRcdGRlbGV0ZSBleGlzdGluZ1JlcXVlc3RzRm9yUHJvdmlkZXJbcmVxdWVzdGVkU2NvcGVzXTtcblx0XHRcdFx0aWYgKE9iamVjdC5rZXlzKGV4aXN0aW5nUmVxdWVzdHNGb3JQcm92aWRlcikubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2lnbkluUmVxdWVzdEl0ZW1zLmRlbGV0ZShwcm92aWRlcklkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9zaWduSW5SZXF1ZXN0SXRlbXMuc2V0KHByb3ZpZGVySWQsIGV4aXN0aW5nUmVxdWVzdHNGb3JQcm92aWRlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlQWNjZXNzUmVxdWVzdHMocHJvdmlkZXJJZDogc3RyaW5nLCByZW1vdmVkU2Vzc2lvbnM6IHJlYWRvbmx5IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdKSB7XG5cdFx0Y29uc3QgcHJvdmlkZXJSZXF1ZXN0cyA9IHRoaXMuX3Nlc3Npb25BY2Nlc3NSZXF1ZXN0SXRlbXMuZ2V0KHByb3ZpZGVySWQpO1xuXHRcdGlmIChwcm92aWRlclJlcXVlc3RzKSB7XG5cdFx0XHRPYmplY3Qua2V5cyhwcm92aWRlclJlcXVlc3RzKS5mb3JFYWNoKG1jcFNlcnZlcklkID0+IHtcblx0XHRcdFx0cmVtb3ZlZFNlc3Npb25zLmZvckVhY2gocmVtb3ZlZCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgaW5kZXhPZlNlc3Npb24gPSBwcm92aWRlclJlcXVlc3RzW21jcFNlcnZlcklkXS5wb3NzaWJsZVNlc3Npb25zLmZpbmRJbmRleChzZXNzaW9uID0+IHNlc3Npb24uaWQgPT09IHJlbW92ZWQuaWQpO1xuXHRcdFx0XHRcdGlmIChpbmRleE9mU2Vzc2lvbikge1xuXHRcdFx0XHRcdFx0cHJvdmlkZXJSZXF1ZXN0c1ttY3BTZXJ2ZXJJZF0ucG9zc2libGVTZXNzaW9ucy5zcGxpY2UoaW5kZXhPZlNlc3Npb24sIDEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKCFwcm92aWRlclJlcXVlc3RzW21jcFNlcnZlcklkXS5wb3NzaWJsZVNlc3Npb25zLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMucmVtb3ZlQWNjZXNzUmVxdWVzdChwcm92aWRlcklkLCBtY3BTZXJ2ZXJJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQmFkZ2VDb3VudCgpOiB2b2lkIHtcblx0XHR0aGlzLl9hY2NvdW50QmFkZ2VEaXNwb3NhYmxlLmNsZWFyKCk7XG5cblx0XHRsZXQgbnVtYmVyT2ZSZXF1ZXN0cyA9IDA7XG5cdFx0dGhpcy5fc2lnbkluUmVxdWVzdEl0ZW1zLmZvckVhY2gocHJvdmlkZXJSZXF1ZXN0cyA9PiB7XG5cdFx0XHRPYmplY3Qua2V5cyhwcm92aWRlclJlcXVlc3RzKS5mb3JFYWNoKHJlcXVlc3QgPT4ge1xuXHRcdFx0XHRudW1iZXJPZlJlcXVlc3RzICs9IHByb3ZpZGVyUmVxdWVzdHNbcmVxdWVzdF0ucmVxdWVzdGluZ01jcFNlcnZlcklkcy5sZW5ndGg7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3Nlc3Npb25BY2Nlc3NSZXF1ZXN0SXRlbXMuZm9yRWFjaChhY2Nlc3NSZXF1ZXN0ID0+IHtcblx0XHRcdG51bWJlck9mUmVxdWVzdHMgKz0gT2JqZWN0LmtleXMoYWNjZXNzUmVxdWVzdCkubGVuZ3RoO1xuXHRcdH0pO1xuXG5cdFx0aWYgKG51bWJlck9mUmVxdWVzdHMgPiAwKSB7XG5cdFx0XHRjb25zdCBiYWRnZSA9IG5ldyBOdW1iZXJCYWRnZShudW1iZXJPZlJlcXVlc3RzLCAoKSA9PiBubHMubG9jYWxpemUoJ3NpZ24gaW4nLCBcIlNpZ24gaW4gcmVxdWVzdGVkXCIpKTtcblx0XHRcdHRoaXMuX2FjY291bnRCYWRnZURpc3Bvc2FibGUudmFsdWUgPSB0aGlzLmFjdGl2aXR5U2VydmljZS5zaG93QWNjb3VudHNBY3Rpdml0eSh7IGJhZGdlIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlQWNjZXNzUmVxdWVzdChwcm92aWRlcklkOiBzdHJpbmcsIG1jcFNlcnZlcklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlclJlcXVlc3RzID0gdGhpcy5fc2Vzc2lvbkFjY2Vzc1JlcXVlc3RJdGVtcy5nZXQocHJvdmlkZXJJZCkgfHwge307XG5cdFx0aWYgKHByb3ZpZGVyUmVxdWVzdHNbbWNwU2VydmVySWRdKSB7XG5cdFx0XHRkaXNwb3NlKHByb3ZpZGVyUmVxdWVzdHNbbWNwU2VydmVySWRdLmRpc3Bvc2FibGVzKTtcblx0XHRcdGRlbGV0ZSBwcm92aWRlclJlcXVlc3RzW21jcFNlcnZlcklkXTtcblx0XHRcdHRoaXMudXBkYXRlQmFkZ2VDb3VudCgpO1xuXHRcdH1cblx0fVxuXG5cdC8vI3JlZ2lvbiBBY2NvdW50L1Nlc3Npb24gUHJlZmVyZW5jZVxuXG5cdHVwZGF0ZUFjY291bnRQcmVmZXJlbmNlKG1jcFNlcnZlcklkOiBzdHJpbmcsIHByb3ZpZGVySWQ6IHN0cmluZywgYWNjb3VudDogQXV0aGVudGljYXRpb25TZXNzaW9uQWNjb3VudCk6IHZvaWQge1xuXHRcdGNvbnN0IHBhcmVudE1jcFNlcnZlcklkID0gdGhpcy5faW5oZXJpdEF1dGhBY2NvdW50UHJlZmVyZW5jZUNoaWxkVG9QYXJlbnRbbWNwU2VydmVySWRdID8/IG1jcFNlcnZlcklkO1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX2dldEtleShwYXJlbnRNY3BTZXJ2ZXJJZCwgcHJvdmlkZXJJZCk7XG5cblx0XHQvLyBTdG9yZSB0aGUgcHJlZmVyZW5jZSBpbiB0aGUgd29ya3NwYWNlIGFuZCBhcHBsaWNhdGlvbiBzdG9yYWdlLiBUaGlzIGFsbG93cyBuZXcgd29ya3NwYWNlcyB0b1xuXHRcdC8vIGhhdmUgYSBwcmVmZXJlbmNlIHNldCBhbHJlYWR5IHRvIGxpbWl0IHRoZSBudW1iZXIgb2YgcHJvbXB0cyB0aGF0IGFyZSBzaG93bi4uLiBidXQgYWxzbyBhbGxvd3Ncblx0XHQvLyBhIHNwZWNpZmljIHdvcmtzcGFjZSB0byBvdmVycmlkZSB0aGUgZ2xvYmFsIHByZWZlcmVuY2UuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShrZXksIGFjY291bnQubGFiZWwsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShrZXksIGFjY291bnQubGFiZWwsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdGNvbnN0IGNoaWxkcmVuTWNwU2VydmVycyA9IHRoaXMuX2luaGVyaXRBdXRoQWNjb3VudFByZWZlcmVuY2VQYXJlbnRUb0NoaWxkcmVuW3BhcmVudE1jcFNlcnZlcklkXTtcblx0XHRjb25zdCBtY3BTZXJ2ZXJJZHMgPSBjaGlsZHJlbk1jcFNlcnZlcnMgPyBbcGFyZW50TWNwU2VydmVySWQsIC4uLmNoaWxkcmVuTWNwU2VydmVyc10gOiBbcGFyZW50TWNwU2VydmVySWRdO1xuXHRcdHRoaXMuX29uRGlkQWNjb3VudFByZWZlcmVuY2VDaGFuZ2UuZmlyZSh7IG1jcFNlcnZlcklkcywgcHJvdmlkZXJJZCB9KTtcblx0fVxuXG5cdGdldEFjY291bnRQcmVmZXJlbmNlKG1jcFNlcnZlcklkOiBzdHJpbmcsIHByb3ZpZGVySWQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fZ2V0S2V5KHRoaXMuX2luaGVyaXRBdXRoQWNjb3VudFByZWZlcmVuY2VDaGlsZFRvUGFyZW50W21jcFNlcnZlcklkXSA/PyBtY3BTZXJ2ZXJJZCwgcHJvdmlkZXJJZCk7XG5cblx0XHQvLyBJZiBhIHByZWZlcmVuY2UgaXMgc2V0IGluIHRoZSB3b3Jrc3BhY2UsIHVzZSB0aGF0LiBPdGhlcndpc2UsIHVzZSB0aGUgZ2xvYmFsIHByZWZlcmVuY2UuXG5cdFx0cmV0dXJuIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KGtleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSkgPz8gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoa2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHR9XG5cblx0cmVtb3ZlQWNjb3VudFByZWZlcmVuY2UobWNwU2VydmVySWQ6IHN0cmluZywgcHJvdmlkZXJJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fZ2V0S2V5KHRoaXMuX2luaGVyaXRBdXRoQWNjb3VudFByZWZlcmVuY2VDaGlsZFRvUGFyZW50W21jcFNlcnZlcklkXSA/PyBtY3BTZXJ2ZXJJZCwgcHJvdmlkZXJJZCk7XG5cblx0XHQvLyBUaGlzIHdvbid0IGFmZmVjdCBhbnkgb3RoZXIgd29ya3NwYWNlcyB0aGF0IGhhdmUgYSBwcmVmZXJlbmNlIHNldCwgYnV0IGl0IHdpbGwgcmVtb3ZlIHRoZSBwcmVmZXJlbmNlXG5cdFx0Ly8gZm9yIHRoaXMgd29ya3NwYWNlIGFuZCB0aGUgZ2xvYmFsIHByZWZlcmVuY2UuIFRoaXMgaXMgb25seSBwYWlyZWQgd2l0aCBhIGNhbGwgdG8gdXBkYXRlU2Vzc2lvblByZWZlcmVuY2UuLi5cblx0XHQvLyBzbyB3ZSByZWFsbHkgZG9uJ3QgX25lZWRfIHRvIHJlbW92ZSB0aGVtIGFzIHRoZXkgYXJlIGFib3V0IHRvIGJlIG92ZXJyaWRkZW4gYW55d2F5Li4uIGJ1dCBpdCdzIG1vcmUgY29ycmVjdFxuXHRcdC8vIHRvIHJlbW92ZSB0aGVtIGZpcnN0Li4uIGFuZCBpbiBjYXNlIHRoaXMgZ2V0cyBjYWxsZWQgZnJvbSBzb21ld2hlcmUgZWxzZSBpbiB0aGUgZnV0dXJlLlxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKGtleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoa2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0S2V5KG1jcFNlcnZlcklkOiBzdHJpbmcsIHByb3ZpZGVySWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke21jcFNlcnZlcklkfS0ke3Byb3ZpZGVySWR9YDtcblx0fVxuXG5cdC8vIFRPRE9AVHlsZXJMZW9uaGFyZHQ6IFJlbW92ZSBhbGwgb2YgdGhpcyBhZnRlciBhIGNvdXBsZSBpdGVyYXRpb25zXG5cblx0dXBkYXRlU2Vzc2lvblByZWZlcmVuY2UocHJvdmlkZXJJZDogc3RyaW5nLCBtY3BTZXJ2ZXJJZDogc3RyaW5nLCBzZXNzaW9uOiBBdXRoZW50aWNhdGlvblNlc3Npb24pOiB2b2lkIHtcblx0XHQvLyBUaGUgMyBwYXJ0cyBvZiB0aGlzIGtleSBhcmUgaW1wb3J0YW50OlxuXHRcdC8vICogTUNQIHNlcnZlciBpZDogVGhlIE1DUCBzZXJ2ZXIgdGhhdCBoYXMgYSBwcmVmZXJlbmNlXG5cdFx0Ly8gKiBQcm92aWRlciBpZDogVGhlIHByb3ZpZGVyIHRoYXQgdGhlIHByZWZlcmVuY2UgaXMgZm9yXG5cdFx0Ly8gKiBUaGUgc2NvcGVzOiBUaGUgc3Vic2V0IG9mIHNlc3Npb25zIHRoYXQgdGhlIHByZWZlcmVuY2UgYXBwbGllcyB0b1xuXHRcdGNvbnN0IGtleSA9IGAke21jcFNlcnZlcklkfS0ke3Byb3ZpZGVySWR9LSR7c2Vzc2lvbi5zY29wZXMuam9pbihTQ09QRVNMSVNUX1NFUEFSQVRPUil9YDtcblxuXHRcdC8vIFN0b3JlIHRoZSBwcmVmZXJlbmNlIGluIHRoZSB3b3Jrc3BhY2UgYW5kIGFwcGxpY2F0aW9uIHN0b3JhZ2UuIFRoaXMgYWxsb3dzIG5ldyB3b3Jrc3BhY2VzIHRvXG5cdFx0Ly8gaGF2ZSBhIHByZWZlcmVuY2Ugc2V0IGFscmVhZHkgdG8gbGltaXQgdGhlIG51bWJlciBvZiBwcm9tcHRzIHRoYXQgYXJlIHNob3duLi4uIGJ1dCBhbHNvIGFsbG93c1xuXHRcdC8vIGEgc3BlY2lmaWMgd29ya3NwYWNlIHRvIG92ZXJyaWRlIHRoZSBnbG9iYWwgcHJlZmVyZW5jZS5cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGtleSwgc2Vzc2lvbi5pZCwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGtleSwgc2Vzc2lvbi5pZCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0Z2V0U2Vzc2lvblByZWZlcmVuY2UocHJvdmlkZXJJZDogc3RyaW5nLCBtY3BTZXJ2ZXJJZDogc3RyaW5nLCBzY29wZXM6IHN0cmluZ1tdKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBUaGUgMyBwYXJ0cyBvZiB0aGlzIGtleSBhcmUgaW1wb3J0YW50OlxuXHRcdC8vICogTUNQIHNlcnZlciBpZDogVGhlIE1DUCBzZXJ2ZXIgdGhhdCBoYXMgYSBwcmVmZXJlbmNlXG5cdFx0Ly8gKiBQcm92aWRlciBpZDogVGhlIHByb3ZpZGVyIHRoYXQgdGhlIHByZWZlcmVuY2UgaXMgZm9yXG5cdFx0Ly8gKiBUaGUgc2NvcGVzOiBUaGUgc3Vic2V0IG9mIHNlc3Npb25zIHRoYXQgdGhlIHByZWZlcmVuY2UgYXBwbGllcyB0b1xuXHRcdGNvbnN0IGtleSA9IGAke21jcFNlcnZlcklkfS0ke3Byb3ZpZGVySWR9LSR7c2NvcGVzLmpvaW4oU0NPUEVTTElTVF9TRVBBUkFUT1IpfWA7XG5cblx0XHQvLyBJZiBhIHByZWZlcmVuY2UgaXMgc2V0IGluIHRoZSB3b3Jrc3BhY2UsIHVzZSB0aGF0LiBPdGhlcndpc2UsIHVzZSB0aGUgZ2xvYmFsIHByZWZlcmVuY2UuXG5cdFx0cmV0dXJuIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KGtleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSkgPz8gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoa2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHR9XG5cblx0cmVtb3ZlU2Vzc2lvblByZWZlcmVuY2UocHJvdmlkZXJJZDogc3RyaW5nLCBtY3BTZXJ2ZXJJZDogc3RyaW5nLCBzY29wZXM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Ly8gVGhlIDMgcGFydHMgb2YgdGhpcyBrZXkgYXJlIGltcG9ydGFudDpcblx0XHQvLyAqIE1DUCBzZXJ2ZXIgaWQ6IFRoZSBNQ1Agc2VydmVyIHRoYXQgaGFzIGEgcHJlZmVyZW5jZVxuXHRcdC8vICogUHJvdmlkZXIgaWQ6IFRoZSBwcm92aWRlciB0aGF0IHRoZSBwcmVmZXJlbmNlIGlzIGZvclxuXHRcdC8vICogVGhlIHNjb3BlczogVGhlIHN1YnNldCBvZiBzZXNzaW9ucyB0aGF0IHRoZSBwcmVmZXJlbmNlIGFwcGxpZXMgdG9cblx0XHRjb25zdCBrZXkgPSBgJHttY3BTZXJ2ZXJJZH0tJHtwcm92aWRlcklkfS0ke3Njb3Blcy5qb2luKFNDT1BFU0xJU1RfU0VQQVJBVE9SKX1gO1xuXG5cdFx0Ly8gVGhpcyB3b24ndCBhZmZlY3QgYW55IG90aGVyIHdvcmtzcGFjZXMgdGhhdCBoYXZlIGEgcHJlZmVyZW5jZSBzZXQsIGJ1dCBpdCB3aWxsIHJlbW92ZSB0aGUgcHJlZmVyZW5jZVxuXHRcdC8vIGZvciB0aGlzIHdvcmtzcGFjZSBhbmQgdGhlIGdsb2JhbCBwcmVmZXJlbmNlLiBUaGlzIGlzIG9ubHkgcGFpcmVkIHdpdGggYSBjYWxsIHRvIHVwZGF0ZVNlc3Npb25QcmVmZXJlbmNlLi4uXG5cdFx0Ly8gc28gd2UgcmVhbGx5IGRvbid0IF9uZWVkXyB0byByZW1vdmUgdGhlbSBhcyB0aGV5IGFyZSBhYm91dCB0byBiZSBvdmVycmlkZGVuIGFueXdheS4uLiBidXQgaXQncyBtb3JlIGNvcnJlY3Rcblx0XHQvLyB0byByZW1vdmUgdGhlbSBmaXJzdC4uLiBhbmQgaW4gY2FzZSB0aGlzIGdldHMgY2FsbGVkIGZyb20gc29tZXdoZXJlIGVsc2UgaW4gdGhlIGZ1dHVyZS5cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShrZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKGtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUFjY291bnRBbmRTZXNzaW9uUHJlZmVyZW5jZXMocHJvdmlkZXJJZDogc3RyaW5nLCBtY3BTZXJ2ZXJJZDogc3RyaW5nLCBzZXNzaW9uOiBBdXRoZW50aWNhdGlvblNlc3Npb24pOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZUFjY291bnRQcmVmZXJlbmNlKG1jcFNlcnZlcklkLCBwcm92aWRlcklkLCBzZXNzaW9uLmFjY291bnQpO1xuXHRcdHRoaXMudXBkYXRlU2Vzc2lvblByZWZlcmVuY2UocHJvdmlkZXJJZCwgbWNwU2VydmVySWQsIHNlc3Npb24pO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSBhc3luYyBzaG93R2V0U2Vzc2lvblByb21wdChwcm92aWRlcjogSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIsIGFjY291bnROYW1lOiBzdHJpbmcsIG1jcFNlcnZlcklkOiBzdHJpbmcsIG1jcFNlcnZlck5hbWU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGVudW0gU2Vzc2lvblByb21wdENob2ljZSB7XG5cdFx0XHRBbGxvdyA9IDAsXG5cdFx0XHREZW55ID0gMSxcblx0XHRcdENhbmNlbCA9IDJcblx0XHR9XG5cdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQ8U2Vzc2lvblByb21wdENob2ljZT4oe1xuXHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY29uZmlybUF1dGhlbnRpY2F0aW9uQWNjZXNzJywgXCJUaGUgTUNQIHNlcnZlciAnezB9JyB3YW50cyB0byBhY2Nlc3MgdGhlIHsxfSBhY2NvdW50ICd7Mn0nLlwiLCBtY3BTZXJ2ZXJOYW1lLCBwcm92aWRlci5sYWJlbCwgYWNjb3VudE5hbWUpLFxuXHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSh7IGtleTogJ2FsbG93JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQWxsb3dcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBTZXNzaW9uUHJvbXB0Q2hvaWNlLkFsbG93XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKHsga2V5OiAnZGVueScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkRlbnlcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBTZXNzaW9uUHJvbXB0Q2hvaWNlLkRlbnlcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdGNhbmNlbEJ1dHRvbjoge1xuXHRcdFx0XHRydW46ICgpID0+IFNlc3Npb25Qcm9tcHRDaG9pY2UuQ2FuY2VsXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAocmVzdWx0ICE9PSBTZXNzaW9uUHJvbXB0Q2hvaWNlLkNhbmNlbCkge1xuXHRcdFx0dGhpcy5fYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRNY3BTZXJ2ZXJzKHByb3ZpZGVyLmlkLCBhY2NvdW50TmFtZSwgW3sgaWQ6IG1jcFNlcnZlcklkLCBuYW1lOiBtY3BTZXJ2ZXJOYW1lLCBhbGxvd2VkOiByZXN1bHQgPT09IFNlc3Npb25Qcm9tcHRDaG9pY2UuQWxsb3cgfV0pO1xuXHRcdFx0dGhpcy5yZW1vdmVBY2Nlc3NSZXF1ZXN0KHByb3ZpZGVyLmlkLCBtY3BTZXJ2ZXJJZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdCA9PT0gU2Vzc2lvblByb21wdENob2ljZS5BbGxvdztcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGlzIGZ1bmN0aW9uIHNob3VsZCBiZSB1c2VkIG9ubHkgd2hlbiB0aGVyZSBhcmUgc2Vzc2lvbnMgdG8gZGlzYW1iaWd1YXRlLlxuXHQgKi9cblx0YXN5bmMgc2VsZWN0U2Vzc2lvbihwcm92aWRlcklkOiBzdHJpbmcsIG1jcFNlcnZlcklkOiBzdHJpbmcsIG1jcFNlcnZlck5hbWU6IHN0cmluZywgc2NvcGVzOiBzdHJpbmdbXSwgYXZhaWxhYmxlU2Vzc2lvbnM6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdKTogUHJvbWlzZTxBdXRoZW50aWNhdGlvblNlc3Npb24+IHtcblx0XHRjb25zdCBhbGxBY2NvdW50cyA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRBY2NvdW50cyhwcm92aWRlcklkKTtcblx0XHRpZiAoIWFsbEFjY291bnRzLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBhY2NvdW50cyBhdmFpbGFibGUnKTtcblx0XHR9XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcXVpY2tQaWNrID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPHsgbGFiZWw6IHN0cmluZzsgc2Vzc2lvbj86IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbjsgYWNjb3VudD86IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQgfT4oKSk7XG5cdFx0cXVpY2tQaWNrLmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRjb25zdCBhY2NvdW50c1dpdGhTZXNzaW9ucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGl0ZW1zOiB7IGxhYmVsOiBzdHJpbmc7IHNlc3Npb24/OiBBdXRoZW50aWNhdGlvblNlc3Npb247IGFjY291bnQ/OiBBdXRoZW50aWNhdGlvblNlc3Npb25BY2NvdW50IH1bXSA9IGF2YWlsYWJsZVNlc3Npb25zXG5cdFx0XHQvLyBPbmx5IGdyYWIgdGhlIGZpcnN0IGFjY291bnRcblx0XHRcdC5maWx0ZXIoc2Vzc2lvbiA9PiAhYWNjb3VudHNXaXRoU2Vzc2lvbnMuaGFzKHNlc3Npb24uYWNjb3VudC5sYWJlbCkgJiYgYWNjb3VudHNXaXRoU2Vzc2lvbnMuYWRkKHNlc3Npb24uYWNjb3VudC5sYWJlbCkpXG5cdFx0XHQubWFwKHNlc3Npb24gPT4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGxhYmVsOiBzZXNzaW9uLmFjY291bnQubGFiZWwsXG5cdFx0XHRcdFx0c2Vzc2lvbjogc2Vzc2lvblxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cblx0XHQvLyBBZGQgdGhlIGFkZGl0aW9uYWwgYWNjb3VudHMgdGhhdCBoYXZlIGJlZW4gbG9nZ2VkIGludG8gdGhlIHByb3ZpZGVyIGJ1dCBhcmVcblx0XHQvLyBkb24ndCBoYXZlIGEgc2Vzc2lvbiB5ZXQuXG5cdFx0YWxsQWNjb3VudHMuZm9yRWFjaChhY2NvdW50ID0+IHtcblx0XHRcdGlmICghYWNjb3VudHNXaXRoU2Vzc2lvbnMuaGFzKGFjY291bnQubGFiZWwpKSB7XG5cdFx0XHRcdGl0ZW1zLnB1c2goeyBsYWJlbDogYWNjb3VudC5sYWJlbCwgYWNjb3VudCB9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpdGVtcy5wdXNoKHsgbGFiZWw6IG5scy5sb2NhbGl6ZSgndXNlT3RoZXJBY2NvdW50JywgXCJTaWduIGluIHRvIGFub3RoZXIgYWNjb3VudFwiKSB9KTtcblx0XHRxdWlja1BpY2suaXRlbXMgPSBpdGVtcztcblx0XHRxdWlja1BpY2sudGl0bGUgPSBubHMubG9jYWxpemUoXG5cdFx0XHR7XG5cdFx0XHRcdGtleTogJ3NlbGVjdEFjY291bnQnLFxuXHRcdFx0XHRjb21tZW50OiBbJ1RoZSBwbGFjZWhvbGRlciB7MH0gaXMgdGhlIG5hbWUgb2YgYSBNQ1Agc2VydmVyLiB7MX0gaXMgdGhlIG5hbWUgb2YgdGhlIHR5cGUgb2YgYWNjb3VudCwgc3VjaCBhcyBNaWNyb3NvZnQgb3IgR2l0SHViLiddXG5cdFx0XHR9LFxuXHRcdFx0XCJUaGUgTUNQIHNlcnZlciAnezB9JyB3YW50cyB0byBhY2Nlc3MgYSB7MX0gYWNjb3VudFwiLFxuXHRcdFx0bWNwU2VydmVyTmFtZSxcblx0XHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRQcm92aWRlcihwcm92aWRlcklkKS5sYWJlbFxuXHRcdCk7XG5cdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gbmxzLmxvY2FsaXplKCdnZXRTZXNzaW9uUGxhdGVob2xkZXInLCBcIlNlbGVjdCBhbiBhY2NvdW50IGZvciAnezB9JyB0byB1c2Ugb3IgRXNjIHRvIGNhbmNlbFwiLCBtY3BTZXJ2ZXJOYW1lKTtcblxuXHRcdHJldHVybiBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkQWNjZXB0KGFzeW5jIF8gPT4ge1xuXHRcdFx0XHRxdWlja1BpY2suZGlzcG9zZSgpO1xuXHRcdFx0XHRsZXQgc2Vzc2lvbiA9IHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdLnNlc3Npb247XG5cdFx0XHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0XHRcdGNvbnN0IGFjY291bnQgPSBxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXS5hY2NvdW50O1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRzZXNzaW9uID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmNyZWF0ZVNlc3Npb24ocHJvdmlkZXJJZCwgc2NvcGVzLCB7IGFjY291bnQgfSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0cmVqZWN0KGUpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBhY2NvdW50TmFtZSA9IHNlc3Npb24uYWNjb3VudC5sYWJlbDtcblxuXHRcdFx0XHR0aGlzLl9hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMocHJvdmlkZXJJZCwgYWNjb3VudE5hbWUsIFt7IGlkOiBtY3BTZXJ2ZXJJZCwgbmFtZTogbWNwU2VydmVyTmFtZSwgYWxsb3dlZDogdHJ1ZSB9XSk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUFjY291bnRBbmRTZXNzaW9uUHJlZmVyZW5jZXMocHJvdmlkZXJJZCwgbWNwU2VydmVySWQsIHNlc3Npb24pO1xuXHRcdFx0XHR0aGlzLnJlbW92ZUFjY2Vzc1JlcXVlc3QocHJvdmlkZXJJZCwgbWNwU2VydmVySWQpO1xuXG5cdFx0XHRcdHJlc29sdmUoc2Vzc2lvbik7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKF8gPT4ge1xuXHRcdFx0XHRpZiAoIXF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdKSB7XG5cdFx0XHRcdFx0cmVqZWN0KCdVc2VyIGRpZCBub3QgY29uc2VudCB0byBhY2NvdW50IGFjY2VzcycpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0cXVpY2tQaWNrLnNob3coKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29tcGxldGVTZXNzaW9uQWNjZXNzUmVxdWVzdChwcm92aWRlcjogSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIsIG1jcFNlcnZlcklkOiBzdHJpbmcsIG1jcFNlcnZlck5hbWU6IHN0cmluZywgc2NvcGVzOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyUmVxdWVzdHMgPSB0aGlzLl9zZXNzaW9uQWNjZXNzUmVxdWVzdEl0ZW1zLmdldChwcm92aWRlci5pZCkgfHwge307XG5cdFx0Y29uc3QgZXhpc3RpbmdSZXF1ZXN0ID0gcHJvdmlkZXJSZXF1ZXN0c1ttY3BTZXJ2ZXJJZF07XG5cdFx0aWYgKCFleGlzdGluZ1JlcXVlc3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHBvc3NpYmxlU2Vzc2lvbnMgPSBleGlzdGluZ1JlcXVlc3QucG9zc2libGVTZXNzaW9ucztcblxuXHRcdGxldCBzZXNzaW9uOiBBdXRoZW50aWNhdGlvblNlc3Npb24gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHByb3ZpZGVyLnN1cHBvcnRzTXVsdGlwbGVBY2NvdW50cykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0c2Vzc2lvbiA9IGF3YWl0IHRoaXMuc2VsZWN0U2Vzc2lvbihwcm92aWRlci5pZCwgbWNwU2VydmVySWQsIG1jcFNlcnZlck5hbWUsIHNjb3BlcywgcG9zc2libGVTZXNzaW9ucyk7XG5cdFx0XHR9IGNhdGNoIChfKSB7XG5cdFx0XHRcdC8vIGlnbm9yZSBjYW5jZWxcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgYXBwcm92ZWQgPSBhd2FpdCB0aGlzLnNob3dHZXRTZXNzaW9uUHJvbXB0KHByb3ZpZGVyLCBwb3NzaWJsZVNlc3Npb25zWzBdLmFjY291bnQubGFiZWwsIG1jcFNlcnZlcklkLCBtY3BTZXJ2ZXJOYW1lKTtcblx0XHRcdGlmIChhcHByb3ZlZCkge1xuXHRcdFx0XHRzZXNzaW9uID0gcG9zc2libGVTZXNzaW9uc1swXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UuYWRkQWNjb3VudFVzYWdlKHByb3ZpZGVyLmlkLCBzZXNzaW9uLmFjY291bnQubGFiZWwsIHNlc3Npb24uc2NvcGVzLCBtY3BTZXJ2ZXJJZCwgbWNwU2VydmVyTmFtZSk7XG5cdFx0fVxuXHR9XG5cblx0cmVxdWVzdFNlc3Npb25BY2Nlc3MocHJvdmlkZXJJZDogc3RyaW5nLCBtY3BTZXJ2ZXJJZDogc3RyaW5nLCBtY3BTZXJ2ZXJOYW1lOiBzdHJpbmcsIHNjb3Blczogc3RyaW5nW10sIHBvc3NpYmxlU2Vzc2lvbnM6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXJSZXF1ZXN0cyA9IHRoaXMuX3Nlc3Npb25BY2Nlc3NSZXF1ZXN0SXRlbXMuZ2V0KHByb3ZpZGVySWQpIHx8IHt9O1xuXHRcdGNvbnN0IGhhc0V4aXN0aW5nUmVxdWVzdCA9IHByb3ZpZGVyUmVxdWVzdHNbbWNwU2VydmVySWRdO1xuXHRcdGlmIChoYXNFeGlzdGluZ1JlcXVlc3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRQcm92aWRlcihwcm92aWRlcklkKTtcblx0XHRjb25zdCBtZW51SXRlbSA9IE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQWNjb3VudHNDb250ZXh0LCB7XG5cdFx0XHRncm91cDogJzNfYWNjZXNzUmVxdWVzdHMnLFxuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogYCR7cHJvdmlkZXJJZH0ke21jcFNlcnZlcklkfUFjY2Vzc2AsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoe1xuXHRcdFx0XHRcdGtleTogJ2FjY2Vzc1JlcXVlc3QnLFxuXHRcdFx0XHRcdGNvbW1lbnQ6IFtgVGhlIHBsYWNlaG9sZGVyIHswfSB3aWxsIGJlIHJlcGxhY2VkIHdpdGggYW4gYXV0aGVudGljYXRpb24gcHJvdmlkZXInJ3MgbGFiZWwuIHsxfSB3aWxsIGJlIHJlcGxhY2VkIHdpdGggYSBNQ1Agc2VydmVyIG5hbWUuICgxKSBpcyB0byBpbmRpY2F0ZSB0aGF0IHRoaXMgbWVudSBpdGVtIGNvbnRyaWJ1dGVzIHRvIGEgYmFkZ2UgY291bnRgXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRcdFwiR3JhbnQgYWNjZXNzIHRvIHswfSBmb3IgezF9Li4uICgxKVwiLFxuXHRcdFx0XHRcdHByb3ZpZGVyLmxhYmVsLFxuXHRcdFx0XHRcdG1jcFNlcnZlck5hbWUpXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBhY2Nlc3NDb21tYW5kID0gQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRcdFx0aWQ6IGAke3Byb3ZpZGVySWR9JHttY3BTZXJ2ZXJJZH1BY2Nlc3NgLFxuXHRcdFx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdHRoaXMuY29tcGxldGVTZXNzaW9uQWNjZXNzUmVxdWVzdChwcm92aWRlciwgbWNwU2VydmVySWQsIG1jcFNlcnZlck5hbWUsIHNjb3Blcyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRwcm92aWRlclJlcXVlc3RzW21jcFNlcnZlcklkXSA9IHsgcG9zc2libGVTZXNzaW9ucywgZGlzcG9zYWJsZXM6IFttZW51SXRlbSwgYWNjZXNzQ29tbWFuZF0gfTtcblx0XHR0aGlzLl9zZXNzaW9uQWNjZXNzUmVxdWVzdEl0ZW1zLnNldChwcm92aWRlcklkLCBwcm92aWRlclJlcXVlc3RzKTtcblx0XHR0aGlzLnVwZGF0ZUJhZGdlQ291bnQoKTtcblx0fVxuXG5cdGFzeW5jIHJlcXVlc3ROZXdTZXNzaW9uKHByb3ZpZGVySWQ6IHN0cmluZywgc2NvcGVzOiBzdHJpbmdbXSwgbWNwU2VydmVySWQ6IHN0cmluZywgbWNwU2VydmVyTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2UuaXNBdXRoZW50aWNhdGlvblByb3ZpZGVyUmVnaXN0ZXJlZChwcm92aWRlcklkKSkge1xuXHRcdFx0Ly8gQWN0aXZhdGUgaGFzIGFscmVhZHkgYmVlbiBjYWxsZWQgZm9yIHRoZSBhdXRoZW50aWNhdGlvbiBwcm92aWRlciwgYnV0IGl0IGNhbm5vdCBibG9jayBvbiByZWdpc3RlcmluZyBpdHNlbGZcblx0XHRcdC8vIHNpbmNlIHRoaXMgaXMgc3luYyBhbmQgcmV0dXJucyBhIGRpc3Bvc2FibGUuIFNvLCB3YWl0IGZvciByZWdpc3RyYXRpb24gZXZlbnQgdG8gZmlyZSB0aGF0IGluZGljYXRlcyB0aGVcblx0XHRcdC8vIHByb3ZpZGVyIGlzIG5vdyBpbiB0aGUgbWFwLlxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIF8pID0+IHtcblx0XHRcdFx0Y29uc3QgZGlzcG9zZSA9IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZFJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5pZCA9PT0gcHJvdmlkZXJJZCkge1xuXHRcdFx0XHRcdFx0ZGlzcG9zZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGxldCBwcm92aWRlcjogSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXI7XG5cdFx0dHJ5IHtcblx0XHRcdHByb3ZpZGVyID0gdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVyKHByb3ZpZGVySWQpO1xuXHRcdH0gY2F0Y2ggKF9lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlkZXJSZXF1ZXN0cyA9IHRoaXMuX3NpZ25JblJlcXVlc3RJdGVtcy5nZXQocHJvdmlkZXJJZCk7XG5cdFx0Y29uc3Qgc2NvcGVzTGlzdCA9IHNjb3Blcy5qb2luKFNDT1BFU0xJU1RfU0VQQVJBVE9SKTtcblx0XHRjb25zdCBtY3BTZXJ2ZXJIYXNFeGlzdGluZ1JlcXVlc3QgPSBwcm92aWRlclJlcXVlc3RzXG5cdFx0XHQmJiBwcm92aWRlclJlcXVlc3RzW3Njb3Blc0xpc3RdXG5cdFx0XHQmJiBwcm92aWRlclJlcXVlc3RzW3Njb3Blc0xpc3RdLnJlcXVlc3RpbmdNY3BTZXJ2ZXJJZHMuaW5jbHVkZXMobWNwU2VydmVySWQpO1xuXG5cdFx0aWYgKG1jcFNlcnZlckhhc0V4aXN0aW5nUmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENvbnN0cnVjdCBhIGNvbW1hbmRJZCB0aGF0IHdvbid0IGNsYXNoIHdpdGggb3RoZXJzIGdlbmVyYXRlZCBoZXJlLCBub3IgbGlrZWx5IHdpdGggYW4gTUNQIHNlcnZlcidzIGNvbW1hbmRcblx0XHRjb25zdCBjb21tYW5kSWQgPSBgJHtwcm92aWRlcklkfToke21jcFNlcnZlcklkfTpzaWduSW4ke09iamVjdC5rZXlzKHByb3ZpZGVyUmVxdWVzdHMgfHwgW10pLmxlbmd0aH1gO1xuXHRcdGNvbnN0IG1lbnVJdGVtID0gTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5BY2NvdW50c0NvbnRleHQsIHtcblx0XHRcdGdyb3VwOiAnMl9zaWduSW5SZXF1ZXN0cycsXG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiBjb21tYW5kSWQsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoe1xuXHRcdFx0XHRcdGtleTogJ3NpZ25JblJlcXVlc3QnLFxuXHRcdFx0XHRcdGNvbW1lbnQ6IFtgVGhlIHBsYWNlaG9sZGVyIHswfSB3aWxsIGJlIHJlcGxhY2VkIHdpdGggYW4gYXV0aGVudGljYXRpb24gcHJvdmlkZXIncyBsYWJlbC4gezF9IHdpbGwgYmUgcmVwbGFjZWQgd2l0aCBhIE1DUCBzZXJ2ZXIgbmFtZS4gKDEpIGlzIHRvIGluZGljYXRlIHRoYXQgdGhpcyBtZW51IGl0ZW0gY29udHJpYnV0ZXMgdG8gYSBiYWRnZSBjb3VudC5gXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRcdFwiU2lnbiBpbiB3aXRoIHswfSB0byB1c2UgezF9ICgxKVwiLFxuXHRcdFx0XHRcdHByb3ZpZGVyLmxhYmVsLFxuXHRcdFx0XHRcdG1jcFNlcnZlck5hbWUpXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzaWduSW5Db21tYW5kID0gQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRcdFx0aWQ6IGNvbW1hbmRJZCxcblx0XHRcdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRjb25zdCBhdXRoZW50aWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUF1dGhlbnRpY2F0aW9uU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBhdXRoZW50aWNhdGlvblNlcnZpY2UuY3JlYXRlU2Vzc2lvbihwcm92aWRlcklkLCBzY29wZXMpO1xuXG5cdFx0XHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkTWNwU2VydmVycyhwcm92aWRlcklkLCBzZXNzaW9uLmFjY291bnQubGFiZWwsIFt7IGlkOiBtY3BTZXJ2ZXJJZCwgbmFtZTogbWNwU2VydmVyTmFtZSwgYWxsb3dlZDogdHJ1ZSB9XSk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUFjY291bnRBbmRTZXNzaW9uUHJlZmVyZW5jZXMocHJvdmlkZXJJZCwgbWNwU2VydmVySWQsIHNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cblx0XHRpZiAocHJvdmlkZXJSZXF1ZXN0cykge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdSZXF1ZXN0ID0gcHJvdmlkZXJSZXF1ZXN0c1tzY29wZXNMaXN0XSB8fCB7IGRpc3Bvc2FibGVzOiBbXSwgcmVxdWVzdGluZ01jcFNlcnZlcklkczogW10gfTtcblxuXHRcdFx0cHJvdmlkZXJSZXF1ZXN0c1tzY29wZXNMaXN0XSA9IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXM6IFsuLi5leGlzdGluZ1JlcXVlc3QuZGlzcG9zYWJsZXMsIG1lbnVJdGVtLCBzaWduSW5Db21tYW5kXSxcblx0XHRcdFx0cmVxdWVzdGluZ01jcFNlcnZlcklkczogWy4uLmV4aXN0aW5nUmVxdWVzdC5yZXF1ZXN0aW5nTWNwU2VydmVySWRzLCBtY3BTZXJ2ZXJJZF1cblx0XHRcdH07XG5cdFx0XHR0aGlzLl9zaWduSW5SZXF1ZXN0SXRlbXMuc2V0KHByb3ZpZGVySWQsIHByb3ZpZGVyUmVxdWVzdHMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zaWduSW5SZXF1ZXN0SXRlbXMuc2V0KHByb3ZpZGVySWQsIHtcblx0XHRcdFx0W3Njb3Blc0xpc3RdOiB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXM6IFttZW51SXRlbSwgc2lnbkluQ29tbWFuZF0sXG5cdFx0XHRcdFx0cmVxdWVzdGluZ01jcFNlcnZlcklkczogW21jcFNlcnZlcklkXVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUJhZGdlQ291bnQoKTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJQXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLCBBdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQVksaUJBQWlCLFNBQXNCLHlCQUF5QjtBQUNyRixTQUFTLG1CQUFtQjtBQUM1QixZQUFZLFNBQVM7QUFDckIsU0FBUyxRQUFRLG9CQUFvQjtBQUNyQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxrQkFBa0IsbUJBQW1CO0FBQzlDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsc0NBQXNDO0FBQy9DLFNBQXlELDhCQUE0RDtBQUNySCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBR2hDLE1BQU0sdUJBQXVCO0FBWXRCLE1BQU0sNEJBQTRCLGdCQUEyQywyQkFBMkI7QUEwRHhHLElBQU0sMkJBQU4sY0FB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
