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
import "./media/chatSetup.css";
import { $ } from "../../../../../base/browser/dom.js";
import { Dialog, DialogContentsAlignment } from "../../../../../base/browser/ui/dialog/dialog.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { localize } from "../../../../../nls.js";
import { createWorkbenchDialogOptions } from "../../../../browser/parts/dialogs/dialog.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { ILayoutService } from "../../../../../platform/layout/browser/layoutService.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import product from "../../../../../platform/product/common/product.js";
import { ITelemetryService, TelemetryLevel } from "../../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from "../../../../../platform/workspace/common/workspaceTrust.js";
import { ChatEntitlement, IChatEntitlementService, isProUser } from "../../../../services/chat/common/chatEntitlementService.js";
import { IChatWidgetService } from "../chat.js";
import { ChatSetupAnonymous, ChatSetupDialogVisibleContext, ChatSetupError, ChatSetupStrategy } from "./chatSetup.js";
import { GitHubPaths, IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import { IHostService } from "../../../../services/host/browser/host.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { raceTimeout } from "../../../../../base/common/async.js";
const fallbackProviders = {
  default: { id: "", name: "" },
  enterprise: { id: "", name: "" },
  apple: { id: "", name: "" },
  google: { id: "", name: "" }
};
const configuredProviders = product.defaultChatAgent?.provider;
const defaultChat = {
  chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? "",
  publicCodeMatchesUrl: product.defaultChatAgent?.publicCodeMatchesUrl ?? "",
  provider: {
    default: configuredProviders?.default ?? fallbackProviders.default,
    enterprise: configuredProviders?.enterprise ?? fallbackProviders.enterprise,
    apple: configuredProviders?.apple ?? fallbackProviders.apple,
    google: configuredProviders?.google ?? fallbackProviders.google
  },
  chatRefreshTokenCommand: product.defaultChatAgent?.chatRefreshTokenCommand ?? "",
  termsStatementUrl: product.defaultChatAgent?.termsStatementUrl ?? "",
  privacyStatementUrl: product.defaultChatAgent?.privacyStatementUrl ?? ""
};
let ChatSetupDialog = class extends Disposable {
  constructor(container, options, keybindingService, layoutService, hostService, markdownRendererService, contextKeyService) {
    super();
    this.options = options;
    const dialogVisible = ChatSetupDialogVisibleContext.bindTo(contextKeyService);
    dialogVisible.set(true);
    this._register(toDisposable(() => dialogVisible.reset()));
    this.dialog = this._register(new Dialog(
      container,
      options.title,
      options.buttons.map((button) => button.label),
      createWorkbenchDialogOptions({
        type: "none",
        extraClasses: ["chat-setup-dialog", ...options.extraClasses ?? []],
        detail: " ",
        icon: options.icon,
        alignment: DialogContentsAlignment.Vertical,
        cancelId: options.buttons.length,
        disableCloseButton: options.disableCloseButton,
        renderFooter: (footer) => {
          const element = footer.appendChild($(".chat-setup-dialog-footer"));
          const renderedFooter = this._register(markdownRendererService.render(new MarkdownString(options.footer, { isTrusted: true })));
          element.appendChild($("p", void 0, renderedFooter.element));
          const customFooter = options.renderFooter?.(element);
          if (customFooter) {
            this._register(customFooter);
          }
        },
        buttonOptions: options.buttons.map((button) => {
          const classes = button.classes;
          return classes ? { styleButton: (control) => control.element.classList.add(...classes) } : void 0;
        })
      }, keybindingService, layoutService, hostService)
    ));
  }
  async show() {
    const { button } = await this.dialog.show();
    return this.options.buttons[button]?.strategy ?? ChatSetupStrategy.Canceled;
  }
};
ChatSetupDialog = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, ILayoutService),
  __decorateParam(4, IHostService),
  __decorateParam(5, IMarkdownRendererService),
  __decorateParam(6, IContextKeyService)
], ChatSetupDialog);
async function showChatSetupDialogWithCancellation(dialog, cancellationToken, onDidDismissDialog) {
  let canceled = false;
  const cancellationListener = cancellationToken?.onCancellationRequested(() => {
    canceled = true;
    dialog.dispose();
  });
  try {
    if (cancellationToken?.isCancellationRequested) {
      canceled = true;
      dialog.dispose();
    }
    const strategy = canceled ? ChatSetupStrategy.Canceled : await dialog.show();
    if (!canceled && strategy === ChatSetupStrategy.Canceled) {
      onDidDismissDialog?.();
    }
    return strategy;
  } finally {
    cancellationListener?.dispose();
    dialog.dispose();
  }
}
function getChatSetupDialogButtons(entitlement, options, enterpriseAuthentication, providers = defaultChat.provider) {
  const button = (label, strategy, ...classes) => ({ label, strategy, classes });
  if (!options?.forceAnonymous && (entitlement === ChatEntitlement.Unknown || options?.forceSignInDialog)) {
    const defaultProviderButton = button(localize("continueWith", "Continue with {0}", providers.default.name), ChatSetupStrategy.SetupWithoutEnterpriseProvider, "continue-button", "default");
    const defaultProviderLink = button(defaultProviderButton.label, defaultProviderButton.strategy, "link-button");
    const enterpriseProviderButton = button(localize("continueWith", "Continue with {0}", providers.enterprise.name), ChatSetupStrategy.SetupWithEnterpriseProvider, "continue-button", "default");
    const enterpriseProviderLink = button(enterpriseProviderButton.label, enterpriseProviderButton.strategy, "link-button");
    const googleProviderButton = button(localize("continueWith", "Continue with {0}", providers.google.name), ChatSetupStrategy.SetupWithGoogleProvider, "continue-button", "google");
    const appleProviderButton = button(localize("continueWith", "Continue with {0}", providers.apple.name), ChatSetupStrategy.SetupWithAppleProvider, "continue-button", "apple");
    const providerButtons = enterpriseAuthentication ? [enterpriseProviderButton, googleProviderButton, appleProviderButton, defaultProviderLink] : [defaultProviderButton, googleProviderButton, appleProviderButton, enterpriseProviderLink];
    return options?.allowContinueWithoutSignIn ? [...providerButtons, button(localize("continueWithoutSigningIn", "Continue Without Signing In"), ChatSetupStrategy.Canceled, "link-button")] : providerButtons;
  }
  return [button(localize("setupAIButton", "Use AI Features"), ChatSetupStrategy.DefaultSetup)];
}
function getChatSetupDialogFooter(forceAnonymous, telemetryLevel, settingsUrl, content = {
  providerName: defaultChat.provider.default.name,
  termsStatementUrl: defaultChat.termsStatementUrl,
  privacyStatementUrl: defaultChat.privacyStatementUrl,
  publicCodeMatchesUrl: defaultChat.publicCodeMatchesUrl
}) {
  if (forceAnonymous || telemetryLevel === TelemetryLevel.NONE) {
    return localize({ key: "settingsAnonymous", comment: ['{Locked="["}', '{Locked="]({1})"}', '{Locked="]({2})"}'] }, "By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}).", content.providerName, content.termsStatementUrl, content.privacyStatementUrl);
  }
  return localize({ key: "settings", comment: ['{Locked="["}', '{Locked="]({1})"}', '{Locked="]({2})"}', '{Locked="]({4})"}', '{Locked="]({5})"}'] }, "By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}). {3} Copilot may show [public code]({4}) suggestions and use your data to improve the product. You can change these [settings]({5}) anytime.", content.providerName, content.termsStatementUrl, content.privacyStatementUrl, content.providerName, content.publicCodeMatchesUrl, settingsUrl);
}
let ChatSetup = class {
  constructor(context, controller, telemetryService, layoutService, chatEntitlementService, logService, widgetService, workspaceTrustRequestService, defaultAccountService, extensionService, workspaceTrustManagementService, instantiationService) {
    this.context = context;
    this.controller = controller;
    this.telemetryService = telemetryService;
    this.layoutService = layoutService;
    this.chatEntitlementService = chatEntitlementService;
    this.logService = logService;
    this.widgetService = widgetService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.defaultAccountService = defaultAccountService;
    this.extensionService = extensionService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.instantiationService = instantiationService;
    this.pendingRun = void 0;
    this.skipDialogOnce = false;
  }
  static getInstance(instantiationService, context, controller) {
    let instance = ChatSetup.instance;
    if (!instance) {
      instance = ChatSetup.instance = instantiationService.createInstance(ChatSetup, context, controller);
    }
    return instance;
  }
  skipDialog() {
    this.skipDialogOnce = true;
  }
  async run(options) {
    if (this.pendingRun) {
      return this.pendingRun;
    }
    this.pendingRun = this.doRun(options);
    try {
      return await this.pendingRun;
    } finally {
      this.pendingRun = void 0;
    }
  }
  async doRun(options) {
    this.context.update({ later: false });
    const dialogSkipped = this.skipDialogOnce;
    this.skipDialogOnce = false;
    if (options?.cancellationToken?.isCancellationRequested) {
      return { dialogSkipped, success: void 0 };
    }
    const wasTrusted = this.workspaceTrustManagementService.isWorkspaceTrusted();
    const trusted = await this.workspaceTrustRequestService.requestWorkspaceTrust({
      message: localize("chatWorkspaceTrust", "AI features are currently only supported in trusted workspaces.")
    });
    if (!trusted) {
      this.context.update({ later: true });
      this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "failedNotTrusted", installDuration: 0, signUpErrorCode: void 0, provider: void 0 });
      return {
        dialogSkipped,
        success: void 0
        /* canceled */
      };
    }
    if (options?.cancellationToken?.isCancellationRequested) {
      return { dialogSkipped, success: void 0 };
    }
    if (!wasTrusted) {
      await this.whenChatExtensionActivated();
    }
    let setupStrategy;
    if (options?.setupStrategy !== void 0) {
      setupStrategy = options.setupStrategy;
    } else if (!options?.forceSignInDialog && (dialogSkipped || isProUser(this.chatEntitlementService.entitlement) || this.chatEntitlementService.entitlement === ChatEntitlement.Free)) {
      setupStrategy = ChatSetupStrategy.DefaultSetup;
    } else if (options?.forceAnonymous === ChatSetupAnonymous.EnabledWithoutDialog) {
      setupStrategy = ChatSetupStrategy.DefaultSetup;
    } else {
      setupStrategy = await this.showDialog(options);
    }
    if (setupStrategy === ChatSetupStrategy.DefaultSetup && this.defaultAccountService.getDefaultAccountAuthenticationProvider().enterprise) {
      setupStrategy = ChatSetupStrategy.SetupWithEnterpriseProvider;
    }
    let success = void 0;
    let setupError;
    let errorAlreadyHandled = false;
    const setupCancellation = new CancellationTokenSource(options?.cancellationToken);
    try {
      if (setupStrategy !== ChatSetupStrategy.Canceled) {
        options?.onSignInStarted?.(() => setupCancellation.cancel());
      }
      if (setupStrategy !== ChatSetupStrategy.Canceled && !options?.disableChatViewReveal) {
        this.widgetService.revealWidget();
      }
      switch (setupStrategy) {
        case ChatSetupStrategy.SetupWithEnterpriseProvider:
          success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: true, useSocialProvider: void 0, additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous, cancellationToken: setupCancellation.token });
          break;
        case ChatSetupStrategy.SetupWithoutEnterpriseProvider:
          success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: false, useSocialProvider: void 0, additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous, cancellationToken: setupCancellation.token });
          break;
        case ChatSetupStrategy.SetupWithAppleProvider:
          success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: false, useSocialProvider: "apple", additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous, cancellationToken: setupCancellation.token });
          break;
        case ChatSetupStrategy.SetupWithGoogleProvider:
          success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: false, useSocialProvider: "google", additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous, cancellationToken: setupCancellation.token });
          break;
        case ChatSetupStrategy.DefaultSetup:
          success = await this.controller.value.setup({ ...options, forceAnonymous: options?.forceAnonymous, cancellationToken: setupCancellation.token });
          break;
        case ChatSetupStrategy.Canceled:
          this.context.update({ later: true });
          this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "failedMaybeLater", installDuration: 0, signUpErrorCode: void 0, provider: void 0 });
          break;
      }
    } catch (error) {
      this.logService.error(`[chat setup] Error during setup: ${toErrorMessage(error)}`);
      success = false;
      if (error instanceof ChatSetupError) {
        setupError = error.originalError;
        errorAlreadyHandled = error.userNotified;
      } else {
        setupError = error instanceof Error ? error : new Error(toErrorMessage(error));
      }
    } finally {
      setupCancellation.dispose();
    }
    if (success) {
      this.context.update({ completed: true });
    }
    return { success, dialogSkipped, error: setupError, errorAlreadyHandled };
  }
  /**
   * Whether the default chat extension has finished activating. `activationTimes`
   * is only set once activation completes, so `undefined` means "not yet active".
   */
  isChatExtensionActivated() {
    const status = this.extensionService.getExtensionsStatus();
    for (const id of Object.keys(status)) {
      if (ExtensionIdentifier.equals(id, defaultChat.chatExtensionId)) {
        return status[id].activationTimes !== void 0;
      }
    }
    return false;
  }
  /**
   * Resolves once the default chat extension has finished activating (bounded by
   * a timeout). Detection relies only on the extension lifecycle, so it never
   * touches the user's authentication session.
   */
  async whenChatExtensionActivated(timeoutMs = 1e4) {
    if (!defaultChat.chatExtensionId || this.isChatExtensionActivated()) {
      return;
    }
    const store = new DisposableStore();
    try {
      await raceTimeout(new Promise((resolve) => {
        const check = () => {
          if (this.isChatExtensionActivated()) {
            resolve();
          }
        };
        store.add(this.extensionService.onDidChangeExtensionsStatus(check));
        this.extensionService.whenInstalledExtensionsRegistered().then(check);
      }), timeoutMs);
    } finally {
      store.dispose();
    }
  }
  async showDialog(options) {
    if (options?.cancellationToken?.isCancellationRequested) {
      return ChatSetupStrategy.Canceled;
    }
    const buttons = getChatSetupDialogButtons(this.context.state.entitlement, options, this.defaultAccountService.getDefaultAccountAuthenticationProvider().enterprise);
    const dialog = this.instantiationService.createInstance(ChatSetupDialog, this.layoutService.activeContainer, {
      title: this.getDialogTitle(options),
      buttons,
      icon: options?.dialogIcon ?? Codicon.copilotLarge,
      disableCloseButton: options?.disableCloseButton ?? false,
      footer: getChatSetupDialogFooter(options?.forceAnonymous, this.telemetryService.telemetryLevel, this.defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings)),
      extraClasses: options?.dialogExtraClasses,
      renderFooter: options?.renderDialogFooter
    });
    return showChatSetupDialogWithCancellation(dialog, options?.cancellationToken, options?.onDidDismissDialog);
  }
  getDialogTitle(options) {
    if (options?.dialogTitle) {
      return options.dialogTitle;
    }
    if (this.chatEntitlementService.anonymous) {
      if (options?.forceAnonymous) {
        return localize("startUsing", "Start using AI Features");
      } else {
        return localize("enableMore", "Enable more AI features");
      }
    }
    if (this.context.state.entitlement === ChatEntitlement.Unknown || options?.forceSignInDialog) {
      return localize("signIn", "Sign in to use GitHub Copilot");
    }
    return localize("startUsing", "Start using AI Features");
  }
};
ChatSetup.instance = void 0;
ChatSetup = __decorateClass([
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, ILayoutService),
  __decorateParam(4, IChatEntitlementService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IChatWidgetService),
  __decorateParam(7, IWorkspaceTrustRequestService),
  __decorateParam(8, IDefaultAccountService),
  __decorateParam(9, IExtensionService),
  __decorateParam(10, IWorkspaceTrustManagementService),
  __decorateParam(11, IInstantiationService)
], ChatSetup);
function refreshTokens(commandService) {
  commandService.executeCommand(defaultChat.chatRefreshTokenCommand);
}
export {
  ChatSetup,
  ChatSetupDialog,
  getChatSetupDialogButtons,
  getChatSetupDialogFooter,
  refreshTokens,
  showChatSetupDialogWithCancellation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRTZXR1cFxcY2hhdFNldHVwUnVubmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXRTZXR1cC5jc3MnO1xuaW1wb3J0IHsgJCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRGlhbG9nLCBEaWFsb2dDb250ZW50c0FsaWdubWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kaWFsb2cvZGlhbG9nLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVXb3JrYmVuY2hEaWFsb2dPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9kaWFsb2dzL2RpYWxvZy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSwgVGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSwgSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnQsIENoYXRFbnRpdGxlbWVudENvbnRleHQsIENoYXRFbnRpdGxlbWVudFNlcnZpY2UsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLCBpc1Byb1VzZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdFNldHVwQ29udHJvbGxlciB9IGZyb20gJy4vY2hhdFNldHVwQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNldHVwUmVzdWx0LCBDaGF0U2V0dXBBbm9ueW1vdXMsIENoYXRTZXR1cERpYWxvZ1Zpc2libGVDb250ZXh0LCBDaGF0U2V0dXBFcnJvciwgSW5zdGFsbENoYXRFdmVudCwgSW5zdGFsbENoYXRDbGFzc2lmaWNhdGlvbiwgQ2hhdFNldHVwU3RyYXRlZ3ksIENoYXRTZXR1cFJlc3VsdFZhbHVlLCBJQ2hhdFNldHVwUnVuT3B0aW9ucyB9IGZyb20gJy4vY2hhdFNldHVwLmpzJztcbmltcG9ydCB7IEdpdEh1YlBhdGhzLCBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyByYWNlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcblxuY29uc3QgZmFsbGJhY2tQcm92aWRlcnMgPSB7XG5cdGRlZmF1bHQ6IHsgaWQ6ICcnLCBuYW1lOiAnJyB9LFxuXHRlbnRlcnByaXNlOiB7IGlkOiAnJywgbmFtZTogJycgfSxcblx0YXBwbGU6IHsgaWQ6ICcnLCBuYW1lOiAnJyB9LFxuXHRnb29nbGU6IHsgaWQ6ICcnLCBuYW1lOiAnJyB9LFxufTtcblxuY29uc3QgY29uZmlndXJlZFByb3ZpZGVycyA9IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8ucHJvdmlkZXI7XG5jb25zdCBkZWZhdWx0Q2hhdCA9IHtcblx0Y2hhdEV4dGVuc2lvbklkOiBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LmNoYXRFeHRlbnNpb25JZCA/PyAnJyxcblx0cHVibGljQ29kZU1hdGNoZXNVcmw6IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8ucHVibGljQ29kZU1hdGNoZXNVcmwgPz8gJycsXG5cdHByb3ZpZGVyOiB7XG5cdFx0ZGVmYXVsdDogY29uZmlndXJlZFByb3ZpZGVycz8uZGVmYXVsdCA/PyBmYWxsYmFja1Byb3ZpZGVycy5kZWZhdWx0LFxuXHRcdGVudGVycHJpc2U6IGNvbmZpZ3VyZWRQcm92aWRlcnM/LmVudGVycHJpc2UgPz8gZmFsbGJhY2tQcm92aWRlcnMuZW50ZXJwcmlzZSxcblx0XHRhcHBsZTogY29uZmlndXJlZFByb3ZpZGVycz8uYXBwbGUgPz8gZmFsbGJhY2tQcm92aWRlcnMuYXBwbGUsXG5cdFx0Z29vZ2xlOiBjb25maWd1cmVkUHJvdmlkZXJzPy5nb29nbGUgPz8gZmFsbGJhY2tQcm92aWRlcnMuZ29vZ2xlLFxuXHR9LFxuXHRjaGF0UmVmcmVzaFRva2VuQ29tbWFuZDogcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5jaGF0UmVmcmVzaFRva2VuQ29tbWFuZCA/PyAnJyxcblx0dGVybXNTdGF0ZW1lbnRVcmw6IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8udGVybXNTdGF0ZW1lbnRVcmwgPz8gJycsXG5cdHByaXZhY3lTdGF0ZW1lbnRVcmw6IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8ucHJpdmFjeVN0YXRlbWVudFVybCA/PyAnJ1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFNldHVwRGlhbG9nQnV0dG9uIHtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgc3RyYXRlZ3k6IENoYXRTZXR1cFN0cmF0ZWd5O1xuXHRyZWFkb25seSBjbGFzc2VzPzogcmVhZG9ubHkgc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRTZXR1cERpYWxvZ1Byb3ZpZGVycyB7XG5cdHJlYWRvbmx5IGRlZmF1bHQ6IHsgcmVhZG9ubHkgbmFtZTogc3RyaW5nIH07XG5cdHJlYWRvbmx5IGVudGVycHJpc2U6IHsgcmVhZG9ubHkgbmFtZTogc3RyaW5nIH07XG5cdHJlYWRvbmx5IGFwcGxlOiB7IHJlYWRvbmx5IG5hbWU6IHN0cmluZyB9O1xuXHRyZWFkb25seSBnb29nbGU6IHsgcmVhZG9ubHkgbmFtZTogc3RyaW5nIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRTZXR1cERpYWxvZ0Zvb3RlckNvbnRlbnQge1xuXHRyZWFkb25seSBwcm92aWRlck5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgdGVybXNTdGF0ZW1lbnRVcmw6IHN0cmluZztcblx0cmVhZG9ubHkgcHJpdmFjeVN0YXRlbWVudFVybDogc3RyaW5nO1xuXHRyZWFkb25seSBwdWJsaWNDb2RlTWF0Y2hlc1VybDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0U2V0dXBEaWFsb2dPcHRpb25zIHtcblx0cmVhZG9ubHkgdGl0bGU6IHN0cmluZztcblx0cmVhZG9ubHkgYnV0dG9uczogcmVhZG9ubHkgSUNoYXRTZXR1cERpYWxvZ0J1dHRvbltdO1xuXHRyZWFkb25seSBpY29uOiBUaGVtZUljb247XG5cdHJlYWRvbmx5IGRpc2FibGVDbG9zZUJ1dHRvbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgZm9vdGVyOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGV4dHJhQ2xhc3Nlcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSByZW5kZXJGb290ZXI/OiAoY29udGFpbmVyOiBIVE1MRWxlbWVudCkgPT4gSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0U2V0dXBEaWFsb2cgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpYWxvZzogRGlhbG9nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJQ2hhdFNldHVwRGlhbG9nT3B0aW9ucyxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgZGlhbG9nVmlzaWJsZSA9IENoYXRTZXR1cERpYWxvZ1Zpc2libGVDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0ZGlhbG9nVmlzaWJsZS5zZXQodHJ1ZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IGRpYWxvZ1Zpc2libGUucmVzZXQoKSkpO1xuXG5cdFx0dGhpcy5kaWFsb2cgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlhbG9nKFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0b3B0aW9ucy50aXRsZSxcblx0XHRcdG9wdGlvbnMuYnV0dG9ucy5tYXAoYnV0dG9uID0+IGJ1dHRvbi5sYWJlbCksXG5cdFx0XHRjcmVhdGVXb3JrYmVuY2hEaWFsb2dPcHRpb25zKHtcblx0XHRcdFx0dHlwZTogJ25vbmUnLFxuXHRcdFx0XHRleHRyYUNsYXNzZXM6IFsnY2hhdC1zZXR1cC1kaWFsb2cnLCAuLi4ob3B0aW9ucy5leHRyYUNsYXNzZXMgPz8gW10pXSxcblx0XHRcdFx0ZGV0YWlsOiAnICcsXG5cdFx0XHRcdGljb246IG9wdGlvbnMuaWNvbixcblx0XHRcdFx0YWxpZ25tZW50OiBEaWFsb2dDb250ZW50c0FsaWdubWVudC5WZXJ0aWNhbCxcblx0XHRcdFx0Y2FuY2VsSWQ6IG9wdGlvbnMuYnV0dG9ucy5sZW5ndGgsXG5cdFx0XHRcdGRpc2FibGVDbG9zZUJ1dHRvbjogb3B0aW9ucy5kaXNhYmxlQ2xvc2VCdXR0b24sXG5cdFx0XHRcdHJlbmRlckZvb3RlcjogZm9vdGVyID0+IHtcblx0XHRcdFx0XHRjb25zdCBlbGVtZW50ID0gZm9vdGVyLmFwcGVuZENoaWxkKCQoJy5jaGF0LXNldHVwLWRpYWxvZy1mb290ZXInKSk7XG5cdFx0XHRcdFx0Y29uc3QgcmVuZGVyZWRGb290ZXIgPSB0aGlzLl9yZWdpc3RlcihtYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIobmV3IE1hcmtkb3duU3RyaW5nKG9wdGlvbnMuZm9vdGVyLCB7IGlzVHJ1c3RlZDogdHJ1ZSB9KSkpO1xuXHRcdFx0XHRcdGVsZW1lbnQuYXBwZW5kQ2hpbGQoJCgncCcsIHVuZGVmaW5lZCwgcmVuZGVyZWRGb290ZXIuZWxlbWVudCkpO1xuXHRcdFx0XHRcdGNvbnN0IGN1c3RvbUZvb3RlciA9IG9wdGlvbnMucmVuZGVyRm9vdGVyPy4oZWxlbWVudCk7XG5cdFx0XHRcdFx0aWYgKGN1c3RvbUZvb3Rlcikge1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoY3VzdG9tRm9vdGVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGJ1dHRvbk9wdGlvbnM6IG9wdGlvbnMuYnV0dG9ucy5tYXAoYnV0dG9uID0+IHtcblx0XHRcdFx0XHRjb25zdCBjbGFzc2VzID0gYnV0dG9uLmNsYXNzZXM7XG5cdFx0XHRcdFx0cmV0dXJuIGNsYXNzZXMgPyB7IHN0eWxlQnV0dG9uOiBjb250cm9sID0+IGNvbnRyb2wuZWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLmNsYXNzZXMpIH0gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdH0pXG5cdFx0XHR9LCBrZXliaW5kaW5nU2VydmljZSwgbGF5b3V0U2VydmljZSwgaG9zdFNlcnZpY2UpXG5cdFx0KSk7XG5cdH1cblxuXHRhc3luYyBzaG93KCk6IFByb21pc2U8Q2hhdFNldHVwU3RyYXRlZ3k+IHtcblx0XHRjb25zdCB7IGJ1dHRvbiB9ID0gYXdhaXQgdGhpcy5kaWFsb2cuc2hvdygpO1xuXHRcdHJldHVybiB0aGlzLm9wdGlvbnMuYnV0dG9uc1tidXR0b25dPy5zdHJhdGVneSA/PyBDaGF0U2V0dXBTdHJhdGVneS5DYW5jZWxlZDtcblx0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2hvd0NoYXRTZXR1cERpYWxvZ1dpdGhDYW5jZWxsYXRpb24oXG5cdGRpYWxvZzogUGljazxDaGF0U2V0dXBEaWFsb2csICdzaG93JyB8ICdkaXNwb3NlJz4sXG5cdGNhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiB8IHVuZGVmaW5lZCxcblx0b25EaWREaXNtaXNzRGlhbG9nPzogKCkgPT4gdm9pZCxcbik6IFByb21pc2U8Q2hhdFNldHVwU3RyYXRlZ3k+IHtcblx0bGV0IGNhbmNlbGVkID0gZmFsc2U7XG5cdGNvbnN0IGNhbmNlbGxhdGlvbkxpc3RlbmVyID0gY2FuY2VsbGF0aW9uVG9rZW4/Lm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRjYW5jZWxlZCA9IHRydWU7XG5cdFx0ZGlhbG9nLmRpc3Bvc2UoKTtcblx0fSk7XG5cdHRyeSB7XG5cdFx0aWYgKGNhbmNlbGxhdGlvblRva2VuPy5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0Y2FuY2VsZWQgPSB0cnVlO1xuXHRcdFx0ZGlhbG9nLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0Y29uc3Qgc3RyYXRlZ3kgPSBjYW5jZWxlZCA/IENoYXRTZXR1cFN0cmF0ZWd5LkNhbmNlbGVkIDogYXdhaXQgZGlhbG9nLnNob3coKTtcblx0XHRpZiAoIWNhbmNlbGVkICYmIHN0cmF0ZWd5ID09PSBDaGF0U2V0dXBTdHJhdGVneS5DYW5jZWxlZCkge1xuXHRcdFx0b25EaWREaXNtaXNzRGlhbG9nPy4oKTtcblx0XHR9XG5cdFx0cmV0dXJuIHN0cmF0ZWd5O1xuXHR9IGZpbmFsbHkge1xuXHRcdGNhbmNlbGxhdGlvbkxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cdFx0ZGlhbG9nLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhdFNldHVwRGlhbG9nQnV0dG9ucyhlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LCBvcHRpb25zOiBJQ2hhdFNldHVwUnVuT3B0aW9ucyB8IHVuZGVmaW5lZCwgZW50ZXJwcmlzZUF1dGhlbnRpY2F0aW9uOiBib29sZWFuLCBwcm92aWRlcnM6IElDaGF0U2V0dXBEaWFsb2dQcm92aWRlcnMgPSBkZWZhdWx0Q2hhdC5wcm92aWRlcik6IElDaGF0U2V0dXBEaWFsb2dCdXR0b25bXSB7XG5cdGNvbnN0IGJ1dHRvbiA9IChsYWJlbDogc3RyaW5nLCBzdHJhdGVneTogQ2hhdFNldHVwU3RyYXRlZ3ksIC4uLmNsYXNzZXM6IHN0cmluZ1tdKTogSUNoYXRTZXR1cERpYWxvZ0J1dHRvbiA9PiAoeyBsYWJlbCwgc3RyYXRlZ3ksIGNsYXNzZXMgfSk7XG5cblx0aWYgKCFvcHRpb25zPy5mb3JjZUFub255bW91cyAmJiAoZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5Vbmtub3duIHx8IG9wdGlvbnM/LmZvcmNlU2lnbkluRGlhbG9nKSkge1xuXHRcdGNvbnN0IGRlZmF1bHRQcm92aWRlckJ1dHRvbiA9IGJ1dHRvbihsb2NhbGl6ZSgnY29udGludWVXaXRoJywgXCJDb250aW51ZSB3aXRoIHswfVwiLCBwcm92aWRlcnMuZGVmYXVsdC5uYW1lKSwgQ2hhdFNldHVwU3RyYXRlZ3kuU2V0dXBXaXRob3V0RW50ZXJwcmlzZVByb3ZpZGVyLCAnY29udGludWUtYnV0dG9uJywgJ2RlZmF1bHQnKTtcblx0XHRjb25zdCBkZWZhdWx0UHJvdmlkZXJMaW5rID0gYnV0dG9uKGRlZmF1bHRQcm92aWRlckJ1dHRvbi5sYWJlbCwgZGVmYXVsdFByb3ZpZGVyQnV0dG9uLnN0cmF0ZWd5LCAnbGluay1idXR0b24nKTtcblx0XHRjb25zdCBlbnRlcnByaXNlUHJvdmlkZXJCdXR0b24gPSBidXR0b24obG9jYWxpemUoJ2NvbnRpbnVlV2l0aCcsIFwiQ29udGludWUgd2l0aCB7MH1cIiwgcHJvdmlkZXJzLmVudGVycHJpc2UubmFtZSksIENoYXRTZXR1cFN0cmF0ZWd5LlNldHVwV2l0aEVudGVycHJpc2VQcm92aWRlciwgJ2NvbnRpbnVlLWJ1dHRvbicsICdkZWZhdWx0Jyk7XG5cdFx0Y29uc3QgZW50ZXJwcmlzZVByb3ZpZGVyTGluayA9IGJ1dHRvbihlbnRlcnByaXNlUHJvdmlkZXJCdXR0b24ubGFiZWwsIGVudGVycHJpc2VQcm92aWRlckJ1dHRvbi5zdHJhdGVneSwgJ2xpbmstYnV0dG9uJyk7XG5cdFx0Y29uc3QgZ29vZ2xlUHJvdmlkZXJCdXR0b24gPSBidXR0b24obG9jYWxpemUoJ2NvbnRpbnVlV2l0aCcsIFwiQ29udGludWUgd2l0aCB7MH1cIiwgcHJvdmlkZXJzLmdvb2dsZS5uYW1lKSwgQ2hhdFNldHVwU3RyYXRlZ3kuU2V0dXBXaXRoR29vZ2xlUHJvdmlkZXIsICdjb250aW51ZS1idXR0b24nLCAnZ29vZ2xlJyk7XG5cdFx0Y29uc3QgYXBwbGVQcm92aWRlckJ1dHRvbiA9IGJ1dHRvbihsb2NhbGl6ZSgnY29udGludWVXaXRoJywgXCJDb250aW51ZSB3aXRoIHswfVwiLCBwcm92aWRlcnMuYXBwbGUubmFtZSksIENoYXRTZXR1cFN0cmF0ZWd5LlNldHVwV2l0aEFwcGxlUHJvdmlkZXIsICdjb250aW51ZS1idXR0b24nLCAnYXBwbGUnKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyQnV0dG9ucyA9IGVudGVycHJpc2VBdXRoZW50aWNhdGlvblxuXHRcdFx0PyBbZW50ZXJwcmlzZVByb3ZpZGVyQnV0dG9uLCBnb29nbGVQcm92aWRlckJ1dHRvbiwgYXBwbGVQcm92aWRlckJ1dHRvbiwgZGVmYXVsdFByb3ZpZGVyTGlua11cblx0XHRcdDogW2RlZmF1bHRQcm92aWRlckJ1dHRvbiwgZ29vZ2xlUHJvdmlkZXJCdXR0b24sIGFwcGxlUHJvdmlkZXJCdXR0b24sIGVudGVycHJpc2VQcm92aWRlckxpbmtdO1xuXHRcdHJldHVybiBvcHRpb25zPy5hbGxvd0NvbnRpbnVlV2l0aG91dFNpZ25JblxuXHRcdFx0PyBbLi4ucHJvdmlkZXJCdXR0b25zLCBidXR0b24obG9jYWxpemUoJ2NvbnRpbnVlV2l0aG91dFNpZ25pbmdJbicsIFwiQ29udGludWUgV2l0aG91dCBTaWduaW5nIEluXCIpLCBDaGF0U2V0dXBTdHJhdGVneS5DYW5jZWxlZCwgJ2xpbmstYnV0dG9uJyldXG5cdFx0XHQ6IHByb3ZpZGVyQnV0dG9ucztcblx0fVxuXG5cdHJldHVybiBbYnV0dG9uKGxvY2FsaXplKCdzZXR1cEFJQnV0dG9uJywgXCJVc2UgQUkgRmVhdHVyZXNcIiksIENoYXRTZXR1cFN0cmF0ZWd5LkRlZmF1bHRTZXR1cCldO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhdFNldHVwRGlhbG9nRm9vdGVyKFxuXHRmb3JjZUFub255bW91czogQ2hhdFNldHVwQW5vbnltb3VzIHwgdW5kZWZpbmVkLFxuXHR0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwsXG5cdHNldHRpbmdzVXJsOiBzdHJpbmcsXG5cdGNvbnRlbnQ6IElDaGF0U2V0dXBEaWFsb2dGb290ZXJDb250ZW50ID0ge1xuXHRcdHByb3ZpZGVyTmFtZTogZGVmYXVsdENoYXQucHJvdmlkZXIuZGVmYXVsdC5uYW1lLFxuXHRcdHRlcm1zU3RhdGVtZW50VXJsOiBkZWZhdWx0Q2hhdC50ZXJtc1N0YXRlbWVudFVybCxcblx0XHRwcml2YWN5U3RhdGVtZW50VXJsOiBkZWZhdWx0Q2hhdC5wcml2YWN5U3RhdGVtZW50VXJsLFxuXHRcdHB1YmxpY0NvZGVNYXRjaGVzVXJsOiBkZWZhdWx0Q2hhdC5wdWJsaWNDb2RlTWF0Y2hlc1VybCxcblx0fVxuKTogc3RyaW5nIHtcblx0aWYgKGZvcmNlQW5vbnltb3VzIHx8IHRlbGVtZXRyeUxldmVsID09PSBUZWxlbWV0cnlMZXZlbC5OT05FKSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKHsga2V5OiAnc2V0dGluZ3NBbm9ueW1vdXMnLCBjb21tZW50OiBbJ3tMb2NrZWQ9XCJbXCJ9JywgJ3tMb2NrZWQ9XCJdKHsxfSlcIn0nLCAne0xvY2tlZD1cIl0oezJ9KVwifSddIH0sIFwiQnkgY29udGludWluZywgeW91IGFncmVlIHRvIHswfSdzIFtUZXJtc10oezF9KSBhbmQgW1ByaXZhY3kgU3RhdGVtZW50XSh7Mn0pLlwiLCBjb250ZW50LnByb3ZpZGVyTmFtZSwgY29udGVudC50ZXJtc1N0YXRlbWVudFVybCwgY29udGVudC5wcml2YWN5U3RhdGVtZW50VXJsKTtcblx0fVxuXG5cdHJldHVybiBsb2NhbGl6ZSh7IGtleTogJ3NldHRpbmdzJywgY29tbWVudDogWyd7TG9ja2VkPVwiW1wifScsICd7TG9ja2VkPVwiXSh7MX0pXCJ9JywgJ3tMb2NrZWQ9XCJdKHsyfSlcIn0nLCAne0xvY2tlZD1cIl0oezR9KVwifScsICd7TG9ja2VkPVwiXSh7NX0pXCJ9J10gfSwgXCJCeSBjb250aW51aW5nLCB5b3UgYWdyZWUgdG8gezB9J3MgW1Rlcm1zXSh7MX0pIGFuZCBbUHJpdmFjeSBTdGF0ZW1lbnRdKHsyfSkuIHszfSBDb3BpbG90IG1heSBzaG93IFtwdWJsaWMgY29kZV0oezR9KSBzdWdnZXN0aW9ucyBhbmQgdXNlIHlvdXIgZGF0YSB0byBpbXByb3ZlIHRoZSBwcm9kdWN0LiBZb3UgY2FuIGNoYW5nZSB0aGVzZSBbc2V0dGluZ3NdKHs1fSkgYW55dGltZS5cIiwgY29udGVudC5wcm92aWRlck5hbWUsIGNvbnRlbnQudGVybXNTdGF0ZW1lbnRVcmwsIGNvbnRlbnQucHJpdmFjeVN0YXRlbWVudFVybCwgY29udGVudC5wcm92aWRlck5hbWUsIGNvbnRlbnQucHVibGljQ29kZU1hdGNoZXNVcmwsIHNldHRpbmdzVXJsKTtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRTZXR1cCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgaW5zdGFuY2U6IENoYXRTZXR1cCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0c3RhdGljIGdldEluc3RhbmNlKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIGNvbnRleHQ6IENoYXRFbnRpdGxlbWVudENvbnRleHQsIGNvbnRyb2xsZXI6IExhenk8Q2hhdFNldHVwQ29udHJvbGxlcj4pOiBDaGF0U2V0dXAge1xuXHRcdGxldCBpbnN0YW5jZSA9IENoYXRTZXR1cC5pbnN0YW5jZTtcblx0XHRpZiAoIWluc3RhbmNlKSB7XG5cdFx0XHRpbnN0YW5jZSA9IENoYXRTZXR1cC5pbnN0YW5jZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTZXR1cCwgY29udGV4dCwgY29udHJvbGxlcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGluc3RhbmNlO1xuXHR9XG5cblx0cHJpdmF0ZSBwZW5kaW5nUnVuOiBQcm9taXNlPElDaGF0U2V0dXBSZXN1bHQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgc2tpcERpYWxvZ09uY2UgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHQ6IENoYXRFbnRpdGxlbWVudENvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250cm9sbGVyOiBMYXp5PENoYXRTZXR1cENvbnRyb2xsZXI+LFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdEVudGl0bGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IENoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSxcblx0XHRASURlZmF1bHRBY2NvdW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlZmF1bHRBY2NvdW50U2VydmljZTogSURlZmF1bHRBY2NvdW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRza2lwRGlhbG9nKCk6IHZvaWQge1xuXHRcdHRoaXMuc2tpcERpYWxvZ09uY2UgPSB0cnVlO1xuXHR9XG5cblx0YXN5bmMgcnVuKG9wdGlvbnM/OiBJQ2hhdFNldHVwUnVuT3B0aW9ucyk6IFByb21pc2U8SUNoYXRTZXR1cFJlc3VsdD4ge1xuXHRcdGlmICh0aGlzLnBlbmRpbmdSdW4pIHtcblx0XHRcdHJldHVybiB0aGlzLnBlbmRpbmdSdW47XG5cdFx0fVxuXG5cdFx0dGhpcy5wZW5kaW5nUnVuID0gdGhpcy5kb1J1bihvcHRpb25zKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5wZW5kaW5nUnVuO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLnBlbmRpbmdSdW4gPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1J1bihvcHRpb25zPzogSUNoYXRTZXR1cFJ1bk9wdGlvbnMpOiBQcm9taXNlPElDaGF0U2V0dXBSZXN1bHQ+IHtcblx0XHR0aGlzLmNvbnRleHQudXBkYXRlKHsgbGF0ZXI6IGZhbHNlIH0pO1xuXG5cdFx0Y29uc3QgZGlhbG9nU2tpcHBlZCA9IHRoaXMuc2tpcERpYWxvZ09uY2U7XG5cdFx0dGhpcy5za2lwRGlhbG9nT25jZSA9IGZhbHNlO1xuXHRcdGlmIChvcHRpb25zPy5jYW5jZWxsYXRpb25Ub2tlbj8uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB7IGRpYWxvZ1NraXBwZWQsIHN1Y2Nlc3M6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHdhc1RydXN0ZWQgPSB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCk7XG5cdFx0Y29uc3QgdHJ1c3RlZCA9IGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5yZXF1ZXN0V29ya3NwYWNlVHJ1c3Qoe1xuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NoYXRXb3Jrc3BhY2VUcnVzdCcsIFwiQUkgZmVhdHVyZXMgYXJlIGN1cnJlbnRseSBvbmx5IHN1cHBvcnRlZCBpbiB0cnVzdGVkIHdvcmtzcGFjZXMuXCIpXG5cdFx0fSk7XG5cdFx0aWYgKCF0cnVzdGVkKSB7XG5cdFx0XHR0aGlzLmNvbnRleHQudXBkYXRlKHsgbGF0ZXI6IHRydWUgfSk7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJbnN0YWxsQ2hhdEV2ZW50LCBJbnN0YWxsQ2hhdENsYXNzaWZpY2F0aW9uPignY29tbWFuZENlbnRlci5jaGF0SW5zdGFsbCcsIHsgaW5zdGFsbFJlc3VsdDogJ2ZhaWxlZE5vdFRydXN0ZWQnLCBpbnN0YWxsRHVyYXRpb246IDAsIHNpZ25VcEVycm9yQ29kZTogdW5kZWZpbmVkLCBwcm92aWRlcjogdW5kZWZpbmVkIH0pO1xuXG5cdFx0XHRyZXR1cm4geyBkaWFsb2dTa2lwcGVkLCBzdWNjZXNzOiB1bmRlZmluZWQgLyogY2FuY2VsZWQgKi8gfTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnM/LmNhbmNlbGxhdGlvblRva2VuPy5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHsgZGlhbG9nU2tpcHBlZCwgc3VjY2VzczogdW5kZWZpbmVkIH07XG5cdFx0fVxuXG5cdFx0aWYgKCF3YXNUcnVzdGVkKSB7XG5cdFx0XHQvLyBUcnVzdCB3YXMganVzdCBncmFudGVkOiB0aGUgY2hhdCBleHRlbnNpb24gaXMgKHJlKWFjdGl2YXRpbmcsIGFuZCB0aGVcblx0XHRcdC8vIGVudGl0bGVtZW50IG9ubHkgcmVzb2x2ZXMgb25jZSBpdCBpcyB1cC4gV2FpdCBmb3IgYWN0aXZhdGlvbiBzbyB0aGVcblx0XHRcdC8vIGRpYWxvZyBkZWNpc2lvbiBiZWxvdyBpc24ndCBtYWRlIGZyb20gYSBzdGFsZSBcInNpZ25lZCBvdXRcIiBlbnRpdGxlbWVudFxuXHRcdFx0Ly8gKHdoaWNoIHdvdWxkIGJyaWVmbHkgc2hvdyB0aGUgc2lnbi1pbiBkaWFsb2cgdG8gYW4gYWxyZWFkeS1zaWduZWQtaW5cblx0XHRcdC8vIHVzZXIpLiBCb3VuZGVkLCBzbyBhIGdlbnVpbmVseSBzaWduZWQtb3V0IC8gc2xvdyBjYXNlIHN0aWxsIHByb2NlZWRzLlxuXHRcdFx0YXdhaXQgdGhpcy53aGVuQ2hhdEV4dGVuc2lvbkFjdGl2YXRlZCgpO1xuXHRcdH1cblxuXHRcdGxldCBzZXR1cFN0cmF0ZWd5OiBDaGF0U2V0dXBTdHJhdGVneTtcblx0XHRpZiAob3B0aW9ucz8uc2V0dXBTdHJhdGVneSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRzZXR1cFN0cmF0ZWd5ID0gb3B0aW9ucy5zZXR1cFN0cmF0ZWd5OyAvLyBjYWxsZXIgcHJvdmlkZWQgYSBzcGVjaWZpYyBzdHJhdGVneSwgc2tpcCBkaWFsb2dcblx0XHR9IGVsc2UgaWYgKCFvcHRpb25zPy5mb3JjZVNpZ25JbkRpYWxvZyAmJiAoZGlhbG9nU2tpcHBlZCB8fCBpc1Byb1VzZXIodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50KSB8fCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5GcmVlKSkge1xuXHRcdFx0c2V0dXBTdHJhdGVneSA9IENoYXRTZXR1cFN0cmF0ZWd5LkRlZmF1bHRTZXR1cDsgLy8gZXhpc3RpbmcgcHJvL2ZyZWUgdXNlcnMgc2V0dXAgd2l0aG91dCBhIGRpYWxvZ1xuXHRcdH0gZWxzZSBpZiAob3B0aW9ucz8uZm9yY2VBbm9ueW1vdXMgPT09IENoYXRTZXR1cEFub255bW91cy5FbmFibGVkV2l0aG91dERpYWxvZykge1xuXHRcdFx0c2V0dXBTdHJhdGVneSA9IENoYXRTZXR1cFN0cmF0ZWd5LkRlZmF1bHRTZXR1cDsgLy8gYW5vbnltb3VzIHNldHVwIHdpdGhvdXQgYSBkaWFsb2dcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2V0dXBTdHJhdGVneSA9IGF3YWl0IHRoaXMuc2hvd0RpYWxvZyhvcHRpb25zKTtcblx0XHR9XG5cblx0XHRpZiAoc2V0dXBTdHJhdGVneSA9PT0gQ2hhdFNldHVwU3RyYXRlZ3kuRGVmYXVsdFNldHVwICYmIHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLmdldERlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcigpLmVudGVycHJpc2UpIHtcblx0XHRcdHNldHVwU3RyYXRlZ3kgPSBDaGF0U2V0dXBTdHJhdGVneS5TZXR1cFdpdGhFbnRlcnByaXNlUHJvdmlkZXI7IC8vIHVzZXJzIHdpdGggYSBjb25maWd1cmVkIHByb3ZpZGVyIGdvIHRocm91Z2ggcHJvdmlkZXIgc2V0dXBcblx0XHR9XG5cblx0XHRsZXQgc3VjY2VzczogQ2hhdFNldHVwUmVzdWx0VmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IHNldHVwRXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBlcnJvckFscmVhZHlIYW5kbGVkID0gZmFsc2U7XG5cdFx0Y29uc3Qgc2V0dXBDYW5jZWxsYXRpb24gPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2Uob3B0aW9ucz8uY2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoc2V0dXBTdHJhdGVneSAhPT0gQ2hhdFNldHVwU3RyYXRlZ3kuQ2FuY2VsZWQpIHtcblx0XHRcdFx0b3B0aW9ucz8ub25TaWduSW5TdGFydGVkPy4oKCkgPT4gc2V0dXBDYW5jZWxsYXRpb24uY2FuY2VsKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2V0dXBTdHJhdGVneSAhPT0gQ2hhdFNldHVwU3RyYXRlZ3kuQ2FuY2VsZWQgJiYgIW9wdGlvbnM/LmRpc2FibGVDaGF0Vmlld1JldmVhbCkge1xuXHRcdFx0XHQvLyBTaG93IHRoZSBjaGF0IHZpZXcgbm93IHRvIGJldHRlciBpbmRpY2F0ZSBwcm9ncmVzc1xuXHRcdFx0XHQvLyB3aGlsZSBpbnN0YWxsaW5nIHRoZSBleHRlbnNpb24gb3IgcmV0dXJuaW5nIGZyb20gc2lnbiBpblxuXHRcdFx0XHR0aGlzLndpZGdldFNlcnZpY2UucmV2ZWFsV2lkZ2V0KCk7XG5cdFx0XHR9XG5cblx0XHRcdHN3aXRjaCAoc2V0dXBTdHJhdGVneSkge1xuXHRcdFx0XHRjYXNlIENoYXRTZXR1cFN0cmF0ZWd5LlNldHVwV2l0aEVudGVycHJpc2VQcm92aWRlcjpcblx0XHRcdFx0XHRzdWNjZXNzID0gYXdhaXQgdGhpcy5jb250cm9sbGVyLnZhbHVlLnNldHVwV2l0aFByb3ZpZGVyKHsgdXNlRW50ZXJwcmlzZVByb3ZpZGVyOiB0cnVlLCB1c2VTb2NpYWxQcm92aWRlcjogdW5kZWZpbmVkLCBhZGRpdGlvbmFsU2NvcGVzOiBvcHRpb25zPy5hZGRpdGlvbmFsU2NvcGVzLCBmb3JjZUFub255bW91czogb3B0aW9ucz8uZm9yY2VBbm9ueW1vdXMsIGNhbmNlbGxhdGlvblRva2VuOiBzZXR1cENhbmNlbGxhdGlvbi50b2tlbiB9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDaGF0U2V0dXBTdHJhdGVneS5TZXR1cFdpdGhvdXRFbnRlcnByaXNlUHJvdmlkZXI6XG5cdFx0XHRcdFx0c3VjY2VzcyA9IGF3YWl0IHRoaXMuY29udHJvbGxlci52YWx1ZS5zZXR1cFdpdGhQcm92aWRlcih7IHVzZUVudGVycHJpc2VQcm92aWRlcjogZmFsc2UsIHVzZVNvY2lhbFByb3ZpZGVyOiB1bmRlZmluZWQsIGFkZGl0aW9uYWxTY29wZXM6IG9wdGlvbnM/LmFkZGl0aW9uYWxTY29wZXMsIGZvcmNlQW5vbnltb3VzOiBvcHRpb25zPy5mb3JjZUFub255bW91cywgY2FuY2VsbGF0aW9uVG9rZW46IHNldHVwQ2FuY2VsbGF0aW9uLnRva2VuIH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYXRTZXR1cFN0cmF0ZWd5LlNldHVwV2l0aEFwcGxlUHJvdmlkZXI6XG5cdFx0XHRcdFx0c3VjY2VzcyA9IGF3YWl0IHRoaXMuY29udHJvbGxlci52YWx1ZS5zZXR1cFdpdGhQcm92aWRlcih7IHVzZUVudGVycHJpc2VQcm92aWRlcjogZmFsc2UsIHVzZVNvY2lhbFByb3ZpZGVyOiAnYXBwbGUnLCBhZGRpdGlvbmFsU2NvcGVzOiBvcHRpb25zPy5hZGRpdGlvbmFsU2NvcGVzLCBmb3JjZUFub255bW91czogb3B0aW9ucz8uZm9yY2VBbm9ueW1vdXMsIGNhbmNlbGxhdGlvblRva2VuOiBzZXR1cENhbmNlbGxhdGlvbi50b2tlbiB9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDaGF0U2V0dXBTdHJhdGVneS5TZXR1cFdpdGhHb29nbGVQcm92aWRlcjpcblx0XHRcdFx0XHRzdWNjZXNzID0gYXdhaXQgdGhpcy5jb250cm9sbGVyLnZhbHVlLnNldHVwV2l0aFByb3ZpZGVyKHsgdXNlRW50ZXJwcmlzZVByb3ZpZGVyOiBmYWxzZSwgdXNlU29jaWFsUHJvdmlkZXI6ICdnb29nbGUnLCBhZGRpdGlvbmFsU2NvcGVzOiBvcHRpb25zPy5hZGRpdGlvbmFsU2NvcGVzLCBmb3JjZUFub255bW91czogb3B0aW9ucz8uZm9yY2VBbm9ueW1vdXMsIGNhbmNlbGxhdGlvblRva2VuOiBzZXR1cENhbmNlbGxhdGlvbi50b2tlbiB9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDaGF0U2V0dXBTdHJhdGVneS5EZWZhdWx0U2V0dXA6XG5cdFx0XHRcdFx0c3VjY2VzcyA9IGF3YWl0IHRoaXMuY29udHJvbGxlci52YWx1ZS5zZXR1cCh7IC4uLm9wdGlvbnMsIGZvcmNlQW5vbnltb3VzOiBvcHRpb25zPy5mb3JjZUFub255bW91cywgY2FuY2VsbGF0aW9uVG9rZW46IHNldHVwQ2FuY2VsbGF0aW9uLnRva2VuIH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYXRTZXR1cFN0cmF0ZWd5LkNhbmNlbGVkOlxuXHRcdFx0XHRcdHRoaXMuY29udGV4dC51cGRhdGUoeyBsYXRlcjogdHJ1ZSB9KTtcblx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJbnN0YWxsQ2hhdEV2ZW50LCBJbnN0YWxsQ2hhdENsYXNzaWZpY2F0aW9uPignY29tbWFuZENlbnRlci5jaGF0SW5zdGFsbCcsIHsgaW5zdGFsbFJlc3VsdDogJ2ZhaWxlZE1heWJlTGF0ZXInLCBpbnN0YWxsRHVyYXRpb246IDAsIHNpZ25VcEVycm9yQ29kZTogdW5kZWZpbmVkLCBwcm92aWRlcjogdW5kZWZpbmVkIH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtjaGF0IHNldHVwXSBFcnJvciBkdXJpbmcgc2V0dXA6ICR7dG9FcnJvck1lc3NhZ2UoZXJyb3IpfWApO1xuXHRcdFx0c3VjY2VzcyA9IGZhbHNlO1xuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgQ2hhdFNldHVwRXJyb3IpIHtcblx0XHRcdFx0c2V0dXBFcnJvciA9IGVycm9yLm9yaWdpbmFsRXJyb3I7XG5cdFx0XHRcdGVycm9yQWxyZWFkeUhhbmRsZWQgPSBlcnJvci51c2VyTm90aWZpZWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzZXR1cEVycm9yID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKHRvRXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHNldHVwQ2FuY2VsbGF0aW9uLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRpZiAoc3VjY2Vzcykge1xuXHRcdFx0dGhpcy5jb250ZXh0LnVwZGF0ZSh7IGNvbXBsZXRlZDogdHJ1ZSB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBzdWNjZXNzLCBkaWFsb2dTa2lwcGVkLCBlcnJvcjogc2V0dXBFcnJvciwgZXJyb3JBbHJlYWR5SGFuZGxlZCB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGRlZmF1bHQgY2hhdCBleHRlbnNpb24gaGFzIGZpbmlzaGVkIGFjdGl2YXRpbmcuIGBhY3RpdmF0aW9uVGltZXNgXG5cdCAqIGlzIG9ubHkgc2V0IG9uY2UgYWN0aXZhdGlvbiBjb21wbGV0ZXMsIHNvIGB1bmRlZmluZWRgIG1lYW5zIFwibm90IHlldCBhY3RpdmVcIi5cblx0ICovXG5cdHByaXZhdGUgaXNDaGF0RXh0ZW5zaW9uQWN0aXZhdGVkKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHN0YXR1cyA9IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb25zU3RhdHVzKCk7XG5cdFx0Zm9yIChjb25zdCBpZCBvZiBPYmplY3Qua2V5cyhzdGF0dXMpKSB7XG5cdFx0XHRpZiAoRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoaWQsIGRlZmF1bHRDaGF0LmNoYXRFeHRlbnNpb25JZCkpIHtcblx0XHRcdFx0cmV0dXJuIHN0YXR1c1tpZF0uYWN0aXZhdGlvblRpbWVzICE9PSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyBvbmNlIHRoZSBkZWZhdWx0IGNoYXQgZXh0ZW5zaW9uIGhhcyBmaW5pc2hlZCBhY3RpdmF0aW5nIChib3VuZGVkIGJ5XG5cdCAqIGEgdGltZW91dCkuIERldGVjdGlvbiByZWxpZXMgb25seSBvbiB0aGUgZXh0ZW5zaW9uIGxpZmVjeWNsZSwgc28gaXQgbmV2ZXJcblx0ICogdG91Y2hlcyB0aGUgdXNlcidzIGF1dGhlbnRpY2F0aW9uIHNlc3Npb24uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIHdoZW5DaGF0RXh0ZW5zaW9uQWN0aXZhdGVkKHRpbWVvdXRNcyA9IDEwMDAwKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFkZWZhdWx0Q2hhdC5jaGF0RXh0ZW5zaW9uSWQgfHwgdGhpcy5pc0NoYXRFeHRlbnNpb25BY3RpdmF0ZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCByYWNlVGltZW91dChuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0Y29uc3QgY2hlY2sgPSAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuaXNDaGF0RXh0ZW5zaW9uQWN0aXZhdGVkKCkpIHtcblx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHRcdHN0b3JlLmFkZCh0aGlzLmV4dGVuc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zU3RhdHVzKGNoZWNrKSk7XG5cdFx0XHRcdHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKS50aGVuKGNoZWNrKTtcblx0XHRcdH0pLCB0aW1lb3V0TXMpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzaG93RGlhbG9nKG9wdGlvbnM/OiBJQ2hhdFNldHVwUnVuT3B0aW9ucyk6IFByb21pc2U8Q2hhdFNldHVwU3RyYXRlZ3k+IHtcblx0XHRpZiAob3B0aW9ucz8uY2FuY2VsbGF0aW9uVG9rZW4/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFNldHVwU3RyYXRlZ3kuQ2FuY2VsZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGJ1dHRvbnMgPSBnZXRDaGF0U2V0dXBEaWFsb2dCdXR0b25zKHRoaXMuY29udGV4dC5zdGF0ZS5lbnRpdGxlbWVudCwgb3B0aW9ucywgdGhpcy5kZWZhdWx0QWNjb3VudFNlcnZpY2UuZ2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyKCkuZW50ZXJwcmlzZSk7XG5cdFx0Y29uc3QgZGlhbG9nID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0U2V0dXBEaWFsb2csIHRoaXMubGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXIsIHtcblx0XHRcdHRpdGxlOiB0aGlzLmdldERpYWxvZ1RpdGxlKG9wdGlvbnMpLFxuXHRcdFx0YnV0dG9ucyxcblx0XHRcdGljb246IG9wdGlvbnM/LmRpYWxvZ0ljb24gPz8gQ29kaWNvbi5jb3BpbG90TGFyZ2UsXG5cdFx0XHRkaXNhYmxlQ2xvc2VCdXR0b246IG9wdGlvbnM/LmRpc2FibGVDbG9zZUJ1dHRvbiA/PyBmYWxzZSxcblx0XHRcdGZvb3RlcjogZ2V0Q2hhdFNldHVwRGlhbG9nRm9vdGVyKG9wdGlvbnM/LmZvcmNlQW5vbnltb3VzLCB0aGlzLnRlbGVtZXRyeVNlcnZpY2UudGVsZW1ldHJ5TGV2ZWwsIHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLnJlc29sdmVHaXRIdWJVcmwoR2l0SHViUGF0aHMuY29waWxvdFNldHRpbmdzKSksXG5cdFx0XHRleHRyYUNsYXNzZXM6IG9wdGlvbnM/LmRpYWxvZ0V4dHJhQ2xhc3Nlcyxcblx0XHRcdHJlbmRlckZvb3Rlcjogb3B0aW9ucz8ucmVuZGVyRGlhbG9nRm9vdGVyLFxuXHRcdH0pO1xuXHRcdHJldHVybiBzaG93Q2hhdFNldHVwRGlhbG9nV2l0aENhbmNlbGxhdGlvbihkaWFsb2csIG9wdGlvbnM/LmNhbmNlbGxhdGlvblRva2VuLCBvcHRpb25zPy5vbkRpZERpc21pc3NEaWFsb2cpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREaWFsb2dUaXRsZShvcHRpb25zPzogSUNoYXRTZXR1cFJ1bk9wdGlvbnMpOiBzdHJpbmcge1xuXHRcdGlmIChvcHRpb25zPy5kaWFsb2dUaXRsZSkge1xuXHRcdFx0cmV0dXJuIG9wdGlvbnMuZGlhbG9nVGl0bGU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5hbm9ueW1vdXMpIHtcblx0XHRcdGlmIChvcHRpb25zPy5mb3JjZUFub255bW91cykge1xuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3N0YXJ0VXNpbmcnLCBcIlN0YXJ0IHVzaW5nIEFJIEZlYXR1cmVzXCIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdlbmFibGVNb3JlJywgXCJFbmFibGUgbW9yZSBBSSBmZWF0dXJlc1wiKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5jb250ZXh0LnN0YXRlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuVW5rbm93biB8fCBvcHRpb25zPy5mb3JjZVNpZ25JbkRpYWxvZykge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzaWduSW4nLCBcIlNpZ24gaW4gdG8gdXNlIEdpdEh1YiBDb3BpbG90XCIpO1xuXHRcdH1cblxuXHRcdHJldHVybiBsb2NhbGl6ZSgnc3RhcnRVc2luZycsIFwiU3RhcnQgdXNpbmcgQUkgRmVhdHVyZXNcIik7XG5cdH1cblxufVxuXG4vLyNlbmRyZWdpb25cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZnJlc2hUb2tlbnMoY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSk6IHZvaWQge1xuXHQvLyB1Z2x5LCBidXQgd2UgbmVlZCB0byBzaWduYWwgdG8gdGhlIGV4dGVuc2lvbiB0aGF0IGVudGl0bGVtZW50cyBjaGFuZ2VkXG5cdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGRlZmF1bHRDaGF0LmNoYXRSZWZyZXNoVG9rZW5Db21tYW5kKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsU0FBUztBQUNsQixTQUFTLFFBQVEsK0JBQStCO0FBQ2hELFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFFdkUsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUI7QUFDNUIsT0FBTyxhQUFhO0FBQ3BCLFNBQVMsbUJBQW1CLHNCQUFzQjtBQUNsRCxTQUFTLGtDQUFrQyxxQ0FB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
