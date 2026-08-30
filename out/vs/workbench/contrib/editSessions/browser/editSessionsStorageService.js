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
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { createSyncHeaders } from "../../../../platform/userDataSync/common/userDataSync.js";
import { IAuthenticationService } from "../../../services/authentication/common/authentication.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { EDIT_SESSIONS_SIGNED_IN, EDIT_SESSION_SYNC_CATEGORY, EDIT_SESSIONS_SIGNED_IN_KEY, IEditSessionsLogService, EDIT_SESSIONS_PENDING_KEY } from "../common/editSessions.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { getCurrentAuthenticationSessionInfo } from "../../../services/authentication/browser/authenticationService.js";
import { isWeb } from "../../../../base/common/platform.js";
import { UserDataSyncMachinesService } from "../../../../platform/userDataSync/common/userDataSyncMachines.js";
import { Emitter } from "../../../../base/common/event.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { ISecretStorageService } from "../../../../platform/secrets/common/secrets.js";
let EditSessionsWorkbenchService = class extends Disposable {
  // TODO@joyceerhl lifecycle hack
  constructor(fileService, storageService, quickInputService, authenticationService, extensionService, environmentService, logService, productService, contextKeyService, dialogService, secretStorageService) {
    super();
    this.fileService = fileService;
    this.storageService = storageService;
    this.quickInputService = quickInputService;
    this.authenticationService = authenticationService;
    this.extensionService = extensionService;
    this.environmentService = environmentService;
    this.logService = logService;
    this.productService = productService;
    this.contextKeyService = contextKeyService;
    this.dialogService = dialogService;
    this.secretStorageService = secretStorageService;
    this.SIZE_LIMIT = Math.floor(1024 * 1024 * 1.9);
    this.initialized = false;
    this._didSignIn = this._register(new Emitter());
    this._didSignOut = this._register(new Emitter());
    this._lastWrittenResources = /* @__PURE__ */ new Map();
    this._lastReadResources = /* @__PURE__ */ new Map();
    this.serverConfiguration = this.productService["editSessions.store"];
    this._register(this.authenticationService.onDidChangeSessions((e) => this.onDidChangeSessions(e.event)));
    this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, EditSessionsWorkbenchService.CACHED_SESSION_STORAGE_KEY, this._store)(() => this.onDidChangeStorage()));
    this.registerSignInAction();
    this.registerResetAuthenticationAction();
    this.signedInContext = EDIT_SESSIONS_SIGNED_IN.bindTo(this.contextKeyService);
    this.signedInContext.set(this.existingSessionId !== void 0);
  }
  get isSignedIn() {
    return this.existingSessionId !== void 0;
  }
  get onDidSignIn() {
    return this._didSignIn.event;
  }
  get onDidSignOut() {
    return this._didSignOut.event;
  }
  get lastWrittenResources() {
    return this._lastWrittenResources;
  }
  get lastReadResources() {
    return this._lastReadResources;
  }
  /**
   * @param resource: The resource to retrieve content for.
   * @param content An object representing resource state to be restored.
   * @returns The ref of the stored state.
   */
  async write(resource, content) {
    await this.initialize("write", false);
    if (!this.initialized) {
      throw new Error("Please sign in to store your edit session.");
    }
    if (typeof content !== "string" && content.machine === void 0) {
      content.machine = await this.getOrCreateCurrentMachineId();
    }
    content = typeof content === "string" ? content : JSON.stringify(content);
    const ref = await this.storeClient.writeResource(resource, content, null, void 0, createSyncHeaders(generateUuid()));
    this._lastWrittenResources.set(resource, { ref, content });
    return ref;
  }
  /**
   * @param resource: The resource to retrieve content for.
   * @param ref: A specific content ref to retrieve content for, if it exists.
   * If undefined, this method will return the latest saved edit session, if any.
   *
   * @returns An object representing the requested or latest state, if any.
   */
  async read(resource, ref) {
    await this.initialize("read", false);
    if (!this.initialized) {
      throw new Error("Please sign in to apply your latest edit session.");
    }
    let content;
    const headers = createSyncHeaders(generateUuid());
    try {
      if (ref !== void 0) {
        content = await this.storeClient?.resolveResourceContent(resource, ref, void 0, headers);
      } else {
        const result = await this.storeClient?.readResource(resource, null, void 0, headers);
        content = result?.content;
        ref = result?.ref;
      }
    } catch (ex) {
      this.logService.error(ex);
    }
    if (content !== void 0 && content !== null && ref !== void 0) {
      this._lastReadResources.set(resource, { ref, content });
      return { ref, content };
    }
    return void 0;
  }
  async delete(resource, ref) {
    await this.initialize("write", false);
    if (!this.initialized) {
      throw new Error(`Unable to delete edit session with ref ${ref}.`);
    }
    try {
      await this.storeClient?.deleteResource(resource, ref);
    } catch (ex) {
      this.logService.error(ex);
    }
  }
  async list(resource) {
    await this.initialize("read", false);
    if (!this.initialized) {
      throw new Error(`Unable to list edit sessions.`);
    }
    try {
      return this.storeClient?.getAllResourceRefs(resource) ?? [];
    } catch (ex) {
      this.logService.error(ex);
    }
    return [];
  }
  async initialize(reason, silent = false) {
    if (this.initialized) {
      return true;
    }
    this.initialized = await this.doInitialize(reason, silent);
    this.signedInContext.set(this.initialized);
    if (this.initialized) {
      this._didSignIn.fire();
    }
    return this.initialized;
  }
  /**
   *
   * Ensures that the store client is initialized,
   * meaning that authentication is configured and it
   * can be used to communicate with the remote storage service
   */
  async doInitialize(reason, silent) {
    await this.extensionService.whenInstalledExtensionsRegistered();
    if (!this.serverConfiguration?.url) {
      throw new Error("Unable to initialize sessions sync as session sync preference is not configured in product.json.");
    }
    if (this.storeClient === void 0) {
      return false;
    }
    this._register(this.storeClient.onTokenFailed(() => {
      this.logService.info("Clearing edit sessions authentication preference because of successive token failures.");
      this.clearAuthenticationPreference();
    }));
    if (this.machineClient === void 0) {
      this.machineClient = new UserDataSyncMachinesService(this.environmentService, this.fileService, this.storageService, this.storeClient, this.logService, this.productService);
    }
    if (this.authenticationInfo !== void 0) {
      return true;
    }
    const authenticationSession = await this.getAuthenticationSession(reason, silent);
    if (authenticationSession !== void 0) {
      this.authenticationInfo = authenticationSession;
      this.storeClient.setAuthToken(authenticationSession.token, authenticationSession.providerId);
    }
    return authenticationSession !== void 0;
  }
  async getMachineById(machineId) {
    await this.initialize("read", false);
    if (!this.cachedMachines) {
      const machines = await this.machineClient.getMachines();
      this.cachedMachines = machines.reduce((map, machine) => map.set(machine.id, machine.name), /* @__PURE__ */ new Map());
    }
    return this.cachedMachines.get(machineId);
  }
  async getOrCreateCurrentMachineId() {
    const currentMachineId = await this.machineClient.getMachines().then((machines) => machines.find((m) => m.isCurrent)?.id);
    if (currentMachineId === void 0) {
      await this.machineClient.addCurrentMachine();
      return await this.machineClient.getMachines().then((machines) => machines.find((m) => m.isCurrent).id);
    }
    return currentMachineId;
  }
  async getAuthenticationSession(reason, silent) {
    if (this.existingSessionId) {
      this.logService.info(`Searching for existing authentication session with ID ${this.existingSessionId}`);
      const existingSession = await this.getExistingSession();
      if (existingSession) {
        this.logService.info(`Found existing authentication session with ID ${existingSession.session.id}`);
        return { sessionId: existingSession.session.id, token: existingSession.session.idToken ?? existingSession.session.accessToken, providerId: existingSession.session.providerId };
      } else {
        this._didSignOut.fire();
      }
    }
    if (this.shouldAttemptEditSessionInit()) {
      this.logService.info(`Reusing user data sync enablement`);
      const authenticationSessionInfo = await getCurrentAuthenticationSessionInfo(this.secretStorageService, this.productService);
      if (authenticationSessionInfo !== void 0) {
        this.logService.info(`Using current authentication session with ID ${authenticationSessionInfo.id}`);
        this.existingSessionId = authenticationSessionInfo.id;
        return { sessionId: authenticationSessionInfo.id, token: authenticationSessionInfo.accessToken, providerId: authenticationSessionInfo.providerId };
      }
    }
    if (silent) {
      return;
    }
    const authenticationSession = await this.getAccountPreference(reason);
    if (authenticationSession !== void 0) {
      this.existingSessionId = authenticationSession.id;
      return { sessionId: authenticationSession.id, token: authenticationSession.idToken ?? authenticationSession.accessToken, providerId: authenticationSession.providerId };
    }
    return void 0;
  }
  shouldAttemptEditSessionInit() {
    return isWeb && this.storageService.isNew(StorageScope.APPLICATION) && this.storageService.isNew(StorageScope.WORKSPACE);
  }
  /**
   *
   * Prompts the user to pick an authentication option for storing and getting edit sessions.
   */
  async getAccountPreference(reason) {
    const disposables = new DisposableStore();
    const quickpick = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
    quickpick.ok = false;
    quickpick.placeholder = reason === "read" ? localize("choose account read placeholder", "Select an account to restore your working changes from the cloud") : localize("choose account placeholder", "Select an account to store your working changes in the cloud");
    quickpick.ignoreFocusOut = true;
    quickpick.items = await this.createQuickpickItems();
    return new Promise((resolve, reject) => {
      disposables.add(quickpick.onDidHide((e) => {
        reject(new CancellationError());
        disposables.dispose();
      }));
      disposables.add(quickpick.onDidAccept(async (e) => {
        const selection = quickpick.selectedItems[0];
        const session = "provider" in selection ? { ...await this.authenticationService.createSession(selection.provider.id, selection.provider.scopes), providerId: selection.provider.id } : "session" in selection ? selection.session : void 0;
        resolve(session);
        quickpick.hide();
      }));
      quickpick.show();
    });
  }
  async createQuickpickItems() {
    const options = [];
    options.push({ type: "separator", label: localize("signed in", "Signed In") });
    const sessions = await this.getAllSessions();
    options.push(...sessions);
    options.push({ type: "separator", label: localize("others", "Others") });
    for (const authenticationProvider of await this.getAuthenticationProviders()) {
      const signedInForProvider = sessions.some((account) => account.session.providerId === authenticationProvider.id);
      if (!signedInForProvider || this.authenticationService.getProvider(authenticationProvider.id).supportsMultipleAccounts) {
        const providerName = this.authenticationService.getProvider(authenticationProvider.id).label;
        options.push({ label: localize("sign in using account", "Sign in with {0}", providerName), provider: authenticationProvider });
      }
    }
    return options;
  }
  /**
   *
   * Returns all authentication sessions available from {@link getAuthenticationProviders}.
   */
  async getAllSessions() {
    const authenticationProviders = await this.getAuthenticationProviders();
    const accounts = /* @__PURE__ */ new Map();
    let currentSession;
    for (const provider of authenticationProviders) {
      const sessions = await this.authenticationService.getSessions(provider.id, provider.scopes);
      for (const session of sessions) {
        const item = {
          label: session.account.label,
          description: this.authenticationService.getProvider(provider.id).label,
          session: { ...session, providerId: provider.id }
        };
        accounts.set(item.session.account.id, item);
        if (this.existingSessionId === session.id) {
          currentSession = item;
        }
      }
    }
    if (currentSession !== void 0) {
      accounts.set(currentSession.session.account.id, currentSession);
    }
    return [...accounts.values()].sort((a, b) => a.label.localeCompare(b.label));
  }
  /**
   *
   * Returns all authentication providers which can be used to authenticate
   * to the remote storage service, based on product.json configuration
   * and registered authentication providers.
   */
  async getAuthenticationProviders() {
    if (!this.serverConfiguration) {
      throw new Error("Unable to get configured authentication providers as session sync preference is not configured in product.json.");
    }
    const authenticationProviders = this.serverConfiguration.authenticationProviders;
    const configuredAuthenticationProviders = Object.keys(authenticationProviders).reduce((result, id) => {
      result.push({ id, scopes: authenticationProviders[id].scopes });
      return result;
    }, []);
    const availableAuthenticationProviders = this.authenticationService.declaredProviders;
    return configuredAuthenticationProviders.filter(({ id }) => availableAuthenticationProviders.some((provider) => provider.id === id));
  }
  get existingSessionId() {
    return this.storageService.get(EditSessionsWorkbenchService.CACHED_SESSION_STORAGE_KEY, StorageScope.APPLICATION);
  }
  set existingSessionId(sessionId) {
    this.logService.trace(`Saving authentication session preference for ID ${sessionId}.`);
    if (sessionId === void 0) {
      this.storageService.remove(EditSessionsWorkbenchService.CACHED_SESSION_STORAGE_KEY, StorageScope.APPLICATION);
    } else {
      this.storageService.store(EditSessionsWorkbenchService.CACHED_SESSION_STORAGE_KEY, sessionId, StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
  }
  async getExistingSession() {
    const accounts = await this.getAllSessions();
    return accounts.find((account) => account.session.id === this.existingSessionId);
  }
  async onDidChangeStorage() {
    const newSessionId = this.existingSessionId;
    const previousSessionId = this.authenticationInfo?.sessionId;
    if (previousSessionId !== newSessionId) {
      this.logService.trace(`Resetting authentication state because authentication session ID preference changed from ${previousSessionId} to ${newSessionId}.`);
      this.authenticationInfo = void 0;
      this.initialized = false;
    }
  }
  clearAuthenticationPreference() {
    this.authenticationInfo = void 0;
    this.initialized = false;
    this.existingSessionId = void 0;
    this.signedInContext.set(false);
  }
  onDidChangeSessions(e) {
    if (this.authenticationInfo?.sessionId && e.removed?.find((session) => session.id === this.authenticationInfo?.sessionId)) {
      this.clearAuthenticationPreference();
    }
  }
  registerSignInAction() {
    if (!this.serverConfiguration?.url) {
      return;
    }
    const that = this;
    const id = "workbench.editSessions.actions.signIn";
    const when = ContextKeyExpr.and(ContextKeyExpr.equals(EDIT_SESSIONS_PENDING_KEY, false), ContextKeyExpr.equals(EDIT_SESSIONS_SIGNED_IN_KEY, false));
    this._register(registerAction2(class ResetEditSessionAuthenticationAction extends Action2 {
      constructor() {
        super({
          id,
          title: localize("sign in", "Turn on Cloud Changes..."),
          category: EDIT_SESSION_SYNC_CATEGORY,
          precondition: when,
          menu: [
            {
              id: MenuId.CommandPalette
            },
            {
              id: MenuId.AccountsContext,
              group: "2_editSessions",
              when
            }
          ]
        });
      }
      async run() {
        return await that.initialize("write", false);
      }
    }));
    this._register(MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
      group: "2_editSessions",
      command: {
        id,
        title: localize("sign in badge", "Turn on Cloud Changes... (1)")
      },
      when: ContextKeyExpr.and(ContextKeyExpr.equals(EDIT_SESSIONS_PENDING_KEY, true), ContextKeyExpr.equals(EDIT_SESSIONS_SIGNED_IN_KEY, false))
    }));
  }
  registerResetAuthenticationAction() {
    const that = this;
    this._register(registerAction2(class ResetEditSessionAuthenticationAction extends Action2 {
      constructor() {
        super({
          id: "workbench.editSessions.actions.resetAuth",
          title: localize("reset auth.v3", "Turn off Cloud Changes..."),
          category: EDIT_SESSION_SYNC_CATEGORY,
          precondition: ContextKeyExpr.equals(EDIT_SESSIONS_SIGNED_IN_KEY, true),
          menu: [
            {
              id: MenuId.CommandPalette
            },
            {
              id: MenuId.AccountsContext,
              group: "2_editSessions",
              when: ContextKeyExpr.equals(EDIT_SESSIONS_SIGNED_IN_KEY, true)
            }
          ]
        });
      }
      async run() {
        const result = await that.dialogService.confirm({
          message: localize("sign out of cloud changes clear data prompt", "Do you want to disable storing working changes in the cloud?"),
          checkbox: { label: localize("delete all cloud changes", "Delete all stored data from the cloud.") }
        });
        if (result.confirmed) {
          if (result.checkboxChecked) {
            that.storeClient?.deleteResource("editSessions", null);
          }
          that.clearAuthenticationPreference();
        }
      }
    }));
  }
};
EditSessionsWorkbenchService.CACHED_SESSION_STORAGE_KEY = "editSessionAccountPreference";
EditSessionsWorkbenchService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, IAuthenticationService),
  __decorateParam(4, IExtensionService),
  __decorateParam(5, IEnvironmentService),
  __decorateParam(6, IEditSessionsLogService),
  __decorateParam(7, IProductService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IDialogService),
  __decorateParam(10, ISecretStorageService)
], EditSessionsWorkbenchService);
export {
  EditSessionsWorkbenchService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVkaXRTZXNzaW9uc1xcYnJvd3NlclxcZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTeW5jSGVhZGVycywgSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIsIElSZXNvdXJjZVJlZkhhbmRsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiwgQXV0aGVudGljYXRpb25TZXNzaW9uc0NoYW5nZUV2ZW50LCBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFRElUX1NFU1NJT05TX1NJR05FRF9JTiwgRWRpdFNlc3Npb24sIEVESVRfU0VTU0lPTl9TWU5DX0NBVEVHT1JZLCBJRWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UsIEVESVRfU0VTU0lPTlNfU0lHTkVEX0lOX0tFWSwgSUVkaXRTZXNzaW9uc0xvZ1NlcnZpY2UsIFN5bmNSZXNvdXJjZSwgRURJVF9TRVNTSU9OU19QRU5ESU5HX0tFWSB9IGZyb20gJy4uL2NvbW1vbi9lZGl0U2Vzc2lvbnMuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgZ2V0Q3VycmVudEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UsIFVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jTWFjaGluZXMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVkaXRTZXNzaW9uc1N0b3JlQ2xpZW50IH0gZnJvbSAnLi4vY29tbW9uL2VkaXRTZXNzaW9uc1N0b3JhZ2VDbGllbnQuanMnO1xuaW1wb3J0IHsgSVNlY3JldFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc2VjcmV0cy9jb21tb24vc2VjcmV0cy5qcyc7XG5cbnR5cGUgRXhpc3RpbmdTZXNzaW9uID0gSVF1aWNrUGlja0l0ZW0gJiB7IHNlc3Npb246IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiAmIHsgcHJvdmlkZXJJZDogc3RyaW5nIH0gfTtcbnR5cGUgQXV0aGVudGljYXRpb25Qcm92aWRlck9wdGlvbiA9IElRdWlja1BpY2tJdGVtICYgeyBwcm92aWRlcjogSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIgfTtcblxuZXhwb3J0IGNsYXNzIEVkaXRTZXNzaW9uc1dvcmtiZW5jaFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgU0laRV9MSU1JVCA9IE1hdGguZmxvb3IoMTAyNCAqIDEwMjQgKiAxLjkpOyAvLyAyIE1CXG5cblx0cHJpdmF0ZSBzZXJ2ZXJDb25maWd1cmF0aW9uO1xuXHRwcml2YXRlIG1hY2hpbmVDbGllbnQ6IElVc2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBhdXRoZW50aWNhdGlvbkluZm86IHsgc2Vzc2lvbklkOiBzdHJpbmc7IHRva2VuOiBzdHJpbmc7IHByb3ZpZGVySWQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHN0YXRpYyBDQUNIRURfU0VTU0lPTl9TVE9SQUdFX0tFWSA9ICdlZGl0U2Vzc2lvbkFjY291bnRQcmVmZXJlbmNlJztcblxuXHRwcml2YXRlIGluaXRpYWxpemVkID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2lnbmVkSW5Db250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRnZXQgaXNTaWduZWRJbigpIHtcblx0XHRyZXR1cm4gdGhpcy5leGlzdGluZ1Nlc3Npb25JZCAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlkU2lnbkluID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdGdldCBvbkRpZFNpZ25JbigpIHtcblx0XHRyZXR1cm4gdGhpcy5fZGlkU2lnbkluLmV2ZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlkU2lnbk91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRnZXQgb25EaWRTaWduT3V0KCkge1xuXHRcdHJldHVybiB0aGlzLl9kaWRTaWduT3V0LmV2ZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfbGFzdFdyaXR0ZW5SZXNvdXJjZXMgPSBuZXcgTWFwPFN5bmNSZXNvdXJjZSwgeyByZWY6IHN0cmluZzsgY29udGVudDogc3RyaW5nIH0+KCk7XG5cdGdldCBsYXN0V3JpdHRlblJlc291cmNlcygpIHtcblx0XHRyZXR1cm4gdGhpcy5fbGFzdFdyaXR0ZW5SZXNvdXJjZXM7XG5cdH1cblxuXHRwcml2YXRlIF9sYXN0UmVhZFJlc291cmNlcyA9IG5ldyBNYXA8U3luY1Jlc291cmNlLCB7IHJlZjogc3RyaW5nOyBjb250ZW50OiBzdHJpbmcgfT4oKTtcblx0Z2V0IGxhc3RSZWFkUmVzb3VyY2VzKCkge1xuXHRcdHJldHVybiB0aGlzLl9sYXN0UmVhZFJlc291cmNlcztcblx0fVxuXG5cdHN0b3JlQ2xpZW50OiBFZGl0U2Vzc2lvbnNTdG9yZUNsaWVudCB8IHVuZGVmaW5lZDsgLy8gVE9ET0Bqb3ljZWVyaGwgbGlmZWN5Y2xlIGhhY2tcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUVkaXRTZXNzaW9uc0xvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJRWRpdFNlc3Npb25zTG9nU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVNlY3JldFN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2VjcmV0U3RvcmFnZVNlcnZpY2U6IElTZWNyZXRTdG9yYWdlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuc2VydmVyQ29uZmlndXJhdGlvbiA9IHRoaXMucHJvZHVjdFNlcnZpY2VbJ2VkaXRTZXNzaW9ucy5zdG9yZSddO1xuXHRcdC8vIElmIHRoZSB1c2VyIHNpZ25zIG91dCBvZiB0aGUgY3VycmVudCBzZXNzaW9uLCByZXNldCBvdXIgY2FjaGVkIGF1dGggc3RhdGUgaW4gbWVtb3J5IGFuZCBvbiBkaXNrXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucygoZSkgPT4gdGhpcy5vbkRpZENoYW5nZVNlc3Npb25zKGUuZXZlbnQpKSk7XG5cblx0XHQvLyBJZiBhbm90aGVyIHdpbmRvdyBjaGFuZ2VzIHRoZSBwcmVmZXJyZWQgc2Vzc2lvbiBzdG9yYWdlLCByZXNldCBvdXIgY2FjaGVkIGF1dGggc3RhdGUgaW4gbWVtb3J5XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgRWRpdFNlc3Npb25zV29ya2JlbmNoU2VydmljZS5DQUNIRURfU0VTU0lPTl9TVE9SQUdFX0tFWSwgdGhpcy5fc3RvcmUpKCgpID0+IHRoaXMub25EaWRDaGFuZ2VTdG9yYWdlKCkpKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJTaWduSW5BY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyUmVzZXRBdXRoZW50aWNhdGlvbkFjdGlvbigpO1xuXG5cdFx0dGhpcy5zaWduZWRJbkNvbnRleHQgPSBFRElUX1NFU1NJT05TX1NJR05FRF9JTi5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zaWduZWRJbkNvbnRleHQuc2V0KHRoaXMuZXhpc3RpbmdTZXNzaW9uSWQgIT09IHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIHJlc291cmNlOiBUaGUgcmVzb3VyY2UgdG8gcmV0cmlldmUgY29udGVudCBmb3IuXG5cdCAqIEBwYXJhbSBjb250ZW50IEFuIG9iamVjdCByZXByZXNlbnRpbmcgcmVzb3VyY2Ugc3RhdGUgdG8gYmUgcmVzdG9yZWQuXG5cdCAqIEByZXR1cm5zIFRoZSByZWYgb2YgdGhlIHN0b3JlZCBzdGF0ZS5cblx0ICovXG5cdGFzeW5jIHdyaXRlKHJlc291cmNlOiBTeW5jUmVzb3VyY2UsIGNvbnRlbnQ6IHN0cmluZyB8IEVkaXRTZXNzaW9uKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRhd2FpdCB0aGlzLmluaXRpYWxpemUoJ3dyaXRlJywgZmFsc2UpO1xuXHRcdGlmICghdGhpcy5pbml0aWFsaXplZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdQbGVhc2Ugc2lnbiBpbiB0byBzdG9yZSB5b3VyIGVkaXQgc2Vzc2lvbi4nKTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIGNvbnRlbnQgIT09ICdzdHJpbmcnICYmIGNvbnRlbnQubWFjaGluZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb250ZW50Lm1hY2hpbmUgPSBhd2FpdCB0aGlzLmdldE9yQ3JlYXRlQ3VycmVudE1hY2hpbmVJZCgpO1xuXHRcdH1cblxuXHRcdGNvbnRlbnQgPSB0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycgPyBjb250ZW50IDogSlNPTi5zdHJpbmdpZnkoY29udGVudCk7XG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5zdG9yZUNsaWVudCEud3JpdGVSZXNvdXJjZShyZXNvdXJjZSwgY29udGVudCwgbnVsbCwgdW5kZWZpbmVkLCBjcmVhdGVTeW5jSGVhZGVycyhnZW5lcmF0ZVV1aWQoKSkpO1xuXG5cdFx0dGhpcy5fbGFzdFdyaXR0ZW5SZXNvdXJjZXMuc2V0KHJlc291cmNlLCB7IHJlZiwgY29udGVudCB9KTtcblxuXHRcdHJldHVybiByZWY7XG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIHJlc291cmNlOiBUaGUgcmVzb3VyY2UgdG8gcmV0cmlldmUgY29udGVudCBmb3IuXG5cdCAqIEBwYXJhbSByZWY6IEEgc3BlY2lmaWMgY29udGVudCByZWYgdG8gcmV0cmlldmUgY29udGVudCBmb3IsIGlmIGl0IGV4aXN0cy5cblx0ICogSWYgdW5kZWZpbmVkLCB0aGlzIG1ldGhvZCB3aWxsIHJldHVybiB0aGUgbGF0ZXN0IHNhdmVkIGVkaXQgc2Vzc2lvbiwgaWYgYW55LlxuXHQgKlxuXHQgKiBAcmV0dXJucyBBbiBvYmplY3QgcmVwcmVzZW50aW5nIHRoZSByZXF1ZXN0ZWQgb3IgbGF0ZXN0IHN0YXRlLCBpZiBhbnkuXG5cdCAqL1xuXHRhc3luYyByZWFkKHJlc291cmNlOiBTeW5jUmVzb3VyY2UsIHJlZjogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx7IHJlZjogc3RyaW5nOyBjb250ZW50OiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGF3YWl0IHRoaXMuaW5pdGlhbGl6ZSgncmVhZCcsIGZhbHNlKTtcblx0XHRpZiAoIXRoaXMuaW5pdGlhbGl6ZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignUGxlYXNlIHNpZ24gaW4gdG8gYXBwbHkgeW91ciBsYXRlc3QgZWRpdCBzZXNzaW9uLicpO1xuXHRcdH1cblxuXHRcdGxldCBjb250ZW50OiBzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsO1xuXHRcdGNvbnN0IGhlYWRlcnMgPSBjcmVhdGVTeW5jSGVhZGVycyhnZW5lcmF0ZVV1aWQoKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChyZWYgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb250ZW50ID0gYXdhaXQgdGhpcy5zdG9yZUNsaWVudD8ucmVzb2x2ZVJlc291cmNlQ29udGVudChyZXNvdXJjZSwgcmVmLCB1bmRlZmluZWQsIGhlYWRlcnMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zdG9yZUNsaWVudD8ucmVhZFJlc291cmNlKHJlc291cmNlLCBudWxsLCB1bmRlZmluZWQsIGhlYWRlcnMpO1xuXHRcdFx0XHRjb250ZW50ID0gcmVzdWx0Py5jb250ZW50O1xuXHRcdFx0XHRyZWYgPSByZXN1bHQ/LnJlZjtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChleCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGV4KTtcblx0XHR9XG5cblx0XHQvLyBUT0RPQGpveWNlZXJobCBWYWxpZGF0ZSBzZXNzaW9uIGRhdGEsIGNoZWNrIHNjaGVtYSB2ZXJzaW9uXG5cdFx0aWYgKGNvbnRlbnQgIT09IHVuZGVmaW5lZCAmJiBjb250ZW50ICE9PSBudWxsICYmIHJlZiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9sYXN0UmVhZFJlc291cmNlcy5zZXQocmVzb3VyY2UsIHsgcmVmLCBjb250ZW50IH0pO1xuXHRcdFx0cmV0dXJuIHsgcmVmLCBjb250ZW50IH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBkZWxldGUocmVzb3VyY2U6IFN5bmNSZXNvdXJjZSwgcmVmOiBzdHJpbmcgfCBudWxsKSB7XG5cdFx0YXdhaXQgdGhpcy5pbml0aWFsaXplKCd3cml0ZScsIGZhbHNlKTtcblx0XHRpZiAoIXRoaXMuaW5pdGlhbGl6ZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIGRlbGV0ZSBlZGl0IHNlc3Npb24gd2l0aCByZWYgJHtyZWZ9LmApO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLnN0b3JlQ2xpZW50Py5kZWxldGVSZXNvdXJjZShyZXNvdXJjZSwgcmVmKTtcblx0XHR9IGNhdGNoIChleCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGV4KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBsaXN0KHJlc291cmNlOiBTeW5jUmVzb3VyY2UpOiBQcm9taXNlPElSZXNvdXJjZVJlZkhhbmRsZVtdPiB7XG5cdFx0YXdhaXQgdGhpcy5pbml0aWFsaXplKCdyZWFkJywgZmFsc2UpO1xuXHRcdGlmICghdGhpcy5pbml0aWFsaXplZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmFibGUgdG8gbGlzdCBlZGl0IHNlc3Npb25zLmApO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zdG9yZUNsaWVudD8uZ2V0QWxsUmVzb3VyY2VSZWZzKHJlc291cmNlKSA/PyBbXTtcblx0XHR9IGNhdGNoIChleCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGV4KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgaW5pdGlhbGl6ZShyZWFzb246ICdyZWFkJyB8ICd3cml0ZScsIHNpbGVudDogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdFx0aWYgKHRoaXMuaW5pdGlhbGl6ZWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHR0aGlzLmluaXRpYWxpemVkID0gYXdhaXQgdGhpcy5kb0luaXRpYWxpemUocmVhc29uLCBzaWxlbnQpO1xuXHRcdHRoaXMuc2lnbmVkSW5Db250ZXh0LnNldCh0aGlzLmluaXRpYWxpemVkKTtcblx0XHRpZiAodGhpcy5pbml0aWFsaXplZCkge1xuXHRcdFx0dGhpcy5fZGlkU2lnbkluLmZpcmUoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuaW5pdGlhbGl6ZWQ7XG5cblx0fVxuXG5cdC8qKlxuXHQgKlxuXHQgKiBFbnN1cmVzIHRoYXQgdGhlIHN0b3JlIGNsaWVudCBpcyBpbml0aWFsaXplZCxcblx0ICogbWVhbmluZyB0aGF0IGF1dGhlbnRpY2F0aW9uIGlzIGNvbmZpZ3VyZWQgYW5kIGl0XG5cdCAqIGNhbiBiZSB1c2VkIHRvIGNvbW11bmljYXRlIHdpdGggdGhlIHJlbW90ZSBzdG9yYWdlIHNlcnZpY2Vcblx0ICovXG5cdHByaXZhdGUgYXN5bmMgZG9Jbml0aWFsaXplKHJlYXNvbjogJ3JlYWQnIHwgJ3dyaXRlJywgc2lsZW50OiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Ly8gV2FpdCBmb3IgYXV0aGVudGljYXRpb24gZXh0ZW5zaW9ucyB0byBiZSByZWdpc3RlcmVkXG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXG5cdFx0aWYgKCF0aGlzLnNlcnZlckNvbmZpZ3VyYXRpb24/LnVybCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmFibGUgdG8gaW5pdGlhbGl6ZSBzZXNzaW9ucyBzeW5jIGFzIHNlc3Npb24gc3luYyBwcmVmZXJlbmNlIGlzIG5vdCBjb25maWd1cmVkIGluIHByb2R1Y3QuanNvbi4nKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zdG9yZUNsaWVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yZUNsaWVudC5vblRva2VuRmFpbGVkKCgpID0+IHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdDbGVhcmluZyBlZGl0IHNlc3Npb25zIGF1dGhlbnRpY2F0aW9uIHByZWZlcmVuY2UgYmVjYXVzZSBvZiBzdWNjZXNzaXZlIHRva2VuIGZhaWx1cmVzLicpO1xuXHRcdFx0dGhpcy5jbGVhckF1dGhlbnRpY2F0aW9uUHJlZmVyZW5jZSgpO1xuXHRcdH0pKTtcblxuXHRcdGlmICh0aGlzLm1hY2hpbmVDbGllbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5tYWNoaW5lQ2xpZW50ID0gbmV3IFVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZSh0aGlzLmVudmlyb25tZW50U2VydmljZSwgdGhpcy5maWxlU2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSwgdGhpcy5zdG9yZUNsaWVudCwgdGhpcy5sb2dTZXJ2aWNlLCB0aGlzLnByb2R1Y3RTZXJ2aWNlKTtcblx0XHR9XG5cblx0XHQvLyBJZiB3ZSBhbHJlYWR5IGhhdmUgYW4gZXhpc3RpbmcgYXV0aCBzZXNzaW9uIGluIG1lbW9yeSwgdXNlIHRoYXRcblx0XHRpZiAodGhpcy5hdXRoZW50aWNhdGlvbkluZm8gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXV0aGVudGljYXRpb25TZXNzaW9uID0gYXdhaXQgdGhpcy5nZXRBdXRoZW50aWNhdGlvblNlc3Npb24ocmVhc29uLCBzaWxlbnQpO1xuXHRcdGlmIChhdXRoZW50aWNhdGlvblNlc3Npb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5hdXRoZW50aWNhdGlvbkluZm8gPSBhdXRoZW50aWNhdGlvblNlc3Npb247XG5cdFx0XHR0aGlzLnN0b3JlQ2xpZW50LnNldEF1dGhUb2tlbihhdXRoZW50aWNhdGlvblNlc3Npb24udG9rZW4sIGF1dGhlbnRpY2F0aW9uU2Vzc2lvbi5wcm92aWRlcklkKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXV0aGVudGljYXRpb25TZXNzaW9uICE9PSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGNhY2hlZE1hY2hpbmVzOiBNYXA8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXG5cdGFzeW5jIGdldE1hY2hpbmVCeUlkKG1hY2hpbmVJZDogc3RyaW5nKSB7XG5cdFx0YXdhaXQgdGhpcy5pbml0aWFsaXplKCdyZWFkJywgZmFsc2UpO1xuXG5cdFx0aWYgKCF0aGlzLmNhY2hlZE1hY2hpbmVzKSB7XG5cdFx0XHRjb25zdCBtYWNoaW5lcyA9IGF3YWl0IHRoaXMubWFjaGluZUNsaWVudCEuZ2V0TWFjaGluZXMoKTtcblx0XHRcdHRoaXMuY2FjaGVkTWFjaGluZXMgPSBtYWNoaW5lcy5yZWR1Y2UoKG1hcCwgbWFjaGluZSkgPT4gbWFwLnNldChtYWNoaW5lLmlkLCBtYWNoaW5lLm5hbWUpLCBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jYWNoZWRNYWNoaW5lcy5nZXQobWFjaGluZUlkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0T3JDcmVhdGVDdXJyZW50TWFjaGluZUlkKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY3VycmVudE1hY2hpbmVJZCA9IGF3YWl0IHRoaXMubWFjaGluZUNsaWVudCEuZ2V0TWFjaGluZXMoKS50aGVuKChtYWNoaW5lcykgPT4gbWFjaGluZXMuZmluZCgobSkgPT4gbS5pc0N1cnJlbnQpPy5pZCk7XG5cblx0XHRpZiAoY3VycmVudE1hY2hpbmVJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLm1hY2hpbmVDbGllbnQhLmFkZEN1cnJlbnRNYWNoaW5lKCk7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5tYWNoaW5lQ2xpZW50IS5nZXRNYWNoaW5lcygpLnRoZW4oKG1hY2hpbmVzKSA9PiBtYWNoaW5lcy5maW5kKChtKSA9PiBtLmlzQ3VycmVudCkhLmlkKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3VycmVudE1hY2hpbmVJZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0QXV0aGVudGljYXRpb25TZXNzaW9uKHJlYXNvbjogJ3JlYWQnIHwgJ3dyaXRlJywgc2lsZW50OiBib29sZWFuKSB7XG5cdFx0Ly8gSWYgdGhlIHVzZXIgc2lnbmVkIGluIHByZXZpb3VzbHkgYW5kIHRoZSBzZXNzaW9uIGlzIHN0aWxsIGF2YWlsYWJsZSwgcmV1c2UgdGhhdCB3aXRob3V0IHByb21wdGluZyB0aGUgdXNlciBhZ2FpblxuXHRcdGlmICh0aGlzLmV4aXN0aW5nU2Vzc2lvbklkKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgU2VhcmNoaW5nIGZvciBleGlzdGluZyBhdXRoZW50aWNhdGlvbiBzZXNzaW9uIHdpdGggSUQgJHt0aGlzLmV4aXN0aW5nU2Vzc2lvbklkfWApO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdTZXNzaW9uID0gYXdhaXQgdGhpcy5nZXRFeGlzdGluZ1Nlc3Npb24oKTtcblx0XHRcdGlmIChleGlzdGluZ1Nlc3Npb24pIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEZvdW5kIGV4aXN0aW5nIGF1dGhlbnRpY2F0aW9uIHNlc3Npb24gd2l0aCBJRCAke2V4aXN0aW5nU2Vzc2lvbi5zZXNzaW9uLmlkfWApO1xuXHRcdFx0XHRyZXR1cm4geyBzZXNzaW9uSWQ6IGV4aXN0aW5nU2Vzc2lvbi5zZXNzaW9uLmlkLCB0b2tlbjogZXhpc3RpbmdTZXNzaW9uLnNlc3Npb24uaWRUb2tlbiA/PyBleGlzdGluZ1Nlc3Npb24uc2Vzc2lvbi5hY2Nlc3NUb2tlbiwgcHJvdmlkZXJJZDogZXhpc3RpbmdTZXNzaW9uLnNlc3Npb24ucHJvdmlkZXJJZCB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZGlkU2lnbk91dC5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgc2V0dGluZ3Mgc3luYyBpcyBhbHJlYWR5IGVuYWJsZWQsIGF2b2lkIGFza2luZyBhZ2FpbiB0byBhdXRoZW50aWNhdGVcblx0XHRpZiAodGhpcy5zaG91bGRBdHRlbXB0RWRpdFNlc3Npb25Jbml0KCkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBSZXVzaW5nIHVzZXIgZGF0YSBzeW5jIGVuYWJsZW1lbnRgKTtcblx0XHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8gPSBhd2FpdCBnZXRDdXJyZW50QXV0aGVudGljYXRpb25TZXNzaW9uSW5mbyh0aGlzLnNlY3JldFN0b3JhZ2VTZXJ2aWNlLCB0aGlzLnByb2R1Y3RTZXJ2aWNlKTtcblx0XHRcdGlmIChhdXRoZW50aWNhdGlvblNlc3Npb25JbmZvICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFVzaW5nIGN1cnJlbnQgYXV0aGVudGljYXRpb24gc2Vzc2lvbiB3aXRoIElEICR7YXV0aGVudGljYXRpb25TZXNzaW9uSW5mby5pZH1gKTtcblx0XHRcdFx0dGhpcy5leGlzdGluZ1Nlc3Npb25JZCA9IGF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8uaWQ7XG5cdFx0XHRcdHJldHVybiB7IHNlc3Npb25JZDogYXV0aGVudGljYXRpb25TZXNzaW9uSW5mby5pZCwgdG9rZW46IGF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8uYWNjZXNzVG9rZW4sIHByb3ZpZGVySWQ6IGF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8ucHJvdmlkZXJJZCB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIHdlIGFyZW4ndCBzdXBwb3NlZCB0byBwcm9tcHQgdGhlIHVzZXIgYmVjYXVzZVxuXHRcdC8vIHdlJ3JlIGluIGEgc2lsZW50IGZsb3csIGp1c3QgcmV0dXJuIGhlcmVcblx0XHRpZiAoc2lsZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQXNrIHRoZSB1c2VyIHRvIHBpY2sgYSBwcmVmZXJyZWQgYWNjb3VudFxuXHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uU2Vzc2lvbiA9IGF3YWl0IHRoaXMuZ2V0QWNjb3VudFByZWZlcmVuY2UocmVhc29uKTtcblx0XHRpZiAoYXV0aGVudGljYXRpb25TZXNzaW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuZXhpc3RpbmdTZXNzaW9uSWQgPSBhdXRoZW50aWNhdGlvblNlc3Npb24uaWQ7XG5cdFx0XHRyZXR1cm4geyBzZXNzaW9uSWQ6IGF1dGhlbnRpY2F0aW9uU2Vzc2lvbi5pZCwgdG9rZW46IGF1dGhlbnRpY2F0aW9uU2Vzc2lvbi5pZFRva2VuID8/IGF1dGhlbnRpY2F0aW9uU2Vzc2lvbi5hY2Nlc3NUb2tlbiwgcHJvdmlkZXJJZDogYXV0aGVudGljYXRpb25TZXNzaW9uLnByb3ZpZGVySWQgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRBdHRlbXB0RWRpdFNlc3Npb25Jbml0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc1dlYiAmJiB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmlzTmV3KFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikgJiYgdGhpcy5zdG9yYWdlU2VydmljZS5pc05ldyhTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0fVxuXG5cdC8qKlxuXHQgKlxuXHQgKiBQcm9tcHRzIHRoZSB1c2VyIHRvIHBpY2sgYW4gYXV0aGVudGljYXRpb24gb3B0aW9uIGZvciBzdG9yaW5nIGFuZCBnZXR0aW5nIGVkaXQgc2Vzc2lvbnMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGdldEFjY291bnRQcmVmZXJlbmNlKHJlYXNvbjogJ3JlYWQnIHwgJ3dyaXRlJyk6IFByb21pc2U8QXV0aGVudGljYXRpb25TZXNzaW9uICYgeyBwcm92aWRlcklkOiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHF1aWNrcGljayA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxFeGlzdGluZ1Nlc3Npb24gfCBBdXRoZW50aWNhdGlvblByb3ZpZGVyT3B0aW9uIHwgSVF1aWNrUGlja0l0ZW0+KHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KSk7XG5cdFx0cXVpY2twaWNrLm9rID0gZmFsc2U7XG5cdFx0cXVpY2twaWNrLnBsYWNlaG9sZGVyID0gcmVhc29uID09PSAncmVhZCcgPyBsb2NhbGl6ZSgnY2hvb3NlIGFjY291bnQgcmVhZCBwbGFjZWhvbGRlcicsIFwiU2VsZWN0IGFuIGFjY291bnQgdG8gcmVzdG9yZSB5b3VyIHdvcmtpbmcgY2hhbmdlcyBmcm9tIHRoZSBjbG91ZFwiKSA6IGxvY2FsaXplKCdjaG9vc2UgYWNjb3VudCBwbGFjZWhvbGRlcicsIFwiU2VsZWN0IGFuIGFjY291bnQgdG8gc3RvcmUgeW91ciB3b3JraW5nIGNoYW5nZXMgaW4gdGhlIGNsb3VkXCIpO1xuXHRcdHF1aWNrcGljay5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cdFx0cXVpY2twaWNrLml0ZW1zID0gYXdhaXQgdGhpcy5jcmVhdGVRdWlja3BpY2tJdGVtcygpO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja3BpY2sub25EaWRIaWRlKChlKSA9PiB7XG5cdFx0XHRcdHJlamVjdChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrcGljay5vbkRpZEFjY2VwdChhc3luYyAoZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBxdWlja3BpY2suc2VsZWN0ZWRJdGVtc1swXTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9ICdwcm92aWRlcicgaW4gc2VsZWN0aW9uID8geyAuLi5hd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5jcmVhdGVTZXNzaW9uKHNlbGVjdGlvbi5wcm92aWRlci5pZCwgc2VsZWN0aW9uLnByb3ZpZGVyLnNjb3BlcyksIHByb3ZpZGVySWQ6IHNlbGVjdGlvbi5wcm92aWRlci5pZCB9IDogKCdzZXNzaW9uJyBpbiBzZWxlY3Rpb24gPyBzZWxlY3Rpb24uc2Vzc2lvbiA6IHVuZGVmaW5lZCk7XG5cdFx0XHRcdHJlc29sdmUoc2Vzc2lvbik7XG5cdFx0XHRcdHF1aWNrcGljay5oaWRlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHF1aWNrcGljay5zaG93KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZVF1aWNrcGlja0l0ZW1zKCk6IFByb21pc2U8KEV4aXN0aW5nU2Vzc2lvbiB8IEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJPcHRpb24gfCBJUXVpY2tQaWNrU2VwYXJhdG9yIHwgSVF1aWNrUGlja0l0ZW0gJiB7IGNhbmNlbGVkQXV0aGVudGljYXRpb246IGJvb2xlYW4gfSlbXT4ge1xuXHRcdGNvbnN0IG9wdGlvbnM6IChFeGlzdGluZ1Nlc3Npb24gfCBBdXRoZW50aWNhdGlvblByb3ZpZGVyT3B0aW9uIHwgSVF1aWNrUGlja1NlcGFyYXRvciB8IElRdWlja1BpY2tJdGVtICYgeyBjYW5jZWxlZEF1dGhlbnRpY2F0aW9uOiBib29sZWFuIH0pW10gPSBbXTtcblxuXHRcdG9wdGlvbnMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ3NpZ25lZCBpbicsIFwiU2lnbmVkIEluXCIpIH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCB0aGlzLmdldEFsbFNlc3Npb25zKCk7XG5cdFx0b3B0aW9ucy5wdXNoKC4uLnNlc3Npb25zKTtcblxuXHRcdG9wdGlvbnMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ290aGVycycsIFwiT3RoZXJzXCIpIH0pO1xuXG5cdFx0Zm9yIChjb25zdCBhdXRoZW50aWNhdGlvblByb3ZpZGVyIG9mIChhd2FpdCB0aGlzLmdldEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzKCkpKSB7XG5cdFx0XHRjb25zdCBzaWduZWRJbkZvclByb3ZpZGVyID0gc2Vzc2lvbnMuc29tZShhY2NvdW50ID0+IGFjY291bnQuc2Vzc2lvbi5wcm92aWRlcklkID09PSBhdXRoZW50aWNhdGlvblByb3ZpZGVyLmlkKTtcblx0XHRcdGlmICghc2lnbmVkSW5Gb3JQcm92aWRlciB8fCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRQcm92aWRlcihhdXRoZW50aWNhdGlvblByb3ZpZGVyLmlkKS5zdXBwb3J0c011bHRpcGxlQWNjb3VudHMpIHtcblx0XHRcdFx0Y29uc3QgcHJvdmlkZXJOYW1lID0gdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXIoYXV0aGVudGljYXRpb25Qcm92aWRlci5pZCkubGFiZWw7XG5cdFx0XHRcdG9wdGlvbnMucHVzaCh7IGxhYmVsOiBsb2NhbGl6ZSgnc2lnbiBpbiB1c2luZyBhY2NvdW50JywgXCJTaWduIGluIHdpdGggezB9XCIsIHByb3ZpZGVyTmFtZSksIHByb3ZpZGVyOiBhdXRoZW50aWNhdGlvblByb3ZpZGVyIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBvcHRpb25zO1xuXHR9XG5cblx0LyoqXG5cdCAqXG5cdCAqIFJldHVybnMgYWxsIGF1dGhlbnRpY2F0aW9uIHNlc3Npb25zIGF2YWlsYWJsZSBmcm9tIHtAbGluayBnZXRBdXRoZW50aWNhdGlvblByb3ZpZGVyc30uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGdldEFsbFNlc3Npb25zKCkge1xuXHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzID0gYXdhaXQgdGhpcy5nZXRBdXRoZW50aWNhdGlvblByb3ZpZGVycygpO1xuXHRcdGNvbnN0IGFjY291bnRzID0gbmV3IE1hcDxzdHJpbmcsIEV4aXN0aW5nU2Vzc2lvbj4oKTtcblx0XHRsZXQgY3VycmVudFNlc3Npb246IEV4aXN0aW5nU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblxuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgYXV0aGVudGljYXRpb25Qcm92aWRlcnMpIHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMocHJvdmlkZXIuaWQsIHByb3ZpZGVyLnNjb3Blcyk7XG5cblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdFx0XHRjb25zdCBpdGVtID0ge1xuXHRcdFx0XHRcdGxhYmVsOiBzZXNzaW9uLmFjY291bnQubGFiZWwsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVyKHByb3ZpZGVyLmlkKS5sYWJlbCxcblx0XHRcdFx0XHRzZXNzaW9uOiB7IC4uLnNlc3Npb24sIHByb3ZpZGVySWQ6IHByb3ZpZGVyLmlkIH1cblx0XHRcdFx0fTtcblx0XHRcdFx0YWNjb3VudHMuc2V0KGl0ZW0uc2Vzc2lvbi5hY2NvdW50LmlkLCBpdGVtKTtcblx0XHRcdFx0aWYgKHRoaXMuZXhpc3RpbmdTZXNzaW9uSWQgPT09IHNlc3Npb24uaWQpIHtcblx0XHRcdFx0XHRjdXJyZW50U2Vzc2lvbiA9IGl0ZW07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY3VycmVudFNlc3Npb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0YWNjb3VudHMuc2V0KGN1cnJlbnRTZXNzaW9uLnNlc3Npb24uYWNjb3VudC5pZCwgY3VycmVudFNlc3Npb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiBbLi4uYWNjb3VudHMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSk7XG5cdH1cblxuXHQvKipcblx0ICpcblx0ICogUmV0dXJucyBhbGwgYXV0aGVudGljYXRpb24gcHJvdmlkZXJzIHdoaWNoIGNhbiBiZSB1c2VkIHRvIGF1dGhlbnRpY2F0ZVxuXHQgKiB0byB0aGUgcmVtb3RlIHN0b3JhZ2Ugc2VydmljZSwgYmFzZWQgb24gcHJvZHVjdC5qc29uIGNvbmZpZ3VyYXRpb25cblx0ICogYW5kIHJlZ2lzdGVyZWQgYXV0aGVudGljYXRpb24gcHJvdmlkZXJzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBnZXRBdXRoZW50aWNhdGlvblByb3ZpZGVycygpIHtcblx0XHRpZiAoIXRoaXMuc2VydmVyQ29uZmlndXJhdGlvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmFibGUgdG8gZ2V0IGNvbmZpZ3VyZWQgYXV0aGVudGljYXRpb24gcHJvdmlkZXJzIGFzIHNlc3Npb24gc3luYyBwcmVmZXJlbmNlIGlzIG5vdCBjb25maWd1cmVkIGluIHByb2R1Y3QuanNvbi4nKTtcblx0XHR9XG5cblx0XHQvLyBHZXQgdGhlIGxpc3Qgb2YgYXV0aGVudGljYXRpb24gcHJvdmlkZXJzIGNvbmZpZ3VyZWQgaW4gcHJvZHVjdC5qc29uXG5cdFx0Y29uc3QgYXV0aGVudGljYXRpb25Qcm92aWRlcnMgPSB0aGlzLnNlcnZlckNvbmZpZ3VyYXRpb24uYXV0aGVudGljYXRpb25Qcm92aWRlcnM7XG5cdFx0Y29uc3QgY29uZmlndXJlZEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzID0gT2JqZWN0LmtleXMoYXV0aGVudGljYXRpb25Qcm92aWRlcnMpLnJlZHVjZTxJQXV0aGVudGljYXRpb25Qcm92aWRlcltdPigocmVzdWx0LCBpZCkgPT4ge1xuXHRcdFx0cmVzdWx0LnB1c2goeyBpZCwgc2NvcGVzOiBhdXRoZW50aWNhdGlvblByb3ZpZGVyc1tpZF0uc2NvcGVzIH0pO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9LCBbXSk7XG5cblx0XHQvLyBGaWx0ZXIgb3V0IGFueXRoaW5nIHRoYXQgaXNuJ3QgY3VycmVudGx5IGF2YWlsYWJsZSB0aHJvdWdoIHRoZSBhdXRoZW50aWNhdGlvblNlcnZpY2Vcblx0XHRjb25zdCBhdmFpbGFibGVBdXRoZW50aWNhdGlvblByb3ZpZGVycyA9IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmRlY2xhcmVkUHJvdmlkZXJzO1xuXG5cdFx0cmV0dXJuIGNvbmZpZ3VyZWRBdXRoZW50aWNhdGlvblByb3ZpZGVycy5maWx0ZXIoKHsgaWQgfSkgPT4gYXZhaWxhYmxlQXV0aGVudGljYXRpb25Qcm92aWRlcnMuc29tZShwcm92aWRlciA9PiBwcm92aWRlci5pZCA9PT0gaWQpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGV4aXN0aW5nU2Vzc2lvbklkKCkge1xuXHRcdHJldHVybiB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChFZGl0U2Vzc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLkNBQ0hFRF9TRVNTSU9OX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXQgZXhpc3RpbmdTZXNzaW9uSWQoc2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFNhdmluZyBhdXRoZW50aWNhdGlvbiBzZXNzaW9uIHByZWZlcmVuY2UgZm9yIElEICR7c2Vzc2lvbklkfS5gKTtcblx0XHRpZiAoc2Vzc2lvbklkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKEVkaXRTZXNzaW9uc1dvcmtiZW5jaFNlcnZpY2UuQ0FDSEVEX1NFU1NJT05fU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoRWRpdFNlc3Npb25zV29ya2JlbmNoU2VydmljZS5DQUNIRURfU0VTU0lPTl9TVE9SQUdFX0tFWSwgc2Vzc2lvbklkLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRFeGlzdGluZ1Nlc3Npb24oKSB7XG5cdFx0Y29uc3QgYWNjb3VudHMgPSBhd2FpdCB0aGlzLmdldEFsbFNlc3Npb25zKCk7XG5cdFx0cmV0dXJuIGFjY291bnRzLmZpbmQoKGFjY291bnQpID0+IGFjY291bnQuc2Vzc2lvbi5pZCA9PT0gdGhpcy5leGlzdGluZ1Nlc3Npb25JZCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRGlkQ2hhbmdlU3RvcmFnZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBuZXdTZXNzaW9uSWQgPSB0aGlzLmV4aXN0aW5nU2Vzc2lvbklkO1xuXHRcdGNvbnN0IHByZXZpb3VzU2Vzc2lvbklkID0gdGhpcy5hdXRoZW50aWNhdGlvbkluZm8/LnNlc3Npb25JZDtcblxuXHRcdGlmIChwcmV2aW91c1Nlc3Npb25JZCAhPT0gbmV3U2Vzc2lvbklkKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFJlc2V0dGluZyBhdXRoZW50aWNhdGlvbiBzdGF0ZSBiZWNhdXNlIGF1dGhlbnRpY2F0aW9uIHNlc3Npb24gSUQgcHJlZmVyZW5jZSBjaGFuZ2VkIGZyb20gJHtwcmV2aW91c1Nlc3Npb25JZH0gdG8gJHtuZXdTZXNzaW9uSWR9LmApO1xuXHRcdFx0dGhpcy5hdXRoZW50aWNhdGlvbkluZm8gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmluaXRpYWxpemVkID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGVhckF1dGhlbnRpY2F0aW9uUHJlZmVyZW5jZSgpOiB2b2lkIHtcblx0XHR0aGlzLmF1dGhlbnRpY2F0aW9uSW5mbyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmluaXRpYWxpemVkID0gZmFsc2U7XG5cdFx0dGhpcy5leGlzdGluZ1Nlc3Npb25JZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnNpZ25lZEluQ29udGV4dC5zZXQoZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVNlc3Npb25zKGU6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbnNDaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmF1dGhlbnRpY2F0aW9uSW5mbz8uc2Vzc2lvbklkICYmIGUucmVtb3ZlZD8uZmluZChzZXNzaW9uID0+IHNlc3Npb24uaWQgPT09IHRoaXMuYXV0aGVudGljYXRpb25JbmZvPy5zZXNzaW9uSWQpKSB7XG5cdFx0XHR0aGlzLmNsZWFyQXV0aGVudGljYXRpb25QcmVmZXJlbmNlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNpZ25JbkFjdGlvbigpIHtcblx0XHRpZiAoIXRoaXMuc2VydmVyQ29uZmlndXJhdGlvbj8udXJsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdGNvbnN0IGlkID0gJ3dvcmtiZW5jaC5lZGl0U2Vzc2lvbnMuYWN0aW9ucy5zaWduSW4nO1xuXHRcdGNvbnN0IHdoZW4gPSBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKEVESVRfU0VTU0lPTlNfUEVORElOR19LRVksIGZhbHNlKSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKEVESVRfU0VTU0lPTlNfU0lHTkVEX0lOX0tFWSwgZmFsc2UpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgUmVzZXRFZGl0U2Vzc2lvbkF1dGhlbnRpY2F0aW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2lnbiBpbicsICdUdXJuIG9uIENsb3VkIENoYW5nZXMuLi4nKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogRURJVF9TRVNTSU9OX1NZTkNfQ0FURUdPUlksXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiB3aGVuLFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5BY2NvdW50c0NvbnRleHQsXG5cdFx0XHRcdFx0XHRncm91cDogJzJfZWRpdFNlc3Npb25zJyxcblx0XHRcdFx0XHRcdHdoZW4sXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bigpIHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoYXQuaW5pdGlhbGl6ZSgnd3JpdGUnLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5BY2NvdW50c0NvbnRleHQsIHtcblx0XHRcdGdyb3VwOiAnMl9lZGl0U2Vzc2lvbnMnLFxuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzaWduIGluIGJhZGdlJywgJ1R1cm4gb24gQ2xvdWQgQ2hhbmdlcy4uLiAoMSknKSxcblx0XHRcdH0sXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKEVESVRfU0VTU0lPTlNfUEVORElOR19LRVksIHRydWUpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoRURJVF9TRVNTSU9OU19TSUdORURfSU5fS0VZLCBmYWxzZSkpXG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclJlc2V0QXV0aGVudGljYXRpb25BY3Rpb24oKSB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlc2V0RWRpdFNlc3Npb25BdXRoZW50aWNhdGlvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5lZGl0U2Vzc2lvbnMuYWN0aW9ucy5yZXNldEF1dGgnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncmVzZXQgYXV0aC52MycsICdUdXJuIG9mZiBDbG91ZCBDaGFuZ2VzLi4uJyksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IEVESVRfU0VTU0lPTl9TWU5DX0NBVEVHT1JZLFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKEVESVRfU0VTU0lPTlNfU0lHTkVEX0lOX0tFWSwgdHJ1ZSksXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkFjY291bnRzQ29udGV4dCxcblx0XHRcdFx0XHRcdGdyb3VwOiAnMl9lZGl0U2Vzc2lvbnMnLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKEVESVRfU0VTU0lPTlNfU0lHTkVEX0lOX0tFWSwgdHJ1ZSksXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bigpIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhhdC5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdzaWduIG91dCBvZiBjbG91ZCBjaGFuZ2VzIGNsZWFyIGRhdGEgcHJvbXB0JywgJ0RvIHlvdSB3YW50IHRvIGRpc2FibGUgc3RvcmluZyB3b3JraW5nIGNoYW5nZXMgaW4gdGhlIGNsb3VkPycpLFxuXHRcdFx0XHRcdGNoZWNrYm94OiB7IGxhYmVsOiBsb2NhbGl6ZSgnZGVsZXRlIGFsbCBjbG91ZCBjaGFuZ2VzJywgJ0RlbGV0ZSBhbGwgc3RvcmVkIGRhdGEgZnJvbSB0aGUgY2xvdWQuJykgfVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKHJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdFx0XHRpZiAocmVzdWx0LmNoZWNrYm94Q2hlY2tlZCkge1xuXHRcdFx0XHRcdFx0dGhhdC5zdG9yZUNsaWVudD8uZGVsZXRlUmVzb3VyY2UoJ2VkaXRTZXNzaW9ucycsIG51bGwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGF0LmNsZWFyQXV0aGVudGljYXRpb25QcmVmZXJlbmNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsUUFBUSxjQUFjLHVCQUF1QjtBQUMvRCxTQUFTLGdCQUE2QiwwQkFBMEI7QUFDaEUsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBK0Q7QUFDeEUsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx5QkFBc0U7QUFDL0UsU0FBbUUsOEJBQThCO0FBQ2pHLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXNDLDRCQUF5RCw2QkFBNkIseUJBQXVDLGlDQUFpQztBQUM3TSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDJDQUEyQztBQUNwRCxTQUFTLGFBQWE7QUFDdEIsU0FBdUMsbUNBQW1DO0FBQzFFLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5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
