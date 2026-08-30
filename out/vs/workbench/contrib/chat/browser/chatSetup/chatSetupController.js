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
import { raceCancellation } from "../../../../../base/common/async.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { isCancellationError } from "../../../../../base/common/errors.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import Severity from "../../../../../base/common/severity.js";
import { StopWatch } from "../../../../../base/common/stopwatch.js";
import { isObject, isUndefined } from "../../../../../base/common/types.js";
import { localize } from "../../../../../nls.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions } from "../../../../../platform/configuration/common/configurationRegistry.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import product from "../../../../../platform/product/common/product.js";
import { IProgressService, ProgressLocation } from "../../../../../platform/progress/common/progress.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IActivityService, ProgressBadge } from "../../../../services/activity/common/activity.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { IExtensionsWorkbenchService } from "../../../extensions/common/extensions.js";
import { ChatEntitlement, isProUser } from "../../../../services/chat/common/chatEntitlementService.js";
import { CHAT_OPEN_ACTION_ID } from "../actions/chatActions.js";
import { ChatViewContainerId, ChatViewId } from "../chat.js";
import { ChatSetupError, ChatSetupStep, refreshTokens, maybeEnableAuthExtension } from "./chatSetup.js";
import { IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
const defaultChat = {
  chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? "",
  provider: product.defaultChatAgent?.provider ?? { default: { id: "", name: "" }, enterprise: { id: "", name: "" }, apple: { id: "", name: "" }, google: { id: "", name: "" } },
  providerUriSetting: product.defaultChatAgent?.providerUriSetting ?? "",
  completionsAdvancedSetting: product.defaultChatAgent?.completionsAdvancedSetting ?? ""
};
let ChatSetupController = class extends Disposable {
  constructor(context, requests, telemetryService, extensionsWorkbenchService, logService, progressService, activityService, commandService, dialogService, configurationService, lifecycleService, quickInputService, defaultAccountService, productService) {
    super();
    this.context = context;
    this.requests = requests;
    this.telemetryService = telemetryService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.logService = logService;
    this.progressService = progressService;
    this.activityService = activityService;
    this.commandService = commandService;
    this.dialogService = dialogService;
    this.configurationService = configurationService;
    this.lifecycleService = lifecycleService;
    this.quickInputService = quickInputService;
    this.defaultAccountService = defaultAccountService;
    this.productService = productService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._step = ChatSetupStep.Initial;
    this.registerListeners();
  }
  get step() {
    return this._step;
  }
  registerListeners() {
    this._register(this.context.onDidChange(() => this._onDidChange.fire()));
  }
  setStep(step) {
    if (this._step === step) {
      return;
    }
    this._step = step;
    this._onDidChange.fire();
  }
  async setup(options = {}) {
    const watch = new StopWatch(false);
    const title = localize("setupChatProgress", "Getting chat ready...");
    const badge = this.activityService.showViewContainerActivity(ChatViewContainerId, {
      badge: new ProgressBadge(() => title)
    });
    try {
      return await this.progressService.withProgress({
        location: ProgressLocation.Window,
        command: CHAT_OPEN_ACTION_ID,
        title
      }, () => this.doSetup(options, watch));
    } finally {
      badge.dispose();
    }
  }
  async doSetup(options, watch) {
    if (options.cancellationToken?.isCancellationRequested) {
      return void 0;
    }
    this.context.suspend();
    let success = false;
    try {
      let entitlement;
      let signIn;
      if (options.forceSignIn) {
        signIn = true;
      } else if (this.context.state.entitlement === ChatEntitlement.Unknown) {
        if (options.forceAnonymous) {
          signIn = false;
        } else {
          signIn = true;
        }
      } else {
        signIn = false;
      }
      if (signIn) {
        this.setStep(ChatSetupStep.SigningIn);
        const result = await this.signIn(options);
        if (!result) {
          return void 0;
        }
        if (!result.defaultAccount) {
          const provider = options.useSocialProvider ?? (options.useEnterpriseProvider ? defaultChat.provider.enterprise.id : defaultChat.provider.default.id);
          this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "failedNotSignedIn", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
          return void 0;
        }
        entitlement = result.entitlement;
      }
      if (options.cancellationToken?.isCancellationRequested) {
        return void 0;
      }
      this.setStep(ChatSetupStep.Installing);
      success = await this.install(entitlement ?? this.context.state.entitlement, watch, options);
    } finally {
      this.setStep(ChatSetupStep.Initial);
      this.context.resume();
    }
    return success;
  }
  async signIn(options) {
    const authExtensionReEnabled = await maybeEnableAuthExtension(this.extensionsWorkbenchService, this.logService);
    if (authExtensionReEnabled) {
      refreshTokens(this.commandService);
    }
    if (options.cancellationToken?.isCancellationRequested) {
      return void 0;
    }
    let entitlements;
    let defaultAccount;
    let signInError;
    try {
      const result = await raceCancellation(this.requests.signIn(options), options.cancellationToken ?? CancellationToken.None);
      if (!result) {
        return void 0;
      }
      ({ defaultAccount, entitlements } = result);
    } catch (e) {
      this.logService.error(`[chat setup] signIn: error ${e}`);
      signInError = e instanceof Error ? e : new Error(String(e));
    }
    if (options.cancellationToken?.isCancellationRequested) {
      return void 0;
    }
    if (!defaultAccount && !this.lifecycleService.willShutdown) {
      const { confirmed } = await this.dialogService.confirm({
        type: Severity.Error,
        message: localize("unknownSignInError", "Failed to sign in to {0}. Would you like to try again?", this.defaultAccountService.getDefaultAccountAuthenticationProvider().name),
        detail: localize("unknownSignInErrorDetail", "You must be signed in to use AI features."),
        primaryButton: localize("retry", "Retry")
      });
      if (confirmed) {
        return this.signIn(options);
      }
    }
    if (signInError) {
      throw new ChatSetupError(signInError, true);
    }
    return { defaultAccount, entitlement: entitlements?.entitlement };
  }
  async install(entitlement, watch, options) {
    const wasRunning = this.context.state.completed && !this.context.state.disabled;
    let signUpResult = void 0;
    let provider;
    if (options.forceAnonymous && entitlement === ChatEntitlement.Unknown) {
      provider = "anonymous";
    } else {
      provider = options.useSocialProvider ?? (options.useEnterpriseProvider ? defaultChat.provider.enterprise.id : defaultChat.provider.default.id);
    }
    try {
      if (!options.forceAnonymous && // User is not asking for anonymous access
      entitlement !== ChatEntitlement.Free && // User is not signed up to Copilot Free
      !isProUser(entitlement) && // User is not signed up for a Copilot subscription
      entitlement !== ChatEntitlement.Unavailable) {
        signUpResult = await this.requests.signUpFree();
        if (isUndefined(signUpResult)) {
          this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "failedNoSession", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
          return false;
        }
        if (typeof signUpResult !== "boolean") {
          this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "failedSignUp", installDuration: watch.elapsed(), signUpErrorCode: signUpResult.errorCode, provider });
        }
      }
      await this.doInstallWithRetry();
    } catch (error) {
      this.logService.error(`[chat setup] install: error ${error}`);
      this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: isCancellationError(error) ? "cancelled" : "failedInstall", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
      return false;
    }
    if (typeof signUpResult === "boolean" || typeof signUpResult === "undefined") {
      this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: wasRunning && !signUpResult ? "alreadyInstalled" : "installed", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
    }
    if (wasRunning) {
      refreshTokens(this.commandService);
    }
    return true;
  }
  async doInstallWithRetry() {
    let error;
    try {
      await this.doInstall();
    } catch (e) {
      this.logService.error(`[chat setup] install: error ${error}`);
      error = e;
    }
    if (error) {
      if (!this.lifecycleService.willShutdown) {
        const { confirmed } = await this.dialogService.confirm({
          type: Severity.Error,
          message: localize("unknownSetupError", "An error occurred while setting up chat. Would you like to try again?"),
          detail: error && !isCancellationError(error) ? toErrorMessage(error) : void 0,
          primaryButton: localize("retry", "Retry")
        });
        if (confirmed) {
          return this.doInstallWithRetry();
        }
      }
      throw error;
    }
  }
  async doInstall() {
    await this.extensionsWorkbenchService.install(defaultChat.chatExtensionId, {
      enable: true,
      isApplicationScoped: true,
      // install into all profiles
      isMachineScoped: false,
      // do not ask to sync
      installEverywhere: true,
      // install in local and remote
      installPreReleaseVersion: this.productService.quality !== "stable"
    }, ChatViewId);
  }
  async setupWithProvider(options) {
    if (options.cancellationToken?.isCancellationRequested) {
      return void 0;
    }
    const registry = Registry.as(ConfigurationExtensions.Configuration);
    registry.registerConfiguration({
      "id": "copilot.setup",
      "type": "object",
      "properties": {
        [defaultChat.completionsAdvancedSetting]: {
          "type": "object",
          "properties": {
            "authProvider": {
              "type": "string"
            }
          }
        },
        [defaultChat.providerUriSetting]: {
          "type": "string"
        }
      }
    });
    if (options.useEnterpriseProvider) {
      const success = await this.handleEnterpriseInstance();
      if (!success) {
        this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "failedEnterpriseSetup", installDuration: 0, signUpErrorCode: void 0, provider: void 0 });
        return success;
      }
    }
    if (options.cancellationToken?.isCancellationRequested) {
      return void 0;
    }
    let existingAdvancedSetting = this.configurationService.inspect(defaultChat.completionsAdvancedSetting).user?.value;
    if (!isObject(existingAdvancedSetting)) {
      existingAdvancedSetting = {};
    }
    if (options.useEnterpriseProvider) {
      await this.configurationService.updateValue(`${defaultChat.completionsAdvancedSetting}`, {
        ...existingAdvancedSetting,
        "authProvider": defaultChat.provider.enterprise.id
      }, ConfigurationTarget.USER);
    } else {
      await this.configurationService.updateValue(`${defaultChat.completionsAdvancedSetting}`, Object.keys(existingAdvancedSetting).length > 0 ? {
        ...existingAdvancedSetting,
        "authProvider": void 0
      } : void 0, ConfigurationTarget.USER);
    }
    return this.setup({ ...options, forceSignIn: true });
  }
  async handleEnterpriseInstance() {
    const domainRegEx = /^[a-zA-Z\-_]+$/;
    const fullUriRegEx = /^(https:\/\/)?([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.ghe\.com\/?$/;
    const uri = this.configurationService.getValue(defaultChat.providerUriSetting);
    if (typeof uri === "string" && fullUriRegEx.test(uri)) {
      return true;
    }
    let isSingleWord = false;
    const result = await this.quickInputService.input({
      prompt: localize("enterpriseInstance", "What is your {0} instance?", defaultChat.provider.enterprise.name),
      placeHolder: localize("enterpriseInstancePlaceholder", 'i.e. "octocat" or "https://octocat.ghe.com"...'),
      ignoreFocusLost: true,
      value: uri,
      validateInput: async (value) => {
        isSingleWord = false;
        if (!value) {
          return void 0;
        }
        if (domainRegEx.test(value)) {
          isSingleWord = true;
          return {
            content: localize("willResolveTo", "Will resolve to {0}", `https://${value}.ghe.com`),
            severity: Severity.Info
          };
        }
        if (!fullUriRegEx.test(value)) {
          return {
            content: localize("invalidEnterpriseInstance", 'You must enter a valid {0} instance (i.e. "octocat" or "https://octocat.ghe.com")', defaultChat.provider.enterprise.name),
            severity: Severity.Error
          };
        }
        return void 0;
      }
    });
    if (!result) {
      return void 0;
    }
    let resolvedUri = result;
    if (isSingleWord) {
      resolvedUri = `https://${resolvedUri}.ghe.com`;
    } else {
      const normalizedUri = result.toLowerCase();
      const hasHttps = normalizedUri.startsWith("https://");
      if (!hasHttps) {
        resolvedUri = `https://${result}`;
      }
    }
    await this.configurationService.updateValue(defaultChat.providerUriSetting, resolvedUri, ConfigurationTarget.USER);
    return true;
  }
};
ChatSetupController = __decorateClass([
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, IExtensionsWorkbenchService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IProgressService),
  __decorateParam(6, IActivityService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, ILifecycleService),
  __decorateParam(11, IQuickInputService),
  __decorateParam(12, IDefaultAccountService),
  __decorateParam(13, IProductService)
], ChatSetupController);
export {
  ChatSetupController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRTZXR1cFxcY2hhdFNldHVwQ29udHJvbGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHJhY2VDYW5jZWxsYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgaXNPYmplY3QsIGlzVW5kZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElBY3Rpdml0eVNlcnZpY2UsIFByb2dyZXNzQmFkZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9hY3Rpdml0eS9jb21tb24vYWN0aXZpdHkuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudCwgQ2hhdEVudGl0bGVtZW50Q29udGV4dCwgQ2hhdEVudGl0bGVtZW50UmVxdWVzdHMsIGlzUHJvVXNlciB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ0hBVF9PUEVOX0FDVElPTl9JRCB9IGZyb20gJy4uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdDb250YWluZXJJZCwgQ2hhdFZpZXdJZCB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdFNldHVwQW5vbnltb3VzLCBDaGF0U2V0dXBFcnJvciwgQ2hhdFNldHVwU3RlcCwgQ2hhdFNldHVwUmVzdWx0VmFsdWUsIEluc3RhbGxDaGF0RXZlbnQsIEluc3RhbGxDaGF0Q2xhc3NpZmljYXRpb24sIHJlZnJlc2hUb2tlbnMsIG1heWJlRW5hYmxlQXV0aEV4dGVuc2lvbiB9IGZyb20gJy4vY2hhdFNldHVwLmpzJztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuXG5jb25zdCBkZWZhdWx0Q2hhdCA9IHtcblx0Y2hhdEV4dGVuc2lvbklkOiBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LmNoYXRFeHRlbnNpb25JZCA/PyAnJyxcblx0cHJvdmlkZXI6IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8ucHJvdmlkZXIgPz8geyBkZWZhdWx0OiB7IGlkOiAnJywgbmFtZTogJycgfSwgZW50ZXJwcmlzZTogeyBpZDogJycsIG5hbWU6ICcnIH0sIGFwcGxlOiB7IGlkOiAnJywgbmFtZTogJycgfSwgZ29vZ2xlOiB7IGlkOiAnJywgbmFtZTogJycgfSB9LFxuXHRwcm92aWRlclVyaVNldHRpbmc6IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8ucHJvdmlkZXJVcmlTZXR0aW5nID8/ICcnLFxuXHRjb21wbGV0aW9uc0FkdmFuY2VkU2V0dGluZzogcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5jb21wbGV0aW9uc0FkdmFuY2VkU2V0dGluZyA/PyAnJyxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRTZXR1cENvbnRyb2xsZXJPcHRpb25zIHtcblx0cmVhZG9ubHkgZm9yY2VTaWduSW4/OiBib29sZWFuO1xuXHRyZWFkb25seSB1c2VTb2NpYWxQcm92aWRlcj86IHN0cmluZztcblx0cmVhZG9ubHkgdXNlRW50ZXJwcmlzZVByb3ZpZGVyPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgYWRkaXRpb25hbFNjb3Blcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBmb3JjZUFub255bW91cz86IENoYXRTZXR1cEFub255bW91cztcblx0cmVhZG9ubHkgY2FuY2VsbGF0aW9uVG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbjtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRTZXR1cENvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgX3N0ZXAgPSBDaGF0U2V0dXBTdGVwLkluaXRpYWw7XG5cdGdldCBzdGVwKCk6IENoYXRTZXR1cFN0ZXAgeyByZXR1cm4gdGhpcy5fc3RlcDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dDogQ2hhdEVudGl0bGVtZW50Q29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlcXVlc3RzOiBDaGF0RW50aXRsZW1lbnRSZXF1ZXN0cyxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASUFjdGl2aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGl2aXR5U2VydmljZTogSUFjdGl2aXR5U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASURlZmF1bHRBY2NvdW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlZmF1bHRBY2NvdW50U2VydmljZTogSURlZmF1bHRBY2NvdW50U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0Lm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRTdGVwKHN0ZXA6IENoYXRTZXR1cFN0ZXApOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RlcCA9PT0gc3RlcCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0ZXAgPSBzdGVwO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0fVxuXG5cdGFzeW5jIHNldHVwKG9wdGlvbnM6IElDaGF0U2V0dXBDb250cm9sbGVyT3B0aW9ucyA9IHt9KTogUHJvbWlzZTxDaGF0U2V0dXBSZXN1bHRWYWx1ZT4ge1xuXHRcdGNvbnN0IHdhdGNoID0gbmV3IFN0b3BXYXRjaChmYWxzZSk7XG5cdFx0Y29uc3QgdGl0bGUgPSBsb2NhbGl6ZSgnc2V0dXBDaGF0UHJvZ3Jlc3MnLCBcIkdldHRpbmcgY2hhdCByZWFkeS4uLlwiKTtcblx0XHRjb25zdCBiYWRnZSA9IHRoaXMuYWN0aXZpdHlTZXJ2aWNlLnNob3dWaWV3Q29udGFpbmVyQWN0aXZpdHkoQ2hhdFZpZXdDb250YWluZXJJZCwge1xuXHRcdFx0YmFkZ2U6IG5ldyBQcm9ncmVzc0JhZGdlKCgpID0+IHRpdGxlKSxcblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHtcblx0XHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uV2luZG93LFxuXHRcdFx0XHRjb21tYW5kOiBDSEFUX09QRU5fQUNUSU9OX0lELFxuXHRcdFx0XHR0aXRsZSxcblx0XHRcdH0sICgpID0+IHRoaXMuZG9TZXR1cChvcHRpb25zLCB3YXRjaCkpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRiYWRnZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1NldHVwKG9wdGlvbnM6IElDaGF0U2V0dXBDb250cm9sbGVyT3B0aW9ucywgd2F0Y2g6IFN0b3BXYXRjaCk6IFByb21pc2U8Q2hhdFNldHVwUmVzdWx0VmFsdWU+IHtcblx0XHRpZiAob3B0aW9ucy5jYW5jZWxsYXRpb25Ub2tlbj8uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb250ZXh0LnN1c3BlbmQoKTsgIC8vIHJlZHVjZXMgZmxpY2tlclxuXG5cdFx0bGV0IHN1Y2Nlc3M6IENoYXRTZXR1cFJlc3VsdFZhbHVlID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGxldCBlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRsZXQgc2lnbkluOiBib29sZWFuO1xuXHRcdFx0aWYgKG9wdGlvbnMuZm9yY2VTaWduSW4pIHtcblx0XHRcdFx0c2lnbkluID0gdHJ1ZTsgLy8gZm9yY2VkIHRvIHNpZ24gaW5cblx0XHRcdH0gZWxzZSBpZiAodGhpcy5jb250ZXh0LnN0YXRlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuVW5rbm93bikge1xuXHRcdFx0XHRpZiAob3B0aW9ucy5mb3JjZUFub255bW91cykge1xuXHRcdFx0XHRcdHNpZ25JbiA9IGZhbHNlOyAvLyBmb3JjZWQgdG8gYW5vbnltb3VzIHdpdGhvdXQgc2lnbiBpblxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNpZ25JbiA9IHRydWU7IC8vIHNpZ24gaW4gc2luY2Ugd2UgYXJlIHNpZ25lZCBvdXRcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2lnbkluID0gZmFsc2U7IC8vIGFscmVhZHkgc2lnbmVkIGluXG5cdFx0XHR9XG5cblx0XHRcdGlmIChzaWduSW4pIHtcblx0XHRcdFx0dGhpcy5zZXRTdGVwKENoYXRTZXR1cFN0ZXAuU2lnbmluZ0luKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zaWduSW4ob3B0aW9ucyk7XG5cdFx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXJlc3VsdC5kZWZhdWx0QWNjb3VudCkge1xuXHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyID0gb3B0aW9ucy51c2VTb2NpYWxQcm92aWRlciA/PyAob3B0aW9ucy51c2VFbnRlcnByaXNlUHJvdmlkZXIgPyBkZWZhdWx0Q2hhdC5wcm92aWRlci5lbnRlcnByaXNlLmlkIDogZGVmYXVsdENoYXQucHJvdmlkZXIuZGVmYXVsdC5pZCk7XG5cdFx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8SW5zdGFsbENoYXRFdmVudCwgSW5zdGFsbENoYXRDbGFzc2lmaWNhdGlvbj4oJ2NvbW1hbmRDZW50ZXIuY2hhdEluc3RhbGwnLCB7IGluc3RhbGxSZXN1bHQ6ICdmYWlsZWROb3RTaWduZWRJbicsIGluc3RhbGxEdXJhdGlvbjogd2F0Y2guZWxhcHNlZCgpLCBzaWduVXBFcnJvckNvZGU6IHVuZGVmaW5lZCwgcHJvdmlkZXIgfSk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gdHJlYXQgYXMgY2FuY2VsbGVkIGJlY2F1c2Ugc2lnbmluZyBpbiBhbHJlYWR5IHRyaWdnZXJzIGFuIGVycm9yIGRpYWxvZ1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZW50aXRsZW1lbnQgPSByZXN1bHQuZW50aXRsZW1lbnQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChvcHRpb25zLmNhbmNlbGxhdGlvblRva2VuPy5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBd2FpdCBJbnN0YWxsXG5cdFx0XHR0aGlzLnNldFN0ZXAoQ2hhdFNldHVwU3RlcC5JbnN0YWxsaW5nKTtcblx0XHRcdHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLmluc3RhbGwoZW50aXRsZW1lbnQgPz8gdGhpcy5jb250ZXh0LnN0YXRlLmVudGl0bGVtZW50LCB3YXRjaCwgb3B0aW9ucyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuc2V0U3RlcChDaGF0U2V0dXBTdGVwLkluaXRpYWwpO1xuXHRcdFx0dGhpcy5jb250ZXh0LnJlc3VtZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdWNjZXNzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzaWduSW4ob3B0aW9uczogSUNoYXRTZXR1cENvbnRyb2xsZXJPcHRpb25zKTogUHJvbWlzZTx7IGRlZmF1bHRBY2NvdW50OiBJRGVmYXVsdEFjY291bnQgfCB1bmRlZmluZWQ7IGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGF1dGhFeHRlbnNpb25SZUVuYWJsZWQgPSBhd2FpdCBtYXliZUVuYWJsZUF1dGhFeHRlbnNpb24odGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRpZiAoYXV0aEV4dGVuc2lvblJlRW5hYmxlZCkge1xuXHRcdFx0cmVmcmVzaFRva2Vucyh0aGlzLmNvbW1hbmRTZXJ2aWNlKTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMuY2FuY2VsbGF0aW9uVG9rZW4/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCBlbnRpdGxlbWVudHM7XG5cdFx0bGV0IGRlZmF1bHRBY2NvdW50O1xuXHRcdGxldCBzaWduSW5FcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJhY2VDYW5jZWxsYXRpb24odGhpcy5yZXF1ZXN0cy5zaWduSW4ob3B0aW9ucyksIG9wdGlvbnMuY2FuY2VsbGF0aW9uVG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0KHsgZGVmYXVsdEFjY291bnQsIGVudGl0bGVtZW50cyB9ID0gcmVzdWx0KTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtjaGF0IHNldHVwXSBzaWduSW46IGVycm9yICR7ZX1gKTtcblx0XHRcdHNpZ25JbkVycm9yID0gZSBpbnN0YW5jZW9mIEVycm9yID8gZSA6IG5ldyBFcnJvcihTdHJpbmcoZSkpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLmNhbmNlbGxhdGlvblRva2VuPy5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIWRlZmF1bHRBY2NvdW50ICYmICF0aGlzLmxpZmVjeWNsZVNlcnZpY2Uud2lsbFNodXRkb3duKSB7XG5cdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHR0eXBlOiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3Vua25vd25TaWduSW5FcnJvcicsIFwiRmFpbGVkIHRvIHNpZ24gaW4gdG8gezB9LiBXb3VsZCB5b3UgbGlrZSB0byB0cnkgYWdhaW4/XCIsIHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLmdldERlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcigpLm5hbWUpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCd1bmtub3duU2lnbkluRXJyb3JEZXRhaWwnLCBcIllvdSBtdXN0IGJlIHNpZ25lZCBpbiB0byB1c2UgQUkgZmVhdHVyZXMuXCIpLFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgncmV0cnknLCBcIlJldHJ5XCIpXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKGNvbmZpcm1lZCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zaWduSW4ob3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChzaWduSW5FcnJvcikge1xuXHRcdFx0dGhyb3cgbmV3IENoYXRTZXR1cEVycm9yKHNpZ25JbkVycm9yLCB0cnVlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBkZWZhdWx0QWNjb3VudCwgZW50aXRsZW1lbnQ6IGVudGl0bGVtZW50cz8uZW50aXRsZW1lbnQgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW5zdGFsbChlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LCB3YXRjaDogU3RvcFdhdGNoLCBvcHRpb25zOiBJQ2hhdFNldHVwQ29udHJvbGxlck9wdGlvbnMpOiBQcm9taXNlPENoYXRTZXR1cFJlc3VsdFZhbHVlPiB7XG5cdFx0Y29uc3Qgd2FzUnVubmluZyA9IHRoaXMuY29udGV4dC5zdGF0ZS5jb21wbGV0ZWQgJiYgIXRoaXMuY29udGV4dC5zdGF0ZS5kaXNhYmxlZDtcblx0XHRsZXQgc2lnblVwUmVzdWx0OiBib29sZWFuIHwgeyBlcnJvckNvZGU6IG51bWJlciB9IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0bGV0IHByb3ZpZGVyOiBzdHJpbmc7XG5cdFx0aWYgKG9wdGlvbnMuZm9yY2VBbm9ueW1vdXMgJiYgZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5Vbmtub3duKSB7XG5cdFx0XHRwcm92aWRlciA9ICdhbm9ueW1vdXMnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwcm92aWRlciA9IG9wdGlvbnMudXNlU29jaWFsUHJvdmlkZXIgPz8gKG9wdGlvbnMudXNlRW50ZXJwcmlzZVByb3ZpZGVyID8gZGVmYXVsdENoYXQucHJvdmlkZXIuZW50ZXJwcmlzZS5pZCA6IGRlZmF1bHRDaGF0LnByb3ZpZGVyLmRlZmF1bHQuaWQpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdCFvcHRpb25zLmZvcmNlQW5vbnltb3VzICYmXHRcdFx0XHRcdFx0Ly8gVXNlciBpcyBub3QgYXNraW5nIGZvciBhbm9ueW1vdXMgYWNjZXNzXG5cdFx0XHRcdGVudGl0bGVtZW50ICE9PSBDaGF0RW50aXRsZW1lbnQuRnJlZSAmJlx0XHRcdC8vIFVzZXIgaXMgbm90IHNpZ25lZCB1cCB0byBDb3BpbG90IEZyZWVcblx0XHRcdFx0IWlzUHJvVXNlcihlbnRpdGxlbWVudCkgJiZcdFx0XHRcdFx0XHQvLyBVc2VyIGlzIG5vdCBzaWduZWQgdXAgZm9yIGEgQ29waWxvdCBzdWJzY3JpcHRpb25cblx0XHRcdFx0ZW50aXRsZW1lbnQgIT09IENoYXRFbnRpdGxlbWVudC5VbmF2YWlsYWJsZVx0XHQvLyBVc2VyIGlzIGVsaWdpYmxlIGZvciBDb3BpbG90IEZyZWVcblx0XHRcdCkge1xuXHRcdFx0XHRzaWduVXBSZXN1bHQgPSBhd2FpdCB0aGlzLnJlcXVlc3RzLnNpZ25VcEZyZWUoKTtcblxuXHRcdFx0XHRpZiAoaXNVbmRlZmluZWQoc2lnblVwUmVzdWx0KSkge1xuXHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEluc3RhbGxDaGF0RXZlbnQsIEluc3RhbGxDaGF0Q2xhc3NpZmljYXRpb24+KCdjb21tYW5kQ2VudGVyLmNoYXRJbnN0YWxsJywgeyBpbnN0YWxsUmVzdWx0OiAnZmFpbGVkTm9TZXNzaW9uJywgaW5zdGFsbER1cmF0aW9uOiB3YXRjaC5lbGFwc2VkKCksIHNpZ25VcEVycm9yQ29kZTogdW5kZWZpbmVkLCBwcm92aWRlciB9KTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7IC8vIHVuZXhwZWN0ZWRcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0eXBlb2Ygc2lnblVwUmVzdWx0ICE9PSAnYm9vbGVhbicgLyogZXJyb3IgKi8pIHtcblx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJbnN0YWxsQ2hhdEV2ZW50LCBJbnN0YWxsQ2hhdENsYXNzaWZpY2F0aW9uPignY29tbWFuZENlbnRlci5jaGF0SW5zdGFsbCcsIHsgaW5zdGFsbFJlc3VsdDogJ2ZhaWxlZFNpZ25VcCcsIGluc3RhbGxEdXJhdGlvbjogd2F0Y2guZWxhcHNlZCgpLCBzaWduVXBFcnJvckNvZGU6IHNpZ25VcFJlc3VsdC5lcnJvckNvZGUsIHByb3ZpZGVyIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHRoaXMuZG9JbnN0YWxsV2l0aFJldHJ5KCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW2NoYXQgc2V0dXBdIGluc3RhbGw6IGVycm9yICR7ZXJyb3J9YCk7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJbnN0YWxsQ2hhdEV2ZW50LCBJbnN0YWxsQ2hhdENsYXNzaWZpY2F0aW9uPignY29tbWFuZENlbnRlci5jaGF0SW5zdGFsbCcsIHsgaW5zdGFsbFJlc3VsdDogaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikgPyAnY2FuY2VsbGVkJyA6ICdmYWlsZWRJbnN0YWxsJywgaW5zdGFsbER1cmF0aW9uOiB3YXRjaC5lbGFwc2VkKCksIHNpZ25VcEVycm9yQ29kZTogdW5kZWZpbmVkLCBwcm92aWRlciB9KTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHNpZ25VcFJlc3VsdCA9PT0gJ2Jvb2xlYW4nIC8qIG5vdCBhbiBlcnJvciBjYXNlICovIHx8IHR5cGVvZiBzaWduVXBSZXN1bHQgPT09ICd1bmRlZmluZWQnIC8qIGFscmVhZHkgc2lnbmVkIHVwICovKSB7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJbnN0YWxsQ2hhdEV2ZW50LCBJbnN0YWxsQ2hhdENsYXNzaWZpY2F0aW9uPignY29tbWFuZENlbnRlci5jaGF0SW5zdGFsbCcsIHsgaW5zdGFsbFJlc3VsdDogd2FzUnVubmluZyAmJiAhc2lnblVwUmVzdWx0ID8gJ2FscmVhZHlJbnN0YWxsZWQnIDogJ2luc3RhbGxlZCcsIGluc3RhbGxEdXJhdGlvbjogd2F0Y2guZWxhcHNlZCgpLCBzaWduVXBFcnJvckNvZGU6IHVuZGVmaW5lZCwgcHJvdmlkZXIgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKHdhc1J1bm5pbmcpIHtcblx0XHRcdC8vIFdlIGFsd2F5cyB0cmlnZ2VyIHJlZnJlc2ggb2YgdG9rZW5zIHRvIGhlbHAgdGhlIHVzZXJcblx0XHRcdC8vIGdldCBvdXQgb2YgYXV0aGVudGljYXRpb24gaXNzdWVzIHRoYXQgY2FuIGhhcHBlbiB3aGVuXG5cdFx0XHQvLyBmb3IgZXhhbXBsZSB0aGUgc2lnbi11cCByYW4gYWZ0ZXIgdGhlIGV4dGVuc2lvbiB0cmllZFxuXHRcdFx0Ly8gdG8gdXNlIHRoZSBhdXRoZW50aWNhdGlvbiBpbmZvcm1hdGlvbiB0byBtaW50IGEgdG9rZW5cblx0XHRcdHJlZnJlc2hUb2tlbnModGhpcy5jb21tYW5kU2VydmljZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvSW5zdGFsbFdpdGhSZXRyeSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgZXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRvSW5zdGFsbCgpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW2NoYXQgc2V0dXBdIGluc3RhbGw6IGVycm9yICR7ZXJyb3J9YCk7XG5cdFx0XHRlcnJvciA9IGU7XG5cdFx0fVxuXG5cdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRpZiAoIXRoaXMubGlmZWN5Y2xlU2VydmljZS53aWxsU2h1dGRvd24pIHtcblx0XHRcdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0XHR0eXBlOiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndW5rbm93blNldHVwRXJyb3InLCBcIkFuIGVycm9yIG9jY3VycmVkIHdoaWxlIHNldHRpbmcgdXAgY2hhdC4gV291bGQgeW91IGxpa2UgdG8gdHJ5IGFnYWluP1wiKSxcblx0XHRcdFx0XHRkZXRhaWw6IGVycm9yICYmICFpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSA/IHRvRXJyb3JNZXNzYWdlKGVycm9yKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgncmV0cnknLCBcIlJldHJ5XCIpXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmIChjb25maXJtZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5kb0luc3RhbGxXaXRoUmV0cnkoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvSW5zdGFsbCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGwoZGVmYXVsdENoYXQuY2hhdEV4dGVuc2lvbklkLCB7XG5cdFx0XHRlbmFibGU6IHRydWUsXG5cdFx0XHRpc0FwcGxpY2F0aW9uU2NvcGVkOiB0cnVlLCBcdC8vIGluc3RhbGwgaW50byBhbGwgcHJvZmlsZXNcblx0XHRcdGlzTWFjaGluZVNjb3BlZDogZmFsc2UsXHRcdC8vIGRvIG5vdCBhc2sgdG8gc3luY1xuXHRcdFx0aW5zdGFsbEV2ZXJ5d2hlcmU6IHRydWUsXHQvLyBpbnN0YWxsIGluIGxvY2FsIGFuZCByZW1vdGVcblx0XHRcdGluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbjogdGhpcy5wcm9kdWN0U2VydmljZS5xdWFsaXR5ICE9PSAnc3RhYmxlJ1xuXHRcdH0sIENoYXRWaWV3SWQpO1xuXHR9XG5cblx0YXN5bmMgc2V0dXBXaXRoUHJvdmlkZXIob3B0aW9uczogSUNoYXRTZXR1cENvbnRyb2xsZXJPcHRpb25zKTogUHJvbWlzZTxDaGF0U2V0dXBSZXN1bHRWYWx1ZT4ge1xuXHRcdGlmIChvcHRpb25zLmNhbmNlbGxhdGlvblRva2VuPy5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRcdHJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnY29waWxvdC5zZXR1cCcsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdFtkZWZhdWx0Q2hhdC5jb21wbGV0aW9uc0FkdmFuY2VkU2V0dGluZ106IHtcblx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHRcdFx0J2F1dGhQcm92aWRlcic6IHtcblx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0W2RlZmF1bHRDaGF0LnByb3ZpZGVyVXJpU2V0dGluZ106IHtcblx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmIChvcHRpb25zLnVzZUVudGVycHJpc2VQcm92aWRlcikge1xuXHRcdFx0Y29uc3Qgc3VjY2VzcyA9IGF3YWl0IHRoaXMuaGFuZGxlRW50ZXJwcmlzZUluc3RhbmNlKCk7XG5cdFx0XHRpZiAoIXN1Y2Nlc3MpIHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8SW5zdGFsbENoYXRFdmVudCwgSW5zdGFsbENoYXRDbGFzc2lmaWNhdGlvbj4oJ2NvbW1hbmRDZW50ZXIuY2hhdEluc3RhbGwnLCB7IGluc3RhbGxSZXN1bHQ6ICdmYWlsZWRFbnRlcnByaXNlU2V0dXAnLCBpbnN0YWxsRHVyYXRpb246IDAsIHNpZ25VcEVycm9yQ29kZTogdW5kZWZpbmVkLCBwcm92aWRlcjogdW5kZWZpbmVkIH0pO1xuXHRcdFx0XHRyZXR1cm4gc3VjY2VzczsgLy8gbm90IHByb3Blcmx5IGNvbmZpZ3VyZWQsIGFib3J0XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLmNhbmNlbGxhdGlvblRva2VuPy5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgZXhpc3RpbmdBZHZhbmNlZFNldHRpbmcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3QoZGVmYXVsdENoYXQuY29tcGxldGlvbnNBZHZhbmNlZFNldHRpbmcpLnVzZXI/LnZhbHVlO1xuXHRcdGlmICghaXNPYmplY3QoZXhpc3RpbmdBZHZhbmNlZFNldHRpbmcpKSB7XG5cdFx0XHRleGlzdGluZ0FkdmFuY2VkU2V0dGluZyA9IHt9O1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLnVzZUVudGVycHJpc2VQcm92aWRlcikge1xuXHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShgJHtkZWZhdWx0Q2hhdC5jb21wbGV0aW9uc0FkdmFuY2VkU2V0dGluZ31gLCB7XG5cdFx0XHRcdC4uLmV4aXN0aW5nQWR2YW5jZWRTZXR0aW5nLFxuXHRcdFx0XHQnYXV0aFByb3ZpZGVyJzogZGVmYXVsdENoYXQucHJvdmlkZXIuZW50ZXJwcmlzZS5pZFxuXHRcdFx0fSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShgJHtkZWZhdWx0Q2hhdC5jb21wbGV0aW9uc0FkdmFuY2VkU2V0dGluZ31gLCBPYmplY3Qua2V5cyhleGlzdGluZ0FkdmFuY2VkU2V0dGluZykubGVuZ3RoID4gMCA/IHtcblx0XHRcdFx0Li4uZXhpc3RpbmdBZHZhbmNlZFNldHRpbmcsXG5cdFx0XHRcdCdhdXRoUHJvdmlkZXInOiB1bmRlZmluZWRcblx0XHRcdH0gOiB1bmRlZmluZWQsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuc2V0dXAoeyAuLi5vcHRpb25zLCBmb3JjZVNpZ25JbjogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlRW50ZXJwcmlzZUluc3RhbmNlKCk6IFByb21pc2U8Q2hhdFNldHVwUmVzdWx0VmFsdWU+IHtcblx0XHRjb25zdCBkb21haW5SZWdFeCA9IC9eW2EtekEtWlxcLV9dKyQvO1xuXHRcdGNvbnN0IGZ1bGxVcmlSZWdFeCA9IC9eKGh0dHBzOlxcL1xcLyk/KFthLXpBLVowLTktXStcXC4pKlthLXpBLVowLTktXStcXC5naGVcXC5jb21cXC8/JC87XG5cblx0XHRjb25zdCB1cmkgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oZGVmYXVsdENoYXQucHJvdmlkZXJVcmlTZXR0aW5nKTtcblx0XHRpZiAodHlwZW9mIHVyaSA9PT0gJ3N0cmluZycgJiYgZnVsbFVyaVJlZ0V4LnRlc3QodXJpKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIGFscmVhZHkgc2V0dXAgd2l0aCBhIHZhbGlkIFVSSVxuXHRcdH1cblxuXHRcdGxldCBpc1NpbmdsZVdvcmQgPSBmYWxzZTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmlucHV0KHtcblx0XHRcdHByb21wdDogbG9jYWxpemUoJ2VudGVycHJpc2VJbnN0YW5jZScsIFwiV2hhdCBpcyB5b3VyIHswfSBpbnN0YW5jZT9cIiwgZGVmYXVsdENoYXQucHJvdmlkZXIuZW50ZXJwcmlzZS5uYW1lKSxcblx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnZW50ZXJwcmlzZUluc3RhbmNlUGxhY2Vob2xkZXInLCAnaS5lLiBcIm9jdG9jYXRcIiBvciBcImh0dHBzOi8vb2N0b2NhdC5naGUuY29tXCIuLi4nKSxcblx0XHRcdGlnbm9yZUZvY3VzTG9zdDogdHJ1ZSxcblx0XHRcdHZhbHVlOiB1cmksXG5cdFx0XHR2YWxpZGF0ZUlucHV0OiBhc3luYyB2YWx1ZSA9PiB7XG5cdFx0XHRcdGlzU2luZ2xlV29yZCA9IGZhbHNlO1xuXHRcdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChkb21haW5SZWdFeC50ZXN0KHZhbHVlKSkge1xuXHRcdFx0XHRcdGlzU2luZ2xlV29yZCA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IGxvY2FsaXplKCd3aWxsUmVzb2x2ZVRvJywgXCJXaWxsIHJlc29sdmUgdG8gezB9XCIsIGBodHRwczovLyR7dmFsdWV9LmdoZS5jb21gKSxcblx0XHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBpZiAoIWZ1bGxVcmlSZWdFeC50ZXN0KHZhbHVlKSkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiBsb2NhbGl6ZSgnaW52YWxpZEVudGVycHJpc2VJbnN0YW5jZScsICdZb3UgbXVzdCBlbnRlciBhIHZhbGlkIHswfSBpbnN0YW5jZSAoaS5lLiBcIm9jdG9jYXRcIiBvciBcImh0dHBzOi8vb2N0b2NhdC5naGUuY29tXCIpJywgZGVmYXVsdENoYXQucHJvdmlkZXIuZW50ZXJwcmlzZS5uYW1lKSxcblx0XHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvclxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIGNhbmNlbGVkXG5cdFx0fVxuXG5cdFx0bGV0IHJlc29sdmVkVXJpID0gcmVzdWx0O1xuXHRcdGlmIChpc1NpbmdsZVdvcmQpIHtcblx0XHRcdHJlc29sdmVkVXJpID0gYGh0dHBzOi8vJHtyZXNvbHZlZFVyaX0uZ2hlLmNvbWA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG5vcm1hbGl6ZWRVcmkgPSByZXN1bHQudG9Mb3dlckNhc2UoKTtcblx0XHRcdGNvbnN0IGhhc0h0dHBzID0gbm9ybWFsaXplZFVyaS5zdGFydHNXaXRoKCdodHRwczovLycpO1xuXHRcdFx0aWYgKCFoYXNIdHRwcykge1xuXHRcdFx0XHRyZXNvbHZlZFVyaSA9IGBodHRwczovLyR7cmVzdWx0fWA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShkZWZhdWx0Q2hhdC5wcm92aWRlclVyaVNldHRpbmcsIHJlc29sdmVkVXJpLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLE9BQU8sY0FBYztBQUNyQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFVBQVUsbUJBQW1CO0FBQ3RDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLGNBQWMsK0JBQXVEO0FBQzlFLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUJB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
