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
import { Emitter } from "../../../../base/common/event.js";
import { $, append, addDisposableListener, EventType, clearNode, getActiveWindow } from "../../../../base/browser/dom.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { URI } from "../../../../base/common/uri.js";
import { isWindows, isMacintosh, isLinux } from "../../../../base/common/platform.js";
import { FileAccess } from "../../../../base/common/network.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { InputBox } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { localize } from "../../../../nls.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Action } from "../../../../base/common/actions.js";
import { IWorkbenchThemeService } from "../../../services/themes/common/workbenchThemeService.js";
import { EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, IExtensionGalleryService, IExtensionManagementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { GitHubPaths, IDefaultAccountService } from "../../../../platform/defaultAccount/common/defaultAccount.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { defaultInputBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import product from "../../../../platform/product/common/product.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { ChatSetupStrategy } from "../../chat/browser/chatSetup/chatSetup.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import {
  OnboardingStepId,
  ONBOARDING_STEPS,
  ONBOARDING_AI_PREFERENCE_OPTIONS,
  AiCollaborationMode,
  getOnboardingStepTitle,
  getOnboardingStepSubtitle,
  GHE_FULL_URI_REGEX,
  GheParseResultKind,
  parseGheInstanceInput
} from "../common/onboardingTypes.js";
const defaultChat = product.defaultChatAgent;
let OnboardingVariationA = class extends Disposable {
  constructor(layoutService, themeService, defaultAccountService, extensionGalleryService, extensionManagementService, configurationService, notificationService, fileService, pathService, telemetryService, commandService, accessibilityService) {
    super();
    this.layoutService = layoutService;
    this.themeService = themeService;
    this.defaultAccountService = defaultAccountService;
    this.extensionGalleryService = extensionGalleryService;
    this.extensionManagementService = extensionManagementService;
    this.configurationService = configurationService;
    this.notificationService = notificationService;
    this.fileService = fileService;
    this.pathService = pathService;
    this.telemetryService = telemetryService;
    this.commandService = commandService;
    this.accessibilityService = accessibilityService;
    this._onDidComplete = this._register(new Emitter());
    this.onDidComplete = this._onDidComplete.event;
    this._onDidDismiss = this._register(new Emitter());
    this.onDidDismiss = this._onDidDismiss.event;
    this.currentStepIndex = 0;
    this.steps = ONBOARDING_STEPS;
    this.disposables = this._register(new DisposableStore());
    this.stepDisposables = this._register(new DisposableStore());
    this._isShowing = false;
    this.footerFocusableElements = [];
    this.stepFocusableElements = [];
    this.selectedThemeId = "dark-2026";
    this.selectedKeymapId = "vscode";
    this._userSignedIn = false;
    this.selectedAiMode = AiCollaborationMode.Balanced;
    this.enterpriseSignInUiState = "options";
    this.enterpriseInstanceValue = "";
    const currentTheme = this.themeService.getColorTheme();
    const allThemes = product.onboardingThemes ?? [];
    const matchingTheme = allThemes.find((t) => t.themeId === currentTheme.settingsId);
    if (matchingTheme) {
      this.selectedThemeId = matchingTheme.id;
    }
    this._detectInstalledEditors().then((ids) => {
      this._detectedEditorIds = ids;
    });
  }
  get isShowing() {
    return this._isShowing;
  }
  show() {
    if (!product.defaultChatAgent || this.overlay) {
      return;
    }
    this._isShowing = true;
    this.previouslyFocusedElement = getActiveWindow().document.activeElement;
    const container = this.layoutService.activeContainer;
    this.overlay = append(container, $(".onboarding-a-overlay"));
    this.overlay.setAttribute("role", "dialog");
    this.overlay.setAttribute("aria-modal", "true");
    this.overlay.setAttribute("aria-label", localize("onboarding.a.aria", "Welcome to Visual Studio Code"));
    this.card = append(this.overlay, $(".onboarding-a-card"));
    this.closeButton = append(this.card, $("button.onboarding-a-close-btn"));
    this.closeButton.type = "button";
    this.closeButton.setAttribute("aria-label", localize("onboarding.close", "Close"));
    this.closeButton.appendChild(renderIcon(Codicon.close));
    const header = append(this.card, $(".onboarding-a-header"));
    this.progressContainer = append(header, $(".onboarding-a-progress"));
    this.stepLabelEl = append(this.progressContainer, $("span.onboarding-a-step-label"));
    this._renderProgress();
    this.bodyEl = append(this.card, $(".onboarding-a-body"));
    this.titleEl = append(this.bodyEl, $("h2.onboarding-a-step-title"));
    this.subtitleEl = append(this.bodyEl, $("p.onboarding-a-step-subtitle"));
    this.contentEl = append(this.bodyEl, $(".onboarding-a-step-content"));
    this._renderStep();
    this._logStepView();
    const footer = append(this.card, $(".onboarding-a-footer"));
    this.footerLeft = append(footer, $(".onboarding-a-footer-left"));
    const footerRight = append(footer, $(".onboarding-a-footer-right"));
    this.backButton = append(footerRight, $("button.onboarding-a-btn.onboarding-a-btn-secondary"));
    this.backButton.textContent = localize("onboarding.back", "Back");
    this.backButton.type = "button";
    this.footerFocusableElements.push(this.backButton);
    this.nextButton = append(footerRight, $("button.onboarding-a-btn.onboarding-a-btn-primary"));
    this.nextButton.type = "button";
    this.footerFocusableElements.push(this.nextButton);
    this._updateButtonStates();
    this.disposables.add(addDisposableListener(this.closeButton, EventType.CLICK, () => {
      this._logAction("skip");
      this._dismiss("skip");
    }));
    this.disposables.add(addDisposableListener(this.backButton, EventType.CLICK, () => {
      if (this.currentStepIndex === 0 && this.enterpriseSignInUiState === "instance") {
        this._logAction("cancelEnterpriseInstancePrompt");
        this.enterpriseSignInWatch = void 0;
        this._setEnterpriseSignInUiState("options");
        return;
      }
      this._logAction("back");
      this._prevStep();
    }));
    this.disposables.add(addDisposableListener(this.nextButton, EventType.CLICK, () => {
      if (this._isLastStep()) {
        this._applyStepSelections(this.steps[this.currentStepIndex]);
        this._logAction("complete");
        this._dismiss("complete");
      } else if (this.currentStepIndex === 0) {
        this._logAction("continueWithoutSignIn");
        this._nextStep();
      } else {
        this._logAction("next");
        this._nextStep();
      }
    }));
    this.disposables.add(addDisposableListener(this.overlay, EventType.MOUSE_DOWN, (e) => {
      if (e.target === this.overlay) {
        this._dismiss("skip");
      }
    }));
    this.disposables.add(addDisposableListener(this.overlay, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      e.stopPropagation();
      if (event.keyCode === KeyCode.Escape) {
        e.preventDefault();
        this._dismiss("skip");
        return;
      }
      if (event.keyCode === KeyCode.Tab) {
        this._trapTab(e, event.shiftKey);
      }
    }));
    this.overlay.classList.add("entering");
    getActiveWindow().requestAnimationFrame(() => {
      this.overlay?.classList.remove("entering");
      this.overlay?.classList.add("visible");
    });
    this._focusCurrentStepElement();
  }
  _dismiss(reason) {
    if (!this.overlay) {
      return;
    }
    this._logAction("dismiss", void 0, reason);
    this.overlay.classList.remove("visible");
    this.overlay.classList.add("exiting");
    let handled = false;
    const onTransitionEnd = () => {
      if (handled) {
        return;
      }
      handled = true;
      this._removeFromDOM();
      if (reason === "complete") {
        this._onDidComplete.fire();
      }
      this._onDidDismiss.fire();
    };
    this.overlay.addEventListener("transitionend", onTransitionEnd, { once: true });
    setTimeout(onTransitionEnd, 400);
  }
  _nextStep() {
    if (this.currentStepIndex < this.steps.length - 1) {
      const leavingStep = this.steps[this.currentStepIndex];
      if (leavingStep === OnboardingStepId.SignIn) {
        this.enterpriseSignInUiState = "options";
        this.enterpriseInstanceValue = "";
        this.enterpriseSignInWatch = void 0;
      }
      this._applyStepSelections(leavingStep);
      this.currentStepIndex++;
      this._renderStep();
      this._renderProgress();
      this._updateButtonStates();
      this._focusCurrentStepElement();
      this._logStepView();
    }
  }
  /**
   * Applies the selections made on a step once the user moves past it, either
   * by continuing to the next step or by completing the onboarding.
   */
  _applyStepSelections(stepId) {
    if (stepId === OnboardingStepId.Personalize) {
      this._applyKeymap(this.selectedKeymapId);
    }
  }
  _prevStep() {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
      this._renderStep();
      this._renderProgress();
      this._updateButtonStates();
      this._focusCurrentStepElement();
      this._logStepView();
    }
  }
  _isLastStep() {
    return this.currentStepIndex === this.steps.length - 1;
  }
  _renderProgress() {
    if (!this.progressContainer || !this.stepLabelEl) {
      return;
    }
    clearNode(this.progressContainer);
    for (let i = 0; i < this.steps.length; i++) {
      const dot = append(this.progressContainer, $("span.onboarding-a-progress-dot"));
      if (i === this.currentStepIndex) {
        dot.classList.add("active");
      } else if (i < this.currentStepIndex) {
        dot.classList.add("completed");
      }
    }
    this.progressContainer.appendChild(this.stepLabelEl);
    this.stepLabelEl.textContent = localize(
      "onboarding.stepOf",
      "{0} of {1}",
      this.currentStepIndex + 1,
      this.steps.length
    );
  }
  _renderStep() {
    if (!this.titleEl || !this.subtitleEl || !this.contentEl) {
      return;
    }
    this.stepDisposables.clear();
    this.stepFocusableElements.length = 0;
    const stepId = this.steps[this.currentStepIndex];
    const useSignInHero = stepId === OnboardingStepId.SignIn;
    this.titleEl.style.display = useSignInHero ? "none" : "";
    this.subtitleEl.style.display = useSignInHero ? "none" : "";
    this.titleEl.textContent = getOnboardingStepTitle(stepId);
    if (stepId === OnboardingStepId.Personalize) {
      this._renderPersonalizeSubtitle(this.subtitleEl);
    } else {
      this.subtitleEl.textContent = getOnboardingStepSubtitle(stepId);
    }
    clearNode(this.contentEl);
    switch (stepId) {
      case OnboardingStepId.SignIn:
        this._renderSignInStep(this.contentEl);
        break;
      case OnboardingStepId.Personalize:
        this._renderPersonalizeStep(this.contentEl);
        break;
      case OnboardingStepId.AiPreference:
        this._renderAiPreferenceStep(this.contentEl);
        break;
    }
    this.bodyEl?.setAttribute("aria-label", localize(
      "onboarding.step.aria",
      "Step {0} of {1}: {2}",
      this.currentStepIndex + 1,
      this.steps.length,
      getOnboardingStepTitle(stepId)
    ));
  }
  _updateButtonStates() {
    if (this.backButton) {
      const showEnterpriseBack = this.currentStepIndex === 0 && this.enterpriseSignInUiState === "instance";
      this.backButton.style.display = this.currentStepIndex === 0 && !showEnterpriseBack ? "none" : "";
    }
    if (this.nextButton) {
      if (this.currentStepIndex === 0) {
        if (this._userSignedIn) {
          this.nextButton.className = "onboarding-a-btn onboarding-a-btn-primary";
          this.nextButton.textContent = localize("onboarding.continue", "Continue");
        } else {
          this.nextButton.className = "onboarding-a-btn onboarding-a-btn-secondary";
          this.nextButton.textContent = localize("onboarding.continueWithoutSignIn", "Continue without Signing In");
        }
      } else if (this._isLastStep()) {
        this.nextButton.className = "onboarding-a-btn onboarding-a-btn-primary";
        this.nextButton.textContent = localize("onboarding.getStarted", "Get Started");
      } else {
        this.nextButton.className = "onboarding-a-btn onboarding-a-btn-primary";
        this.nextButton.textContent = localize("onboarding.next", "Continue");
      }
    }
    if (this.footerLeft) {
      if (this._isLastStep()) {
        if (!this._footerSignInBtn && !this._userSignedIn) {
          this._footerSignInBtn = append(this.footerLeft, $("button.onboarding-a-signin-nudge-btn"));
          this._footerSignInBtn.type = "button";
          this._footerSignInBtn.textContent = localize("onboarding.sessions.signInNudge", "Sign in to use Codex");
          this.stepDisposables.add(addDisposableListener(this._footerSignInBtn, EventType.CLICK, async () => {
            this._logAction("signInNudge");
            await this._handleSignIn();
            if (this._userSignedIn && this._footerSignInBtn) {
              this._footerSignInBtn.style.display = "none";
            }
          }));
        }
      } else {
        if (this._footerSignInBtn) {
          this._footerSignInBtn.remove();
          this._footerSignInBtn = void 0;
        }
      }
    }
  }
  // =====================================================================
  // Step: Sign In
  // =====================================================================
  _renderSignInStep(container) {
    const wrapper = append(container, $(".onboarding-a-signin"));
    const brand = append(wrapper, $(".onboarding-a-signin-brand"));
    const brandIcon = append(brand, $("span.onboarding-a-signin-brand-icon"));
    brandIcon.setAttribute("role", "img");
    brandIcon.setAttribute("aria-label", product.nameLong);
    const content = append(wrapper, $(".onboarding-a-signin-content"));
    const contentMain = append(content, $(".onboarding-a-signin-content-main"));
    const title = append(contentMain, $("h2.onboarding-a-signin-title"));
    title.textContent = localize("onboarding.signIn.heroTitle", "Welcome to VS Code");
    const subtitle = append(contentMain, $("p.onboarding-a-signin-subtitle"));
    subtitle.textContent = localize("onboarding.signIn.heroSubtitle", "Sign in to use Codex in Forge.");
    const actions = append(contentMain, $(".onboarding-a-signin-actions"));
    if (this._userSignedIn) {
      const signedIn = append(actions, $(".onboarding-a-signin-confirmation"));
      const icon = append(signedIn, $("span"));
      icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
      icon.setAttribute("aria-hidden", "true");
      const text = append(signedIn, $("span"));
      text.textContent = localize("onboarding.signIn.signedIn", "You're signed in. You can continue to the next step.");
    } else {
      switch (this.enterpriseSignInUiState) {
        case "instance":
          this._renderEnterpriseInstanceForm(actions);
          break;
        case "progress":
          this._renderEnterpriseSignInProgress(actions);
          break;
        default:
          this._renderDefaultSignInActions(actions);
          break;
      }
    }
    const footer = append(wrapper, $(".onboarding-a-signin-footer"));
    const disclaimerCol = append(footer, $(".onboarding-a-signin-disclaimer-col"));
    const copilotDisclaimer = append(disclaimerCol, $(".onboarding-a-signin-disclaimer"));
    copilotDisclaimer.append(localize("onboarding.signIn.disclaimer.prefix", "By signing in, you agree to {0}'s ", defaultChat.provider.default.name));
    this._createInlineLink(copilotDisclaimer, localize("onboarding.signIn.disclaimer.terms", "Terms"), defaultChat.termsStatementUrl);
    copilotDisclaimer.append(localize("onboarding.signIn.disclaimer.middle", " and "));
    this._createInlineLink(copilotDisclaimer, localize("onboarding.signIn.disclaimer.privacy", "Privacy Statement"), defaultChat.privacyStatementUrl);
    copilotDisclaimer.append(localize("onboarding.signIn.disclaimer.copilotPrefix", ". {0} Copilot may show ", defaultChat.provider.default.name));
    this._createInlineLink(copilotDisclaimer, localize("onboarding.signIn.disclaimer.publicCode", "public code"), defaultChat.publicCodeMatchesUrl);
    copilotDisclaimer.append(localize("onboarding.signIn.disclaimer.improveSuffix", " suggestions and use your data to improve the product."));
    copilotDisclaimer.append(" ");
    copilotDisclaimer.append(localize("onboarding.signIn.disclaimer.settingsPrefix", "You can change these "));
    this._createInlineLink(copilotDisclaimer, localize("onboarding.signIn.disclaimer.settings", "settings"), this.defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings));
    copilotDisclaimer.append(localize("onboarding.signIn.disclaimer.suffix", " anytime."));
  }
  _renderDefaultSignInActions(actions) {
    const githubBtn = this._registerStepFocusable(this._createSignInButton(actions, "github", localize("onboarding.signIn.github", "Continue with GitHub"), {
      emphasized: true,
      label: localize("onboarding.signIn.github.aria", "Continue with GitHub")
    }));
    this.stepDisposables.add(addDisposableListener(githubBtn, EventType.CLICK, () => {
      this._logAction("signIn", void 0, "github");
      this._handleSignIn();
    }));
    const googleBtn = this._registerStepFocusable(this._createSignInButton(actions, "google", localize("onboarding.signIn.google", "Continue with Google"), {
      iconOnly: true,
      label: localize("onboarding.signIn.google", "Continue with Google")
    }));
    this.stepDisposables.add(addDisposableListener(googleBtn, EventType.CLICK, () => {
      this._logAction("signIn", void 0, "google");
      this._handleSignIn("google");
    }));
    const appleBtn = this._registerStepFocusable(this._createSignInButton(actions, "apple", localize("onboarding.signIn.apple", "Continue with Apple"), {
      iconOnly: true,
      label: localize("onboarding.signIn.apple", "Continue with Apple")
    }));
    this.stepDisposables.add(addDisposableListener(appleBtn, EventType.CLICK, () => {
      this._logAction("signIn", void 0, "apple");
      this._handleSignIn("apple");
    }));
    const gheBtn = this._registerStepFocusable(this._createSignInButton(actions, "github-enterprise", localize("onboarding.signIn.ghe", "GHE"), {
      textOnly: true,
      label: localize("onboarding.signIn.ghe.aria", "Continue with GitHub Enterprise")
    }));
    this.stepDisposables.add(addDisposableListener(gheBtn, EventType.CLICK, () => {
      this._logAction("signIn", void 0, "github-enterprise");
      void this._handleEnterpriseSignIn();
    }));
  }
  _renderEnterpriseInstanceForm(actions) {
    const enterprisePromptLabel = this._getEnterpriseInstancePromptLabel();
    const container = append(actions, $(".onboarding-a-signin-ghe-input"));
    const submitAction = this.stepDisposables.add(new Action(
      "onboarding.signIn.enterprise.submit",
      localize("onboarding.signIn.enterprise.continue", "Continue"),
      ThemeIcon.asClassName(Codicon.arrowRight),
      false
    ));
    const inputBox = this.stepDisposables.add(new InputBox(container, void 0, {
      placeholder: localize("onboarding.signIn.enterprise.placeholder", 'i.e. "octocat" or "https://octocat.ghe.com"...'),
      ariaLabel: enterprisePromptLabel,
      actions: [submitAction],
      inputBoxStyles: defaultInputBoxStyles
    }));
    inputBox.value = this.enterpriseInstanceValue;
    inputBox.paddingRight = OnboardingVariationA.GHE_INPUT_ACTION_PADDING;
    const input = this._registerStepFocusable(inputBox.inputElement);
    const submit = async () => {
      const result = parseGheInstanceInput(inputBox.value);
      if (result.kind === GheParseResultKind.Empty || result.kind === GheParseResultKind.Invalid) {
        validate();
        return;
      }
      await this._submitEnterpriseInstance(result.resolvedUri);
    };
    submitAction.run = submit;
    const message = append(container, $(".onboarding-a-signin-ghe-message"));
    const validate = () => {
      this.enterpriseInstanceValue = inputBox.value;
      inputBox.element.classList.remove("error");
      message.classList.remove("error", "info");
      const result = parseGheInstanceInput(inputBox.value);
      switch (result.kind) {
        case GheParseResultKind.Empty:
          message.textContent = enterprisePromptLabel;
          submitAction.enabled = false;
          return false;
        case GheParseResultKind.SingleWord:
          message.classList.add("info");
          message.textContent = localize("onboarding.signIn.enterprise.resolve", "Will resolve to {0}", result.resolvedUri);
          submitAction.enabled = true;
          return true;
        case GheParseResultKind.FullUri:
          submitAction.enabled = true;
          message.textContent = "";
          return true;
        case GheParseResultKind.Invalid:
          inputBox.element.classList.add("error");
          message.classList.add("error");
          message.textContent = localize("onboarding.signIn.enterprise.invalid", 'You must enter a valid {0} instance (i.e. "octocat" or "https://octocat.ghe.com")', defaultChat.provider.enterprise.name);
          submitAction.enabled = false;
          return false;
      }
    };
    this.stepDisposables.add(inputBox.onDidChange(() => {
      validate();
    }));
    this.stepDisposables.add(addDisposableListener(input, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.keyCode === KeyCode.Enter) {
        e.preventDefault();
        void submitAction.run();
        return;
      }
      if (event.keyCode === KeyCode.Escape) {
        e.preventDefault();
        e.stopPropagation();
        this._logAction("cancelEnterpriseInstancePrompt");
        this.enterpriseSignInWatch = void 0;
        this._setEnterpriseSignInUiState("options");
      }
    }));
    validate();
  }
  _renderEnterpriseSignInProgress(actions) {
    const container = append(actions, $(".onboarding-a-signin-ghe-progress"));
    container.setAttribute("aria-live", "polite");
    const spinner = append(container, $("span"));
    spinner.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), "codicon-modifier-spin");
    spinner.setAttribute("aria-hidden", "true");
    const message = append(container, $(".onboarding-a-signin-ghe-progress-message"));
    message.textContent = localize("onboarding.signIn.enterprise.progress", "Waiting for {0} sign-in to complete...", defaultChat.provider.enterprise.name);
  }
  _getEnterpriseInstancePromptLabel() {
    return localize("onboarding.signIn.enterprise.prompt", "What is your {0} instance?", defaultChat.provider.enterprise.name);
  }
  _setEnterpriseSignInUiState(state) {
    this.enterpriseSignInUiState = state;
    if (this.steps[this.currentStepIndex] === OnboardingStepId.SignIn && this.contentEl) {
      this._renderStep();
      this._updateButtonStates();
      this._focusCurrentStepElement();
    }
  }
  _createSignInButton(parent, providerClass, label, options) {
    const isCompact = options?.iconOnly || options?.textOnly;
    const btn = append(parent, $(isCompact ? "button.onboarding-a-signin-icon-btn" : "button.onboarding-a-signin-btn"));
    btn.type = "button";
    btn.title = options?.label ?? label;
    btn.setAttribute("aria-label", options?.label ?? label);
    if (options?.emphasized) {
      btn.classList.add("primary");
    }
    if (!options?.textOnly) {
      const mark = append(btn, $("span.onboarding-a-provider-mark"));
      mark.classList.add(providerClass);
      mark.setAttribute("aria-hidden", "true");
      if (providerClass === "github" || providerClass === "github-enterprise") {
        mark.appendChild(renderIcon(Codicon.github));
      }
    }
    if (!options?.iconOnly) {
      const labelEl = append(btn, $("span.onboarding-a-signin-btn-label"));
      labelEl.textContent = label;
    }
    return btn;
  }
  async _handleSignIn(socialProvider) {
    const provider = socialProvider ?? "github";
    const watch = StopWatch.create();
    try {
      const account = await this.defaultAccountService.signIn({
        extraAuthorizeParameters: { get_started_with: "copilot-vscode" },
        provider: socialProvider
      });
      if (account) {
        this._userSignedIn = true;
        this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "installed", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
        this.commandService.executeCommand("workbench.action.chat.triggerSetup", void 0, {
          disableChatViewReveal: true,
          setupStrategy: ChatSetupStrategy.DefaultSetup
        });
        this._nextStep();
      }
    } catch (error) {
      if (isCancellationError(error)) {
        this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "cancelled", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
        return;
      }
      this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "failedNotSignedIn", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
      this.notificationService.notify({
        severity: Severity.Error,
        message: localize("onboarding.signIn.error", "Sign-in failed. You can try again later from the Accounts menu.")
      });
    }
  }
  async _handleEnterpriseSignIn() {
    const existingUri = this.configurationService.getValue(defaultChat.providerUriSetting);
    if (typeof existingUri !== "string" || !GHE_FULL_URI_REGEX.test(existingUri)) {
      this.enterpriseInstanceValue = existingUri ?? "";
      this.enterpriseSignInWatch = StopWatch.create();
      this._setEnterpriseSignInUiState("instance");
      return;
    }
    this.enterpriseInstanceValue = existingUri;
    await this._runEnterpriseSignInSetup();
  }
  async _submitEnterpriseInstance(resolvedUri) {
    try {
      await this.configurationService.updateValue(defaultChat.providerUriSetting, resolvedUri, ConfigurationTarget.USER);
      this.enterpriseInstanceValue = resolvedUri;
      await this._runEnterpriseSignInSetup();
    } catch {
      this.enterpriseSignInWatch = void 0;
      this._setEnterpriseSignInUiState("instance");
      this._notifyEnterpriseSignInError();
    }
  }
  async _runEnterpriseSignInSetup() {
    const watch = this.enterpriseSignInWatch ?? StopWatch.create();
    const provider = defaultChat.provider.enterprise.id;
    this._setEnterpriseSignInUiState("progress");
    try {
      const success = await this.commandService.executeCommand("workbench.action.chat.triggerSetup", void 0, {
        disableChatViewReveal: true,
        setupStrategy: ChatSetupStrategy.SetupWithEnterpriseProvider
      });
      if (success) {
        this._userSignedIn = true;
        this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "installed", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
        this._nextStep();
      } else {
        this._setEnterpriseSignInUiState("options");
      }
    } catch (error) {
      if (isCancellationError(error)) {
        this._setEnterpriseSignInUiState("options");
        this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "cancelled", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
        return;
      }
      this._setEnterpriseSignInUiState("instance");
      this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "failedNotSignedIn", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
      this._notifyEnterpriseSignInError();
    } finally {
      this.enterpriseSignInWatch = void 0;
    }
  }
  _notifyEnterpriseSignInError() {
    this.notificationService.notify({
      severity: Severity.Error,
      message: localize("onboarding.signIn.enterprise.error", "GitHub Enterprise sign-in failed. Check your instance URL and try again.")
    });
  }
  // =====================================================================
  // Step: Personalize (Theme + Keymap)
  // =====================================================================
  _renderPersonalizeStep(container) {
    const wrapper = append(container, $(".onboarding-a-personalize"));
    const themeLabel = append(wrapper, $("div.onboarding-a-section-label"));
    themeLabel.textContent = localize("onboarding.personalize.theme", "Color Theme");
    const themeHint = append(wrapper, $("div.onboarding-a-theme-hint"));
    themeHint.textContent = localize("onboarding.personalize.themeHint", "You can browse and install more themes later from the Extensions view.");
    const themeGrid = append(wrapper, $(".onboarding-a-theme-grid"));
    themeGrid.setAttribute("role", "radiogroup");
    themeGrid.setAttribute("aria-label", localize("onboarding.personalize.themeLabel", "Choose a color theme"));
    const hasOtherEditors = this._hasOtherEditors();
    const allThemes = product.onboardingThemes ?? [];
    const themes = hasOtherEditors ? allThemes.filter((t) => !t.id.startsWith("solarized")) : allThemes;
    if (!hasOtherEditors) {
      themeGrid.classList.add("theme-grid-expanded");
    }
    const themeCards = [];
    for (const theme of themes) {
      this._createThemeCard(themeGrid, theme, themeCards);
    }
    for (const card of themeCards) {
      card.setAttribute("tabindex", "0");
    }
    const keymapOptions = this._detectedEditorIds ? (product.onboardingKeymaps ?? []).filter((k) => this._detectedEditorIds.has(k.id)) : [];
    if (hasOtherEditors) {
      const keymapLabel = append(wrapper, $("div.onboarding-a-section-label.onboarding-a-section-label-keymap"));
      keymapLabel.textContent = localize("onboarding.personalize.keymap", "Keyboard Mapping");
      const keymapHint = append(wrapper, $("div.onboarding-a-theme-hint"));
      keymapHint.textContent = localize("onboarding.personalize.keymapHint", "Coming from another editor? Import your keyboard mapping to feel right at home.");
      const keymapList = append(wrapper, $(".onboarding-a-keymap-list"));
      keymapList.setAttribute("role", "radiogroup");
      keymapList.setAttribute("aria-label", localize("onboarding.personalize.keymapLabel", "Choose a keyboard mapping"));
      const keymapPills = [];
      for (const keymap of keymapOptions) {
        const pill = this._registerStepFocusable(append(keymapList, $("button.onboarding-a-keymap-pill")));
        pill.type = "button";
        pill.setAttribute("role", "radio");
        pill.setAttribute("aria-checked", keymap.id === this.selectedKeymapId ? "true" : "false");
        pill.title = keymap.description;
        keymapPills.push(pill);
        const labelSpan = append(pill, $("span"));
        labelSpan.textContent = keymap.label;
        if (keymap.id === this.selectedKeymapId) {
          pill.classList.add("selected");
        }
        this.stepDisposables.add(addDisposableListener(pill, EventType.CLICK, () => {
          this._logAction("selectKeymap", void 0, keymap.id);
          this.selectedKeymapId = keymap.id;
          for (const p of keymapPills) {
            p.classList.remove("selected");
            p.setAttribute("aria-checked", "false");
          }
          pill.classList.add("selected");
          pill.setAttribute("aria-checked", "true");
          this.accessibilityService.alert(localize("onboarding.keymap.selected.alert", "{0} keyboard mapping selected", keymap.label));
        }));
      }
      const selectedKeymapIndex = keymapOptions.findIndex((k) => k.id === this.selectedKeymapId);
      this._setupRadioGroupNavigation(keymapPills, Math.max(0, selectedKeymapIndex));
    }
  }
  _renderPersonalizeSubtitle(container) {
    clearNode(container);
    const modifier = isMacintosh ? "Cmd" : "Ctrl";
    container.append(
      localize("onboarding.personalize.tip.prefix", "Tip: Press "),
      this._createKbd(localize({ key: "onboarding.personalize.tip.modifier", comment: ["This is a keyboard modifier key, Ctrl on Windows/Linux or Cmd on Mac"] }, "{0}", modifier)),
      "+",
      this._createKbd(localize("onboarding.personalize.tip.shift", "Shift")),
      "+",
      this._createKbd(localize("onboarding.personalize.tip.p", "P")),
      localize("onboarding.personalize.tip.suffix", " to access all VS Code commands.")
    );
  }
  _createThemeCard(parent, theme, allCards) {
    const card = this._registerStepFocusable(append(parent, $("div.onboarding-a-theme-card")));
    allCards.push(card);
    card.setAttribute("role", "radio");
    card.setAttribute("aria-checked", theme.id === this.selectedThemeId ? "true" : "false");
    card.setAttribute("aria-label", theme.label);
    if (theme.id === this.selectedThemeId) {
      card.classList.add("selected");
    }
    const preview = append(card, $("div.onboarding-a-theme-preview"));
    const img = append(preview, $("img.onboarding-a-theme-preview-img"));
    img.alt = "";
    img.src = FileAccess.asBrowserUri(`vs/workbench/contrib/welcomeOnboarding/browser/media/theme-preview-${theme.id}.svg`).toString(true);
    const label = append(card, $("div.onboarding-a-theme-label"));
    label.textContent = theme.label;
    this.stepDisposables.add(addDisposableListener(card, EventType.CLICK, () => {
      this._logAction("selectTheme", void 0, theme.id);
      this._selectTheme(theme);
      for (const c of allCards) {
        c.classList.remove("selected");
        c.setAttribute("aria-checked", "false");
      }
      card.classList.add("selected");
      card.setAttribute("aria-checked", "true");
      this.accessibilityService.alert(localize("onboarding.theme.selected.alert", "{0} theme selected", theme.label));
    }));
    this.stepDisposables.add(addDisposableListener(card, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        card.click();
      }
    }));
  }
  // =====================================================================
  // Theme / Keymap helpers
  // =====================================================================
  async _selectTheme(theme) {
    this.selectedThemeId = theme.id;
    const allThemes = await this.themeService.getColorThemes();
    const match = allThemes.find((t) => t.settingsId === theme.themeId);
    if (match) {
      this.themeService.setColorTheme(match.id, ConfigurationTarget.USER);
    }
  }
  async _applyKeymap(keymapId) {
    const keymap = (product.onboardingKeymaps ?? []).find((k) => k.id === keymapId);
    if (!keymap?.extensionId) {
      return;
    }
    try {
      const gallery = await this.extensionGalleryService.getExtensions([{ id: keymap.extensionId }], CancellationToken.None);
      if (gallery.length > 0) {
        await this.extensionManagementService.installFromGallery(gallery[0], { context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true } });
      }
    } catch {
      this.notificationService.notify({
        severity: Severity.Warning,
        message: localize("onboarding.keymap.installError", "Could not install {0} keymap. You can install it later from Extensions.", keymap.label)
      });
    }
  }
  _hasOtherEditors() {
    const keymapOptions = this._detectedEditorIds ? (product.onboardingKeymaps ?? []).filter((k) => this._detectedEditorIds.has(k.id)) : [];
    return keymapOptions.some((k) => k.id !== "vscode");
  }
  /**
   * Checks common install paths for known editors and returns the set of
   * keymap option IDs whose editors are found on this machine.
   * Always includes 'vscode' (the default). In web environments or on
   * unknown platforms, returns only 'vscode'.
   */
  async _detectInstalledEditors() {
    const detected = /* @__PURE__ */ new Set(["vscode"]);
    const home = this.pathService.userHome({ preferLocal: true });
    const checks = [];
    if (isWindows) {
      const localAppData = URI.joinPath(home, "AppData", "Local");
      checks.push(
        { id: "sublime", paths: [URI.file("C:\\Program Files\\Sublime Text\\sublime_text.exe"), URI.file("C:\\Program Files\\Sublime Text 3\\sublime_text.exe")] },
        { id: "intellij", paths: [URI.joinPath(localAppData, "JetBrains", "Toolbox")] },
        { id: "vim", paths: [URI.joinPath(home, "_vimrc"), URI.joinPath(localAppData, "nvim", "init.vim"), URI.joinPath(localAppData, "nvim", "init.lua")] },
        { id: "eclipse", paths: [URI.file("C:\\Program Files\\Eclipse\\eclipse.exe"), URI.file("C:\\Program Files\\eclipse\\eclipse.exe")] },
        { id: "notepadpp", paths: [URI.file("C:\\Program Files\\Notepad++\\notepad++.exe"), URI.file("C:\\Program Files (x86)\\Notepad++\\notepad++.exe")] }
      );
    } else if (isMacintosh) {
      checks.push(
        { id: "sublime", paths: [URI.file("/Applications/Sublime Text.app")] },
        { id: "intellij", paths: [URI.file("/Applications/IntelliJ IDEA.app"), URI.file("/Applications/IntelliJ IDEA CE.app")] },
        { id: "vim", paths: [URI.joinPath(home, ".vimrc"), URI.joinPath(home, ".config", "nvim", "init.vim"), URI.joinPath(home, ".config", "nvim", "init.lua")] },
        { id: "eclipse", paths: [URI.file("/Applications/Eclipse.app"), URI.file("/Applications/Eclipse IDE.app")] },
        { id: "notepadpp", paths: [URI.file("/Applications/Notepad++.app")] }
      );
    } else if (isLinux) {
      checks.push(
        { id: "sublime", paths: [URI.file("/usr/bin/subl"), URI.file("/opt/sublime_text/sublime_text")] },
        { id: "intellij", paths: [URI.joinPath(home, ".local", "share", "JetBrains", "Toolbox"), URI.file("/opt/idea")] },
        { id: "vim", paths: [URI.joinPath(home, ".vimrc"), URI.joinPath(home, ".config", "nvim", "init.vim"), URI.joinPath(home, ".config", "nvim", "init.lua")] },
        { id: "eclipse", paths: [URI.file("/usr/bin/eclipse"), URI.file("/opt/eclipse/eclipse"), URI.joinPath(home, "eclipse", "eclipse")] },
        { id: "notepadpp", paths: [URI.file("/usr/bin/notepadqq"), URI.file("/snap/notepad-plus-plus/current")] }
      );
    }
    await Promise.all(checks.map(async (check) => {
      for (const path of check.paths) {
        try {
          if (await this.fileService.exists(path)) {
            detected.add(check.id);
            return;
          }
        } catch {
        }
      }
    }));
    return detected;
  }
  // =====================================================================
  // Step: AI Preference
  // =====================================================================
  _renderAiPreferenceStep(container) {
    const wrapper = append(container, $(".onboarding-a-ai-pref"));
    const cards = append(wrapper, $(".onboarding-a-ai-pref-cards"));
    cards.setAttribute("role", "radiogroup");
    cards.setAttribute("aria-label", localize("onboarding.aiPref.label", "Choose your AI collaboration style"));
    const allCards = [];
    for (const option of ONBOARDING_AI_PREFERENCE_OPTIONS) {
      const card = this._registerStepFocusable(append(cards, $("button.onboarding-a-ai-pref-card")));
      card.type = "button";
      card.dataset.id = option.id;
      card.setAttribute("role", "radio");
      card.setAttribute("aria-checked", option.id === this.selectedAiMode ? "true" : "false");
      allCards.push(card);
      if (option.id === this.selectedAiMode) {
        card.classList.add("selected");
      }
      const iconEl = append(card, $("span.onboarding-a-ai-pref-card-icon"));
      iconEl.setAttribute("aria-hidden", "true");
      const icon = Codicon[option.icon] ?? Codicon.sparkle;
      iconEl.appendChild(renderIcon(icon));
      const titleEl = append(card, $("div.onboarding-a-ai-pref-card-title"));
      titleEl.textContent = option.label;
      const descEl = append(card, $("div.onboarding-a-ai-pref-card-desc"));
      descEl.textContent = option.description;
      this.stepDisposables.add(addDisposableListener(card, EventType.CLICK, () => {
        this._logAction("selectAiMode", void 0, option.id);
        this.selectedAiMode = option.id;
        for (const c of allCards) {
          c.classList.toggle("selected", c.dataset.id === option.id);
          c.setAttribute("aria-checked", c.dataset.id === option.id ? "true" : "false");
        }
        this._applyAiPreference(option.id);
        this.accessibilityService.alert(localize("onboarding.aiPref.selected.alert", "{0} selected", option.label));
      }));
    }
    const selectedAiIndex = ONBOARDING_AI_PREFERENCE_OPTIONS.findIndex((o) => o.id === this.selectedAiMode);
    this._setupRadioGroupNavigation(allCards, Math.max(0, selectedAiIndex));
    const hint = append(wrapper, $("div.onboarding-a-ai-pref-hint"));
    hint.textContent = localize("onboarding.aiPref.hint", "You can change this anytime in Settings.");
  }
  _applyAiPreference(mode) {
    switch (mode) {
      case AiCollaborationMode.CodeFirst:
        this.configurationService.updateValue("chat.agent.autoFix", false, ConfigurationTarget.USER);
        break;
      case AiCollaborationMode.Balanced:
        this.configurationService.updateValue("chat.agent.autoFix", true, ConfigurationTarget.USER);
        break;
      case AiCollaborationMode.AgentForward:
        this.configurationService.updateValue("chat.agent.autoFix", true, ConfigurationTarget.USER);
        break;
    }
  }
  _createKbd(label) {
    const kbd = $("kbd.onboarding-a-kbd");
    kbd.textContent = label;
    return kbd;
  }
  _createInlineLink(parent, label, href) {
    const link = this._registerStepFocusable(append(parent, $("a.onboarding-a-inline-link")));
    link.textContent = label;
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener";
    return link;
  }
  // =====================================================================
  // Radio-group keyboard navigation (roving tabindex)
  // =====================================================================
  /**
   * Sets up WAI-ARIA radio-group keyboard navigation on a set of elements:
   * - Arrow keys move focus between items (with wrap-around)
   * - Only the focused item has tabindex=0; the rest have tabindex=-1
   * - Space/Enter on a focused item fires its click handler
   */
  _setupRadioGroupNavigation(items, selectedIndex) {
    for (let i = 0; i < items.length; i++) {
      items[i].setAttribute("tabindex", i === selectedIndex ? "0" : "-1");
    }
    for (let i = 0; i < items.length; i++) {
      this.stepDisposables.add(addDisposableListener(items[i], EventType.KEY_DOWN, (e) => {
        const event = new StandardKeyboardEvent(e);
        let newIndex;
        if (event.keyCode === KeyCode.RightArrow || event.keyCode === KeyCode.DownArrow) {
          newIndex = (i + 1) % items.length;
        } else if (event.keyCode === KeyCode.LeftArrow || event.keyCode === KeyCode.UpArrow) {
          newIndex = (i - 1 + items.length) % items.length;
        } else if (event.keyCode === KeyCode.Home) {
          newIndex = 0;
        } else if (event.keyCode === KeyCode.End) {
          newIndex = items.length - 1;
        }
        if (newIndex !== void 0) {
          e.preventDefault();
          e.stopPropagation();
          items[i].setAttribute("tabindex", "-1");
          items[newIndex].setAttribute("tabindex", "0");
          items[newIndex].focus();
          items[newIndex].click();
        }
      }));
    }
  }
  // =====================================================================
  // Focus trap
  // =====================================================================
  _trapTab(e, shiftKey) {
    if (!this.overlay) {
      return;
    }
    const allFocusable = this._getFocusableElements();
    if (allFocusable.length === 0) {
      e.preventDefault();
      return;
    }
    const first = allFocusable[0];
    const last = allFocusable[allFocusable.length - 1];
    if (shiftKey && getActiveWindow().document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!shiftKey && getActiveWindow().document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  _getFocusableElements() {
    return [...this.closeButton ? [this.closeButton] : [], ...this.stepFocusableElements, ...this.footerFocusableElements].filter((element) => this._isTabbable(element));
  }
  _focusCurrentStepElement() {
    const stepFocusable = this.stepFocusableElements.find((element) => this._isTabbable(element));
    (stepFocusable ?? this.nextButton ?? this.closeButton)?.focus();
  }
  _registerStepFocusable(element) {
    this.stepFocusableElements.push(element);
    return element;
  }
  _isTabbable(element) {
    if (!element.isConnected || element.getAttribute("aria-hidden") === "true" || element.tabIndex === -1 || element.hasAttribute("disabled")) {
      return false;
    }
    const computedStyle = getActiveWindow().getComputedStyle(element);
    return computedStyle.display !== "none" && computedStyle.visibility !== "hidden";
  }
  // =====================================================================
  // Telemetry
  // =====================================================================
  _logStepView() {
    const stepId = this.steps[this.currentStepIndex];
    this.telemetryService.publicLog2("welcomeOnboarding.stepView", {
      step: stepId,
      stepNumber: this.currentStepIndex + 1
    });
  }
  _logAction(action, stepOverride, argument) {
    this.telemetryService.publicLog2("welcomeOnboarding.actionExecuted", {
      action,
      step: stepOverride ?? this.steps[this.currentStepIndex],
      argument: argument ?? void 0
    });
  }
  // =====================================================================
  // Cleanup
  // =====================================================================
  _removeFromDOM() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = void 0;
    }
    this.card = void 0;
    this.bodyEl = void 0;
    this.progressContainer = void 0;
    this.stepLabelEl = void 0;
    this.titleEl = void 0;
    this.subtitleEl = void 0;
    this.contentEl = void 0;
    this.backButton = void 0;
    this.nextButton = void 0;
    this.closeButton = void 0;
    this.footerLeft = void 0;
    this._footerSignInBtn = void 0;
    this.footerFocusableElements.length = 0;
    this.stepFocusableElements.length = 0;
    this.enterpriseSignInUiState = "options";
    this.enterpriseInstanceValue = "";
    this.enterpriseSignInWatch = void 0;
    this._isShowing = false;
    this.disposables.clear();
    this.stepDisposables.clear();
    if (this.previouslyFocusedElement) {
      this.previouslyFocusedElement.focus();
      this.previouslyFocusedElement = void 0;
    }
    this.currentStepIndex = 0;
  }
  dispose() {
    this._removeFromDOM();
    super.dispose();
  }
};
OnboardingVariationA.GHE_INPUT_ACTION_PADDING = 28;
OnboardingVariationA = __decorateClass([
  __decorateParam(0, ILayoutService),
  __decorateParam(1, IWorkbenchThemeService),
  __decorateParam(2, IDefaultAccountService),
  __decorateParam(3, IExtensionGalleryService),
  __decorateParam(4, IExtensionManagementService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IFileService),
  __decorateParam(8, IPathService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, ICommandService),
  __decorateParam(11, IAccessibilityService)
], OnboardingVariationA);
export {
  OnboardingVariationA
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHdlbGNvbWVPbmJvYXJkaW5nXFxicm93c2VyXFxvbmJvYXJkaW5nVmFyaWF0aW9uQS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7ICQsIGFwcGVuZCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIGNsZWFyTm9kZSwgZ2V0QWN0aXZlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzLCBpc01hY2ludG9zaCwgaXNMaW51eCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgSW5wdXRCb3ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaW5wdXRib3gvaW5wdXRCb3guanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaFRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RoZW1lcy9jb21tb24vd29ya2JlbmNoVGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVYVEVOU0lPTl9JTlNUQUxMX1NLSVBfV0FMS1RIUk9VR0hfQ09OVEVYVCwgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IEdpdEh1YlBhdGhzLCBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgZGVmYXVsdElucHV0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSW5zdGFsbENoYXRFdmVudCwgSW5zdGFsbENoYXRDbGFzc2lmaWNhdGlvbiwgQ2hhdFNldHVwU3RyYXRlZ3kgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdFNldHVwL2NoYXRTZXR1cC5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQge1xuXHRPbmJvYXJkaW5nU3RlcElkLFxuXHRPTkJPQVJESU5HX1NURVBTLFxuXHRPTkJPQVJESU5HX0FJX1BSRUZFUkVOQ0VfT1BUSU9OUyxcblx0QWlDb2xsYWJvcmF0aW9uTW9kZSxcblx0SU9uYm9hcmRpbmdUaGVtZU9wdGlvbixcblx0Z2V0T25ib2FyZGluZ1N0ZXBUaXRsZSxcblx0Z2V0T25ib2FyZGluZ1N0ZXBTdWJ0aXRsZSxcblx0R0hFX0ZVTExfVVJJX1JFR0VYLFxuXHRHaGVQYXJzZVJlc3VsdEtpbmQsXG5cdHBhcnNlR2hlSW5zdGFuY2VJbnB1dCxcbn0gZnJvbSAnLi4vY29tbW9uL29uYm9hcmRpbmdUeXBlcy5qcyc7XG5pbXBvcnQgeyBJT25ib2FyZGluZ1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vb25ib2FyZGluZ1NlcnZpY2UuanMnO1xuXG50eXBlIE9uYm9hcmRpbmdTdGVwVmlld0NsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2N3ZWJzdGVyLTk5Jztcblx0Y29tbWVudDogJ1RyYWNrcyB3aGljaCBvbmJvYXJkaW5nIHN0ZXAgaXMgdmlld2VkLic7XG5cdHN0ZXA6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgc3RlcCBpZGVudGlmaWVyLicgfTtcblx0c3RlcE51bWJlcjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSAxLWJhc2VkIHN0ZXAgaW5kZXguJyB9O1xufTtcblxudHlwZSBPbmJvYXJkaW5nU3RlcFZpZXdFdmVudCA9IHtcblx0c3RlcDogc3RyaW5nO1xuXHRzdGVwTnVtYmVyOiBudW1iZXI7XG59O1xuXG50eXBlIE9uYm9hcmRpbmdBY3Rpb25DbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdjd2Vic3Rlci05OSc7XG5cdGNvbW1lbnQ6ICdUcmFja3MgYWN0aW9ucyB0YWtlbiBvbiB0aGUgb25ib2FyZGluZyB3aXphcmQuJztcblx0YWN0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGFjdGlvbiBwZXJmb3JtZWQuJyB9O1xuXHRzdGVwOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHN0ZXAgdGhlIGFjdGlvbiB3YXMgcGVyZm9ybWVkIG9uLicgfTtcblx0YXJndW1lbnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdPcHRpb25hbCBjb250ZXh0IHN1Y2ggYXMgdGhlbWUgaWQsIGV4dGVuc2lvbiBpZCwgb3IgcHJvdmlkZXIuJyB9O1xufTtcblxudHlwZSBPbmJvYXJkaW5nQWN0aW9uRXZlbnQgPSB7XG5cdGFjdGlvbjogc3RyaW5nO1xuXHRzdGVwOiBzdHJpbmc7XG5cdGFyZ3VtZW50OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59O1xuXG50eXBlIEVudGVycHJpc2VTaWduSW5VaVN0YXRlID0gJ29wdGlvbnMnIHwgJ2luc3RhbmNlJyB8ICdwcm9ncmVzcyc7XG5cbmNvbnN0IGRlZmF1bHRDaGF0ID0gcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50ITtcblxuLyoqXG4gKiBWYXJpYXRpb24gQSBcdTIwMTQgQ2xhc3NpYyBXaXphcmQgTW9kYWxcbiAqXG4gKiBBIGNlbnRlcmVkIG1vZGFsIG92ZXJsYXkgd2l0aCBwcm9ncmVzcyBkb3RzLCBjbGVhbiBzdGVwIHRyYW5zaXRpb25zLFxuICogYW5kIHBvbGlzaGVkIG5hdmlnYXRpb24uIFNpdHMgb24gdG9wIG9mIHRoZSBhZ2VudCBzZXNzaW9ucyB3ZWxjb21lXG4gKiB0YWIuIFdoZW4gZGlzbWlzc2VkLCB0aGUgd2VsY29tZSB0YWIgaXMgcmV2ZWFsZWQgdW5kZXJuZWF0aC5cbiAqXG4gKiBTdGVwczpcbiAqIDEuIFNpZ24gSW4gXHUyMDE0IHNlc3Npb25zLXN0eWxlIHNpZ24taW4gaGVybyB3aXRoIEdpdEh1YiBDb3BpbG90LCBHb29nbGUsIGFuZCBBcHBsZSBvcHRpb25zXG4gKiAyLiBQZXJzb25hbGl6ZSBcdTIwMTQgVGhlbWUgc2VsZWN0aW9uIGdyaWQgKyBrZXltYXAgcGlsbHNcbiAqL1xuZXhwb3J0IGNsYXNzIE9uYm9hcmRpbmdWYXJpYXRpb25BIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElPbmJvYXJkaW5nU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDb21wbGV0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENvbXBsZXRlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ29tcGxldGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNtaXNzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzbWlzczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZERpc21pc3MuZXZlbnQ7XG5cblx0cHJpdmF0ZSBvdmVybGF5OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjYXJkOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBib2R5RWw6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHByb2dyZXNzQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzdGVwTGFiZWxFbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdGl0bGVFbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc3VidGl0bGVFbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29udGVudEVsOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBiYWNrQnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBuZXh0QnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjbG9zZUJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZm9vdGVyTGVmdDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2Zvb3RlclNpZ25JbkJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBjdXJyZW50U3RlcEluZGV4ID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBzdGVwcyA9IE9OQk9BUkRJTkdfU1RFUFM7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHN0ZXBEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcHJldmlvdXNseUZvY3VzZWRFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNTaG93aW5nID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBmb290ZXJGb2N1c2FibGVFbGVtZW50czogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IHN0ZXBGb2N1c2FibGVFbGVtZW50czogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRwcml2YXRlIHNlbGVjdGVkVGhlbWVJZCA9ICdkYXJrLTIwMjYnO1xuXHRwcml2YXRlIHNlbGVjdGVkS2V5bWFwSWQgPSAndnNjb2RlJztcblx0cHJpdmF0ZSBfZGV0ZWN0ZWRFZGl0b3JJZHM6IFNldDxzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF91c2VyU2lnbmVkSW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBzZWxlY3RlZEFpTW9kZTogQWlDb2xsYWJvcmF0aW9uTW9kZSA9IEFpQ29sbGFib3JhdGlvbk1vZGUuQmFsYW5jZWQ7XG5cdHByaXZhdGUgZW50ZXJwcmlzZVNpZ25JblVpU3RhdGU6IEVudGVycHJpc2VTaWduSW5VaVN0YXRlID0gJ29wdGlvbnMnO1xuXHRwcml2YXRlIGVudGVycHJpc2VJbnN0YW5jZVZhbHVlID0gJyc7XG5cdHByaXZhdGUgZW50ZXJwcmlzZVNpZ25JbldhdGNoOiBTdG9wV2F0Y2ggfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSUxheW91dFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElXb3JrYmVuY2hUaGVtZVNlcnZpY2UsXG5cdFx0QElEZWZhdWx0QWNjb3VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBEZXRlY3QgY3VycmVudGx5IGFjdGl2ZSB0aGVtZVxuXHRcdGNvbnN0IGN1cnJlbnRUaGVtZSA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHRjb25zdCBhbGxUaGVtZXMgPSBwcm9kdWN0Lm9uYm9hcmRpbmdUaGVtZXMgPz8gW107XG5cdFx0Y29uc3QgbWF0Y2hpbmdUaGVtZSA9IGFsbFRoZW1lcy5maW5kKHQgPT4gdC50aGVtZUlkID09PSBjdXJyZW50VGhlbWUuc2V0dGluZ3NJZCk7XG5cdFx0aWYgKG1hdGNoaW5nVGhlbWUpIHtcblx0XHRcdHRoaXMuc2VsZWN0ZWRUaGVtZUlkID0gbWF0Y2hpbmdUaGVtZS5pZDtcblx0XHR9XG5cblx0XHQvLyBTdGFydCBkZXRlY3RpbmcgaW5zdGFsbGVkIGVkaXRvcnMgZWFybHkgc28gcmVzdWx0cyBhcmUgcmVhZHkgYnkgdGhlIFBlcnNvbmFsaXplIHN0ZXBcblx0XHR0aGlzLl9kZXRlY3RJbnN0YWxsZWRFZGl0b3JzKCkudGhlbihpZHMgPT4geyB0aGlzLl9kZXRlY3RlZEVkaXRvcklkcyA9IGlkczsgfSk7XG5cdH1cblxuXHRnZXQgaXNTaG93aW5nKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1Nob3dpbmc7XG5cdH1cblxuXHRzaG93KCk6IHZvaWQge1xuXHRcdGlmICghcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50IHx8IHRoaXMub3ZlcmxheSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2lzU2hvd2luZyA9IHRydWU7XG5cdFx0dGhpcy5wcmV2aW91c2x5Rm9jdXNlZEVsZW1lbnQgPSBnZXRBY3RpdmVXaW5kb3coKS5kb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lcjtcblxuXHRcdC8vIE92ZXJsYXlcblx0XHR0aGlzLm92ZXJsYXkgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcub25ib2FyZGluZy1hLW92ZXJsYXknKSk7XG5cdFx0dGhpcy5vdmVybGF5LnNldEF0dHJpYnV0ZSgncm9sZScsICdkaWFsb2cnKTtcblx0XHR0aGlzLm92ZXJsYXkuc2V0QXR0cmlidXRlKCdhcmlhLW1vZGFsJywgJ3RydWUnKTtcblx0XHR0aGlzLm92ZXJsYXkuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ29uYm9hcmRpbmcuYS5hcmlhJywgXCJXZWxjb21lIHRvIFZpc3VhbCBTdHVkaW8gQ29kZVwiKSk7XG5cblx0XHQvLyBDYXJkXG5cdFx0dGhpcy5jYXJkID0gYXBwZW5kKHRoaXMub3ZlcmxheSwgJCgnLm9uYm9hcmRpbmctYS1jYXJkJykpO1xuXG5cdFx0Ly8gQ2xvc2UgYnV0dG9uICh1cHBlci1yaWdodCBjb3JuZXIgb2YgY2FyZClcblx0XHR0aGlzLmNsb3NlQnV0dG9uID0gYXBwZW5kKHRoaXMuY2FyZCwgJDxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbi5vbmJvYXJkaW5nLWEtY2xvc2UtYnRuJykpO1xuXHRcdHRoaXMuY2xvc2VCdXR0b24udHlwZSA9ICdidXR0b24nO1xuXHRcdHRoaXMuY2xvc2VCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ29uYm9hcmRpbmcuY2xvc2UnLCBcIkNsb3NlXCIpKTtcblx0XHR0aGlzLmNsb3NlQnV0dG9uLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5jbG9zZSkpO1xuXG5cdFx0Ly8gSGVhZGVyIHdpdGggcHJvZ3Jlc3Ncblx0XHRjb25zdCBoZWFkZXIgPSBhcHBlbmQodGhpcy5jYXJkLCAkKCcub25ib2FyZGluZy1hLWhlYWRlcicpKTtcblx0XHR0aGlzLnByb2dyZXNzQ29udGFpbmVyID0gYXBwZW5kKGhlYWRlciwgJCgnLm9uYm9hcmRpbmctYS1wcm9ncmVzcycpKTtcblx0XHR0aGlzLnN0ZXBMYWJlbEVsID0gYXBwZW5kKHRoaXMucHJvZ3Jlc3NDb250YWluZXIsICQoJ3NwYW4ub25ib2FyZGluZy1hLXN0ZXAtbGFiZWwnKSk7XG5cdFx0dGhpcy5fcmVuZGVyUHJvZ3Jlc3MoKTtcblxuXHRcdC8vIEJvZHlcblx0XHR0aGlzLmJvZHlFbCA9IGFwcGVuZCh0aGlzLmNhcmQsICQoJy5vbmJvYXJkaW5nLWEtYm9keScpKTtcblx0XHR0aGlzLnRpdGxlRWwgPSBhcHBlbmQodGhpcy5ib2R5RWwsICQoJ2gyLm9uYm9hcmRpbmctYS1zdGVwLXRpdGxlJykpO1xuXHRcdHRoaXMuc3VidGl0bGVFbCA9IGFwcGVuZCh0aGlzLmJvZHlFbCwgJCgncC5vbmJvYXJkaW5nLWEtc3RlcC1zdWJ0aXRsZScpKTtcblx0XHR0aGlzLmNvbnRlbnRFbCA9IGFwcGVuZCh0aGlzLmJvZHlFbCwgJCgnLm9uYm9hcmRpbmctYS1zdGVwLWNvbnRlbnQnKSk7XG5cdFx0dGhpcy5fcmVuZGVyU3RlcCgpO1xuXHRcdHRoaXMuX2xvZ1N0ZXBWaWV3KCk7XG5cblx0XHQvLyBGb290ZXJcblx0XHRjb25zdCBmb290ZXIgPSBhcHBlbmQodGhpcy5jYXJkLCAkKCcub25ib2FyZGluZy1hLWZvb3RlcicpKTtcblxuXHRcdHRoaXMuZm9vdGVyTGVmdCA9IGFwcGVuZChmb290ZXIsICQoJy5vbmJvYXJkaW5nLWEtZm9vdGVyLWxlZnQnKSk7XG5cblx0XHRjb25zdCBmb290ZXJSaWdodCA9IGFwcGVuZChmb290ZXIsICQoJy5vbmJvYXJkaW5nLWEtZm9vdGVyLXJpZ2h0JykpO1xuXG5cdFx0dGhpcy5iYWNrQnV0dG9uID0gYXBwZW5kKGZvb3RlclJpZ2h0LCAkPEhUTUxCdXR0b25FbGVtZW50PignYnV0dG9uLm9uYm9hcmRpbmctYS1idG4ub25ib2FyZGluZy1hLWJ0bi1zZWNvbmRhcnknKSk7XG5cdFx0dGhpcy5iYWNrQnV0dG9uLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ29uYm9hcmRpbmcuYmFjaycsIFwiQmFja1wiKTtcblx0XHR0aGlzLmJhY2tCdXR0b24udHlwZSA9ICdidXR0b24nO1xuXHRcdHRoaXMuZm9vdGVyRm9jdXNhYmxlRWxlbWVudHMucHVzaCh0aGlzLmJhY2tCdXR0b24pO1xuXG5cdFx0dGhpcy5uZXh0QnV0dG9uID0gYXBwZW5kKGZvb3RlclJpZ2h0LCAkPEhUTUxCdXR0b25FbGVtZW50PignYnV0dG9uLm9uYm9hcmRpbmctYS1idG4ub25ib2FyZGluZy1hLWJ0bi1wcmltYXJ5JykpO1xuXHRcdHRoaXMubmV4dEJ1dHRvbi50eXBlID0gJ2J1dHRvbic7XG5cdFx0dGhpcy5mb290ZXJGb2N1c2FibGVFbGVtZW50cy5wdXNoKHRoaXMubmV4dEJ1dHRvbik7XG5cdFx0dGhpcy5fdXBkYXRlQnV0dG9uU3RhdGVzKCk7XG5cblx0XHQvLyBFdmVudCBoYW5kbGVyc1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNsb3NlQnV0dG9uLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdHRoaXMuX2xvZ0FjdGlvbignc2tpcCcpO1xuXHRcdFx0dGhpcy5fZGlzbWlzcygnc2tpcCcpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5iYWNrQnV0dG9uLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnRTdGVwSW5kZXggPT09IDAgJiYgdGhpcy5lbnRlcnByaXNlU2lnbkluVWlTdGF0ZSA9PT0gJ2luc3RhbmNlJykge1xuXHRcdFx0XHR0aGlzLl9sb2dBY3Rpb24oJ2NhbmNlbEVudGVycHJpc2VJbnN0YW5jZVByb21wdCcpO1xuXHRcdFx0XHR0aGlzLmVudGVycHJpc2VTaWduSW5XYXRjaCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fc2V0RW50ZXJwcmlzZVNpZ25JblVpU3RhdGUoJ29wdGlvbnMnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2dBY3Rpb24oJ2JhY2snKTtcblx0XHRcdHRoaXMuX3ByZXZTdGVwKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLm5leHRCdXR0b24sIEV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzTGFzdFN0ZXAoKSkge1xuXHRcdFx0XHR0aGlzLl9hcHBseVN0ZXBTZWxlY3Rpb25zKHRoaXMuc3RlcHNbdGhpcy5jdXJyZW50U3RlcEluZGV4XSk7XG5cdFx0XHRcdHRoaXMuX2xvZ0FjdGlvbignY29tcGxldGUnKTtcblx0XHRcdFx0dGhpcy5fZGlzbWlzcygnY29tcGxldGUnKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5jdXJyZW50U3RlcEluZGV4ID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ0FjdGlvbignY29udGludWVXaXRob3V0U2lnbkluJyk7XG5cdFx0XHRcdHRoaXMuX25leHRTdGVwKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dBY3Rpb24oJ25leHQnKTtcblx0XHRcdFx0dGhpcy5fbmV4dFN0ZXAoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5vdmVybGF5LCBFdmVudFR5cGUuTU9VU0VfRE9XTiwgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLnRhcmdldCA9PT0gdGhpcy5vdmVybGF5KSB7XG5cdFx0XHRcdHRoaXMuX2Rpc21pc3MoJ3NraXAnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5vdmVybGF5LCBFdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cblx0XHRcdC8vIFByZXZlbnQgYWxsIGtleWJvYXJkIHNob3J0Y3V0cyBmcm9tIHJlYWNoaW5nIHRoZSBrZXliaW5kaW5nIHNlcnZpY2Vcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cblx0XHRcdGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkVzY2FwZSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHRoaXMuX2Rpc21pc3MoJ3NraXAnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5UYWIpIHtcblx0XHRcdFx0dGhpcy5fdHJhcFRhYihlLCBldmVudC5zaGlmdEtleSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRW50cmFuY2UgYW5pbWF0aW9uXG5cdFx0dGhpcy5vdmVybGF5LmNsYXNzTGlzdC5hZGQoJ2VudGVyaW5nJyk7XG5cdFx0Z2V0QWN0aXZlV2luZG93KCkucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcblx0XHRcdHRoaXMub3ZlcmxheT8uY2xhc3NMaXN0LnJlbW92ZSgnZW50ZXJpbmcnKTtcblx0XHRcdHRoaXMub3ZlcmxheT8uY2xhc3NMaXN0LmFkZCgndmlzaWJsZScpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fZm9jdXNDdXJyZW50U3RlcEVsZW1lbnQoKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc21pc3MocmVhc29uOiAnY29tcGxldGUnIHwgJ3NraXAnKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm92ZXJsYXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2dBY3Rpb24oJ2Rpc21pc3MnLCB1bmRlZmluZWQsIHJlYXNvbik7XG5cblx0XHR0aGlzLm92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZSgndmlzaWJsZScpO1xuXHRcdHRoaXMub3ZlcmxheS5jbGFzc0xpc3QuYWRkKCdleGl0aW5nJyk7XG5cblx0XHRsZXQgaGFuZGxlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IG9uVHJhbnNpdGlvbkVuZCA9ICgpID0+IHtcblx0XHRcdGlmIChoYW5kbGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGhhbmRsZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fcmVtb3ZlRnJvbURPTSgpO1xuXHRcdFx0aWYgKHJlYXNvbiA9PT0gJ2NvbXBsZXRlJykge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENvbXBsZXRlLmZpcmUoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkRGlzbWlzcy5maXJlKCk7XG5cdFx0fTtcblxuXHRcdHRoaXMub3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCd0cmFuc2l0aW9uZW5kJywgb25UcmFuc2l0aW9uRW5kLCB7IG9uY2U6IHRydWUgfSk7XG5cdFx0c2V0VGltZW91dChvblRyYW5zaXRpb25FbmQsIDQwMCk7XG5cdH1cblxuXHRwcml2YXRlIF9uZXh0U3RlcCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jdXJyZW50U3RlcEluZGV4IDwgdGhpcy5zdGVwcy5sZW5ndGggLSAxKSB7XG5cdFx0XHRjb25zdCBsZWF2aW5nU3RlcCA9IHRoaXMuc3RlcHNbdGhpcy5jdXJyZW50U3RlcEluZGV4XTtcblx0XHRcdGlmIChsZWF2aW5nU3RlcCA9PT0gT25ib2FyZGluZ1N0ZXBJZC5TaWduSW4pIHtcblx0XHRcdFx0dGhpcy5lbnRlcnByaXNlU2lnbkluVWlTdGF0ZSA9ICdvcHRpb25zJztcblx0XHRcdFx0dGhpcy5lbnRlcnByaXNlSW5zdGFuY2VWYWx1ZSA9ICcnO1xuXHRcdFx0XHR0aGlzLmVudGVycHJpc2VTaWduSW5XYXRjaCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2FwcGx5U3RlcFNlbGVjdGlvbnMobGVhdmluZ1N0ZXApO1xuXHRcdFx0dGhpcy5jdXJyZW50U3RlcEluZGV4Kys7XG5cdFx0XHR0aGlzLl9yZW5kZXJTdGVwKCk7XG5cdFx0XHR0aGlzLl9yZW5kZXJQcm9ncmVzcygpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQnV0dG9uU3RhdGVzKCk7XG5cdFx0XHR0aGlzLl9mb2N1c0N1cnJlbnRTdGVwRWxlbWVudCgpO1xuXHRcdFx0dGhpcy5fbG9nU3RlcFZpZXcoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQXBwbGllcyB0aGUgc2VsZWN0aW9ucyBtYWRlIG9uIGEgc3RlcCBvbmNlIHRoZSB1c2VyIG1vdmVzIHBhc3QgaXQsIGVpdGhlclxuXHQgKiBieSBjb250aW51aW5nIHRvIHRoZSBuZXh0IHN0ZXAgb3IgYnkgY29tcGxldGluZyB0aGUgb25ib2FyZGluZy5cblx0ICovXG5cdHByaXZhdGUgX2FwcGx5U3RlcFNlbGVjdGlvbnMoc3RlcElkOiBPbmJvYXJkaW5nU3RlcElkKTogdm9pZCB7XG5cdFx0aWYgKHN0ZXBJZCA9PT0gT25ib2FyZGluZ1N0ZXBJZC5QZXJzb25hbGl6ZSkge1xuXHRcdFx0dGhpcy5fYXBwbHlLZXltYXAodGhpcy5zZWxlY3RlZEtleW1hcElkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9wcmV2U3RlcCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jdXJyZW50U3RlcEluZGV4ID4gMCkge1xuXHRcdFx0dGhpcy5jdXJyZW50U3RlcEluZGV4LS07XG5cdFx0XHR0aGlzLl9yZW5kZXJTdGVwKCk7XG5cdFx0XHR0aGlzLl9yZW5kZXJQcm9ncmVzcygpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQnV0dG9uU3RhdGVzKCk7XG5cdFx0XHR0aGlzLl9mb2N1c0N1cnJlbnRTdGVwRWxlbWVudCgpO1xuXHRcdFx0dGhpcy5fbG9nU3RlcFZpZXcoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pc0xhc3RTdGVwKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmN1cnJlbnRTdGVwSW5kZXggPT09IHRoaXMuc3RlcHMubGVuZ3RoIC0gMTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclByb2dyZXNzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5wcm9ncmVzc0NvbnRhaW5lciB8fCAhdGhpcy5zdGVwTGFiZWxFbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNsZWFyTm9kZSh0aGlzLnByb2dyZXNzQ29udGFpbmVyKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5zdGVwcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZG90ID0gYXBwZW5kKHRoaXMucHJvZ3Jlc3NDb250YWluZXIsICQoJ3NwYW4ub25ib2FyZGluZy1hLXByb2dyZXNzLWRvdCcpKTtcblx0XHRcdGlmIChpID09PSB0aGlzLmN1cnJlbnRTdGVwSW5kZXgpIHtcblx0XHRcdFx0ZG90LmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuXHRcdFx0fSBlbHNlIGlmIChpIDwgdGhpcy5jdXJyZW50U3RlcEluZGV4KSB7XG5cdFx0XHRcdGRvdC5jbGFzc0xpc3QuYWRkKCdjb21wbGV0ZWQnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnByb2dyZXNzQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuc3RlcExhYmVsRWwpO1xuXHRcdHRoaXMuc3RlcExhYmVsRWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZShcblx0XHRcdCdvbmJvYXJkaW5nLnN0ZXBPZicsXG5cdFx0XHRcInswfSBvZiB7MX1cIixcblx0XHRcdHRoaXMuY3VycmVudFN0ZXBJbmRleCArIDEsXG5cdFx0XHR0aGlzLnN0ZXBzLmxlbmd0aFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJTdGVwKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy50aXRsZUVsIHx8ICF0aGlzLnN1YnRpdGxlRWwgfHwgIXRoaXMuY29udGVudEVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLnN0ZXBGb2N1c2FibGVFbGVtZW50cy5sZW5ndGggPSAwO1xuXG5cdFx0Y29uc3Qgc3RlcElkID0gdGhpcy5zdGVwc1t0aGlzLmN1cnJlbnRTdGVwSW5kZXhdO1xuXHRcdGNvbnN0IHVzZVNpZ25Jbkhlcm8gPSBzdGVwSWQgPT09IE9uYm9hcmRpbmdTdGVwSWQuU2lnbkluO1xuXHRcdHRoaXMudGl0bGVFbC5zdHlsZS5kaXNwbGF5ID0gdXNlU2lnbkluSGVybyA/ICdub25lJyA6ICcnO1xuXHRcdHRoaXMuc3VidGl0bGVFbC5zdHlsZS5kaXNwbGF5ID0gdXNlU2lnbkluSGVybyA/ICdub25lJyA6ICcnO1xuXHRcdHRoaXMudGl0bGVFbC50ZXh0Q29udGVudCA9IGdldE9uYm9hcmRpbmdTdGVwVGl0bGUoc3RlcElkKTtcblx0XHRpZiAoc3RlcElkID09PSBPbmJvYXJkaW5nU3RlcElkLlBlcnNvbmFsaXplKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJQZXJzb25hbGl6ZVN1YnRpdGxlKHRoaXMuc3VidGl0bGVFbCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3VidGl0bGVFbC50ZXh0Q29udGVudCA9IGdldE9uYm9hcmRpbmdTdGVwU3VidGl0bGUoc3RlcElkKTtcblx0XHR9XG5cblx0XHRjbGVhck5vZGUodGhpcy5jb250ZW50RWwpO1xuXG5cdFx0c3dpdGNoIChzdGVwSWQpIHtcblx0XHRcdGNhc2UgT25ib2FyZGluZ1N0ZXBJZC5TaWduSW46XG5cdFx0XHRcdHRoaXMuX3JlbmRlclNpZ25JblN0ZXAodGhpcy5jb250ZW50RWwpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgT25ib2FyZGluZ1N0ZXBJZC5QZXJzb25hbGl6ZTpcblx0XHRcdFx0dGhpcy5fcmVuZGVyUGVyc29uYWxpemVTdGVwKHRoaXMuY29udGVudEVsKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE9uYm9hcmRpbmdTdGVwSWQuQWlQcmVmZXJlbmNlOlxuXHRcdFx0XHR0aGlzLl9yZW5kZXJBaVByZWZlcmVuY2VTdGVwKHRoaXMuY29udGVudEVsKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0dGhpcy5ib2R5RWw/LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKFxuXHRcdFx0J29uYm9hcmRpbmcuc3RlcC5hcmlhJyxcblx0XHRcdFwiU3RlcCB7MH0gb2YgezF9OiB7Mn1cIixcblx0XHRcdHRoaXMuY3VycmVudFN0ZXBJbmRleCArIDEsXG5cdFx0XHR0aGlzLnN0ZXBzLmxlbmd0aCxcblx0XHRcdGdldE9uYm9hcmRpbmdTdGVwVGl0bGUoc3RlcElkKVxuXHRcdCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQnV0dG9uU3RhdGVzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmJhY2tCdXR0b24pIHtcblx0XHRcdGNvbnN0IHNob3dFbnRlcnByaXNlQmFjayA9IHRoaXMuY3VycmVudFN0ZXBJbmRleCA9PT0gMCAmJiB0aGlzLmVudGVycHJpc2VTaWduSW5VaVN0YXRlID09PSAnaW5zdGFuY2UnO1xuXHRcdFx0dGhpcy5iYWNrQnV0dG9uLnN0eWxlLmRpc3BsYXkgPSAodGhpcy5jdXJyZW50U3RlcEluZGV4ID09PSAwICYmICFzaG93RW50ZXJwcmlzZUJhY2spID8gJ25vbmUnIDogJyc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLm5leHRCdXR0b24pIHtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnRTdGVwSW5kZXggPT09IDApIHtcblx0XHRcdFx0aWYgKHRoaXMuX3VzZXJTaWduZWRJbikge1xuXHRcdFx0XHRcdHRoaXMubmV4dEJ1dHRvbi5jbGFzc05hbWUgPSAnb25ib2FyZGluZy1hLWJ0biBvbmJvYXJkaW5nLWEtYnRuLXByaW1hcnknO1xuXHRcdFx0XHRcdHRoaXMubmV4dEJ1dHRvbi50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdvbmJvYXJkaW5nLmNvbnRpbnVlJywgXCJDb250aW51ZVwiKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBTaWduLWluIHN0ZXA6IHNlY29uZGFyeSBcIkNvbnRpbnVlIHdpdGhvdXQgU2lnbmluZyBJblwiXG5cdFx0XHRcdFx0dGhpcy5uZXh0QnV0dG9uLmNsYXNzTmFtZSA9ICdvbmJvYXJkaW5nLWEtYnRuIG9uYm9hcmRpbmctYS1idG4tc2Vjb25kYXJ5Jztcblx0XHRcdFx0XHR0aGlzLm5leHRCdXR0b24udGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnb25ib2FyZGluZy5jb250aW51ZVdpdGhvdXRTaWduSW4nLCBcIkNvbnRpbnVlIHdpdGhvdXQgU2lnbmluZyBJblwiKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICh0aGlzLl9pc0xhc3RTdGVwKCkpIHtcblx0XHRcdFx0dGhpcy5uZXh0QnV0dG9uLmNsYXNzTmFtZSA9ICdvbmJvYXJkaW5nLWEtYnRuIG9uYm9hcmRpbmctYS1idG4tcHJpbWFyeSc7XG5cdFx0XHRcdHRoaXMubmV4dEJ1dHRvbi50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdvbmJvYXJkaW5nLmdldFN0YXJ0ZWQnLCBcIkdldCBTdGFydGVkXCIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5uZXh0QnV0dG9uLmNsYXNzTmFtZSA9ICdvbmJvYXJkaW5nLWEtYnRuIG9uYm9hcmRpbmctYS1idG4tcHJpbWFyeSc7XG5cdFx0XHRcdHRoaXMubmV4dEJ1dHRvbi50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdvbmJvYXJkaW5nLm5leHQnLCBcIkNvbnRpbnVlXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5mb290ZXJMZWZ0KSB7XG5cdFx0XHRpZiAodGhpcy5faXNMYXN0U3RlcCgpKSB7XG5cdFx0XHRcdC8vIFNob3cgc2lnbi1pbiBudWRnZSBpbiBmb290ZXJcblx0XHRcdFx0aWYgKCF0aGlzLl9mb290ZXJTaWduSW5CdG4gJiYgIXRoaXMuX3VzZXJTaWduZWRJbikge1xuXHRcdFx0XHRcdHRoaXMuX2Zvb3RlclNpZ25JbkJ0biA9IGFwcGVuZCh0aGlzLmZvb3RlckxlZnQsICQ8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdidXR0b24ub25ib2FyZGluZy1hLXNpZ25pbi1udWRnZS1idG4nKSk7XG5cdFx0XHRcdFx0dGhpcy5fZm9vdGVyU2lnbkluQnRuLnR5cGUgPSAnYnV0dG9uJztcblx0XHRcdFx0XHR0aGlzLl9mb290ZXJTaWduSW5CdG4udGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnb25ib2FyZGluZy5zZXNzaW9ucy5zaWduSW5OdWRnZScsIFwiU2lnbiBpbiB0byB1c2UgQ29kZXhcIik7XG5cdFx0XHRcdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9mb290ZXJTaWduSW5CdG4sIEV2ZW50VHlwZS5DTElDSywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nQWN0aW9uKCdzaWduSW5OdWRnZScpO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5faGFuZGxlU2lnbkluKCk7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fdXNlclNpZ25lZEluICYmIHRoaXMuX2Zvb3RlclNpZ25JbkJ0bikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9mb290ZXJTaWduSW5CdG4uc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh0aGlzLl9mb290ZXJTaWduSW5CdG4pIHtcblx0XHRcdFx0XHR0aGlzLl9mb290ZXJTaWduSW5CdG4ucmVtb3ZlKCk7XG5cdFx0XHRcdFx0dGhpcy5fZm9vdGVyU2lnbkluQnRuID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cdC8vIFN0ZXA6IFNpZ24gSW5cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cblx0cHJpdmF0ZSBfcmVuZGVyU2lnbkluU3RlcChjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qgd3JhcHBlciA9IGFwcGVuZChjb250YWluZXIsICQoJy5vbmJvYXJkaW5nLWEtc2lnbmluJykpO1xuXHRcdGNvbnN0IGJyYW5kID0gYXBwZW5kKHdyYXBwZXIsICQoJy5vbmJvYXJkaW5nLWEtc2lnbmluLWJyYW5kJykpO1xuXHRcdGNvbnN0IGJyYW5kSWNvbiA9IGFwcGVuZChicmFuZCwgJCgnc3Bhbi5vbmJvYXJkaW5nLWEtc2lnbmluLWJyYW5kLWljb24nKSk7XG5cdFx0YnJhbmRJY29uLnNldEF0dHJpYnV0ZSgncm9sZScsICdpbWcnKTtcblx0XHRicmFuZEljb24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgcHJvZHVjdC5uYW1lTG9uZyk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXBwZW5kKHdyYXBwZXIsICQoJy5vbmJvYXJkaW5nLWEtc2lnbmluLWNvbnRlbnQnKSk7XG5cdFx0Y29uc3QgY29udGVudE1haW4gPSBhcHBlbmQoY29udGVudCwgJCgnLm9uYm9hcmRpbmctYS1zaWduaW4tY29udGVudC1tYWluJykpO1xuXHRcdGNvbnN0IHRpdGxlID0gYXBwZW5kKGNvbnRlbnRNYWluLCAkKCdoMi5vbmJvYXJkaW5nLWEtc2lnbmluLXRpdGxlJykpO1xuXHRcdHRpdGxlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ29uYm9hcmRpbmcuc2lnbkluLmhlcm9UaXRsZScsIFwiV2VsY29tZSB0byBWUyBDb2RlXCIpO1xuXG5cdFx0Y29uc3Qgc3VidGl0bGUgPSBhcHBlbmQoY29udGVudE1haW4sICQoJ3Aub25ib2FyZGluZy1hLXNpZ25pbi1zdWJ0aXRsZScpKTtcblx0XHRzdWJ0aXRsZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5oZXJvU3VidGl0bGUnLCBcIlNpZ24gaW4gdG8gdXNlIENvZGV4IGluIEZvcmdlLlwiKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBhcHBlbmQoY29udGVudE1haW4sICQoJy5vbmJvYXJkaW5nLWEtc2lnbmluLWFjdGlvbnMnKSk7XG5cblx0XHRpZiAodGhpcy5fdXNlclNpZ25lZEluKSB7XG5cdFx0XHRjb25zdCBzaWduZWRJbiA9IGFwcGVuZChhY3Rpb25zLCAkKCcub25ib2FyZGluZy1hLXNpZ25pbi1jb25maXJtYXRpb24nKSk7XG5cdFx0XHRjb25zdCBpY29uID0gYXBwZW5kKHNpZ25lZEluLCAkKCdzcGFuJykpO1xuXHRcdFx0aWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uY2hlY2spKTtcblx0XHRcdGljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHRjb25zdCB0ZXh0ID0gYXBwZW5kKHNpZ25lZEluLCAkKCdzcGFuJykpO1xuXHRcdFx0dGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5zaWduZWRJbicsIFwiWW91J3JlIHNpZ25lZCBpbi4gWW91IGNhbiBjb250aW51ZSB0byB0aGUgbmV4dCBzdGVwLlwiKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3dpdGNoICh0aGlzLmVudGVycHJpc2VTaWduSW5VaVN0YXRlKSB7XG5cdFx0XHRcdGNhc2UgJ2luc3RhbmNlJzpcblx0XHRcdFx0XHR0aGlzLl9yZW5kZXJFbnRlcnByaXNlSW5zdGFuY2VGb3JtKGFjdGlvbnMpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdwcm9ncmVzcyc6XG5cdFx0XHRcdFx0dGhpcy5fcmVuZGVyRW50ZXJwcmlzZVNpZ25JblByb2dyZXNzKGFjdGlvbnMpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHRoaXMuX3JlbmRlckRlZmF1bHRTaWduSW5BY3Rpb25zKGFjdGlvbnMpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGZvb3RlciA9IGFwcGVuZCh3cmFwcGVyLCAkKCcub25ib2FyZGluZy1hLXNpZ25pbi1mb290ZXInKSk7XG5cblx0XHRjb25zdCBkaXNjbGFpbWVyQ29sID0gYXBwZW5kKGZvb3RlciwgJCgnLm9uYm9hcmRpbmctYS1zaWduaW4tZGlzY2xhaW1lci1jb2wnKSk7XG5cblx0XHQvLyBHaXRIdWIgQ29waWxvdCBkaXNjbGFpbWVyXG5cdFx0Y29uc3QgY29waWxvdERpc2NsYWltZXIgPSBhcHBlbmQoZGlzY2xhaW1lckNvbCwgJCgnLm9uYm9hcmRpbmctYS1zaWduaW4tZGlzY2xhaW1lcicpKTtcblx0XHRjb3BpbG90RGlzY2xhaW1lci5hcHBlbmQobG9jYWxpemUoJ29uYm9hcmRpbmcuc2lnbkluLmRpc2NsYWltZXIucHJlZml4JywgXCJCeSBzaWduaW5nIGluLCB5b3UgYWdyZWUgdG8gezB9J3MgXCIsIGRlZmF1bHRDaGF0LnByb3ZpZGVyLmRlZmF1bHQubmFtZSkpO1xuXHRcdHRoaXMuX2NyZWF0ZUlubGluZUxpbmsoY29waWxvdERpc2NsYWltZXIsIGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5kaXNjbGFpbWVyLnRlcm1zJywgXCJUZXJtc1wiKSwgZGVmYXVsdENoYXQudGVybXNTdGF0ZW1lbnRVcmwpO1xuXHRcdGNvcGlsb3REaXNjbGFpbWVyLmFwcGVuZChsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uZGlzY2xhaW1lci5taWRkbGUnLCBcIiBhbmQgXCIpKTtcblx0XHR0aGlzLl9jcmVhdGVJbmxpbmVMaW5rKGNvcGlsb3REaXNjbGFpbWVyLCBsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uZGlzY2xhaW1lci5wcml2YWN5JywgXCJQcml2YWN5IFN0YXRlbWVudFwiKSwgZGVmYXVsdENoYXQucHJpdmFjeVN0YXRlbWVudFVybCk7XG5cdFx0Y29waWxvdERpc2NsYWltZXIuYXBwZW5kKGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5kaXNjbGFpbWVyLmNvcGlsb3RQcmVmaXgnLCBcIi4gezB9IENvcGlsb3QgbWF5IHNob3cgXCIsIGRlZmF1bHRDaGF0LnByb3ZpZGVyLmRlZmF1bHQubmFtZSkpO1xuXHRcdHRoaXMuX2NyZWF0ZUlubGluZUxpbmsoY29waWxvdERpc2NsYWltZXIsIGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5kaXNjbGFpbWVyLnB1YmxpY0NvZGUnLCBcInB1YmxpYyBjb2RlXCIpLCBkZWZhdWx0Q2hhdC5wdWJsaWNDb2RlTWF0Y2hlc1VybCk7XG5cdFx0Y29waWxvdERpc2NsYWltZXIuYXBwZW5kKGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5kaXNjbGFpbWVyLmltcHJvdmVTdWZmaXgnLCBcIiBzdWdnZXN0aW9ucyBhbmQgdXNlIHlvdXIgZGF0YSB0byBpbXByb3ZlIHRoZSBwcm9kdWN0LlwiKSk7XG5cdFx0Y29waWxvdERpc2NsYWltZXIuYXBwZW5kKCcgJyk7XG5cdFx0Y29waWxvdERpc2NsYWltZXIuYXBwZW5kKGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5kaXNjbGFpbWVyLnNldHRpbmdzUHJlZml4JywgXCJZb3UgY2FuIGNoYW5nZSB0aGVzZSBcIikpO1xuXHRcdHRoaXMuX2NyZWF0ZUlubGluZUxpbmsoY29waWxvdERpc2NsYWltZXIsIGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5kaXNjbGFpbWVyLnNldHRpbmdzJywgXCJzZXR0aW5nc1wiKSwgdGhpcy5kZWZhdWx0QWNjb3VudFNlcnZpY2UucmVzb2x2ZUdpdEh1YlVybChHaXRIdWJQYXRocy5jb3BpbG90U2V0dGluZ3MpKTtcblx0XHRjb3BpbG90RGlzY2xhaW1lci5hcHBlbmQobG9jYWxpemUoJ29uYm9hcmRpbmcuc2lnbkluLmRpc2NsYWltZXIuc3VmZml4JywgXCIgYW55dGltZS5cIikpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyRGVmYXVsdFNpZ25JbkFjdGlvbnMoYWN0aW9uczogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBnaXRodWJCdG4gPSB0aGlzLl9yZWdpc3RlclN0ZXBGb2N1c2FibGUodGhpcy5fY3JlYXRlU2lnbkluQnV0dG9uKGFjdGlvbnMsICdnaXRodWInLCBsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uZ2l0aHViJywgXCJDb250aW51ZSB3aXRoIEdpdEh1YlwiKSwge1xuXHRcdFx0ZW1waGFzaXplZDogdHJ1ZSxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uZ2l0aHViLmFyaWEnLCBcIkNvbnRpbnVlIHdpdGggR2l0SHViXCIpXG5cdFx0fSkpO1xuXHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZ2l0aHViQnRuLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdHRoaXMuX2xvZ0FjdGlvbignc2lnbkluJywgdW5kZWZpbmVkLCAnZ2l0aHViJyk7XG5cdFx0XHR0aGlzLl9oYW5kbGVTaWduSW4oKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBnb29nbGVCdG4gPSB0aGlzLl9yZWdpc3RlclN0ZXBGb2N1c2FibGUodGhpcy5fY3JlYXRlU2lnbkluQnV0dG9uKGFjdGlvbnMsICdnb29nbGUnLCBsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uZ29vZ2xlJywgXCJDb250aW51ZSB3aXRoIEdvb2dsZVwiKSwge1xuXHRcdFx0aWNvbk9ubHk6IHRydWUsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ29uYm9hcmRpbmcuc2lnbkluLmdvb2dsZScsIFwiQ29udGludWUgd2l0aCBHb29nbGVcIilcblx0XHR9KSk7XG5cdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihnb29nbGVCdG4sIEV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nQWN0aW9uKCdzaWduSW4nLCB1bmRlZmluZWQsICdnb29nbGUnKTtcblx0XHRcdHRoaXMuX2hhbmRsZVNpZ25JbignZ29vZ2xlJyk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYXBwbGVCdG4gPSB0aGlzLl9yZWdpc3RlclN0ZXBGb2N1c2FibGUodGhpcy5fY3JlYXRlU2lnbkluQnV0dG9uKGFjdGlvbnMsICdhcHBsZScsIGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5hcHBsZScsIFwiQ29udGludWUgd2l0aCBBcHBsZVwiKSwge1xuXHRcdFx0aWNvbk9ubHk6IHRydWUsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ29uYm9hcmRpbmcuc2lnbkluLmFwcGxlJywgXCJDb250aW51ZSB3aXRoIEFwcGxlXCIpXG5cdFx0fSkpO1xuXHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYXBwbGVCdG4sIEV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nQWN0aW9uKCdzaWduSW4nLCB1bmRlZmluZWQsICdhcHBsZScpO1xuXHRcdFx0dGhpcy5faGFuZGxlU2lnbkluKCdhcHBsZScpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGdoZUJ0biA9IHRoaXMuX3JlZ2lzdGVyU3RlcEZvY3VzYWJsZSh0aGlzLl9jcmVhdGVTaWduSW5CdXR0b24oYWN0aW9ucywgJ2dpdGh1Yi1lbnRlcnByaXNlJywgbG9jYWxpemUoJ29uYm9hcmRpbmcuc2lnbkluLmdoZScsIFwiR0hFXCIpLCB7XG5cdFx0XHR0ZXh0T25seTogdHJ1ZSxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uZ2hlLmFyaWEnLCBcIkNvbnRpbnVlIHdpdGggR2l0SHViIEVudGVycHJpc2VcIilcblx0XHR9KSk7XG5cdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihnaGVCdG4sIEV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nQWN0aW9uKCdzaWduSW4nLCB1bmRlZmluZWQsICdnaXRodWItZW50ZXJwcmlzZScpO1xuXHRcdFx0dm9pZCB0aGlzLl9oYW5kbGVFbnRlcnByaXNlU2lnbkluKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgR0hFX0lOUFVUX0FDVElPTl9QQURESU5HID0gMjg7XG5cblx0cHJpdmF0ZSBfcmVuZGVyRW50ZXJwcmlzZUluc3RhbmNlRm9ybShhY3Rpb25zOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGVudGVycHJpc2VQcm9tcHRMYWJlbCA9IHRoaXMuX2dldEVudGVycHJpc2VJbnN0YW5jZVByb21wdExhYmVsKCk7XG5cblx0XHRjb25zdCBjb250YWluZXIgPSBhcHBlbmQoYWN0aW9ucywgJCgnLm9uYm9hcmRpbmctYS1zaWduaW4tZ2hlLWlucHV0JykpO1xuXG5cdFx0Y29uc3Qgc3VibWl0QWN0aW9uID0gdGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHQnb25ib2FyZGluZy5zaWduSW4uZW50ZXJwcmlzZS5zdWJtaXQnLFxuXHRcdFx0bG9jYWxpemUoJ29uYm9hcmRpbmcuc2lnbkluLmVudGVycHJpc2UuY29udGludWUnLCBcIkNvbnRpbnVlXCIpLFxuXHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uYXJyb3dSaWdodCksXG5cdFx0XHRmYWxzZSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IGlucHV0Qm94ID0gdGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKG5ldyBJbnB1dEJveChjb250YWluZXIsIHVuZGVmaW5lZCwge1xuXHRcdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5lbnRlcnByaXNlLnBsYWNlaG9sZGVyJywgJ2kuZS4gXCJvY3RvY2F0XCIgb3IgXCJodHRwczovL29jdG9jYXQuZ2hlLmNvbVwiLi4uJyksXG5cdFx0XHRhcmlhTGFiZWw6IGVudGVycHJpc2VQcm9tcHRMYWJlbCxcblx0XHRcdGFjdGlvbnM6IFtzdWJtaXRBY3Rpb25dLFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlcyxcblx0XHR9KSk7XG5cdFx0aW5wdXRCb3gudmFsdWUgPSB0aGlzLmVudGVycHJpc2VJbnN0YW5jZVZhbHVlO1xuXHRcdGlucHV0Qm94LnBhZGRpbmdSaWdodCA9IE9uYm9hcmRpbmdWYXJpYXRpb25BLkdIRV9JTlBVVF9BQ1RJT05fUEFERElORztcblx0XHRjb25zdCBpbnB1dCA9IHRoaXMuX3JlZ2lzdGVyU3RlcEZvY3VzYWJsZShpbnB1dEJveC5pbnB1dEVsZW1lbnQpO1xuXG5cdFx0Y29uc3Qgc3VibWl0ID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VHaGVJbnN0YW5jZUlucHV0KGlucHV0Qm94LnZhbHVlKTtcblx0XHRcdGlmIChyZXN1bHQua2luZCA9PT0gR2hlUGFyc2VSZXN1bHRLaW5kLkVtcHR5IHx8IHJlc3VsdC5raW5kID09PSBHaGVQYXJzZVJlc3VsdEtpbmQuSW52YWxpZCkge1xuXHRcdFx0XHR2YWxpZGF0ZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl9zdWJtaXRFbnRlcnByaXNlSW5zdGFuY2UocmVzdWx0LnJlc29sdmVkVXJpKTtcblx0XHR9O1xuXHRcdHN1Ym1pdEFjdGlvbi5ydW4gPSBzdWJtaXQ7XG5cblx0XHRjb25zdCBtZXNzYWdlID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLm9uYm9hcmRpbmctYS1zaWduaW4tZ2hlLW1lc3NhZ2UnKSk7XG5cblx0XHRjb25zdCB2YWxpZGF0ZSA9ICgpOiBib29sZWFuID0+IHtcblx0XHRcdHRoaXMuZW50ZXJwcmlzZUluc3RhbmNlVmFsdWUgPSBpbnB1dEJveC52YWx1ZTtcblx0XHRcdGlucHV0Qm94LmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZXJyb3InKTtcblx0XHRcdG1lc3NhZ2UuY2xhc3NMaXN0LnJlbW92ZSgnZXJyb3InLCAnaW5mbycpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUdoZUluc3RhbmNlSW5wdXQoaW5wdXRCb3gudmFsdWUpO1xuXHRcdFx0c3dpdGNoIChyZXN1bHQua2luZCkge1xuXHRcdFx0XHRjYXNlIEdoZVBhcnNlUmVzdWx0S2luZC5FbXB0eTpcblx0XHRcdFx0XHRtZXNzYWdlLnRleHRDb250ZW50ID0gZW50ZXJwcmlzZVByb21wdExhYmVsO1xuXHRcdFx0XHRcdHN1Ym1pdEFjdGlvbi5lbmFibGVkID0gZmFsc2U7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRjYXNlIEdoZVBhcnNlUmVzdWx0S2luZC5TaW5nbGVXb3JkOlxuXHRcdFx0XHRcdG1lc3NhZ2UuY2xhc3NMaXN0LmFkZCgnaW5mbycpO1xuXHRcdFx0XHRcdG1lc3NhZ2UudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uZW50ZXJwcmlzZS5yZXNvbHZlJywgXCJXaWxsIHJlc29sdmUgdG8gezB9XCIsIHJlc3VsdC5yZXNvbHZlZFVyaSk7XG5cdFx0XHRcdFx0c3VibWl0QWN0aW9uLmVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRjYXNlIEdoZVBhcnNlUmVzdWx0S2luZC5GdWxsVXJpOlxuXHRcdFx0XHRcdHN1Ym1pdEFjdGlvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRtZXNzYWdlLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdGNhc2UgR2hlUGFyc2VSZXN1bHRLaW5kLkludmFsaWQ6XG5cdFx0XHRcdFx0aW5wdXRCb3guZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdlcnJvcicpO1xuXHRcdFx0XHRcdG1lc3NhZ2UuY2xhc3NMaXN0LmFkZCgnZXJyb3InKTtcblx0XHRcdFx0XHRtZXNzYWdlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ29uYm9hcmRpbmcuc2lnbkluLmVudGVycHJpc2UuaW52YWxpZCcsICdZb3UgbXVzdCBlbnRlciBhIHZhbGlkIHswfSBpbnN0YW5jZSAoaS5lLiBcIm9jdG9jYXRcIiBvciBcImh0dHBzOi8vb2N0b2NhdC5naGUuY29tXCIpJywgZGVmYXVsdENoYXQucHJvdmlkZXIuZW50ZXJwcmlzZS5uYW1lKTtcblx0XHRcdFx0XHRzdWJtaXRBY3Rpb24uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKGlucHV0Qm94Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHZhbGlkYXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dCwgRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0dm9pZCBzdWJtaXRBY3Rpb24ucnVuKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRXNjYXBlKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fbG9nQWN0aW9uKCdjYW5jZWxFbnRlcnByaXNlSW5zdGFuY2VQcm9tcHQnKTtcblx0XHRcdFx0dGhpcy5lbnRlcnByaXNlU2lnbkluV2F0Y2ggPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX3NldEVudGVycHJpc2VTaWduSW5VaVN0YXRlKCdvcHRpb25zJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dmFsaWRhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckVudGVycHJpc2VTaWduSW5Qcm9ncmVzcyhhY3Rpb25zOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGFwcGVuZChhY3Rpb25zLCAkKCcub25ib2FyZGluZy1hLXNpZ25pbi1naGUtcHJvZ3Jlc3MnKSk7XG5cdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1saXZlJywgJ3BvbGl0ZScpO1xuXHRcdGNvbnN0IHNwaW5uZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuJykpO1xuXHRcdHNwaW5uZXIuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmxvYWRpbmcpLCAnY29kaWNvbi1tb2RpZmllci1zcGluJyk7XG5cdFx0c3Bpbm5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRjb25zdCBtZXNzYWdlID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLm9uYm9hcmRpbmctYS1zaWduaW4tZ2hlLXByb2dyZXNzLW1lc3NhZ2UnKSk7XG5cdFx0bWVzc2FnZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5lbnRlcnByaXNlLnByb2dyZXNzJywgXCJXYWl0aW5nIGZvciB7MH0gc2lnbi1pbiB0byBjb21wbGV0ZS4uLlwiLCBkZWZhdWx0Q2hhdC5wcm92aWRlci5lbnRlcnByaXNlLm5hbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RW50ZXJwcmlzZUluc3RhbmNlUHJvbXB0TGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ29uYm9hcmRpbmcuc2lnbkluLmVudGVycHJpc2UucHJvbXB0JywgXCJXaGF0IGlzIHlvdXIgezB9IGluc3RhbmNlP1wiLCBkZWZhdWx0Q2hhdC5wcm92aWRlci5lbnRlcnByaXNlLm5hbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0RW50ZXJwcmlzZVNpZ25JblVpU3RhdGUoc3RhdGU6IEVudGVycHJpc2VTaWduSW5VaVN0YXRlKTogdm9pZCB7XG5cdFx0dGhpcy5lbnRlcnByaXNlU2lnbkluVWlTdGF0ZSA9IHN0YXRlO1xuXHRcdGlmICh0aGlzLnN0ZXBzW3RoaXMuY3VycmVudFN0ZXBJbmRleF0gPT09IE9uYm9hcmRpbmdTdGVwSWQuU2lnbkluICYmIHRoaXMuY29udGVudEVsKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJTdGVwKCk7XG5cdFx0XHR0aGlzLl91cGRhdGVCdXR0b25TdGF0ZXMoKTtcblx0XHRcdHRoaXMuX2ZvY3VzQ3VycmVudFN0ZXBFbGVtZW50KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlU2lnbkluQnV0dG9uKHBhcmVudDogSFRNTEVsZW1lbnQsIHByb3ZpZGVyQ2xhc3M6ICdnaXRodWInIHwgJ2dpdGh1Yi1lbnRlcnByaXNlJyB8ICdnb29nbGUnIHwgJ2FwcGxlJywgbGFiZWw6IHN0cmluZywgb3B0aW9ucz86IHsgZW1waGFzaXplZD86IGJvb2xlYW47IGljb25Pbmx5PzogYm9vbGVhbjsgdGV4dE9ubHk/OiBib29sZWFuOyBsYWJlbD86IHN0cmluZyB9KTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuXHRcdGNvbnN0IGlzQ29tcGFjdCA9IG9wdGlvbnM/Lmljb25Pbmx5IHx8IG9wdGlvbnM/LnRleHRPbmx5O1xuXHRcdGNvbnN0IGJ0biA9IGFwcGVuZChwYXJlbnQsICQ8SFRNTEJ1dHRvbkVsZW1lbnQ+KGlzQ29tcGFjdCA/ICdidXR0b24ub25ib2FyZGluZy1hLXNpZ25pbi1pY29uLWJ0bicgOiAnYnV0dG9uLm9uYm9hcmRpbmctYS1zaWduaW4tYnRuJykpO1xuXHRcdGJ0bi50eXBlID0gJ2J1dHRvbic7XG5cdFx0YnRuLnRpdGxlID0gb3B0aW9ucz8ubGFiZWwgPz8gbGFiZWw7XG5cdFx0YnRuLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIG9wdGlvbnM/LmxhYmVsID8/IGxhYmVsKTtcblx0XHRpZiAob3B0aW9ucz8uZW1waGFzaXplZCkge1xuXHRcdFx0YnRuLmNsYXNzTGlzdC5hZGQoJ3ByaW1hcnknKTtcblx0XHR9XG5cblx0XHRpZiAoIW9wdGlvbnM/LnRleHRPbmx5KSB7XG5cdFx0XHRjb25zdCBtYXJrID0gYXBwZW5kKGJ0biwgJCgnc3Bhbi5vbmJvYXJkaW5nLWEtcHJvdmlkZXItbWFyaycpKTtcblx0XHRcdG1hcmsuY2xhc3NMaXN0LmFkZChwcm92aWRlckNsYXNzKTtcblx0XHRcdG1hcmsuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHRpZiAocHJvdmlkZXJDbGFzcyA9PT0gJ2dpdGh1YicgfHwgcHJvdmlkZXJDbGFzcyA9PT0gJ2dpdGh1Yi1lbnRlcnByaXNlJykge1xuXHRcdFx0XHRtYXJrLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5naXRodWIpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIW9wdGlvbnM/Lmljb25Pbmx5KSB7XG5cdFx0XHRjb25zdCBsYWJlbEVsID0gYXBwZW5kKGJ0biwgJCgnc3Bhbi5vbmJvYXJkaW5nLWEtc2lnbmluLWJ0bi1sYWJlbCcpKTtcblx0XHRcdGxhYmVsRWwudGV4dENvbnRlbnQgPSBsYWJlbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gYnRuO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlU2lnbkluKHNvY2lhbFByb3ZpZGVyPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBzb2NpYWxQcm92aWRlciA/PyAnZ2l0aHViJztcblx0XHRjb25zdCB3YXRjaCA9IFN0b3BXYXRjaC5jcmVhdGUoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYWNjb3VudCA9IGF3YWl0IHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLnNpZ25Jbih7XG5cdFx0XHRcdGV4dHJhQXV0aG9yaXplUGFyYW1ldGVyczogeyBnZXRfc3RhcnRlZF93aXRoOiAnY29waWxvdC12c2NvZGUnIH0sXG5cdFx0XHRcdHByb3ZpZGVyOiBzb2NpYWxQcm92aWRlcixcblx0XHRcdH0pO1xuXHRcdFx0aWYgKGFjY291bnQpIHtcblx0XHRcdFx0dGhpcy5fdXNlclNpZ25lZEluID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8SW5zdGFsbENoYXRFdmVudCwgSW5zdGFsbENoYXRDbGFzc2lmaWNhdGlvbj4oJ2NvbW1hbmRDZW50ZXIuY2hhdEluc3RhbGwnLCB7IGluc3RhbGxSZXN1bHQ6ICdpbnN0YWxsZWQnLCBpbnN0YWxsRHVyYXRpb246IHdhdGNoLmVsYXBzZWQoKSwgc2lnblVwRXJyb3JDb2RlOiB1bmRlZmluZWQsIHByb3ZpZGVyIH0pO1xuXHRcdFx0XHQvLyBSdW4gY2hhdCBzZXR1cCBpbiB0aGUgYmFja2dyb3VuZCAoc2lnbi11cCwgZXh0ZW5zaW9uIGluc3RhbGwsIGVudGl0bGVtZW50IHJlc29sdXRpb24pXG5cdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC50cmlnZ2VyU2V0dXAnLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0XHRkaXNhYmxlQ2hhdFZpZXdSZXZlYWw6IHRydWUsXG5cdFx0XHRcdFx0c2V0dXBTdHJhdGVneTogQ2hhdFNldHVwU3RyYXRlZ3kuRGVmYXVsdFNldHVwLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy5fbmV4dFN0ZXAoKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEluc3RhbGxDaGF0RXZlbnQsIEluc3RhbGxDaGF0Q2xhc3NpZmljYXRpb24+KCdjb21tYW5kQ2VudGVyLmNoYXRJbnN0YWxsJywgeyBpbnN0YWxsUmVzdWx0OiAnY2FuY2VsbGVkJywgaW5zdGFsbER1cmF0aW9uOiB3YXRjaC5lbGFwc2VkKCksIHNpZ25VcEVycm9yQ29kZTogdW5kZWZpbmVkLCBwcm92aWRlciB9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJbnN0YWxsQ2hhdEV2ZW50LCBJbnN0YWxsQ2hhdENsYXNzaWZpY2F0aW9uPignY29tbWFuZENlbnRlci5jaGF0SW5zdGFsbCcsIHsgaW5zdGFsbFJlc3VsdDogJ2ZhaWxlZE5vdFNpZ25lZEluJywgaW5zdGFsbER1cmF0aW9uOiB3YXRjaC5lbGFwc2VkKCksIHNpZ25VcEVycm9yQ29kZTogdW5kZWZpbmVkLCBwcm92aWRlciB9KTtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5lcnJvcicsIFwiU2lnbi1pbiBmYWlsZWQuIFlvdSBjYW4gdHJ5IGFnYWluIGxhdGVyIGZyb20gdGhlIEFjY291bnRzIG1lbnUuXCIpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlRW50ZXJwcmlzZVNpZ25JbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleGlzdGluZ1VyaSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihkZWZhdWx0Q2hhdC5wcm92aWRlclVyaVNldHRpbmcpO1xuXHRcdGlmICh0eXBlb2YgZXhpc3RpbmdVcmkgIT09ICdzdHJpbmcnIHx8ICFHSEVfRlVMTF9VUklfUkVHRVgudGVzdChleGlzdGluZ1VyaSkpIHtcblx0XHRcdHRoaXMuZW50ZXJwcmlzZUluc3RhbmNlVmFsdWUgPSBleGlzdGluZ1VyaSA/PyAnJztcblx0XHRcdHRoaXMuZW50ZXJwcmlzZVNpZ25JbldhdGNoID0gU3RvcFdhdGNoLmNyZWF0ZSgpO1xuXHRcdFx0dGhpcy5fc2V0RW50ZXJwcmlzZVNpZ25JblVpU3RhdGUoJ2luc3RhbmNlJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lbnRlcnByaXNlSW5zdGFuY2VWYWx1ZSA9IGV4aXN0aW5nVXJpO1xuXHRcdGF3YWl0IHRoaXMuX3J1bkVudGVycHJpc2VTaWduSW5TZXR1cCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3VibWl0RW50ZXJwcmlzZUluc3RhbmNlKHJlc29sdmVkVXJpOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShkZWZhdWx0Q2hhdC5wcm92aWRlclVyaVNldHRpbmcsIHJlc29sdmVkVXJpLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHRcdFx0dGhpcy5lbnRlcnByaXNlSW5zdGFuY2VWYWx1ZSA9IHJlc29sdmVkVXJpO1xuXHRcdFx0YXdhaXQgdGhpcy5fcnVuRW50ZXJwcmlzZVNpZ25JblNldHVwKCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHR0aGlzLmVudGVycHJpc2VTaWduSW5XYXRjaCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3NldEVudGVycHJpc2VTaWduSW5VaVN0YXRlKCdpbnN0YW5jZScpO1xuXHRcdFx0dGhpcy5fbm90aWZ5RW50ZXJwcmlzZVNpZ25JbkVycm9yKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcnVuRW50ZXJwcmlzZVNpZ25JblNldHVwKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdhdGNoID0gdGhpcy5lbnRlcnByaXNlU2lnbkluV2F0Y2ggPz8gU3RvcFdhdGNoLmNyZWF0ZSgpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGVmYXVsdENoYXQucHJvdmlkZXIuZW50ZXJwcmlzZS5pZDtcblx0XHR0aGlzLl9zZXRFbnRlcnByaXNlU2lnbkluVWlTdGF0ZSgncHJvZ3Jlc3MnKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzdWNjZXNzID0gYXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxib29sZWFuPignd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRyaWdnZXJTZXR1cCcsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRkaXNhYmxlQ2hhdFZpZXdSZXZlYWw6IHRydWUsXG5cdFx0XHRcdHNldHVwU3RyYXRlZ3k6IENoYXRTZXR1cFN0cmF0ZWd5LlNldHVwV2l0aEVudGVycHJpc2VQcm92aWRlcixcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoc3VjY2Vzcykge1xuXHRcdFx0XHR0aGlzLl91c2VyU2lnbmVkSW4gPSB0cnVlO1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJbnN0YWxsQ2hhdEV2ZW50LCBJbnN0YWxsQ2hhdENsYXNzaWZpY2F0aW9uPignY29tbWFuZENlbnRlci5jaGF0SW5zdGFsbCcsIHsgaW5zdGFsbFJlc3VsdDogJ2luc3RhbGxlZCcsIGluc3RhbGxEdXJhdGlvbjogd2F0Y2guZWxhcHNlZCgpLCBzaWduVXBFcnJvckNvZGU6IHVuZGVmaW5lZCwgcHJvdmlkZXIgfSk7XG5cdFx0XHRcdHRoaXMuX25leHRTdGVwKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9zZXRFbnRlcnByaXNlU2lnbkluVWlTdGF0ZSgnb3B0aW9ucycpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikpIHtcblx0XHRcdFx0dGhpcy5fc2V0RW50ZXJwcmlzZVNpZ25JblVpU3RhdGUoJ29wdGlvbnMnKTtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8SW5zdGFsbENoYXRFdmVudCwgSW5zdGFsbENoYXRDbGFzc2lmaWNhdGlvbj4oJ2NvbW1hbmRDZW50ZXIuY2hhdEluc3RhbGwnLCB7IGluc3RhbGxSZXN1bHQ6ICdjYW5jZWxsZWQnLCBpbnN0YWxsRHVyYXRpb246IHdhdGNoLmVsYXBzZWQoKSwgc2lnblVwRXJyb3JDb2RlOiB1bmRlZmluZWQsIHByb3ZpZGVyIH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3NldEVudGVycHJpc2VTaWduSW5VaVN0YXRlKCdpbnN0YW5jZScpO1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8SW5zdGFsbENoYXRFdmVudCwgSW5zdGFsbENoYXRDbGFzc2lmaWNhdGlvbj4oJ2NvbW1hbmRDZW50ZXIuY2hhdEluc3RhbGwnLCB7IGluc3RhbGxSZXN1bHQ6ICdmYWlsZWROb3RTaWduZWRJbicsIGluc3RhbGxEdXJhdGlvbjogd2F0Y2guZWxhcHNlZCgpLCBzaWduVXBFcnJvckNvZGU6IHVuZGVmaW5lZCwgcHJvdmlkZXIgfSk7XG5cdFx0XHR0aGlzLl9ub3RpZnlFbnRlcnByaXNlU2lnbkluRXJyb3IoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5lbnRlcnByaXNlU2lnbkluV2F0Y2ggPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbm90aWZ5RW50ZXJwcmlzZVNpZ25JbkVycm9yKCk6IHZvaWQge1xuXHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ29uYm9hcmRpbmcuc2lnbkluLmVudGVycHJpc2UuZXJyb3InLCBcIkdpdEh1YiBFbnRlcnByaXNlIHNpZ24taW4gZmFpbGVkLiBDaGVjayB5b3VyIGluc3RhbmNlIFVSTCBhbmQgdHJ5IGFnYWluLlwiKSxcblx0XHR9KTtcblx0fVxuXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvLyBTdGVwOiBQZXJzb25hbGl6ZSAoVGhlbWUgKyBLZXltYXApXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5cdHByaXZhdGUgX3JlbmRlclBlcnNvbmFsaXplU3RlcChjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qgd3JhcHBlciA9IGFwcGVuZChjb250YWluZXIsICQoJy5vbmJvYXJkaW5nLWEtcGVyc29uYWxpemUnKSk7XG5cblx0XHQvLyBUaGVtZSBzZWN0aW9uXG5cdFx0Y29uc3QgdGhlbWVMYWJlbCA9IGFwcGVuZCh3cmFwcGVyLCAkKCdkaXYub25ib2FyZGluZy1hLXNlY3Rpb24tbGFiZWwnKSk7XG5cdFx0dGhlbWVMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdvbmJvYXJkaW5nLnBlcnNvbmFsaXplLnRoZW1lJywgXCJDb2xvciBUaGVtZVwiKTtcblxuXHRcdGNvbnN0IHRoZW1lSGludCA9IGFwcGVuZCh3cmFwcGVyLCAkKCdkaXYub25ib2FyZGluZy1hLXRoZW1lLWhpbnQnKSk7XG5cdFx0dGhlbWVIaW50LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ29uYm9hcmRpbmcucGVyc29uYWxpemUudGhlbWVIaW50JywgXCJZb3UgY2FuIGJyb3dzZSBhbmQgaW5zdGFsbCBtb3JlIHRoZW1lcyBsYXRlciBmcm9tIHRoZSBFeHRlbnNpb25zIHZpZXcuXCIpO1xuXG5cdFx0Y29uc3QgdGhlbWVHcmlkID0gYXBwZW5kKHdyYXBwZXIsICQoJy5vbmJvYXJkaW5nLWEtdGhlbWUtZ3JpZCcpKTtcblx0XHR0aGVtZUdyaWQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3JhZGlvZ3JvdXAnKTtcblx0XHR0aGVtZUdyaWQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ29uYm9hcmRpbmcucGVyc29uYWxpemUudGhlbWVMYWJlbCcsIFwiQ2hvb3NlIGEgY29sb3IgdGhlbWVcIikpO1xuXG5cdFx0Y29uc3QgaGFzT3RoZXJFZGl0b3JzID0gdGhpcy5faGFzT3RoZXJFZGl0b3JzKCk7XG5cdFx0Y29uc3QgYWxsVGhlbWVzID0gcHJvZHVjdC5vbmJvYXJkaW5nVGhlbWVzID8/IFtdO1xuXHRcdC8vIFdoZW4gb3RoZXIgZWRpdG9ycyBhcmUgZGV0ZWN0ZWQsIHNob3cgYSBjb21wYWN0IHNldCAoZXhjbHVkZSBzb2xhcml6ZWQgdmFyaWFudHMpLlxuXHRcdGNvbnN0IHRoZW1lczogcmVhZG9ubHkgSU9uYm9hcmRpbmdUaGVtZU9wdGlvbltdID0gaGFzT3RoZXJFZGl0b3JzXG5cdFx0XHQ/IGFsbFRoZW1lcy5maWx0ZXIodCA9PiAhdC5pZC5zdGFydHNXaXRoKCdzb2xhcml6ZWQnKSlcblx0XHRcdDogYWxsVGhlbWVzO1xuXG5cdFx0aWYgKCFoYXNPdGhlckVkaXRvcnMpIHtcblx0XHRcdHRoZW1lR3JpZC5jbGFzc0xpc3QuYWRkKCd0aGVtZS1ncmlkLWV4cGFuZGVkJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGhlbWVDYXJkczogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdGhlbWUgb2YgdGhlbWVzKSB7XG5cdFx0XHR0aGlzLl9jcmVhdGVUaGVtZUNhcmQodGhlbWVHcmlkLCB0aGVtZSwgdGhlbWVDYXJkcyk7XG5cdFx0fVxuXHRcdC8vIE1ha2UgYWxsIHRoZW1lIGNhcmRzIGluZGl2aWR1YWxseSB0YWJiYWJsZVxuXHRcdGZvciAoY29uc3QgY2FyZCBvZiB0aGVtZUNhcmRzKSB7XG5cdFx0XHRjYXJkLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnMCcpO1xuXHRcdH1cblxuXHRcdC8vIEtleWJvYXJkIE1hcHBpbmcgc2VjdGlvbiBcdTIwMTQgb25seSBzaG93biB3aGVuIGFub3RoZXIgZWRpdG9yIGlzIGRldGVjdGVkXG5cdFx0Y29uc3Qga2V5bWFwT3B0aW9ucyA9IHRoaXMuX2RldGVjdGVkRWRpdG9ySWRzXG5cdFx0XHQ/IChwcm9kdWN0Lm9uYm9hcmRpbmdLZXltYXBzID8/IFtdKS5maWx0ZXIoayA9PiB0aGlzLl9kZXRlY3RlZEVkaXRvcklkcyEuaGFzKGsuaWQpKVxuXHRcdFx0OiBbXTtcblxuXHRcdGlmIChoYXNPdGhlckVkaXRvcnMpIHtcblx0XHRcdGNvbnN0IGtleW1hcExhYmVsID0gYXBwZW5kKHdyYXBwZXIsICQoJ2Rpdi5vbmJvYXJkaW5nLWEtc2VjdGlvbi1sYWJlbC5vbmJvYXJkaW5nLWEtc2VjdGlvbi1sYWJlbC1rZXltYXAnKSk7XG5cdFx0XHRrZXltYXBMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdvbmJvYXJkaW5nLnBlcnNvbmFsaXplLmtleW1hcCcsIFwiS2V5Ym9hcmQgTWFwcGluZ1wiKTtcblxuXHRcdFx0Y29uc3Qga2V5bWFwSGludCA9IGFwcGVuZCh3cmFwcGVyLCAkKCdkaXYub25ib2FyZGluZy1hLXRoZW1lLWhpbnQnKSk7XG5cdFx0XHRrZXltYXBIaW50LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ29uYm9hcmRpbmcucGVyc29uYWxpemUua2V5bWFwSGludCcsIFwiQ29taW5nIGZyb20gYW5vdGhlciBlZGl0b3I/IEltcG9ydCB5b3VyIGtleWJvYXJkIG1hcHBpbmcgdG8gZmVlbCByaWdodCBhdCBob21lLlwiKTtcblxuXHRcdFx0Y29uc3Qga2V5bWFwTGlzdCA9IGFwcGVuZCh3cmFwcGVyLCAkKCcub25ib2FyZGluZy1hLWtleW1hcC1saXN0JykpO1xuXHRcdFx0a2V5bWFwTGlzdC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAncmFkaW9ncm91cCcpO1xuXHRcdFx0a2V5bWFwTGlzdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnb25ib2FyZGluZy5wZXJzb25hbGl6ZS5rZXltYXBMYWJlbCcsIFwiQ2hvb3NlIGEga2V5Ym9hcmQgbWFwcGluZ1wiKSk7XG5cblx0XHRcdGNvbnN0IGtleW1hcFBpbGxzOiBIVE1MQnV0dG9uRWxlbWVudFtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGtleW1hcCBvZiBrZXltYXBPcHRpb25zKSB7XG5cdFx0XHRcdGNvbnN0IHBpbGwgPSB0aGlzLl9yZWdpc3RlclN0ZXBGb2N1c2FibGUoYXBwZW5kKGtleW1hcExpc3QsICQ8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdidXR0b24ub25ib2FyZGluZy1hLWtleW1hcC1waWxsJykpKTtcblx0XHRcdFx0cGlsbC50eXBlID0gJ2J1dHRvbic7XG5cdFx0XHRcdHBpbGwuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3JhZGlvJyk7XG5cdFx0XHRcdHBpbGwuc2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnLCBrZXltYXAuaWQgPT09IHRoaXMuc2VsZWN0ZWRLZXltYXBJZCA/ICd0cnVlJyA6ICdmYWxzZScpO1xuXHRcdFx0XHRwaWxsLnRpdGxlID0ga2V5bWFwLmRlc2NyaXB0aW9uO1xuXHRcdFx0XHRrZXltYXBQaWxscy5wdXNoKHBpbGwpO1xuXG5cdFx0XHRcdGNvbnN0IGxhYmVsU3BhbiA9IGFwcGVuZChwaWxsLCAkKCdzcGFuJykpO1xuXHRcdFx0XHRsYWJlbFNwYW4udGV4dENvbnRlbnQgPSBrZXltYXAubGFiZWw7XG5cblx0XHRcdFx0aWYgKGtleW1hcC5pZCA9PT0gdGhpcy5zZWxlY3RlZEtleW1hcElkKSB7XG5cdFx0XHRcdFx0cGlsbC5jbGFzc0xpc3QuYWRkKCdzZWxlY3RlZCcpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihwaWxsLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9sb2dBY3Rpb24oJ3NlbGVjdEtleW1hcCcsIHVuZGVmaW5lZCwga2V5bWFwLmlkKTtcblx0XHRcdFx0XHR0aGlzLnNlbGVjdGVkS2V5bWFwSWQgPSBrZXltYXAuaWQ7XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IHAgb2Yga2V5bWFwUGlsbHMpIHtcblx0XHRcdFx0XHRcdHAuY2xhc3NMaXN0LnJlbW92ZSgnc2VsZWN0ZWQnKTtcblx0XHRcdFx0XHRcdHAuc2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnLCAnZmFsc2UnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cGlsbC5jbGFzc0xpc3QuYWRkKCdzZWxlY3RlZCcpO1xuXHRcdFx0XHRcdHBpbGwuc2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnLCAndHJ1ZScpO1xuXHRcdFx0XHRcdHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuYWxlcnQobG9jYWxpemUoJ29uYm9hcmRpbmcua2V5bWFwLnNlbGVjdGVkLmFsZXJ0JywgXCJ7MH0ga2V5Ym9hcmQgbWFwcGluZyBzZWxlY3RlZFwiLCBrZXltYXAubGFiZWwpKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRLZXltYXBJbmRleCA9IGtleW1hcE9wdGlvbnMuZmluZEluZGV4KGsgPT4gay5pZCA9PT0gdGhpcy5zZWxlY3RlZEtleW1hcElkKTtcblx0XHRcdHRoaXMuX3NldHVwUmFkaW9Hcm91cE5hdmlnYXRpb24oa2V5bWFwUGlsbHMsIE1hdGgubWF4KDAsIHNlbGVjdGVkS2V5bWFwSW5kZXgpKTtcblx0XHR9XG5cblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclBlcnNvbmFsaXplU3VidGl0bGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNsZWFyTm9kZShjb250YWluZXIpO1xuXHRcdGNvbnN0IG1vZGlmaWVyID0gaXNNYWNpbnRvc2ggPyAnQ21kJyA6ICdDdHJsJztcblx0XHRjb250YWluZXIuYXBwZW5kKFxuXHRcdFx0bG9jYWxpemUoJ29uYm9hcmRpbmcucGVyc29uYWxpemUudGlwLnByZWZpeCcsIFwiVGlwOiBQcmVzcyBcIiksXG5cdFx0XHR0aGlzLl9jcmVhdGVLYmQobG9jYWxpemUoeyBrZXk6ICdvbmJvYXJkaW5nLnBlcnNvbmFsaXplLnRpcC5tb2RpZmllcicsIGNvbW1lbnQ6IFsnVGhpcyBpcyBhIGtleWJvYXJkIG1vZGlmaWVyIGtleSwgQ3RybCBvbiBXaW5kb3dzL0xpbnV4IG9yIENtZCBvbiBNYWMnXSB9LCBcInswfVwiLCBtb2RpZmllcikpLFxuXHRcdFx0JysnLFxuXHRcdFx0dGhpcy5fY3JlYXRlS2JkKGxvY2FsaXplKCdvbmJvYXJkaW5nLnBlcnNvbmFsaXplLnRpcC5zaGlmdCcsIFwiU2hpZnRcIikpLFxuXHRcdFx0JysnLFxuXHRcdFx0dGhpcy5fY3JlYXRlS2JkKGxvY2FsaXplKCdvbmJvYXJkaW5nLnBlcnNvbmFsaXplLnRpcC5wJywgXCJQXCIpKSxcblx0XHRcdGxvY2FsaXplKCdvbmJvYXJkaW5nLnBlcnNvbmFsaXplLnRpcC5zdWZmaXgnLCBcIiB0byBhY2Nlc3MgYWxsIFZTIENvZGUgY29tbWFuZHMuXCIpLFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVUaGVtZUNhcmQocGFyZW50OiBIVE1MRWxlbWVudCwgdGhlbWU6IElPbmJvYXJkaW5nVGhlbWVPcHRpb24sIGFsbENhcmRzOiBIVE1MRWxlbWVudFtdKTogdm9pZCB7XG5cdFx0Y29uc3QgY2FyZCA9IHRoaXMuX3JlZ2lzdGVyU3RlcEZvY3VzYWJsZShhcHBlbmQocGFyZW50LCAkKCdkaXYub25ib2FyZGluZy1hLXRoZW1lLWNhcmQnKSkpO1xuXHRcdGFsbENhcmRzLnB1c2goY2FyZCk7XG5cdFx0Y2FyZC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAncmFkaW8nKTtcblx0XHRjYXJkLnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgdGhlbWUuaWQgPT09IHRoaXMuc2VsZWN0ZWRUaGVtZUlkID8gJ3RydWUnIDogJ2ZhbHNlJyk7XG5cdFx0Y2FyZC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aGVtZS5sYWJlbCk7XG5cblx0XHRpZiAodGhlbWUuaWQgPT09IHRoaXMuc2VsZWN0ZWRUaGVtZUlkKSB7XG5cdFx0XHRjYXJkLmNsYXNzTGlzdC5hZGQoJ3NlbGVjdGVkJyk7XG5cdFx0fVxuXG5cdFx0Ly8gU1ZHIHByZXZpZXcgaW1hZ2Vcblx0XHRjb25zdCBwcmV2aWV3ID0gYXBwZW5kKGNhcmQsICQoJ2Rpdi5vbmJvYXJkaW5nLWEtdGhlbWUtcHJldmlldycpKTtcblx0XHRjb25zdCBpbWcgPSBhcHBlbmQocHJldmlldywgJDxIVE1MSW1hZ2VFbGVtZW50PignaW1nLm9uYm9hcmRpbmctYS10aGVtZS1wcmV2aWV3LWltZycpKTtcblx0XHRpbWcuYWx0ID0gJyc7XG5cdFx0aW1nLnNyYyA9IEZpbGVBY2Nlc3MuYXNCcm93c2VyVXJpKGB2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lT25ib2FyZGluZy9icm93c2VyL21lZGlhL3RoZW1lLXByZXZpZXctJHt0aGVtZS5pZH0uc3ZnYCkudG9TdHJpbmcodHJ1ZSk7XG5cblx0XHQvLyBMYWJlbFxuXHRcdGNvbnN0IGxhYmVsID0gYXBwZW5kKGNhcmQsICQoJ2Rpdi5vbmJvYXJkaW5nLWEtdGhlbWUtbGFiZWwnKSk7XG5cdFx0bGFiZWwudGV4dENvbnRlbnQgPSB0aGVtZS5sYWJlbDtcblxuXHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoY2FyZCwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dBY3Rpb24oJ3NlbGVjdFRoZW1lJywgdW5kZWZpbmVkLCB0aGVtZS5pZCk7XG5cdFx0XHR0aGlzLl9zZWxlY3RUaGVtZSh0aGVtZSk7XG5cdFx0XHRmb3IgKGNvbnN0IGMgb2YgYWxsQ2FyZHMpIHtcblx0XHRcdFx0Yy5jbGFzc0xpc3QucmVtb3ZlKCdzZWxlY3RlZCcpO1xuXHRcdFx0XHRjLnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgJ2ZhbHNlJyk7XG5cdFx0XHR9XG5cdFx0XHRjYXJkLmNsYXNzTGlzdC5hZGQoJ3NlbGVjdGVkJyk7XG5cdFx0XHRjYXJkLnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgJ3RydWUnKTtcblx0XHRcdHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuYWxlcnQobG9jYWxpemUoJ29uYm9hcmRpbmcudGhlbWUuc2VsZWN0ZWQuYWxlcnQnLCBcInswfSB0aGVtZSBzZWxlY3RlZFwiLCB0aGVtZS5sYWJlbCkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoY2FyZCwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRjYXJkLmNsaWNrKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cdC8vIFRoZW1lIC8gS2V5bWFwIGhlbHBlcnNcblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cblx0cHJpdmF0ZSBhc3luYyBfc2VsZWN0VGhlbWUodGhlbWU6IElPbmJvYXJkaW5nVGhlbWVPcHRpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnNlbGVjdGVkVGhlbWVJZCA9IHRoZW1lLmlkO1xuXHRcdGNvbnN0IGFsbFRoZW1lcyA9IGF3YWl0IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWVzKCk7XG5cdFx0Y29uc3QgbWF0Y2ggPSBhbGxUaGVtZXMuZmluZCh0ID0+IHQuc2V0dGluZ3NJZCA9PT0gdGhlbWUudGhlbWVJZCk7XG5cdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHR0aGlzLnRoZW1lU2VydmljZS5zZXRDb2xvclRoZW1lKG1hdGNoLmlkLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FwcGx5S2V5bWFwKGtleW1hcElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBrZXltYXAgPSAocHJvZHVjdC5vbmJvYXJkaW5nS2V5bWFwcyA/PyBbXSkuZmluZChrID0+IGsuaWQgPT09IGtleW1hcElkKTtcblx0XHRpZiAoIWtleW1hcD8uZXh0ZW5zaW9uSWQpIHtcblx0XHRcdHJldHVybjsgLy8gVlMgQ29kZSBkZWZhdWx0LCBub3RoaW5nIHRvIGluc3RhbGxcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZ2FsbGVyeSA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyBpZDoga2V5bWFwLmV4dGVuc2lvbklkIH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGlmIChnYWxsZXJ5Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsRnJvbUdhbGxlcnkoZ2FsbGVyeVswXSwgeyBjb250ZXh0OiB7IFtFWFRFTlNJT05fSU5TVEFMTF9TS0lQX1dBTEtUSFJPVUdIX0NPTlRFWFRdOiB0cnVlIH0gfSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdvbmJvYXJkaW5nLmtleW1hcC5pbnN0YWxsRXJyb3InLCBcIkNvdWxkIG5vdCBpbnN0YWxsIHswfSBrZXltYXAuIFlvdSBjYW4gaW5zdGFsbCBpdCBsYXRlciBmcm9tIEV4dGVuc2lvbnMuXCIsIGtleW1hcC5sYWJlbCksXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYXNPdGhlckVkaXRvcnMoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qga2V5bWFwT3B0aW9ucyA9IHRoaXMuX2RldGVjdGVkRWRpdG9ySWRzXG5cdFx0XHQ/IChwcm9kdWN0Lm9uYm9hcmRpbmdLZXltYXBzID8/IFtdKS5maWx0ZXIoayA9PiB0aGlzLl9kZXRlY3RlZEVkaXRvcklkcyEuaGFzKGsuaWQpKVxuXHRcdFx0OiBbXTtcblx0XHRyZXR1cm4ga2V5bWFwT3B0aW9ucy5zb21lKGsgPT4gay5pZCAhPT0gJ3ZzY29kZScpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrcyBjb21tb24gaW5zdGFsbCBwYXRocyBmb3Iga25vd24gZWRpdG9ycyBhbmQgcmV0dXJucyB0aGUgc2V0IG9mXG5cdCAqIGtleW1hcCBvcHRpb24gSURzIHdob3NlIGVkaXRvcnMgYXJlIGZvdW5kIG9uIHRoaXMgbWFjaGluZS5cblx0ICogQWx3YXlzIGluY2x1ZGVzICd2c2NvZGUnICh0aGUgZGVmYXVsdCkuIEluIHdlYiBlbnZpcm9ubWVudHMgb3Igb25cblx0ICogdW5rbm93biBwbGF0Zm9ybXMsIHJldHVybnMgb25seSAndnNjb2RlJy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2RldGVjdEluc3RhbGxlZEVkaXRvcnMoKTogUHJvbWlzZTxTZXQ8c3RyaW5nPj4ge1xuXHRcdGNvbnN0IGRldGVjdGVkID0gbmV3IFNldDxzdHJpbmc+KFsndnNjb2RlJ10pO1xuXHRcdGNvbnN0IGhvbWUgPSB0aGlzLnBhdGhTZXJ2aWNlLnVzZXJIb21lKHsgcHJlZmVyTG9jYWw6IHRydWUgfSk7XG5cblx0XHRpbnRlcmZhY2UgRWRpdG9yQ2hlY2sgeyBpZDogc3RyaW5nOyBwYXRoczogVVJJW10gfVxuXHRcdGNvbnN0IGNoZWNrczogRWRpdG9yQ2hlY2tbXSA9IFtdO1xuXG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0Y29uc3QgbG9jYWxBcHBEYXRhID0gVVJJLmpvaW5QYXRoKGhvbWUsICdBcHBEYXRhJywgJ0xvY2FsJyk7XG5cdFx0XHRjaGVja3MucHVzaChcblx0XHRcdFx0eyBpZDogJ3N1YmxpbWUnLCBwYXRoczogW1VSSS5maWxlKCdDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXFN1YmxpbWUgVGV4dFxcXFxzdWJsaW1lX3RleHQuZXhlJyksIFVSSS5maWxlKCdDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXFN1YmxpbWUgVGV4dCAzXFxcXHN1YmxpbWVfdGV4dC5leGUnKV0gfSxcblx0XHRcdFx0eyBpZDogJ2ludGVsbGlqJywgcGF0aHM6IFtVUkkuam9pblBhdGgobG9jYWxBcHBEYXRhLCAnSmV0QnJhaW5zJywgJ1Rvb2xib3gnKV0gfSxcblx0XHRcdFx0eyBpZDogJ3ZpbScsIHBhdGhzOiBbVVJJLmpvaW5QYXRoKGhvbWUsICdfdmltcmMnKSwgVVJJLmpvaW5QYXRoKGxvY2FsQXBwRGF0YSwgJ252aW0nLCAnaW5pdC52aW0nKSwgVVJJLmpvaW5QYXRoKGxvY2FsQXBwRGF0YSwgJ252aW0nLCAnaW5pdC5sdWEnKV0gfSxcblx0XHRcdFx0eyBpZDogJ2VjbGlwc2UnLCBwYXRoczogW1VSSS5maWxlKCdDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXEVjbGlwc2VcXFxcZWNsaXBzZS5leGUnKSwgVVJJLmZpbGUoJ0M6XFxcXFByb2dyYW0gRmlsZXNcXFxcZWNsaXBzZVxcXFxlY2xpcHNlLmV4ZScpXSB9LFxuXHRcdFx0XHR7IGlkOiAnbm90ZXBhZHBwJywgcGF0aHM6IFtVUkkuZmlsZSgnQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxOb3RlcGFkKytcXFxcbm90ZXBhZCsrLmV4ZScpLCBVUkkuZmlsZSgnQzpcXFxcUHJvZ3JhbSBGaWxlcyAoeDg2KVxcXFxOb3RlcGFkKytcXFxcbm90ZXBhZCsrLmV4ZScpXSB9LFxuXHRcdFx0KTtcblx0XHR9IGVsc2UgaWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRjaGVja3MucHVzaChcblx0XHRcdFx0eyBpZDogJ3N1YmxpbWUnLCBwYXRoczogW1VSSS5maWxlKCcvQXBwbGljYXRpb25zL1N1YmxpbWUgVGV4dC5hcHAnKV0gfSxcblx0XHRcdFx0eyBpZDogJ2ludGVsbGlqJywgcGF0aHM6IFtVUkkuZmlsZSgnL0FwcGxpY2F0aW9ucy9JbnRlbGxpSiBJREVBLmFwcCcpLCBVUkkuZmlsZSgnL0FwcGxpY2F0aW9ucy9JbnRlbGxpSiBJREVBIENFLmFwcCcpXSB9LFxuXHRcdFx0XHR7IGlkOiAndmltJywgcGF0aHM6IFtVUkkuam9pblBhdGgoaG9tZSwgJy52aW1yYycpLCBVUkkuam9pblBhdGgoaG9tZSwgJy5jb25maWcnLCAnbnZpbScsICdpbml0LnZpbScpLCBVUkkuam9pblBhdGgoaG9tZSwgJy5jb25maWcnLCAnbnZpbScsICdpbml0Lmx1YScpXSB9LFxuXHRcdFx0XHR7IGlkOiAnZWNsaXBzZScsIHBhdGhzOiBbVVJJLmZpbGUoJy9BcHBsaWNhdGlvbnMvRWNsaXBzZS5hcHAnKSwgVVJJLmZpbGUoJy9BcHBsaWNhdGlvbnMvRWNsaXBzZSBJREUuYXBwJyldIH0sXG5cdFx0XHRcdHsgaWQ6ICdub3RlcGFkcHAnLCBwYXRoczogW1VSSS5maWxlKCcvQXBwbGljYXRpb25zL05vdGVwYWQrKy5hcHAnKV0gfSxcblx0XHRcdCk7XG5cdFx0fSBlbHNlIGlmIChpc0xpbnV4KSB7XG5cdFx0XHRjaGVja3MucHVzaChcblx0XHRcdFx0eyBpZDogJ3N1YmxpbWUnLCBwYXRoczogW1VSSS5maWxlKCcvdXNyL2Jpbi9zdWJsJyksIFVSSS5maWxlKCcvb3B0L3N1YmxpbWVfdGV4dC9zdWJsaW1lX3RleHQnKV0gfSxcblx0XHRcdFx0eyBpZDogJ2ludGVsbGlqJywgcGF0aHM6IFtVUkkuam9pblBhdGgoaG9tZSwgJy5sb2NhbCcsICdzaGFyZScsICdKZXRCcmFpbnMnLCAnVG9vbGJveCcpLCBVUkkuZmlsZSgnL29wdC9pZGVhJyldIH0sXG5cdFx0XHRcdHsgaWQ6ICd2aW0nLCBwYXRoczogW1VSSS5qb2luUGF0aChob21lLCAnLnZpbXJjJyksIFVSSS5qb2luUGF0aChob21lLCAnLmNvbmZpZycsICdudmltJywgJ2luaXQudmltJyksIFVSSS5qb2luUGF0aChob21lLCAnLmNvbmZpZycsICdudmltJywgJ2luaXQubHVhJyldIH0sXG5cdFx0XHRcdHsgaWQ6ICdlY2xpcHNlJywgcGF0aHM6IFtVUkkuZmlsZSgnL3Vzci9iaW4vZWNsaXBzZScpLCBVUkkuZmlsZSgnL29wdC9lY2xpcHNlL2VjbGlwc2UnKSwgVVJJLmpvaW5QYXRoKGhvbWUsICdlY2xpcHNlJywgJ2VjbGlwc2UnKV0gfSxcblx0XHRcdFx0eyBpZDogJ25vdGVwYWRwcCcsIHBhdGhzOiBbVVJJLmZpbGUoJy91c3IvYmluL25vdGVwYWRxcScpLCBVUkkuZmlsZSgnL3NuYXAvbm90ZXBhZC1wbHVzLXBsdXMvY3VycmVudCcpXSB9LFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChjaGVja3MubWFwKGFzeW5jIGNoZWNrID0+IHtcblx0XHRcdGZvciAoY29uc3QgcGF0aCBvZiBjaGVjay5wYXRocykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGlmIChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyhwYXRoKSkge1xuXHRcdFx0XHRcdFx0ZGV0ZWN0ZWQuYWRkKGNoZWNrLmlkKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIFBhdGggbm90IGFjY2Vzc2libGUgXHUyMDE0IHNraXBcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBkZXRlY3RlZDtcblx0fVxuXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvLyBTdGVwOiBBSSBQcmVmZXJlbmNlXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5cdHByaXZhdGUgX3JlbmRlckFpUHJlZmVyZW5jZVN0ZXAoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHdyYXBwZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcub25ib2FyZGluZy1hLWFpLXByZWYnKSk7XG5cblx0XHRjb25zdCBjYXJkcyA9IGFwcGVuZCh3cmFwcGVyLCAkKCcub25ib2FyZGluZy1hLWFpLXByZWYtY2FyZHMnKSk7XG5cdFx0Y2FyZHMuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3JhZGlvZ3JvdXAnKTtcblx0XHRjYXJkcy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnb25ib2FyZGluZy5haVByZWYubGFiZWwnLCBcIkNob29zZSB5b3VyIEFJIGNvbGxhYm9yYXRpb24gc3R5bGVcIikpO1xuXG5cdFx0Y29uc3QgYWxsQ2FyZHM6IEhUTUxCdXR0b25FbGVtZW50W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IG9wdGlvbiBvZiBPTkJPQVJESU5HX0FJX1BSRUZFUkVOQ0VfT1BUSU9OUykge1xuXHRcdFx0Y29uc3QgY2FyZCA9IHRoaXMuX3JlZ2lzdGVyU3RlcEZvY3VzYWJsZShhcHBlbmQoY2FyZHMsICQ8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdidXR0b24ub25ib2FyZGluZy1hLWFpLXByZWYtY2FyZCcpKSk7XG5cdFx0XHRjYXJkLnR5cGUgPSAnYnV0dG9uJztcblx0XHRcdGNhcmQuZGF0YXNldC5pZCA9IG9wdGlvbi5pZDtcblx0XHRcdGNhcmQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3JhZGlvJyk7XG5cdFx0XHRjYXJkLnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgb3B0aW9uLmlkID09PSB0aGlzLnNlbGVjdGVkQWlNb2RlID8gJ3RydWUnIDogJ2ZhbHNlJyk7XG5cdFx0XHRhbGxDYXJkcy5wdXNoKGNhcmQpO1xuXG5cdFx0XHRpZiAob3B0aW9uLmlkID09PSB0aGlzLnNlbGVjdGVkQWlNb2RlKSB7XG5cdFx0XHRcdGNhcmQuY2xhc3NMaXN0LmFkZCgnc2VsZWN0ZWQnKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaWNvbkVsID0gYXBwZW5kKGNhcmQsICQoJ3NwYW4ub25ib2FyZGluZy1hLWFpLXByZWYtY2FyZC1pY29uJykpO1xuXHRcdFx0aWNvbkVsLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdFx0Y29uc3QgaWNvbiA9IENvZGljb25bb3B0aW9uLmljb24gYXMga2V5b2YgdHlwZW9mIENvZGljb25dID8/IENvZGljb24uc3BhcmtsZTtcblx0XHRcdGljb25FbC5hcHBlbmRDaGlsZChyZW5kZXJJY29uKGljb24pKTtcblxuXHRcdFx0Y29uc3QgdGl0bGVFbCA9IGFwcGVuZChjYXJkLCAkKCdkaXYub25ib2FyZGluZy1hLWFpLXByZWYtY2FyZC10aXRsZScpKTtcblx0XHRcdHRpdGxlRWwudGV4dENvbnRlbnQgPSBvcHRpb24ubGFiZWw7XG5cblx0XHRcdGNvbnN0IGRlc2NFbCA9IGFwcGVuZChjYXJkLCAkKCdkaXYub25ib2FyZGluZy1hLWFpLXByZWYtY2FyZC1kZXNjJykpO1xuXHRcdFx0ZGVzY0VsLnRleHRDb250ZW50ID0gb3B0aW9uLmRlc2NyaXB0aW9uO1xuXG5cdFx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNhcmQsIEV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dBY3Rpb24oJ3NlbGVjdEFpTW9kZScsIHVuZGVmaW5lZCwgb3B0aW9uLmlkKTtcblx0XHRcdFx0dGhpcy5zZWxlY3RlZEFpTW9kZSA9IG9wdGlvbi5pZDtcblx0XHRcdFx0Zm9yIChjb25zdCBjIG9mIGFsbENhcmRzKSB7XG5cdFx0XHRcdFx0Yy5jbGFzc0xpc3QudG9nZ2xlKCdzZWxlY3RlZCcsIGMuZGF0YXNldC5pZCA9PT0gb3B0aW9uLmlkKTtcblx0XHRcdFx0XHRjLnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgYy5kYXRhc2V0LmlkID09PSBvcHRpb24uaWQgPyAndHJ1ZScgOiAnZmFsc2UnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9hcHBseUFpUHJlZmVyZW5jZShvcHRpb24uaWQpO1xuXHRcdFx0XHR0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmFsZXJ0KGxvY2FsaXplKCdvbmJvYXJkaW5nLmFpUHJlZi5zZWxlY3RlZC5hbGVydCcsIFwiezB9IHNlbGVjdGVkXCIsIG9wdGlvbi5sYWJlbCkpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRjb25zdCBzZWxlY3RlZEFpSW5kZXggPSBPTkJPQVJESU5HX0FJX1BSRUZFUkVOQ0VfT1BUSU9OUy5maW5kSW5kZXgobyA9PiBvLmlkID09PSB0aGlzLnNlbGVjdGVkQWlNb2RlKTtcblx0XHR0aGlzLl9zZXR1cFJhZGlvR3JvdXBOYXZpZ2F0aW9uKGFsbENhcmRzLCBNYXRoLm1heCgwLCBzZWxlY3RlZEFpSW5kZXgpKTtcblxuXHRcdGNvbnN0IGhpbnQgPSBhcHBlbmQod3JhcHBlciwgJCgnZGl2Lm9uYm9hcmRpbmctYS1haS1wcmVmLWhpbnQnKSk7XG5cdFx0aGludC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdvbmJvYXJkaW5nLmFpUHJlZi5oaW50JywgXCJZb3UgY2FuIGNoYW5nZSB0aGlzIGFueXRpbWUgaW4gU2V0dGluZ3MuXCIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlBaVByZWZlcmVuY2UobW9kZTogQWlDb2xsYWJvcmF0aW9uTW9kZSk6IHZvaWQge1xuXHRcdHN3aXRjaCAobW9kZSkge1xuXHRcdFx0Y2FzZSBBaUNvbGxhYm9yYXRpb25Nb2RlLkNvZGVGaXJzdDpcblx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgnY2hhdC5hZ2VudC5hdXRvRml4JywgZmFsc2UsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBaUNvbGxhYm9yYXRpb25Nb2RlLkJhbGFuY2VkOlxuXHRcdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCdjaGF0LmFnZW50LmF1dG9GaXgnLCB0cnVlLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQWlDb2xsYWJvcmF0aW9uTW9kZS5BZ2VudEZvcndhcmQ6XG5cdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ2NoYXQuYWdlbnQuYXV0b0ZpeCcsIHRydWUsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUtiZChsYWJlbDogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IGtiZCA9ICQoJ2tiZC5vbmJvYXJkaW5nLWEta2JkJyk7XG5cdFx0a2JkLnRleHRDb250ZW50ID0gbGFiZWw7XG5cdFx0cmV0dXJuIGtiZDtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUlubGluZUxpbmsocGFyZW50OiBIVE1MRWxlbWVudCwgbGFiZWw6IHN0cmluZywgaHJlZjogc3RyaW5nKTogSFRNTEFuY2hvckVsZW1lbnQge1xuXHRcdGNvbnN0IGxpbmsgPSB0aGlzLl9yZWdpc3RlclN0ZXBGb2N1c2FibGUoYXBwZW5kKHBhcmVudCwgJDxIVE1MQW5jaG9yRWxlbWVudD4oJ2Eub25ib2FyZGluZy1hLWlubGluZS1saW5rJykpKTtcblx0XHRsaW5rLnRleHRDb250ZW50ID0gbGFiZWw7XG5cdFx0bGluay5ocmVmID0gaHJlZjtcblx0XHRsaW5rLnRhcmdldCA9ICdfYmxhbmsnO1xuXHRcdGxpbmsucmVsID0gJ25vb3BlbmVyJztcblx0XHRyZXR1cm4gbGluaztcblx0fVxuXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvLyBSYWRpby1ncm91cCBrZXlib2FyZCBuYXZpZ2F0aW9uIChyb3ZpbmcgdGFiaW5kZXgpXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5cdC8qKlxuXHQgKiBTZXRzIHVwIFdBSS1BUklBIHJhZGlvLWdyb3VwIGtleWJvYXJkIG5hdmlnYXRpb24gb24gYSBzZXQgb2YgZWxlbWVudHM6XG5cdCAqIC0gQXJyb3cga2V5cyBtb3ZlIGZvY3VzIGJldHdlZW4gaXRlbXMgKHdpdGggd3JhcC1hcm91bmQpXG5cdCAqIC0gT25seSB0aGUgZm9jdXNlZCBpdGVtIGhhcyB0YWJpbmRleD0wOyB0aGUgcmVzdCBoYXZlIHRhYmluZGV4PS0xXG5cdCAqIC0gU3BhY2UvRW50ZXIgb24gYSBmb2N1c2VkIGl0ZW0gZmlyZXMgaXRzIGNsaWNrIGhhbmRsZXJcblx0ICovXG5cdHByaXZhdGUgX3NldHVwUmFkaW9Hcm91cE5hdmlnYXRpb24oaXRlbXM6IEhUTUxFbGVtZW50W10sIHNlbGVjdGVkSW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdC8vIEluaXRpYWxpc2Ugcm92aW5nIHRhYmluZGV4OiBvbmx5IHRoZSBzZWxlY3RlZCBpdGVtIGlzIHRhYi1yZWFjaGFibGVcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpdGVtc1tpXS5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgaSA9PT0gc2VsZWN0ZWRJbmRleCA/ICcwJyA6ICctMScpO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaXRlbXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaXRlbXNbaV0sIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0XHRsZXQgbmV3SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5SaWdodEFycm93IHx8IGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRG93bkFycm93KSB7XG5cdFx0XHRcdFx0bmV3SW5kZXggPSAoaSArIDEpICUgaXRlbXMubGVuZ3RoO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuTGVmdEFycm93IHx8IGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuVXBBcnJvdykge1xuXHRcdFx0XHRcdG5ld0luZGV4ID0gKGkgLSAxICsgaXRlbXMubGVuZ3RoKSAlIGl0ZW1zLmxlbmd0aDtcblx0XHRcdFx0fSBlbHNlIGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkhvbWUpIHtcblx0XHRcdFx0XHRuZXdJbmRleCA9IDA7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5FbmQpIHtcblx0XHRcdFx0XHRuZXdJbmRleCA9IGl0ZW1zLmxlbmd0aCAtIDE7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobmV3SW5kZXggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdGl0ZW1zW2ldLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnLTEnKTtcblx0XHRcdFx0XHRpdGVtc1tuZXdJbmRleF0uc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0XHRcdFx0aXRlbXNbbmV3SW5kZXhdLmZvY3VzKCk7XG5cdFx0XHRcdFx0aXRlbXNbbmV3SW5kZXhdLmNsaWNrKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblx0Ly8gRm9jdXMgdHJhcFxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuXHRwcml2YXRlIF90cmFwVGFiKGU6IEtleWJvYXJkRXZlbnQsIHNoaWZ0S2V5OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm92ZXJsYXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhbGxGb2N1c2FibGUgPSB0aGlzLl9nZXRGb2N1c2FibGVFbGVtZW50cygpO1xuXG5cdFx0aWYgKGFsbEZvY3VzYWJsZS5sZW5ndGggPT09IDApIHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmaXJzdCA9IGFsbEZvY3VzYWJsZVswXTtcblx0XHRjb25zdCBsYXN0ID0gYWxsRm9jdXNhYmxlW2FsbEZvY3VzYWJsZS5sZW5ndGggLSAxXTtcblxuXHRcdGlmIChzaGlmdEtleSAmJiBnZXRBY3RpdmVXaW5kb3coKS5kb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSBmaXJzdCkge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0bGFzdC5mb2N1cygpO1xuXHRcdH0gZWxzZSBpZiAoIXNoaWZ0S2V5ICYmIGdldEFjdGl2ZVdpbmRvdygpLmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IGxhc3QpIHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGZpcnN0LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Rm9jdXNhYmxlRWxlbWVudHMoKTogSFRNTEVsZW1lbnRbXSB7XG5cdFx0cmV0dXJuIFsuLi4odGhpcy5jbG9zZUJ1dHRvbiA/IFt0aGlzLmNsb3NlQnV0dG9uXSA6IFtdKSwgLi4udGhpcy5zdGVwRm9jdXNhYmxlRWxlbWVudHMsIC4uLnRoaXMuZm9vdGVyRm9jdXNhYmxlRWxlbWVudHNdLmZpbHRlcihlbGVtZW50ID0+IHRoaXMuX2lzVGFiYmFibGUoZWxlbWVudCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9jdXNDdXJyZW50U3RlcEVsZW1lbnQoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RlcEZvY3VzYWJsZSA9IHRoaXMuc3RlcEZvY3VzYWJsZUVsZW1lbnRzLmZpbmQoZWxlbWVudCA9PiB0aGlzLl9pc1RhYmJhYmxlKGVsZW1lbnQpKTtcblx0XHQoc3RlcEZvY3VzYWJsZSA/PyB0aGlzLm5leHRCdXR0b24gPz8gdGhpcy5jbG9zZUJ1dHRvbik/LmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlclN0ZXBGb2N1c2FibGU8VCBleHRlbmRzIEhUTUxFbGVtZW50PihlbGVtZW50OiBUKTogVCB7XG5cdFx0dGhpcy5zdGVwRm9jdXNhYmxlRWxlbWVudHMucHVzaChlbGVtZW50KTtcblx0XHRyZXR1cm4gZWxlbWVudDtcblx0fVxuXG5cdHByaXZhdGUgX2lzVGFiYmFibGUoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQgfHwgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJykgPT09ICd0cnVlJyB8fCBlbGVtZW50LnRhYkluZGV4ID09PSAtMSB8fCBlbGVtZW50Lmhhc0F0dHJpYnV0ZSgnZGlzYWJsZWQnKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbXB1dGVkU3R5bGUgPSBnZXRBY3RpdmVXaW5kb3coKS5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xuXHRcdHJldHVybiBjb21wdXRlZFN0eWxlLmRpc3BsYXkgIT09ICdub25lJyAmJiBjb21wdXRlZFN0eWxlLnZpc2liaWxpdHkgIT09ICdoaWRkZW4nO1xuXHR9XG5cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cdC8vIFRlbGVtZXRyeVxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuXHRwcml2YXRlIF9sb2dTdGVwVmlldygpOiB2b2lkIHtcblx0XHRjb25zdCBzdGVwSWQgPSB0aGlzLnN0ZXBzW3RoaXMuY3VycmVudFN0ZXBJbmRleF07XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8T25ib2FyZGluZ1N0ZXBWaWV3RXZlbnQsIE9uYm9hcmRpbmdTdGVwVmlld0NsYXNzaWZpY2F0aW9uPignd2VsY29tZU9uYm9hcmRpbmcuc3RlcFZpZXcnLCB7XG5cdFx0XHRzdGVwOiBzdGVwSWQsXG5cdFx0XHRzdGVwTnVtYmVyOiB0aGlzLmN1cnJlbnRTdGVwSW5kZXggKyAxLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfbG9nQWN0aW9uKGFjdGlvbjogc3RyaW5nLCBzdGVwT3ZlcnJpZGU/OiBPbmJvYXJkaW5nU3RlcElkLCBhcmd1bWVudD86IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPE9uYm9hcmRpbmdBY3Rpb25FdmVudCwgT25ib2FyZGluZ0FjdGlvbkNsYXNzaWZpY2F0aW9uPignd2VsY29tZU9uYm9hcmRpbmcuYWN0aW9uRXhlY3V0ZWQnLCB7XG5cdFx0XHRhY3Rpb24sXG5cdFx0XHRzdGVwOiBzdGVwT3ZlcnJpZGUgPz8gdGhpcy5zdGVwc1t0aGlzLmN1cnJlbnRTdGVwSW5kZXhdLFxuXHRcdFx0YXJndW1lbnQ6IGFyZ3VtZW50ID8/IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fVxuXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvLyBDbGVhbnVwXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5cdHByaXZhdGUgX3JlbW92ZUZyb21ET00oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMub3ZlcmxheSkge1xuXHRcdFx0dGhpcy5vdmVybGF5LnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5vdmVybGF5ID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuY2FyZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmJvZHlFbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnByb2dyZXNzQ29udGFpbmVyID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuc3RlcExhYmVsRWwgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy50aXRsZUVsID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuc3VidGl0bGVFbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmNvbnRlbnRFbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmJhY2tCdXR0b24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5uZXh0QnV0dG9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuY2xvc2VCdXR0b24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5mb290ZXJMZWZ0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2Zvb3RlclNpZ25JbkJ0biA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmZvb3RlckZvY3VzYWJsZUVsZW1lbnRzLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5zdGVwRm9jdXNhYmxlRWxlbWVudHMubGVuZ3RoID0gMDtcblx0XHR0aGlzLmVudGVycHJpc2VTaWduSW5VaVN0YXRlID0gJ29wdGlvbnMnO1xuXHRcdHRoaXMuZW50ZXJwcmlzZUluc3RhbmNlVmFsdWUgPSAnJztcblx0XHR0aGlzLmVudGVycHJpc2VTaWduSW5XYXRjaCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9pc1Nob3dpbmcgPSBmYWxzZTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGlmICh0aGlzLnByZXZpb3VzbHlGb2N1c2VkRWxlbWVudCkge1xuXHRcdFx0dGhpcy5wcmV2aW91c2x5Rm9jdXNlZEVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdHRoaXMucHJldmlvdXNseUZvY3VzZWRFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuY3VycmVudFN0ZXBJbmRleCA9IDA7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbW92ZUZyb21ET00oKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsR0FBRyxRQUFRLHVCQUF1QixXQUFXLFdBQVcsdUJBQXVCO0FBQ3hGLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLFdBQVcsYUFBYSxlQUFlO0FBQ2hELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNENBQTRDLDBCQUEwQixtQ0FBbUM7QUFDbEgsU0FBUyxhQUFhLDhCQUE4QjtBQUNwRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQixnQkFBZ0I7QUFDL0MsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQVMsNkJBQTZCO0FBQ3RDLE9BQU8sYUFBYTtBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFzRCx5QkFBeUI7QUFDL0UsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEM7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFFQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUNNO0FBK0JQLE1BQU0sY0FBYyxRQUFR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
