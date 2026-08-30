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
import * as dom from "../../../../../base/browser/dom.js";
import { BaseActionViewItem } from "../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Event } from "../../../../../base/common/event.js";
import { Lazy } from "../../../../../base/common/lazy.js";
import { Disposable, DisposableStore, markAsSingleton, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import Severity from "../../../../../base/common/severity.js";
import { equalsIgnoreCase } from "../../../../../base/common/strings.js";
import { URI } from "../../../../../base/common/uri.js";
import { ICodeEditorService } from "../../../../../editor/browser/services/codeEditorService.js";
import { EditorContextKeys } from "../../../../../editor/common/editorContextKeys.js";
import { localize, localize2 } from "../../../../../nls.js";
import { IActionViewItemService } from "../../../../../platform/actions/browser/actionViewItemService.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IsWebContext } from "../../../../../platform/contextkey/common/contextkeys.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IMarkerService } from "../../../../../platform/markers/common/markers.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import product from "../../../../../platform/product/common/product.js";
import { GitHubPaths, IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { ToggleTitleBarConfigAction } from "../../../../browser/parts/titlebar/titlebarActions.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../../common/views.js";
import { ChatEntitlement, ChatEntitlementContextKeys, IChatEntitlementService, isProUser } from "../../../../services/chat/common/chatEntitlementService.js";
import { EnablementState, IWorkbenchExtensionEnablementService } from "../../../../services/extensionManagement/common/extensionManagement.js";
import { ExtensionUrlHandlerOverrideRegistry } from "../../../../services/extensions/browser/extensionUrlHandler.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { CONTEXT_DEFAULT_ACCOUNT_STATE, DefaultAccountStatus } from "../../../../services/accounts/browser/defaultAccount.js";
import { IHostService } from "../../../../services/host/browser/host.js";
import { IWorkbenchLayoutService, Parts } from "../../../../services/layout/browser/layoutService.js";
import { InEditorZenModeContext } from "../../../../common/contextkeys.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { IPreferencesService } from "../../../../services/preferences/common/preferences.js";
import { IExtensionsWorkbenchService } from "../../../extensions/common/extensions.js";
import { UpdateTitleBarEditorVisibleContext } from "../../../update/common/update.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { IChatSessionsService } from "../../common/chatSessionsService.js";
import { ChatAIDisabledSettingId, ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../../common/constants.js";
import { CHAT_CATEGORY, CHAT_SETUP_ACTION_ID, CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from "../actions/chatActions.js";
import { ChatViewContainerId, IChatWidgetService } from "../chat.js";
import { ChatInputNotificationSeverity, IChatInputNotificationService } from "../widget/input/chatInputNotificationService.js";
import { chatViewsWelcomeRegistry } from "../viewsWelcome/chatViewsWelcome.js";
import { buildUpgradeUrlWithRedirect, ChatSetupAnonymous, refreshTokens } from "./chatSetup.js";
import { ChatSetupController } from "./chatSetupController.js";
import { GrowthSessionController, registerGrowthSession } from "./chatSetupGrowthSession.js";
import { AICodeActionsHelper, AINewSymbolNamesProvider, ChatCodeActionsProvider, SetupAgent } from "./chatSetupProviders.js";
import { ChatSetup } from "./chatSetupRunner.js";
const defaultChat = {
  chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? ""
};
const SIGN_IN_TITLE_BAR_ACTION_ID = "workbench.action.chat.signInIndicator";
let ChatSetupContribution = class extends Disposable {
  constructor(actionViewItemService, instantiationService, chatEntitlementService, logService, contextKeyService, extensionEnablementService, extensionsWorkbenchService, extensionService, environmentService, chatSessionsService, configurationService) {
    super();
    this.instantiationService = instantiationService;
    this.logService = logService;
    this.contextKeyService = contextKeyService;
    this.extensionEnablementService = extensionEnablementService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionService = extensionService;
    this.environmentService = environmentService;
    this.chatSessionsService = chatSessionsService;
    this.configurationService = configurationService;
    const context = chatEntitlementService.context?.value;
    const requests = chatEntitlementService.requests?.value;
    if (!context || !requests) {
      return;
    }
    const controller = new Lazy(() => this._register(this.instantiationService.createInstance(ChatSetupController, context, requests)));
    this.registerSetupAgents(context, controller);
    this.registerGrowthSession(chatEntitlementService);
    this.registerActions(context, requests, controller);
    this.registerSignInTitleBarEntry(actionViewItemService);
    this.registerUrlLinkHandler();
    this.checkExtensionInstallation(context);
  }
  registerSetupAgents(context, controller) {
    const defaultAgentDisposables = markAsSingleton(new MutableDisposable());
    const vscodeAgentDisposables = markAsSingleton(new MutableDisposable());
    const renameProviderDisposables = markAsSingleton(new MutableDisposable());
    const codeActionsProviderDisposables = markAsSingleton(new MutableDisposable());
    const updateRegistration = () => {
      {
        if (!context.state.hidden && !context.state.disabledInWorkspace) {
          if (!defaultAgentDisposables.value) {
            const disposables = defaultAgentDisposables.value = new DisposableStore();
            const panelAgentDisposables = disposables.add(new DisposableStore());
            for (const mode of [ChatModeKind.Ask, ChatModeKind.Edit, ChatModeKind.Agent]) {
              const { agent, disposable } = SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Chat, mode, context, controller);
              panelAgentDisposables.add(disposable);
              panelAgentDisposables.add(agent.onUnresolvableError(() => {
                const panelAgentHasGuidance = chatViewsWelcomeRegistry.get().some((descriptor) => this.contextKeyService.contextMatchesRules(descriptor.when));
                if (panelAgentHasGuidance) {
                  this.logService.error("[chat setup] Unresolvable error from Chat agent registration, clearing registration.");
                  panelAgentDisposables.dispose();
                }
              }));
            }
            disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Terminal, ChatModeKind.Ask, context, controller).disposable);
            disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Notebook, ChatModeKind.Ask, context, controller).disposable);
            disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.EditorInline, ChatModeKind.Ask, context, controller).disposable);
          }
          if ((!context.state.completed || context.state.entitlement === ChatEntitlement.Unknown || context.state.entitlement === ChatEntitlement.Unresolved) && !vscodeAgentDisposables.value) {
            const disposables = vscodeAgentDisposables.value = new DisposableStore();
            disposables.add(SetupAgent.registerBuiltInAgents(this.instantiationService, context, controller));
          }
        } else {
          defaultAgentDisposables.clear();
          vscodeAgentDisposables.clear();
        }
        if (context.state.completed) {
          vscodeAgentDisposables.clear();
        }
      }
      {
        if (!context.state.completed && !context.state.hidden && !context.state.disabledInWorkspace) {
          if (!renameProviderDisposables.value) {
            renameProviderDisposables.value = AINewSymbolNamesProvider.registerProvider(this.instantiationService, context, controller);
          }
        } else {
          renameProviderDisposables.clear();
        }
      }
      {
        if (!context.state.completed && !context.state.hidden && !context.state.disabledInWorkspace) {
          if (!codeActionsProviderDisposables.value) {
            codeActionsProviderDisposables.value = ChatCodeActionsProvider.registerProvider(this.instantiationService);
          }
        } else {
          codeActionsProviderDisposables.clear();
        }
      }
    };
    this._register(Event.runAndSubscribe(context.onDidChange, () => updateRegistration()));
  }
  registerGrowthSession(chatEntitlementService) {
    const growthSessionDisposables = markAsSingleton(new MutableDisposable());
    const updateGrowthSession = () => {
      const experimentEnabled = this.configurationService.getValue(ChatConfiguration.GrowthNotificationEnabled) === true;
      const shouldShow = experimentEnabled && !chatEntitlementService.sentiment.completed;
      if (shouldShow && !growthSessionDisposables.value) {
        const disposables = new DisposableStore();
        const controller = disposables.add(this.instantiationService.createInstance(GrowthSessionController));
        if (!controller.isDismissed) {
          disposables.add(registerGrowthSession(this.chatSessionsService, controller));
          disposables.add(controller.onDidDismiss(() => {
            growthSessionDisposables.clear();
          }));
          growthSessionDisposables.value = disposables;
        } else {
          disposables.dispose();
        }
      } else if (!shouldShow) {
        growthSessionDisposables.clear();
      }
    };
    this._register(chatEntitlementService.onDidChangeSentiment(() => updateGrowthSession()));
    updateGrowthSession();
  }
  registerActions(context, requests, controller) {
    const _ChatSetupTriggerAction = class _ChatSetupTriggerAction extends Action2 {
      constructor() {
        super({
          id: CHAT_SETUP_ACTION_ID,
          title: _ChatSetupTriggerAction.CHAT_SETUP_ACTION_LABEL,
          category: CHAT_CATEGORY,
          f1: true,
          precondition: ContextKeyExpr.or(
            ChatContextKeys.Setup.hidden,
            ChatContextKeys.Setup.disabledInWorkspace,
            ChatContextKeys.Setup.untrusted,
            ChatContextKeys.Setup.completed.negate(),
            ChatContextKeys.Entitlement.canSignUp
          )
        });
      }
      async run(accessor, mode, options) {
        const widgetService = accessor.get(IChatWidgetService);
        const instantiationService = accessor.get(IInstantiationService);
        const dialogService = accessor.get(IDialogService);
        const commandService = accessor.get(ICommandService);
        const lifecycleService = accessor.get(ILifecycleService);
        const configurationService = accessor.get(IConfigurationService);
        await context.update({ hidden: false });
        configurationService.updateValue(ChatAIDisabledSettingId, false);
        if (mode) {
          const chatWidget = await widgetService.revealWidget();
          if (chatWidget) {
            const resolvedMode = this.resolveAgentId(mode, chatWidget);
            if (resolvedMode) {
              chatWidget.input.setChatMode(resolvedMode);
            }
          }
        }
        if (options?.inputValue) {
          const chatWidget = await widgetService.revealWidget();
          chatWidget?.input.showScrollbarUntilAccept();
          chatWidget?.setInput(options.inputValue);
        }
        const setup = ChatSetup.getInstance(instantiationService, context, controller);
        const result = await setup.run(options);
        if (options?.returnResult) {
          return result;
        }
        const { success } = result;
        if (success === false && !result.errorAlreadyHandled && !lifecycleService.willShutdown) {
          const { confirmed } = await dialogService.confirm({
            type: Severity.Error,
            message: localize("setupErrorDialog", "Chat setup failed. Would you like to try again?"),
            primaryButton: localize("retry", "Retry")
          });
          if (confirmed) {
            return Boolean(await commandService.executeCommand(CHAT_SETUP_ACTION_ID, mode, options));
          }
        }
        return Boolean(success);
      }
      resolveAgentId(agentParam, chatWidget) {
        const modes = chatWidget.input.currentChatModesObs.get();
        const foundAgent = modes.findModeById(agentParam);
        if (foundAgent) {
          return foundAgent.id;
        }
        const allAgents = [...modes.builtin, ...modes.custom];
        const nameLower = agentParam.toLowerCase();
        const agentByName = allAgents.find((agent) => agent.name.get().toLowerCase() === nameLower);
        return agentByName?.id;
      }
    };
    _ChatSetupTriggerAction.CHAT_SETUP_ACTION_LABEL = localize2("triggerChatSetup", "Use AI Features with Copilot for free...");
    let ChatSetupTriggerAction = _ChatSetupTriggerAction;
    class ChatSetupTriggerSupportAnonymousAction extends Action2 {
      constructor() {
        super({
          id: CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID,
          title: ChatSetupTriggerAction.CHAT_SETUP_ACTION_LABEL
        });
      }
      async run(accessor, options) {
        const commandService = accessor.get(ICommandService);
        const telemetryService = accessor.get(ITelemetryService);
        const chatEntitlementService = accessor.get(IChatEntitlementService);
        telemetryService.publicLog2("workbenchActionExecuted", { id: CHAT_SETUP_ACTION_ID, from: "api" });
        return commandService.executeCommand(CHAT_SETUP_ACTION_ID, void 0, {
          forceAnonymous: chatEntitlementService.anonymous ? ChatSetupAnonymous.EnabledWithDialog : void 0,
          ...options
        });
      }
    }
    class ChatSetupTriggerForceSignInDialogAction extends Action2 {
      constructor() {
        super({
          id: "workbench.action.chat.triggerSetupForceSignIn",
          title: localize2("forceSignIn", "Sign in to use GitHub Copilot")
        });
      }
      async run(accessor) {
        const commandService = accessor.get(ICommandService);
        const telemetryService = accessor.get(ITelemetryService);
        telemetryService.publicLog2("workbenchActionExecuted", { id: CHAT_SETUP_ACTION_ID, from: "api" });
        return commandService.executeCommand(CHAT_SETUP_ACTION_ID, void 0, { forceSignInDialog: true });
      }
    }
    class ChatSetupTriggerAnonymousWithoutDialogAction extends Action2 {
      constructor() {
        super({
          id: "workbench.action.chat.triggerSetupAnonymousWithoutDialog",
          title: ChatSetupTriggerAction.CHAT_SETUP_ACTION_LABEL
        });
      }
      async run(accessor) {
        const commandService = accessor.get(ICommandService);
        const telemetryService = accessor.get(ITelemetryService);
        telemetryService.publicLog2("workbenchActionExecuted", { id: CHAT_SETUP_ACTION_ID, from: "api" });
        return commandService.executeCommand(CHAT_SETUP_ACTION_ID, void 0, { forceAnonymous: ChatSetupAnonymous.EnabledWithoutDialog });
      }
    }
    class ChatSetupFromAccountsAction extends Action2 {
      constructor() {
        super({
          id: "workbench.action.chat.triggerSetupFromAccounts",
          title: localize2("triggerChatSetupFromAccounts", "Sign in to use GitHub Copilot..."),
          menu: {
            id: MenuId.AccountsContext,
            group: "2_copilot",
            when: ContextKeyExpr.and(
              ChatContextKeys.Setup.hidden.negate(),
              ChatContextKeys.Setup.disabledInWorkspace.negate(),
              CONTEXT_DEFAULT_ACCOUNT_STATE.notEqualsTo(DefaultAccountStatus.Available),
              // hide only when signed in (a default GitHub account is present); still shown while signed out or before the account state resolves, incl. untrusted workspaces — no auth prompt
              ChatContextKeys.Setup.completed.negate(),
              ChatContextKeys.Entitlement.signedOut
            )
          }
        });
      }
      async run(accessor) {
        const commandService = accessor.get(ICommandService);
        const telemetryService = accessor.get(ITelemetryService);
        telemetryService.publicLog2("workbenchActionExecuted", { id: CHAT_SETUP_ACTION_ID, from: "accounts" });
        return commandService.executeCommand(CHAT_SETUP_ACTION_ID);
      }
    }
    const _ChatSetupSignInTitleBarAction = class _ChatSetupSignInTitleBarAction extends Action2 {
      constructor() {
        super({
          id: _ChatSetupSignInTitleBarAction.ID,
          title: localize("signInIndicatorTitleBarAction", "Sign In"),
          f1: false,
          menu: [{
            id: MenuId.TitleBarAdjacentCenter,
            order: 0,
            when: ContextKeyExpr.and(
              IsWebContext.negate(),
              ChatContextKeys.Entitlement.signedOut,
              CONTEXT_DEFAULT_ACCOUNT_STATE.notEqualsTo(DefaultAccountStatus.Available),
              // hide only when signed in (a default GitHub account is present); still shown while signed out or before the account state resolves, incl. untrusted workspaces — no auth prompt
              ChatEntitlementContextKeys.hasByokModels.negate(),
              ChatContextKeys.Setup.hidden.negate(),
              ChatContextKeys.Setup.disabledInWorkspace.negate(),
              ContextKeyExpr.equals(`config.${ChatConfiguration.TitleBarSignInEnabled}`, true),
              UpdateTitleBarEditorVisibleContext.negate(),
              InEditorZenModeContext.negate()
            )
          }]
        });
      }
      async run(accessor) {
        const commandService = accessor.get(ICommandService);
        const telemetryService = accessor.get(ITelemetryService);
        telemetryService.publicLog2("workbenchActionExecuted", { id: CHAT_SETUP_ACTION_ID, from: "titlebar" });
        return commandService.executeCommand(CHAT_SETUP_ACTION_ID);
      }
    };
    _ChatSetupSignInTitleBarAction.ID = SIGN_IN_TITLE_BAR_ACTION_ID;
    let ChatSetupSignInTitleBarAction = _ChatSetupSignInTitleBarAction;
    class ToggleSignInTitleBarAction extends ToggleTitleBarConfigAction {
      constructor() {
        super(
          ChatConfiguration.TitleBarSignInEnabled,
          localize("toggle.chatSignIn", "Copilot Sign In"),
          localize("toggle.chatSignInDescription", "Toggle visibility of the Copilot Sign In button in title bar"),
          3,
          ContextKeyExpr.and(
            IsWebContext.negate(),
            ChatContextKeys.Entitlement.signedOut,
            ChatContextKeys.Setup.hidden.negate(),
            ChatContextKeys.Setup.disabledInWorkspace.negate()
          )
        );
      }
    }
    const windowFocusListener = this._register(new MutableDisposable());
    class UpgradePlanAction extends Action2 {
      constructor() {
        super({
          id: "workbench.action.chat.upgradePlan",
          title: localize2("managePlan", "Upgrade to GitHub Copilot Pro"),
          category: localize2("chat.category", "Chat"),
          f1: true,
          precondition: ContextKeyExpr.and(
            ChatContextKeys.Setup.hidden.negate(),
            ChatContextKeys.Setup.disabledInWorkspace.negate(),
            ContextKeyExpr.or(
              ChatContextKeys.Entitlement.canSignUp,
              ChatContextKeys.Entitlement.planFree
            )
          ),
          menu: {
            id: MenuId.ChatTitleBarMenu,
            group: "a_first",
            order: 1,
            when: ContextKeyExpr.and(
              ChatContextKeys.Entitlement.planFree,
              ContextKeyExpr.or(
                ChatContextKeys.chatQuotaExceeded,
                ChatContextKeys.completionsQuotaExceeded
              )
            )
          }
        });
      }
      async run(accessor) {
        const openerService = accessor.get(IOpenerService);
        const hostService = accessor.get(IHostService);
        const commandService = accessor.get(ICommandService);
        const telemetryService = accessor.get(ITelemetryService);
        const defaultAccountService = accessor.get(IDefaultAccountService);
        const productService = accessor.get(IProductService);
        telemetryService.publicLog2("workbenchActionExecuted", { id: "workbench.action.chat.upgradePlan", from: "command" });
        const baseUrl = defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotUpgrade);
        const upgradeUrl = buildUpgradeUrlWithRedirect(baseUrl, productService.urlProtocol, productService.quality);
        openerService.open(upgradeUrl);
        const entitlement = context.state.entitlement;
        if (!isProUser(entitlement)) {
          windowFocusListener.value = hostService.onDidChangeFocus((focus) => this.onWindowFocus(focus, commandService));
        }
      }
      async onWindowFocus(focus, commandService) {
        if (focus) {
          windowFocusListener.clear();
          const entitlements = await requests.forceResolveEntitlement();
          if (entitlements?.entitlement && isProUser(entitlements?.entitlement)) {
            refreshTokens(commandService);
          }
        }
      }
    }
    class ManageAdditionalSpendAction extends Action2 {
      constructor() {
        super({
          id: "workbench.action.chat.manageAdditionalSpend",
          title: localize2("manageAdditionalSpend", "Manage GitHub Copilot Budget"),
          category: localize2("chat.category", "Chat"),
          f1: true,
          precondition: ContextKeyExpr.and(
            ChatContextKeys.Setup.hidden.negate(),
            ChatContextKeys.Setup.disabledInWorkspace.negate(),
            ContextKeyExpr.or(
              ChatContextKeys.Entitlement.planPro,
              ChatContextKeys.Entitlement.planProPlus,
              ChatContextKeys.Entitlement.planMax,
              ChatContextKeys.Entitlement.planEdu
            )
          ),
          menu: {
            id: MenuId.ChatTitleBarMenu,
            group: "a_first",
            order: 1,
            when: ContextKeyExpr.and(
              ContextKeyExpr.or(
                ChatContextKeys.Entitlement.planPro,
                ChatContextKeys.Entitlement.planProPlus,
                ChatContextKeys.Entitlement.planMax,
                ChatContextKeys.Entitlement.planEdu
              ),
              ContextKeyExpr.or(
                ChatContextKeys.chatQuotaExceeded,
                ChatContextKeys.completionsQuotaExceeded
              )
            )
          }
        });
      }
      async run(accessor) {
        const openerService = accessor.get(IOpenerService);
        const telemetryService = accessor.get(ITelemetryService);
        const defaultAccountService = accessor.get(IDefaultAccountService);
        telemetryService.publicLog2("workbenchActionExecuted", { id: "workbench.action.chat.manageAdditionalSpend", from: "command" });
        openerService.open(URI.parse(defaultAccountService.resolveGitHubUrl(GitHubPaths.billingBudgets)));
      }
    }
    registerAction2(ChatSetupTriggerAction);
    registerAction2(ChatSetupTriggerForceSignInDialogAction);
    registerAction2(ChatSetupFromAccountsAction);
    registerAction2(ChatSetupSignInTitleBarAction);
    registerAction2(ToggleSignInTitleBarAction);
    registerAction2(ChatSetupTriggerAnonymousWithoutDialogAction);
    registerAction2(ChatSetupTriggerSupportAnonymousAction);
    registerAction2(UpgradePlanAction);
    registerAction2(ManageAdditionalSpendAction);
    function registerGenerateCodeCommand(coreCommand, actualCommand) {
      CommandsRegistry.registerCommand(coreCommand, async (accessor, ...args) => {
        const commandService = accessor.get(ICommandService);
        const codeEditorService = accessor.get(ICodeEditorService);
        const markerService = accessor.get(IMarkerService);
        switch (coreCommand) {
          case "chat.internal.explain":
          case "chat.internal.fix": {
            const textEditor = codeEditorService.getActiveCodeEditor();
            const uri = textEditor?.getModel()?.uri;
            const range = textEditor?.getSelection();
            if (!uri || !range) {
              return;
            }
            const markers = AICodeActionsHelper.warningOrErrorMarkersAtRange(markerService, uri, range);
            const actualCommand2 = coreCommand === "chat.internal.explain" ? AICodeActionsHelper.explainMarkers(markers) : AICodeActionsHelper.fixMarkers(markers, range);
            await commandService.executeCommand(actualCommand2.id, ...actualCommand2.arguments ?? []);
            break;
          }
          case "chat.internal.review": {
            const result = await commandService.executeCommand(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID);
            if (result) {
              await commandService.executeCommand(actualCommand);
            }
            break;
          }
        }
      });
    }
    registerGenerateCodeCommand("chat.internal.explain", "github.copilot.chat.explain");
    registerGenerateCodeCommand("chat.internal.fix", "github.copilot.chat.fix");
    registerGenerateCodeCommand("chat.internal.review", "github.copilot.chat.review");
    const internalGenerateCodeContext = ContextKeyExpr.and(
      ChatContextKeys.Setup.hidden.negate(),
      ChatContextKeys.Setup.disabledInWorkspace.negate(),
      ChatContextKeys.Setup.completed.negate()
    );
    MenuRegistry.appendMenuItem(MenuId.EditorContext, {
      command: {
        id: "chat.internal.explain",
        title: localize("explain", "Explain")
      },
      group: "1_chat",
      order: 4,
      when: internalGenerateCodeContext
    });
    MenuRegistry.appendMenuItem(MenuId.EditorContext, {
      command: {
        id: "chat.internal.fix",
        title: localize("fix", "Fix")
      },
      group: "1_chat",
      order: 5,
      when: ContextKeyExpr.and(
        internalGenerateCodeContext,
        EditorContextKeys.readOnly.negate()
      )
    });
    MenuRegistry.appendMenuItem(MenuId.EditorContext, {
      command: {
        id: "chat.internal.review",
        title: localize("review", "Code Review")
      },
      group: "1_chat",
      order: 6,
      when: internalGenerateCodeContext
    });
  }
  registerSignInTitleBarEntry(actionViewItemService) {
    this._register(actionViewItemService.register(
      MenuId.TitleBarAdjacentCenter,
      SIGN_IN_TITLE_BAR_ACTION_ID,
      (action, options) => new SignInTitleBarEntry(action, options)
    ));
  }
  registerUrlLinkHandler() {
    this._register(ExtensionUrlHandlerOverrideRegistry.registerHandler(this.instantiationService.createInstance(ChatSetupExtensionUrlHandler)));
  }
  async checkExtensionInstallation(context) {
    if (this.environmentService.isExtensionDevelopment) {
      await this.extensionService.whenInstalledExtensionsRegistered();
      if (this.extensionService.extensions.find((ext) => ExtensionIdentifier.equals(ext.identifier, defaultChat.chatExtensionId))) {
        context.update({ installed: true, disabled: false, untrusted: false, disabledInWorkspace: false });
        return;
      }
    }
    await this.extensionsWorkbenchService.queryLocal();
    this._register(Event.runAndSubscribe(this.extensionsWorkbenchService.onChange, (e) => {
      if (e && !ExtensionIdentifier.equals(e.identifier.id, defaultChat.chatExtensionId)) {
        return;
      }
      const defaultChatExtension = this.extensionsWorkbenchService.local.find((value) => ExtensionIdentifier.equals(value.identifier.id, defaultChat.chatExtensionId));
      const installed = !!defaultChatExtension?.local;
      let disabled;
      let untrusted = false;
      let disabledInWorkspace = false;
      if (installed) {
        disabled = !this.extensionEnablementService.isEnabled(defaultChatExtension.local);
        if (disabled) {
          const state = this.extensionEnablementService.getEnablementState(defaultChatExtension.local);
          if (state === EnablementState.DisabledByTrustRequirement) {
            disabled = false;
            untrusted = true;
          } else if (state === EnablementState.DisabledWorkspace) {
            disabledInWorkspace = true;
          }
        }
      } else {
        disabled = false;
      }
      context.update({ installed, disabled, untrusted, disabledInWorkspace });
    }));
  }
};
ChatSetupContribution.ID = "workbench.contrib.chatSetup";
ChatSetupContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IChatEntitlementService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IWorkbenchExtensionEnablementService),
  __decorateParam(6, IExtensionsWorkbenchService),
  __decorateParam(7, IExtensionService),
  __decorateParam(8, IEnvironmentService),
  __decorateParam(9, IChatSessionsService),
  __decorateParam(10, IConfigurationService)
], ChatSetupContribution);
let ChatSetupExtensionUrlHandler = class {
  constructor(productService, commandService, telemetryService, chatEntitlementService, chatInputNotificationService) {
    this.productService = productService;
    this.commandService = commandService;
    this.telemetryService = telemetryService;
    this.chatEntitlementService = chatEntitlementService;
    this.chatInputNotificationService = chatInputNotificationService;
  }
  canHandleURL(url) {
    return url.scheme === this.productService.urlProtocol && equalsIgnoreCase(url.authority, defaultChat.chatExtensionId);
  }
  async handleURL(url) {
    if (url.path === "/upgrade-success") {
      return this._handleUpgradeSuccess();
    }
    const params = new URLSearchParams(url.query);
    this.telemetryService.publicLog2("workbenchActionExecuted", { id: CHAT_SETUP_ACTION_ID, from: "url", detail: params.get("referrer") ?? void 0 });
    const agentParam = params.get("agent") ?? params.get("mode");
    const inputParam = params.get("prompt");
    if (!agentParam && !inputParam) {
      return false;
    }
    await this.commandService.executeCommand(CHAT_SETUP_ACTION_ID, agentParam, inputParam ? { inputValue: inputParam } : void 0);
    return true;
  }
  async _handleUpgradeSuccess() {
    this.telemetryService.publicLog2("workbenchActionExecuted", { id: "workbench.action.chat.upgradePlan", from: "redirect" });
    await this.chatEntitlementService.update(CancellationToken.None);
    refreshTokens(this.commandService);
    this.chatInputNotificationService.setNotification({
      id: ChatSetupExtensionUrlHandler.UPGRADE_SUCCESS_NOTIFICATION_ID,
      severity: ChatInputNotificationSeverity.Info,
      message: localize("upgradeSuccess", "Upgrade Successful"),
      description: localize("upgradeSuccessDescription", "Please wait up to 10 minutes for your new plan to apply."),
      actions: [],
      dismissible: true,
      autoDismissOnMessage: true
    });
    return true;
  }
};
ChatSetupExtensionUrlHandler.UPGRADE_SUCCESS_NOTIFICATION_ID = "copilot.upgradeSuccess";
ChatSetupExtensionUrlHandler = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, IChatEntitlementService),
  __decorateParam(4, IChatInputNotificationService)
], ChatSetupExtensionUrlHandler);
let ChatTeardownContribution = class extends Disposable {
  constructor(chatEntitlementService, configurationService, extensionsWorkbenchService, extensionEnablementService, viewDescriptorService, layoutService) {
    super();
    this.configurationService = configurationService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionEnablementService = extensionEnablementService;
    this.viewDescriptorService = viewDescriptorService;
    this.layoutService = layoutService;
    const context = chatEntitlementService.context?.value;
    if (!context) {
      return;
    }
    this.registerListeners();
    this.registerActions();
    this.handleChatDisabled(false);
  }
  handleChatDisabled(fromEvent) {
    const chatDisabled = this.configurationService.inspect(ChatAIDisabledSettingId);
    if (chatDisabled.value === true) {
      this.maybeEnableOrDisableExtension(typeof chatDisabled.workspaceValue === "boolean" ? EnablementState.DisabledWorkspace : EnablementState.DisabledGlobally);
      if (fromEvent) {
        this.maybeHideAuxiliaryBar();
      }
    } else if (chatDisabled.value === false && fromEvent) {
      this.maybeEnableOrDisableExtension(typeof chatDisabled.workspaceValue === "boolean" ? EnablementState.EnabledWorkspace : EnablementState.EnabledGlobally);
    }
  }
  async registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(ChatAIDisabledSettingId)) {
        return;
      }
      this.handleChatDisabled(true);
    }));
    await this.extensionsWorkbenchService.queryLocal();
    this._register(this.extensionsWorkbenchService.onChange((e) => {
      if (e && !ExtensionIdentifier.equals(e.identifier.id, defaultChat.chatExtensionId)) {
        return;
      }
      const defaultChatExtension = this.extensionsWorkbenchService.local.find((value) => ExtensionIdentifier.equals(value.identifier.id, defaultChat.chatExtensionId));
      if (defaultChatExtension?.local && this.extensionEnablementService.isEnabled(defaultChatExtension.local)) {
        if (defaultChatExtension.enablementState === EnablementState.EnabledWorkspace) {
          if (this.configurationService.inspect(ChatAIDisabledSettingId).workspaceValue === true) {
            this.configurationService.updateValue(ChatAIDisabledSettingId, false, ConfigurationTarget.WORKSPACE);
          }
        } else {
          this.configurationService.updateValue(ChatAIDisabledSettingId, false);
        }
      }
    }));
  }
  async maybeEnableOrDisableExtension(state) {
    const defaultChatExtension = this.extensionsWorkbenchService.local.find((value) => ExtensionIdentifier.equals(value.identifier.id, defaultChat.chatExtensionId));
    if (!defaultChatExtension?.local) {
      return;
    }
    const workspace = state === EnablementState.EnabledWorkspace || state === EnablementState.DisabledWorkspace;
    const canChange = workspace ? this.extensionEnablementService.canChangeWorkspaceEnablement(defaultChatExtension.local) : this.extensionEnablementService.canChangeEnablement(defaultChatExtension.local);
    if (!canChange) {
      return;
    }
    await this.extensionsWorkbenchService.setEnablement([defaultChatExtension], state);
    await this.extensionsWorkbenchService.updateRunningExtensions(state === EnablementState.EnabledGlobally || state === EnablementState.EnabledWorkspace ? localize("restartExtensionHost.reason.enable", "Enabling AI features") : localize("restartExtensionHost.reason.disable", "Disabling AI features"));
  }
  maybeHideAuxiliaryBar() {
    const activeContainers = this.viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.AuxiliaryBar).filter(
      (container) => this.viewDescriptorService.getViewContainerModel(container).activeViewDescriptors.length > 0
    );
    if (activeContainers.length === 0 || // chat view is already gone but we know it was there before
    activeContainers.length === 1 && activeContainers.at(0)?.id === ChatViewContainerId) {
      this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
    }
  }
  registerActions() {
    const _ChatSetupHideAction = class _ChatSetupHideAction extends Action2 {
      constructor() {
        super({
          id: _ChatSetupHideAction.ID,
          title: _ChatSetupHideAction.TITLE,
          f1: true,
          category: CHAT_CATEGORY,
          precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
          menu: {
            id: MenuId.ChatTitleBarMenu,
            group: "z_hide",
            order: 1,
            when: ChatContextKeys.Setup.completed.negate()
          }
        });
      }
      async run(accessor) {
        const preferencesService = accessor.get(IPreferencesService);
        preferencesService.openSettings({ jsonEditor: false, query: `@id:${ChatAIDisabledSettingId}` });
      }
    };
    _ChatSetupHideAction.ID = "workbench.action.chat.hideSetup";
    _ChatSetupHideAction.TITLE = localize2("hideChatSetup", "Learn How to Hide AI Features");
    let ChatSetupHideAction = _ChatSetupHideAction;
    registerAction2(ChatSetupHideAction);
  }
};
ChatTeardownContribution.ID = "workbench.contrib.chatTeardown";
ChatTeardownContribution = __decorateClass([
  __decorateParam(0, IChatEntitlementService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IExtensionsWorkbenchService),
  __decorateParam(3, IWorkbenchExtensionEnablementService),
  __decorateParam(4, IViewDescriptorService),
  __decorateParam(5, IWorkbenchLayoutService)
], ChatTeardownContribution);
class SignInTitleBarEntry extends BaseActionViewItem {
  constructor(action, options) {
    super(void 0, action, options);
  }
  render(container) {
    super.render(container);
    container.setAttribute("role", "button");
    container.setAttribute("aria-label", this.action.label);
    const content = dom.append(container, dom.$(".update-indicator.prominent"));
    this.label = dom.append(content, dom.$(".indicator-label"));
    this.label.textContent = this.action.label;
  }
  updateLabel() {
    if (this.label) {
      this.label.textContent = this.action.label;
    }
    if (this.element) {
      this.element.setAttribute("aria-label", this.action.label);
    }
  }
  updateEnabled() {
    if (this.element) {
      this.element.classList.toggle("disabled", !this.action.enabled);
    }
  }
}
export {
  ChatSetupContribution,
  ChatTeardownContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRTZXR1cFxcY2hhdFNldHVwQ29udHJpYnV0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSwgSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgbWFya0FzU2luZ2xldG9uLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgZXF1YWxzSWdub3JlQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJc1dlYkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU1hcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBHaXRIdWJQYXRocywgSURlZmF1bHRBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RlZmF1bHRBY2NvdW50L2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFRvZ2dsZVRpdGxlQmFyQ29uZmlnQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy90aXRsZWJhci90aXRsZWJhckFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnQsIENoYXRFbnRpdGxlbWVudENvbnRleHQsIENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLCBDaGF0RW50aXRsZW1lbnRSZXF1ZXN0cywgQ2hhdEVudGl0bGVtZW50U2VydmljZSwgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIGlzUHJvVXNlciB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRW5hYmxlbWVudFN0YXRlLCBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblVybEhhbmRsZXJPdmVycmlkZVJlZ2lzdHJ5LCBJRXh0ZW5zaW9uVXJsSGFuZGxlck92ZXJyaWRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvblVybEhhbmRsZXIuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENPTlRFWFRfREVGQVVMVF9BQ0NPVU5UX1NUQVRFLCBEZWZhdWx0QWNjb3VudFN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2FjY291bnRzL2Jyb3dzZXIvZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIFBhcnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbkVkaXRvclplbk1vZGVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uLCBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFVwZGF0ZVRpdGxlQmFyRWRpdG9yVmlzaWJsZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi91cGRhdGUvY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCwgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IENIQVRfQ0FURUdPUlksIENIQVRfU0VUVVBfQUNUSU9OX0lELCBDSEFUX1NFVFVQX1NVUFBPUlRfQU5PTllNT1VTX0FDVElPTl9JRCB9IGZyb20gJy4uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdDb250YWluZXJJZCwgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHksIElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY2hhdFZpZXdzV2VsY29tZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vdmlld3NXZWxjb21lL2NoYXRWaWV3c1dlbGNvbWUuanMnO1xuaW1wb3J0IHsgYnVpbGRVcGdyYWRlVXJsV2l0aFJlZGlyZWN0LCBDaGF0U2V0dXBBbm9ueW1vdXMsIENoYXRTZXR1cFN0cmF0ZWd5LCBJQ2hhdFNldHVwQ29tbWFuZE9wdGlvbnMsIElDaGF0U2V0dXBSZXN1bHQsIHJlZnJlc2hUb2tlbnMgfSBmcm9tICcuL2NoYXRTZXR1cC5qcyc7XG5pbXBvcnQgeyBDaGF0U2V0dXBDb250cm9sbGVyIH0gZnJvbSAnLi9jaGF0U2V0dXBDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IEdyb3d0aFNlc3Npb25Db250cm9sbGVyLCByZWdpc3Rlckdyb3d0aFNlc3Npb24gfSBmcm9tICcuL2NoYXRTZXR1cEdyb3d0aFNlc3Npb24uanMnO1xuaW1wb3J0IHsgQUlDb2RlQWN0aW9uc0hlbHBlciwgQUlOZXdTeW1ib2xOYW1lc1Byb3ZpZGVyLCBDaGF0Q29kZUFjdGlvbnNQcm92aWRlciwgU2V0dXBBZ2VudCB9IGZyb20gJy4vY2hhdFNldHVwUHJvdmlkZXJzLmpzJztcbmltcG9ydCB7IENoYXRTZXR1cCB9IGZyb20gJy4vY2hhdFNldHVwUnVubmVyLmpzJztcblxuY29uc3QgZGVmYXVsdENoYXQgPSB7XG5cdGNoYXRFeHRlbnNpb25JZDogcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5jaGF0RXh0ZW5zaW9uSWQgPz8gJycsXG59O1xuXG5jb25zdCBTSUdOX0lOX1RJVExFX0JBUl9BQ1RJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnNpZ25JbkluZGljYXRvcic7XG5cbmV4cG9ydCBjbGFzcyBDaGF0U2V0dXBDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmNoYXRTZXR1cCc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdEVudGl0bGVtZW50U2VydmljZSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IGNoYXRFbnRpdGxlbWVudFNlcnZpY2UuY29udGV4dD8udmFsdWU7XG5cdFx0Y29uc3QgcmVxdWVzdHMgPSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnJlcXVlc3RzPy52YWx1ZTtcblx0XHRpZiAoIWNvbnRleHQgfHwgIXJlcXVlc3RzKSB7XG5cdFx0XHRyZXR1cm47IC8vIGRpc2FibGVkXG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBMYXp5KCgpID0+IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFNldHVwQ29udHJvbGxlciwgY29udGV4dCwgcmVxdWVzdHMpKSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyU2V0dXBBZ2VudHMoY29udGV4dCwgY29udHJvbGxlcik7XG5cdFx0dGhpcy5yZWdpc3Rlckdyb3d0aFNlc3Npb24oY2hhdEVudGl0bGVtZW50U2VydmljZSk7XG5cdFx0dGhpcy5yZWdpc3RlckFjdGlvbnMoY29udGV4dCwgcmVxdWVzdHMsIGNvbnRyb2xsZXIpO1xuXHRcdHRoaXMucmVnaXN0ZXJTaWduSW5UaXRsZUJhckVudHJ5KGFjdGlvblZpZXdJdGVtU2VydmljZSk7XG5cdFx0dGhpcy5yZWdpc3RlclVybExpbmtIYW5kbGVyKCk7XG5cdFx0dGhpcy5jaGVja0V4dGVuc2lvbkluc3RhbGxhdGlvbihjb250ZXh0KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJTZXR1cEFnZW50cyhjb250ZXh0OiBDaGF0RW50aXRsZW1lbnRDb250ZXh0LCBjb250cm9sbGVyOiBMYXp5PENoYXRTZXR1cENvbnRyb2xsZXI+KTogdm9pZCB7XG5cdFx0Y29uc3QgZGVmYXVsdEFnZW50RGlzcG9zYWJsZXMgPSBtYXJrQXNTaW5nbGV0b24obmV3IE11dGFibGVEaXNwb3NhYmxlKCkpOyAvLyBwcmV2ZW50cyBmbGlja2VyIG9uIHdpbmRvdyByZWxvYWRcblx0XHRjb25zdCB2c2NvZGVBZ2VudERpc3Bvc2FibGVzID0gbWFya0FzU2luZ2xldG9uKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRcdGNvbnN0IHJlbmFtZVByb3ZpZGVyRGlzcG9zYWJsZXMgPSBtYXJrQXNTaW5nbGV0b24obmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdGNvbnN0IGNvZGVBY3Rpb25zUHJvdmlkZXJEaXNwb3NhYmxlcyA9IG1hcmtBc1NpbmdsZXRvbihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0XHRjb25zdCB1cGRhdGVSZWdpc3RyYXRpb24gPSAoKSA9PiB7XG5cblx0XHRcdC8vIEFnZW50ICsgVG9vbHNcblx0XHRcdHtcblx0XHRcdFx0aWYgKCFjb250ZXh0LnN0YXRlLmhpZGRlbiAmJiAhY29udGV4dC5zdGF0ZS5kaXNhYmxlZEluV29ya3NwYWNlKSB7XG5cblx0XHRcdFx0XHQvLyBEZWZhdWx0IEFnZW50cyAoYWx3YXlzLCBldmVuIGlmIGluc3RhbGxlZCB0byBhbGxvdyBmb3Igc3BlZWR5IHJlcXVlc3RzIHJpZ2h0IG9uIHN0YXJ0dXApXG5cdFx0XHRcdFx0aWYgKCFkZWZhdWx0QWdlbnREaXNwb3NhYmxlcy52YWx1ZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBkZWZhdWx0QWdlbnREaXNwb3NhYmxlcy52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0XHRcdFx0Ly8gUGFuZWwgQWdlbnRzXG5cdFx0XHRcdFx0XHRjb25zdCBwYW5lbEFnZW50RGlzcG9zYWJsZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgbW9kZSBvZiBbQ2hhdE1vZGVLaW5kLkFzaywgQ2hhdE1vZGVLaW5kLkVkaXQsIENoYXRNb2RlS2luZC5BZ2VudF0pIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgeyBhZ2VudCwgZGlzcG9zYWJsZSB9ID0gU2V0dXBBZ2VudC5yZWdpc3RlckRlZmF1bHRBZ2VudHModGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgbW9kZSwgY29udGV4dCwgY29udHJvbGxlcik7XG5cdFx0XHRcdFx0XHRcdHBhbmVsQWdlbnREaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZSk7XG5cdFx0XHRcdFx0XHRcdHBhbmVsQWdlbnREaXNwb3NhYmxlcy5hZGQoYWdlbnQub25VbnJlc29sdmFibGVFcnJvcigoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgcGFuZWxBZ2VudEhhc0d1aWRhbmNlID0gY2hhdFZpZXdzV2VsY29tZVJlZ2lzdHJ5LmdldCgpLnNvbWUoZGVzY3JpcHRvciA9PiB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoZGVzY3JpcHRvci53aGVuKSk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHBhbmVsQWdlbnRIYXNHdWlkYW5jZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gQW4gdW5yZXNvbHZhYmxlIGVycm9yIGZyb20gb3VyIGFnZW50IHJlZ2lzdHJhdGlvbnMgbWVhbnMgdGhhdFxuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gQ2hhdCBpcyB1bmhlYWx0aHkgZm9yIHNvbWUgcmVhc29uLiBXZSBjbGVhciBvdXIgcGFuZWxcblx0XHRcdFx0XHRcdFx0XHRcdC8vIHJlZ2lzdHJhdGlvbiB0byBnaXZlIENoYXQgYSBjaGFuY2UgdG8gc2hvdyBhIGN1c3RvbSBtZXNzYWdlXG5cdFx0XHRcdFx0XHRcdFx0XHQvLyB0byB0aGUgdXNlciBmcm9tIHRoZSB2aWV3cyBhbmQgc3RvcCBwcmV0ZW5kaW5nIGFzIGlmIHRoZXJlIHdhc1xuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gYSBmdW5jdGlvbmFsIGFnZW50LlxuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbY2hhdCBzZXR1cF0gVW5yZXNvbHZhYmxlIGVycm9yIGZyb20gQ2hhdCBhZ2VudCByZWdpc3RyYXRpb24sIGNsZWFyaW5nIHJlZ2lzdHJhdGlvbi4nKTtcblx0XHRcdFx0XHRcdFx0XHRcdHBhbmVsQWdlbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIElubGluZSBBZ2VudHNcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChTZXR1cEFnZW50LnJlZ2lzdGVyRGVmYXVsdEFnZW50cyh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBDaGF0QWdlbnRMb2NhdGlvbi5UZXJtaW5hbCwgQ2hhdE1vZGVLaW5kLkFzaywgY29udGV4dCwgY29udHJvbGxlcikuZGlzcG9zYWJsZSk7XG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoU2V0dXBBZ2VudC5yZWdpc3RlckRlZmF1bHRBZ2VudHModGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgQ2hhdEFnZW50TG9jYXRpb24uTm90ZWJvb2ssIENoYXRNb2RlS2luZC5Bc2ssIGNvbnRleHQsIGNvbnRyb2xsZXIpLmRpc3Bvc2FibGUpO1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKFNldHVwQWdlbnQucmVnaXN0ZXJEZWZhdWx0QWdlbnRzKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSwgQ2hhdE1vZGVLaW5kLkFzaywgY29udGV4dCwgY29udHJvbGxlcikuZGlzcG9zYWJsZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gQnVpbHQtSW4gQWdlbnQgKyBUb29sICh1bmxlc3MgY29tcGxldGVkLCBzaWduZWQtaW4gYW5kIGVuYWJsZWQpXG5cdFx0XHRcdFx0aWYgKCghY29udGV4dC5zdGF0ZS5jb21wbGV0ZWQgfHwgY29udGV4dC5zdGF0ZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LlVua25vd24gfHwgY29udGV4dC5zdGF0ZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LlVucmVzb2x2ZWQpICYmICF2c2NvZGVBZ2VudERpc3Bvc2FibGVzLnZhbHVlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IHZzY29kZUFnZW50RGlzcG9zYWJsZXMudmFsdWUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoU2V0dXBBZ2VudC5yZWdpc3RlckJ1aWx0SW5BZ2VudHModGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgY29udGV4dCwgY29udHJvbGxlcikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkZWZhdWx0QWdlbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHRcdHZzY29kZUFnZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjb250ZXh0LnN0YXRlLmNvbXBsZXRlZCkge1xuXHRcdFx0XHRcdHZzY29kZUFnZW50RGlzcG9zYWJsZXMuY2xlYXIoKTsgLy8gd2UgbmVlZCB0byBkbyB0aGlzIHRvIHByZXZlbnQgc2hvd2luZyBkdXBsaWNhdGUgYWdlbnQvdG9vbCBlbnRyaWVzIGluIHRoZSBsaXN0XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVuYW1lIFByb3ZpZGVyXG5cdFx0XHR7XG5cdFx0XHRcdGlmICghY29udGV4dC5zdGF0ZS5jb21wbGV0ZWQgJiYgIWNvbnRleHQuc3RhdGUuaGlkZGVuICYmICFjb250ZXh0LnN0YXRlLmRpc2FibGVkSW5Xb3Jrc3BhY2UpIHtcblx0XHRcdFx0XHRpZiAoIXJlbmFtZVByb3ZpZGVyRGlzcG9zYWJsZXMudmFsdWUpIHtcblx0XHRcdFx0XHRcdHJlbmFtZVByb3ZpZGVyRGlzcG9zYWJsZXMudmFsdWUgPSBBSU5ld1N5bWJvbE5hbWVzUHJvdmlkZXIucmVnaXN0ZXJQcm92aWRlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250ZXh0LCBjb250cm9sbGVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVuYW1lUHJvdmlkZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIENvZGUgQWN0aW9ucyBQcm92aWRlclxuXHRcdFx0e1xuXHRcdFx0XHRpZiAoIWNvbnRleHQuc3RhdGUuY29tcGxldGVkICYmICFjb250ZXh0LnN0YXRlLmhpZGRlbiAmJiAhY29udGV4dC5zdGF0ZS5kaXNhYmxlZEluV29ya3NwYWNlKSB7XG5cdFx0XHRcdFx0aWYgKCFjb2RlQWN0aW9uc1Byb3ZpZGVyRGlzcG9zYWJsZXMudmFsdWUpIHtcblx0XHRcdFx0XHRcdGNvZGVBY3Rpb25zUHJvdmlkZXJEaXNwb3NhYmxlcy52YWx1ZSA9IENoYXRDb2RlQWN0aW9uc1Byb3ZpZGVyLnJlZ2lzdGVyUHJvdmlkZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvZGVBY3Rpb25zUHJvdmlkZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZShjb250ZXh0Lm9uRGlkQ2hhbmdlLCAoKSA9PiB1cGRhdGVSZWdpc3RyYXRpb24oKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckdyb3d0aFNlc3Npb24oY2hhdEVudGl0bGVtZW50U2VydmljZTogQ2hhdEVudGl0bGVtZW50U2VydmljZSk6IHZvaWQge1xuXHRcdGNvbnN0IGdyb3d0aFNlc3Npb25EaXNwb3NhYmxlcyA9IG1hcmtBc1NpbmdsZXRvbihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0XHRjb25zdCB1cGRhdGVHcm93dGhTZXNzaW9uID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhwZXJpbWVudEVuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkdyb3d0aE5vdGlmaWNhdGlvbkVuYWJsZWQpID09PSB0cnVlO1xuXHRcdFx0Ly8gU2hvdyBmb3IgdXNlcnMgd2hvIGRvbid0IGhhdmUgY29tcGxldGVkIHRoZSBDaGF0IHNldHVwIHlldC5cblx0XHRcdC8vIEFkZGl0aW9uYWwgY29uZGl0aW9ucyAoZS5nLiwgYW5vbnltb3VzLCBlbnRpdGxlbWVudCkgY2FuIGJlIGxheWVyZWQgaGVyZS5cblx0XHRcdGNvbnN0IHNob3VsZFNob3cgPSBleHBlcmltZW50RW5hYmxlZCAmJiAhY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuY29tcGxldGVkO1xuXHRcdFx0aWYgKHNob3VsZFNob3cgJiYgIWdyb3d0aFNlc3Npb25EaXNwb3NhYmxlcy52YWx1ZSkge1xuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEdyb3d0aFNlc3Npb25Db250cm9sbGVyKSk7XG5cdFx0XHRcdGlmICghY29udHJvbGxlci5pc0Rpc21pc3NlZCkge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3Rlckdyb3d0aFNlc3Npb24odGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLCBjb250cm9sbGVyKSk7XG5cdFx0XHRcdFx0Ly8gRnVsbHkgdW5yZWdpc3RlciB3aGVuIGRpc21pc3NlZCB0byBwcmV2ZW50IGNhY2hlZCBzZXNzaW9uIGZyb21cblx0XHRcdFx0XHQvLyBhcHBlYXJpbmcgZHVyaW5nIGZpbHRlcmVkIG1vZGVsIHVwZGF0ZXMgZnJvbSBvdGhlciBwcm92aWRlcnMuXG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbnRyb2xsZXIub25EaWREaXNtaXNzKCgpID0+IHtcblx0XHRcdFx0XHRcdGdyb3d0aFNlc3Npb25EaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRncm93dGhTZXNzaW9uRGlzcG9zYWJsZXMudmFsdWUgPSBkaXNwb3NhYmxlcztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoIXNob3VsZFNob3cpIHtcblx0XHRcdFx0Z3Jvd3RoU2Vzc2lvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNoYXRFbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VTZW50aW1lbnQoKCkgPT4gdXBkYXRlR3Jvd3RoU2Vzc2lvbigpKSk7XG5cdFx0dXBkYXRlR3Jvd3RoU2Vzc2lvbigpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckFjdGlvbnMoY29udGV4dDogQ2hhdEVudGl0bGVtZW50Q29udGV4dCwgcmVxdWVzdHM6IENoYXRFbnRpdGxlbWVudFJlcXVlc3RzLCBjb250cm9sbGVyOiBMYXp5PENoYXRTZXR1cENvbnRyb2xsZXI+KTogdm9pZCB7XG5cblx0XHQvLyNyZWdpb24gR2xvYmFsIENoYXQgU2V0dXAgQWN0aW9uc1xuXG5cdFx0Y2xhc3MgQ2hhdFNldHVwVHJpZ2dlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdFx0XHRzdGF0aWMgQ0hBVF9TRVRVUF9BQ1RJT05fTEFCRUwgPSBsb2NhbGl6ZTIoJ3RyaWdnZXJDaGF0U2V0dXAnLCBcIlVzZSBBSSBGZWF0dXJlcyB3aXRoIENvcGlsb3QgZm9yIGZyZWUuLi5cIik7XG5cblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IENIQVRfU0VUVVBfQUNUSU9OX0lELFxuXHRcdFx0XHRcdHRpdGxlOiBDaGF0U2V0dXBUcmlnZ2VyQWN0aW9uLkNIQVRfU0VUVVBfQUNUSU9OX0xBQkVMLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UsXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAudW50cnVzdGVkLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmNvbXBsZXRlZC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5jYW5TaWduVXBcblx0XHRcdFx0XHQpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG1vZGU/OiBDaGF0TW9kZUtpbmQgfCBzdHJpbmcsIG9wdGlvbnM/OiBJQ2hhdFNldHVwQ29tbWFuZE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4gfCBJQ2hhdFNldHVwUmVzdWx0PiB7XG5cdFx0XHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGxpZmVjeWNsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxpZmVjeWNsZVNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0XHRcdGF3YWl0IGNvbnRleHQudXBkYXRlKHsgaGlkZGVuOiBmYWxzZSB9KTtcblx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQsIGZhbHNlKTtcblxuXHRcdFx0XHRpZiAobW9kZSkge1xuXHRcdFx0XHRcdGNvbnN0IGNoYXRXaWRnZXQgPSBhd2FpdCB3aWRnZXRTZXJ2aWNlLnJldmVhbFdpZGdldCgpO1xuXHRcdFx0XHRcdGlmIChjaGF0V2lkZ2V0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCByZXNvbHZlZE1vZGUgPSB0aGlzLnJlc29sdmVBZ2VudElkKG1vZGUsIGNoYXRXaWRnZXQpO1xuXHRcdFx0XHRcdFx0aWYgKHJlc29sdmVkTW9kZSkge1xuXHRcdFx0XHRcdFx0XHRjaGF0V2lkZ2V0LmlucHV0LnNldENoYXRNb2RlKHJlc29sdmVkTW9kZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG9wdGlvbnM/LmlucHV0VmFsdWUpIHtcblx0XHRcdFx0XHRjb25zdCBjaGF0V2lkZ2V0ID0gYXdhaXQgd2lkZ2V0U2VydmljZS5yZXZlYWxXaWRnZXQoKTtcblx0XHRcdFx0XHRjaGF0V2lkZ2V0Py5pbnB1dC5zaG93U2Nyb2xsYmFyVW50aWxBY2NlcHQoKTtcblx0XHRcdFx0XHRjaGF0V2lkZ2V0Py5zZXRJbnB1dChvcHRpb25zLmlucHV0VmFsdWUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc2V0dXAgPSBDaGF0U2V0dXAuZ2V0SW5zdGFuY2UoaW5zdGFudGlhdGlvblNlcnZpY2UsIGNvbnRleHQsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXR1cC5ydW4ob3B0aW9ucyk7XG5cdFx0XHRcdGlmIChvcHRpb25zPy5yZXR1cm5SZXN1bHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHsgc3VjY2VzcyB9ID0gcmVzdWx0O1xuXHRcdFx0XHRpZiAoc3VjY2VzcyA9PT0gZmFsc2UgJiYgIXJlc3VsdC5lcnJvckFscmVhZHlIYW5kbGVkICYmICFsaWZlY3ljbGVTZXJ2aWNlLndpbGxTaHV0ZG93bikge1xuXHRcdFx0XHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnc2V0dXBFcnJvckRpYWxvZycsIFwiQ2hhdCBzZXR1cCBmYWlsZWQuIFdvdWxkIHlvdSBsaWtlIHRvIHRyeSBhZ2Fpbj9cIiksXG5cdFx0XHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgncmV0cnknLCBcIlJldHJ5XCIpLFxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0aWYgKGNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIEJvb2xlYW4oYXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9TRVRVUF9BQ1RJT05fSUQsIG1vZGUsIG9wdGlvbnMpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gQm9vbGVhbihzdWNjZXNzKTtcblx0XHRcdH1cblxuXHRcdFx0cHJpdmF0ZSByZXNvbHZlQWdlbnRJZChhZ2VudFBhcmFtOiBzdHJpbmcsIGNoYXRXaWRnZXQ6IElDaGF0V2lkZ2V0KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0Y29uc3QgbW9kZXMgPSBjaGF0V2lkZ2V0LmlucHV0LmN1cnJlbnRDaGF0TW9kZXNPYnMuZ2V0KCk7XG5cdFx0XHRcdGNvbnN0IGZvdW5kQWdlbnQgPSBtb2Rlcy5maW5kTW9kZUJ5SWQoYWdlbnRQYXJhbSk7XG5cdFx0XHRcdGlmIChmb3VuZEFnZW50KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZvdW5kQWdlbnQuaWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWxsQWdlbnRzID0gWy4uLm1vZGVzLmJ1aWx0aW4sIC4uLm1vZGVzLmN1c3RvbV07XG5cdFx0XHRcdGNvbnN0IG5hbWVMb3dlciA9IGFnZW50UGFyYW0udG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0Y29uc3QgYWdlbnRCeU5hbWUgPSBhbGxBZ2VudHMuZmluZChhZ2VudCA9PiBhZ2VudC5uYW1lLmdldCgpLnRvTG93ZXJDYXNlKCkgPT09IG5hbWVMb3dlcik7XG5cdFx0XHRcdHJldHVybiBhZ2VudEJ5TmFtZT8uaWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y2xhc3MgQ2hhdFNldHVwVHJpZ2dlclN1cHBvcnRBbm9ueW1vdXNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogQ0hBVF9TRVRVUF9TVVBQT1JUX0FOT05ZTU9VU19BQ1RJT05fSUQsXG5cdFx0XHRcdFx0dGl0bGU6IENoYXRTZXR1cFRyaWdnZXJBY3Rpb24uQ0hBVF9TRVRVUF9BQ1RJT05fTEFCRUxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgb3B0aW9ucz86IHsgZGlhbG9nSWNvbj86IFRoZW1lSWNvbjsgZGlhbG9nVGl0bGU/OiBzdHJpbmc7IHNldHVwU3RyYXRlZ3k/OiBDaGF0U2V0dXBTdHJhdGVneSB9KTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlKTtcblxuXHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogQ0hBVF9TRVRVUF9BQ1RJT05fSUQsIGZyb206ICdhcGknIH0pO1xuXG5cdFx0XHRcdHJldHVybiBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChDSEFUX1NFVFVQX0FDVElPTl9JRCwgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdFx0Zm9yY2VBbm9ueW1vdXM6IGNoYXRFbnRpdGxlbWVudFNlcnZpY2UuYW5vbnltb3VzID8gQ2hhdFNldHVwQW5vbnltb3VzLkVuYWJsZWRXaXRoRGlhbG9nIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdC4uLm9wdGlvbnNcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y2xhc3MgQ2hhdFNldHVwVHJpZ2dlckZvcmNlU2lnbkluRGlhbG9nQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQudHJpZ2dlclNldHVwRm9yY2VTaWduSW4nLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZvcmNlU2lnbkluJywgXCJTaWduIGluIHRvIHVzZSBHaXRIdWIgQ29waWxvdFwiKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiBDSEFUX1NFVFVQX0FDVElPTl9JRCwgZnJvbTogJ2FwaScgfSk7XG5cblx0XHRcdFx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKENIQVRfU0VUVVBfQUNUSU9OX0lELCB1bmRlZmluZWQsIHsgZm9yY2VTaWduSW5EaWFsb2c6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y2xhc3MgQ2hhdFNldHVwVHJpZ2dlckFub255bW91c1dpdGhvdXREaWFsb2dBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC50cmlnZ2VyU2V0dXBBbm9ueW1vdXNXaXRob3V0RGlhbG9nJyxcblx0XHRcdFx0XHR0aXRsZTogQ2hhdFNldHVwVHJpZ2dlckFjdGlvbi5DSEFUX1NFVFVQX0FDVElPTl9MQUJFTFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiBDSEFUX1NFVFVQX0FDVElPTl9JRCwgZnJvbTogJ2FwaScgfSk7XG5cblx0XHRcdFx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKENIQVRfU0VUVVBfQUNUSU9OX0lELCB1bmRlZmluZWQsIHsgZm9yY2VBbm9ueW1vdXM6IENoYXRTZXR1cEFub255bW91cy5FbmFibGVkV2l0aG91dERpYWxvZyB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjbGFzcyBDaGF0U2V0dXBGcm9tQWNjb3VudHNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC50cmlnZ2VyU2V0dXBGcm9tQWNjb3VudHMnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3RyaWdnZXJDaGF0U2V0dXBGcm9tQWNjb3VudHMnLCBcIlNpZ24gaW4gdG8gdXNlIEdpdEh1YiBDb3BpbG90Li4uXCIpLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQWNjb3VudHNDb250ZXh0LFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICcyX2NvcGlsb3QnLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdFx0Q09OVEVYVF9ERUZBVUxUX0FDQ09VTlRfU1RBVEUubm90RXF1YWxzVG8oRGVmYXVsdEFjY291bnRTdGF0dXMuQXZhaWxhYmxlKSwgLy8gaGlkZSBvbmx5IHdoZW4gc2lnbmVkIGluIChhIGRlZmF1bHQgR2l0SHViIGFjY291bnQgaXMgcHJlc2VudCk7IHN0aWxsIHNob3duIHdoaWxlIHNpZ25lZCBvdXQgb3IgYmVmb3JlIHRoZSBhY2NvdW50IHN0YXRlIHJlc29sdmVzLCBpbmNsLiB1bnRydXN0ZWQgd29ya3NwYWNlcyBcdTIwMTQgbm8gYXV0aCBwcm9tcHRcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmNvbXBsZXRlZC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLkVudGl0bGVtZW50LnNpZ25lZE91dFxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogQ0hBVF9TRVRVUF9BQ1RJT05fSUQsIGZyb206ICdhY2NvdW50cycgfSk7XG5cblx0XHRcdFx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKENIQVRfU0VUVVBfQUNUSU9OX0lEKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjbGFzcyBDaGF0U2V0dXBTaWduSW5UaXRsZUJhckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdFx0XHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBTSUdOX0lOX1RJVExFX0JBUl9BQ1RJT05fSUQ7XG5cblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IENoYXRTZXR1cFNpZ25JblRpdGxlQmFyQWN0aW9uLklELFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2lnbkluSW5kaWNhdG9yVGl0bGVCYXJBY3Rpb24nLCAnU2lnbiBJbicpLFxuXHRcdFx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5UaXRsZUJhckFkamFjZW50Q2VudGVyLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRcdElzV2ViQ29udGV4dC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLkVudGl0bGVtZW50LnNpZ25lZE91dCxcblx0XHRcdFx0XHRcdFx0Q09OVEVYVF9ERUZBVUxUX0FDQ09VTlRfU1RBVEUubm90RXF1YWxzVG8oRGVmYXVsdEFjY291bnRTdGF0dXMuQXZhaWxhYmxlKSwgLy8gaGlkZSBvbmx5IHdoZW4gc2lnbmVkIGluIChhIGRlZmF1bHQgR2l0SHViIGFjY291bnQgaXMgcHJlc2VudCk7IHN0aWxsIHNob3duIHdoaWxlIHNpZ25lZCBvdXQgb3IgYmVmb3JlIHRoZSBhY2NvdW50IHN0YXRlIHJlc29sdmVzLCBpbmNsLiB1bnRydXN0ZWQgd29ya3NwYWNlcyBcdTIwMTQgbm8gYXV0aCBwcm9tcHRcblx0XHRcdFx0XHRcdFx0Q2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuaGFzQnlva01vZGVscy5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Q2hhdENvbmZpZ3VyYXRpb24uVGl0bGVCYXJTaWduSW5FbmFibGVkfWAsIHRydWUpLFxuXHRcdFx0XHRcdFx0XHRVcGRhdGVUaXRsZUJhckVkaXRvclZpc2libGVDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0XHRJbkVkaXRvclplbk1vZGVDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiBDSEFUX1NFVFVQX0FDVElPTl9JRCwgZnJvbTogJ3RpdGxlYmFyJyB9KTtcblxuXHRcdFx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9TRVRVUF9BQ1RJT05fSUQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNsYXNzIFRvZ2dsZVNpZ25JblRpdGxlQmFyQWN0aW9uIGV4dGVuZHMgVG9nZ2xlVGl0bGVCYXJDb25maWdBY3Rpb24ge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKFxuXHRcdFx0XHRcdENoYXRDb25maWd1cmF0aW9uLlRpdGxlQmFyU2lnbkluRW5hYmxlZCxcblx0XHRcdFx0XHRsb2NhbGl6ZSgndG9nZ2xlLmNoYXRTaWduSW4nLCAnQ29waWxvdCBTaWduIEluJyksXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3RvZ2dsZS5jaGF0U2lnbkluRGVzY3JpcHRpb24nLCBcIlRvZ2dsZSB2aXNpYmlsaXR5IG9mIHRoZSBDb3BpbG90IFNpZ24gSW4gYnV0dG9uIGluIHRpdGxlIGJhclwiKSxcblx0XHRcdFx0XHQzLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdElzV2ViQ29udGV4dC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5zaWduZWRPdXQsXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCksXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHdpbmRvd0ZvY3VzTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0Y2xhc3MgVXBncmFkZVBsYW5BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQudXBncmFkZVBsYW4nLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21hbmFnZVBsYW4nLCBcIlVwZ3JhZGUgdG8gR2l0SHViIENvcGlsb3QgUHJvXCIpLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBsb2NhbGl6ZTIoJ2NoYXQuY2F0ZWdvcnknLCAnQ2hhdCcpLFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5TZXR1cC5kaXNhYmxlZEluV29ya3NwYWNlLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5jYW5TaWduVXAsXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5wbGFuRnJlZVxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VGl0bGVCYXJNZW51LFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICdhX2ZpcnN0Jyxcblx0XHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuRW50aXRsZW1lbnQucGxhbkZyZWUsXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0UXVvdGFFeGNlZWRlZCxcblx0XHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY29tcGxldGlvbnNRdW90YUV4Y2VlZGVkXG5cdFx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3Qgb3BlbmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJT3BlbmVyU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlZmF1bHRBY2NvdW50U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcm9kdWN0U2VydmljZSk7XG5cblx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQudXBncmFkZVBsYW4nLCBmcm9tOiAnY29tbWFuZCcgfSk7XG5cblx0XHRcdFx0Y29uc3QgYmFzZVVybCA9IGRlZmF1bHRBY2NvdW50U2VydmljZS5yZXNvbHZlR2l0SHViVXJsKEdpdEh1YlBhdGhzLmNvcGlsb3RVcGdyYWRlKTtcblx0XHRcdFx0Y29uc3QgdXBncmFkZVVybCA9IGJ1aWxkVXBncmFkZVVybFdpdGhSZWRpcmVjdChiYXNlVXJsLCBwcm9kdWN0U2VydmljZS51cmxQcm90b2NvbCwgcHJvZHVjdFNlcnZpY2UucXVhbGl0eSk7XG5cdFx0XHRcdG9wZW5lclNlcnZpY2Uub3Blbih1cGdyYWRlVXJsKTtcblxuXHRcdFx0XHRjb25zdCBlbnRpdGxlbWVudCA9IGNvbnRleHQuc3RhdGUuZW50aXRsZW1lbnQ7XG5cdFx0XHRcdGlmICghaXNQcm9Vc2VyKGVudGl0bGVtZW50KSkge1xuXHRcdFx0XHRcdC8vIElmIHRoZSB1c2VyIGlzIG5vdCB5ZXQgUHJvLCB3ZSBsaXN0ZW4gdG8gd2luZG93IGZvY3VzIHRvIHJlZnJlc2ggdGhlIHRva2VuXG5cdFx0XHRcdFx0Ly8gd2hlbiB0aGUgdXNlciBoYXMgY29tZSBiYWNrIHRvIHRoZSB3aW5kb3cgYXNzdW1pbmcgdGhlIHVzZXIgc2lnbmVkIHVwLlxuXHRcdFx0XHRcdC8vIFRoaXMgc2VydmVzIGFzIGEgZmFsbGJhY2sgd2hlbiB0aGUgcmVkaXJlY3QgZG9lcyBub3QgZmlyZS5cblx0XHRcdFx0XHR3aW5kb3dGb2N1c0xpc3RlbmVyLnZhbHVlID0gaG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1cyhmb2N1cyA9PiB0aGlzLm9uV2luZG93Rm9jdXMoZm9jdXMsIGNvbW1hbmRTZXJ2aWNlKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cHJpdmF0ZSBhc3luYyBvbldpbmRvd0ZvY3VzKGZvY3VzOiBib29sZWFuLCBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGlmIChmb2N1cykge1xuXHRcdFx0XHRcdHdpbmRvd0ZvY3VzTGlzdGVuZXIuY2xlYXIoKTtcblxuXHRcdFx0XHRcdGNvbnN0IGVudGl0bGVtZW50cyA9IGF3YWl0IHJlcXVlc3RzLmZvcmNlUmVzb2x2ZUVudGl0bGVtZW50KCk7XG5cdFx0XHRcdFx0aWYgKGVudGl0bGVtZW50cz8uZW50aXRsZW1lbnQgJiYgaXNQcm9Vc2VyKGVudGl0bGVtZW50cz8uZW50aXRsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRyZWZyZXNoVG9rZW5zKGNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjbGFzcyBNYW5hZ2VBZGRpdGlvbmFsU3BlbmRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQubWFuYWdlQWRkaXRpb25hbFNwZW5kJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtYW5hZ2VBZGRpdGlvbmFsU3BlbmQnLCBcIk1hbmFnZSBHaXRIdWIgQ29waWxvdCBCdWRnZXRcIiksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IGxvY2FsaXplMignY2hhdC5jYXRlZ29yeScsICdDaGF0JyksXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5Qcm8sXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5wbGFuUHJvUGx1cyxcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5NYXgsXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5wbGFuRWR1LFxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VGl0bGVCYXJNZW51LFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICdhX2ZpcnN0Jyxcblx0XHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuRW50aXRsZW1lbnQucGxhblBybyxcblx0XHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuRW50aXRsZW1lbnQucGxhblByb1BsdXMsXG5cdFx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5NYXgsXG5cdFx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5FZHUsXG5cdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0UXVvdGFFeGNlZWRlZCxcblx0XHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY29tcGxldGlvbnNRdW90YUV4Y2VlZGVkXG5cdFx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3Qgb3BlbmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJT3BlbmVyU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlZmF1bHRBY2NvdW50U2VydmljZSk7XG5cdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm1hbmFnZUFkZGl0aW9uYWxTcGVuZCcsIGZyb206ICdjb21tYW5kJyB9KTtcblx0XHRcdFx0b3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZShkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVzb2x2ZUdpdEh1YlVybChHaXRIdWJQYXRocy5iaWxsaW5nQnVkZ2V0cykpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZWdpc3RlckFjdGlvbjIoQ2hhdFNldHVwVHJpZ2dlckFjdGlvbik7XG5cdFx0cmVnaXN0ZXJBY3Rpb24yKENoYXRTZXR1cFRyaWdnZXJGb3JjZVNpZ25JbkRpYWxvZ0FjdGlvbik7XG5cdFx0cmVnaXN0ZXJBY3Rpb24yKENoYXRTZXR1cEZyb21BY2NvdW50c0FjdGlvbik7XG5cdFx0cmVnaXN0ZXJBY3Rpb24yKENoYXRTZXR1cFNpZ25JblRpdGxlQmFyQWN0aW9uKTtcblx0XHRyZWdpc3RlckFjdGlvbjIoVG9nZ2xlU2lnbkluVGl0bGVCYXJBY3Rpb24pO1xuXHRcdHJlZ2lzdGVyQWN0aW9uMihDaGF0U2V0dXBUcmlnZ2VyQW5vbnltb3VzV2l0aG91dERpYWxvZ0FjdGlvbik7XG5cdFx0cmVnaXN0ZXJBY3Rpb24yKENoYXRTZXR1cFRyaWdnZXJTdXBwb3J0QW5vbnltb3VzQWN0aW9uKTtcblx0XHRyZWdpc3RlckFjdGlvbjIoVXBncmFkZVBsYW5BY3Rpb24pO1xuXHRcdHJlZ2lzdGVyQWN0aW9uMihNYW5hZ2VBZGRpdGlvbmFsU3BlbmRBY3Rpb24pO1xuXG5cdFx0Ly8jZW5kcmVnaW9uXG5cblx0XHQvLyNyZWdpb24gRWRpdG9yIENvbnRleHQgTWVudVxuXG5cdFx0ZnVuY3Rpb24gcmVnaXN0ZXJHZW5lcmF0ZUNvZGVDb21tYW5kKGNvcmVDb21tYW5kOiAnY2hhdC5pbnRlcm5hbC5leHBsYWluJyB8ICdjaGF0LmludGVybmFsLmZpeCcgfCAnY2hhdC5pbnRlcm5hbC5yZXZpZXcnLCBhY3R1YWxDb21tYW5kOiBzdHJpbmcpOiB2b2lkIHtcblxuXHRcdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoY29yZUNvbW1hbmQsIGFzeW5jIChhY2Nlc3NvciwgLi4uYXJncykgPT4ge1xuXHRcdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBjb2RlRWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElNYXJrZXJTZXJ2aWNlKTtcblxuXHRcdFx0XHRzd2l0Y2ggKGNvcmVDb21tYW5kKSB7XG5cdFx0XHRcdFx0Y2FzZSAnY2hhdC5pbnRlcm5hbC5leHBsYWluJzpcblx0XHRcdFx0XHRjYXNlICdjaGF0LmludGVybmFsLmZpeCc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IHRleHRFZGl0b3IgPSBjb2RlRWRpdG9yU2VydmljZS5nZXRBY3RpdmVDb2RlRWRpdG9yKCk7XG5cdFx0XHRcdFx0XHRjb25zdCB1cmkgPSB0ZXh0RWRpdG9yPy5nZXRNb2RlbCgpPy51cmk7XG5cdFx0XHRcdFx0XHRjb25zdCByYW5nZSA9IHRleHRFZGl0b3I/LmdldFNlbGVjdGlvbigpO1xuXHRcdFx0XHRcdFx0aWYgKCF1cmkgfHwgIXJhbmdlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgbWFya2VycyA9IEFJQ29kZUFjdGlvbnNIZWxwZXIud2FybmluZ09yRXJyb3JNYXJrZXJzQXRSYW5nZShtYXJrZXJTZXJ2aWNlLCB1cmksIHJhbmdlKTtcblxuXHRcdFx0XHRcdFx0Y29uc3QgYWN0dWFsQ29tbWFuZCA9IGNvcmVDb21tYW5kID09PSAnY2hhdC5pbnRlcm5hbC5leHBsYWluJ1xuXHRcdFx0XHRcdFx0XHQ/IEFJQ29kZUFjdGlvbnNIZWxwZXIuZXhwbGFpbk1hcmtlcnMobWFya2Vycylcblx0XHRcdFx0XHRcdFx0OiBBSUNvZGVBY3Rpb25zSGVscGVyLmZpeE1hcmtlcnMobWFya2VycywgcmFuZ2UpO1xuXG5cdFx0XHRcdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChhY3R1YWxDb21tYW5kLmlkLCAuLi4oYWN0dWFsQ29tbWFuZC5hcmd1bWVudHMgPz8gW10pKTtcblxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ2NoYXQuaW50ZXJuYWwucmV2aWV3Jzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9TRVRVUF9TVVBQT1JUX0FOT05ZTU9VU19BQ1RJT05fSUQpO1xuXHRcdFx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChhY3R1YWxDb21tYW5kKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJlZ2lzdGVyR2VuZXJhdGVDb2RlQ29tbWFuZCgnY2hhdC5pbnRlcm5hbC5leHBsYWluJywgJ2dpdGh1Yi5jb3BpbG90LmNoYXQuZXhwbGFpbicpO1xuXHRcdHJlZ2lzdGVyR2VuZXJhdGVDb2RlQ29tbWFuZCgnY2hhdC5pbnRlcm5hbC5maXgnLCAnZ2l0aHViLmNvcGlsb3QuY2hhdC5maXgnKTtcblx0XHRyZWdpc3RlckdlbmVyYXRlQ29kZUNvbW1hbmQoJ2NoYXQuaW50ZXJuYWwucmV2aWV3JywgJ2dpdGh1Yi5jb3BpbG90LmNoYXQucmV2aWV3Jyk7XG5cblx0XHRjb25zdCBpbnRlcm5hbEdlbmVyYXRlQ29kZUNvbnRleHQgPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLFxuXHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCksXG5cdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuY29tcGxldGVkLm5lZ2F0ZSgpLFxuXHRcdCk7XG5cblx0XHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvckNvbnRleHQsIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6ICdjaGF0LmludGVybmFsLmV4cGxhaW4nLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2V4cGxhaW4nLCBcIkV4cGxhaW5cIiksXG5cdFx0XHR9LFxuXHRcdFx0Z3JvdXA6ICcxX2NoYXQnLFxuXHRcdFx0b3JkZXI6IDQsXG5cdFx0XHR3aGVuOiBpbnRlcm5hbEdlbmVyYXRlQ29kZUNvbnRleHRcblx0XHR9KTtcblxuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yQ29udGV4dCwge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogJ2NoYXQuaW50ZXJuYWwuZml4Jyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdmaXgnLCBcIkZpeFwiKSxcblx0XHRcdH0sXG5cdFx0XHRncm91cDogJzFfY2hhdCcsXG5cdFx0XHRvcmRlcjogNSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0aW50ZXJuYWxHZW5lcmF0ZUNvZGVDb250ZXh0LFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5yZWFkT25seS5uZWdhdGUoKVxuXHRcdFx0KVxuXHRcdH0pO1xuXG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JDb250ZXh0LCB7XG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiAnY2hhdC5pbnRlcm5hbC5yZXZpZXcnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3JldmlldycsIFwiQ29kZSBSZXZpZXdcIiksXG5cdFx0XHR9LFxuXHRcdFx0Z3JvdXA6ICcxX2NoYXQnLFxuXHRcdFx0b3JkZXI6IDYsXG5cdFx0XHR3aGVuOiBpbnRlcm5hbEdlbmVyYXRlQ29kZUNvbnRleHRcblx0XHR9KTtcblxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNpZ25JblRpdGxlQmFyRW50cnkoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKFxuXHRcdFx0TWVudUlkLlRpdGxlQmFyQWRqYWNlbnRDZW50ZXIsXG5cdFx0XHRTSUdOX0lOX1RJVExFX0JBUl9BQ1RJT05fSUQsXG5cdFx0XHQoYWN0aW9uLCBvcHRpb25zKSA9PiBuZXcgU2lnbkluVGl0bGVCYXJFbnRyeShhY3Rpb24sIG9wdGlvbnMpXG5cdFx0KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyVXJsTGlua0hhbmRsZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXh0ZW5zaW9uVXJsSGFuZGxlck92ZXJyaWRlUmVnaXN0cnkucmVnaXN0ZXJIYW5kbGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFNldHVwRXh0ZW5zaW9uVXJsSGFuZGxlcikpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2hlY2tFeHRlbnNpb25JbnN0YWxsYXRpb24oY29udGV4dDogQ2hhdEVudGl0bGVtZW50Q29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gV2hlbiBkZXZlbG9waW5nIGV4dGVuc2lvbnMsIGF3YWl0IHJlZ2lzdHJhdGlvbiBhbmQgdGhlbiBjaGVja1xuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0V4dGVuc2lvbkRldmVsb3BtZW50KSB7XG5cdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMuZmluZChleHQgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoZXh0LmlkZW50aWZpZXIsIGRlZmF1bHRDaGF0LmNoYXRFeHRlbnNpb25JZCkpKSB7XG5cdFx0XHRcdGNvbnRleHQudXBkYXRlKHsgaW5zdGFsbGVkOiB0cnVlLCBkaXNhYmxlZDogZmFsc2UsIHVudHJ1c3RlZDogZmFsc2UsIGRpc2FibGVkSW5Xb3Jrc3BhY2U6IGZhbHNlIH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQXdhaXQgZXh0ZW5zaW9ucyB0byBiZSByZWFkeSB0byBiZSBxdWVyaWVkXG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5xdWVyeUxvY2FsKCk7XG5cblx0XHQvLyBMaXN0ZW4gdG8gZXh0ZW5zaW9ucyBjaGFuZ2UgYW5kIHByb2Nlc3MgZXh0ZW5zaW9ucyBvbmNlXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlPElFeHRlbnNpb24gfCB1bmRlZmluZWQ+KHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub25DaGFuZ2UsIGUgPT4ge1xuXHRcdFx0aWYgKGUgJiYgIUV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGUuaWRlbnRpZmllci5pZCwgZGVmYXVsdENoYXQuY2hhdEV4dGVuc2lvbklkKSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIHVucmVsYXRlZCBldmVudFxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdEV4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmluZCh2YWx1ZSA9PiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyh2YWx1ZS5pZGVudGlmaWVyLmlkLCBkZWZhdWx0Q2hhdC5jaGF0RXh0ZW5zaW9uSWQpKTtcblx0XHRcdGNvbnN0IGluc3RhbGxlZCA9ICEhZGVmYXVsdENoYXRFeHRlbnNpb24/LmxvY2FsO1xuXG5cdFx0XHRsZXQgZGlzYWJsZWQ6IGJvb2xlYW47XG5cdFx0XHRsZXQgdW50cnVzdGVkID0gZmFsc2U7XG5cdFx0XHRsZXQgZGlzYWJsZWRJbldvcmtzcGFjZSA9IGZhbHNlO1xuXHRcdFx0aWYgKGluc3RhbGxlZCkge1xuXHRcdFx0XHRkaXNhYmxlZCA9ICF0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZChkZWZhdWx0Q2hhdEV4dGVuc2lvbi5sb2NhbCk7XG5cdFx0XHRcdGlmIChkaXNhYmxlZCkge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5nZXRFbmFibGVtZW50U3RhdGUoZGVmYXVsdENoYXRFeHRlbnNpb24ubG9jYWwpO1xuXHRcdFx0XHRcdGlmIChzdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlUcnVzdFJlcXVpcmVtZW50KSB7XG5cdFx0XHRcdFx0XHRkaXNhYmxlZCA9IGZhbHNlOyAvLyBub3QgZGlzYWJsZWQgYnkgdXNlciBjaG9pY2UgYnV0XG5cdFx0XHRcdFx0XHR1bnRydXN0ZWQgPSB0cnVlOyAvLyBieSBtaXNzaW5nIHdvcmtzcGFjZSB0cnVzdFxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoc3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZSkge1xuXHRcdFx0XHRcdFx0ZGlzYWJsZWRJbldvcmtzcGFjZSA9IHRydWU7IC8vIGRpc2FibGVkIGF0IHdvcmtzcGFjZSBsZXZlbFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGlzYWJsZWQgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29udGV4dC51cGRhdGUoeyBpbnN0YWxsZWQsIGRpc2FibGVkLCB1bnRydXN0ZWQsIGRpc2FibGVkSW5Xb3Jrc3BhY2UgfSk7XG5cdFx0fSkpO1xuXHR9XG59XG5cbmNsYXNzIENoYXRTZXR1cEV4dGVuc2lvblVybEhhbmRsZXIgaW1wbGVtZW50cyBJRXh0ZW5zaW9uVXJsSGFuZGxlck92ZXJyaWRlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBVUEdSQURFX1NVQ0NFU1NfTk9USUZJQ0FUSU9OX0lEID0gJ2NvcGlsb3QudXBncmFkZVN1Y2Nlc3MnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJQ2hhdEVudGl0bGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2U6IElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGNhbkhhbmRsZVVSTCh1cmw6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB1cmwuc2NoZW1lID09PSB0aGlzLnByb2R1Y3RTZXJ2aWNlLnVybFByb3RvY29sICYmIGVxdWFsc0lnbm9yZUNhc2UodXJsLmF1dGhvcml0eSwgZGVmYXVsdENoYXQuY2hhdEV4dGVuc2lvbklkKTtcblx0fVxuXG5cdGFzeW5jIGhhbmRsZVVSTCh1cmw6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh1cmwucGF0aCA9PT0gJy91cGdyYWRlLXN1Y2Nlc3MnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlVXBncmFkZVN1Y2Nlc3MoKTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHVybC5xdWVyeSk7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogQ0hBVF9TRVRVUF9BQ1RJT05fSUQsIGZyb206ICd1cmwnLCBkZXRhaWw6IHBhcmFtcy5nZXQoJ3JlZmVycmVyJykgPz8gdW5kZWZpbmVkIH0pO1xuXG5cdFx0Y29uc3QgYWdlbnRQYXJhbSA9IHBhcmFtcy5nZXQoJ2FnZW50JykgPz8gcGFyYW1zLmdldCgnbW9kZScpO1xuXHRcdGNvbnN0IGlucHV0UGFyYW0gPSBwYXJhbXMuZ2V0KCdwcm9tcHQnKTtcblx0XHRpZiAoIWFnZW50UGFyYW0gJiYgIWlucHV0UGFyYW0pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKENIQVRfU0VUVVBfQUNUSU9OX0lELCBhZ2VudFBhcmFtLCBpbnB1dFBhcmFtID8geyBpbnB1dFZhbHVlOiBpbnB1dFBhcmFtIH0gOiB1bmRlZmluZWQpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlVXBncmFkZVN1Y2Nlc3MoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC51cGdyYWRlUGxhbicsIGZyb206ICdyZWRpcmVjdCcgfSk7XG5cblx0XHQvLyBSZWZyZXNoIGVudGl0bGVtZW50cyBhbmQgdG9rZW5zIHRvIHBpY2sgdXAgdGhlIG5ldyBwbGFuXG5cdFx0YXdhaXQgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnVwZGF0ZShDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRyZWZyZXNoVG9rZW5zKHRoaXMuY29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0Ly8gU2hvdyBhIGNoYXQgaW5wdXQgbm90aWZpY2F0aW9uIGluZm9ybWluZyB0aGUgdXNlclxuXHRcdHRoaXMuY2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZS5zZXROb3RpZmljYXRpb24oe1xuXHRcdFx0aWQ6IENoYXRTZXR1cEV4dGVuc2lvblVybEhhbmRsZXIuVVBHUkFERV9TVUNDRVNTX05PVElGSUNBVElPTl9JRCxcblx0XHRcdHNldmVyaXR5OiBDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3VwZ3JhZGVTdWNjZXNzJywgXCJVcGdyYWRlIFN1Y2Nlc3NmdWxcIiksXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3VwZ3JhZGVTdWNjZXNzRGVzY3JpcHRpb24nLCBcIlBsZWFzZSB3YWl0IHVwIHRvIDEwIG1pbnV0ZXMgZm9yIHlvdXIgbmV3IHBsYW4gdG8gYXBwbHkuXCIpLFxuXHRcdFx0YWN0aW9uczogW10sXG5cdFx0XHRkaXNtaXNzaWJsZTogdHJ1ZSxcblx0XHRcdGF1dG9EaXNtaXNzT25NZXNzYWdlOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRUZWFyZG93bkNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhdFRlYXJkb3duJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgY2hhdEVudGl0bGVtZW50U2VydmljZTogQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IGNoYXRFbnRpdGxlbWVudFNlcnZpY2UuY29udGV4dD8udmFsdWU7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47IC8vIGRpc2FibGVkXG5cdFx0fVxuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHRcdHRoaXMucmVnaXN0ZXJBY3Rpb25zKCk7XG5cblx0XHR0aGlzLmhhbmRsZUNoYXREaXNhYmxlZChmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUNoYXREaXNhYmxlZChmcm9tRXZlbnQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBjaGF0RGlzYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3QoQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQpO1xuXHRcdGlmIChjaGF0RGlzYWJsZWQudmFsdWUgPT09IHRydWUpIHtcblx0XHRcdHRoaXMubWF5YmVFbmFibGVPckRpc2FibGVFeHRlbnNpb24odHlwZW9mIGNoYXREaXNhYmxlZC53b3Jrc3BhY2VWYWx1ZSA9PT0gJ2Jvb2xlYW4nID8gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlIDogRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkR2xvYmFsbHkpO1xuXHRcdFx0aWYgKGZyb21FdmVudCkge1xuXHRcdFx0XHR0aGlzLm1heWJlSGlkZUF1eGlsaWFyeUJhcigpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoY2hhdERpc2FibGVkLnZhbHVlID09PSBmYWxzZSAmJiBmcm9tRXZlbnQgLyogZG8gbm90IGVuYWJsZSBleHRlbnNpb25zIHVubGVzcyBpdHMgYW4gZXhwbGljaXQgc2V0dGluZ3MgY2hhbmdlICovKSB7XG5cdFx0XHR0aGlzLm1heWJlRW5hYmxlT3JEaXNhYmxlRXh0ZW5zaW9uKHR5cGVvZiBjaGF0RGlzYWJsZWQud29ya3NwYWNlVmFsdWUgPT09ICdib29sZWFuJyA/IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlIDogRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWdpc3Rlckxpc3RlbmVycygpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIENvbmZpZ3VyYXRpb24gY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKCFlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRBSURpc2FibGVkU2V0dGluZ0lkKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuaGFuZGxlQ2hhdERpc2FibGVkKHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEV4dGVuc2lvbiBpbnN0YWxsYXRpb25cblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnF1ZXJ5TG9jYWwoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9uQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUgJiYgIUV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGUuaWRlbnRpZmllci5pZCwgZGVmYXVsdENoYXQuY2hhdEV4dGVuc2lvbklkKSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIHVucmVsYXRlZCBldmVudFxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdEV4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmluZCh2YWx1ZSA9PiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyh2YWx1ZS5pZGVudGlmaWVyLmlkLCBkZWZhdWx0Q2hhdC5jaGF0RXh0ZW5zaW9uSWQpKTtcblx0XHRcdGlmIChkZWZhdWx0Q2hhdEV4dGVuc2lvbj8ubG9jYWwgJiYgdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoZGVmYXVsdENoYXRFeHRlbnNpb24ubG9jYWwpKSB7XG5cdFx0XHRcdGlmIChkZWZhdWx0Q2hhdEV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdChDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCkud29ya3NwYWNlVmFsdWUgPT09IHRydWUpIHtcblx0XHRcdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQsIGZhbHNlLCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQsIGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbWF5YmVFbmFibGVPckRpc2FibGVFeHRlbnNpb24oc3RhdGU6IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkR2xvYmFsbHkgfCBFbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZSB8IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEdsb2JhbGx5IHwgRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVmYXVsdENoYXRFeHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbmQodmFsdWUgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHModmFsdWUuaWRlbnRpZmllci5pZCwgZGVmYXVsdENoYXQuY2hhdEV4dGVuc2lvbklkKSk7XG5cdFx0aWYgKCFkZWZhdWx0Q2hhdEV4dGVuc2lvbj8ubG9jYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBzdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UgfHwgc3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZTtcblx0XHRjb25zdCBjYW5DaGFuZ2UgPSB3b3Jrc3BhY2Vcblx0XHRcdD8gdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5jYW5DaGFuZ2VXb3Jrc3BhY2VFbmFibGVtZW50KGRlZmF1bHRDaGF0RXh0ZW5zaW9uLmxvY2FsKVxuXHRcdFx0OiB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmNhbkNoYW5nZUVuYWJsZW1lbnQoZGVmYXVsdENoYXRFeHRlbnNpb24ubG9jYWwpO1xuXHRcdGlmICghY2FuQ2hhbmdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5zZXRFbmFibGVtZW50KFtkZWZhdWx0Q2hhdEV4dGVuc2lvbl0sIHN0YXRlKTtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnVwZGF0ZVJ1bm5pbmdFeHRlbnNpb25zKHN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEdsb2JhbGx5IHx8IHN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZSA/IGxvY2FsaXplKCdyZXN0YXJ0RXh0ZW5zaW9uSG9zdC5yZWFzb24uZW5hYmxlJywgXCJFbmFibGluZyBBSSBmZWF0dXJlc1wiKSA6IGxvY2FsaXplKCdyZXN0YXJ0RXh0ZW5zaW9uSG9zdC5yZWFzb24uZGlzYWJsZScsIFwiRGlzYWJsaW5nIEFJIGZlYXR1cmVzXCIpKTtcblx0fVxuXG5cdHByaXZhdGUgbWF5YmVIaWRlQXV4aWxpYXJ5QmFyKCk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUNvbnRhaW5lcnMgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyc0J5TG9jYXRpb24oVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcikuZmlsdGVyKFxuXHRcdFx0Y29udGFpbmVyID0+IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbChjb250YWluZXIpLmFjdGl2ZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGggPiAwXG5cdFx0KTtcblx0XHRpZiAoXG5cdFx0XHQoYWN0aXZlQ29udGFpbmVycy5sZW5ndGggPT09IDApIHx8ICBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdC8vIGNoYXQgdmlldyBpcyBhbHJlYWR5IGdvbmUgYnV0IHdlIGtub3cgaXQgd2FzIHRoZXJlIGJlZm9yZVxuXHRcdFx0KGFjdGl2ZUNvbnRhaW5lcnMubGVuZ3RoID09PSAxICYmIGFjdGl2ZUNvbnRhaW5lcnMuYXQoMCk/LmlkID09PSBDaGF0Vmlld0NvbnRhaW5lcklkKSBcdC8vIGNoYXQgdmlldyBpcyB0aGUgb25seSB2aWV3IHdoaWNoIGlzIGdvaW5nIHRvIGdvIGF3YXlcblx0XHQpIHtcblx0XHRcdHRoaXMubGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKHRydWUsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKTsgLy8gaGlkZSBpZiB0aGVyZSBhcmUgbm8gdmlld3MgaW4gdGhlIHNlY29uZGFyeSBzaWRlYmFyXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckFjdGlvbnMoKTogdm9pZCB7XG5cblx0XHRjbGFzcyBDaGF0U2V0dXBIaWRlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0XHRcdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuaGlkZVNldHVwJztcblx0XHRcdHN0YXRpYyByZWFkb25seSBUSVRMRSA9IGxvY2FsaXplMignaGlkZUNoYXRTZXR1cCcsIFwiTGVhcm4gSG93IHRvIEhpZGUgQUkgRmVhdHVyZXNcIik7XG5cblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IENoYXRTZXR1cEhpZGVBY3Rpb24uSUQsXG5cdFx0XHRcdFx0dGl0bGU6IENoYXRTZXR1cEhpZGVBY3Rpb24uVElUTEUsXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdFRpdGxlQmFyTWVudSxcblx0XHRcdFx0XHRcdGdyb3VwOiAnel9oaWRlJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLlNldHVwLmNvbXBsZXRlZC5uZWdhdGUoKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCBwcmVmZXJlbmNlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSk7XG5cblx0XHRcdFx0cHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5TZXR0aW5ncyh7IGpzb25FZGl0b3I6IGZhbHNlLCBxdWVyeTogYEBpZDoke0NoYXRBSURpc2FibGVkU2V0dGluZ0lkfWAgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmVnaXN0ZXJBY3Rpb24yKENoYXRTZXR1cEhpZGVBY3Rpb24pO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vKipcbiAqIEN1c3RvbSBhY3Rpb24gdmlldyBpdGVtIHRoYXQgcmVuZGVycyBhIFwiU2lnbiBJblwiIGJ1dHRvblxuICogaW4gdGhlIHRpdGxlIGJhciB3aXRoIHByb21pbmVudCBidXR0b24gc3R5bGluZy5cbiAqL1xuY2xhc3MgU2lnbkluVGl0bGVCYXJFbnRyeSBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cblx0cHJpdmF0ZSBsYWJlbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBJQWN0aW9uLFxuXHRcdG9wdGlvbnM6IElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zLFxuXHQpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblxuXHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuYWN0aW9uLmxhYmVsKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy51cGRhdGUtaW5kaWNhdG9yLnByb21pbmVudCcpKTtcblx0XHR0aGlzLmxhYmVsID0gZG9tLmFwcGVuZChjb250ZW50LCBkb20uJCgnLmluZGljYXRvci1sYWJlbCcpKTtcblx0XHR0aGlzLmxhYmVsLnRleHRDb250ZW50ID0gdGhpcy5hY3Rpb24ubGFiZWw7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubGFiZWwpIHtcblx0XHRcdHRoaXMubGFiZWwudGV4dENvbnRlbnQgPSB0aGlzLmFjdGlvbi5sYWJlbDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuYWN0aW9uLmxhYmVsKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlRW5hYmxlZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCAhdGhpcy5hY3Rpb24uZW5hYmxlZCk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDBCQUFzRDtBQUUvRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsWUFBWSxpQkFBaUIsaUJBQWlCLHlCQUF5QjtBQUNoRixPQUFPLGNBQWM7QUFDckIsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxXQUFXO0FBRXBCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxTQUFTLFFBQVEsY0FBYyx1QkFBdUI7QUFDL0QsU0FBUyxrQkFBa0IsdUJBQXVCO0FBQ2xELFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLGdCQUFnQiwwQkFBMEI7QUFDbkQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsT0FBTyxhQUFhO0FBQ3BCLFNBQVMsYUFBYSw4QkFBOEI7QUFDcEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQ0FBa0M7QUFFM0MsU0FBUyx3QkFBd0IsNkJBQTZCO0FBQzlELFNBQVMsaUJBQXlDLDRCQUE2RSx5QkFBeUIsaUJBQWlCO0FBQ3pLLFNBQVMsaUJBQWlCLDRDQUE0QztBQUN0RSxTQUFTLDJDQUF5RTtBQUNsRixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLCtCQUEr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
