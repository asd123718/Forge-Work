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
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../base/common/lifecycle.js";
import { CancellationTokenSource } from "../../base/common/cancellation.js";
import { runOnChange } from "../../base/common/observable.js";
import { DeferredPromise, disposableTimeout } from "../../base/common/async.js";
import { createDecorator, IInstantiationService } from "../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../platform/storage/common/storage.js";
import { IUserDataProfileStorageService } from "../../platform/userDataProfile/common/userDataProfileStorageService.js";
import { IUserDataProfilesService } from "../../platform/userDataProfile/common/userDataProfile.js";
import { ServiceCollection } from "../../platform/instantiation/common/serviceCollection.js";
import { ChatEntitlementContext, IChatEntitlementService } from "../../workbench/services/chat/common/chatEntitlementService.js";
import { isWeb } from "../../base/common/platform.js";
import { GitHubPaths, IDefaultAccountService } from "../../platform/defaultAccount/common/defaultAccount.js";
import { IProductService } from "../../platform/product/common/productService.js";
import { IContextKeyService } from "../../platform/contextkey/common/contextkey.js";
import { IWorkbenchEnvironmentService } from "../../workbench/services/environment/common/environmentService.js";
import { IAuthenticationService } from "../../workbench/services/authentication/common/authentication.js";
import { ICommandService } from "../../platform/commands/common/commands.js";
import { IWorkbenchLayoutService } from "../../workbench/services/layout/browser/layoutService.js";
import { IKeybindingService } from "../../platform/keybinding/common/keybinding.js";
import { IHostService } from "../../workbench/services/host/browser/host.js";
import { IMarkdownRendererService } from "../../platform/markdown/browser/markdownRenderer.js";
import { WELCOME_COMPLETE_KEY } from "../common/welcome.js";
import { SessionsWelcomeVisibleContext } from "../common/contextkeys.js";
import { ConditionalAuthState, conditionalAuthState, observeAllowSignedOutWhenUsable, resolveSignedOutWindowGate, SignedOutWindowGate } from "./sessionsAuthGate.js";
import { IConfigurationService } from "../../platform/configuration/common/configuration.js";
import { Codicon } from "../../base/common/codicons.js";
import { $, append } from "../../base/browser/dom.js";
import { Dialog, DialogContentsAlignment } from "../../base/browser/ui/dialog/dialog.js";
import { createWorkbenchDialogOptions } from "../../workbench/browser/parts/dialogs/dialog.js";
import { MarkdownString } from "../../base/common/htmlContent.js";
import { localize } from "../../nls.js";
import { createSessionsSignInDialogOptions, SessionsSigningInDialog } from "./sessionsSignInDialog.js";
import { SHOULD_SHOW_RETURN_TO_VSCODE_EDITOR_COMMAND_ID } from "../common/sessionCommands.js";
import { ISessionsManagementService } from "../services/sessions/common/sessionsManagement.js";
const AIDisabledConfig = "chat.disableAIFeatures";
const ISessionsSetUpService = createDecorator("sessionsSetUpService");
function shouldSkipSessionsWelcome(environmentService) {
  if (environmentService.enableSmokeTestDriver) {
    return true;
  }
  const envArgs = environmentService.args;
  if (envArgs?.["skip-sessions-welcome"]) {
    return true;
  }
  return typeof globalThis.location !== "undefined" && new URLSearchParams(globalThis.location.search).has("skip-sessions-welcome");
}
let SessionsSetUpWidget = class extends Disposable {
  // Non-service params must come before @-decorated service params
  constructor(onCompleted, serviceWhenSetupDone, serviceMarkDone, onInitialSignInDialogShown, defaultAccountService, productService, storageService, contextKeyService, environmentService, authenticationService, logService, commandService, configurationService, layoutService, keybindingService, hostService, markdownRendererService, instantiationService, sessionsManagementService) {
    super();
    this.onCompleted = onCompleted;
    this.serviceWhenSetupDone = serviceWhenSetupDone;
    this.serviceMarkDone = serviceMarkDone;
    this.onInitialSignInDialogShown = onInitialSignInDialogShown;
    this.defaultAccountService = defaultAccountService;
    this.productService = productService;
    this.storageService = storageService;
    this.contextKeyService = contextKeyService;
    this.environmentService = environmentService;
    this.authenticationService = authenticationService;
    this.logService = logService;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.layoutService = layoutService;
    this.keybindingService = keybindingService;
    this.hostService = hostService;
    this.markdownRendererService = markdownRendererService;
    this.instantiationService = instantiationService;
    this.sessionsManagementService = sessionsManagementService;
    this.dialogRef = this._register(new MutableDisposable());
    this.watcherRef = this._register(new MutableDisposable());
    this.signInSetupCancellation = this._register(new MutableDisposable());
    this._initialSetupFlow = true;
    /** True while the window is open for a signed-out user via the conditional-auth opt-in. */
    this._proceedingSignedOut = false;
    /**
     * Set once the initial default-account resolution has completed. Until then
     * the synchronous {@link IDefaultAccountService.currentDefaultAccount} snapshot
     * is `null` even for a signed-in user, so a `null` reading means "not known
     * yet", not "signed out". The conditional-auth reaction stays inert until this
     * flips, otherwise it forces a sign-in modal on a signed-in user during the
     * startup gap — one nothing can retire, since the account resolves silently.
     */
    this._accountResolved = false;
    this._waitingForSessionTypes = false;
    this._allowSignedOutWhenUsable = observeAllowSignedOutWhenUsable(this.configurationService);
    this._register(runOnChange(this._allowSignedOutWhenUsable, () => this._onAllowSignedOutWhenUsableChanged()));
    this._register(this.sessionsManagementService.onDidChangeSessionTypes(() => this._onSessionTypesChanged()));
    this._start();
  }
  _onSessionTypesChanged() {
    const signedIn = this.defaultAccountService.currentDefaultAccount !== null;
    if (conditionalAuthState(this._accountResolved, signedIn) === ConditionalAuthState.SignedOut) {
      this._reevaluateSignedOut();
    }
  }
  /**
   * The opt-in was toggled while the window is open. Ignored until the account
   * has resolved (see {@link _accountResolved}) and for signed-in users. For a
   * signed-out user, turning it on retires an already-open sign-in modal (it was
   * raised before the account resolved); turning it off falls back to demanding
   * sign-in.
   */
  _onAllowSignedOutWhenUsableChanged() {
    const signedIn = this.defaultAccountService.currentDefaultAccount !== null;
    if (conditionalAuthState(this._accountResolved, signedIn) !== ConditionalAuthState.SignedOut) {
      return;
    }
    this._reevaluateSignedOut();
  }
  _start() {
    if (!this.productService.defaultChatAgent?.chatExtensionId) {
      this.onCompleted();
      return;
    }
    if (shouldSkipSessionsWelcome(this.environmentService)) {
      this.onCompleted();
      return;
    }
    this.defaultAccountService.getDefaultAccount().then(() => {
      if (this._store.isDisposed) {
        return;
      }
      this._accountResolved = true;
      if (!this._initialSetupFlow && this._allowSignedOutWhenUsable.get()) {
        this._onAllowSignedOutWhenUsableChanged();
      }
    });
    if (isWeb) {
      void this._checkWebAuth().finally(() => this._initialSetupFlow = false);
      this._watchWebAuth();
      return;
    }
    const isFirstLaunch = !this.storageService.getBoolean(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION, false);
    if (isFirstLaunch) {
      void this._showWelcome(true).finally(() => this._initialSetupFlow = false);
    } else {
      void this._watchSignInState().finally(() => this._initialSetupFlow = false);
    }
  }
  async _checkWebAuth() {
    try {
      const sessions = await this.authenticationService.getSessions("github");
      if (sessions.length > 0) {
        this.logService.info("[sessions welcome] GitHub session found on web, skipping welcome");
        this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
        this.onCompleted();
        return;
      }
    } catch {
    }
    this._showWelcome(false);
  }
  _watchWebAuth() {
    this._register(this.authenticationService.onDidChangeSessions(async (e) => {
      if (e.providerId !== "github" || !e.event.removed?.length) {
        return;
      }
      try {
        const remaining = await this.authenticationService.getSessions("github");
        if (remaining.length > 0) {
          return;
        }
      } catch {
      }
      this.logService.info("[sessions welcome] GitHub session removed on web, re-showing welcome");
      this.storageService.remove(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION);
      this._showWelcome(false);
    }));
  }
  async _watchSignInState() {
    const initialAccount = await this.defaultAccountService.getDefaultAccount();
    if (this.dialogRef.value) {
      return;
    }
    if (!initialAccount) {
      const welcomeComplete = this.storageService.getBoolean(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION, false);
      if (welcomeComplete && this._allowSignedOutWhenUsable.get()) {
        await this._proceedWithoutGitHub();
      } else {
        this._showWelcome(false);
      }
      return;
    }
    await this._ensureAIFeaturesEnabled();
    this.onCompleted();
    this.watcherRef.value = this._watchActiveState(true);
  }
  _watchActiveState(signedIn) {
    const disposables = new DisposableStore();
    disposables.add(this.defaultAccountService.onDidChangeDefaultAccount((account) => {
      const nowSignedIn = account !== null;
      if (signedIn && !nowSignedIn) {
        this.storageService.remove(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION);
        this._reevaluateSignedOut();
      } else if (!signedIn && nowSignedIn) {
        this._proceedingSignedOut = false;
      }
      signedIn = nowSignedIn;
    }));
    disposables.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AIDisabledConfig)) {
        if (this.configurationService.getValue(AIDisabledConfig)) {
          this._showAIDisabledDialog();
        } else {
          this.dialogRef.clear();
        }
      }
    }));
    return disposables;
  }
  /**
   * Resolve the window-level signed-out gate from the opt-in and the live auth
   * requirement of every advertised session type.
   */
  _signedOutWindowGate() {
    return resolveSignedOutWindowGate(
      this._allowSignedOutWhenUsable.get(),
      this.sessionsManagementService.getAllProviderSessionTypes().map(({ sessionType }) => sessionType.authRequirement)
    );
  }
  /**
   * Re-run the signed-out decision after an input change: force GitHub sign-in
   * when the gate demands it, otherwise open the window without GitHub. A no-op
   * while a dialog is up — that dialog owns the next transition.
   */
  _reevaluateSignedOut() {
    if (this._initialSetupFlow) {
      return;
    }
    if (this._proceedingSignedOut && this._allowSignedOutWhenUsable.get()) {
      return;
    }
    const gate = this._signedOutWindowGate();
    if (gate === SignedOutWindowGate.Unresolved) {
      this._waitingForSessionTypes = true;
      return;
    }
    if (this._waitingForSessionTypes) {
      this._waitingForSessionTypes = false;
      this.dialogRef.clear();
    }
    if (gate === SignedOutWindowGate.ForceGitHubSignIn) {
      if (this.dialogRef.value) {
        return;
      }
      this._proceedingSignedOut = false;
      void this._showWelcome(false);
    } else {
      this.signInSetupCancellation.value?.cancel();
      this.dialogRef.clear();
      void this._proceedWithoutGitHub();
    }
  }
  /**
   * Open the Agents window for a signed-out user because the opt-in permits it.
   * Mirrors the signed-in completion path and remains active until sign-in or the
   * opt-in changes. Idempotent while already proceeding.
   */
  async _proceedWithoutGitHub() {
    if (this._proceedingSignedOut) {
      return;
    }
    this._proceedingSignedOut = true;
    this.logService.info("[sessions welcome] Proceeding without GitHub sign-in; signed-out operation is enabled");
    await this._ensureAIFeaturesEnabled();
    if (this._store.isDisposed) {
      return;
    }
    this.onCompleted();
    this.watcherRef.value = this._watchActiveState(false);
  }
  async _ensureAIFeaturesEnabled() {
    if (this.configurationService.getValue(AIDisabledConfig)) {
      this.logService.info("[sessions welcome] AI features disabled, enabling");
      await this.configurationService.updateValue(AIDisabledConfig, false);
    }
  }
  async _showAIDisabledDialog() {
    if (this.dialogRef.value) {
      return;
    }
    this.logService.info("[sessions welcome] AI features disabled, showing enable dialog");
    const disposables = new DisposableStore();
    this.dialogRef.value = disposables;
    const welcomeVisibleKey = SessionsWelcomeVisibleContext.bindTo(this.contextKeyService);
    welcomeVisibleKey.set(true);
    disposables.add(toDisposable(() => welcomeVisibleKey.reset()));
    const dialog = disposables.add(new Dialog(
      this.layoutService.activeContainer,
      "",
      [localize("sessions.aiDisabled.enable", "Enable AI Features")],
      createWorkbenchDialogOptions({
        type: "none",
        extraClasses: ["chat-setup-dialog", "sessions-welcome-dialog"],
        detail: localize("sessions.aiDisabled.detail", "Enable AI features to continue using Agents."),
        icon: Codicon.agent,
        alignment: DialogContentsAlignment.Vertical,
        cancelId: 1,
        disableCloseButton: true,
        disableCloseAction: true
      }, this.keybindingService, this.layoutService, this.hostService)
    ));
    const { button } = await dialog.show();
    disposables.dispose();
    this.dialogRef.clear();
    if (button === 0) {
      this.logService.info("[sessions welcome] User chose to enable AI features");
      await this.configurationService.updateValue(AIDisabledConfig, false);
    }
  }
  async _showWelcome(isFirstLaunch) {
    if (this.dialogRef.value) {
      return;
    }
    if (!isFirstLaunch) {
      const gate = this._signedOutWindowGate();
      if (gate === SignedOutWindowGate.Unresolved) {
        this._waitingForSessionTypes = true;
        return;
      }
      if (gate === SignedOutWindowGate.Proceed) {
        await this._proceedWithoutGitHub();
        return;
      }
    }
    this.watcherRef.clear();
    this.dialogRef.value = new DisposableStore();
    const welcomeVisibleKey = SessionsWelcomeVisibleContext.bindTo(this.contextKeyService);
    welcomeVisibleKey.set(true);
    this.dialogRef.value.add(toDisposable(() => welcomeVisibleKey.reset()));
    if (isFirstLaunch) {
      const overlay = this._showLoadingOverlay();
      this.dialogRef.value.add(overlay);
      const account = await this.defaultAccountService.getDefaultAccount();
      if (this._store.isDisposed) {
        return;
      }
      overlay.element.classList.add("sessions-loading-dismissed");
      this.dialogRef.value.add(disposableTimeout(() => overlay.element.remove(), 200));
      if (account) {
        const setupDone = await this.serviceWhenSetupDone();
        if (this._store.isDisposed) {
          return;
        }
        if (setupDone) {
          this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
          this.dialogRef.clear();
          this._watchSignInState();
          return;
        }
        await this._showWelcomeDialog();
      } else {
        const allowContinueWithoutSignIn = this._allowSignedOutWhenUsable.get();
        const continueWithoutSignIn = await this._showSignInDialog(allowContinueWithoutSignIn);
        if (continueWithoutSignIn) {
          this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
          this.serviceMarkDone();
          this.dialogRef.clear();
          await this._proceedWithoutGitHub();
          return;
        }
      }
    } else {
      await this._showSignInDialog();
    }
    this.dialogRef.clear();
    await this._ensureAIFeaturesEnabled();
    this._watchSignInState();
  }
  _showLoadingOverlay() {
    const overlay = append(this.layoutService.mainContainer, $("div.sessions-loading-overlay"));
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-busy", "true");
    overlay.setAttribute("aria-label", localize("loading", "Loading"));
    append(overlay, $("div.sessions-loading-icon.codicon.codicon-agent"));
    return { element: overlay, dispose: () => overlay.remove() };
  }
  async _showSignInDialog(allowContinueWithoutSignIn = false) {
    if (this._initialSetupFlow) {
      this.onInitialSignInDialogShown();
    }
    this.logService.info("[sessions welcome] Showing sign-in dialog");
    const setupCancellation = new CancellationTokenSource();
    this.signInSetupCancellation.value = setupCancellation;
    while (true) {
      const attemptDisposables = new DisposableStore();
      const signingInDialogRef = attemptDisposables.add(new MutableDisposable());
      let canceled = false;
      let continueWithoutSignIn = false;
      const showReturnToVSCodeEditor = !isWeb && await this.commandService.executeCommand(SHOULD_SHOW_RETURN_TO_VSCODE_EDITOR_COMMAND_ID) === true;
      const onContinueWithoutSignIn = () => {
        if (!this._allowSignedOutWhenUsable.get()) {
          return;
        }
        continueWithoutSignIn = true;
        setupCancellation.cancel();
      };
      let success;
      try {
        success = await this.commandService.executeCommand("workbench.action.chat.triggerSetup", void 0, {
          ...createSessionsSignInDialogOptions(this.commandService, showReturnToVSCodeEditor, allowContinueWithoutSignIn, onContinueWithoutSignIn),
          cancellationToken: setupCancellation.token,
          onSignInStarted: (cancel) => {
            signingInDialogRef.value = this.instantiationService.createInstance(SessionsSigningInDialog, () => {
              canceled = true;
              cancel();
            });
          }
        });
      } finally {
        attemptDisposables.dispose();
      }
      if (continueWithoutSignIn) {
        this.logService.info("[sessions welcome] User chose to continue without GitHub sign-in");
        this.signInSetupCancellation.clear();
        return true;
      }
      if (setupCancellation.token.isCancellationRequested) {
        this.logService.info("[sessions welcome] Sign-in dialog retired because another agent became usable");
        this.signInSetupCancellation.clear();
        return false;
      }
      if (canceled) {
        this.logService.info("[sessions welcome] Sign-in canceled; returning to sign-in dialog");
        continue;
      }
      if (success) {
        this.logService.info("[sessions welcome] Sign-in completed successfully");
        this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
        this.serviceMarkDone();
      } else {
        this.logService.info("[sessions welcome] Sign-in was canceled or failed");
      }
      this.signInSetupCancellation.clear();
      return false;
    }
  }
  async _showWelcomeDialog() {
    this.logService.info("[sessions welcome] Showing welcome dialog");
    const disposables = new DisposableStore();
    const productName = localize("walkthrough.productName", "{0} - Agents", this.productService.nameLong);
    const dialog = disposables.add(new Dialog(
      this.layoutService.activeContainer,
      localize("sessions.welcome.title", "Welcome to {0}", productName),
      [localize("sessions.welcome.getStarted", "Get Started")],
      createWorkbenchDialogOptions({
        type: "none",
        extraClasses: ["chat-setup-dialog", "sessions-welcome-dialog", "sessions-main-welcome-dialog"],
        detail: localize("sessions.welcome.detail", "Your AI-powered coding experience where agents explore, build, and iterate with you."),
        icon: Codicon.agent,
        alignment: DialogContentsAlignment.Vertical,
        cancelId: 1,
        disableCloseButton: true,
        renderFooter: (footer) => footer.appendChild(this._createWelcomeFooter(disposables))
      }, this.keybindingService, this.layoutService, this.hostService)
    ));
    await dialog.show();
    disposables.dispose();
    this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
    this.serviceMarkDone();
  }
  _createWelcomeFooter(disposables) {
    const element = $(".chat-setup-dialog-footer");
    const defaultChatAgent = this.productService.defaultChatAgent;
    const providerName = defaultChatAgent?.provider?.default?.name ?? "GitHub";
    const termsUrl = defaultChatAgent?.termsStatementUrl ?? "";
    const privacyUrl = defaultChatAgent?.privacyStatementUrl ?? "";
    const publicCodeUrl = defaultChatAgent?.publicCodeMatchesUrl ?? "";
    const settingsUrl = this.defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings);
    const footer = localize(
      { key: "welcomeFooter", comment: ['{Locked="["}', '{Locked="]({1})"}', '{Locked="]({2})"}', '{Locked="]({4})"}', '{Locked="]({5})"}'] },
      "By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}). {3} Copilot may show [public code]({4}) suggestions and use your data to improve the product. You can change these [settings]({5}) anytime.",
      providerName,
      termsUrl,
      privacyUrl,
      providerName,
      publicCodeUrl,
      settingsUrl
    );
    element.appendChild($("p", void 0, disposables.add(this.markdownRendererService.render(new MarkdownString(footer, { isTrusted: true }))).element));
    return element;
  }
};
SessionsSetUpWidget = __decorateClass([
  __decorateParam(4, IDefaultAccountService),
  __decorateParam(5, IProductService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IWorkbenchEnvironmentService),
  __decorateParam(9, IAuthenticationService),
  __decorateParam(10, ILogService),
  __decorateParam(11, ICommandService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, IWorkbenchLayoutService),
  __decorateParam(14, IKeybindingService),
  __decorateParam(15, IHostService),
  __decorateParam(16, IMarkdownRendererService),
  __decorateParam(17, IInstantiationService),
  __decorateParam(18, ISessionsManagementService)
], SessionsSetUpWidget);
let SessionsSetUpService = class extends Disposable {
  constructor(instantiationService, userDataProfileStorageService, userDataProfilesService, chatEntitlementService, logService) {
    super();
    this.instantiationService = instantiationService;
    this.userDataProfileStorageService = userDataProfileStorageService;
    this.userDataProfilesService = userDataProfilesService;
    this.chatEntitlementService = chatEntitlementService;
    this.logService = logService;
    this._welcomeDoneDeferred = new DeferredPromise();
    this._initialSignInDialogShown = false;
    this._initPromise = this.initialize();
    this._register(this.instantiationService.createInstance(
      SessionsSetUpWidget,
      () => this._welcomeDoneDeferred.complete(),
      () => this.whenSetupDone(),
      () => this.markDone(),
      () => this._initialSignInDialogShown = true
    ));
  }
  get initialSignInDialogShown() {
    return this._initialSignInDialogShown;
  }
  async whenSetupDone() {
    await this._initPromise;
    return this.chatEntitlementService.sentiment.completed === true;
  }
  markDone() {
    this.chatEntitlementService.markSetupCompleted();
  }
  whenWelcomeDone() {
    return this._welcomeDoneDeferred.p;
  }
  async initialize() {
    if (this.chatEntitlementService.sentiment.completed) {
      return;
    }
    try {
      const defaultProfile = this.userDataProfilesService.defaultProfile;
      await this.userDataProfileStorageService.withProfileScopedStorageService(defaultProfile, async (storageService) => {
        const defaultContext = this.instantiationService.createChild(new ServiceCollection([IStorageService, storageService])).createInstance(ChatEntitlementContext);
        try {
          if (defaultContext.state.completed) {
            this.logService.info("[sessions welcome] Setup already completed in default profile, marking done locally");
            this.markDone();
          }
        } finally {
          defaultContext.dispose();
        }
      });
    } catch (error) {
      this.logService.error("[sessions welcome] Failed to read setup state from default profile:", error);
    }
  }
};
SessionsSetUpService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IUserDataProfileStorageService),
  __decorateParam(2, IUserDataProfilesService),
  __decorateParam(3, IChatEntitlementService),
  __decorateParam(4, ILogService)
], SessionsSetUpService);
export {
  ISessionsSetUpService,
  SessionsSetUpService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcYnJvd3Nlclxcc2Vzc2lvbnNTZXRVcFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBydW5PbkNoYW5nZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50Q29udGV4dCwgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEdpdEh1YlBhdGhzLCBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBXRUxDT01FX0NPTVBMRVRFX0tFWSB9IGZyb20gJy4uL2NvbW1vbi93ZWxjb21lLmpzJztcbmltcG9ydCB7IFNlc3Npb25zV2VsY29tZVZpc2libGVDb250ZXh0IH0gZnJvbSAnLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IENvbmRpdGlvbmFsQXV0aFN0YXRlLCBjb25kaXRpb25hbEF1dGhTdGF0ZSwgb2JzZXJ2ZUFsbG93U2lnbmVkT3V0V2hlblVzYWJsZSwgcmVzb2x2ZVNpZ25lZE91dFdpbmRvd0dhdGUsIFNpZ25lZE91dFdpbmRvd0dhdGUgfSBmcm9tICcuL3Nlc3Npb25zQXV0aEdhdGUuanMnO1xuXG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyAkLCBhcHBlbmQgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERpYWxvZywgRGlhbG9nQ29udGVudHNBbGlnbm1lbnQgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZGlhbG9nL2RpYWxvZy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVXb3JrYmVuY2hEaWFsb2dPcHRpb25zIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvZGlhbG9ncy9kaWFsb2cuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTZXNzaW9uc1NpZ25JbkRpYWxvZ09wdGlvbnMsIFNlc3Npb25zU2lnbmluZ0luRGlhbG9nIH0gZnJvbSAnLi9zZXNzaW9uc1NpZ25JbkRpYWxvZy5qcyc7XG5pbXBvcnQgeyBTSE9VTERfU0hPV19SRVRVUk5fVE9fVlNDT0RFX0VESVRPUl9DT01NQU5EX0lEIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25Db21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuXG5jb25zdCBBSURpc2FibGVkQ29uZmlnID0gJ2NoYXQuZGlzYWJsZUFJRmVhdHVyZXMnO1xuXG5leHBvcnQgY29uc3QgSVNlc3Npb25zU2V0VXBTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElTZXNzaW9uc1NldFVwU2VydmljZT4oJ3Nlc3Npb25zU2V0VXBTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25zU2V0VXBTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpbml0aWFsU2lnbkluRGlhbG9nU2hvd246IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB3aGVuIHRoZSB3ZWxjb21lL3NldHVwIGZsb3cgaGFzIGNvbXBsZXRlZCAob3IgaW1tZWRpYXRlbHlcblx0ICogaWYgaXQgaXMgbm90IGN1cnJlbnRseSBhY3RpdmUpLiBVc2UgdGhpcyB0byBkZWZlciB3b3JrIHVudGlsIGFmdGVyXG5cdCAqIHRoZSB1c2VyIGhhcyBmaW5pc2hlZCB0aGUgaW5pdGlhbCBzaWduLWluIG9yIHNldHVwIGRpYWxvZy5cblx0ICovXG5cdHdoZW5XZWxjb21lRG9uZSgpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEludGVybmFsIHdlbGNvbWUgd2lkZ2V0IFx1MjAxNCBvd25zIGFsbCB0aGUgd2VsY29tZSBVSSBsb2dpYy5cbi8vIFJlY2VpdmVzIHNlcnZpY2UgY2FsbGJhY2tzIGFzIGNvbnN0cnVjdG9yIHBhcmFtcyB0byBhdm9pZCBjaXJjdWxhciBpbmplY3Rpb24uXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gc2hvdWxkU2tpcFNlc3Npb25zV2VsY29tZShlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UpOiBib29sZWFuIHtcblx0aWYgKGVudmlyb25tZW50U2VydmljZS5lbmFibGVTbW9rZVRlc3REcml2ZXIpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRjb25zdCBlbnZBcmdzID0gKGVudmlyb25tZW50U2VydmljZSBhcyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlICYgeyBhcmdzPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfSkuYXJncztcblx0aWYgKGVudkFyZ3M/Llsnc2tpcC1zZXNzaW9ucy13ZWxjb21lJ10pIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gdHlwZW9mIGdsb2JhbFRoaXMubG9jYXRpb24gIT09ICd1bmRlZmluZWQnICYmIG5ldyBVUkxTZWFyY2hQYXJhbXMoZ2xvYmFsVGhpcy5sb2NhdGlvbi5zZWFyY2gpLmhhcygnc2tpcC1zZXNzaW9ucy13ZWxjb21lJyk7XG59XG5cbmNsYXNzIFNlc3Npb25zU2V0VXBXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1JlZiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHdhdGNoZXJSZWYgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2lnbkluU2V0dXBDYW5jZWxsYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXHRwcml2YXRlIF9pbml0aWFsU2V0dXBGbG93ID0gdHJ1ZTtcblx0LyoqIFRydWUgd2hpbGUgdGhlIHdpbmRvdyBpcyBvcGVuIGZvciBhIHNpZ25lZC1vdXQgdXNlciB2aWEgdGhlIGNvbmRpdGlvbmFsLWF1dGggb3B0LWluLiAqL1xuXHRwcml2YXRlIF9wcm9jZWVkaW5nU2lnbmVkT3V0ID0gZmFsc2U7XG5cdC8qKlxuXHQgKiBTZXQgb25jZSB0aGUgaW5pdGlhbCBkZWZhdWx0LWFjY291bnQgcmVzb2x1dGlvbiBoYXMgY29tcGxldGVkLiBVbnRpbCB0aGVuXG5cdCAqIHRoZSBzeW5jaHJvbm91cyB7QGxpbmsgSURlZmF1bHRBY2NvdW50U2VydmljZS5jdXJyZW50RGVmYXVsdEFjY291bnR9IHNuYXBzaG90XG5cdCAqIGlzIGBudWxsYCBldmVuIGZvciBhIHNpZ25lZC1pbiB1c2VyLCBzbyBhIGBudWxsYCByZWFkaW5nIG1lYW5zIFwibm90IGtub3duXG5cdCAqIHlldFwiLCBub3QgXCJzaWduZWQgb3V0XCIuIFRoZSBjb25kaXRpb25hbC1hdXRoIHJlYWN0aW9uIHN0YXlzIGluZXJ0IHVudGlsIHRoaXNcblx0ICogZmxpcHMsIG90aGVyd2lzZSBpdCBmb3JjZXMgYSBzaWduLWluIG1vZGFsIG9uIGEgc2lnbmVkLWluIHVzZXIgZHVyaW5nIHRoZVxuXHQgKiBzdGFydHVwIGdhcCBcdTIwMTQgb25lIG5vdGhpbmcgY2FuIHJldGlyZSwgc2luY2UgdGhlIGFjY291bnQgcmVzb2x2ZXMgc2lsZW50bHkuXG5cdCAqL1xuXHRwcml2YXRlIF9hY2NvdW50UmVzb2x2ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfd2FpdGluZ0ZvclNlc3Npb25UeXBlcyA9IGZhbHNlO1xuXHQvKiogV2hldGhlciB0aGUgd2luZG93IG1heSBwcm9jZWVkIHdpdGhvdXQgR2l0SHViIHNpZ24taW4uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FsbG93U2lnbmVkT3V0V2hlblVzYWJsZTogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0Ly8gTm9uLXNlcnZpY2UgcGFyYW1zIG11c3QgY29tZSBiZWZvcmUgQC1kZWNvcmF0ZWQgc2VydmljZSBwYXJhbXNcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvbkNvbXBsZXRlZDogKCkgPT4gdm9pZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNlcnZpY2VXaGVuU2V0dXBEb25lOiAoKSA9PiBQcm9taXNlPGJvb2xlYW4+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2VydmljZU1hcmtEb25lOiAoKSA9PiB2b2lkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb25Jbml0aWFsU2lnbkluRGlhbG9nU2hvd246ICgpID0+IHZvaWQsXG5cdFx0QElEZWZhdWx0QWNjb3VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fYWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlID0gb2JzZXJ2ZUFsbG93U2lnbmVkT3V0V2hlblVzYWJsZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihydW5PbkNoYW5nZSh0aGlzLl9hbGxvd1NpZ25lZE91dFdoZW5Vc2FibGUsICgpID0+IHRoaXMuX29uQWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlQ2hhbmdlZCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzKCgpID0+IHRoaXMuX29uU2Vzc2lvblR5cGVzQ2hhbmdlZCgpKSk7XG5cdFx0dGhpcy5fc3RhcnQoKTtcblx0fVxuXG5cdHByaXZhdGUgX29uU2Vzc2lvblR5cGVzQ2hhbmdlZCgpOiB2b2lkIHtcblx0XHRjb25zdCBzaWduZWRJbiA9IHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLmN1cnJlbnREZWZhdWx0QWNjb3VudCAhPT0gbnVsbDtcblx0XHRpZiAoY29uZGl0aW9uYWxBdXRoU3RhdGUodGhpcy5fYWNjb3VudFJlc29sdmVkLCBzaWduZWRJbikgPT09IENvbmRpdGlvbmFsQXV0aFN0YXRlLlNpZ25lZE91dCkge1xuXHRcdFx0dGhpcy5fcmVldmFsdWF0ZVNpZ25lZE91dCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgb3B0LWluIHdhcyB0b2dnbGVkIHdoaWxlIHRoZSB3aW5kb3cgaXMgb3Blbi4gSWdub3JlZCB1bnRpbCB0aGUgYWNjb3VudFxuXHQgKiBoYXMgcmVzb2x2ZWQgKHNlZSB7QGxpbmsgX2FjY291bnRSZXNvbHZlZH0pIGFuZCBmb3Igc2lnbmVkLWluIHVzZXJzLiBGb3IgYVxuXHQgKiBzaWduZWQtb3V0IHVzZXIsIHR1cm5pbmcgaXQgb24gcmV0aXJlcyBhbiBhbHJlYWR5LW9wZW4gc2lnbi1pbiBtb2RhbCAoaXQgd2FzXG5cdCAqIHJhaXNlZCBiZWZvcmUgdGhlIGFjY291bnQgcmVzb2x2ZWQpOyB0dXJuaW5nIGl0IG9mZiBmYWxscyBiYWNrIHRvIGRlbWFuZGluZ1xuXHQgKiBzaWduLWluLlxuXHQgKi9cblx0cHJpdmF0ZSBfb25BbGxvd1NpZ25lZE91dFdoZW5Vc2FibGVDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdC8vIE9ubHkgYWN0IG9uY2UgdGhlIGFjY291bnQgaGFzIHJlc29sdmVkIEFORCB0aGUgdXNlciBpcyBzaWduZWQgb3V0OyB3aGlsZVxuXHRcdC8vIHVucmVzb2x2ZWQgb3Igc2lnbmVkIGluLCB0aGUgc2lnbi1pbiB3YXRjaCBvd25zIHRoZSBkZWNpc2lvbi5cblx0XHRjb25zdCBzaWduZWRJbiA9IHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLmN1cnJlbnREZWZhdWx0QWNjb3VudCAhPT0gbnVsbDtcblx0XHRpZiAoY29uZGl0aW9uYWxBdXRoU3RhdGUodGhpcy5fYWNjb3VudFJlc29sdmVkLCBzaWduZWRJbikgIT09IENvbmRpdGlvbmFsQXV0aFN0YXRlLlNpZ25lZE91dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZWV2YWx1YXRlU2lnbmVkT3V0KCk7XG5cdH1cblxuXHRwcml2YXRlIF9zdGFydCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8uY2hhdEV4dGVuc2lvbklkKSB7XG5cdFx0XHR0aGlzLm9uQ29tcGxldGVkKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHNob3VsZFNraXBTZXNzaW9uc1dlbGNvbWUodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UpKSB7XG5cdFx0XHR0aGlzLm9uQ29tcGxldGVkKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTGVhcm4gd2hlbiB0aGUgZGVmYXVsdCBhY2NvdW50IHJlc29sdmVzIHNvIHRoZSBjb25kaXRpb25hbC1hdXRoIHJlYWN0aW9uXG5cdFx0Ly8gY2FuIHRlbGwgXCJzaWduZWQgb3V0XCIgZnJvbSBcIm5vdCByZXNvbHZlZCB5ZXRcIi4gT24gZmlyc3QgbG9hZCB0aGUgYWNjb3VudFxuXHRcdC8vIGlzIHBvcHVsYXRlZCBzaWxlbnRseSAobm8gY2hhbmdlIGV2ZW50IGZpcmVzKSwgc28gYXdhaXRpbmcgaXQgb25jZSBpcyB0aGVcblx0XHQvLyBvbmx5IHNpZ25hbCB0aGF0IHJlc29sdXRpb24gaGFzIGhhcHBlbmVkLlxuXHRcdHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLmdldERlZmF1bHRBY2NvdW50KCkudGhlbigoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9hY2NvdW50UmVzb2x2ZWQgPSB0cnVlO1xuXHRcdFx0Ly8gVGhlIGluaXRpYWwgc2V0dXAgZmxvdyByZS1yZWFkcyB0aGUgc2V0dGluZyBhZnRlciB0aGlzIGFjY291bnQgcHJvbWlzZS5cblx0XHRcdGlmICghdGhpcy5faW5pdGlhbFNldHVwRmxvdyAmJiB0aGlzLl9hbGxvd1NpZ25lZE91dFdoZW5Vc2FibGUuZ2V0KCkpIHtcblx0XHRcdFx0dGhpcy5fb25BbGxvd1NpZ25lZE91dFdoZW5Vc2FibGVDaGFuZ2VkKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdHZvaWQgdGhpcy5fY2hlY2tXZWJBdXRoKCkuZmluYWxseSgoKSA9PiB0aGlzLl9pbml0aWFsU2V0dXBGbG93ID0gZmFsc2UpO1xuXHRcdFx0dGhpcy5fd2F0Y2hXZWJBdXRoKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNGaXJzdExhdW5jaCA9ICF0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oV0VMQ09NRV9DT01QTEVURV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpO1xuXG5cdFx0aWYgKGlzRmlyc3RMYXVuY2gpIHtcblx0XHRcdHZvaWQgdGhpcy5fc2hvd1dlbGNvbWUodHJ1ZSkuZmluYWxseSgoKSA9PiB0aGlzLl9pbml0aWFsU2V0dXBGbG93ID0gZmFsc2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2b2lkIHRoaXMuX3dhdGNoU2lnbkluU3RhdGUoKS5maW5hbGx5KCgpID0+IHRoaXMuX2luaXRpYWxTZXR1cEZsb3cgPSBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY2hlY2tXZWJBdXRoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKCdnaXRodWInKTtcblx0XHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbc2Vzc2lvbnMgd2VsY29tZV0gR2l0SHViIHNlc3Npb24gZm91bmQgb24gd2ViLCBza2lwcGluZyB3ZWxjb21lJyk7XG5cdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoV0VMQ09NRV9DT01QTEVURV9LRVksIHRydWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdFx0dGhpcy5vbkNvbXBsZXRlZCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBQcm92aWRlciBub3QgYXZhaWxhYmxlIHlldCBcdTIwMTQgc2hvdyBkaWFsb2dcblx0XHR9XG5cdFx0dGhpcy5fc2hvd1dlbGNvbWUoZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2F0Y2hXZWJBdXRoKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoYXN5bmMgZSA9PiB7XG5cdFx0XHRpZiAoZS5wcm92aWRlcklkICE9PSAnZ2l0aHViJyB8fCAhZS5ldmVudC5yZW1vdmVkPy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVtYWluaW5nID0gYXdhaXQgdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMoJ2dpdGh1YicpO1xuXHRcdFx0XHRpZiAocmVtYWluaW5nLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBQcm92aWRlciBiZWNhbWUgdW5hdmFpbGFibGUgXHUyMDE0IHRyZWF0IGFzIHNpZ25lZCBvdXRcblx0XHRcdH1cblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbc2Vzc2lvbnMgd2VsY29tZV0gR2l0SHViIHNlc3Npb24gcmVtb3ZlZCBvbiB3ZWIsIHJlLXNob3dpbmcgd2VsY29tZScpO1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoV0VMQ09NRV9DT01QTEVURV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHR0aGlzLl9zaG93V2VsY29tZShmYWxzZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfd2F0Y2hTaWduSW5TdGF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbml0aWFsQWNjb3VudCA9IGF3YWl0IHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLmdldERlZmF1bHRBY2NvdW50KCk7XG5cdFx0aWYgKHRoaXMuZGlhbG9nUmVmLnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghaW5pdGlhbEFjY291bnQpIHtcblx0XHRcdGNvbnN0IHdlbGNvbWVDb21wbGV0ZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihXRUxDT01FX0NPTVBMRVRFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBmYWxzZSk7XG5cdFx0XHRpZiAod2VsY29tZUNvbXBsZXRlICYmIHRoaXMuX2FsbG93U2lnbmVkT3V0V2hlblVzYWJsZS5nZXQoKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9wcm9jZWVkV2l0aG91dEdpdEh1YigpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fc2hvd1dlbGNvbWUoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9lbnN1cmVBSUZlYXR1cmVzRW5hYmxlZCgpO1xuXHRcdHRoaXMub25Db21wbGV0ZWQoKTtcblx0XHR0aGlzLndhdGNoZXJSZWYudmFsdWUgPSB0aGlzLl93YXRjaEFjdGl2ZVN0YXRlKHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2F0Y2hBY3RpdmVTdGF0ZShzaWduZWRJbjogYm9vbGVhbik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50KGFjY291bnQgPT4ge1xuXHRcdFx0Y29uc3Qgbm93U2lnbmVkSW4gPSBhY2NvdW50ICE9PSBudWxsO1xuXHRcdFx0aWYgKHNpZ25lZEluICYmICFub3dTaWduZWRJbikge1xuXHRcdFx0XHQvLyBTaWduZWQgb3V0OiBkcm9wIHRoZSBjb21wbGV0aW9uIG1hcmtlciBhbmQgcmUtY29uc3VsdCB0aGUgZ2F0ZS5cblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoV0VMQ09NRV9DT01QTEVURV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHRcdHRoaXMuX3JlZXZhbHVhdGVTaWduZWRPdXQoKTtcblx0XHRcdH0gZWxzZSBpZiAoIXNpZ25lZEluICYmIG5vd1NpZ25lZEluKSB7XG5cdFx0XHRcdC8vIFNpZ25lZCBpbiB3aGlsZSBydW5uaW5nIHNpZ25lZC1vdXQ6IHRoZSB3aW5kb3cgaXMgYWxyZWFkeSBvcGVuLlxuXHRcdFx0XHR0aGlzLl9wcm9jZWVkaW5nU2lnbmVkT3V0ID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRzaWduZWRJbiA9IG5vd1NpZ25lZEluO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKEFJRGlzYWJsZWRDb25maWcpKSB7XG5cdFx0XHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFJRGlzYWJsZWRDb25maWcpKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2hvd0FJRGlzYWJsZWREaWFsb2coKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBBSSBmZWF0dXJlcyByZS1lbmFibGVkIFx1MjAxNCBkaXNtaXNzIGFueSBBSSBkaXNhYmxlZCBkaWFsb2dcblx0XHRcdFx0XHR0aGlzLmRpYWxvZ1JlZi5jbGVhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgdGhlIHdpbmRvdy1sZXZlbCBzaWduZWQtb3V0IGdhdGUgZnJvbSB0aGUgb3B0LWluIGFuZCB0aGUgbGl2ZSBhdXRoXG5cdCAqIHJlcXVpcmVtZW50IG9mIGV2ZXJ5IGFkdmVydGlzZWQgc2Vzc2lvbiB0eXBlLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2lnbmVkT3V0V2luZG93R2F0ZSgpOiBTaWduZWRPdXRXaW5kb3dHYXRlIHtcblx0XHRyZXR1cm4gcmVzb2x2ZVNpZ25lZE91dFdpbmRvd0dhdGUoXG5cdFx0XHR0aGlzLl9hbGxvd1NpZ25lZE91dFdoZW5Vc2FibGUuZ2V0KCksXG5cdFx0XHR0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0QWxsUHJvdmlkZXJTZXNzaW9uVHlwZXMoKS5tYXAoKHsgc2Vzc2lvblR5cGUgfSkgPT4gc2Vzc2lvblR5cGUuYXV0aFJlcXVpcmVtZW50KSxcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLXJ1biB0aGUgc2lnbmVkLW91dCBkZWNpc2lvbiBhZnRlciBhbiBpbnB1dCBjaGFuZ2U6IGZvcmNlIEdpdEh1YiBzaWduLWluXG5cdCAqIHdoZW4gdGhlIGdhdGUgZGVtYW5kcyBpdCwgb3RoZXJ3aXNlIG9wZW4gdGhlIHdpbmRvdyB3aXRob3V0IEdpdEh1Yi4gQSBuby1vcFxuXHQgKiB3aGlsZSBhIGRpYWxvZyBpcyB1cCBcdTIwMTQgdGhhdCBkaWFsb2cgb3ducyB0aGUgbmV4dCB0cmFuc2l0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVldmFsdWF0ZVNpZ25lZE91dCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faW5pdGlhbFNldHVwRmxvdykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fcHJvY2VlZGluZ1NpZ25lZE91dCAmJiB0aGlzLl9hbGxvd1NpZ25lZE91dFdoZW5Vc2FibGUuZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZ2F0ZSA9IHRoaXMuX3NpZ25lZE91dFdpbmRvd0dhdGUoKTtcblx0XHRpZiAoZ2F0ZSA9PT0gU2lnbmVkT3V0V2luZG93R2F0ZS5VbnJlc29sdmVkKSB7XG5cdFx0XHR0aGlzLl93YWl0aW5nRm9yU2Vzc2lvblR5cGVzID0gdHJ1ZTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3dhaXRpbmdGb3JTZXNzaW9uVHlwZXMpIHtcblx0XHRcdHRoaXMuX3dhaXRpbmdGb3JTZXNzaW9uVHlwZXMgPSBmYWxzZTtcblx0XHRcdHRoaXMuZGlhbG9nUmVmLmNsZWFyKCk7XG5cdFx0fVxuXHRcdGlmIChnYXRlID09PSBTaWduZWRPdXRXaW5kb3dHYXRlLkZvcmNlR2l0SHViU2lnbkluKSB7XG5cdFx0XHRpZiAodGhpcy5kaWFsb2dSZWYudmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcHJvY2VlZGluZ1NpZ25lZE91dCA9IGZhbHNlO1xuXHRcdFx0dm9pZCB0aGlzLl9zaG93V2VsY29tZShmYWxzZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2lnbkluU2V0dXBDYW5jZWxsYXRpb24udmFsdWU/LmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5kaWFsb2dSZWYuY2xlYXIoKTtcblx0XHRcdHZvaWQgdGhpcy5fcHJvY2VlZFdpdGhvdXRHaXRIdWIoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogT3BlbiB0aGUgQWdlbnRzIHdpbmRvdyBmb3IgYSBzaWduZWQtb3V0IHVzZXIgYmVjYXVzZSB0aGUgb3B0LWluIHBlcm1pdHMgaXQuXG5cdCAqIE1pcnJvcnMgdGhlIHNpZ25lZC1pbiBjb21wbGV0aW9uIHBhdGggYW5kIHJlbWFpbnMgYWN0aXZlIHVudGlsIHNpZ24taW4gb3IgdGhlXG5cdCAqIG9wdC1pbiBjaGFuZ2VzLiBJZGVtcG90ZW50IHdoaWxlIGFscmVhZHkgcHJvY2VlZGluZy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Byb2NlZWRXaXRob3V0R2l0SHViKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9wcm9jZWVkaW5nU2lnbmVkT3V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Byb2NlZWRpbmdTaWduZWRPdXQgPSB0cnVlO1xuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbc2Vzc2lvbnMgd2VsY29tZV0gUHJvY2VlZGluZyB3aXRob3V0IEdpdEh1YiBzaWduLWluOyBzaWduZWQtb3V0IG9wZXJhdGlvbiBpcyBlbmFibGVkJyk7XG5cdFx0YXdhaXQgdGhpcy5fZW5zdXJlQUlGZWF0dXJlc0VuYWJsZWQoKTtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLm9uQ29tcGxldGVkKCk7XG5cdFx0dGhpcy53YXRjaGVyUmVmLnZhbHVlID0gdGhpcy5fd2F0Y2hBY3RpdmVTdGF0ZShmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9lbnN1cmVBSUZlYXR1cmVzRW5hYmxlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBSURpc2FibGVkQ29uZmlnKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tzZXNzaW9ucyB3ZWxjb21lXSBBSSBmZWF0dXJlcyBkaXNhYmxlZCwgZW5hYmxpbmcnKTtcblx0XHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQUlEaXNhYmxlZENvbmZpZywgZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Nob3dBSURpc2FibGVkRGlhbG9nKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmRpYWxvZ1JlZi52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbc2Vzc2lvbnMgd2VsY29tZV0gQUkgZmVhdHVyZXMgZGlzYWJsZWQsIHNob3dpbmcgZW5hYmxlIGRpYWxvZycpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5kaWFsb2dSZWYudmFsdWUgPSBkaXNwb3NhYmxlcztcblxuXHRcdGNvbnN0IHdlbGNvbWVWaXNpYmxlS2V5ID0gU2Vzc2lvbnNXZWxjb21lVmlzaWJsZUNvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHdlbGNvbWVWaXNpYmxlS2V5LnNldCh0cnVlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHdlbGNvbWVWaXNpYmxlS2V5LnJlc2V0KCkpKTtcblxuXHRcdGNvbnN0IGRpYWxvZyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlhbG9nKFxuXHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lcixcblx0XHRcdCcnLFxuXHRcdFx0W2xvY2FsaXplKCdzZXNzaW9ucy5haURpc2FibGVkLmVuYWJsZScsIFwiRW5hYmxlIEFJIEZlYXR1cmVzXCIpXSxcblx0XHRcdGNyZWF0ZVdvcmtiZW5jaERpYWxvZ09wdGlvbnMoe1xuXHRcdFx0XHR0eXBlOiAnbm9uZScsXG5cdFx0XHRcdGV4dHJhQ2xhc3NlczogWydjaGF0LXNldHVwLWRpYWxvZycsICdzZXNzaW9ucy13ZWxjb21lLWRpYWxvZyddLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdzZXNzaW9ucy5haURpc2FibGVkLmRldGFpbCcsIFwiRW5hYmxlIEFJIGZlYXR1cmVzIHRvIGNvbnRpbnVlIHVzaW5nIEFnZW50cy5cIiksXG5cdFx0XHRcdGljb246IENvZGljb24uYWdlbnQsXG5cdFx0XHRcdGFsaWdubWVudDogRGlhbG9nQ29udGVudHNBbGlnbm1lbnQuVmVydGljYWwsXG5cdFx0XHRcdGNhbmNlbElkOiAxLFxuXHRcdFx0XHRkaXNhYmxlQ2xvc2VCdXR0b246IHRydWUsXG5cdFx0XHRcdGRpc2FibGVDbG9zZUFjdGlvbjogdHJ1ZSxcblx0XHRcdH0sIHRoaXMua2V5YmluZGluZ1NlcnZpY2UsIHRoaXMubGF5b3V0U2VydmljZSwgdGhpcy5ob3N0U2VydmljZSlcblx0XHQpKTtcblxuXHRcdGNvbnN0IHsgYnV0dG9uIH0gPSBhd2FpdCBkaWFsb2cuc2hvdygpO1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmRpYWxvZ1JlZi5jbGVhcigpO1xuXG5cdFx0aWYgKGJ1dHRvbiA9PT0gMCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tzZXNzaW9ucyB3ZWxjb21lXSBVc2VyIGNob3NlIHRvIGVuYWJsZSBBSSBmZWF0dXJlcycpO1xuXHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShBSURpc2FibGVkQ29uZmlnLCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2hvd1dlbGNvbWUoaXNGaXJzdExhdW5jaDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmRpYWxvZ1JlZi52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEEgbm9uLWZpcnN0LWxhdW5jaCBfc2hvd1dlbGNvbWUgbWVhbnMgdGhlIHVzZXIgaXMgc2lnbmVkIG91dC4gQ29uc3VsdCB0aGVcblx0XHQvLyBsYXN0LXJlc29ydCBHaXRIdWIgZ2F0ZSBiZWZvcmUgZm9yY2luZyBzaWduLWluOiB3aXRoIHRoZSBvcHQtaW4gb24sIG9wZW5cblx0XHQvLyB0aGUgd2luZG93IGluc3RlYWQuXG5cdFx0aWYgKCFpc0ZpcnN0TGF1bmNoKSB7XG5cdFx0XHRjb25zdCBnYXRlID0gdGhpcy5fc2lnbmVkT3V0V2luZG93R2F0ZSgpO1xuXHRcdFx0aWYgKGdhdGUgPT09IFNpZ25lZE91dFdpbmRvd0dhdGUuVW5yZXNvbHZlZCkge1xuXHRcdFx0XHR0aGlzLl93YWl0aW5nRm9yU2Vzc2lvblR5cGVzID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGdhdGUgPT09IFNpZ25lZE91dFdpbmRvd0dhdGUuUHJvY2VlZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9wcm9jZWVkV2l0aG91dEdpdEh1YigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy53YXRjaGVyUmVmLmNsZWFyKCk7XG5cdFx0dGhpcy5kaWFsb2dSZWYudmFsdWUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCB3ZWxjb21lVmlzaWJsZUtleSA9IFNlc3Npb25zV2VsY29tZVZpc2libGVDb250ZXh0LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR3ZWxjb21lVmlzaWJsZUtleS5zZXQodHJ1ZSk7XG5cdFx0dGhpcy5kaWFsb2dSZWYudmFsdWUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB3ZWxjb21lVmlzaWJsZUtleS5yZXNldCgpKSk7XG5cblx0XHRpZiAoaXNGaXJzdExhdW5jaCkge1xuXHRcdFx0Y29uc3Qgb3ZlcmxheSA9IHRoaXMuX3Nob3dMb2FkaW5nT3ZlcmxheSgpO1xuXHRcdFx0dGhpcy5kaWFsb2dSZWYudmFsdWUuYWRkKG92ZXJsYXkpO1xuXG5cdFx0XHRjb25zdCBhY2NvdW50ID0gYXdhaXQgdGhpcy5kZWZhdWx0QWNjb3VudFNlcnZpY2UuZ2V0RGVmYXVsdEFjY291bnQoKTtcblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdG92ZXJsYXkuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdzZXNzaW9ucy1sb2FkaW5nLWRpc21pc3NlZCcpO1xuXHRcdFx0dGhpcy5kaWFsb2dSZWYudmFsdWUuYWRkKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IG92ZXJsYXkuZWxlbWVudC5yZW1vdmUoKSwgMjAwKSk7XG5cblx0XHRcdGlmIChhY2NvdW50KSB7XG5cdFx0XHRcdGNvbnN0IHNldHVwRG9uZSA9IGF3YWl0IHRoaXMuc2VydmljZVdoZW5TZXR1cERvbmUoKTtcblx0XHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoc2V0dXBEb25lKSB7XG5cdFx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShXRUxDT01FX0NPTVBMRVRFX0tFWSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0XHRcdHRoaXMuZGlhbG9nUmVmLmNsZWFyKCk7XG5cdFx0XHRcdFx0dGhpcy5fd2F0Y2hTaWduSW5TdGF0ZSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Nob3dXZWxjb21lRGlhbG9nKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBhbGxvd0NvbnRpbnVlV2l0aG91dFNpZ25JbiA9IHRoaXMuX2FsbG93U2lnbmVkT3V0V2hlblVzYWJsZS5nZXQoKTtcblx0XHRcdFx0Y29uc3QgY29udGludWVXaXRob3V0U2lnbkluID0gYXdhaXQgdGhpcy5fc2hvd1NpZ25JbkRpYWxvZyhhbGxvd0NvbnRpbnVlV2l0aG91dFNpZ25Jbik7XG5cdFx0XHRcdGlmIChjb250aW51ZVdpdGhvdXRTaWduSW4pIHtcblx0XHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFdFTENPTUVfQ09NUExFVEVfS0VZLCB0cnVlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHRcdFx0dGhpcy5zZXJ2aWNlTWFya0RvbmUoKTtcblx0XHRcdFx0XHR0aGlzLmRpYWxvZ1JlZi5jbGVhcigpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Byb2NlZWRXaXRob3V0R2l0SHViKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Nob3dTaWduSW5EaWFsb2coKTtcblx0XHR9XG5cblx0XHR0aGlzLmRpYWxvZ1JlZi5jbGVhcigpO1xuXHRcdGF3YWl0IHRoaXMuX2Vuc3VyZUFJRmVhdHVyZXNFbmFibGVkKCk7XG5cdFx0dGhpcy5fd2F0Y2hTaWduSW5TdGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0xvYWRpbmdPdmVybGF5KCk6IHsgZWxlbWVudDogSFRNTEVsZW1lbnQgfSAmIElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBvdmVybGF5ID0gYXBwZW5kKHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyLCAkKCdkaXYuc2Vzc2lvbnMtbG9hZGluZy1vdmVybGF5JykpO1xuXHRcdG92ZXJsYXkuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3N0YXR1cycpO1xuXHRcdG92ZXJsYXkuc2V0QXR0cmlidXRlKCdhcmlhLWJ1c3knLCAndHJ1ZScpO1xuXHRcdG92ZXJsYXkuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2xvYWRpbmcnLCBcIkxvYWRpbmdcIikpO1xuXHRcdGFwcGVuZChvdmVybGF5LCAkKCdkaXYuc2Vzc2lvbnMtbG9hZGluZy1pY29uLmNvZGljb24uY29kaWNvbi1hZ2VudCcpKTtcblx0XHRyZXR1cm4geyBlbGVtZW50OiBvdmVybGF5LCBkaXNwb3NlOiAoKSA9PiBvdmVybGF5LnJlbW92ZSgpIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zaG93U2lnbkluRGlhbG9nKGFsbG93Q29udGludWVXaXRob3V0U2lnbkluID0gZmFsc2UpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAodGhpcy5faW5pdGlhbFNldHVwRmxvdykge1xuXHRcdFx0dGhpcy5vbkluaXRpYWxTaWduSW5EaWFsb2dTaG93bigpO1xuXHRcdH1cblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnW3Nlc3Npb25zIHdlbGNvbWVdIFNob3dpbmcgc2lnbi1pbiBkaWFsb2cnKTtcblxuXHRcdGNvbnN0IHNldHVwQ2FuY2VsbGF0aW9uID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5zaWduSW5TZXR1cENhbmNlbGxhdGlvbi52YWx1ZSA9IHNldHVwQ2FuY2VsbGF0aW9uO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRjb25zdCBhdHRlbXB0RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBzaWduaW5nSW5EaWFsb2dSZWYgPSBhdHRlbXB0RGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxTZXNzaW9uc1NpZ25pbmdJbkRpYWxvZz4oKSk7XG5cdFx0XHRsZXQgY2FuY2VsZWQgPSBmYWxzZTtcblx0XHRcdGxldCBjb250aW51ZVdpdGhvdXRTaWduSW4gPSBmYWxzZTtcblx0XHRcdGNvbnN0IHNob3dSZXR1cm5Ub1ZTQ29kZUVkaXRvciA9ICFpc1dlYiAmJiAoYXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxib29sZWFuPihTSE9VTERfU0hPV19SRVRVUk5fVE9fVlNDT0RFX0VESVRPUl9DT01NQU5EX0lEKSkgPT09IHRydWU7XG5cdFx0XHRjb25zdCBvbkNvbnRpbnVlV2l0aG91dFNpZ25JbiA9ICgpID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLl9hbGxvd1NpZ25lZE91dFdoZW5Vc2FibGUuZ2V0KCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWVXaXRob3V0U2lnbkluID0gdHJ1ZTtcblx0XHRcdFx0c2V0dXBDYW5jZWxsYXRpb24uY2FuY2VsKCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRsZXQgc3VjY2VzczogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPGJvb2xlYW4+KCd3b3JrYmVuY2guYWN0aW9uLmNoYXQudHJpZ2dlclNldHVwJywgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdFx0Li4uY3JlYXRlU2Vzc2lvbnNTaWduSW5EaWFsb2dPcHRpb25zKHRoaXMuY29tbWFuZFNlcnZpY2UsIHNob3dSZXR1cm5Ub1ZTQ29kZUVkaXRvciwgYWxsb3dDb250aW51ZVdpdGhvdXRTaWduSW4sIG9uQ29udGludWVXaXRob3V0U2lnbkluKSxcblx0XHRcdFx0XHRjYW5jZWxsYXRpb25Ub2tlbjogc2V0dXBDYW5jZWxsYXRpb24udG9rZW4sXG5cdFx0XHRcdFx0b25TaWduSW5TdGFydGVkOiAoY2FuY2VsOiAoKSA9PiB2b2lkKSA9PiB7XG5cdFx0XHRcdFx0XHRzaWduaW5nSW5EaWFsb2dSZWYudmFsdWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zU2lnbmluZ0luRGlhbG9nLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNhbmNlbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0Y2FuY2VsKCk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXR0ZW1wdERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdGlmIChjb250aW51ZVdpdGhvdXRTaWduSW4pIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tzZXNzaW9ucyB3ZWxjb21lXSBVc2VyIGNob3NlIHRvIGNvbnRpbnVlIHdpdGhvdXQgR2l0SHViIHNpZ24taW4nKTtcblx0XHRcdFx0dGhpcy5zaWduSW5TZXR1cENhbmNlbGxhdGlvbi5jbGVhcigpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChzZXR1cENhbmNlbGxhdGlvbi50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnW3Nlc3Npb25zIHdlbGNvbWVdIFNpZ24taW4gZGlhbG9nIHJldGlyZWQgYmVjYXVzZSBhbm90aGVyIGFnZW50IGJlY2FtZSB1c2FibGUnKTtcblx0XHRcdFx0dGhpcy5zaWduSW5TZXR1cENhbmNlbGxhdGlvbi5jbGVhcigpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjYW5jZWxlZCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnW3Nlc3Npb25zIHdlbGNvbWVdIFNpZ24taW4gY2FuY2VsZWQ7IHJldHVybmluZyB0byBzaWduLWluIGRpYWxvZycpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHN1Y2Nlc3MpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tzZXNzaW9ucyB3ZWxjb21lXSBTaWduLWluIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknKTtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShXRUxDT01FX0NPTVBMRVRFX0tFWSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0XHR0aGlzLnNlcnZpY2VNYXJrRG9uZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tzZXNzaW9ucyB3ZWxjb21lXSBTaWduLWluIHdhcyBjYW5jZWxlZCBvciBmYWlsZWQnKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuc2lnbkluU2V0dXBDYW5jZWxsYXRpb24uY2xlYXIoKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zaG93V2VsY29tZURpYWxvZygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnW3Nlc3Npb25zIHdlbGNvbWVdIFNob3dpbmcgd2VsY29tZSBkaWFsb2cnKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHByb2R1Y3ROYW1lID0gbG9jYWxpemUoJ3dhbGt0aHJvdWdoLnByb2R1Y3ROYW1lJywgXCJ7MH0gLSBBZ2VudHNcIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZyk7XG5cblx0XHRjb25zdCBkaWFsb2cgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpYWxvZyhcblx0XHRcdHRoaXMubGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXIsXG5cdFx0XHRsb2NhbGl6ZSgnc2Vzc2lvbnMud2VsY29tZS50aXRsZScsIFwiV2VsY29tZSB0byB7MH1cIiwgcHJvZHVjdE5hbWUpLFxuXHRcdFx0W2xvY2FsaXplKCdzZXNzaW9ucy53ZWxjb21lLmdldFN0YXJ0ZWQnLCBcIkdldCBTdGFydGVkXCIpXSxcblx0XHRcdGNyZWF0ZVdvcmtiZW5jaERpYWxvZ09wdGlvbnMoe1xuXHRcdFx0XHR0eXBlOiAnbm9uZScsXG5cdFx0XHRcdGV4dHJhQ2xhc3NlczogWydjaGF0LXNldHVwLWRpYWxvZycsICdzZXNzaW9ucy13ZWxjb21lLWRpYWxvZycsICdzZXNzaW9ucy1tYWluLXdlbGNvbWUtZGlhbG9nJ10sXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3Nlc3Npb25zLndlbGNvbWUuZGV0YWlsJywgXCJZb3VyIEFJLXBvd2VyZWQgY29kaW5nIGV4cGVyaWVuY2Ugd2hlcmUgYWdlbnRzIGV4cGxvcmUsIGJ1aWxkLCBhbmQgaXRlcmF0ZSB3aXRoIHlvdS5cIiksXG5cdFx0XHRcdGljb246IENvZGljb24uYWdlbnQsXG5cdFx0XHRcdGFsaWdubWVudDogRGlhbG9nQ29udGVudHNBbGlnbm1lbnQuVmVydGljYWwsXG5cdFx0XHRcdGNhbmNlbElkOiAxLFxuXHRcdFx0XHRkaXNhYmxlQ2xvc2VCdXR0b246IHRydWUsXG5cdFx0XHRcdHJlbmRlckZvb3RlcjogZm9vdGVyID0+IGZvb3Rlci5hcHBlbmRDaGlsZCh0aGlzLl9jcmVhdGVXZWxjb21lRm9vdGVyKGRpc3Bvc2FibGVzKSksXG5cdFx0XHR9LCB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLmxheW91dFNlcnZpY2UsIHRoaXMuaG9zdFNlcnZpY2UpXG5cdFx0KSk7XG5cblx0XHRhd2FpdCBkaWFsb2cuc2hvdygpO1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoV0VMQ09NRV9DT01QTEVURV9LRVksIHRydWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR0aGlzLnNlcnZpY2VNYXJrRG9uZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlV2VsY29tZUZvb3RlcihkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSAkKCcuY2hhdC1zZXR1cC1kaWFsb2ctZm9vdGVyJyk7XG5cdFx0Y29uc3QgZGVmYXVsdENoYXRBZ2VudCA9IHRoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudDtcblx0XHRjb25zdCBwcm92aWRlck5hbWUgPSBkZWZhdWx0Q2hhdEFnZW50Py5wcm92aWRlcj8uZGVmYXVsdD8ubmFtZSA/PyAnR2l0SHViJztcblx0XHRjb25zdCB0ZXJtc1VybCA9IGRlZmF1bHRDaGF0QWdlbnQ/LnRlcm1zU3RhdGVtZW50VXJsID8/ICcnO1xuXHRcdGNvbnN0IHByaXZhY3lVcmwgPSBkZWZhdWx0Q2hhdEFnZW50Py5wcml2YWN5U3RhdGVtZW50VXJsID8/ICcnO1xuXHRcdGNvbnN0IHB1YmxpY0NvZGVVcmwgPSBkZWZhdWx0Q2hhdEFnZW50Py5wdWJsaWNDb2RlTWF0Y2hlc1VybCA/PyAnJztcblx0XHRjb25zdCBzZXR0aW5nc1VybCA9IHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLnJlc29sdmVHaXRIdWJVcmwoR2l0SHViUGF0aHMuY29waWxvdFNldHRpbmdzKTtcblxuXHRcdGNvbnN0IGZvb3RlciA9IGxvY2FsaXplKFxuXHRcdFx0eyBrZXk6ICd3ZWxjb21lRm9vdGVyJywgY29tbWVudDogWyd7TG9ja2VkPVwiW1wifScsICd7TG9ja2VkPVwiXSh7MX0pXCJ9JywgJ3tMb2NrZWQ9XCJdKHsyfSlcIn0nLCAne0xvY2tlZD1cIl0oezR9KVwifScsICd7TG9ja2VkPVwiXSh7NX0pXCJ9J10gfSxcblx0XHRcdFwiQnkgY29udGludWluZywgeW91IGFncmVlIHRvIHswfSdzIFtUZXJtc10oezF9KSBhbmQgW1ByaXZhY3kgU3RhdGVtZW50XSh7Mn0pLiB7M30gQ29waWxvdCBtYXkgc2hvdyBbcHVibGljIGNvZGVdKHs0fSkgc3VnZ2VzdGlvbnMgYW5kIHVzZSB5b3VyIGRhdGEgdG8gaW1wcm92ZSB0aGUgcHJvZHVjdC4gWW91IGNhbiBjaGFuZ2UgdGhlc2UgW3NldHRpbmdzXSh7NX0pIGFueXRpbWUuXCIsXG5cdFx0XHRwcm92aWRlck5hbWUsIHRlcm1zVXJsLCBwcml2YWN5VXJsLCBwcm92aWRlck5hbWUsIHB1YmxpY0NvZGVVcmwsIHNldHRpbmdzVXJsXG5cdFx0KTtcblx0XHRlbGVtZW50LmFwcGVuZENoaWxkKCQoJ3AnLCB1bmRlZmluZWQsIGRpc3Bvc2FibGVzLmFkZCh0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihuZXcgTWFya2Rvd25TdHJpbmcoZm9vdGVyLCB7IGlzVHJ1c3RlZDogdHJ1ZSB9KSkpLmVsZW1lbnQpKTtcblxuXHRcdHJldHVybiBlbGVtZW50O1xuXHR9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gU2VydmljZVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBjbGFzcyBTZXNzaW9uc1NldFVwU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2Vzc2lvbnNTZXRVcFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luaXRQcm9taXNlOiBQcm9taXNlPHZvaWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF93ZWxjb21lRG9uZURlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRwcml2YXRlIF9pbml0aWFsU2lnbkluRGlhbG9nU2hvd24gPSBmYWxzZTtcblxuXHRnZXQgaW5pdGlhbFNpZ25JbkRpYWxvZ1Nob3duKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pbml0aWFsU2lnbkluRGlhbG9nU2hvd247XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2luaXRQcm9taXNlID0gdGhpcy5pbml0aWFsaXplKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0U2Vzc2lvbnNTZXRVcFdpZGdldCxcblx0XHRcdCgpID0+IHRoaXMuX3dlbGNvbWVEb25lRGVmZXJyZWQuY29tcGxldGUoKSxcblx0XHRcdCgpID0+IHRoaXMud2hlblNldHVwRG9uZSgpLFxuXHRcdFx0KCkgPT4gdGhpcy5tYXJrRG9uZSgpLFxuXHRcdFx0KCkgPT4gdGhpcy5faW5pdGlhbFNpZ25JbkRpYWxvZ1Nob3duID0gdHJ1ZVxuXHRcdCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3aGVuU2V0dXBEb25lKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGF3YWl0IHRoaXMuX2luaXRQcm9taXNlO1xuXHRcdHJldHVybiB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uuc2VudGltZW50LmNvbXBsZXRlZCA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgbWFya0RvbmUoKTogdm9pZCB7XG5cdFx0dGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm1hcmtTZXR1cENvbXBsZXRlZCgpO1xuXHR9XG5cblx0d2hlbldlbGNvbWVEb25lKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl93ZWxjb21lRG9uZURlZmVycmVkLnA7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuY29tcGxldGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRQcm9maWxlID0gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZTtcblx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2Uud2l0aFByb2ZpbGVTY29wZWRTdG9yYWdlU2VydmljZShkZWZhdWx0UHJvZmlsZSwgYXN5bmMgc3RvcmFnZVNlcnZpY2UgPT4ge1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0Q29udGV4dCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Vcblx0XHRcdFx0XHQuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlXSkpXG5cdFx0XHRcdFx0LmNyZWF0ZUluc3RhbmNlKENoYXRFbnRpdGxlbWVudENvbnRleHQpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGlmIChkZWZhdWx0Q29udGV4dC5zdGF0ZS5jb21wbGV0ZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbc2Vzc2lvbnMgd2VsY29tZV0gU2V0dXAgYWxyZWFkeSBjb21wbGV0ZWQgaW4gZGVmYXVsdCBwcm9maWxlLCBtYXJraW5nIGRvbmUgbG9jYWxseScpO1xuXHRcdFx0XHRcdFx0dGhpcy5tYXJrRG9uZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRkZWZhdWx0Q29udGV4dC5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tzZXNzaW9ucyB3ZWxjb21lXSBGYWlsZWQgdG8gcmVhZCBzZXR1cCBzdGF0ZSBmcm9tIGRlZmF1bHQgcHJvZmlsZTonLCBlcnJvcik7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSxpQkFBOEIsbUJBQW1CLG9CQUFvQjtBQUMxRixTQUFTLCtCQUErQjtBQUN4QyxTQUFzQixtQkFBbUI7QUFDekMsU0FBUyxpQkFBaUIseUJBQXlCO0FBQ25ELFNBQVMsaUJBQWlCLDZCQUE2QjtBQUN2RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHdCQUF3QiwrQkFBK0I7QUFDaEUsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsYUFBYSw4QkFBOEI7QUFDcEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxzQkFBc0Isc0JBQXNCLGlDQUFpQyw0QkFBNEIsMkJBQTJCO0FBRTdJLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZUFBZTtBQUN4QixTQUFTLEdBQUcsY0FBYztBQUMxQixTQUFTLFFBQVEsK0JBQStCO0FBQ2hELFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUNBQW1DLCtCQUErQjtBQUMzRSxTQUFTLHNEQUFzRDtB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
